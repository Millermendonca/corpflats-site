import test from "node:test";
import assert from "node:assert/strict";
import {
  isReservationOrFlatCheckedOut,
  cancelPendingStayRemindersForCheckout,
  deliverQueueItem,
  scheduleUpcomingReservationTriggers,
  triggerCheckoutWhatsApp,
  DEFAULT_WHATSAPP_TEMPLATES
} from "../artifacts/api-server/zapi-service.mjs";
import { handleInformCheckout } from "../artifacts/api-server/whatsapp-ai-service.mjs";

function getTodayStr() {
  const now = new Date();
  const nowUtc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brDate = new Date(nowUtc - 3 * 3600000);
  return brDate.toISOString().substring(0, 10);
}

function createMockDb(todayStr) {
  return {
    zapiConfig: { enabled: false, testModeOnly: true, allowedNumbers: [] },
    settings: { emailSettings: { enabled: false } },
    whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),
    flats: [{ id: 12, number: "512", isOccupied: true }],
    reservations: [
      {
        id: 51201,
        code: "RES-512-0001",
        flatId: 12,
        flatNumber: "512",
        guestName: "Felipe",
        guestPhone: "5522999990000",
        guestEmail: "felipe@example.com",
        checkinDate: "2026-10-18",
        checkoutDate: todayStr,
        status: "in_house",
        checkoutDone: false
      }
    ],
    cleaningRequests: [],
    whatsappQueue: [
      {
        id: "q_checkout_rem",
        reservationId: 51201,
        reservationCode: "RES-512-0001",
        guestName: "Felipe",
        guestPhone: "5522999990000",
        triggerEvent: "checkout_reminder",
        templateId: "tpl_checkout_reminder",
        scheduledFor: `${todayStr}T09:30:00-03:00`,
        status: "scheduled"
      },
      {
        id: "q_breakfast_rem",
        reservationId: 51201,
        reservationCode: "RES-512-0001",
        guestName: "Felipe",
        guestPhone: "5522999990000",
        triggerEvent: "breakfast_reminder",
        templateId: "tpl_breakfast_reminder",
        scheduledFor: `${todayStr}T18:00:00-03:00`,
        status: "scheduled"
      },
      {
        id: "q_review",
        reservationId: 51201,
        reservationCode: "RES-512-0001",
        guestName: "Felipe",
        guestPhone: "5522999990000",
        triggerEvent: "post_checkout_review",
        templateId: "tpl_post_checkout_review",
        scheduledFor: `${todayStr}T14:00:00-03:00`,
        status: "scheduled"
      }
    ],
    emailQueue: [
      {
        id: "em_checkout_rem",
        reservationId: "51201",
        reservationCode: "RES-512-0001",
        triggerEvent: "checkout_reminder",
        status: "pending"
      }
    ],
    whatsappHistory: []
  };
}

test("Cancela checkout_reminder e lembretes de estadia quando check-out é disparado via portaria/recepção/link (preservando post_checkout_review)", async () => {
  const todayStr = getTodayStr();
  const db = createMockDb(todayStr);
  const resv = db.reservations[0];

  resv.status = "completed";
  resv.checkoutDone = true;
  await triggerCheckoutWhatsApp(db, () => {}, resv, "portaria_whatsapp");

  const remWa = db.whatsappQueue.find(q => q.id === "q_checkout_rem");
  const brkWa = db.whatsappQueue.find(q => q.id === "q_breakfast_rem");
  const revWa = db.whatsappQueue.find(q => q.id === "q_review");
  const remEm = db.emailQueue.find(e => e.id === "em_checkout_rem");

  assert.equal(remWa.status, "cancelled", "checkout_reminder no WhatsApp deve ser cancelado");
  assert.equal(brkWa.status, "cancelled", "breakfast_reminder no WhatsApp deve ser cancelado");
  assert.equal(remEm.status, "cancelled", "checkout_reminder no E-mail deve ser cancelado");
  assert.equal(revWa.status, "scheduled", "post_checkout_review deve permanecer agendado");
});

