# BRIEFING — 2026-10-07T15:58:00Z

## Mission
Investigate frontend architecture (`artifacts/limpeza/src`) for the Admin UI check-in provider toggle and link buttons.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Explorer Survey Frontend
- Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_frontend_2
- Original parent: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Milestone: Survey Frontend Architecture for FNRH/Check-in Provider Toggle & Link Buttons

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or edit source code
- Do NOT run build commands
- Follow 5-component handoff protocol
- All reports and outputs go to own folder: `.agents/teamwork/explorer_survey_frontend_2`

## Current Parent
- Conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Updated: 2026-10-07T15:58:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/limpeza/src/pages/settings.tsx`
  - `artifacts/limpeza/src/pages/property-settings.tsx`
  - `artifacts/limpeza/src/components/ui/switch.tsx`
  - `artifacts/limpeza/src/components/ui/badge.tsx`
  - `artifacts/limpeza/src/components/ui/card.tsx`
  - `artifacts/limpeza/src/components/ui/tabs.tsx`
  - `artifacts/limpeza/src/components/ui/dialog.tsx`
  - `artifacts/limpeza/src/components/reservation-hover-card.tsx`
  - `artifacts/limpeza/src/pages/pms-calendar.tsx`
  - `artifacts/limpeza/src/hooks/use-quick-messages.ts`
  - `artifacts/limpeza/src/pages/reception-tablet.tsx`
  - `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
  - `artifacts/limpeza/src/pages/whatsapp-chat.tsx`
  - `artifacts/limpeza/src/pages/crm-guests.tsx`
  - `artifacts/limpeza/src/pages/guest-portal.tsx`
  - `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`
  - `artifacts/limpeza/vite.config.ts` & `package.json`
- **Key findings**:
  - Settings page uses TanStack Query `useGetSettings()` and `useUpdateSettings()` targeting `/api/settings` (PATCH). Mutating immediately updates cache and re-renders UI without reload.
  - UI has standard `Switch` (@radix-ui/react-switch), `Badge`, and `lucide-react` icons ready for use.
  - Links were hardcoded with string concatenation `/pre-checkin/${code}` in hover card, calendar modal, quick messages, and tablet.
  - Proposed creation of centralized helper `artifacts/limpeza/src/lib/checkin-url.ts` export `getCheckinUrl(reservation, guestIndex, baseUrl)` with automatic fallback.
  - Health check query for SERPRO status endpoint `GET /api/fnrh-serpro/status` polled every 30s.
  - Build pipeline configured in `vite.config.ts` targeting `artifacts/limpeza/dist/public`.
- **Unexplored areas**: None. Frontend survey is 100% complete.

## Key Decisions Made
- Recommends prominent Hero Card in `settings.tsx` under header for Check-in Provider toggle.
- Designed `getCheckinUrl` utility to guarantee single source of truth across all components.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Persistent context & situational awareness
- survey_frontend.md — Comprehensive Frontend Architecture Survey Report
- handoff.md — 5-component handoff report for implementer
