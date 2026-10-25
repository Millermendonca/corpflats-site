/**
 * e2e/channex-simulator/index.mjs
 *
 * Official Channex.io REST API v1 Simulator (Sandbox / E2E Harness).
 *
 * Implements:
 * - Authentication via header `user-api-key`
 * - Properties CRUD + `/api/v1/properties/options`
 * - Room Types CRUD + `/api/v1/room_types/options`
 * - Rate Plans CRUD + `/api/v1/rate_plans/options`
 * - Availability (`GET /api/v1/availability`, `POST /api/v1/availability`)
 * - Restrictions & Rates (`GET /api/v1/restrictions`, `POST /api/v1/restrictions`)
 *   - Strict non-null field validation (returns Channex-compliant `meta.warnings` if null values are sent)
 *   - Returns `{ data: [{ id: "<uuid>", type: "task" }], meta: { message: "Success", warnings: [] } }`
 * - Rate Limiting (per Channex Rate Limits spec):
 *   - Max 10 Availability POST requests / min / property
 *   - Max 10 Restrictions POST requests / min / property
 *   - Returns HTTP 429 `{ errors: { code: "http_too_many_requests", title: "Too Many Requests" } }`
 * - Booking Revisions Feed (`GET /api/v1/booking_revisions/feed`, `GET /api/v1/booking_revisions/:id`, `POST /api/v1/booking_revisions/:id/ack`)
 * - Bookings (`GET /api/v1/bookings`, `GET /api/v1/bookings/:id`)
 * - Webhooks (`GET/POST/PUT/DELETE /api/v1/webhooks`, `POST /api/v1/webhooks/test`) + HMAC-SHA256 dispatcher (`x-hmac-timestamp`, `x-hmac-signature-256`, `x-hmac-keys-256`)
 * - One-Time Access Token (`POST /api/v1/auth/one_time_token`) for Headless IFrame (`lng=pt`)
 * - Messages (`GET/POST /api/v1/bookings/:booking_id/messages`) & Reviews (`GET /api/v1/reviews`, `POST /api/v1/reviews/:id/reply`)
 */

import http from "node:http";
import crypto from "node:crypto";
import express from "express";

