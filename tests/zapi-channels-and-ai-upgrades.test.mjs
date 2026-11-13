import test from "node:test";
import assert from "node:assert/strict";
import {
  VALID_ZAPI_CHANNEL_IDS,
  DEFAULT_ZAPI_CHANNELS,
  ensureZapiChannels,
  evaluateZapiChannelPolicy
} from "../scripts/zapi-service.mjs";
import {
  DEFAULT_AI_CONFIG,
  getWhatsAppAiConfig,
  saveDeveloperGuideline,
  buildDynamicSystemInstruction,
  applyToneFormatting,
  executeConversationalBookingStep,
  processAiInboundMessage
} from "../scripts/whatsapp-ai-service.mjs";

test("R1: 7 Canais Independentes Z-API — Inicialização, Isolamento, Whitelist, Blacklist e Redirecionamento de Teste", () => {
  assert.equal(VALID_ZAPI_CHANNEL_IDS.length, 7);
  assert.deepEqual(VALID_ZAPI_CHANNEL_IDS, [
    "guest_schedule",
    "ai_agent",
    "maids",
    "service_providers",
    "reception",
    "stay_operations",
    "transactional_chat"
  ]);

  const zapiConfig = {
    enabled: true,
    testModeOnly: true,
    testAllowedPhones: "22998505276, 21997142513"
  };
  const channels = ensureZapiChannels(zapiConfig);

  // Verifica estado inicial padrão dos 7 canais
  assert.equal(channels.guest_schedule.enabled, true);
  assert.equal(channels.guest_schedule.testMode, true);
  assert.equal(channels.ai_agent.enabled, true);
  assert.equal(channels.ai_agent.testMode, true);
  assert.equal(channels.maids.enabled, true);
  assert.equal(channels.maids.testMode, false); // Camareiras em Produção por padrão!
  assert.equal(channels.service_providers.enabled, true);
  assert.equal(channels.service_providers.testMode, false);

  // 1. Camareira real recebe normalmente mesmo com guest_schedule e ai_agent em Modo Teste!
  const maidEvalProd = evaluateZapiChannelPolicy({
    config: zapiConfig,
    channelId: "maids",
    phone: "22988887777"
  });
  assert.equal(maidEvalProd.allowed, true);
  assert.equal(maidEvalProd.redirected, false);
  assert.equal(maidEvalProd.effectivePhone, "5522988887777");

  // 2. Hóspede real fora da Whitelist da Régua (guest_schedule) é bloqueado em Modo Teste
  const guestEvalBlocked = evaluateZapiChannelPolicy({
    config: zapiConfig,
    channelId: "guest_schedule",
    phone: "11977776666"
  });
  assert.equal(guestEvalBlocked.allowed, false);
  assert.equal(guestEvalBlocked.reasonCode, "not_in_whitelist");
  assert.equal(guestEvalBlocked.blockedByWhitelist, true);

  // 3. Hóspede na Whitelist da Régua (22998505276) é permitido
  const guestEvalAllowed = evaluateZapiChannelPolicy({
    config: zapiConfig,
    channelId: "guest_schedule",
    phone: "5522998505276"
  });
  assert.equal(guestEvalAllowed.allowed, true);
  assert.equal(guestEvalAllowed.redirected, false);

  // 4. Quando o canal de Camareiras (maids) é colocado em Modo Teste com redirectToWhitelistOnTest=true,
  // a mensagem para a camareira real (22988887777) NÃO vai para ela: é redirecionada para 22998505276 com cabeçalho!
  zapiConfig.channels.maids.testMode = true;
  zapiConfig.channels.maids.redirectToWhitelistOnTest = true;
  const maidEvalRedirect = evaluateZapiChannelPolicy({
    config: zapiConfig,
    channelId: "maids",
    phone: "22988887777",
    message: "Resumo de limpeza do dia: Flat 408 e 508."
  });
  assert.equal(maidEvalRedirect.allowed, true);
  assert.equal(maidEvalRedirect.redirected, true);
  assert.equal(maidEvalRedirect.effectivePhone, "5522998505276");
  assert.equal(maidEvalRedirect.originalPhone, "5522988887777");
  assert.match(maidEvalRedirect.effectiveMessage, /🧪 \*\[MODO TESTE • Canal: (?:🧹 )?Camareiras — Limpeza & Extrato\]\*/);
  assert.match(maidEvalRedirect.effectiveMessage, /📍 \*Destinatário original:\*.*98888-?7777/);
  assert.match(maidEvalRedirect.effectiveMessage, /Resumo de limpeza do dia: Flat 408 e 508\./);

  // 5. Blacklist bloqueia mesmo em Produção
  zapiConfig.channels.service_providers.testMode = false;
  zapiConfig.channels.service_providers.blacklist = ["22911112222"];
  const providerBlacklisted = evaluateZapiChannelPolicy({
    config: zapiConfig,
    channelId: "service_providers",
    phone: "5522911112222"
  });
  assert.equal(providerBlacklisted.allowed, false);
  assert.equal(providerBlacklisted.reasonCode, "blacklisted");
  assert.equal(providerBlacklisted.blockedByBlacklist, true);
});

