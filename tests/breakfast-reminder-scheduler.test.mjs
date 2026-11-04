import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const zapi = await import("../artifacts/api-server/zapi-service.mjs");

const {
  calculateScheduledTime,
  scheduleUpcomingReservationTriggers,
  deliverQueueItem,
  reservationHasAnyContact,
  hasReservationBreakfast,
  hasActiveBreakfastOrderForDate,
  getReservationRecipients,
  buildTemplateTargets,
  REQUESTER_AND_GUEST_EVENTS,
  REQUESTER_AND_GUEST_TEMPLATE_IDS,
  GUEST_ONLY_STAY_AND_POST_EVENTS,
  GUEST_ONLY_TEMPLATE_IDS,
  DEFAULT_WHATSAPP_TEMPLATES
} = zapi;

describe("Régua de Café da Manhã (breakfast_reminder) • Agendamento e Elegibilidade", () => {
  const baseTpl = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_breakfast_reminder");

  it("1. Template padrão de café possui todos os canais, recipientTarget 'both' e includeCompanions", () => {
    assert.ok(baseTpl, "tpl_breakfast_reminder deve existir em DEFAULT_WHATSAPP_TEMPLATES");
    assert.strictEqual(baseTpl.triggerEvent, "breakfast_reminder");
    assert.strictEqual(baseTpl.fixedTime, "18:00");
    assert.strictEqual(baseTpl.triggerTiming, "fixed_time_day_before");
    assert.strictEqual(baseTpl.recipientTarget, "both");
    assert.strictEqual(baseTpl.includeCompanions, true);
    assert.deepEqual(
      baseTpl.channels.sort(),
      ["airbnb", "b2b", "booking", "outros", "site", "whatsapp"].sort()
    );
  });

  it("2. Evento breakfast_reminder está registrado em REQUESTER_AND_GUEST_EVENTS e fora de GUEST_ONLY", () => {
    assert.ok(REQUESTER_AND_GUEST_EVENTS.has("breakfast_reminder"), "breakfast_reminder deve estar em REQUESTER_AND_GUEST_EVENTS");
    assert.ok(REQUESTER_AND_GUEST_TEMPLATE_IDS.has("tpl_breakfast_reminder"), "tpl_breakfast_reminder deve estar em REQUESTER_AND_GUEST_TEMPLATE_IDS");
    assert.strictEqual(GUEST_ONLY_STAY_AND_POST_EVENTS.has("breakfast_reminder"), false, "breakfast_reminder NÃO deve estar em GUEST_ONLY_STAY_AND_POST_EVENTS");
    assert.strictEqual(GUEST_ONLY_TEMPLATE_IDS.has("tpl_breakfast_reminder"), false, "tpl_breakfast_reminder NÃO deve estar em GUEST_ONLY_TEMPLATE_IDS");
  });

  it("3. Identifica corretamente café contratado em includeBreakfast, hasBreakfast, ratePlan e notes", () => {
    assert.strictEqual(hasReservationBreakfast({ includeBreakfast: true }), true);
    assert.strictEqual(hasReservationBreakfast({ includeBreakfast: false }), false);
    assert.strictEqual(hasReservationBreakfast({ hasBreakfast: true }), true);
    assert.strictEqual(hasReservationBreakfast({ ratePlan: "with_breakfast" }), true);
    assert.strictEqual(hasReservationBreakfast({ notes: "Hóspede contratou café da manhã na diária" }), true);
    assert.strictEqual(hasReservationBreakfast({ notes: "Sem adicionais" }), false);
  });

  it("4. calculateScheduledTime agenda para as 18:00 da própria data ativa da estadia", () => {
    const resv = {
      checkinDate: "2026-11-04",
      checkoutDate: "2026-11-06"
    };
    const tpl = {
      id: "tpl_breakfast_reminder",
      triggerEvent: "breakfast_reminder",
      triggerTiming: "fixed_time_day_before",
      fixedTime: "18:00"
    };

    const scheduledIso = calculateScheduledTime(tpl, resv, {}, { nowOverride: "2026-11-04T18:00:00-03:00" });
    assert.ok(scheduledIso, "Deve retornar string ISO válida");
    // Horário de Brasília 18:00 corresponde a 21:00 UTC
    assert.ok(
      scheduledIso.includes("2026-11-04T21:00:00.000Z") || scheduledIso.includes("2026-11-04T18:00:00"),
      `Data agendada deve ser 04/11/2026 18:00 BRT: ${scheduledIso}`
    );
  });

  it("5. Dispara para as 3 reservas pendentes em 04/11/2026 (Alessandra 905, Avila Samuel 113, Patrícia 605)", () => {
    const db = {
      _nowOverride: "2026-11-04T18:00:00-03:00",
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [
        {
          ...baseTpl,
          enabled: true
        }
      ],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [],
      flats: [
        { id: "flat_905", number: "905" },
        { id: "flat_113", number: "113" },
        { id: "flat_605", number: "605" }
      ],
      reservations: [
        // 1. Alessandra Dias (Flat 905, ID 596) com acompanhante
        {
          id: 596,
          code: "RES-905-0596",
          flatId: "flat_905",
          flatNumber: "905",
          guestName: "Alessandra Dias",
          guestPhone: "5521964120926",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-06",
          status: "confirmada",
          channel: "site",
          guests: [
            { index: 1, name: "Alessandra Dias", phone: "5521964120926" },
            { index: 2, name: "Lucas Dias", phone: "5521988887777" }
          ]
        },
        // 2. AVILA SAMUEL (Flat 113, ID 550, canal b2b com agência solicitante)
        {
          id: 550,
          code: "RES-113-B2B-25152172",
          flatId: "flat_113",
          flatNumber: "113",
          guestName: "AVILA SAMUEL",
          guestPhone: "41 998725041",
          requesterName: "Agência B2B Viagens",
          requesterPhone: "41 977778888",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-07",
          status: "confirmada",
          channel: "b2b",
          guests: [
            { index: 1, name: "AVILA SAMUEL", phone: "41 998725041" }
          ]
        },
        // 3. Patrícia Belchior de Carvalho (Flat 605, ID 470, sem confirmação presencial / no-show)
        {
          id: 470,
          code: "RES-605-0470",
          flatId: "flat_605",
          flatNumber: "605",
          guestName: "Patrícia Belchior de Carvalho",
          guestPhone: "3198171397",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-05",
          status: "no_show",
          channel: "whatsapp",
          guests: [
            { index: 1, name: "Patrícia Belchior de Carvalho", phone: "3198171397" }
          ]
        }
      ]
    };

    scheduleUpcomingReservationTriggers(db, () => {});

    // Verifica que itens foram agendados na fila para os flats 905, 113 e 605
    const queue905 = db.whatsappQueue.filter(q => q.reservationCode === "RES-905-0596" || q.reservationId === 596);
    const queue113 = db.whatsappQueue.filter(q => q.reservationCode === "RES-113-B2B-25152172" || q.reservationId === 550);
    const queue605 = db.whatsappQueue.filter(q => q.reservationCode === "RES-605-0470" || q.reservationId === 470);

    assert.ok(queue905.length >= 2, "Flat 905 deve agendar para Alessandra (titular) e Lucas (acompanhante)");
    assert.ok(queue905.some(q => q.recipientType === "guest" && q.guestName === "Alessandra Dias"));
    assert.ok(queue905.some(q => q.recipientType === "guest_2" && q.recipientName === "Lucas Dias"));

    assert.ok(queue113.length >= 2, "Flat 113 (B2B) deve agendar para AVILA SAMUEL (titular) e Agência (solicitante)");
    assert.ok(queue113.some(q => q.recipientType === "guest" && q.guestName === "AVILA SAMUEL"));
    assert.ok(queue113.some(q => q.recipientType === "requester" && q.recipientName === "Agência B2B Viagens"));

    assert.ok(queue605.length >= 1, "Flat 605 (status no_show) deve agendar para Patrícia Belchior");
    assert.ok(queue605.some(q => q.guestName === "Patrícia Belchior de Carvalho" && q.guestPhone === "3198171397"));
  });

  it("6. Não agenda café se pedido para a manhã seguinte já foi realizado", () => {
    const db = {
      _nowOverride: "2026-11-04T18:00:00-03:00",
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [
        {
          id: 1,
          reservationCode: "RES-905-0596",
          reservationId: 596,
          roomNumber: "905",
          date: "2026-11-05",
          status: "confirmed"
        }
      ],
      reservations: [
        {
          id: 596,
          code: "RES-905-0596",
          flatNumber: "905",
          guestName: "Alessandra Dias",
          guestPhone: "5521964120926",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-06",
          status: "confirmada"
        }
      ]
    };

    scheduleUpcomingReservationTriggers(db, () => {});
    const queue = db.whatsappQueue.filter(q => q.triggerEvent === "breakfast_reminder" && (q.status === "scheduled" || q.status === "pending"));
    assert.strictEqual(queue.length, 0, "Nenhum lembrete deve ser agendado se pedido para amanhã já existe");
  });

  it("7. Janela estendida (18:00 às 20:00) aceita disparo às 19:30, mas bloqueia estritamente às 20:00", () => {
    const createBaseDb = (timeStr) => ({
      _nowOverride: `2026-11-04T${timeStr}:00-03:00`,
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [],
      reservations: [
        {
          id: 596,
          code: "RES-905-0596",
          flatNumber: "905",
          guestName: "Alessandra Dias",
          guestPhone: "5521964120926",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-06",
          status: "confirmada"
        }
      ]
    });

    // 19:30: dentro da janela estendida -> agenda para envio imediato (+30s)
    const db1930 = createBaseDb("19:30");
    scheduleUpcomingReservationTriggers(db1930, () => {});
    const scheduled1930 = db1930.whatsappQueue.filter(q => q.triggerEvent === "breakfast_reminder" && q.status === "scheduled");
    assert.strictEqual(scheduled1930.length, 1, "Às 19:30 deve agendar o lembrete de café");

    // 20:00: limite estrito atingido -> bloqueia agendamento e cancela itens da fila
    const db2000 = createBaseDb("20:00");
    db2000.whatsappQueue = [
      {
        id: "q_bf_1",
        reservationCode: "RES-905-0596",
        reservationId: 596,
        triggerEvent: "breakfast_reminder",
        status: "scheduled",
        scheduledFor: "2026-11-04T21:00:00.000Z"
      }
    ];
    scheduleUpcomingReservationTriggers(db2000, () => {});
    const activeAt2000 = db2000.whatsappQueue.filter(q => q.status === "scheduled");
    assert.strictEqual(activeAt2000.length, 0, "Às 20:00 nenhum lembrete de café pode ficar agendado");
    assert.strictEqual(db2000.whatsappQueue[0].status, "cancelled");
    assert.ok(db2000.whatsappQueue[0].error.includes("fora da janela limite"));
  });

  it("8. Reservas Day-Use (checkin === checkout) não recebem lembrete de café da manhã", () => {
    const dbDayUse = {
      _nowOverride: "2026-11-04T18:00:00-03:00",
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [],
      reservations: [
        {
          id: 888,
          code: "RES-DAYUSE-888",
          flatNumber: "302",
          guestName: "Hóspede Day Use",
          guestPhone: "5511999990000",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-04", // Saída no mesmo dia
          status: "confirmada"
        }
      ]
    };

    scheduleUpcomingReservationTriggers(dbDayUse, () => {});
    const queueDayUse = dbDayUse.whatsappQueue.filter(q => q.reservationCode === "RES-DAYUSE-888");
    assert.strictEqual(queueDayUse.length, 0, "Reserva Day-Use não deve agendar café para a manhã seguinte");
  });

  it("9. deliverQueueItem cancela entrega se pedido de café foi realizado entre o agendamento e o disparo", async () => {
    const db = {
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [
        {
          id: 101,
          reservationCode: "RES-905-0596",
          reservationId: 596,
          roomNumber: "905",
          date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().substring(0, 10),
          status: "pending"
        }
      ],
      reservations: [
        {
          id: 596,
          code: "RES-905-0596",
          flatNumber: "905",
          guestName: "Alessandra Dias",
          guestPhone: "5521964120926",
          includeBreakfast: true,
          checkinDate: new Date().toISOString().substring(0, 10),
          checkoutDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString().substring(0, 10),
          status: "confirmada"
        }
      ]
    };

    const queueItem = {
      id: "q_test_bf",
      reservationCode: "RES-905-0596",
      reservationId: 596,
      triggerEvent: "breakfast_reminder",
      templateId: "tpl_breakfast_reminder",
      guestPhone: "5521964120926",
      guestName: "Alessandra Dias",
      renderedMessage: "Lembrete de café",
      status: "scheduled"
    };

    const res = await deliverQueueItem(db, () => {}, queueItem);
    assert.strictEqual(res.cancelled, true, "Item da fila deve ser cancelado em tempo real");
    assert.strictEqual(queueItem.status, "cancelled");
    assert.ok(queueItem.error.includes("pedido de café de amanhã já realizado"));
  });

  it("10. reservationHasAnyContact reconhece reservas B2B onde apenas o solicitante possui telefone", () => {
    const b2bReservation = {
      id: 550,
      code: "RES-113-B2B",
      channel: "b2b",
      guestName: "Hóspede Corporativo",
      guestPhone: "", // Sem telefone cadastrado no hóspede
      guestEmail: "",
      requesterName: "Agência Parceira",
      requesterPhone: "41 998725041", // Apenas solicitante possui telefone
      requesterEmail: ""
    };

    const hasContact = reservationHasAnyContact(b2bReservation, {});
    assert.strictEqual(hasContact, true, "Reserva B2B com telefone do solicitante deve ser considerada válida para processamento");
  });

  it("11. Paridade SHA-256 byte-a-byte entre artifacts/api-server/zapi-service.mjs e scripts/zapi-service.mjs", () => {
    const artPath = path.join(rootDir, "artifacts/api-server/zapi-service.mjs");
    const scpPath = path.join(rootDir, "scripts/zapi-service.mjs");
    const b1 = fs.readFileSync(artPath);
    const b2 = fs.readFileSync(scpPath);
    assert.strictEqual(b1.equals(b2), true, "Arquivos gêmeos de zapi-service.mjs devem ter paridade SHA-256 byte-a-byte");
  });

  it("12. Múltiplos acompanhantes com formatos variados de telefone e idempotência estrita em sucessivas execuções do cron", () => {
    const db = {
      _nowOverride: "2026-11-04T18:00:00-03:00",
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [],
      reservations: [
        {
          id: 999,
          code: "RES-999-MULTI",
          flatNumber: "701",
          guestName: "Família Silva",
          guestPhone: "+55 (21) 96412-0926",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-06",
          status: "confirmada",
          guests: [
            { index: 1, name: "Família Silva", phone: "+55 (21) 96412-0926" },
            { index: 2, name: "Lucas Silva", phone: "(21) 98888-7777" },
            { index: 3, name: "Mariana Silva", phone: "21977776666" },
            { index: 4, name: "Pedro Silva", phone: "+55 21 96666-5555" },
            { index: 5, name: "Hóspede Sem Telefone", phone: "" } // Deve ser ignorado sem erro
          ]
        }
      ]
    };

    // 1ª execução do cron às 18:00
    scheduleUpcomingReservationTriggers(db, () => {});

    const queueItems1 = db.whatsappQueue.filter(q => q.reservationCode === "RES-999-MULTI");
    assert.strictEqual(queueItems1.length, 4, "Deve agendar exatamente 4 mensagens (titular + 3 acompanhantes com telefone)");
    assert.ok(queueItems1.some(q => q.recipientType === "guest" && q.recipientName === "Família Silva"));
    assert.ok(queueItems1.some(q => q.recipientType === "guest_2" && q.recipientName === "Lucas Silva"));
    assert.ok(queueItems1.some(q => q.recipientType === "guest_3" && q.recipientName === "Mariana Silva"));
    assert.ok(queueItems1.some(q => q.recipientType === "guest_4" && q.recipientName === "Pedro Silva"));

    // 2ª execução do cron às 18:01 (mesmo estado, itens ainda em 'scheduled')
    db._nowOverride = "2026-11-04T18:01:00-03:00";
    scheduleUpcomingReservationTriggers(db, () => {});
    const queueItems2 = db.whatsappQueue.filter(q => q.reservationCode === "RES-999-MULTI");
    assert.strictEqual(queueItems2.length, 4, "Idempotência: 2ª execução não deve duplicar itens agendados");

    // 3ª execução do cron após o titular e o 2º acompanhante já terem recebido a mensagem ('sent')
    queueItems2[0].status = "sent";
    queueItems2[0].sentAt = "2026-11-04T18:01:30-03:00";
    queueItems2[1].status = "sent";
    queueItems2[1].sentAt = "2026-11-04T18:01:45-03:00";
    db._nowOverride = "2026-11-04T18:05:00-03:00";
    scheduleUpcomingReservationTriggers(db, () => {});
    const queueItems3 = db.whatsappQueue.filter(q => q.reservationCode === "RES-999-MULTI");
    assert.strictEqual(queueItems3.length, 4, "Idempotência: itens já enviados ('sent') não são re-enfileirados");
  });

  it("13. deliverQueueItem respeita nowOverride/db._nowOverride para validação da janela 18:00–20:00", async () => {
    const db = {
      _nowOverride: "2026-11-04T18:30:00-03:00",
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [],
      breakfastOrders: [],
      reservations: [
        {
          id: 596,
          code: "RES-905-0596",
          flatNumber: "905",
          guestName: "Alessandra Dias",
          guestPhone: "5521964120926",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-06",
          status: "confirmada"
        }
      ]
    };

    // Item às 18:30 (dentro da janela) com db._nowOverride: não deve cancelar por horário
    const itemValidWindow = {
      id: "q_window_valid",
      reservationCode: "RES-905-0596",
      reservationId: 596,
      triggerEvent: "breakfast_reminder",
      templateId: "tpl_breakfast_reminder",
      guestPhone: "5521964120926",
      guestName: "Alessandra Dias",
      status: "scheduled"
    };

    // Fora da janela: às 20:30 (deve cancelar com mensagem de janela limite)
    const dbOut = {
      ...db,
      _nowOverride: "2026-11-04T20:30:00-03:00"
    };
    const itemOutWindow = {
      ...itemValidWindow,
      id: "q_window_out"
    };

    const resOut = await deliverQueueItem(dbOut, () => {}, itemOutWindow);
    assert.strictEqual(resOut.cancelled, true, "Às 20:30 deve cancelar a entrega");
    assert.ok(itemOutWindow.error.includes("fora da janela limite"));
  });

  it("14. Estadia multi-diárias: envio do lembrete no Dia 1 não bloqueia agendamento do Dia 2", () => {
    const db = {
      _nowOverride: "2026-11-05T18:00:00-03:00", // Dia 2 da estadia
      zapiConfig: { enabled: true, testModeOnly: false },
      whatsappTemplates: [{ ...baseTpl, enabled: true }],
      whatsappQueue: [],
      whatsappHistory: [
        // Lembrete enviado com sucesso no Dia 1 (04/11)
        {
          id: "h_bf_day1",
          reservationCode: "RES-905-0596",
          reservationId: 596,
          triggerEvent: "breakfast_reminder",
          templateId: "tpl_breakfast_reminder",
          recipientType: "guest",
          guestPhone: "5521964120926",
          status: "sent",
          sentAt: "2026-11-04T18:00:30-03:00"
        }
      ],
      breakfastOrders: [], // Ainda sem pedido para o Dia 3 (06/11)
      reservations: [
        {
          id: 596,
          code: "RES-905-0596",
          flatNumber: "905",
          guestName: "Alessandra Dias",
          guestPhone: "5521964120926",
          includeBreakfast: true,
          checkinDate: "2026-11-04",
          checkoutDate: "2026-11-06", // Check-out no dia 6 (tem café para amanhã dia 5 e dia 6)
          status: "confirmada"
        }
      ]
    };

    scheduleUpcomingReservationTriggers(db, () => {});

    const day2Queue = db.whatsappQueue.filter(
      q => q.reservationCode === "RES-905-0596" && q.triggerEvent === "breakfast_reminder" && q.status === "scheduled"
    );
    assert.strictEqual(day2Queue.length, 1, "No Dia 2 da estadia, o lembrete de café deve ser agendado normalmente para a próxima manhã");
  });
});

