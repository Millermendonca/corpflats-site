# BRIEFING — 2026-10-14T09:55:00Z

## Mission
Audit, map, and analyze the entire NFS-e emission engine (Municipal GISS and National ADN), tomador CRM data propagation, undefined variable bug in `POST /api/nfse/emit`, checkout auto-emission, and fiscal chat assistant.

## 🔒 My Identity
- Archetype: explorer
- Roles: backend investigation, architecture analysis, payment flows, API specification
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1
- Original parent: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c
- Milestone: Investigation & Survey
- Roles (added 2026-10-14): NFS-e engine audit, municipal/national tax engine mapping, fiscal chat audit, CRM-to-invoice data flow analysis
- Milestone (added 2026-10-14): Survey Explorer 1 (NFS-e Engine & Emission Audit)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Deliver findings in `survey_report.md` and `handoff.md`
- Never modify production source code in this phase
- Keep all metadata files strictly in `.agents/teamwork/survey_explorer_1`
- Escopo estrito de testes (AGENTS.md): NUNCA executar varreduras globais nem testes de outros módulos
- Twin-server parity byte-a-byte between scripts/demo-server.mjs and artifacts/api-server/demo-server.mjs

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T09:55:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` (endpoints `/api/nfse/emit`, `/api/companies`, `/api/pms/guests`, checkout auto-invoice)
  - `artifacts/api-server/giss-soap.mjs` (SOAP ABRASF 2.04 engine, RPS/Lote building, XMLDSig signatures, Campos dos Goytacazes ws-goytacazes.giss.com.br, polling, DANFSE HTML)
  - `artifacts/api-server/national-nfse.mjs` (ADN / SEFIN Nacional mTLS REST, 50-digit access key generation, DPS payload, gzip+base64, DANFSE HTML)
  - `artifacts/api-server/chat-service.mjs` & `lookup.mjs` (fiscal chat parsing, template engine, BrasilAPI CNPJ and ViaCEP lookup)
  - `artifacts/api-server/whatsapp-ai-service.mjs` (inbound message processing, unmet demand classification for fiscal requests)
  - `artifacts/limpeza/src/pages/fiscal-invoices.tsx` (invoice UI, guest selector, hardcoded address, missing company lookup)
  - `artifacts/limpeza/src/pages/crm-guests.tsx` (company modal, guest modal, payload gaps)
- **Key findings**:
  1. `POST /api/nfse/emit` throws `ReferenceError: numNfseReal is not defined` on line 27467 of `demo-server.mjs`.
  2. Route `/api/nfse/emit` completely ignores address fields passed by caller and hardcodes call to GISS, never calling `processNationalInvoiceEmission`.
  3. Checkout auto-emission and fiscal pre-fill completely ignore `companyId` / `db.companies` and bill to guest PF even when corporate B2B company is linked.
  4. Fiscal chat assistant saves CNPJ as a guest in `db.guests` rather than `db.companies`.
  5. WhatsApp AI service currently flags tax requests as unmet demands (`capability_missing`), lacking conversational solicitation, verification of linked companies, and enrichment.
  6. `scripts/` lacks helper files `giss-soap.mjs`, `national-nfse.mjs`, `chat-service.mjs`, `lookup.mjs`.
- **Unexplored areas**: None. Complete investigation accomplished and documented.

## Key Decisions Made
- Compiled exhaustive 5-component handoff report in `handoff.md`.
- Documented full architectural audit and remediation plan in `survey_report.md`.
- Ready for orchestrator and implementers.

## Artifact Index
- `DISPATCH.md` — Inbound message log
- `BRIEFING.md` — Persistent situational memory
- `progress.md` — Liveness heartbeat and milestone tracking
- `survey_report.md` — Full investigation findings and architectural specification
- `handoff.md` — 5-component handoff report
