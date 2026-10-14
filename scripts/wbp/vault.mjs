import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isWbpEnabled } from "./config.mjs";

/**
 * Irreversibly strips any variant of CVV/CVC/security code from memory.
 * PCI DSS Requirement 3.2: Sensitive Authentication Data must NEVER be stored, even if encrypted.
 *
 * @param {any} obj
 * @returns {any}
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

/**
 * Detects card brand from PAN digits.
 *
 * @param {string} pan
 * @returns {string}
 */
export function detectCardBrand(pan) {
  if (!pan) return "Desconhecida";
  const clean = String(pan).replace(/\D/g, "");
  if (/^4/.test(clean)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(clean)) return "Mastercard";
  if (/^3[47]/.test(clean)) return "Amex";
  if (/^(6011|65|64[4-9])/.test(clean)) return "Discover";
  if (/^(4011|438935|451416|4576|504175|506699|5067|509|627780|636297|636368|650|6516|6550)/.test(clean)) return "Elo";
  if (/^(30[0-5]|36|38)/.test(clean)) return "Diners";
  if (/^(352[89]|35[3-8][0-9])/.test(clean)) return "JCB";
  if (/^(606282|3841)/.test(clean)) return "Hipercard";
  return "Desconhecida";
}

/**
 * Formats PAN with standard masking: •••• •••• •••• 1234
 *
 * @param {string} pan
 * @returns {string}
 */
export function maskPan(pan) {
  if (!pan) return "";
  const clean = String(pan).replace(/\D/g, "");
  if (clean.length < 4) return "••••";
  const last4 = clean.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

/**
 * Deeply masks any PAN / credit card number in nested objects.
 *
 * @param {any} obj
 * @returns {any}
 */
export function maskPanDeep(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(maskPanDeep);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (/^(card_?number|cardNumber|pan)$/i.test(key) && typeof value === "string") {
      clean[key] = maskPan(value);
    } else {
      clean[key] = maskPanDeep(value);
    }
  }
  return clean;
}

/**
 * Helper to add N days to a YYYY-MM-DD date string.
 *
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves current timestamp in milliseconds, respecting the sandbox time-travel simulation offset.
 *
 * @returns {number}
 */
export function getEffectiveNow() {
  return Date.now() + Number(global.__simulatedTimeOffsetMs || 0);
}

/**
 * CreditCardVault
 *
 * Implements Feature 25 (AES-256-GCM Encrypted Vault) & Feature 26 (Admin Reauth & Auto-Purge).
 * Stores encrypted card details strictly outside main database.json in data/wbp_card_vault.json.
 * Key is resolved from environment variables and never persisted to database or storage.
 */
export class CreditCardVault {
  constructor(options = {}) {
    this.key = this._resolveKey(options.key);
    this.storageFile = this._resolveStoragePath(options.storageFile);
    this.records = new Map();
    this._reauthTokens = new Map();
    this.load();
  }

  /**
   * Resolves a 32-byte binary key from environment or explicit option.
   *
   * @param {string|Buffer} [explicitKey]
   * @returns {Buffer}
   */
  _resolveKey(explicitKey) {
    if (explicitKey) {
      if (Buffer.isBuffer(explicitKey) && explicitKey.length === 32) return explicitKey;
      if (typeof explicitKey === "string" && /^[0-9a-fA-F]{64}$/.test(explicitKey)) {
        return Buffer.from(explicitKey, "hex");
      }
      return crypto.createHash("sha256").update(String(explicitKey)).digest();
    }

    const envKey = process.env.CREDIT_CARD_VAULT_KEY || process.env.WBP_VAULT_KEY;
    if (envKey) {
      if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
        return Buffer.from(envKey, "hex");
      }
      return crypto.createHash("sha256").update(envKey).digest();
    }

    // Test environment fallback: derive deterministic key in test mode
    if (process.env.NODE_ENV === "test") {
      return crypto.createHash("sha256").update("wbp_test_card_vault_key_2026_isolated").digest();
    }

