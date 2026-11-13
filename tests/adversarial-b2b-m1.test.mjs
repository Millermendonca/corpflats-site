/**
 * Adversarial Verification Test Suite for Milestone 1 (M1)
 *
 * Scope:
 * 1. Linen tracking calculation:
 *    - Alert every 3 days: daysSinceBeddingChange = 0, 1, 2 (alert: false), 3, 4, 10 (alert: true)
 *    - Update of lastBeddingChangeDate and lastTowelsChangeDate upon completion
 * 2. Guest Portal B2B endpoints:
 *    - HTTP 403 block for Booking, Airbnb, WhatsApp, and Site channels
 *    - Correct operation for B2B reservations (DND toggle & linen request defaulting to tomorrowStr)
 *    - HTTP 422 rejection when maid attempts cleaning_now or clean while DND is active
 * 3. Safe stayover completion checks (checkoutDone protection, occupancy preservation)
 * 4. Twin-server SHA-256 parity check
 *
 * STRICT ISOLATION:
 * - DATA_FILE points to a temporary json file in os.tmpdir()
 * - DATABASE_URL is deleted
 * - PORT is set to isolated port 59871
 * - NODE_ENV = "test"
 * - Real data/database.json SHA-256 and mtime are strictly verified unchanged before and after.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Setup environment BEFORE any imports
const TEST_PORT = 59871;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
delete process.env.DATABASE_URL;

const ROOT_DIR = process.cwd();
const REAL_DB_PATH = path.join(ROOT_DIR, 'data', 'database.json');
const PRIMARY_SERVER = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const MIRROR_SERVER = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');

// Record real database hash & mtime before test
const initialRealDbHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
const initialRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;

// Prepare temporary isolated test database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-adv-test-'));
const tmpDbPath = path.join(tmpDir, 'test-db.json');
process.env.DATA_FILE = tmpDbPath;

const today = new Date();
const pad = n => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const tomorrow = new Date(today.getTime() + 86400000);
const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

const checkinStr = '2026-10-20';
const checkoutStr = '2026-10-30';

const initialMockData = {
  users: [
    { id: 1, username: 'admin', role: 'admin', name: 'Administrador' },
    { id: 2, username: 'cris', role: 'camareira', name: 'Cris Terceirizada' },
    { id: 3, username: 'grazi', role: 'camareira', name: 'Grazi Terceirizada' }
  ],
  flats: [
    { id: 101, number: '101', name: 'Flat 101', isOccupied: true, active: true },
    { id: 102, number: '102', name: 'Flat 102', isOccupied: true, active: true },
    { id: 103, number: '103', name: 'Flat 103', isOccupied: true, active: true },
    { id: 104, number: '104', name: 'Flat 104', isOccupied: true, active: true }
  ],
  reservations: [
    {
      id: 501,
      code: 'B2B-CORP-01',
      guestName: 'Carlos Engenharia',
      channel: 'b2b',
      flatId: 101,
      flatNumber: '101',
      checkinDate: checkinStr,
      checkoutDate: checkoutStr,
      status: 'confirmada',
      isOccupied: true,
      doNotDisturb: false,
      lastBeddingChangeDate: checkinStr,
      lastTowelsChangeDate: checkinStr,
      linenChangeHistory: [],
      linenRequests: []
    },
    {
      id: 502,
      code: 'RES-BKG-01',
      guestName: 'Hóspede Booking',
      channel: 'booking',
      flatId: 102,
      flatNumber: '102',
      checkinDate: checkinStr,
      checkoutDate: checkoutStr,
      status: 'confirmada',
      doNotDisturb: false
    },
    {
      id: 503,
      code: 'RES-ABNB-01',
      guestName: 'Hóspede Airbnb',
      channel: 'airbnb',
      flatId: 103,
      flatNumber: '103',
      checkinDate: checkinStr,
      checkoutDate: checkoutStr,
      status: 'confirmada',
      doNotDisturb: false
    },
    {
      id: 504,
      code: 'RES-WAPP-01',
      guestName: 'Hóspede WhatsApp',
      channel: 'whatsapp',
      flatId: 104,
      flatNumber: '104',
      checkinDate: checkinStr,
      checkoutDate: checkoutStr,
      status: 'confirmada',
      doNotDisturb: false
    },
    // Adversarial: non-B2B channels with companyName / agencyName set
    {
      id: 505,
      code: 'RES-BKG-CORP',
      guestName: 'Hóspede Booking com Empresa',
      channel: 'booking',
      companyName: 'Petrobras',
      flatId: 102,
      flatNumber: '102',
      checkinDate: checkinStr,
      checkoutDate: checkoutStr,
      status: 'confirmada'
    },
    {
      id: 506,
      code: 'RES-WAPP-CORP',
      guestName: 'Hóspede WhatsApp com Empresa',
      channel: 'whatsapp',
      companyName: 'RPM Transportes',
      flatId: 104,
      flatNumber: '104',
      checkinDate: checkinStr,
      checkoutDate: checkoutStr,
      status: 'confirmada'
    }
  ],
  cleaningRequests: [
    {
      id: 9001,
      flatId: 101,
      flatNumber: '101',
      reservationId: 501,
      requestDate: todayStr,
      effectiveDate: todayStr,
      source: 'stayover',
      cleaningType: 'stayover',
      status: 'dirty',
      isOccupied: true,
      isVacant: false,
      doNotDisturb: false
    }
  ]
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialMockData, null, 2), 'utf-8');

// Dynamic import of the primary server module
const serverModule = await import('../artifacts/api-server/demo-server.mjs');
const {
  isB2bReservation,
  computeLinenTracking,
  httpServer
} = serverModule;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('Adversarial M1 Verification Suite', () => {

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

  describe('1. Adversarial Linen Tracking Calculation (computeLinenTracking)', () => {
    it('should strictly alert every 3 days: false for 0, 1, 2; true for 3, 4, 10', () => {
      const baseRes = {
        id: 777,
        checkinDate: '2026-10-01',
        checkoutDate: '2026-10-20',
        lastBeddingChangeDate: '2026-10-01',
        lastTowelsChangeDate: '2026-10-01'
      };

      // 0 days (same date: 2026-10-01)
      const t0 = computeLinenTracking(baseRes, '2026-10-01', {});
      assert.strictEqual(t0.daysSinceBeddingChange, 0);
      assert.strictEqual(t0.needsBeddingChangeAlert, false, '0 days must NOT trigger alert');

      // 1 day (2026-10-02)
      const t1 = computeLinenTracking(baseRes, '2026-10-02', {});
      assert.strictEqual(t1.daysSinceBeddingChange, 1);
      assert.strictEqual(t1.needsBeddingChangeAlert, false, '1 day must NOT trigger alert');

      // 2 days (2026-10-03)
      const t2 = computeLinenTracking(baseRes, '2026-10-03', {});
      assert.strictEqual(t2.daysSinceBeddingChange, 2);
      assert.strictEqual(t2.needsBeddingChangeAlert, false, '2 days must NOT trigger alert');

      // 3 days (2026-10-04) -> Threshold reached!
      const t3 = computeLinenTracking(baseRes, '2026-10-04', {});
      assert.strictEqual(t3.daysSinceBeddingChange, 3);
      assert.strictEqual(t3.needsBeddingChangeAlert, true, '3 days MUST trigger alert');

      // 4 days (2026-10-05) -> Alert remains active
      const t4 = computeLinenTracking(baseRes, '2026-10-05', {});
      assert.strictEqual(t4.daysSinceBeddingChange, 4);
      assert.strictEqual(t4.needsBeddingChangeAlert, true, '4 days MUST trigger alert');

      // 10 days (2026-10-11) -> Alert remains active
      const t10 = computeLinenTracking(baseRes, '2026-10-11', {});
      assert.strictEqual(t10.daysSinceBeddingChange, 10);
      assert.strictEqual(t10.needsBeddingChangeAlert, true, '10 days MUST trigger alert');
    });

    it('should handle leap year transition correctly', () => {
      // Leap year 2024: 2024-02-28 to 2024-03-02 is 3 days
      const leapRes = {
        id: 778,
        checkinDate: '2024-02-28',
        checkoutDate: '2024-03-10',
        lastBeddingChangeDate: '2024-02-28'
      };

      const trackLeap = computeLinenTracking(leapRes, '2024-03-02', {});
      // Feb 28 -> Feb 29 (1) -> Mar 01 (2) -> Mar 02 (3)
      assert.strictEqual(trackLeap.daysSinceBeddingChange, 3);
      assert.strictEqual(trackLeap.needsBeddingChangeAlert, true);
    });

    it('should fallback lastBeddingChangeDate to checkinDate if stored date is before checkin', () => {
      const resOldDate = {
        id: 779,
        checkinDate: '2026-10-15',
        checkoutDate: '2026-10-25',
        lastBeddingChangeDate: '2026-09-01' // Anachronistic date from previous stay
      };

      const t = computeLinenTracking(resOldDate, '2026-10-16', {});
      assert.strictEqual(t.lastBeddingChangeDate, '2026-10-15', 'Should fallback to checkinDate');
      assert.strictEqual(t.daysSinceBeddingChange, 1);
      assert.strictEqual(t.needsBeddingChangeAlert, false);
    });

    it('should return null when reservation has missing checkin or checkout dates', () => {
      assert.strictEqual(computeLinenTracking(null, '2026-10-20', {}), null);
      assert.strictEqual(computeLinenTracking({}, '2026-10-20', {}), null);
      assert.strictEqual(computeLinenTracking({ checkinDate: '2026-10-20' }, '2026-10-20', {}), null);
    });
  });

  describe('2. Adversarial Channel Immunity & isB2bReservation', () => {
    it('should reject pure OTA and direct channels without B2B flags', () => {
      assert.strictEqual(isB2bReservation({ channel: 'booking' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'airbnb' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'whatsapp' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'site' }), false);
      assert.strictEqual(isB2bReservation({ channel: 'balcao' }), false);
    });

    it('ADVERSARIAL CHECK: Non-B2B channels with companyName/agencyName must NOT be classified as B2B', () => {
      // If a Booking or WhatsApp reservation has companyName filled, isB2bReservation should NOT blindly treat it as B2B stayover!
      const bkgWithCompany = { channel: 'booking', companyName: 'Petrobras' };
      const wappWithCompany = { channel: 'whatsapp', companyName: 'RPM Transportes' };

      // We document whether the implementation allows this leakage or strictly blocks it
      const bkgResult = isB2bReservation(bkgWithCompany);
      const wappResult = isB2bReservation(wappWithCompany);

      console.log(`[Adversarial Analysis] isB2bReservation({ channel: 'booking', companyName: 'Petrobras' }) = ${bkgResult}`);
      console.log(`[Adversarial Analysis] isB2bReservation({ channel: 'whatsapp', companyName: 'RPM Transportes' }) = ${wappResult}`);

      assert.strictEqual(bkgResult, false, "Security/Business Logic Violation: Booking reservation with companyName leaked into B2B stayover classification!");
      assert.strictEqual(wappResult, false, "Security/Business Logic Violation: WhatsApp reservation with companyName leaked into B2B stayover classification!");
    });
  });

  describe('3. Guest Portal B2B Endpoints & Non-B2B 403 Blocking', () => {
    it('should return 403 Forbidden when POST /do-not-disturb is called for Booking reservation', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-BKG-01/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 403, 'Booking reservation calling DND must return 403');
      const body = await res.json();
      assert.match(body.error, /corporativas B2B/i);
    });

    it('should return 403 Forbidden when POST /do-not-disturb is called for Airbnb reservation', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ABNB-01/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 403, 'Airbnb reservation calling DND must return 403');
    });

    it('should return 403 Forbidden when POST /do-not-disturb is called for WhatsApp reservation', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-WAPP-01/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 403, 'WhatsApp reservation calling DND must return 403');
    });

    it('should return 403 Forbidden when POST /linen-request is called for Booking reservation', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-BKG-01/linen-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'both' })
      });
      assert.strictEqual(res.status, 403, 'Booking reservation calling linen-request must return 403');
    });

    it('should return 403 Forbidden when POST /linen-request is called for Airbnb reservation', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ABNB-01/linen-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'both' })
      });
      assert.strictEqual(res.status, 403, 'Airbnb reservation calling linen-request must return 403');
    });

    it('should return 403 Forbidden when POST /linen-request is called for WhatsApp reservation', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-WAPP-01/linen-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'both' })
      });
      assert.strictEqual(res.status, 403, 'WhatsApp reservation calling linen-request must return 403');
    });

    it('ADVERSARIAL: should return 403 Forbidden when POST /do-not-disturb is called for Booking reservation even with companyName', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-BKG-CORP/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 403, 'Booking reservation with companyName calling DND must return 403');
    });

    it('ADVERSARIAL: should return 403 Forbidden when POST /do-not-disturb is called for WhatsApp reservation even with companyName', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-WAPP-CORP/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 403, 'WhatsApp reservation with companyName calling DND must return 403');
    });

    it('should successfully toggle DND for valid B2B reservation and reflect on today cleaning card', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/B2B-CORP-01/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.doNotDisturb, true);

      // Verify immediate reflection on today's cleaning card (requestId 9001)
      const diskData = JSON.parse(fs.readFileSync(tmpDbPath, 'utf-8'));
      const card = diskData.cleaningRequests.find(c => c.id === 9001);
      assert.strictEqual(card.doNotDisturb, true, "Today's stayover card must have doNotDisturb: true");
    });

    it('should successfully schedule linen request for valid B2B reservation defaulting to tomorrowStr', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/B2B-CORP-01/linen-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bedding', notes: 'Trocar travesseiros adicionais' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.scheduledDate, tomorrowStr, 'Target date must default to tomorrowStr');
      assert.strictEqual(data.request.type, 'bedding');
      assert.strictEqual(data.request.status, 'pending');

      const diskData = JSON.parse(fs.readFileSync(tmpDbPath, 'utf-8'));
      const b2bRes = diskData.reservations.find(r => r.code === 'B2B-CORP-01');
      assert.ok(b2bRes.linenRequests.length > 0, 'Reservation must store the linen request');
      assert.strictEqual(b2bRes.linenRequests[0].type, 'bedding');
    });
  });

  describe('4. Camareira Cleaning Rejection when DND is Active', () => {
    it('should return 422 when maid attempts to start cleaning (cleaning_now) with DND active', async () => {
      const res = await fetch(`${BASE_URL}/api/cleaning/assignments/9001/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cleaning_now',
          assignedUserId: 2 // Cris (Camareira)
        })
      });
      assert.strictEqual(res.status, 422, 'Must reject with HTTP 422 when DND is active');
      const body = await res.json();
      assert.match(body.error, /Não Perturbe/i);
    });

    it('should return 422 when maid attempts to complete cleaning (clean) with DND active', async () => {
      const res = await fetch(`${BASE_URL}/api/cleaning/assignments/9001/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'clean',
          assignedUserId: 2, // Cris (Camareira)
          towelsChanged: true,
          beddingChanged: true
        })
      });
      assert.strictEqual(res.status, 422, 'Must reject with HTTP 422 when DND is active');
      const body = await res.json();
      assert.match(body.error, /Não Perturbe/i);
    });
  });

  describe('5. Stayover Completion, Linen Date Updates & Safe Checkout Protection', () => {
    it('should allow cleaning completion after guest deactivates DND and update lastBeddingChangeDate', async () => {
      // 1. Guest deactivates DND
      const dndOff = await fetch(`${BASE_URL}/api/pms/guest-portal/B2B-CORP-01/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: false })
      });
      assert.strictEqual(dndOff.status, 200);

      // 2. Maid completes cleaning with towels and bedding changed
      const completeRes = await fetch(`${BASE_URL}/api/cleaning/assignments/9001/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'clean',
          assignedUserId: 2,
          towelsChanged: true,
          beddingChanged: true
        })
      });
      assert.strictEqual(completeRes.status, 200, 'Cleaning completion must succeed once DND is deactivated');

      // 3. Verify target reservation in database
      const diskData = JSON.parse(fs.readFileSync(tmpDbPath, 'utf-8'));
      const targetRes = diskData.reservations.find(r => r.code === 'B2B-CORP-01');

      // Verify date updates
      assert.strictEqual(targetRes.lastBeddingChangeDate, todayStr, 'lastBeddingChangeDate must be updated to today');
      assert.strictEqual(targetRes.lastTowelsChangeDate, todayStr, 'lastTowelsChangeDate must be updated to today');

      // Verify linenChangeHistory has been populated
      assert.ok(Array.isArray(targetRes.linenChangeHistory), 'linenChangeHistory must be an array');
      assert.strictEqual(targetRes.linenChangeHistory.length, 1);
      assert.strictEqual(targetRes.linenChangeHistory[0].beddingChanged, true);
      assert.strictEqual(targetRes.linenChangeHistory[0].towelsChanged, true);

      // Verify SAFE STAYOVER: must NOT trigger checkout
      assert.notStrictEqual(targetRes.checkoutDone, true, 'checkoutDone must NOT be set to true on stayover clean');
      assert.notStrictEqual(targetRes.status, 'completed', 'Reservation status must NOT be completed');

      // Verify Flat remains occupied
      const flat101 = diskData.flats.find(f => f.id === 101);
      assert.strictEqual(flat101.isOccupied, true, 'Flat 101 must remain occupied after stayover cleaning');

      // 4. Verify computeLinenTracking now reflects 0 days since bedding change
      const recomputed = computeLinenTracking(targetRes, todayStr, diskData);
      assert.strictEqual(recomputed.daysSinceBeddingChange, 0);
      assert.strictEqual(recomputed.needsBeddingChangeAlert, false, 'Alert must clear after bedding change');
    });
  });

  describe('6. Twin-Server Byte-for-Byte SHA-256 Parity', () => {
    it('artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256', () => {
      assert.ok(fs.existsSync(PRIMARY_SERVER), 'artifacts/api-server/demo-server.mjs must exist');
      assert.ok(fs.existsSync(MIRROR_SERVER), 'scripts/demo-server.mjs must exist');

      const primaryBuffer = fs.readFileSync(PRIMARY_SERVER);
      const mirrorBuffer = fs.readFileSync(MIRROR_SERVER);

      const primaryHash = crypto.createHash('sha256').update(primaryBuffer).digest('hex');
      const mirrorHash = crypto.createHash('sha256').update(mirrorBuffer).digest('hex');

      console.log(`[SHA-256 Parity] primary: ${primaryHash}`);
      console.log(`[SHA-256 Parity] mirror:  ${mirrorHash}`);

      assert.strictEqual(primaryHash, mirrorHash, 'Twin-servers must have exact byte-for-byte SHA-256 parity');
    });
  });

});
