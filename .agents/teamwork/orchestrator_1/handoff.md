# Orchestrator Soft Handoff — Generation 1 to Generation 2

## 1. Overview & Current Milestone State
- **Project**: Guest-Flow-Manager WebBookingPro Integration & SEBRAE Pricing Engine Restructuring.
- **Hotel**: CorpFlats Soho Residence (19 flats, Campos dos Goytacazes/RJ).
- **Target Branch**: `feature/wbp-integration` (strictly active; NEVER commit or push to `main`).
- **Parent Conversation ID**: `2588b79e-8f82-479c-ac3d-60f14235136b`.
- **Milestone Progress**:
  | Milestone | Scope | Status | Notes |
  |---|---|---|---|
  | **Phase 0 (Survey)** | Features F1–F33 | **DONE** | Complete feature inventory in `docs/integracoes/webbookingpro/PROJECT.md`. |
  | **E2E Testing Track** | Infra & Tiers 1–4 | **DONE** | Master runner `tests/wbp-integration/e2e-runner.mjs`, `TEST_INFRA.md`, harness smoke tests passed. |
  | **Milestone 1** | Safety, Storage & Simulator (F1–F8) | **DONE (PASS)** | Commit `13d5043`. Master switch, raw storage, memory 1536MB, local OpenAPI simulator. Gate 1 100% approval, Auditor CLEAN. |
  | **Milestone 2** | Availability & SEBRAE Pricing (F9–F13) | **DONE (PASS)** | Commit `b213257` + fix `6c33558`. Exact SEBRAE math (UH Cost R$ 149.38, Divisor 0.54, Min Rate R$ 276.63 closing 100%), fail-closed floor/variation locks, non-regression verified. Gate 2 100% approval, Auditor CLEAN. |
  | **Milestone 3** | ARI Mapping & Synchronizer (F14–F16) | **DONE (PASS)** | Commit `1a141ba`. 19 flats mapped to room `flat` x 2 plans (`sem_cafe` and `com_cafe` with +R$ 25 breakfast surcharge), shared pool math, inclusive `end_date`, 7 restrictions in `db.wbpRestrictions`, debounced push (<10s window: 2s debounce, 6s max-wait), transient retry with UUID v4 GUID reuse. Gate 3 100% approval (Reviewer 1, Reviewer 2, Challenger 1, Challenger 2, Auditor CLEAN). |
  | **Milestone 4** | Reservations, Quarantine, Reconciler & Alerts (F17–F24) | **NEXT (READY TO DISPATCH)** | Webhook routes (`/BookingCreate`, `/NotifyBooking`), background polling, fair-share allocation across 19 flats, PIX suppression, quarantine engine, cancel/mod mutations, reconciliation algorithm, manager alerts. |
  | **Milestone 5** | Card Vault, Provisional Adapters & UI / Manual (F25–F31) | **PLANNED** | AES-256-GCM card vault (no CVV, 5-min admin token, 7-day purge), provisional chat/reviews toggle, UI in `artifacts/limpeza` matching mockups, Portuguese manual R9, build `artifacts/limpeza` (`npm run build`) and commit `dist/`. |
  | **Final Milestone** | E2E Acceptance & Adversarial Hardening (F32–F33) | **PLANNED** | Pass 100% of E2E test suite (Tiers 1–4), then Phase 2 Tier 5 adversarial coverage hardening with Challenger loop until clean. |

---

## 2. Active Subagents
- **None currently running**. All 21 subagents spawned by Generation 1 have delivered their handoffs and completed with 100% approval.
- Pre-created workspaces ready for Milestone 4 Explorers:
  - `.agents/teamwork/explorer_m4_wbp_1/`
  - `.agents/teamwork/explorer_m4_wbp_2/`
  - `.agents/teamwork/explorer_m4_wbp_3/`

---

## 3. Key Technical Decisions & Invariants
1. **Real Database Baseline Integrity**:
   - `data/database.json` SHA-256: `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`.
   - Never mutate this file during test runs. All tests must clone to `os.tmpdir()` and unset `DATABASE_URL`.
   - Preserve the 11 uncommitted audit log lines in `artifacts/api-server/audit_logs.jsonl`.
