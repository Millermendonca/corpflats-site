# Handoff Report: Milestone 1 — Adversarial Challenge (Challenger 1)

**Agent**: Challenger M1_1 (Empirical Challenger)  
**Role**: critic, specialist  
**Working Directory**: `.agents/teamwork/challenger_m1_1/`  
**Verdict**: **REQUEST_CHANGES**  
**Timestamp**: 2026-09-30T22:15:00Z  
**Recipient**: Orchestrator / Worker M1 (Backend Data & API)  

---

## 1. Observation

1. **Daily Limit Calculation in `demo-server.mjs:8157-8162` (and mirror `scripts/demo-server.mjs:8157-8162`)**:
   ```javascript
   // 3. Contar flats com status: "done" finalizados hoje pelo prestador → deve ser < maxFlatsPerDay (400 if reached)
   const maxPerDay = Number(order.maxFlatsPerDay) || 4;
   const todayStr = getTodayStr();
   const doneTodayCount = (order.flats || []).filter(f => f.status === "done" && f.finishedAt && f.finishedAt.substring(0, 10) === todayStr).length;
   if (doneTodayCount >= maxPerDay) {
     return res.status(400).json({ error: `Limite diário de apartamentos atingido para hoje (máximo: ${maxPerDay}).` });
   }
   ```

2. **Finish Timestamp Generation in `demo-server.mjs:8240-8242`**:
   ```javascript
   const now = new Date();
   flat.status = "done";
   flat.finishedAt = now.toISOString();
   ```

3. **Date Helper Implementations in `demo-server.mjs:60-76`**:
   ```javascript
   const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
     timeZone: "America/Sao_Paulo",
     year: "numeric",
     month: "2-digit",
     day: "2-digit"
   });

   function getTodayStr() {
     return BRAZIL_DATE_FORMATTER.format(new Date());
   }

   function getExecutionDateStr(isoString) {
     if (!isoString) return getTodayStr();
     try {
       return BRAZIL_DATE_FORMATTER.format(new Date(isoString));
     } catch {
       return isoString.substring(0, 10);
     }
   }
   ```

4. **PMS Calendar Block Date Extraction in `demo-server.mjs:9980-9983`**:
   ```javascript
   if (oflat.status === "in_progress" && oflat.startedAt && oflat.estimatedFinishAt) {
     const startDate = oflat.startedAt.substring(0, 10);
     const endDate = oflat.estimatedFinishAt.substring(0, 10);
     if (startDate <= end && endDate >= start) {
   ```

5. **Empirical Test Execution — Timezone & Midnight Boundary Audit (`node tests/test-midnight-logic-audit.mjs`)**:
   ```
   === TIMEZONE & MIDNIGHT BOUNDARY AUDIT ===
   1. FinishedAt UTC ISO: 2026-10-01T00:30:00.000Z
   2. Naive substring(0, 10): 2026-10-01
   3. Brazil local date at time of check: 2026-09-30
   4. Server's line 8159 match result: false
   ❌ VULNERABILITY CONFIRMED: Line 8159 fails to count flats finished between 21:00 and 23:59:59 Brazil time towards today's daily limit!
   5. Next day Brazil date: 2026-10-01
   6. Next day match result with yesterday's 21:30 flat: true
   ❌ QUOTA THEFT CONFIRMED: Yesterday's late-night flat is erroneously counted against TODAY's daily limit on October 1st!
   7. Correct check with getExecutionDateStr on same day: true
   8. Correct check with getExecutionDateStr on next day: false
   ```

6. **Empirical Test Execution — Calendar Timezone Block Shift (`node tests/test-calendar-timezone-audit.mjs`)**:
   ```
   Naive start date in calendar: 2026-10-01
   Actual Brazil local start date: 2026-09-30
   Does naive block appear in today's PMS calendar? false
   ❌ VULNERABILITY CONFIRMED: A service block active right now (between 21:00 and 23:59 Brazil time) is INVISIBLE in today's PMS calendar!
   Does correct block appear in today's PMS calendar? true
   ```

7. **Empirical Test Execution — 19 Adversarial Live Scenarios (`node --test tests/adversarial-milestone1.test.mjs`)**:
   ```
   TAP version 13
   # Subtest: Adversarial Edge-Case & Boundary Stress Test Suite — Milestone 1 Backend API
       ok 1 - Suite 1: Admin Endpoint Security & Authentication Barriers (401 unauthenticated, 401 malformed tokens/sessions, 403 non-admin roles)
       ok 2 - Suite 2: Token Validation & Injection Attack Resistance (404 invalid/malformed tokens, 400 registration injection/validation, 404 bad flatIds)
       ok 3 - Suite 3: Worker Verification Status Enforcement (403 unverified, 403 cross-order token, 200 verified)
       ok 4 - Suite 4: Concurrency & Max Simultaneous Flats Limits (4.1 limit=1 strictly permits 1; 4.2 limit=2 strictly permits 2; 4.3 duplicate start on same flat strictly permits 1)
       ok 5 - Suite 5: Max Flats Per Day Limits & Day/Midnight Boundary Mechanics
       ok 6 - Suite 6: cleanFlatMode Evaluation & Mandatory needsCleaning Validation (never blocks clean; priority enforces dirty first; clean flat requires boolean needsCleaning)
       ok 7 - Suite 7: Photo Attachment Validation on Finish (requirePhotos=true rejects empty; requirePhotos=false allows empty)
   # tests 19
   # suites 8
   # pass 19
   # fail 0
   ```

