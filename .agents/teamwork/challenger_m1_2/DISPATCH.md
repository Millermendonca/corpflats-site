# Challenger M1-2 Task Assignment

## Objective
Adversarially probe edge cases for Milestone 1: privilege escalation attempts, password reset exploits, idempotency of user migration, and dev-account protections.

## Authoritative References
- ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (read section `## 2026-10-19T02:58:52Z`)
- PROJECT.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_13\PROJECT.md`
- Worker M1 handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md`

## Challenge Tasks
1. Probe privilege escalation:
   - What happens if a user with `role: "admin"` (e.g. `gestor`) tries to create a user with `role: "dev"`? (Must be rejected with 403).
   - What happens if `gestor` tries to edit `admin`'s name or password? (Must be rejected with 403).
   - What happens if `gestor` tries to delete `admin`? (Must be rejected with 403).
2. Probe idempotency of `ensureSystemUsers`:
   - Calling `ensureSystemUsers(db)` multiple times must NOT duplicate users or reset changed passwords.
3. Verify password reset supports both `PATCH` and `POST` methods on `/api/admin/users/:id/reset-password`.
4. Run pinpoint test `node --test tests/auth-roles-permissions.test.mjs`. (Do NOT run batch sweeps per AGENTS.md).
5. Report empirical findings and verdict (APPROVE or REQUEST_CHANGES) in `handoff.md` and message the orchestrator.
