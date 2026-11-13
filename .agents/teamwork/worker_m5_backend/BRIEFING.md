# BRIEFING — 2026-10-14T04:35:00Z

## Mission
Implement Milestone 5 Backend: Credit Card Encrypted Vault (F25), Admin Reauth, Single-Use Token & Auto-Purge (F26), Provisional Messages & Reviews Adapters (F27), Server Route Mounting in demo-server.mjs, and Targeted Test Suite in tests/wbp-integration/m5-vault-ui.test.mjs, maintaining 100% twin parity and zero regressions.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_backend
- Original parent: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Milestone: Milestone 5 (Features 25, 26, 27 & Server Mounting)

## 🔒 Key Constraints
- DO NOT CHEAT: Genuine implementations only. No hardcoding test results or facade mocks.
- Mandatory byte-for-byte SHA-256 twin parity between `artifacts/api-server/` and `scripts/`.
- Strict testing scope: NEVER run global sweeps or `tests/*.test.mjs`. Execute ONLY targeted tests.
- Isolate test DB in `os.tmpdir()` and unset `DATABASE_URL`. Zero changes to baseline `data/database.json`.
- In-memory CVV discard: CVV is NEVER encrypted, NEVER saved, NEVER logged.
- Always `git push origin feature/wbp-integration` on commit.

## Current Parent
- Conversation ID: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Updated: 2026-10-14T04:35:00Z

## Task Summary
- **What to build**:
  - Feature 25: `vault.mjs` (AES-256-GCM, key from env, CVV discard in memory, PAN masking, dedicated storage in `data/wbp_card_vault.json`).
  - Feature 26: Admin reauth (`/api/wbp/vault/reauth`), single-use 5-minute token, secure view (`/api/wbp/vault/view`), auto-purge (7 days post-checkout & non-penalty cancellation) and scheduler.
  - Feature 27: `provisional.mjs` (Provisional messages & reviews adapters, disabled by default, OpenAPI-compliant simulator updates).
  - Server mounting in `demo-server.mjs` with parity.
  - Targeted test suite: `tests/wbp-integration/m5-vault-ui.test.mjs`.
- **Success criteria**: All targeted tests pass; zero PAN/CVV leakage confirmed by forensic scanner; twin parity 100%; baseline DB intact.
- **Interface contracts**: `docs/integracoes/webbookingpro/PROJECT.md` & Explorer 1/2 blueprints.
- **Code layout**: `artifacts/api-server/wbp/` mirrored in `scripts/wbp/`; `artifacts/api-server/demo-server.mjs` mirrored in `scripts/demo-server.mjs`.

## Key Decisions Made
- Standardized vault API and method names across `vault.mjs`, `callbacks.mjs`, `inbox.mjs`, and `demo-server.mjs`.
- Dedicated storage file `wbp_card_vault.json` isolated from `database.json`, respecting `DATA_FILE` directory in test mode.
- Non-throwing production fallback key with console.warn when env var is missing during instantiation.
- Auto-purge scheduler strictly gated by `isWbpEnabled(db)`.
- Fixed undeclared `paymentCollect`/`collectAtCheckin` in `demo-server.mjs` resolving legacy PMS reservation regression.

## Change Tracker
- `artifacts/api-server/wbp/vault.mjs` & `scripts/wbp/vault.mjs`: Complete credit card encrypted vault, reauth token manager, auto-purge engine, and forensic zero-leakage scanner.
- `artifacts/api-server/wbp/provisional.mjs` & `scripts/wbp/provisional.mjs`: Provisional messages and reviews adapters (disabled by default).
- `artifacts/api-server/wbp/config.mjs` & `scripts/wbp/config.mjs`: Added getters and setters for provisional messages and reviews.
- `artifacts/api-server/wbp/callbacks.mjs` & `scripts/wbp/callbacks.mjs`: Deep CVV stripping, vault card capture before PAN masking.
- `artifacts/api-server/wbp/inbox.mjs` & `scripts/wbp/inbox.mjs`: Card vault capture, immediate purge on cancellation without penalty.
- `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: Mounted vault reauth/view/purge and provisional endpoints, auto-purge scheduler startup.
- `e2e/wbp-simulator/server.mjs` & `e2e/wbp-simulator/schemas/index.mjs`: Added endpoints and tolerant schemas for messages and reviews simulator verbs.
- `tests/wbp-integration/m5-vault-ui.test.mjs`: Targeted 11-test suite for Milestone 5.

## Quality Status
- **Build/test result**: PASS. All targeted test suites passed cleanly:
  - `m5-vault-ui.test.mjs`: 11/11 passed (0 failures)
  - `m4-reservations-inbox.test.mjs`: 26/26 passed (0 failures)
  - `m3-ari-sync.test.mjs`: 21/21 passed (0 failures)
  - `m2-availability-pricing.test.mjs`: 25/25 passed (0 failures)
- **Database integrity**: Baseline `data/database.json` SHA-256 (`e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`) perfectly preserved (0 modifications).
- **Twin parity**: 100% byte-for-byte SHA-256 identical across all 13 twin pairs.
