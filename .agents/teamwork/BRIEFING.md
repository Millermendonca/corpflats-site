# BRIEFING — 2026-10-15T18:57:00Z

## Mission
Auditar, corrigir e unificar todos os módulos da seção "FINANCEIRO & VENDAS" do sistema Guest-Flow-Manager (CorpFlats): ERP Financeiro & DRE, Precificação SEBRAE, Gestão de Tarifas & Taxas, Pagamentos & Conciliação PIX e Funil de Vendas & Tráfego IA.

## 🔒 My Identity
- Archetype: sentinel
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork
- Orchestrator: 26335f75-5ae5-4381-97dc-4cdaaa103cfd (completed, retired)
- Victory Auditor: 9e6da7f8-68ed-421b-a182-55627571e821 (completed, retired)
- Active Orchestrator (WBP): 84d9f696-67d5-4529-bec4-c0232e9abea0
- Parent Caller: 70356aec-b041-4a86-8517-6963f7cb2aa9
- Parent Caller (NFS-e & CRM): 8e16fbb7-d63f-4851-8018-96f97606570f
- Orchestrator (NFS-e & CRM): [TBD]
- Victory Auditor: [to be spawned on victory claim]
- Parent Caller: 53ba71c4-b2b4-4103-a836-6160aa32cdf6
- Orchestrator: 58cdb6b1-927d-4a40-a904-c1cb8a18080b (orchestrator_11)
- Parent Caller: f7b34d3e-fa50-4436-8234-7f3e739c9c7e
- Orchestrator: 0a6a6ddb-09e4-44a9-a9b4-e57b243ea69c (orchestrator_12)
- Victory Auditor: da4d96bd-6bad-4099-91a1-da47d600841a (victory_auditor_10)

## 🔒 Key Constraints
- No technical decisions — relay only
- Victory Audit is MANDATORY before reporting completion
- Route: General (teamwork_preview_orchestrator)
- AGENTS.md rules: no batch/global tests, git push on every commit, build verification in artifacts/limpeza
- Twin-server SHA-256 parity when applicable
- Dedicated branch: feature/wbp-integration (zero commits or merges to main without explicit approval)
- Zero data loss and zero production disruption for CorpFlats Soho Residence
- Fail-closed security: zero plaintext PAN/CVV, 5-min single-use admin token
- Strict targeted test execution only
- NFS-e municipal (GissOnline) and national (ADN) bug fix and end-to-end CRM 360° compatibility
- WhatsApp fiscal collection, sanitization, enrichment (CNPJ/CEP) and linking with zero repetitive questions for company-linked guests
- Strict test scope: ONLY run tests/nfse-crm-whatsapp-flow.test.mjs
- Twin-server SHA-256 parity between scripts/demo-server.mjs and artifacts/api-server/demo-server.mjs
- Build verification: npm run build in artifacts/limpeza
- No Live WhatsApp Test Spam: strictly avoid tests that trigger live Z-API WhatsApp messages to real phone numbers
- Verification scope: targeted financial verification and npm run build in artifacts/limpeza

## User Context
- **Last user request**: Auditoria, unificação e correção dos módulos Financeiro & Vendas (DRE, SEBRAE, Tarifas, Pagamentos PIX, Funil IA).
- **Pending clarifications**: none
- **Delivered results**:
  - Implementação completa dos marcos M1 a M4 por orchestrator_12 e sua equipe.
  - Portão de revisão interna e desafio empírico concluído com êxito (GATE_STATUS: PASS).
  - Auditoria independente de vitória concluída com veredicto VICTORY CONFIRMED.
  - Crons encerrados e subagentes limpos conforme o protocolo.

## Project Status
- **Phase**: complete
- **Route**: General (teamwork_preview_orchestrator)
- **Active Orchestrator Dir**: .agents/teamwork/orchestrator_12
- **Active Orchestrator ID**: 0a6a6ddb-09e4-44a9-a9b4-e57b243ea69c (retired)
- **Victory Auditor ID**: da4d96bd-6bad-4099-91a1-da47d600841a (victory_auditor_10 - retired)
- **Cron 1 (Reporting)**: cancelled
- **Cron 2 (Liveness)**: cancelled

## Victory Audit Status
- **Triggered**: yes
- **Verdict**: VICTORY CONFIRMED
- **Retry count**: 0

## Artifact Index
- ORIGINAL_REQUEST.md — Authoritative user request
- .agents/teamwork/orchestrator_12/progress.md — Active orchestrator progress log
- .agents/teamwork/orchestrator_12/handoff.md — Orchestrator handoff and victory claim
- .agents/teamwork/orchestrator_12/GATE_STATUS.md — Verification gate report
- .agents/teamwork/victory_auditor_10/handoff.md — Independent post-victory audit report
- .agents/teamwork/handoff.md — Sentinel final handoff report
