# Architectural Blueprint: Credit Card Vault & Security (Milestone 5)
**Features**: F25 (Credit Card Encrypted Vault) & F26 (Admin Reauth & Auto-Purge)  
**Author**: Explorer 1 (Milestone 5 — Credit Card Vault Architecture & Security)  
**Date**: 2026-10-14  
**Working Directory**: `.agents/teamwork/explorer_m5_wbp_1/`

---

## 1. Executive Summary & Regulatory Grounding

Milestone 5 introduces the secure handling of credit card data transmitted by OTAs (Booking.com and Airbnb via WebBookingPro). In hotel management, receiving card details is standard for `PaymentCollect = Property` or guarantee holds. However, handling cardholder data (CHD) and sensitive authentication data (SAD) carries stringent regulatory mandates under **PCI DSS v4.0 (Requirement 3: Protect Stored Account Data)** and the project's authoritative requirement **R6 (Cartões de crédito)**:

1. **Zero Plaintext Storage**: Full Primary Account Numbers (PAN) must NEVER appear unencrypted in application databases, disk blobs, state files, transaction logs, or API list responses.
2. **Absolute CVV Prohibition**: Sensitive Authentication Data (CVV, CVC, CID, security codes) must be completely and irreversibly discarded in memory upon receipt. CVV must **NEVER be encrypted, NEVER be stored in any database or file, and NEVER be written to logs**.
3. **Strong Encryption at Rest**: Encrypted using **AES-256-GCM** (authenticated encryption) with unique random IVs, 16-byte authentication tags, and cryptographic keys kept strictly outside the database in environment variables (`CREDIT_CARD_VAULT_KEY` or `WBP_VAULT_KEY`).
4. **Step-Up Admin Re-authentication**: Decryption and viewing of card details is strictly reserved for administrators who must re-enter their password, generating a **single-use token** with a strictly enforced **5-minute expiration window** that is permanently burned upon first read.
5. **Deterministic Auto-Purge**: All encrypted card data is permanently destroyed **7 days after guest check-out** or **immediately upon cancellation without penalty**.
6. **Zero Regression for Other Users**: The admin re-authentication mechanism must operate as an isolated step-up layer without mutating or interfering with normal user sessions (receptionists, housekeepers, or managers).

---

## 2. Cryptographic Engine Architecture (Feature 25 — R6)

### 2.1 Cipher Specification & Parameters
The cryptographic vault implements authenticated symmetric encryption via Node.js native `node:crypto`:

- **Algorithm**: `aes-256-gcm` (NIST SP 800-38D).
- **Key Length**: 256 bits (32 bytes).
- **Initialization Vector (IV / Nonce)**: 96 bits (12 bytes) of cryptographically secure random bytes generated via `crypto.randomBytes(12)` for every single encryption. Reusing an IV with the same key in GCM mode is catastrophic; generating a fresh 12-byte random IV per record guarantees non-repeatability.
- **Authentication Tag**: 128 bits (16 bytes) generated via `cipher.getAuthTag()` upon completion. Guarantees ciphertext integrity and authenticity; any bit-level tampering causes decryption to reject immediately.
- **Additional Authenticated Data (AAD)**: The `orderId` or `reservationId` is bound to the ciphertext via `cipher.setAAD(Buffer.from(orderId, "utf-8"))`. This cryptographic binding prevents "ciphertext transplant attacks" (where ciphertext from reservation A is copied into reservation B to decrypt under a different context).

### 2.2 Key Management Lifecycle
Keys must be completely decoupled from database persistence:
- **Environment Variables**:
  1. `process.env.CREDIT_CARD_VAULT_KEY` (primary)
  2. `process.env.WBP_VAULT_KEY` (fallback alias)
