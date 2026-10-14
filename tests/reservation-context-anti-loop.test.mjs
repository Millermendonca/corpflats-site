/**
 * Test Suite: Reservation Context & Anti-Repetition Guard Suite
 * File: tests/reservation-context-anti-loop.test.mjs
 * Execution: node --test tests/reservation-context-anti-loop.test.mjs
 *
 * Cobertura:
 * a) Usuário dizendo "reserva pra mim por favor" após a mensagem de preços não recebe a cotação repetida;
 * b) A resposta pede diretamente as datas de entrada e saída e quantidade de pessoas de forma acolhedora;
 * c) Proteção anti-repetição ativa contra respostas idênticas consecutivas;
 * d) Intenção de reserva com ações do sistema pausadas registra demanda e orienta sem loop.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  isReservationBookingRequest,
  hasRecentlySentPricingQuote,
  areMessagesSubstantiallyIdentical,
  getLastBotMessage,
  applyAntiRepetitionGuard,
  isPricingOrQuoteInquiry,
  analyzeGuestQuery,
  validateAndRefineResponse,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  DEFAULT_AI_CONFIG
} from "../scripts/whatsapp-ai-service.mjs";

describe("Reservation Context & Anti-Repetition Guard Suite", () => {
  let mockDb;
  const quoteMessage = `Olá, Miller! ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de:

• *Sem café:* a partir de *R$ 237,00 / diária* (+ taxa única de limpeza de R$ 70,00 por estadia)
• *Com café da manhã no quarto:* a partir de *R$ 272,00 / diária* (1 pessoa) ou *R$ 307,00 / diária* (casal), com *isenção total da taxa de limpeza*! 🥐☕

Dispomos de flats com cozinha completa, ar Split, Wi-Fi veloz e garagem no melhor ponto de Campos/RJ.

Qual período você pretende se hospedar e para quantas pessoas? Me informando as datas de entrada e saída, já verifico a disponibilidade em tempo real para você! 🏨`;

  beforeEach(() => {
    mockDb = {
      settings: {
        baseUrl: "https://corpflats.onrender.com"
      },
      tariffSettings: {
        baseDailyRate: 237,
        weekendRate: 260
      },
      botActionsSettings: {
        apiActionsEnabled: true,
        allowedActions: {
          checkAvailability: true,
          calculateQuote: true,
          generatePayment: true,
          createPreReservation: true,
          commitReservation: true
        }
      },
      flats: [
        { id: "flat-101", number: 101, status: "clean" },
        { id: "flat-204", number: 204, status: "clean" }
      ],
      reservations: [],
      unmetDemands: [],
      whatsappConversations: [
        {
          id: "conv-1",
          phone: "5522998505276",
          name: "Miller",
          messages: [
            { fromMe: false, text: "quanto custa a diária?", timestamp: new Date(Date.now() - 60000).toISOString() },
            { fromMe: true, text: quoteMessage, timestamp: new Date(Date.now() - 30000).toISOString() }
          ]
        }
      ]
    };
  });

  describe("1. Identificação Semântica da Intenção de Reserva (isReservationBookingRequest)", () => {
    it("reconhece variações de solicitação de reserva", () => {
      assert.equal(isReservationBookingRequest("reserva pra mim por favor"), true);
      assert.equal(isReservationBookingRequest("quero reservar"), true);
      assert.equal(isReservationBookingRequest("faz uma reserva"), true);
      assert.equal(isReservationBookingRequest("pode fazer a reserva pra mim?"), true);
      assert.equal(isReservationBookingRequest("gostaria de reservar um flat"), true);
      assert.equal(isReservationBookingRequest("como faço para reservar"), true);
      assert.equal(isReservationBookingRequest("quero alugar"), true);
      assert.equal(isReservationBookingRequest("reserva"), true);
    });

    it("NÃO confunde perguntas de cotação/preço com solicitação de reserva", () => {
      assert.equal(isReservationBookingRequest("quanto custa a diária?"), false);
      assert.equal(isReservationBookingRequest("qual o valor da reserva?"), false);
      assert.equal(isReservationBookingRequest("qual o preço?"), false);
    });

    it("NÃO confunde cancelamentos ou consultas de reservas existentes com nova reserva", () => {
      assert.equal(isReservationBookingRequest("quero cancelar minha reserva"), false);
      assert.equal(isReservationBookingRequest("minha reserva está confirmada?"), false);
    });

    it("garante que isPricingOrQuoteInquiry retorna false para solicitação de reserva", () => {
      assert.equal(isPricingOrQuoteInquiry("reserva pra mim por favor"), false);
      assert.equal(isPricingOrQuoteInquiry("quero reservar"), false);
      assert.equal(isPricingOrQuoteInquiry("faz uma reserva"), false);
    });

    it("classifica como RESERVATION_REQUEST no analyzeGuestQuery", () => {
      const analysis = analyzeGuestQuery("reserva pra mim por favor", { guestName: "Miller" }, mockDb);
      assert.equal(analysis.type, "RESERVATION_REQUEST");
      assert.equal(analysis.primaryTopic, "solicitacao_reserva");
    });
  });

  describe("2. Detecção de Cotação Prévia e Anti-Repetição (hasRecentlySentPricingQuote & areMessagesSubstantiallyIdentical)", () => {
    it("detecta que a cotação já foi enviada no histórico da conversa", () => {
      const history = mockDb.whatsappConversations[0].messages;
      assert.equal(hasRecentlySentPricingQuote(history), true);
    });

    it("detecta que histórico sem cotação não possui cotação recente", () => {
      const history = [
        { fromMe: false, text: "qual a senha do wifi?" },
        { fromMe: true, text: "A senha do Wi-Fi é 1234567890123" }
      ];
      assert.equal(hasRecentlySentPricingQuote(history), false);
    });

    it("detecta mensagens substancialmente idênticas (proteção anti-loop)", () => {
      const msg1 = "Olá, Miller! ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de: R$ 237...";
      const msg2 = "Olá, Miller! ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de: R$ 237...";
      assert.equal(areMessagesSubstantiallyIdentical(msg1, msg2), true);
      assert.equal(areMessagesSubstantiallyIdentical(quoteMessage, quoteMessage), true);
    });

    it("diferencia mensagens de conteúdos distintos", () => {
      const msg1 = quoteMessage;
      const msg2 = "Com certeza, Miller! Para eu prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada e saída?";
      assert.equal(areMessagesSubstantiallyIdentical(msg1, msg2), false);
    });
  });

  describe("3. Comportamento Contextual: 'reserva pra mim por favor' após cotação", () => {
    it("NÃO repete a tabela de preços e pede diretamente datas e hóspedes em generateHeuristicResponse", () => {
      const history = mockDb.whatsappConversations[0].messages;
      const response = generateHeuristicResponse(
        "reserva pra mim por favor",
        { guestName: "Miller", phone: "5522998505276" },
        DEFAULT_AI_CONFIG,
        [],
        mockDb,
        history
      );

      // Não pode conter a tabela de preços
      assert.equal(response.includes("Sem café: a partir de"), false);
      assert.equal(response.includes("No canal direto da CorpFlats, nossas diárias"), false);

      // Deve acolher e pedir as datas e pessoas
      assert.match(response, /com\s+certeza/i);
      assert.match(response, /Miller/i);
      assert.match(response, /datas?\s+(?:de\s+)?entrada/i);
      assert.match(response, /sa[ií]da/i);
      assert.match(response, /quantas\s+pessoas/i);
    });

    it("validateAndRefineResponse substitui cotação repetida candidata por pedido direto de datas", () => {
      const history = mockDb.whatsappConversations[0].messages;
      // Suponha que o modelo candidato tentou repetir a cotação
      const candidateRepeat = quoteMessage;

      const validated = validateAndRefineResponse({
        queryText: "reserva pra mim por favor",
        candidateText: candidateRepeat,
        guestContext: { guestName: "Miller", phone: "5522998505276" },
        db: mockDb,
        aiConfig: DEFAULT_AI_CONFIG,
        history
      });

      assert.notEqual(validated.replyText, candidateRepeat);
      assert.equal(validated.replyText.includes("Sem café: a partir de"), false);
      assert.match(validated.replyText, /com\s+certeza/i);
      assert.match(validated.replyText, /Miller/i);
      assert.match(validated.replyText, /datas?\s+(?:de\s+)?entrada/i);
    });

    it("generateAiWhatsAppResponse responde contextualmente sem repetir tabela de preços", async () => {
      const history = mockDb.whatsappConversations[0].messages;
      const res = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "reserva pra mim por favor",
        history
      });

      assert.equal(res.replyText.includes("Sem café: a partir de"), false);
      assert.equal(res.replyText.includes("No canal direto da CorpFlats, nossas diárias"), false);
      assert.match(res.replyText, /com\s+certeza/i);
      assert.match(res.replyText, /datas?\s+(?:de\s+)?entrada/i);
      assert.match(res.replyText, /quantas\s+pessoas/i);
    });
  });

  describe("4. Ações do Sistema Desativadas (apiActionsEnabled: false / createPreReservation: false)", () => {
    it("orienta com cordialidade, transfere para a equipe humana e registra unmetDemand sem loop", async () => {
      mockDb.botActionsSettings.apiActionsEnabled = false;

      const history = mockDb.whatsappConversations[0].messages;
      const res = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "reserva pra mim por favor",
        history
      });

      // Não pode repetir a cotação
      assert.equal(res.replyText.includes("Sem café: a partir de"), false);
      // Deve informar sobre a equipe de recepção
      assert.match(res.replyText, /equipe.*(?:recepção|humana)|atendente/i);
      // Deve acionar transbordo
      assert.equal(res.shouldHandover, true);
      // Deve ter registrado demanda não atendida
      assert.equal(mockDb.unmetDemands.length > 0, true);
      const demand = mockDb.unmetDemands[0];
      assert.equal(demand.category, "pre_reserva");
      assert.equal(demand.actionTarget, "createPreReservation");
      assert.equal(demand.reason, "action_disabled");
    });
  });

  describe("5. Anti-Repetition Guard em processAiInboundMessage", () => {
    it("evita que Sofia envie mensagem duplicada idêntica à anterior no webhook", async () => {
      let sentMessage = null;
      const sendZapiMock = async (cfg, payload) => {
        sentMessage = payload.message;
        return { success: true };
      };

      const appendMessageMock = (db, msg) => {
        db.whatsappConversations[0].messages.push(msg);
      };

      // O usuário responde "reserva pra mim por favor" após a mensagem de preços
      const result = await processAiInboundMessage({
        db: mockDb,
        incomingInfo: {
          fromMe: false,
          isGroup: false,
          text: "reserva pra mim por favor",
          senderPhone: "5522998505276",
          senderName: "Miller"
        },
        cleanTarget: "5522998505276",
        sendZapiMessage: sendZapiMock,
        appendMessageFn: appendMessageMock,
        saveDatabase: () => {},
        createNotification: () => {}
      });

      assert.equal(result.handled, true);
      assert.ok(sentMessage, "Deve ter enviado mensagem via Z-API");
      // A mensagem enviada NUNCA pode ser igual ao quoteMessage anterior
      assert.notEqual(sentMessage, quoteMessage);
      assert.equal(sentMessage.includes("Sem café: a partir de"), false);
      assert.match(sentMessage, /com\s+certeza/i);
      assert.match(sentMessage, /datas?\s+(?:de\s+)?entrada/i);
    });
  });
});
