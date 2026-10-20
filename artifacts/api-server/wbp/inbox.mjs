/**
 * artifacts/api-server/wbp/inbox.mjs
 *
 * Milestone 4: OTA Inbox, Fair-Share Flat Allocation, Quarantine & Mutations.
 * Features 19, 20, 21, 23.
 *
 * Responsibilities:
 * - Feature 19: Payload normalization, inclusive EndDate resolution, Fair-Share allocation across 19 Soho flats,
 *   strict PaymentCollect handling (Channel vs Property, preventing legacy pago_total overwrite).
 * - Feature 20: Quarantine Management Engine (7 anomaly trigger conditions, resolve, reject, link).
 * - Feature 21: OTA Mutations (Cancellations with in-house/check-in safety guard, Modifications with 3-tier reallocation).
 * - Feature 23: Automations & Strict PIX Suppression (zero PIX for OTAs, WhatsApp welcome, SERPRO, Housekeeping, Reception email).
 *
 * Mirrors byte-for-byte in scripts/wbp/inbox.mjs.
 */

import crypto from "node:crypto";
import {
  CORPFLATS_19_FLATS,
  getCanonicalFlats,
  checkFlatBlockedOnNight,
  calculateCanonicalAvailability,
  normalizeDateStr,
  getNightsBetween
} from "./availability.mjs";
import { notifyPmsMutation } from "./ari-sync.mjs";
import { findBestManualMatch, applySafeReconciliationLink } from "./reconciler.mjs";
import { getAlertsManager } from "./alerts.mjs";
import { isWbpAutoMode, isWbpEnabled, WBP_MODES, getIntegrationMode } from "./config.mjs";
import { getCardVault } from "./vault.mjs";

/**
 * Adds integer days to a YYYY-MM-DD date string.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

/**
 * Strips all CVV/CVC/security_code fields deeply and recursively in memory.
 * PCI DSS Requirement R6.
 *
 * @param {any} obj
 * @returns {any}
 */
export function stripCvvDeep(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripCvvDeep);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (/^(card_?)?(cv[vc2]|security_code|securitycode)$/i.test(key)) {
      continue; // stripped immediately in memory
    }
    clean[key] = stripCvvDeep(value);
  }
  return clean;
}

/**
 * Detects card brand from PAN digits.
 * @param {string} pan
 * @returns {string}
 */
export function detectCardBrand(pan) {
  if (!pan) return "Desconhecida";
  const clean = String(pan).replace(/\D/g, "");
  if (/^4/.test(clean)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(clean)) return "Mastercard";
  if (/^3[47]/.test(clean)) return "Amex";
  if (/^(6011|65|64[4-9])/.test(clean)) return "Discover";
  if (/^(4011|438935|451416|4576|504175|506699|5067|509|627780|636297|636368|650|6516|6550)/.test(clean)) return "Elo";
  if (/^(30[0-5]|36|38)/.test(clean)) return "Diners";
  if (/^(352[89]|35[3-8][0-9])/.test(clean)) return "JCB";
  if (/^(606282|3841)/.test(clean)) return "Hipercard";
  return "Desconhecida";
}

/**
 * Masks PAN to last 4 digits.
 * @param {string} pan
 * @returns {string}
 */
export function maskPan(pan) {
  if (!pan) return "";
  const clean = String(pan).replace(/\D/g, "");
  if (clean.length < 4) return "****";
  const last4 = clean.slice(-4);
  return `**** **** **** ${last4}`;
}

/**
 * Deep masks any full card number / PAN field in nested objects.
 * @param {any} obj
 * @returns {any}
 */
export function maskPanDeep(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(maskPanDeep);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (/^(card_?number|cardNumber|pan)$/i.test(key) && typeof value === "string") {
      clean[key] = maskPan(value);
    } else {
      clean[key] = maskPanDeep(value);
    }
  }
  return clean;
}

/**
 * Normalizes inbound WBP reservation payloads into a clean canonical data structure.
 *
 * @param {object} rawPayload
 * @returns {object}
 */
