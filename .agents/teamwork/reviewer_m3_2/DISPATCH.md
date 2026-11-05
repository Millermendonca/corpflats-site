# Dispatch — Reviewer M3.2 (Milestone 3 Safety & Integration Reviewer)

## Role
M3 Safety & Operational Invariant Reviewer

## Task Objective
Review the operational safety of autonomous cancellations:
1. Verify `CHECKED_IN_CANCELLATION` invariant: status `'in_house'`, `'checked_in'`, or `checkedInAt` / `actualCheckinTime` must never be cancelled autonomously. Must alert manager with high priority.
2. Verify PMS cancellation cascade: room release, cleaning request deletion/cleanup, breakfast cancellation, and task cancellation.
3. Verify integration in `zoho-mail-service.mjs`: incoming webhook and polling sync paths.
4. Verify twin-server parity: `node scripts/check-twin-parity.mjs` (39/39 files).
5. Run point tests:
   ```powershell
   node tests/b2b-cancellation.test.mjs
   node tests/b2b-voucher-extraction.test.mjs
   node tests/b2b-voucher-dates.test.mjs
   ```

## Output
Deliver `handoff.md` with explicit verdict `APPROVE` or `REQUEST_CHANGES` and send a message to orchestrator upon completion.


## 2026-11-05T15:49:44Z
You are Reviewer M3.2 (Safety & Integration Reviewer) for Milestone 3 in Guest-Flow-Manager.
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m3_2\
Read DISPATCH.md in your working directory and ORIGINAL_REQUEST.md.
Also read Worker M3.1 handoff at c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\teamwork_worker_m3_1\handoff.md.
Review the operational safety of b2b-cancellation-service.mjs (CHECKED_IN_CANCELLATION invariant, cascade, zoho integration).
Run point tests:
node tests/b2b-cancellation.test.mjs
node tests/b2b-voucher-extraction.test.mjs
node tests/b2b-voucher-dates.test.mjs
node scripts/check-twin-parity.mjs
Deliver handoff.md with explicit verdict APPROVE or REQUEST_CHANGES. Send message to orchestrator upon completion.


## 2026-11-05T15:53:54Z
**Context**: Milestone 3 Safety & Integration Review
**Content**: Please note that your assignment is Milestone 3 of the B2B Email Ingestion project (`artifacts/api-server/b2b-cancellation-service.mjs`, `zoho-mail-service.mjs`, and `tests/b2b-cancellation.test.mjs`), as detailed in your `DISPATCH.md`. Please re-initialize your `BRIEFING.md` and `progress.md` for Milestone 3 (ignoring any legacy files from past runs), review `b2b-cancellation-service.mjs` and the cancellation cascade, and deliver `handoff.md`.
**Action**: Please update progress.md and deliver your handoff report once review and point tests pass.
