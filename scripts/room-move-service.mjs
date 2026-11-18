/**
 * artifacts/api-server/room-move-service.mjs
 *
 * Motor canônico de Troca de Flat (com corte no meio da estadia ou movimentação integral),
 * Inversão Direta entre dois hóspedes (907 ⇄ 512) e Desfazer Troca / Reunificação.
 *
 * Regras críticas:
 * - Mantém r.id e r.code no segmento ATIVO (Parte 2 / flat de destino), preservando links de portal e Sofia AI.
 * - Rateio estrito no corte: diárias < cutDate e 100% das taxas anteriores ficam na Parte 1 (rPast);
 *   diárias >= cutDate e eventual ajuste de upgrade/diferença (chg_upgrade_*) ficam na Parte 2 (r).
 * - FNRH assinada preservada intacta em rPast; invalidada em r para nova conferência e assinatura.
 * - IDs externos OTA (channexBookingId, externalOrderId, etc.) movidos para origin* em rPast para não duplicar quarto na Channex.
 * - Café da manhã sincronizado estritamente por reservationId / reservationCode.
 *
 * Mirrors byte-for-byte in scripts/room-move-service.mjs.
 */

import {
  CORPFLATS_19_FLATS,
  getCanonicalFlats,
  normalizeDateStr,
  getNightsBetween
} from "./wbp/availability.mjs";
import { notifyPmsMutation as defaultNotifyPmsMutation } from "./wbp/ari-sync.mjs";

const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function getEffectiveDate() {
  const offset = Number(globalThis.__simulatedTimeOffsetMs || 0);
  return new Date(Date.now() + offset);
}

function getBrasiliaNowLocal() {
  const now = getEffectiveDate();
  let dateStr;
  try {
    dateStr = BRAZIL_DATE_FORMATTER.format(now);
  } catch {
    dateStr = now.toISOString().slice(0, 10);
  }
  try {
    const timeParts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(now);
    const hour = Number(timeParts.find((p) => p.type === "hour")?.value || "0");
    const minute = Number(timeParts.find((p) => p.type === "minute")?.value || "0");
    const second = Number(timeParts.find((p) => p.type === "second")?.value || "0");
    return {
      date: dateStr,
      hour,
      minute,
      second,
      timeStr: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      iso: now.toISOString()
    };
  } catch {
    return {
      date: dateStr,
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
      second: now.getUTCSeconds(),
      timeStr: now.toISOString().slice(11, 16),
      iso: now.toISOString()
    };
  }
}

function getTodayStrLocal() {
  return getBrasiliaNowLocal().date;
}

function getExecutionDateStrLocal(isoString) {
  if (!isoString) return getTodayStrLocal();
  const str = String(isoString).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  try {
    return BRAZIL_DATE_FORMATTER.format(new Date(str));
  } catch {
    return str.substring(0, 10);
  }
}

