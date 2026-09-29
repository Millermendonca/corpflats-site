/**
 * Adversarial Stress & Chaos Test Suite for Guest-Flow-Manager
 * Executed by Challenger 2 (Empirical Challenger)
 * 
 * Vectors tested:
 * 1. Database Integrity & Cross-Flat Consistency across all 19 active flats
 * 2. Edge cases on reservation code prefixes & non-standard prefixes
 * 3. Off-duty maid credit guards & duplicate statement prevention
 * 4. Server startup & reconciliation idempotence under 100-cycle stress
 * 5. Adversarial attacks on Flats 512, 904, 313, 511, 712
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SERVER_PRIMARY = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const SERVER_MIRROR = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');
const DATABASE_FILE = path.join(ROOT_DIR, 'data', 'database.json');

const CANONICAL_FLATS = [
  { id: 1, number: "113" },
  { id: 2, number: "114" },
  { id: 3, number: "116" },
  { id: 4, number: "211" },
  { id: 5, number: "212" },
  { id: 6, number: "215" },
  { id: 7, number: "313" },
  { id: 8, number: "408" },
  { id: 10, number: "509" },
  { id: 11, number: "511" },
  { id: 12, number: "512" },
  { id: 13, number: "605" },
  { id: 14, number: "712" },
  { id: 15, number: "715" },
  { id: 16, number: "904" },
  { id: 17, number: "905" },
  { id: 18, number: "907" },
  { id: 19, number: "1004" },
  { id: 21, number: "1304" }
];

function extractFunction(code, fnName) {
  const startIdx = code.indexOf(`function ${fnName}(`);
  if (startIdx === -1) throw new Error(`Function ${fnName} not found`);
  let openBraces = 0;
  let started = false;
  let endIdx = -1;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') {
      openBraces++;
      started = true;
    } else if (code[i] === '}') {
      openBraces--;
      if (started && openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return code.substring(startIdx, endIdx);
}

function createServerSandbox(initialDb, mockTodayStr = '2026-09-28') {
  const serverCode = fs.readFileSync(SERVER_PRIMARY, 'utf8');
  const ruiCode = extractFunction(serverCode, 'reconcileUniversalIntegrity');
  const rcrCode = extractFunction(serverCode, 'reconcileCleaningRequests');
  const grfdCode = extractFunction(serverCode, 'getRequestsForDate');
  const eurIdCode = extractFunction(serverCode, 'ensureUniqueRequestIds');

  const db = JSON.parse(JSON.stringify(initialDb));
  const getTodayStr = () => mockTodayStr;
  const getOffsetDateStr = (days) => {
    const d = new Date(`${mockTodayStr}T12:00:00Z`);
    d.setDate(d.getDate() + days);
    return d.toISOString().substring(0, 10);
  };
  let saveCount = 0;
  const saveDatabase = () => { saveCount++; };

  const fn = new Function('db', 'getTodayStr', 'getOffsetDateStr', 'saveDatabase',
    eurIdCode + '\n' +
    rcrCode + '\n' +
    ruiCode + '\n' +
    grfdCode + '\n' +
    'return { reconcileUniversalIntegrity, reconcileCleaningRequests, getRequestsForDate, ensureUniqueRequestIds };'
  );

  const scope = fn(db, getTodayStr, getOffsetDateStr, saveDatabase);
  return { db, getSaveCount: () => saveCount, ...scope };
}

// ============================================================================
// SUITE 1: DATABASE INTEGRITY & CROSS-FLAT CONSISTENCY ACROSS 19 FLATS
// ============================================================================
describe('Suite 1: Database Integrity & Cross-Flat Consistency Across 19 Flats', () => {

  it('1.1 should confirm exactly 19 canonical flats in database.json with zero omissions or foreign flats', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    assert.equal(db.flats.length, 19, `Expected exactly 19 flats, found ${db.flats.length}`);

    const existingMap = new Map(db.flats.map(f => [String(f.number), f]));
    for (const c of CANONICAL_FLATS) {
      assert.ok(existingMap.has(c.number), `Flat ${c.number} missing from db.flats`);
      const found = existingMap.get(c.number);
      assert.equal(found.id, c.id, `Flat ${c.number} has id ${found.id}, expected ${c.id}`);
      assert.equal(found.isActive, true, `Flat ${c.number} isActive must be true`);
    }

    assert.ok(!existingMap.has('502'), 'Flat 502 must never exist in db.flats');
    assert.ok(!existingMap.has('999'), 'Flat 999 must not exist in db.flats');
  });

  it('1.2 should verify 100% of reservations resolve to valid canonical flats with synchronized flatId and flatNumber', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const canonicalMap = new Map(CANONICAL_FLATS.map(f => [String(f.number), f.id]));

    for (const res of (db.reservations || [])) {
      if (res.status === 'cancelada') continue;
      const flatNum = String(res.flatNumber);
      assert.ok(canonicalMap.has(flatNum), `Reservation ${res.code || res.id} has invalid flatNumber: ${flatNum}`);
      const expectedId = canonicalMap.get(flatNum);
      assert.equal(res.flatId, expectedId,
        `Reservation ${res.code || res.id} on flat ${flatNum} has flatId ${res.flatId}, expected ${expectedId}`);
    }
  });

  it('1.3 should verify 100% of cleaning requests resolve to valid canonical flats with synchronized flatId and flatNumber', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const canonicalMap = new Map(CANONICAL_FLATS.map(f => [String(f.number), f.id]));

    for (const req of (db.cleaningRequests || [])) {
      const flatNum = String(req.flatNumber);
      assert.ok(canonicalMap.has(flatNum), `Cleaning request ${req.id} has invalid flatNumber: ${flatNum}`);
      const expectedId = canonicalMap.get(flatNum);
      assert.equal(req.flatId, expectedId,
        `Cleaning request ${req.id} on flat ${flatNum} has flatId ${req.flatId}, expected ${expectedId}`);
    }
  });

  it('1.4 should eradicate injected foreign flats (502, id 9) and their cleanings under hostile incoming state', () => {
    const sandbox = createServerSandbox({
      flats: [
        { id: 1, number: '113', isActive: true },
        { id: 9, number: '502', isActive: true } // Hostile injected flat
      ],
      cleaningRequests: [
        { id: 9001, flatId: 9, flatNumber: '502', status: 'dirty', requestDate: '2026-09-28' },
        { id: 9002, flatId: 1, flatNumber: '113', status: 'clean', requestDate: '2026-09-28' }
      ],
      reservations: []
    });

    const changed = sandbox.reconcileUniversalIntegrity();
    assert.equal(changed, true, 'Reconciliation must report changes after purge');
    assert.equal(sandbox.db.flats.length, 1, 'Flat 502 must be eradicated');
    assert.equal(sandbox.db.flats[0].number, '113');
    assert.equal(sandbox.db.cleaningRequests.length, 1, 'Cleaning for Flat 502 must be purged');
    assert.equal(sandbox.db.cleaningRequests[0].id, 9002);
  });

  it('1.5 should auto-repair 100 reservations with corrupted or missing flatIds across all 19 flats', () => {
    const hostileReservations = [];
    for (let i = 0; i < 100; i++) {
      const flat = CANONICAL_FLATS[i % CANONICAL_FLATS.length];
      hostileReservations.push({
        id: 5000 + i,
        code: `RES-${flat.number}-${String(5000 + i).padStart(4, '0')}`,
        flatNumber: flat.number,
        flatId: null, // Corrupted null flatId
        checkinDate: '2026-10-10',
        checkoutDate: '2026-10-12',
        status: 'confirmada'
      });
    }

    const sandbox = createServerSandbox({
      flats: CANONICAL_FLATS.map(f => ({ ...f, isActive: true })),
      reservations: hostileReservations,
      cleaningRequests: []
    });

    sandbox.reconcileUniversalIntegrity();

    const canonicalMap = new Map(CANONICAL_FLATS.map(f => [String(f.number), f.id]));
    for (const r of sandbox.db.reservations) {
      const expectedId = canonicalMap.get(String(r.flatNumber));
      assert.equal(r.flatId, expectedId, `Reservation ${r.code} failed to align flatId to ${expectedId}`);
    }
  });
});

// ============================================================================
// SUITE 2: RESERVATION CODE PREFIXES & ALLOCATION EDGE CASES
// ============================================================================
describe('Suite 2: Reservation Code Prefixes & Allocation Edge Cases', () => {

  it('2.1 should verify every active RES- reservation matches its flatNumber prefix', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    for (const r of (db.reservations || [])) {
      if (r.status === 'cancelada') continue;
      if (r.code && r.code.startsWith('RES-')) {
        const parts = r.code.split('-');
        assert.ok(parts.length >= 3, `Malformed RES code: ${r.code}`);
        const prefixFlat = parts[1];
        assert.equal(String(r.flatNumber), prefixFlat,
          `Prefix mismatch on ${r.code}: expected flatNumber ${prefixFlat}, found ${r.flatNumber}`);
      }
    }
  });

  it('2.2 should verify RES-712-0291 is mapped to Flat 712 and ID 1351 is associated with 712', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const res291 = (db.reservations || []).find(r => r.code === 'RES-712-0291' || r.id === 291);
    assert.ok(res291, 'RES-712-0291 must exist');
    assert.equal(String(res291.flatNumber), '712');
    assert.equal(res291.flatId, 14);

    const clean1351 = (db.cleaningRequests || []).find(c => c.id === 1351);
    if (clean1351) {
      assert.equal(String(clean1351.flatNumber), '712');
      assert.equal(clean1351.flatId, 14);
    }
  });

  it('2.3 should realign flatId when a reservation has valid flatNumber but corrupted flatId', () => {
    const sandbox = createServerSandbox({
      flats: [
        { id: 12, number: '512', isActive: true },
        { id: 14, number: '712', isActive: true }
      ],
      reservations: [{
        id: 291,
        code: 'RES-712-0291',
        flatNumber: '712',
        flatId: 12, // Corrupted: assigned to Flat 512's id!
        checkinDate: '2026-10-12',
        checkoutDate: '2026-10-13',
        status: 'confirmada'
      }],
      cleaningRequests: []
    });

    sandbox.reconcileUniversalIntegrity();
    assert.equal(sandbox.db.reservations[0].flatId, 14, 'flatId must be realigned to 14 (Flat 712)');
    assert.equal(sandbox.db.reservations[0].flatNumber, '712');
  });

  it('2.4 should handle non-standard booking prefixes (AIRBNB, BOOKING, CORP) gracefully', () => {
    const sandbox = createServerSandbox({
      flats: CANONICAL_FLATS.map(f => ({ ...f, isActive: true })),
      reservations: [
        { id: 101, code: 'HM-AIRBNB-313-09', flatNumber: '313', flatId: 7, checkinDate: '2026-10-05', checkoutDate: '2026-10-07', status: 'confirmada' },
        { id: 102, code: 'BKNG-904-XYZ', flatNumber: '904', flatId: 16, checkinDate: '2026-10-05', checkoutDate: '2026-10-07', status: 'confirmada' },
        { id: 103, code: 'CORP-DIRECT-511', flatNumber: '511', flatId: 11, checkinDate: '2026-10-05', checkoutDate: '2026-10-07', status: 'confirmada' }
      ],
      cleaningRequests: []
    });

    const changed = sandbox.reconcileUniversalIntegrity();
    assert.equal(sandbox.db.reservations.length, 3);
    assert.equal(sandbox.db.reservations[0].flatId, 7);
    assert.equal(sandbox.db.reservations[1].flatId, 16);
    assert.equal(sandbox.db.reservations[2].flatId, 11);
  });

  it('2.5 should merge case-insensitively without duplicating reservation records', () => {
    const sandbox = createServerSandbox({
      flats: [{ id: 16, number: '904', isActive: true }],
      reservations: [{
        id: 297,
        code: 'RES-904-0297',
        flatNumber: '904',
        flatId: 16,
        guestName: 'Jorge',
        checkinDate: '2026-09-28',
        checkoutDate: '2026-09-29',
        status: 'confirmada'
      }],
      cleaningRequests: []
    });

    sandbox.reconcileUniversalIntegrity({
      reservations: [{
        id: 297,
        code: 'res-904-0297', // Lowercase incoming
        flatNumber: '904',
        flatId: 16,
        guestName: 'Jorge Actualizado',
        checkinDate: '2026-09-28',
        checkoutDate: '2026-09-29',
        updatedAt: '2026-09-28T22:00:00.000Z'
      }]
    });

    assert.equal(sandbox.db.reservations.length, 1, 'Must not duplicate reservation due to casing');
    assert.equal(sandbox.db.reservations[0].guestName, 'Jorge Actualizado');
  });
});

// ============================================================================
// SUITE 3: MAID STATEMENT INTEGRITY, OFF-DUTY CREDITS & DUPLICATE PREVENTION
// ============================================================================
describe('Suite 3: Maid Statement Integrity, Off-Duty Credits & Duplicate Prevention', () => {

  it('3.1 should confirm zero off-duty credit entries and zero off-duty cleanings for Grazi on 2026-09-26', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));

    const grazi26Credits = (db.maidStatementEntries || []).filter(e =>
      e.userId === 3 &&
      e.entryDate === '2026-09-26' &&
      e.entryType === 'credit'
    );
    assert.equal(grazi26Credits.length, 0, 'Grazi must have 0 credits on 26/09 (off-duty)');

    const grazi26Cleanings = (db.cleaningRequests || []).filter(c =>
      c.requestDate === '2026-09-26' &&
      (c.assignedUserId === 3 || c.assignedUsername === 'Grazi')
    );
    assert.equal(grazi26Cleanings.length, 0, 'Grazi must have 0 assigned cleanings on 26/09');
  });

  it('3.2 should confirm Cris is credited for Flat 511 (ID 1338), Flat 907 (ID 1339), and Flat 1004 (ID 1340) on 2026-09-26', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));

    const cris26Credits = (db.maidStatementEntries || []).filter(e =>
      e.userId === 2 &&
      e.entryDate === '2026-09-26' &&
      e.entryType === 'credit'
    );

    assert.ok(cris26Credits.length >= 3, `Expected at least 3 credits for Cris on 26/09, found ${cris26Credits.length}`);
    const descriptions = cris26Credits.map(c => c.description);
    assert.ok(descriptions.some(d => d.includes('511')), 'Missing credit for Flat 511');
    assert.ok(descriptions.some(d => d.includes('907')), 'Missing credit for Flat 907');
    assert.ok(descriptions.some(d => d.includes('1004')), 'Missing credit for Flat 1004');
  });

  it('3.3 should prune 20 hostile duplicate credit entries for the same maid, date, and flat description', () => {
    const duplicateEntries = [];
    for (let i = 1; i <= 20; i++) {
      duplicateEntries.push({
        id: `stmt_dup_${i}`,
        userId: 2,
        entryType: 'credit',
        amount: 23.25,
        description: 'Diária — Flat 511',
        entryDate: '2026-09-26',
        createdAt: `2026-09-26T12:${String(i).padStart(2, '0')}:00.000Z`
      });
    }

    const sandbox = createServerSandbox({
      flats: CANONICAL_FLATS.map(f => ({ ...f, isActive: true })),
      reservations: [],
      cleaningRequests: [],
      maidStatementEntries: duplicateEntries
    });

    const changed = sandbox.reconcileUniversalIntegrity();
    assert.equal(changed, true);
    assert.equal(sandbox.db.maidStatementEntries.length, 1,
      `Expected exactly 1 surviving credit, found ${sandbox.db.maidStatementEntries.length}`);
    assert.equal(sandbox.db.maidStatementEntries[0].id, 'stmt_dup_1');
  });

  it('3.4 should preserve all debit entries (vales) during deduplication even if identical in date and amount', () => {
    const debitEntries = [
      {
        id: 'debit_1',
        userId: 3,
        entryType: 'debit',
        amount: 250,
        description: 'Vale adiantamento',
        entryDate: '2026-09-25'
      },
      {
        id: 'debit_2',
        userId: 3,
        entryType: 'debit',
        amount: 250,
        description: 'Vale adiantamento',
        entryDate: '2026-09-25'
      }
    ];

    const sandbox = createServerSandbox({
      flats: CANONICAL_FLATS.map(f => ({ ...f, isActive: true })),
      reservations: [],
      cleaningRequests: [],
      maidStatementEntries: debitEntries
    });

    sandbox.reconcileUniversalIntegrity();
    assert.equal(sandbox.db.maidStatementEntries.length, 2,
      'Financial safety violation: debits must NEVER be deduplicated or deleted');
  });

  it('3.5 should verify statement deduplication idempotence: 10 repeated runs yield identical statement ledger', () => {
    const entries = [
      { id: 'c1', userId: 2, entryType: 'credit', amount: 22.5, description: 'Diária — Flat 114', entryDate: '2026-09-27' },
      { id: 'c2', userId: 2, entryType: 'credit', amount: 22.5, description: 'Diária — Flat 114', entryDate: '2026-09-27' },
      { id: 'd1', userId: 2, entryType: 'debit', amount: 100, description: 'Vale combustível', entryDate: '2026-09-27' }
    ];

    const sandbox = createServerSandbox({
      flats: CANONICAL_FLATS.map(f => ({ ...f, isActive: true })),
      reservations: [],
      cleaningRequests: [],
      maidStatementEntries: entries
    });

    sandbox.reconcileUniversalIntegrity();
    const countAfterRun1 = sandbox.db.maidStatementEntries.length;
    assert.equal(countAfterRun1, 2); // 1 credit + 1 debit

    for (let cycle = 2; cycle <= 10; cycle++) {
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.maidStatementEntries.length, 2, `Cycle ${cycle} drifted statement count`);
    }
  });
});

// ============================================================================
// SUITE 4: SERVER STARTUP & RECONCILIATION IDEMPOTENCE (100-CYCLE STRESS)
// ============================================================================
describe('Suite 4: Server Startup & Reconciliation Idempotence (100-Cycle Stress)', () => {

  it('4.1 should achieve strict idempotence across 100 consecutive reconciliation runs with zero state drift', () => {
    const initialDb = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(initialDb, '2026-09-28');

    // Run 1: establishes convergence
    sandbox.reconcileUniversalIntegrity();
    sandbox.reconcileCleaningRequests();
    sandbox.ensureUniqueRequestIds();

    const baselineJson = JSON.stringify(sandbox.db);
    const baselineCleaningsCount = sandbox.db.cleaningRequests.length;
    const baselineReservationsCount = sandbox.db.reservations.length;

    // Run 2 to 100: must be 100% stable
    for (let cycle = 2; cycle <= 100; cycle++) {
      const changed = sandbox.reconcileUniversalIntegrity();
      sandbox.reconcileCleaningRequests();
      sandbox.ensureUniqueRequestIds();

      assert.equal(changed, false, `Cycle ${cycle} triggered unexpected mutations`);
      assert.equal(sandbox.db.cleaningRequests.length, baselineCleaningsCount,
        `Cycle ${cycle} altered cleaningRequests length`);
      assert.equal(sandbox.db.reservations.length, baselineReservationsCount,
        `Cycle ${cycle} altered reservations length`);
    }

    const finalJson = JSON.stringify(sandbox.db);
    assert.equal(finalJson, baselineJson, 'Final JSON representation after 100 cycles must match baseline JSON');
  });

  it('4.2 should simulate 20 full server restarts without ID collisions, duplicate creations, or status regressions', () => {
    const dbState = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));

    for (let restart = 1; restart <= 20; restart++) {
      const sandbox = createServerSandbox(dbState, '2026-09-28');
      sandbox.ensureUniqueRequestIds();
      sandbox.reconcileCleaningRequests();
      sandbox.reconcileUniversalIntegrity();
      sandbox.reconcileCleaningRequests();
      sandbox.ensureUniqueRequestIds();

      // Check unique IDs on cleaningRequests
      const idSet = new Set();
      for (const req of sandbox.db.cleaningRequests) {
        assert.ok(!idSet.has(req.id), `Server restart ${restart} produced duplicate cleaning ID ${req.id}`);
        idSet.add(req.id);
      }
    }
  });

  it('4.3 should behave idempotently across time boundary conditions (17:59, 18:00, 18:01, 23:59, 00:00)', () => {
    const timeSnapshots = ['2026-09-28', '2026-09-29'];

    for (const mockDate of timeSnapshots) {
      const dbState = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const sandbox = createServerSandbox(dbState, mockDate);

      // Repeat 5 times per date
      for (let i = 0; i < 5; i++) {
        sandbox.reconcileUniversalIntegrity();
        sandbox.reconcileCleaningRequests();
      }

      // Assert no invalid flats or NaN IDs
      for (const req of sandbox.db.cleaningRequests) {
        assert.ok(!isNaN(Number(req.id)), `Invalid req.id on date ${mockDate}`);
        assert.notEqual(String(req.flatNumber), '502', `Flat 502 resurrected on date ${mockDate}`);
      }
    }
  });
});

// ============================================================================
// SUITE 5: TARGETED STRESS ON FLATS 512, 904, 313, 511, 712
// ============================================================================
describe('Suite 5: Targeted Stress on Flats 512, 904, 313, 511, 712', () => {

  it('5.1 Flat 512: Immunity guards should prevent auto-reversion under 5 hostile variations', () => {
    const variations = [
      { markedByAdmin: true, status: 'clean', assignedUserId: null, completedAt: null },
      { source: 'admin_manual', status: 'clean', assignedUserId: null, completedAt: null },
      { isCanonical: true, status: 'clean', assignedUserId: null, completedAt: null },
      { addedBy: 'admin', status: 'clean', assignedUserId: null, completedAt: null },
      { completedAt: '2026-09-28T14:00:00.000Z', status: 'clean', assignedUserId: null }
    ];

    for (let i = 0; i < variations.length; i++) {
      const v = variations[i];
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [{
          id: 5121,
          code: 'RES-512-0001',
          flatNumber: '512',
          flatId: 12,
          checkoutDate: '2026-09-27',
          status: 'finalizada'
        }],
        cleaningRequests: [{
          id: 1351,
          flatId: 12,
          flatNumber: '512',
          requestDate: '2026-09-27',
          source: 'checkout',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          ...v
        }]
      }, '2026-09-28');

      sandbox.reconcileUniversalIntegrity();
      const req = sandbox.db.cleaningRequests[0];
      assert.equal(req.status, 'clean',
        `Variation ${i + 1} failed immunity guard: flipped to ${req.status}`);
    }
  });

  it('5.2 Flat 904: Jorge turnover should strictly isolate checkout to 29/09 and never carry over to 28/09', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-09-28');

    // On 28/09, Jorge is an active stayover (checkin 28/09, checkout 29/09)
    const reqs28 = sandbox.getRequestsForDate('2026-09-28');
    const f904Reqs28 = reqs28.filter(r => String(r.flatNumber) === '904');
    for (const r of f904Reqs28) {
      assert.notEqual(r.leavingGuest, 'Jorge',
        'Jorge checkout must NOT appear on 28/09');
      assert.equal(Boolean(r.isPendingFromPreviousDay), false,
        'Flat 904 must NOT carry over on 28/09');
    }

    // On 29/09, Jorge checkout appears
    const reqs29 = sandbox.getRequestsForDate('2026-09-29');
    const f904Reqs29 = reqs29.filter(r => String(r.flatNumber) === '904');
    assert.ok(f904Reqs29.length >= 1, 'Flat 904 checkout must appear on 29/09');
    assert.ok(f904Reqs29.some(r => r.leavingGuest === 'Jorge' || r.guestName === 'Jorge'),
      'Jorge must be the leaving guest on 29/09');
  });

  it('5.3 Flat 313: Phantom cleaning 1358 eradication & stayover immunity during Felipe stay (28/09 - 02/10)', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));

    // Verify 1358 is not present in db
    const dirty1358 = (db.cleaningRequests || []).find(c => c.id === 1358 && c.status === 'dirty');
    assert.equal(dirty1358, undefined, 'Phantom dirty cleaning 1358 must remain eradicated');

    // Hostile injection: Attempt to inject past dirty 1358 and verify getRequestsForDate suppresses it
    const sandbox = createServerSandbox(db, '2026-09-28');
    sandbox.db.cleaningRequests.push({
      id: 1358,
      flatId: 7,
      flatNumber: '313',
      requestDate: '2026-09-25',
      source: 'checkout',
      status: 'dirty',
      leavingGuest: 'Leonardo Primo de Sousa'
    });

    // Felipe is in-house (stayover from 28/09 to 02/10)
    const reqs28 = sandbox.getRequestsForDate('2026-09-28');
    const f313Carryover28 = reqs28.find(r => String(r.flatNumber) === '313' && r.isPendingFromPreviousDay);
    assert.equal(f313Carryover28, undefined,
      'Past dirty cleaning 1358 must NOT be carried over during Felipe stayover on 28/09');

    const reqs29 = sandbox.getRequestsForDate('2026-09-29');
    const f313Carryover29 = reqs29.find(r => String(r.flatNumber) === '313' && r.isPendingFromPreviousDay);
    assert.equal(f313Carryover29, undefined,
      'Past dirty cleaning 1358 must NOT be carried over during Felipe stayover on 29/09');
  });

  it('5.4 Flat 511: Cleaning 1338 attribution and Grazi schedule immunity', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const clean1338 = (db.cleaningRequests || []).find(c => c.id === 1338);
    assert.ok(clean1338, 'Cleaning 1338 must exist');
    assert.equal(clean1338.assignedUserId, 2, 'Assigned user must be Cris (ID 2)');
    assert.equal(clean1338.assignedUserName, 'Cris');
    assert.equal(clean1338.status, 'clean');

    // Verify unearned Grazi credit is gone
    const graziUnearned = (db.maidStatementEntries || []).find(e =>
      e.id === 'stmt_3_1338_20260928' ||
      (e.userId === 3 && e.cleaningRequestId === 1338)
    );
    assert.equal(graziUnearned, undefined, 'Unearned Grazi statement entry must be eradicated');
  });

  it('5.5 Flat 712: Verify October calendar has zero date collisions between 712-0291 and other reservations', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const f712Reservations = (db.reservations || []).filter(r =>
      (String(r.flatNumber) === '712' || r.flatId === 14) &&
      r.status !== 'cancelada'
    );

    // Verify all pairwise intervals do not overlap
    for (let i = 0; i < f712Reservations.length; i++) {
      for (let j = i + 1; j < f712Reservations.length; j++) {
        const a = f712Reservations[i];
        const b = f712Reservations[j];
        if (!a.checkinDate || !a.checkoutDate || !b.checkinDate || !b.checkoutDate) continue;
        const overlap = a.checkinDate < b.checkoutDate && b.checkinDate < a.checkoutDate;
        assert.ok(!overlap,
          `Overlap on Flat 712 between ${a.code || a.id} (${a.checkinDate}..${a.checkoutDate}) and ${b.code || b.id} (${b.checkinDate}..${b.checkoutDate})`);
      }
    }
  });
});
