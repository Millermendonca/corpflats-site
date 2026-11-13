/**
 * Adversarial Challenger 2 Test Suite: Reception Tablet Integration & Ops Schedulers Synchronization
 * File: tests/m2-challenger2-adversarial.test.mjs
 * Execution: node --test tests/m2-challenger2-adversarial.test.mjs
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

const TEST_PORT = 3996;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m2-challenger2-db-${Date.now()}.json`);

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

describe("Milestone 2 Challenger 2: Adversarial Reception Tablet & Schedulers Synchronization", () => {
  const todayStr = new Date().toISOString().substring(0, 10);

  before(async () => {
    // 0. Preventive port cleanup
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") killProcessTree(pid);
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}

    // 1. Setup isolated database
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 101, number: "201", receptionEmail: "recepcao.201@corpflats.com.br" },
      { id: 102, number: "202", receptionEmail: "recepcao.202@corpflats.com.br" }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      buildingName: "Edifício Soho Residence Service"
    };

    // Res 9001: Multi-guest reservation (2 guests) arriving today
    const resMultiGuest = {
      id: 9001,
      code: "RES-M2-MULTI",
      guestName: "Roberto Carlos",
      guestEmail: "roberto@example.com",
      guestPhone: "5511999990001",
      guestDocument: "11122233344",
      flatId: 101,
      flatNumber: "201",
      checkinDate: todayStr,
      checkoutDate: "2026-10-25",
      guestCount: 2,
      dailyRate: 200,
      totalAmount: 600,
      paidAmount: 600,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      morningEmailSentDate: todayStr,
      morningEmailSentAt: "2026-10-11T10:00:00.000Z",
      receptionNotifiedAt: "2026-10-11T10:00:00.000Z",
      vehicle: {
        plate: "BRA2E19",
        model: "Corolla",
        garageNotifiedAt: "2026-10-11T10:00:00.000Z",
        lastNotifiedPlate: "BRA2E19"
      },
      guests: [
        {
          index: 1,
          name: "Roberto Carlos",
          cpf: "11122233344",
          phone: "5511999990001",
          email: "roberto@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          entryAuthorized: false
        },
        {
          index: 2,
          name: "Maria Silva",
          cpf: "55566677788",
          phone: "5511999990002",
          email: "maria@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          entryAuthorized: false
        }
      ]
    };

    // Res 9002: Future reservation with complex breakfast & housekeeping bindings
    const resOperations = {
      id: 9002,
      code: "RES-M2-OPS",
      guestName: "Amanda Silveira",
      guestEmail: "amanda@example.com",
      guestPhone: "5521998887766",
      guestDocument: "99988877766",
      flatId: 101,
      flatNumber: "201",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-15",
      guestCount: 1,
      dailyRate: 250,
      totalAmount: 1250,
      paidAmount: 1250,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "airbnb",
      fnhrCompleted: true,
      needsReSignature: false,
      morningEmailSentDate: "2026-10-09",
      morningEmailSentAt: "2026-10-09T07:00:00.000Z",
      receptionNotifiedAt: "2026-10-09T07:00:00.000Z",
      vehicle: {
        plate: "XYZ9876",
        model: "Civic",
        garageNotifiedAt: "2026-10-09T07:00:00.000Z",
        lastNotifiedPlate: "XYZ9876"
      },
      guests: [
        {
          index: 1,
          name: "Amanda Silveira",
          cpf: "99988877766",
          phone: "5521998887766",
          email: "amanda@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          entryAuthorized: false
        }
      ]
    };

    // Res 9003: Direct channel reservation for Guest Portal zero-cost modification
    const resZeroCost = {
      id: 9003,
      code: "RES-M2-ZERO",
      guestName: "Carla Pires",
      guestEmail: "carla@example.com",
      guestPhone: "5531998889999",
      guestDocument: "33344455566",
      flatId: 101,
      flatNumber: "201",
      checkinDate: "2026-11-20",
      checkoutDate: "2026-11-24",
      guestCount: 1,
      dailyRate: 150,
      totalAmount: 600,
      paidAmount: 600,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      morningEmailSentDate: "2026-10-01",
      guests: [
        {
          index: 1,
          name: "Carla Pires",
          cpf: "33344455566",
          phone: "5531998889999",
          hasCompletedCheckin: true,
          needsReSignature: false
        }
      ]
    };

    initialDb.reservations = [resMultiGuest, resOperations, resZeroCost];

    // Breakfast orders for Res 9002 and 9003
    initialDb.breakfastOrders = [
      { id: "bk-arr", reservationCode: "RES-M2-OPS", date: "2026-11-10", status: "pending", roomNumber: "201", flatId: 101 },
      { id: "bk-mid", reservationCode: "RES-M2-OPS", date: "2026-11-13", status: "pending", roomNumber: "201", flatId: 101 },
      { id: "bk-dep", reservationCode: "RES-M2-OPS", date: "2026-11-15", status: "pending", roomNumber: "201", flatId: 101 },
      { id: "bk-pre", reservationCode: "RES-M2-OPS", date: "2026-11-09", status: "cancelled", cancelReason: "Pre-existing", roomNumber: "201", flatId: 101 },
      { id: "bk-post", reservationCode: "RES-M2-OPS", date: "2026-11-17", status: "cancelled", cancelReason: "Pre-existing", roomNumber: "201", flatId: 101 },
      { id: "bk-zero", reservationCode: "RES-M2-ZERO", date: "2026-11-21", status: "pending", roomNumber: "201", flatId: 101 }
    ];

    // Cleaning request for turnover on checkout
    initialDb.cleaningRequests = [
      { id: 950, flatId: 101, flatNumber: "201", requestDate: "2026-11-15", status: "pending", type: "turnover" }
    ];

    initialDb.reservationCommunications = [];
    initialDb.fnrhAuditDocuments = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // Start isolated server
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
        if (res.ok) { isReady = true; break; }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
    if (!isReady) throw new Error(`Failed to start test server on port ${TEST_PORT}`);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ── Challenge 1: Multi-Guest Re-Signature Granularity & Reception Blocking ─
  it("Challenge 1: Invalidation on multi-guest reservation blocks reception until ALL guests re-sign", async () => {
    // 1. Modifica período da reserva 9001
    const putRes = await fetch(`${BASE_URL}/api/pms/reservations/9001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutDate: "2026-10-28",
        notes: "Alteração de checkout"
      })
    });
    assert.strictEqual(putRes.status, 200);

    const dbAfterMod = getDb();
    const rMod = dbAfterMod.reservations.find(x => x.id === 9001);
    assert.strictEqual(rMod.needsReSignature, true, "needsReSignature deve ser true");
    assert.strictEqual(rMod.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(rMod.guests[0].needsReSignature, true, "Hóspede 1 deve precisar de re-assinatura");
    assert.strictEqual(rMod.guests[1].needsReSignature, true, "Hóspede 2 deve precisar de re-assinatura");

    // 2. Consulta GET /api/reception/today: deve bloquear entrada e reportar badge error
    const todayRes1 = await fetch(`${BASE_URL}/api/reception/today`);
    assert.strictEqual(todayRes1.status, 200);
    const todayJson1 = await todayRes1.json();
    const arr1 = (todayJson1.arrivals || []).find(x => x.id === 9001);
    assert.ok(arr1, "Reserva 9001 deve constar em chegadas de hoje");
    assert.strictEqual(arr1.canAuthorizeEntry, false, "canAuthorizeEntry deve ser falso enquanto houver re-assinatura pendente");
    assert.strictEqual(arr1.allCheckinDone, false, "allCheckinDone deve ser falso");
    assert.strictEqual(arr1.entryBadgeType, "error", "entryBadgeType deve ser error");
    assert.match(arr1.entryMessage, /re-assinatura de termo obrigat[óo]ria/i);

    // 3. Tentativas adversariais de liberar entrada física na recepção devem ser estritamente rejeitadas com 400
    const payloads = [
      {},
      { partial: true },
      { guestIndices: [1] },
      { adminOverride: false }
    ];
    for (const pl of payloads) {
      const rejectRes = await fetch(`${BASE_URL}/api/reception/checkin/9001`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pl)
      });
      assert.strictEqual(rejectRes.status, 400, `POST /api/reception/checkin/9001 com payload ${JSON.stringify(pl)} deveria retornar 400`);
      const rejJson = await rejectRes.json();
      assert.strictEqual(rejJson.needsReSignature, true);
    }

    // 4. Hóspede 1 (Titular) re-assina o termo
    const sampleSig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const signGuest1Res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 9001,
        guestIndex: 1,
        fullName: "Roberto Carlos Reassinado",
        document: "11122233344",
        phone: "5511999990001",
        email: "roberto@example.com",
        signatureBase64: sampleSig,
        resign: "1"
      })
    });
    assert.strictEqual(signGuest1Res.status, 200);

    // Teste de estresse: Hóspede 2 ainda NÃO re-assinou!
    // A reserva NÃO pode ser liberada ainda, pois guest 2 continua pendente!
    const dbMid = getDb();
    const rMid = dbMid.reservations.find(x => x.id === 9001);
    assert.strictEqual(rMid.guests[0].needsReSignature, false, "Hóspede 1 concluiu re-assinatura");
    assert.strictEqual(rMid.guests[0].hasCompletedCheckin, true);
    assert.strictEqual(rMid.guests[1].needsReSignature, true, "Hóspede 2 ainda precisa re-assinar");
    assert.strictEqual(rMid.needsReSignature, true, "Reserva como um todo ainda tem needsReSignature = true pois hóspede 2 está pendente");

    // Reception tablet ainda deve bloquear a entrada geral
    const todayRes2 = await fetch(`${BASE_URL}/api/reception/today`);
    const todayJson2 = await todayRes2.json();
    const arr2 = (todayJson2.arrivals || []).find(x => x.id === 9001);
    assert.strictEqual(arr2.canAuthorizeEntry, false, "canAuthorizeEntry ainda deve ser false enquanto hóspede 2 estiver pendente");
    assert.strictEqual(arr2.entryBadgeType, "error");

    // Tentativa de checkin completo deve continuar bloqueada com 400
    const rejectRes2 = await fetch(`${BASE_URL}/api/reception/checkin/9001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(rejectRes2.status, 400);

    // 5. Agora Hóspede 2 (Acompanhante) também re-assina o termo
    const signGuest2Res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 9001,
        guestIndex: 2,
        fullName: "Maria Silva Reassinada",
        document: "55566677788",
        phone: "5511999990002",
        email: "maria@example.com",
        signatureBase64: sampleSig,
        resign: "1"
      })
    });
    assert.strictEqual(signGuest2Res.status, 200);

    // Agora todos os hóspedes re-assinaram!
    const dbFinal = getDb();
    const rFinal = dbFinal.reservations.find(x => x.id === 9001);
    assert.strictEqual(rFinal.needsReSignature, false, "needsReSignature da reserva deve ser false agora");
    assert.strictEqual(rFinal.fnhrCompleted, true, "fnhrCompleted deve ser true");
    assert.strictEqual(rFinal.guests[0].needsReSignature, false);
    assert.strictEqual(rFinal.guests[1].needsReSignature, false);
    assert.strictEqual(rFinal.guests[0].hasCompletedCheckin, true);
    assert.strictEqual(rFinal.guests[1].hasCompletedCheckin, true);

    // Reception tablet agora deve permitir entrada
    const todayRes3 = await fetch(`${BASE_URL}/api/reception/today`);
    const todayJson3 = await todayRes3.json();
    const arr3 = (todayJson3.arrivals || []).find(x => x.id === 9001);
    assert.strictEqual(arr3.needsReSignature, false);
    assert.strictEqual(arr3.allCheckinDone, true);
    assert.strictEqual(arr3.canAuthorizeEntry, true);
    assert.strictEqual(arr3.entryBadgeType, "success");

    // POST /api/reception/checkin/9001 agora tem sucesso imediato (200)
    const successCheckin = await fetch(`${BASE_URL}/api/reception/checkin/9001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(successCheckin.status, 200);
    const successJson = await successCheckin.json();
    assert.strictEqual(successJson.success, true);
    assert.strictEqual(successJson.reservation.status, "in_house");
  });

  // ── Challenge 2: Schedulers Synchronization on Date and Flat Alterations ─
  it("Challenge 2: Changing stay window & flat synchronizes morning routine, breakfast orders and housekeeping", async () => {
    // Res 9002 foi cadastrada com:
    // checkinDate: "2026-11-10", checkoutDate: "2026-11-15", flatNumber: "201", flatId: 101
    // morningEmailSentDate: "2026-10-09", vehicle.garageNotifiedAt presente
    // Pedidos de café: 10/11 (bk-arr), 13/11 (bk-mid), 15/11 (bk-dep), 09/11 (bk-pre), 17/11 (bk-post)
    // Limpeza 950 em 15/11 no Flat 201

    // Modificamos a estadia para:
    // checkinDate: "2026-11-12", checkoutDate: "2026-11-18", flatNumber: "202", flatId: 102
    const modRes = await fetch(`${BASE_URL}/api/pms/reservations/9002`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkinDate: "2026-11-12",
        checkoutDate: "2026-11-18",
        flatId: 102,
        flatNumber: "202"
      })
    });
    assert.strictEqual(modRes.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.id === 9002);

    // 1. Verificação da Rotina Matinal das 07:00
    // morningEmailSentDate e carimbos de recepção/garagem devem ser deletados
    assert.strictEqual(r.morningEmailSentDate, undefined, "morningEmailSentDate deve ter sido apagado");
    assert.strictEqual(r.morningEmailSentAt, undefined, "morningEmailSentAt deve ter sido apagado");
    assert.strictEqual(r.receptionNotifiedAt, undefined, "receptionNotifiedAt deve ter sido apagado");
    assert.strictEqual(r.vehicle?.garageNotifiedAt, undefined, "garageNotifiedAt deve ter sido apagado");
    assert.strictEqual(r.vehicle?.lastNotifiedPlate, undefined, "lastNotifiedPlate deve ter sido apagado");

    // Simulação do filtro da rotina das 07:00 na nova data de check-in ("2026-11-12")
    const simToday = "2026-11-12";
    const routineEligible = (r.checkinDate === simToday && r.status !== "cancelada" && r.morningEmailSentDate !== simToday);
    assert.strictEqual(routineEligible, true, "Rotina das 07:00 deve encontrar a reserva como elegível na nova data de chegada");

    // 2. Verificação dos Pedidos de Café da Manhã
    // Pedido bk-arr (10/11) agora está antes da nova entrada (12/11) -> deve ser cancelado com justificativa
    const bkArr = db.breakfastOrders.find(b => b.id === "bk-arr");
    assert.strictEqual(bkArr.status, "cancelled");
    assert.ok(bkArr.cancelReason);
    assert.match(bkArr.cancelReason, /check-in alterado/i);

    // Pedido bk-mid (13/11) está dentro do novo período (12/11 a 18/11) -> deve manter status pending e novo Flat 202
    const bkMid = db.breakfastOrders.find(b => b.id === "bk-mid");
    assert.strictEqual(bkMid.status, "pending");
    assert.strictEqual(bkMid.roomNumber, "202");
    assert.strictEqual(bkMid.flatId, 102);

    // Pedido bk-dep (15/11) está dentro do novo período (12/11 a 18/11) -> mantido e transferido para Flat 202
    const bkDep = db.breakfastOrders.find(b => b.id === "bk-dep");
    assert.strictEqual(bkDep.status, "pending");
    assert.strictEqual(bkDep.roomNumber, "202");
    assert.strictEqual(bkDep.flatId, 102);

    // Pedido bk-post (17/11) estava cancelado anteriormente, mas agora está DENTRO do novo período (12/11 a 18/11)
    // Motor de sincronização deve reativar para 'pending'
    const bkPost = db.breakfastOrders.find(b => b.id === "bk-post");
    assert.strictEqual(bkPost.status, "pending", "Pedido bk-post (17/11) deve ter sido reativado para pending");
    assert.strictEqual(bkPost.cancelReason, null, "cancelReason deve ter sido limpo");
    assert.strictEqual(bkPost.roomNumber, "202");

    // 3. Verificação da Governança (Limpeza 950 de Turnover de Checkout)
    const cleanReq = db.cleaningRequests.find(c => c.id === 950);
    assert.strictEqual(cleanReq.requestDate, "2026-11-18", "Data de limpeza deve ter sido transferida para a nova data de checkout 18/11");
    assert.strictEqual(cleanReq.flatNumber, "202", "Flat de limpeza deve ter sido atualizado para 202");
    assert.strictEqual(cleanReq.flatId, 102);
  });

  // ── Challenge 3: Invalidation across Zero-Cost Guest Portal Modification ─
  it("Challenge 3: Zero-cost guest-portal modification also invalidates signature and syncs operations", async () => {
    // Troca de datas no mesmo número de noites (20-24 para 21-25) com custo 0
    const modRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M2-ZERO/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-21",
        newCheckoutDate: "2026-11-25",
        newGuestCount: 1,
        reason: "Mudança de voo"
      })
    });
    assert.strictEqual(modRes.status, 200);

    const dbAfter = getDb();
    const r = dbAfter.reservations.find(x => x.id === 9003);
    assert.strictEqual(r.needsReSignature, true, "needsReSignature deve ser true após alteração no portal");
    assert.strictEqual(r.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(r.morningEmailSentDate, undefined, "morningEmailSentDate deve ter sido deletado");

    // Pedido bk-zero (21/11) continua válido na estadia (21-25)
    const bkZero = dbAfter.breakfastOrders.find(b => b.id === "bk-zero");
    assert.strictEqual(bkZero.status, "pending");
  });

  // ── Challenge 4: Paridade Estrita SHA-256 Byte-a-Byte ─────────────────────
  it("Challenge 4: Strict SHA-256 parity between scripts/ and artifacts/api-server/", () => {
    const pairs = [
      ["scripts/demo-server.mjs", "artifacts/api-server/demo-server.mjs"],
      ["scripts/fnrh-pdf-service.mjs", "artifacts/api-server/fnrh-pdf-service.mjs"],
      ["scripts/zapi-service.mjs", "artifacts/api-server/zapi-service.mjs"]
    ];
    for (const [f1, f2] of pairs) {
      const b1 = fs.readFileSync(path.join(rootDir, f1));
      const b2 = fs.readFileSync(path.join(rootDir, f2));
      const h1 = crypto.createHash("sha256").update(b1).digest("hex");
      const h2 = crypto.createHash("sha256").update(b2).digest("hex");
      assert.strictEqual(h1, h2, `Hash SHA-256 divergente em ${f1} vs ${f2}`);
    }
  });
});
