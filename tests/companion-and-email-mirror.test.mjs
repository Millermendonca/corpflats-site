/**
 * Régua de mensagens: acompanhantes (2º/3º hóspede) + espelho por e-mail.
 *
 * Cobre:
 * 1. getReservationRecipients expõe e-mails e acompanhantes
 * 2. buildTemplateTargets (inclusão/exclusão de acompanhantes, eventos financeiros, dedupe por canal)
 * 3. resolveWhatsAppTags / renderTemplateButtons personalizados para "guest_2"
 * 4. renderWhatsAppMirrorEmail (escape, negrito, botões URL, REPLY omitido)
 * 5. scheduleUpcomingReservationTriggers agenda itens para hóspede e acompanhantes (com e-mail), idempotente
 * 6. triggerImmediateWhatsApp: WhatsApp em modo teste bloqueado, mas e-mail espelho enviado;
 *    motor de e-mails pausado → nenhum e-mail
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Garante que nenhum e-mail real seja enviado durante os testes: SMTP aponta para uma porta local fechada.
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "9";

const zapi = await import("../artifacts/api-server/zapi-service.mjs");
const mail = await import("../artifacts/api-server/mail-service.mjs");

const {
  getReservationRecipients,
  buildTemplateTargets,
  shouldIncludeCompanions,
  resolveWhatsAppTags,
  renderTemplateButtons,
  scheduleUpcomingReservationTriggers,
  triggerImmediateWhatsApp
} = zapi;
const { renderWhatsAppMirrorEmail } = mail;

function isoDatePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().substring(0, 10);
}

function makeReservation(overrides = {}) {
  return {
    id: "r_test_1",
    code: "CF-TEST1",
    status: "confirmada",
    paymentStatus: "pago",
    channel: "site",
    guestName: "Ana Souza",
    guestPhone: "+55 11 91111-1111",
    guestEmail: "ana@example.com",
    checkinDate: isoDatePlus(5),
    checkoutDate: isoDatePlus(8),
    createdAt: new Date().toISOString(),
    guests: [
      { index: 1, name: "Ana Souza", phone: "+55 11 91111-1111", email: "ana@example.com" },
      { index: 2, name: "Bruno Lima", phone: "+55 11 92222-2222", email: "bruno@example.com" },
      { index: 3, name: "Hóspede 3", phone: "", email: "carla@example.com" }
    ],
    ...overrides
  };
}

describe("Acompanhantes + espelho por e-mail", () => {
  describe("1. getReservationRecipients", () => {
    it("retorna e-mail do hóspede e lista de acompanhantes com contato", () => {
      const r = getReservationRecipients(makeReservation(), {});
      assert.equal(r.guest.email, "ana@example.com");
      assert.equal(r.companions.length, 2);
      assert.deepEqual(r.companions.map(c => c.type), ["guest_2", "guest_3"]);
      assert.equal(r.companions[0].name, "Bruno Lima");
      assert.equal(r.companions[0].email, "bruno@example.com");
      // Nome placeholder "Hóspede 3" vira saudação genérica
      assert.equal(r.companions[1].name, "Hóspede");
      assert.equal(r.companions[1].phone, "");
    });

    it("ignora acompanhantes sem telefone e sem e-mail", () => {
      const resv = makeReservation({
        guests: [
          { index: 1, name: "Ana Souza" },
          { index: 2, name: "Sem Contato", phone: "", email: "" }
        ]
      });
      assert.equal(getReservationRecipients(resv, {}).companions.length, 0);
    });

    it("solicitante empresa usa e-mail da empresa (ou financeiro)", () => {
      const db = { companies: [{ id: "c1", tradeName: "ACME", phone: "+55 11 93333-3333", financialEmail: "fin@acme.com" }] };
      const r = getReservationRecipients(makeReservation({ requesterType: "company", companyId: "c1" }), db);
      assert.equal(r.requester.email, "fin@acme.com");
      assert.equal(r.requester.isDifferentFromGuest, true);
    });
  });

  describe("2. buildTemplateTargets", () => {
    const recipients = getReservationRecipients(makeReservation(), {});

    it("modo hóspede inclui 2º e 3º hóspede em eventos não financeiros", () => {
      const tpl = { triggerEvent: "pre_checkin_reminder", recipientTarget: "guest" };
      const targets = buildTemplateTargets(tpl, recipients);
      assert.deepEqual(targets.map(t => t.type), ["guest", "guest_2", "guest_3"]);
      const g3 = targets.find(t => t.type === "guest_3");
      assert.equal(g3.phone, "");
      assert.equal(g3.email, "carla@example.com");
    });

    it("eventos financeiros nunca vão para acompanhantes por padrão", () => {
      for (const ev of ["pre_reservation_created", "payment_pending", "additional_daily_pending", "payment_confirmed"]) {
        assert.equal(shouldIncludeCompanions({ triggerEvent: ev }), false, ev);
        const targets = buildTemplateTargets({ triggerEvent: ev, recipientTarget: "guest" }, recipients);
        assert.deepEqual(targets.map(t => t.type), ["guest"], ev);
      }
      // reservation_created vai para acompanhantes (decisão aprovada)
      assert.equal(shouldIncludeCompanions({ triggerEvent: "reservation_created" }), true);
    });

    it("includeCompanions=false desliga acompanhantes; solicitante nunca inclui", () => {
      assert.deepEqual(
        buildTemplateTargets({ triggerEvent: "pre_checkin_reminder", includeCompanions: false }, recipients).map(t => t.type),
        ["guest"]
      );
      const reqTargets = buildTemplateTargets({ triggerEvent: "pre_checkin_reminder", recipientTarget: "requester" }, recipients);
      assert.ok(reqTargets.every(t => !String(t.type).startsWith("guest_")));
    });

    it("sendEmail=false remove e-mails e descarta alvo sem telefone", () => {
      const targets = buildTemplateTargets({ triggerEvent: "pre_checkin_reminder", sendEmail: false }, recipients);
      assert.deepEqual(targets.map(t => t.type), ["guest", "guest_2"]);
      assert.ok(targets.every(t => !t.email));
    });

    it("deduplica telefone/e-mail repetidos entre hóspedes", () => {
      const resv = makeReservation({
        guests: [
          { index: 1, name: "Ana Souza", phone: "+55 11 91111-1111", email: "ana@example.com" },
          { index: 2, name: "Ana Dup", phone: "11911111111", email: "ANA@example.com" }
        ]
      });
      const targets = buildTemplateTargets({ triggerEvent: "pre_checkin_reminder" }, getReservationRecipients(resv, {}));
      assert.deepEqual(targets.map(t => t.type), ["guest"]);
    });
  });

  describe("3. Tags e botões personalizados para o acompanhante", () => {
    const resv = makeReservation();
    const db = { settings: { checkinProvider: "proprio" } };

    it("resolveWhatsAppTags usa nome e link de check-in do 2º hóspede", () => {
      const txt = resolveWhatsAppTags("Olá {{primeiro_nome}} ({{nome_hospede}}) {{link_checkin_digital}}", resv, db, "https://hotel.test", "guest_2");
      assert.match(txt, /Olá Bruno \(Bruno Lima\)/);
      assert.match(txt, /guest=2/);
      const main = resolveWhatsAppTags("Olá {{primeiro_nome}} {{link_checkin_digital}}", resv, db, "https://hotel.test", "guest");
      assert.match(main, /Olá Ana/);
      assert.match(main, /guest=1/);
    });

    it("renderTemplateButtons resolve link de check-in do 2º hóspede", () => {
      const buttons = renderTemplateButtons(
        [{ id: "b1", type: "URL", label: "Check-in", url: "{{link_checkin_digital}}" }],
        resv, db, "https://hotel.test", "guest_2"
      );
      const urls = buttons.map(b => b.url || "").join(" ");
      assert.match(urls, /guest=2/);
    });
  });

  describe("4. renderWhatsAppMirrorEmail", () => {
    it("escapa HTML, converte negrito e transforma botões em links", () => {
      const out = renderWhatsAppMirrorEmail({
        message: "Olá *Ana* <script>x</script>\nVeja https://hotel.test/info",
        buttons: [
          { type: "URL", label: "Fazer check-in", url: "https://hotel.test/pre-checkin/CF-TEST1?guest=1" },
          { type: "REPLY", label: "Sim" }
        ],
        subject: "Assunto X",
        appOrigin: "https://hotel.test"
      });
      assert.equal(out.subject, "Assunto X");
      assert.match(out.html, /<strong>Ana<\/strong>|<b>Ana<\/b>/);
      assert.ok(!out.html.includes("<script>x</script>"));
      assert.match(out.html, /href="https:\/\/hotel\.test\/pre-checkin\/CF-TEST1\?guest=1"/);
      assert.match(out.html, /Fazer check-in/);
      assert.ok(!/>Sim</.test(out.html), "botão REPLY não deve aparecer no e-mail");
    });
  });

  describe("5. scheduleUpcomingReservationTriggers", () => {
    function makeDb() {
      return {
        settings: {},
        zapiConfig: { enabled: true, testModeOnly: false },
        whatsappQueue: [],
        whatsappHistory: [],
        reservations: [makeReservation()],
        whatsappTemplates: [{
          id: "tpl_t_reminder",
          enabled: true,
          title: "Lembrete",
          triggerEvent: "pre_checkin_reminder",
          triggerTiming: "before_event",
          offsetValue: 1,
          offsetUnit: "days",
          recipientTarget: "guest",
          message: "Olá {{primeiro_nome}}, faça seu check-in: {{link_checkin_digital}}"
        }]
      };
    }

    it("agenda para hóspede, 2º (WhatsApp+e-mail) e 3º (só e-mail)", () => {
      const db = makeDb();
      scheduleUpcomingReservationTriggers(db, () => {});
      const types = db.whatsappQueue.map(q => q.recipientType).sort();
      assert.deepEqual(types, ["guest", "guest_2", "guest_3"]);

      const g2 = db.whatsappQueue.find(q => q.recipientType === "guest_2");
      assert.equal(g2.guestEmail, "bruno@example.com");
      assert.ok(g2.guestPhone);
      assert.match(g2.renderedMessage, /Olá Bruno/);
      assert.match(g2.renderedMessage, /guest=2/);
      assert.ok(g2.emailSubject && g2.emailSubject.includes("CF-TEST1"));

      const g3 = db.whatsappQueue.find(q => q.recipientType === "guest_3");
      assert.equal(g3.guestPhone, "");
      assert.equal(g3.guestEmail, "carla@example.com");
    });

    it("é idempotente e o histórico do hóspede principal não bloqueia o acompanhante", () => {
      const db = makeDb();
      db.whatsappHistory.push({ reservationCode: "CF-TEST1", triggerEvent: "pre_checkin_reminder", recipientType: "guest", status: "sent" });
      scheduleUpcomingReservationTriggers(db, () => {});
      scheduleUpcomingReservationTriggers(db, () => {});
      const types = db.whatsappQueue.map(q => q.recipientType).sort();
      assert.deepEqual(types, ["guest_2", "guest_3"]);
    });

    it("acompanhante que já fez o check-in não recebe lembrete de pré-check-in", () => {
      const db = makeDb();
      db.reservations[0].guests[1].hasCompletedCheckin = true;
      scheduleUpcomingReservationTriggers(db, () => {});
      assert.ok(!db.whatsappQueue.some(q => q.recipientType === "guest_2"));
    });

    it("modo teste do WhatsApp: hóspede com e-mail continua agendado (WhatsApp será bloqueado na entrega)", () => {
      const db = makeDb();
      db.zapiConfig.testModeOnly = true;
      db.reservations[0].guests[1].email = "";
      scheduleUpcomingReservationTriggers(db, () => {});
      const types = db.whatsappQueue.map(q => q.recipientType).sort();
      // guest (tem e-mail) e guest_3 (só e-mail) ficam; guest_2 (só WhatsApp bloqueado) sai
      assert.deepEqual(types, ["guest", "guest_3"]);
    });
  });

  describe("6. triggerImmediateWhatsApp", () => {
    function makeDb(extra = {}) {
      return {
        settings: { emailSettings: { enabled: true }, ...(extra.settings || {}) },
        zapiConfig: { enabled: true, testModeOnly: true, testAllowedPhones: "" },
        whatsappQueue: [],
        whatsappHistory: [],
        reservationCommunications: [],
        reservations: [makeReservation()],
        whatsappTemplates: [{
          id: "tpl_t_updated",
          enabled: true,
          title: "Reserva atualizada",
          triggerEvent: "reservation_updated",
          triggerTiming: "immediate",
          recipientTarget: "guest",
          message: "Olá {{primeiro_nome}}, sua reserva {{numero_reserva}} foi atualizada."
        }]
      };
    }

    it("WhatsApp bloqueado pelo modo teste, mas e-mails espelho são enviados para todos", { timeout: 20000 }, async () => {
      const db = makeDb();
      await triggerImmediateWhatsApp(db, () => {}, "reservation_updated", db.reservations[0], "https://hotel.test");
      const mirrors = db.reservationCommunications.filter(c => c.metadata?.channel === "whatsapp_mirror");
      const recipients = mirrors.map(c => c.recipient).sort();
      assert.deepEqual(recipients, ["ana@example.com", "bruno@example.com", "carla@example.com"]);
      const bruno = mirrors.find(c => c.recipient === "bruno@example.com");
      assert.equal(bruno.metadata.recipientType, "guest_2");
      assert.equal(bruno.metadata.isAutomated, true);
      assert.match(bruno.body, /Bruno/);
      assert.match(bruno.subject, /CF-TEST1/);
    });

    it("motor de e-mails automáticos pausado → nenhum e-mail espelho", { timeout: 20000 }, async () => {
      const db = makeDb({ settings: { emailSettings: { enabled: false } } });
      await triggerImmediateWhatsApp(db, () => {}, "reservation_updated", db.reservations[0], "https://hotel.test");
      const mirrors = (db.reservationCommunications || []).filter(c => c.metadata?.channel === "whatsapp_mirror");
      assert.equal(mirrors.length, 0);
    });

    it("template com sendEmail=false não envia e-mail", { timeout: 20000 }, async () => {
      const db = makeDb();
      db.whatsappTemplates[0].sendEmail = false;
      await triggerImmediateWhatsApp(db, () => {}, "reservation_updated", db.reservations[0], "https://hotel.test");
      const mirrors = (db.reservationCommunications || []).filter(c => c.metadata?.channel === "whatsapp_mirror");
      assert.equal(mirrors.length, 0);
    });
  });
});
