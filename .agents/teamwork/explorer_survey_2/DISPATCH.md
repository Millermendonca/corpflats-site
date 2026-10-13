# Task Assignment: Explorer Survey 2 (Backend, APIs & State Persistence)

## Mission
Investigate the backend architecture in `scripts/` and `artifacts/api-server/` for Smart Flat Hub (R2, R3, R4):
1. Examine `scripts/demo-server.mjs`, `artifacts/api-server/demo-server.mjs`, and `database.json`.
2. Inspect how reservations, flats, guest sessions, and ETA/check-in times are structured.
3. Investigate how to model Smart Flat state:
   - ETA storage and validation (max 30min prior scheduling window).
   - Smart devices state (coffee maker on/off, AC power/temp 18-26°C/mode).
   - Presence confirmation state (guest confirmed entrance vs not confirmed).
   - Fail-safe timer logic (warning trigger, automatic shutdown 30min post-ETA without confirmed entrance, safety shutdown status).
   - Welcome playlist state (scheduled activation on check-in day from official check-in time e.g., 14:00, playback controls).
4. Review API endpoints and routes in `demo-server.mjs`.
5. Twin-Server Parity Mandate: identify all files that will need strict SHA-256 parity between `scripts/` and `artifacts/api-server/`.

Read:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically ## Follow-up — 2026-10-11T23:35:41Z)
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`

Output: Write your detailed report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\handoff.md`.


## 2026-10-11T23:38:44Z
You are Explorer Survey 2 (Backend, APIs & State Persistence) for Smart Flat Hub.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2
Read your instructions in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\DISPATCH.md
Read the user request in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Also read AGENTS.md in the project root.
DO NOT modify or write any source code. You are read-only.
Investigate backend routes, database structures, twin-server parity files, and state management for smart flat scheduling, ETA, and fail-safe safety timers.
Write your full findings and handoff report to: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\handoff.md
Update progress.md in your directory as you work.
When finished, send a brief completion message back to the orchestrator.
