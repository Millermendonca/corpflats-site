import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * WebBookingPro Durable Raw Storage & Idempotency Engine.
 *
 * Guarantees:
 * 1. Insert-only raw storage outside PostgreSQL `system_store` JSONB blob and completely immune to `pruneDatabase`.
 * 2. Dedicated durable JSONL file in local/test mode without Postgres.
 * 3. Idempotency tracking table/map ensuring identical payloads (or OrderId) delivered multiple times produce exactly 1 processed record.
 * 4. Crash recovery: resumes unprocessed raw payloads upon process restart.
 * 5. Concurrent deduplication: prevents race conditions when 5 callbacks and 3 polling requests deliver the same OrderId concurrently.
 */

export class WbpStorage {
  /**
   * @param {object} [options]
   * @param {string} [options.storageFilePath] - Path for raw JSONL file in file mode
   * @param {string} [options.idempotencyFilePath] - Path for idempotency JSON file in file mode
   * @param {object} [options.pgPool] - PostgreSQL connection pool
   */
  constructor(options = {}) {
    this.pgPool = options.pgPool || null;
    this.storageFilePath = options.storageFilePath ||
      process.env.WBP_RAW_STORAGE_FILE ||
      path.resolve(process.cwd(), "data/wbp_raw_payloads.jsonl");
    this.idempotencyFilePath = options.idempotencyFilePath ||
      process.env.WBP_IDEMPOTENCY_FILE ||
      path.resolve(process.cwd(), "data/wbp_idempotency.json");

    // In-memory concurrency locks for in-flight processing: Map<idempotencyKey, { promise, resolve, reject, timestamp }>
    this._inFlightLocks = new Map();
    // Memory cache for file-mode idempotency to avoid constant disk reads
    this._idempotencyCache = null;
    this._initialized = false;
  }

