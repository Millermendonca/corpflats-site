# Dispatch Task for Explorer 2: Frontend UI Mount & Polling Optimizations (Prioridade 2)

## Objective
Investigate codebase regarding Priority 2 frontend requirements:
1. `<PmsCalendar modalOnly />` in `artifacts/limpeza/src/components/floating-new-reservation.tsx`:
   - Investigate why and how it's rendered.
   - Plan how to mount on-demand only when modal is open (`isOpen`), and avoid loading/rendering when closed.
2. `artifacts/limpeza/src/components/pms-calendar.tsx`:
   - Deactivate 4s polling and heavy computations when closed / inactive.
   - Reduce polling frequency of `GET /api/pms/calendar` from 4s to 10s–15s.
   - Pause polling when tab is hidden (`document.hidden` / `visibilitychange`).

## Authoritative User Request
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.

## Instructions
- Inspect existing implementations of `artifacts/limpeza/src/components/floating-new-reservation.tsx` and `artifacts/limpeza/src/components/pms-calendar.tsx`.
- Identify exact state hooks, intervals, and rendering conditions.
- Produce a structured handoff report at `.agents/teamwork/explorer_2/handoff.md` with:
  - Observation (exact current lines/blocks)
  - Logic Chain & Proposed Fix Strategy (precise edits for Worker)
  - Caveats & Risks
  - Verification Method (how Worker will verify, respecting project rules)
- Send message to orchestrator when completed.


## 2026-11-02T23:19:08Z
Your identity is teamwork_explorer (PMS UI Explorer).
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2\
Scope: Prioridade 2 — Frontend UI Performance in PMS components.
Investigate:
1. `<PmsCalendar modalOnly />` in `artifacts/limpeza/src/components/floating-new-reservation.tsx`:
   - Why is it mounted while modal is closed?
   - How to dynamically mount/render it only when `isOpen` is true.
2. `artifacts/limpeza/src/components/pms-calendar.tsx`:
   - Polling logic for `GET /api/pms/calendar`: reduce 4s to 10s–15s.
   - Pause polling when tab is hidden (`document.hidden` / `visibilitychange`).
   - Deactivate 4s polling and heavy computations when closed or modalOnly and not active.
Constraints:
- Read-only investigation.
- Produce detailed findings and proposed implementation plan at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2\handoff.md
- Update progress in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2\progress.md
