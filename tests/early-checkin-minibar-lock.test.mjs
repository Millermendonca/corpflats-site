import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isFlatMinibarInspectedTodayOnCheckinDay,
  evaluateFlatCheckinReadiness,
  getSameDayFlatReleaseState,
  evaluateSelfCheckinEligibility,
  triggerRoomReadyWhatsApp,
  checkAndScheduleReadyFlatsOnCheckinDay,
  resolveWhatsAppTags,
  DEFAULT_WHATSAPP_TEMPLATES
} from "../artifacts/api-server/zapi-service.mjs";
import { solicitarEarlyCheckinTool } from "../artifacts/api-server/agent-architecture.mjs";

const TODAY = "2026-11-19";

function makeBaseDb(overrides = {}) {
  return {
    settings: { checkinTime: "14:00", checkoutTime: "12:00", baseUrl: "https://corpflats.com.br" },
    zapiConfig: { enabled: true, testModeOnly: false },
    flats: [
      { id: 10, number: "502", status: "clean" },
      { id: 11, number: "603", status: "clean" }
    ],
    reservations: [],
    cleaningRequests: [],
    minibarInspections: [],
    whatsappTemplates: [],
    whatsappHistory: [],
    whatsappQueue: [],
    whatsappConversations: [],
    auditLogs: [],
    ...overrides
  };
}

