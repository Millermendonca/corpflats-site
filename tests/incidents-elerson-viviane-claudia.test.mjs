/**
 * Isolated Regression Suite: Elerson (Flat 715), Viviane (RES-509-0970 / Flat 605), Claudia (Flat 212)
 * Run ONLY via:
 *   node --test tests/incidents-elerson-viviane-claudia.test.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";

// Isolate environment BEFORE importing server modules
const tempDbFile = path.join(
  os.tmpdir(),
  `corpflats-incidents-${process.pid}-${Date.now()}.json`
);
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.PORT = "0";
process.env.DATA_FILE = tempDbFile;

// Ensure background intervals/timers opened during import do not keep the test process alive
const origSetInterval = globalThis.setInterval;
const origSetTimeout = globalThis.setTimeout;
const trackedTimers = [];
const trackedTimeouts = [];
globalThis.setInterval = (...args) => {
  const handle = origSetInterval(...args);
  if (handle && typeof handle.unref === "function") handle.unref();
  trackedTimers.push(handle);
  return handle;
};
globalThis.setTimeout = (...args) => {
  const handle = origSetTimeout(...args);
  if (handle && typeof handle.unref === "function") handle.unref();
  trackedTimeouts.push(handle);
  return handle;
};

const origFetch = globalThis.fetch;
const externalFetchLog = [];
let mockFetchHandler = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ messageId: `mock_msg_${Date.now()}` }),
  text: async () => JSON.stringify({ messageId: `mock_msg_${Date.now()}` })
});

globalThis.fetch = async (url, opts = {}) => {
  const urlStr = String(url || "");
  externalFetchLog.push({ url: urlStr, method: opts?.method || "GET", body: opts?.body || null });
  return mockFetchHandler(urlStr, opts);
};

const demoMod = await import("../artifacts/api-server/demo-server.mjs");
const zapiMod = await import("../artifacts/api-server/zapi-service.mjs");
const inboxMod = await import("../artifacts/api-server/wbp/inbox.mjs");

const {
  httpServer,
  db,
  hasReservationConflict,
  isConfirmationAlreadyDispatched,
  ensurePaymentConfirmationDispatched,
  pruneDatabase,
  reconcileFromAuditLogs,
  rollbackExpiredOrCancelledStayExtension,
  reconcilePendingModificationBeforeExpire
} = demoMod;

const {
  DEFAULT_WHATSAPP_TEMPLATES,
  markReservationConfirmationDispatched,
  isInitialConfirmationInFlightOrSent,
  hasPdfAlreadyBeenSentOrInFlight,
  triggerImmediateWhatsApp,
  triggerRoomReadyWhatsApp,
  evaluateFlatCheckinReadiness,
  isFlatMinibarInspectedTodayOnCheckinDay,
  isFlatStillBeingCleanedOnCheckinDay
} = zapiMod;

const { handleOtaModification } = inboxMod;

function httpJsonRequest(method, urlPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const addr = httpServer.address();
    if (!addr || typeof addr !== "object") {
      return reject(new Error("httpServer is not listening"));
    }
    const payload = bodyObj !== null ? JSON.stringify(bodyObj) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path: urlPath,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload)
            }
          : {}
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : raw });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function resetIsolatedDb() {
  db.flats = [
    { id: 15, number: "715", colName: "715 Solteiro", isOccupied: false },
    { id: 13, number: "605", colName: "605 Solteiro", isOccupied: false },
    { id: 5, number: "212", colName: "212 Solteiro", isOccupied: false }
  ];
  db.reservations = [];
  db.guests = [];
  db.whatsappHistory = [];
  db.whatsappConversations = [];
  db.whatsappQueue = [];
  db.reservationCommunications = [];
  db.cleaningRequests = [];
  db.minibarInspections = [];
  db.minibarOrders = [];
  db.auditLogs = [];
  db.notifications = [];
  db.roomBlocks = [];
  db.breakfastOrders = [];
  db.boletos = [];
  db.whatsappTemplates = DEFAULT_WHATSAPP_TEMPLATES.map((t) => ({ ...t, enabled: true }));
  db.zapiConfig = {
    enabled: true,
    instanceId: "TEST_ZAPI_INST",
    token: "TEST_ZAPI_TOK",
    clientToken: "TEST_CLIENT_TOK",
    testModeOnly: false
  };
  db.settings = {
    ...(db.settings || {}),
    checkinTime: "14:00",
    checkoutTime: "12:00",
    emailSettings: { enabled: false }
  };
  externalFetchLog.length = 0;
  mockFetchHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ messageId: `mock_msg_${Date.now()}` }),
    text: async () => JSON.stringify({ messageId: `mock_msg_${Date.now()}` })
  });
}

describe("Incidentes Produção: Elerson (715), Viviane (605) e Claudia (212)", () => {
  before(async () => {
    if (!httpServer.listening) {
      await new Promise((resolve) => {
        httpServer.once("listening", resolve);
      });
    }
    resetIsolatedDb();
  });

  after(async () => {
    for (const h of trackedTimers) {
      try {
        clearInterval(h);
      } catch (_) {}
    }
    for (const h of trackedTimeouts) {
      try {
        clearTimeout(h);
      } catch (_) {}
    }
    globalThis.setInterval = origSetInterval;
    globalThis.setTimeout = origSetTimeout;
    globalThis.fetch = origFetch;
    if (httpServer.listening) {
      if (typeof httpServer.closeAllConnections === "function") httpServer.closeAllConnections();
      await new Promise((resolve) => httpServer.close(resolve));
    }
    try {
      if (fs.existsSync(tempDbFile)) fs.unlinkSync(tempDbFile);
    } catch (_) {}
  });

  beforeEach(() => {
    resetIsolatedDb();
  });

  describe("Caso 1 — Elerson (Flat 715): Pagamento vs Expiração, Antecipação e Proteção de Canal", () => {
    it("confirma pendingModification paga dentro do prazo mesmo se a verificação rodar após expiresAt quando flat está livre", async () => {
      const elersonRes = {
        id: 7151,
        code: "RES-715-0901",
        flatId: 15,
        flatNumber: "715",
        guestName: "Elerson Silva",
        guestPhone: "5522999990715",
        checkinDate: "2026-11-24",
        checkoutDate: "2026-11-26",
        nights: 2,
        totalAmount: 400,
        paidAmount: 400,
        paymentStatus: "pago_total",
        channel: "whatsapp",
        dailyRates: [
          { date: "2026-11-24", rate: 200, channel: "whatsapp" },
          { date: "2026-11-25", rate: 200, channel: "whatsapp" }
        ],
        pendingModification: {
          pendingId: "MOD-ELERSON-1",
          status: "expired",
          newCheckinDate: "2026-11-23",
          newCheckoutDate: "2026-11-26",
          newNights: 3,
          newFlatId: 15,
          newFlatNumber: "715",
          additionalAmountToPay: 200,
          dailyRate: 200,
          pixTxId: "TXMOD7150001",
          expiresAt: "2026-11-23T10:30:00.000Z"
        }
      };
      db.reservations.push(elersonRes);

      const resRec = await reconcilePendingModificationBeforeExpire(elersonRes, elersonRes.pendingModification, {
        nowMs: new Date("2026-11-23T10:35:00.000Z").getTime(),
        source: "Auto-Sync Teste",
        saveFn: () => {},
        verifyFn: async () => ({
          found: true,
          amount: 200,
          paidAt: "2026-11-23T10:25:00.000Z", // Pago ANTES dos 30 min expirarem
          endToEndId: "E7150001PAIDONTIME",
          txId: "TXMOD7150001",
          paymentMethod: "pix",
          source: "Banco Inter Cobrança"
        })
      });

      assert.equal(resRec.paid, true);
      assert.equal(resRec.committed, true);
      assert.equal(resRec.paidWithinDeadline, true);
      assert.equal(elersonRes.checkinDate, "2026-11-23");
      assert.equal(elersonRes.nights, 3);
      assert.equal(elersonRes.totalAmount, 600);
      assert.equal(elersonRes.paidAmount, 600);
      assert.equal(elersonRes.paymentStatus, "pago_total");
      assert.equal(elersonRes.pendingModification, undefined);
    });

    it("marca paid_conflict_needs_admin sem gerar overbooking quando pago após ocupação do período por outro hóspede", async () => {
      const elersonRes = {
        id: 7152,
        code: "RES-715-0902",
        flatId: 15,
        flatNumber: "715",
        guestName: "Elerson Silva",
        checkinDate: "2026-11-24",
        checkoutDate: "2026-11-26",
        totalAmount: 400,
        paidAmount: 400,
        paymentStatus: "pago_total",
        pendingModification: {
          pendingId: "MOD-ELERSON-2",
          status: "pending",
          newCheckinDate: "2026-11-23",
          newCheckoutDate: "2026-11-26",
          newFlatId: 15,
          newFlatNumber: "715",
          additionalAmountToPay: 200,
          expiresAt: "2026-11-23T10:30:00.000Z"
        }
      };
      const competingRes = {
        id: 7159,
        code: "RES-715-COMP",
        flatId: 15,
        flatNumber: "715",
        guestName: "Outro Hospede",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-24",
        status: "confirmada",
        paymentStatus: "pago_total"
      };
      db.reservations.push(elersonRes, competingRes);

      const resRec = await reconcilePendingModificationBeforeExpire(elersonRes, elersonRes.pendingModification, {
        nowMs: new Date("2026-11-23T11:00:00.000Z").getTime(),
        source: "Auto-Sync Teste",
        saveFn: () => {},
        verifyFn: async () => ({
          found: true,
          amount: 200,
          paidAt: "2026-11-23T10:55:00.000Z",
          endToEndId: "E7150002LATECONFLICT",
          txId: "TXMOD7150002",
          paymentMethod: "pix",
          source: "Banco Inter Extrato"
        })
      });

      assert.equal(resRec.paid, true);
      assert.equal(resRec.committed, false);
      assert.equal(resRec.conflict, true);
      assert.equal(resRec.status, "paid_conflict_needs_admin");
      assert.equal(elersonRes.pendingModification.status, "paid_conflict_needs_admin");
      assert.equal(elersonRes.checkinDate, "2026-11-24", "Não deve gerar double-booking sobre o outro hóspede");
    });

    it("hasReservationConflict ignora hold expirado para disponibilidade sem sobrescrever pendingModification.status = 'expired'", () => {
      const rHold = {
        id: 7153,
        code: "RES-715-0903",
        flatId: 15,
        flatNumber: "715",
        checkinDate: "2026-11-25",
        checkoutDate: "2026-11-27",
        status: "confirmada",
        pendingModification: {
          pendingId: "MOD-EXPIRED-CHECK",
          status: "pending",
          newCheckinDate: "2026-11-23",
          newCheckoutDate: "2026-11-27",
          newFlatId: 15,
          newFlatNumber: "715",
          expiresAt: "2026-11-23T10:00:00.000Z"
        }
      };
      db.reservations.push(rHold);

      const conflict = hasReservationConflict({
        flatId: 15,
        flatNumber: "715",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-24",
        nowMs: new Date("2026-11-23T10:15:00.000Z").getTime()
      });

      assert.equal(conflict, false);
      assert.equal(rHold.pendingModification.status, "pending");
    });

    it("Inter Webhook liquida pendingStayExtension com antecipação (newCheckinDate) sem duplicar totalAmount", async () => {
      const rExt = {
        id: 7154,
        code: "RES-715-0904",
        flatId: 15,
        flatNumber: "715",
        guestName: "Elerson Silva",
        guestPhone: "",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-26",
        nights: 3,
        totalAmount: 600,
        paidAmount: 400,
        paymentStatus: "parcial",
        channel: "whatsapp",
        pendingStayExtension: {
          isPreReservationHold: true,
          source: "whatsapp_ai",
          txid: "TXEXT715ANT01",
          amount: 200,
          oldCheckinDate: "2026-11-24",
          oldCheckoutDate: "2026-11-26",
          newCheckinDate: "2026-11-23",
          newCheckoutDate: "2026-11-26",
          oldTotalAmount: 400,
          oldPaidAmount: 400,
          alreadyAppliedToReservation: true,
          status: "pending_payment",
          expiresAt: "2026-11-23T12:00:00.000Z"
        }
      };
      db.reservations.push(rExt);

      const resp = await httpJsonRequest("POST", "/api/pms/inter/webhook", {
        pix: [
          {
            txid: "TXEXT715ANT01",
            valor: "200.00",
            horario: "2026-11-23T10:20:00.000Z",
            endToEndId: "E2E_715_ANT_001"
          }
        ]
      });

      assert.equal(resp.status, 200);
      assert.equal(rExt.pendingStayExtension.status, "paid");
      assert.equal(rExt.paymentStatus, "pago_total");
      assert.equal(rExt.totalAmount, 600);
      assert.equal(rExt.paidAmount, 600);
      assert.equal(rExt.checkinDate, "2026-11-23");
      assert.equal(rExt.nights, 3);
    });

    it("preserva canal manual 'whatsapp' (_manualChannelProtected) em rollback, replay de auditLogs e modificação OTA", async () => {
      const resManual = {
        id: 7155,
        code: "RES-715-0905",
        flatId: 15,
        flatNumber: "715",
        guestName: "Elerson Silva",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-26",
        totalAmount: 600,
        paidAmount: 400,
        paymentStatus: "parcial",
        channel: "whatsapp",
        _manualChannelProtected: true,
        _manualChannelUpdatedAt: "2026-11-23T10:10:00.000Z",
        externalOrderId: "BK-ELERSON-715",
        dailyRates: [
          { date: "2026-11-23", rate: 200, channel: "whatsapp" },
          { date: "2026-11-24", rate: 200, channel: "whatsapp" },
          { date: "2026-11-25", rate: 200, channel: "whatsapp" }
        ],
        pendingStayExtension: {
          status: "pending_payment",
          amount: 200,
          oldCheckinDate: "2026-11-24",
          oldCheckoutDate: "2026-11-26",
          newCheckinDate: "2026-11-23",
          newCheckoutDate: "2026-11-26",
          oldTotalAmount: 400,
          oldPaidAmount: 400,
          oldChannel: "booking",
          oldDailyRates: [
            { date: "2026-11-24", rate: 200, channel: "booking" },
            { date: "2026-11-25", rate: 200, channel: "booking" }
          ]
        }
      };
      db.reservations.push(resManual);

      // 1) Rollback não pode reverter dailyRates de volta para "booking"
      rollbackExpiredOrCancelledStayExtension(db, resManual, {
        reason: "expired",
        nowOverride: "2026-11-23T11:00:00.000Z"
      });
      assert.equal(resManual.channel, "whatsapp");
      assert.ok(resManual.dailyRates.every((d) => d.channel === "whatsapp"));

      // 2) OTA Modification não pode reverter dailyRates para "booking"
      const otaRes = handleOtaModification({
        db,
        normalized: {
          externalOrderId: "BK-ELERSON-715",
          channel: "booking",
          checkinDate: "2026-11-24",
          checkoutDate: "2026-11-27",
          nights: 3,
          totalPrice: 600,
          includeBreakfast: false,
          adults: 1,
          children: 0,
          dayRates: [
            { Date: "2026-11-24", Rate: 200 },
            { Date: "2026-11-25", Rate: 200 },
            { Date: "2026-11-26", Rate: 200 }
          ]
        }
      });
      assert.equal(otaRes.success, true);
      assert.equal(resManual.channel, "whatsapp");
      assert.ok(resManual.dailyRates.every((d) => d.channel === "whatsapp"));

      // 3) Reconciliação de auditLogs normaliza label e preserva _manualChannelProtected
      const mockPg = {
        query: async () => ({
          rows: [
            {
              id: 2,
              timestamp: "2026-11-23T10:15:00.000Z",
              action: "RESERVATION_UPDATED",
              details: {
                reservationId: 7155,
                reservationCode: "RES-715-0905",
                channel: "booking",
                changes: []
              }
            },
            {
              id: 1,
              timestamp: "2026-11-23T09:00:00.000Z",
              action: "RESERVATION_CREATED",
              details: {
                reservationId: 7155,
                reservationCode: "RES-715-0905",
                flatNumber: "715",
                guestName: "Elerson Silva",
                channel: "booking",
                checkinDate: "2026-11-24",
                checkoutDate: "2026-11-26",
                changes: [{ field: "channel", newValue: "WhatsApp Direto" }]
              }
            }
          ]
        })
      };
      await reconcileFromAuditLogs(db, mockPg);
      assert.equal(db.reservations.find((x) => x.id === 7155).channel, "whatsapp");
      assert.ok(db.reservations.find((x) => x.id === 7155).dailyRates.every((d) => d.channel === "whatsapp"));
    });
  });

  describe("Caso 2 — Viviane (RES-509-0970 / Flat 605): Bloqueio de Confirmação e PDF Duplicados", () => {
    it("carimbos permanentes sobrevivem a pruning do whatsappHistory e reconhecem diferença de 9º dígito", async () => {
      const vivRes = {
        id: 970,
        code: "RES-509-0970",
        flatId: 13,
        flatNumber: "605",
        guestName: "Viviane Miranda D Oliveira",
        guestPhone: "+55 21 98506-7855",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-27",
        totalAmount: 900,
        paidAmount: 900,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        createdAt: "2026-11-18T12:00:00.000Z",
        paidAt: "2026-11-18T12:15:00.000Z"
      };
      db.reservations.push(vivRes);

      markReservationConfirmationDispatched(db, vivRes, {
        phone: "+55 21 98506-7855",
        sentAt: "2026-11-18T12:16:00.000Z",
        eventName: "payment_confirmed",
        sentPdf: true
      });

      // Simula histórico antigo apagado pelo pruning
      db.whatsappHistory = [];

      assert.equal(isConfirmationAlreadyDispatched(vivRes), true);
      assert.equal(isInitialConfirmationInFlightOrSent(db, vivRes), true);
      // Telefone sem 9º dígito deve casar via matchClientPhone
      assert.equal(hasPdfAlreadyBeenSentOrInFlight(db, vivRes.code, vivRes.id, "+55 21 8506-7855"), true);

      await triggerImmediateWhatsApp(db, () => {}, "payment_confirmed", vivRes);
      await ensurePaymentConfirmationDispatched(vivRes, { wasPreReserva: false });

      const zapiCalls = externalFetchLog.filter((c) => c.url.includes("z-api"));
      assert.equal(zapiCalls.length, 0, "Não pode disparar WhatsApp de confirmação novamente");
    });

    it("rotas GET /guest-portal/:code e /payment-status nunca disparam confirmação de reserva paga", async () => {
      const vivRes = {
        id: 971,
        code: "RES-509-0970",
        flatId: 13,
        flatNumber: "605",
        guestName: "Viviane Miranda D Oliveira",
        guestPhone: "+55 21 98506-7855",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-27",
        totalAmount: 900,
        paidAmount: 900,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp",
        morningEmailSentDate: "2026-11-23",
        receptionNotifiedAt: "2026-11-23T07:00:00.000Z",
        createdAt: "2026-11-18T12:00:00.000Z",
        paidAt: null // Mesmo sem paidAt explícito!
      };
      db.reservations.push(vivRes);

      const portalRes = await httpJsonRequest("GET", "/api/pms/guest-portal/RES-509-0970");
      assert.equal(portalRes.status, 200);

      const payStatusRes = await httpJsonRequest("GET", "/api/pms/reservations/RES-509-0970/payment-status");
      assert.equal(payStatusRes.status, 200);
      assert.equal(payStatusRes.body.paid, true);

      const guestDispatches = externalFetchLog.filter((c) => {
        if (!c.url.includes("z-api")) return false;
        let payloadPhone = "";
        let payloadMsg = "";
        try {
          const parsed = JSON.parse(String(c.body || "{}"));
          payloadPhone = String(parsed.phone || "");
          payloadMsg = String(parsed.message || parsed.caption || "");
        } catch {}
        return payloadPhone.includes("98506") || /Garantida & Confirmada/i.test(payloadMsg);
      });
      assert.equal(guestDispatches.length, 0, "Rotas GET não devem disparar confirmação ou PDF para o hóspede");
    });

    it("pruneDatabase retém mais de 300 itens de whatsappHistory (limite elevado para 1500)", () => {
      db.whatsappHistory = Array.from({ length: 420 }, (_, i) => ({
        id: `hist_${i}`,
        sentAt: new Date(Date.now() - i * 60000).toISOString(),
        status: "sent",
        triggerEvent: "checkin_day_instructions"
      }));
      pruneDatabase();
      assert.equal(db.whatsappHistory.length, 420);
    });
  });

  describe("Caso 3 — Claudia (Flat 212): Regra de Frigobar em Dobradinha, Limpeza e Retry de Quarto Pronto", () => {
    it("flat já vago/limpo desde a véspera (sem saída hoje) libera antes das 14:00 mesmo sem inspeção de frigobar hoje", () => {
      const prevGuestOldEarly = {
        id: 2120,
        code: "RES-212-ANT",
        flatId: 5,
        flatNumber: "212",
        checkinDate: "2026-11-18",
        checkoutDate: "2026-11-23", // Data original era hoje, mas saiu antecipado dia 21
        earlyCheckout: true,
        earlyCheckoutDate: "2026-11-21",
        status: "completed"
      };
      const claudiaRes = {
        id: 2121,
        code: "RES-212-CLAUDIA",
        flatId: 5,
        flatNumber: "212",
        guestName: "Claudia Santos",
        guestPhone: "5522999990212",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-25",
        status: "confirmada",
        paymentStatus: "pago_total",
        channel: "whatsapp"
      };
      db.reservations.push(prevGuestOldEarly, claudiaRes);
      db.cleaningRequests.push({
        id: 500,
        flatId: 5,
        flatNumber: "212",
        requestDate: "2026-11-20",
        status: "pending_issue",
        type: "service_order" // Card antigo de OS não deve bloquear
      });

      const now11h = new Date("2026-11-23T11:00:00-03:00");
      const readiness = evaluateFlatCheckinReadiness(db, claudiaRes, now11h);

      assert.equal(isFlatStillBeingCleanedOnCheckinDay(db, claudiaRes, "2026-11-23"), false);
      assert.equal(isFlatMinibarInspectedTodayOnCheckinDay(db, claudiaRes, "2026-11-23"), true);
      assert.equal(readiness.isFlatClean, true);
      assert.equal(readiness.isMinibarInspected, true);
      assert.equal(readiness.isFlatReady, true);
    });

    it("em dobradinha (outro hóspede saindo hoje), exige frigobar real pós-saída antes das 14:00 e libera às 14:00", () => {
      const leavingToday = {
        id: 2122,
        code: "RES-212-SAI",
        flatId: 5,
        flatNumber: "212",
        checkinDate: "2026-11-21",
        checkoutDate: "2026-11-23",
        status: "completed",
        checkoutDone: true,
        actualCheckoutAt: "2026-11-23T09:30:00-03:00"
      };
      const claudiaRes = {
        id: 2123,
        code: "RES-212-CLAUDIA2",
        flatId: 5,
        flatNumber: "212",
        guestName: "Claudia Santos",
        guestPhone: "5522999990212",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-25",
        status: "confirmada",
        paymentStatus: "pago_total",
        channel: "whatsapp"
      };
      db.reservations.push(leavingToday, claudiaRes);
      db.cleaningRequests.push({
        id: 501,
        flatId: 5,
        flatNumber: "212",
        requestDate: "2026-11-23",
        status: "clean",
        completedAt: "2026-11-23T10:10:00-03:00"
      });

      const now11h = new Date("2026-11-23T11:00:00-03:00");
      // Sem inspeção pós-checkout às 11h: bloqueia por frigobar
      const beforeInsp = evaluateFlatCheckinReadiness(db, claudiaRes, now11h);
      assert.equal(beforeInsp.isFlatClean, true);
      assert.equal(beforeInsp.isMinibarInspected, false);
      assert.equal(beforeInsp.isFlatReady, false);
      assert.equal(beforeInsp.readinessBlockReason, "minibar_not_inspected");

      // Às 14h mesmo sem inspeção: libera
      const now14h = new Date("2026-11-23T14:00:00-03:00");
      assert.equal(evaluateFlatCheckinReadiness(db, claudiaRes, now14h).isFlatReady, true);

      // Com inspeção real pós-saída às 10:15: libera já às 11:00
      db.minibarInspections.push({
        id: 800,
        flatNumber: "212",
        status: "checked",
        inspectedAt: "2026-11-23T10:15:00-03:00"
      });
      assert.equal(evaluateFlatCheckinReadiness(db, claudiaRes, now11h).isFlatReady, true);
    });

    it("triggerRoomReadyWhatsApp não carimba roomReadySentDate em falha Z-API e faz retry após backoff de 2 minutos", async () => {
      const claudiaRes = {
        id: 2124,
        code: "RES-212-CLAUDIA3",
        flatId: 5,
        flatNumber: "212",
        guestName: "Claudia Santos",
        guestPhone: "5522999990212",
        checkinDate: "2026-11-23",
        checkoutDate: "2026-11-25",
        status: "confirmada",
        paymentStatus: "pago_total",
        channel: "whatsapp"
      };
      db.reservations.push(claudiaRes);
      db.cleaningRequests.push({
        id: 502,
        flatId: 5,
        flatNumber: "212",
        requestDate: "2026-11-23",
        status: "clean",
        completedAt: "2026-11-23T10:50:00-03:00"
      });

      // Tentativa 1 (11:00): Z-API falha (HTTP 500)
      mockFetchHandler = async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Simulated 500" }),
        text: async () => "Simulated 500"
      });
      await triggerRoomReadyWhatsApp(db, () => {}, 5, "212", "https://corpflats.com.br", new Date("2026-11-23T11:00:00-03:00"));

      assert.equal(claudiaRes.roomReadySentDate, undefined, "Falha não deve carimbar roomReadySentDate");
      assert.equal(claudiaRes._roomReadyFailToday?.count, 1);

      // Tentativa 1.5 (11:01 — apenas 1 min depois): respeita backoff de 2 min
      const callsBeforeBackoff = externalFetchLog.length;
      await triggerRoomReadyWhatsApp(db, () => {}, 5, "212", "https://corpflats.com.br", new Date("2026-11-23T11:01:00-03:00"));
      assert.equal(externalFetchLog.length, callsBeforeBackoff);

      // Tentativa 2 (11:03 — 3 min depois): Z-API volta ao ar e entrega
      mockFetchHandler = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ messageId: "MSG_CLAUDIA_OK" }),
        text: async () => JSON.stringify({ messageId: "MSG_CLAUDIA_OK" })
      });
      await triggerRoomReadyWhatsApp(db, () => {}, 5, "212", "https://corpflats.com.br", new Date("2026-11-23T11:03:00-03:00"));

      assert.ok(externalFetchLog.length > callsBeforeBackoff, "Deve tentar reenvio após 2 min");
      assert.equal(claudiaRes.roomReadySentDate, "2026-11-23");
      assert.equal(claudiaRes._roomReadyFailToday, undefined);
    });
  });
});
