/**
 * Regressão pontual:
 * 1) Pré-reserva expirada ("expirada") ou pendente ("pre_reserva") não pode bloquear
 *    mensagens de estadia (breakfast_reminder, checkout_reminder, etc.) de reserva confirmada
 *    do mesmo hóspede/telefone nas mesmas datas (incidente Claudia RES-211-0988 / RES-211-0995).
 * 2) deliverQueueItem não pode lançar ReferenceError (shouldSendDoc) após envio bem-sucedido
 *    pelo WhatsApp, garantindo marcação imediata de item.status = "sent" sem reenvio em loop.
 *
 * Executar exclusivamente via:
 *   node --test tests/claudia-expired-preres-and-queue-delivery.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  evaluateStayContactEligibility,
  getReservationRecipients,
  buildTemplateTargets,
  scheduleUpcomingReservationTriggers,
  deliverQueueItem
} from "../artifacts/api-server/zapi-service.mjs";

const origFetch = globalThis.fetch;
let fetchCalls = [];

describe("Regressão: pré-reserva expirada no guarda de estadia + entrega segura em deliverQueueItem", () => {
  before(() => {
    globalThis.fetch = async (url, opts = {}) => {
      fetchCalls.push({ url: String(url), method: opts.method || "GET", body: opts.body || null });
      return {
        ok: true,
        status: 200,
        json: async () => ({ zaapId: "mock_zaap", messageId: `mock_msg_${fetchCalls.length}` }),
        text: async () => JSON.stringify({ zaapId: "mock_zaap", messageId: `mock_msg_${fetchCalls.length}` })
      };
    };
  });

  after(() => {
    globalThis.fetch = origFetch;
  });

  it("1. Pré-reserva expirada ('expirada') com mesmo telefone e datas NÃO bloqueia reserva confirmada (Claudia RES-211-0995)", () => {
    const resExpired = {
      id: 988,
      code: "RES-211-0988",
      status: "expirada",
      flatId: 4,
      flatNumber: "211",
      checkinDate: "2026-11-23",
      checkoutDate: "2026-11-24",
      createdAt: "2026-11-22T19:51:10.069Z",
      channel: "whatsapp",
      guestName: "Cláudia",
      guestPhone: "(21) 99535-9254",
      guestEmail: "",
      includeBreakfast: true,
      requesterType: "guest",
      requesterIsGuest1: true,
      guests: [{ name: "Cláudia", index: 1, phone: "(21) 99535-9254", email: "" }]
    };

    const resConfirmed = {
      id: 995,
      code: "RES-211-0995",
      status: "confirmada",
      flatId: 5,
      flatNumber: "212",
      checkinDate: "2026-11-23",
      checkoutDate: "2026-11-24",
      createdAt: "2026-11-23T12:28:23.247Z",
      channel: "whatsapp",
      guestName: "Claudia",
      guestPhone: "(21) 99535-9254",
      guestEmail: "",
      includeBreakfast: true,
      requesterType: "guest",
      requesterIsGuest1: true,
      companyId: 32,
      companyName: "Innovat Distribuidora e Comercio Ltda.",
      guests: [{ name: "Claudia", index: 1, phone: "(21) 99535-9254", email: "" }]
    };

    const bfTpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_breakfast_reminder");
    const coTpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_checkout_reminder");
    const db = {
      reservations: [resConfirmed, resExpired],
      companies: [{ id: 32, tradeName: "Innovat Distribuidora e Comercio Ltda.", phone: "", financialEmail: "innovat@innovat.vet.br", isInvoiceOnly: true }],
      agencies: [],
      flats: [{ id: 4, number: "211" }, { id: 5, number: "212" }],
      whatsappTemplates: [bfTpl, coTpl],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [],
      cleaningRequests: [],
      zapiConfig: { enabled: true, testModeOnly: false },
      settings: {}
    };

    const elig = evaluateStayContactEligibility(resConfirmed, db, { targetType: "guest" });
    assert.equal(elig.phoneAllowedForStay, true);
    assert.equal(elig.phoneBlockedReason, null);
    assert.equal(elig.effectivePhone, "(21) 99535-9254");

    const rec = getReservationRecipients(resConfirmed, db);
    const targets = buildTemplateTargets(bfTpl, rec, { targetMode: "guest" });
    assert.equal(targets.length, 1);
    assert.equal(targets[0].phone, "(21) 99535-9254");

    scheduleUpcomingReservationTriggers(db, () => {}, { nowOverride: new Date("2026-11-23T18:00:00.000Z") });
    const bfItem = db.whatsappQueue.find(q => q.reservationCode === "RES-211-0995" && q.triggerEvent === "breakfast_reminder");
    const coItem = db.whatsappQueue.find(q => q.reservationCode === "RES-211-0995" && q.triggerEvent === "checkout_reminder");
    assert.ok(bfItem, "breakfast_reminder deveria ser agendado para RES-211-0995");
    assert.equal(bfItem.scheduledFor, "2026-11-23T21:00:00.000Z");
    assert.ok(coItem, "checkout_reminder deveria ser agendado para RES-211-0995");
  });

  it("2. Pré-reserva ainda pendente ('pre_reserva') mais antiga NÃO supera reserva confirmada nas mesmas datas", () => {
    const resPre = {
      id: 1001,
      code: "RES-211-1001",
      status: "pre_reserva",
      flatId: 4,
      flatNumber: "211",
      checkinDate: "2026-11-25",
      checkoutDate: "2026-11-26",
      createdAt: "2026-11-24T10:00:00.000Z",
      guestName: "Claudia",
      guestPhone: "(21) 99535-9254",
      requesterType: "guest",
      requesterIsGuest1: true
    };
    const resConf = {
      id: 1002,
      code: "RES-212-1002",
      status: "confirmada",
      flatId: 5,
      flatNumber: "212",
      checkinDate: "2026-11-25",
      checkoutDate: "2026-11-26",
      createdAt: "2026-11-24T11:00:00.000Z",
      guestName: "Claudia",
      guestPhone: "(21) 99535-9254",
      requesterType: "guest",
      requesterIsGuest1: true
    };
    const db = { reservations: [resPre, resConf], companies: [], agencies: [] };
    const eligConf = evaluateStayContactEligibility(resConf, db, { targetType: "guest" });
    assert.equal(eligConf.phoneAllowedForStay, true);
    assert.equal(eligConf.phoneBlockedReason, null);
  });

  it("3. Multi-flat real (2 reservas confirmadas sobrepostas com mesmo telefone) continua bloqueando apenas o flat secundário", () => {
    const f1 = {
      id: 2001,
      code: "RES-509-2001",
      status: "confirmada",
      flatId: 8,
      flatNumber: "509",
      checkinDate: "2026-11-25",
      checkoutDate: "2026-11-27",
      createdAt: "2026-11-24T10:00:00.000Z",
      guestName: "Rosana",
      guestPhone: "(22) 99856-9120",
      requesterType: "guest",
      requesterIsGuest1: true
    };
    const f2 = {
      id: 2002,
      code: "RES-511-2002",
      status: "confirmada",
      flatId: 9,
      flatNumber: "511",
      checkinDate: "2026-11-25",
      checkoutDate: "2026-11-27",
      createdAt: "2026-11-24T10:01:00.000Z",
      guestName: "Rosana",
      guestPhone: "(22) 99856-9120",
      requesterType: "guest",
      requesterIsGuest1: true
    };
    const db = { reservations: [f1, f2], companies: [], agencies: [] };
    assert.equal(evaluateStayContactEligibility(f1, db, { targetType: "guest" }).phoneAllowedForStay, true);
    const e2 = evaluateStayContactEligibility(f2, db, { targetType: "guest" });
    assert.equal(e2.phoneAllowedForStay, false);
    assert.equal(e2.phoneBlockedReason, "DUPLICATE_CONTACT_SECONDARY_FLAT");
  });

  it("4. deliverQueueItem envia lembrete de café via Z-API sem ReferenceError (shouldSendDoc) e marca item.status='sent'", async () => {
    fetchCalls = [];
    const resv = {
      id: 995,
      code: "RES-211-0995",
      status: "confirmada",
      flatId: 5,
      flatNumber: "212",
      checkinDate: "2026-11-23",
      checkoutDate: "2026-11-24",
      channel: "whatsapp",
      guestName: "Claudia",
      guestPhone: "(21) 99535-9254",
      guestEmail: "",
      includeBreakfast: true,
      requesterType: "guest",
      requesterIsGuest1: true
    };

    const queueItem = {
      id: "q_test_bf_995",
      reservationId: 995,
      reservationCode: "RES-211-0995",
      flatId: 5,
      flatNumber: "212",
      guestName: "Claudia",
      recipientName: "Claudia",
      recipientType: "guest",
      guestPhone: "(21) 99535-9254",
      guestEmail: "",
      channel: "whatsapp",
      triggerEvent: "breakfast_reminder",
      templateId: "tpl_breakfast_reminder",
      title: "Café da Manhã • Montagem da Bandeja",
      footer: "CorpFlats • Café no Flat",
      renderedMessage: "Olá, *Claudia*! ☕🥐",
      renderedButtons: [{ id: "btn_cafe", type: "URL", label: "🥐 Montar Café", url: "https://corpflats.com.br/cafe/RES-211-0995" }],
      scheduledFor: "2026-11-23T21:00:00.000Z",
      status: "scheduled",
      sentAt: null,
      error: null
    };

    const db = {
      reservations: [resv],
      flats: [{ id: 5, number: "212" }],
      companies: [],
      agencies: [],
      whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES,
      whatsappQueue: [queueItem],
      whatsappHistory: [],
      whatsappConversations: [],
      breakfastOrders: [],
      cleaningRequests: [],
      settings: {},
      zapiConfig: {
        enabled: true,
        testModeOnly: false,
        instanceId: "MOCK_INSTANCE",
        token: "MOCK_TOKEN",
        clientToken: "MOCK_CLIENT_TOKEN"
      }
    };

    const result = await deliverQueueItem(db, () => {}, queueItem, {
      method: "automated",
      historyPrefix: "cron",
      nowOverride: new Date("2026-11-23T21:00:30.000Z")
    });

    assert.equal(result.success, true);
    assert.equal(result.waResult?.success, true);
    assert.equal(queueItem.status, "sent");
    assert.equal(queueItem.whatsappStatus, "sent");
    assert.ok(queueItem.sentAt, "sentAt deve ser preenchido");
    assert.equal(queueItem.error, null);
    assert.equal(db.whatsappHistory.length, 1);
    assert.equal(db.whatsappHistory[0].triggerEvent, "breakfast_reminder");
    assert.equal(fetchCalls.length, 1);
  });
});
