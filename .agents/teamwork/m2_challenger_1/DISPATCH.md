## 2026-10-11T15:27:29Z

You are M2 Challenger 1 for Milestone 2 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_challenger_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md
Worker Handoff: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker_1\handoff.md

Challenger Tasks:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Adversarially stress-test the Re-Signature Lifecycle & Pre-Checkin clearance:
   - Test date/flat alterations via Admin PUT, Portal checkout settlement commit, and Direct Portal modify.
   - Verify that in all 3 pathways, `r.needsReSignature === true`, `r.fnhrCompleted === false`, `r.signatureUrl === null`, and old FNRH links/hashes are deleted.
   - Verify that `getCheckinUrlSync` dynamically appends `?resign=1` when `needsReSignature === true`.
   - Verify that submitting a new signature via `POST /api/pms/pre-checkin` clears `needsReSignature` back to `false`, sets `fnhrCompleted = true`, and generates a brand new FNRH PDF with fresh SHA-256 hash.
   - Verify that calling `POST /api/pms/pre-checkin` when already signed does not corrupt state.
3. Verify byte-for-byte SHA-256 parity between twin servers.
4. Execute `node --test tests/m2-re-signature-operations-sync.test.mjs`.
5. State your explicit verdict (APPROVE or REQUEST_CHANGES) in `handoff.md` with empirical test evidence. Send completion message when done.
