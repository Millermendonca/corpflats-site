/**
 * Sunday Upsell Engine ("Domingo Sem Pressa") — Targeted Test Suite
 * File: tests/sunday-upsell-engine.test.mjs
 * Execution: node --test tests/sunday-upsell-engine.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  resolveTargetSundayDate,
  evaluateSundayUpsellEligibility,
  previewSundayUpsellEligibility,
  triggerSundayUpsellRoutine,
  checkAndTriggerSundayUpsell,
  dispatchSundayUpsellTwoBalloons
} from "../artifacts/api-server/zapi-service.mjs";

import {
  ofertarDomingoSemPressaTool
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

import {
  sweepExpiredPreReservations
} from "../artifacts/api-server/demo-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4299;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const isolatedDbPath = path.join(os.tmpdir(), `test-sunday-upsell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {}
}

describe("Sunday Upsell Engine — Unit Tests", () => {
  const targetSunday = "2026-11-08"; // Sunday
  const mondayDate = "2026-11-09";   // Monday

  it("1.1 resolveTargetSundayDate resolves explicitly or to the upcoming Sunday", () => {
    assert.strictEqual(resolveTargetSundayDate(targetSunday), targetSunday);
    const resolvedAuto = resolveTargetSundayDate();
    assert.ok(typeof resolvedAuto === "string" && resolvedAuto.length === 10);
    const dateObj = new Date(resolvedAuto + "T12:00:00Z");
    assert.strictEqual(dateObj.getUTCDay(), 0, "Resolved date must be a Sunday");
  });

  it("1.2 Eligibility Evaluation: Case A (Flat free on Sunday night -> eligible without reallocation)", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", name: "Flat 101" },
        { id: 102, number: "102", name: "Flat 102" }
      ],
      reservations: [
        {
          id: 1,
          code: "RES-101-SUN",
          flatNumber: "101",
          flatId: 101,
          guestName: "Carlos Hóspede",
          guestPhone: "5521999990001",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "confirmada",
          paymentStatus: "paid",
          totalAmount: 500.0,
          numNights: 2
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 1);
    assert.strictEqual(res.eligibleReservations[0].reservation.code, "RES-101-SUN");
    assert.strictEqual(res.eligibleReservations[0].alternateFlat, null);
    assert.strictEqual(res.mondayDate, mondayDate);
  });

  it("1.3 Eligibility Evaluation: Case B (Incoming check-in on Sunday, but alternate flat available -> eligible with FairShare reallocation)", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", name: "Flat 101" },
        { id: 102, number: "102", name: "Flat 102" }
      ],
      reservations: [
        {
          id: 1,
          code: "RES-101-SUN",
          flatNumber: "101",
          flatId: 101,
          guestName: "Carlos Hóspede",
          guestPhone: "5521999990001",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "confirmada",
          paymentStatus: "paid",
          totalAmount: 500.0,
          numNights: 2
        },
        // Incoming reservation entering on Flat 101 on Sunday
        {
          id: 2,
          code: "RES-101-INCOMING",
          flatNumber: "101",
          flatId: 101,
          guestName: "Fernanda Entrante",
          guestPhone: "5521999990002",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          status: "confirmada",
          paymentStatus: "paid"
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 1);
    assert.strictEqual(res.eligibleReservations[0].reservation.code, "RES-101-SUN");
    assert.ok(res.eligibleReservations[0].alternateFlat !== null, "Must find alternate flat 102");
    assert.strictEqual(String(res.eligibleReservations[0].alternateFlat.number), "102");
    assert.strictEqual(res.eligibleReservations[0].incomingRes.code, "RES-101-INCOMING");
  });

  it("1.4 Eligibility Evaluation: Case C (Hotel 100% full, no alternative flat -> ineligible)", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", name: "Flat 101" }
      ],
      reservations: [
        {
          id: 1,
          code: "RES-101-SUN",
          flatNumber: "101",
          flatId: 101,
          guestName: "Carlos Hóspede",
          guestPhone: "5521999990001",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "confirmada",
          paymentStatus: "paid"
        },
        {
          id: 2,
          code: "RES-101-INCOMING",
          flatNumber: "101",
          flatId: 101,
          guestName: "Fernanda Entrante",
          guestPhone: "5521999990002",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          status: "confirmada",
          paymentStatus: "paid"
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 0);
    assert.strictEqual(res.ineligibleReservations.length, 1);
    assert.strictEqual(res.ineligibleReservations[0].reason, "CONDOMINIO_100_PORCENTO_OCUPADO");
  });

  it("1.5 previewSundayUpsellEligibility returns preview structure without mutating state", () => {
    const mockDb = {
      flats: [{ id: 101, number: "101" }],
      reservations: [
        {
          id: 1,
          code: "RES-101-SUN",
          flatNumber: "101",
          guestPhone: "5521999990001",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "confirmada"
        }
      ]
    };

    const preview = previewSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(preview.targetSundayDate, targetSunday);
    assert.strictEqual(preview.eligibleCount, 1);
    assert.strictEqual(preview.eligibleReservations[0].code, "RES-101-SUN");
    assert.strictEqual(mockDb.reservations[0].pendingSundayUpsell, undefined, "Preview must not mutate reservation");
  });

  it("1.6 triggerSundayUpsellRoutine sets 30-min hold with isSilentUpsellHold", async () => {
    globalThis.__CORPFLATS_TEST_MODE__ = true;
    const mockDb = {
      sundayUpsellConfig: {
        enabled: true,
        sundayUpsellPrice: 90.0,
        channelId: "guest_schedule"
      },
      flats: [{ id: 101, number: "101" }],
      reservations: [
        {
          id: 1,
          code: "RES-101-SUN",
          flatNumber: "101",
          guestName: "Roberto Teste",
          guestPhone: "5522998811223",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "confirmada",
          totalAmount: 600.0,
          numNights: 2
        }
      ],
      zapiConfig: { enabled: false }
    };

    const routineRes = await triggerSundayUpsellRoutine(mockDb, null, {
      forceDate: targetSunday,
      testMode: true
    });

    assert.strictEqual(routineRes.dispatchedCount, 1);
    const r = mockDb.reservations[0];
    assert.ok(r.pendingSundayUpsell);
    assert.strictEqual(r.pendingSundayUpsell.status, "pending_payment");
    assert.strictEqual(r.pendingSundayUpsell.promotionalPrice, 90.0);
    assert.strictEqual(r.pendingSundayUpsell.isSilentUpsellHold, true);
    assert.ok(r.pendingSundayUpsell.pixCopiaECola);
    assert.ok(r.pendingSundayUpsell.txid);

    assert.ok(r.pendingModification);
    assert.strictEqual(r.pendingModification.type, "sunday_upsell");
    assert.strictEqual(r.pendingModification.isSilentUpsellHold, true);
    assert.strictEqual(r.pendingModification.newCheckoutDate, mondayDate);
  });

  it("1.7 sweepExpiredPreReservations silently expires Sunday Upsell hold without changing reservation status", () => {
    const expiredPastMs = Date.now() - 5000;
    const mockDb = {
      reservations: [
        {
          id: 10,
          code: "RES-ACTIVE-STAY",
          status: "confirmada",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          pendingSundayUpsell: {
            status: "pending_payment",
            expiresAt: new Date(expiredPastMs).toISOString(),
            isSilentUpsellHold: true
          },
          pendingModification: {
            status: "awaiting_payment",
            type: "sunday_upsell",
            isSilentUpsellHold: true,
            expiresAt: new Date(expiredPastMs).toISOString()
          }
        }
      ]
    };

    let saved = false;
    const count = sweepExpiredPreReservations(mockDb, () => { saved = true; });

    assert.strictEqual(count, 1);
    const r = mockDb.reservations[0];
    assert.strictEqual(r.status, "confirmada", "Underlying stay status must remain 'confirmada'");
    assert.strictEqual(r.pendingSundayUpsell.status, "expired");
    assert.strictEqual(r.pendingModification, undefined, "pendingModification must be cleaned up");
    assert.strictEqual(r.checkoutDate, targetSunday, "Original Sunday checkout must remain untouched");
  });

  it("1.8 checkAndTriggerSundayUpsell obeys Saturday 19h scheduler and idempotency", async () => {
    let triggered = 0;
    const mockDb = {
      sundayUpsellConfig: {
        enabled: true,
        triggerDay: 6, // Saturday
        triggerHour: 19,
        sundayUpsellPrice: 90.0,
        lastTriggerDate: null
      },
      flats: [{ id: 101, number: "101" }],
      reservations: []
    };

    // Case 1: Friday 19h -> should not trigger
    const friday19h = new Date("2026-11-06T19:00:00-03:00");
    await checkAndTriggerSundayUpsell(mockDb, null, friday19h);
    assert.strictEqual(mockDb.sundayUpsellConfig.lastTriggerDate, null);

    // Case 2: Saturday 18h -> should not trigger
    const saturday18h = new Date("2026-11-07T18:00:00-03:00");
    await checkAndTriggerSundayUpsell(mockDb, null, saturday18h);
    assert.strictEqual(mockDb.sundayUpsellConfig.lastTriggerDate, null);

    // Case 3: Saturday 19h -> triggers and records lastTriggerDate as the target Sunday
    const saturday19h = new Date("2026-11-07T19:15:00-03:00");
    await checkAndTriggerSundayUpsell(mockDb, null, saturday19h);
    assert.strictEqual(mockDb.sundayUpsellConfig.lastTriggerDate, "2026-11-08");

    // Case 4: Same Saturday 19h again -> idempotent, does not re-trigger
    const saturday19hRepeat = new Date("2026-11-07T19:30:00-03:00");
    await checkAndTriggerSundayUpsell(mockDb, null, saturday19hRepeat);
    assert.strictEqual(mockDb.sundayUpsellConfig.lastTriggerDate, "2026-11-08");
  });

  it("1.9 Sofia AI Tool: ofertarDomingoSemPressaTool validates context and executes 2-step flow", async () => {
    // Step 0: Ineligible reservation (checkout is not Sunday)
    const contextNotSunday = {
      data_hora_atual: "2026-11-07T20:00:00-03:00",
      telefone_remetente: "5522998811223",
      estado_atual: "IN_STAY_CONCIERGE",
      reserva_ativa: {
        id: "RES-TEST-1",
        imovel_id: "101",
        nome_imovel: "Flat 101",
        data_checkin: "2026-11-04",
        data_checkout: "2026-11-07", // Saturday checkout
        status_pagamento: "PAGO_INTEGRALMENTE"
      }
    };

    const resIneligible = await ofertarDomingoSemPressaTool.execute(
      { confirmacao_hospede: false },
      contextNotSunday
    );
    assert.strictEqual(resIneligible.status, "BLOQUEADO_PELA_REGRA");
    assert.strictEqual(resIneligible.codigo_regra_bloqueio, "CHECKOUT_NAO_E_DOMINGO");

    // Context with Sunday checkout
    const contextSunday = {
      data_hora_atual: "2026-11-07T20:00:00-03:00",
      telefone_remetente: "5522998811223",
      estado_atual: "IN_STAY_CONCIERGE",
      reserva_ativa: {
        id: "RES-TEST-SUN",
        imovel_id: "101",
        nome_imovel: "Flat 101",
        data_checkin: "2026-11-06",
        data_checkout: targetSunday,
        status_pagamento: "PAGO_INTEGRALMENTE"
      }
    };

    // Step 1: Simulation (confirmacao_hospede: false)
    const resSim = await ofertarDomingoSemPressaTool.execute(
      { confirmacao_hospede: false },
      contextSunday
    );
    assert.strictEqual(resSim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
    assert.ok(resSim.dados);
    assert.strictEqual(resSim.dados.valor_promocional, 90.0);
    assert.ok(resSim.instrucao_para_ia.includes("90"));

    // Step 2: Confirmation (confirmacao_hospede: true)
    const resConfirm = await ofertarDomingoSemPressaTool.execute(
      { confirmacao_hospede: true },
      contextSunday
    );
    assert.strictEqual(resConfirm.status, "SUCESSO_EXECUTADO");
    assert.ok(resConfirm.dados);
    assert.ok(resConfirm.dados.pix_copia_e_cola);
    assert.ok(resConfirm.instrucao_para_ia.includes("30 minutos"));
  });
});

describe("Sunday Upsell Engine — Integration & Webhook Tests (Isolated Server)", () => {
  const targetSunday = "2026-11-08";
  const mondayDate = "2026-11-09";
  const testReservationCode = "RES-UPSELL-INTEG-101";
  const testIncomingCode = "RES-UPSELL-INCOMING-102";

  before(async () => {
    const initialDb = {
      settings: {},
      zapiConfig: { enabled: false },
      sundayUpsellConfig: {
        enabled: true,
        sundayUpsellPrice: 90.0,
        channelId: "guest_schedule",
        triggerHour: 19,
        triggerDay: 6,
        holdDurationMinutes: 30,
        isSilentUpsellHold: true
      },
      flats: [
        { id: 101, number: "101", name: "Flat 101" },
        { id: 102, number: "102", name: "Flat 102" }
      ],
      reservations: [
        {
          id: 501,
          code: testReservationCode,
          flatId: 101,
          flatNumber: "101",
          guestName: "Clarice Lispector",
          guestPhone: "5521988887777",
          status: "confirmada",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          totalAmount: 500.0,
          paidAmount: 500.0,
          paymentStatus: "paid",
          charges: [{ id: "chg_initial", description: "Diárias", amount: 500.0, date: "2026-11-06" }],
          payments: [{ id: "pay_initial", amount: 500.0, method: "pix", date: "2026-11-06" }]
        },
        {
          id: 502,
          code: testIncomingCode,
          flatId: 101,
          flatNumber: "101",
          guestName: "Vinicius de Moraes",
          guestPhone: "5521977776666",
          status: "confirmada",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          totalAmount: 1200.0,
          paidAmount: 1200.0,
          paymentStatus: "paid"
        }
      ],
      cleaningRequests: [
        {
          id: "clean_101_sun",
          flatId: 101,
          flatNumber: "101",
          reservationCode: testReservationCode,
          requestDate: targetSunday,
          status: "pending"
        }
      ]
    };

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    const env = { ...process.env };
    delete env.DATABASE_URL;

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    let isReady = false;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }

    if (!isReady) {
      throw new Error(`Falha ao iniciar servidor de testes na porta ${TEST_PORT}`);
    }
  });

  after(async () => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
    setTimeout(() => {
      process.exit(0);
    }, 100);
  });

  it("2.1 GET /api/whatsapp/sunday-upsell/config returns valid configuration", async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/sunday-upsell/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.config.enabled, true);
    assert.strictEqual(data.config.sundayUpsellPrice, 90.0);
  });

  it("2.2 POST /api/whatsapp/sunday-upsell/config updates price and status", async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/sunday-upsell/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        sundayUpsellPrice: 95.0
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.config.sundayUpsellPrice, 95.0);
  });

  it("2.3 GET /api/whatsapp/sunday-upsell/preview previews eligibility", async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/sunday-upsell/preview?forceDate=${targetSunday}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.eligibleCount, 1);
    assert.strictEqual(data.eligibleReservations[0].code, testReservationCode);
  });

  it("2.4 POST /api/whatsapp/sunday-upsell/trigger creates holds and returns dispatched items", async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/sunday-upsell/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forceDate: targetSunday,
        testMode: true,
        dryRun: false
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.dispatchedCount, 1);
    assert.ok(data.dispatchedItems[0].txid);
  });

  it("2.5 POST /api/pms/inter/webhook processes Sunday Upsell payment: extends checkout, reschedules cleaning, reallocates incoming flat", async () => {
    // Read current isolated database to retrieve created txid
    const currentDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    const rCurrent = currentDb.reservations.find(r => r.code === testReservationCode);
    assert.ok(rCurrent.pendingSundayUpsell);
    const txid = rCurrent.pendingSundayUpsell.txid;

    // Simulate Inter Webhook payment notification
    const resWebhook = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix: [
          {
            txid,
            valor: "95.00",
            horario: new Date().toISOString(),
            endToEndId: `E2E_UPSELL_TEST_${Date.now()}`
          }
        ]
      })
    });
    assert.strictEqual(resWebhook.status, 200);

    // Give server a brief moment to persist DB
    await new Promise(r => setTimeout(r, 600));

    // Verify updated database state
    const updatedDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    const rUpdated = updatedDb.reservations.find(r => r.code === testReservationCode);

    // 1. Check checkout extension to Monday 12:00h
    assert.strictEqual(rUpdated.checkoutDate, mondayDate);
    assert.strictEqual(rUpdated.checkoutTime, "12:00");
    assert.strictEqual(rUpdated.hasSundayUpsell, true);
    assert.ok(rUpdated.sundayUpsellPaidAt);
    assert.strictEqual(rUpdated.pendingSundayUpsell.status, "paid");
    assert.strictEqual(rUpdated.pendingModification, undefined);

    // 2. Check financial ledger
    assert.strictEqual(rUpdated.totalAmount, 595.0);
    assert.strictEqual(rUpdated.paidAmount, 595.0);
    const upsellCharge = rUpdated.charges.find(c => c.category === "sunday_upsell");
    assert.ok(upsellCharge);
    assert.strictEqual(upsellCharge.amount, 95.0);

    // 3. Check cleaning rescheduled to Monday
    const cReq = updatedDb.cleaningRequests.find(c => c.flatNumber === "101" && c.reservationCode === testReservationCode);
    assert.ok(cReq);
    assert.strictEqual(cReq.requestDate, mondayDate);

    // 4. Check FairShare reallocation of incoming reservation to Flat 102
    const incomingUpdated = updatedDb.reservations.find(r => r.code === testIncomingCode);
    assert.strictEqual(incomingUpdated.flatNumber, "102");
    assert.strictEqual(incomingUpdated.flatId, 102);

    // 5. Check audit log presence
    assert.ok(Array.isArray(incomingUpdated.auditLogs));
    const reallocationLog = incomingUpdated.auditLogs.find(l => l.action === "fairshare_reallocation_sunday_upsell");
    assert.ok(reallocationLog);
  });
});
