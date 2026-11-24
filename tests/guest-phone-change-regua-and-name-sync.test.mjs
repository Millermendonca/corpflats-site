import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  isInitialConfirmationInFlightOrSent,
  dispatchCatchUpGuestRulerMessages,
  triggerImmediateWhatsApp
} from "../artifacts/api-server/zapi-service.mjs";
import {
  dispatchIndividualFlatGuestInstructions
} from "../artifacts/api-server/package-reservations-service.mjs";

async function run() {
  // 100% offline / em memória (sem instanceId/token na Z-API -> zero chamadas externas reais)
  const sentMessagesLog = [];
  const sentDocsLog = [];

  const mockSendZapiMessage = async (_cfg, payload) => {
    sentMessagesLog.push(payload);
    return { success: true, ok: true, sent: true, messageId: `mock_msg_${sentMessagesLog.length}` };
  };
  const mockSendZapiDocument = async (_cfg, payload) => {
    sentDocsLog.push(payload);
    return { success: true, ok: true, sent: true, messageId: `mock_doc_${sentDocsLog.length}` };
  };

  const baseDb = () => ({
    zapiConfig: { enabled: true, instanceId: "", token: "", testModeOnly: false },
    settings: { checkinTime: "14:00", checkoutTime: "11:00", emailSettings: { enabled: false } },
    flats: [
      { id: 10, number: "509", colName: "509 casal", status: "clean" },
      { id: 21, number: "1304", colName: "1304 Solteiro", status: "clean" },
      { id: 12, number: "512", colName: "512 casal", status: "clean" }
    ],
    whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),
    whatsappQueue: [],
    whatsappHistory: [],
    whatsappConversations: [],
    emailQueue: [],
    reservations: [],
    guests: [],
    breakfastOrders: []
  });

  // ── CENÁRIO 1 (RES-1304-0999 & RES-509-1006):
  // Reserva confirmada já havia enviado régua inicial para número antigo (ex.: esposo ou número antigo),
  // depois o operador cadastra 2 hóspedes (Hóspede 2 sem WhatsApp) e troca o WhatsApp do Hóspede 1 para número novo.
  {
    const db = baseDb();
    const res509 = {
      id: 1006,
      code: "RES-509-1006",
      flatId: 10,
      flatNumber: "509",
      status: "confirmada",
      paymentStatus: "pago_total",
      channel: "whatsapp",
      checkinDate: "2026-11-24",
      checkoutDate: "2026-11-27",
      includeBreakfast: true,
      guestCount: 2,
      guestName: "Carla Bettero de Araujo Baptista",
      guestPhone: "22988776655", // Novo número da Hóspede 1
      confirmationWhatsappSentAt: "2026-11-23T18:00:00.000Z", // Legado/anterior carimbado
      confirmationSentPhones: ["22999110000"], // Número antigo
      manualPdfSentAt: "2026-11-23T18:00:05.000Z",
      manualPdfSentPhones: ["22999110000"],
      guestPhoneUpdatedAt: "2026-11-24T12:30:00.000Z",
      guests: [
        { index: 1, isMain: true, name: "Carla Bettero de Araujo Baptista", phone: "22988776655", hasCompletedCheckin: false },
        { index: 2, isMain: false, name: "Segundo Hóspede Sem Zap", phone: "", hasCompletedCheckin: false }
      ]
    };
    db.reservations = [res509];
    db.whatsappHistory.push({
      id: "wah_old_1",
      reservationId: 1006,
      reservationCode: "RES-509-1006",
      recipientType: "guest",
      guestName: "Carla Bettero de Araujo Baptista",
      guestPhone: "5522999110000",
      triggerEvent: "reservation_created",
      status: "sent",
      sentAt: "2026-11-23T18:00:00.000Z"
    });
    // Item vencido na fila com telefone antigo NÃO deve ser disparado nem para o antigo nem para o novo
    db.whatsappQueue.push({
      id: "q_overdue_1",
      reservationId: 1006,
      reservationCode: "RES-509-1006",
      recipientType: "guest",
      guestPhone: "5522999110000",
      triggerEvent: "checkin_day_instructions",
      status: "scheduled",
      scheduledFor: "2026-11-24T10:00:00.000Z" // 07:00 BRT (já passou das 12:30 BRT)
    });

    assert.equal(
      isInitialConfirmationInFlightOrSent(db, res509),
      false,
      "Novo telefone da Hóspede 1 NÃO pode ser bloqueado pelo envio feito ao número antigo"
    );

    const nowMidday = new Date("2026-11-24T15:30:00.000Z"); // 12:30 BRT (fora da janela 18-20h do café)
    const catchRes = await dispatchCatchUpGuestRulerMessages(db, () => {}, res509, {
      baseUrl: "https://corpflats.com.br",
      onlyGuestIndices: [1],
      fastDelay: true,
      nowOverride: nowMidday
    });

    assert.deepEqual(
      catchRes.dispatchedStages,
      ["corpflats_intro", "sameday_reservation"],
      `Deve disparar apenas Apresentação + Confirmação Sameday consolidada (com PDF anexo), sem lembretes vencidos. Recebeu: ${JSON.stringify(catchRes.dispatchedStages)}`
    );

    const newPhoneEntries = db.whatsappHistory.filter(h => String(h.guestPhone || "").includes("22988776655"));
    assert.equal(newPhoneEntries.length, 2, "Histórico deve registrar corpflats_intro + sameday_reservation para o novo telefone");
    assert.equal(newPhoneEntries[0].triggerEvent, "corpflats_intro");
    assert.equal(newPhoneEntries[1].triggerEvent, "sameday_reservation");
    assert.match(String(newPhoneEntries[1].documentName || newPhoneEntries[1].documentUrl || ""), /Manual_do_Hospede/i, "Deve anexar o Manual em PDF ao novo telefone");

    const oldPhoneNewSends = db.whatsappHistory.filter(h => h.id !== "wah_old_1" && String(h.guestPhone || "").includes("22999110000"));
    assert.equal(oldPhoneNewSends.length, 0, "Número antigo jamais deve receber novas mensagens");

    const overdueQueueItem = db.whatsappQueue.find(q => q.id === "q_overdue_1");
    assert.equal(overdueQueueItem.status, "cancelled", "Etapa vencida na fila deve ser cancelada ao trocar o telefone");

    const futureBreakfastQueue = db.whatsappQueue.find(
      q => q.reservationCode === "RES-509-1006" && q.triggerEvent === "breakfast_reminder" && q.status === "scheduled"
    );
    assert.ok(futureBreakfastQueue, "Etapas futuras (ex.: café das 18h de hoje) devem ser agendadas para o novo número");
    assert.match(String(futureBreakfastQueue.guestPhone || ""), /22988776655/);

    assert.equal(
      isInitialConfirmationInFlightOrSent(db, res509),
      true,
      "Após o envio para o novo número, isInitialConfirmationInFlightOrSent deve retornar true para evitar duplicatas"
    );
  }

  // ── CENÁRIO 2: Exceção ativa do Lembrete de Café entre 18:00 e 20:00 + Hóspede 2 com troca de telefone
  {
    const db = baseDb();
    const resEvening = {
      id: 2002,
      code: "RES-512-2002",
      flatId: 12,
      flatNumber: "512",
      status: "confirmada",
      paymentStatus: "pago_total",
      channel: "booking",
      checkinDate: "2026-11-23",
      checkoutDate: "2026-11-26",
      includeBreakfast: true,
      guestCount: 2,
      guestName: "Marcos Titular",
      guestPhone: "22999001111",
      guests: [
        { index: 1, isMain: true, name: "Marcos Titular", phone: "22999001111", hasCompletedCheckin: true },
        { index: 2, isMain: false, name: "Ana Acompanhante", phone: "22988334455", hasCompletedCheckin: false }
      ]
    };
    db.reservations = [resEvening];
    // Hóspede 1 e um telefone ANTIGO da Hóspede 2 já haviam recebido antes
    db.whatsappHistory.push(
      {
        id: "wah_m1",
        reservationId: 2002,
        reservationCode: "RES-512-2002",
        recipientType: "guest",
        guestPhone: "5522999001111",
        triggerEvent: "reservation_created",
        status: "sent",
        sentAt: "2026-11-23T14:00:00.000Z"
      },
      {
        id: "wah_g2_old",
        reservationId: 2002,
        reservationCode: "RES-512-2002",
        recipientType: "guest_2",
        guestPhone: "5522977770000", // Número antigo da Hóspede 2
        triggerEvent: "reservation_created",
        status: "sent",
        sentAt: "2026-11-23T14:05:00.000Z"
      }
    );

    const now19hBrt = new Date("2026-11-24T22:00:00.000Z"); // 19:00 BRT (dentro da janela 18:00-20:00)
    const compRes = await dispatchCatchUpGuestRulerMessages(db, () => {}, resEvening, {
      baseUrl: "https://corpflats.com.br",
      onlyGuestIndices: [2],
      fastDelay: true,
      nowOverride: now19hBrt
    });

    assert.deepEqual(
      compRes.dispatchedStages,
      ["guest_2:corpflats_intro", "guest_2:reservation_created", "guest_2:breakfast_reminder"],
      `Novo número da Hóspede 2 às 19h deve receber as 3 iniciais + lembrete de café da janela ativa (sem checkin_day_instructions vencido). Recebeu: ${JSON.stringify(compRes.dispatchedStages)}`
    );
  }

  // ── CENÁRIO 3 (Q3): Pacote Multi-Flat envia corpflats_intro ("Quem Somos") + Instruções + Manual PDF para 1ª estadia,
  // e pula corpflats_intro para hóspede recorrente.
  {
    const db = baseDb();
    sentMessagesLog.length = 0;
    sentDocsLog.length = 0;

    // Hóspede recorrente já possui estadia anterior concluída
    db.reservations.push({
      id: 900,
      code: "RES-1304-0900",
      flatId: 21,
      flatNumber: "1304",
      status: "concluida",
      checkinDate: "2026-10-01",
      checkoutDate: "2026-10-05",
      guestName: "Paulo Recorrente",
      guestPhone: "22997001122"
    });

    const pkgFlat1 = {
      id: 3001,
      code: "RES-509-3001",
      packageId: "PKG-777888",
      packageCode: "PKG-777888",
      packageIndex: 1,
      isPackagePrimary: true,
      flatId: 10,
      flatNumber: "509",
      status: "confirmada",
      paymentStatus: "pago_total",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-04",
      includeBreakfast: true,
      requesterType: "company",
      requesterIsGuest1: false,
      requesterPhone: "11999998888",
      requesterInfo: { name: "Empresa Solicitante", phone: "11999998888" },
      guestCount: 2,
      guestName: "Beatriz Primeira Vez",
      guestPhone: "22981112233",
      guests: [
        { index: 1, isMain: true, name: "Beatriz Primeira Vez", phone: "22981112233" },
        { index: 2, isMain: false, name: "Paulo Recorrente", phone: "22997001122" }
      ]
    };
    db.reservations.push(pkgFlat1);

    const pkgSent = await dispatchIndividualFlatGuestInstructions(db, [pkgFlat1], "https://corpflats.com.br", {
      sendZapiMessage: mockSendZapiMessage,
      sendZapiDocument: mockSendZapiDocument,
      skipWhatsAppPreCheck: true,
      fastDelay: true
    });

    assert.equal(pkgSent.length, 2);
    const beatrizResult = pkgSent.find(x => x.guestIndex === 1);
    const pauloResult = pkgSent.find(x => x.guestIndex === 2);
    assert.equal(beatrizResult.sentIntro, true, "Beatriz (1ª vez) no pacote multi-flat DEVE receber corpflats_intro");
    assert.equal(beatrizResult.sent, true, "Beatriz deve receber instruções com botões");
    assert.equal(pauloResult.sentIntro, false, "Paulo (recorrente) NÃO deve receber corpflats_intro");
    assert.equal(pauloResult.sent, true, "Paulo deve receber instruções com botões");
    assert.equal(sentDocsLog.length, 2, "Ambos os números inéditos na reserva devem receber o Manual em PDF");
  }

  // ── CENÁRIO 4 (Q4): _excludeGuestIndices em edição mista envia reservation_updated apenas ao Solicitante/acompanhante antigo
  {
    const db = baseDb();
    const resMixed = {
      id: 4001,
      code: "RES-1304-4001",
      flatId: 21,
      flatNumber: "1304",
      status: "confirmada",
      paymentStatus: "pago_total",
      channel: "whatsapp",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-14",
      requesterType: "other_person",
      requesterIsGuest1: false,
      requesterInfo: { name: "Carlos Solicitante", phone: "11988887777", isDifferentFromGuest: true },
      guestCount: 2,
      guestName: "Carla Bettero de Araujo Baptista",
      guestPhone: "22988776655",
      guests: [
        { index: 1, isMain: true, name: "Carla Bettero de Araujo Baptista", phone: "22988776655" },
        { index: 2, isMain: false, name: "Fernanda Acompanhante Antiga", phone: "22977665544" }
      ],
      _changesContext: [{ field: "checkoutDate", label: "Data de Check-out", oldValue: "13/12/2026", newValue: "14/12/2026" }],
      _excludeGuestIndices: [1]
    };
    db.reservations = [resMixed];

    await triggerImmediateWhatsApp(db, () => {}, "reservation_updated", resMixed, "https://corpflats.com.br");

    const phonesUpdated = db.whatsappHistory.map(h => String(h.guestPhone || ""));
    assert.ok(phonesUpdated.some(p => p.includes("11988887777")), "Solicitante distinto deve receber reservation_updated na edição mista");
    assert.ok(phonesUpdated.some(p => p.includes("22977665544")), "Acompanhante antigo deve receber reservation_updated na edição mista");
    assert.ok(!phonesUpdated.some(p => p.includes("22988776655")), "Hóspede 1 com telefone recém-trocado NÃO deve receber a 4ª mensagem reservation_updated");
  }

  // ── CENÁRIO 5 (RES-905-1012 — Ricardo 1ª vez):
  // Mesmo havendo outro "Ricardo" antigo recorrente no CRM/reservas passadas, pré-reserva expirada anterior
  // e channels restritos em tpl_corpflats_intro, o novo Ricardo DEVE receber "Somos a CorpFlats..." + Confirmação + PDF!
  {
    const db = baseDb();
    // Simula template antigo no banco com lista de canais desatualizada (sem "booking")
    const introInDb = db.whatsappTemplates.find(t => t.id === "tpl_corpflats_intro");
    if (introInDb) introInDb.channels = ["site", "whatsapp"];

    // Outro "Ricardo" antigo já recorrente no sistema com telefone diferente
    db.guests.push({
      id: 44,
      name: "Ricardo",
      fullName: "Ricardo",
      phone: "22999110099",
      totalStays: 4,
      tags: ["Recorrente"]
    });
    db.reservations.push({
      id: 400,
      code: "RES-509-0400",
      flatId: 10,
      flatNumber: "509",
      status: "concluida",
      checkinDate: "2026-09-10",
      checkoutDate: "2026-09-12",
      guestId: 44,
      guestName: "Ricardo",
      guestPhone: "22999110099"
    });
    // Pré-reserva expirada anterior no telefone do novo Ricardo (que não enviou corpflats_intro)
    db.whatsappHistory.push({
      id: "wah_preres_exp",
      reservationId: 1011,
      reservationCode: "RES-905-1011",
      recipientType: "guest",
      guestName: "Ricardo",
      guestPhone: "5521988771122",
      triggerEvent: "pre_reservation_created",
      status: "sent",
      sentAt: "2026-11-24T12:00:00.000Z"
    });

    const res905 = {
      id: 1012,
      code: "RES-905-1012",
      flatId: 17,
      flatNumber: "905",
      status: "confirmada",
      paymentStatus: "pago_total",
      channel: "booking",
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-08",
      guestId: 44, // Mesmo se guestId estivesse contaminado por homônimo de 1 nome
      guestName: "Ricardo",
      guestPhone: "21988771122",
      guests: [{ index: 1, isMain: true, guestId: 44, name: "Ricardo", phone: "21988771122" }],
      _fastIntroDelay: true
    };
    db.reservations.push(res905);

    await triggerImmediateWhatsApp(db, () => {}, "reservation_created", res905, "https://corpflats.com.br");

    const ricardoHist = db.whatsappHistory.filter(h => h.reservationCode === "RES-905-1012");
    assert.equal(ricardoHist.length, 2, `Ricardo (905-1012) deve receber Apresentação + Confirmação com PDF! Recebeu: ${JSON.stringify(ricardoHist.map(h => h.triggerEvent))}`);
    assert.equal(ricardoHist[0].triggerEvent, "corpflats_intro");
    assert.match(ricardoHist[0].message, /Somos a \*?CorpFlats\*?/i, "1ª mensagem deve ser 'Somos a CorpFlats, uma empresa com foco em locação...'");
    assert.equal(ricardoHist[1].triggerEvent, "reservation_created");
    assert.match(String(ricardoHist[1].documentName || ricardoHist[1].documentUrl || ""), /Manual_do_Hospede/i, "Deve anexar o Manual em PDF");
  }

  console.log("✅ Todos os cenários de troca de telefone da régua (509-1006 / 1304-0999), 905-1012 (Ricardo 1ª vez), pacotes multi-flat e edição mista passaram 100%!");
}

run().catch(err => {
  console.error("❌ Falha no teste pontual guest-phone-change-regua-and-name-sync:", err);
  process.exit(1);
});
