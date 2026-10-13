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

test("2. Destilação de Outros Tópicos: Micro-ondas, Pets, Checkout e Lazer com respostas curtas", () => {
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

  const distilledLazer = distillGuidelineFromOperatorResponse({
    question: "tem piscina?",
    response: "sim, na cobertura",
    category: "lazer"
  });
  assert.ok(distilledLazer.guidelineText.includes("piscina"), "Deve sintetizar diretriz de lazer");
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

  // Verifica que mesmo sem diretrizes cadastradas, a regra anti-copia-e-cola é mantida
  const emptyDb = { whatsappAiSettings: { developerGuidelines: [] } };
  const emptyBlocks = buildDynamicSystemInstruction(DEFAULT_AI_CONFIG, emptyDb, { guestName: "Carlos" });
  assert.ok(
    emptyBlocks.guidelinesSection.includes("REGRA ANTI-COPIA-E-COLA & GERAÇÃO MULTITÓPICO CONTEXTUAL"),
    "Deve conter regra anti-copia-e-cola mesmo quando lista de diretrizes estiver vazia"
  );
});

test("5. Retribuição Cordial de Saudações (getGreetingSalutation)", () => {
  assert.strictEqual(getGreetingSalutation("bom dia!", ", Carlos"), "Bom dia, Carlos!");
  assert.strictEqual(getGreetingSalutation("Boa tarde, tudo bem?", ", Carlos"), "Boa tarde, Carlos!");
  assert.strictEqual(getGreetingSalutation("BOA NOITE", ", Carlos"), "Boa noite, Carlos!");
  assert.strictEqual(getGreetingSalutation("Olá", ", Carlos"), "Olá, Carlos!");
  assert.strictEqual(getGreetingSalutation("qual a senha do wifi?", ", Carlos"), "Olá, Carlos!");
});

test("6. Destilação com Respostas Humanas com Saudações e Cortesias (Robustez Anti-Copia-e-Cola)", () => {
  // Operador responde com cortesia inicial: "Olá! Sim", "Boa tarde, temos sim!"
  const d1 = distillGuidelineFromOperatorResponse({
    question: "tem berço?",
    response: "Olá! Sim"
  });
  assert.ok(
    d1.guidelineText.includes("berço"),
    `Deve destilar berço mesmo se operador responder com 'Olá! Sim'. Atual: ${d1.guidelineText}`
  );
  assert.notStrictEqual(d1.guidelineText, "Sim.", "NUNCA deve deixar apenas 'Sim.' como diretriz");
  assert.ok(!d1.sampleResponse.includes("Olá! Olá!"), "NUNCA deve duplicar saudação 'Olá! Olá!'");

  const d2 = distillGuidelineFromOperatorResponse({
    question: "tem secador de cabelo?",
    response: "Boa tarde, temos sim!"
  });
  assert.ok(
    d2.guidelineText.includes("secador"),
    `Deve destilar secador. Atual: ${d2.guidelineText}`
  );
  assert.ok(d2.sampleResponse.includes("secador"), "Amostra deve citar secador");

  const d3 = distillGuidelineFromOperatorResponse({
    question: "posso fumar no quarto?",
    response: "Olá! Não, é proibido fumar no quarto"
  });
  assert.ok(
    d3.guidelineText.includes("proibido fumar") || d3.guidelineText.includes("livre de fumo"),
    `Deve destilar proibição de fumo. Atual: ${d3.guidelineText}`
  );
  assert.ok(!d3.sampleResponse.includes("Olá! Olá!"), "Sem duplicação de olá");
});

test("7. Ativação de Diretrizes Aprendidas com Consultas de Palavra Única (Secador e Berço)", () => {
  const db = {
    whatsappAiSettings: {
      developerGuidelines: [
        {
          id: "g_secador",
          text: "Dispomos de secador de cabelo nos flats para comodidade dos hóspedes.",
          question: "tem secador de cabelo?",
          category: "estrutura_flat",
          active: true
        },
        {
          id: "g_berco",
          text: "Disponibilizamos berço para bebês mediante solicitação prévia à recepção para acomodação no flat.",
          question: "vocês têm berço para bebê?",
          category: "estrutura_flat",
          active: true
        }
      ]
    }
  };

  // 7.1 Secador com saudação
  const respSecador = generateHeuristicResponse(
    "Bom dia! Vocês têm secador?",
    { guestName: "Ana" },
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respSecador.startsWith("Bom dia, Ana!"), `Deve iniciar com Bom dia, Ana! Atual: ${respSecador}`);
  assert.ok(respSecador.includes("secador de cabelo"), `Deve utilizar a diretriz aprendida de secador. Atual: ${respSecador}`);
  assert.ok(!respSecador.includes("Recebi sua solicitação sobre *Solicitação de Item"), "NÃO deve desviar para demanda não atendida quando já foi ensinado!");

  // 7.2 Berço com saudação
  const respBerco = generateHeuristicResponse(
    "Boa tarde, tem berço disponível?",
    { guestName: "Juliana" },
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respBerco.startsWith("Boa tarde, Juliana!"), `Deve saudar Boa tarde, Juliana! Atual: ${respBerco}`);
  assert.ok(respBerco.includes("berço para bebês"), `Deve responder com a diretriz do berço. Atual: ${respBerco}`);
});