- **Key Normalization**:
  The vault accepts keys in multiple developer-friendly formats and normalizes them to exactly 32 raw bytes:
  - 64-character hexadecimal string -> `Buffer.from(keyStr, "hex")`.
  - 32-byte binary Buffer -> used directly.
  - Arbitrary passphrase or string -> derived using SHA-256 (`crypto.createHash("sha256").update(keyStr).digest()`).
- **Test Mode Fallback**:
  If neither environment variable is configured and `process.env.NODE_ENV === "test"`, the vault automatically instantiates a dedicated 32-byte random key in memory (`crypto.randomBytes(32)`), allowing isolated unit and integration testing without requiring manual environment configuration.
- **Production Guard**:
  In production (`NODE_ENV !== "test"`), if no vault key is present, the vault refuses to operate and throws an explicit `VaultKeyMissingError`, preventing any fallback to plaintext or unauthenticated fallback storage.
- **Key Hygiene**:
  The key is never written to `database.json`, Postgres `system_store`, `wbp_storage_state.json`, `audit_logs.jsonl`, or transmitted via API responses.

### 2.3 In-Memory CVV / CVC Discard Protocol (PCI DSS SAD Rule)
The removal of CVV must happen at the very entry gate of the system, before any logging, storage, or cryptographic processing:

```javascript
/**
 * Deep recursive CVV purge.
 * Irreversibly strips any variant of CVV/CVC/security code from memory.
 */
export function stripCvvDeep(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripCvvDeep);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (/^(card_?)?(cv[vc2]|security_code|securitycode|cid)$/i.test(key)) {
      continue; // Discarded immediately in memory
    }
    clean[key] = stripCvvDeep(value);
  }
  return clean;
}
```

In addition, the `CreditCardVault.encryptCard` method performs a redundant assertion: if a caller accidentally passes an object containing `cvv`, `cvc`, or `security_code`, the method deletes the field before cipher processing. CVV is **never passed to the cipher, never stored in the ciphertext, and never recoverable**.

### 2.4 Inbound Pipeline & Order of Operations
The critical architectural requirement from the parent directive is the strict order of operations:
1. Webhook (`/BookingCreate`, `/NotifyBooking`) or polling delivers booking payload.
2. In-memory deep CVV discard (`stripCvvDeep`) executes on the raw request body.
3. Raw card data (PAN, cardholder name, expiration month/year) is extracted.
4. `CreditCardVault.storeCard()` encrypts the card details into the dedicated vault.
5. In-memory deep PAN masking (`maskPanDeep`) executes on the payload:
   - Full PAN is converted to `**** **** **** 1234`.
   - `cardLast4` ("1234") and `cardBrand` ("Visa") are preserved.
6. The sanitized payload (containing **only** masked PAN and zero CVV) is durably recorded via `storage.recordRawPayload`.
7. `processIncomingOTA` processes the reservation into `db.reservations`, saving:
   - `cardLast4: "1234"`
   - `cardBrand: "Visa"`
   - `cardExpMonth: "12"`
   - `cardExpYear: "2028"`
   - `hasCard: true`
   - `vaultStatus: "active"`

```
Incoming Webhook (BookingCreate / NotifyBooking)
      │
      ▼
1. Memory Scrub: stripCvvDeep(body)  [CVV destroyed forever]
      │
      ▼
2. Extract Raw Card: { pan, expMonth, expYear, guestName }
      │
      ▼
3. Vault Encryption: vault.storeCard() [AES-256-GCM -> Vault Store]
      │
      ▼
4. Memory Scrub: maskPanDeep(body)   [PAN -> **** **** **** 1234]
      │
      ▼
5. Durable Raw Storage: storage.recordRawPayload() [Zero PAN, Zero CVV]
      │
      ▼
6. PMS Processing: processIncomingOTA() [db.reservations receives cardLast4]
```

---

## 3. Vault Storage & Schema

The encrypted card details must be isolated from the main `system_store` (`db_state`) blob to prevent database bloating, inadvertent serialization leaks, and accidental exposure during general reservation queries.

