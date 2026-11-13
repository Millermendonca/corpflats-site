# BRIEFING — 2026-11-10T01:55:00Z

## Mission
Explore AI capabilities, feedback triage (< 5 stars maid vs non-maid responsibility), and consolidated opinion synthesis & evolution comparative (Mercado Livre style) for guest reviews/surveys.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3
- Original parent: 5c040e5e-c55e-4650-ac48-960c732d710d
- Milestone: Survey & Review AI Triage and Opinion Synthesis Architecture

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Metadata only in .agents/teamwork/explorer_survey_3/
- Strict compliance with AGENTS.md (twin-server rule, zero global tests, prompt & tool design rules)
- All findings backed by verified code references

## Current Parent
- Conversation ID: 5c040e5e-c55e-4650-ac48-960c732d710d
- Updated: 2026-11-10T01:55:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs`: `callGeminiGenerateContent` (14843), `getGeminiCandidateEndpoints` (14739), review endpoints (62568-62850), `analyzeTextSentimentWithAI` (62885).
  - `artifacts/api-server/whatsapp-ai-service.mjs`: `callGeminiAi` (8747), `interpretFiscalMessageWithLLM` (11745) Two-Tier pattern.
  - `artifacts/api-server/zapi-service.mjs`: NPS flow (16250-16560), `categorizeImprovementFeedback` (15680), `rebuildNpsImprovementsSummary` (15744), `syncNpsCommentToReviews` (15699), `getLatestNpsSurveySentInfo` (16090).
  - `artifacts/api-server/maid-automation-service.mjs`: Maid triggers (13-90), `syncMaidCredits` (173), maid users filtering and scheduler (945-995).
  - `artifacts/limpeza/src/pages/review-insights.tsx`: Frontend dashboard for reviews, NPS, sentiments, and templates.
  - `tests/nps-score-messages-and-improvements.test.mjs`, `tests/semantic-critique-ai.test.mjs`: Testing patterns with deterministic mocks and fallbacks.
- **Key findings**:
  - AI calls in this repo follow a strict **Two-Tier Pattern (Zero Crash)**: Tier 1 calls Gemini (with automatic endpoint discovery, model cache, thinking budget 0), and Tier 2 runs a deterministic regex/rule-based fallback.
  - NPS response flow in `zapi-service.mjs` already handles 2-step collection (score then comment within 48h); R3 hooks directly into this inbound feedback handler.
  - R3 triage requires separating maid responsibilities (linen, towels, amenities, bathroom/kitchen cleaning, dust, trash) from non-maid issues (Wi-Fi, check-in, AC, plumbing, locks, noise).
  - R5 Mercado Livre synthesis requires real-time incremental update per maid, consolidating positive highlights, specific item recurrence (shower box, kitchen utensils, linen, floor), and period-over-period comparative (evolution vs regression delta).
  - Test suites use `node:test` + `node:assert/strict` with injected mock functions (`aiGenerateFn`, `sendZapiFn`) for 100% deterministic, offline testability.
- **Unexplored areas**: None for Explorer 3 scope. All items mapped and ready for handoff.

## Key Decisions Made
- Architected Feedback Triage with Two-Tier Pattern (Gemini structured JSON + Regex fallback).
- Designed Mercado Livre Style Opinion Synthesis with typed data schema, incremental update algorithm, and 2-message WhatsApp delivery contract.
- Established strict punctual testing blueprint following repo conventions.

## Artifact Index
- `DISPATCH.md` — Incoming instructions
- `progress.md` — Liveness heartbeat and milestone record
- `BRIEFING.md` — Persistent situational memory
- `handoff.md` — Full 5-component handoff report for parent orchestrator
