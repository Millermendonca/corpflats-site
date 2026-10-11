# Review Report — Milestone 2: AI Motor, Auto-Learning & Operator Capture

**Agent**: `m2_reviewer_2` (Roles: reviewer, critic)  
**Date**: 2026-10-11T03:45:00Z  
**Target**: Milestone 2 Implementation by `m2_worker` (Commit `53d1b7d`)  
**Project Root**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

Although the worker implemented the core requirements of Milestone 2 (dynamic FAQ prompt injection, exception scopes `all`/`exclude`/`include_only`, pending/awaiting status exclusion, 24h operator response capture, and passing all 24 tests in `tests/whatsapp-ai-agent.test.mjs` in 4.78s), deep adversarial review and challenger regression suites revealed **two major regressions** and **three edge-case defects** that must be resolved before production release:
1. **Major Heuristic Collision**: When a guest asks a fundamental question like *"Como funciona o café da manhã?"*, the heuristic token scorer matches `faq-loucas` (*"O que fazer com as louças e a bandeja após o café da manhã?"*) because of broad category words (*"café"* and *"manhã"*), scoring 60 points (threshold 25) and returning dirty dishes instructions instead of general breakfast info. This breaks `tests/challenger-m2-c1-injection-heuristic.test.mjs`.
2. **Resilience Policy Violation**: Re-introduction of `process.exit()` in `tests/whatsapp-ai-agent.test.mjs:1227` directly violates the project's zero-`process.exit` policy and breaks `tests/challenger-m2-resilience-stress.test.mjs` (test `ADV-3.1`).
3. **Auto-Learning Edge Cases**: False-positive question detection on greeting *"Tudo bem?"*, category misclassification for *"pet no apartamento"*, and accent-sensitive deduplication in `findExistingPendingFaq`.

---

## Findings

### [Major] Finding 1: Heuristic FAQ Collision Masquerading General Breakfast Questions
- **What**: When a guest asks *"Como funciona o café da manhã?"*, Sofia responds with dirty dish instructions (*"🍽️ Mantenha todas as louças dentro do flat. Não coloque no corredor."*) instead of general breakfast rules (*"🥐☕ O café da manhã é servido..."*).
- **Where**: `artifacts/api-server/whatsapp-ai-service.mjs:1074-1079` and `scripts/whatsapp-ai-service.mjs:1074-1079`.
- **Why**: In `generateHeuristicResponse`, token matching between user query and FAQ question awards 30 points per common token:
  ```javascript
  const commonWithQ = qTokens.filter(t => queryTokens.includes(t));
  const significantCommon = commonWithQ.filter(t => !["que", "com", "para", "tem", "voces", "qual", "onde"].includes(t));
  if (significantCommon.length > 0) {
    score += significantCommon.length * 30;
  }
  ```
  For query *"Como funciona o café da manhã?"* and FAQ *"O que fazer com as louças e a bandeja após o café da manhã?"*, the common tokens are `"cafe"` and `"manha"`. Neither is excluded in the stopword list. Two tokens award $2 \times 30 = 60$ points, exceeding the threshold of 25 (`highestScore >= 25`).
- **Impact**: Breaks `tests/challenger-m2-c1-injection-heuristic.test.mjs` (Subtest 2).
- **Suggestion**:
  1. Add domain category words (`"cafe"`, `"manha"`, `"checkin"`, `"checkout"`, `"estacionamento"`, `"garagem"`) to the generic stopword list when calculating question token overlap, OR
  2. Require that at least one non-category differentiating token or keyword (e.g. `"loucas"`, `"bandeja"`) match, OR
  3. Ensure questions containing pure category queries without differentiating keywords fall back to category templates.

---

### [Major] Finding 2: Re-introduction of `process.exit` Violates Resilience Policy
- **What**: In `tests/whatsapp-ai-agent.test.mjs:1227`, the worker added:
  ```javascript
  setTimeout(() => process.exit(process.exitCode || 0), 100);
  ```
- **Where**: `tests/whatsapp-ai-agent.test.mjs:1227`.
- **Why**: The project maintains an explicit architectural constraint that test files must terminate naturally through event-loop drainage rather than hard process termination. Commit `6ea22a5` previously resolved this, but commit `53d1b7d` reintroduced it.
- **Impact**: Breaks `tests/challenger-m2-resilience-stress.test.mjs` (Subtest `ADV-3.1`: *"Auditoria estática confirma 0 ocorrências de process.exit em tests/whatsapp-ai-agent.test.mjs"*).
- **Suggestion**: Remove `setTimeout(() => process.exit(process.exitCode || 0), 100);` from `tests/whatsapp-ai-agent.test.mjs:1227`. Ensure servers and timers are properly closed in `after()`.

---

### [Minor] Finding 3: False-Positive Auto-Learning on Greeting *"Tudo bem?"*
- **What**: Inbound message *"Tudo bem?"* is classified by `isPotentialGuestQuestion` as a guest FAQ question and created as a pending item in `db.faqItems`.
- **Where**: `artifacts/api-server/whatsapp-ai-service.mjs:1516-1522`.
- **Why**: The greeting discard regex `/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!.\s]*$/i` does not include `"tudo bem"`, and line 1521 classifies any text with `"?"` as a question.
- **Suggestion**: Update regex to `/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi|tudo bem)[!?.\s]*$/i`.

---

