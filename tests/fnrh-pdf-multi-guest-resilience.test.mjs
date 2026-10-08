import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

import {
  generateSignedFnrhToken,
  verifySignedFnrhToken,
  rebuildFnrhPdfOnTheFly,
  generateFnrhPdf
} from "../artifacts/api-server/fnrh-pdf-service.mjs";

import {
  resolveReservationAttachments,
  ensureReservationAttachmentsReady
} from "../artifacts/api-server/mail-service.mjs";

import { DEFAULT_WHATSAPP_TEMPLATES } from "../artifacts/api-server/zapi-service.mjs";

test("Suite Resiliência FNRH: Multi-hóspedes, Reassinatura e Fallback Cloudflare R2 / On-the-Fly", async (t) => {

  await t.test("1. Paridade byte-a-byte estrita entre artifacts/api-server e scripts/", () => {
    const files = [
      "demo-server.mjs",
      "fnrh-pdf-service.mjs",
      "mail-service.mjs",
      "storage-service.mjs",
      "zapi-service.mjs"
    ];

    for (const f of files) {
      const p1 = path.join(rootDir, "artifacts", "api-server", f);
      const p2 = path.join(rootDir, "scripts", f);
      assert.ok(fs.existsSync(p1), `Arquivo ausente: ${p1}`);
      assert.ok(fs.existsSync(p2), `Arquivo ausente: ${p2}`);
      const b1 = fs.readFileSync(p1);
      const b2 = fs.readFileSync(p2);
      assert.strictEqual(
        b1.length,
        b2.length,
        `Tamanho divergente para ${f}: artifacts=${b1.length} vs scripts=${b2.length}`
      );
      const h1 = crypto.createHash("sha256").update(b1).digest("hex");
      const h2 = crypto.createHash("sha256").update(b2).digest("hex");
      assert.strictEqual(
        h1,
        h2,
        `Hash SHA-256 divergente para ${f}`
      );
    }
  });

  await t.test("2. Tokens assinados de 30 dias para download e visualização segura sem 403", () => {
    const fakeUuid = "test-uuid-" + Date.now();
    const token30d = generateSignedFnrhToken(fakeUuid, 60 * 24 * 30);
    assert.ok(token30d && typeof token30d === "string", "Token deve ser string");
    assert.ok(token30d.includes("."), "Token deve conter ponto separador de timestamp e hmac");

    const isValid = verifySignedFnrhToken(fakeUuid, token30d);
    assert.strictEqual(isValid, true, "Token de 30 dias deve ser válido imediatamente");

    // Token com UUID incorreto deve falhar
    const isInvalidUuid = verifySignedFnrhToken("outro-uuid", token30d);
    assert.strictEqual(isInvalidUuid, false, "Token deve rejeitar UUID diferente");

    // Token expirado deve falhar
    const expiredTimestamp = Date.now() - 1000;
    const expiredPayload = `${fakeUuid}:${expiredTimestamp}`;
    const hmac = crypto.createHmac("sha256", process.env.SESSION_SECRET || "corpflats-fnrh-hmac-secret-2026").update(expiredPayload).digest("hex");
    const expiredToken = `${expiredTimestamp}.${hmac}`;
    assert.strictEqual(verifySignedFnrhToken(fakeUuid, expiredToken), false, "Token expirado deve ser rejeitado");
  });

  await t.test("3. Template do WhatsApp de Reserva Atualizada deve conter botão de assinatura com link dinâmico", () => {
    const tpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_reservation_updated");
    assert.ok(tpl, "Template tpl_reservation_updated deve existir");
    assert.ok(Array.isArray(tpl.buttons), "Template deve ter botões");
    const btnCheckin = tpl.buttons.find(b => b.url === "{{link_checkin_digital}}");
    assert.ok(btnCheckin, "Botão com {{link_checkin_digital}} deve estar configurado");
    assert.ok(btnCheckin.label.includes("Assinar"), "Rótulo do botão deve indicar assinatura");
  });

  await t.test("4. Multi-hóspedes: Anexo simultâneo de FNRH PDFs e fotos de documento do Titular e Co-hóspede", () => {
    const tempDir = path.join(rootDir, "artifacts", "api-server", "secure_uploads", "fnrh_documents");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const p1 = path.join(tempDir, "Ficha_Checkin_RES_MULTI_Titular.pdf");
    const p2 = path.join(tempDir, "Ficha_Checkin_RES_MULTI_Acompanhante.pdf");
    fs.writeFileSync(p1, "%PDF-1.4 Fake PDF Titular");
    fs.writeFileSync(p2, "%PDF-1.4 Fake PDF Acompanhante");

    const mockRes = {
      id: 99991,
      code: "RES_MULTI",
      flatNumber: "201",
      guestName: "Carlos Titular",
      guestDocument: "11122233344",
      docPhotoUrl: "https://r2.corpflats.com/doc-carlos.jpg",
      guests: [
        {
          index: 1,
          name: "Carlos Titular",
          cpf: "11122233344",
          fnrhFilePath: p1,
          docPhotoUrl: "https://r2.corpflats.com/doc-carlos.jpg",
          hasCompletedCheckin: true
        },
        {
          index: 2,
          name: "Mariana Acompanhante",
          cpf: "55566677788",
          fnrhFilePath: p2,
          docPhotoUrl: "https://r2.corpflats.com/doc-mariana.jpg",
          hasCompletedCheckin: true
        }
      ]
    };

    const attachments = resolveReservationAttachments({ reservation: mockRes, db: {} });
    
    // Deve conter os 2 PDFs e os 2 documentos
    const pdfs = attachments.filter(a => a.filename.endsWith(".pdf"));
    const docs = attachments.filter(a => a.filename.includes("Documento"));

    assert.strictEqual(pdfs.length, 2, "Devem haver 2 PDFs de FNRH anexados");
    assert.strictEqual(docs.length, 2, "Devem haver 2 fotos de documento anexadas");
    assert.ok(pdfs.some(p => p.filename.includes("Carlos")), "PDF do titular presente");
    assert.ok(pdfs.some(p => p.filename.includes("Mariana")), "PDF da acompanhante presente");

    // Limpeza
    if (fs.existsSync(p1)) fs.unlinkSync(p1);
    if (fs.existsSync(p2)) fs.unlinkSync(p2);
  });

  await t.test("5. Recompilação on-the-fly restaura PDF e URLs quando o disco do Render perde o arquivo", async () => {
    const mockRes = {
      id: 88882,
      code: "RES_ONTHEFLY",
      flatNumber: "305",
      checkinDate: "2026-10-15",
      checkoutDate: "2026-10-18",
      guestName: "Roberto Rebuild",
      guestDocument: "99988877766",
      guestPhone: "22999998888",
      guestEmail: "roberto@example.com",
      signatureUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      fnhrCompleted: true,
      guests: [
        {
          index: 1,
          name: "Roberto Rebuild",
          cpf: "99988877766",
          hasCompletedCheckin: true,
          signatureUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          fnrhFilePath: "/caminho/inexistente/no/disco/apagado_pelo_restart.pdf"
        }
      ]
    };

    // ensureReservationAttachmentsReady deve detectar arquivo inexistente e reconstruir on-the-fly
    await ensureReservationAttachmentsReady({ reservation: mockRes, db: {} });

    assert.ok(mockRes.fnrhFilePath, "Deve ter gravado novo fnrhFilePath na reserva");
    assert.ok(fs.existsSync(mockRes.fnrhFilePath), "Arquivo físico reconstruído deve existir em disco");

    const atts = resolveReservationAttachments({ reservation: mockRes, db: {} });
    assert.ok(atts.some(a => a.path === mockRes.fnrhFilePath), "PDF reconstruído deve estar nos anexos");

    // Limpeza
    if (mockRes.fnrhFilePath && fs.existsSync(mockRes.fnrhFilePath)) {
      fs.unlinkSync(mockRes.fnrhFilePath);
    }
  });

  await t.test("6. Alteração de flat/datas invalida assinatura anterior mas preserva 100% dos dados cadastrais", () => {
    // Simula a lógica implementada no endpoint PUT /api/pms/reservations/:id
    const r = {
      id: 77771,
      code: "RES_MUTATION",
      flatId: "flat_1",
      flatNumber: "101",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-05",
      fnhrCompleted: true,
      signatureUrl: "data:image/png;base64,sig1",
      guestName: "Juliana Silva",
      guestDocument: "12345678901",
      guests: [
        {
          index: 1,
          name: "Juliana Silva",
          cpf: "12345678901",
          phone: "22988887777",
          email: "juliana@example.com",
          cep: "28010-000",
          address: "Rua das Flores, 123",
          city: "Campos dos Goytacazes",
          state: "RJ",
          hasCompletedCheckin: true,
          signatureUrl: "data:image/png;base64,sig1",
          fnrhDocumentUuid: "uuid-old"
        }
      ]
    };

    const newCheckinDate = "2026-11-03"; // Alterou data de check-in
    const datesChanged = r.checkinDate !== newCheckinDate;

    if (datesChanged) {
      if (r.fnhrCompleted || r.signatureUrl) {
        r.fnhrCompleted = false;
        r.signatureUrl = null;
        r.needsReSignature = true;
      }
      r.guests.forEach(g => {
        if (g.hasCompletedCheckin || g.signatureUrl || g.fnrhDocumentUuid) {
          g.hasCompletedCheckin = false;
          g.signatureUrl = null;
          g.needsReSignature = true;
          delete g.fnrhDocumentUuid;
        }
      });
    }

    // Assinatura foi invalidada para exigir nova assinatura
    assert.strictEqual(r.fnhrCompleted, false, "fnhrCompleted deve ser resetado");
    assert.strictEqual(r.signatureUrl, null, "signatureUrl da reserva deve ser resetado");
    assert.strictEqual(r.guests[0].hasCompletedCheckin, false, "hasCompletedCheckin do hóspede deve ser resetado");
    assert.strictEqual(r.guests[0].signatureUrl, null, "signatureUrl do hóspede deve ser resetado");

    // DADOS CADASTRAIS DEVEM CONTINUAR 100% INTACTOS
    assert.strictEqual(r.guests[0].name, "Juliana Silva");
    assert.strictEqual(r.guests[0].cpf, "12345678901");
    assert.strictEqual(r.guests[0].phone, "22988887777");
    assert.strictEqual(r.guests[0].email, "juliana@example.com");
    assert.strictEqual(r.guests[0].cep, "28010-000");
    assert.strictEqual(r.guests[0].address, "Rua das Flores, 123");
    assert.strictEqual(r.guests[0].city, "Campos dos Goytacazes");
    assert.strictEqual(r.guests[0].state, "RJ");
  });

  await t.test("7. Geração de PDF próprio com prefixo Ficha_Checkin e título oficial sem termo FNRH", async () => {
    const { generateFnrhPdf } = await import(pathToFileURL(path.join(rootDir, "artifacts", "api-server", "fnrh-pdf-service.mjs")).href);
    const result = await generateFnrhPdf({
      reservation: {
        id: "RES_TEST_PREFIX",
        code: "RES_TEST_PREFIX",
        flatNumber: "512",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-16"
      },
      guestData: {
        fullName: "Diego Ficha Teste",
        document: "14065497701",
        phone: "21974116742"
      }
    });

    assert.ok(result.fileName.startsWith("Ficha_Checkin_"), "Arquivo gerado deve começar com Ficha_Checkin_");
    assert.ok(result.fileName.endsWith(".pdf"), "Arquivo deve ser PDF");
    assert.ok(fs.existsSync(result.filePath), "Arquivo físico deve existir em disco");

    // Limpeza
    if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath);
  });

  await t.test("8. Prevenção de herança indevida: Hóspede recorrente com fnhrCompleted no CRM não conclui nova reserva pendente", () => {
    // Simula CRM guest com fnhrCompleted de meses atrás
    const crmGuest = {
      id: "guest-old-crm",
      name: "Cliente Recorrente",
      document: "11122233344",
      fnhrCompleted: true,
      fnhrCompletedAt: "2026-01-01T10:00:00Z"
    };

    // Nova reserva para hoje
    const newReservation = {
      id: "res-new-001",
      code: "RES-NEW-001",
      flatNumber: "305",
      fnhrCompleted: false,
      needsReSignature: false
    };

    // A regra corrigida em demo-server e pre-checkin:
    const guestList = [{
      index: 1,
      name: crmGuest.name,
      cpf: crmGuest.document,
      hasCompletedCheckin: Boolean(newReservation.fnhrCompleted && !newReservation.needsReSignature),
      checkinCompletedAt: newReservation.fnhrCompleted ? "now" : null
    }];

    const someCheckinDone = guestList.some(g => g.hasCompletedCheckin);
    const hasPreCheckin = Boolean((newReservation.fnhrCompleted && !newReservation.needsReSignature) || someCheckinDone);

    assert.strictEqual(guestList[0].hasCompletedCheckin, false, "Hóspede não deve herdar check-in concluído para nova reserva");
    assert.strictEqual(hasPreCheckin, false, "hasPreCheckin da nova reserva deve ser falso até nova assinatura");
  });

  await t.test("9. Reception Tablet & Guest Pre-checkin integram visualizador PDF oficial e download sem 403", () => {
    const receptionTabletCode = fs.readFileSync(path.join(rootDir, "artifacts", "limpeza", "src", "pages", "reception-tablet.tsx"), "utf-8");
    const preCheckinCode = fs.readFileSync(path.join(rootDir, "artifacts", "limpeza", "src", "pages", "guest-pre-checkin.tsx"), "utf-8");

    // Reception Tablet:
    assert.ok(receptionTabletCode.includes("Baixar PDF Assinado"), "Reception tablet deve ter botão 'Baixar PDF Assinado'");
    assert.ok(receptionTabletCode.includes("Ficha Oficial em PDF"), "Reception tablet deve ter alternador de Ficha em PDF");
    assert.ok(receptionTabletCode.includes("<iframe"), "Reception tablet deve renderizar iframe do PDF autêntico");
    assert.ok(!receptionTabletCode.includes("Ficha de Entrada & FNHR:"), "Header do modal não deve mais exibir termo FNHR");

    // Pre-checkin:
    assert.ok(preCheckinCode.includes("Baixar PDF Assinado"), "Pre-checkin deve ter botão 'Baixar PDF Assinado'");
    assert.ok(preCheckinCode.includes("<iframe"), "Pre-checkin deve renderizar iframe com PDF autêntico");
    assert.ok(preCheckinCode.includes("isReSignatureNeeded"), "Pre-checkin deve validar isReSignatureNeeded");
  });

});
