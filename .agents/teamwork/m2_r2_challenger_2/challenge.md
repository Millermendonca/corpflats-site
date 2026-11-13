# Challenge Report — Milestone 2 Round 2 Challenger 2
**Agent**: `m2_r2_challenger_2` (Roles: critic, specialist)  
**Date**: 2026-10-11T04:15:30Z  
**Verdict**: **APPROVE**

---

## Challenge Summary

**Overall risk assessment**: **LOW**

All 5 core auto-learning and heuristic edge cases identified in Round 1 were subjected to rigorous, adversarial empirical testing. Every edge case has been resolved cleanly and verified with zero regressions.

1. **Standalone Social Courtesies Filter**: `isPotentialGuestQuestion("Tudo bem?")` correctly evaluates to `false`. Greetings with question marks ("Tudo bem?", "Como vai?", "Beleza?", "Oi, tudo bem?", etc.) do not trigger unmapped FAQ creation, while composite messages containing legitimate questions alongside greetings ("Tudo bem? Gostaria de saber o horário da piscina") continue to evaluate to `true`.
2. **Category Precedence Order**: `inferFaqCategory("Aceitam cachorro no apartamento?")` correctly returns `"regras_visitas_pets"` instead of `"estrutura_flat"`. Specific domain categories now take precedence over generic lodging terms (`apartamento`, `flat`, `quarto`).
3. **Diacritic Normalization in Deduplication**: `findExistingPendingFaq` and `autoCreatePendingFaq` normalize text using Unicode NFD decomposition (`normalize("NFD").replace(/[\u0300-\u036f]/g, "")`), correctly resolving "têm" vs "tem", "café" vs "cafe", and "horário" vs "horario" to the same pending record without database bloat.
4. **Test 23 Runtime Performance**: Test 23 in `tests/whatsapp-ai-agent.test.mjs` executes in ~7ms to ~17ms via `globalThis.fetch` mock, keeping total suite execution well below the mandated 3.0s threshold (suite runtime ~2.56s).
5. **Main Test Suite**: `node --test tests/whatsapp-ai-agent.test.mjs` passes 24/24 tests with exit code 0.
6. **Challenger Suites**:
   - `tests/m2-challenger-2-stress.test.mjs`: 10/10 tests pass (100%).
   - `tests/challenger-m2-c1-injection-heuristic.test.mjs`: 6/6 tests pass (100%).
7. **Twin-Server Byte Parity**: SHA-256 hashes between `artifacts/api-server/` and `scripts/` are 100% identical across all 7 mirrored files.

---

## Challenges & Empirical Probes

### [Low] Edge Case 1: Interrogative Social Niceties ("Tudo bem?", "Como vai?")
- **Assumption challenged**: Standalone courtesies containing question marks might get trapped as pending FAQ questions, polluting the unanswered questions queue.
- **Attack scenario**: Sending pure greetings ending with question marks ("Tudo bem?", "Como está?", "Oi, tudo bem?").
- **Empirical Probe Results**:
  - `"Tudo bem?"` → `isPotentialGuestQuestion` = `false` [PASS]
  - `"tudo bem?"` → `isPotentialGuestQuestion` = `false` [PASS]
  - `"Tudo bom?"` → `isPotentialGuestQuestion` = `false` [PASS]
  - `"Como vai?"` → `isPotentialGuestQuestion` = `false` [PASS]
  - `"Oi, tudo bem?"` → `isPotentialGuestQuestion` = `false` [PASS]
  - `"Bom dia, tudo bem?"` → `isPotentialGuestQuestion` = `false` [PASS]
  - `"Tudo bem? Gostaria de saber o horário da piscina"` → `isPotentialGuestQuestion` = `true` [PASS]
  - `"Olá, aceitam pets no flat?"` → `isPotentialGuestQuestion` = `true` [PASS]
