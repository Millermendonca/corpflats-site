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

    const scheduledIso = calculateScheduledTime(tpl, resv, {});
    assert.ok(scheduledIso, "Deve retornar string ISO válida");
    // Horário de Brasília 18:00 corresponde a 21:00 UTC
    assert.ok(
      scheduledIso.includes("2026-11-04T21:00:00.000Z") || scheduledIso.includes("2026-11-04T18:00:00"),
      `Data agendada deve ser hoje 18:00 BRT: ${scheduledIso}`
    );
  });

  it("5. Dispara para as 3 reservas pendentes em 04/11/2026 (Alessandra 905, Avila Samuel 113, Patrícia 605)", () => {
    const db = {
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
    const tomorrowStr = new Date(Date.now() + 24 * 3600 * 1000).toISOString().substring(0, 10);
    const todayStr = new Date().toISOString().substring(0, 10);
    const db = {
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
          date: tomorrowStr,
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
          checkinDate: todayStr,
          checkoutDate: "2026-11-20",
          status: "confirmada"
        }
      ]
    };

    scheduleUpcomingReservationTriggers(db, () => {});
    const queue = db.whatsappQueue.filter(q => q.triggerEvent === "breakfast_reminder");
    assert.strictEqual(queue.length, 0, "Nenhum lembrete deve ser agendado se pedido para amanhã já existe");
  });

  it("7. Paridade SHA-256 byte-a-byte entre artifacts/api-server/zapi-service.mjs e scripts/zapi-service.mjs", () => {
    const artPath = path.join(rootDir, "artifacts/api-server/zapi-service.mjs");
    const scpPath = path.join(rootDir, "scripts/zapi-service.mjs");
    const b1 = fs.readFileSync(artPath);
    const b2 = fs.readFileSync(scpPath);
    assert.strictEqual(b1.equals(b2), true, "Arquivos gêmeos de zapi-service.mjs devem ter paridade SHA-256 byte-a-byte");
  });
});
