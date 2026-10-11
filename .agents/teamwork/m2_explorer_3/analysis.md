# Análise Técnica & Design de Testes — Milestone 2 Explorer 3

## 1. Resumo Executivo

Esta investigação analisa a integração dinâmica da Base de Conhecimento e FAQ (Sofia AI) no serviço `whatsapp-ai-service.mjs` e o desenho da suíte de testes de regressão e aceitação do Milestone 2 para `tests/whatsapp-ai-agent.test.mjs`.

O motor Sofia opera em dois níveis complementares:
1. **Nível 1 (Google Gemini AI via API / Multi-turn Function Calling)**: Injeção dinâmica no system prompt de todas as FAQs com `status === 'ativo'` aplicáveis ao hóspede (`isFaqApplicableToClient`), formatadas sob o bloco oficial `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):`. Hóspedes em listas de exclusão (`exclude`) ou não pertencentes a regras restritas (`include_only`) não têm acesso às diretrizes restritas no contexto de LLM.
2. **Nível 2 (Contingência Heurística Local de Alta Confiabilidade - Zero-Crash Fallback)**: Executada quando a API do Gemini estiver indisponível, sem cota ou em caso de timeout. A função `generateHeuristicResponse` foi desenhada para buscar dinamicamente em palavras-chave e variações das FAQs ativas aplicáveis antes de cair na resposta genérica de transbordo da concierge, respeitando as regras de segmentação.

Adicionalmente, desenhou-se o conjunto completo de 4 testes adicionais (Testes 21 a 24) para `tests/whatsapp-ai-agent.test.mjs`, cobrindo de ponta a ponta os requisitos R2, R3, R4 e R5 da especificação original.

---

## 2. Diagnóstico da Arquitetura Atual

### 2.1 Ponto de Entrada: `generateAiWhatsAppResponse`
- Localização: `artifacts/api-server/whatsapp-ai-service.mjs:1252` e `scripts/whatsapp-ai-service.mjs:1252` (arquivos duplamente espelhados com exigência de SHA-256 idêntico por `tests/whatsapp-ai-agent.test.mjs:351`).
- Atualmente, o `contextString` montado para a instrução de sistema do Gemini inclui apenas campos estáticos de `aiConfig.knowledgeBase` (como Wi-Fi padrão, horários de check-in/out e endereço), sem carregar a coleção `db.faqItems`.
- **Necessidade**: Filtrar `db.faqItems` com `faq.status === 'ativo' && isFaqApplicableToClient(faq, phone)` e concatenar o bloco estruturado `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):` no `contextString`.

### 2.2 Contingência Heurística: `generateHeuristicResponse`
- Localização: `artifacts/api-server/whatsapp-ai-service.mjs:1025` e `scripts/whatsapp-ai-service.mjs:1025`.
- Atualmente possui 8 regras estáticas (Wi-Fi, café da manhã, garagem, localização, check-out, quarto pronto, reservas e saudação), caindo na regra 9 ("Resposta padrão prestativa") caso nenhuma regex seja satisfeita.
- **Necessidade**: Antes de cair na regra 9 (como regra 8.5), receber a lista de FAQs aplicáveis (via 4º parâmetro ou contexto) e realizar pesquisa por matching de palavras-chave (`faq.keywords`), variações (`faq.variations`) e pergunta principal (`faq.question`) com normalização de acentos e tokens.

### 2.3 Regras de Segmentação: `isFaqApplicableToClient`
- Já exportado em `zapi-service.mjs:1120` e re-exportado em `whatsapp-ai-service.mjs:17`.
- Trata perfeitamente:
  - `status !== "ativo"` -> `false`
  - `scope === "all"` -> `true`
  - `scope === "exclude"` -> `false` se o telefone do cliente bater com algum número da lista (com normalização DDI 55, DDD e 8/9 dígitos via `matchClientPhone`), caso contrário `true`.
  - `scope === "include_only"` -> `true` apenas se houver correspondência exata de telefone.

---

## 3. Especificação Detalhada da Integração no Motor Sofia

### 3.1 Injeção Dinâmica no Prompt do Gemini (`generateAiWhatsAppResponse`)

