# Task Assignment: Worker M1 Fix (Twin Server Parity Remediation)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative References
- ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (read section `## 2026-10-19T02:58:52Z`)
- Forensic Auditor Report: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m1\handoff.md`
- Remediation Explorer Report: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remediation\analysis.md`
- Remediation Explorer Handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remediation\handoff.md`

## Exclusively Owned Files
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`

## Scope of Work
1. As demonstrated by `explorer_m1_remediation`, `scripts/demo-server.mjs` is the canonical superset containing 100% of M1 auth/dev/admin changes plus the latest payment fixes from `035c16e`.
2. Synchronize `scripts/demo-server.mjs` to `artifacts/api-server/demo-server.mjs`:
   `Copy-Item -Path "scripts/demo-server.mjs" -Destination "artifacts/api-server/demo-server.mjs" -Force`
3. Verify with `Get-FileHash` that both files have the exact identical SHA-256 hash.
4. Execute `node --test tests/auth-roles-permissions.test.mjs` and confirm that all 6 tests pass with exit code 0.
5. Commit and run `git push origin main`.
6. Report results in `handoff.md` and message the orchestrator.
