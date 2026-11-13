# BRIEFING — 2026-11-02T23:28:00Z

## Mission
Investigate Priority 2 frontend UI performance in PMS components: <PmsCalendar modalOnly /> dynamic mounting in floating-new-reservation.tsx and pms-calendar.tsx polling frequency and tab visibility pausing.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Read-only investigation, analysis, synthesis, structured handoff reporting
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_2
- Original parent: d9d088c2-767a-4f5a-9d52-d234243c2f9b
- Milestone: WhatsApp AI Coaching Engine & Tone Calibration
- Current Milestone: Prioridade 2 — Frontend UI Performance in PMS components
- Current Parent: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code files
- Do NOT run global test suites
- Strictly obey AGENTS.md
- Output path discipline: write only to .agents/teamwork/explorer_2/

## Current Parent
- Conversation ID: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc
- Updated: 2026-11-02T23:28:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/limpeza/src/components/floating-new-reservation.tsx`
  - `artifacts/limpeza/src/pages/pms-calendar.tsx`
  - `artifacts/limpeza/src/App.tsx`
- **Key findings**:
  - Discovered root cause of `<PmsCalendar modalOnly />` mounting: `FloatingNewReservationButton` statically imported `PmsCalendar` and rendered it on all pages when `!isOnReservationsPage`.
  - Discovered that at 600ms after mount, `<PmsCalendar modalOnly />` fired a burst of 8+ backend requests (`/api/pms/calendar`, `/api/pms/companies`, `/api/pms/agencies`, `/api/pms/guests`, breakfast orders, fair-share, essential tags) even when the modal remained closed.
  - Discovered heavy layout calculations (`daysInView`, `gridTemplateColumns`, `totalGridMinWidth`, `dayLayoutMap`) and filter iterations (`reservationsTodayWithBf`, `minorReservationsCount`, `riskAttentionCount`, `displayedFlats`) running unconditionally on every render despite being hidden when `modalOnly`.
  - Discovered polling in `pms-calendar.tsx` was fixed at 4s and kept firing `setInterval` even when `document.hidden` was true.
  - Designed clean `React.lazy` on-demand mounting strategy with `isModalMounted`, `autoOpenNewRes`, 300ms transition unmount, 12s polling interval, active `stopPolling`/`startPolling` on `visibilitychange`, and computational memoization.
- **Unexplored areas**: None. All questions in dispatch and user requirements investigated with exact line numbers and proposed code diffs.

## Key Decisions Made
- Formulated complete proposed diffs for `floating-new-reservation.tsx` and `pms-calendar.tsx` in `handoff.md`.
- Confirmed baseline build executes successfully.

## Artifact Index
- DISPATCH.md — record of incoming task dispatches
- BRIEFING.md — situational awareness and persistent memory
- progress.md — liveness heartbeat
- handoff.md — final 5-component handoff report
