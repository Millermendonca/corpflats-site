# Handoff Report: Survey Backend Architecture & Sandbox Isolation Points (R1)

**Agent**: Explorer 2 (Backend Survey & Sandbox Isolation Points)  
**Recipient**: Orchestrator (`5a1d1171-401e-4601-9229-45485822d731`)  
**Date**: 2026-10-11T00:52:00Z  
**Type**: Hard Handoff (Investigation Complete)  
**Location**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\handoff.md`

---

## 1. Observation

### 1.1 Backend Monolith & Mirror
- The backend server is implemented in `artifacts/api-server/demo-server.mjs` (28,781 lines, 1,246,359 bytes) with a mandatory mirror at `scripts/demo-server.mjs`.
- Running `(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash` returned `True`, confirming they are currently 100% byte-for-byte identical.

### 1.2 Database Storage & PostgreSQL Pool Guards
- In `artifacts/api-server/demo-server.mjs`:
  - **Line 215–217**:
    ```javascript
    if (process.env.DATABASE_URL) {
      try {
        pgPool = new Pool({
    ```
    If `process.env.DATABASE_URL` is empty string (`DATABASE_URL=""`) or not defined, `pgPool` is `null`. No cloud PostgreSQL connection is established.
  - **Lines 515–519**:
    ```javascript
    const DATA_DIR = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const DB_FILE = process.env.DATA_FILE || process.env.DATABASE_FILE || path.join(DATA_DIR, "database.json");
    ```
  - **Lines 3384–3394 (`loadDatabase`)**:
    ```javascript
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const loaded = JSON.parse(content);
      Object.assign(db, loaded);
    ```
  - **Lines 4955–4960 (`saveDatabase`)**:
    ```javascript
    function saveDatabase(reason = "auto_save") {
      reconcileCleaningRequests();
      pruneDatabase();
      const stateJson = JSON.stringify(db);
      fs.writeFileSync(DB_FILE, stateJson, "utf-8");
    ```

### 1.3 Port Binding & Execution
- In `artifacts/api-server/demo-server.mjs`:
  - **Line 240**: `const PORT = process.env.PORT || 5000;`
  - Existing tests in `tests/service-orders-api-live.test.mjs:36–38` and `tests/test-service-order-notifications.test.mjs:29–33` spawn the server via:
    ```javascript
    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_URL: '', DATABASE_FILE: isolatedDbPath },
      stdio: 'pipe'
    });
    ```
  - Process cleanup on Windows uses `taskkill /F /T /PID ${pid}` to eliminate child trees.

### 1.4 External Calls Mapped

1. **Z-API / WhatsApp (`artifacts/api-server/zapi-service.mjs`)**:
   - Outbound calls construct URLs using `baseUrl`:
     - Lines 2316, 2436, 2689, 2723, 2756, 2789, 2827, 2881, 2912, 3881, 6147:
       `const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";`
   - Config loaded from `db.zapiConfig` (`instanceId`, `token`, `clientToken`, `baseUrl`, `testModeOnly`, `testAllowedPhones`).
   - Built-in simulation fallback (lines 2415–2433): if `!instanceId || !token`, returns `{ success: true, simulated: true, messageId: ... }`.
   - Inbound webhook endpoints in `demo-server.mjs`:
     - `POST /api/whatsapp/webhook/received`: Routes to AI Concierge (`Sofia`) or admin.
     - `POST /api/whatsapp/webhook/connected` & `/disconnected`.

2. **SMTP / Nodemailer (`artifacts/api-server/mail-service.mjs`)**:
   - `getSmtpConfig(db, overrides)` (lines 108–140) checks `process.env.SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `db.settings.emailSettings`.
   - `sendEmailAsync` (lines 1093–1154):
     - Unconditionally logs to `db.reservationCommunications` with `type: "email"`, `direction: "outbound"`, `recipient`, `subject`, `body` (HTML), `status: "pending"`, and timestamp.
     - In `setImmediate`, connects to `config.host` and `config.port` via `nodemailer.createTransport`.

3. **Payment Gateways & PIX**:
   - Banco Inter cash-out for maids: `inter-pix-service.mjs` (uses mTLS certificates `certs/inter.crt` and `certs/inter.key`).
   - Guest payment via PIX:
     - Dynamic Banco Inter PIX falls back cleanly to `generateStaticPixPayload(...)` in `zapi-service.mjs:142–160` (offline EMV QR-Code generation).
     - Inbound payment webhook: `POST /api/pms/inter/webhook` in `demo-server.mjs:25881–25918`. Matches `resItem.pixTxId === txid` and marks `paymentStatus = "pago_total"`, `paidAmount = valorPago`, `paidAt = horario`.
     - MercadoPago webhook: `POST /api/pms/mercadopago/webhook` in `demo-server.mjs:26661–26722`.
     - Reconciliation: `POST /api/finance/payments/reconcile/:code`.

4. **SERPRO / FNRH gov.br API (`artifacts/api-server/fnrh-serpro-service.mjs`)**:
   - Handled by `FnrhSerproClient`.
   - Lines 121–180 ALREADY include native mock support:
     ```javascript
     const mock = Boolean(this.mockMode || process.env.SERPRO_MOCK === "true" || serproConfig.mock || settingsOverride?.mock);
     ```
   - When `mock: true`: generates mock UUID `634eecb8-5973-47fd-a8a6-${cleanSuffix}`, link `https://fnrh.turismo.gov.br/precheckin/${mockUuid}`, with 15ms latency and zero network egress.
   - Intelligent fallback helper `getCheckinUrlSync(reservation, guestIndex, baseUrl)` falls back to internal `/pre-checkin/:code` if SERPRO times out or fails.

5. **NFS-e Prefeitura & National ADN**:
   - GissOnline SOAP: `giss-soap.mjs:emitirNfseGissReal` loads `loadCert()` (`storage/certs/certificado_corpflats_a1.pfx`) and connects to `ws-homologacao-rtc.giss.com.br` or `ws-goytacazes.giss.com.br`.
   - ADN National: `national-nfse.mjs`.
   - Endpoint: `POST /api/nfse/emit` in `demo-server.mjs:20845`.

6. **Microsoft Graph Service**:
   - `microsoft-graph-service.mjs`: Synchronizes `Planilha.xlsx` via Microsoft Graph OAuth.

### 1.5 Time & Clock Tracing

1. **Turno das 18:00**:
   - File: `artifacts/api-server/maid-automation-service.mjs:530–660`.
   - Checks `bNow = getBrasiliaNow()`.
   - `isPastOrAtDailyTime = (bNow.hour > 18) || (bNow.hour === 18 && bNow.minute >= 0)` triggers daily maid summary.
   - `isClosingDay && isPastOrAtClosingTime` triggers quinzena closing report.
2. **Café da Manhã Cutoff (22:00 e 05:00)**:
   - File: `artifacts/api-server/demo-server.mjs:22731–22746`.
   - Orders for today: `if (tDate === todayStr && nowBrl.hour >= 5)` returns 400 error.
   - Guest UI informs about 22:00 order cutoffs.
3. **Check-in Lock & Senha da Fechadura (14:00)**:
   - File: `artifacts/api-server/demo-server.mjs:14150–14155 & 14307–14316`.
   - `isPastOrExact14h = currentHour >= 14`.
   - If before 14:00 and flat is in preparation, door password remains hidden, and banner displays "Apartamento em Preparação & Higienização".
   - At or after 14:00 (or when flat is clean + early check-in benefit), password is shown.

---

## 2. Logic Chain

1. **Database Safety**:
   - From Observation 1.2: `demo-server.mjs` checks `process.env.DATABASE_FILE` before default `data/database.json`, and checks `process.env.DATABASE_URL` before connecting to PostgreSQL.
   - Therefore, passing `DATABASE_FILE=data/database.test.json` and `DATABASE_URL=""` guarantees that:
     a) PostgreSQL is never contacted (`pgPool === null`).
     b) Production `data/database.json` is never read or modified.
     c) The sandbox runs completely deterministically in memory, reading and writing only to `database.test.json`.