export function normalizeOtaBooking(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Payload de reserva inválido ou ausente.");
  }

  // Deep strip CVV before anything else
  const sanitized = stripCvvDeep(rawPayload);

  const resObj = sanitized.reservation || sanitized.booking || sanitized.Booking || sanitized;

  const orderId = String(
    resObj.OrderId || resObj.orderId || resObj.booking_id || sanitized.booking_id || ""
  ).trim();

  const isCancellation = Boolean(
    Number(resObj.IsCancellation) === 1 || resObj.isCancellation === true || resObj.status === "cancelled"
  );
  const isModification = Boolean(
    Number(resObj.IsModification) === 1 || resObj.isModification === true || resObj.status === "modified"
  );

  const channelRaw = String(resObj.Channel || resObj.channel || sanitized.channel || "booking").toLowerCase();
  const channel = channelRaw.includes("airbnb") ? "airbnb" : "booking";

  // Customers extraction
  const customers = Array.isArray(resObj.Customers) ? resObj.Customers : [];
  const primaryCustomer = customers[0] || {};
  const firstName = primaryCustomer.CustomerFName || primaryCustomer.firstName || "";
  const lastName = primaryCustomer.CustomerLName || primaryCustomer.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim() || resObj.guestName || resObj.CustomerName || "Hóspede OTA";

  // Rooms extraction
  const rooms = Array.isArray(resObj.Rooms) ? resObj.Rooms : [];
  const primaryRoom = rooms[0] || {};

  const checkinDate = normalizeDateStr(
    primaryRoom.StartDate || resObj.StartDate || resObj.checkinDate || resObj.checkin || ""
  );

  // WBP Resolution: EndDate is inclusive ("last night of stay"). Checkout is EndDate + 1 day.
  const rawEndDate = primaryRoom.EndDate || resObj.EndDate || resObj.checkoutDate || resObj.checkout || "";
  let checkoutDate = "";

  const dayRates = Array.isArray(primaryRoom.DayRates) ? primaryRoom.DayRates : (Array.isArray(resObj.DayRates) ? resObj.DayRates : []);
  if (dayRates.length > 0) {
    const lastRateDate = normalizeDateStr(dayRates[dayRates.length - 1].Date || dayRates[dayRates.length - 1].date);
    checkoutDate = addDays(lastRateDate, 1);
  } else if (rawEndDate) {
    checkoutDate = addDays(normalizeDateStr(rawEndDate), 1);
  }

  const nights = checkinDate && checkoutDate ? getNightsBetween(checkinDate, checkoutDate).length : 1;

  // Rate Plan & Breakfast
  const rateId = String(primaryRoom.RateId || resObj.RateId || primaryRoom.rateId || resObj.rateId || "sem_cafe").toLowerCase();
  const includeBreakfast = rateId.includes("com_cafe") || rateId.includes("cafe") || Boolean(resObj.breakfastIncluded);
  const ratePlanId = includeBreakfast ? "com_cafe" : "sem_cafe";

  // Payment Collect: "Channel" | "Property"
  const rawPaymentCollect = resObj.PaymentCollect || resObj.paymentCollect || sanitized.paymentCollect || "Channel";
  const paymentCollect = String(rawPaymentCollect).toLowerCase().includes("property") ? "Property" : "Channel";

  // Pricing
  const totalPrice = Number(resObj.TotalPrice || resObj.totalPrice || resObj.totalAmount || 0);
  const currency = resObj.TotalCurrency || resObj.currency || "BRL";

  // Commission & Net Amount
  // Booking.com default commission ~15%, Airbnb ~15%
  const defaultCommissionRate = 0.15;
  const commissionAmount = Number(resObj.CommissionAmount || totalPrice * defaultCommissionRate);
  const netAmount = Number((totalPrice - commissionAmount).toFixed(2));

  // Card details extraction
  const cards = Array.isArray(resObj.Cards) ? resObj.Cards : (Array.isArray(resObj.Payments) ? resObj.Payments : []);
  const rawCard = cards[0] || (resObj.cardNumber || resObj.pan || resObj.CardNumber ? resObj : {});
  const pan = String(rawCard.CardNumber || rawCard.cardNumber || rawCard.pan || "").replace(/\s/g, "");
  const cardLast4 = pan ? pan.slice(-4) : (rawCard.cardLast4 || "");
  const cardBrand = pan ? detectCardBrand(pan) : (rawCard.cardBrand || "");
  const cardExpMonth = String(rawCard.CardExpireMonth || rawCard.expMonth || rawCard.expireMonth || "").trim();
  const cardExpYear = String(rawCard.CardExpireYear || rawCard.expYear || rawCard.expireYear || "").trim();

  // Feature 25: Store card in encrypted vault BEFORE masking PAN
  if (pan && pan.length >= 12 && !pan.includes("*") && !pan.includes("•")) {
    try {
      const vault = getCardVault();
      vault.storeCard({
        orderId,
        cardData: {
          cardNumber: pan,
          holderName: rawCard.CardHolderName || rawCard.holderName || fullName,
          expireMonth: cardExpMonth,
          expireYear: cardExpYear,
          brand: cardBrand
        },
        checkoutDate
      });
    } catch (_) {}
  }

  // Mandatory R6: Deep mask any full PAN in the payload AFTER extracting cardLast4 & brand
  const maskedPayload = maskPanDeep(sanitized);

  return {
    rawPayload: maskedPayload,
    externalOrderId: orderId,
    wbpBookingId: orderId,
    orderDate: resObj.OrderDate || new Date().toISOString(),
    isCancellation,
    isModification,
    channel,
    guest: {
      name: fullName,
      firstName,
      lastName,
      email: primaryCustomer.CustomerEmail || primaryCustomer.email || resObj.email || "",
      phone: primaryCustomer.CustomerTelephone || primaryCustomer.phone || resObj.phone || "",
      country: primaryCustomer.CustomerCountry || primaryCustomer.country || "BR"
    },
    guestName: fullName,
    guestEmail: primaryCustomer.CustomerEmail || primaryCustomer.email || resObj.email || "",
    guestPhone: primaryCustomer.CustomerTelephone || primaryCustomer.phone || resObj.phone || "",
    guestCountry: primaryCustomer.CustomerCountry || primaryCustomer.country || "BR",
    checkinDate,
    checkoutDate,
    nights,
    adults: Number(primaryRoom.Adults || resObj.adults || 1),
    children: Number(primaryRoom.Children || resObj.children || 0),
    ratePlanId,
    includeBreakfast,
    paymentCollect,
    totalPrice,
    currency,
    netAmount,
    commissionAmount,
    hasCard: Boolean(pan || cardLast4),
    cardLast4,
    cardBrand,
    cardExpMonth: rawCard.CardExpireMonth || rawCard.expMonth || "",
    cardExpYear: rawCard.CardExpireYear || rawCard.expYear || "",
    dayRates
  };
}

