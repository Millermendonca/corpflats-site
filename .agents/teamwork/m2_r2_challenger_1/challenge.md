# Challenge Report — Milestone 2 Round 2 Challenger 1 (Heuristic Scoring & Routing)

**Author**: Challenger 1 (`m2_r2_challenger_1`)  
**Date**: 2026-10-11T04:18:00Z  
**Verdict**: **APPROVE**  

---

## Challenge Summary

**Overall risk assessment**: **LOW** (All critical vulnerabilities from Round 1 resolved and verified empirically)

In Milestone 2 Round 1, Challenger 1 discovered that `generateHeuristicResponse` suffered from:
1. Exponential compounding of variation scores (`score += Math.max(score, 40 + common.length * 10)`), which doubled the entire accumulated score for each matching variation.
2. Lack of Portuguese stop words filtering, leading to spurious 2-token matches on words like "o", "a", "de", "que", "para", "com", "qual".
3. Collision/misrouting of exact queries to wrong or adjacent FAQs (e.g., breakfast tray query routed to breakfast in room, corporate billing routed to pet policy, standard 14h check-in routed to early check-in).

In Round 2, the worker refactored the scoring algorithm with:
- Portuguese stop words filtering (`PORTUGUESE_STOP_WORDS`).
- Dominant score (+200) for exact question matches.
- Single non-compounding best variation scoring (`bestVarScore = Math.max(bestVarScore, ...)` added once: `score += bestVarScore`).
- Distinctive keyword boosting (+40) for terms like "louças", "bandeja", "recolhimento", "convenio", "corporativo", "faturamento", "pet", "early check in".

All empirical probes confirm that the implementation is mathematically sound, robust against adversarial noisy variations, and routes with 100% accuracy.

---

## Stress Test Results

| Test Scenario | Implementation | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Query: *"O que fazer com as louças e a bandeja após o café da manhã?"* | `artifacts` & `scripts` | Routes to `faq-recolhimento-loucas` (Score 460) | Returned "Recolhimento de Louças & Bandejas" | **PASS** |
| Query: *"Como funciona o café da manhã?"* | `artifacts` & `scripts` | Routes to `faq-cafe-quarto` | Returned "Café da Manhã Exclusivo no Flat" | **PASS** |
| Query: *"Qual o procedimento para reservas corporativas com faturamento?"* (VIP Phone) | `artifacts` & `scripts` | Routes to `faq-rule-include-vip-convenio` | Returned "parceiro corporativo... faturamento" | **PASS** |
| Query: *"Qual é o horário padrão de check-in e como funciona a entrada?"* | `artifacts` & `scripts` | Routes to `faq-checkin-14h` | Returned "Check-in Oficial e Instruções de Entrada (14:00)" | **PASS** |
| Immunity to Variation Compounding (1, 5, 20 synthetic variations) | `artifacts` & `scripts` | Score is calculated additively once; variations do not overtake exact match | Exact FAQ wins against 50 noisy variations | **PASS** |
| Stop Words Filtering (*"Qual com para que de como onde quando?"*) | `artifacts` & `scripts` | No token matches generated; falls back to standard fallback template | Zero spurious token matches | **PASS** |
| 2-Token Stop Word Intersection (*"Qual o procedimento para atendimento com protocolo?"*) | `artifacts` & `scripts` | Stop words "para", "com" do not trigger 2-token rule | Zero false FAQ triggers | **PASS** |
| Client Phone Segmentation (*include_only* & *exclude*) | `artifacts` & `scripts` | Restricts access based on client telephone | Authorized phone gets custom answer; unauthorized gets generic | **PASS** |
| Status Filtration (*pendente*, *aguardando_aprovacao*, *inativo*) | `artifacts` & `scripts` | Only `ativo` FAQs are evaluated | Unapproved and inactive FAQs completely ignored | **PASS** |
| Distinctive Keyword Boosting (*"louças"*, *"pet"*, *"early check in"*) | `artifacts` & `scripts` | Keyword boost (+40) guarantees correct topic disambiguation | 100% routing to respective specialized FAQs | **PASS** |
| Throughput Stress Probe (1.000 queries over full DB) | `artifacts` & `scripts` | Execution speed < 1ms per query | Average 0.70ms/query (1,400+ queries/second) | **PASS** |
| Main Test Suite `node --test tests/whatsapp-ai-agent.test.mjs` | Main suite | 24/24 tests passing, exit code 0 | 24/24 pass, exit code 0 | **PASS** |
| Cryptographic SHA-256 Twin Parity | 7 twin files | 100% SHA-256 match | 100% identical hashes across all 7 pairs | **PASS** |
| Frontend Build in `artifacts/limpeza` | Vite build | Successful build without error | Exit code 0, `dist/public/` populated | **PASS** |

---

## Adversarial Challenges Evaluated

### Challenge 1: Multi-variation Flooding Attack
- **Hypothesis**: An adversarial FAQ with 50+ variations sharing words like "horário", "informação" could artificially boost its score and shadow a clean FAQ with an exact question match.
- **Result**: **Mitigated**. Because `bestVarScore` computes the maximum across variations and adds it only once (`score += bestVarScore`), having 50 variations yields the exact same score as having 1 variation. An exact match gives +200, which decisively overwhelms partial variation matches (max 150 for exact variation, or 40 + len*10 for token overlaps).
- **Verdict**: PASS.

### Challenge 2: Portuguese Interrogative Token Collision
- **Hypothesis**: Natural guest questions sharing interrogative phrases ("qual o", "como é", "o que", "para que") could collide with unrelated FAQs sharing the same syntax.
- **Result**: **Mitigated**. `PORTUGUESE_STOP_WORDS` eliminates 35 common Portuguese particles from `queryTokens`, `qTokens`, `vTokens`, and keywords. Only content-bearing nouns, verbs, and domain terms participate in token scoring.
- **Verdict**: PASS.

### Challenge 3: Twin Server Discrepancy
- **Hypothesis**: Fixes applied in `artifacts/api-server/whatsapp-ai-service.mjs` might diverge from `scripts/whatsapp-ai-service.mjs`.
- **Result**: **Mitigated**. SHA-256 hash `beb2b29116b8579db6d5178eaebbee9a486983d1a3175247905be2eafbd7db98` matches byte-for-byte between both files. Furthermore, our empirical test suite ran every assertion against both modules.
- **Verdict**: PASS.

---

## Unchallenged Areas

- WhatsApp live webhook integration with real Z-API network endpoints (simulated via mocks in test suite and offline unit probes; live Z-API external network credentials were not executed live to avoid sending unsolicited WhatsApp messages to actual hotel guests).

---

## Final Recommendation

**APPROVE**. The heuristic scoring engine is deterministic, performs with sub-millisecond latency, cleanly differentiates between general and specialized queries, and passes all empirical test harnesses.
