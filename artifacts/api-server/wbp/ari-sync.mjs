/**
 * artifacts/api-server/wbp/ari-sync.mjs
 *
 * Milestone 3: ARI Mapping, 7 Restrictions & Synchronizer (Channex.io v1 + WebBookingPro).
 *
 * Features:
 * - Room & Rate Mapping + ARI Payload Builder (Channex /availability & /restrictions + WBP ARIUpdate)
 *   - 19 physical flats mapped to 1 commercial room type ("Flat").
 *   - 2 commercial rate plans: "sem_cafe" (base room rate) and "com_cafe" (base + R$ 25/guest/night).
 *   - Shared inventory pool math: units = max(0, min(planCeiling ?? 19, canonicalFreeFlats)).
 *   - Occupancy-Based Pricing (OBP): occupancies 1, 2 (primary), and 3.
 *   - Contiguous multi-day block compression for full 500-day push (~85% payload reduction).
 *   - Zero null fields on Channex /restrictions payloads.
 *   - Rate limit compliance: max 10 req/min on /availability and max 10 req/min on /restrictions.
 *   - Task ID logging in db.channexTaskLogs for Channex PMS Certification.
 *
 * Mirrors byte-for-byte in scripts/wbp/ari-sync.mjs.
 */

import crypto from "node:crypto";
import { WBPClient, ChannexClient } from "./client.mjs";
import { getIntegrationMode, getChannexConfig, isWbpEnabled, WBP_MODES } from "./config.mjs";
import { calculateCanonicalAvailability, CORPFLATS_19_FLATS } from "./availability.mjs";
import {
  WbpPricingManager,
  calculateRatePlanPrices,
  calculateSebraeRate,
  calculateHistoricalSeasonality,
  round2,
  DEFAULT_SEBRAE_CONFIG
} from "./pricing.mjs";

export const DEFAULT_WBP_MAPPING = {
  room: {
    pms_category_id: "flat",
    wbp_room_id: "flat",
    channex_room_type_id: "rt-corpflats-flat",
    name: "Flat",
    maxOccupancy: 3,
    baseOccupancy: 2,
    flats: CORPFLATS_19_FLATS.map((f) => f.id)
  },
  ratePlans: [
    {
      pms_plan_id: "sem_cafe",
      wbp_rate_id: "sem_cafe",
      channex_rate_plan_id: "rp-corpflats-sem-cafe",
      name: "Sem café",
      breakfastIncluded: false,
      ceiling: null
    },
    {
      pms_plan_id: "com_cafe",
      wbp_rate_id: "com_cafe",
      channex_rate_plan_id: "rp-corpflats-com-cafe",
      name: "Com café",
      breakfastIncluded: true,
      ceiling: null
    }
  ]
};

export const DEFAULT_RESTRICTIONS = {
  min_los_weekday: 1, // Sun-Thu nights
  min_los_weekend: 2, // Fri-Sat nights
  max_los: 30,
  close: false,
  closearr: false,
  closedep: false,
  min_advanced_offset: 0,
  max_advanced_offset: 0
};

/**
 * Adds N days to a YYYY-MM-DD date string using UTC noon to prevent timezone shifts.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} [n=1]
 * @returns {string} - YYYY-MM-DD
 */
export function addDays(dateStr, n = 1) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}

/**
 * Checks if date2 is exactly the day after date1.
 * @param {string} date1 - YYYY-MM-DD
 * @param {string} date2 - YYYY-MM-DD
 * @returns {boolean}
 */
export function isNextDay(date1, date2) {
  return addDays(date1, 1) === date2;
}

/**
 * Returns a list of all stay dates between startDate and endDate (inclusive).
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {string[]}
 */
export function getNightsList(startDate, endDate) {
  const list = [];
  let curr = startDate;
  while (curr <= endDate) {
    list.push(curr);
    curr = addDays(curr, 1);
  }
  return list;
}

/**
 * Calculates full push date horizon: today through Dec 31 of next calendar year.
 * @param {Date|string} [refDate=new Date()]
 * @returns {{ startDate: string, endDate: string }}
 */
export function calculateFullPushHorizon(refDate = new Date()) {
  const ref = typeof refDate === "string"
    ? new Date(refDate.substring(0, 10) + "T12:00:00Z")
    : new Date(refDate);

  const startStr = ref.toISOString().substring(0, 10);
  const nextYear = ref.getUTCFullYear() + 1;
  const endStr = `${nextYear}-12-31`;

  return {
    startDate: startStr,
    endDate: endStr
  };
}

/**
 * Calculates Channex 500-day full sync horizon.
 * @param {Date|string} [refDate=new Date()]
 * @param {number} [days=500]
 * @returns {{ startDate: string, endDate: string, days: number }}
 */
export function calculateChannex500DayHorizon(refDate = new Date(), days = 500) {
  const ref = typeof refDate === "string"
    ? new Date(refDate.substring(0, 10) + "T12:00:00Z")
    : new Date(refDate);
  const startDate = ref.toISOString().substring(0, 10);
  const endDate = addDays(startDate, Math.max(1, Number(days) || 500) - 1);
  return { startDate, endDate, days: Math.max(1, Number(days) || 500) };
}

/**
 * Retrieves or initializes WBP/Channex mapping configuration in database state.
 * @param {object} db
 * @returns {object}
 */
export function getWbpMapping(db) {
  if (!db) return DEFAULT_WBP_MAPPING;
  if (!db.wbpMapping) {
    db.wbpMapping = JSON.parse(JSON.stringify(DEFAULT_WBP_MAPPING));
  }
  return db.wbpMapping;
}

/**
 * Resolves Channex UUIDs for property, room_type, and rate_plans from config + mapping.
 * @param {object} db
 * @returns {{ propertyId: string, roomTypeId: string, ratePlanIds: { sem_cafe: string, com_cafe: string } }}
 */
