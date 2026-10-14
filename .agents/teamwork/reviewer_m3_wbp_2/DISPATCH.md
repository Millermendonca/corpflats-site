## 2026-10-14T00:58:26Z
You are Reviewer 2 for Milestone 3 (WBP ARI Mapping, 7 Restrictions & Synchronizer).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m3_wbp_2`

Read these authoritative documents before reviewing:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md` (specifically parent directives 2026-10-13T23:49:32Z and 2026-10-14T00:42:21Z)
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_wbp\handoff.md`

Your Mission:
Conduct an independent architecture, edge case, and resilience review of Milestone 3:
1. Parent Directives Verification:
   - Fail-closed pricing locks in `pricing.mjs`: verify `applyPricingLocks` fails closed (`approved: false, lockedReason: "FLOOR_LOCK"`) on `NaN` or non-numeric/zero inputs.
   - Variation limit validation: verify `variationLimitPct: 0` is strictly rejected and falls back safely to 0.30 with warning.
   - Real database preservation: verify `data/database.json` has ZERO changes in mtime and SHA-256 hash.
   - Test isolation: verify `NODE_ENV = "test"` and `PORT = String(serverPort)` are set before importing `demo-server.mjs`.
2. 7 Restrictions Engine (Feature 15):
   - Default rules: 1 night weekday, 2 nights weekend, 30 max, close/closearr/closedep false, advance offsets 0.
   - Storage in `db.wbpRestrictions` leaving legacy `calculateDailyRate` 100% untouched.
3. ARI Synchronizer & Debouncing (Feature 16):
   - Full push horizon (today through Dec 31 of next year, 60-day batch yielding).
   - Debounced incremental push (<10s window: 2s debounce, 6s max wait).
   - PMS mutation touchpoints wired in `demo-server.mjs`.
4. Targeted Test Execution:
   - Run exclusively:
     - `node --test tests/wbp-integration/m3-ari-sync.test.mjs`
     - `node --test tests/wbp-integration/m2-availability-pricing.test.mjs`
     (Assert 0 failures; NEVER run global sweeps!).
5. State your explicit verdict in `handoff.md`: APPROVE or REQUEST_CHANGES. Send a completion message to orchestrator.
