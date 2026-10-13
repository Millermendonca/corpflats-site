import crypto from "node:crypto";
import { getWbpConfig, getIntegrationMode, WBP_MODES } from "./config.mjs";

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

  /**
   * HealthCheck: Verifies operational connectivity with WBP.
   *
   * @param {object} [options]
   * @returns {Promise<{ success: boolean }>}
   */
  async healthCheck(options = {}) {
    return this.request("HealthCheck", {}, options);
  }

  /**
   * SetupProperty: Validates property credentials and channel management status.
   *
   * @param {object} [params]
   * @param {Array} [params.RoomInfo]
   * @param {object} [options]
   * @returns {Promise<{ success: boolean }>}
   */
  async setupProperty(params = {}, options = {}) {
    return this.request("SetupProperty", { RoomInfo: params.RoomInfo || [] }, options);
  }

  /**
   * GetRoomTypes: Retrieves configured room types from WBP.
   *
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, Rooms: Array<object> }>}
   */
  async getRoomTypes(options = {}) {
    return this.request("GetRoomTypes", {}, options);
  }

  /**
   * GetRatePlans: Retrieves rate plans configured on WBP.
   *
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, RatePlans: Array<object> }>}
   */
  async getRatePlans(options = {}) {
    return this.request("GetRatePlans", {}, options);
  }

  /**
   * ARIUpdate: Pushes inventory availability, pricing, and restrictions.
   *
   * @param {object} params
   * @param {string} [params.currency]
   * @param {Array<object>} params.Inventory
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, guid: string }>}
   */
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

  /**
   * GetBookingList: Retrieves bookings modified or created since wbp_booking_version.
   * Subtracts 5 minutes from version timestamp per spec rules to prevent race conditions.
   *
   * @param {object} [params]
   * @param {string|null} [params.wbp_booking_version]
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, Bookings: Array<object> }>}
   */
  async getBookingList(params = {}, options = {}) {
    const adjustedVersion = this.adjustBookingVersion(params.wbp_booking_version ?? null);
    return this.request("GetBookingList", { wbp_booking_version: adjustedVersion }, options);
  }

  /**
   * GetBookingId: Downloads full reservation details by booking_id.
   *
   * @param {object} params
   * @param {string} params.booking_id
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, reservation: object }>}
   */
  async getBookingId(params = {}, options = {}) {
    if (!params.booking_id) {
      throw new Error("booking_id é obrigatório para GetBookingId.");
    }
    return this.request("GetBookingId", { booking_id: String(params.booking_id) }, options);
  }

  /**
   * AckBooking: Acknowledges receipt and import of booking.
   *
   * @param {object} params
   * @param {string} params.booking_id
   * @param {object} [options]
   * @returns {Promise<{ success: boolean }>}
   */
  async ackBooking(params = {}, options = {}) {
    if (!params.booking_id) {
      throw new Error("booking_id é obrigatório para AckBooking.");
    }
    return this.request("AckBooking", { booking_id: String(params.booking_id) }, options);
  }
}