    // Production safe boot fallback: derive local fallback key with flag
    this._usingFallbackKey = true;
    return crypto.createHash("sha256").update("wbp_prod_fallback_key_unconfigured_env").digest();
  }

  /**
   * Resolves physical storage file path.
   * In test mode with DATA_FILE, uses directory of DATA_FILE (e.g. os.tmpdir()).
   *
   * @param {string} [explicitPath]
   * @returns {string}
   */
  _resolveStoragePath(explicitPath) {
    if (explicitPath) return explicitPath;
    if (process.env.WBP_CARD_VAULT_FILE) return process.env.WBP_CARD_VAULT_FILE;

    if (process.env.NODE_ENV === "test" && process.env.DATA_FILE) {
      return path.join(path.dirname(process.env.DATA_FILE), "wbp_card_vault.json");
    }

    return path.resolve(process.cwd(), "data", "wbp_card_vault.json");
  }

  /**
   * Loads persisted vault records from disk.
   */
  load() {
    try {
      if (this.storageFile && fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.records.clear();
          for (const item of list) {
            if (item && item.id) {
              this.records.set(item.id, item);
            }
          }
        }
      }
    } catch (err) {
      // In-memory records preserved on read error
    }
  }

  /**
   * Persists vault records to disk.
   */
  save() {
    try {
      if (!this.storageFile) return;
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.records.values());
      fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      // Ignore or log error
    }
  }

  /**
   * Encrypts card details using AES-256-GCM.
   * Irreversibly discards any CVV before cipher initialization.
   *
   * @param {object} cardData
   * @param {string} [aad] - Additional Authenticated Data (orderId/reservationId)
   * @returns {{ iv: string, authTag: string, ciphertext: string, algorithm: "aes-256-gcm", keyVersion: number }}
   */
  encryptCard(cardData, aad = null) {
    if (!cardData || typeof cardData !== "object") {
      throw new Error("Dados de cartão inválidos para criptografia.");
    }

    if (this._usingFallbackKey && process.env.NODE_ENV !== "test") {
      console.warn(
        "[WBP Vault WARNING] CREDIT_CARD_VAULT_KEY ou WBP_VAULT_KEY não configurada no ambiente. Usando chave derivada de emergência."
      );
    }

    // REDUNDANT DEFENSE-IN-DEPTH: Destroy any CVV variants before cipher processing
    const cleanCard = { ...cardData };
    delete cleanCard.cvv;
    delete cleanCard.card_cvv;
    delete cleanCard.cvc;
    delete cleanCard.security_code;
    delete cleanCard.securityCode;
    delete cleanCard.cid;

    const rawPan = String(cleanCard.cardNumber || cleanCard.pan || "").replace(/\s/g, "");
    if (!rawPan) {
      throw new Error("Número do cartão ausente para criptografia.");
    }

    const payload = JSON.stringify({
      cardNumber: rawPan,
      holderName: String(cleanCard.holderName || cleanCard.cardholderName || cleanCard.CardHolderName || "").trim(),
      expireMonth: String(cleanCard.expireMonth || cleanCard.cardExpMonth || cleanCard.CardExpireMonth || "").trim(),
      expireYear: String(cleanCard.expireYear || cleanCard.cardExpYear || cleanCard.CardExpireYear || "").trim(),
      brand: cleanCard.brand || detectCardBrand(rawPan)
    });

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);

    if (aad) {
      cipher.setAAD(Buffer.from(String(aad), "utf-8"));
    }

    const ciphertext = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]).toString("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return {
      iv: iv.toString("hex"),
      authTag,
      ciphertext,
      algorithm: "aes-256-gcm",
      keyVersion: 1
    };
  }

  /**
   * Decrypts ciphertext using AES-256-GCM.
   *
   * @param {object} encryptedObj
   * @param {string} [aad]
   * @returns {object}
   */
  decryptCard(encryptedObj, aad = null) {
    if (!encryptedObj || !encryptedObj.ciphertext || !encryptedObj.iv || !encryptedObj.authTag) {
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(encryptedObj.iv, "hex"));
    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, "hex"));

    if (aad) {
      decipher.setAAD(Buffer.from(String(aad), "utf-8"));
    }

    const decrypted = decipher.update(Buffer.from(encryptedObj.ciphertext, "hex"), null, "utf-8") + decipher.final("utf-8");
    const parsed = JSON.parse(decrypted);

    // Assert CVV is NEVER returned
    delete parsed.cvv;
    delete parsed.cvc;
    delete parsed.security_code;

    return parsed;
  }

  /**
   * Stores a card record in the encrypted vault.
   *
   * @param {object} params
   * @param {string} [params.orderId]
   * @param {number|string} [params.reservationId]
   * @param {object} params.cardData
   * @param {string} [params.checkoutDate]
   * @returns {object} Created or updated vault record
   */
  storeCard({ orderId = null, reservationId = null, cardData, checkoutDate = null }) {
    if (!cardData) return null;
    const rawPan = String(cardData.cardNumber || cardData.pan || "").replace(/\s/g, "");
    if (!rawPan) return null;

    const brand = cardData.brand || detectCardBrand(rawPan);
    const last4 = rawPan.slice(-4);
    const aad = String(orderId || reservationId || "wbp_card");

    const encrypted = this.encryptCard(cardData, aad);
    const cardId = `vault_${orderId || reservationId || crypto.randomUUID()}`;
    const purgeAfterDate = checkoutDate ? addDays(checkoutDate, 7) : null;

    const record = {
      id: cardId,
      orderId: orderId ? String(orderId) : null,
      reservationId: reservationId ? String(reservationId) : null,
      cardBrand: brand,
      cardLast4: last4,
      cardExpMonth: String(cardData.expireMonth || cardData.cardExpMonth || "").trim(),
      cardExpYear: String(cardData.expireYear || cardData.cardExpYear || "").trim(),
      checkoutDate: checkoutDate || null,
      purgeAfterDate,
      status: "active",
      encrypted,
      aad,
      createdAt: new Date(getEffectiveNow()).toISOString(),
      purgedAt: null,
      purgeReason: null
    };

    this.records.set(record.id, record);
    this.save();
    return record;
  }

  /**
   * Links a reservation ID and checkout date to an existing vault record by external order ID.
   *
   * @param {string} orderId
   * @param {number|string} reservationId
   * @param {string} [checkoutDate]
   */
  linkReservation(orderId, reservationId, checkoutDate = null) {
    if (!orderId) return null;
    const strOrderId = String(orderId);
    for (const record of this.records.values()) {
      if (record.orderId === strOrderId) {
        record.reservationId = String(reservationId);
        if (checkoutDate) {
          record.checkoutDate = checkoutDate;
          record.purgeAfterDate = addDays(checkoutDate, 7);
        }
        this.save();
        return record;
      }
    }
    return null;
  }

  /**
   * Retrieves a vault record by cardId, reservationId, or external orderId.
   *
   * @param {string|number} identifier
   * @returns {object|null}
   */
  getCardRecordByIdentifier(identifier) {
    if (!identifier) return null;
    const str = String(identifier);
    if (this.records.has(str)) return this.records.get(str);

    for (const record of this.records.values()) {
      if (
        record.id === str ||
        String(record.reservationId) === str ||
        String(record.orderId) === str
      ) {
        return record;
      }
    }
    return null;
  }

  /**
   * Decrypts card details for a given identifier (cardId, reservationId, orderId).
   * Returns null if record not found or already purged.
   *
   * @param {string|number} identifier
   * @param {object} [db]
   * @returns {object|null}
   */
  decryptCardByIdentifier(identifier, db = null) {
    const record = this.getCardRecordByIdentifier(identifier);
    if (!record) return null;
    if (record.status === "purged" || !record.encrypted) {
      return null;
    }

    try {
      const data = this.decryptCard(record.encrypted, record.aad);
      if (!data) return null;

      return {
        cardId: record.id,
        orderId: record.orderId,
        reservationId: record.reservationId,
        holderName: data.holderName,
        cardNumber: data.cardNumber,
        expireMonth: data.expireMonth,
        expireYear: data.expireYear,
        brand: data.brand || record.cardBrand,
        last4: record.cardLast4,
        maskedPan: maskPan(data.cardNumber)
      };
    } catch (err) {
      // In case AAD changed between orderId and reservationId, retry without or with alternate AAD
      if (record.reservationId && record.aad !== String(record.reservationId)) {
        try {
          const retryData = this.decryptCard(record.encrypted, String(record.reservationId));
          if (retryData) {
            return {
              cardId: record.id,
              orderId: record.orderId,
              reservationId: record.reservationId,
              holderName: retryData.holderName,
              cardNumber: retryData.cardNumber,
              expireMonth: retryData.expireMonth,
              expireYear: retryData.expireYear,
              brand: retryData.brand || record.cardBrand,
              last4: record.cardLast4,
              maskedPan: maskPan(retryData.cardNumber)
            };
          }
        } catch (_) {}
      }
      return null;
    }
  }

  /**
   * Creates a single-use re-authentication token for an admin user with strictly 5-minute TTL.
   *
   * @param {string} username
   * @param {string|number} [reservationId]
   * @returns {{ token: string, expiresAt: number, expiresInSeconds: number }}
   */
  createReauthToken(username, reservationId = null) {
    const token = crypto.randomUUID();
    const expiresInSeconds = 300; // 5 minutes
    const expiresAt = getEffectiveNow() + expiresInSeconds * 1000;

    this._reauthTokens.set(token, {
      token,
      username,
      reservationId: reservationId ? String(reservationId) : null,
      expiresAt,
      used: false
    });

    return {
      token,
      expiresAt,
      expiresInSeconds
    };
  }

  /**
   * Validates and immediately consumes a re-authentication token.
   * The token is burned upon the very first retrieval (single-use guarantee).
   *
   * @param {string} token
   * @param {string|number} [reservationId]
   * @returns {object|null}
   */
  consumeReauthToken(token, reservationId = null) {
    if (!token || typeof token !== "string") return null;

    const entry = this._reauthTokens.get(token);
    if (!entry) return null;

    // Check expiration (strictly 5 minutes)
    if (getEffectiveNow() > entry.expiresAt || entry.used) {
      this._reauthTokens.delete(token);
      return null;
    }

    // If token was bound to a specific reservation, verify match
    if (reservationId && entry.reservationId && String(entry.reservationId) !== String(reservationId)) {
      this._reauthTokens.delete(token);
      return null;
    }

    // MANDATORY BURNING: Mark used and delete from registry immediately!
    entry.used = true;
    this._reauthTokens.delete(token);

    return entry;
  }

  /**
   * Purges a single card permanently (Rule 2: cancellation without penalty, or manual admin purge).
   * Sets encrypted payload to null and status to 'purged'.
   *
   * @param {string|number} identifier
   * @param {string} [reason="manual_purge"]
   * @param {object} [db]
   * @returns {boolean}
   */
  purgeCard(identifier, reason = "manual_purge", db = null) {
    const record = this.getCardRecordByIdentifier(identifier);
    if (!record || record.status === "purged") return false;

    record.status = "purged";
    record.encrypted = null; // Permanently destroyed
    record.purgedAt = new Date(getEffectiveNow()).toISOString();
    record.purgeReason = reason;

    if (db && Array.isArray(db.reservations)) {
      const res = db.reservations.find(
        r =>
          String(r.id) === String(record.reservationId) ||
          String(r.externalOrderId) === String(record.orderId) ||
          String(r.wbpBookingId) === String(record.orderId)
      );
      if (res) {
        res.vaultStatus = "purged";
        res.cardPurgedAt = record.purgedAt;
        res.cardPurgeReason = reason;
      }
    }

    this.save();
    return true;
  }

  /**
   * Auto-Purge Engine (Rule 1: 7 days post check-out).
   * Purges any card where referenceDate >= checkoutDate + 7 days.
   *
   * @param {string|object} [referenceDateOrOptions] - 'YYYY-MM-DD' or { currentDate: 'YYYY-MM-DD' }
   * @param {object} [db]
   * @returns {number} Count of purged cards
   */
  purgeExpiredCards(referenceDateOrOptions = null, db = null) {
    const effectiveNow = getEffectiveNow();
    const defaultDate = new Date(effectiveNow).toISOString().slice(0, 10);
    const today =
      (typeof referenceDateOrOptions === "string"
        ? referenceDateOrOptions
        : referenceDateOrOptions?.currentDate) || defaultDate;

    let purgedCount = 0;

    for (const record of this.records.values()) {
      if (record.status === "active" && record.purgeAfterDate) {
        if (today >= record.purgeAfterDate) {
          record.status = "purged";
          record.encrypted = null;
          record.purgedAt = new Date(effectiveNow).toISOString();
          record.purgeReason = "7_days_post_checkout";
          purgedCount++;

          if (db && Array.isArray(db.reservations)) {
            const res = db.reservations.find(
              r =>
                String(r.id) === String(record.reservationId) ||
                String(r.externalOrderId) === String(record.orderId) ||
                String(r.wbpBookingId) === String(record.orderId)
            );
            if (res) {
              res.vaultStatus = "purged";
              res.cardPurgedAt = record.purgedAt;
              res.cardPurgeReason = record.purgeReason;
            }
          }
        }
      }
    }

    if (purgedCount > 0) {
      this.save();
    }

    return purgedCount;
  }
}

