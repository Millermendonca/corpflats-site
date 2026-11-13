# Handoff Report — Feature F2: Preservation of 2-Step Review Flow & Hook Points Architecture

**Agent:** Explorer M1.2 (Review Flow Hook Investigator)  
**Milestone:** M1 (Atribuição de Limpeza & Motor de Triagem por IA)  
**Target Feature:** Feature F2 (`F2_REVIEW_FLOW_PRESERVATION`) & Hook Architecture (`handleMaidReviewHook`)  
**Date:** 2026-11-10T02:16:00Z  

---

## 1. Observation

### 1.1 Coleta e Gravação de Notas e Comentários NPS no Servidor Z-API
Arquivo examinado: `artifacts/api-server/zapi-service.mjs` (linhas 16211 a 16584).

1. **Assinatura e Invariante de Entrada:**
   Na função `handleInboundNpsScoreOrComment` (linhas 16211–16239), o processamento NPS é estritamente condicionado à validação de envio prévio da pesquisa:
   ```javascript
   const surveyInfo = getLatestNpsSurveySentInfo(db, targetPhone);
   let existingNps = db.npsResponses.find(n => matchPhone(n.guestPhone));

   // Se não enviamos a pergunta de avaliação para essa pessoa, NUNCA interpreta números de 1 a 5 como nota NPS
   if (!surveyInfo.sent) {
     return { npsHandled: false };
   }
   ```

2. **Detecção e Gravação da Nota (`existingNps.score`):**
   Nas linhas 16252–16294:
   ```javascript
   // 1. Verifica se a mensagem é uma nota de 1 a 5 (isolada ou com comentário na mesma linha, ex: "4" ou "4 - faltou tapete")
   const pureScoreMatch = cleanText.match(/^([1-5])$/) || cleanText.match(/^nota\s*([1-5])$/i) || cleanText.match(/^([1-5])\s*estrelas?$/i);
   const inlineScoreMatch = !pureScoreMatch
     ? cleanText.match(/^(?:nota\s*)?([1-5])(?:\s*estrelas?)?\s*[-–:,.]\s*(.{3,})$/i)
     : null;
   ...
   if (!alreadyAnsweredCurrentSurvey && (pureScoreMatch || (inlineScoreMatch && !isTimeExpression))) {
     const score = Number((pureScoreMatch || inlineScoreMatch)[1]);
     const inlineComment = inlineScoreMatch ? String(inlineScoreMatch[2] || "").trim() : "";
     ...
     existingNps.score = score;
     existingNps.respondedAt = new Date().toISOString();
     existingNps.pendingResponse = false;
     existingNps.surveyVerifiedSent = true;
     existingNps.flatNumber = resolvedFlat;
     existingNps.guestName = resolvedGuestName;
     existingNps.channel = matchedReservation?.channel || existingNps.channel || "whatsapp";
   ```

3. **Bifurcação do Fluxo na Etapa 1:**
   - **Nota 5 (Aprovação / Google Review):**
     Linhas 16318–16322:
     ```javascript
     if (score === 5) {
       existingNps.autoAction = "google_link_sent";
       existingNps.googleLinkSent = true;
       existingNps.awaitingFeedbackComment = false;
     }
     ```
     O hóspede recebe o link do Google Review (template `tpl_post_checkout_review` / gatilho `nps_approved`) com delay humanizado de 2 minutos e indicador de digitação de 5 segundos (linhas 16359–16376).
   - **Notas 1 a 4 com Comentário Inline (ex: "3 - ar condicionado pingando"):**
     Linhas 16343–16348:
     ```javascript
     if (inlineComment) {
       existingNps.comment = inlineComment;
       existingNps.commentReceivedAt = new Date().toISOString();
       existingNps.awaitingFeedbackComment = false;
       syncNpsCommentToReviews(db, existingNps);
     }
     ```
     O comentário é gravado imediatamente e sincronizado com `db.reviews`.
   - **Notas 1 a 4 sem Comentário Inicial (Fluxo em 2 Etapas — Aguardando feedback):**
     Linhas 16349–16354:
     ```javascript
     } else {
       existingNps.awaitingFeedbackComment = true;
       existingNps.awaitingFeedbackSince = new Date().toISOString();
       existingNps.managerAlertSent = false;
       existingNps.managerCommentAlertSent = false;
     }
     ```
     O sistema dispara o template de feedback respectivo (`getNpsScoreTemplate(db, score)`: `tpl_nps_score_4`, `tpl_nps_score_3`, `tpl_nps_score_2`, `tpl_nps_score_1`), convidando o hóspede a digitar a razão.