export class ChannexSimulator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || "chx_test_key_corpflats_soho_19";
    this.webhookSecret = options.webhookSecret || "chx_hmac_secret_corpflats_2026";
    this.pendingWebhookSecret = options.pendingWebhookSecret || null;
    this.enforceRateLimit = options.enforceRateLimit !== false;
    this.availabilityLimitPerMin = options.availabilityLimitPerMin || 10;
    this.restrictionsLimitPerMin = options.restrictionsLimitPerMin || 10;
    this.rateWindowMs = options.rateWindowMs || 60000;

    this.resetState();
  }

  resetState() {
    this.properties = new Map();
    this.roomTypes = new Map();
    this.ratePlans = new Map();
    this.availabilityState = {}; // { [roomTypeId]: { [date]: number } }
    this.restrictionsState = {}; // { [ratePlanId]: { [date]: { rate, rates, min_stay_arrival, ... } } }
    this.tasks = []; // [{ id, kind, property_id, payload, created_at, warnings }]
    this.bookingRevisions = new Map(); // id -> revision resource
    this.bookings = new Map(); // id -> booking resource
    this.webhooks = new Map(); // id -> webhook resource
    this.oneTimeTokens = new Map(); // token -> { property_id, group_id, username, expires_at, used }
    this.messages = new Map(); // booking_id -> Array<message>
    this.reviews = new Map(); // review_id -> review
    this.requestLog = [];
    this.rateLimitBuckets = {
      availability: new Map(), // property_id -> Array<timestampMs>
      restrictions: new Map()  // property_id -> Array<timestampMs>
    };
    this.forcedStatusQueue = []; // Optional fault injection queue: [{ status, body }]
  }

  injectFault(status = 500, body = { errors: { code: "internal_server_error", title: "Internal Server Error" } }) {
    this.forcedStatusQueue.push({ status, body });
  }

  checkRateLimit(bucketType, propertyId = "global") {
    if (!this.enforceRateLimit) return true;
    const now = Date.now();
    const limit = bucketType === "availability" ? this.availabilityLimitPerMin : this.restrictionsLimitPerMin;
    const map = this.rateLimitBuckets[bucketType];
    const key = String(propertyId || "global");
    const timestamps = (map.get(key) || []).filter((ts) => now - ts < this.rateWindowMs);
    if (timestamps.length >= limit) {
      map.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    map.set(key, timestamps);
    return true;
  }

  expandDateRange(date, dateFrom, dateTo, daysFilter = null) {
    if (date) return [date];
    if (!dateFrom || !dateTo) return [];
    const dates = [];
    const dayCodes = ["su", "mo", "tu", "we", "th", "fr", "sa"];
    let curr = new Date(dateFrom + "T12:00:00Z");
    const end = new Date(dateTo + "T12:00:00Z");
    while (curr <= end) {
      const iso = curr.toISOString().slice(0, 10);
      if (Array.isArray(daysFilter) && daysFilter.length > 0) {
        const dc = dayCodes[curr.getUTCDay()];
        if (daysFilter.includes(dc)) dates.push(iso);
      } else {
        dates.push(iso);
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return dates;
  }

  /**
   * Enqueues a synthetic OTA booking revision (new, modified, or cancelled) into the Channex feed.
   */
  seedBookingRevision(attrs = {}) {
    const revisionId = attrs.id || attrs.revision_id || crypto.randomUUID();
    const bookingId = attrs.booking_id || crypto.randomUUID();
    const otaCode = attrs.ota_reservation_code || String(Math.floor(1000000000 + Math.random() * 9000000000));
    const otaName = attrs.ota_name || "BookingCom";
    const uniqueId = attrs.unique_id || `BDC-${otaCode}`;
    const arrivalDate = attrs.arrival_date || "2026-11-10";
    const departureDate = attrs.departure_date || "2026-11-12";

    const fullAttributes = {
      id: revisionId,
      revision_id: revisionId,
      booking_id: bookingId,
      property_id: attrs.property_id || ([...this.properties.keys()][0] ?? crypto.randomUUID()),
      unique_id: uniqueId,
      system_id: attrs.system_id || String(Date.now()),
      ota_reservation_code: otaCode,
      ota_name: otaName,
      status: attrs.status || "new",
      arrival_date: arrivalDate,
      departure_date: departureDate,
      arrival_hour: attrs.arrival_hour ?? "14:00",
      amount: String(attrs.amount ?? "560.00"),
      ota_commission: String(attrs.ota_commission ?? "84.00"),
      currency: attrs.currency || "BRL",
      payment_collect: attrs.payment_collect !== undefined ? attrs.payment_collect : "property",
      payment_type: attrs.payment_type !== undefined ? attrs.payment_type : "credit_card",
      notes: attrs.notes ?? null,
      occupancy: attrs.occupancy || { adults: 2, children: 0, infants: 0 },
      customer: attrs.customer || {
        name: "Carlos",
        surname: "Mendes",
        mail: "carlos.mendes@guest.booking.com",
        phone: "+5522999887766",
        country: "BR",
        city: "Campos dos Goytacazes",
        address: "Av. Pelinca, 100",
        zip: "28035-053",
        company: null
      },
      guarantee: attrs.guarantee !== undefined ? attrs.guarantee : {
        card_number: "411111******1111",
        card_type: "VI",
        cardholder_name: "CARLOS MENDES",
        cvv: "***",
        expiration_date: "12/2028",
        is_virtual: false
      },
      rooms: Array.isArray(attrs.rooms) ? attrs.rooms : [
        {
          booking_room_id: crypto.randomUUID(),
          checkin_date: arrivalDate,
          checkout_date: departureDate,
          room_type_id: attrs.room_type_id !== undefined ? attrs.room_type_id : ([...this.roomTypes.keys()][0] ?? null),
          rate_plan_id: attrs.rate_plan_id !== undefined ? attrs.rate_plan_id : ([...this.ratePlans.keys()][0] ?? null),
          amount: String(attrs.amount ?? "560.00"),
          days: attrs.days || {
            [arrivalDate]: "280.00"
          },
          occupancy: attrs.occupancy || { adults: 2, children: 0, infants: 0 },
          guests: [{ name: "Carlos", surname: "Mendes" }],
          services: attrs.services || [],
          taxes: attrs.taxes || [],
          meta: attrs.room_meta || {}
        }
      ],
      services: attrs.booking_services || [],
      deposits: attrs.deposits !== undefined ? attrs.deposits : null,
      collected_taxes: attrs.collected_taxes !== undefined ? attrs.collected_taxes : null,
      meta: attrs.meta || {},
      inserted_at: attrs.inserted_at || new Date().toISOString()
    };

    const revisionRecord = {
      type: "booking_revision",
      id: revisionId,
      revisionId,
      bookingId,
      attributes: fullAttributes,
      acked: false,
      acked_at: null
    };

    this.bookingRevisions.set(revisionId, revisionRecord);
    this.bookings.set(bookingId, {
      type: "booking",
      id: bookingId,
      attributes: { ...fullAttributes, id: bookingId },
      relationships: {
        message_thread: {
          data: { id: crypto.randomUUID(), type: "message_thread" }
        }
      }
    });

    return revisionRecord;
  }

  /**
   * Signs and sends a webhook payload to a target callback URL using Channex HMAC-SHA256 specification.
   */
  async dispatchWebhook(callbackUrl, eventPayload, options = {}) {
    const rawBody = typeof eventPayload === "string" ? eventPayload : JSON.stringify(eventPayload);
    const ts = options.timestamp !== undefined ? String(options.timestamp) : String(Math.floor(Date.now() / 1000));
    const secret = options.secret || this.webhookSecret;
    const sig1 = crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
    const sigs = [sig1];
    const keys = [`...${secret.slice(-6)}`];

    if (options.pendingSecret || this.pendingWebhookSecret) {
      const pSec = options.pendingSecret || this.pendingWebhookSecret;
      const sig2 = crypto.createHmac("sha256", pSec).update(`${ts}.${rawBody}`).digest("hex");
      sigs.push(sig2);
      keys.push(`...${pSec.slice(-6)}`);
    }

    const headers = {
      "Content-Type": "application/json",
      "x-hmac-timestamp": ts,
      "x-hmac-signature-256": sigs.join(","),
      "x-hmac-keys-256": keys.join(","),
      ...(options.headers || {})
    };

    const response = await fetch(callbackUrl, {
      method: "POST",
      headers,
      body: rawBody
    });

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}

    return {
      status: response.status,
      body: text,
      json,
      hmac: {
        timestamp: Number(ts),
        signatures: sigs,
        signing_keys: keys
      }
    };
  }

  createApp() {
    const app = express();
    app.use(express.json({ limit: "12mb" }));

    // Request logger & fault injection middleware
    app.use((req, res, next) => {
      this.requestLog.push({
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: req.body,
        timestamp: new Date().toISOString()
      });

      if (this.forcedStatusQueue.length > 0) {
        const fault = this.forcedStatusQueue.shift();
        return res.status(fault.status).json(fault.body);
      }

      // Auth check for /api/v1/*
      if (req.path.startsWith("/api/v1")) {
        const key = req.get("user-api-key");
        if (!key || key !== this.apiKey) {
          return res.status(401).json({
            errors: {
              code: "unauthorized",
              title: "Unauthorized"
            }
          });
        }
      }
      next();
    });

    // ── Properties ─────────────────────────────────────────────────────────────
    app.get("/api/v1/properties/options", (req, res) => {
      const data = [...this.properties.values()].map((p) => ({
        id: p.id,
        type: "property",
        attributes: { id: p.id, title: p.attributes.title }
      }));
      res.json({ data });
    });

    app.get("/api/v1/properties", (req, res) => {
      const list = [...this.properties.values()];
      res.json({
        data: list,
        meta: { page: 1, limit: 100, total: list.length }
      });
    });

    app.get("/api/v1/properties/:id", (req, res) => {
      const prop = this.properties.get(req.params.id);
      if (!prop) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      res.json({ data: prop });
    });

    app.post("/api/v1/properties", (req, res) => {
      const body = req.body?.property;
      if (!body || !body.title || !body.currency) {
        return res.status(422).json({
          errors: {
            code: "validation_error",
            title: "Validation Error",
            details: { title: ["can't be blank"], currency: ["can't be blank"] }
          }
        });
      }
      const id = body.id || crypto.randomUUID();
      const resource = {
        type: "property",
        id,
        attributes: {
          id,
          is_active: true,
          title: body.title,
          currency: body.currency || "BRL",
          email: body.email || "contato@corpflats.com.br",
          phone: body.phone || "+5522999999999",
          zip_code: body.zip_code || "28035-053",
          country: body.country || "BR",
          state: body.state || "RJ",
          city: body.city || "Campos dos Goytacazes",
          address: body.address || "Rua Voluntários da Pátria, 487",
          timezone: body.timezone || "America/Sao_Paulo",
          property_type: body.property_type || "apart_hotel",
          min_stay_type: body.settings?.min_stay_type || body.min_stay_type || "arrival",
          settings: {
            allow_availability_autoupdate_on_confirmation: true,
            allow_availability_autoupdate_on_modification: false,
            allow_availability_autoupdate_on_cancellation: false,
            min_stay_type: body.settings?.min_stay_type || body.min_stay_type || "arrival",
            state_length: body.settings?.state_length || 500,
            cut_off_time: null,
            cut_off_days: null,
            max_day_advance: null,
            min_price: body.settings?.min_price || null,
            max_price: body.settings?.max_price || null
          },
          content: body.content || { description: null, important_information: null, photos: [] }
        },
        relationships: { users: { data: [] }, groups: { data: [] }, facilities: { data: [] }, hotel_policies: { data: [] }, cancellation_policies: { data: [] }, tax_sets: { data: [] } }
      };
      this.properties.set(id, resource);
      res.status(201).json({ data: resource });
    });

    app.put("/api/v1/properties/:id", (req, res) => {
      const existing = this.properties.get(req.params.id);
      if (!existing) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      const patch = req.body?.property || {};
      existing.attributes = {
        ...existing.attributes,
        ...patch,
        settings: { ...existing.attributes.settings, ...(patch.settings || {}) }
      };
      res.json({ data: existing });
    });

    // ── Room Types ─────────────────────────────────────────────────────────────
    app.get("/api/v1/room_types/options", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const list = [...this.roomTypes.values()].filter((rt) => !propId || rt.attributes.property_id === propId);
      res.json({
        data: list.map((rt) => ({
          id: rt.id,
          type: "room_type",
          attributes: {
            id: rt.id,
            title: rt.attributes.title,
            property_id: rt.attributes.property_id,
            count_of_rooms: rt.attributes.count_of_rooms
          }
        }))
      });
    });

    app.get("/api/v1/room_types", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const list = [...this.roomTypes.values()].filter((rt) => !propId || rt.attributes.property_id === propId);
      res.json({
        data: list,
        meta: { page: 1, limit: 100, total: list.length }
      });
    });

    app.post("/api/v1/room_types", (req, res) => {
      const body = req.body?.room_type;
      if (!body || !body.title || !body.property_id || !body.count_of_rooms || !body.occ_adults) {
        return res.status(422).json({
          errors: {
            code: "validation_error",
            title: "Validation Error",
            details: { room_type: ["missing required attributes"] }
          }
        });
      }
      const id = body.id || crypto.randomUUID();
      const resource = {
        type: "room_type",
        id,
        attributes: {
          id,
          property_id: body.property_id,
          position: 0,
          title: body.title,
          count_of_rooms: Number(body.count_of_rooms),
          occ_adults: Number(body.occ_adults),
          occ_children: Number(body.occ_children ?? 0),
          occ_infants: Number(body.occ_infants ?? 0),
          default_occupancy: Number(body.default_occupancy ?? body.occ_adults),
          room_kind: body.room_kind || "room",
          capacity: null,
          codes: body.codes || null,
          meta: body.meta || null,
          content: body.content || { description: null, photos: [] }
        },
        relationships: {
          property: { data: { id: body.property_id, type: "property" } },
          facilities: { data: [] }
        }
      };
      this.roomTypes.set(id, resource);
      res.status(201).json({ data: resource });
    });

    // ── Rate Plans ─────────────────────────────────────────────────────────────
    app.get("/api/v1/rate_plans/options", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const list = [...this.ratePlans.values()].filter((rp) => !propId || rp.attributes.property_id === propId);
      res.json({
        data: list.map((rp) => ({
          id: rp.id,
          type: "rate_plan",
          attributes: {
            id: rp.id,
            title: rp.attributes.title,
            property_id: rp.attributes.property_id,
            room_type_id: rp.attributes.room_type_id
          }
        }))
      });
    });

    app.get("/api/v1/rate_plans", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const list = [...this.ratePlans.values()].filter((rp) => !propId || rp.attributes.property_id === propId);
      res.json({
        data: list,
        meta: { page: 1, limit: 100, total: list.length }
      });
    });

    app.post("/api/v1/rate_plans", (req, res) => {
      const body = req.body?.rate_plan;
      if (!body || !body.title || !body.property_id || !body.room_type_id || !Array.isArray(body.options) || body.options.length === 0) {
        return res.status(422).json({
          errors: {
            code: "validation_error",
            title: "Validation Error",
            details: { options: ["can't be blank"] }
          }
        });
      }
      const primaryCount = body.options.filter((o) => o.is_primary === true).length;
      if (primaryCount !== 1) {
        return res.status(422).json({
          errors: {
            code: "validation_error",
            title: "Validation Error",
            details: { options: ["should have exactly one primary option"] }
          }
        });
      }
      const roomType = this.roomTypes.get(body.room_type_id);
      if (roomType) {
        const maxOcc = roomType.attributes.occ_adults;
        for (const opt of body.options) {
          if (Number(opt.occupancy) > maxOcc) {
            return res.status(422).json({
              errors: {
                code: "validation_error",
                title: "Validation Error",
                details: { options: [`occupancy ${opt.occupancy} exceeds room type occ_adults (${maxOcc})`] }
              }
            });
          }
        }
      }

      const id = body.id || crypto.randomUUID();
      const resource = {
        type: "rate_plan",
        id,
        attributes: {
          id,
          title: body.title,
          property_id: body.property_id,
          room_type_id: body.room_type_id,
          sell_mode: body.sell_mode || "per_person",
          rate_mode: body.rate_mode || "manual",
          currency: body.currency || "BRL",
          meal_type: body.meal_type || "none",
          options: body.options.map((o) => ({
            id: crypto.randomUUID(),
            occupancy: Number(o.occupancy),
            is_primary: Boolean(o.is_primary),
            rate: String(o.rate ?? "0.00"),
            derived_option: o.derived_option || null
          })),
          min_stay_arrival: body.min_stay_arrival || [1, 1, 1, 1, 2, 2, 1],
          min_stay_through: body.min_stay_through || [1, 1, 1, 1, 1, 1, 1],
          max_stay: body.max_stay || [0, 0, 0, 0, 0, 0, 0],
          closed_to_arrival: body.closed_to_arrival || [false, false, false, false, false, false, false],
          closed_to_departure: body.closed_to_departure || [false, false, false, false, false, false, false],
          stop_sell: body.stop_sell || [false, false, false, false, false, false, false]
        },
        relationships: {
          property: { data: { id: body.property_id, type: "property" } },
          room_type: { data: { id: body.room_type_id, type: "room_type" } }
        }
      };
      this.ratePlans.set(id, resource);
      res.status(201).json({ data: resource });
    });

    // ── Availability (GET & POST /api/v1/availability) ─────────────────────────
    app.get("/api/v1/availability", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const dateEq = typeof req.query?.filter?.date === "string" ? req.query.filter.date : null;
      const dateGte = req.query?.filter?.date?.gte || dateEq;
      const dateLte = req.query?.filter?.date?.lte || dateEq;

      if (!propId || !dateGte) {
        return res.status(400).json({
          errors: { code: "bad_request", title: "Bad Request", details: ["date and property_id are required"] }
        });
      }

      const dates = this.expandDateRange(dateEq, dateGte, dateLte);
      const data = {};
      for (const [rtId, byDate] of Object.entries(this.availabilityState)) {
        data[rtId] = {};
        for (const d of dates) {
          if (byDate[d] !== undefined) data[rtId][d] = byDate[d];
        }
      }
      res.json({ data });
    });

    app.post("/api/v1/availability", (req, res) => {
      const values = req.body?.values;
      if (!Array.isArray(values) || values.length === 0) {
        return res.status(400).json({
          errors: { code: "bad_request", title: "Bad Request", details: ["values must be a non-empty array"] }
        });
      }

      const propId = values[0]?.property_id || "global";
      if (!this.checkRateLimit("availability", propId)) {
        return res.status(429).json({
          errors: { code: "http_too_many_requests", title: "Too Many Requests" }
        });
      }

      const warnings = [];
      for (const item of values) {
        if (!item.property_id || !item.room_type_id || item.availability === undefined || item.availability === null || Number(item.availability) < 0) {
          warnings.push({ ...item, warning: { availability: ["is invalid"] } });
          continue;
        }
        const dates = this.expandDateRange(item.date, item.date_from, item.date_to, item.days);
        if (!this.availabilityState[item.room_type_id]) {
          this.availabilityState[item.room_type_id] = {};
        }
        for (const d of dates) {
          this.availabilityState[item.room_type_id][d] = Number(item.availability);
        }
      }

      const taskId = crypto.randomUUID();
      this.tasks.push({
        id: taskId,
        kind: "availability",
        property_id: propId,
        values_count: values.length,
        values,
        warnings,
        created_at: new Date().toISOString()
      });

      res.json({
        data: [{ id: taskId, type: "task" }],
        meta: { message: "Success", warnings }
      });
    });

    // ── Restrictions & Rates (GET & POST /api/v1/restrictions) ─────────────────
    app.get("/api/v1/restrictions", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const restrictionsParam = req.query?.filter?.restrictions;
      const dateEq = typeof req.query?.filter?.date === "string" ? req.query.filter.date : null;
      const dateGte = req.query?.filter?.date?.gte || dateEq;
      const dateLte = req.query?.filter?.date?.lte || dateEq;

      if (!propId || !restrictionsParam || !dateGte) {
        return res.status(400).json({
          errors: { code: "bad_request", title: "Bad Request", details: ["restrictions is required"] }
        });
      }

      const dates = this.expandDateRange(dateEq, dateGte, dateLte);
      const data = {};
      for (const [rpId, byDate] of Object.entries(this.restrictionsState)) {
        data[rpId] = {};
        for (const d of dates) {
          if (byDate[d]) data[rpId][d] = byDate[d];
        }
      }
      res.json({ data });
    });

    app.post("/api/v1/restrictions", (req, res) => {
      const values = req.body?.values;
      if (!Array.isArray(values) || values.length === 0) {
        return res.status(400).json({
          errors: { code: "bad_request", title: "Bad Request", details: ["values must be a non-empty array"] }
        });
      }

      const propId = values[0]?.property_id || "global";
      if (!this.checkRateLimit("restrictions", propId)) {
        return res.status(429).json({
          errors: { code: "http_too_many_requests", title: "Too Many Requests" }
        });
      }

      const warnings = [];
      const allowedRestrictionKeys = [
        "rate",
        "rates",
        "min_stay_arrival",
        "min_stay_through",
        "min_stay",
        "max_stay",
        "closed_to_arrival",
        "closed_to_departure",
        "stop_sell"
      ];

      for (const item of values) {
        const itemWarnings = {};
        // Channex explicitly warns if any field is sent with null value
        for (const [k, v] of Object.entries(item)) {
          if (v === null && !["date", "date_from", "date_to"].includes(k)) {
            itemWarnings[k] = ["Should be a non null value or not existed field"];
          }
        }
        if (item.rate !== undefined && Number(item.rate) <= 0) {
          itemWarnings.rate = ["must be greater than 0"];
        }
        if (Array.isArray(item.rates)) {
          for (const rObj of item.rates) {
            if (!rObj || Number(rObj.rate) <= 0) {
              itemWarnings.rates = ["must be greater than 0"];
            }
          }
        }
        const hasAtLeastOne = allowedRestrictionKeys.some((k) => item[k] !== undefined && item[k] !== null);
        if (!hasAtLeastOne) {
          itemWarnings.restrictions = ["at least one restriction should be present"];
        }

        if (Object.keys(itemWarnings).length > 0) {
          warnings.push({ ...item, warning: itemWarnings });
          continue;
        }

        const dates = this.expandDateRange(item.date, item.date_from, item.date_to, item.days);
        if (!this.restrictionsState[item.rate_plan_id]) {
          this.restrictionsState[item.rate_plan_id] = {};
        }
        for (const d of dates) {
          const prev = this.restrictionsState[item.rate_plan_id][d] || {};
          const next = { ...prev };
          for (const rk of allowedRestrictionKeys) {
            if (item[rk] !== undefined) next[rk] = item[rk];
          }
          this.restrictionsState[item.rate_plan_id][d] = next;
        }
      }

      const taskId = crypto.randomUUID();
      this.tasks.push({
        id: taskId,
        kind: "restrictions",
        property_id: propId,
        values_count: values.length,
        values,
        warnings,
        created_at: new Date().toISOString()
      });

      res.json({
        data: warnings.length === values.length ? [] : [{ id: taskId, type: "task" }],
        meta: { message: "Success", warnings }
      });
    });

    // ── Booking Revisions Feed & Ack ───────────────────────────────────────────
    app.get("/api/v1/booking_revisions/feed", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const unacked = [...this.bookingRevisions.values()]
        .filter((rev) => !rev.acked && (!propId || rev.attributes.property_id === propId))
        .map((rev) => ({
          type: "booking_revision",
          id: rev.id,
          attributes: rev.attributes
        }));

      res.json({
        data: unacked,
        meta: { page: 1, limit: 100, total: unacked.length }
      });
    });

    app.get("/api/v1/booking_revisions/:id", (req, res) => {
      const rev = this.bookingRevisions.get(req.params.id);
      if (!rev) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      res.json({
        data: {
          type: "booking_revision",
          id: rev.id,
          attributes: rev.attributes
        }
      });
    });

    app.post("/api/v1/booking_revisions/:id/ack", (req, res) => {
      const rev = this.bookingRevisions.get(req.params.id);
      if (!rev) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      rev.acked = true;
      rev.acked_at = new Date().toISOString();
      res.json({ meta: { message: "Success" } });
    });

    // ── Bookings ───────────────────────────────────────────────────────────────
    app.get("/api/v1/bookings", (req, res) => {
      const list = [...this.bookings.values()];
      res.json({
        data: list,
        meta: { page: 1, limit: 100, total: list.length }
      });
    });

    app.get("/api/v1/bookings/:id", (req, res) => {
      const b = this.bookings.get(req.params.id);
      if (!b) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      res.json({ data: b });
    });

    // ── One-Time Token & White-Label IFrame ────────────────────────────────────
    app.post("/api/v1/auth/one_time_token", (req, res) => {
      const body = req.body?.one_time_token;
      if (!body || !body.property_id || !body.username) {
        return res.status(422).json({
          errors: { code: "validation_error", title: "Validation Error" }
        });
      }
      const token = crypto.randomUUID();
      this.oneTimeTokens.set(token, {
        property_id: body.property_id,
        group_id: body.group_id || null,
        username: body.username,
        expires_at: Date.now() + 15 * 60 * 1000,
        used: false
      });
      res.json({
        data: { token },
        meta: { message: "You are successfully received one-time token! Use it for exchange to JWT" }
      });
    });

    // ── Webhooks CRUD ──────────────────────────────────────────────────────────
    app.get("/api/v1/webhooks", (req, res) => {
      const list = [...this.webhooks.values()];
      res.json({
        data: list,
        meta: { page: 1, limit: 100, total: list.length }
      });
    });

    app.post("/api/v1/webhooks", (req, res) => {
      const w = req.body?.webhook;
      if (!w || !w.callback_url || !w.event_mask) {
        return res.status(422).json({
          errors: { code: "validation_error", title: "Validation Error" }
        });
      }
      const id = crypto.randomUUID();
      const record = {
        type: "webhook",
        id,
        attributes: {
          id,
          callback_url: w.callback_url,
          event_mask: w.event_mask,
          property_id: w.property_id ?? null,
          is_global: Boolean(w.is_global),
          is_signed: Boolean(w.is_signed),
          signing_key_id: w.signing_key_id || null,
          is_active: w.is_active !== false,
          send_data: w.send_data !== false,
          headers: w.headers || {},
          request_params: w.request_params || {}
        }
      };
      this.webhooks.set(id, record);
      res.status(201).json({ data: record });
    });

    // ── Messages & Reviews ─────────────────────────────────────────────────────
    app.get("/api/v1/bookings/:booking_id/messages", (req, res) => {
      const msgs = this.messages.get(req.params.booking_id) || [];
      res.json({
        data: msgs,
        meta: { page: 1, limit: 50, total: msgs.length }
      });
    });

    app.post("/api/v1/bookings/:booking_id/messages", (req, res) => {
      const text = req.body?.message?.message;
      if (!text) {
        return res.status(422).json({ errors: { code: "validation_error", title: "Validation Error" } });
      }
      const msg = {
        id: crypto.randomUUID(),
        type: "message",
        attributes: {
          message: text,
          attachments: [],
          sender: "property",
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };
      const arr = this.messages.get(req.params.booking_id) || [];
      arr.push(msg);
      this.messages.set(req.params.booking_id, arr);
      res.json({ data: msg });
    });

    app.get("/api/v1/reviews", (req, res) => {
      const list = [...this.reviews.values()];
      res.json({
        data: list,
        meta: { page: 1, limit: 50, total: list.length }
      });
    });

    app.post("/api/v1/reviews/:id/reply", (req, res) => {
      const replyText = req.body?.reply?.reply || req.body?.reply;
      const rev = this.reviews.get(req.params.id);
      if (!rev) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      rev.attributes.reply = replyText;
      rev.attributes.is_replied = true;
      res.json({ data: rev });
    });

    // ── Identity, Tasks, Health Check, Channels, Signing Keys, Live Feed, Availability Rules & Booking Actions ──
    app.get("/api/v1/whoami", (_req, res) => {
      res.json({
        data: {
          type: "user",
          id: "usr-corpflats-pms",
          attributes: {
            email: "soho@promenade.com.br",
            name: "Admin CorpFlats",
            is_active: true,
            timezone: "America/Sao_Paulo"
          }
        }
      });
    });

    app.get("/api/v1/tasks", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const list = this.tasks
        .filter((t) => !propId || t.property_id === propId)
        .map((t) => ({
          type: "task",
          id: t.id,
          attributes: t
        }));
      res.json({
        data: list,
        meta: { page: 1, limit: 50, total: list.length }
      });
    });

    app.get("/api/v1/tasks/:id", (req, res) => {
      const found = this.tasks.find((t) => t.id === req.params.id);
      if (!found) {
        return res.status(404).json({ errors: { code: "resource_not_found", title: "Resource Not Found" } });
      }
      res.json({ data: { type: "task", id: found.id, attributes: found } });
    });

    app.get("/api/v1/health_check/:property_id", (req, res) => {
      res.json({
        data: {
          type: "health_check",
          id: req.params.property_id,
          attributes: {
            property_id: req.params.property_id,
            status: "healthy",
            unmapped_rooms_count: 0,
            unmapped_rates_count: 0,
            sync_errors_count: 0
          }
        }
      });
    });

    app.get("/api/v1/channels", (req, res) => {
      const propId = req.query?.filter?.property_id;
      res.json({
        data: [
          {
            type: "channel",
            id: "ch-booking-com",
            attributes: {
              id: "ch-booking-com",
              title: "Booking.com",
              channel: "BookingCom",
              is_active: true,
              properties: propId ? [propId] : []
            }
          },
          {
            type: "channel",
            id: "ch-airbnb",
            attributes: {
              id: "ch-airbnb",
              title: "Airbnb",
              channel: "Airbnb",
              is_active: true,
              properties: propId ? [propId] : []
            }
          }
        ],
        meta: { page: 1, limit: 50, total: 2 }
      });
    });

    app.post("/api/v1/webhooks/test", (req, res) => {
      res.json({ meta: { message: "Success" }, data: req.body || {} });
    });

    app.post("/api/v1/webhooks/:id/test", (req, res) => {
      res.json({ meta: { message: "Success" }, data: { id: req.params.id, ...(req.body || {}) } });
    });

    app.get("/api/v1/webhook_logs", (_req, res) => {
      res.json({ data: [], meta: { page: 1, limit: 50, total: 0 } });
    });

    app.get("/api/v1/webhooks/:id/logs", (_req, res) => {
      res.json({ data: [], meta: { page: 1, limit: 50, total: 0 } });
    });

    app.get("/api/v1/signing_keys", (_req, res) => {
      res.json({
        data: [
          {
            type: "signing_key",
            id: "sk-corpflats-1",
            attributes: { id: "sk-corpflats-1", title: "CorpFlats HMAC Key", status: "active" }
          }
        ]
      });
    });

    app.post("/api/v1/signing_keys", (req, res) => {
      const id = crypto.randomUUID();
      res.status(201).json({
        data: {
          type: "signing_key",
          id,
          attributes: {
            id,
            title: req.body?.signing_key?.title || "CorpFlats HMAC Key",
            secret_key: this.webhookSecret,
            status: "active"
          }
        }
      });
    });

    app.post("/api/v1/signing_keys/:id/generate", (req, res) => {
      res.status(201).json({
        data: {
          type: "signing_key",
          id: req.params.id,
          attributes: {
            id: req.params.id,
            pending_key: crypto.randomBytes(24).toString("hex"),
            status: "pending_rotation"
          }
        }
      });
    });

    app.post("/api/v1/signing_keys/:id/versions", (req, res) => {
      res.status(201).json({
        data: {
          type: "signing_key",
          id: req.params.id,
          attributes: {
            id: req.params.id,
            pending_key: crypto.randomBytes(24).toString("hex"),
            status: "pending_rotation"
          }
        }
      });
    });

    app.post("/api/v1/signing_keys/:id/rotate", (req, res) => {
      res.json({
        data: {
          type: "signing_key",
          id: req.params.id,
          attributes: { id: req.params.id, status: "active" }
        },
        meta: { message: "Success" }
      });
    });

    app.delete("/api/v1/signing_keys/:id", (_req, res) => {
      res.json({ meta: { message: "Success" } });
    });

    app.post("/api/v1/bookings/:id/no_show", (req, res) => {
      res.json({ meta: { message: "Success", status: "ok" }, data: { booking_id: req.params.id, ...(req.body?.no_show_report || {}) } });
    });

    app.post("/api/v1/bookings/:id/invalid_card", (req, res) => {
      res.json({ meta: { message: "Success", status: "ok" }, data: { booking_id: req.params.id } });
    });

    app.post("/api/v1/bookings/:id/cancel_due_invalid_card", (req, res) => {
      res.json({ meta: { message: "Success", status: "ok" }, data: { booking_id: req.params.id } });
    });

    app.post("/api/v1/bookings/:id/guest_misconduct", (req, res) => {
      res.json({ meta: { message: "Success", status: "ok" }, data: { booking_id: req.params.id, ...(req.body?.misconduct_report || {}) } });
    });

    app.post("/api/v1/bookings/:id/change_stay", (req, res) => {
      res.json({ meta: { message: "Success", status: "ok" }, data: { booking_id: req.params.id, ...(req.body?.stay_change || {}) } });
    });

    app.get("/api/v1/bookings/:id/price_breakdown", (req, res) => {
      res.json({ data: { type: "price_breakdown", id: req.params.id, attributes: { currency: "BRL", items: [] } } });
    });

    app.get("/api/v1/bookings/:id/payout_details", (req, res) => {
      res.json({ data: { type: "payout_details", id: req.params.id, attributes: { currency: "BRL", net_amount: "0.00" } } });
    });

    app.get("/api/v1/live_feed", (_req, res) => {
      res.json({ data: [], meta: { page: 1, limit: 50, total: 0 } });
    });

    app.post("/api/v1/live_feed/:id/resolve", (req, res) => {
      res.json({ meta: { message: "Success", status: "ok" }, data: { id: req.params.id, ...(req.body?.resolution || {}) } });
    });

    if (!this.availabilityRules) {
      this.availabilityRules = new Map();
    }

    app.get("/api/v1/availability_rules", (req, res) => {
      const propId = req.query?.filter?.property_id;
      const list = [...this.availabilityRules.values()].filter(
        (r) => !propId || r.attributes?.property_id === propId
      );
      res.json({ data: list, meta: { page: 1, limit: 50, total: list.length } });
    });

    app.post("/api/v1/availability_rules", (req, res) => {
      const id = crypto.randomUUID();
      const resource = {
        type: "availability_rule",
        id,
        attributes: { id, ...(req.body?.availability_rule || req.body || {}) }
      };
      this.availabilityRules.set(id, resource);
      res.status(201).json({ data: resource });
    });

    return app;
  }

  async start(port = 0) {
    const app = this.createApp();
    return new Promise((resolve, reject) => {
      this.server = http.createServer(app);
      this.server.on("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        const addr = this.server.address();
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}/api/v1`;
        resolve({ port: this.port, baseUrl: this.baseUrl });
      });
    });
  }

  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
}
