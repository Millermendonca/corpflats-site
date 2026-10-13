import assert from "node:assert/strict";
import test from "node:test";
import {
  linkOperatorResponseToPendingFaq,
  distillGuidelineFromOperatorResponse,
  saveDeveloperGuideline,
  generateHeuristicResponse,
  DEFAULT_AI_CONFIG,
  getGreetingSalutation,
  buildDynamicSystemInstruction
} from "../scripts/whatsapp-ai-service.mjs";

test("1. Destilação Conceitual Factual (Anti-Copia-e-Cola): Pergunta de extensão + resposta 'sim'", () => {
  const db = {
    faqItems: [
      {
        id: "faq_ext_1",
        question: "consigo estender a reserva pelo WhatsApp?",
        category: "reservas",
        status: "pendente",
        sourceClientPhone: "5521998877665",
        createdAt: new Date().toISOString()
      }
    ],
    whatsappAiSettings: {
      developerGuidelines: []
    }
  };

  // Operador responde apenas "sim"
  const linked = linkOperatorResponseToPendingFaq(db, {
    clientPhone: "5521998877665",
    text: "sim",
    answeredBy: "operador"
  });

  assert.ok(linked, "linkOperatorResponseToPendingFaq deve vincular resposta do operador");
  assert.strictEqual(linked.operatorRawResponse, "sim", "Deve registrar o texto bruto original do operador");
  assert.notStrictEqual(linked.suggestedAnswer, "sim", "NUNCA deve deixar apenas 'sim' como resposta sugerida pronta");
  assert.ok(
    linked.distilledGuideline.includes("É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp"),
    `Deve destilar regra conceitual de extensão. Atual: ${linked.distilledGuideline}`
  );

  // Verifica persistência na base viva de diretrizes da IA (developerGuidelines)
  const guidelines = db.whatsappAiSettings.developerGuidelines;
  assert.strictEqual(guidelines.length, 1, "Deve ter adicionado 1 diretriz em developerGuidelines");
  assert.strictEqual(guidelines[0].source, "operator_response");
  assert.ok(guidelines[0].text.includes("É possível estender e prorrogar a reserva"));
  assert.strictEqual(guidelines[0].operatorText, "sim");
  assert.strictEqual(guidelines[0].question, "consigo estender a reserva pelo WhatsApp?");
});

test("2. Destilação de Outros Tópicos: Micro-ondas e Pets com respostas curtas", () => {
  // Teste direto de distillGuidelineFromOperatorResponse
  const distilledMicro = distillGuidelineFromOperatorResponse({
    question: "meu quarto tem micro-ondas?",
    response: "sim",
    category: "estrutura_flat"
  });
  assert.ok(distilledMicro.guidelineText.includes("micro-ondas e frigobar"), "Deve sintetizar comodidades de micro-ondas");
  assert.ok(distilledMicro.sampleResponse.includes("micro-ondas"), "Amostra deve ser natural e acolhedora");

  const distilledPet = distillGuidelineFromOperatorResponse({
    question: "posso levar meu cachorro?",
    response: "pode sim com taxa",
    category: "pet"
  });
  assert.ok(distilledPet.guidelineText.includes("pequeno porte"), "Deve sintetizar diretriz pet");
  assert.ok(distilledPet.sampleResponse.includes("pet"), "Amostra deve ser natural");

  const distilledCheckout = distillGuidelineFromOperatorResponse({
    question: "qual o horário de checkout?",
    response: "12h",
    category: "checkout"
  });
  assert.ok(distilledCheckout.guidelineText.includes("12"), "Deve capturar horário de check-out");
});

test("3. Geração Dinâmica Multitópico e Contextual com Diretriz Aprendida", () => {
  const db = {
    faqItems: [],
    whatsappAiSettings: {
      developerGuidelines: [
        {
          id: "g_ext_1",
          text: "É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp com a equipe, mediante disponibilidade do flat.",
          category: "checkout",
          active: true
        }
      ]
    }
  };

  const guestCtx = { guestName: "Carlos Silva" };

  // 3.1 Pergunta com Saudação "Bom dia" + Extensão
  const respBomDia = generateHeuristicResponse(
    "Bom dia, consigo estender a reserva pelo WhatsApp?",
    guestCtx,
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respBomDia.startsWith("Bom dia, Carlos!"), `Deve saudar cordialmente com Bom dia. Retornou: ${respBomDia}`);
  assert.ok(respBomDia.includes("estender"), "Deve responder sobre a extensão de forma natural");
  assert.ok(respBomDia.includes("WhatsApp") || respBomDia.includes("equipe"), "Deve mencionar WhatsApp ou equipe");
  assert.notStrictEqual(respBomDia.trim(), "sim", "NUNCA deve cuspir resposta monossilábica");

  // 3.2 Pergunta Composta Multitópico: Horário de Check-out + Extensão via WhatsApp
  const respComposta = generateHeuristicResponse(
    "Bom dia, qual o horário de checkout? E consigo estender a reserva pelo WhatsApp?",
    guestCtx,
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respComposta.startsWith("Bom dia, Carlos!"), `Deve retribuir Bom dia. Retornou: ${respComposta}`);
  assert.ok(respComposta.includes("12:00h") || respComposta.includes("12h"), "Deve responder ao horário de check-out");
  assert.ok(
    respComposta.includes("estender") || respComposta.includes("prorrogar"),
    "Deve responder sobre a extensão"
  );
  assert.ok(
    respComposta.includes("WhatsApp") || respComposta.includes("equipe"),
    "Deve conectar a extensão ao WhatsApp com a equipe"
  );

  // 3.3 Pergunta sem saudação
  const respSemSaudacao = generateHeuristicResponse(
    "consigo estender a reserva pelo WhatsApp?",
    guestCtx,
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respSemSaudacao.startsWith("Olá, Carlos!"), "Deve iniciar com Olá cordial");
  assert.ok(respSemSaudacao.includes("estender"), "Deve orientar sobre a extensão");
});

test("4. Instruções Anti-Copia-e-Cola em buildDynamicSystemInstruction para Gemini AI", () => {
  const db = {
    whatsappAiSettings: {
      developerGuidelines: [
        {
          id: "g_ext_1",
          text: "É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp com a equipe, mediante disponibilidade do flat.",
          category: "checkout",
          active: true
        }
      ]
    }
  };

  const dynamicBlocks = buildDynamicSystemInstruction(DEFAULT_AI_CONFIG, db, { guestName: "Carlos" });
  assert.ok(
    dynamicBlocks.guidelinesSection.includes("REGRA ANTI-COPIA-E-COLA & GERAÇÃO MULTITÓPICO CONTEXTUAL"),
    "Deve conter diretriz explícita anti-copia-e-cola no prompt dinâmico do Gemini"
  );
  assert.ok(
    dynamicBlocks.guidelinesSection.includes("É possível estender e prorrogar a reserva"),
    "Deve injetar a regra aprendida para o Gemini"
  );
});

test("5. Retribuição Cordial de Saudações (getGreetingSalutation)", () => {
  assert.strictEqual(getGreetingSalutation("bom dia!", ", Carlos"), "Bom dia, Carlos!");
  assert.strictEqual(getGreetingSalutation("Boa tarde, tudo bem?", ", Carlos"), "Boa tarde, Carlos!");
  assert.strictEqual(getGreetingSalutation("BOA NOITE", ", Carlos"), "Boa noite, Carlos!");
  assert.strictEqual(getGreetingSalutation("Olá", ", Carlos"), "Olá, Carlos!");
  assert.strictEqual(getGreetingSalutation("qual a senha do wifi?", ", Carlos"), "Olá, Carlos!");
});
