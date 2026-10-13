/**
 * Test Suite: Semantic Query Analysis, Self-Critique Validation & Two-Track PMS System
 * File: tests/semantic-critique-ai.test.mjs
 * Execution: node --test tests/semantic-critique-ai.test.mjs
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeGuestQuery,
  validateAndRefineResponse,
  handleGetPricingInfo,
  handleGetReservationDetails,
  handleGetFlatStatus,
  handleRecordUnmetDemand,
  executeBotAction,
  generateHeuristicResponse,
  DEFAULT_AI_CONFIG
} from "../scripts/whatsapp-ai-service.mjs";

describe("Semantic Query Analysis & Two-Track PMS Suite", () => {
  // Mock DB with PMS operational data
  let mockDb;

  beforeEach(() => {
    mockDb = {
      settings: {
        baseUrl: "https://corpflats.onrender.com"
      },
      tariffSettings: {
        baseDailyRate: 237,
        weekendRate: 260
      },
      flats: [
        { id: "flat-101", number: 101, status: "clean" },
        { id: "flat-204", number: 204, status: "dirty" }
      ],
      cleaningRequests: [
        { id: "clean-1", flatNumber: 204, status: "in_progress", requestDate: "2026-10-13" }
      ],
      reservations: [
        {
          id: "res-123",
          code: "RES-TEST-01",
          guestName: "Carlos Silva",
          guestPhone: "5521999998888",
          phone: "5521999998888",
          flatNumber: "101",
          flatId: "flat-101",
          checkinDate: "2026-10-13",
          checkoutDate: "2026-10-15",
          status: "confirmada",
          paymentStatus: "pago_total",
          totalAmount: 544
        }
      ],
      unmetDemands: [],
      pendingFaqs: [],
      botActionsSettings: {
        apiActionsEnabled: true,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: true,
          generatePayment: true,
          createPreReservation: true,
          commitReservation: true,
          getReservationDetails: true,
          getFlatStatus: true,
          getPricingInfo: true,
          recordUnmetDemand: true
        }
      }
    };
  });

  describe("1. Semantic Query Intent Analysis (analyzeGuestQuery)", () => {
    it("classifies pure greetings as GREETING_ONLY", () => {
      const q1 = analyzeGuestQuery("Oi, bom dia!", null, mockDb);
      assert.equal(q1.type, "GREETING_ONLY");

      const q2 = analyzeGuestQuery("Olá Sofia tudo bem?", null, mockDb);
      assert.equal(q2.type, "GREETING_ONLY");

      const q3 = analyzeGuestQuery("Boa tarde", null, mockDb);
      assert.equal(q3.type, "GREETING_ONLY");
    });

    it("classifies pricing and rate questions as PRICING_QUOTE", () => {
      const q1 = analyzeGuestQuery("Quanto tá a diária?", null, mockDb);
      assert.equal(q1.type, "PRICING_QUOTE");

      const q2 = analyzeGuestQuery("Qual o valor para 1 pessoa com café?", null, mockDb);
      assert.equal(q2.type, "PRICING_QUOTE");

      const q3 = analyzeGuestQuery("Gostaria de saber o preço de uma estadia de 2 dias", null, mockDb);
      assert.equal(q3.type, "PRICING_QUOTE");
    });

    it("classifies reservation checks as EXISTING_RESERVATION", () => {
      const q1 = analyzeGuestQuery("Minha reserva está confirmada?", null, mockDb);
      assert.equal(q1.type, "EXISTING_RESERVATION");

      const q2 = analyzeGuestQuery("Gostaria de ver os dados da minha estadia código RES-TEST-01", null, mockDb);
      assert.equal(q2.type, "EXISTING_RESERVATION");
    });

    it("classifies flat ready questions as FLAT_READY_STATUS", () => {
      const q1 = analyzeGuestQuery("O quarto 101 já tá pronto?", null, mockDb);
      assert.equal(q1.type, "FLAT_READY_STATUS");

      const q2 = analyzeGuestQuery("Posso entrar no flat agora?", null, mockDb);
      assert.equal(q2.type, "FLAT_READY_STATUS");
    });

    it("classifies operational demands as OPERATIONAL_DEMAND", () => {
      const q1 = analyzeGuestQuery("Preciso de um berço no quarto", null, mockDb);
      assert.equal(q1.type, "OPERATIONAL_DEMAND");
      assert.equal(q1.demandClassification.category, "itens_especiais_comodidades");

      const q2 = analyzeGuestQuery("Gostaria de solicitar troca de toalhas", null, mockDb);
      assert.equal(q2.type, "OPERATIONAL_DEMAND");
      assert.equal(q2.demandClassification.category, "enxoval_toalhas");

      const q3 = analyzeGuestQuery("Preciso trocar a placa do meu carro na garagem", null, mockDb);
      assert.equal(q3.type, "OPERATIONAL_DEMAND");
      assert.equal(q3.demandClassification.category, "garagem_veiculo");
    });

    it("classifies institutional knowledge queries as GENERIC_FAQ", () => {
      const q1 = analyzeGuestQuery("Qual a senha do wifi?", null, mockDb);
      assert.equal(q1.type, "GENERIC_FAQ");

      const q2 = analyzeGuestQuery("A piscina é aquecida?", null, mockDb);
      assert.equal(q2.type, "GENERIC_FAQ");
    });

    it("classifies unmapped queries as UNKNOWN_INQUIRY", () => {
      const q = analyzeGuestQuery("Vocês tem heliporto ou pista de pouso particular?", null, mockDb);
      assert.equal(q.type, "UNKNOWN_INQUIRY");
    });
  });

  describe("2. Track 2 - Operational PMS Direct Reading", () => {
    it("handleGetPricingInfo returns exact daily rates and breakfast pricing", () => {
      const price = handleGetPricingInfo(mockDb, { guests: 1, withBreakfast: true });
      assert.equal(price.success, true);
      assert.equal(price.baseRateWithoutBreakfast, 237);
      assert.equal(price.rateWithBreakfastFor1, 272);
      assert.equal(price.breakfastPerPerson, 35);
      assert.equal(price.isCleaningFeeExemptOnBreakfast, true);
      assert.match(price.summary, /272.*ISENÇÃO TOTAL/i);
    });

    it("handleGetReservationDetails finds active reservation and returns details", () => {
      const res = handleGetReservationDetails(mockDb, { code: "RES-TEST-01" });
      assert.equal(res.success, true);
      assert.equal(res.found, true);
      assert.equal(res.reservation.guestName, "Carlos Silva");
      assert.equal(res.reservation.flatNumber, "101");
      assert.match(res.reservation.checkinUrl, /pre-checkin\/RES-TEST-01/);
    });

    it("handleGetFlatStatus returns accurate room readiness from PMS and cleaningRequests", () => {
      const flat101 = handleGetFlatStatus(mockDb, { flatNumber: "101" });
      assert.equal(flat101.success, true);
      assert.equal(flat101.isRoomReady, true);
      assert.equal(flat101.cleaningStatus, "clean");

      const flat204 = handleGetFlatStatus(mockDb, { flatNumber: "204" });
      assert.equal(flat204.success, true);
      assert.equal(flat204.isRoomReady, false);
      assert.equal(flat204.cleaningStatus, "in_progress");
    });

    it("handleRecordUnmetDemand records operational demands directly into db.unmetDemands", () => {
      const initialCount = mockDb.unmetDemands.length;
      const res = handleRecordUnmetDemand(mockDb, {
        text: "Hóspede perguntou se tem ferro de passar com tábua",
        category: "itens_especiais_comodidades",
        senderPhone: "5521999998888"
      });
      assert.equal(res.success, true);
      assert.equal(mockDb.unmetDemands.length, initialCount + 1);
      assert.equal(mockDb.unmetDemands[0].category, "itens_especiais_comodidades");
    });
  });

  describe("3. Pre-Response Self-Critique & Validation (validateAndRefineResponse)", () => {
    it("detects and corrects false positive: breakfast tray logistics when asking for room price", () => {
      const queryText = "quanto tá a diária? 1 pessoa com café";
      // Suppose a hallucinated or misclassified candidate gave tray delivery rules
      const candidateReply = "O café da manhã no condomínio Soho funciona exclusivamente via bandeja diretamente no quarto das 05:00 às 09:30, com escolha de itens pelo portal /cafe até a véspera.";

      const validation = validateAndRefineResponse({
        queryText,
        candidateText: candidateReply,
        guestContext: { guestName: "Juliana" },
        db: mockDb,
        aiConfig: DEFAULT_AI_CONFIG
      });

      // The validation must reject the tray explanation and provide real pricing numbers
      assert.notEqual(validation.replyText, candidateReply);
      assert.match(validation.replyText, /R\$\s*272/i);
      assert.match(validation.replyText, /café/i);
      assert.match(validation.replyText, /isenção/i);
    });

    it("captures operational demands and records them into db.unmetDemands", () => {
      const queryText = "Tem berço para o meu bebê?";
      const candidateReply = "Olá! Não temos essa informação no momento.";

      const initialCount = mockDb.unmetDemands.length;
      const validation = validateAndRefineResponse({
        queryText,
        candidateText: candidateReply,
        guestContext: { guestName: "Marcelo", phone: "5521988887777" },
        db: mockDb,
        aiConfig: DEFAULT_AI_CONFIG
      });

      assert.equal(validation.missingDataOrCapability, true);
      assert.equal(mockDb.unmetDemands.length, initialCount + 1);
      assert.equal(mockDb.unmetDemands[0].category, "itens_especiais_comodidades");
      assert.match(validation.replyText, /registrei o seu pedido no sistema para a recepção/i);
    });

    it("allows valid institutional answers to pass through without distortion", () => {
      const queryText = "Qual a senha do Wi-Fi?";
      const candidateReply = "A rede Wi-Fi está disponível em cada flat. O nome da rede e a senha estão anotados no display ao lado da TV.";

      const validation = validateAndRefineResponse({
        queryText,
        candidateText: candidateReply,
        guestContext: {},
        db: mockDb,
        aiConfig: DEFAULT_AI_CONFIG
      });

      assert.equal(validation.replyText, candidateReply);
      assert.equal(validation.missingDataOrCapability, false);
    });
  });

  describe("4. Bot Action Engine Integration (executeBotAction)", () => {
    it("executes getPricingInfo through bot action engine", async () => {
      const res = await executeBotAction(mockDb, "getPricingInfo", { guests: 2, withBreakfast: true });
      assert.equal(res.success, true);
      assert.equal(res.rateWithBreakfastFor2, 307);
    });

    it("executes getReservationDetails through bot action engine", async () => {
      const res = await executeBotAction(mockDb, "getReservationDetails", { phone: "5521999998888" });
      assert.equal(res.success, true);
      assert.equal(res.reservation.code, "RES-TEST-01");
    });

    it("executes getFlatStatus through bot action engine", async () => {
      const res = await executeBotAction(mockDb, "getFlatStatus", { flatNumber: "101" });
      assert.equal(res.success, true);
      assert.equal(res.isRoomReady, true);
    });

    it("logs unmet demand when action is disabled in settings", async () => {
      const localDb = JSON.parse(JSON.stringify(mockDb));
      localDb.botActionsSettings.allowedActions.getFlatStatus = false;
      const initialCount = localDb.unmetDemands.length;

      const res = await executeBotAction(localDb, "getFlatStatus", { flatNumber: "101" });
      assert.equal(res.error, "ACTION_DISABLED");
      assert.equal(res.requiresHandover, true);
      assert.equal(localDb.unmetDemands.length, initialCount + 1);
    });
  });

  describe("5. Fallback Heuristic Generator Alignment (generateHeuristicResponse)", () => {
    it("generates pricing response on pricing query rather than falling into generic fallback", () => {
      const res = generateHeuristicResponse("quanto custa a diária?", {}, DEFAULT_AI_CONFIG, [], mockDb);
      assert.match(res, /237/);
      assert.match(res, /272/);
    });

    it("generates cordial logged acknowledgment on operational demand", () => {
      const res = generateHeuristicResponse("por favor gostaria de pedir uma limpeza avulsa hoje", {}, DEFAULT_AI_CONFIG, [], mockDb);
      assert.match(res, /limpeza avulsa/i);
      assert.match(res, /registrei o seu pedido no sistema/i);
    });
  });
});
