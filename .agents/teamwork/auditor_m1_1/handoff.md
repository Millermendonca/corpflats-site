# Forensic Audit & Adversarial Challenge Report — Milestone M1

**Target**: Milestone M1 — Backend Core: System Actions API, Tariff Engine & Autonomous Pipeline  
**Auditor**: Forensic Auditor (`auditor_m1_1`)  
**Timestamp**: 2026-10-11T01:21:00Z  
**Authoritative Request**: `.agents/teamwork/ORIGINAL_REQUEST.md` (Integrity Mode: `development`)  
**Scope Reference**: `.agents/teamwork/orchestrator_4/PROJECT.md`  
**Worker Deliverable**: `.agents/teamwork/worker_m1/handoff.md`  

---

## Forensic Audit Report

**Work Product**: Milestone M1 (Endpoints `/api/bot-actions/*`, `/api/tariffs/*`, `calculateDailyRate`, `calculateSebraeSustainableRate`, `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/tariff-engine.test.mjs`, `tests/bot-actions-api.test.mjs`)  
**Profile**: General Project  
**Integrity Mode**: Development Mode (lenient — strict on no hardcoded test results, no facades, no fabricated verification)  
**Verdict**: **CLEAN**

### Phase Results
- **Hardcoded Output Detection**: **PASS** — Source inspection of `calculateSebraeSustainableRate()`, `calculateDailyRate()`, and all 7 REST endpoints confirmed no test-specific string matching or hardcoded values. Calculations use dynamic accounting formulas and DB parameters.
- **Facade Detection**: **PASS** — Implementations execute real business logic: seasonal markup, weekend multipliers, 4-tier override hierarchy, conflict detection across reservations and room blocks, official BACEN EMV BR Code generation, and atomic persistence.
- **Test Authenticity & Mock Shortcuts**: **PASS** — Test suites run against an isolated Node process and live HTTP endpoints without `if (test)` shortcuts or fake test-mode branches.
- **Pre-populated Artifact Detection**: **PASS** — Workspace search revealed no pre-fabricated log artifacts or pre-generated test attestations.
- **Twin-Server Parity Mandate**: **PASS** — Both `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` have an identical SHA-256 checksum (`94eb8b53400df3cbdbc9f19ee641f276aac1e4a11bdd98c4854a38afa1c0d557`) and exact byte match (1,282,011 bytes).
- **Independent Behavioral Verification**: **PASS** — 100% of project test suites executed independently and passed (8/8 on `tariff-engine.test.mjs`, 5/5 on `bot-actions-api.test.mjs`).
- **Repository Standards & AGENTS.md Compliance**: **PASS** — Commit `ab9386d` successfully pushed to `origin main`, frontend build compiled with 0 errors via Vite, and `artifacts/limpeza/dist/` included.

---

## 5-Component Handoff Report

### 1. Observation

1. **SHA-256 Twin Server Parity Verification**:
   ```
   File 1: artifacts/api-server/demo-server.mjs
   File 2: scripts/demo-server.mjs
   SHA-256: 94eb8b53400df3cbdbc9f19ee641f276aac1e4a11bdd98c4854a38afa1c0d557
   Length: 1,282,011 bytes
   Identical: true
   ```

2. **Automated Test Execution Output**:
   - `node --test tests/tariff-engine.test.mjs`:
     ```
     # tests 8
     # suites 1
     # pass 8
     # fail 0
     # cancelled 0
     # skipped 0
     # duration_ms 4192.7894
     ```
   - `node --test tests/bot-actions-api.test.mjs`:
     ```
     # tests 5
     # suites 1
     # pass 5
     # fail 0
     # cancelled 0
     # skipped 0
     # duration_ms 4904.7341
     ```