4. **Etapa 2 — Coleta da Resposta Escrita do Hóspede (`existingNps.comment`):**
   Nas linhas 16454–16488:
   ```javascript
   // 2. Verifica se o hóspede deu nota de 1 a 4 recentemente (awaitingFeedbackComment === true) e agora está digitando a explicação
   if (
     existingNps &&
     Number(existingNps.score) >= 1 &&
     Number(existingNps.score) <= 4 &&
     existingNps.awaitingFeedbackComment === true &&
     !pureScoreMatch
   ) {
     const sinceMs = existingNps.awaitingFeedbackSince ? new Date(existingNps.awaitingFeedbackSince).getTime() : Date.now();
     const ageHours = (Date.now() - sinceMs) / (3600 * 1000);

     // Janela de 48h após a nota para capturar a resposta escrita do hóspede
     if (ageHours <= 48) {
       existingNps.comment = existingNps.comment
         ? `${existingNps.comment} | ${cleanText}`
         : cleanText;
       existingNps.commentReceivedAt = new Date().toISOString();
       existingNps.awaitingFeedbackComment = false;
       existingNps.guestName = resolveBestNpsGuestName(senderName, existingNps.guestName, matchedReservation?.guestName);
       if (flatNumber && !existingNps.flatNumber) existingNps.flatNumber = flatNumber;
       if (matchedReservation?.flatNumber && !existingNps.flatNumber) existingNps.flatNumber = matchedReservation.flatNumber;
       ...
       // Sincroniza em db.reviews para constar também na aba de Feedbacks
       syncNpsCommentToReviews(db, existingNps);

       // Envia template de agradecimento pós-comentário (tpl_nps_feedback_thanks)
       const thanksTpl = getNpsThanksTemplate(db);
   ```

5. **Templates Pré-existentes Intactos (`DEFAULT_WHATSAPP_TEMPLATES`):**
   Nas linhas 977–1115 de `artifacts/api-server/zapi-service.mjs`, os templates estão registrados e validados:
   - `tpl_nps_satisfaction_check` (triggerEvent: `post_checkout_review`): Pergunta inicial de 1 a 5 enviada 24h pós-checkout.
   - `tpl_post_checkout_review` (triggerEvent: `nps_approved`): Link do Google Reviews com 5 estrelas.
   - `tpl_nps_score_4` (triggerEvent: `nps_score_4`): Agradecimento nota 4 e convite a apontar o que faltou para ser nota 5.
   - `tpl_nps_score_3` (triggerEvent: `nps_score_3`): Agradecimento nota 3 e solicitação de pontos a melhorar.
   - `tpl_nps_score_2` (triggerEvent: `nps_score_2`): Pedido de desculpas e solicitação de relato.
   - `tpl_nps_score_1` (triggerEvent: `nps_score_1`): Acolhimento prioritário da ouvidoria para detrator.
   - `tpl_nps_feedback_thanks` (triggerEvent: `nps_feedback_thanks`): Agradecimento final pelo envio da crítica/sugestão.

---

### 1.2 Registro de NPS e Reviews no Servidor de API (`demo-server.mjs`)
Arquivo examinado: `artifacts/api-server/demo-server.mjs`.

1. **Endpoint `POST /api/ai/nps-response` (linhas 63395–63451):**
   - Cria ou atualiza `db.npsResponses`:
     ```javascript
     const npsEntry = {
       id: "nps_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5),
       reservationId: reservationId || null, guestPhone: guestPhone || null, guestName: guestName || "Hóspede",
       flatNumber: flatNumber || null, channel: channel || null, score: numScore, comment: comment || null,
       sentAt: new Date().toISOString(), respondedAt: new Date().toISOString(),
       googleLinkSent, autoAction, pendingResponse: false,
       manualEntry: true, surveyVerifiedSent: true,
       ...
     };
     ```
   - Se `numScore <= 4` e existe comentário, executa `syncNpsCommentToReviews(db, targetNpsEntry)` (linha 63437).