  /**
   * Initializes database tables or creates local storage files.
   */
  async init() {
    if (this._initialized) return;

    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          CREATE TABLE IF NOT EXISTS wbp_raw_payloads (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            idempotency_key TEXT,
            order_id TEXT,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'unprocessed',
            result JSONB,
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processed_at TIMESTAMPTZ
          );
          CREATE INDEX IF NOT EXISTS idx_wbp_raw_status ON wbp_raw_payloads (status);
          CREATE INDEX IF NOT EXISTS idx_wbp_raw_idempotency ON wbp_raw_payloads (idempotency_key);
          CREATE INDEX IF NOT EXISTS idx_wbp_raw_order ON wbp_raw_payloads (order_id);

          CREATE TABLE IF NOT EXISTS wbp_idempotency (
            idempotency_key TEXT PRIMARY KEY,
            payload_id TEXT NOT NULL,
            order_id TEXT,
            status TEXT NOT NULL,
            result JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processed_at TIMESTAMPTZ
          );
          CREATE INDEX IF NOT EXISTS idx_wbp_idem_order ON wbp_idempotency (order_id);
        `);
      } catch (err) {
        console.warn("[WbpStorage] Falha ao criar tabelas no PostgreSQL, fallback para arquivo:", err.message);
        this.pgPool = null;
      }
    }

    if (!this.pgPool) {
      const storageDir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      if (!fs.existsSync(this.storageFilePath)) {
        fs.writeFileSync(this.storageFilePath, "", "utf-8");
      }

      const idemDir = path.dirname(this.idempotencyFilePath);
      if (!fs.existsSync(idemDir)) {
        fs.mkdirSync(idemDir, { recursive: true });
      }
      this._loadIdempotencyCache();
    }

    this._initialized = true;
  }

  /**
   * Helper to derive an idempotency key and orderId from incoming payload.
   *
   * @param {any} payload
   * @param {string} [explicitKey]
   * @returns {{ idempotencyKey: string, orderId: string | null }}
   */
  deriveKeys(payload, explicitKey = null) {
    if (explicitKey) {
      return { idempotencyKey: String(explicitKey), orderId: null };
    }

    // Try finding OrderId in standard WBP structures
    const reservation = payload?.reservation || payload?.Booking || payload?.booking || payload;
    const orderId = reservation?.OrderId ||
      reservation?.orderId ||
      reservation?.booking_id ||
      payload?.OrderId ||
      payload?.orderId ||
      payload?.booking_id ||
      null;

    if (orderId) {
      const cleanOrderId = String(orderId).trim();
      return {
        idempotencyKey: `order_${cleanOrderId}`,
        orderId: cleanOrderId
      };
    }

    // If no order ID, compute deterministic SHA-256 hash of the JSON payload
    const hash = crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
    return {
      idempotencyKey: `hash_${hash}`,
      orderId: null
    };
  }

  /**
   * Records a raw payload before any processing occurs.
   * Completely insert-only and durable.
   *
   * @param {object} params
   * @param {"webhook" | "polling" | "callback"} params.source
   * @param {string} params.endpoint
   * @param {any} params.payload
   * @param {string} [params.idempotencyKey]
   * @param {string} [params.orderId]
   * @returns {Promise<string>} payloadId
   */
  async recordRawPayload({ source, endpoint, payload, idempotencyKey = null, orderId = null }) {
    await this.init();

    const id = `raw_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const keys = this.deriveKeys(payload, idempotencyKey);
    const finalIdempotencyKey = keys.idempotencyKey;
    const finalOrderId = orderId || keys.orderId;
    const createdAt = new Date().toISOString();

    if (this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO wbp_raw_payloads 
            (id, source, endpoint, idempotency_key, order_id, payload, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'unprocessed', $7)`,
          [id, source, endpoint, finalIdempotencyKey, finalOrderId, JSON.stringify(payload), createdAt]
        );
        return id;
      } catch (err) {
        console.warn("[WbpStorage] Erro ao gravar payload bruto no Postgres, gravando em arquivo local:", err.message);
      }
    }

    // File mode JSONL insert-only
    const line = JSON.stringify({
      id,
      source,
      endpoint,
      idempotencyKey: finalIdempotencyKey,
      orderId: finalOrderId,
      payload,
      status: "unprocessed",
      result: null,
      error: null,
      createdAt,
      processedAt: null
    }) + "\n";

    fs.appendFileSync(this.storageFilePath, line, "utf-8");
    return id;
  }

  /**
   * Checks whether an idempotency key has already been successfully processed.
   *
   * @param {string} idempotencyKey
   * @returns {Promise<boolean>}
   */
  async isAlreadyProcessed(idempotencyKey) {
    await this.init();
    if (!idempotencyKey) return false;

    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(
          "SELECT status FROM wbp_idempotency WHERE idempotency_key = $1",
          [idempotencyKey]
        );
        return res.rows.length > 0 && res.rows[0].status === "processed";
      } catch (err) {
        console.warn("[WbpStorage] Erro ao checar idempotência no Postgres:", err.message);
      }
    }

    this._loadIdempotencyCache();
    const entry = this._idempotencyCache[idempotencyKey];
    return entry?.status === "processed";
  }

  /**
   * Claims processing right for an idempotency key.
   * If the key is already processed or currently being processed by another concurrent request,
   * returns shouldProcess: false to guarantee exactly-once processing.
   *
   * @param {string} idempotencyKey
   * @param {string} payloadId
   * @param {string} [orderId]
   * @returns {Promise<{ shouldProcess: boolean, reason?: string, release?: (result?: any, error?: any) => Promise<void> }>}
   */
  async claimForProcessing(idempotencyKey, payloadId, orderId = null) {
    await this.init();

    // 1. Check if already processed
    const alreadyProcessed = await this.isAlreadyProcessed(idempotencyKey);
    if (alreadyProcessed) {
      return { shouldProcess: false, reason: "ALREADY_PROCESSED" };
    }

    // 2. Check if currently in-flight
    if (this._inFlightLocks.has(idempotencyKey)) {
      return { shouldProcess: false, reason: "IN_FLIGHT" };
    }

    // 3. Acquire in-flight lock
    let resolveLock;
    let rejectLock;
    const lockPromise = new Promise((res, rej) => {
      resolveLock = res;
      rejectLock = rej;
    });

    this._inFlightLocks.set(idempotencyKey, {
      promise: lockPromise,
      resolve: resolveLock,
      reject: rejectLock,
      payloadId,
      timestamp: Date.now()
    });

    const release = async (result = null, error = null) => {
      try {
        if (!error) {
          await this.markPayloadProcessed({
            payloadId,
            idempotencyKey,
            orderId,
            result,
            error: null
          });
        }
      } finally {
        this._inFlightLocks.delete(idempotencyKey);
        if (resolveLock) resolveLock(result);
      }
    };

    return {
      shouldProcess: true,
      release
    };
  }

  /**
   * Marks a payload as processed.
   *
   * @param {object} params
   * @param {string} params.payloadId
   * @param {string} params.idempotencyKey
   * @param {string} [params.orderId]
   * @param {any} [params.result]
   * @param {string} [params.error]
   */
  async markPayloadProcessed({ payloadId, idempotencyKey, orderId = null, result = null, error = null }) {
    await this.init();
    const processedAt = new Date().toISOString();
    const status = error ? "failed" : "processed";

    if (this.pgPool) {
      try {
        await this.pgPool.query(
          `UPDATE wbp_raw_payloads 
           SET status = $1, result = $2, error = $3, processed_at = $4 
           WHERE id = $5`,
          [status, result ? JSON.stringify(result) : null, error, processedAt, payloadId]
        );

        await this.pgPool.query(
          `INSERT INTO wbp_idempotency 
            (idempotency_key, payload_id, order_id, status, result, processed_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (idempotency_key) DO UPDATE 
           SET status = $4, result = $5, processed_at = $6`,
          [idempotencyKey, payloadId, orderId, status, result ? JSON.stringify(result) : null, processedAt]
        );
        return;
      } catch (err) {
        console.warn("[WbpStorage] Erro ao marcar processado no Postgres:", err.message);
      }
    }

    // File mode
    this._loadIdempotencyCache();
    this._idempotencyCache[idempotencyKey] = {
      payloadId,
      orderId,
      status,
      result,
      error,
      processedAt
    };
    this._idempotencyCache[`_payload_${payloadId}`] = {
      status,
      result,
      error,
      processedAt
    };
    this._saveIdempotencyCache();
  }

  /**
   * Retrieves all unprocessed payloads (for startup recovery and background processing).
   *
   * @returns {Promise<Array<object>>}
   */
  async getUnprocessedPayloads() {
    await this.init();

    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(
          "SELECT * FROM wbp_raw_payloads WHERE status = 'unprocessed' ORDER BY created_at ASC"
        );
        return res.rows.map(row => ({
          id: row.id,
          source: row.source,
          endpoint: row.endpoint,
          idempotencyKey: row.idempotency_key,
          orderId: row.order_id,
          payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
          status: row.status,
          createdAt: row.created_at
        }));
      } catch (err) {
        console.warn("[WbpStorage] Erro ao buscar payloads não processados no Postgres:", err.message);
      }
    }

    if (!fs.existsSync(this.storageFilePath)) {
      return [];
    }

    this._loadIdempotencyCache();
    const content = fs.readFileSync(this.storageFilePath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim().length > 0);
    const unprocessed = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const payloadStatus = this._idempotencyCache[`_payload_${item.id}`]?.status;
        const keyStatus = item.idempotencyKey ? this._idempotencyCache[item.idempotencyKey]?.status : null;

        if (payloadStatus === "processed" || keyStatus === "processed") {
          continue;
        }

        unprocessed.push(item);
      } catch (_) {}
    }

    return unprocessed;
  }

  /**
   * Returns total count of raw payloads stored (for audit verification).
   *
   * @returns {Promise<number>}
   */
  async getRawPayloadCount() {
    await this.init();

    if (this.pgPool) {
      try {
        const res = await this.pgPool.query("SELECT COUNT(*)::int AS count FROM wbp_raw_payloads");
        return res.rows[0].count;
      } catch (_) {}
    }

    if (!fs.existsSync(this.storageFilePath)) return 0;
    const content = fs.readFileSync(this.storageFilePath, "utf-8");
    return content.split("\n").filter(l => l.trim().length > 0).length;
  }

  /**
   * Internal helper to load idempotency JSON map.
   */
  _loadIdempotencyCache() {
    if (this._idempotencyCache !== null) return;
    try {
      if (fs.existsSync(this.idempotencyFilePath)) {
        const data = fs.readFileSync(this.idempotencyFilePath, "utf-8");
        this._idempotencyCache = JSON.parse(data || "{}");
      } else {
        this._idempotencyCache = {};
      }
    } catch (_) {
      this._idempotencyCache = {};
    }
  }

  /**
   * Internal helper to write idempotency JSON map atomically.
   */
  _saveIdempotencyCache() {
    try {
      const tmp = `${this.idempotencyFilePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._idempotencyCache || {}, null, 2), "utf-8");
      fs.renameSync(tmp, this.idempotencyFilePath);
    } catch (err) {
      console.warn("[WbpStorage] Falha ao salvar arquivo de idempotência:", err.message);
    }
  }

