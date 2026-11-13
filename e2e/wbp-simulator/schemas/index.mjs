/**
 * OpenAPI Schema Validator for WebBookingPro (Build-To-Us v1.0).
 * Grounded in wbpAPI.yaml with tolerant handling for documented Errata E1-E10.
 */

export const UUID_V4_REGEX = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const WBP_VERSION_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Validates the common authentication envelope present on every outbound PMS -> WBP request.
 *
 * @param {object} body
 * @param {string} expectedVerb
 * @param {object} [options]
 * @returns {Array<string>} list of validation error messages
 */
export function validateCommonEnvelope(body, expectedVerb, options = { tolerant: true }) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Corpo da requisição deve ser um objeto JSON."];
  }

  // Verb validation
  if (!body.verb) {
    errors.push("Campo obrigatório 'verb' ausente.");
  } else if (expectedVerb && body.verb !== expectedVerb) {
    // Tolerant handling for Erratum E7 and OpenAPI documentation gaps (GetMessages/GetReviews examples)
    const isToleratedMismatch = options.tolerant && (
      (expectedVerb === "FullRefreshChannel" && body.verb === "UpdateRatePlan") ||
      (expectedVerb === "GetMessages" && body.verb === "RespondMessage") ||
      (expectedVerb === "GetReviews" && body.verb === "RespondReview")
    );
    if (!isToleratedMismatch) {
      errors.push(`'verb' incompatível: esperado '${expectedVerb}', recebido '${body.verb}'.`);
    }
  }

  // GUID validation (must be valid UUID v4)
  if (!body.guid) {
    errors.push("Campo obrigatório 'guid' ausente.");
  } else if (typeof body.guid !== "string" || !UUID_V4_REGEX.test(body.guid)) {
    errors.push(`'guid' inválido: '${body.guid}'. Deve ser um UUID v4 no formato 8-4-4-4-12.`);
  }

  // pms_cid validation
  if (!body.pms_cid && body.pms_cid !== "") {
    errors.push("Campo obrigatório 'pms_cid' ausente.");
  } else if (typeof body.pms_cid !== "string") {
    errors.push("'pms_cid' deve ser string.");
  }

  // shared_secret validation
  if (body.shared_secret === undefined || body.shared_secret === null) {
    errors.push("Campo obrigatório 'shared_secret' ausente.");
  }

  // Property ID validation (tolerates string or number per Erratum E9)
  if (body.wbp_property_id !== undefined && body.wbp_property_id !== null && body.wbp_property_id !== "") {
    if (typeof body.wbp_property_id !== "string" && typeof body.wbp_property_id !== "number") {
      errors.push("'wbp_property_id' deve ser string ou número.");
    }
  }

  return errors;
}

