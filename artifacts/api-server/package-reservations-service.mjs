import crypto from "crypto";
import { parseEmailList } from "./mail-service.mjs";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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
  return false;
}

/**
 * Rateio automático do pacote (soma normal, desconto em R$, desconto em % ou valor fechado)
 * mantendo soma exata até o centavo e ajustando `dailyRates` para coerência contábil.
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
    packagePortalPath: `/minha-reserva/${encodeURIComponent(pkgCode)}?requester=1`,
    packagePortalUrl: `${baseUrl}/minha-reserva/${encodeURIComponent(pkgCode)}?requester=1`,
    packageCopyPixUrl: `${baseUrl}/copiar-pix/${encodeURIComponent(pkgCode)}`,
    consolidatedInvoiceId: consolidatedInvoice?.consolidatedInvoiceId || consolidatedInvoice?.invoiceId || null,
    consolidatedNfseNumber: consolidatedInvoice?.numeroNfse || consolidatedInvoice?.nfseNumber || null,
    consolidatedBoletoId,
    items: all.map((r, i) => {
      const gArr = Array.isArray(r.guests) ? r.guests : [];
      const rTot = round2(Number(r.totalAmount) || 0);
      const rSettled = isReservationSettledInPackage(r);
      const rPaid = rSettled ? rTot : round2(Math.min(rTot, Number(r.paidAmount) || 0));
      return {
        id: r.id,
        code: r.code,
        packageIndex: Number(r.packageIndex) || i + 1,
        flatId: r.flatId,
        flatNumber: r.flatNumber,
        checkinDate: r.checkinDate,
        checkoutDate: r.checkoutDate,
        status: r.status || "confirmada",
        isActive: isPackageItemActive(r),
        isCancelled: isPackageItemCancelled(r),
        isExpired: isPackageItemExpired(r),
        isPaid: rSettled,
        guestCount: Math.max(1, Number(r.guestCount || r.adults) || 1),
        guestName: r.guestName || gArr[0]?.name || "A Definir",
        guestPhone: r.guestPhone || gArr[0]?.phone || "",
        guestDocument: r.guestDocument || gArr[0]?.cpf || gArr[0]?.document || "",
        guest2Name: gArr[1]?.name || "",
        guest2Phone: gArr[1]?.phone || "",
        guest2Document: gArr[1]?.cpf || gArr[1]?.document || "",
        requesterIsGuest1: Boolean(r.requesterIsGuest1),
        informGuestsLater: Boolean(r.informGuestsLater || r.guestPending),
        guest2InformLater: Boolean(r.guest2InformLater || gArr[1]?.informLater),
        needsCredential: isFlatGuestCredentialIncomplete(r),
        includeBreakfast: Boolean(r.includeBreakfast),
        twinBeds: Boolean(r.twinBeds || r.bedType === "twin" || r.bedType === "2 Solteiro"),
        extraMattress: Boolean(r.extraMattress),
        bedType: r.bedType || (r.twinBeds ? "twin" : "queen"),
        vehicle: r.vehicle || null,
        dailyRate: round2(Number(r.dailyRate) || 0),
        totalAmount: rTot,
        paidAmount: rPaid,
        pendingAmount: Math.max(0, round2(rTot - rPaid)),
        refundStatus: r.refundStatus || null,
        refundResolution: r.refundResolution || null,
        refundAmount: round2(Number(r.refundAmount) || 0),
        creditGeneratedId: r.creditGeneratedId || null,
        guestPortalPath: `/minha-reserva/${encodeURIComponent(r.code)}`,
        preCheckinPath: `/pre-checkin/${encodeURIComponent(r.code)}`
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

/**
 * Envia 1 única mensagem consolidada de Pré-Reserva (WhatsApp + E-mail) para o Solicitante do pacote,
 * sem disparar N mensagens separadas.
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
  const isConfirmedNoHold = activeItems.every((r) => String(r.status || "").toLowerCase() === "confirmada") && !activeItems[0]?.expiresAt;
  const holdLabel = activeItems[0]?.holdDurationLabel || "30 minutos";
  const isFaturado = summary.isFaturadoBoleto;
  const isPaid = summary.isPaid;

  // Marca flags nas reservas filhas para evitar disparos duplicados avulsos da régua ou dos timers de 20s/60s
  for (const r of activeItems) {
    r.packagePreResDispatchedAt = nowIso;
    r._needsOfficialPreResDispatch = false;
    r._preReservationRulerSentAt = nowIso;
    if (isPaid && isFlatGuestCredentialIncomplete(r)) {
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
      const bfLabel = it.includeBreakfast ? "Com Café" : "Sem Café";
      const bedLabel = it.twinBeds ? "2 Camas Solteiro" : "Cama Casal";
      const gLabel = it.informGuestsLater ? "Hóspedes a informar após pagamento" : it.guestName;
      return `• *Flat ${it.flatNumber}* (${it.code}): ${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)} • ${occLabel} • ${bfLabel} • ${bedLabel} • _${gLabel}_ — R$ ${formatMoneyBr(it.totalAmount)}`;
    })
    .join("\n");

  let msgText = "";
  if (isPaid) {
    msgText =
      `Olá, *${reqNameFirst}*! Tudo bem? 😊\n\n` +
      `Seu pacote com *${summary.activeFlatsCount} flats* no *CorpFlats* (*${summary.packageCode}*) está *CONFIRMADO*!\n\n` +
      `🏢 *Resumo dos Flats Reservados:*\n${flatsLines}\n\n` +
      `💰 *Total do Pacote:* R$ ${formatMoneyBr(summary.totalAmount)} (Pago)\n` +
      (summary.needsGuestCredentials
        ? `\n👥 *Cadastro dos Hóspedes por Flat (Link Único):*\nAcesse para informar ou revisar o Hóspede 1 e 2 de cada flat:\n${summary.batchCredentialUrl}\n`
        : "") +
      `\n🔗 *Painel Completo do Pacote (Recibo & Nota Fiscal):*\n${summary.packagePortalUrl}`;
  } else if (isFaturado) {
    msgText =
      `Olá, *${reqNameFirst}*! Tudo bem? 😊\n\n` +
      `Seu pacote faturado com *${summary.activeFlatsCount} flats* no *CorpFlats* (*${summary.packageCode}*) foi registrado com sucesso!\n\n` +
      `🏢 *Resumo dos Flats Reservados:*\n${flatsLines}\n\n` +
      `💰 *Valor Total Faturado do Pacote:* R$ ${formatMoneyBr(summary.totalAmount)}\n` +
      (summary.needsGuestCredentials
        ? `\n👥 *Cadastro dos Hóspedes por Flat (Link Único):*\n${summary.batchCredentialUrl}\n`
        : "") +
      `\n🔗 *Painel do Pacote:*\n${summary.packagePortalUrl}`;
  } else {
    const hasPartialDeposit = round2(Number(summary.paidAmount) || 0) > 0;
    msgText =
      `Olá, *${reqNameFirst}*! Tudo bem? 😊\n\n` +
      `Preparamos sua pré-reserva unificada de *${summary.activeFlatsCount} flats* no *CorpFlats* (*${summary.packageCode}*) com *pagamento único*!\n\n` +
      `🏢 *Flats incluídos no pacote:*\n${flatsLines}\n\n` +
      (hasPartialDeposit
        ? `💰 *Total do Pacote:* R$ ${formatMoneyBr(summary.totalAmount)}\n` +
          `✅ *Sinal Já Pago:* - R$ ${formatMoneyBr(summary.paidAmount)}\n` +
          `💎 *Saldo Restante no PIX:* *R$ ${formatMoneyBr(summary.pendingAmount)}*\n`
        : `💎 *Total Único no PIX:* *R$ ${formatMoneyBr(summary.pendingAmount)}*\n`) +
      `💳 *Ou no Cartão de Crédito:* R$ ${formatMoneyBr(summary.cardPendingAmount)}\n` +
      (isConfirmedNoHold
        ? `✅ *Status dos flats:* Confirmado com sinal pago\n\n`
        : `⏳ *Prazo de garantia dos flats:* ${holdLabel}\n\n`) +
      `🔗 *Pagar PIX Único ou Cartão / Acompanhar Pacote:*\n${summary.packagePortalUrl}\n\n` +
      (summary.pixCopiaECola ? `📋 *Copiar Chave PIX Única:*\n${summary.packageCopyPixUrl}\n\n` : "") +
      `_Assim que o pagamento único for confirmado, enviaremos seu recibo unificado` +
      (summary.needsGuestCredentials
        ? ` e o link único para você informar os hóspedes de cada flat!_`
        : ` e cada hóspede receberá apenas as instruções do seu respectivo flat (sem valores financeiros)._`);
  }

  let sentWhatsapp = false;
  let sentEmail = false;

  const cleanPhone =
    typeof deps.cleanWhatsAppPhone === "function"
      ? deps.cleanWhatsAppPhone(summary.requesterPhone)
      : String(summary.requesterPhone || "").replace(/\D/g, "");

  if (cleanPhone && cleanPhone.length >= 10 && typeof deps.sendZapiMessage === "function" && !deps.suppressExternalSend) {
    try {
      const triggerEvt = isPaid ? "payment_confirmed" : "pre_reservation_created";
      const buttons = !isPaid && !isFaturado && summary.pixCopiaECola
        ? [
            { id: `pkg_portal_${summary.packageCode}`, type: "URL", url: summary.packagePortalUrl, label: "Abrir Pacote / Pagar" },
            { id: `pkg_pix_${summary.packageCode}`, type: "URL", url: summary.packageCopyPixUrl, label: "Copiar PIX Único" }
          ]
        : [{ id: `pkg_portal_${summary.packageCode}`, type: "URL", url: summary.packagePortalUrl, label: "Acessar Pacote" }];

      const zRes = await deps.sendZapiMessage(db?.zapiConfig, {
        phone: cleanPhone,
        message: msgText,
        buttons,
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
          templateId: isPaid ? "tpl_package_payment_confirmed" : "tpl_package_pre_reserva",
          message: msgText,
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
          buttons,
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
      const subject = isPaid
        ? `Confirmação do Pacote ${summary.packageCode} (${summary.activeFlatsCount} Flats) — CorpFlats`
        : `Pré-Reserva Pacote ${summary.packageCode} (${summary.activeFlatsCount} Flats - Pagamento Único) — CorpFlats`;
      const htmlRows = summary.items
        .filter((it) => it.isActive)
        .map(
          (it) =>
            `<tr>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>Flat ${it.flatNumber}</strong> (${it.code})</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.guestCount} pax • ${it.includeBreakfast ? "Com Café" : "Sem Café"}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.informGuestsLater ? "Informar após pagamento" : it.guestName}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">R$ ${formatMoneyBr(it.totalAmount)}</td>
            </tr>`
        )
        .join("");

      const bodyHtml = `
        <div style="font-family:Arial,sans-serif;color:#1e293b;max-width:640px;margin:0 auto;">
          <h2 style="color:#0f172a;">Olá, ${summary.requesterName}!</h2>
          <p>${
            isPaid
              ? `Seu pacote <strong>${summary.packageCode}</strong> com <strong>${summary.activeFlatsCount} flats</strong> está confirmado!`
              : `Sua pré-reserva unificada <strong>${summary.packageCode}</strong> com <strong>${summary.activeFlatsCount} flats</strong> foi gerada para pagamento único.`
          }</p>
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
            !isPaid && !isFaturado && round2(Number(summary.paidAmount) || 0) > 0
              ? `<p style="font-size:15px;color:#15803d;margin:4px 0;"><strong>Sinal / Valor Já Pago: - R$ ${formatMoneyBr(summary.paidAmount)}</strong></p>
                 <p style="font-size:16px;color:#0f172a;margin:4px 0;"><strong>Saldo Restante a Pagar: R$ ${formatMoneyBr(summary.pendingAmount)}</strong></p>`
              : ""
          }
          ${
            !isPaid && !isFaturado && summary.pixCopiaECola
              ? `<div style="background:#f0fdf4;border:1px solid #86efac;padding:12px;border-radius:8px;margin:16px 0;">
                  <strong>Chave PIX Copia e Cola Única (Pacote Completo):</strong>
                  <pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;background:#fff;padding:8px;border-radius:4px;">${summary.pixCopiaECola}</pre>
                </div>`
              : ""
          }
          <p style="margin:20px 0;">
            <a href="${summary.packagePortalUrl}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
              ${isPaid ? "Acessar Recibo & Nota Fiscal do Pacote" : "Pagar Agora / Acompanhar Pacote"}
            </a>
          </p>
          ${
            isPaid && summary.needsGuestCredentials
              ? `<p><a href="${summary.batchCredentialUrl}" style="color:#2563eb;font-weight:bold;">Clique aqui para cadastrar Hóspede 1 e Hóspede 2 de cada flat</a></p>`
              : ""
          }
        </div>
      `;

      const htmlWrapped =
        typeof deps.wrapEmailTemplate === "function"
          ? deps.wrapEmailTemplate({
              title: subject,
              badge: isPaid ? "Pacote Confirmado" : (isFaturado ? "Pacote Faturado" : "Pré-Reserva Unificada"),
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
          trigger: isPaid ? "package_confirmed" : "package_pre_reservation_created",
          packageCode: summary.packageCode
        }
      });
      sentEmail = emailRes === null ? false : (emailRes ? Boolean(emailRes.ok !== false && emailRes.status !== "failed") : true);
    } catch (eErr) {
      console.warn(`[Package Email] Falha ao enviar e-mail consolidado (${summary.packageCode}):`, eErr?.message || eErr);
    }
  }

  // Se já nasceu confirmada/paga (ex.: Confirmada no PMS), envia instruções individuais sem valores para os hóspedes já cadastrados
  if (isPaid) {
    await dispatchIndividualFlatGuestInstructions(db, activeItems, baseUrl, deps);
  }

  if (typeof deps.saveDatabase === "function") deps.saveDatabase("package_created_dispatched");
  return { sentWhatsapp, sentEmail, messagePreview: msgText, summary };
}

/**
 * Dispara instruções individuais de cada flat para Hóspede 1 e Hóspede 2 já identificados,
 * ocultando 100% dos valores financeiros para quem não é o Solicitante.
 */
