import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateSelfCheckinEligibility,
  renderTemplateButtons,
  resolveWhatsAppTags,
  triggerRoomReadyWhatsApp,
  hasReservationEnteredOrCompletedCheckin,
  DEFAULT_WHATSAPP_TEMPLATES
} from "../artifacts/api-server/zapi-service.mjs";

test("Blindagem de Auto-Check-in Prematuro & Disparo de Quarto Pronto (Flat 904)", async (t) => {
  await t.test("1. Paridade entre artifacts/api-server/zapi-service.mjs e scripts/zapi-service.mjs", () => {
    const a = fs.readFileSync("artifacts/api-server/zapi-service.mjs", "utf8");
    const b = fs.readFileSync("scripts/zapi-service.mjs", "utf8");
    assert.strictEqual(a, b, "zapi-service.mjs deve estar 100% em paridade twin");
  });

  await t.test("2. Às 07:00 e às 12:31 com flat sujo/ocupado: bloqueia btn_cheguei, lembra check-in às 14:00 (cortesia mediante disponibilidade) e preserva room_ready às 13:34", async () => {
    const todayStr = "2026-11-17";
    const db = {
      settings: { checkinTime: "14:00", checkoutTime: "12:00" },
      zapiConfig: {
        enabled: true,
        testModeOnly: false
      },
      flats: [{ id: 16, number: "904" }],
      reservations: [
        {
          id: 914,
          code: "RES-904-0914",
          flatId: 16,
          flatNumber: "904",
          guestName: "Fernanda Duarte",
          checkinDate: "2026-11-15",
          checkoutDate: todayStr,
          status: "confirmada",
          channel: "booking"
        },
        {
          id: 936,
          code: "RES-904-0936",
          flatId: 16,
          flatNumber: "904",
          guestName: "Diogo Rebel",
          guestPhone: "(22) 99276-0364",
          checkinDate: todayStr,
          checkoutDate: "2026-11-19",
          status: "confirmada",
          channel: "whatsapp",
          fnhrCompleted: true,
          preCheckinCompleted: true,
          guests: [
            {
              index: 1,
              name: "Diogo Rebel",
              phone: "(22) 99276-0364",
              hasCompletedCheckin: true,
              status: "CHECKED_IN"
            }
          ]
        }
      ],
      cleaningRequests: [
        {
          id: 1912,
          flatId: 16,
          flatNumber: "904",
          requestDate: todayStr,
          effectiveDate: todayStr,
          status: "dirty",
          source: "checkout"
        }
      ],
      whatsappTemplates: [],
      whatsappHistory: [],
      whatsappQueue: [],
      whatsappConversations: []
    };

    const resDiogo = db.reservations[1];
    const tpl0700 = DEFAULT_WHATSAPP_TEMPLATES.find(tp => tp.id === "tpl_checkin_day_instructions");

    // Cenário A: 07:00 da manhã (antes do horário de liberação e com flat sujo)
    const now0700 = new Date("2026-11-17T10:00:55.000Z"); // 07:00:55 BRT
    const elig0700 = evaluateSelfCheckinEligibility(db, resDiogo, now0700);
    assert.strictEqual(elig0700.allowed, false);
    assert.strictEqual(elig0700.reason, "flat_not_clean");

    const rendered0700 = resolveWhatsAppTags(
      tpl0700.message,
      { ...resDiogo, _nowOverride: now0700 },
      db,
      "https://corpflats.com.br",
      "guest",
      tpl0700
    );
    const btns0700 = renderTemplateButtons(
      tpl0700.buttons,
      { ...resDiogo, _nowOverride: now0700 },
      db,
      "https://corpflats.com.br",
      "guest",
      tpl0700
    );

    assert.ok(!btns0700.some(b => b.id === "btn_cheguei"), "Mensagem das 07:00 NÃO deve incluir botão 'Já Cheguei no Flat' com flat sujo/antes do horário");
    assert.ok(btns0700.some(b => b.id === "btn_portal"), "Mensagem das 07:00 deve manter botão do Portal da Reserva");
    assert.match(rendered0700, /a partir das 14:00/i, "Mensagem deve lembrar que o check-in oficial é a partir das 14:00");
    assert.match(rendered0700, /cortesia mediante disponibilidade/i, "Mensagem deve lembrar que o check-in antecipado é cortesia mediante disponibilidade");
    assert.match(rendered0700, /não é uma regra/i, "Mensagem deve deixar claro que não é uma regra fixa");

    // Cenário B: 12:31:31 (flat ainda ocupado/sujo) -> elegibilidade permanece bloqueada
    const now1231 = new Date("2026-11-17T15:31:31.000Z"); // 12:31:31 BRT
    const elig1231 = evaluateSelfCheckinEligibility(db, resDiogo, now1231);
    assert.strictEqual(elig1231.allowed, false);
    assert.strictEqual(elig1231.reason, "flat_not_clean");
    assert.strictEqual(hasReservationEnteredOrCompletedCheckin(db, resDiogo, todayStr), false);

    // Cenário C: 13:33:59 -> Camareira Grazi conclui a limpeza do Flat 904, mas conferência de frigobar ainda pendente (< 14:00)
    db.reservations[0].status = "completed";
    db.reservations[0].checkoutDone = true;
    db.reservations[0].actualCheckoutAt = "2026-11-17T15:40:00.000Z";
    db.cleaningRequests[0].status = "clean";
    db.cleaningRequests[0].completedAt = "2026-11-17T16:33:59.000Z";

    const now1334 = new Date("2026-11-17T16:33:59.000Z"); // 13:33:59 BRT
    const elig1334NoMinibar = evaluateSelfCheckinEligibility(db, resDiogo, now1334);
    assert.strictEqual(elig1334NoMinibar.allowed, false, "Antes das 14:00, sem conferência de frigobar o auto-check-in ainda deve permanecer bloqueado");
    assert.strictEqual(elig1334NoMinibar.reason, "minibar_not_inspected");

    await triggerRoomReadyWhatsApp(db, () => {}, 16, "904", "https://corpflats.com.br", now1334);
    assert.strictEqual(resDiogo.roomReadySentDate, undefined, "Sem conferência de frigobar antes das 14:00, NÃO deve disparar room_ready");

    // Cenário D: 13:35:00 -> Repositora Anserve conclui a conferência final pós-checkout do Flat 904
    db.reservations[0].finalMinibarInspectionAt = "2026-11-17T16:35:00.000Z";
    db.minibarInspections = [
      {
        id: "INSP-MB-904-1",
        flatNumber: "904",
        reservationId: 914,
        reservationCode: "RES-904-0914",
        launchDate: todayStr,
        inspectedAt: "2026-11-17T16:35:00.000Z",
        isFinalCheckoutInspection: true,
        isSkipMark: false,
        status: "conforme"
      }
    ];

    const now1335 = new Date("2026-11-17T16:35:00.000Z"); // 13:35:00 BRT
    const elig1335 = evaluateSelfCheckinEligibility(db, resDiogo, now1335);
    assert.strictEqual(elig1335.allowed, true, "Após limpeza E conferência de frigobar concluídas às 13:35, auto-check-in passa a ser permitido");

    await triggerRoomReadyWhatsApp(db, () => {}, 16, "904", "https://corpflats.com.br", now1335);

    assert.strictEqual(resDiogo.roomReadySentDate, todayStr, "triggerRoomReadyWhatsApp deve marcar roomReadySentDate hoje");
    const sentRoomReady = db.whatsappHistory.find(h => h.reservationCode === "RES-904-0936" && h.triggerEvent === "room_ready");
    assert.ok(sentRoomReady, "Deve registrar o envio de 'room_ready' para o hóspede do 904");
    assert.ok(sentRoomReady.buttons.some(b => b.id === "btn_cheguei"), "Mensagem de 'Quarto Pronto' deve trazer o botão 'Já Cheguei no Flat'");
  });

  await t.test("3. Reserva futura (< checkinDate) bloqueia auto-check-in prematuro; estadia em andamento (> checkinDate) permite", () => {
    const db = { settings: { checkinTime: "14:00" }, cleaningRequests: [], reservations: [] };
    const resFuture = {
      id: 950,
      code: "RES-904-0950",
      flatNumber: "904",
      status: "confirmada",
      channel: "site",
      checkinDate: "2026-11-25",
      checkoutDate: "2026-11-27"
    };
    const eligFuture = evaluateSelfCheckinEligibility(db, resFuture, new Date("2026-11-17T15:00:00.000Z"));
    assert.strictEqual(eligFuture.allowed, false);
    assert.strictEqual(eligFuture.reason, "future_checkin_date");

    const eligInStay = evaluateSelfCheckinEligibility(db, resFuture, new Date("2026-11-26T12:00:00.000Z"));
    assert.strictEqual(eligInStay.allowed, true);
    assert.strictEqual(eligInStay.reason, "ok");
  });
});
