import assert from "node:assert/strict";
import test from "node:test";
import {
  validateGuestEmailAddress,
  isRecipientDeliverySmtpError,
  isInternalOrThirdPartyOperationalEmail,
  notifyGuestInvalidEmailViaWhatsApp,
  updateGuestEmailAndResendRecentPending,
  reconcileFalsePositiveEmailAlerts,
  sendEmailAsync
} from "../artifacts/api-server/mail-service.mjs";
import { processInboundBounceForGuestEmail, matchEmailWithReservation } from "../artifacts/api-server/zoho-mail-service.mjs";
import {
  injectSessionContext,
  executeRegisteredAgentTool
} from "../artifacts/api-server/agent-architecture.mjs";
import { appendMessageToConversation } from "../artifacts/api-server/zapi-service.mjs";

test("1. validateGuestEmailAddress detecta sintaxe inválida, erros de digitação de domínio e DNS inexistente", async () => {
  const typoGmail = await validateGuestEmailAddress("Hospede.Teste@gamil.com", { checkDns: false });
  assert.equal(typoGmail.valid, false);
  assert.equal(typoGmail.reason, "domain_typo");
  assert.equal(typoGmail.suggestedEmail, "hospede.teste@gmail.com");

  const typoBr = await validateGuestEmailAddress("maria@gmail.com.br", { checkDns: false });
  assert.equal(typoBr.valid, false);
  assert.equal(typoBr.suggestedEmail, "maria@gmail.com");

  const typoCon = await validateGuestEmailAddress("contato@empresa.con.br", { checkDns: false });
  assert.equal(typoCon.valid, false);
  assert.equal(typoCon.suggestedEmail, "contato@empresa.com.br");

  const missingAt = await validateGuestEmailAddress("joaosilva.gmail.com", { checkDns: false });
  assert.equal(missingAt.valid, false);
  assert.equal(missingAt.reason, "missing_at");

  const trailingDotCheckin = await validateGuestEmailAddress("joao@gmail.com.", { checkDns: false, stripTrailingPunctuation: false });
  assert.equal(trailingDotCheckin.valid, false);
  assert.equal(trailingDotCheckin.suggestedEmail, "joao@gmail.com");

  const trailingDotWhatsapp = await validateGuestEmailAddress("joao@gmail.com.", { checkDns: true, stripTrailingPunctuation: true });
  assert.equal(trailingDotWhatsapp.valid, true);
  assert.equal(trailingDotWhatsapp.normalizedEmail, "joao@gmail.com");

  const fakeDnsNotFound = {
    resolveMx: async () => {
      const e = new Error("queryMx ENOTFOUND dominio-falso-xyz.com.br");
      e.code = "ENOTFOUND";
      throw e;
    }
  };
  const badDomain = await validateGuestEmailAddress("cliente@dominio-falso-xyz.com.br", {
    checkDns: true,
    dnsResolver: fakeDnsNotFound
  });
  assert.equal(badDomain.valid, false);
  assert.equal(badDomain.reason, "domain_not_found");

  const fakeDnsTimeout = {
    resolveMx: async () => {
      const e = new Error("DNS_TIMEOUT");
      e.code = "ETIMEOUT";
      throw e;
    }
  };
  const timeoutFailOpen = await validateGuestEmailAddress("cliente@corporativo-lento.com.br", {
    checkDns: true,
    dnsResolver: fakeDnsTimeout
  });
  assert.equal(timeoutFailOpen.valid, true);
  assert.equal(timeoutFailOpen.dnsSkipped, true);

  const validHotmailBr = await validateGuestEmailAddress("ana.paula@hotmail.com.br", { checkDns: true });
  assert.equal(validHotmailBr.valid, true);
});

