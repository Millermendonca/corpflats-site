# Backend Survey Report: Architecture & Sandbox Isolation Points

**Explorer**: Explorer 2 (Backend Survey & Sandbox Isolation Points)  
**Date**: 2026-10-11  
**Target System**: Guest-Flow-Manager / CorpFlats  
**Working Directory**: `.agents/teamwork/explorer_survey_backend/`

---

## 1. Executive Summary

The CorpFlats / Guest-Flow-Manager backend is a Node.js/Express monolith centered on `artifacts/api-server/demo-server.mjs` (28,781 lines, ~1.25 MB) with an exact byte-for-byte mirror at `scripts/demo-server.mjs`.

To enable the synthetic autonomous End-to-End (E2E) testing framework described in R1 without polluting production data or contacting real external parties (WhatsApp numbers, bank gateways, Zoho SMTP, SERPRO gov.br, or GissOnline Prefeitura), this investigation audited:
1. **Database isolation**: How in-memory `db` loads and persists via `DATABASE_FILE` / `DATA_FILE` and how PostgreSQL is bypassed cleanly with `DATABASE_URL=""`.
2. **Dedicated test port execution**: How `PORT` env var configures the listener and how child process instances can be spawned and terminated safely on Windows.
3. **External communication endpoints**: Complete inventory of every outbound HTTP/HTTPS/SOAP/SMTP call, credentials used, and concrete interception designs (Z-API emulator, SMTP interceptor, PIX webhook simulator, SERPRO mock mode, NFS-e mock).
4. **Time-travel mechanics**: Detailed trace of how 18:00 (maid shift closing), 22:00/05:00 (breakfast order cutoff), and 14:00 (check-in lock and door password release) are checked, and how a deterministic time-travel hook/endpoint can be plugged in.

---

## 2. Monolith Architecture & Mirror Constraint

- **Primary file**: `artifacts/api-server/demo-server.mjs` (28,781 lines).
- **Mandatory mirror**: `scripts/demo-server.mjs` (must remain 100% byte-for-byte identical; verified by file hash `(Get-FileHash ...).Hash`).
- **Core dependencies**: Express 4/5, CORS, Cookie-Parser, Nodemailer, node-forge, xml-crypto, pdfkit, xlsx, pg.
- **Service modules**:
  - `artifacts/api-server/zapi-service.mjs` (~7,376 lines): Z-API WhatsApp automation, message queues, trigger rules, AI concierge.
  - `artifacts/api-server/mail-service.mjs` (~1,640 lines): Nodemailer Zoho transport, HTML templating, audit queue.
  - `artifacts/api-server/fnrh-serpro-service.mjs` (~760 lines): SERPRO FNRH v2.4.2 API client with built-in mock mode.
  - `artifacts/api-server/inter-pix-service.mjs`: Banco Inter mTLS banking client.
  - `artifacts/api-server/giss-soap.mjs`: GissOnline SOAP client with A1 certificate signing.
  - `artifacts/api-server/national-nfse.mjs`: ADN National NFS-e payload builder and Danfse HTML renderer.
  - `artifacts/api-server/maid-automation-service.mjs`: Maid productivity notifications and quinzena closing.
  - `artifacts/api-server/microsoft-graph-service.mjs`: OneDrive/SharePoint Excel sheet buffer synchronization.

---

## 3. Database Persistence & Complete Isolation (R1)

### 3.1 Persistence Mechanism
In `demo-server.mjs`:
- **File resolution (Lines 515–519)**:
  ```javascript
  const DATA_DIR = path.resolve(__dirname, "../../data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const DB_FILE = process.env.DATA_FILE || process.env.DATABASE_FILE || path.join(DATA_DIR, "database.json");
  ```
- **PostgreSQL Pool initialization (Lines 215–237)**:
  ```javascript
  if (process.env.DATABASE_URL) {
    try {
      pgPool = new Pool({ ... });
    } ...
  }
  ```
  *Key Finding*: If `process.env.DATABASE_URL` is empty (`DATABASE_URL=""`) or undefined, `pgPool` remains `null`. The server never attempts any connection to remote PostgreSQL.
