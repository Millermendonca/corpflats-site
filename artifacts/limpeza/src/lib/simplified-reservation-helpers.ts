import { validateEmailList, formatEmailList } from "./email-utils.ts";
import {
  getCleaningFeeSummary,
  round2Money,
  type SimpleDailyRateItem,
  type SimpleChargeItem,
} from "./simplified-reservation-pricing.ts";

export const CANONICAL_CORPFLATS_19_FLATS = [
  { id: 1, number: "113", name: "Flat 113", isActive: true, cleaningStatus: "clean" },
  { id: 2, number: "114", name: "Flat 114", isActive: true, cleaningStatus: "clean" },
  { id: 3, number: "116", name: "Flat 116", isActive: true, cleaningStatus: "clean" },
  { id: 4, number: "211", name: "Flat 211", isActive: true, cleaningStatus: "clean" },
  { id: 5, number: "212", name: "Flat 212", isActive: true, cleaningStatus: "clean" },
  { id: 6, number: "215", name: "Flat 215", isActive: true, cleaningStatus: "clean" },
  { id: 7, number: "313", name: "Flat 313", isActive: true, cleaningStatus: "clean" },
  { id: 8, number: "408", name: "Flat 408", isActive: true, cleaningStatus: "clean" },
  { id: 10, number: "509", name: "Flat 509", isActive: true, cleaningStatus: "clean" },
  { id: 11, number: "511", name: "Flat 511", isActive: true, cleaningStatus: "clean" },
  { id: 12, number: "512", name: "Flat 512", isActive: true, cleaningStatus: "clean" },
  { id: 13, number: "605", name: "Flat 605", isActive: true, cleaningStatus: "clean" },
  { id: 14, number: "712", name: "Flat 712", isActive: true, cleaningStatus: "clean" },
  { id: 15, number: "715", name: "Flat 715", isActive: true, cleaningStatus: "clean" },
  { id: 16, number: "904", name: "Flat 904", isActive: true, cleaningStatus: "clean" },
  { id: 17, number: "905", name: "Flat 905", isActive: true, cleaningStatus: "clean" },
  { id: 18, number: "907", name: "Flat 907", isActive: true, cleaningStatus: "clean" },
  { id: 19, number: "1004", name: "Flat 1004", isActive: true, cleaningStatus: "clean" },
  { id: 21, number: "1304", name: "Flat 1304", isActive: true, cleaningStatus: "clean" },
];

export function isFlatBlockedStatus(flat: any): boolean {
  if (!flat) return false;
  return Boolean(
    flat.isActive === false ||
      flat.status === "manutencao_bloqueada" ||
      flat.status === "em_manutencao" ||
      flat.status === "bloqueado" ||
      flat.maintenanceStatus === "em_manutencao" ||
      flat.maintenanceStatus === "manutencao_bloqueada" ||
      flat.isBlocked === true ||
      flat.maintenanceBlocked === true
  );
}

export interface LocalFlatAvailabilityInfo {
  resConflict: any | null;
  blockConflict: any | null;
  isBlockedStatus: boolean;
  isAvailable: boolean;
  hasSameDayCheckout: boolean;
}

export interface SimpleFlatAvailabilitySummary {
  validRange: boolean;
  matchingFairShare: any | null;
  effectiveFlatsList: any[];
  totalFlatsCount: number;
  availableCount: number;
  isFullOccupancy: boolean;
  hasSelectedFlat: boolean;
  isSelectedAvailable: boolean;
  selectedFlatObj: any | null;
  selectedFlatStat: any | null;
  resolvedSelectedFlatNumber: string;
  firstFreeFlat: { id: string; number: string } | null;
  nextCleanFlat: { id: string; number: string } | null;
  localByFlatId: Record<string, LocalFlatAvailabilityInfo>;
}

