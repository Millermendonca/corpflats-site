# E2E Test Infrastructure: Guest-Flow-Manager (WebBookingPro Integration & SEBRAE Pricing Engine)

## 1. Test Philosophy

The Guest-Flow-Manager WebBookingPro Integration operates in a mission-critical, live hotel environment (CorpFlats Soho Residence: 19 flats, Campos dos Goytacazes/RJ). Zero data loss, zero operational disruption to front-desk reception, and complete data isolation are non-negotiable requirements.

The test infrastructure is designed under the following core principles:

- **Opaque-Box & Requirement-Driven**: Tests interact exclusively with external interfaces (HTTP endpoints, inbound webhook callbacks, outbound channel manager client requests, persistent raw stores, and rendered UI states). Tests never rely on private implementation functions or internal variable structures, ensuring true black-box integrity.
- **Deterministic Isolation**: Every test run spawns an isolated server process on exclusive ephemeral/dedicated ports, forces `NODE_ENV=test`, completely unsets `DATABASE_URL` to prevent any remote Postgres connection, and runs against a freshly seeded temporary copy of `data/database.json`.
- **Systematic Test Design Methodologies**:
  - **Category-Partitioning**: Equivalence class partitioning of all input domains (modes: `off`/`observe`/`auto`; payment types: `Channel`/`Property`; rate plans: `sem_cafe`/`com_cafe`; channel types: direct, Booking.com, Airbnb).
  - **Boundary Value Analysis (BVA)**: Exhaustive boundary testing on rate limits (minimum sustainable floor, 30% variation lock), date boundaries (inclusive `end_date`, leap year, year-end boundaries, 00:00 midnight transitions), inventory bounds (0 to 19 flats), length-of-stay bounds (`min_los`, `max_los`), and credit card auto-purge thresholds (day 6 vs day 7 vs day 8 post-checkout).
  - **Pairwise Combinatorial Testing (Tier 3)**: Orthogonal matrix of cross-feature interactions (e.g., Switch Mode × Webhook Endpoint × Conflict State × Payment Mode).
  - **Realistic Application Workload Testing (Tier 4)**: Multi-step, end-to-end hotel operations simulating front-desk, housekeeping, guests, and channel manager synchronization under real stress.
- **Compliance with Project Rules (AGENTS.md)**:
  - **Strictly Targeted Invocations**: Global sweeps and wildcards (`tests/*.test.mjs` batch runs) are **strictly forbidden**. The test runner accepts and runs **only** explicitly targeted test files.
  - **No Silent Notifications**: External notification side effects (WhatsApp, SMTP, SERPRO) are captured and asserted by mocks without code silencing.

---

## 2. Feature Inventory & Tier Mapping (All 33 Features)

Every feature defined in `PROJECT.md` is inventoried and mapped across the 4 test tiers:

| # | Feature | Description | Milestone | Source | Tier 1 (Happy Path) | Tier 2 (Boundary/Edge) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------|-----------|--------|:-------------------:|:----------------------:|:-----------------:|:-----------------:|
| **F1** | General Switch & Modes | Master switch (`off`, `observe`, `auto`) with 100% inert behavior when off | M1 | R1 | >=5 | >=5 | ✓ | ✓ |
| **F2** | Durable Raw Storage | Pre-processing append-only raw storage & idempotency immune to pruning | M1 | R1 | >=5 | >=5 | ✓ | ✓ |
| **F3** | Serialized State Writes | Serialized reservation state writes preventing duplicate IDs under concurrency | M1 | R1 | >=5 | >=5 | ✓ | ✓ |
| **F4** | Isolated Test Runner | Verifiable test isolation with `DATABASE_URL` stripped & temp DB file | M1 | R1, R10 | >=5 | >=5 | ✓ | ✓ |
| **F5** | WBP API Client | HTTP client covering 8 mandatory endpoints with GUIDs & retry backoff | M1 | R2 | >=5 | >=5 | ✓ | ✓ |
| **F6** | Local WBP Simulator | Local mock simulator validating OpenAPI schemas, faults, and delays | M1 | R2 | >=5 | >=5 | ✓ | ✓ |
| **F7** | Secrets & Env Config | Credential management (`cid`, `shared_secret`, passwords) outside DB blob | M1 | R2 | >=5 | >=5 | ✓ | ✓ |
| **F8** | Server Parity & Memory | SHA-256 twin file parity (`scripts` ↔ `artifacts`) & 1536 MB memory limits | M1 | R10 | >=5 | >=5 | ✓ | ✓ |
| **F9** | Canonical Availability Engine | Single source of truth availability across bookings, blocks, holds, and OS | M2 | R3 | >=5 | >=5 | ✓ | ✓ |
| **F10** | SEBRAE Pricing Engine | Sustainable rate calculation: Unit Cost R$ 149.38 -> Min Rate R$ 276.63 (±0.05) | M2 | R4 | >=5 | >=5 | ✓ | ✓ |
| **F11** | Pricing Safety Locks | Floor lock, sharp variation lock (>30%), and Staged publication workflow | M2 | R4 | >=5 | >=5 | ✓ | ✓ |
| **F12** | Breakfast Surcharge Calculation | "Com café" = "Sem café" + guest surcharge reflected in OBP fields | M2 | R3 | >=5 | >=5 | ✓ | ✓ |
| **F13** | Conflict Non-blocking Warnings | Non-blocking visual warnings on front-desk calendar for reservation conflicts | M2 | R3 | >=5 | >=5 | ✓ | ✓ |
| **F14** | ARI Mapping & Shared Inventory | 1 Room Type ("Flat") × 2 Plans with shared inventory `min(ceiling, free)` | M3 | R3 | >=5 | >=5 | ✓ | ✓ |
| **F15** | 7 ARI Restrictions | Support for min/max stay, stop-sell, CTA, CTD, min/max advance offset | M3 | R3 | >=5 | >=5 | ✓ | ✓ |
| **F16** | ARI Batch & Incremental Sync | Initial full-year push + sub-10s incremental delta updates on mutations | M3 | R3 | >=5 | >=5 | ✓ | ✓ |
| **F17** | Inbound Webhooks & Form Parsing | Callbacks `/BookingCreate`, `/NotifyBooking` (url-encoded), `/ARIFullRefresh` | M4 | R2 | >=5 | >=5 | ✓ | ✓ |
| **F18** | Background Polling | 30-min backup polling with `wbp_booking_version - 5m` and null fallback | M4 | R2 | >=5 | >=5 | ✓ | ✓ |
| **F19** | OTA Inbox & Fair-Share Allocation | OTA reservation inbox, 19-flat fair-share allocation, and external IDs | M4 | R5 | >=5 | >=5 | ✓ | ✓ |
| **F20** | Quarantine Management Engine | Quarantine routing on overbooking, conflicts, maintenance blocks, or ambiguity | M4 | R5 | >=5 | >=5 | ✓ | ✓ |
| **F21** | OTA Mutations (Cancel & Mod) | Auto-cancellation with room release/ARI sync + diffed modifications | M4 | R5 | >=5 | >=5 | ✓ | ✓ |
| **F22** | Manual Reservation Reconciliation | Initial reconciliation algorithm matching existing manual entries with OTAs | M4 | R5 | >=5 | >=5 | ✓ | ✓ |
| **F23** | Automations & PIX Suppression | Auto-dispatch WhatsApp, SERPRO, maid, reception emails; strict PIX suppression | M4 | R5 | >=5 | >=5 | ✓ | ✓ |
| **F24** | Critical Events & Daily Alerts | WhatsApp/Email manager alerts on quarantine, overbooking, ARI stall >15m | M4 | R8 | >=5 | >=5 | ✓ | ✓ |
| **F25** | Credit Card Encrypted Vault | AES-256-GCM encryption with external key, strict zero-CVV storage, zero leak | M5 | R6 | >=5 | >=5 | ✓ | ✓ |
| **F26** | Admin Re-auth & Auto-purge | Single-use 5-min admin token for card view + auto-purge at 7 days/cancel | M5 | R6 | >=5 | >=5 | ✓ | ✓ |
| **F27** | Provisional Reviews & Messages | Provisional adapters for Get/SendMessage and Reviews (off by default) | M5 | R7 | >=5 | >=5 | ✓ | ✓ |
| **F28** | Pricing & Publishing UI | Approved Min Rate UI tab & Staged Preview/Publishing modal | M5 | R4 | >=5 | >=5 | ✓ | ✓ |
| **F29** | OTA Inbox & Quarantine UI | Front-desk OTA Inbox with triage tabs, quarantine drawer, and conflict resolve | M5 | R5 | >=5 | >=5 | ✓ | ✓ |
| **F30** | In-System Help Manual (R9) | Human-centric Portuguese in-system guide covering admin, desk, and errors | M5 | R9 | >=5 | >=5 | ✓ | ✓ |
| **F31** | Frontend Build & Dist Artifacts | Clean build of `artifacts/limpeza` (`npm run build`) committing `dist/` | M5 | R10 | >=5 | >=5 | ✓ | ✓ |
| **F32** | E2E Opaque-Box Test Track | Master test harness orchestrating Tiers 1-4 across all 31 features | E2E | R1-R10 | N/A | N/A | N/A | N/A |
| **F33** | Adversarial Coverage Hardening | Tier 5 adversarial edge cases, fuzzing, and stress endurance | E2E | R1-R10 | N/A | N/A | N/A | N/A |