export function resolveChannexEntityIds(db) {
  const cfg = getChannexConfig(db);
  const mapping = getWbpMapping(db);
  const semCafePlan = (mapping.ratePlans || []).find((rp) => rp.pms_plan_id === "sem_cafe");
  const comCafePlan = (mapping.ratePlans || []).find((rp) => rp.pms_plan_id === "com_cafe");

  return {
    propertyId: cfg.propertyId || "prop-corpflats-soho",
    roomTypeId: cfg.roomTypeId || mapping.room?.channex_room_type_id || "rt-corpflats-flat",
    ratePlanIds: {
      sem_cafe: cfg.ratePlanSemCafeId || semCafePlan?.channex_rate_plan_id || "rp-corpflats-sem-cafe",
      com_cafe: cfg.ratePlanComCafeId || comCafePlan?.channex_rate_plan_id || "rp-corpflats-com-cafe"
    }
  };
}

/**
 * Retrieves or initializes WBP 7 Restrictions configuration in database state.
 * Keeps legacy calculateDailyRate completely untouched.
 * @param {object} db
 * @returns {object}
 */
export function getWbpRestrictionsState(db) {
  if (!db) {
    return {
      defaults: { ...DEFAULT_RESTRICTIONS },
      planDefaults: { sem_cafe: {}, com_cafe: {} },
      overrides: {}
    };
  }
  if (!db.wbpRestrictions) {
    db.wbpRestrictions = {
      defaults: { ...DEFAULT_RESTRICTIONS },
      planDefaults: {
        sem_cafe: {},
        com_cafe: {}
      },
      overrides: {}
    };
  }
  return db.wbpRestrictions;
}

/**
 * Resolves effective 7 restrictions for a given date and rate plan.
 * Resolution hierarchy:
 * Specific Override (date_plan) -> Date Override -> Plan Defaults -> Global Defaults -> Legacy minNights fallback.
 *
 * @param {object} db
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} [planId="sem_cafe"]
 */
export function resolveRestrictions(db, dateStr, planId = "sem_cafe") {
  const state = getWbpRestrictionsState(db);
  const defaults = { ...DEFAULT_RESTRICTIONS, ...(state.defaults || {}) };

  // Weekend stays: Friday night (5) and Saturday night (6) in UTC noon
  const d = new Date(dateStr + "T12:00:00Z");
  const dayOfWeek = d.getUTCDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  let defaultMinLos = isWeekend ? defaults.min_los_weekend : defaults.min_los_weekday;
  if (!isWeekend && db?.tariffSettings?.minNights && Number(db.tariffSettings.minNights) > 1 && !state.defaults?.min_los_weekday) {
    defaultMinLos = Number(db.tariffSettings.minNights);
  }

  const resolved = {
    min_los: defaultMinLos,
    max_los: defaults.max_los,
    close: Boolean(defaults.close),
    closearr: Boolean(defaults.closearr),
    closedep: Boolean(defaults.closedep),
    min_advanced_offset: defaults.min_advanced_offset,
    max_advanced_offset: defaults.max_advanced_offset
  };

  if (state.planDefaults?.[planId]) {
    Object.assign(resolved, state.planDefaults[planId]);
  }

  if (state.overrides?.[dateStr]) {
    Object.assign(resolved, state.overrides[dateStr]);
  }

  const specificKey = `${dateStr}_${planId}`;
  if (state.overrides?.[specificKey]) {
    Object.assign(resolved, state.overrides[specificKey]);
  }

  resolved.min_los = Math.max(1, Number(resolved.min_los) || 1);
  resolved.max_los = Math.max(0, Number(resolved.max_los) || 0);
  resolved.close = Boolean(resolved.close);
  resolved.closearr = Boolean(resolved.closearr);
  resolved.closedep = Boolean(resolved.closedep);
  resolved.min_advanced_offset = Math.max(0, Number(resolved.min_advanced_offset) || 0);
  resolved.max_advanced_offset = Math.max(0, Number(resolved.max_advanced_offset) || 0);

  return resolved;
}

/**
 * Builds Channex POST /api/v1/availability `values` array with contiguous date-range compression.
 * Never includes null fields.
 *
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {object} db
 * @param {object} [options]
 * @returns {Array<{ property_id: string, room_type_id: string, date_from: string, date_to: string, availability: number }>}
 */
export function buildChannexAvailabilityValues(startDate, endDate, db, options = {}) {
  const ids = resolveChannexEntityIds(db);
  const propertyId = options.propertyId || ids.propertyId;
  const roomTypeId = options.roomTypeId || ids.roomTypeId;
  const contiguous = options.contiguous !== false;

  const availMap = calculateCanonicalAvailability(startDate, addDays(endDate, 1), { db });
  const nights = getNightsList(startDate, endDate);
  if (nights.length === 0) return [];

  const daily = nights.map((night) => {
    const rawFree = availMap.get(night) ?? 19;
    const availability = Math.max(0, Math.min(19, Math.floor(Number(rawFree) || 0)));
    return {
      property_id: propertyId,
      room_type_id: roomTypeId,
      date: night,
      availability
    };
  });

  if (!contiguous) {
    return daily.map((item) => ({
      property_id: item.property_id,
      room_type_id: item.room_type_id,
      date: item.date,
      availability: item.availability
    }));
  }

  const compressed = [];
  let current = {
    property_id: daily[0].property_id,
    room_type_id: daily[0].room_type_id,
    date_from: daily[0].date,
    date_to: daily[0].date,
    availability: daily[0].availability
  };

  for (let i = 1; i < daily.length; i++) {
    const next = daily[i];
    if (
      isNextDay(current.date_to, next.date) &&
      current.availability === next.availability &&
      current.room_type_id === next.room_type_id
    ) {
      current.date_to = next.date;
    } else {
      compressed.push({ ...current });
      current = {
        property_id: next.property_id,
        room_type_id: next.room_type_id,
        date_from: next.date,
        date_to: next.date,
        availability: next.availability
      };
    }
  }
  compressed.push({ ...current });
  return compressed;
}

