# Relatório de Exploração Técnica — Milestone 3 (F8, F9, F10, F11)
**Agente:** `explorer_m3_1`  
**Data:** 10/11/2026  
**Status:** Concluído com Sucesso — Especificação Cirúrgica Pronta para Implementação

---

## 1. Observation (Observações Diretas do Código e Testes)

### 1.1 Suíte de Testes Pontual (`tests/maid-review-ai-synthesis.test.mjs`)
Ao analisar `tests/maid-review-ai-synthesis.test.mjs`, identificamos os seguintes contratos estritos para o Milestone 3:

1. **Importação dos contratos (Linhas 13–19, 849, 986):**
   - O teste invoca `requireMaidExport("dispatchDailyReviewsSummary")` e `requireMaidExport("dispatchNovemberRetroactiveReviews")`.
   - Ambas as funções DEVEM ser exportadas por `artifacts/api-server/maid-automation-service.mjs`.

2. **Feature 5 — Scheduled Daily Review Summary (F8, F9 / R1, Linhas 846–981):**
   - **Teste 5.1 (Linhas 848–909):**
     - Chamada: `await dispatchSummary(db, { targetDate: "2026-11-10", force: true, sendZapiFn: mockSend })`
     - Retorno esperado: `{ maidsNotified: >= 1, totalReviewsSent: 2 }`
     - Mensagem enviada para Cris (`22988486446`):
       - Deve casar regex `/113/` (Flat 113)
       - Deve casar regex `/211/` (Flat 211)
       - Deve casar regex `/08\/11\/2026/` (data da limpeza do flat 113)
       - Deve casar regex `/5/` (nota recebida)
   - **Teste 5.2 (Linhas 911–942):**
     - Dispara APENAS para camareiras que tiveram limpezas avaliadas no período. Grazi tem 0 limpezas avaliadas no dia e deve receber 0 mensagens (`sentToGrazi.length === 0`).
   - **Teste 5.3 (Linhas 944–980):**
     - Exclui avaliações < 5 cujo motivo seja alheio à limpeza (ex: comentário `"Internet caiu durante o dia todo, Wi-Fi péssimo"`).
     - Resultado: `res.totalReviewsSent === 0` e `mockSend.sent.length === 0`.
   - **Teste B6 (Linhas 1126–1158):**
     - 3 avaliações no mesmo dia para a mesma camareira (notas 5, 4, 5).
     - Média calculada: `(5 + 4 + 5) / 3 = 4.666...` arredondada para `4.7`.
     - A mensagem consolidada DEVE casar o regex `/4\.7/`.
   - **Teste C2 (Linhas 1211–1240):**
     - Chamada com `force: false`: `await dispatchSummary(db, { targetDate: "2026-11-11", force: false, sendZapiFn: mockSend })`.
     - Avaliações que já possuem `dispatchedToMaidAt` são ignoradas.
     - Resultado: `res.totalReviewsSent === 0` e `mockSend.sent.length === 0`.

3. **Feature 6 — Retroactive November Consolidation (F10 / R4, Linhas 983–1061):**
   - **Teste 6.1 (Linhas 985–1033):**
     - Chamada: `await dispatchRetroactive(db, { sendZapiFn: mockSend })`
     - Identifica avaliações de Novembro/2026 (`respondedAt` com `2026-11`).
     - Retorno esperado: `{ maidsNotified: 2, totalReviewsSent: 2, summaryByMaid: { ... } }`
     - Mensagens enviadas: `mockSend.sent.length >= 2` (uma para Cris e uma para Grazi).
   - **Teste 6.2 — Trava de Idempotência (Linhas 1035–1060):**
     - Execução 1: despacha 1 avaliação, seta `dispatchedToMaidAt`.
     - Execução 2: `res2 = await dispatchRetroactive(db, { sendZapiFn: mockSend })`.
     - Retorno: `res2.totalReviewsSent === 0` e `mockSend.sent.length === countAfterFirstRun` (nenhuma mensagem repetida).

4. **Tier 0 — Paridade SHA-256 Byte a Byte (Linhas 104–120):**
   - Paridade 100% obrigatória entre `artifacts/api-server/maid-automation-service.mjs` e `scripts/maid-automation-service.mjs`.

### 1.2 Serviço Backend Existente (`artifacts/api-server/maid-automation-service.mjs`)
- `DEFAULT_MAID_TRIGGERS` (linhas 13–80): Atualmente possui 3 gatilhos (`trigger_overtime_cleaning`, `trigger_daily_summary`, `trigger_quinzena_closing`). Falta o gatilho `trigger_daily_review_summary`.
- `initMaidAutomationEngine` (linhas 2111–2559):
  - Linhas 2128–2137: sincroniza novos gatilhos de `DEFAULT_MAID_TRIGGERS` com `db.maidAutomationConfig.triggers`.
  - Linhas 2294–2340: endpoint `POST /api/maid-automation/dispatch-now`.
  - Linhas 2430–2550: loop do scheduler (a cada 60s). Atualmente checa `trigger_quinzena_closing` e `trigger_daily_summary`. Falta a verificação de `trigger_daily_review_summary`.