export function evaluateSimpleFlatAvailability({
  flatsList,
  reservationsList,
  blocksList,
  fairShareResult,
  checkinDate,
  checkoutDate,
  flatId,
  excludeResId = null,
  nowMs = Date.now(),
}: {
  flatsList: any[];
  reservationsList: any[];
  blocksList: any[];
  fairShareResult: any | null;
  checkinDate: string;
  checkoutDate: string;
  flatId: string;
  excludeResId?: number | string | null;
  nowMs?: number;
}): SimpleFlatAvailabilitySummary {
  const validRange = Boolean(checkinDate && checkoutDate && checkoutDate > checkinDate);
  const matchingFairShare =
    validRange &&
    fairShareResult &&
    fairShareResult._checkin === checkinDate &&
    fairShareResult._checkout === checkoutDate &&
    Array.isArray(fairShareResult.allStats)
      ? fairShareResult
      : null;

  const rawFlatsList =
    Array.isArray(flatsList) && flatsList.length > 0
      ? flatsList.filter((f: any) => f && f.isActive !== false)
      : Array.isArray(fairShareResult?.allStats) && fairShareResult.allStats.length > 0
        ? fairShareResult.allStats
            .map((s: any) => s?.flat)
            .filter((f: any) => f && f.id !== undefined && f.id !== null && f.isActive !== false)
        : [];

  const localByFlatId: Record<string, LocalFlatAvailabilityInfo> = {};

  for (const f of rawFlatsList) {
    const fIdStr = String(f.id);
    const fNumStr = String(f.number);
    const blockedSt = isFlatBlockedStatus(f);

    const resConflict = validRange
      ? (reservationsList || []).find((r: any) => {
          if (!r) return false;
          if (excludeResId !== null && excludeResId !== undefined && String(r.id) === String(excludeResId)) {
            return false;
          }
          if (Number(r.flatId) !== Number(f.id) && String(r.flatNumber) !== fNumStr) {
            return false;
          }
          const st = String(r.status || "").toLowerCase();
          if (["cancelada", "cancelled", "cancelado", "no_show", "expirada"].includes(st)) {
            return false;
          }
          if (
            (st === "pre_reserva" || st === "pendente") &&
            r.expiresAt &&
            new Date(r.expiresAt).getTime() < nowMs &&
            r.paymentStatus !== "pago_total" &&
            r.paymentStatus !== "pago"
          ) {
            return false;
          }
          const effectiveOutDate = r.earlyCheckoutDate || r.checkoutDate;
          if (
            (r.checkoutDone ||
              r.earlyCheckout ||
              ["completed", "checked_out", "finalizada", "concluida", "checkout"].includes(st)) &&
            effectiveOutDate <= checkinDate
          ) {
            return false;
          }
          return r.checkinDate < checkoutDate && effectiveOutDate > checkinDate;
        }) || null
      : null;

    const blockConflict = validRange
      ? (blocksList || []).find((b: any) => {
          if (!b) return false;
          if (Number(b.flatId) !== Number(f.id) && String(b.flatNumber) !== fNumStr) {
            return false;
          }
          return b.startDate < checkoutDate && b.endDate >= checkinDate;
        }) || null
      : null;

    const hasSameDayCheckout = validRange
      ? (reservationsList || []).some((r: any) => {
          if (!r) return false;
          if (excludeResId !== null && excludeResId !== undefined && String(r.id) === String(excludeResId)) {
            return false;
          }
          if (Number(r.flatId) !== Number(f.id) && String(r.flatNumber) !== fNumStr) {
            return false;
          }
          if (r.checkoutDate !== checkinDate) return false;
          const st = String(r.status || "").toLowerCase();
          if (
            [
              "cancelada",
              "cancelled",
              "cancelado",
              "no_show",
              "expirada",
              "completed",
              "checked_out",
              "finalizada",
              "concluida",
              "checkout",
            ].includes(st)
          ) {
            return false;
          }
          if (r.checkoutDone || r.earlyCheckout || r.actualCheckoutAt) return false;
          return true;
        })
      : false;

    localByFlatId[fIdStr] = {
      resConflict,
      blockConflict,
      isBlockedStatus: blockedSt,
      isAvailable: !blockedSt && !resConflict && !blockConflict,
      hasSameDayCheckout,
    };
  }

  const hasSelectedFlat = Boolean(flatId && flatId !== "auto");
  const selectedFlatObj = hasSelectedFlat
    ? rawFlatsList.find((f: any) => String(f.id) === String(flatId)) || null
    : null;

  const selectedFlatStat =
    matchingFairShare && hasSelectedFlat
      ? matchingFairShare.allStats.find(
          (s: any) =>
            Number(s.flat?.id) === Number(flatId) ||
            (selectedFlatObj && String(s.flat?.number) === String(selectedFlatObj.number))
        ) || null
      : null;

  const resolvedSelectedFlatNumber = hasSelectedFlat
    ? String(
        selectedFlatObj?.number ||
          selectedFlatStat?.flat?.number ||
          (matchingFairShare?.bestFlatId && String(matchingFairShare.bestFlatId) === String(flatId)
            ? matchingFairShare?.bestFlatNumber
            : "") ||
          flatId
      )
    : "";

  let totalFlatsCount = 0;
  let availableCount = 0;

  if (matchingFairShare) {
    totalFlatsCount = matchingFairShare.allStats.length;
    availableCount =
      typeof matchingFairShare.availableCount === "number"
        ? matchingFairShare.availableCount
        : matchingFairShare.allStats.filter((s: any) => Boolean(s?.isAvailable)).length;
  } else {
    totalFlatsCount = rawFlatsList.length;
    availableCount = rawFlatsList.filter((f: any) => localByFlatId[String(f.id)]?.isAvailable).length;
  }

  const isFullOccupancy = validRange && totalFlatsCount > 0 && availableCount === 0;

  let isSelectedAvailable = false;
  if (hasSelectedFlat) {
    if (!validRange) {
      isSelectedAvailable = true;
    } else if (selectedFlatStat) {
      isSelectedAvailable = Boolean(selectedFlatStat.isAvailable);
    } else if (localByFlatId[String(flatId)]) {
      isSelectedAvailable = Boolean(localByFlatId[String(flatId)].isAvailable);
    } else {
      isSelectedAvailable = false;
    }
  }

  let firstFreeFlat: { id: string; number: string } | null = null;
  if (matchingFairShare) {
    if (
      matchingFairShare.bestFlatId &&
      String(matchingFairShare.bestFlatId) !== String(flatId)
    ) {
      const bestStat = matchingFairShare.allStats.find(
        (s: any) => Number(s.flat?.id) === Number(matchingFairShare.bestFlatId) && Boolean(s.isAvailable)
      );
      if (bestStat?.flat?.id) {
        firstFreeFlat = {
          id: String(bestStat.flat.id),
          number: String(bestStat.flat.number || matchingFairShare.bestFlatNumber || bestStat.flat.id),
        };
      }
    }
    if (!firstFreeFlat) {
      const anyFree = matchingFairShare.allStats.find(
        (s: any) => Boolean(s?.isAvailable) && String(s.flat?.id) !== String(flatId)
      );
      if (anyFree?.flat?.id) {
        firstFreeFlat = {
          id: String(anyFree.flat.id),
          number: String(anyFree.flat.number || anyFree.flat.id),
        };
      }
    }
  } else {
    const anyLocalFree = rawFlatsList.find(
      (f: any) => String(f.id) !== String(flatId) && localByFlatId[String(f.id)]?.isAvailable
    );
    if (anyLocalFree) {
      firstFreeFlat = {
        id: String(anyLocalFree.id),
        number: String(anyLocalFree.number || anyLocalFree.id),
      };
    }
  }

  let nextCleanFlat: { id: string; number: string } | null = null;
  if (matchingFairShare) {
    const cleanStat = matchingFairShare.allStats.find((s: any) => {
      if (!s?.isAvailable) return false;
      if (String(s.flat?.id) === String(flatId)) return false;
      const isD = s.isDirty || s.cleaningStatus === "dirty";
      const isC = s.isCleaningNow || s.cleaningStatus === "cleaning_now";
      const isSD = Boolean(s.hasCheckoutOnCheckinDay);
      return !isD && !isC && !isSD;
    });
    if (cleanStat?.flat?.id) {
      nextCleanFlat = {
        id: String(cleanStat.flat.id),
        number: String(cleanStat.flat.number || cleanStat.flat.id),
      };
    }
  }

  return {
    validRange,
    matchingFairShare,
    effectiveFlatsList: rawFlatsList,
    totalFlatsCount,
    availableCount,
    isFullOccupancy,
    hasSelectedFlat,
    isSelectedAvailable,
    selectedFlatObj,
    selectedFlatStat,
    resolvedSelectedFlatNumber,
    firstFreeFlat,
    nextCleanFlat,
    localByFlatId,
  };
}