- **Startup Loading (`loadDatabase()`, Lines 3384–3395)**:
  ```javascript
  if (fs.existsSync(DB_FILE)) {
    const content = fs.readFileSync(DB_FILE, "utf-8");
    const loaded = JSON.parse(content);
    Object.assign(db, loaded);
  }
  ```
- **Synchronous Write (`saveDatabase()`, Lines 4955–4960)**:
  ```javascript
  function saveDatabase(reason = "auto_save") {
    reconcileCleaningRequests();
    pruneDatabase();
    const stateJson = JSON.stringify(db);
    fs.writeFileSync(DB_FILE, stateJson, "utf-8");
    if (pgPool) { ... }
  }
  ```

### 3.2 Sandbox Isolation Protocol
To run the server without modifying or reading `data/database.json`:
1. Copy `data/database.json` to a dedicated sandbox replica, e.g. `data/database.test.json`.
2. Launch the backend process with environment variables:
   ```json
   {
     "DATABASE_FILE": "c:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes\\Guest-Flow-Manager\\data\\database.test.json",
     "DATABASE_URL": "",
     "PORT": "5055",
     "NODE_ENV": "test",
     "SERPRO_MOCK": "true"
   }
   ```
3. During execution, every `saveDatabase()` writes exclusively to `database.test.json`.
4. Production `database.json` remains completely untouched.
5. On teardown, delete `database.test.json` or keep it as a test execution artifact.

---

## 4. Port Configuration & Dedicated Test API Process

### 4.1 Port Resolution
Line 240 of `demo-server.mjs`:
```javascript
const app = express();
const PORT = process.env.PORT || 5000;
```
- In development/production, default is `5000`.
- The test harness can assign any high-range port (e.g., `PORT=5055` for API, `PORT=5056` for mock Z-API, `PORT=5025` for mock SMTP).

### 4.2 Lifecycle Management (Windows Compatible)
- **Spawn command**:
  ```javascript
  const serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
    env: { ...process.env, PORT: '5055', DATABASE_URL: '', DATABASE_FILE: testDbPath, NODE_ENV: 'test' },
    stdio: 'pipe'
  });
  ```
- **Readiness probe**:
  Poll `GET http://127.0.0.1:5055/api/system/version` or `GET http://127.0.0.1:5055/api/flats` with 250ms intervals (max 40 retries / 10s).
- **Clean teardown**:
  On Windows, child processes spawned by Node may leave zombie tree processes. Must use:
  ```javascript
  execSync(`taskkill /F /T /PID ${serverProcess.pid}`, { stdio: 'ignore' });
  ```

---

## 5. External Integration Points & Mock World Design (R1)

### 5.1 Z-API / WhatsApp
- **Configuration source**: `db.zapiConfig` inside `database.json`.
  - Keys: `instanceId`, `token`, `clientToken`, `baseUrl` (default: `"https://api.z-api.io"`), `testModeOnly: true`, `testAllowedPhones`.
- **Outbound calls**:
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-text`
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-button-list`
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-document/${ext}`
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-message-location`
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-button-otp`
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-button-pix`
  - `POST ${baseUrl}/instances/${instanceId}/token/${token}/send-option-list`
  - `GET ${baseUrl}/instances/${instanceId}/token/${token}/status`
  - `GET ${baseUrl}/instances/${instanceId}/token/${token}/device`
  - `GET ${baseUrl}/instances/${instanceId}/token/${token}/qr-code/image`
- **Inbound Webhook routes on demo-server**:
  - `POST /api/whatsapp/webhook/received`: Receives incoming guest messages, handled by AI concierge (`Sofia`) or forwarded to admin.
  - `POST /api/whatsapp/webhook/connected` & `/disconnected`.
