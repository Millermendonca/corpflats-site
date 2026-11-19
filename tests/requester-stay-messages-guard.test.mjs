import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  GUEST_ONLY_STAY_AND_POST_EVENTS,
  evaluateStayContactEligibility,
  getReservationRecipients,
  buildTemplateTargets,
  renderTemplateButtons,
  resolveWhatsAppTags,
  sendMirrorEmail,
  sanitizeRequesterStayQueues,
  deliverQueueItem,
  dispatchTemplateToTarget,
  triggerImmediateWhatsApp,
  dispatchCatchUpGuestRulerMessages,
  evaluateSundayUpsellEligibility
} from "../artifacts/api-server/zapi-service.mjs";
import {
  dispatchIndividualFlatGuestInstructions
} from "../artifacts/api-server/package-reservations-service.mjs";

const cloneTemplates = () => JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES));

function createMockDb(overrides = {}) {
  return {
    settings: {
      checkinTime: "14:00",
      checkoutTime: "12:00",
      baseUrl: "https://corpflats.com.br",
      emailAutomationEnabled: true,
      whatsappAutomationEnabled: true
    },
    zapiConfig: {
      enabled: true,
      instanceId: "",
      token: "",
      testModeOnly: false,
      connectedPhone: "5522997124021",
      guestGuidePdfUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
      guestGuidePdfName: "Manual_do_Hospede_CorpFlats.pdf"
    },
    whatsappTemplates: cloneTemplates(),
    whatsappQueue: [],
    whatsappHistory: [],
    whatsappConversations: [],
    emailQueue: [],
    reservationCommunications: [],
    breakfastOrders: [],
    agencies: [],
    companies: [],
    guests: [],
    flats: [
      { id: 1, number: "101", status: "occupied" },
      { id: 2, number: "102", status: "occupied" },
      { id: 3, number: "103", status: "occupied" }
    ],
    reservations: [],
    ...overrides
  };
}

