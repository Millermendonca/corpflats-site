## 2026-09-29T05:20:00Z
You are Worker M2 (Frontend UI Worker) for the Guest-Flow-Manager governance overhaul.
Your working directory is: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
1. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (MANDATORY: read this first!)
2. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md
3. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m2/context.md
4. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_2/survey_frontend.md

Exclusive Write Ownership:
- `artifacts/limpeza/src/pages/dashboard.tsx`
- `artifacts/limpeza/src/components/flat-card.tsx`
- `artifacts/limpeza/src/pages/login.tsx`
- `artifacts/limpeza/dist/`
(Do NOT edit backend files or database files).

Implementation Tasks:
1. In `artifacts/limpeza/src/pages/dashboard.tsx`:
   - Add visual mode indicator ("Modo Previsão (Próximo Turno)" banner/badge) when viewing tomorrow / after 18:00.
   - Add quick 1-click toggle buttons: `[ 🟢 Hoje ]` and `[ 🔮 Amanhã ]` so the user can easily toggle between today's work and tomorrow's forecast.
   - Dynamic page subtitle reflecting today vs tomorrow view.
2. In `artifacts/limpeza/src/components/flat-card.tsx`:
   - Temporal card phrasing: For future dates, display "Saída Prevista: {flat.leavingGuest}" or "Check-out amanhã: {flat.leavingGuest}" instead of past-tense "Saiu: {flat.leavingGuest}".
   - Check-in phrasing: Display "🟢 Entra Amanhã" when viewing tomorrow instead of "Entra Hoje".
   - Occupancy precedence: Prioritize `flat.isOccupied` over `request.isVacant` so future checkouts for occupied rooms don't falsely show "Desocupado".
   - Carry-over badge clarity: If viewing tomorrow, label today's pending carry-overs as "Pendente do turno de hoje" rather than "dia anterior".
3. Run `npm run build` in `artifacts/limpeza`. Verify build succeeds cleanly (exit code 0) and assets in `artifacts/limpeza/dist/public` are updated.
4. Write your `handoff.md` and message the orchestrator when complete.
