import http from "node:http";
import express from "express";
import { validateRequest } from "./schemas/index.mjs";

/**
 * Local WebBookingPro (WBP) API Simulator.
 *
 * Implements a faithful, local, isolated mock server of the WebBookingPro Build-To-Us v1.0 API:
 * 1. Validates all incoming requests against OpenAPI schemas (wbpAPI.yaml) with tolerant errata handling.
 * 2. Provides programmable failure modes (error codes 1001, 1002, 1102, delays, timeouts).
 * 3. Supports programmatic booking injection (new, modified, cancelled).
 * 4. Implements webhook dispatchers (BookingCreate, NotifyBooking with form-urlencoded, ARIFullRefresh, RoomInfo).
 * 5. Records comprehensive request history for testing assertions.
 */
export class WBPSimulator {
  /**
   * @param {object} [options]
   * @param {string} [options.sharedSecret]
   * @param {string|number} [options.wbpPropertyId]
   * @param {string} [options.pmsPropertyId]
   * @param {string} [options.currency]
   * @param {boolean} [options.strictSchemas]
   */
  constructor(options = {}) {
    this.sharedSecret = options.sharedSecret || "s3cr3ts4uc3";
    this.wbpPropertyId = options.wbpPropertyId || "111";
    this.pmsPropertyId = options.pmsPropertyId || "soho-19";
    this.currency = options.currency || "BRL";
    this.strictSchemas = options.strictSchemas || false;

    this.server = null;
    this.port = null;
    this.url = null;

    // State collections
    this.receivedRequests = [];
    this.receivedARI = [];
    this.failureModes = new Map();
    this.bookings = new Map();
    this.acknowledgedBookings = new Set();
    this.simulatedMessages = [];
    this.simulatedReviews = [];
    this.sentMessagesHistory = [];
    this.reviewResponsesHistory = [];

    // Default room types and rate plans
    this.roomTypes = [
      {
        wbp_room_id: 111,
        label: "Flat",
        title: "Flat",
        maxPersons: 3,
        dorm: false
      }
    ];

    this.ratePlans = [
      {
        wbp_room_id: "0",
        wbp_rate_id: "sem_cafe",
        title: "Sem Café (Tarifa Padrão)"
      },
      {
        wbp_room_id: "0",
        wbp_rate_id: "com_cafe",
        title: "Com Café da Manhã"
      }
    ];

    this.app = this._createExpressApp();
  }

  /**
   * Builds the internal Express routing and handlers.
   */
  _createExpressApp() {
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging and failure interception middleware
    const handleEndpoint = (verb) => async (req, res) => {
      const record = {
        verb,
        path: req.path,
        guid: req.body?.guid || null,
        body: req.body,
        headers: req.headers,
        timestamp: Date.now()
      };
      this.receivedRequests.push(record);

      // Validate schema
      const validation = validateRequest(verb, req.body, { tolerant: !this.strictSchemas });
      if (!validation.valid && this.strictSchemas) {
        return res.status(400).json({
          success: false,
          errors: validation.errors.map((msg, i) => ({ id: 4000 + i, msg }))
        });
      }

      // Check for programmable failure mode
      const failure = this.failureModes.get(verb) || this.failureModes.get(req.path);
      if (failure) {
        if (failure.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, failure.delayMs));
        }
        if (failure.dropConnection) {
          req.socket.destroy();
          return;
        }
        if (failure.errorCode) {
          return res.status(failure.status || 200).json({
            success: false,
            errors: [
              {
                id: failure.errorCode,
                msg: failure.errorMessage || `Erro simulado [${failure.errorCode}]`
              }
            ]
          });
        }
        if (failure.status && failure.status >= 400) {
          return res.status(failure.status).json(failure.body || { error: "Erro de servidor simulado" });
        }
      }