/**
 * Builds Channex POST /api/v1/restrictions `values` array with contiguous date-range compression.
 * Strictly omits any null or undefined fields per Channex v1 validation rules.
 *
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {object} db
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function buildChannexRestrictionsValues(startDate, endDate, db, options = {}) {
  const ids = resolveChannexEntityIds(db);
  const propertyId = options.propertyId || ids.propertyId;
  const planIds = options.planIds || ["sem_cafe", "com_cafe"];
  const contiguous = options.contiguous !== false;
  const sellMode = options.sellMode || "per_person";

  const pricingState = WbpPricingManager.getPricingState(db);
  const settings = pricingState.settings || DEFAULT_SEBRAE_CONFIG;
  const sebraeBase = calculateSebraeRate(settings);
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  const seasonality = calculateHistoricalSeasonality(reservations, {
    manualOverrides: pricingState.seasonalityOverrides || {}
  });

  const nights = getNightsList(startDate, endDate);
  if (nights.length === 0) return [];

  const result = [];

  for (const planId of planIds) {
    const channexRatePlanId = options.ratePlanIds?.[planId] || ids.ratePlanIds[planId] || planId;
    const planDaily = [];

    for (const night of nights) {
      const d = new Date(night + "T12:00:00Z");
      const monthIdx = d.getUTCMonth();
      const seasonInfo = seasonality[monthIdx] || { factor: 1.0, season: "Média" };

      const seasonalBaseRate = round2(sebraeBase.tarifaMinima * seasonInfo.factor);
      const dayOfWeek = d.getUTCDay();
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
      const weekendMultiplier = isWeekend ? (1 + Number(settings.weekendMarkupPct || 0.15)) : 1.0;
      const candidateBaseRate = round2(seasonalBaseRate * weekendMultiplier);

      const calculatedPlans = calculateRatePlanPrices(candidateBaseRate, settings);
      const calculated = calculatedPlans[planId] || calculatedPlans.sem_cafe;

      const key = `${night}_${planId}`;
      let effectiveRate = calculated.rate;
      if (pricingState.lastPublishedRates?.[key] != null) {
        effectiveRate = Number(pricingState.lastPublishedRates[key]);
      } else if (pricingState.stagedModifications?.[key] != null) {
        effectiveRate = Number(pricingState.stagedModifications[key]);
      }

      // Enforce SEBRAE minimum floor safety
      const minAllowed = planId === "com_cafe"
        ? round2(sebraeBase.tarifaMinima + 2 * Number(settings.breakfastSurchargePerGuest || 25.00))
        : round2(sebraeBase.tarifaMinima);
      if (effectiveRate < minAllowed) {
        effectiveRate = minAllowed;
      }

      const bSurcharge = Number(settings.breakfastSurchargePerGuest || 25.00);
      const extraBed = Number(settings.extraBedFee || 60.00);

      let rdefSingle = calculated.rdef_single;
      let adult3 = calculated.adult_3;
      if (effectiveRate !== calculated.rate) {
        if (planId === "sem_cafe") {
          rdefSingle = effectiveRate;
          adult3 = round2(effectiveRate + extraBed);
        } else {
          rdefSingle = round2(effectiveRate - bSurcharge);
          adult3 = round2(effectiveRate + bSurcharge + extraBed);
        }
      }

      const restrictions = resolveRestrictions(db, night, planId);

      // Construct Channex restriction entry with ZERO null keys
      const entry = {
        property_id: propertyId,
        rate_plan_id: channexRatePlanId,
        date: night,
        min_stay_arrival: Math.max(1, Number(restrictions.min_los) || 1),
        min_stay_through: Math.max(1, Number(restrictions.min_los) || 1),
        max_stay: Math.max(0, Number(restrictions.max_los) || 0),
        closed_to_arrival: Boolean(restrictions.closearr),
        closed_to_departure: Boolean(restrictions.closedep),
        stop_sell: Boolean(restrictions.close)
      };

      if (sellMode === "per_room") {
        entry.rate = Number(effectiveRate).toFixed(2);
      } else {
        entry.rates = [
          { occupancy: 1, rate: Number(rdefSingle).toFixed(2) },
          { occupancy: 2, rate: Number(effectiveRate).toFixed(2) },
          { occupancy: 3, rate: Number(adult3).toFixed(2) }
        ];
      }

      planDaily.push(entry);
    }

    if (!contiguous) {
      result.push(...planDaily);
      continue;
    }

    let current = {
      ...planDaily[0],
      date_from: planDaily[0].date,
      date_to: planDaily[0].date
    };
    delete current.date;

    for (let i = 1; i < planDaily.length; i++) {
      const next = planDaily[i];
      const sameRates = JSON.stringify(current.rates || current.rate) === JSON.stringify(next.rates || next.rate);
      const sameRestrictions =
        current.min_stay_arrival === next.min_stay_arrival &&
        current.min_stay_through === next.min_stay_through &&
        current.max_stay === next.max_stay &&
        current.closed_to_arrival === next.closed_to_arrival &&
        current.closed_to_departure === next.closed_to_departure &&
        current.stop_sell === next.stop_sell;

      if (isNextDay(current.date_to, next.date) && sameRates && sameRestrictions) {
        current.date_to = next.date;
      } else {
        result.push({ ...current });
        current = {
          ...next,
          date_from: next.date,
          date_to: next.date
        };
        delete current.date;
      }
    }
    result.push({ ...current });
  }

  return result;
}

/**
 * Compresses daily ARI blocks into contiguous date ranges where all attributes match.
 * WBP wire format specifies that end_date is strictly INCLUSIVE.
 *
 * @param {Array<object>} dailyItems
 * @returns {Array<object>}
 */
