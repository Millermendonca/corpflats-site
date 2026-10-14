/**
 * artifacts/api-server/wbp/availability.mjs
 *
 * Canonical Availability Engine for CorpFlats Soho Residence (19 flats).
 * Resolves the 4 divergent legacy calculations by unifying:
 * 1. Active reservations (excluding cancelled/expired, evaluating expired pre-reservas).
 * 2. Active provisional holds/pending modifications (r.pendingModification with expiration check).
 * 3. Room blocks (db.roomBlocks).
 * 4. Maintenance service orders (db.serviceOrders blocking specific flats/dates).
 * 5. Flat maintenance status (f.status === 'manutencao_bloqueada' || f.maintenanceStatus === 'em_manutencao' || f.isActive === false).
 *
 * Provides non-blocking conflict warnings for reservation creation and movement.
 * Mirrors byte-for-byte in scripts/wbp/availability.mjs.
 */

export const CORPFLATS_19_FLATS = [
  { id: 1, number: "113", colName: "113 solteiro" },
  { id: 2, number: "114", colName: "114 Solteiro" },
  { id: 3, number: "116", colName: "116" },
  { id: 4, number: "211", colName: "211 de casal" },
  { id: 5, number: "212", colName: "212 solteiro" },
  { id: 6, number: "215", colName: "215 Solteiro" },
  { id: 7, number: "313", colName: "313 solteiro" },
  { id: 8, number: "408", colName: "408 casal" },
  { id: 10, number: "509", colName: "509 casal" },
  { id: 11, number: "511", colName: "511 casal" },
  { id: 12, number: "512", colName: "512 casal" },
  { id: 13, number: "605", colName: "605 solteiro" },
  { id: 14, number: "712", colName: "712 Solteiro SPLIT" },
  { id: 15, number: "715", colName: "715 Solteiro" },
  { id: 16, number: "904", colName: "904 split" },
  { id: 17, number: "905", colName: "905 split" },
  { id: 18, number: "907", colName: "X 907 casal" },
  { id: 19, number: "1004", colName: "1004 Solteiro X" },
  { id: 21, number: "1304", colName: "1304 Solteiro(ferro unindo)" }
];

/**
 * Returns the 19 canonical flats of CorpFlats, prioritizing the database state if available.
 * @param {object} [db]
 * @returns {Array<{id: number, number: string, colName?: string, status?: string}>}
 */
export function getCanonicalFlats(db = null) {
  if (db && Array.isArray(db.flats) && db.flats.length > 0) {
    return db.flats;
  }
  return CORPFLATS_19_FLATS;
}

/**
 * Normalizes a date into YYYY-MM-DD string.
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function normalizeDateStr(dateInput) {
  if (!dateInput) return "";
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    return trimmed.substring(0, 10);
  }
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return dateInput.toISOString().substring(0, 10);
  }
  return String(dateInput).substring(0, 10);
}

/**
 * Generates an array of individual nights between checkin (inclusive) and checkout (exclusive).
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {string[]}
 */
export function getNightsBetween(startDate, endDate) {
  const startStr = normalizeDateStr(startDate);
  const endStr = normalizeDateStr(endDate);
  if (!startStr || !endStr) return [];

  const nights = [];
  const curr = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");

  if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr >= end) {
    nights.push(startStr);
    return nights;
  }

  while (curr < end) {
    nights.push(curr.toISOString().substring(0, 10));
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return nights;
}

/**
 * Checks if a flat number or flat ID matches a target flat reference.
 * @param {string|number} flatRef1
 * @param {string|number} flatRef2
 * @returns {boolean}
 */
export function matchFlat(flatRef1, flatRef2) {
  if (flatRef1 == null || flatRef2 == null) return false;
  return String(flatRef1).trim() === String(flatRef2).trim();
}

/**
 * Checks whether a single flat is blocked on a specific night across all 5 collision sources.
 *
 * @param {object} flat - Flat object { id, number, status, maintenanceStatus, isActive }
 * @param {string} nightDate - YYYY-MM-DD
 * @param {object} db - Database state reference
 * @param {object} [options]
 * @param {string|number} [options.excludeReservationId]
 * @param {string|number} [options.excludePendingHoldReservationId]
 * @param {number} [options.nowMs]
 * @returns {{ isBlocked: boolean, reason?: string, details?: object }}
 */
