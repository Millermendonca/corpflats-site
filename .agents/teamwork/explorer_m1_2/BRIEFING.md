# BRIEFING — 2026-10-07T16:10:30Z

## Mission
Design exact specification and implementation plan for Settings & Reservation Persistence (Feature 1, Milestone 1).

## 🔒 My Identity
- Archetype: explorer
- Roles: Settings & Persistence Specialist (Milestone 1, Feature 1)
- Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_2
- Original parent: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Milestone: M1 (Feature 1: Settings Persistence & Dynamic Toggle API)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT write source code or run build commands
- Write findings and blueprints in own directory only
- Produce handoff.md following 5-component handoff report

## Current Parent
- Conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`, `PROJECT.md`, `survey_backend.md`
  - `data/database.json`: verified current `settings` structure, single-line format
  - `artifacts/api-server/demo-server.mjs`:
    - Lines 554-577: default in-memory `db.settings`
    - Lines 3487-3510: `loadDatabase` cloud PostgreSQL reload & shield
    - Lines 10042-10088: `GET /api/settings` and `PATCH /api/settings`
    - Lines 10089+: placement for `GET /api/fnrh-serpro/status`
    - Lines 11810-11850: `POST /api/pms/reservations` lifecycle and hooks
    - Lines 10720-10820: `POST /api/reservations/direct-booking` lifecycle and hooks
    - Current SHA-256 parity with `scripts/demo-server.mjs`: verified identical (`d37e4d0d95637d976c0fff2af0cbb4d0027216c6abbc7293abae213cc411fce3`)
- **Key findings**:
  - Complete blueprint drafted in `blueprint_settings_persistence.md`.
  - Fail-safe fallback pattern designed so SERPRO failure or timeout does not abort reservation creation.
- **Unexplored areas**: None for Feature 1. Implementation left to worker agents per read-only constraint.

## Key Decisions Made
- `checkinProvider` defaults to `'proprio'`.
- `loadDatabase` explicitly shields `checkinProvider` and `serproConfig` from being wiped during cloud PostgreSQL snapshot restoration.
- `GET /api/fnrh-serpro/status` delegates to `fnrhSerproService.checkHealth(db.settings?.serproConfig)`.
- SERPRO registration hooks in reservation creation occur before `saveDatabase()` and before `triggerImmediateWhatsApp`, ensuring notifications contain the Gov.br link when active.
- Byte-for-byte mirror parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` is strictly enforced.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- blueprint_settings_persistence.md — Feature 1 blueprint
- handoff.md — 5-component handoff report
