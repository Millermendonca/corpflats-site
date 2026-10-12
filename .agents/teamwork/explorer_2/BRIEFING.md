# BRIEFING — 2026-10-11T23:25:00Z

## Mission
Investigate WhatsApp AI engine & prompt orchestration for developer calibration, guidelines learning, dynamic tone adaptation, and message rectification.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Read-only investigation, analysis, synthesis, structured handoff reporting
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2
- Original parent: d9d088c2-767a-4f5a-9d52-d234243c2f9b
- Milestone: WhatsApp AI Coaching Engine & Tone Calibration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code files
- Do NOT run global test suites
- Strictly obey AGENTS.md

## Current Parent
- Conversation ID: d9d088c2-767a-4f5a-9d52-d234243c2f9b
- Updated: 2026-10-11T23:25:00Z

## Investigation State
- **Explored paths**:
  - `scripts/whatsapp-ai-service.mjs`
  - `artifacts/api-server/whatsapp-ai-service.mjs`
  - `scripts/zapi-service.mjs`
  - `artifacts/api-server/zapi-service.mjs`
  - `scripts/demo-server.mjs`
  - `artifacts/api-server/demo-server.mjs`
  - `artifacts/limpeza/src/pages/whatsapp-chat.tsx`
  - `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
  - `tests/whatsapp-ai-agent.test.mjs`
  - `.agents/teamwork/ORIGINAL_REQUEST.md` (Follow-up 2026-10-11T23:13:31Z)
- **Key findings**:
  - Prompt assembly merges `DEFAULT_AI_CONFIG.systemPrompt`, `contextString` (real-time guest context, official KB, dynamic FAQs, actions notice). No current support for `toneSettings` or `developerGuidelines`.
  - Discovered parity mismatch between `scripts/whatsapp-ai-service.mjs` and `artifacts/api-server/whatsapp-ai-service.mjs` (the artifact twin was left behind from older milestones and lacks Soho/bandeja details).
  - Tri-modal classification architecture formulated: `guest_simulation`, `tone_calibration`, and `factual_coaching` with comprehensive heuristic regex matching and fallback safety.
  - Anti-parrot response protocol designed: 4-part structure (acknowledgment as creator, extraction summary, live sample in new tone, confirmation of global immediate validity).
  - Dynamic injection mechanism designed: combines active guidelines and tone settings into `systemInstruction` for all incoming guest conversations without wiping core prompt rules.
- **Unexplored areas**: None for read-only exploration scope; all 4 prompt questions fully answered.

## Key Decisions Made
- Outlined complete data structures for `db.whatsappAiSettings.toneSettings` and `db.whatsappAiSettings.developerGuidelines`.
- Designed bypass logic for `aiPaused` when the sender is Miller (`22998505276` / `5522998505276`).
- Specified REST endpoint `/api/whatsapp/chat/:phone/correct-message` and frontend UI components for `/whatsapp-chat` and `/whatsapp-automation`.

## Artifact Index
- DISPATCH.md — record of incoming task dispatches
- BRIEFING.md — situational awareness and persistent memory
- progress.md — liveness heartbeat
- handoff.md — final 5-component handoff report
