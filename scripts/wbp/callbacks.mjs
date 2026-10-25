/**
 * artifacts/api-server/wbp/callbacks.mjs
 *
 * Features 17 (Inbound Webhooks & Form Parsing) & 18 (Background Polling Backup)
 * for Channex.io v1 (`POST /channex`, HMAC-SHA256, `GET /api/v1/booking_revisions/feed` + `ack`)
 * and WebBookingPro (`POST /BookingCreate`, `POST /NotifyBooking`, `POST /ARIFullRefresh`, `GET/POST /RoomInfo`).
 *
 * Mirrors byte-for-byte in scripts/wbp/callbacks.mjs.
 */

import crypto from "node:crypto";
import express from "express";
import { getIntegrationMode, getChannexConfig, isWbpEnabled, isWbpAutoMode, WBP_MODES } from "./config.mjs";
import { defaultStorage } from "./storage.mjs";
import { WBPClient, ChannexClient } from "./client.mjs";
import { getAriSynchronizer } from "./ari-sync.mjs";
import { processIncomingOTA, stripCvvDeep, maskPan, detectCardBrand } from "./inbox.mjs";
import { getAlertsManager } from "./alerts.mjs";
import { getCardVault } from "./vault.mjs";

/**
 * Recursively sanitizes card data deeply in memory:
 * - Discards any variant of CVV/CVC/security_code immediately.
 * - Stores card in encrypted vault BEFORE masking PAN.
 * - Masks full PAN if present, preserving only brand and last 4 digits.
 *
 * @param {any} payload
 * @returns {any}
 */
export function sanitizeCardDataInMemory(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload));

  // 1. First pass: scrub all CVV/CVC fields deeply
  function scrubCvv(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(scrubCvv);
      return;
    }
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("cvv") ||
        lower.includes("cvc") ||
        lower.includes("security_code") ||
        lower === "securitycode" ||
        lower === "card_cvv" ||
        lower === "cid"
      ) {
        delete obj[key];
      } else if (typeof obj[key] === "object") {
        scrubCvv(obj[key]);
      }
    }
  }
  scrubCvv(clone);

  // 2. Extract card and store into vault BEFORE masking PAN (supports both WBP and Channex guarantee)
  try {
    const resObj = clone.data?.attributes || clone.attributes || clone.reservation || clone.booking || clone.Booking || clone;
    const cards = Array.isArray(resObj.Cards) ? resObj.Cards : (Array.isArray(resObj.Payments) ? resObj.Payments : []);
    const guarantee = resObj.guarantee || null;
    const rawCard = cards[0] || guarantee || (resObj.cardNumber || resObj.pan || resObj.CardNumber ? resObj : null);
    const orderId = String(
      resObj.ota_reservation_code ||
      resObj.unique_id ||
      resObj.OrderId ||
      resObj.orderId ||
      clone.orderId ||
      clone.OrderId ||
      clone.booking_id ||
      resObj.booking_id ||
      ""
    ).trim();

    if (rawCard) {
      const pan = String(rawCard.CardNumber || rawCard.cardNumber || rawCard.card_number || rawCard.pan || "").replace(/\s/g, "");
      if (pan && pan.length >= 12 && !pan.includes("*") && !pan.includes("•")) {
        const checkoutDate = resObj.departure_date || resObj.checkoutDate || resObj.checkout || resObj.EndDate || null;
        const holderName = rawCard.CardHolderName || rawCard.cardholder_name || rawCard.holderName || resObj.guestName || "Hóspede OTA";
        const expParts = String(rawCard.expiration_date || "").split("/");
        const expireMonth = String(rawCard.CardExpireMonth || rawCard.expMonth || rawCard.expireMonth || expParts[0] || "").trim();
        const expireYear = String(rawCard.CardExpireYear || rawCard.expYear || rawCard.expireYear || expParts[1] || "").trim();
        const brand = detectCardBrand(rawCard.card_type || pan);

        const vault = getCardVault();
        vault.storeCard({
          orderId,
          cardData: {
            cardNumber: pan,
            holderName,
            expireMonth,
            expireYear,
            brand
          },
          checkoutDate
        });
      }
    }
  } catch (_) {}

  // 3. Second pass: deeply mask any full PAN
  function scrubPan(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(scrubPan);
      return;
    }
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (lower === "cardnumber" || lower === "card_number" || lower === "pan") {
        const val = String(obj[key]);
        if (val.length >= 8) {
          obj.cardBrand = detectCardBrand(val);
          obj.cardLast4 = val.replace(/\D/g, "").slice(-4);
          obj[key] = maskPan(val);
        }
      } else if (typeof obj[key] === "object") {
        scrubPan(obj[key]);
      }
    }
  }
  scrubPan(clone);

  return clone;
}

