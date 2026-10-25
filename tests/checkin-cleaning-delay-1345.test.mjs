import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  scheduleUpcomingReservationTriggers,
  checkAndTriggerCleaningDelayAlerts,
  checkAndScheduleReadyFlatsOnCheckinDay,
  deliverQueueItem,
  hasReservationEnteredOrCompletedCheckin,
  isFlatStillBeingCleanedOnCheckinDay
} from "../artifacts/api-server/zapi-service.mjs";

const TODAY_STR = "2026-10-20";

function createTestDb() {
  return {
    zapiConfig: {
      enabled: true,
      instanceId: "",
      token: "",
      testModeOnly: false,
      channelGovernance: {
        channels: {
          guest_schedule: { mode: "production", enabled: true }
        }
      }
    },
    settings: {
      checkinTime: "14:00",
      checkoutTime: "12:00",
      emailSettings: { enabled: false }
    },
    whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),
    flats: [
      { id: 1, number: "511", isOccupied: false },
      { id: 2, number: "512", isOccupied: false },
      { id: 3, number: "605", isOccupied: true },
      { id: 4, number: "904", isOccupied: false },
      { id: 5, number: "313", isOccupied: true }
    ],
    reservations: [
      // 1. Flat 511: já limpo hoje (status: "clean") -> NÃO deve receber alerta
      {
        id: 101,
        code: "RES-511-0101",
        flatId: 1,
        flatNumber: "511",
        guestName: "Alice Flat Limpo Hoje",
        guestPhone: "5522999990101",
        checkinDate: TODAY_STR,
        checkoutDate: "2026-10-22",
        status: "confirmada",
        paymentStatus: "pago_total"
      },
      // 2. Flat 512: já estava limpo antes de hoje (sem check-out hoje e sem pendência) -> NÃO deve receber alerta
      {
        id: 102,
        code: "RES-512-0102",
        flatId: 2,
        flatNumber: "512",
        guestName: "Bruno Flat Pronto Anteriormente",
        guestPhone: "5522999990102",
        checkinDate: TODAY_STR,
        checkoutDate: "2026-10-22",
        status: "confirmada",
        paymentStatus: "pago_total"
      },
      // 3. Flat 605: hóspede já entrou / marcou check-in como feito (guestSelfCheckin: true / status: "checkin") -> NÃO deve receber alerta
      {
        id: 103,
        code: "RES-605-0103",
        flatId: 3,
        flatNumber: "605",
        guestName: "Carlos Ja Entrou",
        guestPhone: "5522999990103",
        checkinDate: TODAY_STR,
        checkoutDate: "2026-10-22",
        status: "checkin",
        guestSelfCheckin: true,
        guestSelfCheckinAt: `${TODAY_STR}T12:15:00.000Z`,
        paymentStatus: "pago_total"
      },
      // 4. Flat 904: hóspede ainda NÃO entrou (mesmo tendo assinado FNRH online) e flat está sendo limpo (cleaning_now) -> DEVE receber às 13:45
      {
        id: 104,
        code: "RES-904-0104",
        flatId: 4,
        flatNumber: "904",
        guestName: "Daniela Aguardando Limpeza",
        guestPhone: "5522999990104",
        checkinDate: TODAY_STR,
        checkoutDate: "2026-10-22",
        status: "confirmada",
        fnhrCompleted: true,
        checkedInAt: "2026-10-19T18:00:00.000Z", // assinou FNRH na véspera, mas não entrou no flat
        paymentStatus: "pago_total"
      },
      // 5. Flat 313: hóspede teve entrada confirmada na portaria (status: "in_house", actualCheckinAt preenchido) -> NÃO deve receber alerta
      {
        id: 105,
        code: "RES-313-0105",
        flatId: 5,
        flatNumber: "313",
        guestName: "Eduardo Entrada Portaria",
        guestPhone: "5522999990105",
        checkinDate: TODAY_STR,
        checkoutDate: "2026-10-22",
        status: "in_house",
        actualCheckinAt: `${TODAY_STR}T13:10:00.000Z`,
        paymentStatus: "pago_total"
      }
    ],
    cleaningRequests: [
      {
        id: 1,
        flatId: 1,
        flatNumber: "511",
        requestDate: TODAY_STR,
        status: "clean",
        completedAt: `${TODAY_STR}T11:40:00.000Z`
      },
      {
        id: 2,
        flatId: 2,
        flatNumber: "512",
        requestDate: "2026-10-18",
        status: "clean",
        completedAt: "2026-10-18T13:00:00.000Z"
      },
      {
        id: 3,
        flatId: 3,
        flatNumber: "605",
        requestDate: TODAY_STR,
        status: "dirty"
      },
      {
        id: 4,
        flatId: 4,
        flatNumber: "904",
        requestDate: TODAY_STR,
        status: "cleaning_now",
        cleaningStartedAt: `${TODAY_STR}T13:20:00.000Z`
      },
      {
        id: 5,
        flatId: 5,
        flatNumber: "313",
        requestDate: TODAY_STR,
        status: "will_clean"
      }
    ],
    whatsappQueue: [
      // Item legado na fila que havia sido pré-agendado para o Flat 511 (já limpo)
      {
        id: "q_legacy_delay_511",
        reservationId: 101,
        reservationCode: "RES-511-0101",
        guestName: "Alice Flat Limpo Hoje",
        guestPhone: "5522999990101",
        triggerEvent: "checkin_cleaning_delay",
        templateId: "tpl_checkin_cleaning_delay",
        scheduledFor: `${TODAY_STR}T14:00:00-03:00`,
        status: "scheduled",
        renderedMessage: "Mensagem legada"
      }
    ],
    emailQueue: [],
    whatsappHistory: []
  };
}

