# Project Orchestrator Plan: Governance & Integrity Overhaul

## Objective
Implement deep audit, cleanup, and definitive fixes for Guest Flow Manager governance reconciliation, retroactive checkout handling, 18:00 date switchover, maid assignment, and database consistency across all 19 flats, satisfying all acceptance criteria in `ORIGINAL_REQUEST.md`.

## Workflow & Phases

### Phase 0: Survey & Scope Mapping
- **Action**: Dispatch 3 Survey Explorers in parallel:
  - `explorer_survey_1`: Backend & Reconciliation Engine (`artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `reconcileUniversalIntegrity`, clean-to-dirty loop)
  - `explorer_survey_2`: Frontend Date Logic & UI (`artifacts/limpeza/src/pages/dashboard.tsx`, 18:00 switchover, Flat 904)
  - `explorer_survey_3`: Database & Data Records (`data/database.json`, Flats 313, 511, 512, 904, `RES-712-0291`, maid rosters)
- **Output**: Synthesize findings into `PROJECT.md` (Feature Inventory, Architecture, Interface Contracts, Milestones).

### Phase 1: E2E Test Infrastructure Track
- Dispatch `test_writer` / test orchestrator to create opaque-box test suites and verification harness covering R1, R2, R3, R4.
- Publish `TEST_READY.md`.

### Phase 2: Implementation Milestones
- **Milestone 1 (R1)**: Eliminate Clean-to-Dirty Auto-reversion Loop (`reconcileUniversalIntegrity` in `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`).
- **Milestone 2 (R2)**: Fix 18:00 Date Switchover & Dashboard Clarification (`dashboard.tsx`, Flat 904 display).
- **Milestone 3 (R3)**: Sanitize Ghost Cleanings & Maid Assignments (Flats 313 and 511 historical cleanup).
- **Milestone 4 (R4)**: Universal Integrity Audit & Sync across all 19 flats (`data/database.json`, `RES-712-0291` correction, duplicate checkout resolution).

### Phase 3: Final E2E Test & Build Verification
- Run full test suite covering all tiers.
- Frontend build in `artifacts/limpeza` (`npm run build`).
- Forensic audit check (`teamwork_preview_auditor`).
- Git commit + immediate `git push` per `AGENTS.md`.
- Report victory to Sentinel.
