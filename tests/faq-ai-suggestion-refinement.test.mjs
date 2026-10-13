import assert from "node:assert/strict";
import {
  isBotMessage,
  linkOperatorResponseToPendingFaq
} from "../artifacts/api-server/zapi-service.mjs";
import {
  autoCreatePendingFaq,
  generateFaqResponseSuggestions,
  generateIntelligentFaqDraft
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

console.log("🚀 Iniciando testes pontuais de FAQ: Geração Inteligente e Refinamento com IA...\n");

// ─── 1. Teste de Detecção de Mensagens do Robô (isBotMessage) ───────────────────
{
  console.log("1. Testando isBotMessage...");
  
  const botGreetings = [
    "Olá! Recebi sua mensagem. Sou a Sofia, concierge virtual da CorpFlats...",
    "Olá, Miller! Recebi sua mensagem. Sou a Sofia, concierge virtual dos flats da CorpFlats Hotéis 🏨",
    "Sou a Sofia, assistente virtual",
    "Anotei sua dúvida e encaminhei para a equipe",
    "Como não tenho essa informação, já registrei sua pergunta para a equipe",
    "Diretriz registrada com sucesso",
    "Comando do desenvolvedor processado"
  ];

  for (const text of botGreetings) {
    assert.strictEqual(
      isBotMessage(text),
      true,
      `Deveria identificar como bot: "${text}"`
    );
  }

  const humanMessages = [
    "Sim, todos os nossos quartos possuem forno micro-ondas e frigobar.",
    "O check-in começa a partir das 14h.",
    "A voltagem das tomadas é 127V.",
    "Sim, temos vaga de garagem rotativa gratuita."
  ];

  for (const text of humanMessages) {
    assert.strictEqual(
      isBotMessage(text),
      false,
      `NÃO deveria identificar como bot: "${text}"`
    );
  }
  console.log("✓ isBotMessage passou em todos os testes!");
}

// ─── 2. Teste de Blindagem em linkOperatorResponseToPendingFaq ────────────────
{
  console.log("\n2. Testando linkOperatorResponseToPendingFaq...");
  
  const mockDb = {
    faqItems: [
      {
        id: "faq_test_1",
        question: "meu quarto tem micro-ondas?",
        status: "pendente",
        sourceClientPhone: "5521999998888",
        createdAt: new Date().toISOString()
      }
    ]
  };

  // Tentativa de vincular mensagem da Sofia (fromMe: true com texto de bot)
  const botResult = linkOperatorResponseToPendingFaq(mockDb, {
    clientPhone: "5521999998888",
    text: "Olá! Recebi sua mensagem. Sou a Sofia, concierge virtual...",
    answeredBy: "operador" // Mesmo que o webhook diga operador, o texto do bot deve ser barrado!
  });
  assert.strictEqual(botResult, null, "Mensagem do robô NUNCA deve ser vinculada ao FAQ pendente!");

  // Tentativa de vincular mensagem onde answeredBy é sofia/bot
  const botAnsweredByResult = linkOperatorResponseToPendingFaq(mockDb, {
    clientPhone: "5521999998888",
    text: "Sim, tem micro-ondas.",
    answeredBy: "sofia"
  });
  assert.strictEqual(botAnsweredByResult, null, "answeredBy: sofia deve ser rejeitado!");

  // Mensagem legítima enviada pelo operador humano
  const humanResult = linkOperatorResponseToPendingFaq(mockDb, {
    clientPhone: "5521999998888",
    text: "Sim, todos os quartos dispõem de micro-ondas.",
    answeredBy: "operador"
  });
  assert.notStrictEqual(humanResult, null, "Resposta humana legítima DEVE ser vinculada!");
  assert.strictEqual(humanResult.status, "aguardando_aprovacao");
  assert.strictEqual(humanResult.suggestedAnswer, "Sim, todos os quartos dispõem de micro-ondas.");
  // Teste de sobrescrita de rascunho de IA não aprovado por resposta humana do operador
  const aiDraftFaq = {
    id: "faq_test_ai_draft",
    question: "tem ferro de passar?",
    status: "aguardando_aprovacao",
    suggestedAnswer: "Rascunho automático prévio",
    answeredBy: "ia_draft",
    sourceClientPhone: "5521999998888",
    createdAt: new Date().toISOString()
  };
  mockDb.faqItems.push(aiDraftFaq);

  const overwriteResult = linkOperatorResponseToPendingFaq(mockDb, {
    clientPhone: "5521999998888",
    text: "Sim, temos ferro e tábua de passar disponíveis.",
    answeredBy: "operador"
  });
  assert.notStrictEqual(overwriteResult, null, "Resposta humana do operador DEVE sobrescrever rascunho preliminar de IA!");
  assert.strictEqual(overwriteResult.suggestedAnswer, "Sim, temos ferro e tábua de passar disponíveis.");
  assert.strictEqual(overwriteResult.answeredBy, "operador");
  console.log("✓ linkOperatorResponseToPendingFaq protegeu contra auto-captura da Sofia e vinculou/sobrescreveu resposta humana!");
}

// ─── 3. Teste de Blindagem contra Mensagens de Coaching do Desenvolvedor ────────
{
  console.log("\n3. Testando autoCreatePendingFaq para coaching de dev e comodidades...");

  const mockDb = {
    faqItems: [],
    developerPhone: "5522998505276",
    developerPhones: ["5522998505276"]
  };

  // Coaching de desenvolvedor com typo proposital "pergiuntar"
  const devCoaching = autoCreatePendingFaq({
    db: mockDb,
    questionText: "Sofia, sou miller. Não deve pergiuntar assim...",
    cleanPhone: "5522998505276",
    senderName: "Miller DEV"
  });
  assert.strictEqual(devCoaching, null, "Mensagem de coaching do desenvolvedor JAMAIS deve virar card de FAQ!");

  // Simulação de hóspede pelo desenvolvedor (deve ser permitida em testes de sandbox)
  const devSimulation = autoCreatePendingFaq({
    db: mockDb,
    questionText: "meu quarto tem micro-ondas?",
    cleanPhone: "5522998505276",
    senderName: "Miller"
  });
  assert.notStrictEqual(devSimulation, null, "Simulação de dúvida de hóspede pelo desenvolvedor DEVE ser permitida!");
  assert.strictEqual(devSimulation.status, "aguardando_aprovacao");
  assert.match(devSimulation.suggestedAnswer, /micro-ondas/i);

  // Pergunta legítima de hóspede sobre micro-ondas
  const guestFaq = autoCreatePendingFaq({
    db: mockDb,
    questionText: "meu quarto tem micro-ondas?",
    cleanPhone: "5521988887777",
    senderName: "Carlos Hóspede"
  });
  assert.notStrictEqual(guestFaq, null, "Dúvida legítima do hóspede DEVE criar card no FAQ");
  assert.strictEqual(guestFaq.status, "aguardando_aprovacao", "Deve estar como aguardando aprovação se gerou rascunho");
  assert.match(guestFaq.suggestedAnswer, /micro-ondas/i, "Rascunho inteligente deve conter menção a micro-ondas");
  console.log("✓ autoCreatePendingFaq rejeitou coaching de dev, permitiu simulação e gerou rascunho inteligente!");
}

// ─── 4. Teste de Geração Inteligente de Rascunho (generateIntelligentFaqDraft) ──
{
  console.log("\n4. Testando generateIntelligentFaqDraft...");
  const mockDb = {
    settings: {},
    whatsappAiConfig: {}
  };

  const draftMicroondas = generateIntelligentFaqDraft("o quarto tem microondas?", mockDb, "estrutura_flat");
  assert.match(draftMicroondas, /micro-ondas/i);

  const draftGaragem = generateIntelligentFaqDraft("tem estacionamento ou garagem?", mockDb, "garagem");
  assert.match(draftGaragem, /garagem/i);

  const draftCafe = generateIntelligentFaqDraft("como funciona o cafe da manha?", mockDb, "cafe_manha");
  assert.match(draftCafe, /café da manhã/i);

  const draftCheckin = generateIntelligentFaqDraft("que horas posso entrar?", mockDb, "horarios");
  assert.match(draftCheckin, /14:00/i);

  const draftPets = generateIntelligentFaqDraft("aceita cachorro ou gato?", mockDb, "regras");
  assert.match(draftPets, /pet|animal/i);

  console.log("✓ generateIntelligentFaqDraft respondeu com sucesso para micro-ondas, garagem, café, horários e pets!");
}

// ─── 5. Teste de Sugestões de Respostas com IA (generateFaqResponseSuggestions) ─
{
  console.log("\n5. Testando generateFaqResponseSuggestions...");
  const mockDb = {
    settings: {},
    whatsappAiConfig: {}
  };

  // Teste Afirmativo
  const resAffirmative = await generateFaqResponseSuggestions({
    question: "Tem ferro de passar roupa no flat?",
    currentAnswer: "",
    instruction: "Dizer que tem ferro de passar e tábua disponível em todos os flats",
    category: "estrutura_flat",
    db: mockDb
  });

  assert.strictEqual(resAffirmative.success, true);
  assert.strictEqual(Array.isArray(resAffirmative.suggestions), true);
  assert.strictEqual(resAffirmative.suggestions.length, 3);
  for (const s of resAffirmative.suggestions) {
    assert.match(s.text, /ferro/i, `Sugestão "${s.label}" deve conter ferro de passar`);
  }

  // Teste Negativo (NUNCA deve dizer "Sim, não temos...")
  const resNegative = await generateFaqResponseSuggestions({
    question: "O quarto tem micro-ondas?",
    currentAnswer: "",
    instruction: "Não temos micro-ondas nesse flat",
    category: "estrutura_flat",
    db: mockDb
  });

  assert.strictEqual(resNegative.success, true);
  for (const s of resNegative.suggestions) {
    assert.strictEqual(/^Olá! ✨ Sim,/i.test(s.text), false, `Sugestão negativa JAMAIS pode iniciar com 'Sim': "${s.text}"`);
    assert.match(s.text, /não\s+temos\s+micro-ondas/i, `Sugestão deve expressar adequadamente a negativa: "${s.text}"`);
  }

  // Teste Informativo (Horários/Políticas - sem "Sim," desnecessário)
  const resInformative = await generateFaqResponseSuggestions({
    question: "Qual o horário do check-in?",
    currentAnswer: "",
    instruction: "O check-in inicia a partir das 14h",
    category: "horarios",
    db: mockDb
  });

  assert.strictEqual(resInformative.success, true);
  for (const s of resInformative.suggestions) {
    assert.strictEqual(/^Olá! ✨ Sim,/i.test(s.text), false, `Sugestão informativa não deve ter 'Sim': "${s.text}"`);
    assert.match(s.text, /14h/i, `Sugestão informativa deve conter 14h: "${s.text}"`);
  }

  console.log("✓ generateFaqResponseSuggestions tratou diretivas afirmativas, negativas e informativas com perfeição!");
}

console.log("\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!");

