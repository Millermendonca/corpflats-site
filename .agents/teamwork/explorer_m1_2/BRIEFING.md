# BRIEFING — 2026-11-10T02:15:30Z

## Mission
Detailed technical specification for Feature F2 (Preservation of 2-step review flow & hook points) in Guest-Flow-Manager.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_2
- Original parent: 5c040e5e-c55e-4650-ac48-960c732d710d
- Milestone: M1.2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in production source code.
- Non-invasive hook design: zero modification/breaking of existing satisfaction survey prompts (tpl_nps_satisfaction_check, tpl_nps_score_1..4).
- Adhere to AGENTS.md and PROJECT.md guidelines.

## Current Parent
- Conversation ID: 5c040e5e-c55e-4650-ac48-960c732d710d
- Updated: 2026-11-10T02:15:30Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/zapi-service.mjs` (lines 975–1115, 9610–9635, 15590–16050, 16085–16620, 16860–17050)
  - `artifacts/api-server/demo-server.mjs` (lines 120–145, 62818–62850, 63393–63480)
  - `artifacts/api-server/maid-automation-service.mjs` (lines 1–100, 190–240, exports & trigger structure)
  - `tests/nps-score-messages-and-improvements.test.mjs` (lines 1–260)
  - Peer explorer missions: `explorer_m1_1` (F1 Maid Attribution), `explorer_m1_3` (F3/F4 AI Triage)
- **Key findings**:
  - Exact storage locations of `existingNps.score` (lines 16287, 63417) and `existingNps.comment` (lines 16344, 16467, 63417, 62835).
  - Identified 5 hook points: Hook 1 (Score 5 in Z-API), Hook 2 (Inline Sub-5 + Comment in Z-API), Hook 3 (Step 2 Sub-5 Comment in Z-API), Hook 4 (Portal/API NPS in demo-server), Hook 5 (Imported Review in demo-server).
  - Verified 100% preservation of all survey templates (`tpl_nps_satisfaction_check`, `tpl_nps_score_1..4`, `tpl_post_checkout_review`, `tpl_nps_feedback_thanks`) without touching text, tags, delays or buttons.
  - Designed non-invasive, asynchronous, error-isolated listener `invokeMaidReviewHookSafe` and `handleMaidReviewHook`.
- **Unexplored areas**:
  - Full implementation details of Milestone 2 (F5, F6, F7) and Milestone 3 (F8, F9, F10, F11), which depend on M1.

## Key Decisions Made
- Architecture uses `invokeMaidReviewHookSafe` with error isolation, so no hook failure can break the guest's survey flow.
- Score 5 is routed directly to maid attribution & daily summary pool without AI triage.
- Sub-5 without comment remains withheld from maid until guest types comment (Step 2).
- Sub-5 with comment triggers AI triage -> if cleaning-related, triggers opinion synthesis and real-time dual WhatsApp message.

## Artifact Index
- DISPATCH.md — incoming instructions log
- progress.md — liveness and step progress
- BRIEFING.md — working memory
- handoff.md — comprehensive technical report following 5-component protocol
