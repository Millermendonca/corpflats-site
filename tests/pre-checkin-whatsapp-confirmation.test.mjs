import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  resolveWhatsAppTags,
  renderTemplateButtons,
  triggerImmediateWhatsApp,
  sanitizeButtonsForHydratedTemplate,
  extractIncomingMessageInfo,
  appendMessageToConversation
} from "../artifacts/api-server/zapi-service.mjs";

function createMockDb() {
  return {
    settings: {
      checkinTime: "14:00",
      checkoutTime: "12:00",
      hotelAddress: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
      googleMapsUrl: "https://share.google/LHu3541d5lhkdvbL2",
      adminWhatsApp: "5522997124021",
      emailSettings: { enabled: false }
    },
    siteConfig: {
      branding: { brandName: "CorpFlats" }
    },
    zapiConfig: {
      enabled: true,
      instanceId: "",
      token: "",
      testModeOnly: false,
      wifiNetwork: "apto {quarto}",
      wifiPassword: "1234567890123",
      channels: {
        guest_schedule: {
          id: "guest_schedule",
          enabled: true,
          testMode: false,
          whitelist: [],
          blacklist: []
        }
      }
    },
    whatsappTemplates: JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES)),
    whatsappHistory: [],
    whatsappQueue: [],
    whatsappConversations: []
  };
}

test("Template tpl_pre_checkin_completed existe e contém todas as instruções obrigatórias da recepção", () => {
  const tpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_checkin_completed");
  assert.ok(tpl, "Template tpl_pre_checkin_completed deve existir em DEFAULT_WHATSAPP_TEMPLATES");
  assert.equal(tpl.triggerEvent, "pre_checkin_completed");
  assert.equal(tpl.enabled, true);
  assert.deepEqual(tpl.channels, ["site", "whatsapp", "booking", "airbnb", "b2b", "outros"]);

  const db = createMockDb();
  const reservation = {
    id: 501,
    code: "RES-204-0501",
    flatNumber: "204",
    guestName: "Lucas Andrade",
    guestPhone: "22998887766",
    checkinDate: "2026-11-10",
    checkoutDate: "2026-11-12",
    guestCount: 1,
    adults: 1,
    channel: "booking",
    status: "confirmada",
    fnhrCompleted: true,
    guests: [
      { index: 1, name: "Lucas Andrade", phone: "22998887766", hasCompletedCheckin: true }
    ]
  };

  const rendered = resolveWhatsAppTags(tpl.message, reservation, db, "https://corpflats.onrender.com", "guest", tpl);

  // Valida que informa que já está tudo pronto, instruções da recepção e link do Maps no texto
  assert.match(rendered, /tudo pronto/i);
  assert.match(rendered, /Identifique-se/i);
  assert.match(rendered, /Check-in Online/i);
  assert.match(rendered, /CorpFlats/);
  assert.match(rendered, /Lucas Andrade/);
  assert.match(rendered, /Flat 204/);
  assert.match(rendered, /https:\/\/share\.google\/LHu3541d5lhkdvbL2/);
  // Sem bloco de acompanhante pendente para reserva de 1 hóspede
  assert.doesNotMatch(rendered, /Acompanhante Pendente/i);

  const buttons = renderTemplateButtons(tpl.buttons, reservation, db, "https://corpflats.onrender.com", "guest", tpl);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].id, "btn_portal");
  assert.equal(buttons[1].id, "btn_admin");
  assert.equal(buttons[1].type, "CALL");
});

test("Disparo de pre_checkin_completed em reserva com 2 hóspedes: Titular recebe link do 2º hóspede e Acompanhante recebe confirmação individual", async () => {
  const db = createMockDb();
  db._nowOverride = new Date("2026-11-14T15:00:00Z");
  const reservation = {
    id: 502,
    code: "RES-305-0502",
    flatNumber: "305",
    guestName: "Mariana Costa",
    guestPhone: "21999112233",
    checkinDate: "2026-11-15",
    checkoutDate: "2026-11-18",
    guestCount: 2,
    adults: 2,
    channel: "site",
    status: "confirmada",
    fnhrCompleted: false,
    guests: [
      { index: 1, name: "Mariana Costa", phone: "21999112233", hasCompletedCheckin: true },
      { index: 2, name: "Pedro Costa", phone: "21988776655", hasCompletedCheckin: false }
    ]
  };

  // Agenda um lembrete na fila para testar cancelamento automático quando concluir
  db.whatsappQueue.push(
    {
      id: "q_1",
      reservationId: 502,
      reservationCode: "RES-305-0502",
      recipientType: "guest",
      triggerEvent: "pre_checkin_reminder",
      status: "scheduled"
    },
    {
      id: "q_2",
      reservationId: 502,
      reservationCode: "RES-305-0502",
      recipientType: "guest_2",
      triggerEvent: "pre_checkin_reminder",
      status: "scheduled"
    }
  );

  // 1) Disparo quando o Titular (guestIndex = 1) conclui a ficha digital
  await triggerImmediateWhatsApp(
    db,
    () => {},
    "pre_checkin_completed",
    { ...reservation, _checkinGuestIndex: 1 },
    "https://corpflats.onrender.com"
  );

  assert.equal(db.whatsappHistory.length, 1, "O Hóspede 1 deve receber a confirmação de Check-in Online Concluído");
  assert.equal(db.whatsappHistory[0].triggerEvent, "pre_checkin_completed");
  assert.equal(db.whatsappHistory[0].recipientType, "guest");
  assert.equal(db.whatsappHistory[0].guestPhone, "21999112233");
  assert.match(db.whatsappHistory[0].message, /Acompanhante Pendente \(2º Hóspede\)/);
  assert.match(db.whatsappHistory[0].message, /\/pre-checkin\/RES-305-0502\?guest=2/);

  assert.equal(db.whatsappQueue[0].status, "cancelled", "Lembrete do titular deve ser cancelado");
  assert.equal(db.whatsappQueue[1].status, "scheduled", "Lembrete do 2º hóspede continua agendado até ele preencher");

  // 2) Agora o 2º Hóspede (guestIndex = 2) conclui a sua ficha digital
  reservation.guests[1].hasCompletedCheckin = true;
  reservation.fnhrCompleted = true;

  await triggerImmediateWhatsApp(
    db,
    () => {},
    "pre_checkin_completed",
    { ...reservation, _checkinGuestIndex: 2 },
    "https://corpflats.onrender.com"
  );

  assert.equal(db.whatsappHistory.length, 2, "O 2º Hóspede deve receber sua confirmação individual");
  assert.equal(db.whatsappHistory[1].triggerEvent, "pre_checkin_completed");
  assert.equal(db.whatsappHistory[1].recipientType, "guest_2");
  assert.equal(db.whatsappHistory[1].guestPhone, "21988776655");
  assert.match(db.whatsappHistory[1].message, /Olá, \*Pedro\*!/);
  assert.match(db.whatsappHistory[1].message, /Pedro Costa/);
  assert.match(db.whatsappHistory[1].message, /Flat 305/);
  assert.doesNotMatch(db.whatsappHistory[1].message, /Acompanhante Pendente/);

  assert.equal(db.whatsappQueue[1].status, "cancelled", "Lembrete do 2º hóspede deve ser cancelado após conclusão");
});

