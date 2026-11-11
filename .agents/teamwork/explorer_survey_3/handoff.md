# Handoff Report: AI Feedback Triage & Consolidated Opinion Synthesis (Explorer 3)

**Author**: Explorer 3 (AI Feedback Synthesis Explorer)  
**Date**: 2026-11-10T01:56:00Z  
**Target Audience**: Parent Orchestrator (`5c040e5e-c55e-4650-ac48-960c732d710d`) & Implementation Team  
**Scope**: AI integrations, sub-5-star feedback triage (R3), consolidated opinion synthesis & evolution comparative (R5), and test design.

---

## 1. Observation

### 1.1 Existing AI Infrastructure & Gemini Integration Patterns
1. **Universal Gemini Helper & Endpoint Auto-Discovery**:
   - `artifacts/api-server/demo-server.mjs:14736-14841`: Implements `getGeminiCandidateEndpoints(apiKey)`. It prioritizes modern high-capacity models: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`.
   - `artifacts/api-server/demo-server.mjs:14843-14860`: `callGeminiGenerateContent(apiKey, contents)` performs HTTP POST to `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}` with a 15-second timeout (`AbortSignal.timeout(15000)`).
   - In `demo-server.mjs:14850-14852`, when model starts with `gemini-2.5-flash`, it injects `generationConfig = { thinkingConfig: { thinkingBudget: 0 } }` to eliminate reasoning token latency for transactional operations.
   - Cache mechanism: `_geminiListModelsCache` caches discovered endpoints for 30 minutes.
   - API key resolution hierarchy across the codebase (`demo-server.mjs:62761`, `whatsapp-ai-service.mjs:8881`):
     `process.env.GEMINI_API_KEY || db.settings?.geminiApiKey || db.whatsappAiSettings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY`.

2. **The Canonical Two-Tier AI Pattern (Zero Crash)**:
   - `artifacts/api-server/whatsapp-ai-service.mjs:11740-11935`: `interpretFiscalMessageWithLLM` demonstrates the repository's official design standard for AI-driven WhatsApp logic:
     - **Tier 1 (Online LLM)**: Call Google Gemini (or an injected `aiClientMock` / `aiGenerateFn`) with strict JSON schema instructions.
     - **Tier 2 (Local Heuristic Fallback)**: If Gemini is offline, lacks an API key, times out, or throws an error, execution immediately drops into a local deterministic regex engine (`runDeterministicFiscalLocalFallback`).
     - **Sanitization & Invariant Shielding**: LLM outputs are validated against strictly typed invariants before state mutation.

3. **Existing Review & Feedback Storage**:
   - `demo-server.mjs:62535-62565`: `initDefaultReviews()` purges legacy test mockups and initializes `db.reviews`. Reviews contain `{ id, author, guestPhone, rating, channel, date, flatMentioned, comment, sentiment, analyzed }`.
   - `demo-server.mjs:62885-62940`: `analyzeTextSentimentWithAI(text, context)` evaluates tone (`positive`, `neutral`, `negative`), extracts keywords (`positiveKeywords`, `negativeKeywords`), matches flat mentions via regex `/(?:apto|apt|flat|quarto|unidade|su[ií]te)\s*[:#º°]?\s*(\d{2,4}[a-z]?)/i`, and provides a full regex-based fallback if no Gemini key is present.
   - `zapi-service.mjs:15620-15675`: `IMPROVEMENT_CATEGORY_RULES` classifies sub-5 feedbacks into categories (`ar_climatizacao`, `banheiro_hidraulica`, `limpeza_governanca`, `tv_wifi_eletronicos`, `cozinha_eletros`, `barulho_acustica`, `atendimento_checkin`, `cafe_da_manha`).
   - `zapi-service.mjs:15744-15935`: `rebuildNpsImprovementsSummary(db, { aiGenerateFn = null })` aggregates sub-5 feedbacks across `db.npsResponses` and `db.reviews`, grouping quotes, tracking resolved items, and building an executive summary.

### 1.2 Existing WhatsApp NPS & Review Collection Flow
1. **Current 2-Step Collection Flow (Preserved per R2)**:
   - `artifacts/api-server/zapi-service.mjs:16085-16200`: `getLatestNpsSurveySentInfo(db, phone)` verifies whether a survey (`tpl_nps_satisfaction_check`) was genuinely dispatched, returning `reservationCode`, `reservationId`, and `sentAt`.
   - `artifacts/api-server/zapi-service.mjs:16252-16452`:
     - **Step 1 (Score received)**: Hóspede replies with score (1 to 5).
     - If `score === 5`: Dispatches `tpl_post_checkout_review` with Google Review link.
     - If `score <= 4`: Dispatches `tpl_nps_score_${score}` asking what could be improved, and sets `existingNps.awaitingFeedbackComment = true` with a 48-hour window.
     - If inline score + comment arrives (e.g., `"4 - faltou toalha"`), both score and comment are captured immediately.
   - `artifacts/api-server/zapi-service.mjs:16455-16558`:
     - **Step 2 (Comment received)**: Captures guest reply `cleanText`, records `existingNps.comment = cleanText`, resets `awaitingFeedbackComment = false`, calls `syncNpsCommentToReviews(db, existingNps)`, sends `tpl_nps_feedback_thanks`, alerts management, and calls `rebuildNpsImprovementsSummary(db)`.

### 1.3 Maid Automation & Cleanings Structure
1. `artifacts/api-server/maid-automation-service.mjs:173-230`: `syncMaidCredits(db, userId)` inspects `db.cleaningRequests` where `status === "clean"` and `assignedUserId === userId`.
2. `artifacts/api-server/maid-automation-service.mjs:661-666` & `810-814`: Maids are queried via `(db.users || []).filter(u => (u.role === "camareira" || u.role === "cleaner") && u.active !== false && (u.whatsapp || u.phone))`.
3. `maid-automation-service.mjs:953-990`: Scheduled cron dispatches via `sendZapiMessage(db.zapiConfig, { phone, message, channelId: "maids", recipientRole: "camareira", triggerEvent })`.

### 1.4 Testing Patterns in Codebase
1. Framework: Native Node.js test runner (`node:test`, `node:assert/strict`).
2. Determinism: `tests/nps-score-messages-and-improvements.test.mjs:16-150` tests NPS flows by injecting a mock `mockSendZapi` and an in-memory `mockDb`.
3. `tests/semantic-critique-ai.test.mjs:1-150` tests semantic parsing without live Gemini network requests by evaluating query intents and heuristic responses directly.
4. Injection parameter: `rebuildNpsImprovementsSummary(db, { aiGenerateFn = null })` accepts `aiGenerateFn` allowing unit tests to supply deterministic summaries without network overhead.
5. In accordance with `AGENTS.md`: Running `tests/*.test.mjs` or full test sweeps is strictly forbidden. Tests must be isolated and punctual.

---

## 2. Logic Chain

### 2.1 Triage Mechanism for Ratings < 5 Stars (Requirement R3)
1. **Responsibility Boundary**:
   - Guests give sub-5 ratings for diverse reasons. Some stem from maid work (uncleaned surfaces, stained linen, hair, trash, missing towels), while others stem from building infrastructure, OTA settings, or other teams (Wi-Fi dropouts, reception delays, AC compressor failures, plumbing leaks).
   - Sending non-maid criticisms (e.g., "internet caiu durante minha reunião") to maids demotivates staff and distorts cleaning accountability.
   - Therefore, the triage mechanism must evaluate whether a sub-5 review contains an actionable cleaning/maid complaint.

2. **Categorization Taxonomy**:
   - **Maid / Governança Responsibilities (FORWARD TO MAID: TRUE)**:
     - Lençol manchado ou sujo, fronha com marcas, edredom/cobertor sujo, travesseiro sem capa limpa.
     - Toalhas de banho/rosto faltando ou sujas/rasgadas.
     - Amenities ausentes (sabonete, shampoo, papel higiênico).
     - Banheiro sujo: box com gordura/manchas, vaso sanitário com respingos, pia engordurada, cabelo no ralo/chão.
     - Cozinha suja: pratos, copos e talheres com resíduos, micro-ondas ou frigobar sujos, pia engordurada.
     - Quarto com poeira, lixo não recolhido, cabelo no chão ou na cama.
     - Cheiro desagradável por falta de higienização ou ventilação adequada.
   - **Non-Maid Responsibilities (FORWARD TO MAID: FALSE)**:
     - Velocidade, oscilação ou senha do Wi-Fi / Internet.
     - Demora na portaria, fila de check-in, falta de autorização na recepção, porteiro ríspido.
     - Falhas eletromecânicas: ar-condicionado que não gela ou com barulho/dreno pingando; Smart TV / canais / pilhas de controle remoto; fechadura eletrônica travando ou senha incorreta.
     - Hidráulica predial: água do chuveiro fria ou com baixa pressão (aquecedor/caldeira predial).
     - Barulho externo: vizinhos de flat, barulho de rua, obras no condomínio, barulho de elevador.
     - Políticas de hotelaria: negativa de early check-in ou late check-out.

3. **Handling Corner Cases**:
   - **5-Star Reviews**: Always classified as eligible without LLM triage (`forwardToMaid: true`).
   - **Sub-5 with NO Comment**: If a guest rated 1-4 but never provided a comment (even after the 48h window), the system cannot verify if the issue was related to cleaning. To protect maid fairness, unelaborated ratings are withheld from the maid's daily summary until/unless a comment is supplied.
   - **Mixed Reviews** (e.g., "O quarto estava sujo e a internet lenta"): If *any* part of the criticism involves maid cleaning, `isCleaningRelated: true` and `forwardToMaid: true`, but the response isolates the cleaning aspect for the maid and dispatches the infrastructure defect to maintenance (`db.observations`).

4. **Two-Tier Engine Design**:
   - **Tier 1 (Gemini JSON Execution)**:
     - API helper: `callGeminiAi` / `callGeminiGenerateContent`.
     - Parameters: `temperature: 0.1`, `thinkingBudget: 0`.
     - Strict JSON prompt instructing the LLM to classify into typed fields.
   - **Tier 2 (Deterministic Fallback)**:
     - If API key is missing or call times out (> 4s), run regex matcher with verified dictionaries.
     - `CLEANING_REGEX`:
       `/\b(len[cç][oó]l|toalh|enxoval|cama|fronh|cobertor|edred[oó]m|amenit|sabonete|shampoo|papel\s*higi[eê]nico|lixo|lixeira|suj[oa]|sujeira|poeira|cabelo|ch[aã]o|piso|faxina|limpez|limp[oa]|higieni|box|mancha|manchad|gordur|lou[cç]a|prato|talher|copo|panela|pia\s*suja|vaso\s*sujo|banheiro\s*sujo|cheiro\s*ruim|mofo|odor|travesseir)\b/i`
     - `NON_MAID_REGEX`:
       `/\b(wi-?fi|internet|sinal|conex[aã]o|check-?in|portaria|recep[cç][aã]o|atendimento|fila|demora|libera[cç][aã]o|porteiro|ar[- ]?condicionado|split|gelando|aquecedor|press[aã]o|cano|chave|fechadura|tranca|senha|porta|barulh|ru[ií]do|obra|vizinh|som|ac[uú]stic|rua|elevador|tv|televis[aã]o|smart\s*tv|netflix|controle|estacionamento|garagem|vaga)\b/i`
     - If only cleaning matches -> `forwardToMaid: true`.
     - If only non-maid matches -> `forwardToMaid: false`.
     - If both match -> `forwardToMaid: true` (mixed).
     - If neither matches -> `forwardToMaid: false` (conservative default).

---

### 2.2 Consolidated Opinion Synthesis & Evolution Comparative (Requirement R5)
1. **Trigger Lifecycle**:
   - Whenever an eligible review is received (either a 5-star review or a sub-5 review approved by triage):
     1. Find the maid responsible for the last cleaning of that flat prior to/during the stay.
     2. Update the maid's consolidated opinion dataset.
     3. Send **Message 1**: The review itself (room, cleaning date, rating, comment).
     4. Send **Message 2**: The Mercado Livre style updated opinion synthesis with period comparative.

2. **Mercado Livre Review Synthesis Anatomy**:
   In Mercado Livre review summaries:
   - Overall cumulative rating (e.g., `4.8 / 5.0`).
   - Highlight of top praised features (e.g., "98% dos clientes elogiam o aroma e o capricho da cama").
   - Categorical attribute thermometer (recurrence of mentions & sentiment):
     - *Box do Banheiro* (limpeza, transparência, sem limo)
     - *Utensílios de Cozinha, Pratos e Talheres* (sem gordura, bem lavados)
     - *Enxoval de Cama e Banho* (brancura, maciez, cheiroso)
     - *Piso e Poeira* (aspiração, chão brilhando, sem cabelos)
   - Comparative with previous period:
     - Trend indicator (🔺 Subiu / 🔻 Desceu / ➡️ Estável).
     - Difference in score (`delta = currentAvg - previousAvg`).
     - Evolved items vs Attention items.

3. **Period Definition & Comparative Calculation**:
   - Current Period: Current month (e.g., November 2026).
   - Previous Period: Preceding calendar month (e.g., October 2026).
   - Metric definitions:
     $$\text{Média Atual} = \frac{\sum \text{Notas Elegíveis do Mês}}{\text{Total de Avaliações Elegíveis do Mês}}$$
     $$\Delta = \text{Média Atual} - \text{Média Anterior}$$
     - If $\Delta > 0$: Evolution (Evolução positiva 📈).
     - If $\Delta < 0$: Regression (Oscilação com pontos de atenção 📉).
     - If $\Delta = 0$: Stable (Desempenho consistente ➡️).

4. **Incremental Update Strategy**:
   - Rather than scanning thousands of historical records on every WhatsApp message, the system maintains a persisted state in `db.maidOpinionSynthesis[maidId]`.
   - On arrival of an eligible review:
     1. Retrieve existing synthesis record for `maidId`.
     2. Update running totals: `currentPeriod.sumScores += score`, `currentPeriod.totalCount += 1`, `avgScore = (sumScores / totalCount).toFixed(1)`.
     3. Run keyword tally on the comment to increment item recurrence:
        - Box do Banheiro: `/(box|blindex|chuveiro|ralo|vidro do banheiro)/i`
        - Louças e Utensílios: `/(lou[cç]a|prato|talher|copo|panela|frigobar|cozinha)/i`
        - Enxoval: `/(len[cç][oó]l|toalh|cama|travesseiro|fronh|edred[oó]m)/i`
        - Piso e Poeira: `/(piso|ch[aã]o|poeira|cabelo|aspira)/i`
     4. Compare `avgScore` with `previousPeriod.avgScore`.
     5. Generate the Mercado Livre formatted text block (via Tier 1 Gemini summary or Tier 2 template formatter).
     6. Save `db.maidOpinionSynthesis` and dispatch WhatsApp message.

---

## 3. Caveats
1. **Unanswered Sub-5 Ratings**: If a guest inputs a score of 1 to 4 but fails to send any text comment within the 48-hour window, the system must not guess. It treats the feedback as pending/unclassified for the maid, avoiding unjustified penalization.
2. **Channel Diversity**: While most ratings arrive via WhatsApp NPS, some arrive via OTA import (`/api/ai/import-review`). The triage engine must be decoupled from the transport channel so it can process both WhatsApp and imported OTA reviews identically.
3. **Historical Data for Previous Period**: If a newly onboarded maid has no reviews in the previous month (e.g., started in November), `previousPeriod` is marked as `"Sem histórico anterior"`, and the comparative displays `"Primeiro período de consolidação"` instead of an erroneous zero delta.
4. **Twin Parity Compliance**: Code implemented in `artifacts/api-server/` must be mirrored to `scripts/` using automated file copying to maintain SHA-256 parity as required by `AGENTS.md`.

---

## 4. Conclusion & Actionable Design

### 4.1 Schema Contracts

```typescript
// Contrato de Triagem de Avaliação (< 5 estrelas)
export interface FeedbackTriageResult {
  isCleaningRelated: boolean;
  category: "maid_cleaning" | "non_maid_infrastructure" | "non_maid_checkin_service" | "non_maid_external_noise" | "mixed";
  primaryResponsibility: "camareira" | "hotel_gestao" | "manutencao" | "recepcao_portaria" | "externo";
  forwardToMaid: boolean;
  cleaningAspects: string[];
  nonCleaningAspects: string[];
  explanation: string;
  triageMethod: "gemini_llm" | "deterministic_fallback";
}

// Estrutura Persistida da Síntese de Opiniões da Camareira (db.maidOpinionSynthesis[maidId])
export interface MaidOpinionSynthesis {
  maidId: number;
  maidName: string;
  lastUpdated: string;
  currentPeriod: {
    label: string; // Ex: "Novembro/2026"
    startDate: string;
    endDate: string;
    totalReviews: number;
    avgScore: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
    itemRecurrence: {
      boxBanheiro: { mentions: number; positiveCount: number; negativeCount: number };
      utensiliosCozinha: { mentions: number; positiveCount: number; negativeCount: number };
      enxovalCamaBanho: { mentions: number; positiveCount: number; negativeCount: number };
      pisoPoeira: { mentions: number; positiveCount: number; negativeCount: number };
    };
    positiveHighlights: string[];
    attentionPoints: string[];
  };
  previousPeriod: {
    label: string; // Ex: "Outubro/2026"
    totalReviews: number;
    avgScore: number;
  };
  evolution: {
    delta: number;
    trend: "evolucao" | "estabilidade" | "regressao";
    summaryText: string;
  };
}
```

### 4.2 Two-Tier Triage Prompt & Function Signature
```javascript
export async function triageSub5Review({ score, comment, flatNumber, guestName, db = null, aiClientMock = null }) {
  // Se não há comentário, não encaminha para a camareira (presunção de não responsabilidade)
  if (!comment || !comment.trim()) {
    return {
      isCleaningRelated: false,
      forwardToMaid: false,
      explanation: "Avaliação sem comentário explicativo pelo hóspede.",
      triageMethod: "deterministic_fallback"
    };
  }

  // TIER 1: Gemini com prompt estrito em JSON
  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey;
  if (apiKey || aiClientMock) {
    const prompt = `Você é um auditor de hospitalidade do hotel CorpFlats.
Analise a crítica de um hóspede que avaliou com nota ${score} de 5 estrelas:
Comentário: "${comment}"
Unidade: Flat ${flatNumber || "N/A"}

Classifique se a reclamação é de responsabilidade da CAMAREIRA (limpeza, enxoval, amenidades, louças, box do banheiro, pó, lixo) ou de OUTROS SETORES (wi-fi, check-in, portaria, ar condicionado quebrado, chuveiro frio/pressão, fechadura, barulho).

Responda ESTRITAMENTE em JSON:
{
  "isCleaningRelated": boolean,
  "forwardToMaid": boolean,
  "category": "maid_cleaning" | "non_maid_infrastructure" | "non_maid_checkin_service" | "non_maid_external_noise" | "mixed",
  "primaryResponsibility": "camareira" | "hotel_gestao" | "manutencao" | "recepcao_portaria" | "externo",
  "cleaningAspects": ["lençol sujo"],
  "nonCleaningAspects": ["wi-fi lento"],
  "explanation": "resumo conciso de 1 frase"
}`;
    // Executa e valida o JSON retornado...
  }

  // TIER 2: Deterministic Regex Fallback (Zero Crash)
  return runDeterministicTriageFallback(score, comment);
}
```

### 4.3 Format of Mercado Livre Style Messages to Maid
**Mensagem 1 (A Avaliação Recebida):**
```text
🌟 *Nova Avaliação Recebida!* 🧹

Olá, *Cris*!
Um hóspede acabou de avaliar a estadia no quarto que você higienizou:

🏢 *Quarto:* Flat 605
📅 *Data da Limpeza:* 08/11/2026
⭐ *Nota Recebida:* 5 de 5 ⭐⭐⭐⭐⭐
💬 *Comentário do Hóspede:*
"O flat estava impecável! Cama super cheirosa e o banheiro brilhando. Parabéns!"

Muito obrigado pelo seu capricho diário! ✨
```

**Mensagem 2 (Síntese Consolidada & Comparativo de Evolução — Mercado Livre):**
```text
📊 *Síntese de Opiniões dos Hóspedes • CorpFlats* 🛍️
_Resumo Consolidado de Limpeza • Atualizado em tempo real_

⭐ *Sua Nota Média de Limpeza:* *4.9* / 5.0 (26 avaliações em Novembro)
⭐⭐⭐⭐⭐ (92% de avaliações 5 estrelas)

✨ *O que os hóspedes mais elogiam:*
• Cama aconchegante, lençóis e toalhas muito cheirosos
• Banheiro higienizado e box de vidro transparente
• Cozinha com louças e talheres impecáveis

🔍 *Termômetro dos Itens Mais Citados:*
🛏️ *Enxoval (lençóis e toalhas):* 100% positivo (18 menções)
🚿 *Box e Banheiro:* 94% positivo (16 menções)
🍽️ *Pratos, Talheres e Copos:* 95% positivo (12 menções)
🧹 *Piso e Superfícies:* 98% positivo (14 menções)

📈 *Comparativo com o Mês Anterior (Outubro/2026):*
• Média anterior: *4.7* ➔ Média atual: *4.9* (🔺 *Evolução de +0.2 pontos! Sua média subiu!*)
• 🟢 *Destaque de Evolução:* Houve melhora notável nas menções sobre louças e utensílios de cozinha.
• 🟡 *Ponto de Atenção:* Manter o cuidado especial com os cantos do box do banheiro.

Parabéns pelo excelente trabalho! 👏🌟
```

---

## 5. Verification Method

### 5.1 Independent Code & Data Verification
1. Inspect universal Gemini callers:
   - Check `artifacts/api-server/demo-server.mjs` line 14736 for candidate endpoints auto-discovery.
   - Check line 14850 for `thinkingBudget: 0` on `gemini-2.5-flash`.
2. Inspect sentiment & improvement categorization:
   - Check `artifacts/api-server/zapi-service.mjs` line 15620 (`IMPROVEMENT_CATEGORY_RULES`).
   - Check line 15744 (`rebuildNpsImprovementsSummary`).
   - Check line 16460 for guest comment ingestion.
3. Inspect testing patterns:
   - View `tests/nps-score-messages-and-improvements.test.mjs`. Note the mock Z-API pattern and pure in-memory test runner.

### 5.2 Test Blueprint for Implementation
The implementation team should create a single dedicated test file:
`tests/maid-review-ai-synthesis.test.mjs`
To be executed strictly via:
```powershell
node --test tests/maid-review-ai-synthesis.test.mjs
```
The test must cover:
1. **5-star review**: Verify automatic forwarding without triage (`forwardToMaid: true`).
2. **Sub-5 cleaning review** (e.g., "lençol com mancha e toalha faltando"): Verify classified as `forwardToMaid: true`.
3. **Sub-5 non-maid review** (e.g., "Wi-Fi caiu e demorou no check-in"): Verify classified as `forwardToMaid: false` (discarded from maid summary).
4. **Mixed review** (e.g., "Banheiro sujo e ar condicionado não gela"): Verify classified as `forwardToMaid: true` with cleaning aspect identified.
5. **Mercado Livre synthesis calculation**: Verify average score, item recurrence percentages, and period-over-period delta calculation (e.g., `4.7` vs `4.9` -> `+0.2` evolucao).
6. **Zero-Crash Fallback**: Verify that when `aiClientMock` throws or apiKey is null, the deterministic regex engine classifies identical inputs with 100% precision.
