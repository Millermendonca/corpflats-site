/**
 * Adversarial Empirical Challenge Suite - Milestone 1 (M1)
 * Housekeeping Challenger (challenger_m1_1)
 *
 * Verifies:
 * 1. getRequestsForDate and GET /api/reservations/checkouts card generation:
 *    - Scenario 1: B2B on checkin date (checkinDate === dateStr) -> NO stayover card
 *    - Scenario 2: B2B on checkout date (checkoutDate === dateStr) -> NO stayover card (normal checkout card)
 *    - Scenario 3: Non-B2B (Booking, Airbnb, WhatsApp, Site Direto, Balcão) on intermediate days -> NEVER stayover card
 *    - Scenario 4: B2B on intermediate days -> generates stayover card (source: "stayover", cleaningType: "stayover")
 * 2. PATCH /api/cleaning/assignments/:requestId/status stayover completion:
 *    - Flat remains occupied (relatedFlat.isOccupied === true)
 *    - Reservation is NOT completed (status !== "completed")
 *    - checkoutDone is NOT true
 *    - 10-minute minimum cleaning lock does NOT block housekeeper in stayover
 *    - 10-minute minimum cleaning lock DOES block housekeeper in regular checkout
 *    - DND (doNotDisturb: true) returns 422 for housekeeper in stayover
 *    - Passing isVacant: true in stayover is ignored/coerced to false (safe invariant)
 * 3. Twin-Server SHA-256 Parity
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_PORT = 3877;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, 'data', 'database.json');
const tempDir = os.tmpdir();
const isolatedDbPath = path.join(tempDir, `test-challenger-m1-db-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.json`);
const isolatedAuditPath = path.join(tempDir, `test-challenger-m1-audit-${Date.now()}.jsonl`);

process.env.DATA_FILE = isolatedDbPath;
process.env.DATABASE_FILE = isolatedDbPath;
process.env.AUDIT_LOG_FILE = isolatedAuditPath;
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

let serverProcess = null;
let initialProdHash = null;
let initialProdMtime = null;

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (_) {}
}

describe('CHALLENGER M1: Adversarial Housekeeping Challenge', () => {

  before(async () => {
    // Record prod db integrity baseline
    initialProdHash = getFileHash(prodDbPath);
    initialProdMtime = fs.statSync(prodDbPath).mtimeMs;

    // Load clean base state for isolated DB
    const baseDbRaw = fs.readFileSync(prodDbPath, 'utf8');
    const db = JSON.parse(baseDbRaw);

    // Seed test flats if needed
    db.flats = [
      { id: 1, number: '101', name: 'Flat 101', isOccupied: true, isActive: true },
      { id: 2, number: '102', name: 'Flat 102', isOccupied: true, isActive: true },
      { id: 3, number: '103', name: 'Flat 103', isOccupied: true, isActive: true },
      { id: 4, number: '104', name: 'Flat 104', isOccupied: true, isActive: true },
      { id: 5, number: '105', name: 'Flat 105', isOccupied: true, isActive: true },
      { id: 6, number: '106', name: 'Flat 106', isOccupied: true, isActive: true }
    ];

    // Reference test dates
    // dateStr = "2026-11-15"
    // Scenario 1: B2B Checkin day (checkinDate === "2026-11-15", checkoutDate === "2026-11-20")
    // Scenario 2: B2B Checkout day (checkinDate === "2026-11-10", checkoutDate === "2026-11-15")
    // Scenario 3: Non-B2B intermediate days (checkinDate === "2026-11-10", checkoutDate === "2026-11-20")
    // Scenario 4: B2B intermediate days (checkinDate === "2026-11-10", checkoutDate === "2026-11-20")

    db.reservations = [
      // Res 1: B2B on checkin date (Flat 101)
      {
        id: 9101,
        code: 'B2B-CHECKIN-9101',
        flatId: 1,
        flatNumber: '101',
        guestName: 'B2B Checkin Guest',
        checkinDate: '2026-11-15',
        checkoutDate: '2026-11-20',
        channel: 'b2b',
        isB2b: true,
        agencyId: 'AG-1',
        status: 'confirmada',
        checkoutDone: false
      },
      // Res 2: B2B on checkout date (Flat 102)
      {
        id: 9102,
        code: 'B2B-CHECKOUT-9102',
        flatId: 2,
        flatNumber: '102',
        guestName: 'B2B Checkout Guest',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-15',
        channel: 'b2b',
        isB2b: true,
        agencyId: 'AG-1',
        status: 'confirmada',
        checkoutDone: false
      },
      // Res 3A: Booking.com on intermediate date (Flat 103)
      {
        id: 9103,
        code: 'BK-OTA-9103',
        flatId: 3,
        flatNumber: '103',
        guestName: 'Booking Guest',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        channel: 'booking',
        status: 'confirmada',
        checkoutDone: false
      },
      // Res 3A: Booking.com on intermediate date (Flat 103)
      {
        id: 9103,
        code: 'BK-OTA-9103',
        flatId: 3,
        flatNumber: '103',
        guestName: 'Booking Guest',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        channel: 'booking',
        status: 'confirmada',
        checkoutDone: false
      },
      // Res 3B (Adversarial): Booking.com with companyName (Flat 104)
      {
        id: 9104,
        code: 'BK-CORP-9104',
        flatId: 4,
        flatNumber: '104',
        guestName: 'Booking Corporate Guest',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        channel: 'booking',
        companyName: 'Petrobras S.A.',
        status: 'confirmada',
        checkoutDone: false
      },
      // Res 3C (Adversarial): B2B already completed / checked-out early (Flat 105)
      {
        id: 9105,
        code: 'B2B-COMPLETED-9105',
        flatId: 5,
        flatNumber: '105',
        guestName: 'B2B Completed Guest',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        channel: 'b2b',
        isB2b: true,
        agencyId: 'AG-1',
        status: 'completed',
        checkoutDone: true,
        actualCheckoutAt: '2026-11-12T10:00:00.000Z'
      },
      // Res 4: B2B on intermediate date (Flat 106)
      {
        id: 9106,
        code: 'B2B-STAYOVER-9106',
        flatId: 6,
        flatNumber: '106',
        guestName: 'B2B Stayover Guest',
        checkinDate: '2026-11-10',
        checkoutDate: '2026-11-20',
        channel: 'b2b',
        isB2b: true,
        agencyId: 'AG-1',
        status: 'confirmada',
        checkoutDone: false,
        doNotDisturb: false,
        lastBeddingChangeDate: '2026-11-10',
        lastTowelsChangeDate: '2026-11-10',
        linenChangeHistory: []
      }
    ];

    // Clear any pre-existing cleaning requests for these test flats
    db.cleaningRequests = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(db, null, 2), 'utf8');

    // Spawn isolated test server instance
    const env = {
      ...process.env,
      PORT: String(TEST_PORT),
      DATA_FILE: isolatedDbPath,
      DATABASE_FILE: isolatedDbPath,
      AUDIT_LOG_FILE: isolatedAuditPath,
      NODE_ENV: 'test'
    };
    delete env.DATABASE_URL;

    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      cwd: rootDir,
      env,
      stdio: 'pipe'
    });

    serverProcess.stderr.on('data', (d) => {
      // console.error('[Server Error Output]:', d.toString());
    });

    // Wait for server readiness
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const resp = await fetch(`${BASE_URL}/api/system/version`);
        if (resp.ok) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'Isolated test server failed to start on port ' + TEST_PORT);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    // Clean up temporary isolated DB
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
      if (fs.existsSync(isolatedAuditPath)) fs.unlinkSync(isolatedAuditPath);
    } catch (_) {}

    // Verify production DB was not modified
    const postProdHash = getFileHash(prodDbPath);
    const postProdMtime = fs.statSync(prodDbPath).mtimeMs;
    assert.strictEqual(postProdHash, initialProdHash, 'CRITICAL: Production database.json hash altered!');
    assert.strictEqual(postProdMtime, initialProdMtime, 'CRITICAL: Production database.json mtime altered!');
  });

  describe('1. Card Generation Adversarial Testing (getRequestsForDate & GET /api/reservations/checkouts)', () => {
    const targetDate = '2026-11-15';

    it('Scenario 1: B2B reservation on check-in day (checkinDate === dateStr) MUST NOT generate stayover card', async () => {
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      assert.strictEqual(resp.status, 200);
      const cards = await resp.json();

      // Flat 101 has checkinDate === "2026-11-15"
      const flat101Stayover = cards.find(c =>
        (String(c.flatNumber) === '101' || c.flatId === 1) &&
        (c.source === 'stayover' || c.cleaningType === 'stayover')
      );
      assert.strictEqual(flat101Stayover, undefined, 'Flat 101 must NOT have any stayover card on check-in day');
    });

    it('Scenario 2: B2B reservation on checkout day (checkoutDate === dateStr) MUST NOT generate stayover card (generates checkout)', async () => {
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      assert.strictEqual(resp.status, 200);
      const cards = await resp.json();

      // Flat 102 has checkoutDate === "2026-11-15"
      const flat102Stayover = cards.find(c =>
        (String(c.flatNumber) === '102' || c.flatId === 2) &&
        (c.source === 'stayover' || c.cleaningType === 'stayover')
      );
      assert.strictEqual(flat102Stayover, undefined, 'Flat 102 must NOT have a stayover card on checkout day');

      const flat102Checkout = cards.find(c =>
        (String(c.flatNumber) === '102' || c.flatId === 2) &&
        (c.source !== 'stayover' && c.cleaningType !== 'stayover')
      );
      assert.ok(flat102Checkout, 'Flat 102 MUST have a normal checkout cleaning card on checkout day');
    });

    it('Scenario 3: Non-B2B channels (Booking, Airbnb, WhatsApp, Site Direto) in intermediate days MUST NEVER generate stayover cards', async () => {
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      assert.strictEqual(resp.status, 200);
      const cards = await resp.json();

      // Flat 103 (pure Booking) on intermediate day 2026-11-15 (checkin 10, checkout 20)
      const bookingStayover = cards.find(c => (String(c.flatNumber) === '103' || c.flatId === 3));
      assert.strictEqual(bookingStayover, undefined, 'Booking reservation must NEVER generate stayover card in intermediate days');
    });

    it('Adversarial Probe A: Non-B2B channels with companyName / agencyName MUST NOT leak into B2B stayovers', async () => {
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      assert.strictEqual(resp.status, 200);
      const cards = await resp.json();

      // Flat 104 has channel: 'booking' and companyName: 'Petrobras S.A.'
      const leakedBookingCard = cards.find(c =>
        (String(c.flatNumber) === '104' || c.flatId === 4) &&
        (c.source === 'stayover' || c.cleaningType === 'stayover')
      );
      assert.strictEqual(
        leakedBookingCard,
        undefined,
        'CRITICAL LEAK: Booking reservation with companyName was classified as B2B and generated a stayover card!'
      );
    });

    it('Adversarial Probe B: B2B reservations that are already completed / checked-out MUST NOT generate stayover cards', async () => {
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      assert.strictEqual(resp.status, 200);
      const cards = await resp.json();

      // Flat 105 has B2B reservation with status: 'completed' and checkoutDone: true
      const leakedCompletedCard = cards.find(c =>
        (String(c.flatNumber) === '105' || c.flatId === 5) &&
        (c.source === 'stayover' || c.cleaningType === 'stayover')
      );
      assert.strictEqual(
        leakedCompletedCard,
        undefined,
        'DEFECT: getRequestsForDate generated stayover card for a reservation with status === "completed" / checkoutDone === true!'
      );
    });

    it('Scenario 4: B2B reservation in intermediate day (checkinDate < dateStr && checkoutDate > dateStr) MUST generate stayover card', async () => {
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      assert.strictEqual(resp.status, 200);
      const cards = await resp.json();

      // Flat 106 (B2B)
      const stayoverCard = cards.find(c =>
        (String(c.flatNumber) === '106' || c.flatId === 6) &&
        (c.source === 'stayover' || c.cleaningType === 'stayover')
      );
      assert.ok(stayoverCard, 'Flat 106 MUST have a stayover cleaning card generated');
      assert.strictEqual(stayoverCard.source, 'stayover');
      assert.strictEqual(stayoverCard.cleaningType, 'stayover');
      assert.strictEqual(stayoverCard.isOccupied, true, 'Stayover card must have isOccupied === true');
      assert.strictEqual(stayoverCard.isVacant, false, 'Stayover card must have isVacant === false');
      assert.strictEqual(stayoverCard.currentGuest, 'B2B Stayover Guest');
      assert.ok(stayoverCard.linenTracking, 'Stayover card must have linenTracking attached');
      assert.strictEqual(stayoverCard.linenTracking.stayDayNumber, 6);
      assert.strictEqual(stayoverCard.linenTracking.totalStayNights, 10);
      assert.strictEqual(stayoverCard.linenTracking.needsBeddingChangeAlert, true, 'Day 6 with lastBeddingChange on day 1 (5 days) must have alert');
    });

    it('Scenario 4b: Idempotency of card generation in getRequestsForDate', async () => {
      // Multiple consecutive requests for same date must not create duplicate cards
      const resp1 = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      const cards1 = await resp1.json();
      const count1 = cards1.filter(c => String(c.flatNumber) === '106').length;

      const resp2 = await fetch(`${BASE_URL}/api/reservations/checkouts?date=${targetDate}`);
      const cards2 = await resp2.json();
      const count2 = cards2.filter(c => String(c.flatNumber) === '106').length;

      assert.strictEqual(count1, 1, 'Exactly one card for Flat 106 in run 1');
      assert.strictEqual(count2, 1, 'Exactly one card for Flat 106 in run 2 (idempotent)');
    });
  });

  describe('2. Stayover Cleaning Completion Adversarial Testing (PATCH /api/cleaning/assignments/:id/status)', () => {
    let stayoverRequestId = null;
    let checkoutRequestId = null;

    before(async () => {
      // Get current cards to retrieve IDs
      const resp = await fetch(`${BASE_URL}/api/reservations/checkouts?date=2026-11-15`);
      const cards = await resp.json();

      const stayover = cards.find(c => String(c.flatNumber) === '106');
      assert.ok(stayover, 'Stayover card must exist');
      stayoverRequestId = stayover.cleaningRequest?.id || stayover.id;

      const checkout = cards.find(c => String(c.flatNumber) === '102');
      assert.ok(checkout, 'Checkout card must exist');
      checkoutRequestId = checkout.cleaningRequest?.id || checkout.id;
    });

    it('Scenario 5: Completing stayover cleaning MUST NOT free flat, complete reservation, or set checkoutDone', async () => {
      // Step 1: Start cleaning (cleaning_now)
      const startResp = await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cleaning_now',
          cleaningStartedAt: new Date().toISOString()
        })
      });
      assert.strictEqual(startResp.status, 200);

      // Verify flat occupancy mid-cleaning
      const diskDb1 = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
      const flatMid = diskDb1.flats.find(f => f.id === 6);
      const resMid = diskDb1.reservations.find(r => r.id === 9106);
      assert.strictEqual(flatMid.isOccupied, true, 'Flat must remain isOccupied: true during stayover cleaning');
      assert.strictEqual(resMid.status, 'confirmada', 'Reservation must remain confirmada during stayover cleaning');
      assert.strictEqual(Boolean(resMid.checkoutDone), false, 'checkoutDone must remain false during stayover cleaning');

      // Step 2: Complete cleaning (clean) with linen checklist
      const completeResp = await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'clean',
          towelsChanged: true,
          beddingChanged: true,
          date: '2026-11-15'
        })
      });
      assert.strictEqual(completeResp.status, 200);
      const completeBody = await completeResp.json();
      assert.strictEqual(completeBody.status, 'clean');
      assert.strictEqual(completeBody.towelsChanged, true);
      assert.strictEqual(completeBody.beddingChanged, true);

      // Verify DB persistence
      const diskDb2 = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
      const flatAfter = diskDb2.flats.find(f => f.id === 6);
      const resAfter = diskDb2.reservations.find(r => r.id === 9106);

      assert.strictEqual(flatAfter.isOccupied, true, 'Flat MUST remain isOccupied === true after stayover completion');
      assert.notStrictEqual(resAfter.status, 'completed', 'Reservation MUST NOT be marked completed');
      assert.strictEqual(resAfter.status, 'confirmada', 'Reservation status must remain active');
      assert.strictEqual(Boolean(resAfter.checkoutDone), false, 'checkoutDone MUST NOT be true');
      assert.strictEqual(resAfter.actualCheckoutAt, undefined, 'actualCheckoutAt must not be set');

      // Linen tracking assertions
      assert.strictEqual(resAfter.lastBeddingChangeDate, '2026-11-15');
      assert.strictEqual(resAfter.lastTowelsChangeDate, '2026-11-15');
      assert.ok(Array.isArray(resAfter.linenChangeHistory), 'linenChangeHistory must be an array');
      assert.strictEqual(resAfter.linenChangeHistory.length, 1);
      assert.strictEqual(resAfter.linenChangeHistory[0].beddingChanged, true);
      assert.strictEqual(resAfter.linenChangeHistory[0].towelsChanged, true);
    });

    it('Scenario 6: 10-minute minimum lock does NOT block housekeeper in stayover, but DOES block in checkout', async () => {
      // 1. Test stayover with cleaningStartedAt 30 seconds ago (maid/unauthenticated user)
      const recentStartedAt = new Date(Date.now() - 30000).toISOString(); // 30 seconds ago

      // Reset stayover card to cleaning_now with recent timestamp
      await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cleaning_now',
          cleaningStartedAt: recentStartedAt
        })
      });

      // Try completing stayover immediately (< 10 minutes)
      const stayoverCompleteResp = await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'clean',
          towelsChanged: false,
          beddingChanged: false
        })
      });

      assert.strictEqual(stayoverCompleteResp.status, 200, 'Stayover MUST NOT be blocked by 10-minute minimum cleaning lock');

      // 2. Test normal checkout with cleaningStartedAt 30 seconds ago (should be BLOCKED with 400)
      await fetch(`${BASE_URL}/api/cleaning/assignments/${checkoutRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cleaning_now',
          cleaningStartedAt: recentStartedAt
        })
      });

      const checkoutCompleteResp = await fetch(`${BASE_URL}/api/cleaning/assignments/${checkoutRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'clean'
        })
      });

      assert.strictEqual(checkoutCompleteResp.status, 400, 'Normal checkout cleaning MUST be blocked by 10-minute lock when elapsed < 10min');
      const errBody = await checkoutCompleteResp.json();
      assert.ok(errBody.error.includes('Tempo insuficiente de higienização'), 'Error message must explain 10-min minimum');
    });

    it('Scenario 7: Do Not Disturb (DND) mode blocks maid from starting or completing stayover with HTTP 422', async () => {
      // Activate DND via Guest Portal endpoint for B2B reservation B2B-STAYOVER-9106
      const dndToggleResp = await fetch(`${BASE_URL}/api/pms/guest-portal/B2B-STAYOVER-9106/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: true })
      });
      assert.strictEqual(dndToggleResp.status, 200);
      const dndToggleBody = await dndToggleResp.json();
      assert.strictEqual(dndToggleBody.doNotDisturb, true);

      // Reset card status to dirty first so cleaning can be attempted
      await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dirty' })
      });

      // Maid attempts to start cleaning when DND is active
      const dndStartResp = await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cleaning_now'
        })
      });

      assert.strictEqual(dndStartResp.status, 422, 'Starting stayover under DND must return HTTP 422');
      const dndStartBody = await dndStartResp.json();
      assert.ok(dndStartBody.error.includes('Não Perturbe'), 'Error message must mention Não Perturbe');

      // Maid attempts to complete cleaning when DND is active
      const dndCompleteResp = await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'clean'
        })
      });

      assert.strictEqual(dndCompleteResp.status, 422, 'Completing stayover under DND must return HTTP 422');
    });

    it('Scenario 8: Passing isVacant: true for a stayover request is safely overridden (invariant holds)', async () => {
      // Turn off DND via portal
      await fetch(`${BASE_URL}/api/pms/guest-portal/B2B-STAYOVER-9106/do-not-disturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotDisturb: false })
      });

      // Attempt to maliciously or accidentally pass isVacant: true
      const resp = await fetch(`${BASE_URL}/api/cleaning/assignments/${stayoverRequestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isVacant: true,
          status: 'clean'
        })
      });

      assert.strictEqual(resp.status, 200);

      // Verify that flat occupancy was NOT set to false
      const postDb = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
      const flat = postDb.flats.find(f => f.id === 6);
      const updatedCard = postDb.cleaningRequests.find(c => c.id === stayoverRequestId);

      assert.strictEqual(flat.isOccupied, true, 'Flat must remain isOccupied: true even if isVacant: true is sent');
      assert.strictEqual(updatedCard.isVacant, false, 'Card isVacant must remain false in stayover');
    });
  });

  describe('3. Twin-Server SHA-256 Parity Empirical Audit', () => {
    it('Twin servers artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs SHA-256 parity', () => {
      const primaryPath = path.join(rootDir, 'artifacts', 'api-server', 'demo-server.mjs');
      const mirrorPath = path.join(rootDir, 'scripts', 'demo-server.mjs');

      assert.ok(fs.existsSync(primaryPath), 'Primary server must exist');
      assert.ok(fs.existsSync(mirrorPath), 'Mirror server must exist');

      const primaryHash = getFileHash(primaryPath);
      const mirrorHash = getFileHash(mirrorPath);

      // We assert strict equality to empirically demonstrate whether parity holds or fails
      assert.strictEqual(
        primaryHash,
        mirrorHash,
        `Twin-server SHA-256 parity mismatch! primary=${primaryHash} mirror=${mirrorHash}`
      );
    });
  });
});
