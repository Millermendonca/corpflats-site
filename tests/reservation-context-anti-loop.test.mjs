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
  parseNaturalDatesFromText,
  extractConversationState,
  executeConversationalBookingStep,
  callGeminiAi,
  buildGeminiTools,
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

  describe("10. Extração de Datas Naturais e Estado Conversacional Multi-Turn (parseNaturalDatesFromText & extractConversationState)", () => {
    it("interpreta formatos variados de datas em português com precisão", () => {
      const d1 = parseNaturalDatesFromText("do dia 10 ao dia 15 de novembro para 2 pessoas", "2026-10-14");
      assert.ok(d1);
      assert.equal(d1.checkIn, "2026-11-10");
      assert.equal(d1.checkOut, "2026-11-15");
      assert.equal(d1.nights, 5);
      assert.equal(d1.displayCheckIn, "10/11");
      assert.equal(d1.displayCheckOut, "15/11");

      const d2 = parseNaturalDatesFromText("de 20/11 a 23/11", "2026-10-14");
      assert.ok(d2);
      assert.equal(d2.checkIn, "2026-11-20");
      assert.equal(d2.checkOut, "2026-11-23");
      assert.equal(d2.nights, 3);

      const d3 = parseNaturalDatesFromText("de 10 a 12/11/2026", "2026-10-14");
      assert.ok(d3);
      assert.equal(d3.checkIn, "2026-11-10");
      assert.equal(d3.checkOut, "2026-11-12");
      assert.equal(d3.nights, 2);

      // Datas relativas ("amanhã por 2 diárias", "de hoje até depois de amanhã", "de amanhã até depois de amanhã")
      const dTomorrow = parseNaturalDatesFromText("quero reservar amanhã por 2 diárias", "2026-10-14");
      assert.ok(dTomorrow);
      assert.equal(dTomorrow.checkIn, "2026-10-15");
      assert.equal(dTomorrow.checkOut, "2026-10-17");
      assert.equal(dTomorrow.nights, 2);

      const dTodayToAfterTomorrow = parseNaturalDatesFromText("de hoje até depois de amanhã", "2026-10-14");
      assert.ok(dTodayToAfterTomorrow);
      assert.equal(dTodayToAfterTomorrow.checkIn, "2026-10-14");
      assert.equal(dTodayToAfterTomorrow.checkOut, "2026-10-16");
      assert.equal(dTodayToAfterTomorrow.nights, 2);

      // Dias da semana e fim de semana ("de sexta a domingo" a partir de quarta-feira 2026-10-14 -> 16/10 a 18/10)
      const dWeekdays = parseNaturalDatesFromText("quero reservar de sexta a domingo", "2026-10-14");
      assert.ok(dWeekdays);
      assert.equal(dWeekdays.checkIn, "2026-10-16");
      assert.equal(dWeekdays.checkOut, "2026-10-18");
      assert.equal(dWeekdays.nights, 2);

      const dWeekend = parseNaturalDatesFromText("tem vaga para este fim de semana?", "2026-10-14");
      assert.ok(dWeekend);
      assert.equal(dWeekend.checkIn, "2026-10-16");
      assert.equal(dWeekend.checkOut, "2026-10-18");
      assert.equal(dWeekend.nights, 2);

      // Formato com dois-pontos e vírgula ("check-in: 10/11, check-out: 15/11")
      const dColon = parseNaturalDatesFromText("check-in: 10/11, check-out: 15/11", "2026-10-14");
      assert.ok(dColon);
      assert.equal(dColon.checkIn, "2026-11-10");
      assert.equal(dColon.checkOut, "2026-11-15");

      // Não gera falso positivo para número de pessoas ou horários
      assert.equal(parseNaturalDatesFromText("para 2 pessoas com café", "2026-10-14"), null);
      assert.equal(parseNaturalDatesFromText("das 05:00 às 09:30", "2026-10-14"), null);
    });

    it("acumula contexto de múltiplos turnos (datas, hóspedes, café e intenção de reserva)", () => {
      const history = [
        { fromMe: true, text: quoteMessage },
        { fromMe: false, text: "para 2 pessoas" },
        { fromMe: true, text: "Perfeito, Miller! Anotei para 2 pessoas (casal)." },
        { fromMe: false, text: "quero com café" },
        { fromMe: true, text: "Excelente escolha, Miller! Anotei com café da manhã." }
      ];

      const state = extractConversationState("de 10/11 a 13/11, reserva pra mim por favor", history, { guestName: "Miller", phone: "5522998505276", todayStr: "2026-10-14" }, mockDb);
      assert.equal(state.hasDates, true);
      assert.equal(state.checkIn, "2026-11-10");
      assert.equal(state.checkOut, "2026-11-13");
      assert.equal(state.nights, 3);
      assert.equal(state.guests, 2);
      assert.equal(state.guestsExplicit, true);
      assert.equal(state.breakfastPreference, "with_breakfast");
      assert.equal(state.ratePlan, "with_breakfast");
      assert.equal(state.wantsToBook, true);
    });
  });

  describe("11. Integração Real com Ferramentas do PMS em Fluxo Multi-Turn", () => {
    it("Fluxo A: Usuário pede 'reserva pra mim por favor' -> Sofia pede datas -> Usuário envia datas -> Sofia cria pré-reserva real com PIX no PMS", async () => {
      const convHistory = [...mockDb.whatsappConversations[0].messages];

      // Turno 1: Usuário pede para reservar sem informar datas ainda
      const turn1 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "reserva pra mim por favor",
        history: convHistory
      });
      assert.match(turn1.replyText, /datas?\s+(?:de\s+)?entrada/i);
      assert.equal(mockDb.reservations.length, 0);

      convHistory.push({ fromMe: false, text: "reserva pra mim por favor" });
      convHistory.push({ fromMe: true, text: turn1.replyText });

      // Turno 2: Usuário fornece as datas e quantidade de pessoas
      const turn2 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "do dia 10 ao dia 15 de novembro para 2 pessoas",
        history: convHistory
      });

      // Deve ter criado a pré-reserva real no banco com código CF- e PIX Copia e Cola
      assert.equal(mockDb.reservations.length, 1, "Deve criar exatamente 1 pré-reserva em db.reservations");
      const createdRes = mockDb.reservations[0];
      assert.equal(createdRes.status, "pre_reserva");
      assert.equal(createdRes.checkinDate, "2026-11-10");
      assert.equal(createdRes.checkoutDate, "2026-11-15");
      assert.equal(createdRes.guestsCount, 2);
      assert.ok(createdRes.code.startsWith("CF-"));
      assert.ok(createdRes.pixCopiaECola.includes("br.gov.bcb.pix"));

      assert.ok(turn2.replyText.includes(createdRes.code), "A resposta deve informar o código da pré-reserva");
      assert.ok(turn2.replyText.includes(`Flat ${createdRes.flatNumber}`), "A resposta deve informar o flat alocado");
      assert.ok(turn2.replyText.includes(createdRes.pixCopiaECola), "A resposta deve incluir o PIX Copia e Cola");
    });

    it("Fluxo B: Usuário consulta datas primeiro -> Sofia apresenta disponibilidade e orçamento real -> Usuário diz 'reserva pra mim por favor' -> Sofia cria pré-reserva sem pedir datas de novo", async () => {
      const convHistory = [...mockDb.whatsappConversations[0].messages];

      // Turno 1: Usuário informa datas após ver a tabela de preços
      const turn1 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "do dia 10 ao dia 15 de novembro para 2 pessoas",
        history: convHistory
      });

      // Como o usuário ainda não pediu para fechar, Sofia apresenta a disponibilidade real (Flats 101, 204) e o orçamento calculado
      assert.equal(mockDb.reservations.length, 0);
      assert.match(turn1.replyText, /101,\s*204/);
      assert.match(turn1.replyText, /10\/11\s+a\s+15\/11/);
      assert.match(turn1.replyText, /pr[eé]-reserva/i);

      convHistory.push({ fromMe: false, text: "do dia 10 ao dia 15 de novembro para 2 pessoas" });
      convHistory.push({ fromMe: true, text: turn1.replyText });

      // Turno 2: Usuário diz apenas "reserva pra mim por favor" (sem repetir as datas!)
      const turn2 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "reserva pra mim por favor",
        history: convHistory
      });

      // NÃO pode pedir datas novamente; deve usar as datas acumuladas do Turno 1 e criar a pré-reserva!
      assert.equal(/você poderia me informar apenas as datas/i.test(turn2.replyText), false);
      assert.equal(mockDb.reservations.length, 1);
      const createdRes = mockDb.reservations[0];
      assert.equal(createdRes.checkinDate, "2026-11-10");
      assert.equal(createdRes.checkoutDate, "2026-11-15");
      assert.ok(turn2.replyText.includes(createdRes.code));
      assert.ok(turn2.replyText.includes(createdRes.pixCopiaECola));
    });

    it("Fluxo C: Indisponibilidade real no PMS para o período solicitado informa o hóspede com transparência", async () => {
      // Bloqueia ambos os flats (101 e 204) para o período 10/11 a 15/11
      mockDb.reservations.push(
        { id: 1, code: "CF-1", flatId: "flat-101", flatNumber: "101", checkinDate: "2026-11-10", checkoutDate: "2026-11-15", status: "confirmada" },
        { id: 2, code: "CF-2", flatId: "flat-204", flatNumber: "204", checkinDate: "2026-11-10", checkoutDate: "2026-11-15", status: "confirmada" }
      );

      const res = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "quero reservar de 10/11 a 15/11 para 2 pessoas",
        history: mockDb.whatsappConversations[0].messages
      });

      assert.match(res.replyText, /ocupadas\s+nesse\s+per[ií]odo/i);
      assert.match(res.replyText, /outras\s+datas/i);
      assert.equal(mockDb.reservations.length, 2, "Não deve criar pré-reserva quando não há disponibilidade");
    });

    it("Fluxo D: callGeminiAi suporta encadeamento multi-step e chamadas paralelas de Function Calling (checkAvailability + calculateQuote -> createPreReservation)", async () => {
      const originalFetch = globalThis.fetch;
      let stepCallCount = 0;
      const capturedBodies = [];

      try {
        globalThis.fetch = async (url, opts) => {
          if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
            stepCallCount++;
            if (opts?.body) capturedBodies.push(JSON.parse(opts.body));
            if (stepCallCount === 1) {
              // Retorna 2 functionCalls em paralelo no mesmo turno
              return {
                ok: true,
                json: async () => ({
                  candidates: [{
                    content: {
                      role: "model",
                      parts: [
                        {
                          functionCall: {
                            name: "checkAvailability",
                            args: { checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2 }
                          }
                        },
                        {
                          functionCall: {
                            name: "calculateQuote",
                            args: { checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2, flatId: "flat-101", ratePlan: "room_only" }
                          }
                        }
                      ]
                    }
                  }]
                })
              };
            }
            if (stepCallCount === 2) {
              return {
                ok: true,
                json: async () => ({
                  candidates: [{
                    content: {
                      role: "model",
                      parts: [{
                        functionCall: {
                          name: "createPreReservation",
                          args: { flatId: "flat-101", checkIn: "2026-11-10", checkOut: "2026-11-12", guestName: "Miller", guestPhone: "5522998505276", guests: 2 }
                        }
                      }]
                    }
                  }]
                })
              };
            }
            return {
              ok: true,
              json: async () => ({
                candidates: [{
                  content: {
                    role: "model",
                    parts: [{
                      text: `Pronto, Miller! Sua pré-reserva ${mockDb.reservations[0]?.code} no Flat 101 para 10/11 a 12/11 foi gerada! PIX Copia e Cola: ${mockDb.reservations[0]?.pixCopiaECola}`
                    }]
                  }
                }]
              })
            };
          }
          return originalFetch(url, opts);
        };

        const tools = buildGeminiTools(mockDb.botActionsSettings);
        const geminiRes = await callGeminiAi({
          apiKey: "TEST_KEY",
          systemInstruction: "Você é a Sofia da CorpFlats.",
          prompt: "quero reservar de 10/11 a 12/11 para 2 pessoas",
          history: mockDb.whatsappConversations[0].messages,
          db: mockDb,
          tools,
          requesterRole: "guest",
          requesterPhone: "5522998505276"
        });

        assert.equal(geminiRes.ok, true);
        assert.equal(stepCallCount, 3, "Deve ter executado os 2 passos de functionCall + resposta final");
        // No segundo request (após as 2 functionCalls paralelas), a mensagem role: 'function' deve conter 2 functionResponses
        const secondRequestContents = capturedBodies[1].contents;
        const fnTurn = secondRequestContents.find(c => c.role === "function");
        assert.ok(fnTurn);
        assert.equal(fnTurn.parts.length, 2, "Deve enviar 2 functionResponse para corresponder às 2 functionCall paralelas");
        assert.equal(mockDb.reservations.length, 1);
        assert.ok(mockDb.reservations[0].totalAmount > 0, "Deve auto-calcular o total quando omitido em createPreReservation");
        assert.ok(geminiRes.text.includes(mockDb.reservations[0].code));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("Fluxo E: Atualiza pré-reserva ativa em memória quando o hóspede altera plano, datas ou flat preferido mesmo sendo a única unidade livre", async () => {
      // Deixa apenas 1 flat disponível no banco
      mockDb.flats = [
        { id: "flat-101", number: "101", isActive: true, status: "clean", airConditionerType: "split", bedType: "casal", hasMicrowave: true, tags: ["split", "casal"] }
      ];
      const convHistory = mockDb.whatsappConversations[0].messages;

      // Turno 1: Cria pré-reserva sem café (padrão) para 10/11 a 14/11 (4 diárias com sexta-feira -> 237*3 + 272.55 + 70 = 1053.55)
      const turn1 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "quero reservar de 10/11 a 14/11",
        history: convHistory
      });
      assert.equal(mockDb.reservations.length, 1);
      const resCode = mockDb.reservations[0].code;
      assert.equal(mockDb.reservations[0].ratePlan, "room_only");
      assert.equal(mockDb.reservations[0].totalAmount, 1053.55);

      convHistory.push({ fromMe: false, text: "quero reservar de 10/11 a 14/11" });
      convHistory.push({ fromMe: true, text: turn1.replyText });

      // Turno 2: Hóspede pede para alterar para opção com café da manhã para 2 pessoas (casal)
      const turn2 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "quero com café da manhã para 2 pessoas",
        history: convHistory
      });

      // Deve atualizar a MESMA pré-reserva (sem criar duplicata e sem dar falso "indisponível")
      assert.equal(mockDb.reservations.length, 1);
      assert.equal(mockDb.reservations[0].code, resCode);
      assert.equal(mockDb.reservations[0].ratePlan, "with_breakfast");
      assert.equal(mockDb.reservations[0].guestsCount, 2);
      // 4 diárias com café (isento de taxa de limpeza): 983.55 + 35*4 = 1123.55
      assert.equal(mockDb.reservations[0].totalAmount, 1123.55);
      assert.match(turn2.replyText, /1123,55/);
      assert.ok(turn2.replyText.includes(resCode));

      convHistory.push({ fromMe: false, text: "quero com café da manhã para 2 pessoas" });
      convHistory.push({ fromMe: true, text: turn2.replyText });

      // Turno 3: Hóspede muda as datas da pré-reserva para 12/11 a 15/11 (3 diárias sobrepostas ao período anterior)
      const turn3 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "na verdade quero mudar para 12/11 a 15/11",
        history: convHistory
      });

      // Não pode acusar falso "ocupado" por causa da própria pré-reserva nem criar segunda pré-reserva
      assert.equal(mockDb.reservations.length, 1);
      assert.equal(mockDb.reservations[0].code, resCode);
      assert.equal(mockDb.reservations[0].checkinDate, "2026-11-12");
      assert.equal(mockDb.reservations[0].checkoutDate, "2026-11-15");
      assert.match(turn3.replyText, /12\/11\s+a\s+15\/11/);
      assert.ok(turn3.replyText.includes(resCode));
    });

    it("Fluxo F: Confirmação curta ('sim, pode gerar') seguida de ajuste de hóspedes/flat mantém contexto de pré-reserva sem cair em saudação genérica", async () => {
      const convHistory = [];

      // Turno 1: Consulta de disponibilidade
      const t1 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "tem vaga de 10/11 a 12/11?",
        history: convHistory
      });
      assert.equal(mockDb.reservations.length, 0);
      convHistory.push({ fromMe: false, text: "tem vaga de 10/11 a 12/11?" });
      convHistory.push({ fromMe: true, text: t1.replyText });

      // Turno 2: Confirmação curta ("sim, pode gerar")
      const t2 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "sim, pode gerar",
        history: convHistory
      });
      assert.equal(mockDb.reservations.length, 1);
      assert.equal(mockDb.reservations[0].flatNumber, "101");
      convHistory.push({ fromMe: false, text: "sim, pode gerar" });
      convHistory.push({ fromMe: true, text: t2.replyText });

      // Turno 3: Ajuste de preferência de unidade ("prefiro o flat 204")
      const t3 = await generateAiWhatsAppResponse({
        db: mockDb,
        phone: "5522998505276",
        messageText: "prefiro o flat 204",
        history: convHistory
      });
      assert.equal(mockDb.reservations.length, 1);
      assert.equal(mockDb.reservations[0].flatNumber, "204");
      assert.match(t3.replyText, /Flat\s+204/i);
    });
  });
});



