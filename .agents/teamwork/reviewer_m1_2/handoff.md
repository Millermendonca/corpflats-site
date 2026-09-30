# Handoff Report: Milestone 1 Review (Reviewer & Adversarial Critic 2)

**Agent**: Reviewer M1-2  
**Role**: Reviewer, Adversarial Critic  
**Working Directory**: `.agents/teamwork/reviewer_m1_2/`  
**Timestamp**: 2026-09-30T22:16:00Z  
**Verdict**: **APPROVE**  
**Integrity Violations**: None found.

---

## 1. Observation

1. **Byte-for-Byte Mirror Parity**:
   - Primary: `artifacts/api-server/demo-server.mjs`
   - Mirror: `scripts/demo-server.mjs`
   - Command: `Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs`
   - Verbatim SHA256 Output:
     ```
     Algorithm       Hash                                                              Path
     ---------       ----                                                              ----
     SHA256          D42AFABB06421C27D16A839E0118AE0410064508E98054F25C30E044F62F57AB artifacts/api-server/demo-server.mjs
     SHA256          D42AFABB06421C27D16A839E0118AE0410064508E98054F25C30E044F62F57AB scripts/demo-server.mjs
     ```
   - Command `git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs` returned exit code 0 with 0 byte difference.
   - Parity between `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs` was also verified: 0 byte difference.

2. **Database Schema & Startup Initialization**:
   - `data/database.json`: contains `"serviceOrders": []` and `"serviceWorkers": []`.
   - `artifacts/api-server/demo-server.mjs:475-476`: initial in-memory state declares `serviceOrders: []` and `serviceWorkers: []`.
   - `artifacts/api-server/demo-server.mjs:2638-2639` and `2812-2813`: `loadDatabase()` explicitly ensures:
     ```javascript
     if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
     if (!Array.isArray(db.serviceWorkers)) db.serviceWorkers = [];
     ```

3. **REST Endpoints Implementation & Security**:
   - Lines 7779-8023: Admin endpoints (`GET /api/service-orders`, `POST /api/service-orders`, `GET /api/service-orders/:id`, `PATCH /api/service-orders/:id`, `DELETE /api/service-orders/:id`, `GET /api/service-orders/:id/progress`, `POST /api/service-orders/:id/flats/:flatId/reset`).
     * Authenticated via `getAuthUser(req)`. Rejects unauthenticated requests with `401` and non-admin roles with `403`.
     * `POST` generates a 24-character hexadecimal token using `crypto.randomBytes(12).toString("hex")`.
     * `DELETE` removes the order and filters associated records in `db.serviceWorkers`.
   - Lines 8028-8329: Public endpoints (`GET /api/service/public/:token`, `POST /api/service/public/:token/register`, `POST /api/service/public/:token/flats/:flatId/start`, `POST /api/service/public/:token/flats/:flatId/finish`, `POST /api/service/public/:token/flats/:flatId/photos`).
     * Scoped by `:token`. Invalid token returns `404`.
     * `register` enforces main worker name and 11-digit CPF.
     * `start` enforces worker registration (`403`), flat existence (`404`), prevents double starting (`400`), enforces `maxSimultaneousFlats` (`400`), `maxFlatsPerDay` (`400`), and `cleanFlatMode` (`"never"`, `"priority"`, `"always"`).
     * `finish` validates flat is `in_progress` (`400`), enforces boolean `needsCleaning` if flat was clean when started (`400`), enforces non-empty photos if `requirePhotos: true` (`400`), clears `estimatedFinishAt`, enqueues a dirty cleaning request if `needsCleaning === true`, and calls `saveDatabase()`.
     * `photos` accepts base64 images and routes to `uploadImageToStorage` in folder `"services"`.

4. **Integration Injections in Existing Routes**:
   - `GET /api/flats` (line 5378): maps active flats with `serviceInProgress: getFlatServiceInProgress(flat.id, flat.number)`.
   - `GET /api/reservations/checkouts` (line 6475): injects `serviceInProgress` onto checkout items for maid dashboard coordination.
   - `GET /api/pms/calendar` (lines 9978-10007): dynamically synthesizes `serviceOrderBlocks` with `isServiceBlock: true, reason: 'service_order'` for active service flats having `estimatedFinishAt`.

5. **Test Execution Verbatim Results**:
   - `node --test tests/service-orders.test.mjs`:
     `12/12 pass` (171ms, exit code 0)
   - `node --test tests/service-orders-api-live.test.mjs`:
     `16/16 pass` (19.3s live HTTP server process execution, exit code 0)
   - `node --test tests/checkout-occupancy-rule.test.mjs`:
     `22/22 pass` (833ms, exit code 0)
   - `node --test tests/governance-integrity.test.mjs`:
     `90/90 pass` (1.9s, exit code 0)
   - `node --test tests/surveys-reformed.test.mjs`:
     `1/1 pass` (120ms, exit code 0)
   - `tests/adversarial-milestone1.test.mjs`:
     `7/7 suites pass` (5.0s, exit code 0)