/**
 * Calculates turnover, wear-and-tear, and rest metrics for all 19 Soho flats.
 *
 * @param {object} db
 * @returns {Record<string, { flatId: number, flatNumber: string, checkoutCount: number, occupiedNights: number, lastCheckoutDate: string }>}
 */
export function calculateFairShareStats(db) {
  const flats = getCanonicalFlats(db);
  const stats = {};

  for (const f of flats) {
    const fn = String(f.number);
    stats[fn] = {
      flatId: f.id,
      flatNumber: fn,
      checkoutCount: 0,
      occupiedNights: 0,
      lastCheckoutDate: "1970-01-01"
    };
  }

  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  for (const r of reservations) {
    if (r.status === "cancelada" || r.status === "cancelled") continue;
    const fn = String(r.flatNumber || "");
    if (stats[fn]) {
      stats[fn].checkoutCount += 1;
      const stayNights = r.checkinDate && r.checkoutDate ? getNightsBetween(r.checkinDate, r.checkoutDate).length : 1;
      stats[fn].occupiedNights += stayNights;
      const out = normalizeDateStr(r.checkoutDate);
      if (out > stats[fn].lastCheckoutDate) {
        stats[fn].lastCheckoutDate = out;
      }
    }
  }

  return stats;
}

/**
 * Allocates optimal flat across 19 Soho flats using Canonical Availability and Fair-Share Ranking.
 *
 * @param {string} checkinDate - YYYY-MM-DD
 * @param {string} checkoutDate - YYYY-MM-DD
 * @param {object} [options]
 * @param {object} [options.db]
 * @param {string|number} [options.excludeReservationId]
 * @returns {{
 *   allocated: boolean,
 *   flat: { id: number, number: string, colName?: string } | null,
 *   availableCount: number,
 *   reason?: string
 * }}
 */
export function allocateFairShareFlat(checkinDate, checkoutDate, options = {}) {
  const db = options.db || (typeof global !== "undefined" && global.db ? global.db : {});
  const flats = getCanonicalFlats(db);
  const nights = getNightsBetween(checkinDate, checkoutDate);

  if (nights.length === 0) {
    return { allocated: false, flat: null, availableCount: 0, reason: "INVALID_DATES" };
  }

  // 1. Filter candidates where checkFlatBlockedOnNight returns false for every single night of stay
  const candidateFlats = [];
  const blockedByFlat = [];
  for (const flat of flats) {
    let unblocked = true;
    let firstBlock = null;
    for (const night of nights) {
      const check = checkFlatBlockedOnNight(flat, night, db, {
        excludeReservationId: options.excludeReservationId
      });
      if (check.isBlocked) {
        unblocked = false;
        firstBlock = check;
        break;
      }
    }
    if (unblocked) {
      candidateFlats.push(flat);
    } else {
      blockedByFlat.push({ flat, block: firstBlock });
    }
  }

  // Zero available -> check whether capacity was lost to maintenance or general overbooking
  if (candidateFlats.length === 0) {
    const maintenanceBlock = blockedByFlat.find(b =>
      b.block && (
        b.block.reason === "flat_maintenance" ||
        b.block.reason === "room_block" ||
        b.block.reason === "service_order"
      )
    );

    return {
      allocated: false,
      flat: null,
      availableCount: 0,
      reason: maintenanceBlock ? "MAINTENANCE_BLOCKED" : "OVERBOOKING",
      blockedDetails: maintenanceBlock ? maintenanceBlock.block.details : null
    };
  }

  // 2. Multi-criterion Fair-Share Sorting
  const stats = calculateFairShareStats(db);

  candidateFlats.sort((a, b) => {
    const sA = stats[String(a.number)] || { checkoutCount: 0, occupiedNights: 0, lastCheckoutDate: "1970-01-01" };
    const sB = stats[String(b.number)] || { checkoutCount: 0, occupiedNights: 0, lastCheckoutDate: "1970-01-01" };

    // Primary: Ascending checkout count (least cleanings)
    if (sA.checkoutCount !== sB.checkoutCount) {
      return sA.checkoutCount - sB.checkoutCount;
    }
    // Secondary: Ascending occupied nights (least runtime wear)
    if (sA.occupiedNights !== sB.occupiedNights) {
      return sA.occupiedNights - sB.occupiedNights;
    }
    // Tertiary: Ascending last checkout date (longest resting period)
    if (sA.lastCheckoutDate !== sB.lastCheckoutDate) {
      return sA.lastCheckoutDate.localeCompare(sB.lastCheckoutDate);
    }
    // Deterministic tie-breaker by id
    return a.id - b.id;
  });

  const selected = candidateFlats[0];
  return {
    allocated: true,
    flat: selected,
    availableCount: candidateFlats.length
  };
}

