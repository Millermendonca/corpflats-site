# BRIEFING — 2026-10-11T14:59:00Z

## Mission
Implement Milestone 2: Re-Signature Invalidation, Clearance & Operational Synchronization across CorpFlats demo-server and services.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker_1
- Original parent: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c
- Milestone: Milestone 2 - Re-Signature Operations & Operational Sync

## 🔒 Key Constraints
- Exclusive file ownership: `scripts/demo-server.mjs`, `artifacts/api-server/demo-server.mjs`, `scripts/zapi-service.mjs`, `artifacts/api-server/zapi-service.mjs`, `tests/m2-re-signature-operations-sync.test.mjs`.
- 100% SHA-256 twin parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` (and zapi-service if modified).
- AGENTS.md compliance: strictly run only targeted tests (`node --test tests/m2-re-signature-operations-sync.test.mjs` and `tests/m1-reservation-modification-settlement.test.mjs`). Never run test sweeps or batch tests.
- Git commit followed immediately by `git push` to origin main.
- Strict integrity mandate: no fake mocks or hardcoded test returns. Genuine logic throughout.

## Current Parent
- Conversation ID: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c
- Updated: not yet

## Task Summary
- **What to build**:
  1. `invalidateReservationCheckinSignatures(r, reason)` helper and wiring into `PUT /api/pms/reservations/:id`, `commitPendingModification`, and `POST /modify`.
  2. Pre-checkin clearance & FNRH PDF regeneration in `POST /api/pms/pre-checkin` with reception email delivery.
  3. Dynamic check-in URL tag `?resign=1` and automated re-signature notifications (WhatsApp + Email) via `dispatchReservationReSignatureNotifications`.
  4. Reception panel synchronization: `GET /api/reception/today` badge and blockage in `POST /api/reception/checkin/:reservationId`.
  5. Schedulers synchronization: morning email date clearance on check-in date change, breakfast cancellation outside stay window / flat transfer, cleaning requests update.
  6. Unit & integration test suite in `tests/m2-re-signature-operations-sync.test.mjs`.
  7. Exact twin-server sync and git push.
- **Success criteria**:
  All M2 invariants pass in `tests/m2-re-signature-operations-sync.test.mjs`, M1 tests pass without regression, zero linter errors, SHA-256 parity verified.
- **Interface contracts**: `PROJECT.md`
- **Code layout**: `PROJECT.md`

## Change Tracker
- **Files modified**:
  - `scripts/zapi-service.mjs`: Added `?resign=1` URL tagging in `getCheckinUrlSync` and enabled email mirror delivery when Z-API disabled.
  - `artifacts/api-server/zapi-service.mjs`: Bit-exact mirror (SHA-256 matched).
  - `scripts/demo-server.mjs`: Implemented `invalidateReservationCheckinSignatures`, route wiring, pre-checkin clearance & FNRH PDF regeneration, `dispatchReservationReSignatureNotifications`, reception panel today badge and check-in blocking, and schedulers sync (morning email, breakfast, housekeeping).
  - `artifacts/api-server/demo-server.mjs`: Bit-exact mirror (SHA-256 matched).
  - `tests/m2-re-signature-operations-sync.test.mjs`: End-to-end test suite for Milestone 2 with 7 tests.
- **Build status**: Pass (node --check passed, tests passed 7/7).
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (M2 suite: 7/7 pass; M1 regression suite: 15/15 pass).
- **Lint status**: 0 syntax/runtime errors.
- **Tests added/modified**: `tests/m2-re-signature-operations-sync.test.mjs` (7 test cases).

## Loaded Skills
- None required to load externally.

## Key Decisions Made
- Re-used and extended `invalidateReservationCheckinSignatures` to cover all invalidation surfaces and prevent field overwriting.
- Ensured reception notification fires immediately on re-signature with `[RE-ASSINATURA CHECK-IN]` subject even for future check-ins, while reserving `morningEmailSentDate` for the day of check-in at 07:00.
- Added direct digital form bypass for Gov.br when `resign=1` so guest re-signs the updated terms without OAuth re-auth loop.
- Ensured 100% byte-for-byte SHA-256 parity across all twin server files.

## Artifact Index
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker_1\DISPATCH.md` — Dispatch record
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker_1\BRIEFING.md` — Situational awareness
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker_1\progress.md` — Progress tracker
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_worker_1\handoff.md` — Final handoff report
- `tests/m2-re-signature-operations-sync.test.mjs` — Test suite for Milestone 2