      // Specific endpoint behavior
      switch (verb) {
        case "HealthCheck":
          return res.json({ success: true });

        case "SetupProperty":
          return res.json({ success: true });

        case "GetRoomTypes":
          return res.json({
            success: true,
            Rooms: this.roomTypes
          });

        case "GetRatePlans":
          return res.json({
            success: true,
            RatePlans: this.ratePlans
          });

        case "ARIUpdate":
          if (Array.isArray(req.body?.Inventory)) {
            this.receivedARI.push(...req.body.Inventory);
          }
          return res.json({ success: true });

        case "GetBookingList": {
          const list = [];
          for (const [id, booking] of this.bookings.entries()) {
            list.push({
              booking_id: id,
              version: String(booking.version || 1)
            });
          }
          return res.json({
            success: true,
            Bookings: list
          });
        }

        case "GetBookingId": {
          const bookingId = String(req.body?.booking_id);
          const found = this.bookings.get(bookingId);
          if (!found) {
            return res.json({
              success: false,
              errors: [{ id: 4004, msg: `Reserva não encontrada: ${bookingId}` }]
            });
          }
          // Tolerates both 'reservation' and 'Booking' per Erratum E1
          return res.json({
            success: true,
            reservation: found.payload
          });
        }

        case "AckBooking": {
          const ackId = String(req.body?.booking_id);
          this.acknowledgedBookings.add(ackId);
          return res.json({ success: true });
        }

        case "GetMessages": {
          return res.json({
            success: true,
            Messages: this.simulatedMessages
          });
        }

        case "SendMessage": {
          const sentItem = {
            wbp_Message_id: req.body?.wbp_Message_id || 111,
            message: req.body?.message || req.body?.text || "",
            timestamp: new Date().toISOString()
          };
          this.sentMessagesHistory.push(sentItem);
          return res.json({
            success: true,
            wbp_Message_id: sentItem.wbp_Message_id
          });
        }

        case "GetReviews": {
          return res.json({
            success: true,
            Reviews: this.simulatedReviews
          });
        }

        case "RespondReview": {
          const respItem = {
            wbp_review_id: req.body?.wbp_review_id || 111,
            response: req.body?.response || "",
            timestamp: new Date().toISOString()
          };
          this.reviewResponsesHistory.push(respItem);
          return res.json({
            success: true,
            wbp_review_id: respItem.wbp_review_id
          });
        }

        default:
          return res.status(404).json({ success: false, errors: [{ id: 1000, msg: "Endpoint não encontrado" }] });
      }
    };

    // Mount both standard root paths and CloudPMS paths
    const verbs = [
      "HealthCheck",
      "SetupProperty",
      "GetRoomTypes",
      "GetRatePlans",
      "ARIUpdate",
      "GetBookingList",
      "GetBookingId",
      "AckBooking",
      "GetMessages",
      "SendMessage",
      "GetReviews",
      "RespondReview"
    ];

    for (const v of verbs) {
      app.post(`/${v}`, handleEndpoint(v));
      app.post(`/api/cloudpms/${v}`, handleEndpoint(v));
    }

    // Programmatic test control endpoints
    app.post("/simulator/control/failure", (req, res) => {
      const { endpoint, ...opts } = req.body;
      this.setFailureMode(endpoint, opts);
      res.json({ success: true });
    });

    app.get("/simulator/control/requests", (req, res) => {
      res.json({ requests: this.receivedRequests });
    });

    app.post("/simulator/control/reset", (req, res) => {
      this.reset();
      res.json({ success: true });
    });

    return app;
  }

  /**
   * Starts the HTTP server on a specified or ephemeral port.
   *
   * @param {number} [port=0]
   * @returns {Promise<number>} the listening port
   */
  async start(port = 0) {
    if (this.server) return this.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.app);
      this.server.listen(port, "127.0.0.1", () => {
        const address = this.server.address();
        this.port = typeof address === "object" ? address.port : port;
        this.url = `http://127.0.0.1:${this.port}`;
        resolve(this.port);
      });
      this.server.on("error", reject);
    });
  }

  /**
   * Stops the HTTP server.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        this.port = null;
        this.url = null;
        resolve();
      });
    });
  }

  /**
   * Clears state, history, and failure modes.
   */
  reset() {
    this.receivedRequests = [];
    this.receivedARI = [];
    this.failureModes.clear();
    this.bookings.clear();
    this.acknowledgedBookings.clear();
    this.simulatedMessages = [];
    this.simulatedReviews = [];
    this.sentMessagesHistory = [];
    this.reviewResponsesHistory = [];
  }

  /**
   * Configures a programmable failure mode.
   *
   * @param {string} endpoint - e.g. "SetupProperty" or "ARIUpdate"
   * @param {object} options
   * @param {number} [options.status]
   * @param {number} [options.errorCode] - 1001, 1002, 1102, etc.
   * @param {string} [options.errorMessage]
   * @param {number} [options.delayMs]
   * @param {boolean} [options.dropConnection]
   */
  setFailureMode(endpoint, options = {}) {
    this.failureModes.set(endpoint, options);
  }

  /**
   * Clears all active failure modes.
   */
  clearFailureModes() {
    this.failureModes.clear();
  }

  /**
   * Injects a new simulated booking into the simulator repository.
   *
   * @param {object} [custom] - Partial booking payload
   * @returns {string} booking_id (OrderId)
   */
  injectBooking(custom = {}) {
    const orderId = custom.OrderId || custom.orderId || `WBP-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const orderDate = custom.OrderDate || new Date().toISOString().split("T")[0];
    const orderTime = custom.OrderTime || "14:00:00";

    const payload = {
      OrderId: orderId,
      OrderDate: orderDate,
      OrderTime: orderTime,
      OrderModifDate: null,
      OrderModifTime: null,
      IsCancellation: custom.IsCancellation || 0,
      IsModification: custom.IsModification || 0,
      OrderAdults: custom.OrderAdults || 2,
      OrderChildren: custom.OrderChildren || 0,
      OrderCustomers: custom.OrderCustomers || 2,
      TotalCurrency: custom.TotalCurrency || this.currency,
      TotalPrice: custom.TotalPrice || 553.26,
      PaymentCollect: custom.PaymentCollect || "Channel",
      Channel: custom.Channel || "booking",
      Customers: custom.Customers || [
        {
          CustomerFName: "Carlos",
          CustomerLName: "Silva",
          CustomerEmail: "carlos.silva@example.com",
          CustomerCountry: "BR"
        }
      ],
      Rooms: custom.Rooms || [
        {
          ChannelRoomType: "111",
          StartDate: "2026-10-20",
          EndDate: "2026-10-22",
          Units: 1,
          Adults: 2,
          Children: 0,
          Babies: 0,
          Occupancy: 2,
          Currency: this.currency,
          Price: 553.26,
          RateDesc: "Sem Café",
          RateId: "sem_cafe",
          DayRates: [
            {
              Date: "2026-10-20",
              Rate: 276.63,
              Currency: this.currency,
              RateId: "sem_cafe"
            },
            {
              Date: "2026-10-21",
              Rate: 276.63,
              Currency: this.currency,
              RateId: "sem_cafe"
            }
          ]
        }
      ],
      ...custom
    };

    this.bookings.set(orderId, {
      id: orderId,
      version: 1,
      payload
    });

    return orderId;
  }

  /**
   * Modifies an existing booking.
   *
   * @param {string} bookingId
   * @param {object} changes
   */
  modifyBooking(bookingId, changes = {}) {
    const existing = this.bookings.get(bookingId);
    if (!existing) throw new Error(`Reserva ${bookingId} não encontrada no simulador.`);

    const now = new Date();
    const payload = {
      ...existing.payload,
      ...changes,
      OrderModifDate: now.toISOString().split("T")[0],
      OrderModifTime: now.toTimeString().split(" ")[0],
      IsModification: 1
    };

    this.bookings.set(bookingId, {
      ...existing,
      version: (existing.version || 1) + 1,
      payload
    });
  }

  /**
   * Cancels an existing booking.
   *
   * @param {string} bookingId
   * @param {string} [reason]
   */
  cancelBooking(bookingId, reason = "Guest cancelled via OTA") {
    const existing = this.bookings.get(bookingId);
    if (!existing) throw new Error(`Reserva ${bookingId} não encontrada no simulador.`);

    const now = new Date();
    const payload = {
      ...existing.payload,
      IsCancellation: 1,
      CancelReason: reason,
      OrderModifDate: now.toISOString().split("T")[0],
      OrderModifTime: now.toTimeString().split(" ")[0]
    };

    this.bookings.set(bookingId, {
      ...existing,
      version: (existing.version || 1) + 1,
      payload
    });
  }

  // ── Webhook Dispatchers (Simulator -> PMS) ───────────────────────────────

  /**
   * Dispatches BookingCreate callback to PMS (JSON POST).
   *
   * @param {string} pmsUrl
   * @param {string} bookingId
   * @returns {Promise<any>}
   */
  async sendBookingCreate(pmsUrl, bookingId) {
    const booking = this.bookings.get(bookingId);
    if (!booking) throw new Error(`Reserva ${bookingId} não encontrada no simulador.`);

    const url = `${pmsUrl.replace(/\/+$/, "")}/api/callback/wbp/BookingCreate`;
    const payload = {
      pms_property_id: this.pmsPropertyId,
      wbp_property_id: this.wbpPropertyId,
      shared_secret: this.sharedSecret,
      reservation: booking.payload
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    return res.json().catch(() => ({ status: res.status }));
  }

  /**
   * Dispatches NotifyBooking callback to PMS using application/x-www-form-urlencoded!
   *
   * @param {string} pmsUrl
   * @param {string} bookingId
   * @returns {Promise<any>}
   */
  async sendNotifyBooking(pmsUrl, bookingId) {
    const url = `${pmsUrl.replace(/\/+$/, "")}/api/callback/wbp/NotifyBooking`;
    const formParams = new URLSearchParams({
      wbp_property_id: String(this.wbpPropertyId),
      shared_secret: this.sharedSecret,
      booking_id: String(bookingId)
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formParams.toString()
    });

    return res.json().catch(() => ({ status: res.status }));
  }

  /**
   * Dispatches ARIFullRefresh callback to PMS.
   *
   * @param {string} pmsUrl
   * @param {string} [propertyId]
   * @returns {Promise<any>}
   */
  async sendARIFullRefresh(pmsUrl, propertyId = null) {
    const url = `${pmsUrl.replace(/\/+$/, "")}/api/callback/wbp/ARIFullRefresh`;
    const payload = {
      pms_property_id: propertyId || this.pmsPropertyId,
      wbp_property_id: this.wbpPropertyId,
      shared_secret: this.sharedSecret
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    return res.json().catch(() => ({ status: res.status }));
  }

  /**
   * Dispatches RoomInfo callback to PMS.
   *
   * @param {string} pmsUrl
   * @param {string} [propertyId]
   * @returns {Promise<any>}
   */
  async sendRoomInfo(pmsUrl, propertyId = null) {
    const url = `${pmsUrl.replace(/\/+$/, "")}/api/callback/wbp/RoomInfo`;
    const payload = {
      pms_property_id: propertyId || this.pmsPropertyId,
      shared_secret: this.sharedSecret
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    return res.json().catch(() => ({ status: res.status }));
  }

  /**
   * Inspection methods for test assertions.
   */
  getReceivedRequests() {
    return [...this.receivedRequests];
  }

  getReceivedARI() {
    return [...this.receivedARI];
  }

  clearHistory() {
    this.receivedRequests = [];
    this.receivedARI = [];
    this.sentMessagesHistory = [];
    this.reviewResponsesHistory = [];
  }

  injectMessage(msg) {
    this.simulatedMessages.push(msg);
  }

  injectReview(review) {
    this.simulatedReviews.push(review);
  }

  getSentMessages() {
    return [...this.sentMessagesHistory];
  }

  getReviewResponses() {
    return [...this.reviewResponsesHistory];
  }
}

export { WBPSimulator as WbpSimulatorServer };

