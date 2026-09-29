# Context: Worker M1 (Backend Reconciliation Engine)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m1`
- **Project Index**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md`
- **Survey Findings**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_1/survey_backend.md`
- **Exclusive File Ownership**:
  - `artifacts/api-server/demo-server.mjs`
  - `scripts/demo-server.mjs`
- **Tasks**:
  1. Fortify Auto-Reversion Rule in `reconcileUniversalIntegrity()` (lines 1736–1753): Add immunity guards for `markedByAdmin === true`, `isCanonical === true`, `source === "admin_manual"`, `source === "manual"`, `addedBy === "admin"`, or non-null `completedAt` or `assignedUserId`.
  2. Stop Note Poisoning in `reconcileCleaningRequests()` (line 3420): Do NOT copy automated checkout notes into clean records.
  3. Strengthen status patch route `/api/cleaning/assignments/:requestId/status`: Set `markedByAdmin: true` on admin actions, populate `completedAt`, clear auto-gen adminNote when status becomes clean.
  4. Retroactive checkout creation guard in `reconcileUniversalIntegrity()` (lines 1691-1733): If flat was already cleaned (`status: "clean"`) between past checkout and now, do not generate duplicate dirty cleaning.
  5. Sychronize BOTH files: `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` must remain byte-for-byte identical.
  6. Run backend verification (`node scratch/test_dates.mjs` or test runner).
