/**
 * Dedicated Point Test Suite for Milestone 2 (M2):
 * Maid Rates & Financial Statements (R2)
 *
 * Scope:
 * 1. Twin-Server SHA-256 Parity (both maid-automation-service.mjs and demo-server.mjs)
 * 2. syncMaidCredits stayover vs checkout credit generation (R$ 15,00 vs R$ 22,50/R$ 23,25)
 * 3. September normalization shield against overwriting stayovers
 * 4. getMaidPeriodFinances separated counts, rates, and grosses
 * 5. GET /api/cleaning/rates and POST /api/cleaning/rates endpoints
 * 6. /api/analytics/report checkout and stayover discrimination
 * 7. Strict database isolation and data/database.json integrity guarantee
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Setup environment BEFORE any server imports
const TEST_PORT = 59882;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
delete process.env.DATABASE_URL;

const ROOT_DIR = process.cwd();
const REAL_DB_PATH = path.join(ROOT_DIR, 'data', 'database.json');
const PRIMARY_MAID_SVC = path.join(ROOT_DIR, 'artifacts', 'api-server', 'maid-automation-service.mjs');
const MIRROR_MAID_SVC = path.join(ROOT_DIR, 'scripts', 'maid-automation-service.mjs');
const PRIMARY_SERVER = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const MIRROR_SERVER = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');

// Record real database hash & mtime before test
const initialRealDbHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
const initialRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;

// Prepare temporary isolated test database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-m2-test-'));
const tmpDbPath = path.join(tmpDir, 'test-db.json');
process.env.DATA_FILE = tmpDbPath;

const mockData = {
  users: [
    { id: 1, username: 'admin', role: 'admin', name: 'Administrador' },
    { id: 2, username: 'cris', role: 'camareira', name: 'Cris Terceirizada', pixKey: 'cris@corpflats.com' },
    { id: 3, username: 'grazi', role: 'camareira', name: 'Grazi Terceirizada', pixKey: 'grazi@corpflats.com' },
    { id: 4, username: 'recepcao', role: 'recepcao', name: 'Recepção' }
  ],
  flats: [
    { id: 101, number: '101', name: 'Flat 101', isOccupied: true, active: true },
    { id: 102, number: '102', name: 'Flat 102', isOccupied: true, active: true },
    { id: 201, number: '201', name: 'Flat 201', isOccupied: true, active: true },
    { id: 202, number: '202', name: 'Flat 202', isOccupied: true, active: true },
    { id: 203, number: '203', name: 'Flat 203', isOccupied: true, active: true }
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
  reservations: [],
  cleaningRequests: [
    // Cris (id: 2): 1 checkout and 1 stayover in October
    {
      id: 9101,
      flatId: 101,
      flatNumber: '101',
      assignedUserId: 2,
      status: 'clean',
      cleaningType: 'checkout',
      source: 'reservation',
      requestDate: '2026-10-20',
      effectiveDate: '2026-10-20',
      completedAt: '2026-10-20T11:30:00Z',
      isPaidCleaning: true
    },
    {
      id: 9102,
      flatId: 102,
      flatNumber: '102',
      assignedUserId: 2,
      status: 'clean',
      cleaningType: 'stayover',
      source: 'stayover',
      requestDate: '2026-10-21',
      effectiveDate: '2026-10-21',
      completedAt: '2026-10-21T14:15:00Z',
      isPaidCleaning: true
    },
    // Grazi (id: 3): 1 checkout and 1 stayover in October
    {
      id: 9201,
      flatId: 201,
      flatNumber: '201',
      assignedUserId: 3,
      status: 'clean',
      cleaningType: 'checkout',
      source: 'reservation',
      requestDate: '2026-10-22',
      effectiveDate: '2026-10-22',
      completedAt: '2026-10-22T10:45:00Z',
      isPaidCleaning: true
    },
    {
      id: 9202,
      flatId: 202,
      flatNumber: '202',
      assignedUserId: 3,
      status: 'clean',
      cleaningType: 'stayover',
      source: 'stayover',
      requestDate: '2026-10-23',
      effectiveDate: '2026-10-23',
      completedAt: '2026-10-23T15:00:00Z',
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
  getMaidPeriodFinances,
  getMaidStats
} = maidService;

const serverModule = await import('../artifacts/api-server/demo-server.mjs');
const {
  httpServer,
  createAuthToken,
  AUTH_SESSION_VERSION
} = serverModule;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('M2: Maid Rates & Financial Statements Suite', () => {

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

  describe('1. Twin-Server Parity (100% SHA-256 Identical)', () => {
    it('maid-automation-service.mjs artifacts and scripts must have identical SHA-256 hash', () => {
      assert.ok(fs.existsSync(PRIMARY_MAID_SVC), 'artifacts/api-server/maid-automation-service.mjs must exist');
      assert.ok(fs.existsSync(MIRROR_MAID_SVC), 'scripts/maid-automation-service.mjs must exist');

      const pBuf = fs.readFileSync(PRIMARY_MAID_SVC);
      const mBuf = fs.readFileSync(MIRROR_MAID_SVC);

      const pHash = crypto.createHash('sha256').update(pBuf).digest('hex');
      const mHash = crypto.createHash('sha256').update(mBuf).digest('hex');

      assert.strictEqual(pHash, mHash, 'maid-automation-service.mjs must have exact byte-for-byte SHA-256 parity');
    });

    it('demo-server.mjs artifacts and scripts must have identical SHA-256 hash', () => {
      assert.ok(fs.existsSync(PRIMARY_SERVER), 'artifacts/api-server/demo-server.mjs must exist');
      assert.ok(fs.existsSync(MIRROR_SERVER), 'scripts/demo-server.mjs must exist');

      const pBuf = fs.readFileSync(PRIMARY_SERVER);
      const mBuf = fs.readFileSync(MIRROR_SERVER);

      const pHash = crypto.createHash('sha256').update(pBuf).digest('hex');
      const mHash = crypto.createHash('sha256').update(mBuf).digest('hex');

      assert.strictEqual(pHash, mHash, 'demo-server.mjs must have exact byte-for-byte SHA-256 parity');
    });
  });

  describe('2. syncMaidCredits: Stayover vs Checkout Credit Generation', () => {
    it('should generate R$ 15,00 for stayover and R$ 22,50 for checkout for Cris (userId: 2)', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));
      syncMaidCredits(testDb, 2);

      const entries = testDb.maidStatementEntries.filter(e => e.userId === 2 && e.entryType === 'credit');
      assert.strictEqual(entries.length, 2, 'Cris should have exactly 2 credit entries');

      const checkoutEntry = entries.find(e => e.cleaningRequestId === 9101);
      assert.ok(checkoutEntry, 'Checkout entry must exist for request 9101');
      assert.strictEqual(checkoutEntry.amount, 22.50, 'Checkout credit amount must be R$ 22,50');
      assert.strictEqual(checkoutEntry.cleaningType, 'checkout', 'cleaningType must be checkout');
      assert.ok(checkoutEntry.description.includes('Diária — Flat 101'), 'Description must format as Diária — Flat 101');

      const stayoverEntry = entries.find(e => e.cleaningRequestId === 9102);
      assert.ok(stayoverEntry, 'Stayover entry must exist for request 9102');
      assert.strictEqual(stayoverEntry.amount, 15.00, 'Stayover credit amount must be R$ 15,00');
      assert.strictEqual(stayoverEntry.cleaningType, 'stayover', 'cleaningType must be stayover');
      assert.ok(stayoverEntry.description.includes('Diária Stayover — Flat 102'), 'Description must format as Diária Stayover — Flat 102');
    });

    it('should generate R$ 15,00 for stayover and R$ 23,25 for checkout for Grazi (userId: 3)', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));
      syncMaidCredits(testDb, 3);

      const entries = testDb.maidStatementEntries.filter(e => e.userId === 3 && e.entryType === 'credit');
      assert.strictEqual(entries.length, 2, 'Grazi should have exactly 2 credit entries');

      const checkoutEntry = entries.find(e => e.cleaningRequestId === 9201);
      assert.ok(checkoutEntry, 'Checkout entry must exist for request 9201');
      assert.strictEqual(checkoutEntry.amount, 23.25, 'Grazi checkout credit amount must be R$ 23,25');
      assert.strictEqual(checkoutEntry.cleaningType, 'checkout', 'cleaningType must be checkout');
      assert.ok(checkoutEntry.description.includes('Diária — Flat 201'), 'Description must format as Diária — Flat 201');

      const stayoverEntry = entries.find(e => e.cleaningRequestId === 9202);
      assert.ok(stayoverEntry, 'Stayover entry must exist for request 9202');
      assert.strictEqual(stayoverEntry.amount, 15.00, 'Grazi stayover credit amount must be R$ 15,00');
      assert.strictEqual(stayoverEntry.cleaningType, 'stayover', 'cleaningType must be stayover');
      assert.ok(stayoverEntry.description.includes('Diária Stayover — Flat 202'), 'Description must format as Diária Stayover — Flat 202');
    });
  });

  describe('3. Shielding September+ Normalization Loop', () => {
    it('should NOT overwrite stayover entries to userRate during September+ normalization', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));

      // Inject cleanings in September
      testDb.cleaningRequests.push(
        {
          id: 9501,
          flatId: 101,
          flatNumber: '101',
          assignedUserId: 2,
          status: 'clean',
          cleaningType: 'stayover',
          source: 'stayover',
          requestDate: '2026-09-15',
          effectiveDate: '2026-09-15',
          completedAt: '2026-09-15T12:00:00Z',
          isPaidCleaning: true
        },
        {
          id: 9502,
          flatId: 102,
          flatNumber: '102',
          assignedUserId: 2,
          status: 'clean',
          cleaningType: 'checkout',
          source: 'reservation',
          requestDate: '2026-09-16',
          effectiveDate: '2026-09-16',
          completedAt: '2026-09-16T12:00:00Z',
          isPaidCleaning: true
        }
      );

      // Pre-existing entries in statement with a stayover of R$ 15,00 and a corrupted checkout of R$ 18,00
      testDb.maidStatementEntries.push(
        {
          id: 'pay_stayover_sep',
          userId: 2,
          cleaningRequestId: 9501,
          entryType: 'credit',
          amount: 15.00,
          description: 'Diária Stayover — Flat 101',
          cleaningType: 'stayover',
          entryDate: '2026-09-15',
          createdAt: '2026-09-15T12:00:00Z'
        },
        {
          id: 'pay_checkout_sep',
          userId: 2,
          cleaningRequestId: 9502,
          entryType: 'credit',
          amount: 18.00, // needs normalization to 22.50
          description: 'Diária — Flat 102',
          cleaningType: 'checkout',
          entryDate: '2026-09-16',
          createdAt: '2026-09-16T12:00:00Z'
        }
      );

      syncMaidCredits(testDb, 2);

      const stayover = testDb.maidStatementEntries.find(e => e.id === 'pay_stayover_sep');
      assert.strictEqual(stayover.amount, 15.00, 'Stayover must remain R$ 15,00 and NOT be overwritten to 22.50!');

      const checkout = testDb.maidStatementEntries.find(e => e.id === 'pay_checkout_sep');
      assert.strictEqual(checkout.amount, 22.50, 'Checkout must be properly normalized to userRate 22.50');
    });
  });

  describe('4. getMaidPeriodFinances Separation', () => {
    it('should return separate checkout and stayover counts, rates, and gross amounts', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));

      // Add more cleanings to Cris in second half of October (2026-10-16 to 2026-10-31)
      testDb.cleaningRequests.push({
        id: 9103,
        flatId: 201,
        flatNumber: '201',
        assignedUserId: 2,
        status: 'clean',
        cleaningType: 'stayover',
        source: 'stayover',
        requestDate: '2026-10-25',
        effectiveDate: '2026-10-25',
        completedAt: '2026-10-25T11:00:00Z',
        isPaidCleaning: true
      });

      // Cris now has: 1 checkout (R$ 22.50) + 2 stayovers (2 * R$ 15.00 = R$ 30.00) = R$ 52.50
      const finances = getMaidPeriodFinances(testDb, 2, '2026-10-16', '2026-10-31');

      assert.strictEqual(finances.cleaningsCount, 3, 'Total cleanings count must be 3');
      assert.strictEqual(finances.checkoutCount, 1, 'checkoutCount must be 1');
      assert.strictEqual(finances.stayoverCount, 2, 'stayoverCount must be 2');
      assert.strictEqual(finances.userCheckoutRate, 22.50, 'userCheckoutRate must be 22.50');
      assert.strictEqual(finances.userStayoverRate, 15.00, 'userStayoverRate must be 15.00');
      assert.strictEqual(finances.checkoutGross, 22.50, 'checkoutGross must be 22.50');
      assert.strictEqual(finances.stayoverGross, 30.00, 'stayoverGross must be 30.00');
      assert.strictEqual(finances.grossAmount, 52.50, 'grossAmount must be 52.50 (22.50 + 30.00)');
      assert.strictEqual(finances.netPendingAmount, 52.50, 'netPendingAmount must be 52.50 with 0 advances');
    });

    it('should reflect stayover discrimination in getMaidStats', () => {
      const testDb = JSON.parse(JSON.stringify(mockData));
      const stats = getMaidStats(testDb, 2, '2026-10-22');

      assert.strictEqual(stats.checkoutCount, 1);
      assert.strictEqual(stats.stayoverCount, 1);
      assert.strictEqual(stats.checkoutGross, 22.50);
      assert.strictEqual(stats.stayoverGross, 15.00);
      assert.strictEqual(stats.stayoverRate, 15.00);
      assert.strictEqual(stats.grossAmount, 37.50);
      assert.ok(stats.dayBreakdown.includes('Stayover'), 'dayBreakdown must indicate Stayover flats');
    });
  });

  describe('5. /api/cleaning/rates Endpoints (GET and POST)', () => {
    let adminToken;
    let nonAdminToken;

    before(() => {
      adminToken = createAuthToken({ id: 1, username: 'admin', role: 'admin', v: AUTH_SESSION_VERSION });
      nonAdminToken = createAuthToken({ id: 4, username: 'recepcao', role: 'recepcao', v: AUTH_SESSION_VERSION });
    });

    it('GET /api/cleaning/rates should return defaultStayoverRatePerRoom, userStayoverRates, and stayoverRate for cleaners', async () => {
      const res = await fetch(`${BASE_URL}/api/cleaning/rates`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.defaultRatePerRoom, 22.50);
      assert.strictEqual(data.defaultStayoverRatePerRoom, 15.00);
      assert.ok(data.userStayoverRates, 'userStayoverRates map must be present');
      assert.strictEqual(Number(data.userStayoverRates["2"]), 15.00);
      assert.strictEqual(Number(data.userStayoverRates["3"]), 15.00);

      const cris = data.cleaners.find(c => c.userId === 2);
      assert.ok(cris, 'Cris must be in cleaners list');
      assert.strictEqual(cris.rate, 22.50);
      assert.strictEqual(cris.stayoverRate, 15.00);

      const grazi = data.cleaners.find(c => c.userId === 3);
      assert.ok(grazi, 'Grazi must be in cleaners list');
      assert.strictEqual(grazi.rate, 23.25);
      assert.strictEqual(grazi.stayoverRate, 15.00);
    });

    it('POST /api/cleaning/rates should reject non-admin users with 403', async () => {
      const res = await fetch(`${BASE_URL}/api/cleaning/rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nonAdminToken}`
        },
        body: JSON.stringify({ defaultStayoverRatePerRoom: 16.00 })
      });
      assert.strictEqual(res.status, 403, 'Non-admin must be rejected with 403');
    });

    it('POST /api/cleaning/rates should update defaultStayoverRatePerRoom and userStayoverRates as admin', async () => {
      const updatePayload = {
        defaultRatePerRoom: 23.00,
        defaultStayoverRatePerRoom: 16.50,
        userRates: { "2": 23.00, "3": 24.00 },
        userStayoverRates: { "2": 16.50, "3": 17.00 }
      };

      const res = await fetch(`${BASE_URL}/api/cleaning/rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(updatePayload)
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.rates.defaultStayoverRatePerRoom, 16.50);
      assert.strictEqual(data.rates.userStayoverRates["2"], 16.50);
      assert.strictEqual(data.rates.userStayoverRates["3"], 17.00);

      // Verify GET returns the updated values
      const getRes = await fetch(`${BASE_URL}/api/cleaning/rates`);
      const getData = await getRes.json();
      assert.strictEqual(getData.defaultStayoverRatePerRoom, 16.50);
      assert.strictEqual(getData.userStayoverRates["2"], 16.50);
      assert.strictEqual(getData.userStayoverRates["3"], 17.00);

      const cris = getData.cleaners.find(c => c.userId === 2);
      assert.strictEqual(cris.stayoverRate, 16.50);
      const grazi = getData.cleaners.find(c => c.userId === 3);
      assert.strictEqual(grazi.stayoverRate, 17.00);

      // Revert back to canonical values for remaining tests
      await fetch(`${BASE_URL}/api/cleaning/rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          defaultRatePerRoom: 22.50,
          defaultStayoverRatePerRoom: 15.00,
          userRates: { "2": 22.50, "3": 23.25 },
          userStayoverRates: { "2": 15.00, "3": 15.00 }
        })
      });
    });
  });

  describe('6. GET /api/analytics/report Stayover Discrimination', () => {
    let adminToken;

    before(() => {
      adminToken = createAuthToken({ id: 1, username: 'admin', role: 'admin', v: AUTH_SESSION_VERSION });
    });

    it('should discriminate checkoutCount and stayoverCount globally and per cleaner', async () => {
      const res = await fetch(`${BASE_URL}/api/analytics/report?startDate=2026-10-01&endDate=2026-10-31`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Global totals
      assert.strictEqual(data.totalCleanings, 4, 'Total cleanings must be 4');
      assert.strictEqual(data.totalCheckoutCleanings, 2, 'totalCheckoutCleanings must be 2');
      assert.strictEqual(data.totalStayoverCleanings, 2, 'totalStayoverCleanings must be 2');
      assert.strictEqual(data.defaultStayoverRatePerRoom, 15.00);

      // Per-cleaner discrimination
      const cris = data.cleaningsByUser.find(u => u.userId === 2);
      assert.ok(cris, 'Cris must be in report');
      assert.strictEqual(cris.count, 2);
      assert.strictEqual(cris.checkoutCount, 1);
      assert.strictEqual(cris.stayoverCount, 1);
      assert.strictEqual(cris.ratePerRoom, 22.50);
      assert.strictEqual(cris.stayoverRate, 15.00);
      assert.strictEqual(cris.checkoutTotal, 22.50);
      assert.strictEqual(cris.stayoverTotal, 15.00);
      assert.strictEqual(cris.totalToPay, 37.50, 'Cris totalToPay must be 22.50 + 15.00 = 37.50');

      const grazi = data.cleaningsByUser.find(u => u.userId === 3);
      assert.ok(grazi, 'Grazi must be in report');
      assert.strictEqual(grazi.count, 2);
      assert.strictEqual(grazi.checkoutCount, 1);
      assert.strictEqual(grazi.stayoverCount, 1);
      assert.strictEqual(grazi.ratePerRoom, 23.25);
      assert.strictEqual(grazi.stayoverRate, 15.00);
      assert.strictEqual(grazi.checkoutTotal, 23.25);
      assert.strictEqual(grazi.stayoverTotal, 15.00);
      assert.strictEqual(grazi.totalToPay, 38.25, 'Grazi totalToPay must be 23.25 + 15.00 = 38.25');

      // Grand total check: 37.50 + 38.25 = 75.75
      assert.strictEqual(data.grandTotalToPay, 75.75);

      // Individual cleaning items discrimination
      const crisStayoverItem = cris.cleanings.find(c => c.id === 9102);
      assert.ok(crisStayoverItem);
      assert.strictEqual(crisStayoverItem.cleaningType, 'stayover');
      assert.strictEqual(crisStayoverItem.rate, 15.00);

      const crisCheckoutItem = cris.cleanings.find(c => c.id === 9101);
      assert.ok(crisCheckoutItem);
      assert.strictEqual(crisCheckoutItem.cleaningType, 'checkout');
      assert.strictEqual(crisCheckoutItem.rate, 22.50);
    });
  });

});
