/**
 * tests/wbp-integration/harness/wbp-simulator-harness.mjs
 *
 * Local WebBookingPro Build-To-Us API Simulator Harness.
 * Implements the official WBP API specification (OpenAPI 3.1 wbpAPI.yaml)
 * for isolated end-to-end testing of Guest-Flow-Manager.
 *
 * Features:
 * - Handles outbound PMS calls to POST /api/cloudpms/:verb
 * - Mandatory verbs: HealthCheck, SetupProperty, GetRoomTypes, GetRatePlans,
 *   ARIUpdate, GetBookingList, GetBookingId, AckBooking
 * - Scenario & Fault Injection: error codes (1001, 1002, 1003, 1102), timeouts
 * - Inbound Webhook triggers to PMS: BookingCreate, NotifyBooking, ARIFullRefresh, RoomInfo
 * - Request audit log & call counters for test assertions
 */

import http from "node:http";
import { URL } from "node:url";

export class WbpSimulatorHarness {
  constructor(options = {}) {
    this.port = options.port || 0; // 0 = dynamic available port
    this.server = null;
    this.baseUrl = null;
    this.calls = [];
    this.faults = new Map(); // verb -> { code, message, httpStatus }
    this.delays = new Map(); // verb -> ms
    this.queuedBookings = [];
    this.acknowledgedBookings = new Set();
    this.propertyId = options.propertyId || "101";
    this.sharedSecret = options.sharedSecret || "test_secret_123";
  }

  /**
   * Start the simulator HTTP server.
   * @param {number} [port]
   * @returns {Promise<{ port: number, url: string }>}
   */
  async start(port = this.port) {
    if (this.server) {
      return { port: this.port, url: this.baseUrl };
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this._handleRequest(req, res);
        } catch (err) {
          console.error("[WbpSimulatorHarness] Unhandled error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });

      this.server.on("error", reject);

      this.server.listen(port, "127.0.0.1", () => {
        const addr = this.server.address();
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve({ port: this.port, url: this.baseUrl });
      });
    });
  }

  /**
   * Stop the simulator server cleanly.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        this.baseUrl = null;
        resolve();
      });
    });
  }

  // ── Call Log & Assertions ──────────────────────────────────────────

  recordCall(call) {
    this.calls.push(call);
  }

  getCalls(verb) {
    if (!verb) return [...this.calls];
    return this.calls.filter((c) => c.verb?.toLowerCase() === verb.toLowerCase());
  }

  getCallCount(verb) {
    return this.getCalls(verb).length;
  }

  getLastCall(verb) {
    const matched = this.getCalls(verb);
    return matched.length > 0 ? matched[matched.length - 1] : null;
  }

  clearCalls() {
    this.calls = [];
  }

  // ── Fault & Delay Injection ────────────────────────────────────────

  setFault(verb, fault) {
    this.faults.set(verb.toLowerCase(), fault);
  }

  clearFault(verb) {
    if (verb) {
      this.faults.delete(verb.toLowerCase());
    } else {
      this.faults.clear();
    }
  }

  setDelay(verb, ms) {
    this.delays.set(verb.toLowerCase(), ms);
  }

  clearDelay(verb) {
    if (verb) {
      this.delays.delete(verb.toLowerCase());
    } else {
      this.delays.clear();
    }
  }

  queueBooking(booking) {
    this.queuedBookings.push(booking);
  }

  clearQueuedBookings() {
    this.queuedBookings = [];
  }

  // ── Inbound Webhooks: Simulator -> PMS ─────────────────────────────

  /**
   * Dispatches a BookingCreate webhook to the PMS (JSON payload).
   */
  async triggerBookingCreate(pmsUrl, booking, options = {}) {
    const payload = {
      shared_secret: options.sharedSecret || this.sharedSecret,
      pms_property_id: options.propertyId || this.propertyId,
      booking: booking
    };

    const targetUrl = new URL(pmsUrl);
    const res = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WebBookingPro-Simulator/1.0"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    let responseData = null;
    try {
      responseData = JSON.parse(responseText);
    } catch (_) {
      responseData = responseText;
    }

    return {
      status: res.status,
      ok: res.ok,
      data: responseData
    };
  }