export interface FairShareAllocationDecision {
  action:
    | "keep"
    | "select_auto"
    | "reallocate_auto"
    | "clear_full_occupancy"
    | "full_occupancy_keep";
  nextFlatId?: string;
  nextFlatNumber?: string;
  previousFlatId?: string;
  previousFlatNumber?: string;
  nextIsFlatManual?: boolean;
}

export function resolveFairShareFlatAllocation({
  mode,
  isEdit,
  currentFlatId,
  isFlatManuallyChanged,
  fairShareResult,
  expectedCheckin,
  expectedCheckout,
}: {
  mode: "simple" | "advanced";
  isEdit: boolean;
  currentFlatId: string;
  isFlatManuallyChanged: boolean;
  fairShareResult: any | null;
  expectedCheckin?: string;
  expectedCheckout?: string;
}): FairShareAllocationDecision {
  if (isEdit || !fairShareResult) {
    return { action: "keep" };
  }

  if (expectedCheckin && expectedCheckout && expectedCheckout <= expectedCheckin) {
    return { action: "keep" };
  }

  if (
    expectedCheckin &&
    expectedCheckout &&
    fairShareResult._checkin &&
    fairShareResult._checkout &&
    (fairShareResult._checkin !== expectedCheckin || fairShareResult._checkout !== expectedCheckout)
  ) {
    return { action: "keep" };
  }

  const allStats = Array.isArray(fairShareResult.allStats) ? fairShareResult.allStats : [];
  const availableCount =
    typeof fairShareResult.availableCount === "number"
      ? fairShareResult.availableCount
      : allStats.filter((s: any) => Boolean(s?.isAvailable)).length;

  let bestFlatId = fairShareResult.bestFlatId ? String(fairShareResult.bestFlatId) : "";
  let bestFlatNumber = fairShareResult.bestFlatNumber
    ? String(fairShareResult.bestFlatNumber)
    : bestFlatId;

  if (allStats.length > 0) {
    const bestStat = bestFlatId
      ? allStats.find((s: any) => String(s?.flat?.id) === bestFlatId)
      : null;
    if (!bestStat || !Boolean(bestStat.isAvailable)) {
      const firstAvail = allStats.find((s: any) => Boolean(s?.isAvailable) && s?.flat?.id != null);
      if (firstAvail?.flat?.id != null) {
        bestFlatId = String(firstAvail.flat.id);
        bestFlatNumber = String(firstAvail.flat.number || firstAvail.flat.id);
      } else {
        bestFlatId = "";
        bestFlatNumber = "";
      }
    }
  }

  const hasFlat = Boolean(currentFlatId && currentFlatId !== "auto");
  const currentStat = hasFlat
    ? allStats.find((s: any) => String(s?.flat?.id) === String(currentFlatId)) || null
    : null;
  const isCurrentUnavailable =
    !hasFlat ||
    (currentStat ? !Boolean(currentStat.isAvailable) : allStats.length > 0);

  if (!isFlatManuallyChanged) {
    if (bestFlatId) {
      return {
        action: "select_auto",
        nextFlatId: bestFlatId,
        nextFlatNumber: bestFlatNumber,
        nextIsFlatManual: false,
      };
    }
    if (availableCount === 0 && allStats.length > 0 && isCurrentUnavailable) {
      return {
        action: "clear_full_occupancy",
        nextFlatId: "",
        nextIsFlatManual: false,
      };
    }
    return { action: "keep" };
  }

  if (mode === "simple" && isCurrentUnavailable) {
    if (bestFlatId) {
      return {
        action: "reallocate_auto",
        nextFlatId: bestFlatId,
        nextFlatNumber: bestFlatNumber,
        previousFlatId: hasFlat ? String(currentFlatId) : "",
        previousFlatNumber: currentStat?.flat?.number
          ? String(currentStat.flat.number)
          : hasFlat
            ? String(currentFlatId)
            : "",
        nextIsFlatManual: false,
      };
    }
    if (availableCount === 0 && allStats.length > 0) {
      return { action: "full_occupancy_keep" };
    }
  }

  return { action: "keep" };
}

