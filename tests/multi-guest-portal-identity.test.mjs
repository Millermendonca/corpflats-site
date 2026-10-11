import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveWhatsAppTags, renderTemplateButtons } from "../scripts/zapi-service.mjs";

test("Multi-Guest Portal Link & Identity Parity Suite", async (t) => {
  await t.test("1. File parity between scripts and api-server", () => {
    const scriptZapi = fs.readFileSync("scripts/zapi-service.mjs", "utf8");
    const apiServerZapi = fs.readFileSync("artifacts/api-server/zapi-service.mjs", "utf8");
    assert.strictEqual(scriptZapi, apiServerZapi, "scripts/zapi-service.mjs and artifacts/api-server/zapi-service.mjs must be identical");
  });

  const dummyReservation = {
    id: 999,
    code: "RES-605-0398",
    flatNumber: "605",
    guestName: "Miller Mendonça Pessanha",
    guestPhone: "22998505276",
    status: "confirmada",
    checkinDate: "2026-10-11",
    checkoutDate: "2026-10-12",
    guestCount: 2,
    guests: [
      { index: 1, name: "Miller Mendonça Pessanha", phone: "22998505276", hasCompletedCheckin: true },
      { index: 2, name: "Thamiris Maiara Santos da Silva", phone: "22999998888", hasCompletedCheckin: true }
    ]
  };

  await t.test("2. WhatsApp tags for companion (guest 2) resolve link_portal_hospede with ?guest=2", () => {
    const companionRecipient = {
      type: "companion",
      guestIndex: 2,
      name: "Thamiris Maiara Santos da Silva",
      phone: "22999998888"
    };

    const text = "Acesse seu portal: {{link_portal_hospede}}";
    const resolved = resolveWhatsAppTags(text, dummyReservation, {}, "https://corpflats.onrender.com", companionRecipient);
    assert.match(resolved, /minha-reserva\/RES-605-0398\?guest=2/, "Portal link for companion must contain ?guest=2");
  });

  await t.test("3. WhatsApp dynamic buttons for companion contain ?guest=2 in btn_portal", () => {
    const companionRecipient = {
      type: "companion",
      index: 2,
      guestIndex: 2,
      name: "Thamiris Maiara Santos da Silva",
      phone: "22999998888"
    };

    const template = {
      id: "tpl_checkin_day_instructions",
      buttons: [
        { id: "btn_portal", type: "URL", label: "🏨 Portal da Reserva", url: "{{link_portal_hospede}}" }
      ]
    };

    const buttons = renderTemplateButtons(template, dummyReservation, {}, "https://corpflats.onrender.com", companionRecipient);
    const portalBtn = buttons.find(b => b.id === "btn_portal");
    assert.ok(portalBtn, "Button btn_portal must exist");
    assert.match(portalBtn.url, /minha-reserva\/RES-605-0398\?guest=2/, "btn_portal URL for companion must contain ?guest=2");

    const resInHouse = { ...dummyReservation, status: "in_house" };
    const autoButtons = renderTemplateButtons([], resInHouse, {}, "https://corpflats.onrender.com", companionRecipient);
    const autoPortalBtn = autoButtons.find(b => b.id === "btn_portal");
    assert.ok(autoPortalBtn, "Button btn_portal must be auto-injected for in_house");
    assert.match(autoPortalBtn.url, /minha-reserva\/RES-605-0398\?guest=2/, "Auto-injected btn_portal URL must contain ?guest=2");
  });

  await t.test("4. WhatsApp tags for titular (guest 1) resolve standard clean portal URL", () => {
    const titularRecipient = {
      type: "guest",
      guestIndex: 1,
      name: "Miller Mendonça Pessanha",
      phone: "22998505276"
    };

    const text = "Acesse seu portal: {{link_portal_hospede}}";
    const resolved = resolveWhatsAppTags(text, dummyReservation, {}, "https://corpflats.onrender.com", titularRecipient);
    assert.strictEqual(resolved, "Acesse seu portal: https://corpflats.onrender.com/minha-reserva/RES-605-0398");
  });

  await t.test("5. Pre-checkin done without self-checkin DOES NOT mark flat entrance (hasEnteredFlat = false)", () => {
    const companionRecipient = {
      type: "companion",
      index: 2,
      guestIndex: 2,
      name: "Thamiris Maiara Santos da Silva",
      phone: "22999998888"
    };

    // Reservation with FNRH signed and checkedInAt, but NO guestSelfCheckin and status confirmada
    const resPreCheckinOnly = {
      ...dummyReservation,
      status: "confirmada",
      checkedInAt: "2026-10-11T12:00:00.000Z",
      guestSelfCheckin: false
    };

    const buttons = renderTemplateButtons([], resPreCheckinOnly, {}, "https://corpflats.onrender.com", companionRecipient);
    // When pre-checkin is done but flat entrance is NOT done, btn_cheguei must be present
    const chegueiBtn = buttons.find(b => b.id === "btn_cheguei");
    assert.ok(chegueiBtn, "btn_cheguei ('Já Cheguei no Flat') must be present when pre-checkin is done before entering");
    
    // btn_portal should NOT be auto-injected as the sole entry button
    const portalBtn = buttons.find(b => b.id === "btn_portal");
    assert.strictEqual(portalBtn, undefined, "btn_portal should not replace arrival flow when guest has not entered flat yet");
  });

  await t.test("6. Companion pre-checkin done does not falsely mark titular pre-checkin as done", () => {
    const partialReservation = {
      ...dummyReservation,
      fnhrCompleted: false,
      preCheckinCompleted: true, // aggregate flag set by companion
      guests: [
        { index: 1, name: "Miller Mendonça Pessanha", phone: "22998505276", hasCompletedCheckin: false },
        { index: 2, name: "Thamiris Maiara Santos da Silva", phone: "22999998888", hasCompletedCheckin: true, status: "CHECKED_IN" }
      ]
    };

    const companionRecipient = { type: "companion", index: 2, guestIndex: 2, name: "Thamiris", phone: "22999998888" };
    const titularRecipient = { type: "guest", index: 1, guestIndex: 1, name: "Miller", phone: "22998505276" };

    const companionButtons = renderTemplateButtons([], partialReservation, {}, "https://corpflats.onrender.com", companionRecipient);
    const titularButtons = renderTemplateButtons([], partialReservation, {}, "https://corpflats.onrender.com", titularRecipient);

    // Companion has completed -> gets btn_cheguei
    assert.ok(companionButtons.some(b => b.id === "btn_cheguei"), "Companion should get btn_cheguei");

    // Titular has NOT completed -> must NOT get btn_cheguei
    assert.ok(!titularButtons.some(b => b.id === "btn_cheguei"), "Titular should NOT get btn_cheguei before completing pre-checkin");
  });
});