  /**
   * Dispatches a NotifyBooking webhook to the PMS (application/x-www-form-urlencoded).
   */
  async triggerNotifyBooking(pmsUrl, bookingId, options = {}) {
    const formParams = new URLSearchParams();
    formParams.set("shared_secret", options.sharedSecret || this.sharedSecret);
    formParams.set("pms_property_id", options.propertyId || this.propertyId);
    formParams.set("booking_id", String(bookingId));

    const targetUrl = new URL(pmsUrl);
    const res = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "WebBookingPro-Simulator/1.0"
      },
      body: formParams.toString()
    });

    const responseText = await res.text();
    let responseData = null;
    try {
      responseData = JSON.parse(responseText);
    } catch (_) {
      responseData = responseText;
    }

    return {
      status: res.status,
      ok: res.ok,
      data: responseData
    };
  }

  // ── Internal Request Handling ──────────────────────────────────────

  async _handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const pathname = parsedUrl.pathname;

    // Read full request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    let body = {};
    if (rawBody && req.headers["content-type"]?.includes("application/json")) {
      try {
        body = JSON.parse(rawBody);
      } catch (_) {
        body = { _raw: rawBody };
      }
    }

    // Match /api/cloudpms/:verb or /cloudpms/:verb
    const verbMatch = pathname.match(/(?:\/api)?\/cloudpms\/([A-Za-z0-9_-]+)/i);
    const verb = verbMatch ? verbMatch[1] : null;

    const callRecord = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: pathname,
      verb,
      headers: req.headers,
      body,
      guid: body?.guid || null
    };
    this.recordCall(callRecord);

    if (!verb) {
      // Diagnostic root / ping
      if (pathname === "/health" || pathname === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", simulator: "WebBookingPro Build-To-Us" }));
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Endpoint not found" }));
    }

    // Check for simulated delay
    const delay = this.delays.get(verb.toLowerCase());
    if (delay && delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    // Check for simulated fault
    const fault = this.faults.get(verb.toLowerCase());
    if (fault) {
      const httpStatus = fault.httpStatus || 200; // WBP always returns HTTP 200 with error body
      res.writeHead(httpStatus, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          success: false,
          guid: body?.guid || "guid-error",
          error: fault.code || 1001,
          error_message: fault.message || "Simulated FAULT.OTA error"
        })
      );
    }

    // Dispatch verb handler
    switch (verb.toLowerCase()) {
      case "healthcheck":
        return this._handleHealthCheck(body, res);

      case "setupproperty":
        return this._handleSetupProperty(body, res);

      case "getroomtypes":
        return this._handleGetRoomTypes(body, res);

      case "getrateplans":
        return this._handleGetRatePlans(body, res);

      case "ariupdate":
        return this._handleARIUpdate(body, res);

      case "getbookinglist":
        return this._handleGetBookingList(body, res);

      case "getbookingid":
        return this._handleGetBookingId(body, res);

      case "ackbooking":
        return this._handleAckBooking(body, res);

      default:
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: true,
            guid: body?.guid || "guid-default",
            message: `Verb ${verb} received`
          })
        );
    }
  }

  _handleHealthCheck(body, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-health",
        timestamp: new Date().toISOString()
      })
    );
  }

  _handleSetupProperty(body, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-setup",
        property_id: this.propertyId,
        status: "active"
      })
    );
  }

  _handleGetRoomTypes(body, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-rooms",
        room_types: [
          {
            room_id: "flat",
            name: "Flat",
            capacity: 3,
            units: 19
          }
        ]
      })
    );
  }

  _handleGetRatePlans(body, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-rates",
        rate_plans: [
          {
            rate_id: "sem_cafe",
            name: "Sem café",
            room_id: "flat"
          },
          {
            rate_id: "com_cafe",
            name: "Com café",
            room_id: "flat"
          }
        ]
      })
    );
  }

  _handleARIUpdate(body, res) {
    // Validate that updates array exists (wbpAPI.yaml wire format: Inventory)
    const updates = body?.Inventory || body?.updates || body?.ari_updates || [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-ari",
        processed_updates: updates.length
      })
    );
  }

  _handleGetBookingList(body, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-booking-list",
        bookings: this.queuedBookings
      })
    );
  }

  _handleGetBookingId(body, res) {
    const orderId = String(body?.order_id || body?.OrderId || "");
    const found = this.queuedBookings.find(
      (b) => String(b.OrderId || b.order_id) === orderId
    );

    if (found) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          guid: body?.guid || "guid-booking-id",
          booking: found
        })
      );
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          guid: body?.guid || "guid-booking-id",
          error: 4004,
          error_message: `Booking not found: ${orderId}`
        })
      );
    }
  }

  _handleAckBooking(body, res) {
    const orderId = String(body?.order_id || body?.OrderId || "");
    this.acknowledgedBookings.add(orderId);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        guid: body?.guid || "guid-ack",
        order_id: orderId,
        acknowledged: true
      })
    );
  }
}
