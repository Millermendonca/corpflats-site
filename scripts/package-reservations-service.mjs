import crypto from "crypto";
import { parseEmailList } from "./mail-service.mjs";

const inFlightInvalidGuestPhoneAlerts = new Set();

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function cleanPhoneLocal(rawPhone) {
  if (!rawPhone) return "";
  const str = String(rawPhone).trim();
  const hasExplicitPlus = str.startsWith("+");
  let digits = str.replace(/\D/g, "");
  if (!digits) return "";
  const hadInternationalDoubleZero = digits.startsWith("00");
  while (digits.startsWith("0")) {
    digits = digits.substring(1);
  }
  if (!digits) return "";
  if (digits.length === 13 && digits.startsWith("551") && digits[4] !== "9") {
    digits = digits.substring(2);
  }
  if ((hasExplicitPlus || hadInternationalDoubleZero) && !digits.startsWith("55")) {
    return digits;
  }
  if (digits.length === 10 && /^[1-9][1-9]\d{8}$/.test(digits)) {
    return "55" + digits;
  }
  if (digits.length === 11 && /^[1-9][1-9]9\d{8}$/.test(digits)) {
    return "55" + digits;
  }
  return digits;
}

function normalizePhoneDigitsSimple(phone) {
  return String(phone || "").replace(/\D+/g, "");
}

function phonesEndMatch(phoneA, phoneB) {
  const a = normalizePhoneDigitsSimple(phoneA);
  const b = normalizePhoneDigitsSimple(phoneB);
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
}

function areGuestNamesRoughlyCompatible(nameA, nameB) {
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const a = norm(nameA);
  const b = norm(nameB);
  if (a.length === 0 || b.length === 0) return false;
  return a[0] === b[0];
}

