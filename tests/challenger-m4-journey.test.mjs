/**
 * Adversarial Challenger 1 Suite: End-to-End Guest Journey & Master Switch Enforcement
 * File: tests/challenger-m4-journey.test.mjs
 * Execution: node --test tests/challenger-m4-journey.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  executeBotAction,
  buildGeminiTools,
  generateAiWhatsAppResponse
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3997;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger-m4-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function verifyBacenPixCrc16(payload) {
  assert.ok(payload.length > 10, "PIX payload too short");
  assert.ok(payload.startsWith("000201"), "PIX payload must start with 000201");
  const crcIndex = payload.lastIndexOf("6304");
  assert.ok(crcIndex !== -1, "PIX payload must contain 6304 tag");
  const toCrc = payload.substring(0, crcIndex + 4);
  const expectedCrc = payload.substring(crcIndex + 4);

  let crc = 0xFFFF;
  for (let i = 0; i < toCrc.length; i++) {
    crc ^= (toCrc.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const calculatedCrc = crc.toString(16).toUpperCase().padStart(4, "0");
  assert.strictEqual(calculatedCrc, expectedCrc, `CRC16 mismatch: expected ${expectedCrc}, got ${calculatedCrc}`);
  return true;
}

function parseEmvTlv(payload) {
  const tags = {};
  let i = 0;
  while (i < payload.length - 8) { // omit final 6304XXXX
    const id = payload.substring(i, i + 2);
    const len = parseInt(payload.substring(i + 2, i + 4), 10);
    const val = payload.substring(i + 4, i + 4 + len);
    tags[id] = val;
    i += 4 + len;
  }
  return tags;
}

describe("Challenger M4: End-to-End Guest Journey & Kill Switch Stress Harness", () => {
  before(async () => {
    // 1. Prepare isolated test database seeded with flats, settings and initial state
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
    initialDb.tariffSettings = {
      mode: "auto",
      baseDailyRate: 237,
      currency: "BRL",
      minNights: 1,
      weekendMarkupPct: 0.15,
      channelMarkups: {
        direct: { channelName: "Venda Direta / Site / WhatsApp", markupPct: 0.0, commissionPct: 0.0, discountPct: 0.15 },
        booking: { channelName: "Booking.com", markupPct: 0.18, commissionPct: 0.18, discountPct: 0.0 },
        airbnb: { channelName: "Airbnb", markupPct: 0.15, commissionPct: 0.15, discountPct: 0.0 }
      },
      updatedAt: new Date().toISOString()
    };
    initialDb.tariffOverrides = [];
    initialDb.siteConfig = {
      ...initialDb.siteConfig,
      ratePlans: {
        room_only: { name: "Apenas Hospedagem", cleaningFeeEnabled: true, cleaningFeeAmount: 70 },
        with_breakfast: { name: "Com Café da Manhã", dailyRate: 225, cleaningFeeEnabled: false, cleaningFeeAmount: 0 }
      },
      extraBedConfig: {
        enabled: true,
        feeAmount: 60,
        maxGuests: 3
      }
    };
    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server
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

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: CONSULTA DE DISPONIBILIDADE
  // ─────────────────────────────────────────────────────────────────────────────

  it("Probe 1.1: Availability with multi-guest constraints and capacity boundaries", async () => {
    const checkIn = "2026-11-10";
    const checkOut = "2026-11-12";

    // 1 Guest -> should be available
    const res1 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=1`);
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.available, true);
    assert.ok(data1.flats.length > 0);

    // 2 Guests -> should be available
    const res2 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.available, true);

    // 3 Guests -> within maxCapacity (3 with extra bed) -> available
    const res3 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=3`);
    assert.strictEqual(res3.status, 200);
    const data3 = await res3.json();
    assert.strictEqual(data3.available, true);

    // 4 Guests -> exceeds maxCapacity (3) -> returns available: false and empty flats
    const res4 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=4`);
    assert.strictEqual(res4.status, 200);
    const data4 = await res4.json();
    assert.strictEqual(data4.available, false);
    assert.strictEqual(data4.flats.length, 0);

    // Invalid dates: checkIn >= checkOut -> HTTP 400 INVALID_DATE_RANGE
    const resInv = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-12&checkOut=2026-11-10`);
    assert.strictEqual(resInv.status, 400);
    const dataInv = await resInv.json();
    assert.strictEqual(dataInv.error, "INVALID_DATE_RANGE");

    // Missing dates -> HTTP 400 MISSING_DATES
    const resMiss = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-11-10`);
    assert.strictEqual(resMiss.status, 400);
    const dataMiss = await resMiss.json();
    assert.strictEqual(dataMiss.error, "MISSING_DATES");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: COTAÇÃO COM TARIFA SEBRAE & ACRÉSCIMOS
  // ─────────────────────────────────────────────────────────────────────────────

  it("Probe 1.2: Quote calculation with SEBRAE base rate, weekend markup, channel and additionals", async () => {
    // 3 nights spanning Thursday, Friday, Saturday (2026-11-05 to 2026-11-08)
    const checkIn = "2026-11-05";
    const checkOut = "2026-11-08";

    // 1. Direct channel, room_only, 2 guests
    const quoteRes1 = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn,
        checkOut,
        guests: 2,
        channel: "direct",
        ratePlan: "room_only"
      })
    });
    assert.strictEqual(quoteRes1.status, 200);
    const q1 = await quoteRes1.json();
    assert.strictEqual(q1.success, true);
    assert.strictEqual(q1.nights, 3);
    assert.strictEqual(q1.cleaningFee, 70);
    assert.strictEqual(q1.extraBedFee, 0);
    assert.strictEqual(q1.breakfastFee, 0);
    assert.strictEqual(q1.total, q1.roomTotal + 70);

    // Verify daily rates breakdown:
    // 2026-11-05 is Thursday (weekday)
    // 2026-11-06 is Friday (weekend markup ~15%)
    // 2026-11-07 is Saturday (weekend markup ~15%)
    assert.strictEqual(q1.dailyRates.length, 3);
    const thuRate = q1.dailyRates[0].rate;
    const friRate = q1.dailyRates[1].rate;
    const satRate = q1.dailyRates[2].rate;
    assert.ok(friRate > thuRate, "Friday should have weekend markup");
    assert.strictEqual(friRate, satRate, "Friday and Saturday should have equal weekend markup");
    assert.ok(Math.abs((friRate / thuRate) - 1.15) < 0.02, "Weekend markup should be ~15%");

    // 2. Booking channel, with_breakfast, 3 guests (extra bed + breakfast)
    const quoteRes2 = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn,
        checkOut,
        guests: 3,
        channel: "booking",
        ratePlan: "with_breakfast"
      })
    });
    assert.strictEqual(quoteRes2.status, 200);
    const q2 = await quoteRes2.json();
    assert.strictEqual(q2.success, true);
    // In with_breakfast: cleaningFee is 0, extraBedFee is 60 (since guests > 2), breakfastFee is 35 * 3 = 105
    assert.strictEqual(q2.cleaningFee, 0);
    assert.strictEqual(q2.extraBedFee, 60);
    assert.strictEqual(q2.breakfastFee, 105);
    // Booking daily rates should reflect +18% channel markup over direct
    const thuBookingRate = q2.dailyRates[0].rate;
    assert.ok(Math.abs((thuBookingRate / thuRate) - 1.18) < 0.02, "Booking channel markup should be +18%");
    assert.strictEqual(q2.total, Math.round((q2.roomTotal + 0 + 60 + 105) * 100) / 100);

    // 3. Stay > 90 nights rejected with MAX_STAY_EXCEEDED
    const quoteResLong = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn: "2026-01-01",
        checkOut: "2026-05-01", // 120 nights
        guests: 2
      })
    });
    assert.strictEqual(quoteResLong.status, 400);
    const qLong = await quoteResLong.json();
    assert.strictEqual(qLong.error, "MAX_STAY_EXCEEDED");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: PRÉ-RESERVA COM HOLD TEMPORÁRIO & PREVENÇÃO DE CONFLITO
  // ─────────────────────────────────────────────────────────────────────────────

  let createdPreReservation = null;

  it("Probe 1.3: Pre-reservation creates temporary hold, generates locator and enforces conflict lock", async () => {
    const checkIn = "2026-11-15";
    const checkOut = "2026-11-18";

    // 1. Availability check confirms flat 1 (Flat 113) is available
    const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    const availData = await availRes.json();
    const targetFlat = availData.flats.find(f => String(f.id) === "1" || String(f.number) === "113") || availData.flats[0];
    assert.ok(targetFlat, "Target flat must be available initially");

    // 2. Create pre-reservation with 30-min hold
    const preRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: targetFlat.id,
        checkIn,
        checkOut,
        guestName: "Marina Mendonça Silva",
        guestPhone: "22998505276",
        guests: 2,
        total: 850
      })
    });
    assert.strictEqual(preRes.status, 200);
    const preData = await preRes.json();
    assert.strictEqual(preData.success, true);
    assert.strictEqual(preData.status, "pre_reserva");
    assert.strictEqual(preData.total, 850);
    assert.strictEqual(preData.flatId, targetFlat.id);
    assert.ok(preData.code.startsWith("CF-"));
    assert.ok(preData.expiresAt);

    // Verify hold duration (~30 minutes from now)
    const holdMs = new Date(preData.expiresAt).getTime() - Date.now();
    assert.ok(holdMs > 28 * 60 * 1000 && holdMs <= 31 * 60 * 1000, `Hold duration should be ~30min, got ${holdMs / 60000}m`);

    createdPreReservation = preData;

    // 3. Immediate availability check: target flat is now blocked by temporary hold!
    const availCheck2 = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`);
    const availData2 = await availCheck2.json();
    const isStillAvailable = availData2.flats.some(f => String(f.id) === String(targetFlat.id));
    assert.strictEqual(isStillAvailable, false, `Flat ${targetFlat.number} must be blocked by temporary hold`);

    // 4. Overlapping pre-reservation attempt on same flat returns HTTP 409 Conflict
    const conflictRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: targetFlat.id,
        checkIn: "2026-11-16", // overlaps
        checkOut: "2026-11-17",
        guestName: "Outro Hóspede",
        total: 400
      })
    });
    assert.strictEqual(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.strictEqual(conflictData.error, "FLAT_UNAVAILABLE");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: COBRANÇA PIX COM PAYLOAD VÁLIDO & QR CODE
  // ─────────────────────────────────────────────────────────────────────────────

  it("Probe 1.4: PIX payload complies with Bacen BR Code EMV standard, valid CRC16 and valid PNG QR Code", async () => {
    assert.ok(createdPreReservation, "Pre-reservation must exist");

    // 1. Generate/Refresh payment link for the pre-reservation
    const payRes = await fetch(`${BASE_URL}/api/bot-actions/payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: createdPreReservation.reservationId,
        amount: createdPreReservation.total,
        guestName: "Marina Mendonça Silva"
      })
    });
    assert.strictEqual(payRes.status, 200);
    const payData = await payRes.json();
    assert.strictEqual(payData.success, true);
    assert.strictEqual(payData.amount, createdPreReservation.total);

    // 2. Validate PIX Payload structure and CRC16 checksum
    const pixStr = payData.pixCopiaECola;
    assert.ok(pixStr, "PIX copia-e-cola string must not be empty");
    assert.doesNotThrow(() => verifyBacenPixCrc16(pixStr), "PIX CRC16 must be mathematically valid");

    const tlv = parseEmvTlv(pixStr);
    assert.strictEqual(tlv["00"], "01", "Payload format indicator must be 01");
    assert.ok(tlv["26"].includes("br.gov.bcb.pix"), "Merchant Account GUI must be br.gov.bcb.pix");
    assert.strictEqual(tlv["53"], "986", "Transaction currency must be 986 (BRL)");
    assert.strictEqual(tlv["54"], Number(createdPreReservation.total).toFixed(2), "Amount tag must match total amount");
    assert.strictEqual(tlv["58"], "BR", "Country code must be BR");
    assert.ok(tlv["59"], "Merchant name tag must be present");
    assert.ok(tlv["60"], "Merchant city tag must be present");
    assert.ok(tlv["62"], "Additional Data Field (txid) must be present");

    // 3. Validate QR Code base64 image
    const qr = payData.qrCodeBase64;
    assert.ok(qr.startsWith("data:image/png;base64,"), "QR Code must be a base64 PNG data URL");
    const base64Bytes = qr.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Bytes, "base64");
    // Verify PNG magic header: 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'
    assert.strictEqual(buffer[0], 0x89);
    assert.strictEqual(buffer[1], 0x50); // P
    assert.strictEqual(buffer[2], 0x4E); // N
    assert.strictEqual(buffer[3], 0x47); // G
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: COMMIT DA RESERVA NO PMS E BLOQUEIO DEFINITIVO
  // ─────────────────────────────────────────────────────────────────────────────

  it("Probe 1.5: Commit transitions pre-reservation to confirmed PMS state and permanently locks calendar", async () => {
    assert.ok(createdPreReservation, "Pre-reservation must exist");

    // 1. Commit reservation to PMS
    const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: createdPreReservation.reservationId
      })
    });
    assert.strictEqual(commitRes.status, 200);
    const commitData = await commitRes.json();
    assert.strictEqual(commitData.success, true);
    assert.strictEqual(commitData.status, "confirmada");
    assert.strictEqual(commitData.paymentStatus, "pago_total");
    assert.strictEqual(commitData.pmsConfirmed, true);

    // 2. Calendar check: UH is permanently locked for the reservation dates
    const checkAfter = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${createdPreReservation.checkIn}&checkOut=${createdPreReservation.checkOut}&guests=2`);
    const checkData = await checkAfter.json();
    const isAvailable = checkData.flats.some(f => String(f.id) === String(createdPreReservation.flatId));
    assert.strictEqual(isAvailable, false, "Committed flat must remain locked permanently");

    // 3. Adjoining dates (e.g. check-out onwards or before check-in) remain available
    const checkAdjoining = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=${createdPreReservation.checkOut}&checkOut=2026-11-20&guests=2`);
    const checkAdjData = await checkAdjoining.json();
    const isAdjAvailable = checkAdjData.flats.some(f => String(f.id) === String(createdPreReservation.flatId));
    assert.strictEqual(isAdjAvailable, true, "Adjoining dates starting at check-out must be available");

    // 4. Double commit idempotency / conflict handling
    // Once confirmed, a second commit on the same reservation simply remains confirmed
    const secondCommit = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: createdPreReservation.reservationId
      })
    });
    assert.strictEqual(secondCommit.status, 200);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 6: DESAFIO DA CHAVE MESTRA (KILL SWITCH) & HANDOVER CORDIAL
  // ─────────────────────────────────────────────────────────────────────────────

  it("Probe 2.1: Master Kill Switch OFF disables all actions with HTTP 403 ACTION_DISABLED and courteous handover", async () => {
    // 1. Deactivate master switch
    const setRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiActionsEnabled: false,
        handoverMessage: "O atendimento automatizado de reservas está temporariamente pausado. Nossa equipe de recepção dará continuidade com você!"
      })
    });
    assert.strictEqual(setRes.status, 200);

    // 2. Challenge all 5 endpoints:
    const endpoints = [
      { name: "checkAvailability", method: "GET", url: `${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-03` },
      { name: "calculateQuote", method: "POST", url: `${BASE_URL}/api/bot-actions/quote`, body: { checkIn: "2026-12-01", checkOut: "2026-12-03" } },
      { name: "createPreReservation", method: "POST", url: `${BASE_URL}/api/bot-actions/pre-reserve`, body: { flatId: 1, checkIn: "2026-12-01", checkOut: "2026-12-03", guestName: "Teste" } },
      { name: "generatePayment", method: "POST", url: `${BASE_URL}/api/bot-actions/payment-link`, body: { amount: 300 } },
      { name: "commitReservation", method: "POST", url: `${BASE_URL}/api/bot-actions/commit-reservation`, body: { reservationId: 1 } }
    ];

    for (const ep of endpoints) {
      const opts = { method: ep.method };
      if (ep.body) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(ep.body);
      }
      const res = await fetch(ep.url, opts);
      assert.strictEqual(res.status, 403, `Endpoint ${ep.name} must return HTTP 403 when kill switch is OFF`);
      const data = await res.json();
      assert.strictEqual(data.error, "ACTION_DISABLED");
      assert.strictEqual(data.action, ep.name);
      assert.strictEqual(data.requiresHandover, true);
      assert.ok(data.message.includes("recepção"), "Handover message must be returned");
    }

    // 3. Reactivate master switch
    const restoreRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiActionsEnabled: true })
    });
    assert.strictEqual(restoreRes.status, 200);
    const restoredData = await restoreRes.json();
    assert.strictEqual(restoredData.settings.apiActionsEnabled, true);

    // Endpoint works again
    const workingRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-03`);
    assert.strictEqual(workingRes.status, 200);
  });

  it("Probe 2.2: Granular action switch matrix enforces selective 403 without disabling other actions", async () => {
    // Disable only createPreReservation and commitReservation
    await fetch(`${BASE_URL}/api/bot-actions/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiActionsEnabled: true,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: true,
          generatePayment: true,
          createPreReservation: false,
          commitReservation: false
        }
      })
    });

    // Availability is allowed -> 200
    const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-03`);
    assert.strictEqual(availRes.status, 200);

    // Quote is allowed -> 200
    const quoteRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkIn: "2026-12-01", checkOut: "2026-12-03" })
    });
    assert.strictEqual(quoteRes.status, 200);

    // Pre-reserve is blocked -> 403
    const preRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flatId: 1, checkIn: "2026-12-01", checkOut: "2026-12-03", guestName: "Teste" })
    });
    assert.strictEqual(preRes.status, 403);
    const preData = await preRes.json();
    assert.strictEqual(preData.error, "ACTION_DISABLED");
    assert.strictEqual(preData.action, "createPreReservation");

    // Commit is blocked -> 403
    const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: 1 })
    });
    assert.strictEqual(commitRes.status, 403);
    const commitData = await commitRes.json();
    assert.strictEqual(commitData.error, "ACTION_DISABLED");
    assert.strictEqual(commitData.action, "commitReservation");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 7: EXPIRAÇÃO AUTOMÁTICA DE HOLD E COMMIT REJEITADO APÓS EXPIRAÇÃO
  // ─────────────────────────────────────────────────────────────────────────────

  it("Probe 1.6: Expired pre-reservation rejects commit with 400 PRE_RESERVATION_EXPIRED and unblocks calendar", async () => {
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

    // Inject an expired pre-reservation directly into the test database
    const dbState = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    const expiredRes = {
      id: 99881,
      code: "CF-HOLD-EXPIRED-TEST",
      flatId: 3,
      flatNumber: "116",
      guestName: "Hóspede Expirado",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      channel: "whatsapp",
      status: "pre_reserva",
      paymentStatus: "pendente",
      totalAmount: 500,
      expiresAt: new Date(Date.now() - 60000).toISOString() // expired 1 minute ago
    };
    dbState.reservations.unshift(expiredRes);
    fs.writeFileSync(isolatedDbPath, JSON.stringify(dbState, null, 2), "utf-8");

    // Force server to reload database from disk so the injected expired reservation is in memory
    const resetRes = await fetch(`${BASE_URL}/api/test/db-reset`, { method: "POST" });
    assert.strictEqual(resetRes.status, 200);
    await new Promise(r => setTimeout(r, 400));

    // 1. Attempt to commit the expired pre-reservation -> MUST fail with 400 PRE_RESERVATION_EXPIRED
    const commitRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: 99881 })
    });
    assert.strictEqual(commitRes.status, 400);
    const commitData = await commitRes.json();
    assert.strictEqual(commitData.error, "PRE_RESERVATION_EXPIRED");

    // 2. Calendar check: flat 3 (116) is available because the hold has expired
    const availRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-10&checkOut=2026-12-12&guests=2`);
    assert.strictEqual(availRes.status, 200);
    const availData = await availRes.json();
    const flat3Available = availData.flats.some(f => String(f.id) === "3" || String(f.number) === "116");
    assert.strictEqual(flat3Available, true, "Flat 116 must be free because pre-reservation hold is expired");
  });

  it("Probe 1.7: Adversarial edge cases on payment, maintenance room block, and cancelled commit", async () => {
    // 1. Payment with invalid amount (<= 0) -> 400 INVALID_AMOUNT
    const payInvalid = await fetch(`${BASE_URL}/api/bot-actions/payment-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: -50 })
    });
    assert.strictEqual(payInvalid.status, 400);
    const payInvData = await payInvalid.json();
    assert.strictEqual(payInvData.error, "INVALID_AMOUNT");

    // 2. Pre-reserve with missing fields -> 400 MISSING_FIELDS
    const preMissing = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flatId: 1 })
    });
    assert.strictEqual(preMissing.status, 400);
    const preMissData = await preMissing.json();
    assert.strictEqual(preMissData.error, "MISSING_FIELDS");

    // 3. Maintenance room block conflict: inject roomBlock for flat 4
    const dbState = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    dbState.roomBlocks = [
      {
        id: "rb-maint-1",
        flatId: 4,
        flatNumber: "211",
        startDate: "2026-12-15",
        endDate: "2026-12-18",
        reason: "Manutenção de Ar Condicionado"
      }
    ];
    // Also inject a cancelled reservation
    dbState.reservations.unshift({
      id: 99882,
      code: "CF-CANCELLED-TEST",
      flatId: 4,
      flatNumber: "211",
      guestName: "Hóspede Cancelado",
      checkinDate: "2026-12-20",
      checkoutDate: "2026-12-22",
      channel: "whatsapp",
      status: "cancelada",
      paymentStatus: "pendente",
      totalAmount: 400
    });
    fs.writeFileSync(isolatedDbPath, JSON.stringify(dbState, null, 2), "utf-8");
    await fetch(`${BASE_URL}/api/test/db-reset`, { method: "POST" });
    await new Promise(r => setTimeout(r, 400));

    // Availability excludes flat 4 on maintenance dates
    const availBlockRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-15&checkOut=2026-12-18&guests=1`);
    const availBlockData = await availBlockRes.json();
    const flat4Avail = availBlockData.flats.some(f => String(f.id) === "4" || String(f.number) === "211");
    assert.strictEqual(flat4Avail, false, "Flat 211 with roomBlock maintenance must not be available");

    // Pre-reserve attempt on flat 4 during room block returns 409
    const preBlockRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: 4,
        checkIn: "2026-12-15",
        checkOut: "2026-12-18",
        guestName: "Tentativa Bloqueada",
        total: 500
      })
    });
    assert.strictEqual(preBlockRes.status, 409);
    const preBlockData = await preBlockRes.json();
    assert.strictEqual(preBlockData.error, "FLAT_UNAVAILABLE");

    // Commit on cancelled reservation returns 400 RESERVATION_CANCELLED
    const commitCancelRes = await fetch(`${BASE_URL}/api/bot-actions/commit-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: 99882 })
    });
    assert.strictEqual(commitCancelRes.status, 400);
    const commitCancelData = await commitCancelRes.json();
    assert.strictEqual(commitCancelData.error, "RESERVATION_CANCELLED");
  });

  it("Probe 2.3: In-process WhatsApp AI service integration with Kill Switch", async () => {
    const disabledMockDb = {
      botActionsSettings: {
        apiActionsEnabled: false,
        allowedActions: { checkAvailability: true, calculateQuote: true },
        handoverMessage: "Serviço automático em manutenção. Transferindo para a recepção."
      },
      settings: { geminiApiKey: "" },
      flats: [{ id: 1, number: "101" }],
      reservations: []
    };

    // 1. buildGeminiTools returns empty array []
    const tools = buildGeminiTools(disabledMockDb.botActionsSettings);
    assert.deepEqual(tools, [], "When apiActionsEnabled is false, buildGeminiTools must return []");

    // 2. executeBotAction rejects with ACTION_DISABLED and requiresHandover
    const directAction = await executeBotAction(disabledMockDb, "checkAvailability", { checkIn: "2026-11-01", checkOut: "2026-11-03" });
    assert.strictEqual(directAction.error, "ACTION_DISABLED");
    assert.strictEqual(directAction.action, "checkAvailability");
    assert.strictEqual(directAction.requiresHandover, true);
    assert.ok(directAction.message.includes("recepção"));

    // 3. AI response with disabled switch falls back to cordial concierge without function calling
    const aiRes = await generateAiWhatsAppResponse({
      db: disabledMockDb,
      phone: "5522998505276",
      messageText: "Gostaria de fazer uma reserva para este fim de semana"
    });
    assert.strictEqual(aiRes.source, "heuristic");
    assert.ok(aiRes.replyText.includes("recepção") || aiRes.replyText.includes("CorpFlats"), "Response must provide cordial assistance/handover");
  });

  it("Probe 2.4: Rapid hot toggle stress testing of master kill switch without server restart", async () => {
    // Rapid toggling 10 times in a row
    for (let i = 0; i < 10; i++) {
      const targetState = (i % 2 === 0);
      const toggleRes = await fetch(`${BASE_URL}/api/bot-actions/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiActionsEnabled: targetState })
      });
      assert.strictEqual(toggleRes.status, 200);

      // Verify availability endpoint immediately respects the new state
      const checkRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-01&checkOut=2026-12-03`);
      if (targetState) {
        assert.strictEqual(checkRes.status, 200, `Iteration ${i}: Expected 200 when switch is true`);
      } else {
        assert.strictEqual(checkRes.status, 403, `Iteration ${i}: Expected 403 when switch is false`);
        const data = await checkRes.json();
        assert.strictEqual(data.error, "ACTION_DISABLED");
        assert.strictEqual(data.requiresHandover, true);
      }
    }

    // Restore to enabled at the end
    await fetch(`${BASE_URL}/api/bot-actions/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiActionsEnabled: true })
    });
  });
});
