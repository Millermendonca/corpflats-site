# Context: Challenger 2 (Empirical Verification & Stress Testing)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/challenger_2`
- **Scope Documents**:
  - `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md`
  - `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/TEST_READY.md`
- **Task**:
  - Adversarially stress-test database integrity and runtime routes:
    - Attempt to induce orphan cleanings, off-duty maid assignments, or code mismatch regressions across all 19 flats.
    - Test Flat 512, Flat 904, Flat 313, Flat 511, and Flat 712 scenarios with simulated concurrent requests.
    - Run `node --test tests/governance-integrity.test.mjs`.
  - Deliver structured report and handoff with verdict: CONFIRMED or FAILED.