---

## 3. Test Architecture & Directory Layout

### 3.1 Runner Location & Command Interface
- **Master Targeted Runner**: `tests/wbp-integration/e2e-runner.mjs`
- **Invocation Syntax**:
  ```bash
  # Execute a single targeted test file (STRICT COMPLIANCE WITH AGENTS.md):
  node tests/wbp-integration/e2e-runner.mjs tests/wbp-integration/smoke-harness.test.mjs

  # Execute a specific Tier test suite:
  node tests/wbp-integration/e2e-runner.mjs tests/wbp-integration/tier1-m1-safety.test.mjs
  ```
- **Execution Guardrails**:
  If invoked without an argument or with wildcards (e.g. `tests/*.test.mjs`), `e2e-runner.mjs` immediately aborts with an exit code of 1 and prints an error reinforcing the prohibition of global sweeps.

### 3.2 Directory Layout
```
tests/wbp-integration/
├── e2e-runner.mjs                       # Master targeted CLI test runner
├── harness/
│   ├── index.mjs                        # Unified test fixture entry point
│   ├── test-env.mjs                     # Isolated server lifecycle (port, db clone, env)
│   ├── wbp-simulator-harness.mjs        # OpenAPI-compliant WBP mock server & fault injector
│   └── test-utils.mjs                   # HTTP client assertions, cryptographic helpers
├── smoke-harness.test.mjs               # Foundational sanity verification of harness
├── tier1-sanity/                        # Tier 1 Happy Path Isolated Tests (>=5 per feature)
│   ├── f01-switch-modes.test.mjs
│   ├── f02-raw-storage.test.mjs
│   ├── f05-wbp-client.test.mjs
│   ├── f09-availability.test.mjs
│   ├── f10-pricing-sebrae.test.mjs
│   └── ...
├── tier2-boundaries/                    # Tier 2 Boundary & Corner Cases (>=5 per feature)
│   ├── f11-pricing-locks.test.mjs
│   ├── f14-shared-inventory.test.mjs
│   ├── f15-restrictions.test.mjs
│   ├── f25-card-vault-purge.test.mjs
│   └── ...
├── tier3-pairwise/                      # Tier 3 Cross-Feature Interactions Matrix
│   ├── switch-vs-webhooks.test.mjs
│   ├── pricing-vs-ari-sync.test.mjs
│   └── allocation-vs-quarantine.test.mjs
└── tier4-workloads/                     # Tier 4 Real-World Hotel Operational Scenarios
    ├── scenario-1-weekend-surge.test.mjs
    ├── scenario-2-overbooking-triage.test.mjs
    ├── scenario-3-maintenance-during-stay.test.mjs
    ├── scenario-4-pricing-locks-rejection.test.mjs
    ├── scenario-5-room-move-modification.test.mjs
    ├── scenario-6-checkin-cancellation.test.mjs
    └── scenario-7-card-lifecycle-purge.test.mjs
```