/**
 * Routes an unaccommodated, conflicting, or ambiguous OTA booking to db.wbpQuarantine.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {object} params.booking - Normalized booking
 * @param {string} params.reason - One of 7 trigger codes
 * @param {object} [params.reasonDetails]
 * @param {object} [params.alertsManager]
 * @returns {object} quarantineRecord
 */
export function routeToQuarantine({ db, booking, reason, reasonDetails = {}, alertsManager = null }) {
  if (!db) throw new Error("Database state required for quarantine routing.");
  if (!Array.isArray(db.wbpQuarantine)) {
    db.wbpQuarantine = [];
  }

  const b = booking && typeof booking === "object" ? booking : { rawPayload: booking };
  const quarantineId = `quar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const record = {
    id: quarantineId,
    bookingId: b.externalOrderId || b.wbpBookingId || "N/A",
    externalOrderId: b.externalOrderId || "N/A",
    rawPayloadId: b.rawPayloadId || null,
    source: b.source || "webhook",
    channel: b.channel || "booking",
    guestName: b.guestName || b.guest?.name || "Hóspede",
    guestEmail: b.guestEmail || b.guest?.email || "",
    guestPhone: b.guestPhone || b.guest?.phone || "",
    guestCountry: b.guestCountry || "BR",
    checkinDate: b.checkinDate,
    checkoutDate: b.checkoutDate,
    nights: b.nights,
    adults: b.adults || 1,
    children: b.children || 0,
    totalPrice: b.totalPrice || 0,
    currency: b.currency || "BRL",
    ratePlanId: b.ratePlanId || "sem_cafe",
    breakfastIncluded: Boolean(b.includeBreakfast),
    paymentCollect: b.paymentCollect || "Channel",
    isModification: Boolean(b.isModification),
    isCancellation: Boolean(b.isCancellation),
    reason, // OVERBOOKING | CONFLICT | MAINTENANCE_BLOCKED | CHECKED_IN_CANCELLATION | MODIFICATION_CONFLICT | AMBIGUOUS_MATCH | MALFORMED_PAYLOAD
    reasonDetails,
    cardReference: {
      maskedPan: b.cardLast4 ? `**** **** **** ${b.cardLast4}` : "",
      cardBrand: b.cardBrand || "",
      cardExpMonth: b.cardExpMonth || "",
      cardExpYear: b.cardExpYear || ""
    },
    status: "pending", // pending | resolved | rejected
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionAction: null,
    resolutionNotes: null,
    assignedFlatNumber: null,
    assignedFlatId: null,
    createdReservationId: null,
    createdReservationCode: null
  };

  db.wbpQuarantine.unshift(record);

  // Trigger immediate manager alert
  const mgr = alertsManager || getAlertsManager();
  if (mgr && typeof mgr.sendImmediateQuarantineAlert === "function") {
    try {
      mgr.sendImmediateQuarantineAlert(record, db);
    } catch (err) {
      console.warn("[Quarantine] Falha no disparo de alerta ao gestor:", err.message);
    }
  }

  return record;
}

/**
 * Handles OTA cancellation requests (IsCancellation === 1).
 * Enforces check-in safety guard to protect active in-house guests.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {object} params.normalized
 * @param {object} [params.alertsManager]
 * @returns {object}
 */
export function handleOtaCancellation({ db, normalized, alertsManager = null, vault = null }) {
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const existing = reservations.find(r =>
    (r.externalOrderId && String(r.externalOrderId) === String(normalized.externalOrderId)) ||
    (r.wbpBookingId && String(r.wbpBookingId) === String(normalized.externalOrderId)) ||
    (r.code && String(r.code) === String(normalized.externalOrderId))
  );

  if (!existing) {
    return routeToQuarantine({
      db,
      booking: normalized,
      reason: "CONFLICT",
      reasonDetails: { message: `Cancelamento recebido para reserva #${normalized.externalOrderId} não encontrada no PMS.` },
      alertsManager
    });
  }

  // Safety Guard: Block cancellation and route to Quarantine STRICTLY when check-in has actually been completed (R5)
  const isCheckedIn = existing.status === "checked_in" ||
    existing.status === "hospedado" ||
    existing.status === "checkin_realizado" ||
    existing.checkedIn === true ||
    Boolean(existing.checkedInAt);

  if (isCheckedIn) {
    // DO NOT auto-cancel! Route to quarantine with urgent alert.
    return routeToQuarantine({
      db,
      booking: normalized,
      reason: "CHECKED_IN_CANCELLATION",
      reasonDetails: {
        message: `Hóspede já realizou check-in (status=${existing.status}, checkedInAt=${existing.checkedInAt || "sim"}). Cancelamento bloqueado automaticamente.`,
        reservationId: existing.id,
        reservationCode: existing.code,
        flatNumber: existing.flatNumber
      },
      alertsManager
    });
  }

  // Safe to cancel automatically
  existing.status = "cancelada";
  existing.cancelledAt = new Date().toISOString();
  existing.cancelReason = "Cancelamento automático via OTA (WebBookingPro)";

  // Feature 26 (Rule 2): Auto-purge card immediately on cancellation without penalty
  try {
    const v = vault || getCardVault();
    v.purgeCard(existing.id, "cancelled_without_penalty", db);
    if (normalized.externalOrderId) {
      v.purgeCard(normalized.externalOrderId, "cancelled_without_penalty", db);
    }
    existing.vaultStatus = "purged";
  } catch (_) {}

  if (!Array.isArray(existing.auditLogs)) existing.auditLogs = [];
  existing.auditLogs.push({
    timestamp: new Date().toISOString(),
    action: "OTA_CANCELLATION_APPLIED",
    details: `Reserva cancelada via WebBookingPro. Flat ${existing.flatNumber} liberado.`
  });

  // Release flat in channel manager via debounced ARI incremental sync
  try {
    notifyPmsMutation(db, {
      type: "reservation_cancelled",
      checkinDate: existing.checkinDate,
      checkoutDate: existing.checkoutDate
    });
  } catch (_) {}

  return {
    success: true,
    action: "cancelled",
    reservationId: existing.id,
    code: existing.code
  };
}