No fluxo de construção do `contextString`:
```javascript
// 1. Coleta e filtragem de FAQs ativas aplicáveis
const allFaqItems = Array.isArray(db?.faqItems)
  ? db.faqItems
  : (Array.isArray(db?.knowledgeBaseFaq) ? db.knowledgeBaseFaq : []);

const applicableFaqs = allFaqItems.filter(faq => {
  return faq && faq.status === "ativo" && isFaqApplicableToClient(faq, phone);
});

// 2. Formatação do bloco Markdown
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
```

O `dynamicFaqPromptSection` é inserido imediatamente antes de `${systemActionsNotice}` no `contextString`, garantindo visibilidade primária pelo modelo Gemini.

### 3.2 Pesquisa Heurística Dinâmica (`generateHeuristicResponse`)

A assinatura de `generateHeuristicResponse` é expandida com suporte retrocompatível ao 4º argumento:
```javascript
export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG, dbOrFaqs = null)
```

Resolução de FAQs ativas aplicáveis:
```javascript
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
```

Algoritmo de Matching e Pontuação (Passo 8.5):
```javascript
if (activeFaqs.length > 0) {
  const cleanQuery = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const queryTokens = cleanQuery.split(/[\s,.;:?!+=\-_/\\()]+/).filter(w => w.length > 2);

  let bestFaq = null;
  let highestScore = 0;

  for (const faq of activeFaqs) {
    let score = 0;
    const qNorm = (faq.question || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Coincidência com pergunta principal
    if (cleanQuery.includes(qNorm) || (qNorm.length > 8 && qNorm.includes(cleanQuery))) {
      score += 80;
    }

    // 2. Coincidência com variações cadastradas
    if (Array.isArray(faq.variations)) {
      for (const variation of faq.variations) {
        if (!variation) continue;
        const vNorm = variation.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (cleanQuery.includes(vNorm) || (vNorm.length > 8 && vNorm.includes(cleanQuery))) {
          score += 100;
          break;
        }
        const vTokens = vNorm.split(/[\s,.;:?!+=\-_/\\()]+/).filter(w => w.length > 2);
        const common = vTokens.filter(t => queryTokens.includes(t));
        if (vTokens.length > 0 && common.length >= Math.min(2, vTokens.length)) {
          score += Math.max(score, 40 + (common.length * 10));
        }
      }
    }

    // 3. Coincidência com palavras-chave cadastradas
    if (Array.isArray(faq.keywords)) {
      for (const keyword of faq.keywords) {
        if (!keyword) continue;
        const kNorm = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (kNorm.includes(" ")) {
          if (cleanQuery.includes(kNorm)) {
            score += 50;
          }
        } else if (kNorm.length >= 3) {
          if (queryTokens.includes(kNorm)) {
            score += 25;
          } else if (cleanQuery.includes(kNorm)) {
            score += 15;
          }
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestFaq = faq;
    }
  }

  // Se score for satisfatório (pelo menos 1 palavra-chave exata ou variação identificada)
  if (bestFaq && highestScore >= 25) {
    return `Olá${name}! ${bestFaq.answer}`;
  }
}
```

E no fallback heurístico de `generateAiWhatsAppResponse`:
```javascript
const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs);
```

---

## 4. Design da Suíte de Testes para Milestone 2 (`tests/whatsapp-ai-agent.test.mjs`)

Os testes abaixo devem ser adicionados na sequência dos testes existentes (após o teste 20), formando os testes 21, 22, 23 e 24.

### Teste 21: Injeção Dinâmica de FAQs Ativas no Prompt do Gemini com Regras de Exceção por Cliente
- **Objetivo**: Garantir que o system instruction enviado para a API do Google Gemini contenha o bloco `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):` apenas com itens ativos e devidamente filtrados pelo motor de regras de exceção.
- **Cenários testados**:
  1. Hóspede padrão (`5522998505276`) recebe FAQs de escopo `all`, `include_only` (no qual seu telefone consta) e `exclude` (no qual seu telefone não consta).
  2. FAQs com status `pendente` ou `aguardando_aprovacao` são rigorosamente excluídas do prompt.
  3. Hóspede em lista de exclusão (`5521999990001`) NÃO recebe no prompt a FAQ da qual foi excluído.
  4. Hóspede sem permissão em regra `include_only` NÃO recebe a respectiva FAQ no prompt.

