/**
 * Milestone M2 Verification Test Suite: Messaging Channels & Dynamic Check-in Provider URL Integration
 * 
 * Tests:
 * 1. Byte-for-byte SHA-256 mirror parity for all 3 file pairs:
 *    - artifacts/api-server/zapi-service.mjs <=> scripts/zapi-service.mjs
 *    - artifacts/api-server/mail-service.mjs <=> scripts/mail-service.mjs
 *    - artifacts/api-server/whatsapp-ai-service.mjs <=> scripts/whatsapp-ai-service.mjs
 * 2. Z-API WhatsApp Engine (zapi-service.mjs):
 *    - getCheckinUrlSync and getCheckinUrl resolution (proprio vs gov_fnrh vs fallback)
 *    - resolveWhatsAppTags replaces {{link_checkin_digital}} dynamically
 *    - Multi-guest reminder text uses getCheckinUrlSync for 2nd guest
 *    - buildTemplateActionButtons / renderTemplateButtons resolves linkCheckinDigital dynamically
 *    - Button filtering/deduplication predicate correctly handles btn_chk, btn_pre, btn_chk_digital,
 *      and Gov.br URL domains (turismo.gov.br)
 * 3. Mail Service (mail-service.mjs):
 *    - renderCheckinConfirmedEmail resolves dynamic check-in links (including 2nd guest link)
 *    - renderReservationUpdateEmail includes dynamic check-in URL
 *    - renderReservationConfirmationEmail renders dynamic CTA button and URL
 *    - renderPreCheckinReminderEmail renders dynamic CTA button and URL
 *    - renderAccessInstructionsEmail renders dynamic CTA button and URL
 * 4. WhatsApp AI Assistant (whatsapp-ai-service.mjs):
 *    - buildGuestContext exposes checkinUrl on root and reservation
 *    - generateHeuristicResponse answers check-in queries with dynamic checkinUrl
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("Milestone M2: Messaging Channels Dynamic Check-in Provider URL Integration", () => {

  // ── 1. Paridade de Arquivos Espelho ─────────────────────────────────────────
  describe("1. Mirror File Strict Byte-for-Byte Parity", () => {
    const pairs = [
      ["artifacts/api-server/zapi-service.mjs", "scripts/zapi-service.mjs"],
      ["artifacts/api-server/mail-service.mjs", "scripts/mail-service.mjs"],
      ["artifacts/api-server/whatsapp-ai-service.mjs", "scripts/whatsapp-ai-service.mjs"]
    ];

    for (const [f1, f2] of pairs) {
      it(`100% byte-for-byte identical: ${f1} <==> ${f2}`, () => {
        const p1 = path.join(rootDir, f1);
        const p2 = path.join(rootDir, f2);

        assert.ok(fs.existsSync(p1), `File must exist: ${f1}`);
        assert.ok(fs.existsSync(p2), `File must exist: ${f2}`);

        const buf1 = fs.readFileSync(p1);
        const buf2 = fs.readFileSync(p2);

        const hash1 = crypto.createHash("sha256").update(buf1).digest("hex");
        const hash2 = crypto.createHash("sha256").update(buf2).digest("hex");

        assert.strictEqual(hash1, hash2, `SHA-256 mismatch for ${f1} vs ${f2}`);
        assert.ok(buf1.equals(buf2), `Buffer.equals failed for ${f1} vs ${f2}`);
      });
    }
  });

  // ── 2. Z-API WhatsApp Engine ────────────────────────────────────────────────
  describe("2. Z-API WhatsApp Service Dynamic Tag & Button Resolution", async () => {
    const zapi = await import("../artifacts/api-server/zapi-service.mjs");

    const mockDbProprio = {
      settings: { checkinProvider: "proprio", baseUrl: "https://corpflats.onrender.com" }
    };

    const mockDbGov = {
      settings: { checkinProvider: "gov_fnrh", baseUrl: "https://corpflats.onrender.com" }
    };

    const reservationProprio = {
      code: "RES-TEST-001",
      id: 101,
      guestName: "Carlos Silva",
      flatNumber: 102,
      checkinDate: "2026-10-15",
      checkoutDate: "2026-10-20",
      guestCount: 2,
      guests: [{ name: "Carlos Silva", hasCompletedCheckin: true, status: "CHECKED_IN" }, { name: "Mariana Silva" }]
    };

    const reservationGov = {
      code: "RES-GOV-002",
      id: 102,
      guestName: "Fernanda Costa",
      flatNumber: 204,
      checkinDate: "2026-10-16",
      checkoutDate: "2026-10-21",
      serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002",
      guestCount: 2,
      guests: [{ name: "Fernanda Costa", hasCompletedCheckin: true, status: "CHECKED_IN" }, { name: "Lucas Costa" }]
    };

    const reservationGovFallback = {
      code: "RES-FALLBACK-003",
      id: 103,
      guestName: "Roberto Lima",
      flatNumber: 305,
      checkinDate: "2026-10-17",
      checkoutDate: "2026-10-22",
      guestCount: 1,
      guests: [{ name: "Roberto Lima" }]
    };

    it("2.1 getCheckinUrlSync resolves internal URL in 'proprio' mode", () => {
      const url = zapi.getCheckinUrlSync(reservationProprio, 1, "https://corpflats.onrender.com", mockDbProprio);
      assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-TEST-001?guest=1");

      const urlGuest2 = zapi.getCheckinUrlSync(reservationProprio, 2, "https://corpflats.onrender.com", mockDbProprio);
      assert.strictEqual(urlGuest2, "https://corpflats.onrender.com/pre-checkin/RES-TEST-001?guest=2");
    });

    it("2.2 getCheckinUrlSync resolves Gov.br URL in 'gov_fnrh' mode when serproPrecheckinUrl is present", () => {
      const url = zapi.getCheckinUrlSync(reservationGov, 1, "https://corpflats.onrender.com", mockDbGov);
      assert.strictEqual(url, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002");
    });

    it("2.3 getCheckinUrlSync falls back gracefully to internal URL when Gov.br link is absent", () => {
      const url = zapi.getCheckinUrlSync(reservationGovFallback, 1, "https://corpflats.onrender.com", mockDbGov);
      assert.strictEqual(url, "https://corpflats.onrender.com/pre-checkin/RES-FALLBACK-003?guest=1");
    });

    it("2.4 resolveWhatsAppTags resolves {{link_checkin_digital}} dynamically", () => {
      const textProprio = zapi.resolveWhatsAppTags(
        "Acesse sua ficha: {{link_checkin_digital}}",
        reservationProprio,
        mockDbProprio,
        "https://corpflats.onrender.com"
      );
      assert.ok(textProprio.includes("https://corpflats.onrender.com/pre-checkin/RES-TEST-001?guest=1"));

      const textGov = zapi.resolveWhatsAppTags(
        "Acesse sua ficha oficial: {{link_checkin_digital}}",
        reservationGov,
        mockDbGov,
        "https://corpflats.onrender.com"
      );
      assert.ok(textGov.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002"));
    });

    it("2.5 Multi-guest reminder (guest 2) embeds dynamic 2nd guest URL in text", () => {
      // Test tag {{mensagem_pendencia_hospedes}}
      const textProprio = zapi.resolveWhatsAppTags(
        "{{mensagem_pendencia_hospedes}}",
        reservationProprio,
        mockDbProprio,
        "https://corpflats.onrender.com"
      );
      assert.ok(textProprio.includes("2º hóspede"));
      assert.ok(textProprio.includes("https://corpflats.onrender.com/pre-checkin/RES-TEST-001?guest=2"), "Must include guest=2 link");

      const textGov = zapi.resolveWhatsAppTags(
        "{{mensagem_pendencia_hospedes}}",
        reservationGov,
        mockDbGov,
        "https://corpflats.onrender.com"
      );
      assert.ok(textGov.includes("2º hóspede"));
      assert.ok(textGov.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002"));
    });

    it("2.6 buildTemplateActionButtons resolves checkin button dynamically and preserves Gov.br domain", () => {
      const template = { id: "tpl_pre_checkin_reminder", triggerEvent: "pre_checkin_reminder" };

      // In proprio mode
      const buttonsProprio = zapi.renderTemplateButtons(
        [{ id: "btn_chk", type: "URL", label: "Check-in", url: "{{link_checkin_digital}}" }],
        reservationProprio,
        mockDbProprio,
        "https://corpflats.onrender.com",
        "guest",
        template
      );
      assert.ok(buttonsProprio.length > 0);
      const chkBtnProprio = buttonsProprio.find(b => b.id === "btn_chk");
      assert.ok(chkBtnProprio);
      assert.strictEqual(chkBtnProprio.url, "https://corpflats.onrender.com/pre-checkin/RES-TEST-001?guest=1");

      // In Gov.br mode
      const buttonsGov = zapi.renderTemplateButtons(
        [{ id: "btn_chk", type: "URL", label: "Check-in", url: "{{link_checkin_digital}}" }],
        reservationGov,
        mockDbGov,
        "https://corpflats.onrender.com",
        "guest",
        template
      );
      const chkBtnGov = buttonsGov.find(b => b.id === "btn_chk");
      assert.ok(chkBtnGov);
      assert.strictEqual(chkBtnGov.url, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resgov002");
    });

    it("2.7 Button filter correctly strips check-in buttons when check-in is done (including turismo.gov.br)", () => {
      const doneReservationGov = {
        ...reservationGov,
        status: "confirmed",
        preCheckinCompleted: true,
        guests: [{ name: "Fernanda", hasCompletedCheckin: true, status: "CHECKED_IN" }]
      };

      const rawButtons = [
        { id: "btn_chk", type: "URL", label: "Check-in", url: "https://fnrh.turismo.gov.br/precheckin/xyz" },
        { id: "btn_portal", type: "URL", label: "Portal", url: "https://corpflats.onrender.com/minha-reserva/RES-GOV-002" }
      ];

      const filtered = zapi.renderTemplateButtons(
        rawButtons,
        doneReservationGov,
        mockDbGov,
        "https://corpflats.onrender.com",
        "guest",
        "tpl_checkin_day_instructions"
      );

      // Check-in button pointing to turismo.gov.br must be removed because pre-checkin is done
      const chkBtn = filtered.find(b => b.id === "btn_chk" || b.url?.includes("turismo.gov.br"));
      assert.strictEqual(chkBtn, undefined, "Check-in button with Gov.br URL must be stripped when pre-checkin is done");
    });
  });

  // ── 3. Mail Service ─────────────────────────────────────────────────────────
  describe("3. Mail Service Dynamic Check-in URL Resolution", async () => {
    const mail = await import("../artifacts/api-server/mail-service.mjs");

    const mockDbProprio = {
      settings: { checkinProvider: "proprio", baseUrl: "https://corpflats.onrender.com" }
    };

    const mockDbGov = {
      settings: { checkinProvider: "gov_fnrh", baseUrl: "https://corpflats.onrender.com" }
    };

    const resProprio = {
      code: "RES-MAIL-001",
      guestName: "Larissa Manoela",
      flatNumber: "101",
      checkinDate: "2026-10-18",
      checkoutDate: "2026-10-23",
      guestCount: 2,
      guests: [{ name: "Larissa Manoela", hasCompletedCheckin: true, status: "CHECKED_IN" }, { name: "André Luiz" }]
    };

    const resGov = {
      code: "RES-MAIL-002",
      guestName: "Juliana Paes",
      flatNumber: "202",
      checkinDate: "2026-10-19",
      checkoutDate: "2026-10-24",
      serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resmail002",
      guestCount: 1,
      guests: [{ name: "Juliana Paes" }]
    };

    it("3.1 renderReservationConfirmationEmail includes dynamic URL and Gov.br badge/button", () => {
      const emailProprio = mail.renderReservationConfirmationEmail({
        reservation: resProprio,
        flat: { number: "101" },
        settings: mockDbProprio.settings,
        db: mockDbProprio
      });
      assert.ok(emailProprio.bodyHtml.includes("https://corpflats.onrender.com/pre-checkin/RES-MAIL-001?guest=1"));
      assert.ok(emailProprio.bodyHtml.includes("Realizar Pré-Check-in Digital"));

      const emailGov = mail.renderReservationConfirmationEmail({
        reservation: resGov,
        flat: { number: "202" },
        settings: mockDbGov.settings,
        db: mockDbGov
      });
      assert.ok(emailGov.bodyHtml.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resmail002"));
      assert.ok(emailGov.bodyHtml.includes("Fazer Check-in Oficial Gov.br (FNRH)"));
    });

    it("3.2 renderPreCheckinReminderEmail includes dynamic URL and 2nd guest link when applicable", () => {
      const emailProprio = mail.renderPreCheckinReminderEmail({
        reservation: resProprio,
        flat: { number: "101" },
        settings: mockDbProprio.settings,
        db: mockDbProprio
      });
      assert.ok(emailProprio.bodyHtml.includes("https://corpflats.onrender.com/pre-checkin/RES-MAIL-001?guest=2"), "Multi-guest reminder must link to guest 2");

      const emailGov = mail.renderPreCheckinReminderEmail({
        reservation: resGov,
        flat: { number: "202" },
        settings: mockDbGov.settings,
        db: mockDbGov
      });
      assert.ok(emailGov.bodyHtml.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resmail002"));
    });

    it("3.3 renderAccessInstructionsEmail includes dynamic checkin URL", () => {
      const emailGov = mail.renderAccessInstructionsEmail({
        reservation: resGov,
        flat: { number: "202" },
        settings: mockDbGov.settings,
        db: mockDbGov
      });
      assert.ok(emailGov.bodyHtml.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resmail002"));
    });

    it("3.4 renderCheckinConfirmedEmail includes dynamic 2nd guest check-in link", () => {
      const email = mail.renderCheckinConfirmedEmail({
        reservation: resProprio,
        flat: { number: "101" },
        settings: mockDbProprio.settings,
        db: mockDbProprio
      });
      assert.ok(email.bodyHtml.includes("https://corpflats.onrender.com/pre-checkin/RES-MAIL-001?guest=2"));
    });
  });

  // ── 4. WhatsApp AI Assistant ────────────────────────────────────────────────
  describe("4. WhatsApp AI Assistant Dynamic Check-in URL Exposure", async () => {
    const aiService = await import("../artifacts/api-server/whatsapp-ai-service.mjs");

    const mockDbGov = {
      settings: { checkinProvider: "gov_fnrh", baseUrl: "https://corpflats.onrender.com" },
      reservations: [
        {
          code: "RES-AI-999",
          guestName: "Bruno Gagliasso",
          guestPhone: "5521999998888",
          flatNumber: 301,
          checkinDate: "2026-10-20",
          checkoutDate: "2026-10-25",
          serproPrecheckinUrl: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resai999",
          status: "confirmed"
        }
      ],
      flats: [{ number: 301, status: "clean" }],
      cleaningRequests: []
    };

    it("4.1 buildGuestContext exposes checkinUrl pointing to Gov.br when active", () => {
      const ctx = aiService.buildGuestContext(mockDbGov, "5521999998888");
      assert.ok(ctx.hasReservation);
      assert.strictEqual(ctx.checkinUrl, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resai999");
      assert.strictEqual(ctx.reservation.checkinUrl, "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resai999");
    });

    it("4.2 generateHeuristicResponse returns checkin URL when guest asks about checkin", () => {
      const ctx = aiService.buildGuestContext(mockDbGov, "5521999998888");
      const reply = aiService.generateHeuristicResponse("Como faço meu check-in online?", ctx);
      assert.ok(reply.includes("https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-resai999"));
    });
  });

});