3. **Mathematical Verification of SEBRAE Pricing Engine**:
   - Tested month-by-month calculation of `calculateSebraeSustainableRate()`:
     - Base Sustainable Rate: R$ 163,43 (Cost per occupied UH R$ 93,16 / denominator 0,57).
     - Jan / Jul / Dec (+15% Alta): R$ 187,95 (163,43 × 1,15 = 187,9445 -> 187,95).
     - Apr / May (-10% Baixa): R$ 147,09 (163,43 × 0,90 = 147,087 -> 147,09).
     - Other months (Média): R$ 163,43.
   - Channel markups applied dynamically:
     - Direct: R$ 163,43
     - Airbnb (+15%): R$ 187,94
     - Booking (+18%): R$ 192,85

4. **BACEN BR Code Compliance**:
   - Evaluated `generateStaticPixPayload()`: Generated payload begins with EMV ID `00020126360014br.gov.bcb.pix0114479648130001655204...` and ends with valid CRC16-CCITT checksum tag `6304`.

5. **Git Repository & Remote State**:
   - Branch `main` is up to date with `origin/main`.
   - Commit `ab9386d` (`feat(m1): implement Bot Actions API, master switch and Tariff Engine with SEBRAE pricing`) pushed to GitHub remote.
   - Vite production build in `artifacts/limpeza` finished with 0 errors (`built in 56.48s`).

---

### 2. Logic Chain

1. **Integrity Rule Compliance**:
   Under Development Mode (from `ORIGINAL_REQUEST.md`), the prohibition covers hardcoded test results, facade implementations, and fabricated verification outputs.
   - Inspection of `artifacts/api-server/demo-server.mjs` lines 19630 to 20585 reveals that the Tariff Engine and Bot Actions endpoints implement complete logic, input validation, state transitions in `db.reservations`, and error handling without fake bypasses.
   - No mock flags or `process.env.NODE_ENV === "test"` conditional shortcuts exist in the M1 routes.

2. **Twin Mirror Parity Mandate**:
   - Both `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` share identical SHA-256 hashes (`94eb8b53400df3cbdbc9f19ee641f276aac1e4a11bdd98c4854a38afa1c0d557`).
   - The mandate is fully met for the deliverable.

3. **Behavioral & Test Authenticity**:
   - All 13 tests across the two official test suites execute against actual server instances running on dedicated loopback ports (3995 and 3996) with temporary databases. Every endpoint responds with genuine JSON payloads verified by assertions.

---

### 3. Caveats & Adversarial Findings

1. **Async Concurrency Race Condition in `POST /api/bot-actions/pre-reserve`**:
   - **Vulnerability**: In `demo-server.mjs` lines 20421–20490, the conflict check against `db.reservations` occurs before generating the QR code:
     ```javascript
     const hasConflict = (db.reservations || []).some(...);
     if (hasConflict) return res.status(409).json(...);
     // ...
     const qrCodeBase64 = await QRCode.toDataURL(pixPayload); // <-- ASYNC YIELD!
     // ...
     db.reservations.unshift(newReservation);
     ```
   - **Empirical Proof**: In `tests/challenger-m1-adversarial.test.mjs`, when two concurrent HTTP requests arrive simultaneously for the exact same flat and dates, both requests pass the `hasConflict` check during the asynchronous `await QRCode.toDataURL(pixPayload)` pause. Both return HTTP 200 OK, creating overlapping active pre-reservations (double-booking).
   - **Impact**: Under burst concurrency (e.g., bot receiving rapid double-clicks), two pre-reservations could be assigned to the same room before payment.
   - **Recommended Mitigation**: Insert a provisional reservation lock synchronously into `db.reservations` or an in-memory lock map *before* awaiting the QR code, or generate the QR code synchronously/lazily.

2. **In-Memory State vs Direct Disk Mutation**:
   - The server maintains its primary database state in memory (`db`) and flushes to disk via `saveDatabase()`. Direct modifications to the JSON file on disk by external test harnesses while the server is running are not recognized unless a reload is triggered. This is an expected architectural characteristic of CorpFlats, not a bug.

3. **Pre-existing Diff in `whatsapp-ai-service.mjs`**:
   - Notice that `artifacts/api-server/whatsapp-ai-service.mjs` and `scripts/whatsapp-ai-service.mjs` have a pre-existing 2-line difference from an earlier commit (`0d735dd`). This file belongs to the scope of Milestone M2 and must be synced during M2 execution.

---

