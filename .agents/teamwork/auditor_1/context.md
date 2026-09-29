# Context: Auditor 1 (Forensic Integrity Auditor)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/auditor_1`
- **Scope Documents**:
  - `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md`
  - `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/TEST_READY.md`
- **Audit Mission**:
  - Perform comprehensive forensic integrity analysis across the entire project.
  - Check for cheating, shortcuts, dummy facades, test mock bypasses, or hardcoded return strings.
  - Verify that all business logic in `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `artifacts/limpeza/src/pages/dashboard.tsx`, `artifacts/limpeza/src/components/flat-card.tsx`, and `data/database.json` is genuine, robust, and permanent.
  - Verify that `git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs` has 0 differences.
  - Verify that tests run genuinely and pass without fabricated results.
  - Deliver structured audit report with binary verdict: CLEAN or INTEGRITY VIOLATION.
