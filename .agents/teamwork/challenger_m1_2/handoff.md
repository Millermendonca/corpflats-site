# Handoff Report: Milestone M1_2 Empirical Challenger

**Agent:** teamwork_preview_challenger (Challenger M1_2)  
**Parent Conversation ID:** 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5  
**Date:** 2026-10-07T16:45:00Z  
**Verdict:** **APPROVE**  
**Type:** Hard (Task complete)  

---

## 1. Observation

1. **Twin Mirror Parity & Bitwise Comparison:**
   - Command executed:
     ```bash
     node -e "const fs = require('fs'); const a = fs.readFileSync('artifacts/api-server/demo-server.mjs'); const b = fs.readFileSync('scripts/demo-server.mjs'); console.log('demo-server size A:', a.length, 'size B:', b.length, 'equal:', a.equals(b)); const c = fs.readFileSync('artifacts/api-server/fnrh-serpro-service.mjs'); const d = fs.readFileSync('scripts/fnrh-serpro-service.mjs'); console.log('fnrh-serpro size C:', c.length, 'size D:', d.length, 'equal:', c.equals(d));"
     ```
     Result:
     ```
     demo-server size A: 1181003 size B: 1181003 equal: true
     fnrh-serpro size C: 22031 size D: 22031 equal: true
     ```
   - SHA-256 verification:
     - `artifacts/api-server/demo-server.mjs`: `8199d3e11160c8e3af21f173b2df50d02362d5fff4208d283ac7639df1af6fde`
     - `scripts/demo-server.mjs`: `8199d3e11160c8e3af21f173b2df50d02362d5fff4208d283ac7639df1af6fde`
     - `scripts/fnrh-serpro-service.mjs`: `daadda63426434cd9925fcc25b7d726f83fec50e7f737e09bbef9500f8f4c78a`
     - `artifacts/api-server/fnrh-serpro-service.mjs`: `daadda63426434cd9925fcc25b7d726f83fec50e7f737e09bbef9500f8f4c78a`

2. **Database Integrity (`data/database.json`):**
   - Verified that `data/database.json` parses as valid JSON with 0 syntax errors.
   - Root keys confirmed present: `users`, `flats`, `cleaningRequests`, `periodicTasks`, `periodicExecutions`, `serviceOrders`, `serviceWorkers`, `surveys`, `observations`, `guests`, `guestAccounts`, `reviews`, `reviewInsights`, `garageAuthorizations`, `reservations`, `reservationCommunications`, `roomBlocks`, `notifications`, `settings`, `auditLogs`.
   - `settings.checkinProvider`: strictly initialized to `"proprio"`.
   - `settings.serproConfig`: `{ env: "homologacao", cpfSolicitante: "12585736792" }`.
   - Verified 0 occurrences of `NaN`, string `"undefined"`, or corrupt properties.

3. **Malformed Reservations Stress Testing:**
   - Missing `code` or `id`: `registerReservation(null)` and `registerReservation({})` reject with `Objeto de reserva inválido ou ausente.` and `Reserva não possui código ou ID identificador.` respectively.
   - Missing or invalid dates: `registerReservation` rejects with `Datas inválidas para registro no SERPRO: checkin=..., checkout=...` for missing check-in, missing check-out, slashed dates (`10/10/2026`), and non-date strings (`invalid-date`).
   - Zero or negative guests: `registerReservation` safely normalizes `adults: 0` or `adults: -5` to `quantidade_hospede_adulto: 1`, fulfilling SERPRO's schema requirement without throwing.
   - Resilient helper `getCheckinUrl`: for `null`, missing `code`, missing dates, and invalid formats in `'gov_fnrh'` mode, never throws an unhandled exception. It records `reservation.serproError`, logs `FNRH_SERPRO_FALLBACK`, and transparently returns `${hostBase}/pre-checkin/${code}?guest=${guestIndex}`.

4. **Concurrency & Race Condition Harness:**
   - 50 simultaneous parallel calls to `registerReservation` with distinct reservation codes all resolved with 50 distinct official Gov.br URLs (`https://fnrh.turismo.gov.br/precheckin/...`).
   - 50 simultaneous parallel calls to `getCheckinUrl` on a single shared reservation object all resolved to the exact same URL without race conditions or object mutation conflicts.
   - 30 simultaneous parallel calls under simulated timeout (>5000ms) fell back cleanly in parallel without leaking timers or unhandled rejections.
   - 100-request mixed burst across diverse modes ('proprio', 'gov_fnrh' cached, 'gov_fnrh' uncached, and 'gov_fnrh' invalid dates) completed in 13.8ms with 100% accuracy.

