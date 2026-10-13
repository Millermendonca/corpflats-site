# BRIEFING — 2026-10-13T22:17:00Z

## Mission
Analyze and document existing Guest-Flow-Manager architecture, twin-file constraint, persistence model, memory limits, reservation lifecycle, availability/tariffs, credit cards & security, and testing patterns for WBP integration.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: codebase-architecture-explorer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_codebase
- Original parent: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Milestone: WBP Integration Discovery & Architecture Analysis

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write ONLY to `.agents/teamwork/explorer_codebase/`
- Adhere strictly to AGENTS.md (no global test sweeps, no unauthorized changes)
- Produce analysis.md and handoff.md, notify parent via send_message

## Current Parent
- Conversation ID: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Updated: 2026-10-13T22:17:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` vs `scripts/demo-server.mjs` (twin files SHA-256 parity)
  - `render.yaml`, `package.json`, `server.mjs` (memory limits, clustering, startup)
  - `tests/tariff-engine.test.mjs` (testing harness, port 3995, test isolation)
  - `e2e/sandbox/` (`mock-zapi`, `mock-smtp`, `time-travel`, `db-seeder`)
  - Persistence & pruning logic (`system_store`, `system_store_backups`, `pruneDatabase`)
  - Reservation lifecycle (`POST /api/pms/reservations`, `POST /api/reservations/direct-booking`, automations)
  - Availability divergence (4 separate calculations) and tariffs engine
  - Credit card security requirements (AES-256-GCM, CVV stripping, admin re-auth)
- **Key findings**:
  - Twin server files are 100% SHA-256 identical (`83980bf7...`).
  - `mail-service.mjs` has a slight divergence in Wi-Fi fallback defaults on main.
  - Raw WBP payloads and idempotency MUST be stored outside the pruneable `db` blob (in dedicated Postgres tables or JSONL file) to survive `pruneDatabase`.
  - Memory limit is throttled at 384 MB in code/config and can be safely elevated to 1536 MB for the ~2 GB Render plan.
  - 4 divergent availability calculations exist; a canonical unified availability calculation is required.
  - PIX must be suppressed for all WBP OTA bookings.
  - Credit card storage requires AES-256-GCM, CVV exclusion, admin password re-prompt token (5 min), and 7-day auto-purge.
- **Unexplored areas**: None for codebase architecture exploration scope.

## Key Decisions Made
- Fully documented all touchpoints in `analysis.md` and structured 5-component report in `handoff.md`.

## Artifact Index
- `DISPATCH.md` — Incoming dispatch history
- `BRIEFING.md` — Persistent situational awareness
- `progress.md` — Heartbeat and progress tracking
- `analysis.md` — Deep dive architectural report
- `handoff.md` — Formal 5-component handoff report
