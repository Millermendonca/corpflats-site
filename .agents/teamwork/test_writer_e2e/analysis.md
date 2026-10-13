# Analysis: E2E Test Suite Architecture & Foundational Harness

## 1. Context & Objectives
The goal of this track is to design and initialize the end-to-end testing infrastructure for the **Guest-Flow-Manager WebBookingPro (WBP) Integration** and SEBRAE Pricing Engine.

Operating requirements dictate:
1. Strict adherence to AGENTS.md: global test sweeps (`tests/*.test.mjs` scans) are strictly forbidden; only targeted test executions of files directly associated with integration changes are permitted.
2. Complete data isolation: no leakage to production database (`DATABASE_URL` stripped), isolated temporary database JSON copies, exclusive ports for backend and simulator.
3. Preservation of existing repository root documentation (`TEST_INFRA.md` for Reservation Modification Flow preserved; new documentation placed at `docs/integracoes/webbookingpro/TEST_INFRA.md`).
4. Systematic opaque-box testing covering all 33 features across Tiers 1 to 4.

## 2. Infrastructure Architecture & Design Choices

### 2.1 Test Document (`docs/integracoes/webbookingpro/TEST_INFRA.md`)
- **Philosophy**: Opaque-box, requirement-driven testing. All test scenarios interact with external surfaces (HTTP REST, Webhook callbacks, WBP simulator client requests, DB state snapshots, and UI state).
- **33 Features Categorization**:
  - Milestones M1 (Safety, Storage, Client/Simulator, Twin Parity): F1 to F8
  - Milestone M2 (Availability, SEBRAE Pricing, Safety Locks): F9 to F13
  - Milestone M3 (ARI Mapping, 7 Restrictions, Sync): F14 to F16
  - Milestone M4 (Webhooks, Polling, Inbox, Quarantine, Mutations, Automations, Alerts): F17 to F24
  - Milestone M5 (Credit Card Vault, Re-Auth, Reviews/Messages, UI & Manual): F25 to F31
  - E2E Tracks (Opaque-box Tiers 1-4 & Adversarial Hardening Tier 5): F32, F33
- **Coverage Calculations**:
  - Tier 1: 31 functional features × 5 = 155 test cases
  - Tier 2: 31 functional features × 5 = 155 test cases
  - Tier 3: 35 pairwise integration test cases
  - Tier 4: 7 comprehensive multi-step hotel operational workflows
  - Total Planned: 352 test cases.

### 2.2 Foundational Test Harness (`tests/wbp-integration/harness/`)
- **`WbpSimulatorHarness` (`wbp-simulator-harness.mjs`)**:
  - Simulates the official WBP Build-To-Us API (`POST /api/cloudpms/:verb`).
  - Supports mandatory verbs: `HealthCheck`, `SetupProperty`, `GetRoomTypes`, `GetRatePlans`, `ARIUpdate`, `GetBookingList`, `GetBookingId`, `AckBooking`.
  - Injects simulated faults (e.g. 1001 `FAULT.OTA.LOGIN`, 1002 `FAULT.OTA.NOTENABLED`, 1102 `FAULT.OTA.CURRENCY`).
  - Dispatches inbound webhooks to the PMS: JSON `BookingCreate` and url-encoded `NotifyBooking`.
  - Maintains in-memory audit logs and call counters for assertion verification.
- **`startIsolatedWbpEnvironment` (`test-env.mjs`)**:
  - Allocates dynamic, collision-free TCP ports for backend and simulator.
  - Clones `data/database.json` to a temporary test file (`data/test-wbp-env-<timestamp>-<rand>.json`).
  - Spawns isolated backend process (`artifacts/api-server/demo-server.mjs`) with `DATABASE_URL=""` and `NODE_ENV=test`.
  - Automatically polls `/api/health` until ready.
  - Registers clean teardown: process tree termination (`taskkill /F /T /PID` on Windows) and temporary database file deletion.

### 2.3 Targeted Runner (`tests/wbp-integration/e2e-runner.mjs`)
- Protects the project from accidental global sweeps.
- Rejects missing arguments or wildcard patterns (`*`, `?`).
- Spawns `node --test <targetFile>` directly with inherited stdio.

## 3. Verification & Validation
- Executed smoke test: `node tests/wbp-integration/e2e-runner.mjs tests/wbp-integration/smoke-harness.test.mjs`
- Test run results:
  - Subtest 1: Isolated backend is healthy (`/api/health` returned HTTP 200 `{ status: "ok" }`). (PASS)
  - Subtest 2: WBP Simulator running on exclusive port, responded to `HealthCheck`, tracked call. (PASS)
  - Subtest 3: Test environment used isolated temporary database copy with zero remote DB access. (PASS)
  - Subtest 4: Simulator injected `FAULT.OTA.LOGIN` error code 1001 on demand. (PASS)
  - Result: 4 passed, 0 failed, exit code 0.
- Guardrails verified:
  - Invocation without arguments exited with code 1 and scope error.
  - Invocation with wildcard `"tests/*.test.mjs"` exited with code 1 and AGENTS.md guardrail block.
  - Temporary database file unlinked cleanly with 0 leftover test files in `data/`.
