# Progress - Milestone 2 (CRM 360° Alignment & Fiscal Invoices UI)

Last visited: 2026-10-14T10:50:00Z
Status: Completed - All F6 to F11 features implemented, twin parity verified, frontend build exit 0

## Checklist
- [x] Read DISPATCH.md, ORIGINAL_REQUEST.md, survey_explorer_2/handoff.md, orchestrator_9/PROJECT.md
- [x] Setup BRIEFING.md and progress.md
- [x] Inspect existing `artifacts/api-server/demo-server.mjs` lines around `/api/companies`, `/api/pms/guests`, `mergeGuestRecords`
- [x] Implement backend persistence for companies and guests in `artifacts/api-server/demo-server.mjs` (F6, F7)
- [x] Inspect and update `artifacts/limpeza/src/pages/crm-guests.tsx` (modals and table shortcuts) (F8)
- [x] Inspect and update `artifacts/limpeza/src/pages/fiscal-invoices.tsx` (multi-entity selector F9, tomador toggle F10, stay prefill, URL params F11)
- [x] Mirror changes to `scripts/demo-server.mjs` and verify 100% SHA-256 parity
- [x] Run `npm --prefix artifacts/limpeza run build` and ensure exit 0
- [x] Update `progress.md`, write `handoff.md`, and notify orchestrator
