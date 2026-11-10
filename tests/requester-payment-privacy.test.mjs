/**
 * Teste pontual: Privacidade financeira quando há Solicitante distinto do Hóspede
 *
 * Cobre:
 * 1. getReservationRecipients:
 *    - Quando o solicitante (outra pessoa ou empresa) tem apenas e-mail (sem telefone), NÃO faz fallback para o telefone do hóspede.
 *    - Quando o solicitante tem apenas telefone (sem e-mail), NÃO faz fallback para o e-mail do hóspede.
 *    - Só faz fallback para o contato do hóspede quando o solicitante não tem NENHUM contato próprio (nem telefone, nem e-mail).
 * 2. buildTemplateTargets:
 *    - Mensagens de cobrança/PIX puro (pre_reservation_created, payment_pending, additional_daily_pending, qm_payment_pending, qm_payment_confirmed)
 *      vão EXCLUSIVAMENTE ao solicitante quando há solicitante distinto.
 *    - Se o solicitante distinto só tiver e-mail (sem telefone), a cobrança vai por e-mail ao solicitante e NUNCA faz fallback para o WhatsApp do hóspede.
 *    - Confirmações operacionais (tpl_new_reservation_direct, tpl_payment_confirmed) vão para hóspede e solicitante.
 * 3. resolveWhatsAppTags & renderTemplateButtons:
 *    - Quando o destinatário é o hóspede (ou acompanhante) e há solicitante distinto, remove blocos de Situação Financeira,
 *      valores, saldo pendente, chave PIX, PIX Copia e Cola e botões de pagamento/PIX.
 *    - Quando o destinatário é o solicitante, mantém todos os dados financeiros, PIX e botões de pagamento.
 * 4. triggerImmediateWhatsApp (reservation_updated):
 *    - Se a alteração for exclusivamente financeira (ex: totalAmount/paymentStatus) e houver solicitante distinto,
 *      NÃO dispara reservation_updated para o hóspede.
 * 5. Sofia IA (whatsapp-ai-service):
 *    - Oculta valores e status de pagamento para o hóspede não-solicitante em buildGuestContext, handleGetReservationDetails e generateHeuristicResponse.
 *    - Bloqueia generatePayment (PIX) para o hóspede não-solicitante, mas permite para o solicitante.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Garante que nenhum e-mail real seja enviado durante o teste
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "9";

const zapi = await import("../artifacts/api-server/zapi-service.mjs");
const ai = await import("../artifacts/api-server/whatsapp-ai-service.mjs");

const {
  getReservationRecipients,
  buildTemplateTargets,
  resolveWhatsAppTags,
  renderTemplateButtons,
  buildMirrorEmailSubject,
  triggerImmediateWhatsApp,
  isInitialConfirmationInFlightOrSent,
  normalizeReservationChannel,
  isTemplateAllowedForChannel,
  dispatchCatchUpGuestRulerMessages,
  DEFAULT_WHATSAPP_TEMPLATES
} = zapi;

const {
  buildGuestContext,
  executeBotAction,
  handleGetReservationDetails,
  generateHeuristicResponse
} = ai;

function isoDatePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().substring(0, 10);
}

function makeCorporateReservation(overrides = {}) {
  return {
    id: "res_corp_1",
    code: "CF-CORP1",
    status: "confirmada",
    paymentStatus: "pendente",
    totalAmount: 900,
    paidAmount: 300,
    flatNumber: "504",
    channel: "site",
    guestName: "João Hóspede",
    guestPhone: "5522999991111",
    guestEmail: "joao.hospede@example.com",
    requesterType: "other_person",
    requesterInfo: {
      name: "Maria Gestora",
      phone: "5511988882222",
      email: "financeiro@empresa.com"
    },
    checkinDate: isoDatePlus(3),
    checkoutDate: isoDatePlus(6),
    createdAt: new Date().toISOString(),
    guests: [
      { index: 1, name: "João Hóspede", phone: "5522999991111", email: "joao.hospede@example.com" },
      { index: 2, name: "Pedro Acompanhante", phone: "5522977773333", email: "pedro@example.com" }
    ],
    ...overrides
  };
}

describe("Privacidade financeira quando há Solicitante distinto do Hóspede", () => {
  it("1. getReservationRecipients respeita fallback estrito (só usa contato do hóspede se solicitante não tiver NENHUM contato)", () => {
    // Caso A: Solicitante tem apenas e-mail (sem telefone) -> NÃO deve puxar o telefone do hóspede
    const resEmailOnly = makeCorporateReservation({
      requesterInfo: {
        name: "Maria Gestora",
        phone: "",
        email: "financeiro@empresa.com"
      }
    });
    const recEmailOnly = getReservationRecipients(resEmailOnly, {});
    assert.equal(recEmailOnly.requester.isDifferentFromGuest, true);
    assert.equal(recEmailOnly.requester.hasOwnContact, true);
    assert.equal(recEmailOnly.requester.phone, "");
    assert.equal(recEmailOnly.requester.email, "financeiro@empresa.com");

    // Caso B: Solicitante tem apenas telefone (sem e-mail) -> NÃO deve puxar o e-mail do hóspede
    const resPhoneOnly = makeCorporateReservation({
      requesterInfo: {
        name: "Maria Gestora",
        phone: "5511988882222",
        email: ""
      }
    });
    const recPhoneOnly = getReservationRecipients(resPhoneOnly, {});
    assert.equal(recPhoneOnly.requester.isDifferentFromGuest, true);
    assert.equal(recPhoneOnly.requester.hasOwnContact, true);
    assert.equal(recPhoneOnly.requester.phone, "5511988882222");
    assert.equal(recPhoneOnly.requester.email, "");

    // Caso C: Solicitante não tem nem telefone nem e-mail -> faz fallback para o contato do hóspede
    const resNoContact = makeCorporateReservation({
      requesterInfo: {
        name: "Maria Gestora",
        phone: "",
        email: ""
      }
    });
    const recNoContact = getReservationRecipients(resNoContact, {});
    assert.equal(recNoContact.requester.hasOwnContact, false);
    assert.equal(recNoContact.requester.phone, "5522999991111");
    assert.equal(recNoContact.requester.email, "joao.hospede@example.com");
  });

  it("2. buildTemplateTargets envia cobrança/PIX exclusivamente ao solicitante e nunca ao hóspede", () => {
    const res = makeCorporateReservation();
    const recipients = getReservationRecipients(res, {});

    for (const billingTpl of [
      { id: "tpl_pre_reserva", triggerEvent: "pre_reservation_created", recipientTarget: "requester" },
      { id: "tpl_payment_pending", triggerEvent: "payment_pending", recipientTarget: "requester" },
      { id: "tpl_additional_daily_pending", triggerEvent: "additional_daily_pending", recipientTarget: "guest" },
      { id: "qm_payment_pending", recipientTarget: "both" },
      { id: "qm_payment_confirmed", recipientTarget: "guest" }
    ]) {
      const targets = buildTemplateTargets(billingTpl, recipients);
      assert.deepEqual(targets.map(t => t.type), ["requester"], `Falha em ${billingTpl.id}`);
      assert.equal(targets[0].phone, "5511988882222");
    }

    // Se o solicitante tiver apenas e-mail, a cobrança vai somente por e-mail ao solicitante e NUNCA para o WhatsApp do hóspede
    const resEmailOnly = makeCorporateReservation({
      requesterInfo: { name: "Empresa XYZ", phone: "", email: "contasapagar@xyz.com" }
    });
    const recEmailOnly = getReservationRecipients(resEmailOnly, {});
    const targetsEmailOnly = buildTemplateTargets(
      { id: "tpl_payment_pending", triggerEvent: "payment_pending", recipientTarget: "requester" },
      recEmailOnly
    );
    assert.equal(targetsEmailOnly.length, 1);
    assert.equal(targetsEmailOnly[0].type, "requester");
    assert.equal(targetsEmailOnly[0].phone, "");
    assert.equal(targetsEmailOnly[0].email, "contasapagar@xyz.com");
  });

  it("3. resolveWhatsAppTags e renderTemplateButtons ocultam dados financeiros/PIX para o hóspede e mantêm para o solicitante", () => {
    const res = makeCorporateReservation();
    const db = {};

    const tplNewDirect = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_new_reservation_direct");
    const tplPayConfirmed = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_payment_confirmed");
    const tplPreReserva = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_reserva");

    // Para o HÓSPEDE: sem valores, sem Situação Financeira, sem PIX
    const guestMsgNew = resolveWhatsAppTags(tplNewDirect.message, res, db, "https://corpflats.onrender.com", "guest", tplNewDirect);
    assert.ok(!guestMsgNew.includes("Situação Financeira"), "Hóspede não deve ver seção Situação Financeira");
    assert.ok(!guestMsgNew.includes("R$"), "Hóspede não deve ver valores em R$");
    assert.ok(guestMsgNew.includes("Flat 504"), "Hóspede deve continuar vendo o número do Flat");
    assert.ok(guestMsgNew.includes("Pré-Check-in Digital"), "Hóspede deve continuar vendo instruções de check-in");

    const guestMsgPayConf = resolveWhatsAppTags(tplPayConfirmed.message, res, db, "https://corpflats.onrender.com", "guest", tplPayConfirmed);
    assert.ok(!guestMsgPayConf.includes("Situação Financeira"));
    assert.ok(!guestMsgPayConf.includes("recebimento do seu pagamento"));
    assert.ok(!guestMsgPayConf.includes("R$"));
    assert.ok(guestMsgPayConf.includes("Garantida & Confirmada"));

    // Assunto do e-mail para o hóspede em payment_confirmed não fala em pagamento
    const guestSubject = buildMirrorEmailSubject(tplPayConfirmed, res, db, "https://corpflats.onrender.com", "guest");
    assert.ok(!/pagamento/i.test(guestSubject), `Assunto para hóspede não deve conter 'Pagamento': ${guestSubject}`);

    // Botões para o HÓSPEDE não contêm PIX nem pagamento
    const guestButtons = renderTemplateButtons(tplPreReserva.buttons, res, db, "https://corpflats.onrender.com", "guest", tplPreReserva);
    assert.ok(!guestButtons.some(b => b.id === "btn_pix" || b.id === "btn_pagar" || /pix|pagar/i.test(b.label || "")));

    // Para o SOLICITANTE: mantém todos os valores, Situação Financeira e botões PIX
    const reqMsgNew = resolveWhatsAppTags(tplNewDirect.message, res, db, "https://corpflats.onrender.com", "requester", tplNewDirect);
    assert.ok(reqMsgNew.includes("Situação Financeira"), "Solicitante deve ver Situação Financeira");
    assert.ok(reqMsgNew.includes("R$"), "Solicitante deve ver valores em R$");

    const reqButtons = renderTemplateButtons(tplPreReserva.buttons, res, db, "https://corpflats.onrender.com", "requester", tplPreReserva);
    assert.ok(reqButtons.some(b => b.id === "btn_pix" || /pix/i.test(b.label || "")), "Solicitante deve receber botão PIX");
  });

  it("4. triggerImmediateWhatsApp (reservation_updated) ignora o hóspede se a mudança foi apenas financeira", async () => {
    const res = makeCorporateReservation({
      _changesContext: [
        { field: "totalAmount", oldValue: 900, newValue: 1200 },
        { field: "paymentStatus", oldValue: "pendente", newValue: "pago" }
      ]
    });
    const db = {
      zapiConfig: { enabled: true, testModeOnly: true, testAllowedPhones: [] },
      settings: { emailSettings: { enabled: true } },
      whatsappTemplates: JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES)),
      reservations: [res],
      reservationCommunications: [],
      whatsappHistory: []
    };
    await triggerImmediateWhatsApp(db, () => {}, "reservation_updated", res, "https://corpflats.onrender.com");
    // Nenhum e-mail espelho nem histórico deve ter sido gerado para o hóspede
    const guestEmails = db.reservationCommunications.filter(c => c.recipient === "joao.hospede@example.com");
    assert.equal(guestEmails.length, 0);
  });

  it("5. Sofia IA oculta dados financeiros e bloqueia geração de PIX para o hóspede não-solicitante", async () => {
    const res = makeCorporateReservation();
    const db = {
      reservations: [res],
      flats: [{ id: "f504", number: "504", isActive: true }]
    };

    // Contexto para o hóspede (telefone 5522999991111)
    const guestCtx = buildGuestContext(db, "5522999991111");
    assert.equal(guestCtx.hideFinancialForGuest, true);
    assert.equal(guestCtx.reservation.totalAmount, undefined);
    assert.equal(guestCtx.reservation.paymentStatus, undefined);

    // Contexto para o solicitante (telefone 5511988882222)
    const reqCtx = buildGuestContext(db, "5511988882222");
    assert.equal(reqCtx.hideFinancialForGuest, false);
    assert.equal(reqCtx.reservation.totalAmount, 900);
    assert.equal(reqCtx.reservation.paymentStatus, "pendente");

    // Detalhes da reserva via tool para o hóspede vs solicitante
    const detailsForGuest = handleGetReservationDetails(db, { code: "CF-CORP1", requesterPhone: "5522999991111" });
    assert.equal(detailsForGuest.reservation.totalAmount, undefined);
    assert.equal(detailsForGuest.reservation.paymentStatus, undefined);

    const detailsForReq = handleGetReservationDetails(db, { code: "CF-CORP1", requesterPhone: "5511988882222" });
    assert.equal(detailsForReq.reservation.totalAmount, 900);

    // Geração de PIX bloqueada para o hóspede, permitida para o solicitante
    const payGuest = await executeBotAction(db, "generatePayment", {
      reservationCode: "CF-CORP1",
      requesterPhone: "5522999991111"
    });
    assert.equal(payGuest.success, false);
    assert.equal(payGuest.error, "BILLING_HANDLED_BY_REQUESTER");

    const payReq = await executeBotAction(db, "generatePayment", {
      reservationCode: "CF-CORP1",
      requesterPhone: "5511988882222"
    });
    assert.equal(payReq.success, true);
    assert.ok(payReq.pixCopiaECola);

    // Resposta heurística ao hóspede quando pergunta sobre pagamento/PIX da reserva
    const heuristicReply = generateHeuristicResponse("Qual o PIX para pagar minha reserva?", guestCtx, null, [], db);
    assert.ok(heuristicReply.includes("Maria Gestora"), `Resposta deve citar o solicitante: ${heuristicReply}`);
    assert.ok(!heuristicReply.includes("R$ 900"));
  });

  it("6. Pré-reserva paga no dia do check-in (pós 07:01) com Solicitante ≠ Hóspede envia comprovante ao Solicitante e as 3 msgs da régua ao Hóspede", async () => {
    // Valida normalização do canal 'empresa' (🏢 Empresa PJ) para a régua
    const tplIntro = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_corpflats_intro");
    assert.equal(normalizeReservationChannel("empresa"), "whatsapp");
    assert.equal(isTemplateAllowedForChannel(tplIntro, "empresa"), true);

    const fixedNow = new Date("2026-11-10T18:24:00.000Z"); // 15:24 BRT
    const resSameDay = makeCorporateReservation({
      id: 790,
      code: "RES-116-0790",
      flatId: 116,
      flatNumber: "116",
      channel: "empresa",
      status: "confirmada",
      paymentStatus: "pago_total",
      totalAmount: 350,
      paidAmount: 350,
      paidAt: fixedNow.toISOString(),
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-11",
      createdAt: new Date(fixedNow.getTime() - 50 * 3600 * 1000).toISOString(), // criada >48h antes, paga agora
      guests: [
        { index: 1, name: "João Hóspede", phone: "5522999991111", email: "" }
      ],
      guestEmail: "",
      requesterInfo: {
        name: "Maria Gestora",
        phone: "5511988882222",
        email: ""
      },
      _nowOverride: fixedNow,
      _fastIntroDelay: true
    });

    const db = {
      _nowOverride: fixedNow,
      zapiConfig: {
        enabled: true,
        instanceId: "",
        token: "",
        testModeOnly: false,
        channels: {
          guest_schedule: { enabled: true, testMode: false, whitelist: [], blacklist: [] }
        }
      },
      settings: { emailSettings: { enabled: false }, checkinTime: "14:00", checkoutTime: "12:00" },
      whatsappTemplates: JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES)),
      flats: [{ id: 116, number: "116", isActive: true, wifiNetwork: "apto 116", wifiPassword: "123" }],
      cleaningRequests: [],
      reservations: [resSameDay],
      reservationCommunications: [],
      whatsappHistory: [],
      whatsappConversations: [],
      whatsappQueue: []
    };

    // Passo 1: Disparo do comprovante financeiro apenas ao Solicitante (_onlyRequesterTarget)
    await triggerImmediateWhatsApp(db, () => {}, "payment_confirmed", {
      ...resSameDay,
      _onlyRequesterTarget: true,
      _skipAutoIntro: true,
      _forceInitialWelcome: true
    }, "https://corpflats.com.br");

    assert.equal(db.whatsappHistory.length, 1);
    assert.equal(db.whatsappHistory[0].recipientType, "requester");
    assert.equal(db.whatsappHistory[0].guestPhone, "5511988882222");
    assert.equal(db.whatsappHistory[0].triggerEvent, "payment_confirmed");

    // A confirmação do Solicitante NÃO pode mascarar que o Hóspede ainda não recebeu a confirmação!
    assert.equal(isInitialConfirmationInFlightOrSent(db, resSameDay), false);

    // Passo 2: Recuperação / disparo da régua do Hóspede (corpflats_intro + sameday_reservation + Manual PDF, sem duplicar room_ready)
    const catchUpResult = await dispatchCatchUpGuestRulerMessages(db, () => {}, resSameDay, {
      baseUrl: "https://corpflats.com.br",
      nowOverride: fixedNow,
      fastDelay: true
    });

    assert.deepEqual(catchUpResult.dispatchedStages, ["corpflats_intro", "sameday_reservation"]);

    const guestHistory = db.whatsappHistory.filter(h => h.guestPhone === "5522999991111");
    assert.equal(guestHistory.length, 2, "Hóspede deve receber corpflats_intro + sameday_reservation (com PDF embutido)");
    assert.equal(guestHistory[0].triggerEvent, "corpflats_intro");
    assert.ok(guestHistory[0].message.includes("Somos a *CorpFlats*"));
    assert.equal(guestHistory[1].triggerEvent, "sameday_reservation");
    assert.ok(guestHistory[1].message.includes("RES-116-0790"));
    assert.ok(!guestHistory[1].message.includes("R$"), "Hóspede não deve ver valores financeiros");
    assert.equal(guestHistory[1].documentName, "Manual_do_Hospede_CorpFlats.pdf", "3ª mensagem (Manual em PDF) deve acompanhar a confirmação");

    // Solicitante não recebe duplicidade
    const reqHistory = db.whatsappHistory.filter(h => h.guestPhone === "5511988882222");
    assert.equal(reqHistory.length, 1);

    // Agora a confirmação inicial da reserva consta como entregue ao Hóspede
    assert.equal(isInitialConfirmationInFlightOrSent(db, resSameDay), true);
  });
});