2. **Endpoint `POST /api/ai/import-review` (linhas 62819–62850):**
   - Importa avaliações externas (Airbnb, Booking, etc.) diretamente para `db.reviews`:
     ```javascript
     const newRev = {
       id: newId,
       author: author.trim(),
       rating: Number(rating) || 5,
       channel: channel || "airbnb",
       date: getIsoDateStr(new Date()),
       flatMentioned: flatMentioned || null,
       comment: comment.trim(),
       sentiment: Number(rating) >= 4 ? "positive" : Number(rating) === 3 ? "mixed" : "negative",
       analyzed: false
     };
     db.reviews.unshift(newRev);
     ```

---

## 2. Logic Chain

```
[Inbound WhatsApp Message / NPS API Response]
                     │
                     ▼
  [getLatestNpsSurveySentInfo(db, targetPhone).sent === true]
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
  [Etapa 1: Nota 1..5]    [Etapa 2: Comentário Escrito Sub-5]
  (pureScoreMatch /        (existingNps.awaitingFeedbackComment === true)
   inlineScoreMatch)                     │
         │                               ▼
         ├───────────────────► [existingNps.comment = cleanText]
         │                     [existingNps.awaitingFeedbackComment = false]
         │                     [syncNpsCommentToReviews(db, existingNps)]
         │                     [tpl_nps_feedback_thanks enviado ao hóspede]
         │                               │
         │                               ▼
         │                     [Hook Point 3: Sub-5 Comment Received]
         ▼
   ┌──────────────────────────────────────────────┐
   │ BIFURCAÇÃO DA ETAPA 1                        │
   ├──────────────────────────────────────────────┤
   │ 1. score === 5                               │
   │    -> awaitingFeedbackComment = false        │
   │    -> Envia link Google Review (nps_approved)│
   │    -> [Hook Point 1: Score 5 Received]       │
   │                                              │
   │ 2. score <= 4 SEM comentário inline          │
   │    -> awaitingFeedbackComment = true         │
   │    -> Envia tpl_nps_score_1..4 ao hóspede    │
   │    -> [Retido: Sem comentário, não forwarda] │
   │                                              │
   │ 3. score <= 4 COM comentário inline          │
   │    -> awaitingFeedbackComment = false        │
   │    -> existingNps.comment = inlineComment    │
   │    -> syncNpsCommentToReviews(db)            │
   │    -> [Hook Point 2: Inline Sub-5 Comment]   │
   └──────────────────────────────────────────────┘
                     │
                     ▼
  [invokeMaidReviewHookSafe(db, payload)] (Assíncrono, Não-Bloqueante, Erro Isolado)
                     │
                     ▼
  [handleMaidReviewHook(db, payload)]
         │
         ├─► Passo 1: Localiza a Reserva (por code, id, telefone ou flat+data)
         │
         ├─► Passo 2: Resolução Determinística da Camareira (Feature F1)
         │            `resolveMaidCleaningForReservation(db, reservation)`
         │
         ├─► Passo 3: Triagem por IA & Regras de Elegibilidade (Features F3 e F4)
         │            - Se score === 5:
         │                forwardToMaid = true (auto-elegível para resumo diário)
         │            - Se score < 5 sem comentário:
         │                forwardToMaid = false (retido até resposta)
         │            - Se score < 5 com comentário:
         │                `triageSub5Review({ score, comment, flatNumber, db })`
         │                Limpeza/camareira -> forwardToMaid = true
         │                Check-in/Wi-Fi/infra -> forwardToMaid = false (descartado)
         │
         ├─► Passo 4: Registro e Enriquecimento
         │            `npsItem.maidAttribution = { maidId, forwardToMaid, ... }`
         │
         └─► Passo 5: Síntese de Opiniões & Disparo em Tempo Real (Features F5, F6, F7)
                      Se forwardToMaid === true E comentário presente:
                      1. `updateMaidOpinionSynthesis(db, { maidId, review, triageResult })`
                      2. `dispatchRealtimeMaidReviewAlerts(db, { review, maidUser, ... })`
                         (Mensagem 1: Avaliação + Mensagem 2: Síntese Mercado Livre)
```

### Raciocínio de Preservação e Isolamento (R2)
1. **Zero Impacto no Hóspede:**  
   O hook listener é chamado de forma não-bloqueante (`invokeMaidReviewHookSafe(...).catch(...)`). Mesmo que o serviço de IA esteja fora do ar, o banco de dados falhe no módulo de camareiras ou a camareira não seja identificada, a resposta de WhatsApp ao hóspede (link do Google ou agradecimento) é despachada com 100% de sucesso.
