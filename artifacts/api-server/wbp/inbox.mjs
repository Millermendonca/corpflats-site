/**
 * artifacts/api-server/wbp/inbox.mjs
 *
 * Milestone 4: OTA Inbox, Fair-Share Flat Allocation, Quarantine & Mutations (Channex.io v1 + WBP).
 * Features 19, 20, 21, 23.
 *
 * Responsibilities:
 * - Feature 19: Payload normalization (Channex booking_revision & WBP), Fair-Share allocation across 19 Soho flats,
 *   multi-room Channex booking allocation, Virtual Card metadata extraction, and strict PaymentCollect handling.
 * - Feature 20: Quarantine Management Engine (including UNMAPPED_ROOM_OR_RATE for Channex Test #10).
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
import { isWbpAutoMode, isWbpEnabled, WBP_MODES, getIntegrationMode, getChannexConfig } from "./config.mjs";
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
      continue;
    }
    clean[key] = stripCvvDeep(value);
  }
  return clean;
}

/**
 * Detects card brand from PAN digits or Channex card_type code.
 * @param {string} panOrType
 * @returns {string}
 */
export function detectCardBrand(panOrType) {
  if (!panOrType) return "Desconhecida";
  const upper = String(panOrType).trim().toUpperCase();
  if (upper === "VI" || upper === "VISA") return "Visa";
  if (upper === "MC" || upper === "MASTERCARD") return "Mastercard";
  if (upper === "AX" || upper === "AMEX") return "Amex";
  if (upper === "DS" || upper === "DISCOVER") return "Discover";
  if (upper === "JC" || upper === "JCB") return "JCB";
  if (upper === "DN" || upper === "DINERS") return "Diners";
  if (upper === "ELO") return "Elo";

  const clean = String(panOrType).replace(/\D/g, "");
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
 * Checks whether a raw payload is a Channex v1 booking_revision or booking object.
 * @param {object} rawPayload
 * @returns {boolean}
 */
export function isChannexPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return false;
  const candidate = rawPayload.data || rawPayload;
  const attrs = candidate.attributes || candidate;
  return Boolean(
    candidate.type === "booking_revision" ||
    candidate.type === "booking" ||
    attrs.ota_reservation_code ||
    attrs.ota_name ||
    (attrs.arrival_date && attrs.departure_date && Array.isArray(attrs.rooms))
  );
}

/**
 * Normalizes a Channex.io v1 `booking_revision` or `booking` payload into the canonical Guest-Flow-Manager format.
 *
 * @param {object} rawPayload
 * @param {object} [db]
 * @returns {object}
 */
