/**
 * CorpFlats / Guest Flow Manager - WhatsApp AI Agent Service
 * 
 * Recursos:
 * - Atuação Híbrida: Respostas autônomas no WhatsApp via Z-API e Copiloto para operadores
 * - Transbordo Humano Inteligente: Pausa automática da IA ao detectar pedido de atendente ou intervenção humana
 * - Reconhecimento de Contexto do Hóspede: Consulta em tempo real de reservas, flats e status de limpeza/liberação
 * - Google Gemini AI com cascata de modelos e Contingência Heurística Local garantida
 * - Function Calling Adaptativo: Chave mestra e ações granulares (checkAvailability, calculateQuote, generatePayment, createPreReservation, commitReservation)
 * - Loop Multi-Turn de Execução de Ferramentas com fallback gracioso e proteção anti-crash
 * - Base de conhecimento rica sobre o CorpFlats (Wi-Fi, garagem, café, horários, localização, comodidades)
 */

import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES, isFaqApplicableToClient, matchClientPhone, generateStaticPixPayload, linkOperatorResponseToPendingFaq, captureOperatorResponseForFaq, isDeveloperPhone, DEVELOPER_PHONES, doesReservationMatchPhone, findAllReservationsByPhone, formatPhoneDisplay, evaluateZapiChannelPolicy, ensureZapiChannels, getReservationRecipients, triggerImmediateWhatsApp } from "./zapi-service.mjs";

export function isNonRequesterGuestForReservation(reservation, senderPhone = "", db = {}) {
  if (!reservation) return false;
  const isB2bOrCorporateHidden =
    String(reservation.channel || "").toLowerCase().includes("b2b") ||
    Boolean(reservation.hideFinancialForGuest) ||
    Boolean(reservation.agencyId) ||
    Boolean(reservation.b2bReservationNumber);
  const recipients = getReservationRecipients(reservation, db);
  if (!recipients.requester?.isDifferentFromGuest && !isB2bOrCorporateHidden) return false;
  const cleanSender = cleanWhatsAppPhone(senderPhone);
  const cleanReq = cleanWhatsAppPhone(recipients.requester?.phone);
  if (cleanSender && cleanReq && matchClientPhone(cleanSender, cleanReq)) {
    return false;
  }
  return true;
}
import { getCheckinUrlSync as getSerproCheckinUrlSync } from "./fnrh-serpro-service.mjs";
import {
  lookupCep,
  lookupCnpj,
  toTitleCase,
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  cleanPhone,
  cleanCep,
  formatCnpj,
  formatCpf,
  formatCep
} from "./lookup.mjs";

export {
  isFaqApplicableToClient,
  matchClientPhone,
  linkOperatorResponseToPendingFaq,
  captureOperatorResponseForFaq,
  isDeveloperPhone,
  DEVELOPER_PHONES,
  doesReservationMatchPhone,
  findAllReservationsByPhone,
  formatPhoneDisplay,
  evaluateZapiChannelPolicy,
  ensureZapiChannels,
  lookupCep,
  lookupCnpj,
  toTitleCase,
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  cleanPhone,
  cleanCep,
  formatCnpj,
  formatCpf,
  formatCep
};

/**
 * Resolução dinâmica e unificada de URL de check-in para o agente de IA WhatsApp
 */
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrlSync === "function") {
    return globalThis.getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrlSync === "function") {
    return getSerproCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  const activeDb = dbInstance || (typeof globalThis.db !== "undefined" ? globalThis.db : null);
  const activeSettings = activeDb?.settings || activeDb || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  if (currentProvider === "gov_fnrh" && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}

export const DEFAULT_AI_CONFIG = {
  enabled: true,
  testMode: true,
  preferredModel: "gemini-2.5-pro",
  mode: "autonomous", // "autonomous" | "copilot" | "off_hours"
  agentName: "Sofia",
  agentRole: "Concierge Virtual CorpFlats",
  responseDelaySeconds: 3,
  offHoursStart: "18:00",
  offHoursEnd: "08:00",
  handoverKeywords: [
    "humano", "atendente", "falar com pessoa", "falar com atendente",
    "gerente", "recepcao", "recepção", "pessoa real", "outro atendente",
    "reclamar", "reclamacao", "reclamação", "cancelar reserva", "cancelamento",
    "falar com alguém", "suporte humano", "atendimento humano"
  ],
  systemPrompt: `Você é a Sofia, concierge virtual inteligente e acolhedora dos flats de alto padrão da CorpFlats no Edifício Soho Residence Service em Campos dos Goytacazes/RJ.
Seu objetivo é encantar os hóspedes, responder dúvidas com precisão e fornecer assistência ágil e atenciosa.

RACIOCÍNIO E DIRETRIZES DE CONVERSAÇÃO:
1. Responda em português brasileiro de forma acolhedora, prestativa e concisa (ideal para leitura dinâmica em telas de celular no WhatsApp).
2. Use emojis amigáveis com moderação (🏨, ✨, 🔑, ☕, 🚗, 🕒, 📍).
3. Postura de Escuta Ativa e Saudação Natural:
- Se o hóspede ou cliente enviou apenas uma saudação inicial (ex: "olá", "oi", "bom dia", "boa tarde", "boa noite", "tudo bem?"): responda com simpatia natural, cumprimente pelo nome se souber e apenas pergunte abertamente como pode ajudar hoje (ex: "Olá, Miller! Tudo bem? Sou a Sofia, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊").
- NUNCA presuma que já sabe do que se trata o contato logo na saudação. Não faça suposições precipitadas nem despeje datas ou status de reserva logo de início sem que o hóspede tenha perguntado.
- NUNCA ofereça ajuda com malas ou bagagens (o condomínio Soho não dispõe de serviço de maleiros/carregadores e essa oferta não condiz com a nossa operação).
4. Uso Contextual do Conhecimento (Sob Demanda):
- Tenha total consciência do CONTEXTO DO HÓSPEDE nos bastidores (número do flat, status da estadia, datas de check-in/out, regras de Wi-Fi, garagem, café, etc., ou a ausência de reserva).
- Use esse conhecimento para formular uma resposta coerente, precisa e personalizada CONFORME O QUE O HÓSPEDE PERGUNTAR.
  * Exemplo: se ele perguntar a senha da internet, use o Flat do contexto para informar a rede e senha daquele quarto.
  * Exemplo: se perguntar sobre horários de saída ou check-in, use os dados da reserva dele.
  * Exemplo: se perguntar "minha reserva está confirmada?", confirme com o número do flat e datas. Se não encontrar reserva para o número, informe com gentileza e peça o nome ou código.
  * Exemplo: se não tiver reserva e perguntar sobre diárias ou flats, apresente as opções da CorpFlats com entusiasmo.
- LÓGICA TEMPORAL DE RESERVA, CHECK-OUT CONCLUÍDO E PRÉ-CHECK-IN DIGITAL:
  * HÓSPEDE COM CHECK-OUT JÁ CONCLUÍDO (checkout_concluido): O hóspede JÁ desocupou o flat e teve seu check-out confirmado (inclusive já tendo recebido a mensagem automática de "Check-out Concluído"). NUNCA diga que hoje é dia de check-out até 12:00h, NUNCA cobre desocupação do quarto e NUNCA envie link de check-out (/checkout/...) ou pré-check-in! Mantenha o histórico da estadia em memória silenciosa: se ele enviar apenas uma saudação ("olá", "bom dia"), apenas cumprimente pelo nome e pergunte como pode ajudar; se perguntar sobre a reserva ou check-out, confirme que o check-out já está concluído e ofereça auxílio (ex: Nota Fiscal, achados e perdidos ou nova reserva).
  * HÓSPEDE COM CHECK-OUT HOJE PENDENTE (checkout_hoje) OU JÁ HOSPEDADO (em_estadia): NUNCA envie link de pré-check-in! Ele já fez check-in há dias e já está no flat.
  * Para CHECK-OUT HOJE PENDENTE (somente quando o hóspede perguntar sobre a reserva ou saída): confirme a reserva, informe que hoje é o dia de check-out (horário limite de desocupação até as 12:00h), oriente sobre os procedimentos de saída, pergunte gentilmente se deseja prorrogar a estadia (solicitar late check-out mediante disponibilidade) ou verifique se já desocupou o flat. Se aplicável, forneça o link de confirmação de check-out. Se ele enviou apenas uma saudação ("olá"), apenas cumprimente e pergunte como pode ajudar sem cobrar check-out.
  * Para EM ESTADIA: informe que ele está acomodado no flat com saída prevista até a data de check-out (até as 12:00h), sem pré-check-in, e ofereça suporte para a estadia em andamento.
  * Para CHECK-IN HOJE ou RESERVA FUTURA: forneça as informações de chegada e o link de Pré-Check-in Digital para agilizar a liberação com a portaria 24h.
5. Cotações, Tarifas e Valores de Diárias (Distinção entre Preço e Logística de Café):
- Quando o hóspede ou cliente perguntar sobre preço, diárias, quanto custa, quanto tá, valores ou cotação (ex: "quanto tá a diária? 1 pessoa com café", "qual o valor da diária com café?", "quanto custa a diária?"):
  * Trate isso ESTRITAMENTE como consulta de COTAÇÃO/TARIFA, NUNCA como uma dúvida operacional sobre entrega de bandeja de café!
  * Apresente os valores das diárias de forma clara, acolhedora e objetiva (ex: diária direta a partir de R$ 237,00 sem café (+ taxa única de limpeza de R$ 70,00); com café da manhã no quarto por apenas R$ 35,00/pessoa adicional, totalizando a partir de R$ 272,00 para 1 pessoa, com o grande benefício de ISENÇÃO TOTAL da taxa de limpeza!).
  * Pergunte para quais datas (entrada e saída) a pessoa deseja se hospedar para consultar a disponibilidade e fornecer o orçamento exato.
5.1. Solicitação de Reserva e Regra Anti-Repetição de Cotação:
- Quando o hóspede solicitar reserva ("reserva pra mim por favor", "quero reservar", "faz uma reserva", "como faço para reservar?", "quero fechar"):
  * Se a cotação/tabela de diárias já foi informada anteriormente ou se o hóspede ainda não especificou as datas de estadia: NUNCA repita a tabela de preços!
  * Acolha o pedido com simpatia e pergunte diretamente pelas datas de check-in, check-out e para quantas pessoas será a estadia (ex: "Com certeza, Miller! Para eu prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out), e para quantas pessoas será a estadia? 🏨✨").
  * Se as operações automáticas de criação de reserva estiverem desativadas: esclareça que a equipe da recepção finalizará a reserva e solicite as datas para adiantar o processo.
  * NUNCA envie respostas idênticas ou repetitivas à mensagem anterior do bot.
6. Seja sempre fidedigna às informações fornecidas no CONTEXTO DO HÓSPEDE e na BASE DE CONHECIMENTO. NUNCA invente números de apartamentos, códigos ou senhas que não constem nos dados oficiais.
7. Se o hóspede solicitar expressamente falar com um atendente humano, transborde o atendimento com gentileza informando que a equipe da recepção assumirá a conversa em instantes.
8. ARQUITETURA EM DUAS VIAS E AUTO-AVALIAÇÃO CRÍTICA OBRIGATÓRIA:
- VIA 1 (Perguntas Genéricas/Institucionais): Responda usando o FAQ ATIVO e a BASE DE CONHECIMENTO oficial (Wi-Fi, localização, horários, regras de pet, fumo, garagem, lazer, comodidades).
- VIA 2 (Leitura do Sistema Operacional): Use as ferramentas autorizadas para consultar dados reais:
  * Tarifas, diárias e valores com ou sem café (getPricingInfo, calculateQuote);
  * Dados e status de reservas (getReservationDetails);
  * Status e higienização de flats/quartos (getFlatStatus);
  * Vagas e disponibilidade para períodos específicos (checkAvailability).
- AUTO-CRÍTICA ANTES DE ENVIAR: Analise criticamente se a sua resposta REALMENTE responde à pergunta feita. Jamais confunda assuntos (se perguntou preço, forneça valores e NUNCA apenas regras de bandeja de café).
- DEMANDAS OPERACIONAIS SEM ACESSO AUTÔNOMO: Se o hóspede solicitar uma ação operacional (cancelamento, alteração de datas, troca de flat, nota fiscal, toalhas extras, chamado de manutenção, itens especiais como berço) ou dados não disponíveis no sistema/FAQ:
  * NÃO invente dados nem dê respostas evasivas;
  * Chame imediatamente a ferramenta recordUnmetDemand para registrar a oportunidade na fila de automação do sistema;
  * Responda de forma acolhedora informando que registrou a solicitação e que a equipe humana da recepção dará seguimento!
9. REGRA ANTI-COPIA-E-COLA & GERAÇÃO MULTITÓPICO CONTEXTUAL:
- NUNCA use respostas prontas, engessadas ou cópia-e-cola de mensagens anteriores.
- Use os fatos e diretrizes aprendidos como base de conhecimento vivo para formular respostas inéditas, humanizadas e personalizadas ao contexto do hóspede.
- Se o hóspede enviar saudações (ex: "bom dia", "boa tarde", "olá"), retribua a saudação cordialmente pelo nome do hóspede.
- Se a mensagem contiver múltiplas dúvidas juntas (ex: horário de checkout + se pode estender a reserva pelo WhatsApp), responda a TODOS os pontos de forma clara, acolhedora e integrada na mesma mensagem.`,
  knowledgeBase: {
    address: "Edifício Soho Residence Service, Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
    checkinTime: "14:00 (Check-in padrão a partir das 14h)",
    checkoutTime: "12:00 (Check-out padrão até às 12h)",
    earlyCheckinPolicy: "Entrada antecipada a partir das 10:00 é um benefício gratuito para reservas diretas (Site ou WhatsApp), ESTRITAMENTE MEDIANTE DISPONIBILIDADE de limpeza prévia do flat pela governança.",
    lateCheckoutPolicy: "Saída após as 12:00 deve ser combinada previamente com a administração e depende de disponibilidade de outros hóspedes.",
    wifiNetwork: "apto {{quarto}} (rede individual por flat com o número do quarto)",
    wifiPassword: "1234567890123",
    breakfastInfo: "O café da manhã é servido exclusivamente via bandeja diretamente no quarto das 05:00 às 09:30, com escolha de itens e agendamento pelo portal /cafe até a véspera. Não há buffet presencial nem restaurante no condomínio. A recepção do condomínio não vende nem gerencia café. Reservas sem café incluso podem solicitar inclusão avulsa com antecedência via WhatsApp da administração CorpFlats.",
    garageInfo: "Garagem rotativa gratuita no condomínio Soho (qualquer vaga livre). É obrigatório cadastrar a placa no Pré-Check-in Digital com antecedência para autorização de entrada na portaria 24h. Comporta veículos normais, SUVs e caminhonetes (altura do portão ~2,10m a 2,20m).",
    petPolicy: "Aceitamos exclusivamente cães (apenas cachorros), máximo de 1 pet até 10kg por apartamento. Custo adicional de R$ 40,00 por dia (diária).",
    smokingPolicy: "Ambiente 100% livre de fumo! É estritamente proibido fumar dentro dos apartamentos e nas áreas fechadas do edifício.",
    amenities: "Flats climatizados (Split), Smart TV, Wi-Fi veloz individual em cada flat, tomadas 127V, ferro de passar disponível (sem tábua), frigobar abastecido com bebidas e snacks em parceria com a Anserve (autoatendimento via PIX/Cartão e 1 kit cortesia com Nespresso e doces por estadia), cozinha com micro-ondas e utensílios, enxoval completo de hotelaria e ducha aquecida.",
    minibarInfo: "Os flats do Soho Residence contam com frigobar abastecido em parceria com a Anserve. O hóspede tem 1 kit de cortesia por estadia (cápsulas Nespresso e doces) e pode consumir bebidas geladas (cervejas, refrigerantes, águas) e snacks com autoatendimento e pagamento via PIX ou Cartão pelo link exclusivo da reserva.",
    leisureInfo: "Piscina/jacuzzi aquecida e academia na cobertura funcionando diariamente das 06:00 às 22:00, exclusivo para hóspedes cadastrados (não é permitida a entrada de visitantes na cobertura e proibido vidro na área molhada).",
    directBookingBenefits: "Melhor tarifa garantida sem taxas de intermediários, prioridade de early check-in a partir das 10h (quando disponível) e suporte direto com a nossa administração.",
    receptionPhone: "5522998505276",
    siteUrl: "https://corpflats.com.br"
  }
};

/**
 * Garante e retorna a configuração do Agente de IA em db.zapiConfig.aiAgent
 */
export function getWhatsAppAiConfig(db) {
  if (!db) return JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
  if (!db.zapiConfig) {
    db.zapiConfig = {};
  }
  if (!db.zapiConfig.aiAgent) {
    const cloned = JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
    cloned.enabled = db.zapiConfig?.channels?.ai_agent?.enabled !== undefined
      ? Boolean(db.zapiConfig.channels.ai_agent.enabled)
      : DEFAULT_AI_CONFIG.enabled;
    cloned.testMode = db.zapiConfig?.channels?.ai_agent?.testMode !== undefined
      ? Boolean(db.zapiConfig.channels.ai_agent.testMode)
      : Boolean(db.zapiConfig?.testModeOnly);
    db.zapiConfig.aiAgent = cloned;
  } else {
    // Mescla campos faltantes
    const current = db.zapiConfig.aiAgent;
    if (current.enabled === undefined) {
      current.enabled = db.zapiConfig?.channels?.ai_agent?.enabled !== undefined
        ? Boolean(db.zapiConfig.channels.ai_agent.enabled)
        : DEFAULT_AI_CONFIG.enabled;
    }
    if (current.testMode === undefined) {
      current.testMode = db.zapiConfig?.channels?.ai_agent?.testMode !== undefined
        ? Boolean(db.zapiConfig.channels.ai_agent.testMode)
        : Boolean(db.zapiConfig?.testModeOnly);
    }
    if (!current.preferredModel) {
      current.preferredModel = db.whatsappAiSettings?.geminiModel || db.settings?.geminiModel || DEFAULT_AI_CONFIG.preferredModel;
    }
    if (!current.mode) current.mode = DEFAULT_AI_CONFIG.mode;
    if (!current.agentName) current.agentName = DEFAULT_AI_CONFIG.agentName;
    if (!current.agentRole) current.agentRole = DEFAULT_AI_CONFIG.agentRole;
    if (current.responseDelaySeconds === undefined) current.responseDelaySeconds = DEFAULT_AI_CONFIG.responseDelaySeconds;
    if (!current.offHoursStart) current.offHoursStart = DEFAULT_AI_CONFIG.offHoursStart;
    if (!current.offHoursEnd) current.offHoursEnd = DEFAULT_AI_CONFIG.offHoursEnd;
    if (!Array.isArray(current.handoverKeywords)) current.handoverKeywords = [...DEFAULT_AI_CONFIG.handoverKeywords];
    if (!current.systemPrompt) current.systemPrompt = DEFAULT_AI_CONFIG.systemPrompt;
    else {
      // Remove menções legadas a bagagens ou presunções antigas de saudação
      if (current.systemPrompt.includes("bagagem") || current.systemPrompt.includes("malas")) {
        current.systemPrompt = current.systemPrompt.replace(/- Se 'checkout_hoje':.*bagagem\./g, "- Se 'checkout_hoje': o hóspede sai hoje (até 12h); responda cordialmente sem assumir perguntas nem oferecer auxílio com malas.");
      }
      if (current.systemPrompt.includes("5.2. Para saudações iniciais")) {
        current.systemPrompt = current.systemPrompt.replace(/5\.2\. Para saudações iniciais.*?(?=6\.|$)/s, `5.2. Postura de Escuta Ativa e Saudação Natural:
- Se o hóspede ou cliente enviou apenas uma saudação inicial (ex: 'olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem?'): responda com simpatia natural, cumprimente pelo nome se souber e apenas pergunte abertamente como pode ajudar hoje (ex: 'Olá, Miller! Tudo bem? Sou a Sofia, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊').
- NUNCA presuma que já sabe do que se trata o contato logo na saudação. Não faça suposições precipitadas nem despeje datas ou status de reserva logo de início sem que o hóspede tenha perguntado.
- NUNCA ofereça ajuda com malas ou bagagens (o condomínio Soho não dispõe de serviço de maleiros/carregadores e essa oferta não condiz com a nossa operação).
- Uso Contextual do Conhecimento (Sob Demanda): Mantenha total consciência do CONTEXTO DO HÓSPEDE nos bastidores (número do flat, status da estadia, datas de check-in/out, regras de Wi-Fi, garagem, café, etc., ou a ausência de reserva). Use esse conhecimento para formular uma resposta coerente, precisa e personalizada CONFORME O QUE O HÓSPEDE PERGUNTAR.\n\n`);
      }
      if (current.systemPrompt.includes("e o link do Pré-Check-in Digital") || current.systemPrompt.includes("5.1. Para perguntas sobre reserva")) {
        current.systemPrompt = current.systemPrompt.replace(/5\.1\. Para perguntas sobre reserva.*?(?=(?:5\.2|6\.|$))/s, `5.1. Lógica Temporal de Reserva e Pré-Check-in Digital:
- Se o hóspede estiver com CHECK-OUT JÁ CONCLUÍDO (checkout_concluido): NUNCA cobre saída até 12h nem envie link de check-out ou pré-check-in!
- Se o hóspede estiver com CHECK-OUT HOJE (checkout_hoje) ou JÁ HOSPEDADO (em_estadia): NUNCA envie link de pré-check-in digital! Ele já realizou check-in há dias e já está no flat.
- Para CHECK-OUT HOJE (quando perguntar sobre a reserva ou saída): confirme a reserva, informe que hoje é o dia de check-out (horário limite de desocupação até as 12:00h), oriente sobre os procedimentos de saída e devolução de chaves, pergunte gentilmente se deseja prorrogar a estadia (solicitar late check-out mediante disponibilidade) ou verifique se já desocupou o flat. Se disponível no contexto, forneça o link de confirmação de check-out.
- Para EM ESTADIA: informe que ele está acomodado no flat com saída prevista até a data de check-out (até as 12:00h), sem pré-check-in, e ofereça suporte para a estadia em andamento.
- Para CHECK-IN HOJE ou RESERVA FUTURA: forneça as informações de chegada e o link de Pré-Check-in Digital para agilizar a liberação com a portaria 24h.
- Se o hóspede NÃO possuir reserva vinculada ao número: informe cordialmente que não localizou reserva ativa ou futura para o número e solicite o nome completo do titular ou código da reserva.\n\n`);
      }
      if (!/l[oó]gica temporal de reserva/i.test(current.systemPrompt)) {
        current.systemPrompt = current.systemPrompt + `\n\n[LÓGICA TEMPORAL DE RESERVA E PRÉ-CHECK-IN DIGITAL]:
- Hóspede com CHECK-OUT JÁ CONCLUÍDO (checkout_concluido): NUNCA cobre desocupação até 12:00h e NUNCA envie link de check-out ou pré-check-in.
- Hóspede com CHECK-OUT HOJE (checkout_hoje) ou JÁ HOSPEDADO (em_estadia): NUNCA envie link de pré-check-in digital!
- Para CHECK-OUT HOJE (quando perguntar sobre reserva/saída): confirme a reserva, informe que hoje é o dia de check-out (horário limite até as 12:00h), pergunte se deseja prorrogar (late check-out) ou se já desocupou o flat, e forneça link de confirmação de check-out.
- Para EM ESTADIA: confirme a permanência e apoie na estadia sem pré-check-in.
- Para CHECK-IN HOJE ou RESERVA FUTURA: envie link de Pré-Check-in Digital.`;
      }
      if (!current.systemPrompt.includes("checkout_concluido")) {
        current.systemPrompt = current.systemPrompt + `\n\n[CICLO DE VIDA DE CHECK-OUT CONCLUÍDO (checkout_concluido)]:
- Quando o status da estadia for 'checkout_concluido' (ou quando o hóspede já tiver recebido a confirmação de 'Check-out Concluído'): o hóspede JÁ DESOCUPOU o flat e encerrou a hospedagem.
- NUNCA envie lembrete cobrando saída até 12:00h e NUNCA envie link de check-out (/checkout/...) nem de pré-check-in.
- Se o hóspede enviar apenas uma saudação ('olá', 'bom dia', 'oi'), responda apenas com a saudação acolhedora pelo nome e pergunte como pode ajudar hoje, mantendo o histórico em memória silenciosa.`;
      }
      if (!current.systemPrompt.includes("Cotações, Tarifas e Valores de Diárias")) {
        current.systemPrompt = current.systemPrompt + `\n\n5. Cotações, Tarifas e Valores de Diárias (Distinção entre Preço e Logística de Café):
- Quando o hóspede ou cliente perguntar sobre preço, diárias, quanto custa, quanto tá, valores ou cotação (ex: "quanto tá a diária? 1 pessoa com café", "qual o valor da diária com café?", "quanto custa a diária?"):
  * Trate isso ESTRITAMENTE como consulta de COTAÇÃO/TARIFA, NUNCA como uma dúvida operacional sobre entrega de bandeja de café!
  * Apresente os valores das diárias de forma clara, acolhedora e objetiva (ex: diária direta a partir de R$ 237,00 sem café (+ taxa única de limpeza de R$ 70,00); com café da manhã no quarto por apenas R$ 35,00/pessoa adicional, totalizando a partir de R$ 272,00 para 1 pessoa, com o grande benefício de ISENÇÃO TOTAL da taxa de limpeza!).
  * Pergunte para quais datas (entrada e saída) a pessoa deseja se hospedar para consultar a disponibilidade e fornecer o orçamento exato.`;
      }
      if (!current.systemPrompt.includes("Solicitação de Reserva e Regra Anti-Repetição de Cotação") && !current.systemPrompt.includes("5.1. Solicitação de Reserva")) {
        current.systemPrompt = current.systemPrompt + `\n\n5.1. Solicitação de Reserva e Regra Anti-Repetição de Cotação:
- Quando o hóspede solicitar reserva ("reserva pra mim por favor", "quero reservar", "faz uma reserva", "como faço para reservar?", "quero fechar"):
  * Se a cotação/tabela de diárias já foi informada anteriormente ou se o hóspede ainda não especificou as datas de estadia: NUNCA repita a tabela de preços!
  * Acolha o pedido com simpatia e pergunte diretamente pelas datas de check-in, check-out e para quantas pessoas será a estadia (ex: "Com certeza, Miller! Para eu prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out), e para quantas pessoas será a estadia? 🏨✨").
  * Se as operações automáticas de criação de reserva estiverem desativadas: esclareça que a equipe da recepção finalizará a reserva e solicite as datas para adiantar o processo.
  * NUNCA envie respostas idênticas ou repetitivas à mensagem anterior do bot.`;
      }
    }
    if (!current.knowledgeBase) current.knowledgeBase = { ...DEFAULT_AI_CONFIG.knowledgeBase };
    for (const [k, v] of Object.entries(DEFAULT_AI_CONFIG.knowledgeBase)) {
      if (current.knowledgeBase[k] === undefined) {
        current.knowledgeBase[k] = v;
      }
    }
    if (current.knowledgeBase.siteUrl && current.knowledgeBase.siteUrl.includes("corpflats.onrender.com")) {
      current.knowledgeBase.siteUrl = "https://corpflats.com.br";
    }
  }
  return db.zapiConfig.aiAgent;
}

/**
 * Normaliza número para dígitos
 */
export function normalizePhone(raw = "") {
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Detecta se a mensagem expressa vontade de falar com atendimento humano
 */
export function detectHandoverIntent(text = "", customKeywords = null) {
  if (!text || typeof text !== "string") return { shouldHandover: false };
  const lower = text.toLowerCase().trim();

  // Expressões diretas comuns de transbordo humano
  const directPatterns = [
    /\b(?:falar|conversar)\s+com\s+(?:um\s+|uma\s+)?(?:humano|pessoa|atendente|algu[eé]m|recep[cç][aã]o|recepcionista|gerente|operador)\b/i,
    /\b(?:passa|transfere|chama|conecta)\s+(?:para|pra|a|ao)?\s*(?:um\s+|uma\s+)?(?:humano|pessoa|atendente|algu[eé]m|recep[cç][aã]o|recepcionista|gerente)\b/i,
    /\b(?:atendente|humano|recepcionista)\s+por\s+favor\b/i,
    /\b(?:quero|preciso)\s+(?:de\s+)?(?:um\s+|uma\s+)?(?:atendente|humano|pessoa|suporte\s+humano)\b/i,
    /\b(?:reclama[cç][aã]o|reclamar|cancelar\s+reserva|cancelamento)\b/i
  ];

  for (const pat of directPatterns) {
    if (pat.test(lower)) {
      return { shouldHandover: true, matchedKeyword: pat.source };
    }
  }

  const keywords = Array.isArray(customKeywords) && customKeywords.length > 0 
    ? customKeywords 
    : DEFAULT_AI_CONFIG.handoverKeywords;

  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    if (lower.includes(k)) {
      return { shouldHandover: true, matchedKeyword: kw };
    }
  }
  return { shouldHandover: false };
}

/**
 * Utilitário Canônico de Fuso Horário de Brasília (America/Sao_Paulo)
 */
export function getBrasiliaDateParts(d = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return {
    todayStr: `${map.year}-${map.month}-${map.day}`,
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    timeStr: `${map.hour}:${map.minute}`
  };
}

/**
 * Retorna os códigos canônicos possíveis de uma reserva (incluindo RES-{flat}-{id pad 4})
 */
function getCanonicalReservationCodes(reservation) {
  if (!reservation || typeof reservation !== "object") return [];
  const codes = new Set();
  const rawCode = String(reservation.code || reservation.reservationCode || "").trim().toLowerCase();
  if (rawCode) codes.add(rawCode);
  const flatNum = reservation.flatNumber ? String(reservation.flatNumber).trim() : "";
  const rawId = reservation.id != null ? String(reservation.id).trim() : "";
  if (flatNum && rawId) {
    codes.add(`res-${flatNum}-${rawId.padStart(4, "0")}`.toLowerCase());
    codes.add(`res-${flatNum}-${rawId}`.toLowerCase());
  }
  return Array.from(codes);
}

/**
 * Verifica se uma reserva já teve o seu check-out concluído/confirmado
 * (via status/flags da reserva, card de limpeza com desocupação confirmada,
 * disparo automático de "Check-out Concluído" em whatsappHistory ou no histórico da conversa).
 */
export function isReservationCheckoutCompleted(reservation, db = null, phone = null, history = []) {
  if (!reservation || typeof reservation !== "object") return false;

  // 1. Status explícito ou flags de conclusão na reserva
  const st = String(reservation.status || "").toLowerCase().trim();
  if (["completed", "checked_out", "checkout_concluido", "finalizada", "concluida", "concluída", "checkout", "encerrada"].includes(st)) {
    return true;
  }
  if (
    reservation.checkoutCompleted === true ||
    reservation.checkoutDone === true ||
    reservation.checkedOut === true ||
    reservation.checkoutConfirmed === true ||
    Boolean(reservation.checkoutAt || reservation.actualCheckoutAt || reservation.checkedOutAt)
  ) {
    return true;
  }

  const canonicalCodes = getCanonicalReservationCodes(reservation);
  const resId = String(reservation.id || "").trim().toLowerCase();
  const flatNum = reservation.flatNumber ? String(reservation.flatNumber).trim() : null;
  const flatId = reservation.flatId ? String(reservation.flatId).trim() : null;
  const cleanP = normalizePhone(phone || reservation.guestPhone || reservation.phone || "");
  const todayStr = getBrasiliaDateParts().todayStr;
  const inDate = String(reservation.checkinDate || "").slice(0, 10);
  const outDate = String(reservation.checkoutDate || "").slice(0, 10);

  // Guarda de ciclo de vida para sinais indiretos (sem vínculo explícito de código/ID da reserva):
  // - Reserva futura (inDate > todayStr) ainda não iniciou
  // - Reserva entrando hoje com saída futura (inDate === todayStr && outDate > todayStr) está iniciando hoje
  const disallowUnlinkedIndirectSignal = Boolean(
    (inDate && inDate > todayStr) ||
    (inDate && outDate && inDate === todayStr && outDate > todayStr)
  );

  // 2. Governança / Card de Limpeza com desocupação explicitamente confirmada na data de saída
  if ((flatNum || flatId) && Array.isArray(db?.cleaningRequests)) {
    const vacantReq = db.cleaningRequests.find(c => {
      if (!c) return false;
      const cResCode = String(c.reservationCode || c.reservationId || "").trim().toLowerCase();
      if (cResCode) {
        const matchesThisRes = canonicalCodes.includes(cResCode) || (resId && cResCode === resId);
        if (!matchesThisRes) return false;
        return c.isVacant === true && (c.isVacantExplicitlySet === true || Boolean(c.vacantSource));
      }
      if (disallowUnlinkedIndirectSignal) return false;
      const sameFlat = (flatNum && String(c.flatNumber) === flatNum) || (flatId && String(c.flatId) === flatId);
      if (!sameFlat) return false;
      const cDate = String(c.requestDate || c.effectiveDate || c.date || "").slice(0, 10);
      const sameDate = !outDate || !cDate || cDate === outDate;
      return sameDate && c.isVacant === true && (c.isVacantExplicitlySet === true || Boolean(c.vacantSource));
    });
    if (vacantReq) {
      return true;
    }
  }

  // 3. Histórico de Disparos Automáticos (db.whatsappHistory)
  if (Array.isArray(db?.whatsappHistory)) {
    const hasCompletedTrigger = db.whatsappHistory.some(h => {
      if (!h) return false;
      const ev = String(h.triggerEvent || h.event || h.templateId || "").toLowerCase();
      const txt = `${h.message || ""} ${h.text || ""} ${h.title || ""} ${h.footer || ""}`;
      const isCheckoutCompletedMsg =
        ev === "checkout_completed" ||
        ev === "on_checkout" ||
        ev === "tpl_checkout_completed" ||
        ev === "tpl_checkout_thanks" ||
        /check-?out\s+conclu[ií]do|confirmamos\s+o\s+seu\s+check-?out|check-?out\s+confirmado/i.test(txt);

      if (!isCheckoutCompletedMsg) return false;

      const hCode = String(h.reservationCode || h.reservationId || "").trim().toLowerCase();
      const txtCodes = (txt.match(/\b(?:res-\d+(?:-\d+)?|cf-\d+)\b/gi) || []).map(s => s.toLowerCase());

      // Match explícito por código ou ID da reserva
      if (hCode && (canonicalCodes.includes(hCode) || (resId && hCode === resId))) return true;
      if (txtCodes.length > 0 && txtCodes.some(tc => canonicalCodes.includes(tc))) return true;

      // Guarda de conflito: se o disparo pertence explicitamente a OUTRA reserva, jamais contamina esta
      if (hCode && (canonicalCodes.length > 0 || resId) && !canonicalCodes.includes(hCode) && (!resId || hCode !== resId)) {
        return false;
      }
      if (txtCodes.length > 0 && canonicalCodes.length > 0 && !txtCodes.some(tc => canonicalCodes.includes(tc))) {
        return false;
      }

      if (disallowUnlinkedIndirectSignal) return false;

      const hDate = String(h.sentAt || h.createdAt || h.timestamp || "").slice(0, 10);
      if (hDate && inDate && hDate < inDate) return false;

      const hPhone = normalizePhone(h.guestPhone || h.phone || h.recipientPhone || h.to || "");
      const phoneMatches = Boolean(hPhone && cleanP && (hPhone.endsWith(cleanP.slice(-8)) || cleanP.endsWith(hPhone.slice(-8))));
      const flatMatches = Boolean(flatNum && (String(h.flatNumber || "") === flatNum || new RegExp(`\\bflat\\s*\\*?${flatNum}\\*?\\b`, "i").test(txt)));

      if (h.flatNumber && flatNum && String(h.flatNumber) !== flatNum) return false;
      const mentionedFlat = txt.match(/\bflat\s*\*?(\d{2,4})\*?\b/i)?.[1];
      if (mentionedFlat && flatNum && String(mentionedFlat) !== flatNum) return false;

      if (phoneMatches || flatMatches) {
        return true;
      }
      return false;
    });
    if (hasCompletedTrigger) return true;
  }

  // 4. Histórico de Mensagens da Conversa (history ou db.whatsappConversations)
  let messagesToInspect = Array.isArray(history) && history.length > 0 ? [...history] : [];
  if (Array.isArray(db?.whatsappConversations) && cleanP) {
    const conv = db.whatsappConversations.find(c => {
      const p = normalizePhone(c?.phone || "");
      return p && (cleanP.endsWith(p.slice(-8)) || p.endsWith(cleanP.slice(-8)));
    });
    if (Array.isArray(conv?.messages)) {
      messagesToInspect = [...messagesToInspect, ...conv.messages];
    }
  }

  if (messagesToInspect.length > 0) {
    const hasCheckoutMsgInConv = messagesToInspect.some(m => {
      if (!m || !m.fromMe) return false;
      const txt = `${m.text || ""} ${m.message || ""} ${m.body || ""} ${m.footer || ""}`;
      const isCheckoutCompletedText =
        /check-?out\s+conclu[ií]do|confirmamos\s+o\s+seu\s+check-?out|registrei\s+a\s+sua\s+comunica[cç][aã]o\s+de\s+check-?out/i.test(txt) ||
        String(m.triggerEvent || m.templateId || "").toLowerCase() === "checkout_completed" ||
        String(m.templateId || "").toLowerCase() === "tpl_checkout_completed";
      if (!isCheckoutCompletedText) return false;

      const mCode = String(m.reservationCode || m.reservationId || "").trim().toLowerCase();
      const txtCodes = (txt.match(/\b(?:res-\d+(?:-\d+)?|cf-\d+)\b/gi) || []).map(s => s.toLowerCase());

      if (mCode && (canonicalCodes.includes(mCode) || (resId && mCode === resId))) return true;
      if (txtCodes.length > 0 && txtCodes.some(tc => canonicalCodes.includes(tc))) return true;

      if (mCode && (canonicalCodes.length > 0 || resId) && !canonicalCodes.includes(mCode) && (!resId || mCode !== resId)) {
        return false;
      }
      if (txtCodes.length > 0 && canonicalCodes.length > 0 && !txtCodes.some(tc => canonicalCodes.includes(tc))) {
        return false;
      }

      const mentionedFlat = txt.match(/\bflat\s*\*?(\d{2,4})\*?\b/i)?.[1];
      if (mentionedFlat && flatNum && String(mentionedFlat) !== flatNum) return false;

      if (disallowUnlinkedIndirectSignal) return false;

      const mDate = String(m.timestamp || m.createdAt || "").slice(0, 10);
      if (mDate && inDate && mDate < inDate) return false;

      return true;
    });
    if (hasCheckoutMsgInConv) return true;
  }

  return false;
}

/**
 * Coleta os disparos automáticos recentes enviados para o hóspede
 * (ex: Check-out Concluído, Lembrete de Check-out, Quarto Pronto, Confirmação de Reserva)
 */
export function getRecentAutomatedTriggers(db = null, phone = null, history = [], reservation = null) {
  const cleanP = normalizePhone(phone || reservation?.guestPhone || reservation?.phone || "");
  const canonicalCodes = getCanonicalReservationCodes(reservation);
  const resId = String(reservation?.id || "").trim().toLowerCase();
  const triggers = [];

  if (Array.isArray(db?.whatsappHistory)) {
    for (const h of db.whatsappHistory.slice(-15)) {
      if (!h) continue;
      const hPhone = normalizePhone(h.guestPhone || h.phone || h.recipientPhone || h.to || "");
      const hCode = String(h.reservationCode || h.reservationId || "").trim().toLowerCase();
      const phoneMatches = Boolean(hPhone && cleanP && (hPhone.endsWith(cleanP.slice(-8)) || cleanP.endsWith(hPhone.slice(-8))));
      const codeMatches = Boolean(hCode && (canonicalCodes.includes(hCode) || (resId && hCode === resId)));
      if (!phoneMatches && !codeMatches) continue;

      triggers.push({
        triggerEvent: h.triggerEvent || h.event || h.templateId || "automated_message",
        title: h.title || h.footer || h.triggerEvent || "Notificação Automática",
        sentAt: h.sentAt || h.createdAt || h.timestamp || null,
        summary: String(h.message || h.text || "").split("\n").slice(0, 2).join(" ").trim()
      });
    }
  }

  let msgs = Array.isArray(history) ? [...history] : [];
  if (msgs.length === 0 && Array.isArray(db?.whatsappConversations) && cleanP) {
    const conv = db.whatsappConversations.find(c => {
      const p = normalizePhone(c?.phone || "");
      return p && (cleanP.endsWith(p.slice(-8)) || p.endsWith(cleanP.slice(-8)));
    });
    if (Array.isArray(conv?.messages)) msgs = conv.messages;
  }

  for (const m of msgs.slice(-10)) {
    if (!m || !m.fromMe) continue;
    const txt = `${m.text || ""} ${m.message || ""} ${m.footer || ""}`;
    if (/check-?out\s+conclu[ií]do|confirmamos\s+o\s+seu\s+check-?out/i.test(txt)) {
      if (!triggers.some(t => t.triggerEvent === "checkout_completed")) {
        triggers.push({
          triggerEvent: "checkout_completed",
          title: "CorpFlats • Check-out Concluído",
          sentAt: m.timestamp || m.createdAt || null,
          summary: "Check-out confirmado e agradecimentos enviados ao hóspede."
        });
      }
    } else if (/seu\s+flat\s+est[aá]\s+pronto|limpo\s+e\s+liberado/i.test(txt)) {
      if (!triggers.some(t => t.triggerEvent === "room_ready")) {
        triggers.push({
          triggerEvent: "room_ready",
          title: "CorpFlats • Quarto Pronto e Liberado",
          sentAt: m.timestamp || m.createdAt || null,
          summary: "Aviso de quarto limpo e liberado enviado ao hóspede."
        });
      }
    }
  }

  return triggers;
}

/**
 * Constrói o contexto em tempo real do hóspede consultando reservas, flats e governança
 */
export function buildGuestContext(dbOrOptions, phoneArg, nowArg) {
  let db = dbOrOptions;
  let phone = phoneArg;
  let now = nowArg || new Date();
  let passedHistory = [];

  if (dbOrOptions && typeof dbOrOptions === "object" && ("db" in dbOrOptions || "cleanPhone" in dbOrOptions || "phone" in dbOrOptions)) {
    db = dbOrOptions.db || null;
    phone = dbOrOptions.cleanPhone || dbOrOptions.phone || null;
    if (dbOrOptions.now) now = dbOrOptions.now;
    if (Array.isArray(dbOrOptions.history)) passedHistory = dbOrOptions.history;
  }

  const cleanPhone = normalizePhone(phone);
  const { todayStr, timeStr } = getBrasiliaDateParts(now);

  // 0. Localiza conversa de WhatsApp para inspecionar nome e histórico de mensagens
  let convRecord = null;
  if (Array.isArray(db?.whatsappConversations) && cleanPhone) {
    convRecord = db.whatsappConversations.find(c => {
      const p = normalizePhone(c.phone || "");
      return p && (cleanPhone.endsWith(p.slice(-8)) || p.endsWith(cleanPhone.slice(-8)));
    });
  }
  const convMessages = passedHistory.length > 0
    ? passedHistory
    : (Array.isArray(convRecord?.messages) ? convRecord.messages : []);

  let matchedReservation = null;
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

  // 1. Busca reserva que coincida com o telefone (prioriza ativa hoje não-encerrada, depois futura confirmada, depois check-out concluído hoje, depois passada)
  if (cleanPhone) {
    const allMatching = typeof findAllReservationsByPhone === "function"
      ? findAllReservationsByPhone(db, cleanPhone)
      : reservations.filter(r => {
          if (!r) return false;
          const rPhone = normalizePhone(r.guestPhone || r.phone || "");
          const reqPhone = normalizePhone(r.requesterInfo?.phone || r.requesterInfo?.whatsapp || r.requesterPhone || "");
          return (rPhone && (cleanPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(cleanPhone.slice(-8)))) ||
                 (reqPhone && (cleanPhone.endsWith(reqPhone.slice(-8)) || reqPhone.endsWith(cleanPhone.slice(-8))));
        });

    const nonCancelled = allMatching.filter(r => r && r.status !== "cancelada" && r.status !== "cancelled");

    const todayMatches = nonCancelled.filter(r =>
      (r.checkinDate === todayStr || r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr))
    );

    // 1.1 Prioriza reserva ativa hoje cujo check-out AINDA NÃO foi concluído
    matchedReservation = todayMatches.find(r => !isReservationCheckoutCompleted(r, db, cleanPhone, convMessages)) || null;

    // 1.2 Se não está em estadia ativa hoje, procura reserva futura confirmada (ordenada pela data de check-in mais próxima)
    if (!matchedReservation) {
      const futureCandidates = nonCancelled
        .filter(r => (r.checkinDate || "") > todayStr && !isReservationCheckoutCompleted(r, db, cleanPhone, convMessages))
        .sort((a, b) => (a.checkinDate || "").localeCompare(b.checkinDate || ""));
      if (futureCandidates.length > 0) {
        matchedReservation = futureCandidates[0];
      }
    }

    // 1.25 Se não há futura nem ativa pendente, verifica reserva de hoje que já teve check-out concluído
    if (!matchedReservation && todayMatches.length > 0) {
      matchedReservation = todayMatches[0];
    }

    // 1.3 Se não há futura nem de hoje, pega a passada mais recente
    if (!matchedReservation && nonCancelled.length > 0) {
      const pastCandidates = nonCancelled
        .sort((a, b) => (b.checkoutDate || b.checkinDate || "").localeCompare(a.checkoutDate || a.checkinDate || ""));
      matchedReservation = pastCandidates[0];
    }
  }

  // 2. Busca cadastro de hóspede
  let guestRecord = null;
  if (Array.isArray(db?.guests) && cleanPhone) {
    guestRecord = db.guests.find(g => {
      const gPhone = normalizePhone(g.phone || g.whatsapp || "");
      return gPhone && (cleanPhone.endsWith(gPhone.slice(-8)) || gPhone.endsWith(cleanPhone.slice(-8)));
    });
  }

  const convName = (convRecord?.name && convRecord.name.trim() !== "Hóspede") ? convRecord.name.trim() : null;

  // 3. Monta resumo do hóspede
  const guestName = matchedReservation?.guestName || guestRecord?.name || convName || null;

  let stayStatus = "sem_reserva_ativa";
  let flatNumber = matchedReservation?.flatNumber || null;
  let flatId = matchedReservation?.flatId || null;
  let cleaningStatus = "desconhecido";
  let isRoomReady = false;
  let isCheckoutCompleted = false;

  if (matchedReservation) {
    const checkin = matchedReservation.checkinDate;
    const checkout = matchedReservation.checkoutDate;
    isCheckoutCompleted = isReservationCheckoutCompleted(matchedReservation, db, cleanPhone, convMessages);

    if (isCheckoutCompleted) {
      stayStatus = (checkout >= todayStr || checkin === todayStr) ? "checkout_concluido" : "estadia_passada";
    } else if (checkin === todayStr) {
      stayStatus = "checkin_hoje";
    } else if (checkout === todayStr) {
      stayStatus = "checkout_hoje";
    } else if (checkin < todayStr && checkout > todayStr) {
      stayStatus = "em_estadia";
    } else if (checkin > todayStr) {
      stayStatus = "reserva_futura";
    } else {
      stayStatus = "estadia_passada";
    }

    // Consulta governança se for check-in hoje ou em estadia
    if (flatNumber && Array.isArray(db?.cleaningRequests)) {
      const cleanReq = db.cleaningRequests.find(c => 
        (String(c.flatNumber) === String(flatNumber) || c.flatId === flatId) &&
        (c.requestDate === todayStr || c.effectiveDate === todayStr)
      );
      if (cleanReq) {
        cleaningStatus = cleanReq.status || "pendente";
        isRoomReady = cleanReq.status === "clean" || cleanReq.completedAt != null;
      } else {
        // Se não há chamado de limpeza hoje, verifica status do flat
        const flatObj = (db?.flats || []).find(f => String(f.number) === String(flatNumber) || f.id === flatId);
        if (flatObj && flatObj.status === "clean") {
          cleaningStatus = "clean";
          isRoomReady = true;
        }
      }
    }
  }

  const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
  const rawCheckinUrl = matchedReservation ? getCheckinUrlSync(matchedReservation, 1, appOrigin, db) : null;
  const isCheckinRelevant = !isCheckoutCompleted && (stayStatus === "checkin_hoje" || stayStatus === "reserva_futura");
  const isCheckoutDay = !isCheckoutCompleted && stayStatus === "checkout_hoje";
  const isHosted = !isCheckoutCompleted && (stayStatus === "em_estadia" || isCheckoutDay);
  const canonicalResCode = matchedReservation
    ? (matchedReservation.code || matchedReservation.reservationCode || (flatNumber && matchedReservation.id != null ? `RES-${flatNumber}-${String(matchedReservation.id).padStart(4, "0")}` : `RES-${flatNumber}`))
    : null;
  const checkoutUrl = (matchedReservation && !isCheckoutCompleted && stayStatus !== "estadia_passada")
    ? `${appOrigin}/checkout/${canonicalResCode}`
    : null;
  const minibarUrl = (matchedReservation && canonicalResCode)
    ? `${appOrigin}/minha-reserva/${canonicalResCode}/frigobar`
    : null;
  const checkinUrl = isCheckinRelevant ? rawCheckinUrl : null;
  const recentTriggers = getRecentAutomatedTriggers(db, cleanPhone, convMessages, matchedReservation);
  const hideFinancialForGuest = matchedReservation ? isNonRequesterGuestForReservation(matchedReservation, cleanPhone, db) : false;
  const recipientsInfo = matchedReservation ? getReservationRecipients(matchedReservation, db) : null;
  const requesterName = recipientsInfo?.requester?.isDifferentFromGuest ? recipientsInfo.requester.name : null;

  return {
    todayStr,
    timeStr,
    phone: cleanPhone,
    guestName,
    reservationCode: canonicalResCode,
    hideFinancialForGuest,
    requesterName,
    hasReservation: Boolean(matchedReservation && matchedReservation.status !== "cancelada" && matchedReservation.status !== "cancelled" && stayStatus !== "estadia_passada"),
    checkinUrl,
    rawCheckinUrl,
    checkoutUrl,
    minibarUrl,
    minibarInfo: "Frigobar abastecido com autoatendimento Anserve e 1 kit cortesia por estadia (cápsulas Nespresso e doces).",
    isCheckinRelevant,
    isCheckoutDay,
    isCheckoutCompleted,
    isHosted,
    recentTriggers,
    reservation: matchedReservation ? {
      code: canonicalResCode,
      guestName: matchedReservation.guestName,
      checkinDate: matchedReservation.checkinDate,
      checkoutDate: matchedReservation.checkoutDate,
      flatNumber: matchedReservation.flatNumber,
      status: matchedReservation.status,
      paymentStatus: hideFinancialForGuest ? undefined : matchedReservation.paymentStatus,
      channel: matchedReservation.channel,
      totalAmount: hideFinancialForGuest ? undefined : matchedReservation.totalAmount,
      hideFinancialForGuest,
      requesterName,
      checkinUrl,
      rawCheckinUrl,
      checkoutUrl,
      minibarUrl,
      isCheckinRelevant,
      isCheckoutDay,
      isCheckoutCompleted,
      isHosted,
      stayStatus
    } : null,
    stayStatus,
    flatNumber,
    cleaningStatus,
    isRoomReady
  };
}

/**
 * Lê e sanitiza as configurações de ações do bot (Chave Mestra e Ações Granulares)
 */
export function getBotActionsSettings(db) {
  if (db?.botActionsSettings) {
    const s = db.botActionsSettings;
    const hasCustomAllowed = s.allowedActions && typeof s.allowedActions === "object";
    return {
      apiActionsEnabled: s.apiActionsEnabled !== false,
      allowedActions: {
        checkAvailability: s.allowedActions?.checkAvailability !== false,
        calculateQuote: s.allowedActions?.calculateQuote !== false,
        generatePayment: s.allowedActions?.generatePayment !== false,
        createPreReservation: s.allowedActions?.createPreReservation !== false,
        commitReservation: s.allowedActions?.commitReservation !== false,
        reallocateReservationFlat: s.allowedActions?.reallocateReservationFlat !== false,
        getFlatAmenities: s.allowedActions?.getFlatAmenities !== false,
        querySystemData: hasCustomAllowed ? s.allowedActions.querySystemData !== false : true,
        getReservationDetails: hasCustomAllowed ? s.allowedActions.getReservationDetails === true : true,
        getFlatStatus: hasCustomAllowed ? s.allowedActions.getFlatStatus === true : true,
        getPricingInfo: hasCustomAllowed ? s.allowedActions.getPricingInfo === true : true,
        recordUnmetDemand: hasCustomAllowed ? s.allowedActions.recordUnmetDemand === true : true,
        informCheckout: hasCustomAllowed ? s.allowedActions.informCheckout === true : false,
        ...(s.allowedActions || {})
      },
      preReservationHoldMinutes: Number(s.preReservationHoldMinutes) || 30,
      handoverMessage: s.handoverMessage || "Esta ação do sistema está pausada ou requer atendimento humano."
    };
  }
  return {
    apiActionsEnabled: true,
    allowedActions: {
      checkAvailability: true,
      calculateQuote: true,
      generatePayment: true,
      createPreReservation: true,
      commitReservation: true,
      reallocateReservationFlat: true,
      getFlatAmenities: true,
      querySystemData: true,
      getReservationDetails: true,
      getFlatStatus: true,
      getPricingInfo: true,
      recordUnmetDemand: true,
      informCheckout: false
    },
    preReservationHoldMinutes: 30,
    handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
  };
}

// ── Utilitários de Mascaramento LGPD ──────────────────────────────────────────

export function maskSensitivePhone(phone) {
  if (!phone) return "";
  const s = String(phone).replace(/\D/g, "");
  if (s.length < 8) return "***";
  return `(${s.slice(-11, -9) || "XX"}) *****-${s.slice(-4)}`;
}

export function maskSensitiveCpf(cpf) {
  if (!cpf) return "";
  const s = String(cpf).replace(/\D/g, "");
  if (s.length !== 11) return "***.***.***-**";
  return `***.${s.slice(3, 6)}.***-**`;
}

export function maskSensitiveEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

export function maskSensitiveName(name) {
  if (!name || typeof name !== "string") return "Hóspede";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2) + "***";
  }
  return `${parts[0]} ${parts.slice(1).map(p => p[0] + "***").join(" ")}`;
}

export const DEFAULT_BREAKFAST_MENU = {
  availableTimes: ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30"],
  categories: [
    { id: "bebidas", name: "☕ Cafés & Bebidas", items: ["Café", "Café duplo", "Café com leite", "Leite", "Suco de laranja", "Achocolatado gelado", "Água mineral", "Vitamina de banana com iogurte de morango"] },
    { id: "paes", name: "🍞 Pães Tradicionais", items: ["Pão francês", "Pão de queijo"] },
    { id: "acompanhamentos", name: "🧀 Frios & Acompanhamentos", items: ["Queijo mussarela", "Presunto", "Queijo prato", "Queijo Minas frescal", "Peito de Peru", "Ovos mexidos"] },
    { id: "complementos", name: "🧈 Complementos", items: ["Manteiga", "Requeijão"] },
    { id: "doces", name: "🍰 Doces & Biscoitos", items: ["Bolo do dia", "Torradas amanteigadas", "Casadinho (biscoito com goiabada)"] },
    { id: "frutas", name: "🍎 Frutas Selecionadas", items: ["Banana", "Maçã", "Mamão", "Salada de frutas"] }
  ]
};

export const DEFAULT_STANDARD_BREAKFAST = {
  coffee: "Café, Leite",
  otherBeverage: "Suco de laranja",
  breads: ["Pão francês", "Pão de queijo"],
  accompaniments: ["Queijo mussarela", "Presunto", "Ovos mexidos"],
  complements: ["Manteiga"],
  sweets: ["Bolo do dia"],
  fruit: "Fruta do dia",
  sweetener: "Açúcar",
  description: "Café, Leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Ovos mexidos, Manteiga, Bolo do dia e Fruta do dia."
};

/**
 * Motor Universal de Consulta a Dados do Sistema CorpFlats
 * Suporta consulta contextual a flats, reservas, limpeza, manutenção, café da manhã, garagem,
 * achados e perdidos, FAQs, financeiro e avaliações/sentimento com proteção LGPD por perfil.
 */
export async function querySystemData(db, {
  module,
  query = "",
  filters = {},
  requesterRole = "guest",
  requesterPhone = ""
} = {}) {
  const normModule = String(module || "").toLowerCase().trim();

  switch (normModule) {
    case "flats": {
      const flats = Array.isArray(db?.flats) ? db.flats : [];
      const cleaningReqs = Array.isArray(db?.cleaningRequests) ? db.cleaningRequests : [];
      const serviceOrders = Array.isArray(db?.serviceOrders) ? db.serviceOrders : [];
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      const todayStr = new Date().toISOString().slice(0, 10);

      let list = flats.map(f => {
        const flatNum = String(f.number);
        const activeRes = reservations.find(r =>
          (r.flatId === f.id || String(r.flatNumber) === flatNum) &&
          r.status !== "cancelada" &&
          r.checkinDate <= todayStr && r.checkoutDate > todayStr
        );
        const latestClean = cleaningReqs
          .filter(c => String(c.flatNumber) === flatNum || c.flatId === f.id)
          .sort((a, b) => new Date(b.requestDate || b.createdAt || 0) - new Date(a.requestDate || a.createdAt || 0))[0];

        const activeSO = serviceOrders.filter(so =>
          so.status === "active" && Array.isArray(so.flats) &&
          so.flats.some(sf => (sf.flatId === f.id || String(sf.flatNumber) === flatNum) && sf.status !== "done")
        );

        const isOwn = requesterRole === "admin" || (requesterPhone && activeRes && doesReservationMatchPhone(activeRes, requesterPhone));

        return {
          id: f.id,
          number: f.number,
          isActive: f.isActive !== false,
          isOccupied: Boolean(activeRes || f.isOccupied),
          airConditionerType: f.airConditionerType || (f.tags?.some(t => /split/i.test(t)) ? "split" : "janela"),
          bedType: f.bedType || (f.tags?.some(t => /casal/i.test(t)) ? "casal" : "solteiro"),
          hasMicrowave: Boolean(f.hasMicrowave || f.tags?.some(t => /micro/i.test(t))),
          amenities: Array.isArray(f.amenities) ? f.amenities : (Array.isArray(f.features) ? f.features : []),
          tags: Array.isArray(f.tags) ? f.tags : [],
          cleaningStatus: latestClean?.status || (f.isOccupied ? "occupied" : "clean"),
          maintenanceStatus: activeSO.length > 0 ? "em_manutencao" : "normal",
          currentGuest: requesterRole === "admin"
            ? (activeRes ? { name: activeRes.guestName, code: activeRes.code, checkin: activeRes.checkinDate, checkout: activeRes.checkoutDate } : null)
            : (isOwn && activeRes ? { name: activeRes.guestName, code: activeRes.code } : null)
        };
      });

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(f =>
          String(f.number).includes(qLower) ||
          f.airConditionerType.toLowerCase().includes(qLower) ||
          f.bedType.toLowerCase().includes(qLower) ||
          f.tags.some(t => t.toLowerCase().includes(qLower)) ||
          (qLower.includes("livre") && !f.isOccupied) ||
          (qLower.includes("ocupado") && f.isOccupied)
        );
      }

      if (filters.number) list = list.filter(f => String(f.number) === String(filters.number));
      if (filters.bedType) list = list.filter(f => f.bedType === filters.bedType);
      if (filters.airConditionerType) list = list.filter(f => f.airConditionerType === filters.airConditionerType);
      if (filters.isOccupied !== undefined) list = list.filter(f => f.isOccupied === Boolean(filters.isOccupied));

      return {
        success: true,
        module: "flats",
        totalFlats: flats.length,
        count: list.length,
        flats: list
      };
    }

    case "reservations": {
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      let list = reservations;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(r =>
          String(r.code || "").toLowerCase().includes(qLower) ||
          String(r.id || "").toLowerCase().includes(qLower) ||
          String(r.guestName || "").toLowerCase().includes(qLower) ||
          String(r.flatNumber || "").includes(qLower) ||
          String(r.status || "").toLowerCase().includes(qLower) ||
          String(r.checkinDate || "").includes(qLower) ||
          String(r.checkoutDate || "").includes(qLower)
        );
      }

      if (filters.status) list = list.filter(r => r.status === filters.status);
      if (filters.flatNumber) list = list.filter(r => String(r.flatNumber) === String(filters.flatNumber));
      if (filters.code) list = list.filter(r => String(r.code).toLowerCase() === String(filters.code).toLowerCase());
      if (filters.date) {
        list = list.filter(r => r.checkinDate <= filters.date && r.checkoutDate >= filters.date);
      }

      const sanitized = list.map(r => {
        const isOwn = requesterRole === "admin" || (requesterPhone && doesReservationMatchPhone(r, requesterPhone));
        const hideFin = isNonRequesterGuestForReservation(r, requesterPhone, db);

        if (requesterRole === "admin") {
          return { ...r };
        }

        if (isOwn) {
          return {
            id: r.id,
            code: r.code,
            guestName: r.guestName,
            flatNumber: r.flatNumber,
            checkinDate: r.checkinDate,
            checkoutDate: r.checkoutDate,
            status: r.status,
            paymentStatus: hideFin ? undefined : r.paymentStatus,
            totalAmount: hideFin ? undefined : r.totalAmount,
            paidAmount: hideFin ? undefined : r.paidAmount,
            includeBreakfast: r.includeBreakfast,
            checkinTime: r.checkinTime || "14:00",
            checkoutTime: r.checkoutTime || "12:00"
          };
        }

        return {
          code: r.code ? r.code.slice(0, 4) + "****" : "****",
          flatNumber: r.flatNumber,
          checkinDate: r.checkinDate,
          checkoutDate: r.checkoutDate,
          status: r.status === "cancelada" ? "cancelada" : "ocupado",
          guestName: maskSensitiveName(r.guestName),
          guestPhone: maskSensitivePhone(r.guestPhone || r.phone),
          guestCpf: maskSensitiveCpf(r.guestCpf || r.cpf),
          guestEmail: maskSensitiveEmail(r.guestEmail || r.email),
          totalAmount: "[RESTRITO_LGPD]",
          paidAmount: "[RESTRITO_LGPD]",
          paymentStatus: "[RESTRITO_LGPD]"
        };
      });

      return {
        success: true,
        module: "reservations",
        count: sanitized.length,
        reservations: sanitized
      };
    }

    case "cleaning": {
      const cleaningReqs = Array.isArray(db?.cleaningRequests) ? db.cleaningRequests : [];
      const surveys = Array.isArray(db?.surveys) ? db.surveys : [];
      let list = cleaningReqs;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(c =>
          String(c.flatNumber || "").includes(qLower) ||
          String(c.status || "").toLowerCase().includes(qLower) ||
          String(c.assignedUsername || "").toLowerCase().includes(qLower)
        );
      }
      if (filters.flatNumber) list = list.filter(c => String(c.flatNumber) === String(filters.flatNumber));
      if (filters.status) list = list.filter(c => c.status === filters.status);

      const sanitized = list.map(c => {
        if (requesterRole === "admin") {
          return { ...c };
        }
        const firstName = c.assignedUsername ? c.assignedUsername.trim().split(/\s+/)[0] : "Equipe de Governança";
        return {
          id: c.id,
          flatNumber: c.flatNumber,
          status: c.status,
          isClean: c.status === "clean",
          assignedTo: firstName,
          requestDate: c.requestDate,
          effectiveDate: c.effectiveDate,
          completedAt: c.completedAt || null
        };
      });

      const sanitizedSurveys = surveys
        .filter(s => requesterRole === "admin" || s.active !== false)
        .map(s => {
          if (requesterRole === "admin") return { ...s };
          return {
            id: s.id,
            title: s.title,
            active: s.active,
            targetFlatIds: s.targetFlatIds || []
          };
        });

      return {
        success: true,
        module: "cleaning",
        count: sanitized.length,
        cleaningRequests: sanitized,
        surveysCount: sanitizedSurveys.length,
        vistorias: sanitizedSurveys
      };
    }

    case "maintenance": {
      const serviceOrders = Array.isArray(db?.serviceOrders) ? db.serviceOrders : [];
      let list = serviceOrders;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(so =>
          String(so.title || "").toLowerCase().includes(qLower) ||
          String(so.status || "").toLowerCase().includes(qLower) ||
          (Array.isArray(so.flats) && so.flats.some(f => String(f.flatNumber).includes(qLower) || String(f.instructions || "").toLowerCase().includes(qLower)))
        );
      }
      if (filters.status) list = list.filter(so => so.status === filters.status);
      if (filters.flatNumber) {
        list = list.filter(so => Array.isArray(so.flats) && so.flats.some(f => String(f.flatNumber) === String(filters.flatNumber)));
      }

      const sanitized = list.map(so => {
        if (requesterRole === "admin") {
          const worker = (db?.serviceWorkers || []).find(w => w.token === so.token || w.serviceOrderId === so.id);
          return {
            ...so,
            workerName: worker?.mainWorker?.name || null,
            workerCpf: worker?.mainWorker?.cpf || null,
            vehicle: worker?.vehicle || null
          };
        }
        return {
          id: so.id,
          title: so.title,
          status: so.status,
          createdAt: so.createdAt,
          flats: (so.flats || []).map(f => ({
            flatNumber: f.flatNumber,
            status: f.status,
            startedAt: f.startedAt || null,
            completedAt: f.completedAt || null
          }))
        };
      });

      return {
        success: true,
        module: "maintenance",
        count: sanitized.length,
        serviceOrders: sanitized
      };
    }

    case "breakfast": {
      const menu = db?.breakfastMenu || DEFAULT_BREAKFAST_MENU;
      const standardConfig = db?.standardBreakfastConfig || DEFAULT_STANDARD_BREAKFAST;
      const orders = Array.isArray(db?.breakfastOrders) ? db.breakfastOrders : [];

      let sanitizedOrders = [];
      if (requesterRole === "admin") {
        sanitizedOrders = orders;
        if (filters.date) sanitizedOrders = sanitizedOrders.filter(o => o.date === filters.date);
        if (filters.roomNumber) sanitizedOrders = sanitizedOrders.filter(o => String(o.roomNumber) === String(filters.roomNumber));
      } else {
        sanitizedOrders = orders.filter(o => {
          const phoneMatches = requesterPhone && (o.phone === requesterPhone || cleanWhatsAppPhone(o.phone) === cleanWhatsAppPhone(requesterPhone));
          return Boolean(phoneMatches);
        });
      }

      return {
        success: true,
        module: "breakfast",
        deliveryHours: menu.availableTimes || DEFAULT_BREAKFAST_MENU.availableTimes,
        menuCategories: menu.categories || DEFAULT_BREAKFAST_MENU.categories,
        standardConfig,
        orders: sanitizedOrders
      };
    }

    case "garage": {
      const garageAuthorizations = Array.isArray(db?.garageAuthorizations) ? db.garageAuthorizations : [];
      const rules = {
        policy: "1 vaga rotativa gratuita por flat no condomínio Soho (qualquer vaga livre disponível).",
        requiresPreCheckin: true,
        heightLimitMeters: "2.10m a 2.20m",
        supportedVehicles: "Veículos de passeio, SUVs e caminhonetes."
      };

      let sanitizedAuths = [];
      if (requesterRole === "admin") {
        sanitizedAuths = garageAuthorizations;
        if (query) {
          const qLower = String(query).toLowerCase().trim();
          sanitizedAuths = sanitizedAuths.filter(a =>
            String(a.plate || "").toLowerCase().includes(qLower) ||
            String(a.guestName || "").toLowerCase().includes(qLower) ||
            String(a.flatNumber || "").includes(qLower) ||
            String(a.model || "").toLowerCase().includes(qLower)
          );
        }
      } else {
        if (requesterPhone) {
          const cleanReqPhone = cleanWhatsAppPhone(requesterPhone);
          sanitizedAuths = garageAuthorizations.filter(a => {
            const authPhone = cleanWhatsAppPhone(a.phone || a.guestPhone || "");
            return cleanReqPhone && authPhone === cleanReqPhone;
          });

          if (query) {
            const qPlate = String(query).toUpperCase().replace(/[^A-Z0-9]/g, "");
            sanitizedAuths = sanitizedAuths.filter(a => {
              const cleanA = String(a.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
              return qPlate && cleanA.includes(qPlate);
            });
          }

          sanitizedAuths = sanitizedAuths.map(a => ({
            plate: a.plate,
            model: a.model,
            flatNumber: a.flatNumber,
            status: a.status,
            checkinDate: a.checkinDate,
            checkoutDate: a.checkoutDate
          }));
        }
      }

      return {
        success: true,
        module: "garage",
        rules,
        authorizedCount: sanitizedAuths.length,
        authorizations: sanitizedAuths
      };
    }

    case "lost_and_found": {
      const items = Array.isArray(db?.lostAndFound) ? db.lostAndFound : [];
      let list = items;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(i =>
          String(i.description || "").toLowerCase().includes(qLower) ||
          String(i.flatNumber || "").includes(qLower) ||
          String(i.locationInRoom || "").toLowerCase().includes(qLower) ||
          String(i.status || "").toLowerCase().includes(qLower)
        );
      }
      if (filters.flatNumber) list = list.filter(i => String(i.flatNumber) === String(filters.flatNumber));
      if (filters.status) list = list.filter(i => i.status === filters.status);

      const sanitized = list.map(i => {
        if (requesterRole === "admin") {
          return { ...i };
        }
        return {
          id: i.id,
          description: i.description,
          flatNumber: i.flatNumber,
          locationInRoom: i.locationInRoom,
          status: i.status,
          createdAt: i.createdAt
        };
      });

      return {
        success: true,
        module: "lost_and_found",
        count: sanitized.length,
        items: sanitized
      };
    }

    case "faq": {
      const faqList = Array.isArray(db?.faqItems) ? db.faqItems : [];
      const kb = DEFAULT_AI_CONFIG.knowledgeBase;
      let activeFaqs = faqList.filter(f => f && f.status === "ativo");

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        activeFaqs = activeFaqs.filter(f =>
          String(f.question || "").toLowerCase().includes(qLower) ||
          String(f.answer || "").toLowerCase().includes(qLower) ||
          (Array.isArray(f.keywords) && f.keywords.some(k => k.toLowerCase().includes(qLower)))
        );
      }

      return {
        success: true,
        module: "faq",
        knowledgeBaseSummary: {
          address: kb.address,
          checkinTime: kb.checkinTime,
          checkoutTime: kb.checkoutTime,
          wifiPassword: kb.wifiPassword,
          petPolicy: kb.petPolicy,
          smokingPolicy: kb.smokingPolicy,
          leisureInfo: kb.leisureInfo,
          amenities: kb.amenities
        },
        count: activeFaqs.length,
        faqs: activeFaqs.map(f => ({ id: f.id, question: f.question, answer: f.answer, category: f.category }))
      };
    }

    case "finance": {
      if (requesterRole !== "admin") {
        return {
          error: "ACCESS_DENIED",
          module: "finance",
          message: "Acesso negado: Informações financeiras globais e de faturamento são estritamente restritas à administração da CorpFlats (LGPD)."
        };
      }

      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      const activeRes = reservations.filter(r => r.status !== "cancelada");
      const tariffSettings = db?.tariffSettings || { baseDailyRate: 237, weekendMarkupPct: 0.15, cleaningFee: 70, breakfastFeePerson: 35 };

      let totalRevenue = 0;
      let totalNights = 0;
      const channelTotals = { direct: 0, booking: 0, airbnb: 0, other: 0 };

      activeRes.forEach(r => {
        const amt = Number(r.totalAmount) || 0;
        totalRevenue += amt;
        const chan = String(r.channel || "").toLowerCase();
        if (chan.includes("site") || chan.includes("whatsapp") || chan.includes("direct") || chan.includes("direta")) {
          channelTotals.direct += amt;
        } else if (chan.includes("booking")) {
          channelTotals.booking += amt;
        } else if (chan.includes("airbnb")) {
          channelTotals.airbnb += amt;
        } else {
          channelTotals.other += amt;
        }

        try {
          if (r.checkinDate && r.checkoutDate) {
            const d1 = new Date(r.checkinDate);
            const d2 = new Date(r.checkoutDate);
            const nights = Math.max(1, Math.round((d2 - d1) / 86400000));
            totalNights += nights;
          } else {
            totalNights += 1;
          }
        } catch {
          totalNights += 1;
        }
      });

      const adr = totalNights > 0 ? Math.round(totalRevenue / totalNights) : tariffSettings.baseDailyRate;

      return {
        success: true,
        module: "finance",
        activeReservationsCount: activeRes.length,
        totalNights,
        totalRevenueEstimated: Math.round(totalRevenue * 100) / 100,
        averageDailyRate: adr,
        revenueByChannel: channelTotals,
        tariffSettings: {
          baseDailyRate: tariffSettings.baseDailyRate,
          weekendMarkupPct: tariffSettings.weekendMarkupPct,
          cleaningFee: tariffSettings.cleaningFee,
          breakfastFeePerson: tariffSettings.breakfastFeePerson
        },
        tariffOverridesCount: (db?.tariffOverrides || []).length
      };
    }

    case "sentiment": {
      const reviews = Array.isArray(db?.reviews) ? db.reviews : [];
      const sentiments = Array.isArray(db?.guestSentiment) ? db.guestSentiment : [];
      const nps = Array.isArray(db?.npsResponses) ? db.npsResponses : [];

      const avgReviewRating = reviews.length > 0
        ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
        : "4.9";

      const positiveSentiments = sentiments.filter(s => s.overallTone === "positive").length;
      const neutralSentiments = sentiments.filter(s => s.overallTone === "neutral").length;
      const negativeSentiments = sentiments.filter(s => s.overallTone === "negative").length;

      if (requesterRole !== "admin") {
        return {
          success: true,
          module: "sentiment",
          averageRating: Number(avgReviewRating),
          totalReviews: reviews.length,
          generalSatisfactionRate: "98% de aprovação dos hóspedes"
        };
      }

      return {
        success: true,
        module: "sentiment",
        averageRating: Number(avgReviewRating),
        totalReviews: reviews.length,
        sentimentsAnalyzed: sentiments.length,
        toneDistribution: {
          positive: positiveSentiments,
          neutral: neutralSentiments,
          negative: negativeSentiments
        },
        nps: {
          total: nps.length,
          promoters: nps.filter(n => n.score === 5).length,
          detractors: nps.filter(n => n.score != null && n.score <= 2).length
        },
        recentFeedbacks: reviews.slice(0, 5).map(r => ({
          author: r.author || "Hóspede",
          rating: r.rating,
          comment: r.comment || r.text || "",
          date: r.date
        }))
      };
    }

    case "minibar":
    case "frigobar": {
      const products = Array.isArray(db?.minibarProducts) ? db.minibarProducts : [];
      const orders = Array.isArray(db?.minibarOrders) ? db.minibarOrders : [];
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      const cleanPhone = normalizePhone(requesterPhone || "");

      let matchedRes = null;
      if (cleanPhone) {
        matchedRes = reservations.find(r => r.status !== "cancelada" && doesReservationMatchPhone(r, cleanPhone));
      }

      const guestOrders = orders.filter(o => {
        if (!o) return false;
        if (cleanPhone && normalizePhone(o.guestPhone || "") === cleanPhone) return true;
        if (matchedRes && (o.reservationCode === matchedRes.code || String(o.reservationId) === String(matchedRes.id))) return true;
        return false;
      });

      const catalog = products.filter(p => p.isActive !== false).map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: Number(p.price || 0),
        isCourtesy: Boolean(p.isCourtesy)
      }));

      const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
      const minibarUrl = matchedRes?.code ? `${appOrigin}/minha-reserva/${matchedRes.code}/frigobar` : null;

      return {
        catalog,
        courtesyRules: "Cada reserva tem direito a 1 kit cortesia por estadia (cápsulas Nespresso e doces). Bebidas geladas e snacks adicionais podem ser adquiridos via autoatendimento com pagamento por PIX ou Cartão.",
        minibarUrl,
        guestOrders: guestOrders.map(o => ({
          orderId: o.id,
          totalAmount: o.totalAmount,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          itemsCount: (o.items || []).length,
          paidAt: o.paidAt || null,
          createdAt: o.createdAt
        }))
      };
    }

    default:
      return {
        error: "UNKNOWN_MODULE",
        module,
        message: `Módulo '${module}' não suportado pelo motor universal. Módulos válidos: flats, reservations, cleaning, maintenance, breakfast, garage, lost_and_found, faq, finance, sentiment, minibar.`
      };
  }
}

/**
 * Handler para o Gemini Function Calling de querySystemData
 */
export async function handleQuerySystemData(db, args = {}) {
  const { module, query, filters, requesterRole = "guest", requesterPhone = "" } = args;
  return await querySystemData(db, { module, query, filters, requesterRole, requesterPhone });
}

/**
 * Constrói as declarações de ferramentas (Function Calling) do Gemini adaptativamente
 * de acordo com a chave mestra e as permissões granulares ativas.
 */
export function buildGeminiTools(actionsSettings = {}) {
  if (!actionsSettings || actionsSettings.apiActionsEnabled === false) {
    return [];
  }

  const allowed = actionsSettings.allowedActions || {};
  const declarations = [];

  if (allowed.checkAvailability !== false && allowed.checkAvailability) {
    declarations.push({
      name: "checkAvailability",
      description: "Consulta a disponibilidade de flats para um intervalo de datas (check-in e check-out) e quantidade de hóspedes.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de check-in (formato YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de check-out (formato YYYY-MM-DD)"
          },
          guests: {
            type: "INTEGER",
            description: "Número total de hóspedes (opcional, padrão 1)"
          }
        },
        required: ["checkIn", "checkOut"]
      }
    });
  }

  if (allowed.calculateQuote !== false && allowed.calculateQuote) {
    declarations.push({
      name: "calculateQuote",
      description: "Calcula o orçamento completo e detalhado (diárias com motor tarifário inteligente, taxas e valor total) para uma estadia.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de entrada (formato YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de saída (formato YYYY-MM-DD)"
          },
          guests: {
            type: "INTEGER",
            description: "Número total de hóspedes (opcional, padrão 1)"
          },
          flatId: {
            type: "STRING",
            description: "ID ou número do flat desejado (opcional)"
          },
          channel: {
            type: "STRING",
            description: "Canal de venda (ex: 'direct', 'whatsapp')"
          },
          ratePlan: {
            type: "STRING",
            description: "Plano tarifário ('room_only' ou 'with_breakfast')"
          }
        },
        required: ["checkIn", "checkOut"]
      }
    });
  }

  if (allowed.createPreReservation !== false && allowed.createPreReservation) {
    declarations.push({
      name: "createPreReservation",
      description: "Cria uma pré-reserva provisória com bloqueio temporário (hold de 30 minutos) no PMS e gera cobrança PIX para garantia.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de entrada (YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de saída (YYYY-MM-DD)"
          },
          guestName: {
            type: "STRING",
            description: "Nome completo do hóspede"
          },
          guestPhone: {
            type: "STRING",
            description: "Telefone/WhatsApp do hóspede com DDD"
          },
          flatId: {
            type: "STRING",
            description: "ID ou número do flat escolhido"
          },
          total: {
            type: "NUMBER",
            description: "Valor total da reserva"
          },
          guests: {
            type: "INTEGER",
            description: "Número de hóspedes (padrão 1)"
          }
        },
        required: ["checkIn", "checkOut", "guestName", "flatId"]
      }
    });
  }

  if (allowed.generatePayment !== false && allowed.generatePayment) {
    declarations.push({
      name: "generatePayment",
      description: "Gera ou recupera dados de pagamento PIX (código Copia e Cola e QR Code) para uma pré-reserva ou reserva.",
      parameters: {
        type: "OBJECT",
        properties: {
          reservationId: {
            type: "STRING",
            description: "Código ou ID da reserva/pré-reserva (ex: 'CF-123456')"
          },
          amount: {
            type: "NUMBER",
            description: "Valor a pagar (opcional se já constar na reserva)"
          },
          guestName: {
            type: "STRING",
            description: "Nome do hóspede (opcional)"
          }
        },
        required: ["reservationId"]
      }
    });
  }

  if (allowed.commitReservation !== false && allowed.commitReservation) {
    declarations.push({
      name: "commitReservation",
      description: "Efetiva e confirma definitivamente uma pré-reserva no PMS após a confirmação do pagamento, realizando o bloqueio permanente das datas.",
      parameters: {
        type: "OBJECT",
        properties: {
          reservationId: {
            type: "STRING",
            description: "Código ou ID da pré-reserva a ser confirmada"
          }
        },
        required: ["reservationId"]
      }
    });
  }

  if (allowed.getReservationDetails === true) {
    declarations.push({
      name: "getReservationDetails",
      description: "Consulta dados e status de reservas no sistema pelo código da reserva (ex: 'RES-101-9999', 'CF-123456'), telefone, nome do titular ou número do flat.",
      parameters: {
        type: "OBJECT",
        properties: {
          code: {
            type: "STRING",
            description: "Código da reserva (ex: 'RES-101-9999', 'CF-123456')"
          },
          guestName: {
            type: "STRING",
            description: "Nome do titular da reserva"
          },
          flatNumber: {
            type: "STRING",
            description: "Número do flat/quarto"
          },
          phone: {
            type: "STRING",
            description: "Telefone do hóspede com DDD"
          }
        }
      }
    });
  }

  if (allowed.getFlatStatus === true) {
    declarations.push({
      name: "getFlatStatus",
      description: "Consulta o status em tempo real de um flat/apartamento no sistema (se está limpo/higienizado pela governança, liberado para entrada antecipada, ou ocupado).",
      parameters: {
        type: "OBJECT",
        properties: {
          flatNumber: {
            type: "STRING",
            description: "Número do flat/apartamento (ex: '101', '202', '605')"
          }
        },
        required: ["flatNumber"]
      }
    });
  }

  if (allowed.getPricingInfo === true) {
    declarations.push({
      name: "getPricingInfo",
      description: "Consulta a tabela de tarifas, diárias e valores oficiais da CorpFlats (com ou sem café da manhã) para fornecer valores exatos ao hóspede.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de entrada (opcional, formato YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de saída (opcional, formato YYYY-MM-DD)"
          },
          guests: {
            type: "INTEGER",
            description: "Quantidade de hóspedes (padrão 1)"
          },
          withBreakfast: {
            type: "BOOLEAN",
            description: "Se inclui café da manhã servido no quarto"
          }
        }
      }
    });
  }

  if (allowed.recordUnmetDemand === true) {
    declarations.push({
      name: "recordUnmetDemand",
      description: "Registra na fila de Oportunidades de Automação e Demandas Sem Acesso qualquer solicitação operacional do hóspede que o sistema não possua capacidade autônoma de realizar (ex: cancelamento de reserva, alteração de datas, solicitação de toalhas/enxoval, chamado de manutenção, troca de quarto, nota fiscal com CNPJ, solicitação de berço/itens extras).",
      parameters: {
        type: "OBJECT",
        properties: {
          demandTitle: {
            type: "STRING",
            description: "Título descritivo da demanda (ex: 'Solicitação de Berço', 'Cancelamento de Reserva')"
          },
          guestRequest: {
            type: "STRING",
            description: "Mensagem ou solicitação original do hóspede"
          },
          category: {
            type: "STRING",
            description: "Categoria da demanda (ex: 'cancelamento_reserva', 'alteracao_datas', 'enxoval_toalhas', 'chamado_manutencao', 'emissao_nota_fiscal', 'itens_especiais_comodidades', 'outros')"
          },
          reason: {
            type: "STRING",
            description: "Motivo: 'capability_missing', 'requires_operator' ou 'data_unavailable'"
          },
          suggestedFeature: {
            type: "STRING",
            description: "Sugestão técnica de recurso para desenvolvimento posterior"
          }
        },
        required: ["demandTitle", "guestRequest"]
      }
    });
  }

  if (allowed.informCheckout !== false && allowed.informCheckout) {
    declarations.push({
      name: "informCheckout",
      description: "Registra a comunicação de check-out informada pelo hóspede via WhatsApp, atualizando o flat como desocupado no quadro de governança/limpeza e marcando a reserva como concluída.",
      parameters: {
        type: "OBJECT",
        properties: {
          flatNumber: {
            type: "STRING",
            description: "Número do flat/apartamento desocupado (ex: '101', '204', '302')"
          },
          guestName: {
            type: "STRING",
            description: "Nome do hóspede informando a saída (opcional)"
          },
          phone: {
            type: "STRING",
            description: "Telefone do hóspede com DDD (opcional)"
          }
        }
      }
    });
  }

  if (allowed.getFlatAmenities !== false) {
    declarations.push({
      name: "getFlatAmenities",
      description: "Consulta comodidades, tags, tipo de ar-condicionado (split vs janela), tipo de cama (casal vs 2 solteiro) e micro-ondas dos flats da CorpFlats. Permite filtrar por comodidade ou ver detalhes de um flat.",
      parameters: {
        type: "OBJECT",
        properties: {
          criteria: {
            type: "STRING",
            description: "Comodidade ou particularidade desejada (ex: 'split', 'microondas', 'casal', 'solteiro', '2_solteiro')"
          },
          flatNumber: {
            type: "STRING",
            description: "Número do flat específico para ver suas comodidades (opcional)"
          }
        }
      }
    });
  }

  if (allowed.reallocateReservationFlat !== false && allowed.reallocateReservationFlat) {
    declarations.push({
      name: "reallocateReservationFlat",
      description: "Realoca ou troca o apartamento de uma reserva no PMS para outro flat solicitado pelo hóspede. Sofia só pode deslocar um hóspede futuro se este não tiver solicitado o flat especificamente ou se o flat não estiver bloqueado/preferencial.",
      parameters: {
        type: "OBJECT",
        properties: {
          reservationId: {
            type: "STRING",
            description: "ID ou código da reserva a ser realocada (ex: 'RES-101-9999', 'CF-123456')"
          },
          targetFlatNumber: {
            type: "STRING",
            description: "Número do flat de destino desejado (ex: '408', '113', '904')"
          },
          reason: {
            type: "STRING",
            description: "Motivo da troca de quarto (ex: 'Hóspede prefere ar split', 'Preferência por cama de casal')"
          }
        },
        required: ["targetFlatNumber"]
      }
    });
  }

  if (allowed.querySystemData !== false) {
    declarations.push({
      name: "querySystemData",
      description: "Consulta universal e inteligente aos dados em tempo real do sistema CorpFlats (flats, reservas, limpeza/governança, manutenção/OS, café da manhã, garagem, achados e perdidos, regras/FAQs, financeiro, frigobar/minibar e avaliações/sentimento).",
      parameters: {
        type: "OBJECT",
        properties: {
          module: {
            type: "STRING",
            description: "Módulo do sistema a consultar: 'flats', 'reservations', 'cleaning', 'maintenance', 'breakfast', 'garage', 'lost_and_found', 'faq', 'finance', 'sentiment' ou 'minibar'."
          },
          query: {
            type: "STRING",
            description: "Termo de busca, pergunta, número de flat, nome de hóspede ou filtro textual."
          },
          filters: {
            type: "OBJECT",
            description: "Filtros adicionais opcionais (ex: status, flatNumber, date, category)."
          }
        },
        required: ["module"]
      }
    });
  }

  if (declarations.length === 0) {
    return [];
  }

  return [
    {
      functionDeclarations: declarations
    }
  ];
}

/**
 * Calcula a diária efetiva considerando motor tarifário, overrides e markup de canais
 */
export function computeDailyRate(db, flatId, dateStr, channel = "direct") {
  const normDate = String(dateStr).substring(0, 10);
  let normChan = String(channel || "direct").toLowerCase().trim();
  if (["whatsapp", "site", "direta", "direto"].includes(normChan)) {
    normChan = "direct";
  }

  // 1. Overrides
  const overrides = Array.isArray(db?.tariffOverrides) ? db.tariffOverrides : [];
  let targetFlatId = flatId ? String(flatId) : null;
  let targetFlatNumber = null;
  if (targetFlatId && Array.isArray(db?.flats)) {
    const fObj = db.flats.find(f => String(f.id) === targetFlatId || String(f.number) === targetFlatId);
    if (fObj) {
      targetFlatId = String(fObj.id);
      targetFlatNumber = String(fObj.number);
    }
  }

  let matchedOverride = null;
  if (targetFlatId || targetFlatNumber) {
    matchedOverride = overrides.find(o =>
      o.date === normDate &&
      (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
      String(o.channel || "").toLowerCase() === normChan
    ) || overrides.find(o =>
      o.date === normDate &&
      (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
      (!o.channel || String(o.channel).toLowerCase() === "all")
    );
  }

  if (!matchedOverride) {
    matchedOverride = overrides.find(o =>
      o.date === normDate &&
      (!o.flatId || String(o.flatId) === "all" || o.flatId === null) &&
      String(o.channel || "").toLowerCase() === normChan
    ) || overrides.find(o =>
      o.date === normDate &&
      (!o.flatId || String(o.flatId) === "all" || o.flatId === null) &&
      (!o.channel || String(o.channel).toLowerCase() === "all")
    );
  }

  if (matchedOverride && matchedOverride.rate != null) {
    return Math.round(Number(matchedOverride.rate) * 100) / 100;
  }

  // 2. Base rate
  const tSettings = db?.tariffSettings || {};
  let baseRate = Number(tSettings.baseDailyRate != null ? tSettings.baseDailyRate : 237);

  // 3. Weekend markup (Sexta=5, Sábado=6)
  const dParts = normDate.split("-").map(Number);
  const dateObj = new Date(Date.UTC(dParts[0], (dParts[1] || 1) - 1, dParts[2] || 1, 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay();
  const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
  let weekendMarkup = 0;
  if (isWeekend) {
    const weekendPct = Number(tSettings.weekendMarkupPct != null ? tSettings.weekendMarkupPct : 0.15);
    weekendMarkup = baseRate * weekendPct;
  }

  const rateBeforeChan = baseRate + weekendMarkup;

  // 4. Channel markup
  const chanCfg = tSettings.channelMarkups?.[normChan] ||
    (normChan === "direct" ? { markupPct: 0.0 } :
     normChan === "booking" ? { markupPct: 0.18 } :
     normChan === "airbnb" ? { markupPct: 0.15 } : { markupPct: 0.0 });
  const chanPct = Number(chanCfg.markupPct || 0);
  const finalRate = rateBeforeChan * (1 + chanPct);

  return Math.round(finalRate * 100) / 100;
}

// ── Handlers Internos para Bot Actions ──────────────────────────────────────

/**
 * Normaliza e consolida comodidades, tags, tipo de ar e tipo de cama de um flat
 */
export function getFlatAmenitiesInfo(flat) {
  if (!flat) return null;
  const colName = String(flat.colName || flat.name || "").toLowerCase();
  const tags = Array.isArray(flat.tags) ? flat.tags : [];
  const tagsLower = tags.map(t => String(t).toLowerCase());

  // Ar-condicionado: split vs janela/parede
  let airConditionerType = flat.airConditionerType || null;
  if (!airConditionerType) {
    if (tagsLower.some(t => t.includes("split")) || colName.includes("split")) {
      airConditionerType = "split";
    } else if (tagsLower.some(t => t.includes("janela") || t.includes("parede")) || colName.includes("janela") || colName.includes("parede")) {
      airConditionerType = "janela";
    } else {
      airConditionerType = "split";
    }
  }
  const airConditionerLabel = airConditionerType === "split" ? "Ar-condicionado Split ❄️" : "Ar-condicionado de Janela";

  // Cama: casal (cama inteira) vs 2 solteiro (twin)
  let bedType = flat.bedType || null;
  if (!bedType) {
    if (tagsLower.some(t => t.includes("casal") || t.includes("inteira") || t.includes("cama inteira") || t.includes("queen") || t.includes("king")) || colName.includes("casal") || colName.includes("inteira")) {
      bedType = "casal";
    } else if (tagsLower.some(t => t.includes("solteiro") || t.includes("twin") || t.includes("ferro unindo")) || colName.includes("solteiro") || colName.includes("ferro unindo")) {
      bedType = "2_solteiro";
    } else {
      bedType = "casal";
    }
  }
  const bedLabel = (bedType === "2_solteiro" || bedType === "solteiro") ? "2 Camas de Solteiro 🛏️🛏️" : "Cama Inteira / Casal 🛏️";

  // Micro-ondas
  let hasMicrowave = flat.hasMicrowave;
  if (hasMicrowave === undefined) {
    hasMicrowave = tagsLower.some(t => t.includes("micro-ondas") || t.includes("microondas")) || (Array.isArray(flat.features) && flat.features.includes("microondas"));
  }

  return {
    id: flat.id,
    number: String(flat.number),
    name: flat.colName || `Flat ${flat.number}`,
    colName: flat.colName || "",
    tags,
    airConditionerType,
    airConditionerLabel,
    airConditioner: airConditionerType,
    bedType,
    bedLabel,
    bed: bedType,
    hasMicrowave: Boolean(hasMicrowave),
    features: Array.isArray(flat.features) ? flat.features : [],
    notes: flat.notes || ""
  };
}

/**
 * Busca e filtra flats por comodidades e tags
 */
export function searchFlatsByAmenities(db, criteria = {}) {
  const flats = (db?.flats || []).filter(f => f.isActive !== false && f.status !== "manutencao_bloqueada");
  const mapped = flats.map(f => getFlatAmenitiesInfo(f));

  if (!criteria || Object.keys(criteria).length === 0) {
    return mapped;
  }

  let filtered = mapped;

  if (criteria.flatNumber) {
    const fNum = String(criteria.flatNumber).trim();
    filtered = filtered.filter(f => f.number === fNum || String(f.id) === fNum);
  }

  if (criteria.airConditionerType || criteria.split !== undefined) {
    const wantSplit = criteria.split !== undefined ? Boolean(criteria.split) : String(criteria.airConditionerType).toLowerCase().includes("split");
    if (wantSplit) {
      filtered = filtered.filter(f => f.airConditionerType === "split" || f.tags.some(t => /split/i.test(t)) || /split/i.test(f.colName));
    } else {
      filtered = filtered.filter(f => f.airConditionerType === "janela" || f.tags.some(t => /janela|parede/i.test(t)) || /janela|parede/i.test(f.colName));
    }
  }

  if (criteria.bedType) {
    const wantCasal = /casal|double|queen|king|inteira|cama_inteira|cama\s+inteira/i.test(String(criteria.bedType));
    const wantSolteiro = /solteiro|twin|2_solteiro/i.test(String(criteria.bedType));
    if (wantCasal) {
      filtered = filtered.filter(f => f.bedType === "casal");
    } else if (wantSolteiro) {
      filtered = filtered.filter(f => f.bedType === "2_solteiro" || f.bedType === "solteiro");
    }
  }

  if (criteria.hasMicrowave !== undefined || criteria.microwave !== undefined) {
    const wantMicro = criteria.hasMicrowave !== undefined ? Boolean(criteria.hasMicrowave) : Boolean(criteria.microwave);
    filtered = filtered.filter(f => f.hasMicrowave === wantMicro);
  }

  if (criteria.tag) {
    const tagNorm = String(criteria.tag).toLowerCase();
    filtered = filtered.filter(f => f.tags.some(t => String(t).toLowerCase().includes(tagNorm)));
  }

  if (criteria.query && typeof criteria.query === "string") {
    const qLower = criteria.query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/split/i.test(qLower)) {
      filtered = filtered.filter(f => f.airConditionerType === "split" || f.tags.some(t => /split/i.test(t)) || /split/i.test(f.colName));
    } else if (/micro[- ]?ondas/i.test(qLower)) {
      filtered = filtered.filter(f => f.hasMicrowave);
    } else if (/casal|inteira|cama\s+inteira/i.test(qLower)) {
      filtered = filtered.filter(f => f.bedType === "casal");
    } else if (/solteiro|duas camas|2 camas/i.test(qLower)) {
      filtered = filtered.filter(f => f.bedType === "2_solteiro" || f.bedType === "solteiro");
    }
  }

  return filtered;
}

/**
 * Handler de ação de bot para consulta de comodidades e tags dos flats
 */
export function handleGetFlatAmenities(db, args = {}) {
  const criteria = typeof args.criteria === "string" ? { query: args.criteria } : (args.criteria || {});
  if (args.flatNumber) criteria.flatNumber = args.flatNumber;
  if (args.bedType) criteria.bedType = args.bedType;
  if (args.split !== undefined) criteria.split = args.split;
  if (args.hasMicrowave !== undefined) criteria.hasMicrowave = args.hasMicrowave;

  const results = searchFlatsByAmenities(db, criteria);
  return {
    success: true,
    count: results.length,
    flats: results
  };
}

/**
 * Verifica se um hóspede solicitou ou possui trava de Quarto Preferencial para um flat
 */
export function hasGuestRequestedSpecificFlat(db, res, targetFlatNumber = null) {
  if (!res) return false;
  const fNum = String(targetFlatNumber || res.flatNumber || (db?.flats || []).find(f => f.id === res.flatId)?.number || "").trim();

  // 1. Trava explícita no PMS (Quarto Preferencial / Não Trocar)
  if (res.isFlatLocked === true || res.flatLocked === true || res.isPreferredFlat === true) {
    return true;
  }

  // 2. Campo requestedFlat ou preferredFlat
  if (res.requestedFlat && (!fNum || String(res.requestedFlat) === fNum)) return true;
  if (res.preferredFlat && (!fNum || String(res.preferredFlat) === fNum)) return true;

  if (!fNum) return false;

  // Regex robustas para detecção de preferência em português
  const flatLockRegex = new RegExp(`(?:quarto|flat|apto|apartamento|uh)?\\s*${fNum}\\s*(?:fixo|preferencial|bloquead[ao]|exclusiv[ao]|solicitad[ao]|garantid[ao])`, "i");
  const specificLockRegex = new RegExp(`(?:manter\\s+no\\s+${fNum}|n[aã]o\\s+(?:trocar|mudar|alterar)\\s+(?:o\\s+)?(?:flat|quarto|apto)?\\s*${fNum})`, "i");
  const generalLockRegex = /(?:quarto|flat|apto|apartamento|uh)\s*(?:preferencial|fixo|bloquead[ao]|n[aã]o\s+alterar|n[aã]o\s+mudar|exclusiv[ao])/i;
  const verbOrPref = `(?:pediu|solicitou|solicito|quer(?:ia)?|quis|gostaria|gostariamos|exigiu|exige|prefer[eê]|prefiro|preferia|preferimos|prefer[eê]ncia|escolh(?:i|eu|emos|a)|faz\\s+quest[aã]o|favor\\s+colocar|pode\\s+ser|tem\\s+como|se\\s+poss[ií]vel|se\\s+der|de\\s+prefer[eê]ncia|me\\s+coloca|me\\s+bota|colocar\\s+no|botar\\s+no|ficar\\s+no)`;
  const roomPattern = `(?:\\b(?:no|o|pro|pra|para|do|da)?\\s*(?:flat|quarto|apto|apartamento|uh)?\\s*${fNum}\\b)`;
  const requestRegex = new RegExp(`${verbOrPref}.*?${roomPattern}`, "i");
  const reverseRegex = new RegExp(`${roomPattern}.*?(?:a\\s+pedido|solicitad[ao]|preferencial|fixo|escolhid[ao])`, "i");

  // 3. Notas e solicitações especiais da reserva
  const combinedNotes = `${res.notes || ""} ${res.specialRequests || ""} ${res.receptionNotes || ""} ${res.obs || ""}`.toLowerCase();
  if (flatLockRegex.test(combinedNotes) || specificLockRegex.test(combinedNotes) || generalLockRegex.test(combinedNotes) || requestRegex.test(combinedNotes) || reverseRegex.test(combinedNotes)) {
    return true;
  }

  // 4. Histórico de conversas do hóspede no WhatsApp e histórico de mensagens
  const phoneCandidates = new Set();
  const addPhoneDigits = (raw) => {
    if (!raw) return;
    const digits = String(raw).replace(/\D/g, "");
    if (!digits) return;
    phoneCandidates.add(digits);
    const cleaned = cleanWhatsAppPhone(raw);
    if (cleaned) phoneCandidates.add(cleaned);
    if (digits.startsWith("55") && digits.length >= 12) {
      phoneCandidates.add(digits.substring(2));
    }
  };

  addPhoneDigits(res.guestPhone);
  addPhoneDigits(res.phone);
  addPhoneDigits(res.guests?.[0]?.phone);

  if (res.guestId && Array.isArray(db?.guests)) {
    const g = db.guests.find(x => x.id === res.guestId);
    if (g?.phone) addPhoneDigits(g.phone);
  }

  const candidateDigitsList = Array.from(phoneCandidates);
  const phoneMatches = (targetPhone) => {
    if (!targetPhone) return false;
    const tDigits = String(targetPhone).replace(/\D/g, "");
    if (!tDigits) return false;
    return candidateDigitsList.some(cand =>
      cand === tDigits ||
      cand.endsWith(tDigits) ||
      tDigits.endsWith(cand) ||
      (cand.length >= 8 && tDigits.length >= 8 && cand.slice(-8) === tDigits.slice(-8))
    );
  };

  // 4.1 Mensagens nas conversas do WhatsApp (db.whatsappConversations)
  if (Array.isArray(db?.whatsappConversations) && candidateDigitsList.length > 0) {
    const matchingConvs = db.whatsappConversations.filter(c => phoneMatches(c.clientPhone));
    for (const conv of matchingConvs) {
      if (Array.isArray(conv.messages)) {
        const guestMessages = conv.messages.filter(m => !m.fromMe && m.text).map(m => String(m.text).toLowerCase());
        for (const msg of guestMessages) {
          if (flatLockRegex.test(msg) || generalLockRegex.test(msg) || requestRegex.test(msg) || reverseRegex.test(msg)) {
            return true;
          }
        }
      }
    }
  }

  // 4.2 Histórico consolidado de WhatsApp (db.whatsappHistory)
  if (Array.isArray(db?.whatsappHistory)) {
    const matchingHistory = db.whatsappHistory.filter(h =>
      (h.reservationCode && (h.reservationCode === res.code || String(h.reservationId) === String(res.id))) ||
      phoneMatches(h.guestPhone)
    );
    for (const h of matchingHistory) {
      const msg = String(h.message || h.text || "").toLowerCase();
      if (flatLockRegex.test(msg) || generalLockRegex.test(msg) || requestRegex.test(msg) || reverseRegex.test(msg)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Encontra um flat alternativo livre para um hóspede que precise ser deslocado
 */
export function findAlternateFlatForGuest(db, candidateRes, excludeFlatNumbers = [], ignoreReservationId = null) {
  if (!candidateRes) return null;
  const inDate = candidateRes.checkinDate;
  const outDate = candidateRes.checkoutDate;
  const excludeSet = new Set((excludeFlatNumbers || []).map(n => String(n).trim()));

  const allFlats = (db?.flats || []).filter(f =>
    f.isActive !== false &&
    f.status !== "manutencao_bloqueada" &&
    !excludeSet.has(String(f.number))
  );

  // Ordenação inteligente de flats:
  // 1. Prioriza camas idênticas (ex: se o hóspede precisa de 2 solteiro ou cama de casal)
  // 2. Prioriza andar alto se solicitado
  const wantTwin = Boolean(candidateRes.twinBeds);
  const wantHighFloor = Boolean(candidateRes.prefersHighFloor);

  const sortedFlats = [...allFlats].sort((a, b) => {
    const infoA = getFlatAmenitiesInfo(a);
    const infoB = getFlatAmenitiesInfo(b);

    if (wantTwin) {
      const aIsTwin = (infoA.bedType === "2_solteiro" || infoA.bedType === "solteiro");
      const bIsTwin = (infoB.bedType === "2_solteiro" || infoB.bedType === "solteiro");
      if (aIsTwin && !bIsTwin) return -1;
      if (!aIsTwin && bIsTwin) return 1;
    }

    if (wantHighFloor) {
      const floorA = Number(String(a.number).length === 4 ? String(a.number).slice(0, 2) : String(a.number).slice(0, 1)) || 0;
      const floorB = Number(String(b.number).length === 4 ? String(b.number).slice(0, 2) : String(b.number).slice(0, 1)) || 0;
      if (floorA !== floorB) return floorB - floorA;
    }

    return 0;
  });

  for (const flat of sortedFlats) {
    const fId = flat.id;
    const fNum = String(flat.number);

    // Conflito com outras reservas ativas no PMS
    const hasConflict = (db?.reservations || []).some(r => {
      if (r.id === candidateRes.id) return false;
      if (ignoreReservationId != null && (r.id === ignoreReservationId || r.code === ignoreReservationId)) return false;
      if (r.status === "cancelada" || r.status === "expirada") return false;
      const matchesFlat = (r.flatId === fId || String(r.flatNumber) === fNum);
      return matchesFlat && r.checkinDate < outDate && r.checkoutDate > inDate;
    });

    if (hasConflict) continue;

    // Conflito com bloqueios de quarto
    const hasBlock = (db?.roomBlocks || []).some(b => {
      const matchesFlat = (b.flatId === fId || String(b.flatNumber) === fNum);
      return matchesFlat && b.startDate < outDate && b.endDate > inDate;
    });

    if (hasBlock) continue;

    return flat;
  }

  return null;
}

/**
 * Realoca uma reserva de flat, com capacidade de deslocar hóspede futuro não-fixo
 * Implementa validação estrita em duas fases (atômica): se qualquer sobreposição não puder ser deslocada,
 * nenhuma alteração é aplicada ao banco de dados.
 */
export function handleReallocateReservationFlat(db, args = {}) {
  const targetFlatIdentifier = String(args.targetFlatNumber || args.targetFlatId || args.targetFlat || "").trim();
  const resIdentifier = String(args.reservationId || args.reservationCode || args.code || args.id || "").trim();
  const phone = args.phone || args.guestPhone;
  const guestName = args.guestName;
  const currentFlat = args.currentFlatNumber || args.currentFlat;

  if (!targetFlatIdentifier) {
    return {
      success: false,
      error: "MISSING_TARGET_FLAT",
      message: "O número do flat de destino é obrigatório."
    };
  }

  const flats = (db?.flats || []).filter(f => f.isActive !== false);
  const targetFlat = flats.find(f => String(f.number) === targetFlatIdentifier || String(f.id) === targetFlatIdentifier);
  if (!targetFlat) {
    return {
      success: false,
      error: "FLAT_NOT_FOUND",
      message: `Flat ${targetFlatIdentifier} não foi encontrado no cadastro.`
    };
  }

  // Localiza a reserva do solicitante (Res A)
  const reservations = db?.reservations || [];
  let resA = null;

  if (resIdentifier) {
    resA = reservations.find(r => String(r.id) === resIdentifier || String(r.code) === resIdentifier);
  }

  if (!resA && phone) {
    const cleanP = cleanWhatsAppPhone(phone);
    resA = reservations.find(r =>
      r.status !== "cancelada" && r.status !== "expirada" &&
      matchClientPhone(r.guestPhone || r.phone, cleanP)
    );
  }

  if (!resA && currentFlat) {
    resA = reservations.find(r =>
      r.status !== "cancelada" && r.status !== "expirada" &&
      (String(r.flatNumber) === String(currentFlat) || String(r.flatId) === String(currentFlat))
    );
  }

  if (!resA && guestName) {
    const gNorm = guestName.toLowerCase().trim();
    resA = reservations.find(r =>
      r.status !== "cancelada" && r.status !== "expirada" &&
      r.guestName && r.guestName.toLowerCase().trim().includes(gNorm)
    );
  }

  if (!resA) {
    return {
      success: false,
      error: "RESERVATION_NOT_FOUND",
      message: "Reserva não encontrada para efetuar a realocação."
    };
  }

  if (resA.status === "cancelada" || resA.status === "expirada") {
    return {
      success: false,
      error: "RESERVATION_INACTIVE",
      message: `A reserva ${resA.code || resA.id} está com status '${resA.status}' e não pode ser remanejada.`
    };
  }

  // 1. GUARDA: Hóspede solicitante já realizou check-in
  const isRequesterCheckedIn = resA.checkedIn || resA.checkinConfirmed || resA.status === "hospedado" || resA.status === "checked_in" || resA.fnhrCompleted;
  if (isRequesterCheckedIn) {
    return {
      success: false,
      error: "REQUESTER_ALREADY_CHECKED_IN",
      message: `Não é possível remanejar autonomamente: o hóspede ${resA.guestName} já realizou check-in / está hospedado no Flat ${resA.flatNumber}. Solicite atendimento à recepção.`
    };
  }

  // 2. GUARDA: Hóspede solicitante possui trava de Quarto Preferencial / Não Trocar
  if (resA.isFlatLocked === true || resA.flatLocked === true || resA.isPreferredFlat === true) {
    return {
      success: false,
      error: "RESERVATION_FLAT_LOCKED",
      message: `Não é possível alterar o quarto desta reserva: o flat atual (${resA.flatNumber}) foi bloqueado/fixado como Quarto Preferencial no PMS${resA.flatLockReason ? ` (${resA.flatLockReason})` : ""}. A Sofia AI está proibida de alterar este quarto; apenas um administrador pode fazer essa alteração.`
    };
  }

  const oldFlatNumber = String(resA.flatNumber || (flats.find(f => f.id === resA.flatId)?.number || ""));
  if (oldFlatNumber === String(targetFlat.number)) {
    return {
      success: true,
      reallocated: false,
      alreadyAllocated: true,
      flatNumber: String(targetFlat.number),
      message: `A reserva de ${resA.guestName} já está alocada no Flat ${targetFlat.number}.`
    };
  }

  // Verifica bloqueio de quarto no flat de destino
  const hasBlock = (db?.roomBlocks || []).some(b => {
    const matches = (b.flatId === targetFlat.id || String(b.flatNumber) === String(targetFlat.number));
    return matches && b.startDate < resA.checkoutDate && b.endDate > resA.checkinDate;
  });

  if (hasBlock) {
    return {
      success: false,
      error: "FLAT_BLOCKED",
      message: `O Flat ${targetFlat.number} possui bloqueio operacional ou de manutenção no período desejado.`
    };
  }

  // Verifica reservas concorrentes no flat de destino
  const overlaps = reservations.filter(r =>
    r.id !== resA.id &&
    r.status !== "cancelada" && r.status !== "expirada" &&
    (r.flatId === targetFlat.id || String(r.flatNumber) === String(targetFlat.number)) &&
    r.checkinDate < resA.checkoutDate && r.checkoutDate > resA.checkinDate
  );

  // FASE 1: Planejamento e validação atômica de todas as sobreposições
  const plannedDisplacements = [];
  const assignedAltFlatNumbers = new Set([String(targetFlat.number)]);

  if (overlaps.length > 0) {
    for (const resB of overlaps) {
      const isOccupantCheckedIn = resB.checkedIn || resB.checkinConfirmed || resB.status === "hospedado" || resB.status === "checked_in" || resB.fnhrCompleted;
      if (isOccupantCheckedIn) {
        return {
          success: false,
          error: "OCCUPANT_CHECKED_IN",
          message: `Não é possível remanejar: o hóspede ${resB.guestName} já realizou check-in / está hospedado no Flat ${targetFlat.number}.`
        };
      }

      if (hasGuestRequestedSpecificFlat(db, resB, targetFlat.number)) {
        return {
          success: false,
          error: "FLAT_LOCKED_OR_REQUESTED",
          message: `Não é possível remanejar: o Flat ${targetFlat.number} possui trava de Quarto Preferencial ou foi solicitado expressamente pelo hóspede alocado (${resB.guestName}).`
        };
      }

      // Tenta encontrar flat alternativo para Res B (permitindo o flat que Res A está desocupando!)
      const altFlat = findAlternateFlatForGuest(db, resB, Array.from(assignedAltFlatNumbers), resA.id);
      if (!altFlat) {
        return {
          success: false,
          error: "NO_ALTERNATE_FLAT",
          message: `Não foi possível remanejar: o Flat ${targetFlat.number} está ocupado por ${resB.guestName} e não há outro flat disponível para realocá-lo.`
        };
      }

      assignedAltFlatNumbers.add(String(altFlat.number));
      plannedDisplacements.push({
        reservation: resB,
        altFlat
      });
    }
  }

  // FASE 2: Aplicação atômica das alterações (todas as garantias foram cumpridas)
  let lastDisplacedInfo = null;
  const nowIso = new Date().toISOString();

  for (const plan of plannedDisplacements) {
    const { reservation: resB, altFlat } = plan;
    const prevNum = String(resB.flatNumber || "");

    resB.previousFlatNumber = prevNum;
    resB.flatId = altFlat.id;
    resB.flatNumber = String(altFlat.number);
    resB.reallocatedBy = "sofia_ai";
    resB.reallocationReason = `Remanejado automaticamente para liberar Flat ${targetFlat.number} para ${resA.guestName} (${args.reason || "solicitação de hóspede"})`;
    resB.updatedAt = nowIso;

    if (!Array.isArray(resB.auditLogs)) resB.auditLogs = [];
    resB.auditLogs.unshift({
      timestamp: nowIso,
      action: "RESERVATION_REALLOCATED_BY_SOFIA",
      actor: { name: "Sofia (IA CorpFlats)", role: "bot" },
      description: `Deslocado do Flat ${targetFlat.number} para o Flat ${altFlat.number} para atender solicitação de ${resA.guestName}`
    });

    lastDisplacedInfo = {
      id: resB.id,
      code: resB.code,
      guestName: resB.guestName,
      previousFlat: String(targetFlat.number),
      newFlat: String(altFlat.number)
    };
  }

  // Realoca Res A para o targetFlat
  resA.previousFlatNumber = oldFlatNumber;
  resA.flatId = targetFlat.id;
  resA.flatNumber = String(targetFlat.number);
  resA.reallocatedBy = "sofia_ai";
  resA.reallocationReason = args.reason || "Solicitação de troca pelo hóspede via WhatsApp";
  resA.updatedAt = nowIso;

  if (!Array.isArray(resA.auditLogs)) resA.auditLogs = [];
  resA.auditLogs.unshift({
    timestamp: nowIso,
    action: "RESERVATION_REALLOCATED_BY_SOFIA",
    actor: { name: "Sofia (IA CorpFlats)", role: "bot" },
    description: `Realocado do Flat ${oldFlatNumber} para o Flat ${targetFlat.number}${args.reason ? ` (${args.reason})` : ""}`
  });

  // Atualiza solicitações de limpeza associadas na governança se aplicável
  if (Array.isArray(db?.cleaningRequests)) {
    const today = getBrasiliaDateParts().todayStr;
    const reqA = db.cleaningRequests.find(c =>
      (c.flatId === resA.flatId || String(c.flatNumber) === oldFlatNumber) &&
      (c.requestDate === resA.checkinDate || c.requestDate === today)
    );
    if (reqA) {
      reqA.flatId = targetFlat.id;
      reqA.flatNumber = String(targetFlat.number);
      reqA.updatedAt = nowIso;
    }
  }

  const successMsg = lastDisplacedInfo
    ? `Flat remanejado com sucesso para ${targetFlat.number}! O hóspede ${lastDisplacedInfo.guestName} foi realocado com sucesso para o Flat ${lastDisplacedInfo.newFlat}.`
    : `Flat remanejado com sucesso para ${targetFlat.number}!`;

  return {
    success: true,
    reallocated: true,
    reservationId: resA.id,
    code: resA.code,
    guestName: resA.guestName,
    previousFlat: oldFlatNumber,
    newFlat: String(targetFlat.number),
    displacedReservation: lastDisplacedInfo,
    displacedCount: plannedDisplacements.length,
    message: successMsg
  };
}

function handleCheckAvailability(db, args = {}) {
  const inDate = args.checkIn || args.checkin;
  const outDate = args.checkOut || args.checkout;
  const guests = Math.max(1, Number(args.guests || args.guestsCount || 1));

  if (!inDate || !outDate) {
    return {
      error: "MISSING_DATES",
      message: "checkIn e checkOut são obrigatórios no formato YYYY-MM-DD."
    };
  }

  if (inDate >= outDate) {
    return {
      error: "INVALID_DATE_RANGE",
      message: "checkIn deve ser anterior a checkOut."
    };
  }

  const nowMs = Date.now();
  // 1. Limpeza de pré-reservas vencidas
  (db?.reservations || []).forEach(r => {
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt) {
      if (new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") {
        r.status = "expirada";
        r.updatedAt = new Date().toISOString();
      }
    }
  });

  // 2. Mapeamento de conflitos (exclui reservas com check-out já concluído)
  const busyFlatSet = new Set();
  (db?.reservations || []).forEach(r => {
    const statusNorm = String(r.status || "").toLowerCase();
    if (["cancelada", "cancelled", "expirada", "completed", "checked_out", "finalizada", "concluida", "checkout", "no_show"].includes(statusNorm)) return;
    if (isReservationCheckoutCompleted(r, db)) return;
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return;

    if (r.checkinDate < outDate && r.checkoutDate > inDate) {
      if (r.flatId != null) busyFlatSet.add(String(r.flatId));
      if (r.flatNumber != null) busyFlatSet.add(String(r.flatNumber));
      if (r.roomNumber != null) busyFlatSet.add(String(r.roomNumber));
    }
  });

  (db?.roomBlocks || []).forEach(b => {
    if (b.startDate < outDate && b.endDate > inDate) {
      if (b.flatId != null) busyFlatSet.add(String(b.flatId));
      if (b.flatNumber != null) busyFlatSet.add(String(b.flatNumber));
      if (b.roomNumber != null) busyFlatSet.add(String(b.roomNumber));
    }
  });

  // 3. Unidades habitacionais disponíveis (ordenadas numericamente)
  const rawUnits = (Array.isArray(db?.flats) && db.flats.length > 0) ? db.flats : (db?.rooms || []);
  const allFlats = rawUnits.filter(f => !f.status || f.status !== "manutencao_bloqueada");
  const siteCfg = db?.siteConfig || {};
  const maxCapacity = siteCfg?.extraBedConfig?.enabled ? (siteCfg.extraBedConfig.maxGuests || 3) : 2;

  const availableFlats = allFlats
    .filter(f => {
      const isBusy = (f.id != null && busyFlatSet.has(String(f.id))) || (f.number != null && busyFlatSet.has(String(f.number)));
      if (isBusy) return false;
      if (guests > maxCapacity) return false;
      return true;
    })
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

  return {
    success: true,
    available: availableFlats.length > 0,
    totalAvailable: availableFlats.length,
    checkIn: inDate,
    checkOut: outDate,
    guests,
    flats: availableFlats.map(f => {
      const info = getFlatAmenitiesInfo(f);
      return {
        id: f.id,
        number: f.number,
        name: f.colName || `Flat ${f.number}`,
        isOccupied: false,
        tags: info?.tags || [],
        airConditionerType: info?.airConditionerType || "split",
        airConditionerLabel: info?.airConditionerLabel || "Ar-condicionado Split ❄️",
        airConditioner: info?.airConditionerType || "split",
        bedType: info?.bedType || "casal",
        bedLabel: info?.bedLabel || "Cama de Casal 🛏️",
        bed: info?.bedType || "casal",
        hasMicrowave: info?.hasMicrowave ?? true,
        features: info?.features || []
      };
    })
  };
}

function handleCalculateQuote(db, args = {}) {
  const inDate = args.checkIn || args.checkin;
  const outDate = args.checkOut || args.checkout;
  const guests = Math.max(1, Number(args.guests || args.guestsCount || 1));
  const flatId = args.flatId || null;
  const channel = args.channel || "direct";
  const ratePlan = args.ratePlan || "room_only";

  if (!inDate || !outDate) {
    return {
      error: "MISSING_DATES",
      message: "checkIn e checkOut são obrigatórios."
    };
  }

  const start = new Date(inDate + "T12:00:00Z");
  const end = new Date(outDate + "T12:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return {
      error: "INVALID_DATE_RANGE",
      message: "checkIn deve ser uma data anterior a checkOut."
    };
  }

  const nightsDiff = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (nightsDiff > 90) {
    return {
      error: "MAX_STAY_EXCEEDED",
      message: "O período máximo para cotação automatizada é de 90 noites."
    };
  }

  const dailyRates = [];
  const cur = new Date(start);
  while (cur < end) {
    const dStr = cur.toISOString().substring(0, 10);
    const rate = computeDailyRate(db, flatId, dStr, channel);
    dailyRates.push({
      date: dStr,
      rate
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const nights = dailyRates.length;
  const roomTotal = Math.round(dailyRates.reduce((acc, n) => acc + n.rate, 0) * 100) / 100;

  const siteCfg = db?.siteConfig || {};
  const plans = siteCfg.ratePlans || {};
  const selectedPlan = plans[ratePlan] || plans["room_only"] || { cleaningFeeAmount: 70 };

  let cleaningFee = 0;
  if (ratePlan !== "with_breakfast" && selectedPlan.cleaningFeeEnabled !== false) {
    cleaningFee = Number(selectedPlan.cleaningFeeAmount != null ? selectedPlan.cleaningFeeAmount : 70);
  }

  let extraBedFee = 0;
  const extraBedCfg = siteCfg.extraBedConfig || { enabled: true, feeAmount: 60 };
  if (guests > 2 && extraBedCfg.enabled) {
    extraBedFee = Number(extraBedCfg.feeAmount || 60);
  }

  let breakfastFee = 0;
  if (ratePlan === "with_breakfast") {
    const planBreakfastRate = Number(plans.with_breakfast?.dailyRate || 225);
    const planRoomOnlyRate = Number(plans.room_only?.dailyRate || 190);
    const breakfastDiffPerNight = Math.max(35, planBreakfastRate - planRoomOnlyRate);
    breakfastFee = Math.round(breakfastDiffPerNight * nights * 100) / 100;
  }

  const total = Math.round((roomTotal + cleaningFee + extraBedFee + breakfastFee) * 100) / 100;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return {
    success: true,
    quoteId: `quote_${Date.now()}`,
    checkIn: inDate,
    checkOut: outDate,
    nights,
    guests,
    flatId,
    channel,
    ratePlan,
    roomTotal,
    cleaningFee,
    extraBedFee,
    breakfastFee,
    total,
    dailyRates,
    expiresAt
  };
}

function createPreReservationSync(db, args = {}) {
  const inDate = args.checkIn || args.checkin;
  const outDate = args.checkOut || args.checkout;
  const guestName = args.guestName;
  const guestPhone = args.guestPhone || "";
  const fairDefault = (!args.flatId && inDate && outDate)
    ? selectFairShareFlat(db, inDate, outDate)?.recommendedFlat
    : null;
  const flatId = args.flatId || fairDefault?.id || fairDefault?.number;
  const channel = args.channel || "whatsapp";
  const guests = Math.max(1, Number(args.guests || args.guestsCount || 1));
  const ratePlan = args.ratePlan || "room_only";

  if (!inDate || !outDate || !guestName || !flatId) {
    return {
      error: "MISSING_FIELDS",
      message: "flatId, checkIn, checkOut e guestName são obrigatórios."
    };
  }

  const flat = (db?.flats || []).find(f => String(f.id) === String(flatId) || String(f.number) === String(flatId));
  if (!flat) {
    return {
      error: "FLAT_NOT_FOUND",
      message: "Apartamento informado não foi encontrado."
    };
  }

  // Verificação de conflito (exclui reservas com check-out já concluído)
  const nowMs = Date.now();
  const hasConflict = (db?.reservations || []).some(r => {
    const statusNorm = String(r.status || "").toLowerCase();
    if (["cancelada", "cancelled", "expirada", "completed", "checked_out", "finalizada", "concluida", "checkout", "no_show"].includes(statusNorm)) return false;
    if (isReservationCheckoutCompleted(r, db)) return false;
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
    if (String(r.flatId) !== String(flat.id) && String(r.flatNumber) !== String(flat.number)) return false;
    return r.checkinDate < outDate && r.checkoutDate > inDate;
  });

  if (hasConflict) {
    return {
      error: "FLAT_UNAVAILABLE",
      message: `O Flat ${flat.number} já possui reserva ou bloqueio para o período selecionado.`
    };
  }

  let total = Number(args.total || 0);
  if (!(total > 0)) {
    const autoQuote = handleCalculateQuote(db, {
      checkIn: inDate,
      checkOut: outDate,
      guests,
      flatId: flat.id,
      channel: channel === "whatsapp" ? "direct" : channel,
      ratePlan
    });
    if (autoQuote && autoQuote.success && autoQuote.total > 0) {
      total = autoQuote.total;
    }
  }

  const botSettings = getBotActionsSettings(db);
  const holdMinutes = botSettings.preReservationHoldMinutes || 30;
  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

  const nextId = db?.reservations && db.reservations.length > 0
    ? Math.max(...db.reservations.map(r => r.id || 0)) + 1
    : 1;
  const code = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
  const cleanTxId = code.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);

  const pixPayload = generateStaticPixPayload({
    pixKey: db?.settings?.interConfig?.pixKey || "47964813000165",
    amount: total,
    merchantName: "CORPFLATS LTDA",
    merchantCity: "CAMPOS DOS GOYTACAZES",
    txid: cleanTxId
  });

  const newReservation = {
    id: nextId,
    code,
    flatId: flat.id,
    flatNumber: String(flat.number),
    guestName: String(guestName).trim(),
    guestPhone: cleanWhatsAppPhone(guestPhone || ""),
    phone: cleanWhatsAppPhone(guestPhone || ""),
    guestsCount: guests,
    checkinDate: inDate,
    checkoutDate: outDate,
    channel,
    ratePlan,
    status: "pre_reserva",
    paymentStatus: "pendente",
    totalAmount: total,
    paidAmount: 0,
    expiresAt,
    pixCopiaECola: pixPayload,
    pixTxId: cleanTxId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!Array.isArray(db.reservations)) db.reservations = [];
  db.reservations.unshift(newReservation);

  return {
    success: true,
    reservationId: newReservation.id,
    code: newReservation.code,
    flatId: newReservation.flatId,
    flatNumber: newReservation.flatNumber,
    checkIn: newReservation.checkinDate,
    checkOut: newReservation.checkoutDate,
    guestName: newReservation.guestName,
    total: newReservation.totalAmount,
    status: "pre_reserva",
    expiresAt: newReservation.expiresAt,
    pixCopiaECola: pixPayload,
    qrCodeBase64: "",
    holdMinutes
  };
}

async function handleCreatePreReservation(db, args = {}) {
  const syncResult = createPreReservationSync(db, args);
  if (!syncResult.success) {
    return syncResult;
  }

  let qrCodeBase64 = "";
  try {
    const qrcodeMod = await import("qrcode").catch(() => null);
    const QRCode = qrcodeMod?.default || qrcodeMod;
    if (QRCode && typeof QRCode.toDataURL === "function") {
      qrCodeBase64 = await QRCode.toDataURL(syncResult.pixCopiaECola);
    }
  } catch (_) {}

  syncResult.qrCodeBase64 = qrCodeBase64;
  return syncResult;
}

async function handleGeneratePayment(db, args = {}) {
  const targetId = args.reservationId || args.reservationCode || args.code;
  let resObj = null;
  if (targetId) {
    resObj = (db?.reservations || []).find(r =>
      String(r.id) === String(targetId) || String(r.code) === String(targetId)
    );
  }

  const senderPhone = args.requesterPhone || args.phone || args.guestPhone || "";
  if (resObj && args.requesterRole !== "admin" && isNonRequesterGuestForReservation(resObj, senderPhone, db)) {
    const rec = getReservationRecipients(resObj, db);
    return {
      success: false,
      error: "BILLING_HANDLED_BY_REQUESTER",
      message: `O pagamento e faturamento desta reserva são tratados diretamente com o solicitante responsável (${rec.requester.name}). Não envie cobrança ou PIX ao hóspede.`
    };
  }

  const resolvedAmount = Number(args.amount || resObj?.totalAmount || 0);
  if (isNaN(resolvedAmount) || resolvedAmount <= 0) {
    return {
      error: "INVALID_AMOUNT",
      message: "O valor do pagamento deve ser maior que zero."
    };
  }

  const resolvedGuestName = args.guestName || resObj?.guestName || "Hospede CorpFlats";
  const cleanTxId = (resObj?.code || `PIX${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);

  const pixPayload = generateStaticPixPayload({
    pixKey: db?.settings?.interConfig?.pixKey || "47964813000165",
    amount: resolvedAmount,
    merchantName: "CORPFLATS LTDA",
    merchantCity: "CAMPOS DOS GOYTACAZES",
    txid: cleanTxId
  });

  let qrCodeBase64 = "";
  try {
    const qrcodeMod = await import("qrcode").catch(() => null);
    const QRCode = qrcodeMod?.default || qrcodeMod;
    if (QRCode && typeof QRCode.toDataURL === "function") {
      qrCodeBase64 = await QRCode.toDataURL(pixPayload);
    }
  } catch (_) {}

  const botSettings = getBotActionsSettings(db);
  const holdMinutes = botSettings.preReservationHoldMinutes || 30;
  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

  if (resObj) {
    resObj.pixCopiaECola = pixPayload;
    resObj.pixTxId = cleanTxId;
    resObj.updatedAt = new Date().toISOString();
  }

  return {
    success: true,
    reservationId: resObj ? resObj.id : null,
    reservationCode: resObj ? resObj.code : null,
    amount: resolvedAmount,
    guestName: resolvedGuestName,
    pixCopiaECola: pixPayload,
    qrCodeBase64,
    expiresAt
  };
}

function handleCommitReservation(db, args = {}) {
  const targetId = args.reservationId || args.reservationCode || args.code;
  if (!targetId) {
    return {
      error: "MISSING_RESERVATION_ID",
      message: "reservationId é obrigatório."
    };
  }

  const reservation = (db?.reservations || []).find(r =>
    String(r.id) === String(targetId) || String(r.code) === String(targetId)
  );

  if (!reservation) {
    return {
      error: "RESERVATION_NOT_FOUND",
      message: "Reserva não encontrada."
    };
  }

  if (reservation.status === "cancelada") {
    return {
      error: "RESERVATION_CANCELLED",
      message: "Esta reserva está cancelada e não pode ser efetivada."
    };
  }

  const nowMs = Date.now();
  const isExpired = reservation.status === "expirada" ||
    ((reservation.status === "pre_reserva" || reservation.status === "pendente") &&
      reservation.expiresAt &&
      new Date(reservation.expiresAt).getTime() < nowMs &&
      reservation.paymentStatus !== "pago_total");

  if (isExpired) {
    reservation.status = "expirada";
    reservation.updatedAt = new Date().toISOString();
    return {
      error: "PRE_RESERVATION_EXPIRED",
      message: "Esta pré-reserva expirou e não pode ser efetivada. Realize uma nova cotação."
    };
  }

  const hasConflict = (db?.reservations || []).some(r => {
    if (String(r.id) === String(reservation.id) || String(r.code) === String(reservation.code)) return false;
    if (r.status === "cancelada" || r.status === "expirada") return false;
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
    if (String(r.flatId) !== String(reservation.flatId) && String(r.flatNumber) !== String(reservation.flatNumber)) return false;
    return r.checkinDate < reservation.checkoutDate && r.checkoutDate > reservation.checkinDate;
  });

  if (hasConflict) {
    return {
      error: "FLAT_UNAVAILABLE",
      message: `O Flat ${reservation.flatNumber || reservation.flatId} já possui outra reserva confirmada para o período selecionado.`
    };
  }

  reservation.status = "confirmada";
  reservation.paymentStatus = "pago_total";
  reservation.paidAmount = reservation.totalAmount;
  reservation.pmsConfirmed = true;
  reservation.confirmedAt = new Date().toISOString();
  reservation.updatedAt = new Date().toISOString();

  return {
    success: true,
    reservationId: reservation.id,
    code: reservation.code,
    status: "confirmada",
    flatNumber: reservation.flatNumber,
    pmsConfirmed: true
  };
}

export function handleGetReservationDetails(db, args = {}) {
  const targetCode = String(args.code || args.reservationCode || args.reservationId || "").trim();
  const targetName = String(args.guestName || args.name || "").trim().toLowerCase();
  const targetPhone = normalizePhone(args.phone || args.guestPhone || "");
  const targetFlat = String(args.flatNumber || args.flatId || "").trim();
  const todayStr = getBrasiliaDateParts().todayStr;

  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  let matched = null;

  const pickBestReservation = (candidates) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const activeList = candidates.filter(r => r && r.status !== "cancelada" && r.status !== "cancelled" && r.status !== "expirada");
    const pool = activeList.length > 0 ? activeList : candidates;

    const todayMatches = pool.filter(r =>
      r.checkinDate === todayStr || r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr)
    );
    const activeToday = todayMatches.find(r => !isReservationCheckoutCompleted(r, db, targetPhone || r.guestPhone || r.phone, args.history || []));
    if (activeToday) return activeToday;

    const futureMatches = pool
      .filter(r => (r.checkinDate || "") > todayStr && !isReservationCheckoutCompleted(r, db, targetPhone || r.guestPhone || r.phone, args.history || []))
      .sort((a, b) => (a.checkinDate || "").localeCompare(b.checkinDate || ""));
    if (futureMatches.length > 0) return futureMatches[0];

    if (todayMatches.length > 0) return todayMatches[0];

    const sortedPast = [...pool].sort((a, b) => (b.checkoutDate || b.checkinDate || "").localeCompare(a.checkoutDate || a.checkinDate || ""));
    return sortedPast[0] || candidates[0];
  };

  // 1. Busca por código de reserva
  if (targetCode) {
    const codeLower = targetCode.toLowerCase();
    matched = reservations.find(r =>
      r && (getCanonicalReservationCodes(r).includes(codeLower) || String(r.id || "") === targetCode)
    );
  }

  // 2. Busca por telefone
  if (!matched && targetPhone) {
    const phoneMatches = reservations.filter(r => {
      if (!r) return false;
      const rPhone = normalizePhone(r.guestPhone || r.phone || "");
      const reqPhone = normalizePhone(r.requesterInfo?.phone || r.requesterInfo?.whatsapp || r.requesterPhone || "");
      return (rPhone && (targetPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(targetPhone.slice(-8)))) ||
             (reqPhone && (targetPhone.endsWith(reqPhone.slice(-8)) || reqPhone.endsWith(targetPhone.slice(-8))));
    });
    matched = pickBestReservation(phoneMatches);
  }

  // 3. Busca por nome do hóspede
  if (!matched && targetName) {
    const nameMatches = reservations.filter(r =>
      r && r.guestName && r.guestName.toLowerCase().includes(targetName)
    );
    matched = pickBestReservation(nameMatches);
  }

  // 4. Busca por número do flat
  if (!matched && targetFlat) {
    const flatMatches = reservations.filter(r =>
      r && (String(r.flatNumber) === targetFlat || String(r.flatId) === targetFlat) &&
      r.status !== "cancelada" && r.status !== "expirada" &&
      (r.checkinDate <= todayStr && r.checkoutDate >= todayStr)
    );
    matched = pickBestReservation(flatMatches);
  }

  if (!matched) {
    return {
      success: false,
      found: false,
      message: "Nenhuma reserva foi localizada no sistema com os critérios informados."
    };
  }

  const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
  const rawCheckinUrl = getCheckinUrlSync(matched, 1, appOrigin, db);

  const isCheckoutCompleted = isReservationCheckoutCompleted(
    matched,
    db,
    targetPhone || matched.guestPhone || matched.phone,
    args.history || []
  );

  let stayStatus = "sem_reserva_ativa";
  if (isCheckoutCompleted) {
    stayStatus = "checkout_concluido";
  } else if (matched.checkinDate === todayStr) {
    stayStatus = "checkin_hoje";
  } else if (matched.checkoutDate === todayStr) {
    stayStatus = "checkout_hoje";
  } else if (matched.checkinDate < todayStr && matched.checkoutDate > todayStr) {
    stayStatus = "em_estadia";
  } else if (matched.checkinDate > todayStr) {
    stayStatus = "reserva_futura";
  } else {
    stayStatus = "estadia_passada";
  }

  const canonicalCode = matched.code || matched.reservationCode || (matched.flatNumber && matched.id != null ? `RES-${matched.flatNumber}-${String(matched.id).padStart(4, "0")}` : `RES-${matched.flatNumber}`);
  const isPreReservaUnpaid = matched.status === "pre_reserva" || matched.status === "pendente";
  const isCheckinRelevant = !isCheckoutCompleted && !isPreReservaUnpaid && (stayStatus === "checkin_hoje" || stayStatus === "reserva_futura");
  const isCheckoutDay = !isCheckoutCompleted && stayStatus === "checkout_hoje";
  const isHosted = !isCheckoutCompleted && (stayStatus === "em_estadia" || isCheckoutDay);
  const checkoutUrl = isCheckoutCompleted || isPreReservaUnpaid
    ? null
    : `${appOrigin}/checkout/${canonicalCode}`;
  const checkinUrl = isCheckinRelevant ? rawCheckinUrl : null;

  const senderPhoneForPrivacy = args.requesterPhone || args.phone || args.guestPhone || "";
  const hideFin = args.requesterRole !== "admin" && isNonRequesterGuestForReservation(matched, senderPhoneForPrivacy, db);
  const recipientsInfo = getReservationRecipients(matched, db);
  let operationalGuidance = "";
  if (isPreReservaUnpaid) {
    operationalGuidance = hideFin
      ? `PRÉ-RESERVA EM CONFIRMAÇÃO COM O SOLICITANTE (${recipientsInfo.requester.name}). NUNCA enviar cobrança, valor ou PIX ao hóspede. Informar apenas que a reserva está em processo de confirmação junto ao solicitante responsável.`
      : "PRÉ-RESERVA AGUARDANDO PAGAMENTO (status pre_reserva). NUNCA enviar link de pré-check-in digital e NUNCA liberar entrada na portaria antes da confirmação do pagamento. Orientar o hóspede a concluir o pagamento via PIX ou Cartão no Portal do Hóspede para confirmar a reserva.";
  } else if (isCheckoutCompleted) {
    operationalGuidance = "CHECK-OUT JÁ CONCLUÍDO PELO HÓSPEDE (estadia encerrada e saída já confirmada). NUNCA cobrar desocupação até as 12:00h e NUNCA enviar link de check-out ou de pré-check-in. Caso o hóspede pergunte sobre a reserva ou check-out, confirme que o check-out já foi concluído com sucesso e agradeça pela estadia.";
  } else if (isCheckoutDay) {
    operationalGuidance = "HÓSPEDE EM DIA DE CHECK-OUT HOJE (saída hoje até as 12:00h). NUNCA enviar link de pré-check-in digital. Informar sobre horário limite de saída até 12:00h, orientar sobre procedimentos de desocupação e devolução de chaves, perguntar se deseja prorrogação (late check-out) mediante disponibilidade ou verificar se já desocupou o flat. Fornecer link de confirmação de check-out.";
  } else if (stayStatus === "em_estadia") {
    operationalGuidance = "HÓSPEDE JÁ ACOMODADO NO FLAT (em estadia). NUNCA enviar link de pré-check-in digital. Fornecer apoio à estadia em andamento.";
  } else if (stayStatus === "checkin_hoje") {
    operationalGuidance = "HÓSPEDE COM ENTRADA HOJE (a partir das 14:00h). Enviar link de pré-check-in digital para agilizar liberação na portaria 24h.";
  }

  return {
    success: true,
    found: true,
    reservation: {
      id: matched.id,
      code: canonicalCode,
      guestName: matched.guestName,
      guestPhone: matched.guestPhone || matched.phone,
      checkinDate: matched.checkinDate,
      checkoutDate: matched.checkoutDate,
      flatNumber: matched.flatNumber,
      status: matched.status,
      paymentStatus: hideFin ? undefined : matched.paymentStatus,
      channel: matched.channel,
      totalAmount: hideFin ? undefined : matched.totalAmount,
      hideFinancialForGuest: hideFin,
      requesterName: recipientsInfo?.requester?.isDifferentFromGuest ? recipientsInfo.requester.name : null,
      stayStatus,
      isCheckinRelevant,
      isCheckoutDay,
      isCheckoutCompleted,
      isHosted,
      checkinUrl,
      rawCheckinUrl: isCheckinRelevant ? rawCheckinUrl : null,
      checkoutUrl,
      operationalGuidance: hideFin
        ? `${operationalGuidance} PRIVACIDADE FINANCEIRA: Esta reserva possui solicitante distinto (${recipientsInfo.requester.name}) responsável pelo pagamento. NUNCA informe valores, saldo, status de pagamento ou PIX ao hóspede.`.trim()
        : operationalGuidance
    }
  };
}

export function handleGetFlatStatus(db, args = {}) {
  const targetFlat = String(args.flatNumber || args.flatId || "").trim();
  if (!targetFlat) {
    return {
      success: false,
      error: "MISSING_FLAT_NUMBER",
      message: "Número do flat é obrigatório."
    };
  }

  const flats = Array.isArray(db?.flats) ? db.flats : [];
  const flat = flats.find(f => String(f.number) === targetFlat || String(f.id) === targetFlat);

  if (!flat) {
    return {
      success: false,
      error: "FLAT_NOT_FOUND",
      message: `Flat ${targetFlat} não foi encontrado no cadastro.`
    };
  }

  const todayStr = getBrasiliaDateParts().todayStr;
  let cleaningStatus = "clean";
  let isRoomReady = true;

  const cleanReq = (db?.cleaningRequests || []).find(c =>
    (String(c.flatNumber) === String(flat.number) || String(c.flatId) === String(flat.id)) &&
    (c.requestDate === todayStr || c.effectiveDate === todayStr)
  );

  const hasPendingCheckoutToday = (db?.reservations || []).some(r =>
    (String(r.flatNumber) === String(flat.number) || String(r.flatId) === String(flat.id)) &&
    r.checkoutDate === todayStr &&
    r.status !== "cancelada" && r.status !== "expirada" &&
    r.status !== "completed" && r.status !== "checkout" && r.status !== "checked_out" && r.status !== "finalizada" &&
    !isReservationCheckoutCompleted(r, db)
  );

  const allPastOrTodayCleanings = (db?.cleaningRequests || [])
    .filter(c =>
      (String(c.flatNumber) === String(flat.number) || String(c.flatId) === String(flat.id)) &&
      String(c.requestDate || "") <= todayStr
    )
    .sort((a, b) => String(b.requestDate || "").localeCompare(String(a.requestDate || "")) || (b.id - a.id));
  const lastCleaning = allPastOrTodayCleanings[0] || null;

  if (cleanReq) {
    if (cleanReq.status === "clean" || cleanReq.completedAt != null) {
      cleaningStatus = "clean";
      isRoomReady = true;
    } else if (cleanReq.status === "cleaning_now" || cleanReq.status === "in_progress") {
      cleaningStatus = "cleaning_now";
      isRoomReady = false;
    } else {
      cleaningStatus = cleanReq.status || "dirty";
      isRoomReady = false;
    }
  } else if (hasPendingCheckoutToday) {
    cleaningStatus = "dirty";
    isRoomReady = false;
  } else if (lastCleaning && (lastCleaning.status === "cleaning_now" || lastCleaning.status === "in_progress")) {
    cleaningStatus = "cleaning_now";
    isRoomReady = false;
  } else {
    cleaningStatus = "clean";
    isRoomReady = true;
  }

  const activeReservation = (db?.reservations || []).find(r =>
    (String(r.flatNumber) === String(flat.number) || String(r.flatId) === String(flat.id)) &&
    r.status !== "cancelada" && r.status !== "expirada" &&
    r.checkinDate <= todayStr && r.checkoutDate >= todayStr &&
    !isReservationCheckoutCompleted(r, db)
  );

  const amenities = getFlatAmenitiesInfo(flat);

  return {
    success: true,
    flatNumber: String(flat.number),
    flatId: flat.id,
    cleaningStatus,
    isRoomReady,
    isOccupied: Boolean(activeReservation),
    currentGuestName: activeReservation?.guestName || null,
    statusDescription: isRoomReady
      ? `Flat ${flat.number} está 100% limpo, higienizado e pronto para entrada.`
      : `Flat ${flat.number} está em higienização ou pendente de liberação pela governança.`,
    tags: amenities?.tags || [],
    airConditionerType: amenities?.airConditionerType || "split",
    airConditionerLabel: amenities?.airConditionerLabel || "Ar-condicionado Split ❄️",
    airConditioner: amenities?.airConditionerType || "split",
    bedType: amenities?.bedType || "casal",
    bedLabel: amenities?.bedLabel || "Cama de Casal 🛏️",
    bed: amenities?.bedType || "casal",
    hasMicrowave: amenities?.hasMicrowave ?? true,
    features: amenities?.features || []
  };
}

export function handleGetPricingInfo(db, args = {}) {
  const inDate = args.checkIn || args.checkin || getBrasiliaDateParts().todayStr;
  const outDate = args.checkOut || args.checkout || null;
  const guests = Math.max(1, Number(args.guests || 1));
  const flatId = args.flatId || null;
  const withBreakfast = args.withBreakfast === true;

  const tSettings = db?.tariffSettings || {};
  const baseDailyRate = Number(tSettings.baseDailyRate != null ? tSettings.baseDailyRate : 237);
  const breakfastFeePerPerson = 35;

  if (outDate && inDate < outDate) {
    const quote = handleCalculateQuote(db, {
      checkIn: inDate,
      checkOut: outDate,
      guests,
      flatId,
      ratePlan: withBreakfast ? "with_breakfast" : "room_only"
    });
    return {
      success: true,
      hasPeriod: true,
      checkIn: inDate,
      checkOut: outDate,
      nights: quote.nights,
      guests,
      withBreakfast,
      totalAmount: quote.total,
      dailyRateAverage: Math.round((quote.total / (quote.nights || 1)) * 100) / 100,
      cleaningFee: quote.cleaningFee,
      isCleaningFeeExempt: withBreakfast
    };
  }

  const breakfastTotal = withBreakfast ? (breakfastFeePerPerson * guests) : 0;
  const dailyRate = baseDailyRate + breakfastTotal;

  return {
    success: true,
    hasPeriod: false,
    baseRateWithoutBreakfast: baseDailyRate,
    rateWithBreakfastFor1: baseDailyRate + breakfastFeePerPerson,
    rateWithBreakfastFor2: baseDailyRate + (breakfastFeePerPerson * 2),
    cleaningFeeStandard: 70,
    cleaningFeeWithBreakfast: 0,
    breakfastPerPerson: breakfastFeePerPerson,
    isCleaningFeeExemptOnBreakfast: true,
    calculatedDailyRate: dailyRate,
    summary: `Diária a partir de R$ ${baseDailyRate},00 sem café (+ taxa única de limpeza R$ 70,00); ou a partir de R$ ${baseDailyRate + breakfastFeePerPerson},00 com café no quarto (1 pessoa) com ISENÇÃO TOTAL da taxa de limpeza!`
  };
}

export function handleRecordUnmetDemand(db, args = {}) {
  const text = args.guestRequest || args.text || args.message || "";
  const title = args.demandTitle || args.title || "";
  const category = args.category || inferFaqCategory(text) || "outros";
  const reason = args.reason || "capability_missing";
  const suggestedFeature = args.suggestedFeature || "";

  const demand = detectAndRecordUnmetDemand({
    db,
    text,
    senderPhone: args.senderPhone || args.phone || "",
    senderName: args.senderName || args.guestName || "Hóspede",
    guestContext: args.guestContext || null,
    actionTarget: args.actionTarget || null,
    reason,
    saveDatabase: args.saveDatabase || null,
    createNotification: args.createNotification || null
  });

  if (demand && title) {
    demand.demandTitle = title;
  }
  if (demand && suggestedFeature) {
    demand.suggestedFeature = suggestedFeature;
  }

  return {
    success: true,
    demandId: demand?.id,
    demandTitle: demand?.demandTitle,
    category: demand?.category,
    message: "Demanda registrada com sucesso em Oportunidades de Automação."
  };
}

export function handleInformCheckout(dbOrArgs, argsOrDb = {}, optionalPhone = "") {
  let db = dbOrArgs;
  let args = argsOrDb || {};
  if (dbOrArgs && !Array.isArray(dbOrArgs.reservations) && !Array.isArray(dbOrArgs.flats) && argsOrDb && (Array.isArray(argsOrDb.reservations) || Array.isArray(argsOrDb.flats))) {
    db = argsOrDb;
    args = { ...(dbOrArgs || {}), ...(optionalPhone ? { phone: optionalPhone } : {}) };
  }
  if (!db) return { success: false, error: "Database not available" };

  const targetFlat = String(args.flatNumber || args.flat_number || args.flatId || args.guestContext?.flatNumber || "").trim();
  const resCodeArg = String(args.reservationCode || args.reservation_code || "").trim().toUpperCase();
  const phone = cleanWhatsAppPhone(args.phone || args.senderPhone || args.guestPhone || args.guestContext?.phone || optionalPhone || "");
  const now = new Date().toISOString();
  const todayStr = getBrasiliaDateParts().todayStr;

  const flats = Array.isArray(db.flats) ? db.flats : [];
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];

  let matchedFlat = null;
  if (targetFlat) {
    matchedFlat = flats.find(f => String(f.number) === targetFlat || String(f.id) === targetFlat);
  }

  // Se informou código da reserva ou telefone do hóspede, tenta localizar a reserva ativa hoje
  let matchedRes = null;
  if (resCodeArg) {
    matchedRes = reservations.find(r => String(r.code || r.reservationCode || "").trim().toUpperCase() === resCodeArg && r.status !== "cancelada" && r.status !== "cancelled");
    if (matchedRes && !matchedFlat) {
      matchedFlat = flats.find(f => f.id === matchedRes.flatId || String(f.number) === String(matchedRes.flatNumber));
    }
  }
  if (!matchedRes && phone) {
    matchedRes = reservations.find(r => {
      const rPhone = cleanWhatsAppPhone(r.guestPhone || r.phone || "");
      const isPhoneMatch = rPhone && (phone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(phone.slice(-8)));
      return isPhoneMatch && r.status !== "cancelada" && r.status !== "cancelled" &&
        (r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr));
    });
    if (matchedRes && !matchedFlat) {
      matchedFlat = flats.find(f => f.id === matchedRes.flatId || String(f.number) === String(matchedRes.flatNumber));
    }
  }

  const resolvedFlatNum = matchedFlat ? String(matchedFlat.number) : (targetFlat || (matchedRes ? String(matchedRes.flatNumber) : null));

  if (!resolvedFlatNum) {
    return {
      success: false,
      error: "FLAT_NOT_IDENTIFIED",
      message: "Não foi possível identificar o número do flat para registrar o check-out."
    };
  }

  // Se ainda não localizou a reserva pelo telefone, tenta localizar pelo flat para a data de hoje
  if (!matchedRes && (matchedFlat || resolvedFlatNum)) {
    matchedRes = reservations.find(r =>
      (matchedFlat ? (r.flatId === matchedFlat.id || String(r.flatNumber) === String(matchedFlat.number)) : String(r.flatNumber) === String(resolvedFlatNum)) &&
      r.status !== "cancelada" && r.status !== "cancelled" &&
      (r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr))
    );
  }

  // 1. Marca flat como desocupado
  if (matchedFlat) {
    matchedFlat.isOccupied = false;
    matchedFlat.updatedAt = now;
  }

  // 2. Atualiza ou cria solicitação de limpeza
  if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
  let cleanReq = db.cleaningRequests.find(r =>
    ((matchedFlat && r.flatId === matchedFlat.id) || String(r.flatNumber) === resolvedFlatNum) &&
    r.requestDate === todayStr &&
    !r.isInstructionOnly &&
    r.source !== "manual_instruction" &&
    r.type !== "instruction" &&
    r.type !== "bed_adjustment_only"
  );

  const guestName = args.guestName || args.senderName || matchedRes?.guestName || "Hóspede";

  if (cleanReq) {
    if (cleanReq.isDeleted || cleanReq.status === "deleted") {
      cleanReq.isDeleted = false;
      cleanReq.status = "dirty";
      cleanReq.completedAt = null;
      cleanReq.cleaningStartedAt = null;
      cleanReq.willCleanAt = null;
      delete cleanReq.deletedAt;
      delete cleanReq.deletedBy;
      delete cleanReq.deletedReservationId;
    }
    cleanReq.isVacant = true;
    cleanReq.isVacantExplicitlySet = true;
    cleanReq.vacantSource = "whatsapp_guest";
    cleanReq.vacantSetAt = now;
    cleanReq.leavingGuest = cleanReq.leavingGuest || guestName;
    cleanReq.updatedAt = now;
  } else {
    cleanReq = {
      id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => r.id)) + 1 : 1,
      flatId: matchedFlat ? matchedFlat.id : (matchedRes?.flatId || `flat_${resolvedFlatNum}`),
      flatNumber: resolvedFlatNum,
      requestDate: todayStr,
      source: "whatsapp_guest",
      status: "dirty",
      assignedUserId: null,
      isVacant: true,
      isVacantExplicitlySet: true,
      vacantSource: "whatsapp_guest",
      vacantSetAt: now,
      isPriority: false,
      leavingGuest: guestName,
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: null,
      cleaningStartedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };
    db.cleaningRequests.unshift(cleanReq);
  }

  // 3. Atualiza reserva ativa se houver
  if (matchedRes) {
    matchedRes.status = "completed";
    matchedRes.checkoutDone = true;
    matchedRes.checkoutMethod = matchedRes.checkoutMethod ? `${matchedRes.checkoutMethod} + whatsapp_guest` : "whatsapp_guest";
    matchedRes.actualCheckoutAt = matchedRes.actualCheckoutAt || now;
    matchedRes.actualCheckoutTime = matchedRes.actualCheckoutTime || getBrasiliaDateParts().timeStr;
    matchedRes.updatedAt = now;
  }

  // 3.5. Cancela lembretes pendentes de check-out, café da manhã ou estadia na fila (WhatsApp e E-mail)
  const postCheckoutAllowed = new Set([
    "checkout_completed",
    "on_checkout",
    "post_checkout_review",
    "nps_approved",
    "nps_score_4",
    "nps_score_3",
    "nps_score_2",
    "nps_score_1",
    "nps_feedback_thanks",
    "payment_confirmed",
    "reservation_cancelled"
  ]);
  const targetCodes = new Set();
  const targetIds = new Set();
  if (matchedRes) {
    if (matchedRes.code || matchedRes.reservationCode) targetCodes.add(String(matchedRes.code || matchedRes.reservationCode).trim().toUpperCase());
    if (matchedRes.id !== undefined && matchedRes.id !== null) targetIds.add(String(matchedRes.id));
  }
  for (const r of reservations) {
    if (!r || r.status === "cancelada" || r.status === "cancelled") continue;
    if (String(r.flatNumber || "").replace(/\D/g, "") === String(resolvedFlatNum).replace(/\D/g, "") && r.checkoutDate === todayStr) {
      if (r.code || r.reservationCode) targetCodes.add(String(r.code || r.reservationCode).trim().toUpperCase());
      if (r.id !== undefined && r.id !== null) targetIds.add(String(r.id));
    }
  }
  if (Array.isArray(db.whatsappQueue)) {
    for (const qItem of db.whatsappQueue) {
      if (!qItem || (qItem.status !== "scheduled" && qItem.status !== "pending" && qItem.status !== "pending_approval")) continue;
      if (postCheckoutAllowed.has(String(qItem.triggerEvent || "").trim())) continue;
      const qCode = String(qItem.reservationCode || "").trim().toUpperCase();
      const qId = qItem.reservationId !== undefined && qItem.reservationId !== null ? String(qItem.reservationId) : "";
      if ((qCode && targetCodes.has(qCode)) || (qId && (targetIds.has(qId) || targetCodes.has(qId)))) {
        qItem.status = "cancelled";
        qItem.error = "Cancelado: check-out comunicado pelo hóspede via WhatsApp";
        qItem.updatedAt = now;
      }
    }
  }
  if (Array.isArray(db.emailQueue)) {
    for (const eItem of db.emailQueue) {
      if (!eItem || (eItem.status !== "scheduled" && eItem.status !== "pending")) continue;
      if (postCheckoutAllowed.has(String(eItem.triggerEvent || eItem.type || "").trim())) continue;
      const eCode = String(eItem.reservationCode || "").trim().toUpperCase();
      const eId = eItem.reservationId !== undefined && eItem.reservationId !== null ? String(eItem.reservationId) : "";
      if ((eCode && targetCodes.has(eCode)) || (eId && (targetIds.has(eId) || targetCodes.has(eId)))) {
        eItem.status = "cancelled";
        eItem.error = "Cancelado: check-out comunicado pelo hóspede via WhatsApp";
        eItem.updatedAt = now;
      }
    }
  }

  // 4. Cria notificação para governança e recepção se houver array no db
  if (Array.isArray(db.notifications)) {
    db.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: `Check-out Comunicado - Flat ${resolvedFlatNum}`,
      message: `${guestName} comunicou a saída do Flat ${resolvedFlatNum} via WhatsApp. Unidade desocupada e pronta para governança.`,
      type: "checkout",
      category: "governance",
      flatNumber: resolvedFlatNum,
      read: false,
      createdAt: now
    });
  }

  return {
    success: true,
    flatNumber: resolvedFlatNum,
    cleaningRequestId: cleanReq.id,
    isVacant: true,
    reservationId: matchedRes?.id || null,
    reservation: matchedRes || null,
    message: `Check-out do Flat ${resolvedFlatNum} comunicado pelo hóspede via WhatsApp e registrado com sucesso.`
  };
}

// ── Mapeamento Contínuo de Demandas Sem Acesso & Oportunidades de Automação ──

export const UNMET_DEMAND_CATEGORIES = {
  checkout_comunicacao: {
    category: "checkout_comunicacao",
    title: "Comunicação / Notificação de Check-out pelo Hóspede via WhatsApp",
    defaultSuggested: "Integrar aviso de saída do hóspede via WhatsApp com atualização automática do status do flat nos cards de limpeza e disparo de eventos de pós-checkout."
  },
  efetivacao_reserva: {
    category: "efetivacao_reserva",
    title: "Efetivação de Reserva no PMS",
    defaultSuggested: "Ativar a chave 'commitReservation' no painel de Ações do Bot para permitir confirmação automática."
  },
  cotacao_diarias: {
    category: "cotacao_diarias",
    title: "Cálculo de Orçamento / Cotação",
    defaultSuggested: "Ativar a chave 'calculateQuote' no painel de Ações do Bot para cálculos automatizados."
  },
  consulta_disponibilidade: {
    category: "consulta_disponibilidade",
    title: "Consulta de Vagas e Disponibilidade",
    defaultSuggested: "Ativar a chave 'checkAvailability' no painel de Ações do Bot para consulta em tempo real."
  },
  geracao_pix: {
    category: "geracao_pix",
    title: "Geração de Cobrança / PIX",
    defaultSuggested: "Ativar a chave 'generatePayment' no painel de Ações do Bot para envio de PIX automático."
  },
  pre_reserva: {
    category: "pre_reserva",
    title: "Criação de Pré-Reserva com Hold",
    defaultSuggested: "Ativar a chave 'createPreReservation' no painel de Ações do Bot para bloqueio temporário."
  },
  cancelamento_reserva: {
    category: "cancelamento_reserva",
    title: "Cancelamento e Estorno de Reserva",
    defaultSuggested: "Desenvolver endpoint de cancelamento com política de reembolso e estorno."
  },
  alteracao_datas: {
    category: "alteracao_datas",
    title: "Alteração de Datas e Remarcação",
    defaultSuggested: "Desenvolver fluxo autônomo de remarcação com recálculo de diárias."
  },
  enxoval_toalhas: {
    category: "enxoval_toalhas",
    title: "Solicitação de Enxoval / Toalhas Extras",
    defaultSuggested: "Integrar com fila de governança para solicitação automática de itens de enxoval."
  },
  chamado_manutencao: {
    category: "chamado_manutencao",
    title: "Abertura de Chamado de Manutenção",
    defaultSuggested: "Integrar com ordens de serviço (serviceOrders) para abertura automática de chamados."
  },
  limpeza_avulsa: {
    category: "limpeza_avulsa",
    title: "Solicitação de Limpeza Avulsa",
    defaultSuggested: "Integrar com agendamento de limpezas da equipe de camareiras."
  },
  late_checkout: {
    category: "late_checkout",
    title: "Solicitação de Late Check-out",
    defaultSuggested: "Desenvolver checagem automática de disponibilidade pós-12h com cobrança proporcional."
  },
  garagem_veiculo: {
    category: "garagem_veiculo",
    title: "Cadastro / Alteração de Placa de Veículo",
    defaultSuggested: "Criar ferramenta para registrar e autorizar veículo diretamente em garageAuthorizations."
  },
  emissao_nota_fiscal: {
    category: "emissao_nota_fiscal",
    title: "Solicitação de Emissão de Nota Fiscal",
    defaultSuggested: "Integrar com módulo fiscal (invoices) para emissão e envio automático de PDF/XML da NF."
  },
  troca_flat: {
    category: "troca_flat",
    title: "Solicitação de Troca de Quarto / Flat",
    defaultSuggested: "Criar fluxo de verificação de troca de UH no PMS com confirmação da recepção."
  },
  cafe_quarto: {
    category: "cafe_quarto",
    title: "Solicitação de Café no Quarto",
    defaultSuggested: "Integrar com módulo de produção de café da manhã para entrega no flat."
  },
  operacoes_sistema_pausadas: {
    category: "operacoes_sistema_pausadas",
    title: "Operação com Chave Mestra Pausada",
    defaultSuggested: "Reativar Chave Mestra Global de Ações do Bot no painel do Agente de IA."
  },
  itens_especiais_comodidades: {
    category: "itens_especiais_comodidades",
    title: "Solicitação de Item / Comodidade Especial (ex: Berço, Secador, Ferro)",
    defaultSuggested: "Mapear controle de estoque de comodidades adicionais para disponibilização aos hóspedes."
  },
  dados_reserva_indisponiveis: {
    category: "dados_reserva_indisponiveis",
    title: "Consulta de Reserva Não Localizada",
    defaultSuggested: "Aprimorar busca com correspondência fonética ou integração com OTAs (Booking/Airbnb)."
  },
  dados_sistema_indisponiveis: {
    category: "dados_sistema_indisponiveis",
    title: "Dados do Sistema Não Localizados / Indisponíveis",
    defaultSuggested: "Disponibilizar endpoint ou leitura para este tipo de dado operacional na base."
  },
  outros: {
    category: "outros",
    title: "Demanda Não Mapeada com Transbordo Humano",
    defaultSuggested: "Analisar mensagem para mapear novo recurso ou ferramenta de automação no bot."
  }
};

export function classifyUnmetDemand(text = "", actionTarget = null, explicitReason = null) {
  const cleanText = String(text || "").trim();
  const lower = cleanText.toLowerCase();
  const norm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Se veio por target de ação do sistema (chave desativada)
  if (actionTarget) {
    if (actionTarget === "commitReservation") {
      return {
        category: "efetivacao_reserva",
        demandTitle: UNMET_DEMAND_CATEGORIES.efetivacao_reserva.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.efetivacao_reserva.defaultSuggested
      };
    }
    if (actionTarget === "calculateQuote") {
      return {
        category: "cotacao_diarias",
        demandTitle: UNMET_DEMAND_CATEGORIES.cotacao_diarias.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.cotacao_diarias.defaultSuggested
      };
    }
    if (actionTarget === "checkAvailability") {
      return {
        category: "consulta_disponibilidade",
        demandTitle: UNMET_DEMAND_CATEGORIES.consulta_disponibilidade.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.consulta_disponibilidade.defaultSuggested
      };
    }
    if (actionTarget === "generatePayment") {
      return {
        category: "geracao_pix",
        demandTitle: UNMET_DEMAND_CATEGORIES.geracao_pix.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.geracao_pix.defaultSuggested
      };
    }
    if (actionTarget === "createPreReservation") {
      return {
        category: "pre_reserva",
        demandTitle: UNMET_DEMAND_CATEGORIES.pre_reserva.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.pre_reserva.defaultSuggested
      };
    }
    if (actionTarget === "checkout_comunicacao" || actionTarget === "informCheckout" || actionTarget === "notifyCheckout") {
      return {
        category: "checkout_comunicacao",
        demandTitle: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.defaultSuggested
      };
    }
  }

  // 2. Se a razão explícita for chave mestra desativada
  if (explicitReason === "master_switch_disabled") {
    return {
      category: "operacoes_sistema_pausadas",
      demandTitle: UNMET_DEMAND_CATEGORIES.operacoes_sistema_pausadas.title,
      reason: "action_disabled",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.operacoes_sistema_pausadas.defaultSuggested
    };
  }

  // 3. Regras de Heurística Semântica para Novas Funcionalidades / Gaps
  if (/\b(?:cancelar|cancelamento|cancele|desistir|desisti|estorno|estornar)\b/i.test(lower)) {
    return {
      category: "cancelamento_reserva",
      demandTitle: UNMET_DEMAND_CATEGORIES.cancelamento_reserva.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.cancelamento_reserva.defaultSuggested
    };
  }

  if (/\b(?:alterar|mudar|trocar|adiar|antecipar|remarcar)\s+(?:as?|os?|minhas?|meus?|de)?\s*(?:data|datas|check-?in|check-?out|dia|dias|estadia|periodo|per[ií]odo)\b/i.test(lower)) {
    return {
      category: "alteracao_datas",
      demandTitle: UNMET_DEMAND_CATEGORIES.alteracao_datas.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.alteracao_datas.defaultSuggested
    };
  }

  if (/\b(?:preciso|solicito|solicitar|gostaria|quero|favor|pode|mandar|trazer|trocar|troca|extra[s]?|limp[ao]s?|suj[ao]s?|mais)\b.*\b(?:toalha|toalhas|len[cç]ol|len[cç][oó]is|travesseiro|travesseiros|cobertor|cobertores|enxoval|manta|edredom)\b/i.test(lower) ||
      /\b(?:toalha|toalhas|len[cç]ol|len[cç][oó]is|travesseiro|cobertor|enxoval)\b.*\b(?:extra[s]?|limp[ao]s?|suj[ao]s?|mais|adicional|adicionais|troca|trocar)\b/i.test(lower)) {
    return {
      category: "enxoval_toalhas",
      demandTitle: UNMET_DEMAND_CATEGORIES.enxoval_toalhas.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.enxoval_toalhas.defaultSuggested
    };
  }

  if (/\b(?:ar\s*(?:condicionado|split)?\s*(?:n[aã]o\s*gela|parou|quebrou|n[aã]o\s*liga)|chuveiro\s*(?:n[aã]o\s*esquenta|queimou|frio)|vazamento|pia\s*entupida|vaso\s*(?:entupido|vazando)|l[aâ]mpada\s*queimada|fechadura|porta\s*(?:n[aã]o\s*abre|emperrou)|tv\s*(?:n[aã]o\s*liga|sem\s*sinal)|controle\s*(?:remoto\s*)?(?:n[aã]o\s*funciona|quebrou|sem\s*pilha)|manuten[cç][aã]o|reparo|conserto|abrir\s*(?:um\s*)?chamado)\b/i.test(lower)) {
    return {
      category: "chamado_manutencao",
      demandTitle: UNMET_DEMAND_CATEGORIES.chamado_manutencao.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.chamado_manutencao.defaultSuggested
    };
  }

  if (/\b(?:limpeza\s*(?:extra|avulsa|hoje|agora|imediata)|pedir\s*(?:limpeza|faxina)|solicitar\s*(?:uma\s*)?(?:limpeza|faxina)|preciso\s*de\s*(?:limpeza|faxina)|faxina|camareira\s*(?:no\s*quarto|pode\s*limpar)|limpar\s*(?:o\s*)?(?:meu\s*)?(?:quarto|flat|apartamento)\s*(?:hoje|agora|urgente|por\s*favor)?)\b/i.test(lower)) {
    return {
      category: "limpeza_avulsa",
      demandTitle: UNMET_DEMAND_CATEGORIES.limpeza_avulsa.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.limpeza_avulsa.defaultSuggested
    };
  }

  const isLateCheckoutDemand = /\b(?:late\s*check-?out|sair\s*mais\s*tarde|sa[ií]da\s*tardia|desocupar\s*mais\s*tarde|sair\s*(?:as|às)\s*(?:1[3-9]|20))\b/i.test(lower) ||
    (/\bestender\s*(?:a\s*)?(?:estadia|sa[ií]da|di[aá]ria|reserva)\b/i.test(lower) && !/\b(?:pelo|no|via|por)\s+whatsapp\b/i.test(lower));

  if (isLateCheckoutDemand) {
    return {
      category: "late_checkout",
      demandTitle: UNMET_DEMAND_CATEGORIES.late_checkout.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.late_checkout.defaultSuggested
    };
  }

  // 3.10 Comunicação / Notificação de Check-out e Desocupação pelo Hóspede via WhatsApp
  const isCheckoutCommunication = (
    // 1. Verbos/expressões de intenção comunicativa + checkout/saída/desocupação
    /\b(?:informar|informando|avisar|avisando|comunicar|comunicando|notificar|notificando|passar|passando|dar|dando|confirmar|confirmando|registro|registrar|registrando|vim\s+fazer)\s+(?:o|a|meu|minha|nosso|nossa)?\s*(?:check[- ]?out|saida|desocupacao|liberacao|baixa)\b/i.test(norm) ||
    /\b(?:gostaria|quero|preciso|queria|favor|desejo)\s+(?:de\s+)?(?:informar|avisar|comunicar|fazer|dar|passar|registrar)\s+(?:o|a|meu|minha|nosso|nossa)?\s*(?:check[- ]?out|saida|baixa)\b/i.test(norm) ||
    // 2. Ação de saída/desocupação em andamento ou recém concluída
    /\b(?:estou|to|estamos|ja|vim)\s+(?:fazendo|realizando)\s+(?:o|meu|nosso)?\s*check[- ]?out\b/i.test(norm) ||
    /\b(?:fazendo|realizando)\s+(?:o|meu|nosso)?\s*check[- ]?out(?:\s+agora)?\b/i.test(norm) ||
    /\b(?:estou|to|estamos|ja)\s+(?:saindo|desocupando|liberando|deixando|indo\s+embora|partindo)\b/i.test(norm) ||
    /\b(?:saindo|desocupando|liberando|deixando|indo\s+embora)\s+(?:do|da|o|a)?\s*(?:flat|quarto|apartamento|apto|uh|hotel|condominio|soho|edificio|\d{2,4}|agora)\b/i.test(norm) ||
    /\b(?:estou|to|estamos)\s+(?:entregando|deixando|devolvendo)\s+(?:as?|os?)?\s*chave[s]?\b/i.test(norm) ||
    /\b(?:acabei|acabamos)\s+de\s+(?:sair|desocupar|liberar|entregar|deixar|devolver|fazer\s+(?:o\s+)?check[- ]?out)\b/i.test(norm) ||
    (/\b(?:ja\s+)?(?:sai|saimos|deixei|deixamos|entreguei|entregamos|devolvi|devolvemos|desocupe?i|desocupamos|liberei|liberamos|fui\s+embora|fomos\s+embora)\b/i.test(norm) && /\b(?:flat|quarto|apartamento|apto|uh|unidade|\d{2,4}|chave|chaves|portaria|recepcao|hotel|desocupe?i|desocupamos|check[- ]?out)\b/i.test(norm)) ||
    /\b(?:ja\s+)?(?:fiz|fizemos|conclui|concluimos|realizei|realizamos)\s+(?:o|meu|nosso)?\s*check[- ]?out\b/i.test(norm) ||
    /\b(?:flat|quarto|apartamento|apto|uh|unidade)\s*(?:\d{2,4}\s*)?(?:desocupado|liberado|vazio)\b/i.test(norm) ||
    /\b(?:aviso|comunicacao|notificacao)\s+de\s+(?:check[- ]?out|saida)\b/i.test(norm) ||
    /\b(?:saida|check[- ]?out)\s+(?:realizad[ao]|conclu[ií]d[ao]|feit[ao]|informad[ao])\b/i.test(norm) ||
    /\b(?:chave|chaves)\s+(?:entregue[s]?|deixada[s]?|devolvida[s]?)\s+(?:na|no|para\s+a)\s+(?:portaria|recepcao|mesa|bancada|balcao)\b/i.test(norm) ||
    /\b(?:chave|chaves)\s+(?:na|no|em\s+cima\s+d[ao])\s+(?:portaria|recepcao|mesa|bancada|balcao)\b/i.test(norm)
  ) && !(
    /\b(?:qual\s+(?:e\s+)?o\s+horario|que\s+horas\s+(?:e|seria|posso\s+fazer\s+o)|ate\s+que\s+horas\s+(?:e\s+o|posso\s+ficar))\s+(?:de\s+|do\s+)?check[- ]?out\b/i.test(norm) ||
    /\b(?:quanto\s+custa|qual\s+(?:o\s+)?(?:preco|valor|custo|taxa))\s+(?:do|de)?\s*(?:check[- ]?out|late\s*check[- ]?out)\b/i.test(norm) ||
    (/\b(?:politica|regras?)\s+de\s+check[- ]?out\b/i.test(norm) && !/\b(?:sai|saimos|deixei|entreguei|desocupe|liberei)\b/i.test(norm))
  );

  if (isCheckoutCommunication) {
    return {
      category: "checkout_comunicacao",
      demandTitle: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.title,
      reason: actionTarget ? "action_disabled" : "capability_missing",
      actionTarget: "informCheckout",
      suggestedFeature: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.defaultSuggested
    };
  }

  if (/\b(?:placa|cadastrar\s*ve[ií]culo|cadastrar\s*carro|trocar\s*de\s*carro|mudei\s*de\s*carro|carro\s*novo|autorizar\s*carro|autorizar\s*ve[ií]culo|adicionar\s*ve[ií]culo|adicionar\s*placa)\b/i.test(lower) ||
      (/\b(?:garagem|estacionamento)\b/i.test(lower) && /\b(?:trocar|cadastrar|adicionar|mudar|liberar|placa)\b/i.test(lower))) {
    return {
      category: "garagem_veiculo",
      demandTitle: UNMET_DEMAND_CATEGORIES.garagem_veiculo.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.garagem_veiculo.defaultSuggested
    };
  }

  if (/\b(?:nota\s*fiscal|nf|nfe|fatura|recibo\s*fiscal|comprovante\s*fiscal|cnpj\s*(?:na\s*nota)?)\b/i.test(lower)) {
    return {
      category: "emissao_nota_fiscal",
      demandTitle: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.defaultSuggested
    };
  }

  if (/\b(?:trocar\s*de\s*(?:quarto|flat|apartamento)|mudar\s*de\s*(?:quarto|flat|apartamento)|outro\s*flat|andar\s*mais\s*alto)\b/i.test(lower)) {
    return {
      category: "troca_flat",
      demandTitle: UNMET_DEMAND_CATEGORIES.troca_flat.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.troca_flat.defaultSuggested
    };
  }

  if (/\b(?:pedir|solicitar|entregar|enviar|trazer|agendar|mandar)\s+(?:o\s+)?caf[eé]\b/i.test(lower) ||
      /\b(?:room\s*service|delivery\s*de\s*caf[eé])\b/i.test(lower) ||
      (/\bcaf[eé]\s*(?:da\s*manh[aã])?\s*(?:no\s*quarto|servido\s*no\s*quarto)\b/i.test(lower) && /\b(?:pedir|quero|favor|preciso|solicito|trazer|entregar|agendar)\b/i.test(lower))) {
    return {
      category: "cafe_quarto",
      demandTitle: UNMET_DEMAND_CATEGORIES.cafe_quarto.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.cafe_quarto.defaultSuggested
    };
  }

  if (/\b(?:ber[cç]o|secador(?:\s+de\s+cabelo)?|ferro(?:\s+de\s+passar)?|t[aá]bua(?:\s+de\s+passar)?|tomada\s+220|adaptador|recarga|carro\s+el[eé]trico|aquecedor|cama\s+extra)\b/i.test(lower)) {
    return {
      category: "itens_especiais_comodidades",
      demandTitle: UNMET_DEMAND_CATEGORIES.itens_especiais_comodidades.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.itens_especiais_comodidades.defaultSuggested
    };
  }

  return {
    category: "outros",
    demandTitle: UNMET_DEMAND_CATEGORIES.outros.title,
    reason: explicitReason || "requires_operator",
    actionTarget: null,
    suggestedFeature: UNMET_DEMAND_CATEGORIES.outros.defaultSuggested
  };
}

export function findExistingUnmetDemand(db, category, text, cleanPhone) {
  if (!db || !Array.isArray(db.unmetDemands)) return null;

  return db.unmetDemands.find(item => {
    if (!item || item.status === "descartada" || item.status === "implementada") return false;
    if (item.category !== category) return false;

    // Se tiver telefone e for a mesma categoria, agrupa com alta preferência
    if (cleanPhone && Array.isArray(item.clientPhones) && item.clientPhones.some(p => matchClientPhone(p, cleanPhone))) {
      return true;
    }

    // Se for a mesma categoria e não for 'outros'
    if (category !== "outros") {
      return true;
    }

    const itemText = (item.rawMessage || "").toLowerCase();
    const curText = (text || "").toLowerCase();
    return itemText === curText || (item.variations || []).some(v => v.toLowerCase() === curText);
  });
}

export function detectAndRecordUnmetDemand({
  db,
  text,
  senderPhone,
  senderName,
  guestContext = null,
  actionTarget = null,
  reason = null,
  category = null,
  demandTitle = null,
  suggestedFeature = null,
  saveDatabase = null,
  createNotification = null
}) {
  if (!db) return null;
  if (!Array.isArray(db.unmetDemands)) db.unmetDemands = [];

  const rawText = String(text || "").trim();
  if (!rawText && !actionTarget && !category) return null;

  const cleanPhone = cleanWhatsAppPhone(senderPhone) || String(senderPhone || "").replace(/\D/g, "");

  // Descarta mensagens que são apenas saudações ou despedidas sem demanda
  if (rawText && !actionTarget && !category) {
    const isGreeting = /^(?:oi|ol[aá]|opa|ei|bom dia|boa tarde|boa noite|tchau|obrigado|obrigada|valeu|ok|beleza|sim|n[aã]o)[.!?\s]*$/i.test(rawText);
    if (isGreeting) return null;
  }

  const classification = (category && demandTitle)
    ? {
        category,
        demandTitle,
        reason: reason || "capability_missing",
        actionTarget: actionTarget || null,
        suggestedFeature: suggestedFeature || UNMET_DEMAND_CATEGORIES[category]?.defaultSuggested || ""
      }
    : classifyUnmetDemand(rawText, actionTarget, reason);
  const now = new Date().toISOString();

  // Verifica se já existe uma demanda em aberto similar
  const existing = findExistingUnmetDemand(db, classification.category, rawText, cleanPhone);

  if (existing) {
    existing.occurrencesCount = (existing.occurrencesCount || 1) + 1;
    existing.lastDetectedAt = now;
    if (rawText && Array.isArray(existing.variations) && !existing.variations.includes(rawText)) {
      existing.variations.push(rawText);
      if (existing.variations.length > 20) existing.variations = existing.variations.slice(-20);
    }
    if (cleanPhone && Array.isArray(existing.clientPhones) && !existing.clientPhones.includes(cleanPhone)) {
      existing.clientPhones.push(cleanPhone);
    }
    if (senderName && senderName !== "Hóspede" && (!existing.senderName || existing.senderName === "Hóspede")) {
      existing.senderName = senderName;
    }
    if (guestContext && Object.keys(guestContext).length > 0) {
      existing.guestContext = { ...(existing.guestContext || {}), ...guestContext };
    }
    if (typeof saveDatabase === "function") {
      try { saveDatabase("unmet_demand_updated"); } catch (_) {}
    }
    return existing;
  }

  // Cria novo registro de demanda
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const newDemand = {
    id: `demand_${Date.now()}_${randomSuffix}`,
    category: classification.category,
    demandTitle: classification.demandTitle,
    reason: classification.reason,
    actionTarget: classification.actionTarget || null,
    suggestedFeature: classification.suggestedFeature,
    rawMessage: rawText,
    variations: rawText ? [rawText] : [],
    senderPhone: cleanPhone,
    clientPhones: cleanPhone ? [cleanPhone] : [],
    senderName: senderName || "Hóspede",
    guestContext: guestContext || null,
    status: "pendente",
    occurrencesCount: 1,
    firstDetectedAt: now,
    lastDetectedAt: now,
    adminNotes: ""
  };

  db.unmetDemands.unshift(newDemand);

  if (typeof saveDatabase === "function") {
    try { saveDatabase("unmet_demand_created"); } catch (_) {}
  }

  if (typeof createNotification === "function") {
    try {
      createNotification("demanda_ia", `💡 Nova Demanda Mapeada: ${newDemand.demandTitle} (${senderName || cleanPhone})`, {
        link: "/whatsapp-automation?tab=demands_backlog",
        demandId: newDemand.id
      });
    } catch (_) {}
  }

  console.log(`[Demandas IA] Nova demanda mapeada: "${newDemand.demandTitle}" (Motivo: ${newDemand.reason}, Categoria: ${newDemand.category})`);

  return newDemand;
}

/**
 * Executa uma ação interna do bot com checagem de permissão e chave mestra
 */
export async function executeBotAction(db, actionName, args = {}) {
  const settings = getBotActionsSettings(db);

  if (!settings.apiActionsEnabled || !settings.allowedActions?.[actionName]) {
    try {
      detectAndRecordUnmetDemand({
        db,
        text: args.messageText || `Tentativa de acionar a ação '${actionName}'`,
        senderPhone: args.phone || args.guestPhone || "",
        senderName: args.guestName || "Hóspede",
        guestContext: args.guestContext || null,
        actionTarget: actionName,
        reason: "action_disabled"
      });
    } catch (_) {}

    return {
      error: "ACTION_DISABLED",
      action: actionName,
      requiresHandover: true,
      message: settings.handoverMessage || "Esta ação do sistema está pausada ou requer atendimento humano."
    };
  }

  switch (actionName) {
    case "checkAvailability":
      return handleCheckAvailability(db, args);
    case "calculateQuote":
      return handleCalculateQuote(db, args);
    case "createPreReservation":
      return handleCreatePreReservation(db, args);
    case "generatePayment":
      return handleGeneratePayment(db, args);
    case "commitReservation":
      return handleCommitReservation(db, args);
    case "getReservationDetails":
      return handleGetReservationDetails(db, args);
    case "getFlatStatus":
      return handleGetFlatStatus(db, args);
    case "getPricingInfo":
      return handleGetPricingInfo(db, args);
    case "recordUnmetDemand":
      return handleRecordUnmetDemand(db, args);
    case "informCheckout":
      return handleInformCheckout(db, args);
    case "getFlatAmenities":
      return handleGetFlatAmenities(db, args);
    case "reallocateReservationFlat":
      return handleReallocateReservationFlat(db, args);
    case "querySystemData":
      return handleQuerySystemData(db, args);
    default:
      return {
        error: "UNKNOWN_ACTION",
        action: actionName,
        message: `Ação '${actionName}' não é reconhecida.`
      };
  }
}

const PORTUGUESE_STOP_WORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas",
  "por", "pelo", "pela", "pelos", "pelas",
  "com", "para", "pra", "pro",
  "e", "que", "se", "como", "qual", "quais",
  "quando", "onde", "quem", "tem", "ha", "eh",
  "voce", "voces", "você", "vocês",
  "possui", "possuem", "ter", "deve", "devem",
  "alguem", "alguém", "pessoa", "pessoas",
  "esta", "está", "estao", "estão", "estou",
  "favor", "por favor", "gostaria", "queria", "saber",
  "verificar", "perguntar", "dizer", "falar", "responder"
]);

const GENERIC_COMMON_WORDS = new Set([
  "horario", "horarios", "quarto", "quartos", "flat", "flats", "apartamento", "apto",
  "hotel", "reserva", "reservas", "dia", "dias", "hoje", "valor", "valores", "preco",
  "precos", "informacao", "informacoes", "duvida", "duvidas", "posso", "pode", "saber",
  "fazer", "tem", "temos", "qual", "quais", "como", "onde", "quando"
]);

// ── Motor de Treinamento Inteligente, Calibração de Tom e Modo Desenvolvedor ──

/**
 * Sintetiza o texto de coaching do desenvolvedor em uma diretriz profissional
 * sem repetir erros de digitação ou frases informais literais ("Anti-Papagaio")
 */
export function cleanDeveloperPreamble(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  let cleaned = rawText.trim();
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/^sofia\s*[,:]\s*/i, "")
      .replace(/^(?:(?:sou|aqui\s+[eé])\s+(?:o\s+)?(?:miller|desenvolvedor|dev|criador|programador)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:(?:miller|desenvolvedor|dev|criador|programador)\s+(?:aqui|falando)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:(?:estou|apenas|s[oó]|em)\s+test(?:ando|e)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:(?:teste|testando)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;]*\s*/i, "")
      .trim();
  }
  return cleaned;
}

/**
 * Sintetiza o texto de coaching do desenvolvedor em uma diretriz profissional
 * sem repetir erros de digitação ou frases informais literais ("Anti-Papagaio")
 */
export function synthesizeGuidelineFromText(rawText, category = "geral") {
  const cleanedText = cleanDeveloperPreamble(rawText);
  const text = cleanedText || String(rawText || "").trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Caso 1: Regra sobre malas / bagagens
  if (/malas?|bagag/i.test(lower)) {
    return "Nunca oferecer auxílio com malas ou bagagens. O condomínio Soho não dispõe de serviço de maleiros ou carregadores, mantendo o atendimento focado no acolhimento e nas dúvidas do hóspede.";
  }

  // Caso 2: Regra sobre postura de escuta ativa / sem presunção em saudações
  if (/(?:n[aã]o\s+assumir|s[oó]\s+pergunt|como\s+pode\s+ajudar|racioc[ií]nio|apenas\s+responder)/i.test(lower) || (/(?:sauda[cç][aã]o|bom\s+dia|ol[aá])/i.test(lower) && /(?:h[oó]spede|reserva|ajud)/i.test(lower))) {
    return "Adotar postura de escuta ativa: em saudações iniciais (olá, bom dia, etc.), cumprimentar cordialmente e apenas perguntar abertamente como pode ajudar hoje, sem presumir o assunto e sem despejar detalhes da reserva logo de início. O conhecimento sobre o hóspede ou reserva deve ser usado nos bastidores para responder com coerência sob demanda, conforme o que for perguntado.";
  }

  // Caso 2.5: Regra sobre check-out / hóspede hospedado / não mandar pré-check-in em check-out ou estadia
  const isCheckoutOrInStayCoaching = (
    /(?:check[- ]?out|sa[ií]da).*?(?:n[aã]o\s+(?:deveria|deve|pode|mande|mandar|precisa)|link\s+(?:de\s+)?check[- ]?in|estender|prorroga|late\s+check[- ]?out|12:00|12h|desocup)/i.test(lower) ||
    /(?:n[aã]o\s+(?:deveria|deve|pode|mande|mandar|precisa)\s+(?:ter\s+)?mandad[ao]\s+link\s+(?:de\s+)?check[- ]?in)/i.test(lower) ||
    /(?:estou\s+hospedad[ao]|j[aá]\s+hospedad[ao]|em\s+estadia|quem\s+j[aá]\s+est[aá]\s+hospedad[ao]).*?(?:check[- ]?out|sa[ií]da|link\s+(?:de\s+)?check[- ]?in|pre[- ]?check[- ]?in|n[aã]o\s+precisa)/i.test(lower) ||
    (category === "checkout" && /(?:check[- ]?in|estender|prorroga|12:00|12h|desocup|hor[aá]rio|sa[ií]da)/i.test(lower))
  );
  if (isCheckoutOrInStayCoaching) {
    return "Para hóspedes já hospedados ou em dia de check-out, priorizar procedimentos de check-out (horário limite até às 12:00h) e verificar se o hóspede deseja estender a estadia ou se já desocupou o flat, sem envio de link de pré-check-in.";
  }

  // Caso 3: Regra sobre checagem de reserva
  if (/pergu?i?nt.*reserva|verific.*reserva/i.test(lower)) {
    return "Ao ser questionada se tem reserva ou se a reserva está confirmada ('minha reserva está confirmada?'), verificar no sistema se o hóspede possui reserva ativa para data atual ou futura. Se confirmada, apresentar os detalhes do flat, check-in, check-out e link do pré-check-in. Se não localizada pelo número, solicitar o nome completo do titular ou código da reserva com cortesia.";
  }

  // Caso 1.5: Regra sobre saudação ou perguntar sobre estadia agradável
  if (/(?:perguntar\s+assim|sauda[cç][aã]o|hospedad[ao]|esteja\s+hospedad[ao]|em\s+estadia|tornar\s+a\s+estadia)/i.test(lower)) {
    return "Ao saudar o hóspede, verificar primeiro o status da estadia no sistema: só perguntar sobre 'tornar a estadia mais agradável' se a pessoa já estiver hospedada (em estadia). Se for reserva futura, check-in hoje que ainda não entrou ou sem reserva, adaptar a saudação ao momento exato da chegada.";
  }

  // Caso 4: Regra sobre café com horário específico informado
  if (/caf[eé]|desjejum/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário do café da manhã é ${timeMatch[0]} em bandeja servida no quarto, com agendamento até a véspera pelo portal.`;
    }
  }

  // Caso 5: Regra sobre check-in com horário específico
  if (/check[- ]?in|entrada/i.test(lower) && !/check[- ]?out/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário de check-in é a partir das ${timeMatch[0]}.`;
    }
  }

  // Caso 6: Regra sobre check-out com horário específico
  if (/check[- ]?out|sa[ií]da/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário de check-out é até as ${timeMatch[0]}.`;
    }
  }

  // Caso 7: Regra genérica bem sintetizada preservando fatos (anti-papagaio estrito)
  let synthesized = text
    .replace(/^sofia\s*[,:]\s*/i, "")
    .replace(/^(?:(?:sou|aqui\s+[eé])\s+(?:o\s+)?(?:miller|desenvolvedor|dev|criador)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:(?:miller|desenvolvedor|dev)\s+(?:aqui|falando)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:(?:estou|apenas|s[oó]|em)\s+test(?:ando|e)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:(?:teste|testando)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:quando|sempre\s+que|toda\s+vez\s+que|se)\s+(?:algu[eé]m|o\s+h[oó]spede|o\s+cliente|um\s+h[oó]spede|[a-z]+)\s+pergu?i?nt[^,.:;]+(?:voc[eê]\s+deve|favor|deve-se|tem\s+que)\s+/i, "Ao ser questionada sobre este tema: ")
    .replace(/^voc[eê]\s+deve\s+/i, "Sempre ")
    .replace(/\b(?:estou\s+testando|sou\s+miller|miller\s+aqui|apenas\s+testando|em\s+teste|teste:)\b[.!?]*\s*/gi, "")
    .replace(/\bvoc[eê]\s+n[aã]o\s+deveria\s+ter\s+mandad[ao]\b/gi, "não enviar")
    .replace(/\bvoc[eê]\s+n[aã]o\s+deve\s+mandar\b/gi, "não enviar")
    .trim();

  if (synthesized.length > 0) {
    synthesized = synthesized.charAt(0).toUpperCase() + synthesized.slice(1);
    if (!synthesized.endsWith(".")) synthesized += ".";
  }

  return synthesized;
}

/**
 * Classifica a intenção de mensagens enviadas pelo desenvolvedor/gestor:
 * - tone_calibration: comandos de ajuste estilístico/tom (não literais)
 * - factual_coaching: regras factuais, horários, correções de flats
 * - guest_simulation: simulação de dúvidas de hotelaria/hóspede
 */
export function classifyDeveloperMessage(messageText, db = null) {
  if (!messageText || typeof messageText !== "string") {
    return { type: "guest_simulation", originalText: "" };
  }
  const text = messageText.trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Detecção de Calibração de Tom / Estilo (tone_calibration)
  const toneKeywords = [
    /\b(mais curt[ao]|mais concis[ao]|mais objetiv[ao]|mais sucint[ao]|respostas? curtas?|mais breve|menos prolix[ao]|seja breve|seja curt[ao]|seja concis[ao]|seja objetiv[ao]|reduza o tamanho|responda curto)\b/,
    /\b(mais detalhad[ao]|mais explicativ[ao]|mais complet[ao]|respostas? longas?)\b/,
    /\b(menos emojis?|sem emojis?|n[aã]o use emojis?|evite emojis?|zero emojis?|reduza os emojis?|tire os emojis?)\b/,
    /\b(mais emojis?|use emojis?|bastante emojis?)\b/,
    /\b(mais executiv[ao]|tom executiv[ao]|mais formal|tom formal|mais corporativ[ao]|mais polid[ao])\b/,
    /\b(mais descontra[ií]d[ao]|mais informal|tom informal|tom descontra[ií]d[ao]|mais acolhedor[ao]|mais amig[aá]vel|mais caloros[ao])\b/,
    /\b(calibre seu tom|ajuste o tom|mude o tom|altere o tom|novo tom|estilo de resposta)\b/
  ];

  const isToneMatch = toneKeywords.some(pattern => pattern.test(lower));
  if (isToneMatch) {
    const updates = {};
    if (/\b(mais curt[ao]|mais concis[ao]|mais objetiv[ao]|mais sucint[ao]|respostas? curtas?|mais breve|menos prolix[ao]|seja breve|seja curt[ao]|seja concis[ao]|seja objetiv[ao]|reduza o tamanho|responda curto)\b/.test(lower)) {
      updates.conciseness = "compact";
      updates.ruleText = "Responda de forma curta e objetiva (ideal de 1 a 3 frases para WhatsApp).";
    } else if (/\b(mais detalhad[ao]|mais explicativ[ao]|mais complet[ao]|respostas? longas?)\b/.test(lower)) {
      updates.conciseness = "detailed";
      updates.ruleText = "Forneça explicações detalhadas e completas.";
    }

    if (/\b(sem emojis?|n[aã]o use emojis?|zero emojis?|tire os emojis?)\b/.test(lower)) {
      updates.emojiUsage = "none";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Não utilize emojis.";
    } else if (/\b(menos emojis?|evite emojis?|reduza os emojis?)\b/.test(lower)) {
      updates.emojiUsage = "minimal";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Use emojis com moderação estrita (no máximo 1 emoji pontual).";
    } else if (/\b(mais emojis?|use emojis?|bastante emojis?)\b/.test(lower)) {
      updates.emojiUsage = "expressive";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Utilize emojis acolhedores com mais frequência.";
    }

    if (/\b(mais executiv[ao]|tom executiv[ao]|mais formal|tom formal|mais corporativ[ao]|mais polid[ao])\b/.test(lower)) {
      updates.formality = "executive";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Adote tom executivo, formal e polido.";
    } else if (/\b(mais descontra[ií]d[ao]|mais informal|tom informal|tom descontra[ií]d[ao]|mais amig[aá]vel|mais caloros[ao])\b/.test(lower)) {
      updates.formality = "casual";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Adote tom descontraído, amigável e caloroso.";
    }

    return {
      type: "tone_calibration",
      updates,
      originalText: text
    };
  }

  // 2. Detecção de Treinamento Factual / Aprendizado de Diretriz (factual_coaching)
  const isDirectDevCoaching = (
    // Miller se identificando como criador/dev
    /\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|miller\s+(?:aqui|falando)|sou\s+(?:o\s+)?(?:desenvolvedor|dev|criador|programador)|dev\s+aqui)\b/i.test(lower) ||
    // Menção explícita a testes do desenvolvedor
    /\b(?:estou\s+testando|apenas\s+testando|em\s+teste|teste:\s*|testando:\s*|modo\s+teste)\b/i.test(lower) ||
    // Feedback de erro / crítica comportamental
    /\b(?:n[aã]o\s+deve|n[aã]o\s+pode|n[aã]o\s+pergunte|n[aã]o\s+diga|n[aã]o\s+fale|n[aã]o\s+responda|n[aã]o\s+mande)\s+(?:assim|dessa\s+forma|desse\s+jeito|isso)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+(?:deve|deveria|precisa|pode)\s+(?:perguntar|dizer|falar|responder|mandar|enviar|ter\s+mandado|agir|tratar|usar|oferecer))\b/i.test(lower) ||
    /\b(?:n[aã]o\s+(?:deveria|precisa|deve|pode)\s+(?:ter\s+)?mandad[ao]\s+(?:link|mensagem|pre-?check-?in|check-?in))\b/i.test(lower) ||
    /\b(?:n[aã]o\s+precisa\s+(?:de\s+)?(?:link|pre-?check-?in|check-?in))\b/i.test(lower) ||
    /\b(?:malas?|bagag(?:em|ens)?)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+assumir|s[oó]\s+deve\s+usar|apenas\s+responder|esse\s+seja\s+o\s+racioc[ií]nio|racioc[ií]nio)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+faz\s+sentido|a\s+menos\s+que|s[oó]\s+se\s+a\s+pessoa|s[oó]\s+(?:pergunte|fale|diga|mande)\s+se)\b/i.test(lower) ||
    /\b(?:voc[eê]\s+verificou|verifique\s+(?:primeiro|antes)|verificou\s+(?:primeiro|antes)|cheque\s+(?:primeiro|antes))\b/i.test(lower) ||
    /\b(?:t[aá]\s+errad[ao]|est[aá]\s+errad[ao]|t[aá]\s+burra|est[aá]\s+burra|falhando|melhor(?:e|ar)\s+(?:a\s+resposta|isso)|corrij?a|aprenda\s+a)\b/i.test(lower) ||
    /\b(?:por\s+que\s+voc[eê]\s+(?:disse|falou|perguntou|respondeu))\b/i.test(lower) ||
    // Instruções condicionais de atendimento ("quando alguém...", "se o hóspede...")
    /\b(?:quando|sempre\s+que|toda\s+vez\s+que)\s+(?:algu[eé]m|o\s+h[oó]spede|o\s+cliente|um\s+h[oó]spede|[a-z]+)\s+.*?\bper(?:g|gi|gui)u?nt/i.test(lower) ||
    /\b(?:quando|sempre\s+que|toda\s+vez\s+que)\s+.*?\bper(?:g|gi|gui)u?nt/i.test(lower) ||
    /\b(?:voc[eê]\s+(?:deve|precisa|tem\s+que)|sempre\s+verifique|favor\s+verificar|verifique\s+se|n[aã]o\s+(?:responda|diga|fale|mande)|responda\s+que|oriente\s+que)\b/i.test(lower) ||
    /\b(informa[cç][aã]o\s+correta|o\s+correto\s+[eé]|nova\s+regra|regra\s+(?:geral|[eé])|aprenda\s+que|anote\s+(?:a[ií]|isso)|grave\s+que|lembre\s+que|hor[aá]rio\s+mudou|mudou\s+para|n[aã]o\s+diga\s+que|nunca\s+diga\s+que|n[aã]o\s+informe\s+que|retifique|corre[cç][aã]o:)\b/i.test(lower) ||
    // Orientações sobre checkout vs in-stay
    /\b(?:link\s+de\s+confirma[cç][aã]o\s+de\s+check-?out|informa[cç][oõ]es\s+sobre\s+o\s+check-?out|perguntando\s+se\s+quer\s+estender|refor[cç]ar\s+t(?:am)?b(?:[eé]m)?\s+que\s+o\s+check-?out|confirmando\s+se\s+a\s+pessoa\s+j[aá]\s+saiu)\b/i.test(lower) ||
    // Sofia sendo chamada com diretriz ou correção
    (/^sofia\s*[,:]/i.test(lower) && !/^(?:sofia\s*[,:]\s*)?(?:qual|quanto|tem|como|onde|posso|voc[eê]s?\s+t[eê]m|aceita)\s+(?:a\s+senha|o\s+wi-?fi|o\s+hor[aá]rio|o\s+valor|a\s+di[aá]ria|vaga|garagem|caf[eé]|pet|ferro)/i.test(lower)) ||
    (/\b(?:para\s+o\s+flat|no\s+flat|sobre\s+o\s+flat)\s+(\d{2,4})\b/i.test(lower) && /\b(informa[cç][aã]o|corret|regra|senha|mudou)\b/i.test(lower))
  );

  if (isDirectDevCoaching) {
    const flatMatch = text.match(/\b(?:flat|apto|apartamento|quarto)\s*(\d{2,4})\b/i);
    const targetFlat = flatMatch ? flatMatch[1] : null;

    const cleanText = cleanDeveloperPreamble(text);

    let category = "geral";
    // Ordem de precedência: checkout deve vir antes de checkin para mensagens como "meu check-out é hoje, não mande link de check-in" ou "quem já está hospedado não precisa de link de check-in"
    if (/(?:check[- ]?out|sa[ií]da|desocup|estender|prorroga|late\s+check[- ]?out)/i.test(lower) ||
        (/(?:hospedad[ao]|em\s+estadia)/i.test(lower) && /(?:check[- ]?in|pr[eé][- ]?check[- ]?in|link)/i.test(lower))) {
      category = "checkout";
    } else if (/(?:sauda[cç][aã]o|perguntar\s+assim|tornar\s+a\s+estadia|n[aã]o\s+assumir|racioc[ií]nio)/i.test(lower) ||
               (/(?:hospedad[ao]|esteja\s+hospedad[ao])/i.test(lower) && /(?:sauda[cç][aã]o|bom\s+dia|ol[aá]|pergunt)/i.test(lower))) {
      category = "saudacao";
    } else if (/(?:malas?|bagag)/i.test(lower)) category = "malas";
    else if (/reserva|estadia|h[oó]spede\s+com\s+reserva/i.test(lower)) category = "reserva";
    else if (/caf[eé]|desjejum/i.test(lower)) category = "cafe";
    else if (/check[- ]?in|entrada/i.test(lower)) category = "checkin";
    else if (/wi-?fi|internet|senha/i.test(lower)) category = "wifi";
    else if (/garagem|estacionamento|vaga|carro/i.test(lower)) category = "garagem";
    else if (/pet|cachorro|animal/i.test(lower)) category = "pet";
    else if (targetFlat) category = `flat_${targetFlat}`;

    const synthesizedRule = synthesizeGuidelineFromText(cleanText, category);
    const sampleResponse = generateSampleGuestResponse({
      category,
      ruleText: synthesizedRule,
      targetFlat
    });

    return {
      type: "factual_coaching",
      guideline: {
        text: synthesizedRule,
        category,
        targetFlat,
        rawInput: text,
        sample: sampleResponse,
        sampleResponse
      },
      originalText: text
    };
  }

  // 3. Simulação de Hóspede (guest_simulation)
  return {
    type: "guest_simulation",
    originalText: text
  };
}

/**
 * Destila o par (Dúvida do Hóspede + Resposta do Operador) em uma diretriz conceitual
 * permanente para a base de conhecimento vivo da IA ("Anti-Copia-e-Cola")
 */
export function distillGuidelineFromOperatorResponse({ question = "", response = "", category = "geral", targetFlat = null }) {
  const qClean = String(question || "").trim();
  const rClean = String(response || "").trim();
  const qLower = qClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rLower = rClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Extrai o núcleo da resposta removendo saudações e cortesias preliminares ("olá", "bom dia", "oi", etc.)
  const rCore = rLower
    .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem\??|opa)[,!.:;*\s]*/i, "")
    .trim();

  const isAffirmative = /^(?:sim|com certeza|claro|pode|consegue|tem|temos|positivo|perfeito|liberado|dispon[ií]vel|aceita|aceitamos|isso|exato|correto)\b/i.test(rCore);
  const isNegative = /^(?:n[aã]o|infelizmente n[aã]o|n[aã]o pode|n[aã]o permitimos|proibido|n[aã]o temos|negativo|imposs[ií]vel)\b/i.test(rCore);

  let synthesizedGuideline = "";
  let sampleResponse = "";
  let finalCategory = category || "geral";

  // 1. Extensão de estadia / prorrogação de reserva (WhatsApp ou geral)
  if (/(?:estender|prorroga|prolongar|mais\s+di[aá]rias?|ficar\s+mais)/i.test(qLower)) {
    finalCategory = "checkout";
    if (!isNegative) {
      synthesizedGuideline = "É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp com a equipe, mediante disponibilidade do flat.";
      sampleResponse = "Olá! Sim, é possível estender a sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat! ✨ Para verificarmos a extensão, por favor me informe até que data gostaria de ficar.";
    } else {
      synthesizedGuideline = "Não é possível prorrogar a reserva diretamente para este período devido à indisponibilidade de vagas no flat.";
      sampleResponse = "Olá! No momento não é possível estender a estadia diretamente por aqui devido à ocupação do flat. Qualquer dúvida, estou à disposição!";
    }
  }
  // 2. Horário de check-out / saída
  else if (/(?:check[- ]?out|sa[ií]da|desocup)/i.test(qLower) && /(?:hor[aá]rio|horas?|quando|limite)/i.test(qLower)) {
    finalCategory = "checkout";
    const timeMatch = rClean.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)?(?:\s*\d{1,2}(?::\d{2})?(?:h)?)?)\b/i);
    const timeStr = timeMatch ? timeMatch[0] : "12:00h";
    synthesizedGuideline = `O horário de check-out é até as ${timeStr}.`;
    sampleResponse = `Olá! O horário de check-out deve ser realizado até as ${timeStr}. Basta deixar os cartões-chave na recepção/portaria ao sair! 🕛👋`;
  }
  // 3. Horário de check-in / entrada
  else if (/(?:check[- ]?in|entrada|chegada)/i.test(qLower) && /(?:hor[aá]rio|horas?|quando|limite)/i.test(qLower)) {
    finalCategory = "checkin";
    const timeMatch = rClean.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)?(?:\s*\d{1,2}(?::\d{2})?(?:h)?)?)\b/i);
    const timeStr = timeMatch ? timeMatch[0] : "14:00h";
    synthesizedGuideline = `O horário de check-in inicia a partir das ${timeStr}.`;
    sampleResponse = `Olá! O horário de check-in inicia a partir das ${timeStr}. Se chegar antes, faremos o possível para liberar o flat conforme a disponibilidade! 🔑🛎️`;
  }
  // 4. Micro-ondas e cozinha
  else if (/micro[- ]?ondas/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Todos os nossos flats dispõem de forno micro-ondas e frigobar para total comodidade dos hóspedes.";
      sampleResponse = "Olá! Sim, todos os nossos flats dispõem de micro-ondas, frigobar e cozinha compacta equipada! 🍽️⚡";
    } else {
      synthesizedGuideline = "Os flats não dispõem de micro-ondas.";
      sampleResponse = "Olá! Informamos que os flats não dispõem de micro-ondas.";
    }
  }
  // 5. Frigobar / Geladeira
  else if (/frigobar|geladeira|congelador/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Todos os flats contam com frigobar abastecido com bebidas e snacks em parceria com a Anserve, autoatendimento via PIX/Cartão e 1 kit cortesia por estadia.";
      sampleResponse = "Olá! Sim, todos os flats contam com frigobar privativo abastecido com bebidas e snacks (autoatendimento Anserve via PIX ou Cartão) e cortesia de boas-vindas com Nespresso e doces! 🧊☕";
    }
  }
  // 6. Ferro de passar / tábua
  else if (/ferro|passar\s+roupa|t[aá]bua/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Disponibilizamos ferro de passar roupa nos flats para comodidade dos hóspedes.";
      sampleResponse = "Olá! Sim, disponibilizamos ferro de passar roupa nos flats para seu uso durante a estadia! 👔✨";
    }
  }
  // 7. Voltagem / tomadas
  else if (/voltagem|110|220|127|tomada/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    const volt = /220/i.test(rLower) ? "220V" : "127V (110V)";
    synthesizedGuideline = `A voltagem padrão em todos os flats é ${volt}.`;
    sampleResponse = `Olá! A voltagem padrão em todos os nossos flats é ${volt}. 🔌⚡`;
  }
  // 8. Pet / Animais
  else if (/pet|cachorro|animal|gato/i.test(qLower)) {
    finalCategory = "pet";
    if (!isNegative) {
      synthesizedGuideline = "Aceitamos pets de pequeno porte mediante taxa única e cumprimento das normas condominiais.";
      sampleResponse = "Olá! Sim, aceitamos pets de pequeno porte com todo carinho (máximo 1 pet por flat, mediante taxa única)! 🐾✨";
    } else {
      synthesizedGuideline = "Não é permitida a estadia de animais de estimação nos flats.";
      sampleResponse = "Olá! Informamos que não é permitida a estadia de animais de estimação nas acomodações. 🛑🐾";
    }
  }
  // 9. Vaga de garagem / Estacionamento
  else if (/garagem|estacionamento|vaga|carro|ve[ií]culo/i.test(qLower)) {
    finalCategory = "garagem";
    if (!isNegative) {
      synthesizedGuideline = "Dispomos de 1 vaga de garagem rotativa coberta e gratuita por flat no condomínio Soho.";
      sampleResponse = "Olá! Sim, dispomos de 1 vaga de garagem rotativa gratuita por flat no condomínio Soho! 🚗";
    } else {
      synthesizedGuideline = "Não dispomos de vaga de garagem inclusa nesta acomodação.";
      sampleResponse = "Olá! Informamos que esta acomodação não dispõe de vaga de garagem inclusa.";
    }
  }
  // 10. Wi-Fi / Internet
  else if (/wi-?fi|internet|senha/i.test(qLower)) {
    finalCategory = "wifi";
    synthesizedGuideline = "O Wi-Fi é individual e de alta velocidade em cada acomodação.";
    sampleResponse = "Olá! O Wi-Fi é individual e de alta velocidade no flat! A rede é o número do apartamento e a senha padrão é 1234567890123. 📶";
  }
  // 11. Café da manhã
  else if (/caf[eé]|desjejum/i.test(qLower)) {
    finalCategory = "cafe";
    if (!isNegative) {
      synthesizedGuideline = "O café da manhã é servido em deliciosa bandeja personalizada diretamente no quarto, mediante agendamento até a véspera pelo portal do hóspede.";
      sampleResponse = "Olá! 🥐☕ O café da manhã é servido em bandeja diretamente no seu quarto das 05:00 às 09:30, com agendamento prévio pelo Portal do Hóspede!";
    }
  }
  // 12. Piscina / Academia / Lazer / Jacuzzi / Cobertura
  else if (/piscina|academia|jacuzzi|cobertura|lazer|hidro/i.test(qLower)) {
    finalCategory = "lazer";
    if (!isNegative) {
      synthesizedGuideline = "A piscina aquecida/jacuzzi e academia na cobertura funcionam diariamente das 06:00 às 22:00 para os hóspedes.";
      sampleResponse = "Olá! Sim, dispomos de piscina/jacuzzi aquecida e academia na cobertura, abertas diariamente das 06:00 às 22:00 para os hóspedes! 🏊‍♂️✨";
    } else {
      synthesizedGuideline = "A área de lazer e piscina encontra-se temporariamente em manutenção.";
      sampleResponse = "Olá! Informamos que a área de lazer está temporariamente indisponível para manutenção.";
    }
  }
  // 13. Fumo / Cigarro / Proibições
  else if (/fumo|fumar|cigarro|fumante/i.test(qLower)) {
    finalCategory = "regras";
    synthesizedGuideline = "É estritamente proibido fumar dentro dos flats e áreas fechadas do condomínio (ambiente 100% livre de fumo).";
    sampleResponse = "Olá! Informamos que nossas acomodações são 100% livres de fumo, sendo estritamente proibido fumar dentro dos apartamentos e áreas comuns. 🚭";
  }
  // 14. Berço / Bebê / Cama extra
  else if (/ber[cç]o|beb[eê]|crian[cç]a\s+de\s+colo|cama\s+extra/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Disponibilizamos berço para bebês mediante solicitação prévia à recepção para acomodação no flat.";
      sampleResponse = "Olá! Sim, disponibilizamos berço para seu bebê com todo carinho! Basta nos avisar com antecedência para prepararmos no flat para você. 👶✨";
    } else {
      synthesizedGuideline = "Não dispomos de berço para bebê nesta acomodação.";
      sampleResponse = "Olá! Informamos que não dispomos de berço para bebês nas acomodações no momento.";
    }
  }
  // 15. Secador de cabelo
  else if (/secador(?:\s+de\s+cabelo)?/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Dispomos de secador de cabelo nos flats para comodidade dos hóspedes.";
      sampleResponse = "Olá! Sim, disponibilizamos secador de cabelo no flat para seu conforto durante a estadia! 💇‍♀️✨";
    } else {
      synthesizedGuideline = "Os flats não dispõem de secador de cabelo.";
      sampleResponse = "Olá! Informamos que não dispomos de secador de cabelo nas acomodações.";
    }
  }
  // 16. Roupa de cama / Toalhas / Enxoval
  else if (/toalha|roupa\s+de\s+cama|len[cç]ol|enxoval|cobertor|travesseiro/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Fornecemos enxoval hoteleiro completo com roupas de cama, travesseiros e toalhas de banho limpas em todas as estadias.";
      sampleResponse = "Olá! Sim, todos os nossos flats contam com enxoval hoteleiro completo: roupas de cama limpas, travesseiros e toalhas higienizadas para sua chegada! 🛏️✨";
    }
  }
  // 17. Regra Geral / Fallback Dinâmico
  else {
    if (rClean.length >= 25 && !isAffirmative && !isNegative) {
      synthesizedGuideline = synthesizeGuidelineFromText(rClean, finalCategory);
      sampleResponse = `Olá! ${rClean}`;
    } else if (isAffirmative) {
      const cleanedQuestionTheme = qClean
        .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;*\s]*/i, "")
        .replace(/^(?:voc[eê]s?\s+)?(?:consigo|posso|tem|temos|possui|possuem|aceita|aceitam|d[aá]\s+para|d[aá]\s+pra|existe|existem|fornece|fornecem|oferece|oferecem)\s+/i, "")
        .replace(/\?+$/, "")
        .trim();
      synthesizedGuideline = `É confirmado e disponível para os hóspedes: ${cleanedQuestionTheme}.`;
      sampleResponse = `Olá! Sim, temos ${cleanedQuestionTheme} disponível para sua comodidade! ✨`;
    } else if (isNegative) {
      const cleanedQuestionTheme = qClean
        .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;*\s]*/i, "")
        .replace(/^(?:voc[eê]s?\s+)?(?:consigo|posso|tem|temos|possui|possuem|aceita|aceitam|d[aá]\s+para|d[aá]\s+pra|existe|existem|fornece|fornecem|oferece|oferecem)\s+/i, "")
        .replace(/\?+$/, "")
        .trim();
      if (/^(?:fumar|festa|barulho|levar|fazer|colocar)/i.test(cleanedQuestionTheme)) {
        synthesizedGuideline = `Não é permitido aos hóspedes: ${cleanedQuestionTheme}.`;
        sampleResponse = `Olá! Informamos que não é permitido ${cleanedQuestionTheme} nas dependências do flat.`;
      } else {
        synthesizedGuideline = `Não é disponibilizado nem fornecido aos hóspedes: ${cleanedQuestionTheme}.`;
        sampleResponse = `Olá! Informamos que não dispomos de ${cleanedQuestionTheme} no momento.`;
      }
    } else {
      synthesizedGuideline = synthesizeGuidelineFromText(rClean, finalCategory);
      sampleResponse = `Olá! ${rClean}`;
    }
  }

  return {
    guidelineText: synthesizedGuideline,
    category: finalCategory,
    sampleResponse,
    targetFlat
  };
}

/**
 * Gera um exemplo de resposta REALISTA e PROFISSIONAL da Sofia a um hóspede no WhatsApp
 * sem repetir meta-conversas internas, saudações de teste ou texto do desenvolvedor
 */
export function generateSampleGuestResponse({ category = "geral", ruleText = "", targetFlat = null }) {
  const lowerRule = (ruleText || "").toLowerCase();
  if (category === "checkout" || (category === "geral" && (lowerRule.includes("check-out") || lowerRule.includes("checkout") || lowerRule.includes("saída") || lowerRule.includes("saida")))) {
    return "Olá! Lembramos que hoje é o dia do seu check-out, com horário limite até às 12:00h. Deseja estender sua estadia ou solicitar late check-out? Caso já tenha desocupado o flat, basta nos avisar por aqui. Estamos à disposição! 🏨✨";
  }
  if (category === "saudacao" || (category === "geral" && (lowerRule.includes("saudar") || lowerRule.includes("saudação") || lowerRule.includes("hospedada")))) {
    return "Olá! Vi que você tem uma estadia confirmada a partir de 12/10 no Flat 712. Como posso te ajudar na preparação da sua chegada hoje? 🏨✨";
  }
  if (category === "reserva" || (category === "geral" && lowerRule.includes("reserva"))) {
    return "Olá! Sim, sua reserva está confirmada! 🏨✨\n• Flat: 605\n• Entrada: 15/10 a partir das 14:00h\n• Saída: 18/10 até as 12:00h\n• Status: Confirmada\n(Se não houver reserva ativa ou futura vinculada ao número, informo com cortesia e solicito o nome do titular ou código da reserva).";
  }
  if (category === "cafe" || (category === "geral" && (lowerRule.includes("café") || lowerRule.includes("cafe")))) {
    return "Olá! O café da manhã é servido exclusivamente em bandeja personalizada diretamente no seu flat. Qualquer dúvida sobre a escolha dos itens pelo portal, conte conosco! ☕✨";
  }
  if (category === "wifi" || (category === "geral" && (lowerRule.includes("wi-fi") || lowerRule.includes("wifi")))) {
    return "Olá! Cada apartamento conta com rede Wi-Fi individualizada no formato apto {número do flat}, com senha '1234567890123'. Tenha uma excelente conexão! 📶✨";
  }
  if (category === "garagem" || (category === "geral" && (lowerRule.includes("garagem") || lowerRule.includes("estacionamento")))) {
    return "Olá! Dispomos de garagem rotativa gratuita no condomínio. Lembre-se de cadastrar a placa do seu veículo no portal para liberação na portaria! 🚗✨";
  }
  if (category === "pet" || (category === "geral" && lowerRule.includes("pet"))) {
    return "Olá! Aceitamos com carinho cães de até 10kg com taxa adicional por diária. Se precisar de orientações para a hospedagem do seu pet, estou à disposição! 🐾✨";
  }
  if (targetFlat) {
    return `Olá! Sobre o Flat ${targetFlat}: informamos que dispõe de todas as comodidades para sua estadia. Se precisar de algo, conte conosco! 🔑✨`;
  }
  return "Olá! Estamos à inteira disposição para apoiar você em sua estadia na CorpFlats. Conte conosco para qualquer dúvida ou solicitação! 🏨✨";
}

/**
 * Sintetiza o treinamento do desenvolvedor via IA (Gemini) extraindo a regra abstrata e amostra realista
 */
export async function synthesizeDeveloperCoachingWithAi({
  rawText,
  category = "geral",
  targetFlat = null,
  apiKey,
  db = null
}) {
  if (!apiKey || !rawText) return null;

  const systemInstruction = `Você é o assistente sênior de calibração do sistema hoteleiro CorpFlats no Edifício Soho Residence Service.
O desenvolvedor ou gestor do sistema (Miller) enviou uma orientação/crítica de treinamento informal pelo WhatsApp:
"${rawText}"

Sua missão é sintetizar essa instrução de forma conceitual, profissional e não-literal ("Anti-Papagaio"):
1. "ruleText": Diretriz operacional formal e limpa em terceira pessoa para a base de conhecimento da Sofia (concierge virtual).
   - NUNCA inclua meta-conversa ou termos de teste (PROIBIDO usar "estou testando", "sou Miller", "você errou", "segundo o teste", etc.).
   - Deve ser uma diretriz abstrata de alto nível da operação.
   - Exemplo para checkout: "Para hóspedes já hospedados ou em dia de check-out, priorizar procedimentos de check-out (horário limite até 12:00h) e verificar se o hóspede deseja estender a estadia ou se já desocupou o flat, sem envio de link de pré-check-in."
2. "sampleResponse": Amostra REALISTA e PRÁTICA de resposta direta da Sofia a um HÓSPEDE no WhatsApp sob essa regra.
   - Deve ser um atendimento acolhedor e impecável ao hóspede ("Olá! ...").
   - NUNCA use frases internas ou diga "Conforme nossa política atualizada: Estou testando...".
3. "category": Categoria da diretriz (ex: "checkout", "checkin", "reserva", "cafe", "saudacao", "garagem", "wifi", "pet", "geral").

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "ruleText": "...",
  "sampleResponse": "...",
  "category": "..."
}`;

  try {
    const res = await callGeminiAi({
      apiKey,
      systemInstruction,
      prompt: `Sintetize a instrução recebida: "${rawText}"`,
      db,
      customPrompt: true
    });

    if (res?.ok && res?.text) {
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.ruleText && parsed?.sampleResponse) {
          const parrotCheck = /estou testando|sou miller|n[aã]o deveria ter mandado/i;
          if (!parrotCheck.test(parsed.ruleText) && !parrotCheck.test(parsed.sampleResponse)) {
            return {
              ruleText: String(parsed.ruleText).trim(),
              sampleResponse: String(parsed.sampleResponse).trim(),
              category: parsed.category || category
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[synthesizeDeveloperCoachingWithAi] Fallback para sintetizador heurístico:", err.message);
  }
  return null;
}

/**
 * Atualiza a seção de estilo do systemPrompt da Sofia sem apagar as diretrizes essenciais
 */
export function updateSystemPromptTone(basePrompt, tone) {
  if (!basePrompt) return basePrompt;
  const toneBlock = `\n\n[CALIBRAÇÃO DE ESTILO & TOM (ATUALIZADO)]:
- Concisão: ${tone.conciseness === "compact" ? "Alta concisão. Respostas curtas, objetivas (1 a 3 frases), ideais para leitura dinâmica no WhatsApp." : tone.conciseness === "detailed" ? "Explicativo e completo." : "Equilibrado."}
- Emojis: ${tone.emojiUsage === "none" ? "NÃO utilizar emojis." : tone.emojiUsage === "minimal" ? "Emojis mínimos e pontuais (no máximo 1)." : "Moderado e amigável."}
- Formalidade: ${tone.formality === "executive" ? "Executivo e formal." : tone.formality === "casual" ? "Descontraído e acolhedor." : "Profissional acolhedor."}
${Array.isArray(tone.customRules) && tone.customRules.length > 0 ? `- Regras de Estilo Ativas:\n  • ${tone.customRules.join("\n  • ")}` : ""}`;

  if (basePrompt.includes("[CALIBRAÇÃO DE ESTILO & TOM")) {
    return basePrompt.replace(/\[CALIBRAÇÃO DE ESTILO & TOM[\s\S]*?(?=\n\n\[|$)/, toneBlock.trim());
  }
  return basePrompt.trim() + toneBlock;
}

/**
 * Aplica calibração de tom às configurações do sistema (db.whatsappAiSettings e aiConfig)
 */
export function applyToneCalibration(db, updates = {}) {
  if (!db) return null;
  if (!db.whatsappAiSettings) {
    db.whatsappAiSettings = { developerGuidelines: [] };
  }
  if (!db.whatsappAiSettings.toneSettings) {
    db.whatsappAiSettings.toneSettings = {
      conciseness: "normal",
      emojiUsage: "moderate",
      formality: "casual_professional",
      customRules: [],
      updatedAt: new Date().toISOString()
    };
  }

  const tone = db.whatsappAiSettings.toneSettings;
  if (updates.conciseness) tone.conciseness = updates.conciseness;
  if (updates.emojiUsage) tone.emojiUsage = updates.emojiUsage;
  if (updates.formality) tone.formality = updates.formality;
  if (updates.ruleText) {
    if (!Array.isArray(tone.customRules)) tone.customRules = [];
    if (!tone.customRules.includes(updates.ruleText)) {
      tone.customRules.unshift(updates.ruleText);
    }
  }
  tone.updatedAt = new Date().toISOString();

  // Sincroniza com db.zapiConfig.aiAgent se configurado
  if (db.zapiConfig?.aiAgent) {
    db.zapiConfig.aiAgent.toneSettings = { ...tone };
    const basePrompt = db.zapiConfig.aiAgent.systemPrompt || DEFAULT_AI_CONFIG.systemPrompt;
    db.zapiConfig.aiAgent.systemPrompt = updateSystemPromptTone(basePrompt, tone);
  }

  return tone;
}

/**
 * Persiste uma nova diretriz ensinada pelo desenvolvedor em db.whatsappAiSettings.developerGuidelines
 */
export function saveDeveloperGuideline(db, guidelineData = {}) {
  if (!db) return null;
  if (!db.whatsappAiSettings) {
    db.whatsappAiSettings = { developerGuidelines: [] };
  }
  if (!Array.isArray(db.whatsappAiSettings.developerGuidelines)) {
    db.whatsappAiSettings.developerGuidelines = [];
  }

  const rawText = String(guidelineData.text || guidelineData.rule || "").trim();
  const cat = guidelineData.category || inferFaqCategory(rawText) || "geral";
  const isStructuredCategory = ["always_do", "never_do", "persona_treatment", "factual"].includes(cat);
  const isPreFormulated = guidelineData.synthesized ||
    isStructuredCategory ||
    guidelineData.source === "admin_panel" ||
    guidelineData.source === "operator_response" ||
    guidelineData.source === "faq_approval" ||
    Boolean(guidelineData.question) ||
    /^(?:sempre|nunca|jamais|é\s+poss[ií]vel|o\s+hor[aá]rio|todos\s+os|dispomos|aceitamos|n[aã]o\s+[eé]\s+permitid|n[aã]o\s+dispomos|fornecemos|a\s+voltagem|chame|trate)/i.test(rawText);
  const synthesizedText = isPreFormulated
    ? rawText
    : synthesizeGuidelineFromText(rawText, cat);
  const sample = guidelineData.sample || guidelineData.sampleResponse || generateSampleGuestResponse({
    category: cat,
    ruleText: synthesizedText,
    targetFlat: guidelineData.targetFlat || null
  });

  // Se id fornecido, atualiza diretriz existente
  if (guidelineData.id) {
    const existingIndex = db.whatsappAiSettings.developerGuidelines.findIndex(g => g.id === guidelineData.id);
    if (existingIndex >= 0) {
      const existing = db.whatsappAiSettings.developerGuidelines[existingIndex];
      const updated = {
        ...existing,
        text: synthesizedText,
        rule: synthesizedText,
        category: cat,
        targetFlat: guidelineData.targetFlat !== undefined ? guidelineData.targetFlat : existing.targetFlat,
        sample,
        sampleResponse: sample,
        question: guidelineData.question !== undefined ? guidelineData.question : existing.question,
        operatorText: guidelineData.operatorText !== undefined ? guidelineData.operatorText : existing.operatorText,
        active: guidelineData.active !== undefined ? Boolean(guidelineData.active) : (guidelineData.enabled !== undefined ? Boolean(guidelineData.enabled) : existing.active),
        enabled: guidelineData.enabled !== undefined ? Boolean(guidelineData.enabled) : (guidelineData.active !== undefined ? Boolean(guidelineData.active) : existing.active),
        updatedAt: new Date().toISOString(),
        source: guidelineData.source || existing.source
      };
      db.whatsappAiSettings.developerGuidelines[existingIndex] = updated;
      return updated;
    }
  }

  // Deduplicação inteligente para evitar diretrizes repetidas para a mesma pergunta ou fato
  const matchIndex = db.whatsappAiSettings.developerGuidelines.findIndex(g => {
    if (guidelineData.question && g.question && g.question.trim().toLowerCase() === guidelineData.question.trim().toLowerCase()) return true;
    if (g.text && g.text.trim().toLowerCase() === synthesizedText.trim().toLowerCase()) return true;
    return false;
  });
  if (matchIndex >= 0) {
    const existing = db.whatsappAiSettings.developerGuidelines[matchIndex];
    const isAct = guidelineData.active !== undefined ? Boolean(guidelineData.active) : (guidelineData.enabled !== undefined ? Boolean(guidelineData.enabled) : true);
    const updated = {
      ...existing,
      text: synthesizedText,
      rule: synthesizedText,
      category: cat,
      sample,
      sampleResponse: sample,
      question: guidelineData.question || existing.question,
      operatorText: guidelineData.operatorText || existing.operatorText,
      active: isAct,
      enabled: isAct,
      updatedAt: new Date().toISOString()
    };
    db.whatsappAiSettings.developerGuidelines[matchIndex] = updated;
    return updated;
  }

  const isActiveInit = guidelineData.active !== undefined ? Boolean(guidelineData.active) : (guidelineData.enabled !== undefined ? Boolean(guidelineData.enabled) : true);
  const newGuideline = {
    id: guidelineData.id || `guideline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: synthesizedText,
    rule: synthesizedText,
    category: cat,
    targetFlat: guidelineData.targetFlat || null,
    sample,
    sampleResponse: sample,
    question: guidelineData.question || null,
    operatorText: guidelineData.operatorText || null,
    active: isActiveInit,
    enabled: isActiveInit,
    createdAt: guidelineData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: guidelineData.source || "whatsapp_developer"
  };

  db.whatsappAiSettings.developerGuidelines.unshift(newGuideline);
  return newGuideline;
}

/**
 * Formata confirmação cordial ao desenvolvedor com resumo e amostra no novo tom
 */
export function formatDeveloperToneConfirmation({ toneUpdates = {}, tone = {}, db = null }) {
  const intro = "Entendido perfeitamente, Miller! ⚙️ Diretriz de estilo atualizada no sistema.";

  const summaryItems = [];
  if (tone.conciseness === "compact") {
    summaryItems.push("• *Concisão:* Respostas curtas e objetivas (1 a 3 frases), ideais para WhatsApp.");
  } else if (tone.conciseness === "detailed") {
    summaryItems.push("• *Concisão:* Respostas detalhadas e completas.");
  }
  if (tone.emojiUsage === "none") {
    summaryItems.push("• *Emojis:* Desativados (respostas sem emojis).");
  } else if (tone.emojiUsage === "minimal") {
    summaryItems.push("• *Emojis:* Uso mínimo (no máximo 1 emoji pontual).");
  } else if (tone.emojiUsage === "expressive") {
    summaryItems.push("• *Emojis:* Uso expressivo e caloroso.");
  }
  if (tone.formality === "executive") {
    summaryItems.push("• *Formalidade:* Tom executivo e formal.");
  } else if (tone.formality === "casual") {
    summaryItems.push("• *Formalidade:* Tom descontraído e amigável.");
  }
  if (summaryItems.length === 0 && toneUpdates.ruleText) {
    summaryItems.push(`• *Estilo:* ${toneUpdates.ruleText}`);
  }

  let sample = "";
  if (tone.conciseness === "compact" && tone.emojiUsage === "none") {
    sample = "Olá! Nosso check-in inicia às 14h. Se o flat for liberado antes pela governança, avisamos você imediatamente.";
  } else if (tone.conciseness === "compact") {
    sample = "Olá! Nosso check-in inicia às 14h. Se o flat for liberado antes pela governança, avisamos você imediatamente! 🔑";
  } else if (tone.emojiUsage === "none") {
    sample = "Olá! Nosso check-in inicia às 14h e o check-out é até às 12h. Para reservas diretas, oferecemos early check-in a partir das 10h mediante disponibilidade de higienização.";
  } else if (tone.formality === "executive") {
    sample = "Prezado hóspede, informamos que o procedimento de check-in inicia-se a partir das 14h00. Permanecemos à inteira disposição para qualquer solicitação adicional.";
  } else if (tone.formality === "casual") {
    sample = "Oi! Tudo bem? Nosso check-in começa a partir das 14h, mas se o seu apê ficar pronto antes a gente te dá um toque por aqui! 😊";
  } else {
    sample = "Olá! Nosso check-in inicia às 14h. Se o seu flat estiver pronto antes pela equipe de governança, avisaremos você na hora! 🔑✨";
  }

  return `${intro}\n\n${summaryItems.join("\n")}\n\n👉 *Amostra imediata no novo tom calibrado:*\n"${sample}"\n\nA nova calibração já está em vigor para todas as conversas com hóspedes! 🚀`;
}

/**
 * Formata confirmação cordial ao desenvolvedor para aprendizado de regra factual
 */
export function formatDeveloperCoachingConfirmation({ newGuideline, sampleResponse = null, db = null }) {
  const intro = "Entendido perfeitamente, Miller! 📚 Nova diretriz assimilada na base de conhecimento oficial da Sofia.";
  const details = [
    `• *Regra aprendida:* ${newGuideline.text}`,
    `• *Categoria:* ${newGuideline.category}${newGuideline.targetFlat ? ` (Flat ${newGuideline.targetFlat})` : ""}`,
    `• *Status:* Ativa com prioridade máxima`
  ];

  const sample = sampleResponse || newGuideline.sampleResponse || newGuideline.sample || generateSampleGuestResponse({
    category: newGuideline.category,
    ruleText: newGuideline.text,
    targetFlat: newGuideline.targetFlat
  });

  return `${intro}\n\n${details.join("\n")}\n\n👉 *Como responderei aos hóspedes:*\n"${sample}"\n\nA diretriz já está ativa e valendo para todos os atendimentos! 🚀`;
}

/**
 * Monta os blocos dinâmicos de instruções de tom e diretrizes para o Gemini (Estilo WhatsApp Business AI)
 */
export function buildDynamicSystemInstruction(aiConfig, dbOrContext, contextOrDb) {
  const isSecondArgDb = Boolean(
    dbOrContext && (dbOrContext.whatsappAiSettings !== undefined || dbOrContext.zapiConfig !== undefined || dbOrContext.reservations !== undefined || dbOrContext.flats !== undefined)
  );
  const db = isSecondArgDb ? dbOrContext : (contextOrDb || dbOrContext);
  const guestContext = isSecondArgDb ? contextOrDb : dbOrContext;

  const toneSettings = db?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const activeGuidelines = (db?.whatsappAiSettings?.developerGuidelines || [])
    .filter(g => g && g.active !== false && g.enabled !== false);

  let toneSection = "";
  if (toneSettings) {
    const rules = [];
    if (toneSettings.conciseness === "compact") {
      rules.push("SEJA EXTREMAMENTE CONCISA: Responda de forma curta, direta e objetiva (idealmente de 1 a 3 frases). Evite textos longos.");
    } else if (toneSettings.conciseness === "detailed") {
      rules.push("Seja detalhada e forneça explicações completas.");
    }
    if (toneSettings.emojiUsage === "none") {
      rules.push("NÃO USE EMOJIS: Responda sem nenhum emoji.");
    } else if (toneSettings.emojiUsage === "minimal") {
      rules.push("USE EMOJIS COM MODERAÇÃO MÍNIMA: No máximo 1 emoji pontual.");
    }
    if (toneSettings.formality === "executive") {
      rules.push("TOM EXECUTIVO: Adote tom formal, corporativo e polido.");
    } else if (toneSettings.formality === "casual") {
      rules.push("TOM CASUAL: Adote tom descontraído, amigável e caloroso.");
    }
    if (Array.isArray(toneSettings.customRules)) {
      rules.push(...toneSettings.customRules);
    }
    if (rules.length > 0) {
      toneSection = `\n[DIRETRIZES DE ESTILO & CALIBRAÇÃO DE TOM EM VIGOR]\n${rules.map(r => `• ${r}`).join("\n")}\n`;
    }
  }

  let guidelinesSection = "";
  const antiCopyPasteRule = `\n[REGRA ANTI-COPIA-E-COLA & GERAÇÃO MULTITÓPICO CONTEXTUAL]\n- NUNCA use respostas prontas, engessadas ou cópia-e-cola de mensagens anteriores.\n- Use os fatos e diretrizes aprendidos como base de conhecimento vivo para sintetizar uma resposta inédita, humanizada e personalizada ao contexto do hóspede.\n- Se o hóspede enviar saudações (ex: "bom dia", "boa tarde", "olá"), retribua a saudação cordialmente pelo nome do hóspede.\n- Se a mensagem contiver múltiplas dúvidas juntas (ex: horário de checkout + se pode estender a reserva pelo WhatsApp), responda a TODOS os pontos de forma clara, acolhedora e integrada na mesma mensagem.\n`;

  if (activeGuidelines.length > 0) {
    const alwaysDo = activeGuidelines.filter(g => g.category === "always_do");
    const neverDo = activeGuidelines.filter(g => g.category === "never_do");
    const personaTreatment = activeGuidelines.filter(g => g.category === "persona_treatment");
    const factual = activeGuidelines.filter(g => !["always_do", "never_do", "persona_treatment"].includes(g.category));

    const blocks = [];
    if (alwaysDo.length > 0) {
      blocks.push(`[✅ SEMPRE FAZER (OBRIGATÓRIO EM TODA RESPOSTA)]\n${alwaysDo.map(g => `• ${g.text || g.rule}`).join("\n")}`);
    }
    if (neverDo.length > 0) {
      blocks.push(`[🚫 NUNCA FAZER (PROIBIÇÃO ESTRITA)]\n${neverDo.map(g => `• ${g.text || g.rule}`).join("\n")}`);
    }
    if (personaTreatment.length > 0) {
      blocks.push(`[🎩 TRATAMENTO & POSTURA COM O CLIENTE]\n${personaTreatment.map(g => `• ${g.text || g.rule}`).join("\n")}`);
    }
    if (factual.length > 0) {
      blocks.push(`[📌 REGRAS DE NEGÓCIO & DIRETRIZES APRENDIDAS]\n${factual.map(g => `• [${g.category || "geral"}${g.targetFlat ? ` | Flat ${g.targetFlat}` : ""}] ${g.text || g.rule}`).join("\n")}`);
    }

    guidelinesSection = `\n[DIRETRIZES DO DESENVOLVEDOR & REGRAS APRENDIDAS (PRIORIDADE MÁXIMA)]\nAs seguintes instruções foram ensinadas pelo gestor/desenvolvedor e POSSUEM PRIORIDADE ABSOLUTA sobre regras gerais anteriores:\n${blocks.join("\n\n")}\n${antiCopyPasteRule}`;
  } else {
    guidelinesSection = antiCopyPasteRule;
  }

  let flatsCatalogSection = "";
  const activeFlats = (db?.flats || []).filter(f => f.isActive !== false);
  if (activeFlats.length > 0) {
    const flatsDesc = activeFlats.map(f => {
      const info = getFlatAmenitiesInfo(f);
      return `• Flat ${f.number}: Cama: ${info.bedLabel} | Ar: ${info.airConditionerLabel} | Micro-ondas: ${info.hasMicrowave ? "Sim" : "Não"}${info.tags.length ? ` | Tags: [${info.tags.join(", ")}]` : ""}${f.notes ? ` | Obs: ${f.notes}` : ""}`;
    }).join("\n");
    flatsCatalogSection = `\n[CATÁLOGO DE FLATS, TAGS E PARTICULARIDADES DOS QUARTOS (CORPFLATS)]\n${flatsDesc}\n- Sofia tem conhecimento pleno das particularidades de cada flat (ar split vs janela, micro-ondas, cama de casal vs solteiro) para responder com precisão ao hóspede ou filtrar flats ideais.\n`;
  }

  return { toneSection, guidelinesSection, flatsCatalogSection };
}

/**
 * Ajusta a resposta para respeitar a calibração de tom e diretrizes de tratamento (ex: Sr. / Sra.)
 */
export function applyToneFormatting(text, toneSettingsOrDb, db = null, guestContext = null) {
  if (!text) return text;
  let result = text;

  const isSecondArgDb = Boolean(
    toneSettingsOrDb &&
    typeof toneSettingsOrDb === "object" &&
    (toneSettingsOrDb.whatsappAiSettings !== undefined || toneSettingsOrDb.zapiConfig !== undefined || toneSettingsOrDb.reservations !== undefined)
  );
  const resolvedDb = isSecondArgDb ? toneSettingsOrDb : (db || (typeof globalThis !== "undefined" ? globalThis.db : null));
  const resolvedGuestContext = isSecondArgDb ? (db || guestContext) : guestContext;
  const toneSettings = isSecondArgDb ? (resolvedDb?.whatsappAiSettings?.toneSettings || null) : toneSettingsOrDb;

  const activeDb = resolvedDb;
  const activeGuidelines = (activeDb?.whatsappAiSettings?.developerGuidelines || [])
    .filter(g => g && g.active !== false && g.enabled !== false);

  // 0. Diretrizes de Tratamento / Vocativo ("Sempre chame por Sr. ou Sra.")
  const requiresSrSra = activeGuidelines.some(g =>
    /\b(?:chame|trate|dirija-se|sempre\s+chame|sempre\s+trate).*?\b(?:sr\.?|sra\.?|senhor|senhora)\b/i.test(String(g.text || g.rule || "")) ||
    ((g.category === "persona_treatment" || g.category === "always_do") && /\b(?:sr\.?|sra\.?|senhor|senhora)\b/i.test(String(g.text || g.rule || "")))
  );

  if (requiresSrSra && !/\b(?:Sr\.|Sra\.|Sr\(a\)\.)/i.test(result)) {
    const rawFirstName = (resolvedGuestContext?.guestName || "").trim().split(/\s+/)[0] || "";
    const inferHonorific = (firstName) => {
      if (!firstName) return "Sr(a).";
      const clean = firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (["luca", "joshua", "nikita", "mustafa", "akira", "birajara", "ubirajara"].includes(clean)) return "Sr.";
      if (clean.endsWith("a") || ["beatriz", "raquel", "ester", "rute", "iris", "ines", "lais", "thais", "liz", "alice", "clarice", "elenice", "simone", "ivone", "solange", "monique", "jacqueline", "caroline", "aline", "elaine", "viviane", "tatiane", "cristiane", "ariane", "daiane", "ingrid", "astrid", "edith", "judith"].includes(clean)) {
        return "Sra.";
      }
      return "Sr.";
    };

    if (rawFirstName) {
      const honorific = inferHonorific(rawFirstName);
      const escapedName = rawFirstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nameSalutationRegex = new RegExp(`(Olá|Oi|Bom dia|Boa tarde|Boa noite|Perfeito|Com certeza|Ótima notícia|Dados recebidos com sucesso|Entendido),\\s*(?!Sr\\.|Sra\\.|Sr\\(a\\)\\.)(${escapedName})`, "i");
      if (nameSalutationRegex.test(result)) {
        result = result.replace(nameSalutationRegex, `$1, ${honorific} $2`);
      } else {
        result = result.replace(/^(Olá|Oi|Bom dia|Boa tarde|Boa noite)!/i, `$1, ${honorific} ${rawFirstName}!`);
      }
    } else {
      result = result.replace(/^(Olá|Oi|Bom dia|Boa tarde|Boa noite),\s*([A-ZÀ-Ú][a-zà-ú]+)!/, (_, greet, detectedName) => {
        const hon = inferHonorific(detectedName);
        return `${greet}, ${hon} ${detectedName}!`;
      });
      if (!/\b(?:Sr\.|Sra\.|Sr\(a\)\.)/i.test(result)) {
        result = result.replace(/^(Olá|Oi|Bom dia|Boa tarde|Boa noite)!/i, "$1, Sr(a).!");
      }
    }
  }

  if (!toneSettings) return result;

  // 1. Concisão: compact
  if (toneSettings.conciseness === "compact") {
    const paragraphs = result.split(/\n\n+/).filter(Boolean);
    if (paragraphs.length > 1) {
      result = paragraphs[0];
    }
  }

  // 2. Formalidade: executive
  if (toneSettings.formality === "executive") {
    result = result
      .replace(/^Olá,?\s*[^!]*!\s*/i, "Prezado(a) hóspede, informamos que ")
      .replace(/^Oi,?\s*[^!]*!\s*/i, "Prezado(a) hóspede, informamos que ");
  }

  // 3. Emojis: none ou minimal
  if (toneSettings.emojiUsage === "none") {
    result = result.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, "").replace(/\s{2,}/g, " ").trim();
  } else if (toneSettings.emojiUsage === "minimal") {
    const emojis = result.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu);
    if (emojis && emojis.length > 1) {
      let count = 0;
      result = result.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, (match) => {
        count++;
        return count === 1 ? match : "";
      }).replace(/\s{2,}/g, " ").trim();
    }
  }

  return result;
}

/**
 * Formata data no formato brasileiro DD/MM/AAAA
 */
export function formatBrDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return dateStr || "";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Detecta se a mensagem é uma consulta de disponibilidade de quartos/vagas de hospedagem
 */
export function isAvailabilityInquiry(text = "") {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().trim();
  const mentionsGarage = /\b(?:garagem|estacionamento|carro|ve[ií]culo|placa)\b/i.test(lower);
  if (mentionsGarage) return false;

  return (
    /\b(?:disponibilidade|dispon[ií]vel|vagas?|quarto\s+vago|tem\s+vaga)\b/i.test(lower) ||
    /\b(?:tem|teria|h[aá]|possuem)\s+(?:algum\s+)?(?:quarto|flat|apartamento|vaga)\b/i.test(lower)
  );
}

/**
 * Detecta se a mensagem é uma solicitação ou intenção explícita de realizar/fazer uma reserva
 * (ex: "reserva pra mim por favor", "quero reservar", "faz uma reserva", "reservar agora", "como faço pra reservar?")
 */
export function isReservationBookingRequest(text = "") {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().trim();
  const norm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Se contiver pergunta explícita de preço / quanto custa / qual o valor, prioriza cotação
  if (/\b(?:quanto\s+(?:custa|fica|sai|t[aá]|[eé])|qual\s+(?:o\s+)?(?:valor|pre[cç]o|tarifa)|tabela\s+de\s+(?:pre[cç]os?|valores))\b/i.test(norm)) {
    return false;
  }

  // Não confundir com cancelamento, alteração ou consulta de reserva existente
  if (/\b(?:cancelar|cancelamento|cancele|desistir|alterar|mudar|trocar|adiar|remarcar)\b/i.test(norm)) return false;
  if (/(?:minhas?\s+reservas?|minha\s+estadia|status\s+da\s+reserva|reserva\s+confirmada|estou\s+hospedado)/i.test(norm)) return false;

  return (
    /\b(?:por\s+favor\s*,?\s*)?(?:reserva|reservar|reserve)\s*(?:a[ií]|l[aá])?\s*(?:pra|para|pro|por)\s*(?:mim|n[oó]s|(?:a\s+)?gente)\b/i.test(norm) ||
    /\b(?:por\s+favor\s*,?\s*)?(?:reserva|reservar|reserve)\s+(?:por\s+favor|pfv?|pvr|a[ií]|l[aá])\b/i.test(norm) ||
    (/\b(?:por\s+favor\s*,?\s+)?(?:reserva|reservar|reserve)\b/i.test(norm) && /^(?:por\s+favor\s*,?\s*)?(?:reserva|reservar|reserve)[.!]?$/i.test(norm)) ||
    /\b(?:como\s+(?:fa[cç]o|fazer)\s+(?:para|pra)\s+reservar|como\s+reservar|como\s+(?:fa[cç]o|fazer)\s+a\s+reserva)\b/i.test(norm) ||
    /\b(?:quero|desejo|gostaria\s+de|preciso|pode|consegue|faz|fazer|efetuar|fechar|confirmar|realizar|garantir)\s+(?:uma\s+|a\s+|minha\s+)?reserva(?:\s+(?:pra|para|pro)\s+(?:mim|n[oó]s|(?:a\s+)?gente))?\b/i.test(norm) ||
    /\b(?:quero|desejo|gostaria\s+de|preciso|vamos)\s+(?:reservar|fechar|alugar)(?:\s+(?:um\s+)?(?:flat|quarto|estadia|apto|\d+\s+di[aá]rias?|\d+\s+noites?|agora|hoje))?\b/i.test(norm) ||
    /\b(?:faz|fazer|fa[cç]a|pode\s+fazer|faria|fecha|fechar|feche|pode\s+fechar)\s+(?:a\s+|uma\s+|minha\s+)?reserva(?:\s+(?:pra|para|pro)\s+(?:mim|n[oó]s|(?:a\s+)?gente))?\b/i.test(norm) ||
    /\b(?:fecha|fechar|feche)\s*(?:a[ií]|l[aá])?\s*(?:pra|para|pro)\s+(?:mim|n[oó]s|(?:a\s+)?gente)\b/i.test(norm) ||
    /\b(?:reserva\s+a[ií]|reserva\s+l[aá]|vamos\s+reservar|vamos\s+fechar|fechar\s+(?:a\s+)?reserva)\b/i.test(norm) ||
    /\b(?:pode\s+reservar|pode\s+fechar|prosseguir\s+com\s+a\s+reserva|dar\s+andamento\s+na\s+reserva)\b/i.test(norm) ||
    /^(?:por\s+favor\s*,?\s*)?(?:reserva|reservar|reserve|fechar|feche)[.!]?$/i.test(norm)
  );
}

/**
 * Verifica se a tabela de preços/cotação já foi enviada recentemente para este contato
 */
export function hasRecentlySentPricingQuote(history = []) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const recentMessages = history.slice(-6);
  return recentMessages.some(m => {
    if (!m || !m.fromMe || !m.text) return false;
    const t = String(m.text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Não confundir confirmação de disponibilidade de datas específicas ou pré-reserva gerada com o banner genérico de tarifas
    if (
      t.includes("verifiquei a disponibilidade para as datas informadas") ||
      t.includes("orcamento total para o periodo") ||
      t.includes("resumo da pre-reserva") ||
      t.includes("pix copia e cola")
    ) {
      return false;
    }

    // 1. Padrões textuais do banner oficial
    if (
      t.includes("no canal direto da corpflats") ||
      t.includes("diarias para flats executivos") ||
      (t.includes("qual periodo voce pretende se hospedar") && (t.includes("datas de entrada") || t.includes("datas"))) ||
      (t.includes("sem cafe") && t.includes("com cafe da manha"))
    ) {
      return true;
    }

    // 2. Detecção semântica ampla de mensagem contendo tarifas e valores de diárias
    const mentionsRates = /\b(?:r\$\s*237|r\$\s*272|r\$\s*307|r\$\s*\d{2,3}(?:,\d{2})?)\b/i.test(t);
    const mentionsDiarias = /\b(?:di[aá]rias?|sem\s+caf[eé]|com\s+caf[eé]|taxa.*limpeza)\b/i.test(t);
    const asksDatesOrPeriod = /\b(?:qual\s+per[ií]odo|quais\s+datas|datas?\s+de\s+entrada|quantas\s+pessoas)\b/i.test(t);

    if (mentionsRates && (mentionsDiarias || asksDatesOrPeriod)) {
      return true;
    }

    return false;
  });
}

/**
 * Obtém a última mensagem enviada pelo bot (fromMe === true)
 */
export function getLastBotMessage(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg && msg.fromMe && msg.text && typeof msg.text === "string" && msg.text.trim()) {
      return msg;
    }
  }
  return null;
}

/**
 * Avalia se duas mensagens são substancialmente idênticas (para proteção anti-repetição / anti-loop)
 */
export function areMessagesSubstantiallyIdentical(textA, textB) {
  if (!textA || !textB) return false;
  const cleanA = String(textA).trim();
  const cleanB = String(textB).trim();
  if (cleanA === cleanB) return true;

  const normalizeForComparison = (str) => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const normA = normalizeForComparison(cleanA);
  const normB = normalizeForComparison(cleanB);

  if (normA === normB) return true;

  // Se qualquer uma for resultado de cálculo/disponibilidade/pré-reserva do PMS e o texto normalizado for diferente
  // (mudou data, flat, hóspedes, plano ou valor total), NÃO são mensagens idênticas!
  const isPmsResultA = /resumo da pre reserva|orcamento total para o periodo|verifiquei a disponibilidade para as datas informadas|ocupadas nesse periodo/i.test(normA);
  const isPmsResultB = /resumo da pre reserva|orcamento total para o periodo|verifiquei a disponibilidade para as datas informadas|ocupadas nesse periodo/i.test(normB);
  if (isPmsResultA || isPmsResultB) {
    return false;
  }

  // Se ambas forem mensagens de cotação com a tabela de diárias
  const isQuoteA = hasRecentlySentPricingQuote([{ fromMe: true, text: textA }]) ||
                   (/no canal direto da corpflats|nossas diarias para flats executivos|qual periodo voce pretende se hospedar/i.test(normA) &&
                   /(?:sem cafe|com cafe|taxa.*limpeza)/i.test(normA));
  const isQuoteB = hasRecentlySentPricingQuote([{ fromMe: true, text: textB }]) ||
                   (/no canal direto da corpflats|nossas diarias para flats executivos|qual periodo voce pretende se hospedar/i.test(normB) &&
                   /(?:sem cafe|com cafe|taxa.*limpeza)/i.test(normB));
  if (isQuoteA && isQuoteB) return true;
  if (isQuoteA !== isQuoteB) return false;

  // Se ambas forem mensagens perguntando por datas e pessoas para reserva, verifica se o estado reconhecido é o mesmo
  const isAskDatesA = !isQuoteA && /datas?\s+(?:de\s+)?entrada/i.test(normA) && (/quantas\s+pessoas/i.test(normA) || /saida/i.test(normA));
  const isAskDatesB = !isQuoteB && /datas?\s+(?:de\s+)?entrada/i.test(normB) && (/quantas\s+pessoas/i.test(normB) || /saida/i.test(normB));
  if (isAskDatesA && isAskDatesB) {
    const ackGuestsA = (normA.match(/anotei\s+para\s+\d+\s+pessoa/) || [""])[0];
    const ackGuestsB = (normB.match(/anotei\s+para\s+\d+\s+pessoa/) || [""])[0];
    const ackCafeA = /excelente escolha|opcao com cafe|opcao sem cafe/.test(normA);
    const ackCafeB = /excelente escolha|opcao com cafe|opcao sem cafe/.test(normB);
    if (ackGuestsA === ackGuestsB && ackCafeA === ackCafeB) {
      return true;
    }
    return false;
  }

  // Comparação de similaridade (Jaccard similarity de palavras relevantes)
  const wordsA = new Set(normA.split(" ").filter(w => w.length > 3));
  const wordsB = new Set(normB.split(" ").filter(w => w.length > 3));
  if (wordsA.size > 6 && wordsB.size > 6) {
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    if (union > 0 && (intersection / union) >= 0.82) return true;
  }

  // Se um contém o outro e a diferença de tamanho for menor que 18%
  if (normA.length > 30 && normB.length > 30) {
    if ((normA.includes(normB) || normB.includes(normA)) &&
        Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length) >= 0.82) {
      return true;
    }
  }

  return false;
}

const PT_MONTH_MAP = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12
};

const PT_WEEKDAY_MAP = {
  domingo: 0,
  segunda: 1, "segunda-feira": 1,
  terca: 2, "terca-feira": 2,
  quarta: 3, "quarta-feira": 3,
  quinta: 4, "quinta-feira": 4,
  sexta: 5, "sexta-feira": 5,
  sabado: 6
};

function getTodayBrasiliaIso() {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

function resolveParsedDateRange(inDay, inMonth, inYearRaw, outDay, outMonthRaw, outYearRaw, referenceDateStr = null) {
  const refStr = referenceDateStr || getTodayBrasiliaIso();
  const [refY, refM, refD] = refStr.split("-").map(Number);
  const refDateUtc = new Date(Date.UTC(refY || 2026, (refM || 1) - 1, refD || 1, 12, 0, 0));

  const normYear = (y) => {
    if (!y) return null;
    const n = Number(y);
    if (isNaN(n)) return null;
    return n < 100 ? 2000 + n : n;
  };

  const dIn = Number(inDay);
  const mIn = Number(inMonth);
  const dOut = Number(outDay);
  let mOut = Number(outMonthRaw || mIn);

  if (!dIn || !mIn || !dOut || !mOut || mIn < 1 || mIn > 12 || mOut < 1 || mOut > 12 || dIn < 1 || dIn > 31 || dOut < 1 || dOut > 31) {
    return null;
  }

  let yIn = normYear(inYearRaw) || normYear(outYearRaw) || refY || 2026;
  let start = new Date(Date.UTC(yIn, mIn - 1, dIn, 12, 0, 0));
  if (start.getUTCMonth() !== mIn - 1 || start.getUTCDate() !== dIn) return null;

  if (!inYearRaw && !outYearRaw && (refDateUtc.getTime() - start.getTime()) > 3 * 86400000) {
    yIn += 1;
    start = new Date(Date.UTC(yIn, mIn - 1, dIn, 12, 0, 0));
    if (start.getUTCMonth() !== mIn - 1 || start.getUTCDate() !== dIn) return null;
  }

  let yOut = normYear(outYearRaw) || yIn;
  if (!outMonthRaw && dOut < dIn) {
    mOut = mIn === 12 ? 1 : mIn + 1;
  }
  if (!outYearRaw && (mOut < mIn || (mOut === mIn && dOut <= dIn))) {
    yOut = yIn + 1;
  }

  const end = new Date(Date.UTC(yOut, mOut - 1, dOut, 12, 0, 0));
  if (end.getUTCMonth() !== mOut - 1 || end.getUTCDate() !== dOut) return null;
  if (end <= start) return null;

  const nights = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (nights < 1 || nights > 90) return null;

  const checkIn = start.toISOString().slice(0, 10);
  const checkOut = end.toISOString().slice(0, 10);
  const displayCheckIn = `${String(dIn).padStart(2, "0")}/${String(mIn).padStart(2, "0")}`;
  const displayCheckOut = `${String(dOut).padStart(2, "0")}/${String(mOut).padStart(2, "0")}`;

  return {
    checkIn,
    checkOut,
    nights,
    displayCheckIn,
    displayCheckOut
  };
}

/**
 * Extrai intervalo real de datas de check-in e check-out a partir de texto natural em português
 */
export function parseNaturalDatesFromText(text = "", referenceDateStr = null) {
  if (!text || typeof text !== "string") return null;
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // 1. Formato ISO: YYYY-MM-DD a YYYY-MM-DD
  const isoMatch = norm.match(/\b(20\d{2})-(\d{2})-(\d{2})\s*(?:a|ate|ao|\-|e(?:\s+saida)?)\s*(20\d{2})-(\d{2})-(\d{2})\b/i);
  if (isoMatch) {
    const res = resolveParsedDateRange(isoMatch[3], isoMatch[2], isoMatch[1], isoMatch[6], isoMatch[5], isoMatch[4], referenceDateStr);
    if (res) return res;
  }

  // 2. Formato DD/MM[/YYYY] a DD/MM[/YYYY] (incluindo "check-in: 10/11, check-out: 15/11", "chego 10/11 e saio dia 15/11")
  const slashRange = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|ate|ao|\-|,|;|\be\b|(?:[,;]?\s*(?:e\s+)?(?:saida|saindo|saio|check-?out)\s*:?\s*(?:em|no\s+dia|o\s+dia|dia)?))\s*(?:o\s+dia\s+|no\s+dia\s+|dia\s+|em\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  if (slashRange) {
    const res = resolveParsedDateRange(slashRange[1], slashRange[2], slashRange[3], slashRange[4], slashRange[5], slashRange[6], referenceDateStr);
    if (res) return res;
  }

  // 3. Formato "de DD a DD/MM[/YYYY]" ou "do dia DD ao dia DD/MM"
  const dayToSlash = norm.match(/\b(?:de|do\s+dia|dia|entre|chego\s+dia|entrada\s+dia)\s+(\d{1,2})\s*(?:a|ate|ao|\-|e(?:\s+(?:saida|saio|saindo))?(?:\s+dia)?)\s*(?:o\s+dia\s+|no\s+dia\s+|dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  if (dayToSlash) {
    const res = resolveParsedDateRange(dayToSlash[1], dayToSlash[3], dayToSlash[4], dayToSlash[2], dayToSlash[3], dayToSlash[4], referenceDateStr);
    if (res) return res;
  }

  // 4. Formato com nome do mês: "do dia 10 ao dia 15 de novembro", "chego dia 10 e saio dia 15 de novembro"
  const monthRange = norm.match(/\b(?:de\s+|do\s+dia\s+|dia\s+)?(\d{1,2})(?:\s+de\s+([a-z]{3,9}))?\s*(?:a|ate|ao|\-|,?\s*(?:e\s+)?(?:saida|saio|saindo|check-?out)?(?:\s+no\s+dia|\s+dia)?)\s*(?:o\s+dia\s+|no\s+dia\s+|dia\s+)?(\d{1,2})\s+de\s+([a-z]{3,9})(?:\s+de\s+(\d{4}))?\b/i);
  if (monthRange) {
    const outM = PT_MONTH_MAP[monthRange[4]];
    const inM = monthRange[2] ? PT_MONTH_MAP[monthRange[2]] : outM;
    if (inM && outM) {
      const res = resolveParsedDateRange(monthRange[1], inM, monthRange[5], monthRange[3], outM, monthRange[5], referenceDateStr);
      if (res) return res;
    }
  }

  // 5. Data inicial + número de diárias/noites: "10/11 por 3 diárias" ou "10 de novembro por 2 noites"
  const slashPlusNights = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b.*?\b(\d{1,2})\s*(?:diarias?|noites?)\b/i);
  if (slashPlusNights) {
    const dIn = Number(slashPlusNights[1]);
    const mIn = Number(slashPlusNights[2]);
    const nightsCount = Number(slashPlusNights[4]);
    const refStr = referenceDateStr || getTodayBrasiliaIso();
    const [refY] = refStr.split("-").map(Number);
    const yIn = slashPlusNights[3] ? (Number(slashPlusNights[3]) < 100 ? 2000 + Number(slashPlusNights[3]) : Number(slashPlusNights[3])) : (refY || 2026);
    const start = new Date(Date.UTC(yIn, mIn - 1, dIn, 12, 0, 0));
    if (!isNaN(start.getTime()) && nightsCount >= 1 && nightsCount <= 90) {
      const end = new Date(start.getTime() + nightsCount * 86400000);
      return resolveParsedDateRange(dIn, mIn, yIn, end.getUTCDate(), end.getUTCMonth() + 1, end.getUTCFullYear(), referenceDateStr);
    }
  }

  const monthPlusNights = norm.match(/\b(\d{1,2})\s+de\s+([a-z]{3,9})(?:\s+de\s+(\d{4}))?\b.*?\b(\d{1,2})\s*(?:diarias?|noites?)\b/i);
  if (monthPlusNights && PT_MONTH_MAP[monthPlusNights[2]]) {
    const dIn = Number(monthPlusNights[1]);
    const mIn = PT_MONTH_MAP[monthPlusNights[2]];
    const nightsCount = Number(monthPlusNights[4]);
    const refStr = referenceDateStr || getTodayBrasiliaIso();
    const [refY] = refStr.split("-").map(Number);
    const yIn = monthPlusNights[3] ? Number(monthPlusNights[3]) : (refY || 2026);
    const start = new Date(Date.UTC(yIn, mIn - 1, dIn, 12, 0, 0));
    if (!isNaN(start.getTime()) && nightsCount >= 1 && nightsCount <= 90) {
      const end = new Date(start.getTime() + nightsCount * 86400000);
      return resolveParsedDateRange(dIn, mIn, yIn, end.getUTCDate(), end.getUTCMonth() + 1, end.getUTCFullYear(), referenceDateStr);
    }
  }

  // 6. Intervalo de dias da semana ("de sexta a domingo", "segunda até quarta", "sexta por 2 diárias")
  const weekdayRangeMatch = norm.match(/\b(?:de|da|na|para|nesta|nessa|proxima|proximo)?\s*(domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\s*(?:a|ate|ao|\-|e\s+(?:saida|saio)(?:\s+no|\s+na)?)\s*(?:o\s+|a\s+|no\s+|na\s+)?(domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\b/i);
  if (weekdayRangeMatch) {
    const inDow = PT_WEEKDAY_MAP[weekdayRangeMatch[1]];
    const outDow = PT_WEEKDAY_MAP[weekdayRangeMatch[2]];
    if (inDow !== undefined && outDow !== undefined) {
      const refStr = referenceDateStr || getTodayBrasiliaIso();
      const [refY, refM, refD] = refStr.split("-").map(Number);
      const baseUtc = new Date(Date.UTC(refY || 2026, (refM || 1) - 1, refD || 1, 12, 0, 0));
      const refDow = baseUtc.getUTCDay();
      let daysUntilIn = (inDow - refDow + 7) % 7;
      if (daysUntilIn === 0 && /\bproxim[ao]\b/i.test(norm)) daysUntilIn = 7;
      let nightsCount = (outDow - inDow + 7) % 7;
      if (nightsCount === 0) nightsCount = 7;
      const start = new Date(baseUtc.getTime() + daysUntilIn * 86400000);
      const end = new Date(start.getTime() + nightsCount * 86400000);
      return resolveParsedDateRange(
        start.getUTCDate(), start.getUTCMonth() + 1, start.getUTCFullYear(),
        end.getUTCDate(), end.getUTCMonth() + 1, end.getUTCFullYear(),
        referenceDateStr
      );
    }
  }

  const weekdayPlusNights = norm.match(/\b(domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\b.*?\b(\d{1,2})\s*(?:diarias?|noites?)\b/i);
  if (weekdayPlusNights) {
    const inDow = PT_WEEKDAY_MAP[weekdayPlusNights[1]];
    const nightsCount = Math.max(1, Number(weekdayPlusNights[2]));
    if (inDow !== undefined && nightsCount <= 90) {
      const refStr = referenceDateStr || getTodayBrasiliaIso();
      const [refY, refM, refD] = refStr.split("-").map(Number);
      const baseUtc = new Date(Date.UTC(refY || 2026, (refM || 1) - 1, refD || 1, 12, 0, 0));
      const refDow = baseUtc.getUTCDay();
      let daysUntilIn = (inDow - refDow + 7) % 7;
      if (daysUntilIn === 0 && /\bproxim[ao]\b/i.test(norm)) daysUntilIn = 7;
      const start = new Date(baseUtc.getTime() + daysUntilIn * 86400000);
      const end = new Date(start.getTime() + nightsCount * 86400000);
      return resolveParsedDateRange(
        start.getUTCDate(), start.getUTCMonth() + 1, start.getUTCFullYear(),
        end.getUTCDate(), end.getUTCMonth() + 1, end.getUTCFullYear(),
        referenceDateStr
      );
    }
  }

  if (/\b(?:fim|final)\s+de\s+semana\b/i.test(norm)) {
    const refStr = referenceDateStr || getTodayBrasiliaIso();
    const [refY, refM, refD] = refStr.split("-").map(Number);
    const baseUtc = new Date(Date.UTC(refY || 2026, (refM || 1) - 1, refD || 1, 12, 0, 0));
    const refDow = baseUtc.getUTCDay();
    const isNextWeekend = /\bproxim[ao]\s+(?:fim|final)\s+de\s+semana\b/i.test(norm);
    let daysUntilStart = refDow === 6 && !isNextWeekend ? 0 : (5 - refDow + 7) % 7;
    if (isNextWeekend && daysUntilStart < 3) daysUntilStart += 7;
    const defaultNights = (refDow === 6 && !isNextWeekend) ? 1 : 2;
    const nightsMatch = norm.match(/\b(\d{1,2})\s*(?:diarias?|noites?)\b/i);
    const nightsCount = nightsMatch ? Math.max(1, Number(nightsMatch[1])) : defaultNights;
    const start = new Date(baseUtc.getTime() + daysUntilStart * 86400000);
    const end = new Date(start.getTime() + nightsCount * 86400000);
    return resolveParsedDateRange(
      start.getUTCDate(), start.getUTCMonth() + 1, start.getUTCFullYear(),
      end.getUTCDate(), end.getUTCMonth() + 1, end.getUTCFullYear(),
      referenceDateStr
    );
  }

  // 7. Datas relativas ("hoje até amanhã", "amanhã por 2 diárias", "de hoje até depois de amanhã", "para amanhã", "para hoje")
  if (/\b(?:hoje|amanha)\b/i.test(norm)) {
    const refStr = referenceDateStr || getTodayBrasiliaIso();
    const [refY, refM, refD] = refStr.split("-").map(Number);
    const baseUtc = new Date(Date.UTC(refY || 2026, (refM || 1) - 1, refD || 1, 12, 0, 0));
    const hasHoje = /\bhoje\b/i.test(norm) && !/\bhoje\s+em\s+dia\b/i.test(norm);
    const hasDepoisDeAmanha = /\bdepois\s+de\s+amanha\b/i.test(norm);
    const normWithoutDepois = norm.replace(/\bdepois\s+de\s+amanha\b/gi, "");
    const hasAmanha = /\bamanha\b/i.test(normWithoutDepois);
    const nightsMatch = norm.match(/\b(\d{1,2})\s*(?:diarias?|noites?)\b/i);

    let startOffsetDays = null;
    let nightsCount = nightsMatch ? Math.max(1, Number(nightsMatch[1])) : 1;

    if (hasHoje && hasDepoisDeAmanha) {
      startOffsetDays = 0;
      if (!nightsMatch) nightsCount = 2;
    } else if (hasHoje && hasAmanha) {
      startOffsetDays = 0;
      if (!nightsMatch) nightsCount = 1;
    } else if (hasAmanha && hasDepoisDeAmanha) {
      startOffsetDays = 1;
      if (!nightsMatch) nightsCount = 1;
    } else if (hasAmanha) {
      startOffsetDays = 1;
    } else if (hasDepoisDeAmanha) {
      startOffsetDays = 2;
    } else if (hasHoje && /\b(?:para\s+hoje|reservar\s+hoje|reserva\s+hoje|vaga\s+(?:para\s+)?hoje|entrada\s+hoje|check-?in\s+hoje|\d+\s*(?:diarias?|noites?))\b/i.test(norm)) {
      startOffsetDays = 0;
    }

    if (startOffsetDays !== null) {
      const start = new Date(baseUtc.getTime() + startOffsetDays * 86400000);
      const end = new Date(start.getTime() + nightsCount * 86400000);
      return resolveParsedDateRange(
        start.getUTCDate(), start.getUTCMonth() + 1, start.getUTCFullYear(),
        end.getUTCDate(), end.getUTCMonth() + 1, end.getUTCFullYear(),
        referenceDateStr
      );
    }
  }

  return null;
}

function extractGuestsFromSingleText(text = "") {
  if (!text || typeof text !== "string") return null;
  const norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:3|tres)\s*(?:pessoas?|hospedes?|adultos?)\b/i.test(norm)) return 3;
  if (/\b(?:2|duas|dois)\s*(?:pessoas?|hospedes?|adultos?)\b|\bcasal\b/i.test(norm)) return 2;
  if (/\b(?:1|uma|um)\s*(?:pessoa|hospede|adulto)\b|\bindividual\b|\bsolteir[ao]\b|\bsozinho\b|\bsozinha\b/i.test(norm)) return 1;
  const numMatch = norm.match(/\b([4-9])\s*(?:pessoas?|hospedes?|adultos?)\b/i);
  if (numMatch) return Number(numMatch[1]);
  return null;
}

function extractBreakfastFromSingleText(text = "") {
  if (!text || typeof text !== "string") return null;
  const norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:sem\s+cafe|so\s+o\s+quarto|somente\s+quarto|apenas\s+quarto)\b/i.test(norm)) return "without_breakfast";
  if (/\b(?:com\s+cafe|incluso\s+cafe|incluindo\s+cafe|cafe\s+incluso)\b/i.test(norm)) return "with_breakfast";
  return null;
}

function isAffirmativeBookingReply(text = "") {
  return /^(?:sim|quero|pode\s*(?:ser|fazer|fechar|confirmar|gerar|reservar)?|confirma(?:r)?|fechado|combinado|perfeito|ok\s*,?\s*pode|por\s+favor|isso(?:\s+mesmo)?|vamos\s+fechar)(?:\s*,?\s*(?:com\s+caf[eé]|sem\s+caf[eé]|por\s+favor|pode\s*(?:gerar|fazer|fechar|reservar)))?[.!?\s]*$/i.test(
    String(text || "").trim()
  );
}

/**
 * Constrói o estado acumulado da conversa multi-turn (datas, hóspedes, plano de café, comodidades e pré-reserva ativa)
 */
export function extractConversationState(messageText = "", history = [], guestContext = {}, db = null) {
  const effectiveHistory = (history && Array.isArray(history) && history.length > 0)
    ? history
    : (guestContext?.history && Array.isArray(guestContext.history) && guestContext.history.length > 0
        ? guestContext.history
        : ((db?.whatsappConversations || []).find(c => {
            const p = cleanWhatsAppPhone(c.phone);
            const target = cleanWhatsAppPhone(guestContext?.phone);
            return p && target && (p.endsWith(target.slice(-8)) || target.endsWith(p.slice(-8)));
          })?.messages || []));

  const refDateStr = guestContext?.todayStr || getTodayBrasiliaIso();
  const recentHistory = effectiveHistory.slice(-10);

  // Evita duplicar a mensagem atual se já estiver no fim do histórico
  const lastItem = recentHistory[recentHistory.length - 1];
  const historyWithoutCurrent = (lastItem && !lastItem.fromMe && String(lastItem.text || "").trim() === String(messageText || "").trim())
    ? recentHistory.slice(0, -1)
    : recentHistory;

  const userTurns = [
    ...historyWithoutCurrent.filter(m => m && !m.fromMe && m.text).map(m => String(m.text)),
    ...(messageText ? [String(messageText)] : [])
  ];

  // Procura pré-reserva ativa existente para o telefone do hóspede
  const cleanPhone = cleanWhatsAppPhone(guestContext?.phone || "");
  const nowMs = Date.now();
  const activePreReservation = (db?.reservations || []).find(r => {
    if (r.status !== "pre_reserva") return false;
    if (r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
    const rPhone = cleanWhatsAppPhone(r.guestPhone || r.phone || "");
    if (!cleanPhone || !rPhone || (!rPhone.endsWith(cleanPhone.slice(-8)) && !cleanPhone.endsWith(rPhone.slice(-8)))) return false;
    return true;
  }) || null;

  let parsedDates = null;
  let guests = activePreReservation?.guestsCount ? Number(activePreReservation.guestsCount) : 1;
  let guestsExplicit = Boolean(activePreReservation?.guestsCount);
  let breakfastPreference = activePreReservation?.ratePlan === "with_breakfast"
    ? "with_breakfast"
    : (activePreReservation?.ratePlan === "room_only" ? "without_breakfast" : null);
  let preferredFlatNumber = null;
  const amenityPreferences = {};
  let priorUserWantedToBook = Boolean(activePreReservation);

  if (activePreReservation?.checkinDate && activePreReservation?.checkoutDate) {
    parsedDates = parseNaturalDatesFromText(`${activePreReservation.checkinDate} a ${activePreReservation.checkoutDate}`, refDateStr);
  }

  const dateQuoteAlreadyPresented = historyWithoutCurrent.some(m =>
    m && m.fromMe && m.text && (
      /ger(?:e|ar)\s+(?:a\s+)?(?:sua\s+)?pr[eé]-reserva/i.test(m.text) ||
      /deseja\s+que\s+eu\s+j[aá]\s+gere/i.test(m.text) ||
      /garantir\s+(?:o\s+flat|a\s+unidade)/i.test(m.text) ||
      /resumo\s+da\s+pr[eé]-reserva/i.test(m.text)
    )
  );

  for (const uText of historyWithoutCurrent.filter(m => m && !m.fromMe && m.text).map(m => String(m.text))) {
    if (isReservationBookingRequest(uText) || (dateQuoteAlreadyPresented && isAffirmativeBookingReply(uText))) {
      priorUserWantedToBook = true;
    }
  }

  for (const uText of userTurns) {
    const d = parseNaturalDatesFromText(uText, refDateStr);
    if (d) parsedDates = d;

    const g = extractGuestsFromSingleText(uText);
    if (g != null) {
      guests = g;
      guestsExplicit = true;
    }

    const bf = extractBreakfastFromSingleText(uText);
    if (bf) {
      breakfastPreference = bf;
    }

    const flatMatch = uText.match(/\b(?:flat|quarto|apto|apartamento|uh)\s*(\d{3,4})\b/i);
    if (flatMatch) {
      preferredFlatNumber = flatMatch[1];
    }

    if (/\bsplit\b/i.test(uText)) amenityPreferences.split = true;
    if (/\b(?:cama\s+de\s+casal|cama\s+casal|cama\s+inteira)\b/i.test(uText)) amenityPreferences.bedType = "casal";
    if (/\b(?:duas\s+camas|2\s+camas|solteiro)\b/i.test(uText)) amenityPreferences.bedType = "solteiro";
    if (/\bmicro[- ]?ondas\b/i.test(uText)) amenityPreferences.hasMicrowave = true;
  }

  const currentDates = parseNaturalDatesFromText(messageText, refDateStr);
  const currentGuests = extractGuestsFromSingleText(messageText);
  const currentBreakfast = extractBreakfastFromSingleText(messageText);
  const currentMessageIsBooking = isReservationBookingRequest(messageText);

  const lastBotMsg = getLastBotMessage(historyWithoutCurrent);
  const pricingAlreadyPresented = hasRecentlySentPricingQuote(historyWithoutCurrent);
  const isAffirmativeConfirmation = isAffirmativeBookingReply(messageText);

  const wantsToBook = Boolean(
    currentMessageIsBooking ||
    priorUserWantedToBook ||
    (dateQuoteAlreadyPresented && (isAffirmativeConfirmation || Boolean(currentBreakfast)))
  );

  const lastBotAskedDates = Boolean(lastBotMsg && (
    /datas?\s+(?:de\s+)?(?:entrada|check-?in)/i.test(lastBotMsg.text) ||
    /qual\s+per[ií]odo/i.test(lastBotMsg.text) ||
    /quantas\s+pessoas/i.test(lastBotMsg.text) ||
    /prosseguir\s+com\s+a\s+sua\s+reserva/i.test(lastBotMsg.text) ||
    /outras\s+datas\s+pr[oó]ximas/i.test(lastBotMsg.text)
  ));

  const askedForDatesCount = historyWithoutCurrent.filter(m =>
    m && m.fromMe && m.text && !hasRecentlySentPricingQuote([m]) &&
    (/datas?\s+(?:de\s+)?(?:entrada|check-?in)/i.test(m.text) || /per[ií]odo\s+desejado/i.test(m.text))
  ).length;

  const ratePlan = breakfastPreference === "with_breakfast" ? "with_breakfast" : "room_only";

  return {
    hasDates: Boolean(parsedDates),
    currentMessageHasDates: Boolean(currentDates),
    checkIn: parsedDates?.checkIn || null,
    checkOut: parsedDates?.checkOut || null,
    nights: parsedDates?.nights || 0,
    displayCheckIn: parsedDates?.displayCheckIn || null,
    displayCheckOut: parsedDates?.displayCheckOut || null,
    guests,
    guestsExplicit,
    currentMessageHasGuests: currentGuests != null,
    breakfastPreference,
    currentMessageHasBreakfast: currentBreakfast != null,
    ratePlan,
    preferredFlatNumber,
    amenityPreferences,
    wantsToBook,
    currentMessageIsBooking,
    priorUserWantedToBook,
    pricingAlreadyPresented,
    dateQuoteAlreadyPresented,
    lastBotAskedDates,
    askedForDatesCount,
    activePreReservation
  };
}

/**
 * Orquestrador Conversacional Integrado às Ferramentas do PMS:
 * Executa em tempo real checkAvailability, calculateQuote e createPreReservation (com PIX)
 * conforme o estado acumulado da conversa multi-turn.
 */
export function executeConversationalBookingStep({
  messageText = "",
  history = [],
  guestContext = {},
  db = null,
  aiConfig = DEFAULT_AI_CONFIG
}) {
  const convState = extractConversationState(messageText, history, guestContext, db);
  const name = guestContext?.guestName ? `, ${guestContext.guestName.split(" ")[0].trim()}` : "";
  const toneSettings = db?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings, db, guestContext);

  const botSettings = getBotActionsSettings(db);
  const canAutoReserve = botSettings.apiActionsEnabled !== false && (
    botSettings.allowedActions.createPreReservation !== false ||
    botSettings.allowedActions.commitReservation !== false
  );
  const canCheckAvailability = botSettings.apiActionsEnabled !== false && botSettings.allowedActions.checkAvailability !== false;
  const canCalculateQuote = botSettings.apiActionsEnabled !== false && botSettings.allowedActions.calculateQuote !== false;

  // 1. Se ações automáticas de reserva estão desativadas e o usuário quer reservar
  if (!canAutoReserve && (convState.wantsToBook || convState.currentMessageIsBooking)) {
    if (convState.hasDates) {
      return {
        handled: true,
        action: "handover_disabled_with_dates",
        requiresHandover: true,
        convState,
        replyText: ret(`Olá${name}! Perfeito, anotei sua solicitação de reserva para as datas informadas (*${convState.displayCheckIn} a ${convState.displayCheckOut}*)! 🏨✨ No momento, a realização de novas reservas diretas está sendo concluída pela nossa equipe da recepção. Já registrei seus dados e um atendente continuará o seu atendimento por aqui em instantes para confirmar sua estadia! 🛎️`)
      };
    }
    return {
      handled: true,
      action: "handover_disabled_no_dates",
      requiresHandover: true,
      convState,
      replyText: ret(`Olá${name}! Com certeza podemos providenciar a sua reserva! 🏨✨ No momento, a realização de novas reservas diretas está sendo concluída pela nossa equipe da recepção. Já registrei seu interesse e um atendente continuará o seu atendimento por aqui em instantes! Para adiantarmos, você poderia me informar as datas desejadas de entrada e saída e quantas pessoas serão? 🛎️`)
    };
  }

  // 2. Se já possuímos datas válidas (na mensagem atual ou acumuladas do histórico da conversa)
  if (convState.hasDates && db) {
    const avail = canCheckAvailability
      ? handleCheckAvailability(db, {
          checkIn: convState.checkIn,
          checkOut: convState.checkOut,
          guests: convState.guests
        })
      : { success: false, available: false, flats: [] };

    // Se o próprio hóspede já possui uma pré-reserva ativa segurando um flat,
    // garante que o flat reservado para ele próprio conste como disponível caso não haja conflito com OUTRA reserva!
    if (convState.activePreReservation && Array.isArray(db?.flats)) {
      const heldFlatObj = db.flats.find(f =>
        String(f.id) === String(convState.activePreReservation.flatId) ||
        String(f.number) === String(convState.activePreReservation.flatNumber)
      );
      if (heldFlatObj && Array.isArray(avail.flats)) {
        const alreadyInList = avail.flats.some(f => String(f.id) === String(heldFlatObj.id) || String(f.number) === String(heldFlatObj.number));
        if (!alreadyInList) {
          const nowCheckMs = Date.now();
          const hasOtherConflict = (db.reservations || []).some(r => {
            if (r.id === convState.activePreReservation.id) return false;
            if (!["confirmada", "checkin", "pre_reserva"].includes(r.status)) return false;
            if (isReservationCheckoutCompleted(r, db)) return false;
            if (r.status === "pre_reserva" && r.expiresAt && new Date(r.expiresAt).getTime() < nowCheckMs && r.paymentStatus !== "pago_total") return false;
            const sameFlat = (r.flatId && String(r.flatId) === String(heldFlatObj.id)) ||
                             (r.flatNumber && String(r.flatNumber) === String(heldFlatObj.number));
            if (!sameFlat) return false;
            return (convState.checkIn < r.checkoutDate && convState.checkOut > r.checkinDate);
          });
          if (!hasOtherConflict) {
            avail.flats.unshift({
              ...getFlatAmenitiesInfo(heldFlatObj),
              baseRate: Number(db?.tariffSettings?.baseDailyRate || 237),
              maxGuests: 2
            });
            avail.available = true;
            avail.totalAvailable = avail.flats.length;
          }
        }
      }
    }

    if (canCheckAvailability && avail.success && (!avail.available || avail.flats.length === 0)) {
      return {
        handled: true,
        action: "no_availability",
        requiresHandover: false,
        convState,
        availability: avail,
        replyText: ret(`Olá${name}! Verifiquei agora em nosso sistema para as datas informadas (*${convState.displayCheckIn} a ${convState.displayCheckOut}*, para *${convState.guests} ${convState.guests === 1 ? "pessoa" : "pessoas"}*) e, no momento, todas as nossas unidades estão ocupadas nesse período. 😔\n\nVocê teria flexibilidade para consultar outras datas próximas? Se desejar, basta me informar outro período que verifico imediatamente! 🏨✨`)
      };
    }

    if (avail.available && avail.flats.length > 0) {
      // Seleciona o flat ideal de acordo com a preferência do hóspede, comodidades ou Fair-Share (flat da vez)
      let selectedFlat = avail.flats[0];
      if (convState.preferredFlatNumber) {
        const matchByNum = avail.flats.find(f => String(f.number) === String(convState.preferredFlatNumber) || String(f.id) === String(convState.preferredFlatNumber));
        if (matchByNum) selectedFlat = matchByNum;
      } else if (Object.keys(convState.amenityPreferences).length > 0) {
        const matchByAmenity = avail.flats.find(f => {
          if (convState.amenityPreferences.split && f.airConditionerType !== "split") return false;
          if (convState.amenityPreferences.bedType && f.bedType !== convState.amenityPreferences.bedType) return false;
          if (convState.amenityPreferences.hasMicrowave && !f.hasMicrowave) return false;
          return true;
        });
        if (matchByAmenity) selectedFlat = matchByAmenity;
      } else {
        const fairShare = selectFairShareFlat(db, convState.checkIn, convState.checkOut, convState.activePreReservation?.id || null);
        if (fairShare && fairShare.recommendedFlat) {
          const matchFair = avail.flats.find(f =>
            String(f.number) === String(fairShare.recommendedFlat.number) ||
            String(f.id) === String(fairShare.recommendedFlat.id)
          );
          if (matchFair) selectedFlat = matchFair;
        }
      }

      const quoteChosen = canCalculateQuote
        ? handleCalculateQuote(db, {
            checkIn: convState.checkIn,
            checkOut: convState.checkOut,
            guests: convState.guests,
            flatId: selectedFlat.id,
            channel: "direct",
            ratePlan: convState.ratePlan
          })
        : null;

      const quoteRoomOnly = canCalculateQuote
        ? handleCalculateQuote(db, {
            checkIn: convState.checkIn,
            checkOut: convState.checkOut,
            guests: convState.guests,
            flatId: selectedFlat.id,
            channel: "direct",
            ratePlan: "room_only"
          })
        : null;

      const quoteWithBf = canCalculateQuote
        ? handleCalculateQuote(db, {
            checkIn: convState.checkIn,
            checkOut: convState.checkOut,
            guests: convState.guests,
            flatId: selectedFlat.id,
            channel: "direct",
            ratePlan: "with_breakfast"
          })
        : null;

      // 2.A: Hóspede solicitou/confirmou a reserva -> Cria ou atualiza a Pré-Reserva real no PMS com PIX!
      if (convState.wantsToBook && canAutoReserve && botSettings.allowedActions.createPreReservation !== false) {
        let preRes = null;
        const effectiveTotal = quoteChosen?.total || quoteRoomOnly?.total || (237 * convState.nights);

        if (convState.activePreReservation) {
          // Atualiza pré-reserva ativa se o hóspede ajustou datas, plano, número de hóspedes ou flat preferido
          const existing = convState.activePreReservation;
          existing.checkinDate = convState.checkIn;
          existing.checkoutDate = convState.checkOut;
          if (selectedFlat && (convState.preferredFlatNumber || String(existing.flatId) !== String(selectedFlat.id))) {
            existing.flatId = selectedFlat.id;
            existing.flatNumber = String(selectedFlat.number);
          }
          existing.guestsCount = convState.guests;
          existing.ratePlan = convState.ratePlan;
          existing.totalAmount = effectiveTotal;
          const cleanTxId = String(existing.code || "CF000").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
          existing.pixCopiaECola = generateStaticPixPayload({
            pixKey: db?.settings?.interConfig?.pixKey || "47964813000165",
            amount: effectiveTotal,
            merchantName: "CORPFLATS LTDA",
            merchantCity: "CAMPOS DOS GOYTACAZES",
            txid: cleanTxId
          });
          preRes = {
            success: true,
            reservationId: existing.id,
            code: existing.code,
            flatId: existing.flatId,
            flatNumber: existing.flatNumber,
            checkIn: existing.checkinDate,
            checkOut: existing.checkoutDate,
            guestName: existing.guestName,
            total: existing.totalAmount,
            status: existing.status,
            expiresAt: existing.expiresAt,
            pixCopiaECola: existing.pixCopiaECola,
            holdMinutes: botSettings.preReservationHoldMinutes || 30
          };
        } else {
          preRes = createPreReservationSync(db, {
            flatId: selectedFlat.id,
            checkIn: convState.checkIn,
            checkOut: convState.checkOut,
            guestName: guestContext?.guestName || "Hóspede WhatsApp",
            guestPhone: guestContext?.phone || "",
            guests: convState.guests,
            ratePlan: convState.ratePlan,
            channel: "whatsapp",
            total: effectiveTotal
          });
        }

        if (preRes && preRes.success) {
          const planLabel = convState.ratePlan === "with_breakfast"
            ? "Com café da manhã no quarto (isenção de taxa de limpeza)"
            : `Sem café${quoteChosen?.cleaningFee ? ` (inclui R$ ${quoteChosen.cleaningFee},00 de taxa única de limpeza)` : ""}`;
          const totalFormatted = Number(preRes.total || effectiveTotal).toFixed(2).replace(".", ",");

          return {
            handled: true,
            action: "pre_reservation_created",
            requiresHandover: false,
            convState,
            availability: avail,
            quote: quoteChosen,
            preReservation: preRes,
            replyText: ret(
              `Perfeito${name}! Verifiquei a disponibilidade para as datas informadas (*${convState.displayCheckIn} a ${convState.displayCheckOut}* — *${convState.nights} ${convState.nights === 1 ? "diária" : "diárias"}*) e já gerei a sua pré-reserva no sistema! 🏨✨\n\n` +
              `📋 *Resumo da Pré-Reserva:*\n` +
              `• *Código:* ${preRes.code}\n` +
              `• *Unidade:* Flat ${preRes.flatNumber}\n` +
              `• *Período:* ${convState.displayCheckIn} a ${convState.displayCheckOut} (${convState.nights} ${convState.nights === 1 ? "noite" : "noites"})\n` +
              `• *Hóspedes:* ${convState.guests} ${convState.guests === 1 ? "pessoa" : "pessoas"}\n` +
              `• *Plano:* ${planLabel}\n` +
              `• *Valor Total:* *R$ ${totalFormatted}*\n\n` +
              `⏳ A unidade fica reservada para você por *${preRes.holdMinutes || 30} minutos*. Para confirmar definitivamente, basta realizar o pagamento via *PIX Copia e Cola* abaixo:\n\n` +
              `\`${preRes.pixCopiaECola}\`\n\n` +
              `Caso prefira alterar entre a opção com ou sem café da manhã no quarto, é só me avisar por aqui! 🥐☕`
            )
          };
        }
      }

      // 2.B: Hóspede informou datas para consulta de disponibilidade / orçamento (sem ter pedido fechamento ainda)
      const flatNumbersList = [...avail.flats]
        .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
        .map(f => f.number)
        .join(", ");
      const totalRoomOnlyStr = Number(quoteRoomOnly?.total || (237 * convState.nights + 70)).toFixed(2).replace(".", ",");
      const totalWithBfStr = Number(quoteWithBf?.total || ((237 + 35) * convState.nights)).toFixed(2).replace(".", ",");
      const cleaningStr = Number(quoteRoomOnly?.cleaningFee ?? 70).toFixed(2).replace(".", ",");

      return {
        handled: true,
        action: "availability_and_quote_presented",
        requiresHandover: false,
        convState,
        availability: avail,
        quote: quoteChosen || quoteRoomOnly,
        replyText: ret(
          `Perfeito${name}! Verifiquei a disponibilidade para as datas informadas (*${convState.displayCheckIn} a ${convState.displayCheckOut}* — *${convState.nights} ${convState.nights === 1 ? "diária" : "diárias"}* para *${convState.guests} ${convState.guests === 1 ? "pessoa" : "pessoas"}*) e temos unidades disponíveis no Soho Residence (*Flats ${flatNumbersList}*)! 🏨✨\n\n` +
          `💰 *Orçamento total para o período:*\n` +
          `• *Opção sem café:* *R$ ${totalRoomOnlyStr}* (já incluindo a taxa única de limpeza de R$ ${cleaningStr})\n` +
          `• *Opção com café da manhã no quarto:* *R$ ${totalWithBfStr}* (com *isenção total da taxa de limpeza*!) 🥐☕\n\n` +
          `Deseja que eu já gere a sua pré-reserva com o código PIX para garantir o flat? Basta me confirmar se prefere com ou sem café da manhã!`
        )
      };
    }

    // Fallback caso não haja flats cadastrados no db de teste
    return {
      handled: true,
      action: "dates_acknowledged",
      requiresHandover: false,
      convState,
      replyText: ret(`Perfeito${name}! Anotei sua solicitação de reserva para as datas informadas (*${convState.displayCheckIn} a ${convState.displayCheckOut}*) 🏨✨. Já estou verificando a disponibilidade dos nossos flats no Soho Residence para você! Caso queira com ou sem café da manhã no quarto, me avise por aqui! 🥐☕`)
    };
  }

  // 3. Ainda não temos as datas de check-in e check-out: reconhece o que já sabemos da conversa e pede apenas o que falta!
  if (convState.breakfastPreference && convState.guestsExplicit) {
    const guestDesc = convState.guests === 2 ? "para 2 pessoas (casal)" : `para ${convState.guests} ${convState.guests === 1 ? "pessoa" : "pessoas"}`;
    if (convState.breakfastPreference === "with_breakfast") {
      return {
        handled: true,
        action: "ask_dates_known_guests_and_breakfast",
        requiresHandover: false,
        convState,
        replyText: ret(`Excelente escolha${name}! Anotei ${guestDesc} na opção com café da manhã no quarto (com isenção da taxa de limpeza) 🥐☕. Para eu consultar a disponibilidade dos flats e gerar a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out)? 🏨✨`)
      };
    }
    return {
      handled: true,
      action: "ask_dates_known_guests_and_breakfast",
      requiresHandover: false,
      convState,
      replyText: ret(`Perfeito${name}! Anotei ${guestDesc} na opção sem café da manhã 🏨✨. Para eu consultar a disponibilidade dos flats e gerar a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out)?`)
    };
  }

  if (convState.currentMessageHasBreakfast || (convState.breakfastPreference && !convState.currentMessageIsBooking)) {
    if (convState.breakfastPreference === "with_breakfast") {
      return {
        handled: true,
        action: "ask_dates_known_breakfast",
        requiresHandover: false,
        convState,
        replyText: ret(`Excelente escolha${name}! A opção com café da manhã inclui a deliciosa bandeja no quarto e isenção da taxa de limpeza 🥐☕. Para eu consultar a disponibilidade dos flats e prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out), e para quantas pessoas será a estadia? 🏨✨`)
      };
    }
    return {
      handled: true,
      action: "ask_dates_known_breakfast",
      requiresHandover: false,
      convState,
      replyText: ret(`Perfeito${name}! Anotei a opção sem café da manhã 🏨✨. Para eu consultar a disponibilidade dos flats e prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out), e para quantas pessoas será a estadia?`)
    };
  }

  if (convState.guestsExplicit) {
    const guestDesc = convState.guests === 2 ? "para 2 pessoas (casal)" : `para ${convState.guests} ${convState.guests === 1 ? "pessoa" : "pessoas"}`;
    return {
      handled: true,
      action: "ask_dates_known_guests",
      requiresHandover: false,
      convState,
      replyText: ret(`Perfeito${name}! Anotei ${guestDesc} 🏨✨. Para eu verificar os flats disponíveis e prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out)?`)
    };
  }

  return {
    handled: true,
    action: "ask_dates_and_guests",
    requiresHandover: false,
    convState,
    replyText: ret(`Com certeza${name}! Para eu prosseguir com a sua reserva, você poderia me informar apenas as datas de entrada (check-in) e saída (check-out), e para quantas pessoas será a estadia? 🏨✨`)
  };
}

/**
 * Proteção Anti-Loop de Mensagens Idênticas (Anti-Repetition Guard)
 * Garante que a Sofia NUNCA envie uma resposta substancialmente idêntica à última resposta enviada
 * para o mesmo contato, refinando a mensagem de acordo com o estado da conversa e as ferramentas do PMS.
 */
export function applyAntiRepetitionGuard({
  candidateText = "",
  history = [],
  queryText = "",
  guestContext = {},
  db = null,
  analysis = null
}) {
  const lastBotMsg = getLastBotMessage(history);
  if (!lastBotMsg) {
    return { wasRepetitive: false, refinedText: candidateText };
  }

  const isDuplicate = areMessagesSubstantiallyIdentical(candidateText, lastBotMsg.text);
  if (!isDuplicate) {
    return { wasRepetitive: false, refinedText: candidateText };
  }

  const name = guestContext?.guestName ? `, ${guestContext.guestName.split(" ")[0].trim()}` : "";
  const toneSettings = db?.whatsappAiSettings?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings);

  const convState = extractConversationState(queryText, history, guestContext, db);
  const queryAnalysis = analysis || analyzeGuestQuery(queryText, guestContext, db);
  const isBooking = convState.wantsToBook || queryAnalysis.type === "RESERVATION_REQUEST" || isReservationBookingRequest(queryText);
  const botSettings = getBotActionsSettings(db);
  const canAutoReserve = botSettings.apiActionsEnabled !== false && (
    botSettings.allowedActions.createPreReservation !== false ||
    botSettings.allowedActions.commitReservation !== false
  );

  const isLastBotQuote = hasRecentlySentPricingQuote([lastBotMsg]);
  const lastBotAskedDates = !isLastBotQuote && Boolean(
    /datas?\s+(?:de\s+)?entrada/i.test(lastBotMsg.text) ||
    /quantas\s+pessoas/i.test(lastBotMsg.text) ||
    /qual\s+per[ií]odo/i.test(lastBotMsg.text) ||
    /prosseguir\s+com\s+a\s+sua\s+reserva/i.test(lastBotMsg.text)
  );

  let resultText = candidateText;

  // Caso 1: Usuário em fluxo de reserva
  if (isBooking) {
    if (!canAutoReserve) {
      if (lastBotMsg.text.includes("realização de novas reservas diretas está sendo concluída") || lastBotMsg.text.includes("equipe da recepção")) {
        resultText = ret(`Olá${name}! Eu já registrei seu pedido de reserva com a nossa recepção! 🛎️ Assim que você puder me enviar as datas de entrada/saída e número de pessoas, isso ajudará nossa equipe a agilizar a sua reserva! ✨`);
      } else {
        resultText = ret(`Olá${name}! Com certeza podemos providenciar a sua reserva! 🏨✨ No momento, a realização de novas reservas diretas está sendo concluída pela nossa equipe da recepção. Já registrei o seu interesse e um atendente continuará o seu atendimento por aqui em instantes! Para adiantarmos, você poderia me informar as datas desejadas de entrada e saída e quantas pessoas serão? 🛎️`);
      }
    } else if (!convState.hasDates) {
      if (lastBotAskedDates) {
        resultText = ret(`Olá${name}! Eu realmente quero te ajudar com a sua reserva! 😊 Só preciso que você me passe o período desejado (dia de entrada e saída) e quantas pessoas serão, pois sem essas informações eu não consigo consultar os flats disponíveis nem emitir a reserva para você! 🏨✨`);
      } else {
        const stepResult = executeConversationalBookingStep({ messageText: queryText, history, guestContext, db });
        resultText = stepResult.replyText;
      }
    } else {
      // Possui datas: executa as ferramentas reais do sistema para avançar a conversa!
      const stepResult = executeConversationalBookingStep({ messageText: queryText, history, guestContext, db });
      resultText = stepResult.replyText;
    }
  } else {
    // Caso 2: Resposta duplicada de cotação / diárias
    const isQuoteCandidate = hasRecentlySentPricingQuote([{ fromMe: true, text: candidateText }]) ||
      /no canal direto da corpflats|nossas diárias para flats executivos|qual período você pretende se hospedar/i.test(candidateText);
    if (isQuoteCandidate) {
      if (convState.hasDates && db) {
        const stepResult = executeConversationalBookingStep({ messageText: queryText, history, guestContext, db });
        resultText = stepResult.replyText;
      } else if (lastBotAskedDates) {
        resultText = ret(`Olá${name}! Como te passei os valores logo acima, me informe as datas de entrada e saída e o número de pessoas para que eu possa verificar a disponibilidade e reservar o flat para você! 🏨✨`);
      } else {
        resultText = ret(`Olá${name}! Como passei os valores das diárias logo acima ✨, para eu verificar a disponibilidade exata dos nossos flats e passarmos para a sua reserva, você poderia me informar as datas de check-in e check-out desejadas e para quantas pessoas será a estadia? 🏨`);
      }
    } else if (/^(?:ok|obrigad[oa]|valeu|show|beleza|perfeito|entendi|combinado|certo|t[aá]\s+bom|blz|agrade[cç]o|sim|n[aã]o|positivo|por\s+favor)[.!?\s]*$/i.test(queryText)) {
      // Caso 3: Confirmações curtas / gentilezas do usuário
      resultText = ret(`Perfeito${name}! Se desejar dar andamento na sua reserva, basta me informar as datas de entrada e saída e para quantas pessoas será a estadia. Qualquer outra dúvida, estou à sua disposição! ✨`);
    } else {
      // Caso 4: Refinamento genérico cordial anti-eco
      resultText = ret(`Olá${name}! Já compartilhei essas orientações com você logo acima ✨. Caso precise de mais algum detalhe específico ou queira dar andamento na sua hospedagem, por favor me avise por aqui! 🏨`);
    }
  }

  // Barreira final: NUNCA retornar uma resposta que ainda seja substancialmente idêntica à anterior
  if (areMessagesSubstantiallyIdentical(resultText, lastBotMsg.text)) {
    resultText = ret(`Olá${name}! Estou à sua disposição para o que precisar. Me avise se deseja fechar a reserva com as suas datas ou tirar mais alguma dúvida! 🏨✨`);
  }

  return {
    wasRepetitive: true,
    refinedText: resultText
  };
}

/**
 * Detecta se a mensagem é uma consulta de cotação, tarifas, diárias ou valores
 */
export function isPricingOrQuoteInquiry(text = "") {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().trim();

  // Se for solicitação explícita de reserva ("reserva pra mim", "quero reservar", etc.), NÃO é cotação de preços pura!
  if (isReservationBookingRequest(text)) {
    return false;
  }

  // Expressões explícitas de cotação / preço / diária / orçamento ou disponibilidade de vagas
  return (
    /\b(?:quanto\s+(?:t[aá]|custa|[eé]|fica|sai)|qual\s+(?:o\s+)?(?:valor|pre[cç]o)|saber\s+(?:o\s+)?(?:valor|pre[cç]o|tarifa))\b/i.test(lower) ||
    /\b(?:pre[cç]o|valor|valores|pre[cç]os|tarifa|tarifas|tabela)\s+(?:de\s+(?:uma\s+)?|da[s]?\s+|do\s+)?(?:di[aá]rias?|flat|quarto|hospedagem|estadia|reserva|per[ií]odo|caf[eé])\b/i.test(lower) ||
    /\b(?:di[aá]rias?|hospedagem|estadia)\s+(?:com\s+caf[eé]|sem\s+caf[eé]|para\s+\d+\s+pesso|para\s+casal|individual|solteiro)\b/i.test(lower) ||
    /\b(?:or[cç]amento|cota[cç][aã]o|cotar)\b/i.test(lower) ||
    /\bdi[aá]rias?\b/i.test(lower) ||
    isAvailabilityInquiry(text)
  );
}

/**
 * Identifica se a FAQ é puramente operacional/logística de café da manhã ou governança sem relação com valores/preços
 */
export function isOperationalNonPricingFaq(faq) {
  if (!faq) return false;
  const id = String(faq.id || "").toLowerCase();
  if (id.includes("faq-cafe-quarto") || id.includes("faq-recolhimento-loucas") || id.includes("faq-loucas")) {
    return true;
  }
  const q = String(faq.question || "").toLowerCase();
  const cat = String(faq.category || "").toLowerCase();
  if ((cat === "cafe" || cat === "cafe_manha" || cat === "cafe_quarto") &&
      !q.includes("valor") && !q.includes("preço") && !q.includes("preco") && !q.includes("quanto") && !q.includes("diária") && !q.includes("diaria")) {
    return true;
  }
  return false;
}

/**
 * Analisador Semântico de Intenção do Hóspede:
 * Opera na classificação precisa entre as DUAS VIAS e suas categorias:
 * - GREETING_ONLY: Saudação pura sem solicitação de informação
 * - PRICING_QUOTE: Consulta de valores, diárias e cotações (VIA 2 - Leitura do Sistema)
 * - EXISTING_RESERVATION: Consulta de reserva existente (VIA 2 - Leitura do Sistema)
 * - FLAT_READY_STATUS: Consulta de status e prontidão do flat (VIA 2 - Leitura do Sistema)
 * - OPERATIONAL_DEMAND: Solicitações operacionais sem acesso autônomo (Gera Demanda Não Atendida)
 * - GENERIC_FAQ: Perguntas institucionais da base/FAQ (VIA 1 - FAQ e Conhecimento)
 * - UNKNOWN_INQUIRY: Dúvida não mapeada (Gera Demanda e FAQ pendente)
 */
export function analyzeGuestQuery(rawText = "", guestContext = null, db = null) {
  const text = String(rawText || "").trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const hist = (guestContext?.history && Array.isArray(guestContext.history))
    ? guestContext.history
    : ((db?.whatsappConversations || []).find(c => {
        const p = cleanWhatsAppPhone(c.phone);
        const target = cleanWhatsAppPhone(guestContext?.phone);
        return p && target && (p.endsWith(target.slice(-8)) || target.endsWith(p.slice(-8)));
      })?.messages || []);

  const convState = extractConversationState(text, hist, guestContext || {}, db);

  // Se a Sofia acabou de apresentar o orçamento de datas específicas e perguntou se pode gerar a pré-reserva,
  // confirmações curtas ("sim", "quero", "pode fazer", "com café", etc.) são solicitações de reserva!
  if (convState.hasDates && convState.dateQuoteAlreadyPresented && convState.wantsToBook && isAffirmativeBookingReply(text)) {
    return {
      type: "RESERVATION_REQUEST",
      primaryTopic: "solicitacao_reserva",
      rawText: text,
      hasDates: true,
      mentionsGuests: convState.guestsExplicit
    };
  }

  // 1. Saudação Pura
  const GREETING_WORDS = "(?:oi|ola|opa|ei|hello|hi|bom\\s+dia|boa\\s+tarde|boa\\s+noite)";
  const COURTESY_WORDS = "(?:tudo\\s+bem|tudo\\s+bom|como\\s+vai|como\\s+esta|beleza|tudo\\s+certo)";
  const NAME_WORDS = "(?:sofia|corpflats|atendente|recepcao)";
  const isGreetingOnly =
    new RegExp(`^(?:(?:${GREETING_WORDS}|${COURTESY_WORDS}|${NAME_WORDS})\\s*[,.]?\\s*)+[!?\\s]*$`, "i").test(lower) ||
    /^(?:ok|obrigad[oa]|valeu|show|beleza|perfeito|entendi|combinado|certo|t[aá]\s+bom|blz|agrade[cç]o|sim|n[aã]o|positivo)[.!?\s]*$/i.test(text);

  if (isGreetingOnly) {
    return {
      type: "GREETING_ONLY",
      primaryTopic: "saudacao",
      rawText: text
    };
  }

  // 1.5 Solicitação de Nova Reserva / Intenção de Reservar (Booking Request)
  if (isReservationBookingRequest(text)) {
    return {
      type: "RESERVATION_REQUEST",
      primaryTopic: "solicitacao_reserva",
      rawText: text,
      hasDates: convState.hasDates,
      mentionsGuests: convState.guestsExplicit
    };
  }

  // 1.6 Resposta com Datas, Hóspedes ou Preferências em Fluxo de Reserva
  const lastBot = getLastBotMessage(hist);
  const quoteRecentlySent = hasRecentlySentPricingQuote(hist);
  const botAskedDates = Boolean(lastBot && (
    /datas?\s+(?:de\s+)?entrada/i.test(lastBot.text) ||
    /qual\s+per[ií]odo/i.test(lastBot.text) ||
    /quantas\s+pessoas/i.test(lastBot.text) ||
    /verifico\s+a\s+disponibilidade/i.test(lastBot.text) ||
    /prosseguir\s+com\s+a\s+sua\s+reserva/i.test(lastBot.text) ||
    /ger(?:e|ar)\s+(?:a\s+)?(?:sua\s+)?pr[eé]-reserva/i.test(lastBot.text) ||
    /resumo\s+da\s+pr[eé]-reserva/i.test(lastBot.text) ||
    /pix\s+copia\s+e\s+cola/i.test(lastBot.text) ||
    /outras\s+datas\s+pr[oó]ximas/i.test(lastBot.text) ||
    /outro\s+per[ií]odo\s+que\s+verifico/i.test(lastBot.text) ||
    quoteRecentlySent
  ));

  const hasDateIndicator = convState.currentMessageHasDates ||
                           /\b\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?|\s+de\s+[a-zç]+)\b/i.test(lower) ||
                           /\b(?:hoje|amanh[aã]|fim\s+de\s+semana|final\s+de\s+semana|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/i.test(lower);
  const mentionsGuests = convState.currentMessageHasGuests ||
                         /\b(?:\d+|um|uma|dois|duas|tr[eê]s)\s+(?:pessoas?|h[oó]spedes?|adultos?)|casal|individual|solteir[ao]\b/i.test(lower);
  const mentionsBreakfastChoice = /^(?:quero\s+|vou\s+querer\s+|prefiro\s+|pode\s+ser\s+|troca(?:r)?\s+para\s+|muda(?:r)?\s+para\s+|altera(?:r)?\s+para\s+)?(?:com|sem)\s+caf[eé](?:\s+da\s+manh[aã])?(?:\s+no\s+quarto)?(?:\s+por\s+favor)?[.!?\s]*$/i.test(lower) ||
                                  /\b(?:com|sem)\s+caf[eé]\s+da\s+manh[aã]\b/i.test(lower);
  const mentionsFlatPreference = (!guestContext?.reservation || guestContext.reservation.status === "pre_reserva") &&
                                 /\b(?:quero|prefiro|pode\s+ser|escolho|reservar?)\s+(?:o\s+)?(?:flat|quarto|apto|apartamento|uh)\s*\d{3,4}\b/i.test(lower);

  if (botAskedDates || quoteRecentlySent || convState.wantsToBook || convState.activePreReservation) {
    if (hasDateIndicator && (convState.currentMessageHasDates || mentionsGuests || /\b(?:dia|dias|de|a|at[eé]|chegada|sa[ií]da|check[- ]?in|check[- ]?out)\b/i.test(lower))) {
      return {
        type: "RESERVATION_REQUEST",
        primaryTopic: "solicitacao_reserva",
        rawText: text,
        hasDates: true,
        mentionsGuests
      };
    }
    if (mentionsBreakfastChoice && !isPricingOrQuoteInquiry(text)) {
      return {
        type: "RESERVATION_REQUEST",
        primaryTopic: "solicitacao_reserva",
        rawText: text,
        hasDates: convState.hasDates,
        breakfastChoice: /com\s+caf/i.test(lower) ? "com_cafe" : "sem_cafe"
      };
    }
    if (mentionsGuests && !hasDateIndicator && !isPricingOrQuoteInquiry(text) && !/wifi|garagem|check-?in|check-?out/i.test(lower)) {
      return {
        type: "RESERVATION_REQUEST",
        primaryTopic: "solicitacao_reserva",
        rawText: text,
        hasDates: convState.hasDates,
        mentionsGuests: true
      };
    }
    if (mentionsFlatPreference && !isPricingOrQuoteInquiry(text)) {
      return {
        type: "RESERVATION_REQUEST",
        primaryTopic: "solicitacao_reserva",
        rawText: text,
        hasDates: convState.hasDates,
        mentionsGuests: convState.guestsExplicit
      };
    }
  }

  // 2. Preços, Tarifas, Diárias, Disponibilidade e Cotações (VIA 2 - Leitura do Sistema)
  if (isPricingOrQuoteInquiry(text)) {
    return {
      type: "PRICING_QUOTE",
      primaryTopic: "cotacao_precos",
      rawText: text
    };
  }

  // 3. Demanda Operacional Sem Acesso Autônomo (Ações, Trocas, Manutenção, Chamados, Comunicação de Check-out, Cancelamento)
  const demandClassification = classifyUnmetDemand(text);
  if (demandClassification && demandClassification.category !== "outros" && demandClassification.category !== "operacoes_sistema_pausadas") {
    return {
      type: "OPERATIONAL_DEMAND",
      primaryTopic: demandClassification.category,
      demandClassification,
      rawText: text
    };
  }

  // 4. Status de Reserva Existente / Confirmação (VIA 2 - Leitura do Sistema)
  const mentionsSpecificFaqTopicOnly = (
    /wifi|wi-fi|internet|senha|caf[eé]|desjejum|garagem|estacionamento|placa|endere[cç]o|localiza[cç][aã]o|piscina|jacuzzi|academia|pet|cachorro|fumar|cigarro|sil[eê]ncio|visita|esquec|perdi/i.test(text) &&
    !/(?:confirmad[ao]|aprovad[ao]|status|verificar|consultar|conferir|tenho\s+(?:alguma\s+)?reserva)/i.test(text)
  );

  const isResInquiry = !mentionsSpecificFaqTopicOnly && (
    /(?:minhas?\s+reservas?|minhas?\s+di[aá]rias?|minha\s+estadia)/i.test(text) ||
    /(?:reserva|estadia).*(?:confirmad[ao]|aprovad[ao]|status|certo|ok|garantid[ao]|ativa)/i.test(text) ||
    /(?:confirmad[ao]|status|certo|ok).*(?:reserva|estadia)/i.test(text) ||
    /(?:tenho|tem|existe|possui)\s+(?:alguma\s+)?reserva/i.test(text) ||
    /(?:verificar|consultar|conferir|confirmar|saber)\s+(?:minha\s+|se\s+tenho\s+|a\s+)?reserva/i.test(text) ||
    /^(?:est[aá]|t[aá])\s+confirmad[ao]\??$/i.test(text) ||
    /\b(?:res-\d+|cf-\d+)\b/i.test(text)
  );

  if (isResInquiry) {
    return {
      type: "EXISTING_RESERVATION",
      primaryTopic: "consulta_reserva",
      rawText: text
    };
  }

  // 5. Status de Higienização / Quarto Liberado / Entrada Antecipada (VIA 2 - Leitura do Sistema)
  const isFlatStatusInquiry = (
    /(?:quarto|flat|apartamento|chave|porta).*(?:pront|liberad|limp|entrar|chegand)/i.test(text) ||
    /(?:pront|liberad).*(?:quarto|flat|apartamento)/i.test(text) ||
    /posso\s+(?:entrar|ir)|senha\s+da\s+porta|chegando/i.test(text)
  ) && !/check[- ]?out|sa[ií]da|desocup|deix|entreg|devolv|indo\s+embora/i.test(text);

  if (isFlatStatusInquiry) {
    return {
      type: "FLAT_READY_STATUS",
      primaryTopic: "status_quarto",
      rawText: text
    };
  }

  // 6. Perguntas Institucionais / FAQ Genérico (VIA 1 - FAQ & Conhecimento)
  const isGenericFaqMatch = (
    /wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar/i.test(text) ||
    /caf[eé]|desjejum/i.test(text) ||
    /garagem|estacionamento|carro/i.test(text) ||
    /endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar/i.test(text) ||
    /check-?in|entrada|hor[aá]rio\s+de\s+entrada|chegada/i.test(text) ||
    /check-?out|sa[ií]da|hor[aá]rio\s+de\s+sa[ií]da/i.test(text) ||
    /pet|cachorro|animal/i.test(text) ||
    /piscina|jacuzzi|academia|cobertura|lazer/i.test(text) ||
    /fumo|fumar|cigarro/i.test(text) ||
    /micro[- ]ondas|frigobar|cafeteira|cooktop|fog[aã]o|cozinha|utens[ií]lio|smart\s*tv|tv|televis[aã]o|cama|enxoval|toalha|len[cç]ol|roupa\s+de\s+cama|ar[- ]condicionado|ar\s+split|comodidade/i.test(text)
  );

  if (isGenericFaqMatch) {
    return {
      type: "GENERIC_FAQ",
      primaryTopic: inferFaqCategory(text),
      rawText: text
    };
  }

  // 7. Demanda não mapeada / Dúvida Desconhecida
  return {
    type: isPotentialGuestQuestion(text) ? "UNKNOWN_INQUIRY" : "OTHER",
    primaryTopic: inferFaqCategory(text) || "outros",
    rawText: text
  };
}

export const analyzeGuestIntentSemantic = analyzeGuestQuery;

export function formatCheckoutCommunicationResponse(name = "", guestContext = null) {
  let greetingPart = "";
  if (name && typeof name === "string") {
    if (name.startsWith(" ") || name.startsWith(",")) {
      greetingPart = name;
    } else if (name.trim()) {
      greetingPart = `, ${name.trim()}`;
    }
  }
  const flatStr = guestContext?.flatNumber ? ` do *Flat ${guestContext.flatNumber}*` : "";
  return `Olá${greetingPart}! Muito obrigado por nos avisar! ✨\n\nRegistrei a sua comunicação de check-out${flatStr} em nosso sistema. A nossa equipe de governança e recepção já foi notificada da desocupação da unidade para os procedimentos de liberação e conferência.\n\nAgradecemos imensamente pela sua estadia com a CorpFlats e esperamos ter a alegria de te receber novamente em breve! Tenha uma excelente viagem de retorno! 🏨🗝️`;
}

/**
 * Pré-Análise Agêntica e Execução Prévia de Contexto (LLM-First Pre-Analysis):
 * Coleta todos os fatos reais do sistema, ciclo de vida da reserva (incluindo check-out concluído),
 * gatilhos automáticos recém-enviados e registra demandas não atendidas / FAQs pendentes ANTES
 * de a Sofia redigir a resposta final, permitindo que o próprio LLM componha 100% da resposta
 * com naturalidade e sem colagens pós-texto.
 */
export function prepareAgenticPreAnalysis({
  queryText = "",
  guestContext = {},
  db = null,
  aiConfig = DEFAULT_AI_CONFIG,
  saveDatabase = null,
  createNotification = null,
  history = []
}) {
  const effectiveHistory = (history && Array.isArray(history) && history.length > 0)
    ? history
    : (guestContext?.history && Array.isArray(guestContext.history) && guestContext.history.length > 0
        ? guestContext.history
        : ((db?.whatsappConversations || []).find(c => {
            const p = cleanWhatsAppPhone(c.phone);
            const target = cleanWhatsAppPhone(guestContext?.phone);
            return p && target && (p.endsWith(target.slice(-8)) || target.endsWith(p.slice(-8)));
          })?.messages || []));

  const convState = extractConversationState(queryText, effectiveHistory, guestContext, db);
  const analysis = analyzeGuestQuery(queryText, { ...(guestContext || {}), history: effectiveHistory }, db);
  const recentTriggers = Array.isArray(guestContext?.recentTriggers) && guestContext.recentTriggers.length > 0
    ? guestContext.recentTriggers
    : getRecentAutomatedTriggers(db, guestContext?.phone, effectiveHistory, guestContext?.reservation);

  const isCheckoutDone = Boolean(
    guestContext?.isCheckoutCompleted ||
    guestContext?.stayStatus === "checkout_concluido" ||
    (guestContext?.reservation && isReservationCheckoutCompleted(guestContext.reservation, db, guestContext?.phone, effectiveHistory))
  );

  let unmetDemand = null;
  let pendingFaq = null;
  let missingDataOrCapability = false;
  let shouldHandover = false;
  let requiresHandover = false;
  let autoCheckoutActionResult = null;

  if (analysis.type === "RESERVATION_REQUEST") {
    const botSettings = getBotActionsSettings(db);
    const canAutoReserve = botSettings.apiActionsEnabled !== false && (
      botSettings.allowedActions.createPreReservation !== false ||
      botSettings.allowedActions.commitReservation !== false
    );
    if (!canAutoReserve && db) {
      missingDataOrCapability = true;
      shouldHandover = true;
      requiresHandover = true;
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext,
        actionTarget: "createPreReservation",
        reason: "action_disabled",
        category: "pre_reserva",
        demandTitle: "Nova Pré-Reserva / Solicitação Direta",
        saveDatabase,
        createNotification
      });
    }
  } else if (analysis.type === "OPERATIONAL_DEMAND") {
    missingDataOrCapability = true;
    const cat = analysis.demandClassification?.category || inferFaqCategory(queryText);
    const demandTitle = analysis.demandClassification?.demandTitle || UNMET_DEMAND_CATEGORIES[cat]?.title || "Demanda Operacional";
    const extractedFlat = guestContext?.flatNumber || (queryText.match(/\b(?:flat|quarto|apto|apartamento|uh)\s*(\d{2,4})\b/i)?.[1]) || null;
    const effectiveContext = extractedFlat && (!guestContext || !guestContext.flatNumber)
      ? { ...(guestContext || {}), flatNumber: extractedFlat }
      : guestContext;

    const botActionsSettings = getBotActionsSettings(db);
    const isCheckoutActionEnabled = botActionsSettings?.apiActionsEnabled !== false && botActionsSettings?.allowedActions?.informCheckout === true;

    if (cat === "checkout_comunicacao" && isCheckoutActionEnabled && db) {
      const actionResult = handleInformCheckout(db, {
        flatNumber: extractedFlat,
        phone: guestContext?.phone,
        guestName: guestContext?.guestName
      });
      autoCheckoutActionResult = actionResult;
      if (actionResult && actionResult.success) {
        missingDataOrCapability = false;
        unmetDemand = null;
        if (typeof saveDatabase === "function") {
          try { saveDatabase("bot_action_inform_checkout_auto"); } catch (_) {}
        }
      } else {
        unmetDemand = detectAndRecordUnmetDemand({
          db,
          text: queryText,
          senderPhone: guestContext?.phone,
          senderName: guestContext?.guestName || "Hóspede",
          guestContext: effectiveContext,
          actionTarget: "informCheckout",
          reason: "capability_missing",
          category: cat,
          demandTitle,
          saveDatabase,
          createNotification
        });
      }
    } else if (db) {
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext: effectiveContext,
        actionTarget: cat === "checkout_comunicacao" ? "informCheckout" : null,
        reason: "capability_missing",
        category: cat,
        demandTitle,
        saveDatabase,
        createNotification
      });
    }
  } else if (analysis.type === "UNKNOWN_INQUIRY" && db) {
    missingDataOrCapability = true;
    unmetDemand = detectAndRecordUnmetDemand({
      db,
      text: queryText,
      senderPhone: guestContext?.phone,
      senderName: guestContext?.guestName || "Hóspede",
      guestContext,
      actionTarget: null,
      reason: "capability_missing",
      saveDatabase,
      createNotification
    });

    const isDevCaller = isDeveloperPhone(guestContext?.phone, db) &&
      (classifyDeveloperMessage(queryText, db).type !== "guest_simulation");

    if (!isDevCaller) {
      pendingFaq = autoCreatePendingFaq({
        db,
        questionText: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        saveDatabase,
        createNotification
      });
    }
  }

  const triggerLines = recentTriggers.length > 0
    ? recentTriggers.map(t => `  * [${t.triggerEvent || t.templateId || "gatilho"}] ${t.summary || "Notificação automática enviada"}`).join("\n")
    : "  * Nenhum gatilho automático recente registrado.";

  let preAnalysisDirective = "";
  if (analysis.type === "GREETING_ONLY") {
    preAnalysisDirective = `- POSTURA DE ESCUTA ATIVA (MEMÓRIA SILENCIOSA): O hóspede enviou APENAS uma saudação ("${queryText}"). Cumprimente-o pelo nome de forma calorosa e pergunte como pode ajudar. NÃO despeje dados da reserva, NÃO cobre check-out, NÃO envie links não solicitados!`;
  } else if (isCheckoutDone) {
    preAnalysisDirective = `- ATENÇÃO: O check-out da reserva ${guestContext?.reservation?.code || ""} (Flat ${guestContext?.flatNumber || "N/A"}) JÁ FOI CONCLUÍDO! Nunca peça para desocupar o quarto até 12h nem envie link de check-out.`;
  } else if (unmetDemand) {
    preAnalysisDirective = `- DEMANDA REGISTRADA PREVIAMENTE NO SISTEMA: A solicitação do hóspede ("${unmetDemand.demandTitle || analysis.primaryTopic}") já foi registrada automaticamente na fila da recepção/governança (ID: ${unmetDemand.id || "ativo"}). Informe ao hóspede com naturalidade e empatia que você já registrou o pedido para a equipe atender com prioridade.`;
  } else if (autoCheckoutActionResult?.success) {
    preAnalysisDirective = `- CHECK-OUT PROCESSADO AUTOMATICAMENTE: A saída do Flat ${autoCheckoutActionResult.flatNumber || guestContext?.flatNumber || ""} já foi registrada no sistema e a governança foi acionada. Agradeça a estadia com carinho!`;
  }

  const promptBlock = `
[DOSSIÊ PRÉ-RESPOSTA & CICLO DE VIDA REAL DA CONVERSA]
- Classificação da mensagem atual: ${analysis.type} (Tópico: ${analysis.primaryTopic || "geral"})
- Check-out já concluído / estadia encerrada: ${isCheckoutDone ? "SIM (CHECK-OUT JÁ REALIZADO — PROIBIDO COBRAR SAÍDA OU ENVIAR LINK DE CHECK-OUT)" : "NÃO"}
- Gatilhos e notificações automáticas enviadas recentemente para este hóspede:
${triggerLines}
${preAnalysisDirective ? `${preAnalysisDirective}\n` : ""}`;

  return {
    analysis,
    convState,
    recentTriggers,
    isCheckoutDone,
    unmetDemand,
    pendingFaq,
    missingDataOrCapability,
    shouldHandover,
    requiresHandover,
    autoCheckoutActionResult,
    promptBlock
  };
}

/**
 * Auto-Crítica Semântica e Validador Pré-Envio:
 * Avalia criticamente a resposta candidata antes de enviar para garantir
 * que ela realmente responde à pergunta feita pelo hóspede, evitando falsos positivos
 * (ex: responder regras de entrega de bandeja quando a pessoa perguntou preço).
 * Se a demanda não possui dados ou capacidade operacional no sistema, registra
 * em db.unmetDemands imediatamente e gera resposta transparente e cordial.
 */
export function validateAndRefineResponse({
  queryText = "",
  candidateText = "",
  guestContext = {},
  db = null,
  aiConfig = DEFAULT_AI_CONFIG,
  saveDatabase = null,
  createNotification = null,
  history = [],
  preRecordedUnmetDemand = null,
  preExecutedCheckoutResult = null,
  preRecordedPendingFaq = null
}) {
  const effectiveHistory = (history && Array.isArray(history) && history.length > 0)
    ? history
    : (guestContext?.history && Array.isArray(guestContext.history) && guestContext.history.length > 0
        ? guestContext.history
        : ((db?.whatsappConversations || []).find(c => {
            const p = cleanWhatsAppPhone(c.phone);
            const target = cleanWhatsAppPhone(guestContext?.phone);
            return p && target && (p.endsWith(target.slice(-8)) || target.endsWith(p.slice(-8)));
          })?.messages || []));

  const convState = extractConversationState(queryText, effectiveHistory, guestContext, db);
  const analysis = analyzeGuestQuery(queryText, { ...(guestContext || {}), history: effectiveHistory }, db);
  let replyText = candidateText;
  let unmetDemand = preRecordedUnmetDemand || null;
  let missingDataOrCapability = Boolean(preRecordedUnmetDemand);
  let shouldHandover = false;
  let requiresHandover = false;

  const name = guestContext?.guestName ? `, ${guestContext.guestName.split(" ")[0].trim()}` : "";
  const toneSettings = db?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings, db, guestContext);

  const isCheckoutDone = Boolean(
    guestContext?.isCheckoutCompleted ||
    guestContext?.stayStatus === "checkout_concluido" ||
    (guestContext?.reservation && isReservationCheckoutCompleted(guestContext.reservation, db, guestContext?.phone, effectiveHistory))
  );

  // Regra 1: Validação Crítica de Cotação / Preço vs Regras Operacionais (Ex: Café da Manhã)
  if (analysis.type === "PRICING_QUOTE") {
    const isHandoverMessage = /transferindo|pausad[ao]s|manuten[cç][aã]o|atendimento\s+humano|equipe\s+humana/i.test(replyText);
    const hasPriceIndicator = /\b(?:r\$|\d+,\d{2}|\d+\s*reais)\b/i.test(replyText);
    const hasOnlyBreakfastLogistics = /servido\s+em\s+bandeja|das\s+05:00|portal\s+\/cafe|agendamento\s+at[eé]\s+a\s+v[eé]spera/i.test(replyText) && !hasPriceIndicator;
    const candidateHasSpecificDateQuote = Boolean(convState.currentMessageHasDates && (/datas\s+informadas/i.test(replyText) || (convState.displayCheckIn && replyText.includes(convState.displayCheckIn))));
    const candidateIsFullQuote = !candidateHasSpecificDateQuote && (
      hasRecentlySentPricingQuote([{ fromMe: true, text: replyText }]) ||
      /no canal direto da corpflats|nossas diárias para flats executivos/i.test(replyText)
    );

    if (!isHandoverMessage && convState.currentMessageHasDates && db && !candidateHasSpecificDateQuote) {
      const stepResult = executeConversationalBookingStep({
        messageText: queryText,
        history: effectiveHistory,
        guestContext,
        db,
        aiConfig
      });
      if (stepResult.handled && stepResult.replyText) {
        replyText = stepResult.replyText;
      }
    } else if (hasRecentlySentPricingQuote(effectiveHistory) && (candidateIsFullQuote || !hasPriceIndicator || hasOnlyBreakfastLogistics)) {
      const pricing = handleGetPricingInfo(db, {
        guests: /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(queryText) ? 2 : 1,
        withBreakfast: /\b(?:com\s+caf[eé]|incluso\s+caf[eé])/i.test(queryText)
      });
      console.log(`[Semantic Critique] Cotação já enviada recentemente para "${queryText}". Evitando reenvio do banner de diárias.`);
      replyText = ret(`Olá${name}! Como mencionei acima, nossas diárias são a partir de *R$ ${pricing.baseRateWithoutBreakfast},00* sem café ou *R$ ${pricing.rateWithBreakfastFor1},00* com café no quarto (isenção da taxa de limpeza). Me informando as datas desejadas de check-in e check-out e quantas pessoas serão, verifico a disponibilidade exata agora mesmo! 🏨✨`);
    } else if (!isHandoverMessage && (!hasPriceIndicator || hasOnlyBreakfastLogistics)) {
      const pricing = handleGetPricingInfo(db, {
        guests: /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(queryText) ? 2 : 1,
        withBreakfast: /\b(?:com\s+caf[eé]|incluso\s+caf[eé])/i.test(queryText)
      });
      console.log(`[Semantic Critique] Mismatch detectado para query de preço ("${queryText}"). Substituindo resposta por valores oficiais do sistema.`);
      const isCouple = /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(queryText);
      const withBreakfast = /\b(?:com\s+caf[eé]|incluso\s+caf[eé])/i.test(queryText);
      const withoutBreakfast = /\b(?:sem\s+caf[eé])/i.test(queryText);

      if (withBreakfast) {
        const rate = isCouple ? pricing.rateWithBreakfastFor2 : pricing.rateWithBreakfastFor1;
        replyText = ret(`Olá${name}! ✨ No canal direto da CorpFlats, a diária para *${isCouple ? "2 pessoas (casal)" : "1 pessoa"} com café da manhã* servido no quarto fica a partir de *R$ ${rate},00* (e você ainda conta com o benefício exclusivo de *isenção total da taxa de limpeza*!).\n\nSe preferir a opção sem café, a diária fica a partir de *R$ ${pricing.baseRateWithoutBreakfast},00* (+ taxa única de limpeza de R$ ${pricing.cleaningFeeStandard},00 por estadia).\n\nPara quais datas você gostaria da reserva? Me informando a entrada e saída, já verifico a disponibilidade e passo todos os detalhes! 🏨`);
      } else if (withoutBreakfast) {
        const rateWithBf = isCouple ? pricing.rateWithBreakfastFor2 : pricing.rateWithBreakfastFor1;
        replyText = ret(`Olá${name}! ✨ No canal direto da CorpFlats, a diária para *${isCouple ? "2 pessoas (casal)" : "1 pessoa"} sem café* fica a partir de *R$ ${pricing.baseRateWithoutBreakfast},00* (+ taxa única de limpeza de R$ ${pricing.cleaningFeeStandard},00 por estadia).\n\n• *Opção com café no quarto:* a partir de *R$ ${rateWithBf},00 / diária* (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você deseja a hospedagem? Me informe a data de entrada e saída que consulto a disponibilidade! 🏨`);
      } else {
        replyText = ret(`Olá${name}! ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de:\n\n• *Sem café:* a partir de *R$ ${pricing.baseRateWithoutBreakfast},00 / diária* (+ taxa única de limpeza de R$ ${pricing.cleaningFeeStandard},00 por estadia)\n• *Com café da manhã no quarto:* a partir de *R$ ${pricing.rateWithBreakfastFor1},00 / diária* (1 pessoa) ou *R$ ${pricing.rateWithBreakfastFor2},00 / diária* (casal), com *isenção total da taxa de limpeza*! 🥐☕\n\nQual período você pretende se hospedar e para quantas pessoas? Me informando as datas de entrada e saída, já verifico a disponibilidade em tempo real para você! 🏨`);
      }
    }
  }

  // Regra 1.5: Validação Crítica de Solicitação de Reserva (RESERVATION_REQUEST)
  if (analysis.type === "RESERVATION_REQUEST") {
    const botSettings = getBotActionsSettings(db);
    const canAutoReserve = botSettings.apiActionsEnabled !== false && (
      botSettings.allowedActions.createPreReservation !== false ||
      botSettings.allowedActions.commitReservation !== false
    );

    if (!canAutoReserve) {
      missingDataOrCapability = true;
      shouldHandover = true;
      requiresHandover = true;
      unmetDemand = unmetDemand || detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext,
        actionTarget: "createPreReservation",
        reason: "action_disabled",
        category: "pre_reserva",
        demandTitle: "Nova Pré-Reserva / Solicitação Direta",
        saveDatabase,
        createNotification
      });

      const stepResult = executeConversationalBookingStep({
        messageText: queryText,
        history: effectiveHistory,
        guestContext,
        db,
        aiConfig
      });
      replyText = stepResult.replyText;
    } else {
      const candidateHasPreReservation = /\bcf-\d+\b/i.test(replyText) || /pr[eé]-reserva.*c[oó]digo|pix\s+copia\s+e\s+cola|000201/i.test(replyText);
      const candidateHasDateQuote = Boolean(
        convState.hasDates && (
          /datas\s+informadas/i.test(replyText) ||
          /or[cç]amento\s+total\s+para\s+o\s+per[ií]odo/i.test(replyText) ||
          (convState.displayCheckIn && replyText.includes(convState.displayCheckIn))
        )
      );
      const candidateRepeatsGenericQuote = !candidateHasPreReservation && !candidateHasDateQuote && (
        hasRecentlySentPricingQuote([{ fromMe: true, text: replyText }]) ||
        /no canal direto da corpflats|nossas diárias para flats|sem café:\s*a partir|com café da manhã no quarto:\s*a partir/i.test(replyText)
      );

      const isAlreadyAskingDates = /datas?\s+(?:de\s+)?(?:entrada|check-?in)/i.test(replyText) && !candidateRepeatsGenericQuote;

      if (convState.hasDates) {
        // Se temos datas (atuais ou do histórico), garante que a resposta execute a ação real (pré-reserva ou disponibilidade/orçamento)
        const needsPreReservationNow = convState.wantsToBook && !candidateHasPreReservation && (db?.flats?.length > 0);
        if (candidateRepeatsGenericQuote || isAlreadyAskingDates || needsPreReservationNow || (!candidateHasPreReservation && !candidateHasDateQuote)) {
          const stepResult = executeConversationalBookingStep({
            messageText: queryText,
            history: effectiveHistory,
            guestContext,
            db,
            aiConfig
          });
          if (stepResult.handled && stepResult.replyText) {
            replyText = stepResult.replyText;
          }
        }
      } else {
        if (!isAlreadyAskingDates || candidateRepeatsGenericQuote) {
          const stepResult = executeConversationalBookingStep({
            messageText: queryText,
            history: effectiveHistory,
            guestContext,
            db,
            aiConfig
          });
          if (stepResult.handled && stepResult.replyText) {
            replyText = stepResult.replyText;
          }
        }
      }
    }
  }

  // Regra 2: Demanda Operacional Sem Acesso Autônomo (Missing Operational Capability)
  if (analysis.type === "OPERATIONAL_DEMAND") {
    missingDataOrCapability = true;
    const cat = analysis.demandClassification?.category || inferFaqCategory(queryText);
    const demandTitle = analysis.demandClassification?.demandTitle || UNMET_DEMAND_CATEGORIES[cat]?.title || "Demanda Operacional";

    // Extrai número do flat da mensagem caso não conste no contexto
    const extractedFlat = guestContext?.flatNumber || (queryText.match(/\b(?:flat|quarto|apto|apartamento|uh)\s*(\d{2,4})\b/i)?.[1]) || null;
    const effectiveContext = extractedFlat && (!guestContext || !guestContext.flatNumber)
      ? { ...(guestContext || {}), flatNumber: extractedFlat }
      : guestContext;

    const botActionsSettings = getBotActionsSettings(db);
    const isCheckoutActionEnabled = botActionsSettings?.apiActionsEnabled !== false && botActionsSettings?.allowedActions?.informCheckout === true;

    if (cat === "checkout_comunicacao" && isCheckoutActionEnabled && db) {
      // Se a ação informCheckout estiver habilitada pelo admin, Sofia atua com autonomia total (reaproveita resultado da pré-análise se já executado)
      const actionResult = preExecutedCheckoutResult || handleInformCheckout(db, {
        flatNumber: extractedFlat,
        phone: guestContext?.phone,
        guestName: guestContext?.guestName
      });
      if (actionResult && actionResult.success) {
        missingDataOrCapability = false;
        unmetDemand = null;
        if (!preExecutedCheckoutResult && typeof saveDatabase === "function") {
          try { saveDatabase("bot_action_inform_checkout_auto"); } catch (_) {}
        }
      } else {
        unmetDemand = unmetDemand || detectAndRecordUnmetDemand({
          db,
          text: queryText,
          senderPhone: guestContext?.phone,
          senderName: guestContext?.guestName || "Hóspede",
          guestContext: effectiveContext,
          actionTarget: "informCheckout",
          reason: "capability_missing",
          category: cat,
          demandTitle,
          saveDatabase,
          createNotification
        });
      }
    } else if (db) {
      unmetDemand = unmetDemand || detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext: effectiveContext,
        actionTarget: cat === "checkout_comunicacao" ? "informCheckout" : null,
        reason: "capability_missing",
        category: cat,
        demandTitle,
        saveDatabase,
        createNotification
      });
    }

    if (cat === "checkout_comunicacao") {
      const checkoutAck = formatCheckoutCommunicationResponse(name, effectiveContext);
      const isCheckoutFaqOrFallback = /12:00h|instruções\s+de\s+check-?out|deixe\s+a\s+chave|portaria\s+24h|posso\s+te\s+ajudar\s+com\s+informaç/i.test(replyText) ||
        (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("almoç") && !replyText.includes("restaurante") && !replyText.includes("mala") && !replyText.includes("táxi") && !replyText.includes("uber"));

      if (!isCheckoutFaqOrFallback && replyText.trim().length > 15) {
        replyText = ret(`${checkoutAck}\n\n${replyText.trim()}`);
      } else {
        replyText = ret(checkoutAck);
      }
    } else {
      const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
        (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("registrei") && !replyText.includes("equipe"));
      const alreadyAcknowledged = /registrei|equipe|recep[cç][aã]o|encaminh|atender/i.test(replyText);

      if (isGenericFallback || !alreadyAcknowledged) {
        replyText = ret(`Olá${name}! Recebi sua solicitação sobre *${demandTitle}* 🛎️. Como essa operação requer acompanhamento da nossa equipe, já registrei o seu pedido no sistema para a recepção atender você com máxima atenção! ✨`);
      }
    }
  }

  // Regra 3: Dúvida Desconhecida / Não Mapeada (Unknown Inquiry)
  if (analysis.type === "UNKNOWN_INQUIRY") {
    missingDataOrCapability = true;
    const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
      (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("registrei"));

    if (db) {
      unmetDemand = unmetDemand || detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext,
        actionTarget: null,
        reason: "capability_missing",
        saveDatabase,
        createNotification
      });

      const isDevCaller = isDeveloperPhone(guestContext?.phone, db) &&
        (classifyDeveloperMessage(queryText, db).type !== "guest_simulation");

      if (!isDevCaller && !preRecordedPendingFaq) {
        autoCreatePendingFaq({
          db,
          questionText: queryText,
          senderPhone: guestContext?.phone,
          senderName: guestContext?.guestName || "Hóspede",
          saveDatabase,
          createNotification
        });
      }
    }

    if (isGenericFallback) {
      replyText = ret(`Olá${name}! Anotei sua dúvida. Como não tenho essa informação cadastrada no sistema, já registrei sua pergunta para a equipe da recepção te responder por aqui em instantes! 🛎️✨`);
    }
  }

  // Regra 4: Validação de Status do Quarto / Prontidão (VIA 2)
  if (analysis.type === "FLAT_READY_STATUS") {
    const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
      (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("limpo") && !replyText.includes("pronto") && !replyText.includes("governança") && !replyText.includes("quarto"));

    if (isGenericFallback && db) {
      const flatNum = guestContext?.flatNumber || (queryText.match(/\b(?:flat|quarto|apto|apartamento)\s*(\d{2,4})\b/i)?.[1]) || null;
      if (flatNum) {
        const flatStatus = handleGetFlatStatus(db, { flatNumber: flatNum });
        if (flatStatus && flatStatus.success) {
          if (flatStatus.isRoomReady) {
            replyText = ret(`Ótima notícia${name}! 🎉 O seu *Flat ${flatNum}* já está *100% limpo, higienizado e pronto* para te receber! Ao chegar, basta se identificar na portaria com seu documento para a liberação da chave. Seja muito bem-vindo(a)! 🏨🔑`);
          } else {
            const cleanDesc = flatStatus.cleaningStatus === "in_progress" ? "em higienização pela equipe de governança" : "sendo preparado pela nossa governança";
            replyText = ret(`Olá${name}! O seu *Flat ${flatNum}* está ${cleanDesc} ✨. O horário oficial de entrada é a partir das 14:00h. Assim que a limpeza for liberada pela equipe, nós te avisaremos por aqui imediatamente! 🕒`);
          }
        }
      } else {
        replyText = ret(`Olá${name}! Para verificar se o seu apartamento já está pronto e liberado, por favor me informe o *número do seu flat* ou o *nome completo do titular da reserva*! 🛎️🔑`);
      }
    }
  }

  // Regra 5: Validação de Consulta de Reserva Existente (VIA 2)
  if (analysis.type === "EXISTING_RESERVATION") {
    const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
      (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("confirmada") && !replyText.includes("reserva") && !replyText.includes("concluído"));

    if (isGenericFallback) {
      if (guestContext?.hasReservation && guestContext?.reservation && guestContext.reservation.status !== "cancelada" && guestContext.reservation.status !== "cancelled") {
        const r = guestContext.reservation;
        const flatStr = r.flatNumber || guestContext.flatNumber || "UH a definir";
        const checkinFmt = r.checkinDate ? formatBrDate(r.checkinDate) : "Data a confirmar";
        const checkoutFmt = r.checkoutDate ? formatBrDate(r.checkoutDate) : "Data a confirmar";
        const hideFinGuest = Boolean(guestContext?.hideFinancialForGuest || r.hideFinancialForGuest);
        const paymentStr = (r.paymentStatus === "pago_total" || r.paymentStatus === "pago") ? "Pagamento Quitado" : "Pagamento Pendente";
        const statusSuffix = hideFinGuest ? "" : ` (${paymentStr})`;
        const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
        const checkoutUrl = guestContext.checkoutUrl || (r.code ? `${appOrigin}/checkout/${r.code}` : "");

        if (isCheckoutDone) {
          replyText = ret(`Olá${name}! Consta em nosso sistema que a sua hospedagem no *Flat ${flatStr}* (${checkinFmt} a ${checkoutFmt}) já teve o *check-out concluído* ✅.\n\nAgradecemos imensamente pela sua estadia conosco na CorpFlats! Se precisar de *Nota Fiscal (NFS-e)*, tiver esquecido algum pertence no apartamento ou desejar fazer uma *nova reserva*, estou à sua inteira disposição! 🏨✨`);
        } else if (guestContext.stayStatus === "checkout_hoje") {
          const checkoutLinkMsg = checkoutUrl ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nLembramos que *hoje é o dia do seu check-out*, com horário limite de desocupação até as *12:00h*.${checkoutLinkMsg}\n\nCaso deseje solicitar prorrogação da estadia (late check-out) mediante disponibilidade ou se já tiver desocupado o flat, por favor me avise por aqui! Como posso te ajudar na sua saída hoje? ✨`);
        } else if (guestContext.stayStatus === "em_estadia") {
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nVocê já está acomodado(a) no *Flat ${flatStr}* com estadia prevista até *${checkoutFmt}*. Não é necessário preencher pré-check-in novamente!\n\nSe precisar de toalhas extras, orientações de Wi-Fi, agendamento de café ou qualquer outro suporte durante a sua permanência, estou à sua total disposição! ✨`);
        } else if (guestContext.stayStatus === "checkin_hoje") {
          const linkUrl = r.checkinUrl || guestContext.checkinUrl;
          const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nO seu check-in é *hoje (${checkinFmt})* a partir das 14:00h! Lembramos que para reservas diretas temos o benefício de early check-in a partir das 10h (mediante disponibilidade de higienização pela governança).${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua chegada, estou à total disposição!`);
        } else {
          const linkUrl = r.checkinUrl || guestContext.checkinUrl;
          const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nSua estadia está confirmada e programada para início em *${checkinFmt}*! Para agilizar sua liberação na portaria 24h, realize o seu cadastro antecipado:${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua estadia, estou à total disposição!`);
        }
      } else {
        replyText = ret(`Olá${name}! Não localizei nenhuma reserva confirmada para este número de WhatsApp no sistema. Se a reserva foi realizada em outro nome ou plataforma, me informe o *nome completo do titular* ou o *código da reserva* que consulto para você! 🛎️✨`);
      }
    }
  }

  // Regra 6: Blindagem Semântica & Sanitização Temporal Pós-Geração (Respeito ao Ciclo de Vida Real e Saudação Silenciosa)
  const stripPreCheckinFromText = (txt) => String(txt || "")
    .replace(/📋\s*\*?Pr[eé]-Check-in(?:\s+Digital)?:\*?\s*\n?(?:👉\s*)?(?:https?:\/\/)?[^\s]*/gi, "")
    .replace(/(?:👉\s*)?(?:https?:\/\/)?[^\s]*pre-?checkin[^\s]*/gi, "")
    .replace(/(?:acesse|fa[cç]a|preencha|link\s+(?:do|de)|realize\s+(?:o\s+)?)\s*(?:o\s+)?(?:nosso\s+)?pr[eé]-?check-?in(?:\s+em|\s+pelo|\s+no|\s+digital)?[^\n.]*[.\n]?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const stripPendingCheckoutReminderFromText = (txt) => String(txt || "")
    .replace(/🚪\s*\*?Confirma[cç][aã]o\s+de\s+Check-?out:\*?\s*\n?(?:👉\s*)?(?:https?:\/\/)?[^\s]*/gi, "")
    .replace(/(?:👉\s*)?(?:https?:\/\/)?[^\s]*\/checkout\/[^\s]*/gi, "")
    .replace(/Lembramos\s+que\s+\*?hoje\s+[eé]\s+o\s+dia\s+do\s+seu\s+check-?out\*?[^\n]*\n?/gi, "")
    .replace(/Caso\s+deseje\s+solicitar\s+prorroga[cç][aã]o\s+da\s+estadia\s*\(late\s+check-?out\)[^\n]*\n?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (isCheckoutDone || analysis.primaryTopic === "checkout_comunicacao") {
    // Se o check-out já foi concluído ou está sendo comunicado pelo hóspede agora, NUNCA permite cobrança de saída até 12h, link de /checkout/ ou link de /pre-checkin/
    if (/pr[eé]-?check-?in|pre-checkin/i.test(replyText)) {
      replyText = stripPreCheckinFromText(replyText);
    }
    if (/\/checkout\/|Confirma[cç][aã]o\s+de\s+Check-?out|hoje\s+[eé]\s+o\s+dia\s+do\s+seu\s+check-?out/i.test(replyText)) {
      replyText = stripPendingCheckoutReminderFromText(replyText);
    }
    if (!replyText || replyText.trim().length < 5) {
      const salutation = getGreetingSalutation(queryText, name);
      replyText = ret(`${salutation} Tudo bem? Sou a ${aiConfig?.agentName || "Sofia"}, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊`);
    }
  } else if (analysis.type === "GREETING_ONLY") {
    // Saudação pura (Escuta Ativa / Memória Silenciosa): NUNCA despeja cobrança de check-out nem links não solicitados
    if (/pr[eé]-?check-?in|pre-checkin/i.test(replyText)) {
      replyText = stripPreCheckinFromText(replyText);
    }
    if (/\/checkout\/|Confirma[cç][aã]o\s+de\s+Check-?out|hoje\s+[eé]\s+o\s+dia\s+do\s+seu\s+check-?out/i.test(replyText)) {
      replyText = stripPendingCheckoutReminderFromText(replyText);
    }
  } else if (guestContext?.stayStatus === "checkout_hoje" || guestContext?.isCheckoutDay) {
    let hadPreCheckinRemoved = false;
    if (/pr[eé]-?check-?in/i.test(replyText) || /pre-checkin/i.test(replyText)) {
      hadPreCheckinRemoved = true;
      replyText = stripPreCheckinFromText(replyText);
    }
    // Apenas complementa dados de check-out se o candidato tinha link errado de pré-check-in removido
    // ou se for consulta de reserva existente / FAQ de check-out que omitiu o horário de 12:00h
    const guestAskedReservaOrCheckoutFaq =
      analysis.type === "EXISTING_RESERVATION" ||
      (analysis.type === "GENERIC_FAQ" && analysis.primaryTopic === "checkout");
    const hasCheckoutDetails = /12:00|12h|hor[aá]rio\s+limite/i.test(replyText);
    if ((hadPreCheckinRemoved || guestAskedReservaOrCheckoutFaq) && !hasCheckoutDetails) {
      const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.com.br";
      const checkoutUrl = guestContext.checkoutUrl || (guestContext?.reservation?.code ? `${appOrigin}/checkout/${guestContext.reservation.code}` : "");
      const checkoutLinkMsg = checkoutUrl && !replyText.includes(checkoutUrl) ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
      replyText += `\n\nLembramos que hoje é o dia do seu check-out, com horário limite de desocupação até as 12:00h.${checkoutLinkMsg}\nCaso deseje solicitar prorrogação da estadia (late check-out) mediante disponibilidade ou se já tiver desocupado o flat, por favor me avise por aqui! ✨`;
    }
  } else if (guestContext?.stayStatus === "em_estadia" || guestContext?.isHosted) {
    if (/pr[eé]-?check-?in/i.test(replyText) || /pre-checkin/i.test(replyText)) {
      replyText = stripPreCheckinFromText(replyText);
    }
  }

  // Regra 7: Proteção Anti-Loop de Mensagens Idênticas (Anti-Repetition Guard)
  if (effectiveHistory && effectiveHistory.length > 0) {
    const repetitionCheck = applyAntiRepetitionGuard({
      candidateText: replyText,
      history: effectiveHistory,
      queryText,
      guestContext,
      db,
      analysis
    });
    if (repetitionCheck.wasRepetitive && repetitionCheck.refinedText) {
      console.log(`[Anti-Repetition Guard] Resposta duplicada/substancialmente idêntica detectada. Refinando resposta.`);
      replyText = repetitionCheck.refinedText;
    }
  }

  replyText = applyToneFormatting(replyText, toneSettings, db, guestContext);

  return {
    replyText,
    analysis,
    unmetDemand,
    missingDataOrCapability,
    shouldHandover,
    requiresHandover
  };
}

/**
 * Retorna a saudação contextual correspondente ao que o hóspede enviou (retribuição cordial de Bom dia / Boa tarde / Boa noite)
 */
export function getGreetingSalutation(messageText, name = "") {
  const lower = String(messageText || "").toLowerCase().trim();
  if (/\bbom\s+dia\b/i.test(lower)) return `Bom dia${name}!`;
  if (/\bboa\s+tarde\b/i.test(lower)) return `Boa tarde${name}!`;
  if (/\bboa\s+noite\b/i.test(lower)) return `Boa noite${name}!`;
  return `Olá${name}!`;
}

/**
 * Resposta Heurística de Contingência caso o Google Gemini esteja offline ou sem cota
 */
export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG, dbOrFaqs = null, dbParam = null, history = []) {
  const text = (messageText || "").toLowerCase().trim();
  const kb = aiConfig?.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const name = guestContext.guestName ? `, ${guestContext.guestName.split(" ")[0].trim()}` : "";
  const greetingSalutation = getGreetingSalutation(messageText, name);

  const activeDb = dbParam || (dbOrFaqs && typeof dbOrFaqs === "object" && !Array.isArray(dbOrFaqs) ? dbOrFaqs : (typeof globalThis !== "undefined" ? globalThis.db : null));
  const activeGuidelines = (activeDb?.whatsappAiSettings?.developerGuidelines || []).filter(g => g && g.active !== false);
  const toneSettings = activeDb?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings, activeDb, guestContext);

  const effectiveHistory = (history && Array.isArray(history) && history.length > 0)
    ? history
    : (guestContext?.history && Array.isArray(guestContext.history) && guestContext.history.length > 0
        ? guestContext.history
        : ((activeDb?.whatsappConversations || []).find(c => {
            const p = cleanWhatsAppPhone(c.phone);
            const target = cleanWhatsAppPhone(guestContext?.phone);
            return p && target && (p.endsWith(target.slice(-8)) || target.endsWith(p.slice(-8)));
          })?.messages || []));

  const asksExtension = /(?:estender|prorroga|prolongar|mais\s+di[aá]rias|ficar\s+mais)/i.test(text);
  const asksCheckoutTime = /(?:hor[aá]rio\s+(?:de\s+)?check-?out|que\s+horas\s+(?:é\s+o\s+|tenho\s+que\s+)?sair|hor[aá]rio\s+de\s+sa[ií]da|hor[aá]rio\s+do\s+check-?out|limite\s+de\s+sa[ií]da)/i.test(text);

  // 0.A Comunicação de Check-out pelo Hóspede (Aviso de saída/desocupação)
  const effectiveContext = { ...(guestContext || {}), history: effectiveHistory };
  const queryAnalysis = analyzeGuestQuery(messageText, effectiveContext, activeDb);
  if (queryAnalysis.type === "OPERATIONAL_DEMAND" && queryAnalysis.primaryTopic === "checkout_comunicacao") {
    const extractedFlat = guestContext?.flatNumber || (messageText.match(/\b(?:flat|quarto|apto|apartamento|uh)\s*(\d{2,4})\b/i)?.[1]) || null;
    const effectiveCtx = extractedFlat && (!guestContext || !guestContext.flatNumber)
      ? { ...(guestContext || {}), flatNumber: extractedFlat }
      : guestContext;
    const checkoutResp = formatCheckoutCommunicationResponse(name, effectiveCtx);
    let extraAnswer = "";
    if (/almo[cç]|restaurante|comer|almo[cç]ar/i.test(messageText)) {
      extraAnswer = "\n\n🍽️ Para refeições, temos ótimos restaurantes nos arredores (Rua Conselheiro Otaviano e Praça do Santíssimo Salvador). Qualquer dúvida adicional, nossa recepção está à disposição!";
    } else if (/mala[s]?|bagagem|guardar/i.test(messageText)) {
      extraAnswer = "\n\n🧳 Se precisar guardar suas malas após a saída enquanto aguarda sua viagem, você pode deixá-las com segurança na recepção 24h!";
    }
    return ret(`${checkoutResp}${extraAnswer}`);
  }

  // 0.A.1 Solicitação de Nota Fiscal (Intercepção Fiscal Heurística)
  if (isFiscalIntentMessage(messageText)) {
    const { linkedCompany } = findContactAndReservation(activeDb, guestContext?.phone);
    if (linkedCompany && isValidCnpj(linkedCompany.cnpj)) {
      return ret(`Olá${name}! Identificamos que a sua estadia já possui vínculo com a empresa **${linkedCompany.corporateName || linkedCompany.tradeName}** (CNPJ: ${formatCnpj(linkedCompany.cnpj)}). A sua Nota Fiscal (NFS-e) será emitida automaticamente com todos os dados corporativos cadastrados. Qualquer dúvida, estamos à disposição! 🏨✨`);
    }
    return ret(`Olá${name}! Com certeza podemos emitir a sua Nota Fiscal de Serviços (NFS-e)! 📄✨ Por favor, nos informe se a emissão será para Empresa (PJ) — bastando informar o CNPJ e o e-mail financeiro — ou para Você (Pessoa Física - PF) — informando Nome Completo, CPF, Endereço com CEP e E-mail. Ficamos no aguardo dos seus dados!`);
  }

  // 0.B Diretrizes do Desenvolvedor para Flat Específico (Prioridade Máxima para regras de unidade)
  if (activeGuidelines.length > 0) {
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    if (flatNum) {
      const flatGuideline = activeGuidelines.find(g => String(g.targetFlat) === String(flatNum));
      if (flatGuideline) {
        return ret(`${greetingSalutation} Sobre o Flat ${flatNum}: ${flatGuideline.text} Estamos à disposição! ✨`);
      }
    }
  }

  // 0.C Geração Multitópico Composta e Contextual (Anti-Copia-e-Cola e Respostas Integradas)
  // Executa tanto com diretrizes aprendidas dinâmicas quanto com a base de conhecimento padrão
  const asksCheckout = /(?:hor[aá]rio\s+(?:de\s+)?check-?out|que\s+horas\s+(?:é\s+o\s+|tenho\s+que\s+)?sair|hor[aá]rio\s+de\s+sa[ií]da|hor[aá]rio\s+do\s+check-?out|limite\s+de\s+sa[ií]da|\bcheck[- ]?out\b|\bsa[ií]da\b)/i.test(text) && !asksExtension;
  const asksCheckin = /(?:check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada)/i.test(text) && !/pr[eé]-?check-?in/i.test(text);
  const asksWifi = /(?:wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar)/i.test(text);
  const asksGarage = /(?:garagem|estacionamento|vaga\s*(?:de\s+garagem|para\s+carro|de\s+estacionamento|rotativa|coberta)|onde\s+estacionar|posso\s+(?:guardar|parar|estacionar)\s+o\s+carro)/i.test(text);
  const asksBreakfast = /(?:caf[eé]|desjejum)/i.test(text) && !isPricingOrQuoteInquiry(text);
  const asksPet = /(?:pet|cachorro|animal|gato)/i.test(text);
  const asksLeisure = /(?:piscina|jacuzzi|academia|cobertura|lazer|hidro)/i.test(text);
  const asksSmoking = /(?:fumo|fumar|cigarro|fumante)/i.test(text);
  const asksLocation = /(?:endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar|mapa)/i.test(text);

  const topicMatches = [
    Boolean(asksCheckout || asksCheckoutTime),
    Boolean(asksCheckin),
    Boolean(asksExtension),
    Boolean(asksWifi),
    Boolean(asksGarage),
    Boolean(asksBreakfast),
    Boolean(asksPet),
    Boolean(asksLeisure),
    Boolean(asksSmoking),
    Boolean(asksLocation)
  ].filter(Boolean);

  if (topicMatches.length >= 2) {
    const parts = [];

    // Check-out
    if (asksCheckout || asksCheckoutTime) {
      const checkoutGuide = activeGuidelines.find(g =>
        (g.category === "checkout" || (g.text || "").toLowerCase().includes("check-out")) &&
        !/(?:estender|prorroga|prolongar)/i.test(g.text || "")
      );
      if (checkoutGuide && !asksCheckoutTime) {
        parts.push(`Sobre o check-out: ${checkoutGuide.text}`);
      } else if (checkoutGuide && asksCheckoutTime && /(?:12:00|12h|hor[aá]rio)/i.test(checkoutGuide.text)) {
        parts.push(`Sobre o check-out: ${checkoutGuide.text}`);
      } else {
        parts.push("O horário padrão de check-out é até as 12:00h (desocupação e entrega das chaves/cartão na portaria).");
      }
    }
    // Check-in
    if (asksCheckin) {
      const checkinGuide = activeGuidelines.find(g => g.category === "checkin" || (g.text || "").toLowerCase().includes("check-in"));
      if (checkinGuide) {
        parts.push(`Sobre o check-in: ${checkinGuide.text}`);
      } else {
        parts.push("O horário padrão de check-in inicia a partir das 14:00h (com early check-in gratuito a partir das 10h para reservas diretas, mediante disponibilidade de liberação pela governança).");
      }
    }
    // Extensão de estadia pelo WhatsApp
    if (asksExtension) {
      const extGuide = activeGuidelines.find(g => /(?:estender|prorroga|prolongar)/i.test(g.text || "") || g.category === "checkout");
      if (extGuide) {
        const cleanGuide = extGuide.text.toLowerCase().startsWith("é possível")
          ? `E sim, ${extGuide.text.charAt(0).toLowerCase() + extGuide.text.slice(1)}`
          : `E sim, é possível estender: ${extGuide.text}`;
        parts.push(cleanGuide);
      } else {
        parts.push("E sim, é possível solicitar a prorrogação ou extensão da sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat.");
      }
    }
    // Wi-Fi
    if (asksWifi) {
      const flatNum = guestContext?.flatNumber || "";
      const netName = flatNum ? `apto ${flatNum}` : "apto {número do flat}";
      parts.push(`Sobre a internet: cada flat possui Wi-Fi veloz individual (Rede: ${netName} | Senha: \`${kb.wifiPassword || "1234567890123"}\`).`);
    }
    // Garagem
    if (asksGarage) {
      const garageGuide = activeGuidelines.find(g => g.category === "garagem" || /garagem|estacionamento|vaga/i.test(g.text || ""));
      if (garageGuide) {
        parts.push(`Sobre o estacionamento: ${garageGuide.text}`);
      } else {
        parts.push("Sobre o estacionamento: dispomos de 1 vaga rotativa coberta e gratuita no condomínio Soho (basta cadastrar a placa no seu Pré-Check-in Digital para liberação na portaria 24h).");
      }
    }
    // Café da manhã
    if (asksBreakfast) {
      const cafeGuide = activeGuidelines.find(g => g.category === "cafe" || (g.text || "").toLowerCase().includes("café"));
      if (cafeGuide) {
        parts.push(`Quanto ao café da manhã: ${cafeGuide.text}`);
      } else {
        parts.push("Quanto ao café da manhã: é servido em deliciosa bandeja diretamente no seu quarto das 05:00 às 09:30, com escolha de itens pelo portal até a véspera.");
      }
    }
    // Pet
    if (asksPet) {
      const petGuide = activeGuidelines.find(g => g.category === "pet" || (g.text || "").toLowerCase().includes("pet"));
      if (petGuide) {
        parts.push(`Sobre animais: ${petGuide.text}`);
      } else {
        parts.push("Sobre animais: aceitamos cães de pequeno porte (até 10kg) com todo carinho, mediante taxa adicional de diária e normas condominiais.");
      }
    }
    // Lazer
    if (asksLeisure) {
      const leisureGuide = activeGuidelines.find(g => g.category === "lazer" || /(?:piscina|academia|jacuzzi)/i.test(g.text || ""));
      if (leisureGuide) {
        parts.push(`Sobre o lazer: ${leisureGuide.text}`);
      } else {
        parts.push("Sobre o lazer: nossa piscina/jacuzzi aquecida e academia na cobertura funcionam diariamente das 06:00 às 22:00 exclusivamente para hóspedes.");
      }
    }
    // Fumo
    if (asksSmoking) {
      const smokingGuide = activeGuidelines.find(g => g.category === "fumo" || /fumo|fumar|cigarro/i.test(g.text || ""));
      if (smokingGuide) {
        parts.push(`Sobre fumo: ${smokingGuide.text}`);
      } else {
        parts.push("Sobre fumo: nossas acomodações são 100% livres de fumo, sendo estritamente proibido fumar dentro dos flats e áreas comuns fechadas.");
      }
    }
    // Localização
    if (asksLocation) {
      parts.push(`Nosso endereço é: ${kb.address} (Centro de Campos dos Goytacazes - RJ).`);
    }

    if (parts.length >= 2) {
      let compoundBody = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (/^(?:sobre|quanto|e\s+sim|al[eé]m)/i.test(p)) {
          compoundBody += `\n\n${p}`;
        } else {
          compoundBody += `\n\nAlém disso, ${p.charAt(0).toLowerCase() + p.slice(1)}`;
        }
      }
      const closing = asksExtension
        ? "\n\nCaso queira prorrogar sua estadia, por favor me informe até que data gostaria de ficar para verificarmos a disponibilidade! 🏨✨"
        : "\n\nQualquer dúvida adicional ou solicitação, estou à inteira disposição! 🏨✨";
      return ret(`${greetingSalutation} ${compoundBody}${closing}`);
    }
  }

  // 0.D Diretrizes do Desenvolvedor para Tópicos Individuais (Prioridade Máxima se houver diretriz)
  if (activeGuidelines.length > 0) {
    // 0.D.1 Café da manhã (apenas se NÃO for consulta de cotação/preço de diária)
    if (/caf[eé]|desjejum/i.test(text) && !isPricingOrQuoteInquiry(text)) {
      const cafeGuideline = activeGuidelines.find(g => g.category === "cafe" || (g.text || "").toLowerCase().includes("café"));
      if (cafeGuideline) {
        return ret(`${greetingSalutation} 🥐☕ ${cafeGuideline.text}\n\nPara agendar sua bandeja e escolher os itens do café da manhã, acesse o link do Portal do Hóspede até a véspera! ✨`);
      }
    }

    // 0.D.2 Check-in / Horário de Entrada
    if (/check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada/i.test(text) && !/pr[eé]-?check-?in/i.test(text)) {
      const checkinGuideline = activeGuidelines.find(g => g.category === "checkin" || (g.text || "").toLowerCase().includes("check-in"));
      if (checkinGuideline) {
        return ret(`${greetingSalutation} ${checkinGuideline.text} 🔑`);
      }
    }

    // 0.D.3 Pet / Animais
    if (/pet|cachorro|animal/i.test(text)) {
      const petGuideline = activeGuidelines.find(g => g.category === "pet" || (g.text || "").toLowerCase().includes("pet"));
      if (petGuideline) {
        return ret(`${greetingSalutation} 🐾 ${petGuideline.text}`);
      }
    }

    // 0.D.4 Pergunta sobre Extensão de Reserva via WhatsApp / Prorrogação (Individual)
    if (asksExtension && !isPricingOrQuoteInquiry(text)) {
      const extGuide = activeGuidelines.find(g => /(?:estender|prorroga|prolongar)/i.test(g.text || "") || /(?:estender|prorroga)/i.test(g.category || ""));
      if (extGuide) {
        const gText = extGuide.text;
        const phrase = gText.toLowerCase().startsWith("é possível")
          ? `É possível ${gText.replace(/^é possível\s*/i, "")}`
          : gText;
        return ret(`${greetingSalutation} Sim! ${phrase} Caso queira estender sua estadia, por favor me informe até que data gostaria de permanecer para verificarmos para você! 🏨✨`);
      }
    }

    // 0.D.5 Check-out / Saída / Horário simples (Individual)
    if (classifyUnmetDemand(text).category !== "checkout_comunicacao" && /check[- ]?out|sa[ií]da|desocup|late\s+check[- ]?out/i.test(text) && !asksExtension) {
      const checkoutGuideline = activeGuidelines.find(g =>
        (g.category === "checkout" || (g.text || "").toLowerCase().includes("check-out") || (g.text || "").toLowerCase().includes("checkout")) &&
        !/(?:estender|prorroga|prolongar)/i.test(g.text || "")
      );
      if (checkoutGuideline) {
        const isCheckoutAlreadyDone = Boolean(guestContext?.isCheckoutCompleted || guestContext?.stayStatus === "checkout_concluido");
        const appOrigin = activeDb?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || kb.siteUrl || "https://corpflats.com.br";
        const checkoutUrl = !isCheckoutAlreadyDone ? (guestContext?.checkoutUrl || (guestContext?.reservation?.code ? `${appOrigin}/checkout/${guestContext.reservation.code}` : "")) : "";
        const linkMsg = checkoutUrl ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
        return ret(`${greetingSalutation} ${checkoutGuideline.text}${linkMsg}`);
      }
    }

    // 0.D.6 Outras Diretrizes Aprendidas Dinâmicas (Correspondência Semântica por Tokens e Pergunta Original)
    for (const g of activeGuidelines) {
      if (!g || !g.text || g.active === false) continue;

      const gNorm = (g.text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ");
      const qClean = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ");
      const qTokens = qClean.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));
      const gTokens = gNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));

      const commonTokens = qTokens.filter(t => gTokens.includes(t));
      const nonGenericCommon = commonTokens.filter(t => !GENERIC_COMMON_WORDS.has(t));

      let origQMatch = false;
      if (g.question) {
        const origQNorm = (g.question || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ");
        const origQTokens = origQNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));
        const sharedQTokens = qTokens.filter(t => origQTokens.includes(t));
        if (sharedQTokens.length >= 2 || (sharedQTokens.length === 1 && (origQTokens.length <= 2 || sharedQTokens[0].length >= 4))) {
          origQMatch = true;
        }
      }

      const isSpecificMatch = nonGenericCommon.length >= 2 || origQMatch || (nonGenericCommon.length === 1 && (qTokens.length <= 2 || nonGenericCommon[0].length >= 4));

      if (isSpecificMatch) {
        return ret(`${greetingSalutation} ${g.text}`);
      }
    }
  }

  // 0.E Fallback para Extensão de Reserva se ainda não houver diretriz cadastrada
  if (asksExtension && asksCheckoutTime) {
    return ret(`${greetingSalutation} O horário de check-out é até as 12:00h. E sim, é possível estender e prorrogar a sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat! Caso queira prorrogar, por favor me informe até que data gostaria de ficar! 🏨✨`);
  }
  if (asksExtension && !isPricingOrQuoteInquiry(text)) {
    return ret(`${greetingSalutation} Sim! É possível solicitar a extensão ou prorrogação da sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat! 🏨✨ Para verificar, por favor me informe até que data gostaria de ficar.`);
  }

  // Extrai e filtra itens de FAQ ativos e aplicáveis ao cliente
  let candidateFaqs = [];
  if (Array.isArray(dbOrFaqs)) {
    candidateFaqs = dbOrFaqs;
  } else if (dbOrFaqs && typeof dbOrFaqs === "object") {
    const raw = dbOrFaqs.faqItems || dbOrFaqs.knowledgeBaseFaq || [];
    candidateFaqs = Array.isArray(raw) ? raw : [];
  } else if (aiConfig && Array.isArray(aiConfig.faqItems)) {
    candidateFaqs = aiConfig.faqItems;
  } else if (typeof globalThis !== "undefined" && Array.isArray(globalThis.db?.faqItems)) {
    candidateFaqs = globalThis.db.faqItems;
  }

  const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
  const activeFaqs = candidateFaqs.filter(faq => {
    return faq && faq.status === "ativo" && isFaqApplicableToClient(faq, clientPhone);
  });

  // Base Dinâmica de FAQs Ativas (Prioridade Máxima para Perguntas, Variações e Palavras-chave Oficiais)
  if (activeFaqs.length > 0) {
    const cleanQuery = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .trim();
    const queryTokens = cleanQuery.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));

    let bestFaq = null;
    let highestScore = 0;

    for (const faq of activeFaqs) {
      if (isPricingOrQuoteInquiry(text) && isOperationalNonPricingFaq(faq)) {
        continue;
      }
      let score = 0;
      const qNorm = (faq.question || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .trim();
      const qTokens = qNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));

      // Coincidência com pergunta principal (match dominante)
      if (cleanQuery.includes(qNorm) || (qNorm.length > 5 && qNorm.includes(cleanQuery))) {
        score += 200;
      } else {
        const commonWithQ = qTokens.filter(t => queryTokens.includes(t));
        if (commonWithQ.length >= 2) {
          score += commonWithQ.length * 25;
        } else if (commonWithQ.length === 1 && qTokens.length <= 2) {
          score += 20;
        }
      }

      // Coincidência com variações da pergunta
      if (Array.isArray(faq.variations)) {
        let bestVarScore = 0;
        for (const variation of faq.variations) {
          if (!variation) continue;
          const vNorm = variation
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, " ")
            .trim();
          if (cleanQuery.includes(vNorm) || (vNorm.length > 5 && vNorm.includes(cleanQuery))) {
            bestVarScore = Math.max(bestVarScore, 150);
            break;
          }
          const vTokens = vNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));
          const common = vTokens.filter(t => queryTokens.includes(t));
          if (vTokens.length > 0 && common.length >= Math.min(2, vTokens.length)) {
            bestVarScore = Math.max(bestVarScore, 40 + (common.length * 10));
          }
        }
        score += bestVarScore;
      }

      // Coincidência com palavras-chave com boost para termos distintivos
      if (Array.isArray(faq.keywords)) {
        for (const keyword of faq.keywords) {
          if (!keyword) continue;
          const kNorm = keyword
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, " ")
            .trim();
          if (!kNorm || PORTUGUESE_STOP_WORDS.has(kNorm)) continue;

          // Boost para keywords distintivas que diferenciam temas específicos (louças/bandeja, pet, convênio, early check-in)
          const isDistinctive = [
            "loucas", "louças", "bandeja", "recolhimento", "pratos", "talheres",
            "convenio", "corporativo", "faturamento", "empresa", "tarifa corporativa",
            "pet", "pets", "cachorro", "cao", "gato", "taxa pet",
            "early check in", "early checkin", "checkin antecipado", "entrada antecipada"
          ].includes(kNorm);
          const boost = isDistinctive ? 40 : 0;

          if (kNorm.includes(" ")) {
            if (cleanQuery.includes(kNorm)) {
              score += 60 + boost;
            }
          } else if (kNorm.length >= 3) {
            if (queryTokens.includes(kNorm)) {
              score += 30 + boost;
            } else if (cleanQuery.includes(kNorm)) {
              score += 15 + Math.floor(boost / 2);
            }
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestFaq = faq;
      }
    }

    if (bestFaq && highestScore >= 50) {
      return ret(`${greetingSalutation} ${bestFaq.answer}`);
    }
  }

  // 0.68 Privacidade Financeira: Hóspede não-solicitante perguntando sobre pagamento/PIX da reserva existente
  if (
    guestContext?.hasReservation &&
    (guestContext?.hideFinancialForGuest || guestContext?.reservation?.hideFinancialForGuest) &&
    /\b(?:pix|pagamento|pagar|pago|paga|quitar|quitad[ao]|saldo|fatura|boleto|cobran[cç]a)\b/i.test(text) &&
    !isReservationBookingRequest(text)
  ) {
    const reqLabel = guestContext.requesterName || guestContext.reservation?.requesterName || "o solicitante responsável pela reserva";
    return ret(`Olá${name}! As informações financeiras e o pagamento desta reserva são tratados diretamente com *${reqLabel}* 🏨✨.\n\nPara você, posso ajudar com todas as orientações da sua estadia, como *Pré-Check-in Digital, Wi-Fi, horários de entrada/saída, garagem e café da manhã*. Como posso te ajudar? 😊`);
  }

  // 0.7 Consulta sobre Reserva Existente / Confirmação de Reserva (Prioridade para quem já tem reserva)
  const hasSpecificTopicOrOperationalDemand = (
    queryAnalysis.type === "OPERATIONAL_DEMAND" ||
    queryAnalysis.type === "HANDOVER_REQUIRED" ||
    queryAnalysis.type === "PRICING_QUOTE" ||
    queryAnalysis.type === "RESERVATION_REQUEST" ||
    Boolean(queryAnalysis.primaryTopic && !["pre_checkin", "checkin", "checkout"].includes(queryAnalysis.primaryTopic))
  );
  const isExistingReservationInquiry = !hasSpecificTopicOrOperationalDemand && (
    /(?:m[ij]nhas?\s+reservas?|minhas?\s+di[aá]rias?|minha\s+estadia)/i.test(text) ||
    /(?:reserva|estadia).*(?:confirmad[ao]|aprovad[ao]|status|certo|ok|garantid[ao]|ativa)/i.test(text) ||
    /(?:confirmad[ao]|status|certo|ok).*(?:reserva|estadia)/i.test(text) ||
    /(?:tenho|tem|existe|possui)\s+(?:alguma\s+)?reserva/i.test(text) ||
    /(?:verificar|consultar|conferir|confirmar|saber)\s+(?:minha\s+|se\s+tenho\s+|a\s+|sobre\s+(?:a\s+|minha\s+)?)?reserva/i.test(text) ||
    /(?:saber\s+sobre|dados\s+da|informa[cç][oõ]es?\s+da)\s+minha\s+reserva/i.test(text) ||
    /(?:estou\s+hospedad[ao]|j[aá]\s+estou\s+hospedad[ao])/i.test(text) ||
    /^(?:est[aá]|t[aá])\s+confirmad[ao]\??$/i.test(text)
  );

  if (isExistingReservationInquiry) {
    if (guestContext?.hasReservation && guestContext?.reservation && guestContext.reservation.status !== "cancelada" && guestContext.reservation.status !== "cancelled") {
      const r = guestContext.reservation;
      const flatStr = r.flatNumber || guestContext.flatNumber || "UH a definir";
      const checkinFmt = r.checkinDate ? formatBrDate(r.checkinDate) : "Data a confirmar";
      const checkoutFmt = r.checkoutDate ? formatBrDate(r.checkoutDate) : "Data a confirmar";
      const hideFinGuest = Boolean(guestContext?.hideFinancialForGuest || r.hideFinancialForGuest);
      const paymentStr = (r.paymentStatus === "pago_total" || r.paymentStatus === "pago") ? "Pagamento Quitado" : "Pagamento Pendente";
      const statusSuffix = hideFinGuest ? "" : ` (${paymentStr})`;
      const appOrigin = activeDb?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || kb.siteUrl || "https://corpflats.com.br";
      const checkoutUrl = guestContext.checkoutUrl || (r.code ? `${appOrigin}/checkout/${r.code}` : "");

      // 0. Check-out já concluído (estadia encerrada)
      if (guestContext.stayStatus === "checkout_concluido" || guestContext.isCheckoutCompleted) {
        return ret(`Olá${name}! Consta em nosso sistema que a sua hospedagem no *Flat ${flatStr}* (${checkinFmt} a ${checkoutFmt}) já teve o *check-out concluído* ✅.\n\nAgradecemos imensamente pela sua estadia conosco na CorpFlats! Se precisar de *Nota Fiscal (NFS-e)*, tiver esquecido algum pertence no apartamento ou desejar fazer uma *nova reserva*, estou à sua inteira disposição! 🏨✨`);
      }

      // 1. Check-out hoje (Hóspede já hospedado, hoje é a data de saída até 12:00h - NUNCA mandar pré-check-in)
      if (guestContext.stayStatus === "checkout_hoje") {
        const checkoutLinkMsg = checkoutUrl ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
        return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nLembramos que *hoje é o dia do seu check-out*, com horário limite de desocupação até as *12:00h*.${checkoutLinkMsg}\n\nCaso deseje solicitar prorrogação da estadia (late check-out) mediante disponibilidade ou se já tiver desocupado o flat, por favor me avise por aqui! Como posso te ajudar na sua saída hoje? ✨`);
      }

      // 2. Em estadia (Hóspede já hospedado, saída em data futura - NUNCA mandar pré-check-in)
      if (guestContext.stayStatus === "em_estadia") {
        return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nVocê já está acomodado(a) no *Flat ${flatStr}* com estadia prevista até *${checkoutFmt}*. Não é necessário preencher pré-check-in novamente!\n\nSe precisar de toalhas extras, orientações de Wi-Fi, agendamento de café ou qualquer outro suporte durante a sua permanência, estou à sua total disposição! ✨`);
      }

      // 3. Check-in hoje (Chegada hoje a partir das 14:00h)
      if (guestContext.stayStatus === "checkin_hoje") {
        const linkUrl = r.checkinUrl || guestContext.checkinUrl;
        const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
        return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nO seu check-in é *hoje (${checkinFmt})* a partir das 14:00h! Lembramos que para reservas diretas temos o benefício de early check-in a partir das 10h (mediante disponibilidade de higienização pela governança).${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua chegada, estou à total disposição!`);
      }

      // 4. Reserva futura
      const linkUrl = r.checkinUrl || guestContext.checkinUrl;
      const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
      return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada${statusSuffix}\n\nSua estadia está confirmada e programada para início em *${checkinFmt}*! Para agilizar sua liberação na portaria 24h, realize o seu cadastro antecipado:${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua estadia, estou à total disposição!`);
    } else {
      const displayPhone = clientPhone ? ` (*${formatPhoneDisplay ? formatPhoneDisplay(clientPhone) : clientPhone}*)` : "";
      return ret(`Olá${name}! Não localizei nenhuma reserva ativa ou futura confirmada para este número de WhatsApp${displayPhone} no nosso sistema.\n\nSe a sua reserva foi realizada em outro nome, com outro telefone ou por plataformas como Booking.com ou Airbnb, por favor me informe o seu *nome completo* ou o *código da reserva* para que eu possa verificar com a nossa equipe! 🛎️✨`);
    }
  }

  // 0.75 Solicitação ou Intenção de Nova Reserva (Booking Request & Conversational State Progression)
  if (isReservationBookingRequest(text) || (queryAnalysis.type === "RESERVATION_REQUEST")) {
    const stepResult = executeConversationalBookingStep({
      messageText: text,
      history: effectiveHistory,
      guestContext,
      db: activeDb,
      aiConfig
    });
    if (stepResult && stepResult.handled && stepResult.replyText) {
      return stepResult.replyText;
    }
  }

  // 0.8 Motor Dinâmico de Cotações, Diárias e Tarifas (Prioridade Máxima sobre comodidades e rotinas operacionais)
  const mentionsGarage = /\b(?:garagem|estacionamento|carro|ve[ií]culo|placa)\b/i.test(text);
  const isPricingOrQuote = isPricingOrQuoteInquiry(text) || (
    /(?:di[aá]rias?|preco|preço|valor|valores|tabela|or[cç]amento|disponibilidade)/i.test(text) && !mentionsGarage
  ) || (
    /\bvaga\b/i.test(text) && !mentionsGarage
  );
  if (isPricingOrQuote) {
    // 1. Extrai número de hóspedes mencionado no texto
    const isCoupleOr2 = /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(text);
    const is3Guests = /\b(?:3|tr[eê]s)\s+pessoas\b/i.test(text);
    const isExplicit1 = /\b(?:1|uma)\s+pessoa|\bsolteir[ao]\b|\bindividual\b/i.test(text);

    // 2. Extrai menção a café da manhã
    const mentionsWithBreakfast = /\b(?:com\s+caf[eé]|incluso\s+caf[eé]|incluindo\s+caf[eé]|caf[eé]\s+incluso)/i.test(text);
    const mentionsWithoutBreakfast = /\b(?:sem\s+caf[eé]|s[oó]\s+o\s+quarto|somente\s+quarto)/i.test(text);
    const isOnlyBreakfastAlone = (
      /\b(?:caf[eé]|desjejum)/i.test(text) &&
      !/\b(?:di[aá]rias?|estadia|hospedagem|quarto|flat|apto|pernoite|aluguel|alugar)/i.test(text) &&
      !isExplicit1 && !isCoupleOr2 && !is3Guests
    );

    // 2.1 Pergunta estritamente sobre o valor do café avulso (sem diária de quarto)
    if (isOnlyBreakfastAlone) {
      return ret(`${greetingSalutation} 🥐☕ O café da manhã da CorpFlats é servido exclusivamente em deliciosa bandeja personalizada com todo conforto diretamente no seu flat!\n\n• *Valor avulso:* R$ 35,00 por pessoa/dia.\n• *Dica especial:* Ao reservar sua diária diretamente conosco no plano com café incluso, você ganha o benefício exclusivo de *isenção total da taxa de limpeza*!\n\nGostaria de consultar as diárias com café para alguma data específica? ✨`);
    }

    // 2.2 Se o hóspede já informou datas concretas na pergunta de disponibilidade/preço, consulta disponibilidade e orçamento reais no PMS!
    const directDates = parseNaturalDatesFromText(text, guestContext?.todayStr);
    if (directDates && activeDb && Array.isArray(activeDb.flats) && activeDb.flats.length > 0) {
      const stepResult = executeConversationalBookingStep({
        messageText: text,
        history: effectiveHistory,
        guestContext,
        db: activeDb,
        aiConfig
      });
      if (stepResult && stepResult.handled && stepResult.replyText) {
        return stepResult.replyText;
      }
    }

    // 3. Consulta valores base no banco dinâmico
    const tSettings = activeDb?.tariffSettings || {};
    const baseDailyRate = Number(tSettings.baseDailyRate != null ? tSettings.baseDailyRate : 237);
    const breakfastFeePerson = 35;
    const cleaningFee = 70;

    // 4. Se especificou "1 pessoa com café" (pergunta exata do usuário!)
    if (isExplicit1 && mentionsWithBreakfast) {
      const withBreakfastRate = baseDailyRate + breakfastFeePerson; // 237 + 35 = 272
      if (hasRecentlySentPricingQuote(effectiveHistory)) {
        return ret(`Olá${name}! Como mencionei, para *1 pessoa com café da manhã* servido no quarto a diária fica a partir de *R$ ${withBreakfastRate},00* (com *isenção total da taxa de limpeza*!). Me informando as datas de check-in e check-out, já verifico a disponibilidade para você! 🏨✨`);
      }
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *1 pessoa com café da manhã* servido no quarto fica a partir de *R$ ${withBreakfastRate},00* (e você ainda conta com o benefício exclusivo de *isenção total da taxa de limpeza*!).\n\nSe preferir a opção sem café, a diária fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\nPara quais datas você gostaria da reserva? Me informando a entrada e saída, já verifico a disponibilidade e passo todos os detalhes! 🏨`);
    }

    // 5. Se especificou "1 pessoa sem café"
    if (isExplicit1 && mentionsWithoutBreakfast) {
      const withBreakfastRate = baseDailyRate + breakfastFeePerson; // 272
      if (hasRecentlySentPricingQuote(effectiveHistory)) {
        return ret(`Olá${name}! Conforme passei acima, a diária para *1 pessoa sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa de limpeza de R$ ${cleaningFee},00 por estadia). Me informando as datas desejadas de entrada e saída, já consulto as vagas para você! 🏨✨`);
      }
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *1 pessoa sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\n• *Opção com café no quarto:* a partir de *R$ ${withBreakfastRate},00 / diária* para 1 pessoa (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você deseja a hospedagem? Me informe a data de entrada e saída que consulto a disponibilidade! 🏨`);
    }

    // 6. Se especificou casal / 2 pessoas com café
    if (isCoupleOr2 && mentionsWithBreakfast) {
      const withBreakfastRate2 = baseDailyRate + (breakfastFeePerson * 2); // 237 + 70 = 307
      if (hasRecentlySentPricingQuote(effectiveHistory)) {
        return ret(`Olá${name}! Como mencionei, para *2 pessoas (casal) com café da manhã* servido no quarto a diária fica a partir de *R$ ${withBreakfastRate2},00* (com *isenção total da taxa de limpeza*!). Me informando as datas de check-in e check-out, já consulto a disponibilidade! 🏨✨`);
      }
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *2 pessoas (casal) com café da manhã* servido no quarto fica a partir de *R$ ${withBreakfastRate2},00* (com o benefício exclusivo de *isenção total da taxa de limpeza*!).\n\nSem café, a diária fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\nPara quais datas vocês pretendem vir? Me informe o check-in e check-out que já consulto a disponibilidade! 🏨`);
    }

    // 7. Se especificou casal / 2 pessoas sem café
    if (isCoupleOr2 && mentionsWithoutBreakfast) {
      const withBreakfastRate2 = baseDailyRate + (breakfastFeePerson * 2);
      if (hasRecentlySentPricingQuote(effectiveHistory)) {
        return ret(`Olá${name}! Conforme passei acima, a diária para *2 pessoas (casal) sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa de limpeza de R$ ${cleaningFee},00 por estadia). Me informando as datas de entrada e saída, já verifico as opções! 🏨✨`);
      }
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *2 pessoas (casal) sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\n• *Com café da manhã no quarto:* a partir de *R$ ${withBreakfastRate2},00 / diária* para o casal (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você gostaria da reserva? Me informe o período desejado! 🏨`);
    }

    // 8. Se mencionou "com café" genérico (sem quantidade explícita de pessoas)
    if (mentionsWithBreakfast) {
      const rate1 = baseDailyRate + breakfastFeePerson; // 272
      const rate2 = baseDailyRate + (breakfastFeePerson * 2); // 307
      if (hasRecentlySentPricingQuote(effectiveHistory)) {
        return ret(`Olá${name}! Nossas diárias com *café da manhã no quarto* e isenção da taxa de limpeza são *R$ ${rate1},00* (1 pessoa) ou *R$ ${rate2},00* (casal). Me informe para quantas pessoas e as datas de check-in e check-out que já verifico a disponibilidade! 🏨✨`);
      }
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, nossas diárias com *café da manhã incluso servido no flat* são a partir de:\n• *1 pessoa:* a partir de *R$ ${rate1},00 / diária*\n• *2 pessoas (casal):* a partir de *R$ ${rate2},00 / diária*\n\n🎁 *Grande benefício:* No plano com café incluso, você tem *isenção total da taxa de limpeza*!\n(Na opção sem café, a diária base é a partir de R$ ${baseDailyRate},00 + taxa única de limpeza de R$ ${cleaningFee},00).\n\nPara qual período você planeja a sua estadia? Me informe as datas de entrada e saída que já verifico as vagas! 🏨`);
    }

    // 9. Se mencionou "sem café" genérico
    if (mentionsWithoutBreakfast) {
      const rate1 = baseDailyRate + breakfastFeePerson;
      if (hasRecentlySentPricingQuote(effectiveHistory)) {
        return ret(`Olá${name}! A diária *sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia). Me informando as datas de check-in e check-out e quantas pessoas serão, verifico as vagas agora mesmo! 🏨✨`);
      }
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária de acomodação completa *sem café* é a partir de *R$ ${baseDailyRate},00 / diária* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\n• *Com café da manhã no flat:* a partir de *R$ ${rate1},00 / diária* para 1 pessoa (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você precisa da hospedagem? Me informe a data de entrada e saída que consulto a disponibilidade! 🏨`);
    }

    // 10. Pergunta genérica de diária / valores / cotação
    const rate1 = baseDailyRate + breakfastFeePerson; // 272
    const rate2 = baseDailyRate + (breakfastFeePerson * 2); // 307
    if (hasRecentlySentPricingQuote(effectiveHistory)) {
      return ret(`Olá${name}! Como mencionei acima, nossas diárias são a partir de *R$ ${baseDailyRate},00* sem café ou *R$ ${rate1},00* com café no quarto (isenção da taxa de limpeza). Me informando as datas desejadas de check-in e check-out e quantas pessoas serão, verifico a disponibilidade exata agora mesmo! 🏨✨`);
    }
    return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de:\n\n• *Sem café:* a partir de *R$ ${baseDailyRate},00 / diária* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia)\n• *Com café da manhã no quarto:* a partir de *R$ ${rate1},00 / diária* (1 pessoa) ou *R$ ${rate2},00 / diária* (casal), com *isenção total da taxa de limpeza*! 🥐☕\n\nDispomos de flats com cozinha completa, ar Split, Wi-Fi veloz e garagem no melhor ponto de Campos/RJ.\n\nQual período você pretende se hospedar e para quantas pessoas? Me informando as datas de entrada e saída, já verifico a disponibilidade em tempo real para você! 🏨`);
  }

  // 1. Wi-Fi / Internet
  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar/i.test(text)) {
    const flatNum = guestContext?.flatNumber || "";
    const netName = flatNum ? `apto ${flatNum}` : "apto {número do seu flat}";
    return ret(`${greetingSalutation} 📶 Cada flat possui sua própria rede Wi-Fi exclusiva para máxima estabilidade e velocidade:\n\n• *Nome da Rede:* ${netName}\n• *Senha:* \`${kb.wifiPassword || "1234567890123"}\`\n\nCaso tenha qualquer dificuldade para conectar, certifique-se de digitar a senha com atenção. Estamos à disposição! ✨`);
  }

  // 2. Café da Manhã (verificado antes de termos genéricos de acomodação)
  if (/caf[eé]|desjejum/i.test(text)) {
    if (/card[aá]pio|itens|o\s+que\s+tem|op[cç][oõ]es/i.test(text)) {
      return ret(`${greetingSalutation} 🥐☕ Nosso café da manhã é servido pontualmente no seu quarto das *05:00 às 09:30* em deliciosa bandeja.\n\nO cardápio padrão inclui:\n• *Bebidas:* Café, café com leite, leite e suco natural de laranja\n• *Pães:* Pão francês quentinho e pão de queijo\n• *Frios & Quentes:* Queijo mussarela, presunto e ovos mexidos\n• *Complementos & Doces:* Manteiga, bolo do dia e frutas frescas (mamão, maçã ou banana).\n\nPara agendar o horário e personalizar sua bandeja, basta acessar o link do Café no seu Portal do Hóspede até a véspera! ✨`);
    }

    const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
    const roomNum = guestContext?.flatNumber;
    const orders = Array.isArray(activeDb?.breakfastOrders) ? activeDb.breakfastOrders : [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrder = orders.find(o =>
      (o.date === todayStr || !o.date) &&
      ((roomNum && String(o.roomNumber) === String(roomNum)) || (clientPhone && cleanWhatsAppPhone(o.phone) === cleanWhatsAppPhone(clientPhone)))
    );

    if (todayOrder) {
      return ret(`${greetingSalutation} 🥐☕ Localizamos o seu pedido de café da manhã para o Flat ${todayOrder.roomNumber || roomNum}! A entrega na bandeja está agendada para às *${todayOrder.deliveryTime || "07:00"}h* no seu quarto. Tenha um excelente dia! ✨`);
    }

    return ret(`${greetingSalutation} 🥐☕ ${kb.breakfastInfo}\n\nPara agendar sua bandeja e escolher os itens do café da manhã, acesse o link do Portal do Hóspede até a véspera! ✨`);
  }

  // 3. Garagem / Estacionamento / Carro
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa/i.test(text)) {
    const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
    const roomNum = guestContext?.flatNumber;
    const auths = Array.isArray(activeDb?.garageAuthorizations) ? activeDb.garageAuthorizations : [];
    const resVeh = guestContext?.reservation?.vehicle;

    const matchedAuth = auths.find(a =>
      (roomNum && String(a.flatNumber) === String(roomNum)) ||
      (clientPhone && cleanWhatsAppPhone(a.phone) === cleanWhatsAppPhone(clientPhone)) ||
      (resVeh?.plate && String(a.plate).toUpperCase() === String(resVeh.plate).toUpperCase())
    );

    if (matchedAuth || resVeh?.plate) {
      const plate = matchedAuth?.plate || resVeh?.plate;
      const model = matchedAuth?.model || resVeh?.model || "veículo";
      return ret(`${greetingSalutation} 🚗 Ótima notícia! O seu veículo (*${model} - Placa ${plate}*) já consta com liberação ativa na portaria 24h do condomínio Soho! Dispomos de 1 vaga rotativa gratuita coberta. Qualquer dúvida ao chegar, basta se identificar na portaria! ✨`);
    }

    return ret(`${greetingSalutation} 🚗 ${kb.garageInfo}\n\nSe ainda não informou os dados do veículo, acesse seu Pré-Check-in Digital ou envie por aqui a *Placa, Modelo e Cor* que já providenciamos a autorização com a portaria!`);
  }

  // 3.1 Achados e Perdidos / Objetos Esquecidos
  if (/(?:achad[ao]s?\s+e\s+perdid[ao]s?|esquec(?:i|eu|emos|ido)|perdi\s+(?:meu|minha|um|uma)|deixei\s+(?:no\s+quarto|no\s+flat|l[aá])|objeto\s+esquecido)/i.test(text)) {
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    const lostList = Array.isArray(activeDb?.lostAndFound) ? activeDb.lostAndFound : [];
    if (flatNum) {
      const foundItem = lostList.find(i => String(i.flatNumber) === String(flatNum) && i.status !== "devolvido");
      if (foundItem) {
        return ret(`${greetingSalutation} 🔍 Localizamos um item registrado para o Flat ${flatNum}: *${foundItem.description}* (local: ${foundItem.locationInRoom || "apartamento"}). O objeto está guardado com total segurança pela nossa equipe. Nossa recepção dará continuidade com você por aqui para combinar a retirada ou envio! 🧳✨`);
      }
    }
    return ret(`${greetingSalutation} 🧳 Todos os objetos encontrados nos apartamentos são catalogados e guardados com segurança pela nossa equipe de governança. Poderia nos informar qual item foi esquecido e o número do seu flat? Nossa equipe da recepção verificará imediatamente no sistema! 🔍✨`);
  }

  // 3.2 Manutenção / Reparos / Ordens de Serviço
  if (/(?:manuten[cç][aã]o|conserto|reparo|defeito|estragad[ao]|n[aã]o\s+(?:est[aá]\s+)?funcionando|quebrad[ao]|ar\s+(?:n[aã]o\s+gela|pingando)|chuveiro\s+(?:frio|n[aã]o\s+esquenta|queimado)|l[aâ]mpada\s+queimada|vazamento|ordem\s+de\s+servi[cç]o)\b/i.test(text)) {
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    const serviceOrders = Array.isArray(activeDb?.serviceOrders) ? activeDb.serviceOrders : [];
    if (flatNum) {
      const activeOrder = serviceOrders.find(so =>
        so.status === "active" && Array.isArray(so.flats) &&
        so.flats.some(sf => String(sf.flatNumber) === String(flatNum) && sf.status !== "done")
      );
      if (activeOrder) {
        return ret(`${greetingSalutation} 🛠️ Identificamos que já existe um chamado de manutenção aberto para o Flat ${flatNum} (*${activeOrder.title}*). Nossa equipe técnica já está atuando para normalizar o item com a maior brevidade possível! Caso precise de algo adicional, estamos à disposição! 🛎️`);
      }
    }
    return ret(`${greetingSalutation} 🛠️ Lamentamos pelo inconveniente! Já registrei o chamado de manutenção para a nossa equipe técnica e recepção cuidarem do conserto com prioridade. Se puder nos dar mais detalhes do problema e o número do seu flat, agilizaremos o atendimento imediatamente! 🛎️✨`);
  }

  // 3.3 Regras Gerais do Condomínio, Silêncio, Visitas e Convivência
  if (/(?:regras?|normas?|condom[ií]nio|regulamento|sil[eê]ncio|barulho|visitas?|receber\s+visita|visitante)/i.test(text)) {
    if (/(?:sil[eê]ncio|barulho|m[uú]sica\s+alta|som\s+alto)/i.test(text)) {
      return ret(`${greetingSalutation} 🤫 O condomínio Soho Residence preza pelo descanso de todos os hóspedes:\n\n• *Horário de Silêncio:* Das 22:00h às 08:00h.\n• Pedimos manter TV, som e conversas em volume suave nos flats e corredores durante todo o dia, especialmente após as 22h.\n\nContamos com a sua colaboração para uma estadia tranquila! ✨`);
    }

    if (/(?:visitas?|receber\s+visita|visitante|amigo|familiar)/i.test(text)) {
      return ret(`${greetingSalutation} 👥 Para a segurança de todos os moradores e hóspedes do condomínio Soho:\n\n• Todas as visitas devem ser informadas com antecedência à recepção/portaria com documento com foto (RG/CPF).\n• A permanência de visitantes para pernoite é restrita à capacidade máxima do flat e sujeita a taxa adicional.\n• As áreas de lazer da cobertura (piscina e academia) são de uso *exclusivo dos hóspedes cadastrados* na reserva (não permitida entrada de visitantes externos).\n\nQualquer dúvida, nossa recepção está à disposição! 🛎️`);
    }

    return ret(`${greetingSalutation} 📋 Conheça as principais regras e normas de convivência do condomínio Soho Residence:\n\n• *Check-in/Check-out:* Entrada a partir das 14h e saída até as 12h.\n• *Silêncio:* Das 22h às 08h em todos os apartamentos e áreas comuns.\n• *Lazer:* Piscina aquecida e academia na cobertura funcionam diariamente das 06:00 às 22:00 exclusivamente para hóspedes.\n• *Garagem:* 1 vaga rotativa coberta e gratuita por flat (necessário cadastrar placa no Pré-Check-in Digital).\n• *Fumo:* Proibido fumar no interior dos apartamentos (área 100% não fumante).\n• *Pets:* Permitido cães de pequeno porte (até 10kg) mediante prévia autorização e taxa.\n\nEstamos sempre à disposição para tornar sua estadia maravilhosa! 🏨✨`);
  }

  // 4. Localização / Endereço / Onde fica
  if (/endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar|mapa/i.test(text)) {
    return ret(`${greetingSalutation} 📍 Estamos localizados no *${kb.address}*.\n\nLocalização privilegiada no Centro de Campos dos Goytacazes! Se precisar de instruções de rota ou localização no Google Maps, nos avise. 🏨`);
  }

  // 5. Check-in / Horário de Entrada
  if (/check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada/i.test(text) && !/check-?in\s+(?:online|digital)|pr[eé]-?check-?in|ficha(?:\s+de\s+check-?in)?|link(?:\s+do|\s+de)?\s+check-?in/i.test(text)) {
    return ret(`${greetingSalutation} O horário padrão de check-in é a partir das *${kb.checkinTime}* 🔑.\n\nPara reservas diretas, o early check-in a partir das 10h é gratuito mediante disponibilidade de liberação pela governança.`);
  }

  // 5.1 Check-out / Horário de Saída
  if (/check-?out|sa[ií]da|hor[aá]rio\s+de\s+sa[ií]da|que\s+horas\s+sair|deixar\s+a\s+chave/i.test(text)) {
    if ((guestContext?.stayStatus === "checkout_concluido" || guestContext?.isCheckoutCompleted) && !asksCheckoutTime) {
      const flatStr = guestContext?.flatNumber ? ` do *Flat ${guestContext.flatNumber}*` : "";
      return ret(`${greetingSalutation} O seu check-out${flatStr} já consta como *concluído* em nosso sistema ✅! Agradecemos muito pela sua estadia conosco na CorpFlats. Caso precise de Nota Fiscal (NFS-e) ou qualquer outro auxílio, estou à inteira disposição! 🏨✨`);
    }
    return ret(`${greetingSalutation} O horário padrão de check-out é até às *${kb.checkoutTime}* ⏰.\n\nPara fazer a saída, pedimos que desligue ar-condicionado e luzes e entregue as chaves/cartão na portaria do condomínio. Caso necessite de late check-out, fale conosco com antecedência! 🙏`);
  }

  // 6. Status do Quarto / Posso entrar? / Está pronto?
  if (/(?:quarto|flat|apartamento|chave|porta).*(?:pront|liberad|limp|entrar|chegand)|(?:pront|liberad).*(?:quarto|flat|apartamento)|posso\s+(?:entrar|ir)|senha\s+da\s+porta|chegando/i.test(text)) {
    if (guestContext.stayStatus === "checkin_hoje") {
      if (guestContext.isRoomReady) {
        return ret(`Ótima notícia${name}! 🎉 O seu *Flat ${guestContext.flatNumber}* já está *100% limpo, higienizado e pronto* para te receber! Ao chegar, basta se identificar na portaria com seu documento para a liberação da chave. Seja muito bem-vindo(a)! 🏨🔑`);
      } else {
        return ret(`${greetingSalutation} O seu *Flat ${guestContext.flatNumber}* está sendo finalizado com todo carinho pela nossa governança para garantir máxima higiene e conforto ✨. O horário oficial de entrada é a partir das *${kb.checkinTime}*. Assim que a limpeza for 100% liberada pela equipe, nós te avisaremos por aqui imediatamente! 🕒`);
      }
    }
    if (guestContext.stayStatus === "em_estadia") {
      return ret(`${greetingSalutation} Você está acomodado(a) no *Flat ${guestContext.flatNumber}*. Caso precise de alguma manutenção, toalhas extras ou limpeza durante a estadia, é só nos avisar por aqui que cuidaremos para você! 🛎️`);
    }
  }

  // 7.5 Pré-Check-in / Link de Check-in
  if (/check-?in\s+online|pr[eé]-?check-?in|ficha(?:\s+de\s+check-?in)?|link(?:\s+do|\s+de)?\s+check-?in/i.test(text)) {
    if (guestContext.checkinUrl) {
      return ret(`${greetingSalutation} Você pode realizar o seu Pré-Check-in Digital pelo link seguro abaixo:\n👉 ${guestContext.checkinUrl}\n\nO preenchimento antecipado garante a liberação rápida da portaria na sua chegada! Qualquer dúvida, conte conosco. 🏨✨`);
    }
  }

  // 8. Saudação Genérica Natural (Escuta Ativa sem presunção e sem oferta de malas)
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!., ]*$/i.test(text)) {
    const lower = text.toLowerCase().trim();
    let greetingWord = "Olá";
    if (lower.startsWith("bom dia")) greetingWord = "Bom dia";
    else if (lower.startsWith("boa tarde")) greetingWord = "Boa tarde";
    else if (lower.startsWith("boa noite")) greetingWord = "Boa noite";
    return ret(`${greetingWord}${name}! Tudo bem? Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊`);
  }

  // 7.8 Comodidades Específicas dos Flats (Split, Micro-ondas, Casal, Cama Inteira, Solteiro, etc.)
  if (/(?:split|ar[- ]?split)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const splitFlats = searchFlatsByAmenities(activeDb, { split: true });
    const numbers = splitFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Os nossos flats equipados com ar-condicionado Split potente são: ${numbers || "113, 313, 712, 904 e 905"} ❄️. Deseja verificar disponibilidade para alguma data específica?`);
  }

  if (/(?:micro[- ]?ondas)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const microFlats = searchFlatsByAmenities(activeDb, { hasMicrowave: true });
    const numbers = microFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Nossos flats dispõem de cozinha compacta equipada com micro-ondas e frigobar para sua total praticidade 🍽️⚡ (especialmente os flats: ${numbers || "113, 408, 511, 712"}).`);
  }

  if (/(?:cama\s+de\s+casal|cama\s+casal|cama\s+inteira|cama_inteira)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const casalFlats = searchFlatsByAmenities(activeDb, { bedType: "casal" });
    const numbers = casalFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Nossos flats com cama inteira / casal são: ${numbers || "113, 211, 408, 509, 511, 907"} 🛏️.`);
  }

  if (/(?:2\s+camas?|duas\s+camas?|cama\s+solteiro|camas?\s+de\s+solteiro|solteiro)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const solteiroFlats = searchFlatsByAmenities(activeDb, { bedType: "solteiro" });
    const numbers = solteiroFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Nossos flats com duas camas de solteiro (twin) são: ${numbers || "114, 212, 215, 313, 512, 605, 712, 715, 1004, 1304"} 🛏️🛏️.`);
  }

  // 7.8b Frigobar e Consumo no Flat
  if (queryAnalysis.type !== "OPERATIONAL_DEMAND" && /frigobar|minibar|água\s+no\s+quarto|agua\s+no\s+quarto|bebida.*quarto|snack|nespresso/i.test(text)) {
    const minibarLinkPart = guestContext?.minibarUrl ? `\n\n👉 Acesse o cardápio e autoatendimento pelo link:\n${guestContext.minibarUrl}` : "";
    return ret(`${greetingSalutation} 🧊 *Frigobar no Flat:*\n\nTodos os nossos flats contam com frigobar abastecido em parceria com a Anserve! Oferecemos cortesia de 1 kit de boas-vindas por estadia (cápsulas Nespresso e doces) e você pode consumir águas, refrigerantes, cervejas e snacks com total comodidade e pagamento direto via PIX ou Cartão.${minibarLinkPart}`);
  }

  // 7.9 Comodidades e Estrutura Geral dos Flats
  if (queryAnalysis.type !== "OPERATIONAL_DEMAND" && /micro[- ]ondas|frigobar|cafeteira|cooktop|fog[aã]o|cozinha|utens[ií]lio|smart\s*tv|tv|televis[aã]o|cama|enxoval|toalha|len[cç]ol|roupa\s+de\s+cama|ar[- ]condicionado|ar\s+split|comodidade/i.test(text)) {
    return ret(`${greetingSalutation} ✨ Todos os nossos flats dispõem de: ${kb.amenities}`);
  }

  // 7.10 Animais e Pets
  if (/pet|cachorro|animal|gato/i.test(text)) {
    return ret(`${greetingSalutation} 🐾 ${kb.petPolicy}`);
  }

  // 7.11 Lazer, Cobertura, Piscina e Academia
  if (/piscina|jacuzzi|academia|cobertura|lazer|hidro/i.test(text)) {
    return ret(`${greetingSalutation} 🏊‍♂️ ${kb.leisureInfo || "Piscina/jacuzzi aquecida e academia na cobertura das 06:00 às 22:00 para uso exclusivo dos hóspedes."}`);
  }

  // 7.12 Fumo e Cigarro
  if (/fumo|fumar|cigarro|fumante/i.test(text)) {
    return ret(`${greetingSalutation} 🚭 ${kb.smokingPolicy}`);
  }

  // 7.13 Solicitação de Troca de Quarto / Remanejamento
  if (/(?:trocar|mudar|alterar)\s+(?:de\s+)?(?:flat|quarto|apartamento)\b/i.test(text) || /(?:pode\s+me\s+colocar|quero\s+ficar|prefiro\s+o)\s+(?:no\s+)?(?:flat|quarto|apto)?\s*(\d{3,4})\b/i.test(text)) {
    const targetMatch = text.match(/\b(\d{3,4})\b/);
    const targetFlatNum = targetMatch ? targetMatch[1] : null;
    const res = guestContext?.reservation;
    if (res && targetFlatNum) {
      const botSettings = getBotActionsSettings(activeDb);
      if (!botSettings.apiActionsEnabled || !botSettings.allowedActions?.reallocateReservationFlat) {
        return ret(`${greetingSalutation} Compreendo seu pedido para o Flat ${targetFlatNum}. No momento, esta ação automática está pausada no sistema para validação da nossa equipe. Já registrei sua solicitação para a recepção verificar com prioridade! 🛎️✨`);
      }

      const realloc = handleReallocateReservationFlat(activeDb, {
        reservationId: res.id,
        targetFlatNumber: targetFlatNum,
        reason: "Solicitação via WhatsApp pelo hóspede"
      });
      if (realloc.success) {
        return ret(`${greetingSalutation} ${realloc.message} 🏨✨ Seu apartamento foi atualizado para o Flat ${targetFlatNum}!`);
      } else {
        return ret(`${greetingSalutation} Compreendo seu pedido para o Flat ${targetFlatNum}. ${realloc.message} Gostaria de verificar outro apartamento disponível? 😊`);
      }
    }
  }

  // 9. Se for demanda operacional não atendida pela base de conhecimento
  if (queryAnalysis.type === "OPERATIONAL_DEMAND") {
    const demandTitle = queryAnalysis.demandClassification?.demandTitle || "esta solicitação";
    return ret(`Olá${name}! Recebi sua solicitação sobre *${demandTitle}* 🛎️. Como essa operação requer acompanhamento da nossa equipe, já registrei o seu pedido no sistema para a recepção atender você com máxima atenção! ✨`);
  }

  // 10. Se for dúvida não mapeada
  if (queryAnalysis.type === "UNKNOWN_INQUIRY") {
    return ret(`Olá${name}! Anotei sua dúvida. Como não tenho essa informação cadastrada no sistema, já registrei sua pergunta para a equipe da recepção te responder por aqui em instantes! 🛎️✨`);
  }

  // 11. Resposta padrão prestativa
  return ret(`Olá${name}! Recebi sua mensagem. Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨.\n\nPosso te ajudar com informações sobre *Wi-Fi, horários de check-in/out, status do flat, garagem, café da manhã e localização*. Como posso te ajudar? Se preferir falar com um atendente da recepção, basta me avisar! ✨`);
}

/**
 * Chama o Google Gemini com lista de candidatos e suporte multi-turn a Function Calling
 */
export async function callGeminiAi({ apiKey, systemInstruction, prompt, history = [], db, tools = [], customPrompt = false, requesterRole = "guest", requesterPhone = "" }) {
  if (!apiKey) return { ok: false, error: "Sem chave Gemini" };

  const preferredModel = String(
    db?.zapiConfig?.aiAgent?.preferredModel ||
    db?.settings?.geminiModel ||
    db?.whatsappAiSettings?.geminiModel ||
    "gemini-2.5-pro"
  ).trim();

  const rawCandidates = [
    ...(preferredModel ? [{ ver: "v1beta", model: preferredModel }] : []),
    { ver: "v1beta", model: "gemini-2.5-pro" },
    { ver: "v1beta", model: "gemini-2.5-flash" },
    { ver: "v1beta", model: "gemini-2.5-flash-lite" },
    { ver: "v1beta", model: "gemini-2.0-flash" },
    { ver: "v1beta", model: "gemini-2.0-flash-lite" },
    { ver: "v1beta", model: "gemini-1.5-pro" },
    { ver: "v1beta", model: "gemini-1.5-flash" },
    { ver: "v1", model: "gemini-1.5-flash" }
  ];

  const seenModels = new Set();
  const candidateModels = rawCandidates.filter(c => {
    const key = `${c.ver}:${c.model}`;
    if (seenModels.has(key)) return false;
    seenModels.add(key);
    return true;
  });

  // Remove duplicação caso a mensagem atual já tenha sido anexada ao final do histórico pelo webhook
  const rawHistory = Array.isArray(history) ? history.slice(-8) : [];
  const lastHistItem = rawHistory[rawHistory.length - 1];
  const cleanRawHistory = (
    lastHistItem &&
    !lastHistItem.fromMe &&
    String(lastHistItem.text || "").trim() === String(prompt || "").trim()
  ) ? rawHistory.slice(0, -1) : rawHistory;

  const formattedHistory = [];
  for (const m of cleanRawHistory) {
    const txt = String(m?.text || "").trim();
    if (!txt) continue;
    const role = m.fromMe ? "model" : "user";
    const prev = formattedHistory[formattedHistory.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text += `\n${txt}`;
    } else {
      formattedHistory.push({ role, parts: [{ text: txt }] });
    }
  }

  if (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
    formattedHistory.unshift({
      role: "user",
      parts: [{ text: "[Início do atendimento via WhatsApp]" }]
    });
  }

  const fullPrompt = customPrompt
    ? (systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt)
    : `${systemInstruction}\n\n[MENSAGEM ATUAL DO HÓSPEDE]:\n${prompt}\n\n[INSTRUÇÃO DE RESPOSTA]: Responda diretamente ao hóspede de forma concisa, educada e pronta para envio no WhatsApp.`;

  const promptOnly = customPrompt
    ? prompt
    : `[MENSAGEM ATUAL DO HÓSPEDE]:\n${prompt}\n\n[INSTRUÇÃO DE RESPOSTA]: Responda diretamente ao hóspede de forma concisa, educada e pronta para envio no WhatsApp.`;

  for (const { ver, model } of candidateModels) {
    try {
      const useNativeSysInst = ver === "v1beta" && Boolean(systemInstruction);
      const effectiveUserPrompt = useNativeSysInst ? promptOnly : fullPrompt;
      const baseContents = formattedHistory.map(turn => ({
        role: turn.role,
        parts: turn.parts.map(p => ({ ...p }))
      }));
      const lastTurn = baseContents[baseContents.length - 1];
      if (lastTurn && lastTurn.role === "user") {
        baseContents[baseContents.length - 1] = {
          role: "user",
          parts: [{ text: `${lastTurn.parts[0].text}\n\n${effectiveUserPrompt}` }]
        };
      } else {
        baseContents.push({ role: "user", parts: [{ text: effectiveUserPrompt }] });
      }

      const bodyPayload = {
        ...(useNativeSysInst ? { system_instruction: { parts: [{ text: String(systemInstruction) }] } } : {}),
        contents: baseContents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800
        }
      };

      if (Array.isArray(tools) && tools.length > 0) {
        bodyPayload.tools = tools;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        if (model === "gemini-4-argon") {
          console.log(`[WhatsApp AI] Modelo experimental "${model}" retornou HTTP ${response.status}; realizando fallback automático para gemini-2.5-pro.`);
        }
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      let currentParts = candidate?.content?.parts || [];

      let callParts = currentParts.filter(p => p.functionCall);

      if (callParts.length === 0) {
        const text = currentParts.find(p => p.text)?.text || "";
        if (text && text.trim().length > 0) {
          return { ok: true, text: text.trim(), model };
        }
        continue;
      }

      // ── Loop Multi-Turn de Execução Encadeada de Ferramentas (até 4 passos) ──
      const runningContents = [...baseContents];
      let lastFnCall = null;
      let lastActionResult = null;
      let anyRequiresHandover = false;

      for (let step = 0; step < 4 && callParts.length > 0; step++) {
        const functionResponseParts = [];

        for (const cp of callParts) {
          const fnName = cp.functionCall.name;
          const fnArgs = cp.functionCall.args || {};
          lastFnCall = { name: fnName, args: fnArgs };

          let actionResult;
          try {
            const authorizedRole = requesterRole || "guest";
            const effectivePhone = requesterPhone || fnArgs.requesterPhone || "";
            actionResult = await executeBotAction(db, fnName, {
              ...fnArgs,
              requesterRole: authorizedRole,
              requesterPhone: effectivePhone
            });
          } catch (actErr) {
            actionResult = {
              error: "ACTION_FAILED",
              action: fnName,
              requiresHandover: true,
              message: actErr.message || "Erro interno ao executar a ação do sistema."
            };
          }

          lastActionResult = actionResult;
          if (actionResult?.requiresHandover || actionResult?.error === "ACTION_DISABLED") {
            anyRequiresHandover = true;
          }

          functionResponseParts.push({
            functionResponse: {
              name: fnName,
              response: actionResult
            }
          });
        }

        runningContents.push({ role: "model", parts: currentParts });
        runningContents.push({
          role: "function",
          parts: functionResponseParts
        });

        const nextPayload = {
          ...(useNativeSysInst ? { system_instruction: { parts: [{ text: String(systemInstruction) }] } } : {}),
          contents: runningContents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800
          }
        };

        if (Array.isArray(tools) && tools.length > 0) {
          nextPayload.tools = tools;
        }

        const nextResponse = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextPayload),
          signal: AbortSignal.timeout(8000)
        });

        if (!nextResponse.ok) {
          break;
        }

        const nextData = await nextResponse.json();
        currentParts = nextData.candidates?.[0]?.content?.parts || [];
        callParts = currentParts.filter(p => p.functionCall);

        if (callParts.length === 0) {
          const finalText = currentParts.find(p => p.text)?.text || "";
          if (finalText && finalText.trim().length > 0) {
            return {
              ok: true,
              text: finalText.trim(),
              model,
              functionCall: lastFnCall,
              functionResult: lastActionResult,
              requiresHandover: anyRequiresHandover
            };
          }
          break;
        }
      }

      // Se o loop de ferramentas exigir transbordo sem texto final do modelo:
      if (anyRequiresHandover) {
        return {
          ok: true,
          text: lastActionResult?.message || "Esta operação do sistema requer acompanhamento humano. Já estou transferindo para a recepção! 🛎️",
          model,
          functionCall: lastFnCall,
          functionResult: lastActionResult,
          requiresHandover: true
        };
      }

      // Se uma ferramenta já foi executada mas a chamada final de síntese falhou, evita re-executar ações de escrita em outro modelo
      if (lastActionResult) {
        if (lastActionResult.message && typeof lastActionResult.message === "string") {
          return {
            ok: true,
            text: lastActionResult.message,
            model,
            functionCall: lastFnCall,
            functionResult: lastActionResult,
            requiresHandover: false
          };
        }
        return {
          ok: false,
          error: "Falha ao sintetizar resposta pós-ferramenta",
          functionCall: lastFnCall,
          functionResult: lastActionResult,
          requiresHandover: false
        };
      }
    } catch (e) {
      console.warn(`[Gemini WhatsApp AI] Falha no modelo ${model}:`, e.message);
      continue;
    }
  }

  return { ok: false, error: "Nenhum modelo Gemini respondeu com sucesso" };
}

/**
 * Gera a resposta completa do Agente de IA para WhatsApp
 */
export async function generateAiWhatsAppResponse({ db, phone, messageText, history = [], isCopilot = false }) {
  const aiConfig = getWhatsAppAiConfig(db);

  const conv = (db?.whatsappConversations || []).find(c => {
    const p = cleanWhatsAppPhone(c.phone);
    const target = cleanWhatsAppPhone(phone);
    return p && target && (p.endsWith(target.slice(-8)) || target.endsWith(p.slice(-8)));
  });
  const effectiveHistory = (history && Array.isArray(history) && history.length > 0)
    ? history
    : (conv?.messages || []);

  const guestContext = buildGuestContext({ db, phone, history: effectiveHistory });
  guestContext.history = effectiveHistory;

  // 1. Verifica intenção de transbordo humano
  const handoverCheck = detectHandoverIntent(messageText, aiConfig.handoverKeywords);
  if (handoverCheck.shouldHandover) {
    const handoverReply = `Com certeza! Já estou transferindo seu atendimento para a nossa equipe humana da recepção 🛎️. Um momento, por favor, logo alguém dará continuidade por aqui! 🙏`;
    return {
      shouldHandover: true,
      matchedKeyword: handoverCheck.matchedKeyword,
      replyText: handoverReply,
      guestContext,
      intent: "handover_requested"
    };
  }

  // 2. Pré-análise Agêntica (LLM-First Pre-Analysis): coleta fatos, ciclo de vida e pré-registra demandas/FAQs ANTES de redigir
  const preAnalysis = prepareAgenticPreAnalysis({
    queryText: messageText,
    guestContext,
    db,
    aiConfig,
    history: effectiveHistory
  });

  const convState = preAnalysis.convState;
  const botSettings = getBotActionsSettings(db);
  const tools = buildGeminiTools(botSettings);

  let systemActionsNotice = "";
  if (!botSettings.apiActionsEnabled) {
    systemActionsNotice = `
[STATUS DO SISTEMA: OPERAÇÕES AUTOMATIZADAS PAUSADAS]
Atenção: O acesso a operações diretas do sistema (consulta de disponibilidade em tempo real, cálculo de cotação/tarifas, geração de pagamento PIX e criação/confirmação de reservas) está TEMPORARIAMENTE DESATIVADO pela administração.
DIRETRIZES ESPECÍFICAS:
- Responda normalmente a dúvidas institucionais, localização, comodidades, horários e políticas usando a BASE DE CONHECIMENTO.
- Para qualquer solicitação de reserva, cotação, checagem de vagas ou pagamento, oriente com extrema cordialidade que as operações automatizadas estão em manutenção e que você está transferindo o contato para a equipe humana da recepção assumir com máxima atenção.
`;
  } else {
    const activeActionsList = Object.keys(botSettings.allowedActions || {}).filter(k => botSettings.allowedActions[k]).join(", ");
    systemActionsNotice = `
[STATUS DO SISTEMA: OPERAÇÕES AUTOMATIZADAS ATIVAS]
Você tem acesso a ferramentas de sistema (Function Calling) autorizadas: ${activeActionsList || "nenhuma"}.
DIRETRIZES ESPECÍFICAS:
- Use essas ferramentas de forma precisa quando o hóspede solicitar cotação, consulta de disponibilidade de datas, pré-reserva ou pagamento PIX.
- Quando o hóspede informar datas (na mensagem atual ou em mensagens anteriores da conversa) e pedir para reservar, execute checkAvailability, calculateQuote e createPreReservation para retornar o código da pré-reserva e o PIX Copia e Cola.
- Formate a resposta final com os dados retornados de maneira acolhedora, clara e pronta para leitura no WhatsApp.
`;
  }

  // 2.1 Carrega e filtra FAQs dinâmicos ativos aplicáveis ao cliente
  const allFaqItems = Array.isArray(db?.faqItems)
    ? db.faqItems
    : (Array.isArray(db?.knowledgeBaseFaq) ? db.knowledgeBaseFaq : []);

  const isPricingQuery = isPricingOrQuoteInquiry(messageText);
  const applicableFaqs = allFaqItems.filter(faq => {
    if (!faq || faq.status !== "ativo" || !isFaqApplicableToClient(faq, phone)) return false;
    if (isPricingQuery && isOperationalNonPricingFaq(faq)) return false;
    return true;
  });

  let dynamicFaqPromptSection = "";
  if (applicableFaqs.length > 0) {
    const formattedFaqs = applicableFaqs.map((faq, idx) => {
      const vars = Array.isArray(faq.variations) && faq.variations.length > 0
        ? `\n  - Variações comuns: ${faq.variations.slice(0, 3).join("; ")}`
        : "";
      const kw = Array.isArray(faq.keywords) && faq.keywords.length > 0
        ? ` (Palavras-chave: ${faq.keywords.join(", ")})`
        : "";
      return `[FAQ #${idx + 1} - Categoria: ${(faq.category || "geral").toUpperCase()}]
- Pergunta: ${faq.question}${kw}${vars}
- Resposta Oficial: ${faq.answer}`;
    }).join("\n\n");

    dynamicFaqPromptSection = `
## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):
Abaixo estão as perguntas e respostas oficiais da CorpFlats ativas e aplicáveis a este hóspede. Priorize rigorosamente estas respostas oficiais para quaisquer dúvidas correspondentes:

${formattedFaqs}
`;
  }

  let stayStatusNotice = guestContext.stayStatus;
  if (guestContext.stayStatus === "checkout_concluido" || guestContext.isCheckoutCompleted) {
    stayStatusNotice = "CHECK-OUT JÁ CONCLUÍDO (Estadia encerrada). ATENÇÃO CRÍTICA: O hóspede JÁ REALIZOU O CHECK-OUT e já desocupou o flat. NUNCA envie lembrete de saída às 12:00h, NUNCA envie link de check-out (/checkout/) e NUNCA envie link de pré-check-in (/pre-checkin/)!";
  } else if (guestContext.stayStatus === "checkout_hoje") {
    stayStatusNotice = "CHECK-OUT HOJE (Data de saída pendente). ATENÇÃO: Hóspede em dia de saída. Limite de check-out até às 12:00h. NUNCA envie link de pré-check-in digital. Apenas envie lembrete ou link de check-out se o hóspede perguntar sobre a reserva, saída ou check-out (NUNCA em saudações simples como 'olá' / 'bom dia'). Link para confirmação de check-out: " + (guestContext.checkoutUrl || "Não aplicável");
  } else if (guestContext.stayStatus === "em_estadia") {
    stayStatusNotice = "EM ESTADIA (Hóspede já acomodado no flat). ATENÇÃO: NUNCA envie link de pré-check-in digital! Preste suporte à estadia em andamento.";
  }

  const conversationStateSection = `
[ESTADO ACUMULADO DA CONVERSA ATUAL]
- Datas já identificadas na conversa: ${convState.hasDates ? `SIM (Check-in: ${convState.checkIn} / Check-out: ${convState.checkOut} — ${convState.nights} diárias)` : "NÃO (ainda não informadas)"}
- Quantidade de hóspedes identificada: ${convState.guestsExplicit ? `${convState.guests} pessoa(s)` : "Ainda não informada explicitamente (padrão: 1)"}
- Preferência de plano: ${convState.breakfastPreference === "with_breakfast" ? "Com café da manhã no quarto (ratePlan: with_breakfast)" : (convState.breakfastPreference === "without_breakfast" ? "Sem café da manhã (ratePlan: room_only)" : "Ainda não definida")}
- Intenção de reservar/fechar estadia: ${convState.wantsToBook ? "SIM (cliente deseja reservar)" : "Em cotação / dúvida"}
- Pré-reserva ativa gerada: ${convState.activePreReservation ? `SIM (Código ${convState.activePreReservation.code} - Flat ${convState.activePreReservation.flatNumber})` : "NÃO"}
`;

  const contextString = `
[CONTEXTO EM TEMPO REAL]
- Data atual: ${guestContext.todayStr} | Horário: ${guestContext.timeStr} (Brasília)
- Telefone do contato: ${guestContext.phone}
- Nome do contato: ${guestContext.guestName || "Não identificado ainda (possível novo cliente / lead)"}
- Status da estadia: ${stayStatusNotice}
- Possui reserva: ${guestContext.hasReservation ? "SIM" : "NÃO"}
${guestContext.hasReservation ? `- Flat atribuído: ${guestContext.flatNumber || "A definir"}
- Período da reserva: ${guestContext.reservation?.checkinDate} até ${guestContext.reservation?.checkoutDate}
- Status da reserva: ${guestContext.isCheckoutCompleted ? "checkout_concluido (Estadia encerrada)" : guestContext.reservation?.status}${guestContext.hideFinancialForGuest ? `\n- PRIVACIDADE FINANCEIRA (SOLICITANTE DISTINTO): Esta reserva foi solicitada por ${guestContext.requesterName || "outro responsável"}. NUNCA informe valores, saldo, status de pagamento nem gere/envie PIX ou cobrança para este hóspede. Caso ele pergunte sobre pagamento da reserva, informe cordialmente que o acerto financeiro é tratado diretamente com o solicitante.` : ""}
- Link do Pré-Check-in Digital: ${guestContext.checkinUrl ? guestContext.checkinUrl : "NÃO ENVIAR / NÃO APLICÁVEL (Hóspede já em estadia / check-out hoje / check-out concluído / sem relevância)"}
${guestContext.isCheckoutDay && !guestContext.isCheckoutCompleted && guestContext.checkoutUrl ? `- Link de Confirmação de Check-out: ${guestContext.checkoutUrl}\n` : ""}${guestContext.minibarUrl ? `- Link do Frigobar / Autoatendimento Anserve: ${guestContext.minibarUrl}\n` : ""}- Status da higienização/limpeza hoje: ${guestContext.cleaningStatus.toUpperCase()} (Liberado/Pronto: ${guestContext.isRoomReady ? "SIM" : "NÃO"})` : "- Modo: Atendimento a novo cliente / Cotação"}
${preAnalysis.promptBlock}
${conversationStateSection}
[BASE DE CONHECIMENTO OFICIAL CORPFLATS]
- Endereço: ${aiConfig.knowledgeBase.address}
- Horário de Check-in: ${aiConfig.knowledgeBase.checkinTime}
- Horário de Check-out: ${aiConfig.knowledgeBase.checkoutTime}
- Benefício Early Check-in: ${aiConfig.knowledgeBase.earlyCheckinPolicy}
- Política de Late Check-out: ${aiConfig.knowledgeBase.lateCheckoutPolicy}
- Wi-Fi Oficial: Cada apartamento tem sua própria rede individualizada no formato "apto {quarto}" (ex: se o quarto for 113, a rede é "apto 113"). A senha é única para todos os apartamentos: "${aiConfig.knowledgeBase.wifiPassword || "1234567890123"}". Se o quarto do hóspede constar no contexto acima, informe a rede específica dele ("apto {quarto}"); caso contrário, explique a regra geral.
- Café da Manhã: ${aiConfig.knowledgeBase.breakfastInfo}
- Frigobar & Consumo no Quarto: ${aiConfig.knowledgeBase.minibarInfo || "Os flats contam com frigobar abastecido pela Anserve. O hóspede tem cortesia de 1 kit boas-vindas por estadia (cápsulas Nespresso e doces) e pode consumir bebidas geladas e snacks com autoatendimento e pagamento via PIX/Cartão pelo link do frigobar."}
- Garagem e Estacionamento: ${aiConfig.knowledgeBase.garageInfo}
- Animais / Pets: ${aiConfig.knowledgeBase.petPolicy}
- Lazer e Cobertura: ${aiConfig.knowledgeBase.leisureInfo || "Piscina/jacuzzi aquecida e academia na cobertura das 06:00 às 22:00 exclusivo hóspedes."}
- Fumo: ${aiConfig.knowledgeBase.smokingPolicy}
- Comodidades dos Flats: ${aiConfig.knowledgeBase.amenities}
- Benefícios Reserva Direta: ${aiConfig.knowledgeBase.directBookingBenefits}
- Site Oficial para Reservas: ${aiConfig.knowledgeBase.siteUrl}
- WhatsApp da Recepção: ${aiConfig.knowledgeBase.receptionPhone}

[TARIFAS E DIÁRIAS OFICIAIS CORPFLATS - CANAL DIRETO / WHATSAPP]
- Flats executivos de alto padrão completos e decorados (Edifício Soho Residence Service).
- Diária base de acomodação (flat completo): a partir de R$ 237,00 / noite.
- Café da manhã avulso: R$ 35,00 por pessoa/dia (servido em deliciosa bandeja personalizada diretamente no flat).
- Opção 1: DIÁRIA COM CAFÉ DA MANHÃ (Recomendada):
  * 1 pessoa: a partir de R$ 272,00 / diária (R$ 237 base + R$ 35 café).
  * 2 pessoas (casal): a partir de R$ 307,00 / diária (R$ 237 base + 2x R$ 35 café).
  * VANTAGEM EXCLUSIVA: ISENÇÃO TOTAL da taxa de limpeza no plano com café incluso!
- Opção 2: DIÁRIA SEM CAFÉ DA MANHÃ (Apenas acomodação):
  * A partir de R$ 237,00 / diária (+ taxa única de limpeza de R$ 70,00 por estadia).
- Cama extra / 3º hóspede: R$ 60,00 adicional por diária.
- Benefícios exclusivos da reserva direta: melhor tarifa garantida sem taxas de intermediários, prioridade de early check-in a partir das 10h (quando disponível pela governança) e suporte direto.
- REGRA CRÍTICA PARA PERGUNTAS DE VALORES E DIÁRIAS (mesmo citando café, ex: "quanto tá a diária? 1 pessoa com café"):
  * Forneça sempre os valores das diárias com clareza e acolhimento (ex: R$ 272 com café / R$ 237 sem café).
  * NUNCA responda apenas explicando o funcionamento da bandeja ou horários do café quando o hóspede perguntar preço/diária!
  * Solicite gentilmente as datas desejadas de check-in e check-out para verificar a disponibilidade exata e fechar a cotação.
- REGRA CRÍTICA DE PROGRESSÃO CONVERSACIONAL E RESERVA:
  * NUNCA repita a mensagem completa de tabela de diárias ou cotação de preços se ela já foi enviada logo acima no histórico da conversa!
  * Se o usuário responder com "reserva pra mim por favor", "quero reservar" ou similar e as datas AINDA NÃO foram informadas na conversa: acolha o pedido calorosamente e solicite diretamente apenas as datas de entrada e saída e o número de pessoas.
  * Se as datas JÁ constam no [ESTADO ACUMULADO DA CONVERSA ATUAL], consulte imediatamente a disponibilidade e o orçamento real usando suas ferramentas (e gere a pré-reserva com código PIX se o cliente solicitou reservar).
  * NUNCA envie mensagens idênticas ou quase idênticas às enviadas recentemente na conversa.
${dynamicFaqPromptSection}
${systemActionsNotice}
`;

  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;
  const { toneSection, guidelinesSection, flatsCatalogSection } = buildDynamicSystemInstruction(aiConfig, db, guestContext);

  // 3. Tenta responder via Google Gemini (com Function Calling adaptativo se disponível)
  if (apiKey) {
    try {
      const geminiRes = await callGeminiAi({
        apiKey,
        systemInstruction: `${aiConfig.systemPrompt}\n${toneSection}${guidelinesSection}\n${flatsCatalogSection || ""}\n${contextString}`,
        prompt: messageText,
        history: effectiveHistory,
        db,
        tools,
        requesterRole: "guest",
        requesterPhone: phone
      });

      if (geminiRes.ok && geminiRes.text) {
        const validation = validateAndRefineResponse({
          queryText: messageText,
          candidateText: geminiRes.text,
          guestContext,
          db,
          aiConfig,
          history: effectiveHistory,
          preRecordedUnmetDemand: preAnalysis.unmetDemand,
          preExecutedCheckoutResult: preAnalysis.autoCheckoutActionResult,
          preRecordedPendingFaq: preAnalysis.pendingFaq
        });

        const finalReply = geminiRes.requiresHandover ? geminiRes.text : (validation.replyText || geminiRes.text);

        return {
          shouldHandover: Boolean(geminiRes.requiresHandover || validation.shouldHandover || preAnalysis.shouldHandover),
          requiresHandover: Boolean(geminiRes.requiresHandover || validation.requiresHandover || preAnalysis.requiresHandover),
          replyText: finalReply,
          guestContext,
          preAnalysis,
          modelUsed: geminiRes.model,
          source: "gemini",
          functionCall: geminiRes.functionCall || null,
          functionResult: geminiRes.functionResult || null,
          unmetDemand: validation.unmetDemand || preAnalysis.unmetDemand || null,
          missingDataOrCapability: Boolean(validation.missingDataOrCapability || preAnalysis.missingDataOrCapability)
        };
      }
    } catch (err) {
      console.warn("[WhatsApp AI] Falha inesperada ao invocar Gemini AI:", err?.message || err);
    }
  }

  // 4. Contingência Heurística Local de Alta Precisão (Zero-Crash Fallback)
  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs, db, effectiveHistory);
  const validation = validateAndRefineResponse({
    queryText: messageText,
    candidateText: heuristicText,
    guestContext,
    db,
    aiConfig,
    history: effectiveHistory,
    preRecordedUnmetDemand: preAnalysis.unmetDemand,
    preExecutedCheckoutResult: preAnalysis.autoCheckoutActionResult,
    preRecordedPendingFaq: preAnalysis.pendingFaq
  });

  return {
    shouldHandover: Boolean(validation.shouldHandover || preAnalysis.shouldHandover),
    requiresHandover: Boolean(validation.requiresHandover || preAnalysis.requiresHandover),
    replyText: validation.replyText || heuristicText,
    guestContext,
    preAnalysis,
    modelUsed: "heuristic_fallback",
    source: "heuristic",
    unmetDemand: validation.unmetDemand || preAnalysis.unmetDemand || null,
    missingDataOrCapability: Boolean(validation.missingDataOrCapability || preAnalysis.missingDataOrCapability)
  };
}

// ── Detecção e Auto-Aprendizado de Perguntas Não Mapeadas (FAQ Sofia) ─────────

export function isPotentialGuestQuestion(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 5) return false;

  const lower = t.toLowerCase();

  // Descartar saudações puras, cortesias ou confirmações simples (mesmo com pontuação ou interrogação)
  if (/^(?:(?:oi|ol[aá]|opa|ei|hello|hi|bom dia|boa tarde|boa noite)\s*,?\s*)?(?:tudo\s+b[eé]m|tudo\s+bom|como\s+vai|como\s+est[aá]|beleza)[?!.\s]*$/i.test(lower)) return false;
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[?!.\s]*$/i.test(lower)) return false;
  if (/^(ok|obrigad[oa]|valeu|show|beleza|perfeito|entendi|combinado|certo|t[aá] bom|blz|agrade[cç]o|sim|n[aã]o|positivo)[?!.\s]*$/i.test(lower)) return false;
  if (/^(?:quero|preciso|gostaria)?\s*(?:de\s+)?(?:falar\s+com\s+)?(?:um\s+|uma\s+)?(?:humano|atendente|pessoa|algu[eé]m|recep[cç][aã]o|recepcionista|gerente|operador)(?:\s+urgente)?[?!.\s]*$/i.test(lower)) return false;

  // Descartar comandos do desenvolvedor, coaching, correções ou feedbacks
  if (/\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|sofia\s*[,:]|quando\s+(?:algu[eé]m|o\s+h[oó]spede|um\s+h[oó]spede|[a-z]+)\s+.*?\bper|n[aã]o\s+deve|n[aã]o\s+pode|n[aã]o\s+pergunte|n[aã]o\s+diga|voc[eê]\s+deve|voc[eê]\s+verificou|est[aá]\s+errad[ao]|aprenda\s+a|corrij[ao]|tom\s+calibrado)\b/i.test(lower)) return false;

  // Interrogação explícita
  if (t.includes("?")) return true;

  // Padrões interrogativos
  const patterns = [
    /\b(como|onde|quando|qual|quais|quanto|quantos|quanta|quantas|por que|porque)\b/i,
    /\b(tem|teria|posso|pode|podemos|consegue|consigo|d[aá]\s+para|d[aá]\s+pra)\b/i,
    /\b(aceita|aceitam|possui|possuem|existe|existem|funciona|hor[aá]rio)\b/i,
    /\b(sabe me dizer|gostaria de saber|queria saber|voc[eê]s?\s+t[eê]m?|tem como)\b/i,
    /\b(preciso saber|informa[cç][aã]o|d[uú]vida|procedimento|como fa[cç]o)\b/i
  ];

  return patterns.some(p => p.test(lower));
}

export function inferFaqCategory(text) {
  if (!text || typeof text !== "string") return "reservas";
  const lower = text.toLowerCase();

  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar|rede|conex[aã]o|sinal|computador|smart\s*tv/i.test(lower)) return "wifi_tecnologia";
  if (/caf[eé]|desjejum|bandeja|lou[cç]a|garrafa\s+t[eé]rmica|cafeteira|p[aã]o|leite|fruta/i.test(lower)) return "cafe_manha";
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa|moto|estacionar|recarga/i.test(lower)) return "garagem";
  if (/check-?in|entrada|cheg(?:ada|ar)|portaria|chave|cart[aã]o|fechadura|acesso|port[aã]o|early|entrar\s+no\s+quarto/i.test(lower)) return "checkin_acesso";
  if (/check-?out|sa[ií]da|desocupa|deixar\s+o\s+flat|entregar\s+(?:chave|cart[aã]o)|late\s+check/i.test(lower)) return "checkout";
  if (/visit(?:a|ante)|convidad|pet|cachorro|c[aã]o|gato|animal|fumo|fumar|cigarro|pernoite|barulho|norma|regra/i.test(lower)) return "regras_visitas_pets";
  if (/piscina|jacuzzi|sauna|academia|cobertura|lazer|churrasqueira|sal[aã]o|condom[ií]nio|pr[eé]dio|edif[ií]cio/i.test(lower)) return "lazer_condominio";
  if (/flat|quarto|apartamento|frigobar|[aá]gua|ar[- ]condicionado|ar\s+condicionado|tomada|voltagem|110|220|ferro|t[aá]bua|secador|toalha|cama|travesseiro|len[cç]ol|chuveiro|banheiro|cozinha|micro-ondas|utens[ií]lio|panela|copo|fog[aã]o|ber[cç]o/i.test(lower)) return "estrutura_flat";

  return "reservas";
}

export function extractFaqKeywords(text) {
  if (!text || typeof text !== "string") return [];
  const stopWords = new Set([
    "de", "a", "o", "que", "e", "do", "da", "em", "um", "para", "com", "nao", "não",
    "uma", "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas", "foi",
    "ao", "ele", "das", "tem", "seu", "sua", "ou", "ser", "quando", "muito", "ha", "há",
    "nos", "ja", "já", "esta", "está", "eu", "tambem", "também", "so", "só", "pelo",
    "pela", "ate", "até", "isso", "ela", "entre", "era", "depois", "sem", "mesmo",
    "aos", "ter", "seus", "quem", "nas", "me", "esse", "eles", "estao", "estão",
    "voce", "você", "tinha", "foram", "essa", "num", "nem", "suas", "meu", "minha",
    "qual", "quais", "onde", "posso", "pode", "favor", "gostaria", "queria", "bom",
    "boa", "dia", "tarde", "noite", "ola", "olá", "corpflats", "hotel"
  ]);

  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");

  const words = clean.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
  return Array.from(new Set(words)).slice(0, 8);
}

export function isQuestionMappedInFaq(text, db, clientPhone) {
  if (!db || !Array.isArray(db.faqItems) || !text) return false;
  const lower = text.toLowerCase().trim();
  const cleanTokens = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\s,.;:?!+=\-_/\\()]+/)
    .filter(w => w.length > 2);

  for (const item of db.faqItems) {
    if (!item || item.status !== "ativo") continue;
    if (typeof isFaqApplicableToClient === "function" && !isFaqApplicableToClient(item, clientPhone)) continue;

    const qLower = (item.question || "").toLowerCase().trim();
    if (qLower && (lower.includes(qLower) || qLower.includes(lower))) return true;

    if (Array.isArray(item.variations)) {
      for (const v of item.variations) {
        if (!v) continue;
        const vLower = String(v).toLowerCase().trim();
        if (vLower && (lower.includes(vLower) || vLower.includes(lower))) return true;
      }
    }

    if (Array.isArray(item.keywords) && item.keywords.length > 0) {
      const kwMatches = item.keywords.filter(k => {
        if (!k) return false;
        const kNorm = String(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return cleanTokens.includes(kNorm) || lower.includes(kNorm);
      });
      if (kwMatches.length >= 2) return true;
    }
  }

  return false;
}

export function findExistingPendingFaq(text, db, clientPhone) {
  if (!db || !Array.isArray(db.faqItems) || !text) return null;
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const cleanPhone = clientPhone ? cleanWhatsAppPhone(clientPhone) : null;

  return db.faqItems.find(item => {
    if (!item || (item.status !== "pendente" && item.status !== "aguardando_aprovacao")) return false;
    const qLower = (item.question || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (qLower === lower) return true;
    if (cleanPhone && (item.sourceClientPhone || (Array.isArray(item.clientPhones) && item.clientPhones.length > 0))) {
      const phoneMatches = (item.sourceClientPhone && matchClientPhone(item.sourceClientPhone, cleanPhone)) ||
        (Array.isArray(item.clientPhones) && item.clientPhones.some(p => matchClientPhone(p, cleanPhone)));
      if (phoneMatches && (lower.includes(qLower) || qLower.includes(lower))) return true;
    }
    return false;
  }) || null;
}

export function generateIntelligentFaqDraft(questionText, db = null, category = "estrutura_flat") {
  if (!questionText || typeof questionText !== "string") return "";
  const lower = questionText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Micro-ondas / Cozinha / Eletrodomésticos
  if (/micro[- ]?ondas/i.test(lower)) {
    return "Sim! Todos os nossos flats dispõem de cozinha compacta equipada com micro-ondas, frigobar e utensílios completos para sua total comodidade. 🍽️⚡";
  }
  if (/frigobar|geladeira|congelador/i.test(lower)) {
    return "Sim! Os flats contam com frigobar abastecido em parceria com a Anserve. Você conta com 1 kit cortesia por estadia (cápsulas Nespresso e doces) e pode consumir bebidas e snacks via autoatendimento com pagamento por PIX ou Cartão. 🧊🍫";
  }
  if (/cafeteira|cafezinh/i.test(lower)) {
    return "Sim! Nossos flats dispõem de cozinha compacta equipada com cafeteira para seu conforto. ☕";
  }
  if (/cooktop|fog[aã]o|panela|cozinha|lou[cç]a|talher|prato|copo/i.test(lower)) {
    return "Sim! Nossos flats possuem cozinha compacta equipada com cooktop, micro-ondas, frigobar e utensílios essenciais para refeições práticas. 🍳";
  }
  if (/ferro|passar|t[aá]bua/i.test(lower)) {
    return "Sim! Disponibilizamos ferro de passar roupa nos flats para seu uso (sem tábua de passar). 👔✨";
  }
  if (/voltagem|110|220|127|tomada|eletric/i.test(lower)) {
    return "A voltagem padrão em todos os nossos flats é 127V (110V), com tomadas no padrão ABNT. 🔌⚡";
  }
  if (/secador(?:\s+de\s+cabelo)?/i.test(lower)) {
    return "Sim! Os banheiros dos flats contam com secador de cabelo e ducha higiênica para seu conforto. 🚿";
  }
  if (/ar[- ]?condicionado|split|climatiza|calor|frio/i.test(lower)) {
    return "Sim! Todos os flats possuem ar-condicionado Split potente e controle individual. ❄️";
  }
  if (/cafe(?:\s+da\s+manha)?|desjejum/i.test(lower)) {
    return "Nosso delicioso café da manhã é servido em bandeja diretamente no seu quarto das 05:00 às 09:30, agendado previamente pelo portal do hóspede. ☕🥐";
  }
  if (/wi[- ]?fi|internet|senha(?:\s+do\s+wi-?fi)?|conex[aã]o/i.test(lower)) {
    return "O Wi-Fi é individual e de alta velocidade em cada flat! O nome da rede é o número do seu apartamento e a senha padrão é 1234567890123. 📶";
  }
  if (/piscina|jacuzzi|cobertura|lazer|hidro/i.test(lower)) {
    return "A área de lazer na cobertura (com piscina/jacuzzi aquecida e academia) funciona diariamente das 06:00 às 22:00 exclusivamente para hóspedes. 🏊‍♂️✨";
  }
  if (/academia|muscula[cç][aã]o|fitness|treino/i.test(lower)) {
    return "Sim! Nossa academia fica na cobertura do edifício e funciona diariamente das 06:00 às 22:00 com equipamentos completos para seu treino. 🏋️‍♂️✨";
  }
  if (/pet|cachorro|animal|gato/i.test(lower)) {
    return "Sim! Aceitamos pets de pequeno porte com todo carinho (máximo 1 pet por flat, mediante taxa única). 🐾✨";
  }
  if (/garagem|estacionamento|vaga|ve[ií]culo|carro|moto|caminhonete/i.test(lower)) {
    return "Dispomos de vaga de garagem coberta gratuita (rotativa) para 1 veículo de passeio por flat no condomínio Soho! 🚗";
  }
  if (/check[- ]?in|horario\s+(?:de\s+)?(?:entrada|chegada)|(?:horas?|quando)\s+(?:posso\s+|da\s+para\s+)?entrar|entrar\s+antes|early/i.test(lower)) {
    return "O horário de check-in inicia a partir das 14:00. Caso chegue antes, faremos o possível para liberar o flat conforme a disponibilidade. 🕒🛎️";
  }
  if (/check[- ]?out|horario\s+(?:de\s+)?saida|(?:horas?|quando)\s+(?:posso\s+|preciso\s+|tenho\s+que\s+)?sair|sair\s+depois|late/i.test(lower)) {
    return "O check-out deve ser realizado até as 12:00. Basta deixar os cartões-chave na recepção/portaria ao sair. 🕛👋";
  }
  if (/reserva|confirmad[ao]|voucher|localizador/i.test(lower)) {
    return "Para consultar os detalhes da sua reserva e status de confirmação, basta nos informar o nome completo do titular ou código da reserva. Também é possível acessar todos os dados diretamente no Portal do Hóspede! 🏨📋";
  }
  if (/toalha|roupa\s+de\s+cama|len[cç]ol|travesseiro|enxoval/i.test(lower)) {
    return "Sim! Disponibilizamos enxoval completo de cama e banho higienizado e de alta qualidade para todos os hóspedes da acomodação. 🛏️✨";
  }
  if (/limpeza|camareira|faxina|arruma[cç][aã]o/i.test(lower)) {
    return "O flat é entregue completamente limpo e higienizado antes do seu check-in. Limpezas extras durante a estadia podem ser solicitadas com a nossa equipe mediante taxa de serviço. 🧹✨";
  }
  if (/endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar/i.test(lower)) {
    return "Estamos localizados na Rua Baronesa da Lagoa Dourada, 144 (esquina com Av. Pelinca) — Edifício Soho, Parque Tamandaré, Campos dos Goytacazes/RJ, CEP 28035-212! 📍🏨";
  }
  if (/fumar|cigarro|narguile|tabaco/i.test(lower)) {
    return "Por lei e pelo regulamento do condomínio, é estritamente proibido fumar no interior dos flats e nas áreas comuns fechadas. 🚭";
  }
  if (/visita|convidad[ao]|terceiros/i.test(lower)) {
    return "Por segurança condominial, o acesso às instalações e áreas de lazer é restrito aos hóspedes devidamente cadastrados na reserva. 🛑👥";
  }

  return "";
}

export function autoCreatePendingFaq({
  db,
  questionText,
  senderPhone,
  senderName,
  saveDatabase,
  createNotification
}) {
  if (!db) return null;
  if (!Array.isArray(db.faqItems)) db.faqItems = [];

  const text = (questionText || "").trim();
  if (!text) return null;

  const cleanPhone = cleanWhatsAppPhone(senderPhone) || String(senderPhone || "").replace(/\D/g, "");

  // 1. Comandos de coaching ou mensagens administrativas do desenvolvedor NUNCA devem virar FAQ
  const devCheck = classifyDeveloperMessage(text, db);
  if (devCheck && devCheck.type !== "guest_simulation") {
    return null;
  }

  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|sofia\s*[,:]|quando\s+.*?\bper|n[aã]o\s+deve|n[aã]o\s+pode|voc[eê]\s+deve|voc[eê]\s+verificou|est[aá]\s+errad[ao]|aprenda\s+a)\b/i.test(lower)) {
    return null;
  }

  const existing = findExistingPendingFaq(text, db, cleanPhone);
  if (existing) {
    if (Array.isArray(existing.variations) && !existing.variations.includes(text)) {
      existing.variations.push(text);
    }
    existing.updatedAt = new Date().toISOString();
    if (cleanPhone && !existing.clientPhones?.some(p => matchClientPhone(p, cleanPhone))) {
      if (!Array.isArray(existing.clientPhones)) existing.clientPhones = [];
      existing.clientPhones.push(cleanPhone);
    }
    if (typeof saveDatabase === "function") {
      try { saveDatabase(); } catch (_) {}
    }
    return existing;
  }

  const now = new Date().toISOString();
  const category = inferFaqCategory(text);
  const keywords = extractFaqKeywords(text);
  const randomSuffix = Math.random().toString(36).substring(2, 7);

  const intelligentDraft = generateIntelligentFaqDraft(text, db, category);

  const newFaq = {
    id: `faq_${Date.now()}_${randomSuffix}`,
    question: text,
    answer: "",
    category,
    keywords,
    variations: [text],
    status: intelligentDraft ? "aguardando_aprovacao" : "pendente",
    suggestedAnswer: intelligentDraft || undefined,
    source: "auto_aprendizado",
    scope: "all",
    clientPhones: cleanPhone ? [cleanPhone] : [],
    sourceClientPhone: cleanPhone,
    sourceClientName: senderName || "Hóspede",
    metadata: {
      customerPhone: cleanPhone,
      customerName: senderName || "Hóspede",
      askedAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  db.faqItems.push(newFaq);

  if (typeof saveDatabase === "function") {
    try { saveDatabase(); } catch (_) {}
  }

  if (typeof createNotification === "function") {
    try {
      createNotification({
        category: "whatsapp",
        title: intelligentDraft ? `💡 Nova Sugestão de FAQ: ${senderName || cleanPhone}` : `❓ Nova Dúvida Hóspede: ${senderName || cleanPhone}`,
        message: intelligentDraft 
          ? `Pergunta identificada com rascunho de resposta sugerido: "${text.substring(0, 80)}". Aguardando aprovação.`
          : `Pergunta não mapeada recebida: "${text.substring(0, 100)}". Registrada como pendente no FAQ.`,
        type: intelligentDraft ? "faq_suggestion" : "whatsapp_faq_pending",
        targetUrl: "/whatsapp-automation",
        link: "/whatsapp-automation"
      });
    } catch (_) {}
  }

  console.log(`[Auto-Aprendizado FAQ] Nova dúvida ${intelligentDraft ? "com sugestão inteligente" : "pendente"}: "${text}" (${cleanPhone})`);

  return newFaq;
}

// ─── Assistente Fiscal WhatsApp & Enriquecimento Automático CRM 360° ────────

/**
 * Detecta intenção de solicitação ou envio de dados de Nota Fiscal no WhatsApp.
 */
export function isFiscalIntentMessage(text = "") {
  if (!text || typeof text !== "string") return false;
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 1. Termos compostos diretos
  const directPatterns = [
    /\b(?:nota\s*fiscal|notas\s*fiscais|nfs-?e|nfse)\b/i,
    /\b(?:recibo\s*fiscal|fatura\s*fiscal|comprovante\s*fiscal)\b/i,
    /\b(?:nota\s*no\s*cnpj|nota\s*no\s*cpf|cnpj\s*(?:na|pra|para)?\s*nota|cpf\s*(?:na|pra|para)?\s*nota)\b/i,
    /\b(?:dados\s+(?:pra|para|de)?\s*(?:a\s+)?nota)\b/i
  ];
  if (directPatterns.some(p => p.test(normalized))) return true;

  // 2. Verbo de ação + (nota / nf / nfe / fatura / recibo)
  const verbPattern = /\b(?:preciso|quero|gostaria|favor|solicito|solicitar|solicita|solicitacao|emitir|emite|emissao|mandar|manda|enviar|envia|gerar|gera|fazer|faz)\b/i;
  const nounPattern = /\b(?:nota|nf|nfe|nfse|nfs-e|recibo|fatura)\b/i;

  if (verbPattern.test(normalized) && nounPattern.test(normalized)) {
    return true;
  }

  // 3. Se contiver 'nota' ou 'nf' com contexto fiscal / empresa / cnpj / cpf / faturamento / estadia
  if (nounPattern.test(normalized) && /\b(?:fiscal|cnpj|cpf|empresa|faturamento|servi[cç]o|estadia|hospedagem)\b/i.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Extrai CNPJ (formatado ou apenas dígitos) de texto.
 */
export function extractCnpj(text = "") {
  if (!text || typeof text !== "string") return null;
  // 1. Formatado: 00.000.000/0000-00
  const formatted = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  if (formatted) return onlyDigits(formatted[0]);

  // 2. Tagged: CNPJ: 12345678000190
  const tagged = text.match(/\bcnpj\s*[:=]?\s*([0-9./-]+)\b/i);
  if (tagged) {
    const digits = onlyDigits(tagged[1]);
    if (digits.length === 14) return digits;
  }

  // 3. Sequência de 14 dígitos
  const raw14 = text.match(/\b\d{14}\b/);
  if (raw14) return raw14[0];

  // 4. CNPJ parcial ou quase completo em contexto
  if (/\bcnpj\b/i.test(text)) {
    const after = text.replace(/^.*?\bcnpj\b[:\s-]*/i, "");
    const candidateDigits = onlyDigits(after).slice(0, 14);
    if (candidateDigits.length >= 11) return candidateDigits;
  }

  return null;
}

/**
 * Extrai CPF (formatado ou apenas dígitos) de texto.
 */
export function extractCpf(text = "") {
  if (!text || typeof text !== "string") return null;
  // 1. Formatado: 000.000.000-00
  const formatted = text.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
  if (formatted) return onlyDigits(formatted[0]);

  // 2. Tagged: CPF: 12345678901
  const tagged = text.match(/\bcpf\s*[:=]?\s*([0-9.-]+)\b/i);
  if (tagged) {
    const digits = onlyDigits(tagged[1]);
    if (digits.length === 11) return digits;
  }

  // 3. Menção a CPF seguida de dígitos
  if (/\bcpf\b/i.test(text)) {
    const after = text.replace(/^.*?\bcpf\b[:\s-]*/i, "");
    const candidateDigits = onlyDigits(after).slice(0, 11);
    if (candidateDigits.length === 11) return candidateDigits;
  }

  // 4. Sequência de 11 dígitos que valide como CPF matematicamente
  const all11Matches = text.match(/\b\d{11}\b/g) || [];
  for (const match of all11Matches) {
    if (isValidCpf(match)) return match;
  }

  return null;
}

/**
 * Extrai e-mail de texto.
 */
export function extractEmail(text = "") {
  if (!text || typeof text !== "string") return "";
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return match ? match[0].toLowerCase().trim() : "";
}

/**
 * Extrai CEP de texto.
 */
export function extractCep(text = "") {
  if (!text || typeof text !== "string") return "";
  const formatted = text.match(/\b\d{5}-\d{3}\b/);
  if (formatted) return onlyDigits(formatted[0]);

  const tagged = text.match(/\bcep\s*[:=]?\s*([0-9.-]+)\b/i);
  if (tagged) {
    const d = onlyDigits(tagged[1]);
    if (d.length === 8) return d;
  }

  const raw8 = text.match(/\b\d{8}\b/);
  if (raw8) return raw8[0];

  return "";
}

/**
 * Extrai nome de pessoa de texto.
 */
export function extractPersonName(text = "") {
  if (!text || typeof text !== "string") return "";
  const tagged = text.match(/\bnome\s*(?:completo)?\s*[:=]?\s*([^\n,;]+)/i);
  if (tagged) {
    const val = tagged[1].trim();
    if (val.length >= 3 && !/\b(?:cpf|cnpj|cep|email|rua|av)\b/i.test(val)) {
      return val;
    }
  }
  return "";
}

/**
 * Extrai nome de empresa de texto.
 */
export function extractCompanyName(text = "") {
  if (!text || typeof text !== "string") return "";
  const tagged = text.match(/\b(?:empresa|raz[aã]o\s*social|nome\s*fantasia)\s*[:=]?\s*([^\n,;]+)/i);
  if (tagged) {
    const val = tagged[1].trim();
    if (val.length >= 3) return val;
  }
  return "";
}

/**
 * Cruza o telefone do remetente com as reservas (titular ou requesterInfo) e hóspedes do CRM.
 */
export function findContactAndReservation(db, cleanTarget) {
  if (!db || !cleanTarget) {
    return { matchedReservation: null, matchedGuest: null, companyId: null, linkedCompany: null };
  }

  const cleanPhoneNum = cleanWhatsAppPhone(cleanTarget);
  const targetLast8 = cleanPhoneNum.slice(-8);

  // 1. Procura reserva compatível
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];
  const matchedReservations = reservations.filter(r => {
    if (!r) return false;
    const pList = [];
    if (r.guestPhone) pList.push(r.guestPhone);
    if (r.phone) pList.push(r.phone);
    if (r.whatsapp) pList.push(r.whatsapp);
    if (r.contactPhone) pList.push(r.contactPhone);
    if (r.guestWhatsapp) pList.push(r.guestWhatsapp);
    if (r.requesterInfo?.phone) pList.push(r.requesterInfo.phone);
    if (r.requesterInfo?.whatsapp) pList.push(r.requesterInfo.whatsapp);
    if (r.requesterPhone) pList.push(r.requesterPhone);
    if (Array.isArray(r.guests)) {
      for (const g of r.guests) {
        if (typeof g === "string") pList.push(g);
        else if (g?.phone) pList.push(g.phone);
        else if (g?.whatsapp) pList.push(g.whatsapp);
      }
    }
    return pList.some(p => {
      const cp = cleanWhatsAppPhone(p);
      return cp && (cp === cleanPhoneNum || cp.endsWith(targetLast8) || cleanPhoneNum.endsWith(cp.slice(-8)));
    });
  });

  const nonCancelled = matchedReservations.filter(r => r.status !== "cancelada" && r.status !== "cancelled");
  const now = new Date();
  const brasiliaDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);

  // Priorização da melhor reserva:
  // 1) Ativa hoje
  let matchedReservation = nonCancelled.find(r =>
    (r.checkinDate === brasiliaDateStr || r.checkoutDate === brasiliaDateStr || (r.checkinDate <= brasiliaDateStr && r.checkoutDate >= brasiliaDateStr))
  );
  // 2) Futura mais próxima
  if (!matchedReservation) {
    const future = nonCancelled
      .filter(r => (r.checkinDate || "") >= brasiliaDateStr)
      .sort((a, b) => (a.checkinDate || "").localeCompare(b.checkinDate || ""));
    if (future.length > 0) matchedReservation = future[0];
  }
  // 3) Passada mais recente
  if (!matchedReservation && nonCancelled.length > 0) {
    const past = nonCancelled
      .sort((a, b) => (b.checkoutDate || b.checkinDate || "").localeCompare(a.checkoutDate || a.checkinDate || ""));
    matchedReservation = past[0];
  }
  if (!matchedReservation && matchedReservations.length > 0) {
    matchedReservation = matchedReservations[0];
  }

  // 2. Procura cadastro de hóspede no CRM
  const guests = Array.isArray(db.guests) ? db.guests : [];
  let matchedGuest = guests.find(g => {
    const gp = cleanWhatsAppPhone(g.phone || g.whatsapp || "");
    return gp && (gp === cleanPhoneNum || gp.endsWith(targetLast8) || cleanPhoneNum.endsWith(gp.slice(-8)));
  });

  if (!matchedGuest && matchedReservation?.guestId) {
    matchedGuest = guests.find(g => String(g.id) === String(matchedReservation.guestId));
  }

  // 3. Identifica companyId e localiza a Empresa no CRM
  const companyId = matchedReservation?.companyId || matchedGuest?.companyId || null;
  let linkedCompany = null;
  if (companyId && Array.isArray(db.companies)) {
    linkedCompany = db.companies.find(c => String(c.id) === String(companyId) && isValidCnpj(c.cnpj));
  }

  return { matchedReservation, matchedGuest, companyId, linkedCompany };
}

/**
 * Fluxo Central do Assistente Fiscal do WhatsApp (Features F12 a F17)
 */
export async function handleWhatsAppFiscalFlow({
  db,
  cleanTarget,
  messageText,
  senderName,
  conv,
  sendZapiMessage,
  appendMessageFn,
  saveDatabase,
  createNotification
}) {
  if (!db || !cleanTarget || !messageText) return { handled: false };

  const isFiscalRequest = isFiscalIntentMessage(messageText);
  const isAwaitingFiscal = Boolean(conv?.awaitingFiscalData === true);

  // Se não é pedido fiscal nem conversa aguardando dados fiscais, ignora
  if (!isFiscalRequest && !isAwaitingFiscal) {
    return { handled: false };
  }

  // Garante que conv exista para registrar estado
  if (!conv && Array.isArray(db.whatsappConversations)) {
    conv = db.whatsappConversations.find(c => {
      const p = cleanWhatsAppPhone(c.phone);
      return p && (p.endsWith(cleanTarget.slice(-8)) || cleanTarget.endsWith(p.slice(-8)));
    });
    if (!conv) {
      conv = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        phone: cleanTarget,
        name: senderName || "Hóspede",
        messages: [],
        unreadCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.whatsappConversations.push(conv);
    }
  }

  const { matchedReservation, matchedGuest, companyId, linkedCompany } = findContactAndReservation(db, cleanTarget);
  const rawCnpj = extractCnpj(messageText);
  const rawCpf = extractCpf(messageText);

  const contactDisplayName = senderName || matchedReservation?.guestName || matchedGuest?.name || "Hóspede";
  const firstName = contactDisplayName ? toTitleCase(contactDisplayName).split(" ")[0] : "";

  // Helper para envio de resposta e persistência
  const respond = async (replyText, actionDetails = {}) => {
    if (typeof sendZapiMessage === "function") {
      await sendZapiMessage(db.zapiConfig, {
        phone: cleanTarget,
        message: replyText,
        channelId: "ai_agent",
        recipientRole: "guest",
        db
      });
    }

    if (typeof appendMessageFn === "function") {
      appendMessageFn(db, {
        phone: cleanTarget,
        senderName: db?.whatsappAiSettings?.agentName || "Sofia",
        fromMe: true,
        text: replyText,
        type: "text",
        status: "delivered",
        timestamp: new Date().toISOString()
      });
    }

    if (typeof saveDatabase === "function") {
      try { saveDatabase(); } catch (_) {}
    }

    return {
      handled: true,
      fiscalFlow: true,
      replyText,
      ...actionDetails
    };
  };

  // ── CENÁRIO 1: CNPJ enviado pelo cliente ─────────────────────────────────────
  if (rawCnpj) {
    // 1. Validação Módulo 11 do CNPJ
    if (!isValidCnpj(rawCnpj)) {
      if (conv) {
        conv.awaitingFiscalData = true;
        conv.awaitingFiscalDataAt = new Date().toISOString();
      }
      const replyText = `Identificamos a tentativa de envio do CNPJ ${rawCnpj}, porém os dígitos verificadores parecem incorretos segundo o cálculo oficial (Módulo 11). Por gentileza, confira os números digitados e nos envie novamente para emitirmos sua nota fiscal com total segurança! 🙏`;
      return await respond(replyText, { action: "invalid_cnpj", invalidCnpj: rawCnpj });
    }

    // CNPJ é matematicamente VÁLIDO (14 dígitos)
    const cleanCnpjNum = onlyDigits(rawCnpj);

    // 2. Enriquecimento Automático via local db.companies + BrasilAPI
    let lookupData = {};
    try {
      lookupData = await lookupCnpj(cleanCnpjNum, db);
    } catch (_) {
      lookupData = {};
    }

    // Se houver CEP informado no texto ou retornado do CNPJ, enriquece endereço
    const cepFromText = extractCep(messageText);
    const effectiveCep = cleanCep(cepFromText || lookupData.cep || "");
    if (effectiveCep && effectiveCep.length === 8 && effectiveCep !== "00000000") {
      try {
        const cepData = await lookupCep(effectiveCep, db);
        if (cepData) {
          if (!lookupData.logradouro && cepData.logradouro) lookupData.logradouro = cepData.logradouro;
          if (!lookupData.bairro && cepData.bairro) lookupData.bairro = cepData.bairro;
          if (!lookupData.cidade && cepData.cidade) lookupData.cidade = cepData.cidade;
          if (!lookupData.uf && cepData.uf) lookupData.uf = cepData.uf;
          if (!lookupData.codigoMunicipio && cepData.codigoMunicipio) lookupData.codigoMunicipio = cepData.codigoMunicipio;
        }
      } catch (_) {}
    }

    // 3. Sanitização dos campos corporativos
    const emailFromText = extractEmail(messageText);
    const finalEmail = (emailFromText || lookupData.email || "").toLowerCase().trim();
    const finalCorporateName = toTitleCase(lookupData.razaoSocial || extractCompanyName(messageText) || "Empresa");
    const finalTradeName = toTitleCase(lookupData.nomeFantasia || finalCorporateName);
    const finalLogradouro = toTitleCase(lookupData.logradouro || "");
    const finalNumero = lookupData.numero || "S/N";
    const finalComplemento = lookupData.complemento || "";
    const finalBairro = toTitleCase(lookupData.bairro || "");
    const finalCidade = toTitleCase(lookupData.cidade || "Campos dos Goytacazes");
    const finalUf = (lookupData.uf || "RJ").toUpperCase();
    const finalIbge = String(lookupData.codigoMunicipio || "3301009");
    const finalPhone = cleanPhone(lookupData.telefone || cleanTarget);

    // 4. Criação / Atualização em db.companies
    if (!Array.isArray(db.companies)) db.companies = [];
    let company = db.companies.find(c => onlyDigits(c.cnpj) === cleanCnpjNum);
    if (company) {
      company.corporateName = finalCorporateName || company.corporateName;
      company.tradeName = finalTradeName || company.tradeName;
      if (finalEmail) company.financialEmail = finalEmail;
      if (finalLogradouro) company.address = company.logradouro = finalLogradouro;
      if (finalNumero && finalNumero !== "S/N") company.number = company.numero = finalNumero;
      if (finalComplemento) company.complement = company.complemento = finalComplemento;
      if (finalBairro) company.neighborhood = company.bairro = finalBairro;
      if (finalCidade) company.city = company.cidade = finalCidade;
      if (finalUf) company.state = company.uf = finalUf;
      if (finalIbge) company.ibgeCode = company.codigoMunicipio = finalIbge;
      if (effectiveCep) company.cep = effectiveCep;
      company.updatedAt = new Date().toISOString();
    } else {
      company = {
        id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        corporateName: finalCorporateName,
        tradeName: finalTradeName,
        cnpj: cleanCnpjNum,
        stateRegistration: "",
        municipalRegistration: "",
        financialEmail: finalEmail,
        phone: finalPhone,
        contactPerson: contactDisplayName,
        address: finalLogradouro,
        logradouro: finalLogradouro,
        number: finalNumero,
        numero: finalNumero,
        complement: finalComplemento,
        complemento: finalComplemento,
        neighborhood: finalBairro,
        bairro: finalBairro,
        city: finalCidade,
        cidade: finalCidade,
        state: finalUf,
        uf: finalUf,
        ibgeCode: finalIbge,
        codigoMunicipio: finalIbge,
        cep: effectiveCep,
        billingTerms: "faturado_15d",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.companies.push(company);
    }

    // 5. Atualização / Vínculo em db.guests
    if (!Array.isArray(db.guests)) db.guests = [];
    let guest = matchedGuest || db.guests.find(g => {
      const gp = cleanPhone(g.phone || g.whatsapp || "");
      return gp && (cleanTarget.endsWith(gp.slice(-8)) || gp.endsWith(cleanTarget.slice(-8)));
    });

    if (guest) {
      guest.companyId = company.id;
      guest.companyName = company.corporateName;
      guest.autoEmitInvoice = true;
      if (finalEmail && !guest.email) guest.email = finalEmail;
      guest.updatedAt = new Date().toISOString();
    } else {
      guest = {
        id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: contactDisplayName,
        phone: cleanTarget,
        whatsapp: cleanTarget,
        email: finalEmail,
        companyId: company.id,
        companyName: company.corporateName,
        autoEmitInvoice: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.guests.push(guest);
    }

    // 6. Atualização / Vínculo na Reserva ativa ou recente
    if (matchedReservation) {
      matchedReservation.companyId = company.id;
      matchedReservation.companyName = company.corporateName;
      matchedReservation.autoEmitInvoice = true;
      matchedReservation.invoiceDetails = {
        companyId: company.id,
        companyName: company.corporateName,
        tomadorTipo: "PJ",
        tomadorCpfCnpj: company.cnpj,
        tomadorNome: company.corporateName,
        tomadorRazaoSocial: company.corporateName,
        tomadorNomeFantasia: company.tradeName,
        tomadorEmail: company.financialEmail || finalEmail,
        tomadorTelefone: company.phone || cleanTarget,
        tomadorCep: company.cep || "",
        tomadorEndereco: company.logradouro || company.address || "",
        tomadorNumero: company.numero || company.number || "S/N",
        tomadorComplemento: company.complemento || company.complement || "",
        tomadorBairro: company.bairro || company.neighborhood || "",
        tomadorCidade: company.cidade || company.city || "Campos dos Goytacazes",
        tomadorUf: company.uf || company.state || "RJ",
        tomadorCodigoMunicipio: company.codigoMunicipio || company.ibgeCode || "3301009",
        autoEmitInvoice: true,
        solicitadoEm: new Date().toISOString()
      };
      matchedReservation.updatedAt = new Date().toISOString();
    }

    if (conv) {
      conv.awaitingFiscalData = false;
    }

    if (typeof createNotification === "function") {
      createNotification({
        category: "fiscal",
        title: `🏢 Dados Fiscais PJ Cadastrados: ${company.corporateName}`,
        message: `CNPJ ${formatCnpj(company.cnpj)} cadastrado e vinculado à reserva via WhatsApp.`,
        type: "fiscal_pj_registered",
        targetUrl: "/notas",
        link: "/notas"
      });
    }

    const replyText = `Perfeito${firstName ? `, ${firstName}` : ""}! Cadastramos e vinculamos a empresa **${company.corporateName}** (CNPJ: ${formatCnpj(company.cnpj)}) à sua estadia. A Nota Fiscal (NFS-e) será emitida com todos os dados corporativos. Agradecemos a preferência pela CorpFlats! 🏨✨`;
    return await respond(replyText, {
      action: "registered_pj",
      company,
      guest,
      reservation: matchedReservation
    });
  }

  // ── CENÁRIO 2: CPF enviado pelo cliente (Pessoa Física) ──────────────────────
  if (rawCpf) {
    // 1. Validação Módulo 11 do CPF
    if (!isValidCpf(rawCpf)) {
      if (conv) {
        conv.awaitingFiscalData = true;
        conv.awaitingFiscalDataAt = new Date().toISOString();
      }
      const replyText = `Identificamos o CPF ${rawCpf}, porém os dígitos verificadores parecem incorretos segundo o cálculo oficial (Módulo 11). Por favor, confira os números e nos envie novamente para darmos andamento à sua nota fiscal! 🙏`;
      return await respond(replyText, { action: "invalid_cpf", invalidCpf: rawCpf });
    }

    // CPF é matematicamente VÁLIDO (11 dígitos)
    const cleanCpfNum = onlyDigits(rawCpf);

    // 2. Extração e sanitização dos campos de PF
    const emailFromText = extractEmail(messageText);
    const cepFromText = extractCep(messageText);
    const cleanCepNum = cleanCep(cepFromText || "");
    const nameFromText = extractPersonName(messageText);
    const finalName = toTitleCase(nameFromText || contactDisplayName || "Hóspede");

    let addressData = {
      logradouro: "",
      bairro: "",
      cidade: "Campos dos Goytacazes",
      uf: "RJ",
      codigoMunicipio: "3301009",
      numero: "S/N"
    };

    if (cleanCepNum && cleanCepNum.length === 8 && cleanCepNum !== "00000000") {
      try {
        const cepLookup = await lookupCep(cleanCepNum, db);
        if (cepLookup) {
          addressData = { ...addressData, ...cepLookup };
        }
      } catch (_) {}
    }

    // 3. Atualização / Criação em db.guests
    if (!Array.isArray(db.guests)) db.guests = [];
    let guest = matchedGuest || db.guests.find(g => {
      const gp = cleanPhone(g.phone || g.whatsapp || "");
      return gp && (cleanTarget.endsWith(gp.slice(-8)) || gp.endsWith(cleanTarget.slice(-8)));
    });

    if (guest) {
      guest.name = finalName;
      guest.cpf = cleanCpfNum;
      guest.autoEmitInvoice = true;
      if (emailFromText) guest.email = emailFromText.toLowerCase().trim();
      if (cleanCepNum) guest.cep = cleanCepNum;
      if (addressData.logradouro) guest.address = guest.logradouro = toTitleCase(addressData.logradouro);
      if (addressData.bairro) guest.neighborhood = guest.bairro = toTitleCase(addressData.bairro);
      if (addressData.cidade) guest.city = guest.cidade = toTitleCase(addressData.cidade);
      if (addressData.uf) guest.state = guest.uf = addressData.uf.toUpperCase();
      if (addressData.codigoMunicipio) guest.ibgeCode = guest.codigoMunicipio = addressData.codigoMunicipio;
      guest.updatedAt = new Date().toISOString();
    } else {
      guest = {
        id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: finalName,
        phone: cleanTarget,
        whatsapp: cleanTarget,
        cpf: cleanCpfNum,
        email: emailFromText.toLowerCase().trim(),
        cep: cleanCepNum,
        address: toTitleCase(addressData.logradouro),
        logradouro: toTitleCase(addressData.logradouro),
        number: addressData.numero,
        numero: addressData.numero,
        neighborhood: toTitleCase(addressData.bairro),
        bairro: toTitleCase(addressData.bairro),
        city: toTitleCase(addressData.cidade),
        cidade: toTitleCase(addressData.cidade),
        state: addressData.uf.toUpperCase(),
        uf: addressData.uf.toUpperCase(),
        ibgeCode: addressData.codigoMunicipio,
        codigoMunicipio: addressData.codigoMunicipio,
        autoEmitInvoice: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.guests.push(guest);
    }

    // 4. Atualização na Reserva
    if (matchedReservation) {
      matchedReservation.autoEmitInvoice = true;
      matchedReservation.invoiceDetails = {
        tomadorTipo: "PF",
        tomadorCpfCnpj: cleanCpfNum,
        tomadorNome: finalName,
        tomadorEmail: guest.email || "",
        tomadorTelefone: cleanTarget,
        tomadorCep: cleanCepNum || "",
        tomadorEndereco: guest.logradouro || guest.address || "",
        tomadorNumero: guest.numero || guest.number || "S/N",
        tomadorComplemento: guest.complemento || "",
        tomadorBairro: guest.bairro || guest.neighborhood || "",
        tomadorCidade: guest.cidade || guest.city || "Campos dos Goytacazes",
        tomadorUf: guest.uf || guest.state || "RJ",
        tomadorCodigoMunicipio: guest.codigoMunicipio || guest.ibgeCode || "3301009",
        autoEmitInvoice: true,
        solicitadoEm: new Date().toISOString()
      };
      matchedReservation.updatedAt = new Date().toISOString();
    }

    if (conv) {
      conv.awaitingFiscalData = false;
    }

    if (typeof createNotification === "function") {
      createNotification({
        category: "fiscal",
        title: `👤 Dados Fiscais PF Cadastrados: ${finalName}`,
        message: `CPF ${formatCpf(cleanCpfNum)} registrado para emissão de NFS-e via WhatsApp.`,
        type: "fiscal_pf_registered",
        targetUrl: "/notas",
        link: "/notas"
      });
    }

    const replyText = `Dados recebidos com sucesso${firstName ? `, ${firstName}` : ""}! Registramos o faturamento da Nota Fiscal em nome de **${finalName}** (CPF: ${formatCpf(cleanCpfNum)}). A sua NFS-e será emitida conforme solicitado. Muito obrigado! 🏨✨`;
    return await respond(replyText, {
      action: "registered_pf",
      guest,
      reservation: matchedReservation
    });
  }

  // ── CENÁRIO 3: Se estava aguardando dados e respondeu escolha PJ/PF sem documento ──
  if (isAwaitingFiscal) {
    const lower = messageText.toLowerCase();
    if (/\b(?:empresa|pj|pessoa\s*jur[ií]dica|corporativ[ao])\b/i.test(lower)) {
      const replyText = `Perfeito! Por gentileza, nos envie o número do **CNPJ** da empresa e o **e-mail financeiro** para emissão da nota fiscal. 🏢`;
      return await respond(replyText, { action: "prompted_pj_data" });
    }
    if (/\b(?:f[ií]sica|pf|pessoa\s*f[ií]sica|para\s*mim|no\s*meu\s*nome|particular)\b/i.test(lower)) {
      const replyText = `Perfeito! Por gentileza, nos informe seu **Nome Completo**, **CPF**, **Endereço com CEP** e **E-mail** para emissão da nota fiscal. 👤`;
      return await respond(replyText, { action: "prompted_pf_data" });
    }
  }

  // ── CENÁRIO 4: Cliente JÁ possui empresa vinculada no CRM (R3.2 - F13) ───────
  // Sem repetição de perguntas!
  if (linkedCompany && isValidCnpj(linkedCompany.cnpj)) {
    if (matchedReservation) {
      matchedReservation.companyId = linkedCompany.id;
      matchedReservation.companyName = linkedCompany.corporateName || linkedCompany.tradeName;
      matchedReservation.autoEmitInvoice = true;
      matchedReservation.invoiceDetails = {
        companyId: linkedCompany.id,
        companyName: linkedCompany.corporateName || linkedCompany.tradeName,
        tomadorTipo: "PJ",
        tomadorCpfCnpj: onlyDigits(linkedCompany.cnpj),
        tomadorNome: linkedCompany.corporateName || linkedCompany.tradeName,
        tomadorRazaoSocial: linkedCompany.corporateName || linkedCompany.tradeName,
        tomadorNomeFantasia: linkedCompany.tradeName || linkedCompany.corporateName,
        tomadorEmail: linkedCompany.financialEmail || linkedCompany.email || "",
        tomadorTelefone: linkedCompany.phone || cleanTarget,
        tomadorCep: onlyDigits(linkedCompany.cep || ""),
        tomadorEndereco: linkedCompany.logradouro || linkedCompany.address || "",
        tomadorNumero: linkedCompany.numero || linkedCompany.number || "S/N",
        tomadorComplemento: linkedCompany.complemento || linkedCompany.complement || "",
        tomadorBairro: linkedCompany.bairro || linkedCompany.neighborhood || "",
        tomadorCidade: linkedCompany.cidade || linkedCompany.city || "Campos dos Goytacazes",
        tomadorUf: linkedCompany.uf || linkedCompany.state || "RJ",
        tomadorCodigoMunicipio: linkedCompany.codigoMunicipio || linkedCompany.ibgeCode || "3301009",
        autoEmitInvoice: true,
        solicitadoEm: new Date().toISOString()
      };
      matchedReservation.updatedAt = new Date().toISOString();
    }

    if (matchedGuest) {
      matchedGuest.companyId = linkedCompany.id;
      matchedGuest.companyName = linkedCompany.corporateName || linkedCompany.tradeName;
      matchedGuest.autoEmitInvoice = true;
      matchedGuest.updatedAt = new Date().toISOString();
    }

    if (conv) {
      conv.awaitingFiscalData = false;
    }

    const replyText = `Olá${firstName ? `, ${firstName}` : ""}! Que ótimo, identificamos que a sua estadia já possui vínculo com a empresa **${linkedCompany.corporateName || linkedCompany.tradeName}** (CNPJ: ${formatCnpj(linkedCompany.cnpj)}). A sua Nota Fiscal (NFS-e) será emitida automaticamente com todos os dados corporativos cadastrados. Qualquer dúvida, estamos à disposição! 🏨✨`;
    return await respond(replyText, {
      action: "confirmed_existing_company",
      company: linkedCompany,
      reservation: matchedReservation
    });
  }

  // ── CENÁRIO 5: Cliente NÃO possui empresa vinculada (R3.3 - F14) ────────────
  // Envia onboarding acolhedor e didático perguntando PJ vs PF
  if (conv) {
    conv.awaitingFiscalData = true;
    conv.awaitingFiscalDataAt = new Date().toISOString();
  }

  const replyText = `Olá${firstName ? `, ${firstName}` : ""}! Com certeza podemos emitir a sua Nota Fiscal de Serviços (NFS-e)! 📄✨

Por favor, nos informe para quem a nota deve ser emitida:

🏢 **Para Empresa (Pessoa Jurídica - PJ):**
Basta nos informar o **CNPJ** da empresa e o **e-mail financeiro** para envio da nota.

👤 **Para Você (Pessoa Física - PF):**
Informe seu **Nome Completo**, **CPF**, **Endereço com CEP** e **E-mail**.

Assim que nos enviar, nosso sistema cuidará do preenchimento e emissão para você!`;

  return await respond(replyText, {
    action: "requested_fiscal_data",
    awaitingFiscalData: true
  });
}

/**
 * Processa mensagens recebidas no Webhook Z-API e aciona o Agente de IA de forma autônoma
 */
export async function processAiInboundMessage({
  db,
  incomingInfo,
  cleanTarget,
  saveDatabase,
  createNotification,
  sendZapiMessage,
  appendMessageFn
}) {
  if (!incomingInfo || incomingInfo.fromMe || incomingInfo.isGroup || !incomingInfo.text || !cleanTarget) {
    return { skipped: true, reason: "not_eligible" };
  }

  const aiConfig = getWhatsAppAiConfig(db);
  const aiChannel = db?.zapiConfig?.channels?.ai_agent || null;

  // 1. Verifica se a IA está habilitada globalmente ou no canal ai_agent
  if (aiConfig.enabled === false || aiChannel?.enabled === false) {
    return { skipped: true, reason: "ai_disabled" };
  }

  // 1.5. Verifica Blacklist do canal ai_agent
  const targetNorm = cleanWhatsAppPhone(cleanTarget);
  if (Array.isArray(aiChannel?.blacklist) && aiChannel.blacklist.length > 0) {
    const isBlacklisted = aiChannel.blacklist
      .map(p => cleanWhatsAppPhone(p))
      .filter(Boolean)
      .some(b => targetNorm.endsWith(b.slice(-8)) || b.endsWith(targetNorm.slice(-8)));
    if (isBlacklisted) {
      console.log(`[WhatsApp AI] Número ${cleanTarget} na Blacklist do canal ai_agent. Ignorado.`);
      return { skipped: true, reason: "blacklisted" };
    }
  }

  // 2. Obtém ou cria a conversa antes da checagem de modo de teste / pausa
  let conv = (db?.whatsappConversations || []).find(c => {
    const p = cleanWhatsAppPhone(c.phone);
    return p && (p.endsWith(cleanTarget.slice(-8)) || cleanTarget.endsWith(p.slice(-8)));
  });

  const isDev = isDeveloperPhone(cleanTarget, db);

  // 2.5. Verifica se o canal ai_agent está em Modo de Teste (independente de guest_schedule)
  const isAiTestMode = aiChannel
    ? Boolean(aiChannel.testMode)
    : (db?.zapiConfig?.aiAgent?.testMode !== undefined ? Boolean(db.zapiConfig.aiAgent.testMode) : Boolean(db?.zapiConfig?.testModeOnly));

  if (isAiTestMode) {
    const rawWhitelist = Array.isArray(aiChannel?.whitelist) && aiChannel.whitelist.length > 0
      ? aiChannel.whitelist
      : [...DEFAULT_TEST_ALLOWED_PHONES, ...String(db?.zapiConfig?.testAllowedPhones || "").split(/[,\s]+/)];
    const allowed = rawWhitelist
      .map(p => cleanWhatsAppPhone(p))
      .filter(Boolean);
    const isAllowed = isDev || allowed.some(a => targetNorm.endsWith(a.slice(-8)) || a.endsWith(targetNorm.slice(-8)));
    if (!isAllowed && aiChannel?.redirectToWhitelistOnTest !== true) {
      let activePreResTestEval = null;
      if (!isDev && conv && isOperatorConductingConversation(conv, db, incomingInfo)) {
        try {
          activePreResTestEval = await evaluateAndNotifyActivePreReservation({
            db,
            conv,
            cleanTarget,
            incomingInfo,
            saveDatabase,
            createNotification,
            sendZapiMessage,
            appendMessageFn
          });
        } catch (err) {
          console.warn("[Active Pre-Reservation Assistant] Erro ao avaliar conversa em modo de teste:", err.message);
        }
      }
      console.log(`[WhatsApp AI] Modo de Teste da IA ativo: mensagem de ${cleanTarget} ignorada pela IA.`);
      return {
        skipped: true,
        reason: "test_mode_not_allowed",
        ...(activePreResTestEval ? { activePreReservation: activePreResTestEval } : {})
      };
    }
  }

  if (!conv && Array.isArray(db?.whatsappConversations)) {
    conv = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      phone: cleanTarget,
      name: incomingInfo.senderName || "Hóspede",
      messages: [],
      unreadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.whatsappConversations.push(conv);
  }

  // 3.0. Assistente Ativa de Pré-Reservas: Intercepta resposta do gestor/desenvolvedor (22998505276)
  if (isDev) {
    const preResReply = await handleManagerPreReservationReply({
      db,
      cleanTarget,
      messageText: incomingInfo.text,
      conv,
      sendZapiMessage,
      appendMessageFn,
      saveDatabase,
      createNotification
    });
    if (preResReply && preResReply.handled) {
      return preResReply;
    }
  }

  // 3.1. Interceptador de Fluxo Fiscal WhatsApp (Milestone M3: Features F12 a F17)
  const fiscalResult = await handleWhatsAppFiscalFlow({
    db,
    cleanTarget,
    messageText: incomingInfo.text,
    senderName: incomingInfo.senderName,
    conv,
    sendZapiMessage,
    appendMessageFn,
    saveDatabase,
    createNotification
  });

  if (fiscalResult && fiscalResult.handled) {
    return fiscalResult;
  }

  // Se a conversa estiver pausada manualmente (operador assumiu ou hóspede pediu humano)
  if (conv && conv.aiPaused === true) {
    if (isDev) {
      console.log(`[WhatsApp AI] Mensagem de desenvolvedor recebida em conversa pausada. Restaurando atividade da IA.`);
      conv.aiPaused = false;
      conv.aiPausedReason = null;
      conv.isDeveloper = true;
    } else {
      let activePreResEval = null;
      try {
        activePreResEval = await evaluateAndNotifyActivePreReservation({
          db,
          conv,
          cleanTarget,
          incomingInfo,
          saveDatabase,
          createNotification,
          sendZapiMessage,
          appendMessageFn
        });
      } catch (err) {
        console.warn("[Active Pre-Reservation Assistant] Erro ao avaliar conversa pausada:", err.message);
      }
      console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
      return {
        skipped: true,
        reason: "conversation_ai_paused",
        ...(activePreResEval ? { activePreReservation: activePreResEval } : {})
      };
    }
  }

  // Se o operador humano está conduzindo a conversa no histórico (mesmo que aiPaused não estivesse marcado)
  if (!isDev && conv && conv.aiPaused !== false && hasHumanOperatorMessagesInConversation(conv, db)) {
    let activePreResEval = null;
    try {
      activePreResEval = await evaluateAndNotifyActivePreReservation({
        db,
        conv,
        cleanTarget,
        incomingInfo,
        saveDatabase,
        createNotification,
        sendZapiMessage,
        appendMessageFn
      });
    } catch (err) {
      console.warn("[Active Pre-Reservation Assistant] Erro ao avaliar conversa conduzida pelo operador:", err.message);
    }
    return {
      skipped: true,
      reason: "conversation_ai_paused",
      ...(activePreResEval ? { activePreReservation: activePreResEval } : {})
    };
  }

  // 3.5. Roteamento do Desenvolvedor (Tri-Modal Coaching Engine)
  if (isDev) {
    if (conv) conv.isDeveloper = true;
    const devClassification = classifyDeveloperMessage(incomingInfo.text, db);

    if (devClassification.type === "tone_calibration") {
      console.log(`[WhatsApp AI Developer Mode] Comando de Calibração de Tom recebido de ${cleanTarget}:`, devClassification.updates);
      const updatedTone = applyToneCalibration(db, devClassification.updates);
      if (typeof saveDatabase === "function") {
        try { saveDatabase("developer_tone_calibrated"); } catch (_) {}
      }

      const confirmationText = formatDeveloperToneConfirmation({
        toneUpdates: devClassification.updates,
        tone: updatedTone,
        db
      });

      if (typeof sendZapiMessage === "function") {
        await sendZapiMessage(db.zapiConfig, {
          phone: cleanTarget,
          message: confirmationText,
          channelId: "ai_agent",
          recipientRole: "guest",
          db
        });
      }

      if (typeof appendMessageFn === "function") {
        appendMessageFn(db, {
          phone: cleanTarget,
          senderName: aiConfig.agentName || "Sofia",
          fromMe: true,
          text: confirmationText,
          status: "delivered",
          messageId: `dev_tone_${Date.now()}`
        });
      }

      return {
        handled: true,
        processed: true,
        mode: "developer_coaching",
        type: "tone_calibration",
        replyText: confirmationText,
        toneSettings: updatedTone
      };
    }

    if (devClassification.type === "factual_coaching") {
      let finalGuideline = devClassification.guideline;
      const devApiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY || aiConfig?.apiKey || null;
      if (devApiKey) {
        try {
          const aiSynthesized = await synthesizeDeveloperCoachingWithAi({
            rawText: incomingInfo.text,
            category: devClassification.guideline?.category,
            targetFlat: devClassification.guideline?.targetFlat,
            apiKey: devApiKey,
            db
          });
          if (aiSynthesized && aiSynthesized.ruleText) {
            finalGuideline = {
              ...devClassification.guideline,
              text: aiSynthesized.ruleText,
              category: aiSynthesized.category || devClassification.guideline?.category,
              sample: aiSynthesized.sampleResponse,
              sampleResponse: aiSynthesized.sampleResponse
            };
          }
        } catch (err) {
          console.warn("[WhatsApp AI Developer Mode] Erro na síntese via IA, mantendo heurística:", err?.message || err);
        }
      }

      console.log(`[WhatsApp AI Developer Mode] Treinamento Factual recebido de ${cleanTarget}:`, finalGuideline);
      const newGuideline = saveDeveloperGuideline(db, finalGuideline);
      if (typeof saveDatabase === "function") {
        try { saveDatabase("developer_guideline_saved"); } catch (_) {}
      }

      const confirmationText = formatDeveloperCoachingConfirmation({
        newGuideline,
        sampleResponse: newGuideline.sampleResponse || newGuideline.sample,
        db
      });

      if (typeof sendZapiMessage === "function") {
        await sendZapiMessage(db.zapiConfig, {
          phone: cleanTarget,
          message: confirmationText,
          channelId: "ai_agent",
          recipientRole: "guest",
          db
        });
      }

      if (typeof appendMessageFn === "function") {
        appendMessageFn(db, {
          phone: cleanTarget,
          senderName: aiConfig.agentName || "Sofia",
          fromMe: true,
          text: confirmationText,
          status: "delivered",
          messageId: `dev_guideline_${Date.now()}`
        });
      }

      return {
        handled: true,
        processed: true,
        mode: "developer_coaching",
        type: "factual_coaching",
        replyText: confirmationText,
        guideline: newGuideline
      };
    }

    // Se for guest_simulation, continua o fluxo normal abaixo simulando hóspede
    console.log(`[WhatsApp AI Developer Mode] Simulação de Hóspede por ${cleanTarget}: gerando resposta como Sofia Concierge.`);
  }

  // 4. Verifica Modo de Atuação
  if (aiConfig.mode === "copilot") {
    let activePreResEval = null;
    if (!isDev && conv) {
      try {
        activePreResEval = await evaluateAndNotifyActivePreReservation({
          db,
          conv,
          cleanTarget,
          incomingInfo,
          saveDatabase,
          createNotification,
          sendZapiMessage,
          appendMessageFn
        });
      } catch (err) {
        console.warn("[Active Pre-Reservation Assistant] Erro ao avaliar conversa em modo copilot:", err.message);
      }
    }
    // Modo apenas Copiloto: não responde sozinho
    return {
      skipped: true,
      reason: "mode_copilot_only",
      ...(activePreResEval ? { activePreReservation: activePreResEval } : {})
    };
  }

  if (aiConfig.mode === "off_hours" && !isDev) {
    // Horário fora de expediente
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brDate = new Date(utc + (-3 * 60 * 60000));
    const currentHour = brDate.getHours() + (brDate.getMinutes() / 60);

    const [startH, startM] = (aiConfig.offHoursStart || "18:00").split(":").map(Number);
    const [endH, endM] = (aiConfig.offHoursEnd || "08:00").split(":").map(Number);
    const startVal = startH + (startM / 60);
    const endVal = endH + (endM / 60);

    let isOffHours = false;
    if (startVal > endVal) {
      // Ex: 18:00 às 08:00 (cruza meia-noite)
      isOffHours = currentHour >= startVal || currentHour <= endVal;
    } else {
      isOffHours = currentHour >= startVal && currentHour <= endVal;
    }

    if (!isOffHours) {
      let activePreResEval = null;
      if (conv) {
        try {
          activePreResEval = await evaluateAndNotifyActivePreReservation({
            db,
            conv,
            cleanTarget,
            incomingInfo,
            saveDatabase,
            createNotification,
            sendZapiMessage,
            appendMessageFn
          });
        } catch (err) {
          console.warn("[Active Pre-Reservation Assistant] Erro ao avaliar conversa em horário comercial:", err.message);
        }
      }
      console.log(`[WhatsApp AI] Modo Fora do Expediente ativo, mas está em horário comercial (${brDate.toLocaleTimeString()}).`);
      return {
        skipped: true,
        reason: "business_hours_active",
        ...(activePreResEval ? { activePreReservation: activePreResEval } : {})
      };
    }
  }

  // 5. Histórico da conversa
  const history = conv?.messages || [];

  // 6. Gera a resposta do Agente de IA
  const aiResult = await generateAiWhatsAppResponse({
    db,
    phone: cleanTarget,
    messageText: incomingInfo.text,
    history,
    isCopilot: false
  });

  // 6.5. Auto-Aprendizado: Detecção e Registro de Perguntas Não Mapeadas (R2)
  const isQuestion = isPotentialGuestQuestion(incomingInfo.text);
  const isMapped = isQuestionMappedInFaq(incomingInfo.text, db, cleanTarget);
  const isFallback = aiResult.modelUsed === "heuristic_fallback" || aiResult.source === "heuristic";
  const needsHandoverOrFallback = Boolean(aiResult.shouldHandover || aiResult.requiresHandover || isFallback);

  let unmappedFaq = aiResult.preAnalysis?.pendingFaq || null;
  const isDevCoaching = isDev && classifyDeveloperMessage(incomingInfo.text, db)?.type !== "guest_simulation";
  if (!unmappedFaq && isQuestion && !isMapped && needsHandoverOrFallback && !isDevCoaching) {
    unmappedFaq = autoCreatePendingFaq({
      db,
      questionText: incomingInfo.text,
      senderPhone: incomingInfo.senderPhone || cleanTarget,
      senderName: incomingInfo.senderName || conv?.name || "Hóspede",
      saveDatabase,
      createNotification
    });
  }

  // 6.6. Mapeamento de Demandas Não Atendidas & Oportunidades de Automação
  let unmetDemand = aiResult.unmetDemand || null;
  const isActionDisabled = Boolean(
    aiResult.functionResult?.error === "ACTION_DISABLED" ||
    (aiResult.requiresHandover && aiResult.functionCall)
  );
  const actionTarget = aiResult.functionCall?.name || (aiResult.functionResult?.action || null);
  const demandClassification = classifyUnmetDemand(incomingInfo.text, isActionDisabled ? actionTarget : null);
  const isOperationalDemand = demandClassification.category !== "outros" && demandClassification.category !== "operacoes_sistema_pausadas";
  const isMissingSystemDataOrCapability = Boolean(aiResult.missingDataOrCapability || (isQuestion && !isMapped && needsHandoverOrFallback));

  if (!unmetDemand && (isActionDisabled || aiResult.shouldHandover || aiResult.requiresHandover || isOperationalDemand || isMissingSystemDataOrCapability)) {
    try {
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: incomingInfo.text,
        senderPhone: incomingInfo.senderPhone || cleanTarget,
        senderName: incomingInfo.senderName || conv?.name || "Hóspede",
        guestContext: aiResult.guestContext || null,
        actionTarget: isActionDisabled ? actionTarget : null,
        reason: isActionDisabled ? "action_disabled" : ((aiResult.shouldHandover || aiResult.missingDataOrCapability) ? "capability_missing" : "requires_operator"),
        saveDatabase,
        createNotification
      });
    } catch (demErr) {
      console.warn("[Demandas IA] Erro ao registrar demanda não atendida:", demErr.message);
    }
  }

  // 6.8. Proteção Anti-Loop de Mensagens Idênticas Fail-Safe
  // Executa ANTES do envio (seja transbordo humano ou resposta autônoma normal)
  const lastBotMsg = getLastBotMessage(history);
  if (lastBotMsg && areMessagesSubstantiallyIdentical(aiResult.replyText, lastBotMsg.text)) {
    const repetitionCheck = applyAntiRepetitionGuard({
      candidateText: aiResult.replyText,
      history,
      queryText: incomingInfo.text,
      guestContext: aiResult.guestContext,
      db
    });
    if (repetitionCheck.wasRepetitive && repetitionCheck.refinedText) {
      console.log(`[Anti-Repetition Guard Fail-Safe] Substituindo resposta repetida antes do envio.`);
      aiResult.replyText = repetitionCheck.refinedText;
    }
  }

  // 7. Se for transbordo humano:
  if (aiResult.shouldHandover) {
    if (conv && !isDev) {
      conv.aiPaused = true;
      conv.aiPausedAt = new Date().toISOString();
      conv.aiPausedReason = detectHandoverIntent(incomingInfo.text)?.shouldHandover
        ? "guest_requested_human"
        : "system_handover";
    }

    // Envia mensagem educada de transbordo
    if (typeof sendZapiMessage === "function") {
      await sendZapiMessage(db.zapiConfig, {
        phone: cleanTarget,
        message: aiResult.replyText,
        channelId: "ai_agent",
        recipientRole: "guest",
        db
      });
    }

    // Registra a mensagem no histórico do chat
    if (typeof appendMessageFn === "function") {
      appendMessageFn(db, {
        phone: cleanTarget,
        senderName: aiConfig.agentName || "Sofia",
        fromMe: true,
        text: aiResult.replyText,
        type: "text",
        status: "delivered",
        timestamp: new Date().toISOString()
      });
    }

    // Notificação de alta prioridade para o operador
    if (typeof createNotification === "function") {
      createNotification({
        category: "whatsapp",
        title: `🚨 Transbordo Humano: ${conv?.name || cleanTarget}`,
        message: `Hóspede solicitou atendimento humano no WhatsApp ("${incomingInfo.text}"). IA pausada na conversa.`,
        type: "whatsapp_handover",
        targetUrl: `/whatsapp-chat?phone=${cleanTarget}`,
        link: `/whatsapp-chat?phone=${cleanTarget}`
      });
    }

    if (typeof saveDatabase === "function") saveDatabase();
    return {
      handled: true,
      handover: true,
      replyText: aiResult.replyText,
      unmappedFaqCreated: Boolean(unmappedFaq),
      unmappedFaq,
      unmetDemandCreated: Boolean(unmetDemand),
      unmetDemand
    };
  }

  // 8. Resposta Autônoma Normal:
  const delaySec = typeof aiConfig.responseDelaySeconds === "number" ? aiConfig.responseDelaySeconds : 3;
  const delayMs = (process.env.NODE_ENV === "test" || delaySec === 0) ? 0 : Math.max(500, delaySec * 1000);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  if (typeof sendZapiMessage === "function") {
    await sendZapiMessage(db.zapiConfig, {
      phone: cleanTarget,
      message: aiResult.replyText,
      channelId: "ai_agent",
      recipientRole: "guest",
      db
    });
  }

  if (typeof appendMessageFn === "function") {
    appendMessageFn(db, {
      phone: cleanTarget,
      senderName: aiConfig.agentName || "Sofia",
      fromMe: true,
      text: aiResult.replyText,
      type: "text",
      status: "delivered",
      timestamp: new Date().toISOString()
    });
  }

  if (typeof saveDatabase === "function") saveDatabase();

  return {
    handled: true,
    handover: false,
    replyText: aiResult.replyText,
    source: aiResult.source,
    modelUsed: aiResult.modelUsed,
    unmappedFaqCreated: Boolean(unmappedFaq),
    unmappedFaq,
    unmetDemandCreated: Boolean(unmetDemand),
    unmetDemand
  };
}

/**
 * Refinamento e Regeneração de Sugestões de Respostas de FAQ com IA
 * Permite ao operador indicar qual a resposta correta ou o que deseja mudar,
 * gerando 3 opções contextualizadas e formatadas para WhatsApp.
 */
export async function generateFaqResponseSuggestions({
  question = "",
  currentAnswer = "",
  instruction = "",
  category = "estrutura_flat",
  db = null,
  aiConfig = null
}) {
  const cfg = aiConfig || getWhatsAppAiConfig(db);
  const kb = cfg.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;

  const cleanInstruction = String(instruction || "").trim();
  const cleanQuestion = String(question || "").trim();

  // 1. Se houver chave Gemini, tenta gerar alternativas via LLM
  if (apiKey) {
    try {
      const systemInstruction = `Você é o redator oficial do FAQ e das respostas da Sofia (Concierge Virtual da CorpFlats Hotéis).
Seu objetivo é gerar opções de respostas profissionais, corretas e acolhedoras para WhatsApp com base na orientação do operador.

[DADOS DO HOTEL CORPFLATS]:
- Endereço: ${kb.address}
- Check-in: ${kb.checkinTime} | Check-out: ${kb.checkoutTime}
- Wi-Fi: Individual por flat (apto {número}), senha ${kb.wifiPassword}
- Estrutura e Comodidades: ${kb.amenities}
- Café da manhã: ${kb.breakfastInfo}
- Garagem: ${kb.garageInfo}
- Pets: ${kb.petPolicy}
- Lazer: ${kb.leisureInfo || "Piscina/jacuzzi aquecida e academia na cobertura 06h às 22h"}

[REGRAS DE FORMATAÇÃO WHATSAPP]:
- Use *negrito* para termos-chave e horários.
- Use emojis elegantes e moderados (ex: ✨, 🏨, 🛎️, ☕, 🚗).
- Não use markdown complexo como tabelas ou títulos (#); apenas formatação nativa de WhatsApp.
- Gere EXATAMENTE 3 opções com propostas de tom distintas:
  1. "Direta & Objetiva" (1 a 2 frases concisas, ideal para quem quer rapidez)
  2. "Completa & Acolhedora" (mais calorosa, trazendo detalhes úteis e acolhimento)
  3. "Executiva & Formal" (tom profissional e corporativo)`;

      const prompt = `[PERGUNTA DO HÓSPEDE]:
"${cleanQuestion}"

[RESPOSTA ANTERIOR / SUGERIDA]:
"${currentAnswer || "Nenhuma"}"

[ORIENTAÇÃO DO OPERADOR / O QUE DEVE SER DITO OU MUDADO]:
"${cleanInstruction}"

Retorne EXCLUSIVAMENTE um objeto JSON no seguinte formato:
{
  "suggestions": [
    { "id": "opt_1", "label": "Direta & Objetiva", "text": "..." },
    { "id": "opt_2", "label": "Completa & Acolhedora", "text": "..." },
    { "id": "opt_3", "label": "Executiva & Formal", "text": "..." }
  ]
}`;

      const res = await callGeminiAi({
        apiKey,
        systemInstruction,
        prompt,
        db,
        customPrompt: true
      });

      if (res?.ok && res?.text) {
        const jsonMatch = res.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
            return {
              success: true,
              source: "gemini",
              suggestions: parsed.suggestions.map((s, idx) => ({
                id: s.id || `opt_${idx + 1}`,
                label: s.label || (idx === 0 ? "Direta & Objetiva" : (idx === 1 ? "Completa & Acolhedora" : "Executiva & Formal")),
                text: String(s.text || "").trim()
              }))
            };
          }
        }
      }
    } catch (llmErr) {
      console.warn("[FAQ Suggestion Refinement] Gemini falhou ou indisponível, gerando via motor heurístico inteligente:", llmErr.message);
    }
  }

  // 2. Motor Heurístico Contextual Inteligente (Geração garantida 100% offline / resiliente)
  let cleanDir = cleanInstruction
    .replace(/^(?:dizer\s+que|informar\s+que|explicar\s+que|falar\s+que|responder\s+que)\s+/i, "")
    .replace(/^(?:diga\s+que|informe\s+que|explique\s+que|fale\s+que|responda\s+que)\s+/i, "")
    .trim();

  // Se o usuário digitou apenas "Sim" ou "Não"
  if (/^sim[.!]*$/i.test(cleanDir)) {
    cleanDir = generateIntelligentFaqDraft(cleanQuestion, db, category) || "temos essa comodidade à disposição";
    cleanDir = cleanDir.replace(/^Sim!\s*/i, "").trim();
  } else if (/^n[aã]o[.!]*$/i.test(cleanDir)) {
    cleanDir = "não dispomos dessa comodidade no momento";
  }

  // Se não foi fornecida instrução, gera rascunho com base na pergunta
  if (!cleanDir) {
    cleanDir = generateIntelligentFaqDraft(cleanQuestion, db, category) || "nossos flats dispõem de acomodação executiva completa com total conforto";
    cleanDir = cleanDir.replace(/^Sim!\s*/i, "").trim();
  }

  // Verifica se é uma instrução negativa / restritiva
  const isNegative = /^(?:n[aã]o|nunca|proibid[ao]|sem\b|indispon[ií]vel)/i.test(cleanDir) ||
                     /\b(?:n[aã]o\s+(?:temos|h[aá]|possu[ií]|aceita|permite|disp[oõ]e|conta|fornece|est[aá]|pode)|proibid[ao]\s+|sem\s+(?:vaga|estrutura|micro|aceite)|indispon[ií]vel)\b/i.test(cleanDir);

  // Normaliza o texto principal mantendo verbos e substantivos intactos
  let coreDirective = cleanDir
    .replace(/^sim[,!]\s*/i, "")
    .replace(/^n[aã]o,\s*(?:n[aã]o\s+)?/i, "não ")
    .trim();

  if (isNegative && !/^n[aã]o\b/i.test(coreDirective)) {
    if (/^proibid[ao]\b/i.test(coreDirective)) {
      coreDirective = `é ${coreDirective}`;
    } else if (/^(?:sem\b|indispon[ií]vel)/i.test(coreDirective)) {
      coreDirective = `está ${coreDirective}`;
    } else {
      coreDirective = `não ${coreDirective}`;
    }
  }

  // Normalização de capitalização
  coreDirective = coreDirective.charAt(0).toLowerCase() + coreDirective.slice(1);
  coreDirective = coreDirective.replace(/[.!?]+$/, "");

  let opt1 = "";
  let opt2 = "";
  let opt3 = "";

  if (isNegative) {
    opt1 = `Olá! ✨ Informamos que ${coreDirective}. Qualquer dúvida, estamos à total disposição! 🏨`;
    opt2 = `Olá! ✨ No momento, ${coreDirective}. Nosso time está à disposição caso necessite de qualquer assistência ou comodidade adicional! 😊`;
    opt3 = `Olá! Confirmamos que ${coreDirective}. Permanecemos à inteira disposição para o que você precisar durante a sua hospedagem. 🛎️`;
  } else {
    const isExplicitAffirmative = /^(?:sim\b|temos\b|disp[oõ]e|conta\b|possui|pode|liberad[ao]|incluso)/i.test(coreDirective);
    const isInformative = /^(?:o\s+caf[eé]|o\s+check|a\s+voltagem|o\s+hor[aá]rio|a\s+taxa|o\s+valor|o\s+endere[cç]o|a\s+senha|a\s+rede|a\s+garagem|a\s+piscina|a\s+academia|das\b|de\s+\d|a\s+partir)/i.test(coreDirective);

    if (isExplicitAffirmative) {
      opt1 = `Olá! ✨ Sim, ${coreDirective}. Qualquer dúvida, estamos à total disposição! 🏨`;
      opt2 = `Olá! ✨ Sim, ${coreDirective}. Todos os flats da CorpFlats contam com estrutura pensada no seu conforto e praticidade. Se precisar de qualquer suporte, basta me avisar! 😊`;
      opt3 = `Olá! Confirmamos que ${coreDirective}. Permanecemos à inteira disposição para o que você necessitar durante sua hospedagem. 🛎️`;
    } else if (isInformative) {
      const capitalized = coreDirective.charAt(0).toUpperCase() + coreDirective.slice(1);
      opt1 = `Olá! ✨ ${capitalized}. Qualquer dúvida, estamos à total disposição! 🏨`;
      opt2 = `Olá! ✨ ${capitalized}. Se precisar de qualquer suporte adicional, estou à disposição por aqui! 😊`;
      opt3 = `Olá! Informamos que ${coreDirective}. Permanecemos à inteira disposição durante a sua hospedagem. 🛎️`;
    } else {
      const capitalized = coreDirective.charAt(0).toUpperCase() + coreDirective.slice(1);
      opt1 = `Olá! ✨ ${capitalized}. Qualquer dúvida, estamos à disposição! 🏨`;
      opt2 = `Olá! ✨ Sim, ${coreDirective}. Nosso time CorpFlats está à total disposição caso precise de algo mais! 😊`;
      opt3 = `Olá! Confirmamos que ${coreDirective}. Permanecemos à inteira disposição para auxiliá-lo. 🛎️`;
    }
  }

  return {
    success: true,
    source: "heuristic_smart_generator",
    suggestions: [
      { id: "opt_1", label: "Direta & Objetiva", text: opt1 },
      { id: "opt_2", label: "Completa & Acolhedora", text: opt2 },
      { id: "opt_3", label: "Executiva & Formal", text: opt3 }
    ]
  };
}


/**
 * Motor da Sofia Assistente Ativa em Tempo Real para o WhatsApp Web (/sofia-assist)
 * Gera simultaneamente:
 * 1. Sugestões de respostas prontas para a última mensagem do hóspede;
 * 2. Ações operacionais no sistema (1 clique) conforme o teor da conversa;
 * 3. Botões de envio rápido dinâmicos ordenados pelo momento da estadia e assunto atual.
 */
export async function generateSofiaRealtimeAssistance({
  db,
  phone,
  draftText = "",
  reservationCode = null,
  skipLlm = false
}) {
  const cleanPhone = cleanWhatsAppPhone(phone) || normalizePhone(phone);
  const conv = (db?.whatsappConversations || []).find(c => {
    const p = cleanWhatsAppPhone(c.phone);
    return p && cleanPhone && (p.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(p.slice(-8)));
  });

  const history = Array.isArray(conv?.messages) ? conv.messages : [];
  const guestContext = buildGuestContext({ db, phone: cleanPhone, history });

  let res = guestContext.reservation || null;
  if (reservationCode && Array.isArray(db?.reservations)) {
    const explicitRes = db.reservations.find(r => String(r?.code || "").toLowerCase() === String(reservationCode).toLowerCase());
    if (explicitRes) res = explicitRes;
  }

  const guestName = res?.guestName || conv?.name || guestContext.guestName || "Hóspede";
  const firstName = String(guestName).trim().split(/\s+/)[0] || "Hóspede";
  const flatNumber = String(res?.flatNumber || conv?.flatNumber || guestContext.flatNumber || "").trim();
  const resCode = String(res?.code || conv?.reservationCode || "").trim();
  const stayStage = guestContext.stayStatus || (res ? "reserva_futura" : "sem_reserva");

  const inboundMessages = history.filter(m => m && !m.fromMe && m.text);
  const lastInbound = inboundMessages.length > 0 ? inboundMessages[inboundMessages.length - 1] : null;
  const lastInboundText = String(lastInbound?.text || "").trim();
  const recentGuestText = inboundMessages.slice(-3).map(m => m.text).join(" \n ");

  const aiConfig = getWhatsAppAiConfig(db);
  const preAnalysis = prepareAgenticPreAnalysis({
    queryText: lastInboundText || draftText || "Olá",
    guestContext,
    db,
    aiConfig,
    history
  });
  const convState = preAnalysis.convState || {};

  // 1. Detecção de Entidades e Intenções em Tempo Real
  const lowerLast = lastInboundText.toLowerCase();

  const plateMatch = lastInboundText.match(/\b([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/i) ||
                     recentGuestText.match(/\b(?:placa|carro|ve[ií]culo|garagem)[:\s-]*([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})\b/i);
  const plateDetected = plateMatch ? plateMatch[1].replace(/[-\s]/g, "").toUpperCase() : null;

  const carModelMatch = lastInboundText.match(/\b(corolla|hilux|compass|renegade|toro|onix|hb20|creta|tracker|t-cross|nivus|polo|virtus|gol|civic|hr-v|hrv|kicks|versa|sentra|strada|pulse|fastback|argo|cronos|mobi|ranger|s10|amarok|sw4|byd|dolphin|song|haval|bmw|mercedes|audi)\b/i);
  const vehicleModelDetected = carModelMatch ? carModelMatch[1] : null;

  let arrivalTimeDetected = null;
  if (/\b(chegando\s+agora|j[aá]\s+cheguei|estou\s+na\s+porta|na\s+recep[cç][aã]o|na\s+portaria)\b/i.test(lowerLast)) {
    arrivalTimeDetected = "Chegando agora";
  } else {
    const arrMatch = lastInboundText.match(/(?:cheg(?:o|ar|aremos|ada)|previs[aã]o|por\s+volta\s+d[ea]s?|[aà]s)\s*([0-2]?\d)(?:[:hH](\d{2}))?\s*(?:h|horas)?\b/i);
    if (arrMatch) {
      const hh = parseInt(arrMatch[1], 10);
      const mm = parseInt(arrMatch[2] || "0", 10);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        arrivalTimeDetected = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
    }
  }

  const maintenanceMatch = lowerLast.match(/\b(ar[- ]?condicionado|chuveiro|[aá]gua\s+fria|vazamento|goteira|l[aã]mpada|luz\s+queimada|fechadura|porta\s+n[aã]o\s+abre|tv|televis[aã]o|frigobar|tomada|pia\s+entupida|vaso|ralo|n[aã]o\s+funciona|quebrad[oa]|defeito|parou\s+de\s+funcionar)\b/i);
  const maintenanceDetected = maintenanceMatch ? maintenanceMatch[1] : null;

  const hkMatch = lowerLast.match(/\b(toalha|toalhas|travesseiro|travesseiros|len[cç]ol|cobertor|manta|papel\s+higi[eê]nico|sabonete|shampoo|ferro\s+de\s+passar|cabide|limpeza\s+no\s+quarto|arrumar\s+o\s+quarto)\b/i);
  const housekeepingItemDetected = hkMatch ? hkMatch[1] : null;

  const checkoutAnnounced = /\b(j[aá]\s+sa[ií]|j[aá]\s+sa[ií]mos|j[aá]\s+desocupei|j[aá]\s+desocupamos|deixei\s+a\s+chave|deixei\s+o\s+cart[aã]o|entreguei\s+a\s+chave|fiz\s+o\s+check-?out|estou\s+saindo\s+do\s+flat|acabamos\s+de\s+sair)\b/i.test(lowerLast);

  const topicFlags = {
    wifi: /\b(wi-?fi|internet|senha|rede|conectar)\b/i.test(lowerLast),
    cafe: /\b(caf[eé]|desjejum|bandeja|card[aá]pio|p[aã]o)\b/i.test(lowerLast),
    checkin: /\b(check-?in|ficha|cadastro|entrar|portaria|hor[aá]rio\s+de\s+entrada|early)\b/i.test(lowerLast),
    checkout: /\b(check-?out|sa[ií]da|hor[aá]rio\s+de\s+sair|late\s+check|prorrogar|estender)\b/i.test(lowerLast) || checkoutAnnounced,
    garagem: /\b(garagem|estacionamento|vaga|placa|carro|ve[ií]culo|port[aã]o)\b/i.test(lowerLast) || Boolean(plateDetected),
    localizacao: /\b(endere[cç]o|localiza[cç][aã]o|onde\s+fica|maps|chegar|rua|bairro)\b/i.test(lowerLast),
    pagamento: /\b(pix|pagamento|pagar|valor|total|sinal|comprovante|cart[aã]o|cobran[cç]a)\b/i.test(lowerLast),
    cotacao: /\b(di[aá]ria|quanto\s+custa|quanto\s+t[aá]|pre[cç]o|cota[cç][aã]o|vaga|disponibilidade|reservar|reserva)\b/i.test(lowerLast),
    nfse: /\b(nota\s+fiscal|nfs-?e|nf|recibo|cnpj|reembolso|fatura)\b/i.test(lowerLast),
    manual: /\b(manual|guia|instru[cç][oõ]es|piscina|academia|cobertura|lazer|regra|pet|voltagem)\b/i.test(lowerLast)
  };

  let detectedIntent = "atendimento_geral";
  for (const [k, v] of Object.entries(topicFlags)) {
    if (v) {
      detectedIntent = k;
      break;
    }
  }
  if (maintenanceDetected) detectedIntent = "manutencao";
  else if (housekeepingItemDetected) detectedIntent = "governanca";
  else if (plateDetected) detectedIntent = "garagem_placa";
  else if (arrivalTimeDetected) detectedIntent = "previsao_chegada";

  // 2. Construção das Ações Sugeridas no Sistema (1-Clique)
  const suggestedActions = [];

  if (plateDetected && res) {
    suggestedActions.push({
      id: "act_register_plate",
      actionType: "register_vehicle_plate",
      icon: "🚗",
      label: `Salvar Placa ${plateDetected}${vehicleModelDetected ? ` (${vehicleModelDetected})` : ""} • Flat ${flatNumber}`,
      description: `Cadastra a placa ${plateDetected} na reserva ${resCode} e libera na Garagem/Portaria.`,
      variant: "emerald",
      payload: {
        reservationCode: resCode,
        flatNumber,
        vehiclePlate: plateDetected,
        vehicleModel: vehicleModelDetected || res.vehicleModel || ""
      },
      confirmReply: `Perfeito, *${firstName}*! Já cadastrei a placa *${plateDetected}*${vehicleModelDetected ? ` (${vehicleModelDetected})` : ""} na sua reserva do *Flat ${flatNumber}* e liberei sua entrada na garagem com a portaria 24h! 🚗✅`
    });
  }

  if (arrivalTimeDetected && res && stayStage !== "checkout_concluido") {
    suggestedActions.push({
      id: "act_arrival_priority",
      actionType: "prioritize_cleaning_arrival",
      icon: "⚡",
      label: `Registrar Chegada (${arrivalTimeDetected}) & Priorizar Flat ${flatNumber}`,
      description: `Atualiza a previsão de chegada na reserva ${resCode} e marca o Flat ${flatNumber} como prioridade no painel de limpeza.`,
      variant: "amber",
      payload: {
        reservationCode: resCode,
        flatNumber,
        arrivalTime: arrivalTimeDetected
      },
      confirmReply: `Combinado, *${firstName}*! Já registrei sua previsão de chegada para *${arrivalTimeDetected}* e alinhei com a nossa governança para priorizar a preparação do seu *Flat ${flatNumber}*! 🏨✨`
    });
  }

  if (maintenanceDetected) {
    suggestedActions.push({
      id: "act_maintenance",
      actionType: "create_maintenance_ticket",
      icon: "🛠️",
      label: `Abrir Manutenção: ${maintenanceDetected.toUpperCase()}${flatNumber ? ` (Flat ${flatNumber})` : ""}`,
      description: `Cria ocorrência técnica prioritária em Ocorrências & Avarias para verificação imediata.`,
      variant: "rose",
      payload: {
        flatNumber: flatNumber || "S/N",
        reservationCode: resCode,
        issue: maintenanceDetected,
        description: lastInboundText,
        guestName,
        guestPhone: cleanPhone
      },
      confirmReply: `Olá, *${firstName}*! Sinto muito pelo inconveniente. Já abri um chamado prioritário para nossa manutenção verificar *${maintenanceDetected}* no *Flat ${flatNumber || ""}* com máxima urgência! 🛠️🙏`
    });
  }

  if (housekeepingItemDetected) {
    suggestedActions.push({
      id: "act_housekeeping",
      actionType: "create_housekeeping_request",
      icon: "🧺",
      label: `Solicitar à Governança: ${housekeepingItemDetected}${flatNumber ? ` (Flat ${flatNumber})` : ""}`,
      description: `Registra solicitação de item/enxoval para atendimento pela equipe de governança.`,
      variant: "indigo",
      payload: {
        flatNumber: flatNumber || "S/N",
        reservationCode: resCode,
        item: housekeepingItemDetected,
        description: lastInboundText,
        guestName,
        guestPhone: cleanPhone
      },
      confirmReply: `Com certeza, *${firstName}*! Já acionei nossa governança para providenciar *${housekeepingItemDetected}* para o seu *Flat ${flatNumber || ""}*! 🧺✨`
    });
  }

  if (checkoutAnnounced && res && !guestContext.isCheckoutCompleted) {
    suggestedActions.push({
      id: "act_confirm_checkout",
      actionType: "confirm_guest_checkout",
      icon: "🚪",
      label: `Confirmar Check-out do Flat ${flatNumber} & Liberar Limpeza`,
      description: `Encerra a estadia ${resCode} no PMS e marca o Flat ${flatNumber} como VAGO/SUJO para as camareiras.`,
      variant: "purple",
      payload: {
        reservationCode: resCode,
        flatNumber
      },
      confirmReply: `Muito obrigado por nos avisar, *${firstName}*! Já confirmamos o seu check-out do *Flat ${flatNumber}*. Foi um grande prazer recebê-lo no CorpFlats e esperamos vê-lo novamente em breve! 🏨✨`
    });
  }

  if (!res && convState.hasDates) {
    const inBr = String(convState.checkIn || "").split("-").reverse().join("/");
    const outBr = String(convState.checkOut || "").split("-").reverse().join("/");
    suggestedActions.push({
      id: "act_create_preres",
      actionType: "calculate_quote_or_prereserve",
      icon: "📅",
      label: `Gerar Cotação / Pré-Reserva (${inBr} a ${outBr})`,
      description: `Verifica flat disponível para ${convState.nights || 1} noite(s), cria pré-reserva e gera código PIX.`,
      variant: "emerald",
      payload: {
        checkIn: convState.checkIn,
        checkOut: convState.checkOut,
        guests: convState.guests || 1,
        ratePlan: convState.breakfastPreference === "without_breakfast" ? "room_only" : "with_breakfast",
        guestName,
        guestPhone: cleanPhone
      }
    });
  }

  const totalAmt = Number(res?.totalAmount ?? res?.total_amount) || 0;
  const paidAmt = Number(res?.paidAmount ?? res?.paid_amount) || 0;
  const isResPaid = ["pago", "pago_total"].includes(String(res?.paymentStatus || "").toLowerCase()) || (paidAmt >= totalAmt && totalAmt > 0);
  if (res && (!isResPaid || topicFlags.pagamento) && !guestContext.hideFinancialForGuest) {
    const pendingVal = Math.max(0, totalAmt - paidAmt) || totalAmt;
    const fmtPending = pendingVal > 0 ? pendingVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
    suggestedActions.push({
      id: "act_send_pix",
      actionType: "send_pix_charge",
      icon: "💳",
      label: `Gerar PIX Copia e Cola${fmtPending ? ` (${fmtPending})` : ""}`,
      description: `Gera o código PIX oficial da reserva ${resCode} pronto para envio ao hóspede.`,
      variant: "amber",
      payload: {
        reservationCode: resCode,
        amount: pendingVal
      }
    });
  }

  if (topicFlags.nfse || stayStage === "checkout_concluido") {
    suggestedActions.push({
      id: "act_prepare_nfse",
      actionType: "prepare_nfse",
      icon: "🧾",
      label: `Emitir Nota Fiscal (NFS-e) • ${firstName}`,
      description: `Abre o emissor fiscal com os dados de ${guestName}${flatNumber ? ` (Flat ${flatNumber})` : ""}.`,
      variant: "blue",
      payload: {
        reservationCode: resCode,
        guestName,
        guestPhone: cleanPhone,
        flatNumber,
        totalAmount: totalAmt
      }
    });
  }

  // 3. Construção dos Botões de Envio Rápido Dinâmicos (por Teor e Fase)
  const hostBase = "https://corpflats.com.br";
  const checkinLink = res ? getCheckinUrlSync(res, 1, hostBase, db) : `${hostBase}/pre-checkin`;
  const cafeLink = resCode ? `${hostBase}/minha-reserva/${resCode}/cafe` : `${hostBase}/cafe`;
  const portalLink = resCode ? `${hostBase}/minha-reserva/${resCode}` : `${hostBase}/minha-reserva`;
  const checkoutLink = resCode ? `${hostBase}/checkout/${resCode}` : `${hostBase}/checkout`;
  const pixLink = resCode ? `${hostBase}/copiar-pix/${resCode}` : `${hostBase}/copiar-pix`;
  const wifiNet = flatNumber ? `apto ${flatNumber}` : "apto {número do flat}";
  const wifiPass = aiConfig.knowledgeBase?.wifiPassword || "1234567890123";
  const mapsUrl = "https://share.google/LHu3541d5lhkdvbL2";
  const manualPdfUrl = `${hostBase}/Manual_do_Hospede_CorpFlats.pdf`;

  const allQuickButtons = [
    {
      id: "qb_wifi",
      label: flatNumber ? `Wi-Fi (apto ${flatNumber})` : "Senha do Wi-Fi",
      icon: "wifi",
      emoji: "📶",
      topics: ["wifi"],
      stages: ["em_estadia", "checkin_hoje", "checkout_hoje", "reserva_futura"],
      priorityScore: topicFlags.wifi ? 100 : (stayStage === "em_estadia" ? 85 : 50),
      highlighted: topicFlags.wifi,
      messageText: `Olá, *${firstName}*! 📶 Seguem os dados de conexão Wi-Fi exclusivos do seu *Flat ${flatNumber || ""}*:\n\n• *Rede:* \`${wifiNet}\`\n• *Senha:* \`${wifiPass}\`\n\nQualquer dúvida, estou à disposição! ✨`
    },
    {
      id: "qb_checkin",
      label: "Pré-Check-in Digital",
      icon: "checkin",
      emoji: "📝",
      topics: ["checkin"],
      stages: ["reserva_futura", "checkin_hoje", "sem_reserva"],
      priorityScore: topicFlags.checkin ? 100 : (stayStage === "checkin_hoje" || stayStage === "reserva_futura" ? 90 : 20),
      highlighted: topicFlags.checkin,
      messageText: `Olá, *${firstName}*! 🌟 Para agilizar sua liberação na portaria 24h${flatNumber ? ` para o *Flat ${flatNumber}*` : ""}, preencha seu *Pré-Check-in Digital* rápido pelo link:\n\n📝 ${checkinLink}\n\nAssim que preencher, seu acesso já fica autorizado automaticamente!`,
      buttons: [{ id: "btn_chk", type: "URL", label: "📝 Fazer Pré-Check-in", url: checkinLink }]
    },
    {
      id: "qb_cafe",
      label: "Link do Café no Flat",
      icon: "cafe",
      emoji: "🥐",
      topics: ["cafe"],
      stages: ["em_estadia", "checkin_hoje", "reserva_futura"],
      priorityScore: topicFlags.cafe ? 100 : (stayStage === "em_estadia" || stayStage === "checkin_hoje" ? 82 : 45),
      highlighted: topicFlags.cafe,
      messageText: `Olá, *${firstName}*! ☕🥐 Nosso café da manhã é servido em bandeja diretamente no seu *Flat ${flatNumber || ""}* das *05:00 às 09:30*.\n\nVocê pode escolher os itens e o horário de entrega até a véspera pelo link:\n🥐 ${cafeLink}\n\nBom apetite! ✨`,
      buttons: [{ id: "btn_cafe", type: "URL", label: "🥐 Escolher Café da Manhã", url: cafeLink }]
    },
    {
      id: "qb_tarifas",
      label: "Tabela de Diárias",
      icon: "tarifas",
      emoji: "💰",
      topics: ["cotacao"],
      stages: ["sem_reserva"],
      priorityScore: topicFlags.cotacao ? 105 : (stayStage === "sem_reserva" ? 95 : 25),
      highlighted: topicFlags.cotacao,
      messageText: `Olá, *${firstName}*! 🏨✨ Será um prazer receber você no *CorpFlats (Edifício Soho Residence)*!\n\nNossos flats são completos, climatizados e contam com garagem gratuita e portaria 24h:\n\n☕ *Opção 1 — Com Café da Manhã no Flat (Recomendada):*\n• *1 pessoa:* R$ 272,00/diária\n• *2 pessoas (casal):* R$ 307,00/diária\n✅ *Benefício Exclusivo:* Isenção total da taxa de limpeza!\n\n🛏️ *Opção 2 — Sem Café da Manhã (Somente Acomodação):*\n• *A partir de:* R$ 237,00/diária (+ taxa única de limpeza de R$ 70,00)\n\nPara quais datas (entrada e saída) e quantas pessoas você gostaria de verificar disponibilidade? 😊`
    },
    {
      id: "qb_pagamento_pix",
      label: "Cobrança / Link PIX",
      icon: "pix",
      emoji: "💳",
      topics: ["pagamento"],
      stages: ["reserva_futura", "checkin_hoje", "sem_reserva", "em_estadia"],
      priorityScore: topicFlags.pagamento ? 102 : (!isResPaid && res ? 88 : 35),
      highlighted: topicFlags.pagamento || Boolean(res && !isResPaid),
      messageText: `Olá, *${firstName}*! 💳 Para confirmar e garantir sua reserva${flatNumber ? ` no *Flat ${flatNumber}*` : ""}${resCode ? ` (*${resCode}*)` : ""}, acesse abaixo o código PIX Copia e Cola ou link seguro de pagamento:\n\n🔗 ${pixLink}\n\nAssim que concluir, envie o comprovante por aqui para baixa imediata! ✨`,
      buttons: [{ id: "btn_pix", type: "URL", label: "💳 Copiar Código PIX", url: pixLink }]
    },
    {
      id: "qb_garagem",
      label: "Garagem & Placa",
      icon: "garagem",
      emoji: "🚗",
      topics: ["garagem"],
      stages: ["reserva_futura", "checkin_hoje", "em_estadia"],
      priorityScore: topicFlags.garagem ? 100 : (stayStage === "checkin_hoje" ? 78 : 50),
      highlighted: topicFlags.garagem,
      messageText: `Olá, *${firstName}*! 🚗 Nossa garagem no Edifício Soho é rotativa e *100% gratuita* (você pode estacionar em qualquer vaga livre, altura limite de 2,10m).\n\nPara deixarmos sua entrada liberada na portaria 24h, poderia me informar o *modelo, cor e placa* do veículo?`
    },
    {
      id: "qb_checkout",
      label: "Check-out (12h)",
      icon: "checkout",
      emoji: "🚪",
      topics: ["checkout"],
      stages: ["checkout_hoje", "em_estadia"],
      priorityScore: topicFlags.checkout ? 100 : (stayStage === "checkout_hoje" ? 95 : 40),
      highlighted: topicFlags.checkout || stayStage === "checkout_hoje",
      messageText: `Olá, *${firstName}*! ☀️ Esperamos que sua estadia no *Flat ${flatNumber || ""}* tenha sido excelente!\n\nLembramos que o horário de check-out é até às *12:00h*. Ao sair, basta desligar o ar-condicionado e luzes, entregar o cartão na portaria e confirmar sua saída em 1 clique:\n🚪 ${checkoutLink}\n\nDeseja prorrogar sua estadia ou já tem horário previsto de saída? Tenha uma ótima viagem!`,
      buttons: [{ id: "btn_out", type: "URL", label: "🚪 Confirmar Check-out", url: checkoutLink }]
    },
    {
      id: "qb_location",
      label: "Localização GPS",
      icon: "location",
      emoji: "📍",
      topics: ["localizacao"],
      stages: ["sem_reserva", "reserva_futura", "checkin_hoje", "em_estadia"],
      priorityScore: topicFlags.localizacao ? 100 : (stayStage === "checkin_hoje" ? 75 : 55),
      highlighted: topicFlags.localizacao,
      messageText: `Olá, *${firstName}*! 📍 Estamos localizados no *Edifício Soho Residence Service*:\n\n🏢 *Endereço:* Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes/RJ\n🗺️ *Google Maps:* ${mapsUrl}\n🔑 *Portaria:* 24 horas\n\nEstamos te aguardando! ✨`,
      buttons: [{ id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: mapsUrl }]
    },
    {
      id: "qb_manual",
      label: "Manual do Flat (PDF)",
      icon: "manual",
      emoji: "📖",
      topics: ["manual"],
      stages: ["em_estadia", "checkin_hoje"],
      priorityScore: topicFlags.manual ? 100 : (stayStage === "em_estadia" ? 76 : 42),
      highlighted: topicFlags.manual,
      mediaType: "document",
      mediaUrl: manualPdfUrl,
      fileName: "Manual_do_Hospede_CorpFlats.pdf",
      messageText: `Olá, *${firstName}*! 📖✨ Segue o *Guia e Manual Completo do Flat ${flatNumber || ""}* com instruções de Wi-Fi, ar-condicionado, piscina aquecida (06h às 22h) e comodidades:\n\n📄 ${manualPdfUrl}\n🏨 Portal da Reserva: ${portalLink}`
    },
    {
      id: "qb_nfse",
      label: "Dados p/ Nota Fiscal",
      icon: "nfse",
      emoji: "🧾",
      topics: ["nfse"],
      stages: ["checkout_hoje", "checkout_concluido", "em_estadia"],
      priorityScore: topicFlags.nfse ? 100 : (stayStage === "checkout_concluido" || stayStage === "checkout_hoje" ? 80 : 30),
      highlighted: topicFlags.nfse,
      messageText: `Olá, *${firstName}*! 🧾 Com certeza! Para emitirmos a sua *Nota Fiscal de Hospedagem (NFS-e)*, por favor me confirme:\n\n1️⃣ *CPF ou CNPJ* do tomador:\n2️⃣ *Nome Completo ou Razão Social*:\n3️⃣ *E-mail* (opcional para envio automático):\n\nAssim que me enviar, já providencio a emissão e te mando o PDF por aqui! ✨`
    },
    {
      id: "qb_review",
      label: "Avaliação 5★ Google",
      icon: "review",
      emoji: "⭐",
      topics: [],
      stages: ["checkout_concluido", "checkout_hoje"],
      priorityScore: stayStage === "checkout_concluido" ? 92 : 38,
      highlighted: stayStage === "checkout_concluido",
      messageText: `Olá, *${firstName}*! ⭐ Foi um prazer recebê-lo no *CorpFlats*!\n\nSua opinião é muito importante para nós. Poderia nos avaliar com 5 estrelas no Google? Leva menos de 30 segundos:\n⭐ ${mapsUrl}\n\nMuito obrigado e até a próxima estadia! 🙏🏨`,
      buttons: [{ id: "btn_rev", type: "URL", label: "⭐ Avaliar no Google", url: mapsUrl }]
    }
  ];

  const filteredQuickButtons = allQuickButtons
    .filter(btn => {
      if (btn.id === "qb_checkin" && ["em_estadia", "checkout_hoje", "checkout_concluido"].includes(stayStage) && !topicFlags.checkin) {
        return false;
      }
      if (btn.id === "qb_pagamento_pix" && guestContext.hideFinancialForGuest) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // 4. Geração de Sugestões de Resposta em Tempo Real
  const suggestedReplies = [];

  if (lastInboundText || draftText) {
    let primaryReply = "";
    let modelUsed = "heuristic";
    let source = "heuristic";

    if (!skipLlm) {
      try {
        const aiRes = await generateAiWhatsAppResponse({
          db,
          phone: cleanPhone,
          messageText: draftText || lastInboundText,
          history,
          isCopilot: true
        });
        if (aiRes?.replyText) {
          primaryReply = aiRes.replyText;
          modelUsed = aiRes.modelUsed || "gemini";
          source = aiRes.source || "gemini";
        }
      } catch (e) {
        console.warn("[Sofia Realtime Assist] Fallback heurístico acionado:", e.message);
      }
    }

    if (!primaryReply) {
      const applicableFaqs = (db?.faqItems || []).filter(f => f && f.status === "ativo" && isFaqApplicableToClient(f, cleanPhone));
      primaryReply = generateHeuristicResponse(draftText || lastInboundText, guestContext, aiConfig, applicableFaqs, db, history);
    }

    if (primaryReply) {
      suggestedReplies.push({
        id: "rep_sofia_main",
        label: "✨ Resposta Recomendada pela Sofia",
        tone: "completa",
        text: primaryReply,
        source,
        modelUsed
      });
    }

    if (suggestedActions.length > 0 && suggestedActions[0].confirmReply && suggestedActions[0].confirmReply !== primaryReply) {
      suggestedReplies.push({
        id: "rep_sofia_action",
        label: `⚡ Confirmar: ${suggestedActions[0].label.slice(0, 32)}`,
        tone: "operacional",
        text: suggestedActions[0].confirmReply,
        source: "action_template"
      });
    }

    const topQuick = filteredQuickButtons.find(b => b.highlighted);
    if (topQuick && topQuick.messageText !== primaryReply && suggestedReplies.length < 3) {
      suggestedReplies.push({
        id: `rep_quick_${topQuick.id}`,
        label: `${topQuick.emoji} Atalho Direto: ${topQuick.label}`,
        tone: "direta",
        text: topQuick.messageText,
        source: "quick_template"
      });
    }
  } else {
    if (stayStage === "checkin_hoje") {
      suggestedReplies.push({
        id: "rep_proactive_checkin",
        label: "👋 Boas-vindas Check-in de Hoje",
        tone: "proativa",
        text: `Olá, *${firstName}*! Seja muito bem-vindo(a) ao *CorpFlats*! 🏨✨ Sua chegada no *Flat ${flatNumber}* é hoje. Você já tem um horário previsto de chegada para prepararmos tudo com prioridade?`
      });
    } else if (stayStage === "em_estadia") {
      suggestedReplies.push({
        id: "rep_proactive_inhouse",
        label: "🌟 Acompanhamento de Estadia",
        tone: "proativa",
        text: `Olá, *${firstName}*! Tudo ótimo com sua estadia no *Flat ${flatNumber}*? 😊 Se precisar da senha do Wi-Fi, agendar seu café ou qualquer suporte, é só me chamar por aqui!`
      });
    } else if (stayStage === "checkout_hoje") {
      suggestedReplies.push({
        id: "rep_proactive_checkout",
        label: "☀️ Bom dia Check-out Hoje",
        tone: "proativa",
        text: `Bom dia, *${firstName}*! ☀️ Esperamos que tenha tido uma excelente estadia no *Flat ${flatNumber}*. Lembramos que o check-out é hoje até às 12:00h. Caso deseje prorrogar sua estadia ou precise da Nota Fiscal, estou à disposição!`
      });
    }
  }

  return {
    success: true,
    phone: cleanPhone,
    stayStage,
    detectedIntent,
    lastInboundMessageId: lastInbound?.id || lastInbound?.messageId || null,
    lastInboundText,
    guestSummary: {
      name: guestName,
      firstName,
      flatNumber: flatNumber || null,
      reservationCode: resCode || null,
      checkinDate: res?.checkinDate || null,
      checkoutDate: res?.checkoutDate || null,
      isPaid: isResPaid,
      cleaningStatus: guestContext.cleaningStatus || "unknown",
      isRoomReady: Boolean(guestContext.isRoomReady),
      vehiclePlate: res?.vehiclePlate || plateDetected || null
    },
    suggestedReplies,
    suggestedActions,
    dynamicQuickButtons: filteredQuickButtons
  };
}

// ============================================================================
// ASSISTENTE ATIVA DE PRÉ-RESERVAS (SOFIA -> WHATSAPP DO GESTOR)
// ============================================================================

/**
 * Retorna o telefone do gestor/desenvolvedor configurado (padrão: 5522998505276).
 */
export function getManagerWhatsAppPhone(db = null) {
  const raw = db?.whatsappAiSettings?.developerPhone || DEVELOPER_PHONES[0] || "22998505276";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits || "5522998505276";
}

/**
 * Motor "Flat da Vez" (Fair-Share) idêntico ao PMS (calculateFairShareStats do demo-server.mjs):
 * Filtra unidades disponíveis no período [checkinDate, checkoutDate] e ordena por:
 * 1) Menor número de diárias ocupadas no mês do check-in (monthOccupiedDays ASC)
 * 2) Maior tempo ocioso desde o último check-out (daysSinceLastCheckout DESC)
 * 3) Número do flat em ordem crescente
 */
export function selectFairShareFlat(db, checkinDate, checkoutDate, excludeResId = null) {
  const rawUnits = (Array.isArray(db?.flats) && db.flats.length > 0) ? db.flats : (db?.rooms || []);
  const activeFlats = rawUnits.filter(f => f && f.isActive !== false && f.status !== "manutencao_bloqueada");

  if (!checkinDate || !checkoutDate || checkinDate >= checkoutDate || activeFlats.length === 0) {
    return {
      recommendedFlat: null,
      availableFlats: [],
      allStats: []
    };
  }

  const refDateStr = checkinDate;
  const [yearStr, monthStr] = refDateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const monthStart = `${yearStr}-${monthStr}-01`;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;
  const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  const nowMs = Date.now();
  const allReservations = Array.isArray(db?.reservations) ? db.reservations : [];

  const validReservations = allReservations.filter(r => {
    if (!r) return false;
    if (excludeResId != null && String(r.id) === String(excludeResId)) return false;
    const statusNorm = String(r.status || "").toLowerCase();
    if (["cancelada", "cancelled", "no_show", "expirada"].includes(statusNorm)) return false;
    if ((statusNorm === "pre_reserva" || statusNorm === "pendente") && r.expiresAt) {
      if (new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") {
        return false;
      }
    }
    return true;
  });

  const { todayStr } = getBrasiliaDateParts();

  const stats = activeFlats.map(flat => {
    const flatRes = validReservations.filter(r =>
      (r.flatId != null && String(r.flatId) === String(flat.id)) ||
      (r.flatNumber != null && String(r.flatNumber) === String(flat.number)) ||
      (r.roomNumber != null && String(r.roomNumber) === String(flat.number))
    );

    let monthOccupiedDays = 0;
    let lastCheckoutStr = null;

    for (const r of flatRes) {
      if (r.checkinDate && r.checkoutDate && r.checkinDate < monthEnd && r.checkoutDate > monthStart) {
        const start = r.checkinDate < monthStart ? monthStart : r.checkinDate;
        const end = r.checkoutDate > monthEnd ? monthEnd : r.checkoutDate;
        const sD = new Date(`${start}T12:00:00Z`);
        const eD = new Date(`${end}T12:00:00Z`);
        const diff = Math.max(0, Math.round((eD - sD) / (1000 * 60 * 60 * 24)));
        monthOccupiedDays += diff;
      }

      if (r.checkoutDate && r.checkoutDate <= refDateStr) {
        if (!lastCheckoutStr || r.checkoutDate > lastCheckoutStr) {
          lastCheckoutStr = r.checkoutDate;
        }
      }
    }

    let daysSinceLastCheckout = 9999;
    if (lastCheckoutStr) {
      const refD = new Date(`${refDateStr}T12:00:00Z`);
      const lastD = new Date(`${lastCheckoutStr}T12:00:00Z`);
      daysSinceLastCheckout = Math.max(0, Math.round((refD - lastD) / (1000 * 60 * 60 * 24)));
    }

    const hasResConflict = flatRes.some(r => {
      const statusNorm = String(r.status || "").toLowerCase();
      if (["completed", "checked_out", "finalizada", "concluida", "checkout"].includes(statusNorm)) return false;
      if (isReservationCheckoutCompleted(r, db)) return false;
      return r.checkinDate < checkoutDate && r.checkoutDate > checkinDate;
    });

    const hasBlockConflict = (db?.roomBlocks || []).some(b => {
      const sameFlat =
        (b.flatId != null && String(b.flatId) === String(flat.id)) ||
        (b.flatNumber != null && String(b.flatNumber) === String(flat.number)) ||
        (b.roomNumber != null && String(b.roomNumber) === String(flat.number));
      if (!sameFlat) return false;
      return b.startDate < checkoutDate && b.endDate > checkinDate;
    });

    const hasServiceOrderConflict = (db?.serviceOrders || []).some(o => {
      if (!o) return false;
      if (o.status === "active" && Array.isArray(o.flats)) {
        return o.flats.some(oflat => {
          if (!oflat || oflat.status !== "in_progress") return false;
          const sameNestedFlat =
            (oflat.flatId != null && String(oflat.flatId) === String(flat.id)) ||
            (oflat.flatNumber != null && String(oflat.flatNumber) === String(flat.number));
          if (!sameNestedFlat) return false;
          const sDate = oflat.startedAt ? String(oflat.startedAt).slice(0, 10) : todayStr;
          const estDate = oflat.estimatedFinishAt ? String(oflat.estimatedFinishAt).slice(0, 10) : sDate;
          const eDate = [sDate, estDate, todayStr].filter(Boolean).sort().pop() || todayStr;
          return sDate <= checkoutDate && eDate >= checkinDate;
        });
      }
      const sameFlat =
        (o.flatId != null && String(o.flatId) === String(flat.id)) ||
        (o.flatNumber != null && String(o.flatNumber) === String(flat.number));
      if (!sameFlat || (o.status !== "em_andamento" && o.status !== "in_progress") || !o.startDate || !o.endDate) return false;
      return o.startDate <= checkoutDate && o.endDate >= checkinDate;
    });

    const isAvailableInPeriod = !hasResConflict && !hasBlockConflict && !hasServiceOrderConflict;
    const amenitiesInfo = getFlatAmenitiesInfo(flat);

    return {
      id: flat.id,
      number: String(flat.number),
      type: flat.type || "Standard",
      floor: flat.floor || null,
      status: flat.status || "disponivel",
      monthOccupiedDays,
      lastCheckoutDate: lastCheckoutStr,
      daysSinceLastCheckout,
      isAvailableInPeriod,
      airConditionerType: amenitiesInfo?.airConditionerType || "split",
      bedType: amenitiesInfo?.bedType || "casal",
      hasMicrowave: amenitiesInfo?.hasMicrowave ?? true
    };
  });

  const availableFlats = stats
    .filter(s => s.isAvailableInPeriod)
    .sort((a, b) => {
      if (a.monthOccupiedDays !== b.monthOccupiedDays) {
        return a.monthOccupiedDays - b.monthOccupiedDays;
      }
      if (b.daysSinceLastCheckout !== a.daysSinceLastCheckout) {
        return b.daysSinceLastCheckout - a.daysSinceLastCheckout;
      }
      return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
    });

  return {
    recommendedFlat: availableFlats.length > 0 ? availableFlats[0] : null,
    availableFlats,
    allStats: stats
  };
}

/**
 * Verifica se uma mensagem fromMe foi enviada pela Sofia / robô / régua automática
 * (e não por um operador humano).
 */
function isAutomatedOrSofiaMessage(msg) {
  if (!msg) return false;
  if (msg.isOperator === true || msg.senderRole === "operator") return false;
  if (msg.isAi === true || msg.isBot === true || msg.role === "assistant") return true;

  const sender = String(msg.senderName || msg.sender || "").trim().toLowerCase();
  if (/^(?:sofia|ia|ai|bot|sistema|system|assistente|concierge\s+virtual)$/.test(sender)) {
    return true;
  }

  const msgId = String(msg.messageId || msg.id || "");
  if (/^(?:dev_|fiscal_|sofia_|bot_|msg_disp_|auto_)/.test(msgId)) {
    return true;
  }

  // Disparo manual no Live Chat Web usa triggerEvent === "chat_direct" ou "live_chat_manual_message" ou "qm_..."
  // Disparos da régua automática usam triggerEvent de template (ex: reservation_created, pre_reservation_created, checkin_day, etc.)
  const trig = String(msg.triggerEvent || "").trim();
  if (trig && trig !== "chat_direct" && trig !== "live_chat_manual_message" && !trig.startsWith("qm_")) {
    return true;
  }

  const text = String(msg.text || msg.message || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:sou\s+a\s+sofia|concierge\s+virtual|assistente\s+ativa\s+de\s+pre-reservas|resumo\s+atualizado\s+da\s+pre-reserva|pre-reserva\s+criada\s+com\s+sucesso\s+no\s+sistema|proposta\s+de\s+pre-reserva\s+cancelada|possui\s+conflito\s+de\s+ocupacao\/bloqueio|nao\s+encontrei\s+o\s+\*?flat|nao\s+foi\s+possivel\s+criar\s+a\s+pre-reserva|pre-reserva\s+garantida|pix\s+copia\s+e\s+cola.*expira\s+em)\b/.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Verifica se há mensagens enviadas por um operador humano na conversa.
 */
export function hasHumanOperatorMessagesInConversation(conv, db = null) {
  const messages = Array.isArray(conv) ? conv : (Array.isArray(conv?.messages) ? conv.messages : []);
  if (messages.length === 0) return false;
  return messages.some(m => {
    if (!m || !m.fromMe) return false;
    return !isAutomatedOrSofiaMessage(m);
  });
}

/**
 * Determina se a conversa está sendo conduzida pelo operador humano (escopo em que a Sofia
 * atua como Assistente Ativa de Pré-Reservas consultando o gestor no WhatsApp) vs. Sofia sozinha.
 */
export function isOperatorConductingConversation(conv, db = null, incomingInfo = null) {
  const phone = conv?.phone || incomingInfo?.phone || incomingInfo?.senderPhone || "";
  if (phone && isDeveloperPhone(phone, db)) return false;

  if (conv?.aiPaused === true || conv?.operatorActive === true) {
    return true;
  }

  if (incomingInfo?.fromMe === true && !isAutomatedOrSofiaMessage(incomingInfo)) {
    return true;
  }

  const aiConfig = getWhatsAppAiConfig(db);
  if (aiConfig?.mode === "copilot") {
    return true;
  }

  if (aiConfig?.mode === "off_hours") {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brDate = new Date(utc + (-3 * 60 * 60000));
    const currentHour = brDate.getHours() + (brDate.getMinutes() / 60);
    const [startH, startM] = (aiConfig.offHoursStart || "18:00").split(":").map(Number);
    const [endH, endM] = (aiConfig.offHoursEnd || "08:00").split(":").map(Number);
    const startVal = startH + (startM / 60);
    const endVal = endH + (endM / 60);
    const isOffHours = startVal > endVal
      ? (currentHour >= startVal || currentHour <= endVal)
      : (currentHour >= startVal && currentHour <= endVal);
    if (!isOffHours) {
      return true;
    }
  }

  if (conv?.aiPaused !== false && hasHumanOperatorMessagesInConversation(conv, db)) {
    return true;
  }

  return false;
}

/**
 * Converte string monetária brasileira/numérica (ex: "1.250,50", "480,00", "480") em Number.
 */
function parseBrlAmountValue(rawStr) {
  if (typeof rawStr === "number") return isNaN(rawStr) ? null : rawStr;
  if (!rawStr || typeof rawStr !== "string") return null;
  let s = rawStr.trim().replace(/[R$\s]/gi, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const num = parseFloat(s);
  return (!isNaN(num) && num > 0) ? Math.round(num * 100) / 100 : null;
}

/**
 * Converte data avulsa DD/MM[/YYYY] ou YYYY-MM-DD para YYYY-MM-DD.
 */
function parseSingleDateToken(rawToken, refYear = null) {
  if (!rawToken || typeof rawToken !== "string") return null;
  const t = rawToken.trim();
  const isoM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;

  const brM = /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/.exec(t);
  if (brM) {
    const d = parseInt(brM[1], 10);
    const m = parseInt(brM[2], 10);
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    const { year: curYear, month: curMonth } = getBrasiliaDateParts();
    let y = brM[3] ? parseInt(brM[3], 10) : (refYear || curYear);
    if (y < 100) y += 2000;
    if (!brM[3] && !refYear && m < curMonth) y += 1;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Valida e limpa um candidato a Nome Completo (mínimo de 2 palavras alfabéticas, sem termos de chat/saudação).
 */
function sanitizeFullNameCandidate(rawCandidate) {
  if (!rawCandidate || typeof rawCandidate !== "string") return null;
  let cleaned = rawCandidate
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, " ")
    .replace(/\b(?:e\s+coloca|coloca\s+no|muda\s+p(?:ara|ro)|vai\s+no|cria\s+no|reserva\s+no|no\s+(?:flat|apto|apartamento|quarto|unidade)|com\s+caf[eé]|sem\s+caf[eé]|inclui(?:r)?\s+caf[eé]|tira(?:r)?\s+(?:o\s+)?caf[eé]|para\s+(?:eu\s+)?revisar|pra\s+(?:eu\s+)?revisar|para\s+revisar|antes\s+de\s+criar|antes\s+de\s+confirmar|por\s+r?\$?\s*\d)\b.*/i, "")
    .replace(/\b(?:cpf|cnpj|e-?mail|telefone|celular|whatsapp|whats|rg|endere[cç]o|cep|check-?in|check-?out|valor|total|di[aá]ria|flat|apto|apartamento)\b\s*[:=\-–]?.*/i, "")
    .replace(/\b([A-Za-zÀ-ÖØ-öø-ÿ])\.(?=\s|$)/g, "$1")
    .replace(/[0-9@#$_=*~`<>[\]{}|\\^/]+/g, " ")
    .replace(/^[\s,.;:\-–—•*]+|[\s,.;:\-–—•*]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 5 || cleaned.length > 75) return null;

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 7) return null;

  // Palavras principais (>= 2 letras alfabéticas), conectores (da/de/do/das/dos/e) ou iniciais intermediárias de 1 letra
  const validWordRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/;
  const singleInitialRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]$/;
  const connectorRegex = /^(?:da|de|do|das|dos|e)$/i;
  let mainWordCount = 0;

  for (const w of words) {
    if (connectorRegex.test(w)) continue;
    if (singleInitialRegex.test(w)) continue;
    if (!validWordRegex.test(w)) return null;
    mainWordCount++;
  }

  if (mainWordCount < 2) return null;

  const normFull = cleaned.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Nota: não incluir "marco" isolado para não bloquear hóspedes chamados Marco (ex: Marco Aurélio, Marco Antônio)
  const forbiddenTokens = /\b(?:meu|minha|meus|minhas|chamo|nome|sobrenome|completo|titular|bom\s+dia|boa\s+tarde|boa\s+noite|ola|oi|tudo|certo|certinho|combinado|combinamos|fechado|fechar|perfeito|otimo|excelente|maravilha|beleza|valeu|show|bola|bacana|entao|agora|depois|vou|vamos|fazer|pagar|transferir|mandar|enviar|enviando|aguardo|aguardando|retorno|resposta|sim|nao|certeza|muito|grato|grata|amigo|amiga|voce|voces|estou|estamos|seria|pode|poderia|consigo|consegue|tenho|temos|quero|queria|gostaria|preciso|precisamos|confirmo|confirmar|reserva|reservar|pre\s+reserva|disponibilidade|disponivel|orcamento|cotacao|valor|diaria|diarias|reais|cafe|manha|tarde|noite|madrugada|ontem|amanha|hoje|nota\s+fiscal|nfse|obrigado|obrigada|por\s+favor|segue|seguem|meus\s+dados|dados\s+abaixo|aqui\s+esta|pix|pagamento|cartao|hospede|hospedes|cliente|recepcao|corpflats|edificio\s+soho|campos\s+dos\s+goytacazes|rio\s+de\s+janeiro|rua\s+conselheiro|avenida|bairro|centro|casal|solteiro|pessoa|pessoas|adultos|noites|entrada|saida|quarto|flat|apartamento|hotel|pousada|predio|garagem|vaga|estacionamento|carro|placa|horario|horas|segunda|terca|quarta|quinta|sexta|sabado|domingo|janeiro|fevereiro|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/;
  if (forbiddenTokens.test(normFull)) return null;

  return toTitleCase(cleaned);
}

/**
 * Extrai um Nome Completo (>= 2 palavras) a partir do histórico de mensagens da conversa,
 * priorizando padrões rotulados (Tier 1) e fichas cadastrais com CPF/E-mail (Tier 2)
 * sobre mensagens curtas avulsas (Tier 3), para que mensagens posteriores de chat nunca sobrescrevam o nome.
 */
function extractFullNameFromMessages(messages = []) {
  let labeledName = null;
  let registrationCardName = null;
  let bareMessageName = null;

  for (const msg of messages) {
    const text = String(msg?.text || msg?.message || "").trim();
    if (!text) continue;
    if (msg.fromMe && isAutomatedOrSofiaMessage(msg)) continue;

    // Tier 1: Padrões rotulados explícitos ("Nome completo: ...", "Nome: ...", "Meu nome é ...", "Hóspede: ...", "no nome de ...")
    const labeledRegexes = [
      /(?:nome\s+completo|nome\s+do\s+h[oó]spede|h[oó]spede|titular|nome)\s*[:=\-–]\s*([^\n\r,;•|]+)/i,
      /\b(?:meu\s+nome\s+[eé]|me\s+chamo|(?:no|em)\s+nome\s+d[eo]|nome\s+completo\s+[eé])\s+([A-Za-zÀ-ÖØ-öø-ÿ'’\-.]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'’\-.]+){1,6})/i
    ];
    for (const rx of labeledRegexes) {
      const m = text.match(rx);
      if (m && m[1]) {
        const candidate = sanitizeFullNameCandidate(m[1]);
        if (candidate) labeledName = candidate;
      }
    }

    // Tier 2: Mensagem contendo CPF ou E-mail (ficha cadastral em múltiplas linhas ou separada por ponto, dois-pontos, vírgula, traço ou barra)
    const hasCpfInMsg = /\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})\b/.test(text);
    const hasEmailInMsg = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
    if (hasCpfInMsg || hasEmailInMsg) {
      const segments = text
        .split(/(?:[\r\n,;!•|?]+|(?<!\d)\.(?!\d|[a-zA-Z])|\s+[-–—/]\s+)/)
        .map(s => s.trim())
        .filter(Boolean);
      for (const seg of segments) {
        const subParts = seg.includes(":") ? [seg, seg.split(":").slice(1).join(":")] : [seg];
        for (const part of subParts) {
          const cleanSeg = part
            .replace(/^(?:1[\.\)\-\s]*|(?:segue(?:m)?(?:\s+os)?(?:\s+meus)?(?:\s+dados)?|meus\s+dados(?:\s+s[aã]o)?|dados(?:\s+para\s+reserva)?|nome(?:\s+completo)?|h[oó]spede|titular)\s*[:=\-–]?\s*)+/i, "")
            .trim();
          const candidate = sanitizeFullNameCandidate(cleanSeg);
          if (candidate) {
            registrationCardName = candidate;
          }
        }
      }
    }

    // Tier 3: Mensagem curta enviada pelo hóspede contendo apenas o Nome Completo
    if (!msg.fromMe && !text.includes("?") && text.length <= 65 && !/\b(?:meu\s+nome|me\s+chamo|nome\s*[:=])\b/i.test(text)) {
      const candidate = sanitizeFullNameCandidate(text);
      if (candidate) {
        bareMessageName = candidate;
      }
    }
  }

  return labeledName || registrationCardName || bareMessageName;
}

/**
 * Extrai CPF (11 dígitos) das mensagens da conversa, evitando confundir com telefones ou chave PIX
 * e priorizando CPFs formatados/rotulados (Tier 1) sobre sequências avulsas de 11 dígitos (Tier 2).
 */
function extractCpfFromMessages(messages = [], guestPhone = "", db = null) {
  const cleanGuestPhone = onlyDigits(guestPhone);
  const guestPhoneNoCountry = cleanGuestPhone.startsWith("55") && cleanGuestPhone.length >= 12
    ? cleanGuestPhone.slice(2)
    : cleanGuestPhone;

  const managerPhone = getManagerWhatsAppPhone(db);
  const managerPhoneNoCountry = managerPhone.startsWith("55") && managerPhone.length >= 12
    ? managerPhone.slice(2)
    : managerPhone;
  const pixKeyDigits = onlyDigits(db?.settings?.interConfig?.pixKey || "47964813000165");

  let highConfidenceCpf = null;
  let bareElevenDigitCpf = null;

  for (const msg of messages) {
    const text = String(msg?.text || msg?.message || "").trim();
    if (!text) continue;
    if (msg.fromMe && isAutomatedOrSofiaMessage(msg)) continue;

    // 1. Formato pontuado XXX.XXX.XXX-XX (Tier 1)
    const formattedMatch = text.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
    if (formattedMatch) {
      highConfidenceCpf = onlyDigits(formattedMatch[1]);
      continue;
    }

    // 2. Rotulado com "CPF" (Tier 1)
    const labeledMatch = text.match(/\bcpf\s*[:=\-–]?\s*(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2}|\d{11})\b/i);
    if (labeledMatch) {
      highConfidenceCpf = onlyDigits(labeledMatch[1]);
      continue;
    }

    // 3. Sequência de 11 dígitos que não seja telefone nem chave PIX (Tier 2)
    const elevenRegex = /(?:^|\D)(\d{11})(?!\d)/g;
    let m;
    while ((m = elevenRegex.exec(text)) !== null) {
      const digits = onlyDigits(m[1]);
      if (digits.length !== 11) continue;
      if (guestPhoneNoCountry && digits === guestPhoneNoCountry) continue;
      if (managerPhoneNoCountry && digits === managerPhoneNoCountry) continue;
      if (pixKeyDigits && digits === pixKeyDigits) continue;
      if (/^(\d)\1{10}$/.test(digits)) continue;

      // Verifica se os dígitos são precedidos por rótulo de telefone/celular/whatsapp/pix
      const prefixSlice = text.slice(Math.max(0, m.index - 35), m.index + 1).toLowerCase();
      if (/\b(?:tel|telefone|cel|celular|whatsapp|whats|zap|contato|fone|ligar|numero|n[uú]mero|pix|chave)\s*[:=\-–]?\s*$/i.test(prefixSlice)) {
        continue;
      }
      bareElevenDigitCpf = digits;
    }
  }

  return highConfidenceCpf || bareElevenDigitCpf;
}

/**
 * Extrai E-mail das mensagens da conversa.
 */
function extractEmailFromMessages(messages = []) {
  let foundEmail = null;
  for (const msg of messages) {
    const text = String(msg?.text || msg?.message || "").trim();
    if (!text) continue;
    if (msg.fromMe && isAutomatedOrSofiaMessage(msg)) continue;

    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    for (const email of matches) {
      const lower = email.toLowerCase();
      if (lower.endsWith("@corpflats.com.br") || lower.endsWith("@corpflats.com")) continue;
      foundEmail = lower;
    }
  }
  return foundEmail;
}

/**
 * Extrai Datas (checkIn, checkOut, nights) das mensagens da conversa (tanto naturais quanto Check-in/Check-out separados).
 */
function extractDatesFromMessages(messages = []) {
  let checkIn = null;
  let checkOut = null;
  let explicitIn = null;
  let explicitOut = null;

  for (const msg of messages) {
    const text = String(msg?.text || msg?.message || "").trim();
    if (!text) continue;

    // 1. Parser de datas naturais em par (ex: "20/11 a 23/11", "de 10 a 15 de dezembro")
    const parsed = parseNaturalDatesFromText(text);
    if (parsed && parsed.checkIn && parsed.checkOut && parsed.checkIn < parsed.checkOut) {
      checkIn = parsed.checkIn;
      checkOut = parsed.checkOut;
      explicitIn = parsed.checkIn;
      explicitOut = parsed.checkOut;
    }

    // 2. Rótulos individuais de Check-in / Entrada e Check-out / Saída (na mesma mensagem ou em mensagens separadas)
    const inMatch = text.match(/(?:check-?in|entrada|chegada)\s*[:=\-–]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i);
    if (inMatch && inMatch[1]) {
      const dIn = parseSingleDateToken(inMatch[1]);
      if (dIn) explicitIn = dIn;
    }
    const outMatch = text.match(/(?:check-?out|sa[ií]da)\s*[:=\-–]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i);
    if (outMatch && outMatch[1]) {
      const dOut = parseSingleDateToken(outMatch[1]);
      if (dOut) explicitOut = dOut;
    }
    if ((inMatch || outMatch) && explicitIn && explicitOut && explicitIn < explicitOut) {
      checkIn = explicitIn;
      checkOut = explicitOut;
    }
  }

  if (!checkIn || !checkOut || checkIn >= checkOut) {
    return { hasDates: false, checkIn: null, checkOut: null, nights: 0, displayCheckIn: null, displayCheckOut: null };
  }

  const inD = new Date(`${checkIn}T12:00:00Z`);
  const outD = new Date(`${checkOut}T12:00:00Z`);
  const nights = Math.max(1, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));

  return {
    hasDates: true,
    checkIn,
    checkOut,
    nights,
    displayCheckIn: checkIn.split("-").reverse().join("/"),
    displayCheckOut: checkOut.split("-").reverse().join("/")
  };
}

/**
 * Extrai Orçamento / Valor (totalAmount e dailyRate) passado na conversa,
 * respeitando a preferência de café da manhã e a quantidade de diárias.
 */
function extractQuoteFromMessages(messages = [], nights = 1, breakfastPreference = null) {
  const effectiveNights = Math.max(1, Number(nights || 1));
  let totalAmount = null;
  let dailyRate = null;
  let dualOptionRates = null; // { withoutBfDaily, withBfDaily, withoutBfTotal, withBfTotal }

  const totalPhraseRx = /\b(?:total|pacote|no\s+total|valor\s+final|valor\s+total|fechado\s+em|fechamos\s+(?:em|por)|(?:para|pelas?|nas|as|por)\s+(?:as\s+|os\s+)?\d+\s*(?:di[aá]rias|noites|dias)|pelos?\s+\d+\s*dias|\b\d+\s*(?:di[aá]rias|noites|dias)\s+(?:fica|ficam|sai|saem)\b|no\s+per[ií]odo|para\s+o\s+per[ií]odo|hospedagem\s+fica)\b/;
  const dailyPhraseRx = /\b(?:di[aá]ria|valor\s+das\s+di[aá]rias|valores\s+das\s+di[aá]rias|por\s+di[aá]ria|cada\s+di[aá]ria|por\s+noite|\/\s*noite|\/\s*dia|ao\s+dia|a\s+noite|\d+\s*(?:di[aá]rias|noites)\s+(?:de|a|x)\s*r?\$?\s*\d)\b/;

  for (const msg of messages) {
    const text = String(msg?.text || msg?.message || "").trim();
    if (!text) continue;

    const normMsg = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Ignora mensagens que não têm relação com preço/orçamento
    const hasCurrencyOrPriceContext =
      /R\$\s*\d/i.test(text) ||
      /\b\d+(?:[.,]\d{1,2})?\s*reais\b/i.test(text) ||
      /\b(?:valor|total|or[cç]amento|di[aá]rias?|pacote|fica|ficam|fechamos|fechado|cota[cç][aã]o|sem\s+caf[eé]|com\s+caf[eé])\b[^\n\r0-9]{0,25}\d{2,5}(?:[.,]\d{1,2})?\b/i.test(text);

    if (!hasCurrencyOrPriceContext) continue;

    const msgMentionsTotal = totalPhraseRx.test(normMsg);
    const msgMentionsDaily = dailyPhraseRx.test(normMsg);

    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    let msgTotal = null;
    let msgDaily = null;
    let msgWithBfDaily = null;
    let msgWithoutBfDaily = null;
    let msgWithBfTotal = null;
    let msgWithoutBfTotal = null;

    for (const line of lines) {
      const lowerLine = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      // Ignora menção isolada ao custo avulso do café da manhã (ex: "café avulso R$ 35") quando não é a diária/total
      const isBreakfastAddonLine = /\bcafe\b/.test(lowerLine) && /\b(?:avulso|adicional|por\s+pessoa)\b/.test(lowerLine) && !/\b(?:diaria|total|com\s+cafe\s+incluso)\b/.test(lowerLine);
      if (isBreakfastAddonLine) continue;

      // Extrai todos os valores monetários da linha (sem capturar números de "2 diárias", datas ou flats)
      const lineSanitizedForNumbers = line
        .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, " ")
        .replace(/\b(?:flat|apto|apartamento|quarto|unidade)\s*\d{3,4}\b/gi, " ");

      const currencyMatches = [];
      const rxCurrency = /(?:R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d{2,5}(?:[.,]\d{1,2})?)\s*reais|(?:valor(?:\s+total|\s+da\s+di[aá]ria)?|total(?:\s+d[aeo]s?\s+\d+\s*di[aá]rias)?|or[cç]amento|di[aá]ria(?:\s+sem\s+caf[eé]|\s+com\s+caf[eé])?|sem\s+caf[eé](?:\s+da\s+manh[aã])?|com\s+caf[eé](?:\s+da\s+manh[aã])?|pacote|fica(?:\s+em)?|fechamos(?:\s+em|\s+por)?|por)\s*(?:de|[eé]|em|:|=|-)?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d{2,5}(?:[.,]\d{1,2})?))/gi;
      let m;
      while ((m = rxCurrency.exec(lineSanitizedForNumbers)) !== null) {
        const rawNum = m[1] || m[2] || m[3];
        const parsed = parseBrlAmountValue(rawNum);
        if (parsed && parsed >= 50 && parsed <= 100000) {
          currencyMatches.push({ value: parsed, index: m.index, raw: m[0] });
        }
      }

      if (currencyMatches.length === 0) continue;

      const mentionsWithBf = /\b(?:com\s+cafe|c\/\s*cafe|cafe\s+incluso|incluindo\s+cafe|op[cç][aã]o\s*1)\b/.test(lowerLine);
      const mentionsWithoutBf = /\b(?:sem\s+cafe|s\/\s*cafe|apenas\s+hospedagem|somente\s+hospedagem|op[cç][aã]o\s*2)\b/.test(lowerLine);
      const mentionsTotal = totalPhraseRx.test(lowerLine) || (!dailyPhraseRx.test(lowerLine) && msgMentionsTotal && !msgMentionsDaily);
      const mentionsDaily = dailyPhraseRx.test(lowerLine) || (!totalPhraseRx.test(lowerLine) && msgMentionsDaily && !msgMentionsTotal);

      // Caso a mesma linha mencione AMBOS "sem café" e "com café" com 2 valores (ex: "R$ 237 sem café ou R$ 272 com café" ou "Para 2 diárias fica R$ 540 sem café ou R$ 614 com café")
      if (mentionsWithBf && mentionsWithoutBf && currencyMatches.length >= 2) {
        const idxWith = lowerLine.search(/\b(?:com\s+cafe|c\/\s*cafe|cafe\s+incluso)\b/);
        const idxWithout = lowerLine.search(/\b(?:sem\s+cafe|s\/\s*cafe)\b/);
        const firstVal = currencyMatches[0].value;
        const secondVal = currencyMatches[1].value;
        const isTotalDual = mentionsTotal && !mentionsDaily;
        if (idxWithout < idxWith) {
          if (isTotalDual) {
            msgWithoutBfTotal = firstVal;
            msgWithBfTotal = secondVal;
          } else {
            msgWithoutBfDaily = firstVal;
            msgWithBfDaily = secondVal;
          }
        } else {
          if (isTotalDual) {
            msgWithBfTotal = firstVal;
            msgWithoutBfTotal = secondVal;
          } else {
            msgWithBfDaily = firstVal;
            msgWithoutBfDaily = secondVal;
          }
        }
        continue;
      }

      if (mentionsWithBf && !mentionsWithoutBf) {
        if (mentionsTotal && !mentionsDaily) {
          msgWithBfTotal = currencyMatches[currencyMatches.length - 1].value;
        } else if (mentionsDaily && !mentionsTotal) {
          msgWithBfDaily = currencyMatches[0].value;
        } else if (currencyMatches.length >= 2) {
          const sorted = [...currencyMatches.map(c => c.value)].sort((a, b) => a - b);
          msgWithBfDaily = sorted[0];
          msgWithBfTotal = sorted[sorted.length - 1];
        } else if (msgWithoutBfDaily != null) {
          msgWithBfDaily = currencyMatches[0].value;
        } else {
          msgWithBfTotal = currencyMatches[0].value;
        }
        continue;
      }

      if (mentionsWithoutBf && !mentionsWithBf) {
        if (mentionsTotal && !mentionsDaily) {
          msgWithoutBfTotal = currencyMatches[currencyMatches.length - 1].value;
        } else if (mentionsDaily && !mentionsTotal) {
          msgWithoutBfDaily = currencyMatches[0].value;
        } else if (currencyMatches.length >= 2) {
          const sorted = [...currencyMatches.map(c => c.value)].sort((a, b) => a - b);
          msgWithoutBfDaily = sorted[0];
          msgWithoutBfTotal = sorted[sorted.length - 1];
        } else if (msgWithBfDaily != null) {
          msgWithoutBfDaily = currencyMatches[0].value;
        } else {
          msgWithoutBfTotal = currencyMatches[0].value;
        }
        continue;
      }

      // Linha de preço geral (sem distinção de opção de café)
      if (currencyMatches.length >= 2 && (mentionsDaily || mentionsTotal)) {
        const sorted = [...currencyMatches.map(c => c.value)].sort((a, b) => a - b);
        msgDaily = sorted[0];
        msgTotal = sorted[sorted.length - 1];
      } else if (mentionsTotal && !mentionsDaily) {
        msgTotal = currencyMatches[currencyMatches.length - 1].value;
      } else if (mentionsDaily && !mentionsTotal) {
        msgDaily = currencyMatches[0].value;
      } else {
        // Ex: "Fica R$ 540,00" ou "Valor: R$ 270,00"
        const val = currencyMatches[currencyMatches.length - 1].value;
        msgTotal = val;
      }
    }

    if (msgWithBfDaily || msgWithoutBfDaily || msgWithBfTotal || msgWithoutBfTotal) {
      dualOptionRates = {
        withBfDaily: msgWithBfDaily || dualOptionRates?.withBfDaily || null,
        withoutBfDaily: msgWithoutBfDaily || dualOptionRates?.withoutBfDaily || null,
        withBfTotal: msgWithBfTotal || dualOptionRates?.withBfTotal || null,
        withoutBfTotal: msgWithoutBfTotal || dualOptionRates?.withoutBfTotal || null
      };
    }

    if (msgTotal != null || msgDaily != null) {
      if (msgTotal != null && msgDaily != null) {
        totalAmount = msgTotal;
        dailyRate = msgDaily;
      } else if (msgDaily != null) {
        dailyRate = msgDaily;
        totalAmount = Math.round(msgDaily * effectiveNights * 100) / 100;
      } else if (msgTotal != null) {
        totalAmount = msgTotal;
        dailyRate = Math.round((msgTotal / effectiveNights) * 100) / 100;
      }
    }
  }

  // Se havia duas opções na cotação (com café vs sem café) e nenhum preço único posterior sobrescreveu,
  // seleciona o valor correspondente à preferência de café da manhã escolhida na conversa
  if (dualOptionRates && totalAmount == null) {
    const preferWithBf = breakfastPreference === "with_breakfast";
    const preferWithoutBf = breakfastPreference === "without_breakfast";
    if (preferWithBf && (dualOptionRates.withBfTotal || dualOptionRates.withBfDaily)) {
      dailyRate = dualOptionRates.withBfDaily || Math.round((dualOptionRates.withBfTotal / effectiveNights) * 100) / 100;
      totalAmount = dualOptionRates.withBfTotal || Math.round(dailyRate * effectiveNights * 100) / 100;
    } else if (preferWithoutBf && (dualOptionRates.withoutBfTotal || dualOptionRates.withoutBfDaily)) {
      dailyRate = dualOptionRates.withoutBfDaily || Math.round((dualOptionRates.withoutBfTotal / effectiveNights) * 100) / 100;
      totalAmount = dualOptionRates.withoutBfTotal || Math.round(dailyRate * effectiveNights * 100) / 100;
    } else {
      const chosenDaily = dualOptionRates.withoutBfDaily || dualOptionRates.withBfDaily;
      const chosenTotal = dualOptionRates.withoutBfTotal || dualOptionRates.withBfTotal;
      if (chosenDaily || chosenTotal) {
        dailyRate = chosenDaily || Math.round((chosenTotal / effectiveNights) * 100) / 100;
        totalAmount = chosenTotal || Math.round(dailyRate * effectiveNights * 100) / 100;
      }
    }
  } else if (dualOptionRates && totalAmount != null) {
    // Se a escolha de café ocorreu depois da mensagem de dupla opção, ajusta caso o total atual ainda seja uma das opções
    if (breakfastPreference === "with_breakfast" && (dualOptionRates.withBfTotal || dualOptionRates.withBfDaily)) {
      const wTotal = dualOptionRates.withBfTotal || Math.round(dualOptionRates.withBfDaily * effectiveNights * 100) / 100;
      const woTotal = dualOptionRates.withoutBfTotal || (dualOptionRates.withoutBfDaily ? Math.round(dualOptionRates.withoutBfDaily * effectiveNights * 100) / 100 : null);
      if (totalAmount === woTotal) {
        totalAmount = wTotal;
        dailyRate = dualOptionRates.withBfDaily || Math.round((wTotal / effectiveNights) * 100) / 100;
      }
    } else if (breakfastPreference === "without_breakfast" && (dualOptionRates.withoutBfTotal || dualOptionRates.withoutBfDaily)) {
      const woTotal = dualOptionRates.withoutBfTotal || Math.round(dualOptionRates.withoutBfDaily * effectiveNights * 100) / 100;
      const wTotal = dualOptionRates.withBfTotal || (dualOptionRates.withBfDaily ? Math.round(dualOptionRates.withBfDaily * effectiveNights * 100) / 100 : null);
      if (totalAmount === wTotal) {
        totalAmount = woTotal;
        dailyRate = dualOptionRates.withoutBfDaily || Math.round((woTotal / effectiveNights) * 100) / 100;
      }
    }
  }

  return {
    hasQuote: Boolean(totalAmount != null && totalAmount > 0),
    totalAmount: totalAmount != null ? Math.round(totalAmount * 100) / 100 : null,
    dailyRate: dailyRate != null ? Math.round(dailyRate * 100) / 100 : null
  };
}

/**
 * Extrai e valida os 5 dados obrigatórios + intenção de reserva na conversa para a Assistente Ativa de Pré-Reservas:
 * 1) Datas (checkIn, checkOut)
 * 2) Orçamento / Valor (totalAmount, dailyRate)
 * 3) Nome Completo (mínimo 2 palavras)
 * 4) CPF (11 dígitos)
 * 5) E-mail
 */
export function extractActivePreReservationData(convOrMessages, db = null, guestPhone = "") {
  const messages = Array.isArray(convOrMessages)
    ? convOrMessages
    : (Array.isArray(convOrMessages?.messages) ? convOrMessages.messages : []);
  const resolvedPhone = cleanWhatsAppPhone(guestPhone || convOrMessages?.phone || "");

  const dateInfo = extractDatesFromMessages(messages);

  // Detecta preferência de café da manhã e quantidade de hóspedes no histórico
  let breakfastPreference = null;
  let guestsCount = 1;
  let preferredFlatNumber = null;
  let hasBookingKeywords = false;
  let hasPostStayFiscalOnly = false;

  for (const msg of messages) {
    const text = String(msg?.text || msg?.message || "").trim();
    if (!text) continue;
    const norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (/\b(?:sem\s+cafe|s\/\s*cafe|apenas\s+hospedagem|somente\s+hospedagem|nao\s+quero\s+cafe)\b/.test(norm) && !/\bcom\s+cafe\b/.test(norm)) {
      breakfastPreference = "without_breakfast";
    } else if (/\b(?:com\s+cafe|c\/\s*cafe|cafe\s+incluso|incluir\s+cafe|quero\s+cafe)\b/.test(norm) && !/\bsem\s+cafe\b/.test(norm)) {
      breakfastPreference = "with_breakfast";
    }

    const gMatch = norm.match(/\b([1-4])\s*(?:hospedes?|pessoas?|adultos?)\b/);
    if (gMatch) {
      guestsCount = parseInt(gMatch[1], 10);
    } else if (/\b(?:casal|duas\s+pessoas|dois\s+adultos|eu\s+e\s+minha\s+esposa|eu\s+e\s+meu\s+marido)\b/.test(norm)) {
      guestsCount = 2;
    } else if (/\b(?:sozinho|individual|uma\s+pessoa|1\s+adulto)\b/.test(norm)) {
      guestsCount = 1;
    }

    const flatMatch = norm.match(/\b(?:flat|apto|apartamento|unidade|quarto)\s*(\d{3,4})\b/);
    if (flatMatch) {
      preferredFlatNumber = flatMatch[1];
    }

    if (/\b(?:reservar|reserva|pre-?reserva|disponibilidade|disponivel|vaga|diaria|diarias|cotacao|orcamento|fechar|confirmar|hospedar|hospedagem|check-?in|ficar|estadia|quarto|flat|dados\s+para\s+reserva|fazer\s+a\s+reserva|pode\s+reservar)\b/.test(norm)) {
      hasBookingKeywords = true;
    }

    if (/\b(?:nota\s+fiscal|nfse|nfs-e|emitir\s+nota|emissao\s+de\s+nota|recibo\s+fiscal)\b/.test(norm)) {
      hasPostStayFiscalOnly = true;
    }
  }

  const quoteInfo = extractQuoteFromMessages(messages, dateInfo.nights || 1, breakfastPreference);
  const fullName = extractFullNameFromMessages(messages);
  const cpf = extractCpfFromMessages(messages, resolvedPhone, db);
  const email = extractEmailFromMessages(messages);

  const hasDates = Boolean(dateInfo.hasDates && dateInfo.checkIn && dateInfo.checkOut);
  const hasQuote = Boolean(quoteInfo.hasQuote && quoteInfo.totalAmount > 0);
  const hasFullName = Boolean(fullName && fullName.split(/\s+/).length >= 2);
  const hasCpf = Boolean(cpf && cpf.length === 11);
  const hasEmail = Boolean(email && email.includes("@"));

  const isPureFiscal = hasPostStayFiscalOnly && !/\b(?:reservar|nova\s+reserva|pre-?reserva|disponibilidade|cotacao|orcamento)\b/i.test(
    messages.map(m => String(m?.text || "")).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  const hasBookingIntent = !isPureFiscal && (hasBookingKeywords || (hasDates && hasQuote));

  const missingFields = [];
  if (!hasDates) missingFields.push("datas");
  if (!hasQuote) missingFields.push("orcamento_valor");
  if (!hasFullName) missingFields.push("nome_completo");
  if (!hasCpf) missingFields.push("cpf");
  if (!hasEmail) missingFields.push("email");
  if (!hasBookingIntent) missingFields.push("intencao_reserva");

  const includeBreakfast = breakfastPreference === "with_breakfast";
  const ratePlan = includeBreakfast ? "with_breakfast" : "room_only";

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    hasDates,
    hasQuote,
    hasFullName,
    hasCpf,
    hasEmail,
    hasBookingIntent,
    checkIn: dateInfo.checkIn,
    checkOut: dateInfo.checkOut,
    nights: dateInfo.nights,
    displayCheckIn: dateInfo.displayCheckIn,
    displayCheckOut: dateInfo.displayCheckOut,
    totalAmount: quoteInfo.totalAmount,
    dailyRate: quoteInfo.dailyRate,
    guestName: fullName,
    guestCpf: cpf,
    formattedCpf: cpf ? formatCpf(cpf) : null,
    guestEmail: email,
    guestPhone: resolvedPhone,
    guests: guestsCount,
    includeBreakfast,
    ratePlan,
    preferredFlatNumber
  };
}

/**
 * Formata a mensagem de resumo de pré-reserva enviada pela Sofia para o WhatsApp do gestor.
 */
export function formatActivePreReservationManagerSummary(proposal, db = null, options = {}) {
  const isReviewUpdate = Boolean(options.isReviewUpdate);
  const availableList = Array.isArray(proposal.availableFlatNumbers) && proposal.availableFlatNumbers.length > 0
    ? proposal.availableFlatNumbers.join(", ")
    : (proposal.flatNumber || "Nenhum");

  const totalFmt = Number(proposal.totalAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dailyFmt = Number(proposal.dailyRate || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cpfFmt = proposal.guestCpf ? formatCpf(proposal.guestCpf) : "Não informado";
  const phoneFmt = proposal.guestPhone ? formatPhoneDisplay(proposal.guestPhone) : "Não informado";
  const inDisp = proposal.checkIn ? proposal.checkIn.split("-").reverse().join("/") : "-";
  const outDisp = proposal.checkOut ? proposal.checkOut.split("-").reverse().join("/") : "-";
  const nights = Math.max(1, Number(proposal.nights || 1));
  const guests = Math.max(1, Number(proposal.guests || 1));

  const header = isReviewUpdate
    ? `✏️ *Resumo Atualizado da Pré-Reserva (#${proposal.id}) — Sofia*`
    : `🤖 *Assistente Ativa de Pré-Reservas — Sofia*\nIdentifiquei intenção de reserva com todos os dados completos no atendimento em andamento:`;

  return `${header}

👤 *Hóspede:* ${proposal.guestName}
🪪 *CPF:* ${cpfFmt}
📧 *E-mail:* ${proposal.guestEmail}
📱 *WhatsApp:* ${phoneFmt}
📅 *Período:* ${inDisp} a ${outDisp} (*${nights} ${nights === 1 ? "diária" : "diárias"}*)
👥 *Hóspedes:* ${guests} ${guests === 1 ? "pessoa" : "pessoas"}
☕ *Café da Manhã:* ${proposal.includeBreakfast ? "Incluso" : "Não incluso"}
💰 *Valor Total:* R$ ${totalFmt} (Diária: R$ ${dailyFmt})
🏢 *Flat Sugerido (Flat da Vez):* *Flat ${proposal.flatNumber}*
_(Flats disponíveis no período: ${availableList})_${proposal.notes ? `\n📝 *Obs:* ${proposal.notes}` : ""}

Deseja que eu crie a pré-reserva no sistema agora?
• Responda *"Sim"* ou *"Pode criar"* para confirmar;
• Ou peça para criar alterando algum dado (ex.: *"Pode criar, mas coloca no flat 509"*, *"Cria com valor 480"*);
• Ou peça para revisar antes (ex.: *"Muda para o flat 509 para eu revisar"*);
• Ou responda *"Cancelar"* para descartar.`;
}

/**
 * Avalia a conversa conduzida pelo operador humano e, caso contenha os 5 dados obrigatórios + intenção de reserva,
 * seleciona o Flat da Vez (Fair-Share), registra a proposta pendente e envia o resumo para o WhatsApp do gestor.
 */
export async function evaluateAndNotifyActivePreReservation({
  db,
  conv,
  cleanTarget,
  incomingInfo = null,
  saveDatabase = null,
  createNotification = null,
  sendZapiMessage = null,
  appendMessageFn = null
}) {
  if (!db || !conv) {
    return { triggered: false, reason: "missing_context" };
  }

  const guestPhone = cleanWhatsAppPhone(cleanTarget || conv.phone || "");
  if (!guestPhone || isDeveloperPhone(guestPhone, db)) {
    return { triggered: false, reason: "developer_phone_ignored" };
  }

  if (!isOperatorConductingConversation(conv, db, incomingInfo)) {
    return { triggered: false, reason: "not_operator_conversation" };
  }

  const extracted = extractActivePreReservationData(conv, db, guestPhone);
  if (!extracted.isComplete) {
    return {
      triggered: false,
      reason: "incomplete_mandatory_data",
      missingFields: extracted.missingFields,
      extracted
    };
  }

  // Verifica se já existe uma reserva ou pré-reserva ativa no sistema para o mesmo hóspede e período
  const nowMs = Date.now();
  const existingReservation = (db.reservations || []).find(r => {
    if (!r) return false;
    const statusNorm = String(r.status || "").toLowerCase();
    if (["cancelada", "cancelled", "expirada", "no_show"].includes(statusNorm)) return false;
    if ((statusNorm === "pre_reserva" || statusNorm === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") {
      return false;
    }
    const sameDates = r.checkinDate === extracted.checkIn && r.checkoutDate === extracted.checkOut;
    if (!sameDates) return false;
    const rPhone = cleanWhatsAppPhone(r.guestPhone || r.phone || "");
    const rCpf = onlyDigits(r.guestCpf || r.guestDocument || "");
    return (rPhone && matchClientPhone(rPhone, guestPhone)) || (rCpf && rCpf === extracted.guestCpf);
  });

  if (existingReservation) {
    return {
      triggered: false,
      reason: "reservation_already_exists",
      reservationCode: existingReservation.code
    };
  }

  if (!Array.isArray(db.pendingPreReservationProposals)) {
    db.pendingPreReservationProposals = [];
  }

  // Deduplicação: verifica se já existe uma proposta pendente ou confirmada para este hóspede e datas com os mesmos dados
  const signature = `${guestPhone}|${extracted.checkIn}|${extracted.checkOut}|${extracted.totalAmount}|${extracted.guestCpf}|${extracted.guestEmail}|${extracted.guestName}`;
  const existingProposal = db.pendingPreReservationProposals.find(p =>
    p &&
    matchClientPhone(p.guestPhone, guestPhone) &&
    p.checkIn === extracted.checkIn &&
    p.checkOut === extracted.checkOut &&
    (p.status === "pending_manager" || p.status === "confirmed")
  );

  if (existingProposal && existingProposal.signature === signature) {
    return {
      triggered: false,
      reason: "proposal_already_notified",
      proposalId: existingProposal.id
    };
  }

  // Seleciona sempre o Flat da Vez (Fair-Share) entre os flats disponíveis no período
  const fairShare = selectFairShareFlat(db, extracted.checkIn, extracted.checkOut);
  if (!fairShare.recommendedFlat) {
    return {
      triggered: false,
      reason: "no_available_flats_in_period",
      extracted
    };
  }

  const selectedFlat = fairShare.recommendedFlat;
  const preferredFlatNote =
    extracted.preferredFlatNumber && String(extracted.preferredFlatNumber) !== String(selectedFlat.number)
      ? `Flat ${extracted.preferredFlatNumber} foi citado na conversa`
      : "";

  const proposalId = existingProposal && existingProposal.status === "pending_manager"
    ? existingProposal.id
    : `PRERES-${Date.now().toString(36).toUpperCase().slice(-5)}`;

  const proposal = {
    id: proposalId,
    status: "pending_manager",
    signature,
    guestPhone,
    guestName: extracted.guestName,
    guestCpf: extracted.guestCpf,
    guestEmail: extracted.guestEmail,
    checkIn: extracted.checkIn,
    checkOut: extracted.checkOut,
    nights: extracted.nights,
    guests: extracted.guests || 1,
    totalAmount: extracted.totalAmount,
    dailyRate: extracted.dailyRate,
    includeBreakfast: extracted.includeBreakfast,
    ratePlan: extracted.ratePlan,
    flatId: selectedFlat.id,
    flatNumber: String(selectedFlat.number),
    fairShareFlatNumber: String(fairShare.recommendedFlat.number),
    preferredFlatNumber: extracted.preferredFlatNumber || null,
    availableFlatNumbers: fairShare.availableFlats.map(f => String(f.number)),
    notes: preferredFlatNote,
    createdAt: existingProposal?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingProposal && existingProposal.status === "pending_manager") {
    const idx = db.pendingPreReservationProposals.indexOf(existingProposal);
    db.pendingPreReservationProposals[idx] = proposal;
  } else {
    db.pendingPreReservationProposals.unshift(proposal);
  }

  const managerPhone = getManagerWhatsAppPhone(db);
  const summaryMessage = formatActivePreReservationManagerSummary(proposal, db);

  let sendRes = null;
  if (typeof sendZapiMessage === "function") {
    sendRes = await sendZapiMessage(db.zapiConfig, {
      phone: managerPhone,
      message: summaryMessage,
      channelId: "ai_agent",
      recipientRole: "developer",
      bypassTestMode: true,
      triggerEvent: "sofia_active_pre_reservation_prompt",
      db
    });
  }

  if (typeof appendMessageFn === "function") {
    const aiConfig = getWhatsAppAiConfig(db);
    appendMessageFn(db, {
      phone: managerPhone,
      senderName: aiConfig.agentName || "Sofia",
      fromMe: true,
      text: summaryMessage,
      type: "text",
      status: sendRes?.success === false ? "failed" : "delivered",
      timestamp: new Date().toISOString(),
      messageId: sendRes?.messageId || `sofia_preres_prompt_${Date.now()}`
    });
  }

  if (typeof createNotification === "function") {
    createNotification({
      category: "whatsapp",
      title: `🤖 Pré-Reserva Pronta p/ Aprovação: ${proposal.guestName}`,
      message: `Flat ${proposal.flatNumber} (Flat da Vez) • ${extracted.displayCheckIn} a ${extracted.displayCheckOut} • R$ ${Number(proposal.totalAmount).toFixed(2)}. Confira no seu WhatsApp!`,
      type: "sofia_pre_reservation_proposal",
      targetUrl: `/whatsapp-chat?phone=${guestPhone}`,
      link: `/whatsapp-chat?phone=${guestPhone}`
    });
  }

  if (typeof saveDatabase === "function") {
    try { saveDatabase("active_pre_reservation_proposal_created"); } catch (_) {}
  }

  return {
    triggered: true,
    proposal,
    managerPhone,
    summaryMessage
  };
}

/**
 * Cria a pré-reserva oficial no PMS seguindo rigorosamente o fluxo padrão de pré-reserva (status: "pre_reserva")
 * e dispara o gatilho imediato da régua de reservas (pre_reservation_created) sem enviar mensagem extra da IA ao hóspede.
 */
export async function createStandardPmsPreReservation(db, proposal, options = {}) {
  const saveDatabase = options.saveDatabase || null;
  const triggerImmediateFn = options.triggerImmediateFn || triggerImmediateWhatsApp;

  const flat = (db?.flats || []).find(f =>
    String(f.id) === String(proposal.flatId) || String(f.number) === String(proposal.flatNumber)
  );
  if (!flat) {
    return {
      success: false,
      error: "FLAT_NOT_FOUND",
      message: `O Flat ${proposal.flatNumber || proposal.flatId} não foi encontrado no cadastro do sistema.`
    };
  }

  // Revalida disponibilidade do flat no período
  const fairCheck = selectFairShareFlat(db, proposal.checkIn, proposal.checkOut);
  const isSelectedFlatAvailable = fairCheck.availableFlats.some(f =>
    String(f.id) === String(flat.id) || String(f.number) === String(flat.number)
  );
  if (!isSelectedFlatAvailable) {
    return {
      success: false,
      error: "FLAT_UNAVAILABLE",
      availableFlatNumbers: fairCheck.availableFlats.map(f => String(f.number)),
      recommendedFlatNumber: fairCheck.recommendedFlat?.number || null,
      message: `O Flat ${flat.number} não está disponível para o período de ${proposal.checkIn.split("-").reverse().join("/")} a ${proposal.checkOut.split("-").reverse().join("/")}.`
    };
  }

  if (!Array.isArray(db.guests)) db.guests = [];
  if (!Array.isArray(db.reservations)) db.reservations = [];

  const cleanGuestPhone = cleanWhatsAppPhone(proposal.guestPhone || "");
  const cleanGuestCpf = onlyDigits(proposal.guestCpf || "");
  const cleanGuestEmail = String(proposal.guestEmail || "").trim().toLowerCase();
  const cleanGuestName = String(proposal.guestName || "Hóspede").trim();

  // 1. Vincula ou cria o hóspede em db.guests (padrão PMS demo-server.mjs)
  let guestRecord = db.guests.find(g =>
    (cleanGuestCpf && onlyDigits(g.cpf || g.document || "") === cleanGuestCpf) ||
    (cleanGuestPhone && matchClientPhone(g.phone || "", cleanGuestPhone))
  );

  if (!guestRecord) {
    const nextGuestId = db.guests.length > 0
      ? Math.max(...db.guests.map(g => Number(g.id) || 0)) + 1
      : 1;
    guestRecord = {
      id: nextGuestId,
      name: cleanGuestName,
      phone: cleanGuestPhone,
      email: cleanGuestEmail,
      document: cleanGuestCpf,
      cpf: cleanGuestCpf,
      notes: "",
      totalStays: 1,
      lastStay: proposal.checkIn,
      createdAt: new Date().toISOString()
    };
    db.guests.push(guestRecord);
  } else {
    guestRecord.name = cleanGuestName || guestRecord.name;
    if (cleanGuestPhone) guestRecord.phone = cleanGuestPhone;
    if (cleanGuestEmail) guestRecord.email = cleanGuestEmail;
    if (cleanGuestCpf) {
      guestRecord.document = cleanGuestCpf;
      guestRecord.cpf = cleanGuestCpf;
    }
    guestRecord.lastStay = proposal.checkIn;
  }

  // 2. Calcula diárias e estrutura dailyRates (padrão PMS demo-server.mjs)
  const inD = new Date(`${proposal.checkIn}T12:00:00Z`);
  const outD = new Date(`${proposal.checkOut}T12:00:00Z`);
  const nights = Math.max(1, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));
  const totalAmount = Math.round(Number(proposal.totalAmount || 0) * 100) / 100;
  const dailyRate = proposal.dailyRate != null && proposal.dailyRate > 0
    ? Math.round(Number(proposal.dailyRate) * 100) / 100
    : Math.round((totalAmount / nights) * 100) / 100;

  const dailyRates = [];
  for (let i = 0; i < nights; i++) {
    const d = new Date(inD.getTime() + i * 86400000);
    dailyRates.push({
      date: d.toISOString().slice(0, 10),
      rate: dailyRate
    });
  }

  const nextResId = db.reservations.length > 0
    ? Math.max(...db.reservations.map(r => Number(r.id) || 0)) + 1
    : 1;
  const code = `RES-${String(flat.number)}-${String(nextResId).padStart(4, "0")}`;
  const cleanTxId = code.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);

  const pixPayload = generateStaticPixPayload({
    pixKey: db?.settings?.interConfig?.pixKey || "47964813000165",
    amount: totalAmount,
    merchantName: "CORPFLATS LTDA",
    merchantCity: "CAMPOS DOS GOYTACAZES",
    txid: cleanTxId
  });

  const nowIso = new Date().toISOString();
  const guestsCount = Math.min(Math.max(1, Number(proposal.guests || 1)), 4);
  const includeBreakfast = Boolean(proposal.includeBreakfast);

  const preparedGuests = [];
  for (let i = 1; i <= guestsCount; i++) {
    if (i === 1) {
      preparedGuests.push({
        index: 1,
        guestId: guestRecord.id,
        name: cleanGuestName,
        cpf: cleanGuestCpf,
        phone: cleanGuestPhone,
        email: cleanGuestEmail,
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    } else {
      preparedGuests.push({
        index: i,
        guestId: null,
        name: `Hóspede ${i}`,
        cpf: "",
        phone: "",
        email: "",
        hasCompletedCheckin: false,
        checkinCompletedAt: null
      });
    }
  }

  const newReservation = {
    id: nextResId,
    code,
    flatId: flat.id,
    flatNumber: String(flat.number),
    guestId: guestRecord.id,
    guestName: cleanGuestName,
    guestPhone: cleanGuestPhone,
    phone: cleanGuestPhone,
    guestEmail: cleanGuestEmail,
    guestDocument: cleanGuestCpf,
    guestCpf: cleanGuestCpf,
    checkinDate: proposal.checkIn,
    checkoutDate: proposal.checkOut,
    checkinTime: "14:00",
    checkoutTime: "12:00",
    status: "pre_reserva",
    paymentStatus: "pendente",
    totalAmount,
    dailyRate,
    dailyRates,
    paidAmount: 0,
    payments: [],
    paymentMethod: "pix",
    channel: "whatsapp",
    source: "whatsapp",
    ratePlan: includeBreakfast ? "with_breakfast" : "room_only",
    includeBreakfast,
    breakfastIncluded: includeBreakfast,
    guestCount: guestsCount,
    guestsCount,
    numGuests: guestsCount,
    adults: guestsCount,
    children: 0,
    guests: preparedGuests,
    pixCopiaECola: pixPayload,
    pixTxId: cleanTxId,
    notes: proposal.notes || "Pré-reserva criada pela Assistente Ativa Sofia mediante confirmação do gestor via WhatsApp.",
    createdBy: {
      userId: null,
      userName: "Sofia (Assistente Ativa WhatsApp)",
      name: "Sofia (Assistente Ativa WhatsApp)",
      role: "ai_assistant",
      source: "Assistente Ativa WhatsApp",
      createdAt: nowIso
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    auditLogs: [
      {
        id: `audit_${Date.now()}`,
        timestamp: nowIso,
        action: "created",
        actor: {
          id: null,
          name: "Sofia / Gestor",
          role: "admin",
          type: "user"
        },
        source: "Assistente Ativa WhatsApp",
        description: "Pré-reserva criada via Assistente Ativa Sofia (confirmada pelo gestor no WhatsApp)",
        changes: [
          { field: "flatNumber", label: "Apartamento", oldValue: null, newValue: `Flat ${flat.number}` },
          { field: "dates", label: "Período da Estadia", oldValue: null, newValue: `${proposal.checkIn} a ${proposal.checkOut}` },
          { field: "guestName", label: "Hóspede Titular", oldValue: null, newValue: cleanGuestName },
          { field: "status", label: "Status da Reserva", oldValue: null, newValue: "Pré-Reserva" },
          { field: "totalAmount", label: "Valor Total", oldValue: null, newValue: `R$ ${totalAmount.toFixed(2)}` }
        ]
      }
    ]
  };

  db.reservations.unshift(newReservation);

  if (typeof saveDatabase === "function") {
    try { saveDatabase("pre_reservation_created_by_sofia_assistant"); } catch (_) {}
  }

  // Dispara apenas a régua padrão de pré-reserva do sistema (sem mensagem avulsa de chat da IA)
  if (options.skipImmediateTrigger !== true && typeof triggerImmediateFn === "function") {
    try {
      await triggerImmediateFn(db, saveDatabase, "pre_reservation_created", newReservation);
    } catch (trigErr) {
      console.warn("[Active Pre-Reservation Assistant] Aviso ao acionar régua pre_reservation_created:", trigErr.message);
    }
  }

  return {
    success: true,
    reservation: newReservation,
    guest: guestRecord
  };
}

/**
 * Interpreta a resposta do gestor no WhatsApp para uma proposta de pré-reserva pendente:
 * - Confirmação direta ("sim", "pode criar", "confirmo", "ok")
 * - Confirmação com alterações ("pode criar, mas coloca no flat 509", "cria com valor 480", etc.)
 * - Pedido de edição/revisão antes de confirmar ("muda para o flat 509 e valor 480 para eu revisar", ou envio apenas das alterações)
 * - Cancelamento ("cancelar", "não precisa criar")
 */
export function parseManagerPreReservationCommand(text, proposal, db = null) {
  if (!text || typeof text !== "string" || !proposal) {
    return { matched: false };
  }

  const trimmed = text.trim();
  const norm = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Evita interceptar mensagens geradas pela própria Sofia (ecos de webhook Z-API)
  if (isAutomatedOrSofiaMessage({ text: trimmed })) {
    return { matched: false };
  }

  // Evita interceptar comandos explícitos de treinamento/calibração da Sofia que não tratam da pré-reserva
  if (/^sofia\s*[,:]?\s*(?:seja\s+mais|use\s+tom|nao\s+use\s+emojis|lembre-se\s+que|sempre\s+que\s+um\s+hospede|a\s+partir\s+de\s+agora\s+responda)/i.test(norm)) {
    return { matched: false };
  }

  const updates = {};
  let hasFieldUpdates = false;

  // 1. Alteração de Flat (ex: "no flat 509", "coloca no 509", "apto 404", "muda pro 301")
  const allFlatNumbers = (Array.isArray(db?.flats) ? db.flats : []).map(f => String(f.number));
  const explicitFlatMatch = norm.match(/\b(?:flat|apto|apartamento|unidade|quarto)\s*[:=\-]?\s*(\d{3,4})\b/);
  if (explicitFlatMatch) {
    updates.flatNumber = explicitFlatMatch[1];
    hasFieldUpdates = true;
  } else {
    const shortFlatMatch = norm.match(/\b(?:coloca\s+no|muda\s+p(?:ara\s+o|ro)|vai\s+no|cria\s+no|reserva\s+no|no)\s+(\d{3,4})\b/);
    if (shortFlatMatch && (allFlatNumbers.length === 0 || allFlatNumbers.includes(shortFlatMatch[1]))) {
      updates.flatNumber = shortFlatMatch[1];
      hasFieldUpdates = true;
    }
  }

  // 2. Alteração de Datas (ex: "muda as datas para 22/11 a 25/11" ou "check-in 22/11 e check-out 25/11")
  const parsedDates = parseNaturalDatesFromText(trimmed);
  if (parsedDates && parsedDates.checkIn && parsedDates.checkOut && parsedDates.checkIn < parsedDates.checkOut) {
    updates.checkIn = parsedDates.checkIn;
    updates.checkOut = parsedDates.checkOut;
    const inD = new Date(`${parsedDates.checkIn}T12:00:00Z`);
    const outD = new Date(`${parsedDates.checkOut}T12:00:00Z`);
    updates.nights = Math.max(1, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));
    hasFieldUpdates = true;
  } else {
    const inMatch = trimmed.match(/(?:check-?in|entrada)\s*(?:para|:|=|-)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i);
    const outMatch = trimmed.match(/(?:check-?out|sa[ií]da)\s*(?:para|:|=|-)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i);
    const newIn = inMatch ? parseSingleDateToken(inMatch[1]) : null;
    const newOut = outMatch ? parseSingleDateToken(outMatch[1]) : null;
    const finalIn = newIn || proposal.checkIn;
    const finalOut = newOut || proposal.checkOut;
    if ((newIn || newOut) && finalIn && finalOut && finalIn < finalOut) {
      updates.checkIn = finalIn;
      updates.checkOut = finalOut;
      const inD = new Date(`${finalIn}T12:00:00Z`);
      const outD = new Date(`${finalOut}T12:00:00Z`);
      updates.nights = Math.max(1, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));
      hasFieldUpdates = true;
    }
  }

  const effectiveNights = updates.nights || proposal.nights || 1;

  // 3. Alteração de Valor Total ou Diária
  // Remove ocorrências de "flat 509", datas e CPF da string para não confundir números de flat/data/CPF com valor
  const textWithoutFlatAndDates = trimmed
    .replace(/\b(?:flat|apto|apartamento|unidade|quarto)\s*[:=\-]?\s*\d{3,4}\b/gi, " ")
    .replace(/\b(?:coloca\s+no|muda\s+p(?:ara\s+o|ro)|vai\s+no|cria\s+no|reserva\s+no)\s+\d{3,4}\b/gi, " ")
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\bcpf\s*(?:para|[eé]|:|=|-|\s)*\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2}\b/gi, " ")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " ");

  const dailyUpdateMatch =
    textWithoutFlatAndDates.match(/\bdi[aá]ria\s*(?:de|para|por|:|=|-)?\s*R?\$?\s*(\d{2,5}(?:[.,]\d{1,2})?)/i) ||
    textWithoutFlatAndDates.match(/R?\$?\s*(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:reais\s+)?(?:a\s+di[aá]ria|por\s+di[aá]ria|por\s+noite|\/\s*dia|\/\s*noite)/i);

  const textWithoutDaily = dailyUpdateMatch
    ? textWithoutFlatAndDates.replace(dailyUpdateMatch[0], " ")
    : textWithoutFlatAndDates;

  const totalUpdateMatch = textWithoutDaily.match(/\b(?:valor(?:\s+total)?|total|or[cç]amento|pre[cç]o|por)\s*(?:de|para|:|=|-)?\s*R?\$?\s*(\d{2,5}(?:[.,]\d{1,2})?)/i) ||
                           textWithoutDaily.match(/R\$\s*(\d{2,5}(?:[.,]\d{1,2})?)/i) ||
                           textWithoutDaily.match(/\b(\d{2,5}(?:[.,]\d{1,2})?)\s*reais\b/i);

  if (dailyUpdateMatch && dailyUpdateMatch[1]) {
    const parsedDaily = parseBrlAmountValue(dailyUpdateMatch[1]);
    if (parsedDaily && parsedDaily >= 50) {
      updates.dailyRate = parsedDaily;
      updates.totalAmount = Math.round(parsedDaily * effectiveNights * 100) / 100;
      hasFieldUpdates = true;
    }
  }
  if (totalUpdateMatch && totalUpdateMatch[1]) {
    const parsedTotal = parseBrlAmountValue(totalUpdateMatch[1]);
    if (parsedTotal && parsedTotal >= 50) {
      updates.totalAmount = parsedTotal;
      if (!updates.dailyRate) {
        updates.dailyRate = Math.round((parsedTotal / effectiveNights) * 100) / 100;
      }
      hasFieldUpdates = true;
    }
  } else if (!updates.totalAmount && updates.nights && updates.nights !== proposal.nights && proposal.dailyRate) {
    updates.totalAmount = Math.round(proposal.dailyRate * updates.nights * 100) / 100;
  }

  // 4. Alteração de Café da Manhã
  if (/\b(?:com\s+cafe|inclui(?:r)?\s+cafe|cafe\s+incluso|adiciona(?:r)?\s+cafe)\b/.test(norm)) {
    updates.includeBreakfast = true;
    updates.ratePlan = "with_breakfast";
    hasFieldUpdates = true;
  } else if (/\b(?:sem\s+cafe|tira(?:r)?\s+(?:o\s+)?cafe|retira(?:r)?\s+(?:o\s+)?cafe|remove(?:r)?\s+(?:o\s+)?cafe)\b/.test(norm)) {
    updates.includeBreakfast = false;
    updates.ratePlan = "room_only";
    hasFieldUpdates = true;
  }

  // 5. Alteração de Quantidade de Hóspedes
  const guestsUpdateMatch = norm.match(/\b([1-4])\s*(?:hospedes?|pessoas?|adultos?)\b/);
  if (guestsUpdateMatch) {
    updates.guests = parseInt(guestsUpdateMatch[1], 10);
    hasFieldUpdates = true;
  } else if (/\b(?:casal|duas\s+pessoas)\b/.test(norm)) {
    updates.guests = 2;
    hasFieldUpdates = true;
  }

  // 6. Alteração de Nome, CPF ou E-mail
  const nameUpdateMatch = trimmed.match(/\bnome(?:\s+do\s+h[oó]spede)?\s*(?:para|[eé]|:|=|-)+\s*([^\n\r,;]+)/i);
  if (nameUpdateMatch && nameUpdateMatch[1]) {
    const cleanNewName = sanitizeFullNameCandidate(nameUpdateMatch[1]);
    if (cleanNewName && cleanNewName.split(/\s+/).length >= 2) {
      updates.guestName = cleanNewName;
      hasFieldUpdates = true;
    }
  }

  const cpfUpdateMatch = trimmed.match(/\bcpf\s*(?:para|[eé]|:|=|-|\s)*(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2}|\d{11})\b/i);
  if (cpfUpdateMatch && cpfUpdateMatch[1]) {
    updates.guestCpf = onlyDigits(cpfUpdateMatch[1]);
    hasFieldUpdates = true;
  }

  const emailUpdateMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailUpdateMatch) {
    updates.guestEmail = emailUpdateMatch[0].toLowerCase();
    hasFieldUpdates = true;
  }

  // Remove eventual prefixo de identificação da proposta (ex: "#PRERES-123 sim" ou "Roberto: cancelar") para avaliar intenção
  const normWithoutProposalPrefix = norm
    .replace(/^#?preres-[a-z0-9]+\s*[,:\-]?\s*/i, "")
    .replace(/^(?:para\s+[oa]\s+|d[eo]\s+|a\s+d[eo]\s+)?[a-z]+\s*[,:\-]\s*/i, "")
    .trim();

  // 7. Classificação da Intenção do Gestor
  const isCancel =
    /^(?:nao|não|cancela|cancelar|descarta|descartar|ignora|ignorar|aborta|abortar)\b/.test(normWithoutProposalPrefix) ||
    /\b(?:nao\s+precisa\s+criar|nao\s+cria|nao\s+faca|deixa\s+quieto|ja\s+criei|ja\s+fiz\s+manualmente|pode\s+cancelar|pode\s+descartar|cancela\s+a\s+d[eo]|cancelar\s+a\s+d[eo])\b/.test(norm);

  if (isCancel && !hasFieldUpdates) {
    return {
      matched: true,
      action: "cancel",
      updates: {}
    };
  }

  const hasReviewOnlyIntent =
    /\b(?:para\s+eu\s+revisar|pra\s+eu\s+revisar|para\s+revisar|para\s+eu\s+ver|pra\s+eu\s+ver|antes\s+de\s+criar|antes\s+de\s+confirmar|sem\s+criar\s+ainda|nao\s+cria\s+ainda|so\s+altera|apenas\s+altera|so\s+muda|apenas\s+muda|me\s+mostra\s+como\s+fica)\b/.test(norm);

  const hasConfirmIntent =
    /^(?:sim|s|ok|okay|confirmo|confirmado|confirma|aprovo|aprovado|autorizo|pode\s+criar|pode\s+fazer|pode\s+gerar|pode\s+confirmar|cria|criar|gera|gerar|fechado|perfeito|isso\s+mesmo|manda\s+bala)\b/.test(normWithoutProposalPrefix) ||
    /\b(?:pode\s+criar|pode\s+fazer|pode\s+gerar|pode\s+confirmar|pode\s+lancar|confirmo|confirmado|aprovo|aprovado|cria\s+no|cria\s+com|cria\s+a\s+(?:pre|d[eo])|cria\s+para|gera\s+a\s+pre)\b/.test(norm);

  if (hasConfirmIntent && !hasReviewOnlyIntent) {
    return {
      matched: true,
      action: "confirm_and_create",
      updates
    };
  }

  if (hasFieldUpdates) {
    return {
      matched: true,
      action: "update_and_review",
      updates
    };
  }

  return { matched: false };
}

/**
 * Processa a resposta do gestor (no WhatsApp 22998505276) referente à proposta pendente da Assistente Ativa de Pré-Reservas.
 */
export async function handleManagerPreReservationReply({
  db,
  cleanTarget,
  messageText,
  conv = null,
  sendZapiMessage = null,
  appendMessageFn = null,
  saveDatabase = null,
  createNotification = null,
  triggerImmediateFn = null
}) {
  if (!db || !messageText || !isDeveloperPhone(cleanTarget, db)) {
    return { handled: false };
  }

  const pendingList = (db.pendingPreReservationProposals || []).filter(p => p && p.status === "pending_manager");
  if (pendingList.length === 0) {
    return { handled: false };
  }

  // Se houver mais de uma proposta pendente, permite selecionar pelo ID (#PRERES-...) ou nome do hóspede; padrão é a mais recente
  const normText = String(messageText).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normTextWithoutRename = normText.replace(/\bnome(?:\s+do\s+hospede)?\s*(?:para|e|:|=|-)+\s*[^\n\r,;]+/i, "");
  let targetProposal = pendingList[0];

  const matchedById = pendingList.find(p => {
    const idLower = String(p.id || "").toLowerCase();
    return idLower && normText.includes(idLower);
  });

  if (matchedById) {
    targetProposal = matchedById;
  } else {
    for (const p of pendingList) {
      const firstName = String(p.guestName || "").split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (firstName.length >= 3 && normTextWithoutRename.includes(firstName)) {
        targetProposal = p;
        break;
      }
    }
  }

  const parsedCmd = parseManagerPreReservationCommand(messageText, targetProposal, db);
  if (!parsedCmd.matched) {
    return { handled: false };
  }

  const aiConfig = getWhatsAppAiConfig(db);
  const managerPhone = cleanWhatsAppPhone(cleanTarget) || getManagerWhatsAppPhone(db);

  const sendManagerReply = async (replyText, eventTag = "sofia_active_pre_reservation_reply") => {
    if (typeof sendZapiMessage === "function") {
      await sendZapiMessage(db.zapiConfig, {
        phone: managerPhone,
        message: replyText,
        channelId: "ai_agent",
        recipientRole: "developer",
        bypassTestMode: true,
        triggerEvent: eventTag,
        db
      });
    }
    if (typeof appendMessageFn === "function") {
      appendMessageFn(db, {
        phone: managerPhone,
        senderName: aiConfig.agentName || "Sofia",
        fromMe: true,
        text: replyText,
        type: "text",
        status: "delivered",
        timestamp: new Date().toISOString(),
        messageId: `sofia_preres_reply_${Date.now()}`
      });
    }
  };

  // 1. Cancelamento / descarte da proposta
  if (parsedCmd.action === "cancel") {
    targetProposal.status = "cancelled";
    targetProposal.cancelledAt = new Date().toISOString();
    targetProposal.updatedAt = new Date().toISOString();
    if (typeof saveDatabase === "function") {
      try { saveDatabase("active_pre_reservation_proposal_cancelled"); } catch (_) {}
    }

    const cancelReply = `✅ *Proposta de Pré-Reserva Cancelada*\n\nDescartei a criação automática da pré-reserva para *${targetProposal.guestName}* (${targetProposal.checkIn.split("-").reverse().join("/")} a ${targetProposal.checkOut.split("-").reverse().join("/")}). Nenhuma alteração foi feita no sistema.`;
    await sendManagerReply(cancelReply, "sofia_active_pre_reservation_cancelled");

    return {
      handled: true,
      processed: true,
      mode: "active_pre_reservation_assistant",
      action: "cancelled",
      proposal: targetProposal,
      replyText: cancelReply
    };
  }

  // Aplica atualizações de campos solicitadas pelo gestor (flat, valor, diária, datas, café, hóspedes, nome, CPF, email)
  const updates = parsedCmd.updates || {};
  if (updates.flatNumber) {
    const flatObj = (db.flats || []).find(f => String(f.number) === String(updates.flatNumber) || String(f.id) === String(updates.flatNumber));
    if (!flatObj) {
      const notFoundReply = `⚠️ Não encontrei o *Flat ${updates.flatNumber}* cadastrado no sistema. Os flats disponíveis no período são: *${(targetProposal.availableFlatNumbers || []).join(", ")}*.\n\nPor favor, me informe um flat válido para prosseguir.`;
      await sendManagerReply(notFoundReply, "sofia_active_pre_reservation_error");
      return {
        handled: true,
        processed: true,
        mode: "active_pre_reservation_assistant",
        action: "flat_not_found",
        proposal: targetProposal,
        replyText: notFoundReply
      };
    }
    targetProposal.flatId = flatObj.id;
    targetProposal.flatNumber = String(flatObj.number);
  }

  if (updates.checkIn && updates.checkOut) {
    targetProposal.checkIn = updates.checkIn;
    targetProposal.checkOut = updates.checkOut;
    targetProposal.nights = updates.nights || targetProposal.nights;
  }
  if (updates.totalAmount != null) {
    targetProposal.totalAmount = updates.totalAmount;
  }
  if (updates.dailyRate != null) {
    targetProposal.dailyRate = updates.dailyRate;
  } else if (updates.totalAmount != null && targetProposal.nights > 0) {
    targetProposal.dailyRate = Math.round((updates.totalAmount / targetProposal.nights) * 100) / 100;
  }
  if (updates.includeBreakfast !== undefined) {
    targetProposal.includeBreakfast = updates.includeBreakfast;
    targetProposal.ratePlan = updates.ratePlan;
  }
  if (updates.guests != null) {
    targetProposal.guests = updates.guests;
  }
  if (updates.guestName) {
    targetProposal.guestName = updates.guestName;
  }
  if (updates.guestCpf) {
    targetProposal.guestCpf = updates.guestCpf;
  }
  if (updates.guestEmail) {
    targetProposal.guestEmail = updates.guestEmail;
  }

  // Revalida disponibilidade para as datas/flat atualizados
  const fairShareNow = selectFairShareFlat(db, targetProposal.checkIn, targetProposal.checkOut);
  targetProposal.availableFlatNumbers = fairShareNow.availableFlats.map(f => String(f.number));
  const isTargetFlatFree = fairShareNow.availableFlats.some(f => String(f.number) === String(targetProposal.flatNumber));

  if (!isTargetFlatFree) {
    const availStr = targetProposal.availableFlatNumbers.length > 0
      ? targetProposal.availableFlatNumbers.join(", ")
      : "Nenhum disponível";
    const conflictReply = `⚠️ O *Flat ${targetProposal.flatNumber}* possui conflito de ocupação/bloqueio no período de *${targetProposal.checkIn.split("-").reverse().join("/")} a ${targetProposal.checkOut.split("-").reverse().join("/")}*.\n\n🏢 Flats disponíveis nesse período: *${availStr}*${fairShareNow.recommendedFlat ? ` (Flat da Vez sugerido: *Flat ${fairShareNow.recommendedFlat.number}*)` : ""}.\n\nQual flat deseja utilizar para criar a pré-reserva?`;
    await sendManagerReply(conflictReply, "sofia_active_pre_reservation_conflict");
    return {
      handled: true,
      processed: true,
      mode: "active_pre_reservation_assistant",
      action: "flat_unavailable",
      proposal: targetProposal,
      replyText: conflictReply
    };
  }

  targetProposal.updatedAt = new Date().toISOString();

  // 2. Pedido de edição para revisão antes de confirmar
  if (parsedCmd.action === "update_and_review") {
    if (typeof saveDatabase === "function") {
      try { saveDatabase("active_pre_reservation_proposal_updated"); } catch (_) {}
    }
    const reviewReply = formatActivePreReservationManagerSummary(targetProposal, db, { isReviewUpdate: true });
    await sendManagerReply(reviewReply, "sofia_active_pre_reservation_review");
    return {
      handled: true,
      processed: true,
      mode: "active_pre_reservation_assistant",
      action: "updated_for_review",
      proposal: targetProposal,
      replyText: reviewReply
    };
  }

  // 3. Confirmação (direta ou com alterações embutidas) -> Cria a pré-reserva no PMS
  const createRes = await createStandardPmsPreReservation(db, targetProposal, {
    saveDatabase,
    triggerImmediateFn
  });

  if (!createRes.success) {
    const errReply = `⚠️ Não foi possível criar a pré-reserva: ${createRes.message}`;
    await sendManagerReply(errReply, "sofia_active_pre_reservation_error");
    return {
      handled: true,
      processed: true,
      mode: "active_pre_reservation_assistant",
      action: "creation_error",
      error: createRes.error,
      proposal: targetProposal,
      replyText: errReply
    };
  }

  const createdRes = createRes.reservation;
  targetProposal.status = "confirmed";
  targetProposal.confirmedAt = new Date().toISOString();
  targetProposal.reservationId = createdRes.id;
  targetProposal.reservationCode = createdRes.code;

  if (typeof saveDatabase === "function") {
    try { saveDatabase("active_pre_reservation_proposal_confirmed"); } catch (_) {}
  }

  if (typeof createNotification === "function") {
    createNotification({
      category: "reservations",
      title: `✅ Pré-Reserva Criada pela Sofia: ${createdRes.code}`,
      message: `${createdRes.guestName} • Flat ${createdRes.flatNumber} • ${createdRes.checkinDate.split("-").reverse().join("/")} a ${createdRes.checkoutDate.split("-").reverse().join("/")}`,
      type: "pre_reservation_created",
      targetUrl: `/reservas?code=${createdRes.code}`,
      link: `/reservas?code=${createdRes.code}`
    });
  }

  const totalFmt = Number(createdRes.totalAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dailyFmt = Number(createdRes.dailyRate || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const confirmReply = `✅ *Pré-Reserva Criada com Sucesso no Sistema!*

🔖 *Código:* *${createdRes.code}*
🏢 *Unidade:* *Flat ${createdRes.flatNumber}*
👤 *Hóspede:* ${createdRes.guestName}
🪪 *CPF:* ${formatCpf(createdRes.guestCpf)}
📧 *E-mail:* ${createdRes.guestEmail}
📅 *Período:* ${createdRes.checkinDate.split("-").reverse().join("/")} a ${createdRes.checkoutDate.split("-").reverse().join("/")} (*${targetProposal.nights} ${targetProposal.nights === 1 ? "diária" : "diárias"}*)
☕ *Café da Manhã:* ${createdRes.includeBreakfast ? "Incluso" : "Não incluso"}
💰 *Valor Total:* R$ ${totalFmt} (Diária: R$ ${dailyFmt})
📊 *Status:* Pré-Reserva (régua padrão do sistema acionada)`;

  await sendManagerReply(confirmReply, "sofia_active_pre_reservation_confirmed");

  return {
    handled: true,
    processed: true,
    mode: "active_pre_reservation_assistant",
    action: "confirmed_and_created",
    proposal: targetProposal,
    reservation: createdRes,
    replyText: confirmReply
  };
}

