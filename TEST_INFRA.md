# E2E Test Infra: Guest-Flow-Manager Governance & Integrity Overhaul

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md` and user specifications.
- Comprehensive 4-tier methodology: Feature Isolation (Tier 1), Boundary & Corner Cases (Tier 2), Cross-Feature Combinations (Tier 3), and Real-World Application Scenarios (Tier 4).
- Deterministic verification using Node.js test runner (`node --test`) and automated assertions.

## Feature Inventory & Test Coverage Goals
| # | Feature | Source | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 | Tier 4 |
|---|---------|--------|:--------------:|:--------------:|:------:|:------:|
| 1 | R1: Clean-to-dirty loop immunity | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | R1: Dual-server sync & note non-pollution | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | R2: 18:00 Date Switchover UI mode & toggle | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 4 | R2: FlatCard semantics & occupancy precedence | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | R3: Flat 313 phantom cleaning eradication | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 6 | R3: Flat 511 maid schedule & statement cleanup | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 7 | R4: Flat 512 / 712 reservation allocation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 8 | R4: Universal 19-flat database audit & consistency | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Node.js native test runner (`node --test tests/*.test.mjs`)
- Test Scripts:
  - `tests/governance-integrity.test.mjs`: Automated integration test covering R1-R4
  - `scratch/test_dates.mjs`: Housekeeping request date evaluation harness
- Acceptance Semantics: Exit code 0, 100% assertions passing, 0 unhandled rejections.
