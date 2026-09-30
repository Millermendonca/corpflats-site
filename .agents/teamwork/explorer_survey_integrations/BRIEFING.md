# BRIEFING — 2026-09-30T21:55:00Z

## Mission
Map the integration points for R6 (Maid Dashboard Flat Card) and R7 (PMS Calendar) in the cleaning/PMS web interface.

## 🔒 My Identity
- Archetype: explorer
- Roles: Integrations Survey Explorer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_integrations
- Original parent: 2a43f791-5cc7-4933-bdd2-688af9234cb1
- Milestone: Survey & Integrations Mapping (R6 & R7)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write only to working directory .agents/teamwork/explorer_survey_integrations/
- No modifications to source files

## Current Parent
- Conversation ID: 2a43f791-5cc7-4933-bdd2-688af9234cb1
- Updated: 2026-09-30T21:46:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/limpeza/src/components/flat-card.tsx` (lines 1 to 2418)
  - `artifacts/limpeza/src/pages/dashboard.tsx` (lines 1 to 1002)
  - `artifacts/limpeza/src/pages/pms-calendar.tsx` (lines 1 to 8292)
  - `artifacts/api-server/demo-server.mjs` (endpoints `/api/flats`, `/api/reservations/checkouts`, `/api/pms/calendar`, `/api/pms/fair-share-flat`)
  - `artifacts/limpeza/src/App.tsx` (routes and TooltipProvider)
  - `artifacts/limpeza/src/components/ui/tooltip.tsx`
- **Key findings**:
  - In `flat-card.tsx`: Status and badges are rendered at lines 1061-1126. "🔧 Serviço em andamento" can be placed directly in the badge row and inside a new callout box in the card body (line 1278). The button to start cleaning ("Vou Limpar" in dirty state, line 1355; "Iniciar" in will_clean state, line 1375) should be wrapped in `<Tooltip>` and disabled when `Boolean(flat.serviceInProgress)`. Batch selection checkbox at line 945 must also require `!flat.serviceInProgress`.
  - Backend dependency for R6: `dashboard.tsx` receives data from `GET /api/reservations/checkouts` (not `GET /api/flats`). Hence `GET /api/reservations/checkouts` MUST also return `serviceInProgress`.
  - In `pms-calendar.tsx`: The continuous multi-month timeline renders room blocks via `flatBlocks.map(...)` at lines 3848-3886 using `getBlockPosition`.
  - In `demo-server.mjs`: `GET /api/pms/calendar` should synthesize service orders having `estimatedFinishAt` into `blocks` with `reason: "service_order"` and `isServiceBlock: true`.
  - In `pms-calendar.tsx`: Service blocks are rendered with badge `🔧 [Título do Serviço]`. Reservation creation via modal calculates overlap with active service blocks and renders a warning banner. On save (`handleSaveRes`), a `confirm(...)` dialog allows the admin to override the visual block.
- **Unexplored areas**: None for M0 scope. Full integration mapping complete.

## Key Decisions Made
- All detailed architectural observations, logic chains, and concrete code recipes documented in `analysis.md` and summarized in `handoff.md`.

## Artifact Index
- DISPATCH.md — Initial dispatch instructions
- BRIEFING.md — Persistent context and memory
- progress.md — Liveness heartbeat and milestone tracking
- analysis.md — Deep-dive integration analysis and recipes
- handoff.md — 5-component hard handoff report
