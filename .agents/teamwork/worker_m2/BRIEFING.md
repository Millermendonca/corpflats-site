# BRIEFING — 2026-10-14T10:25:00Z

## Mission
M2: Implement CRM 360° Alignment & Fiscal Invoices UI (Features F6 to F11): Company & Guest Address/Fiscal Persistence, CRM Modals UI Expansion, and Fiscal Invoices Multi-Entity Selector with PF/PJ Tomador Toggle.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2
- Original parent: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Milestone: Milestone 2 (CRM 360° Alignment & Fiscal Invoices UI)

## 🔒 Key Constraints
- DO NOT CHEAT: Genuine implementations only, no dummy/facade implementations, no hardcoded test results.
- STRICT TEST SCOPE: NEVER run global tests (`tests/*.test.mjs` or test sweeps). Run EXCLUSIVELY the designated spot test if needed.
- TWIN SERVER PARITY: 100% byte-for-byte SHA-256 parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
- BUILD OF FRONTEND: Build `artifacts/limpeza` (`npm run build`) and update `artifacts/limpeza/dist/`.
- GIT PUSH: Always git push after committing.
- EXCLUSIVE WRITE SCOPE:
  - `artifacts/api-server/demo-server.mjs` (endpoints `/api/companies` and `/api/pms/guests`)
  - `scripts/demo-server.mjs` (100% identical copy)
  - `artifacts/limpeza/src/pages/crm-guests.tsx`
  - `artifacts/limpeza/src/pages/fiscal-invoices.tsx`
  - `artifacts/limpeza/dist/` (via build)

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T10:25:00Z

## Task Summary
- **What to build**:
  1. Backend Address & Fiscal Persistence in `demo-server.mjs` (twin mirror):
     - `POST /api/companies` and `PATCH /api/companies/:id`: accept & persist address & fiscal fields with bilingual tolerance.
     - `POST /api/pms/guests` and `PUT/PATCH /api/pms/guests/:id`: whitelist & persist address & fiscal fields, `companyId`, `autoEmitInvoice`.
     - `mergeGuestRecords`: preserve `cep`, `number`, `neighborhood`, `companyId`, `companyName`, `autoEmitInvoice`.
  2. Frontend CRM Modals in `crm-guests.tsx`:
     - Company modal: inputs for CEP, address, number, complement, neighborhood, city, UF, IBGE, state/municipal reg, phone, contact.
     - Save/edit company handling and CNPJ lookup enrichment.
     - Quick shortcut "Emitir NFS-e" in companies table.
     - Guest modal: inputs for CEP, address, number, complement, neighborhood, UF, IBGE.
     - Save/edit guest handling with address persistence.
  3. Frontend Fiscal Invoices UI in `fiscal-invoices.tsx`:
     - Multi-entity CRM selector: Guests (PF), Companies (PJ), active/recent Reservations.
     - Auto-fill company as tomador when guest has `companyId`, preserving guest/stay in service description.
     - Quick toggle button between PJ (linked company) and PF (guest).
     - Stay data prefill from reservation (flat, dates, value, daily rates).
     - Full URL query params handling (`flat`, `checkin`, `checkout`, `valor`, `diarias`, `resCode`, `doc`, `nome`, `companyId`, `guestId`).
  4. Twin parity verification & `npm run build` in `artifacts/limpeza`.
- **Success criteria**: All F6 to F11 features working, frontend builds cleanly (exit code 0), twin server has 100% SHA-256 match.
- **Interface contracts**: `PROJECT.md` § Interface Contracts
- **Code layout**: `PROJECT.md` § Code Layout

## Key Decisions Made
- Backend Address & Fiscal Normalization: Whitelisted all address/fiscal fields in `demo-server.mjs` with bilingual fallback support (`address`/`logradouro`, `number`/`numero`, `neighborhood`/`bairro`, `city`/`cidade`/`municipio`, `state`/`uf`, `ibgeCode`/`codigoMunicipio`).
- In `mergeGuestRecords`, preserved address, companyId, companyName, and autoEmitInvoice across record deduplication.
- In `crm-guests.tsx`, expanded Company and Guest dialogs with CEP lookup integration, address fields, and added quick action shortcut "Emitir NFS-e" in the Companies table linking to `/notas?doc=...&nome=...&companyId=...`.
- In `fiscal-invoices.tsx`, implemented multi-entity CRM selector grouping Hóspedes (PF), Empresas (PJ), and Reservas (Estadias) with visual badges and rich search.
- Added corporate Tomador auto-fill when a guest has a linked company, preserving the guest/stay in service description.
- Added a high-visibility PJ/PF Tomador Toggle Banner allowing seamless switching between corporate PJ and collaborator PF without losing stay dates, apartment, or values.
- Integrated full URL parameter pre-filling supporting `flat`, `checkin`, `checkout`, `valor`, `diarias`, `resCode`, `doc`, `nome`, `companyId`, `guestId`.

## Artifact Index
- `artifacts/api-server/demo-server.mjs` — Backend server with company & guest fiscal persistence
- `scripts/demo-server.mjs` — Twin mirror of demo-server.mjs (100% SHA-256 match)
- `artifacts/limpeza/src/pages/crm-guests.tsx` — CRM guest & company modals with full address fields and invoice shortcut
- `artifacts/limpeza/src/pages/fiscal-invoices.tsx` — Fiscal hub with multi-entity selector, PJ/PF toggle banner, and URL prefill
- `artifacts/limpeza/dist/` — Production build assets verified clean (exit code 0)

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/demo-server.mjs`: Added address and fiscal fields persistence to `/api/companies` and `/api/pms/guests`, updated `mergeGuestRecords`.
  - `scripts/demo-server.mjs`: Synchronized 1:1 mirror of `demo-server.mjs`.
  - `artifacts/limpeza/src/pages/crm-guests.tsx`: Added address form fields, CEP lookup, and "Emitir NFS-e" shortcut.
  - `artifacts/limpeza/src/pages/fiscal-invoices.tsx`: Added multi-entity CRM selector (PF, PJ, Reservas), PJ/PF toggle banner, and URL parameters prefill.
  - `artifacts/limpeza/dist/`: Built production artifacts.
- **Build status**: Pass (exit code 0 in 26.38s)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Frontend build passed (exit code 0); SHA-256 twin match verified (`BF6361FC217B2A7BD21CB709368C43128EC989A04D1BB3A57DA5A721D060FC29`).
- **Lint status**: Clean
- **Tests added/modified**: Scope-compliant; strict rule followed (no global test sweeps executed).

## Loaded Skills
- None