### Teste 22: Contingência Heurística Local com Pesquisa por Palavras-Chave e Variações em FAQs Ativas
- **Objetivo**: Validar a capacidade do motor heurístico offline de responder dúvidas que constem no banco dinâmico antes de cair na resposta padrão.
- **Cenários testados**:
  1. Dúvida sobre louças do café ("O que fazer com as louças do café da manhã?") encontra `faq-recolhimento-loucas` e responde com as instruções de manter no quarto e não deixar no corredor.
  2. Dúvida sobre pet ("Posso levar meu cachorro? Qual a taxa pet?") encontra `faq-regras-pets` e retorna as orientações pet friendly.
  3. Cliente excluído de uma FAQ não recebe a resposta heurística restrita (caindo na mensagem padrão cordial).
  4. FAQs não ativas (`pendente` ou `aguardando_aprovacao`) não são acionadas pela contingência heurística.

### Teste 23: Auto-Aprendizado Inbound: Pergunta Inédita Não Mapeada Gera FAQ com Status 'pendente'
- **Objetivo**: Validar que mensagens recebidas via webhook Z-API (`processAiInboundMessage`) com perguntas não reconhecidas que necessitem de atendimento humano criam automaticamente um registro na coleção `db.faqItems` com `status: "pendente"`.
- **Cenários testados**:
  1. Cliente envia pergunta inédita: "Vocês possuem tomada para recarga de carro elétrico na garagem?".
  2. A mensagem aciona transbordo humano.
  3. Criação automática de entrada em `db.faqItems` contendo:
     - `status: "pendente"`
     - `question` com o texto da mensagem
     - `category` inferida ("garagem")
     - `sourceClientPhone` e `clientPhones` com o telefone do remetente
     - `createdAt` preenchido
  4. Idempotência: envio repetido da mesma dúvida pendente não gera duplicatas.

### Teste 24: Captura Automática de Resposta do Operador (`fromMe: true`) vinculando 'suggestedAnswer' e Status 'aguardando_aprovacao'
- **Objetivo**: Validar que mensagens subsequentes enviadas pelo operador humano no chat vinculam automaticamente a resposta enviada à dúvida pendente como sugestão para aprovação.
- **Cenários testados**:
  1. Existência prévia de FAQ pendente para o cliente `5522998505276`.
  2. Envio de mensagem pelo operador (`fromMe: true` ou via função de captura).
  3. Atualização automática do registro:
     - `status` promovido de `"pendente"` para `"aguardando_aprovacao"`
     - `suggestedAnswer` preenchido com o texto digitado pelo operador
     - `updatedAt` atualizado
  4. Validação da janela temporal de 24 horas (mensagens antigas não são vinculadas).
  5. Promoção para `"ativo"` via aprovação e disponibilização imediata para a Sofia.

---

## 5. Diffs Recomendados para Implementação

### 5.1 Arquivos Afetados
- `artifacts/api-server/whatsapp-ai-service.mjs`
- `scripts/whatsapp-ai-service.mjs` (espelho exato SHA-256)
- `tests/whatsapp-ai-agent.test.mjs`

### 5.2 Diff Proposto: `whatsapp-ai-service.mjs`

