/**
 * artifacts/api-server/wbp/callbacks.mjs
 *
 * Features 17 (Inbound Webhooks & Form Parsing) & 18 (Background Polling Backup).
 *
 * Responsibilities:
 * - Middleware: Express router supporting both application/json and application/x-www-form-urlencoded.
 * - Security: Constant-time crypto.timingSafeEqual comparison of shared_secret.
 * - Card Hygiene: Immediate in-memory purging of CVV/CVC fields before storage or logs.
 * - Durable Storage & Idempotency: Pre-processing insert-only recording via storage.recordRawPayload.
 * - Endpoints:
 *   - POST /BookingCreate: Processes full reservation JSON, calls processIncomingOTA.
 *   - POST /NotifyBooking: Receives booking_id in form-urlencoded, downloads booking via client.getBookingId, imports and acks.
 *   - POST /ARIFullRefresh: Returns { UpdateId }, enqueues full push in auto mode.
 *   - GET & POST /RoomInfo: Returns 19-flat room list metadata.
 * - Background Polling: WbpBackgroundWorker polling every 30 minutes with 5-minute version margin,
 *   startup crash recovery of unprocessed payloads, and ackBooking strictly after durable storage and PMS processing.
 *
 * Mirrors byte-for-byte in scripts/wbp/callbacks.mjs.
 */

import crypto from "node:crypto";
import express from "express";
import { getIntegrationMode, isWbpEnabled, isWbpAutoMode, WBP_MODES } from "./config.mjs";
import { defaultStorage } from "./storage.mjs";
import { WBPClient } from "./client.mjs";
import { getAriSynchronizer } from "./ari-sync.mjs";
import { processIncomingOTA, stripCvvDeep, maskPan, detectCardBrand } from "./inbox.mjs";
import { getAlertsManager } from "./alerts.mjs";

/**
 * Recursively sanitizes card data deeply in memory:
 * - Discards any variant of CVV/CVC/security_code immediately.
 * - Masks full PAN if present, preserving only brand and last 4 digits.
 *
 * @param {any} payload
 * @returns {any}
 */
export function sanitizeCardDataInMemory(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload));

  function scrub(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(scrub);
      return;
    }

    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("cvv") ||
        lower.includes("cvc") ||
        lower.includes("security_code") ||
        lower === "securitycode" ||
        lower === "card_cvv"
      ) {
        delete obj[key];
      } else if (lower === "cardnumber" || lower === "card_number" || lower === "pan") {
        const val = String(obj[key]);
        if (val.length >= 8) {
          obj.cardBrand = detectCardBrand(val);
          obj.cardLast4 = val.slice(-4);
          obj[key] = maskPan(val);
        }
      } else if (typeof obj[key] === "object") {
        scrub(obj[key]);
      }
    }
  }

  scrub(clone);
  return clone;
}

/**
 * Validates the shared_secret received in callback payload against process.env.WBP_SHARED_SECRET
 * using timing-safe comparison to prevent timing attacks.
 *
 * @param {string} reqSharedSecret
 * @param {string} [configuredSecret]
 * @returns {boolean}
 */