---

## 2. Logic Chain

1. From Observation 1, the backend determines whether `maxFlatsPerDay` has been exceeded by evaluating:
   `f.finishedAt && f.finishedAt.substring(0, 10) === todayStr`.
2. From Observation 2, `f.finishedAt` is generated using `now.toISOString()`, which produces a UTC timestamp ending in `Z`.
3. From Observation 3, `todayStr` is computed from `getTodayStr()`, which formats the current moment in the Brazilian timezone `America/Sao_Paulo` (UTC-3).
4. Between 21:00:00 and 23:59:59 local Brazil time (UTC-3), UTC time is already between 00:00:00 and 02:59:59 of the next calendar day (`YYYY-MM-(DD+1)`).
5. For any flat completed during those 3 hours, `f.finishedAt.substring(0, 10)` evaluates to `YYYY-MM-(DD+1)`, while `todayStr` in Brazil evaluates to `YYYY-MM-DD`.
6. Since `YYYY-MM-(DD+1) === YYYY-MM-DD` evaluates to `false`, `doneTodayCount` returns `0` (Observation 5).
7. Consequently, the worker can start and finish an unlimited number of flats during those 3 evening hours without tripping `maxFlatsPerDay`, creating a severe business logic bypass.
8. On the following day in Brazil, `todayStr` transitions to `YYYY-MM-(DD+1)`. At this point, the flat finished the previous evening at 21:30 now has `f.finishedAt.substring(0, 10)` matching `todayStr`, so it is counted as finished *today*, prematurely consuming the worker's quota for the new day before they even begin working (Observation 5).
9. From Observation 4, the exact same UTC date slicing flaw occurs in `GET /api/pms/calendar`:
   `const startDate = oflat.startedAt.substring(0, 10)` extracts the UTC date instead of the Brazil date. Any service flat started between 21:00 and 23:59:59 BRT is placed on tomorrow's calendar, leaving the flat completely unblocked on today's calendar (Observation 6).
10. The project already has a dedicated function `getExecutionDateStr(isoString)` at line 71 of `demo-server.mjs` designed specifically to convert UTC ISO timestamps into `America/Sao_Paulo` date strings (`YYYY-MM-DD`). Using `getExecutionDateStr` in both locations fixes both vulnerabilities cleanly and completely.
11. From Observation 7, all other Milestone 1 endpoints and security measures (admin authentication, token isolation, input injection handling, concurrency limits with `Promise.all`, cleanFlatMode rules, needsCleaning validation, photo requirements) passed all 19 adversarial tests.

---

## 3. Caveats

1. Concurrency enforcement relies on the single-threaded nature of the Node.js event loop: because the `start` handler performs all checks and sets `flat.status = "in_progress"` synchronously without intermediate `await` expressions, concurrent requests are serialized safely within the process. If multi-instance horizontal scaling were introduced in the future, database-level locking would be required.
2. In the local development environment, Cloudflare R2 and Z-API operate in fallback/sandbox mode as expected.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 1 satisfies the vast majority of its requirements with high fidelity, but suffers from two related timezone boundary defects that violate requirements R3 and R7:

### Actionable Fixes Required by Worker M1:

1. **Fix Daily Limit Timezone Boundary in `demo-server.mjs:8159` (and `scripts/demo-server.mjs:8159`)**:
   Replace:
   ```javascript
   const doneTodayCount = (order.flats || []).filter(f => f.status === "done" && f.finishedAt && f.finishedAt.substring(0, 10) === todayStr).length;
   ```
   With:
   ```javascript
   const doneTodayCount = (order.flats || []).filter(f => f.status === "done" && f.finishedAt && getExecutionDateStr(f.finishedAt) === todayStr).length;
   ```

2. **Fix PMS Calendar Service Block Date Timezone in `demo-server.mjs:9981-9982` (and `scripts/demo-server.mjs:9981-9982`)**:
   Replace:
   ```javascript
   const startDate = oflat.startedAt.substring(0, 10);
   const endDate = oflat.estimatedFinishAt.substring(0, 10);
   ```
   With:
   ```javascript
   const startDate = getExecutionDateStr(oflat.startedAt);
   const endDate = getExecutionDateStr(oflat.estimatedFinishAt);
   ```

3. **Synchronize Mirror**:
   Ensure `scripts/demo-server.mjs` is byte-for-byte identical to `artifacts/api-server/demo-server.mjs`.

---

## 5. Verification Method

To independently reproduce the bugs and verify the fixes:

1. **Reproduce Daily Limit Timezone Flaw**:
   ```powershell
   node tests/test-midnight-logic-audit.mjs
   ```
   *Pass Condition*: Output demonstrates that `getExecutionDateStr` accurately links the same-day finish while naive `substring(0, 10)` fails.

2. **Reproduce PMS Calendar Block Shift**:
   ```powershell
   node tests/test-calendar-timezone-audit.mjs
   ```
   *Pass Condition*: Output demonstrates that `getExecutionDateStr` keeps the block on today's calendar while naive `substring(0, 10)` displaces it to tomorrow.

3. **Run Full Adversarial Test Suite**:
   ```powershell
   node --test tests/adversarial-milestone1.test.mjs
   ```
   *Pass Condition*: All 19 tests pass (TAP 13 format, exit code 0).

4. **Verify Mirror Parity**:
   ```powershell
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```
   *Pass Condition*: 0 bytes difference between files.