export async function dispatchIndividualFlatGuestInstructions(db, reservationsList, baseUrl, deps = {}) {
  const cleanBase = String(baseUrl || "https://corpflats.com.br").replace(/\/+$/, "");
  const sentTo = [];
  if (!Array.isArray(reservationsList) || reservationsList.length === 0) return sentTo;

  const primary = reservationsList[0];
  const reqPhoneDigits = String(
    primary?.requesterInfo?.whatsapp ||
    primary?.requesterInfo?.phone ||
    primary?.requesterPhone ||
    ""
  ).replace(/\D/g, "");

  for (const r of reservationsList) {
    if (!isPackageItemActive(r)) continue;
    const guestsArr = Array.isArray(r.guests) ? r.guests : [];
    const guestTargets = [];

    // Hóspede 1
    const g1Name = String(r.guestName || guestsArr[0]?.name || "").trim();
    const g1Phone = String(r.guestPhone || guestsArr[0]?.phone || "").trim();
    const g1Digits = g1Phone.replace(/\D/g, "");
    const isPlaceholder1 = !g1Name || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(g1Name);

    if (!isPlaceholder1 && g1Digits.length >= 10 && !r.guestPending && !r.informGuestsLater) {
      guestTargets.push({
        index: 1,
        name: g1Name,
        phone: g1Phone,
        digits: g1Digits,
        email: String(r.guestEmail || guestsArr[0]?.email || "").trim(),
        isSameAsRequester: Boolean(r.requesterIsGuest1 || (reqPhoneDigits && g1Digits === reqPhoneDigits))
      });
    }

    // Hóspede 2 (e 3 se houver)
    const maxCount = Math.max(1, Number(r.guestCount || r.adults) || 1);
    for (let i = 1; i < Math.min(maxCount, guestsArr.length); i++) {
      const comp = guestsArr[i];
      if (!comp || comp.informLater) continue;
      const cName = String(comp.name || "").trim();
      const cPhone = String(comp.phone || comp.whatsapp || "").trim();
      const cDigits = cPhone.replace(/\D/g, "");
      if (!cName || /a definir|informar depois|pendente|^h[oó]spede\s*\d*$/i.test(cName)) continue;
      if (cDigits.length >= 10) {
        guestTargets.push({
          index: i + 1,
          name: cName,
          phone: cPhone,
          digits: cDigits,
          email: String(comp.email || "").trim(),
          isSameAsRequester: Boolean(reqPhoneDigits && cDigits === reqPhoneDigits)
        });
      }
    }

    for (const target of guestTargets) {
      // Se é o próprio Solicitante no Flat 1, ele já recebeu o recibo + painel do pacote;
      // mas ainda enviamos o link direto do pré-checkin do flat dele se ainda não enviado, ou pulamos duplicata
      const sentKey = `pkgGuestInstrSent_${target.index}_${target.digits}`;
      if (r[sentKey]) continue;
      r[sentKey] = new Date().toISOString();

      // Garante que qualquer acesso individual por não-solicitante oculte valores financeiros
      if (!r.requesterIsGuest1) {
        r.hideFinancialForGuest = true;
      }

      const preCheckinUrl =
        target.index > 1
          ? `${cleanBase}/pre-checkin/${encodeURIComponent(r.code)}?guest=${target.index}`
          : `${cleanBase}/pre-checkin/${encodeURIComponent(r.code)}`;
      const portalUrl =
        target.index > 1
          ? `${cleanBase}/minha-reserva/${encodeURIComponent(r.code)}?guest=${target.index}`
          : `${cleanBase}/minha-reserva/${encodeURIComponent(r.code)}`;

      const firstName = target.name.split(/\s+/)[0] || "Hóspede";
      const bfText = r.includeBreakfast ? "Incluso ☕" : "Não incluso";
      const bedText = r.twinBeds ? "2 Camas de Solteiro" : "Cama de Casal";

      // Se for o próprio solicitante (que acabou de receber o recibo do pacote), não dispara 2º WhatsApp redundante na mesma hora
      if (target.isSameAsRequester && target.index === 1) {
        sentTo.push({ reservationCode: r.code, flatNumber: r.flatNumber, guestIndex: target.index, skippedSameAsRequester: true });
        continue;
      }

      const guestMsg =
        `Olá, *${firstName}*! Seja muito bem-vindo(a) ao *CorpFlats*! 😊\n\n` +
        `Sua hospedagem está *confirmada*! Confira os dados exclusivos do seu flat:\n\n` +
        `🏢 *Acomodação:* Flat *${r.flatNumber}* (Reserva *${r.code}*)\n` +
        `📅 *Check-in:* ${formatDateBrShort(r.checkinDate)} a partir das ${r.checkinTime || "14:00"}\n` +
        `📅 *Check-out:* ${formatDateBrShort(r.checkoutDate)} até as ${r.checkoutTime || "12:00"}\n` +
        `🛏️ *Configuração:* ${bedText} • Café da manhã: ${bfText}\n\n` +
        `📝 *Pré-Check-in Digital (Ficha & Acesso):*\n${preCheckinUrl}\n\n` +
        `🔑 *Portal da sua Estadia (Instruções & Senha da Porta):*\n${portalUrl}`;

      const cleanTargetPhone =
        typeof deps.cleanWhatsAppPhone === "function"
          ? deps.cleanWhatsAppPhone(target.phone)
          : target.digits;

      if (cleanTargetPhone && typeof deps.sendZapiMessage === "function" && !deps.suppressExternalSend) {
        try {
          const sentIso = new Date().toISOString();
          const guestButtons = [
            { id: `pre_${r.code}_${target.index}`, type: "URL", url: preCheckinUrl, label: "Fazer Pré-Check-in" },
            { id: `por_${r.code}_${target.index}`, type: "URL", url: portalUrl, label: "Instruções do Flat" }
          ];
          const gRes = await deps.sendZapiMessage(db?.zapiConfig, {
            phone: cleanTargetPhone,
            message: guestMsg,
            buttons: guestButtons,
            channelId: "guest_schedule",
            recipientRole: "guest",
            triggerEvent: "payment_confirmed",
            db
          });
          const gSent = Boolean(gRes?.success || gRes?.ok || gRes?.sent || gRes?.messageId || gRes?.zaapId);
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
            triggerEvent: "payment_confirmed",
            templateId: "tpl_package_guest_instructions",
            message: guestMsg,
            status: gSent ? "sent" : "failed",
            messageId: gRes?.messageId || null,
            sentAt: sentIso
          });
          if (typeof deps.appendMessageToConversation === "function") {
            deps.appendMessageToConversation(db, {
              phone: cleanTargetPhone,
              senderName: "CorpFlats",
              senderPhone: db?.zapiConfig?.instanceId || "",
              fromMe: true,
              text: guestMsg,
              type: "text",
              buttons: guestButtons,
              triggerEvent: "payment_confirmed",
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
          `• *Flat ${it.flatNumber}* (${it.code}): ${formatDateBrShort(it.checkinDate)} a ${formatDateBrShort(it.checkoutDate)} — R$ ${formatMoneyBr(it.totalAmount)}`
      )
      .join("\n");

    const receiptMsg =
      `✅ *Pagamento Único Confirmado — Pacote ${pkgCode}!*\n\n` +
      `Olá, *${reqFirstName}*! Recebemos seu pagamento de *R$ ${formatMoneyBr(summary.totalAmount)}* e todos os *${summary.activeFlatsCount} flats* do seu pacote estão 100% garantidos!\n\n` +
      `🏢 *Flats Confirmados:*\n${flatsBreakdown}\n\n` +
      (summary.needsGuestCredentials
        ? `👥 *Próximo Passo — Informar Hóspede 1 e 2 de cada Flat:*\nUse este *link único* para preencher rapidamente os hóspedes de cada apartamento conforme a ocupação:\n${summary.batchCredentialUrl}\n\n`
        : `✨ _Os hóspedes já cadastrados receberão apenas as instruções de check-in do seu próprio flat (sem valores financeiros)._\n\n`) +
      `🧾 *Recibo Único & Opção de 1 NFS-e Única (CPF ou CNPJ):*\n${summary.packagePortalUrl}`;

    const cleanReqPhone =
      typeof deps.cleanWhatsAppPhone === "function"
        ? deps.cleanWhatsAppPhone(summary.requesterPhone)
        : String(summary.requesterPhone || "").replace(/\D/g, "");

    if (cleanReqPhone && cleanReqPhone.length >= 10 && typeof deps.sendZapiMessage === "function" && !suppressSend) {
      try {
        const buttons = summary.needsGuestCredentials
          ? [
              { id: `cred_${pkgCode}`, type: "URL", url: summary.batchCredentialUrl, label: "Cadastrar Hóspedes" },
              { id: `rec_${pkgCode}`, type: "URL", url: summary.packagePortalUrl, label: "Recibo / Nota Fiscal" }
            ]
          : [{ id: `rec_${pkgCode}`, type: "URL", url: summary.packagePortalUrl, label: "Recibo / Nota Fiscal" }];
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