test("sanitizeButtonsForHydratedTemplate protege contra descarte silencioso (share.google / domínios mistos / 3 CTAs) e webhook hydratedTemplate deduplica eco", () => {
  // 1) Botão share.google (Google Maps) misturado com corpflats.com.br é movido para texto, preservando o botão do Portal
  const resMaps = sanitizeButtonsForHydratedTemplate([
    { id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: "https://share.google/LHu3541d5lhkdvbL2" },
    { id: "btn_portal", type: "URL", label: "🏨 Portal do Hóspede", url: "https://corpflats.com.br/minha-reserva/RES-114-1024" }
  ]);
  assert.equal(resMaps.formattedActions.length, 1);
  assert.equal(resMaps.formattedActions[0].id, "btn_portal");
  assert.equal(resMaps.formattedActions[0].url, "https://corpflats.com.br/minha-reserva/RES-114-1024");
  assert.equal(resMaps.demotedUrlButtons.length, 1);
  assert.equal(resMaps.demotedUrlButtons[0].url, "https://share.google/LHu3541d5lhkdvbL2");

  // 2) 2 URLs no mesmo domínio + 1 CALL (3 CTAs) limita a 2 CTAs para evitar descarte silencioso no WhatsApp
  const res3Cta = sanitizeButtonsForHydratedTemplate([
    { id: "btn_pagar", type: "URL", label: "💳 Ver Detalhes & Pagar", url: "https://corpflats.com.br/minha-reserva/RES-212-1002?requester=1" },
    { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", url: "https://corpflats.com.br/copiar-pix/RES-212-1002" },
    { id: "btn_admin", type: "CALL", label: "📞 Falar com Atendimento", phone: "5522997124021" }
  ]);
  assert.equal(res3Cta.formattedActions.length, 2);
  assert.equal(res3Cta.formattedActions[0].id, "btn_pagar");
  assert.equal(res3Cta.formattedActions[1].id, "btn_pix");

  // 3) Webhook ReceivedCallback com hydratedTemplate é extraído e vinculado sem duplicar bolha no chat
  const db = createMockDb();
  const msgText = "Olá, *Efraim*! ✅🎉\nSeu *Check-in Online* foi concluído e já está *tudo pronto* para sua chegada!";
  const tsIso = new Date().toISOString();
  appendMessageToConversation(db, {
    phone: "5528999104646",
    senderName: "CorpFlats",
    fromMe: true,
    text: msgText,
    type: "text",
    timestamp: tsIso,
    messageId: "msg_auto_12345"
  });

  const parsed = extractIncomingMessageInfo({
    type: "ReceivedCallback",
    phone: "5528999104646",
    fromMe: true,
    fromApi: true,
    status: "SENT",
    messageId: "3EB0ABCDEF123456",
    momment: Date.now(),
    hydratedTemplate: {
      message: msgText,
      footer: "CorpFlats • Check-in Online Confirmado",
      hydratedButtons: [{ index: 0, urlButton: { url: "https://corpflats.com.br/minha-reserva/RES-114-1024", displayText: "🏨 Portal do Hóspede" } }]
    }
  });
  assert.equal(parsed.text, msgText);
  assert.equal(parsed.fromMe, true);

  const conv = appendMessageToConversation(db, {
    phone: parsed.phone,
    senderName: parsed.senderName,
    fromMe: parsed.fromMe,
    text: parsed.text,
    type: parsed.type,
    timestamp: parsed.timestamp,
    messageId: parsed.messageId
  });
  assert.equal(conv.messages.length, 1, "Não deve duplicar a bolha da mensagem de confirmação no chat interno");
  assert.equal(conv.messages[0].zapiMessageId, "3EB0ABCDEF123456");
  assert.equal(conv.messages[0].whatsappSentConfirmed, true);
});
