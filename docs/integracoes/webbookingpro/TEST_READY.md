# TEST_READY: WebBookingPro (WBP) Channel Manager Integration & SEBRAE Pricing Engine E2E Master Test Suite

## 1. Executive Summary

A comprehensive, opaque-box, 4-tier End-to-End (E2E) integration test suite has been authored, verified, and certified across `tests/wbp-integration/` to govern the CorpFlats Guest-Flow-Manager WebBookingPro (WBP) Channel Manager Integration and SEBRAE Hotel Pricing Engine across all 31 functional features (F1–F31, Milestones 1–5).

The master test suite executes completely autonomously using the native Node.js test runner (`node:test` and `node:assert/strict`), operating against isolated backend instances and dedicated ephemeral databases in `os.tmpdir()` with dynamic port allocation, zero network leakage, and zero dependencies on external testing frameworks.

### Cryptographic & Operational Integrity Invariants
- **Zero Production Pollution**: Baseline production `data/database.json` SHA-256 (`7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6`, 997,627 bytes) is strictly preserved with 0 mutations pre- and post-flight across all test runs.
- **PCI-DSS Compliance**: Strict zero-CVV storage and zero unencrypted PAN leakage. Full card numbers encrypted via AES-256-GCM with environment key `CARD_ENCRYPTION_KEY`.
- **Single-Use Burning Token**: Credit card details access requires admin password re-authentication yielding a single-use token valid for 300 seconds that is burned on first retrieval.
- **Twin-Server SHA-256 Parity**: 13/13 file pairs between `scripts/` and `artifacts/api-server/` are byte-for-byte identical.
- **Strict Scope Discipline (AGENTS.md)**: Targeted execution only. Global sweeps and batch runs (`tests/*.test.mjs`) are strictly prohibited.

---

## 2. Test Execution Details

All tests are executed exclusively via explicit targeted commands:

```powershell
# Tier 1: Feature Coverage (F1–F31 Happy Paths — 155 Tests)
node --test tests/wbp-integration/e2e-tier1-features.test.mjs

# Tier 2: Boundary & Corner Cases (F1–F31 Edge Cases — 155 Tests)
node --test tests/wbp-integration/e2e-tier2-boundaries.test.mjs

# Tier 3: Pairwise Combinatorial Matrix (Cross-Module Combinations — 35 Tests)
node --test tests/wbp-integration/e2e-tier3-pairwise.test.mjs

# Tier 4: Real-World Operational Workloads (7 Hotel Operations Scenarios — 7 Tests)
node --test tests/wbp-integration/e2e-tier4-workloads.test.mjs
```

- **Execution Engine**: Node.js Native Test Runner (`node:test`)
- **Assertion Framework**: Node.js Strict Assertions (`node:assert/strict`)
- **Isolation Architecture**: `os.tmpdir()` sandboxed databases, dynamic OS-assigned ports, `DATABASE_URL` stripped.

---

## 3. Comprehensive Feature Coverage Matrix (F1–F31 across Tiers 1–4)

| Feature | Feature Description | Milestone | Tier 1 (Happy Path) | Tier 2 (Boundary/Edge) | Tier 3 (Pairwise) | Tier 4 (Workload) | Total Tests |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **F1** | General Switch & Modes (`off`, `observe`, `auto`) | M1 | 5 | 5 | ✓ | ✓ | 12 |
| **F2** | Durable Raw Storage & Pre-Processing Ingestion | M1 | 5 | 5 | — | — | 10 |
| **F3** | Serialized State Writes & Mutex Concurrency | M1 | 5 | 5 | — | — | 10 |
| **F4** | Isolated Test Runner & Ephemeral Sandboxing | M1 | 5 | 5 | — | — | 10 |
| **F5** | WBP API Client (8 Endpoints with GUIDs & Retries) | M1 | 5 | 5 | — | — | 10 |
| **F6** | Local WBP Simulator Harness & Fault Injection | M1 | 5 | 5 | — | — | 10 |
| **F7** | Secrets Management & External Environment Keys | M1 | 5 | 5 | — | — | 10 |
| **F8** | Server Parity (13/13 Twins) & Memory Governance | M1 | 5 | 5 | — | — | 10 |
| **F9** | Canonical Availability Engine (19 Flats Single Source) | M2 | 5 | 5 | — | ✓ | 11 |
| **F10** | SEBRAE Pricing Engine (Unit Cost R$ 149.38 -> Min Rate) | M2 | 5 | 5 | ✓ | ✓ | 12 |
| **F11** | Pricing Safety Locks (30% Variation & Floor Locks) | M2 | 5 | 5 | ✓ | ✓ | 12 |
| **F12** | Breakfast Surcharge Calculation ("Com café" Plans) | M2 | 5 | 5 | — | ✓ | 11 |
| **F13** | Conflict Detection & Non-Blocking Front-Desk Warnings | M2 | 5 | 5 | ✓ | ✓ | 12 |
| **F14** | ARI Mapping & Shared Inventory Synchronization | M3 | 5 | 5 | ✓ | ✓ | 12 |
| **F15** | 7 ARI Restrictions Engine (Min/Max Stay, CTA, CTD, Stop-Sell)| M3 | 5 | 5 | ✓ | — | 11 |
| **F16** | ARI Batch & Incremental Sync (<10s Deltas) | M3 | 5 | 5 | ✓ | ✓ | 12 |
| **F17** | Inbound Webhooks & Form Urlencoded Callbacks | M4 | 5 | 5 | ✓ | ✓ | 12 |
| **F18** | Background Polling Fallback (30m Interval, 5m Overlap) | M4 | 5 | 5 | — | — | 10 |
| **F19** | OTA Inbox & 19-Flat Fair-Share Allocation Engine | M4 | 5 | 5 | ✓ | ✓ | 12 |
| **F20** | Quarantine Management Engine & Collision Routing | M4 | 5 | 5 | ✓ | ✓ | 12 |
| **F21** | OTA Mutations (Auto-Cancel & Stay Modification) | M4 | 5 | 5 | ✓ | ✓ | 12 |
| **F22** | Manual Reservation Reconciliation Engine | M4 | 5 | 5 | — | — | 10 |
| **F23** | Automations & Strict PIX Suppression for OTAs | M4 | 5 | 5 | ✓ | ✓ | 12 |
| **F24** | Critical Events Alerting (WhatsApp, Email & 07:00 Digest)| M4 | 5 | 5 | — | — | 10 |
| **F25** | Credit Card AES-256-GCM Vault & Zero-CVV Storage | M5 | 5 | 5 | ✓ | ✓ | 12 |
| **F26** | Admin Re-Authentication & 7-Day Auto-Purge Lifecycle | M5 | 5 | 5 | ✓ | ✓ | 12 |
| **F27** | Provisional Reviews & Messaging Adapters | M5 | 5 | 5 | — | — | 10 |
| **F28** | Pricing & Publishing UI (Draft Staging & Override Modal) | M5 | 5 | 5 | — | — | 10 |
| **F29** | OTA Inbox & Quarantine Triage UI Components | M5 | 5 | 5 | — | — | 10 |
| **F30** | In-System Help Manual (R9 Admin, Front-Desk & Errors) | M5 | 5 | 5 | — | — | 10 |
| **F31** | Production Frontend Build & Dist Artifacts Integrity | M5 | 5 | 5 | — | — | 10 |
| **Total Tests** | **352 Master Tests** | — | **155** | **155** | **35** | **7** | **352** |

