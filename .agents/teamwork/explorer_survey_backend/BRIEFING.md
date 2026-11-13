# BRIEFING — 2026-10-22T10:11:00Z

## Mission
Levantamento detalhado da arquitetura backend e pontos de integração para o Sistema de Gestão de Funcionários CLT.

## 🔒 My Identity
- Archetype: explorer
- Roles: [explorer, backend_analyst, synthesis]
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend
- Original parent: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- Milestone: survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or alter source code.
- Write only to exclusive working directory: .agents/teamwork/explorer_survey_backend.
- NUNCA executar testes globais, varreduras ou em lote.
- Send messages to parent agent (58ecb31f-60d2-4e1e-9aac-82400a58c263) upon completion or critical updates.

## Current Parent
- Conversation ID: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- Updated: 2026-10-22T10:11:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` (linhas 1-200, 5108-5180, 6450-6750, 8580-9210, 45310-45360, 46600-49800)
  - `scripts/demo-server.mjs` (comparação de paridade e histórico de commits)
  - `artifacts/api-server/wbp/` e `scripts/wbp/` (arquitetura modular de referência)
  - `artifacts/api-server/zapi-service.mjs` (linhas 3695-3730 — `sendZapiMessage`)
  - `artifacts/api-server/storage-service.mjs` (linhas 90-140 — `uploadImageToStorage`)
  - `artifacts/limpeza/src/lib/permissions.ts` (linhas 1-150 — controle granular RBAC)
  - `tests/auth-roles-permissions.test.mjs` (padrão de testes isolados com `node --test`)
- **Key findings**:
  1. O backend opera com base em estado em memória (`db`) sincronizado via debounce (300ms disco atômico, 800ms Postgres `system_store` blob com snapshots em `system_store_backups`).
  2. Existe divergência atual de hash SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` gerada pelo commit `a7d4f78` que precisa ser corrigida na implementação sincronizando `artifacts` para `scripts`.
  3. Cris (id: 2) e Grazi (id: 3) são diaristas cadastradas em `db.users` com `role: "camareira"`, tratadas por faxina (`cleaningRequests`) com extrato em `maidStatementEntries` e pagamentos em `maidPayments`. Devem ser isoladas 100% de qualquer rotina CLT.
  4. O padrão arquitetural recomendado é criar submódulos dedicados em `artifacts/api-server/hr/` (espelhado em `scripts/hr/`), expondo `createHrRouter` montado em `/api/hr` no `demo-server.mjs`.
  5. Mapeado conjunto completo de 26 endpoints REST cobrindo Funcionários, Ponto com Selfie/GPS/Whitelist, Escalas 6x1, Férias, Travas de Conformidade em 3 Níveis, Folha de Pagamento, Contratos e ASO.
- **Unexplored areas**: Nenhuma pendência na pesquisa backend.

## Key Decisions Made
- Estruturação modular em 8 arquivos em `artifacts/api-server/hr/` espelhados em `scripts/hr/`.
- Isolamento estrito de Cris e Grazi com guardas explícitas por ID e tipo de contrato.

## Artifact Index
- DISPATCH.md — Registro do despacho recebido
- BRIEFING.md — Memória de trabalho persistente
- progress.md — Heartbeat de execução
- handoff.md — Relatório final estruturado de levantamento backend
