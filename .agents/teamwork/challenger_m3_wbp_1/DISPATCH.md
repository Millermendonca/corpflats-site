## 2026-10-14T00:58:27Z
You are Challenger 1 (ARI Payload & 7 Restrictions Stress) for Milestone 3.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_wbp_1`

Read these authoritative documents before challenging:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_wbp\handoff.md`

Your Mission:
Empirically stress-test ARI payload construction, inclusive date rules, and the 7 restrictions engine under adversarial workloads:
1. Write an isolated targeted test script in `tests/wbp-integration/challenger-m3-ari-restrictions.test.mjs`:
   - Test weekend boundary transitions (Thursday to Friday night, Sunday to Monday night) verifying `min_los` switches between 1 and 2.
   - Test adversarial restriction combinations (e.g. `min_los > max_los` clamping, stop-sell `close: true`, CTA `closearr: true`, CTD `closedep: true`).
   - Test ceiling clamping under various inventory levels: available = 0, available < ceiling, available = ceiling, available > ceiling, negative inputs.
   - Test WBP OpenAPI schema compliance by running generated payloads against `e2e/wbp-simulator/schemas/index.mjs`.
   - Ensure the test uses an isolated temporary DB in `os.tmpdir()`, unsets `DATABASE_URL`, sets `NODE_ENV = "test"` and port, and verifies `data/database.json` has 0 changes.
2. Run EXCLUSIVELY your test via `node --test tests/wbp-integration/challenger-m3-ari-restrictions.test.mjs`. (NEVER run global sweeps!).
3. State your explicit verdict in `handoff.md`: APPROVE or REQUEST_CHANGES. Send a completion message to orchestrator.