test("Template tpl_checkin_cleaning_delay está configurado para 13:45", () => {
  const tpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_checkin_cleaning_delay");
  assert.ok(tpl, "Template tpl_checkin_cleaning_delay deve existir");
  assert.equal(tpl.fixedTime, "13:45");
  assert.match(tpl.title, /13:45/);
});

test("scheduleUpcomingReservationTriggers NUNCA pré-agenda checkin_cleaning_delay na fila e cancela itens legados", () => {
  const db = createTestDb();
  scheduleUpcomingReservationTriggers(db, () => {});

  const legacyItem = db.whatsappQueue.find(q => q.id === "q_legacy_delay_511");
  assert.equal(legacyItem.status, "cancelled", "Item legado de checkin_cleaning_delay na fila deve ser cancelado");

  const scheduledDelays = db.whatsappQueue.filter(
    q => q.triggerEvent === "checkin_cleaning_delay" && q.status === "scheduled"
  );
  assert.equal(scheduledDelays.length, 0, "Nenhum checkin_cleaning_delay deve ser pré-agendado na fila estática");
});

test("deliverQueueItem bloqueia entrega de checkin_cleaning_delay caso o flat já esteja limpo ou hóspede já tenha entrado", async () => {
  const db = createTestDb();
  const itemCleanFlat = {
    id: "q_test_clean",
    reservationId: 101,
    reservationCode: "RES-511-0101",
    guestName: "Alice Flat Limpo Hoje",
    guestPhone: "5522999990101",
    triggerEvent: "checkin_cleaning_delay",
    templateId: "tpl_checkin_cleaning_delay",
    status: "scheduled",
    renderedMessage: "Teste"
  };

  const res = await deliverQueueItem(db, () => {}, itemCleanFlat);
  assert.equal(res.cancelled, true);
  assert.equal(itemCleanFlat.status, "cancelled");
});