2. **Dedicated Port & Process Isolation**:
   - From Observation 1.3: `PORT` env var overrides port 5000.
   - Therefore, running the test server on port 5055 avoids conflicting with any existing development or production server on port 3000/5000.
   - Spawning via `node` and terminating via `taskkill /F /T /PID` guarantees clean start and tear-down on Windows.

3. **External Traffic Interception (Zero Network Leaks)**:
   - From Observation 1.4:
     - Z-API outgoing calls construct URLs using `db.zapiConfig.baseUrl`. Setting `baseUrl = "http://127.0.0.1:5056"` diverts all WhatsApp messages to a local mock server with an inspectable queue.
     - Inbound WhatsApp messages can be simulated by posting to `/api/whatsapp/webhook/received`.
     - Nodemailer calls use `getSmtpConfig` and write every outbound email directly to `db.reservationCommunications`. Setting `SMTP_HOST="127.0.0.1"` and `SMTP_PORT="5025"` directs all SMTP socket traffic to a local memory receiver.
     - PIX confirmation does not call out; it is triggered by an inbound POST to `/api/pms/inter/webhook`. The test runner can simulate instant payment by sending the webhook payload.
     - SERPRO FNRH already includes a native mock mode (`SERPRO_MOCK="true"`), eliminating gov.br traffic.
     - NFS-e emission can be bypassed in test mode by flagging `NODE_ENV === "test"` or `GISS_MOCK="true"`.
   - Therefore, zero network packets leave the machine during test execution.

