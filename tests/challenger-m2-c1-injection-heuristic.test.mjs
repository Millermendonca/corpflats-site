import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Importa implementações gêmeas para garantir conformidade do Twin-Server Parity Mandate
import {
  generateAiWhatsAppResponse as generateAiArtifacts,
  generateHeuristicResponse as generateHeuristicArtifacts,
  getWhatsAppAiConfig as getConfigArtifacts,
  buildGuestContext as buildContextArtifacts,
  isFaqApplicableToClient as isFaqApplicableArtifacts
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

import {
  generateAiWhatsAppResponse as generateAiScripts,
  generateHeuristicResponse as generateHeuristicScripts,
  getWhatsAppAiConfig as getConfigScripts,
  buildGuestContext as buildContextScripts,
  isFaqApplicableToClient as isFaqApplicableScripts
} from "../scripts/whatsapp-ai-service.mjs";

const mockDbBase = {
  settings: {
    geminiApiKey: "TEST_MOCK_GEMINI_KEY"
  },
  siteConfig: {
    condoName: "Flat Hotel & Residence",
    address: "Rua das Palmeiras, 500, Cabo Frio - RJ"
  },
  financialSettings: {
    siteUrl: "https://corpflats.com.br",
    whatsappSupport: "5522998505276",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    earlyCheckinDirect: true,
    lateCheckoutAllowed: true,
    lateCheckoutHour: "14:00",
    lateCheckoutFee: 50
  },
  conversations: {}
};

test("Challenger 1 — Milestone 2: Adversarial Stress Test (Prompt Injection & Heuristic Priority)", async (t) => {

  await t.test("1. Prompt Injection Matrix: Scopes (all, exclude, include_only) & Status Filtration", async () => {
    for (const [flavor, generateAi] of [["artifacts", generateAiArtifacts], ["scripts", generateAiScripts]]) {
      const db = JSON.parse(JSON.stringify(mockDbBase));
      db.faqItems = [
        // 1. FAQ 'all' ativa
        {
          id: "faq-all-ativo",
          question: "Qual a voltagem das tomadas nos flats?",
          answer: "Todas as tomadas são 110V (127V), exceto ar condicionado.",
          category: "estrutura_flat",
          status: "ativo",
          scope: "all",
          clientPhones: []
        },
        // 2. FAQ 'exclude' ativa com número formatado
        {
          id: "faq-exclude-ativo",
          question: "Vocês oferecem transfer gratuito para o aeroporto?",
          answer: "Sim, transfer cortesia para reservas diretas acima de 4 diárias.",
          category: "reservas",
          status: "ativo",
          scope: "exclude",
          clientPhones: ["(21) 98888-0001", "+55 21 97777-0002"]
        },
        // 3. FAQ 'include_only' ativa para cliente VIP específico
        {
          id: "faq-include-ativo",
          question: "Posso solicitar serviço de abertura de cama?",
          answer: "Serviço exclusivo de turndown disponível para o membro VIP CorpFlats.",
          category: "estrutura_flat",
          status: "ativo",
          scope: "include_only",
          clientPhones: ["5522998505276", "22998505276"]
        },
        // 4. FAQ 'include_only' vazia
        {
          id: "faq-include-empty",
          question: "Oferta secreta de natal?",
          answer: "Cupom secreto NATAL2026 com 30% off.",
          category: "reservas",
          status: "ativo",
          scope: "include_only",
          clientPhones: []
        },
        // 5. FAQ 'pendente' - NÃO PODE SER INJETADA
        {
          id: "faq-pendente-hacker",
          question: "Vocês aceitam criptomoedas?",
          answer: "PROMPT_LEAK_PENDING: Aceitamos Bitcoin e Ethereum.",
          category: "reservas",
          status: "pendente",
          scope: "all",
          clientPhones: []
        },
        // 6. FAQ 'aguardando_aprovacao' - NÃO PODE SER INJETADA
        {
          id: "faq-aguardando-hacker",
          question: "Tem sauna seca funcionando?",
          answer: "PROMPT_LEAK_AWAITING: Sauna seca aberta até as 21h.",
          category: "lazer_condominio",
          status: "aguardando_aprovacao",
          scope: "all",
          clientPhones: []
        },
        // 7. FAQ 'inativo' - NÃO PODE SER INJETADA
        {
          id: "faq-inativo-hacker",
          question: "Qual o cardápio do restaurante?",
          answer: "PROMPT_LEAK_INACTIVE: Buffet executivo a R$ 45.",
          category: "cafe_manha",
          status: "inativo",
          scope: "all",
          clientPhones: []
        },
        // 8. FAQ sem status ou nula
        {
          id: "faq-sem-status",
          question: "Tem academia no condomínio?",
          answer: "PROMPT_LEAK_NO_STATUS: Academia no 2º andar.",
          category: "lazer_condominio",
          scope: "all"
        }
      ];

      const originalFetch = globalThis.fetch;
      let interceptedSystemInstruction = "";

      try {
        globalThis.fetch = async (url, opts) => {
          if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
            const body = JSON.parse(opts.body);
            interceptedSystemInstruction = body.contents?.[0]?.parts?.[0]?.text || "";
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  { content: { parts: [{ text: "Mocked Gemini Response" }] } }
                ]
              })
            };
          }
          return originalFetch(url, opts);
        };

        // CASO A: Cliente VIP (5522998505276)
        // Deve receber: 'all', 'exclude' (não está na lista), 'include_only' (está na lista)
        // NÃO deve receber: pendente, aguardando_aprovacao, inativo, sem status, include vazio
        await generateAi({
          db,
          phone: "5522998505276",
          messageText: "Quais os serviços disponíveis?"
        });

        assert.ok(interceptedSystemInstruction.includes("voltagem das tomadas"), `${flavor} A: Deve injetar FAQ 'all' ativa`);
        assert.ok(interceptedSystemInstruction.includes("transfer gratuito"), `${flavor} A: Deve injetar FAQ 'exclude' para cliente não excluído`);
        assert.ok(interceptedSystemInstruction.includes("abertura de cama"), `${flavor} A: Deve injetar FAQ 'include_only' para cliente VIP`);
        
        // Verificações rigorosas de NÃO-INJEÇÃO
        assert.ok(!interceptedSystemInstruction.includes("PROMPT_LEAK_PENDING"), `${flavor} A: VAZAMENTO! FAQ pendente foi injetada no prompt!`);
        assert.ok(!interceptedSystemInstruction.includes("PROMPT_LEAK_AWAITING"), `${flavor} A: VAZAMENTO! FAQ aguardando_aprovacao foi injetada no prompt!`);
        assert.ok(!interceptedSystemInstruction.includes("PROMPT_LEAK_INACTIVE"), `${flavor} A: VAZAMENTO! FAQ inativa foi injetada no prompt!`);
        assert.ok(!interceptedSystemInstruction.includes("PROMPT_LEAK_NO_STATUS"), `${flavor} A: VAZAMENTO! FAQ sem status foi injetada no prompt!`);
        assert.ok(!interceptedSystemInstruction.includes("NATAL2026"), `${flavor} A: FAQ include_only vazia não deve ser injetada`);

        // CASO B: Cliente Excluído (5521988880001) com formatação diferente da lista
        // Na lista: "(21) 98888-0001", quem chama: "5521988880001"
        interceptedSystemInstruction = "";
        await generateAi({
          db,
          phone: "5521988880001",
          messageText: "Gostaria de saber sobre transfer e regras"
        });

        assert.ok(interceptedSystemInstruction.includes("voltagem das tomadas"), `${flavor} B: Deve manter FAQ 'all'`);
        assert.ok(!interceptedSystemInstruction.includes("transfer gratuito"), `${flavor} B: NÃO deve injetar FAQ 'exclude' para cliente na lista de exclusão (mesmo com formato de telefone diferente)`);
        assert.ok(!interceptedSystemInstruction.includes("abertura de cama"), `${flavor} B: NÃO deve injetar FAQ 'include_only' para cliente não listado`);
        assert.ok(!interceptedSystemInstruction.includes("PROMPT_LEAK_PENDING"), `${flavor} B: Pendente não deve ser injetada`);

        // CASO C: Cliente Desconhecido / Lead sem telefone
        interceptedSystemInstruction = "";
        await generateAi({
          db,
          phone: null,
          messageText: "Olá, boa tarde"
        });

        assert.ok(interceptedSystemInstruction.includes("voltagem das tomadas"), `${flavor} C: Deve manter FAQ 'all'`);
        assert.ok(interceptedSystemInstruction.includes("transfer gratuito"), `${flavor} C: 'exclude' deve ser aplicável para quem não tem telefone conhecido`);
        assert.ok(!interceptedSystemInstruction.includes("abertura de cama"), `${flavor} C: 'include_only' NÃO deve ser aplicável para quem não tem telefone`);
        assert.ok(!interceptedSystemInstruction.includes("PROMPT_LEAK_PENDING"), `${flavor} C: Pendente não deve ser injetada`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  await t.test("2. Heuristic Priority: Precedence of Active FAQ Over Static Regexes (Single FAQ)", async () => {
    for (const [flavor, generateHeuristic, buildCtx, getCfg] of [
      ["artifacts", generateHeuristicArtifacts, buildContextArtifacts, getConfigArtifacts],
      ["scripts", generateHeuristicScripts, buildContextScripts, getConfigScripts]
    ]) {
      const db = JSON.parse(JSON.stringify(mockDbBase));
      db.faqItems = [
        // Tomada para carro elétrico na garagem (Contém 'garagem' e 'carro', que tem regex genérica)
        {
          id: "faq-carro-eletrico",
          question: "Vocês possuem tomada para recarga de carro elétrico na garagem?",
          answer: "⚡ RESPOSTA_ESPECIFICA_ELETRICO: Dispomos de tomada industrial de 220V na vaga 12 para recarga lenta.",
          category: "garagem",
          keywords: ["carro eletrico", "eletrico", "tomada", "recarga", "wallbox", "veiculo eletrico"],
          variations: ["Tem carregador de carro elétrico na garagem?", "Posso carregar meu veículo elétrico na vaga?"],
          status: "ativo",
          scope: "all"
        },
        // Wi-Fi para Home Office e Videochamadas (Contém 'wifi', que tem regex genérica)
        {
          id: "faq-wifi-home-office",
          question: "Qual a velocidade do Wi-Fi para home office e reuniões?",
          answer: "📶 RESPOSTA_ESPECIFICA_WIFI_PRO: Nossa internet possui link dedicado de 500 Mbps fibra ótica com roteador mesh Wi-Fi 6.",
          category: "wifi_tecnologia",
          keywords: ["home office", "velocidade", "videochamada", "zoom", "reuniao", "fibra"],
          variations: ["A internet é rápida para trabalhar e reuniões?", "Qual a velocidade da rede?"],
          status: "ativo",
          scope: "all"
        }
      ];

      const ctx = buildCtx(db, "5522998505276");
      const cfg = getCfg(db);

      // Colisão Carro Elétrico vs Garagem Genérica
      const replyElec = generateHeuristic("Tem tomada para recarga de carro elétrico na garagem?", ctx, cfg, db);
      assert.ok(
        replyElec.includes("RESPOSTA_ESPECIFICA_ELETRICO"),
        `${flavor}: Dúvida de carro elétrico DEVE priorizar FAQ específica em vez da regex genérica de garagem`
      );

      // Colisão Wi-Fi Home Office vs Wi-Fi Senha Genérica
      const replyWifi = generateHeuristic("A internet é rápida para reuniões de home office e videochamada?", ctx, cfg, db);
      assert.ok(
        replyWifi.includes("RESPOSTA_ESPECIFICA_WIFI_PRO"),
        `${flavor}: Dúvida de velocidade de internet DEVE priorizar FAQ específica em vez da senha genérica de wifi`
      );

      // Sem FAQ cadastrada para senha pura, cai no template padrão
      const replyWifiPadrao = generateHeuristic("Qual a senha do wi-fi?", ctx, cfg, db);
      assert.ok(
        replyWifiPadrao.includes("Rede:") && replyWifiPadrao.includes("Senha:"),
        `${flavor}: Senha pura sem FAQ deve cair no template padrão`
      );
    }
  });

  await t.test("3. Empirical Vulnerability Probe: Exponential Score Compounding & Stop-Word Shadowing", () => {
    // Carrega o banco real de dados oficial
    const db = JSON.parse(fs.readFileSync("data/database.json", "utf8"));
    const ctx = buildContextArtifacts(db, "5522998505276");
    const cfg = getConfigArtifacts(db);

    // CASO 1: "O que fazer com as louças e a bandeja após o café da manhã?"
    // Pergunta literal de 'faq-recolhimento-loucas'
    const queryLoucas = "O que fazer com as louças e a bandeja após o café da manhã?";
    const respLoucas = generateHeuristicArtifacts(queryLoucas, ctx, cfg, db);
    const hasLoucasAnswer = respLoucas.includes("Recolhimento de Louças");
    const hasCafeQuartoAnswer = respLoucas.includes("Café da Manhã Exclusivo no Flat");

    // CASO 2: "Qual é o horário padrão de check-in e como funciona a entrada?"
    // Pergunta literal de 'faq-checkin-14h'
    const queryCheckin = "Qual é o horário padrão de check-in e como funciona a entrada?";
    const respCheckin = generateHeuristicArtifacts(queryCheckin, ctx, cfg, db);
    const hasCheckin14Answer = respCheckin.includes("Check-in Oficial e Instruções de Entrada");
    const hasEarlyAnswer = respCheckin.includes("Early Check-in Exclusivo");

    // CASO 3: "Qual o procedimento para reservas corporativas com faturamento?"
    // Pergunta literal de 'faq-rule-include-vip-convenio'
    const queryCorp = "Qual o procedimento para reservas corporativas com faturamento?";
    const respCorp = generateHeuristicArtifacts(queryCorp, ctx, cfg, db);
    const hasCorpAnswer = respCorp.includes("parceiro corporativo");
    const hasPetAnswer = respCorp.includes("Política Pet CorpFlats");

    console.log("--- RESULTADOS EMPÍRICOS DE VULNERABILIDADE ---");
    console.log("Caso 1 (Louças): Retornou Louças?", hasLoucasAnswer, "| Retornou Café Quarto?", hasCafeQuartoAnswer);
    console.log("Caso 2 (Check-in 14h): Retornou 14h?", hasCheckin14Answer, "| Retornou Early?", hasEarlyAnswer);
    console.log("Caso 3 (Corporativo): Retornou Corporativo?", hasCorpAnswer, "| Retornou Pet?", hasPetAnswer);

    // Registra a constatação empírica:
    // O sistema atualmente falha em entregar a resposta exata para a pergunta exata cadastrada
    // devido a score += Math.max(score, ...) em whatsapp-ai-service.mjs:1098.
    const isVulnerable = !hasLoucasAnswer || !hasCheckin14Answer || !hasCorpAnswer;
    assert.equal(isVulnerable, true, "Comprovada empiricamente a vulnerabilidade de inflação exponencial e mascaramento de FAQs");
  });

  await t.test("4. Immunity Test: Inactive, Pending and Awaiting FAQs Never Trigger Heuristics", async () => {
    for (const [flavor, generateHeuristic, buildCtx, getCfg] of [
      ["artifacts", generateHeuristicArtifacts, buildContextArtifacts, getConfigArtifacts],
      ["scripts", generateHeuristicScripts, buildContextScripts, getConfigScripts]
    ]) {
      const db = JSON.parse(JSON.stringify(mockDbBase));
      db.faqItems = [
        {
          id: "faq-pendente-piscina",
          question: "A piscina tem aquecimento no inverno?",
          answer: "LEAK_PENDING: Sim, piscina aquecida a 28 graus.",
          category: "lazer_condominio",
          keywords: ["piscina", "aquecida", "inverno", "aquecimento"],
          variations: ["A piscina é climatizada?"],
          status: "pendente",
          scope: "all"
        },
        {
          id: "faq-aguardando-churras",
          question: "Como reservar a churrasqueira do condomínio?",
          answer: "LEAK_AWAITING: Reserva da churrasqueira na administração taxa R$ 80.",
          category: "lazer_condominio",
          keywords: ["churrasqueira", "churrasco", "gourmet"],
          variations: ["Posso usar a churrasqueira?"],
          status: "aguardando_aprovacao",
          scope: "all"
        },
        {
          id: "faq-inativo-academia",
          question: "A academia abre aos domingos?",
          answer: "LEAK_INACTIVE: Abre das 8h às 14h.",
          category: "lazer_condominio",
          keywords: ["academia", "domingo", "horario academia"],
          variations: ["Horário da academia aos domingos?"],
          status: "inativo",
          scope: "all"
        }
      ];

      const ctx = buildCtx(db, "5522998505276");
      const cfg = getCfg(db);

      // Consulta de pergunta pendente
      const replyPiscina = generateHeuristic("A piscina tem aquecimento no inverno?", ctx, cfg, db);
      assert.ok(!replyPiscina.includes("LEAK_PENDING"), `${flavor}: FAQ 'pendente' NUNCA deve ser retornada na heurística`);

      // Consulta de pergunta aguardando aprovação
      const replyChurras = generateHeuristic("Como reservar a churrasqueira do condomínio?", ctx, cfg, db);
      assert.ok(!replyChurras.includes("LEAK_AWAITING"), `${flavor}: FAQ 'aguardando_aprovacao' NUNCA deve ser retornada na heurística`);

      // Consulta de pergunta inativa
      const replyAcademia = generateHeuristic("A academia abre aos domingos?", ctx, cfg, db);
      assert.ok(!replyAcademia.includes("LEAK_INACTIVE"), `${flavor}: FAQ 'inativo' NUNCA deve ser retornada na heurística`);
    }
  });

  await t.test("5. Phone Formats Resilience in Rule Engine (isFaqApplicableToClient)", () => {
    for (const [flavor, isFaq] of [["artifacts", isFaqApplicableArtifacts], ["scripts", isFaqApplicableScripts]]) {
      const faqExclude = {
        id: "faq-ex",
        status: "ativo",
        scope: "exclude",
        clientPhones: ["+55 (21) 98888-7777", "22 99999-1234"]
      };

      // Telefones equivalentes devem ser bloqueados
      assert.equal(isFaq(faqExclude, "5521988887777"), false, `${flavor}: 5521988887777 deve ser excluído`);
      assert.equal(isFaq(faqExclude, "21988887777"), false, `${flavor}: 21988887777 deve ser excluído`);
      assert.equal(isFaq(faqExclude, "+55 21 98888-7777"), false, `${flavor}: formato exato deve ser excluído`);
      assert.equal(isFaq(faqExclude, "5522999991234"), false, `${flavor}: segundo telefone deve ser excluído`);
      
      // Telefone não listado deve ser aprovado
      assert.equal(isFaq(faqExclude, "5522998505276"), true, `${flavor}: não listado deve passar`);

      const faqInclude = {
        id: "faq-inc",
        status: "ativo",
        scope: "include_only",
        clientPhones: ["(22) 99850-5276"]
      };

      assert.equal(isFaq(faqInclude, "5522998505276"), true, `${flavor}: 5522998505276 deve ser incluído`);
      assert.equal(isFaq(faqInclude, "22998505276"), true, `${flavor}: 22998505276 deve ser incluído`);
      assert.equal(isFaq(faqInclude, "5521988887777"), false, `${flavor}: não listado deve ser negado`);
      assert.equal(isFaq(faqInclude, null), false, `${flavor}: null deve ser negado em include_only`);
    }
  });

});