test("2. Check-in com e-mail incorreto avisa hóspede no WhatsApp, injeta contexto na IA, altera no sistema e reenvia apenas pendentes recentes", async () => {
  const sentWhatsappMessages = [];
  const sentSmtpEmails = [];
  const panelNotifications = [];

  const mockTransporter = {
    sendMail: async (mailOpts) => {
      sentSmtpEmails.push(mailOpts);
      return { messageId: `<mock-${sentSmtpEmails.length}@corpflats.com.br>` };
    }
  };

  const now = new Date();
  const twoHoursAgoIso = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
  const fiveDaysAgoIso = new Date(now.getTime() - 120 * 3600 * 1000).toISOString();
  const tomorrowIso = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowDateStr = tomorrowIso.slice(0, 10);

  const db = {
    settings: {
      receptionEmail: "soho@promenade.com.br",
      garageEmail: "promenadesoho@pfbestacionamentos.com.br",
      emailSettings: { enabled: true }
    },
    reservations: [
      {
        id: 6051,
        code: "RES-605-6051",
        flatId: 13,
        flatNumber: "605",
        guestId: 77,
        guestName: "Carlos Eduardo Mendes",
        guestPhone: "5522999112233",
        guestDocument: "12345678909",
        guestEmail: "carlos@gamil.com",
        checkinDate: todayStr,
        checkoutDate: tomorrowDateStr,
        status: "confirmada",
        paymentStatus: "pago",
        hasPreCheckin: true,
        preCheckinCompleted: true,
        fnhrCompleted: true,
        checkedInAt: now.toISOString(),
        auditLogs: [],
        guests: [
          {
            index: 1,
            name: "Carlos Eduardo Mendes",
            cpf: "12345678909",
            phone: "5522999112233",
            email: "carlos@gamil.com",
            hasCompletedCheckin: true
          }
        ]
      }
    ],
    guests: [
      {
        id: 77,
        name: "Carlos Eduardo Mendes",
        fullName: "Carlos Eduardo Mendes",
        document: "12345678909",
        phone: "5522999112233",
        email: "carlos@gamil.com"
      }
    ],
    guestAccounts: [
      {
        id: "acc_77",
        guestId: 77,
        cpf: "12345678909",
        phone: "5522999112233",
        email: "carlos@gamil.com"
      }
    ],
    minibarOrders: [
      {
        id: "mb_1",
        reservationId: 6051,
        reservationCode: "RES-605-6051",
        customerEmail: "carlos@gamil.com"
      }
    ],
    reservationCommunications: [
      // 1) E-mail recente pendente/falho do check-in (há 2h -> DEVE ser reenviado)
      {
        id: "comm_recent_checkin",
        reservation_id: "RES-605-6051",
        type: "email",
        direction: "outbound",
        recipient: "carlos@gamil.com",
        subject: "Check-in online concluído • Instruções para sua chegada - Flat 605",
        body: "<p>Instruções de chegada do Flat 605</p>",
        status: "failed",
        metadata: {
          isAutomated: true,
          channel: "whatsapp_mirror",
          trigger: "pre_checkin_completed",
          recipientType: "guest",
          awaitingEmailCorrection: true
        },
        created_at: twoHoursAgoIso,
        createdAt: twoHoursAgoIso
      },
      // 2) E-mail antigo com falha (há 5 dias / 120h -> NÃO deve ser reenviado!)
      {
        id: "comm_old_stale",
        reservation_id: "RES-605-6051",
        type: "email",
        direction: "outbound",
        recipient: "carlos@gamil.com",
        subject: "Cotação Antiga Pré-Reserva - Flat 605",
        body: "<p>Mensagem antiga</p>",
        status: "failed",
        metadata: {
          isAutomated: true,
          channel: "whatsapp_mirror",
          trigger: "pre_reservation_created",
          recipientType: "guest"
        },
        created_at: fiveDaysAgoIso,
        createdAt: fiveDaysAgoIso
      },
      // 3) E-mail interno da portaria com falha (NUNCA deve ir para o e-mail pessoal do hóspede!)
      {
        id: "comm_internal_portaria",
        reservation_id: "RES-605-6051",
        type: "email",
        direction: "outbound",
        recipient: "soho@promenade.com.br",
        subject: "[CHECK-IN CONFIRMADO] Flat 605",
        body: "<p>FNRH Portaria</p>",
        status: "failed",
        metadata: {
          trigger: "pre_checkin"
        },
        created_at: twoHoursAgoIso,
        createdAt: twoHoursAgoIso
      }
    ],
    emailQueue: [
      {
        id: "em_q_future_checkout",
        reservationId: "6051",
        reservationCode: "RES-605-6051",
        guestName: "Carlos Eduardo Mendes",
        recipient: "carlos@gamil.com",
        subject: "[LEMBRETE DE CHECK-OUT] Flat 605 - CorpFlats Soho",
        bodyHtml: "<p>Lembrete de saída às 12h</p>",
        bodyText: "Lembrete de saída às 12h",
        status: "pending",
        scheduledFor: tomorrowIso,
        triggerEvent: "checkout_reminder",
        createdAt: now.toISOString()
      }
    ],
    whatsappHistory: [],
    whatsappConversations: []
  };

  const mockSendZapi = async (phone, message, opts) => {
    sentWhatsappMessages.push({ phone, message, opts });
    return { success: true, messageId: `wa_${sentWhatsappMessages.length}` };
  };

  const reservation = db.reservations[0];

  // Passo A: Notifica o hóspede pelo WhatsApp sobre o e-mail errado no check-in
  const notifyRes = await notifyGuestInvalidEmailViaWhatsApp({
    db,
    saveDatabase: () => {},
    sendZapiMessage: mockSendZapi,
    evaluateZapiChannelPolicy: () => ({ allowed: true }),
    appendMessageToConversation: (opts) => appendMessageToConversation(db, opts),
    createNotification: (n) => panelNotifications.push(n),
    reservation,
    guestIndex: 1,
    invalidEmail: "carlos@gamil.com",
    reason: "O domínio '@gamil.com' parece conter um erro de digitação.",
    suggestedEmail: "carlos@gmail.com",
    source: "checkin"
  });

  assert.equal(notifyRes.notified, true);
  assert.equal(sentWhatsappMessages.length, 1);
  assert.match(sentWhatsappMessages[0].message, /carlos@gamil\.com/);
  assert.match(sentWhatsappMessages[0].message, /carlos@gmail\.com/);
  assert.equal(reservation.guestEmailInvalid, true);
  assert.equal(reservation.emailCorrectionRequest.status, "awaiting_reply");
  assert.equal(db.whatsappConversations.length, 1);
  assert.equal(panelNotifications.length, 1);

  // Passo B: Desduplicação impede envio duplicado para o mesmo e-mail inválido
  const dupNotify = await notifyGuestInvalidEmailViaWhatsApp({
    db,
    saveDatabase: () => {},
    sendZapiMessage: mockSendZapi,
    evaluateZapiChannelPolicy: () => ({ allowed: true }),
    reservation,
    guestIndex: 1,
    invalidEmail: "carlos@gamil.com",
    source: "smtp_rejection"
  });
  assert.equal(dupNotify.notified, false);
  assert.equal(dupNotify.reason, "already_notified");
  assert.equal(sentWhatsappMessages.length, 1);

  // Passo C: Injeção de contexto da Sofia IA expõe alerta_email_incorreto
  const sessionCtx = injectSessionContext({
    db,
    phone: "5522999112233",
    runtime: {
      db,
      saveDatabase: () => {}
    }
  });
  assert.equal(sessionCtx.reserva_ativa.email_cadastrado, "carlos@gamil.com");
  assert.equal(sessionCtx.reserva_ativa.alerta_email_incorreto?.status, "AGUARDANDO_CORRECAO");
  assert.equal(sessionCtx.reserva_ativa.alerta_email_incorreto?.email_sugerido, "carlos@gmail.com");

  // Passo D: Se o hóspede mandar outro e-mail inválido, a Tool bloqueia sem sobrescrever
  const blockedToolRes = await executeRegisteredAgentTool(
    "atualizar_dados_hospede",
    { email: "carlos@gnail.com" },
    sessionCtx
  );
  assert.equal(blockedToolRes.status, "BLOQUEADO_PELA_REGRA");
  assert.equal(blockedToolRes.codigo_regra_bloqueio, "EMAIL_INVALIDO");
  assert.equal(blockedToolRes.dados.email_sugerido, "carlos@gmail.com");
  assert.equal(reservation.guestEmail, "carlos@gamil.com");

  // Passo E: Hóspede envia o e-mail correto -> altera em todo o sistema e reenvia apenas o e-mail recente (< 72h)
  const updateSummary = await updateGuestEmailAndResendRecentPending({
    db,
    saveDatabase: () => {},
    reservation,
    guestIndex: 1,
    newEmail: "carlos.mendes@gmail.com",
    maxAgeHours: 72,
    overrides: { transporter: mockTransporter }
  });

  // Aguarda o setImmediate do sendEmailAsync processar no mockTransporter
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(updateSummary.ok, true);
  assert.equal(reservation.guestEmail, "carlos.mendes@gmail.com");
  assert.equal(reservation.guests[0].email, "carlos.mendes@gmail.com");
  assert.equal(db.guests[0].email, "carlos.mendes@gmail.com");
  assert.equal(db.guestAccounts[0].email, "carlos.mendes@gmail.com");
  assert.equal(db.minibarOrders[0].customerEmail, "carlos.mendes@gmail.com");
  assert.equal(reservation.guestEmailInvalid, false);
  assert.equal(reservation.emailCorrectionRequest.status, "resolved");
  assert.equal(reservation.emailCorrectionRequest.correctedEmail, "carlos.mendes@gmail.com");

  // Apenas 1 e-mail reenviado (o recente de 2h atrás), 1 antigo ignorado (> 72h), 1 futuro atualizado na fila, 0 da portaria vazado!
  assert.equal(updateSummary.resentCount, 1);
  assert.equal(updateSummary.skippedTooOldCount, 1);
  assert.equal(updateSummary.updatedScheduledCount, 1);
  assert.equal(db.emailQueue[0].recipient, "carlos.mendes@gmail.com");
  assert.equal(sentSmtpEmails.length, 1);
  assert.equal(sentSmtpEmails[0].to, "carlos.mendes@gmail.com");
  assert.match(sentSmtpEmails[0].subject, /Check-in online concluído/);
});

