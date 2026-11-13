# Challenge Report — Milestone 2 Challenger 2 (Auto-Learning & Operator Capture)

## Challenge Summary

**Overall risk assessment**: HIGH  
**Verdict**: **`REQUEST_CHANGES`**

Empirical testing uncovered 3 functional defects in the Auto-Learning engine and 1 test harness bottleneck that exceeds the project's performance criteria:
1. **Critical Greeting Bypass**: Greetings containing question marks (specifically `"Tudo bem?"` or `"Tudo bom?"`) are incorrectly classified as unmapped guest questions, triggering automatic creation of pending FAQ items in `db.faqItems`. This directly breaks the requirement in `DISPATCH.md`: *"Send greetings ('Oi', 'Bom dia', 'Tudo bem?'). Verify NO pending FAQ is created."*
2. **Category Precedence Collision**: `inferFaqCategory` evaluates `estrutura_flat` (`/flat|quarto|apartamento/`) *before* `regras_visitas_pets` and `lazer_condominio`. Because guest inquiries routinely mention "no flat" or "no apartamento" (e.g., *"Aceitam cachorro no apartamento?"*, *"Pode receber visita no flat?"*, *"Tem piscina no flat?"*), these questions are misclassified as `estrutura_flat`.
3. **Deduplication Normalization Defect**: `findExistingPendingFaq` matches pending questions using raw `lower.includes(qLower)` without removing diacritics/accents. Submitting *"Tem ferro de passar?"* followed by *"Vocês têm ferro de passar?"* from the same guest fails deduplication due to `"têm"` vs `"tem"`, creating duplicate pending FAQ items.
4. **Unmocked Gemini Network Latency in Test 23**: Test 23 in `tests/whatsapp-ai-agent.test.mjs` executes `processAiInboundMessage` with a dummy Gemini API key without mocking `globalThis.fetch`. The test runner waits for 5 consecutive Gemini network request timeouts/aborts (~3,014ms), causing the test suite duration to exceed the mandatory 5.0-second limit (measured at 5.25s - 6.27s).

---

## Challenges

### [High] Challenge 1: Greeting "Tudo bem?" Triggers Unmapped FAQ Creation

- **Assumption challenged**: The worker assumed `isPotentialGuestQuestion` only captures actual knowledge base questions and that all greetings/confirmations are ignored.
- **Attack scenario**: A guest messages *"Tudo bem?"* or *"Olá, tudo bem?"*. Because the message ends with a question mark (`?`), line 1521 of `whatsapp-ai-service.mjs` (`if (t.includes("?")) return true;`) evaluates to `true`. Because `"tudo bem"` is absent from the greeting discard regex at line 1516 (`/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!.\s]*$/i`), the message is classified as an unmapped question. When Gemini is offline, disabled, or triggers fallback, `autoCreatePendingFaq` creates a pending FAQ for *"Tudo bem?"*.
- **Blast radius**: The admin knowledge base gets spammed with pending FAQ entries every time a guest opens a conversation with standard Portuguese greetings.
- **Empirical reproduction**:
  - Test `C1.2` in `tests/m2-challenger-2-stress.test.mjs`:
    ```javascript
    isPotentialGuestQuestion("Tudo bem?") // returns true (BUG)
    ```
- **Mitigation**: Update the greeting discard regex in `isPotentialGuestQuestion`:
  ```javascript
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi|tudo bem|tudo bom|como vai)[!?.\s]*$/i.test(lower)) return false;
  ```

---

### [High] Challenge 2: Category Precedence Bug in `inferFaqCategory`

- **Assumption challenged**: The category inference regex cleanly separates guest questions into relevant hotel domain categories.
- **Attack scenario**: A guest asks:
  - *"Aceitam cachorro de porte médio no apartamento?"*
  - *"Visitas podem pernoitar no flat?"*
  - *"Tem piscina na cobertura do flat?"*
- **Blast radius**: `inferFaqCategory` checks `estrutura_flat` (`/flat|quarto|apartamento.../`) on line 1544, *prior* to `regras_visitas_pets` (line 1545) and `lazer_condominio` (line 1546). Because almost every question mentions "flat", "quarto", or "apartamento", questions regarding pets, visitor policies, smoking, and leisure amenities are misrouted to `estrutura_flat`.
- **Empirical reproduction**:
  - Test `C1.3` in `tests/m2-challenger-2-stress.test.mjs`:
    ```javascript
    inferFaqCategory("Aceitam cachorro no apartamento?") // returns "estrutura_flat" instead of "regras_visitas_pets" (BUG)
    ```
- **Mitigation**: Reorder `inferFaqCategory` evaluations so specific domains (`regras_visitas_pets`, `lazer_condominio`, `wifi_tecnologia`, `cafe_manha`, `garagem`, `checkin_acesso`, `checkout`) are checked before `estrutura_flat`, or require specific furniture/utility keywords rather than generic accommodation nouns.

---

### [Medium] Challenge 3: Deduplication Fails on Accent/Diacritic Variations

- **Assumption challenged**: Multiple questions on the same subject from the same client are deduplicated, avoiding spam in `db.faqItems`.
- **Attack scenario**: A guest asks:
  1. *"Tem ferro de passar roupa?"* (creates pending FAQ item 1)
  2. *"Vocês têm ferro de passar roupa?"* (with circumflex on *"têm"*)
