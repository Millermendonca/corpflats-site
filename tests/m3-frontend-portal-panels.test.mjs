/**
 * Test Suite: Milestone 3 - Frontend Experience, Re-Signing Fast-Track & Garage Dashboard Polling
 * File: tests/m3-frontend-portal-panels.test.mjs
 * Execution: node --test tests/m3-frontend-portal-panels.test.mjs
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

const TEST_PORT = 3997;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m3-portal-panels-db-${Date.now()}.json`);

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

describe("Milestone 3: Guest Portal Flow, Re-Signing Fast-Track & Garage Polling Suite", () => {
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

    // 1. Inicializa banco de dados isolado com dados controlados
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 1, number: "113", receptionEmail: "recepcao.113@corpflats.com.br" },
      { id: 2, number: "114", receptionEmail: "recepcao.114@corpflats.com.br" }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria.geral@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      buildingName: "Edifício Soho Residence Service"
    };

    const todayStr = new Date().toISOString().substring(0, 10);

    // Res 1: Reserva confirmada no Flat 113 com veículo cadastrado
    const res1 = {
      id: 9001,
      code: "RES-M3-001",
      guestName: "Roberta Alves",
      guestEmail: "roberta@example.com",
      guestPhone: "5522998883333",
      guestDocument: "11122233344",
      flatId: 1,
      flatNumber: "113",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-12",
      guestCount: 2,
      dailyRate: 160,
      totalAmount: 320,
      paidAmount: 320,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: "data:image/png;base64,sampleSig123",
      vehicle: {
        plate: "BRA2E19",
        brand: "Toyota",
        model: "Corolla",
        color: "Prata"
      },
      guests: [
        {
          index: 1,
          name: "Roberta Alves",
          cpf: "11122233344",
          phone: "5522998883333",
          hasCompletedCheckin: true,
          needsReSignature: false
        }
      ]
    };

    // Res 2: Reserva futura no Flat 113 que cria conflito de extensão
    const res2 = {
      id: 9002,
      code: "RES-M3-002",
      guestName: "Carlos Drumond",
      guestEmail: "carlos@example.com",
      guestPhone: "5522998884444",
      guestDocument: "55566677788",
      flatId: 1,
      flatNumber: "113",
      checkinDate: "2026-11-15",
      checkoutDate: "2026-11-18",
      guestCount: 1,
      dailyRate: 160,
      totalAmount: 480,
      paidAmount: 480,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      guests: [
        {
          index: 1,
          name: "Carlos Drumond",
          cpf: "55566677788",
          phone: "5522998884444",
          hasCompletedCheckin: true
        }
      ]
    };

    // Res 3: Reserva que já requer re-assinatura
    const res3 = {
      id: 9003,
      code: "RES-M3-003",
      guestName: "Larissa Manoela",
      guestEmail: "larissa@example.com",
      guestPhone: "5522998885555",
      guestDocument: "99988877766",
      flatId: 2,
      flatNumber: "114",
      checkinDate: todayStr,
      checkoutDate: "2026-10-20",
      guestCount: 1,
      dailyRate: 190,
      totalAmount: 380,
      paidAmount: 380,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site",
      fnhrCompleted: false,
      needsReSignature: true,
      reSignatureReason: "Datas alteradas",
      reSignatureUrl: "/pre-checkin/RES-M3-003?resign=1",
      vehicle: {
        plate: "ABC1D23",
        brand: "Honda",
        model: "Civic",
        color: "Preto"
      },
      guests: [
        {
          index: 1,
          name: "Larissa Manoela",
          cpf: "99988877766",
          phone: "5522998885555",
          hasCompletedCheckin: false,
          needsReSignature: true
        }
      ]
    };

    initialDb.reservations = [res1, res2, res3];
    initialDb.breakfastOrders = initialDb.breakfastOrders || [];
    initialDb.cleaningRequests = initialDb.cleaningRequests || [];
    initialDb.reservationCommunications = initialDb.reservationCommunications || [];
    initialDb.fnrhAuditDocuments = initialDb.fnrhAuditDocuments || [];
    initialDb.maintenanceOrders = initialDb.maintenanceOrders || [];

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
      throw new Error(`Servidor de teste não inicializou na porta ${TEST_PORT}: ${serverErrors.join("\n")}`);
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

  it("1. Backend deve projetar needsReSignature, reSignatureReason e reSignatureUrl no Guest Portal", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-003`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.reservation, "Deve retornar objeto reservation");
    assert.equal(data.reservation.needsReSignature, true, "needsReSignature deve ser true");
    assert.equal(data.reservation.reSignatureReason, "Datas alteradas");
    assert.equal(data.reservation.reSignatureUrl, "/pre-checkin/RES-M3-003?resign=1");
  });

  it("2. /modify-preview deve calcular demonstrativo financeiro e acusar conflito de calendário", async () => {
    // 2.1 Disponibilidade OK (estendendo 2 noites: 10-12 -> 10-14)
    const resOk = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14",
        newGuestCount: 2
      })
    });
    assert.equal(resOk.status, 200);
    const preview = await resOk.json();
    assert.equal(preview.success, true);
    assert.equal(preview.available, true);
    assert.equal(preview.extraNights, 2);
    assert.equal(preview.additionalAmountToPay, 320);
    assert.equal(preview.requiresPayment, true);

    // 2.2 Conflito de Calendário (estendendo até 17, colidindo com RES-M3-002 de 15 a 18)
    const resConflict = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-17",
        newGuestCount: 2
      })
    });
    assert.equal(resConflict.status, 409);
    const conflict = await resConflict.json();
    assert.equal(conflict.available, false);
    assert.ok(conflict.message || conflict.conflictMessage, "Deve conter mensagem clara de conflito");
  });

  it("3. /modify-checkout deve gerar hold de 30 minutos com PIX sem mutar datas no banco", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-001/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14",
        newGuestCount: 2,
        paymentMethod: "pix"
      })
    });
    assert.equal(res.status, 200);
    const checkout = await res.json();

    assert.equal(checkout.success, true);
    assert.ok(checkout.pendingId, "Deve retornar pendingId");
    assert.equal(checkout.additionalAmountToPay, 320);
    assert.ok(checkout.pixQrCodeUrl || checkout.pixCopiaECola, "Deve gerar dados de PIX");
    assert.ok(checkout.expiresAt, "Deve indicar data/hora de expiração do hold");

    // Integridade do banco: datas continuam as originais (2026-11-10 a 2026-11-12)
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M3-001");
    assert.equal(r.checkinDate, "2026-11-10");
    assert.equal(r.checkoutDate, "2026-11-12");
    assert.ok(r.pendingModification, "Hold provisório deve estar registrado na reserva");

    // Consulta de status do pagamento pendente
    const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-001/modify-status?pendingId=${checkout.pendingId}`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.status, "pending");
    assert.equal(statusData.paid, false);
  });

  it("4. /modify-cancel-pending deve liberar hold e restaurar disponibilidade", async () => {
    const dbBefore = getDb();
    const rBefore = dbBefore.reservations.find(x => x.code === "RES-M3-001");
    const pendingId = rBefore.pendingModification?.pendingId || rBefore.pendingModification?.id;
    assert.ok(pendingId, "Deve haver pendingModification ativo");

    const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-001/modify-cancel-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId })
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.success, true);

    const dbAfter = getDb();
    const rAfter = dbAfter.reservations.find(x => x.code === "RES-M3-001");
    assert.ok(!rAfter.pendingModification, "Hold provisório deve ser anulado");
    assert.equal(rAfter.checkoutDate, "2026-11-12", "Datas originais devem ser preservadas");
  });

  it("5. Modificação com Custo Zero (/modify) deve atualizar datas e invalidar assinatura anterior", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M3-001/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-09",
        newCheckoutDate: "2026-11-11",
        newGuestCount: 2,
        reason: "Adiantamento de viagem"
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.needsReSignature, true);

    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M3-001");
    assert.equal(r.checkinDate, "2026-11-09");
    assert.equal(r.checkoutDate, "2026-11-11");
    assert.equal(r.needsReSignature, true, "needsReSignature deve ser acionado");
    assert.equal(r.fnhrCompleted, false, "fnhrCompleted deve ser revogado");
  });

  it("6. Fast-Track de Re-assinatura (POST /api/pms/pre-checkin com resign='1') deve autenticar nova assinatura e limpar pendência", async () => {
    const freshSignature = "data:image/png;base64,freshReSignaturePNGData98765";

    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "RES-M3-001",
        guestIndex: 1,
        fullName: "Roberta Alves",
        document: "11122233344",
        phone: "5522998883333",
        email: "roberta@example.com",
        birthDate: "1988-05-15",
        gender: "F",
        cep: "28010-000",
        address: "Rua das Flores, 100",
        city: "Campos dos Goytacazes",
        state: "RJ",
        resign: "1",
        isReSignature: true,
        signatureBase64: freshSignature,
        legalDeclarationAccepted: true
      })
    });

    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.success, true);

    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M3-001");
    assert.equal(r.needsReSignature, false, "needsReSignature deve ser limpo após re-assinatura");
    assert.equal(r.fnhrCompleted, true, "fnhrCompleted deve voltar a ser true");
    assert.ok(r.fnrhPdfUrl || r.fnrhDocumentUrl, "Novo PDF da FNRH deve ser gerado");
  });

  it("7. /api/pms/garage/daily-sheet deve sincronizar estadias ativas e veículos cadastrados", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/garage/daily-sheet`);
    assert.equal(res.status, 200);
    const sheet = await res.json();

    assert.ok(Array.isArray(sheet.vehicles), "Deve retornar array de veículos");
    // O veículo da reserva 3 (RES-M3-003) tem check-in hoje
    const v3 = sheet.vehicles.find(v => v.reservationCode === "RES-M3-003");
    assert.ok(v3, "Veículo de RES-M3-003 deve constar na relação diária");
    assert.equal(v3.plate, "ABC1D23");
    assert.equal(v3.flatNumber, "114");
  });

  it("8. Verificação de Integridade Estática dos Componentes Frontend (M3)", () => {
    const guestPortalPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-portal.tsx");
    const preCheckinPath = path.join(rootDir, "artifacts/limpeza/src/pages/guest-pre-checkin.tsx");
    const garagePath = path.join(rootDir, "artifacts/limpeza/src/pages/garage-dashboard.tsx");

    const portalCode = fs.readFileSync(guestPortalPath, "utf-8");
    const preCheckinCode = fs.readFileSync(preCheckinPath, "utf-8");
    const garageCode = fs.readFileSync(garagePath, "utf-8");

    // Guest Portal
    assert.ok(portalCode.includes("PenTool"), "guest-portal.tsx deve importar PenTool");
    assert.ok(portalCode.includes('setModStep("preview")'), "guest-portal.tsx deve ter etapa preview");
    assert.ok(portalCode.includes('setModStep("checkout")'), "guest-portal.tsx deve ter etapa checkout");
    assert.ok(portalCode.includes('setModStep("success")'), "guest-portal.tsx deve ter etapa success");
    assert.ok(portalCode.includes("handleRunPreview"), "guest-portal.tsx deve conter handleRunPreview");
    assert.ok(portalCode.includes("handleProceedToCheckout"), "guest-portal.tsx deve conter handleProceedToCheckout");
    assert.ok(portalCode.includes("handleCancelHold"), "guest-portal.tsx deve conter handleCancelHold");
    assert.ok(portalCode.includes("modify-status"), "guest-portal.tsx deve consultar /modify-status via polling");
    assert.ok(portalCode.includes("resign=1"), "guest-portal.tsx deve direcionar para resign=1");

    // Pre-checkin
    assert.ok(preCheckinCode.includes("AlertTriangle"), "guest-pre-checkin.tsx deve importar AlertTriangle");
    assert.ok(preCheckinCode.includes('resign") === "1"'), "guest-pre-checkin.tsx deve verificar resign===1");
    assert.ok(preCheckinCode.includes("setStep(3)"), "guest-pre-checkin.tsx deve suportar salto rápido para Step 3");
    assert.ok(preCheckinCode.includes("resign_success=1"), "guest-pre-checkin.tsx deve redirecionar com resign_success=1");

    // Garage Dashboard
    assert.ok(garageCode.includes("setInterval"), "garage-dashboard.tsx deve ter setInterval para polling");
    assert.ok(garageCode.includes("30000"), "garage-dashboard.tsx deve ter polling de 30 segundos");
    assert.ok(garageCode.includes("visibilitychange"), "garage-dashboard.tsx deve sincronizar em visibilitychange");
    assert.ok(garageCode.includes("Tempo Real (30s)"), "garage-dashboard.tsx deve exibir badge de tempo real");
  });
});