test("checkAndTriggerCleaningDelayAlerts dispara pontualmente às 13:45 APENAS para quem ainda não entrou e está em flat ainda sendo limpo", async () => {
  const db = createTestDb();
  const notifications = [];
  const createNotification = (n) => notifications.push(n);

  // Verificações unitárias dos predicados
  assert.equal(isFlatStillBeingCleanedOnCheckinDay(db, db.reservations[0], TODAY_STR), false, "Flat 511 já foi limpo hoje");
  assert.equal(isFlatStillBeingCleanedOnCheckinDay(db, db.reservations[1], TODAY_STR), false, "Flat 512 já estava limpo antes de hoje");
  assert.equal(hasReservationEnteredOrCompletedCheckin(db, db.reservations[2], TODAY_STR), true, "Hóspede do Flat 605 já marcou auto check-in");
  assert.equal(hasReservationEnteredOrCompletedCheckin(db, db.reservations[3], TODAY_STR), false, "Hóspede do Flat 904 só assinou FNRH, ainda não entrou");
  assert.equal(isFlatStillBeingCleanedOnCheckinDay(db, db.reservations[3], TODAY_STR), true, "Flat 904 ainda está sendo limpo");
  assert.equal(hasReservationEnteredOrCompletedCheckin(db, db.reservations[4], TODAY_STR), true, "Hóspede do Flat 313 já entrou pela portaria");

  // 1. Às 13:30 (antes das 13:45): NÃO deve disparar para ninguém
  const at1330 = new Date(`${TODAY_STR}T13:30:00-03:00`);
  await checkAndTriggerCleaningDelayAlerts(db, () => {}, createNotification, "https://corpflats.onrender.com", at1330);
  assert.equal(db.whatsappHistory.length, 0, "Não deve enviar antes das 13:45");

  // 2. Às 13:45: DEVE disparar EXCLUSIVAMENTE para a reserva 104 (Flat 904 em limpeza e hóspede ainda não entrou)
  const at1345 = new Date(`${TODAY_STR}T13:45:00-03:00`);
  await checkAndTriggerCleaningDelayAlerts(db, () => {}, createNotification, "https://corpflats.onrender.com", at1345);

  const delaySent = db.whatsappHistory.filter(h => h.triggerEvent === "checkin_cleaning_delay");
  assert.equal(delaySent.length, 1, "Apenas 1 reserva (Flat 904) deve receber o aviso às 13:45");
  assert.equal(delaySent[0].reservationCode, "RES-904-0104");
  assert.equal(delaySent[0].guestName, "Daniela Aguardando Limpeza");
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].title, /13:45: Flat 904 ainda em limpeza/);

  // 3. Às 14:00: NÃO deve reenviar duplicado para a reserva 104
  const at1400 = new Date(`${TODAY_STR}T14:00:00-03:00`);
  await checkAndTriggerCleaningDelayAlerts(db, () => {}, createNotification, "https://corpflats.onrender.com", at1400);
  const delaySentAfter1400 = db.whatsappHistory.filter(h => h.triggerEvent === "checkin_cleaning_delay");
  assert.equal(delaySentAfter1400.length, 1, "Não deve duplicar o envio às 14:00");
});

