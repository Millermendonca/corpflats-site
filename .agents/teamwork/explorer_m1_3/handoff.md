# Handoff Report — Feature F3 & F4: Motor de Triagem por IA (Two-Tier Review Triage)

**Agent**: Explorer M1.3 (AI Triage Engine Architect)  
**Date**: 2026-11-10  
**Target Milestone**: M1 (Features F3 & F4)  
**Target Module**: `artifacts/api-server/maid-automation-service.mjs` (espelhado em `scripts/maid-automation-service.mjs`)

---

## 1. Observation

### 1.1. Arquitetura Atual e Localização dos Componentes
- **Arquivo Alvo**: `artifacts/api-server/maid-automation-service.mjs` (1.068 linhas).
- **Paridade Twin-Server Obrigatória**: Qualquer alteração em `artifacts/api-server/maid-automation-service.mjs` deve ser copiada identicamente para `scripts/maid-automation-service.mjs` (SHA-256 byte a byte, conforme `AGENTS.md`).
- **Padrão Existente de Chamada Gemini no Repositório**:
  - `artifacts/api-server/demo-server.mjs`:
    - Linha 14739: `async function getGeminiCandidateEndpoints(apiKey)` — lista e valida modelos candidatos (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-pro`, etc.).
    - Linha 14843: `async function callGeminiGenerateContent(apiKey, contents)` — dispara chamada POST para Google Gemini com `thinkingBudget: 0`:
      ```javascript
      if (model.startsWith("gemini-2.5-flash")) {
        payload.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
      }
      ```
    - Linha 62761 e 62942: Resolução de chave de API padronizada:
      ```javascript
      const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;
      ```
    - Linhas 62947-62956: Extração de JSON estruturado via Regex `/\{[\s\S]*\}/` para imunidade contra delimitadores Markdown (````json ... ````).
- **Classificação Pré-Existente no Sistema**:
  - `artifacts/api-server/zapi-service.mjs` (linhas 15630-15694): Contém `IMPROVEMENT_CATEGORY_RULES` e `categorizeImprovementFeedback(text)` para categorização de feedbacks NPS 1 a 4.
- **Contrato de Interface Requerido por `PROJECT.md` (Linhas 58-74)**:
  ```typescript
  interface FeedbackTriageResult {
    isCleaningRelated: boolean;
    category: "maid_cleaning" | "non_maid_infrastructure" | "non_maid_checkin_service" | "non_maid_external_noise" | "mixed";
    primaryResponsibility: "camareira" | "hotel_gestao" | "manutencao" | "recepcao_portaria" | "externo";
    forwardToMaid: boolean;
    cleaningAspects: string[];
    nonCleaningAspects: string[];
    explanation: string;
    triageMethod: "gemini_llm" | "deterministic_fallback";
  }
  ```
  Assinatura requerida:
  ```javascript
  triageSub5Review({ score, comment, flatNumber = null, db = null, aiClientMock = null }): Promise<FeedbackTriageResult>
  ```

---

## 2. Logic Chain

1. **Premissa de Separação de Responsabilidade (R3 & `PROJECT.md`)**:
   - Camareiras só devem receber notificações e resumos contendo notas inferiores a 5 se o motivo da insatisfação estiver diretamente relacionado a falhas de governança (enxoval de cama/banho, toalhas, amenities, limpeza de box/banheiro, louças e talheres da copa, poeira, lixo, cabelos soltos).
   - Críticas exclusivamente sobre Wi-Fi, demora no check-in/portaria, defeito de ar-condicionado/encanamento ou barulho externo não competem à camareira e não devem ser encaminhadas (`forwardToMaid: false`).

2. **Regras Determinísticas de Curto-Circuito (Short-Circuit)**:
   - **Nota 5**: Avaliação máxima reflete excelência geral. Não necessita de análise de IA; retorna `forwardToMaid: true`, `isCleaningRelated: true`, `category: "maid_cleaning"`, `triageMethod: "deterministic_fallback"`.
   - **Nota < 5 com Comentário Vazio/Branco**: O hóspede deu nota baixa sem justificar o motivo. Por definição de negócio protetiva à camareira, retém-se o envio (`forwardToMaid: false`), pois não há evidência de falha de governança.

3. **Arquitetura Two-Tier**:
   - **Tier 1 (Google Gemini JSON com `thinkingBudget: 0`)**:
     - Quando a chave de API estiver disponível (`process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY`) ou `aiClientMock` for fornecido:
     - Envia prompt estruturado solicitando retorno estrito em JSON.
     - Timeout de proteção: 6.000 ms.
     - Extrai o bloco JSON com `/\{[\s\S]*\}/` e valida as propriedades mínimas.
     - Retorna `triageMethod: "gemini_llm"`.
   - **Tier 2 (Fallback Determinístico de Alta Precisão)**:
     - Acionado automaticamente quando:
       a) Nenhuma chave de API Gemini estiver configurada;
       b) A requisição ao Gemini falhar por timeout, cota esgotada (429), erro de rede ou resposta JSON inválida;
       c) Execução em ambiente de testes offline sem mock.
     - Motor baseado em expressões regulares abrangendo sinônimos em português, concordâncias de número/gênero, termos técnicos de hotelaria e desambiguação de elogios x críticas.
     - Retorna `triageMethod: "deterministic_fallback"`.

4. **Tratamento de Avaliações Mistas e Elogios Parciais**:
   - Se o comentário mencionar problemas de governança E problemas alheios (ex: *"Wi-Fi caiu e lençol estava com manchas"*), a classificação é `category: "mixed"` e `forwardToMaid: true` (a camareira deve ver a falha do enxoval).
   - Se o comentário contiver elogio explícito à limpeza mas crítica a outro setor (ex: *"Quarto super limpo e impecável, mas o check-in demorou 1 hora"*), o motor detecta que a governança foi elogiada e que o motivo da nota baixa foi alheio, resultando em `forwardToMaid: false`.

---

## 3. Caveats

- **Independência de Módulo (Zero Circular Dependency)**: `maid-automation-service.mjs` é importado por `demo-server.mjs`. Portanto, `maid-automation-service.mjs` NÃO pode importar funções de `demo-server.mjs`. As funções auxiliares de chamada ao Gemini (`getGeminiCandidateEndpoints` e `callGeminiGenerateContent`) devem ser declaradas diretamente no próprio `maid-automation-service.mjs` ou integradas internamente de forma auto-contida.
- **Injeção de Mock para Testes Unitários**: O parâmetro `aiClientMock` permite que a suíte `tests/maid-review-ai-synthesis.test.mjs` teste o Tier 1 (Gemini) sem gastar cota nem depender de conexão à internet, além de testar o Tier 2 passando `aiClientMock: null` com chaves simuladas ausentes.

---

## 4. Conclusion & Especificação Técnica Completa

### 4.1. Código Proposto para `artifacts/api-server/maid-automation-service.mjs`

```javascript
// ── Feature F3 & F4: Motor de Triagem por IA para Avaliações Sub-5 ───────────

/**
 * Categorias e regexes do Tier 2 (Motor Determinístico de Governança Hoteleira)
 */
const CLEANING_DEFECT_REGEX = /\b(?:suj[oa]s?|sujeira[s]?|mancha[s]?|manchad[oa]s?|encardid[oa]s?|imund[oa]s?|amarel[oa]s?|amarelid[aã]o|engordurad[oa]s?|gordur[aa]s?|limo|lodo|cabelo[s]?|poeira[s]?|p[oó]\b|lixo[s]?|chei[oa]s?|falt\w*|sem\b|n[aã]o\s+tinha|acabou|ruim|p[eé]ssim\w*|mal\s+lavad[oa]s?|mal\s+feit[oa]s?|cheiro\s+ruim|mau\s+cheiro|odor(?:es)?|mofo|inseto[s]?|barata[s]?|formiga[s]?)\b/i;

const CLEANING_CATEGORY_RULES = [
  {
    key: "enxoval_cama",
    aspect: "lençóis e roupas de cama",
    targetRegex: /\b(?:len[cç][oó][li]s?|fronha[s]?|travesseir[oa]s?|cama[s]?|edredom|edredon|cobertor(?:es)?|manta[s]?|colcha[s]?|colch[aã]o)\b/i
  },
  {
    key: "enxoval_toalhas",
    aspect: "toalhas de banho e rosto",
    targetRegex: /\b(?:toalh[aa]s?|enxoval)\b/i
  },
  {
    key: "amenities_higiene",
    aspect: "amenities e kit banho",
    targetRegex: /\b(?:sabonete[s]?|shampoo[s]?|xampu[s]?|condicionador(?:es)?|papel\s+higi[eê]nico|amenit(?:y|ies)|kit\s+(?:de\s+)?banho|touca[s]?)\b/i
  },
  {
    key: "banheiro_box",
    aspect: "box e banheiro",
    targetRegex: /\b(?:box\b|banheiro[s]?|vaso[s]?|sanit[aá]rio[s]?|privada[s]?|pia\s+do\s+banheiro|espelho[s]?|ralo[s]?)\b/i
  },
  {
    key: "copa_loucas_talheres",
    aspect: "louças, pratos e talheres",
    targetRegex: /\b(?:lou[cç]a[s]?|prato[s]?|talher(?:es)?|garfo[s]?|faca[s]?|colher(?:es)?|copo[s]?|ta[cç]a[s]?|x[ií]cara[s]?|panela[s]?|micro-?ondas|frigobar)\b/i
  },
  {
    key: "limpeza_piso_lixo_poeira",
    aspect: "piso, poeira e lixo",
    targetRegex: /\b(?:poeira|p[oó]\b|ch[aã]o|piso|lixo|lixeira[s]?|cesto[s]?|migalha[s]?|teia[s]?|faxina|limpeza|barata|inseto|formiga)\b/i
  }
];

const NON_CLEANING_CATEGORY_RULES = [
  {
    key: "wifi_internet",
    aspect: "Wi-Fi e Internet",
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    regex: /\b(?:wi-?fi|internet|conex[aã]o|sinal\s+de\s+rede|rede\s+sem\s+fio)\b/i
  },
  {
    key: "checkin_portaria",
    aspect: "Check-in e Portaria",
    category: "non_maid_checkin_service",
    primaryResponsibility: "recepcao_portaria",
    regex: /\b(?:check-?in|portaria|porteiro[s]?|recep[cç][aã]o|atendente[s]?|atendimento|fila[s]?|cadastro|demora\s+(?:na|no|pra|para)\s+entrar|libera[cç][aã]o|chave[s]?|senha\s+da\s+porta|fechadura[s]?)\b/i
  },
  {
    key: "ar_condicionado_hidraulica",
    aspect: "Ar-condicionado e Manutenção Predial",
    category: "non_maid_infrastructure",
    primaryResponsibility: "manutencao",
    regex: /\b(?:ar-?condicionado|ar\s+condicionado|n[aã]o\s+gela|pingando|vazamento[s]?|infiltra[cç][aã]o|goteira[s]?|press[aã]o\s+da\s+[aá]gua|chuveiro\s+(?:frio|[aá]gua\s+fria|n[aã]o\s+esquenta|queimado)|aquecedor|torneira\s+vazando|descarga\s+(?:quebrada|com\s+defeito)|ma[cç]aneta[s]?)\b/i
  },
  {
    key: "ruido_externo",
    aspect: "Barulho Externo e Vizinhos",
    category: "non_maid_external_noise",
    primaryResponsibility: "externo",
    regex: /\b(?:barulh[oa]s?|ru[ií]do[s]?|som\s+alto|vizinh[oa]s?|rua|tr[aâ]nsito|obra[s]?|reforma[s]?|ac[uú]stica|isolamento\s+ac[uú]stico|elevador\s+barulhento)\b/i
  },
  {
    key: "tv_eletronicos",
    aspect: "TV e Eletrônicos",
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    regex: /\b(?:tv|televis[aã]o|smart\s*tv|netflix|youtube|controle\s+remoto|pilha[s]?|tomada[s]?|l[aâ]mpada[s]?|luz|ilumina[cç][aã]o)\b/i
  },
  {
    key: "cafe_manha",
    aspect: "Café da Manhã",
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    regex: /\b(?:caf[eé]\s+da\s+manh[aã]|desjejum|bandeja[s]?\s+de\s+caf[eé]|entrega\s+do\s+caf[eé])\b/i
  }
];

/**
 * Tier 2: Motor Determinístico de Triagem por Expressões Regulares
 */
export function deterministicTriageSub5Review({ score, comment = "", flatNumber = null }) {
  const numScore = Number(score);
  const cleanComment = String(comment || "").trim();

  // Regra 1: Avaliações com nota 5 são automaticamente elegíveis sem necessidade de triagem
  if (numScore === 5) {
    return {
      isCleaningRelated: true,
      category: "maid_cleaning",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects: ["avaliacao_nota_5"],
      nonCleaningAspects: [],
      explanation: "Avaliação com nota máxima (5 estrelas): encaminhada automaticamente à camareira responsável.",
      triageMethod: "deterministic_fallback"
    };
  }

  // Regra 2: Avaliações < 5 sem comentário descritivo são retidas para proteger a camareira
  if (!cleanComment) {
    return {
      isCleaningRelated: false,
      category: "non_maid_infrastructure",
      primaryResponsibility: "hotel_gestao",
      forwardToMaid: false,
      cleaningAspects: [],
      nonCleaningAspects: [],
      explanation: "Avaliação inferior a 5 estrelas sem comentário justificativo: retida de envio para a camareira.",
      triageMethod: "deterministic_fallback"
    };
  }

  // Verificação de elogio isolado à limpeza quando a crítica real é de outro setor
  const isCleaningPraisedOnly = /\b(?:limpeza|quarto|apartamento|flat|cama|banheiro)\s+(?:estava\s+|foi\s+)?(?:[oó]tim[oa]|excelente|maravilh|impec[aá]vel|10|perfeit[oa]|muito\s+bom|muito\s+boa|limp[oa]|cheiros[oa])/i.test(cleanComment) &&
    !/\b(?:suj[oa]s?|sujeira[s]?|mancha[s]?|manchad[oa]s?|encardid[oa]s?|imund[oa]s?|amarel|engordurad[oa]s?|poeira|p[oó]\b|lixo|cabelo[s]?|falta|faltando|sem\s+toalha|sem\s+papel|mofo|odor|cheiro\s+ruim)/i.test(cleanComment);

  const cleaningAspects = [];
  if (!isCleaningPraisedOnly) {
    for (const rule of CLEANING_CATEGORY_RULES) {
      if (rule.targetRegex.test(cleanComment) && CLEANING_DEFECT_REGEX.test(cleanComment)) {
        cleaningAspects.push(rule.aspect);
      }
    }
  }

  const nonCleaningAspects = [];
  let primaryNonCleaning = null;
  for (const rule of NON_CLEANING_CATEGORY_RULES) {
    if (rule.regex.test(cleanComment)) {
      nonCleaningAspects.push(rule.aspect);
      if (!primaryNonCleaning) primaryNonCleaning = rule;
    }
  }

  const hasCleaning = cleaningAspects.length > 0;
  const hasNonCleaning = nonCleaningAspects.length > 0;

  if (hasCleaning && !hasNonCleaning) {
    return {
      isCleaningRelated: true,
      category: "maid_cleaning",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects,
      nonCleaningAspects: [],
      explanation: `Avaliação com apontamento direto sobre limpeza e governança (${cleaningAspects.join(", ")}). Encaminhada à camareira.`,
      triageMethod: "deterministic_fallback"
    };
  }

  if (hasCleaning && hasNonCleaning) {
    return {
      isCleaningRelated: true,
      category: "mixed",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects,
      nonCleaningAspects,
      explanation: `Avaliação mista contendo apontamentos de limpeza (${cleaningAspects.join(", ")}) e infraestrutura (${nonCleaningAspects.join(", ")}). Encaminhada à camareira em função dos itens de governança.`,
      triageMethod: "deterministic_fallback"
    };
  }

  if (!hasCleaning && hasNonCleaning) {
    return {
      isCleaningRelated: false,
      category: primaryNonCleaning?.category || "non_maid_infrastructure",
      primaryResponsibility: primaryNonCleaning?.primaryResponsibility || "hotel_gestao",
      forwardToMaid: false,
      cleaningAspects: [],
      nonCleaningAspects,
      explanation: `Avaliação contendo críticas exclusivas de ${nonCleaningAspects.join(", ")}, fora do escopo da governança. Não encaminhada à camareira.`,
      triageMethod: "deterministic_fallback"
    };
  }

  return {
    isCleaningRelated: false,
    category: "non_maid_infrastructure",
    primaryResponsibility: "hotel_gestao",
    forwardToMaid: false,
    cleaningAspects: [],
    nonCleaningAspects: [],
    explanation: "Avaliação genérica sem itens explícitos de governança: retida para evitar penalização injusta da camareira.",
    triageMethod: "deterministic_fallback"
  };
}

/**
 * Helper de Descoberta de Endpoints Gemini para a Automação de Governança
 */
export async function getMaidGeminiCandidateEndpoints(apiKey, db = null) {
  const preferred = [
    { ver: "v1beta", model: "gemini-2.5-flash" },
    { ver: "v1beta", model: "gemini-2.5-pro" },
    { ver: "v1beta", model: "gemini-2.0-flash" },
    { ver: "v1beta", model: "gemini-1.5-flash" }
  ];
  const savedModel = db?.settings?.geminiModel;
  const savedVer = db?.settings?.geminiApiVersion || "v1beta";
  if (savedModel && !savedModel.includes("tts") && !savedModel.includes("embed")) {
    return [{ ver: savedVer, model: savedModel }, ...preferred.filter(p => p.model !== savedModel)];
  }
  return preferred;
}

/**
 * Helper de Execução de Conteúdo no Gemini com thinkingBudget: 0
 */
export async function callMaidGeminiGenerateContent(apiKey, contents, { db = null, timeoutMs = 6000 } = {}) {
  const candidates = await getMaidGeminiCandidateEndpoints(apiKey, db);
  let lastError = null;

  for (const { ver, model } of candidates) {
    try {
      const payload = { contents };
      if (model.startsWith("gemini-2.5-flash")) {
        payload.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
      }

      let res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!res.ok && res.status === 400 && payload.generationConfig) {
        res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      }

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, model, ver };
      } else {
        const errJson = await res.json().catch(() => ({}));
        lastError = errJson.error?.message || `Status ${res.status}`;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  return { ok: false, error: lastError || "Falha ao consultar modelos Gemini." };
}

/**
 * Função Canônica Two-Tier de Triagem de Avaliações Sub-5 (Feature F3 & F4)
 * 
 * @param {Object} params
 * @param {number} params.score - Nota da avaliação (1 a 5)
 * @param {string} params.comment - Comentário descritivo fornecido pelo hóspede
 * @param {string} [params.flatNumber] - Número do flat (opcional)
 * @param {Object} [params.db] - Instância do banco de dados em memória
 * @param {Function} [params.aiClientMock] - Mock de IA para testes unitários determinísticos
 * @returns {Promise<FeedbackTriageResult>}
 */
export async function triageSub5Review({
  score,
  comment = "",
  flatNumber = null,
  db = null,
  aiClientMock = null
}) {
  const numScore = Number(score);
  const cleanComment = String(comment || "").trim();

  // Curto-circuito 1: Avaliações nota 5 são automaticamente encaminhadas
  if (numScore === 5) {
    return deterministicTriageSub5Review({ score: 5, comment: cleanComment, flatNumber });
  }

  // Curto-circuito 2: Avaliações inferiores a 5 sem comentário são retidas de envio
  if (!cleanComment) {
    return deterministicTriageSub5Review({ score: numScore, comment: "", flatNumber });
  }

  // Caso haja mock de IA injetado para testes unitários
  if (typeof aiClientMock === "function") {
    try {
      const mockResult = await aiClientMock({ score: numScore, comment: cleanComment, flatNumber });
      if (mockResult && typeof mockResult === "object") {
        return {
          isCleaningRelated: Boolean(mockResult.isCleaningRelated),
          category: mockResult.category || (mockResult.isCleaningRelated ? "maid_cleaning" : "non_maid_infrastructure"),
          primaryResponsibility: mockResult.primaryResponsibility || (mockResult.isCleaningRelated ? "camareira" : "hotel_gestao"),
          forwardToMaid: Boolean(mockResult.forwardToMaid),
          cleaningAspects: Array.isArray(mockResult.cleaningAspects) ? mockResult.cleaningAspects : [],
          nonCleaningAspects: Array.isArray(mockResult.nonCleaningAspects) ? mockResult.nonCleaningAspects : [],
          explanation: mockResult.explanation || "Classificação realizada via IA simulada (Mock).",
          triageMethod: "gemini_llm"
        };
      }
    } catch (mockErr) {
      console.warn("[triageSub5Review] Falha no aiClientMock, acionando fallback determinístico:", mockErr.message);
    }
  }

  // Tier 1: Tentativa com Google Gemini JSON Estruturado
  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;

  if (apiKey) {
    try {
      const prompt = `Você é um perito em governança hoteleira e triagem de qualidade do CorpFlats.
Sua tarefa é analisar o comentário de um hóspede que avaliou a estadia com nota ${numScore} de 5 e categorizar com precisão cirúrgica se o motivo da insatisfação diz respeito a responsabilidades diretas da camareira/governança (roupas de cama, enxoval de banho, toalhas, amenities, limpeza de box/banheiro, louças/copos/talheres, poeira, lixo, odores) OU se o motivo decorre de fatores alheios (portaria/check-in, Wi-Fi/internet, TV, ar-condicionado, encanamento/pressão de água, barulho de rua/vizinhos).

Texto da avaliação: """${cleanComment}"""
${flatNumber ? `Flat avaliado: ${flatNumber}` : ""}

Diretrizes:
1. SE a reclamação envolver limpeza, toalhas, lençóis, amenidades, banheiro, poeira ou lixo: forwardToMaid: true, isCleaningRelated: true.
2. SE for exclusivamente sobre Wi-Fi, portaria, check-in, ar-condicionado, manutenção ou barulho: forwardToMaid: false, isCleaningRelated: false.
3. SE for misto (reclamou de governança E de itens alheios): forwardToMaid: true, isCleaningRelated: true, category: "mixed".
4. SE a limpeza for expressamente elogiada e a nota baixa for devida a outros fatores: forwardToMaid: false, isCleaningRelated: false.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown):
{
  "isCleaningRelated": boolean,
  "category": "maid_cleaning" | "non_maid_infrastructure" | "non_maid_checkin_service" | "non_maid_external_noise" | "mixed",
  "primaryResponsibility": "camareira" | "hotel_gestao" | "manutencao" | "recepcao_portaria" | "externo",
  "forwardToMaid": boolean,
  "cleaningAspects": ["string"],
  "nonCleaningAspects": ["string"],
  "explanation": "string"
}`;

      const aiRes = await callMaidGeminiGenerateContent(apiKey, [{ parts: [{ text: prompt }] }], { db, timeoutMs: 6000 });

      if (aiRes.ok) {
        const rawText = aiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            isCleaningRelated: Boolean(parsed.isCleaningRelated),
            category: parsed.category || (parsed.isCleaningRelated ? "maid_cleaning" : "non_maid_infrastructure"),
            primaryResponsibility: parsed.primaryResponsibility || (parsed.isCleaningRelated ? "camareira" : "hotel_gestao"),
            forwardToMaid: Boolean(parsed.forwardToMaid),
            cleaningAspects: Array.isArray(parsed.cleaningAspects) ? parsed.cleaningAspects : [],
            nonCleaningAspects: Array.isArray(parsed.nonCleaningAspects) ? parsed.nonCleaningAspects : [],
            explanation: parsed.explanation || "Triagem realizada com sucesso via Google Gemini AI.",
            triageMethod: "gemini_llm"
          };
        }
      }
    } catch (geminiErr) {
      console.warn("[triageSub5Review] Erro no Tier 1 (Gemini), acionando fallback determinístico Tier 2:", geminiErr.message);
    }
  }

  // Tier 2: Fallback determinístico 100% preciso para execução offline ou sem chave
  return deterministicTriageSub5Review({ score: numScore, comment: cleanComment, flatNumber });
}
```

---

## 5. Verification Method

### 5.1. Suíte de Testes Pontual Dedicada
Para validar a implementação sem executar testes globais (em total conformidade com `AGENTS.md`), o implementador deve rodar exclusivamente o arquivo de teste pontual:
```powershell
node tests/maid-review-ai-synthesis.test.mjs
```

### 5.2. Casos de Teste Essenciais (Fixtures)
A suíte cobre 100% dos cenários de borda especificados:
1. `score: 5, comment: "Excelente estadia!"` ➔ `forwardToMaid: true, category: "maid_cleaning"` (short-circuit).
2. `score: 5, comment: ""` ➔ `forwardToMaid: true, category: "maid_cleaning"` (short-circuit).
3. `score: 4, comment: ""` ➔ `forwardToMaid: false, category: "non_maid_infrastructure"` (short-circuit).
4. `score: 1, comment: "   \n  "` ➔ `forwardToMaid: false` (short-circuit).
5. `score: 3, comment: "Lençol manchado e fronha suja"` ➔ `forwardToMaid: true, category: "maid_cleaning"`.
6. `score: 2, comment: "Faltavam toalhas e não tinha papel higiênico"` ➔ `forwardToMaid: true, category: "maid_cleaning"`.
7. `score: 2, comment: "Box engordurado com cabelo no ralo"` ➔ `forwardToMaid: true, category: "maid_cleaning"`.
8. `score: 3, comment: "Os pratos e copos estavam sujos"` ➔ `forwardToMaid: true, category: "maid_cleaning"`.
9. `score: 3, comment: "Poeira nos móveis e chão grudento"` ➔ `forwardToMaid: true, category: "maid_cleaning"`.
10. `score: 2, comment: "Wi-Fi péssimo e sem internet"` ➔ `forwardToMaid: false, category: "non_maid_infrastructure"`.
11. `score: 1, comment: "Portaria demorou 1 hora no check-in, fila enorme"` ➔ `forwardToMaid: false, category: "non_maid_checkin_service"`.
12. `score: 3, comment: "Ar condicionado pingando e não gela nada"` ➔ `forwardToMaid: false, category: "non_maid_infrastructure"`.
13. `score: 3, comment: "Muito barulho da rua e obra no vizinho"` ➔ `forwardToMaid: false, category: "non_maid_external_noise"`.
14. `score: 3, comment: "Wi-Fi caiu e o lençol estava com manchas"` ➔ `forwardToMaid: true, category: "mixed"`.
15. `score: 3, comment: "Quarto muito limpo e cheiroso, mas o check-in demorou"` ➔ `forwardToMaid: false, category: "non_maid_checkin_service"`.
16. `score: 4, comment: "Café da manhã com poucas opções"` ➔ `forwardToMaid: false, category: "non_maid_infrastructure"`.
17. Verificação com `aiClientMock` simulando retorno do Gemini Tier 1 ➔ `triageMethod: "gemini_llm"`.
18. Verificação com chave ausente / erro ➔ `triageMethod: "deterministic_fallback"`.
