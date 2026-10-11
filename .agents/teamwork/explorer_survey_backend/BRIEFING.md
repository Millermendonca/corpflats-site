# BRIEFING — 2026-10-11T00:50:00Z

## Mission
Survey backend architecture in `artifacts/api-server/demo-server.mjs`, external calls (Z-API WhatsApp, Nodemailer SMTP, PIX gateways, SERPRO FNRH, NFS-e), and design the isolated local sandbox on a dedicated port with `database.test.json` and time-travel mechanics.

## 🔒 My Identity
- Archetype: explorer
- Roles: Backend Survey Explorer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend
- Original parent: 2a43f791-5cc7-4933-bdd2-688af9234cb1
- Milestone: milestone-1-survey
- Current Parent: 5a1d1171-401e-4601-9229-45485822d731
- Current Milestone: e2e-synthetic-tests-sandbox

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Never edit files outside .agents/teamwork/explorer_survey_backend
- Focus on backend architecture, database persistence, auth middleware, route insertion points, notifications, uploads, and file sync
- Map all external call points and design zero-leakage sandbox isolation
- Ensure byte-for-byte synchronization constraint for `scripts/demo-server.mjs` is respected in all design proposals

## Current Parent
- Conversation ID: 5a1d1171-401e-4601-9229-45485822d731
- Updated: 2026-10-11T00:50:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` (28,781 lines; DB, port, auth, webhooks, time checks)
  - `scripts/demo-server.mjs` (mirror byte-for-byte check: identical hash `True`)
  - `data/database.json` & `data/database.test.json` isolation pattern
  - `artifacts/api-server/zapi-service.mjs` (WhatsApp endpoints, webhooks, emulator design)
  - `artifacts/api-server/mail-service.mjs` (Nodemailer config, `sendEmailAsync`, audit store)
  - `artifacts/api-server/inter-pix-service.mjs` (Banco Inter mTLS banking)
  - `artifacts/api-server/fnrh-serpro-service.mjs` (SERPRO v2.4.2 API client & native mock mode)
  - `artifacts/api-server/giss-soap.mjs` & `national-nfse.mjs` (NFS-e Prefeitura & National ADN)
  - `artifacts/api-server/maid-automation-service.mjs` (18:00 turno cron runner)
  - `artifacts/limpeza/src/pages/guest-portal.tsx` & `guest-breakfast.tsx` (14:00 door password release, 22:00/05:00 breakfast cutoff)
- **Key findings**:
  - DB isolation: `DB_FILE = process.env.DATA_FILE || process.env.DATABASE_FILE || ...`. Passing `DATABASE_FILE=database.test.json` and `DATABASE_URL=""` completely bypasses PostgreSQL and protects production `database.json`.
  - Port isolation: `PORT` env var (default 5000) allows running test instance on dedicated port (e.g., 5055).
  - Z-API emulation: Outgoing calls route to `db.zapiConfig.baseUrl` (can point to `http://127.0.0.1:5056` mock server with queryable queue and inbound simulator).
  - SMTP interception: Outbound emails are stored directly in `db.reservationCommunications`; local mock SMTP port captures raw Nodemailer transmission.
  - PIX simulation: Instant payment simulated via `POST /api/pms/inter/webhook` with txid payload; offline static QR code generation via `generateStaticPixPayload`.
  - SERPRO gov.br: `SERPRO_MOCK=true` natively generates realistic mock UUIDs and pre-checkin URLs without network egress.
  - Time-travel: `POST /api/test/time-travel` endpoint designed to manipulate simulated clock offset and trigger immediate ticker evaluations for 18:00, 22:00, and 14:00 rules.
- **Unexplored areas**: None. All R1 sandbox and isolation points fully investigated.

## Key Decisions Made
- Documented complete architecture survey in `analysis.md`.
- Formatted self-contained 5-component handoff report in `handoff.md`.

## Artifact Index
- `DISPATCH.md` — Dispatch history and instructions
- `progress.md` — Liveness and progress heartbeat
- `analysis.md` — Comprehensive architecture survey and isolation blueprints
- `handoff.md` — 5-component handoff report
