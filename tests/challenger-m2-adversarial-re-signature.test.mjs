/**
 * Adversarial Stress Test Suite: Milestone 2
 * Focus: Re-Signature Lifecycle, Pre-Checkin Clearance, Multi-Pathway Invalidation & Idempotency
 * File: tests/challenger-m2-adversarial-re-signature.test.mjs
 * Execution: node --test tests/challenger-m2-adversarial-re-signature.test.mjs
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
const isolatedDbPath = path.join(rootDir, `data/test-m2-adv-re-sign-db-${Date.now()}.json`);

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

const SAMPLE_SIG_1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const SAMPLE_SIG_2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const STALE_HASH_A = "a".repeat(64);
const STALE_HASH_B = "b".repeat(64);

describe("M2 Adversarial Challenge: Re-Signature Lifecycle & Pre-Checkin Clearance", () => {
  before(async () => {
    // 0. Limpeza preventiva da porta de teste 3996
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

    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 1, number: "113", receptionEmail: "recepcao.113@corpflats.com.br" },
      { id: 2, number: "114", receptionEmail: "recepcao.114@corpflats.com.br" },
      { id: 3, number: "116", receptionEmail: "recepcao.116@corpflats.com.br" }
    ];

    initialDb.settings = {
      ...(initialDb.settings || {}),
      receptionEmail: "portaria@corpflats.com.br",
      garageEmail: "garagem@corpflats.com.br",
      buildingName: "Edifício Soho Residence Service",
      checkinProvider: "proprio"
    };

    const todayStr = new Date().toISOString().substring(0, 10);

    // Res 9001: Para teste Admin PUT (checkin hoje, 2 hóspedes, com assinaturas e hashes antigos)
    const res9001 = {
      id: 9001,
      code: "RES-ADV-9001",
      guestName: "Carlos Eduardo Titular",
      guestEmail: "carlos.adv@example.com",
      guestPhone: "5521999990001",
      guestDocument: "11122233344",
      flatId: 1,
      flatNumber: "113",
      checkinDate: todayStr,
      checkoutDate: "2026-10-18",
      guestCount: 2,
      dailyRate: 180,
      totalAmount: 360,
      paidAmount: 360,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: SAMPLE_SIG_1,
      fnrhPdfUrl: "/api/pms/fnrh/uuid-old-001/view",
      fnrhDocumentUuid: "uuid-old-001",
      fnrhSha256Hash: STALE_HASH_A,
      morningEmailSentDate: todayStr,
      guests: [
        {
          index: 1,
          name: "Carlos Eduardo Titular",
          cpf: "11122233344",
          phone: "5521999990001",
          email: "carlos.adv@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          signatureUrl: SAMPLE_SIG_1,
          fnrhDocumentUuid: "uuid-old-001",
          fnrhSha256Hash: STALE_HASH_A,
          entryAuthorized: false
        },
        {
          index: 2,
          name: "Mariana Acompanhante",
          cpf: "55566677788",
          phone: "5521999990002",
          email: "mariana.adv@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          signatureUrl: SAMPLE_SIG_1,
          fnrhDocumentUuid: "uuid-old-002",
          fnrhSha256Hash: STALE_HASH_B,
          entryAuthorized: false
        }
      ]
    };

    // Res 9002: Para teste Portal Checkout Settlement Commit (acréscimo de diária via hold)
    const res9002 = {
      id: 9002,
      code: "RES-ADV-9002",
      guestName: "Renata Vasconcelos",
      guestEmail: "renata.adv@example.com",
      guestPhone: "5521999990003",
      guestDocument: "99988877766",
      flatId: 2,
      flatNumber: "114",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-15",
      guestCount: 1,
      dailyRate: 200,
      totalAmount: 1000,
      paidAmount: 1000,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: SAMPLE_SIG_1,
      fnrhPdfUrl: "/api/pms/fnrh/uuid-old-9002/view",
      fnrhDocumentUuid: "uuid-old-9002",
      fnrhSha256Hash: STALE_HASH_A,
      guests: [
        {
          index: 1,
          name: "Renata Vasconcelos",
          cpf: "99988877766",
          phone: "5521999990003",
          email: "renata.adv@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          signatureUrl: SAMPLE_SIG_1,
          fnrhDocumentUuid: "uuid-old-9002",
          fnrhSha256Hash: STALE_HASH_A
        }
      ]
    };

    // Res 9003: Para teste Direct Portal Modify (deslocamento neutro de datas)
    const res9003 = {
      id: 9003,
      code: "RES-ADV-9003",
      guestName: "Fernando Dias",
      guestEmail: "fernando.adv@example.com",
      guestPhone: "5521999990004",
      guestDocument: "44433322211",
      flatId: 3,
      flatNumber: "116",
      checkinDate: "2026-11-20",
      checkoutDate: "2026-11-22",
      guestCount: 1,
      dailyRate: 150,
      totalAmount: 300,
      paidAmount: 300,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      signatureUrl: SAMPLE_SIG_1,
      fnrhPdfUrl: "/api/pms/fnrh/uuid-old-9003/view",
      fnrhDocumentUuid: "uuid-old-9003",
      fnrhSha256Hash: STALE_HASH_A,
      guests: [
        {
          index: 1,
          name: "Fernando Dias",
          cpf: "44433322211",
          phone: "5521999990004",
          email: "fernando.adv@example.com",
          hasCompletedCheckin: true,
          needsReSignature: false,
          signatureUrl: SAMPLE_SIG_1,
          fnrhDocumentUuid: "uuid-old-9003",
          fnrhSha256Hash: STALE_HASH_A
        }
      ]
    };

    initialDb.reservations = [res9001, res9002, res9003];
    initialDb.reservationCommunications = [];
    initialDb.fnrhAuditDocuments = [];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

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
    if (!isReady) throw new Error(`Falha ao iniciar servidor adversário na porta ${TEST_PORT}`);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ── CHALLENGE 1: Invalidação Pathway 1: Admin PUT com Payload Adverso ──────
  it("CHALLENGE 1: Admin PUT invalida assinatura, limpa hashes e resiste a payload de hóspede desatualizado", async () => {
    // Tenta maliciosamente enviar hóspedes com hasCompletedCheckin: true e needsReSignature: false no corpo do PUT
    const putRes = await fetch(`${BASE_URL}/api/pms/reservations/9001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutDate: "2026-10-21",
        guests: [
          {
            index: 1,
            name: "Carlos Eduardo Titular",
            hasCompletedCheckin: true,
            needsReSignature: false,
            signatureUrl: "evil_stale_signature"
          }
        ]
      })
    });
    assert.strictEqual(putRes.status, 200, "Admin PUT deve retornar 200");

    const db = getDb();
    const r = db.reservations.find(x => x.id === 9001);

    // Verificações Invariantes no Nível da Reserva
    assert.strictEqual(r.needsReSignature, true, "needsReSignature deve ser true");
    assert.strictEqual(r.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(r.preCheckinCompleted, false, "preCheckinCompleted deve ser false");
    assert.strictEqual(r.signatureUrl, null, "signatureUrl deve ser null");
    assert.strictEqual(r.fnrhPdfUrl, undefined, "fnrhPdfUrl deve ser deletado");
    assert.strictEqual(r.fnrhDocumentUuid, undefined, "fnrhDocumentUuid deve ser deletado");
    assert.strictEqual(r.fnrhSha256Hash, undefined, "fnrhSha256Hash deve ser deletado");

    // Verificações Invariantes no Nível de Todos os Hóspedes
    assert.ok(Array.isArray(r.guests), "r.guests deve existir");
    for (const g of r.guests) {
      assert.strictEqual(g.needsReSignature, true, `Guest ${g.index} needsReSignature deve ser true`);
      assert.strictEqual(g.hasCompletedCheckin, false, `Guest ${g.index} hasCompletedCheckin deve ser false`);
      assert.strictEqual(g.signatureUrl, null, `Guest ${g.index} signatureUrl deve ser null`);
      assert.strictEqual(g.fnrhDocumentUuid, undefined, `Guest ${g.index} fnrhDocumentUuid deve ser deletado`);
      assert.strictEqual(g.fnrhSha256Hash, undefined, `Guest ${g.index} fnrhSha256Hash deve ser deletado`);
    }
  });

  // ── CHALLENGE 2: Invalidação Pathway 2: Portal Checkout Settlement Commit ───
  it("CHALLENGE 2: Portal Checkout Settlement Commit invalida assinatura e limpa documentos antigos", async () => {
    // 1. Inicia hold de extensão no portal
    const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-9002/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-16", // +1 diária
        paymentMethod: "pix"
      })
    });
    assert.strictEqual(checkoutRes.status, 200);
    const checkoutJson = await checkoutRes.json();
    assert.ok(checkoutJson.pendingId, "Deve retornar pendingId");

    // Verifica que antes da liquidação a assinatura original permanece intacta
    const dbBefore = getDb();
    const rBefore = dbBefore.reservations.find(x => x.id === 9002);
    assert.strictEqual(rBefore.needsReSignature, false, "needsReSignature ainda false antes do pagamento");
    assert.strictEqual(rBefore.fnhrCompleted, true, "fnhrCompleted ainda true antes do pagamento");

    // 2. Simula liquidação via polling com simulatePayment=true
    const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-9002/modify-status?pendingId=${checkoutJson.pendingId}&simulatePayment=true`);
    assert.strictEqual(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.strictEqual(statusJson.committed, true);
    assert.strictEqual(statusJson.needsReSignature, true);
    assert.strictEqual(statusJson.reSignatureUrl, "/pre-checkin/RES-ADV-9002?resign=1");

    // 3. Verifica integridade do DB pós-liquidação
    const dbAfter = getDb();
    const rAfter = dbAfter.reservations.find(x => x.id === 9002);
    assert.strictEqual(rAfter.checkoutDate, "2026-11-16", "Nova data de checkout deve ter sido comitada");
    assert.strictEqual(rAfter.needsReSignature, true, "needsReSignature deve ser true");
    assert.strictEqual(rAfter.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(rAfter.signatureUrl, null, "signatureUrl deve ser null");
    assert.strictEqual(rAfter.fnrhPdfUrl, undefined, "fnrhPdfUrl antigo deve ser deletado");
    assert.strictEqual(rAfter.fnrhDocumentUuid, undefined, "fnrhDocumentUuid antigo deve ser deletado");
    assert.strictEqual(rAfter.fnrhSha256Hash, undefined, "fnrhSha256Hash antigo deve ser deletado");
    assert.strictEqual(rAfter.guests[0].needsReSignature, true);
    assert.strictEqual(rAfter.guests[0].hasCompletedCheckin, false);
  });

  // ── CHALLENGE 3: Invalidação Pathway 3: Direct Portal Modify (Custo Zero) ────
  it("CHALLENGE 3: Direct Portal Modify invalida assinatura e limpa documentos antigos", async () => {
    // Deslocamento de período com mesma quantidade de diárias (custo zero)
    const modRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-9003/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-21",
        newCheckoutDate: "2026-11-23"
      })
    });
    assert.strictEqual(modRes.status, 200);

    const db = getDb();
    const r = db.reservations.find(x => x.id === 9003);
    assert.strictEqual(r.checkinDate, "2026-11-21");
    assert.strictEqual(r.checkoutDate, "2026-11-23");
    assert.strictEqual(r.needsReSignature, true, "needsReSignature deve ser true");
    assert.strictEqual(r.fnhrCompleted, false, "fnhrCompleted deve ser false");
    assert.strictEqual(r.signatureUrl, null, "signatureUrl deve ser null");
    assert.strictEqual(r.fnrhPdfUrl, undefined, "fnrhPdfUrl deve ser deletado");
    assert.strictEqual(r.fnrhDocumentUuid, undefined, "fnrhDocumentUuid deve ser deletado");
    assert.strictEqual(r.fnrhSha256Hash, undefined, "fnrhSha256Hash deve ser deletado");
    assert.strictEqual(r.guests[0].needsReSignature, true);
    assert.strictEqual(r.guests[0].hasCompletedCheckin, false);
  });

  // ── CHALLENGE 4: Resolução Dinâmica de URL com getCheckinUrlSync & ?resign=1 ─
  it("CHALLENGE 4: getCheckinUrlSync adiciona dinamicamente ?resign=1 quando needsReSignature === true", () => {
    const src = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"), "utf8");
    const start = src.indexOf("export function getCheckinUrlSync");
    const end = src.indexOf("globalThis.getCheckinUrl = getCheckinUrl;", start);
    const code = src.substring(start, end).replace("export function getCheckinUrlSync", "function getCheckinUrlSync");
    const getCheckinUrlSync = new Function(code + "; return getCheckinUrlSync;")();

    // A. Reserva que necessita de re-assinatura, titular (guestIndex: 1)
    const rResign1 = { code: "RES-TEST-001", needsReSignature: true };
    const url1 = getCheckinUrlSync(rResign1, 1, "https://app.corpflats.com.br");
    assert.strictEqual(url1, "https://app.corpflats.com.br/pre-checkin/RES-TEST-001?resign=1");

    // B. Reserva que necessita de re-assinatura, acompanhante (guestIndex: 2)
    const url2 = getCheckinUrlSync(rResign1, 2, "https://app.corpflats.com.br");
    assert.strictEqual(url2, "https://app.corpflats.com.br/pre-checkin/RES-TEST-001?guest=2&resign=1");

    // C. Reserva regular sem re-assinatura pendente
    const rNormal = { code: "RES-TEST-002", needsReSignature: false };
    const urlNormal1 = getCheckinUrlSync(rNormal, 1, "https://app.corpflats.com.br");
    assert.strictEqual(urlNormal1, "https://app.corpflats.com.br/pre-checkin/RES-TEST-002?guest=1");

    // D. Provedor gov_fnrh ativo: se needsReSignature for true, força internal URL (?resign=1) e ignora link antigo
    const rGovResign = {
      code: "RES-TEST-003",
      needsReSignature: true,
      serproPrecheckinUrl: "https://fnrh.turismo.serpro.gov.br/link-antigo"
    };
    const dbMock = { settings: { checkinProvider: "gov_fnrh" } };
    const urlGov = getCheckinUrlSync(rGovResign, 1, "https://app.corpflats.com.br", dbMock);
    assert.strictEqual(urlGov, "https://app.corpflats.com.br/pre-checkin/RES-TEST-003?resign=1");
  });

  // ── CHALLENGE 5: Pre-Checkin Clearance e Geração Forense de Novo Hash SHA-256 ─
  it("CHALLENGE 5: POST /api/pms/pre-checkin limpa invalidation, gera novo FNRH PDF com SHA-256 fresco", async () => {
    // Reserva 9001 tem 2 hóspedes.
    // Passo 1: Acompanhante (hóspede 2) re-assina primeiro
    const resG2 = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 9001,
        guestIndex: 2,
        fullName: "Mariana Acompanhante Atualizada",
        document: "55566677788",
        phone: "5521999990002",
        email: "mariana.adv@example.com",
        signatureBase64: SAMPLE_SIG_2,
        resign: "1"
      })
    });
    assert.strictEqual(resG2.status, 200);
    const jsonG2 = await resG2.json();
    assert.strictEqual(jsonG2.success, true);

    let db = getDb();
    let r = db.reservations.find(x => x.id === 9001);
    assert.strictEqual(r.guests[1].needsReSignature, false, "Hóspede 2 re-assinou e needsReSignature deve ser false");
    assert.strictEqual(r.guests[1].hasCompletedCheckin, true);
    // Mas o titular ainda não re-assinou, logo a reserva no aggregate ainda deve estar pendente!
    assert.strictEqual(r.needsReSignature, true, "Reserva agregada ainda deve ter needsReSignature: true até titular assinar");

    // Passo 2: Titular (hóspede 1) re-assina
    const resG1 = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 9001,
        guestIndex: 1,
        fullName: "Carlos Eduardo Titular Atualizado",
        document: "11122233344",
        phone: "5521999990001",
        email: "carlos.adv@example.com",
        signatureBase64: SAMPLE_SIG_2,
        resign: "1"
      })
    });
    assert.strictEqual(resG1.status, 200);
    const jsonG1 = await resG1.json();
    assert.strictEqual(jsonG1.success, true);
    assert.ok(jsonG1.fnrhDocument, "Deve retornar objeto fnrhDocument");
    assert.ok(jsonG1.fnrhDocument.sha256Hash, "Deve possuir sha256Hash");
    assert.strictEqual(jsonG1.fnrhDocument.sha256Hash.length, 64);
    assert.notStrictEqual(jsonG1.fnrhDocument.sha256Hash, STALE_HASH_A, "Novo hash deve ser diferente do hash antigo");

    db = getDb();
    r = db.reservations.find(x => x.id === 9001);
    assert.strictEqual(r.needsReSignature, false, "needsReSignature deve ser false agora");
    assert.strictEqual(r.reSignatureReason, undefined, "reSignatureReason deve ter sido deletado");
    assert.strictEqual(r.fnhrCompleted, true, "fnhrCompleted deve ser true");
    assert.strictEqual(r.fnrhSha256Hash, jsonG1.fnrhDocument.sha256Hash, "Hash na reserva deve coincidir com o documento recém-gerado");

    // Trilha forense em db.fnrhAuditDocuments
    assert.ok(db.fnrhAuditDocuments.some(d => d.documentUuid === jsonG1.fnrhDocument.documentUuid), "Trilha forense deve estar em db.fnrhAuditDocuments");

    // Disparo de e-mail registrado com gatilho re_signature_checkin
    const comms = db.reservationCommunications || [];
    const reSignEmail = comms.find(c => (c.reservation_id === "RES-ADV-9001" || c.reservation_id === "9001") && c.metadata?.trigger === "re_signature_checkin");
    assert.ok(reSignEmail, "Deve existir e-mail registrado com trigger re_signature_checkin");
    assert.strictEqual(reSignEmail.metadata?.fnrhSha256Hash, jsonG1.fnrhDocument.sha256Hash);
  });

  // ── CHALLENGE 6: Idempotência - Chamar pre-checkin já assinado não corrompe estado
  it("CHALLENGE 6: Chamar POST /api/pms/pre-checkin em reserva já assinada mantém integridade sem corrupção", async () => {
    const resDup = await fetch(`${BASE_URL}/api/pms/pre-checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: 9001,
        guestIndex: 1,
        fullName: "Carlos Eduardo Titular Atualizado",
        document: "11122233344",
        phone: "5521999990001",
        email: "carlos.adv@example.com",
        signatureBase64: SAMPLE_SIG_2
      })
    });
    assert.strictEqual(resDup.status, 200, "Deve aceitar reenvio idempotente com status 200");

    const db = getDb();
    const r = db.reservations.find(x => x.id === 9001);
    assert.strictEqual(r.needsReSignature, false, "needsReSignature deve permanecer false");
    assert.strictEqual(r.fnhrCompleted, true, "fnhrCompleted deve permanecer true");
    assert.strictEqual(r.status, "confirmada", "status deve permanecer confirmada");
    assert.strictEqual(r.paidAmount, 360, "paidAmount não deve ser alterado");

    // Liberação de entrada na recepção continua válida
    const recRes = await fetch(`${BASE_URL}/api/reception/today`);
    assert.strictEqual(recRes.status, 200);
    const recJson = await recRes.json();
    const arr = (recJson.arrivals || []).find(x => x.id === 9001);
    assert.ok(arr);
    assert.strictEqual(arr.needsReSignature, false);
    assert.strictEqual(arr.canAuthorizeEntry, true);
  });

  // ── CHALLENGE 7: Paridade Estrita SHA-256 Entre Twin Servers ───────────────
  it("CHALLENGE 7: Paridade estrita byte-a-byte entre scripts/ e artifacts/api-server/", () => {
    const pairs = [
      ["scripts/demo-server.mjs", "artifacts/api-server/demo-server.mjs"],
      ["scripts/fnrh-pdf-service.mjs", "artifacts/api-server/fnrh-pdf-service.mjs"],
      ["scripts/zapi-service.mjs", "artifacts/api-server/zapi-service.mjs"],
      ["scripts/mail-service.mjs", "artifacts/api-server/mail-service.mjs"],
      ["scripts/storage-service.mjs", "artifacts/api-server/storage-service.mjs"],
      ["scripts/whatsapp-ai-service.mjs", "artifacts/api-server/whatsapp-ai-service.mjs"]
    ];

    for (const [f1, f2] of pairs) {
      const p1 = path.join(rootDir, f1);
      const p2 = path.join(rootDir, f2);
      if (fs.existsSync(p1) && fs.existsSync(p2)) {
        const b1 = fs.readFileSync(p1);
        const b2 = fs.readFileSync(p2);
        const h1 = crypto.createHash("sha256").update(b1).digest("hex");
        const h2 = crypto.createHash("sha256").update(b2).digest("hex");
        assert.strictEqual(h1, h2, `Discrepância de hash SHA-256 entre ${f1} e ${f2}`);
      }
    }
  });
});
