# BRIEFING — 2026-10-07T15:51:00Z

## Mission
Comprehensive survey of all communication channels, triggers, templates, and UI copy actions where check-in URLs are constructed, formatted, or dispatched.

## 🔒 My Identity
- Archetype: explorer
- Roles: survey_messaging, read-only investigator
- Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_messaging_2
- Original parent: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Milestone: Survey & Architectural Mapping (Gov.br / FNRH Check-in Toggle)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source code
- Do NOT run build commands
- Mirror requirement awareness: demo-server.mjs has an exact mirror in scripts/demo-server.mjs
- Output findings to survey_messaging.md and handoff.md in own directory
- Communicate with parent via send_message

## Current Parent
- Conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Updated: not yet

## Investigation State
- **Explored paths**: `artifacts/api-server/zapi-service.mjs`, `artifacts/api-server/demo-server.mjs`, `artifacts/api-server/mail-service.mjs`, `artifacts/api-server/whatsapp-ai-service.mjs`, `scripts/` mirrors, `artifacts/limpeza/src/pages/pms-calendar.tsx`, `artifacts/limpeza/src/components/reservation-hover-card.tsx`, `artifacts/limpeza/src/pages/reception-tablet.tsx`, `artifacts/limpeza/src/hooks/use-quick-messages.ts`, `artifacts/limpeza/src/pages/guest-portal.tsx`, `artifacts/limpeza/src/components/booking-funnel-modal.tsx`, `artifacts/limpeza/src/pages/whatsapp-automation.tsx`, `artifacts/limpeza/src/pages/whatsapp-chat.tsx`.
- **Key findings**: Complete 17-site inventory documented. Central WhatsApp engine builds URLs at `zapi-service.mjs:1395` (text) and `zapi-service.mjs:1756` (action buttons). Button filtering predicate currently excludes checkin buttons using substring `includes("/pre-checkin")` which requires widening to support Gov.br domains. Reception endpoint builds URL at `demo-server.mjs:13781`. UI components in calendar, hover card, and reception tablet build links locally. All sites documented with exact before/after refactoring blueprints in `survey_messaging.md`.
- **Unexplored areas**: None. Complete survey achieved.

## Key Decisions Made
- Outlined full specification for centralized `getCheckinUrl(reservation, guestIndex, baseUrl, db)` with intelligent fallback and audit log warning.
- Identified need for button filtering predicate adjustment in `zapi-service.mjs` so Gov.br URLs are properly recognized and deduplicated as check-in buttons.
- Documented mirror parity requirement across all backend files.

## Artifact Index
- survey_messaging.md — Detailed survey report of messaging channels and checkin URL construction sites
- handoff.md — 5-component handoff report