export function normalizeChannexBookingRevision(rawPayload, db = null) {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Payload Channex inválido ou ausente.");
  }

  const sanitized = stripCvvDeep(rawPayload);
  const resource = sanitized.data || sanitized;
  const attrs = resource.attributes || resource;

  const revisionId = String(resource.id || attrs.id || attrs.revision_id || "").trim();
  const bookingId = String(attrs.booking_id || resource.booking_id || revisionId || "").trim();
  const uniqueId = String(attrs.unique_id || attrs.ota_reservation_code || bookingId || "").trim();
  const orderId = String(attrs.ota_reservation_code || uniqueId || bookingId || "").trim();

  const statusRaw = String(attrs.status || "new").toLowerCase();
  const isCancellation = statusRaw === "cancelled" || statusRaw === "canceled";
  const isModification = statusRaw === "modified";

  const otaNameRaw = String(attrs.ota_name || attrs.channel || "BookingCom").toLowerCase();
  let channel = "booking";
  if (otaNameRaw.includes("airbnb")) channel = "airbnb";
  else if (otaNameRaw.includes("expedia")) channel = "expedia";

  const customer = attrs.customer || {};
  const firstName = customer.name || customer.first_name || "";
  const lastName = customer.surname || customer.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || "Hóspede Channex";

  const rooms = Array.isArray(attrs.rooms) ? attrs.rooms : [];
  const primaryRoom = rooms[0] || {};

  const checkinDate = normalizeDateStr(primaryRoom.checkin_date || attrs.arrival_date || "");
  // In Channex v1, departure_date / checkout_date is ALREADY the morning of check-out!
  const checkoutDate = normalizeDateStr(primaryRoom.checkout_date || attrs.departure_date || "");
  const nights = checkinDate && checkoutDate ? getNightsBetween(checkinDate, checkoutDate).length : 1;

  // Detect unmapped room_type_id or rate_plan_id (Certification Test #10)
  const hasUnmappedRoomOrRate = rooms.length > 0 && rooms.some(
    (r) =>
      r.room_type_id === null ||
      r.rate_plan_id === null ||
      r.unmapped === true ||
      String(r.room_type_id || "").toLowerCase() === "unmapped" ||
      String(r.rate_plan_id || "").toLowerCase() === "unmapped"
  );

  const chxCfg = getChannexConfig(db);
  const rawRatePlanId = String(primaryRoom.rate_plan_id || "").toLowerCase();
  const services = [
    ...(Array.isArray(attrs.services) ? attrs.services : []),
    ...(Array.isArray(primaryRoom.services) ? primaryRoom.services : [])
  ];
  const hasBreakfastService = services.some((s) =>
    String(s?.name || s?.type || "").toLowerCase().includes("breakfast") ||
    String(s?.name || s?.type || "").toLowerCase().includes("café") ||
    String(s?.name || s?.type || "").toLowerCase().includes("cafe")
  );
  const includeBreakfast =
    (chxCfg.ratePlanComCafeId && primaryRoom.rate_plan_id === chxCfg.ratePlanComCafeId) ||
    rawRatePlanId.includes("com_cafe") ||
    rawRatePlanId.includes("com-cafe") ||
    hasBreakfastService;
  const ratePlanId = includeBreakfast ? "com_cafe" : "sem_cafe";

  // Payment Collect: "ota" -> "Channel", "property" -> "Property"
  const rawCollect = String(attrs.payment_collect || "ota").toLowerCase();
  const paymentCollect = rawCollect === "property" ? "Property" : "Channel";

  // Total price across all rooms in booking or attrs.amount
  const roomsSum = rooms.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalPrice = Number(attrs.amount || roomsSum || 0);
  const currency = attrs.currency || "BRL";
  const commissionAmount =
    attrs.ota_commission != null
      ? Number(attrs.ota_commission)
      : Number((totalPrice * 0.15).toFixed(2));
  const netAmount = Number((totalPrice - commissionAmount).toFixed(2));

  // Total adults & children across rooms (or primary room)
  const totalAdults =
    rooms.reduce((sum, r) => sum + Number(r.occupancy?.adults || 0), 0) ||
    Number(primaryRoom.occupancy?.adults || attrs.occupancy?.adults || 2);
  const totalChildren =
    rooms.reduce((sum, r) => sum + Number(r.occupancy?.children || 0), 0) ||
    Number(primaryRoom.occupancy?.children || attrs.occupancy?.children || 0);

  // Guarantee & Virtual Card extraction
  const guarantee = attrs.guarantee || {};
  const rawPan = String(guarantee.card_number || "").replace(/\s/g, "");
  const cleanDigits = rawPan.replace(/\D/g, "");
  const cardLast4 = cleanDigits.length >= 4 ? cleanDigits.slice(-4) : "";
  const cardBrand = detectCardBrand(guarantee.card_type || rawPan);
  const expParts = String(guarantee.expiration_date || "").split("/");
  const cardExpMonth = (expParts[0] || "").trim();
  const cardExpYear = (expParts[1] || "").trim();
  const isVirtualCard = Boolean(guarantee.is_virtual);
  const virtualCardMeta = guarantee.meta || null;

  if (rawPan && rawPan.length >= 12 && !rawPan.includes("*") && !rawPan.includes("•")) {
    try {
      const vault = getCardVault();
      vault.storeCard({
        orderId,
        cardData: {
          cardNumber: rawPan,
          holderName: guarantee.cardholder_name || fullName,
          expireMonth: cardExpMonth,
          expireYear: cardExpYear,
          brand: cardBrand
        },
        checkoutDate
      });
    } catch (_) {}
  }

  // Normalize dayRates from primaryRoom.days map { "YYYY-MM-DD": "280.00" }
  const daysObj = primaryRoom.days && typeof primaryRoom.days === "object" ? primaryRoom.days : {};
  const dayRates = Object.entries(daysObj).map(([date, price]) => ({
    Date: date,
    Rate: Number(price)
  }));

  // Normalize individual rooms for Multi-Room bookings (Certification Test #9)
  const channexRooms = rooms.map((r, idx) => {
    const rCheckin = normalizeDateStr(r.checkin_date || checkinDate);
    const rCheckout = normalizeDateStr(r.checkout_date || checkoutDate);
    const rNights = rCheckin && rCheckout ? getNightsBetween(rCheckin, rCheckout).length : nights;
    const rAmount = Number(r.amount || (rooms.length > 0 ? totalPrice / rooms.length : totalPrice));
    const rPlanRaw = String(r.rate_plan_id || "").toLowerCase();
    const rBreakfast =
      (chxCfg.ratePlanComCafeId && r.rate_plan_id === chxCfg.ratePlanComCafeId) ||
      rPlanRaw.includes("com_cafe") ||
      rPlanRaw.includes("com-cafe") ||
      includeBreakfast;
    return {
      index: idx,
      roomTypeId: r.room_type_id ?? null,
      ratePlanId: rBreakfast ? "com_cafe" : "sem_cafe",
      channexRatePlanId: r.rate_plan_id ?? null,
      includeBreakfast: rBreakfast,
      checkinDate: rCheckin,
      checkoutDate: rCheckout,
      nights: rNights,
      amount: rAmount,
      adults: Number(r.occupancy?.adults || 2),
      children: Number(r.occupancy?.children || 0),
      days: r.days || {}
    };
  });

  const maskedPayload = maskPanDeep(sanitized);

  return {
    provider: "channex",
    rawPayload: maskedPayload,
    externalOrderId: orderId,
    wbpBookingId: bookingId || orderId,
    channexBookingId: bookingId,
    channexRevisionId: revisionId,
    channexUniqueId: uniqueId,
    orderDate: attrs.inserted_at || new Date().toISOString(),
    isCancellation,
    isModification,
    hasUnmappedRoomOrRate,
    roomsCount: rooms.length || 1,
    channexRooms,
    channel,
    guest: {
      name: fullName,
      firstName,
      lastName,
      email: customer.mail || customer.email || "",
      phone: customer.phone || "",
      country: customer.country || "BR"
    },
    guestName: fullName,
    guestEmail: customer.mail || customer.email || "",
    guestPhone: customer.phone || "",
    guestCountry: customer.country || "BR",
    checkinDate,
    checkoutDate,
    nights,
    adults: totalAdults,
    children: totalChildren,
    ratePlanId,
    includeBreakfast,
    paymentCollect,
    paymentType: attrs.payment_type || "credit_card",
    totalPrice,
    currency,
    netAmount,
    commissionAmount,
    hasCard: Boolean(rawPan || cardLast4),
    cardLast4,
    cardBrand,
    cardExpMonth,
    cardExpYear,
    isVirtualCard,
    virtualCardMeta,
    notes: attrs.notes || "",
    dayRates
  };
}

