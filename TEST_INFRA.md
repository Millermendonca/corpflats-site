# E2E Test Infra: CorpFlats Reservation Modification Flow

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Simulation & Availability Check (/modify-preview) | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 2 | Hold & Pending Conflict Prevention | ORIGINAL_REQUEST R1, R2 | 5 | 5 | ✓ |
| 3 | Payment Settlement Before Date Commit | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 4 | Audit Trail & Payment Recording | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 5 | Mandatory Re-Signature Invalidation | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |
| 6 | Automated Re-Signature Communication | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |
| 7 | Document Generation & Reception Email Delivery | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |
| 8 | Reception & Garage Panel Synchronization | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ |
| 9 | Guest Portal Multi-Step UI & Re-Sign Banner | ORIGINAL_REQUEST R1, R2, R3 | 5 | 5 | ✓ |
| 10 | Schedulers & Daily Routines Synchronization | ORIGINAL_REQUEST R4 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: `node --test tests/reservation-modification-flow.test.mjs`
- Test case format: ESM `.test.mjs` with native `node:test` and `node:assert`.
- Directory layout: `tests/`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Extension with additional payment via PIX, payment completed, dates committed, re-signature triggered, document re-signed & sent to reception | F1, F2, F3, F4, F5, F6, F7, F8, F10 | High |
| 2 | Extension attempted with calendar conflict on same flat: simulation returns conflict error and blocks checkout | F1, F2 | Medium |
| 3 | Modification abandoned / canceled during PIX payment hold: original dates remain intact, hold expires, flat remains available | F2, F3, F4 | Medium |
| 4 | Shortening stay within 24h refund policy or no-cost date change: immediate commit, re-signature triggered, panels synced | F1, F4, F5, F6, F8 | Medium |
| 5 | Flat change: old flat freed, new flat assigned, check-in signature invalidated, reception blocks physical entry until re-signed | F5, F7, F8 | High |

## Coverage Thresholds
- Tier 1: >= 5 per feature
- Tier 2: >= 5 per feature (where boundaries exist)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: >= 5 realistic application scenarios