export function checkFlatBlockedOnNight(flat, nightDate, db = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  const flatObj = typeof flat === "object" && flat !== null ? flat : { number: String(flat) };
  const flatIdStr = flatObj.id != null ? String(flatObj.id) : "";
  const flatNumStr = flatObj.number != null ? String(flatObj.number) : "";

  // 1. Permanent / Operational Flat Maintenance Status
  if (
    flatObj.isActive === false ||
    flatObj.status === "manutencao_bloqueada" ||
    flatObj.maintenanceStatus === "em_manutencao"
  ) {
    return {
      isBlocked: true,
      reason: "flat_maintenance",
      details: {
        flatNumber: flatNumStr,
        flatId: flatIdStr,
        status: flatObj.status,
        maintenanceStatus: flatObj.maintenanceStatus
      }
    };
  }

  // 2. Active Reservations in PMS
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];
  for (const r of reservations) {
    if (r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada") {
      continue;
    }
    if (
      options.excludeReservationId &&
      (matchFlat(r.id, options.excludeReservationId) || matchFlat(r.code, options.excludeReservationId))
    ) {
      continue;
    }

    // Expire unpaid pre-reservas past expiration time
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt) {
      const expiresMs = new Date(r.expiresAt).getTime();
      if (!isNaN(expiresMs) && expiresMs < nowMs && r.paymentStatus !== "pago_total") {
        continue;
      }
    }

    // Check flat match
    const rFlatNum = r.flatNumber != null ? String(r.flatNumber) : "";
    const rFlatId = r.flatId != null ? String(r.flatId) : "";
    const matchesThisFlat =
      matchFlat(flatNumStr, rFlatNum) ||
      matchFlat(flatIdStr, rFlatId) ||
      matchFlat(flatNumStr, rFlatId) ||
      matchFlat(flatIdStr, rFlatNum);

    if (!matchesThisFlat) continue;

    // Check date interval: night checkinDate <= nightDate < checkoutDate
    const inStr = normalizeDateStr(r.checkinDate);
    const outStr = normalizeDateStr(r.checkoutDate);
    if (inStr <= nightDate && outStr > nightDate) {
      return {
        isBlocked: true,
        reason: "reservation",
        details: {
          reservationId: r.id,
          code: r.code,
          guestName: r.guestName,
          checkinDate: inStr,
          checkoutDate: outStr,
          channel: r.channel || "direct",
          flatNumber: flatNumStr
        }
      };
    }
  }

  // 3. Active Non-Expired Provisional Holds (pendingModification)
  for (const r of reservations) {
    const pending = r.pendingModification;
    if (!pending) continue;
    if (pending.status !== "pending" && pending.status !== "pending_payment") continue;

    if (
      options.excludePendingHoldReservationId &&
      (matchFlat(r.id, options.excludePendingHoldReservationId) || matchFlat(r.code, options.excludePendingHoldReservationId))
    ) {
      continue;
    }

    // Check hold expiration
    if (pending.expiresAt) {
      const expiresMs = new Date(pending.expiresAt).getTime();
      if (!isNaN(expiresMs) && expiresMs < nowMs) {
        continue;
      }
    }

    const pHoldIn = normalizeDateStr(pending.newCheckinDate || pending.proposedCheckinDate);
    const pHoldOut = normalizeDateStr(pending.newCheckoutDate || pending.proposedCheckoutDate);
    const pHoldFlatNum = String(pending.newFlatNumber || pending.proposedFlatNumber || pending.newFlatId || pending.proposedFlatId || r.flatNumber || "");
    const pHoldFlatId = String(pending.newFlatId || pending.proposedFlatId || r.flatId || "");

    const matchesThisFlat =
      matchFlat(flatNumStr, pHoldFlatNum) ||
      matchFlat(flatIdStr, pHoldFlatId) ||
      matchFlat(flatNumStr, pHoldFlatId) ||
      matchFlat(flatIdStr, pHoldFlatNum);

    if (matchesThisFlat && pHoldIn <= nightDate && pHoldOut > nightDate) {
      return {
        isBlocked: true,
        reason: "hold",
        details: {
          reservationId: r.id,
          code: r.code,
          guestName: r.guestName,
          checkinDate: pHoldIn,
          checkoutDate: pHoldOut,
          expiresAt: pending.expiresAt,
          flatNumber: flatNumStr
        }
      };
    }
  }

  // 4. Room Blocks (db.roomBlocks)
  const roomBlocks = Array.isArray(db.roomBlocks) ? db.roomBlocks : [];
  for (const b of roomBlocks) {
    const bFlatNum = b.flatNumber != null ? String(b.flatNumber) : "";
    const bFlatId = b.flatId != null ? String(b.flatId) : "";
    const matchesThisFlat =
      matchFlat(flatNumStr, bFlatNum) ||
      matchFlat(flatIdStr, bFlatId) ||
      matchFlat(flatNumStr, bFlatId) ||
      matchFlat(flatIdStr, bFlatNum);

    if (!matchesThisFlat) continue;

    const bStart = normalizeDateStr(b.startDate);
    const bEnd = normalizeDateStr(b.endDate);
    if (bStart <= nightDate && bEnd > nightDate) {
      return {
        isBlocked: true,
        reason: "room_block",
        details: {
          blockId: b.id,
          reason: b.reason || "Bloqueio administrativo",
          startDate: bStart,
          endDate: bEnd,
          notes: b.notes || "",
          flatNumber: flatNumStr
        }
      };
    }
  }

  // 5. Maintenance Service Orders (db.serviceOrders)
  const serviceOrders = Array.isArray(db.serviceOrders) ? db.serviceOrders : [];
  for (const order of serviceOrders) {
    if (order.status !== "active") continue;

    const orderFlats = Array.isArray(order.flats) ? order.flats : [];
    for (const oflat of orderFlats) {
      const oStatus = oflat.status || "in_progress";
      if (oStatus !== "in_progress" && oStatus !== "pending" && oStatus !== "active") {
        continue;
      }

      const oFlatNum = oflat.flatNumber != null ? String(oflat.flatNumber) : "";
      const oFlatId = oflat.flatId != null ? String(oflat.flatId) : "";
      const matchesThisFlat =
        matchFlat(flatNumStr, oFlatNum) ||
        matchFlat(flatIdStr, oFlatId) ||
        matchFlat(flatNumStr, oFlatId) ||
        matchFlat(flatIdStr, oFlatNum);

      if (!matchesThisFlat) continue;

      const oStart = normalizeDateStr(oflat.startedAt || order.startedAt || order.createdAt);
      const oEnd = normalizeDateStr(oflat.estimatedFinishAt || order.estimatedFinishAt);

      if (oStart && oEnd) {
        if (oStart <= nightDate && oEnd > nightDate) {
          return {
            isBlocked: true,
            reason: "service_order",
            details: {
              serviceOrderId: order.id,
              title: order.title,
              workerName: oflat.workerName || "Prestador",
              startDate: oStart,
              endDate: oEnd,
              flatNumber: flatNumStr
            }
          };
        }
      } else if (oStart && oStart <= nightDate) {
        // In-progress service order without estimated finish date blocks by default
        return {
          isBlocked: true,
          reason: "service_order",
          details: {
            serviceOrderId: order.id,
            title: order.title,
            workerName: oflat.workerName || "Prestador",
            startDate: oStart,
            endDate: null,
            flatNumber: flatNumStr
          }
        };
      }
    }
  }

  return { isBlocked: false };
}

