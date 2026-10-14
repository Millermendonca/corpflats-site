# BRIEFING — 2026-10-14T09:38:00Z

## Mission
Audit, test, fix, and enhance the entire NFS-e module (Municipal GissOnline & National ADN) in Guest-Flow-Manager, achieving end-to-end compatibility with CRM 360° and automated WhatsApp fiscal collection/sanitization/enrichment without repetitive questions.

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

## User Context
- **Last user request**: Audit, test, fix, and enhance the NFS-e module (Municipal GissOnline and National ADN), integrating with CRM 360° and WhatsApp automation.
- **Pending clarifications**: none
- **Delivered results**:
  - Previous WBP Integration track completed.
  - NFS-e & CRM 360° & WhatsApp track starting.

## Project Status
- **Phase**: in progress
- **Route**: General (teamwork_preview_orchestrator)
- **Active Orchestrator Dir**: .agents/teamwork/orchestrator_9
- **Active Orchestrator ID**: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- **Cron 1 (Reporting)**: active (task-28)
- **Cron 2 (Liveness)**: active (task-30)

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- ORIGINAL_REQUEST.md — Authoritative user request
- .agents/teamwork/orchestrator_9/progress.md — Active orchestrator progress log
