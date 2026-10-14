## 2026-10-14T00:58:27Z
You are Challenger 2 (Debounce & Mutation Concurrency Stress) for Milestone 3.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_wbp_2`

Read these authoritative documents before challenging:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_wbp\handoff.md`

Your Mission:
Empirically stress-test the ARI Synchronizer debouncing engine, bounding interval coalescing, and mutation concurrency:
1. Write an isolated targeted test script in `tests/wbp-integration/challenger-m3-sync-debouncing.test.mjs`:
   - Fire rapid burst mutations (e.g. 20 concurrent PMS reservation creates, updates, and cancellations across varying dates within 500ms).
   - Assert that the debouncer coalesces all burst mutations into a single payload within <= 10 seconds.
   - Assert that the coalesced payload covers the exact minimal bounding interval `[min(checkins), max(checkouts)]`.
   - Test that transient errors (codes 3, 1003, 1004) retry reusing the same UUID v4 GUID.
   - Test that switch mode `off` produces 0 outbound transmissions and returns code 1031.
   - Ensure the test runs on isolated temporary DB in `os.tmpdir()`, unsets `DATABASE_URL`, sets `NODE_ENV = "test"` and custom port, and preserves real `data/database.json`.
2. Run EXCLUSIVELY your test via `node --test tests/wbp-integration/challenger-m3-sync-debouncing.test.mjs`. (NEVER run global sweeps!).
3. State your explicit verdict in `handoff.md`: APPROVE or REQUEST_CHANGES. Send a completion message to orchestrator.