- **Blast radius**: Negligible. Cleanly separated.
- **Status**: **RESOLVED & APPROVED**

### [Low] Edge Case 2: Precedence Collision in Category Inference
- **Assumption challenged**: Words like "apartamento" or "flat" in `estrutura_flat` might shadow pet, parking, pool, or visit inquiries.
- **Attack scenario**: Formulating queries combining pet terms with apartment terms: "Aceitam cachorro no apartamento?".
- **Empirical Probe Results**:
  - `"Aceitam cachorro no apartamento?"` → `"regras_visitas_pets"` [PASS]
  - `"Aceitam pet no apartamento?"` → `"regras_visitas_pets"` [PASS]
  - `"Posso levar meu cão para o flat?"` → `"regras_visitas_pets"` [PASS]
  - `"Posso receber visita de amigos no quarto?"` → `"regras_visitas_pets"` [PASS]
  - `"Qual a senha do wifi no quarto?"` → `"wifi_tecnologia"` [PASS]
  - `"Tem vaga de garagem para o apartamento?"` → `"garagem"` [PASS]
  - `"Qual o horário de funcionamento da piscina do condomínio?"` → `"lazer_condominio"` [PASS]
  - `"Tem ferro de passar roupa no apartamento?"` → `"estrutura_flat"` [PASS]
- **Blast radius**: Negligible. High category precision achieved.
- **Status**: **RESOLVED & APPROVED**

### [Low] Edge Case 3: Diacritic Deduplication Bypass
- **Assumption challenged**: Morphological variants ("Vocês têm ferro?" vs "Tem ferro?") could create duplicate pending FAQ records.
- **Attack scenario**: Consecutive submissions by same client with accented and unaccented verb conjugations.
- **Empirical Probe Results**:
  - Submission 1: `"Tem ferro de passar roupa?"` → ID: `faq_1791691995114_gj5s8`
  - Submission 2: `"Vocês têm ferro de passar roupa?"` → ID: `faq_1791691995114_gj5s8`
  - Deduplicated count in database: exactly 1 item.
- **Blast radius**: Negligible. Unicode NFD normalization prevents redundant entries.
- **Status**: **RESOLVED & APPROVED**

---

## Stress Test Results Summary

| Scenario / Test | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| `isPotentialGuestQuestion("Tudo bem?")` | `false` | `false` | PASS |
| `isPotentialGuestQuestion("Como vai?")` | `false` | `false` | PASS |
| `isPotentialGuestQuestion("Tudo bem? Qual horário piscina?")` | `true` | `true` | PASS |
| `inferFaqCategory("Aceitam cachorro no apartamento?")` | `"regras_visitas_pets"` | `"regras_visitas_pets"` | PASS |
| `inferFaqCategory("Tem vaga na garagem do flat?")` | `"garagem"` | `"garagem"` | PASS |
| `findExistingPendingFaq` ("têm" vs "tem") | Match existing ID | Matched `faq_pending_1` | PASS |
| `autoCreatePendingFaq` deduplication | Count = 1, IDs match | Count = 1, IDs match | PASS |
| `tests/whatsapp-ai-agent.test.mjs` Test 23 runtime | < 100ms via mock | 6.9ms | PASS |
| `tests/whatsapp-ai-agent.test.mjs` total suite | 24/24 pass, < 3s | 24/24 pass, 2.56s | PASS |
| `tests/m2-challenger-2-stress.test.mjs` | 10/10 pass | 10/10 pass | PASS |
| `tests/challenger-m2-c1-injection-heuristic.test.mjs` | 6/6 pass | 6/6 pass | PASS |
| SHA-256 Parity (7 twin pairs) | 100% byte identical | 100% byte identical | PASS |

---

## Unchallenged Areas

- Endpoints `/api/bot-actions/*` (covered extensively in Milestone 1 and earlier test suites).
- FNRH document OCR/PDF endpoints (covered in previous milestones, unchanged in M2).
