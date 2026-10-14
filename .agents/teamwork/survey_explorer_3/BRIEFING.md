# BRIEFING — 2026-10-14T09:42:00Z

## Mission
Investigate WhatsApp Fiscal Assistant Flow, Z-API Webhook & Bot Actions, Sender Resolution & CRM Linking, Validation/Sanitization/Enrichment (Modulo 11, toTitleCase, lookupCnpj, lookupCep), and Testing Architecture (`tests/nfse-crm-whatsapp-flow.test.mjs`, twin-server parity, AGENTS.md rules).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesis
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3
- Original parent: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c
- Milestone: survey
- Subagent task: Survey Explorer 3 (WhatsApp Fiscal Assistant Flow, Validation & Testing Architecture)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write only to .agents/teamwork/survey_explorer_3/
- Never write source code, tests, or data files in .agents/teamwork/
- Use send_message to report completion to parent orchestrator
- Strictly follow AGENTS.md: no global test runs, zero side effects on production or unrequested modules

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T09:42:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/zapi-service.mjs` & `scripts/zapi-service.mjs` (lines 6108–6368, 6401–6475)
  - `artifacts/api-server/whatsapp-ai-service.mjs` & `scripts/whatsapp-ai-service.mjs` (lines 264–400, 3198–3205, 4814–5200, 6237–6595)
  - `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs` (lines 27275–27480, 28669–28780, 22069–22200, 15060–15280)
  - `artifacts/api-server/national-nfse.mjs`, `giss-soap.mjs`, `chat-service.mjs`, `lookup.mjs`
  - `artifacts/limpeza/src/pages/fiscal-invoices.tsx`, `crm-guests.tsx`
  - `tests/` directory patterns, `AGENTS.md` rules
- **Key findings**:
  1. WhatsApp Inbound pipeline routes to `processAiInboundMessage`. Currently, fiscal requests match `classifyUnmetDemand` as unhandled capability (`emissao_nota_fiscal`), requiring an active intent interceptor.
  2. Sender phone resolution must match `r.guestPhone`, `r.phone`, and `r.requesterInfo?.phone` in `db.reservations`, and link to `db.guests` and `db.companies`.
  3. Conditional logic: If contact is already linked to a company in `db.companies` with valid CNPJ, NEVER ask for data again; confirm company details immediately, set `autoEmitInvoice=true`, and link reservation. If not linked, prompt for PJ vs PF and set `conv.awaitingFiscalData = true`.
  4. Validation/sanitization uses Modulo 11 (`isValidCpf`, `isValidCnpj`), `toTitleCase` with acronym/preposition preservation, `cleanPhone`, `cleanCep`, and `lookupCnpj`/`lookupCep` (prioritizing local CRM lookups).
  5. `POST /api/nfse/emit` has a `ReferenceError` returning undefined `numNfseReal`/`codVerifReal` and omits tomador address fields. `POST /api/companies` lacks address fields.
  6. `scripts/` is missing `chat-service.mjs`, `national-nfse.mjs`, `giss-soap.mjs`, and `lookup.mjs`, breaking twin parity.
  7. Strict testing rule (`AGENTS.md`): Only run `tests/nfse-crm-whatsapp-flow.test.mjs`, never global tests.
- **Unexplored areas**: None. All 5 assigned objectives are thoroughly audited and mapped.

## Key Decisions Made
- Completed technical survey and documented detailed architecture in `survey_report.md`.
- Formulated complete 5-component report in `handoff.md`.
- Ready to hand off findings to orchestrator.

## Artifact Index
- `DISPATCH.md` — incoming dispatch record
- `BRIEFING.md` — persistent state index
- `progress.md` — liveness heartbeat
- `survey_report.md` — comprehensive technical survey findings report
- `handoff.md` — authoritative 5-component handoff report