function cloneDeep(obj) {
  if (typeof structuredClone === "function") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

function isCancelledStatus(r) {
  const st = String(r?.status || "").toLowerCase().trim();
  return ["cancelada", "cancelado", "cancelled", "expirada", "expired", "no_show"].includes(st);
}

function isClosedStayStatus(r) {
  if (!r) return false;
  const st = String(r.status || "").toLowerCase().trim();
  return Boolean(
    r.checkoutDone ||
    r.earlyCheckout ||
    st === "completed" ||
    st === "checked_out" ||
    st === "checkout" ||
    isCancelledStatus(r)
  );
}

function isPreReservationBlockedLocal(r) {
  if (!r) return false;
  const chan = String(r.channel || "").toLowerCase();
  const isOtaOrB2b =
    chan.includes("booking") ||
    chan.includes("airbnb") ||
    chan === "b2b" ||
    chan.includes("b2b") ||
    Boolean(r.b2bReservationNumber);
  if (isOtaOrB2b) return false;
  const st = String(r.status || "").toLowerCase().trim();
  if (["pre_reserva", "pendente", "pending_payment", "expirada"].includes(st)) return true;
  if (st === "pre_reserva" && !r.pixEndToEndId && !r.mpPaymentId && !r.paidAt) return true;
  return false;
}

function hasGuestCompletedOrHadCheckinLocal(g, r = null) {
  if (!g) return false;
  const hasB2bCredOnly = Boolean(
    r &&
    (r.b2bCredentialCompletedAt || r.credentialStatus === "completed") &&
    !r.fnhrCompleted &&
    !r.checkedInAt &&
    !r.fnrhSignedAt &&
    !r.fnrhDocumentUuid &&
    !r.fnrhPdfUrl &&
    !r.fnrhSha256Hash &&
    !r.previousCheckinSignedAt &&
    !r.preCheckinSignedAt &&
    !r.preCheckinData?.signatureUrl &&
    !r.checkinData?.signatureUrl &&
    !r.checkinData?.termsSignature
  );
  if (hasB2bCredOnly) return false;
  return Boolean(
    g.hasCompletedCheckin ||
    g.hadCompletedCheckinBefore ||
    g.status === "CHECKED_IN" ||
    g.checkinCompletedAt ||
    g.previousCheckinSignedAt ||
    g.fnrhPdfUrl ||
    g.fnrhDownloadUrl ||
    g.fnrhDocumentUuid ||
    g.fnrhSha256Hash ||
    g.fnrhVerifyUrl ||
    g.fnrhFileName ||
    g.fnrhAuditTrail ||
    g.r2Url ||
    g.fnrhR2Url ||
    g.fnrhSignedAt
  );
}

function hasReservationCompletedAnyCheckinLocal(r) {
  if (!r || isClosedStayStatus(r)) return false;
  if (
    r.fnhrCompleted ||
    r.preCheckinCompleted ||
    r.hasPreCheckin ||
    r.hadCompletedCheckinBefore ||
    r.checkedInAt ||
    r.previousCheckinSignedAt ||
    r.preCheckinSignedAt ||
    r.preCheckinData?.signatureUrl ||
    r.checkinData?.signatureUrl ||
    r.checkinData?.termsSignature ||
    r.fnrhPdfUrl ||
    r.fnrhDownloadUrl ||
    r.fnrhDocumentUuid ||
    r.fnrhSha256Hash ||
    r.fnrhVerifyUrl ||
    r.fnrhFileName ||
    r.fnrhAuditTrail ||
    r.r2Url ||
    r.fnrhR2Url ||
    r.fnrhSignedAt
  ) {
    return true;
  }
  if (Array.isArray(r.guests) && r.guests.some((g) => hasGuestCompletedOrHadCheckinLocal(g, r))) {
    return true;
  }
  return false;
}

function defaultInvalidateReservationCheckinSignatures(r, reason = "Alteração de acomodação (flat) ou período da estadia") {
  if (!r) return { invalidated: false, reason };
  const stayClosed = isClosedStayStatus(r);
  const hadCheckinBefore = Boolean(!stayClosed && hasReservationCompletedAnyCheckinLocal(r) && !isPreReservationBlockedLocal(r));
  const prevResSigAt =
    r.fnrhSignedAt ||
    r.checkedInAt ||
    r.preCheckinSignedAt ||
    r.previousCheckinSignedAt ||
    r.guests?.[0]?.fnrhSignedAt ||
    r.guests?.[0]?.checkinCompletedAt ||
    getEffectiveDate().toISOString();

  r.fnhrCompleted = false;
  r.preCheckinCompleted = false;
  r.hasPreCheckin = false;
  r.signatureUrl = null;
  r.checkedInAt = null;
  if (hadCheckinBefore) {
    r.hadCompletedCheckinBefore = true;
    r.needsReSignature = true;
    r.reSignatureReason = reason;
    r.previousCheckinSignedAt = prevResSigAt;
  } else {
    r.hadCompletedCheckinBefore = false;
    r.needsReSignature = false;
    delete r.reSignatureReason;
    delete r.previousCheckinSignedAt;
  }

  delete r.fnrhPdfUrl;
  delete r.fnrhDownloadUrl;
  delete r.fnrhDocumentUuid;
  delete r.fnrhSha256Hash;
  delete r.fnrhVerifyUrl;
  delete r.fnrhSignedAt;
  delete r.fnrhAuditTrail;
  delete r.fnrhFileName;
  delete r.fnrhFilePath;
  delete r.r2Url;
  delete r.fnrhR2Url;

  if (r.status === "CHECKED_IN" || r.status === "checkin") {
    r.status = "confirmada";
  }

  if (Array.isArray(r.guests)) {
    r.guests.forEach((g) => {
      if (!g) return;
      const gHadCheckin = Boolean(!stayClosed && (hasGuestCompletedOrHadCheckinLocal(g, r) || hadCheckinBefore) && !isPreReservationBlockedLocal(r));
      const prevGSigAt = g.fnrhSignedAt || g.checkinCompletedAt || g.previousCheckinSignedAt || prevResSigAt;
      g.hasCompletedCheckin = false;
      if (g.status === "CHECKED_IN") g.status = "PENDING";
      g.checkinCompletedAt = null;
      g.signatureUrl = null;
      g.hadCompletedCheckinBefore = gHadCheckin;
      g.needsReSignature = gHadCheckin;
      if (gHadCheckin) {
        g.previousCheckinSignedAt = prevGSigAt;
      } else {
        delete g.previousCheckinSignedAt;
      }
      delete g.fnrhPdfUrl;
      delete g.fnrhDownloadUrl;
      delete g.fnrhDocumentUuid;
      delete g.fnrhSha256Hash;
      delete g.fnrhVerifyUrl;
      delete g.fnrhSignedAt;
      delete g.fnrhAuditTrail;
      delete g.fnrhFileName;
      delete g.fnrhFilePath;
      delete g.r2Url;
      delete g.fnrhR2Url;
    });
  }

  return { invalidated: hadCheckinBefore, reason };
}

function defaultSyncCleaningCardsForConfirmedReservation(db, r) {
  if (!db || !r) return { synced: false };
  if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
  const st = String(r.status || "").toLowerCase().trim();
  if (!st || ["pre_reserva", "cancelada", "cancelado", "cancelled", "expirada", "no_show", "pendente"].includes(st)) {
    return { synced: false, skipped: true };
  }

  const nowIso = getEffectiveDate().toISOString();
  const flatsList = getCanonicalFlats(db);
  const fNum = String(r.flatNumber || flatsList.find((f) => f && Number(f.id) === Number(r.flatId))?.number || "").trim();
  const flatObj = flatsList.find((f) => f && ((r.flatId != null && Number(f.id) === Number(r.flatId)) || (fNum && String(f.number) === fNum))) || null;
  const targetFlatId = r.flatId ?? flatObj?.id ?? null;

  const isSameFlat = (c) => Boolean(
    c &&
    !c.isDeleted &&
    c.status !== "deleted" &&
    ((fNum && String(c.flatNumber) === fNum) || (targetFlatId != null && Number(c.flatId) === Number(targetFlatId)))
  );
  const isInstCard = (c) => Boolean(
    c.isInstructionOnly ||
    c.source === "manual_instruction" ||
    c.type === "instruction" ||
    c.type === "bed_adjustment_only" ||
    c.isBedAdjustmentOnly
  );

  let updatedCheckinCard = null;
  let reactivatedCheckoutCard = null;

  if (r.checkinDate) {
    const normalOnCheckin =
      db.cleaningRequests.find((c) => isSameFlat(c) && c.requestDate === r.checkinDate && !isInstCard(c) && c.source !== "manual") ||
      db.cleaningRequests.find((c) => isSameFlat(c) && c.requestDate === r.checkinDate && !isInstCard(c));
    if (normalOnCheckin) {
      normalOnCheckin.autoReservationCode = r.code;
      normalOnCheckin.autoReservationId = r.id;
      normalOnCheckin.arrivingGuest = r.guestName || r.title || normalOnCheckin.arrivingGuest || null;
      normalOnCheckin.updatedAt = nowIso;
      updatedCheckinCard = normalOnCheckin;
    }
  }

  if (r.checkoutDate) {
    const deletedOnCheckout = db.cleaningRequests.find(
      (c) =>
        c &&
        ((fNum && String(c.flatNumber) === fNum) || (targetFlatId != null && Number(c.flatId) === Number(targetFlatId))) &&
        c.requestDate === r.checkoutDate &&
        (c.isDeleted || c.status === "deleted")
    );
    if (deletedOnCheckout) {
      deletedOnCheckout.isDeleted = false;
      deletedOnCheckout.status = "dirty";
      deletedOnCheckout.leavingGuest = r.guestName || deletedOnCheckout.leavingGuest || null;
      deletedOnCheckout.isVacant = false;
      deletedOnCheckout.isVacantExplicitlySet = false;
      deletedOnCheckout.vacantSource = null;
      delete deletedOnCheckout.deletedAt;
      delete deletedOnCheckout.deletedBy;
      delete deletedOnCheckout.deletedReservationId;
      deletedOnCheckout.updatedAt = nowIso;
      reactivatedCheckoutCard = deletedOnCheckout;
    }
  }

  return { synced: true, updatedCheckinCard, reactivatedCheckoutCard };
}

function appendAuditEntry(r, { action, actor = null, source = "PMS Troca de Flat", description = "", changes = [] } = {}) {
  if (!r) return;
  if (!Array.isArray(r.auditLogs)) r.auditLogs = [];
  const nowIso = getEffectiveDate().toISOString();
  const normalizedActor = {
    id: actor?.id || null,
    name: actor?.name || actor?.username || "Sistema",
    role: actor?.role || (actor?.name ? "user" : "system"),
    type: actor?.type || (actor?.name && actor?.name !== "Sistema" ? "user" : "system")
  };
  r.auditLogs.unshift({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: nowIso,
    action,
    actor: normalizedActor,
    source,
    description,
    changes: Array.isArray(changes) ? changes : []
  });
  r.lastModifiedBy = { timestamp: nowIso, actor: normalizedActor, source };
}

function resolveFlat(db, flatIdOrNumber) {
  if (flatIdOrNumber === null || flatIdOrNumber === undefined || flatIdOrNumber === "") return null;
  const flats = Array.isArray(db?.flats) && db.flats.length > 0 ? db.flats : CORPFLATS_19_FLATS;
  const raw = String(flatIdOrNumber).trim();
  const numVal = Number(flatIdOrNumber);
  return (
    flats.find((f) => f && Number.isFinite(numVal) && Number(f.id) === numVal) ||
    flats.find((f) => f && String(f.number).trim() === raw) ||
    CORPFLATS_19_FLATS.find((f) => Number.isFinite(numVal) && Number(f.id) === numVal) ||
    CORPFLATS_19_FLATS.find((f) => String(f.number).trim() === raw) ||
    null
  );
}

function resolveReservation(db, idOrCode) {
  if (idOrCode === null || idOrCode === undefined || idOrCode === "") return null;
  const list = Array.isArray(db?.reservations) ? db.reservations : [];
  const raw = String(idOrCode).trim();
  const upper = raw.toUpperCase();
  const numVal = Number(idOrCode);
  return (
    list.find((r) => r && Number.isFinite(numVal) && String(raw) === String(numVal) && Number(r.id) === numVal) ||
    list.find((r) => r && (String(r.code || "").toUpperCase() === upper || String(r.reservationCode || "").toUpperCase() === upper)) ||
    list.find((r) => r && String(r.id) === raw) ||
    null
  );
}

function diffNightsCount(checkinDate, checkoutDate) {
  const ci = normalizeDateStr(checkinDate);
  const co = normalizeDateStr(checkoutDate);
  if (!ci || !co || ci >= co) return 0;
  const ms = new Date(`${co}T12:00:00Z`).getTime() - new Date(`${ci}T12:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86400000));
}

function isCleaningFeeCharge(c) {
  return Boolean(c && (c.type === "cleaning" || /limpeza/i.test(String(c.title || ""))));
}
function isPetFeeCharge(c) {
  return Boolean(c && (c.type === "pet" || /\bpet\b|animal/i.test(String(c.title || ""))));
}
function isExtraBedFeeCharge(c) {
  return Boolean(c && (c.type === "extra_bed" || c.type === "extraBed" || /colch[aã]o|cama\s*extra/i.test(String(c.title || ""))));
}
function isTwinFeeCharge(c) {
  return Boolean(c && (c.type === "twin" || /solteiro|twin/i.test(String(c.title || ""))));
}
function isEarlyCheckinFeeCharge(c) {
  return Boolean(c && (c.type === "early_checkin" || c.type === "earlyCheckin" || /early|antecipad/i.test(String(c.title || ""))));
}
function isLateCheckoutFeeCharge(c) {
  return Boolean(c && (c.type === "late_checkout" || c.type === "lateCheckout" || /late|estendid|tardio/i.test(String(c.title || ""))));
}

function collectSegmentChargesList(r, fallbackIdPrefix = "seg") {
  const list = Array.isArray(r?.charges) ? r.charges.map((c) => ({ ...c })) : [];
  if (Number(r?.cleaningFee) > 0 && !list.some(isCleaningFeeCharge)) {
    list.push({ id: `charge_cleaning_${fallbackIdPrefix}`, type: "cleaning", title: "Taxa de Limpeza", amount: round2(r.cleaningFee) });
  }
  if (Number(r?.petFee) > 0 && !list.some(isPetFeeCharge)) {
    list.push({ id: `charge_pet_${fallbackIdPrefix}`, type: "pet", title: "Taxa Pet", amount: round2(r.petFee) });
  }
  if (Number(r?.extraBedFee) > 0 && !list.some(isExtraBedFeeCharge)) {
    list.push({ id: `charge_extrabed_${fallbackIdPrefix}`, type: "extra_bed", title: "Colchão Extra", amount: round2(r.extraBedFee) });
  }
  if (Number(r?.twinFee) > 0 && !list.some(isTwinFeeCharge)) {
    list.push({ id: `charge_twin_${fallbackIdPrefix}`, type: "twin", title: "Camas de Solteiro (Twin)", amount: round2(r.twinFee) });
  }
  if (Number(r?.earlyCheckinFee) > 0 && !list.some(isEarlyCheckinFeeCharge)) {
    list.push({ id: `charge_early_${fallbackIdPrefix}`, type: "early_checkin", title: "Taxa Early Check-in", amount: round2(r.earlyCheckinFee) });
  }
  if (Number(r?.lateCheckoutFee) > 0 && !list.some(isLateCheckoutFeeCharge)) {
    list.push({ id: `charge_late_${fallbackIdPrefix}`, type: "late_checkout", title: "Taxa Late Check-out", amount: round2(r.lateCheckoutFee) });
  }
  return list;
}

function computeSegmentChargesTotal(r) {
  const chargesList = collectSegmentChargesList(r, r?.id || "tmp");
  return round2(chargesList.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0));
}

function computeSegmentFinancials(r) {
  const chargesTotal = computeSegmentChargesTotal(r);
  const ratesSum =
    Array.isArray(r?.dailyRates) && r.dailyRates.length > 0
      ? round2(r.dailyRates.reduce((sum, d) => sum + (Number(d?.rate ?? d?.amount) || 0), 0))
      : 0;
  const rawTotal = r?.totalAmount != null ? round2(Number(r.totalAmount) || 0) : (r?.totalPrice != null ? round2(Number(r.totalPrice) || 0) : round2(ratesSum + chargesTotal));
  const accommodationTotal =
    ratesSum > 0 && (rawTotal <= 0 || Math.abs(rawTotal - (ratesSum + chargesTotal)) <= 0.05)
      ? ratesSum
      : round2(Math.max(0, rawTotal - chargesTotal));
  const totalAmount = rawTotal > 0 ? rawTotal : round2(accommodationTotal + chargesTotal);
  const paySt = String(r?.paymentStatus || "").toLowerCase().trim();
  const isSettledStatus = ["pago_total", "pago", "paid", "pago_integralmente"].includes(paySt);
  const explicitPaid = r?.paidAmount != null ? round2(Number(r.paidAmount) || 0) : (r?.amountPaid != null ? round2(Number(r.amountPaid) || 0) : null);
  const paidAmount = explicitPaid !== null ? explicitPaid : (isSettledStatus ? totalAmount : 0);
  const pendingAmount = round2(Math.max(0, totalAmount - paidAmount));
  return {
    accommodationTotal,
    chargesTotal,
    totalAmount,
    paidAmount,
    pendingAmount
  };
}

function buildCompleteDailyRatesForStay(r, checkinDate, checkoutDate, chargesTotal) {
  const nights = getNightsBetween(checkinDate, checkoutDate);
  if (nights.length === 0) return [];
  const existingMap = new Map();
  if (Array.isArray(r?.dailyRates)) {
    for (const d of r.dailyRates) {
      if (!d || !d.date) continue;
      const dt = normalizeDateStr(d.date);
      existingMap.set(dt, {
        ...d,
        date: dt,
        rate: round2(Number(d.rate ?? d.amount) || 0),
        channel: d.channel || r.channel || "direto"
      });
    }
  }

  const missingNights = nights.filter((dt) => !existingMap.has(dt));
  let missingBaseRate = round2(Number(r?.dailyRate) || 0);
  let missingLastRemainder = 0;

  if (missingNights.length > 0) {
    const existingCoveredSum = round2(
      nights.reduce((s, dt) => s + (existingMap.has(dt) ? existingMap.get(dt).rate : 0), 0)
    );
    const totalResAmt = round2(Number(r?.totalAmount ?? r?.totalPrice) || 0);
    const netAccomBudget = totalResAmt > 0 ? Math.max(0, round2(totalResAmt - chargesTotal - existingCoveredSum)) : 0;

    if (netAccomBudget > 0) {
      missingBaseRate = round2(Math.floor((netAccomBudget / missingNights.length) * 100) / 100);
      missingLastRemainder = round2(netAccomBudget - missingBaseRate * missingNights.length);
    } else if (missingBaseRate <= 0 && existingMap.size > 0) {
      const sumAllExisting = Array.from(existingMap.values()).reduce((s, d) => s + d.rate, 0);
      missingBaseRate = round2(sumAllExisting / existingMap.size);
    }
  }

  let missingIdx = 0;
  return nights.map((dt) => {
    if (existingMap.has(dt)) {
      return existingMap.get(dt);
    }
    const isLastMissing = missingIdx === missingNights.length - 1;
    missingIdx += 1;
    return {
      date: dt,
      rate: isLastMissing ? Math.max(0, round2(missingBaseRate + missingLastRemainder)) : missingBaseRate,
      channel: r?.channel || "direto"
    };
  });
}

function getEffectivePaidBefore(r, totalBefore) {
  const paymentsSum = Array.isArray(r?.payments)
    ? round2(r.payments.reduce((s, p) => s + (Number(p?.amount) || 0), 0))
    : 0;
  const rawField = round2(Math.max(Number(r?.paidAmount ?? r?.amountPaid) || 0, paymentsSum));
  const paySt = String(r?.paymentStatus || "").toLowerCase().trim();
  const isFaturado = Boolean(
    r?.isFaturadoBoleto ||
    ["boleto_faturado", "faturado_boleto", "boleto", "faturado_pj", "faturado_b2b"].includes(String(r?.paymentMethod || "").toLowerCase())
  );
  if (rawField <= 0 && !isFaturado && ["pago_total", "pago", "paid", "pago_integralmente"].includes(paySt) && totalBefore > 0) {
    return totalBefore;
  }
  return rawField;
}

function resolvePaymentStatusLabel(paidAmount, totalAmount) {
  const paid = round2(paidAmount);
  const total = round2(totalAmount);
  if (total <= 0) return paid > 0 ? "pago_total" : "pendente";
  if (paid >= total - 0.01) return "pago_total";
  if (paid > 0.009) return "sinal_pago";
  return "pendente";
}

function getFlatFeatureProfile(flat) {
  const colName = String(flat?.colName || flat?.name || "").toLowerCase();
  const tags = Array.isArray(flat?.tags) ? flat.tags : [];
  const tagsLower = tags.map((t) => String(t).toLowerCase());
  const numDigits = String(flat?.number || "").replace(/\D/g, "");
  const floor = Number(flat?.floor) || (numDigits.length >= 4 ? Number(numDigits.slice(0, 2)) : (numDigits.length >= 3 ? Number(numDigits.slice(0, 1)) : 0));

  let airConditionerType = flat?.airConditionerType ? String(flat.airConditionerType).toLowerCase() : "";
  if (!airConditionerType) {
    if (tagsLower.some((t) => t.includes("janela") || t.includes("parede")) || colName.includes("janela") || colName.includes("parede")) {
      airConditionerType = "janela";
    } else {
      airConditionerType = "split";
    }
  }

  let bedType = flat?.bedType ? String(flat.bedType).toLowerCase() : "";
  if (!bedType) {
    if (tagsLower.some((t) => t.includes("solteiro") || t.includes("twin") || t.includes("ferro unindo")) || colName.includes("solteiro") || colName.includes("ferro unindo")) {
      bedType = "2_solteiro";
    } else {
      bedType = "casal";
    }
  }

  const supportsTwinBeds = Boolean(
    bedType.includes("solteiro") ||
    bedType.includes("twin") ||
    flat?.allowTwinBeds === true ||
    tagsLower.some((t) => t.includes("solteiro") || t.includes("twin") || t.includes("ferro unindo")) ||
    colName.includes("solteiro") ||
    colName.includes("ferro unindo")
  );

  return {
    floor,
    airConditionerType,
    bedType,
    supportsTwinBeds
  };
}

function collectPreferenceWarnings(r, sourceFlat, targetFlat) {
  const warnings = [];
  if (!r || !targetFlat) return warnings;
  const targetProf = getFlatFeatureProfile(targetFlat);
  const sourceProf = sourceFlat ? getFlatFeatureProfile(sourceFlat) : null;
  const gName = r.guestName || "Hóspede";

  const wantsTwin = Boolean(r.twinBeds || r.bedType === "2 Solteiro" || r.bedType === "twin" || r.bedType === "2_solteiro");
  if (wantsTwin && !targetProf.supportsTwinBeds) {
    warnings.push(
      `Camas Solteiro: reserva de ${gName} solicita 2 camas de solteiro, mas o Flat ${targetFlat.number} é configurado como Cama de Casal.`
    );
  }

  if (r.prefersHighFloor) {
    const isLowFloor = targetProf.floor > 0 && targetProf.floor <= 5;
    const isDowngradeToLower = sourceProf && sourceProf.floor > 0 && targetProf.floor > 0 && targetProf.floor < sourceProf.floor && targetProf.floor <= 6;
    if (isLowFloor || isDowngradeToLower) {
      warnings.push(
        `Andar Alto: ${gName} possui preferência por andar alto, e o Flat ${targetFlat.number} está no ${targetProf.floor}º andar.`
      );
    }
  }

  const resAcPref = String(r.airConditionerType || r.preferredAirConditionerType || "").toLowerCase().trim();
  const textHints = `${r.specialRequests || ""} ${r.notes || ""}`.toLowerCase();
  const wantsSplit = resAcPref.includes("split") || /\bsplit\b/.test(textHints);
  const wantsJanela = resAcPref.includes("janela") || /\bjanela\b/.test(textHints);

  if (wantsSplit && targetProf.airConditionerType !== "split") {
    warnings.push(
      `Ar-condicionado: reserva de ${gName} indica preferência por Split, mas o Flat ${targetFlat.number} possui Ar de Janela.`
    );
  } else if (wantsJanela && targetProf.airConditionerType === "split") {
    warnings.push(
      `Ar-condicionado: reserva de ${gName} indica preferência por Janela, mas o Flat ${targetFlat.number} possui Ar Split.`
    );
  } else if (sourceProf && sourceProf.airConditionerType === "split" && targetProf.airConditionerType === "janela") {
    warnings.push(
      `Ar-condicionado: o Flat ${targetFlat.number} possui Ar-condicionado de Janela (o Flat ${sourceFlat.number} atual possui Split).`
    );
  }

  return warnings;
}

function findFlatConflictsForPeriod(db, { flatId, flatNumber, checkinDate, checkoutDate, excludeIds = [], deps = null }) {
  const conflicts = [];
  if (!checkinDate || !checkoutDate || checkinDate >= checkoutDate) return conflicts;

  const flatObj = resolveFlat(db, flatId ?? flatNumber) || { id: flatId, number: String(flatNumber || "") };
  const fId = flatObj.id;
  const fNum = String(flatObj.number || flatNumber || "");
  const excludeSet = new Set(excludeIds.filter((x) => x !== null && x !== undefined).map((x) => String(x)));
  const nowMs = getEffectiveDate().getTime();

  const matchesFlat = (objFlatId, objFlatNum) =>
    (fId != null && objFlatId != null && Number(objFlatId) === Number(fId)) ||
    (fNum && objFlatNum != null && String(objFlatNum) === fNum);

  // 1. Manutenção permanente / bloqueio operacional do flat
  if (
    flatObj.isActive === false ||
    flatObj.status === "manutencao_bloqueada" ||
    flatObj.status === "em_manutencao" ||
    flatObj.status === "bloqueado" ||
    flatObj.maintenanceStatus === "em_manutencao" ||
    flatObj.maintenanceStatus === "manutencao_bloqueada" ||
    flatObj.isBlocked === true ||
    flatObj.maintenanceBlocked === true
  ) {
    conflicts.push({
      type: "flat_maintenance",
      flatId: fId,
      flatNumber: fNum,
      checkinDate,
      checkoutDate,
      message: `Flat ${fNum} encontra-se bloqueado para manutenção.`
    });
  }

  // 2. Reservas ativas (incluindo deps.findActiveOverbookingConflicts se fornecido)
  const seenResConflictIds = new Set();
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  for (const r of reservations) {
    if (!r) continue;
    if (excludeSet.has(String(r.id)) || (r.code && excludeSet.has(String(r.code)))) continue;
    if (isCancelledStatus(r)) continue;
    const st = String(r.status || "").toLowerCase().trim();
    if ((st === "pre_reserva" || st === "pendente") && r.expiresAt) {
      const expMs = new Date(r.expiresAt).getTime();
      if (Number.isFinite(expMs) && expMs < nowMs && r.paymentStatus !== "pago_total" && r.paymentStatus !== "pago") {
        continue;
      }
    }
    if (!matchesFlat(r.flatId, r.flatNumber)) continue;
    if ((r.checkoutDone || r.earlyCheckout || st === "completed" || st === "checked_out") && r.checkoutDate <= checkinDate) {
      continue;
    }
    if (r.checkinDate < checkoutDate && r.checkoutDate > checkinDate) {
      seenResConflictIds.add(String(r.id));
      conflicts.push({
        type: "reservation",
        id: r.id,
        reservationId: r.id,
        code: r.code || r.reservationCode,
        guestName: r.guestName,
        flatId: fId,
        flatNumber: fNum,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        channel: r.channel,
        status: r.status,
        message: `Conflito no Flat ${fNum}: ocupado por ${r.guestName || "Hóspede"} (${r.code || "#" + r.id}: ${r.checkinDate} a ${r.checkoutDate}).`
      });
    }
  }

  if (typeof deps?.findActiveOverbookingConflicts === "function") {
    const depConflicts = deps.findActiveOverbookingConflicts(db, {
      flatId: fId,
      flatNumber: fNum,
      checkinDate,
      checkoutDate,
      excludeResId: excludeIds.length === 1 ? excludeIds[0] : null
    });
    if (Array.isArray(depConflicts)) {
      for (const c of depConflicts) {
        if (!c) continue;
        if (excludeSet.has(String(c.id)) || (c.code && excludeSet.has(String(c.code)))) continue;
        if (seenResConflictIds.has(String(c.id))) continue;
        seenResConflictIds.add(String(c.id));
        conflicts.push({
          type: "reservation",
          ...c,
          reservationId: c.id,
          flatId: fId,
          flatNumber: fNum,
          message: `Conflito no Flat ${fNum}: ocupado por ${c.guestName || "Hóspede"} (${c.code || "#" + c.id}: ${c.checkinDate} a ${c.checkoutDate}).`
        });
      }
    }
  }

  // 3. Holds provisórios (pendingModification)
  for (const r of reservations) {
    if (!r || !r.pendingModification) continue;
    if (excludeSet.has(String(r.id)) || (r.code && excludeSet.has(String(r.code)))) continue;
    const pm = r.pendingModification;
    if (!["pending", "pending_payment", "awaiting_payment"].includes(String(pm.status || "").toLowerCase())) continue;
    if (pm.expiresAt && new Date(pm.expiresAt).getTime() <= nowMs) continue;
    const pmFlatId = pm.newFlatId ?? pm.proposedFlatId ?? r.flatId;
    const pmFlatNum = pm.newFlatNumber ?? pm.proposedFlatNumber ?? r.flatNumber;
    if (!matchesFlat(pmFlatId, pmFlatNum)) continue;
    const pmIn = normalizeDateStr(pm.newCheckinDate || pm.proposedCheckinDate || r.checkinDate);
    const pmOut = normalizeDateStr(pm.newCheckoutDate || pm.proposedCheckoutDate || r.checkoutDate);
    if (pmIn < checkoutDate && pmOut > checkinDate) {
      conflicts.push({
        type: "hold",
        reservationId: r.id,
        code: r.code,
        guestName: r.guestName,
        flatId: fId,
        flatNumber: fNum,
        checkinDate: pmIn,
        checkoutDate: pmOut,
        message: `Flat ${fNum} possui alteração pendente para ${r.guestName || r.code} (${pmIn} a ${pmOut}).`
      });
    }
  }

  // 4. Bloqueios administrativos (db.roomBlocks)
  const roomBlocks = Array.isArray(db?.roomBlocks) ? db.roomBlocks : [];
  for (const b of roomBlocks) {
    if (!b || !matchesFlat(b.flatId, b.flatNumber)) continue;
    const bStart = normalizeDateStr(b.startDate);
    const bEnd = normalizeDateStr(b.endDate);
    if (!bStart || !bEnd) continue;
    const overlaps = bStart === bEnd ? (bStart >= checkinDate && bStart < checkoutDate) : (bStart < checkoutDate && bEnd > checkinDate);
    if (overlaps) {
      conflicts.push({
        type: "room_block",
        blockId: b.id,
        flatId: fId,
        flatNumber: fNum,
        startDate: bStart,
        endDate: bEnd,
        reason: b.reason || "Bloqueio administrativo",
        message: `Flat ${fNum} bloqueado (${b.reason || "Bloqueio administrativo"}: ${bStart} a ${bEnd}).`
      });
    }
  }

  // 5. Ordens de Serviço / Manutenção (db.serviceOrders)
  const serviceOrders = Array.isArray(db?.serviceOrders) ? db.serviceOrders : [];
  const todayStr = getTodayStrLocal();
  for (const order of serviceOrders) {
    if (!order) continue;
    const oSt = String(order.status || "").toLowerCase();
    if (["concluida", "concluido", "completed", "done", "cancelada", "cancelado", "cancelled", "resolvida", "fechada", "deleted"].includes(oSt)) {
      continue;
    }
    const oFlats = Array.isArray(order.flats) ? order.flats : [];
    for (const oflat of oFlats) {
      if (!oflat || !matchesFlat(oflat.flatId, oflat.flatNumber)) continue;
      const flSt = String(oflat.status || "in_progress").toLowerCase();
      const blocksFlat =
        flSt === "in_progress" ||
        flSt === "em_andamento" ||
        flSt === "active" ||
        ((flSt === "pending" || flSt === "pendente") && Boolean(order.blockFlats || order.interdictFlats));
      if (!blocksFlat) continue;
      const oStart = normalizeDateStr(oflat.startedAt || order.blockStartDate || order.startedAt || order.startDate || order.createdAt || todayStr);
      const oEnd = normalizeDateStr(oflat.estimatedFinishAt || order.blockEndDate || order.estimatedFinishAt || order.endDate || "");
      const overlaps = oEnd ? (oStart < checkoutDate && oEnd > checkinDate) : (oStart < checkoutDate);
      if (overlaps) {
        conflicts.push({
          type: "service_order",
          serviceOrderId: order.id,
          title: order.title || "Ordem de Serviço",
          flatId: fId,
          flatNumber: fNum,
          startDate: oStart,
          endDate: oEnd || null,
          message: `Flat ${fNum} bloqueado por Ordem de Serviço #${order.id} (${order.title || "Manutenção"}).`
        });
      }
    }
  }

  return conflicts;
}