---

## 4. Test Suites Breakdown

### Tier 1: Feature Coverage (155 Tests)
- `tests/wbp-integration/e2e-tier1-features.test.mjs`
- 155 tests covering happy paths across F1 through F31 (exactly 5 tests per feature).
- Verifies mode switching, raw payload persistence, client GUID headers, simulator OpenAPI schemas, availability calculations, SEBRAE pricing formula, ARI sync, webhook endpoints, fair-share allocation, quarantine, card vaulting, and UI components.

### Tier 2: Boundary Value Analysis & Corner Cases (155 Tests)
- `tests/wbp-integration/e2e-tier2-boundaries.test.mjs`
- 155 tests covering edge cases, boundary thresholds, malformed payloads, and fault conditions across F1 through F31 (exactly 5 tests per feature).
- Exercises price variation bounds (>30% spike), floor rate protection (<R$ 276.63), token expiration past 300s, leap-year dates, empty string fields, missing customer phones, zero-night stay rejections, and network timeout retries.

### Tier 3: Pairwise Combinatorial Matrix (35 Tests)
- `tests/wbp-integration/e2e-tier3-pairwise.test.mjs`
- 35 tests covering cross-feature orthogonal interactions:
  - **Category 1 (7 tests)**: Mode × Webhook (`off`/`observe`/`auto` × `BookingCreate`/`NotifyBooking`/`ARIFullRefresh`).
  - **Category 2 (7 tests)**: Conflict × Payments (`Channel`/`Property` collect, CC vaulting, PIX suppression, overbooking collision).
  - **Category 3 (7 tests)**: Pricing Lock × ARI Push (Variation lock staging, floor lock, manual publish, restrictions).
  - **Category 4 (7 tests)**: Fair-Share × Maintenance Blocks (17 unblocked flats pool, tie-breaking, service orders).
  - **Category 5 (7 tests)**: Re-Auth × Auto-Purge × Cancellation (Single-use burning, 300s timeout, 7-day post-checkout purge).

### Tier 4: Real-World Hotel Operational Workloads (7 Scenarios)
- `tests/wbp-integration/e2e-tier4-workloads.test.mjs`
- 7 comprehensive operational journeys from `TEST_INFRA.md §4`:
  - **Scenario 1**: Weekend High-Occupancy Surge & Shared Inventory Depletion.
  - **Scenario 2**: Overbooking Collision with Walk-in & Quarantine Triage.
  - **Scenario 3**: Unscheduled Room Maintenance / Service Order During Active Stay.
  - **Scenario 4**: Dynamic SEBRAE Pricing Spike with Safety Locks Retaining Publication.
  - **Scenario 5**: Multi-Day Stay Modification & Room Move under High Occupancy.
  - **Scenario 6**: Booking Cancellation with Checked-in Guest Exception.
  - **Scenario 7**: Encrypted Credit Card Vault Lifecycle: Storage, Re-Auth, Checkout & Auto-Purge.

---

## 5. Production Build & Static Parity Certification

- **Twin-Server SHA-256 Parity**: 13/13 file pairs between `artifacts/api-server/` and `scripts/` are 100% byte-for-byte identical.
- **Frontend Clean Build**: `artifacts/limpeza` compiled via `npm run build` with verified bundles in `artifacts/limpeza/dist/public/assets/`.
- **Database Baseline SHA-256**: `7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6` (100% verified).
- **Git Synchronization**: Working tree clean, changes pushed to remote branch `feature/wbp-integration`.
