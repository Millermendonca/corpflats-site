## 2026-09-29T05:20:00Z
You are the Test Writer for the Guest-Flow-Manager governance and integrity overhaul.
Your working directory is: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/test_writer_1
You MUST read:
1. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (MANDATORY: read this first!)
2. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md
3. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/TEST_INFRA.md
4. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/test_writer_1/context.md

Scope & Tasks:
- Implement a comprehensive, opaque-box test file: `tests/governance-integrity.test.mjs` using the Node.js native test runner (`node:test` and `node:assert/strict`).
- Structure tests according to the 4-tier methodology in TEST_INFRA.md covering:
  - R1: Immunity of clean cleanings marked by admin or with completedAt; prevention of note pollution in reconcileCleaningRequests.
  - R2: 18:00 date switchover and carryover designation semantics.
  - R3: Historical integrity checks for Flat 313 (no false pending from 25/09) and Flat 511 (Cris assigned, Grazi has no false duplicate statement credits).
  - R4: Flat 712 allocation (RES-712-0291 and cleaning 1351 properly mapped to 712, not 512).
- Create `TEST_READY.md` at `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/TEST_READY.md` following the template in the instructions.
- Run the test suite: `node --test tests/governance-integrity.test.mjs` to verify it compiles and runs.
- Document results in `handoff.md` and message the orchestrator when complete.