function simulateMoveFinancialBreakdown(r, sourceFlat, targetFlat, cutDate, mode, upgradeAdjustmentAmount = 0) {
  const oldCheckin = normalizeDateStr(r.checkinDate);
  const oldCheckout = normalizeDateStr(r.checkoutDate);
  const shouldSplit = mode !== "move_whole" && oldCheckin < cutDate && cutDate < oldCheckout;
  const upgradeAmt = round2(Number(upgradeAdjustmentAmount) || 0);

  const beforeFin = computeSegmentFinancials(r);
  const totalNights = diffNightsCount(oldCheckin, oldCheckout);
  const fullDailyRates = buildCompleteDailyRatesForStay(r, oldCheckin, oldCheckout, beforeFin.chargesTotal);
  const effectivePaidBefore = getEffectivePaidBefore(r, beforeFin.totalAmount);

  const totalBefore = {
    nights: totalNights,
    accommodationAmount: beforeFin.accommodationTotal,
    chargesAmount: beforeFin.chargesTotal,
    totalAmount: beforeFin.totalAmount,
    paidAmount: effectivePaidBefore,
    pendingAmount: round2(Math.max(0, beforeFin.totalAmount - effectivePaidBefore))
  };

  if (!shouldSplit) {
    const afterCharges = round2(beforeFin.chargesTotal + upgradeAmt);
    const afterTotal = Math.max(0, round2(beforeFin.totalAmount + upgradeAmt));
    const afterPending = round2(Math.max(0, afterTotal - effectivePaidBefore));
    const part2 = {
      flatId: targetFlat.id,
      flatNumber: String(targetFlat.number),
      checkinDate: oldCheckin,
      checkoutDate: oldCheckout,
      nights: totalNights,
      accommodationAmount: beforeFin.accommodationTotal,
      chargesAmount: afterCharges,
      upgradeAdjustmentAmount: upgradeAmt,
      totalAmount: afterTotal,
      paidAmount: effectivePaidBefore,
      pendingAmount: afterPending
    };
    return {
      willSplit: false,
      mode: "move_whole",
      part1: null,
      part2,
      totalBefore,
      totalAfter: {
        nights: totalNights,
        accommodationAmount: beforeFin.accommodationTotal,
        chargesAmount: afterCharges,
        upgradeAdjustmentAmount: upgradeAmt,
        totalAmount: afterTotal,
        paidAmount: effectivePaidBefore,
        pendingAmount: afterPending
      }
    };
  }

  const pastRates = fullDailyRates.filter((d) => d.date < cutDate);
  const activeRates = fullDailyRates.filter((d) => d.date >= cutDate);
  const pastAccom = round2(pastRates.reduce((s, d) => s + (Number(d.rate) || 0), 0));
  const activeAccom = round2(activeRates.reduce((s, d) => s + (Number(d.rate) || 0), 0));
  const pastCharges = beforeFin.chargesTotal;
  const pastTotal = round2(pastAccom + pastCharges);
  const activeCharges = upgradeAmt;
  const activeTotal = Math.max(0, round2(activeAccom + activeCharges));

  const pastPaid = round2(Math.min(effectivePaidBefore, pastTotal));
  const activePaid = round2(Math.max(0, effectivePaidBefore - pastPaid));

  const part1 = {
    flatId: sourceFlat?.id ?? r.flatId,
    flatNumber: String(sourceFlat?.number ?? r.flatNumber ?? ""),
    checkinDate: oldCheckin,
    checkoutDate: cutDate,
    nights: pastRates.length,
    accommodationAmount: pastAccom,
    chargesAmount: pastCharges,
    totalAmount: pastTotal,
    paidAmount: pastPaid,
    pendingAmount: round2(Math.max(0, pastTotal - pastPaid))
  };

  const part2 = {
    flatId: targetFlat.id,
    flatNumber: String(targetFlat.number),
    checkinDate: cutDate,
    checkoutDate: oldCheckout,
    nights: activeRates.length,
    accommodationAmount: activeAccom,
    chargesAmount: activeCharges,
    upgradeAdjustmentAmount: upgradeAmt,
    totalAmount: activeTotal,
    paidAmount: activePaid,
    pendingAmount: round2(Math.max(0, activeTotal - activePaid))
  };

  return {
    willSplit: true,
    mode: "split",
    part1,
    part2,
    totalBefore,
    totalAfter: {
      nights: pastRates.length + activeRates.length,
      accommodationAmount: round2(pastAccom + activeAccom),
      chargesAmount: round2(pastCharges + activeCharges),
      upgradeAdjustmentAmount: upgradeAmt,
      totalAmount: round2(pastTotal + activeTotal),
      paidAmount: round2(pastPaid + activePaid),
      pendingAmount: round2(Math.max(0, pastTotal + activeTotal - (pastPaid + activePaid)))
    }
  };
}

