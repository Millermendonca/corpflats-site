## 2026-10-14T04:39:50Z
You are Challenger 2 (Provisional Adapters & Operational Safety Stress) for Milestone 5.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m5_wbp_2`

Read these authoritative documents before challenging:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_backend\handoff.md`
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_frontend\handoff.md`

Your Mission:
Empirically stress-test the provisional adapters, general switch safety, and pricing math contracts:
1. Write an isolated targeted test script in `tests/wbp-integration/challenger-m5-provisional-safety.test.mjs`:
   - Provisional adapters default-disabled check: Assert that when `provisionalMessagesEnabled` and `provisionalReviewsEnabled` are false (default), calling provisional endpoints returns `{ success: false, provisional: true }` and 0 outbound calls are made.
   - Provisional adapters enabled check: Enable flags, send messages and reviews against `e2e/wbp-simulator/server.mjs`. Assert that OpenAPI schema validation succeeds for verbs `GetMessages`, `SendMessage`, `GetReviews`, and `RespondReview`.
   - General switch zero-timer check: When `isWbpEnabled(db)` is false (mode `off`), assert that `startCardAutoPurgeScheduler` registers 0 timers (`setInterval` count = 0).
   - SEBRAE Pricing Math Contract: Assert that calling the pricing engine yields Custo UH = R$ 149,38 and Tarifa Mínima = R$ 276,63 (±0,05) with exact 100% sum (149,38 + 41,49 + 69,16 + 16,60 = 276,63).
   - Ensure the test uses an isolated temporary DB in `os.tmpdir()`, unsets `DATABASE_URL`, sets `NODE_ENV = "test"` and port, and verifies `data/database.json` baseline SHA-256 (`e37d74b7...`) has 0 changes.
2. Run EXCLUSIVELY your test via `node --test tests/wbp-integration/challenger-m5-provisional-safety.test.mjs`. (NEVER run global sweeps!).
3. State your explicit verdict in `handoff.md`: **APPROVE** or **REQUEST_CHANGES**. Send a completion message to orchestrator.