/**
 * Normalizes inbound OTA reservation payloads (Channex v1 or WBP) into a clean canonical data structure.
 *
 * @param {object} rawPayload
 * @param {object} [db]
 * @returns {object}
 */
export function normalizeOtaBooking(rawPayload, db = null) {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Payload de reserva inválido ou ausente.");
  }

  if (isChannexPayload(rawPayload)) {
    return normalizeChannexBookingRevision(rawPayload, db);
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
  const cardExpYear = String(rawCard.CardExpireYear || rawCard.expireYear || rawCard.expYear || "").trim();

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
    provider: "wbp",
    rawPayload: maskedPayload,
    externalOrderId: orderId,
    wbpBookingId: orderId,
    orderDate: resObj.OrderDate || new Date().toISOString(),
    isCancellation,
    isModification,
    hasUnmappedRoomOrRate: false,
    roomsCount: 1,
    channexRooms: [],
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
    isVirtualCard: false,
    virtualCardMeta: null,
    dayRates
  };
}

/**
 * Calculates turnover, wear-and-tear, and rest metrics for all 19 Soho flats.
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
 */
export function allocateFairShareFlat(checkinDate, checkoutDate, options = {}) {
  const db = options.db || (typeof global !== "undefined" && global.db ? global.db : {});
  const flats = getCanonicalFlats(db);
  const nights = getNightsBetween(checkinDate, checkoutDate);
  const excludeFlatNumbers = new Set(
    Array.isArray(options.excludeFlatNumbers) ? options.excludeFlatNumbers.map(String) : []
  );

  if (nights.length === 0) {
    return { allocated: false, flat: null, availableCount: 0, reason: "INVALID_DATES" };
  }

  const candidateFlats = [];
  const blockedByFlat = [];
  for (const flat of flats) {
    if (excludeFlatNumbers.has(String(flat.number))) {
      continue;
    }
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

  if (candidateFlats.length === 0) {
    const maintenanceBlock = blockedByFlat.find((b) =>
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

  const stats = calculateFairShareStats(db);

  candidateFlats.sort((a, b) => {
    const sA = stats[String(a.number)] || { checkoutCount: 0, occupiedNights: 0, lastCheckoutDate: "1970-01-01" };
    const sB = stats[String(b.number)] || { checkoutCount: 0, occupiedNights: 0, lastCheckoutDate: "1970-01-01" };

    if (sA.checkoutCount !== sB.checkoutCount) {
      return sA.checkoutCount - sB.checkoutCount;
    }
    if (sA.occupiedNights !== sB.occupiedNights) {
      return sA.occupiedNights - sB.occupiedNights;
    }
    if (sA.lastCheckoutDate !== sB.lastCheckoutDate) {
      return sA.lastCheckoutDate.localeCompare(sB.lastCheckoutDate);
    }
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
    channexBookingId: b.channexBookingId || null,
    channexRevisionId: b.channexRevisionId || null,
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
    reason, // OVERBOOKING | CONFLICT | MAINTENANCE_BLOCKED | CHECKED_IN_CANCELLATION | MODIFICATION_CONFLICT | AMBIGUOUS_MATCH | MALFORMED_PAYLOAD | UNMAPPED_ROOM_OR_RATE
    reasonDetails,
    cardReference: {
      maskedPan: b.cardLast4 ? `**** **** **** ${b.cardLast4}` : "",
      cardBrand: b.cardBrand || "",
      cardExpMonth: b.cardExpMonth || "",
      cardExpYear: b.cardExpYear || "",
      isVirtualCard: Boolean(b.isVirtualCard),
      virtualCardMeta: b.virtualCardMeta || null
    },
    status: "pending",
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
 * Handles OTA cancellation requests.
 * Enforces check-in safety guard to protect active in-house guests.
 */
export function handleOtaCancellation({ db, normalized, alertsManager = null, vault = null }) {
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const matching = reservations.filter((r) =>
    (r.externalOrderId && String(r.externalOrderId) === String(normalized.externalOrderId)) ||
    (r.parentExternalOrderId && String(r.parentExternalOrderId) === String(normalized.externalOrderId)) ||
    (r.channexBookingId && normalized.channexBookingId && String(r.channexBookingId) === String(normalized.channexBookingId)) ||
    (r.wbpBookingId && String(r.wbpBookingId) === String(normalized.externalOrderId)) ||
    (r.code && String(r.code) === String(normalized.externalOrderId))
  );

  if (matching.length === 0) {
    return routeToQuarantine({
      db,
      booking: normalized,
      reason: "CONFLICT",
      reasonDetails: { message: `Cancelamento recebido para reserva #${normalized.externalOrderId} não encontrada no PMS.` },
      alertsManager
    });
  }

  const existing = matching[0];

  const isCheckedIn = matching.some((r) =>
    r.status === "checked_in" ||
    r.status === "hospedado" ||
    r.status === "checkin_realizado" ||
    r.checkedIn === true ||
    Boolean(r.checkedInAt)
  );

  if (isCheckedIn) {
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

  for (const resItem of matching) {
    resItem.status = "cancelada";
    resItem.cancelledAt = new Date().toISOString();
    resItem.cancelReason = `Cancelamento automático via OTA (${normalized.provider === "channex" ? "Channex.io" : "WebBookingPro"})`;

    try {
      const v = vault || getCardVault();
      v.purgeCard(resItem.id, "cancelled_without_penalty", db);
      if (normalized.externalOrderId) {
        v.purgeCard(normalized.externalOrderId, "cancelled_without_penalty", db);
      }
      resItem.vaultStatus = "purged";
    } catch (_) {}

    if (!Array.isArray(resItem.auditLogs)) resItem.auditLogs = [];
    resItem.auditLogs.push({
      timestamp: new Date().toISOString(),
      action: "OTA_CANCELLATION_APPLIED",
      details: `Reserva cancelada via OTA. Flat ${resItem.flatNumber} liberado.`
    });
  }

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
    code: existing.code,
    cancelledCount: matching.length
  };
}

/**
 * Handles OTA modification requests.
 * Evaluates 3-tier reallocation logic: same flat -> alternate flat -> quarantine on conflict.
 */
export function handleOtaModification({ db, normalized, alertsManager = null }) {
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const existing = reservations.find((r) =>
    (r.externalOrderId && String(r.externalOrderId) === String(normalized.externalOrderId)) ||
    (r.parentExternalOrderId && String(r.parentExternalOrderId) === String(normalized.externalOrderId)) ||
    (r.channexBookingId && normalized.channexBookingId && String(r.channexBookingId) === String(normalized.channexBookingId)) ||
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
    normalized = normalizeOtaBooking(rawPayload, db);
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

    // Channex Certification Test #10: Booking with Unmapped Room or Rate
    if (normalized.hasUnmappedRoomOrRate) {
      return routeToQuarantine({
        db,
        booking: normalized,
        reason: "UNMAPPED_ROOM_OR_RATE",
        reasonDetails: {
          message: `Reserva OTA #${normalized.externalOrderId} recebida com Room Type ou Rate Plan não mapeado (room_type_id/rate_plan_id nulo). Alocação manual necessária.`
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
  const existingElectronic = reservations.find((r) =>
    (r.externalOrderId && String(r.externalOrderId) === String(normalized.externalOrderId)) ||
    (r.parentExternalOrderId && String(r.parentExternalOrderId) === String(normalized.externalOrderId)) ||
    (r.channexBookingId && normalized.channexBookingId && String(r.channexBookingId) === String(normalized.channexBookingId)) ||
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
      applySafeReconciliationLink(bestMatch, normalized, { db });
      return {
        success: true,
        action: "reconciled_linked",
        reservationId: bestMatch.id,
        code: bestMatch.code,
        matchScore: scoreResult.score
      };
    } else if (scoreResult.isAmbiguous) {
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

  // 6. Fair-Share Flat Allocation (supports single-room and multi-room Channex bookings)
  const roomsToAllocate =
    Array.isArray(normalized.channexRooms) && normalized.channexRooms.length > 1
      ? normalized.channexRooms
      : [
          {
            index: 0,
            checkinDate: normalized.checkinDate,
            checkoutDate: normalized.checkoutDate,
            nights: normalized.nights,
            amount: normalized.totalPrice,
            adults: normalized.adults,
            children: normalized.children,
            ratePlanId: normalized.ratePlanId,
            includeBreakfast: normalized.includeBreakfast
          }
        ];

  const allocatedFlats = [];
  const usedFlatNumbers = [];

  for (const roomSpec of roomsToAllocate) {
    const alloc = allocateFairShareFlat(roomSpec.checkinDate, roomSpec.checkoutDate, {
      db,
      excludeFlatNumbers: usedFlatNumbers
    });

    if (!alloc.allocated || !alloc.flat) {
      if (alloc.reason === "INVALID_DATES") {
        return routeToQuarantine({
          db,
          booking: normalized,
          reason: "MALFORMED_PAYLOAD",
          reasonDetails: {
            message: `Datas de estadia inválidas para alocação: checkin=${roomSpec.checkinDate}, checkout=${roomSpec.checkoutDate}`,
            checkinDate: roomSpec.checkinDate,
            checkoutDate: roomSpec.checkoutDate
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
            message: `Nenhum flat disponível devido a bloqueio de manutenção no período (${roomSpec.checkinDate} a ${roomSpec.checkoutDate}).`,
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
          message: `Nenhum flat disponível para o período solicitado (${roomSpec.checkinDate} a ${roomSpec.checkoutDate}).`,
          availableCount: 0
        },
        alertsManager
      });
    }

    allocatedFlats.push({ roomSpec, flat: alloc.flat });
    usedFlatNumbers.push(String(alloc.flat.number));
  }

  const assignedFlat = allocatedFlats[0].flat;
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
      simulatedFlats: allocatedFlats.map((af) => String(af.flat.number)),
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

  // 8. Mode AUTO: Create genuine reservation(s) in db.reservations
  if (!Array.isArray(db.reservations)) db.reservations = [];
  const isPropertyCollect = normalized.paymentCollect === "Property";
  const paymentStatus = isPropertyCollect ? "pendente" : "pago_total";

  const createdReservations = [];

  for (let i = 0; i < allocatedFlats.length; i++) {
    const { roomSpec, flat } = allocatedFlats[i];
    const rFlatNumber = String(flat.number);
    const isMultiRoom = allocatedFlats.length > 1;
    const roomOrderId = isMultiRoom
      ? `${normalized.externalOrderId}-R${i + 1}`
      : normalized.externalOrderId;

    const rTotal = Number(roomSpec.amount || normalized.totalPrice);
    const rCommission = Number((rTotal * 0.15).toFixed(2));
    const rNet = Number((rTotal - rCommission).toFixed(2));
    const rPaid = isPropertyCollect ? 0 : rTotal;

    const nextId = db.reservations.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const code = `RES-${rFlatNumber}-${randSuffix}`;

    const newReservation = {
      id: nextId,
      code,
      flatId: flat.id,
      flatNumber: rFlatNumber,
      guestName: normalized.guestName,
      guestEmail: normalized.guestEmail,
      guestPhone: normalized.guestPhone,
      checkinDate: roomSpec.checkinDate,
      checkoutDate: roomSpec.checkoutDate,
      guestCount: Number(roomSpec.adults || 1) + Number(roomSpec.children || 0),
      adults: Number(roomSpec.adults || 1),
      children: Number(roomSpec.children || 0),
      totalAmount: rTotal,
      dailyRate: roomSpec.nights > 0 ? Number((rTotal / roomSpec.nights).toFixed(2)) : rTotal,
      paidAmount: rPaid,
      netAmount: isMultiRoom ? rNet : normalized.netAmount,
      commissionAmount: isMultiRoom ? rCommission : normalized.commissionAmount,
      cardLast4: normalized.cardLast4,
      cardBrand: normalized.cardBrand,
      cardExpMonth: normalized.cardExpMonth,
      cardExpYear: normalized.cardExpYear,
      hasCard: Boolean(normalized.hasCard),
      isVirtualCard: Boolean(normalized.isVirtualCard),
      virtualCardMeta: normalized.virtualCardMeta || null,
      vaultStatus: normalized.hasCard ? "active" : undefined,
      paymentStatus,
      paymentMethod: normalized.channel,
      paymentCollect: normalized.paymentCollect,
      collectAtCheckin: isPropertyCollect,
      channel: normalized.channel,
      externalOrderId: roomOrderId,
      parentExternalOrderId: normalized.externalOrderId,
      wbpBookingId: normalized.wbpBookingId,
      channexBookingId: normalized.channexBookingId || null,
      channexRevisionId: normalized.channexRevisionId || null,
      breakfastIncluded: Boolean(roomSpec.includeBreakfast),
      ratePlanId: roomSpec.ratePlanId || normalized.ratePlanId,
      status: "ativa",
      createdAt: new Date().toISOString(),
      pixTxId: null,
      pixCopiaECola: null,
      wbpSynced: true,
      auditLogs: [
        {
          timestamp: new Date().toISOString(),
          action: "OTA_BOOKING_IMPORTED",
          details: `Reserva importada via ${normalized.provider === "channex" ? "Channex.io" : "WebBookingPro"} (${normalized.channel.toUpperCase()}). Flat ${rFlatNumber} alocado via Fair-Share. PaymentCollect=${normalized.paymentCollect}.`
        }
      ]
    };

    if (isPropertyCollect) {
      newReservation.receptionAlert = `COBRAR NO CHECK-IN: R$ ${rTotal.toFixed(2)}`;
      if (alertsManager && typeof alertsManager.sendPropertyPaymentAlert === "function") {
        alertsManager.sendPropertyPaymentAlert(newReservation, db);
      }
    }

    db.reservations.push(newReservation);
    createdReservations.push(newReservation);
  }

  const primaryReservation = createdReservations[0];

  // Feature 25: Link vault record to primary reservation ID
  if (normalized.hasCard) {
    try {
      const vault = getCardVault();
      vault.linkReservation(normalized.externalOrderId, primaryReservation.id, normalized.checkoutDate);
    } catch (_) {}
  }

  // Record in OTA Inbox for visibility
  if (!Array.isArray(db.wbpInbox)) db.wbpInbox = [];
  db.wbpInbox.unshift({
    id: `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    mode: "auto",
    receivedAt: new Date().toISOString(),
    reservationId: primaryReservation.id,
    code: primaryReservation.code,
    normalized,
    assignedFlatNumber: flatNumber,
    assignedFlatNumbers: createdReservations.map((r) => r.flatNumber),
    status: "created"
  });

  // 9. Automations in AUTO mode
  try {
    if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
    for (const resItem of createdReservations) {
      db.cleaningRequests.push({
        id: `clean_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        flatId: resItem.flatId,
        flatNumber: resItem.flatNumber,
        scheduledDate: resItem.checkinDate,
        type: "checkin_preparacao",
        status: "pendente",
        notes: `Preparação para check-in OTA (${resItem.guestName}, ${resItem.adults} adultos, café: ${resItem.breakfastIncluded ? "Sim" : "Não"})`
      });
    }

    if (alertsManager && typeof alertsManager.sendEmail === "function") {
      const receptionEmail = db.settings?.receptionEmail || "soho@promenade.com.br";
      const flatsStr = createdReservations.map((r) => r.flatNumber).join(", ");
      const emailSubject = `[RESERVA OTA] Flat ${flatsStr} - ${normalized.guestName} (${normalized.channel.toUpperCase()})`;
      const emailBody = `Nova reserva OTA importada com sucesso:
- Hóspede: ${normalized.guestName}
- Canal: ${normalized.channel.toUpperCase()}
- Flat(s) Alocado(s): ${flatsStr}
- Período: ${normalized.checkinDate} a ${normalized.checkoutDate} (${normalized.nights} noites)
- Pagamento: ${normalized.paymentCollect === "Property" ? "COBRAR NO CHECK-IN (R$ " + normalized.totalPrice.toFixed(2) + ")" : "PAGO NO CANAL (R$ " + normalized.totalPrice.toFixed(2) + ")"}
- Café da Manhã: ${normalized.includeBreakfast ? "Incluso" : "Sem café"}`;
      alertsManager.sendEmail(receptionEmail, emailSubject, emailBody);
    }

    if (normalized.guestPhone && alertsManager && typeof alertsManager.sendWhatsApp === "function") {
      const flatsStr = createdReservations.map((r) => r.flatNumber).join(", ");
      const welcomeMsg = `Olá, ${normalized.guestName}! Confirmamos sua reserva no Flat ${flatsStr} (Soho Residence) para o período de ${normalized.checkinDate} a ${normalized.checkoutDate}. Caso precise de alguma informação adicional, estamos à disposição!`;
      alertsManager.sendWhatsApp(normalized.guestPhone, welcomeMsg);
    }

    if (!Array.isArray(db.serproQueue)) db.serproQueue = [];
    for (const resItem of createdReservations) {
      db.serproQueue.push({
        id: `serpro_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        reservationId: resItem.id,
        reservationCode: resItem.code,
        guestName: resItem.guestName,
        guestEmail: resItem.guestEmail,
        guestPhone: resItem.guestPhone,
        guestCountry: normalized.guestCountry || "BR",
        checkinDate: resItem.checkinDate,
        checkoutDate: resItem.checkoutDate,
        flatNumber: resItem.flatNumber,
        status: "queued",
        createdAt: new Date().toISOString()
      });
      resItem.fnrhStatus = "enviado";
    }
  } catch (err) {
    console.warn("[Automations] Falha ao disparar tarefas secundárias:", err.message);
  }

  // 10. Trigger debounced ARI Refresh for the affected stay window
  try {
    notifyPmsMutation(db, {
      type: "reservation_created",
      checkinDate: primaryReservation.checkinDate,
      checkoutDate: primaryReservation.checkoutDate
    });
  } catch (_) {}

  return {
    success: true,
    action: "created",
    reservationId: primaryReservation.id,
    code: primaryReservation.code,
    flatNumber,
    createdReservationsCount: createdReservations.length,
    createdFlatNumbers: createdReservations.map((r) => r.flatNumber)
  };
}