test("3. Rejeição SMTP 550 e Bounce Zoho Mail acionam solicitação de correção de e-mail via WhatsApp", async () => {
  assert.equal(isRecipientDeliverySmtpError({ responseCode: 550, message: "550 5.1.1 User unknown" }), true);
  assert.equal(isRecipientDeliverySmtpError({ responseCode: 535, message: "535 Authentication Failed" }), false);
  assert.equal(isInternalOrThirdPartyOperationalEmail("soho@promenade.com.br"), true);
  assert.equal(isInternalOrThirdPartyOperationalEmail("hospede@gmail.com"), false);

  const waCalls = [];
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);

  const db = {
    settings: { emailSettings: { enabled: true } },
    reservations: [
      {
        id: 2110,
        code: "RES-211-2110",
        flatNumber: "211",
        guestName: "Fernanda Costa",
        guestPhone: "5521988776655",
        guestEmail: "fernanda.inexistente@gmail.com",
        checkinDate: todayStr,
        checkoutDate: todayStr,
        status: "confirmada"
      }
    ],
    reservationCommunications: [
      {
        id: "comm_sent_before_bounce",
        reservation_id: "RES-211-2110",
        type: "email",
        direction: "outbound",
        recipient: "fernanda.inexistente@gmail.com",
        subject: "Confirmação de Check-in - Flat 211",
        body: "<p>Bem-vinda!</p>",
        status: "sent",
        metadata: { channel: "whatsapp_mirror", trigger: "pre_checkin_completed", recipientType: "guest" },
        created_at: nowIso
      }
    ],
    whatsappHistory: [],
    whatsappConversations: []
  };

  const prevSendZapi = globalThis.__corpflatsSendZapiMessage;
  const prevEvalPolicy = globalThis.__corpflatsEvaluateZapiChannelPolicy;
  globalThis.__corpflatsSendZapiMessage = async (phone, message) => {
    waCalls.push({ phone, message });
    return { success: true, messageId: "wa_bounce_1" };
  };
  globalThis.__corpflatsEvaluateZapiChannelPolicy = () => ({ allowed: true });

  try {
    const bounceRes = await processInboundBounceForGuestEmail(db, () => {}, {
      fromEmail: "MAILER-DAEMON@zoho.com",
      subject: "Undelivered Mail Returned to Sender",
      snippet: "Delivery failed permanently for recipient fernanda.inexistente@gmail.com (550 5.1.1 No such user)",
      direction: "inbound",
      created_at: nowIso
    });

    assert.equal(bounceRes.isBounce, true);
    assert.equal(bounceRes.notified, true);
    assert.equal(waCalls.length, 1);
    assert.equal(db.reservationCommunications[0].status, "bounced");

    // E agora executa a Tool atualizar_dados_hospede via Sofia IA quando Fernanda responde
    const sessionCtx = injectSessionContext({
      db,
      phone: "5521988776655",
      runtime: { db, saveDatabase: () => {} }
    });
    const toolRes = await executeRegisteredAgentTool(
      "atualizar_dados_hospede",
      { email: "fernanda.real@outlook.com" },
      sessionCtx
    );
    assert.equal(toolRes.status, "SUCESSO_EXECUTADO");
    assert.equal(toolRes.dados.email_atualizado, "fernanda.real@outlook.com");
    assert.equal(toolRes.dados.emails_pendentes_reenviados, 1);
    assert.equal(db.reservations[0].guestEmail, "fernanda.real@outlook.com");
    assert.equal(db.reservations[0].guestEmailInvalid, false);
  } finally {
    globalThis.__corpflatsSendZapiMessage = prevSendZapi;
    globalThis.__corpflatsEvaluateZapiChannelPolicy = prevEvalPolicy;
  }
});