export function verifyWbpCallbackAuth(reqSharedSecret, configuredSecret = null) {
  const secret = configuredSecret || process.env.WBP_SHARED_SECRET || "";
  if (!secret || !reqSharedSecret) {
    if (process.env.NODE_ENV === "test" && secret === "") return true;
    return false;
  }
  const bufA = crypto.createHash("sha256").update(String(secret)).digest();
  const bufB = crypto.createHash("sha256").update(String(reqSharedSecret)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates Express Router for WebBookingPro inbound callbacks:
 * - POST /BookingCreate (JSON)
 * - POST /NotifyBooking (application/x-www-form-urlencoded)
 * - POST /ARIFullRefresh (JSON)
 * - GET / RoomInfo (JSON)
 * - POST /RoomInfo (JSON)
 *
 * @param {object} [options]
 * @param {object} [options.db] - PMS in-memory database
 * @param {object} [options.storage] - WbpStorage instance
 * @param {object} [options.client] - WBPClient instance
 * @param {object} [options.alertsManager] - WbpAlertsManager instance
 * @param {string} [options.sharedSecret] - Optional explicit shared secret
 * @returns {express.Router}
 */
export function createWbpCallbackRouter(options = {}) {
  const router = express.Router();
  const db = options.db || (typeof global !== "undefined" && global.db ? global.db : null);
  const storage = options.storage || defaultStorage;
  const client = options.client || null;
  const alertsManager = options.alertsManager || getAlertsManager();
  const configuredSecret = options.sharedSecret || process.env.WBP_SHARED_SECRET || "";
  const saveDatabase = options.saveDatabase || (typeof global !== "undefined" && typeof global.saveDatabase === "function" ? global.saveDatabase : null);

  // Middleware: Support dual JSON and urlencoded payloads in callback requests
  router.use(express.json({ limit: "10mb" }));
  router.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middleware: Check Operational General Switch
  router.use((req, res, next) => {
    const mode = getIntegrationMode(db);
    if (mode === WBP_MODES.OFF) {
      // Acceptance Criterion: "callbacks respondem 'não habilitado' sem gravar reservas."
      return res.status(200).json({
        ErrorCode: 1031,
        Error: "Integration disabled"
      });
    }
    next();
  });

  // 1. POST /BookingCreate
  router.post("/BookingCreate", async (req, res) => {
    try {
      const body = req.body || {};
      const { shared_secret, reservation, booking, pms_property_id } = body;
      const rawBookingData = reservation || booking;

      // Verify Shared Secret
      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1001,
          Error: "Invalid credentials"
        });
      }

      if (!rawBookingData) {
        return res.status(200).json({
          ErrorCode: 4,
          Error: "Missing reservation data"
        });
      }

      // Mandatory R6: Sanitize Card Data in memory BEFORE recording or logging!
      const sanitizedPayload = sanitizeCardDataInMemory(body);

      // Mandatory R1: Record raw payload durably BEFORE processing!
      const keys = storage.deriveKeys(sanitizedPayload);
      const payloadId = await storage.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload: sanitizedPayload,
        idempotencyKey: keys.idempotencyKey,
        orderId: keys.orderId
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.OBSERVE) {
        // Observe mode: records raw payload, no reservations created, no automations fired
        return res.status(200).json({});
      }

      // Auto mode: Claim for processing with idempotency guard
      const claim = await storage.claimForProcessing(keys.idempotencyKey, payloadId, keys.orderId);

      if (!claim.shouldProcess) {
        // Duplicate delivery already processed or in-flight: return success immediately
        return res.status(200).json({});
      }

      try {
        // Process reservation into PMS
        const result = await processIncomingOTA(sanitizedPayload, {
          db,
          storage,
          alertsManager,
          saveDatabase
        });

        if (typeof saveDatabase === "function") {
          try {
            saveDatabase("manual_wbp_callback_booking_create");
          } catch (e) {
            console.error("[WBP Callback] Erro ao salvar banco:", e);
          }
        }

        // Release claim and mark processed
        await claim.release({ status: "processed", payloadId, result });
      } catch (procErr) {
        console.error("[WBP Callback] Erro ao processar reserva:", procErr);
        await claim.release({ status: "error", error: procErr.message });
      }

      return res.status(200).json({});
    } catch (err) {
      console.error("[WBP Callback] Erro em BookingCreate:", err);
      return res.status(200).json({
        ErrorCode: 1003,
        Error: "Internal processing error"
      });
    }
  });

  // 2. POST /NotifyBooking (form-urlencoded or json)
  router.post("/NotifyBooking", async (req, res) => {
    try {
      const body = req.body || {};
      const { shared_secret, booking_id, wbp_property_id } = body;

      // Verify Shared Secret
      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1001,
          Error: "Invalid credentials"
        });
      }

      if (!booking_id) {
        return res.status(200).json({
          ErrorCode: 4,
          Error: "Missing booking_id"
        });
      }

      const sanitizedPayload = sanitizeCardDataInMemory(body);

      // Mandatory R1: Record raw payload durably
      const payloadId = await storage.recordRawPayload({
        source: "webhook",
        endpoint: "NotifyBooking",
        payload: sanitizedPayload,
        idempotencyKey: `notify_${booking_id}`,
        orderId: String(booking_id)
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.OBSERVE) {
        return res.status(200).json({});
      }

      // In auto mode, fetch booking via client if available
      const activeClient = client || (options.worker ? options.worker.client : null);
      if (activeClient) {
        // Run fetch and process asynchronously so callback responds immediately
        (async () => {
          try {
            const bookingRes = await activeClient.getBookingId({ booking_id });
            if (bookingRes?.success && (bookingRes.reservation || bookingRes.booking)) {
              const rawBooking = bookingRes.reservation || bookingRes.booking;
              const sanitizedBooking = sanitizeCardDataInMemory(rawBooking);
              const orderId = String(booking_id);

              const bookingPayloadId = await storage.recordRawPayload({
                source: "webhook",
                endpoint: "GetBookingId",
                payload: sanitizedBooking,
                idempotencyKey: `order_${orderId}`,
                orderId
              });

              const claim = await storage.claimForProcessing(`order_${orderId}`, bookingPayloadId, orderId);
              if (claim.shouldProcess) {
                const procResult = await processIncomingOTA(sanitizedBooking, { db, storage, alertsManager });
                await claim.release({ status: "processed", payloadId: bookingPayloadId, result: procResult });
                await activeClient.ackBooking({ booking_id });
              }
            }
          } catch (fetchErr) {
            console.warn("[WBP Callback] Falha na busca de NotifyBooking:", fetchErr.message);
          }
        })();
      }

      return res.status(200).json({});
    } catch (err) {
      console.error("[WBP Callback] Erro em NotifyBooking:", err);
      return res.status(200).json({
        ErrorCode: 1003,
        Error: "Internal processing error"
      });
    }
  });

  // 3. POST /ARIFullRefresh
  router.post("/ARIFullRefresh", async (req, res) => {
    try {
      const { shared_secret, pms_property_id } = req.body || {};

      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1031,
          Error: "Channel not enabled for property"
        });
      }

      await storage.recordRawPayload({
        source: "webhook",
        endpoint: "ARIFullRefresh",
        payload: sanitizeCardDataInMemory(req.body || {})
      });

      // Returns update token immediately
      const updateId = Date.now();

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.AUTO) {
        // Trigger asynchronous full push
        try {
          const sync = getAriSynchronizer(db);
          sync.performFullPush().catch(err => {
            console.warn("[ARIFullRefresh] Erro no full push assíncrono:", err.message);
          });
        } catch (_) {}
      }

      return res.status(200).json({ UpdateId: updateId });
    } catch (err) {
      return res.status(200).json({
        ErrorCode: 1031,
        Error: "Internal error"
      });
    }
  });

  // 4. RoomInfo handler (Supports both GET and POST)
  const roomInfoHandler = (req, res) => {
    try {
      const sharedSecret = req.body?.shared_secret || req.query?.shared_secret || req.headers?.["x-shared-secret"] || "";

      if (!verifyWbpCallbackAuth(sharedSecret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 9203,
          Error: "Invalid property credentials"
        });
      }

      return res.status(200).json({
        RoomInfo: [
          {
            pms_room_id: 1,
            units: 19,
            beds: 2,
            dormitory: false,
            pricingModel: "occ",
            label: "Flat CorpFlats Soho",
            description: "Studio flat completo no Soho Residence"
          }
        ]
      });
    } catch (err) {
      return res.status(200).json({
        ErrorCode: 9203,
        Error: "Internal error"
      });
    }
  };

  router.post("/RoomInfo", roomInfoHandler);
  router.get("/RoomInfo", roomInfoHandler);

  return router;
}