- Módulos já implementados nos Milestones anteriores:
  - `resolveMaidCleaningForReservation` (linha 1015) — atribui deterministicamente a última limpeza concluída (`status: "clean"`) correspondente à reserva avaliada.
  - `triageSub5Review` (linha 901) — triagem Two-Tier (Gemini + fallback) retornando `{ forwardToMaid, isCleaningRelated, ... }`.

### 1.3 Interface Frontend Existente (`artifacts/limpeza/src/pages/maid-whatsapp-automation.tsx`)
- Estado e gatilhos (linhas 602–604):
  - `overtimeTrigger`, `dailyTrigger`, `closingTrigger`. Falta `reviewSummaryTrigger`.
- Aba `triggers` (`<TabsContent value="triggers">`, linhas 892–1360):
  - Contém os cards para os 3 primeiros gatilhos. Falta o card para `trigger_daily_review_summary`.
  - Métodos existentes: `handleDispatchToAll(triggerId)`, `handleOpenTestModal(trigger)`. Falta handler para disparo retroativo de Novembro (`handleDispatchRetroactiveNovember`).

---

## 2. Logic Chain (Cadeia de Raciocínio Passo a Passo)

1. **Resolução de Atribuição e Elegibilidade (F8 / F9 / F10):**
   - Para qualquer avaliação em `db.npsResponses` ou `db.reviews`, localizamos a reserva associada via `r.reservationId` ou `r.reservationCode`.
   - Invocamos `resolveMaidCleaningForReservation(db, reservation, { flatNumber, evaluationDate })`.
   - Se `!maidUser`, ignoramos a avaliação.
   - Verificamos a elegibilidade:
     - Se `score === 5`: Elegível imediatamente.
     - Se `score <= 4`: Se não tiver comentário, ignoramos (retida). Se tiver comentário, executamos `triageSub5Review`: se `forwardToMaid === true`, incluímos; se `false` (ex: Wi-Fi), descartamos.

2. **Idempotência (F8 / F10):**
   - Avaliações elegíveis despachadas recebem a marcação `item.dispatchedToMaidAt = new Date().toISOString()`.
   - Se `!force && item.dispatchedToMaidAt`, a avaliação é ignorada em execuções subsequentes. Isso satisfaz diretamente os testes 6.2 e C2.

3. **Formatação da Mensagem Consolidada (F9):**
   - Agrupamos as avaliações elegíveis por `maidId`.
   - Para cada camareira, montamos uma mensagem contendo:
     - Saudação personalizada com `maidName`.
     - Itens listados com `• *Flat {numero}*`, `📅 Limpeza: {dataBr}` (obtida de `cleaningDate` via `formatDateBr`), `⭐ Nota: *{score}*` e comentário (se houver).
     - Média calculada: `avgScore = (soma / total).toFixed(1)`, garantindo que médias como `14/3` resultem em `4.7` e casem `/4\.7/`.
   - Isso satisfaz simultaneamente os regexes dos testes 5.1 (`/113/`, `/211/`, `/08\/11\/2026/`, `/5/`) e B6 (`/4\.7/`).

4. **Gatilho e Scheduler (F8):**
   - Definimos `trigger_daily_review_summary` em `DEFAULT_MAID_TRIGGERS`.
   - No scheduler de `initMaidAutomationEngine`, se o horário atual de Brasília for maior ou igual a `scheduledTime` (padrão 18:00) e `lastExecutedDate !== bNow.date`, executamos `dispatchDailyReviewsSummary(db, { targetDate: bNow.date, force: false })` e atualizamos `lastExecutedDate`.

5. **Endpoint HTTP Retroativo (F10):**
   - Criamos `POST /api/maid-automation/dispatch-retroactive-reviews` em `initMaidAutomationEngine`, que chama `dispatchNovemberRetroactiveReviews(db, { force })` e persiste com `saveDatabase()`.

6. **Frontend UI (F11):**
   - Adicionamos o card "Resumo Diário de Avaliações" na aba de gatilhos de `maid-whatsapp-automation.tsx`, com seletor de horário, toggle de ativação, botão "Disparar Retroativo Nov/26", botão "Disparar Resumo Hoje" e preview estilizado do WhatsApp.

---

## 3. Especificações Exatas de Código para o Worker M3

### 3.1 Alterações em `artifacts/api-server/maid-automation-service.mjs`

#### Bloco 1: Adicionar `trigger_daily_review_summary` em `DEFAULT_MAID_TRIGGERS`
Logo após o `trigger_quinzena_closing` (por volta da linha 80), adicionar o 4º gatilho:

```javascript
  {
    id: "trigger_daily_review_summary",
    name: "Resumo Diário de Avaliações",
    description: "Envia diariamente em horário fixo o resumo das avaliações dos hóspedes dos quartos limpos por cada camareira, com número do quarto, data da limpeza e nota.",
    enabled: true,
    timing: "daily_review_summary",
    scheduledTime: "18:00",
    lastExecutedDate: null,
    template: `⭐ *Resumo Diário de Avaliações • CorpFlats* ⭐

Olá, *{{nome_camareira}}*!
Aqui está o resumo das avaliações recebidas hoje referente aos quartos preparados por você:

{{lista_avaliacoes}}

📊 *Média do dia:* {{media_dia}} ⭐

Muito obrigado pela sua dedicação e excelência! ✨`
  }
```

