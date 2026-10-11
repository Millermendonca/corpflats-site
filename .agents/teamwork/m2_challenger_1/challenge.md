# Challenge Report — Milestone 2 Challenger 1 (AI Injection & Heuristic Challenger)

**Agent**: `m2_challenger_1` (Roles: critic, specialist)  
**Date**: 2026-10-11T03:45:00Z  
**Verdict**: `REQUEST_CHANGES`

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While prompt injection for Gemini correctly enforces client scopes (`all`, `exclude`, `include_only`) and safely excludes non-active items, and unit test suite `tests/whatsapp-ai-agent.test.mjs` passes in isolation, empirical stress-testing against the real system database (`data/database.json`) revealed a **critical heuristic scoring defect** in `whatsapp-ai-service.mjs:1098` (and its twin `scripts/whatsapp-ai-service.mjs:1098`).

An exponential compounding bug (`score += Math.max(score, ...)`) combined with stop-word contamination in variation matching causes FAQs with multiple variations to inflate their scores to thousands of points ($O(2^V)$) on stop words like "qual", "para", "com", "como", completely shadowing specific and exact target FAQs.

---

## Challenges

### [High] Challenge 1: Exponential Score Inflation and Stop-Word Hijacking in Heuristic Matching

- **Assumption challenged**: The assumption that `generateHeuristicResponse` correctly prioritizes active FAQs and specific variations over generic topics, and that `score` accurately reflects query relevance.
- **Attack scenario**:
  1. In `artifacts/api-server/whatsapp-ai-service.mjs:1096-1098`:
     ```javascript
     const vTokens = vNorm.split(/\s+/).filter(w => w.length > 2);
     const common = vTokens.filter(t => queryTokens.includes(t));
     if (vTokens.length > 0 && common.length >= Math.min(2, vTokens.length)) {
       score += Math.max(score, 40 + (common.length * 10));
     }
     ```
  2. Because line 1098 performs `score += Math.max(score, ...)`, once `score` is greater than zero (from question token matching), `Math.max(score, ...)` evaluates to `score`. Adding `score` to `score` (`score += score`) **doubles the score on every matching variation**.
  3. Furthermore, while line 1075 filtered out Portuguese stop words for question tokens (`!["que", "com", "para", "tem", "voces", "qual", "onde"].includes(t)`), line 1096 for variations **does not filter stop words**.
  4. Consequently, stop words like `"qual"`, `"para"`, `"com"`, `"como"` match across unrelated variations, repeatedly triggering the doubling bug.
  5. In production with `data/database.json`:
     - Asking the exact title of `faq-recolhimento-loucas` (*"O que fazer com as louças e a bandeja após o café da manhã?"*) yields score 4015 for `faq-cafe-quarto` vs 715 for `faq-recolhimento-loucas`. The guest receives instructions on how breakfast is ordered/served instead of being warned not to leave trays in the corridor!
     - Asking the exact title of `faq-checkin-14h` (*"Qual é o horário padrão de check-in e como funciona a entrada?"*) yields response from `faq-early-checkin-direto` due to stop word overlap in early check-in variations.
     - Asking about corporate agreements in `faq-rule-include-vip-convenio` (*"Qual o procedimento para reservas corporativas com faturamento?"*) yields score 120 for `faq-regras-pets` ("Política Pet") vs 105 for the corporate agreement, because pet variations matched `"qual"`, `"para"`, `"com"`!
- **Blast radius**: High. Guests asking about dish collection, standard check-in hours, or corporate reservation billing receive wrong or irrelevant answers from the heuristic contingency engine.
- **Mitigation**:
  1. In `whatsapp-ai-service.mjs` (both in `artifacts/api-server/` and `scripts/`):
     - Remove `score += Math.max(score, ...)` compounding. Calculate variation score independently or take the single best variation score:
       `bestVariationScore = Math.max(bestVariationScore, 40 + (significantCommon.length * 15));`
       and add `bestVariationScore` once.
     - Filter out stop words in `vTokens`:
       `const stopWords = ["que", "com", "para", "tem", "voces", "qual", "onde", "como", "quem", "apos", "das", "dos"];`
       `const significantCommon = common.filter(t => !stopWords.includes(t));`
     - Guarantee that an exact full question match (`cleanQuery.includes(qNorm)` or `qNorm.includes(cleanQuery)`) awards a dominant score (e.g. 150+) ensuring the exact FAQ always wins.

---

## Stress Test Results

Executed test suite: `tests/challenger-m2-c1-injection-heuristic.test.mjs` (6 subtests, all pass as assertions verifying system state and empirical bug):

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| **Prompt Injection Scopes (`all`, `exclude`, `include_only`)** | Scopes properly filtered into system prompt for Gemini; phone numbers normalized | Prompt contains only applicable active FAQs; formatted numbers properly matched | **PASS** |
| **Prompt Injection Status Isolation** | Pending (`pendente`), awaiting (`aguardando_aprovacao`), inactive, and null status FAQs never appear in Gemini prompt | Zero leaks: `PROMPT_LEAK_PENDING`, `PROMPT_LEAK_AWAITING`, `PROMPT_LEAK_INACTIVE` absent | **PASS** |
| **Heuristic Precedence over Regex (Single isolated FAQ)** | Specific FAQ (e.g. electric car, Wi-Fi speed) takes precedence over generic regexes (`/garagem/`, `/wifi/`) | Specific FAQ returned instead of generic regex fallback | **PASS** |
| **Multi-FAQ Heuristic Disambiguation (`data/database.json`)** | Exact question *"O que fazer com as louças e a bandeja após o café da manhã?"* returns `faq-recolhimento-loucas` | Returns `faq-cafe-quarto` (score 4015 vs 715) due to exponential doubling and stop-word collision | **FAIL (BUG CONFIRMED)** |
| **Corporate Rule Disambiguation (`data/database.json`)** | *"Qual o procedimento para reservas corporativas com faturamento?"* returns corporate FAQ | Returns `faq-regras-pets` (score 120 vs 105) due to unmasked stop words ("qual", "para", "com") | **FAIL (BUG CONFIRMED)** |
| **Standard Check-in Disambiguation (`data/database.json`)** | *"Qual é o horário padrão de check-in e como funciona a entrada?"* returns `faq-checkin-14h` | Returns `faq-early-checkin-direto` | **FAIL (BUG CONFIRMED)** |
| **Immunity of Pending/Awaiting in Heuristics** | Pending/awaiting FAQs never returned by heuristic fallback | Zero leaks: pending and awaiting FAQs completely ignored | **PASS** |
| **Phone Normalization Resilience** | Formats with DDI (+55), spaces, hyphens, and 8/9 digits match seamlessly in `isFaqApplicableToClient` | Full equivalence verified across all formats | **PASS** |
| **Execution of `tests/whatsapp-ai-agent.test.mjs`** | Runs with exit code 0 under 5.0 seconds | 24 tests passed, 0 failures, duration 4.84s, exit code 0 | **PASS** |
| **Twin-Server SHA-256 Parity** | `artifacts/api-server/` matches byte-for-byte with `scripts/` | 100% SHA256 MATCH across all files | **PASS** |

---

## Unchallenged Areas

- **Frontend Vue/React Components in `artifacts/limpeza`**: Out of scope for Challenger 1 (assigned to Challenger 2 / UI reviews).
- **Z-API Webhook network integration**: Live external webhook delivery mock-verified; real carrier network traffic out of scope.