- **Local Emulator Strategy**:
  - Launch a lightweight Express mock server on `http://127.0.0.1:5056`.
  - In `database.test.json`, set `db.zapiConfig.baseUrl = "http://127.0.0.1:5056"`.
  - Mock server routes:
    - Capture all `POST /instances/:instanceId/token/:token/*` requests into an in-memory queue (`mockZapiQueue`).
    - Provide query endpoints: `GET /mock/zapi/queue` and `DELETE /mock/zapi/queue`.
    - Provide helper `POST /mock/zapi/simulate-incoming` which posts a formatted payload to the main server's `/api/whatsapp/webhook/received`.
  - Result: 0 external requests to WhatsApp servers, 100% verifiable outbound queue, ability to test conversation flows.

### 5.2 SMTP / Nodemailer
- **Configuration source**:
  `mail-service.mjs:getSmtpConfig()` checks `process.env.SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `db.settings.emailSettings`.
- **Outbound execution**:
  `mail-service.mjs:sendEmailAsync()`:
  1. Instantly writes the email object to `db.reservationCommunications` with `status: "pending"`, recipient, subject, body HTML, and metadata.
  2. In `setImmediate`, calls `createTransporter(db, overrides)` and `transporter.sendMail(...)`.
- **Internal Audit Store**:
  Every email generated (vouchers, check-in confirmations, garage authorizations, WhatsApp mirrors) is recorded in `db.reservationCommunications`.
- **Local Interception Strategy**:
  - Set `SMTP_HOST="127.0.0.1"`, `SMTP_PORT="5025"`, `SMTP_USER="test"`, `SMTP_PASS="test"`.
  - Run a lightweight mock SMTP server (using Node `net.createServer` or `smtp-server`) on port 5025 that accepts connections, acknowledges DATA commands, and stores received emails in memory.
  - Alternatively/in addition, the E2E runner can inspect `GET /api/pms/reservations/:id/communications` or query `db.reservationCommunications` directly.

### 5.3 Payment Gateways / PIX
- **Dynamic Banco Inter PIX**:
  - Handled by `inter-pix-service.mjs`. If certificates or credentials are not configured, it throws cleanly and triggers the built-in fallback to `generateStaticPixPayload`.
- **Static PIX Generation**:
  - `generateStaticPixPayload({ pixKey, amount, merchantName, merchantCity, txid })` (lines 142–160 in `zapi-service.mjs`).
  - Generates valid EMV QR Code strings locally without any network connection.
- **Payment Webhook Endpoints on demo-server**:
  - `POST /api/pms/inter/webhook`:
    Accepts `{ pix: [ { txid, valor, horario, endToEndId } ] }`.
    Finds reservation where `r.pixTxId === txid`, updates `r.paymentStatus = "pago_total"`, `r.paidAmount = valor`, `r.paidAt = horario`, triggers notification, and calls `saveDatabase()`.
  - `POST /api/pms/mercadopago/webhook`:
    Accepts `{ type: "payment", data: { id: "..." } }`.
  - `POST /api/finance/payments/reconcile/:code`:
    Manual admin reconciliation.
- **Simulator Strategy**:
  - To test instant PIX payment:
    POST to `http://127.0.0.1:5055/api/pms/inter/webhook` with `{ pix: [{ txid: reservation.pixTxId, valor: reservation.totalAmount, horario: new Date().toISOString(), endToEndId: "E00000000000000000" }] }`.
  - The UI (via React Query polling or websocket/refresh) immediately updates to `pago_total`.
  - For expiration / regeneration: Call `/api/pms/reservations/:code/pix` or simulate expiration of txid.

### 5.4 SERPRO / FNRH gov.br API
- **Configuration source**:
  `fnrh-serpro-service.mjs`: `FnrhSerproClient`.
- **Existing Mock Mode**:
  `fnrh-serpro-service.mjs` lines 121–180 ALREADY contains full mock support:
  ```javascript
  const mock = Boolean(
    this.mockMode ||
    process.env.SERPRO_MOCK === "true" ||
    serproConfig.mock ||
    settingsOverride?.mock
  );
  ```
  When `mock: true`, it does not touch the network. Instead:
  - Generates deterministic UUIDs: `634eecb8-5973-47fd-a8a6-${cleanSuffix}`.
  - Returns `link_precheckin`: `https://fnrh.turismo.gov.br/precheckin/${mockUuid}`.
  - Returns `situacao_reserva_id: "CRIADA"`.
  - Latency: 15ms.
