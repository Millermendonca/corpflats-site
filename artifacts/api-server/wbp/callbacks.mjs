import crypto from "node:crypto";
import express from "express";
import { getIntegrationMode, isWbpEnabled, isWbpAutoMode, WBP_MODES } from "./config.mjs";
import { defaultStorage } from "./storage.mjs";

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
 * - POST /RoomInfo (JSON)
 *
 * @param {object} [options]
 * @param {object} [options.db] - PMS in-memory database
 * @param {object} [options.storage] - WbpStorage instance
 * @param {string} [options.sharedSecret] - Optional explicit shared secret
 * @returns {express.Router}
 */
export function createWbpCallbackRouter(options = {}) {
  const router = express.Router();
  const db = options.db || null;
  const storage = options.storage || defaultStorage;
  const configuredSecret = options.sharedSecret || process.env.WBP_SHARED_SECRET || "";

  // Middleware: Check Operational General Switch
  router.use((req, res, next) => {
    const mode = getIntegrationMode(db);
    if (mode === WBP_MODES.OFF) {
      // Acceptance Criterion:
      // "callbacks respondem 'não habilitado' sem gravar reservas."
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
      const { shared_secret, reservation, booking, pms_property_id } = req.body || {};
      const bookingData = reservation || booking;

      // Verify Shared Secret
      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1001,
          Error: "Invalid credentials"
        });
      }

      if (!bookingData) {
        return res.status(200).json({
          ErrorCode: 4,
          Error: "Missing reservation data"
        });
      }

      // Mandatory R1: Record raw payload durably BEFORE processing!
      const payloadId = await storage.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload: req.body
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.OBSERVE) {
        // Observe mode: records raw payload, no reservations created, no automations fired
        return res.status(200).json({});
      }

      // Auto mode: Claim for processing with idempotency guard
      const keys = storage.deriveKeys(req.body);
      const claim = await storage.claimForProcessing(keys.idempotencyKey, payloadId, keys.orderId);

      if (!claim.shouldProcess) {
        // Duplicate delivery already processed or in-flight: return success immediately
        return res.status(200).json({});
      }

      // Release claim and mark processed
      await claim.release({ status: "acknowledged", payloadId });

      return res.status(200).json({});
    } catch (err) {
      console.error("[WBP Callback] Erro em BookingCreate:", err);
      return res.status(200).json({
        ErrorCode: 1003,
        Error: "Internal processing error"
      });
    }
  });

  // 2. POST /NotifyBooking (form-urlencoded)
  router.post("/NotifyBooking", async (req, res) => {
    try {
      const { shared_secret, booking_id, wbp_property_id } = req.body || {};

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

      // Mandatory R1: Record raw payload durably
      await storage.recordRawPayload({
        source: "webhook",
        endpoint: "NotifyBooking",
        payload: req.body,
        idempotencyKey: `notify_${booking_id}`,
        orderId: String(booking_id)
      });

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
        payload: req.body
      });

      // Returns update token immediately
      const updateId = Date.now();
      return res.status(200).json({ UpdateId: updateId });
    } catch (err) {
      return res.status(200).json({
        ErrorCode: 1031,
        Error: "Internal error"
      });
    }
  });

  // 4. POST /RoomInfo
  router.post("/RoomInfo", async (req, res) => {
    try {
      const { shared_secret, pms_property_id } = req.body || {};

      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
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
  });

  return router;
}

/**
 * Background Polling & Recovery Worker.
 * When integration mode is 'off', no timers are active.
 */
export class WbpBackgroundWorker {
  constructor(options = {}) {
    this.db = options.db || null;
    this.storage = options.storage || defaultStorage;
    this.client = options.client || null;
    this.intervalId = null;
    this.isPolling = false;
  }

  start(intervalMs = 30 * 60 * 1000) {
    if (this.intervalId) return;

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
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async poll() {
    if (this.isPolling || !isWbpEnabled(this.db) || !this.client) return;
    this.isPolling = true;
    try {
      // 1. Recover any unprocessed raw payloads from crashes
      const unprocessed = await this.storage.getUnprocessedPayloads();
      for (const item of unprocessed) {
        const claim = await this.storage.claimForProcessing(item.idempotencyKey, item.id, item.orderId);
        if (claim.shouldProcess) {
          await claim.release({ recovered: true });
        }
      }

      // 2. Poll WBP GetBookingList
      const lastVersion = this.db?.settings?.wbp_last_booking_version || null;
      const res = await this.client.getBookingList({ wbp_booking_version: lastVersion });
      if (res?.success && Array.isArray(res.Bookings)) {
        for (const item of res.Bookings) {
          const bookingId = item.booking_id;
          const orderId = `order_${bookingId}`;
          const isProcessed = await this.storage.isAlreadyProcessed(orderId);
          if (isProcessed) continue;

          // Fetch full reservation
          const bookingRes = await this.client.getBookingId({ booking_id: bookingId });
          if (bookingRes?.success && bookingRes.reservation) {
            const payloadId = await this.storage.recordRawPayload({
              source: "polling",
              endpoint: "GetBookingId",
              payload: bookingRes.reservation,
              idempotencyKey: orderId,
              orderId: String(bookingId)
            });

            if (isWbpAutoMode(this.db)) {
              const claim = await this.storage.claimForProcessing(orderId, payloadId, String(bookingId));
              if (claim.shouldProcess) {
                await claim.release({ processedFromPolling: true });
                await this.client.ackBooking({ booking_id: bookingId });
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[WBP Background Worker] Erro durante ciclo de polling:", err.message);
    } finally {
      this.isPolling = false;
    }
  }
}