test("R1.2: Independência entre Modo Teste da IA (ai_agent) e Modo Teste da Régua (guest_schedule)", async () => {
  const db = {
    zapiConfig: {
      enabled: true,
      testModeOnly: false // Régua de hóspedes em Produção
    },
    whatsappConversations: [],
    reservations: [],
    flats: [{ id: 408, number: "408", name: "Flat 408" }]
  };
  ensureZapiChannels(db.zapiConfig);
  // Régua em produção, mas IA em Modo Teste restrito à Whitelist (22998505276)
  db.zapiConfig.channels.guest_schedule.testMode = false;
  db.zapiConfig.channels.ai_agent.testMode = true;
  db.zapiConfig.channels.ai_agent.whitelist = ["22998505276"];

  // Número fora da Whitelist da IA deve ser ignorado pela Sofia mesmo com testModeOnly=false na régua!
  const blockedInbound = await processAiInboundMessage({
    db,
    incomingInfo: { fromMe: false, isGroup: false, text: "Olá, tudo bem?", senderName: "Visitante" },
    cleanTarget: "5511988887777",
    sendZapiMessage: async () => ({ sent: true })
  });
  assert.equal(blockedInbound.skipped, true);
  assert.equal(blockedInbound.reason, "test_mode_not_allowed");
});

test("R2: Listagem Completa e Precisa de Flats Disponíveis (Sem truncamento .slice(0,6), Ordenação Numérica e Exclusão de Check-out Concluído)", async () => {
  const db = {
    zapiConfig: { enabled: true },
    botActionsSettings: {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        createPreReservation: true
      }
    },
    flats: [
      { id: 1105, number: "1105" },
      { id: 306, number: "306" },
      { id: 308, number: "308" },
      { id: 408, number: "408" },
      { id: 508, number: "508" },
      { id: 602, number: "602" },
      { id: 605, number: "605" },
      { id: 808, number: "808" },
      { id: 905, number: "905" }
    ],
    reservations: [
      // Reserva com check-out JÁ CONCLUÍDO para o período -> NÃO deve bloquear o Flat 408!
      {
        id: "RES-CHECKED-OUT",
        flatId: 408,
        flatNumber: "408",
        roomNumber: "408",
        checkinDate: "2026-10-19",
        checkoutDate: "2026-10-21",
        status: "checked_out",
        checkedOut: true
      },
      // Reserva ativa ocupando o Flat 508 -> DEVE bloquear apenas o Flat 508
      {
        id: "RES-ACTIVE",
        flatId: 508,
        flatNumber: "508",
        roomNumber: "508",
        checkinDate: "2026-10-19",
        checkoutDate: "2026-10-21",
        status: "confirmada"
      }
    ],
    roomBlocks: [],
    preReservations: []
  };

  const step = await executeConversationalBookingStep({
    db,
    phone: "5522998505276",
    messageText: "Quais flats estão disponíveis de 19/10/2026 a 21/10/2026 para 1 pessoa?",
    history: []
  });

  assert.equal(step.handled, true);
  // Deve conter todos os 8 flats livres (306, 308, 408, 602, 605, 808, 905, 1105) — sem cortar em 6!
  assert.match(step.replyText, /306, 308, 408, 602, 605, 808, 905, 1105/);
  assert.doesNotMatch(step.replyText, /\b508\b/);
});