/**
 * Calculates Canonical Availability across the 19 flats for a date range.
 * Resolves all 4 legacy divergent availability calculations.
 *
 * @param {string} startDate - YYYY-MM-DD (checkin)
 * @param {string} endDate - YYYY-MM-DD (checkout)
 * @param {object} [options]
 * @param {object} [options.db] - Database instance
 * @param {string|number} [options.excludeReservationId] - ID/code of reservation to exclude
 * @param {string|number} [options.excludePendingHoldReservationId] - Hold to exclude
 * @param {number} [options.ceiling] - Optional max ceiling per rate plan
 * @param {number} [options.nowMs] - Current time in ms
 * @returns {Map<string, number> & {
 *   daily: Array<{ date: string, availableFlats: number, units: number, occupiedFlats: number, freeFlatNumbers: string[], blockedDetails: object[] }>,
 *   minAvailable: number,
 *   totalFlats: number,
 *   detailsByDate: Record<string, object>
 * }}
 */
export function calculateCanonicalAvailability(startDate, endDate, options = {}) {
  const db = options.db || (typeof global !== "undefined" && global.db ? global.db : {});
  const flats = getCanonicalFlats(db);
  const totalFlats = flats.length;
  const nights = getNightsBetween(startDate, endDate);

  const resultMap = new Map();
  const daily = [];
  const detailsByDate = {};
  let minAvailable = totalFlats;

  for (const night of nights) {
    const freeFlatNumbers = [];
    const freeFlatIds = [];
    const blockedDetails = [];

    for (const flat of flats) {
      const blockCheck = checkFlatBlockedOnNight(flat, night, db, options);
      if (blockCheck.isBlocked) {
        blockedDetails.push({
          flatNumber: String(flat.number),
          flatId: flat.id,
          ...blockCheck
        });
      } else {
        freeFlatNumbers.push(String(flat.number));
        freeFlatIds.push(flat.id);
      }
    }

    const availableCount = freeFlatNumbers.length;
    let units = availableCount;
    if (options.ceiling != null && !isNaN(Number(options.ceiling))) {
      units = Math.max(0, Math.min(Number(options.ceiling), availableCount));
    }

    resultMap.set(night, units);

    if (units < minAvailable) {
      minAvailable = units;
    }

    const dayDetail = {
      date: night,
      availableFlats: availableCount,
      units,
      occupiedFlats: totalFlats - availableCount,
      freeFlatNumbers,
      freeFlatIds,
      blockedDetails
    };

    daily.push(dayDetail);
    detailsByDate[night] = dayDetail;
  }

  // Attach enriched properties for ergonomic access while preserving standard Map behavior
  resultMap.daily = daily;
  resultMap.minAvailable = nights.length > 0 ? minAvailable : totalFlats;
  resultMap.totalFlats = totalFlats;
  resultMap.detailsByDate = detailsByDate;

  return resultMap;
}

