# Dispatch — Milestone 2 Worker (Auto-Learning & Sofia Motor Integration)

## Objective
Implement Features 5, 6, and 7 of Milestone 2:
1. Inbound Webhook Unmapped Question Auto-Detection:
   - In `whatsapp-ai-service.mjs` and `zapi-service.mjs`, when an incoming customer question triggers handover or fallback and is not mapped to an active FAQ, auto-create a FAQ item in `db.faqItems` with `status: "pendente"`, `source: "auto_aprendizado"`, inferred category, keywords, customer phone, and question.
2. Operator Human Response Capture:
   - In `zapi-service.mjs`, when operator sends a message (`fromMe: true` in webhook OR in chat send endpoints `POST /api/whatsapp/chat/send` and `POST /api/whatsapp/chats/:phone/messages`):
   - Link operator's response to the most recent `status: "pendente"` FAQ for that customer phone in the last 24h as `suggestedAnswer`, transition status to `"aguardando_aprovacao"`, and pause AI on the conversation (`aiPaused: true`).
3. Sofia Motor Integration:
   - In `whatsapp-ai-service.mjs`:
     - In `generateAiWhatsAppResponse`, filter active FAQs with `faq.status === 'ativo' && isFaqApplicableToClient(faq, phone)`. Inject formatted active FAQ rules into the Gemini system prompt context string.
     - In `generateHeuristicResponse`, match against active applicable FAQ questions, variations, and keywords before fallback.
4. Test Suite Additions:
   - In `tests/whatsapp-ai-agent.test.mjs`, add Tests 21 to 24 verifying:
     - Test 21: Sofia prompt injection includes applicable FAQs and respects client exception rules (exclude/include_only).
     - Test 22: Heuristic fallback matches active FAQ keywords.
     - Test 23: Inbound unmapped question auto-creates `status: "pendente"` FAQ item.
     - Test 24: Operator response (`fromMe: true` or chat API) links `suggestedAnswer`, transitions to `"aguardando_aprovacao"`, and pauses AI.
5. Code Parity:
   - Maintain 100% SHA-256 byte parity between `artifacts/api-server/` and `scripts/` across all mirrored files (`whatsapp-ai-service.mjs`, `zapi-service.mjs`, `demo-server.mjs`).
6. Run `node --test tests/whatsapp-ai-agent.test.mjs` to confirm all tests (1-24) pass cleanly in < 5s with exit code 0.

## Explorer References
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_2\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_3\handoff.md`

## Write Ownership
- `artifacts/api-server/whatsapp-ai-service.mjs`
- `scripts/whatsapp-ai-service.mjs`
- `artifacts/api-server/zapi-service.mjs`
- `scripts/zapi-service.mjs`
- `tests/whatsapp-ai-agent.test.mjs`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-10-11T03:12:31Z
You are the Worker for Milestone 2 (Auto-Learning & Sofia Motor Integration) for Guest-Flow-Manager.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker
The project root is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

MANDATORY INSTRUCTION: You MUST read the Original User Request file before starting:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Also read your task instructions in:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker\DISPATCH.md
and the Explorer handoffs:
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1\handoff.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_2\handoff.md
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_3\handoff.md

Write ownership:
You own exclusively:
- artifacts/api-server/whatsapp-ai-service.mjs and scripts/whatsapp-ai-service.mjs
- artifacts/api-server/zapi-service.mjs and scripts/zapi-service.mjs
- tests/whatsapp-ai-agent.test.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. In whatsapp-ai-service.mjs (both artifacts/ and scripts/):
   - In generateAiWhatsAppResponse: filter active FAQs with `faq.status === 'ativo' && isFaqApplicableToClient(faq, phone)`. Inject formatted block `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):\n` into the contextString.
   - In generateHeuristicResponse: accept dbOrFaqs (4th arg) and match active applicable FAQs questions, variations, and keywords before general fallback.
   - In processAiInboundMessage: on unmapped question triggering handover/fallback, auto-create a FAQ item in db.faqItems with status: "pendente", source: "auto_aprendizado", inferred category, keywords, customer phone and question.
2. In zapi-service.mjs (both artifacts/ and scripts/):
   - In webhook received (fromMe: true / isFromMe: true) and chat send endpoints (POST /api/whatsapp/chat/send and POST /api/whatsapp/chats/:phone/messages):
   - Implement linkOperatorResponseToPendingFaq: find recent pending FAQ item for that clientPhone within 24h, set suggestedAnswer = text, status = "aguardando_aprovacao", and pause conversation AI.
3. Maintain 100% SHA-256 byte parity between artifacts/api-server/ and scripts/ across all mirrored files.
4. In tests/whatsapp-ai-agent.test.mjs:
   - Add tests 21-24 covering Gemini prompt injection with client rules, heuristic FAQ match, inbound auto-learning pending creation, and operator response capture with status "aguardando_aprovacao" and AI pause.
   - Ensure graceful teardown and exit (setTimeout(() => process.exit(process.exitCode || 0), 100)).
5. Run `node --test tests/whatsapp-ai-agent.test.mjs` and confirm all 24 tests pass cleanly with exit code 0 in < 5s.
6. Write handoff.md in your working directory.
When done, notify me via send_message with a summary and handoff path.
