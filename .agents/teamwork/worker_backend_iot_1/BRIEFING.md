# BRIEFING — 2026-10-12T00:03:00Z

## Mission
Implement the Backend Engine, API endpoints, Fail-Safe presence lifecycle, and IoT Hardware Guide for the Smart Flat Hub with 100% SHA-256 parity between twin servers.

## 🔒 My Identity
- Archetype: worker_backend_iot
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_backend_iot_1
- Original parent: 26335f75-5ae5-4381-97dc-4cdaaa103cfd
- Milestone: M2 (Backend Engine & Fail-Safe APIs), M4 (IoT Hardware & Acquisition Guide)

## 🔒 Key Constraints
- Twin-Server Parity Mandate: 100% SHA-256 hash parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
- Strict Test Execution Rule: NUNCA executar testes globais, varreduras ou em lote (proibido rodar tests/*.test.mjs). Executar APENAS o teste estritamente pontual dedicado criado/associado (`tests/smart-flat-hub.test.mjs`).
- Privacy Isolation: Smart Flat Hub backend endpoints are isolated under `/api/smart-flat/*`.
- Integrity Mandate: Genuine implementation only. Real state and logic. No hardcoded mock shortcuts.
- Git Push: Any git commit must be followed immediately by git push to remote main.

## Current Parent
- Conversation ID: 26335f75-5ae5-4381-97dc-4cdaaa103cfd
- Updated: 2026-10-12T00:03:00Z

## Task Summary
- **What was built**:
  1. `docs/SMART_FLAT_HARDWARE_GUIDE.md`: Comprehensive IoT hardware guide for 19 flats (Tuya 16A plugs, IR blasters 38kHz with TH sensor, Echo Pop/Dot Alexa, touch switches 4x2, 2.4GHz VLAN network design, power-outage recovery, BOM budget).
  2. `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`:
     - Initialized `SmartFlatState` in memory and in `db.smartFlats` and `reservation.smartFlat`.
     - Implemented 6 endpoints: `GET /api/smart-flat/:target`, `POST /api/smart-flat/:target/eta`, `POST /api/smart-flat/:target/devices`, `POST /api/smart-flat/:target/confirm-entrance`, `POST /api/smart-flat/:target/playlist`, `POST /api/smart-flat/:target/simulate`.
     - Implemented 30-minute antecedence validation window (`now >= ETA - 30min` required to schedule/turn on devices).
     - Implemented Fail-Safe Presence Lifecycle (warning at `now >= ETA`, shutoff at `now >= ETA + 30min` with official reason, disarm upon confirmation).
     - Welcome playlist automatic activation on check-in day at 14:00 (`db.settings.checkinTime`).
     - Background evaluation timer every 60s + on-demand evaluation in request handlers.
  3. Strict SHA-256 parity verification between twin files (Hash: `394FED4C9412BF29672DFD81AB153FFEE564DD40F8CBF5CC1611C23592FEE5B3`).
  4. Unit test `tests/smart-flat-hub.test.mjs` covering all operational rules with 100% pass (6/6).

## Key Decisions Made
- Prioritize known flat numbers over reservation IDs in `resolveSmartFlatContext` to avoid collisions with reservation numerical IDs.
- Compute `scheduleAllowedFrom` whenever `eta` is known, enabling predictable time context for UI and validations.
- Maintain dual-reference between `db.smartFlats[flatNumber]` and `reservation.smartFlat`.
- Implement background interval for fail-safe evaluation to shut off devices even when no requests are active.

## Change Tracker
- **Files modified**:
  - `docs/SMART_FLAT_HARDWARE_GUIDE.md`: Created complete IoT hardware and purchasing guide for 19 flats.
  - `scripts/demo-server.mjs`: Added SmartFlatState initialization, evaluation engine, 6 API endpoints, background watcher, and helper exports.
  - `artifacts/api-server/demo-server.mjs`: Synchronized with 100% SHA-256 byte parity.
  - `tests/smart-flat-hub.test.mjs`: Created dedicated pontual test suite (6 subtests).
- **Build status**: Tests passed 6/6 (100%).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: Pass (6/6 tests passing in `tests/smart-flat-hub.test.mjs`).
- **Parity status**: 100% identical SHA-256 between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
- **Tests added/modified**: `tests/smart-flat-hub.test.mjs` (6 test cases covering antecedence window, temperature bounds, fail-safe presence, welcome audio trigger, REST endpoints).

## Artifact Index
- `docs/SMART_FLAT_HARDWARE_GUIDE.md` — Complete IoT hardware guide and purchasing specifications.
- `scripts/demo-server.mjs` — Backend engine with Smart Flat routes and evaluation logic.
- `artifacts/api-server/demo-server.mjs` — Twin backend engine with identical hash.
- `tests/smart-flat-hub.test.mjs` — Dedicated pontual test suite.
