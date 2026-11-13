## 2026-10-13T22:20:02Z
From: 84d9f696-67d5-4529-bec4-c0232e9abea0 (parent / orchestrator)
Content:
You are the E2E Test Suite Architect for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_e2e`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`

Your Mission:
Design and initialize the comprehensive E2E Testing Track for the project, strictly derived from user requirements and specifications (opaque-box, requirement-driven, independent of implementation internals).

Tasks:
1. Create `TEST_INFRA.md` at the project root (`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\TEST_INFRA.md`) adhering to the standard template:
   - Test Philosophy: Opaque-box, requirement-driven, category-partition + BVA + pairwise + workload testing.
   - Feature Inventory: All 33 features from `PROJECT.md` mapped to Tiers 1-4.
   - Test Architecture: runner location, invocation command, pass/fail semantics, directory layout.
   - Real-World Application Scenarios (Tier 4): realistic hotel operation scenarios (weekend surge, high occupancy, overbooking attempts, room maintenance during stay, etc.).
   - Coverage Thresholds:
     - Tier 1: >=5 test cases per feature (happy path isolation).
     - Tier 2: >=5 test cases per feature (boundary and corner cases).
     - Tier 3: pairwise coverage of major feature interactions.
     - Tier 4: >=5 realistic application-level workload scenarios.
     - Total planned tests calculated based on feature count.
2. Build the foundational E2E test harness and runner in `tests/wbp-integration/e2e-runner.mjs` and `tests/wbp-integration/harness/` that:
   - Runs isolated test environments (`NODE_ENV=test`, exclusive ports, `DATABASE_URL` removed, temp database copy).
   - Integrates with the local WBP simulator.
   - Adheres strictly to project rules: ONLY runs targeted integration test files, never global sweeps.
3. Write your findings to `analysis.md` and complete handoff to `handoff.md` in your working directory. Send a completion message to orchestrator.

## 2026-10-13T22:23:13Z
From: 84d9f696-67d5-4529-bec4-c0232e9abea0 (parent / orchestrator)
Content:
**Context**: E2E Test Suite Architecture - Localização de Documentação.
**Content**: ATENÇÃO: Diretriz mandatória do usuário para NÃO sobrescrever a documentação de projetos anteriores na raiz (`TEST_INFRA.md` e `TEST_READY.md` do projeto "Reservation Modification Flow"):
1. Você DEVE salvar o arquivo de infraestrutura de testes deste projeto em: `docs/integracoes/webbookingpro/TEST_INFRA.md`.
2. O arquivo de sinalização de testes prontos (`TEST_READY.md`) quando concluído também deve ficar em: `docs/integracoes/webbookingpro/TEST_READY.md`.
3. NUNCA sobrescreva arquivos na raiz do repositório.
4. Confirme que está na branch `feature/wbp-integration`.
**Action**: Ajuste seus caminhos de saída para `docs/integracoes/webbookingpro/TEST_INFRA.md`.
