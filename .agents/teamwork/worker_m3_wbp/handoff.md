# Handoff Report — Milestone 3: WBP ARI Mapping, 7 Restrictions & Synchronizer

## 1. Observation
- Target branch is strictly `feature/wbp-integration`:
  ```
  On branch feature/wbp-integration
  Your branch is up to date with 'origin/feature/wbp-integration'.
  ```
- Real database file `data/database.json` baseline:
  - SHA-256: `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`
  - mtime: `2026-10-14T00:15:54.476Z`
  - Unchanged across all test executions.
- Pricing engine locks updated in `artifacts/api-server/wbp/pricing.mjs` and `scripts/wbp/pricing.mjs`:
  - `applyPricingLocks`: Floor lock evaluates `Number.isFinite` and positive values; fails closed (`approved: false, lockedReason: "FLOOR_LOCK"`) on `NaN` or non-numeric/zero inputs.
  - `WbpPricingManager.updateSettings`: Strictly validates `variationLimitPct` and throws error if `<= 0` or non-numeric; `applyPricingLocks` logs warning and falls back to standard `0.30` if invalid.
- ARI Mapping, 7 Restrictions, and Synchronizer implemented in `artifacts/api-server/wbp/ari-sync.mjs` and `scripts/wbp/ari-sync.mjs`:
  - Mapping: 19 physical flats -> 1 room type `flat` (base 2, max 3).
  - Rate plans: `sem_cafe` and `com_cafe` (+R$ 25 breakfast surcharge/guest/night) with OBP payload structure (`adult_1`, `adult_2`, `adult_3`, `rdef_single`).
  - Shared inventory: `units = Math.max(0, Math.min(planCeiling ?? 19, canonicalAvailable))`.
  - Inclusive `end_date`: Start date equals end date for 1 night, contiguous block merging for multi-night stays.
  - Restrictions: 7 fields (`min_los`, `max_los`, `close`, `closearr`, `closedep`, `min_advanced_offset`, `max_advanced_offset`), default weekday 1 / weekend 2 min_los, max_los 30, stored in `db.wbpRestrictions`.
  - Synchronizer (`WbpAriSynchronizer`): General switch guard (`off`, `observe`, `auto`), initial full push horizon (today through Dec 31 of next year, 60-day batches yielding via `setImmediate`), debounced incremental push (<10s window: 2s debounce, 6s max-wait ceiling) coalescing bounding intervals, transient retry with GUID reuse, persistent alert (>15 min) and recovery notification.
  - Administrative routes: `GET /api/wbp/ari/status`, `GET /api/wbp/restrictions`, `POST /api/wbp/restrictions`, `POST /api/wbp/ari/full-sync`.
  - PMS mutation touchpoints: `notifyPmsMutation` wired across reservations (create, update, cancel, status change, dates change), room blocks (create, delete), service orders (create, status transition, cancel, finish).
- Test Execution:
  - `node --test tests/wbp-integration/m3-ari-sync.test.mjs`:
    - Result: 21 tests, 7 suites, 21 passed, 0 failed in 2.348s.
  - `node --test tests/wbp-integration/m2-availability-pricing.test.mjs`:
    - Result: 25 tests, 5 suites, 25 passed, 0 failed in 7.034s.
- Twin Parity Verification:
  - `wbp/pricing.mjs`: SHA-256 `47ee0197c74c895f02f449181d62a003e8f889a292243cc2bc27b1f27456b476` (MATCH)
  - `wbp/ari-sync.mjs`: SHA-256 `e994810661f5fb212520f3a063c7d1a17f4a26d7dd1131a11f4bc7a0717c978a` (MATCH)
  - `demo-server.mjs`: SHA-256 `c1ccfc713793d30d9b591d9020cf8abe51b787294edbc76e987ac06620d45ae8` (MATCH)
  - `wbp/availability.mjs`: SHA-256 `340e93be61171c21d46d01173a93d7e797184a97d46799e1322d2f6ba7143cad` (MATCH)
  - `wbp/client.mjs`: SHA-256 `84c57d725079d47714af83bfb6dc5416c4b3dafb1e88ee16df520e387a6495fc` (MATCH)
  - `wbp/config.mjs`: SHA-256 `0f36123e0ce55a7d04853fa2eb951308e5b2394c1b360232e5a43831dc63fbd5` (MATCH)

