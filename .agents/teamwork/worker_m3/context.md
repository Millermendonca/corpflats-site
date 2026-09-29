# Context: Worker M3 (Database Integrity Sanitization)

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m3`
- **Project Index**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/PROJECT.md`
- **Survey Findings**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_3/survey_database.md`
- **Exclusive File Ownership**:
  - `data/database.json`
- **Tasks**:
  1. Flat 313: Purge phantom cleaning request ID 1358 (Leonardo Primo, 25/09, dirty), which was dragging as false carry-over during Felipe's active stay.
  2. Flat 511, 907, 1004 (26/09 Maid Schedule Realignment):
     - In `db.cleaningRequests`: Reassign ID 1338 (Flat 511), ID 1339 (Flat 907), and ID 1340 (Flat 1004) to Cris (`assignedUserId: 2`, `assignedUsername: "Cris"`). Update notes to reflect completion by Cris.
     - In `db.maidStatementEntries`: Delete unearned duplicate credits for Grazi on 26/09 (`stmt_3_1338_20260928`, `stmt_3_1339_20260929`, `stmt_3_1340_20260930`). Re-link Cris's statement entries (`pay_1790528959693_pnzhpy`, `pay_1790528959693_pt1nsb`, `pay_1790528959693_wqst1p`) to the respective cleaning request IDs (1338, 1339, 1340).
  3. Flat 512 & 712 Code Mismatch Resolution:
     - In `db.reservations`: On reservation ID 291 (`code: "RES-712-0291"`), fix `flatId: 14` and `flatNumber: "712"`.
     - In `db.cleaningRequests`: On cleaning request ID 1351, fix `flatId: 14`, `flatNumber: "712"`, and update `adminNote` to reference Flat 712.
  4. Universal 19-Flat Database Sanitization:
     - Purge/resolve phantom dirty cleanings: ID 1362 (Flat 408, Yan no-show), ID 1364 (Flat 113, Thayla check-out already cleaned by Cris in ID 1335), and ID 1361 (Flat 712, 25/09).
     - Verify database JSON validity, backup creation, and consistency across all 19 flats.
