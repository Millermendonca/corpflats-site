/**
 * Challenger 2 Final Clearance Stress Suite for Milestone M1
 * File: tests/challenger-m1-final-clearance-stress.test.mjs
 * Execution: node --test tests/challenger-m1-final-clearance-stress.test.mjs
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

const TEST_PORT = 3999;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-clearance-m1-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("CHALLENGER 2: M1 Final Clearance Stress Harness", () => {
  before(async () => {
    const rawProd = fs.readFileSync(prodDbPath, "utf-8");
    const testDb = JSON.parse(rawProd);

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
      handoverMessage: "Atendimento pausado para verificação.",
      updatedAt: new Date().toISOString()
    };

    // Pre-seed test reservations:
    testDb.reservations = testDb.reservations || [];

    // 1. Unpaid expired pre-reservation (flat 2, check-in 2027-03-01 to 2027-03-05)
    testDb.reservations.unshift({
      id: 80001,
      code: "CF-TEST-EXPIRED-80001",
      flatId: 2,
      flatNumber: "114",
      guestName: "Unpaid Expired Guest",
      checkinDate: "2027-03-01",
      checkoutDate: "2027-03-05",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pendente",
      totalAmount: 500,
      expiresAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
    });

    // 2. Paid pre-reservation past expiresAt (flat 4, check-in 2027-03-01 to 2027-03-05)
    testDb.reservations.unshift({
      id: 80002,
      code: "CF-TEST-PAID-80002",
      flatId: 4,
      flatNumber: "211",
      guestName: "Paid Expired-Hold Guest",
      checkinDate: "2027-03-01",
      checkoutDate: "2027-03-05",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pago_total",
      totalAmount: 650,
      expiresAt: new Date(Date.now() - 7200000).toISOString() // 2 hours ago
    });

    // 3. Status already "expirada" (flat 5, check-in 2027-03-10 to 2027-03-12)
    testDb.reservations.unshift({
      id: 80003,
      code: "CF-TEST-EXPIRED-STATUS-80003",
      flatId: 5,
      flatNumber: "212",
      guestName: "Explicit Expired Status Guest",
      checkinDate: "2027-03-10",
      checkoutDate: "2027-03-12",
      channel: "whatsapp",
      status: "expirada",
      paymentStatus: "pendente",
      totalAmount: 350,
      expiresAt: new Date(Date.now() - 3600000).toISOString()
    });

    // 4. Cancelled reservation (flat 6, check-in 2027-03-10 to 2027-03-12)
    testDb.reservations.unshift({
      id: 80004,
      code: "CF-TEST-CANCELLED-80004",
      flatId: 6,
      flatNumber: "215",
      guestName: "Cancelled Guest",
      checkinDate: "2027-03-10",
      checkoutDate: "2027-03-12",
      channel: "whatsapp",
      status: "cancelada",
      paymentStatus: "pendente",
      totalAmount: 350
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
  // 1. CONCURRENCY: 2 AND 5 PARALLEL REQUESTS
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Concurrency Verification: 2 & 5 Parallel Requests", () => {
    it("1.1 Concurrency N=2: Exactly 1 receives 200 OK and exactly 1 receives 409 CONFLICT", async () => {
      const flatId = 1; // Flat 113
      const checkIn = "2027-04-01";
      const checkOut = "2027-04-05";

      const promises = [1, 2].map(idx =>
        fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId,
            checkIn,
            checkOut,
            guestName: `Dual Concurrency Guest ${idx}`,
            total: 500
          })
        })
      );

      const responses = await Promise.all(promises);
      const statuses = responses.map(r => r.status);

      const count200 = statuses.filter(s => s === 200).length;
      const count409 = statuses.filter(s => s === 409).length;

      assert.strictEqual(count200, 1, `Expected exactly 1x 200 OK, got ${count200}`);
      assert.strictEqual(count409, 1, `Expected exactly 1x 409 CONFLICT, got ${count409}`);

      const conflictRes = responses.find(r => r.status === 409);
      const conflictBody = await conflictRes.json();
      assert.strictEqual(conflictBody.error, "FLAT_UNAVAILABLE");

      // Verify DB persistence count
      const db = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const activeRes = db.reservations.filter(r =>
        String(r.flatId) === String(flatId) &&
        r.checkinDate === checkIn &&
        r.checkoutDate === checkOut &&
        r.status === "pre_reserva"
      );
      assert.strictEqual(activeRes.length, 1, "DB must have exactly 1 active pre-reservation");
    });

    it("1.2 Concurrency N=5: Exactly 1 receives 200 OK and exactly 4 receive 409 CONFLICT", async () => {
      const flatId = 7; // Flat 313
      const checkIn = "2027-04-10";
      const checkOut = "2027-04-15";

      const promises = [1, 2, 3, 4, 5].map(idx =>
        fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId,
            checkIn,
            checkOut,
            guestName: `Burst Concurrency Guest ${idx}`,
            total: 750
          })
        })
      );

      const responses = await Promise.all(promises);
      const statuses = responses.map(r => r.status);

      const count200 = statuses.filter(s => s === 200).length;
      const count409 = statuses.filter(s => s === 409).length;

      assert.strictEqual(count200, 1, `Expected exactly 1x 200 OK, got ${count200}`);
      assert.strictEqual(count409, 4, `Expected exactly 4x 409 CONFLICT, got ${count409}`);

      for (const res of responses.filter(r => r.status === 409)) {
        const body = await res.json();
        assert.strictEqual(body.error, "FLAT_UNAVAILABLE");
      }

      const db = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const activeRes = db.reservations.filter(r =>
        String(r.flatId) === String(flatId) &&
        r.checkinDate === checkIn &&
        r.checkoutDate === checkOut &&
        r.status === "pre_reserva"
      );
      assert.strictEqual(activeRes.length, 1, "DB must have exactly 1 active pre-reservation");
    });

    it("1.3 Independent Parallel Requests for DIFFERENT flats: 4 simultaneous succeed with 200 OK", async () => {
      const pairs = [
        { flatId: 8, guest: "Guest A" },
        { flatId: 10, guest: "Guest B" },
        { flatId: 11, guest: "Guest C" },
        { flatId: 13, guest: "Guest D" }
      ];

      const checkIn = "2027-05-01";
      const checkOut = "2027-05-04";

      const promises = pairs.map(p =>
        fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId: p.flatId,
            checkIn,
            checkOut,
            guestName: p.guest,
            total: 450
          })
        })
      );

      const responses = await Promise.all(promises);
      for (const r of responses) {
        assert.strictEqual(r.status, 200, "Requests on distinct flats should not block each other");
      }
    });

    it("1.4 Date overlap collision: Req 1 (05-10 to 05-14) vs Req 2 (05-12 to 05-16) on same flat", async () => {
      const flatId = 12; // Flat 414
      const p1 = fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId,
          checkIn: "2027-05-10",
          checkOut: "2027-05-14",
          guestName: "Overlap Requester 1",
          total: 600
        })
      });

      const p2 = fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId,
          checkIn: "2027-05-12",
          checkOut: "2027-05-16",
          guestName: "Overlap Requester 2",
          total: 600
        })
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      const statuses = [res1.status, res2.status].sort();
      assert.strictEqual(statuses[0], 200);
      assert.strictEqual(statuses[1], 409);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PAID PRE-RESERVATION MAINTAINING BLOCK AFTER EXPIRESAT
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Paid Pre-Reservation Post-ExpiresAt Retention", () => {
    it("2.1 Paid pre-reservation (80002, Flat 211, past expiresAt) is NOT released by availability query", async () => {
      const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2027-03-01&checkOut=2027-03-05&guests=2`);
      assert.strictEqual(availRes.status, 200);
      const availData = await availRes.json();

      const flat211 = availData.flats.find(f => String(f.id) === "4" || String(f.number) === "211");
      assert.strictEqual(flat211, undefined, "Flat 211 must remain occupied/blocked even though expiresAt has passed, because paymentStatus is pago_total");

      // Verify that reservation 80002 in DB is still 'pre_reserva', NOT 'expirada'
      const db = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const r80002 = db.reservations.find(r => r.id === 80002);
      assert.strictEqual(r80002.status, "pre_reserva");
      assert.strictEqual(r80002.paymentStatus, "pago_total");
    });

    it("2.2 New pre-reservation on Flat 211 for overlapping dates is REJECTED with 409 FLAT_UNAVAILABLE", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 4,
          checkIn: "2027-03-02",
          checkOut: "2027-03-04",
          guestName: "Intruder Guest",
          total: 300
        })
      });

      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.error, "FLAT_UNAVAILABLE");
    });

    it("2.3 Committing the paid pre-reservation (80002) SUCCEEDS with 200 OK and status 'confirmada'", async () => {
      const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: 80002 })
      });

      assert.strictEqual(commitRes.status, 200);
      const commitData = await commitRes.json();
      assert.strictEqual(commitData.status, "confirmada");
      assert.strictEqual(commitData.success, true);

      // Verify in DB
      const db = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const r80002 = db.reservations.find(r => r.id === 80002);
      assert.strictEqual(r80002.status, "confirmada");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. REJECTION OF COMMIT FOR EXPIRED RESERVATIONS
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Strict Rejection of Commit for Expired Reservations", () => {
    it("3.1 Direct commit on unpaid reservation with past expiresAt (80001) is rejected with 400 PRE_RESERVATION_EXPIRED", async () => {
      const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: 80001 })
      });

      assert.strictEqual(commitRes.status, 400);
      const commitData = await commitRes.json();
      assert.strictEqual(commitData.error, "PRE_RESERVATION_EXPIRED");
      assert.ok(commitData.message.includes("expirou"), "Message must mention expiration");

      // Verify that status transitioned to 'expirada' in DB
      const db = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const r80001 = db.reservations.find(r => r.id === 80001);
      assert.strictEqual(r80001.status, "expirada");
    });

    it("3.2 Commit on already marked 'expirada' reservation (80003) is rejected with 400 PRE_RESERVATION_EXPIRED", async () => {
      const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: 80003 })
      });

      assert.strictEqual(commitRes.status, 400);
      const commitData = await commitRes.json();
      assert.strictEqual(commitData.error, "PRE_RESERVATION_EXPIRED");
    });

    it("3.3 Commit on cancelled reservation (80004) is rejected with 400 RESERVATION_CANCELLED", async () => {
      const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: 80004 })
      });

      assert.strictEqual(commitRes.status, 400);
      const commitData = await commitRes.json();
      assert.strictEqual(commitData.error, "RESERVATION_CANCELLED");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CONFIGURABLE HOLD MINUTES
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Configurable Hold Minutes Verification", () => {
    it("4.1 Hold = 10 minutes: response returns holdMinutes: 10 and expiresAt ~10m in the future", async () => {
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preReservationHoldMinutes: 10 })
      });

      const res = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 13, // Flat 501
          checkIn: "2027-06-01",
          checkOut: "2027-06-05",
          guestName: "10 Min Hold Guest",
          total: 400
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.holdMinutes, 10);

      const diffMin = Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 60000);
      assert.ok(diffMin >= 9 && diffMin <= 11, `Expected ~10 minutes diff, got ${diffMin}`);
    });

    it("4.2 Hold = 45 minutes: response returns holdMinutes: 45 and expiresAt ~45m in the future", async () => {
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preReservationHoldMinutes: 45 })
      });

      const res = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: 14, // Flat 502
          checkIn: "2027-06-10",
          checkOut: "2027-06-15",
          guestName: "45 Min Hold Guest",
          total: 550
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.holdMinutes, 45);

      const diffMin = Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 60000);
      assert.ok(diffMin >= 44 && diffMin <= 46, `Expected ~45 minutes diff, got ${diffMin}`);

      // Verify audit log in DB
      const db = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
      const r = db.reservations.find(resItem => resItem.id === data.reservationId);
      assert.ok(r.auditLogs.some(log => log.description.includes("hold de 45 minutos")));
    });

    it("4.3 Hold = 60 minutes: payment-link endpoint also respects the configured hold minutes", async () => {
      await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preReservationHoldMinutes: 60 })
      });

      const res = await fetch(`${BASE_URL}/api/bot-actions/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 300,
          guestName: "60 Min Payment Link Guest"
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const diffMin = Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 60000);
      assert.ok(diffMin >= 59 && diffMin <= 61, `Payment link expiresAt expected ~60 minutes diff, got ${diffMin}`);
    });
  });
});