2. **Preservação dos Prompts:**  
   Nenhum texto, variável (`{{primeiro_nome}}`, `{{quarto}}`, `{{nome_hotel}}`), delay, botão ou lógica dos templates `tpl_nps_satisfaction_check`, `tpl_post_checkout_review`, `tpl_nps_score_1..4` e `tpl_nps_feedback_thanks` é alterado.
3. **Respeito Estrito à Janela de Feedback (R3 / F4):**  
   Quando o hóspede digita apenas a nota abaixo de 5 (ex: "3"), o sistema entra em `awaitingFeedbackComment = true`. O hook reconhece que a nota < 5 não possui comentário e, portanto, **NÃO envia notificação nem encaminha a nota à camareira**. Somente após a Etapa 2 (quando o hóspede explica o motivo) a triagem por IA é disparada. Se o hóspede nunca responder, a nota < 5 permanece retida e não chega à camareira.

---

## 3. Caveats

1. **Janela de 48h de Resposta:**  
   O fluxo existente em `zapi-service.mjs` (linha 16466) aceita comentários vinculados à nota em uma janela de até 48 horas (`ageHours <= 48`). Comentários recebidos após esse prazo não são vinculados a `existingNps.comment`. Assume-se que qualquer comentário elegível para a camareira ocorra dentro dessa janela.
2. **Hóspedes Sem Reserva Localizada:**  
   Caso uma nota NPS seja recebida de um número cuja reserva não conste em `db.reservations` (caso raro de telefone alterado sem cadastro), `resolveMaidCleaningForReservation` pode retornar `maidUser: null`. Nesses casos, o review é registrado como não atribuído (`maidId: null`) e não gera disparo via WhatsApp, sendo mantido para auditoria gerencial.
3. **Concorrência e Idempotência:**  
   Para evitar múltiplos disparos em tempo real caso o hóspede envie duas mensagens complementares de texto na Etapa 2 (concatenadas com ` | ` na linha 16468), o hook deve registrar uma trava de idempotência no review (`dispatchedRealtimeAt: ISO`).

---

## 4. Conclusion & Concrete Code Specification

### 4.1 Interface Contract da Função Hook (`handleMaidReviewHook`)
Localização canônica: `artifacts/api-server/maid-automation-service.mjs` (espelhado em `scripts/maid-automation-service.mjs`).

