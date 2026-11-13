# Dispatch History

## 2026-10-11T23:28:28Z
You are Worker 1 (Backend Core & AI Coaching Engine Specialist).
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_1.
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager.
Authoritative Requirements: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (Seção ## Follow-up — 2026-10-11T23:13:31Z).
Read the technical blueprints from Explorer 1 and Explorer 2:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1\handoff.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

STRICT AGENTS.MD RULES:
1. NUNCA executar testes globais, varreduras ou em lote (PROIBIDO rodar tests/*.test.mjs).
2. Apenas teste estritamente pontual: execute EXCLUSIVAMENTE node --test tests/developer-ai-coaching.test.mjs.
3. Twin-Server Parity Mandate: Garanta 100% de paridade SHA-256 entre scripts/ e artifacts/api-server/ para todos os arquivos alterados.

YOUR EXCLUSIVE WRITE OWNERSHIP:
- scripts/zapi-service.mjs and artifacts/api-server/zapi-service.mjs
- scripts/whatsapp-ai-service.mjs and artifacts/api-server/whatsapp-ai-service.mjs
- tests/developer-ai-coaching.test.mjs

TASK OBJECTIVES:
1. Reconcile pre-existing drift between scripts/whatsapp-ai-service.mjs and artifacts/api-server/whatsapp-ai-service.mjs (ensure both start from the updated version of scripts/).
2. Implement Developer Recognition & Persistent Pause Bypass (R1):
   - isDeveloperPhone helper for 22998505276 and 5522998505276 (both normalized and unnormalized).
   - 4-layer defense ensuring Miller's chat is never muted by aiPaused: true.
3. Implement Tri-Modal Intent & Coaching Engine (R1, R2, R3):
   - guest_simulation: Sofia answers questions as virtual concierge in calibrated tone.
   - tone_calibration: Non-literal interpretation of tone commands (e.g. "responda de forma mais curta por favor", "use menos emojis", "seja mais executiva"), updating aiConfig.toneSettings and aiConfig.systemPrompt without wiping core rules, responding with cordial confirmation + summary of calibration + live sample response in new tone.
   - factual_coaching: Factual corrections, schedule changes, flat rules saved to db.whatsappAiSettings.developerGuidelines with cordial confirmation.
4. Implement Dynamic Real-Time Prompt Injection (R4):
   - In generateAiWhatsAppResponse, dynamically inject active developerGuidelines and toneSettings at highest priority into Sofia's prompt for all guests.
   - In heuristic fallback (generateHeuristicResponse), also respect conciseness and guidelines so tests pass reliably without GEMINI_API_KEY.
5. Implement Rectification & Guidelines Endpoints (R3, R4):
   - POST /api/whatsapp/chat/:phone/correct-message (saves guideline, optionally sends cordial rectification to guest via WhatsApp, logs to chat).
   - Guidelines CRUD: GET /api/whatsapp/developer-guidelines, POST /api/whatsapp/developer-guidelines, DELETE /api/whatsapp/developer-guidelines/:id, PATCH /api/whatsapp/developer-guidelines/:id.
   - Update ensureDbDefaults to initialize db.whatsappAiSettings = { developerGuidelines: [] }.
6. Create Targeted Test Suite:
   - Create tests/developer-ai-coaching.test.mjs covering:
     a) Developer phone recognition & pause bypass immunity.
     b) Tri-modal classification (guest query vs tone calibration command vs factual coaching).
     c) Tone calibration execution: "responda de forma mais curta por favor" updates toneSettings and returns confirmation with sample.
     d) Factual coaching execution: saves to developerGuidelines.
     e) Endpoint POST /api/whatsapp/chat/:phone/correct-message dispatches rectification message and saves guideline.
     f) Dynamic reflection: Sofia's subsequent responses to a regular guest reflect newly calibrated tone and guidelines.
7. Execute ONLY the dedicated test:
   node --test tests/developer-ai-coaching.test.mjs
   and verify Twin-Server SHA-256 parity.
8. Write your completion report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_1\handoff.md and send a message.
