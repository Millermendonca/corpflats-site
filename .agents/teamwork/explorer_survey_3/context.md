# Explorer Survey 3 Context: Database & Multi-Flat Integrity

- **Project Root**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager`
- **Original Request**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md`
- **Working Directory**: `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_3`
- **Focus**:
  - `data/database.json` and any existing database audit/migration scripts
  - Flat 313: Check-out cleaning on 25/09 (Leonardo Primo, ID 1358) generated dirty, dragged as `isPendingFromPreviousDay`, while current guest (Felipe) departs 02/10. Map out full history and cleaning records.
  - Flat 511: Card ID 1338 with note "Limpeza realizada por Grazi" with `addedBy: admin`, when Grazi was not on schedule. Inspect maid schedules/roster (`users`, `schedules`, etc.).
  - Flat 512 & 712: Reservation `RES-712-0291` allocated to Flat 512 instead of 712. Check `flatId` and `flatNumber` mismatch.
  - Universal audit of all 19 active flats: orphaned/duplicate checkouts, off-schedule maids, and code-flat mismatches.
