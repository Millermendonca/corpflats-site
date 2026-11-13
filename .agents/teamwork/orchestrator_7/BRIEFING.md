# BRIEFING — 2026-10-12T00:01:15Z

## Mission
Desenvolver e integrar o Modo Desenvolvedor & Treinamento Inteligente no WhatsApp para o CorpFlats com reconhecimento duplo (hóspede vs treinador), calibração de tom/persona não-literal, retificação de mensagens e gestão administrativa.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_7
- Original parent: Sentinel / Parent Agent
- Original parent conversation ID: 0e26104e-f9d0-4cf4-a9ad-dc9cd77f6959

## 🔒 My Workflow
- **Pattern**: Project Orchestration Pattern
- **Scope document**: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
1. **Decompose**:
   - M1: Backend Core & AI Coaching Engine [DONE]
   - M2: Frontend Web Chat & Automation UI [DONE]
   - M3: Gate, Parity Verification, Build de Produção & Git Push [IN_PROGRESS]
2. **Dispatch & Execute**:
   - Direct iteration loop: Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate
3. **On failure**:
   - Retry -> Replace -> Skip (non-critical) -> Redistribute -> Redesign
4. **Succession**:
   - At 16 spawns, write handoff.md, spawn successor
- **Work items**:
  1. Survey & Architecture mapping [done]
  2. M1 Backend Core & AI Coaching Engine [done]
  3. M2 Frontend Web Chat & Automation UI [done]
  4. M3 Gate, Parity Verification & Git Push [in-progress]
- **Current phase**: Milestone 3 Gate Verification
- **Current focus**: Reviewers, Challengers, and Forensic Auditor evaluation

## 🔒 Key Constraints
- NUNCA executar testes globais ou em lote (PROIBIDO rodar `tests/*.test.mjs`).
- Executar EXCLUSIVAMENTE o teste estritamente pontual `tests/developer-ai-coaching.test.mjs`.
- Twin-Server Parity Mandate: 100% SHA-256 match between `scripts/` and `artifacts/api-server/`.
- Build de Produção: ao alterar `artifacts/limpeza/src`, rodar build e incluir `dist/` no commit.
- Git push origin main a cada commit.
- Never write source code directly as orchestrator: delegate ALL work to subagents.
- Never run build/test commands directly: require workers to do so.

## Current Parent
- Conversation ID: 0e26104e-f9d0-4cf4-a9ad-dc9cd77f6959
- Updated: 2026-10-11T23:17:15Z

## Key Decisions Made
- M1 e M2 implementados e pré-verificados.
- Disparo simultâneo de 2 Reviewers, 2 Challengers e 1 Forensic Auditor para validação rigorosa e independente.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_1 | teamwork_preview_explorer | Survey Backend & WhatsApp Routing | completed | b9bdabe5-1420-4b0f-92c3-84d21469dc5b |
| explorer_2 | teamwork_preview_explorer | Survey AI Coaching & Tone Calibration | completed | 6fd66114-4682-4427-9344-eb9d29afe546 |
| explorer_3 | teamwork_preview_explorer | Survey Frontend Web Chat & Automation UI | completed | 5ae5126c-8b00-4de3-a704-58155ee07d11 |
| worker_1 | teamwork_preview_worker | M1 Backend Core & AI Coaching | completed | bb30af68-4671-46ce-b80f-45c3e61fa330 |
| worker_2 | teamwork_preview_worker | M2 Frontend Web Chat & Automation UI | completed | 8f3a2ed9-178f-41a3-83d1-0fc80cc156f7 |
| reviewer_1 | teamwork_preview_reviewer | Backend Review & Parity Check | in-progress | 05d03692-3ecb-4981-86ff-75948b3b2a57 |
| reviewer_2 | teamwork_preview_reviewer | Frontend Review & Build Check | in-progress | 77ff6655-c9f5-470f-89e3-f10c85766cc7 |
| challenger_1 | teamwork_preview_challenger | Backend & Intent Challenger | in-progress | 21ccda68-4d17-4eb2-955b-f4c9e3a62754 |
| challenger_2 | teamwork_preview_challenger | API & Rectification Challenger | in-progress | 5c0e4dee-4015-4244-8eb3-d5937da67a29 |
| auditor_1 | teamwork_preview_auditor | Forensic Integrity Audit | in-progress | 5fa3d544-7cf0-4dc4-979f-5765afd3337a |

## Succession Status
- Succession required: no
- Spawn count: 10 / 16
- Pending subagents: 05d03692-3ecb-4981-86ff-75948b3b2a57, 77ff6655-c9f5-470f-89e3-f10c85766cc7, 21ccda68-4d17-4eb2-955b-f4c9e3a62754, 5c0e4dee-4015-4244-8eb3-d5937da67a29, 5fa3d544-7cf0-4dc4-979f-5765afd3337a
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: d9d088c2-767a-4f5a-9d52-d234243c2f9b/task-16
- Safety timer: none

## Artifact Index
- context.md — Contexto e requisitos autoritativos
- DISPATCH.md — Registro de despachos recebidos
- BRIEFING.md — Memória de trabalho do orquestrador
- progress.md — Heartbeat e checklist de progresso
- plan.md — Plano de execução detalhado
- PROJECT.md — Documento vivo de escopo e arquitetura
- worker_1/handoff.md — Relatório do Backend Worker
- worker_2/handoff.md — Relatório do Frontend Worker