export function compressContiguousBlocks(dailyItems) {
  if (!Array.isArray(dailyItems) || dailyItems.length === 0) return [];

  const byPlan = new Map();
  for (const item of dailyItems) {
    const plan = item.wbp_rate_id || "sem_cafe";
    if (!byPlan.has(plan)) byPlan.set(plan, []);
    byPlan.get(plan).push(item);
  }

  const result = [];

  for (const [, items] of byPlan.entries()) {
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let current = {
      ...items[0],
      start_date: items[0].date,
      end_date: items[0].date
    };
    delete current.date;

    for (let i = 1; i < items.length; i++) {
      const next = items[i];
      const isAdjacent = isNextDay(current.end_date, next.date);

      const isIdentical =
        current.wbp_room_id === next.wbp_room_id &&
        current.wbp_rate_id === next.wbp_rate_id &&
        current.units === next.units &&
        current.rate === next.rate &&
        current.rdef_single === next.rdef_single &&
        current.adult_3 === next.adult_3 &&
        current.num_adults_included === next.num_adults_included &&
        current.min_los === next.min_los &&
        current.max_los === next.max_los &&
        current.close === next.close &&
        current.closearr === next.closearr &&
        current.closedep === next.closedep &&
        current.min_advanced_offset === next.min_advanced_offset &&
        current.max_advanced_offset === next.max_advanced_offset;

      if (isAdjacent && isIdentical) {
        current.end_date = next.date;
      } else {
        result.push({ ...current });
        current = {
          ...next,
          start_date: next.date,
          end_date: next.date
        };
        delete current.date;
      }
    }

    result.push({ ...current });
  }

  result.sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
    return a.wbp_rate_id < b.wbp_rate_id ? -1 : 1;
  });

  return result;
}

/**
 * WbpAriSynchronizer:
 * Coordinates Canonical Availability, SEBRAE Pricing, and 7 Restrictions
 * into Channex.io v1 (/availability & /restrictions) and WebBookingPro ARIUpdate wire transmissions.
 */
export class WbpAriSynchronizer {
  constructor(options = {}) {
    this.db = options.db || (typeof global !== "undefined" && global.db ? global.db : {});
    this.client = options.client || new WBPClient({ db: this.db, ...options });
    this.channexClient = options.channexClient || new ChannexClient({ db: this.db, ...options });

    this.debounceMs = Number(options.debounceMs || 2000);
    this.maxWaitMs = Number(options.maxWaitMs || 6000);
    this.batchSizeDays = Number(options.batchSizeDays || 60);
    this.batchItemCeiling = Number(options.batchItemCeiling || 120);
    this.alertThresholdMs = Number(options.alertThresholdMs || 15 * 60 * 1000);

    this.onAlert = typeof options.onAlert === "function" ? options.onAlert : null;

    // Incremental debouncing state
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.pendingMinDate = null;
    this.pendingMaxDate = null;
    this.pendingDirtyIntervals = [];

    // Channex per-property sliding-window rate limiter state (max 10 req/min per endpoint)
    this.availabilityCallTimestamps = [];
    this.restrictionsCallTimestamps = [];

    // Health & status tracking
    this.failureStartTime = null;
    this.persistentAlertSent = false;
    this.lastSyncTimestamp = null;
    this.lastSyncResult = null;
    this.syncHistory = [];
  }

  /**
   * Checks Channex rate limit for a specific endpoint ("availability" | "restrictions").
   * @param {"availability" | "restrictions"} endpoint
   * @param {number} [nowMs=Date.now()]
   * @returns {{ allowed: boolean, remaining: number, usedInLastMinute: number, limit: number }}
   */
  checkChannexRateLimit(endpoint, nowMs = Date.now()) {
    const cfg = getChannexConfig(this.db);
    const limit =
      endpoint === "availability"
        ? Number(cfg.availabilityRateLimitPerMin || 10)
        : Number(cfg.restrictionsRateLimitPerMin || 10);

    const list =
      endpoint === "availability"
        ? this.availabilityCallTimestamps
        : this.restrictionsCallTimestamps;

    const cutoff = nowMs - 60_000;
    while (list.length > 0 && list[0] <= cutoff) {
      list.shift();
    }

    return {
      allowed: list.length < limit,
      remaining: Math.max(0, limit - list.length),
      usedInLastMinute: list.length,
      limit
    };
  }

  /**
   * Records a Channex API call timestamp and appends the returned task IDs to db.channexTaskLogs.
   */
  recordChannexTaskLog(entry = {}) {
    const nowMs = Date.now();
    if (entry.endpoint === "availability") {
      this.availabilityCallTimestamps.push(nowMs);
    } else if (entry.endpoint === "restrictions") {
      this.restrictionsCallTimestamps.push(nowMs);
    }

    const logItem = {
      id: crypto.randomUUID(),
      timestamp: new Date(nowMs).toISOString(),
      endpoint: entry.endpoint || "unknown",
      taskIds: Array.isArray(entry.taskIds) ? entry.taskIds : [],
      valuesCount: Number(entry.valuesCount || 0),
      dateFrom: entry.dateFrom || null,
      dateTo: entry.dateTo || null,
      trigger: entry.trigger || "manual",
      status: entry.status || "success",
      warnings: Array.isArray(entry.warnings) ? entry.warnings : []
    };

    if (this.db) {
      if (!Array.isArray(this.db.channexTaskLogs)) {
        this.db.channexTaskLogs = [];
      }
      this.db.channexTaskLogs.unshift(logItem);
      if (this.db.channexTaskLogs.length > 200) {
        this.db.channexTaskLogs.length = 200;
      }
    }

    return logItem;
  }

