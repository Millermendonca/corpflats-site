## 2026-10-11T16:48:36Z
You are M4 Worker / E2E Test Suite Author for Milestone 4 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m4_worker_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
Test Infra: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\TEST_INFRA.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive File Ownership:
You own exclusively:
- `tests/reservation-modification-flow.test.mjs`
- `TEST_READY.md`

Tasks to Execute:
1. Read ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
2. Review existing test implementations in `tests/m1-reservation-modification-settlement.test.mjs`, `tests/m2-re-signature-operations-sync.test.mjs`, and `tests/m3-frontend-portal-panels.test.mjs`.
3. Author the unified, comprehensive 4-tier E2E test suite `tests/reservation-modification-flow.test.mjs`:
   - Use Node.js native test runner (`node:test`, `node:assert/strict`).
   - Run against an isolated test server instance with isolated test database (e.g. port 3998), with robust port cleanup in before/after hooks.
   - Implement comprehensive test cases covering all 4 tiers from TEST_INFRA.md:
     - Tier 1: Feature Isolation for all 10 features (simulation & availability, hold conflict prevention, payment settlement, audit trail, re-signature invalidation, WhatsApp/email triggers, FNRH PDF delivery to reception, panel synchronization, guest portal multi-step UI projection, and operational schedulers).
     - Tier 2: Boundary & Corner Cases (invalid/inverted dates, zero-cost changes, negative values, expired holds, 24h cancellation limit, duplicate polling idempotency, concurrency mutex locks).
     - Tier 3: Cross-Feature Combinations (hold -> availability check -> cancel -> verify availability restored; extension -> payment -> re-signature -> reception entry check; flat change -> old flat freed -> new flat hold -> re-signature).
     - Tier 4: Real-World Application Scenarios (the 5 scenarios explicitly defined in TEST_INFRA.md lines 26-34).
4. Run strictly targeted test command:
   - `node --test tests/reservation-modification-flow.test.mjs`
   Verify 100% of test cases pass with exit code 0.
5. Update `TEST_READY.md` at project root with the comprehensive coverage summary and verification results for the CorpFlats Reservation Modification Flow.
6. Verify byte-for-byte SHA-256 parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
7. Verify frontend build cleanliness: ensure `npm run build` in `artifacts/limpeza` passes with exit code 0.
8. Commit the changes (`tests/reservation-modification-flow.test.mjs`, `TEST_READY.md`, and any build artifacts) and immediately execute `git push` to `origin main` per `AGENTS.md`.
9. Update `progress.md`, write `handoff.md`, and report back to the orchestrator via `send_message`.