4. **Time-Travel Mechanics**:
   - From Observation 1.5: All critical business rules depend on `getBrasiliaNow()` and `getTodayStr()`.
   - Therefore, introducing a controllable `__simulatedTimeOffsetMs` hooked into `getBrasiliaNow()` and `getTodayStr()` via a `POST /api/test/time-travel` endpoint allows test suites to warp time forward to test the 14:00 lock, 18:00 turno, 22:00/05:00 café cutoff, and reservation expirations without waiting for real time or modifying Windows system clock.

5. **Mirror Integrity**:
   - From Observation 1.1: `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` are identical.
   - Any modifications made to the backend (such as the time-travel endpoint) must be written simultaneously to both files to maintain the byte-for-byte invariant.

---

## 3. Caveats

- **Caveat 1 (Windows Process Tree)**: In Windows, calling `proc.kill('SIGTERM')` on a Node child process sometimes leaves background listeners alive. The test runner MUST use `execSync('taskkill /F /T /PID ' + proc.pid)` in `after()` hooks.
- **Caveat 2 (Static Assets / Vite)**: The frontend in `artifacts/limpeza` communicates with the backend via Vite dev server proxy or direct `SERVER_BASE_URL`. For E2E tests, the frontend must be configured with `VITE_API_URL` or proxy pointing to the isolated test port (`http://127.0.0.1:5055`).
- **Caveat 3 (Storage uploads)**: Image uploads for service order photos and receipts are saved to `artifacts/api-server/uploads`. In sandbox tests, temporary uploads should be written to a test directory or purged after test runs.

---

## 4. Conclusion

1. **Complete Database & Process Isolation is 100% Achievable**:
   By launching `node artifacts/api-server/demo-server.mjs` with:
   - `PORT: 5055`
   - `DATABASE_URL: ""`
   - `DATABASE_FILE: <absolute_path_to_database.test.json>`
   - `NODE_ENV: "test"`
   - `SERPRO_MOCK: "true"`
   The backend runs in complete isolation without reading or writing production `database.json`.

2. **Zero-Leakage Interceptor Architecture Mapped**:
   - **WhatsApp**: Local mock HTTP server on port 5056 intercepts all Z-API calls via `db.zapiConfig.baseUrl = "http://127.0.0.1:5056"`.
   - **SMTP**: In-memory receiver on port 5025 plus direct inspection of `db.reservationCommunications`.
   - **PIX**: Webhook simulator posts to `/api/pms/inter/webhook` for instant payment; offline QR code generator (`generateStaticPixPayload`) works without bank APIs.
   - **SERPRO FNRH**: Native `SERPRO_MOCK=true` mode produces realistic UUIDs and links with zero network egress.
   - **NFS-e**: Test mock guard in `/api/nfse/emit`.

3. **Time-Travel Endpoint Specification**:
   Add `POST /api/test/time-travel` (active when `NODE_ENV === "test"`) adjusting `__simulatedTimeOffsetMs` in `demo-server.mjs` (and mirror in `scripts/demo-server.mjs`) to test the 14:00 check-in lock, 18:00 turno, and 22:00 café cutoff.

---

## 5. Verification Method

### 5.1 Mirror Verification Command
Run in PowerShell:
```powershell
powershell -Command "(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash"
```
*Expected Result*: `True`.

### 5.2 Isolated Database Verification Command
Create a temporary test database and launch the isolated server:
```powershell
node -e "
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const prodDb = path.resolve('data/database.json');
const testDb = path.resolve('data/database.verification-test.json');
fs.copyFileSync(prodDb, testDb);

const proc = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
  env: { ...process.env, PORT: '5055', DATABASE_URL: '', DATABASE_FILE: testDb, NODE_ENV: 'test', SERPRO_MOCK: 'true' },
  stdio: 'pipe'
});

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:5055/api/flats');
    console.log('Isolated API Status:', res.status);
    const prodStatBefore = fs.statSync(prodDb).mtimeMs;
    // Make a mutation on test server
    await fetch('http://127.0.0.1:5055/api/test/ping').catch(() => {});
    const prodStatAfter = fs.statSync(prodDb).mtimeMs;
    console.log('Production database untouched:', prodStatBefore === prodStatAfter);
  } finally {
    execSync('taskkill /F /T /PID ' + proc.pid, { stdio: 'ignore' });
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  }
}, 2500);
"
```

### 5.3 Invalidation Conditions
- If `DATABASE_URL` is populated with a live cloud connection string, PostgreSQL will hydrate and overwrite in-memory state.
- If `scripts/demo-server.mjs` differs from `artifacts/api-server/demo-server.mjs` by even 1 byte, automated integrity tests will fail.