/**
 * Validates the shared_secret received in WBP callback payload against process.env.WBP_SHARED_SECRET
 * using timing-safe comparison to prevent timing attacks.
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
 * Verifies Channex.io Webhook HMAC-SHA256 signature over raw request bytes:
 * Signed message: `${timestampHeader}.${rawBody}`
 * Supports 1 or 2 comma-separated hex signatures in `x-hmac-signature-256` during key rotation,
 * and enforces a 300-second timestamp skew window.
 *
 * @param {string|Buffer} rawBody
 * @param {string|number} timestampHeader - x-hmac-timestamp
 * @param {string} signatureHeader - x-hmac-signature-256
 * @param {string} secret
 * @param {number} [maxSkewSeconds=300]
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifyChannexHmacSignature(
  rawBody,
  timestampHeader,
  signatureHeader,
  secret,
  maxSkewSeconds = 300
) {
  if (!secret) {
    return { valid: true, reason: "no_secret_configured" };
  }
  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: "missing_hmac_headers" };
  }

  const tsNum = Number(timestampHeader);
  if (!Number.isFinite(tsNum)) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > maxSkewSeconds) {
    return { valid: false, reason: "timestamp_skew_exceeded" };
  }

  const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody ?? "");
  const expectedHex = crypto
    .createHmac("sha256", String(secret))
    .update(`${tsNum}.${rawStr}`)
    .digest("hex")
    .toLowerCase();
  const expectedBuf = Buffer.from(expectedHex, "utf8");

  const candidateSignatures = String(signatureHeader)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const sig of candidateSignatures) {
    const sigBuf = Buffer.from(sig, "utf8");
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: true };
    }
  }

  return { valid: false, reason: "signature_mismatch" };
}

/**
 * Creates Express Router for inbound callbacks (Channex.io v1 & WebBookingPro):
 * - POST /channex (Channex.io v1 Webhook with HMAC-SHA256 verification)
 * - POST /BookingCreate (JSON)
 * - POST /NotifyBooking (application/x-www-form-urlencoded)
 * - POST /ARIFullRefresh (JSON)
 * - GET & POST /RoomInfo (JSON)
 */