export interface SimpleCrmGuestInspection {
  isCrmLinked: boolean;
  companyName: string;
  isMonthlyGuest: boolean;
  autoInvoice: boolean;
  hasFinancialResponsible: boolean;
  inheritedLinks: string[];
  hasInheritedLinks: boolean;
  hasInvalidGuestEmail: boolean;
  hasInvalidFinRespEmail: boolean;
  hasInvalidLegacyEmail: boolean;
  sanitizedGuestEmail: string;
  sanitizedFinRespEmail: string;
}

export function inspectSimpleCrmGuestState({
  guestId,
  guestEmail,
  companyId,
  companyName,
  isMonthlyGuest,
  autoInvoice,
  finRespName,
  finRespEmail,
}: {
  guestId: string;
  guestEmail: string;
  companyId: string;
  companyName: string;
  isMonthlyGuest: boolean;
  autoInvoice: boolean;
  finRespName: string;
  finRespEmail: string;
}): SimpleCrmGuestInspection {
  const isCrmLinked = Boolean(guestId && guestId !== "manual");
  const guestEmailCheck = validateEmailList(guestEmail);
  const finRespEmailCheck = validateEmailList(finRespEmail);
  const hasInvalidGuestEmail = Boolean(String(guestEmail || "").trim() && !guestEmailCheck.valid);
  const hasInvalidFinRespEmail = Boolean(String(finRespEmail || "").trim() && !finRespEmailCheck.valid);
  const hasInvalidLegacyEmail = hasInvalidGuestEmail || hasInvalidFinRespEmail;

  const trimmedCompName = String(companyName || "").trim();
  const hasCompany = Boolean(String(companyId || "").trim() || trimmedCompName);
  const hasFinancialResponsible = Boolean(String(finRespName || "").trim());

  const inheritedLinks: string[] = [];
  if (hasCompany) {
    inheritedLinks.push(trimmedCompName ? `Empresa: ${trimmedCompName}` : "Empresa vinculada");
  }
  if (isMonthlyGuest) {
    inheritedLinks.push("Mensalista");
  }
  if (autoInvoice) {
    inheritedLinks.push("NFS-e automática");
  }
  if (hasFinancialResponsible) {
    inheritedLinks.push("Resp. Financeiro");
  }

  return {
    isCrmLinked,
    companyName: trimmedCompName,
    isMonthlyGuest: Boolean(isMonthlyGuest),
    autoInvoice: Boolean(autoInvoice),
    hasFinancialResponsible,
    inheritedLinks,
    hasInheritedLinks: inheritedLinks.length > 0,
    hasInvalidGuestEmail,
    hasInvalidFinRespEmail,
    hasInvalidLegacyEmail,
    sanitizedGuestEmail: formatEmailList(guestEmail),
    sanitizedFinRespEmail: formatEmailList(finRespEmail),
  };
}