2. **Twin File Parity (Byte-for-Byte SHA-256)**:
   - Any backend module in `artifacts/api-server/` MUST have an identical twin in `scripts/`:
     - `wbp/pricing.mjs`
     - `wbp/ari-sync.mjs`
     - `wbp/availability.mjs`
     - `wbp/client.mjs`
     - `wbp/config.mjs`
     - `wbp/storage.mjs`
     - `demo-server.mjs`
     - When M4 adds `wbp/inbox.mjs` (or similar), mirror in `scripts/wbp/inbox.mjs` with identical SHA-256.
3. **Targeted Test Execution Rule**:
   - Run EXCLUSIVELY targeted tests: `node --test tests/wbp-integration/<target>.test.mjs`.
   - NEVER run batch sweeps or wildcards (`tests/*.test.mjs`).
   - Never mute or silence notifications in code.
4. **Git Discipline**:
   - Branch: `feature/wbp-integration` exclusively.
   - Run `git push` on every `git commit`. Never touch `main`.
5. **Auditor Veto**:
   - Forensic Auditor report of INTEGRITY VIOLATION is a non-negotiable binary veto.

---

## 4. Remaining Work & Concrete Next Steps for Successor (Gen 2)

### Step 1: Initialize Orchestrator Gen 2
- Start heartbeat cron: `schedule(CronExpression="*/10 * * * *", Prompt="Heartbeat cron tick: verifique subagentes ativos e atualize progress.md e BRIEFING.md.")`.
- Update `BRIEFING.md` setting `Current Parent` to `2588b79e-8f82-479c-ac3d-60f14235136b`, spawn count reset to 0, predecessor Gen 1 recorded.

### Step 2: Milestone 4 Iteration Cycle
- **Survey / Exploration (Step 2B.a)**:
  - Dispatch 3 Explorers in parallel:
    1. `explorer_m4_wbp_1` (Webhooks & Polling - F17, F18) -> working dir `.agents/teamwork/explorer_m4_wbp_1`
    2. `explorer_m4_wbp_2` (Fair-Share Allocation, PMS Mutations & PIX Suppression - F19, F21, F23) -> working dir `.agents/teamwork/explorer_m4_wbp_2`
    3. `explorer_m4_wbp_3` (Quarantine Engine, Reconciler & Critical Alerts - F20, F22, F24) -> working dir `.agents/teamwork/explorer_m4_wbp_3`
  - Ensure every prompt includes the mandatory path to `ORIGINAL_REQUEST.md`.
- **Implementation (Step 2B.b)**:
  - Dispatch `worker_m4_wbp` to implement M4 modules (e.g. `artifacts/api-server/wbp/inbox.mjs`, `reconciler.mjs`, `alerts.mjs`, mirror in `scripts/wbp/`, mount routes in `demo-server.mjs`, maintain 100% twin parity).
  - Include mandatory integrity warning.
  - Require targeted test creation: `tests/wbp-integration/m4-reservations-inbox.test.mjs`.
  - Require commit and `git push` to `origin feature/wbp-integration`.
- **Verification Gate (Steps 2B.c - 2B.f)**:
  - 2 Reviewers (`reviewer_m4_wbp_1`, `reviewer_m4_wbp_2`).
  - 2 Challengers (`challenger_m4_wbp_1` for allocation/concurrency stress; `challenger_m4_wbp_2` for quarantine/reconciliation stress).
  - 1 Forensic Auditor (`auditor_m4_wbp`).
  - Evaluate Gate 4 in `GATE_STATUS.md` -> all APPROVE + CLEAN -> update `PROJECT.md` M4 = DONE.

### Step 3: Milestone 5 & Final Acceptance
- Follow the same disciplined cycle for M5 and the Final Milestone.

---

## 5. Key Artifacts
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` — Authoritative User Request.
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md` — Project Scope Document (M1, M2, M3 = DONE).
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\TEST_INFRA.md` — Master E2E Test Infrastructure.
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\GATE_STATUS.md` — Gate verdicts (Gate 1 PASS, Gate 2 PASS, Gate 3 PASS).
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\progress.md` — Liveness & progress heartbeat.