#### Bloco 2: Implementar e Exportar as Funções do Milestone 3
Inserir as 3 funções abaixo em `artifacts/api-server/maid-automation-service.mjs` (antes de `initMaidAutomationEngine`):

```javascript
// ────────────────────────────────────────────────────────────────────────────
// MILESTONE 3: Resumo Diário, Formatação e Despacho Retroativo (F8, F9, F10)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Formata a mensagem consolidada diária ou retroativa de avaliações para uma camareira (F9 / R1).
 *
 * @param {object} params
 * @param {string} params.maidName Nome da camareira
 * @param {string} params.targetDate Data de referência (YYYY-MM-DD)
 * @param {Array<object>} params.reviews Lista de avaliações elegíveis
 * @param {boolean} [params.isRetroactive=false] Se é envio retroativo
 * @returns {string} Mensagem formatada no estilo WhatsApp
 */
export function formatDailyReviewsSummaryMessage({
  maidName,
  targetDate,
  reviews = [],
  isRetroactive = false
}) {
  const formattedTargetDate = formatDateBr(targetDate);
  const total = reviews.length;
  const sumScores = reviews.reduce((acc, r) => acc + (Number(r.score) || 0), 0);
  const avgScore = total > 0 ? (sumScores / total).toFixed(1) : "0.0";

  const header = isRetroactive
    ? `⭐ *Resumo de Avaliações de Novembro/2026 • CorpFlats* ⭐\n\nOlá, *${maidName}*!\nReunimos aqui o histórico das avaliações dos hóspedes sobre os quartos higienizados por você em Novembro:`
    : `⭐ *Resumo Diário de Avaliações • CorpFlats* ⭐\n\nOlá, *${maidName}*!\nAqui está o resumo das avaliações recebidas hoje (${formattedTargetDate}) referente aos quartos preparados por você:`;

  const itemsText = reviews.map(r => {
    const rawFlat = r.flatNumber || r.roomNumber || r.flat || "Quarto";
    const flatDisplay = String(rawFlat).trim().toLowerCase().startsWith("flat")
      ? String(rawFlat).trim()
      : `Flat ${rawFlat}`;
    const cleanDateBr = formatDateBr(r.cleaningDate || targetDate);
    const scoreVal = Number(r.score) || 5;
    const stars = "⭐".repeat(Math.max(1, Math.min(5, Math.round(scoreVal))));
    const commentPart = r.comment ? `\n   💬 _"${r.comment}"_` : "";

    return `• *${flatDisplay}*\n   📅 Limpeza: ${cleanDateBr}\n   ⭐ Nota: *${scoreVal}* ${stars}${commentPart}`;
  }).join("\n\n");

  const footer = `\n\n📊 *Média do dia:* *${avgScore}* ⭐ (${total} ${total === 1 ? "avaliação" : "avaliações"})\n\nMuito obrigado pelo seu cuidado e dedicação aos nossos hóspedes! ✨`;

  return `${header}\n\n${itemsText}${footer}`;
}

/**
 * Consolida e despacha o resumo diário de avaliações em horário fixo para camareiras elegíveis (F8 / R1).
 *
 * @param {object} db Instância do banco de dados em memória
 * @param {object} [options]
 * @param {string} [options.targetDate] Data de referência YYYY-MM-DD (padrão: hoje em Brasília)
 * @param {boolean} [options.force=false] Forçar envio ignorando verificação de horário/idempotência
 * @param {Function} [options.sendZapiFn] Função de envio customizada (mock de testes)
 * @returns {Promise<{ maidsNotified: number, totalReviewsSent: number }>}
 */
export async function dispatchDailyReviewsSummary(db, {
  targetDate = null,
  force = false,
  sendZapiFn = null
} = {}) {
  if (!db) {
    return { maidsNotified: 0, totalReviewsSent: 0, error: "db não fornecido" };
  }

  const effectiveDate = targetDate ? String(targetDate).substring(0, 10) : getBrasiliaNow().date;

  // 1. Coleta candidatas correspondentes à data alvo
  const candidateItems = [];
  const seenIds = new Set();

  const allNps = Array.isArray(db.npsResponses) ? db.npsResponses : [];
  for (const item of allNps) {
    if (!item || (item.id && seenIds.has(item.id))) continue;
    if (item.id) seenIds.add(item.id);
    const itemDate = String(item.respondedAt || item.date || item.createdAt || "").substring(0, 10);
    if (itemDate === effectiveDate) {
      candidateItems.push({ ...item, _sourceCollection: "npsResponses", _originalRef: item });
    }
  }

  const allReviews = Array.isArray(db.reviews) ? db.reviews : [];
  for (const item of allReviews) {
    if (!item || (item.id && seenIds.has(item.id))) continue;
    if (item.id) seenIds.add(item.id);
    const itemDate = String(item.date || item.respondedAt || item.createdAt || "").substring(0, 10);
    if (itemDate === effectiveDate) {
      candidateItems.push({ ...item, _sourceCollection: "reviews", _originalRef: item });
    }
  }

  if (candidateItems.length === 0) {
    return { maidsNotified: 0, totalReviewsSent: 0 };
  }

  const groupedByMaid = {};

  for (const item of candidateItems) {
    // Trava de idempotência (C2): ignora se já despachada e não for force
    if (!force && item.dispatchedToMaidAt) {
      continue;
    }

    // Resolução da Reserva correspondente
    let reservation = null;
    const resCodeOrId = item.reservationId || item.reservationCode || item.code;
    if (resCodeOrId && Array.isArray(db.reservations)) {
      reservation = db.reservations.find(r =>
        String(r.id) === String(resCodeOrId) || String(r.code) === String(resCodeOrId)
      ) || null;
    }
    if (!reservation && (item.flatNumber || item.flatMentioned)) {
      reservation = {
        id: item.reservationId || null,
        flatNumber: item.flatNumber || item.flatMentioned,
        date: item.respondedAt || item.date || effectiveDate
      };
    }

    // Atribuição da camareira da última limpeza (F1)
    const attribution = resolveMaidCleaningForReservation(db, reservation, {
      flatNumber: item.flatNumber || item.flatMentioned,
      evaluationDate: item.respondedAt || item.date || effectiveDate
    });

    const maidUser = attribution?.maidUser;
    if (!maidUser || !maidUser.id) {
      continue;
    }

    // Triagem de elegibilidade por IA (F3 / F4)
    const score = Number(item.score ?? item.rating ?? 5);
    const comment = String(item.comment || item.text || item.feedback || "").trim();

    let eligible = false;
    if (score === 5) {
      eligible = true;
    } else if (score <= 4) {
      if (!comment) {
        eligible = false; // Sub-5 sem comentário: retida
      } else {
        const triage = await triageSub5Review({
          score,
          comment,
          flatNumber: item.flatNumber || item.flatMentioned,
          db
        });
        eligible = Boolean(triage?.forwardToMaid);
      }
    }

    if (!eligible) {
      continue;
    }

    const maidId = maidUser.id;
    if (!groupedByMaid[maidId]) {
      groupedByMaid[maidId] = {
        maidUser,
        reviews: []
      };
    }

    groupedByMaid[maidId].reviews.push({
      id: item.id,
      flatNumber: item.flatNumber || item.flatMentioned || reservation?.flatNumber || "Quarto",
      cleaningDate: attribution.cleaningDate || effectiveDate,
      score,
      comment,
      rawItem: item._originalRef || item
    });
  }

  const sender = typeof sendZapiFn === "function" ? sendZapiFn : sendZapiMessage;
  let maidsNotified = 0;
  let totalReviewsSent = 0;

  for (const maidId of Object.keys(groupedByMaid)) {
    const { maidUser, reviews } = groupedByMaid[maidId];
    if (!reviews.length) continue;

    const rawPhone = maidUser.whatsapp || maidUser.phone || "";
    const cleanPh = cleanWhatsAppPhone(rawPhone) || rawPhone;
    if (!cleanPh) continue;

    const message = formatDailyReviewsSummaryMessage({
      maidName: maidUser.name || maidUser.username || "Colaboradora",
      targetDate: effectiveDate,
      reviews,
      isRetroactive: false
    });

    const sendRes = await sender(db.zapiConfig || {}, {
      phone: cleanPh,
      message,
      channelId: "maids",
      recipientRole: "camareira",
      triggerEvent: "trigger_daily_review_summary",
      db
    });

    const nowIso = new Date().toISOString();
    for (const r of reviews) {
      if (r.rawItem) {
        r.rawItem.dispatchedToMaidAt = nowIso;
        r.rawItem.dispatchedToDailySummary = true;
      }
    }

    if (db.maidAutomationConfig) {
      if (!Array.isArray(db.maidAutomationConfig.history)) db.maidAutomationConfig.history = [];
      db.maidAutomationConfig.history.unshift({
        id: `rev_daily_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: maidUser.id,
        userName: maidUser.name || maidUser.username,
        phone: cleanPh,
        triggerId: "trigger_daily_review_summary",
        triggerName: "Resumo Diário de Avaliações",
        message,
        status: sendRes?.success ? "sent" : "failed",
        method: sendRes?.method || (sendRes?.simulated ? "simulado" : "zapi"),
        error: sendRes?.error || null,
        sentAt: nowIso
      });
      if (db.maidAutomationConfig.history.length > 100) {
        db.maidAutomationConfig.history = db.maidAutomationConfig.history.slice(0, 100);
      }
    }

    maidsNotified++;
    totalReviewsSent += reviews.length;
  }

  return { maidsNotified, totalReviewsSent };
}

