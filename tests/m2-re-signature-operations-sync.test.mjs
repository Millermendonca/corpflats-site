/**
 * Test Suite: Milestone 2 - Re-Signature Lifecycle, Forensic Document Delivery & Ops Sync
 * File: tests/m2-re-signature-operations-sync.test.mjs
 * Execution: node --test tests/m2-re-signature-operations-sync.test.mjs
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

const TEST_PORT = 3995;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m2-ops-sync-db-${Date.now()}.json`);

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

describe("Milestone 2: Re-Signature Lifecycle, Document Delivery & Ops Synchronization Suite", () => {
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

    // Res 1: Reserva confirmada com check-in hoje que sofrerá invalidação e re-assinatura
    const resToday = {
      id: 8001,
      code: "RES-M2-001",
      guestName: "Marcos Paulo",
      guestEmail: "marcospaulo@example.com",
      guestPhone: "5522998881111",
      guestDocument: "12345678901",
      flatId: 1,
      flatNumber: "113",
      checkinDate: todayStr,
      checkoutDate: "2026-10-18",
      guestCount: 1,
      dailyRate: 180,
      totalAmount: 360,
      paidAmount: 360,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      morningEmailSentDate: todayStr,
      guests: [
        {
          index: 1,
          name: "Marcos Paulo",
          cpf: "12345678901",
          phone: "5522998881111",
          hasCompletedCheckin: true,
          needsReSignature: false,
          entryAuthorized: false
        }
      ]
    };

    // Res 2: Reserva futura (para teste de e-mail na re-assinatura e limpeza de morningEmailSentDate)
    const resFuture = {
      id: 8002,
      code: "RES-M2-002",
      guestName: "Juliana Mendes",
      guestEmail: "juliana@example.com",
      guestPhone: "5522998882222",
      guestDocument: "98765432100",
      flatId: 2,
      flatNumber: "114",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-05",
      guestCount: 1,
      dailyRate: 200,
      totalAmount: 800,
      paidAmount: 800,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      morningEmailSentDate: "2026-10-10",
      guests: [
        {
          index: 1,
          name: "Juliana Mendes",
          cpf: "98765432100",
          phone: "5522998882222",
          hasCompletedCheckin: true,
          needsReSignature: false
        }
      ]
    };

    initialDb.reservations = [resToday, resFuture];

    // Pedidos de café da manhã vinculados à Reserva 8002
    initialDb.breakfastOrders = [
      { id: "bk-1", reservationCode: "RES-M2-002", date: "2026-11-02", status: "pending", roomNumber: "114" },
      { id: "bk-2", reservationCode: "RES-M2-002", date: "2026-11-04", status: "pending", roomNumber: "114" }
    ];

    // Limpeza de governança vinculada
    initialDb.cleaningRequests = [
      { id: 701, flatNumber: "114", flatId: 2, requestDate: "2026-11-05", status: "pending" }
    ];

    initialDb.reservationCommunications = [];
    initialDb.fnrhAuditDocuments = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Inicia o servidor em modo de teste
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
    if (!isReady) throw new Error(`Falha ao iniciar servidor de teste na porta ${TEST_PORT}`);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ── 1. Paridade de Arquivos ───────────────────────────────────────────────
  it("1. Paridade SHA-256 byte-a-byte entre scripts/ e artifacts/api-server/", () => {
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

  // ── 2. Invalidação de Assinatura ao Modificar Reserva ───────────────────────
  it("2. Alteração de datas na Reserva 8001 invalida assinatura e exige re-assinatura", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/reservations/8001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutDate: "2026-10-20",
        notes: "Extensão de período"
      })
    });
    assert.strictEqual(res.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.id === 8001);
    assert.strictEqual(r.needsReSignature, true, "needsReSignature deve ser true após alterar datas");
    assert.strictEqual(r.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(r.signatureUrl, null, "signatureUrl deve ter sido limpa");
    assert.ok(r.guests.every(g => g.needsReSignature === true), "Todos os hóspedes devem estar com needsReSignature: true");
    assert.ok(r.guests.every(g => g.hasCompletedCheckin === false), "hasCompletedCheckin deve ser false para todos os hóspedes");
  });

  // ── 3. Painel da Recepção Bloqueia Check-in enquanto needsReSignature === true ─
  it("3. GET /api/reception/today reflete pendência e bloqueia check-in enquanto needsReSignature === true", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/today`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const arr = (json.arrivals || []).find(x => x.id === 8001);
    assert.ok(arr, "Reserva 8001 deve constar em chegadas de hoje");
    assert.strictEqual(arr.needsReSignature, true);
    assert.strictEqual(arr.allCheckinDone, false);
    assert.strictEqual(arr.canAuthorizeEntry, false);
    assert.strictEqual(arr.entryBadgeType, "error");
    assert.match(arr.entryMessage, /re-assinatura/i);

    // Tentativa de liberação física na portaria deve retornar 400
    const checkinRes = await fetch(`${BASE_URL}/api/reception/checkin/8001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(checkinRes.status, 400);
    const errJson = await checkinRes.json();
    assert.strictEqual(errJson.needsReSignature, true);
    assert.match(errJson.error, /re-assinatura/i);
  });

  // ── 4. Re-assinatura, Geração Forense de PDF e Hash SHA-256 ─────────────────
  it("4. POST /api/pms/pre-checkin re-assina a reserva, gera PDF com SHA-256 e limpa invalidation", async () => {
    const sampleSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 8001,
        guestIndex: 1,
        fullName: "Marcos Paulo Atualizado",
        document: "12345678901",
        phone: "5522998881111",
        email: "marcospaulo@example.com",
        signatureBase64: sampleSignature,
        resign: "1"
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.fnrhDocument, "Deve retornar objeto fnrhDocument");
    assert.ok(json.fnrhDocument.sha256Hash, "Deve possuir hash SHA-256");
    assert.strictEqual(json.fnrhDocument.sha256Hash.length, 64, "Hash SHA-256 deve ter 64 caracteres hexadecimais");

    const db = getDb();
    const r = db.reservations.find(x => x.id === 8001);
    assert.strictEqual(r.needsReSignature, false, "needsReSignature deve ser false após re-assinar");
    assert.strictEqual(r.fnhrCompleted, true, "fnhrCompleted deve ser true");
    assert.strictEqual(r.fnrhSha256Hash, json.fnrhDocument.sha256Hash);
    assert.ok(db.fnrhAuditDocuments.some(d => d.documentUuid === json.fnrhDocument.documentUuid), "Trilha forense deve estar em db.fnrhAuditDocuments");
  });

  // ── 5. Entrega Automática à Recepção por E-mail ────────────────────────────
  it("5. Re-assinatura dispara e-mail com PDF anexado para a recepção (db.reservationCommunications)", () => {
    const db = getDb();
    const comms = db.reservationCommunications || [];
    const reSignEmail = comms.find(c =>
      c.reservation_id === "RES-M2-001" || c.reservation_id === "8001"
    );

    assert.ok(reSignEmail, "Deve existir registro de e-mail disparado para a reserva");
    assert.strictEqual(reSignEmail.type, "email");
    assert.strictEqual(reSignEmail.direction, "outbound");
    assert.ok(reSignEmail.metadata?.hasAttachments, "E-mail deve indicar anexos presentes");
    assert.strictEqual(reSignEmail.metadata?.trigger, "re_signature_checkin", "Gatilho deve ser re_signature_checkin");
    assert.ok(reSignEmail.metadata?.fnrhSha256Hash, "Metadados devem registrar o hash SHA-256 do documento");
  });

  // ── 6. Liberação no Painel da Recepção após Re-assinatura ───────────────────
  it("6. Painel da Recepção agora autoriza check-in após re-assinatura concluída", async () => {
    const res = await fetch(`${BASE_URL}/api/reception/today`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const arr = (json.arrivals || []).find(x => x.id === 8001);
    assert.strictEqual(arr.needsReSignature, false);
    assert.strictEqual(arr.allCheckinDone, true);
    assert.strictEqual(arr.canAuthorizeEntry, true);
    assert.strictEqual(arr.entryBadgeType, "success");

    // Check-in físico agora deve ser aceito
    const checkinRes = await fetch(`${BASE_URL}/api/reception/checkin/8001`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(checkinRes.status, 200);
  });

  // ── 7. Sincronização de Agendadores (Rotina 07:00, Café e Limpeza) ──────────
  it("7. Alteração de datas na Reserva 8002 limpa morningEmailSentDate, sincroniza café e governança", async () => {
    // Muda período da Reserva 8002 de 01/11-05/11 para 03/11-07/11 e troca para Flat 113
    const res = await fetch(`${BASE_URL}/api/pms/reservations/8002`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkinDate: "2026-11-03",
        checkoutDate: "2026-11-07",
        flatId: 1,
        flatNumber: "113"
      })
    });
    assert.strictEqual(res.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.id === 8002);

    // Invariante A: morningEmailSentDate foi limpo para disparar na nova data
    assert.strictEqual(r.morningEmailSentDate, undefined, "morningEmailSentDate deve ter sido deletado");
    assert.strictEqual(r.receptionNotifiedAt, undefined, "receptionNotifiedAt deve ter sido deletado");

    // Invariante B: Pedido de café de 02/11 (fora do novo período) foi cancelado
    const bk1 = db.breakfastOrders.find(b => b.id === "bk-1");
    assert.strictEqual(bk1.status, "cancelled", "Café do dia 02/11 deve estar cancelado");
    assert.ok(bk1.cancelReason, "Deve possuir justificativa de cancelamento");

    // Invariante C: Pedido de café de 04/11 (dentro do novo período) foi transferido para o novo Flat 113
    const bk2 = db.breakfastOrders.find(b => b.id === "bk-2");
    assert.strictEqual(bk2.roomNumber, "113", "Pedido de café deve refletir o novo Flat 113");

    // Invariante D: Limpeza de checkout foi transferida para a nova data 07/11
    const clean = db.cleaningRequests.find(c => c.id === 701);
    assert.strictEqual(clean.requestDate, "2026-11-07", "Data de limpeza deve ser o novo checkout 07/11");
  });
});
