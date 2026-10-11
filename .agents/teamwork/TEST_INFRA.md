# E2E Test Infra: Guest-Flow-Manager (CorpFlats)

## Test Philosophy
- Opaque-box, requirement-driven synthetic testing system acting 100% as real users across web browsers and external channels in an isolated local sandbox.
- Zero network leakage: all external calls (WhatsApp, SMTP, PIX, SERPRO, NFS-e) intercepted locally.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Matrix + Human Anti-Frustration Journeys + Heuristic Chaos Navigation.

## Feature Inventory & Test Coverage
| # | Feature | Source (Requirement) | Tier 1 (Smoke/Sanity) | Tier 2 (Boundary/Edge) | Tier 3 (Pairwise/Integration) | Tier 4 (Real-World E2E) |
|---|---------|----------------------|:---------------------:|:----------------------:|:----------------------------:|:-----------------------:|
| 1 | R1 Isolated Sandbox & Mocks | ORIGINAL_REQUEST R1 | ✓ | ✓ | ✓ | ✓ |
| 2 | R2 45 Screens Crawler | ORIGINAL_REQUEST R2 | ✓ (45 screens) | ✓ (3 viewports) | ✓ (5 personas) | ✓ (Zero errors) |
| 3 | R3.1 Zero Amnésia | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 4 | R3.2 Auto-link Minha Conta | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 5 | R3.3 Complete Vehicle Persistence | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 6 | R3.4 Digital Lock Key 14h | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 7 | R3.5 PIX Realtime & Regeneration | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 8 | R3.6 Mobile Upload & Canvas | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 9 | R3.7 Guest 2 Isolation | ORIGINAL_REQUEST R3 | ✓ | ✓ | ✓ | ✓ |
| 10 | R4.1 Compositions & Durations | ORIGINAL_REQUEST R4 | ✓ | ✓ | ✓ | ✓ |
| 11 | R4.2 19 Flats Governance Matrix | ORIGINAL_REQUEST R4 | ✓ | ✓ | ✓ | ✓ |
| 12 | R4.3 Service Orders Lifecycle | ORIGINAL_REQUEST R4 | ✓ | ✓ | ✓ | ✓ |
| 13 | R4.4 Breakfast 22h Cutoff | ORIGINAL_REQUEST R4 | ✓ | ✓ | ✓ | ✓ |
| 14 | R5.1 Chaos Fuzzing & Fast Clicks | ORIGINAL_REQUEST R5 | ✓ | ✓ | ✓ | ✓ |
| 15 | R5.2 Back Button & Usability | ORIGINAL_REQUEST R5 | ✓ | ✓ | ✓ | ✓ |
| 16 | R5.3 Consolidated HTML Report | ORIGINAL_REQUEST AC | ✓ | ✓ | ✓ | ✓ |

## Test Architecture
- **Runner**: Node.js ESM test runner (`node e2e/runner.mjs`) orchestrating Playwright with host Google Chrome (`channel: 'chrome'`).
- **Sandbox**: Express backend running with `PORT=5055`, `DATABASE_FILE=data/database.test.json`, `DATABASE_URL=""`, static files served from `artifacts/limpeza/dist/public`.
- **Mocks**:
  - Z-API WhatsApp mock on port 5056
  - SMTP mock on port 5025
  - SERPRO mock with `SERPRO_MOCK=true`
  - In-process PIX webhook trigger
  - Time-travel simulated offset endpoint `POST /api/test/time-travel`
- **Output Report**: `e2e/reports/index.html` standalone interactive dashboard.