  /**
   * Performs a Channex 500-Day Full Sync in strictly 2 API calls:
   * 1) POST /api/v1/availability
   * 2) POST /api/v1/restrictions
   *
   * Complies with Channex PMS Certification Test #1.
   *
   * @param {object} [options]
   * @param {string} [options.startDate]
   * @param {string} [options.endDate]
   * @param {number} [options.days=500]
   * @param {boolean} [options.bypassSwitch=false]
   * @param {string} [options.trigger="full_sync_500d"]
   * @returns {Promise<object>}
   */
  async performChannexFullSync(options = {}) {
    const mode = getIntegrationMode(this.db);
    if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
      return {
        success: false,
        skipped: true,
        reason: "integration_off",
        mode
      };
    }

    const horizon = calculateChannex500DayHorizon(
      options.referenceDate || options.startDate || new Date(),
      options.days || 500
    );
    const startDate = options.startDate || horizon.startDate;
    const endDate = options.endDate || horizon.endDate;

    const availabilityValues = buildChannexAvailabilityValues(startDate, endDate, this.db, options);
    const restrictionsValues = buildChannexRestrictionsValues(startDate, endDate, this.db, options);

    if (mode === WBP_MODES.OBSERVE && !options.bypassSwitch) {
      this.lastSyncTimestamp = new Date().toISOString();
      return {
        success: true,
        mode: "observe",
        apiCallsCount: 0,
        startDate,
        endDate,
        availabilityValuesCount: availabilityValues.length,
        restrictionsValuesCount: restrictionsValues.length,
        availabilityTaskIds: [],
        restrictionsTaskIds: []
      };
    }

    const reqOpts = { bypassSwitch: Boolean(options.bypassSwitch) };

    // Call 1: POST /api/v1/availability
    const availRes = await this.channexClient.updateAvailability(availabilityValues, reqOpts);
    this.recordChannexTaskLog({
      endpoint: "availability",
      taskIds: availRes.taskIds,
      valuesCount: availabilityValues.length,
      dateFrom: startDate,
      dateTo: endDate,
      trigger: options.trigger || "full_sync_500d",
      status: "success"
    });

    // Call 2: POST /api/v1/restrictions
    const restRes = await this.channexClient.updateRestrictions(restrictionsValues, reqOpts);
    this.recordChannexTaskLog({
      endpoint: "restrictions",
      taskIds: restRes.taskIds,
      valuesCount: restrictionsValues.length,
      dateFrom: startDate,
      dateTo: endDate,
      trigger: options.trigger || "full_sync_500d",
      status: "success",
      warnings: restRes.warnings
    });

    this.lastSyncTimestamp = new Date().toISOString();
    this.lastSyncResult = {
      success: true,
      provider: "channex",
      mode,
      apiCallsCount: 2,
      startDate,
      endDate,
      availabilityTaskIds: availRes.taskIds,
      restrictionsTaskIds: restRes.taskIds,
      availabilityValuesCount: availabilityValues.length,
      restrictionsValuesCount: restrictionsValues.length
    };

    if (this.db) {
      if (!this.db.wbp_sync_status) this.db.wbp_sync_status = {};
      this.db.wbp_sync_status.lastFullPush = this.lastSyncTimestamp;
      this.db.wbp_sync_status.provider = "channex";
      this.db.wbp_sync_status.mode = mode;
      this.db.wbp_sync_status.lastAvailabilityTaskIds = availRes.taskIds;
      this.db.wbp_sync_status.lastRestrictionsTaskIds = restRes.taskIds;
    }

