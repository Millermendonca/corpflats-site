/**
 * Adversarial Concurrency, Resilience, Lifecycle & Parity Test Suite for Milestone M4
 * Author: Challenger 2 (Resilience, Concurrency & Parity Challenger)
 * File: tests/challenger-m4-concurrency-resilience.test.mjs
 * Execution: node --test tests/challenger-m4-concurrency-resilience.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3999;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m4-concurrency-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

describe("CHALLENGER M4: Concurrency (TOCTOU), Hold Expiration, Tariff Bulk-Sync & Twin Parity", () => {
  before(async () => {
    // 1. Prepare isolated test database
    const rawProd = fs.readFileSync(prodDbPath, "utf-8");
    const testDb = JSON.parse(rawProd);

    // Ensure botActionsSettings are enabled
    testDb.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true
      },
      preReservationHoldMinutes: 30,
      handoverMessage: "Esta ação está temporariamente desativada.",
      updatedAt: new Date().toISOString()
    };

    // Ensure sample test flats exist
    if (!Array.isArray(testDb.flats)) testDb.flats = [];
    const neededFlats = [
      { id: 101, number: "101", colName: "Flat 101" },
      { id: 102, number: "102", colName: "Flat 102" },
      { id: 103, number: "103", colName: "Flat 103" }
    ];
    for (const nf of neededFlats) {
      if (!testDb.flats.some(f => String(f.id) === String(nf.id))) {
        testDb.flats.push(nf);
      }
    }

    fs.writeFileSync(isolatedDbPath, JSON.stringify(testDb, null, 2), "utf-8");

    // 2. Spawn isolated test server
    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    // 3. Wait for readiness
    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }

    if (!isReady) {
      throw new Error(`Test server failed to start on port ${TEST_PORT}`);
    }
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ==========================================================================
  // SUITE 1: SHA-256 TWIN SERVER PARITY
  // ==========================================================================
  describe("1. Twin-Server Mirror Parity (Byte-to-byte SHA-256)", () => {
    it("1.1 demo-server.mjs parity between artifacts/api-server/ and scripts/", () => {
      const p1 = path.join(rootDir, "artifacts", "api-server", "demo-server.mjs");
      const p2 = path.join(rootDir, "scripts", "demo-server.mjs");
      const h1 = sha256File(p1);
      const h2 = sha256File(p2);
      assert.strictEqual(h1, h2, `demo-server.mjs SHA-256 mismatch!\napi-server: ${h1}\nscripts:    ${h2}`);
    });

    it("1.2 whatsapp-ai-service.mjs parity between artifacts/api-server/ and scripts/", () => {
      const p1 = path.join(rootDir, "artifacts", "api-server", "whatsapp-ai-service.mjs");
      const p2 = path.join(rootDir, "scripts", "whatsapp-ai-service.mjs");
      const h1 = sha256File(p1);
      const h2 = sha256File(p2);
      assert.strictEqual(h1, h2, `whatsapp-ai-service.mjs SHA-256 mismatch!\napi-server: ${h1}\nscripts:    ${h2}`);
    });

    it("1.3 zapi-service.mjs parity between artifacts/api-server/ and scripts/", () => {
      const p1 = path.join(rootDir, "artifacts", "api-server", "zapi-service.mjs");
      const p2 = path.join(rootDir, "scripts", "zapi-service.mjs");
      const h1 = sha256File(p1);
      const h2 = sha256File(p2);
      assert.strictEqual(h1, h2, `zapi-service.mjs SHA-256 mismatch!\napi-server: ${h1}\nscripts:    ${h2}`);
    });

    it("1.4 auxiliary services parity (fnrh-pdf-service, fnrh-serpro-service, mail-service)", () => {
      const auxFiles = ["fnrh-pdf-service.mjs", "fnrh-serpro-service.mjs", "mail-service.mjs"];
      for (const file of auxFiles) {
        const p1 = path.join(rootDir, "artifacts", "api-server", file);
        const p2 = path.join(rootDir, "scripts", file);
        if (fs.existsSync(p1) && fs.existsSync(p2)) {
          const h1 = sha256File(p1);
          const h2 = sha256File(p2);
          assert.strictEqual(h1, h2, `${file} SHA-256 mismatch!`);
        }
      }
    });
  });

  // ==========================================================================
  // SUITE 2: CONCURRENCY & TOCTOU SAFETY
  // ==========================================================================
  describe("2. Concurrency & TOCTOU Safety (Simultaneous Pre-Reservations)", () => {
    it("2.1 High-concurrency burst: 10 simultaneous pre-reservations for EXACT same flat and dates", async () => {
      const targetFlat = 101;
      const checkIn = "2027-08-01";
      const checkOut = "2027-08-05";
      const burstCount = 10;

      const requests = Array.from({ length: burstCount }, (_, i) =>
        fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId: targetFlat,
            checkIn,
            checkOut,
            guestName: `Burst Guest #${i + 1}`,
            total: 500 + i * 10
          })
        })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map(r => r.status);
      const count200 = statuses.filter(s => s === 200).length;
      const count409 = statuses.filter(s => s === 409).length;

      // Exactly 1 must win (200), and all remaining 9 must fail with 409 Conflict
      assert.strictEqual(count200, 1, `Expected exactly 1 success (200), got ${count200}`);
      assert.strictEqual(count409, burstCount - 1, `Expected ${burstCount - 1} conflicts (409), got ${count409}`);

      // Verify on-disk persistence: exactly 1 non-cancelled/non-expired reservation
      const diskDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const activeRes = diskDb.reservations.filter(r =>
        String(r.flatId) === String(targetFlat) &&
        r.checkinDate === checkIn &&
        r.checkoutDate === checkOut &&
        r.status !== "cancelada" &&
        r.status !== "expirada"
      );
      assert.strictEqual(activeRes.length, 1, `Expected 1 active reservation in DB, got ${activeRes.length}`);
    });

    it("2.2 Partial date overlap race: 4 concurrent requests with staggered overlapping intervals", async () => {
      const targetFlat = 102;
      // Staggered dates that all overlap with each other
      const intervals = [
        { checkIn: "2027-09-10", checkOut: "2027-09-15", guestName: "Overlapper A" },
        { checkIn: "2027-09-12", checkOut: "2027-09-17", guestName: "Overlapper B" },
        { checkIn: "2027-09-08", checkOut: "2027-09-11", guestName: "Overlapper C" },
        { checkIn: "2027-09-14", checkOut: "2027-09-20", guestName: "Overlapper D" }
      ];

      const requests = intervals.map(interval =>
        fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId: targetFlat,
            checkIn: interval.checkIn,
            checkOut: interval.checkOut,
            guestName: interval.guestName,
            total: 600
          })
        })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map(r => r.status);
      const successes = responses.filter(r => r.status === 200);

      // Since all 4 overlap directly or chain-overlap around 10-15, at most 1 can succeed
      assert.strictEqual(successes.length, 1, `Expected at most 1 success among mutually overlapping requests, got ${successes.length}`);
      const diskDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const overlappingInDb = diskDb.reservations.filter(r =>
        String(r.flatId) === String(targetFlat) &&
        r.status === "pre_reserva" &&
        r.checkinDate < "2027-09-20" &&
        r.checkoutDate > "2027-09-08"
      );
      assert.strictEqual(overlappingInDb.length, 1, "DB must not have more than 1 active pre-reservation in overlapping range");
    });

    it("2.3 Commit reservation race: simultaneous commits of the same pre-reservation do not double-book", async () => {
      // Create a pre-reservation first
      const preRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 103,
          checkIn: "2027-10-01",
          checkOut: "2027-10-05",
          guestName: "Double Commit Target",
          total: 800
        })
      });
      assert.strictEqual(preRes.status, 200);
      const preData = await preRes.json();
      const resId = preData.reservationId;

      // Now fire 5 simultaneous commits on the same reservationId
      const commitRequests = Array.from({ length: 5 }, () =>
        fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: resId })
        })
      );

      const commitResponses = await Promise.all(commitRequests);
      const commitStatuses = commitResponses.map(r => r.status);

      // At least 1 should succeed with 200, none should result in 500 error
      assert.ok(commitStatuses.every(s => s === 200 || s === 400 || s === 409), `Unexpected status in commit race: ${commitStatuses}`);
      assert.ok(commitStatuses.includes(200), "At least one commit must succeed with 200");

      // Verify PMS status
      const diskDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const targetRes = diskDb.reservations.find(r => r.id === resId);
      assert.strictEqual(targetRes.status, "confirmada", "Reservation status must be 'confirmada'");
      assert.strictEqual(targetRes.pmsConfirmed, true, "Reservation pmsConfirmed must be true");
      assert.strictEqual(targetRes.paymentStatus, "pago_total", "Reservation paymentStatus must be 'pago_total'");
    });
  });

  // ==========================================================================
  // SUITE 3: AUTOMATIC HOLD EXPIRATION & AVAILABILITY RELEASE
  // ==========================================================================
  describe("3. Hold Expiration & Availability Release", () => {
    it("3.1 Pre-reservation hold expiration automatically releases flat in /availability in real time", async () => {
      // 1. Configure ultra-short hold (0.02 minutes = 1.2 seconds) to test real-time expiration
      const setRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preReservationHoldMinutes: 0.02 })
      });
      assert.strictEqual(setRes.status, 200);

      // 2. Create a pre-reservation on Flat 101 for November 2027
      const preRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 101,
          checkIn: "2027-11-10",
          checkOut: "2027-11-15",
          guestName: "Expiring Guest",
          total: 750
        })
      });
      assert.strictEqual(preRes.status, 200);
      const preData = await preRes.json();
      const resId = preData.reservationId;

      // 3. Query availability immediately (< 500ms) -> Flat 101 must NOT be available while hold is live
      const avail1 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2027-11-10&checkOut=2027-11-15&guests=2`);
      const avail1Data = await avail1.json();
      const flat101Before = avail1Data.flats.find(f => String(f.id) === "101" || String(f.number) === "101");
      assert.strictEqual(flat101Before, undefined, "Flat 101 must be blocked while hold is active");

      // 4. Wait 1.6 seconds for the hold to expire naturally in real time
      await new Promise(r => setTimeout(r, 1600));

      // 5. Query availability again -> Triggers automatic cleanup of expired pre-reservation!
      const avail2 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2027-11-10&checkOut=2027-11-15&guests=2`);
      assert.strictEqual(avail2.status, 200);
      const avail2Data = await avail2.json();
      const flat101After = avail2Data.flats.find(f => String(f.id) === "101" || String(f.number) === "101");
      assert.ok(flat101After, "Flat 101 MUST be released and returned as available after hold expiration!");

      // 6. Verify DB on disk recorded status 'expirada'
      const diskDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const expiredRec = diskDb.reservations.find(r => r.id === resId);
      assert.strictEqual(expiredRec.status, "expirada", "Reservation status must transition to 'expirada'");

      // 7. Attempting to commit the expired reservation must fail with 400 PRE_RESERVATION_EXPIRED
      const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: resId })
      });
      assert.strictEqual(commitRes.status, 400, "Commit of expired pre-reservation must return 400");
      const commitData = await commitRes.json();
      assert.strictEqual(commitData.error, "PRE_RESERVATION_EXPIRED");

      // 8. Creating a new pre-reservation for the exact same flat and dates now succeeds
      const newPreRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 101,
          checkIn: "2027-11-10",
          checkOut: "2027-11-15",
          guestName: "Fresh Guest After Expiration",
          total: 800
        })
      });
      assert.strictEqual(newPreRes.status, 200, "New pre-reservation should succeed after previous hold expired");
    });

    it("3.2 Configurable hold time: setting preReservationHoldMinutes=45 creates exactly 45m hold", async () => {
      // Update settings
      const setRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preReservationHoldMinutes: 45 })
      });
      assert.strictEqual(setRes.status, 200);

      // Create pre-reserve
      const res = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 102,
          checkIn: "2027-11-20",
          checkOut: "2027-11-25",
          guestName: "Custom Hold Duration Guest",
          total: 900
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.holdMinutes, 45, "holdMinutes returned should be 45");

      const diffMin = Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 60000);
      assert.ok(diffMin >= 44 && diffMin <= 46, `Hold expiration diff should be ~45 min, got ${diffMin}`);
    });
  });

  // ==========================================================================
  // SUITE 4: BULK-UPDATE OF TARIFFS & CONSISTENCY ACROSS MATRIX AND QUOTE
  // ==========================================================================
  describe("4. Bulk-Update of Tariffs & Consistency Across Matrix and Quote", () => {
    it("4.1 Large-range bulk update across 60 days, multiple flats and channels", async () => {
      // Bulk update 1: Direct channel, flat 101, 2027-06-01 to 2027-07-30 (60 days) -> rate 450.00
      const bulk1 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2027-06-01",
          endDate: "2027-07-30",
          channels: ["direct"],
          flatIds: [101],
          rate: 450.00,
          reason: "High season empirical challenge bulk test"
        })
      });
      assert.strictEqual(bulk1.status, 200);
      const bulk1Data = await bulk1.json();
      assert.strictEqual(bulk1Data.success, true);
      assert.strictEqual(bulk1Data.updatedCount, 60, "Expected 60 date overrides for Flat 101 direct channel");

      // Bulk update 2: Booking channel, flat 101, same range -> rate 550.00
      const bulk2 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2027-06-01",
          endDate: "2027-07-30",
          channels: ["booking"],
          flatIds: [101],
          rate: 550.00,
          reason: "High season booking markup override"
        })
      });
      assert.strictEqual(bulk2.status, 200);
      const bulk2Data = await bulk2.json();
      assert.strictEqual(bulk2Data.updatedCount, 60, "Expected 60 date overrides for Flat 101 booking channel");
    });

    it("4.2 Matrix consistency: GET /api/tariffs/calendar returns exact overridden rates across all queried days", async () => {
      // Query calendar for June 2027 (direct channel)
      const calJuneDirect = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2027-06&channel=direct&flatId=101`);
      assert.strictEqual(calJuneDirect.status, 200);
      const dataJuneDirect = await calJuneDirect.json();
      assert.ok(Array.isArray(dataJuneDirect.days), "days must be an array");
      assert.strictEqual(dataJuneDirect.days.length, 30, "June must have 30 days");

      for (const d of dataJuneDirect.days) {
        assert.strictEqual(d.rate, 450.00, `Day ${d.date} in June direct should have rate 450.00`);
        assert.strictEqual(d.hasOverride, true, `Day ${d.date} should have hasOverride=true`);
      }

      // Query calendar for June 2027 (booking channel)
      const calJuneBooking = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2027-06&channel=booking&flatId=101`);
      const dataJuneBooking = await calJuneBooking.json();
      for (const d of dataJuneBooking.days) {
        assert.strictEqual(d.rate, 550.00, `Day ${d.date} in June booking should have rate 550.00`);
        assert.strictEqual(d.hasOverride, true, `Day ${d.date} should have hasOverride=true`);
      }

      // Query calendar for July 2027 (direct channel)
      const calJulyDirect = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2027-07&channel=direct&flatId=101`);
      const dataJulyDirect = await calJulyDirect.json();
      // July 1 to 30 should be 450.00, July 31 should fall back to non-override
      for (let day = 1; day <= 30; day++) {
        const dateStr = `2027-07-${String(day).padStart(2, "0")}`;
        const dayObj = dataJulyDirect.days.find(d => d.date === dateStr);
        assert.ok(dayObj, `Day ${dateStr} must exist in calendar`);
        assert.strictEqual(dayObj.rate, 450.00, `Day ${dateStr} should be 450.00`);
        assert.strictEqual(dayObj.hasOverride, true, `Day ${dateStr} should have override`);
      }
      const day31 = dataJulyDirect.days.find(d => d.date === "2027-07-31");
      assert.strictEqual(day31.hasOverride, false, "July 31 should not have override");
    });

    it("4.3 Quote calculation consistency: POST /api/bot-actions/quote matches matrix sum across multiple nights", async () => {
      // 7-night stay: 2027-06-10 to 2027-06-17 on Flat 101 (direct channel)
      const quoteDirect = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2027-06-10",
          checkOut: "2027-06-17",
          guests: 2,
          flatId: 101,
          channel: "direct"
        })
      });
      assert.strictEqual(quoteDirect.status, 200);
      const dataQD = await quoteDirect.json();
      assert.strictEqual(dataQD.nights, 7);
      assert.strictEqual(dataQD.roomTotal, 450.00 * 7, "roomTotal should equal 7 nights * 450.00");
      for (const dr of dataQD.dailyRates) {
        assert.strictEqual(dr.rate, 450.00, `Night ${dr.date} should have rate 450.00`);
      }
      const expectedTotalDirect = (450.00 * 7) + Number(dataQD.cleaningFee || 0) + Number(dataQD.extraBedFee || 0) + Number(dataQD.breakfastFee || 0);
      assert.strictEqual(dataQD.total, expectedTotalDirect, "Quote total must match roomTotal plus fees");

      // 7-night stay on Booking channel
      const quoteBooking = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2027-06-10",
          checkOut: "2027-06-17",
          guests: 2,
          flatId: 101,
          channel: "booking"
        })
      });
      assert.strictEqual(quoteBooking.status, 200);
      const dataQB = await quoteBooking.json();
      assert.strictEqual(dataQB.nights, 7);
      assert.strictEqual(dataQB.roomTotal, 550.00 * 7, "roomTotal on Booking should equal 7 nights * 550.00");
      for (const dr of dataQB.dailyRates) {
        assert.strictEqual(dr.rate, 550.00, `Night ${dr.date} on Booking should have rate 550.00`);
      }
      const expectedTotalBooking = (550.00 * 7) + Number(dataQB.cleaningFee || 0) + Number(dataQB.extraBedFee || 0) + Number(dataQB.breakfastFee || 0);
      assert.strictEqual(dataQB.total, expectedTotalBooking, "Quote total on Booking must match roomTotal plus fees");

      // Extended 30-night continuous stay: 2027-06-01 to 2027-07-01
      const quoteLong = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2027-06-01",
          checkOut: "2027-07-01",
          guests: 2,
          flatId: 101,
          channel: "direct"
        })
      });
      assert.strictEqual(quoteLong.status, 200);
      const dataQL = await quoteLong.json();
      assert.strictEqual(dataQL.nights, 30);
      assert.strictEqual(dataQL.roomTotal, 450.00 * 30, "30 nights * 450.00 = 13500.00");
      const expectedLongTotal = (450.00 * 30) + Number(dataQL.cleaningFee || 0) + Number(dataQL.extraBedFee || 0) + Number(dataQL.breakfastFee || 0);
      assert.strictEqual(dataQL.total, expectedLongTotal, "30-night quote total must match roomTotal + fees");
    });
  });
});
