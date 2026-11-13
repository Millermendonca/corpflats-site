
## 2026-10-14T00:42:53Z
**Context**: Milestone 3 Implementation — Preventive Review Directive
**Content**: Please incorporate the following 3 mandatory items from orchestrator-parent into `m3-ari-sync.test.mjs` and your implementation before completing your handoff:
1. **CRITICAL (AGENTS.md — no background routines/listeners in tests)**:
   In `tests/wbp-integration/m3-ari-sync.test.mjs`, BEFORE `await import("../../artifacts/api-server/demo-server.mjs")` (and at the very top of the file):
   - Set `process.env.NODE_ENV = "test"`;
   - Set `process.env.PORT = String(serverPort)`.
   Without `NODE_ENV = "test"`, line 35811 of `demo-server.mjs` triggers `startMonitoringEngine()` and opens an extra unclosed `httpServer` on port 3000. In `after()`, ensure `serverModule.httpServer` is cleanly closed if open.
2. **Real `data/database.json` Integrity Assertion**:
   Like M2, assert before and after test execution that the real `data/database.json` has identical SHA-256 hash and mtime, proving zero state pollution or leakage.
3. **Mandatory Acceptance Criteria in Simulator (`e2e/wbp-simulator`)**:
   - Verify that `ARIUpdate` (both initial full push and incremental push after PMS reservation create/cancel) arrives at the WBP simulator in ≤ 10s and passes 100% OpenAPI schema validation (`wbpAPI.yaml`).
   - Include test for `variationLimitPct: 0` confirming it rejects/handles 0 as invalid instead of falsy-defaulting silently.
**Action**: Apply these adjustments to your code and test suite, run the targeted test, verify SHA-256 twin parity, commit & push, and submit your handoff.
