# Handoff Report: Milestone 1 - Sandbox Local Isolado & Interceptadores (R1)

**Agent**: Worker M1 (Implementação do Sandbox Local Isolado & Interceptadores - R1)  
**Recipient**: Orchestrator Lead Architect (`5a1d1171-401e-4601-9229-45485822d731`)  
**Date**: 2026-10-11T01:06:00Z  
**Type**: Hard Handoff (Milestone 1 Complete)  
**Location**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md`

---

## 1. Observation

1. **Created Sandbox Infrastructure (`e2e/sandbox/`)**:
   - `e2e/sandbox/db-seeder.mjs`: Safely clones `data/database.json` into `data/database.test.json`, ensuring all 19 flats (113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304), default users (Admin id: 1, Cris id: 2, Grazi id: 3, Soho id: 4), deterministic sample reservations (`RES-TEST-CHECKIN-TODAY`, `RES-TEST-RETURNING-GUEST`, `RES-TEST-VEHICLE-PERSIST`, `RES-TEST-PIX-PENDING`), and service order (`tok_sandbox_worker_12345`) are populated. Throws error if `testDbPath === prodDbPath`.
   - `e2e/sandbox/mock-zapi.mjs`: Lightweight HTTP mock on port 5056 simulating Z-API endpoints (`send-text`, `send-image`, `send-button-list`, `status`, `device`). Records outbound messages in memory and provides `dispatchIncomingMessage(...)` to simulate received messages into backend `/api/whatsapp/webhook/received`.
   - `e2e/sandbox/mock-smtp.mjs`: Native Node.js RFC 5321 TCP SMTP server on port 5025 intercepting Nodemailer email dispatches. Captures raw text, decodes RFC 2047 MIME headers (`decodeMimeHeader`), and provides `getSentEmails()`, `getLastEmail()`, and `clearSentEmails()`.
   - `e2e/sandbox/pix-simulator.mjs`: Simulates instant PIX settlement via `POST /api/pms/inter/webhook` with `{ pix: [{ txid, valor, horario, endToEndId }] }`, checks payment status via `GET /api/pms/reservations/:code/payment-status`, and simulates QR code expiration.
   - `e2e/sandbox/time-travel.mjs`: Exposes helpers `setTimeTravelHour({ targetHour })`, `setTimeTravelOffset({ offsetMs })`, `setTimeTravelDate({ targetDate })`, `resetTimeTravel()`, and `getTimeTravelStatus()`.
   - `e2e/sandbox/test-server.mjs`: Master lifecycle controller that seeds `database.test.json`, starts Mock Z-API and Mock SMTP, spawns backend on port 5055 with `DATABASE_URL=""`, `DATABASE_FILE=data/database.test.json`, `PORT=5055`, `NODE_ENV=test`, `SERPRO_MOCK=true`, `SMTP_PORT=5025`, waits for `/api/health`, and tears down cleanly with Windows `taskkill /F /T /PID`.
   - `e2e/sandbox/verify-sandbox.mjs`: Automated standalone test runner executing all verification steps.

2. **Backend Enhancements**:
   - `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`:
     - Lines 108–115: Added `getEffectiveDate()` backed by `global.__simulatedTimeOffsetMs` used in `getTodayStr()`.
     - Lines 147–150: Updated `getBrasiliaNow()` to use `getEffectiveDate()`.
     - Lines 262–315: Added `/api/health`, `/api/test/time-travel` (GET and POST), and `/api/test/db-reset` endpoints.
   - `artifacts/api-server/maid-automation-service.mjs` (lines 80–84): Added `global.__simulatedTimeOffsetMs` support to `getBrasiliaNow()`.
   - `artifacts/api-server/zapi-service.mjs` & `scripts/zapi-service.mjs` (lines 3508–3513): Added `global.__simulatedTimeOffsetMs` support to `getBrasiliaNow()`.

3. **Mirror Parity Check**:
   - Command: `powershell -Command "(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash"`
   - Output: `True`.
   - Command: `powershell -Command "(Get-FileHash 'artifacts/api-server/zapi-service.mjs').Hash -eq (Get-FileHash 'scripts/zapi-service.mjs').Hash"`
   - Output: `True`.

4. **Verification Execution Output**:
   Running `node e2e/sandbox/verify-sandbox.mjs` produced:
   ```
   ================================================================================
    CORPFLATS E2E SANDBOX VERIFICATION SUITE (M1 - R1)
   ================================================================================

   [INIT] Production data/database.json SHA-256: e48d5c63205df1a5c12fc484aab37f2611bd2fc351542e0cddd7b372e6948110

   [STEP 1] Starting Isolated Sandbox on port 5055...
   [test-server] Initializing isolated sandbox on port 5055...
   [test-server] Starting Mock Z-API on port 5056...
   [test-server] Starting Mock SMTP on port 5025...
   [test-server] Spawning isolated Express backend (PID pending)...
   [test-server] Isolated backend spawned with PID 8768.
   [test-server] Waiting for backend health at http://127.0.0.1:5055/api/health...
   [test-server] Isolated sandbox backend is healthy and ready!
   [✓ PASS] Sandbox Initialization - Booted on http://127.0.0.1:5055 (PID: 8768)

   [STEP 2] Verifying Backend Health Check...
   [✓ PASS] API Health Check - Uptime: 2s, Brasilia Date: 2026-10-10

   [STEP 3] Verifying 19 Active Flats in Test Environment...
   [✓ PASS] 19 Flats Integrity - Verified 19 flats mapped

   [STEP 4] Verifying Production Database Is Completely Untouched...
   [✓ PASS] Production DB Isolation - Database file untouched after boot & queries

   [STEP 5] Testing Time-Travel Offset Shift (14:00, 18:00, 22:00, Reset)...
   [✓ PASS] Time-Travel Engine - 14:00, 18:00, 22:00 shifts and reset verified

   [STEP 6] Testing PIX Simulator & Real-time Settlement Webhook...
   [✓ PASS] PIX Payment Lifecycle - TxID PIX_SANDBOX_TX_001 settled to R$ 280.00

   [STEP 7] Testing Mock Z-API Interceptor & Webhook Simulation...
   [✓ PASS] Mock Z-API (WhatsApp) - Captured 2 messages & dispatched inbound webhook

   [STEP 8] Testing Mock SMTP Server TCP Interceptor...
   [✓ PASS] Mock SMTP (Nodemailer) - Captured email: "Autorização de Garagem - Flat  211"

   [STEP 9] Re-verifying Production Database Hash After All Mutations...
   [✓ PASS] Production Immutability Post-Test - Verified 0 byte drift in production database

   [STEP 10] Running Teardown & Process Tree Cleanup...
   [test-server] Stopping sandbox...
   [test-server] Killing backend process tree (PID: 8768)...
   [test-server] Sandbox teardown complete.
   [✓ PASS] Teardown & Port Release - Ports 5055, 5056, 5025 verified free
   [✓ PASS] Test Database Cleanup - database.test.json removed cleanly
   ```
   Exit code: 0.

---

## 2. Logic Chain

1. **Isolation from Cloud & Production DB**:
   - By launching Express with `DATABASE_URL=""` and `DATABASE_FILE=data/database.test.json`, PostgreSQL cloud connection pool is disabled (`pgPool === null`), and all file read/write operations target `data/database.test.json`.
   - Observation 1.4 confirms that before and after executing all mutations, the SHA-256 hash of `data/database.json` was `e48d5c63205df1a5c12fc484aab37f2611bd2fc351542e0cddd7b372e6948110` with exactly 0 bytes drift.

2. **Network Egress Prevention**:
   - `db-seeder.mjs` configures `zapiConfig.baseUrl` to `http://127.0.0.1:5056` and `settings.emailSettings.smtpPort` to `5025`.
   - Outbound WhatsApp requests go to `mock-zapi.mjs`.
   - Outbound Nodemailer requests connect to the local TCP receiver in `mock-smtp.mjs`.
   - `SERPRO_MOCK="true"` activates the built-in mock mode in `fnrh-serpro-service.mjs`.
   - Consequently, zero packets reach external APIs.

