# Project: CorpFlats Guest-Flow-Manager E2E Synthetic Testing System

## Architecture
- **Target Application**: CorpFlats / Guest-Flow-Manager
  - Frontend: React 18 + Vite + TypeScript in `artifacts/limpeza/` (built to `artifacts/limpeza/dist/public`)
  - Backend: Node.js Express in `artifacts/api-server/demo-server.mjs` (mirror in `scripts/demo-server.mjs`)
  - Database: JSON database loaded via `DATABASE_FILE` (isolated to `data/database.test.json`)
- **E2E Test Architecture (`e2e/`)**:
  - `e2e/sandbox/`: Isolated test server lifecycle manager, seed data generator, external mock servers (Z-API WhatsApp emulator on port 5056, SMTP Nodemailer interceptor on port 5025, PIX webhook trigger, SERPRO mock, Time-Travel hook).
  - `e2e/fixtures/`: Playwright fixtures for deterministic persona authentication (`gfm_session_v2` for Admin, Reception, Maid, Guest, Service Worker), viewports (Mobile 375px, Tablet 768px, Desktop 1920px), and console/network error listeners.
  - `e2e/suites/`:
    - `crawler-45-screens.spec.mjs`: Universal screen crawler verifying 100% of the 45 screens across 3 viewports and all personas.
    - `human-journeys.spec.mjs`: Complete end-to-end anti-frustration journeys (Zero Amnésia, Multichannel Auto-link, Vehicle details persistence, Digital lock 14h access, Real-time PIX & QR regeneration, Mobile upload & canvas signature, Guest 2 isolation).
    - `pairwise-matrix.spec.mjs`: Combinatorial testing (guest compositions, durations, all 19 flats x 7 governance states, service orders lifecycle with token & photos, breakfast rules & 22h cutoff).
    - `chaos-explorer.spec.mjs`: Heuristic Gemini Chaos Explorer (rapid double clicks, special chars/fuzzing, browser Back navigation, usability audit).
  - `e2e/reporters/`: Consolidated HTML report generator generating `e2e/reports/index.html` with metrics, success rate by module, and links to failure screenshots/videos.
  - `e2e/runner.mjs`: Autonomous orchestrator script managing seed, mock servers, isolated backend process, Playwright execution, report generation, and clean shutdown.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 Isolated DB & Backend Runner | Launch isolated API on port 5055 using `data/database.test.json` without modifying production DB | M1 | ORIGINAL_REQUEST R1 |
