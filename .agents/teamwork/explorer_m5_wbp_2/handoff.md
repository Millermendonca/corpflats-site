# Handoff Report — Explorer 2 (Milestone 5)

## 1. Observation

1. **WBP OpenAPI Specification Gaps (`wbpAPI.yaml`)**:
   - `GetMessages` (Lines 3737–3809): In `wbpAPI.yaml`, line 3748 incorrectly demonstrates `verb: RespondMessage` in the example, and line 3804 defines the 200 response strictly as `{ "success": true }` or `response_error`. The message array and field definitions are completely omitted from the OpenAPI schema.
   - `SendMessage` (Lines 3810–3883): Body requires common authentication envelope and accepts `wbp_Message_id: 111` (line 3828). Response is `{ "success": true }` (line 3878).
   - `GetReviews` (Lines 3590–3662): In `wbpAPI.yaml`, line 3601 incorrectly demonstrates `verb: RespondReview` in the example, and line 3658 defines the response schema as `{ "success": true }`. The review array and review attributes are completely omitted.
   - `RespondReview` (Lines 3663–3736): Accepts `wbp_review_id: 111` (line 3681) and returns `{ "success": true }` (line 3730).
   - Documented in `wbp_docs/README.md` (lines 62–63): *"GetReviews e GetMessages não descrevem a resposta; o exemplo de GetReviews usa o verbo RespondReview."*

2. **Existing Chat & Reviews Implementations**:
   - `artifacts/limpeza/src/pages/whatsapp-chat.tsx`: Defines `ChatMessage` (lines 60–76) with fields `{ id, fromMe, sender, senderName, text, timestamp, status, channel }`. Communicates with `/api/whatsapp/chat/conversations` (line 353).
   - `artifacts/limpeza/src/pages/review-insights.tsx`: Defines review management, fetching from `/api/ai/reviews` (line 100), evaluating ratings, calculating sentiment tone (`positive`, `negative`, `neutral`), and sending responses.

