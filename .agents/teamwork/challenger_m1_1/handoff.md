# Challenger Report: Milestone 1 — Auth, Roles & Parity Clearance

**Agent**: `challenger_m1_1` (teamwork_preview_challenger)  
**Date**: 2026-10-19  
**Workspace**: `.agents/teamwork/challenger_m1_1/`  
**Recipient**: Project Orchestrator (`c4864abd-776b-4ad1-aef9-25c7af7463df`)  
**Verdict**: **REQUEST_CHANGES** ❌

---

## 1. Observation

### Observation 1.1: Test Suite Failure (`node --test tests/auth-roles-permissions.test.mjs`)
Running the mandatory pinpoint verification test produced an exit code 1 with a failing assertion:
```
TAP version 13
# Subtest: Milestone 1 — Auth, Roles & RBAC Separation Suite
    # Subtest: File Parity: artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
    not ok 1 - File Parity: artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256
      ---
      duration_ms: 20.9964
      location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/auth-roles-permissions.test.mjs:35:3'
      failureType: 'testCodeFailure'
      error: 'demo-server twin files must have matching SHA-256 hashes'
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: '33c17537913a1f3b5509489c387106b8a0ffdbb959fddd3a9b0df578e310d9da'
      actual: 'd9a25d2f78e89e9b38869af6dca00ceebabdda67ebb079b55af319b899c05b29'
      operator: 'strictEqual'
...
# tests 6
# suites 2
# pass 5
# fail 1
# duration_ms 4590.1336
```

### Observation 1.2: SHA-256 Hash Mismatch
Independent calculation using PowerShell `Get-FileHash` reveals divergent hashes:
- `artifacts/api-server/demo-server.mjs`: `D9A25D2F78E89E9B38869AF6DCA00CEEBABDDA67EBB079B55AF319B899C05B29`
- `scripts/demo-server.mjs`: `33C17537913A1F3B5509489C387106B8A0FFDBB959FDDD3A9B0DF578E310D9DA`
- Result: **MISMATCH**.

### Observation 1.3: Origin of Desynchronization
Inspection of `git log` and `git diff` confirms:
1. At commit `a2717eb` (`fix(auth): ensure immediate synchronous persistence upon ensureSystemUsers migration`), both files were synchronized pointing to identical git blob `35a1251c25fc95f95d98c537fead0fbb589b6d93`.
2. Commit `035c16e1b22260960f8f9f7d29b50ed6397e972e` (`fix(payments): prioritize credit card / mpPaymentId over pre-generated pixTxId in receipts and portal`) committed changes to `scripts/demo-server.mjs` (+247 lines, -66 lines) without mirroring them to `artifacts/api-server/demo-server.mjs`.
3. Consequently, `scripts/demo-server.mjs` contains payment and receipt updates that are missing in `artifacts/api-server/demo-server.mjs`.

### Observation 1.4: Empirical RBAC & Privilege Escalation Probes (Passed)
Beyond the broken twin parity, adversarial probing on the RBAC architecture confirmed solid security defenses:
1. **User Identity & Initial Role Migration**:
   - `admin` receives `role: "dev"` on authentication.
   - `gestor` (`role: "admin"`, name: `"Administração CorpFlats"`) is initialized idempotently.
2. **Technical Route Barrier (Gestor Forbidden)**:
   - Probing 22 technical routes as `gestor` returned **HTTP 403 Forbidden** on all 22:
     - `/api/whatsapp/config`
     - `/api/whatsapp/qr-code`
     - `/api/whatsapp/connection-logs`
     - `/api/whatsapp/concierge-logs`
     - `/api/whatsapp/sync-webhooks`
     - `/api/whatsapp/test-disconnection-alert`
     - `/api/whatsapp/queue/cancel-real-guests`
     - `/api/settings/gemini`
     - `/api/settings/email`
     - `/api/storage/config`
     - `/api/storage/cleanup-old-docs`
     - `/api/integrations/microsoft-graph/config`
     - `/api/integrations/inter/config`
     - `/api/integrations/inter/test-connection`
     - `/api/integrations/mercadopago/config`
     - `/api/admin/server-monitor`
     - `/api/admin/server-monitor/live`
     - `/api/shopping-list/ai-test`
     - `/api/audit-logs`
     - `/api/audit-logs/export`
     - `/api/admin/reset-cleaning-cache`
     - `/api/reservations/clear-all`
