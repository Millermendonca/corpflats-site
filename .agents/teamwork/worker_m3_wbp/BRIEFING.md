# BRIEFING — 2026-10-14T00:54:00Z

## Mission
Implement Milestone 3 (Features 14, 15, 16) for Guest-Flow-Manager WBP Integration & SEBRAE Pricing Engine with 100% SHA-256 twin parity and targeted testing.

## 🔒 My Identity
- Archetype: worker_m3_wbp
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_wbp
- Original parent: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Milestone: Milestone 3 (ARI Mapping, 7 Restrictions, Synchronizer)

## 🔒 Key Constraints
- Branch MUST be `feature/wbp-integration`. Never commit to `main`.
- ALWAYS run `git push` immediately after commit.
- EXCLUSIVELY run targeted tests (`node --test tests/wbp-integration/m3-ari-sync.test.mjs` and `m2-availability-pricing.test.mjs`). Never run batch sweeps.
- Maintain 100% SHA-256 byte-for-byte parity between `artifacts/` and `scripts/`.
- Real `data/database.json` MUST remain untouched in mtime and hash.
- Strict validation of `variationLimitPct` (including 0 as invalid).
- Set `process.env.NODE_ENV = "test"` and `process.env.PORT = String(serverPort)` to avoid unclosed servers.

## Current Parent
- Conversation ID: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Updated: 2026-10-14T00:42:53Z

## Task Summary
- **What to build**: ARI Mapping, 7 Restrictions Engine, ARI Synchronizer class, PMS mutation touchpoints, WBP simulator validation.
- **Success criteria**: 100% test pass on targeted tests, 100% twin parity, zero database.json pollution.

## Key Decisions Made
- Task 0: Fail-closed pricing locks implemented in `pricing.mjs` (floor lock fails closed on NaN, variation limit strictly validated including `variationLimitPct: 0` and negative values).
- Feature 14: Room & Rate Mapping + ARI Payload Builder (`ari-sync.mjs`). 19 physical flats mapped to 1 commercial room `flat`, 2 rate plans (`sem_cafe` and `com_cafe` with +R$ 25 breakfast surcharge), shared inventory math `units = max(0, min(ceiling ?? 19, canonicalAvailable))`, OBP fields, inclusive `end_date` rule, contiguous block compression.
- Feature 15: 7 Restrictions Engine (`min_los`: 1 weekday/2 weekend, `max_los`: 30, `close`: false, `closearr`: false, `closedep`: false, `min/max_advanced_offset`: 0) stored in `db.wbpRestrictions` without touching legacy `calculateDailyRate`.
- Feature 16: ARI Synchronizer (`WbpAriSynchronizer`) supporting initial full push (today to next year's 12-31 in 60-day batches with `setImmediate`), incremental debounced push (<10s window: 2s debounce, 6s max-wait ceiling) coalescing bounding intervals, general switch modes (`off`, `observe`, `auto`), transient retries with UUID v4 GUID reuse, and persistent failure alert (>15 min).
- Administrative routes (`/api/wbp/ari/full-sync`, `/api/wbp/ari/status`, `/api/wbp/restrictions`) and 10 PMS mutation touchpoints wired with twin parity.
- Isolated test runner process pattern to prevent hanging event loop and ensure clean test execution.

## Artifact Index
- `artifacts/api-server/wbp/pricing.mjs` & `scripts/wbp/pricing.mjs`: Pricing engine with fail-closed locks.
- `artifacts/api-server/wbp/ari-sync.mjs` & `scripts/wbp/ari-sync.mjs`: Complete ARI mapping, 7 restrictions, and synchronizer engine.
- `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: PMS mutation touchpoints and HTTP admin routes.
- `tests/wbp-integration/m3-ari-sync.test.mjs`: Targeted 21-test suite covering all M3 scenarios.
- `tests/wbp-integration/harness/wbp-simulator-harness.mjs`: OpenAPI-compliant ARIUpdate mock handler.

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/wbp/pricing.mjs` & `scripts/wbp/pricing.mjs`: Fail-closed locks and strict variationLimitPct validation.
  - `artifacts/api-server/wbp/ari-sync.mjs` & `scripts/wbp/ari-sync.mjs`: Milestone 3 core implementation.
  - `tests/wbp-integration/m3-ari-sync.test.mjs`: Targeted M3 test suite.
  - `tests/wbp-integration/harness/wbp-simulator-harness.mjs`: OpenAPI schema `body.Inventory` alignment.
- **Build status**: PASS (21/21 M3 tests pass in 2.3s, 25/25 M2 tests pass in 7.0s)
- **Pending issues**: None. All requirements satisfied with 100% twin parity and zero database pollution.

## Quality Status
- **Build/test result**: PASS (M3: 21/21 passed, M2: 25/25 passed).
- **Lint status**: Clean.
- **Tests added/modified**: `tests/wbp-integration/m3-ari-sync.test.mjs` with 7 test suites, 21 subtests.
