/**
 * Adversarial Stress & Empirical Challenge Suite for Milestone M1
 * Author: Challenger 2 (Empirical Challenger)
 * File: tests/challenger-m1-adversarial.test.mjs
 * Execution: node --test tests/challenger-m1-adversarial.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3998;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger-m1-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

const ACTION_ENDPOINTS = [
  {
    key: "checkAvailability",
    name: "Availability",
    call: () => fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-20&checkOut=2026-12-23&guests=2`)
  },
  {
    key: "calculateQuote",
    name: "Quote",
    call: () => fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkIn: "2026-12-20", checkOut: "2026-12-23", guests: 2, flatId: 1 })
    })
  },
  {
    key: "generatePayment",
    name: "Payment Link",
    call: () => fetch(`${BASE_URL}/api/bot-actions/payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 200, guestName: "Adversarial Guest" })
    })
  },
  {
    key: "createPreReservation",
    name: "Pre-Reserve",
    call: (flatId = 1, checkIn = "2026-12-20", checkOut = "2026-12-23") => fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flatId, checkIn, checkOut, guestName: "Adversarial Guest", total: 400 })
    })
  },
  {
    key: "commitReservation",
    name: "Commit Reservation",
    call: (resId = 999) => fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: resId })
    })
  }
];

describe("CHALLENGER 2: Adversarial Empirical Challenge Suite (M1)", () => {
  before(async () => {
    const rawProd = fs.readFileSync(prodDbPath, "utf-8");
    const testDb = JSON.parse(rawProd);

    // Initial settings
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
      handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano.",
      updatedAt: new Date().toISOString()
    };

    // Pre-seed test reservations to test lifecycle & time-travel on boot:
    // 1. Flat 114 (id: 2) -> Expired pre-reservation (expiresAt 10 min ago)
    testDb.reservations = testDb.reservations || [];
    testDb.reservations.unshift({
      id: 70001,
      code: "CF-EXPIRED-70001",
      flatId: 2,
      flatNumber: "114",
      guestName: "Expired Test Guest",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pendente",
      totalAmount: 400,
      expiresAt: new Date(Date.now() - 600000).toISOString() // 10 minutes in past
    });

    // 2. Flat 116 (id: 3) -> Active (non-expired) pre-reservation (expiresAt 20 min in future)
    testDb.reservations.unshift({
      id: 70002,
      code: "CF-ACTIVE-70002",
      flatId: 3,
      flatNumber: "116",
      guestName: "Active Hold Guest",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pendente",
      totalAmount: 450,
      expiresAt: new Date(Date.now() + 1200000).toISOString() // 20 minutes in future
    });

    // 3. Flat 211 (id: 4) -> Past expiresAt BUT pago_total (should NOT be expired)
    testDb.reservations.unshift({
      id: 70003,
      code: "CF-PAID-70003",
      flatId: 4,
      flatNumber: "211",
      guestName: "Paid Hold Guest",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pago_total",
      totalAmount: 500,
      expiresAt: new Date(Date.now() - 600000).toISOString() // 10 minutes in past
    });

    // 4. Flat 212 (id: 5) -> Confirmed PMS reservation (permanent lock)
    testDb.reservations.unshift({
      id: 70004,
      code: "CF-CONFIRMED-70004",
      flatId: 5,
      flatNumber: "212",
      guestName: "Confirmed Guest",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      channel: "direct",
      status: "confirmada",
      paymentStatus: "pago_total",
      totalAmount: 550
    });

    fs.writeFileSync(isolatedDbPath, JSON.stringify(testDb, null, 2), "utf-8");

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

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PERMUTATION TESTS: MASTER SWITCH & INDIVIDUAL ACTIONS
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Master Switch & Granular Switches Permutations", () => {
    it("1.1 Master Switch OFF: 100% of the 5 endpoints reject with 403 ACTION_DISABLED, requiresHandover: true, even if allowedActions are all true", async () => {
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiActionsEnabled: false,
          allowedActions: {
            checkAvailability: true,
            calculateQuote: true,
            generatePayment: true,
            createPreReservation: true,
            commitReservation: true
          }
        })
      });

      for (const ep of ACTION_ENDPOINTS) {
        const res = await ep.call();
        assert.strictEqual(res.status, 403, `Endpoint ${ep.name} should return 403 when master switch is OFF`);
        const body = await res.json();
        assert.strictEqual(body.error, "ACTION_DISABLED", `Endpoint ${ep.name} error code must be ACTION_DISABLED`);
        assert.strictEqual(body.action, ep.key, `Endpoint ${ep.name} action field must match ${ep.key}`);
        assert.strictEqual(body.requiresHandover, true, `Endpoint ${ep.name} requiresHandover must be true`);
        assert.ok(typeof body.message === "string" && body.message.length > 0, `Endpoint ${ep.name} must have a message`);
      }
    });

    it("1.2 Master Switch OFF with all allowedActions FALSE: all 5 endpoints return 403 ACTION_DISABLED gracefully", async () => {
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiActionsEnabled: false,
          allowedActions: {
            checkAvailability: false,
            calculateQuote: false,
            generatePayment: false,
            createPreReservation: false,
            commitReservation: false
          }
        })
      });

      for (const ep of ACTION_ENDPOINTS) {
        const res = await ep.call();
        assert.strictEqual(res.status, 403);
        const body = await res.json();
        assert.strictEqual(body.error, "ACTION_DISABLED");
        assert.strictEqual(body.requiresHandover, true);
      }
    });

    it("1.3 Master Switch ON: Single Disabled Action Matrix (each of the 5 actions disabled one-by-one)", async () => {
      for (const targetEp of ACTION_ENDPOINTS) {
        const allowed = {};
        for (const ep of ACTION_ENDPOINTS) {
          allowed[ep.key] = ep.key !== targetEp.key;
        }

        const updateRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiActionsEnabled: true,
            allowedActions: allowed
          })
        });
        assert.strictEqual(updateRes.status, 200);

        // Verify the disabled endpoint returns 403 ACTION_DISABLED
        const disabledRes = await targetEp.call();
        assert.strictEqual(disabledRes.status, 403, `Target ${targetEp.name} was disabled and must return 403`);
        const disabledBody = await disabledRes.json();
        assert.strictEqual(disabledBody.error, "ACTION_DISABLED");
        assert.strictEqual(disabledBody.action, targetEp.key);
        assert.strictEqual(disabledBody.requiresHandover, true);

        // Verify all OTHER endpoints DO NOT return 403 ACTION_DISABLED
        for (const otherEp of ACTION_ENDPOINTS) {
          if (otherEp.key === targetEp.key) continue;
          const otherRes = await otherEp.call();
          assert.notStrictEqual(
            otherRes.status,
            403,
            `Endpoint ${otherEp.name} should NOT be blocked when its switch is true (got status ${otherRes.status})`
          );
        }
      }
    });

    it("1.4 Master Switch ON: Single Enabled Action Matrix (each of the 5 actions enabled one-by-one, others false)", async () => {
      for (const targetEp of ACTION_ENDPOINTS) {
        const allowed = {};
        for (const ep of ACTION_ENDPOINTS) {
          allowed[ep.key] = ep.key === targetEp.key;
        }

        await fetch(`${BASE_URL}/api/bot-actions/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiActionsEnabled: true,
            allowedActions: allowed
          })
        });

        const enabledRes = await targetEp.call();
        assert.notStrictEqual(
          enabledRes.status,
          403,
          `Endpoint ${targetEp.name} is the only allowed and should NOT return 403`
        );

        for (const otherEp of ACTION_ENDPOINTS) {
          if (otherEp.key === targetEp.key) continue;
          const otherRes = await otherEp.call();
          assert.strictEqual(otherRes.status, 403, `Endpoint ${otherEp.name} should return 403`);
          const body = await otherRes.json();
          assert.strictEqual(body.error, "ACTION_DISABLED");
          assert.strictEqual(body.requiresHandover, true);
        }
      }
    });

    it("1.5 Custom Handover Message is dynamically returned across all blocked endpoints", async () => {
      const customMsg = "Atendimento automatizado temporariamente pausado pela recepção. Transferindo...";
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiActionsEnabled: false,
          handoverMessage: customMsg
        })
      });

      for (const ep of ACTION_ENDPOINTS) {
        const res = await ep.call();
        assert.strictEqual(res.status, 403);
        const body = await res.json();
        assert.strictEqual(body.message, customMsg);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PRE-RESERVATION LIFECYCLE & EXPIRATION (TIME-TRAVEL)
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Pre-Reservation Lifecycle & Expiration Verification", () => {
    before(async () => {
      // Re-enable all actions
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiActionsEnabled: true,
          allowedActions: {
            checkAvailability: true,
            calculateQuote: true,
            generatePayment: true,
            createPreReservation: true,
            commitReservation: true
          }
        })
      });
    });

    it("2.1 Expired pre-reservation (Flat 114, past expiresAt) is freed on availability query and status transitions to 'expirada'", async () => {
      // Query availability for Flat 114 dates (2026-12-01 to 2026-12-05)
      const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-05&guests=2`);
      assert.strictEqual(availRes.status, 200);
      const availData = await availRes.json();

      // Flat 114 (id: 2) MUST be in the available list because its pre-reservation expired!
      const flat114 = availData.flats.find(f => String(f.id) === "2" || String(f.number) === "114");
      assert.ok(flat114, "Flat 114 should be released and listed as available");

      // Verify that database on disk recorded status = 'expirada'
      const dbSaved = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const r70001 = dbSaved.reservations.find(r => r.id === 70001);
      assert.strictEqual(r70001.status, "expirada", "Reservation 70001 must have transitioned to status 'expirada'");

      // A new pre-reservation can now be successfully created for Flat 114
      const newPreRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 2,
          checkIn: "2026-12-01",
          checkOut: "2026-12-05",
          guestName: "New Guest Replacing Expired",
          total: 420
        })
      });
      assert.strictEqual(newPreRes.status, 200);
      const newPreData = await newPreRes.json();
      assert.strictEqual(newPreData.status, "pre_reserva");
    });

    it("2.2 Active (non-expired) pre-reservation (Flat 116) remains blocked", async () => {
      // Query availability for Flat 116 (id: 3) dates
      const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-05&guests=2`);
      const availData = await availRes.json();

      const flat116 = availData.flats.find(f => String(f.id) === "3" || String(f.number) === "116");
      assert.strictEqual(flat116, undefined, "Flat 116 must NOT be available because pre-reservation hold is active");
    });

    it("2.3 Pre-reservation with past expiresAt BUT paymentStatus = 'pago_total' (Flat 211) remains locked", async () => {
      // Query availability for Flat 211 (id: 4) dates
      const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-05&guests=2`);
      const availData = await availRes.json();

      const flat211 = availData.flats.find(f => String(f.id) === "4" || String(f.number) === "211");
      assert.strictEqual(flat211, undefined, "Flat 211 must NOT be available because reservation was paid");
    });

    it("2.4 Confirmed reservation (Flat 212) remains permanently locked in PMS", async () => {
      // Query availability for Flat 212 (id: 5) dates
      const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-05&guests=2`);
      const availData = await availRes.json();

      const flat212 = availData.flats.find(f => String(f.id) === "5" || String(f.number) === "212");
      assert.strictEqual(flat212, undefined, "Flat 212 must remain locked by confirmed PMS reservation");
    });

    it("2.5 Defect Check: preReservationHoldMinutes in settings is ignored by pre-reserve endpoint (hardcoded to 30 min)", async () => {
      // Set hold time to 15 minutes
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preReservationHoldMinutes: 15
        })
      });

      // Create pre-reservation
      const res = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 6, // Flat 215
          checkIn: "2026-12-10",
          checkOut: "2026-12-12",
          guestName: "Configurable Hold Guest",
          total: 300
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      const expiresMs = new Date(data.expiresAt).getTime();
      const diffMinutes = Math.round((expiresMs - Date.now()) / 60000);

      console.log(`[PRE-RESERVE HOLD MINUTES] Configured: 15 min, Result diffMinutes: ${diffMinutes}, Response holdMinutes: ${data.holdMinutes}`);

      // We document whether the system actually respected 15 minutes or hardcoded 30 minutes:
      // If diffMinutes ~ 30, it ignored preReservationHoldMinutes
      const respectedConfig = diffMinutes <= 16 && diffMinutes >= 14 && data.holdMinutes === 15;
      if (!respectedConfig) {
        console.warn(`[DEFECT CONFIRMED] preReservationHoldMinutes is configured to 15, but pre-reserve generated expiresAt with ~${diffMinutes} minutes hold and holdMinutes=${data.holdMinutes}`);
      }
      assert.ok(
        respectedConfig,
        `preReservationHoldMinutes in settings (15m) should be respected by pre-reserve endpoint, but got ${diffMinutes}m (holdMinutes: ${data.holdMinutes})`
      );
    });

    it("2.6 Defect Check: Commit an expired reservation (status: 'expirada') is allowed and confirmed instead of rejected", async () => {
      // Reservation 70001 was expired and marked status 'expirada' in test 2.1
      const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: 70001 })
      });

      const commitData = await commitRes.json();
      console.log(`[COMMIT EXPIRED RESERVATION RESULT] Status: ${commitRes.status}, Body:`, commitData);

      // In a sound booking engine, committing an expired reservation must fail (e.g. 400 or 409).
      // If it returns 200 and confirms, that's another vulnerability.
      const rejected = commitRes.status === 400 || commitRes.status === 409;
      if (!rejected) {
        console.warn(`[DEFECT CONFIRMED] commit-reservation confirmed an expired reservation with 200 OK! Status in PMS became: ${commitData.status}`);
      }
      assert.ok(
        rejected,
        `commit-reservation should reject expired reservations, but returned ${commitRes.status} and confirmed it in PMS!`
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CONCURRENCY STRESS TEST (SIMULTANEOUS PRE-RESERVATIONS ON SAME FLAT)
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Concurrency Stress Test: Simultaneous Pre-Reservations", () => {
    it("3.1 Race condition challenge: two concurrent pre-reserve requests for the EXACT same flat and dates", async () => {
      const testFlatId = 7; // Flat 313
      const checkIn = "2027-01-10";
      const checkOut = "2027-01-15";

      // Fire two concurrent requests
      const p1 = fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: testFlatId,
          checkIn,
          checkOut,
          guestName: "Concurrent Requester 1",
          total: 1000
        })
      });

      const p2 = fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: testFlatId,
          checkIn,
          checkOut,
          guestName: "Concurrent Requester 2",
          total: 1000
        })
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      const statuses = [res1.status, res2.status].sort();

      console.log(`[CONCURRENCY EMPIRICAL RESULT] Request 1: ${res1.status}, Request 2: ${res2.status}`);

      const dbContent = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const overlapping = dbContent.reservations.filter(r =>
        String(r.flatId) === String(testFlatId) &&
        r.checkinDate === checkIn &&
        r.checkoutDate === checkOut &&
        r.status !== "cancelada" &&
        r.status !== "expirada"
      );

      console.log(`[CONCURRENCY EMPIRICAL RESULT] Overlapping active reservations in DB: ${overlapping.length}`);

      assert.strictEqual(statuses[0], 200, "One request must succeed with 200");
      assert.strictEqual(
        statuses[1],
        409,
        `The second concurrent request MUST fail with 409 Conflict, but got ${statuses[1]}. Both succeeded = double-booking race condition bug!`
      );
      assert.strictEqual(
        overlapping.length,
        1,
        `There must be exactly 1 reservation created in DB, but found ${overlapping.length}`
      );
    });

    it("3.2 High-concurrency burst challenge: 5 simultaneous pre-reservations for the same flat", async () => {
      const testFlatId = 8; // Flat 408
      const checkIn = "2027-02-01";
      const checkOut = "2027-02-05";

      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId: testFlatId,
            checkIn,
            checkOut,
            guestName: `Burst Requester ${i + 1}`,
            total: 800
          })
        })
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map(r => r.status);

      const count200 = statuses.filter(s => s === 200).length;
      const count409 = statuses.filter(s => s === 409).length;

      console.log(`[BURST CONCURRENCY RESULT] 200 OK: ${count200}, 409 Conflict: ${count409}, All statuses: ${statuses.join(", ")}`);

      const dbContent = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const overlapping = dbContent.reservations.filter(r =>
        String(r.flatId) === String(testFlatId) &&
        r.checkinDate === checkIn &&
        r.checkoutDate === checkOut &&
        r.status !== "cancelada" &&
        r.status !== "expirada"
      );

      assert.strictEqual(
        count200,
        1,
        `Exactly 1 request in the burst should succeed with 200 OK. Found ${count200} successes!`
      );
      assert.strictEqual(
        count409,
        4,
        `The other 4 requests in the burst should fail with 409 Conflict. Found ${count409} conflicts.`
      );
      assert.strictEqual(
        overlapping.length,
        1,
        `Database must contain exactly 1 reservation for this flat and date range, but found ${overlapping.length}`
      );
    });
  });
});