test("R3 & R4: Modelo Padrão Gemini 2.5 Pro e Central de Diretrizes Estilo WhatsApp Business AI (4 Categorias + Tratamento Formal Sr./Sra.)", () => {
  assert.equal(DEFAULT_AI_CONFIG.preferredModel, "gemini-2.5-pro");

  const db = {
    zapiConfig: {},
    whatsappAiSettings: { developerGuidelines: [] }
  };
  const aiConfig = getWhatsAppAiConfig(db);
  assert.equal(aiConfig.preferredModel, "gemini-2.5-pro");

  // Salva diretrizes nas 4 categorias estruturadas do WhatsApp Business AI
  const gAlways = saveDeveloperGuideline(db, {
    rule: "Sempre informar que o estacionamento é gratuito para 1 veículo.",
    category: "always_do",
    source: "manual"
  });
  const gNever = saveDeveloperGuideline(db, {
    rule: "Nunca prometer serviço de quarto ou restaurante presencial.",
    category: "never_do",
    source: "manual"
  });
  const gPersona = saveDeveloperGuideline(db, {
    rule: "Sempre chamar os hóspedes pelo nome precedido de Sr. ou Sra. (ex: Sr. Miller, Sra. Ana).",
    category: "persona_treatment",
    source: "manual"
  });
  const gFactual = saveDeveloperGuideline(db, {
    rule: "O flat 905 possui cafeteira Nespresso.",
    category: "factual",
    source: "manual"
  });

  assert.equal(gAlways.category, "always_do");
  assert.equal(gNever.category, "never_do");
  assert.equal(gPersona.category, "persona_treatment");
  assert.equal(gFactual.category, "factual");

  // Verifica que o prompt dinâmico contém os 4 blocos estruturados
  const promptObj = buildDynamicSystemInstruction(aiConfig, db, {
    matched: true,
    guestName: "Miller",
    stayStatus: "em_estadia"
  });

  assert.match(promptObj.guidelinesSection, /✅ SEMPRE FAZER \(OBRIGATÓRIO EM TODA RESPOSTA\)/);
  assert.match(promptObj.guidelinesSection, /🚫 NUNCA FAZER \(PROIBIÇÃO ESTRITA\)/);
  assert.match(promptObj.guidelinesSection, /🎩 TRATAMENTO & POSTURA COM O CLIENTE/);
  assert.match(promptObj.guidelinesSection, /📌 REGRAS DE NEGÓCIO & DIRETRIZES APRENDIDAS/);

  // Verifica aplicação determinística do vocativo Sr./Sra. em applyToneFormatting quando a diretriz está ativa
  const formatted = applyToneFormatting("Olá, Miller! Tudo bem? Como posso ajudar hoje?", db, {
    guestName: "Miller"
  });
  assert.match(formatted, /Sr\. Miller/);

  // Se desativarmos a diretriz de tratamento formal, não força mais o prefixo Sr.
  gPersona.enabled = false;
  gPersona.active = false;
  const formattedAfterDisable = applyToneFormatting("Olá, Miller! Tudo bem? Como posso ajudar hoje?", db, {
    guestName: "Miller"
  });
  assert.doesNotMatch(formattedAfterDisable, /Sr\. Miller/);
});
