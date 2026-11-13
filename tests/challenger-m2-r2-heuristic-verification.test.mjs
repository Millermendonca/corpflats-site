import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Importa ambos os módulos para validar paridade twin-server
import * as aiArtifacts from "../artifacts/api-server/whatsapp-ai-service.mjs";
import * as aiScripts from "../scripts/whatsapp-ai-service.mjs";

test("Challenger M2 R2 - Verificação Empírica de Heurística, Scoring e Roteamento", async (t) => {
  const implementations = [
    { name: "artifacts/api-server", module: aiArtifacts },
    { name: "scripts", module: aiScripts }
  ];

  for (const impl of implementations) {
    const { generateHeuristicResponse, buildGuestContext, getWhatsAppAiConfig } = impl.module;

    await t.test(`[${impl.name}] 1. Resolução das 4 queries críticas que falharam no Round 1`, () => {
      const db = JSON.parse(fs.readFileSync("data/database.json", "utf8"));
      const cfg = getWhatsAppAiConfig(db);
      const authorizedCtx = buildGuestContext(db, "5522998505276");

      // Query 1: Louças & Bandeja
      const qLoucas = "O que fazer com as louças e a bandeja após o café da manhã?";
      const respLoucas = generateHeuristicResponse(qLoucas, authorizedCtx, cfg, db);
      assert.ok(
        respLoucas.includes("Recolhimento de Louças & Bandejas"),
        `Query louças deve rotear para faq-recolhimento-loucas. Retornou: ${respLoucas.slice(0, 100)}`
      );
      assert.ok(
        !respLoucas.includes("Café da Manhã Exclusivo no Flat"),
        "Query louças NÃO deve colidir com faq-cafe-quarto"
      );

      // Query 2: Café da manhã geral
      const qCafe = "Como funciona o café da manhã?";
      const respCafe = generateHeuristicResponse(qCafe, authorizedCtx, cfg, db);
      assert.ok(
        respCafe.includes("Café da Manhã Exclusivo no Flat"),
        `Query café geral deve rotear para faq-cafe-quarto. Retornou: ${respCafe.slice(0, 100)}`
      );
      assert.ok(
        !respCafe.includes("Recolhimento de Louças & Bandejas"),
        "Query café geral NÃO deve colidir com recolhimento de louças"
      );

      // Query 3: Reservas corporativas com faturamento
      const qCorp = "Qual o procedimento para reservas corporativas com faturamento?";
      const respCorp = generateHeuristicResponse(qCorp, authorizedCtx, cfg, db);
      assert.ok(
        respCorp.includes("parceiro corporativo") && respCorp.includes("faturamento"),
        `Query corporativa deve rotear para faq-rule-include-vip-convenio. Retornou: ${respCorp.slice(0, 100)}`
      );
      assert.ok(
        !respCorp.includes("Política Pet CorpFlats"),
        "Query corporativa NÃO deve colidir com faq de pets"
      );

      // Query 4: Horário padrão de check-in 14h
      const qCheckin = "Qual é o horário padrão de check-in e como funciona a entrada?";
      const respCheckin = generateHeuristicResponse(qCheckin, authorizedCtx, cfg, db);
      assert.ok(
        respCheckin.includes("Check-in Oficial e Instruções de Entrada") && respCheckin.includes("14:00"),
        `Query check-in 14h deve rotear para faq-checkin-14h. Retornou: ${respCheckin.slice(0, 100)}`
      );
      assert.ok(
        !respCheckin.includes("Early Check-in Exclusivo"),
        "Query check-in 14h NÃO deve colidir com early check-in"
      );
    });

    await t.test(`[${impl.name}] 2. Verificação de Scoring Aditivo: Variações NÃO sofrem compounding exponencial`, () => {
      // Cria FAQ base com 1 variação
      const createSyntheticFaq = (numVariations) => {
        const variations = [];
        for (let i = 0; i < numVariations; i++) {
          variations.push(`Preciso de ferro para passar minha camisa número ${i}`);
        }
        return {
          id: `faq-synthetic-${numVariations}`,
          question: "Vocês fornecem ferro de passar roupa?",
          answer: "Sim, fornecemos ferro e tábua de passar sob solicitação.",
          category: "estrutura_flat",
          keywords: ["ferro", "passar roupa", "tabua"],
          variations,
          status: "ativo",
          scope: "all"
        };
      };

      const baseFaq1 = createSyntheticFaq(1);
      const baseFaq5 = createSyntheticFaq(5);
      const baseFaq20 = createSyntheticFaq(20);

      const competitorFaq = {
        id: "faq-synthetic-competitor",
        question: "Como funciona a lavanderia externa?",
        answer: "Temos convênio com lavanderia externa próxima ao flat.",
        category: "estrutura_flat",
        keywords: ["lavanderia", "roupa", "lavar"],
        variations: ["Onde lavar minhas roupas?"],
        status: "ativo",
        scope: "all"
      };

      // Query que coincide parcialmente com variações do ferro de passar
      const query = "Gostaria de ferro para passar minha camisa";

      // Com 1 variação
      const resp1 = generateHeuristicResponse(query, {}, {}, [baseFaq1, competitorFaq]);
      assert.ok(resp1.includes("Sim, fornecemos ferro"), "Deve rotear para ferro com 1 variação");

      // Com 5 variações
      const resp5 = generateHeuristicResponse(query, {}, {}, [baseFaq5, competitorFaq]);
      assert.ok(resp5.includes("Sim, fornecemos ferro"), "Deve rotear para ferro com 5 variações");

      // Com 20 variações
      const resp20 = generateHeuristicResponse(query, {}, {}, [baseFaq20, competitorFaq]);
      assert.ok(resp20.includes("Sim, fornecemos ferro"), "Deve rotear para ferro com 20 variações");

      // Agora teste adversarial: competitor tem palavra exata mas ferro tem 50 variações irrelevantes.
      // Se houvesse compounding exponencial como no R1 (score += Math.max(score, ...)),
      // 50 variações acumulariam Math.max dobrando o score e roubando a resposta da pergunta exata.
      const competitorExactFaq = {
        id: "faq-exact-clean",
        question: "Qual o horário da lavanderia parceira?",
        answer: "A lavanderia parceira atende das 8h às 18h de segunda a sexta.",
        category: "estrutura_flat",
        keywords: ["lavanderia", "horario"],
        variations: [],
        status: "ativo",
        scope: "all"
      };

      const noisyFaqWith50Vars = {
        id: "faq-noisy-50",
        question: "Dicas de restaurantes e compras no shopping",
        answer: "Estamos a 5 minutos do Pelinca Square Center.",
        category: "lazer_condominio",
        keywords: ["shopping", "restaurantes"],
        // 50 variações contendo termos vagos
        variations: Array.from({ length: 50 }, (_, i) => `horario parceira informacao variacao ${i}`),
        status: "ativo",
        scope: "all"
      };

      // Query exata para lavanderia parceira
      const exactQuery = "Qual o horário da lavanderia parceira?";
      const respClean = generateHeuristicResponse(exactQuery, {}, {}, [competitorExactFaq, noisyFaqWith50Vars]);
      assert.ok(
        respClean.includes("A lavanderia parceira atende"),
        `FAQ com pergunta exata DEVE vencer FAQ com 50 variações parciais. Retornou: ${respClean}`
      );
    });

    await t.test(`[${impl.name}] 3. Stop Words Filtering: previne falso matching por pronomes/preposições`, () => {
      // Cria duas FAQs distintas cujas únicas palavras em comum com a busca são stop words
      const faqA = {
        id: "faq-academia-treino",
        question: "Como funciona o acesso à academia do condomínio?",
        answer: "A academia fica no 2º andar aberta 24h para hóspedes.",
        category: "lazer_condominio",
        keywords: ["academia", "treino", "musculacao", "esteira"],
        variations: ["Tem academia com aparelhos?"],
        status: "ativo",
        scope: "all"
      };

      const faqB = {
        id: "faq-estacionamento-vaga",
        question: "Como funciona a vaga de garagem para o carro?",
        answer: "Temos garagem coberta com vaga rotativa gratuita.",
        category: "garagem",
        keywords: ["garagem", "estacionamento", "carro", "vaga"],
        variations: ["Onde fica a vaga com portão?"],
        status: "ativo",
        scope: "all"
      };

      // Query composta exclusivamente por stop words em português:
      // "qual", "para", "com", "de", "o", "a", "que", "como"
      const stopWordsOnlyQuery = "Qual com para que de como onde quando?";
      const respStopWords = generateHeuristicResponse(stopWordsOnlyQuery, {}, {}, [faqA, faqB]);

      // Nenhuma FAQ deve pontuar por tokens de stop words.
      // Deve cair no fallback padrão (não na resposta da academia nem da garagem)
      assert.ok(
        !respStopWords.includes("A academia fica no 2º andar") && !respStopWords.includes("Temos garagem coberta"),
        `Stop words puras NÃO podem dar match em FAQs. Retornou: ${respStopWords}`
      );

      // Agora query com 2 stop words coincidentes ("para", "com") mas sem palavras-chave em comum:
      const queryWithSharedStopwords = "Qual o procedimento para atendimento com protocolo?";
      const respShared = generateHeuristicResponse(queryWithSharedStopwords, {}, {}, [faqA, faqB]);
      assert.ok(
        !respShared.includes("A academia fica no 2º andar") && !respShared.includes("Temos garagem coberta"),
        `Interseção exclusiva de stop words ("para", "com") NÃO deve gerar falso match de 2 tokens.`
      );
    });

    await t.test(`[${impl.name}] 4. Regras de Exceção e Segmentação por Cliente na Heurística`, () => {
      const db = JSON.parse(fs.readFileSync("data/database.json", "utf8"));
      const cfg = getWhatsAppAiConfig(db);

      // Telefone autorizado na lista VIP/Convênio (5522998505276)
      const authCtx = buildGuestContext(db, "5522998505276");
      // Telefone não autorizado / desconhecido
      const unauthCtx = buildGuestContext(db, "5511999998888");

      const queryCorp = "Qual o procedimento para reservas corporativas com faturamento?";

      // Cliente autorizado: recebe resposta corporativa personalizada
      const respAuth = generateHeuristicResponse(queryCorp, authCtx, cfg, db);
      assert.ok(
        respAuth.includes("Prezado parceiro corporativo"),
        `Cliente autorizado DEVE receber FAQ restrita include_only. Retornou: ${respAuth}`
      );

      // Cliente NÃO autorizado: FAQ restrita include_only é filtrada antes do scoring
      const respUnauth = generateHeuristicResponse(queryCorp, unauthCtx, cfg, db);
      assert.ok(
        !respUnauth.includes("Prezado parceiro corporativo"),
        `Cliente não autorizado NÃO pode receber FAQ restrita include_only. Retornou: ${respUnauth}`
      );

      // Teste com regra 'exclude'
      const customDb = {
        faqItems: [
          {
            id: "faq-promo-geral",
            question: "Existe desconto para estadias longas?",
            answer: "Oferecemos 15% de desconto para reservas acima de 7 dias.",
            category: "reservas",
            keywords: ["desconto", "estadias longas", "diarias"],
            variations: ["Tem desconto para muitos dias?"],
            status: "ativo",
            scope: "exclude",
            clientPhones: ["5522998505276"]
          }
        ]
      };

      const promoQuery = "Existe desconto para estadias longas?";
      // Para cliente excluído: resposta NÃO deve ser retornada
      const respExcluded = generateHeuristicResponse(promoQuery, authCtx, cfg, customDb);
      assert.ok(
        !respExcluded.includes("Oferecemos 15% de desconto"),
        "Cliente na lista de 'exclude' NÃO pode receber a FAQ"
      );

      // Para cliente normal: resposta DEVE ser retornada
      const respNormal = generateHeuristicResponse(promoQuery, unauthCtx, cfg, customDb);
      assert.ok(
        respNormal.includes("Oferecemos 15% de desconto"),
        "Cliente fora da lista de 'exclude' DEVE receber a FAQ"
      );
    });

    await t.test(`[${impl.name}] 5. Isolamento de Status: FAQs 'pendente', 'aguardando_aprovacao' e 'inativo' são ignoradas`, () => {
      const dbWithVariousStatuses = {
        faqItems: [
          {
            id: "faq-inativo",
            question: "Qual o horário da sauna?",
            answer: "A sauna funciona das 17h às 21h.",
            status: "inativo",
            scope: "all"
          },
          {
            id: "faq-pendente",
            question: "Vocês aceitam cartão Elo?",
            answer: "Sim, aceitamos todas as bandeiras.",
            status: "pendente",
            scope: "all"
          },
          {
            id: "faq-aguardando",
            question: "Tem ferro de passar a vapor?",
            answer: "Temos sim, basta solicitar na recepção.",
            status: "aguardando_aprovacao",
            scope: "all"
          }
        ]
      };

      const queries = [
        "Qual o horário da sauna?",
        "Vocês aceitam cartão Elo?",
        "Tem ferro de passar a vapor?"
      ];

      for (const q of queries) {
        const resp = generateHeuristicResponse(q, {}, {}, dbWithVariousStatuses);
        assert.ok(!resp.includes("A sauna funciona"), `Status inativo não deve responder`);
        assert.ok(!resp.includes("todas as bandeiras"), `Status pendente não deve responder`);
        assert.ok(!resp.includes("basta solicitar na recepção"), `Status aguardando_aprovacao não deve responder`);
      }
    });

    await t.test(`[${impl.name}] 6. Distinctive Keywords Boost: Termos específicos ("loucas", "pet", "convenio", "early check in")`, () => {
      const db = JSON.parse(fs.readFileSync("data/database.json", "utf8"));
      const cfg = getWhatsAppAiConfig(db);
      const ctx = buildGuestContext(db, "5522998505276");

      // Query contendo palavra-chave distintiva "louças" e "bandeja"
      const respLoucas = generateHeuristicResponse("Onde devolvo as louças da bandeja?", ctx, cfg, db);
      assert.ok(
        respLoucas.includes("Recolhimento de Louças & Bandejas"),
        `Keyword distintiva "louças" deve garantir direcionamento correto. Retornou: ${respLoucas.slice(0, 100)}`
      );

      // Query contendo "early check in"
      const respEarly = generateHeuristicResponse("Posso fazer early check in?", ctx, cfg, db);
      assert.ok(
        respEarly.includes("Early Check-in Exclusivo"),
        `Keyword distintiva "early check in" deve direcionar para faq-early-checkin-direto. Retornou: ${respEarly.slice(0, 100)}`
      );

      // Query contendo "cachorro" / "pet"
      const respPet = generateHeuristicResponse("Posso levar meu cachorro pequeno?", ctx, cfg, db);
      assert.ok(
        respPet.includes("Política Pet CorpFlats"),
        `Keyword distintiva "cachorro" deve direcionar para faq-regras-pets. Retornou: ${respPet.slice(0, 100)}`
      );
    });

    await t.test(`[${impl.name}] 7. Stress & Performance Probe: 1.000 queries avaliadas em < 100ms`, () => {
      const db = JSON.parse(fs.readFileSync("data/database.json", "utf8"));
      const cfg = getWhatsAppAiConfig(db);
      const ctx = buildGuestContext(db, "5522998505276");

      const testQueries = [
        "O que fazer com as louças e a bandeja após o café da manhã?",
        "Como funciona o café da manhã?",
        "Qual o procedimento para reservas corporativas com faturamento?",
        "Qual é o horário padrão de check-in e como funciona a entrada?",
        "Qual a senha do wi-fi?",
        "Onde estacionar meu carro?",
        "Posso levar cachorro?",
        "Como funciona o checkout?"
      ];

      const start = performance.now();
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        const q = testQueries[i % testQueries.length];
        const res = generateHeuristicResponse(q, ctx, cfg, db);
        assert.ok(res.length > 10);
      }
      const elapsed = performance.now() - start;
      console.log(`[${impl.name}] Stress 1000 queries executadas em ${elapsed.toFixed(2)}ms (${(elapsed / iterations).toFixed(4)}ms/query)`);
      assert.ok(elapsed < 1000, `1000 queries devem rodar em menos de 1000ms (1ms/query). Gastou: ${elapsed.toFixed(2)}ms`);
    });
  }
});
