# Dispatch — Milestone 2 Explorer 1 (Inbound Auto-Detection)

## Objective
Investigate how inbound messages are processed in `zapi-service.mjs` and `whatsapp-ai-service.mjs`:
1. Find where incoming customer messages trigger Sofia AI evaluation in `processAiInboundMessage`.
2. Determine how to detect when a customer question is unmapped (i.e. low confidence or triggers human handover/fallback).
3. Design the exact logic to auto-create a pending FAQ entry in `db.faqItems`:
   - `id`: `faq_${Date.now()}_${random}`
   - `question`: message text
   - `answer`: "" (or null)
   - `category`: infer or default to "reservas" / appropriate category
   - `status`: "pendente"
   - `source`: "auto_aprendizado"
   - `clientPhones`: [senderPhone]
   - `scope`: "all"
   - `metadata`: `{ customerPhone, customerName, askedAt: ISOString }`
4. Formulate the exact code diff for `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`.

Write `analysis.md` and `handoff.md` in your working directory. Notify orchestrator via `send_message`.


## 2026-10-11T03:03:56Z
You are Milestone 2 Explorer 1 for Guest-Flow-Manager.
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_1
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Investigate inbound webhook and unmapped question auto-detection in zapi-service.mjs and whatsapp-ai-service.mjs.
Provide recommended implementation diffs for both artifacts/ and scripts/.
Write analysis.md and handoff.md in your working directory.
When done, notify me via send_message with a summary and handoff path.