test("Trava da Conferência de Frigobar para Check-in Antecipado (< 14:00)", async (t) => {
  await t.test("1. Paridade Twin-Server dos arquivos modificados", () => {
    const files = [
      "zapi-service.mjs",
      "demo-server.mjs",
      "whatsapp-ai-service.mjs",
      "agent-architecture.mjs",
      "package-reservations-service.mjs"
    ];
    for (const f of files) {
      const a = fs.readFileSync(`artifacts/api-server/${f}`, "utf8");
      const b = fs.readFileSync(`scripts/${f}`, "utf8");
      assert.strictEqual(a, b, `${f} deve estar 100% em paridade twin`);
    }
  });

  await t.test("2. Flat já vago e limpo desde ontem (sem check-out hoje) exige conferência de frigobar HOJE antes das 14:00", async () => {
    const resDirect = {
      id: 101,
      code: "RES-502-0101",
      flatId: 10,
      flatNumber: "502",
      guestName: "Carlos Direto",
      guestPhone: "5522999990101",
      checkinDate: TODAY,
      checkoutDate: "2026-11-21",
      status: "confirmada",
      channel: "site",
      fnhrCompleted: true,
      preCheckinCompleted: true
    };
    const db = makeBaseDb({
      reservations: [resDirect],
      // Apenas conferência de ONTEM + marcação NQ de hoje + ajuste técnico de cortesia (nenhum deve liberar!)
      minibarInspections: [
        {
          id: "INSP-YESTERDAY",
          flatNumber: "502",
          launchDate: "2026-11-18",
          inspectedAt: "2026-11-18T14:00:00.000Z",
          status: "conforme",
          isSkipMark: false
        },
        {
          id: "INSP-NQ-TODAY",
          flatNumber: "502",
          launchDate: TODAY,
          inspectedAt: `${TODAY}T12:10:00.000Z`,
          status: "nq",
          isSkipMark: true
        },
        {
          id: "INSP-COURTESY-ONLY",
          flatNumber: "502",
          launchDate: TODAY,
          inspectedAt: `${TODAY}T12:15:00.000Z`,
          status: "conforme",
          isCourtesyCorrectionOnly: true
        }
      ]
    });

    const now1030 = new Date(`${TODAY}T13:30:00.000Z`); // 10:30 BRT
    assert.strictEqual(isFlatMinibarInspectedTodayOnCheckinDay(db, resDirect, TODAY), false);

    const readiness1030 = evaluateFlatCheckinReadiness(db, resDirect, now1030);
    assert.strictEqual(readiness1030.isFlatClean, true);
    assert.strictEqual(readiness1030.isMinibarInspected, false);
    assert.strictEqual(readiness1030.isMinibarPendingForEarlyCheckin, true);
    assert.strictEqual(readiness1030.isFlatReady, false);
    assert.strictEqual(readiness1030.readinessBlockReason, "minibar_not_inspected");

    const selfElig = evaluateSelfCheckinEligibility(db, resDirect, now1030);
    assert.strictEqual(selfElig.allowed, false);
    assert.strictEqual(selfElig.reason, "minibar_not_inspected");

    await checkAndScheduleReadyFlatsOnCheckinDay(db, () => {}, "https://corpflats.com.br", now1030);
    assert.strictEqual(db.whatsappHistory.length, 0, "NÃO deve disparar room_ready às 10:30 sem conferência de frigobar hoje");
    assert.strictEqual(db.whatsappQueue.length, 0, "NÃO deve agendar room_ready sem conferência de frigobar hoje");

    // Agora a repositora faz conferência preventiva real HOJE às 10:45 BRT
    db.minibarInspections.push({
      id: "INSP-PREVENTIVE-TODAY",
      flatNumber: "502",
      launchDate: TODAY,
      inspectedAt: `${TODAY}T13:45:00.000Z`,
      unoccupiedLaunchMode: "internal_adjustment",
      noActiveGuestInFlat: true,
      isSkipMark: false,
      status: "conforme"
    });

    const now1045 = new Date(`${TODAY}T13:45:00.000Z`); // 10:45 BRT
    assert.strictEqual(isFlatMinibarInspectedTodayOnCheckinDay(db, resDirect, TODAY), true);
    assert.strictEqual(evaluateFlatCheckinReadiness(db, resDirect, now1045).isFlatReady, true);
    assert.strictEqual(evaluateSelfCheckinEligibility(db, resDirect, now1045).allowed, true);

    await triggerRoomReadyWhatsApp(db, () => {}, 10, "502", "https://corpflats.com.br", now1045);
    assert.strictEqual(resDirect.roomReadySentDate, TODAY);
    assert.ok(db.whatsappHistory.some(h => h.reservationCode === "RES-502-0101" && h.triggerEvent === "room_ready"));
  });

  await t.test("3. A partir das 14:00 (horário oficial), trava do frigobar é dispensada e flat limpo libera normalmente", async () => {
    const resDirect = {
      id: 102,
      code: "RES-502-0102",
      flatId: 10,
      flatNumber: "502",
      guestName: "Maria Regular",
      guestPhone: "5522999990102",
      checkinDate: TODAY,
      checkoutDate: "2026-11-21",
      status: "confirmada",
      channel: "whatsapp"
    };
    const db = makeBaseDb({ reservations: [resDirect] });

    // 13:59 BRT -> ainda bloqueado por falta de conferência de frigobar
    const now1359 = new Date(`${TODAY}T16:59:00.000Z`);
    assert.strictEqual(evaluateFlatCheckinReadiness(db, resDirect, now1359).isFlatReady, false);
    assert.strictEqual(evaluateSelfCheckinEligibility(db, resDirect, now1359).reason, "minibar_not_inspected");

    // 14:00 BRT -> libera sem conferência de frigobar pois a limpeza já está ok!
    const now1400 = new Date(`${TODAY}T17:00:00.000Z`);
    const r1400 = evaluateFlatCheckinReadiness(db, resDirect, now1400);
    assert.strictEqual(r1400.isAtOrAfterStandardCheckin, true);
    assert.strictEqual(r1400.isMinibarPendingForEarlyCheckin, false);
    assert.strictEqual(r1400.isFlatReady, true);
    assert.strictEqual(evaluateSelfCheckinEligibility(db, resDirect, now1400).allowed, true);

    await checkAndScheduleReadyFlatsOnCheckinDay(db, () => {}, "https://corpflats.com.br", now1400);
    assert.strictEqual(resDirect.roomReadySentDate, TODAY);
    assert.ok(
      db.whatsappHistory.some(h => h.reservationCode === "RES-502-0102" && h.triggerEvent === "room_ready_regular"),
      "Às 14:00 deve disparar room_ready_regular mesmo sem conferência de frigobar"
    );
  });

  await t.test("4. Dobradinha (check-out hoje + check-in OTA hoje): lançamento diário pré-saída NÃO conta; pós-checkout + limpeza antes das 12:00 agenda para 12:00", async () => {
    const departing = {
      id: 201,
      code: "RES-603-0201",
      flatId: 11,
      flatNumber: "603",
      guestName: "Hóspede Saindo",
      checkinDate: "2026-11-17",
      checkoutDate: TODAY,
      status: "in_house",
      channel: "booking"
    };
    const arrivingOta = {
      id: 202,
      code: "RES-603-0202",
      flatId: 11,
      flatNumber: "603",
      guestName: "João Booking",
      guestPhone: "5522999990202",
      checkinDate: TODAY,
      checkoutDate: "2026-11-22",
      status: "confirmada",
      channel: "booking"
    };
    const db = makeBaseDb({
      reservations: [departing, arrivingOta],
      cleaningRequests: [
        { id: 3001, flatId: 11, flatNumber: "603", requestDate: TODAY, status: "dirty", source: "checkout" }
      ],
      minibarInspections: [
        // Passagem diária às 08:30 BRT enquanto hóspede ainda estava no flat -> NÃO pode contar!
        {
          id: "INSP-DAILY-PRE-OUT",
          flatNumber: "603",
          reservationId: 201,
          reservationCode: "RES-603-0201",
          launchDate: TODAY,
          inspectedAt: `${TODAY}T11:30:00.000Z`,
          isDailyLaunch: true,
          isFinalCheckoutInspection: false,
          status: "conforme"
        }
      ]
    });

    // 10:30 BRT: Hóspede anterior faz check-out e camareira limpa, MAS repositora ainda não fez conferência final
    departing.status = "completed";
    departing.checkoutDone = true;
    departing.actualCheckoutAt = `${TODAY}T13:00:00.000Z`;
    db.cleaningRequests[0].status = "clean";
    db.cleaningRequests[0].completedAt = `${TODAY}T13:30:00.000Z`;

    const now1030 = new Date(`${TODAY}T13:30:00.000Z`); // 10:30 BRT
    assert.strictEqual(isFlatMinibarInspectedTodayOnCheckinDay(db, arrivingOta, TODAY), false, "Lançamento diário pré-checkout NÃO conta como conferência final");
    await triggerRoomReadyWhatsApp(db, () => {}, 11, "603", "https://corpflats.com.br", now1030);
    assert.strictEqual(db.whatsappQueue.length, 0, "Sem conferência pós-checkout, NÃO deve agendar room_ready_ota para as 12:00");

    // 11:00 BRT: Repositora conclui conferência final pós-checkout -> agenda room_ready_ota para 12:00 BRT!
    departing.finalMinibarInspectionAt = `${TODAY}T14:00:00.000Z`;
    db.minibarInspections.push({
      id: "INSP-FINAL-OUT",
      flatNumber: "603",
      reservationId: 201,
      reservationCode: "RES-603-0201",
      launchDate: TODAY,
      inspectedAt: `${TODAY}T14:00:00.000Z`,
      isDailyLaunch: false,
      isFinalCheckoutInspection: true,
      status: "conforme"
    });

    const now1100 = new Date(`${TODAY}T14:00:00.000Z`); // 11:00 BRT
    assert.strictEqual(isFlatMinibarInspectedTodayOnCheckinDay(db, arrivingOta, TODAY), true);
    await triggerRoomReadyWhatsApp(db, () => {}, 11, "603", "https://corpflats.com.br", now1100);
    assert.strictEqual(db.whatsappQueue.length, 1, "OTA pronto às 11:00 deve agendar na fila para 12:00");
    assert.strictEqual(db.whatsappQueue[0].triggerEvent, "room_ready_ota");
    assert.strictEqual(db.whatsappQueue[0].scheduledFor, new Date(`${TODAY}T12:00:00-03:00`).toISOString());
  });

  await t.test("5. Ordem inversa: frigobar conferido ANTES da limpeza só libera quando a camareira concluir a limpeza", async () => {
    const resDirect = {
      id: 301,
      code: "RES-502-0301",
      flatId: 10,
      flatNumber: "502",
      guestName: "Ana Ordem Inversa",
      guestPhone: "5522999990301",
      checkinDate: TODAY,
      checkoutDate: "2026-11-21",
      status: "confirmada",
      channel: "whatsapp"
    };
    const db = makeBaseDb({
      reservations: [resDirect],
      cleaningRequests: [
        { id: 4001, flatId: 10, flatNumber: "502", requestDate: TODAY, status: "cleaning_now", source: "checkout" }
      ],
      minibarInspections: [
        {
          id: "INSP-EARLY-MB",
          flatNumber: "502",
          launchDate: TODAY,
          inspectedAt: `${TODAY}T13:15:00.000Z`,
          unoccupiedLaunchMode: "internal_adjustment",
          isSkipMark: false,
          status: "conforme"
        }
      ]
    });

    const now1015 = new Date(`${TODAY}T13:15:00.000Z`); // 10:15 BRT
    const r1 = evaluateFlatCheckinReadiness(db, resDirect, now1015);
    assert.strictEqual(r1.isMinibarInspected, true);
    assert.strictEqual(r1.isFlatClean, false);
    assert.strictEqual(r1.isFlatReady, false);

    await triggerRoomReadyWhatsApp(db, () => {}, 10, "502", "https://corpflats.com.br", now1015);
    assert.strictEqual(db.whatsappHistory.length, 0, "Frigobar pronto com quarto sujo NÃO libera");

    // 10:50 BRT: Camareira termina a limpeza -> agora ambos concluídos -> dispara room_ready na hora!
    db.cleaningRequests[0].status = "clean";
    db.cleaningRequests[0].completedAt = `${TODAY}T13:50:00.000Z`;
    const now1050 = new Date(`${TODAY}T13:50:00.000Z`);
    await triggerRoomReadyWhatsApp(db, () => {}, 10, "502", "https://corpflats.com.br", now1050);
    assert.strictEqual(resDirect.roomReadySentDate, TODAY);
    assert.ok(db.whatsappHistory.some(h => h.reservationCode === "RES-502-0301" && h.triggerEvent === "room_ready"));
  });

  await t.test("6. Reserva same-day + Tool Sofia solicitar_early_checkin respeitam a trava de frigobar", async () => {
    const resSameDay = {
      id: 401,
      code: "RES-502-0401",
      flatId: 10,
      flatNumber: "502",
      guestName: "Pedro Sameday",
      guestPhone: "5522999990401",
      checkinDate: TODAY,
      checkoutDate: "2026-11-20",
      status: "confirmada",
      channel: "whatsapp",
      dailyRate: 250
    };
    const db = makeBaseDb({ reservations: [resSameDay] });
    const now1100 = new Date(`${TODAY}T14:00:00.000Z`); // 11:00 BRT

    const sameDayState = getSameDayFlatReleaseState(db, resSameDay, now1100);
    assert.strictEqual(sameDayState.isFlatClean, true);
    assert.strictEqual(sameDayState.isMinibarInspected, false);
    assert.strictEqual(sameDayState.isMinibarPendingForEarlyCheckin, true);
    assert.strictEqual(sameDayState.isFlatReadyNow, false);

    const tplSameday = DEFAULT_WHATSAPP_TEMPLATES.find(tp => tp.id === "tpl_sameday_reservation_instructions");
    const rendered = resolveWhatsAppTags(
      tplSameday.message,
      { ...resSameDay, _nowOverride: now1100 },
      db,
      "https://corpflats.com.br",
      "guest",
      tplSameday
    );
    assert.match(rendered, /frigobar/i, "Mensagem same-day com limpeza feita e frigobar pendente deve informar conferência de frigobar");

    // Tool da IA Sofia (solicitar_early_checkin) bloqueia antes das 14:00 sem conferência de frigobar
    const toolContext = {
      telefone_remetente: "5522999990401",
      estado_atual: "PRE_CHECKIN",
      reserva_ativa: {
        id: "RES-502-0401",
        imovel_id: "10",
        nome_imovel: "Flat 502",
        data_checkin: TODAY,
        data_checkout: "2026-11-20",
        canal_reserva: "whatsapp",
        valor_diaria: 250
      },
      runtime: { db, now: now1100 }
    };

    const blockedRes = await solicitarEarlyCheckinTool.execute({ horario_solicitado: "11:00" }, toolContext);
    assert.strictEqual(blockedRes.status, "BLOQUEADO_PELA_REGRA");
    assert.strictEqual(blockedRes.codigo_regra_bloqueio, "AGUARDANDO_CONFERENCIA_FRIGOBAR");
    assert.match(blockedRes.instrucao_para_ia, /frigobar/i);

    // Após conferência de frigobar hoje, tool libera cortesia normalmente!
    db.minibarInspections.push({
      id: "INSP-SOFIA-OK",
      flatNumber: "502",
      launchDate: TODAY,
      inspectedAt: `${TODAY}T14:05:00.000Z`,
      status: "conforme",
      isSkipMark: false
    });
    const allowedRes = await solicitarEarlyCheckinTool.execute({ horario_solicitado: "11:10" }, toolContext);
    assert.strictEqual(allowedRes.status, "SUCESSO_EXECUTADO");
    assert.strictEqual(allowedRes.dados.cortesia, true);
  });
});