### 3.1 Vault Record Schema
```typescript
interface VaultRecord {
  id: string;                      // e.g. "vault_order_10928374"
  orderId: string;                 // OTA external order id
  reservationId?: number | string; // PMS reservation id once linked
  cardBrand: string;               // "Visa" | "Mastercard" | "Amex" | "Elo" | etc.
  cardLast4: string;               // "1234"
  cardExpMonth: string;            // "12"
  cardExpYear: string;             // "2028"
  checkoutDate: string;            // "YYYY-MM-DD"
  purgeAfterDate: string;          // addDays(checkoutDate, 7)
  status: "active" | "purged";     // Lifecycle flag
  encrypted: {
    iv: string;                    // Hex-encoded 12-byte IV
    authTag: string;               // Hex-encoded 16-byte GCM tag
    ciphertext: string;            // Hex-encoded AES-256-GCM ciphertext
    algorithm: "aes-256-gcm";
    keyVersion: number;            // 1
  } | null;                        // null when status === "purged"
  createdAt: string;               // ISO 8601
  purgedAt?: string;               // ISO 8601 when status === "purged"
  purgeReason?: string;            // "7_days_post_checkout" | "cancellation_no_penalty"
}
```

### 3.2 Dual Persistence Mechanism
- **File / Test Mode**:
  Stored in `data/wbp_card_vault.json` (or `process.env.WBP_CARD_VAULT_FILE`). In test execution with `DATA_FILE`, the file is created in `os.tmpdir()` alongside the temporary database copy, ensuring zero pollution of repository files.
- **PostgreSQL Mode**:
  Stored in a dedicated table `wbp_card_vault`, outside the JSONB `system_store` blob and completely immune to `pruneDatabase`.

---

## 4. Admin Re-authentication & Single-Use Token Architecture (Feature 26 — R6)

### 4.1 Step-Up Re-authentication Workflow
Viewing full card data is a privileged administrative operation that requires proof of identity at the exact moment of request.