```javascript
/**
 * Hook listener unificado para novas avaliações e respostas NPS.
 * Acionado de forma não-invasiva pelos pontos de ingestão (Z-API e demo-server).
 *
 * @param {object} db Estado global em memória do sistema
 * @param {object} payload Dados da avaliação recebida
 * @param {string} payload.hookType Tipo do evento disparador
 * @param {object} [payload.npsItem] Objeto existente em db.npsResponses
 * @param {object} [payload.review] Objeto existente em db.reviews
 * @param {number} payload.score Nota de 1 a 5
 * @param {string} [payload.comment] Comentário/explicação do hóspede
 * @param {object} [payload.reservation] Objeto da reserva associada
 * @param {string|number} [payload.flatNumber] Número do flat
 * @param {string} [payload.guestPhone] Telefone do hóspede
 * @param {string} [payload.guestName] Nome do hóspede
 * @param {string} [payload.respondedAt] Data/hora da resposta
 * @param {object} options Opções de execução
 * @param {Function} [options.saveDatabase] Função de persistência
 * @param {Function} [options.sendZapiFn] Função de envio WhatsApp Z-API
 * @returns {Promise<object>} Resultado do processamento do hook
 */
export async function handleMaidReviewHook(db, payload, { saveDatabase, sendZapiFn = sendZapiMessage } = {}) {
  if (!db || !payload) return { handled: false, reason: "invalid_payload" };

  const {
    hookType,
    npsItem = null,
    review = null,
    score,
    comment = null,
    reservation = null,
    flatNumber = null,
    guestPhone = null,
    guestName = null,
    respondedAt = null
  } = payload;

  const numScore = Number(score);
  const cleanComment = typeof comment === "string" ? comment.trim() : "";

  // 1. Resolução da Reserva correspondente
  let matchedReservation = reservation || null;
  const resCodeOrId = npsItem?.reservationCode || npsItem?.reservationId || payload?.reservationId;
  if (!matchedReservation && Array.isArray(db.reservations)) {
    if (resCodeOrId) {
      matchedReservation = db.reservations.find(r =>
        String(r.code) === String(resCodeOrId) || String(r.id) === String(resCodeOrId)
      ) || null;
    }
    if (!matchedReservation && (guestPhone || npsItem?.guestPhone)) {
      const p = cleanWhatsAppPhone(guestPhone || npsItem.guestPhone);
      matchedReservation = db.reservations.find(r => {
        const rP = cleanWhatsAppPhone(r.guestPhone || r.phone);
        return rP && p && (rP.endsWith(p.slice(-8)) || p.endsWith(rP.slice(-8)));
      }) || null;
    }
  }

  // 2. Atribuição determinística da última limpeza (Feature F1)
  const targetFlat = flatNumber || matchedReservation?.flatNumber || npsItem?.flatNumber || review?.flatMentioned;
  const attribution = resolveMaidCleaningForReservation(db, matchedReservation, {
    flatNumber: targetFlat,
    evaluationDate: respondedAt
  });

  const maidUser = attribution?.maidUser || null;
  const maidId = maidUser?.id || null;
  const cleaningDate = attribution?.cleaningDate || null;
  const cleaningRequest = attribution?.cleaningRequest || null;

  // 3. Regras de Elegibilidade e Triagem por IA (Features F3 e F4)
  let forwardToMaid = false;
  let triageResult = null;

  if (numScore === 5) {
    forwardToMaid = true;
    triageResult = {
      isCleaningRelated: true,
      category: "maid_cleaning",
      primaryResponsibility: "camareira",
      forwardToMaid: true,
      cleaningAspects: cleanComment ? ["avaliacao_excelente_5_estrelas"] : [],
      nonCleaningAspects: [],
      explanation: "Nota 5 é automaticamente elegível para o resumo da camareira.",
      triageMethod: "score_5_direct"
    };
  } else if (numScore <= 4) {
    if (!cleanComment) {
      // Sub-5 sem comentário: retida de envio à camareira (aguarda Etapa 2)
      forwardToMaid = false;
      triageResult = {
        isCleaningRelated: false,
        category: "sub5_sem_comentario",
        primaryResponsibility: "hotel_gestao",
        forwardToMaid: false,
        cleaningAspects: [],
        nonCleaningAspects: [],
        explanation: "Avaliação < 5 sem comentário não é encaminhada à camareira.",
        triageMethod: "sub5_withheld_no_comment"
      };
    } else {
      // Triagem por IA (Two-Tier)
      triageResult = await triageSub5Review({
        score: numScore,
        comment: cleanComment,
        flatNumber: targetFlat,
        db
      });
      forwardToMaid = Boolean(triageResult?.forwardToMaid);
    }
  }

  // 4. Criação do registro canônico de avaliação para governança
  const reviewRecord = {
    id: npsItem?.id || review?.id || `rev_hook_${Date.now()}`,
    source: npsItem ? "nps_whatsapp" : "review",
    score: numScore,
    comment: cleanComment || null,
    guestName: guestName || npsItem?.guestName || review?.author || "Hóspede",
    guestPhone: guestPhone || npsItem?.guestPhone || null,
    flatNumber: targetFlat || null,
    reservationId: matchedReservation?.id || null,
    reservationCode: matchedReservation?.code || null,
    cleaningDate: cleaningDate,
    cleaningRequestId: cleaningRequest?.id || null,
    maidId: maidId,
    maidName: maidUser?.name || null,
    forwardToMaid: forwardToMaid,
    triageResult: triageResult,
    receivedAt: respondedAt || new Date().toISOString(),
    dispatchedToDailySummary: false,
    dispatchedRealtimeAt: null
  };

  // 5. Rastreabilidade no npsItem
  if (npsItem) {
    npsItem.maidAttribution = {
      maidId,
      maidName: maidUser?.name || null,
      cleaningDate,
      cleaningRequestId: cleaningRequest?.id || null,
      forwardToMaid,
      triageCategory: triageResult?.category || null,
      triageMethod: triageResult?.triageMethod || null
    };
  }

  // 6. Atualização de Síntese de Opiniões & Disparo em Tempo Real (R5 / F5 / F6 / F7)
  let realtimeAlertDispatched = false;
  if (forwardToMaid && maidId && cleanComment && triageResult?.isCleaningRelated) {
    // Evita duplicidade se já despachou em tempo real para este review
    if (!npsItem?.realtimeMaidAlertDispatched) {
      if (typeof updateMaidOpinionSynthesis === "function") {
        updateMaidOpinionSynthesis(db, {
          maidId,
          review: reviewRecord,
          triageResult
        });
      }

      if (typeof dispatchRealtimeMaidReviewAlerts === "function" && maidUser?.whatsapp) {
        const sendRes = await dispatchRealtimeMaidReviewAlerts(db, {
          review: reviewRecord,
          maidUser,
          cleaningDate,
          triageResult,
          sendZapiFn
        }).catch(err => {
          console.warn("[Realtime Dual Message Warning]:", err?.message);
          return { success: false, error: err?.message };
        });

        if (sendRes?.success) {
          realtimeAlertDispatched = true;
          if (npsItem) npsItem.realtimeMaidAlertDispatched = true;
          reviewRecord.dispatchedRealtimeAt = new Date().toISOString();
        }
      }
    }
  }

  if (typeof saveDatabase === "function") saveDatabase();

  return {
    handled: true,
    hookType,
    reservationCode: matchedReservation?.code || null,
    maidId,
    maidName: maidUser?.name || null,
    forwardToMaid,
    triageCategory: triageResult?.category || null,
    triageMethod: triageResult?.triageMethod || null,
    realtimeAlertDispatched
  };
}
```

