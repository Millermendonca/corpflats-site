# Reviewer M1-2 Task Assignment

## Objective
Independent Review of Milestone 1 (Backend Auth, Roles & Dev Endpoints) focusing on security, regressions, twin parity, and edge cases.

## Authoritative References
- ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (read section `## 2026-10-19T02:58:52Z`)
- PROJECT.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_13\PROJECT.md`
- Worker M1 handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md`

## Review Focus
1. Verify twin server SHA-256 byte-by-byte parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
2. Verify that existing reception and maid flows were not broken by role changes (`recepcao` and `camareira` permissions preserved).
3. Verify that `POST /api/audit-logs/client` is accessible for client log forwarding while `/api/audit-logs` read/export is strictly dev-only.
4. Verify password reset security and hash updates.
5. Run the pinpoint test `node --test tests/auth-roles-permissions.test.mjs`. (Do NOT run batch sweeps per AGENTS.md).
6. State your verdict clearly (APPROVE or REQUEST_CHANGES) in `handoff.md` and message the orchestrator.