export function normalizePhoneDigitsForCompare(phone?: string | null): string {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

export function shouldKeepPhoneOnCrmUnlink(
  currentPhone?: string | null,
  linkedCrmPhone?: string | null
): boolean {
  const curTrim = String(currentPhone || "").trim();
  if (!curTrim) return false;
  const curNorm = normalizePhoneDigitsForCompare(curTrim);
  const linkedNorm = normalizePhoneDigitsForCompare(linkedCrmPhone);
  if (!linkedNorm) return true;
  if (curNorm && curNorm === linkedNorm) return false;
  return curTrim !== String(linkedCrmPhone || "").trim();
}

export interface ChannelTransitionFlatLike {
  dailyRates: SimpleDailyRateItem[];
  charges: SimpleChargeItem[];
  rateioTargetInput?: string;
}

export interface ChannelTransitionResult<TFlat extends ChannelTransitionFlatLike> {
  nextFlats: TFlat[];
  nextRequesterType: "guest" | "other_person" | "company" | "agency_b2b";
  nextInvoiceRecipientType: "company" | "agency" | "guest" | "requester";
  nextNfHideFromGuest: boolean;
  nextStatus: "confirmada" | "pre_reserva";
  nextPaymentMethod: string;
  nextPaymentStatus: string;
  nextIsFaturadoBoleto: boolean;
  forceResetSyntheticPayment: boolean;
  shouldCloseVoucherParser: boolean;
  shouldClearTariffQuote: boolean;
}

export function computeChannelTransition<TFlat extends ChannelTransitionFlatLike>({
  prevChannel,
  nextChannel,
  isEdit,
  currentStatus,
  currentRequesterType,
  currentInvoiceRecipientType,
  currentNfHideFromGuest,
  nfHideManuallySet,
  currentPaymentMethod,
  currentPaymentStatus,
  currentPaymentsCount,
  isFaturadoBoleto,
  b2bPaymentType,
  hasCompanyLink,
  flats,
  chargeIdFactory = () => `charge_${Date.now()}_clean`,
}: {
  prevChannel: string;
  nextChannel: string;
  isEdit: boolean;
  currentStatus: "confirmada" | "pre_reserva";
  currentRequesterType: "guest" | "other_person" | "company" | "agency_b2b";
  currentInvoiceRecipientType: "company" | "agency" | "guest" | "requester";
  currentNfHideFromGuest: boolean;
  nfHideManuallySet: boolean;
  currentPaymentMethod: string;
  currentPaymentStatus: string;
  currentPaymentsCount: number;
  isFaturadoBoleto: boolean;
  b2bPaymentType: "VIRTUAL_CARD" | "FATURADO";
  hasCompanyLink: boolean;
  flats: TFlat[];
  chargeIdFactory?: () => string;
}): ChannelTransitionResult<TFlat> {
  const prevWasOta = prevChannel === "booking" || prevChannel === "airbnb";
  const nextIsOta = nextChannel === "booking" || nextChannel === "airbnb";
  const prevWasB2b = prevChannel === "b2b" || currentRequesterType === "agency_b2b";
  const nextIsB2b = nextChannel === "b2b";

  let nextFlats = flats.map((fl) => ({
    ...fl,
    dailyRates: (fl.dailyRates || []).map((d) => ({ ...d, channel: nextChannel })),
  }));

  const recalcRateioTarget = (fl: TFlat, nextCharges: SimpleChargeItem[]): TFlat => {
    if (typeof fl.rateioTargetInput !== "string") {
      return { ...fl, charges: nextCharges };
    }
    const ratesSum = (fl.dailyRates || []).reduce((acc, d) => acc + (Number(d.rate) || 0), 0);
    const chargesSum = nextCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    return {
      ...fl,
      charges: nextCharges,
      rateioTargetInput: String(Math.max(0, round2Money(ratesSum + chargesSum))),
    };
  };

  if (nextIsOta) {
    nextFlats = nextFlats.map((fl, idx) => {
      if (idx > 0) return fl;
      const updatedCharges = [...(fl.charges || [])];
      const cleanIdx = updatedCharges.findIndex((c) => c.type === "cleaning");
      let changed = false;
      if (cleanIdx === -1) {
        updatedCharges.push({
          id: chargeIdFactory(),
          type: "cleaning",
          title: "Taxa de Limpeza",
          amount: 50,
          notes: "",
          autoOtaCleaning: true,
        });
        changed = true;
      } else if (updatedCharges[cleanIdx].amount === 80) {
        updatedCharges[cleanIdx] = { ...updatedCharges[cleanIdx], amount: 50 };
        changed = true;
      }
      return changed ? recalcRateioTarget(fl, updatedCharges) : { ...fl, charges: updatedCharges };
    });
  } else if (!isEdit && prevWasOta) {
    nextFlats = nextFlats.map((fl) => {
      const prevCharges = fl.charges || [];
      const filteredCharges = prevCharges.filter(
        (c) => !(c && c.type === "cleaning" && c.autoOtaCleaning === true)
      );
      return filteredCharges.length !== prevCharges.length
        ? recalcRateioTarget(fl, filteredCharges)
        : { ...fl, charges: filteredCharges };
    });
  }

  let nextRequesterType = currentRequesterType;
  let nextInvoiceRecipientType = currentInvoiceRecipientType;
  let nextNfHideFromGuest = currentNfHideFromGuest;
  let shouldCloseVoucherParser = false;

  if (nextIsB2b) {
    nextRequesterType = "agency_b2b";
    if (!isEdit) {
      nextInvoiceRecipientType = "agency";
      if (!nfHideManuallySet) {
        nextNfHideFromGuest = true;
      }
    }
  } else if (prevWasB2b) {
    nextRequesterType = "guest";
    if (currentInvoiceRecipientType === "agency") {
      nextInvoiceRecipientType = hasCompanyLink ? "company" : "guest";
    }
    if (!isEdit && !nfHideManuallySet) {
      nextNfHideFromGuest = false;
    }
    shouldCloseVoucherParser = true;
  }

  const nextStatus: "confirmada" | "pre_reserva" =
    nextIsOta || nextIsB2b ? "confirmada" : currentStatus;

  const nextIsFaturadoBoleto = !isEdit && nextIsOta ? false : isFaturadoBoleto;

  const methodLower = String(currentPaymentMethod || "").toLowerCase();
  const isOtaOrB2bMethod =
    methodLower === "booking" ||
    methodLower === "airbnb" ||
    methodLower === "vcn_b2b" ||
    methodLower === "faturado_b2b" ||
    methodLower === "";

  let nextPaymentMethod = currentPaymentMethod;
  let nextPaymentStatus = currentPaymentStatus;
  let forceResetSyntheticPayment = false;

  if (nextIsB2b) {
    nextPaymentMethod = b2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b";
    if (!isEdit) {
      nextPaymentStatus = "pendente";
      forceResetSyntheticPayment = true;
    }
  } else if (nextIsOta) {
    nextPaymentMethod = nextChannel;
    nextPaymentStatus = "pago_total";
    forceResetSyntheticPayment = !isEdit;
  } else {
    if (nextIsFaturadoBoleto) {
      nextPaymentMethod = "boleto_faturado";
    } else {
      if (nextChannel === "site" || prevWasOta || prevWasB2b || isOtaOrB2bMethod) {
        nextPaymentMethod = "pix";
      }
      if (!isEdit) {
        if (nextStatus === "pre_reserva") {
          nextPaymentStatus = "pendente";
          forceResetSyntheticPayment = false;
        } else if (prevWasOta || (prevWasB2b && currentPaymentsCount === 0)) {
          nextPaymentStatus = "pago_total";
          forceResetSyntheticPayment = true;
        }
      }
    }
  }

  return {
    nextFlats,
    nextRequesterType,
    nextInvoiceRecipientType,
    nextNfHideFromGuest,
    nextStatus,
    nextPaymentMethod,
    nextPaymentStatus,
    nextIsFaturadoBoleto,
    forceResetSyntheticPayment,
    shouldCloseVoucherParser,
    shouldClearTariffQuote: !nextIsOta,
  };
}

export type SimplifiedSubmitBlockReason =
  | null
  | {
      code:
        | "missing_channel"
        | "invalid_dates"
        | "loading_fair_share"
        | "full_occupancy"
        | "missing_flat"
        | "flat_unavailable"
        | "missing_guest_name"
        | "loading_tariff_quote"
        | "total_below_charges";
      title: string;
      description: string;
      focusTarget: "channel" | "checkin" | "flat" | "guestName" | "total" | "none";
    };

export function validateSimplifiedReservationSubmit({
  channel,
  checkinDate,
  checkoutDate,
  loadingFairShare,
  availability,
  flatId,
  guest1Name,
  loadingTariffQuote,
  isManualPrice,
  totalDraft,
  charges,
}: {
  channel: string;
  checkinDate: string;
  checkoutDate: string;
  loadingFairShare: boolean;
  availability: SimpleFlatAvailabilitySummary;
  flatId: string;
  guest1Name: string;
  loadingTariffQuote: boolean;
  isManualPrice: boolean;
  totalDraft: number | null;
  charges: SimpleChargeItem[];
}): SimplifiedSubmitBlockReason {
  if (channel !== "booking" && channel !== "airbnb") {
    return {
      code: "missing_channel",
      title: "Canal de origem obrigatório",
      description: "Selecione Booking.com ou Airbnb (ou mude para Avançado para outros canais).",
      focusTarget: "channel",
    };
  }

  if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
    return {
      code: "invalid_dates",
      title: "Período inválido",
      description: "A data de check-out deve ser posterior à data de check-in.",
      focusTarget: "checkin",
    };
  }

  if (loadingFairShare) {
    return {
      code: "loading_fair_share",
      title: "Verificando disponibilidade dos apartamentos",
      description: "Aguarde um instante a conferência de disponibilidade antes de salvar.",
      focusTarget: "none",
    };
  }

  if (availability.isFullOccupancy) {
    return {
      code: "full_occupancy",
      title: "Lotação total neste período",
      description:
        "Nenhum apartamento está disponível nas datas selecionadas. Altere o período ou use o Modo Avançado para encaixe.",
      focusTarget: "checkin",
    };
  }

  if (!flatId || flatId === "auto") {
    return {
      code: "missing_flat",
      title: "Apartamento obrigatório",
      description: "Selecione um apartamento disponível para continuar.",
      focusTarget: "flat",
    };
  }

  if (!availability.isSelectedAvailable) {
    const freeHint = availability.firstFreeFlat
      ? ` Selecione o Apt ${availability.firstFreeFlat.number} (disponível) ou abra o Modo Avançado para encaixe.`
      : " Selecione outro apartamento disponível ou abra o Modo Avançado para encaixe.";
    return {
      code: "flat_unavailable",
      title: "Apartamento indisponível neste período",
      description: `O Apt ${availability.resolvedSelectedFlatNumber || flatId} está ocupado ou bloqueado nestas datas.${freeHint}`,
      focusTarget: "flat",
    };
  }

  if (!String(guest1Name || "").trim()) {
    return {
      code: "missing_guest_name",
      title: "Nome do Hóspede obrigatório",
      description: "Informe o nome do hóspede titular.",
      focusTarget: "guestName",
    };
  }

  if (loadingTariffQuote && !isManualPrice) {
    return {
      code: "loading_tariff_quote",
      title: "Calculando valores pelo Tarifário",
      description: "Aguarde um instante o preenchimento automático ou informe o valor manualmente.",
      focusTarget: "none",
    };
  }

  if (totalDraft !== null) {
    const { totalCharges } = getCleaningFeeSummary(charges);
    if (totalDraft < totalCharges - 0.001) {
      return {
        code: "total_below_charges",
        title: "Valor Total inválido",
        description: `O Valor Total (R$ ${totalDraft.toFixed(2)}) não pode ser menor que a Taxa de Limpeza (R$ ${totalCharges.toFixed(2)}).`,
        focusTarget: "total",
      };
    }
  }

  return null;
}
