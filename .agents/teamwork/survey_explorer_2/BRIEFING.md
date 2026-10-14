# BRIEFING — 2026-10-14T09:56:00Z

## Mission
Investigate and map CRM 360° backend data models & endpoints (companies, guests, reservations) and UI components (`crm-guests.tsx` and `fiscal-invoices.tsx`), identifying missing fiscal/address fields, CRM selector capabilities, borrower auto-population (Company PJ vs Guest PF toggle), and URL parameter passing.

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: explorer, analyst, investigator
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2
- Original parent: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Milestone: Survey Explorer 2 (CRM 360° Models & Fiscal Invoices UI)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Never execute global tests (`tests/*.test.mjs`) or broad sweeps
- Adhere strictly to project guidelines (AGENTS.md, PROJECT.md)
- Report findings in `handoff.md` and notify parent via `send_message`

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T09:56:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs`: `db.companies`, `/api/companies`, `db.guests`, `/api/pms/guests`, `db.reservations`, `/api/pms/reservations`, `POST /api/nfse/emit`, `reconcileAndMergeGuests`.
  - `artifacts/limpeza/src/pages/crm-guests.tsx`: Company Modal (`companyModalOpen`), Guest Modal (`guestModalOpen`), `handleSaveCompany`, `handleSaveGuest`.
  - `artifacts/limpeza/src/pages/fiscal-invoices.tsx`: Combobox selector, `handleSelectGuest`, `handleEmitInvoice`, URL search params reading.
- **Key findings**:
  - `POST /api/companies` drops `cep`, `address`, `number`, `neighborhood`, `city`, `state`, `ibgeCode`.
  - `POST /api/pms/guests` and `handleUpdateGuest` whitelist drops `cep`, `address`, `number`, `neighborhood`, `state`, `ibgeCode`.
  - `POST /api/nfse/emit` has a `ReferenceError` on undefined `numNfseReal` and `codVerifReal` and does not persist tomador address.
  - `crm-guests.tsx` modals miss address inputs for both Companies and Guests.
  - `fiscal-invoices.tsx` only searches guests, ignores `companyId` for tomador, lacks quick toggle (PJ vs PF), and misses query parameters beyond `doc` and `nome`.
- **Unexplored areas**: None within the assigned scope. All 4 objectives investigated.

## Key Decisions Made
- Comprehensive report structure drafted according to the 5-component handoff protocol.
- Detailed proposals with exact file paths, line numbers, and before/after code snippets prepared for implementer.

## Artifact Index
- `progress.md` — Liveness heartbeat and milestone tracking
- `handoff.md` — Final structured report with 5 components