// Global Singleton Instance
let defaultVaultInstance = null;

/**
 * Returns or initializes the shared CreditCardVault singleton.
 *
 * @param {object} [options]
 * @returns {CreditCardVault}
 */
export function getCardVault(options = {}) {
  if (!defaultVaultInstance || options.forceNew) {
    defaultVaultInstance = new CreditCardVault(options);
  }
  return defaultVaultInstance;
}

// Scheduler state
let purgeSchedulerTimer = null;

/**
 * Starts the daily auto-purge scheduler (Rule 1: 7 days post-checkout).
 * Uses unref() so the background timer does not hold open Node.js test runs or processes.
 *
 * @param {object} [db]
 * @param {CreditCardVault} [vault]
 */
export function startCardAutoPurgeScheduler(db = null, vault = null) {
  if (purgeSchedulerTimer) return;

  // General switch guard: If integration is off, register 0 timers (Requirement R1)
  if (db && !isWbpEnabled(db)) {
    return;
  }

  const targetVault = vault || getCardVault();

  // Run initial pass on startup
  try {
    targetVault.purgeExpiredCards(null, db);
  } catch (_) {}

  // Daily interval (24 hours = 86,400,000 ms)
  const DAY_MS = 24 * 60 * 60 * 1000;
  purgeSchedulerTimer = setInterval(() => {
    try {
      targetVault.purgeExpiredCards(null, db);
    } catch (_) {}
  }, DAY_MS);

  if (typeof purgeSchedulerTimer.unref === "function") {
    purgeSchedulerTimer.unref();
  }
}