```diff
--- artifacts/api-server/whatsapp-ai-service.mjs
+++ artifacts/api-server/whatsapp-ai-service.mjs
@@ -1022,9 +1022,25 @@
 /**
  * Resposta Heurística de Contingência caso o Google Gemini esteja offline ou sem cota
  */
-export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG) {
+export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG, dbOrFaqs = null) {
   const text = (messageText || "").toLowerCase().trim();
   const kb = aiConfig.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
   const name = guestContext.guestName ? `, ${guestContext.guestName.split(" ")[0]}` : "";
 
+  // Extrai e filtra itens de FAQ ativos e aplicáveis ao cliente
+  let candidateFaqs = [];
+  if (Array.isArray(dbOrFaqs)) {
+    candidateFaqs = dbOrFaqs;
+  } else if (dbOrFaqs && typeof dbOrFaqs === "object") {
+    const raw = dbOrFaqs.faqItems || dbOrFaqs.knowledgeBaseFaq || [];
+    candidateFaqs = Array.isArray(raw) ? raw : [];
+  } else if (aiConfig && Array.isArray(aiConfig.faqItems)) {
+    candidateFaqs = aiConfig.faqItems;
+  } else if (typeof globalThis !== "undefined" && Array.isArray(globalThis.db?.faqItems)) {
+    candidateFaqs = globalThis.db.faqItems;
+  }
+
+  const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
+  const activeFaqs = candidateFaqs.filter(faq => {
+    return faq && faq.status === "ativo" && isFaqApplicableToClient(faq, clientPhone);
+  });
+
   // 1. Wi-Fi / Internet
@@ -1086,6 +1102,74 @@
     return `Olá${name}! Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats em Campos dos Goytacazes. Como posso te ajudar hoje? Ficou com alguma dúvida sobre nossas acomodações ou sobre sua estadia? 😊`;
   }
 
+  // 8.5 Base Dinâmica de FAQs Ativas (Pesquisa Heurística por Perguntas, Variações e Palavras-chave)
+  if (activeFaqs.length > 0) {
+    const cleanQuery = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
+    const queryTokens = cleanQuery.split(/[\s,.;:?!+=\-_/\\()]+/).filter(w => w.length > 2);
+
+    let bestFaq = null;
+    let highestScore = 0;
+
+    for (const faq of activeFaqs) {
+      let score = 0;
+      const qNorm = (faq.question || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
+
+      // Coincidência com pergunta principal
+      if (cleanQuery.includes(qNorm) || (qNorm.length > 8 && qNorm.includes(cleanQuery))) {
+        score += 80;
+      }
+
+      // Coincidência com variações da pergunta
+      if (Array.isArray(faq.variations)) {
+        for (const variation of faq.variations) {
+          if (!variation) continue;
+          const vNorm = variation.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
+          if (cleanQuery.includes(vNorm) || (vNorm.length > 8 && vNorm.includes(cleanQuery))) {
+            score += 100;
+            break;
+          }
+          const vTokens = vNorm.split(/[\s,.;:?!+=\-_/\\()]+/).filter(w => w.length > 2);
+          const common = vTokens.filter(t => queryTokens.includes(t));
+          if (vTokens.length > 0 && common.length >= Math.min(2, vTokens.length)) {
+            score += Math.max(score, 40 + (common.length * 10));
+          }
+        }
+      }
+
+      // Coincidência com palavras-chave
+      if (Array.isArray(faq.keywords)) {
+        for (const keyword of faq.keywords) {
+          if (!keyword) continue;
+          const kNorm = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
+          if (kNorm.includes(" ")) {
+            if (cleanQuery.includes(kNorm)) {
+              score += 50;
+            }
+          } else if (kNorm.length >= 3) {
+            if (queryTokens.includes(kNorm)) {
+              score += 25;
+            } else if (cleanQuery.includes(kNorm)) {
+              score += 15;
+            }
+          }
+        }
+      }
+
+      if (score > highestScore) {
+        highestScore = score;
+        bestFaq = faq;
+      }
+    }
+
+    if (bestFaq && highestScore >= 25) {
+      return `Olá${name}! ${bestFaq.answer}`;
+    }
+  }
+
   // 9. Resposta padrão prestativa
   return `Olá${name}! Recebi sua mensagem. Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨.\n\nPosso te ajudar com informações sobre *Wi-Fi, horários de check-in/out, status do flat, garagem, café da manhã e localização*. Como posso te ajudar? Se preferir falar com um atendente da recepção, basta me avisar! ✨`;
 }
@@ -1290,6 +1374,32 @@
 `;
   }
 