/**
 * Validates request payload for a specific endpoint against OpenAPI specification.
 *
 * @param {string} verb
 * @param {any} body
 * @param {object} [options]
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateRequest(verb, body, options = { tolerant: true }) {
  const errors = validateCommonEnvelope(body, verb, options);

  switch (verb) {
    case "HealthCheck":
      // HealthCheck has only common envelope
      break;

    case "SetupProperty":
      if (!body.wbp_property_id && body.wbp_property_id !== 0) {
        errors.push("SetupProperty requer 'wbp_property_id'.");
      }
      if (!body.wbp_property_password && body.wbp_property_password !== "") {
        errors.push("SetupProperty requer 'wbp_property_password'.");
      }
      if (body.RoomInfo && !Array.isArray(body.RoomInfo)) {
        errors.push("'RoomInfo' em SetupProperty deve ser um array.");
      }
      break;

    case "GetRoomTypes":
    case "GetRatePlans":
      if (!body.wbp_property_id && body.wbp_property_id !== 0) {
        errors.push(`${verb} requer 'wbp_property_id'.`);
      }
      break;

    case "ARIUpdate":
      if (!body.currency || typeof body.currency !== "string" || body.currency.length !== 3) {
        errors.push("ARIUpdate requer código de moeda ISO de 3 letras em 'currency'.");
      }
      if (!Array.isArray(body.Inventory)) {
        errors.push("ARIUpdate requer array 'Inventory'.");
      } else {
        body.Inventory.forEach((item, index) => {
          if (!item.wbp_room_id && item.wbp_room_id !== 0) {
            errors.push(`Inventory[${index}] requer 'wbp_room_id'.`);
          }
          if (!item.wbp_rate_id && item.wbp_rate_id !== 0) {
            errors.push(`Inventory[${index}] requer 'wbp_rate_id'.`);
          }
          if (!item.start_date || !ISO_DATE_REGEX.test(item.start_date)) {
            errors.push(`Inventory[${index}] 'start_date' deve ser YYYY-MM-DD.`);
          }
          if (!item.end_date || !ISO_DATE_REGEX.test(item.end_date)) {
            errors.push(`Inventory[${index}] 'end_date' deve ser YYYY-MM-DD.`);
          }
          if (item.start_date && item.end_date && item.start_date > item.end_date) {
            errors.push(`Inventory[${index}] 'start_date' (${item.start_date}) não pode ser posterior a 'end_date' (${item.end_date}).`);
          }
          if (item.units !== undefined) {
            const unitsNum = Number(item.units);
            if (!Number.isInteger(unitsNum) || unitsNum < 0) {
              errors.push(`Inventory[${index}] 'units' deve ser inteiro não-negativo.`);
            }
          }
          if (item.rate !== undefined) {
            const rateNum = Number(item.rate);
            if (isNaN(rateNum) || rateNum < 0) {
              errors.push(`Inventory[${index}] 'rate' deve ser número decimal válido.`);
            }
          }
          if (item.min_los !== undefined && (!Number.isInteger(Number(item.min_los)) || Number(item.min_los) < 1)) {
            errors.push(`Inventory[${index}] 'min_los' deve ser inteiro >= 1.`);
          }
          if (item.max_los !== undefined && (!Number.isInteger(Number(item.max_los)) || Number(item.max_los) < 0)) {
            errors.push(`Inventory[${index}] 'max_los' deve ser inteiro >= 0.`);
          }
        });
      }
      break;

    case "GetBookingList":
      if (body.wbp_booking_version !== null && body.wbp_booking_version !== undefined) {
        if (typeof body.wbp_booking_version !== "string") {
          errors.push("'wbp_booking_version' deve ser string ou null.");
        } else if (!WBP_VERSION_REGEX.test(body.wbp_booking_version) && isNaN(Date.parse(body.wbp_booking_version))) {
          errors.push(`'wbp_booking_version' inválido: '${body.wbp_booking_version}'. Esperado 'YYYY-MM-DD HH:MM:SS' ou null.`);
        }
      }
      break;

    case "GetBookingId":
      if (!body.booking_id && body.booking_id !== 0) {
        errors.push("GetBookingId requer 'booking_id'.");
      }
      break;

    case "AckBooking":
      if (!body.booking_id && body.booking_id !== 0) {
        errors.push("AckBooking requer 'booking_id'.");
      }
      break;

    case "GetMessages":
      // Validates common envelope
      break;

    case "SendMessage":
      if (!body.wbp_Message_id && body.wbp_Message_id !== 0 && !body.message && !body.text) {
        errors.push("SendMessage requer 'wbp_Message_id' ou 'message'.");
      }
      break;

    case "GetReviews":
      // Validates common envelope
      break;

    case "RespondReview":
      if (!body.wbp_review_id && body.wbp_review_id !== 0 && !body.response) {
        errors.push("RespondReview requer 'wbp_review_id' ou 'response'.");
      }
      break;

    default:
      // Unknown verb
      errors.push(`Verbo desconhecido ou não suportado: '${verb}'.`);
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates PMS callback payload (WBP -> PMS).
 *
 * @param {string} endpoint - 'BookingCreate' | 'NotifyBooking' | 'ARIFullRefresh' | 'RoomInfo'
 * @param {any} body
 * @param {object} [options]
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateCallback(endpoint, body, options = { tolerant: true }) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Corpo do callback deve ser um objeto."] };
  }

  if (endpoint === "NotifyBooking") {
    // Form-urlencoded callback
    if (!body.shared_secret) errors.push("NotifyBooking requer 'shared_secret'.");
    if (!body.booking_id) errors.push("NotifyBooking requer 'booking_id'.");
    if (!body.wbp_property_id) errors.push("NotifyBooking requer 'wbp_property_id'.");
    return { valid: errors.length === 0, errors };
  }

  // JSON callbacks
  if (!body.shared_secret) {
    errors.push("Callback requer 'shared_secret'.");
  }

  if (endpoint === "BookingCreate") {
    // Erratum E2: tolerates 'reservation' or 'booking'
    const res = body.reservation || (options.tolerant ? body.booking : null);
    if (!res) {
      errors.push("BookingCreate requer objeto 'reservation' (ou 'booking').");
    } else {
      if (!res.OrderId && !res.orderId && !res.booking_id) {
        errors.push("Objeto de reserva requer identificador 'OrderId'.");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
