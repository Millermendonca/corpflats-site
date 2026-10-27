# BRIEFING — 2026-10-27T15:56:30Z

## Mission
Implementar o sistema completo de Serviço Diário de Governança (Stayover) exclusivo para reservas B2B (Governança Diária B2B, diferenciação visual nos cards, tarifação diferenciada para Cris e Grazi, checklist/contador de troca de enxoval com alerta de 3 dias, controles de Não Perturbe e solicitação de troca no Portal do Hóspede B2B).

## 🔒 My Identity
- Archetype: sentinel
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork
- Orchestrator: 5c8f06aa-a876-42b7-8e25-4f73f9a21590 (orchestrator_18)
- Victory Auditor: [to be spawned on victory claim]

## 🔒 Key Constraints
- No technical decisions — relay only
- Victory Audit is MANDATORY before reporting completion
- Route: General (teamwork_preview_orchestrator)
- AGENTS.md rules: NUNCA rodar testes globais/varreduras. Apenas teste pontual: tests/b2b-stayover-housekeeping.test.mjs
- Build de verificação em artifacts/limpeza (npm run build)
- Sempre git push ao realizar commits
- Twin-server parity SHA-256 entre scripts/ e artifacts/api-server/
- Cris e Grazi permanecem prestadoras terceirizadas autônomas com taxas configuráveis para checkout e stayover

## User Context
- **Last user request**: Implementar o sistema completo de Serviço Diário de Governança (Stayover) exclusivo para reservas B2B.
- **Pending clarifications**: none
- **Delivered results**: previous missions completed and confirmed; B2B Stayover orchestrator running.

## Project Status
- **Phase**: in progress (orchestrator_19 / gen2 running M5: test passed 100%, npm run build passed, pending git push and victory claim)
- **Route**: General (teamwork_preview_orchestrator)
- **Active Orchestrator Dir**: .agents/teamwork/orchestrator_19
- **Active Orchestrator ID**: f2b006e6-21b8-4227-9b41-26a4892c80c8
- **Predecessor Orchestrator ID**: 5c8f06aa-a876-42b7-8e25-4f73f9a21590
- **Cron 1 (Progress Reporting)**: 134600f7-9fc8-4d15-9abb-b48708f01b66/task-32
- **Cron 2 (Liveness Check)**: 134600f7-9fc8-4d15-9abb-b48708f01b66/task-34
- **Victory Auditor ID**: [TBD]

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- ORIGINAL_REQUEST.md — Authoritative user request
- .agents/teamwork/sentinel/BRIEFING.md — Sentinel persistent briefing