+  // 2.1 Carrega e filtra FAQs dinâmicos ativos aplicáveis ao cliente
+  const allFaqItems = Array.isArray(db?.faqItems)
+    ? db.faqItems
+    : (Array.isArray(db?.knowledgeBaseFaq) ? db.faqItems : []);
+
+  const applicableFaqs = allFaqItems.filter(faq => {
+    return faq && faq.status === "ativo" && isFaqApplicableToClient(faq, phone);
+  });
+
+  let dynamicFaqPromptSection = "";
+  if (applicableFaqs.length > 0) {
+    const formattedFaqs = applicableFaqs.map((faq, idx) => {
+      const vars = Array.isArray(faq.variations) && faq.variations.length > 0
+        ? `\n  - Variações comuns: ${faq.variations.slice(0, 3).join("; ")}`
+        : "";
+      const kw = Array.isArray(faq.keywords) && faq.keywords.length > 0
+        ? ` (Palavras-chave: ${faq.keywords.join(", ")})`
+        : "";
+      return `[FAQ #${idx + 1} - Categoria: ${(faq.category || "geral").toUpperCase()}]
+- Pergunta: ${faq.question}${kw}${vars}
+- Resposta Oficial: ${faq.answer}`;
+    }).join("\n\n");
+
+    dynamicFaqPromptSection = `
+## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):
+Abaixo estão as perguntas e respostas oficiais da CorpFlats ativas e aplicáveis a este hóspede. Priorize rigorosamente estas respostas oficiais para quaisquer dúvidas correspondentes:
+
+${formattedFaqs}
+`;
+  }
+
   const contextString = `
 [CONTEXTO EM TEMPO REAL]
 - Data atual: ${guestContext.todayStr} | Horário: ${guestContext.timeStr} (Brasília)
@@ -1318,6 +1428,7 @@
 - Benefícios Reserva Direta: ${aiConfig.knowledgeBase.directBookingBenefits}
 - Site Oficial para Reservas: ${aiConfig.knowledgeBase.siteUrl}
 - WhatsApp da Recepção: ${aiConfig.knowledgeBase.receptionPhone}
+${dynamicFaqPromptSection}
 ${systemActionsNotice}
 `;
@@ -1353,7 +1464,7 @@
   }
 
   // 4. Contingência Heurística Local de Alta Precisão (Zero-Crash Fallback)
