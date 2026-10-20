import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  resolveWhatsAppTags,
  renderTemplateButtons,
  triggerImmediateWhatsApp
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
  assert.deepEqual(tpl.channels, ["site", "whatsapp", "booking", "airbnb", "outros"]);

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

  // Valida que informa que já está tudo pronto e as 4 instruções de recepção
  assert.match(rendered, /tudo pronto/i);
  assert.match(rendered, /Identifique-se na recepção/i);
  assert.match(rendered, /Check-in Online/i);
  assert.match(rendered, /CorpFlats/);
  assert.match(rendered, /Lucas Andrade/);
  assert.match(rendered, /Flat 204/);
  // Sem bloco de acompanhante pendente para reserva de 1 hóspede
  assert.doesNotMatch(rendered, /Acompanhante Pendente/i);

  const buttons = renderTemplateButtons(tpl.buttons, reservation, db, "https://corpflats.onrender.com", "guest", tpl);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].id, "btn_portal");
  assert.equal(buttons[1].id, "btn_maps");
});

test("Disparo de pre_checkin_completed em reserva com 2 hóspedes: Titular recebe link do 2º hóspede e Acompanhante recebe confirmação individual", async () => {
  const db = createMockDb();
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

  assert.equal(db.whatsappHistory.length, 1, "Apenas o Hóspede 1 deve receber no momento em que preenche sua ficha");
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

  assert.equal(db.whatsappHistory.length, 2, "O 2º Hóspede deve receber sua confirmação individualmente");
  assert.equal(db.whatsappHistory[1].recipientType, "guest_2");
  assert.equal(db.whatsappHistory[1].guestPhone, "21988776655");
  assert.match(db.whatsappHistory[1].message, /Olá, \*Pedro\*!/);
  assert.match(db.whatsappHistory[1].message, /Pedro Costa/);
  assert.match(db.whatsappHistory[1].message, /Flat 305/);
  assert.doesNotMatch(db.whatsappHistory[1].message, /Acompanhante Pendente/);
  assert.equal(db.whatsappQueue[1].status, "cancelled", "Lembrete do 2º hóspede deve ser cancelado após conclusão");
});
