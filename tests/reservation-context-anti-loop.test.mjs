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

  describe("6. Proteção Anti-Loop Multi-Turn (3x 'reserva pra mim por favor')", () => {
    it("garante que 3 pedidos consecutivos idênticos do usuário gerem 3 respostas distintas sem repetição", () => {
      // 1ª vez: após cotação
      const hist1 = [
        { fromMe: false, text: "quanto custa a diária?" },
        { fromMe: true, text: quoteMessage }
      ];
      const resp1 = generateHeuristicResponse(
        "reserva pra mim por favor",
        { guestName: "Miller", phone: "5522998505276", history: hist1 },
        DEFAULT_AI_CONFIG,
        [],
        mockDb,
        hist1
      );
      assert.match(resp1, /com\s+certeza/i);
      assert.match(resp1, /datas?\s+(?:de\s+)?entrada/i);

      // 2ª vez: usuário repete "reserva pra mim por favor" sem passar as datas
      const hist2 = [
        ...hist1,
        { fromMe: false, text: "reserva pra mim por favor" },
        { fromMe: true, text: resp1 }
      ];
      const guard2 = applyAntiRepetitionGuard({
        candidateText: resp1, // modelo tenta repetir resp1
        history: hist2,
        queryText: "reserva pra mim por favor",
        guestContext: { guestName: "Miller", phone: "5522998505276" },
        db: mockDb
      });
      assert.equal(guard2.wasRepetitive, true);
      assert.notEqual(guard2.refinedText, resp1);
      assert.match(guard2.refinedText, /realmente\s+quero\s+te\s+ajudar/i);

      // 3ª vez: usuário insiste pela 3ª vez
      const hist3 = [
        ...hist2,
        { fromMe: false, text: "reserva pra mim por favor" },
        { fromMe: true, text: guard2.refinedText }
      ];
      const guard3 = applyAntiRepetitionGuard({
        candidateText: guard2.refinedText, // modelo tenta repetir
        history: hist3,
        queryText: "reserva pra mim por favor",
        guestContext: { guestName: "Miller", phone: "5522998505276" },
        db: mockDb
      });
      assert.equal(guard3.wasRepetitive, true);
      assert.notEqual(guard3.refinedText, guard2.refinedText);
      assert.notEqual(guard3.refinedText, resp1);
      assert.match(guard3.refinedText, /disposi[cç][aã]o/i);
    });
  });

  describe("7. Respostas Contextuais em Fluxo de Reserva (Hóspedes, Café e Datas)", () => {
    it("reconhece quantidade de pessoas e pede datas sem reiniciar com saudação genérica", () => {
      const hist = [
        { fromMe: true, text: quoteMessage }
      ];
      const resp = generateHeuristicResponse(
        "para 2 pessoas",
        { guestName: "Miller", phone: "5522998505276", history: hist },
        DEFAULT_AI_CONFIG,
        [],
        mockDb,
        hist
      );
      assert.equal(resp.includes("Sou a Sofia, concierge virtual"), false);
      assert.match(resp, /2\s+pessoas/i);
      assert.match(resp, /datas?\s+(?:de\s+)?entrada/i);
    });

    it("reconhece opção com café e pede datas sem disparar FAQ de entrega de bandeja", () => {
      const hist = [
        { fromMe: true, text: quoteMessage }
      ];
      const resp = generateHeuristicResponse(
        "quero com café",
        { guestName: "Miller", phone: "5522998505276", history: hist },
        DEFAULT_AI_CONFIG,
        [],
        mockDb,
        hist
      );
      assert.equal(resp.includes("05:00 às 09:30"), false);
      assert.match(resp, /caf[eé]\s+da\s+manh[aã]/i);
      assert.match(resp, /datas?\s+(?:de\s+)?entrada/i);
    });

    it("reconhece datas e avança na verificação sem cuspir tabela de preços", () => {
      const hist = [
        { fromMe: true, text: quoteMessage }
      ];
      const resp = generateHeuristicResponse(
        "do dia 10 ao dia 15 de novembro para 2 pessoas",
        { guestName: "Miller", phone: "5522998505276", history: hist },
        DEFAULT_AI_CONFIG,
        [],
        mockDb,
        hist
      );
      assert.equal(resp.includes("Sem café: a partir de"), false);
      assert.match(resp, /datas\s+informadas|verificando\s+a\s+disponibilidade/i);
    });
  });

  describe("8. Cotação Sem Repetição do Banner de 10 Linhas", () => {
    it("responde de forma concisa quando cotação já foi enviada logo acima", () => {
      const hist = [
        { fromMe: true, text: quoteMessage }
      ];
      const resp = generateHeuristicResponse(
        "quanto fica 1 pessoa com café?",
        { guestName: "Miller", phone: "5522998505276", history: hist },
        DEFAULT_AI_CONFIG,
        [],
        mockDb,
        hist
      );
      assert.equal(resp.includes("No canal direto da CorpFlats, a diária para *1 pessoa com café"), false);
      assert.match(resp, /mencionei|a\s+partir\s+de\s+\*?R\$\s*272/i);
    });
  });

  describe("9. Variações Adicionais de Intenção de Reserva", () => {
    it("reconhece expressões brasileiras coloquiais de reserva", () => {
      assert.equal(isReservationBookingRequest("por favor reserva"), true);
      assert.equal(isReservationBookingRequest("por favor reserve pra mim"), true);
      assert.equal(isReservationBookingRequest("fecha pra mim por favor"), true);
      assert.equal(isReservationBookingRequest("reserva aí pra mim"), true);
      assert.equal(isReservationBookingRequest("reserva pra nós"), true);
      assert.equal(isReservationBookingRequest("reserva pra gente"), true);
      assert.equal(isReservationBookingRequest("como faco pra reservar?"), true);
    });
  });
});
