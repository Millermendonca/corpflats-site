## 2026-10-14T09:53:17Z
You are Challenger 1 for Phase 2: Tier 5 Adversarial Coverage Hardening (ARI, Availability & SEBRAE Pricing).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_tier5_wbp_1`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\TEST_READY.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
5. Code files in `artifacts/api-server/wbp/`: `availability.mjs`, `pricing.mjs`, `ari-sync.mjs`, `client.mjs`, `storage.mjs`

Your Mission:
White-box code analysis and adversarial testing of the ARI, availability calculation, and SEBRAE pricing engine:
1. Inspect source code paths for unexercised edge cases, branch conditions, mathematical precision (R$ 276,63 ± 0,05, rounding, zero/negative inputs, leap years, maximum advance dates), and concurrency contention in ARI batching (<10s deltas, debounce timers).
2. Write an isolated targeted test script in `tests/wbp-integration/challenger-tier5-ari-pricing.test.mjs`:
   - Test extreme bounds, leap days (Feb 29), high-volume concurrent availability inquiries, sudden rate spikes >30% vs unstaged overrides, zero available units stop-sell triggers, and network retry failure backoff.
   - Strict isolation: `DATA_FILE: tempDbPath`, `DATABASE_FILE: tempDbPath`, `WBP_RAW_STORAGE_FILE`, `WBP_IDEMPOTENCY_FILE`, `WBP_CARD_VAULT_FILE` in `os.tmpdir()`. Dynamic port allocation.
   - Verify baseline `data/database.json` SHA-256 (`7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6`, 997,627 bytes) has ZERO changes.
3. Run exclusively your test via `node --test tests/wbp-integration/challenger-tier5-ari-pricing.test.mjs`. (NEVER run global sweeps!).
4. Write gap analysis and empirical findings in `handoff.md` in your working directory and notify orchestrator via `send_message`.
