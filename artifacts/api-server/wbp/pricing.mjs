/**
 * artifacts/api-server/wbp/pricing.mjs
 *
 * SEBRAE Pricing Engine with Safety Locks & Staged Publication Workflow.
 * Implements:
 * 1. Exact SEBRAE Math:
 *    - Fixed cost per sold unit = 38,906.61 / (19 * 31 * 0.65) = R$ 101.62.
 *    - Variable costs: cleaning R$ 23.25 + linen R$ 15.51 + energy/water R$ 9.00 = R$ 47.76 (R$/day commission removed!).
 *    - Total UH cost = R$ 149.38.
 *    - Tarifa Mínima = 149.38 / (1 - 0.15 - 0.25 - 0.06) = R$ 276.63 (± R$ 0.05).
 *    - Analytical decomposition: Custo R$ 149.38 + Comissão R$ 41.49 + Margem R$ 69.16 + Imposto R$ 16.60 = R$ 276.63 (closes 100% with zero residue).
 * 2. Historical Occupancy-Based Seasonality with Manual Overrides.
 * 3. Pricing Safety Locks:
 *    - Floor lock: max(tarifaMinima, pisoManual).
 *    - Variation lock: >30% compared to last sent rate is retained until explicit confirmation.
 *    - Staged publication: configuration, cost, and rate changes remain in draft/staged state until previewed and published.
 * 4. Breakfast Surcharge Mapping (OBP):
 *    - "Sem café" = base rate.
 *    - "Com café" = "Sem café" + surcharge per guest per night (e.g. R$ 25/guest), correctly populated in rate, rdef_single, adult_1, adult_2, adult_3.
 *
 * Mirrors byte-for-byte in scripts/wbp/pricing.mjs.
 */

export const DEFAULT_SEBRAE_CONFIG = {
  totalUHs: 19,
  daysInMonth: 31,
  occupancyRate: 0.65, // 65%
  fixedRent: 38506.61,
  fixedOther: 400.00,
  fixedSalaries: 0.0,
  fixedCondoIptu: 0.0,
  fixedSystems: 0.0,
  fixedCostsMonth: 38906.61, // 38,506.61 + 400.00
  varCleaning: 23.25,
  varLinen: 15.51,
  varUtilities: 9.00,
  varCommissionDailyReais: 0.0, // Strictly removed to fix double counting!
  channelCommissionPct: 0.15, // 15%
  targetMarginPct: 0.25, // 25%
  taxRatePct: 0.06, // 6% Simples Nacional / ISS
  breakfastSurchargePerGuest: 25.00,
  extraBedFee: 60.00,
  variationLimitPct: 0.30, // 30% default variation lock
  manualFloor: 276.63,
  weekendMarkupPct: 0.15
};

export const STANDARD_SEBRAE_SEASONALITY_FACTORS = {
  0: { factor: 1.15, season: "Alta", label: "Janeiro" },
  1: { factor: 1.00, season: "Média", label: "Fevereiro" },
  2: { factor: 1.00, season: "Média", label: "Março" },
  3: { factor: 0.90, season: "Baixa", label: "Abril" },
  4: { factor: 0.90, season: "Baixa", label: "Maio" },
  5: { factor: 1.00, season: "Média", label: "Junho" },
  6: { factor: 1.15, season: "Alta", label: "Julho" },
  7: { factor: 1.00, season: "Média", label: "Agosto" },
  8: { factor: 1.00, season: "Média", label: "Setembro" },
  9: { factor: 1.00, season: "Média", label: "Outubro" },
  10: { factor: 1.00, season: "Média", label: "Novembro" },
  11: { factor: 1.15, season: "Alta", label: "Dezembro" }
};

/**
 * Rounds a number to exactly two decimal places.
 * @param {number} num
 * @returns {number}
 */
