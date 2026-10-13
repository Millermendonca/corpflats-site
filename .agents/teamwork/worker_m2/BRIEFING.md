# BRIEFING — 2026-10-13T23:20:00Z

## Mission
Milestone 2: Implement Canonical Availability Engine and SEBRAE Pricing Engine with Safety Locks, Breakfast Surcharge, Twin-Files Parity, and Targeted Tests.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2
- Original parent: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Milestone: Milestone 2 (Canonical Availability & SEBRAE Pricing Engine with Locks)

## 🔒 Key Constraints
- DO NOT CHEAT: Genuine implementations only, no dummy/facade implementations, no hardcoded test results.
- STRICT TEST SCOPE: NEVER run global tests (`tests/*.test.mjs` or test sweeps). Run EXCLUSIVELY `node --test tests/wbp-integration/m2-availability-pricing.test.mjs` with `DATABASE_URL` unset.
- TWIN FILES PARITY: 100% byte-for-byte SHA-256 parity between `artifacts/api-server/wbp/*` and `scripts/wbp/*`, and `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
- Always git push after committing on branch `feature/wbp-integration`.
- SEBRAE Math: Exact formula without R$/day commission in variable cost; Tariff = 149.38 / (1 - 0.15 - 0.25 - 0.06) = 276.63, analytical decomposition closed with zero residue.
- NON-REGRESSION MANDATE:
  1. Legacy tariff engine (`calculateDailyRate`, `getTariffSettings`, `calculateSebraeSustainableRate`, `db.tariffSettings`/`tariffOverrides`) must remain intact and must NOT be altered when WBP integration is off or new pricing is not published.
  2. Direct-booking, bot quote (`/api/bot-actions/quote`), and manual reservations continue working unchanged.
  3. Canonical availability provides ARI & non-blocking conflict warnings without breaking existing endpoints.
  4. Mandatory test proving zero regression in `calculateDailyRate` and bot quote when unpublished.

## Current Parent
- Conversation ID: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Updated: 2026-10-13T23:20:00Z

## Task Summary
- **What to build**:
  1. `artifacts/api-server/wbp/availability.mjs` & `scripts/wbp/availability.mjs`: Canonical availability engine resolving divergent calculations across 19 flats (active bookings, room blocks, active holds, maintenance OS).
  2. `artifacts/api-server/wbp/pricing.mjs` & `scripts/wbp/pricing.mjs`: SEBRAE pricing engine with exact markup, historical seasonality, floor lock, 30% variation lock, staged publication, breakfast surcharge.
  3. `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: Mounted WBP endpoints and non-blocking conflict warnings.
  4. `tests/wbp-integration/m2-availability-pricing.test.mjs`: 25 targeted tests including real-gold non-regression comparison against commit 0501d02.
- **Success criteria**: All criteria met 100%.
- **Interface contracts**: `docs/integracoes/webbookingpro/PROJECT.md`
- **Code layout**: `artifacts/api-server/wbp/`, `scripts/wbp/`, `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/wbp-integration/`.

## Key Decisions Made
- SEBRAE Math: Fixed unit cost 101.62 + variable 47.76 = 149.38 / 0.54 = 276.63. Decomp: 149.38 custo + 41.49 comissão + 69.16 margem + 16.60 simples = 276.63, exactly closed with 0 residue.
- Staged publish: Only delete staged items that were actually published; preserved unconfirmed modifications.
- Non-blocking conflict warnings: Embedded in PMS reservation routes without rejecting valid creations.
- Test isolation: Dynamic ports and temporary database in os.tmpdir() ensure zero mutation to data/database.json.

## Artifact Index
- `artifacts/api-server/wbp/availability.mjs` - Canonical Availability Engine
- `scripts/wbp/availability.mjs` - Canonical Availability Engine (twin copy)
- `artifacts/api-server/wbp/pricing.mjs` - SEBRAE Pricing Engine & Safety Locks
- `scripts/wbp/pricing.mjs` - SEBRAE Pricing Engine & Safety Locks (twin copy)
- `artifacts/api-server/demo-server.mjs` - Server routes for WBP and conflict warnings
- `scripts/demo-server.mjs` - Server routes for WBP and conflict warnings (twin copy)
- `tests/wbp-integration/m2-availability-pricing.test.mjs` - Targeted M2 test suite

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/wbp/availability.mjs` (created)
  - `scripts/wbp/availability.mjs` (created)
  - `artifacts/api-server/wbp/pricing.mjs` (created)
  - `scripts/wbp/pricing.mjs` (created)
  - `artifacts/api-server/demo-server.mjs` (modified)
  - `scripts/demo-server.mjs` (modified)
  - `tests/wbp-integration/m2-availability-pricing.test.mjs` (created)
- **Build status**: 25/25 tests passing (100% pass)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (node --test tests/wbp-integration/m2-availability-pricing.test.mjs: 25 passed, 0 failed)
- **Lint status**: clean
- **Tests added/modified**: 25 comprehensive tests across 5 suites

## Loaded Skills
- None