| 2 | R1.2 WhatsApp / Z-API Emulator | Local mock capturing outbound messages and simulating inbound webhooks | M1 | ORIGINAL_REQUEST R1 |
| 3 | R1.3 SMTP Interceptor | In-memory SMTP interceptor capturing all emails | M1 | ORIGINAL_REQUEST R1 |
| 4 | R1.4 PIX Payment Simulator | Webhook trigger simulating instant PIX confirmation, expiration and QR renewal | M1 | ORIGINAL_REQUEST R1 |
| 5 | R1.5 SERPRO & NFS-e Mocks | Mock provider for FNRH gov.br and municipal tax invoice | M1 | ORIGINAL_REQUEST R1 |
| 6 | R1.6 Time-Travel Mechanism | Simulated clock mechanism to test 18:00 shift change, 22:00 breakfast cutoff, and 14:00 check-in | M1 | ORIGINAL_REQUEST R1 |
| 7 | R2.1 Universal 45 Screens Crawler | Multi-profile automated crawler systematically visiting all 45 mapped screens | M2 | ORIGINAL_REQUEST R2 |
| 8 | R2.2 Responsive Viewport Matrix | Testing at Mobile 375px, Tablet 768px, Desktop 1920px with zero white screen | M2 | ORIGINAL_REQUEST R2 |
| 9 | R2.3 Console & Network Error Guard | Fail on unhandled `console.error`, `window.onerror`, or unexpected 4xx/5xx API responses | M2 | ORIGINAL_REQUEST R2 |
| 10 | R2.4 Essential Element Validation | Verify presence of buttons, tables, modals, and tabs per screen | M2 | ORIGINAL_REQUEST R2 |
| 11 | R3.1 Zero Amnésia Journey | Returning guest reuses previous documents/photos without re-uploading | M3 | ORIGINAL_REQUEST R3 |
| 12 | R3.2 Multichannel Auto-link | PMS / WhatsApp reservation automatically linked to guest account in `/minha-conta` | M3 | ORIGINAL_REQUEST R3 |
| 13 | R3.3 Complete Vehicle Persistence | Plate, brand, model, color persisted and propagated to reception, garage, and emails | M3 | ORIGINAL_REQUEST R3 |
| 14 | R3.4 Digital Lock Key Timing | Access code hidden before 14:00 with friendly cleaning notice; prominent after check-in | M3 | ORIGINAL_REQUEST R3 |
| 15 | R3.5 PIX Real-time & Regeneration | Real-time screen update on payment and QR code regeneration on expiry | M3 | ORIGINAL_REQUEST R3 |
| 16 | R3.6 Mobile Upload & Canvas Signature | Browser image compression and non-scrolling touch canvas signature | M3 | ORIGINAL_REQUEST R3 |
| 17 | R3.7 Companion Isolation | Guest 2 submission never overwrites Guest 1 data | M3 | ORIGINAL_REQUEST R3 |
| 18 | R4.1 Reservation Compositions & Durations | Pairwise testing of solo, couples, families with kids, 1 day, weekend, >15 days | M4 | ORIGINAL_REQUEST R4 |
| 19 | R4.2 19 Flats Governance Matrix | Audit all 19 flats across all 7 governance states | M4 | ORIGINAL_REQUEST R4 |
| 20 | R4.3 Service Orders Full Lifecycle | Admin creation, external token portal, photo uploads, completion with verification | M4 | ORIGINAL_REQUEST R4 |
| 21 | R4.4 Breakfast Rules & 22h Cutoff | Orders inside window, post-22h cutoff rejection, custom dietary restrictions | M4 | ORIGINAL_REQUEST R4 |
| 22 | R5.1 Gemini Chaos Explorer | Rapid double-clicks, special characters / fuzzing, out-of-order Back navigation | M5 | ORIGINAL_REQUEST R5 |
| 23 | R5.2 Qualitative Usability Audit | Automated detection of truncated texts, bad alignments, usability quirks | M5 | ORIGINAL_REQUEST R5 |
| 24 | R5.3 Consolidated HTML Report | Generate `e2e/reports/index.html` with pass rates and indexed failure photos/videos | M5 | ORIGINAL_REQUEST Acceptance |
| 25 | R6 Full E2E Execution & Verification | Run entire test suite, 100% pass, forensic integrity check, git commit & push | M6 | ORIGINAL_REQUEST Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Sandbox Local Isolado & Interceptadores | R1.1, R1.2, R1.3, R1.4, R1.5, R1.6 (`e2e/sandbox/`, test server runner, mock servers, time-travel endpoint/helpers) | none | DONE |
| M2 | Varredura Universal 45 Telas & Sanidade | R2.1, R2.2, R2.3, R2.4 (`e2e/suites/crawler-45-screens.spec.mjs`, fixtures, multi-viewport, multi-persona) | M1 | DONE |
| M3 | Jornadas Humanas & Anti-Frustração | R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7 (`e2e/suites/human-journeys.spec.mjs`) | M1 | DONE |
| M4 | Matriz Combinatória de Estados Pairwise | R4.1, R4.2, R4.3, R4.4 (`e2e/suites/pairwise-matrix.spec.mjs`) | M1 | DONE |
| M5 | Chaos Explorer & Relatório HTML | R5.1, R5.2, R5.3 (`e2e/suites/chaos-explorer.spec.mjs`, `e2e/reporters/html-report-generator.mjs`) | M1, M2 | DONE |
| M6 | Execução Integral, Auditoria & Deploy | Executar suíte completa via `e2e/runner.mjs`, validar 100% de aprovação, auditoria forense, git commit & push | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts
### Test Runner ↔ Isolated Sandbox (`e2e/sandbox/`)
- `startSandbox({ port: number, dbPath: string })`: Promise<{ stop: () => Promise<void>, baseUrl: string, timeTravel: (offsetMs: number) => Promise<void>, pixWebhook: (txid: string, amount: number) => Promise<void> }>
- Database: `data/database.test.json` seeded from `data/database.json` with reset capability.
- Test Port: 5055 (HTTP)
- WhatsApp Mock Port: 5056 (HTTP)
- SMTP Mock Port: 5025 (SMTP / in-memory buffer)

### E2E Test Suites ↔ Playwright Config
- Runner: Playwright using host Chrome (`channel: 'chrome'`)
- Viewports:
  - Desktop: `1920x1080`
  - Tablet: `768x1024`
  - Mobile: `375x812` (hasTouch: true, isMobile: true)
- Auth State: Injected session cookie `gfm_session_v2` = base64 `{ v: 2, id: <userId> }`
  - Admin: `id: 1`
  - Reception: `id: 1` or reception role
  - Maid: `id: 2` (Cris)
  - Public / Guest / Worker: No session cookie (token in URL or public session)

### Test Suites ↔ HTML Reporter
- Output location: `e2e/reports/index.html`
- Artifacts: `e2e/reports/screenshots/` and `e2e/reports/videos/` for any failure
- Metadata: Module breakdown, test duration, error stacks, usability audit findings.

## Code Layout
- `e2e/` (dedicated directory for the entire test ecosystem):
  - `e2e/sandbox/`: `test-server.mjs`, `mock-zapi.mjs`, `mock-smtp.mjs`, `time-travel.mjs`, `db-seeder.mjs`
  - `e2e/fixtures/`: `auth-fixtures.mjs`, `viewport-fixtures.mjs`, `error-guard.mjs`
  - `e2e/suites/`:
    - `01-crawler-45-screens.spec.mjs`
    - `02-human-journeys.spec.mjs`
    - `03-pairwise-matrix.spec.mjs`
    - `04-chaos-explorer.spec.mjs`
  - `e2e/reporters/`: `html-reporter.mjs`
  - `e2e/playwright.config.mjs`
  - `e2e/runner.mjs`
  - `e2e/package.json` (or scripts integrated in root package.json)
