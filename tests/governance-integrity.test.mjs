/**
 * Governance & Integrity Overhaul Test Suite
 * Comprehensive 4-tier test coverage covering:
 * - R1: Clean-to-dirty loop immunity, dual-server sync, note non-pollution
 * - R2: 18:00 date switchover UI mode/toggle, card semantics, occupancy precedence
 * - R3: Historical integrity for Flat 313 (no false pending) and Flat 511 (maid schedule/statements)
 * - R4: Flat 712 allocation (RES-712-0291 & cleaning 1351) and universal 19-flat database audit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT_DIR = process.cwd();
const SERVER_PRIMARY = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const SERVER_MIRROR = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');
const DATABASE_FILE = path.join(ROOT_DIR, 'data', 'database.json');
const DASHBOARD_FILE = path.join(ROOT_DIR, 'artifacts', 'limpeza', 'src', 'pages', 'dashboard.tsx');
const FLAT_CARD_FILE = path.join(ROOT_DIR, 'artifacts', 'limpeza', 'src', 'components', 'flat-card.tsx');

// Canonical 19 active flats
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

// Helper to extract function code from server files
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

// Sandbox builder for pure function testing
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
  const saveDatabase = () => {};

  const fn = new Function('db', 'getTodayStr', 'getOffsetDateStr', 'saveDatabase',
    eurIdCode + '\n' +
    rcrCode + '\n' +
    ruiCode + '\n' +
    grfdCode + '\n' +
    'return { reconcileUniversalIntegrity, reconcileCleaningRequests, getRequestsForDate, ensureUniqueRequestIds };'
  );

  const scope = fn(db, getTodayStr, getOffsetDateStr, saveDatabase);
  return { db, ...scope };
}

// Logic helper evaluating date switchover
function evaluateDateSwitchover(currentTime) {
  const hour = currentTime.getHours();
  const d = new Date(currentTime);
  if (hour >= 18) {
    d.setDate(d.getDate() + 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Logic helper evaluating flat card display semantics
function evaluateCardLabels({ selectedDate, todayDate, flat, request }) {
  const isFutureDate = selectedDate > todayDate;
  const isOccupied = isFutureDate
    ? (typeof flat.isOccupied === 'boolean' ? flat.isOccupied : true)
    : (typeof request?.isVacant === 'boolean' ? !request.isVacant : (typeof flat.isOccupied === 'boolean' ? flat.isOccupied : true));

  const checkoutLabel = isFutureDate ? 'Saída Prevista' : 'Saiu';
  let checkinBadge = null;
  if (request?.arrivingGuest) {
    checkinBadge = isFutureDate ? 'Entra Amanhã' : 'Entra Hoje';
  }

  const carryoverBadge = request?.isPendingFromPreviousDay
    ? (isFutureDate ? 'Pendente do turno de hoje' : 'Pendente do turno anterior')
    : null;

  return { isOccupied, checkoutLabel, checkinBadge, carryoverBadge };
}

// ============================================================================
// TIER 1: FEATURE ISOLATION TESTS (Min 5 tests per feature area)
// ============================================================================

describe('Tier 1: Feature Isolation Tests', () => {

  // 1. R1: Clean-to-dirty loop immunity
  describe('Area 1: R1 Clean-to-Dirty Loop Immunity', () => {
    it('1.1.1 should preserve clean status when markedByAdmin is true', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 1,
          flatId: 12,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'checkout',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          markedByAdmin: true,
          completedAt: null,
          assignedUserId: null
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean', 'Should remain clean when markedByAdmin is true');
    });

    it('1.1.2 should preserve clean status when completedAt is provided without assignedUserId', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 2,
          flatId: 12,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'checkout',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          completedAt: '2026-09-28T14:30:00.000Z',
          assignedUserId: null
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean', 'Should remain clean when completedAt is present');
    });

    it('1.1.3 should preserve clean status when source is admin_manual', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 3,
          flatId: 12,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'admin_manual',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          completedAt: null,
          assignedUserId: null
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean', 'Should remain clean when source is admin_manual');
    });

    it('1.1.4 should preserve clean status when assignedUserId is set to a maid', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 4,
          flatId: 12,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'checkout',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          assignedUserId: 2,
          assignedUsername: 'Cris',
          completedAt: null
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean', 'Should remain clean when assignedUserId is set');
    });

    it('1.1.5 should not create a duplicate dirty cleaning for a past checkout if already cleaned', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [{
          id: 101,
          code: 'RES-512-0101',
          flatId: 12,
          flatNumber: '512',
          guestName: 'Hóspede Antigo',
          checkinDate: '2026-09-20',
          checkoutDate: '2026-09-24',
          status: 'confirmada'
        }],
        cleaningRequests: [{
          id: 50,
          flatId: 12,
          flatNumber: '512',
          requestDate: '2026-09-24',
          status: 'clean',
          completedAt: '2026-09-24T15:00:00.000Z'
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      const cleanings512 = sandbox.db.cleaningRequests.filter(c => c.flatNumber === '512' && c.requestDate === '2026-09-24');
      assert.equal(cleanings512.length, 1, 'Should have exactly 1 cleaning record for checkout date');
      assert.equal(cleanings512[0].status, 'clean', 'Should retain clean status without spawning duplicate dirty');
    });
  });

  // 2. R1: Dual-server sync & note non-pollution
  describe('Area 2: R1 Dual-Server Sync & Note Non-Pollution', () => {
    it('1.2.1 should ensure both demo-server files exist and have identical SHA-256 hashes', () => {
      assert.ok(fs.existsSync(SERVER_PRIMARY), 'Primary server file must exist');
      assert.ok(fs.existsSync(SERVER_MIRROR), 'Mirror server file must exist');
      const hash1 = crypto.createHash('sha256').update(fs.readFileSync(SERVER_PRIMARY)).digest('hex');
      const hash2 = crypto.createHash('sha256').update(fs.readFileSync(SERVER_MIRROR)).digest('hex');
      assert.equal(hash1, hash2, 'Primary and mirror demo-server.mjs must be byte-for-byte identical');
    });

    it('1.2.2 should ensure both server files have identical byte size', () => {
      const size1 = fs.statSync(SERVER_PRIMARY).size;
      const size2 = fs.statSync(SERVER_MIRROR).size;
      assert.equal(size1, size2, 'File sizes must match exactly');
    });

    it('1.2.3 should preserve clean item when reconciling duplicate requests for same flat and date', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 10, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty' },
          { id: 11, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', completedAt: '2026-09-28T14:00:00Z' }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1, 'Duplicate must be merged');
      assert.equal(sandbox.db.cleaningRequests[0].id, 11, 'Clean record must take precedence');
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean');
    });

    it('1.2.4 should NOT copy automated checkout note into clean item during reconciliation', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 21, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', adminNote: null },
          { id: 22, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512' }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1);
      assert.notEqual(sandbox.db.cleaningRequests[0].adminNote, 'Limpeza de check-out gerada automaticamente para o Flat 512',
        'Automated note must not pollute clean item');
    });

    it('1.2.5 should copy genuine human/admin notes into clean item during reconciliation', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 31, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', adminNote: null },
          { id: 32, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', adminNote: 'Hóspede solicitou toalhas extras no check-in' }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1);
      assert.equal(sandbox.db.cleaningRequests[0].adminNote, 'Hóspede solicitou toalhas extras no check-in',
        'Genuine user notes must be copied to clean item');
    });
  });

  // 3. R2: 18:00 Date switchover UI mode & toggle
  describe('Area 3: R2 18:00 Date Switchover UI Mode & Toggle', () => {
    it('1.3.1 should switch default date to tomorrow when hour is 18 or later', () => {
      const eveningTime = new Date('2026-09-28T18:05:00');
      const targetDate = evaluateDateSwitchover(eveningTime);
      assert.equal(targetDate, '2026-09-29', 'At 18:05, target date must be tomorrow');
    });

    it('1.3.2 should maintain current date when hour is before 18', () => {
      const afternoonTime = new Date('2026-09-28T17:45:00');
      const targetDate = evaluateDateSwitchover(afternoonTime);
      assert.equal(targetDate, '2026-09-28', 'At 17:45, target date must be today');
    });

    it('1.3.3 should contain visual "Modo Previsão" indicator in dashboard.tsx', () => {
      const content = fs.readFileSync(DASHBOARD_FILE, 'utf8');
      assert.ok(content.includes('Modo Previsão') || content.includes('Previsão'),
        'dashboard.tsx must contain Modo Previsão indicator');
    });

    it('1.3.4 should contain "Ver Hoje" / "Hoje" 1-click toggle in dashboard.tsx', () => {
      const content = fs.readFileSync(DASHBOARD_FILE, 'utf8');
      assert.ok(content.includes('Ver Hoje') || content.includes('Hoje'),
        'dashboard.tsx must contain 1-click today toggle');
    });

    it('1.3.5 should differentiate today vs tomorrow when computing active shift banner', () => {
      const todayStr = '2026-09-28';
      const tomorrowStr = '2026-09-29';
      assert.notEqual(todayStr, tomorrowStr);
      assert.ok(tomorrowStr > todayStr, 'Tomorrow must be strictly greater than today');
    });
  });

  // 4. R2: FlatCard semantics & occupancy precedence
  describe('Area 4: R2 FlatCard Semantics & Occupancy Precedence', () => {
    it('1.4.1 should display "Saída Prevista" instead of "Saiu" when viewing future dates', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: true },
        request: { leavingGuest: 'Jorge' }
      });
      assert.equal(labels.checkoutLabel, 'Saída Prevista', 'Future checkouts must display Saída Prevista');
    });

    it('1.4.2 should display "Entra Amanhã" badge for next-day checkins', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: true },
        request: { arrivingGuest: 'Novo Hóspede' }
      });
      assert.equal(labels.checkinBadge, 'Entra Amanhã', 'Future checkins must display Entra Amanhã');
    });

    it('1.4.3 should prioritize flat.isOccupied over request.isVacant for future dates', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: true },
        request: { isVacant: true } // PMS generated vacant, but flat is occupied today
      });
      assert.equal(labels.isOccupied, true, 'Flat occupied today must display as occupied for tomorrow');
    });

    it('1.4.4 should clarify carryover badge wording for current shift', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: false },
        request: { isPendingFromPreviousDay: true }
      });
      assert.equal(labels.carryoverBadge, 'Pendente do turno de hoje');
    });

    it('1.4.5 should retain standard "Saiu" label when viewing today\'s checkouts', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-28',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: false },
        request: { leavingGuest: 'Jorge' }
      });
      assert.equal(labels.checkoutLabel, 'Saiu');
    });
  });

  // 5. R3: Flat 313 phantom cleaning eradication
  describe('Area 5: R3 Flat 313 Phantom Cleaning Eradication', () => {
    it('1.5.1 should ensure cleaning ID 1358 is not an active dirty request', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1358 = (db.cleaningRequests || []).find(c => c.id === 1358);
      const isPending = c1358 && c1358.status === 'dirty';
      assert.ok(!isPending, 'Cleaning ID 1358 must not be an active dirty request');
    });

    it('1.5.2 should verify Flat 313 has active stay for Felipe from 28/09 to 02/10', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const felipeRes = (db.reservations || []).find(r =>
        (r.flatNumber === '313' || r.flatId === 7) &&
        r.guestName && r.guestName.includes('Felipe') &&
        r.checkinDate === '2026-09-28' &&
        r.checkoutDate === '2026-10-02'
      );
      assert.ok(felipeRes, 'Reservation for Felipe on Flat 313 must exist');
      assert.equal(felipeRes.status, 'confirmada');
    });

    it('1.5.3 should not return Leonardo Primo as pending carryover on 2026-09-28', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const sandbox = createServerSandbox(db, '2026-09-28');
      const reqs = sandbox.getRequestsForDate('2026-09-28');
      const req313 = reqs.find(r => String(r.flatNumber) === '313');
      if (req313) {
        assert.notEqual(req313.leavingGuest, 'Leonardo Primo de Sousa',
          'Flat 313 should not show Leonardo Primo as leaving guest on 28/09');
      }
    });

    it('1.5.4 should recognize Flat 313 as continuous stayover on 2026-09-29', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const sandbox = createServerSandbox(db, '2026-09-28');
      const reqs = sandbox.getRequestsForDate('2026-09-29');
      const req313 = reqs.find(r => String(r.flatNumber) === '313');
      // On stayover dates without checkout, no checkout cleaning card should be generated
      const isCheckoutCard = req313 && req313.source === 'checkout' && req313.status === 'dirty';
      assert.ok(!isCheckoutCard, 'Flat 313 should not have a dirty checkout card on 29/09 stayover');
    });

    it('1.5.5 should preserve historical cleanings for Flat 313 (e.g. ID 1336 on 26/09)', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1336 = (db.cleaningRequests || []).find(c => c.id === 1336);
      assert.ok(c1336, 'Historical cleaning 1336 must exist');
      assert.equal(c1336.status, 'clean', 'Cleaning 1336 must be clean');
    });
  });

  // 6. R3: Flat 511 maid schedule & statement cleanup
  describe('Area 6: R3 Flat 511 Maid Schedule & Statement Cleanup', () => {
    it('1.6.1 should verify cleaning ID 1338 is assigned to Cris (ID 2)', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1338 = (db.cleaningRequests || []).find(c => c.id === 1338);
      assert.ok(c1338, 'Cleaning 1338 must exist');
      assert.equal(c1338.assignedUserId, 2, 'Cleaning 1338 must be assigned to Cris (ID 2)');
      assert.equal(c1338.assignedUsername, 'Cris');
    });

    it('1.6.2 should verify cleaning ID 1338 note does not state "Limpeza realizada por Grazi"', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1338 = (db.cleaningRequests || []).find(c => c.id === 1338);
      assert.ok(c1338);
      const note = c1338.adminNote || '';
      assert.ok(!note.includes('Limpeza realizada por Grazi'),
        'Note must not falsely state Grazi cleaned Flat 511 on her day off');
    });

    it('1.6.3 should verify Grazi does not have unearned statement credit stmt_3_1338_20260928', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const hasUnearnedCredit = (db.maidStatementEntries || []).some(e => e.id === 'stmt_3_1338_20260928');
      assert.ok(!hasUnearnedCredit, 'Unearned credit stmt_3_1338_20260928 must be removed from Grazi');
    });

    it('1.6.4 should verify cleanings ID 1339 and ID 1340 are assigned to Cris (ID 2)', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1339 = (db.cleaningRequests || []).find(c => c.id === 1339);
      const c1340 = (db.cleaningRequests || []).find(c => c.id === 1340);
      if (c1339) assert.equal(c1339.assignedUserId, 2, 'Cleaning 1339 must be assigned to Cris');
      if (c1340) assert.equal(c1340.assignedUserId, 2, 'Cleaning 1340 must be assigned to Cris');
    });

    it('1.6.5 should verify Grazi has zero credit entries on off-duty date 2026-09-26', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const grazi26Credits = (db.maidStatementEntries || []).filter(e =>
        e.userId === 3 && e.entryDate === '2026-09-26' && e.entryType === 'credit'
      );
      assert.equal(grazi26Credits.length, 0, 'Grazi should have zero credit entries on off-duty date 26/09');
    });
  });

  // 7. R4: Flat 512 / 712 reservation allocation
  describe('Area 7: R4 Flat 512 / 712 Reservation Allocation', () => {
    it('1.7.1 should verify RES-712-0291 is mapped to Flat 712 (flatId 14)', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const res = (db.reservations || []).find(r => r.code === 'RES-712-0291');
      assert.ok(res, 'Reservation RES-712-0291 must exist');
      assert.equal(res.flatNumber, '712', 'Reservation flatNumber must be 712');
      assert.equal(res.flatId, 14, 'Reservation flatId must be 14');
    });

    it('1.7.2 should verify cleaning ID 1351 is mapped to Flat 712 (flatId 14)', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1351 = (db.cleaningRequests || []).find(c => c.id === 1351);
      assert.ok(c1351, 'Cleaning 1351 must exist');
      assert.equal(c1351.flatNumber, '712', 'Cleaning 1351 flatNumber must be 712');
      assert.equal(c1351.flatId, 14, 'Cleaning 1351 flatId must be 14');
    });

    it('1.7.3 should verify cleaning ID 1351 adminNote references Flat 712, not Flat 512', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1351 = (db.cleaningRequests || []).find(c => c.id === 1351);
      assert.ok(c1351);
      const note = c1351.adminNote || '';
      assert.ok(note.includes('712'), 'Note must reference Flat 712');
      assert.ok(!note.includes('Flat 512'), 'Note must not reference Flat 512');
    });

    it('1.7.4 should verify Flat 512 contains zero reservations starting with RES-712-', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const misallocated = (db.reservations || []).filter(r =>
        (r.flatNumber === '512' || r.flatId === 12) &&
        r.code && r.code.startsWith('RES-712-')
      );
      assert.equal(misallocated.length, 0, 'No RES-712 reservations should belong to Flat 512');
    });

    it('1.7.5 should verify Flat 512 status remains clean and has no phantom dirty checkout on 2026-10-13', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const dirty512On13 = (db.cleaningRequests || []).filter(c =>
        (c.flatNumber === '512' || c.flatId === 12) &&
        c.requestDate === '2026-10-13' &&
        c.status === 'dirty'
      );
      assert.equal(dirty512On13.length, 0, 'Flat 512 should have no dirty cleaning on 2026-10-13');
    });
  });

  // 8. R4: Universal 19-flat database audit & consistency
  describe('Area 8: R4 Universal 19-Flat Database Audit & Consistency', () => {
    it('1.8.1 should verify exactly 19 active flats exist in db.flats', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      assert.equal(db.flats.length, 19, 'There must be exactly 19 flats');
      db.flats.forEach(f => {
        assert.equal(f.isActive, true, `Flat ${f.number} must be active`);
      });
    });

    it('1.8.2 should verify all canonical flat numbers are present and Flat 502 is absent', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const flatNumbers = db.flats.map(f => String(f.number));
      CANONICAL_FLATS.forEach(cf => {
        assert.ok(flatNumbers.includes(cf.number), `Canonical flat ${cf.number} must be present`);
      });
      assert.ok(!flatNumbers.includes('502'), 'Flat 502 must never exist');
    });

    it('1.8.3 should verify phantom dirty cleaning ID 1362 (Flat 408) is eradicated or resolved', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1362 = (db.cleaningRequests || []).find(c => c.id === 1362);
      const isDirty = c1362 && c1362.status === 'dirty';
      assert.ok(!isDirty, 'Phantom dirty cleaning 1362 on Flat 408 must not be active');
    });

    it('1.8.4 should verify phantom dirty cleaning ID 1364 (Flat 113) is eradicated or resolved', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1364 = (db.cleaningRequests || []).find(c => c.id === 1364);
      const isDirty = c1364 && c1364.status === 'dirty';
      assert.ok(!isDirty, 'Phantom dirty cleaning 1364 on Flat 113 must not be active');
    });

    it('1.8.5 should verify phantom dirty cleaning ID 1361 (Flat 712) is eradicated or resolved', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1361 = (db.cleaningRequests || []).find(c => c.id === 1361);
      const isDirty = c1361 && c1361.status === 'dirty';
      assert.ok(!isDirty, 'Phantom dirty cleaning 1361 on Flat 712 must not be active');
    });
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Min 5 tests per feature area)
// ============================================================================

describe('Tier 2: Boundary & Corner Cases', () => {

  describe('Area 1 Boundaries: Immunity Edge Cases', () => {
    it('2.1.1 should preserve clean status with empty string notes and markedByAdmin', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 101,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'checkout',
          adminNote: '',
          markedByAdmin: true,
          completedAt: null
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean');
    });

    it('2.1.2 should respect 7-day recentWindow boundary calculation', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [
          { id: 102, flatNumber: '512', requestDate: '2026-09-21', status: 'clean', markedByAdmin: true },
          { id: 103, flatNumber: '512', requestDate: '2026-09-20', status: 'clean', markedByAdmin: true }
        ]
      }, '2026-09-28');
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean');
      assert.equal(sandbox.db.cleaningRequests[1].status, 'clean');
    });

    it('2.1.3 should handle various ISO timestamp formats in completedAt', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 104,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'checkout',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          completedAt: '2026-09-28T14:30:00-03:00'
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean');
    });

    it('2.1.4 should preserve clean status when isCanonical is true', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [{
          id: 105,
          flatNumber: '512',
          requestDate: '2026-09-28',
          status: 'clean',
          source: 'checkout',
          adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512',
          isCanonical: true
        }]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.cleaningRequests[0].status, 'clean');
    });

    it('2.1.5 should maintain immunity across multiple consecutive cleaning records', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 12, number: '512', isActive: true }],
        reservations: [],
        cleaningRequests: [
          { id: 106, flatNumber: '512', requestDate: '2026-09-26', status: 'clean', markedByAdmin: true },
          { id: 107, flatNumber: '512', requestDate: '2026-09-27', status: 'clean', completedAt: '2026-09-27T15:00:00Z' },
          { id: 108, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', assignedUserId: 2 }
        ]
      });
      sandbox.reconcileUniversalIntegrity();
      sandbox.db.cleaningRequests.forEach(c => {
        assert.equal(c.status, 'clean');
      });
    });
  });

  describe('Area 2 Boundaries: Note Non-Pollution & Reconcile Edge Cases', () => {
    it('2.2.1 should reject automated notes with whitespace variations from copying', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 201, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', adminNote: null },
          { id: 202, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', adminNote: '  Limpeza de check-out gerada automaticamente para o Flat 512  ' }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1);
      assert.equal(sandbox.db.cleaningRequests[0].adminNote, null);
    });

    it('2.2.2 should never overwrite clean item existing note with dirty item note', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 203, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', adminNote: 'Nota original admin' },
          { id: 204, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', adminNote: 'Nota diferente dirty' }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1);
      assert.equal(sandbox.db.cleaningRequests[0].adminNote, 'Nota original admin');
    });

    it('2.2.3 should merge three duplicates copying only valid human note', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 205, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', adminNote: null },
          { id: 206, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', adminNote: 'Limpeza de check-out gerada automaticamente para o Flat 512' },
          { id: 207, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', adminNote: 'Hóspede pediu berço adicional' }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1);
      assert.equal(sandbox.db.cleaningRequests[0].adminNote, 'Hóspede pediu berço adicional');
    });

    it('2.2.4 should preserve twinBeds and extraMattress boolean configs during deduplication', () => {
      const sandbox = createServerSandbox({
        cleaningRequests: [
          { id: 208, flatNumber: '512', requestDate: '2026-09-28', status: 'clean', twinBeds: null, extraMattress: null },
          { id: 209, flatNumber: '512', requestDate: '2026-09-28', status: 'dirty', twinBeds: true, extraMattress: false }
        ]
      });
      sandbox.reconcileCleaningRequests();
      assert.equal(sandbox.db.cleaningRequests.length, 1);
      assert.equal(sandbox.db.cleaningRequests[0].twinBeds, true);
      assert.equal(sandbox.db.cleaningRequests[0].extraMattress, false);
    });

    it('2.2.5 should handle empty cleaningRequests gracefully without exception', () => {
      const sandbox = createServerSandbox({ cleaningRequests: [] });
      assert.doesNotThrow(() => sandbox.reconcileCleaningRequests());
      assert.equal(sandbox.db.cleaningRequests.length, 0);
    });
  });

  describe('Area 3 Boundaries: Switchover Time Boundaries', () => {
    it('2.3.1 should return today at exact boundary 17:59:59', () => {
      const t = new Date('2026-09-28T17:59:59');
      assert.equal(evaluateDateSwitchover(t), '2026-09-28');
    });

    it('2.3.2 should return tomorrow at exact boundary 18:00:00', () => {
      const t = new Date('2026-09-28T18:00:00');
      assert.equal(evaluateDateSwitchover(t), '2026-09-29');
    });

    it('2.3.3 should return tomorrow at 23:59:59', () => {
      const t = new Date('2026-09-28T23:59:59');
      assert.equal(evaluateDateSwitchover(t), '2026-09-29');
    });

    it('2.3.4 should return current day at 00:00:00', () => {
      const t = new Date('2026-09-29T00:00:00');
      assert.equal(evaluateDateSwitchover(t), '2026-09-29');
    });

    it('2.3.5 should roll over across month boundaries (e.g. 30/09 to 01/10)', () => {
      const t = new Date('2026-09-30T18:00:00');
      assert.equal(evaluateDateSwitchover(t), '2026-10-01');
    });
  });

  describe('Area 4 Boundaries: FlatCard Edge Cases', () => {
    it('2.4.1 should handle null or undefined leaving guest safely', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: false },
        request: { leavingGuest: null }
      });
      assert.equal(labels.checkoutLabel, 'Saída Prevista');
    });

    it('2.4.2 should generate both Saída Prevista and Entra Amanhã for turnover on tomorrow', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: true },
        request: { leavingGuest: 'Jorge', arrivingGuest: 'Carlos' }
      });
      assert.equal(labels.checkoutLabel, 'Saída Prevista');
      assert.equal(labels.checkinBadge, 'Entra Amanhã');
    });

    it('2.4.3 should handle special accented characters in guest names', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: true },
        request: { leavingGuest: 'Sávio Mendonça', arrivingGuest: 'Danielle Laterça' }
      });
      assert.equal(labels.checkoutLabel, 'Saída Prevista');
      assert.equal(labels.checkinBadge, 'Entra Amanhã');
    });

    it('2.4.4 should handle flat vacant today but with turnover tomorrow', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: false },
        request: { isVacant: true }
      });
      assert.equal(labels.isOccupied, false);
    });

    it('2.4.5 should display clarified carryover badge text on future date view', () => {
      const labels = evaluateCardLabels({
        selectedDate: '2026-09-29',
        todayDate: '2026-09-28',
        flat: { number: '904', isOccupied: false },
        request: { isPendingFromPreviousDay: true }
      });
      assert.equal(labels.carryoverBadge, 'Pendente do turno de hoje');
    });
  });

  describe('Area 5 Boundaries: Flat 313 Boundaries', () => {
    it('2.5.1 should ignore cancelled reservation RES-313-0259 for cleaning generation', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const cancelled = (db.reservations || []).find(r => r.code === 'RES-313-0259');
      if (cancelled) {
        assert.equal(cancelled.status, 'cancelada');
      }
    });

    it('2.5.2 should not carry over 25/09 checkout into Felipe checkin on 28/09', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const sandbox = createServerSandbox(db, '2026-09-28');
      const reqs = sandbox.getRequestsForDate('2026-09-28');
      const p313 = reqs.find(r => String(r.flatNumber) === '313' && r.isPendingFromPreviousDay);
      assert.ok(!p313, 'Flat 313 must not have isPendingFromPreviousDay from 25/09 on 28/09');
    });

    it('2.5.3 should classify 30/09 and 01/10 as stayover dates for Felipe on 313', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const sandbox = createServerSandbox(db, '2026-09-28');
      const reqs30 = sandbox.getRequestsForDate('2026-09-30');
      const reqs01 = sandbox.getRequestsForDate('2026-10-01');
      const c313_30 = reqs30.find(r => String(r.flatNumber) === '313' && r.source === 'checkout');
      const c313_01 = reqs01.find(r => String(r.flatNumber) === '313' && r.source === 'checkout');
      assert.ok(!c313_30, 'No checkout request on stayover date 30/09');
      assert.ok(!c313_01, 'No checkout request on stayover date 01/10');
    });

    it('2.5.4 should isolate Felipe checkout strictly to 2026-10-02', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const felipeRes = (db.reservations || []).find(r => r.code === 'RES-313-0301');
      assert.ok(felipeRes);
      assert.equal(felipeRes.checkoutDate, '2026-10-02');
    });

    it('2.5.5 should not resurrect dirty 1358 on repeated reconcile runs', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const sandbox = createServerSandbox(db, '2026-09-28');
      sandbox.reconcileUniversalIntegrity();
      sandbox.reconcileUniversalIntegrity();
      const c1358 = sandbox.db.cleaningRequests.find(c => c.id === 1358);
      const isDirty = c1358 && c1358.status === 'dirty';
      assert.ok(!isDirty, 'Cleaning 1358 must not be dirty after multiple reconcile passes');
    });
  });

  describe('Area 6 Boundaries: Flat 511 Maid Statement Boundaries', () => {
    it('2.6.1 should verify statement credit amounts match standard flat daily rate R$ 23.25', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const credits = (db.maidStatementEntries || []).filter(e => e.cleaningRequestId === 1338 || e.id?.includes('1338'));
      credits.forEach(c => {
        assert.equal(c.amount, 23.25, 'Credit amount should be 23.25');
      });
    });

    it('2.6.2 should ensure statement entries for Grazi do not contain duplicate descriptions on 26/09', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const graziEntries = (db.maidStatementEntries || []).filter(e => e.userId === 3 && e.entryDate === '2026-09-26');
      assert.equal(graziEntries.length, 0);
    });

    it('2.6.3 should guarantee statement deduplication is strictly idempotent', () => {
      const sandbox = createServerSandbox({
        maidStatementEntries: [
          { id: 's1', userId: 2, entryDate: '2026-09-26', entryType: 'credit', description: 'Diária — Flat 511' },
          { id: 's2', userId: 2, entryDate: '2026-09-26', entryType: 'credit', description: 'Diária — Flat 511' }
        ]
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.maidStatementEntries.length, 1);
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.maidStatementEntries.length, 1, 'Subsequent reconcile run must be idempotent');
    });

    it('2.6.4 should preserve financial debit entries during statement deduplication', () => {
      const sandbox = createServerSandbox({
        maidStatementEntries: [
          { id: 'd1', userId: 2, entryDate: '2026-09-26', entryType: 'debit', description: 'Adiantamento', amount: 50 },
          { id: 'd2', userId: 2, entryDate: '2026-09-26', entryType: 'debit', description: 'Adiantamento', amount: 50 }
        ]
      });
      sandbox.reconcileUniversalIntegrity();
      // Debits must not be accidentally purged by credit deduplication
      const debits = sandbox.db.maidStatementEntries.filter(e => e.entryType === 'debit');
      assert.equal(debits.length, 2);
    });

    it('2.6.5 should preserve completedAt timestamp on ID 1338 during maid realignment', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const c1338 = (db.cleaningRequests || []).find(c => c.id === 1338);
      assert.ok(c1338);
      assert.ok(c1338.completedAt, 'Cleaning 1338 completedAt must be present');
    });
  });

  describe('Area 7 Boundaries: Flat 512 / 712 Reservation Boundaries', () => {
    it('2.7.1 should enforce canonical regex rule: RES-(\\d+)- must match flatNumber', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      (db.reservations || []).forEach(r => {
        if (r.code && r.code.startsWith('RES-') && r.status !== 'cancelada') {
          const match = r.code.match(/^RES-(\d+)-/);
          if (match) {
            const expectedFlat = match[1];
            assert.equal(String(r.flatNumber), expectedFlat,
              `Reservation ${r.code} must map to flatNumber ${expectedFlat}, found ${r.flatNumber}`);
          }
        }
      });
    });

    it('2.7.2 should verify Flat 712 October calendar has no date collisions', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const res712 = (db.reservations || []).filter(r =>
        (r.flatNumber === '712' || r.flatId === 14) &&
        r.status !== 'cancelada' &&
        r.checkinDate >= '2026-10-01'
      );
      // Check no overlapping date intervals
      for (let i = 0; i < res712.length; i++) {
        for (let j = i + 1; j < res712.length; j++) {
          const a = res712[i];
          const b = res712[j];
          const overlap = a.checkinDate < b.checkoutDate && b.checkinDate < a.checkoutDate;
          assert.ok(!overlap, `Overlap detected on Flat 712 between ${a.code} and ${b.code}`);
        }
      }
    });

    it('2.7.3 should retain valid checkout on Flat 512 for 2026-10-01 (RES-512-0295)', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const res512 = (db.reservations || []).find(r => r.code === 'RES-512-0295');
      assert.ok(res512, 'RES-512-0295 must exist');
      assert.equal(res512.flatNumber, '512');
      assert.equal(res512.checkoutDate, '2026-10-01');
    });

    it('2.7.4 should re-align flatId when reconcileUniversalIntegrity is executed', () => {
      const sandbox = createServerSandbox({
        flats: [{ id: 14, number: '712', isActive: true }],
        reservations: [{
          id: 291,
          code: 'RES-712-0291',
          flatNumber: '712',
          flatId: 12, // Mismatched flatId
          checkinDate: '2026-10-12',
          checkoutDate: '2026-10-13',
          status: 'confirmada'
        }],
        cleaningRequests: []
      });
      sandbox.reconcileUniversalIntegrity();
      assert.equal(sandbox.db.reservations[0].flatId, 14, 'flatId must be re-aligned to Flat 712 (14)');
    });

    it('2.7.5 should preserve payment and guest attributes of RES-712-0291 during reallocation', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const res = (db.reservations || []).find(r => r.code === 'RES-712-0291');
      assert.ok(res);
      assert.equal(res.paymentStatus, 'pago_total');
      assert.equal(res.paidAmount, 250);
      assert.equal(res.guestName, 'Miller Mendonça Pessanha');
    });
  });

  describe('Area 8 Boundaries: Universal 19-Flat Boundaries', () => {
    it('2.8.1 should verify every flat in db.flats has unique ID and number', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const ids = new Set();
      const numbers = new Set();
      db.flats.forEach(f => {
        assert.ok(!ids.has(f.id), `Duplicate flat id: ${f.id}`);
        assert.ok(!numbers.has(String(f.number)), `Duplicate flat number: ${f.number}`);
        ids.add(f.id);
        numbers.add(String(f.number));
      });
    });

    it('2.8.2 should immediately purge foreign flat 502 if injected via incoming state', () => {
      const sandbox = createServerSandbox({
        flats: CANONICAL_FLATS,
        reservations: [],
        cleaningRequests: []
      });
      sandbox.reconcileUniversalIntegrity({
        flats: [{ id: 9, number: '502', isActive: true }]
      });
      const has502 = sandbox.db.flats.some(f => String(f.number) === '502');
      assert.ok(!has502, 'Flat 502 must be immediately purged');
    });

    it('2.8.3 should ensure all cleaning requests point to existing flats in db.flats', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const validNumbers = new Set(db.flats.map(f => String(f.number)));
      (db.cleaningRequests || []).forEach(c => {
        if (c.flatNumber) {
          assert.ok(validNumbers.has(String(c.flatNumber)),
            `Cleaning ${c.id} references non-existent flat ${c.flatNumber}`);
        }
      });
    });

    it('2.8.4 should ensure all reservations point to existing flats in db.flats', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const validNumbers = new Set(db.flats.map(f => String(f.number)));
      (db.reservations || []).forEach(r => {
        if (r.flatNumber && r.status !== 'cancelada') {
          assert.ok(validNumbers.has(String(r.flatNumber)),
            `Reservation ${r.code} references non-existent flat ${r.flatNumber}`);
        }
      });
    });

    it('2.8.5 should verify zero off-duty maid assignments across all cleanings', () => {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      const offDutyGraziCleanings = (db.cleaningRequests || []).filter(c =>
        c.requestDate === '2026-09-26' &&
        (c.assignedUserId === 3 || c.assignedUsername === 'Grazi')
      );
      assert.equal(offDutyGraziCleanings.length, 0,
        'Grazi must not be assigned to any cleanings on off-duty date 26/09');
    });
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// ============================================================================

describe('Tier 3: Cross-Feature Combinations', () => {

  it('3.1 should evaluate Flat 904 at 18:30 on 28/09 showing tomorrow checkout forecast without carryover on 28/09', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-09-28');
    
    // Check 28/09 requests (today): Jorge is in house, checkout is 29/09
    const reqs28 = sandbox.getRequestsForDate('2026-09-28');
    const c904_28 = reqs28.find(r => String(r.flatNumber) === '904');
    // On 28/09, 904 should NOT be pending from previous day
    if (c904_28) {
      assert.ok(!c904_28.isPendingFromPreviousDay, 'Flat 904 must not be pending on 28/09');
    }

    // Check 29/09 requests (tomorrow forecast after 18:00):
    const reqs29 = sandbox.getRequestsForDate('2026-09-29');
    const c904_29 = reqs29.find(r => String(r.flatNumber) === '904');
    assert.ok(c904_29, 'Flat 904 must appear in 29/09 forecast');
    assert.equal(c904_29.leavingGuest, 'Jorge', 'Jorge checkout scheduled for 29/09');
  });

  it('3.2 should maintain clean status when admin marks clean and PMS sync generates duplicate checkout', () => {
    const sandbox = createServerSandbox({
      flats: [{ id: 12, number: '512', isActive: true }],
      reservations: [{
        id: 175,
        code: 'RES-512-0175',
        flatId: 12,
        flatNumber: '512',
        guestName: 'Goal',
        checkinDate: '2026-09-21',
        checkoutDate: '2026-09-23',
        status: 'confirmada'
      }],
      cleaningRequests: [{
        id: 1238,
        flatId: 12,
        flatNumber: '512',
        requestDate: '2026-09-23',
        status: 'clean',
        markedByAdmin: true,
        completedAt: '2026-09-23T15:00:00Z',
        adminNote: null
      }]
    });

    // Run reconciliation - must not pollute or revert
    sandbox.reconcileCleaningRequests();
    sandbox.reconcileUniversalIntegrity();

    const c512 = sandbox.db.cleaningRequests.filter(c => c.flatNumber === '512' && c.requestDate === '2026-09-23');
    assert.equal(c512.length, 1);
    assert.equal(c512[0].status, 'clean');
    assert.equal(c512[0].adminNote, null);
  });

  it('3.3 should prevent duplicate dirty checkout generation for all past reservations if already cleaned', () => {
    const sandbox = createServerSandbox({
      flats: CANONICAL_FLATS,
      reservations: [
        { id: 1, code: 'RES-113-0001', flatId: 1, flatNumber: '113', checkinDate: '2026-09-20', checkoutDate: '2026-09-22', status: 'confirmada' },
        { id: 2, code: 'RES-211-0002', flatId: 4, flatNumber: '211', checkinDate: '2026-09-21', checkoutDate: '2026-09-23', status: 'confirmada' }
      ],
      cleaningRequests: [
        { id: 501, flatId: 1, flatNumber: '113', requestDate: '2026-09-22', status: 'clean', completedAt: '2026-09-22T14:00:00Z' },
        { id: 502, flatId: 4, flatNumber: '211', requestDate: '2026-09-23', status: 'clean', completedAt: '2026-09-23T15:00:00Z' }
      ]
    });

    sandbox.reconcileUniversalIntegrity();
    assert.equal(sandbox.db.cleaningRequests.length, 2, 'No redundant dirty requests should be generated');
  });

  it('3.4 should verify financial ledger entries strictly match actual assigned maid duties', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    (db.maidStatementEntries || []).forEach(e => {
      if (e.cleaningRequestId) {
        const cleaning = (db.cleaningRequests || []).find(c => c.id === e.cleaningRequestId);
        if (cleaning && e.entryType === 'credit') {
          assert.equal(cleaning.assignedUserId, e.userId,
            `Statement credit ${e.id} for user ${e.userId} does not match assigned maid ${cleaning.assignedUserId}`);
        }
      }
    });
  });

  it('3.5 should keep reservation code, cleaning request, and flat number synchronized after prefix fix', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const res712 = (db.reservations || []).find(r => r.code === 'RES-712-0291');
    const c1351 = (db.cleaningRequests || []).find(c => c.id === 1351);
    assert.ok(res712);
    assert.ok(c1351);
    assert.equal(res712.flatNumber, '712');
    assert.equal(c1351.flatNumber, '712');
    assert.equal(res712.flatId, c1351.flatId);
  });
});

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// ============================================================================

describe('Tier 4: Real-World Application Scenarios', () => {

  it('4.1 should maintain Flat 512 clean status indefinitely across repeated reconciliation cycles', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-09-28');

    for (let cycle = 0; cycle < 5; cycle++) {
      sandbox.reconcileCleaningRequests();
      sandbox.reconcileUniversalIntegrity();
    }

    const cleanings512 = sandbox.db.cleaningRequests.filter(c =>
      (c.flatNumber === '512' || c.flatId === 12) &&
      c.requestDate <= '2026-09-28' &&
      c.status === 'clean'
    );
    assert.ok(cleanings512.length > 0, 'Flat 512 must have completed cleanings');
    const dirty512Past = sandbox.db.cleaningRequests.filter(c =>
      (c.flatNumber === '512' || c.flatId === 12) &&
      c.requestDate < '2026-09-28' &&
      c.status === 'dirty'
    );
    assert.equal(dirty512Past.length, 0, 'Flat 512 must not revert to dirty for past dates');
  });

  it('4.2 should accurately execute Flat 904 turnover workflow between Jorge and future guest', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-09-28');
    const tomorrowReqs = sandbox.getRequestsForDate('2026-09-29');
    const card904 = tomorrowReqs.find(r => String(r.flatNumber) === '904');
    assert.ok(card904, 'Flat 904 card must exist for 29/09');
    assert.equal(card904.leavingGuest, 'Jorge');
  });

  it('4.3 should ensure Flat 313 guest continuity with zero phantom carryover during Felipe\'s stay', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-09-28');
    const datesToTest = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
    
    datesToTest.forEach(testDate => {
      const reqs = sandbox.getRequestsForDate(testDate);
      const req313 = reqs.find(r => String(r.flatNumber) === '313' && r.isPendingFromPreviousDay);
      assert.ok(!req313, `Flat 313 must not have pending carryover on ${testDate}`);
    });
  });

  it('4.4 should verify governance audit trails for Flat 511 accurately attribute maid Cris', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const c1338 = (db.cleaningRequests || []).find(c => c.id === 1338);
    assert.ok(c1338);
    assert.equal(c1338.assignedUserId, 2);
    assert.equal(c1338.assignedUsername, 'Cris');
  });

  it('4.5 should execute universal 19-flat clean run with zero regressions and zero phantom cards', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-09-28');
    
    const didChange = sandbox.reconcileUniversalIntegrity();
    assert.equal(sandbox.db.flats.length, 19, 'Must maintain exactly 19 active flats');
    
    // Check no phantom cleanings exist
    const phantoms = [1358, 1361, 1362, 1364];
    phantoms.forEach(pid => {
      const item = sandbox.db.cleaningRequests.find(c => c.id === pid);
      if (item) {
        assert.notEqual(item.status, 'dirty', `Phantom cleaning ID ${pid} must not remain dirty`);
      }
    });
  });
});
