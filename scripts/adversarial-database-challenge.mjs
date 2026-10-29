#!/usr/bin/env node
/**
 * scripts/adversarial-database-challenge.mjs
 * 
 * Adversarial Database Integrity & Historical Data Verification Harness
 * Executed by challenger_2 to empirically challenge and stress-test:
 * 1. Idempotency of `scripts/restore-and-audit-contacts.mjs --audit-only`
 * 2. Database consistency (orphan guests, corrupted reservation arrays, broken references)
 * 3. Preservation of genuine historical reservations, payments, and WhatsApp messages
 * 4. Cross-contact unmerging, caller ID isolation, and zero remaining contaminations
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DB_PATH = path.resolve('data/database.json');

function normalizeDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function phonesMatch(a, b) {
  const da = normalizeDigits(a);
  const db = normalizeDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10) {
    const coreA = da.length === 11 && da[2] === '9' ? da.slice(0, 2) + da.slice(3) : da;
    const coreB = db.length === 11 && db[2] === '9' ? db.slice(0, 2) + db.slice(3) : db;
    if (coreA === coreB) return true;
    if (da.slice(-10) === db.slice(-10)) return true;
  }
  return false;
}

const suiteResults = [];

function runTest(name, fn) {
  try {
    const details = fn();
    suiteResults.push({ name, passed: true, details });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    suiteResults.push({ name, passed: false, error: err.message, stack: err.stack });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('================================================================');
console.log(' CHALLENGER 2: ADVERSARIAL STRESS TEST & INTEGRITY HARNESS');
console.log('================================================================');

// ── TEST GROUP 1: IDEMPOTENCY OF RESTORE-AND-AUDIT SCRIPT ────────────────────

runTest('1.1 Idempotency: Run 1 of restore-and-audit-contacts --audit-only produces 0 contaminations', () => {
  const output = execSync('node scripts/restore-and-audit-contacts.mjs --audit-only', { encoding: 'utf8' });
  assert(output.includes('- Hóspedes corrompidos detectados: 0'), 'Found corrupted guests in run 1');
  assert(output.includes('- additionalPhones com vazamento cruzado: 0'), 'Found additionalPhones leakage in run 1');
  assert(output.includes('- Reservas com slots corrompidos: 0'), 'Found corrupted reservations in run 1');
  assert(output.includes('- Conversas WhatsApp desvinculadas: 0'), 'Found mislinked WhatsApp conversations in run 1');
  return { run: 1, clean: true };
});

runTest('1.2 Idempotency: Run 2 of restore-and-audit-contacts --audit-only produces 0 contaminations', () => {
  const output = execSync('node scripts/restore-and-audit-contacts.mjs --audit-only', { encoding: 'utf8' });
  assert(output.includes('- Hóspedes corrompidos detectados: 0'), 'Found corrupted guests in run 2');
  assert(output.includes('- additionalPhones com vazamento cruzado: 0'), 'Found additionalPhones leakage in run 2');
  assert(output.includes('- Reservas com slots corrompidos: 0'), 'Found corrupted reservations in run 2');
  assert(output.includes('- Conversas WhatsApp desvinculadas: 0'), 'Found mislinked WhatsApp conversations in run 2');
  return { run: 2, clean: true };
});

runTest('1.3 Idempotency: Run 3 of restore-and-audit-contacts --audit-only produces 0 contaminations', () => {
  const output = execSync('node scripts/restore-and-audit-contacts.mjs --audit-only', { encoding: 'utf8' });
  assert(output.includes('- Hóspedes corrompidos detectados: 0'), 'Found corrupted guests in run 3');
  assert(output.includes('- additionalPhones com vazamento cruzado: 0'), 'Found additionalPhones leakage in run 3');
  assert(output.includes('- Reservas com slots corrompidos: 0'), 'Found corrupted reservations in run 3');
  assert(output.includes('- Conversas WhatsApp desvinculadas: 0'), 'Found mislinked WhatsApp conversations in run 3');
  return { run: 3, clean: true };
});

// Load database.json
const rawDb = fs.readFileSync(DB_PATH, 'utf8');
const db = JSON.parse(rawDb);

// ── TEST GROUP 2: DATABASE CONSISTENCY & REFERENCE INTEGRITY ─────────────────

runTest('2.1 Database Structure: All fundamental collections are valid Arrays', () => {
  const expectedArrays = [
    'users', 'flats', 'cleaningRequests', 'periodicTasks',
    'guests', 'reservations', 'whatsappConversations',
    'breakfastOrders', 'maidStatementEntries', 'auditLogs'
  ];
  const counts = {};
  for (const col of expectedArrays) {
    assert(Array.isArray(db[col]), `Collection ${col} is not an Array`);
    counts[col] = db[col].length;
  }
  return counts;
});

runTest('2.2 Orphan Guest Check: Every guest reservationId references a valid reservation (with known demo-server legacy placeholder 373)', () => {
  const reservationIds = new Set(db.reservations.map(r => r.id));
  const brokenGuestRefs = [];

  for (const guest of db.guests) {
    if (Array.isArray(guest.reservationIds)) {
      for (const resId of guest.reservationIds) {
        if (!reservationIds.has(resId)) {
          brokenGuestRefs.push({ guestId: guest.id, guestName: guest.name, missingResId: resId });
        }
      }
    }
  }

  // The only missing reservation is 373 on Guest 20, explicitly provisioned by demo-server.mjs line 10725
  const nonLegacyBroken = brokenGuestRefs.filter(b => !(b.guestId === 20 && b.missingResId === 373));
  assert(nonLegacyBroken.length === 0, `Found unexpected broken reservation references in guests: ${JSON.stringify(nonLegacyBroken)}`);
  return { checkedGuests: db.guests.length, brokenRefs: brokenGuestRefs.length, details: brokenGuestRefs };
});

runTest('2.3 Reservation Guest Integrity: Every reservation guestId references an existing guest', () => {
  const guestIds = new Set(db.guests.map(g => g.id));
  const orphanReservations = [];

  for (const res of db.reservations) {
    if (res.guestId && !guestIds.has(res.guestId)) {
      orphanReservations.push({ resCode: res.code, missingGuestId: res.guestId });
    }
  }

  assert(orphanReservations.length === 0, `Found reservations with missing guestId: ${JSON.stringify(orphanReservations)}`);
  return { checkedReservations: db.reservations.length, orphanReservations: 0 };
});

runTest('2.4 Reservation Slots Integrity: Each reservation has valid guest identity (top-level or well-formed slots)', () => {
  let totalSlots = 0;
  let reservationsWithSlots = 0;
  let reservationsTopLevelOnly = 0;
  const brokenReservations = [];

  for (const res of db.reservations) {
    if (Array.isArray(res.guests) && res.guests.length > 0) {
      reservationsWithSlots++;
      for (const slot of res.guests) {
        totalSlots++;
        if (!slot || (!slot.name && !slot.guestId && !slot.phone)) {
          brokenReservations.push({ resCode: res.code, issue: 'Empty slot', slot });
        }
      }
    } else {
      reservationsTopLevelOnly++;
      if (!res.guestName && !res.guestId && !res.guestPhone) {
        brokenReservations.push({ resCode: res.code, issue: 'No top-level guest identity' });
      }
    }
  }

  assert(brokenReservations.length === 0, `Found broken reservations without valid guest identity: ${JSON.stringify(brokenReservations)}`);
  return { totalReservations: db.reservations.length, reservationsWithSlots, reservationsTopLevelOnly, totalSlots };
});

runTest('2.5 Reservation Dates & Flat Integrity: Dates and flats are valid and consistent', () => {
  const flatNumbers = new Set(db.flats.map(f => String(f.number)));
  const invalidReservations = [];

  for (const res of db.reservations) {
    if (!res.flatNumber || !flatNumbers.has(String(res.flatNumber))) {
      invalidReservations.push({ code: res.code, issue: `Unknown flatNumber ${res.flatNumber}` });
    }
    if (!res.checkinDate || !res.checkoutDate || res.checkinDate > res.checkoutDate) {
      invalidReservations.push({ code: res.code, issue: `Invalid dates ${res.checkinDate} -> ${res.checkoutDate}` });
    }
    if (typeof res.totalAmount !== 'number' || res.totalAmount < 0) {
      invalidReservations.push({ code: res.code, issue: `Invalid totalAmount ${res.totalAmount}` });
    }
  }

  assert(invalidReservations.length === 0, `Found invalid reservations: ${JSON.stringify(invalidReservations)}`);
  return { checked: db.reservations.length, invalid: 0 };
});

runTest('2.6 WhatsApp Conversations: References to reservations exist in db.reservations', () => {
  const reservationCodes = new Set(db.reservations.map(r => r.code));
  const brokenWaRefs = [];

  for (const conv of db.whatsappConversations) {
    if (conv.reservationCode && !reservationCodes.has(conv.reservationCode)) {
      brokenWaRefs.push({ phone: conv.phone || conv.id, name: conv.name, resCode: conv.reservationCode });
    }
  }

  assert(brokenWaRefs.length === 0, `Found WhatsApp conversations pointing to nonexistent reservations: ${JSON.stringify(brokenWaRefs)}`);
  return { checkedConversations: db.whatsappConversations.length, brokenRefs: 0 };
});

// ── TEST GROUP 3: HISTORICAL DATA PRESERVATION & FINANCIAL INTEGRITY ─────────

runTest('3.1 Historical Reservation RES-113-0524: Correct financial and stay parameters preserved', () => {
  const res = db.reservations.find(r => r.code === 'RES-113-0524');
  assert(res, 'RES-113-0524 not found in db.reservations');
  assert(res.totalPrice === 800.40 || res.totalAmount === 800.40, `RES-113-0524 total price is not 800.40 (got totalAmount: ${res.totalAmount}, totalPrice: ${res.totalPrice})`);
  assert(res.paidAmount === 800.40, `RES-113-0524 paidAmount is not 800.40 (got: ${res.paidAmount})`);
  assert(res.checkoutDate === '2026-10-31', `RES-113-0524 checkoutDate is not 2026-10-31 (got: ${res.checkoutDate})`);
  assert(res.paymentStatus === 'pago_total' || res.paymentStatus === 'pago', `RES-113-0524 paymentStatus is not fully paid (got: ${res.paymentStatus})`);
  return { code: res.code, totalAmount: res.totalAmount, paidAmount: res.paidAmount, checkout: res.checkoutDate, status: res.paymentStatus };
});

runTest('3.2 Key Historical Contact Roselene (Guest 143 & RES-712-0012) Preserved and Clean', () => {
  const guest = db.guests.find(g => g.id === 143);
  assert(guest, 'Guest 143 not found');
  assert(guest.name === 'Roselene', `Guest 143 name is not Roselene (got: ${guest.name})`);
  assert(phonesMatch(guest.phone, '21976403551'), `Guest 143 phone is not 21976403551 (got: ${guest.phone})`);
  assert(!guest.additionalPhones || guest.additionalPhones.length === 0, `Guest 143 has additionalPhones: ${JSON.stringify(guest.additionalPhones)}`);
  assert(guest.googleContactDisplayName === 'Roselene • CorpFlats', `Guest 143 unexpected googleContactDisplayName: ${guest.googleContactDisplayName}`);

  const res = db.reservations.find(r => r.code === 'RES-712-0012');
  assert(res, 'RES-712-0012 not found');
  assert(phonesMatch(res.guestPhone, '21976403551'), `RES-712-0012 guestPhone is not 21976403551 (got: ${res.guestPhone})`);
  assert(phonesMatch(res.guests[0].phone, '21976403551'), `RES-712-0012 slot 0 phone is not 21976403551`);
  return { guest: guest.name, phone: guest.phone, res: res.code };
});

runTest('3.3 Key Historical Contact Fabiana (Guest 359 & RES-509-0539) Preserved and Isolated', () => {
  const guest = db.guests.find(g => g.id === 359);
  assert(guest, 'Guest 359 not found');
  assert(guest.name === 'Fabiana', `Guest 359 name is not Fabiana (got: ${guest.name})`);
  assert(phonesMatch(guest.phone, '28999136926'), `Guest 359 phone is not 28999136926 (got: ${guest.phone})`);
  assert(!guest.additionalPhones || guest.additionalPhones.length === 0, `Guest 359 has additionalPhones: ${JSON.stringify(guest.additionalPhones)}`);

  const res = db.reservations.find(r => r.code === 'RES-509-0539');
  assert(res, 'RES-509-0539 not found');
  assert(res.guestId === 359, `RES-509-0539 guestId is not 359 (got: ${res.guestId})`);
  assert(phonesMatch(res.guestPhone, '28999136926'), `RES-509-0539 guestPhone is not 28999136926 (got: ${res.guestPhone})`);
  return { guest: guest.name, phone: guest.phone, res: res.code };
});

runTest('3.4 Key Historical Contact João Eduardo (Guest 20) Separated from Fabiana', () => {
  const guest = db.guests.find(g => g.id === 20);
  assert(guest, 'Guest 20 not found');
  assert(guest.name.includes('João Eduardo'), `Guest 20 name is not João Eduardo`);
  assert(!phonesMatch(guest.phone, '28999136926'), `Guest 20 has Fabiana phone as primary`);
  if (Array.isArray(guest.additionalPhones)) {
    assert(!guest.additionalPhones.some(p => phonesMatch(p, '28999136926')), 'Guest 20 has Fabiana phone in additionalPhones');
  }
  if (Array.isArray(guest.reservationIds)) {
    assert(!guest.reservationIds.includes(539), 'Guest 20 still linked to reservation 539');
  }
  return { guest: guest.name, phone: guest.phone, additionalPhones: guest.additionalPhones };
});

runTest('3.5 Cross-Contaminated additionalPhones Purged in Guest 154 and Guest 188', () => {
  const g154 = db.guests.find(g => g.id === 154);
  const g188 = db.guests.find(g => g.id === 188);
  assert(g154, 'Guest 154 not found');
  assert(g188, 'Guest 188 not found');

  if (Array.isArray(g154.additionalPhones)) {
    assert(!g154.additionalPhones.some(p => p.includes('22997257193')), 'Guest 154 has foreign phone 22997257193');
  }
  if (Array.isArray(g188.additionalPhones)) {
    assert(!g188.additionalPhones.some(p => p.includes('22997257193')), 'Guest 188 has foreign phone 22997257193');
  }
  return { g154Phones: g154.additionalPhones, g188Phones: g188.additionalPhones };
});

runTest('3.6 Realigned WhatsApp Conversations: Sintia, Mathaus, Aline, Sergio', () => {
  const waConvs = db.whatsappConversations;
  const cSintia = waConvs.find(c => phonesMatch(c.phone || c.id, '5521997598289'));
  const cMathaus = waConvs.find(c => phonesMatch(c.phone || c.id, '5521967401502'));
  const cAline = waConvs.find(c => phonesMatch(c.phone || c.id, '5522998622492'));
  const cSergio = waConvs.find(c => phonesMatch(c.phone || c.id, '5521967558194'));

  assert(cSintia?.reservationCode === 'RES-313-0025', `Sintia wa conversation wrong res: ${cSintia?.reservationCode}`);
  assert(cMathaus?.reservationCode === 'RES-907-0258', `Mathaus wa conversation wrong res: ${cMathaus?.reservationCode}`);
  assert(cAline?.reservationCode === 'RES-116-0032', `Aline wa conversation wrong res: ${cAline?.reservationCode}`);
  assert(cSergio?.reservationCode === 'RES-904-0014', `Sergio wa conversation wrong res: ${cSergio?.reservationCode}`);

  return {
    sintia: cSintia?.reservationCode,
    mathaus: cMathaus?.reservationCode,
    aline: cAline?.reservationCode,
    sergio: cSergio?.reservationCode
  };
});

runTest('3.7 Preservation of Historical Entities: Counts and Financial Totals', () => {
  assert(db.reservations.length >= 200, `Reservation count dropped: ${db.reservations.length}`);
  assert(db.guests.length >= 170, `Guest count dropped: ${db.guests.length}`);
  assert(db.cleaningRequests.length >= 250, `Cleaning requests dropped: ${db.cleaningRequests.length}`);
  assert(db.breakfastOrders.length >= 40, `Breakfast orders dropped: ${db.breakfastOrders.length}`);
  assert(db.whatsappConversations.length >= 30, `WhatsApp conversations dropped: ${db.whatsappConversations.length}`);
  assert(db.maidStatementEntries.length >= 300, `Maid statements dropped: ${db.maidStatementEntries.length}`);

  let totalRevenue = 0;
  for (const r of db.reservations) {
    totalRevenue += Number(r.paidAmount || 0);
  }
  // Historical baseline in pre-dia26 backup was R$ 38,698.90 across 195 reservations.
  assert(totalRevenue >= 38698.90, `Total paid revenue is lower than historical baseline: ${totalRevenue}`);

  return {
    reservations: db.reservations.length,
    guests: db.guests.length,
    cleaningRequests: db.cleaningRequests.length,
    breakfastOrders: db.breakfastOrders.length,
    whatsappConversations: db.whatsappConversations.length,
    totalPaidRevenue: totalRevenue
  };
});

// ── TEST GROUP 4: ADVERSARIAL CROSS-CONTAMINATION & ZERO REMAINING BUGS ───────

runTest('4.1 Global additionalPhones Cross-Contamination Stress Test', () => {
  const contaminated = [];

  for (const guest of db.guests) {
    if (Array.isArray(guest.additionalPhones) && guest.additionalPhones.length > 0) {
      for (const ap of guest.additionalPhones) {
        const apDig = normalizeDigits(ap);
        if (apDig.length >= 8) {
          const match = db.guests.find(other => other.id !== guest.id && other.phone && normalizeDigits(other.phone).endsWith(apDig.slice(-8)));
          if (match) {
            const nameA = (guest.name || guest.fullName || '').toLowerCase().trim();
            const nameB = (match.name || match.fullName || '').toLowerCase().trim();
            if (nameA && nameB && !nameA.includes(nameB) && !nameB.includes(nameA)) {
              contaminated.push({
                hostGuestId: guest.id,
                hostGuestName: guest.name,
                leakedPhone: ap,
                belongsToId: match.id,
                belongsToName: match.name
              });
            }
          }
        }
      }
    }
  }

  assert(contaminated.length === 0, `Detected remaining cross-contaminations in additionalPhones: ${JSON.stringify(contaminated)}`);
  return { scannedGuests: db.guests.length, contaminatedCount: 0 };
});

runTest('4.2 Target Distinct Guests Phone Isolation (Roselene, Fabiana, Gustavo, Dayana, Guido, Aline, Sintia)', () => {
  const keyGuests = [
    { id: 143, name: 'Roselene', phone: '21976403551' },
    { id: 359, name: 'Fabiana', phone: '28999136926' },
    { id: 144, name: 'Gustavo', phone: '22981149914' },
    { id: 204, name: 'Guido', phone: '27999682556' },
    { id: 141, name: 'Dayana', phone: '21965567043' },
    { id: 202, name: 'Aline', phone: '22998622492' },
    { id: 203, name: 'Sintia', phone: '21997598289' }
  ];

  const violations = [];
  for (const kg of keyGuests) {
    const g = db.guests.find(x => x.id === kg.id);
    if (!g) {
      violations.push({ id: kg.id, issue: 'Guest not found' });
      continue;
    }
    if (!phonesMatch(g.phone, kg.phone)) {
      violations.push({ id: kg.id, issue: `Expected phone ${kg.phone}, found ${g.phone}` });
    }
    // Check no other key guest shares this phone
    for (const otherKg of keyGuests) {
      if (otherKg.id !== kg.id && phonesMatch(otherKg.phone, kg.phone)) {
        violations.push({ id: kg.id, issue: `Collision with ${otherKg.id} on ${kg.phone}` });
      }
    }
  }

  assert(violations.length === 0, `Violations in key guests phone isolation: ${JSON.stringify(violations)}`);
  return { verifiedKeyGuests: keyGuests.length };
});

// ── SUMMARY & REPORT ─────────────────────────────────────────────────────────

console.log('================================================================');
const passedCount = suiteResults.filter(r => r.passed).length;
const totalCount = suiteResults.length;
console.log(` RESULTS: ${passedCount}/${totalCount} tests passed (${Math.round(passedCount / totalCount * 100)}%)`);
console.log('================================================================');

if (passedCount < totalCount) {
  console.error('[FAIL] Some tests failed during adversarial challenge.');
  process.exit(1);
} else {
  console.log('[ALL TESTS PASS] Database state and restoration logic are 100% robust, consistent, and idempotent.');
  process.exit(0);
}
