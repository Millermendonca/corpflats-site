# Dispatch — Milestone 3 Explorer 2 (FAQ UI & Hook Spec)

## Objective
Design the complete UI implementation for Feature 8-11:
1. Examine the backend REST API contract from Milestone 1 (`GET /api/whatsapp/faq`, `POST /api/whatsapp/faq`, `PUT /api/whatsapp/faq/:id`, `DELETE /api/whatsapp/faq/:id`, `POST /api/whatsapp/faq/:id/approve`).
2. Design the hook `use-faq.ts` (or component state) to handle:
   - loading, error, items list.
   - search, category filter (all 9 categories), status filter ("Todas", "Ativas", "Perguntas Pendentes", "Sugestões de IA para Aprovar").
   - create, update, delete, approve operations.
3. Design the FAQ tab UI (`FaqKnowledgeBase`):
   - Category cards summary and filter pills.
   - Table or card list of FAQs with badges for status (`ativo` green, `pendente` yellow, `aguardando_aprovacao` purple/blue) and scope (`all` gray, `exclude` orange, `include_only` blue).
   - 1-click approval button for items with `status === "aguardando_aprovacao"`.
   - Create/Edit Modal Dialog:
     - Question, Answer textarea, Category select (9 categories), Keywords input, Variations input.
     - Exception Rule config: Scope radio/select (`all`, `exclude`, `include_only`) and Phone numbers input.
4. Provide the exact implementation code ready for the worker.

Write `analysis.md` and `handoff.md` in your working directory. Notify orchestrator via `send_message`.


## 2026-10-11T04:20:17Z
[Message] sender=27c61f6a-5652-421c-bbda-1b5d6be7db98 priority=MESSAGE_PRIORITY_HIGH
Design the complete UI implementation for the new FAQ tab in whatsapp-automation.tsx (or subcomponent), use-faq hook, category cards/table view, 4 status filters, create/edit modal with exception configuration (all, exclude, include_only with phones), and 1-click approval button.
Provide ready-to-use TypeScript/React code.
Write analysis.md and handoff.md in your working directory.
When done, notify me via send_message with a summary and handoff path.
