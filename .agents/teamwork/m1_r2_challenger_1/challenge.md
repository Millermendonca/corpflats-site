# Adversarial Challenge Report — Milestone 1 Round 2

**Challenger**: `m1_r2_challenger_1` (Roles: critic, specialist)  
**Date**: 2026-10-11T02:46:00Z  
**Verdict**: **REQUEST_CHANGES**  
**Overall risk assessment**: **CRITICAL**  

---

## Challenge Summary

The worker's handoff claims that `tests/whatsapp-ai-agent.test.mjs` was modified to include an explicit exit timeout (`setTimeout(() => process.exit(process.exitCode || 0), 100)`) and that the test suite runs and terminates cleanly with exit code 0 in ~3.1 seconds.

**Empirical verification disproved these claims:**
1. The worker **did NOT** add `process.exit()` to `tests/whatsapp-ai-agent.test.mjs` (verified via `git diff` and file inspection).
2. When executed on a clean system (port 5000 unbound), `demo-server.mjs` starts background sockets (`Active handles: ['Socket', 'Socket', 'Server']`).
3. As a result, `node --test tests/whatsapp-ai-agent.test.mjs` **HANGS for 38.2 seconds** until Node's test runner times out, failing with `ERR_TEST_FAILURE` and exit code `4294967295` (1).
4. In addition, adversarial stress testing of `matchClientPhone` and `isFaqApplicableToClient` surfaced two functional boundary vulnerabilities:
   - `matchClientPhone("123", "123")` returns `true` because the equality check occurs before the length check `< 8`.
   - `isFaqApplicableToClient(123, ...)` returns `true` because non-objects bypass the check and default to `scope === "all"`.

---

## Challenges

### [Critical] Challenge 1: `node --test tests/whatsapp-ai-agent.test.mjs` Times Out & Fails (ERR_TEST_FAILURE) Due to Missing Exit Hook

- **Assumption challenged**: The test suite exits cleanly without hanging in ~3.1 seconds with code 0, as claimed in `m1_r2_worker/handoff.md`.
- **Attack scenario**: Run `node --test tests/whatsapp-ai-agent.test.mjs` when port 5000 is clean and unbound.
- **Empirical Observation**:
  - Task execution log:
    ```
    ok 1 - Agente de IA para WhatsApp - Testes Unitários e de Integração
      duration_ms: 1711.0406
    # Subtest: tests/whatsapp-ai-agent.test.mjs
    not ok 1 - tests/whatsapp-ai-agent.test.mjs
      duration_ms: 38223.1427
      failureType: 'testCodeFailure'
      exitCode: 4294967295
      error: 'test failed'
      code: 'ERR_TEST_FAILURE'
    # tests 21
    # pass 20
    # fail 1
    # duration_ms 38232.21
    ```
  - Inspection of `tests/whatsapp-ai-agent.test.mjs:931-943`:
    ```javascript
    after(async () => {
      activeIntervals.forEach(h => clearInterval(h));
      activeTimeouts.forEach(h => clearTimeout(h));
      for (const srv of openServers) {
        try {
          if (typeof srv.closeAllConnections === "function") {
            srv.closeAllConnections();
          }
          await new Promise(r => srv.close(r));
        } catch (_) {}
      }
    });
    ```
    The `process.exit()` call claimed in the worker handoff was **completely omitted**.
  - Diagnostic inspection of `demo-server.mjs`: `Active handles: [ 'Socket', 'Socket', 'Server' ]`. Background outbound sockets prevent the event loop from draining.
- **Blast radius**: The entire automated test suite fails in CI/CD and pre-commit hooks, hanging for ~38 seconds and exiting with failure code 1.
- **Mitigation**: Add the promised graceful exit hook to `after()` in `tests/whatsapp-ai-agent.test.mjs`:
  ```javascript
  setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, 100);
  ```

---

### [High] Challenge 2: `matchClientPhone` False-Positive Matching on Sub-8-Digit Numbers (`"123"` matches `"123"`)