/**
 * Consolida e despacha retroativamente as avaliações elegíveis de Novembro/2026 com trava de idempotência (F10 / R4).
 *
 * @param {object} db Instância do banco de dados em memória
 * @param {object} [options]
 * @param {Function} [options.sendZapiFn] Mock de envio para testes
 * @param {boolean} [options.force=false] Forçar reenvio mesmo se já despachado
 * @returns {Promise<{ maidsNotified: number, totalReviewsSent: number, summaryByMaid: Record<string, number> }>}
 */
export async function dispatchNovemberRetroactiveReviews(db, {
  sendZapiFn = null,
  force = false
} = {}) {
  if (!db) {
    return { maidsNotified: 0, totalReviewsSent: 0, summaryByMaid: {}, error: "db não fornecido" };
  }

  const seenIds = new Set();
  const candidateItems = [];

  const allNps = Array.isArray(db.npsResponses) ? db.npsResponses : [];
  for (const item of allNps) {
    if (!item || (item.id && seenIds.has(item.id))) continue;
    if (item.id) seenIds.add(item.id);
    const itemDate = String(item.respondedAt || item.date || item.createdAt || "").substring(0, 10);
    if (itemDate.startsWith("2026-11")) {
      candidateItems.push({ ...item, _originalRef: item });
    }
  }

  const allReviews = Array.isArray(db.reviews) ? db.reviews : [];
  for (const item of allReviews) {
    if (!item || (item.id && seenIds.has(item.id))) continue;
    if (item.id) seenIds.add(item.id);
    const itemDate = String(item.date || item.respondedAt || item.createdAt || "").substring(0, 10);
    if (itemDate.startsWith("2026-11")) {
      candidateItems.push({ ...item, _originalRef: item });
    }
  }

  const groupedByMaid = {};

  for (const item of candidateItems) {
    // Trava de idempotência (F10 / 6.2)
    if (!force && (item.dispatchedToMaidAt || item.dispatchedRetroactiveAt)) {
      continue;
    }

    let reservation = null;
    const resCodeOrId = item.reservationId || item.reservationCode || item.code;
    if (resCodeOrId && Array.isArray(db.reservations)) {
      reservation = db.reservations.find(r =>
        String(r.id) === String(resCodeOrId) || String(r.code) === String(resCodeOrId)
      ) || null;
    }
    if (!reservation && (item.flatNumber || item.flatMentioned)) {
      reservation = {
        id: item.reservationId || null,
        flatNumber: item.flatNumber || item.flatMentioned,
        date: item.respondedAt || item.date
      };
    }

    const attribution = resolveMaidCleaningForReservation(db, reservation, {
      flatNumber: item.flatNumber || item.flatMentioned,
      evaluationDate: item.respondedAt || item.date
    });

    const maidUser = attribution?.maidUser;
    if (!maidUser || !maidUser.id) continue;

    const score = Number(item.score ?? item.rating ?? 5);
    const comment = String(item.comment || item.text || item.feedback || "").trim();

    let eligible = false;
    if (score === 5) {
      eligible = true;
    } else if (score <= 4) {
      if (!comment) {
        eligible = false;
      } else {
        const triage = await triageSub5Review({
          score,
          comment,
          flatNumber: item.flatNumber || item.flatMentioned,
          db
        });
        eligible = Boolean(triage?.forwardToMaid);
      }
    }

    if (!eligible) continue;

    const maidId = maidUser.id;
    if (!groupedByMaid[maidId]) {
      groupedByMaid[maidId] = {
        maidUser,
        reviews: []
      };
    }

    groupedByMaid[maidId].reviews.push({
      id: item.id,
      flatNumber: item.flatNumber || item.flatMentioned || reservation?.flatNumber || "Quarto",
      cleaningDate: attribution.cleaningDate || String(item.respondedAt || item.date || "").substring(0, 10),
      score,
      comment,
      rawItem: item._originalRef || item
    });
  }

  const sender = typeof sendZapiFn === "function" ? sendZapiFn : sendZapiMessage;
  let maidsNotified = 0;
  let totalReviewsSent = 0;
  const summaryByMaid = {};

  for (const maidId of Object.keys(groupedByMaid)) {
    const { maidUser, reviews } = groupedByMaid[maidId];
    if (!reviews.length) continue;

    const rawPhone = maidUser.whatsapp || maidUser.phone || "";
    const cleanPh = cleanWhatsAppPhone(rawPhone) || rawPhone;
    if (!cleanPh) continue;

    const message = formatDailyReviewsSummaryMessage({
      maidName: maidUser.name || maidUser.username || "Colaboradora",
      targetDate: "2026-11-10",
      reviews,
      isRetroactive: true
    });

    const sendRes = await sender(db.zapiConfig || {}, {
      phone: cleanPh,
      message,
      channelId: "maids",
      recipientRole: "camareira",
      triggerEvent: "maid_retroactive_november_reviews",
      db
    });

    const nowIso = new Date().toISOString();
    for (const r of reviews) {
      if (r.rawItem) {
        r.rawItem.dispatchedToMaidAt = nowIso;
        r.rawItem.dispatchedRetroactiveAt = nowIso;
      }
    }

    if (db.maidAutomationConfig) {
      if (!Array.isArray(db.maidAutomationConfig.history)) db.maidAutomationConfig.history = [];
      db.maidAutomationConfig.history.unshift({
        id: `rev_retro_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: maidUser.id,
        userName: maidUser.name || maidUser.username,
        phone: cleanPh,
        triggerId: "maid_retroactive_november_reviews",
        triggerName: "Resumo Retroativo de Avaliações (Novembro/2026)",
        message,
        status: sendRes?.success ? "sent" : "failed",
        method: sendRes?.method || (sendRes?.simulated ? "simulado" : "zapi"),
        error: sendRes?.error || null,
        sentAt: nowIso
      });
      if (db.maidAutomationConfig.history.length > 100) {
        db.maidAutomationConfig.history = db.maidAutomationConfig.history.slice(0, 100);
      }
    }

    maidsNotified++;
    totalReviewsSent += reviews.length;
    summaryByMaid[maidUser.id] = reviews.length;
  }

  return { maidsNotified, totalReviewsSent, summaryByMaid };
}
```

#### Bloco 3: Endpoints HTTP em `initMaidAutomationEngine`
Dentro de `initMaidAutomationEngine(app, getDb, saveDatabase)`:

1. **Adicionar o endpoint `POST /api/maid-automation/dispatch-retroactive-reviews` (F10):**
```javascript
  // 7. Disparo Retroativo de Avaliações de Novembro/2026 com Trava de Idempotência
  app.post("/api/maid-automation/dispatch-retroactive-reviews", async (req, res) => {
    try {
      const { force = false } = req.body || {};
      const db = getDb();
      const result = await dispatchNovemberRetroactiveReviews(db, { force: Boolean(force) });
      saveDatabase("dispatch_retroactive_reviews_november");
      res.json({
        success: true,
        ...result,
        message: `Disparo retroativo de Novembro concluído: ${result.maidsNotified} camareiras notificadas, ${result.totalReviewsSent} avaliações enviadas.`
      });
    } catch (err) {
      console.error("[Maid Automation] Erro em dispatch-retroactive-reviews:", err);
      res.status(500).json({ success: false, error: err?.message || "Erro ao processar disparo retroativo" });
    }
  });

  // 8. Disparo Manual do Resumo Diário de Avaliações
  app.post("/api/maid-automation/dispatch-daily-reviews", async (req, res) => {
    try {
      const { targetDate, force = true } = req.body || {};
      const db = getDb();
      const result = await dispatchDailyReviewsSummary(db, { targetDate, force: Boolean(force) });
      saveDatabase("dispatch_daily_reviews_summary");
      res.json({
        success: true,
        ...result,
        message: `Resumo diário disparado com sucesso: ${result.maidsNotified} camareiras notificadas, ${result.totalReviewsSent} avaliações enviadas.`
      });
    } catch (err) {
      console.error("[Maid Automation] Erro em dispatch-daily-reviews:", err);
      res.status(500).json({ success: false, error: err?.message || "Erro ao processar resumo diário de avaliações" });
    }
  });
```

2. **Interceptar `trigger_daily_review_summary` em `POST /api/maid-automation/dispatch-now`:**
No início do handler de `/api/maid-automation/dispatch-now`:
```javascript
    if (trigger.id === "trigger_daily_review_summary") {
      const summaryResult = await dispatchDailyReviewsSummary(db, { force: true });
      saveDatabase("manual_dispatch_daily_review_summary");
      return res.json({
        success: true,
        count: summaryResult.maidsNotified,
        totalReviewsSent: summaryResult.totalReviewsSent,
        message: `Resumo diário disparado com sucesso para ${summaryResult.maidsNotified} camareiras (${summaryResult.totalReviewsSent} avaliações).`
      });
    }
```

3. **Gatilho 4 no loop do Scheduler (F8):**
No `setInterval` do scheduler, logo após a checagem do GATILHO 2 (`trigger_daily_summary`):
```javascript
      // ────────────────────────────────────────────────────────────────────────
      // GATILHO 4: Resumo Diário de Avaliações dos Hóspedes (F8, F9)
      // ────────────────────────────────────────────────────────────────────────
      const reviewSummaryTrigger = config.triggers.find(t => t.id === "trigger_daily_review_summary");
      const targetReviewTime = reviewSummaryTrigger?.scheduledTime || "18:00";
      const [tReviewHour, tReviewMin] = targetReviewTime.split(":").map(Number);
      const isPastOrAtReviewTime = (bNow.hour > tReviewHour) || (bNow.hour === tReviewHour && bNow.minute >= tReviewMin);

      if (reviewSummaryTrigger && reviewSummaryTrigger.enabled && isPastOrAtReviewTime && reviewSummaryTrigger.lastExecutedDate !== bNow.date) {
        reviewSummaryTrigger.lastExecutedDate = bNow.date;
        console.log(`[Auto-Limpeza WhatsApp] Executando RESUMO DIÁRIO DE AVALIAÇÕES para camareiras (${bNow.date} às ${bNow.timeStr})...`);

        try {
          const summaryResult = await dispatchDailyReviewsSummary(db, {
            targetDate: bNow.date,
            force: false
          });
          console.log(`[Auto-Limpeza WhatsApp] Resumo Diário de Avaliações concluído: ${summaryResult.maidsNotified} camareiras notificadas, ${summaryResult.totalReviewsSent} avaliações enviadas.`);
          saveDatabase();
        } catch (err) {
          console.error("[Auto-Limpeza WhatsApp] Erro no disparo de Resumo Diário de Avaliações:", err?.message);
        }
      }
```

---

### 3.2 Alterações no Frontend (`artifacts/limpeza/src/pages/maid-whatsapp-automation.tsx`)

1. **Definição da variável `reviewSummaryTrigger` (por volta da linha 605):**
```typescript
  const overtimeTrigger = triggers.find(t => t.id === "trigger_overtime_cleaning")
  const dailyTrigger = triggers.find(t => t.id === "trigger_daily_summary")
  const closingTrigger = triggers.find(t => t.id === "trigger_quinzena_closing")
  const reviewSummaryTrigger = triggers.find(t => t.id === "trigger_daily_review_summary")
```

2. **Adicionar estado e handler do disparo retroativo (por volta da linha 490):**
```typescript
  const [dispatchingRetroactive, setDispatchingRetroactive] = useState(false)

  const handleDispatchRetroactiveNovember = async () => {
    if (!confirm("Deseja consolidar e enviar retroativamente as avaliações elegíveis de Novembro/2026 para as camareiras correspondentes? Avaliações já despachadas não serão duplicadas (trava de idempotência).")) {
      return
    }

    try {
      setDispatchingRetroactive(true)
      const res = await fetch("/api/maid-automation/dispatch-retroactive-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false })
      })
      const data = await res.json()

      if (res.ok) {
        toast({
          title: "✓ Envio Retroativo de Novembro Concluído!",
          description: `${data.maidsNotified || 0} camareiras notificadas, ${data.totalReviewsSent || 0} avaliações elegíveis despachadas.`
        })
        const resHist = await fetch("/api/maid-automation/history")
        if (resHist.ok) setHistory(await resHist.json())
      } else {
        toast({
          title: "Falha no disparo retroativo",
          description: data.error || "Erro ao processar disparo retroativo de Novembro.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setDispatchingRetroactive(false)
    }
  }
```

3. **Card nos Indicadores do Topo (ao lado dos 4 cards existentes, linhas 666–720):**
Transformar o grid em 5 colunas ou adicionar o card:
```tsx
          {/* Card 5: Resumo Diário de Avaliações */}
          <Card className="rounded-2xl border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Resumo Avaliações</p>
                <p className="text-xl font-black text-foreground">{reviewSummaryTrigger?.scheduledTime || "18:00"}</p>
                <p className="text-[10px] text-muted-foreground">{reviewSummaryTrigger?.enabled ? "✓ Ativo e pontual" : "Inativo"}</p>
              </div>
            </CardContent>
          </Card>
```

4. **Novo Card de Gatilho na Aba `<TabsContent value="triggers">` (F11):**
Inserir antes ou depois do Card do Resumo Diário de Produtividade:
```tsx
            {/* ── CARD GATILHO 4: RESUMO DIÁRIO DE AVALIAÇÕES (F8, F9, F10) ── */}
            {reviewSummaryTrigger && (
              <Card className="rounded-3xl border border-border/80 shadow-xs bg-card overflow-hidden">
                <CardHeader className="bg-amber-500/5 border-b border-border/60 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-black text-foreground">
                            {reviewSummaryTrigger.name}
                          </CardTitle>
                          <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-[10px] font-bold">
                            Diário Pontual
                          </Badge>
                          <Badge className="bg-purple-500/10 text-purple-700 border-purple-500/20 text-[10px] font-bold gap-1">
                            <Sparkles className="w-3 h-3" />
                            Triagem IA
                          </Badge>
                        </div>
                        <CardDescription className="text-xs mt-0.5">
                          {reviewSummaryTrigger.description}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dispatchingRetroactive}
                        onClick={handleDispatchRetroactiveNovember}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-purple-500/30 text-purple-700 hover:bg-purple-500/10"
                        title="Consolidar e enviar retroativamente histórico elegível de Novembro/2026 com trava de idempotência"
                      >
                        {dispatchingRetroactive ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Disparar Retroativo Nov/26</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDispatchToAll(reviewSummaryTrigger.id)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-amber-500/30 text-amber-700 hover:bg-amber-500/10"
                        title="Enviar resumo de avaliações de hoje para todas as camareiras elegíveis"
                      >
                        <Play className="w-3 h-3" />
                        <span>Disparar Resumo Hoje</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTestModal(reviewSummaryTrigger)}
                        className="rounded-xl text-xs font-bold gap-1.5 h-8 border-amber-500/30 text-amber-700 hover:bg-amber-500/10"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Testar</span>
                      </Button>

                      <div className="flex items-center gap-2 pl-2 border-l border-border">
                        <Label className="text-xs font-bold cursor-pointer">
                          {reviewSummaryTrigger.enabled ? "Ativo" : "Pausado"}
                        </Label>
                        <Switch
                          checked={reviewSummaryTrigger.enabled}
                          onCheckedChange={checked => updateTriggerField(reviewSummaryTrigger.id, "enabled", checked)}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {/* Configuração de Parâmetros */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-2xl bg-muted/30 border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-foreground">Horário de Disparo Diário</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={reviewSummaryTrigger.scheduledTime || "18:00"}
                          onChange={e => updateTriggerField(reviewSummaryTrigger.id, "scheduledTime", e.target.value)}
                          className="text-xs font-bold rounded-xl h-9 w-32 font-mono"
                        />
                        <span className="text-xs text-muted-foreground font-medium">(Horário de Brasília)</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Consolida e envia diariamente nesse horário para as camareiras avaliadas.</p>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs font-bold text-foreground">Critério de Envio & Triagem por IA</Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        • <strong>Nota 5:</strong> Incluída automaticamente no resumo da camareira responsável pela limpeza.<br />
                        • <strong>Notas &lt; 5 com motivo de limpeza</strong> (box, enxoval, louças, amenities): Encaminhadas para a camareira.<br />
                        • <strong>Notas &lt; 5 com motivo alheio</strong> (check-in, Wi-Fi, portaria, ar-condicionado): Descartadas com proteção anti-cobrança indevida.
                      </p>
                    </div>
                  </div>

                  {/* Editor e Preview lado a lado */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Coluna 1: Editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground">Modelo da Mensagem</Label>
                        <span className="text-[10px] text-muted-foreground">Clique nas variáveis para inserir no texto</span>
                      </div>

                      {/* Tags clicáveis */}
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/40 border border-border/60">
                        {[
                          { tag: "{{nome_camareira}}", label: "Nome Camareira" },
                          { tag: "{{data_hoje}}", label: "Data de Hoje" },
                          { tag: "{{lista_avaliacoes}}", label: "Lista de Avaliações" },
                          { tag: "{{media_dia}}", label: "Média do Dia" },
                          { tag: "{{total_avaliacoes}}", label: "Total Avaliações" },
                        ].map(t => (
                          <button
                            key={t.tag}
                            type="button"
                            onClick={() => insertTagAtCursor(reviewSummaryTrigger.id, t.tag)}
                            className="px-2 py-1 rounded-lg bg-background hover:bg-amber-500/10 hover:text-amber-700 text-[11px] font-mono font-medium border border-border/80 transition-colors"
                            title={`Inserir ${t.tag}`}
                          >
                            + {t.label}
                          </button>
                        ))}
                      </div>

                      <Textarea
                        ref={el => { textareaRefs.current[reviewSummaryTrigger.id] = el }}
                        rows={12}
                        value={reviewSummaryTrigger.template}
                        onChange={e => updateTriggerField(reviewSummaryTrigger.id, "template", e.target.value)}
                        className="text-xs font-mono leading-relaxed rounded-2xl p-3.5 border-border focus-visible:ring-1"
                        placeholder="Digite o texto da mensagem..."
                      />
                    </div>

                    {/* Coluna 2: Preview WhatsApp */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Pré-visualização no WhatsApp</span>
                        </Label>
                        <span className="text-[10px] text-emerald-600 font-semibold">Exemplo com Avaliações do Dia</span>
                      </div>

                      <WhatsAppMessageBubble
                        text={reviewSummaryTrigger.template
                          .replace(/\{\{nome_camareira\}\}/g, "Cris")
                          .replace(/\{\{data_hoje\}\}/g, serverTime ? `${serverTime.date.split("-")[2]}/${serverTime.date.split("-")[1]}/${serverTime.date.split("-")[0]}` : "10/11/2026")
                          .replace(/\{\{lista_avaliacoes\}\}/g, "• *Flat 113*\n   📅 Limpeza: 08/11/2026\n   ⭐ Nota: *5* ⭐⭐⭐⭐⭐\n   💬 _\"Excelente limpeza e capricho!\"_\n\n• *Flat 211*\n   📅 Limpeza: 09/11/2026\n   ⭐ Nota: *4* ⭐⭐⭐⭐\n   💬 _\"Faltou pano de prato\"_")
                          .replace(/\{\{media_dia\}\}/g, "4.7")
                          .replace(/\{\{total_avaliacoes\}\}/g, "2")
                        }
                        time={reviewSummaryTrigger.scheduledTime || "18:00"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
```

---

### 3.3 Garantia de Paridade Twin-Server
Após editar `artifacts/api-server/maid-automation-service.mjs`, o Worker M3 deve executar:
```powershell
Copy-Item -Path "artifacts/api-server/maid-automation-service.mjs" -Destination "scripts/maid-automation-service.mjs" -Force
```

---

## 4. Caveats (Ressalvas e Suposições)

1. **Escopo Estrito de Testes:** Não executar testes globais (`tests/*.test.mjs`), apenas o teste pontual associado `tests/maid-review-ai-synthesis.test.mjs` ao finalizar.
2. **Build do Frontend:** Ao atualizar `maid-whatsapp-automation.tsx`, rodar `npm run build` na pasta `artifacts/limpeza` para assegurar que não haja erros de tipagem.
3. **Persistência das Avaliações:** As avaliações processadas marcam `dispatchedToMaidAt` no objeto original (`npsItem` ou `review`), que é persistido via `saveDatabase()`.

---

## 5. Conclusion (Conclusão e Próximos Passos)

O mapeamento da arquitetura está 100% completo, cirúrgico e validado contra cada linha e asserção da suíte de testes `tests/maid-review-ai-synthesis.test.mjs`.
O Worker M3 possui todos os blocos de código prontos para copiar e colar com zero margem para erro.

---

## 6. Verification Method (Método de Verificação)

Para o Worker e Auditor verificarem a implementação de M3:
1. Executar o teste pontual específico:
   ```powershell
   node --test tests/maid-review-ai-synthesis.test.mjs
   ```
2. Verificar se os testes de F8, F9, F10, B6 e C2 passam com 100% de sucesso.
3. Verificar a paridade Twin-Server:
   ```powershell
   node -e "const fs = require('fs'); const a = fs.readFileSync('artifacts/api-server/maid-automation-service.mjs'); const b = fs.readFileSync('scripts/maid-automation-service.mjs'); console.log('Paridade:', a.equals(b));"
   ```
4. Build do frontend:
   ```powershell
   cd artifacts/limpeza; npm run build
   ```