    return {
      success: true,
      provider: "channex",
      mode,
      apiCallsCount: 2,
      startDate,
      endDate,
      availabilityTaskIds: availRes.taskIds,
      restrictionsTaskIds: restRes.taskIds,
      warnings: restRes.warnings || [],
      availabilityValuesCount: availabilityValues.length,
      restrictionsValuesCount: restrictionsValues.length
    };
  }

  /**
   * Pushes a targeted date-range delta to Channex /availability and/or /restrictions,
   * enforcing the 10 req/min rate limit per endpoint.
   *
   * @param {string} startDate - YYYY-MM-DD
   * @param {string} endDate - YYYY-MM-DD
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async performChannexDeltaSync(startDate, endDate, options = {}) {
    const mode = getIntegrationMode(this.db);
    if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
      return { success: false, skipped: true, reason: "integration_off", mode };
    }

    const includeAvailability = options.includeAvailability !== false;
    const includeRestrictions = options.includeRestrictions !== false;

    const availabilityValues = includeAvailability
      ? buildChannexAvailabilityValues(startDate, endDate, this.db, options)
      : [];
    const restrictionsValues = includeRestrictions
      ? buildChannexRestrictionsValues(startDate, endDate, this.db, options)
      : [];

    if (mode === WBP_MODES.OBSERVE && !options.bypassSwitch) {
      return {
        success: true,
        mode: "observe",
        startDate,
        endDate,
        availabilityValuesCount: availabilityValues.length,
        restrictionsValuesCount: restrictionsValues.length,
        availabilityTaskIds: [],
        restrictionsTaskIds: []
      };
    }

    const reqOpts = { bypassSwitch: Boolean(options.bypassSwitch) };
    let availabilityTaskIds = [];
    let restrictionsTaskIds = [];
    let warnings = [];

    if (includeAvailability && availabilityValues.length > 0) {
      const availLimit = this.checkChannexRateLimit("availability");
      if (!availLimit.allowed && !options.ignoreRateLimit) {
        return {
          success: false,
          rateLimited: true,
          endpoint: "availability",
          reason: "local_rate_limit_10_per_min",
          limitInfo: availLimit
        };
      }
      const availRes = await this.channexClient.updateAvailability(availabilityValues, reqOpts);
      availabilityTaskIds = availRes.taskIds;
      this.recordChannexTaskLog({
        endpoint: "availability",
        taskIds: availabilityTaskIds,
        valuesCount: availabilityValues.length,
        dateFrom: startDate,
        dateTo: endDate,
        trigger: options.trigger || "delta_sync",
        status: "success"
      });
    }

    if (includeRestrictions && restrictionsValues.length > 0) {
      const restLimit = this.checkChannexRateLimit("restrictions");
      if (!restLimit.allowed && !options.ignoreRateLimit) {
        return {
          success: false,
          rateLimited: true,
          endpoint: "restrictions",
          reason: "local_rate_limit_10_per_min",
          limitInfo: restLimit
        };
      }
      const restRes = await this.channexClient.updateRestrictions(restrictionsValues, reqOpts);
      restrictionsTaskIds = restRes.taskIds;
      warnings = restRes.warnings || [];
      this.recordChannexTaskLog({
        endpoint: "restrictions",
        taskIds: restrictionsTaskIds,
        valuesCount: restrictionsValues.length,
        dateFrom: startDate,
        dateTo: endDate,
        trigger: options.trigger || "delta_sync",
        status: "success",
        warnings
      });
    }

    this.lastSyncTimestamp = new Date().toISOString();
    return {
      success: true,
      provider: "channex",
      mode,
      startDate,
      endDate,
      availabilityTaskIds,
      restrictionsTaskIds,
      warnings,
      availabilityValuesCount: availabilityValues.length,
      restrictionsValuesCount: restrictionsValues.length
    };
  }

  /**
   * Retrieves administrative ceiling for a rate plan on a specific date.
   * @param {string} planId
   * @param {string} dateStr
   * @returns {number|null}
   */
  getPlanCeiling(planId, dateStr) {
    const mapping = getWbpMapping(this.db);
    const planConfig = (mapping.ratePlans || []).find((p) => p.wbp_rate_id === planId);
    if (planConfig?.ceiling != null && Number.isFinite(Number(planConfig.ceiling))) {
      return Number(planConfig.ceiling);
    }
    const restrictions = getWbpRestrictionsState(this.db);
    const planDefault = restrictions.planDefaults?.[planId]?.ceiling;
    if (planDefault != null && Number.isFinite(Number(planDefault))) {
      return Number(planDefault);
    }
    return null;
  }

  /**
   * Generates ARI blocks for a specified date range (WBP wire format).
   * Combines canonical availability, SEBRAE rate plans, and 7 restrictions.
   */
  generateAriBlocks(startDate, endDate, { contiguous = true, planIds = ["sem_cafe", "com_cafe"] } = {}) {
    const availMap = calculateCanonicalAvailability(startDate, addDays(endDate, 1), { db: this.db });
    const pricingState = WbpPricingManager.getPricingState(this.db);
    const settings = pricingState.settings || DEFAULT_SEBRAE_CONFIG;
    const sebraeBase = calculateSebraeRate(settings);
    const reservations = Array.isArray(this.db?.reservations) ? this.db.reservations : [];
    const seasonality = calculateHistoricalSeasonality(reservations, {
      manualOverrides: pricingState.seasonalityOverrides || {}
    });

    const dailyBlocks = [];
    const nights = getNightsList(startDate, endDate);

    for (const night of nights) {
      const d = new Date(night + "T12:00:00Z");
      const monthIdx = d.getUTCMonth();
      const seasonInfo = seasonality[monthIdx] || { factor: 1.0, season: "Média" };

      const seasonalBaseRate = round2(sebraeBase.tarifaMinima * seasonInfo.factor);
      const dayOfWeek = d.getUTCDay();
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
      const weekendMultiplier = isWeekend ? (1 + Number(settings.weekendMarkupPct || 0.15)) : 1.0;
      const candidateBaseRate = round2(seasonalBaseRate * weekendMultiplier);

      const calculatedPlans = calculateRatePlanPrices(candidateBaseRate, settings);
      const freeCanonical = availMap.get(night) ?? 19;

      for (const planId of planIds) {
        const key = `${night}_${planId}`;
        const calculated = calculatedPlans[planId] || calculatedPlans.sem_cafe;

        let effectiveRate = calculated.rate;
        if (pricingState.lastPublishedRates?.[key] != null) {
          effectiveRate = Number(pricingState.lastPublishedRates[key]);
        } else if (pricingState.stagedModifications?.[key] != null) {
          effectiveRate = Number(pricingState.stagedModifications[key]);
        }

        const restrictions = resolveRestrictions(this.db, night, planId);
        const ceiling = this.getPlanCeiling(planId, night);
        const units = Math.max(0, Math.min(ceiling != null ? Number(ceiling) : 19, freeCanonical));

        const bSurcharge = Number(settings.breakfastSurchargePerGuest || 25.00);
        const extraBed = Number(settings.extraBedFee || 60.00);

        let rdefSingle = calculated.rdef_single;
        let adult3 = calculated.adult_3;

        if (effectiveRate !== calculated.rate) {
          if (planId === "sem_cafe") {
            rdefSingle = effectiveRate;
            adult3 = round2(effectiveRate + extraBed);
          } else {
            rdefSingle = round2(effectiveRate - bSurcharge);
            adult3 = round2(effectiveRate + bSurcharge + extraBed);
          }
        }

        dailyBlocks.push({
          wbp_room_id: "flat",
          wbp_rate_id: planId,
          date: night,
          units,
          rate: Number(effectiveRate).toFixed(2),
          rdef_single: Number(rdefSingle).toFixed(2),
          num_adults_included: 2,
          num_children_included: 0,
          adult_3: Number(adult3).toFixed(2),
          min_los: restrictions.min_los,
          max_los: restrictions.max_los,
          close: restrictions.close,
          closearr: restrictions.closearr,
          closedep: restrictions.closedep,
          min_advanced_offset: restrictions.min_advanced_offset,
          max_advanced_offset: restrictions.max_advanced_offset
        });
      }
    }

    if (contiguous) {
      return compressContiguousBlocks(dailyBlocks);
    }

    return dailyBlocks.map((b) => {
      const copy = { ...b, start_date: b.date, end_date: b.date };
      delete copy.date;
      return copy;
    });
  }

  /**
   * Performs an Initial Full Push covering from today through Dec 31 of next calendar year.
   */
  async performFullPush(options = {}) {
    const mode = getIntegrationMode(this.db);

    if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
      return {
        success: false,
        skipped: true,
        reason: "integration_off",
        mode
      };
    }

    const horizon = calculateFullPushHorizon(options.referenceDate || new Date());
    const startDate = options.startDate || horizon.startDate;
    const endDate = options.endDate || horizon.endDate;

    const batches = [];
    let batchStart = startDate;

    while (batchStart <= endDate) {
      const potentialEnd = addDays(batchStart, this.batchSizeDays - 1);
      const batchEnd = potentialEnd > endDate ? endDate : potentialEnd;
      batches.push({ start: batchStart, end: batchEnd });
      batchStart = addDays(batchEnd, 1);
    }

    let totalBlocksCount = 0;
    const transmittedBatches = [];

    for (let i = 0; i < batches.length; i++) {
      const { start, end } = batches[i];
      const blocks = this.generateAriBlocks(start, end, { contiguous: true });
      totalBlocksCount += blocks.length;

      if (mode === WBP_MODES.OBSERVE) {
        transmittedBatches.push({
          batchIndex: i,
          startDate: start,
          endDate: end,
          blocksCount: blocks.length,
          transmitted: false,
          mode: "observe"
        });
      } else if (mode === WBP_MODES.AUTO || options.bypassSwitch) {
        const batchGuid = options.guid ? `${options.guid}-${i}` : crypto.randomUUID();
        const res = await this.client.sendARIUpdate(
          {
            currency: "BRL",
            Inventory: blocks
          },
          { guid: batchGuid, bypassSwitch: Boolean(options.bypassSwitch) }
        );

        transmittedBatches.push({
          batchIndex: i,
          startDate: start,
          endDate: end,
          blocksCount: blocks.length,
          guid: res.guid,
          transmitted: true,
          mode: "auto"
        });
      }

      await new Promise((resolve) => setImmediate(resolve));
    }

    this.lastSyncTimestamp = new Date().toISOString();
    this.lastSyncResult = {
      success: true,
      mode,
      startDate,
      endDate,
      totalBlocks: totalBlocksCount,
      batchesCount: batches.length
    };

    if (this.db) {
      if (!this.db.wbp_sync_status) this.db.wbp_sync_status = {};
      this.db.wbp_sync_status.lastFullPush = this.lastSyncTimestamp;
      this.db.wbp_sync_status.mode = mode;
      this.db.wbp_sync_status.totalBlocks = totalBlocksCount;
    }

    return {
      success: true,
      mode,
      startDate,
      endDate,
      totalBlocks: totalBlocksCount,
      batchesCount: batches.length,
      transmittedBatches
    };
  }

  async initialFullPush(options = {}) {
    return this.performFullPush(options);
  }

  /**
   * Triggers an incremental push with debouncing (<10s window: 2s debounce, 6s max-wait).
   */
  triggerIncrementalSync(dateRange, metadata = {}) {
    const mode = getIntegrationMode(this.db);
    if (mode === WBP_MODES.OFF) {
      return { scheduled: false, skipped: true, reason: "integration_off" };
    }

    let minDate, maxDate;
    if (typeof dateRange === "string") {
      minDate = dateRange;
      maxDate = dateRange;
    } else if (Array.isArray(dateRange)) {
      minDate = dateRange[0];
      maxDate = dateRange[dateRange.length - 1];
    } else if (dateRange && typeof dateRange === "object") {
      minDate = dateRange.minDate || dateRange.startDate || dateRange.checkinDate;
      maxDate = dateRange.maxDate || dateRange.endDate || dateRange.checkoutDate;
    }

    if (!minDate || !maxDate) {
      return { scheduled: false, error: "invalid_date_range" };
    }

    this.pendingMinDate = this.pendingMinDate
      ? (minDate < this.pendingMinDate ? minDate : this.pendingMinDate)
      : minDate;
    this.pendingMaxDate = this.pendingMaxDate
      ? (maxDate > this.pendingMaxDate ? maxDate : this.pendingMaxDate)
      : maxDate;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.flushIncrementalSync().catch((err) => {
          console.warn("[ARI Sync] Falha em flushIncrementalSync assíncrono:", err.message);
        });
      }, this.maxWaitMs);
      if (this.maxWaitTimer?.unref) this.maxWaitTimer.unref();
    }

    this.debounceTimer = setTimeout(() => {
      this.flushIncrementalSync().catch((err) => {
        console.warn("[ARI Sync] Falha em flushIncrementalSync assíncrono:", err.message);
      });
    }, this.debounceMs);
    if (this.debounceTimer?.unref) this.debounceTimer.unref();

    return {
      scheduled: true,
      minDate: this.pendingMinDate,
      maxDate: this.pendingMaxDate
    };
  }

  requestIncrementalPush(mutationInfo = {}) {
    return this.triggerIncrementalSync(mutationInfo);
  }

  /**
   * Flushes the pending debounced incremental bounding interval.
   * Supports both Channex v1 (when configured with apiKey/channexClient) and WBP.
   */
  async flushIncrementalSync() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }

    if (!this.pendingMinDate || !this.pendingMaxDate) {
      return { flushed: false, reason: "no_pending_dates" };
    }

    const minDate = this.pendingMinDate;
    const maxDate = this.pendingMaxDate;
    this.pendingMinDate = null;
    this.pendingMaxDate = null;

    const mode = getIntegrationMode(this.db);
    if (mode === WBP_MODES.OFF) {
      return { flushed: false, skipped: true, reason: "integration_off" };
    }

    const blocks = this.generateAriBlocks(minDate, maxDate, { contiguous: false });

    if (mode === WBP_MODES.OBSERVE) {
      this.lastSyncTimestamp = new Date().toISOString();
      return {
        flushed: true,
        mode: "observe",
        minDate,
        maxDate,
        blocksCount: blocks.length
      };
    }

    const channexCfg = getChannexConfig(this.db);
    const shouldPushChannex = Boolean(this.channexClient?.apiKey || channexCfg.apiKey);

    const guid = crypto.randomUUID();
    try {
      let channexResult = null;
      if (shouldPushChannex) {
        try {
          channexResult = await this.performChannexDeltaSync(minDate, maxDate, {
            trigger: "debounced_incremental"
          });
        } catch (chxErr) {
          console.warn("[Channex ARI Sync] Aviso durante delta incremental:", chxErr.message);
        }
      }

      const res = await this.client.sendARIUpdate(
        {
          currency: "BRL",
          Inventory: blocks
        },
        { guid }
      );

      this.lastSyncTimestamp = new Date().toISOString();

      if (this.persistentAlertSent) {
        this.triggerRecoveryAlert();
        this.persistentAlertSent = false;
      }
      this.failureStartTime = null;

      return {
        flushed: true,
        success: true,
        mode: "auto",
        guid: res.guid || guid,
        minDate,
        maxDate,
        blocksCount: blocks.length,
        channexResult
      };
    } catch (err) {
      this.handleSyncFailure(err, minDate, maxDate);
      throw err;
    }
  }

  handleSyncFailure(err, minDate, maxDate) {
    if (!this.failureStartTime) {
      this.failureStartTime = Date.now();
    }

    this.pendingDirtyIntervals.push({
      minDate,
      maxDate,
      error: err.message,
      timestamp: Date.now()
    });

    const elapsedMs = Date.now() - this.failureStartTime;

    if (elapsedMs >= this.alertThresholdMs && !this.persistentAlertSent) {
      this.triggerPersistentFailureAlert(err, elapsedMs);
      this.persistentAlertSent = true;
    }
  }

  triggerPersistentFailureAlert(err, elapsedMs) {
    const elapsedMinutes = Math.round(elapsedMs / 60000);
    const alertPayload = {
      type: "persistent_failure",
      severity: "critical",
      elapsedMinutes,
      error: err.message,
      timestamp: new Date().toISOString()
    };

    if (this.onAlert) {
      this.onAlert(alertPayload);
    }
  }

  triggerRecoveryAlert() {
    const alertPayload = {
      type: "recovery",
      severity: "info",
      message: "Sincronização ARI restabelecida.",
      timestamp: new Date().toISOString()
    };

    if (this.onAlert) {
      this.onAlert(alertPayload);
    }
  }

  getStatus() {
    const availLimit = this.checkChannexRateLimit("availability");
    const restLimit = this.checkChannexRateLimit("restrictions");
    return {
      lastSyncTimestamp: this.lastSyncTimestamp,
      lastSyncResult: this.lastSyncResult,
      mode: getIntegrationMode(this.db),
      pendingMinDate: this.pendingMinDate,
      pendingMaxDate: this.pendingMaxDate,
      isPending: Boolean(this.debounceTimer || this.maxWaitTimer),
      dirtyIntervalsCount: this.pendingDirtyIntervals.length,
      failureStartTime: this.failureStartTime,
      persistentAlertSent: this.persistentAlertSent,
      channexRateLimits: {
        availability: availLimit,
        restrictions: restLimit
      },
      channexTaskLogsCount: Array.isArray(this.db?.channexTaskLogs) ? this.db.channexTaskLogs.length : 0
    };
  }

  getSyncStatus() {
    return this.getStatus();
  }
}