## 2. Logic Chain
1. Directives required fail-closed pricing locks when `tarifaMinima` or `manualFloor` is `NaN`. In `applyPricingLocks`, explicit finite numeric checks enforce rejection with `approved: false` and `lockedReason: "FLOOR_LOCK"`.
2. Directives required strict rejection of `variationLimitPct: 0` and negative values. `WbpPricingManager.updateSettings` now throws an explicit error when `<= 0` or non-numeric, preventing corrupted settings from persisting. In `applyPricingLocks`, non-positive variation limits are logged and safely fall back to the standard 0.30 limit.
3. Feature 14 mapped all 19 CorpFlats units to the single commercial room type `flat` with `maxOccupancy: 3` and `baseOccupancy: 2`. Shared inventory calculation ensures `units = Math.max(0, Math.min(planCeiling ?? 19, canonicalAvailable))`. Contiguous blocks with identical stay attributes are compressed with `end_date` inclusive, matching WBP's stay-night protocol.
4. Feature 15 implemented the 7 restrictions engine with hierarchical resolution (specific override > date override > plan default > global default > legacy fallback) stored in `db.wbpRestrictions`. This leaves legacy `calculateDailyRate` completely untouched, preserving 100% backward compatibility.
5. Feature 16 implemented `WbpAriSynchronizer` with general switch mode protection (`off`, `observe`, `auto`), initial full push horizon generation, and incremental debounced push coalescing bounding intervals into a single payload within <10s. Transient failures retry with identical UUID v4 GUID to prevent duplicate execution, while failures lasting longer than 15 minutes trigger persistent alerts.
6. The targeted test runner isolated database state via temporary directories (`os.tmpdir()`), verified real database integrity before and after test execution, and confirmed zero mutations or hash discrepancies in `data/database.json`.

## 3. Caveats
- Production deployment requires configuring real WBP credentials (`pms_cid`, `shared_secret`, `wbp_property_id`, `wbp_property_password`) in `db.settings.wbp` when switching from `observe` mode to `auto` mode.
- In `observe` mode, all ARI blocks, restrictions, and OBP payloads are logged and calculated with zero external network traffic, allowing safe operational auditing.

## 4. Conclusion
Milestone 3 (Features 14, 15, and 16) is fully implemented, verified, and complete:
- 100% test pass rate across targeted test suites (`m3-ari-sync.test.mjs`: 21/21, `m2-availability-pricing.test.mjs`: 25/25).
- 100% SHA-256 byte-for-byte twin parity between `artifacts/api-server/` and `scripts/`.
- Zero database pollution: `data/database.json` remained untouched.
- Clean isolation adhering strictly to AGENTS.md constraints.

## 5. Verification Method
To independently verify this implementation:
1. Verify git branch is `feature/wbp-integration`:
   `git status`
2. Run targeted M3 test suite:
   `node --test tests/wbp-integration/m3-ari-sync.test.mjs`
3. Run non-regression targeted M2 test suite:
   `node --test tests/wbp-integration/m2-availability-pricing.test.mjs`
4. Verify SHA-256 twin parity across all files:
   `node -e "const crypto=require('crypto'),fs=require('fs');['wbp/pricing.mjs','wbp/ari-sync.mjs','demo-server.mjs','wbp/availability.mjs','wbp/client.mjs','wbp/config.mjs'].forEach(f=>{const h1=crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/'+f)).digest('hex'),h2=crypto.createHash('sha256').update(fs.readFileSync('scripts/'+f)).digest('hex');if(h1!==h2)throw new Error('Mismatch: '+f);console.log(f,'MATCH',h1);});"`
5. Confirm real database integrity:
   `node -e "const crypto=require('crypto'),fs=require('fs');console.log(crypto.createHash('sha256').update(fs.readFileSync('data/database.json')).digest('hex'));"`
   Must match `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`.