export function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates the exact SEBRAE sustainable rate and its 100% analytical decomposition.
 *
 * @param {object} [params]
 * @param {number} [params.totalUHs=19]
 * @param {number} [params.daysInMonth=31]
 * @param {number} [params.occupancyRate=0.65]
 * @param {number} [params.fixedCostsMonth=38906.61]
 * @param {number} [params.varCleaning=23.25]
 * @param {number} [params.varLinen=15.51]
 * @param {number} [params.varUtilities=9.00]
 * @param {number} [params.channelCommissionPct=0.15]
 * @param {number} [params.targetMarginPct=0.25]
 * @param {number} [params.taxRatePct=0.06]
 * @returns {{
 *   totalUHs: number,
 *   daysInMonth: number,
 *   availableUnits: number,
 *   occupancyRate: number,
 *   soldUnitsMonth: number,
 *   fixedCostsMonth: number,
 *   fixedCostPerAvailableUnit: number,
 *   fixedCostPerSoldUnit: number,
 *   varCostPerUnit: number,
 *   custoUH: number,
 *   totalDeductionsPct: number,
 *   divisor: number,
 *   tarifaMinima: number,
 *   decomposicao: {
 *     custo: number,
 *     comissao: number,
 *     margem: number,
 *     imposto: number
 *   },
 *   somaDecomposicao: number,
 *   fecha100: boolean,
 *   percentuais: {
 *     custoPct: number,
 *     comissaoPct: number,
 *     margemPct: number,
 *     impostoPct: number
 *   }
 * }}
 */
export function calculateSebraeRate(params = {}) {
  const totalUHs = Number(params.totalUHs ?? DEFAULT_SEBRAE_CONFIG.totalUHs);
  const daysInMonth = Number(params.daysInMonth ?? DEFAULT_SEBRAE_CONFIG.daysInMonth);
  const occupancyRate = Number(params.occupancyRate ?? DEFAULT_SEBRAE_CONFIG.occupancyRate);

  const fixedCostsMonth = params.fixedCostsMonth != null
    ? Number(params.fixedCostsMonth)
    : (Number(params.fixedRent ?? DEFAULT_SEBRAE_CONFIG.fixedRent) +
       Number(params.fixedOther ?? DEFAULT_SEBRAE_CONFIG.fixedOther) +
       Number(params.fixedSalaries ?? 0) +
       Number(params.fixedCondoIptu ?? 0) +
       Number(params.fixedSystems ?? 0));

  const varCleaning = Number(params.varCleaning ?? DEFAULT_SEBRAE_CONFIG.varCleaning);
  const varLinen = Number(params.varLinen ?? DEFAULT_SEBRAE_CONFIG.varLinen);
  const varUtilities = Number(params.varUtilities ?? DEFAULT_SEBRAE_CONFIG.varUtilities);

  const channelCommissionPct = Number(params.channelCommissionPct ?? DEFAULT_SEBRAE_CONFIG.channelCommissionPct);
  const targetMarginPct = Number(params.targetMarginPct ?? DEFAULT_SEBRAE_CONFIG.targetMarginPct);
  const taxRatePct = Number(params.taxRatePct ?? DEFAULT_SEBRAE_CONFIG.taxRatePct);

  if (totalUHs <= 0 || daysInMonth <= 0) {
    throw new Error("O número de UHs e os dias do mês devem ser maiores que zero.");
  }
  if (occupancyRate <= 0 || occupancyRate > 1.0) {
    throw new Error("A taxa de ocupação deve estar entre 0 (exclusivo) e 1 (100%).");
  }

  // 1. Unidades disponíveis e vendidas
  const availableUnits = totalUHs * daysInMonth; // 19 * 31 = 589
  const soldUnitsMonth = availableUnits * occupancyRate; // 589 * 0.65 = 382.85

  // 2. Custo fixo unitário
  const fixedCostPerAvailableUnit = round2(fixedCostsMonth / availableUnits);
  const fixedCostPerSoldUnitRaw = fixedCostsMonth / soldUnitsMonth; // 38,906.61 / 382.85 = 101.623635...
  const fixedCostPerSoldUnit = round2(fixedCostPerSoldUnitRaw); // 101.62

  // 3. Custos variáveis por UH (sem bitributação de comissão em R$)
  const varCostPerUnitRaw = varCleaning + varLinen + varUtilities; // 23.25 + 15.51 + 9.00 = 47.76
  const varCostPerUnit = round2(varCostPerUnitRaw); // 47.76

  // 4. Custo total por UH ocupada
  const custoUhRaw = fixedCostPerSoldUnitRaw + varCostPerUnitRaw; // 149.383635...
  const custoUH = round2(custoUhRaw); // 149.38

  // 5. Deduções percentuais e Divisor
  const totalDeductionsPct = round2(channelCommissionPct + targetMarginPct + taxRatePct); // 0.46
  if (totalDeductionsPct >= 1.0) {
    throw new Error("A soma das deduções percentuais (comissão, margem e impostos) não pode atingir ou ultrapassar 100%.");
  }
  const divisor = round2(1.0 - totalDeductionsPct); // 0.54

  // 6. Tarifa Mínima Recomendada
  const tarifaMinimaRaw = custoUH / divisor; // 149.38 / 0.54 = 276.6296...
  const tarifaMinima = round2(tarifaMinimaRaw); // 276.63

  // 7. Decomposição Analítica
  const custoParcela = custoUH; // 149.38
  const comissaoParcela = round2(tarifaMinima * channelCommissionPct); // 41.49
  let margemParcela = round2(tarifaMinima * targetMarginPct); // 69.16
  const impostoParcela = round2(tarifaMinima * taxRatePct); // 16.60

  // Fechamento exato: compensa qualquer resíduo de centavos na margem para fechar 100%
  const somaParcelas = round2(custoParcela + comissaoParcela + margemParcela + impostoParcela);
  const residuo = round2(tarifaMinima - somaParcelas);
  if (residuo !== 0) {
    margemParcela = round2(margemParcela + residuo);
  }
  const somaFinal = round2(custoParcela + comissaoParcela + margemParcela + impostoParcela);
  const fecha100 = Math.abs(somaFinal - tarifaMinima) < 0.001;

  return {
    totalUHs,
    daysInMonth,
    availableUnits,
    occupancyRate,
    soldUnitsMonth: round2(soldUnitsMonth),
    fixedCostsMonth: round2(fixedCostsMonth),
    fixedCostPerAvailableUnit,
    fixedCostPerSoldUnit,
    varCostPerUnit,
    custoUH,
    totalDeductionsPct,
    divisor,
    tarifaMinima,
    decomposicao: {
      custo: custoParcela,
      comissao: comissaoParcela,
      margem: margemParcela,
      imposto: impostoParcela
    },
    somaDecomposicao: somaFinal,
    fecha100,
    percentuais: {
      custoPct: round2(custoParcela / tarifaMinima),
      comissaoPct: channelCommissionPct,
      margemPct: targetMarginPct,
      impostoPct: taxRatePct
    }
  };
}

