export interface SebraeCalculationResult {
  totalUHs: number;
  daysInMonth: number;
  availableUnits: number;
  occupancyRate: number;
  soldUnitsMonth: number;
  fixedCostsMonth: number;
  fixedCostPerAvailableUnit: number;
  fixedCostPerSoldUnit: number;
  varCostPerUnit: number;
  custoUH: number;
  totalDeductionsPct: number;
  divisor: number;
  tarifaMinima: number;
  decomposicao: {
    custo: number;
    comissao: number;
    margem: number;
    imposto: number;
  };
  somaDecomposicao: number;
  fecha100: boolean;
  percentuais: {
    custoPct: number;
    comissaoPct: number;
    margemPct: number;
    impostoPct: number;
  };
}

export interface PricingSettings {
  totalUHs: number;
  daysInMonth: number;
  occupancyRate: number;
  fixedRent: number;
  fixedOther: number;
  fixedCostsMonth: number;
  varCleaning: number;
  varLinen: number;
  varUtilities: number;
  channelCommissionPct: number;
  targetMarginPct: number;
  taxRatePct: number;
  breakfastSurchargePerGuest: number;
  extraBedFee: number;
  variationLimitPct: number;
  manualFloor: number;
  weekendMarkupPct: number;
  hasStagedChanges?: boolean;
  stagedChangesCount?: number;
}

export interface PreviewRateItem {
  id: string;
  date: string;
  planId: string;
  planName: string;
  currentRate: number;
  newRate: number;
  variationPct: number;
  isLocked: boolean;
  lockReason?: string;
  isBelowFloor: boolean;
  freeUnits: number;
  confirmed?: boolean;
}

export interface PreviewSummary {
  affectedDatesCount: number;
  alteredRatesCount: number;
  retainedLockedCount: number;
  belowFloorCount: number;
  items: PreviewRateItem[];
  retainedItems: PreviewRateItem[];
}

export interface SeasonalityMonth {
  month: number;
  label: string;
  occupancyRate: number;
  season: "Alta" | "Média" | "Baixa";
  factor: number;
  isManualOverride: boolean;
}

export interface ChannelPricingConfig {
  id: string;
  name: string;
  markupPct: number;
  commissionPct: number;
  cardFeePct: number;
  active: boolean;
}

export interface RestrictionConfig {
  dateStart: string;
  dateEnd: string;
  planId: "all" | "sem_cafe" | "com_cafe";
  minStay: number;
  maxStay: number;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minAdvanceDays: number;
  maxAdvanceDays: number;
}
