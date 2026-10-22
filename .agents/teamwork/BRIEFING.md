# BRIEFING — 2026-10-22T12:45:00Z

## Mission
Construir um Sistema Completo de Gestão de Funcionários CLT (RH, Ponto Eletrônico com Selfie/GPS e Whitelist de Aparelho, Automação WhatsApp, Escalas 6x1, Motor de Conformidade CLT/Sindicato com Travas em 3 Níveis, Folha de Pagamento, Contratos e Controle de ASO) integrado ao Guest-Flow-Manager (CorpFlats Soho Residence).

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
- Orchestrator (swe_light_2): 17091fdb-497c-4bb6-83bb-cb42adbcc6db (completed, retired)
- Parent Caller (Minibar): 78fb27ce-9ba1-4b4f-9df0-1e49eae533a9
- Active Orchestrator (orchestrator_16): d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Active Orchestrator (HR/CLT): 58ecb31f-60d2-4e1e-9aac-82400a58c263 (orchestrator_17)
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
- Minibar Ecosystem: autoatendimento mobile do hóspede, checkout PIX/Cartão, 4 interfaces dedicadas, fluxo de NF automático via WhatsApp/E-mail, controle de cortesias, auditoria de divergências com Sofia e inteligência analítica no CRM.
- Route: General (teamwork_preview_orchestrator)
- Gestão de Funcionários CLT (1 Cozinha, 1 Camareira CLT)
- Isolamento estrito de Cris e Grazi (diaristas/prestadoras, 100% fora de ponto/CLT/travas)
- Ponto com selfie SHA-256, GPS Haversine (150m Soho) e Whitelist de Aparelho
- Motor de conformidade em 3 níveis (alert, admin_override, hard_block)
- Automação WhatsApp (confirmação imediata + saldo mensal + lembretes preventivos)
- Folha mensal com reflexo DSR (Súmula 172/60 TST), INSS progressivo, VT e holerite
- Contratos com assinatura eletrônica canvas e gestão de ASO
- Paridade twin-server SHA-256 (34/34 arquivos de runtime)
- Build frontend: npm --prefix artifacts/limpeza run build com exit 0 e git push com dist/
- Teste pontual estrito: tests/hr-employee-management.test.mjs (PROIBIDO testes globais)

## User Context
- **Last user request**: Construir Sistema Completo de Gestão de Funcionários CLT integrado ao Guest-Flow-Manager.
- **Pending clarifications**: none
- **Delivered results**:
  - M1 (Backend Core & Isolamento de Prestadoras): Gate 2 PASS (7/7 unit tests, 10/10 challenger tests, 30/30 paridade twin).
  - M2 (Ponto Eletrônico & Conformidade 3 Níveis): Gate 2 PASS (10/10 testes, 33/33 geofence, 46/46 compliance, 32/32 paridade twin, auditor forense CLEAN).
  - M3 (WhatsApp & Escalas 6x1 / Horas Extras / Férias): Gate 2 PASS (16/16 testes, 34/34 paridade twin, 16/16 stress math, 75/75 stress security, 26/26 stress vacations, auditor CLEAN).
  - M4 (Folha de Pagamento, Contratos & ASO): Gate 2 PASS (16/16 testes pontuais, 36/36 paridade twin, 848/848 stress math, 41/41 stress security, auditor CLEAN).

## Project Status
- **Phase**: in progress (Transição para Marco M5 - Frontend & Build)
- **Route**: General (teamwork_preview_orchestrator)
- **Active Orchestrator Dir**: .agents/teamwork/orchestrator_17
- **Active Orchestrator ID**: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- **Victory Auditor ID**: [TBD]
- **Cron 1 (Reporting)**: 44c9d5d3-ce43-4735-9676-136dc0811c34/task-784
- **Cron 2 (Liveness)**: 44c9d5d3-ce43-4735-9676-136dc0811c34/task-786

## Victory Audit Status
- **Triggered**: no
- **Verdict**: pending
- **Retry count**: 0

## Artifact Index
- ORIGINAL_REQUEST.md — Authoritative user request
- .agents/teamwork/orchestrator_17/PROJECT.md — Architecture master document
- .agents/teamwork/orchestrator_17/GATE_STATUS.md — Milestone gates audit log
- .agents/teamwork/orchestrator_17/progress.md — Active orchestrator progress log
- .agents/teamwork/orchestrator_17/BRIEFING.md — Orchestrator memory
- scripts/check-twin-parity.mjs — Dynamic twin-server parity validator