/**
 * Calculates historical occupancy rates and seasonality factors for all 12 months.
 *
 * @param {Array<object>} reservations - Historical reservations array
 * @param {object} [options]
 * @param {object} [options.manualOverrides] - Manual overrides by month index { 0: { factor: 1.2, season: "Alta" } }
 * @param {number} [options.totalFlats=19]
 * @param {number} [options.highSeasonThreshold=0.75] - >= 75% -> +15%
 * @param {number} [options.lowSeasonThreshold=0.55] - < 55% -> -10%
 * @returns {Record<number, { month: number, label: string, occupiedNights: number, availableNights: number, occupancyRate: number, season: string, factor: number, isManualOverride: boolean }>}
 */
export function calculateHistoricalSeasonality(reservations = [], options = {}) {
  const totalFlats = Number(options.totalFlats || DEFAULT_SEBRAE_CONFIG.totalUHs);
  const manualOverrides = options.manualOverrides || {};
  const highThreshold = Number(options.highSeasonThreshold || 0.75);
  const lowThreshold = Number(options.lowSeasonThreshold || 0.55);

  const monthStats = {};
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  for (let m = 0; m < 12; m++) {
    monthStats[m] = {
      month: m,
      label: STANDARD_SEBRAE_SEASONALITY_FACTORS[m].label,
      occupiedNights: 0,
      availableNights: totalFlats * monthDays[m],
      occupancyRate: 0,
      season: "Média",
      factor: 1.0,
      isManualOverride: false
    };
  }

  // Count occupied nights from non-cancelled reservations
  let validReservationCount = 0;
  for (const r of reservations) {
    if (r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada") {
      continue;
    }
    const checkin = String(r.checkinDate || "").substring(0, 10);
    const checkout = String(r.checkoutDate || "").substring(0, 10);
    if (!checkin || !checkout) continue;

    const curr = new Date(checkin + "T12:00:00Z");
    const end = new Date(checkout + "T12:00:00Z");
    if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr >= end) continue;

    validReservationCount++;
    while (curr < end) {
      const m = curr.getUTCMonth();
      if (monthStats[m]) {
        monthStats[m].occupiedNights++;
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
  }

  // Calculate occupancy rates and determine factors
  for (let m = 0; m < 12; m++) {
    const item = monthStats[m];
    if (validReservationCount >= 10 && item.availableNights > 0) {
      item.occupancyRate = round2(item.occupiedNights / item.availableNights);
      if (item.occupancyRate >= highThreshold) {
        item.season = "Alta";
        item.factor = 1.15;
      } else if (item.occupancyRate < lowThreshold) {
        item.season = "Baixa";
        item.factor = 0.90;
      } else {
        item.season = "Média";
        item.factor = 1.00;
      }
    } else {
      // Fallback to standard SEBRAE factors
      const standard = STANDARD_SEBRAE_SEASONALITY_FACTORS[m];
      item.season = standard.season;
      item.factor = standard.factor;
      item.occupancyRate = standard.factor === 1.15 ? 0.78 : (standard.factor === 0.90 ? 0.48 : 0.65);
    }

    // Apply manual override if present
    if (manualOverrides[m] && manualOverrides[m].factor != null) {
      item.factor = Number(manualOverrides[m].factor);
      if (manualOverrides[m].season) {
        item.season = manualOverrides[m].season;
      }
      item.isManualOverride = true;
    }
  }

  return monthStats;
}

/**
 * Applies Pricing Safety Locks:
 * 1. Floor Lock: ensures candidateRate >= max(tarifaMinima, manualFloor).
 * 2. Variation Lock: ensures abs(candidateRate - lastSentRate) / lastSentRate <= variationLimitPct (default 30%).
 *
 * @param {object} params
 * @param {number} params.candidateRate
 * @param {number} [params.lastSentRate]
 * @param {number} [params.tarifaMinima]
 * @param {number} [params.manualFloor]
 * @param {number} [params.variationLimitPct=0.30]
 * @returns {{
 *   approved: boolean,
 *   candidateRate: number,
 *   finalRate: number|null,
 *   lockedReason: "FLOOR_LOCK" | "VARIATION_LOCK" | null,
 *   floor: number,
 *   deltaPct: number,
 *   message: string
 * }}
 */
export function applyPricingLocks({
  candidateRate,
  lastSentRate = null,
  tarifaMinima = 276.63,
  manualFloor = 276.63,
  variationLimitPct = 0.30
}) {
  const rate = round2(Number(candidateRate || 0));
  const floor = round2(Math.max(Number(tarifaMinima || 0), Number(manualFloor || 0)));

  // Trava 1: Piso Sustentável
  if (rate < floor) {
    return {
      approved: false,
      candidateRate: rate,
      finalRate: null,
      lockedReason: "FLOOR_LOCK",
      floor,
      deltaPct: 0,
      message: `Tarifa proposta (R$ ${rate.toFixed(2)}) abaixo do piso sustentável permitido (R$ ${floor.toFixed(2)}).`
    };
  }

  // Trava 2: Variação Brusca (padrão 30%)
  if (lastSentRate != null && !isNaN(Number(lastSentRate)) && Number(lastSentRate) > 0) {
    const prevRate = Number(lastSentRate);
    const deltaPct = round2((rate - prevRate) / prevRate);
    const maxVariation = Number(variationLimitPct || 0.30);

    if (Math.abs(deltaPct) > maxVariation) {
      const deltaPercentStr = (deltaPct * 100).toFixed(1);
      return {
        approved: false,
        candidateRate: rate,
        finalRate: null,
        lockedReason: "VARIATION_LOCK",
        floor,
        deltaPct,
        message: `Variação de ${deltaPercentStr}% em relação à última tarifa enviada (R$ ${prevRate.toFixed(2)}) excede a trava de ${Math.round(maxVariation * 100)}%. Requer confirmação explícita.`
      };
    }

    return {
      approved: true,
      candidateRate: rate,
      finalRate: rate,
      lockedReason: null,
      floor,
      deltaPct,
      message: "Tarifa aprovada pelas travas de segurança."
    };
  }

  return {
    approved: true,
    candidateRate: rate,
    finalRate: rate,
    lockedReason: null,
    floor,
    deltaPct: 0,
    message: "Tarifa aprovada pelas travas de segurança."
  };
}

/**
 * Calculates Occupancy-Based Pricing (OBP) with breakfast surcharge for "Sem café" and "Com café".
 *
 * @param {number} baseRate - Base room rate ("Sem café") for standard double occupancy
 * @param {object} [options]
 * @param {number} [options.breakfastSurchargePerGuest=25.00] - R$ surcharge per guest per night
 * @param {number} [options.extraBedFee=60.00] - Additional fee for 3rd guest (extra bed)
 * @param {number} [options.singleDiscount=0.00] - Optional single discount for "Sem café"
 * @returns {{
 *   sem_cafe: {
 *     rate: number,
 *     rdef_single: number,
 *     adult_1: number,
 *     adult_2: number,
 *     adult_3: number
 *   },
 *   com_cafe: {
 *     rate: number,
 *     rdef_single: number,
 *     adult_1: number,
 *     adult_2: number,
 *     adult_3: number
 *   }
 * }}
 */
export function calculateRatePlanPrices(baseRate, options = {}) {
  const bRate = round2(Number(baseRate));
  const bSurcharge = round2(Number(options.breakfastSurchargePerGuest ?? DEFAULT_SEBRAE_CONFIG.breakfastSurchargePerGuest));
  const extraBed = round2(Number(options.extraBedFee ?? DEFAULT_SEBRAE_CONFIG.extraBedFee));
  const singleDisc = round2(Number(options.singleDiscount ?? 0));

  // Plano "Sem café" (Room Only - Base)
  const semCafe = {
    rate: bRate, // Standard 2 adults
    rdef_single: round2(Math.max(0, bRate - singleDisc)), // 1 adult
    adult_1: round2(Math.max(0, bRate - singleDisc)),
    adult_2: bRate,
    adult_3: round2(bRate + extraBed)
  };

  // Plano "Com café" (Bed & Breakfast: Base + R$ per guest/night)
  const comCafe = {
    rate: round2(bRate + (2 * bSurcharge)), // Standard 2 adults + 2 breakfasts
    rdef_single: round2(Math.max(0, bRate - singleDisc) + (1 * bSurcharge)), // 1 adult + 1 breakfast
    adult_1: round2(Math.max(0, bRate - singleDisc) + (1 * bSurcharge)),
    adult_2: round2(bRate + (2 * bSurcharge)),
    adult_3: round2(bRate + (3 * bSurcharge) + extraBed) // 3 adults + 3 breakfasts + extra bed
  };

  return {
    sem_cafe: semCafe,
    com_cafe: comCafe
  };
}

/**
 * Staged Publication Manager:
 * Manages configuration, draft/staged modifications, variation confirmations,
 * preview generations, and atomic publication to WBP ARI.
 */
export class WbpPricingManager {
  /**
   * Retrieves or initializes WBP pricing configuration in database state.
   * @param {object} db
   * @returns {object}
   */
  static getPricingState(db) {
    if (!db) return { settings: { ...DEFAULT_SEBRAE_CONFIG }, staged: {}, published: {} };
    if (!db.wbpPricing) {
      db.wbpPricing = {
        settings: { ...DEFAULT_SEBRAE_CONFIG },
        status: "published",
        seasonalityOverrides: {},
        stagedModifications: {}, // keyed by `${date}_${planId}`
        confirmedVariations: {}, // keyed by `${date}_${planId}`
        lastPublishedAt: null,
        lastPublishedRates: {} // keyed by `${date}_${planId}` -> rate
      };
    }
    return db.wbpPricing;
  }

  /**
   * Updates pricing settings (saved into staged state until published).
   * @param {object} newSettings
   * @param {object} db
   * @returns {object}
   */
  static updateSettings(newSettings, db) {
    const state = this.getPricingState(db);
    state.settings = {
      ...state.settings,
      ...newSettings
    };
    state.status = "staged";
    return state.settings;
  }

  /**
   * Generates a date-by-date preview of proposed prices across a date range.
   * Compares candidate rates with last published rates and evaluates safety locks.
   *
   * @param {string} startDate - YYYY-MM-DD
   * @param {string} endDate - YYYY-MM-DD
   * @param {object} db
   * @param {object} [availabilityMap]
   * @returns {{
   *   kpis: {
   *     datasAfetadas: number,
   *     precosAlterados: number,
   *     retidosPelaTrava: number,
   *     abaixoDoPiso: number
   *   },
   *   diffList: Array<object>,
   *   retainedItems: Array<object>,
   *   sebraeRate: object
   * }}
   */
  static generatePreview(startDate, endDate, db, availabilityMap = null) {
    const state = this.getPricingState(db);
    const settings = state.settings || DEFAULT_SEBRAE_CONFIG;

    const sebraeBase = calculateSebraeRate(settings);
    const reservations = Array.isArray(db.reservations) ? db.reservations : [];
    const seasonality = calculateHistoricalSeasonality(reservations, {
      manualOverrides: state.seasonalityOverrides || {}
    });

    const diffList = [];
    const retainedItems = [];
    let precosAlteradosCount = 0;
    let retidosCount = 0;
    let abaixoDoPisoCount = 0;
    const affectedDatesSet = new Set();

    const curr = new Date(startDate + "T12:00:00Z");
    const end = new Date(endDate + "T12:00:00Z");

    while (curr < end) {
      const dateStr = curr.toISOString().substring(0, 10);
      const monthIdx = curr.getUTCMonth();
      const seasonInfo = seasonality[monthIdx] || { factor: 1.0, season: "Média" };

      // Apply seasonality factor to base sustainable rate
      const seasonalBaseRate = round2(sebraeBase.tarifaMinima * seasonInfo.factor);

      // Check weekend markup (Fri/Sat nights: UTC day 5 and 6)
      const dayOfWeek = curr.getUTCDay();
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
      const weekendMultiplier = isWeekend ? (1 + Number(settings.weekendMarkupPct || 0.15)) : 1.0;
      const candidateBaseRate = round2(seasonalBaseRate * weekendMultiplier);

      const planPrices = calculateRatePlanPrices(candidateBaseRate, settings);

      for (const planId of ["sem_cafe", "com_cafe"]) {
        const key = `${dateStr}_${planId}`;
        const proposedRate = planPrices[planId].rate;
        const lastSentRate = state.lastPublishedRates?.[key] || null;

        // Check if manual staged override exists
        const stagedOverride = state.stagedModifications?.[key];
        const effectiveRate = stagedOverride != null ? Number(stagedOverride) : proposedRate;

        // Evaluate Safety Locks
        const lockResult = applyPricingLocks({
          candidateRate: effectiveRate,
          lastSentRate,
          tarifaMinima: sebraeBase.tarifaMinima,
          manualFloor: settings.manualFloor,
          variationLimitPct: settings.variationLimitPct
        });

        const isConfirmed = Boolean(state.confirmedVariations?.[key]);
        const isBelowFloor = lockResult.lockedReason === "FLOOR_LOCK";
        const isVariationLocked = lockResult.lockedReason === "VARIATION_LOCK" && !isConfirmed;

        if (isBelowFloor) abaixoDoPisoCount++;
        if (isVariationLocked) retidosCount++;

        const isChanged = lastSentRate == null || Math.abs(effectiveRate - Number(lastSentRate)) > 0.01;
        if (isChanged) {
          precosAlteradosCount++;
          affectedDatesSet.add(dateStr);
        }

        const freeUnits = availabilityMap && typeof availabilityMap.get === "function"
          ? (availabilityMap.get(dateStr) ?? 19)
          : 19;

        const diffItem = {
          date: dateStr,
          planId,
          planName: planId === "sem_cafe" ? "Sem café" : "Com café (2 hósp.)",
          currentRate: lastSentRate,
          newRate: effectiveRate,
          deltaPct: lockResult.deltaPct,
          freeUnits,
          isChanged,
          isBelowFloor,
          isVariationLocked,
          isConfirmed,
          lockedReason: lockResult.lockedReason,
          message: lockResult.message,
          prices: planPrices[planId]
        };

        diffList.push(diffItem);

        if (isVariationLocked) {
          retainedItems.push(diffItem);
        }
      }

      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    return {
      kpis: {
        datasAfetadas: affectedDatesSet.size,
        precosAlterados: precosAlteradosCount,
        retidosPelaTrava: retidosCount,
        abaixoDoPiso: abaixoDoPisoCount
      },
      diffList,
      retainedItems,
      sebraeRate: sebraeBase
    };
  }

  /**
   * Confirms a retained variation lock for a specific date and rate plan.
   * @param {string} date
   * @param {string} planId
   * @param {object} db
   * @returns {boolean}
   */
  static confirmVariation(date, planId, db) {
    const state = this.getPricingState(db);
    const key = `${date}_${planId}`;
    if (!state.confirmedVariations) state.confirmedVariations = {};
    state.confirmedVariations[key] = true;
    return true;
  }

  /**
   * Discards a modification, reverting it to the previous published rate.
   * @param {string} date
   * @param {string} planId
   * @param {object} db
   * @returns {boolean}
   */
  static discardVariation(date, planId, db) {
    const state = this.getPricingState(db);
    const key = `${date}_${planId}`;
    if (state.stagedModifications) delete state.stagedModifications[key];
    if (state.confirmedVariations) delete state.confirmedVariations[key];
    return true;
  }

  /**
   * Discards all staged modifications.
   * @param {object} db
   * @returns {boolean}
   */
  static discardAll(db) {
    const state = this.getPricingState(db);
    state.stagedModifications = {};
    state.confirmedVariations = {};
    state.status = "published";
    return true;
  }

  /**
   * Publishes approved staged rates into the published state and generates ARI payload blocks.
   * Items below floor and unconfirmed retained variations are strictly excluded from publication.
   *
   * @param {object} db
   * @param {string} [startDate]
   * @param {string} [endDate]
   * @param {object} [user]
   * @returns {{
   *   publishedCount: number,
   *   excludedCount: number,
   *   publishedAt: string,
   *   publishedRates: Record<string, number>,
   *   ariPayloadBlocks: Array<object>
   * }}
   */
  static publish(db, startDate = null, endDate = null, user = "admin") {
    const state = this.getPricingState(db);
    const start = startDate || new Date().toISOString().substring(0, 10);
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    nextYear.setUTCMonth(11);
    nextYear.setUTCDate(31);
    const end = endDate || nextYear.toISOString().substring(0, 10);

    const preview = this.generatePreview(start, end, db);
    const nowIso = new Date().toISOString();

    let publishedCount = 0;
    let excludedCount = 0;
    const ariPayloadBlocks = [];

    if (!state.lastPublishedRates) state.lastPublishedRates = {};

    for (const item of preview.diffList) {
      // Exclude items below floor
      if (item.isBelowFloor) {
        excludedCount++;
        continue;
      }
      // Exclude unconfirmed variations
      if (item.isVariationLocked && !item.isConfirmed) {
        excludedCount++;
        continue;
      }

      const key = `${item.date}_${item.planId}`;
      state.lastPublishedRates[key] = item.newRate;
      publishedCount++;

      if (state.stagedModifications) delete state.stagedModifications[key];
      if (state.confirmedVariations) delete state.confirmedVariations[key];

      ariPayloadBlocks.push({
        start_date: item.date,
        end_date: item.date, // WBP convention: inclusive end_date for daily blocks
        wbp_room_id: "flat",
        wbp_rate_id: item.planId,
        rate: item.prices.rate,
        rdef_single: item.prices.rdef_single,
        adult_1: item.prices.adult_1,
        adult_2: item.prices.adult_2,
        adult_3: item.prices.adult_3
      });
    }

    state.lastPublishedAt = nowIso;
    state.status = Object.keys(state.stagedModifications || {}).length > 0 ? "staged" : "published";

    return {
      publishedCount,
      excludedCount,
      publishedAt: nowIso,
      publishedRates: state.lastPublishedRates,
      ariPayloadBlocks
    };
  }
}
