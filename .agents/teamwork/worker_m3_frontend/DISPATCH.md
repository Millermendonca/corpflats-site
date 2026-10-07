## 2026-10-07T16:51:00Z

You are teamwork_preview_worker (Worker M3 Frontend Implementer).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m3_frontend
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

Read:
- Survey Report: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_frontend_2/survey_frontend.md
- Project Plan: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/orchestrator_2/PROJECT.md

YOUR EXCLUSIVE FILE OWNERSHIP:
- `artifacts/limpeza/src/lib/checkin-url.ts`
- `artifacts/limpeza/src/pages/settings.tsx`
- `artifacts/limpeza/src/pages/pms-calendar.tsx`
- `artifacts/limpeza/src/components/reservation-hover-card.tsx`
- `artifacts/limpeza/src/pages/reception-tablet.tsx`
- `artifacts/limpeza/src/hooks/use-quick-messages.ts`
- `artifacts/limpeza/dist/`

TASKS:
1. Create `artifacts/limpeza/src/lib/checkin-url.ts`:
   - Export `getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", settings = null)`
   - If provider is `gov_fnrh` and `reservation.serproPrecheckinUrl` (or `link_precheckin`) exists, return it; otherwise fallback to `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`.
2. In `artifacts/limpeza/src/pages/settings.tsx`:
   - Implement prominent Hero Card for Check-in Provider with Toggle Switch:
     - Options: "Check-in Próprio (CorpFlats)" vs "Check-in Gov.br (FNRH Digital - Ministério do Turismo)".
     - Mutation: on switch toggle, call `updateSettings.mutateAsync({ data: { checkinProvider: nextProvider } })` which invalidates queries for instant live update without page reload.
     - Connection health badge: query `GET /api/fnrh-serpro/status` and display active status badge and connection health (Operacional / Instável / Em Contingência).
3. In `artifacts/limpeza/src/pages/pms-calendar.tsx`, `src/components/reservation-hover-card.tsx`, `src/pages/reception-tablet.tsx`, and `src/hooks/use-quick-messages.ts`:
   - Replace hardcoded `/pre-checkin/` concatenations with `getCheckinUrl(...)` so "Copiar Link de Check-in" and manual dispatch buttons resolve the active provider URL.
4. CRITICAL REPOSITORY RULE (AGENTS.md):
   - Run `npm run build` in `artifacts/limpeza`.
   - Verify build completes with code 0 and generated assets exist in `artifacts/limpeza/dist/public`.
5. Write your report and `handoff.md` in your working directory.
6. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete.
