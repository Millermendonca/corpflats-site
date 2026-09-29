# Context: Worker M2 (Frontend UI Overhaul & 18:00 Transition)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m2`
- **Project Index**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md`
- **Survey Findings**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_2/survey_frontend.md`
- **Exclusive File Ownership**:
  - `artifacts/limpeza/src/pages/dashboard.tsx`
  - `artifacts/limpeza/src/components/flat-card.tsx`
  - `artifacts/limpeza/src/pages/login.tsx`
  - `artifacts/limpeza/dist/`
- **Tasks**:
  1. In `dashboard.tsx`:
     - Add prominent "Modo Previsão (Próximo Turno)" banner and badge when viewing tomorrow / next shift.
     - Add quick 1-click toggle buttons: `[ 🟢 Hoje ]` and `[ 🔮 Amanhã ]` for instant shifting between today's closing and tomorrow's forecast.
     - Update page subtitle dynamically depending on whether viewing today or tomorrow.
  2. In `flat-card.tsx`:
     - Temporal phrasing: When viewing future date, render "Saída Prevista: {flat.leavingGuest}" or "Check-out amanhã: {flat.leavingGuest}" instead of "Saiu: {flat.leavingGuest}".
     - Next check-in label: Render "🟢 Entra Amanhã" when viewing tomorrow instead of "Entra Hoje".
     - Occupancy precedence: prioritize `flat.isOccupied` over `request.isVacant` so future checkouts for currently occupied rooms do not erroneously show "Desocupado".
     - Carry-over clarity: If viewing tomorrow, label today's pending carry-overs as "Pendente do turno de hoje" rather than "dia anterior".
  3. Run frontend build in `artifacts/limpeza` (`npm run build`). Verify that `dist/public` is successfully rebuilt with exit code 0.
