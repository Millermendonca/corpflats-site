import assert from "node:assert/strict";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  getSameDayFlatReleaseState,
  resolveWhatsAppTags,
  triggerImmediateWhatsApp,
  checkAndScheduleReadyFlatsOnCheckinDay,
  triggerRoomReadyWhatsApp
} from "../artifacts/api-server/zapi-service.mjs";

// Stub global fetch so zero external HTTP requests are made during testing
const sentPayloads = [];
global.fetch = async (url, options = {}) => {
  const bodyStr = options.body ? String(options.body) : "{}";
  let parsed = {};
  try { parsed = JSON.parse(bodyStr); } catch {}
  sentPayloads.push({ url: String(url), body: parsed });
  return {
    ok: true,
    status: 200,
    json: async () => ({ zaapId: `mock_${Date.now()}`, messageId: `msg_${Date.now()}` }),
    text: async () => JSON.stringify({ zaapId: `mock_${Date.now()}` })
  };
};

function createTestDb(todayStr) {
  const db = {
    settings: {
      hotelName: "CorpFlats Promenade Soho",
      address: "Rua dos Goytacazes, 340, Centro, Belo Horizonte - MG",
      checkinTime: "14:00",
      checkoutTime: "12:00",
      emailSettings: { enabled: false }
    },
    zapiConfig: {
      enabled: true,
      instanceId: "test_instance",
      token: "test_token",
      clientToken: "test_client_token",
      testModeOnly: false
    },
    flats: [
      { id: 512, number: "512", wifiNetwork: "Soho_512", wifiPassword: "senha512" }
    ],
    reservations: [],
    cleaningRequests: [],
    whatsappTemplates: structuredClone(DEFAULT_WHATSAPP_TEMPLATES),
    whatsappHistory: [],
    whatsappQueue: [],
    auditLogs: []
  };
  return db;
}