function diffNightsSimple(checkinDate, checkoutDate) {
  const ci = String(checkinDate || "").slice(0, 10);
  const co = String(checkoutDate || "").slice(0, 10);
  if (!ci || !co) return 1;
  const ms = new Date(`${co}T12:00:00Z`).getTime() - new Date(`${ci}T12:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return 1;
  return Math.max(1, Math.round(ms / 86400000));
}

function getBrasiliaDateStrNow(nowOverride = null) {
  const now = nowOverride instanceof Date ? nowOverride : (nowOverride ? new Date(nowOverride) : new Date());
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function ensureRequesterPortalToken(db, resOrPkg) {
  if (!resOrPkg) return "";
  let targets = [];
  if (typeof resOrPkg === "string") {
    const raw = resOrPkg.trim();
    if (!raw) return "";
    if (isPackageCode(raw)) {
      targets = getPackageReservations(db, raw);
    } else if (Array.isArray(db?.reservations)) {
      const upper = raw.toUpperCase();
      const found = db.reservations.find(
        (r) => r && (String(r.code || "").toUpperCase() === upper || String(r.reservationCode || "").toUpperCase() === upper || String(r.id) === raw)
      );
      if (found) {
        targets = (found.packageCode || found.packageId)
          ? getPackageReservations(db, found)
          : [found];
      }
    }
  } else if (typeof resOrPkg === "object") {
    const pkgRef = getPackageIdFromTarget(resOrPkg);
    if (pkgRef && Array.isArray(db?.reservations)) {
      targets = getPackageReservations(db, pkgRef);
    }
    if (!targets.includes(resOrPkg)) {
      targets.push(resOrPkg);
    }
  }

  if (targets.length === 0) return "";
  let token =
    targets.find((r) => r && typeof r.requesterPortalToken === "string" && r.requesterPortalToken.trim().length >= 8)
      ?.requesterPortalToken.trim() || "";
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
  }
  for (const r of targets) {
    if (r && typeof r === "object") {
      r.requesterPortalToken = token;
    }
  }
  return token;
}

export function isPackageCode(code) {
  return /^PKG-[A-Z0-9]{4,12}$/i.test(String(code || "").trim());
}

export function generatePackageCode(db) {
  const existing = new Set(
    (Array.isArray(db?.reservations) ? db.reservations : [])
      .map((r) => String(r?.packageCode || r?.packageId || "").toUpperCase().trim())
      .filter(Boolean)
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `PKG-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `PKG-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function isPackageItemCancelled(r) {
  const st = String(r?.status || "").toLowerCase().trim();
  return st === "cancelada" || st === "cancelado" || st === "cancelled";
}

export function isPackageItemExpired(r) {
  return String(r?.status || "").toLowerCase().trim() === "expirada";
}

export function isPackageItemActive(r) {
  return Boolean(r) && !isPackageItemCancelled(r) && !isPackageItemExpired(r);
}

export function isReservationSettledInPackage(r) {
  if (!r) return false;
  const total = Number(r.totalAmount) || 0;
  const paid = Number(r.paidAmount) || 0;
  const st = String(r.status || "").toLowerCase().trim();
  const isUnpaidPre = st === "pre_reserva" && r.paymentStatus !== "pago_total" && r.paymentStatus !== "pago" && r.paymentStatus !== "paid";
  return Boolean(
    r.paymentStatus === "pago_total" ||
    r.paymentStatus === "pago" ||
    r.paymentStatus === "paid" ||
    (!isUnpaidPre && total > 0 && paid >= total - 0.01)
  );
}

export function getPackageIdFromTarget(packageIdOrRes) {
  if (!packageIdOrRes) return "";
  if (typeof packageIdOrRes === "string") return packageIdOrRes.trim().toUpperCase();
  return String(packageIdOrRes.packageId || packageIdOrRes.packageCode || "").trim().toUpperCase();
}

export function getPackageReservations(db, packageIdOrRes) {
  const pkgId = getPackageIdFromTarget(packageIdOrRes);
  if (!pkgId || !Array.isArray(db?.reservations)) return [];
  return db.reservations
    .filter((r) => {
      const rPkg = String(r?.packageId || r?.packageCode || "").trim().toUpperCase();
      return rPkg === pkgId;
    })
    .sort((a, b) => {
      const idxA = Number(a?.packageIndex) || 999;
      const idxB = Number(b?.packageIndex) || 999;
      if (idxA !== idxB) return idxA - idxB;
      return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
}

export function getPrimaryPackageReservation(db, packageIdOrRes) {
  const all = getPackageReservations(db, packageIdOrRes);
  if (all.length === 0) return null;
  const activePrimary = all.find((r) => isPackageItemActive(r) && r.isPackagePrimary);
  if (activePrimary) return activePrimary;
  const firstActive = all.find((r) => isPackageItemActive(r));
  if (firstActive) return firstActive;
  const firstExpired = all.find((r) => isPackageItemExpired(r));
  if (firstExpired) return firstExpired;
  return all[0];
}

export function isFlatGuestCredentialIncomplete(r) {
  if (!r || !isPackageItemActive(r)) return false;
  const guestCount = Math.max(1, Number(r.guestCount || r.adults) || 1);
  const guestsArr = Array.isArray(r.guests) ? r.guests : [];
  const g1Name = String(r.guestName || guestsArr[0]?.name || "").trim();
  const g1Phone = String(r.guestPhone || guestsArr[0]?.phone || "").replace(/\D/g, "");
  const isPlaceholder = (nm) =>
    !nm ||
    /a definir|informar depois|pendente|h[oó]spede\s*\d*$/i.test(nm);
  if (r.guestPending || r.informGuestsLater || isPlaceholder(g1Name) || g1Phone.length < 10) {
    return true;
  }
  if (guestCount >= 2) {
    const g2 = guestsArr[1] || null;
    const g2Name = String(g2?.name || "").trim();
    if (r.guest2InformLater || g2?.informLater || isPlaceholder(g2Name)) {
      return true;
    }
  }
  if (guestCount >= 3) {
    const g3 = guestsArr[2] || null;
    const g3Name = String(g3?.name || "").trim();
    if (r.guest3InformLater || g3?.informLater || isPlaceholder(g3Name)) {
      return true;
    }
  }
  return false;
}

/**
 * Rateio automático do pacote (soma normal, desconto em R$, desconto em % ou valor fechado)
 * mantendo soma exata até o centavo e ajustando `dailyRates` para coerência contábil.
 * Quando `pricingConfig.ratesAlreadyProrated === true`, preserva as `dailyRates[]` já rateadas pela UI sem aplicar desconto em dobro.
 */
export function applyPackageRateioToDraftFlats(flatDrafts = [], pricingConfig = {}) {
  if (!Array.isArray(flatDrafts) || flatDrafts.length === 0) {
    return {
      mode: "sum",
      rawSum: 0,
      targetTotal: 0,
      discountApplied: 0,
      items: []
    };
  }

  const modeRaw = String(pricingConfig?.mode || "sum").toLowerCase().trim();
  const mode = ["sum", "discount_amount", "discount_pct", "fixed_total"].includes(modeRaw)
    ? modeRaw
    : "sum";

  if (pricingConfig?.ratesAlreadyProrated === true || pricingConfig?.alreadyProrated === true) {
    const adjusted = flatDrafts.map((draft) => {
      const nightsCount = Math.max(1, Number(draft?.nightsCount) || 1);
      const rawCharges = Array.isArray(draft?.charges) ? draft.charges.map((c) => ({ ...c })) : [];
      const chargesSum = round2(rawCharges.reduce((s, c) => s + (Number(c?.amount) || 0), 0));

      const existingDailyRates = Array.isArray(draft?.dailyRates)
        ? draft.dailyRates.map((cur) => ({
            ...cur,
            rate: Math.max(0, round2(Number(cur?.rate ?? cur?.amount) || 0))
          }))
        : [];

      let preservedTotal = round2(Number(draft?.totalAmount ?? draft?.baseTotalAmount) || 0);
      let finalDailyRates = existingDailyRates;

      if (finalDailyRates.length > 0) {
        const ratesSum = round2(finalDailyRates.reduce((s, r) => s + (Number(r?.rate) || 0), 0));
        if (preservedTotal <= 0 && (ratesSum > 0 || chargesSum > 0)) {
          preservedTotal = round2(ratesSum + chargesSum);
        }
      } else {
        const targetAccom = Math.max(0, round2(preservedTotal - chargesSum));
        const baseDaily = round2(Math.floor((targetAccom / nightsCount) * 100) / 100);
        const rem = round2(targetAccom - baseDaily * nightsCount);
        const startMs = draft?.checkinDate
          ? new Date(`${draft.checkinDate}T12:00:00Z`).getTime()
          : Date.now();
        finalDailyRates = [];
        for (let i = 0; i < nightsCount; i++) {
          finalDailyRates.push({
            date: new Date(startMs + i * 86400000).toISOString().slice(0, 10),
            rate: i === nightsCount - 1 ? Math.max(0, round2(baseDaily + rem)) : baseDaily,
            channel: draft?.channel || "direto"
          });
        }
      }

      const finalRatesSum = round2(finalDailyRates.reduce((s, r) => s + (Number(r?.rate) || 0), 0));
      const avgDailyRate = nightsCount > 0 ? round2(finalRatesSum / nightsCount) : finalRatesSum;
      const origBase = draft?.originalBaseTotalAmount != null
        ? round2(Number(draft.originalBaseTotalAmount) || 0)
        : preservedTotal;

      return {
        ...draft,
        originalBaseTotalAmount: origBase,
        totalAmount: preservedTotal,
        dailyRate: avgDailyRate,
        dailyRates: finalDailyRates,
        charges: rawCharges,
        proratedDiscountAmount: round2(Math.max(0, origBase - preservedTotal))
      };
    });

    const targetTotal = round2(adjusted.reduce((acc, it) => acc + (Number(it.totalAmount) || 0), 0));
    let rawSum = targetTotal;
    if (adjusted.some((it) => Number(it.originalBaseTotalAmount) > Number(it.totalAmount))) {
      rawSum = round2(adjusted.reduce((acc, it) => acc + (Number(it.originalBaseTotalAmount) || 0), 0));
    } else if (mode === "discount_amount" && Number(pricingConfig?.discountAmount) > 0) {
      rawSum = round2(targetTotal + Math.max(0, Number(pricingConfig.discountAmount) || 0));
    } else if (mode === "discount_pct" && Number(pricingConfig?.discountPct) > 0 && Number(pricingConfig?.discountPct) < 100) {
      rawSum = round2(targetTotal / (1 - Number(pricingConfig.discountPct) / 100));
    }

    return {
      mode,
      rawSum,
      targetTotal,
      discountApplied: round2(Math.max(0, rawSum - targetTotal)),
      items: adjusted
    };
  }

  const rawSum = round2(
    flatDrafts.reduce((acc, item) => acc + (Number(item?.baseTotalAmount) || 0), 0)
  );

  let targetTotal = rawSum;
  if (mode === "discount_amount") {
    const disc = Math.max(0, Number(pricingConfig?.discountAmount) || 0);
    targetTotal = Math.max(0, round2(rawSum - disc));
  } else if (mode === "discount_pct") {
    const pct = Math.min(100, Math.max(0, Number(pricingConfig?.discountPct) || 0));
    targetTotal = Math.max(0, round2(rawSum * (1 - pct / 100)));
  } else if (mode === "fixed_total") {
    const fixed = Number(pricingConfig?.fixedTotal);
    if (Number.isFinite(fixed) && fixed >= 0) {
      targetTotal = round2(fixed);
    }
  }

  const discountApplied = round2(rawSum - targetTotal);
  const count = flatDrafts.length;
  let runningAllocated = 0;

  const adjusted = flatDrafts.map((draft, idx) => {
    const baseTotal = round2(Number(draft?.baseTotalAmount) || 0);
    const weight = rawSum > 0 ? baseTotal / rawSum : 1 / count;
    const proratedTotal =
      idx === count - 1
        ? round2(targetTotal - runningAllocated)
        : round2(targetTotal * weight);
    runningAllocated = round2(runningAllocated + proratedTotal);

    const nightsCount = Math.max(1, Number(draft?.nightsCount) || 1);
    const rawCharges = Array.isArray(draft?.charges) ? draft.charges.map((c) => ({ ...c })) : [];
    let chargesSum = round2(rawCharges.reduce((s, c) => s + (Number(c?.amount) || 0), 0));

    let finalCharges = rawCharges;
    if (chargesSum > proratedTotal && chargesSum > 0) {
      const chargeScale = proratedTotal / chargesSum;
      let accChg = 0;
      finalCharges = rawCharges.map((c, cIdx) => {
        const nextAmt =
          cIdx === rawCharges.length - 1
            ? Math.max(0, round2(proratedTotal - accChg))
            : Math.max(0, round2((Number(c.amount) || 0) * chargeScale));
        accChg = round2(accChg + nextAmt);
        return { ...c, amount: nextAmt };
      });
      chargesSum = round2(finalCharges.reduce((s, c) => s + (Number(c?.amount) || 0), 0));
    }

    const targetAccommodationTotal = Math.max(0, round2(proratedTotal - chargesSum));
    const baseDailyRate = round2(Math.floor((targetAccommodationTotal / nightsCount) * 100) / 100);
    const rateRemainder = round2(targetAccommodationTotal - baseDailyRate * nightsCount);

    const existingDailyRates = Array.isArray(draft?.dailyRates) ? draft.dailyRates : [];
    const adjustedDailyRates = [];
    if (existingDailyRates.length === nightsCount && nightsCount > 0) {
      const oldRatesSum = existingDailyRates.reduce((s, r) => s + (Number(r?.rate ?? r?.amount) || 0), 0);
      let accRates = 0;
      for (let i = 0; i < nightsCount; i++) {
        const cur = existingDailyRates[i];
        const w = oldRatesSum > 0 ? (Number(cur?.rate ?? cur?.amount) || 0) / oldRatesSum : 1 / nightsCount;
        const nightVal =
          i === nightsCount - 1
            ? Math.max(0, round2(targetAccommodationTotal - accRates))
            : Math.max(0, round2(targetAccommodationTotal * w));
        accRates = round2(accRates + nightVal);
        adjustedDailyRates.push({
          ...cur,
          rate: nightVal
        });
      }
    } else {
      const startMs = draft?.checkinDate
        ? new Date(`${draft.checkinDate}T12:00:00Z`).getTime()
        : Date.now();
      for (let i = 0; i < nightsCount; i++) {
        const dStr = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
        const nightVal =
          i === nightsCount - 1
            ? Math.max(0, round2(baseDailyRate + rateRemainder))
            : baseDailyRate;
        adjustedDailyRates.push({
          date: dStr,
          rate: nightVal,
          channel: draft?.channel || "direto"
        });
      }
    }

    const avgDailyRate = nightsCount > 0 ? round2(targetAccommodationTotal / nightsCount) : targetAccommodationTotal;

    return {
      ...draft,
      originalBaseTotalAmount: baseTotal,
      totalAmount: proratedTotal,
      dailyRate: avgDailyRate,
      dailyRates: adjustedDailyRates,
      charges: finalCharges,
      proratedDiscountAmount: round2(baseTotal - proratedTotal)
    };
  });

  return {
    mode,
    rawSum,
    targetTotal,
    discountApplied,
    items: adjusted
  };
}

export function computePackageSummary(db, packageIdOrRes, opts = {}) {
  const all = getPackageReservations(db, packageIdOrRes);
  if (all.length === 0) return null;

  const computeCardFn =
    typeof opts.computeCardAmountFromPix === "function"
      ? opts.computeCardAmountFromPix
      : (v) => round2((Number(v) || 0) / 0.95);
  const baseUrl = String(opts.baseUrl || "https://corpflats.com.br").replace(/\/+$/, "");

  const pkgCode = String(all[0].packageCode || all[0].packageId || "").toUpperCase();
  const activeItems = all.filter((r) => isPackageItemActive(r));
  const expiredItems = all.filter((r) => isPackageItemExpired(r));
  const cancelledItems = all.filter((r) => isPackageItemCancelled(r));

  const primary = getPrimaryPackageReservation(db, pkgCode) || all[0];
  const requesterPortalToken = ensureRequesterPortalToken(db, pkgCode || primary);
  const packagePortalPath = requesterPortalToken
    ? `/solicitante/${encodeURIComponent(pkgCode)}?t=${encodeURIComponent(requesterPortalToken)}`
    : `/solicitante/${encodeURIComponent(pkgCode)}`;
  const todayBr = getBrasiliaDateStrNow();

  let totalAmount = 0;
  let paidAmount = 0;
  let pendingAmount = 0;

  for (const r of activeItems) {
    const rTotal = round2(Number(r.totalAmount) || 0);
    const settled = isReservationSettledInPackage(r);
    const rPaid = settled ? rTotal : round2(Math.min(rTotal, Number(r.paidAmount) || 0));
    totalAmount = round2(totalAmount + rTotal);
    paidAmount = round2(paidAmount + rPaid);
    pendingAmount = round2(pendingAmount + Math.max(0, round2(rTotal - rPaid)));
  }

  const cardTotalAmount = computeCardFn(totalAmount);
  const cardPendingAmount = computeCardFn(pendingAmount);

  const missingCredentialItems = activeItems.filter((r) => isFlatGuestCredentialIncomplete(r));
  const activeCodes = activeItems.map((r) => r.code).filter(Boolean);
  const missingCredentialCodes = missingCredentialItems.map((r) => r.code).filter(Boolean);

  const batchCredentialPath =
    activeCodes.length > 0
      ? `/credenciamento/${encodeURIComponent(pkgCode)}?codes=${encodeURIComponent(activeCodes.join(","))}`
      : `/credenciamento/${encodeURIComponent(pkgCode)}`;

  const isAllPaid = activeItems.length > 0 && pendingAmount <= 0.01;
  const isAllCancelled = activeItems.length === 0 && expiredItems.length === 0 && cancelledItems.length > 0;
  const isAllExpired = activeItems.length === 0 && expiredItems.length > 0;

  const primaryPm = String(primary?.paymentMethod || "").toLowerCase().trim();
  const isFaturadoPkg = Boolean(
    primary?.isFaturadoBoleto ||
    primaryPm === "boleto_faturado" ||
    primaryPm === "faturado_boleto" ||
    primaryPm === "boleto" ||
    primaryPm === "faturado_pj" ||
    primaryPm === "faturado_b2b" ||
    String(primary?.b2bPaymentType || "").toUpperCase() === "FATURADO"
  );
  const canExposePkgPay = !isAllPaid && !isFaturadoPkg && activeItems.length > 0;

  const sharedPixCopiaECola = canExposePkgPay
    ? primary.packagePixCopiaECola || primary.pixCopiaECola || activeItems.find((x) => x.pixCopiaECola)?.pixCopiaECola || null
    : null;
  const sharedPixTxId = canExposePkgPay
    ? primary.packagePixTxId || primary.pixTxId || activeItems.find((x) => x.pixTxId)?.pixTxId || null
    : null;
  const sharedMpInitPoint = canExposePkgPay
    ? primary.packageMpInitPoint || primary.mpInitPoint || null
    : null;

  const consolidatedInvoice =
    all.find((r) => r.consolidatedInvoiceId || r.numeroNfse || r.nfseNumber) || null;

  const consolidatedBoletoId =
    all.flatMap((r) => (Array.isArray(r.boletoIds) ? r.boletoIds : [])).find(Boolean) ||
    all.find((r) => r.packageBoletoId)?.packageBoletoId ||
    null;

  return {
    packageId: pkgCode,
    packageCode: pkgCode,
    totalFlatsCreated: all.length,
    activeFlatsCount: activeItems.length,
    expiredFlatsCount: expiredItems.length,
    cancelledFlatsCount: cancelledItems.length,
    primaryReservationId: primary?.id || null,
    primaryReservationCode: primary?.code || null,
    requesterName:
      primary?.requesterInfo?.name ||
      primary?.requesterName ||
      primary?.companyName ||
      primary?.agencyName ||
      primary?.guestName ||
      "Solicitante",
    requesterPhone:
      primary?.requesterInfo?.whatsapp ||
      primary?.requesterInfo?.phone ||
      primary?.requesterPhone ||
      primary?.guestPhone ||
      "",
    requesterEmail:
      primary?.requesterInfo?.email ||
      primary?.requesterEmail ||
      primary?.guestEmail ||
      "",
    requesterDocument:
      primary?.requesterInfo?.cpf ||
      primary?.companyCnpj ||
      primary?.agencyCnpj ||
      primary?.guestDocument ||
      "",
    requesterType: primary?.requesterType || "other_person",
    isFaturadoBoleto: Boolean(primary?.isFaturadoBoleto),
    paymentMethod: primary?.paymentMethod || "pix",
    packagePricingMode: primary?.packagePricingMode || "sum",
    packageDiscountAmount: round2(Number(primary?.packageDiscountAmount) || 0),
    totalAmount,
    paidAmount,
    pendingAmount,
    cardTotalAmount,
    cardPendingAmount,
    isPaid: isAllPaid,
    isAllCancelled,
    isAllExpired,
    expiresAt: primary?.expiresAt || activeItems.find((r) => r.expiresAt)?.expiresAt || null,
    pixTxId: sharedPixTxId,
    pixCopiaECola: sharedPixCopiaECola,
    mpInitPoint: sharedMpInitPoint,
    needsGuestCredentials: missingCredentialItems.length > 0,
    missingCredentialCodes,
    batchCredentialPath,
    batchCredentialUrl: `${baseUrl}${batchCredentialPath}`,
    requesterPortalToken,
    packagePortalPath,
    packagePortalUrl: `${baseUrl}${packagePortalPath}`,
    packageCopyPixUrl: `${baseUrl}/copiar-pix/${encodeURIComponent(pkgCode)}`,
    consolidatedInvoiceId: consolidatedInvoice?.consolidatedInvoiceId || consolidatedInvoice?.invoiceId || null,
    consolidatedNfseNumber: consolidatedInvoice?.numeroNfse || consolidatedInvoice?.nfseNumber || null,
    consolidatedBoletoId,
    items: all.map((r, i) => {
      const gArr = Array.isArray(r.guests) ? r.guests : [];
      const occ = Math.max(1, Math.min(3, Number(r.guestCount || r.adults) || 1));
      const rTot = round2(Number(r.totalAmount) || 0);
      const rSettled = isReservationSettledInPackage(r);
      const rPaid = rSettled ? rTot : round2(Math.min(rTot, Number(r.paidAmount) || 0));
      const isPlaceholderNm = (nm) => !nm || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(String(nm).trim());

      const g1RawName = String(r.guestName || gArr[0]?.name || "").trim();
      const g1NameClean = isPlaceholderNm(g1RawName) ? "" : g1RawName;
      const g1Phone = String(r.guestPhone || gArr[0]?.phone || gArr[0]?.whatsapp || "").trim();
      const g1Doc = String(r.guestCpf || r.guestDocument || gArr[0]?.cpf || gArr[0]?.document || "").trim();
      const g1Email = String(r.guestEmail || gArr[0]?.email || "").trim();

      const g2Obj = gArr[1] || {};
      const g2Name = isPlaceholderNm(g2Obj.name) ? "" : String(g2Obj.name || "").trim();
      const g2Phone = String(g2Obj.phone || g2Obj.whatsapp || "").trim();
      const g2Doc = String(g2Obj.cpf || g2Obj.document || "").trim();
      const g2Email = String(g2Obj.email || "").trim();

      const g3Obj = gArr[2] || {};
      const g3Name = isPlaceholderNm(g3Obj.name) ? "" : String(g3Obj.name || "").trim();
      const g3Phone = String(g3Obj.phone || g3Obj.whatsapp || "").trim();
      const g3Doc = String(g3Obj.cpf || g3Obj.document || "").trim();
      const g3Email = String(g3Obj.email || "").trim();

      const guestsNormalized = [
        {
          index: 1,
          isMain: true,
          name: g1NameClean,
          phone: g1Phone,
          email: g1Email,
          cpf: g1Doc,
          document: g1Doc,
          docType: gArr[0]?.docType || r.guestDocType || "CPF",
          informLater: Boolean(r.informGuestsLater || r.guestPending || gArr[0]?.informLater),
          hasCompletedCheckin: Boolean(gArr[0]?.hasCompletedCheckin || r.preCheckinCompleted || r.fnhrCompleted)
        }
      ];
      if (occ >= 2 || g2Name || g2Phone) {
        guestsNormalized.push({
          index: 2,
          isMain: false,
          name: g2Name,
          phone: g2Phone,
          email: g2Email,
          cpf: g2Doc,
          document: g2Doc,
          docType: g2Obj.docType || "CPF",
          informLater: Boolean(r.guest2InformLater || g2Obj.informLater),
          hasCompletedCheckin: Boolean(g2Obj.hasCompletedCheckin)
        });
      }
      if (occ >= 3 || g3Name || g3Phone) {
        guestsNormalized.push({
          index: 3,
          isMain: false,
          name: g3Name,
          phone: g3Phone,
          email: g3Email,
          cpf: g3Doc,
          document: g3Doc,
          docType: g3Obj.docType || "CPF",
          informLater: Boolean(r.guest3InformLater || g3Obj.informLater),
          hasCompletedCheckin: Boolean(g3Obj.hasCompletedCheckin)
        });
      }

      const missingFields = [];
      if (!g1NameClean || r.informGuestsLater || r.guestPending) missingFields.push("Nome do Hóspede 1");
      if (g1Phone.replace(/\D/g, "").length < 10) missingFields.push("WhatsApp do Hóspede 1");
      if (!g1Doc) missingFields.push("CPF do Hóspede 1");
      if (!g1Email) missingFields.push("E-mail do Hóspede 1");
      if (occ >= 2) {
        if (!g2Name || r.guest2InformLater || g2Obj.informLater) missingFields.push("Nome do Hóspede 2");
        if (g2Phone.replace(/\D/g, "").length < 10) missingFields.push("WhatsApp do Hóspede 2");
      }
      if (occ >= 3) {
        if (!g3Name || r.guest3InformLater || g3Obj.informLater) missingFields.push("Nome do Hóspede 3");
        if (g3Phone.replace(/\D/g, "").length < 10) missingFields.push("WhatsApp do Hóspede 3");
      }

      const activePhoneAlerts = Array.isArray(r.guestPhoneCorrectionRequests)
        ? r.guestPhoneCorrectionRequests.filter((req) => req && req.status === "awaiting_reply")
        : [];
      const guestPhoneInvalid = Boolean(r.guestPhoneInvalid || activePhoneAlerts.length > 0);

      const preCheckinCompleted = Boolean(
        r.preCheckinCompleted ||
        r.fnhrCompleted ||
        r.hasPreCheckin ||
        (gArr.length > 0 && gArr.some((g) => g?.hasCompletedCheckin || g?.status === "CHECKED_IN"))
      );
      const checkedInAt = r.actualCheckinAt || r.checkedInAt || null;
      const checkedOutAt = r.actualCheckoutAt || r.checkoutCompletedAt || r.checkedOutAt || null;

      const stLower = String(r.status || "").toLowerCase().trim();
      const flatCleanObj = Array.isArray(db?.flats)
        ? db.flats.find((fl) => Number(fl.id) === Number(r.flatId) || String(fl.number) === String(r.flatNumber))
        : null;
      const isFlatEmPrep =
        flatCleanObj?.status === "dirty" ||
        flatCleanObj?.status === "cleaning_now" ||
        (Array.isArray(db?.cleaningRequests) &&
          db.cleaningRequests.some(
            (c) =>
              c &&
              !c.isDeleted &&
              !c.isInstructionOnly &&
              !c.isBedAdjustmentOnly &&
              String(c.flatNumber) === String(r.flatNumber) &&
              (c.requestDate === todayBr || c.effectiveDate === todayBr) &&
              ["dirty", "will_clean", "cleaning_now", "in_progress"].includes(String(c.status || "").toLowerCase())
          ));

      let operationalStatus = "pre_checkin_pendente";
      let operationalStatusLabel = "Pré-Check-in Pendente";
      if (isPackageItemCancelled(r)) {
        operationalStatus = "cancelado";
        operationalStatusLabel = "Cancelado";
      } else if (isPackageItemExpired(r)) {
        operationalStatus = "expirado";
        operationalStatusLabel = "Expirado";
      } else if (r.checkoutDone || r.checkoutCompleted || ["concluida", "checked_out", "completed", "checkout"].includes(stLower)) {
        operationalStatus = "checkout_realizado";
        operationalStatusLabel = "Check-out Realizado";
      } else if (r.guestSelfCheckin || r.actualCheckinAt || ["in_house", "checkin", "checked_in"].includes(stLower)) {
        operationalStatus = "hospedado_in_house";
        operationalStatusLabel = "Hospedado";
      } else if (["pre_reserva", "pendente", "pending_payment"].includes(stLower)) {
        operationalStatus = "aguardando_pagamento";
        operationalStatusLabel = "Aguardando Pagamento";
      } else if (!preCheckinCompleted) {
        operationalStatus = "pre_checkin_pendente";
        operationalStatusLabel = "Pré-Check-in Pendente";
      } else if (r.checkinDate && todayBr === String(r.checkinDate).slice(0, 10) && isFlatEmPrep && r.roomReadySentDate !== todayBr) {
        operationalStatus = "em_preparacao";
        operationalStatusLabel = "Em Preparação";
      } else {
        operationalStatus = "pronto_para_checkin";
        operationalStatusLabel = "Pronto para Check-in";
      }

      const guestPortalPath = `/minha-reserva/${encodeURIComponent(r.code)}`;
      const preCheckinPath = `/pre-checkin/${encodeURIComponent(r.code)}`;
      const breakfastPath = `/cafe/${encodeURIComponent(r.code)}`;
      const normalizedVehicle =
        r.vehicle && typeof r.vehicle === "object"
          ? r.vehicle
          : (r.vehiclePlate
              ? {
                  plate: String(r.vehiclePlate || ""),
                  brand: String(r.vehicleBrand || ""),
                  model: String(r.vehicleModel || ""),
                  color: String(r.vehicleColor || "")
                }
              : null);

      return {
        id: r.id,
        code: r.code,
        packageIndex: Number(r.packageIndex) || i + 1,
        flatId: r.flatId,
        flatNumber: r.flatNumber,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        checkinTime: r.checkinTime || "14:00",
        checkoutTime: r.lateCheckoutTime || r.checkoutTime || "12:00",
        nights: diffNightsSimple(r.checkinDate, r.checkoutDate),
        status: r.status || "confirmada",
        operationalStatus,
        operationalStatusLabel,
        isActive: isPackageItemActive(r),
        isCancelled: isPackageItemCancelled(r),
        isExpired: isPackageItemExpired(r),
        isPaid: rSettled,
        guestCount: occ,
        guestName: r.guestName || gArr[0]?.name || "A Definir",
        guestPhone: g1Phone,
        guestEmail: g1Email,
        guestCpf: g1Doc,
        guestDocument: g1Doc,
        guest2Name: g2Name,
        guest2Phone: g2Phone,
        guest2Document: g2Doc,
        guest2Email: g2Email,
        guest3Name: g3Name,
        guest3Phone: g3Phone,
        guest3Document: g3Doc,
        guest3Email: g3Email,
        guests: guestsNormalized,
        missingFields,
        guestPhoneInvalid,
        guestPhoneCorrectionRequests: activePhoneAlerts,
        requesterIsGuest1: Boolean(r.requesterIsGuest1),
        informGuestsLater: Boolean(r.informGuestsLater || r.guestPending),
        guest2InformLater: Boolean(r.guest2InformLater || g2Obj.informLater),
        guest3InformLater: Boolean(r.guest3InformLater || g3Obj.informLater),
        needsCredential: isFlatGuestCredentialIncomplete(r),
        preCheckinCompleted,
        checkedInAt,
        checkedOutAt,
        actualCheckinAt: r.actualCheckinAt || null,
        estimatedArrivalTime: r.estimatedArrivalTime || null,
        flatCleanStatus: isFlatEmPrep ? "em_preparacao" : "limpo",
        includeBreakfast: Boolean(r.includeBreakfast),
        twinBeds: Boolean(r.twinBeds || r.bedType === "twin" || r.bedType === "2 Solteiro"),
        extraMattress: Boolean(r.extraMattress),
        bedType: r.bedType || (r.twinBeds ? "twin" : "queen"),
        earlyCheckinAuthorized: Boolean(r.earlyCheckinAuthorized),
        isFlatLocked: Boolean(r.isFlatLocked || r.flatLocked),
        flatLockReason: String(r.flatLockReason || ""),
        prefersHighFloor: Boolean(r.prefersHighFloor),
        receptionNotes: r.receptionNotes || "",
        specialRequests: r.specialRequests || "",
        notes: r.notes || "",
        vehicle: normalizedVehicle,
        dailyRate: round2(Number(r.dailyRate) || 0),
        totalAmount: rTot,
        paidAmount: rPaid,
        pendingAmount: Math.max(0, round2(rTot - rPaid)),
        refundStatus: r.refundStatus || null,
        refundResolution: r.refundResolution || null,
        refundAmount: round2(Number(r.refundAmount) || 0),
        creditGeneratedId: r.creditGeneratedId || null,
        guestPortalPath,
        guestPortalUrl: `${baseUrl}${guestPortalPath}`,
        preCheckinPath,
        preCheckinUrl: `${baseUrl}${preCheckinPath}`,
        breakfastPath,
        breakfastUrl: r.includeBreakfast ? `${baseUrl}${breakfastPath}` : null
      };
    })
  };
}

/**
 * Recalcula o saldo pendente de todos os flats ativos do pacote e sincroniza
 * 1 único PIX (e invalida link antigo de cartão se o valor mudou).
 */
export async function syncPackagePixAndPaymentLinks(db, packageIdOrRes, deps = {}) {
  const all = getPackageReservations(db, packageIdOrRes);
  if (all.length === 0) return null;

  const pkgCode = String(all[0].packageCode || all[0].packageId || "").toUpperCase();
  const activeItems = all.filter((r) => isPackageItemActive(r));

  all.forEach((r, idx) => {
    r.packageTotalFlats = all.length;
    r.packageActiveFlats = activeItems.length;
    if (!r.packageIndex) r.packageIndex = idx + 1;
    r.isPackagePrimary = false;
  });
  const primary = activeItems[0] || all[0];
  if (primary) primary.isPackagePrimary = true;

  const summaryBefore = computePackageSummary(db, pkgCode, deps);
  if (!summaryBefore) return null;

  const pendingAmt = summaryBefore.pendingAmount;
  const isB2b = Boolean(primary?.agencyId || primary?.b2bReservationNumber || String(primary?.channel || "").toLowerCase().includes("b2b"));
  const isFaturado = Boolean(primary?.isFaturadoBoleto);

  if (activeItems.length === 0 || pendingAmt <= 0.01 || isB2b || isFaturado) {
    if (pendingAmt <= 0.01) {
      for (const r of activeItems) {
        r.packagePixChargedAmount = 0;
      }
    }
    if (typeof deps.saveDatabase === "function") deps.saveDatabase("package_sync_no_pending");
    return computePackageSummary(db, pkgCode, deps);
  }

  const currentCharged = Number(primary.packagePixChargedAmount ?? primary.pixChargedAmount) || 0;
  const currentCopiaECola = primary.packagePixCopiaECola || primary.pixCopiaECola || "";
  const needsFreshPix = !currentCopiaECola || Math.abs(currentCharged - pendingAmt) > 0.01 || Boolean(deps.forceRegeneratePix);

  let pixTxId = primary.packagePixTxId || primary.pixTxId || pkgCode.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  let pixCopiaECola = currentCopiaECola;

  if (needsFreshPix) {
    const debtorName = summaryBefore.requesterName || "Solicitante CorpFlats";
    const debtorDoc = summaryBefore.requesterDocument || "";
    const flatListLabel = activeItems.map((r) => r.flatNumber).join(", ");
    const description = `Pacote ${pkgCode} (${activeItems.length} Flats: ${flatListLabel})`.slice(0, 100);

    let generated = false;
    if (typeof deps.createInterPixCob === "function" && !deps.preferStaticPix) {
      try {
        const interCob = await deps.createInterPixCob({
          amount: pendingAmt,
          description,
          debtorName,
          debtorDocument: debtorDoc,
          reservationCode: pkgCode
        });
        if (interCob && interCob.pixCopiaECola) {
          pixTxId = interCob.txid || pixTxId;
          pixCopiaECola = interCob.pixCopiaECola;
          generated = true;
        }
      } catch (err) {
        console.warn(`[Package PIX] Fallback para PIX estático em ${pkgCode}:`, err?.message || err);
      }
    }

    if (!generated && typeof deps.generateStaticPixPayload === "function") {
      const cleanTxId = `${pkgCode.replace(/[^A-Za-z0-9]/g, "")}${Date.now().toString(36).slice(-4)}`.slice(0, 25);
      pixTxId = cleanTxId;
      pixCopiaECola = deps.generateStaticPixPayload({
        pixKey: deps.defaultPixKey || db?.settings?.interConfig?.pixKey || "47964813000165",
        amount: pendingAmt,
        merchantName: "CORPFLATS LTDA",
        merchantCity: "CAMPOS DOS GOYTACAZES",
        txid: cleanTxId
      });
    }
  }

  const cardPending = summaryBefore.cardPendingAmount;

  for (const r of activeItems) {
    if (!isReservationSettledInPackage(r)) {
      r.pixTxId = pixTxId;
      r.pixCopiaECola = pixCopiaECola;
      r.pixChargedAmount = pendingAmt;
      r.packagePixTxId = pixTxId;
      r.packagePixCopiaECola = pixCopiaECola;
      r.packagePixChargedAmount = pendingAmt;

      if (
        r.mpInitPoint &&
        (!r.packageMpChargedAmount || Math.abs(Number(r.packageMpChargedAmount) - cardPending) > 0.01)
      ) {
        r.mpInitPoint = null;
        r.mpPreferenceId = null;
        r.mpChargedAmount = null;
        r.packageMpInitPoint = null;
        r.packageMpPreferenceId = null;
        r.packageMpChargedAmount = null;
      }
    }
  }

  if (typeof deps.saveDatabase === "function") {
    deps.saveDatabase("package_pix_synced");
  }

  return computePackageSummary(db, pkgCode, deps);
}

function formatDateBrShort(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return "";
  const [y, m, d] = isoStr.slice(0, 10).split("-");
  if (!y || !m || !d) return isoStr;
  return `${d}/${m}/${y}`;
}

function formatMoneyBr(val) {
  return (Number(val) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PHONE_EXISTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getPhoneNineDigitVariants(cleanDigits) {
  const digits = String(cleanDigits || "").replace(/\D/g, "");
  if (!digits) return [];
  const list = [digits];
  if (digits.startsWith("55")) {
    if (digits.length === 13 && digits[4] === "9") {
      list.push(digits.slice(0, 4) + digits.slice(5));
    } else if (digits.length === 12) {
      list.push(digits.slice(0, 4) + "9" + digits.slice(4));
    }
  }
  return Array.from(new Set(list));
}

export async function verifyWhatsAppPhoneActive(phone, zapiConfig = null, db = null, deps = {}) {
  const cleanFn = typeof deps.cleanWhatsAppPhone === "function" ? deps.cleanWhatsAppPhone : cleanPhoneLocal;
  const cleaned = cleanFn(phone);
  if (!cleaned || cleaned.length < 10) {
    return {
      valid: false,
      checked: true,
      phone: cleaned,
      digits: cleaned,
      reason: "invalid_phone_format",
      variantsTested: []
    };
  }

  const effectiveCfg = zapiConfig || db?.zapiConfig || db?.settings?.zapiConfig || null;
  const variants = getPhoneNineDigitVariants(cleaned);
  const nowMs = Date.now();
  const forceRefresh = Boolean(deps.forceRefresh);

  if (db && (!db.whatsappPhoneExistsCache || typeof db.whatsappPhoneExistsCache !== "object")) {
    db.whatsappPhoneExistsCache = {};
  }

  let checker =
    typeof deps.checkZapiPhoneExists === "function"
      ? deps.checkZapiPhoneExists
      : (typeof globalThis.__corpflatsCheckZapiPhoneExists === "function"
          ? globalThis.__corpflatsCheckZapiPhoneExists
          : null);

  if (!checker && effectiveCfg?.instanceId?.trim() && effectiveCfg?.token?.trim()) {
    checker = async (targetPhone, cfg) => {
      const c = cfg || effectiveCfg;
      const base = (c.baseUrl || "https://api.z-api.io").replace(/\/+$/, "");
      const url = `${base}/instances/${c.instanceId.trim()}/token/${c.token.trim()}/phone-exists/${targetPhone}`;
      const headers = {};
      if (c.clientToken?.trim()) headers["Client-Token"] = c.clientToken.trim();
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            exists: data.exists !== false,
            phone: data.phone ? cleanFn(data.phone) : targetPhone,
            checked: true,
            data
          };
        }
        return { exists: true, phone: targetPhone, checked: false };
      } catch (err) {
        return { exists: true, phone: targetPhone, checked: false, error: err?.message || String(err) };
      }
    };
  }

  const variantsTested = [];
  let anyChecked = false;

  for (const variant of variants) {
    const cached = !forceRefresh ? db?.whatsappPhoneExistsCache?.[variant] : null;
    if (cached && cached.checked && nowMs - Number(cached.checkedAt || 0) < PHONE_EXISTS_CACHE_TTL_MS) {
      anyChecked = true;
      variantsTested.push({ phone: variant, exists: Boolean(cached.exists), checked: true, fromCache: true });
      if (cached.exists) {
        const resolved = cached.resolvedPhone || variant;
        return { valid: true, checked: true, fromCache: true, phone: resolved, digits: resolved, variantsTested };
      }
      continue;
    }

    if (typeof checker !== "function") {
      continue;
    }

    try {
      const res = await checker(variant, effectiveCfg);
      if (res && res.checked) {
        anyChecked = true;
        const resolved = res.phone ? cleanFn(res.phone) : variant;
        const exists = res.exists !== false;
        if (db?.whatsappPhoneExistsCache) {
          db.whatsappPhoneExistsCache[variant] = {
            exists,
            resolvedPhone: resolved,
            checked: true,
            checkedAt: nowMs
          };
        }
        variantsTested.push({ phone: variant, exists, checked: true });
        if (exists) {
          return { valid: true, checked: true, phone: resolved, digits: resolved, variantsTested };
        }
      } else {
        variantsTested.push({ phone: variant, exists: true, checked: false });
      }
    } catch (err) {
      variantsTested.push({ phone: variant, exists: true, checked: false, error: err?.message || String(err) });
    }
  }

  if (anyChecked && variantsTested.some((v) => v.checked) && variantsTested.filter((v) => v.checked).every((v) => v.exists === false)) {
    return {
      valid: false,
      checked: true,
      phone: cleaned,
      digits: cleaned,
      reason: "no_whatsapp_account",
      variantsTested
    };
  }

  return {
    valid: true,
    checked: false,
    phone: cleaned,
    digits: cleaned,
    reason: "zapi_unavailable_unverified",
    variantsTested
  };
}

export async function registerAndNotifyInvalidGuestPhone(db, r, target = {}, deps = {}) {
  if (!db || !r) return { registered: false, notified: false, reason: "missing_context" };

  const guestIndex = Math.max(1, Number(target.index ?? target.guestIndex ?? 1));
  const guestName = String(
    target.name ||
    target.guestName ||
    (guestIndex === 1 ? r.guestName : r.guests?.[guestIndex - 1]?.name) ||
    `Hóspede ${guestIndex}`
  ).trim();
  const rawInvalidPhone = String(
    target.phone ||
    (guestIndex === 1 ? r.guestPhone : r.guests?.[guestIndex - 1]?.phone || r.guests?.[guestIndex - 1]?.whatsapp) ||
    ""
  ).trim();
  const invalidDigits = rawInvalidPhone.replace(/\D/g, "");
  const reason = String(target.reason || (invalidDigits.length < 10 ? "invalid_phone_format" : "no_whatsapp_account"));

  const cleanFn = typeof deps.cleanWhatsAppPhone === "function" ? deps.cleanWhatsAppPhone : cleanPhoneLocal;
  const rawReqPhone = String(
    r.requesterInfo?.whatsapp ||
    r.requesterInfo?.phone ||
    r.requesterPhone ||
    ""
  ).trim();
  const reqDigits = cleanFn(rawReqPhone);
  const reqName = String(r.requesterInfo?.name || r.requesterName || r.companyName || r.agencyName || "Solicitante").trim();

  if (target.isSameAsRequester || (invalidDigits.length >= 8 && reqDigits && phonesEndMatch(reqDigits, invalidDigits))) {
    return { registered: false, notified: false, reason: "same_as_requester" };
  }

  const dedupKey = `${r.id || r.code}:${guestIndex}:${invalidDigits || "empty"}`;
  if (inFlightInvalidGuestPhoneAlerts.has(dedupKey)) {
    return { registered: false, notified: false, reason: "in_flight_dedup" };
  }

  if (!Array.isArray(r.guestPhoneCorrectionRequests)) {
    r.guestPhoneCorrectionRequests = [];
  }

  const alreadyNotified = r.guestPhoneCorrectionRequests.some(
    (req) =>
      req &&
      req.status === "awaiting_reply" &&
      Number(req.guestIndex) === guestIndex &&
      String(req.invalidPhoneDigits || "") === invalidDigits &&
      Boolean(req.whatsappSent)
  );
  if (alreadyNotified) {
    return { registered: false, notified: false, reason: "already_notified" };
  }

  const nowIso = new Date().toISOString();
  for (const prev of r.guestPhoneCorrectionRequests) {
    if (prev && prev.status === "awaiting_reply" && Number(prev.guestIndex) === guestIndex) {
      prev.status = "superseded";
      prev.resolvedAt = nowIso;
    }
  }

  const reqEntry = {
    id: `gph_${r.id || r.code}_${guestIndex}_${Date.now()}`,
    status: "awaiting_reply",
    packageCode: r.packageCode || r.packageId || null,
    reservationId: r.id ?? null,
    reservationCode: r.code || "",
    flatNumber: String(r.flatNumber || ""),
    guestIndex,
    guestName,
    invalidPhone: rawInvalidPhone,
    invalidPhoneDigits: invalidDigits,
    requesterPhone: reqDigits || rawReqPhone,
    requesterName: reqName,
    reason,
    source: target.source || "dispatch_instructions",
    notifiedAt: nowIso,
    whatsappSent: false,
    correctedPhone: null,
    resolvedAt: null
  };
  r.guestPhoneCorrectionRequests.push(reqEntry);
  r.guestPhoneInvalid = true;

  const notifyPanelFn = typeof deps.createNotification === "function"
    ? deps.createNotification
    : globalThis.__corpflatsCreateNotification;

  if (!reqDigits || reqDigits.length < 10) {
    if (typeof notifyPanelFn === "function") {
      try {
        notifyPanelFn({
          category: "pre_checkin",
          title: `⚠️ Telefone sem WhatsApp — Flat ${r.flatNumber} (${guestName})`,
          message: `O telefone de ${guestName} (${rawInvalidPhone || "vazio"}) não possui WhatsApp ativo e não há WhatsApp do Solicitante para aviso automático.`,
          severity: "warning",
          metadata: {
            reservationId: r.id,
            reservationCode: r.code,
            packageCode: r.packageCode || null,
            flatNumber: r.flatNumber,
            guestIndex,
            guestName,
            invalidPhone: rawInvalidPhone
          },
          targetUrl: "/reservas"
        });
      } catch (_) {}
    }
    if (typeof deps.saveDatabase === "function") deps.saveDatabase("guest_phone_invalid_no_requester");
    return { registered: true, notified: false, request: reqEntry, reason: "missing_requester_phone" };
  }

  const reqFirst = reqName.split(/\s+/)[0] || "Solicitante";
  const pkgRef = r.packageCode || r.packageId;
  const pkgLabel = pkgRef ? ` (Pacote *${pkgRef}*)` : "";
  const msgText =
    `Olá, *${reqFirst}*! ⚠️\n\n` +
    `Tentamos enviar as instruções de check-in do *Flat ${r.flatNumber}*${pkgLabel}, ` +
    `mas o número informado para *${guestName}* (*${rawInvalidPhone || "não informado"}*) *não possui WhatsApp ativo*.\n\n` +
    `Por favor, *responda aqui mesmo neste WhatsApp* com o número correto (com DDD) de *${guestName}* para liberarmos o acesso e reenviarmos as instruções imediatamente!`;

  const cleanBase = String(deps.baseUrl || db?.settings?.baseUrl || "https://corpflats.com.br").replace(/\/+$/, "");
  const pkgToken = pkgRef ? ensureRequesterPortalToken(db, r) : ensureRequesterPortalToken(db, r);
  const portalUrl = pkgRef
    ? `${cleanBase}/solicitante/${encodeURIComponent(pkgRef)}${pkgToken ? `?t=${encodeURIComponent(pkgToken)}` : ""}`
    : `${cleanBase}/credenciamento/${encodeURIComponent(r.code)}`;
  const buttons = [
    { id: `btn_fix_phone_${r.code}_${guestIndex}`, type: "URL", label: "🔐 Atualizar no Portal", url: portalUrl }
  ];

  const sendFn = typeof deps.sendZapiMessage === "function" ? deps.sendZapiMessage : null;
  inFlightInvalidGuestPhoneAlerts.add(dedupKey);
  try {
    let sentOk = false;
    let zRes = null;
    if (sendFn && !deps.suppressExternalSend) {
      zRes = await sendFn(db?.zapiConfig, {
        phone: reqDigits,
        message: msgText,
        buttons,
        channelId: "guest_schedule",
        recipientRole: "solicitante",
        triggerEvent: "invalid_guest_phone_correction",
        db
      });
      sentOk = Boolean(zRes?.success || zRes?.ok || zRes?.sent || zRes?.messageId || zRes?.zaapId);
      reqEntry.whatsappSent = sentOk;

      if (!Array.isArray(db.whatsappHistory)) db.whatsappHistory = [];
      db.whatsappHistory.push({
        id: `auto_phonefix_${r.id}_${guestIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        reservationId: r.id || null,
        reservationCode: r.code,
        packageCode: pkgRef || null,
        title: "Solicitação de Correção de WhatsApp do Hóspede",
        guestName: reqName,
        guestPhone: reqDigits,
        recipientType: "requester",
        recipientRole: "solicitante",
        triggerEvent: "invalid_guest_phone_correction",
        message: msgText,
        buttons,
        status: sentOk ? "sent" : "failed",
        messageId: zRes?.messageId || null,
        error: zRes?.error || null,
        sentAt: nowIso
      });

      if (typeof deps.appendMessageToConversation === "function") {
        deps.appendMessageToConversation(db, {
          phone: reqDigits,
          senderName: "CorpFlats",
          senderPhone: db?.zapiConfig?.instanceId || "",
          fromMe: true,
          text: msgText,
          type: "text",
          buttons,
          triggerEvent: "invalid_guest_phone_correction",
          reservationCode: r.code,
          packageCode: pkgRef || null,
          status: sentOk ? "delivered" : "failed",
          timestamp: nowIso,
          messageId: zRes?.messageId || `msg_phonefix_${Date.now()}_${guestIndex}`
        });
      }
    }

    if (typeof notifyPanelFn === "function") {
      try {
        notifyPanelFn({
          category: "pre_checkin",
          title: `⚠️ WhatsApp Inválido — Flat ${r.flatNumber} (${guestName})`,
          message: `O número '${rawInvalidPhone || "não informado"}' de ${guestName} não possui WhatsApp ativo. Solicitante ${reqName} foi notificado para informar o número correto.`,
          severity: "warning",
          metadata: {
            reservationId: r.id,
            reservationCode: r.code,
            packageCode: pkgRef || null,
            flatNumber: r.flatNumber,
            guestIndex,
            guestName,
            invalidPhone: rawInvalidPhone,
            whatsappSent: sentOk
          },
          targetUrl: "/whatsapp-chat"
        });
      } catch (_) {}
    }

    if (typeof deps.saveDatabase === "function") {
      deps.saveDatabase("guest_phone_correction_requested");
    }

    return { registered: true, notified: sentOk, request: reqEntry };
  } finally {
    inFlightInvalidGuestPhoneAlerts.delete(dedupKey);
  }
}

