# Dispatch — Milestone 2 Round 2 Worker

## Objective
Implement targeted fixes for all issues identified by Reviewer 2, Challenger 1, and Challenger 2:
1. In `artifacts/api-server/whatsapp-ai-service.mjs` and `scripts/whatsapp-ai-service.mjs`:
   - In `generateHeuristicResponse`:
     - Fix variation score calculation: replace `score += Math.max(score, ...)` with additive scoring: `score += 40 + (common.length * 10)`.
     - Filter common Portuguese stop words (`new Set(["o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "por", "pelo", "pela", "pelos", "pelas", "com", "para", "pra", "pro", "e", "que", "se", "como", "qual", "quais", "quando", "onde", "quem", "tem", "ha", "e", "eh"])`) when calculating token intersections on query, questions, and variations.
     - Ensure specific queries don't collide with generic ones:
       - "Como funciona o café da manhã?" must match general breakfast `faq-cafe-quarto`, NOT `faq-recolhimento-loucas`.
       - "O que fazer com as louças e a bandeja após o café da manhã?" must match `faq-recolhimento-loucas` because of specific keywords ("louças", "bandeja").
       - "Qual o procedimento para reservas corporativas com faturamento?" must match corporate agreement `faq-rule-include-vip-convenio`, NOT pets.
       - "Qual é o horário padrão de check-in e como funciona a entrada?" must match `faq-checkin-14h`, NOT early check-in.
   - In `isPotentialGuestQuestion`:
     - Discard common greetings/courtesies even if ending in `?` (e.g. "Tudo bem?", "Como vai?", "Como está?", "Oi tudo bem?").
   - In `inferFaqCategory`:
     - Reorder category evaluation: evaluate specific categories (`regras_visitas_pets`, `lazer_condominio`, `garagem`, `cafe_manha`) BEFORE generic accommodation (`estrutura_flat`).
   - In `findExistingPendingFaq`:
     - Normalize text with `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` before comparison so diacritics ("têm" vs "tem") don't cause duplicate pending items for the same client phone.
2. In `tests/whatsapp-ai-agent.test.mjs`:
   - In Test 23, mock `global.fetch` (matching the pattern in Tests 20 & 21) so it doesn't perform a live unmocked HTTP call to Gemini, preventing the 3-second network timeout.
3. Cryptographic Byte Parity:
   - Ensure 100% SHA-256 byte parity between `artifacts/api-server/` and `scripts/` across all 7 mirrored file pairs.
4. Testing:
   - Verify `node --test tests/whatsapp-ai-agent.test.mjs` passes all 24 tests in < 3s with exit code 0.
   - Verify `node --test tests/challenger-m2-c1-injection-heuristic.test.mjs` and `node --test tests/m2-challenger-2-stress.test.mjs` pass cleanly.
5. Git commit & `git push origin main` per AGENTS.md.

## Write Ownership
- `artifacts/api-server/whatsapp-ai-service.mjs`
- `scripts/whatsapp-ai-service.mjs`
- `tests/whatsapp-ai-agent.test.mjs`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