/**
 * Checks for conflicts when creating, moving, or modifying a reservation.
 * Provides NON-BLOCKING conflict warnings for the reception, PMS, and bot.
 *
 * @param {object} params
 * @param {string|number} params.flatId
 * @param {string|number} params.flatNumber
 * @param {string} params.checkinDate
 * @param {string} params.checkoutDate
 * @param {string|number} [params.excludeReservationId]
 * @param {string|number} [params.excludePendingHoldReservationId]
 * @param {object} [params.db]
 * @param {number} [params.nowMs]
 * @returns {{
 *   hasConflict: boolean,
 *   isWarningOnly: boolean,
 *   conflicts: Array<{ type: string, date: string, details: object }>,
 *   warnings: string[],
 *   summaryMessage: string|null
 * }}
 */
export function checkReservationConflicts({
  flatId,
  flatNumber,
  checkinDate,
  checkoutDate,
  excludeReservationId = null,
  excludePendingHoldReservationId = null,
  db = null,
  nowMs = Date.now()
} = {}) {
  const activeDb = db || (typeof global !== "undefined" && global.db ? global.db : {});
  const flats = getCanonicalFlats(activeDb);

  const targetFlat = flats.find(f =>
    matchFlat(f.number, flatNumber) ||
    matchFlat(f.id, flatId) ||
    matchFlat(f.number, flatId) ||
    matchFlat(f.id, flatNumber)
  ) || { id: flatId, number: flatNumber };

  const nights = getNightsBetween(checkinDate, checkoutDate);
  const conflicts = [];
  const warnings = [];

  for (const night of nights) {
    const blockCheck = checkFlatBlockedOnNight(targetFlat, night, activeDb, {
      excludeReservationId,
      excludePendingHoldReservationId,
      nowMs
    });

    if (blockCheck.isBlocked) {
      conflicts.push({
        date: night,
        type: blockCheck.reason,
        details: blockCheck.details
      });

      const flatLabel = `Flat ${targetFlat.number || targetFlat.id}`;
      let warnText = `Conflito em ${night} no ${flatLabel}: `;
      if (blockCheck.reason === "reservation") {
        warnText += `ocupado pela reserva ${blockCheck.details?.code || blockCheck.details?.reservationId} (${blockCheck.details?.guestName || "Hóspede"})`;
      } else if (blockCheck.reason === "hold") {
        warnText += `bloqueado por hold pendente da reserva ${blockCheck.details?.code || blockCheck.details?.reservationId}`;
      } else if (blockCheck.reason === "room_block") {
        warnText += `bloqueio administrativo (${blockCheck.details?.reason || "Manutenção"})`;
      } else if (blockCheck.reason === "service_order") {
        warnText += `ordem de serviço ${blockCheck.details?.serviceOrderId} (${blockCheck.details?.title})`;
      } else if (blockCheck.reason === "flat_maintenance") {
        warnText += `flat em manutenção permanente/inativo`;
      }
      warnings.push(warnText);
    }
  }

  const hasConflict = conflicts.length > 0;
  return {
    hasConflict,
    isWarningOnly: true, // Non-blocking requirement!
    conflicts,
    warnings,
    summaryMessage: hasConflict ? warnings.join("; ") : null
  };
}
