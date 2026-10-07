## 2026-10-07T15:38:36Z

You are teamwork_preview_explorer (Explorer Survey Frontend).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_frontend_2
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

YOUR MISSION:
Investigate the frontend architecture (`artifacts/limpeza/src`) for the Admin UI check-in provider toggle and link buttons:
1. Examine:
   - Settings page (`artifacts/limpeza/src/pages/settings.tsx` or similar) and general settings tab. How are system settings fetched from API, displayed, and updated?
   - Existing UI components (Toggle Switch, status badges, icons, tabs, Lucide icons, Radix UI or Tailwind components).
   - How the active check-in provider (`settings.checkinProvider`: `'proprio'` | `'gov_fnrh'`) should be toggled in real time without reload.
   - Status badge indicating active mode and SERPRO API connection health (how frontend queries health status).
   - "Copiar Link de Check-in" buttons in reservations list, reservation details modal, and manual WhatsApp dispatch modal/buttons. Where are they located in the UI components?
   - Frontend build workflow (`npm run build` in `artifacts/limpeza`, destination `dist/public`).
2. Document all findings, component file paths, line numbers, API integration points, and UI mock/layout plans.
3. Write your report to:
   `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_frontend_2/survey_frontend.md`
   and write a complete `handoff.md` in your working directory.
4. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) summarizing your survey and linking to your report files. Do NOT edit any source code or run build commands.
