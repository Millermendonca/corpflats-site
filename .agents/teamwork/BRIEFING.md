# BRIEFING — 2026-10-19T14:10:30Z

## Mission
Implementar controle visual e granular de permissões de acesso por usuário na página de Gestão de Equipe (/equipe) do Guest-Flow-Manager (CorpFlats), com allowedModules no backend e dinâmico no menu lateral e guardas de rota.

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
- Parent Caller (UI Reorganization & Permissions): c918ec21-d268-4082-bdd6-d0c3dc1d3481
- Orchestrator (orchestrator_13): c4864abd-776b-4ad1-aef9-25c7af7463df (completed, retired)
- Victory Auditor (victory_auditor_11): 8208bf2a-33f9-4fb8-9ffd-72fea3816107 (completed, retired)
- Active Orchestrator (swe_light_2): 17091fdb-497c-4bb6-83bb-cb42adbcc6db
- Victory Auditor: [to be spawned on victory claim]

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
- Coluna Lateral Esquerda Auto-Hide (zero px no fluxo desktop, hover edge trigger/overlay com fixar/desafixar)
- Separação de perfis: dev (acesso total + DevRoute) vs admin (gestão hoteleira sem rotas técnicas)
- Página dedicada de Equipe & Usuários (/equipe e /usuarios) acessível para admin e dev sem expor chaves/nuvem
- Remoção completa do manual WBP (/ajuda-wbp) e exclusão dos arquivos wbp-manual.tsx e WbpHelpManualPage.tsx
- Reorganização dos menus em 6 categorias por prioridade operacional com busca rápida no topo
- Escopo estrito de testes (AGENTS.md): NUNCA rodar testes globais/varreduras
- Granular permissions: allowedModules per user, presets per role, safe devOnly module stripping for non-dev editors
- Route: SWE Light (teamwork_preview_swe)

## User Context
- **Last user request**: Implementar controle visual e granular de permissões de acesso por usuário na página de Gestão de Equipe (/equipe) com allowedModules no backend e dinâmico no menu lateral e guardas de rota.
- **Pending clarifications**: none
- **Delivered results**:
  - Task dispatched to swe_light_2 (17091fdb-497c-4bb6-83bb-cb42adbcc6db).
  - Monitoring Crons 1 & 2 scheduled.

## Project Status
- **Phase**: in progress
- **Route**: SWE Light (teamwork_preview_swe)
- **Active Orchestrator Dir**: .agents/teamwork/swe_light_2
- **Active Orchestrator ID**: 17091fdb-497c-4bb6-83bb-cb42adbcc6db
- **Victory Auditor ID**: [TBD]
- **Cron 1 (Reporting)**: e9abb18b-3068-432f-a9e7-82911d7b023d/task-22
- **Cron 2 (Liveness)**: e9abb18b-3068-432f-a9e7-82911d7b023d/task-24

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- ORIGINAL_REQUEST.md — Authoritative user request
- .agents/teamwork/swe_light_2/context.md — Initial orchestrator context
- .agents/teamwork/swe_light_2/progress.md — Active orchestrator progress log
