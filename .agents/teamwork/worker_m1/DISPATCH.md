## 2026-09-29T05:20:00Z

<USER_REQUEST>
You are Worker M1 (Backend Engine Worker) for the Guest-Flow-Manager governance overhaul.
Your working directory is: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
1. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (MANDATORY: read this first!)
2. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md
3. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m1/context.md
4. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_1/survey_backend.md

Exclusive Write Ownership:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`
(Do NOT edit frontend files or database files).

Implementation Tasks:
1. In `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`:
   - Fortify `reconcileUniversalIntegrity()` (lines ~1736-1753): add immunity guards ensuring that if `c.markedByAdmin === true`, `c.isCanonical === true`, `c.source === "admin_manual"`, `c.source === "manual"`, `c.addedBy === "admin"`, or `Boolean(c.completedAt)` or `Boolean(c.assignedUserId)`, the cleaning is NEVER reverted to `dirty`.
   - Prevent note copy-pollution in `reconcileCleaningRequests()` (line ~3420): ensure `cleanItem` does not inherit auto-generated checkout notes like `"Limpeza de check-out gerada automaticamente"`.
   - In `/api/cleaning/assignments/:requestId/status`: when status changes to `clean`, set `markedByAdmin: true` (if admin), ensure `completedAt` is populated, and clear auto-gen adminNote.
   - In `reconcileUniversalIntegrity()` checkout creation (lines ~1691-1733): add check ensuring that if the flat already has a `clean` cleaning between the checkout date and now or next checkin, do NOT create a duplicate dirty checkout cleaning.
2. Ensure BOTH `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` are kept 100% byte-for-byte synchronized!
3. Run backend verification (`node scratch/test_dates.mjs` and syntax/import checks).
4. Write your `handoff.md` and message the orchestrator when complete.
</USER_REQUEST>