- **Fail-safe Fallback Testing**:
  Setting `mockTimeout: true` or `mockError: "Service Unavailable"` allows testing the requirement where Gov.br fails and the system transparently falls back to internal check-in (`/pre-checkin/:code`).

### 5.5 NFS-e Prefeitura & National ADN
- **GissOnline SOAP**:
  `giss-soap.mjs:emitirNfseGissReal` loads `loadCert()` (`storage/certs/certificado_corpflats_a1.pfx` or `CERT_PFX_BASE64`) and connects to `ws-homologacao-rtc.giss.com.br` or `ws-goytacazes.giss.com.br`.
- **National NFS-e**:
  `national-nfse.mjs` generates DPS XML and Danfse HTML locally.
- **Mock Strategy for Testing**:
  In sandbox mode, `/api/nfse/emit` can check `process.env.NODE_ENV === "test"` or `process.env.GISS_MOCK === "true"` to return simulated RPS/DPS numbers without attempting SOAP network transmission.

---

## 6. Time & Clock Mechanisms (Time-Travel Architecture)

### 6.1 Critical Time Checkpoints Mapped in Code

1. **Turno das 18:00 (Governança & Fechamento de Quinzena)**:
   - File: `artifacts/api-server/maid-automation-service.mjs` (Lines 530–660).
   - Trigger 2: "Resumo Diário de Produtividade" (`scheduledTime: "18:00"`).
     ```javascript
     const isPastOrAtDailyTime = (bNow.hour > 18) || (bNow.hour === 18 && bNow.minute >= 0);
     ```
   - Trigger 3: "Relatório de Fechamento de Quinzena" (`scheduledTime: "18:00"` on Day 15 and last day of month).
     ```javascript
     const isClosingDay = (currD === 15 || currD === lastDayOfMonth);
     const isPastOrAtClosingTime = (bNow.hour > 18) || (bNow.hour === 18 && bNow.minute >= 0);
     ```
   - When reached: Dispatches productivity summaries to all active maids with WhatsApp.

2. **Horário Limite do Café da Manhã (22:00 e 05:00 do dia seguinte)**:
   - File: `artifacts/api-server/demo-server.mjs` (Lines 21731–21740 & Lines 22731–22746).
   - Ordering cutoff: Orders for today cannot be placed after 05:00:
     ```javascript
     if (tDate === todayStr && nowBrl.hour >= 5) {
       return res.status(400).json({
         error: `O horário limite para pedidos de hoje (${todayStr}) foi encerrado às 05:00. O próximo café da manhã disponível é para amanhã.`
       });
     }
     ```
   - In guest portal (`guest-breakfast.tsx:825`): Informs guests that ordering for today is closed.

3. **Check-in Lock & Senha da Fechadura (14:00)**:
   - File: `artifacts/api-server/demo-server.mjs` (Lines 14150–14155 & Lines 14307–14316).
     ```javascript
     const currentHour = brDate.getHours();
     const isPastOrExact14h = currentHour >= 14;
     const isCheckinToday = (todayStr === r.checkinDate);
     const canDoEarlyCheckin = isCheckinToday && isFlatClean && hasEarlyCheckinBenefit;
     ```
   - Frontend rule (`guest-portal.tsx:2180–2240`):
     - Before 14:00, if flat is not cleaned or early check-in not granted: Door password is NOT revealed; UI shows banner: "Apartamento em Preparação & Higienização 🧹 - O horário oficial de check-in é a partir das 14:00".
     - At or after 14:00 (or when flat is clean + early check-in benefit): Door password badge appears with copy button.

### 6.2 Current Time Computation Helpers
In `demo-server.mjs`:
- Line 102–111:
  ```javascript
  const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  });
  function getTodayStr() {
    return BRAZIL_DATE_FORMATTER.format(new Date());
  }
  ```
