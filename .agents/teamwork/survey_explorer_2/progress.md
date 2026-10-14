# Progress: Survey Explorer 2 (CRM 360° Models & Fiscal Invoices UI)

**Last visited**: 2026-10-14T09:55:00Z
**Current status**: Investigation complete. Synthesizing handoff report.

### Task Checklist
- [x] Initialized DISPATCH.md, BRIEFING.md, and progress.md
- [x] 1. Backend CRM data models and endpoints (`db.companies`, `/api/companies`, `db.guests`, `/api/pms/guests`, `db.reservations`, `/api/pms/reservations`)
  - [x] Audited `POST /api/companies` and `PATCH /api/companies/:id` (dropped address/fiscal fields)
  - [x] Audited `POST /api/pms/guests` and `handleUpdateGuest` (dropped address/fiscal fields, whitelist `fields`)
  - [x] Audited `reconcileAndMergeGuests` / `mergeGuestRecords` (missing address/company/autoInvoice merge logic)
  - [x] Audited `db.reservations`, `/api/pms/reservations` and check-out auto-invoice (ignoring `companyId` for tomador)
  - [x] Audited `POST /api/nfse/emit` (`numNfseReal`/`codVerifReal` ReferenceError bug, missing tomador address persistence)
- [x] 2. UI in `artifacts/limpeza/src/pages/crm-guests.tsx` (Guest & Company modals, missing fiscal/address fields)
  - [x] Identified missing fields in Company Modal: IE, IM, CEP, Endereço/Logradouro, Número, Complemento, Bairro, Cidade, UF, Código IBGE, Telefone, Contato, Observações
  - [x] Identified missing fields in Guest Modal: CEP, Endereço/Logradouro, Número, Complemento, Bairro, Cidade, UF, Código IBGE
  - [x] Audited `handleSaveCompany` and `handleSaveGuest` payloads
- [x] 3. UI in `artifacts/limpeza/src/pages/fiscal-invoices.tsx` (CRM selector, Tomador prefill, PJ vs PF quick toggle)
  - [x] Mapped current combobox (only filters guests, hardcoded address, ignores `companyId`)
  - [x] Designed unified combobox (Hóspedes PF, Empresas PJ, Reservas Ativas/Recentes)
  - [x] Designed quick toggle mechanism for Tomador (Empresa Vinculada PJ vs Hóspede PF)
  - [x] Designed service description formatting preserving guest/stay details
- [x] 4. URL/route parameters mapping into `fiscal-invoices.tsx`
  - [x] Mapped existing parameters (`doc`, `nome`)
  - [x] Defined complete parameter contract (`doc`, `nome`, `email`, `phone`, `flat`, `checkin`, `checkout`, `valor`, `diarias`, `resCode`, `companyId`, `guestId`)
  - [x] Mapped navigation points from `crm-guests.tsx`
- [x] 5. Synthesize findings into `handoff.md` and alert orchestrator via `send_message`
