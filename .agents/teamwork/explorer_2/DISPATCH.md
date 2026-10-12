# Explorer 2 Task: WhatsApp AI Coaching Engine & Tone Calibration

Working Directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2`
Root Directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

## 2026-10-11T23:18:12Z
Investigate the WhatsApp AI engine and prompt orchestration in c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager.
Authoritative requirements: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (Seção ## Follow-up — 2026-10-11T23:13:31Z).
Your working directory is c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2.
You are a read-only exploration agent. Do NOT modify source code files. Do NOT run global test suites.

Analyze:
1. How Sofia's prompt is assembled in scripts/whatsapp-ai.mjs (and twin in artifacts/api-server/). Where system prompt, tone settings, and dynamic instructions are combined.
2. How to classify incoming messages from the developer (22998505276 / 5522998505276) into:
   a) Guest simulation (FAQ, availability, check-in, wifi questions -> normal Sofia concierge response)
   b) Tone & persona calibration (non-literal commands like "responda de forma mais curta por favor", "use menos emojis", "adote um tom mais descontraído" -> extracts stylistic rule, updates aiConfig.toneSettings/aiConfig.systemPrompt without wiping core rules, responds with cordial confirmation + summary of calibration + immediate sample in new tone)
   c) Factual coaching / guideline learning ("Sofia, o horário do café mudou para 06:30", "Sofia, para o flat 905 a informação correta é..." -> saves to developerGuidelines, confirms).
3. How developer guidelines are dynamically injected into the system prompt for all guests and how tone calibrations take effect immediately.
4. How to format the developer feedback response so it never acts literally as a dumb parrot, but truly as an intelligent assistant confirming calibration and showing a practical sample.
Write your complete report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2\handoff.md and send a message when done.
