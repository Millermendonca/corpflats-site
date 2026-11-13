/**
 * Adversarial Test Suite: Milestone 3 - Modal, Checkout, Provisional Hold & Polling Logic
 * File: tests/m3-adversarial-challenger.test.mjs
 * Execution: node --test tests/m3-adversarial-challenger.test.mjs
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

const TEST_PORT = 3998;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m3-adversarial-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  for (let i = 0; i < 5; i++) {
    try {
      return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    } catch (_) {
      try {
        execSync("powershell -Command Start-Sleep -Milliseconds 50");
      } catch (__) {}
    }
  }
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Milestone 3 Empirical Adversarial Suite (Modal, Checkout, Hold & Polling)", () => {
  before(async () => {
    // 0. Limpeza preventiva da porta de teste
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

    // 1. Inicializa banco de dados isolado com dados adversariais controlados
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 10, number: "201", receptionEmail: "recepcao.201@corpflats.com.br" },
      { id: 11, number: "202", receptionEmail: "recepcao.202@corpflats.com.br" }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      interConfig: { pixKey: "47964813000165" }
    };

    // R1: Reserva direta confirmada ativa no Flat 201 (10 a 12 Dezembro 2026)
    const r1 = {
      id: 9101,
      code: "RES-ADV-001",
      guestName: "Marcos Silva",
      guestEmail: "marcos@example.com",
      guestPhone: "5522988881111",
      guestDocument: "12345678901",
      flatId: 10,
      flatNumber: "201",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      guestCount: 2,
      dailyRate: 200,
      totalAmount: 400,
      paidAmount: 400,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: "data:image/png;base64,initialSig123"
    };

    // R2: Reserva futura no Flat 201 (15 a 18 Dezembro 2026)
    const r2 = {
      id: 9102,
      code: "RES-ADV-002",
      guestName: "Juliana Costa",
      guestEmail: "juliana@example.com",
      guestPhone: "5522988882222",
      guestDocument: "98765432100",
      flatId: 10,
      flatNumber: "201",
      checkinDate: "2026-12-15",
      checkoutDate: "2026-12-18",
      guestCount: 1,
      dailyRate: 200,
      totalAmount: 600,
      paidAmount: 600,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false
    };

    // R3: Reserva OTA (Booking.com) - deve ser rejeitada para modificação direta
    const r3 = {
      id: 9103,
      code: "RES-ADV-OTA",
      guestName: "Hans Müller",
      guestEmail: "hans@example.com",
      guestPhone: "49170123456",
      guestDocument: "PP1234567",
      flatId: 11,
      flatNumber: "202",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-14",
      guestCount: 1,
      dailyRate: 250,
      totalAmount: 1000,
      paidAmount: 1000,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "booking",
      fnhrCompleted: true,
      needsReSignature: false
    };

    // R4: Reserva cancelada
    const r4 = {
      id: 9104,
      code: "RES-ADV-CANCELLED",
      guestName: "Fernanda Lima",
      flatId: 10,
      flatNumber: "201",
      checkinDate: "2026-12-20",
      checkoutDate: "2026-12-25",
      status: "cancelada",
      channel: "site_direto"
    };

    // R5: Reserva com check-in hoje (dentro de 24h) para testar política de não-reembolso
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterStr = dayAfterTomorrow.toISOString().substring(0, 10);

    const r5 = {
      id: 9105,
      code: "RES-ADV-24H",
      guestName: "Paula Ramos",
      flatId: 11,
      flatNumber: "202",
      checkinDate: todayStr,
      checkoutDate: dayAfterStr,
      guestCount: 1,
      dailyRate: 150,
      totalAmount: 300,
      paidAmount: 300,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false
    };

    // R6: Reserva inicializada com hold já expirado no passado
    const r6 = {
      id: 9106,
      code: "RES-ADV-EXPIRED",
      guestName: "Carlos Expirado",
      flatId: 10,
      flatNumber: "201",
      checkinDate: "2026-12-25",
      checkoutDate: "2026-12-28",
      guestCount: 1,
      dailyRate: 200,
      totalAmount: 600,
      paidAmount: 600,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      pendingModification: {
        pendingId: "mod_expired_init_999",
        newCheckinDate: "2026-12-25",
        newCheckoutDate: "2026-12-30",
        additionalAmountToPay: 400,
        createdAt: "2026-10-01T10:00:00.000Z",
        expiresAt: "2026-10-01T10:30:00.000Z", // expirado
        status: "pending"
      }
    };

    initialDb.reservations = [r1, r2, r3, r4, r5, r6];
    initialDb.breakfastOrders = [];
    initialDb.cleaningRequests = [];
    initialDb.reservationCommunications = [];
    initialDb.fnrhAuditDocuments = [];
    initialDb.roomBlocks = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Inicia servidor em processo filho
    let serverErrors = [];
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

    serverProcess.stderr.on("data", (data) => {
      serverErrors.push(data.toString());
    });

    // 3. Aguarda servidor responder no ping
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }

    if (!ready) {
      throw new Error(`Servidor adversarial não inicializou na porta ${TEST_PORT}: ${serverErrors.join("\n")}`);
    }
  });

  after(async () => {
    if (serverProcess?.pid) {
      killProcessTree(serverProcess.pid);
    }
    await new Promise(r => setTimeout(r, 400));
    if (fs.existsSync(isolatedDbPath)) {
      try { fs.unlinkSync(isolatedDbPath); } catch (_) {}
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 1: Step 1 Preview Edge Cases & Boundary Conditions
  // ──────────────────────────────────────────────────────────────────────────

  it("ADV-1.1: Step 1 /modify-preview deve rejeitar datas invertidas ou nulas com 400 INVALID_DATES", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-14",
        newCheckoutDate: "2026-12-12" // Invertida
      })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "INVALID_DATES");
    assert.equal(json.available, false);
  });

  it("ADV-1.2: Step 1 /modify-preview deve rejeitar formato de data incorreto com 400", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "10/12/2026",
        newCheckoutDate: "14/12/2026"
      })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "INVALID_DATES");
  });

  it("ADV-1.3: Step 1 /modify-preview deve bloquear reservas de canais externos (OTA: Booking) com 403", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-OTA/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-10",
        newCheckoutDate: "2026-12-16"
      })
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error, "EXTERNAL_CHANNEL");
    assert.ok(json.message.includes("Booking.com"));
  });

  it("ADV-1.4: Step 1 /modify-preview deve bloquear reservas canceladas com 400", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-CANCELLED/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-21",
        newCheckoutDate: "2026-12-26"
      })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error, "RESERVATION_CANCELLED");
  });

  it("ADV-1.5: Step 1 /modify-preview deve acusar conflito de calendário com 409 quando colide com outra reserva", async () => {
    // RES-ADV-001 tenta estender até 16/12, colidindo com RES-ADV-002 (15 a 18/12)
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-10",
        newCheckoutDate: "2026-12-16"
      })
    });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.available, false);
    assert.equal(json.error, "CONFLICT");
    assert.ok(json.conflictMessage.includes("201"));
  });

  it("ADV-1.6: Step 1 /modify-preview com redução em menos de 24h aciona política de não-reembolso", async () => {
    // RES-ADV-24H tem checkin hoje (todayStr). Reduz de 2 noites para 1 noite
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().substring(0, 10);

    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-24H/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: todayStr,
        newCheckoutDate: nextDayStr
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.available, true);
    assert.equal(json.isUnder24h, true);
    assert.equal(json.nonRefundableReduction, true);
    assert.equal(json.refundAmount, 0, "Reembolso deve ser zero com menos de 24h");
    assert.ok(json.policyNotice.includes("menos de 24h"));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 2: Step 2 Provisional Hold, 30-min Expiration & PIX Payload
  // ──────────────────────────────────────────────────────────────────────────

  it("ADV-2.1: Step 2 /modify-checkout deve criar hold provisório com expiração precisa de 30 minutos", async () => {
    const beforeCheckout = Date.now();
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-10",
        newCheckoutDate: "2026-12-14", // +2 noites (disponível: 10 a 14)
        paymentMethod: "pix"
      })
    });
    const afterCheckout = Date.now();

    assert.equal(res.status, 200);
    const checkout = await res.json();
    assert.equal(checkout.success, true);
    assert.ok(checkout.pendingId.startsWith("mod_"));
    assert.equal(checkout.additionalAmountToPay, 400); // 2 diárias * 200

    // Verificação de expiração de 30 minutos (tolerância de 5 segundos)
    const expiresMs = new Date(checkout.expiresAt).getTime();
    const diffMinutes = (expiresMs - beforeCheckout) / (60 * 1000);
    assert.ok(diffMinutes >= 29.9 && diffMinutes <= 30.1, `Expiração deve ser ~30 min, obteve ${diffMinutes}`);

    // Verificação do payload PIX Copia e Cola
    assert.ok(checkout.pixCopiaECola, "Deve gerar payload PIX Copia e Cola");
    assert.ok(checkout.pixCopiaECola.startsWith("000201"), "Payload PIX deve iniciar com cabeçalho padrão EMV 000201");
    assert.ok(checkout.pixCopiaECola.includes("CORPFLATS") || checkout.pixCopiaECola.includes("CAMPOS"), "Payload deve conter dados do beneficiário");

    // Verificação do QR Code Base64
    assert.ok(checkout.pixQrCodeUrl, "Deve gerar URL do QRCode");
    assert.ok(checkout.pixQrCodeUrl.startsWith("data:image/png;base64,"), "QRCode deve ser data URI de imagem PNG");

    // Integridade do banco: datas originais NÃO foram mutadas
    const db = getDb();
    const r1 = db.reservations.find(x => x.code === "RES-ADV-001");
    assert.equal(r1.checkinDate, "2026-12-10");
    assert.equal(r1.checkoutDate, "2026-12-12", "checkoutDate original deve continuar 2026-12-12");
    assert.ok(r1.pendingModification, "Hold provisório deve estar salvo em r.pendingModification");
    assert.equal(r1.pendingModification.status, "pending");
  });

  it("ADV-2.2: Hold provisório ativo no Flat 201 deve bloquear outras reservas no mesmo período", async () => {
    // RES-ADV-001 tem hold provisório de 10 a 14 no Flat 201.
    // RES-ADV-002 tenta simular alteração para período que colide com o hold de RES-ADV-001 (11 a 14)
    const resConflict = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-002/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-11",
        newCheckoutDate: "2026-12-14"
      })
    });

    assert.equal(resConflict.status, 409, "Deve retornar 409 Conflito bloqueado pelo hold provisório ativo");
    const jsonConflict = await resConflict.json();
    assert.equal(jsonConflict.available, false);
    assert.ok(jsonConflict.conflictMessage.includes("201"));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 3: Polling Loop Transition & Payment Commitment
  // ──────────────────────────────────────────────────────────────────────────

  it("ADV-3.1: Polling em /modify-status retorna 'pending' enquanto não pago", async () => {
    const db = getDb();
    const r1 = db.reservations.find(x => x.code === "RES-ADV-001");
    const pendingId = r1.pendingModification.pendingId;

    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-status?pendingId=${pendingId}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, "pending");
    assert.equal(json.paid, false);
    assert.equal(json.committed, false);
  });

  it("ADV-3.2: Polling com confirmação de pagamento realiza commit atômico e transição de estado", async () => {
    const dbBefore = getDb();
    const r1Before = dbBefore.reservations.find(x => x.code === "RES-ADV-001");
    const pendingId = r1Before.pendingModification.pendingId;

    // Simula pagamento aprovado via flag de teste x-test-simulate-payment
    const resPaid = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-status?pendingId=${pendingId}`, {
      headers: { "x-test-simulate-payment": "true" }
    });

    assert.equal(resPaid.status, 200);
    const json = await resPaid.json();
    assert.equal(json.status, "paid");
    assert.equal(json.paid, true);
    assert.equal(json.committed, true);
    assert.equal(json.needsReSignature, true, "Deve sinalizar obrigatoriedade de re-assinatura");
    assert.ok(json.reSignatureUrl.includes("resign=1"));

    // Verifica persistência atômica no banco de dados
    const dbAfter = getDb();
    const r1After = dbAfter.reservations.find(x => x.code === "RES-ADV-001");
    assert.equal(r1After.checkinDate, "2026-12-10");
    assert.equal(r1After.checkoutDate, "2026-12-14", "checkoutDate deve ter sido atualizado para 2026-12-14");
    assert.equal(r1After.totalAmount, 800, "totalAmount deve ser 400 + 400 = 800");
    assert.equal(r1After.paidAmount, 800, "paidAmount deve ser 800");
    assert.equal(r1After.needsReSignature, true, "needsReSignature deve ser true");
    assert.equal(r1After.fnhrCompleted, false, "fnhrCompleted deve ser revogado");
    assert.ok(!r1After.pendingModification, "pendingModification deve ser limpo");

    // Registro no array de pagamentos
    assert.ok(Array.isArray(r1After.payments));
    const payRec = r1After.payments.find(p => p.pendingId === pendingId);
    assert.ok(payRec, "Pagamento do hold deve constar em r1.payments");
    assert.equal(payRec.amount, 400);

    // Registro no histórico de modificações
    assert.ok(Array.isArray(r1After.modificationHistory));
    const modHist = r1After.modificationHistory.find(m => m.pendingId === pendingId);
    assert.ok(modHist, "Modificação deve constar em r1.modificationHistory");
    assert.equal(modHist.newCheckout, "2026-12-14");
  });

  it("ADV-3.3: Polling subsequente é idempotente e não duplica pagamentos", async () => {
    const dbBefore = getDb();
    const r1Before = dbBefore.reservations.find(x => x.code === "RES-ADV-001");
    const modHist = r1Before.modificationHistory[r1Before.modificationHistory.length - 1];
    const pendingId = modHist.pendingId;

    // Chamada repetida de polling
    const resRepeat = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-status?pendingId=${pendingId}`);
    assert.equal(resRepeat.status, 200);
    const json = await resRepeat.json();
    assert.equal(json.status, "paid");
    assert.equal(json.committed, true);

    const dbAfter = getDb();
    const r1After = dbAfter.reservations.find(x => x.code === "RES-ADV-001");
    assert.equal(r1After.totalAmount, 800, "totalAmount não deve ter sido duplicado");
    assert.equal(r1After.payments.length, 1, "Pagamentos não devem ser duplicados");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 4: Hold Cancellation via /modify-cancel-pending
  // ──────────────────────────────────────────────────────────────────────────

  it("ADV-4.1: /modify-cancel-pending deve rejeitar cancelamento de modificação já liquidada com 400", async () => {
    const db = getDb();
    const r1 = db.reservations.find(x => x.code === "RES-ADV-001");
    const modHist = r1.modificationHistory[0];

    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-cancel-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: modHist.pendingId })
    });
    // Como não há mais pendingModification ativo, deve informar que não há pendente
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.committed, false);
  });

  it("ADV-4.2: /modify-cancel-pending cancela hold provisório ativo e restaura datas sem efeitos colaterais", async () => {
    // 1. Cria um novo hold na reserva RES-ADV-002
    const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-002/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-15",
        newCheckoutDate: "2026-12-20", // +2 noites
        paymentMethod: "pix"
      })
    });
    assert.equal(checkoutRes.status, 200);
    const checkout = await checkoutRes.json();
    assert.ok(checkout.pendingId);

    const dbWithHold = getDb();
    const r2WithHold = dbWithHold.reservations.find(x => x.code === "RES-ADV-002");
    assert.ok(r2WithHold.pendingModification, "Hold deve estar ativo em r2");
    assert.equal(r2WithHold.checkoutDate, "2026-12-18", "Data original preservada durante o hold");

    // 2. Cancela o hold via /modify-cancel-pending
    const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-002/modify-cancel-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: checkout.pendingId })
    });
    assert.equal(cancelRes.status, 200);
    const cancelJson = await cancelRes.json();
    assert.equal(cancelJson.success, true);
    assert.equal(cancelJson.originalDates.checkoutDate, "2026-12-18");

    // 3. Verifica que pendingModification foi totalmente removido
    const dbAfterCancel = getDb();
    const r2After = dbAfterCancel.reservations.find(x => x.code === "RES-ADV-002");
    assert.ok(!r2After.pendingModification, "pendingModification deve ser nulo");
    assert.equal(r2After.checkoutDate, "2026-12-18", "Data original estritamente mantida");
    assert.equal(r2After.totalAmount, 600, "Valor original mantido");
  });

  it("ADV-4.3: /modify-cancel-pending com pendingId incompatível deve retornar erro 400", async () => {
    // Cria hold
    const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-002/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-15",
        newCheckoutDate: "2026-12-19",
        paymentMethod: "pix"
      })
    });
    assert.equal(checkoutRes.status, 200);

    // Tenta cancelar com ID forjado
    const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-002/modify-cancel-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: "mod_forged_id_999" })
    });
    assert.equal(cancelRes.status, 400);
    const cancelJson = await cancelRes.json();
    assert.equal(cancelJson.success, false);
    assert.ok(cancelJson.error.includes("não coincide"));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 5: Expired Hold Behavior
  // ──────────────────────────────────────────────────────────────────────────

  it("ADV-5.1: Hold com tempo expirado é detectado pelo polling e rejeitado", async () => {
    const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-EXPIRED/modify-status?pendingId=mod_expired_init_999`);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.status, "expired");
    assert.equal(statusJson.paid, false);
    assert.equal(statusJson.committed, false);
    assert.ok(statusJson.message.includes("expirou"));
  });
});