export async function updateGuestPhoneAndResendInstructions(db, params = {}, deps = {}) {
  if (!db) {
    return { ok: false, code: "DB_UNAVAILABLE", error: "Banco de dados indisponível." };
  }

  let r = params.reservation || null;
  if (!r && Array.isArray(db.reservations)) {
    const targetId = params.reservationId !== undefined && params.reservationId !== null ? String(params.reservationId) : "";
    const targetCode = String(params.reservationCode || params.codigo_reserva_alvo || "").trim().toUpperCase();
    r = db.reservations.find(
      (item) =>
        item &&
        ((targetId && String(item.id) === targetId) ||
          (targetCode && (String(item.code || "").toUpperCase() === targetCode || String(item.reservationCode || "").toUpperCase() === targetCode)))
    ) || null;
  }

  if (!r) {
    return { ok: false, code: "RESERVATION_NOT_FOUND", error: "Reserva não encontrada para atualização do telefone." };
  }

  const cleanFn = typeof deps.cleanWhatsAppPhone === "function" ? deps.cleanWhatsAppPhone : cleanPhoneLocal;
  const rawNewPhone = String(params.newPhone || params.phone || "").trim();
  const cleanDigits = cleanFn(rawNewPhone);

  if (!cleanDigits || cleanDigits.length < 10) {
    return {
      ok: false,
      invalidWhatsApp: true,
      code: "TELEFONE_INVALIDO",
      error: `O telefone informado ("${rawNewPhone}") está incompleto. Informe o número com DDD (mínimo 10 dígitos).`
    };
  }

  let normalizedPhone = cleanDigits;
  if (params.skipWhatsAppValidation !== true) {
    const waCheck = await verifyWhatsAppPhoneActive(rawNewPhone, db?.zapiConfig, db, deps);
    if (!waCheck.valid) {
      return {
        ok: false,
        invalidWhatsApp: true,
        code: "TELEFONE_SEM_WHATSAPP",
        phoneTested: waCheck.phone || cleanDigits,
        error: `O número informado (${rawNewPhone}) também não possui conta ativa no WhatsApp.`
      };
    }
    normalizedPhone = waCheck.phone || cleanDigits;
  }

  let guestIndex = Number(params.guestIndex) || 0;
  if (!guestIndex && params.guestName && Array.isArray(r.guests)) {
    const idxMatched = r.guests.findIndex((g, idx) => g && areGuestNamesRoughlyCompatible(params.guestName, g.name || (idx === 0 ? r.guestName : "")));
    if (idxMatched >= 0) guestIndex = Number(r.guests[idxMatched]?.index) || idxMatched + 1;
  }
  if (!guestIndex && Array.isArray(r.guestPhoneCorrectionRequests)) {
    const activePending = r.guestPhoneCorrectionRequests.filter((req) => req && req.status === "awaiting_reply");
    if (activePending.length === 1) {
      guestIndex = Number(activePending[0].guestIndex) || 1;
    }
  }
  guestIndex = Math.max(1, Math.min(3, guestIndex || 1));

  if (!Array.isArray(r.guests)) r.guests = [];
  const prevGuestObj = r.guests[guestIndex - 1] || {};
  const oldPhone =
    guestIndex === 1
      ? String(r.guestPhone || prevGuestObj.phone || prevGuestObj.whatsapp || "").trim()
      : String(prevGuestObj.phone || prevGuestObj.whatsapp || "").trim();
  const targetGuestName = String(
    params.guestName ||
    prevGuestObj.name ||
    (guestIndex === 1 ? r.guestName : "") ||
    `Hóspede ${guestIndex}`
  ).trim();

  const nowIso = new Date().toISOString();
  r.guests[guestIndex - 1] = {
    ...prevGuestObj,
    index: guestIndex,
    isMain: guestIndex === 1,
    name: prevGuestObj.name || (guestIndex === 1 ? r.guestName : "") || targetGuestName,
    phone: normalizedPhone,
    whatsapp: normalizedPhone,
    informLater: false
  };

  if (guestIndex === 1) {
    r.guestPhone = normalizedPhone;
    r.whatsappPhone = normalizedPhone;
    r.guestPending = false;
    r.informGuestsLater = false;
  } else if (guestIndex === 2) {
    r.guest2InformLater = false;
  } else if (guestIndex === 3) {
    r.guest3InformLater = false;
  }

  r.guestPhoneUpdatedAt = nowIso;
  r.updatedAt = nowIso;

  // Limpa eventual stamp anterior para o mesmo índice/telefone para garantir reenvio imediato
  delete r[`pkgGuestInstrSent_${guestIndex}_${normalizedPhone}`];
  delete r[`pkgGuestInstrSent_${guestIndex}_${cleanDigits}`];

  if (Array.isArray(r.guestPhoneCorrectionRequests)) {
    for (const req of r.guestPhoneCorrectionRequests) {
      if (req && req.status === "awaiting_reply" && Number(req.guestIndex) === guestIndex) {
        req.status = "resolved";
        req.correctedPhone = normalizedPhone;
        req.resolvedAt = nowIso;
      }
    }
  }
  r.guestPhoneInvalid = Array.isArray(r.guestPhoneCorrectionRequests)
    ? r.guestPhoneCorrectionRequests.some((req) => req && req.status === "awaiting_reply")
    : false;

  // Atualiza cadastro do hóspede no CRM (db.guests) SEM nunca sobrescrever o perfil de um Solicitante distinto
  const reqPhoneDigits = normalizePhoneDigitsSimple(
    r.requesterInfo?.whatsapp || r.requesterInfo?.phone || r.requesterPhone || ""
  );
  const reqDocDigits = String(r.requesterInfo?.cpf || r.companyCnpj || r.agencyCnpj || "").replace(/\D/g, "");
  const reqNameStr = String(r.requesterInfo?.name || r.requesterName || "").trim();
  const isSeparateRequester = Boolean(!r.requesterIsGuest1 || guestIndex > 1);

  const gObj = r.guests[guestIndex - 1];
  const targetGuestId = gObj?.guestId || (guestIndex === 1 ? r.guestId : null);
  const targetDoc = String(
    gObj?.cpf || gObj?.document || (guestIndex === 1 ? (r.guestCpf || r.guestDocument) : "") || ""
  ).replace(/\D/g, "");

  if (Array.isArray(db.guests)) {
    const isProtectedRequesterRecord = (g) => {
      if (!isSeparateRequester) return false;
      const gPhoneD = normalizePhoneDigitsSimple(g.whatsapp || g.phone || "");
      const gDocD = String(g.cpf || g.document || g.documentNumber || "").replace(/\D/g, "");
      if (reqPhoneDigits.length >= 8 && gPhoneD && phonesEndMatch(gPhoneD, reqPhoneDigits)) {
        if (!targetNameCompat(g)) return true;
      }
      if (reqDocDigits.length >= 11 && gDocD === reqDocDigits && reqDocDigits !== targetDoc) {
        return true;
      }
      if (reqNameStr && areGuestNamesRoughlyCompatible(reqNameStr, g.fullName || g.name) && !areGuestNamesRoughlyCompatible(targetGuestName, g.fullName || g.name)) {
        return true;
      }
      return false;
    };
    const targetNameCompat = (g) => areGuestNamesRoughlyCompatible(targetGuestName, g.fullName || g.name);

    let crmGuest = null;
    if (targetGuestId) {
      crmGuest = db.guests.find((g) => g && String(g.id) === String(targetGuestId) && !isProtectedRequesterRecord(g));
    }
    if (!crmGuest && targetDoc.length >= 11) {
      crmGuest = db.guests.find((g) => {
        if (!g || isProtectedRequesterRecord(g)) return false;
        const gDocD = String(g.cpf || g.document || g.documentNumber || "").replace(/\D/g, "");
        return gDocD === targetDoc && (!targetGuestName || targetNameCompat(g));
      });
    }
    if (!crmGuest && oldPhone && oldPhone.replace(/\D/g, "").length >= 8) {
      crmGuest = db.guests.find((g) => {
        if (!g || isProtectedRequesterRecord(g)) return false;
        const gPhoneD = normalizePhoneDigitsSimple(g.whatsapp || g.phone || "");
        return phonesEndMatch(gPhoneD, oldPhone) && (!targetGuestName || targetNameCompat(g));
      });
    }
    if (crmGuest) {
      crmGuest.phone = normalizedPhone;
      crmGuest.whatsapp = normalizedPhone;
      crmGuest.updatedAt = nowIso;
    }
  }

  const auditEntry = {
    id: `log_gph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: "guest_phone_corrected",
    timestamp: nowIso,
    actor: params.actor || { name: "Sofia IA / Solicitante", role: "system", type: "ai" },
    source: params.source || "WhatsApp / Portal do Solicitante",
    description: `WhatsApp do ${guestIndex}º hóspede (${targetGuestName}) atualizado para ${normalizedPhone}`,
    changes: [
      {
        field: guestIndex === 1 ? "guestPhone" : `guest${guestIndex}Phone`,
        label: `WhatsApp (${targetGuestName})`,
        oldValue: oldPhone || "(vazio)",
        newValue: normalizedPhone
      }
    ]
  };
  if (typeof deps.addReservationAuditLog === "function") {
    deps.addReservationAuditLog(r, auditEntry);
  } else {
    if (!Array.isArray(r.auditLogs)) r.auditLogs = [];
    r.auditLogs.unshift(auditEntry);
  }

  if (typeof deps.saveDatabase === "function") {
    deps.saveDatabase("guest_phone_corrected");
  }

  const effectiveBaseUrl = String(params.baseUrl || deps.baseUrl || db?.settings?.baseUrl || "https://corpflats.com.br").replace(/\/+$/, "");
  const stLower = String(r.status || "").toLowerCase().trim();
  const isConfirmedOrActive = stLower === "confirmada" || stLower === "checkin" || stLower === "checked_in" || stLower === "in_house";
  let whatsappDispatched = false;
  let resendResult = null;

  if (isConfirmedOrActive && !deps.suppressExternalSend) {
    if (r.packageCode || r.packageId || typeof deps.dispatchCatchUpGuestRulerMessages !== "function") {
      resendResult = await dispatchIndividualFlatGuestInstructions(db, [r], effectiveBaseUrl, {
        ...deps,
        onlyGuestIndices: [guestIndex],
        forceResend: true,
        skipWhatsAppPreCheck: true
      });
      whatsappDispatched = Array.isArray(resendResult) && resendResult.some((item) => item && item.guestIndex === guestIndex && item.sent !== false);
    } else {
      resendResult = await deps.dispatchCatchUpGuestRulerMessages(db, deps.saveDatabase, r, {
        baseUrl: effectiveBaseUrl,
        onlyGuestIndices: [guestIndex],
        forceResendInstructions: true
      });
      whatsappDispatched = Array.isArray(resendResult?.dispatchedStages) && resendResult.dispatchedStages.length > 0;
    }

    if (typeof deps.scheduleUpcomingReservationTriggers === "function") {
      try {
        deps.scheduleUpcomingReservationTriggers(db, deps.saveDatabase);
      } catch (_) {}
    }
  }

  return {
    ok: true,
    reservationCode: r.code,
    flatNumber: String(r.flatNumber || ""),
    guestIndex,
    guestName: targetGuestName,
    oldPhone,
    newPhone: normalizedPhone,
    whatsappDispatched,
    resendResult
  };
}

/**
 * Envia 1 única mensagem consolidada de Pré-Reserva ou Confirmação (WhatsApp + E-mail) para o Solicitante do pacote,
 * sem disparar N mensagens separadas e sem expor URLs cruas quando há botões.
 */
export async function dispatchPackagePreReservationCreated(db, packageIdOrRes, baseUrl, deps = {}) {
  const summary = computePackageSummary(db, packageIdOrRes, {
    baseUrl,
    computeCardAmountFromPix: deps.computeCardAmountFromPix
  });
  if (!summary || summary.activeFlatsCount === 0) return { sentWhatsapp: false, sentEmail: false };

  const all = getPackageReservations(db, summary.packageCode);
  const activeItems = all.filter((r) => isPackageItemActive(r));
  const nowIso = new Date().toISOString();
  const holdLabel = activeItems[0]?.holdDurationLabel || "30 minutos";
  const allConfirmed = activeItems.length > 0 && activeItems.every((r) => String(r.status || "").toLowerCase().trim() === "confirmada");
  const isFaturado = summary.isFaturadoBoleto;
  const isPaid = summary.isPaid;
  const paidAmt = round2(Number(summary.paidAmount) || 0);
  const pendingAmt = round2(Number(summary.pendingAmount) || 0);
  const hasPartialPayment = !isPaid && !isFaturado && paidAmt > 0.01 && pendingAmt > 0.01;

  const statusLabel = allConfirmed ? "Confirmada" : "Pré-Reserva";
  const paymentStatusLabel = isPaid
    ? "Pago integralmente"
    : isFaturado
      ? "Faturado"
      : hasPartialPayment
        ? `Pagamento parcial de R$ ${formatMoneyBr(paidAmt)} • Pendente R$ ${formatMoneyBr(pendingAmt)}`
        : "Pendente";

  // Marca flags nas reservas filhas para evitar disparos duplicados avulsos da régua ou dos timers de 20s/60s
  for (const r of activeItems) {
    r.packagePreResDispatchedAt = nowIso;
    r._needsOfficialPreResDispatch = false;
    r._preReservationRulerSentAt = nowIso;
    if ((isPaid || allConfirmed) && isFlatGuestCredentialIncomplete(r)) {
      r.b2bCredentialWhatsappSentAt = r.b2bCredentialWhatsappSentAt || nowIso;
      r.credentialFirstRequestSentAt = r.credentialFirstRequestSentAt || nowIso;
      r.credentialSentStages = {
        ...(r.credentialSentStages || {}),
        initial: { ...(r.credentialSentStages?.initial || {}), whatsappSentAt: nowIso }
      };
    }
  }

  const reqNameFirst = String(summary.requesterName || "Cliente").trim().split(/\s+/)[0] || "Cliente";
  const flatsLines = summary.items
    .filter((it) => it.isActive)
    .map((it) => {
      const occLabel = `${it.guestCount} hóspede${it.guestCount > 1 ? "s" : ""}`;
      const bfLabel = it.includeBreakfast ? "Com café" : "Sem café";
      const bedLabel = it.twinBeds ? "2 camas solteiro" : "Cama casal";
      const gLabel = it.informGuestsLater ? "A informar" : (it.guestName || "A definir");
      return (
        `• *Flat ${it.flatNumber}* • ${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)} (${it.nights} diária${it.nights > 1 ? "s" : ""})\n` +
        `  ${occLabel} • ${bfLabel} • ${bedLabel}\n` +
        `  Hóspede: ${gLabel} — R$ ${formatMoneyBr(it.totalAmount)}`
      );
    })
    .join("\n\n");

  const headerLine = isPaid
    ? `Olá, *${reqNameFirst}*! Seu pacote com *${summary.activeFlatsCount} flats* no *CorpFlats* (*${summary.packageCode}*) está confirmado!`
    : allConfirmed
      ? `Olá, *${reqNameFirst}*! Sua reserva com *${summary.activeFlatsCount} flats* no *CorpFlats* (*${summary.packageCode}*) está registrada.`
      : `Olá, *${reqNameFirst}*! Sua pré-reserva com *${summary.activeFlatsCount} flats* no *CorpFlats* (*${summary.packageCode}*) foi gerada.`;

  const financialLines = isPaid
    ? `💰 *Total do pacote:* R$ ${formatMoneyBr(summary.totalAmount)}`
    : isFaturado
      ? `💰 *Total faturado:* R$ ${formatMoneyBr(summary.totalAmount)}`
      : hasPartialPayment
        ? `💰 *Total do pacote:* R$ ${formatMoneyBr(summary.totalAmount)}\n` +
          `💎 *Saldo no PIX:* R$ ${formatMoneyBr(pendingAmt)} • *Cartão:* R$ ${formatMoneyBr(summary.cardPendingAmount)}`
        : `💎 *Total no PIX:* R$ ${formatMoneyBr(pendingAmt)} • *Cartão:* R$ ${formatMoneyBr(summary.cardPendingAmount)}`;

  const holdLine = !allConfirmed && !isPaid && !isFaturado ? `\n⏳ *Validade:* ${holdLabel}` : "";

  const footerGuidance = summary.needsGuestCredentials
    ? `👥 Use os botões abaixo para gerenciar o pacote e cadastrar os hóspedes de cada flat.`
    : allConfirmed
      ? `✨ Os hóspedes identificados recebem apenas as instruções do seu flat (sem valores financeiros).`
      : `Use os botões abaixo para acompanhar o pacote e concluir o pagamento.`;

  const msgText =
    `${headerLine}\n\n` +
    `🏢 *Flats do Pacote:*\n${flatsLines}\n\n` +
    `📌 *Status:* ${statusLabel}\n` +
    `💳 *Status do pagamento:* ${paymentStatusLabel}${holdLine}\n` +
    `${financialLines}\n\n` +
    `${footerGuidance}`;

  let sentWhatsapp = false;
  let sentEmail = false;

  const cleanPhone =
    typeof deps.cleanWhatsAppPhone === "function"
      ? deps.cleanWhatsAppPhone(summary.requesterPhone)
      : cleanPhoneLocal(summary.requesterPhone);

  if (cleanPhone && cleanPhone.length >= 10 && typeof deps.sendZapiMessage === "function" && !deps.suppressExternalSend) {
    try {
      const triggerEvt = isPaid ? "payment_confirmed" : (allConfirmed ? "reservation_created" : "pre_reservation_created");
      const buttons = [];
      if (!isPaid && !isFaturado) {
        buttons.push({
          id: `pkg_portal_${summary.packageCode}`,
          type: "URL",
          url: summary.packagePortalUrl,
          label: "💳 Ver Pacote e Pagar"
        });
        if (summary.pixCopiaECola) {
          buttons.push({
            id: `pkg_pix_${summary.packageCode}`,
            type: "COPY",
            copyCode: summary.pixCopiaECola,
            url: summary.packageCopyPixUrl,
            label: "📋 Copiar Código PIX"
          });
        }
      } else {
        buttons.push({
          id: `pkg_portal_${summary.packageCode}`,
          type: "URL",
          url: summary.packagePortalUrl,
          label: "🏨 Abrir Pacote"
        });
      }
      if (summary.needsGuestCredentials && buttons.length < 3) {
        buttons.push({
          id: `pkg_guests_${summary.packageCode}`,
          type: "URL",
          url: `${summary.packagePortalUrl}#hospedes`,
          label: "👥 Cadastrar Hóspedes"
        });
      }

      const zRes = await deps.sendZapiMessage(db?.zapiConfig, {
        phone: cleanPhone,
        message: msgText,
        buttons: buttons.slice(0, 3),
        channelId: "guest_schedule",
        recipientRole: "solicitante",
        triggerEvent: triggerEvt,
        db
      });
      sentWhatsapp = Boolean(zRes?.success || zRes?.ok || zRes?.sent || zRes?.messageId || zRes?.zaapId);
      if (!Array.isArray(db.whatsappHistory)) db.whatsappHistory = [];
      for (const r of activeItems) {
        db.whatsappHistory.push({
          id: `wah_pkg_${r.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          reservationId: r.id,
          reservationCode: r.code,
          packageCode: summary.packageCode,
          guestName: summary.requesterName,
          guestPhone: cleanPhone,
          recipientType: r.requesterIsGuest1 && isPaid ? "guest" : "requester",
          recipientRole: "solicitante",
          triggerEvent: triggerEvt,
          templateId: isPaid ? "tpl_package_payment_confirmed" : (allConfirmed ? "tpl_package_confirmed" : "tpl_package_pre_reserva"),
          message: msgText,
          buttons: buttons.slice(0, 3),
          status: sentWhatsapp ? "sent" : "failed",
          messageId: zRes?.messageId || null,
          sentAt: nowIso
        });
      }
      if (typeof deps.appendMessageToConversation === "function") {
        deps.appendMessageToConversation(db, {
          phone: cleanPhone,
          senderName: "CorpFlats",
          senderPhone: db?.zapiConfig?.instanceId || "",
          fromMe: true,
          text: msgText,
          type: "text",
          buttons: buttons.slice(0, 3),
          triggerEvent: triggerEvt,
          reservationCode: activeItems[0]?.code || summary.packageCode,
          packageCode: summary.packageCode,
          status: sentWhatsapp ? "delivered" : "failed",
          timestamp: nowIso,
          messageId: zRes?.messageId || `msg_pkg_${Date.now()}`
        });
      }
    } catch (wErr) {
      console.warn(`[Package WhatsApp] Falha ao enviar mensagem consolidada (${summary.packageCode}):`, wErr?.message || wErr);
    }
  }

  const requesterEmailList = parseEmailList(summary.requesterEmail);
  if (requesterEmailList.length > 0 && typeof deps.sendEmailAsync === "function" && !deps.suppressExternalSend) {
    try {
      const subject = allConfirmed
        ? `Reserva Confirmada — Pacote ${summary.packageCode} (${summary.activeFlatsCount} Flats) — CorpFlats`
        : `Pré-Reserva Pacote ${summary.packageCode} (${summary.activeFlatsCount} Flats) — CorpFlats`;
      const emailBadge = isPaid
        ? "Pacote Confirmado"
        : isFaturado
          ? "Pacote Faturado"
          : allConfirmed
            ? (hasPartialPayment ? "Confirmada • Pgto Parcial" : "Confirmada • Pgto Pendente")
            : "Pré-Reserva";

      const htmlRows = summary.items
        .filter((it) => it.isActive)
        .map(
          (it) =>
            `<tr>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>Flat ${it.flatNumber}</strong></td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.guestCount} pax • ${it.includeBreakfast ? "Com Café" : "Sem Café"}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.informGuestsLater ? "A informar" : it.guestName}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">R$ ${formatMoneyBr(it.totalAmount)}</td>
            </tr>`
        )
        .join("");

      const bodyHtml = `
        <div style="font-family:Arial,sans-serif;color:#1e293b;max-width:640px;margin:0 auto;">
          <h2 style="color:#0f172a;">Olá, ${summary.requesterName}!</h2>
          <p>${
            allConfirmed
              ? `Sua reserva <strong>${summary.packageCode}</strong> com <strong>${summary.activeFlatsCount} flats</strong> está registrada (${statusLabel} • ${paymentStatusLabel}).`
              : `Sua pré-reserva <strong>${summary.packageCode}</strong> com <strong>${summary.activeFlatsCount} flats</strong> foi gerada (${paymentStatusLabel}).`
          }</p>
          <p style="font-size:14px;margin:8px 0;">
            <strong>Status:</strong> ${statusLabel} &nbsp;|&nbsp; <strong>Status do pagamento:</strong> ${paymentStatusLabel}
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <thead>
              <tr style="background:#f8fafc;text-align:left;">
                <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Flat</th>
                <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Período</th>
                <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Configuração</th>
                <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Hóspede</th>
                <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:right;">Valor</th>
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
          <p style="font-size:16px;"><strong>Total do Pacote: R$ ${formatMoneyBr(summary.totalAmount)}</strong></p>
          ${
            hasPartialPayment
              ? `<p style="font-size:15px;color:#15803d;margin:4px 0;"><strong>Valor Já Pago: - R$ ${formatMoneyBr(paidAmt)}</strong></p>
                 <p style="font-size:16px;color:#0f172a;margin:4px 0;"><strong>Saldo Pendente: R$ ${formatMoneyBr(pendingAmt)}</strong></p>`
              : ""
          }
          ${
            !isPaid && !isFaturado && summary.pixCopiaECola
              ? `<div style="background:#f0fdf4;border:1px solid #86efac;padding:12px;border-radius:8px;margin:16px 0;">
                  <strong>PIX Copia e Cola (Pacote Completo):</strong>
                  <pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;background:#fff;padding:8px;border-radius:4px;">${summary.pixCopiaECola}</pre>
                </div>`
              : ""
          }
          <p style="margin:20px 0;">
            <a href="${summary.packagePortalUrl}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
              ${!isPaid && !isFaturado ? "Ver Pacote e Pagar" : "Abrir Portal do Solicitante"}
            </a>
          </p>
          ${
            summary.needsGuestCredentials
              ? `<p><a href="${summary.packagePortalUrl}#hospedes" style="color:#2563eb;font-weight:bold;">Cadastrar ou revisar hóspedes de cada flat</a></p>`
              : ""
          }
        </div>
      `;

      const htmlWrapped =
        typeof deps.wrapEmailTemplate === "function"
          ? deps.wrapEmailTemplate({
              title: subject,
              badge: emailBadge,
              contentHtml: bodyHtml
            })
          : bodyHtml;
      const emailRes = await deps.sendEmailAsync({
        db,
        saveDatabase: deps.saveDatabase,
        reservationId: activeItems[0]?.code || summary.packageCode,
        recipient: requesterEmailList.join(", "),
        subject,
        bodyHtml: htmlWrapped,
        overrides: deps.emailOverrides,
        metadata: {
          category: "reservation_package",
          trigger: isPaid ? "package_confirmed" : (allConfirmed ? "package_created_confirmed" : "package_pre_reservation_created"),
          packageCode: summary.packageCode
        }
      });
      sentEmail = emailRes === null ? false : (emailRes ? Boolean(emailRes.ok !== false && emailRes.status !== "failed") : true);
    } catch (eErr) {
      console.warn(`[Package Email] Falha ao enviar e-mail consolidado (${summary.packageCode}):`, eErr?.message || eErr);
    }
  }

  // Dispara instruções individuais imediatamente na criação para todos os flats ativos com status === "confirmada" (independente de paidAmount === 0 ou faturado)
  const confirmedActiveItems = activeItems.filter((r) => String(r.status || "").toLowerCase().trim() === "confirmada");
  if (confirmedActiveItems.length > 0) {
    await dispatchIndividualFlatGuestInstructions(db, confirmedActiveItems, baseUrl, {
      ...deps,
      triggerEvent: isPaid ? "payment_confirmed" : "reservation_created"
    });
  }

  if (typeof deps.saveDatabase === "function") deps.saveDatabase("package_created_dispatched");
  return { sentWhatsapp, sentEmail, messagePreview: msgText, summary };
}

/**
 * Dispara instruções individuais de cada flat para Hóspede 1, 2 e 3 já identificados,
 * ocultando 100% dos valores financeiros, sem URLs cruas no corpo, sem "Senha da Porta" (Cartão NFC na recepção 24h)
 * e validando WhatsApp ativo na Z-API (notificando o Solicitante automaticamente se inválido).
 */
export async function dispatchIndividualFlatGuestInstructions(db, reservationsList, baseUrl, deps = {}) {
  const cleanBase = String(baseUrl || "https://corpflats.com.br").replace(/\/+$/, "");
  const sentTo = [];
  if (!Array.isArray(reservationsList) || reservationsList.length === 0) return sentTo;

  const cleanFn = typeof deps.cleanWhatsAppPhone === "function" ? deps.cleanWhatsAppPhone : cleanPhoneLocal;
  const onlyIndices = Array.isArray(deps.onlyGuestIndices) && deps.onlyGuestIndices.length > 0
    ? new Set(deps.onlyGuestIndices.map((n) => Number(n)))
    : null;
  const todayBr = getBrasiliaDateStrNow();
  const triggerEvt = deps.triggerEvent || "reservation_created";

  const primary = reservationsList[0];
  const reqPhoneDigits = cleanFn(
    primary?.requesterInfo?.whatsapp ||
    primary?.requesterInfo?.phone ||
    primary?.requesterPhone ||
    ""
  );

  const defaultPdfUrl = db?.zapiConfig?.guestGuidePdfUrl || "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf";
  const defaultPdfName = db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf";
  const pdfCaption = "Segue em anexo o Manual do Hóspede em PDF com todas as orientações da sua acomodação! 📖";

  for (const r of reservationsList) {
    if (!isPackageItemActive(r)) continue;
    const itemReqDigits = cleanFn(
      r.requesterInfo?.whatsapp ||
      r.requesterInfo?.phone ||
      r.requesterPhone ||
      reqPhoneDigits ||
      ""
    );
    const guestsArr = Array.isArray(r.guests) ? r.guests : [];
    const guestTargets = [];

    // Hóspede 1
    const g1Name = String(r.guestName || guestsArr[0]?.name || "").trim();
    const g1Phone = String(r.guestPhone || guestsArr[0]?.phone || guestsArr[0]?.whatsapp || "").trim();
    const g1Digits = cleanFn(g1Phone);
    const isPlaceholder1 = !g1Name || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(g1Name);

    if (!isPlaceholder1 && !r.guestPending && !r.informGuestsLater) {
      guestTargets.push({
        index: 1,
        name: g1Name,
        phone: g1Phone,
        digits: g1Digits,
        email: String(r.guestEmail || guestsArr[0]?.email || "").trim(),
        isSameAsRequester: Boolean(r.requesterIsGuest1 || (itemReqDigits && g1Digits && phonesEndMatch(g1Digits, itemReqDigits)))
      });
    }

    // Hóspede 2 e 3
    const maxCount = Math.max(1, Math.min(3, Number(r.guestCount || r.adults) || 1));
    for (let i = 1; i < Math.min(maxCount, guestsArr.length); i++) {
      const comp = guestsArr[i];
      if (!comp || comp.informLater) continue;
      if (i === 1 && r.guest2InformLater) continue;
      if (i === 2 && r.guest3InformLater) continue;
      const cName = String(comp.name || "").trim();
      const cPhone = String(comp.phone || comp.whatsapp || "").trim();
      const cDigits = cleanFn(cPhone);
      if (!cName || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(cName)) continue;
      guestTargets.push({
        index: i + 1,
        name: cName,
        phone: cPhone,
        digits: cDigits,
        email: String(comp.email || "").trim(),
        isSameAsRequester: Boolean(itemReqDigits && cDigits && phonesEndMatch(cDigits, itemReqDigits))
      });
    }

    for (const target of guestTargets) {
      if (onlyIndices && !onlyIndices.has(target.index)) continue;

      // Garante que qualquer acesso individual por não-solicitante oculte valores financeiros
      if (!r.requesterIsGuest1) {
        r.hideFinancialForGuest = true;
      }

      // Se for o próprio solicitante (que acabou de receber o resumo/recibo do pacote), não dispara 2º WhatsApp redundante na mesma hora
      if (target.isSameAsRequester && target.index === 1 && !deps.forceSendToRequesterGuest) {
        const sentKeyReq = `pkgGuestInstrSent_${target.index}_${target.digits}`;
        if (!r[sentKeyReq]) r[sentKeyReq] = new Date().toISOString();
        sentTo.push({ reservationCode: r.code, flatNumber: r.flatNumber, guestIndex: target.index, skippedSameAsRequester: true });
        continue;
      }

      // Se o hóspede nomeado não tem telefone válido (< 10 dígitos), notifica Solicitante (quando distinto) e não grava sentKey
      if (!target.digits || target.digits.length < 10) {
        if (!deps.suppressExternalSend && !target.isSameAsRequester && itemReqDigits.length >= 10) {
          await registerAndNotifyInvalidGuestPhone(
            db,
            r,
            { ...target, reason: "invalid_phone_format", source: "dispatch_instructions" },
            { ...deps, baseUrl: cleanBase }
          );
        }
        continue;
      }

      let cleanTargetPhone = target.digits;
      const sentKeyBeforeCheck = `pkgGuestInstrSent_${target.index}_${target.digits}`;
      if (r[sentKeyBeforeCheck] && !deps.forceResend) continue;

      if (!deps.suppressExternalSend && !deps.skipWhatsAppPreCheck && !target.isSameAsRequester) {
        const waCheck = await verifyWhatsAppPhoneActive(target.phone, db?.zapiConfig, db, deps);
        if (!waCheck.valid) {
          await registerAndNotifyInvalidGuestPhone(
            db,
            r,
            { ...target, reason: waCheck.reason || "no_whatsapp_account", source: "dispatch_instructions" },
            { ...deps, baseUrl: cleanBase }
          );
          continue;
        }
        if (waCheck.digits && waCheck.digits.length >= 10) {
          cleanTargetPhone = waCheck.digits;
        }
      }

      const sentKey = `pkgGuestInstrSent_${target.index}_${cleanTargetPhone}`;
      if (r[sentKey] && !deps.forceResend) continue;

      const preCheckinUrl =
        target.index > 1
          ? `${cleanBase}/pre-checkin/${encodeURIComponent(r.code)}?guest=${target.index}`
          : `${cleanBase}/pre-checkin/${encodeURIComponent(r.code)}`;
      const portalUrl =
        target.index > 1
          ? `${cleanBase}/minha-reserva/${encodeURIComponent(r.code)}?guest=${target.index}`
          : `${cleanBase}/minha-reserva/${encodeURIComponent(r.code)}`;
      const breakfastUrl = `${cleanBase}/cafe/${encodeURIComponent(r.code)}`;
      const autocheckinUrl = `${cleanBase}/api/pms/guest-portal/${encodeURIComponent(r.code)}/self-checkin`;

      const guestItemObj = guestsArr[target.index - 1] || {};
      const preCheckinDoneForTarget = Boolean(
        target.index > 1
          ? (guestItemObj.hasCompletedCheckin || guestItemObj.status === "CHECKED_IN")
          : (r.preCheckinCompleted || r.fnhrCompleted || guestsArr[0]?.hasCompletedCheckin)
      );
      const hasEnteredFlat = Boolean(
        r.guestSelfCheckin ||
        r.actualCheckinAt ||
        ["in_house", "checkin", "checked_in"].includes(String(r.status || "").toLowerCase().trim())
      );
      const isFlatCleanAndReleased = Boolean(
        r.roomReadySentDate === todayBr ||
        (typeof deps.evaluateSelfCheckinEligibility === "function"
          ? deps.evaluateSelfCheckinEligibility(db, r)?.allowed
          : (r.checkinDate && todayBr >= String(r.checkinDate).slice(0, 10) && r.flatCleanStatus !== "em_preparacao"))
      );

      const firstName = target.name.split(/\s+/)[0] || "Hóspede";
      const bfText = r.includeBreakfast ? "Incluso ☕" : "Não incluso";
      const bedText = r.twinBeds ? "2 Camas de Solteiro" : "Cama de Casal";
      const hotelAddress = db?.settings?.hotelAddress || "Edifício Soho Residence Service, Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes/RJ";

      const guestMsg =
        `Olá, *${firstName}*! Seja muito bem-vindo(a) ao *CorpFlats*! 😊\n\n` +
        `Sua hospedagem está *confirmada*! Confira os detalhes da sua acomodação:\n\n` +
        `🏢 *Flat ${r.flatNumber}* (Reserva *${r.code}*)\n` +
        `📅 *Check-in:* ${formatDateBrShort(r.checkinDate)} a partir das ${r.checkinTime || "14:00"}\n` +
        `📅 *Check-out:* ${formatDateBrShort(r.checkoutDate)} até as ${r.checkoutTime || "12:00"}\n` +
        `🛏️ *Configuração:* ${bedText} • Café da manhã: ${bfText}\n` +
        `🔑 *Acesso ao flat:* Cartão NFC retirado na recepção 24h após concluir o Check-in Online\n` +
        `📍 *Endereço:* ${hotelAddress}\n\n` +
        (preCheckinDoneForTarget
          ? `Use os botões abaixo para acessar sua *Área do Hóspede*${r.includeBreakfast ? " e montar seu café da manhã" : ""}:`
          : `Use os botões abaixo para concluir o *Check-in Online* e acessar sua *Área do Hóspede*:`);

      const guestButtons = [];
      if (!hasEnteredFlat) {
        if (preCheckinDoneForTarget && isFlatCleanAndReleased) {
          guestButtons.push({
            id: "btn_cheguei",
            type: "URL",
            url: autocheckinUrl,
            label: "📍 Já Cheguei no Flat"
          });
        } else if (!preCheckinDoneForTarget) {
          guestButtons.push({
            id: "btn_chk",
            type: "URL",
            url: preCheckinUrl,
            label: "📝 Fazer Check-in Online"
          });
        }
      }
      guestButtons.push({
        id: "btn_portal",
        type: "URL",
        url: portalUrl,
        label: "🏨 Área do Hóspede"
      });
      if (r.includeBreakfast === true && guestButtons.length < 3) {
        guestButtons.push({
          id: "btn_cafe",
          type: "URL",
          url: breakfastUrl,
          label: "🥐 Escolher Itens do Café"
        });
      }

      const finalButtons = guestButtons.slice(0, 3);
      let gSent = false;

      if (cleanTargetPhone && typeof deps.sendZapiMessage === "function" && !deps.suppressExternalSend) {
        try {
          const sentIso = new Date().toISOString();
          const alreadyHasPdf =
            typeof deps.hasPdfAlreadyBeenSentOrInFlight === "function"
              ? Boolean(deps.hasPdfAlreadyBeenSentOrInFlight(db, r.code, r.id, cleanTargetPhone))
              : (db?.whatsappHistory || []).some(
                  (h) =>
                    h &&
                    h.status === "sent" &&
                    h.documentUrl &&
                    String(h.reservationCode || "").toUpperCase() === String(r.code || "").toUpperCase() &&
                    phonesEndMatch(h.guestPhone, cleanTargetPhone)
                );

          const hasDedicatedMediaSender =
            typeof deps.sendZapiMedia === "function" || typeof deps.sendZapiDocument === "function";
          const attachViaSendZapiMessage = Boolean(!alreadyHasPdf && !hasDedicatedMediaSender && defaultPdfUrl);

          const gRes = await deps.sendZapiMessage(db?.zapiConfig, {
            phone: cleanTargetPhone,
            message: guestMsg,
            buttons: finalButtons,
            ...(attachViaSendZapiMessage
              ? {
                  documentUrl: defaultPdfUrl,
                  documentName: defaultPdfName,
                  documentCaption: pdfCaption
                }
              : {}),
            channelId: "guest_schedule",
            recipientRole: "guest",
            triggerEvent: triggerEvt,
            db
          });

          gSent = Boolean(gRes?.success || gRes?.ok || gRes?.sent || gRes?.messageId || gRes?.zaapId);

          if (!gSent && gRes?.noWhatsAppAccount && !target.isSameAsRequester && itemReqDigits.length >= 10) {
            await registerAndNotifyInvalidGuestPhone(
              db,
              r,
              { ...target, reason: "no_whatsapp_account", source: "zapi_send_error" },
              { ...deps, baseUrl: cleanBase }
            );
          }

          let attachedPdfNow = Boolean(gSent && attachViaSendZapiMessage);
          if (gSent && !alreadyHasPdf && hasDedicatedMediaSender) {
            try {
              if (typeof deps.sendZapiMedia === "function") {
                await deps.sendZapiMedia(db?.zapiConfig, {
                  phone: cleanTargetPhone,
                  document: defaultPdfUrl,
                  documentUrl: defaultPdfUrl,
                  mediaUrl: defaultPdfUrl,
                  fileName: defaultPdfName,
                  documentName: defaultPdfName,
                  caption: pdfCaption,
                  reservationCode: r.code,
                  reservationId: r.id,
                  channelId: "guest_schedule",
                  recipientRole: "guest",
                  triggerEvent: triggerEvt,
                  db
                });
                attachedPdfNow = true;
              } else if (typeof deps.sendZapiDocument === "function") {
                await deps.sendZapiDocument(db?.zapiConfig, {
                  phone: cleanTargetPhone,
                  document: defaultPdfUrl,
                  fileName: defaultPdfName,
                  caption: pdfCaption,
                  channelId: "guest_schedule",
                  recipientRole: "guest",
                  triggerEvent: triggerEvt,
                  db
                });
                attachedPdfNow = true;
              }
            } catch (docErr) {
              console.warn(`[Package Guest PDF] Erro ao anexar Manual_do_Hospede para ${cleanTargetPhone}:`, docErr?.message || docErr);
            }
          }

          if (gSent) {
            r[sentKey] = sentIso;
          }

          if (!Array.isArray(db.whatsappHistory)) db.whatsappHistory = [];
          db.whatsappHistory.push({
            id: `wah_pkgg_${r.id}_${target.index}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            reservationId: r.id,
            reservationCode: r.code,
            packageCode: r.packageCode || r.packageId || null,
            guestName: target.name,
            guestPhone: cleanTargetPhone,
            recipientType: target.index > 1 ? `guest_${target.index}` : "guest",
            recipientRole: "guest",
            triggerEvent: triggerEvt,
            templateId: "tpl_package_guest_instructions",
            message: guestMsg,
            buttons: finalButtons,
            documentUrl: attachedPdfNow ? defaultPdfUrl : null,
            documentName: attachedPdfNow ? defaultPdfName : null,
            status: gSent ? "sent" : "failed",
            messageId: gRes?.messageId || null,
            error: gRes?.error || null,
            sentAt: sentIso
          });

          if (typeof deps.appendMessageToConversation === "function") {
            deps.appendMessageToConversation(db, {
              phone: cleanTargetPhone,
              senderName: "CorpFlats",
              senderPhone: db?.zapiConfig?.instanceId || "",
              fromMe: true,
              text: guestMsg,
              type: attachedPdfNow ? "document" : "text",
              mediaUrl: attachedPdfNow ? defaultPdfUrl : null,
              fileName: attachedPdfNow ? defaultPdfName : null,
              buttons: finalButtons,
              triggerEvent: triggerEvt,
              reservationCode: r.code,
              status: gSent ? "delivered" : "failed",
              timestamp: sentIso,
              messageId: gRes?.messageId || `msg_pkgg_${Date.now()}_${target.index}`
            });
          }
        } catch (err) {
          console.warn(`[Package Guest Msg] Erro ao enviar instruções ao hóspede ${target.name} (${r.code}):`, err?.message || err);
        }
      }

      sentTo.push({
        reservationCode: r.code,
        flatNumber: r.flatNumber,
        guestIndex: target.index,
        guestName: target.name,
        phone: cleanTargetPhone,
        sent: gSent,
        hideFinancialForGuest: true
      });
    }
  }

  return sentTo;
}

