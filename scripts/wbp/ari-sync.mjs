/**
 * artifacts/api-server/wbp/ari-sync.mjs
 *
 * Milestone 3: ARI Mapping, 7 Restrictions & Synchronizer.
 *
 * Features:
 * - Feature 14: Room & Rate Mapping + ARI Payload Builder
 *   - 19 physical flats mapped to 1 commercial room type ("flat").
 *   - 2 commercial rate plans: "sem_cafe" (base room rate) and "com_cafe" (base + R$ 25/guest/night).
 *   - Shared inventory pool math: units = max(0, min(planCeiling ?? 19, canonicalFreeFlats)).
 *   - Occupancy-Based Pricing (OBP): rate, rdef_single, num_adults_included: 2, num_children_included: 0, adult_3.
 *   - Inclusive end_date rule handling for WebBookingPro ARI wire format.
 *   - Contiguous multi-day block compression for full push (~85% payload reduction).
 * - Feature 15: 7 Restrictions Engine
 *   - min_los (weekday: 1, weekend: 2; fallback to legacy db.tariffSettings.minNights).
 *   - max_los (default: 30).
 *   - close (stop-sell default: false).
 *   - closearr (CTA default: false).
 *   - closedep (CTD default: false).
 *   - min_advanced_offset (default: 0).
 *   - max_advanced_offset (default: 0).
 *   - Storage in db.wbpRestrictions; zero regression on legacy calculateDailyRate.
 * - Feature 16: ARI Synchronizer (WbpAriSynchronizer)
 *   - Initial Full Push: today through next year 12-31 in 60-day batches with setImmediate yielding.
 *   - Incremental Debounced Push: <10s window (2s debounce with 6s max-wait ceiling) coalescing rapid bursts into minimal bounding interval [minDate, maxDate].
 *   - Outbound transmission via WBPClient.sendARIUpdate.
 *   - General switch modes: 'off' (0 requests), 'observe' (log only), 'auto' (transmit).
 *   - Transient retry handling with UUID v4 GUID reuse.
 *   - Persistent failure tracker (>15 min -> alert WhatsApp/Email and audit log) and recovery notification.
 *
 * Mirrors byte-for-byte in scripts/wbp/ari-sync.mjs.
 */