#### Endpoint: `POST /api/wbp/vault/reauth`
- **Authentication**: Caller must have an active session (`getAuthUser(req)`) with `role === "admin"`.
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "adminPassword123",
    "reservationId": 501
  }
  ```
- **Verification Logic**:
  1. Find user in `db.users`.
  2. Verify `user.role === "admin"`. If non-admin, return `403 Forbidden` (`"Acesso restrito a administradores"`).
  3. Verify password via `verifyPassword(password, user.passwordHash)`. If incorrect, return `401 Unauthorized` (`"Senha de administrador incorreta"`).
  4. Verify that card exists in vault for `reservationId` and `status === "active"`. If already purged, return `410 Gone` (`"Dados do cartão já foram expurgados permanentemente"`).
  5. Generate single-use token:
     `const token = crypto.randomUUID();`
  6. Store token in memory registry with 5-minute TTL:
     ```javascript
     this._reauthTokens.set(token, {
       token,
       userId: user.id,
       username: user.username,
       reservationId: String(reservationId),
       expiresAt: Date.now() + 5 * 60 * 1000, // 300,000 ms (5 min)
       used: false
     });
     ```
  7. Log audit event:
     `logAuditEvent("VAULT_REAUTH_SUCCESS", { actor: { id: user.id, username: user.username, role: "admin" }, reservationId })`.
  8. Return response:
     ```json
     {
       "success": true,
       "token": "d3b07384-d113-40a2-992a-605856417721",
       "expiresInSeconds": 300
     }
     ```
- **Non-Interference Rule**: This step-up check does NOT mutate `db.users`, does NOT alter `AUTH_COOKIE_NAME` or `AUTH_SESSION_VERSION`, and does NOT impact or log out any concurrent users.

### 4.2 Secure Token Consumption & Invalidation
#### Endpoint: `POST /api/wbp/vault/view` or `GET /api/wbp/vault/card/:reservationId?token=...`
- **Request Parameters**:
  - `token`: The UUID token obtained during re-authentication.
  - `reservationId`: The target reservation ID.
- **Validation & Burning**:
  ```javascript
  const entry = this._reauthTokens.get(token);

  if (!entry) {
    logAuditEvent("VAULT_ACCESS_DENIED", { details: { reason: "Token not found or already consumed", reservationId } });
    return res.status(403).json({ error: "Token inválido ou já utilizado." });
  }

  // 1. Check expiration (5 minutes strictly)
  if (Date.now() > entry.expiresAt) {
    this._reauthTokens.delete(token);
    logAuditEvent("VAULT_ACCESS_DENIED", { details: { reason: "Token expired", reservationId } });
    return res.status(403).json({ error: "Token de visualização expirado (limite de 5 minutos)." });
  }

  // 2. Check reservation binding
  if (String(entry.reservationId) !== String(reservationId)) {
    this._reauthTokens.delete(token);
    logAuditEvent("VAULT_ACCESS_DENIED", { details: { reason: "Token reservation mismatch", reservationId } });
    return res.status(403).json({ error: "Token não autorizado para esta reserva." });
  }

  // 3. IMMEDIATE BURNING: Mark used and delete from registry BEFORE decryption!
  entry.used = true;
  this._reauthTokens.delete(token);

  // 4. Decrypt from vault
  const decrypted = vault.decryptCard(reservationId);

  // 5. Audit log (Audit log NEVER includes PAN or CVV!)
  logAuditEvent({
    action: "VAULT_CARD_VIEWED",
    category: "security",
    level: "warning",
    actor: { id: entry.userId, username: entry.username, role: "admin" },
    details: {
      reservationId,
      cardBrand: decrypted.brand,
      cardLast4: decrypted.last4,
      reason: "Visualização segura de cartão pelo administrador"
    }
  });

  // 6. Return decrypted details
  return res.json({
    success: true,
    card: {
      pan: decrypted.pan,
      cardholderName: decrypted.cardholderName,
      expMonth: decrypted.expMonth,
      expYear: decrypted.expYear,
      brand: decrypted.brand,
      last4: decrypted.last4
    }
  });
  ```
- **Single-Use Replay Protection**: Because the token is deleted from `this._reauthTokens` on the very first read, any subsequent attempt with the exact same token immediately receives a `403 Forbidden` (`"Token inválido ou já utilizado"`). Replay attacks are cryptographically impossible.

---

## 5. Auto-Purge Engine (Feature 26 — R6)

### 5.1 Dual Purge Rules
1. **Rule 1: Post-Checkout Expiration (7 Days)**:
   - Target date: `purgeAfterDate = addDays(checkoutDate, 7)`.
   - Condition: When `currentDate >= purgeAfterDate`.
   - Rationale: A 7-day grace period allows front-desk reconciliation and penalty/damage charges post check-out. Once 7 days elapse, keeping raw card data creates liability without operational necessity.
2. **Rule 2: Cancellation Without Penalty**:
   - Condition: Reservation status transitions to `cancelada` without cancellation fee or penalty (e.g., standard OTA cancellation handled in `handleOtaCancellation` in `inbox.mjs`).
   - Action: Card is purged **immediately** upon receiving the cancellation, without waiting 7 days.

### 5.2 Irreversible Data Destruction Protocol
When a card is purged:
1. `record.status = "purged"`.
2. `record.encrypted = null` — the ciphertext, IV, and auth tag are permanently expunged from the vault store and disk.
3. `record.purgedAt = new Date().toISOString()`.
4. `record.purgeReason = reason`.
5. In `db.reservations`, the reservation record is updated:
   - `reservation.vaultStatus = "purged"`
   - `reservation.cardPurgedAt = new Date().toISOString()`
6. Structured audit log is emitted to `audit_logs.jsonl`:
   ```javascript
   logAuditEvent({
     action: "VAULT_CARD_PURGED",
     category: "security",
     level: "info",
     actor: { name: "AutoPurgeEngine", role: "system" },
     details: {
       reservationId: record.reservationId,
       reason: record.purgeReason,
       checkoutDate: record.checkoutDate,
       cardLast4: record.cardLast4
     }
   });
   ```

### 5.3 Time-Travel Testing Strategy
Automated tests cannot wait 7 real-time days. The Auto-Purge engine accepts a `referenceDate` parameter:
`vault.purgeExpiredCards(referenceDate = new Date().toISOString().substring(0, 10))`

In integration testing:
- **T0**: Card stored with checkout `2026-10-20`. Purge boundary is `2026-10-27`.
- **T+5 Days (`referenceDate = "2026-10-25"`)**: Run `purgeExpiredCards("2026-10-25")`.
  - Assert `purgedCount === 0`.
  - Assert card status is still `"active"`. Decryption succeeds.
- **T+7 Days (`referenceDate = "2026-10-27"`)**: Run `purgeExpiredCards("2026-10-27")`.
  - Assert `purgedCount === 1`.
  - Assert card status transitioned to `"purged"`. Ciphertext is `null`. Decryption throws `CardPurgedError`.
- **Cancellation Event**: Create reservation with checkout `2026-11-15`. Invoke `handleOtaCancellation` with no penalty.
  - Assert card is purged immediately without advancing time.

---

## 6. Zero-Leakage Forensics & Scanner Engine

The Acceptance Criteria (lines 161-164) mandate that after receiving a reservation with a card, an exhaustive scan across the database blob, state files, logs, audit logs, and API responses must return **zero** occurrences of full PAN and CVV.

### 6.1 Forensic Scanner Implementation
```javascript
/**
 * Exhaustive Zero-Leakage Scanner for PCI DSS and R6 Compliance.
 *
 * @param {object} params
 * @param {string} params.pan - Full PAN that was submitted
 * @param {string} params.cvv - CVV that was submitted
 * @param {object} params.db - In-memory PMS database
 * @param {string} [params.dbFilePath] - Path to database.json copy
 * @param {string} [params.storageFilePath] - Path to wbp_raw_payloads.jsonl
 * @param {string} [params.auditLogFilePath] - Path to audit_logs.jsonl
 * @param {Array<any>} [params.apiResponses] - Captured JSON/text from API calls
 * @param {Array<string>} [params.capturedLogs] - Captured console stdout/stderr lines
 * @returns {{ clean: boolean, violations: Array<string> }}
 */