async function runTests() {
  // Data/hora de referência: 14:30 BRT (17:30 UTC)
  const now1430 = new Date("2026-10-26T17:30:00.000Z");
  const todayStr = "2026-10-26";
  const tomorrowStr = "2026-10-27";

  // ── CENÁRIO 1: Valtencir reserva HOJE às 14:30 e o Flat 512 JÁ ESTÁ LIMPO ──
  {
    sentPayloads.length = 0;
    const db = createTestDb(todayStr);
    const resValtencir = {
      id: 9001,
      code: "RES-VALTENCIR-512",
      guestName: "Valtencir Oliveira",
      guestPhone: "5531999991111",
      flatId: 512,
      flatNumber: "512",
      channel: "whatsapp",
      status: "confirmada",
      paymentStatus: "pago",
      totalAmount: 350,
      paidAmount: 350,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      createdAt: now1430.toISOString(),
      _nowOverride: now1430,
      _fastIntroDelay: true
    };
    db.reservations.push(resValtencir);

    const stateClean = getSameDayFlatReleaseState(db, resValtencir, now1430);
    assert.equal(stateClean.isSameDay, true);
    assert.equal(stateClean.isFlatClean, true);
    assert.equal(stateClean.releaseTimeStr, "10:00");
    assert.equal(stateClean.isAtOrAfterRelease, true);
    assert.equal(stateClean.isFlatReadyNow, true, "Flat 512 limpo às 14:30 (canal direto >= 10:00) deve estar liberado imediatamente");

    // Mesmo se chamado com 'reservation_created', após 07:01 converte para 'sameday_reservation'
    await triggerImmediateWhatsApp(db, () => {}, "reservation_created", resValtencir, "https://corpflats.com.br");

    const sentEvents = db.whatsappHistory.map(h => h.triggerEvent);
    assert.deepEqual(
      sentEvents,
      ["corpflats_intro", "sameday_reservation"],
      "Deve enviar apenas a apresentação + 1 mensagem consolidada (sameday_reservation)"
    );

    const samedayHistory = db.whatsappHistory.find(h => h.triggerEvent === "sameday_reservation");
    assert.ok(samedayHistory, "Histórico deve registrar sameday_reservation");
    assert.match(
      samedayHistory.message,
      /Status do Flat 512:\* \*Limpo e Liberado para Entrada Imediata!/,
      "Mensagem consolidada deve informar que o Flat 512 já está limpo e liberado para entrada imediata"
    );
    assert.match(samedayHistory.message, /apto 512/, "Deve conter a rede Wi-Fi");
    assert.equal(
      resValtencir.roomReadySentDate,
      todayStr,
      "Deve marcar roomReadySentDate = todayStr quando o flat já está limpo e liberado no ato da reserva"
    );

    // Agora roda a rotina de verificação de quartos prontos (checkAndScheduleReadyFlatsOnCheckinDay) e triggerRoomReadyWhatsApp
    const historyCountBefore = db.whatsappHistory.length;
    await checkAndScheduleReadyFlatsOnCheckinDay(db, () => {}, "https://corpflats.com.br", now1430);
    await triggerRoomReadyWhatsApp(db, () => {}, 512, "512", "https://corpflats.com.br", now1430);
    assert.equal(
      db.whatsappHistory.length,
      historyCountBefore,
      "NÃO deve disparar 2ª mensagem redundante de Quarto Pronto quando sameday_reservation já liberou o flat"
    );
  }

  // ── CENÁRIO 2: Reserva HOJE às 14:30, mas o Flat 512 AINDA ESTÁ EM LIMPEZA ──
  {
    sentPayloads.length = 0;
    const db = createTestDb(todayStr);
    db.cleaningRequests.push({
      id: 1,
      flatId: 512,
      flatNumber: "512",
      requestDate: todayStr,
      status: "cleaning_now",
      createdAt: now1430.toISOString()
    });

    const resInCleaning = {
      id: 9002,
      code: "RES-PREPARO-512",
      guestName: "Carlos Mendes",
      guestPhone: "5531999992222",
      flatId: 512,
      flatNumber: "512",
      channel: "site",
      status: "confirmada",
      paymentStatus: "pago",
      totalAmount: 350,
      paidAmount: 350,
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      createdAt: now1430.toISOString(),
      _nowOverride: now1430,
      _fastIntroDelay: true
    };
    db.reservations.push(resInCleaning);

    const stateDirty = getSameDayFlatReleaseState(db, resInCleaning, now1430);
    assert.equal(stateDirty.isFlatClean, false, "Flat em limpeza deve retornar isFlatClean = false");
    assert.equal(stateDirty.isFlatReadyNow, false, "Flat em limpeza não deve estar pronto para entrada imediata");

    await triggerImmediateWhatsApp(db, () => {}, "sameday_reservation", resInCleaning, "https://corpflats.com.br");

    const samedayHistory = db.whatsappHistory.find(h => h.triggerEvent === "sameday_reservation");
    assert.ok(samedayHistory, "Deve ter enviado sameday_reservation");
    assert.match(
      samedayHistory.message,
      /Status do Flat 512:\* \*Em Preparação pela Governança\*/,
      "Mensagem deve informar que o flat está em preparação e que o hóspede será notificado assim que ficar pronto"
    );
    assert.equal(
      resInCleaning.roomReadySentDate,
      undefined,
      "roomReadySentDate deve continuar indefinido enquanto o flat está em preparação"
    );

    // Quando a camareira conclui a limpeza do Flat 512, aí SIM dispara a 2ª mensagem separada de Quarto Pronto!
    db.cleaningRequests[0].status = "clean";
    db.cleaningRequests[0].completedAt = now1430.toISOString();

    await triggerRoomReadyWhatsApp(db, () => {}, 512, "512", "https://corpflats.com.br", now1430);

    const roomReadyHistory = db.whatsappHistory.find(
      h => h.triggerEvent === "room_ready_regular" || h.triggerEvent === "room_ready"
    );
    assert.ok(
      roomReadyHistory,
      "Após a conclusão da limpeza, deve enviar a 2ª mensagem separada informando que o flat ficou pronto"
    );
    assert.equal(resInCleaning.roomReadySentDate, todayStr);
  }

  // ── CENÁRIO 3: Respeito aos horários de liberação por canal (10:00 Direta vs 12:00 OTA/B2B) ──
  {
    const now1100 = new Date("2026-10-26T14:00:00.000Z"); // 11:00 BRT
    const db = createTestDb(todayStr);

    const resDirect1100 = {
      id: 9003,
      code: "RES-DIR-1100",
      guestName: "Ana Direta",
      guestPhone: "5531999993333",
      flatId: 512,
      flatNumber: "512",
      channel: "site",
      status: "confirmada",
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      _nowOverride: now1100
    };
    const stateDirect1100 = getSameDayFlatReleaseState(db, resDirect1100, now1100);
    assert.equal(stateDirect1100.releaseTimeStr, "10:00");
    assert.equal(stateDirect1100.isFlatReadyNow, true, "Às 11:00 BRT, reserva direta (>= 10:00) com flat limpo já está liberada");

    const resBooking1100 = {
      id: 9004,
      code: "RES-OTA-1100",
      guestName: "Bruno Booking",
      guestPhone: "5531999994444",
      flatId: 512,
      flatNumber: "512",
      channel: "booking",
      status: "confirmada",
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      _nowOverride: now1100
    };
    const stateBooking1100 = getSameDayFlatReleaseState(db, resBooking1100, now1100);
    assert.equal(stateBooking1100.releaseTimeStr, "12:00");
    assert.equal(stateBooking1100.isFlatReadyNow, false, "Às 11:00 BRT, reserva Booking (< 12:00) ainda aguarda o horário de liberação das 12:00");

    const renderedBooking1100 = resolveWhatsAppTags(
      "{{status_liberacao_flat_hoje}}",
      resBooking1100,
      db
    );
    assert.match(
      renderedBooking1100,
      /Liberação programada a partir das 12:00/,
      "Antes do horário de liberação do canal, deve informar o horário programado de liberação"
    );
  }

  console.log("✅ Todos os testes de mensagem única consolidada de reserva para hoje (sameday_reservation) passaram!");
}

runTests().catch(err => {
  console.error("❌ Falha no teste:", err);
  process.exit(1);
});
