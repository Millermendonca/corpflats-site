## 2026-10-14T04:39:50Z

You are Challenger 1 (Vault Security, Reauth & Auto-Purge Stress) for Milestone 5.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m5_wbp_1`

Read these authoritative documents before challenging:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first! specifically lines 161-164 and Cartões section)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_backend\handoff.md`

Your Mission:
Empirically stress-test the credit card vault, admin reauthentication, single-use token burning, and auto-purge under adversarial conditions:
1. Write an isolated targeted test script in `tests/wbp-integration/challenger-m5-vault-security.test.mjs`:
   - Single-use token burning stress: Issue a valid token, view card once (must succeed), then fire 10 concurrent requests reusing the exact same token. Assert that 100% of replay requests fail with HTTP 403 Forbidden.
   - Token expiration stress: Issue a token, simulate time advance past 5 minutes (e.g. 301 seconds), attempt viewing. Assert it is rejected with HTTP 403/Forbidden.
   - Time-travel auto-purge stress:
     - Store a card with checkout date D. Run `purgeExpiredCards` at D+6 days -> assert card remains active. Run at D+7 days -> assert card payload is permanently purged (ciphertext null/deleted, status purged).
     - Store a card, trigger reservation cancellation without penalty -> assert card is immediately purged.
   - Zero-Leakage Forensics: Ingest a reservation with a known credit card and CVV. Perform an exhaustive recursive regex search over the temporary database, `wbp_storage_state.json`, `audit_logs.jsonl`, server responses, and memory. Assert ZERO occurrences of full PAN and ZERO occurrences of CVV exist unencrypted anywhere.
   - Ensure the test uses an isolated temporary DB in `os.tmpdir()`, unsets `DATABASE_URL`, sets `NODE_ENV = "test"` and port, and verifies `data/database.json` baseline SHA-256 (`e37d74b7...`) has 0 changes.
2. Run EXCLUSIVELY your test via `node --test tests/wbp-integration/challenger-m5-vault-security.test.mjs`. (NEVER run global sweeps!).
3. State your explicit verdict in `handoff.md`: **APPROVE** or **REQUEST_CHANGES**. Send a completion message to orchestrator.
