export interface SimpleDailyRateItem {
  date: string;
  rate: number;
  baseRate?: number;
  channel: string;
  notes?: string;
}

export interface SimpleChargeItem {
  id: string;
  type: "cleaning" | "pet" | "extra_bed" | "breakfast" | "garage" | "damage" | "discount" | "other";
  title: string;
  amount: number;
  baseAmount?: number;
  notes?: string;
  autoOtaCleaning?: boolean;
}

export interface PmsTariffQuoteResponse {
  success: boolean;
  checkin: string;
  checkout: string;
  nights: number;
  channel: string;
  normalizedChannel: string;
  flatId: string | null;
  guests: number;
  includeBreakfast: boolean;
  channelMarkupPct: number;
  stayDiscountPct: number;
  breakfastSurchargePerGuest: number;
  breakfastSurchargeBase: number;
  extraBedFee: number;
  cleaningFee: number;
  cleaningFeeEnabled: boolean;
  cleaningFeeBaseAmount: number;
  cleaningFeeType: string;
  defaultCleaningFeeForChannel: number;
  nightsSubtotal: number;
  avgDailyRate: number;
  totalAmount: number;
  hasMixedNightRates: boolean;
  dailyRates: Array<{
    date: string;
    rate: number;
    channel: string;
    baseRoomRate?: number;
    breakfastAddon?: number;
    extraBedAddon?: number;
    hasOverride?: boolean;
  }>;
}

export function round2Money(value: number): number {
  return Math.round((Number(value) || 0) * 100 + Number.EPSILON) / 100;
}

export function getCleaningFeeSummary(charges: SimpleChargeItem[] = []) {
  const cleaningCharges = charges.filter((c) => c && c.type === "cleaning");
  const otherCharges = charges.filter((c) => c && c.type !== "cleaning");
  const cleaningFee = round2Money(
    cleaningCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  );
  const otherChargesSum = round2Money(
    otherCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  );
  const totalCharges = round2Money(cleaningFee + otherChargesSum);
  return {
    hasCleaningCharge: cleaningCharges.length > 0,
    cleaningFee,
    otherChargesSum,
    totalCharges,
    cleaningChargeId: cleaningCharges[0]?.id || null,
  };
}

export function applySimpleDailyRateEdit(
  dailyRates: SimpleDailyRateItem[],
  charges: SimpleChargeItem[],
  newDailyRate: number
) {
  const safeRate = Math.max(0, round2Money(newDailyRate));
  const updatedDailyRates = dailyRates.map((item) => {
    const { baseRate: _b, ...clean } = item;
    return { ...clean, rate: safeRate };
  });
  const nights = Math.max(1, updatedDailyRates.length);
  const nightsSubtotal = round2Money(
    updatedDailyRates.length > 0
      ? updatedDailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
      : safeRate * nights
  );
  const { totalCharges, cleaningFee, otherChargesSum } = getCleaningFeeSummary(charges);
  const totalAmount = Math.max(0, round2Money(nightsSubtotal + totalCharges));

  return {
    dailyRates: updatedDailyRates,
    avgDailyRate: safeRate,
    nightsSubtotal,
    cleaningFee,
    otherChargesSum,
    totalCharges,
    totalAmount,
  };
}

export function applySimpleTotalEdit(
  dailyRates: SimpleDailyRateItem[],
  charges: SimpleChargeItem[],
  newTotal: number
) {
  const safeTotal = Math.max(0, round2Money(newTotal));
  const nights = Math.max(1, dailyRates.length);
  const { totalCharges, cleaningFee, otherChargesSum } = getCleaningFeeSummary(charges);

  const targetTotalCents = Math.round(safeTotal * 100);
  const totalChargesCents = Math.round(totalCharges * 100);
  const isBelowCharges = targetTotalCents < totalChargesCents;
  const amountForNightsCents = Math.max(0, targetTotalCents - totalChargesCents);

  const baseNightCents = Math.floor(amountForNightsCents / nights);
  const remCents = amountForNightsCents - baseNightCents * nights;

  const updatedDailyRates = dailyRates.map((item, idx) => {
    const { baseRate: _b, ...clean } = item;
    const cents = idx === dailyRates.length - 1 ? baseNightCents + remCents : baseNightCents;
    return { ...clean, rate: round2Money(cents / 100) };
  });

  const nightsSubtotal = round2Money(amountForNightsCents / 100);
  const avgDailyRate = nights > 0 ? round2Money(nightsSubtotal / nights) : 0;
  const effectiveTotal = round2Money(nightsSubtotal + totalCharges);

  return {
    dailyRates: updatedDailyRates,
    avgDailyRate,
    nightsSubtotal,
    cleaningFee,
    otherChargesSum,
    totalCharges,
    effectiveTotal,
    typedTotal: safeTotal,
    isBelowCharges,
  };
}

