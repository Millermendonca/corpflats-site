# BRIEFING — 2026-11-10T02:01:00Z

## Mission
Explore and map existing guest review and rating mechanisms across backend routes, stores, checkout portal, and WhatsApp flows to support survey automation requirements (esp. R2: preserving < 5 star feedback prompt and identifying review submission hook points).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1\
- Original parent: 5c040e5e-c55e-4650-ac48-960c732d710d
- Milestone: Review Flow Exploration & Mapping

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Respect Twin-File Rule: read artifacts/api-server/ only, do not touch scripts/
- Do not run global or batch tests
- Output detailed handoff report to handoff.md and send_message to parent

## Current Parent
- Conversation ID: 5c040e5e-c55e-4650-ac48-960c732d710d
- Updated: 2026-11-10T02:01:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` (routes `/api/ai/nps-response`, `/api/ai/reviews`, `/api/ai/import-review`, `/api/ai/improvements-summary`, `/api/public/checkout`)
  - `artifacts/api-server/zapi-service.mjs` (`handleInboundNpsScoreOrComment`, `processInboundNpsAndSentiment`, `registerNpsSurveySent`, `syncNpsCommentToReviews`, `rebuildNpsImprovementsSummary`, templates `tpl_nps_satisfaction_check`, `tpl_post_checkout_review`, `tpl_nps_score_1..4`, `tpl_nps_feedback_thanks`)
  - `artifacts/api-server/maid-automation-service.mjs` (`DEFAULT_MAID_TRIGGERS`, `initMaidAutomationEngine`, `getMaidStats`, `syncMaidCredits`)
  - `artifacts/limpeza/src/pages/guest-checkout.tsx` (digital checkout confirmation, triggers WhatsApp checkout flow)
  - `artifacts/limpeza/src/pages/review-insights.tsx` (admin reviews & improvements dashboard)
  - `tests/nps-score-messages-and-improvements.test.mjs` (canonical test flow for 2-step NPS, feedback comments, and manager alert)
  - `data/database.json` (live state of `db.reviews`, `db.npsResponses`, `db.cleaningRequests`, `db.reservations`, `db.users`)
- **Key findings**:
  - NPS collection is a two-step WhatsApp conversational flow orchestrated by `zapi-service.mjs`.
  - Stage 1: Template `tpl_nps_satisfaction_check` dispatched 24h post-checkout asking for a 1-5 score.
  - Stage 2: Inbound score parsed in `handleInboundNpsScoreOrComment`. If 5, sends Google Review link (`tpl_post_checkout_review`). If < 5 (1-4), triggers specific prompt template (`tpl_nps_score_1` to `4`), sets `awaitingFeedbackComment = true` and waits for written explanation.
  - Subsequent explanation message is captured (up to 48h), updates `existingNps.comment`, calls `syncNpsCommentToReviews(db, existingNps)`, updates `db.npsImprovements`, and sends `tpl_nps_feedback_thanks`.
  - Hook points for real-time review/comment arrival: `handleInboundNpsScoreOrComment` (lines 16348 and 16488), `/api/ai/nps-response` (line 63445), `/api/ai/import-review` (line 62844).
  - Hook point for daily batch summary: `initMaidAutomationEngine` in `maid-automation-service.mjs` (lines 998-1058), which already runs cron loops for daily maid summaries.
  - Maids in system: `db.users` with `role: 'camareira' | 'cleaner'` (Cris ID 2, Grazi ID 3).
  - Linking maid to reservation review: Query `db.cleaningRequests` where `flatNumber === r.flatNumber` and `status === 'clean'`.
- **Unexplored areas**: None — all 6 mission tasks mapped with exact lines and schemas.

## Key Decisions Made
- Fully analyzed and documented two-step NPS collection, schemas, hook points, and maid linkage.

## Artifact Index
- handoff.md — Complete 5-component handoff report
- progress.md — Liveness heartbeat & progress updates
- DISPATCH.md — Log of received dispatch instructions