---

### 4.2 Helper Seguro de Invocação (`invokeMaidReviewHookSafe`)
Localização: `artifacts/api-server/zapi-service.mjs` (espelhado em `scripts/zapi-service.mjs`).

```javascript
/**
 * Invoca com isolamento total de falhas o hook de avaliações para camareiras.
 */
export async function invokeMaidReviewHookSafe(db, payload, { saveDatabase, sendZapiFn = sendZapiMessage } = {}) {
  try {
    if (!db || !payload) return { handled: false, reason: "missing_payload" };

    let hookHandler = null;
    if (typeof globalThis.__CORPFLATS_MAID_REVIEW_HOOK__ === "function") {
      hookHandler = globalThis.__CORPFLATS_MAID_REVIEW_HOOK__;
    } else {
      const maidService = await import("./maid-automation-service.mjs").catch(() => null);
      if (maidService && typeof maidService.handleMaidReviewHook === "function") {
        hookHandler = maidService.handleMaidReviewHook;
      }
    }

    if (!hookHandler) return { handled: false, reason: "hook_not_available" };

    return await hookHandler(db, payload, { saveDatabase, sendZapiFn });
  } catch (err) {
    console.warn("[MaidReviewHookSafe] Falha não crítica no hook de avaliação:", err?.message || err);
    return { handled: false, error: err?.message || String(err) };
  }
}
```

---

### 4.3 Snipets Cirúrgicos de Injeção dos Hook Points

#### Hook Point 1 — `zapi-service.mjs` (Linha ~16321)
Inserido logo após a gravação de `existingNps.awaitingFeedbackComment = false` para nota 5:
```javascript
<<<< BEFORE
    if (score === 5) {
      existingNps.autoAction = "google_link_sent";
      existingNps.googleLinkSent = true;
      existingNps.awaitingFeedbackComment = false;
    } else {
==== AFTER
    if (score === 5) {
      existingNps.autoAction = "google_link_sent";
      existingNps.googleLinkSent = true;
      existingNps.awaitingFeedbackComment = false;

      // [Feature F2 Hook Point 1: Avaliação Nota 5 (Elegível para Resumo Diário)]
      invokeMaidReviewHookSafe(db, {
        hookType: "score_5_received",
        npsItem: existingNps,
        score: 5,
        comment: inlineComment || null,
        reservation: matchedReservation,
        flatNumber: resolvedFlat,
        guestPhone: rawPhone || targetPhone,
        guestName: resolvedGuestName,
        respondedAt: existingNps.respondedAt
      }, { saveDatabase, sendZapiFn }).catch(e => console.warn("[Hook 1 Non-Blocking]", e.message));
    } else {
>>>>
```