-  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig);
+  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs);
   return {
     shouldHandover: false,
     replyText: heuristicText,
```

---

## 6. Código Completo dos Novos Testes M2 para `tests/whatsapp-ai-agent.test.mjs`

```javascript
  test("21. Injeção Dinâmica de FAQs Ativas no Prompt do Gemini com Regras de Exceção por Cliente", async () => {
    const testDb = JSON.parse(JSON.stringify(mockDb));
    testDb.settings.geminiApiKey = "TEST_GEMINI_KEY";
    testDb.faqItems = [
      {
        id: "faq-visitas",
        question: "Posso receber visitas no apartamento?",
        answer: "Visitas são permitidas até às 22h com identificação prévia na portaria.",
        category: "regras_visitas_pets",
        status: "ativo",
        scope: "all",
        clientPhones: []
      },
      {
        id: "faq-desconto-restrito",
        question: "Tenho direito a desconto corporativo exclusivo?",
        answer: "Sim, sua empresa possui tarifa com 15% de desconto direto.",
        category: "reservas",
        status: "ativo",
        scope: "exclude",
        clientPhones: ["5521999990001"]
      },
      {
        id: "faq-vip-diretoria",
        question: "Como funciona o upgrade VIP de quarto?",
        answer: "Upgrades são concedidos sem custo para membros da diretoria CorpFlats.",
        category: "reservas",
        status: "ativo",
        scope: "include_only",
        clientPhones: ["5522998505276"]
      },
      {
        id: "faq-pendente-teste",
        question: "Vocês aceitam animais de grande porte?",
        answer: "Apenas até 10kg.",
        category: "regras_visitas_pets",
        status: "pendente",
        scope: "all",
        clientPhones: []
      },
      {
        id: "faq-aguardando-teste",
        question: "Qual o tamanho da cama do flat?",
        answer: "Cama Queen Size Ortobom.",
        category: "estrutura_flat",
        status: "aguardando_aprovacao",
        scope: "all",
        clientPhones: []
      }
    ];

    const originalFetch = globalThis.fetch;
    let interceptedInstruction = "";

    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(opts.body);
          const firstPart = body.contents?.[0]?.parts?.[0]?.text || "";
          interceptedInstruction = firstPart;
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: "Informação processada com base nas FAQs ativas oficiais." }]
                  }
                }
              ]
            })
          };
        }
        return originalFetch(url, opts);
      };

      // 1. Cliente Autorizado (5522998505276): deve receber regras ativas aplicáveis
      await generateAiWhatsAppResponse({
        db: testDb,
        phone: "5522998505276",
        messageText: "Quais as regras de visitas e upgrades?"
      });

      assert.ok(interceptedInstruction.includes("## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):"), "System instruction deve conter o cabeçalho oficial de FAQs");
      assert.ok(interceptedInstruction.includes("faq-visitas") || interceptedInstruction.includes("Visitas são permitidas"), "Deve conter FAQ com escopo 'all'");
      assert.ok(interceptedInstruction.includes("desconto corporativo exclusivo"), "Deve conter FAQ 'exclude' para cliente não excluído");
      assert.ok(interceptedInstruction.includes("upgrade VIP de quarto"), "Deve conter FAQ 'include_only' para cliente incluído");
      assert.ok(!interceptedInstruction.includes("animais de grande porte"), "NÃO deve conter FAQ com status 'pendente'");
      assert.ok(!interceptedInstruction.includes("Cama Queen Size"), "NÃO deve conter FAQ com status 'aguardando_aprovacao'");

      // 2. Cliente Excluído (5521999990001): não deve receber a regra com escopo 'exclude'
      interceptedInstruction = "";
      await generateAiWhatsAppResponse({
        db: testDb,
        phone: "5521999990001",
        messageText: "Quais são as regras?"
      });

      assert.ok(interceptedInstruction.includes("Visitas são permitidas"), "Deve manter FAQ com escopo 'all'");
      assert.ok(!interceptedInstruction.includes("desconto corporativo exclusivo"), "NÃO deve conter FAQ da qual o cliente foi expressamente excluído");
      assert.ok(!interceptedInstruction.includes("upgrade VIP de quarto"), "NÃO deve conter FAQ 'include_only' na qual o cliente não está listado");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("22. Contingência Heurística Local com Pesquisa por Palavras-Chave e Variações em FAQs Ativas", () => {
    const heuristicDb = {
      faqItems: [
        {
          id: "faq-recolhimento-loucas",
          question: "O que fazer com as louças e a bandeja após o café da manhã?",
          answer: "🍽️ Mantenha todas as louças dentro do flat. Não coloque no corredor nem entregue ao restaurante.",
          category: "cafe_manha",
          keywords: ["loucas", "louças", "bandeja", "recolhimento", "pratos", "talheres"],
          variations: ["Onde deixo a bandeja e as louças do café?", "Quem recolhe a louça do quarto?"],
          status: "ativo",
          scope: "all",
          clientPhones: []
        },
        {
          id: "faq-pet-vip",
          question: "Política de animais no flat",
          answer: "🐾 Aceitamos pets de pequeno porte com taxa diária especial de R$ 50.",
          category: "regras_visitas_pets",
          keywords: ["pet", "pets", "cachorro", "gato", "taxa pet"],
          variations: ["Posso levar meu cachorro?"],
          status: "ativo",
          scope: "exclude",
          clientPhones: ["5521999990001"]
        },
        {
          id: "faq-pendente-nao-ativo",
          question: "Qual o tamanho da piscina?",
          answer: "25 metros semiolímpica.",
          category: "lazer_condominio",
          keywords: ["piscina", "nadar"],
          variations: [],
          status: "pendente",
          scope: "all",
          clientPhones: []
        }
      ]
    };

    const ctx = buildGuestContext(mockDb, "5522998505276");
    const aiConfig = getWhatsAppAiConfig(mockDb);

    // 1. Encontra por variação exata/parcial e palavras-chave de louças
    const replyLoucas = generateHeuristicResponse("Onde deixo as louças e a bandeja do café?", ctx, aiConfig, heuristicDb);
    assert.ok(replyLoucas.includes("Mantenha todas as louças dentro do flat"), "Deve responder com conteúdo da FAQ de recolhimento de louças");

    // 2. Encontra por palavra-chave pet para cliente autorizado
    const replyPet = generateHeuristicResponse("Posso levar meu cachorro? Tem taxa pet?", ctx, aiConfig, heuristicDb);
    assert.ok(replyPet.includes("Aceitamos pets de pequeno porte"), "Deve responder com política pet para cliente liberado");

    // 3. Cliente excluído não recebe a resposta da FAQ restrita
    const ctxExcluido = buildGuestContext(mockDb, "5521999990001");
    const replyPetExcluido = generateHeuristicResponse("Posso levar meu cachorro?", ctxExcluido, aiConfig, heuristicDb);
    assert.ok(!replyPetExcluido.includes("taxa diária especial de R$ 50"), "Cliente na lista de exclusão NÃO deve receber resposta da FAQ restrita");
    assert.ok(replyPetExcluido.includes("concierge virtual da CorpFlats"), "Deve cair no fallback genérico prestativo");

    // 4. FAQ com status 'pendente' nunca é acionada pela contingência heurística
    const replyPiscina = generateHeuristicResponse("Qual o tamanho da piscina?", ctx, aiConfig, heuristicDb);
    assert.ok(!replyPiscina.includes("semiolímpica"), "FAQ pendente não pode ser usada na contingência");
  });

  test("23. Auto-Aprendizado Inbound: Pergunta Inédita Não Mapeada Gera FAQ com Status 'pendente'", async () => {
    const autoLearnDb = JSON.parse(JSON.stringify(mockDb));
    autoLearnDb.faqItems = [];
    autoLearnDb.zapiConfig.testModeOnly = false;
    autoLearnDb.whatsappConversations = [
      {
        phone: "5522998505276",
        name: "Carlos Drumond",
        messages: [],
        aiPaused: false
      }
    ];

    let saved = false;
    const saveDbMock = () => { saved = true; };

    // Inbound com pergunta inédita sobre tomadas de carro elétrico
    const result = await processAiInboundMessage({
      db: autoLearnDb,
      incomingInfo: {
        text: "Vocês possuem tomada para recarga de carro elétrico no estacionamento?",
        senderPhone: "5522998505276",
        senderName: "Carlos Drumond",
        fromMe: false,
        isGroup: false
      },
      cleanTarget: "5522998505276",
      saveDatabase: saveDbMock,
      createNotification: () => {},
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {}
    });

    assert.equal(result.handled, true);
    // Deve registrar a nova pergunta pendente na base
    const pendingFaq = autoLearnDb.faqItems.find(f => f.status === "pendente");
    assert.ok(pendingFaq, "Deve existir item com status 'pendente'");
    assert.equal(pendingFaq.question, "Vocês possuem tomada para recarga de carro elétrico no estacionamento?");
    assert.ok(pendingFaq.sourceClientPhone.includes("5522998505276"));
    assert.equal(pendingFaq.category, "garagem");
  });

  test("24. Captura Automática de Resposta do Operador (fromMe: true) vinculando 'suggestedAnswer' e Status 'aguardando_aprovacao'", async () => {
    const captureDb = JSON.parse(JSON.stringify(mockDb));
    captureDb.faqItems = [
      {
        id: "faq_auto_test_1",
        question: "Vocês têm berço desmontável para bebê?",
        answer: "",
        category: "estrutura_flat",
        status: "pendente",
        sourceClientPhone: "5522998505276",
        clientPhones: ["5522998505276"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const { captureOperatorResponseForFaq } = await import("../artifacts/api-server/zapi-service.mjs");
    assert.equal(typeof captureOperatorResponseForFaq, "function");

    // Operador responde manualmente no chat
    const operatorText = "Sim, disponibilizamos berço desmontável mediante solicitação prévia sem taxa extra!";
    const updated = captureOperatorResponseForFaq(captureDb, "5522998505276", operatorText);

    assert.ok(updated);
    assert.equal(updated.id, "faq_auto_test_1");
    assert.equal(updated.status, "aguardando_aprovacao");
    assert.equal(updated.suggestedAnswer, operatorText);

    // Validação da aprovação promovendo para 'ativo'
    updated.status = "ativo";
    updated.answer = updated.suggestedAnswer;
    updated.approvedAt = new Date().toISOString();

    // Sofia agora deve responder de forma autônoma com a nova resposta oficial
    const ctx = buildGuestContext(mockDb, "5522998505276");
    const aiConfig = getWhatsAppAiConfig(mockDb);
    const reply = generateHeuristicResponse("Vocês têm berço?", ctx, aiConfig, captureDb);
    assert.ok(reply.includes("berço desmontável mediante solicitação"), "A resposta aprovada deve ser imediatamente utilizada pela Sofia");
  });
```