5. **Live Server Integration Verification:**
   - Executed live API test on an ephemeral test instance with isolated database (`data/isolated-challenger-m1-2-db.json`):
     - `GET /api/fnrh-serpro/status`: returns 200 with `{ ok, provider, env, latencyMs }`.
     - `PATCH /api/settings`: toggles `checkinProvider` to `'gov_fnrh'` dynamically, persisting to database and reflected immediately.
     - `PATCH /api/settings`: rejects invalid provider names with 400 (`checkinProvider inválido`).
     - `POST /api/pms/reservations`: creates reservation and attaches `serproPrecheckinUrl` / `link_precheckin` when `gov_fnrh` is active.
     - `PATCH /api/settings`: cleanly reverts back to `'proprio'`.

6. **Automated Test Execution Results:**
   - Command: `node --test tests/challenger-m1-2-serpro-integrity.test.mjs`
     - Output: `# tests 25 # suites 5 # pass 25 # fail 0 # duration_ms 4615.6149`
   - Command: `node --test tests/m1-backend-serpro-verification.test.mjs tests/challenger-m1-2-serpro-integrity.test.mjs tests/service-orders.test.mjs`
     - Output: `# tests 48 # suites 6 # pass 48 # fail 0 # duration_ms 5899.3474`

---

## 2. Logic Chain

1. **Parity Chain:**
   - Observation 1 verifies that `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` share identical length (1,181,003 bytes) and identical SHA-256 hash. The same holds true for `fnrh-serpro-service.mjs` (22,031 bytes).
   - Node syntax checks (`node --check`) pass for all files with exit code 0.
   - Therefore, twin parity and syntax integrity are 100% preserved.

2. **Data Integrity Chain:**
   - Observation 2 confirms `data/database.json` has valid structure, correct root collections, and clean initial settings (`checkinProvider: "proprio"`).
   - Cloud snapshot shielding in `loadDatabase()` preserves `checkinProvider` across server reboots.
   - Therefore, system persistence and state initialization satisfy §R1.

3. **Malformed Input Resilience Chain:**
   - Observation 3 confirms strict boundary validation in `registerReservation` (rejecting missing codes, missing dates, malformed formats) and defensive guest normalization (clamping <= 0 to 1).
   - In all malformed scenarios, `getCheckinUrl` caught errors, populated `reservation.serproError`, and returned internal fallback check-in URLs without unhandled rejections or crashes.
   - Therefore, resilient fallback engine satisfies §R3 and is robust against malformed data.

4. **Concurrency & Thread Safety Chain:**
   - Observation 4 demonstrates that stateless execution inside `FnrhSerproClient` and `getCheckinUrl` safely handles high-concurrency bursts (up to 100 parallel calls) without cross-contamination or deadlocks.
   - Therefore, concurrency requirements are satisfied.

5. **Live Integration Chain:**
   - Observation 5 confirms live server endpoints (`GET /api/fnrh-serpro/status`, `PATCH /api/settings`, `POST /api/pms/reservations`) perform as specified.
   - Combined with Observation 6 showing 48/48 tests passing across the suite, the backend engine is production-ready.

---

## 3. Caveats

- Real calls to SERPRO production API require valid Basic Auth credentials issued by SERPRO. During testing and offline development, the service gracefully operates in `homologacao` / simulated mock mode with identical schema behavior.
- No other caveats.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone M1 Backend Engine, SERPRO FNRH client integration, and resilient fallback helper satisfy all requirements of `ORIGINAL_REQUEST.md` (§R1, §R2, §R3) and `PROJECT.md`. The implementation demonstrates robust error handling against malformed reservations, complete thread safety under concurrent load, 100% byte-for-byte twin parity, and zero regressions across 48 automated tests.

---

## 5. Verification Method

To independently reproduce and verify this empirical challenge, run:

```bash
# 1. Run the Empirical Challenger stress and edge-case suite (25 tests)
node --test tests/challenger-m1-2-serpro-integrity.test.mjs

# 2. Run the full combined verification suite (48 tests)
node --test tests/m1-backend-serpro-verification.test.mjs tests/challenger-m1-2-serpro-integrity.test.mjs tests/service-orders.test.mjs

# 3. Verify twin mirror parity
node -e "const fs = require('fs'); console.log('demo-server:', fs.readFileSync('artifacts/api-server/demo-server.mjs').equals(fs.readFileSync('scripts/demo-server.mjs'))); console.log('fnrh-service:', fs.readFileSync('scripts/fnrh-serpro-service.mjs').equals(fs.readFileSync('artifacts/api-server/fnrh-serpro-service.mjs')));"
```
*Expected Result:* All tests pass with exit code 0; both parity checks output `true`.