#### Hook Point 2 — `zapi-service.mjs` (Linha ~16348)
Inserido logo após `syncNpsCommentToReviews(db, existingNps)` para nota 1..4 com comentário inline:
```javascript
<<<< BEFORE
      if (inlineComment) {
        existingNps.comment = inlineComment;
        existingNps.commentReceivedAt = new Date().toISOString();
        existingNps.awaitingFeedbackComment = false;
        syncNpsCommentToReviews(db, existingNps);
      } else {
==== AFTER
      if (inlineComment) {
        existingNps.comment = inlineComment;
        existingNps.commentReceivedAt = new Date().toISOString();
        existingNps.awaitingFeedbackComment = false;
        syncNpsCommentToReviews(db, existingNps);

        // [Feature F2 Hook Point 2: Nota <= 4 com comentário inline]
        invokeMaidReviewHookSafe(db, {
          hookType: "inline_sub5_comment_received",
          npsItem: existingNps,
          score,
          comment: inlineComment,
          reservation: matchedReservation,
          flatNumber: resolvedFlat,
          guestPhone: rawPhone || targetPhone,
          guestName: resolvedGuestName,
          respondedAt: existingNps.respondedAt
        }, { saveDatabase, sendZapiFn }).catch(e => console.warn("[Hook 2 Non-Blocking]", e.message));
      } else {
>>>>
```

#### Hook Point 3 — `zapi-service.mjs` (Linha ~16488)
Inserido logo após `syncNpsCommentToReviews(db, existingNps)` na Etapa 2 de resposta escrita do hóspede:
```javascript
<<<< BEFORE
      // Sincroniza em db.reviews para constar também na aba de Feedbacks
      syncNpsCommentToReviews(db, existingNps);

      // Envia template de agradecimento pós-comentário (tpl_nps_feedback_thanks)
      const thanksTpl = getNpsThanksTemplate(db);
==== AFTER
      // Sincroniza em db.reviews para constar também na aba de Feedbacks
      syncNpsCommentToReviews(db, existingNps);

      // [Feature F2 Hook Point 3: Resposta escrita de comentário coletada na Etapa 2]
      invokeMaidReviewHookSafe(db, {
        hookType: "sub5_comment_received",
        npsItem: existingNps,
        score: Number(existingNps.score),
        comment: existingNps.comment,
        reservation: matchedReservation,
        flatNumber: existingNps.flatNumber || flatNumber,
        guestPhone: rawPhone || targetPhone,
        guestName: existingNps.guestName,
        respondedAt: existingNps.commentReceivedAt || new Date().toISOString()
      }, { saveDatabase, sendZapiFn }).catch(e => console.warn("[Hook 3 Non-Blocking]", e.message));

      // Envia template de agradecimento pós-comentário (tpl_nps_feedback_thanks)
      const thanksTpl = getNpsThanksTemplate(db);
>>>>
```

#### Hook Point 4 — `demo-server.mjs` (Linha ~63445)
No endpoint `POST /api/ai/nps-response`:
```javascript
<<<< BEFORE
      improvements = await rebuildNpsImprovementsSummary(db);
      await sendNpsManagerAlertWhatsApp(db, targetNpsEntry, {
        reason: "manual_or_portal_nps_response",
        saveDatabase
      });
    }

    saveDatabase();
    res.json({ success: true, npsEntry: targetNpsEntry, googleLinkSent, autoAction, improvements });
==== AFTER
      improvements = await rebuildNpsImprovementsSummary(db);
      await sendNpsManagerAlertWhatsApp(db, targetNpsEntry, {
        reason: "manual_or_portal_nps_response",
        saveDatabase
      });
    }

    // [Feature F2 Hook Point 4: Resposta NPS via Portal/API]
    invokeMaidReviewHookSafe(db, {
      hookType: "portal_or_api_nps_response",
      npsItem: targetNpsEntry,
      score: numScore,
      comment: comment || null,
      reservationId: reservationId || null,
      flatNumber: targetNpsEntry.flatNumber,
      guestPhone: targetNpsEntry.guestPhone,
      guestName: targetNpsEntry.guestName,
      respondedAt: targetNpsEntry.respondedAt
    }, { saveDatabase }).catch(e => console.warn("[Hook 4 Non-Blocking]", e.message));

    saveDatabase();
    res.json({ success: true, npsEntry: targetNpsEntry, googleLinkSent, autoAction, improvements });
>>>>
```

#### Hook Point 5 — `demo-server.mjs` (Linha ~62845)
No endpoint `POST /api/ai/import-review`:
```javascript
<<<< BEFORE
    db.reviews.unshift(newRev);
    if (Number(newRev.rating) <= 4) {
      await rebuildNpsImprovementsSummary(db);
    }
    saveDatabase();

    res.json({ success: true, review: newRev });
==== AFTER
    db.reviews.unshift(newRev);
    if (Number(newRev.rating) <= 4) {
      await rebuildNpsImprovementsSummary(db);
    }

    // [Feature F2 Hook Point 5: Avaliação importada externamente (Airbnb, Booking)]
    invokeMaidReviewHookSafe(db, {
      hookType: "imported_review",
      review: newRev,
      score: Number(newRev.rating),
      comment: newRev.comment,
      flatNumber: newRev.flatMentioned,
      guestName: newRev.author,
      respondedAt: newRev.date
    }, { saveDatabase }).catch(e => console.warn("[Hook 5 Non-Blocking]", e.message));

    saveDatabase();

    res.json({ success: true, review: newRev });
>>>>
```

