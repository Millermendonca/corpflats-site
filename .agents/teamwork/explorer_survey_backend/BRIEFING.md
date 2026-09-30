# BRIEFING — 2026-09-30T18:53:45-03:00

## Mission
Map the backend architecture for the Maintenance / Service Orders feature (OS) across demo-server.mjs, data/database.json, and supporting services.

## 🔒 My Identity
- Archetype: explorer
- Roles: Backend Survey Explorer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend
- Original parent: 2a43f791-5cc7-4933-bdd2-688af9234cb1
- Milestone: milestone-1-survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Never edit files outside .agents/teamwork/explorer_survey_backend
- Focus on backend architecture, database persistence, auth middleware, route insertion points, notifications, uploads, and file sync

## Current Parent
- Conversation ID: 2a43f791-5cc7-4933-bdd2-688af9234cb1
- Updated: 2026-09-30T18:53:45-03:00

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` (db, auth, routes, notifications, upload)
  - `scripts/demo-server.mjs` (mirror comparison)
  - `data/database.json` (root keys and settings)
  - `artifacts/api-server/zapi-service.mjs` (`sendZapiMessage`, `bypassTestMode`)
  - `artifacts/api-server/mail-service.mjs` (`sendEmailAsync`, `receptionEmail`)
  - `artifacts/api-server/storage-service.mjs` (`uploadImageToStorage`, Cloudflare R2)
  - `tests/checkout-occupancy-rule.test.mjs`, `tests/governance-integrity.test.mjs`, `tests/surveys-reformed.test.mjs`
- **Key findings**:
  - DB persistence: in-memory `db` object loaded from `DB_FILE` at startup via `loadDatabase()`, saved synchronously with `saveDatabase()`.
  - Auth: `getAuthUser(req)` checks `gfm_session_v2` cookie or `Authorization: Bearer` header. Admin check: `!userAuth` -> 401, `userAuth.role !== 'admin'` -> 403.
  - Route insertion point: Line ~7587 in `demo-server.mjs` between Periodic Tasks and Observations.
  - Flats injection: Map over `activeFlats` in `GET /api/flats` (line 5189) and attach `serviceInProgress`. Merge active service orders into `blocks` in `GET /api/pms/calendar` (line 9234).
  - Notifications: WhatsApp via `sendZapiMessage` with `bypassTestMode: true` to admin `5522998505276` and reception phone; Email via `sendEmailAsync` to reception email; Internal push + audit via `createNotification`.
  - Storage: `uploadImageToStorage` handles base64 Data URLs with R2 and base64 fallback.
  - Mirror sync: `scripts/demo-server.mjs` must remain byte-for-byte identical; verified by `node --test tests/checkout-occupancy-rule.test.mjs`.
- **Unexplored areas**: None. All 7 topics fully investigated.

## Key Decisions Made
- Fully documented all 7 requirements and mapped exact code structures in `analysis.md`.
- Formatted complete 5-component handoff report in `handoff.md`.

## Artifact Index
- `DISPATCH.md` — Initial dispatch message
- `progress.md` — Liveness & progress heartbeat
- `analysis.md` — Full backend survey report
- `handoff.md` — 5-component handoff report
