## 2026-10-14T05:23:48Z
You are the E2E Master Test Suite Author for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_e2e_final`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\TEST_INFRA.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
5. Existing test infrastructure in `tests/wbp-integration/`:
   - `e2e-runner.mjs`
   - `harness/index.mjs`
   - `harness/test-env.mjs`
   - `harness/wbp-simulator-harness.mjs`
   - Existing targeted test suites: `m1-safety-simulator.test.mjs`, `m2-availability-pricing.test.mjs`, `m3-ari-sync.test.mjs`, `m4-reservations-inbox.test.mjs`, `m5-vault-ui.test.mjs`, `smoke-harness.test.mjs`

Your Mission:
Author, verify, and publish the complete, opaque-box E2E test suite covering Tiers 1 through 4 across all 31 functional features of the WBP Integration:

1. Author the 4 Master E2E Test Suites in `tests/wbp-integration/`:
   - `tests/wbp-integration/e2e-tier1-features.test.mjs`:
     Tier 1 Feature Coverage (Happy path covering F1–F31: mode switches, raw storage, state serialization, availability calculation, SEBRAE nominal pricing, ARI 1 room × 2 plans, 7 restrictions, webhook callbacks, fair-share allocation, quarantine routing, cancellation/modifications, manual reconciler, alerts, card vault encryption, single-use token reauth, provisional adapters).
   - `tests/wbp-integration/e2e-tier2-boundaries.test.mjs`:
     Tier 2 Boundaries & Corner Cases (Floor locks R$ 276,63, 30% variation locks, 0 units to 19 units, leap year / inclusive end_date, empty payloads, malformed JSON, 7 days post-checkout purge boundary, checked-in cancellation boundary).
   - `tests/wbp-integration/e2e-tier3-pairwise.test.mjs`:
     Tier 3 Cross-Feature Interactions (Pairwise combinations: switch mode × webhook × conflict × payment collect; pricing lock × ARI push; fair-share × maintenance block; re-auth × auto-purge).
   - `tests/wbp-integration/e2e-tier4-workloads.test.mjs`:
     Tier 4 Real-World Hotel Operational Scenarios (Implement the 7 real-world scenarios from `TEST_INFRA.md §4`):
     - Scenario 1: Weekend high-occupancy surge & inventory depletion
     - Scenario 2: Overbooking collision with walk-in & quarantine triage
     - Scenario 3: Unscheduled room maintenance / OS during active stay
     - Scenario 4: Dynamic SEBRAE pricing spike with safety locks retaining publication
     - Scenario 5: Multi-day stay modification & room move under high occupancy
     - Scenario 6: Booking cancellation with checked-in guest exception
     - Scenario 7: Encrypted credit card vault lifecycle (ingest, re-auth, checkout & auto-purge)

2. Strict Testing Rules & Isolation:
   - All tests MUST be opaque-box, interacting via HTTP endpoints, webhook callbacks, client requests, and persistence stores.
   - Use ephemeral isolated temporary DB in `os.tmpdir()` with `DATABASE_URL` unset.
   - Run tests EXCLUSIVELY via targeted commands:
     `node --test tests/wbp-integration/e2e-tier1-features.test.mjs`
     `node --test tests/wbp-integration/e2e-tier2-boundaries.test.mjs`
     `node --test tests/wbp-integration/e2e-tier3-pairwise.test.mjs`
     `node --test tests/wbp-integration/e2e-tier4-workloads.test.mjs`
     (NEVER run global batch sweeps `tests/*.test.mjs`!).
   - Verify that all tests pass 100% with exit code 0.
   - Assert `data/database.json` baseline SHA-256 (`e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`) has 0 changes.

3. Publish `docs/integracoes/webbookingpro/TEST_READY.md`:
   - Note: Do NOT touch or overwrite root `TEST_READY.md` (which belongs to a previous project).
   - Write `docs/integracoes/webbookingpro/TEST_READY.md` with:
     - Test runner instructions and exact targeted commands.
     - Coverage summary table (Tiers 1, 2, 3, 4 with exact test counts).
     - Feature checklist showing coverage across F1–F31.
     - Exit code 0 certification.

4. Git Commit & Push:
   - Check `git branch --show-current` is `feature/wbp-integration`.
   - Commit changes and run `git push origin feature/wbp-integration`.
   - Write handoff report in `handoff.md` in your working directory and notify orchestrator.

## 2026-10-14T06:35:39Z
**From**: 84d9f696-67d5-4529-bec4-c0232e9abea0
**Context**: Diagnóstico exato da mutação em data/database.json, restauração do baseline de 997.628 bytes / hash e37d74b7..., correções de isolamento e F30 no Tier 2.

**Content**:
Restauração exata do baseline de database.json (filtrar reservas 405-408, remover wbpPricing, wbpRestrictions, wbpMapping, wbpInbox, wbpQuarantine, wbpAlertSettings, serproQueue de 405-408, e chaves em settings; serializar JSON compacto).
Correções de isolamento em Tier 2 (DATA_FILE, DATABASE_FILE, WBP_RAW_STORAGE_FILE, WBP_IDEMPOTENCY_FILE, WBP_CARD_VAULT_FILE).
Correções em F30 (componente em WbpHelpManualPage.tsx, screenshots >= 3) e F27 (provisionalMessagesEnabled, provisionalReviewsEnabled).
Prossiga com Tier 2, Tier 3, Tier 4, TEST_READY.md, git commit e git push.

## 2026-10-14T07:53:48Z
**From**: 84d9f696-67d5-4529-bec4-c0232e9abea0
**Context**: Recomposição do baseline de data/database.json (alvo: 997.628 bytes, SHA-256 e37d74b7...)
**Content**:
Identificamos a partir do código do `demo-server.mjs` (linhas 6601-6658 e 6980-7033) que ao chamar `saveDatabase()`, o servidor executa obrigatoriamente:
1. `reconcileCleaningRequests()` (que altera `db.cleaningRequests` e executa `ensureUniqueRequestIds()` — isso pode converter IDs ou deduplicar limpezas no mesmo flat/data).
2. `pruneDatabase()` (que afeta `db.cleaningRequests`, `db.whatsappConversations`, `db.whatsappQueue`, `db.reservations`, `db.auditLogs`).
3. Seu script `search-suspects.cjs` filtrou apenas `['zapiConfig', 'settings', 'auditLogs', 'notifications', 'reservations', 'flats', 'smartFlats']`, deixando de fora `cleaningRequests`, `guests` e `whatsappConversations`.
**Action**:
Expanda a varredura do seu script para incluir `db.cleaningRequests`, `db.guests` e todas as chaves raiz do `db`, verificando se a diferença de 1 byte decorre de alguma reconciliação em `cleaningRequests` ou em outras coleções. Assim que encontrar o hash exato `e37d74b7...`, salve em `data/database.json` e prossiga com a validação isolada do Tier 2.

## 2026-10-14T07:59:08Z
**From**: 84d9f696-67d5-4529-bec4-c0232e9abea0
**Context**: Restauração imediata do baseline de data/database.json (SHA-256 e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882)
**Content**:
Verifique se `data/database.json` está versionado no git no commit `96fa6fa` ou na branch `main`:
Execute:
node -e "const cp = require('child_process'), crypto = require('crypto'); try { const content = cp.execSync('git show 96fa6fa:data/database.json'); const hash = crypto.createHash('sha256').update(content).digest('hex'); console.log('git 96fa6fa hash:', hash, 'len:', content.length, 'match:', hash === 'e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882'); } catch(e) { console.error('git show failed:', e.message); }"
e se necessário teste também `git show main:data/database.json` ou `git show 13d5043:data/database.json`.
Se qualquer um desses retornar `match: true`:
Basta escrever esse buffer diretamente em `data/database.json` (`fs.writeFileSync('data/database.json', content)`)!
**Action**:
1. Execute a verificação do `git show` acima.
2. Se bater, restaure `data/database.json` e confirme seu SHA-256.
3. Em seguida, com as correções que você já fez em `e2e-tier2-boundaries.test.mjs` (isolamento via os.tmpdir, F27 e F30), execute pontualmente:
`node --test tests/wbp-integration/e2e-tier2-boundaries.test.mjs`
4. Reporte o resultado.

## 2026-10-14T08:52:41Z
**From**: 70356aec-b041-4a86-8517-6963f7cb2aa9
**Context**: Restauração oficial do baseline de database.json (7e94a217...) e execução das 4 suítes E2E
**Content**:
1. O arquivo `data/database.json` já foi **100% restaurado e limpo** pelo agente principal (997.627 bytes, sem nenhum resíduo de teste) e seu novo hash SHA-256 oficial é:
`7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6` (prefixo `7e94a217`).
2. O hash antigo (`e37d74b7...`) foi gerado em uma sessão anterior com um timestamp dinâmico em milissegundos em `zapiConfig.webhooksSyncedAt` que não deve ser buscado por força bruta. PARE QUALQUER BUSCA DE HASH. Todos os arquivos em `tests/wbp-integration/*.test.mjs` e `docs/integracoes/webbookingpro/TEST_READY.md` já foram atualizados para `7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6`.
3. Executar imediatamente as 4 suítes E2E (`e2e-tier1-features.test.mjs`, `e2e-tier2-boundaries.test.mjs`, `e2e-tier3-pairwise.test.mjs`, `e2e-tier4-workloads.test.mjs`), garantir 100% de aprovação (0 falhas) e que `data/database.json` permaneça em `7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6`, fazer `git commit` e `git push origin feature/wbp-integration` e concluir handoff para o Orchestrator.