3. **Existing Server Routing & Lifecycle in `artifacts/api-server/demo-server.mjs`**:
   - WBP route mounting begins at line 772 and terminates at line 1466 (`/api/wbp/inbox` and `/api/wbp/worker/poll`).
   - Admin authentication helper `getAuthUser(req)` is defined at line 7261, validating session cookie `gfm_session_v2` against `db.users`.
   - Password hashing and verification functions are `hashPassword` (line 666) and `verifyPassword` (line 671) utilizing `crypto.scryptSync(password, salt, 32)`.
   - Security audit logging is handled by `logAuditEvent(payload)` (line 6880) writing to `AUDIT_LOG_FILE` (line 6878).
   - Server startup block (lines 36298–36308):
     ```javascript
     const httpServer = app.listen(PORT, "0.0.0.0", () => {
       console.log(`[Demo Server] API rodando em http://0.0.0.0:${PORT}`);
       setAuditLogger(logAuditEvent);
       if (process.env.NODE_ENV !== "test") {
         startMonitoringEngine();
         if (isWbpEnabled(db)) {
           wbpWorker.start();
           wbpAlertsManager.startDailySummaryScheduler(db);
         }
       }
     });
     ```
   - General switch mode update (`app.post("/api/wbp/mode")`, lines 800–818): starts or stops background engines (`wbpWorker`, `wbpAlertsManager`) when `NODE_ENV !== "test"`.

4. **Existing Simulator Architecture (`e2e/wbp-simulator/`)**:
   - `e2e/wbp-simulator/server.mjs`: Line 192 specifies active endpoints (`HealthCheck`, `SetupProperty`, `GetRoomTypes`, `GetRatePlans`, `ARIUpdate`, `GetBookingList`, `GetBookingId`, `AckBooking`). Verbs `GetMessages`, `SendMessage`, `GetReviews`, and `RespondReview` are currently unhandled and fall through to default 404 (line 187).
   - `e2e/wbp-simulator/schemas/index.mjs`: `validateRequest` (line 71) does not yet include cases for `GetMessages`, `SendMessage`, `GetReviews`, or `RespondReview`, throwing `"Verbo desconhecido ou não suportado"` on line 167.

5. **Twin Parity Status**:
   - Ran `Get-FileHash artifacts/api-server/wbp/*.mjs, scripts/wbp/*.mjs`: 100% of all 10 existing module pairs have matching SHA-256 hashes.
   - Ran `Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs`: Both files have SHA-256 hash `32B711977F78DBD9A88CAC08288A46410E930A53F0A122F4B95ECAD3FE617C60`.

---

## 2. Logic Chain

1. **Isolation of Provisional Features (R7)**:
   - Because upstream WBP documentation and OpenAPI schemas omit response structures for messages and reviews (Observation 1), implementing these directly in core PMS models would risk breaking production workflows.
   - Therefore, isolating them into `artifacts/api-server/wbp/provisional.mjs` behind explicit default-disabled flags (`provisionalMessagesEnabled = false`, `provisionalReviewsEnabled = false`) and returning `{ provisional: true, experimental: true, notice: "..." }` guarantees compliance with R1 (safety) and R7 (provisional adapters).

2. **Server Route Mounting**:
   - The backend routes required by Milestone 5 must connect to `CreditCardVault` (`vault.mjs`) and `WbpProvisionalAdapter` (`provisional.mjs`).
   - Placing these routes in `demo-server.mjs` directly after the existing WBP routes (line 1466) provides clean, centralized route discovery.
   - For `POST /api/wbp/vault/reauth`: verifying `user.role === "admin"` via `db.users` and `verifyPassword` (Observation 3) ensures that only authenticated administrators can receive the 5-minute single-use token, satisfying R6 without altering normal login for other roles.
   - For `POST /api/wbp/vault/view`: consuming the token immediately upon arrival guarantees single-use semantics; calling `logAuditEvent` logs the view event without leaking full PAN or CVV.
   - For `POST /api/wbp/vault/purge`: calling `vault.purgeExpiredCards` removes cards 7 days post-checkout and upon non-penalty cancellation, satisfying R6 auto-purge rules.

3. **Lifecycle & Schedulers**:
   - The card auto-purge scheduler must run daily.
   - Following the pattern in Observation 3 (lines 805–812 and 36301–36307), `startCardAutoPurgeScheduler(db, vault)` must be guarded by `if (process.env.NODE_ENV !== "test")` during server startup and toggled on/off in `POST /api/wbp/mode`.
   - Calling `.unref()` on the timer ensures that background CLI commands, tests, or shutdown signals are never blocked by the 24-hour interval.

4. **Simulator Alignment**:
   - To achieve the acceptance criteria (*"Mensagens e Avaliações estão implementadas atrás de um adaptador, desligadas por padrão, com testes contra o simulador"*), `e2e/wbp-simulator/server.mjs` and `e2e/wbp-simulator/schemas/index.mjs` must register and validate `GetMessages`, `SendMessage`, `GetReviews`, and `RespondReview`, tolerating documented OpenAPI errata (Observation 1).

5. **Twin Parity Enforcement**:
   - To maintain the 100% SHA-256 match observed across all files (Observation 5), every addition to `artifacts/api-server/wbp/provisional.mjs`, `artifacts/api-server/wbp/config.mjs`, and `artifacts/api-server/demo-server.mjs` must be copied to `scripts/` and asserted in the test suite.

---

## 3. Caveats

1. **WBP Live API Message Formats**: Because live WebBookingPro credentials do not yet exist, all message and review adapter tests run against the local OpenAPI-compliant simulator. When live credentials become available, real payloads from channels (Booking/Airbnb) must be reconciled with our provisional mapping.
2. **Explorer 1 Coordination**: Explorer 1 is designing `vault.mjs`. The method names (`createReauthToken`, `consumeReauthToken`, `decryptCardByIdentifier`, `purgeExpiredCards`) referenced in our mounting blueprint are standardized against `PROJECT.md` interface contracts, but the Worker must ensure exact symbol parity when implementing both files.
3. **Audit Log Masking**: The audit log must NEVER record cleartext PAN or CVV. The route implementation must explicitly verify that `logAuditEvent` receives only `maskedPan` (`•••• •••• •••• 1234`).

---

## 4. Conclusion

The architectural blueprint for Milestone 5 Feature 27 and Server Mounting is completely formulated and actionable:
1. `artifacts/api-server/wbp/provisional.mjs` (mirrored in `scripts/wbp/provisional.mjs`) encapsulates the provisional chat and review bridges, toggled OFF by default and gated by the general switch.
2. `artifacts/api-server/demo-server.mjs` (mirrored in `scripts/demo-server.mjs`) mounts the 3 Card Vault endpoints (`/reauth`, `/view`, `/purge`) and 5 Provisional endpoints (`/messages`, `/messages/send`, `/reviews`, `/reviews/respond`, `/settings`).
3. Server startup wires `startCardAutoPurgeScheduler` guarded by `NODE_ENV !== "test"` with `.unref()` timers.
4. `e2e/wbp-simulator/` receives the 4 missing endpoints and schema validation.
5. Twin file parity is strictly verified via automated SHA-256 hash checks.

---

## 5. Verification Method

To independently verify this blueprint once implemented:

1. **Twin Parity Check**:
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
   Get-FileHash artifacts/api-server/wbp/provisional.mjs, scripts/wbp/provisional.mjs
   Get-FileHash artifacts/api-server/wbp/vault.mjs, scripts/wbp/vault.mjs
   Get-FileHash artifacts/api-server/wbp/config.mjs, scripts/wbp/config.mjs
   ```
   *Expected result*: Matching SHA-256 hashes for every twin pair.

2. **Targeted Test Execution**:
   Run strictly the targeted Milestone 5 test file:
   ```powershell
   node --test tests/wbp-integration/m5-vault-ui.test.mjs
   ```
   *Expected result*: All test cases pass (Provisional toggles off by default, WBP simulator schema validation passes, admin reauth returns 5-min token, single-use token invalidated on second view, zero CVV in storage/logs, card auto-purge removes expired cards, real `data/database.json` mtime/hash unchanged).

3. **Database & Log Hygiene Inspection**:
   Run grep search for any 16-digit test PANs or CVVs in the test output directory, proving zero occurrences in `data/database.json`, `audit_logs.jsonl`, or API list responses.
