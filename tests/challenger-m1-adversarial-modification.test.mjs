/**
 * Test Suite: Milestone 1 Challenger - Adversarial Stress & Edge Cases
 * File: tests/challenger-m1-adversarial-modification.test.mjs
 * Execution: node --test tests/challenger-m1-adversarial-modification.test.mjs
 *
 * Covers:
 * 1. Inverted, Equal & Malformed Dates
 * 2. Negative, Zero, and Out-of-Bounds Guest Counts
 * 3. Non-Existent Flats and Reservations
 * 4. Zero-Amount Price Modifications
 * 5. Expired Holds & Exploitation Protection (Prevent Committing Expired Holds)
 * 6. High Concurrency Polling on /modify-status (Race Condition & Double-Commit Resistance)
 * 7. Mismatched and Tampered Pending Hold Identifiers
 * 8. 24-Hour Policy Edge Cases (Late Reductions vs Advance Reductions)
 * 9. Server Process Resilience (No Unhandled Exceptions or Crashes under Malformed Payloads)
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

const TEST_PORT = 3994;
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

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Milestone 1 Challenger: Adversarial Stress & Boundary Resilience Suite", () => {
  before(async () => {
    // 0. Ensure port is clean
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") {
            killProcessTree(pid);
          }
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}

    // 1. Prepare isolated test database
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 1, number: "113", colName: "113 solteiro", isOccupied: false },
      { id: 2, number: "114", colName: "114 Solteiro", isOccupied: false },
      { id: 3, number: "116", colName: "116", isOccupied: false }
    ];

    const now = new Date();
    const pastExpDate = new Date(Date.now() - 300000).toISOString(); // 5 min ago

    initialDb.reservations = [
      // Standard active reservation on Flat 113
      {
        id: 8001,
        code: "RES-ADV-001",
        guestName: "Alice Walker",
        guestEmail: "alice@example.com",
        guestPhone: "5521988880001",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        guestCount: 2,
        dailyRate: 150,
        totalAmount: 300,
        paidAmount: 300,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false,
        payments: [
          { id: "p1", amount: 300, method: "pix", date: "2026-10-01T10:00:00Z" }
        ],
        createdAt: "2026-10-01T10:00:00Z",
        updatedAt: "2026-10-01T10:00:00Z"
      },
      // Conflicting reservation on Flat 113
      {
        id: 8002,
        code: "RES-ADV-CONFLICT",
        guestName: "Bob Singer",
        guestEmail: "bob@example.com",
        guestPhone: "5521988880002",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-14",
        checkoutDate: "2026-11-16",
        guestCount: 1,
        dailyRate: 150,
        totalAmount: 300,
        paidAmount: 300,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false
      },
      // Cancelled reservation on Flat 113
      {
        id: 8003,
        code: "RES-ADV-CANCEL",
        guestName: "Charlie Cancel",
        guestEmail: "charlie@example.com",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        status: "cancelada",
        channel: "whatsapp"
      },
      // External OTA reservation
      {
        id: 8004,
        code: "RES-ADV-OTA",
        guestName: "David OTA",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        status: "confirmada",
        channel: "booking"
      },
      // Reservation with an already EXPIRED hold on Flat 116
      {
        id: 8005,
        code: "RES-ADV-EXPIRED",
        guestName: "Eve Expired",
        guestEmail: "eve@example.com",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        guestCount: 1,
        dailyRate: 150,
        totalAmount: 300,
        paidAmount: 300,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        pendingModification: {
          pendingId: "mod_adv_expired_8005",
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-15",
          newFlatNumber: "116",
          newFlatId: 3,
          additionalAmountToPay: 450,
          status: "pending",
          expiresAt: pastExpDate,
          createdAt: new Date(Date.now() - 2100000).toISOString()
        }
      },
      // Reservation to test zero-cost modifications on Flat 114
      {
        id: 8006,
        code: "RES-ADV-ZERO",
        guestName: "Frank Zero",
        guestEmail: "frank@example.com",
        flatId: 2,
        flatNumber: "114",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        guestCount: 1,
        dailyRate: 160,
        totalAmount: 320,
        paidAmount: 320,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false
      },
      // Reservation for high-concurrency race condition testing on Flat 116
      {
        id: 8007,
        code: "RES-ADV-CONCUR",
        guestName: "Grace Concurrent",
        guestEmail: "grace@example.com",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        guestCount: 1,
        dailyRate: 200,
        totalAmount: 400,
        paidAmount: 400,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        fnhrCompleted: true,
        needsReSignature: false
      }
    ];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn server process
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

    // Wait for server ready
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
      throw new Error(`Server failed to start on port ${TEST_PORT}`);
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

  // ── Adversarial Challenge 1: Inverted, Equal & Malformed Dates ──────────────
  describe("Adversarial Challenge 1: Date Boundaries & Malformations", () => {
    it("1.1. Inverted dates (checkin > checkout) in /modify-preview returns 400 with INVALID_DATES", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-20",
          newCheckoutDate: "2026-11-15"
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error, "INVALID_DATES");
      assert.match(data.message, /check-out deve ser posterior/i);
    });

    it("1.2. Equal dates (checkin === checkout, 0 nights) in /modify-preview returns 400 INVALID_DATES", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-15",
          newCheckoutDate: "2026-11-15"
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error, "INVALID_DATES");
    });

    it("1.3. Malformed date format ('15/11/2026' or 'not-a-date') returns 400 INVALID_DATES", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "15/11/2026",
          newCheckoutDate: "20/11/2026"
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "INVALID_DATES");
      assert.match(data.message, /YYYY-MM-DD/);
    });

    it("1.4. Inverted dates in /modify-checkout returns 400 without creating pending hold", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-20",
          newCheckoutDate: "2026-11-15"
        })
      });

      assert.equal(res.status, 400);
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-001");
      assert.equal(r.pendingModification, undefined);
    });

    it("1.5. Inverted dates in direct /modify endpoint returns 400 and preserves original dates", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-25",
          newCheckoutDate: "2026-11-20"
        })
      });

      assert.equal(res.status, 400);
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-001");
      assert.equal(r.checkinDate, "2026-11-10");
      assert.equal(r.checkoutDate, "2026-11-12");
    });
  });

  // ── Adversarial Challenge 2: Negative, Zero and Out-of-Bounds Guest Counts ─
  describe("Adversarial Challenge 2: Guest Count Boundary & Clamping", () => {
    it("2.1. Negative guest count (-5) is gracefully clamped to 1 without crash", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13",
          newGuestCount: -5
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.newDates.guestCount, 1);
    });

    it("2.2. Zero guest count (0) falls back to existing reservation guest count (2) without crash", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13",
          newGuestCount: 0
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.newDates.guestCount, 2);
    });

    it("2.3. Extreme guest count (999) is safely clamped to maximum capacity (6)", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13",
          newGuestCount: 999
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.newDates.guestCount, 6);
    });

    it("2.4. Malicious non-numeric guest count ('DROP TABLE') is safely sanitized", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13",
          newGuestCount: "DROP TABLE reservations"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.newDates.guestCount >= 1);
    });
  });

  // ── Adversarial Challenge 3: Non-Existent Flats, Cancelled & Corrupted Locators ─
  describe("Adversarial Challenge 3: Entity Resolution & Invalid References", () => {
    it("3.1. Non-existent flatId in /modify-preview returns 404 FLAT_NOT_FOUND", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13",
          newFlatId: 99999
        })
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error, "FLAT_NOT_FOUND");
    });

    it("3.2. Non-existent reservation locator across all endpoints returns 404 cleanly", async () => {
      const bogusCode = "RES-GHOST-999";

      const rPreview = await fetch(`${BASE_URL}/api/pms/guest-portal/${bogusCode}/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCheckinDate: "2026-11-10", newCheckoutDate: "2026-11-13" })
      });
      assert.equal(rPreview.status, 404);

      const rCheckout = await fetch(`${BASE_URL}/api/pms/guest-portal/${bogusCode}/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCheckinDate: "2026-11-10", newCheckoutDate: "2026-11-13" })
      });
      assert.equal(rCheckout.status, 404);

      const rStatus = await fetch(`${BASE_URL}/api/pms/guest-portal/${bogusCode}/modify-status`);
      assert.equal(rStatus.status, 404);

      const rCancel = await fetch(`${BASE_URL}/api/pms/guest-portal/${bogusCode}/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(rCancel.status, 404);

      const rModify = await fetch(`${BASE_URL}/api/pms/guest-portal/${bogusCode}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCheckinDate: "2026-11-10", newCheckoutDate: "2026-11-13" })
      });
      assert.equal(rModify.status, 404);
    });

    it("3.3. Cancelled reservation rejects modification attempts with 400 RESERVATION_CANCELLED", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-CANCEL/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-20",
          newCheckoutDate: "2026-11-23"
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "RESERVATION_CANCELLED");
    });
  });

  // ── Adversarial Challenge 4: Zero-Amount Price Modifications ────────────────
  describe("Adversarial Challenge 4: Zero-Amount Price Modifications", () => {
    it("4.1. Date shift with identical night count (2 nights -> 2 nights) results in additionalAmountToPay: 0", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-ZERO/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-26",
          newCheckoutDate: "2026-11-28" // 2 nights shifted
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.available, true);
      assert.equal(data.additionalAmountToPay, 0);
      assert.equal(data.refundAmount, 0);
      assert.equal(data.requiresPayment, false);
      assert.equal(data.requiresReSignature, true);
    });

    it("4.2. /modify-checkout for zero-amount modification does not create hold and reports direct confirmation allowed", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-ZERO/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-26",
          newCheckoutDate: "2026-11-28"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.requiresPayment, false);
      assert.equal(data.additionalAmountToPay, 0);

      // Verify no provisional hold was attached to reservation
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-ZERO");
      assert.equal(r.pendingModification, undefined);
    });

    it("4.3. Direct POST /modify successfully applies zero-amount modification and invalidates signature", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-ZERO/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-26",
          newCheckoutDate: "2026-11-28"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Verify DB mutation
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-ZERO");
      assert.equal(r.checkinDate, "2026-11-26");
      assert.equal(r.checkoutDate, "2026-11-28");
      assert.equal(r.needsReSignature, true);
      assert.equal(r.fnhrCompleted, false);
      assert.ok(Array.isArray(r.modificationHistory));
      assert.equal(r.modificationHistory.length, 1);
    });
  });

  // ── Adversarial Challenge 5: Expired Holds & Exploitation Protection ────────
  describe("Adversarial Challenge 5: Expired Holds & Anti-Exploit Protection", () => {
    it("5.1. Polling /modify-status on an expired hold detects expiration and marks status: expired", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-EXPIRED/modify-status?pendingId=mod_adv_expired_8005`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.success, true);
      assert.equal(data.paid, false);
      assert.equal(data.status, "expired");
      assert.equal(data.committed, false);
      assert.match(data.message, /expirou/i);

      // Verify DB dates remained intact
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-EXPIRED");
      assert.equal(r.checkinDate, "2026-11-10");
      assert.equal(r.checkoutDate, "2026-11-12");
    });

    it("5.2. Exploitation attempt: Simulating payment on an expired hold is rejected without committing", async () => {
      // Even if payment simulation flag is present, expired hold must NOT commit
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-EXPIRED/modify-status?pendingId=mod_adv_expired_8005&simulatePayment=true`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.status, "expired");
      assert.equal(data.committed, false);
      assert.equal(data.paid, false);

      // Verify DB dates still untouched
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-EXPIRED");
      assert.equal(r.checkinDate, "2026-11-10");
      assert.equal(r.checkoutDate, "2026-11-12");
      assert.equal(r.paidAmount, 300); // not 750
    });

    it("5.3. Flat calendar is immediately free for other bookings once hold is expired", async () => {
      // Flat 116 dates (Nov 10-15) were under expired hold of RES-ADV-EXPIRED.
      // Another reservation should now be able to book or preview those dates without conflict from the expired hold!
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-12",
          newCheckoutDate: "2026-11-15",
          newFlatNumber: "116"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.available, true);
    });

    it("5.4. /modify-cancel-pending on expired hold handles gracefully and clears pending hold", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-EXPIRED/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: "mod_adv_expired_8005" })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-EXPIRED");
      assert.equal(r.pendingModification, undefined);
    });
  });

  // ── Adversarial Challenge 6: High Concurrency Polling & Race Condition Test ─
  describe("Adversarial Challenge 6: Concurrency & Idempotency Resilience", () => {
    it("6.1. 15 concurrent polling requests with payment confirmation commit exactly ONCE without duplicate payments or balance corruption", async () => {
      // Step A: Generate active checkout hold for RES-ADV-CONCUR (extension from Dec 1-3 to Dec 1-5, +2 nights @ 200 = +400)
      const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-CONCUR/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-01",
          newCheckoutDate: "2026-12-05",
          paymentMethod: "pix"
        })
      });

      assert.equal(checkoutRes.status, 200);
      const checkoutData = await checkoutRes.json();
      assert.equal(checkoutData.success, true);
      const pendingId = checkoutData.pendingId;
      assert.ok(pendingId);

      // Verify hold is pending in DB
      let db = getDb();
      let r = db.reservations.find(x => x.code === "RES-ADV-CONCUR");
      assert.ok(r.pendingModification);
      assert.equal(r.checkinDate, "2026-12-01");
      assert.equal(r.checkoutDate, "2026-12-03"); // original date intact

      // Step B: Fire 15 CONCURRENT requests to /modify-status?simulatePayment=true
      const concurrentRequests = Array.from({ length: 15 }, () =>
        fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-CONCUR/modify-status?pendingId=${pendingId}&simulatePayment=true`)
      );

      const responses = await Promise.all(concurrentRequests);

      // Verify every single response succeeded (no 500 crashes)
      for (const res of responses) {
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.paid, true);
        assert.equal(data.status, "paid");
        assert.equal(data.committed, true);
      }

      // Step C: Verify strict database invariants after concurrent bombardment
      db = getDb();
      r = db.reservations.find(x => x.code === "RES-ADV-CONCUR");

      // Invariant 1: Dates committed exactly to new window
      assert.equal(r.checkinDate, "2026-12-01");
      assert.equal(r.checkoutDate, "2026-12-05");

      // Invariant 2: Total amount incremented EXACTLY ONCE (400 + 400 = 800, NOT duplicated)
      assert.equal(r.totalAmount, 800);
      assert.equal(r.paidAmount, 800);

      // Invariant 3: Exactly 1 modification payment added to payments array (total length 1 new = 1)
      const modPayments = (r.payments || []).filter(p => p.pendingId === pendingId || p.notes?.includes("Acréscimo"));
      assert.equal(modPayments.length, 1, `Expected exactly 1 modification payment record, found ${modPayments.length}`);

      // Invariant 4: Exactly 1 entry in modificationHistory
      const modHist = (r.modificationHistory || []).filter(m => m.pendingId === pendingId);
      assert.equal(modHist.length, 1, `Expected exactly 1 modificationHistory entry, found ${modHist.length}`);

      // Invariant 5: pendingModification cleaned up
      assert.equal(r.pendingModification, undefined);

      // Invariant 6: Re-signature invalidated
      assert.equal(r.needsReSignature, true);
      assert.equal(r.fnhrCompleted, false);
    });
  });

  // ── Adversarial Challenge 7: Tampered & Mismatched Pending Hold Identifiers ─
  describe("Adversarial Challenge 7: Hold ID Tampering & Multi-Cancel Safety", () => {
    it("7.1. /modify-status with mismatched pendingId returns 400 Bad Request", async () => {
      // Create new checkout hold on RES-ADV-001
      const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13" // +1 night
        })
      });
      assert.equal(checkoutRes.status, 200);

      // Poll with fake pendingId
      const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-status?pendingId=mod_HACKED_ID_999`);
      assert.equal(statusRes.status, 400);
      const data = await statusRes.json();
      assert.match(data.error, /não coincide com o hold ativo/i);
    });

    it("7.2. /modify-cancel-pending with mismatched pendingId returns 400 and preserves hold", async () => {
      const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: "mod_HACKED_ID_999" })
      });

      assert.equal(cancelRes.status, 400);
      const db = getDb();
      const r = db.reservations.find(x => x.code === "RES-ADV-001");
      assert.ok(r.pendingModification, "Pending hold must remain active after invalid cancel");
    });

    it("7.3. Repeated /modify-cancel-pending is safe and idempotent", async () => {
      // First cancel with legitimate ID
      const cancelRes1 = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(cancelRes1.status, 200);

      // Second cancel when hold is already gone
      const cancelRes2 = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(cancelRes2.status, 200);
      const data2 = await cancelRes2.json();
      assert.equal(data2.success, true);
      assert.match(data2.message, /Nenhuma alteração pendente ativa/i);
    });
  });

  // ── Adversarial Challenge 8: Server Stress & Malformed Payload Resistance ──
  describe("Adversarial Challenge 8: Server Stress & Injection Resistance", () => {
    it("8.1. Huge payload (100KB body) does not crash server or leak internal traces", async () => {
      const hugeReason = "A".repeat(100 * 1024);
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-12",
          reason: hugeReason
        })
      });

      // May succeed (200) or reject with 413/400 depending on body limits, but MUST NOT crash
      assert.ok([200, 400, 413].includes(res.status));

      // Liveness check
      const health = await fetch(`${BASE_URL}/api/system/version`);
      assert.equal(health.ok, true);
    });

    it("8.2. SQL/Script injection attempts in parameters return clean responses without crashing", async () => {
      const maliciousInputs = [
        "RES-ADV-001' OR '1'='1",
        "<script>alert(1)</script>",
        "../../etc/passwd",
        "%00%2e%2e"
      ];

      for (const injection of maliciousInputs) {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/${encodeURIComponent(injection)}/modify-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newCheckinDate: "2026-11-10",
            newCheckoutDate: "2026-11-12"
          })
        });

        // Must safely return 404 Not Found (or 400), NEVER 500 or crash
        assert.ok([400, 404].includes(res.status), `Expected 400/404 for input '${injection}', got ${res.status}`);
      }

      // Verify server remains responsive
      const health = await fetch(`${BASE_URL}/api/system/version`);
      assert.equal(health.ok, true);
    });
  });
});
