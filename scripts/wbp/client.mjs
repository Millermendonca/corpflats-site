import crypto from "node:crypto";
import { getWbpConfig, getChannexConfig, updateChannexConfig, getIntegrationMode, WBP_MODES } from "./config.mjs";

/**
 * Custom Error class for Channex.io REST API v1 errors.
 */
export class ChannexApiError extends Error {
  constructor(message, { status = 500, code = "internal_error", path = "", method = "GET", details = null, retryable = false } = {}) {
    super(message);
    this.name = "ChannexApiError";
    this.status = status;
    this.code = code;
    this.path = path;
    this.method = method;
    this.details = details;
    this.retryable = retryable;
  }
}

/**
 * Custom Error class for WebBookingPro API errors.
 */
export class WbpApiError extends Error {
  constructor(message, { code = null, verb = "", guid = "", details = null, retryable = false } = {}) {
    super(message);
    this.name = "WbpApiError";
    this.code = code;
    this.verb = verb;
    this.guid = guid;
    this.details = details;
    this.retryable = retryable;
  }
}

/**
 * Channex.io REST API v1 Client.
 *
 * Implements outbound communication from Guest-Flow-Manager PMS to Channex.io Channel Manager.
 * Compliant with Channex REST API v1 and all 14 PMS Certification Tests.
 */