export function createWbpCallbackRouter(options = {}) {
  const router = express.Router();
  const db = options.db || (typeof global !== "undefined" && global.db ? global.db : null);
  const storage = options.storage || defaultStorage;
  const client = options.client || null;
  const channexClient = options.channexClient || new ChannexClient({ db, ...options });
  const alertsManager = options.alertsManager || getAlertsManager();
  const configuredSecret = options.sharedSecret || process.env.WBP_SHARED_SECRET || "";
  const saveDatabase = options.saveDatabase || (typeof global !== "undefined" && typeof global.saveDatabase === "function" ? global.saveDatabase : null);

  // Middleware: Support dual JSON (capturing rawBody for HMAC-SHA256) and urlencoded payloads
  router.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      }
    })
  );
  router.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middleware: Check Operational General Switch
  router.use((req, res, next) => {
    const mode = getIntegrationMode(db);
    if (mode === WBP_MODES.OFF) {
      return res.status(200).json({
        ErrorCode: 1031,
        Error: "Integration disabled"
      });
    }
    next();
  });

  // 0. POST /channex (Channex.io v1 Webhook Receiver)
  router.post("/channex", async (req, res) => {
    try {
      const body = req.body || {};
      const chxCfg = getChannexConfig(db);
      const webhookSecret = options.webhookSecret || chxCfg.webhookSecret || configuredSecret || "";

      const tsHeader = req.headers["x-hmac-timestamp"];
      const sigHeader = req.headers["x-hmac-signature-256"];

      // If webhook secret is configured OR HMAC headers are sent, verify HMAC-SHA256 over raw bytes
      if (webhookSecret || sigHeader || tsHeader) {
        const rawBody = req.rawBody !== undefined ? req.rawBody : JSON.stringify(body);
        const hmacCheck = verifyChannexHmacSignature(
          rawBody,
          tsHeader,
          sigHeader,
          webhookSecret || "default-secret"
        );
        if (!hmacCheck.valid) {
          return res.status(401).json({
            errors: {
              code: "unauthorized",
              title: `Invalid webhook HMAC signature (${hmacCheck.reason})`
            }
          });
        }
      }

      const eventType = String(body.event || "booking").toLowerCase();
      const rawInner = body.payload || body.data || body;
      const sanitizedPayload = sanitizeCardDataInMemory(body);

      const revisionId = String(
        rawInner?.revision_id ||
        rawInner?.id ||
        body.revision_id ||
        ""
      ).trim();
      const bookingId = String(
        rawInner?.booking_id ||
        rawInner?.attributes?.booking_id ||
        body.booking_id ||
        revisionId ||
        crypto.randomUUID()
      ).trim();

      const idempotencyKey = revisionId ? `chx_rev_${revisionId}` : `chx_evt_${bookingId}_${Date.now()}`;

      // Record raw payload durably BEFORE processing
      const payloadId = await storage.recordRawPayload({
        source: "webhook",
        endpoint: `channex_${eventType}`,
        payload: sanitizedPayload,
        idempotencyKey,
        orderId: bookingId
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.OBSERVE) {
        return res.status(200).json({ status: "observed", payloadId });
      }

      // If the webhook is a lightweight notification (only revision_id/booking_id without full rooms/customer)
      // and channexClient has an API key, fetch the revision or feed from Channex API
      let revisionPayload = rawInner;
      const hasFullDetails = Boolean(
        rawInner?.attributes?.rooms ||
        rawInner?.rooms ||
        rawInner?.data?.attributes?.rooms
      );

      if (!hasFullDetails && revisionId && (channexClient?.apiKey || chxCfg.apiKey)) {
        try {
          const revRes = await channexClient.getBookingRevisionById(revisionId);
          if (revRes?.data) {
            revisionPayload = sanitizeCardDataInMemory(revRes.data);
          }
        } catch (fetchErr) {
          console.warn("[Channex Webhook] Falha ao buscar revision completa:", fetchErr.message);
        }
      }

      // Handle unmapped room/rate explicit webhook events
      if (eventType === "booking_unmapped_room" || eventType === "booking_unmapped_rate") {
        if (revisionPayload && typeof revisionPayload === "object") {
          const targetAttrs = revisionPayload.attributes || revisionPayload;
          if (!Array.isArray(targetAttrs.rooms) || targetAttrs.rooms.length === 0) {
            targetAttrs.rooms = [{ room_type_id: null, rate_plan_id: null, unmapped: true }];
          } else {
            targetAttrs.rooms[0].unmapped = true;
          }
        }
      }

      const claim = await storage.claimForProcessing(idempotencyKey, payloadId, bookingId);
      if (!claim.shouldProcess) {
        return res.status(200).json({ status: "already_processed" });
      }

      let result = null;
      try {
        result = await processIncomingOTA(revisionPayload, {
          db,
          storage,
          alertsManager,
          saveDatabase
        });

        if (typeof saveDatabase === "function") {
          try {
            saveDatabase("manual_channex_webhook");
          } catch (_) {}
        }

        await claim.release({ status: "processed", payloadId, result });

        // Acknowledge revision on Channex ONLY after durable storage and PMS processing
        const ackRevId = revisionId || result?.channexRevisionId;
        if (ackRevId && (channexClient?.apiKey || chxCfg.apiKey)) {
          try {
            await channexClient.ackBookingRevision(ackRevId);
          } catch (ackErr) {
            console.warn("[Channex Webhook] Aviso ao confirmar ACK da revisão:", ackErr.message);
          }
        }
      } catch (procErr) {
        await claim.release({ status: "error", error: procErr.message });
      }

      return res.status(200).json({ status: "ok", result });
    } catch (err) {
      console.error("[Channex Webhook] Erro interno:", err);
      return res.status(200).json({ status: "error", message: err.message });
    }
  });

  // 1. POST /BookingCreate
  router.post("/BookingCreate", async (req, res) => {
    try {
      const body = req.body || {};
      const { shared_secret, reservation, booking } = body;
      const rawBookingData = reservation || booking;

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

      const sanitizedPayload = sanitizeCardDataInMemory(body);
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
        return res.status(200).json({});
      }

      const claim = await storage.claimForProcessing(keys.idempotencyKey, payloadId, keys.orderId);
      if (!claim.shouldProcess) {
        return res.status(200).json({});
      }

      try {
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

  // 2. POST /NotifyBooking
  router.post("/NotifyBooking", async (req, res) => {
    try {
      const body = req.body || {};
      const { shared_secret, booking_id } = body;

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

      const activeClient = client || (options.worker ? options.worker.client : null);
      if (activeClient) {
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
      const { shared_secret } = req.body || {};

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

      const updateId = Date.now();
      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.AUTO) {
        try {
          const sync = getAriSynchronizer(db);
          sync.performFullPush().catch((err) => {
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

  // 4. RoomInfo handler
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
 * Background Polling & Recovery Worker (supports Channex `GET /booking_revisions/feed` + `ack` and WBP `GetBookingList`).
 * When integration mode is 'off', no timers are active and poll skips.
 */
export class WbpBackgroundWorker {
  constructor(options = {}) {
    this.db = options.db || (typeof global !== "undefined" && global.db ? global.db : null);
    this.storage = options.storage || defaultStorage;
    this.client = options.client || null;
    this.channexClient = options.channexClient || new ChannexClient({ db: this.db, ...options });
    this.alertsManager = options.alertsManager || getAlertsManager();
    this.intervalId = null;
    this.isPolling = false;
    this.intervalMs = options.intervalMs || 15 * 60 * 1000;
  }

  start(intervalMs = null) {
    if (this.intervalId) return;
    const ms = intervalMs || this.intervalMs;

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

  async runPollCycle() {
    return this.poll();
  }

  /**
   * Polls Channex `GET /api/v1/booking_revisions/feed` (never `GET /bookings`),
   * records raw payloads durably, processes into PMS in `auto` mode, and acknowledges via `POST /booking_revisions/:id/ack`.
   */
  async pollChannexFeed(options = {}) {
    const mode = getIntegrationMode(this.db);
    if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
      return { skipped: true, reason: "integration_off" };
    }

    const reqOpts = { bypassSwitch: Boolean(options.bypassSwitch) };
    const feedRes = await this.channexClient.getBookingRevisionsFeed(
      { propertyId: options.propertyId || this.channexClient.propertyId },
      reqOpts
    );

    const items = Array.isArray(feedRes?.data) ? feedRes.data : [];
    const processedRevisions = [];

    for (const revItem of items) {
      const revisionId = String(revItem.id || revItem.attributes?.id || "").trim();
      const bookingId = String(revItem.attributes?.booking_id || revisionId).trim();
      const orderId = String(revItem.attributes?.ota_reservation_code || revItem.attributes?.unique_id || bookingId).trim();
      const idempotencyKey = `chx_rev_${revisionId}`;

      const sanitized = sanitizeCardDataInMemory(revItem);
      const payloadId = await this.storage.recordRawPayload({
        source: "polling_channex_feed",
        endpoint: "booking_revisions/feed",
        payload: sanitized,
        idempotencyKey,
        orderId
      });

      if (mode === WBP_MODES.OBSERVE && !options.bypassSwitch) {
        processedRevisions.push({ revisionId, bookingId, orderId, mode: "observe", payloadId, acknowledged: false });
        continue;
      }

      const claim = await this.storage.claimForProcessing(idempotencyKey, payloadId, orderId);
      if (claim.shouldProcess) {
        const processResult = await processIncomingOTA(sanitized, {
          db: this.db,
          storage: this.storage,
          alertsManager: this.alertsManager
        });

        await claim.release({ processedFromChannexFeed: true, result: processResult });

        // Mandatory Channex rule: Acknowledge revision ONLY after durable storage and processing!
        await this.channexClient.ackBookingRevision(revisionId, reqOpts);
        processedRevisions.push({
          revisionId,
          bookingId,
          orderId,
          mode: "auto",
          payloadId,
          acknowledged: true,
          result: processResult
        });
      }
    }

    return {
      success: true,
      provider: "channex",
      processedCount: processedRevisions.length,
      processedRevisions
    };
  }

  async poll() {
    if (this.isPolling || !isWbpEnabled(this.db)) {
      return { skipped: true, isPolling: this.isPolling, enabled: isWbpEnabled(this.db) };
    }
    this.isPolling = true;

    try {
      const mode = getIntegrationMode(this.db);
      const chxCfg = getChannexConfig(this.db);

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
              if (item.idempotencyKey?.startsWith("chx_rev_") && (this.channexClient?.apiKey || chxCfg.apiKey)) {
                const revId = item.idempotencyKey.replace(/^chx_rev_/, "");
                await this.channexClient.ackBookingRevision(revId);
              } else if (item.orderId && this.client) {
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

      // 2. If Channex API Key is configured and no legacy WBP client is forced, poll Channex Feed
      let channexFeedResult = null;
      if (this.channexClient?.apiKey || chxCfg.apiKey) {
        try {
          channexFeedResult = await this.pollChannexFeed();
        } catch (chxErr) {
          console.warn("[Channex Background Worker] Erro ao consultar feed:", chxErr.message);
        }
      }

      if (!this.client) {
        return channexFeedResult || { skipped: true, reason: "no_legacy_client" };
      }

      // 3. Poll WBP GetBookingList with 5-minute version margin
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
                await this.client.ackBooking({ booking_id: bookingId });
                processedBookings.push({ bookingId, mode: "auto", payloadId, result: processResult });
              }
            }
          }
        }
      }

      const newVersion = res?.wbp_booking_version || new Date().toISOString().replace("T", " ").substring(0, 19);
      if (this.db) {
        if (!this.db.settings) this.db.settings = {};
        this.db.settings.wbp_last_booking_version = newVersion;
      }

      return {
        success: true,
        processedCount: processedBookings.length,
        processedBookings,
        channexFeedResult,
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