3. **Time-Travel Mechanics**:
   - By exposing `global.__simulatedTimeOffsetMs` through `/api/test/time-travel` and referencing it in `getEffectiveDate()`, all business checks in `getBrasiliaNow()` and `getTodayStr()` immediately perceive the shifted clock.
   - Tests can shift time forward to 14:00 (digital lock key visibility), 18:00 (maid shift turnover), or 22:00 (breakfast cutoff) deterministically without waiting or altering the host clock.

4. **Clean Windows Teardown**:
   - Using `taskkill /F /T /PID ${pid}` terminates the spawned Node process and any child processes, releasing ports 5055, 5056, and 5025.

---

## 3. Caveats

- **Port Availability**: The sandbox defaults to ports 5055 (API), 5056 (Z-API), and 5025 (SMTP). If another service occupies these ports on the host, `startSandbox` accepts custom port overrides via `{ port, zapiPort, smtpPort }`.
- **Node Global Scope**: `global.__simulatedTimeOffsetMs` is process-local. It resets when the test server process restarts, or when `resetTimeTravel()` is explicitly invoked.

---

## 4. Conclusion

Milestone 1 (M1) is 100% complete and verified:
1. `e2e/sandbox/` contains the full set of 7 operational modules: `db-seeder.mjs`, `mock-zapi.mjs`, `mock-smtp.mjs`, `pix-simulator.mjs`, `time-travel.mjs`, `test-server.mjs`, and `verify-sandbox.mjs`.
2. Full isolation achieved: production `data/database.json` is untouched.
3. Interceptors capture all WhatsApp and SMTP communication locally.
4. PIX simulation confirms payments in real-time.
5. Time-travel mechanics allow advancing system clocks on demand.
6. Twin-server parity between `artifacts/api-server/` and `scripts/` is byte-for-byte identical.
7. Ready for Milestone 2 (M2: Screen Crawler), Milestone 3 (M3: Human Journeys), and Milestone 4 (M4: Pairwise Matrix).

---

## 5. Verification Method

Run the verification test suite directly:
```powershell
node e2e/sandbox/verify-sandbox.mjs
```
*Expected Result*: Exit code 0, 11/11 tests passing.

Verify Twin-Server SHA-256 Parity:
```powershell
powershell -Command "(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash"
powershell -Command "(Get-FileHash 'artifacts/api-server/zapi-service.mjs').Hash -eq (Get-FileHash 'scripts/zapi-service.mjs').Hash"
```
*Expected Result*: Both return `True`.

Invalidation Conditions:
- If `verify-sandbox.mjs` fails any assertion or exits with non-zero code.
- If `demo-server.mjs` and its mirror in `scripts/` drift by even 1 byte.
- If production `data/database.json` modification timestamp or hash changes after running tests.
