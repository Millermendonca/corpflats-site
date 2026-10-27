/**
 * Dedicated Point Test Suite:
 * B2B Stayover Housekeeping Service (CorpFlats Soho Residence)
 *
 * Scope:
 * 1. Twin-Server SHA-256 Parity (demo-server.mjs, maid-automation-service.mjs, zapi-service.mjs)
 * 2. R1: B2B Reservation Identification & Linen Tracking
 * 3. R2: Maid Rates & Financial Statements (Checkout vs Stayover segregation)
 * 4. R3: Guest Portal B2B DND & Linen Requests (with non-B2B 403 barrier)
 * 5. R4: Cleaner Execution, DND Interlock & Linen Confirmation
 * 6. R5: Strict Database Isolation & Integrity Guarantee
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Setup environment BEFORE any server imports
const TEST_PORT = 59885;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
delete process.env.DATABASE_URL;

const ROOT_DIR = process.cwd();
const REAL_DB_PATH = path.join(ROOT_DIR, 'data', 'database.json');
const PRIMARY_MAID_SVC = path.join(ROOT_DIR, 'artifacts', 'api-server', 'maid-automation-service.mjs');
const MIRROR_MAID_SVC = path.join(ROOT_DIR, 'scripts', 'maid-automation-service.mjs');
const PRIMARY_SERVER = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const MIRROR_SERVER = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');
const PRIMARY_ZAPI = path.join(ROOT_DIR, 'artifacts', 'api-server', 'zapi-service.mjs');
const MIRROR_ZAPI = path.join(ROOT_DIR, 'scripts', 'zapi-service.mjs');

// 1. Record real database hash & mtime before test
const initialRealDbHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
const initialRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;

// 2. Prepare temporary isolated test database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-stayover-test-'));
const tmpDbPath = path.join(tmpDir, 'test-db.json');
process.env.DATA_FILE = tmpDbPath;

const mockData = {
  users: [
    { id: 1, username: 'admin', role: 'admin', name: 'Administrador' },
    { id: 2, username: 'cris', role: 'camareira', name: 'Cris Terceirizada', pixKey: '22988486446' },
    { id: 3, username: 'grazi', role: 'camareira', name: 'Grazi Terceirizada', pixKey: '12977795766' },
    { id: 4, username: 'recepcao', role: 'recepcao', name: 'Recepção' }
  ],
  flats: [
    { id: 101, number: '101', name: 'Flat 101', isOccupied: true, active: true },
    { id: 102, number: '102', name: 'Flat 102', isOccupied: true, active: true },
    { id: 201, number: '201', name: 'Flat 201', isOccupied: true, active: true },
    { id: 202, number: '202', name: 'Flat 202', isOccupied: true, active: true }
  ],
  cleaningRates: {
    defaultRatePerRoom: 22.50,
    userRates: {
      "2": 22.50,
      "3": 23.25
    },
    defaultStayoverRatePerRoom: 15.00,
    userStayoverRates: {
      "2": 15.00,
      "3": 15.00
    }
  },
  reservations: [
    {
      id: 8001,
      code: 'RES-B2B-101',
      guestName: 'Carlos Corporativo',
      flatId: 101,
      flatNumber: '101',
      checkinDate: '2026-10-20',
      checkoutDate: '2026-10-31',
      channel: 'b2b',
      isB2b: true,
      companyName: 'Petrobras S.A.',
      lastBeddingChangeDate: '2026-10-20',
      lastTowelsChangeDate: '2026-10-20',
      doNotDisturb: false,
      status: 'confirmed'
    },
    {
      id: 8002,
      code: 'RES-OTA-102',
      guestName: 'Ana Turista',
      flatId: 102,
      flatNumber: '102',
      checkinDate: '2026-10-20',
      checkoutDate: '2026-10-28',
      channel: 'booking',
      isB2b: false,
      doNotDisturb: false,
      status: 'confirmed'
    }
  ],
  cleaningRequests: [
    {
      id: 9001,
      flatId: 101,
      flatNumber: '101',
      reservationId: 8001,
      assignedUserId: 2,
      status: 'clean',
      cleaningType: 'checkout',
      source: 'reservation',
      requestDate: '2026-10-21',
      effectiveDate: '2026-10-21',
      completedAt: '2026-10-21T11:00:00Z',
      isPaidCleaning: true
    },
    {
      id: 9002,
      flatId: 101,
      flatNumber: '101',
      reservationId: 8001,
      assignedUserId: 2,
      status: 'clean',
      cleaningType: 'stayover',
      source: 'stayover',
      requestDate: '2026-10-22',
      effectiveDate: '2026-10-22',
      completedAt: '2026-10-22T14:00:00Z',
      isPaidCleaning: true
    },
    {
      id: 9003,
      flatId: 101,
      flatNumber: '101',
      reservationId: 8001,
      assignedUserId: 2,
      status: 'dirty',
      cleaningType: 'stayover',
      source: 'stayover',
      requestDate: '2026-10-27',
      effectiveDate: '2026-10-27',
      doNotDisturb: false,
      isPaidCleaning: true
    }
  ],
  maidPayments: [],
  maidStatementEntries: []
};

fs.writeFileSync(tmpDbPath, JSON.stringify(mockData, null, 2), 'utf-8');

// Dynamic import of canonical services
const maidService = await import('../artifacts/api-server/maid-automation-service.mjs');
const {
  syncMaidCredits,
  getMaidPeriodFinances
} = maidService;

const serverModule = await import('../artifacts/api-server/demo-server.mjs');
const {
  httpServer,
  isB2bReservation,
  computeLinenTracking,
  createAuthToken,
  AUTH_SESSION_VERSION
} = serverModule;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('Dedicated Test: B2B Stayover Housekeeping Service', () => {
  let adminToken;
  let maidToken;
  let recepcaoToken;

  before(() => {
    adminToken = createAuthToken({ id: 1, username: 'admin', role: 'admin', v: AUTH_SESSION_VERSION });
    maidToken = createAuthToken({ id: 2, username: 'cris', role: 'camareira', v: AUTH_SESSION_VERSION });
    recepcaoToken = createAuthToken({ id: 4, username: 'recepcao', role: 'recepcao', v: AUTH_SESSION_VERSION });
  });

  after(() => {
    // 1. Close server
    if (httpServer && typeof httpServer.close === 'function') {
      httpServer.close();
    }
    // 2. Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    // 3. Verify real DB was NEVER touched
    const finalRealDbHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
    const finalRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;
    assert.strictEqual(finalRealDbHash, initialRealDbHash, 'CRITICAL: Real data/database.json hash was altered during tests!');
    assert.strictEqual(finalRealDbMtime, initialRealDbMtime, 'CRITICAL: Real data/database.json mtime was altered during tests!');
    setTimeout(() => process.exit(0), 50);
  });

  describe('1. Twin-Server Byte-for-Byte SHA-256 Parity', () => {
    it('maid-automation-service.mjs artifacts and scripts must have 100% identical SHA-256 hash', () => {
      const pHash = crypto.createHash('sha256').update(fs.readFileSync(PRIMARY_MAID_SVC)).digest('hex');
      const mHash = crypto.createHash('sha256').update(fs.readFileSync(MIRROR_MAID_SVC)).digest('hex');
      assert.strictEqual(pHash, mHash, 'maid-automation-service.mjs must have exact byte-for-byte SHA-256 parity');
    });

    it('demo-server.mjs artifacts and scripts must have 100% identical SHA-256 hash', () => {
      const pHash = crypto.createHash('sha256').update(fs.readFileSync(PRIMARY_SERVER)).digest('hex');
      const mHash = crypto.createHash('sha256').update(fs.readFileSync(MIRROR_SERVER)).digest('hex');
      assert.strictEqual(pHash, mHash, 'demo-server.mjs must have exact byte-for-byte SHA-256 parity');
    });

    it('zapi-service.mjs artifacts and scripts must have 100% identical SHA-256 hash', () => {
      const pHash = crypto.createHash('sha256').update(fs.readFileSync(PRIMARY_ZAPI)).digest('hex');
      const mHash = crypto.createHash('sha256').update(fs.readFileSync(MIRROR_ZAPI)).digest('hex');
      assert.strictEqual(pHash, mHash, 'zapi-service.mjs must have exact byte-for-byte SHA-256 parity');
    });
  });

  describe('2. R1: B2B Reservation Recognition & Linen Tracking', () => {
    it('should correctly identify B2B reservations and reject OTA/non-B2B channels', () => {
      assert.strictEqual(isB2bReservation({ channel: 'b2b' }), true);
      assert.strictEqual(isB2bReservation({ channel: 'B2B Corporativo' }), true);
      assert.strictEqual(isB2bReservation({ isB2b: true }), true);
      assert.strictEqual(isB2bReservation({ b2bReservationNumber: 'B2B-1234' }), true);
      assert.strictEqual(isB2bReservation({ agencyId: 'AG-200' }), true);
      assert.strictEqual(isB2bReservation({ companyName: 'Petrobras' }), true);

      // Rejections
      assert.strictEqual(isB2bReservation({ channel: 'booking' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'airbnb' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'site' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'balcao' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'whatsapp' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'booking', companyName: 'Petrobras' }), false);
      assert.strictEqual(isB2bReservation(null), false);
    });

    it('should accurately compute stay day numbers, linen days, and 3-day alert flags', () => {
      const res = {
        id: 8001,
        checkinDate: '2026-10-20',
        checkoutDate: '2026-10-28',
        lastBeddingChangeDate: '2026-10-20',
        lastTowelsChangeDate: '2026-10-20',
        doNotDisturb: false
      };

      // Day 1 (2026-10-20): stayDay=1, daysBedding=0, alert=false
      const t1 = computeLinenTracking(res, '2026-10-20', {});
      assert.strictEqual(t1.stayDayNumber, 1);
      assert.strictEqual(t1.totalStayNights, 8);
      assert.strictEqual(t1.daysSinceBeddingChange, 0);
      assert.strictEqual(t1.daysSinceTowelsChange, 0);
      assert.strictEqual(t1.needsBeddingChangeAlert, false);

      // Day 3 (2026-10-22): 2 days since bedding change -> alert = false
      const t3 = computeLinenTracking(res, '2026-10-22', {});
      assert.strictEqual(t3.stayDayNumber, 3);
      assert.strictEqual(t3.daysSinceTowelsChange, 2);
      assert.strictEqual(t3.daysSinceBeddingChange, 2);
      assert.strictEqual(t3.needsBeddingChangeAlert, false);

      // Day 4 (2026-10-23): 3 days since bedding change -> alert = true (threshold reached!)
      const t4 = computeLinenTracking(res, '2026-10-23', {});
      assert.strictEqual(t4.stayDayNumber, 4);
      assert.strictEqual(t4.daysSinceBeddingChange, 3);
      assert.strictEqual(t4.needsBeddingChangeAlert, true);
    });
  });

  describe('3. R2: Maid Rates & Financial Statements', () => {
    it('syncMaidCredits must segregate R$ 22,50 for checkout and R$ 15,00 for stayover', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));
      syncMaidCredits(testDb, 2);

      const entries = testDb.maidStatementEntries.filter(e => e.userId === 2 && e.entryType === 'credit');
      assert.strictEqual(entries.length, 2);

      const checkoutEntry = entries.find(e => e.cleaningRequestId === 9001);
      assert.ok(checkoutEntry);
      assert.strictEqual(checkoutEntry.amount, 22.50);
      assert.strictEqual(checkoutEntry.cleaningType, 'checkout');

      const stayoverEntry = entries.find(e => e.cleaningRequestId === 9002);
      assert.ok(stayoverEntry);
      assert.strictEqual(stayoverEntry.amount, 15.00);
      assert.strictEqual(stayoverEntry.cleaningType, 'stayover');
    });

    it('getMaidPeriodFinances must segregate checkout and stayover counts, rates, and subtotals', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));
      syncMaidCredits(testDb, 2);

      const finances = getMaidPeriodFinances(testDb, 2, '2026-10-16', '2026-10-31');
      assert.strictEqual(finances.cleaningsCount, 2);
      assert.strictEqual(finances.checkoutCount, 1);
      assert.strictEqual(finances.stayoverCount, 1);
      assert.strictEqual(finances.userCheckoutRate, 22.50);
      assert.strictEqual(finances.userStayoverRate, 15.00);
      assert.strictEqual(finances.checkoutGross, 22.50);
      assert.strictEqual(finances.stayoverGross, 15.00);
      assert.strictEqual(finances.grossAmount, 37.50);
      assert.strictEqual(finances.netPendingAmount, 37.50);
    });

    it('GET /api/cleaning/rates and POST /api/cleaning/rates endpoints', async () => {
      // 1. GET rates
      const getRes = await fetch(`${BASE_URL}/api/cleaning/rates`);
      assert.strictEqual(getRes.status, 200);
      const getData = await getRes.json();
      assert.strictEqual(getData.defaultRatePerRoom, 22.50);
      assert.strictEqual(getData.defaultStayoverRatePerRoom, 15.00);
      assert.strictEqual(getData.userStayoverRates['2'], 15.00);

      // 2. POST rates update as admin
      const postRes = await fetch(`${BASE_URL}/api/cleaning/rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          defaultRatePerRoom: 25.00,
          defaultStayoverRatePerRoom: 16.00,
          userRates: { "2": 24.00, "3": 24.50 },
          userStayoverRates: { "2": 16.00, "3": 16.00 }
        })
      });
      assert.strictEqual(postRes.status, 200);

      // Verify update persisted
      const getRes2 = await fetch(`${BASE_URL}/api/cleaning/rates`);
      const getData2 = await getRes2.json();
      assert.strictEqual(getData2.defaultStayoverRatePerRoom, 16.00);
      assert.strictEqual(getData2.userStayoverRates['2'], 16.00);
    });
  });

  describe('4. R3: Guest Portal B2B DND & Linen Requests', () => {
    it('POST /api/pms/guest-portal/:code/do-not-disturb must reject non-B2B with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-OTA-102/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('B2B'));
    });

    it('POST /api/pms/guest-portal/:code/do-not-disturb must accept B2B and toggle DND state', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2B-101/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.doNotDisturb, true);

      // Verify toggle back
      const res2 = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2B-101/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: false })
      });
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.doNotDisturb, false);
    });

    it('POST /api/pms/guest-portal/:code/linen-request must reject non-B2B with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-OTA-102/linen-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bedding', targetDate: '2026-10-27' })
      });
      assert.strictEqual(res.status, 403);
    });

    it('POST /api/pms/guest-portal/:code/linen-request must accept B2B and register request', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2B-101/linen-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'both', targetDate: '2026-10-27', notes: 'Por favor trocar à tarde' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.request);
      assert.strictEqual(data.request.type, 'both');
      assert.strictEqual(data.request.status, 'pending');

      // Cancel the registered request
      const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2B-101/linen-request/${data.request.id}/cancel`, {
        method: 'POST'
      });
      assert.strictEqual(cancelRes.status, 200);
      const cancelData = await cancelRes.json();
      assert.strictEqual(cancelData.success, true);
    });
  });

  describe('5. R4: Cleaner Execution, DND Interlock & Linen Confirmation', () => {
    it('PATCH /api/cleaning/assignments/:requestId/status must block cleaning when DND is active', async () => {
      // 1. Enable DND via Guest Portal API for B2B reservation
      const dndRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2B-101/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(dndRes.status, 200);

      // 2. Camareira tries to finish cleaning
      const res = await fetch(`${BASE_URL}/api/cleaning/assignments/9003/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${maidToken}`
        },
        body: JSON.stringify({
          status: 'clean',
          towelsChanged: false,
          beddingChanged: false
        })
      });

      assert.strictEqual(res.status, 422);
      const data = await res.json();
      assert.ok(data.error.includes('Não Perturbe'));
    });

    it('PATCH /api/cleaning/assignments/:requestId/status must record linen changes and update dates when DND is cleared', async () => {
      // 1. Clear DND
      const dndRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-B2B-101/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: false })
      });
      assert.strictEqual(dndRes.status, 200);

      // 2. Camareira completes cleaning with linen change confirmation
      const res = await fetch(`${BASE_URL}/api/cleaning/assignments/9003/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${maidToken}`
        },
        body: JSON.stringify({
          status: 'clean',
          towelsChanged: true,
          beddingChanged: true,
          date: '2026-10-27'
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'clean');
      assert.strictEqual(data.towelsChanged, true);
      assert.strictEqual(data.beddingChanged, true);

      // Verify reservation dates were updated in database
      const updatedDb = JSON.parse(fs.readFileSync(tmpDbPath, 'utf-8'));
      const resB2b = updatedDb.reservations.find(r => r.id === 8001);
      assert.strictEqual(resB2b.lastBeddingChangeDate, '2026-10-27');
      assert.strictEqual(resB2b.lastTowelsChangeDate, '2026-10-27');
      assert.ok(Array.isArray(resB2b.linenChangeHistory));
      assert.ok(resB2b.linenChangeHistory.length > 0);
    });
  });

  describe('6. R5: Strict Database Isolation Guarantee', () => {
    it('real data/database.json must remain 100% byte-for-byte identical', () => {
      const currentHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
      const currentMtime = fs.statSync(REAL_DB_PATH).mtimeMs;
      assert.strictEqual(currentHash, initialRealDbHash, 'Real database.json hash must match initial hash');
      assert.strictEqual(currentMtime, initialRealDbMtime, 'Real database.json mtime must match initial mtime');
    });
  });
});