let origFetch;
beforeEach(() => {
  origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    throw new Error(`Teste offline não deve realizar chamadas HTTP reais (${url})`);
  };
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("Trava de Estadia: Bloqueio de mensagens operacionais para Solicitante & Multi-Flat", () => {
  it("GUEST_ONLY_STAY_AND_POST_EVENTS inclui checkin_welcome, breakfast_in_production, breakfast_on_the_way e sunday_upsell_offer*", () => {
    assert.equal(GUEST_ONLY_STAY_AND_POST_EVENTS.has("checkin_welcome"), true);
    assert.equal(GUEST_ONLY_STAY_AND_POST_EVENTS.has("breakfast_in_production"), true);
    assert.equal(GUEST_ONLY_STAY_AND_POST_EVENTS.has("breakfast_on_the_way"), true);
    assert.equal(GUEST_ONLY_STAY_AND_POST_EVENTS.has("sunday_upsell_offer"), true);
    assert.equal(GUEST_ONLY_STAY_AND_POST_EVENTS.has("sunday_upsell_offer_pix"), true);
  });

  it("Cenário 1A: Pacote 3 flats onde Solicitante NÃO é hóspede (telefone do solicitante copiado nos 3 flats) -> ZERO avisos de café/estadia", async () => {
    const db = createMockDb();
    const reqPhone = "5522999111222";
    const reqEmail = "comprador@empresa.com";
    const nowNoonBreakfast = new Date("2026-11-19T21:30:00Z"); // 18:30 Brasília

    const makeFlat = (idx, id, code, flatNum) => ({
      id,
      code,
      flatId: idx,
      flatNumber: flatNum,
      packageId: "PKG-1A",
      packageCode: "PCT-1A",
      packageIndex: idx,
      status: "confirmada",
      channel: "site",
      checkinDate: "2026-11-19",
      checkoutDate: "2026-11-22",
      includeBreakfast: true,
      requesterType: "other_person",
      requesterIsGuest1: false,
      requesterName: "Marcos Comprador",
      requesterPhone: reqPhone,
      requesterEmail: reqEmail,
      requesterInfo: { name: "Marcos Comprador", phone: reqPhone, email: reqEmail },
      guestName: `Hóspede Flat ${flatNum}`,
      guestPhone: reqPhone,
      guestEmail: reqEmail,
      _nowOverride: nowNoonBreakfast
    });

    const f1 = makeFlat(1, 101, "CORP-101-0101", "101");
    const f2 = makeFlat(2, 102, "CORP-102-0102", "102");
    const f3 = makeFlat(3, 103, "CORP-103-0103", "103");
    db.reservations = [f1, f2, f3];
    db._nowOverride = nowNoonBreakfast;

    for (const r of db.reservations) {
      const elig = evaluateStayContactEligibility(r, db, { targetType: "guest" });
      assert.equal(elig.phoneAllowedForStay, false);
      assert.equal(elig.emailAllowedForStay, false);
      const recips = getReservationRecipients(r, db);
      const targets = buildTemplateTargets(
        db.whatsappTemplates.find(t => t.id === "tpl_breakfast_reminder"),
        recips
      );
      assert.deepEqual(targets, []);
      await triggerImmediateWhatsApp(db, () => {}, "breakfast_reminder", { ...r, _skipAutoIntro: true, _nowOverride: nowNoonBreakfast });
    }

    assert.equal(db.whatsappHistory.length, 0);
    assert.equal(db.reservationCommunications.length, 0);

    // Também garante que dispatchIndividualFlatGuestInstructions bloqueia os 3
    const instrSent = await dispatchIndividualFlatGuestInstructions(db, db.reservations, "https://corpflats.com.br", {
      suppressExternalSend: true
    });
    assert.equal(instrSent.filter(x => x.skippedRequesterNonGuest).length, 3);
    assert.equal(instrSent.some(x => x.sent), false);
  });

  it("Cenário 1B: Solicitante é Hóspede 1 SOMENTE no Flat 1 (requesterIsGuest1: true) -> apenas Flat 1 recebe 1x café; Flats 2 e 3 bloqueados", async () => {
    const db = createMockDb();
    const reqPhone = "5522999333444";
    const nowNoonBreakfast = new Date("2026-11-19T21:30:00Z"); // 18:30 BRT

    const f1 = {
      id: 201, code: "CORP-101-0201", flatId: 1, flatNumber: "101",
      packageId: "PKG-1B", packageCode: "PCT-1B", packageIndex: 1,
      status: "confirmada", channel: "site",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-22", includeBreakfast: true,
      requesterType: "other_person", requesterIsGuest1: true,
      requesterName: "Carla Viajante", requesterPhone: reqPhone,
      guestName: "Carla Viajante", guestPhone: reqPhone,
      _nowOverride: nowNoonBreakfast
    };
    const f2 = {
      id: 202, code: "CORP-102-0202", flatId: 2, flatNumber: "102",
      packageId: "PKG-1B", packageCode: "PCT-1B", packageIndex: 2,
      status: "confirmada", channel: "site",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-22", includeBreakfast: true,
      requesterType: "other_person", requesterIsGuest1: false,
      requesterName: "Carla Viajante", requesterPhone: reqPhone,
      guestName: "João Equipe", guestPhone: reqPhone,
      _nowOverride: nowNoonBreakfast
    };
    const f3 = {
      id: 203, code: "CORP-103-0203", flatId: 3, flatNumber: "103",
      packageId: "PKG-1B", packageCode: "PCT-1B", packageIndex: 3,
      status: "confirmada", channel: "site",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-22", includeBreakfast: true,
      requesterType: "other_person", requesterIsGuest1: false,
      requesterName: "Carla Viajante", requesterPhone: reqPhone,
      guestName: "Pedro Equipe", guestPhone: reqPhone,
      _nowOverride: nowNoonBreakfast
    };
    db.reservations = [f1, f2, f3];

    assert.equal(evaluateStayContactEligibility(f1, db).phoneAllowedForStay, true);
    assert.equal(evaluateStayContactEligibility(f2, db).phoneAllowedForStay, false);
    assert.equal(evaluateStayContactEligibility(f3, db).phoneAllowedForStay, false);

    for (const r of db.reservations) {
      await triggerImmediateWhatsApp(db, () => {}, "breakfast_reminder", { ...r, _skipAutoIntro: true, _nowOverride: nowNoonBreakfast });
    }
    assert.equal(db.whatsappHistory.length, 1);
    assert.equal(db.whatsappHistory[0].reservationCode, "CORP-101-0201");
  });

  it("Cenário 1C & Catch-Up: Flats 1 e 3 com hóspedes reais e Flat 2 com telefone do solicitante -> só Flats 1 e 3 recebem café no catch-up", async () => {
    const db = createMockDb();
    const reqPhone = "5522999000999";
    const guest1Phone = "5522988111001";
    const guest3Phone = "5522988111003";
    const nowBreakfast = new Date("2026-11-19T21:45:00Z"); // 18:45 BRT

    const baseRes = {
      packageId: "PKG-1C", packageCode: "PCT-1C",
      status: "confirmada", channel: "site",
      checkinDate: "2026-11-18", checkoutDate: "2026-11-22",
      includeBreakfast: true,
      requesterType: "other_person", requesterIsGuest1: false,
      requesterName: "Secretária B2B", requesterPhone: reqPhone
    };
    const f1 = { ...baseRes, id: 301, code: "CORP-101-0301", flatId: 1, flatNumber: "101", packageIndex: 1, guestName: "Carlos Silva", guestPhone: guest1Phone };
    const f2 = { ...baseRes, id: 302, code: "CORP-102-0302", flatId: 2, flatNumber: "102", packageIndex: 2, guestName: "Hóspede Flat 2", guestPhone: reqPhone };
    const f3 = { ...baseRes, id: 303, code: "CORP-103-0303", flatId: 3, flatNumber: "103", packageIndex: 3, guestName: "Ana Souza", guestPhone: guest3Phone };
    db.reservations = [f1, f2, f3];

    for (const r of db.reservations) {
      await dispatchCatchUpGuestRulerMessages(db, () => {}, r, { nowOverride: nowBreakfast, fastDelay: true });
    }

    const bfSends = db.whatsappHistory.filter(h => h.triggerEvent === "breakfast_reminder");
    assert.equal(bfSends.length, 2);
    assert.equal(bfSends.some(h => h.guestPhone === reqPhone), false);
    assert.equal(bfSends.some(h => h.guestPhone === guest1Phone), true);
    assert.equal(bfSends.some(h => h.guestPhone === guest3Phone), true);
  });

  it("Reserva individual legada (requesterType=guest, mesmo contato) CONTINUA elegível para estadia", () => {
    const db = createMockDb();
    const r = {
      id: 401, code: "CORP-101-0401", flatId: 1, flatNumber: "101",
      status: "confirmada", channel: "site",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-21", includeBreakfast: true,
      requesterType: "guest",
      requesterName: "Rafael Costa",
      requesterPhone: "5521988887777",
      requesterEmail: "rafael@gmail.com",
      guestName: "Rafael Costa",
      guestPhone: "5521988887777",
      guestEmail: "rafael@gmail.com"
    };
    db.reservations = [r];
    const elig = evaluateStayContactEligibility(r, db, { targetType: "guest" });
    assert.equal(elig.phoneAllowedForStay, true);
    assert.equal(elig.emailAllowedForStay, true);
  });

  it("Multi-flat OTA sem Solicitante (Booking/Airbnb): libera apenas o 1º flat elegível e bloqueia secundários até preencher contato real", () => {
    const db = createMockDb();
    const sharedPhone = "5511977776666";
    const sharedEmail = "comprador.booking@gmail.com";

    const ota1 = {
      id: 501, code: "BK-101-0501", flatId: 1, flatNumber: "101",
      status: "confirmada", channel: "booking", createdAt: "2026-11-01T10:00:00Z",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-22",
      guestName: "Lucas Ferreira", guestPhone: sharedPhone, guestEmail: sharedEmail
    };
    const ota2 = {
      id: 502, code: "BK-102-0502", flatId: 2, flatNumber: "102",
      status: "confirmada", channel: "booking", createdAt: "2026-11-01T10:01:00Z",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-22",
      guestName: "Beatriz Ramos", guestPhone: sharedPhone, guestEmail: sharedEmail
    };
    const ota3 = {
      id: 503, code: "BK-103-0503", flatId: 3, flatNumber: "103",
      status: "confirmada", channel: "booking", createdAt: "2026-11-01T10:02:00Z",
      checkinDate: "2026-11-19", checkoutDate: "2026-11-22",
      guestName: "Hóspede a definir", guestPhone: sharedPhone, guestEmail: sharedEmail
    };
    db.reservations = [ota1, ota2, ota3];

    const e1 = evaluateStayContactEligibility(ota1, db, { targetType: "guest" });
    const e2 = evaluateStayContactEligibility(ota2, db, { targetType: "guest" });
    const e3 = evaluateStayContactEligibility(ota3, db, { targetType: "guest" });
    assert.equal(e1.phoneAllowedForStay, true);
    assert.equal(e2.phoneAllowedForStay, false);
    assert.equal(e2.phoneBlockedReason, "DUPLICATE_CONTACT_SECONDARY_FLAT");
    assert.equal(e3.phoneAllowedForStay, false);
    assert.equal(e3.phoneBlockedReason, "PLACEHOLDER_GUEST_MULTI_FLAT");

    // Preenchendo contato real exclusivo para o Flat 2 -> libera imediatamente!
    ota2.guestPhone = "5511966665555";
    ota2.guestEmail = "beatriz.real@gmail.com";
    const e2After = evaluateStayContactEligibility(ota2, db, { targetType: "guest" });
    assert.equal(e2After.phoneAllowedForStay, true);
    assert.equal(e2After.emailAllowedForStay, true);
  });

  it("payment_confirmed ao Solicitante: remove botões de café/check-in/cheguei, omite Manual PDF, oculta tags de café e envia apenas 1 recibo por pacote", async () => {
    const db = createMockDb();
    const reqPhone = "5522998001122";
    const g1Phone = "5522997001101";
    const g2Phone = "5522997001102";

    const mkRes = (idx, id, code, flatNum, gPhone) => ({
      id, code, flatId: idx, flatNumber: flatNum,
      packageId: "PKG-PAY", packageCode: "PCT-PAY", packageIndex: idx,
      status: "confirmada", channel: "site", paymentMethod: "pix", paymentStatus: "pago_total",
      totalAmount: 1000, paidAmount: 1000,
      checkinDate: "2026-11-25", checkoutDate: "2026-11-28", includeBreakfast: true,
      requesterType: "other_person", requesterIsGuest1: false,
      requesterName: "Financeiro Corp", requesterPhone: reqPhone,
      guestName: `Hóspede ${idx} Real`, guestPhone: gPhone
    });
    const p1 = mkRes(1, 601, "CORP-101-0601", "101", g1Phone);
    const p2 = mkRes(2, 602, "CORP-102-0602", "102", g2Phone);
    db.reservations = [p1, p2];

    const payTpl = db.whatsappTemplates.find(t => t.id === "tpl_payment_confirmed");
    const reqBtns = renderTemplateButtons(
      [
        ...(payTpl.buttons || []),
        { id: "btn_chk", type: "URL", label: "Fazer Check-in", url: "{{link_checkin_digital}}" },
        { id: "btn_cheguei", type: "URL", label: "Já Cheguei no Flat", url: "{{link_autocheckin}}" },
        { id: "btn_cafe", type: "URL", label: "Café da Manhã", url: "{{link_cafe_manha}}" }
      ],
      p1,
      db,
      "https://corpflats.com.br",
      { type: "requester", name: "Financeiro Corp", phone: reqPhone },
      payTpl
    );
    assert.equal(reqBtns.some(b => b.id === "btn_cafe" || String(b.url || "").includes("/cafe")), false);
    assert.equal(reqBtns.some(b => b.id === "btn_chk" || String(b.url || "").includes("/pre-checkin")), false);
    assert.equal(reqBtns.some(b => b.id === "btn_cheguei" || String(b.url || "").includes("/self-checkin")), false);
    assert.equal(reqBtns.some(b => String(b.url || "").includes("?requester=1")), true);

    const renderedReqBody = resolveWhatsAppTags(
      "Cafe={{link_cafe_manha}}|Checkin={{link_checkin_digital}}|Portal={{link_portal_hospede}}",
      p1,
      db,
      "https://corpflats.com.br",
      { type: "requester" },
      payTpl
    );
    assert.equal(renderedReqBody.includes("/cafe/"), false);
    assert.equal(renderedReqBody.includes("/pre-checkin/"), false);
    assert.equal(renderedReqBody.includes("/minha-reserva/CORP-101-0601?requester=1"), true);

    await triggerImmediateWhatsApp(db, () => {}, "payment_confirmed", { ...p1, _skipAutoIntro: true });
    await triggerImmediateWhatsApp(db, () => {}, "payment_confirmed", { ...p2, _skipAutoIntro: true });

    const reqPayHistory = db.whatsappHistory.filter(
      h => h.triggerEvent === "payment_confirmed" && h.recipientType === "requester"
    );
    assert.equal(reqPayHistory.length, 1);
    assert.equal(reqPayHistory[0].documentUrl, null);
    assert.ok(p1.packagePaymentReceiptSentAt);
    assert.ok(p2.packagePaymentReceiptSentAt);
  });

  it("sendMirrorEmail e sanitizeRequesterStayQueues bloqueiam/cancelam e-mails e filas de estadia para solicitantes e secundários", () => {
    const db = createMockDb();
    const reqPhone = "5522999555666";
    const reqEmail = "agencia@empresa.com";

    const f1 = {
      id: 701, code: "CORP-101-0701", flatId: 1, flatNumber: "101",
      packageId: "PKG-Q", packageCode: "PCT-Q", packageIndex: 1,
      status: "confirmada", channel: "b2b",
      checkinDate: "2026-11-25", checkoutDate: "2026-11-28", includeBreakfast: true,
      requesterType: "agency", requesterIsGuest1: false,
      requesterName: "Agência Viagens", requesterPhone: reqPhone, requesterEmail: reqEmail,
      guestName: "Hóspede Agência", guestPhone: reqPhone, guestEmail: reqEmail
    };
    db.reservations = [f1];

    // Template legado adulterado para "both" deve ser corrigido para "guest"
    const bfTpl = db.whatsappTemplates.find(t => t.id === "tpl_breakfast_reminder");
    bfTpl.recipientTarget = "both";

    // Espelho por e-mail bloqueado para alvo requester e para e-mail do solicitante no campo guest
    const mReq = sendMirrorEmail(db, () => {}, {
      reservation: f1,
      email: reqEmail,
      recipientName: "Agência",
      recipientType: "requester",
      templateId: "tpl_breakfast_reminder",
      triggerEvent: "breakfast_reminder",
      subject: "Café da Manhã",
      message: "Escolha seu café"
    });
    const mGuestSameAsReq = sendMirrorEmail(db, () => {}, {
      reservation: f1,
      email: reqEmail,
      recipientName: "Hóspede Agência",
      recipientType: "guest",
      templateId: "tpl_checkin_day_instructions",
      triggerEvent: "checkin_day_instructions",
      subject: "Check-in Hoje",
      message: "Instruções"
    });
    assert.equal(mReq, null);
    assert.equal(mGuestSameAsReq, null);

    // Itens já existentes na fila são cancelados imediatamente por sanitizeRequesterStayQueues
    db.whatsappQueue.push(
      {
        id: "wq_1", reservationId: 701, reservationCode: "CORP-101-0701",
        templateId: "tpl_breakfast_reminder", triggerEvent: "breakfast_reminder",
        recipientType: "requester", guestPhone: reqPhone, status: "scheduled"
      },
      {
        id: "wq_2", reservationId: 701, reservationCode: "CORP-101-0701",
        templateId: "tpl_checkin_day_instructions", triggerEvent: "checkin_day_instructions",
        recipientType: "guest", guestPhone: reqPhone, status: "pending"
      },
      {
        id: "wq_keep_billing", reservationId: 701, reservationCode: "CORP-101-0701",
        templateId: "tpl_payment_pending", triggerEvent: "payment_pending",
        recipientType: "requester", guestPhone: reqPhone, status: "scheduled"
      }
    );
    db.emailQueue.push(
      {
        id: "eq_1", reservationId: "CORP-101-0701", reservationCode: "CORP-101-0701",
        triggerEvent: "checkin_welcome", recipient: reqEmail, recipientType: "guest", status: "scheduled"
      },
      {
        id: "eq_2", reservationId: "701", reservationCode: "CORP-101-0701",
        triggerEvent: "checkout_reminder", recipient: reqEmail, recipientType: "requester", status: "pending"
      }
    );

    const resSanitize = sanitizeRequesterStayQueues(db, () => {});
    assert.equal(bfTpl.recipientTarget, "guest");
    assert.equal(resSanitize.cancelledWhatsappCount, 2);
    assert.equal(resSanitize.cancelledEmailCount, 2);
    assert.equal(db.whatsappQueue.find(q => q.id === "wq_1").status, "cancelled");
    assert.equal(db.whatsappQueue.find(q => q.id === "wq_2").status, "cancelled");
    assert.equal(db.whatsappQueue.find(q => q.id === "wq_keep_billing").status, "scheduled");
    assert.equal(db.emailQueue.find(q => q.id === "eq_1").status, "cancelled");
    assert.equal(db.emailQueue.find(q => q.id === "eq_2").status, "cancelled");
  });

  it("deliverQueueItem e evaluateSundayUpsellEligibility também bloqueiam entrega residual para solicitante", async () => {
    const db = createMockDb();
    const reqPhone = "5522998776655";
    const r = {
      id: 801, code: "CORP-101-0801", flatId: 1, flatNumber: "101",
      status: "confirmada", channel: "site",
      checkinDate: "2026-11-20", checkoutDate: "2026-11-22", // 2026-11-22 é domingo
      includeBreakfast: true,
      dailyRates: [{ date: "2026-11-20", rate: 300 }, { date: "2026-11-21", rate: 300 }],
      requesterType: "other_person", requesterIsGuest1: false,
      requesterName: "Solicitante X", requesterPhone: reqPhone,
      guestName: "Hóspede X", guestPhone: reqPhone
    };
    db.reservations = [r];

    const item = {
      id: "wq_res",
      reservationId: 801,
      reservationCode: "CORP-101-0801",
      templateId: "tpl_breakfast_reminder",
      triggerEvent: "breakfast_reminder",
      recipientType: "guest",
      guestPhone: reqPhone,
      renderedMessage: "Café",
      status: "scheduled"
    };
    const delRes = await deliverQueueItem(db, () => {}, item, { bypassTestMode: true });
    assert.equal(delRes.cancelled, true);
    assert.equal(item.status, "cancelled");
    assert.equal(db.whatsappHistory.length, 0);

    const upsellRes = evaluateSundayUpsellEligibility(db, "2026-11-22", 30);
    assert.equal(upsellRes.eligibleReservations.length, 0);
    assert.equal(upsellRes.ineligibleReservations.length, 1);
    assert.equal(upsellRes.ineligibleReservations[0].reason, "REQUESTER_PHONE_IN_GUEST_FIELD");
  });
});
