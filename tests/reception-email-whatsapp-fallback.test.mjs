import assert from "node:assert/strict";
import test from "node:test";
import {
  sendEmailAsync,
  ensureReceptionEmailFallbackState,
  isReceptionEmailFallbackActive,
  dispatchRetroactiveTodayReceptionEmailsToWhatsApp,
  getReceptionEmailFallbackStatusSummary,
  getBrasiliaTodayStr,
  renderCheckinConfirmedEmail,
  renderReservationUpdateEmail
} from "../artifacts/api-server/mail-service.mjs";
import { processInboundBounceOrDelayForReceptionEmail } from "../artifacts/api-server/zoho-mail-service.mjs";
import { appendMessageToConversation, isBuildingReceptionPhone } from "../artifacts/api-server/zapi-service.mjs";

test("Reception Email -> WhatsApp 2237040100 Fallback: today-only retroactive, attachments in chat, idempotency, and auto-detection", async () => {
  const todayBr = getBrasiliaTodayStr();
  assert.ok(todayBr >= "2026-11-13", `Expected todayBr >= 2026-11-13, got ${todayBr}`);

  const sentTexts = [];
  const sentDocs = [];

  const db = {
    settings: {
      receptionEmail: "soho@promenade.com.br",
      garageEmail: "promenadesoho@pfbestacionamentos.com.br",
      buildingName: "Edifício Soho Residence Service"
    },
    flats: [{ id: 605, number: "605", buildingName: "Edifício Soho Residence Service" }],
    reservations: [
      {
        id: 542,
        code: "RES-605-0542",
        flatId: 605,
        flatNumber: "605",
        guestName: "José Luiz Costa Neto",
        guestPhone: "5522999112233",
        checkinDate: todayBr,
        checkoutDate: "2026-11-16",
        status: "confirmada",
        hasPreCheckin: true,
        docPhotoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
      }
    ],
    whatsappConversations: [
      {
        id: "552237040100",
        phone: "552237040100",
        name: "Ordem de Serviço (Higienização Ar Condicionado)",
        aiPaused: false,
        reservationCode: "OLD-RES",
        messages: []
      }
    ],
    reservationCommunications: []
  };

  const mockOverrides = {
    attachmentDelayMs: 0,
    sendZapiMessageFn: async (phone, message, opts = {}) => {
      const msgId = `zapi_txt_${sentTexts.length + 1}`;
      sentTexts.push({ phone, message, opts, messageId: msgId });
      return { success: true, messageId: msgId, phone };
    },
    sendZapiDocumentFn: async (opts = {}) => {
      const msgId = `zapi_doc_${sentDocs.length + 1}`;
      sentDocs.push({ ...opts, messageId: msgId });
      return { success: true, messageId: msgId, phone: opts.phone };
    },
    appendMessageToConversationFn: (opts = {}) => appendMessageToConversation(db, opts)
  };

  // 1. E-mail de ONTEM (NÃO PODE SER ENVIADO!)
  db.reservationCommunications.push({
    id: "comm_yesterday_001",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    subject: "Flat 605 - Hóspede de Ontem (12/11/2026 a 13/11/2026)",
    body: "<p>E-mail de ontem</p>",
    status: "sent",
    metadata: { trigger: "morning_checkin_07h", hasAttachments: false, attachmentsCount: 0 },
    created_at: "2026-11-12T22:00:00.000Z" // 19:00 BRT de 12/11/2026
  });

  // 2. E-mail exclusivo da GARAGEM hoje (NÃO é da recepção, não pode ir para recepção!)
  db.reservationCommunications.push({
    id: "comm_garage_only_today",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "promenadesoho@pfbestacionamentos.com.br",
    cc: null,
    subject: "Flat 605 - Veículo Garagem",
    body: "<p>Apenas garagem</p>",
    status: "sent",
    metadata: { trigger: "pre_checkin_vehicle", hasAttachments: false, attachmentsCount: 0 },
    created_at: `${todayBr}T10:05:00.000Z`
  });

  // 3. E-mail da Recepção HOJE 07:04 BRT (sem anexos ainda)
  const checkinRendered = renderCheckinConfirmedEmail({
    reservation: { ...db.reservations[0], hasPreCheckin: false },
    flat: db.flats[0],
    settings: db.settings,
    db
  });
  db.reservationCommunications.push({
    id: "comm_today_07h",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    cc: "promenadesoho@pfbestacionamentos.com.br",
    subject: checkinRendered.subject,
    body: checkinRendered.bodyHtml,
    status: "sent",
    metadata: { trigger: "morning_checkin_07h", flatNumber: "605", guestName: "José Luiz Costa Neto", hasAttachments: false, attachmentsCount: 0 },
    created_at: `${todayBr}T10:04:28.000Z`
  });

  // 4. E-mail de Alteração de Flat HOJE 09:52 BRT (inserido fora de ordem para testar ordenação cronológica!)
  const updateRendered = renderReservationUpdateEmail({
    reservation: db.reservations[0],
    flat: db.flats[0],
    changes: [{ field: "flatNumber", label: "Apartamento", oldValue: "408", newValue: "605" }],
    settings: db.settings,
    db
  });

  // 5. E-mail de Check-in Concluído HOJE 10:43 BRT COM ANEXO (foto documento oficial)
  db.reservationCommunications.unshift({
    id: "comm_today_10h43_with_att",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    cc: "promenadesoho@pfbestacionamentos.com.br",
    subject: "Flat 605 - José Luiz Costa Neto (13/11/2026 a 16/11/2026)",
    body: checkinRendered.bodyHtml,
    status: "sent",
    metadata: {
      trigger: "pre_checkin",
      flatNumber: "605",
      guestName: "José Luiz Costa Neto",
      hasAttachments: true,
      attachmentsCount: 1,
      hasDocumentAttached: true
    },
    created_at: `${todayBr}T13:43:50.000Z`
  });

  db.reservationCommunications.push({
    id: "comm_today_09h52_update",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    subject: updateRendered.subject,
    body: updateRendered.bodyHtml,
    status: "sent",
    metadata: { trigger: "reservation_update", flatNumber: "605", guestName: "José Luiz Costa Neto", hasAttachments: false, attachmentsCount: 0 },
    created_at: `${todayBr}T12:52:01.000Z`
  });

  assert.equal(isBuildingReceptionPhone("2237040100", db), true);
  assert.equal(isBuildingReceptionPhone("552237040100", db), true);

  // Executa varredura retroativa de hoje
  const sweep1 = await dispatchRetroactiveTodayReceptionEmailsToWhatsApp(db, null, {
    pacingDelayMs: 0,
    todayBrOverride: todayBr,
    overrides: mockOverrides
  });

  assert.equal(sweep1.ok, true);
  assert.equal(sweep1.sentCount, 3, "Must forward ONLY the 3 reception emails from today (excluding yesterday and garage-only)");
  assert.equal(sentTexts.length, 3);
  assert.equal(sentDocs.length, 1, "Must forward the 1 attachment from comm_today_10h43_with_att");

  // Verifica ordem estritamente cronológica (07:04 -> 09:52 -> 10:43)
  assert.ok(sentTexts[0].phone === "552237040100");
  assert.ok(sentTexts[1].message.includes("408"), "Second message must be the 09:52 flat update");
  assert.ok(sentTexts[2].message.includes("1 anexo(s)"), "Third message must be the 10:43 pre-checkin with attachment");
  assert.ok(sentDocs[0].phone === "552237040100");
  assert.ok(String(sentDocs[0].document).startsWith("data:image/jpeg;base64,"), "Document payload must be valid base64 data URI");

  // Verifica conversa 552237040100 no WhatsApp Chat
  const recConv = db.whatsappConversations.find(c => c.phone === "552237040100");
  assert.ok(recConv);
  assert.equal(recConv.name, "Recepção Promenade Soho", "Must heal stale Ordem de Serviço name to Recepção Promenade Soho");
  assert.equal(recConv.aiPaused, true, "Must keep AI paused on internal building reception chat");
  assert.equal(recConv.reservationCode, null, "Must never bind reception chat to a guest reservationCode");
  assert.equal(recConv.messages.length, 4, "3 email texts + 1 attached document in chat");
  const docChatMsg = recConv.messages.find(m => m.type === "document");
  assert.ok(docChatMsg, "Attachment must be appended to conversation as type=document");
  assert.ok(String(docChatMsg.mediaUrl).startsWith("/api/emails/reception-fallback/attachment/comm_today_10h43_with_att/0/"));
  assert.ok(docChatMsg.fileName.endsWith(".jpg"));

  // Verifica idempotência absoluta: rodar de novo não envia nada duplicado
  const sweep2 = await dispatchRetroactiveTodayReceptionEmailsToWhatsApp(db, null, {
    pacingDelayMs: 0,
    todayBrOverride: todayBr,
    overrides: mockOverrides
  });
  assert.equal(sweep2.sentCount, 0, "Second retroactive sweep must send 0 duplicates");
  assert.equal(sentTexts.length, 3);

  // Verifica detecção automática em modo "auto" via DSN de atraso da Microsoft (Status: 451 / Action: delayed)
  const cfg = ensureReceptionEmailFallbackState(db);
  cfg.mode = "auto";
  cfg.autoActiveUntil = null;
  assert.equal(isReceptionEmailFallbackActive(db), false, "In auto mode with no active issue, fallback starts inactive");

  // Novo e-mail enviado antes do DSN chegar (simulando SMTP aceito pelo Zoho antes do bounce/delay da Microsoft)
  db.reservationCommunications.unshift({
    id: "comm_today_pending_dsn",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    subject: "Flat 605 - Novo Aviso Antes do DSN",
    body: "<p>Teste auto-recovery pós DSN</p>",
    status: "sent",
    metadata: { trigger: "manual", hasAttachments: false, attachmentsCount: 0 },
    created_at: new Date().toISOString()
  });

  globalThis.__corpflatsSendZapiMessage = mockOverrides.sendZapiMessageFn;
  globalThis.__corpflatsSendZapiDocument = mockOverrides.sendZapiDocumentFn;
  globalThis.__corpflatsAppendMessageToConversation = mockOverrides.appendMessageToConversationFn;

  const dsnRes = await processInboundBounceOrDelayForReceptionEmail(db, null, {
    fromEmail: "mailer-daemon@mail.zoho.com",
    subject: "Mail Delivery Status Notification (Delay)",
    snippet: "THIS IS A WARNING MESSAGE ONLY",
    bodyHtml: "<div>Final-Recipient: rfc822; soho@promenade.com.br<br>Status: 451<br>Action: delayed<br>Diagnostic-Code: 4.7.0 Temporary server error. NextHop: substrate-int.office.com</div>",
    direction: "inbound",
    created_at: new Date().toISOString()
  });

  assert.equal(dsnRes.isReceptionIssue, true);
  assert.equal(dsnRes.issueType, "delayed");
  assert.equal(isReceptionEmailFallbackActive(db), true, "Microsoft Delay DSN must automatically activate reception WhatsApp fallback");
  assert.equal(dsnRes.retroactiveSentCount, 1, "DSN auto-recovery must immediately sweep today's unforwarded reception email");
  assert.equal(sentTexts.length, 4);

  // Verifica envio ao vivo com anexo PDF em memória + falha SMTP
  const fakePdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8");
  sendEmailAsync({
    db,
    reservationId: "RES-605-0542",
    recipient: "soho@promenade.com.br",
    subject: "Flat 605 - Envio Ao Vivo com PDF",
    bodyHtml: "<p>Ficha em anexo</p>",
    attachments: [{ filename: "FNRH_Teste.pdf", content: fakePdfBuffer, contentType: "application/pdf" }],
    overrides: {
      ...mockOverrides,
      transporter: {
        sendMail: async () => {
          throw new Error("451 4.7.0 Temporary server error Microsoft Exchange");
        }
      }
    }
  });

  await new Promise(r => setTimeout(r, 120));
  assert.equal(sentTexts.length, 5, "Live sendEmailAsync SMTP failure must immediately fallback to WhatsApp");
  assert.equal(sentDocs.length, 2, "Live sendEmailAsync attachment must be sent via sendZapiDocument");
  assert.ok(String(sentDocs[1].document).startsWith("data:application/pdf;base64,"));

  const statusSummary = getReceptionEmailFallbackStatusSummary(db);
  assert.equal(statusSummary.todayTotalReceptionEmails, 5);
  assert.equal(statusSummary.todayForwardedCount, 5);
  assert.equal(statusSummary.todayPendingCount, 0);
});
