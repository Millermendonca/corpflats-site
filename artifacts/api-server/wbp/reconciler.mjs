/**
 * artifacts/api-server/wbp/reconciler.mjs
 *
 * Feature 22: Manual Reservation Reconciliation & Deduplication Engine.
 *
 * Prevents duplicate bookings when WebBookingPro electronic reservations arrive
 * for reservations already manually typed into the PMS by hotel staff.
 *
 * Matching Algorithm:
 * - Channel Match (20 pts)
 * - Date Match (30 pts)
 * - Guest Name Fuzzy Match (30 pts, >=85% similarity)
 * - Contact Match (15 pts)
 * - Price Compatibility (5 pts)
 *
 * Classification:
 * - Score >= 80 pts -> Safe Match (link external identifiers, DO NOT duplicate, DO NOT modify flat/rate)
 * - 50 <= Score < 80 -> Ambiguous Match (route to Quarantine as AMBIGUOUS_MATCH)
 * - Score < 50 -> No Match (treat as genuine new electronic booking)
 *
 * Mirrors byte-for-byte in scripts/wbp/reconciler.mjs.
 */

/**
 * Normalizes a guest name for robust fuzzy comparison:
 * Lowercases, strips Unicode diacritics/accents, removes honorifics and punctuation.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeGuestName(name) {
  if (!name || typeof name !== "string") return "";
  let n = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // strip diacritics

  // Remove honorifics and salutations
  n = n.replace(/\b(sr|sra|srta|dr|dra|mr|mrs|ms|prof|profa)\b\.?/gi, " ");

  // Remove special characters, keep letters and spaces
  n = n.replace(/[^a-z0-9\s]/g, " ");

  // Collapse multiple spaces
  return n.trim().replace(/\s+/g, " ");
}

/**
 * Calculates Levenshtein Distance between two normalized strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates composite name similarity between 0.0 and 1.0 using Token Jaccard and Levenshtein.
 *
 * @param {string} nameA
 * @param {string} nameB
 * @returns {number}
 */
export function calculateNameSimilarity(nameA, nameB) {
  const nA = normalizeGuestName(nameA);
  const nB = normalizeGuestName(nameB);

  if (!nA || !nB) return 0.0;
  if (nA === nB) return 1.0;

  // Substring containment for full names
  if (nA.includes(nB) || nB.includes(nA)) {
    const minLen = Math.min(nA.length, nB.length);
    const maxLen = Math.max(nA.length, nB.length);
    if (minLen / maxLen >= 0.6) {
      return 0.90;
    }
  }

  // Token Jaccard Similarity
  const tokensA = new Set(nA.split(" ").filter(t => t.length > 1));
  const tokensB = new Set(nB.split(" ").filter(t => t.length > 1));

  if (tokensA.size > 0 && tokensB.size > 0) {
    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard >= 0.8) return 0.95;
    if (jaccard >= 0.5) {
      // First and last name match
      const arrA = Array.from(tokensA);
      const arrB = Array.from(tokensB);
      if (arrA[0] === arrB[0] && arrA[arrA.length - 1] === arrB[arrB.length - 1]) {
        return 0.92;
      }
      return 0.85;
    }
  }

  // Levenshtein similarity on string
  const maxLen = Math.max(nA.length, nB.length);
  const dist = levenshteinDistance(nA, nB);
  const levSim = maxLen > 0 ? 1.0 - dist / maxLen : 0.0;

  return Math.max(0.0, Math.min(1.0, levSim));
}

/**
 * Normalizes phone numbers to digits only, taking the last 8 or 9 digits to handle country/area codes.
 *
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhoneDigits(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length >= 8) {
    return digits.slice(-8);
  }
  return digits;
}

/**
 * Computes multi-attribute reconciliation score between a PMS reservation and an OTA booking.
 * Total score: 0 to 100 points.
 *
 * @param {object} pmsRes
 * @param {object} otaBooking
 * @returns {{
 *   score: number,
 *   isSafeMatch: boolean,
 *   isAmbiguous: boolean,
 *   isNoMatch: boolean,
 *   reasons: string[],
 *   discrepancies: string[]
 * }}
 */
