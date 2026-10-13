# BRIEFING — 2026-10-13T22:38:00Z

## Mission
Orquestrar a integração do PMS Guest-Flow-Manager com o channel manager WebBookingPro e reestruturar o módulo de precificação SEBRAE com segurança operacional estrita e sem interferência na operação hoteleira.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1
- Original parent: parent
- Original parent conversation ID: 2588b79e-8f82-479c-ac3d-60f14235136b

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md
1. **Decompose**: Survey concluído. PROJECT.md isolado em `docs/integracoes/webbookingpro/PROJECT.md` com 33 features, 5 marcos e trilha E2E paralela.
2. **Dispatch & Execute**:
   - Trilha de Implementação: Marco M1 (Segurança Operacional, Armazenamento & Simulador WBP).
   - Trilha de Testes E2E: TEST_INFRA.md criado e verificado em `docs/integracoes/webbookingpro/TEST_INFRA.md` com harness e runner direcionados.
   - Portão estrito de qualidade (Build, 2 Reviewers, 2 Challengers, Forensic Auditor veto).
3. **On failure**:
   - Retry -> Replace -> Skip -> Redistribute -> Redesign -> Escalate.
4. **Succession**: Ao atingir 16 spawns, gerar soft handoff e invocar sucessor.
- **Work items**:
  1. Survey & Map Scope [done]
  2. Project Architecture & Milestone Decomposition [done]
  3. Milestone 1 (Safety, Storage & Simulator) [in-progress]
  4. E2E Testing Infrastructure (TEST_INFRA.md) [done]
  5. Milestone 2 (Availability & Pricing) [pending]
  6. Milestone 3 (ARI Synchronizer) [pending]
  7. Milestone 4 (Reservations, Quarantine & Alerts) [pending]
  8. Milestone 5 (Card Vault, Provisional & UI) [pending]
  9. Final Acceptance & Adversarial Hardening [pending]
- **Current phase**: 1 (Implementation M1)
- **Current focus**: Finalização de M1 por worker_m1 e preparação do portão de validação

## 🔒 Key Constraints
- NUNCA editar ou criar código-fonte diretamente (DISPATCH-ONLY).
- NUNCA executar comandos de build ou testes diretamente — exigir de workers.
- NUNCA fazer investigações técnicas de código diretamente — despachar Explorers/Spec Miners.
- Manter paridade byte-a-byte idêntica (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` e qualquer serviço duplicado.
- Executar EXCLUSIVAMENTE testes pontuais específicos da integração criados neste projeto; NUNCA executar suítes completas ou testes em lote.
- Ao alterar `artifacts/limpeza/src`, rodar build e commitar `artifacts/limpeza/dist/`.
- Realizar `git push` a cada `git commit` na branch ativa (`feature/wbp-integration`).
- Nunca fazer merge ou push na `main`. Confirmar `git branch --show-current` antes de cada commit.
- Preservar as 11 linhas não commitadas de `artifacts/api-server/audit_logs.jsonl`.
- Documentação deste projeto isolada em `docs/integracoes/webbookingpro/` para não sobrescrever projetos anteriores na raiz.
- Veto binário inegociável do Forensic Auditor em caso de violação de integridade.

## Current Parent
- Conversation ID: 2588b79e-8f82-479c-ac3d-60f14235136b
- Updated: 2026-10-13T22:21:52Z

## Key Decisions Made
- `TEST_INFRA.md` e harness de teste inicializados com sucesso em `docs/integracoes/webbookingpro/TEST_INFRA.md`.
- `worker_m1` em fase de verificação de paridade e testes pontuais.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| spec_miner_wbp | teamwork_preview_spec_miner | Survey WBP API Specification & Simulator | completed | b896c7d6-db9b-428a-8d84-72f643e07086 |
| explorer_codebase | teamwork_preview_explorer | Survey Codebase Architecture & Integration Points | completed | fdfa933b-6ab6-4fad-b8b1-bb07bd532a4c |
| spec_miner_sebrae | teamwork_preview_spec_miner | Survey SEBRAE Pricing Model, Math & Mockups | completed | 2632ba33-6ff2-4972-8f53-f5a0d3118375 |
| worker_m1 | teamwork_preview_worker | Implementation M1: Safety, Storage & Simulator | in-progress | b94edc66-61d1-4995-a185-04952d1b3d63 |
| test_writer_e2e | teamwork_preview_test_writer | E2E Testing Track: TEST_INFRA.md & Test Framework | completed | dea1a923-58ab-4b02-926c-4fa622bd546a |

## Succession Status
- Succession required: no
- Spawn count: 5 / 16
- Pending subagents: b94edc66-61d1-4995-a185-04952d1b3d63
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 84d9f696-67d5-4529-bec4-c0232e9abea0/task-10
- Safety timer: none

## Artifact Index
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md — Authoritative User Request
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md — WBP Architecture & Milestones
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\TEST_INFRA.md — E2E Master Test Infrastructure
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md — Dispatch log
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\progress.md — Liveness & status tracking
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_wbp\handoff.md — WBP API Handoff
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_codebase\handoff.md — Codebase Architecture Handoff
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_sebrae\handoff.md — SEBRAE Pricing Handoff
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\test_writer_e2e\handoff.md — E2E Test Suite Handoff