export function runZeroLeakageForensicAudit({
  pan,
  cvv,
  db,
  dbFilePath,
  storageFilePath,
  auditLogFilePath,
  apiResponses = [],
  capturedLogs = []
}) {
  const violations = [];
  const cleanPan = String(pan).replace(/\D/g, "");
  const cleanCvv = String(cvv || "").trim();

  // Helper: check raw text
  function assertNoLeak(sourceName, text) {
    if (!text || typeof text !== "string") return;
    if (cleanPan.length >= 13 && text.includes(cleanPan)) {
      violations.push(`[LEAK DETECTED] ${sourceName} contains full PAN: ${cleanPan}`);
    }
    if (cleanCvv && cleanCvv.length >= 3) {
      // Avoid false positive matches on random 3-digit numbers by matching JSON string / boundary
      const cvvRegex = new RegExp(`(?:"cvv"|"cvc"|"security_code"|CardCvv)\\s*:\\s*["']?${cleanCvv}["']?`, "i");
      if (cvvRegex.test(text) || text.includes(`"${cleanCvv}"`)) {
        violations.push(`[LEAK DETECTED] ${sourceName} contains CVV: ${cleanCvv}`);
      }
    }
  }

  // 1. In-memory DB
  assertNoLeak("In-Memory PMS Database", JSON.stringify(db));

  // 2. Physical DB File
  if (dbFilePath && fs.existsSync(dbFilePath)) {
    assertNoLeak("database.json", fs.readFileSync(dbFilePath, "utf-8"));
  }

  // 3. Raw Storage (wbp_raw_payloads.jsonl & wbp_idempotency.json)
  if (storageFilePath && fs.existsSync(storageFilePath)) {
    assertNoLeak("wbp_raw_payloads.jsonl", fs.readFileSync(storageFilePath, "utf-8"));
  }

  // 4. Audit Logs (audit_logs.jsonl)
  if (auditLogFilePath && fs.existsSync(auditLogFilePath)) {
    assertNoLeak("audit_logs.jsonl", fs.readFileSync(auditLogFilePath, "utf-8"));
  }

  // 5. API Responses
  apiResponses.forEach((resp, idx) => {
    assertNoLeak(`API Response #${idx}`, typeof resp === "string" ? resp : JSON.stringify(resp));
  });

  // 6. Console Logs
  capturedLogs.forEach((line, idx) => {
    assertNoLeak(`Console Log #${idx}`, line);
  });

  return {
    clean: violations.length === 0,
    violationCount: violations.length,
    violations
  };
}
```

---

## 7. File Layout & Twin Parity Blueprint

Following project rule R10, all backend modules in `artifacts/api-server/` must have an identical byte-for-byte twin in `scripts/`:

```
artifacts/api-server/wbp/vault.mjs  <─── (SHA-256 Parity) ───>  scripts/wbp/vault.mjs
artifacts/api-server/wbp/callbacks.mjs  <─── (SHA-256 Parity) ───>  scripts/wbp/callbacks.mjs
artifacts/api-server/wbp/inbox.mjs  <─── (SHA-256 Parity) ───>  scripts/wbp/inbox.mjs
artifacts/api-server/demo-server.mjs  <─── (SHA-256 Parity) ───>  scripts/demo-server.mjs
```

### Module Responsibilities:
- `artifacts/api-server/wbp/vault.mjs` (NEW):
  - Encapsulates AES-256-GCM cipher and decipher.
  - Manages `_reauthTokens` Map with automatic expiration cleanup.
  - Manages vault records persistence (Postgres / JSON file fallback).
  - Implements `purgeExpiredCards` and `purgeCard`.
  - Exports `createWbpVaultRouter(...)` mounting `/reauth`, `/view`, `/card/:id`, `/purge`, `/status/:id`.
- `artifacts/api-server/wbp/callbacks.mjs` (INTEGRATION):
  - In `createWbpCallbackRouter`: Hook into `BookingCreate` and `NotifyBooking` to encrypt card to vault before `maskPanDeep` and `recordRawPayload`.
- `artifacts/api-server/wbp/inbox.mjs` (INTEGRATION):
  - In `processIncomingOTA`: Attach `cardLast4`, `cardBrand`, `cardExpMonth`, `cardExpYear`, `hasCard`, `vaultStatus`. Link reservation ID to vault record.
  - In `handleOtaCancellation`: Trigger immediate card purge on cancellation without penalty.
- `artifacts/api-server/demo-server.mjs` (MOUNT):
  - Mount `/api/wbp/vault` with `createWbpVaultRouter({ db, vault: defaultVault, logAuditEvent, getAuthUser, verifyPassword })`.

---

## 8. Targeted Test Suite Design: `tests/wbp-integration/m5-vault-ui.test.mjs`

In strict alignment with `AGENTS.md` and user directives:
- **Targeted Scope**: Runs EXCLUSIVELY `node --test tests/wbp-integration/m5-vault-ui.test.mjs`.
- **Zero Production Mutation**:
  - `delete process.env.DATABASE_URL;`
  - `process.env.NODE_ENV = "test";`
  - Temporary isolated DB copy in `os.tmpdir()` (`DATA_FILE`).
  - Temporary isolated `AUDIT_LOG_FILE` in `os.tmpdir()`.
  - Temporary isolated `WBP_RAW_STORAGE_FILE` in `os.tmpdir()`.
  - Temporary isolated `WBP_CARD_VAULT_FILE` in `os.tmpdir()`.
  - Before/after SHA-256 hash assertions proving production `data/database.json` and repository `audit_logs.jsonl` are 100% untouched.

### Test Structure & Assertion Matrix

```
describe("Milestone 5: Feature 25 & 26 (Credit Card Vault Architecture & Security)", () => {

  describe("Group 1: Cryptographic Engine (F25 — R6)", () => {
    it("encrypts with AES-256-GCM using 12-byte IV and 16-byte Auth Tag");
    it("tamper detection: modifying 1 bit of ciphertext or auth tag fails decryption");
    it("AAD binding: ciphertext bound to OrderId cannot be decrypted under different OrderId");
    it("key resolution: loads CREDIT_CARD_VAULT_KEY, WBP_VAULT_KEY, or test in-memory fallback");
    it("CVV absolute purge: passes card with CVV -> CVV is discarded before encryption, 0 CVV in ciphertext");
  });

  describe("Group 2: Admin Step-Up Re-authentication (F26 — R6)", () => {
    it("successful reauth: admin username + password returns 5-minute single-use token");
    it("rejected reauth: incorrect admin password returns 401 Unauthorized and logs failure");
    it("rejected reauth: non-admin user returns 403 Forbidden");
    it("zero session mutation: reauth does not alter normal session cookies or other users' logins");
  });

  describe("Group 3: Token-Based Viewing & Single-Use Burning (F26 — R6)", () => {
    it("view card with valid token: returns decrypted PAN and card details");
    it("single-use burning: second request with identical token returns 403 Forbidden");
    it("token expiration: token past 5 minutes (300s) returns 403 Forbidden");
    it("token reservation binding: token generated for Res A cannot view Res B");
    it("structured audit logging: every view attempt (success/failure) logged in audit_logs.jsonl with actor, but ZERO PAN/CVV");
  });

  describe("Group 4: Auto-Purge Engine & Time-Travel Simulation (F26 — R6)", () => {
    it("rule 1 (7 days post checkout): card remains active at day 5; purged at day 7; ciphertext destroyed");
    it("rule 2 (cancellation): card purged immediately upon cancellation without penalty");
    it("post-purge attempt: viewing purged card returns 410 Gone / purged error");
  });

  describe("Group 5: Zero-Leakage Forensics (R6 Acceptance Criteria)", () => {
    it("processes full OTA reservation with PAN and CVV through inbound pipeline");
    it("exhaustive scan: 0 occurrences of PAN and CVV across in-memory DB, database.json, wbp_raw_payloads.jsonl, audit_logs.jsonl, API responses, and logs");
    it("confirms only masked PAN (**** **** **** 1234) and last 4 digits exist outside vault");
  });

});
```

---

## 9. Conclusion & Implementation Checklist for Worker M5

The architecture outlined above provides a complete, watertight, and PCI DSS-compliant blueprint. The implementing worker can follow these direct implementation steps:

- [ ] 1. Create `artifacts/api-server/wbp/vault.mjs` and mirror to `scripts/wbp/vault.mjs`.
- [ ] 2. Update `artifacts/api-server/wbp/callbacks.mjs` (and mirror in `scripts/wbp/callbacks.mjs`) to vault cards before masking.
- [ ] 3. Update `artifacts/api-server/wbp/inbox.mjs` (and mirror in `scripts/wbp/inbox.mjs`) to link reservations to vault and purge on no-penalty cancellation.
- [ ] 4. Mount `/api/wbp/vault` in `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
- [ ] 5. Implement `tests/wbp-integration/m5-vault-ui.test.mjs` with all 5 assertion groups.
- [ ] 6. Run targeted test: `node --test tests/wbp-integration/m5-vault-ui.test.mjs`.
- [ ] 7. Verify SHA-256 byte parity on all twin files.