/**
 * Handles OTA modification requests (IsModification === 1).
 * Evaluates 3-tier reallocation logic: same flat -> alternate flat -> quarantine on conflict.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {object} params.normalized
 * @param {object} [params.alertsManager]
 * @returns {object}
 */
export function handleOtaModification({ db, normalized, alertsManager = null }) {
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const existing = reservations.find(r =>
    (r.externalOrderId && String(r.externalOrderId) === String(normalized.externalOrderId)) ||
    (r.wbpBookingId && String(r.wbpBookingId) === String(normalized.externalOrderId))
  );

  if (!existing) {
    return routeToQuarantine({
      db,
      booking: normalized,
      reason: "CONFLICT",
      reasonDetails: { message: `Modificação recebida para reserva #${normalized.externalOrderId} não encontrada no PMS.` },
      alertsManager
    });
  }

  const oldCheckin = existing.checkinDate;
  const oldCheckout = existing.checkoutDate;
  const newCheckin = normalized.checkinDate;
  const newCheckout = normalized.checkoutDate;

  // Mandatory Directive 4 / R5: Capture structured before state
  const before = {
    flatId: existing.flatId,
    flatNumber: existing.flatNumber,
    checkinDate: existing.checkinDate,
    checkoutDate: existing.checkoutDate,
    totalAmount: existing.totalAmount,
    breakfastIncluded: existing.breakfastIncluded,
    guestCount: existing.guestCount
  };

  // Case A: Is the current flat available for the new dates?
  const nights = getNightsBetween(newCheckin, newCheckout);
  let sameFlatFree = true;
  const currentFlatRef = { id: existing.flatId, number: existing.flatNumber };
  for (const night of nights) {
    const check = checkFlatBlockedOnNight(currentFlatRef, night, db, {
      excludeReservationId: existing.id
    });
    if (check.isBlocked) {
      sameFlatFree = false;
      break;
    }
  }

  if (sameFlatFree) {
    // Keep on same flat
    existing.checkinDate = newCheckin;
    existing.checkoutDate = newCheckout;
    existing.totalAmount = normalized.totalPrice;
    existing.breakfastIncluded = normalized.includeBreakfast;
    existing.guestCount = normalized.adults + normalized.children;

    const after = {
      flatId: existing.flatId,
      flatNumber: existing.flatNumber,
      checkinDate: existing.checkinDate,
      checkoutDate: existing.checkoutDate,
      totalAmount: existing.totalAmount,
      breakfastIncluded: existing.breakfastIncluded,
      guestCount: existing.guestCount
    };

    if (!Array.isArray(existing.auditLogs)) existing.auditLogs = [];
    existing.auditLogs.push({
      timestamp: new Date().toISOString(),
      action: "OTA_MODIFICATION_APPLIED_SAME_FLAT",
      details: `Modificação aplicada no mesmo Flat ${existing.flatNumber} (${oldCheckin}/${oldCheckout} -> ${newCheckin}/${newCheckout}).`,
      before,
      after
    });

    if (!Array.isArray(existing.modificationHistory)) existing.modificationHistory = [];
    existing.modificationHistory.push({
      timestamp: new Date().toISOString(),
      source: "OTA_MODIFICATION",
      before,
      after
    });
    existing.history = existing.modificationHistory;

    // Notify ARI refresh for union interval
    const minDate = oldCheckin < newCheckin ? oldCheckin : newCheckin;
    const maxDate = oldCheckout > newCheckout ? oldCheckout : newCheckout;
    try {
      notifyPmsMutation(db, {
        type: "reservation_modified",
        checkinDate: minDate,
        checkoutDate: maxDate
      });
    } catch (_) {}

    return {
      success: true,
      action: "modified_same_flat",
      reservationId: existing.id,
      flatNumber: existing.flatNumber,
      before,
      after
    };
  }

  // Case B: Try alternate flat via Fair-Share
  const alloc = allocateFairShareFlat(newCheckin, newCheckout, {
    db,
    excludeReservationId: existing.id
  });

  if (alloc.allocated && alloc.flat) {
    const prevFlat = existing.flatNumber;
    existing.flatId = alloc.flat.id;
    existing.flatNumber = String(alloc.flat.number);
    existing.checkinDate = newCheckin;
    existing.checkoutDate = newCheckout;
    existing.totalAmount = normalized.totalPrice;
    existing.breakfastIncluded = normalized.includeBreakfast;
    existing.guestCount = normalized.adults + normalized.children;

    const after = {
      flatId: existing.flatId,
      flatNumber: existing.flatNumber,
      checkinDate: existing.checkinDate,
      checkoutDate: existing.checkoutDate,
      totalAmount: existing.totalAmount,
      breakfastIncluded: existing.breakfastIncluded,
      guestCount: existing.guestCount
    };

    if (!Array.isArray(existing.auditLogs)) existing.auditLogs = [];
    existing.auditLogs.push({
      timestamp: new Date().toISOString(),
      action: "OTA_MODIFICATION_REALLOCATED",
      details: `Modificação realocada do Flat ${prevFlat} para Flat ${existing.flatNumber} devido a conflito de datas.`,
      before,
      after
    });

    if (!Array.isArray(existing.modificationHistory)) existing.modificationHistory = [];
    existing.modificationHistory.push({
      timestamp: new Date().toISOString(),
      source: "OTA_MODIFICATION",
      before,
      after
    });
    existing.history = existing.modificationHistory;

    const minDate = oldCheckin < newCheckin ? oldCheckin : newCheckin;
    const maxDate = oldCheckout > newCheckout ? oldCheckout : newCheckout;
    try {
      notifyPmsMutation(db, {
        type: "reservation_modified",
        checkinDate: minDate,
        checkoutDate: maxDate
      });
    } catch (_) {}

    return {
      success: true,
      action: "modified_reallocated",
      reservationId: existing.id,
      oldFlatNumber: prevFlat,
      newFlatNumber: existing.flatNumber,
      before,
      after
    };
  }

  // Case C: Conflict / Overbooking -> Quarantine
  return routeToQuarantine({
    db,
    booking: normalized,
    reason: "MODIFICATION_CONFLICT",
    reasonDetails: {
      message: `Modificação não pode ser acomodada: Flat atual ${existing.flatNumber} ocupado e nenhum dos demais 18 flats está disponível para ${newCheckin} a ${newCheckout}.`,
      existingReservationId: existing.id,
      existingReservationCode: existing.code
    },
    alertsManager
  });
}

