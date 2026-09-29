## 2026-09-29T05:35:07Z

You are Worker M3 (Database Integrity Worker) for the Guest-Flow-Manager governance overhaul.
Your working directory is: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
1. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (MANDATORY: read this first!)
2. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md
3. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m3/context.md
4. c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_3/survey_database.md

Exclusive Write Ownership:
- `data/database.json`
(Do NOT edit backend server files or frontend source files).

Implementation Tasks:
1. Backup `data/database.json` before any modifications.
2. Flat 313: Purge phantom cleaning request ID 1358 (Leonardo Primo, 25/09, dirty), which was dragging as false carry-over during Felipe's active stay.
3. Flat 511, 907, 1004 (26/09 Maid Schedule Realignment):
   - In `db.cleaningRequests`: Reassign ID 1338 (Flat 511), ID 1339 (Flat 907), and ID 1340 (Flat 1004) to Cris (`assignedUserId: 2`, `assignedUsername: "Cris"`). Update notes to reflect completion by Cris.
   - In `db.maidStatementEntries`: Delete unearned duplicate credits for Grazi on 26/09 (`stmt_3_1338_20260928`, `stmt_3_1339_20260929`, `stmt_3_1340_20260930`). Re-link Cris's statement entries (`pay_1790528959693_pnzhpy`, `pay_1790528959693_pt1nsb`, `pay_1790528959693_wqst1p`) to the respective cleaning request IDs (1338, 1339, 1340).
4. Flat 512 & 712 Code Mismatch Resolution:
   - In `db.reservations`: On reservation ID 291 (`code: "RES-712-0291"`), fix `flatId: 14` and `flatNumber: "712"`.
   - In `db.cleaningRequests`: On cleaning request ID 1351, fix `flatId: 14`, `flatNumber: "712"`, and update `adminNote` to reference Flat 712.
5. Universal 19-Flat Database Sanitization:
   - Purge/resolve phantom dirty cleanings: ID 1362 (Flat 408, Yan no-show), ID 1364 (Flat 113, Thayla check-out already cleaned by Cris in ID 1335), and ID 1361 (Flat 712, 25/09).
   - Ensure database is valid JSON and audit all 19 flats.
6. Verify database integrity and syntax.
7. Write your `handoff.md` and message the orchestrator when complete.
