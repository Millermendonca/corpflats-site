import assert from "node:assert/strict";
import test from "node:test";
import {
  sendEmailAsync,
  ensureReceptionEmailFallbackState,
  isReceptionEmailFallbackActive,
  evaluateReceptionEmailFallbackAutoRecovery,
  formatReceptionEmailForWhatsApp,
  dispatchRetroactiveTodayReceptionEmailsToWhatsApp,
  getReceptionEmailFallbackStatusSummary,
  getBrasiliaTodayStr,
  renderCheckinConfirmedEmail,
  renderReservationUpdateEmail
} from "../artifacts/api-server/mail-service.mjs";
import { processInboundBounceOrDelayForReceptionEmail } from "../artifacts/api-server/zoho-mail-service.mjs";
import { appendMessageToConversation, isBuildingReceptionPhone } from "../artifacts/api-server/zapi-service.mjs";

test("Reception Email -> WhatsApp 2237040100 Fallback: zero CSS leak on 3000-char truncated HTML, today-only, attachments, and automatic self-deactivation", async () => {
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
        guestDocument: "123.456.789-00",
        guestPhone: "5522999112233",
        checkinDate: todayBr,
        checkoutDate: "2026-11-16",
        vehicleModel: "Toyota Corolla",
        vehicleColor: "Prata",
        vehiclePlate: "RJA4B21",
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

  // 0. Por padrão (sem falha recente), o fallback começa em modo "auto" e INATIVO
  const initialCfg = ensureReceptionEmailFallbackState(db);
  assert.equal(initialCfg.mode, "auto");
  assert.equal(isReceptionEmailFallbackActive(db), false, "Fallback must start inactive when email is healthy");

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
    created_at: "2026-11-12T22:00:00.000Z"
  });

  // 2. E-mail exclusivo da GARAGEM hoje (NÃO é da recepção!)
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

  // 3. REPRODUÇÃO EXATA DO BUG DO SCREENSHOT: comm.body truncado em 3000 chars no meio da tag <style>!
  const checkinRendered = renderCheckinConfirmedEmail({
    reservation: { ...db.reservations[0], hasPreCheckin: false },
    flat: db.flats[0],
    settings: db.settings,
    db
  });
  const truncatedAt3000Body = checkinRendered.bodyHtml.slice(0, 3000);
  assert.equal(truncatedAt3000Body.includes("</style>"), false, "Sanity check: 3000-char slice cuts right inside <style>");

  db.reservationCommunications.push({
    id: "comm_today_07h_truncated_css",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    cc: "promenadesoho@pfbestacionamentos.com.br",
    subject: checkinRendered.subject,
    body: truncatedAt3000Body,
    status: "sent",
    metadata: { trigger: "morning_checkin_07h", flatNumber: "605", guestName: "José Luiz Costa Neto", hasAttachments: false, attachmentsCount: 0 },
    created_at: `${todayBr}T10:04:28.000Z`
  });

  // 4. E-mail de Alteração de Flat HOJE com HTML completo
  const updateRendered = renderReservationUpdateEmail({
    reservation: db.reservations[0],
    flat: db.flats[0],
    changes: [{ field: "flatNumber", label: "Apartamento", oldValue: "408", newValue: "605" }],
    settings: db.settings,
    db
  });

  // 5. E-mail de Check-in Concluído HOJE COM ANEXO (foto documento oficial) e body truncado em 3000 chars
  db.reservationCommunications.unshift({
    id: "comm_today_10h43_with_att",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    cc: "promenadesoho@pfbestacionamentos.com.br",
    subject: "Flat 605 - José Luiz Costa Neto (13/11/2026 a 16/11/2026)",
    body: truncatedAt3000Body,
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

  // Executa varredura retroativa forçada de hoje
  const sweep1 = await dispatchRetroactiveTodayReceptionEmailsToWhatsApp(db, null, {
    force: true,
    pacingDelayMs: 0,
    todayBrOverride: todayBr,
    overrides: mockOverrides
  });

  assert.equal(sweep1.ok, true);
  assert.equal(sweep1.sentCount, 3, "Must forward ONLY the 3 reception emails from today");
  assert.equal(sentTexts.length, 3);
  assert.equal(sentDocs.length, 1);

  // VALIDAÇÃO CRÍTICA ZERO-CSS: Nenhuma mensagem enviada ao WhatsApp pode conter CSS bruto!
  for (const st of sentTexts) {
    assert.equal(st.message.includes("-webkit-text-size-adjust"), false, `CSS leaked in WhatsApp text: ${st.message}`);
    assert.equal(st.message.includes("mso-table-lspace"), false, `MSO CSS leaked in WhatsApp text: ${st.message}`);
    assert.equal(st.message.includes(".email-card"), false, `CSS class leaked in WhatsApp text: ${st.message}`);
    assert.equal(st.message.includes(".guest-box"), false, `Truncated CSS class leaked in WhatsApp text: ${st.message}`);
    assert.equal(st.message.includes("background-color:"), false, `CSS property leaked in WhatsApp text: ${st.message}`);
  }

  // E a mensagem reconstruída a partir do HTML truncado contém os dados operacionais limpos!
  assert.ok(sentTexts[0].message.includes("Flat 605"), "Clean operational summary must include Flat 605");
  assert.ok(sentTexts[0].message.includes("José Luiz Costa Neto"), "Clean operational summary must include guest name");
  assert.ok(sentTexts[0].message.includes("RJA4B21"), "Clean operational summary must include vehicle plate");
  assert.ok(sentTexts[1].message.includes("408"), "Full HTML update message must preserve content without CSS");
  assert.equal(sentTexts[1].message.includes("Sistema Transacional de Hotelaria"), false, "Must strip institutional footer");

  // Verifica idempotência absoluta
  const sweep2 = await dispatchRetroactiveTodayReceptionEmailsToWhatsApp(db, null, {
    force: true,
    pacingDelayMs: 0,
    todayBrOverride: todayBr,
    overrides: mockOverrides
  });
  assert.equal(sweep2.sentCount, 0);

  // 6. Teste de DSN ANTIGO (> 75 min atrás): NÃO pode ativar o fallback!
  globalThis.__corpflatsSendZapiMessage = mockOverrides.sendZapiMessageFn;
  globalThis.__corpflatsSendZapiDocument = mockOverrides.sendZapiDocumentFn;
  globalThis.__corpflatsAppendMessageToConversation = mockOverrides.appendMessageToConversationFn;

  const staleThreeHoursAgoIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  if (staleThreeHoursAgoIso.startsWith(todayBr)) {
    const staleDsnRes = await processInboundBounceOrDelayForReceptionEmail(db, null, {
      id: "zoho_stale_dsn_morning",
      fromEmail: "mailer-daemon@mail.zoho.com",
      subject: "Mail Delivery Status Notification (Delay)",
      bodyHtml: "<div>Final-Recipient: rfc822; soho@promenade.com.br<br>Status: 451<br>Action: delayed</div>",
      direction: "inbound",
      created_at: staleThreeHoursAgoIso
    });
    assert.equal(staleDsnRes.autoFallbackActivated, false, "Stale DSN from hours ago must NOT activate fallback");
    assert.equal(isReceptionEmailFallbackActive(db), false);
  }

  // 7. Teste de DSN NOVO (agora): ATIVA automaticamente e varre pendente da queda atual
  db.reservationCommunications.unshift({
    id: "comm_today_pending_dsn",
    reservation_id: "RES-605-0542",
    type: "email",
    direction: "outbound",
    recipient: "soho@promenade.com.br",
    subject: "Flat 605 - Novo Aviso Antes do DSN",
    body: checkinRendered.bodyHtml,
    status: "sent",
    metadata: { trigger: "manual", hasAttachments: false, attachmentsCount: 0 },
    created_at: new Date().toISOString()
  });

  const freshDsnRes = await processInboundBounceOrDelayForReceptionEmail(db, null, {
    id: "zoho_fresh_dsn_now",
    fromEmail: "mailer-daemon@mail.zoho.com",
    subject: "Mail Delivery Status Notification (Delay)",
    bodyHtml: "<div>Final-Recipient: rfc822; soho@promenade.com.br<br>Status: 451<br>Action: delayed<br>Diagnostic-Code: 4.7.0 Temporary server error</div>",
    direction: "inbound",
    created_at: new Date().toISOString()
  });

  assert.equal(freshDsnRes.autoFallbackActivated, true);
  assert.equal(isReceptionEmailFallbackActive(db), true, "Fresh Microsoft 451 DSN must activate fallback");
  assert.equal(sentTexts.length, 4);
  assert.equal(sentTexts[3].message.includes("-webkit-text-size-adjust"), false);

  // 8. AUTO-DESATIVAÇÃO (Sinal 1): E-mail recebido da própria recepção desativa o fallback IMEDIATAMENTE!
  const recovInbound = evaluateReceptionEmailFallbackAutoRecovery(db, null, {
    inboundFromEmail: "Recepção Soho <soho@promenade.com.br>",
    inboundCreatedAt: new Date(Date.now() + 1000).toISOString()
  });
  assert.equal(recovInbound.recovered, true, "Inbound email from reception must auto-deactivate fallback");
  assert.equal(isReceptionEmailFallbackActive(db), false, "Fallback must now be OFF automatically");

  // 9. Nova falha SMTP ao vivo reativa automaticamente + envia anexo PDF limpo (sem CSS!)
  const fakePdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "utf8");
  sendEmailAsync({
    db,
    reservationId: "RES-605-0542",
    recipient: "soho@promenade.com.br",
    subject: "Flat 605 - Envio Ao Vivo com PDF",
    bodyHtml: checkinRendered.bodyHtml,
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
  assert.equal(isReceptionEmailFallbackActive(db), true, "Live SMTP error must reactivate fallback");
  assert.equal(sentTexts.length, 5);
  assert.equal(sentTexts[4].message.includes("-webkit-text-size-adjust"), false, "Live HTML email must have zero CSS");
  assert.equal(sentDocs.length, 2);

  // 10. AUTO-DESATIVAÇÃO (Sinal 2): Expiração natural da janela sem novos erros desativa sozinho!
  db.settings.receptionEmailFallback.autoActiveUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal(isReceptionEmailFallbackActive(db), false, "Expired cooldown window without new errors must self-deactivate");
  assert.equal(db.settings.receptionEmailFallback.autoActiveUntil, null, "Self-deactivation must clear autoActiveUntil");

  // 11. AUTO-DESATIVAÇÃO NA MIGRAÇÃO V2 + Limpeza de bolhas antigas com CSS no /whatsapp-chat:
  const legacyDb = {
    settings: {
      receptionEmail: "soho@promenade.com.br",
      receptionEmailFallback: {
        enabled: true,
        mode: "active", // modo legado travado ativo da v1
        autoDetect: true,
        autoWindowHours: 24,
        autoActiveUntil: new Date(Date.now() + 20 * 3600 * 1000).toISOString()
      }
    },
    reservations: db.reservations,
    reservationCommunications: [
      {
        id: "legacy_comm_1",
        reservation_id: "RES-605-0542",
        type: "email",
        direction: "outbound",
        recipient: "soho@promenade.com.br",
        subject: "Flat 605 - José Luiz Costa Neto (13/11/2026 a 16/11/2026)",
        body: truncatedAt3000Body,
        metadata: { whatsappFallbackMessageId: "msg_dirty_css_1", whatsappFallbackAttachmentsSent: 1 },
        created_at: `${todayBr}T10:46:00.000Z`
      }
    ],
    zohoMessagesCache: [
      {
        id: "zoho_morning_dsn_1",
        fromEmail: "mailer-daemon@mail.zoho.com",
        subject: "Mail Delivery Status Notification (Delay)",
        snippet: "soho@promenade.com.br 451 delayed",
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString() // 6 horas atrás
      }
    ],
    whatsappConversations: [
      {
        phone: "552237040100",
        messages: [
          {
            messageId: "msg_dirty_css_1",
            text: "📧➡️📲 *[E-MAIL RECEPÇÃO]*\n📌 *Assunto:* Flat 605 - José Luiz Costa Neto (13/11/2026 a 16/11/2026)\nbody, table, td, a { -webkit-text-size-adjust: 100%; }\n.email-card { background-color: #FFF; }"
          }
        ]
      }
    ]
  };

  assert.equal(isReceptionEmailFallbackActive(legacyDb), false, "V2 migration must auto-deactivate legacy v1 stuck active state when last DSN is >75m old");
  assert.equal(legacyDb.settings.receptionEmailFallback.mode, "auto");
  const healedBubbleText = legacyDb.whatsappConversations[0].messages[0].text;
  assert.equal(healedBubbleText.includes("-webkit-text-size-adjust"), false, "V2 migration must heal CSS-polluted chat bubble in whatsappConversations");
  assert.ok(healedBubbleText.includes("Flat 605"), "Healed chat bubble must contain clean reservation details");
});
