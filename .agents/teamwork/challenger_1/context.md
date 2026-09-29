# Context: Challenger 1 (Empirical Verification & Stress Testing)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/challenger_1`
- **Scope Documents**:
  - `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md`
  - `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/TEST_READY.md`
- **Task**:
  - Adversarially stress-test the solution:
    - Attempt to trigger clean-to-dirty reversions under multiple simulated API calls.
    - Test edge cases around 18:00 switchover, timezone handling, month boundaries.
    - Verify that no duplicate dirty checkout requests can be spawned on already cleaned flats.
    - Test statement consistency when multiple requests or payments are processed.
  - Deliver structured report and handoff with verdict: CONFIRMED or FAILED.