export class ChannexClient {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl]
   * @param {string} [options.appOrigin]
   * @param {string} [options.apiKey]
   * @param {string} [options.propertyId]
   * @param {string} [options.groupId]
   * @param {string} [options.roomTypeId]
   * @param {string} [options.ratePlanSemCafeId]
   * @param {string} [options.ratePlanComCafeId]
   * @param {string} [options.currency]
   * @param {string} [options.timezone]
   * @param {number} [options.timeoutMs]
   * @param {number} [options.maxRetries]
   * @param {number} [options.backoffBaseMs]
   * @param {number} [options.rateLimitPauseMs]
   * @param {object} [options.db]
   */
  constructor(options = {}) {
    const config = getChannexConfig(options.db);
    this.baseUrl = options.baseUrl || config.baseUrl;
    this.appOrigin = options.appOrigin || config.appOrigin;
    this.apiKey = options.apiKey !== undefined ? options.apiKey : config.apiKey;
    this.propertyId = options.propertyId || config.propertyId;
    this.groupId = options.groupId || config.groupId;
    this.roomTypeId = options.roomTypeId || config.roomTypeId;
    this.ratePlanSemCafeId = options.ratePlanSemCafeId || config.ratePlanSemCafeId;
    this.ratePlanComCafeId = options.ratePlanComCafeId || config.ratePlanComCafeId;
    this.currency = options.currency || config.currency;
    this.timezone = options.timezone || config.timezone;
    this.timeoutMs = options.timeoutMs || config.timeoutMs;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : config.maxRetries;
    this.backoffBaseMs = options.backoffBaseMs || 100;
    this.rateLimitPauseMs = options.rateLimitPauseMs !== undefined ? options.rateLimitPauseMs : config.rateLimitPauseMs;
    this.db = options.db || null;
  }

  /**
   * Sends a REST request to Channex API v1 with `user-api-key` authentication,
   * master switch guard, HTTP 429 rate-limit pause, and transient retry.
   *
   * @param {"GET" | "POST" | "PUT" | "DELETE"} method
   * @param {string} path - e.g. "/properties" or "/availability"
   * @param {object|null} [body]
   * @param {object} [options]
   * @param {boolean} [options.bypassSwitch]
   * @param {number} [options.rateLimitPauseMs]
   * @returns {Promise<any>}
   */
  async request(method, path, body = null, options = {}) {
    const mode = getIntegrationMode(this.db);

    if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
      throw new ChannexApiError(
        "Integração Channex.io desativada (wbp_integration_mode = 'off'). Nenhuma chamada de saída permitida.",
        {
          status: 403,
          code: "integration_disabled",
          path,
          method,
          retryable: false
        }
      );
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
    let attempt = 0;
    const maxAttempts = 1 + (options.maxRetries ?? this.maxRetries);

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

      try {
        const headers = {
          "Accept": "application/json",
          "user-api-key": options.apiKey !== undefined ? options.apiKey : this.apiKey
        };
        if (body !== null && method !== "GET") {
          headers["Content-Type"] = "application/json; charset=utf-8";
        }

        const response = await fetch(url, {
          method,
          headers,
          body: body !== null && method !== "GET" ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const text = await response.text();
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_) {
            throw new ChannexApiError(
              `Resposta Channex não é JSON válido (HTTP ${response.status}): ${text.slice(0, 200)}`,
              {
                status: response.status,
                code: "invalid_json",
                path: normalizedPath,
                method,
                retryable: attempt < maxAttempts
              }
            );
          }
        }

        if (!response.ok || (data && data.errors)) {
          const errObj = data?.errors || {};
          const errCode = errObj.code || (response.status === 429 ? "http_too_many_requests" : "api_error");
          const errTitle = errObj.title || response.statusText || "Erro retornado pela Channex API";
          const isRateLimit = response.status === 429 || errCode === "http_too_many_requests";
          const isServerError = response.status >= 500;
          const isRetryable = isRateLimit || isServerError;

          if (isRetryable && attempt < maxAttempts) {
            const waitMs = isRateLimit
              ? (options.rateLimitPauseMs ?? this.rateLimitPauseMs)
              : this.backoffBaseMs * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          throw new ChannexApiError(`Channex Erro [${response.status} ${errCode}]: ${errTitle}`, {
            status: response.status,
            code: errCode,
            path: normalizedPath,
            method,
            details: data,
            retryable: isRetryable
          });
        }

        return data;
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof ChannexApiError && !err.retryable) {
          throw err;
        }

        if (attempt < maxAttempts) {
          const delay = this.backoffBaseMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        const isTimeout = err.name === "AbortError";
        throw new ChannexApiError(
          `Falha na requisição Channex [${method} ${normalizedPath}] após ${attempt} tentativas: ${err.message}`,
          {
            status: isTimeout ? 504 : 503,
            code: isTimeout ? "timeout" : "network_error",
            path: normalizedPath,
            method,
            details: err,
            retryable: false
          }
        );
      }
    }
  }

  // ── Properties API ───────────────────────────────────────────────────────

  async listProperties(options = {}) {
    return this.request("GET", "/properties", null, options);
  }

  async getPropertyOptions(options = {}) {
    return this.request("GET", "/properties/options", null, options);
  }

  async getProperty(propertyId = this.propertyId, options = {}) {
    if (!propertyId) throw new Error("propertyId é obrigatório para getProperty.");
    return this.request("GET", `/properties/${propertyId}`, null, options);
  }

  async createProperty(property = {}, options = {}) {
    return this.request("POST", "/properties", { property }, options);
  }

  async updateProperty(propertyId, property = {}, options = {}) {
    if (!propertyId) throw new Error("propertyId é obrigatório para updateProperty.");
    return this.request("PUT", `/properties/${propertyId}`, { property }, options);
  }

  // ── Room Types API ───────────────────────────────────────────────────────

  async listRoomTypes(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/room_types${query}`, null, options);
  }

  async getRoomTypeOptions(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/room_types/options${query}`, null, options);
  }

  async createRoomType(roomType = {}, options = {}) {
    return this.request("POST", "/room_types", { room_type: roomType }, options);
  }

  async updateRoomType(roomTypeId, roomType = {}, options = {}) {
    if (!roomTypeId) throw new Error("roomTypeId é obrigatório para updateRoomType.");
    return this.request("PUT", `/room_types/${roomTypeId}`, { room_type: roomType }, options);
  }

  async deleteRoomType(roomTypeId, options = {}) {
    if (!roomTypeId) throw new Error("roomTypeId é obrigatório para deleteRoomType.");
    return this.request("DELETE", `/room_types/${roomTypeId}`, null, options);
  }

  // ── Rate Plans API ───────────────────────────────────────────────────────

  async listRatePlans(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/rate_plans${query}`, null, options);
  }

  async getRatePlanOptions(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/rate_plans/options${query}`, null, options);
  }

  async createRatePlan(ratePlan = {}, options = {}) {
    return this.request("POST", "/rate_plans", { rate_plan: ratePlan }, options);
  }

  async updateRatePlan(ratePlanId, ratePlan = {}, options = {}) {
    if (!ratePlanId) throw new Error("ratePlanId é obrigatório para updateRatePlan.");
    return this.request("PUT", `/rate_plans/${ratePlanId}`, { rate_plan: ratePlan }, options);
  }

  async deleteRatePlan(ratePlanId, options = {}) {
    if (!ratePlanId) throw new Error("ratePlanId é obrigatório para deleteRatePlan.");
    return this.request("DELETE", `/rate_plans/${ratePlanId}`, null, options);
  }

  // ── 1-Click CorpFlats Inventory Auto-Setup ───────────────────────────────

  /**
   * Automatically discovers or creates the CorpFlats Soho Residence inventory on Channex:
   * - Property: "CorpFlats Soho Residence" (BRL, America/Sao_Paulo, property_type: "apart_hotel", state_length: 500)
   * - Room Type: "Flat" (count_of_rooms: 19, occ_adults: 3, default_occupancy: 2)
   * - Rate Plan 1: "Sem Café" (sell_mode: per_person, occupancies 1, 2 [primary], 3, ui_read_only: true)
   * - Rate Plan 2: "Com Café" (sell_mode: per_person, occupancies 1, 2 [primary], 3, ui_read_only: true)
   * - Optional Webhook registration when options.callbackUrl is supplied.
   *
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async autoSetupCorpFlats(options = {}) {
    const reqOpts = { ...options };

    // 1. Property
    let propertyId = this.propertyId;
    let groupId = this.groupId;
    const existingProps = await this.getPropertyOptions(reqOpts);
    const propList = existingProps?.data || [];
    const foundProp = propList.find(
      (p) =>
        (propertyId && p.id === propertyId) ||
        (p.attributes?.title || "").toLowerCase().includes("corpflats")
    );
    if (foundProp) {
      propertyId = foundProp.id;
      if (Array.isArray(foundProp.attributes?.group_ids) && foundProp.attributes.group_ids[0]) {
        groupId = foundProp.attributes.group_ids[0];
      }
    } else {
      propertyId = "";
    }

    if (!propertyId) {
      const createdProp = await this.createProperty(
        {
          title: "CorpFlats Soho Residence",
          currency: this.currency || "BRL",
          country: "BR",
          state: "RJ",
          city: "Campos dos Goytacazes",
          address: "Soho Residence",
          zip_code: "28035-000",
          timezone: this.timezone || "America/Sao_Paulo",
          property_type: "apart_hotel",
          meta: {
            pms: "Guest-Flow-Manager",
            property_code: "CORPFLATS-SOHO"
          },
          settings: {
            allow_availability_autoupdate_on_confirmation: true,
            allow_availability_autoupdate_on_modification: false,
            allow_availability_autoupdate_on_cancellation: false,
            min_stay_type: "both",
            state_length: 500
          }
        },
        reqOpts
      );
      propertyId = createdProp?.data?.id;
      const createdGroup = createdProp?.data?.relationships?.groups?.data?.[0]?.id;
      if (createdGroup) {
        groupId = createdGroup;
      }
    }

    // 2. Room Type "Flat" (19 flats)
    let roomTypeId = this.roomTypeId;
    const existingRooms = await this.getRoomTypeOptions(propertyId, reqOpts);
    const foundRoom = (existingRooms?.data || []).find(
      (r) =>
        r.id === roomTypeId ||
        (r.attributes?.title || "").toLowerCase() === "flat"
    );
    if (foundRoom) {
      roomTypeId = foundRoom.id;
    } else {
      const createdRoom = await this.createRoomType(
        {
          property_id: propertyId,
          title: "Flat",
          count_of_rooms: 19,
          occ_adults: 3,
          occ_children: 1,
          occ_infants: 1,
          default_occupancy: 2,
          room_kind: "room",
          meta: {
            pms: "Guest-Flow-Manager",
            room_code: "flat"
          }
        },
        reqOpts
      );
      roomTypeId = createdRoom?.data?.id;
    }

    // 3. Rate Plans: "Sem Café" and "Com Café"
    const existingRates = await this.getRatePlanOptions(propertyId, reqOpts);
    const rateList = existingRates?.data || [];

    let ratePlanSemCafeId = this.ratePlanSemCafeId;
    const foundSemCafe = rateList.find(
      (rp) =>
        rp.id === ratePlanSemCafeId ||
        (rp.attributes?.title || "").toLowerCase().includes("sem café") ||
        (rp.attributes?.title || "").toLowerCase().includes("sem cafe")
    );
    if (foundSemCafe) {
      ratePlanSemCafeId = foundSemCafe.id;
    } else {
      const createdSemCafe = await this.createRatePlan(
        {
          property_id: propertyId,
          room_type_id: roomTypeId,
          title: "Sem Café",
          sell_mode: "per_person",
          rate_mode: "manual",
          currency: this.currency || "BRL",
          meal_type: "none",
          ui_read_only: true,
          meta: {
            pms: "Guest-Flow-Manager",
            plan_code: "sem_cafe"
          },
          options: [
            { occupancy: 1, is_primary: false, rate: "250.00" },
            { occupancy: 2, is_primary: true, rate: "280.00" },
            { occupancy: 3, is_primary: false, rate: "350.00" }
          ]
        },
        reqOpts
      );
      ratePlanSemCafeId = createdSemCafe?.data?.id;
    }

    let ratePlanComCafeId = this.ratePlanComCafeId;
    const foundComCafe = rateList.find(
      (rp) =>
        rp.id === ratePlanComCafeId ||
        (rp.attributes?.title || "").toLowerCase().includes("com café") ||
        (rp.attributes?.title || "").toLowerCase().includes("com cafe")
    );
    if (foundComCafe) {
      ratePlanComCafeId = foundComCafe.id;
    } else {
      const createdComCafe = await this.createRatePlan(
        {
          property_id: propertyId,
          room_type_id: roomTypeId,
          title: "Com Café",
          sell_mode: "per_person",
          rate_mode: "manual",
          currency: this.currency || "BRL",
          meal_type: "breakfast",
          ui_read_only: true,
          meta: {
            pms: "Guest-Flow-Manager",
            plan_code: "com_cafe"
          },
          options: [
            { occupancy: 1, is_primary: false, rate: "285.00" },
            { occupancy: 2, is_primary: true, rate: "350.00" },
            { occupancy: 3, is_primary: false, rate: "455.00" }
          ]
        },
        reqOpts
      );
      ratePlanComCafeId = createdComCafe?.data?.id;
    }

    let webhookId = null;
    if (options.callbackUrl) {
      const createdWh = await this.createWebhook(
        {
          property_id: propertyId,
          callback_url: options.callbackUrl,
          event_mask: options.eventMask || "*",
          is_active: true,
          send_data: true
        },
        reqOpts
      );
      webhookId = createdWh?.data?.id || null;
    }

    this.propertyId = propertyId;
    if (groupId) this.groupId = groupId;
    this.roomTypeId = roomTypeId;
    this.ratePlanSemCafeId = ratePlanSemCafeId;
    this.ratePlanComCafeId = ratePlanComCafeId;

    if (this.db) {
      updateChannexConfig(
        {
          propertyId,
          ...(groupId ? { groupId } : {}),
          roomTypeId,
          ratePlanSemCafeId,
          ratePlanComCafeId
        },
        this.db
      );
    }

    return {
      propertyId,
      groupId: groupId || null,
      roomTypeId,
      ratePlanSemCafeId,
      ratePlanComCafeId,
      webhookId
    };
  }

  // ── ARI (Availability & Restrictions) API ────────────────────────────────

  /**
   * GET /api/v1/availability
   */
  async getAvailability({ propertyId = this.propertyId, dateFrom, dateTo } = {}, options = {}) {
    if (!propertyId) throw new Error("propertyId é obrigatório para getAvailability.");
    const params = new URLSearchParams();
    params.set("filter[property_id]", propertyId);
    if (dateFrom) params.set("filter[date][gte]", dateFrom);
    if (dateTo) params.set("filter[date][lte]", dateTo);
    return this.request("GET", `/availability?${params.toString()}`, null, options);
  }

  /**
   * POST /api/v1/availability
   * Updates availability per room type and returns the Channex task IDs and any warnings.
   *
   * @param {Array<object>} values
   * @param {object} [options]
   * @returns {Promise<{ data: Array, meta: object, warnings: Array, taskIds: Array<string> }>}
   */
  async updateAvailability(values = [], options = {}) {
    const res = await this.request("POST", "/availability", { values }, options);
    const taskIds = Array.isArray(res?.data)
      ? res.data.map((item) => item?.id).filter(Boolean)
      : [];
    const warnings = res?.meta?.warnings || res?.warnings || [];
    return {
      data: res?.data || [],
      meta: res?.meta || { message: "Success" },
      warnings,
      taskIds
    };
  }

  /**
   * GET /api/v1/restrictions
   */
  async getRestrictions(
    {
      propertyId = this.propertyId,
      dateFrom,
      dateTo,
      restrictions = "rate,stop_sell,closed_to_arrival,closed_to_departure,min_stay_arrival,min_stay_through,max_stay"
    } = {},
    options = {}
  ) {
    if (!propertyId) throw new Error("propertyId é obrigatório para getRestrictions.");
    const params = new URLSearchParams();
    params.set("filter[property_id]", propertyId);
    if (dateFrom) params.set("filter[date][gte]", dateFrom);
    if (dateTo) params.set("filter[date][lte]", dateTo);
    if (restrictions) params.set("filter[restrictions]", restrictions);
    return this.request("GET", `/restrictions?${params.toString()}`, null, options);
  }

  /**
   * POST /api/v1/restrictions
   * Updates rates and restrictions per rate plan and returns Channex task IDs and any warnings.
   *
   * @param {Array<object>} values
   * @param {object} [options]
   * @returns {Promise<{ data: Array, meta: object, warnings: Array, taskIds: Array<string> }>}
   */
  async updateRestrictions(values = [], options = {}) {
    const res = await this.request("POST", "/restrictions", { values }, options);
    const taskIds = Array.isArray(res?.data)
      ? res.data.map((item) => item?.id).filter(Boolean)
      : [];
    const warnings = res?.meta?.warnings || res?.warnings || [];
    return {
      data: res?.data || [],
      meta: res?.meta || { message: "Success" },
      warnings,
      taskIds
    };
  }

  // ── Booking Revisions Feed & Acknowledge API ─────────────────────────────

  /**
   * GET /api/v1/booking_revisions/feed
   * Primary Channex endpoint to fetch unacknowledged booking revisions.
   */
  async getBookingRevisionsFeed({ propertyId = this.propertyId, page = 1, limit = 100 } = {}, options = {}) {
    const params = new URLSearchParams();
    if (propertyId) params.set("filter[property_id]", propertyId);
    params.set("pagination[page]", String(page));
    params.set("pagination[limit]", String(limit));
    params.set("order[inserted_at]", "asc");
    return this.request("GET", `/booking_revisions/feed?${params.toString()}`, null, options);
  }

  /**
   * GET /api/v1/booking_revisions/:id
   */
  async getBookingRevisionById(revisionId, options = {}) {
    if (!revisionId) throw new Error("revisionId é obrigatório para getBookingRevisionById.");
    return this.request("GET", `/booking_revisions/${revisionId}`, null, options);
  }

  /**
   * Alias for getBookingRevisionById used by webhook callback handlers.
   */
  async getBookingRevision(revisionId, options = {}) {
    return this.getBookingRevisionById(revisionId, options);
  }

  /**
   * POST /api/v1/booking_revisions/:id/ack
   * Mandatory acknowledgement after a booking revision is durably persisted and processed.
   */
  async ackBookingRevision(revisionId, options = {}) {
    if (!revisionId) throw new Error("revisionId é obrigatório para ackBookingRevision.");
    return this.request("POST", `/booking_revisions/${revisionId}/ack`, {}, options);
  }

  /**
   * GET /api/v1/bookings/:id
   */
  async getBookingById(bookingId, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para getBookingById.");
    return this.request("GET", `/bookings/${bookingId}`, null, options);
  }

  /**
   * GET /api/v1/bookings
   */
  async listBookings({ propertyId = this.propertyId, page = 1, limit = 50 } = {}, options = {}) {
    const params = new URLSearchParams();
    if (propertyId) params.set("filter[property_id]", propertyId);
    params.set("pagination[page]", String(page));
    params.set("pagination[limit]", String(limit));
    return this.request("GET", `/bookings?${params.toString()}`, null, options);
  }

  // ── White-Label Headless IFrame One-Time Token API ───────────────────────

  /**
   * POST /api/v1/auth/one_time_token
   * Generates a 15-minute single-use token to open the Channex Channels IFrame inside CorpFlats PMS.
   */
  async createOneTimeToken(
    {
      propertyId = this.propertyId,
      groupId = this.groupId,
      username = "Admin CorpFlats",
      redirectTo = "/channels",
      language = "pt",
      channels = "",
      channelsFilter = "",
      availableChannels = "",
      allowNotificationsEdit = false,
      messagesShowBooking,
      hideMessagesAttachBtn,
      readOnlyAvailability
    } = {},
    options = {}
  ) {
    if (!propertyId) throw new Error("propertyId é obrigatório para createOneTimeToken.");
    const payload = {
      one_time_token: {
        property_id: propertyId,
        username
      }
    };
    if (groupId) payload.one_time_token.group_id = groupId;
    const res = await this.request("POST", "/auth/one_time_token", payload, options);
    const token = res?.data?.token || "";
    const iframeUrl = token
      ? this.buildIframeUrl({
          token,
          propertyId,
          groupId,
          redirectTo,
          language,
          channels,
          channelsFilter,
          availableChannels,
          allowNotificationsEdit,
          messagesShowBooking,
          hideMessagesAttachBtn,
          readOnlyAvailability
        })
      : "";
    return {
      token,
      iframeUrl,
      raw: res
    };
  }

  /**
   * Builds the Channex Headless IFrame URL in Portuguese with full parameter support.
   */
  buildIframeUrl({
    token,
    propertyId = this.propertyId,
    groupId = this.groupId,
    redirectTo = "/channels",
    language = "pt",
    channels = "",
    channelsFilter = "",
    availableChannels = "",
    allowNotificationsEdit = false,
    messagesShowBooking,
    hideMessagesAttachBtn,
    readOnlyAvailability
  } = {}) {
    const params = new URLSearchParams();
    params.set("oauth_session_key", token || "");
    params.set("app_mode", "headless");
    params.set("redirect_to", redirectTo);
    if (propertyId) params.set("property_id", propertyId);
    if (groupId) params.set("group_id", groupId);
    if (language) params.set("lng", language);
    if (channels) params.set("channels", channels);
    if (channelsFilter) params.set("channels_filter", channelsFilter);
    if (availableChannels) params.set("available_channels", availableChannels);
    params.set("allow_notifications_edit", allowNotificationsEdit ? "true" : "false");
    if (typeof messagesShowBooking === "boolean") {
      params.set("messages_show_booking", messagesShowBooking ? "true" : "false");
    }
    if (typeof hideMessagesAttachBtn === "boolean") {
      params.set("hide_messages_attach_btn", hideMessagesAttachBtn ? "true" : "false");
    }
    if (typeof readOnlyAvailability === "boolean") {
      params.set("read_only_availability", readOnlyAvailability ? "true" : "false");
    }
    return `${this.appOrigin.replace(/\/+$/, "")}/auth/exchange?${params.toString()}`;
  }

  // ── Identity, Tasks, Health & Channels API ───────────────────────────────

  async getWhoAmI(options = {}) {
    return this.request("GET", "/whoami", null, options);
  }

  async listTasks({ propertyId = this.propertyId, page = 1, limit = 50 } = {}, options = {}) {
    const params = new URLSearchParams();
    if (propertyId) params.set("filter[property_id]", propertyId);
    params.set("pagination[page]", String(page));
    params.set("pagination[limit]", String(limit));
    return this.request("GET", `/tasks?${params.toString()}`, null, options);
  }

  async getTask(taskId, options = {}) {
    if (!taskId) throw new Error("taskId é obrigatório para getTask.");
    return this.request("GET", `/tasks/${taskId}`, null, options);
  }

  async getPropertyHealth(propertyId = this.propertyId, options = {}) {
    if (!propertyId) throw new Error("propertyId é obrigatório para getPropertyHealth.");
    return this.request("GET", `/health_check/${propertyId}`, null, options);
  }

  async listChannels(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/channels${query}`, null, options);
  }

  async getChannel(channelId, options = {}) {
    if (!channelId) throw new Error("channelId é obrigatório para getChannel.");
    return this.request("GET", `/channels/${channelId}`, null, options);
  }

  // ── Webhooks, Signing Keys, Messages, Reviews, Live Feed & Availability Rules ──

  async listWebhooks(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/webhooks${query}`, null, options);
  }

  async createWebhook(webhook = {}, options = {}) {
    return this.request("POST", "/webhooks", { webhook }, options);
  }

  async updateWebhook(webhookId, webhook = {}, options = {}) {
    if (!webhookId) throw new Error("webhookId é obrigatório para updateWebhook.");
    return this.request("PUT", `/webhooks/${webhookId}`, { webhook }, options);
  }

  async deleteWebhook(webhookId, options = {}) {
    if (!webhookId) throw new Error("webhookId é obrigatório para deleteWebhook.");
    return this.request("DELETE", `/webhooks/${webhookId}`, null, options);
  }

  async testWebhook(webhookIdOrPayload = {}, options = {}) {
    if (typeof webhookIdOrPayload === "string" && webhookIdOrPayload.trim()) {
      return this.request("POST", `/webhooks/${webhookIdOrPayload.trim()}/test`, {}, options);
    }
    const payload =
      webhookIdOrPayload && typeof webhookIdOrPayload === "object" && !webhookIdOrPayload.webhook
        ? { webhook: webhookIdOrPayload }
        : webhookIdOrPayload || {};
    return this.request("POST", "/webhooks/test", payload, options);
  }

  async getWebhookLogs(paramsOrWebhookId = {}, options = {}) {
    if (typeof paramsOrWebhookId === "string" && paramsOrWebhookId.trim()) {
      return this.request("GET", `/webhooks/${paramsOrWebhookId.trim()}/logs`, null, options);
    }
    const { propertyId = this.propertyId, webhookId, page = 1, limit = 50 } = paramsOrWebhookId || {};
    const params = new URLSearchParams();
    if (propertyId) params.set("filter[property_id]", propertyId);
    if (webhookId) params.set("filter[webhook_id]", webhookId);
    params.set("pagination[page]", String(page));
    params.set("pagination[limit]", String(limit));
    return this.request("GET", `/webhook_logs?${params.toString()}`, null, options);
  }

  async listSigningKeys(billingAccountOrOptions = {}, options = {}) {
    if (typeof billingAccountOrOptions === "string" && billingAccountOrOptions.trim()) {
      return this.request(
        "GET",
        `/signing_keys?filter[billing_account_id]=${encodeURIComponent(billingAccountOrOptions.trim())}`,
        null,
        options
      );
    }
    const billingAccountId = billingAccountOrOptions?.billingAccountId || billingAccountOrOptions?.billing_account_id;
    const reqOpts = billingAccountId ? options : billingAccountOrOptions;
    const query = billingAccountId
      ? `?filter[billing_account_id]=${encodeURIComponent(billingAccountId)}`
      : "";
    return this.request("GET", `/signing_keys${query}`, null, reqOpts);
  }

  async createSigningKey(signingKey = {}, options = {}) {
    const payload = signingKey && signingKey.signing_key ? signingKey : { signing_key: signingKey };
    return this.request("POST", "/signing_keys", payload, options);
  }

  async generateSigningKeyVersion(keyId, options = {}) {
    if (!keyId) throw new Error("keyId é obrigatório para generateSigningKeyVersion.");
    return this.request("POST", `/signing_keys/${keyId}/generate`, {}, options);
  }

  async rotateSigningKey(keyId, options = {}) {
    if (!keyId) throw new Error("keyId é obrigatório para rotateSigningKey.");
    return this.request("POST", `/signing_keys/${keyId}/rotate`, {}, options);
  }

  async deleteSigningKey(keyId, options = {}) {
    if (!keyId) throw new Error("keyId é obrigatório para deleteSigningKey.");
    return this.request("DELETE", `/signing_keys/${keyId}`, null, options);
  }

  // ── Booking OTA Channel Actions ──────────────────────────────────────────

  async reportNoShow(bookingId, { waivedFees = true, penaltyAmount } = {}, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para reportNoShow.");
    const noShowPayload = { waived_fees: Boolean(waivedFees) };
    if (penaltyAmount != null) noShowPayload.penalty_amount = String(penaltyAmount);
    return this.request("POST", `/bookings/${bookingId}/no_show`, { no_show_report: noShowPayload }, options);
  }

  async reportInvalidCard(bookingId, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para reportInvalidCard.");
    return this.request("POST", `/bookings/${bookingId}/invalid_card`, {}, options);
  }

  async cancelDueInvalidCard(bookingId, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para cancelDueInvalidCard.");
    return this.request("POST", `/bookings/${bookingId}/cancel_due_invalid_card`, {}, options);
  }

  async reportGuestMisconduct(bookingId, report = {}, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para reportGuestMisconduct.");
    return this.request("POST", `/bookings/${bookingId}/guest_misconduct`, { misconduct_report: report }, options);
  }

  async requestStayChange(bookingId, stayChange = {}, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para requestStayChange.");
    return this.request("POST", `/bookings/${bookingId}/change_stay`, { stay_change: stayChange }, options);
  }

  async getBookingPriceBreakdown(bookingId, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para getBookingPriceBreakdown.");
    return this.request("GET", `/bookings/${bookingId}/price_breakdown`, null, options);
  }

  async getBookingPayoutDetails(bookingId, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para getBookingPayoutDetails.");
    return this.request("GET", `/bookings/${bookingId}/payout_details`, null, options);
  }

  async getBookingMessages(bookingId, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para getBookingMessages.");
    return this.request("GET", `/bookings/${bookingId}/messages`, null, options);
  }

  async sendBookingMessage(bookingId, messageText, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para sendBookingMessage.");
    return this.request(
      "POST",
      `/bookings/${bookingId}/messages`,
      { message: { message: String(messageText || "") } },
      options
    );
  }

  async sendBookingAttachment(bookingId, attachment = {}, options = {}) {
    if (!bookingId) throw new Error("bookingId é obrigatório para sendBookingAttachment.");
    return this.request("POST", `/bookings/${bookingId}/messages`, { message: attachment }, options);
  }

  async closeMessageThread(threadId, options = {}) {
    if (!threadId) throw new Error("threadId é obrigatório para closeMessageThread.");
    return this.request("POST", `/message_threads/${threadId}/close`, {}, options);
  }

  async markThreadAsNoReplyNeeded(threadId, options = {}) {
    if (!threadId) throw new Error("threadId é obrigatório para markThreadAsNoReplyNeeded.");
    return this.request("POST", `/message_threads/${threadId}/no_reply_needed`, {}, options);
  }

  async listReviews(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/reviews${query}`, null, options);
  }

  async replyToReview(reviewId, replyText, options = {}) {
    if (!reviewId) throw new Error("reviewId é obrigatório para replyToReview.");
    return this.request(
      "POST",
      `/reviews/${reviewId}/reply`,
      { reply: { reply: String(replyText || "") } },
      options
    );
  }

  async listLiveFeed(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/live_feed${query}`, null, options);
  }

  async getLiveFeedEvent(eventId, options = {}) {
    if (!eventId) throw new Error("eventId é obrigatório para getLiveFeedEvent.");
    return this.request("GET", `/live_feed/${eventId}`, null, options);
  }

  async resolveLiveFeedEvent(eventId, resolution = {}, options = {}) {
    if (!eventId) throw new Error("eventId é obrigatório para resolveLiveFeedEvent.");
    return this.request("POST", `/live_feed/${eventId}/resolve`, { resolution }, options);
  }

  async listAvailabilityRules(propertyId = this.propertyId, options = {}) {
    const query = propertyId ? `?filter[property_id]=${encodeURIComponent(propertyId)}` : "";
    return this.request("GET", `/availability_rules${query}`, null, options);
  }

  async createAvailabilityRule(availabilityRule = {}, options = {}) {
    return this.request("POST", "/availability_rules", { availability_rule: availabilityRule }, options);
  }

  async updateAvailabilityRule(ruleId, availabilityRule = {}, options = {}) {
    if (!ruleId) throw new Error("ruleId é obrigatório para updateAvailabilityRule.");
    return this.request("PUT", `/availability_rules/${ruleId}`, { availability_rule: availabilityRule }, options);
  }

  async deleteAvailabilityRule(ruleId, options = {}) {
    if (!ruleId) throw new Error("ruleId é obrigatório para deleteAvailabilityRule.");
    return this.request("DELETE", `/availability_rules/${ruleId}`, null, options);
  }
}