- **Blast radius**: `findExistingPendingFaq` does `const lower = text.toLowerCase().trim()` and checks `lower.includes(qLower) || qLower.includes(lower)`. Because Portuguese words like `tem`/`têm` and `voce`/`você` differ in diacritics, string inclusion fails. The system creates a duplicate pending FAQ item instead of appending to `variations`.
- **Empirical reproduction**:
  - Test `C1.4` in `tests/m2-challenger-2-stress.test.mjs`:
    `autoCreatePendingFaq` with `"Tem..."` followed by `"Vocês têm..."` generates 2 distinct pending items.
- **Mitigation**: Normalize both `lower` and `qLower` using `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` inside `findExistingPendingFaq`.

---

### [Medium] Challenge 4: Test Suite Runtime Exceeds 5.0 Seconds Due to Unmocked Fetch in Test 23

- **Assumption challenged**: Worker claimed `node --test tests/whatsapp-ai-agent.test.mjs` runs cleanly in < 5.0 seconds.
- **Attack scenario**: In `tests/whatsapp-ai-agent.test.mjs`, test 23 calls `processAiInboundMessage` without mocking `globalThis.fetch`. Because `mockDb.settings.geminiApiKey` is populated with a dummy key, `callGeminiAi` attempts 5 real HTTP requests to Google's API endpoint, waiting for abort/timeouts totaling 3,014ms.
- **Blast radius**: The test suite takes **5,247ms (suite duration) / 6,267ms (process duration)**, failing the explicit criteria in `DISPATCH.md` (*"Run `node --test tests/whatsapp-ai-agent.test.mjs` and confirm pass in < 5s with exit code 0"*).
- **Empirical reproduction**:
  - Direct execution:
    ```
    TAP version 13
    # Subtest: 23. Auto-Aprendizado Inbound: Pergunta Inédita Não Mapeada Gera FAQ com Status 'pendente'
    ok 23 - 23. Auto-Aprendizado Inbound: Pergunta Inédita Não Mapeada Gera FAQ com Status 'pendente'
      ---
      duration_ms: 3014.2254
      ...
    # duration_ms 6267.2427 (EXCEEDS 5000ms)
    ```
- **Mitigation**: Mock `globalThis.fetch` in test 23 (similar to tests 20 and 21) or pass a mock/empty Gemini key that triggers immediate fallback without network timeouts.

---

## Stress Test Results

| Scenario / Test Case | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| **C1.1: Unmapped question detection** | Questions like "Tem tomada para carro elétrico?" recognized as questions | Correctly recognized as question | **PASS** |
| **C1.2: Greeting "Tudo bem?" filtering** | "Tudo bem?" discarded as greeting (`false`) | Returned `true` due to `?` and regex omission | **FAIL (BUG)** |
| **C1.3: Pet rule category inference** | "Aceitam cachorro no apartamento?" -> `regras_visitas_pets` | Returned `estrutura_flat` | **FAIL (BUG)** |
| **C1.4: Accented deduplication ("têm" vs "tem")** | Merged into single pending FAQ with variation | Created 2 separate pending FAQ items | **FAIL (BUG)** |
| **C1.5: Identical text deduplication** | Merged into single pending FAQ | Correctly merged | **PASS** |
| **C2.1: Operator response capture (`linkOperatorResponseToPendingFaq`)** | Links `suggestedAnswer`, status -> `aguardando_aprovacao`, pauses AI | Correctly linked, status updated, `aiPaused: true` | **PASS** |
| **C2.2: Live Chat API capture (`POST /api/whatsapp/chats/:phone/messages`)** | Links pending FAQ and pauses AI | Correctly linked via `handleChatSend` | **PASS** |
| **C2.3: Z-API Webhook capture (`POST /api/whatsapp/webhook/received` with `fromMe: true`)** | Links pending FAQ and pauses AI | Correctly linked, status -> `aguardando_aprovacao` | **PASS** |
| **C2.4: 24h Expiration window enforcement** | Questions > 24h old are NOT linked | Return `null`, item remains `pendente` | **PASS** |
| **C2.5: Isolation of unapproved FAQs** | FAQs in `aguardando_aprovacao` never served by Sofia until approved | Sofia ignores until `status: "ativo"`, then uses immediately | **PASS** |
| **C3.1: SHA-256 Parity between `artifacts/` and `scripts/`** | Hashes match byte-for-byte | 100% SHA-256 match | **PASS** |
| **Suite Performance (`whatsapp-ai-agent.test.mjs`)** | Runs in < 5.0 seconds | Suite duration 5,247ms, process duration 6,267ms | **FAIL (SLOWNESS)** |

---

## Unchallenged Areas

- **Frontend React UI (`whatsapp-automation.tsx`)**: Out of scope for Milestone 2 Challenger 2 (specifically assigned to Challenger 1 and Milestone 1).
- **Tariff calculation engine (`tariff-engine.test.mjs`)**: Milestone 3 scope.

---

## Final Recommendation
**Verdict**: **`REQUEST_CHANGES`**  
The Milestone 2 Worker must:
1. Fix greeting discard regex in `isPotentialGuestQuestion` to include `"tudo bem"` / `"tudo bom"`.
2. Fix evaluation order in `inferFaqCategory` so `regras_visitas_pets` and `lazer_condominio` are not masked by `estrutura_flat`.
3. Normalize accents in `findExistingPendingFaq` to ensure robust deduplication.
4. Mock `globalThis.fetch` in test 23 of `tests/whatsapp-ai-agent.test.mjs` to eliminate the 3-second network timeout and keep test execution consistently under 2.5 seconds.