/**
 * Master Ingestion Coordinator: Processes incoming OTA bookings from both webhooks and background polling.
 *
 * @param {object} rawPayload
 * @param {object} [options]
 * @param {object} [options.db]
 * @param {object} [options.storage]
 * @param {object} [options.alertsManager]
 * @returns {Promise<object>}
 */
export async function processIncomingOTA(rawPayload, options = {}) {
  const db = options.db || (typeof global !== "undefined" && global.db ? global.db : {});
  const alertsManager = options.alertsManager || getAlertsManager();
  const mode = getIntegrationMode(db);

  if (mode === WBP_MODES.OFF) {
    return { success: false, skipped: true, reason: "integration_off" };
  }

  // 1. Normalization & Card Hygiene
  let normalized;
  try {
    normalized = normalizeOtaBooking(rawPayload);
  } catch (err) {
    return routeToQuarantine({
      db,
      booking: typeof rawPayload === "object" && rawPayload !== null ? rawPayload : { rawPayload },
      reason: "MALFORMED_PAYLOAD",
      reasonDetails: {
        message: `Payload malformado ou corrompido: ${err.message}`,
        error: err.message
      },
      alertsManager
    });
  }

  // Validate critical stay dates on non-cancellation bookings
  if (!normalized.isCancellation) {
    if (!normalized.checkinDate || !normalized.checkoutDate || normalized.checkinDate >= normalized.checkoutDate) {
      return routeToQuarantine({
        db,
        booking: normalized,
        reason: "MALFORMED_PAYLOAD",
        reasonDetails: {
          message: `Datas de estadia ausentes ou inválidas: checkin=${normalized.checkinDate}, checkout=${normalized.checkoutDate}`,
          checkinDate: normalized.checkinDate,
          checkoutDate: normalized.checkoutDate
        },
        alertsManager
      });
    }
  }

  // 2. Mutations: Check Cancellation
  if (normalized.isCancellation) {
    return handleOtaCancellation({ db, normalized, alertsManager });
  }

  // 3. Mutations: Check Modification
  if (normalized.isModification) {
    return handleOtaModification({ db, normalized, alertsManager });
  }

  // 4. Check if this electronic reservation is ALREADY imported
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];
  const existingElectronic = reservations.find(r =>
    (r.externalOrderId && String(r.externalOrderId) === String(normalized.externalOrderId)) ||
    (r.wbpBookingId && String(r.wbpBookingId) === String(normalized.externalOrderId))
  );

  if (existingElectronic) {
    return {
      success: true,
      action: "already_imported",
      reservationId: existingElectronic.id,
      code: existingElectronic.code
    };
  }

  // 5. Safe Transition & Reconciliation with Manual PMS Reservations (Directive 4 / R5)
  const manualMatch = findBestManualMatch(db, normalized);
  if (manualMatch) {
    const { bestMatch, scoreResult } = manualMatch;
    if (scoreResult.isSafeMatch) {
      // Safe Match: LINK external identifiers without duplicating or altering flat/price!
      applySafeReconciliationLink(bestMatch, normalized, { db });
      return {
        success: true,
        action: "reconciled_linked",
        reservationId: bestMatch.id,
        code: bestMatch.code,
        matchScore: scoreResult.score
      };
    } else if (scoreResult.isAmbiguous) {
      // Ambiguous Match: Route to Quarantine
      return routeToQuarantine({
        db,
        booking: normalized,
        reason: "AMBIGUOUS_MATCH",
        reasonDetails: {
          message: `Reserva da OTA assemelha-se à reserva manual #${bestMatch.code} (${bestMatch.guestName}), mas com divergências (${scoreResult.discrepancies.join("; ")}).`,
          potentialMatchId: bestMatch.id,
          potentialMatchCode: bestMatch.code,
          score: scoreResult.score
        },
        alertsManager
      });
    }
  }

  // 6. Fair-Share Flat Allocation
  const alloc = allocateFairShareFlat(normalized.checkinDate, normalized.checkoutDate, { db });
  if (!alloc.allocated || !alloc.flat) {
    if (alloc.reason === "INVALID_DATES") {
      return routeToQuarantine({
        db,
        booking: normalized,
        reason: "MALFORMED_PAYLOAD",
        reasonDetails: {
          message: `Datas de estadia inválidas para alocação: checkin=${normalized.checkinDate}, checkout=${normalized.checkoutDate}`,
          checkinDate: normalized.checkinDate,
          checkoutDate: normalized.checkoutDate
        },
        alertsManager
      });
    }

    if (alloc.reason === "MAINTENANCE_BLOCKED") {
      return routeToQuarantine({
        db,
        booking: normalized,
        reason: "MAINTENANCE_BLOCKED",
        reasonDetails: {
          message: `Nenhum flat disponível devido a bloqueio de manutenção no período (${normalized.checkinDate} a ${normalized.checkoutDate}).`,
          details: alloc.blockedDetails,
          availableCount: 0
        },
        alertsManager
      });
    }

    return routeToQuarantine({
      db,
      booking: normalized,
      reason: "OVERBOOKING",
      reasonDetails: {
        message: `Nenhum flat disponível para o período solicitado (${normalized.checkinDate} a ${normalized.checkoutDate}).`,
        availableCount: 0
      },
      alertsManager
    });
  }

  const assignedFlat = alloc.flat;
  const flatNumber = String(assignedFlat.number);

  // 7. Mode OBSERVE: Record intent in db.wbpInbox without creating active reservation and without automations
  if (mode === WBP_MODES.OBSERVE) {
    if (!Array.isArray(db.wbpInbox)) db.wbpInbox = [];
    const intentRecord = {
      id: `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      mode: "observe",
      receivedAt: new Date().toISOString(),
      normalized,
      simulatedFlat: assignedFlat,
      status: "observed_only"
    };
    db.wbpInbox.unshift(intentRecord);
    return {
      success: true,
      action: "observed_only",
      inboxId: intentRecord.id,
      simulatedFlat: flatNumber
    };
  }

  // 8. Mode AUTO: Create genuine reservation in db.reservations
  // Payment status & PaymentCollect semantics (Directive 2 / R5):
  // - Channel: pago_total, paidAmount = total, netAmount = total - commission
  // - Property: pendente, paidAmount = 0, collectAtCheckin = true, front desk alert
  const isPropertyCollect = normalized.paymentCollect === "Property";
  const paymentStatus = isPropertyCollect ? "pendente" : "pago_total";
  const paidAmount = isPropertyCollect ? 0 : normalized.totalPrice;

  // Generate unique reservation ID and code
  const nextId = reservations.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const code = `RES-${flatNumber}-${randSuffix}`;

  const newReservation = {
    id: nextId,
    code,
    flatId: assignedFlat.id,
    flatNumber,
    guestName: normalized.guestName,
    guestEmail: normalized.guestEmail,
    guestPhone: normalized.guestPhone,
    checkinDate: normalized.checkinDate,
    checkoutDate: normalized.checkoutDate,
    guestCount: normalized.adults + normalized.children,
    adults: normalized.adults,
    children: normalized.children,
    totalAmount: normalized.totalPrice,
    dailyRate: normalized.nights > 0 ? Number((normalized.totalPrice / normalized.nights).toFixed(2)) : normalized.totalPrice,
    paidAmount,
    netAmount: normalized.netAmount,
    commissionAmount: normalized.commissionAmount,
    cardLast4: normalized.cardLast4,
    cardBrand: normalized.cardBrand,
    cardExpMonth: normalized.cardExpMonth,
    cardExpYear: normalized.cardExpYear,
    hasCard: Boolean(normalized.hasCard),
    vaultStatus: normalized.hasCard ? "active" : undefined,
    paymentStatus,
    paymentMethod: normalized.channel,
    paymentCollect: normalized.paymentCollect,
    collectAtCheckin: isPropertyCollect,
    channel: normalized.channel,
    externalOrderId: normalized.externalOrderId,
    wbpBookingId: normalized.wbpBookingId,
    breakfastIncluded: normalized.includeBreakfast,
    ratePlanId: normalized.ratePlanId,
    status: "ativa",
    createdAt: new Date().toISOString(),
    // Strict PIX Suppression (Directive 1 / AGENTS.md):
    pixTxId: null,
    pixCopiaECola: null,
    wbpSynced: true,
    auditLogs: [
      {
        timestamp: new Date().toISOString(),
        action: "OTA_BOOKING_IMPORTED",
        details: `Reserva importada via WebBookingPro (${normalized.channel.toUpperCase()}). Flat ${flatNumber} alocado via Fair-Share. PaymentCollect=${normalized.paymentCollect}.`
      }
    ]
  };

  if (isPropertyCollect) {
    newReservation.receptionAlert = `COBRAR NO CHECK-IN: R$ ${normalized.totalPrice.toFixed(2)}`;
    // Dispatch reception warning
    if (alertsManager && typeof alertsManager.sendPropertyPaymentAlert === "function") {
      alertsManager.sendPropertyPaymentAlert(newReservation, db);
    }
  }

  // Persist reservation in PMS
  if (!Array.isArray(db.reservations)) db.reservations = [];
  db.reservations.push(newReservation);

  // Feature 25: Link vault record to reservation ID
  if (normalized.hasCard) {
    try {
      const vault = getCardVault();
      vault.linkReservation(normalized.externalOrderId, newReservation.id, normalized.checkoutDate);
    } catch (_) {}
  }

  // Record in OTA Inbox for visibility
  if (!Array.isArray(db.wbpInbox)) db.wbpInbox = [];
  db.wbpInbox.unshift({
    id: `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    mode: "auto",
    receivedAt: new Date().toISOString(),
    reservationId: newReservation.id,
    code: newReservation.code,
    normalized,
    assignedFlatNumber: flatNumber,
    status: "created"
  });

  // 9. Automations in AUTO mode (Housekeeping task, Reception notification, WhatsApp Welcome without PIX, SERPRO/FNRH)
  try {
    // A. Housekeeping task
    if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
    db.cleaningRequests.push({
      id: `clean_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      flatId: assignedFlat.id,
      flatNumber,
      scheduledDate: normalized.checkinDate,
      type: "checkin_preparacao",
      status: "pendente",
      notes: `Preparação para check-in OTA (${normalized.guestName}, ${normalized.adults} adultos, café: ${normalized.includeBreakfast ? "Sim" : "Não"})`
    });

    // B. Reception / Front-desk email (regardless of checkinDate === todayStr)
    if (alertsManager && typeof alertsManager.sendEmail === "function") {
      const receptionEmail = db.settings?.receptionEmail || "soho@promenade.com.br";
      const emailSubject = `[RESERVA OTA] Flat ${flatNumber} - ${normalized.guestName} (${normalized.channel.toUpperCase()})`;
      const emailBody = `Nova reserva OTA importada com sucesso:
- Hóspede: ${normalized.guestName}
- Canal: ${normalized.channel.toUpperCase()}
- Flat Alocado: ${flatNumber}
- Período: ${normalized.checkinDate} a ${normalized.checkoutDate} (${normalized.nights} noites)
- Pagamento: ${normalized.paymentCollect === "Property" ? "COBRAR NO CHECK-IN (R$ " + normalized.totalPrice.toFixed(2) + ")" : "PAGO NO CANAL (R$ " + normalized.totalPrice.toFixed(2) + ")"}
- Café da Manhã: ${normalized.includeBreakfast ? "Incluso" : "Sem café"}`;
      alertsManager.sendEmail(receptionEmail, emailSubject, emailBody);
    }

    // C. Welcome WhatsApp via alertsManager.sendWhatsApp(normalized.guestPhone) WITHOUT PIX
    if (normalized.guestPhone && alertsManager && typeof alertsManager.sendWhatsApp === "function") {
      const welcomeMsg = `Olá, ${normalized.guestName}! Confirmamos sua reserva no Flat ${flatNumber} (Soho Residence) para o período de ${normalized.checkinDate} a ${normalized.checkoutDate}. Caso precise de alguma informação adicional, estamos à disposição!`;
      alertsManager.sendWhatsApp(normalized.guestPhone, welcomeMsg);
    }

    // D. SERPRO / FNRH queue record (keeping pixTxId: null and pixCopiaECola: null)
    if (!Array.isArray(db.serproQueue)) db.serproQueue = [];
    db.serproQueue.push({
      id: `serpro_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      reservationId: newReservation.id,
      reservationCode: newReservation.code,
      guestName: normalized.guestName,
      guestEmail: normalized.guestEmail,
      guestPhone: normalized.guestPhone,
      guestCountry: normalized.guestCountry || "BR",
      checkinDate: normalized.checkinDate,
      checkoutDate: normalized.checkoutDate,
      flatNumber,
      status: "queued",
      createdAt: new Date().toISOString()
    });
    newReservation.fnrhStatus = "enviado";
  } catch (err) {
    console.warn("[Automations] Falha ao disparar tarefas secundárias:", err.message);
  }

  // 10. Trigger debounced ARI Refresh for the affected stay window
  try {
    notifyPmsMutation(db, {
      type: "reservation_created",
      checkinDate: newReservation.checkinDate,
      checkoutDate: newReservation.checkoutDate
    });
  } catch (_) {}

  return {
    success: true,
    action: "created",
    reservationId: newReservation.id,
    code: newReservation.code,
    flatNumber
  };
}