### 3.3 Pass/Fail Semantics & Exit Codes
- Native Node.js test runner (`node:test`) with strict assertions (`node:assert/strict`).
- **Exit Code 0**: All test cases in the targeted file passed cleanly.
- **Exit Code 1**: Any assertion failed, unhandled exception occurred, or server timeout triggered.
- **Clean Teardown Guarantee**: Harness registers process exit hooks and `try...finally` blocks to unconditionally terminate child processes (`taskkill` on Windows) and unlink temporary test databases.

---

## 4. Real-World Application Scenarios (Tier 4)

Tier 4 exercises complete multi-step hotel operational journeys under authentic conditions:

### Scenario 1: Weekend High-Occupancy Surge & Shared Inventory Depletion
- **Context**: 19 flats initially with 4 available units. Friday-to-Sunday weekend dates.
- **Flow**:
  1. Front-desk enters 2 manual direct walk-in reservations for Flat 101 and Flat 102.
  2. Canonical availability engine immediately updates free count to 2.
  3. Incremental ARI push fires to WBP simulator within 10 seconds updating `units: 2` across both "Sem café" and "Com café".
  4. Webhook `/BookingCreate` delivers an OTA reservation (Booking.com) for 1 flat with breakfast.
  5. Fair-share allocation picks Flat 103, suppresses PIX, schedules breakfast and guest welcome.
  6. Incremental ARI pushes `units: 1`.
  7. Second OTA reservation arrives for 1 flat. Allocated to Flat 104.
  8. Incremental ARI pushes `units: 0` (inventory depleted).
  9. Subsequent OTA booking attempt arrives: system detects 0 units, flags conflict, routes to Quarantine with manager alert.

### Scenario 2: Overbooking Collision with Walk-in & Quarantine Triage
- **Context**: Front-desk receptionist is in the middle of typing a walk-in guest on Flat 201 while Booking.com sends a reservation for the exact same flat dates.
- **Flow**:
  1. OTA booking arrives via webhook while Flat 201 has a hold/temporary lock.
  2. Inbound processor evaluates fair-share: all other 18 flats are occupied or blocked.
  3. System identifies overbooking conflict: does **not** corrupt database state.
  4. Booking is safely routed to `quarantineBookings` with status `PENDING_REVIEW` and raw payload preserved.
  5. Critical alert is dispatched to manager via WhatsApp and Email.
  6. Front-desk receptionist sees clear non-blocking warning badge on OTA Inbox.
  7. Front-desk upgrades or moves guest, resolves quarantine item manually, and ARI reconciles.

### Scenario 3: Unscheduled Room Maintenance / Service Order During Active Stay
- **Context**: Flat 301 has an OTA guest arriving tomorrow for 4 nights. An air-conditioning pipe leaks today, triggering an emergency Service Order (OS).
- **Flow**:
  1. Maintenance creates emergency Service Order on Flat 301 for 2 days.
  2. Canonical availability engine recognizes room block on Flat 301 and drops total available units by 1.
  3. Pre-arrival check flags that tomorrow's arriving reservation is assigned to a blocked flat.
  4. System triggers automated re-allocation to an available clean flat (Flat 305).
  5. Housekeeping governance panel updates cleaning priority for Flat 305.
  6. Guest welcome notification and electronic lock PIN are updated for Flat 305.
  7. WBP simulator receives consistent ARI reflecting the maintenance block.

### Scenario 4: Dynamic SEBRAE Pricing Spike with Safety Locks Retaining Publication
- **Context**: Hotel manager updates utility/laundry cost parameters in SEBRAE pricing engine, leading to a calculated daily rate jump from R$ 280 to R$ 420 (>40% increase).
- **Flow**:
  1. Manager runs SEBRAE calculation; new candidate rate is R$ 420.00.
  2. Pricing safety lock module compares candidate against last sent rate (R$ 280.00).
  3. Variation exceeds default 30% threshold: `VARIATION_LOCK` triggers.
  4. System stages change in "Rascunho" (Draft) state; **zero** outbound calls are made to WBP simulator.
  5. Front-desk and manager UI displays "Preço Retido pela Trava" alert.
  6. Manager reviews "Pré-visualização & Publicar" modal and confirms override.
  7. On explicit admin publish action, ARI batch update transmits the approved rate to WBP simulator.

