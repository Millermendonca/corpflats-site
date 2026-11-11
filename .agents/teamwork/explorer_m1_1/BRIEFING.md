# BRIEFING — 2026-11-10T02:14:00Z

## Mission
Detailed technical specification for Feature F1 (Maid Attribution: `resolveMaidCleaningForReservation`) in `maid-automation-service.mjs`.

## 🔒 My Identity
- Archetype: explorer
- Roles: Read-only investigation, technical specification, concrete code design
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_1\
- Original parent: 5c040e5e-c55e-4650-ac48-960c732d710d
- Milestone: M1 (Maid Attribution Engine)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in production source files directly
- Output self-contained handoff.md with 5 components
- Twin-server awareness (`artifacts/api-server/` ↔ `scripts/`)
- Adhere strictly to project conventions in AGENTS.md and PROJECT.md

## Current Parent
- Conversation ID: 5c040e5e-c55e-4650-ac48-960c732d710d
- Updated: 2026-11-10T02:14:00Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`, `PROJECT.md`
  - `artifacts/api-server/maid-automation-service.mjs` (data structures, syncMaidCredits, getMaidPeriodFinances, resolveMaidTemplateTags)
  - `artifacts/api-server/demo-server.mjs` (db.cleaningRequests schema, db.reservations schema, deduplication rules)
  - `artifacts/api-server/zapi-service.mjs` (handleInboundNpsScoreOrComment, syncNpsCommentToReviews, npsResponses structure)
  - `tests/maid-period-finances.test.mjs` (existing test harness and cleaning data conventions)
- **Key findings**:
  - `db.cleaningRequests` records checkout and stayover cleanings with `status: "clean"`, `flatNumber`, `requestDate`, `completedAt`, `assignedUserId`, `assignedUsername`.
  - Manual instructions (`isInstructionOnly`, `isBedAdjustmentOnly`, `source: "manual_instruction"`, `type: "instruction"`) must be strictly excluded.
  - Same-day turnover is cleanly decoupled: preparation cleanings require `requestDate <= checkinDate`, preventing the checkout cleaning of departing guests from being misattributed to them.
  - In-stay stayover cleanings (`isStayover: true`, within `checkinDate <= cDate <= checkoutDate`) are prioritized over prior checkin preparation cleanings.
  - Fallback mechanisms for missing `assignedUserId`: checking `db.maidStatementEntries` and username matching in `db.users`.
- **Unexplored areas**: None for Feature F1. Ready to synthesize specification and unit test cases into handoff.md.

## Key Decisions Made
- Formulate complete production-ready implementation of `resolveMaidCleaningForReservation(db, reservation, options)`.
- Define 8 rigorous unit verification test cases covering all edge cases.

## Artifact Index
- DISPATCH.md — Initial dispatch message
- BRIEFING.md — Persistent context and situational awareness
- progress.md — Liveness heartbeat
- handoff.md — 5-component specification and handoff report