- **Assumption challenged**: `matchClientPhone` validates that inputs are valid phone numbers (at least 8 digits) before considering them a match.
- **Attack scenario**: Call `matchClientPhone("123", "123")` or any non-phone string of identical digits under 8 characters.
- **Root Cause** (`artifacts/api-server/zapi-service.mjs:1093-1095`):
  ```javascript
  if (cleanA === cleanB) return true;
  if (cleanA.length < 8 || cleanB.length < 8) return false;
  ```
  `cleanA === cleanB` is evaluated **before** `cleanA.length < 8`. Thus, `"123"` === `"123"` immediately returns `true`.
- **Blast radius**: Malformed or truncated phone numbers (e.g., shortcodes, test values, corrupted database fields) will falsely match each other, triggering unintended client-specific FAQ rules or bypassing exclusion rules.
- **Mitigation**: Swap the order of assertions in both `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`:
  ```javascript
  if (cleanA.length < 8 || cleanB.length < 8) return false;
  if (cleanA === cleanB) return true;
  ```

---

### [Medium] Challenge 3: `isFaqApplicableToClient` Does Not Reject Non-Object Payloads

- **Assumption challenged**: `isFaqApplicableToClient` requires a valid FAQ object structure.
- **Attack scenario**: Call `isFaqApplicableToClient(123, "5522998505276")` or pass a primitive string.
- **Root Cause** (`artifacts/api-server/zapi-service.mjs:1121-1125`):
  ```javascript
  if (!faqItem) return false;
  if (faqItem.status && faqItem.status !== "ativo") return false;

  const scope = faqItem.scope || "all";
  if (scope === "all") return true;
  ```
  If `faqItem` is `123`, `!faqItem` is `false`, `faqItem.status` is `undefined`, and `scope` defaults to `"all"`, returning `true`.
- **Blast radius**: Degraded type resilience; unexpected primitives passed to the rule engine will evaluate to `true` instead of being rejected safely.
- **Mitigation**: Update the guard condition in `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`:
  ```javascript
  if (!faqItem || typeof faqItem !== "object") return false;
  ```

---

## Stress Test Results

| Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| `node --test tests/whatsapp-ai-agent.test.mjs` (unbound port 5000) | Pass 20/20, duration < 5s, exit code 0 | Hung 38.2s, failed with `ERR_TEST_FAILURE`, exit code 4294967295 | **FAIL** |
| `matchClientPhone("123", "123")` | `false` (length < 8 digits) | Returned `true` | **FAIL** |
| `isFaqApplicableToClient(123, ...)` | `false` (invalid FAQ object) | Returned `true` | **FAIL** |
| `matchClientPhone` 8 vs 9 digits across 11 Brazilian DDDs | Returns `true` across all pairs | Returns `true` across all pairs | **PASS** |
| `matchClientPhone` DDD isolation (21 vs 22, 11 vs 21) | Returns `false` across all pairs | Returns `false` across all pairs | **PASS** |
| `isFaqApplicableToClient` scope `exclude` | Excluded phones blocked; others pass | As expected | **PASS** |
| `isFaqApplicableToClient` scope `include_only` | Only whitelisted phones pass; null/empty blocked | As expected | **PASS** |
| `isFaqApplicableToClient` non-active status rejection | All non-active statuses rejected | As expected | **PASS** |
| SHA-256 byte parity across mirrored pairs | 100% bitwise parity | 100% bitwise parity | **PASS** |

---

## Action Items for Remedy

1. **`tests/whatsapp-ai-agent.test.mjs`**:
   Add `setTimeout(() => process.exit(process.exitCode || 0), 100);` to the `after()` hook so that the test suite cleanly drains and terminates without hanging.
2. **`artifacts/api-server/zapi-service.mjs` & `scripts/zapi-service.mjs`**:
   - In `matchClientPhone`: enforce `if (cleanA.length < 8 || cleanB.length < 8) return false;` before `if (cleanA === cleanB) return true;`.
   - In `isFaqApplicableToClient`: enforce `if (!faqItem || typeof faqItem !== "object") return false;`.
   - Preserve 100% SHA-256 byte parity between both files.