export function computeReconciliationScore(pmsRes, otaBooking) {
  let score = 0;
  const reasons = [];
  const discrepancies = [];

  // 1. Channel Matching (max 20 pts)
  const pmsChan = String(pmsRes.channel || "").toLowerCase();
  const otaChan = String(otaBooking.channel || otaBooking.Channel || "").toLowerCase();

  const isPmsOta = pmsChan.includes("booking") || pmsChan.includes("airbnb");
  const isOtaBooking = otaChan.includes("booking");
  const isOtaAirbnb = otaChan.includes("airbnb");

  const exactChannelMatch = Boolean(
    ((isOtaBooking && pmsChan.includes("booking")) || (isOtaAirbnb && pmsChan.includes("airbnb"))) ||
    (otaChan && pmsChan && otaChan === pmsChan)
  );

  if (exactChannelMatch) {
    score += 20;
    reasons.push(`Canal idêntico: ${otaChan}`);
  } else if (isPmsOta && (isOtaBooking || isOtaAirbnb)) {
    // Both are OTAs but different channel (e.g. booked airbnb vs typed booking)
    score += 5;
    discrepancies.push(`Canais OTA divergentes: PMS=${pmsChan} vs OTA=${otaChan}`);
  } else {
    // PMS is direct or balcao
    score -= 10;
    discrepancies.push(`Canal PMS direto (${pmsChan}) incompatível com OTA (${otaChan})`);
  }

  // 2. Date Matching (max 30 pts)
  const pmsIn = String(pmsRes.checkinDate || "").substring(0, 10);
  const pmsOut = String(pmsRes.checkoutDate || "").substring(0, 10);
  const otaIn = String(otaBooking.checkinDate || otaBooking.StartDate || "").substring(0, 10);
  const otaOut = String(otaBooking.checkoutDate || otaBooking.EndDate || "").substring(0, 10);

  const exactDateMatch = Boolean(pmsIn && pmsOut && otaIn && otaOut && pmsIn === otaIn && pmsOut === otaOut);

  if (pmsIn && pmsOut && otaIn && otaOut) {
    if (exactDateMatch) {
      score += 30;
      reasons.push(`Datas exatas de estadia: ${pmsIn} a ${pmsOut}`);
    } else if (pmsIn === otaIn || pmsOut === otaOut) {
      score += 15;
      discrepancies.push(`Uma das datas coincide (in: ${pmsIn === otaIn}, out: ${pmsOut === otaOut})`);
    } else if (pmsIn < otaOut && pmsOut > otaIn) {
      score += 10;
      discrepancies.push(`Períodos de estadia sobrepostos parcialmente: PMS=${pmsIn}/${pmsOut} vs OTA=${otaIn}/${otaOut}`);
    } else {
      discrepancies.push(`Datas sem sobreposição: PMS=${pmsIn}/${pmsOut} vs OTA=${otaIn}/${otaOut}`);
    }
  }

  // 3. Guest Name Similarity (max 30 pts)
  const pmsName = pmsRes.guestName || pmsRes.name || "";
  const otaName = otaBooking.guestName || otaBooking.CustomerName ||
    (otaBooking.Customers && otaBooking.Customers[0] ? `${otaBooking.Customers[0].CustomerFName || ""} ${otaBooking.Customers[0].CustomerLName || ""}`.trim() : "") ||
    otaBooking.guest?.name || "";

  const nameSim = calculateNameSimilarity(pmsName, otaName);
  if (nameSim >= 0.95) {
    score += 30;
    reasons.push(`Nome quase idêntico (${Math.round(nameSim * 100)}%): "${pmsName}" vs "${otaName}"`);
  } else if (nameSim >= 0.85) {
    score += 25;
    reasons.push(`Nome com alta similaridade (${Math.round(nameSim * 100)}%): "${pmsName}" vs "${otaName}"`);
  } else if (nameSim >= 0.60) {
    score += 10;
    discrepancies.push(`Similaridade moderada de nome (${Math.round(nameSim * 100)}%): "${pmsName}" vs "${otaName}"`);
  } else if (nameSim > 0) {
    discrepancies.push(`Baixa similaridade de nome (${Math.round(nameSim * 100)}%): "${pmsName}" vs "${otaName}"`);
  }

  // 4. Contact Match (max 15 pts)
  const pmsPhone = normalizePhoneDigits(pmsRes.guestPhone || pmsRes.phone || "");
  const otaPhone = normalizePhoneDigits(otaBooking.guestPhone || otaBooking.phone || otaBooking.guest?.phone || "");
  const pmsEmail = String(pmsRes.guestEmail || pmsRes.email || "").toLowerCase().trim();
  const otaEmail = String(otaBooking.guestEmail || otaBooking.email || otaBooking.guest?.email || "").toLowerCase().trim();

  let contactMatched = false;
  if (pmsPhone && otaPhone && pmsPhone.length >= 8 && otaPhone.length >= 8 && pmsPhone === otaPhone) {
    score += 15;
    reasons.push(`Telefone coincidente: ${pmsPhone}`);
    contactMatched = true;
  } else if (pmsEmail && otaEmail && pmsEmail === otaEmail && !pmsEmail.includes("guest.booking.com")) {
    score += 15;
    reasons.push(`E-mail coincidente: ${pmsEmail}`);
    contactMatched = true;
  }

  // 5. Price Compatibility (max 5 pts)
  const pmsPrice = Number(pmsRes.totalAmount || pmsRes.totalPrice || 0);
  const otaPrice = Number(otaBooking.totalPrice || otaBooking.TotalPrice || otaBooking.totalAmount || 0);

  if (pmsPrice > 0 && otaPrice > 0) {
    const diffRatio = Math.abs(pmsPrice - otaPrice) / Math.max(pmsPrice, otaPrice);
    if (diffRatio <= 0.02) {
      score += 5;
      reasons.push(`Valor compatível: R$ ${pmsPrice.toFixed(2)} vs R$ ${otaPrice.toFixed(2)}`);
    } else if (diffRatio <= 0.20) {
      // Possible commission margin difference (neutral)
      reasons.push(`Variação compatível com margem de comissão: PMS R$ ${pmsPrice.toFixed(2)} vs OTA R$ ${otaPrice.toFixed(2)}`);
    }
  }

  // Defect 3 / Problema B: When exactChannelMatch && exactDateMatch && nameSim >= 0.85, adjust score to at least 80
  if (exactChannelMatch && exactDateMatch && nameSim >= 0.85) {
    score = Math.max(score, 80);
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, score));

  // Determine Safe vs Ambiguous vs No Match per Mandatory Parent Directive:
  // isSafeMatch strictly requires: exactChannelMatch && exactDateMatch && nameSim >= 0.85 && finalScore >= 80
  const qualifiesSafe = exactChannelMatch && exactDateMatch && nameSim >= 0.85 && finalScore >= 80;
  const isSafeMatch = qualifiesSafe;

  // Only classify as ambiguous if there is plausible guest name similarity
  const isAmbiguous = !isSafeMatch && finalScore >= 50 && nameSim >= 0.50;
  const isNoMatch = !isSafeMatch && !isAmbiguous;

  return {
    score: finalScore,
    isSafeMatch,
    isAmbiguous,
    isNoMatch,
    exactChannelMatch,
    exactDateMatch,
    nameSim,
    reasons,
    discrepancies
  };
}