- Line 142–162:
  ```javascript
  function getBrasiliaNow() {
    const now = new Date();
    const dateStr = BRAZIL_DATE_FORMATTER.format(now);
    const timeParts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(now);
    ...
    return { date: dateStr, hour, minute, second, timeStr: `${...}:${...}` };
  }
  ```

### 6.3 Time-Travel Endpoint Design
To enable synthetic tests to travel through time deterministically without altering system time on Windows:
Add a controllable time offset in `demo-server.mjs` (and mirror in `scripts/demo-server.mjs`):

```javascript
// ── Simulated Clock & Time-Travel Hook (Active when NODE_ENV === 'test') ─────
let __simulatedTimeOffsetMs = 0;

export function getEffectiveNow() {
  return new Date(Date.now() + __simulatedTimeOffsetMs);
}

function getTodayStr() {
  return BRAZIL_DATE_FORMATTER.format(getEffectiveNow());
}

function getBrasiliaNow() {
  const now = getEffectiveNow();
  const dateStr = BRAZIL_DATE_FORMATTER.format(now);
  const timeParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(now);
  const hour = Number(timeParts.find(p => p.type === "hour")?.value || "0");
  const minute = Number(timeParts.find(p => p.type === "minute")?.value || "0");
  const second = Number(timeParts.find(p => p.type === "second")?.value || "0");
  return {
    date: dateStr,
    hour, minute, second,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}
```

And add endpoint:
```javascript
app.post("/api/test/time-travel", (req, res) => {
  if (process.env.NODE_ENV !== "test") {
    return res.status(403).json({ error: "Time-travel is only allowed in test mode." });
  }
  const { targetDate, offsetHours, reset } = req.body || {};

  if (reset) {
    __simulatedTimeOffsetMs = 0;
  } else if (targetDate) {
    __simulatedTimeOffsetMs = new Date(targetDate).getTime() - Date.now();
  } else if (typeof offsetHours === "number") {
    __simulatedTimeOffsetMs += offsetHours * 3600000;
  }

  const currentNow = getBrasiliaNow();
  res.json({
    ok: true,
    simulatedNow: currentNow,
    offsetMs: __simulatedTimeOffsetMs,
    offsetHours: __simulatedTimeOffsetMs / 3600000
  });
});
```
This enables test scripts to jump to:
- 13:50 (Flat locked) -> jump to 14:01 (Flat unlocked, door code displayed).
- 17:55 -> jump to 18:05 (Maid productivity report dispatched).
- 21:55 -> jump to 22:05 (Breakfast cutoff triggered).
- Jump 3 days forward (Test overdue checkout / reservation expiration).

---

## 7. Recommended Sandbox Architecture for Milestone 2+

```
                    ┌──────────────────────────────────────────────┐
                    │               Test Runner / E2E              │
                    │               (Playwright / Node)            │
                    └───────────────┬──────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                        │                        │
           ▼                        ▼                        ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  Mock Z-API Server   │ │  Mock SMTP Server    │ │ Isolated API Server  │
│  (Port 5056)         │ │  (Port 5025)         │ │ (Port 5055)          │
│                      │ │                      │ │                      │
│ - Queue: GET /queue  │ │ - Captures Nodemailer│ │ - DATA_FILE:         │
│ - Inbound simulator  │ │   transports in mem  │ │   database.test.json │
│                      │ │ - Inspectable        │ │ - DATABASE_URL: ""   │
└──────────┬───────────┘ └──────────┬───────────┘ │ - SERPRO_MOCK: true  │
           ▲                        ▲             │ - Time-Travel API    │
           │ (baseUrl)              │ (SMTP_PORT) └──────────┬───────────┘
           └────────────────────────┴────────────────────────┘
```

1. **Isolation Guarantee**: Zero external network egress.
2. **Determinism**: Fully seedable database replica (`database.test.json`).
3. **Speed**: Sub-second startup, no external network latency.
4. **Mirror Safety**: Changes strictly synced between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