test("8. Geração Multitópico Composta Diversificada (Check-in + Garagem, Checkout + Wi-Fi)", () => {
  // 8.1 Check-in + Garagem
  const respCheckinGaragem = generateHeuristicResponse(
    "Boa tarde, qual o horário de check-in e tem vaga de garagem?",
    { guestName: "Roberto" },
    DEFAULT_AI_CONFIG
  );
  assert.ok(respCheckinGaragem.startsWith("Boa tarde, Roberto!"), `Deve saudar Boa tarde, Roberto! Atual: ${respCheckinGaragem}`);
  assert.ok(respCheckinGaragem.includes("14:00h"), "Deve responder sobre o horário de check-in");
  assert.ok(respCheckinGaragem.includes("garagem") || respCheckinGaragem.includes("estacionamento"), "Deve responder sobre o estacionamento");
  assert.ok(!respCheckinGaragem.includes("nossas diárias para flats"), "NUNCA deve confundir 'vaga de garagem' com cotação de diárias!");

  // 8.2 Checkout + Wi-Fi
  const respCheckoutWifi = generateHeuristicResponse(
    "Bom dia, qual o horário de checkout e qual a senha do wifi?",
    { guestName: "Pedro", flatNumber: "712" },
    DEFAULT_AI_CONFIG
  );
  assert.ok(respCheckoutWifi.startsWith("Bom dia, Pedro!"), `Deve saudar Bom dia, Pedro! Atual: ${respCheckoutWifi}`);
  assert.ok(respCheckoutWifi.includes("12:00h"), "Deve responder sobre o check-out");
  assert.ok(respCheckoutWifi.includes("1234567890123"), "Deve informar a senha do Wi-Fi");
  assert.ok(respCheckoutWifi.includes("apto 712"), "Deve contextualizar a rede com o número do flat");
});

test("9. Reciprocidade de Saudações nas Respostas Heurísticas Padrão (Sem engessamento em Olá)", () => {
  const rWifi = generateHeuristicResponse("Bom dia, qual a senha do wifi?", { guestName: "Pedro", flatNumber: "712" });
  assert.ok(rWifi.startsWith("Bom dia, Pedro!"), `Wi-Fi deve saudar Bom dia. Atual: ${rWifi.slice(0, 30)}`);

  const rCafe = generateHeuristicResponse("Boa tarde, como funciona o café da manhã?", { guestName: "Pedro" });
  assert.ok(rCafe.startsWith("Boa tarde, Pedro!"), `Café deve saudar Boa tarde. Atual: ${rCafe.slice(0, 30)}`);

  const rGaragem = generateHeuristicResponse("Boa noite, onde fica a garagem?", { guestName: "Pedro" });
  assert.ok(rGaragem.startsWith("Boa noite, Pedro!"), `Garagem deve saudar Boa noite. Atual: ${rGaragem.slice(0, 30)}`);

  const rCheckin = generateHeuristicResponse("Bom dia, qual o horário de check-in?", { guestName: "Pedro" });
  assert.ok(rCheckin.startsWith("Bom dia, Pedro!"), `Check-in deve saudar Bom dia. Atual: ${rCheckin.slice(0, 30)}`);

  const rCheckout = generateHeuristicResponse("Bom dia, qual o horário de check-out?", { guestName: "Pedro" });
  assert.ok(rCheckout.startsWith("Bom dia, Pedro!"), `Check-out deve saudar Bom dia. Atual: ${rCheckout.slice(0, 30)}`);
});

test("10. Atualização e Deduplicação em saveDeveloperGuideline", () => {
  const db = {
    whatsappAiSettings: {
      developerGuidelines: []
    }
  };

  const g1 = saveDeveloperGuideline(db, {
    text: "É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp.",
    question: "consigo estender pelo whatsapp?",
    category: "checkout"
  });
  assert.strictEqual(db.whatsappAiSettings.developerGuidelines.length, 1);

  // Salva novamente para a mesma pergunta com esclarecimento
  const g2 = saveDeveloperGuideline(db, {
    id: g1.id,
    text: "É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp com a equipe, mediante disponibilidade.",
    question: "consigo estender pelo whatsapp?",
    category: "checkout"
  });
  assert.strictEqual(db.whatsappAiSettings.developerGuidelines.length, 1, "Não deve duplicar diretriz ao atualizar com id");
  assert.strictEqual(g2.id, g1.id);
  assert.ok(g2.text.includes("mediante disponibilidade"));
});