/**
 * Liquida atomicamente todos os flats ativos do pacote quando o pagamento único (PIX, Cartão ou Boleto)
 * é confirmado, gerando 1 recibo único + link único de credenciamento ao Solicitante e instruções sem
 * valores para cada Hóspede 1/2 já informado.
 */
export async function settlePackagePaymentAtomically(db, triggerResOrPkgId, paymentMeta = {}, deps = {}) {
  const all = getPackageReservations(db, triggerResOrPkgId);
  if (all.length === 0) return null;

  const pkgCode = String(all[0].packageCode || all[0].packageId || "").toUpperCase();
  const activeItems = all.filter((r) => isPackageItemActive(r));
  if (activeItems.length === 0) return null;

  const nowIso = new Date().toISOString();
  const paidAtIso = paymentMeta.paidAt || nowIso;
  const methodNorm = paymentMeta.paymentMethod || (paymentMeta.mpPaymentId ? "cartao_credito" : "pix");
  const baseUrl = String(deps.baseUrl || "https://corpflats.com.br").replace(/\/+$/, "");
  const suppressSend = Boolean(deps.suppressExternalSend || paymentMeta.suppressNotifications);

  const alreadyAllSettled = activeItems.every((r) => isReservationSettledInPackage(r));

  // Rateio proporcional quando o pagamento único do pacote ocorre em Cartão de Crédito (+5%)
  const unsettledActive = activeItems.filter((r) => !isReservationSettledInPackage(r));
  const targetProrateItems = unsettledActive.length > 0 ? unsettledActive : activeItems;
  const sumBaseTarget = round2(
    targetProrateItems.reduce(
      (acc, r) => acc + (Math.max(0, (Number(r.totalAmount) || 0) - (Number(r.paidAmount) || 0)) || Number(r.totalAmount) || 0),
      0
    )
  );
  const incomingCardAmount = round2(Number(paymentMeta.amount) || 0);
  const cardProratedTotals = new Map();
  if (methodNorm === "cartao_credito" && incomingCardAmount > 0 && sumBaseTarget > 0 && incomingCardAmount > sumBaseTarget + 0.01) {
    let allocatedSoFar = 0;
    targetProrateItems.forEach((r, idx) => {
      const rPendingBase = round2(Math.max(0, (Number(r.totalAmount) || 0) - (Number(r.paidAmount) || 0)) || Number(r.totalAmount) || 0);
      const priorPaidR = round2(Number(r.paidAmount) || 0);
      const share =
        idx === targetProrateItems.length - 1
          ? round2(incomingCardAmount - allocatedSoFar)
          : round2((rPendingBase / sumBaseTarget) * incomingCardAmount);
      allocatedSoFar = round2(allocatedSoFar + share);
      cardProratedTotals.set(r.id, {
        newTotal: round2(priorPaidR + share),
        sharePaid: share
      });
    });
  }

  for (const r of activeItems) {
    const baseTotalBefore = round2(Number(r.totalAmount) || 0);
    const priorPaidBeforeSettle = round2(Math.min(baseTotalBefore, Math.max(0, Number(r.paidAmount) || 0)));
    const cardAllocation = cardProratedTotals.get(r.id);
    if (cardAllocation) {
      r.basePixTotalAmount = r.basePixTotalAmount || baseTotalBefore;
      r.totalAmount = cardAllocation.newTotal;
      r.cardTotalAmount = cardAllocation.newTotal;
    }
    const rTotal = round2(Number(r.totalAmount) || 0);
    const wasPre = r.status === "pre_reserva" || r.status === "expirada";
    if (wasPre || !r.status) {
      r.status = "confirmada";
    }
    delete r.expiresAt;
    delete r.expiredAt;
    delete r.reminderAt;

    r.paidAmount = rTotal;
    r.paymentStatus = "pago_total";
    r.paymentMethod = methodNorm;
    r.paidAt = r.paidAt || paidAtIso;
    r.paymentConfirmationDispatchedAt = nowIso;
    r.paymentReceiptSentAt = nowIso;
    r.updatedAt = nowIso;

    if (paymentMeta.endToEndId) r.pixEndToEndId = paymentMeta.endToEndId;
    if (paymentMeta.txId) r.pixTxId = paymentMeta.txId;
    if (paymentMeta.mpPaymentId) {
      r.mpPaymentId = String(paymentMeta.mpPaymentId);
      r.pixTxId = null;
    }

    if (!r.requesterIsGuest1) {
      r.hideFinancialForGuest = true;
    }

    if (isFlatGuestCredentialIncomplete(r)) {
      r.b2bCredentialWhatsappSentAt = r.b2bCredentialWhatsappSentAt || nowIso;
      r.credentialFirstRequestSentAt = r.credentialFirstRequestSentAt || nowIso;
      r.credentialSentStages = {
        ...(r.credentialSentStages || {}),
        initial: { ...(r.credentialSentStages?.initial || {}), whatsappSentAt: nowIso }
      };
    }

    if (!Array.isArray(r.payments)) r.payments = [];
    const hasSettledEntry = r.payments.some(
      (p) => p && (p.packageBatchPaid || (paymentMeta.endToEndId && p.endToEndId === paymentMeta.endToEndId) || (paymentMeta.mpPaymentId && String(p.mpPaymentId) === String(paymentMeta.mpPaymentId)))
    );
    const remainingPixShare = Math.max(0, round2(rTotal - priorPaidBeforeSettle));
    const entryAmount = cardAllocation ? cardAllocation.sharePaid : remainingPixShare;
    if (!hasSettledEntry && entryAmount > 0) {
      r.payments.push({
        id: `pay_pkg_${r.id}_${Date.now()}`,
        date: paidAtIso.slice(0, 10),
        paidAt: paidAtIso,
        amount: entryAmount,
        method: methodNorm,
        packageCode: pkgCode,
        packageBatchPaid: true,
        txId: paymentMeta.txId || r.packagePixTxId || null,
        endToEndId: paymentMeta.endToEndId || null,
        mpPaymentId: paymentMeta.mpPaymentId ? String(paymentMeta.mpPaymentId) : null,
        notes: `Pagamento único do pacote ${pkgCode} (rateado p/ Flat ${r.flatNumber})`
      });
    }
  }

  if (typeof deps.scheduleUpcomingReservationTriggers === "function") {
    try {
      deps.scheduleUpcomingReservationTriggers(db, deps.saveDatabase);
    } catch (_) {}
  }

  const summary = computePackageSummary(db, pkgCode, {
    baseUrl,
    computeCardAmountFromPix: deps.computeCardAmountFromPix
  });

  // Dispara 1 único recibo + link único de credenciamento para o Solicitante (idempotente)
  const primary = activeItems[0];
  let sentReceiptWhatsapp = false;
  let sentReceiptEmail = false;
  if (primary && !primary.packagePaymentReceiptSentAt && !alreadyAllSettled) {
    for (const r of activeItems) r.packagePaymentReceiptSentAt = nowIso;

    const reqFirstName = String(summary.requesterName || "Cliente").trim().split(/\s+/)[0] || "Cliente";
    const flatsBreakdown = summary.items
      .filter((it) => it.isActive)
      .map(
        (it) =>
          `• *Flat ${it.flatNumber}* (${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)}) — R$ ${formatMoneyBr(it.totalAmount)}`
      )
      .join("\n");

    const receiptMsg =
      `✅ *Pagamento Confirmado — Pacote ${pkgCode}!*\n\n` +
      `Olá, *${reqFirstName}*! Recebemos seu pagamento de *R$ ${formatMoneyBr(summary.totalAmount)}* e todos os *${summary.activeFlatsCount} flats* do seu pacote estão garantidos!\n\n` +
      `🏢 *Flats Confirmados:*\n${flatsBreakdown}\n\n` +
      (summary.needsGuestCredentials
        ? `👥 *Próximo Passo:* Use o botão *Cadastrar Hóspedes* abaixo para informar os hóspedes de cada flat.\n\n`
        : `✨ _Os hóspedes já cadastrados receberão apenas as instruções do seu respectivo flat (sem valores financeiros)._\n\n`) +
      `🧾 Acesse seu recibo e nota fiscal consolidada pelo botão abaixo:`;

    const cleanReqPhone =
      typeof deps.cleanWhatsAppPhone === "function"
        ? deps.cleanWhatsAppPhone(summary.requesterPhone)
        : cleanPhoneLocal(summary.requesterPhone);

    if (cleanReqPhone && cleanReqPhone.length >= 10 && typeof deps.sendZapiMessage === "function" && !suppressSend) {
      try {
        const buttons = summary.needsGuestCredentials
          ? [
              { id: `cred_${pkgCode}`, type: "URL", url: `${summary.packagePortalUrl}#hospedes`, label: "👥 Cadastrar Hóspedes" },
              { id: `rec_${pkgCode}`, type: "URL", url: summary.packagePortalUrl, label: "🧾 Abrir Pacote" }
            ]
          : [{ id: `rec_${pkgCode}`, type: "URL", url: summary.packagePortalUrl, label: "🧾 Abrir Pacote" }];
        const zRes = await deps.sendZapiMessage(db?.zapiConfig, {
          phone: cleanReqPhone,
          message: receiptMsg,
          buttons,
          channelId: "guest_schedule",
          recipientRole: "solicitante",
          triggerEvent: "payment_confirmed",
          db
        });
        sentReceiptWhatsapp = Boolean(zRes?.success || zRes?.ok || zRes?.sent || zRes?.messageId || zRes?.zaapId);
        if (!Array.isArray(db.whatsappHistory)) db.whatsappHistory = [];
        for (const r of activeItems) {
          db.whatsappHistory.push({
            id: `wah_pkgrec_${r.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            reservationId: r.id,
            reservationCode: r.code,
            packageCode: pkgCode,
            guestName: summary.requesterName,
            guestPhone: cleanReqPhone,
            recipientType: r.requesterIsGuest1 ? "guest" : "requester",
            recipientRole: "solicitante",
            triggerEvent: "payment_confirmed",
            templateId: "tpl_package_payment_confirmed",
            message: receiptMsg,
            status: sentReceiptWhatsapp ? "sent" : "failed",
            messageId: zRes?.messageId || null,
            sentAt: nowIso
          });
        }
        if (typeof deps.appendMessageToConversation === "function") {
          deps.appendMessageToConversation(db, {
            phone: cleanReqPhone,
            senderName: "CorpFlats",
            senderPhone: db?.zapiConfig?.instanceId || "",
            fromMe: true,
            text: receiptMsg,
            type: "text",
            buttons,
            triggerEvent: "payment_confirmed",
            reservationCode: primary?.code || pkgCode,
            packageCode: pkgCode,
            status: sentReceiptWhatsapp ? "delivered" : "failed",
            timestamp: nowIso,
            messageId: zRes?.messageId || `msg_pkgrec_${Date.now()}`
          });
        }
      } catch (wErr) {
        console.warn(`[Package Receipt WhatsApp] Erro (${pkgCode}):`, wErr?.message || wErr);
      }
    }

    const settleRequesterEmails = parseEmailList(summary.requesterEmail);
    if (settleRequesterEmails.length > 0 && typeof deps.sendEmailAsync === "function" && !suppressSend) {
      try {
        const subject = `Pagamento Confirmado — Pacote ${pkgCode} (${summary.activeFlatsCount} Flats) — CorpFlats`;
        const htmlRows = summary.items
          .filter((it) => it.isActive)
          .map(
            (it) =>
              `<tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>Flat ${it.flatNumber}</strong> (${it.code})</td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)}</td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.informGuestsLater ? "Informar no link de credenciamento" : it.guestName}</td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">R$ ${formatMoneyBr(it.totalAmount)}</td>
              </tr>`
          )
          .join("");
        const receiptHtml = `
          <div style="font-family:Arial,sans-serif;color:#1e293b;max-width:640px;margin:0 auto;">
            <h2 style="color:#0f172a;">Olá, ${summary.requesterName}!</h2>
            <p>Confirmamos o recebimento do seu pagamento único de <strong>R$ ${formatMoneyBr(summary.totalAmount)}</strong> referente ao pacote <strong>${pkgCode}</strong> (${summary.activeFlatsCount} flats).</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
              <thead>
                <tr style="background:#f8fafc;text-align:left;">
                  <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Flat</th>
                  <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Período</th>
                  <th style="padding:8px;border-bottom:2px solid #cbd5e1;">Hóspede</th>
                  <th style="padding:8px;border-bottom:2px solid #cbd5e1;text-align:right;">Valor Quitados</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>
            ${
              summary.needsGuestCredentials
                ? `<p style="margin:16px 0;"><a href="${summary.batchCredentialUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Cadastrar Hóspede 1 e 2 de Cada Flat</a></p>`
                : ""
            }
            <p style="margin:16px 0;">
              <a href="${summary.packagePortalUrl}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
                Acessar Recibo Único &amp; Solicitar 1 NFS-e Consolidada
              </a>
            </p>
          </div>
        `;
        const wrappedReceiptHtml =
          typeof deps.wrapEmailTemplate === "function"
            ? deps.wrapEmailTemplate({
                title: subject,
                badge: "Pagamento Confirmado",
                contentHtml: receiptHtml
              })
            : receiptHtml;
        const emailOut = await deps.sendEmailAsync({
          db,
          saveDatabase: deps.saveDatabase,
          reservationId: primary?.code || pkgCode,
          recipient: settleRequesterEmails.join(", "),
          subject,
          bodyHtml: wrappedReceiptHtml,
          overrides: deps.emailOverrides,
          metadata: {
            category: "reservation_package_receipt",
            trigger: "package_payment_confirmed",
            packageCode: pkgCode
          }
        });
        sentReceiptEmail = emailOut === null ? false : (emailOut ? Boolean(emailOut.ok !== false && emailOut.status !== "failed") : true);
      } catch (eErr) {
        console.warn(`[Package Receipt Email] Erro (${pkgCode}):`, eErr?.message || eErr);
      }
    }
  }

  // Envia instruções individuais sem valores para Hóspede 1 e Hóspede 2 já preenchidos
  const guestDispatches = await dispatchIndividualFlatGuestInstructions(db, activeItems, baseUrl, {
    ...deps,
    suppressExternalSend: suppressSend
  });

  if (typeof deps.saveDatabase === "function") {
    deps.saveDatabase("package_payment_settled");
  }

  return {
    packageCode: pkgCode,
    settledReservations: activeItems,
    summary,
    sentReceiptWhatsapp,
    sentReceiptEmail,
    guestDispatches
  };
}

/**
 * Cancela 1 flat específico (ou o pacote inteiro se solicitado):
 * - Antes de pagar: cancela o flat e recalcula automaticamente o MESMO PIX único para os demais flats ativos!
 * - Após pago: cancela APENAS o flat escolhido mantendo os demais confirmados e pagos,
 *   aplicando `partial_refund` (estorno parcial), `credit` (crédito ao solicitante/hóspede) ou `no_refund` (sem reembolso).
 */
export async function cancelSinglePackageFlat(db, targetRes, options = {}, deps = {}) {
  if (!targetRes) throw new Error("Reserva não encontrada.");
  const pkgCode = getPackageIdFromTarget(targetRes);
  const all = pkgCode ? getPackageReservations(db, pkgCode) : [targetRes];
  const cancelWholePackage = Boolean(options.cancelWholePackage);
  const reason = String(options.reason || "Cancelamento parcial de flat no pacote").trim();
  const nowIso = new Date().toISOString();

  const targets = cancelWholePackage
    ? all.filter((r) => !isPackageItemCancelled(r))
    : [targetRes];

  const cancelledResults = [];

  for (const r of targets) {
    if (isPackageItemCancelled(r)) continue;
    const wasPaid = isReservationSettledInPackage(r) && (Number(r.paidAmount) || 0) > 0;
    const paidVal = wasPaid ? round2(Number(r.paidAmount || r.totalAmount) || 0) : 0;

    r.previousStatusBeforeCancel = r.status;
    r.status = "cancelada";
    r.cancelledAt = nowIso;
    r.cancellationReason = reason;
    r.updatedAt = nowIso;
    delete r.expiresAt;
    delete r.reminderAt;

    if (!wasPaid) {
      r.refundResolution = "unpaid_recalculated";
      r.refundStatus = "nao_aplicavel";
      r.refundAmount = 0;
    } else {
      const resolutionRaw = String(options.refundResolution || "partial_refund").toLowerCase().trim();
      const resolution = ["partial_refund", "credit", "no_refund"].includes(resolutionRaw)
        ? resolutionRaw
        : "partial_refund";
      const requestedAmt =
        options.refundAmount !== undefined && options.refundAmount !== null && options.refundAmount !== ""
          ? Math.min(paidVal, Math.max(0, round2(Number(options.refundAmount))))
          : paidVal;

      r.refundResolution = resolution;

      if (resolution === "partial_refund") {
        r.refundStatus = "estorno_parcial_solicitado";
        r.refundAmount = requestedAmt;
        r.refundRequestedAt = nowIso;
      } else if (resolution === "credit") {
        r.refundStatus = "credito_gerado";
        r.refundAmount = requestedAmt;
        const creditEntry = {
          id: `CRED-PKG-${r.id}-${Date.now()}`,
          code: `CRD-${Math.floor(100000 + Math.random() * 900000)}`,
          packageCode: pkgCode || null,
          sourceReservationId: r.id,
          sourceReservationCode: r.code,
          flatNumber: r.flatNumber,
          beneficiaryName:
            r.requesterInfo?.name || r.requesterName || r.companyName || r.guestName || "Solicitante",
          beneficiaryPhone:
            r.requesterInfo?.whatsapp || r.requesterInfo?.phone || r.requesterPhone || r.guestPhone || "",
          beneficiaryDocument:
            r.requesterInfo?.cpf || r.companyCnpj || r.guestDocument || "",
          amount: requestedAmt,
          remainingAmount: requestedAmt,
          status: "ativo",
          reason: `Crédito por cancelamento do Flat ${r.flatNumber} no pacote ${pkgCode || r.code}`,
          createdAt: nowIso
        };
        if (!Array.isArray(db.guestCredits)) db.guestCredits = [];
        db.guestCredits.push(creditEntry);
        r.creditGeneratedId = creditEntry.id;
        r.creditGeneratedCode = creditEntry.code;

        // Sincroniza saldo no cadastro CRM se localizado
        const cleanDoc = String(creditEntry.beneficiaryDocument || "").replace(/\D/g, "");
        const cleanPhone = String(creditEntry.beneficiaryPhone || "").replace(/\D/g, "");
        if (Array.isArray(db.guests)) {
          const crmGuest = db.guests.find((g) => {
            const gDoc = String(g?.cpf || g?.document || "").replace(/\D/g, "");
            const gPhone = String(g?.phone || "").replace(/\D/g, "");
            return (cleanDoc && gDoc === cleanDoc) || (cleanPhone.length >= 10 && gPhone === cleanPhone);
          });
          if (crmGuest) {
            crmGuest.creditBalance = round2((Number(crmGuest.creditBalance) || 0) + requestedAmt);
          }
        }
      } else {
        r.refundStatus = "sem_reembolso";
        r.refundAmount = 0;
      }
    }

    if (typeof deps.addReservationAuditLog === "function") {
      deps.addReservationAuditLog(r, {
        action: "package_item_cancelled",
        actor: options.actor || { name: "Operador PMS", role: "admin", type: "user" },
        source: options.source || "Pacote Multi-Flat",
        description: wasPaid
          ? `Flat ${r.flatNumber} cancelado do pacote pago (${r.refundResolution}: R$ ${formatMoneyBr(r.refundAmount)}) mantendo demais flats ativos`
          : `Flat ${r.flatNumber} removido do pacote antes do pagamento; PIX único recalculado para os demais flats`
      });
    }

    cancelledResults.push({
      id: r.id,
      code: r.code,
      flatNumber: r.flatNumber,
      wasPaid,
      refundResolution: r.refundResolution,
      refundStatus: r.refundStatus,
      refundAmount: r.refundAmount,
      creditGeneratedCode: r.creditGeneratedCode || null
    });
  }

  // Garante que sempre exista um item primário ativo caso o Flat 1 tenha sido cancelado
  const remainingActive = all.filter((x) => isPackageItemActive(x));
  if (remainingActive.length > 0 && !remainingActive.some((x) => x.isPackagePrimary)) {
    for (const x of all) x.isPackagePrimary = false;
    remainingActive[0].isPackagePrimary = true;
  }

  // Garante que os flats irmãos pagos continuem 100% confirmados e pagos, ou recalcula o PIX único se pendentes!
  let updatedSummary = null;
  if (pkgCode) {
    updatedSummary = await syncPackagePixAndPaymentLinks(db, pkgCode, {
      ...deps,
      forceRegeneratePix: true
    });
  } else if (typeof deps.saveDatabase === "function") {
    deps.saveDatabase("single_flat_cancelled");
  }

  return {
    packageCode: pkgCode || null,
    cancelledItems: cancelledResults,
    summary: updatedSummary
  };
}

/**
 * Reativa pré-reservas expiradas de um pacote (pacote inteiro ou apenas 1 flat selecionado),
 * realocando automaticamente algum flat caso tenha sido ocupado no meio-tempo e gerando 1 novo PIX único.
 */
export async function reactivateExpiredPackage(db, targetResOrPkgId, options = {}, deps = {}) {
  const pkgCode = getPackageIdFromTarget(targetResOrPkgId);
  const all = pkgCode ? getPackageReservations(db, pkgCode) : (typeof targetResOrPkgId === "object" ? [targetResOrPkgId] : []);
  if (all.length === 0) throw new Error("Pacote ou reserva não encontrado para reativação.");

  const reactivateWholePackage = options.reactivateWholePackage !== false;
  const specificId = typeof targetResOrPkgId === "object" ? targetResOrPkgId.id : options.reservationId;

  const candidates = reactivateWholePackage
    ? all.filter((r) => isPackageItemExpired(r))
    : all.filter((r) => isPackageItemExpired(r) && String(r.id) === String(specificId));

  if (candidates.length === 0) {
    throw new Error("Nenhuma pré-reserva expirada encontrada para reativar.");
  }

  const targetStatus = options.status === "confirmada" ? "confirmada" : "pre_reserva";
  const holdMinutes = Math.max(5, Number(options.holdDurationMinutes) || 30);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAtIso = targetStatus === "pre_reserva" ? new Date(nowMs + holdMinutes * 60000).toISOString() : null;

  const canonicalFlats = typeof deps.getCanonicalFlats === "function" ? deps.getCanonicalFlats(db) : db.flats || [];
  const reassignedFlats = [];

  for (const r of candidates) {
    // Verifica conflito de overbooking no flat original
    const currentConflicts =
      typeof deps.findActiveOverbookingConflicts === "function"
        ? deps.findActiveOverbookingConflicts(db, {
            flatId: r.flatId,
            flatNumber: r.flatNumber,
            checkinDate: r.checkinDate,
            checkoutDate: r.checkoutDate,
            excludeResId: r.id
          })
        : [];

    if (currentConflicts.length > 0) {
      // Procura flat substituto livre no período
      const replacement = canonicalFlats.find((fl) => {
        if (fl.isActive === false || fl.maintenanceBlocked) return false;
        // Evita colidir com outro flat já ativo ou candidato deste mesmo pacote
        const usedInBatch = candidates.some(
          (other) =>
            other.id !== r.id &&
            String(other.flatNumber) === String(fl.number) &&
            r.checkinDate < other.checkoutDate &&
            r.checkoutDate > other.checkinDate
        );
        if (usedInBatch) return false;
        const c =
          typeof deps.findActiveOverbookingConflicts === "function"
            ? deps.findActiveOverbookingConflicts(db, {
                flatId: fl.id,
                flatNumber: fl.number,
                checkinDate: r.checkinDate,
                checkoutDate: r.checkoutDate,
                excludeResId: r.id
              })
            : [];
        return c.length === 0;
      });

      if (!replacement) {
        throw new Error(
          `Não há apartamento disponível para reativar o período ${r.checkinDate} a ${r.checkoutDate} (Flat ${r.flatNumber} já ocupado).`
        );
      }

      const oldFlat = r.flatNumber;
      r.flatId = replacement.id;
      r.flatNumber = String(replacement.number);
      reassignedFlats.push({ reservationCode: r.code, oldFlat, newFlat: r.flatNumber });
    }

    r.status = targetStatus;
    delete r.expiredAt;
    r.reactivatedAt = nowIso;
    r.updatedAt = nowIso;
    if (targetStatus === "pre_reserva") {
      r.expiresAt = expiresAtIso;
      r.holdDurationMinutes = holdMinutes;
      r.holdDurationLabel = holdMinutes >= 60 ? `${Math.round(holdMinutes / 60)}h` : `${holdMinutes} minutos`;
      r.paymentStatus = "pendente_pix";
    } else {
      delete r.expiresAt;
    }
  }

  const summary = pkgCode
    ? await syncPackagePixAndPaymentLinks(db, pkgCode, { ...deps, forceRegeneratePix: true })
    : null;

  if (pkgCode && options.sendWhatsapp !== false) {
    await dispatchPackagePreReservationCreated(db, pkgCode, deps.baseUrl || "https://corpflats.com.br", deps);
  } else if (typeof deps.saveDatabase === "function") {
    deps.saveDatabase("package_reactivated");
  }

  return {
    packageCode: pkgCode || null,
    reactivatedWholePackage: reactivateWholePackage,
    reactivatedCount: candidates.length,
    reactivatedCodes: candidates.map((r) => r.code),
    reassignedFlats,
    summary
  };
}