/**
 * Searches the PMS database for the best matching manual reservation for an incoming OTA booking.
 *
 * @param {object} db - PMS database
 * @param {object} otaBooking - Normalized OTA booking
 * @returns {{ bestMatch: object, scoreResult: object } | null}
 */
export function findBestManualMatch(db, otaBooking) {
  if (!db || !Array.isArray(db.reservations) || db.reservations.length === 0) {
    return null;
  }

  const otaIn = String(otaBooking.checkinDate || "").substring(0, 10);
  const otaOut = String(otaBooking.checkoutDate || "").substring(0, 10);

  let bestMatch = null;
  let bestScoreResult = null;

  for (const r of db.reservations) {
    // Skip cancelled or already linked reservations with a DIFFERENT orderId
    if (r.status === "cancelada" || r.status === "cancelled") continue;
    if (r.externalOrderId && String(r.externalOrderId) !== String(otaBooking.externalOrderId || otaBooking.OrderId || otaBooking.wbpBookingId)) {
      continue;
    }

    const rIn = String(r.checkinDate || "").substring(0, 10);
    const rOut = String(r.checkoutDate || "").substring(0, 10);

    // Rough date window filter: check-in within +/- 5 days of OTA checkin
    if (otaIn && rIn) {
      const diffDays = Math.abs((new Date(rIn + "T12:00:00Z").getTime() - new Date(otaIn + "T12:00:00Z").getTime()) / 86400000);
      if (diffDays > 5) continue;
    }

    const result = computeReconciliationScore(r, otaBooking);
    if (!bestScoreResult || result.score > bestScoreResult.score) {
      bestScoreResult = result;
      bestMatch = r;
    }
  }

  if (bestMatch && bestScoreResult && (bestScoreResult.isSafeMatch || bestScoreResult.isAmbiguous)) {
    return {
      bestMatch,
      scoreResult: bestScoreResult
    };
  }

  return null;
}

/**
 * Safely links an existing manual PMS reservation to an incoming OTA booking.
 *
 * Strict Non-Destructive Rules (Directive 4 / R5):
 * - Sets externalOrderId, wbpBookingId, wbpSynced, wbpMatchedAt, wbpLinkMeta.
 * - DOES NOT overwrite assigned flat.
 * - DOES NOT overwrite daily rates, total amount, or payment fields.
 * - DOES NOT overwrite guest documents or status.
 *
 * @param {object} pmsRes
 * @param {object} otaBooking
 * @param {object} [options]
 * @returns {object}
 */