### 4. Conclusion

The work product for **Milestone M1** is **AUTHENTIC, FUNCTIONAL, AND STRICTLY COMPLIANT** with the authoritative requirements:
- **Verdict**: **CLEAN** (No integrity violations).
- **Parity Mandate**: Strictly fulfilled for `demo-server.mjs`.
- **Repository Policy**: Followed (`git push` executed, build verified).
- **Adversarial Assessment**: Robust under single-flight operations, with 1 concurrency race condition identified for operational hardening.

---

### 5. Verification Method

To independently verify all findings:

1. **Verify Twin Server SHA-256 Parity**:
   ```powershell
   node -e "const fs = require('fs'), crypto = require('crypto'); const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/demo-server.mjs')).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('scripts/demo-server.mjs')).digest('hex'); console.log('Parity:', h1 === h2, 'Hash:', h1);"
   ```
   *Expected Output*: `Parity: true` with hash `94eb8b53400df3cbdbc9f19ee641f276aac1e4a11bdd98c4854a38afa1c0d557`.

2. **Run Tariff Engine Test Suite**:
   ```powershell
   node --test tests/tariff-engine.test.mjs
   ```
   *Expected Output*: 8 passed, 0 failed.

3. **Run Bot Actions API Test Suite**:
   ```powershell
   node --test tests/bot-actions-api.test.mjs
   ```
   *Expected Output*: 5 passed, 0 failed.

4. **Verify Frontend Production Build**:
   ```powershell
   cd artifacts/limpeza; npm run build
   ```
   *Expected Output*: Vite build completes with code 0.

---

## Adversarial Challenge Report

### Challenge Summary
**Overall Risk Assessment**: **LOW / MEDIUM** (Integrity is clean; functional race condition identified under concurrent burst).

### Challenges

#### [Medium] Challenge 1: Async Event Loop Yield during Pre-Reservation QR Code Generation
- **Assumption Challenged**: Sequential execution assumes no conflicting pre-reservation can be accepted between availability check and persistence.
- **Attack Scenario**: Two guests or bot conversations simultaneously request the final available flat for the same weekend.
- **Blast Radius**: Double-booking of the same flat during the 30-minute provisional hold window.
- **Mitigation**: Move `db.reservations.unshift(newReservation)` before `await QRCode.toDataURL(pixPayload)`, or use an in-memory lock on `flatId + checkIn + checkOut`.

#### [Low] Challenge 2: WhatsApp Channel Aliasing & Unknown Channels
- **Assumption Challenged**: Non-standard channel names might bypass markups or throw unhandled exceptions.
- **Attack Scenario**: Requesting quote with `channel: "expedia"` or `channel: "  BOOKING  "`.
- **Actual Behavior**: Handled robustly. Trimming and lowercasing normalizes `'  BOOKING  '` to `booking` (+18%), and unknown channels gracefully fall back to direct rate without crashing.

### Stress Test Results

| Scenario | Input | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Unknown Channel | `channel: "expedia"` | Fallback to base rate | Returned R$ 163,43 | PASS |
| Channel Normalization | `channel: "  BOOKING  "` | Equal to `booking` (+18%) | Returned R$ 192,85 | PASS |
| Leap Year Calculation | `date: "2028-02-29"` | Valid rate calculation | Returned R$ 163,43 | PASS |
| Non-existent Flat ID | `flatId: 999999` | Fallback to global rate | Returned R$ 163,43 | PASS |
| Denominator Floor | Zero fixed costs, 99% margin | Floor at 0.1, no division by zero | Denominator capped at 0.1 | PASS |
| Concurrent Burst Pre-Reserve | 2 concurrent POSTs on same UH | 1st returns 200, 2nd returns 409 | Both returned 200 due to async yield | FAILED (Documented in Challenge 1) |
| Expired Pre-Reservation Release | In-memory `expiresAt < now` | Flat unlocked in availability | Flat unlocked and status -> "expirada" | PASS |
| BACEN BR Code Compliance | Amount R$ 150,50 | Valid EMV payload & CRC16 | Valid CRC16 tag `6304` | PASS |