/**
 * Stops the daily auto-purge scheduler.
 */
export function stopCardAutoPurgeScheduler() {
  if (purgeSchedulerTimer) {
    clearInterval(purgeSchedulerTimer);
    purgeSchedulerTimer = null;
  }
}

/**
 * Zero-Leakage Forensic Scanner.
 * Recursively inspects memory, database files, raw payloads, audit logs, and API outputs
 * to verify that full PAN and CVV never appear in plaintext.
 *
 * @param {object} params
 * @param {string} params.pan - Full PAN that was submitted
 * @param {string} params.cvv - CVV that was submitted
 * @param {object} [params.db] - In-memory PMS database
 * @param {string} [params.dbFilePath] - Path to database.json
 * @param {string} [params.storageFilePath] - Path to wbp_raw_payloads.jsonl or wbp_storage_state.json
 * @param {string} [params.auditLogFilePath] - Path to audit_logs.jsonl
 * @param {Array<any>} [params.apiResponses] - Captured API responses
 * @param {Array<string>} [params.capturedLogs] - Captured console log strings
 * @returns {{ clean: boolean, violationCount: number, violations: Array<string> }}
 */
export function runZeroLeakageForensicAudit({
  pan,
  cvv,
  db = null,
  dbFilePath = null,
  storageFilePath = null,
  auditLogFilePath = null,
  apiResponses = [],
  capturedLogs = []
}) {
  const violations = [];
  const cleanPan = String(pan || "").replace(/\D/g, "");
  const cleanCvv = String(cvv || "").trim();

  function scanText(sourceName, text) {
    if (!text || typeof text !== "string") return;

    // Check full PAN
    if (cleanPan.length >= 13 && text.includes(cleanPan)) {
      violations.push(`[LEAK DETECTED] ${sourceName} contains unencrypted full PAN: ${cleanPan}`);
    }

    // Check CVV
    if (cleanCvv && cleanCvv.length >= 3) {
      const cvvKeyRegex = new RegExp(`(?:"cvv"|"cvc"|"security_code"|CardCvv)\\s*:\\s*["']?${cleanCvv}["']?`, "i");
      if (cvvKeyRegex.test(text) || text.includes(`"${cleanCvv}"`)) {
        violations.push(`[LEAK DETECTED] ${sourceName} contains unencrypted CVV: ${cleanCvv}`);
      }
    }
  }

  // 1. In-Memory PMS DB
  if (db) {
    scanText("In-Memory PMS Database", JSON.stringify(db));
  }

  // 2. Physical database file
  if (dbFilePath && fs.existsSync(dbFilePath)) {
    scanText("database.json", fs.readFileSync(dbFilePath, "utf-8"));
  }

  // 3. Raw payload storage
  if (storageFilePath && fs.existsSync(storageFilePath)) {
    scanText(path.basename(storageFilePath), fs.readFileSync(storageFilePath, "utf-8"));
  }

  // 4. Audit logs
  if (auditLogFilePath && fs.existsSync(auditLogFilePath)) {
    scanText("audit_logs.jsonl", fs.readFileSync(auditLogFilePath, "utf-8"));
  }

  // 5. API Responses
  apiResponses.forEach((resp, idx) => {
    scanText(`API Response #${idx + 1}`, typeof resp === "string" ? resp : JSON.stringify(resp));
  });

  // 6. Console Logs
  capturedLogs.forEach((line, idx) => {
    scanText(`Console Log #${idx + 1}`, line);
  });

  return {
    clean: violations.length === 0,
    violationCount: violations.length,
    violations
  };
}
