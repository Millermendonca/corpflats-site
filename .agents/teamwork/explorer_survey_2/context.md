# Explorer Survey 2 Context: Frontend & 18:00 Date Switchover

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_2`
- **Focus**:
  - `artifacts/limpeza/src/pages/dashboard.tsx` and related frontend components (e.g. date headers, filters)
  - `getDefaultDate()` logic and 18:00 cutoff transition
  - Investigation of Flat 904 scenario: check-in 28/09 (Jorge), check-out 29/09. After 18:00 on 28/09, dashboard loaded 29/09 checkout clean, creating confusion as if it were yesterday or overdue
  - Recommended UI / logic adjustments: visual indicator of displayed date vs current calendar date, clear label (e.g. "Previsão de Amanhã" / "Hoje" / "Turno Noturno"), and avoiding false overdue perception
  - Build and lint environment in `artifacts/limpeza`