test("Cancela checkout_reminder quando hóspede informa saída via WhatsApp (handleInformCheckout)", () => {
  const todayStr = getTodayStr();
  const db = createMockDb(todayStr);

  const result = handleInformCheckout(db, {
    flatNumber: "512",
    phone: "5522999990000",
    guestName: "Felipe"
  });

  assert.equal(result.success, true);
  assert.equal(db.reservations[0].checkoutDone, true);
  assert.equal(db.whatsappQueue.find(q => q.id === "q_checkout_rem").status, "cancelled");
  assert.equal(db.whatsappQueue.find(q => q.id === "q_breakfast_rem").status, "cancelled");
  assert.equal(db.emailQueue.find(e => e.id === "em_checkout_rem").status, "cancelled");
  assert.equal(db.whatsappQueue.find(q => q.id === "q_review").status, "scheduled");
});

test("Detecta check-out via card de limpeza (Desocupado ou Limpando) e bloqueia entrega de checkout_reminder na fila", async () => {
  const todayStr = getTodayStr();
  const db = createMockDb(todayStr);
  const resv = db.reservations[0];

  // Simula card de limpeza marcado como limpeza iniciada (cleaning_now) mesmo antes de atualizar a reserva
  db.cleaningRequests.push({
    id: 1,
    flatId: 12,
    flatNumber: "512",
    requestDate: todayStr,
    status: "cleaning_now",
    isVacant: true,
    isVacantExplicitlySet: true,
    vacantSource: "cleaning_started"
  });

  assert.equal(isReservationOrFlatCheckedOut(db, resv), true);

  const remItem = db.whatsappQueue.find(q => q.id === "q_checkout_rem");
  const deliveryRes = await deliverQueueItem(db, () => {}, remItem);

  assert.equal(deliveryRes.cancelled, true);
  assert.equal(remItem.status, "cancelled");

  // Garante que scheduleUpcomingReservationTriggers não reagenda checkout_reminder
  db.whatsappQueue = [];
  scheduleUpcomingReservationTriggers(db, () => {});
  const reQueuedReminder = db.whatsappQueue.find(q => q.triggerEvent === "checkout_reminder");
  assert.equal(reQueuedReminder, undefined);
});

test("Reserva anterior já concluída no mesmo flat (avaliada para NPS) NÃO cancela o checkout_reminder do hóspede que sai hoje", () => {
  const todayStr = getTodayStr();
  const db = createMockDb(todayStr);

  const yesterdayDate = new Date(new Date(`${todayStr}T12:00:00Z`).getTime() - 24 * 3600000);
  const yesterdayStr = yesterdayDate.toISOString().substring(0, 10);
  const twoDaysAgoDate = new Date(new Date(`${todayStr}T12:00:00Z`).getTime() - 48 * 3600000);
  const twoDaysAgoStr = twoDaysAgoDate.toISOString().substring(0, 10);

  // Reserva atual saindo hoje (ainda em estadia)
  db.reservations[0].checkinDate = yesterdayStr;
  db.reservations[0].checkoutDate = todayStr;
  db.reservations[0].status = "in_house";
  db.reservations[0].checkoutDone = false;

  // Reserva anterior no mesmo Flat 512 que já fez check-out ontem/anteontem (vem depois na lista, como no banco real)
  db.reservations.push({
    id: 51200,
    code: "RES-512-0000",
    flatId: 12,
    flatNumber: "512",
    guestName: "Hóspede Anterior",
    guestPhone: "5522988887777",
    guestEmail: "anterior@example.com",
    checkinDate: twoDaysAgoStr,
    checkoutDate: yesterdayStr,
    status: "completed",
    checkoutDone: true
  });

  // Limpa a fila e simula múltiplos ciclos do agendador às 08:00 da manhã do dia do check-out
  db.whatsappQueue = [];
  db.zapiConfig.testModeOnly = false;
  const morningNow = new Date(`${todayStr}T08:00:00-03:00`);

  scheduleUpcomingReservationTriggers(db, () => {}, { nowOverride: morningNow });
  scheduleUpcomingReservationTriggers(db, () => {}, { nowOverride: morningNow });

  const todayReminders = db.whatsappQueue.filter(
    q => q.reservationCode === "RES-512-0001" && q.triggerEvent === "checkout_reminder"
  );
  assert.equal(todayReminders.length, 1, "Deve haver exatamente 1 agendamento de checkout_reminder para a reserva de hoje");
  assert.equal(todayReminders[0].status, "scheduled", "O checkout_reminder de hoje deve permanecer 'scheduled' e não ser cancelado pela reserva anterior do flat");
});