import crypto from "node:crypto";
import { WBPClient } from "./client.mjs";
import { getIntegrationMode, isWbpEnabled, WBP_MODES } from "./config.mjs";
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
    name: "Flat",
    maxOccupancy: 3,
    baseOccupancy: 2,
    flats: CORPFLATS_19_FLATS.map((f) => f.id)
  },
  ratePlans: [
    {
      pms_plan_id: "sem_cafe",
      wbp_rate_id: "sem_cafe",
      name: "Sem café",
      breakfastIncluded: false,
      ceiling: null
    },
    {
      pms_plan_id: "com_cafe",
      wbp_rate_id: "com_cafe",
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
 * Retrieves or initializes WBP mapping configuration in database state.
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
 * @returns {{
 *   min_los: number,
 *   max_los: number,
 *   close: boolean,
 *   closearr: boolean,
 *   closedep: boolean,
 *   min_advanced_offset: number,
 *   max_advanced_offset: number
 * }}
 */
export function resolveRestrictions(db, dateStr, planId = "sem_cafe") {
  const state = getWbpRestrictionsState(db);
  const defaults = { ...DEFAULT_RESTRICTIONS, ...(state.defaults || {}) };

  // Weekend stays: Friday night (5) and Saturday night (6) in UTC noon
  const d = new Date(dateStr + "T12:00:00Z");
  const dayOfWeek = d.getUTCDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  let defaultMinLos = isWeekend ? defaults.min_los_weekend : defaults.min_los_weekday;
  // If legacy minNights is set > 1 and no explicit weekday override exists, respect it
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

  // Plan-specific defaults
  if (state.planDefaults?.[planId]) {
    Object.assign(resolved, state.planDefaults[planId]);
  }

  // Date-level override
  if (state.overrides?.[dateStr]) {
    Object.assign(resolved, state.overrides[dateStr]);
  }

  // Plan + Date specific override
  const specificKey = `${dateStr}_${planId}`;
  if (state.overrides?.[specificKey]) {
    Object.assign(resolved, state.overrides[specificKey]);
  }

  // Clamping to ensure schema validity
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
 * Compresses daily ARI blocks into contiguous date ranges where all attributes match.
 * WBP wire format specifies that end_date is strictly INCLUSIVE.
 *
 * @param {Array<object>} dailyItems
 * @returns {Array<object>}
 */
export function compressContiguousBlocks(dailyItems) {
  if (!Array.isArray(dailyItems) || dailyItems.length === 0) return [];

  // Group by rate plan to avoid merging across rate plans
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
        current.end_date = next.date; // Extend inclusive range
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
 * into WebBookingPro ARIUpdate wire transmissions.
 */
export class WbpAriSynchronizer {
  constructor(options = {}) {
    this.db = options.db || (typeof global !== "undefined" && global.db ? global.db : {});
    this.client = options.client || new WBPClient({ db: this.db, ...options });

    this.debounceMs = Number(options.debounceMs || 2000); // 2s debounce window
    this.maxWaitMs = Number(options.maxWaitMs || 6000);   // 6s max-wait ceiling (<10s)
    this.batchSizeDays = Number(options.batchSizeDays || 60);
    this.batchItemCeiling = Number(options.batchItemCeiling || 120);
    this.alertThresholdMs = Number(options.alertThresholdMs || 15 * 60 * 1000); // 15 minutes

    this.onAlert = typeof options.onAlert === "function" ? options.onAlert : null;

    // Incremental debouncing state
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.pendingMinDate = null;
    this.pendingMaxDate = null;
    this.pendingDirtyIntervals = [];

    // Health & status tracking
    this.failureStartTime = null;
    this.persistentAlertSent = false;
    this.lastSyncTimestamp = null;
    this.lastSyncResult = null;
    this.syncHistory = [];
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
   * Generates ARI blocks for a specified date range.
   * Combines canonical availability, SEBRAE rate plans, and 7 restrictions.
   *
   * @param {string} startDate - YYYY-MM-DD
   * @param {string} endDate - YYYY-MM-DD
   * @param {object} [options]
   * @param {boolean} [options.contiguous=true]
   * @param {string[]} [options.planIds=["sem_cafe", "com_cafe"]]
   * @returns {Array<object>}
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
   * Chunks into 60-day batches using setImmediate yielding.
   *
   * @param {object} [options]
   * @param {string} [options.startDate]
   * @param {string} [options.endDate]
   * @param {string} [options.guid]
   * @returns {Promise<object>}
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
        // Mode 'observe': logs payload and generates calculation with zero outbound network calls
        transmittedBatches.push({
          batchIndex: i,
          startDate: start,
          endDate: end,
          blocksCount: blocks.length,
          transmitted: false,
          mode: "observe"
        });
      } else if (mode === WBP_MODES.AUTO || options.bypassSwitch) {
        // Mode 'auto': transmit to WebBookingPro with transient retry & GUID
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

      // Yield to Node event loop between batches
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

  /**
   * Alias for performFullPush to support varied caller conventions.
   */
  async initialFullPush(options = {}) {
    return this.performFullPush(options);
  }

  /**
   * Triggers an incremental push with debouncing (<10s window: 2s debounce, 6s max-wait).
   * Coalesces rapid mutation events into a minimal bounding interval [minDate, maxDate].
   *
   * @param {object|string} dateRange - { minDate, maxDate } or [minDate, maxDate] or single date string
   * @param {object} [metadata]
   * @returns {{ scheduled: boolean, minDate: string, maxDate: string }}
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

    // Coalesce into current bounding interval
    this.pendingMinDate = this.pendingMinDate
      ? (minDate < this.pendingMinDate ? minDate : this.pendingMinDate)
      : minDate;
    this.pendingMaxDate = this.pendingMaxDate
      ? (maxDate > this.pendingMaxDate ? maxDate : this.pendingMaxDate)
      : maxDate;

    // Debounce timer management
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.flushIncrementalSync();
      }, this.maxWaitMs);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushIncrementalSync();
    }, this.debounceMs);

    return {
      scheduled: true,
      minDate: this.pendingMinDate,
      maxDate: this.pendingMaxDate
    };
  }

  /**
   * Alias for triggerIncrementalSync.
   */
  requestIncrementalPush(mutationInfo = {}) {
    return this.triggerIncrementalSync(mutationInfo);
  }

  /**
   * Flushes the pending debounced incremental bounding interval to WebBookingPro.
   * @returns {Promise<object>}
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

    // Generate atomic blocks for incremental updates
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

    // Mode AUTO: Send to WebBookingPro
    const guid = crypto.randomUUID();
    try {
      const res = await this.client.sendARIUpdate(
        {
          currency: "BRL",
          Inventory: blocks
        },
        { guid }
      );

      this.lastSyncTimestamp = new Date().toISOString();

      // Check if recovering from persistent failure
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
        blocksCount: blocks.length
      };
    } catch (err) {
      this.handleSyncFailure(err, minDate, maxDate);
      throw err;
    }
  }

  /**
   * Tracks failure timestamp and triggers persistent failure alert (>15 minutes).
   * @param {Error} err
   * @param {string} minDate
   * @param {string} maxDate
   */
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

  /**
   * Dispatches critical persistent failure notification.
   * @param {Error} err
   * @param {number} elapsedMs
   */
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

  /**
   * Dispatches recovery notification when sync resumes after failure.
   */
  triggerRecoveryAlert() {
    const alertPayload = {
      type: "recovery",
      severity: "info",
      message: "Sincronização ARI com WebBookingPro restabelecida.",
      timestamp: new Date().toISOString()
    };

    if (this.onAlert) {
      this.onAlert(alertPayload);
    }
  }

  /**
   * Returns current synchronizer status and diagnostics.
   * @returns {object}
   */
  getStatus() {
    return {
      lastSyncTimestamp: this.lastSyncTimestamp,
      lastSyncResult: this.lastSyncResult,
      mode: getIntegrationMode(this.db),
      pendingMinDate: this.pendingMinDate,
      pendingMaxDate: this.pendingMaxDate,
      isPending: Boolean(this.debounceTimer || this.maxWaitTimer),
      dirtyIntervalsCount: this.pendingDirtyIntervals.length,
      failureStartTime: this.failureStartTime,
      persistentAlertSent: this.persistentAlertSent
    };
  }

  getSyncStatus() {
    return this.getStatus();
  }
}

export const ARISynchronizer = WbpAriSynchronizer;

let singletonSynchronizer = null;

/**
 * Returns or initializes singleton ARI Synchronizer.
 * @param {object} db
 * @param {object} [options]
 * @returns {WbpAriSynchronizer}
 */
export function getAriSynchronizer(db, options = {}) {
  if (!singletonSynchronizer || options.forceNew) {
    singletonSynchronizer = new WbpAriSynchronizer({ db, ...options });
  } else if (db && !singletonSynchronizer.db) {
    singletonSynchronizer.db = db;
  }
  return singletonSynchronizer;
}

/**
 * Lightweight mutation hook to be called from demo-server.mjs touchpoints.
 * Safely exits immediately if integration mode is 'off'.
 *
 * @param {object} db
 * @param {object} mutationInfo
 * @param {string} [mutationInfo.type]
 * @param {string} [mutationInfo.minDate]
 * @param {string} [mutationInfo.maxDate]
 * @param {string} [mutationInfo.checkinDate]
 * @param {string} [mutationInfo.checkoutDate]
 * @returns {object|null}
 */
export function notifyPmsMutation(db, mutationInfo = {}) {
  const mode = getIntegrationMode(db);
  if (mode === WBP_MODES.OFF) {
    return null; // Zero timer or object overhead when off
  }

  let minDate = mutationInfo.minDate || mutationInfo.startDate || mutationInfo.checkinDate;
  let maxDate = mutationInfo.maxDate || mutationInfo.endDate || mutationInfo.checkoutDate;

  // If check-in and check-out are supplied (e.g. from PMS reservation),
  // check-out morning is departure, so the last stay night is check-out - 1 day.
  if (mutationInfo.checkinDate && mutationInfo.checkoutDate) {
    minDate = mutationInfo.checkinDate;
    const lastStay = addDays(mutationInfo.checkoutDate, -1);
    maxDate = lastStay < minDate ? minDate : lastStay;
  }

  if (!minDate || !maxDate) return null;

  const synchronizer = getAriSynchronizer(db);
  return synchronizer.triggerIncrementalSync({ minDate, maxDate }, mutationInfo);
}
