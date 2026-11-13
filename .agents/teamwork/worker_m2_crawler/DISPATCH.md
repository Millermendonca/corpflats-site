# Worker Dispatch: Milestone 2 - Varredura Universal de Telas & Sanidade (R2 - 100% das 45 Telas)

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\PROJECT.md`.
Read Explorer reports:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_routes\handoff.md` (Contains exact 45 screens inventory)
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_e2e_infra\handoff.md`
Read Worker M1 handoff:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md`

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Owned Files
Implement Playwright configuration, fixtures, and the Universal 45 Screens Crawler test suite:
1. `e2e/playwright.config.mjs`:
   - Set up Playwright test configuration targeting `http://127.0.0.1:5055`.
   - Use host Chrome (`channel: 'chrome'`) or Edge (`channel: 'msedge'`) available at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
   - Configure projects for Desktop (1920x1080), Tablet (768x1024), and Mobile (375x812, isMobile: true, hasTouch: true).
   - Configure screenshot and video retention on failure.
2. `e2e/fixtures/auth-fixtures.mjs`:
   - Cookie injector for session `gfm_session_v2` = base64 `{ v: 2, id: <userId> }`:
     - Admin (`id: 1`)
     - Camareira (`id: 2`, Cris)
     - Portaria / Recepção (admin or user with role)
     - Public / Guest / Service Worker (no session cookie or token-based)
3. `e2e/fixtures/error-guard.mjs`:
   - Console error monitor: captures `page.on('console', msg => ...)` and `page.on('pageerror', err => ...)`.
   - Network monitor: verifies no unexpected 4xx/5xx status on internal `/api/` calls.
   - White screen guard: verifies `#root` has rendered visible child DOM elements.
4. `e2e/suites/01-crawler-45-screens.spec.mjs`:
   - Systematically visits all 45 mapped functional screens across all personas:
     - 26 Admin screens
     - 2 Portaria / Recepção screens
     - 7 Camareira / Staff screens
     - 7 Hóspede / Public screens
     - 1 Service Worker public screen
     - Fallback / 404 screen
   - Tests across Mobile 375px, Tablet 768px, Desktop 1920px.
   - Verifies essential elements per screen (headers, buttons, forms, tables, tabs).
   - Validates zero white screen, zero unhandled console.error, zero unexpected 4xx/5xx API errors.
5. Verification:
   - Run the crawler suite against the isolated sandbox server (`e2e/sandbox/test-server.mjs`).
   - If Playwright package `@playwright/test` is needed, install or run using `pnpm.cmd` / `npm.cmd` or native Node script runner wrapping Playwright API.

## Output
Execute the suite, ensure tests pass cleanly, and document all findings and results in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler\handoff.md`.


## 2026-10-11T01:06:40Z
Você é o Worker M2 (Varredura Universal de Telas & Sanidade - R2 - 100% das 45 Telas).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler
Leia com atenção o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler\DISPATCH.md e o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implemente a infraestrutura do Playwright (playwright.config.mjs, fixtures e e2e/suites/01-crawler-45-screens.spec.mjs) cobrindo rigorosamente 100% das 45 telas em Mobile 375px, Tablet 768px e Desktop 1920px, com guardas de zero tela branca, zero console.error e zero 4xx/5xx indevidos.
Execute os testes contra o sandbox na porta 5055 e documente os resultados em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler\handoff.md.