### Scenario 5: Multi-Day Stay Modification & Room Move under High Occupancy
- **Context**: Guest booked Flat 401 via Airbnb for 3 nights. On day 2, guest requests 2-night extension. Flat 401 is booked for another guest on day 4, but Flat 402 is free.
- **Flow**:
  1. Airbnb modification webhook arrives (`IsModification=1`) requesting new check-out date.
  2. Processor compares existing reservation: detects same room is unavailable for full extension.
  3. Fair-share evaluator checks split-stay capability or flags quarantine.
  4. Routed to quarantine with explicit diff: "Extensão de 2 noites requer troca de quarto de 401 para 402".
  5. Reception accepts room move: old reservation updated with audit trail ("antes e depois").
  6. Housekeeping schedule reflects check-out clean for 401 and mid-stay clean for 402.
  7. Incremental ARI synchronizes availability for both flats.

### Scenario 6: Booking Cancellation with Checked-in Guest Exception
- **Context**: Guest booked via Booking.com, completed pre-check-in, and physical check-in occurred at 14:00. At 16:00, OTA sends cancellation webhook.
- **Flow**:
  1. Webhook `/BookingCreate` or `/NotifyBooking` arrives with `IsCancellation=1`.
  2. Processor inspects reservation status: guest is currently `CHECKED_IN`.
  3. System prevents automatic cancellation (protects hotel revenue and physical key).
  4. Cancellation is routed to Quarantine with reason `CANCELLATION_AFTER_CHECKIN`.
  5. Critical WhatsApp alert is dispatched to manager.
  6. Room remains assigned to guest, key lock remains active, and ARI does not falsely release room.

### Scenario 7: Encrypted Credit Card Vault Lifecycle: Storage, Re-Auth, Checkout & Auto-Purge
- **Context**: Reservation arrives with credit card details (`Payments` payload).
- **Flow**:
  1. Raw payload ingested: CVV is immediately detected and permanently stripped (never written to disk).
  2. Card number and expiration are encrypted using AES-256-GCM with environment key `CARD_ENCRYPTION_KEY`.
  3. Database JSON blob and server logs are inspected: zero plaintext card digits or CVVs exist.
  4. Admin attempts to view card: prompted for password re-authentication.
  5. Single-use token generated (valid for 5 minutes). Access is logged in `audit_logs.jsonl`.
  6. Non-admin user attempts access: rejected with HTTP 403.
  7. Time-travel simulator advances clock to 8 days post-checkout.
  8. Auto-purge scheduler executes: card record is permanently scrubbed from encrypted store.

---

## 5. Coverage Thresholds & Calculation

### 5.1 Coverage Rules
- **Tier 1 (Happy Path Isolation)**: Minimum 5 distinct test cases per feature (31 functional features F1–F31).
- **Tier 2 (Boundary & Corner Cases)**: Minimum 5 distinct test cases per feature covering boundaries, zero values, edge formats, and network faults.
- **Tier 3 (Pairwise Interactions)**: Combinatorial coverage of cross-module interfaces.
- **Tier 4 (Real-World Workloads)**: Minimum 5 comprehensive end-to-end hotel operation workflows (7 planned scenarios).

### 5.2 Planned Test Count Matrix
- **Tier 1 Tests**: 31 features × 5 cases = **155 test cases**
- **Tier 2 Tests**: 31 features × 5 cases = **155 test cases**
- **Tier 3 Tests**: Major pairwise combinations = **35 test cases**
- **Tier 4 Tests**: Real-world operational scenarios = **7 test cases**
- **Total Planned Tests**: **352 test cases**

---

## 6. Continuous Verification & Compliance Checklist

- [x] All 33 features from `PROJECT.md` accounted for in inventory.
- [x] Strict adherence to `AGENTS.md`: Targeted execution only, no global batch sweeps.
- [x] `DATABASE_URL` stripped in all test environments.
- [x] Isolated test runner and simulator harness in place.