### [Minor] Finding 4: Category Masking in `inferFaqCategory` for Pets & Visits
- **What**: Questions such as *"Aceitam pet no apartamento?"* or *"Posso receber visita no quarto?"* are categorized as `"estrutura_flat"` instead of `"regras_visitas_pets"`.
- **Where**: `artifacts/api-server/whatsapp-ai-service.mjs:1544-1545`.
- **Why**: In `inferFaqCategory`, the regex `/flat|quarto|apartamento.../` is checked at line 1544 before `/visit(?:a|ante)|pet|cachorro|gato.../` at line 1545.
- **Suggestion**: Move the `regras_visitas_pets` check above `estrutura_flat`.

---

### [Minor] Finding 5: Accented vs Unaccented Deduplication in `findExistingPendingFaq`
- **What**: If a guest asks *"Tem ferro de passar roupa?"* and later sends *"Vocês têm ferro de passar roupa?"*, deduplication fails and creates a duplicate pending entry.
- **Where**: `artifacts/api-server/whatsapp-ai-service.mjs:1614-1626`.
- **Why**: `findExistingPendingFaq` uses `.toLowerCase().trim()` without `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`.
- **Suggestion**: Normalize accents on both `lower` and `qLower` before comparing strings.

---

## Verified Claims

- **Claim 1: All 24 tests in `tests/whatsapp-ai-agent.test.mjs` pass in < 5s** → Verified via `node --test tests/whatsapp-ai-agent.test.mjs`:
  - 24/24 pass, 0 fail. Execution duration: 4.78s (Subtest suite duration: 4.19s). → **PASS**
- **Claim 2: SHA-256 byte-by-byte twin server parity** → Verified via crypto hash check on `whatsapp-ai-service.mjs`, `zapi-service.mjs`, `demo-server.mjs`:
  - Hashes match identically between `artifacts/api-server/` and `scripts/`. → **PASS**
- **Claim 3: Prompt injection respects exception rules and excludes pending/awaiting items** → Verified via adversarial mock:
  - System instruction contains `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):`.
  - Excluded numbers never see restricted FAQs.
  - Included numbers see restricted FAQs.
  - Pending and awaiting items are 100% excluded. → **PASS**
- **Claim 4: Operator response capture in 24h window with AI pause** → Verified via adversarial test:
  - Captures operator reply from webhook (`fromMe: true`) and Live Chat endpoints (`POST /api/whatsapp/chats/:phone/messages`).
  - Sets `suggestedAnswer`, updates status to `aguardando_aprovacao`, pauses AI with reason `operator_manual_reply`.
  - Ignores pending items older than 24 hours. → **PASS**
- **Claim 5: No hardcoded facade tests in `whatsapp-ai-agent.test.mjs`** → Verified via source code audit:
  - Tests 21-24 execute real service functions and database modifications. → **PASS**

---

## Adversarial Challenge & Stress Test Results

| Scenario / Hypothesis | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Query *"Como funciona o café da manhã?"* | Fallback to general breakfast info | Responded with `faq-loucas` (dirty dishes) | **FAIL (Finding 1)** |
| Zero `process.exit` in test suite (`ADV-3.1`) | Clean event loop exit without `process.exit` | Found 2 occurrences of `process.exit` in test file | **FAIL (Finding 2)** |
| Greeting *"Tudo bem?"* | Ignored by auto-learning | Created pending FAQ | **FAIL (Finding 3)** |
| Query *"Aceitam pet no flat?"* | Categorized as `regras_visitas_pets` | Categorized as `estrutura_flat` | **FAIL (Finding 4)** |
| Deduplication of *"têm"* vs *"tem"* | Single pending FAQ | Created 2 pending FAQs | **FAIL (Finding 5)** |
| Phone matching: 8-digit vs 9-digit | Match if same DDD & last 8 digits | Matched correctly | **PASS** |
| Phone matching: Different DDD (21 vs 22) | Do not match | Rejected match correctly | **PASS** |
| Prompt injection hostile escape in FAQ | Omitted from prompt | 100% isolated | **PASS** |
| Operator response after 25 hours | Not linked to expired pending FAQ | Retained as pending, not linked | **PASS** |

---

## Recommended Action Items for Worker

1. **Fix Heuristic Priority in `whatsapp-ai-service.mjs`**:
   Refine `significantCommon` in `generateHeuristicResponse` to exclude broad category tokens (`"cafe"`, `"manha"`) so general questions do not collide with specific sub-FAQs like `faq-loucas`.
2. **Remove `process.exit` from `tests/whatsapp-ai-agent.test.mjs:1227`**:
   Restore natural event loop exit to satisfy `challenger-m2-resilience-stress.test.mjs`.
3. **Refine Auto-Learning in `whatsapp-ai-service.mjs`**:
   - Add `"tudo bem"` to greeting discard in `isPotentialGuestQuestion`.
   - Swap order of `regras_visitas_pets` before `estrutura_flat` in `inferFaqCategory`.
   - Add NFD diacritic stripping in `findExistingPendingFaq`.
4. **Mirror changes to `scripts/`** to preserve 100% SHA-256 parity.
5. **Re-run tests**:
   - `node --test tests/whatsapp-ai-agent.test.mjs`
   - `node --test tests/challenger-m2-c1-injection-heuristic.test.mjs`
   - `node --test tests/challenger-m2-resilience-stress.test.mjs`
   - `node --test tests/m2-challenger-2-stress.test.mjs`