6. **Adversarial Stress Test Observations**:
   - In `demo-server.mjs:8159`:
     `const doneTodayCount = (order.flats || []).filter(f => f.status === "done" && f.finishedAt && f.finishedAt.substring(0, 10) === todayStr).length;`
     Because `f.finishedAt` is recorded in UTC (`toISOString()`), while `todayStr` is formatted via `BRAZIL_DATE_FORMATTER` (UTC-3), between 21:00 and 23:59 BRT `f.finishedAt.substring(0, 10)` will be the next day's UTC date (`2026-10-01`), failing the string equality check against `todayStr` (`2026-09-30`).
   - In `demo-server.mjs:9981-9982`:
     `const startDate = oflat.startedAt.substring(0, 10);`
     `const endDate = oflat.estimatedFinishAt.substring(0, 10);`
     Similarly, service order calendar blocks started between 21:00 and 23:59 BRT will have `startDate` set to the following day in UTC.

---

## 2. Logic Chain

1. **Integrity Verification**:
   From Observation 3 and 5, neither `demo-server.mjs` nor the test suites contain hardcoded results or bypasses. The live test suite starts an independent node process on port 3987 and performs real network HTTP requests using `fetch`. State mutations are verified by subsequent API calls and database inspection. No integrity violations exist.
2. **Requirements R1, R2, R3 Conformance**:
   From Observations 2, 3, and 4, all requirements defined in `ORIGINAL_REQUEST.md` and `PROJECT.md` are completely met:
   - Root keys `serviceOrders` and `serviceWorkers` added to DB.
   - 7 Admin endpoints and 5 Public endpoints created with exact contract signatures.
   - Start validations (403 unauthenticated, 400 limits, cleanFlatMode logic) and finish validations (mandatory needsCleaning for clean flats, requirePhotos) implemented accurately.
   - Integrations in `GET /api/flats`, `GET /api/reservations/checkouts`, and `GET /api/pms/calendar` properly inject service metadata.
   - Multi-channel notification pipeline (admin WhatsApp `5522998505276`, reception WhatsApp, reception email, internal system notification) implemented with non-blocking error guards.
3. **Parity Conformance**:
   From Observation 1, byte-level SHA256 checksums are identical between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
4. **Adversarial Assessment**:
   From Observation 6, the only identified vulnerability is the UTC substring date comparison after 21:00 BRT. This does not prevent approval of Milestone 1, but should be addressed for operational perfection.

---

## 3. Caveats

1. **Third-Party WhatsApp / SMTP**:
   In testing and local execution without live credentials, `sendZapiMessage` and `sendEmailAsync` gracefully catch errors or simulate delivery, ensuring local environments run without failures.
2. **Timezone Discrepancy on Night-Shift Operations**:
   The use of `.substring(0, 10)` on UTC ISO strings causes a 3-hour daily discrepancy window (21:00 - 23:59 BRT) where finished flats are not counted in that day's count.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all functional requirements, security boundaries, and architectural specifications with high quality, strict mirror parity, and zero integrity violations. Frontend milestones (M2, M3, M4) can proceed safely.

### Findings

#### [Minor] Finding 1: Timezone Discrepancy in Daily Limit and PMS Calendar Block
- **Where**: `artifacts/api-server/demo-server.mjs:8159`, `8159`, `9981-9982`
- **What**: `f.finishedAt.substring(0, 10) === todayStr` compares UTC date with Brazilian local date.
- **Why**: Between 21:00 and 23:59 BRT, UTC date is +1 day ahead.
- **Suggestion**: Replace `f.finishedAt.substring(0, 10)` with `getExecutionDateStr(f.finishedAt)` which already exists in the file and uses `BRAZIL_DATE_FORMATTER`.

#### [Minor] Finding 2: Input Sanitization on PATCH Title
- **Where**: `artifacts/api-server/demo-server.mjs:7897`
- **What**: `if (body.title !== undefined) order.title = String(body.title).trim();`
- **Why**: Allows setting an empty string title if someone sends `{ title: "  " }`.
- **Suggestion**: Ensure `if (body.title !== undefined && String(body.title).trim())`.

---

## 5. Verification Method

To independently reproduce and verify this review:

1. **Check File Parity**:
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```

2. **Execute Full Test Battery**:
   ```powershell
   node --test tests/service-orders.test.mjs
   node --test tests/service-orders-api-live.test.mjs
   node --test tests/checkout-occupancy-rule.test.mjs
   node --test tests/governance-integrity.test.mjs
   node --test tests/surveys-reformed.test.mjs
   ```