export const ARISynchronizer = WbpAriSynchronizer;

let singletonSynchronizer = null;

export function getAriSynchronizer(db, options = {}) {
  if (!singletonSynchronizer || options.forceNew) {
    singletonSynchronizer = new WbpAriSynchronizer({ db, ...options });
  } else if (db && !singletonSynchronizer.db) {
    singletonSynchronizer.db = db;
  }
  return singletonSynchronizer;
}

export function notifyPmsMutation(db, mutationInfo = {}) {
  const mode = getIntegrationMode(db);
  if (mode === WBP_MODES.OFF) {
    return null;
  }

  let minDate = mutationInfo.minDate || mutationInfo.startDate || mutationInfo.checkinDate;
  let maxDate = mutationInfo.maxDate || mutationInfo.endDate || mutationInfo.checkoutDate;

  if (mutationInfo.checkinDate && mutationInfo.checkoutDate) {
    minDate = mutationInfo.checkinDate;
    const lastStay = addDays(mutationInfo.checkoutDate, -1);
    maxDate = lastStay < minDate ? minDate : lastStay;
  }

  if (!minDate || !maxDate) return null;

  const synchronizer = getAriSynchronizer(db);
  return synchronizer.triggerIncrementalSync({ minDate, maxDate }, mutationInfo);
}
