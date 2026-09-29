# Explorer Survey 1 Context: Backend & Reconciliation Engine

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_1`
- **Focus**:
  - `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`
  - `reconcileUniversalIntegrity` function and all integrity/reconciliation routines
  - Clean-to-dirty loop: Why Flat 512 and other manual/admin cleanings revert from `clean` to `dirty` when `assignedUserId` or `completedAt` are missing
  - How admin manual markings and canonical cleanings can be respected without automatic background reversion
  - Existing backend test scripts and runners
