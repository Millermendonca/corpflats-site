/**
 * Test Suite: System Actions API, Master Switch, Granular Permissions & Autonomous Pipeline
 * File: tests/bot-actions-api.test.mjs
 * Execution: node --test tests/bot-actions-api.test.mjs
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

const TEST_PORT = 3996;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-bot-actions-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Bot Actions API & Master Switch Suite", () => {
  before(async () => {
    // 1. Prepare isolated test database
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    initialDb.botActionsSettings = {
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
    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server process
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

  it("1. Global Master Switch OFF: all 5 bot action endpoints return 403 ACTION_DISABLED with handover", async () => {
    // Disable master switch
    const setRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiActionsEnabled: false })
    });
    assert.strictEqual(setRes.status, 200);
    const setData = await setRes.json();
    assert.strictEqual(setData.settings.apiActionsEnabled, false);

    // 1. Availability
    const resAvail = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-10&checkOut=2026-11-12&guests=2`);
    assert.strictEqual(resAvail.status, 403);
    const dataAvail = await resAvail.json();
    assert.strictEqual(dataAvail.error, "ACTION_DISABLED");
    assert.strictEqual(dataAvail.action, "checkAvailability");
    assert.strictEqual(dataAvail.requiresHandover, true);
    assert.strictEqual(dataAvail.message, "Esta ação do sistema está pausada ou requer atendimento humano.");

    // 2. Quote
    const resQuote = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2, flatId: 1 })
    });
    assert.strictEqual(resQuote.status, 403);
    const dataQuote = await resQuote.json();
    assert.strictEqual(dataQuote.error, "ACTION_DISABLED");
    assert.strictEqual(dataQuote.action, "calculateQuote");
    assert.strictEqual(dataQuote.requiresHandover, true);

    // 3. Payment Link
    const resPay = await fetch(`${BASE_URL}/api/bot-actions/payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 350, guestName: "Teste" })
    });
    assert.strictEqual(resPay.status, 403);
    const dataPay = await resPay.json();
    assert.strictEqual(dataPay.error, "ACTION_DISABLED");
    assert.strictEqual(dataPay.action, "generatePayment");
    assert.strictEqual(dataPay.requiresHandover, true);

    // 4. Pre-reserve
    const resPre = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flatId: 1, checkIn: "2026-11-10", checkOut: "2026-11-12", guestName: "Teste", total: 400 })
    });
    assert.strictEqual(resPre.status, 403);
    const dataPre = await resPre.json();
    assert.strictEqual(dataPre.error, "ACTION_DISABLED");
    assert.strictEqual(dataPre.action, "createPreReservation");
    assert.strictEqual(dataPre.requiresHandover, true);

    // 5. Commit Reservation
    const resCommit = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: 1 })
    });
    assert.strictEqual(resCommit.status, 403);
    const dataCommit = await resCommit.json();
    assert.strictEqual(dataCommit.error, "ACTION_DISABLED");
    assert.strictEqual(dataCommit.action, "commitReservation");
    assert.strictEqual(dataCommit.requiresHandover, true);
  });

  it("2. Granular Action Switches: individual actions reject with 403 when their specific key is false", async () => {
    // Turn master switch ON, but turn off calculateQuote and commitReservation
    const setRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiActionsEnabled: true,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: false,
          generatePayment: true,
          createPreReservation: true,
          commitReservation: false
        }
      })
    });
    assert.strictEqual(setRes.status, 200);

    // Availability is allowed => 200 OK
    const resAvail = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-10&checkOut=2026-11-12&guests=2`);
    assert.strictEqual(resAvail.status, 200);
    const dataAvail = await resAvail.json();
    assert.strictEqual(dataAvail.success, true);
    assert.ok(dataAvail.available);

    // Quote is disabled => 403 ACTION_DISABLED
    const resQuote = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2, flatId: 1 })
    });
    assert.strictEqual(resQuote.status, 403);
    const dataQuote = await resQuote.json();
    assert.strictEqual(dataQuote.error, "ACTION_DISABLED");
    assert.strictEqual(dataQuote.action, "calculateQuote");

    // Commit is disabled => 403 ACTION_DISABLED
    const resCommit = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: 1 })
    });
    assert.strictEqual(resCommit.status, 403);
    const dataCommit = await resCommit.json();
    assert.strictEqual(dataCommit.error, "ACTION_DISABLED");
    assert.strictEqual(dataCommit.action, "commitReservation");
  });

  it("3. End-to-End Autonomous Pipeline: Availability -> Quote -> Pre-Reserve -> Payment Link -> Commit", async () => {
    // Enable all actions
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

    const checkIn = "2026-11-20";
    const checkOut = "2026-11-23"; // 3 nights

    // Step 1: Check Availability
    const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    assert.strictEqual(availRes.status, 200);
    const availData = await availRes.json();
    assert.strictEqual(availData.success, true);
    assert.ok(availData.available);
    assert.ok(availData.flats.length > 0);
    const selectedFlat = availData.flats[0];

    // Step 2: Calculate Quote
    const quoteRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn,
        checkOut,
        guests: 2,
        flatId: selectedFlat.id,
        channel: "direct",
        ratePlan: "room_only"
      })
    });
    assert.strictEqual(quoteRes.status, 200);
    const quoteData = await quoteRes.json();
    assert.strictEqual(quoteData.success, true);
    assert.strictEqual(quoteData.nights, 3);
    assert.strictEqual(quoteData.cleaningFee, 70); // room_only standard cleaning fee
    assert.ok(quoteData.roomTotal > 0);
    assert.strictEqual(quoteData.total, quoteData.roomTotal + quoteData.cleaningFee + quoteData.extraBedFee + quoteData.breakfastFee);
    assert.ok(quoteData.expiresAt);

    // Step 3: Create Pre-Reservation (Hold for 30 minutes)
    const preRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: selectedFlat.id,
        checkIn,
        checkOut,
        guestName: "Roberto Carlos Silva",
        guestPhone: "22998877665",
        guests: 2,
        channel: "whatsapp",
        total: quoteData.total
      })
    });
    assert.strictEqual(preRes.status, 200);
    const preData = await preRes.json();
    assert.strictEqual(preData.success, true);
    assert.strictEqual(preData.status, "pre_reserva");
    assert.strictEqual(preData.flatId, selectedFlat.id);
    assert.strictEqual(preData.total, quoteData.total);
    assert.ok(preData.code.startsWith("CF-"));
    assert.ok(preData.expiresAt);
    assert.ok(preData.pixCopiaECola);
    assert.ok(preData.qrCodeBase64.startsWith("data:image/png;base64,"));

    const reservationId = preData.reservationId;

    // Step 4: Generate/Refresh Payment Link PIX
    const payRes = await fetch(`${BASE_URL}/api/bot-actions/payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId,
        amount: quoteData.total,
        guestName: "Roberto Carlos Silva"
      })
    });
    assert.strictEqual(payRes.status, 200);
    const payData = await payRes.json();
    assert.strictEqual(payData.success, true);
    assert.strictEqual(payData.amount, quoteData.total);
    assert.ok(payData.pixCopiaECola.includes("br.gov.bcb.pix"));
    assert.ok(payData.qrCodeBase64.startsWith("data:image/png;base64,"));

    // Step 5: Commit Reservation to PMS (Confirmed & Locked UH)
    const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId
      })
    });
    assert.strictEqual(commitRes.status, 200);
    const commitData = await commitRes.json();
    assert.strictEqual(commitData.success, true);
    assert.strictEqual(commitData.status, "confirmada");
    assert.strictEqual(commitData.paymentStatus, "pago_total");
    assert.strictEqual(commitData.pmsConfirmed, true);

    // Verify UH is now locked for the same dates
    const checkAfterRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    const checkAfterData = await checkAfterRes.json();
    const isStillAvailable = checkAfterData.flats.some(f => String(f.id) === String(selectedFlat.id));
    assert.strictEqual(isStillAvailable, false, `Flat ${selectedFlat.number} should now be blocked/busy.`);
  });

  it("4. Overlapping pre-reserve attempts return 409 Conflict", async () => {
    // Attempting to pre-reserve flat 113 for already confirmed dates
    const conflictRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: 1,
        checkIn: "2026-11-20",
        checkOut: "2026-11-23",
        guestName: "Hóspede Conflito",
        total: 500
      })
    });
    assert.strictEqual(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.strictEqual(conflictData.error, "FLAT_UNAVAILABLE");
  });

  it("5. Expired pre-reservations (expiresAt in past) do NOT block availability", async () => {
    // Inject an expired pre-reservation directly into the test database
    const dbState = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    const pastExpiredRes = {
      id: 99999,
      code: "CF-EXPIRED-TEST",
      flatId: 2,
      flatNumber: "114",
      guestName: "Expired Test Guest",
      checkinDate: "2026-11-27",
      checkoutDate: "2026-11-29",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pendente",
      totalAmount: 400,
      expiresAt: new Date(Date.now() - 60000).toISOString() // 1 minute in the past
    };
    dbState.reservations.unshift(pastExpiredRes);
    fs.writeFileSync(isolatedDbPath, JSON.stringify(dbState, null, 2), "utf-8");

    // Call availability endpoint for flat 114 (id 2) dates
    const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-27&checkOut=2026-11-29&guests=2`);
    assert.strictEqual(availRes.status, 200);
    const availData = await availRes.json();
    assert.strictEqual(availData.success, true);

    // Flat 114 must be available because the pre-reservation hold is expired
    const flat114Available = availData.flats.some(f => String(f.id) === "2" || String(f.number) === "114");
    assert.strictEqual(flat114Available, true, "Flat 114 should be available after expired pre-reservation");
  });
});