export function applySafeReconciliationLink(pmsRes, otaBooking, options = {}) {
  const externalOrderId = String(otaBooking.externalOrderId || otaBooking.OrderId || otaBooking.wbpBookingId || otaBooking.booking_id || "").trim();
  const wbpBookingId = String(otaBooking.wbpBookingId || otaBooking.booking_id || externalOrderId).trim();

  pmsRes.externalOrderId = externalOrderId;
  pmsRes.wbpBookingId = wbpBookingId;
  pmsRes.wbpSynced = true;
  pmsRes.wbpMatchedAt = new Date().toISOString();
  pmsRes.wbpLinkMeta = {
    linkedAt: new Date().toISOString(),
    externalOrderId,
    wbpBookingId,
    otaChannel: otaBooking.channel || otaBooking.Channel,
    otaPaymentCollect: otaBooking.paymentCollect
  };

  if (!Array.isArray(pmsRes.auditLogs)) {
    pmsRes.auditLogs = [];
  }
  pmsRes.auditLogs.push({
    timestamp: new Date().toISOString(),
    action: "WBP_MANUAL_RECONCILIATION_LINKED",
    details: `Reserva manual vinculada com sucesso à reserva WebBookingPro #${externalOrderId}. Flat, tarifas e pagamentos originais estritamente preservados.`
  });

  return pmsRes;
}

/**
 * Generates the full 4-part Reconciliation Report.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {Array<object>} [params.otaBookings]
 * @param {object} [params.options]
 * @returns {object}
 */
export function generateReconciliationReport({ db, otaBookings = [], options = {} }) {
  const pmsReservations = Array.isArray(db?.reservations) ? db.reservations : [];

  const matched = [];
  const potentialDuplicates = [];
  const unmatchedOta = [];
  const pmsMatchedIds = new Set();

  for (const ota of otaBookings) {
    const match = findBestManualMatch(db, ota);
    if (match) {
      const { bestMatch, scoreResult } = match;
      pmsMatchedIds.add(bestMatch.id || bestMatch.code);

      if (scoreResult.isSafeMatch) {
        matched.push({
          pmsReservationId: bestMatch.id,
          pmsCode: bestMatch.code,
          pmsGuestName: bestMatch.guestName,
          pmsFlatNumber: bestMatch.flatNumber,
          pmsCheckin: bestMatch.checkinDate,
          pmsCheckout: bestMatch.checkoutDate,
          pmsTotalAmount: bestMatch.totalAmount,
          pmsChannel: bestMatch.channel,
          otaBookingId: ota.externalOrderId || ota.OrderId || ota.wbpBookingId,
          otaGuestName: ota.guestName || ota.guest?.name || "",
          otaCheckin: ota.checkinDate,
          otaCheckout: ota.checkoutDate,
          otaTotalPrice: ota.totalPrice,
          otaChannel: ota.channel,
          matchScore: scoreResult.score,
          reasons: scoreResult.reasons,
          isLinked: Boolean(bestMatch.externalOrderId)
        });
      } else {
        potentialDuplicates.push({
          pmsReservationId: bestMatch.id,
          pmsCode: bestMatch.code,
          pmsGuestName: bestMatch.guestName,
          pmsFlatNumber: bestMatch.flatNumber,
          pmsCheckin: bestMatch.checkinDate,
          pmsCheckout: bestMatch.checkoutDate,
          otaBookingId: ota.externalOrderId || ota.OrderId || ota.wbpBookingId,
          otaGuestName: ota.guestName || ota.guest?.name || "",
          otaCheckin: ota.checkinDate,
          otaCheckout: ota.checkoutDate,
          matchScore: scoreResult.score,
          discrepancies: scoreResult.discrepancies,
          suggestedAction: "quarantine"
        });
      }
    } else {
      unmatchedOta.push(ota);
    }
  }

  // Find active manual reservations in PMS that have channel = booking/airbnb but no OTA counterpart
  const unmatchedPms = pmsReservations.filter(r => {
    if (r.status === "cancelada" || r.status === "cancelled") return false;
    const chan = String(r.channel || "").toLowerCase();
    const isOta = chan.includes("booking") || chan.includes("airbnb");
    if (!isOta) return false;
    return !pmsMatchedIds.has(r.id || r.code);
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPmsOtaReservations: unmatchedPms.length + matched.length + potentialDuplicates.length,
      totalOtaBookingsReceived: otaBookings.length,
      matchedCount: matched.length,
      potentialDuplicatesCount: potentialDuplicates.length,
      unmatchedPmsCount: unmatchedPms.length,
      unmatchedOtaCount: unmatchedOta.length
    },
    matched,
    potential_duplicates: potentialDuplicates,
    unmatched_pms: unmatchedPms,
    unmatched_ota: unmatchedOta
  };
}
