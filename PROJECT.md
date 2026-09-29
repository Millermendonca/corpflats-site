# Project: Guest-Flow-Manager Governance & Integrity Overhaul

## Architecture
The system comprises three primary tiers:
1. **Frontend (`artifacts/limpeza`)**: React 18, TypeScript, Tailwind CSS, Vite. Housekeeping dashboard (`dashboard.tsx`), flat cards (`flat-card.tsx`), login (`login.tsx`). Consumes the REST API and PMS calendar.
2. **Backend Engine (`artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`)**: Node.js HTTP/Express API server managing reservations, cleaning requests, PMS synchronization, financial statements, and universal integrity reconciliation (`reconcileUniversalIntegrity`). Both server files must remain byte-for-byte synchronized.
3. **Persistent Data Store (`data/database.json`)**: JSON document database maintaining 19 active flats, reservations, cleaning requests, maid user accounts, schedules, audit logs, and financial ledger (`maidStatementEntries`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Immunity Guards & Auto-Reversion Elimination | Protect cleanings marked clean by admin, manual entries, canonical cleanings, or records with completion timestamps from being flipped back to dirty in `reconcileUniversalIntegrity`. Prevent note copy-pollution in `reconcileCleaningRequests`. Update status patch route. | M1 | ORIGINAL_REQUEST §R1 |
| 2 | F2: Dual-Server Synchronization | Ensure `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` are identical and maintained simultaneously. | M1 | ORIGINAL_REQUEST §R4 |
| 3 | F3: Retroactive Checkout Creation Guard | In `reconcileUniversalIntegrity`, check if a flat has already been cleaned (`status: "clean"`) between a past checkout and current date before generating a duplicate dirty checkout cleaning. | M1 | ORIGINAL_REQUEST §R1, R3 |
| 4 | F4: 18:00 Date Switchover UI Indicator | Add explicit visual mode banner and badge ("Modo Previsão - Próximo Turno") when viewing tomorrow, provide 1-click "Ver Hoje" toggle, and prevent operational confusion in `dashboard.tsx`. | M2 | ORIGINAL_REQUEST §R2 |
| 5 | F5: Intelligent Card Semantics & Occupancy Precedence | In `flat-card.tsx`, replace past-tense "Saiu: [Hóspede]" with "Saída Prevista: [Hóspede]" for future checkouts. Display "Entra Amanhã". Prioritize `flat.isOccupied` over `request.isVacant` for future dates. Clarify carry-over badge ("Pendente do turno de hoje"). | M2 | ORIGINAL_REQUEST §R2 |
| 6 | F6: Frontend Production Build | Run `npm run build` in `artifacts/limpeza` to produce updated assets in `artifacts/limpeza/dist/public` and include in commit per `AGENTS.md`. | M2 | AGENTS.md, ORIGINAL_REQUEST §AC |
| 7 | F7: Flat 313 Sanitization | Purge or sanitize phantom dirty cleaning ID 1358 (Leonardo Primo, 25/09) so it no longer drags as carry-over into Felipe's active stay (checkout 02/10). | M3 | ORIGINAL_REQUEST §R3 |
| 8 | F8: Flat 511 Maid Schedule & Financial Realignment | Reassign cleaning ID 1338 to Cris (ID 2), update notes, remove unearned duplicate credit `stmt_3_1338_20260928` from Grazi in `maidStatementEntries`, restore Cris payment linkage (apply same fix to 907 ID 1339 and 1004 ID 1340). | M3 | ORIGINAL_REQUEST §R3 |
| 9 | F9: Flat 512 & 712 Code Mismatch Resolution | Fix reservation `RES-712-0291` to `flatNumber: "712"` and `flatId: 14`. Reallocate cleaning ID 1351 from Flat 512 to Flat 712. Ensure Flat 512 remains clean. | M3 | ORIGINAL_REQUEST §R4 |
| 10 | F10: Universal 19-Flat Database Sanitization | Audit all 19 flats, purge phantom dirty cleanings (ID 1362 on 408, ID 1364 on 113, ID 1361 on 712), verify zero orphaned checkouts and zero off-duty maid assignments across the entire database. | M3 | ORIGINAL_REQUEST §R4 |
| 11 | F11: Automated E2E Test Suite & Adversarial Verification | Comprehensive test harness executing Node tests covering all requirements R1, R2, R3, R4 and forensic audit checks. | M4 | ORIGINAL_REQUEST §AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Reconciliation Engine & Auto-Reversion Elimination | F1, F2, F3 (`artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`) | none | DONE |
| M2 | Frontend Date Switchover & Dashboard UI Overhaul | F4, F5, F6 (`artifacts/limpeza/src/...`, `artifacts/limpeza/dist/...`) | none | DONE |
| M3 | Database Integrity Sanitization across all 19 Flats | F7, F8, F9, F10 (`data/database.json`) | M1 | DONE |
| M4 | Final E2E Test Suite & Forensic Audit Verification | F11 (Full regression suite, test pass, forensic audit, git commit + push) | M1, M2, M3 | DONE |

## Interface Contracts
### Backend Engine ↔ Housekeeping Dashboard
- `GET /api/cleaning/checkouts?date=YYYY-MM-DD`: Returns list of checkouts and cleanings. For dates > today, flats occupied today must return `flat.isOccupied: true` and `request.isVacant: false` unless explicitly vacated.
- `PATCH /api/cleaning/assignments/:requestId/status`: Accepts `{ status, completedAt, markedByAdmin }`. When `status === "clean"`, permanently persists `markedByAdmin: true`, sets `completedAt`, and clears automated generation notes so subsequent `reconcileUniversalIntegrity()` runs never revert it to dirty.
- `GET /api/flats`: Calls `reconcileUniversalIntegrity()`. Must return all 19 flats with accurate statuses without modifying cleanly resolved records.

### Database Records ↔ Reconciliation Engine
- `db.cleaningRequests`: Records with `markedByAdmin === true`, `source === "admin_manual"`, or non-null `completedAt` are immune to auto-reversion.
- `db.reservations`: `flatId` and `flatNumber` must match the flat identified by the reservation code prefix. `RES-712-0291` maps strictly to Flat 712 (`flatId: 14`).
- `db.maidStatementEntries`: Only maids on scheduled duty may have daily cleaning credits. Off-duty duplicate credits must be purged.

## Code Layout
- `artifacts/api-server/demo-server.mjs`: Primary backend server and integrity engine (owned by M1 Worker)
- `scripts/demo-server.mjs`: Synchronized server mirror (owned by M1 Worker)
- `artifacts/limpeza/src/pages/dashboard.tsx`: Housekeeping dashboard page (owned by M2 Worker)
- `artifacts/limpeza/src/components/flat-card.tsx`: Cleaning card component (owned by M2 Worker)
- `artifacts/limpeza/dist/`: Compiled production frontend assets (owned by M2 Worker)
- `data/database.json`: Persistent application data store (owned by M3 Worker)
- `tests/`: Automated tests and verification scripts (owned by Test Writer / M4)