3. **Privilege Escalation Barriers**:
   - Gestor attempting `POST /api/admin/users` with `role: "dev"` -> HTTP 403.
   - Gestor attempting `PATCH /api/admin/users/:id` to promote any user to `dev` -> HTTP 403.
   - Gestor attempting `PATCH /api/admin/users/:gestorId` to promote self to `dev` -> HTTP 403.
   - Gestor attempting `PATCH /api/admin/users/1` (modifying dev account) -> HTTP 403.
   - Gestor attempting `PATCH` or `POST` to `/api/admin/users/1/reset-password` -> HTTP 403.
   - Gestor attempting `DELETE /api/admin/users/1` -> HTTP 403.
   - Gestor attempting `DELETE /api/admin/users/:gestorId` (self-deletion) -> HTTP 400.
4. **Operational Endpoints Autonomy**:
   - Gestor accesses `/api/pms/calendar`, `/api/finance/overview`, `/api/admin/users`, `/api/nfse/retry-queue`, and `/api/cleaning/history` with HTTP 200 OK.
5. **Path Traversal & Trailing Slash Probing**:
   - Requests to `/api/audit-logs/`, `/api/settings/gemini/`, `/api/whatsapp/config/` returned 403 or 404, never leaking internal state.
6. **Unauthenticated Probing**:
   - Requests without session cookies to protected endpoints returned HTTP 403/401.

---

## 2. Logic Chain

1. **Rule of Twin Parity**: The project specification and `ORIGINAL_REQUEST.md` (section `## 2026-10-19T02:58:52Z`) strictly require bit-for-bit parity (`scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs possuem hash SHA-256 idêntico`).
2. **Direct Test Evidence**: Running `node --test tests/auth-roles-permissions.test.mjs` explicitly executes subtest 1, which compares the SHA-256 hashes of both files.
3. **Failure Invalidation**: Because `scripts/demo-server.mjs` was modified in commit `035c16e` without replicating changes to `artifacts/api-server/demo-server.mjs`, subtest 1 fails with an `AssertionError`, causing the entire process to exit with code 1.
4. **Contradiction with Worker Claim**: `worker_m1/handoff.md` claimed SHA-256 parity was `D9A25D2F78E89E9B38869AF6DCA00CEEBABDDA67EBB079B55AF319B899C05B29` for both files with all 6 tests passing. While that was true at commit `a2717eb`, it is no longer true in the active branch following commit `035c16e`.
5. **Conclusion Deduction**: As an empirical challenger, finding a failing verification test and a broken parity invariant necessitates a verdict of **REQUEST_CHANGES**.

---

## 3. Caveats

- **Security Implementation is Correct**: The core functional requirements of Milestone 1 (RBAC separation, `dev` vs `admin` differentiation, technical endpoint barricade, and privilege escalation guards) are completely implemented and passed all adversarial security probes.
- **Root Cause is Synchronization Only**: The failure is purely caused by the omission of `artifacts/api-server/demo-server.mjs` in commit `035c16e`. Syncing `scripts/demo-server.mjs` into `artifacts/api-server/demo-server.mjs` will immediately restore SHA-256 parity and result in 6/6 tests passing.
- **Reviewer Constraint**: Under the Empirical Challenger contract, I am strictly review-only and cannot edit implementation code directly. A worker agent must execute the sync and commit.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES** ❌

**Actionable Remedy Required**:
1. Synchronize `scripts/demo-server.mjs` to `artifacts/api-server/demo-server.mjs` (or vice-versa as intended by commit `035c16e`).
2. Verify SHA-256 match:
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs -Algorithm SHA256
   ```
3. Re-run `node --test tests/auth-roles-permissions.test.mjs` and confirm 6/6 tests pass with exit code 0.
4. Execute `git commit` and `git push origin main` as mandated by project guidelines.

---

## 5. Verification Method

To independently verify this finding:

1. **Execute Milestone 1 Test**:
   ```powershell
   node --test tests/auth-roles-permissions.test.mjs
   ```
   *Observed*: Exits with code 1, `not ok 1 - File Parity`.

2. **Inspect Hash Divergence**:
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs -Algorithm SHA256
   ```
   *Observed*:
   - `artifacts/api-server/demo-server.mjs`: `D9A25D2F78E89E9B...`
   - `scripts/demo-server.mjs`: `33C17537913A1F3B...`

3. **Verify Git Diff Between Twins**:
   ```powershell
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```