test("Flat 715 já pronto desde a véspera (mesmo com registro antigo cleaning_now superado e card futuro dirty): não envia 13:45 e segue regra de liberação por canal (10:00 Direta / 12:00 OTA)", async () => {
  const db = createTestDb();
  db.flats.push(
    { id: 15, number: "715", isOccupied: false },
    { id: 16, number: "716", isOccupied: false }
  );

  // Reserva OTA (Booking) no Flat 715 — caso real José Geraldo Dos Santos
  const res715Ota = {
    id: 515,
    code: "RES-715-0515",
    flatId: 15,
    flatNumber: "715",
    guestName: "José Geraldo Dos Santos",
    guestPhone: "5521998011455",
    channel: "booking",
    checkinDate: TODAY_STR,
    checkoutDate: "2026-10-30",
    status: "confirmada",
    paymentStatus: "pago_total"
  };

  // Reserva Direta (Site) no Flat 716 — também já pronto desde ontem
  const res716Direct = {
    id: 516,
    code: "RES-716-0516",
    flatId: 16,
    flatNumber: "716",
    guestName: "Maria Reserva Direta",
    guestPhone: "5521998011456",
    channel: "site",
    checkinDate: TODAY_STR,
    checkoutDate: "2026-10-28",
    status: "confirmada",
    paymentStatus: "pago_total"
  };

  db.reservations = [res715Ota, res716Direct];

  // Histórico do Flat 715:
  // - Registro antigo de 2026-10-05 com status 'cleaning_now' (órfão)
  // - Limpeza concluída na véspera (2026-10-19) com status 'clean'
  // - Card pré-gerado para o check-out futuro (2026-10-30) com status 'dirty'
  db.cleaningRequests = [
    {
      id: 1440,
      flatId: 15,
      flatNumber: "715",
      requestDate: "2026-10-05",
      status: "cleaning_now"
    },
    {
      id: 1637,
      flatId: 15,
      flatNumber: "715",
      requestDate: "2026-10-19",
      status: "clean",
      completedAt: "2026-10-19T16:52:20.065Z"
    },
    {
      id: 1660,
      flatId: 15,
      flatNumber: "715",
      requestDate: "2026-10-30",
      status: "dirty"
    },
    {
      id: 1638,
      flatId: 16,
      flatNumber: "716",
      requestDate: "2026-10-19",
      status: "clean",
      completedAt: "2026-10-19T15:00:00.000Z"
    }
  ];
  db.whatsappQueue = [];
  db.whatsappHistory = [];

  // 1. Ambos os flats devem ser reconhecidos como JÁ LIMPOS/PRONTOS hoje
  assert.equal(isFlatStillBeingCleanedOnCheckinDay(db, res715Ota, TODAY_STR), false, "Flat 715 já está limpo desde ontem (ignora cleaning_now antigo já resolvido e dirty futuro)");
  assert.equal(isFlatStillBeingCleanedOnCheckinDay(db, res716Direct, TODAY_STR), false, "Flat 716 já está limpo desde ontem");

  // 2. Às 08:30 da manhã: checkAndScheduleReadyFlatsOnCheckinDay agenda 10:00 para Direta (site) e 12:00 para OTA (booking)
  const at0830 = new Date(`${TODAY_STR}T08:30:00-03:00`);
  await checkAndScheduleReadyFlatsOnCheckinDay(db, () => {}, "https://corpflats.com.br", at0830);

  const qDirect = db.whatsappQueue.find(q => q.reservationCode === "RES-716-0516" && q.status === "scheduled");
  const qOta = db.whatsappQueue.find(q => q.reservationCode === "RES-715-0515" && q.status === "scheduled");
  assert.ok(qDirect, "Reserva direta em flat já limpo deve ser agendada na fila");
  assert.equal(qDirect.triggerEvent, "room_ready");
  assert.equal(qDirect.scheduledFor, new Date(`${TODAY_STR}T10:00:00-03:00`).toISOString());

  assert.ok(qOta, "Reserva OTA em flat já limpo deve ser agendada na fila");
  assert.equal(qOta.triggerEvent, "room_ready_ota");
  assert.equal(qOta.scheduledFor, new Date(`${TODAY_STR}T12:00:00-03:00`).toISOString());

  // 3. Às 13:45: NUNCA envia checkin_cleaning_delay para nenhum dos dois
  const at1345 = new Date(`${TODAY_STR}T13:45:00-03:00`);
  await checkAndTriggerCleaningDelayAlerts(db, () => {}, () => {}, "https://corpflats.com.br", at1345);
  assert.equal(db.whatsappHistory.filter(h => h.triggerEvent === "checkin_cleaning_delay").length, 0);

  // 4. Caso o servidor rode após as 12:00/14:00 sem agendamento prévio (ex.: caso Flat 715 hoje às 14:02): dispara imediatamente room_ready_ota
  db.whatsappQueue = [];
  db.whatsappHistory = [];
  delete res715Ota.roomReadySentDate;
  const at1402 = new Date(`${TODAY_STR}T14:02:00-03:00`);
  await checkAndScheduleReadyFlatsOnCheckinDay(db, () => {}, "https://corpflats.com.br", at1402);

  const sent715 = db.whatsappHistory.find(h => h.reservationCode === "RES-715-0515");
  assert.ok(sent715, "Deve disparar imediatamente room_ready_ota para o Flat 715 após as 12:00");
  assert.equal(sent715.triggerEvent, "room_ready_ota");
  assert.equal(res715Ota.roomReadySentDate, TODAY_STR);
});