export function applySimpleCleaningFeeEdit(
  dailyRates: SimpleDailyRateItem[],
  charges: SimpleChargeItem[],
  newCleaningAmount: number,
  chargeIdFactory: () => string = () => `charge_${Date.now()}_clean`,
  preservedTotalDraft: number | null = null
) {
  const safeCleaning = Math.max(0, round2Money(newCleaningAmount));
  const nonCleaning = charges.filter((c) => c && c.type !== "cleaning");
  const existingCleaning = charges.find((c) => c && c.type === "cleaning");
  const updatedCleaningCharge: SimpleChargeItem = existingCleaning
    ? {
        id: existingCleaning.id,
        type: "cleaning",
        title: existingCleaning.title || "Taxa de Limpeza",
        amount: safeCleaning,
        notes: existingCleaning.notes || "",
        autoOtaCleaning: false,
      }
    : {
        id: chargeIdFactory(),
        type: "cleaning",
        title: "Taxa de Limpeza",
        amount: safeCleaning,
        notes: "",
        autoOtaCleaning: false,
      };

  const nextCharges = [...nonCleaning, updatedCleaningCharge];
  if (preservedTotalDraft !== null && preservedTotalDraft >= 0) {
    const totRes = applySimpleTotalEdit(dailyRates, nextCharges, preservedTotalDraft);
    return {
      charges: nextCharges,
      dailyRates: totRes.dailyRates,
      avgDailyRate: totRes.avgDailyRate,
      cleaningFee: safeCleaning,
      otherChargesSum: totRes.otherChargesSum,
      nightsSubtotal: totRes.nightsSubtotal,
      totalAmount: totRes.effectiveTotal,
      nextTotalDraft: totRes.isBelowCharges ? preservedTotalDraft : null,
    };
  }

  const nightsSubtotal = round2Money(
    dailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
  );
  const avgDailyRate =
    dailyRates.length > 0 ? round2Money(nightsSubtotal / dailyRates.length) : 0;
  const { totalCharges, otherChargesSum } = getCleaningFeeSummary(nextCharges);
  const totalAmount = Math.max(0, round2Money(nightsSubtotal + totalCharges));

  return {
    charges: nextCharges,
    dailyRates,
    avgDailyRate,
    cleaningFee: safeCleaning,
    otherChargesSum,
    nightsSubtotal,
    totalAmount,
    nextTotalDraft: null as number | null,
  };
}

export function applySimpleCleaningFeeRemove(
  dailyRates: SimpleDailyRateItem[],
  charges: SimpleChargeItem[],
  preservedTotalDraft: number | null = null
) {
  const nextCharges = charges.filter((c) => c && c.type !== "cleaning");
  if (preservedTotalDraft !== null && preservedTotalDraft >= 0) {
    const totRes = applySimpleTotalEdit(dailyRates, nextCharges, preservedTotalDraft);
    return {
      charges: nextCharges,
      dailyRates: totRes.dailyRates,
      avgDailyRate: totRes.avgDailyRate,
      cleaningFee: 0,
      otherChargesSum: totRes.otherChargesSum,
      nightsSubtotal: totRes.nightsSubtotal,
      totalAmount: totRes.effectiveTotal,
      nextTotalDraft: totRes.isBelowCharges ? preservedTotalDraft : null,
    };
  }

  const nightsSubtotal = round2Money(
    dailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
  );
  const avgDailyRate =
    dailyRates.length > 0 ? round2Money(nightsSubtotal / dailyRates.length) : 0;
  const { totalCharges, otherChargesSum } = getCleaningFeeSummary(nextCharges);
  const totalAmount = Math.max(0, round2Money(nightsSubtotal + totalCharges));

  return {
    charges: nextCharges,
    dailyRates,
    avgDailyRate,
    cleaningFee: 0,
    otherChargesSum,
    nightsSubtotal,
    totalAmount,
    nextTotalDraft: null as number | null,
  };
}

export function applyTariffQuoteToFlatState<
  TFlat extends {
    dailyRate: string;
    dailyRates: SimpleDailyRateItem[];
    charges: SimpleChargeItem[];
    rateioTargetInput: string;
  }
>(
  flat: TFlat,
  quote: PmsTariffQuoteResponse,
  chargeIdFactory: () => string = () => `charge_${Date.now()}_clean`
): { nextFlat: TFlat; totalAmount: number } {
  const quotedDailyRates: SimpleDailyRateItem[] = (quote.dailyRates || []).map((item) => ({
    date: item.date,
    rate: round2Money(item.rate),
    channel: item.channel || quote.channel,
  }));

  const nonCleaningCharges = (flat.charges || []).filter((c) => c && c.type !== "cleaning");
  const existingCleaning = (flat.charges || []).find((c) => c && c.type === "cleaning");
  const nextCharges: SimpleChargeItem[] =
    quote.cleaningFee > 0
      ? [
          ...nonCleaningCharges,
          {
            id: existingCleaning?.id || chargeIdFactory(),
            type: "cleaning",
            title: existingCleaning?.title || "Taxa de Limpeza",
            amount: round2Money(quote.cleaningFee),
            notes: existingCleaning?.notes || "",
            autoOtaCleaning: true,
          },
        ]
      : nonCleaningCharges;

  const nightsSubtotal = round2Money(
    quotedDailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
  );
  const chargesSum = round2Money(
    nextCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  );
  const totalAmount = Math.max(0, round2Money(nightsSubtotal + chargesSum));
  const avgDailyRate =
    quotedDailyRates.length > 0
      ? round2Money(nightsSubtotal / quotedDailyRates.length)
      : round2Money(quote.avgDailyRate);

  return {
    nextFlat: {
      ...flat,
      dailyRate: String(avgDailyRate),
      dailyRates: quotedDailyRates,
      charges: nextCharges,
      rateioTargetInput: String(totalAmount),
    },
    totalAmount,
  };
}