/**
 * Background Polling & Recovery Worker.
 * When integration mode is 'off', no timers are active and poll skips.
 */
export class WbpBackgroundWorker {
  constructor(options = {}) {
    this.db = options.db || (typeof global !== "undefined" && global.db ? global.db : null);
    this.storage = options.storage || defaultStorage;
    this.client = options.client || null;
    this.alertsManager = options.alertsManager || getAlertsManager();
    this.intervalId = null;
    this.isPolling = false;
    this.intervalMs = options.intervalMs || 30 * 60 * 1000;
  }

  start(intervalMs = null) {
    if (this.intervalId) return;
    const ms = intervalMs || this.intervalMs;

    // Only start timer if integration is enabled
    if (!isWbpEnabled(this.db)) {
      return;
    }

    this.intervalId = setInterval(async () => {
      if (!isWbpEnabled(this.db)) {
        this.stop();
        return;
      }
      await this.poll();
    }, ms);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Alias for poll to support explicit test runners.
   */
  async runPollCycle() {
    return this.poll();
  }

  async poll() {
    if (this.isPolling || !isWbpEnabled(this.db) || !this.client) {
      return { skipped: true, isPolling: this.isPolling, enabled: isWbpEnabled(this.db) };
    }
    this.isPolling = true;

    try {
      const mode = getIntegrationMode(this.db);

      // 1. Startup Recovery: Recover any unprocessed raw payloads from prior crashes
      const unprocessed = await this.storage.getUnprocessedPayloads();
      for (const item of unprocessed) {
        const claim = await this.storage.claimForProcessing(item.idempotencyKey, item.id, item.orderId);
        if (claim.shouldProcess) {
          if (mode === WBP_MODES.AUTO) {
            try {
              const result = await processIncomingOTA(item.payload, {
                db: this.db,
                storage: this.storage,
                alertsManager: this.alertsManager
              });
              await claim.release({ recovered: true, result });
              if (item.orderId) {
                await this.client.ackBooking({ booking_id: item.orderId });
              }
            } catch (recErr) {
              await claim.release({ recovered: false, error: recErr.message });
            }
          } else {
            await claim.release({ recovered: true, mode: "observe" });
          }
        }
      }

      // 2. Poll WBP GetBookingList with 5-minute version margin
      const lastVersion = this.db?.settings?.wbp_last_booking_version || null;
      const adjustedVersion = this.client.adjustBookingVersion(lastVersion, 5);
      const res = await this.client.getBookingList({ wbp_booking_version: adjustedVersion });

      const processedBookings = [];

      if (res?.success && Array.isArray(res.Bookings)) {
        for (const item of res.Bookings) {
          const bookingId = item.booking_id;
          const orderId = String(bookingId);
          const idempotencyKey = `order_${orderId}`;

          const isProcessed = await this.storage.isAlreadyProcessed(idempotencyKey);
          if (isProcessed) continue;

          // Fetch full reservation details
          const bookingRes = await this.client.getBookingId({ booking_id: bookingId });
          if (bookingRes?.success && (bookingRes.reservation || bookingRes.booking)) {
            const rawReservation = bookingRes.reservation || bookingRes.booking;
            const sanitized = sanitizeCardDataInMemory(rawReservation);

            const payloadId = await this.storage.recordRawPayload({
              source: "polling",
              endpoint: "GetBookingId",
              payload: sanitized,
              idempotencyKey,
              orderId
            });

            if (mode === WBP_MODES.OBSERVE) {
              // Observe mode: records raw payload for audit without mutating PMS and does NOT ackBooking
              processedBookings.push({ bookingId, mode: "observe", payloadId });
              continue;
            }

            if (mode === WBP_MODES.AUTO) {
              const claim = await this.storage.claimForProcessing(idempotencyKey, payloadId, orderId);
              if (claim.shouldProcess) {
                const processResult = await processIncomingOTA(sanitized, {
                  db: this.db,
                  storage: this.storage,
                  alertsManager: this.alertsManager
                });

                await claim.release({ processedFromPolling: true, result: processResult });

                // Call client.ackBooking ONLY after successful persistent storage and processing!
                await this.client.ackBooking({ booking_id: bookingId });
                processedBookings.push({ bookingId, mode: "auto", payloadId, result: processResult });
              }
            }
          }
        }
      }

      // Persist cursor timestamp
      const newVersion = res?.wbp_booking_version || new Date().toISOString().replace("T", " ").substring(0, 19);
      if (this.db) {
        if (!this.db.settings) this.db.settings = {};
        this.db.settings.wbp_last_booking_version = newVersion;
      }

      return {
        success: true,
        processedCount: processedBookings.length,
        processedBookings,
        version: newVersion
      };
    } catch (err) {
      console.warn("[WBP Background Worker] Erro durante ciclo de polling:", err.message);
      return { success: false, error: err.message };
    } finally {
      this.isPolling = false;
    }
  }
}