---

## 5. Verification Method

Para validar a implementação da Feature F2 de forma pontual (respeitando a regra do `AGENTS.md` de nunca rodar testes globais), a suíte dedicada `tests/maid-review-ai-synthesis.test.mjs` (Feature F12) deve executar os seguintes testes unitários:

### 5.1 Casos de Teste Unitários

1. **Invariância dos Prompts e Templates de NPS:**
   - Inspecionar `DEFAULT_WHATSAPP_TEMPLATES`.
   - Assegurar que `tpl_nps_satisfaction_check`, `tpl_post_checkout_review`, `tpl_nps_score_1..4` e `tpl_nps_feedback_thanks` mantêm seus textos, tags e status `enabled: true`.

2. **Fluxo de Nota 5 (Hook Point 1):**
   - Enviar mensagem `"5"` de hóspede pós-checkout.
   - Verificar que `res.npsHandled === true`, `existingNps.googleLinkSent === true`, `existingNps.awaitingFeedbackComment === false`.
   - Verificar que o hook registrou atribuição de camareira com `forwardToMaid === true` e `triageMethod === "score_5_direct"`.
   - Verificar que zero mensagens de alerta em tempo real foram disparadas para a camareira (retida para consolidação diária).

3. **Fluxo de Nota 4 sem Comentário Inicial (Etapa 1):**
   - Enviar mensagem `"4"` de hóspede pós-checkout.
   - Verificar que `existingNps.score === 4`, `existingNps.awaitingFeedbackComment === true`.
   - Verificar que o hóspede recebeu `tpl_nps_score_4`.
   - Verificar que `forwardToMaid === false` (retida), e nenhuma mensagem foi disparada para a camareira.

4. **Fluxo de Comentário sobre Limpeza na Etapa 2 (Hook Point 3):**
   - Enviar mensagem de texto subsequente: `"O quarto estava ótimo, mas o lençol estava manchado e faltou toalha de banho"`.
   - Verificar que `existingNps.comment` foi atualizado e `existingNps.awaitingFeedbackComment === false`.
   - Verificar que o hóspede recebeu `tpl_nps_feedback_thanks`.
   - Verificar que o hook executou triagem por IA, classificou como limpeza (`isCleaningRelated: true`, `forwardToMaid: true`).
   - Verificar que a síntese de opiniões foi atualizada e que as duas mensagens de tempo real (Mensagem 1: Avaliação, Mensagem 2: Síntese Mercado Livre) foram enviadas para o WhatsApp da camareira.

5. **Fluxo de Comentário Alheio a Limpeza na Etapa 2 (Descarte):**
   - Enviar mensagem: `"A internet Wi-Fi estava muito lenta e o check-in na portaria demorou"`.
   - Verificar que a triagem por IA classificou como não-limpeza (`isCleaningRelated: false`, `forwardToMaid: false`).
   - Verificar que NENHUMA mensagem foi enviada à camareira e que a nota não foi associada ao saldo de avaliações dela.

6. **Fluxo de Nota com Comentário Inline (Hook Point 2):**
   - Enviar mensagem: `"2 - O chão estava com poeira e o box do banheiro sujo"`.
   - Verificar que `inlineScoreMatch` capturou a nota 2 e o comentário simultaneamente.
   - Verificar que a triagem foi disparada e a camareira notificada em tempo real.

7. **Resiliência a Falhas (Fault-Tolerance):**
   - Simular exceção intencional no handler da camareira (`throw new Error("Simulated Maid Engine Error")`).
   - Processar mensagem do hóspede.
   - Verificar que `handleInboundNpsScoreOrComment` conclui com `npsHandled: true`, envia o template correto para o hóspede e não interrompe o servidor.

### 5.2 Comando de Execução Estritamente Pontual
Conforme as diretrizes do projeto:
```powershell
node --test tests/maid-review-ai-synthesis.test.mjs
```
*(Execução estritamente pontual; sem varreduras globais nem interferência em outros módulos).*