/**
 * WebBookingPro API Client.
 *
 * Implements outbound communication from Guest-Flow-Manager PMS to WebBookingPro Channel Manager.
 * Compliant with Build-To-Us v1.0 specification and operational safety constraints.
 */
export class WBPClient {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl]
   * @param {string} [options.pmsCid]
   * @param {string} [options.sharedSecret]
   * @param {string} [options.wbpPropertyId]
   * @param {string} [options.wbpPropertyPassword]
   * @param {string} [options.pmsPropertyId]
   * @param {string} [options.currency]
   * @param {number} [options.timeoutMs]
   * @param {number} [options.maxRetries]
   * @param {number} [options.backoffBaseMs]
   * @param {object} [options.db]
   */
  constructor(options = {}) {
    const config = getWbpConfig(options.db);
    this.baseUrl = options.baseUrl || config.baseUrl;
    this.pmsCid = options.pmsCid || config.pmsCid;
    this.sharedSecret = options.sharedSecret || config.sharedSecret;
    this.wbpPropertyId = options.wbpPropertyId || config.wbpPropertyId;
    this.wbpPropertyPassword = options.wbpPropertyPassword || config.wbpPropertyPassword;
    this.pmsPropertyId = options.pmsPropertyId || config.pmsPropertyId;
    this.currency = options.currency || config.currency;
    this.timeoutMs = options.timeoutMs || config.timeoutMs;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : config.maxRetries;
    this.backoffBaseMs = options.backoffBaseMs || 100; // Fast for testing, configurable
    this.db = options.db || null;
  }

  /**
   * Determines if a specific WBP error code is retryable.
   *
   * @param {number|string} code
   * @returns {boolean}
   */
  isRetryableError(code) {
    const num = Number(code);
    // Transient error codes:
    // 3: Communication failure with channel
    // 1003: Channel offline or temporary timeout
    // 1004: Service temporarily unable to update
    return [3, 1003, 1004].includes(num);
  }

  /**
   * Adjusts timestamp for GetBookingList:
   * "To ensure that no booking are skipped due to a time-offset between your and our servers,
   * make sure to always reduce 5 or more minutes from the time given."
   *
   * @param {string|null} version - "YYYY-MM-DD HH:MM:SS" or null
   * @returns {string|null}
   */
  adjustBookingVersion(version) {
    if (!version || typeof version !== "string") return null;

    try {
      // Normalize space or T separator
      const isoCandidate = version.trim().replace(" ", "T") + (version.includes("Z") ? "" : "Z");
      const date = new Date(isoCandidate);
      if (isNaN(date.getTime())) return version;

      // Subtract 5 minutes
      date.setMinutes(date.getMinutes() - 5);

      const pad = (n) => String(n).padStart(2, "0");
      const y = date.getUTCFullYear();
      const m = pad(date.getUTCMonth() + 1);
      const d = pad(date.getUTCDate());
      const hh = pad(date.getUTCHours());
      const mm = pad(date.getUTCMinutes());
      const ss = pad(date.getUTCSeconds());

      return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    } catch (_) {
      return version;
    }
  }

  /**
   * Sends a request to the WBP API with automatic auth, UUID v4 GUID, retries, and general switch enforcement.
   *
   * @param {string} verb
   * @param {object} [params]
   * @param {object} [options]
   * @param {boolean} [options.bypassSwitch] - Allows explicit testing of client methods when integration mode is off
   * @returns {Promise<any>}
   */
  async request(verb, params = {}, options = {}) {
    const mode = getIntegrationMode(this.db);

    // Operational General Switch Guard:
    // When mode is 'off', 0 outbound requests are made to WebBookingPro.
    if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
      throw new WbpApiError("Integração WBP desativada (wbp_integration_mode = 'off'). Nenhuma chamada de saída permitida.", {
        code: 1031,
        verb,
        retryable: false
      });
    }

    // Generate unique UUID v4 GUID for this logical call
    const guid = options.guid || crypto.randomUUID();

    // Prepare standard request envelope
    const payload = {
      verb,
      pms_cid: this.pmsCid,
      shared_secret: this.sharedSecret,
      guid,
      pms_property_id: this.pmsPropertyId,
      wbp_property_id: this.wbpPropertyId,
      wbp_property_password: this.wbpPropertyPassword,
      ...params
    };

    const url = `${this.baseUrl.replace(/\/+$/, "")}/${verb}`;
    let attempt = 0;
    const maxAttempts = 1 + (options.maxRetries ?? this.maxRetries);

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        let data;
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (_) {
          throw new WbpApiError(`Resposta WBP não é JSON válido (HTTP ${response.status}): ${text.slice(0, 200)}`, {
            code: 4,
            verb,
            guid,
            retryable: attempt < maxAttempts
          });
        }

        // Check if API returned success: false
        if (data && data.success === false) {
          const firstErr = Array.isArray(data.errors) ? data.errors[0] : null;
          const errorCode = firstErr?.id || data.ErrorCode || data.Error || 1000;
          const errorMsg = firstErr?.msg || data.Error || data.ErrorMsg || "Erro desconhecido retornado pela WBP";
          const isRetryable = this.isRetryableError(errorCode);

          if (isRetryable && attempt < maxAttempts) {
            const delay = this.backoffBaseMs * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
            continue; // Retry with EXACT SAME GUID!
          }

          throw new WbpApiError(`WBP Erro [${errorCode}]: ${errorMsg}`, {
            code: errorCode,
            verb,
            guid,
            details: data,
            retryable: isRetryable
          });
        }

        return data;
      } catch (err) {
        clearTimeout(timeoutId);

        // If it's already a non-retryable WbpApiError, rethrow immediately
        if (err instanceof WbpApiError && !err.retryable) {
          throw err;
        }

        const isTimeout = err.name === "AbortError";
        const isNetworkErr = err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || isTimeout;

        if (attempt < maxAttempts) {
          const delay = this.backoffBaseMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          continue; // Retry with EXACT SAME GUID!
        }

        throw new WbpApiError(`Falha na requisição WBP [${verb}] após ${attempt} tentativas: ${err.message}`, {
          code: isTimeout ? 1003 : 3,
          verb,
          guid,
          details: err,
          retryable: false
        });
      }
    }
  }

  // ── Mandatory Outbound Endpoints ─────────────────────────────────────────

  async healthCheck(options = {}) {
    return this.request("HealthCheck", {}, options);
  }

  async setupProperty(params = {}, options = {}) {
    return this.request("SetupProperty", { RoomInfo: params.RoomInfo || [] }, options);
  }

  async getRoomTypes(options = {}) {
    return this.request("GetRoomTypes", {}, options);
  }

  async getRatePlans(options = {}) {
    return this.request("GetRatePlans", {}, options);
  }

  async sendARIUpdate(params = {}, options = {}) {
    const currency = params.currency || this.currency;
    const inventory = params.Inventory || [];

    const res = await this.request(
      "ARIUpdate",
      {
        currency,
        Inventory: inventory
      },
      options
    );

    return {
      success: res?.success === true,
      guid: options.guid || (res && res.guid)
    };
  }

  async getBookingList(params = {}, options = {}) {
    const adjustedVersion = this.adjustBookingVersion(params.wbp_booking_version ?? null);
    return this.request("GetBookingList", { wbp_booking_version: adjustedVersion }, options);
  }

  async getBookingId(params = {}, options = {}) {
    if (!params.booking_id) {
      throw new Error("booking_id é obrigatório para GetBookingId.");
    }
    return this.request("GetBookingId", { booking_id: String(params.booking_id) }, options);
  }

  async ackBooking(params = {}, options = {}) {
    if (!params.booking_id) {
      throw new Error("booking_id é obrigatório para AckBooking.");
    }
    return this.request("AckBooking", { booking_id: String(params.booking_id) }, options);
  }
}
