# Dispatch — Milestone 2 Explorer 3 (Sofia AI Integration & Tests)

## Objective
Investigate Sofia motor integration in `whatsapp-ai-service.mjs` and test suite design:
1. Examine `generateAiWhatsAppResponse` and `generateHeuristicResponse`:
   - How system prompt is constructed for Gemini.
   - How to filter `db.faqItems` using `isFaqApplicableToClient(faq, clientPhone)` with `faq.status === 'ativo'`.
   - How to format and inject applicable active FAQs into the Gemini system prompt:
     e.g., `## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):\n` + formatted list of questions and answers.
   - In `generateHeuristicResponse`, how to check keywords and variations of active applicable FAQs before falling back.
2. Design test additions for Milestone 2 in `tests/whatsapp-ai-agent.test.mjs`:
   - Test auto-creation of `status: "pendente"` FAQ on unmapped inbound query.
   - Test operator `fromMe: true` or chat message linking `suggestedAnswer` and setting `status: "aguardando_aprovacao"`.
   - Test Sofia dynamic prompt injection with client exception rules (checking that excluded phones do not receive excluded FAQ content).
3. Formulate the exact code diffs.

Write `analysis.md` and `handoff.md` in your working directory. Notify orchestrator via `send_message`.


## 2026-10-11T03:03:56Z
You are Milestone 2 Explorer 3 for Guest-Flow-Manager.
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_3
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

MANDATORY INSTRUCTION: You MUST read ORIGINAL_REQUEST.md before starting:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Read task instructions in:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_3\DISPATCH.md
and the project roadmap:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Investigate Sofia motor integration in whatsapp-ai-service.mjs (injecting active applicable FAQs filtered with isFaqApplicableToClient into Gemini prompt and heuristic fallback), and design M2 test cases for tests/whatsapp-ai-agent.test.mjs.
Provide recommended implementation diffs.
Write analysis.md and handoff.md in your working directory.
When done, notify me via send_message with a summary and handoff path.
