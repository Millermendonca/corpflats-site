# BRIEFING — 2026-10-14T11:40:00Z

## Mission
Auditar, testar, corrigir e aperfeiçoar todo o módulo de emissão de NFS-e (Municipal GissOnline e Padrão Nacional ADN) no Guest-Flow-Manager (CorpFlats), compatibilizando-o com o CRM 360° e automatizando no WhatsApp a solicitação, higienização, enriquecimento e vínculo fiscal de empresas e hóspedes sem repetição de perguntas.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9
- Original parent: parent (Sentinel)
- Original parent conversation ID: 851af1b5-cd64-4db7-9b91-8471dc229ee3

## 🔒 My Workflow
- **Pattern**: Project Pattern (Survey → Decompose & Delegate → Iteration Loop per milestone: Explorer → Worker → Reviewer → Challenger → Auditor → Gate)
- **Scope document**: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_9\PROJECT.md
1. **Decompose**:
   - Milestone 0: Survey & Technical Mapping (3 Explorers in parallel) — DONE
   - Milestone 1 (M1): NFS-e Backend Engine Fixes & Unified Emission (F1-F5) — DONE
   - Milestone 2 (M2): CRM 360° Alignment & Fiscal Invoices UI (F6-F11) — DONE
   - Milestone 3 (M3): WhatsApp Fiscal Assistant Flow & Automated Enrichment (F12-F17) — DONE
   - Milestone 4 (M4): Twin Parity, Dedicated Test Suite, Build & Git Push (F18-F20) — IN DEPLOYMENT
2. **Dispatch & Execute**:
   - Iteration Loop: Explorers → Worker → Reviewers → Challengers → Auditor → Gate.
3. **On failure**:
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical; NEVER skip auditor)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
4. **Succession**:
   - Self-succeed at 16 spawns, write handoff.md, spawn successor.
- **Work items**:
  1. Survey & Technical Mapping [done]
  2. M1: NFS-e Backend Engine Fixes & Unified Emission [done]
  3. M2: CRM 360° Alignment & Fiscal Invoices UI [done]
  4. M3: WhatsApp Fiscal Assistant Flow & Automated Enrichment [done]
  5. M4: Dedicated Test Suite, Parity, Build & Git Push [in-progress]
- **Current phase**: 4 (Milestone 4 / Deployment)
- **Current focus**: Git commit and push (worker_deploy running)

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly (DISPATCH-ONLY).
- NEVER run build/test commands yourself — require workers to do so.
- NEVER investigate code directly — dispatch Explorers.
- Parity rule: Maintain 100% byte-for-byte SHA-256 parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
- AGENTS.md rule: NEVER run global test suites (`tests/*.test.mjs`). Run EXCLUSIVELY `tests/nfse-crm-whatsapp-flow.test.mjs`.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- Forensic Auditor has hard binary veto.

## Current Parent
- Conversation ID: 851af1b5-cd64-4db7-9b91-8471dc229ee3
- Updated: not yet

## Key Decisions Made
- All milestones M1, M2, M3, M4 verified and approved.
- Gate passed with all 5 approvals (Reviewer 1 APPROVE, Reviewer 2 APPROVE, Challenger 1 APPROVE, Challenger 2 APPROVE, Forensic Auditor CLEAN).
- Dispatched worker_deploy to stage, commit, and push changes to remote repository.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| survey_explorer_1 | teamwork_preview_explorer | NFS-e Engine & Emission Audit | completed | 055530c8-376a-4e2c-960c-32a91c375ea9 |
| survey_explorer_2 | teamwork_preview_explorer | CRM 360° Models & Fiscal Invoices UI | completed | 4a6cc5b3-a29c-44a3-8e33-11ec615cbfe7 |
| survey_explorer_3 | teamwork_preview_explorer | WhatsApp Fiscal Flow & Test Architecture | completed | 0011867c-603d-4f67-b0f9-da0a19c0da43 |
| worker_m1 | teamwork_preview_worker | NFS-e Backend Engine Fixes & Emission | completed | a67315ec-4027-4d12-9167-5dde756915c7 |
| worker_m2 | teamwork_preview_worker | CRM 360° Alignment & Fiscal Invoices UI | completed | 61c05917-1db6-4770-b2c4-6f766e9dc241 |
| worker_m3 | teamwork_preview_worker | WhatsApp Fiscal Flow & Enrichment | completed | 9ddd8da1-f520-437e-85f3-febb3f05f487 |
| test_writer_m4 | teamwork_preview_test_writer | Dedicated Test Suite nfse-crm-whatsapp-flow | completed | 66ffadb2-6f11-4de7-aa46-2c8654d6a8c4 |
| reviewer_1 | teamwork_preview_reviewer | R1 & R2 Review | completed | 9e34a32a-d827-4cd1-bdb7-182dd60f9cd0 |
| reviewer_2 | teamwork_preview_reviewer | R3 & R4 Review | completed | 50214eeb-a8e7-4968-ba23-6d69b47c43d3 |
| challenger_1 | teamwork_preview_challenger | NFS-e & CRM Stress Challenge | completed | 667cdc04-4af7-467d-b717-071d796951ef |
| challenger_2 | teamwork_preview_challenger | WhatsApp Flow & Validation Stress | completed | fba506c0-704b-4db5-9476-744423181b55 |
| auditor_1 | teamwork_preview_auditor | Forensic Integrity Audit | completed | 3b64b67b-1cce-44dc-bc71-26b218dd2014 |
| worker_deploy | teamwork_preview_worker | Git Commit & Push | running | a24575bf-04cf-4271-a2e8-181c4e1b0b96 |

## Succession Status
- Succession required: no
- Spawn count: 13 / 16
- Pending subagents: a24575bf-04cf-4271-a2e8-181c4e1b0b96
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 3d03f136-f013-4588-99e3-f22e17cc1ae4/task-10
- Safety timer: none

## Artifact Index
- .agents/teamwork/orchestrator_9/DISPATCH.md — Dispatch instructions from parent
- .agents/teamwork/orchestrator_9/BRIEFING.md — Persistent working memory
- .agents/teamwork/orchestrator_9/progress.md — Liveness heartbeat and milestone checklist
- .agents/teamwork/orchestrator_9/PROJECT.md — Global architecture, feature inventory & milestones
- .agents/teamwork/orchestrator_9/GATE_STATUS.md — Gate verdicts tracking
- .agents/teamwork/worker_m1/handoff.md — M1 implementation handoff
- .agents/teamwork/worker_m2/handoff.md — M2 implementation handoff
- .agents/teamwork/worker_m3/handoff.md — M3 implementation handoff
- .agents/teamwork/test_writer_m4/handoff.md — M4 test suite handoff
- .agents/teamwork/reviewer_1/handoff.md — Reviewer 1 handoff
- .agents/teamwork/reviewer_2/handoff.md — Reviewer 2 handoff
- .agents/teamwork/challenger_1/handoff.md — Challenger 1 handoff
- .agents/teamwork/challenger_2/handoff.md — Challenger 2 handoff
- .agents/teamwork/auditor_1/handoff.md — Auditor handoff