test("4. Anti-Falso-Positivo (Caso Junior Flat 1304): não acusa e-mail entregue em bounces sem o endereço do hóspede, DSN de atraso ou rate-limit SMTP, e trata confirmação do mesmo e-mail", async () => {
  // 4.1 Erros de remetente/rate-limit/relay 550/553/ENOTFOUND do próprio servidor SMTP NÃO são erro de destinatário
  assert.equal(
    isRecipientDeliverySmtpError({ responseCode: 550, message: "550 5.4.6 Unusual sending activity detected" }),
    false
  );
  assert.equal(
    isRecipientDeliverySmtpError({ responseCode: 553, message: "553 Relaying disallowed as contato@corpflats.com.br" }),
    false
  );
  assert.equal(
    isRecipientDeliverySmtpError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND smtp.zoho.com" }),
    false
  );

  const waCalls = [];
  const now = new Date();
  const nowIso = now.toISOString();
  const tenMinAgoIso = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const fiveMinAgoIso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const todayStr = nowIso.slice(0, 10);

  const db = {
    settings: {
      receptionEmail: "soho@promenade.com.br",
      garageEmail: "promenadesoho@pfbestacionamentos.com.br",
      emailSettings: { enabled: true }
    },
    reservations: [
      {
        id: 13040,
        code: "RES-1304-13040",
        flatNumber: "1304",
        guestName: "Junior Pelicioni",
        guestPhone: "556283384241",
        guestEmail: "junior_pelicioni@hotmail.com",
        checkinDate: todayStr,
        checkoutDate: todayStr,
        status: "confirmada",
        auditLogs: []
      }
    ],
    reservationCommunications: [
      {
        id: "comm_junior_sent",
        reservation_id: "RES-1304-13040",
        type: "email",
        direction: "outbound",
        recipient: "junior_pelicioni@hotmail.com",
        subject: "Confirmação de Reserva - Flat 1304",
        body: "<p>Sua reserva no Flat 1304 está confirmada!</p>",
        status: "sent",
        metadata: { sentAt: tenMinAgoIso, trigger: "reservation_created", recipientType: "guest" },
        created_at: tenMinAgoIso
      }
    ],
    zohoMessagesCache: [],
    whatsappHistory: [],
    whatsappConversations: []
  };

  const prevSendZapi = globalThis.__corpflatsSendZapiMessage;
  const prevEvalPolicy = globalThis.__corpflatsEvaluateZapiChannelPolicy;
  globalThis.__corpflatsSendZapiMessage = async (phone, message) => {
    waCalls.push({ phone, message });
    return { success: true, messageId: `wa_fp_${waCalls.length}` };
  };
  globalThis.__corpflatsEvaluateZapiChannelPolicy = () => ({ allowed: true });

  try {
    // 4.2 Bounce genérico sem o e-mail do hóspede no snippet (ou vindo de e-mail operacional do Flat 1304) NÃO acusa Junior!
    const bounceWithoutGuestEmail = {
      fromEmail: "mailer-daemon@mail.zoho.com",
      subject: "Undelivered Mail Returned to Sender - Flat 1304",
      snippet: "This message was created automatically by mail delivery software. Delivery failed to soho@promenade.com.br (550 mailbox full)",
      direction: "inbound",
      created_at: nowIso
    };
    const matchedSummary = matchEmailWithReservation(db, bounceWithoutGuestEmail);
    const bounceRes1 = await processInboundBounceForGuestEmail(db, () => {}, bounceWithoutGuestEmail, matchedSummary);
    assert.equal(bounceRes1.ignoredReason, "no_explicit_bounced_email_in_message");
    assert.equal(waCalls.length, 0);
    assert.equal(db.reservationCommunications[0].status, "sent");
    assert.equal(Boolean(db.reservations[0].guestEmailInvalid), false);

    // 4.3 DSN de atraso temporário (Delay / Greylisting Hotmail) NÃO acusa Junior!
    const delayedDsn = {
      fromEmail: "postmaster@hotmail.com",
      subject: "Delivery Status Notification (Delay)",
      snippet: "Action: delayed - Delivery to junior_pelicioni@hotmail.com is delayed. Will continue trying.",
      direction: "inbound",
      created_at: nowIso
    };
    const bounceRes2 = await processInboundBounceForGuestEmail(db, () => {}, delayedDsn, matchedSummary);
    assert.equal(bounceRes2.ignoredReason, "non_permanent_delay_or_relay_dsn");
    assert.equal(waCalls.length, 0);

    // 4.4 Oscilação/rejeição SMTP secundária quando um e-mail já foi entregue a junior_pelicioni@hotmail.com NÃO notifica!
    const smtpFalseAlarm = await notifyGuestInvalidEmailViaWhatsApp({
      db,
      saveDatabase: () => {},
      reservation: db.reservations[0],
      invalidEmail: "junior_pelicioni@hotmail.com",
      reason: "550 Temporary policy rejection",
      source: "smtp_rejection"
    });
    assert.equal(smtpFalseAlarm.notified, false);
    assert.equal(smtpFalseAlarm.reason, "email_already_delivered_recently");
    assert.equal(waCalls.length, 0);

    // 4.5 Se a reserva estava com alerta aberto e o hóspede responde "Junior_pelicioni@hotmail.com / Esse mesmo",
    // a Tool confirma o mesmo e-mail sem duplicar o envio que já foi entregue e pede desculpas pelo alarme falso
    db.reservations[0].guestEmailInvalid = true;
    db.reservations[0].emailCorrectionRequest = {
      status: "awaiting_reply",
      invalidEmail: "junior_pelicioni@hotmail.com",
      guestIndex: 1,
      source: "zoho_bounce",
      notifiedAt: tenMinAgoIso,
      phone: "556283384241",
      whatsappSent: true
    };
    db.reservationCommunications[0].status = "bounced";

    const sessionCtx = injectSessionContext({
      db,
      phone: "556283384241",
      runtime: { db, saveDatabase: () => {} }
    });
    assert.equal(sessionCtx.reserva_ativa.alerta_email_incorreto?.status, "AGUARDANDO_CORRECAO");

    const confirmToolRes = await executeRegisteredAgentTool(
      "atualizar_dados_hospede",
      { email: "Junior_pelicioni@hotmail.com", confirmar_email_atual: true },
      sessionCtx
    );
    assert.equal(confirmToolRes.status, "SUCESSO_EXECUTADO");
    assert.equal(confirmToolRes.dados.email_confirmado_sem_alteracao, true);
    assert.equal(confirmToolRes.dados.emails_pendentes_reenviados, 0);
    assert.equal(db.reservations[0].guestEmailInvalid, false);
    assert.equal(db.reservations[0].emailCorrectionRequest.status, "resolved_confirmed_same");
    assert.equal(db.reservationCommunications[0].status, "sent");
    assert.match(confirmToolRes.instrucao_para_ia, /alarme falso/i);

    // 4.6 Reconciliador automático limpa reservas legadas presas onde o hóspede já confirmou no histórico do WhatsApp
    db.reservations[0].guestEmailInvalid = true;
    db.reservations[0].emailCorrectionRequest.status = "awaiting_reply";
    db.reservationCommunications[0].status = "bounced";
    db.whatsappConversations.push({
      id: "conv_junior",
      phone: "556283384241",
      messages: [
        {
          fromMe: false,
          text: "Junior_pelicioni@hotmail.com\nEsse mesmo",
          timestamp: fiveMinAgoIso
        }
      ]
    });
    const recRes = reconcileFalsePositiveEmailAlerts(db, () => {});
    assert.equal(recRes.reconciled, 1);
    assert.equal(db.reservations[0].guestEmailInvalid, false);
    assert.equal(db.reservations[0].emailCorrectionRequest.status, "resolved_confirmed_same");
    assert.equal(db.reservationCommunications[0].status, "sent");
  } finally {
    globalThis.__corpflatsSendZapiMessage = prevSendZapi;
    globalThis.__corpflatsEvaluateZapiChannelPolicy = prevEvalPolicy;
  }
});