  /**
   * Clears storage (used exclusively by test suites for isolated runs).
   */
  async clear() {
    this._inFlightLocks.clear();
    this._idempotencyCache = {};

    if (this.pgPool) {
      try {
        await this.pgPool.query("TRUNCATE TABLE wbp_raw_payloads, wbp_idempotency");
      } catch (_) {}
    }

    if (fs.existsSync(this.storageFilePath)) {
      fs.writeFileSync(this.storageFilePath, "", "utf-8");
    }
    if (fs.existsSync(this.idempotencyFilePath)) {
      fs.writeFileSync(this.idempotencyFilePath, "{}", "utf-8");
    }
  }
}

// Default singleton instance
export const defaultStorage = new WbpStorage();

export const recordRawPayload = (params) => defaultStorage.recordRawPayload(params);
export const markPayloadProcessed = (params) => defaultStorage.markPayloadProcessed(params);
export const isAlreadyProcessed = (key) => defaultStorage.isAlreadyProcessed(key);
export const claimForProcessing = (key, payloadId, orderId) => defaultStorage.claimForProcessing(key, payloadId, orderId);
export const getUnprocessedPayloads = () => defaultStorage.getUnprocessedPayloads();
export const getRawPayloadCount = () => defaultStorage.getRawPayloadCount();