function moveFinalCheckoutCleaningCard(db, { fromFlatId, fromFlatNumber, toFlatId, toFlatNumber, checkoutDate, reservation }) {
  if (!Array.isArray(db.cleaningRequests) || !checkoutDate) return;
  const nowIso = getEffectiveDate().toISOString();
  const isNotInstruction = (c) =>
    !c.isInstructionOnly &&
    c.source !== "manual_instruction" &&
    c.type !== "instruction" &&
    c.type !== "bed_adjustment_only" &&
    !c.isBedAdjustmentOnly;

  const isFromFlat = (c) =>
    (fromFlatId != null && Number(c.flatId) === Number(fromFlatId)) ||
    (fromFlatNumber && String(c.flatNumber) === String(fromFlatNumber));

  const isToFlat = (c) =>
    (toFlatId != null && Number(c.flatId) === Number(toFlatId)) ||
    (toFlatNumber && String(c.flatNumber) === String(toFlatNumber));

  const sourceCard = db.cleaningRequests.find(
    (c) =>
      c &&
      !c.isDeleted &&
      c.status !== "deleted" &&
      c.requestDate === checkoutDate &&
      isFromFlat(c) &&
      isNotInstruction(c) &&
      !c.isRoomMoveCheckout &&
      (c.checkoutReservationId == null || Number(c.checkoutReservationId) === Number(reservation.id))
  );

  const existingCleanTarget = db.cleaningRequests.find(
    (c) =>
      c &&
      !c.isDeleted &&
      c.status !== "deleted" &&
      c.requestDate === checkoutDate &&
      isToFlat(c) &&
      isNotInstruction(c) &&
      c.status === "clean"
  );

  const existingTargetCard = db.cleaningRequests.find(
    (c) =>
      c &&
      !c.isDeleted &&
      c.status !== "deleted" &&
      c.requestDate === checkoutDate &&
      isToFlat(c) &&
      isNotInstruction(c)
  );

  if (existingCleanTarget) {
    if (sourceCard && sourceCard.status !== "clean") {
      db.cleaningRequests = db.cleaningRequests.filter((c) => c !== sourceCard);
    }
    return;
  }

  if (sourceCard && sourceCard.status !== "clean") {
    if (existingTargetCard) {
      existingTargetCard.leavingGuest = reservation.guestName || existingTargetCard.leavingGuest;
      existingTargetCard.checkoutReservationId = reservation.id;
      existingTargetCard.checkoutReservationCode = reservation.code;
      existingTargetCard.updatedAt = nowIso;
      db.cleaningRequests = db.cleaningRequests.filter((c) => c !== sourceCard);
    } else {
      sourceCard.flatId = toFlatId;
      sourceCard.flatNumber = String(toFlatNumber);
      sourceCard.leavingGuest = reservation.guestName || sourceCard.leavingGuest;
      sourceCard.checkoutReservationId = reservation.id;
      sourceCard.checkoutReservationCode = reservation.code;
      sourceCard.updatedAt = nowIso;
    }
    return;
  }

  if (!existingTargetCard) {
    const deletedTarget = db.cleaningRequests.find(
      (c) =>
        c &&
        (c.isDeleted || c.status === "deleted") &&
        c.requestDate === checkoutDate &&
        isToFlat(c) &&
        isNotInstruction(c)
    );
    if (deletedTarget) {
      deletedTarget.isDeleted = false;
      deletedTarget.status = "dirty";
      deletedTarget.leavingGuest = reservation.guestName || deletedTarget.leavingGuest || null;
      deletedTarget.checkoutReservationId = reservation.id;
      deletedTarget.checkoutReservationCode = reservation.code;
      deletedTarget.isVacant = false;
      deletedTarget.isVacantExplicitlySet = false;
      deletedTarget.vacantSource = null;
      delete deletedTarget.deletedAt;
      delete deletedTarget.deletedBy;
      delete deletedTarget.deletedReservationId;
      deletedTarget.updatedAt = nowIso;
    } else {
      const maxCleanId = db.cleaningRequests.reduce((m, c) => Math.max(m, Number(c?.id) || 0), 0);
      db.cleaningRequests.push({
        id: maxCleanId + 1,
        flatId: toFlatId,
        flatNumber: String(toFlatNumber),
        requestDate: checkoutDate,
        source: "checkout",
        status: "dirty",
        assignedUserId: null,
        assignedUsername: null,
        isVacant: false,
        isPriority: Boolean(reservation.isPriority),
        leavingGuest: reservation.guestName || null,
        arrivingGuest: null,
        checkoutReservationId: reservation.id,
        checkoutReservationCode: reservation.code,
        adminNote: null,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
  }
}

function upsertRoomMoveCutoffCleaningCard(db, { flatId, flatNumber, cutDate, leavingGuest, arrivingGuest = null, pastSegment, activePartnerRes = null, targetFlatNumber, groupId }) {
  if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
  const nowIso = getEffectiveDate().toISOString();
  const isNotInstruction = (c) =>
    !c.isInstructionOnly &&
    c.source !== "manual_instruction" &&
    c.type !== "instruction" &&
    c.type !== "bed_adjustment_only" &&
    !c.isBedAdjustmentOnly;

  const existing = db.cleaningRequests.find(
    (c) =>
      c &&
      ((flatId != null && Number(c.flatId) === Number(flatId)) || String(c.flatNumber) === String(flatNumber)) &&
      c.requestDate === cutDate &&
      isNotInstruction(c)
  );

  const note = `🔄 Saída por troca p/ Flat ${targetFlatNumber}`;

  if (existing) {
    existing.isDeleted = false;
    existing.status = "dirty";
    existing.source = "checkout";
    existing.isRoomMoveCheckout = true;
    existing.isVacant = false;
    existing.leavingGuest = leavingGuest || existing.leavingGuest || null;
    if (arrivingGuest !== null) existing.arrivingGuest = arrivingGuest;
    if (activePartnerRes) {
      existing.autoReservationId = activePartnerRes.id;
      existing.autoReservationCode = activePartnerRes.code;
    }
    if (pastSegment) {
      existing.checkoutReservationId = pastSegment.id;
      existing.checkoutReservationCode = pastSegment.code;
    }
    existing.roomMoveGroupId = groupId || existing.roomMoveGroupId;
    existing.adminNote = note;
    existing.pendingObservation = note;
    delete existing.deletedAt;
    delete existing.deletedBy;
    delete existing.deletedReservationId;
    existing.updatedAt = nowIso;
    return existing;
  }

  const maxCleanId = db.cleaningRequests.reduce((m, c) => Math.max(m, Number(c?.id) || 0), 0);
  const newCard = {
    id: maxCleanId + 1,
    flatId,
    flatNumber: String(flatNumber),
    requestDate: cutDate,
    source: "checkout",
    status: "dirty",
    assignedUserId: null,
    assignedUsername: null,
    isVacant: false,
    isPriority: Boolean(activePartnerRes),
    isRoomMoveCheckout: true,
    leavingGuest: leavingGuest || null,
    arrivingGuest: arrivingGuest || null,
    autoReservationId: activePartnerRes ? activePartnerRes.id : null,
    autoReservationCode: activePartnerRes ? activePartnerRes.code : null,
    checkoutReservationId: pastSegment ? pastSegment.id : null,
    checkoutReservationCode: pastSegment ? pastSegment.code : null,
    roomMoveGroupId: groupId || null,
    adminNote: note,
    pendingObservation: note,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  db.cleaningRequests.push(newCard);
  return newCard;
}

function syncBreakfastOrdersForRoomMove(db, reservation, { targetFlat, cutDate, shouldSplit }) {
  if (!Array.isArray(db?.breakfastOrders) || !reservation) return 0;
  const nowIso = getEffectiveDate().toISOString();
  const targetNum = String(targetFlat.number);
  let updatedCount = 0;

  for (const o of db.breakfastOrders) {
    if (!o) continue;
    const matchesById = o.reservationId != null && Number(o.reservationId) === Number(reservation.id);
    const matchesByCode = Boolean(
      o.reservationCode &&
      ((reservation.code && String(o.reservationCode) === String(reservation.code)) ||
        (reservation.reservationCode && String(o.reservationCode) === String(reservation.reservationCode)))
    );
    if (!matchesById && !matchesByCode) continue;

    const orderDate = normalizeDateStr(o.date);
    const st = String(o.status || "").toLowerCase().trim();
    const isMovableStatus = st === "pending" || st === "scheduled";

    let shouldMoveOrder = false;
    if (shouldSplit) {
      shouldMoveOrder = orderDate > cutDate || (orderDate === cutDate && isMovableStatus);
    } else {
      shouldMoveOrder = orderDate > cutDate || isMovableStatus || normalizeDateStr(reservation.checkinDate) >= cutDate;
    }

    if (shouldMoveOrder) {
      o.roomNumber = targetNum;
      o.flatNumber = targetNum;
      if (o.flatId !== undefined || targetFlat.id != null) o.flatId = targetFlat.id;
      o.updatedAt = nowIso;
      updatedCount += 1;
    }
  }
  return updatedCount;
}

function mutateSingleReservationMove(db, r, {
  targetFlat,
  cutDate,
  shouldSplit,
  upgradeAdjustmentAmount = 0,
  upgradeAdjustmentNote = "",
  reason = "",
  actor = null,
  source = "PMS Troca de Flat",
  todayStr,
  nowIso,
  deps = {}
}) {
  const oldCheckin = normalizeDateStr(r.checkinDate);
  const oldCheckout = normalizeDateStr(r.checkoutDate);
  const oldFlatId = r.flatId;
  const oldFlatNumber = String(r.flatNumber || "");
  const targetFlatNumber = String(targetFlat.number);
  const upgradeAmt = round2(Number(upgradeAdjustmentAmount) || 0);
  const invalidateFn = deps?.invalidateReservationCheckinSignatures || defaultInvalidateReservationCheckinSignatures;

  if (!shouldSplit) {
    const beforeCharges = collectSegmentChargesList(r, r.id);
    const beforeFin = computeSegmentFinancials(r);
    const hadCheckin = hasReservationCompletedAnyCheckinLocal(r);

    invalidateFn(r, `Troca de flat do Flat ${oldFlatNumber} para Flat ${targetFlatNumber}`);

    r.flatId = targetFlat.id;
    r.flatNumber = targetFlatNumber;
    r.transferredFromFlatId = oldFlatId;
    r.transferredFromFlatNumber = oldFlatNumber;
    r.roomMovedAt = nowIso;
    r.roomMoveReason = reason || "";
    delete r.roomReadySentDate;
    delete r.roomReadySentAt;

    if (upgradeAmt !== 0) {
      r.charges = beforeCharges;
      r.charges.push({
        id: `chg_upgrade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "upgrade_adjustment",
        title: upgradeAdjustmentNote || (upgradeAmt > 0 ? `Diferença de Tarifa / Upgrade (Flat ${targetFlatNumber})` : `Ajuste / Desconto de Troca (Flat ${targetFlatNumber})`),
        amount: upgradeAmt,
        flatNumber: targetFlatNumber,
        cutDate
      });
      const newTotal = Math.max(0, round2(beforeFin.totalAmount + upgradeAmt));
      const paidBefore = getEffectivePaidBefore(r, beforeFin.totalAmount);
      r.totalAmount = newTotal;
      r.totalPrice = newTotal;
      r.paidAmount = paidBefore;
      r.amountPaid = paidBefore;
      r.paymentStatus = resolvePaymentStatusLabel(paidBefore, newTotal);
    }

    const changes = [
      { field: "flatNumber", label: "Apartamento", oldValue: `Flat ${oldFlatNumber}`, newValue: `Flat ${targetFlatNumber}` }
    ];

    appendAuditEntry(r, {
      action: "room_move_whole",
      actor,
      source,
      description: `Troca integral de apartamento: Flat ${oldFlatNumber} → Flat ${targetFlatNumber}${reason ? ` (${reason})` : ""}`,
      changes
    });
    r.updatedAt = nowIso;

    return {
      rPast: null,
      shouldSplit: false,
      oldFlatId,
      oldFlatNumber,
      oldCheckin,
      oldCheckout,
      hadCheckinBefore: hadCheckin,
      changes
    };
  }

  // ── SPLIT (Corte no meio da estadia) ───────────────────────────────────────
  const groupId = r.roomMoveGroupId || `RMG-${String(r.code || `RES-${r.id}`).toUpperCase()}`;
  const existingSegments = getRoomMoveGroupReservations(db, groupId);
  const historicalCount = existingSegments.filter((s) => s && s.isRoomMoveHistoricalSegment).length;
  const nextLegIndex = historicalCount + 1;
  const baseCode = String(r.code || `RES-${r.id}`).replace(/-T\d+$/i, "");
  let pastCode = `${baseCode}-T${nextLegIndex}`;
  if ((db.reservations || []).some((x) => x && String(x.code || "").toUpperCase() === pastCode.toUpperCase())) {
    pastCode = `${baseCode}-T${nextLegIndex}-${Math.floor(100 + Math.random() * 900)}`;
  }

  const maxId = (db.reservations || []).reduce((m, x) => Math.max(m, Number(x?.id) || 0), 0);
  const pastId = maxId + 1;
  const pastLegIndex = Number(r.roomMoveIndex) || nextLegIndex;
  const activeLegIndex = pastLegIndex + 1;
  const totalLegs = Math.max(existingSegments.length + 1, activeLegIndex);

  // 1. Clona r ANTES de qualquer mutação para preservar FNRH assinada e dados originais
  const rPast = cloneDeep(r);
  const originalPreMoveStatus = r.status;
  const hadCheckinBefore = hasReservationCompletedAnyCheckinLocal(r);

  // 2. Rateio estrito de diárias, taxas e pagamentos
  const allPriorCharges = collectSegmentChargesList(r, pastId);
  const pastChargesSum = round2(allPriorCharges.reduce((s, c) => s + (Number(c?.amount) || 0), 0));
  const beforeFin = computeSegmentFinancials(r);
  const effectivePaidBefore = getEffectivePaidBefore(r, beforeFin.totalAmount);
  const fullDailyRates = buildCompleteDailyRatesForStay(r, oldCheckin, oldCheckout, pastChargesSum);

  const pastDailyRates = fullDailyRates.filter((d) => d.date < cutDate);
  const activeDailyRates = fullDailyRates.filter((d) => d.date >= cutDate);
  const pastRatesSum = round2(pastDailyRates.reduce((s, d) => s + (Number(d.rate ?? d.amount) || 0), 0));
  const activeRatesSum = round2(activeDailyRates.reduce((s, d) => s + (Number(d.rate ?? d.amount) || 0), 0));

  const pastTotal = round2(pastRatesSum + pastChargesSum);
  const pastPaid = round2(Math.min(effectivePaidBefore, pastTotal));
  const pastPayStatus = resolvePaymentStatusLabel(pastPaid, pastTotal);

  const activeCharges = [];
  if (upgradeAmt !== 0) {
    activeCharges.push({
      id: `chg_upgrade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "upgrade_adjustment",
      title: upgradeAdjustmentNote || (upgradeAmt > 0 ? `Diferença de Tarifa / Upgrade (Flat ${targetFlatNumber})` : `Ajuste / Desconto de Troca (Flat ${targetFlatNumber})`),
      amount: upgradeAmt,
      flatNumber: targetFlatNumber,
      cutDate
    });
  }
  const activeChargesSum = round2(activeCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const activeTotal = Math.max(0, round2(activeRatesSum + activeChargesSum));
  const activePaid = round2(Math.max(0, effectivePaidBefore - pastPaid));
  const activePayStatus = resolvePaymentStatusLabel(activePaid, activeTotal);

  // 3. Configura segmento histórico (rPast — Parte 1)
  rPast.id = pastId;
  rPast.code = pastCode;
  rPast.reservationCode = pastCode;
  rPast.roomMoveGroupId = groupId;
  rPast.roomMoveIndex = pastLegIndex;
  rPast.roomMoveTotal = totalLegs;
  rPast.isRoomMoveHistoricalSegment = true;
  rPast.isRoomMoveActiveSegment = false;
  rPast.activeReservationId = r.id;
  rPast.activeReservationCode = r.code;
  rPast.transferredToFlatId = targetFlat.id;
  rPast.transferredToFlatNumber = targetFlatNumber;
  rPast.roomMoveCutDate = cutDate;
  rPast.roomMovedAt = nowIso;
  rPast.roomMoveReason = reason || "";
  rPast.originalPreMoveStatus = originalPreMoveStatus;
  rPast.checkinDate = oldCheckin;
  rPast.checkoutDate = cutDate;
  rPast.status = cutDate <= todayStr ? "completed" : "confirmada";
  rPast.checkoutDone = cutDate <= todayStr;
  rPast.actualCheckoutAt = cutDate <= todayStr ? nowIso : null;
  rPast.checkoutMethod = "room_transfer";

  rPast.dailyRates = pastDailyRates;
  rPast.dailyRate = pastDailyRates.length > 0 ? round2(pastRatesSum / pastDailyRates.length) : 0;
  rPast.charges = allPriorCharges;
  rPast.totalAmount = pastTotal;
  rPast.totalPrice = pastTotal;
  rPast.paidAmount = pastPaid;
  rPast.amountPaid = pastPaid;
  rPast.paymentStatus = pastPayStatus;
  rPast.payments = pastPaid > 0
    ? [{
        id: `pay_split_p1_${pastId}`,
        amount: pastPaid,
        method: r.paymentMethod || "pix",
        date: r.paidAt || nowIso,
        notes: `Rateio Parte 1 (Flat ${oldFlatNumber}: ${oldCheckin} a ${cutDate})`
      }]
    : [];

  // Move IDs externos OTA em rPast para origin* para Channex nunca enxergar 2 quartos
  if (rPast.channexBookingId !== undefined && rPast.channexBookingId !== null) {
    rPast.originChannexBookingId = rPast.channexBookingId;
    delete rPast.channexBookingId;
  }
  if (rPast.externalOrderId !== undefined && rPast.externalOrderId !== null) {
    rPast.originExternalOrderId = rPast.externalOrderId;
    delete rPast.externalOrderId;
  }
  if (rPast.parentExternalOrderId !== undefined && rPast.parentExternalOrderId !== null) {
    rPast.originParentExternalOrderId = rPast.parentExternalOrderId;
    delete rPast.parentExternalOrderId;
  }
  if (rPast.wbpBookingId !== undefined && rPast.wbpBookingId !== null) {
    rPast.originWbpBookingId = rPast.wbpBookingId;
    delete rPast.wbpBookingId;
  }
  if (rPast.otaReservationCode !== undefined && rPast.otaReservationCode !== null) {
    rPast.originOtaReservationCode = rPast.otaReservationCode;
    delete rPast.otaReservationCode;
  }
  if (rPast.ota_reservation_code !== undefined && rPast.ota_reservation_code !== null) {
    rPast.originOtaReservationCode = rPast.originOtaReservationCode || rPast.ota_reservation_code;
    delete rPast.ota_reservation_code;
  }
  if (rPast.channexRevisionId !== undefined && rPast.channexRevisionId !== null) {
    rPast.originChannexRevisionId = rPast.channexRevisionId;
    delete rPast.channexRevisionId;
  }

  appendAuditEntry(rPast, {
    action: "room_move_segment_created",
    actor,
    source,
    description: `Segmento histórico criado por troca de flat (Flat ${oldFlatNumber} ${oldCheckin}..${cutDate} → Flat ${targetFlatNumber})`,
    changes: [{ field: "checkoutDate", label: "Data de Corte", oldValue: oldCheckout, newValue: cutDate }]
  });
  rPast.updatedAt = nowIso;

  // 4. Invalida FNRH de r ANTES de atualizar flat/datas (preservando dados pessoais do hóspede)
  invalidateFn(r, `Troca de flat do Flat ${oldFlatNumber} para Flat ${targetFlatNumber} a partir de ${cutDate}`);

  // 5. Atualiza r (Parte 2 — segmento ativo no flat de destino)
  r.flatId = targetFlat.id;
  r.flatNumber = targetFlatNumber;
  r.checkinDate = cutDate;
  r.originalStayCheckinDate = r.originalStayCheckinDate || oldCheckin;
  r.previousCheckinDate = oldCheckin;
  r.transferredFromFlatId = oldFlatId;
  r.transferredFromFlatNumber = oldFlatNumber;
  r.previousSegmentReservationId = rPast.id;
  r.previousSegmentReservationCode = rPast.code;
  r.roomMoveGroupId = groupId;
  r.roomMoveIndex = activeLegIndex;
  r.roomMoveTotal = totalLegs;
  r.roomMoveCutDate = cutDate;
  r.roomMovedAt = nowIso;
  r.roomMoveReason = reason || "";
  r.isRoomMoveActiveSegment = true;
  r.isRoomMoveHistoricalSegment = false;

  if (cutDate > todayStr) {
    r.status = "confirmada";
  }

  r.welcomeKitConsumption = {};
  delete r.roomReadySentDate;
  delete r.roomReadySentAt;

  r.dailyRates = activeDailyRates;
  r.dailyRate = activeDailyRates.length > 0 ? round2(activeRatesSum / activeDailyRates.length) : 0;
  r.charges = activeCharges;
  r.cleaningFee = 0;
  r.petFee = 0;
  r.extraBedFee = 0;
  r.twinFee = 0;
  r.earlyCheckinFee = 0;
  r.lateCheckoutFee = 0;

  r.totalAmount = activeTotal;
  r.totalPrice = activeTotal;
  r.paidAmount = activePaid;
  r.amountPaid = activePaid;
  r.paymentStatus = activePayStatus;
  r.payments = activePaid > 0
    ? [{
        id: `pay_split_p2_${r.id}`,
        amount: activePaid,
        method: r.paymentMethod || "pix",
        date: r.paidAt || nowIso,
        notes: `Rateio Parte 2 (Flat ${targetFlatNumber}: ${cutDate} a ${oldCheckout})`
      }]
    : [];

  if (activePaid < activeTotal - 0.01) {
    r.pixCopiaECola = "";
    r.pixChargedAmount = 0;
    r.mpInitPoint = null;
    r.mpPreferenceId = null;
    r.mpChargedAmount = null;
  }

  // Atualiza roomMoveTotal em eventuais segmentos anteriores do mesmo grupo
  for (const prevSeg of existingSegments) {
    if (prevSeg && prevSeg.id !== r.id && prevSeg.id !== rPast.id) {
      prevSeg.roomMoveTotal = totalLegs;
      prevSeg.activeReservationId = r.id;
      prevSeg.activeReservationCode = r.code;
    }
  }

  if (!Array.isArray(db.reservations)) db.reservations = [];
  db.reservations.push(rPast);

  const changes = [
    { field: "flatNumber", label: "Apartamento", oldValue: `Flat ${oldFlatNumber}`, newValue: `Flat ${targetFlatNumber}` },
    { field: "checkinDate", label: "Data de Entrada do Segmento", oldValue: oldCheckin, newValue: cutDate }
  ];

  appendAuditEntry(r, {
    action: "room_move_split",
    actor,
    source,
    description: `Troca de flat com corte em ${cutDate}: Flat ${oldFlatNumber} (${oldCheckin}..${cutDate}, seg. ${rPast.code}) → Flat ${targetFlatNumber} (${cutDate}..${oldCheckout})${reason ? ` — Motivo: ${reason}` : ""}`,
    changes
  });
  r.updatedAt = nowIso;

  return {
    rPast,
    shouldSplit: true,
    oldFlatId,
    oldFlatNumber,
    oldCheckin,
    oldCheckout,
    hadCheckinBefore,
    changes
  };
}

// ── Exported API ─────────────────────────────────────────────────────────────

export function isRoomMoveGroupMember(reservation) {
  if (!reservation || typeof reservation !== "object") return false;
  return Boolean(
    reservation.roomMoveGroupId ||
    reservation.isRoomMoveHistoricalSegment ||
    reservation.isRoomMoveActiveSegment ||
    reservation.previousSegmentReservationId ||
    reservation.activeReservationId
  );
}

export function getRoomMoveGroupReservations(db, groupIdOrRes) {
  if (!groupIdOrRes) return [];
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

  let groupId = "";
  let anchorRes = null;

  if (typeof groupIdOrRes === "object") {
    anchorRes = groupIdOrRes;
    groupId = String(groupIdOrRes.roomMoveGroupId || "").trim();
  } else {
    const rawStr = String(groupIdOrRes).trim();
    if (!rawStr) return [];
    const byGroup = reservations.filter((r) => r && String(r.roomMoveGroupId || "").trim().toUpperCase() === rawStr.toUpperCase());
    if (byGroup.length > 0) {
      groupId = String(byGroup[0].roomMoveGroupId || "").trim();
    } else {
      anchorRes = resolveReservation(db, rawStr);
      groupId = String(anchorRes?.roomMoveGroupId || "").trim();
    }
  }

  let matched = [];
  if (groupId) {
    matched = reservations.filter((r) => r && String(r.roomMoveGroupId || "").trim() === groupId);
  }
  if (matched.length === 0 && anchorRes) {
    matched = [anchorRes];
  }

  return [...matched].sort((a, b) => {
    const ciA = normalizeDateStr(a?.checkinDate);
    const ciB = normalizeDateStr(b?.checkinDate);
    if (ciA !== ciB) return ciA.localeCompare(ciB);
    const idxA = Number(a?.roomMoveIndex) || 0;
    const idxB = Number(b?.roomMoveIndex) || 0;
    if (idxA !== idxB) return idxA - idxB;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
}

export function getActiveRoomMoveReservation(db, groupIdOrRes) {
  const segments = getRoomMoveGroupReservations(db, groupIdOrRes);
  if (segments.length === 0) return null;

  const nonCancelled = segments.filter((r) => r && !isCancelledStatus(r));
  const pool = nonCancelled.length > 0 ? nonCancelled : segments;

  const explicitActive = pool.find((r) => !r.isRoomMoveHistoricalSegment && r.isRoomMoveActiveSegment);
  if (explicitActive) return explicitActive;

  const nonHistorical = pool.find((r) => !r.isRoomMoveHistoricalSegment);
  if (nonHistorical) return nonHistorical;

  return pool[pool.length - 1] || null;
}

export function computeRoomMoveConsolidatedSummary(db, groupIdOrRes) {
  const segments = getRoomMoveGroupReservations(db, groupIdOrRes);
  if (segments.length === 0) return null;

  const nonCancelled = segments.filter((r) => r && !isCancelledStatus(r));
  const activeSegments = nonCancelled.length > 0 ? nonCancelled : segments;

  const activeReservation = getActiveRoomMoveReservation(db, groupIdOrRes) || activeSegments[activeSegments.length - 1];
  const firstSegment = activeSegments[0];
  const roomMoveGroupId =
    activeReservation?.roomMoveGroupId ||
    firstSegment?.roomMoveGroupId ||
    (typeof groupIdOrRes === "string" ? groupIdOrRes : null);

  const originalCheckinDate = activeSegments.reduce((min, s) => {
    const ci = normalizeDateStr(s.checkinDate);
    return ci && (!min || ci < min) ? ci : min;
  }, normalizeDateStr(firstSegment?.originalStayCheckinDate || firstSegment?.checkinDate)) || null;

  const finalCheckoutDate = activeSegments.reduce((max, s) => {
    const co = normalizeDateStr(s.checkoutDate);
    return co && (!max || co > max) ? co : max;
  }, normalizeDateStr(activeReservation?.checkoutDate || firstSegment?.checkoutDate)) || null;

  let totalNights = 0;
  let accommodationTotal = 0;
  let chargesTotal = 0;
  let totalAmount = 0;
  let paidAmount = 0;

  const flatTrail = activeSegments.map((s, idx) => {
    const fin = computeSegmentFinancials(s);
    const nights = diffNightsCount(s.checkinDate, s.checkoutDate);
    totalNights += nights;
    accommodationTotal = round2(accommodationTotal + fin.accommodationTotal);
    chargesTotal = round2(chargesTotal + fin.chargesTotal);
    totalAmount = round2(totalAmount + fin.totalAmount);
    paidAmount = round2(paidAmount + fin.paidAmount);

    return {
      reservationId: s.id,
      code: s.code,
      flatId: s.flatId,
      flatNumber: String(s.flatNumber || ""),
      checkinDate: normalizeDateStr(s.checkinDate),
      checkoutDate: normalizeDateStr(s.checkoutDate),
      nights,
      roomMoveIndex: Number(s.roomMoveIndex) || idx + 1,
      isHistorical: Boolean(s.isRoomMoveHistoricalSegment),
      isActive: !s.isRoomMoveHistoricalSegment,
      accommodationAmount: fin.accommodationTotal,
      chargesAmount: fin.chargesTotal,
      totalAmount: fin.totalAmount,
      paidAmount: fin.paidAmount,
      pendingAmount: fin.pendingAmount
    };
  });

  const pendingAmount = round2(Math.max(0, totalAmount - paidAmount));
  const isFullyPaid = totalAmount > 0 ? pendingAmount <= 0.01 : true;

  return {
    roomMoveGroupId,
    segments: activeSegments,
    activeReservation,
    firstSegment,
    originalCheckinDate,
    finalCheckoutDate,
    flatTrail,
    totalNights,
    accommodationTotal,
    chargesTotal,
    totalAmount,
    paidAmount,
    pendingAmount,
    isFullyPaid,
    allReservationIds: activeSegments.map((s) => s.id),
    allReservationCodes: activeSegments.map((s) => s.code).filter(Boolean)
  };
}

export function getFlatCleanlinessSnapshot(db, flatIdOrNumber, todayStr = null) {
  const effectiveToday = normalizeDateStr(todayStr || getTodayStrLocal());
  const flat = resolveFlat(db, flatIdOrNumber) || { id: flatIdOrNumber, number: String(flatIdOrNumber || "") };
  const fNum = String(flat.number || "").trim();
  const fId = flat.id;

  const isInstruction = (c) =>
    Boolean(
      c.isInstructionOnly ||
      c.source === "manual_instruction" ||
      c.type === "instruction" ||
      c.type === "bed_adjustment_only" ||
      c.isBedAdjustmentOnly
    );

  const cleaningRequests = Array.isArray(db?.cleaningRequests) ? db.cleaningRequests : [];
  const todayCards = cleaningRequests.filter(
    (c) =>
      c &&
      !c.isDeleted &&
      c.status !== "deleted" &&
      !isInstruction(c) &&
      ((fId != null && Number(c.flatId) === Number(fId)) || (fNum && String(c.flatNumber) === fNum)) &&
      (normalizeDateStr(c.requestDate) === effectiveToday || normalizeDateStr(c.effectiveDate) === effectiveToday)
  );

  if (todayCards.length > 0) {
    const hasCleaningNow = todayCards.some((c) => ["cleaning_now", "in_progress"].includes(String(c.status || "").toLowerCase()));
    if (hasCleaningNow) {
      return { status: "cleaning_now", label: "Limpando", isClean: false };
    }
    const revertedDirty = todayCards.find((c) => String(c.status || "").toLowerCase() === "dirty" && c.revertedToDirtyAt);
    const cleanCard = todayCards.find((c) => ["clean", "inspected"].includes(String(c.status || "").toLowerCase()));
    if (revertedDirty && (!cleanCard || String(cleanCard.completedAt || "") <= String(revertedDirty.revertedToDirtyAt))) {
      return { status: "dirty", label: "Sujo", isClean: false };
    }
    const hasDirty = todayCards.some((c) => ["dirty", "pending", "will_clean"].includes(String(c.status || "").toLowerCase()));
    if (hasDirty && !cleanCard) {
      return { status: "dirty", label: "Sujo", isClean: false };
    }
    if (cleanCard) {
      return { status: "clean", label: "Limpo", isClean: true };
    }
  }

  const hasPendingCheckoutToday = (db?.reservations || []).some(
    (r) =>
      r &&
      !isCancelledStatus(r) &&
      !r.checkoutDone &&
      !r.earlyCheckout &&
      String(r.status || "").toLowerCase() !== "completed" &&
      String(r.status || "").toLowerCase() !== "checked_out" &&
      ((fId != null && Number(r.flatId) === Number(fId)) || (fNum && String(r.flatNumber) === fNum)) &&
      normalizeDateStr(r.checkoutDate) === effectiveToday
  );
  if (hasPendingCheckoutToday) {
    return { status: "dirty", label: "Sujo", isClean: false };
  }

  const flatCleanSt = String(flat.cleaningStatus || flat.status || "").toLowerCase();
  if (flatCleanSt === "cleaning_now" || flatCleanSt === "in_progress") {
    return { status: "cleaning_now", label: "Limpando", isClean: false };
  }
  if (flatCleanSt === "dirty" || flatCleanSt === "pending") {
    return { status: "dirty", label: "Sujo", isClean: false };
  }

  return { status: "clean", label: "Limpo", isClean: true };
}

export function previewRoomMoveOrSwap(db, params = {}) {
  const action = String(params.action || (params.reservationBId ? "swap" : "move")).toLowerCase().trim();
  const todayStr = normalizeDateStr(params.todayStr || getTodayStrLocal());

  if (action === "swap") {
    const resA = resolveReservation(db, params.reservationAId);
    const resB = resolveReservation(db, params.reservationBId);
    if (!resA || !resB) {
      const err = new Error("Uma ou ambas as reservas para inversão não foram encontradas.");
      err.statusCode = 404;
      throw err;
    }
    if (Number(resA.id) === Number(resB.id)) {
      const err = new Error("Selecione duas reservas distintas para realizar a inversão.");
      err.statusCode = 400;
      throw err;
    }

    const flatA = resolveFlat(db, resA.flatId ?? resA.flatNumber) || { id: resA.flatId, number: String(resA.flatNumber || "") };
    const flatB = resolveFlat(db, resB.flatId ?? resB.flatNumber) || { id: resB.flatId, number: String(resB.flatNumber || "") };

    const defaultCut =
      (resA.checkinDate < todayStr && todayStr < resA.checkoutDate) ||
      (resB.checkinDate < todayStr && todayStr < resB.checkoutDate)
        ? todayStr
        : (resA.checkinDate > resB.checkinDate ? resA.checkinDate : resB.checkinDate);
    const cutDate = normalizeDateStr(params.cutDate || defaultCut);
    const requestedMode = String(params.mode || "auto").toLowerCase().trim();

    const conflicts = [];
    if (isClosedStayStatus(resA) || resA.isRoomMoveHistoricalSegment) {
      conflicts.push({ type: "validation", message: `Reserva ${resA.code || resA.id} não está elegível para troca.` });
    }
    if (isClosedStayStatus(resB) || resB.isRoomMoveHistoricalSegment) {
      conflicts.push({ type: "validation", message: `Reserva ${resB.code || resB.id} não está elegível para troca.` });
    }
    if (!cutDate || cutDate >= resA.checkoutDate || cutDate >= resB.checkoutDate) {
      conflicts.push({
        type: "validation",
        message: `A data de corte (${cutDate || "inválida"}) deve ser anterior ao check-out de ambas as reservas (${resA.checkoutDate} e ${resB.checkoutDate}).`
      });
    }

    const shouldSplitA = requestedMode !== "move_whole" && resA.checkinDate < cutDate && cutDate < resA.checkoutDate;
    const shouldSplitB = requestedMode !== "move_whole" && resB.checkinDate < cutDate && cutDate < resB.checkoutDate;
    const targetStartA = shouldSplitA ? cutDate : normalizeDateStr(resA.checkinDate);
    const targetStartB = shouldSplitB ? cutDate : normalizeDateStr(resB.checkinDate);

    if (Number(flatA.id) === Number(flatB.id)) {
      conflicts.push({ type: "validation", message: "As duas reservas já estão no mesmo flat." });
    } else if (conflicts.length === 0) {
      const conflictsOnB = findFlatConflictsForPeriod(db, {
        flatId: flatB.id,
        flatNumber: flatB.number,
        checkinDate: targetStartA,
        checkoutDate: normalizeDateStr(resA.checkoutDate),
        excludeIds: [resA.id, resB.id]
      });
      const conflictsOnA = findFlatConflictsForPeriod(db, {
        flatId: flatA.id,
        flatNumber: flatA.number,
        checkinDate: targetStartB,
        checkoutDate: normalizeDateStr(resB.checkoutDate),
        excludeIds: [resA.id, resB.id]
      });
      conflicts.push(...conflictsOnB, ...conflictsOnA);

      if (shouldSplitA && targetStartB < cutDate) {
        conflicts.push({
          type: "source_retention_overlap",
          flatId: flatA.id,
          flatNumber: String(flatA.number),
          message: `Incompatibilidade de datas no Flat ${flatA.number}: ${resA.guestName} permanece até ${cutDate}, mas ${resB.guestName} iniciaria em ${targetStartB}.`
        });
      }
      if (shouldSplitB && targetStartA < cutDate) {
        conflicts.push({
          type: "source_retention_overlap",
          flatId: flatB.id,
          flatNumber: String(flatB.number),
          message: `Incompatibilidade de datas no Flat ${flatB.number}: ${resB.guestName} permanece até ${cutDate}, mas ${resA.guestName} iniciaria em ${targetStartA}.`
        });
      }
    }

    const lockedFlats = [];
    if (resA.isFlatLocked || resA.flatLocked) {
      lockedFlats.push({
        reservationId: resA.id,
        code: resA.code,
        guestName: resA.guestName,
        flatNumber: String(flatA.number),
        reason: resA.flatLockReason || "Quarto preferencial fixado"
      });
    }
    if (resB.isFlatLocked || resB.flatLocked) {
      lockedFlats.push({
        reservationId: resB.id,
        code: resB.code,
        guestName: resB.guestName,
        flatNumber: String(flatB.number),
        reason: resB.flatLockReason || "Quarto preferencial fixado"
      });
    }

    const featureWarnings = [
      ...collectPreferenceWarnings(resA, flatA, flatB),
      ...collectPreferenceWarnings(resB, flatB, flatA)
    ];

    const simA = simulateMoveFinancialBreakdown(resA, flatA, flatB, cutDate, shouldSplitA ? "split" : "move_whole", params.upgradeAdjustmentAmountA || 0);
    const simB = simulateMoveFinancialBreakdown(resB, flatB, flatA, cutDate, shouldSplitB ? "split" : "move_whole", params.upgradeAdjustmentAmountB || 0);

    const targetCleanliness = getFlatCleanlinessSnapshot(db, flatB.id ?? flatB.number, todayStr);
    const targetCleanlinessB = getFlatCleanlinessSnapshot(db, flatA.id ?? flatA.number, todayStr);

    return {
      success: true,
      action: "swap",
      mode: requestedMode,
      cutDate,
      targetCleanliness,
      targetCleanlinessB,
      conflicts,
      hasConflict: conflicts.length > 0,
      hasFlatLockWarning: lockedFlats.length > 0,
      lockedFlats,
      featureWarnings,
      canExecute: conflicts.length === 0,
      summary: {
        guestA: {
          reservationId: resA.id,
          code: resA.code,
          guestName: resA.guestName,
          fromFlatId: flatA.id,
          fromFlatNumber: String(flatA.number),
          toFlatId: flatB.id,
          toFlatNumber: String(flatB.number),
          ...simA
        },
        guestB: {
          reservationId: resB.id,
          code: resB.code,
          guestName: resB.guestName,
          fromFlatId: flatB.id,
          fromFlatNumber: String(flatB.number),
          toFlatId: flatA.id,
          toFlatNumber: String(flatA.number),
          ...simB
        },
        totalBefore: {
          accommodationAmount: round2(simA.totalBefore.accommodationAmount + simB.totalBefore.accommodationAmount),
          chargesAmount: round2(simA.totalBefore.chargesAmount + simB.totalBefore.chargesAmount),
          totalAmount: round2(simA.totalBefore.totalAmount + simB.totalBefore.totalAmount),
          paidAmount: round2(simA.totalBefore.paidAmount + simB.totalBefore.paidAmount),
          pendingAmount: round2(simA.totalBefore.pendingAmount + simB.totalBefore.pendingAmount)
        },
        totalAfter: {
          accommodationAmount: round2(simA.totalAfter.accommodationAmount + simB.totalAfter.accommodationAmount),
          chargesAmount: round2(simA.totalAfter.chargesAmount + simB.totalAfter.chargesAmount),
          totalAmount: round2(simA.totalAfter.totalAmount + simB.totalAfter.totalAmount),
          paidAmount: round2(simA.totalAfter.paidAmount + simB.totalAfter.paidAmount),
          pendingAmount: round2(simA.totalAfter.pendingAmount + simB.totalAfter.pendingAmount)
        }
      }
    };
  }

  // ── ACTION: "move" ──────────────────────────────────────────────────────────
  const r = resolveReservation(db, params.reservationId);
  if (!r) {
    const err = new Error("Reserva não encontrada.");
    err.statusCode = 404;
    throw err;
  }
  const sourceFlat = resolveFlat(db, r.flatId ?? r.flatNumber) || { id: r.flatId, number: String(r.flatNumber || "") };
  const targetFlat = resolveFlat(db, params.targetFlatId ?? params.targetFlatNumber);
  if (!targetFlat) {
    const err = new Error("Flat de destino não encontrado.");
    err.statusCode = 404;
    throw err;
  }

  const defaultCut = r.checkinDate < todayStr && todayStr < r.checkoutDate ? todayStr : normalizeDateStr(r.checkinDate);
  const cutDate = normalizeDateStr(params.cutDate || defaultCut);
  const requestedMode = String(params.mode || "split").toLowerCase().trim();
  const shouldSplit = requestedMode !== "move_whole" && r.checkinDate < cutDate && cutDate < r.checkoutDate;
  const effectiveMode = shouldSplit ? "split" : "move_whole";

  const conflicts = [];
  if (isClosedStayStatus(r) || r.isRoomMoveHistoricalSegment) {
    conflicts.push({ type: "validation", message: `Reserva ${r.code || r.id} não está elegível para movimentação.` });
  }
  if (Number(targetFlat.id) === Number(sourceFlat.id) && String(targetFlat.number) === String(sourceFlat.number)) {
    conflicts.push({ type: "validation", message: "Selecione um flat diferente do atual." });
  }
  if (requestedMode !== "move_whole" && (!cutDate || cutDate >= r.checkoutDate)) {
    conflicts.push({
      type: "validation",
      message: `A data de corte (${cutDate || "inválida"}) deve ser anterior à data de check-out (${r.checkoutDate}).`
    });
  }
  if (conflicts.length === 0) {
    const checkStart = shouldSplit ? cutDate : normalizeDateStr(r.checkinDate);
    conflicts.push(
      ...findFlatConflictsForPeriod(db, {
        flatId: targetFlat.id,
        flatNumber: targetFlat.number,
        checkinDate: checkStart,
        checkoutDate: normalizeDateStr(r.checkoutDate),
        excludeIds: [r.id]
      })
    );
  }

  const lockedFlats = [];
  if (r.isFlatLocked || r.flatLocked) {
    lockedFlats.push({
      reservationId: r.id,
      code: r.code,
      guestName: r.guestName,
      flatNumber: String(sourceFlat.number),
      reason: r.flatLockReason || "Quarto preferencial fixado"
    });
  }

  const featureWarnings = collectPreferenceWarnings(r, sourceFlat, targetFlat);
  const targetCleanliness = getFlatCleanlinessSnapshot(db, targetFlat.id ?? targetFlat.number, todayStr);
  const sim = simulateMoveFinancialBreakdown(
    r,
    sourceFlat,
    targetFlat,
    cutDate,
    effectiveMode,
    params.upgradeAdjustmentAmount || 0
  );

  return {
    success: true,
    action: "move",
    mode: effectiveMode,
    cutDate,
    targetCleanliness,
    conflicts,
    hasConflict: conflicts.length > 0,
    hasFlatLockWarning: lockedFlats.length > 0,
    lockedFlats,
    featureWarnings,
    canExecute: conflicts.length === 0,
    summary: sim
  };
}

export async function executeRoomMove(db, params = {}, deps = {}) {
  const {
    reservationId,
    targetFlatId,
    targetFlatNumber,
    cutDate: rawCutDate,
    mode = "split",
    generateCutoffCleaning = true,
    upgradeAdjustmentAmount = 0,
    upgradeAdjustmentNote = "",
    confirmFlatLockOverride = false,
    reason = "",
    actor = null,
    source = "PMS Troca de Flat"
  } = params;

  const r = resolveReservation(db, reservationId);
  if (!r) {
    const err = new Error("Reserva não encontrada.");
    err.statusCode = 404;
    throw err;
  }
  if (r.isRoomMoveHistoricalSegment) {
    const err = new Error(`Este é um segmento histórico. Execute a alteração na reserva ativa (${r.activeReservationCode || r.activeReservationId}).`);
    err.statusCode = 400;
    throw err;
  }
  if (isClosedStayStatus(r)) {
    const err = new Error("Reserva já encerrada ou cancelada não pode ser transferida.");
    err.statusCode = 400;
    throw err;
  }

  const targetFlat = resolveFlat(db, targetFlatId ?? targetFlatNumber);
  if (!targetFlat) {
    const err = new Error("Flat de destino não encontrado.");
    err.statusCode = 404;
    throw err;
  }
  const sourceFlat = resolveFlat(db, r.flatId ?? r.flatNumber) || { id: r.flatId, number: String(r.flatNumber || "") };
  if (Number(targetFlat.id) === Number(sourceFlat.id) && String(targetFlat.number) === String(sourceFlat.number)) {
    const err = new Error("O flat de destino é o mesmo que o flat atual da reserva.");
    err.statusCode = 400;
    throw err;
  }

  if ((r.isFlatLocked || r.flatLocked) && !confirmFlatLockOverride) {
    const err = new Error(`Reserva ${r.code || r.id} possui trava de Quarto Preferencial Fixado no Flat ${sourceFlat.number}. Confirme para prosseguir.`);
    err.statusCode = 409;
    err.code = "FLAT_LOCKED_CONFIRMATION_REQUIRED";
    err.requiresFlatLockConfirmation = true;
    err.flatNumber = String(sourceFlat.number);
    err.flatLockReason = r.flatLockReason || "Quarto preferencial fixado";
    throw err;
  }

  const todayStr = normalizeDateStr(params.todayStr || deps?.todayStr || getTodayStrLocal());
  const nowIso = deps?.nowIso || getEffectiveDate().toISOString();
  const oldCheckin = normalizeDateStr(r.checkinDate);
  const oldCheckout = normalizeDateStr(r.checkoutDate);
  const cutDate = normalizeDateStr(rawCutDate || (oldCheckin < todayStr && todayStr < oldCheckout ? todayStr : oldCheckin));
  const requestedMode = String(mode || "split").toLowerCase().trim();

  if (requestedMode !== "move_whole" && (!cutDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutDate) || cutDate >= oldCheckout)) {
    const err = new Error(`Data de corte inválida (${cutDate || "ausente"}): deve ser anterior ao check-out (${oldCheckout}).`);
    err.statusCode = 400;
    throw err;
  }

  const shouldSplit = requestedMode !== "move_whole" && oldCheckin < cutDate && cutDate < oldCheckout;
  const checkStart = shouldSplit ? cutDate : oldCheckin;

  const conflicts = findFlatConflictsForPeriod(db, {
    flatId: targetFlat.id,
    flatNumber: targetFlat.number,
    checkinDate: checkStart,
    checkoutDate: oldCheckout,
    excludeIds: [r.id],
    deps
  });
  if (conflicts.length > 0) {
    const err = new Error(conflicts[0]?.message || `Conflito no Flat ${targetFlat.number} para o período ${checkStart} a ${oldCheckout}.`);
    err.statusCode = 409;
    err.code = "OVERBOOKING_OR_BLOCK_CONFLICT";
    err.conflicts = conflicts;
    throw err;
  }

  const moveResult = mutateSingleReservationMove(db, r, {
    targetFlat,
    cutDate,
    shouldSplit,
    upgradeAdjustmentAmount,
    upgradeAdjustmentNote,
    reason,
    actor,
    source,
    todayStr,
    nowIso,
    deps
  });

  // Limpeza / Governança
  if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
  moveFinalCheckoutCleaningCard(db, {
    fromFlatId: moveResult.oldFlatId,
    fromFlatNumber: moveResult.oldFlatNumber,
    toFlatId: targetFlat.id,
    toFlatNumber: String(targetFlat.number),
    checkoutDate: oldCheckout,
    reservation: r
  });

  if (shouldSplit && generateCutoffCleaning !== false) {
    upsertRoomMoveCutoffCleaningCard(db, {
      flatId: moveResult.oldFlatId,
      flatNumber: moveResult.oldFlatNumber,
      cutDate,
      leavingGuest: r.guestName,
      arrivingGuest: null,
      pastSegment: moveResult.rPast,
      activePartnerRes: null,
      targetFlatNumber: String(targetFlat.number),
      groupId: r.roomMoveGroupId
    });
  }

  const syncCleaningFn = deps?.syncCleaningCardsForConfirmedReservation || defaultSyncCleaningCardsForConfirmedReservation;
  syncCleaningFn(db, r);

  // Café da Manhã (somente por reservationId / reservationCode)
  syncBreakfastOrdersForRoomMove(db, r, { targetFlat, cutDate, shouldSplit });

  // Callbacks externos & ARI sync
  if (typeof deps?.onAfterReservationRoomMoved === "function") {
    await deps.onAfterReservationRoomMoved(r, {
      action: shouldSplit ? "room_move_split" : "room_move_whole",
      shouldSplit,
      cutDate,
      oldFlatId: moveResult.oldFlatId,
      oldFlatNumber: moveResult.oldFlatNumber,
      targetFlat,
      pastSegment: moveResult.rPast,
      changes: moveResult.changes,
      reason,
      source,
      actor
    });
  }

  const notifyFn = typeof deps?.notifyPmsMutation === "function" ? deps.notifyPmsMutation : defaultNotifyPmsMutation;
  try {
    notifyFn(db, {
      type: "reservation_modified",
      checkinDate: oldCheckin,
      checkoutDate: oldCheckout
    });
  } catch (_) {}

  return {
    success: true,
    mode: shouldSplit ? "split" : "move_whole",
    cutDate,
    reservation: r,
    pastSegment: moveResult.rPast,
    groupReservations: getRoomMoveGroupReservations(db, r),
    consolidatedSummary: computeRoomMoveConsolidatedSummary(db, r)
  };
}

export async function executeFlatSwap(db, params = {}, deps = {}) {
  const {
    reservationAId,
    reservationBId,
    cutDate: rawCutDate,
    mode = "auto",
    generateCutoffCleaning = true,
    upgradeAdjustmentAmountA = 0,
    upgradeAdjustmentAmountB = 0,
    upgradeAdjustmentNoteA = "",
    upgradeAdjustmentNoteB = "",
    confirmFlatLockOverride = false,
    reason = "",
    actor = null,
    source = "PMS Inversão de Flats"
  } = params;

  // ── 1. Pré-validação atômica ANTES de qualquer mutação ─────────────────────
  const resA = resolveReservation(db, reservationAId);
  const resB = resolveReservation(db, reservationBId);
  if (!resA || !resB) {
    const err = new Error("Uma ou ambas as reservas para inversão não foram encontradas.");
    err.statusCode = 404;
    throw err;
  }
  if (Number(resA.id) === Number(resB.id)) {
    const err = new Error("Não é possível inverter uma reserva consigo mesma.");
    err.statusCode = 400;
    throw err;
  }
  if (resA.isRoomMoveHistoricalSegment || resB.isRoomMoveHistoricalSegment) {
    const err = new Error("Inversão não permitida em segmentos históricos de troca.");
    err.statusCode = 400;
    throw err;
  }
  if (isClosedStayStatus(resA) || isClosedStayStatus(resB)) {
    const err = new Error("Ambas as reservas devem estar ativas e não encerradas para realizar inversão.");
    err.statusCode = 400;
    throw err;
  }

  const flatA = resolveFlat(db, resA.flatId ?? resA.flatNumber) || { id: resA.flatId, number: String(resA.flatNumber || "") };
  const flatB = resolveFlat(db, resB.flatId ?? resB.flatNumber) || { id: resB.flatId, number: String(resB.flatNumber || "") };
  if (Number(flatA.id) === Number(flatB.id) && String(flatA.number) === String(flatB.number)) {
    const err = new Error("As duas reservas já ocupam o mesmo flat.");
    err.statusCode = 400;
    throw err;
  }

  const lockedFlats = [];
  if (resA.isFlatLocked || resA.flatLocked) {
    lockedFlats.push({
      reservationId: resA.id,
      code: resA.code,
      guestName: resA.guestName,
      flatNumber: String(flatA.number),
      reason: resA.flatLockReason || "Quarto preferencial fixado"
    });
  }
  if (resB.isFlatLocked || resB.flatLocked) {
    lockedFlats.push({
      reservationId: resB.id,
      code: resB.code,
      guestName: resB.guestName,
      flatNumber: String(flatB.number),
      reason: resB.flatLockReason || "Quarto preferencial fixado"
    });
  }
  if (lockedFlats.length > 0 && !confirmFlatLockOverride) {
    const err = new Error(`Reserva(s) com Quarto Preferencial Fixado (${lockedFlats.map((l) => `Flat ${l.flatNumber}`).join(", ")}). Confirme para prosseguir com a inversão.`);
    err.statusCode = 409;
    err.code = "FLAT_LOCKED_CONFIRMATION_REQUIRED";
    err.requiresFlatLockConfirmation = true;
    err.lockedFlats = lockedFlats;
    throw err;
  }

  const todayStr = normalizeDateStr(params.todayStr || deps?.todayStr || getTodayStrLocal());
  const nowIso = deps?.nowIso || getEffectiveDate().toISOString();
  const cutDate = normalizeDateStr(rawCutDate || todayStr);
  const requestedMode = String(mode || "auto").toLowerCase().trim();

  const checkinA = normalizeDateStr(resA.checkinDate);
  const checkoutA = normalizeDateStr(resA.checkoutDate);
  const checkinB = normalizeDateStr(resB.checkinDate);
  const checkoutB = normalizeDateStr(resB.checkoutDate);

  if (!cutDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutDate) || cutDate >= checkoutA || cutDate >= checkoutB) {
    const err = new Error(`Data de corte inválida (${cutDate || "ausente"}): deve ser anterior ao check-out de ambos os hóspedes.`);
    err.statusCode = 400;
    throw err;
  }

  const shouldSplitA = requestedMode !== "move_whole" && checkinA < cutDate && cutDate < checkoutA;
  const shouldSplitB = requestedMode !== "move_whole" && checkinB < cutDate && cutDate < checkoutB;

  const targetStartA = shouldSplitA ? cutDate : checkinA;
  const targetStartB = shouldSplitB ? cutDate : checkinB;

  const conflictsOnB = findFlatConflictsForPeriod(db, {
    flatId: flatB.id,
    flatNumber: flatB.number,
    checkinDate: targetStartA,
    checkoutDate: checkoutA,
    excludeIds: [resA.id, resB.id],
    deps
  });
  const conflictsOnA = findFlatConflictsForPeriod(db, {
    flatId: flatA.id,
    flatNumber: flatA.number,
    checkinDate: targetStartB,
    checkoutDate: checkoutB,
    excludeIds: [resA.id, resB.id],
    deps
  });

  const overlapConflicts = [];
  if (shouldSplitA && targetStartB < cutDate) {
    overlapConflicts.push({
      type: "source_retention_overlap",
      flatId: flatA.id,
      flatNumber: String(flatA.number),
      message: `Conflito na inversão: ${resA.guestName} ocupa o Flat ${flatA.number} até ${cutDate}, mas ${resB.guestName} iniciaria em ${targetStartB}.`
    });
  }
  if (shouldSplitB && targetStartA < cutDate) {
    overlapConflicts.push({
      type: "source_retention_overlap",
      flatId: flatB.id,
      flatNumber: String(flatB.number),
      message: `Conflito na inversão: ${resB.guestName} ocupa o Flat ${flatB.number} até ${cutDate}, mas ${resA.guestName} iniciaria em ${targetStartA}.`
    });
  }

  const allConflicts = [...conflictsOnB, ...conflictsOnA, ...overlapConflicts];
  if (allConflicts.length > 0) {
    const err = new Error(allConflicts[0]?.message || "Conflito detectado ao validar a inversão de flats.");
    err.statusCode = 409;
    err.code = "SWAP_CONFLICT";
    err.conflicts = allConflicts;
    throw err;
  }

  // ── 2. Snapshot dos cards finais de limpeza ANTES da mutação ───────────────
  if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
  const isNotInstruction = (c) =>
    !c.isInstructionOnly &&
    c.source !== "manual_instruction" &&
    c.type !== "instruction" &&
    c.type !== "bed_adjustment_only" &&
    !c.isBedAdjustmentOnly;

  const findCheckoutCardForFlat = (flatObj, coDate, resObj) =>
    db.cleaningRequests.find(
      (c) =>
        c &&
        !c.isDeleted &&
        c.status !== "deleted" &&
        !c.isRoomMoveCheckout &&
        isNotInstruction(c) &&
        c.requestDate === coDate &&
        ((flatObj.id != null && Number(c.flatId) === Number(flatObj.id)) || String(c.flatNumber) === String(flatObj.number)) &&
        (c.checkoutReservationId == null || Number(c.checkoutReservationId) === Number(resObj.id))
    ) || null;

  const finalCardA = findCheckoutCardForFlat(flatA, checkoutA, resA);
  const finalCardB = findCheckoutCardForFlat(flatB, checkoutB, resB);

  // ── 3. Mutação limpa de A e B ──────────────────────────────────────────────
  const moveA = mutateSingleReservationMove(db, resA, {
    targetFlat: flatB,
    cutDate,
    shouldSplit: shouldSplitA,
    upgradeAdjustmentAmount: upgradeAdjustmentAmountA,
    upgradeAdjustmentNote: upgradeAdjustmentNoteA,
    reason: reason || `Inversão direta com ${resB.guestName || resB.code} (Flat ${flatA.number} ⇄ Flat ${flatB.number})`,
    actor,
    source,
    todayStr,
    nowIso,
    deps
  });

  const moveB = mutateSingleReservationMove(db, resB, {
    targetFlat: flatA,
    cutDate,
    shouldSplit: shouldSplitB,
    upgradeAdjustmentAmount: upgradeAdjustmentAmountB,
    upgradeAdjustmentNote: upgradeAdjustmentNoteB,
    reason: reason || `Inversão direta com ${resA.guestName || resA.code} (Flat ${flatB.number} ⇄ Flat ${flatA.number})`,
    actor,
    source,
    todayStr,
    nowIso,
    deps
  });

  // ── 4. Sincronização cuidadosa de cards de limpeza (sem sobrescrita cruzada)
  const assignCheckoutCardTarget = (card, targetFlatObj, coDate, ownerRes) => {
    if (card && card.status !== "clean") {
      card.flatId = targetFlatObj.id;
      card.flatNumber = String(targetFlatObj.number);
      card.leavingGuest = ownerRes.guestName || card.leavingGuest;
      card.checkoutReservationId = ownerRes.id;
      card.checkoutReservationCode = ownerRes.code;
      card.updatedAt = nowIso;
    } else if (!card) {
      const existsOnTarget = db.cleaningRequests.find(
        (c) =>
          c &&
          !c.isDeleted &&
          c.status !== "deleted" &&
          !c.isRoomMoveCheckout &&
          isNotInstruction(c) &&
          c.requestDate === coDate &&
          ((targetFlatObj.id != null && Number(c.flatId) === Number(targetFlatObj.id)) || String(c.flatNumber) === String(targetFlatObj.number)) &&
          Number(c.checkoutReservationId) === Number(ownerRes.id)
      );
      if (!existsOnTarget) {
        const maxCleanId = db.cleaningRequests.reduce((m, c) => Math.max(m, Number(c?.id) || 0), 0);
        db.cleaningRequests.push({
          id: maxCleanId + 1,
          flatId: targetFlatObj.id,
          flatNumber: String(targetFlatObj.number),
          requestDate: coDate,
          source: "checkout",
          status: "dirty",
          assignedUserId: null,
          assignedUsername: null,
          isVacant: false,
          isPriority: Boolean(ownerRes.isPriority),
          leavingGuest: ownerRes.guestName || null,
          arrivingGuest: null,
          checkoutReservationId: ownerRes.id,
          checkoutReservationCode: ownerRes.code,
          adminNote: null,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
    }
  };

  assignCheckoutCardTarget(finalCardA, flatB, checkoutA, resA);
  assignCheckoutCardTarget(finalCardB, flatA, checkoutB, resB);

  if (shouldSplitA && generateCutoffCleaning !== false) {
    upsertRoomMoveCutoffCleaningCard(db, {
      flatId: flatA.id,
      flatNumber: String(flatA.number),
      cutDate,
      leavingGuest: resA.guestName,
      arrivingGuest: resB.guestName,
      pastSegment: moveA.rPast,
      activePartnerRes: resB,
      targetFlatNumber: String(flatB.number),
      groupId: resA.roomMoveGroupId
    });
  }
  if (shouldSplitB && generateCutoffCleaning !== false) {
    upsertRoomMoveCutoffCleaningCard(db, {
      flatId: flatB.id,
      flatNumber: String(flatB.number),
      cutDate,
      leavingGuest: resB.guestName,
      arrivingGuest: resA.guestName,
      pastSegment: moveB.rPast,
      activePartnerRes: resA,
      targetFlatNumber: String(flatA.number),
      groupId: resB.roomMoveGroupId
    });
  }

  const syncCleaningFn = deps?.syncCleaningCardsForConfirmedReservation || defaultSyncCleaningCardsForConfirmedReservation;
  syncCleaningFn(db, resA);
  syncCleaningFn(db, resB);

  // ── 5. Sincronização de Café da Manhã estritamente por ID/código ───────────
  syncBreakfastOrdersForRoomMove(db, resA, { targetFlat: flatB, cutDate, shouldSplit: shouldSplitA });
  syncBreakfastOrdersForRoomMove(db, resB, { targetFlat: flatA, cutDate, shouldSplit: shouldSplitB });

  // ── 6. Callbacks externos & ARI sync ───────────────────────────────────────
  if (typeof deps?.onAfterReservationRoomMoved === "function") {
    await deps.onAfterReservationRoomMoved(resA, {
      action: "flat_swap",
      shouldSplit: shouldSplitA,
      swapPartnerId: resB.id,
      swapPartnerCode: resB.code,
      cutDate,
      oldFlatId: flatA.id,
      oldFlatNumber: String(flatA.number),
      targetFlat: flatB,
      pastSegment: moveA.rPast,
      changes: moveA.changes,
      reason,
      source,
      actor
    });
    await deps.onAfterReservationRoomMoved(resB, {
      action: "flat_swap",
      shouldSplit: shouldSplitB,
      swapPartnerId: resA.id,
      swapPartnerCode: resA.code,
      cutDate,
      oldFlatId: flatB.id,
      oldFlatNumber: String(flatB.number),
      targetFlat: flatA,
      pastSegment: moveB.rPast,
      changes: moveB.changes,
      reason,
      source,
      actor
    });
  }

  const minDate = checkinA < checkinB ? checkinA : checkinB;
  const maxDate = checkoutA > checkoutB ? checkoutA : checkoutB;
  const notifyFn = typeof deps?.notifyPmsMutation === "function" ? deps.notifyPmsMutation : defaultNotifyPmsMutation;
  try {
    notifyFn(db, {
      type: "reservation_modified",
      checkinDate: minDate,
      checkoutDate: maxDate
    });
  } catch (_) {}

  const swapSummary = {
    cutDate,
    mode: requestedMode,
    flatA: { id: flatA.id, number: String(flatA.number) },
    flatB: { id: flatB.id, number: String(flatB.number) },
    guestA: {
      reservationId: resA.id,
      code: resA.code,
      guestName: resA.guestName,
      split: shouldSplitA,
      fromFlatNumber: String(flatA.number),
      toFlatNumber: String(flatB.number),
      pastSegmentId: moveA.rPast?.id || null,
      pastSegmentCode: moveA.rPast?.code || null
    },
    guestB: {
      reservationId: resB.id,
      code: resB.code,
      guestName: resB.guestName,
      split: shouldSplitB,
      fromFlatNumber: String(flatB.number),
      toFlatNumber: String(flatA.number),
      pastSegmentId: moveB.rPast?.id || null,
      pastSegmentCode: moveB.rPast?.code || null
    }
  };

  return {
    success: true,
    swapSummary,
    reservationA: resA,
    reservationB: resB,
    pastSegmentA: moveA.rPast,
    pastSegmentB: moveB.rPast
  };
}

export function undoLastRoomMove(db, params = {}, deps = {}) {
  const { reservationId, actor = null, source = "PMS Desfazer Troca" } = params;
  const rawRes = resolveReservation(db, reservationId);
  if (!rawRes) {
    const err = new Error("Reserva não encontrada.");
    err.statusCode = 404;
    throw err;
  }

  const r = rawRes.isRoomMoveHistoricalSegment && rawRes.activeReservationId
    ? (resolveReservation(db, rawRes.activeReservationId) || rawRes)
    : rawRes;

  const groupReservations = getRoomMoveGroupReservations(db, r);
  let rPast = null;
  if (r.previousSegmentReservationId != null) {
    rPast = (db.reservations || []).find((x) => x && Number(x.id) === Number(r.previousSegmentReservationId)) || null;
  }
  if (!rPast && groupReservations.length > 1) {
    const historicals = groupReservations.filter((x) => x && x.id !== r.id && x.isRoomMoveHistoricalSegment);
    rPast = historicals[historicals.length - 1] || null;
  }
  if (!rPast) {
    const err = new Error("Não há troca anterior segmentada para desfazer nesta reserva.");
    err.statusCode = 400;
    throw err;
  }

  const restoredFlat = resolveFlat(db, rPast.flatId ?? rPast.flatNumber) || { id: rPast.flatId, number: String(rPast.flatNumber || "") };
  const currentFlatId = r.flatId;
  const currentFlatNumber = String(r.flatNumber || "");
  const restoredFlatId = restoredFlat.id;
  const restoredFlatNumber = String(restoredFlat.number || rPast.flatNumber || "");
  const cutDate = normalizeDateStr(r.roomMoveCutDate || rPast.checkoutDate || r.checkinDate);
  const todayStr = normalizeDateStr(params.todayStr || deps?.todayStr || getTodayStrLocal());
  const nowIso = deps?.nowIso || getEffectiveDate().toISOString();

  // Verifica conflito no flat de origem durante o período da Parte 2 [r.checkinDate, r.checkoutDate)
  const conflicts = findFlatConflictsForPeriod(db, {
    flatId: restoredFlatId,
    flatNumber: restoredFlatNumber,
    checkinDate: normalizeDateStr(r.checkinDate),
    checkoutDate: normalizeDateStr(r.checkoutDate),
    excludeIds: [r.id, rPast.id],
    deps
  });
  if (conflicts.length > 0) {
    const err = new Error(conflicts[0]?.message || `Não é possível desfazer a troca: o Flat ${restoredFlatNumber} possui ocupação conflitante.`);
    err.statusCode = 409;
    err.code = "UNDO_ROOM_MOVE_CONFLICT";
    err.conflicts = conflicts;
    throw err;
  }

  // 1. Restaura flat e datas originais
  r.flatId = restoredFlatId;
  r.flatNumber = restoredFlatNumber;
  r.checkinDate = normalizeDateStr(rPast.checkinDate);

  // 2. Mescla dailyRates
  const mergedRateMap = new Map();
  for (const d of Array.isArray(rPast.dailyRates) ? rPast.dailyRates : []) {
    if (d && d.date) mergedRateMap.set(normalizeDateStr(d.date), { ...d, date: normalizeDateStr(d.date) });
  }
  for (const d of Array.isArray(r.dailyRates) ? r.dailyRates : []) {
    if (d && d.date) mergedRateMap.set(normalizeDateStr(d.date), { ...d, date: normalizeDateStr(d.date) });
  }
  const mergedDailyRates = Array.from(mergedRateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  r.dailyRates = mergedDailyRates;
  const ratesSum = round2(mergedDailyRates.reduce((s, d) => s + (Number(d.rate ?? d.amount) || 0), 0));
  if (mergedDailyRates.length > 0) {
    r.dailyRate = round2(ratesSum / mergedDailyRates.length);
  }

  // 3. Restaura taxas/charges de rPast e remove chg_upgrade_* gerado na troca
  const allCurrentActiveCharges = Array.isArray(r.charges) ? r.charges : [];
  const removedUpgradeSum = round2(
    allCurrentActiveCharges
      .filter((c) => c && String(c.id || "").startsWith("chg_upgrade_"))
      .reduce((s, c) => s + (Number(c.amount) || 0), 0)
  );
  const remainingActiveCharges = allCurrentActiveCharges.filter(
    (c) => c && !String(c.id || "").startsWith("chg_upgrade_")
  );
  const pastCharges = collectSegmentChargesList(rPast, rPast.id);
  const seenChargeIds = new Set(pastCharges.map((c) => c.id));
  const mergedCharges = [...pastCharges];
  for (const c of remainingActiveCharges) {
    if (!c.id || !seenChargeIds.has(c.id)) {
      mergedCharges.push({ ...c });
    }
  }
  r.charges = mergedCharges;

  const feeKeys = ["cleaningFee", "petFee", "extraBedFee", "twinFee", "earlyCheckinFee", "lateCheckoutFee"];
  for (const fk of feeKeys) {
    if (Number(rPast[fk]) > 0) {
      r[fk] = round2(Number(rPast[fk]));
    } else {
      delete r[fk];
    }
  }

  const chargesSum = computeSegmentChargesTotal(r);
  const unifiedTotal = mergedDailyRates.length > 0
    ? round2(ratesSum + chargesSum)
    : round2(Math.max(0, (Number(rPast.totalAmount) || 0) + (Number(r.totalAmount) || 0) - removedUpgradeSum));
  r.totalAmount = unifiedTotal;
  r.totalPrice = unifiedTotal;

  // 4. Combina pagamentos
  const combinedPaid = round2((Number(rPast.paidAmount) || 0) + (Number(r.paidAmount) || 0));
  r.paidAmount = combinedPaid;
  r.amountPaid = combinedPaid;
  r.paymentStatus = resolvePaymentStatusLabel(combinedPaid, unifiedTotal);
  if (combinedPaid > 0) {
    r.payments = [
      {
        id: `pay_unified_${r.id}_${Date.now()}`,
        amount: combinedPaid,
        method: r.paymentMethod || rPast.paymentMethod || "pix",
        date: rPast.paidAt || r.paidAt || nowIso,
        notes: `Pagamento reunificado (desfeita troca Flat ${restoredFlatNumber} ↔ Flat ${currentFlatNumber})`
      }
    ];
  } else {
    r.payments = [];
  }

  // 5. Restaura FNRH se o hóspede NÃO completou nova assinatura no flat de destino
  const hasNewSignature = Boolean(
    r.fnhrCompleted ||
    r.preCheckinCompleted ||
    r.hasPreCheckin ||
    r.fnrhDocumentUuid ||
    r.fnrhSignedAt ||
    (Array.isArray(r.guests) && r.guests.some((g) => g && (g.hasCompletedCheckin || g.fnrhDocumentUuid || g.fnrhSignedAt)))
  );

  const pastHadFnrh = Boolean(
    rPast.fnhrCompleted ||
    rPast.preCheckinCompleted ||
    rPast.hasPreCheckin ||
    rPast.fnrhDocumentUuid ||
    rPast.fnrhSignedAt ||
    rPast.checkedInAt ||
    (Array.isArray(rPast.guests) && rPast.guests.some((g) => g && (g.hasCompletedCheckin || g.fnrhDocumentUuid || g.fnrhSignedAt)))
  );

  if (!hasNewSignature) {
    const fnrhFields = [
      "fnhrCompleted", "fnhrCompletedAt", "preCheckinCompleted", "hasPreCheckin",
      "signatureUrl", "checkedInAt", "actualCheckinAt", "preCheckinSignedAt",
      "fnrhPdfUrl", "fnrhDownloadUrl", "fnrhDocumentUuid", "fnrhSha256Hash",
      "fnrhVerifyUrl", "fnrhSignedAt", "fnrhAuditTrail", "fnrhFileName", "fnrhFilePath",
      "r2Url", "fnrhR2Url"
    ];
    if (pastHadFnrh) {
      for (const ff of fnrhFields) {
        if (rPast[ff] !== undefined) r[ff] = cloneDeep(rPast[ff]);
      }
      if (Array.isArray(r.guests) && Array.isArray(rPast.guests)) {
        r.guests.forEach((g, idx) => {
          const pg = rPast.guests[idx];
          if (!g || !pg) return;
          for (const ff of [...fnrhFields, "hasCompletedCheckin", "checkinCompletedAt", "status"]) {
            if (pg[ff] !== undefined) g[ff] = cloneDeep(pg[ff]);
          }
          g.needsReSignature = false;
          g.hadCompletedCheckinBefore = false;
          delete g.previousCheckinSignedAt;
        });
      }
    }
    if (rPast.originalPreMoveStatus && !["completed", "checked_out"].includes(String(rPast.originalPreMoveStatus).toLowerCase())) {
      r.status = rPast.originalPreMoveStatus;
    } else if (r.actualCheckinAt || r.checkedInAt) {
      r.status = r.checkinDate <= todayStr ? "in_house" : "confirmada";
    } else {
      r.status = "confirmada";
    }
    r.needsReSignature = false;
    r.hadCompletedCheckinBefore = false;
    delete r.reSignatureReason;
    delete r.previousCheckinSignedAt;
  }

  // Restaura eventual ID OTA se ausente
  if (!r.channexBookingId && rPast.originChannexBookingId) r.channexBookingId = rPast.originChannexBookingId;
  if (!r.externalOrderId && rPast.originExternalOrderId) r.externalOrderId = rPast.originExternalOrderId;
  if (!r.wbpBookingId && rPast.originWbpBookingId) r.wbpBookingId = rPast.originWbpBookingId;
  if (!r.otaReservationCode && rPast.originOtaReservationCode) {
    r.otaReservationCode = rPast.originOtaReservationCode;
    r.ota_reservation_code = rPast.originOtaReservationCode;
  }

  // 6. Limpeza: remove card dirty isRoomMoveCheckout da data do corte e devolve checkout final
  if (Array.isArray(db.cleaningRequests)) {
    db.cleaningRequests = db.cleaningRequests.filter((c) => {
      if (!c) return false;
      const sameCutFlat =
        (restoredFlatId != null && Number(c.flatId) === Number(restoredFlatId)) ||
        String(c.flatNumber) === restoredFlatNumber;
      const isCutoffCard = Boolean(c.isRoomMoveCheckout) && c.requestDate === cutDate && sameCutFlat && c.status !== "clean";
      return !isCutoffCard;
    });

    moveFinalCheckoutCleaningCard(db, {
      fromFlatId: currentFlatId,
      fromFlatNumber: currentFlatNumber,
      toFlatId: restoredFlatId,
      toFlatNumber: restoredFlatNumber,
      checkoutDate: normalizeDateStr(r.checkoutDate),
      reservation: r
    });
  }

  const syncCleaningFn = deps?.syncCleaningCardsForConfirmedReservation || defaultSyncCleaningCardsForConfirmedReservation;
  syncCleaningFn(db, r);

  // 7. Restaura pedidos de café da manhã futuros/pendentes de volta para o flat de origem
  if (Array.isArray(db.breakfastOrders)) {
    for (const o of db.breakfastOrders) {
      if (!o) continue;
      const matchesRes =
        (o.reservationId != null && Number(o.reservationId) === Number(r.id)) ||
        (o.reservationCode && r.code && String(o.reservationCode) === String(r.code));
      if (!matchesRes) continue;
      const st = String(o.status || "").toLowerCase();
      if (String(o.roomNumber) === currentFlatNumber && (o.date > cutDate || st === "pending" || st === "scheduled")) {
        o.roomNumber = restoredFlatNumber;
        o.flatNumber = restoredFlatNumber;
        if (o.flatId !== undefined || restoredFlatId != null) o.flatId = restoredFlatId;
        o.updatedAt = nowIso;
      }
    }
  }

  // 8. Remove rPast de db.reservations e limpa/atualiza metadados do grupo
  const groupId = r.roomMoveGroupId;
  db.reservations = (db.reservations || []).filter((x) => x && Number(x.id) !== Number(rPast.id));

  const remainingGroup = groupId
    ? (db.reservations || []).filter((x) => x && String(x.roomMoveGroupId || "") === String(groupId))
    : [];

  if (remainingGroup.length <= 1) {
    delete r.roomMoveGroupId;
    delete r.roomMoveIndex;
    delete r.roomMoveTotal;
    delete r.isRoomMoveActiveSegment;
    delete r.isRoomMoveHistoricalSegment;
    delete r.previousSegmentReservationId;
    delete r.previousSegmentReservationCode;
    delete r.originalStayCheckinDate;
    delete r.transferredFromFlatId;
    delete r.transferredFromFlatNumber;
    delete r.roomMoveCutDate;
    delete r.roomMovedAt;
    delete r.roomMoveReason;
  } else {
    const sortedRem = getRoomMoveGroupReservations(db, groupId);
    const prevLeg = sortedRem.filter((x) => x.id !== r.id).pop() || null;
    r.previousSegmentReservationId = prevLeg ? prevLeg.id : null;
    r.previousSegmentReservationCode = prevLeg ? prevLeg.code : null;
    r.transferredFromFlatId = prevLeg ? prevLeg.flatId : null;
    r.transferredFromFlatNumber = prevLeg ? String(prevLeg.flatNumber) : null;
    r.roomMoveCutDate = prevLeg ? normalizeDateStr(prevLeg.checkoutDate) : null;
    r.roomMoveIndex = sortedRem.length;
    sortedRem.forEach((seg, idx) => {
      seg.roomMoveIndex = idx + 1;
      seg.roomMoveTotal = sortedRem.length;
    });
  }

  appendAuditEntry(r, {
    action: "room_move_undone",
    actor,
    source,
    description: `Troca de flat desfeita: segmento ${rPast.code} removido e estadia reunificada no Flat ${restoredFlatNumber} (${r.checkinDate}..${r.checkoutDate}).`,
    changes: [
      { field: "flatNumber", label: "Apartamento", oldValue: `Flat ${currentFlatNumber}`, newValue: `Flat ${restoredFlatNumber}` },
      { field: "checkinDate", label: "Check-in Restaurado", oldValue: cutDate, newValue: r.checkinDate }
    ]
  });
  r.updatedAt = nowIso;

  if (typeof deps?.logAuditEvent === "function") {
    try {
      deps.logAuditEvent({
        level: "info",
        category: "reservation",
        action: "ROOM_MOVE_UNDONE",
        actor,
        source,
        details: {
          reservationId: r.id,
          code: r.code,
          removedSegmentId: rPast.id,
          removedSegmentCode: rPast.code,
          restoredFlatNumber
        }
      });
    } catch (_) {}
  }

  const notifyFn = typeof deps?.notifyPmsMutation === "function" ? deps.notifyPmsMutation : defaultNotifyPmsMutation;
  try {
    notifyFn(db, {
      type: "reservation_modified",
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate
    });
  } catch (_) {}

  return {
    success: true,
    reservation: r,
    removedSegmentId: rPast.id,
    removedSegmentCode: rPast.code,
    restoredFlatNumber
  };
}
