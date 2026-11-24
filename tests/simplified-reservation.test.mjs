/**
 * Strictly scoped test suite for Simplified New Reservation Mode & PMS Tariff Quote.
 * Run ONLY via:
 *   node --experimental-strip-types --test tests/simplified-reservation.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  round2Money,
  getCleaningFeeSummary,
  applySimpleDailyRateEdit,
  applySimpleTotalEdit,
  applySimpleCleaningFeeEdit,
  applySimpleCleaningFeeRemove,
  applyTariffQuoteToFlatState,
} from "../artifacts/limpeza/src/lib/simplified-reservation-pricing.ts";
import {
  evaluateSimpleFlatAvailability,
  resolveFairShareFlatAllocation,
  inspectSimpleCrmGuestState,
  shouldKeepPhoneOnCrmUnlink,
  computeChannelTransition,
  validateSimplifiedReservationSubmit,
} from "../artifacts/limpeza/src/lib/simplified-reservation-helpers.ts";

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("Simplified Reservation Pricing Helpers (Frontend Pure Logic)", () => {
  it("synchronizes Daily Rate -> Total accurately with active Cleaning Fee", () => {
    const rates = [
      { date: "2026-11-24", rate: 300, channel: "booking" },
      { date: "2026-11-25", rate: 300, channel: "booking" },
      { date: "2026-11-26", rate: 300, channel: "booking" },
    ];
    const charges = [
      { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 57.5, notes: "" },
    ];

    const res = applySimpleDailyRateEdit(rates, charges, 320.5);
    assert.equal(res.avgDailyRate, 320.5);
    assert.equal(res.nightsSubtotal, 961.5);
    assert.equal(res.cleaningFee, 57.5);
    assert.equal(res.totalAmount, 1019);
    assert.deepEqual(
      res.dailyRates.map((d) => d.rate),
      [320.5, 320.5, 320.5]
    );
  });

  it("synchronizes Total -> Daily Rates with exact integer-cent split and zero cent drift", () => {
    const rates = [
      { date: "2026-11-24", rate: 200, channel: "airbnb" },
      { date: "2026-11-25", rate: 200, channel: "airbnb" },
      { date: "2026-11-26", rate: 200, channel: "airbnb" },
    ];
    const charges = [
      { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 50.01, notes: "" },
    ];

    // 500.00 - 50.01 = 449.99 across 3 nights => 149.99 + 149.99 + 150.01 = 449.99
    const res = applySimpleTotalEdit(rates, charges, 500);
    assert.equal(res.isBelowCharges, false);
    assert.equal(res.nightsSubtotal, 449.99);
    assert.equal(res.effectiveTotal, 500);
    const sumNights = round2Money(res.dailyRates.reduce((acc, d) => acc + d.rate, 0));
    assert.equal(sumNights, 449.99);
    assert.equal(round2Money(sumNights + res.cleaningFee), 500);
    assert.deepEqual(
      res.dailyRates.map((d) => d.rate),
      [149.99, 149.99, 150.01]
    );
  });

  it("handles mid-typing Total below Cleaning Fee safely without negative rates", () => {
    const rates = [
      { date: "2026-11-24", rate: 318.12, channel: "booking" },
      { date: "2026-11-25", rate: 318.12, channel: "booking" },
    ];
    const charges = [
      { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 57.5, notes: "" },
    ];

    const res = applySimpleTotalEdit(rates, charges, 0.06);
    assert.equal(res.isBelowCharges, true);
    assert.equal(res.typedTotal, 0.06);
    assert.equal(res.avgDailyRate, 0);
    assert.equal(res.nightsSubtotal, 0);
    assert.equal(res.effectiveTotal, 57.5);
    assert.deepEqual(
      res.dailyRates.map((d) => d.rate),
      [0, 0]
    );
  });

  it("edits and removes Cleaning Fee without mutating daily rates and preserves non-cleaning charges", () => {
    const rates = [
      { date: "2026-11-24", rate: 300, channel: "booking" },
      { date: "2026-11-25", rate: 350, channel: "booking" },
    ];
    const charges = [
      { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 57.5, notes: "" },
      { id: "p1", type: "pet", title: "Taxa Pet", amount: 40, notes: "" },
    ];

    const edited = applySimpleCleaningFeeEdit(rates, charges, 70);
    assert.equal(edited.cleaningFee, 70);
    assert.equal(edited.otherChargesSum, 40);
    assert.equal(edited.nightsSubtotal, 650);
    assert.equal(edited.totalAmount, 760);

    const removed = applySimpleCleaningFeeRemove(rates, edited.charges);
    assert.equal(removed.cleaningFee, 0);
    assert.equal(removed.otherChargesSum, 40);
    assert.equal(removed.totalAmount, 690);
    assert.equal(getCleaningFeeSummary(removed.charges).hasCleaningCharge, false);
    assert.equal(removed.charges.length, 1);
    assert.equal(removed.charges[0].type, "pet");
  });

  it("preserves user typed Total draft when removing or lowering Cleaning Fee after below-charges input", () => {
    const zeroedRates = [
      { date: "2026-11-24", rate: 0, channel: "booking" },
      { date: "2026-11-25", rate: 0, channel: "booking" },
    ];
    const charges = [
      { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 59, notes: "" },
    ];

    // User typed Total = 50.00 (below 59.00), then clicked Remove Cleaning Fee:
    // Total MUST remain 50.00 and split into 25.00 + 25.00 instead of collapsing to 0!
    const removed = applySimpleCleaningFeeRemove(zeroedRates, charges, 50);
    assert.equal(removed.cleaningFee, 0);
    assert.equal(removed.totalAmount, 50);
    assert.equal(removed.avgDailyRate, 25);
    assert.equal(removed.nextTotalDraft, null);
    assert.deepEqual(
      removed.dailyRates.map((d) => d.rate),
      [25, 25]
    );

    // User typed Total = 50.00 (below 59.00), then lowered Cleaning Fee to 20.00:
    // Total MUST remain 50.00 and daily rates become (50 - 20) / 2 = 15.00 each!
    const loweredBelow = applySimpleCleaningFeeEdit(zeroedRates, charges, 20, undefined, 50);
    assert.equal(loweredBelow.cleaningFee, 20);
    assert.equal(loweredBelow.totalAmount, 50);
    assert.equal(loweredBelow.avgDailyRate, 15);
    assert.equal(loweredBelow.nextTotalDraft, null);
    assert.deepEqual(
      loweredBelow.dailyRates.map((d) => d.rate),
      [15, 15]
    );

    // User typed Total = 50.00 (below 59.00), then lowered Cleaning Fee to 55.00 (still > 50):
    // Keeps nextTotalDraft = 50 and daily rates at 0 without negative values.
    const stillAbove = applySimpleCleaningFeeEdit(zeroedRates, charges, 55, undefined, 50);
    assert.equal(stillAbove.cleaningFee, 55);
    assert.equal(stillAbove.totalAmount, 55);
    assert.equal(stillAbove.avgDailyRate, 0);
    assert.equal(stillAbove.nextTotalDraft, 50);
  });

  it("applies server Tariff Quote cleanly for Sem Café (adds cleaning) and Com Café (removes cleaning)", () => {
    const baseFlat = {
      dailyRate: "0",
      dailyRates: [{ date: "2026-11-24", rate: 0, channel: "booking" }],
      charges: [{ id: "p1", type: "pet", title: "Taxa Pet", amount: 40, notes: "" }],
      rateioTargetInput: "0",
    };

    const semCafeQuote = {
      success: true,
      checkin: "2026-11-24",
      checkout: "2026-11-26",
      nights: 2,
      channel: "booking",
      normalizedChannel: "booking",
      flatId: "7",
      guests: 1,
      includeBreakfast: false,
      channelMarkupPct: 0.15,
      stayDiscountPct: 0,
      breakfastSurchargePerGuest: 23,
      breakfastSurchargeBase: 20,
      extraBedFee: 69,
      cleaningFee: 57.5,
      cleaningFeeEnabled: true,
      cleaningFeeBaseAmount: 50,
      cleaningFeeType: "per_stay",
      defaultCleaningFeeForChannel: 57.5,
      nightsSubtotal: 636.24,
      avgDailyRate: 318.12,
      totalAmount: 693.74,
      hasMixedNightRates: false,
      dailyRates: [
        { date: "2026-11-24", rate: 318.12, channel: "booking" },
        { date: "2026-11-25", rate: 318.12, channel: "booking" },
      ],
    };

    const appliedSem = applyTariffQuoteToFlatState(baseFlat, semCafeQuote, () => "clean_test_1");
    assert.equal(appliedSem.nextFlat.dailyRates.length, 2);
    assert.equal(appliedSem.nextFlat.dailyRate, "318.12");
    assert.equal(appliedSem.totalAmount, 733.74); // 636.24 + 57.50 cleaning + 40 pet
    assert.equal(getCleaningFeeSummary(appliedSem.nextFlat.charges).cleaningFee, 57.5);

    const comCafeQuote = {
      ...semCafeQuote,
      includeBreakfast: true,
      cleaningFee: 0,
      cleaningFeeEnabled: false,
      nightsSubtotal: 682.24,
      avgDailyRate: 341.12,
      totalAmount: 682.24,
      dailyRates: [
        { date: "2026-11-24", rate: 341.12, channel: "booking" },
        { date: "2026-11-25", rate: 341.12, channel: "booking" },
      ],
    };

    const appliedCom = applyTariffQuoteToFlatState(appliedSem.nextFlat, comCafeQuote);
    assert.equal(getCleaningFeeSummary(appliedCom.nextFlat.charges).hasCleaningCharge, false);
    assert.equal(appliedCom.nextFlat.charges.length, 1); // pet preserved
    assert.equal(appliedCom.totalAmount, 722.24); // 682.24 + 40 pet
  });
});

describe("Flat Availability, Stale Fair-Share Guard, Auto-Reallocation & Full Occupancy", () => {
  const flats = [
    { id: 1, number: "701", isActive: true },
    { id: 2, number: "702", isActive: true },
    { id: 3, number: "703", isActive: true },
  ];

  it("ignores stale fairShareResult from different dates and falls back to local conflicts", () => {
    const staleFairShare = {
      _checkin: "2026-11-24",
      _checkout: "2026-11-25",
      bestFlatId: 1,
      bestFlatNumber: "701",
      availableCount: 3,
      allStats: flats.map((f) => ({ flat: f, isAvailable: true })),
    };

    const resOnDec1 = [
      { id: 101, flatId: 1, flatNumber: "701", checkinDate: "2026-12-01", checkoutDate: "2026-12-03", status: "confirmada" },
      { id: 102, flatId: 2, flatNumber: "702", checkinDate: "2026-12-01", checkoutDate: "2026-12-03", status: "confirmada" },
      { id: 103, flatId: 3, flatNumber: "703", checkinDate: "2026-12-01", checkoutDate: "2026-12-03", status: "confirmada" },
    ];

    const avail = evaluateSimpleFlatAvailability({
      flatsList: flats,
      reservationsList: resOnDec1,
      blocksList: [],
      fairShareResult: staleFairShare,
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-02",
      flatId: "1",
    });

    assert.equal(avail.matchingFairShare, null);
    assert.equal(avail.isFullOccupancy, true);
    assert.equal(avail.availableCount, 0);
    assert.equal(avail.isSelectedAvailable, false);
    assert.equal(avail.firstFreeFlat, null);
  });

  it("detects full occupancy both when flatId is empty and when flatId is occupied with no free alternative", () => {
    const fullFairShare = {
      _checkin: "2026-12-31",
      _checkout: "2027-01-01",
      bestFlatId: null,
      bestFlatNumber: null,
      availableCount: 0,
      allStats: flats.map((f) => ({ flat: f, isAvailable: false })),
    };

    const withEmptyFlat = evaluateSimpleFlatAvailability({
      flatsList: flats,
      reservationsList: [],
      blocksList: [],
      fairShareResult: fullFairShare,
      checkinDate: "2026-12-31",
      checkoutDate: "2027-01-01",
      flatId: "",
    });
    assert.equal(withEmptyFlat.isFullOccupancy, true);
    assert.equal(withEmptyFlat.isSelectedAvailable, false);
    assert.equal(withEmptyFlat.firstFreeFlat, null);

    const withOccupiedFlat = evaluateSimpleFlatAvailability({
      flatsList: flats,
      reservationsList: [],
      blocksList: [],
      fairShareResult: fullFairShare,
      checkinDate: "2026-12-31",
      checkoutDate: "2027-01-01",
      flatId: "2",
    });
    assert.equal(withOccupiedFlat.isFullOccupancy, true);
    assert.equal(withOccupiedFlat.isSelectedAvailable, false);
    assert.equal(withOccupiedFlat.firstFreeFlat, null);
  });

  it("does not report false full occupancy when flats list is still empty (loading)", () => {
    const avail = evaluateSimpleFlatAvailability({
      flatsList: [],
      reservationsList: [],
      blocksList: [],
      fairShareResult: null,
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-02",
      flatId: "",
    });
    assert.equal(avail.isFullOccupancy, false);
    assert.equal(avail.totalFlatsCount, 0);
  });

  it("reallocates automatically in Simplified Mode when a clicked/dragged flat becomes occupied on date change", () => {
    const fsResult = {
      _checkin: "2026-12-05",
      _checkout: "2026-12-07",
      bestFlatId: 3,
      bestFlatNumber: "703",
      availableCount: 2,
      allStats: [
        { flat: flats[0], isAvailable: false },
        { flat: flats[1], isAvailable: true },
        { flat: flats[2], isAvailable: true },
      ],
    };

    // Clicked/dragged flat 701 (manual=true) is now occupied -> must reallocate to bestFlatId 3 (703)
    const reallocated = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "1",
      isFlatManuallyChanged: true,
      fairShareResult: fsResult,
      expectedCheckin: "2026-12-05",
      expectedCheckout: "2026-12-07",
    });
    assert.equal(reallocated.action, "reallocate_auto");
    assert.equal(reallocated.nextFlatId, "3");
    assert.equal(reallocated.nextFlatNumber, "703");
    assert.equal(reallocated.previousFlatNumber, "701");
    assert.equal(reallocated.nextIsFlatManual, false);

    // Clicked/dragged flat 702 is still available -> must keep 702
    const keptAvail = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "2",
      isFlatManuallyChanged: true,
      fairShareResult: fsResult,
      expectedCheckin: "2026-12-05",
      expectedCheckout: "2026-12-07",
    });
    assert.equal(keptAvail.action, "keep");

    // In Advanced Mode, manual occupied flat is kept (for overbooking inspection)
    const advKept = resolveFairShareFlatAllocation({
      mode: "advanced",
      isEdit: false,
      currentFlatId: "1",
      isFlatManuallyChanged: true,
      fairShareResult: fsResult,
      expectedCheckin: "2026-12-05",
      expectedCheckout: "2026-12-07",
    });
    assert.equal(advKept.action, "keep");

    // Stale Fair-Share response for mismatched dates must be ignored (keep)
    const staleIgnored = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "1",
      isFlatManuallyChanged: false,
      fairShareResult: fsResult,
      expectedCheckin: "2026-12-10",
      expectedCheckout: "2026-12-12",
    });
    assert.equal(staleIgnored.action, "keep");

    // Auto mode under full occupancy clears stale auto flatId
    const fullFs = {
      _checkin: "2026-12-31",
      _checkout: "2027-01-01",
      bestFlatId: null,
      bestFlatNumber: null,
      availableCount: 0,
      allStats: flats.map((f) => ({ flat: f, isAvailable: false })),
    };
    const clearedAuto = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "1",
      isFlatManuallyChanged: false,
      fairShareResult: fullFs,
      expectedCheckin: "2026-12-31",
      expectedCheckout: "2027-01-01",
    });
    assert.equal(clearedAuto.action, "clear_full_occupancy");
    assert.equal(clearedAuto.nextFlatId, "");
  });

  it("blocks Simplified Mode submit while loadingFairShare, on full occupancy, or when selected flat is unavailable", () => {
    const fullFairShare = {
      _checkin: "2026-12-31",
      _checkout: "2027-01-01",
      bestFlatId: null,
      bestFlatNumber: null,
      availableCount: 0,
      allStats: flats.map((f) => ({ flat: f, isAvailable: false })),
    };
    const partialFairShare = {
      _checkin: "2026-12-05",
      _checkout: "2026-12-07",
      bestFlatId: 3,
      bestFlatNumber: "703",
      availableCount: 1,
      allStats: [
        { flat: flats[0], isAvailable: false },
        { flat: flats[1], isAvailable: false },
        { flat: flats[2], isAvailable: true },
      ],
    };

    const fullAvail = evaluateSimpleFlatAvailability({
      flatsList: flats,
      reservationsList: [],
      blocksList: [],
      fairShareResult: fullFairShare,
      checkinDate: "2026-12-31",
      checkoutDate: "2027-01-01",
      flatId: "",
    });
    const partialBlockedAvail = evaluateSimpleFlatAvailability({
      flatsList: flats,
      reservationsList: [],
      blocksList: [],
      fairShareResult: partialFairShare,
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      flatId: "1",
    });
    const partialValidAvail = evaluateSimpleFlatAvailability({
      flatsList: flats,
      reservationsList: [],
      blocksList: [],
      fairShareResult: partialFairShare,
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      flatId: "3",
    });

    const loadingBlock = validateSimplifiedReservationSubmit({
      channel: "booking",
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      loadingFairShare: true,
      availability: partialValidAvail,
      flatId: "3",
      guest1Name: "João Silva",
      loadingTariffQuote: false,
      isManualPrice: false,
      totalDraft: null,
      charges: [],
    });
    assert.equal(loadingBlock?.code, "loading_fair_share");

    const fullBlock = validateSimplifiedReservationSubmit({
      channel: "booking",
      checkinDate: "2026-12-31",
      checkoutDate: "2027-01-01",
      loadingFairShare: false,
      availability: fullAvail,
      flatId: "",
      guest1Name: "João Silva",
      loadingTariffQuote: false,
      isManualPrice: false,
      totalDraft: null,
      charges: [],
    });
    assert.equal(fullBlock?.code, "full_occupancy");

    const flatUnavailableBlock = validateSimplifiedReservationSubmit({
      channel: "airbnb",
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      loadingFairShare: false,
      availability: partialBlockedAvail,
      flatId: "1",
      guest1Name: "João Silva",
      loadingTariffQuote: false,
      isManualPrice: false,
      totalDraft: null,
      charges: [],
    });
    assert.equal(flatUnavailableBlock?.code, "flat_unavailable");
    assert.ok(flatUnavailableBlock?.description.includes("703"));

    const allowed = validateSimplifiedReservationSubmit({
      channel: "airbnb",
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      loadingFairShare: false,
      availability: partialValidAvail,
      flatId: "3",
      guest1Name: "João Silva",
      loadingTariffQuote: false,
      isManualPrice: false,
      totalDraft: null,
      charges: [],
    });
    assert.equal(allowed, null);
  });

  it("guards invalid date ranges, deactivated flats, fallback bestFlat, earlyCheckoutDate, and maintenance full occupancy", () => {
    const fsValid = {
      _checkin: "2026-12-10",
      _checkout: "2026-12-11",
      bestFlatId: 2,
      bestFlatNumber: "702",
      availableCount: 2,
      allStats: [
        { flat: flats[0], isAvailable: false },
        { flat: flats[1], isAvailable: true },
        { flat: flats[2], isAvailable: true },
      ],
    };

    // Invalid date range (checkout <= checkin) must NOT mutate flatId
    const invalidRangeDecision = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "1",
      isFlatManuallyChanged: true,
      fairShareResult: fsValid,
      expectedCheckin: "2026-12-10",
      expectedCheckout: "2026-12-08",
    });
    assert.equal(invalidRangeDecision.action, "keep");

    // Current flat missing from active allStats (e.g., deactivated) must reallocate in Simplified Mode
    const deactivatedFlatDecision = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "999",
      isFlatManuallyChanged: true,
      fairShareResult: fsValid,
      expectedCheckin: "2026-12-10",
      expectedCheckout: "2026-12-11",
    });
    assert.equal(deactivatedFlatDecision.action, "reallocate_auto");
    assert.equal(deactivatedFlatDecision.nextFlatId, "2");

    // If bestFlatId is unavailable or null while another flat IS available, fall back to first available stat
    const fallbackBestDecision = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "1",
      isFlatManuallyChanged: true,
      fairShareResult: {
        _checkin: "2026-12-10",
        _checkout: "2026-12-11",
        bestFlatId: 1,
        bestFlatNumber: "701",
        availableCount: 1,
        allStats: [
          { flat: flats[0], isAvailable: false },
          { flat: flats[1], isAvailable: false },
          { flat: flats[2], isAvailable: true },
        ],
      },
      expectedCheckin: "2026-12-10",
      expectedCheckout: "2026-12-11",
    });
    assert.equal(fallbackBestDecision.action, "reallocate_auto");
    assert.equal(fallbackBestDecision.nextFlatId, "3");

    // Local availability respects earlyCheckoutDate and detects full occupancy across maintenance + reservations
    const flatsWithMaint = [
      { id: 1, number: "701", isActive: true, maintenanceStatus: "em_manutencao" },
      { id: 2, number: "702", isActive: true },
    ];
    const earlyOutAvail = evaluateSimpleFlatAvailability({
      flatsList: flatsWithMaint,
      reservationsList: [
        {
          id: 201,
          flatId: 2,
          flatNumber: "702",
          checkinDate: "2026-12-01",
          checkoutDate: "2026-12-10",
          earlyCheckout: true,
          earlyCheckoutDate: "2026-12-03",
          status: "completed",
        },
      ],
      blocksList: [],
      fairShareResult: null,
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      flatId: "",
    });
    assert.equal(earlyOutAvail.isFullOccupancy, false);
    assert.equal(earlyOutAvail.firstFreeFlat?.id, "2");

    const localFullMaint = evaluateSimpleFlatAvailability({
      flatsList: flatsWithMaint,
      reservationsList: [
        {
          id: 202,
          flatId: 2,
          flatNumber: "702",
          checkinDate: "2026-12-05",
          checkoutDate: "2026-12-08",
          status: "confirmada",
        },
      ],
      blocksList: [],
      fairShareResult: null,
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-07",
      flatId: "",
    });
    assert.equal(localFullMaint.isFullOccupancy, true);
    assert.equal(localFullMaint.firstFreeFlat, null);
  });
});

describe("Simplified Mode CRM Inspection (Legacy Email & Inherited Links)", () => {
  it("detects legacy invalid CRM email and sanitizes it cleanly without losing valid tokens", () => {
    const fullyBad = inspectSimpleCrmGuestState({
      guestId: "42",
      guestEmail: "nao-informado",
      companyId: "7",
      companyName: "Petrobras",
      isMonthlyGuest: true,
      autoInvoice: true,
      finRespName: "Carlos Financeiro",
      finRespEmail: "bad@@email",
    });
    assert.equal(fullyBad.isCrmLinked, true);
    assert.equal(fullyBad.hasInvalidGuestEmail, true);
    assert.equal(fullyBad.hasInvalidFinRespEmail, true);
    assert.equal(fullyBad.hasInvalidLegacyEmail, true);
    assert.equal(fullyBad.sanitizedGuestEmail, "");
    assert.equal(fullyBad.sanitizedFinRespEmail, "");
    assert.equal(fullyBad.hasInheritedLinks, true);
    assert.deepEqual(fullyBad.inheritedLinks, [
      "Empresa: Petrobras",
      "Mensalista",
      "NFS-e automática",
      "Resp. Financeiro",
    ]);

    const mixedEmails = inspectSimpleCrmGuestState({
      guestId: "43",
      guestEmail: "valido@empresa.com; quebrado@",
      companyId: "",
      companyName: "",
      isMonthlyGuest: false,
      autoInvoice: false,
      finRespName: "",
      finRespEmail: "",
    });
    assert.equal(mixedEmails.hasInvalidLegacyEmail, true);
    assert.equal(mixedEmails.sanitizedGuestEmail, "valido@empresa.com");
    assert.equal(mixedEmails.hasInheritedLinks, false);

    const unlinkedClean = inspectSimpleCrmGuestState({
      guestId: "manual",
      guestEmail: "",
      companyId: "",
      companyName: "",
      isMonthlyGuest: false,
      autoInvoice: false,
      finRespName: "",
      finRespEmail: "",
    });
    assert.equal(unlinkedClean.isCrmLinked, false);
    assert.equal(unlinkedClean.hasInvalidLegacyEmail, false);
    assert.equal(unlinkedClean.hasInheritedLinks, false);
  });

  it("clears unmodified CRM phone regardless of formatting (+55/mask) on unlink/overwrite while keeping manually changed phone", () => {
    assert.equal(shouldKeepPhoneOnCrmUnlink("(22) 99999-1111", "22999991111"), false);
    assert.equal(shouldKeepPhoneOnCrmUnlink("(22) 99999-1111", "+55 22 99999-1111"), false);
    assert.equal(shouldKeepPhoneOnCrmUnlink("5522999991111", "(22) 99999-1111"), false);
    assert.equal(shouldKeepPhoneOnCrmUnlink("", "22999991111"), false);
    assert.equal(shouldKeepPhoneOnCrmUnlink("(22) 98888-2222", "22999991111"), true);
    assert.equal(shouldKeepPhoneOnCrmUnlink("(22) 98888-2222", ""), true);
  });
});

describe("Channel Switching Integrity (computeChannelTransition)", () => {
  const baseRates = [
    { date: "2026-11-24", rate: 300, channel: "booking" },
    { date: "2026-11-25", rate: 300, channel: "booking" },
  ];

  it("strips auto-injected OTA cleaning fee and resets payment method to pix when leaving booking/airbnb for whatsapp or site", () => {
    const flatsWithAutoCleaning = [
      {
        dailyRates: baseRates,
        charges: [
          { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 57.5, notes: "", autoOtaCleaning: true },
          { id: "p1", type: "pet", title: "Taxa Pet", amount: 40, notes: "" },
        ],
      },
    ];

    for (const target of ["whatsapp", "site"]) {
      const res = computeChannelTransition({
        prevChannel: "booking",
        nextChannel: target,
        isEdit: false,
        currentStatus: "confirmada",
        currentRequesterType: "guest",
        currentInvoiceRecipientType: "guest",
        currentNfHideFromGuest: false,
        nfHideManuallySet: false,
        currentPaymentMethod: "booking",
        currentPaymentStatus: "pago_total",
        currentPaymentsCount: 1,
        isFaturadoBoleto: false,
        b2bPaymentType: "VIRTUAL_CARD",
        hasCompanyLink: false,
        flats: flatsWithAutoCleaning,
      });

      assert.equal(res.nextPaymentMethod, "pix");
      assert.equal(res.nextPaymentStatus, "pago_total");
      assert.equal(res.forceResetSyntheticPayment, true);
      assert.equal(res.shouldClearTariffQuote, true);
      assert.equal(res.nextFlats[0].charges.length, 1);
      assert.equal(res.nextFlats[0].charges[0].type, "pet");
      assert.deepEqual(
        res.nextFlats[0].dailyRates.map((d) => d.channel),
        [target, target]
      );
    }

    // Manually edited cleaning fee (autoOtaCleaning: false) is preserved
    const flatsWithManualCleaning = [
      {
        dailyRates: baseRates,
        charges: [
          { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 75, notes: "", autoOtaCleaning: false },
        ],
      },
    ];
    const manualRes = computeChannelTransition({
      prevChannel: "airbnb",
      nextChannel: "whatsapp",
      isEdit: false,
      currentStatus: "confirmada",
      currentRequesterType: "guest",
      currentInvoiceRecipientType: "guest",
      currentNfHideFromGuest: false,
      nfHideManuallySet: false,
      currentPaymentMethod: "airbnb",
      currentPaymentStatus: "pago_total",
      currentPaymentsCount: 1,
      isFaturadoBoleto: false,
      b2bPaymentType: "VIRTUAL_CARD",
      hasCompanyLink: false,
      flats: flatsWithManualCleaning,
    });
    assert.equal(manualRes.nextFlats[0].charges.length, 1);
    assert.equal(manualRes.nextFlats[0].charges[0].amount, 75);
    assert.equal(manualRes.nextPaymentMethod, "pix");
  });

  it("clears all residual B2B state (requesterType, nfHide, invoiceRecipient, paymentMethod, paymentStatus) when leaving b2b", () => {
    const b2bFlats = [{ dailyRates: baseRates.map((d) => ({ ...d, channel: "b2b" })), charges: [] }];

    for (const target of ["whatsapp", "site", "booking", "airbnb"]) {
      const res = computeChannelTransition({
        prevChannel: "b2b",
        nextChannel: target,
        isEdit: false,
        currentStatus: "confirmada",
        currentRequesterType: "agency_b2b",
        currentInvoiceRecipientType: "agency",
        currentNfHideFromGuest: true,
        nfHideManuallySet: false,
        currentPaymentMethod: "vcn_b2b",
        currentPaymentStatus: "pendente",
        currentPaymentsCount: 0,
        isFaturadoBoleto: false,
        b2bPaymentType: "VIRTUAL_CARD",
        hasCompanyLink: false,
        flats: b2bFlats,
        chargeIdFactory: () => "clean_ota_test",
      });

      assert.equal(res.nextRequesterType, "guest");
      assert.equal(res.nextInvoiceRecipientType, "guest");
      assert.equal(res.nextNfHideFromGuest, false);
      assert.equal(res.shouldCloseVoucherParser, true);
      assert.equal(res.nextPaymentStatus, "pago_total");
      assert.equal(res.forceResetSyntheticPayment, true);

      if (target === "booking" || target === "airbnb") {
        assert.equal(res.nextPaymentMethod, target);
        assert.equal(res.nextFlats[0].charges.length, 1);
        assert.equal(res.nextFlats[0].charges[0].autoOtaCleaning, true);
      } else {
        assert.equal(res.nextPaymentMethod, "pix");
        assert.equal(res.nextFlats[0].charges.length, 0);
      }
    }
  });

  it("forces status from pre_reserva to confirmada when switching to booking or airbnb", () => {
    const preResFlats = [{ dailyRates: baseRates.map((d) => ({ ...d, channel: "whatsapp" })), charges: [] }];

    for (const ota of ["booking", "airbnb"]) {
      const res = computeChannelTransition({
        prevChannel: "whatsapp",
        nextChannel: ota,
        isEdit: false,
        currentStatus: "pre_reserva",
        currentRequesterType: "guest",
        currentInvoiceRecipientType: "guest",
        currentNfHideFromGuest: false,
        nfHideManuallySet: false,
        currentPaymentMethod: "pix",
        currentPaymentStatus: "pendente",
        currentPaymentsCount: 0,
        isFaturadoBoleto: false,
        b2bPaymentType: "VIRTUAL_CARD",
        hasCompanyLink: false,
        flats: preResFlats,
        chargeIdFactory: () => "clean_pre_test",
      });

      assert.equal(res.nextStatus, "confirmada");
      assert.equal(res.nextPaymentMethod, ota);
      assert.equal(res.nextPaymentStatus, "pago_total");
      assert.equal(res.forceResetSyntheticPayment, true);
      assert.equal(res.nextFlats[0].charges[0].autoOtaCleaning, true);
    }
  });

  it("keeps rateioTargetInput in sync when adding/stripping OTA cleaning fee and cleans OTA state when switching booking -> b2b", () => {
    const otaFlats = [
      {
        dailyRates: baseRates, // 600
        charges: [
          { id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 57.5, notes: "", autoOtaCleaning: true },
        ],
        rateioTargetInput: "657.5",
      },
    ];

    const toWhatsapp = computeChannelTransition({
      prevChannel: "booking",
      nextChannel: "whatsapp",
      isEdit: false,
      currentStatus: "confirmada",
      currentRequesterType: "guest",
      currentInvoiceRecipientType: "guest",
      currentNfHideFromGuest: false,
      nfHideManuallySet: false,
      currentPaymentMethod: "booking",
      currentPaymentStatus: "pago_total",
      currentPaymentsCount: 1,
      isFaturadoBoleto: false,
      b2bPaymentType: "VIRTUAL_CARD",
      hasCompanyLink: false,
      flats: otaFlats,
    });
    assert.equal(toWhatsapp.nextFlats[0].charges.length, 0);
    assert.equal(toWhatsapp.nextFlats[0].rateioTargetInput, "600");

    const toB2b = computeChannelTransition({
      prevChannel: "booking",
      nextChannel: "b2b",
      isEdit: false,
      currentStatus: "confirmada",
      currentRequesterType: "guest",
      currentInvoiceRecipientType: "guest",
      currentNfHideFromGuest: false,
      nfHideManuallySet: false,
      currentPaymentMethod: "booking",
      currentPaymentStatus: "pago_total",
      currentPaymentsCount: 1,
      isFaturadoBoleto: false,
      b2bPaymentType: "VIRTUAL_CARD",
      hasCompanyLink: false,
      flats: otaFlats,
    });
    assert.equal(toB2b.nextFlats[0].charges.length, 0);
    assert.equal(toB2b.nextFlats[0].rateioTargetInput, "600");
    assert.equal(toB2b.nextRequesterType, "agency_b2b");
    assert.equal(toB2b.nextInvoiceRecipientType, "agency");
    assert.equal(toB2b.nextNfHideFromGuest, true);
    assert.equal(toB2b.nextPaymentMethod, "vcn_b2b");
    assert.equal(toB2b.nextPaymentStatus, "pendente");
    assert.equal(toB2b.forceResetSyntheticPayment, true);

    const backToAirbnb = computeChannelTransition({
      prevChannel: "whatsapp",
      nextChannel: "airbnb",
      isEdit: false,
      currentStatus: "confirmada",
      currentRequesterType: "guest",
      currentInvoiceRecipientType: "guest",
      currentNfHideFromGuest: false,
      nfHideManuallySet: false,
      currentPaymentMethod: "pix",
      currentPaymentStatus: "pago_total",
      currentPaymentsCount: 1,
      isFaturadoBoleto: false,
      b2bPaymentType: "VIRTUAL_CARD",
      hasCompanyLink: false,
      flats: toWhatsapp.nextFlats,
      chargeIdFactory: () => "clean_readd_test",
    });
    assert.equal(backToAirbnb.nextFlats[0].charges.length, 1);
    assert.equal(backToAirbnb.nextFlats[0].charges[0].amount, 50);
    assert.equal(backToAirbnb.nextFlats[0].rateioTargetInput, "650");
  });
});

describe("Backend GET /api/pms/tariff-quote & Twin-Server Parity", () => {
  const PORT = 3997;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const dbPath = path.resolve("data/database.json");
  const isolatedDbPath = path.resolve("data/test-simplified-reservation.json");
  let serverProcess = null;

  before(async () => {
    const rawDb = fs.readFileSync(dbPath, "utf8");
    fs.writeFileSync(isolatedDbPath, rawDb, "utf8");

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "test",
        DATABASE_FILE: isolatedDbPath,
        DATABASE_URL: "",
      },
      stdio: "pipe",
    });

    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/tariffs/settings`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(ready, true, "Test server failed to become ready");
  });

  after(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
    }
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch {}
  });

  it("returns accurate Booking quote (Sem Café vs Com Café for 1 and 2 guests)", async () => {
    const rSem1 = await fetch(
      `${BASE_URL}/api/pms/tariff-quote?checkin=2026-11-24&checkout=2026-11-26&channel=booking&guests=1&includeBreakfast=false`
    );
    assert.equal(rSem1.status, 200);
    const qSem1 = await rSem1.json();
    assert.equal(qSem1.success, true);
    assert.equal(qSem1.nights, 2);
    assert.equal(qSem1.channel, "booking");
    assert.equal(qSem1.includeBreakfast, false);
    assert.ok(qSem1.avgDailyRate > 0, "avgDailyRate must be positive");
    assert.ok(qSem1.cleaningFee > 0, "Sem Café should have active cleaning fee");
    assert.equal(
      round2Money(qSem1.nightsSubtotal + qSem1.cleaningFee),
      qSem1.totalAmount
    );

    const rCom1 = await fetch(
      `${BASE_URL}/api/pms/tariff-quote?checkin=2026-11-24&checkout=2026-11-26&channel=booking&guests=1&includeBreakfast=true`
    );
    const qCom1 = await rCom1.json();
    assert.equal(qCom1.success, true);
    assert.equal(qCom1.includeBreakfast, true);
    assert.equal(qCom1.cleaningFee, 0, "Com Café should default cleaningFee to 0");
    assert.equal(
      round2Money(qCom1.dailyRates[0].rate - qSem1.dailyRates[0].rate),
      qCom1.breakfastSurchargePerGuest
    );

    const rCom2 = await fetch(
      `${BASE_URL}/api/pms/tariff-quote?checkin=2026-11-24&checkout=2026-11-26&channel=booking&guests=2&includeBreakfast=true`
    );
    const qCom2 = await rCom2.json();
    assert.equal(qCom2.success, true);
    assert.equal(qCom2.guests, 2);
    assert.equal(
      round2Money(qCom2.dailyRates[0].rate - qCom1.dailyRates[0].rate),
      qCom2.breakfastSurchargePerGuest
    );
  });

  it("handles Airbnb, month-boundary spans, weekend markup, and 7+ night stay discounts", async () => {
    // 2026-11-26 (Thu) -> 2026-12-01 (Tue): crosses Nov->Dec and includes Fri(27) + Sat(28)
    const rSpan = await fetch(
      `${BASE_URL}/api/pms/tariff-quote?checkin=2026-11-26&checkout=2026-12-01&channel=airbnb&guests=2&includeBreakfast=false`
    );
    assert.equal(rSpan.status, 200);
    const qSpan = await rSpan.json();
    assert.equal(qSpan.nights, 5);
    assert.equal(qSpan.channel, "airbnb");
    assert.deepEqual(
      qSpan.dailyRates.map((d) => d.date),
      ["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"]
    );
    assert.equal(qSpan.hasMixedNightRates, true, "Thu vs Fri/Sat should produce mixed night rates");
    assert.ok(qSpan.dailyRates[1].rate > qSpan.dailyRates[0].rate, "Friday rate should include weekend markup");

    // 7 nights stay discount check
    const rWeek = await fetch(
      `${BASE_URL}/api/pms/tariff-quote?checkin=2026-11-10&checkout=2026-11-17&channel=booking&guests=1&includeBreakfast=false`
    );
    const qWeek = await rWeek.json();
    assert.equal(qWeek.nights, 7);
    assert.ok(qWeek.stayDiscountPct >= 0);
    assert.equal(round2Money(qWeek.nightsSubtotal + qWeek.cleaningFee), qWeek.totalAmount);
  });

  it("rejects invalid, reversed, same-day, and overly long date ranges with HTTP 400", async () => {
    const badCases = [
      "checkin=2026-11-25&checkout=2026-11-25&channel=booking",
      "checkin=2026-11-26&checkout=2026-11-24&channel=booking",
      "checkin=2026-02-30&checkout=2026-03-02&channel=airbnb",
      "checkin=invalid&checkout=2026-11-26&channel=booking",
      "checkin=2026-01-01&checkout=2028-01-01&channel=booking",
    ];
    for (const qs of badCases) {
      const res = await fetch(`${BASE_URL}/api/pms/tariff-quote?${qs}`);
      assert.equal(res.status, 400, `Expected 400 for query: ${qs}`);
      const body = await res.json();
      assert.ok(body.error, `Expected error code for query: ${qs}`);
    }
  });

  it("returns valid Fair-Share stats from GET /api/pms/fair-share-flat compatible with Simplified Mode helpers", async () => {
    const res = await fetch(
      `${BASE_URL}/api/pms/fair-share-flat?checkin=2027-06-10&checkout=2027-06-12`
    );
    assert.equal(res.status, 200);
    const fsJson = await res.json();
    assert.ok(Array.isArray(fsJson.allStats));
    assert.ok(fsJson.allStats.length > 0);
    const enriched = { ...fsJson, _checkin: "2027-06-10", _checkout: "2027-06-12" };

    const avail = evaluateSimpleFlatAvailability({
      flatsList: fsJson.allStats.map((s) => s.flat),
      reservationsList: [],
      blocksList: [],
      fairShareResult: enriched,
      checkinDate: "2027-06-10",
      checkoutDate: "2027-06-12",
      flatId: enriched.bestFlatId ? String(enriched.bestFlatId) : "",
    });
    assert.equal(avail.matchingFairShare, enriched);
    assert.equal(avail.isFullOccupancy, enriched.availableCount === 0);

    const decision = resolveFairShareFlatAllocation({
      mode: "simple",
      isEdit: false,
      currentFlatId: "",
      isFlatManuallyChanged: false,
      fairShareResult: enriched,
      expectedCheckin: "2027-06-10",
      expectedCheckout: "2027-06-12",
    });
    if (enriched.availableCount > 0) {
      assert.equal(decision.action, "select_auto");
      assert.equal(decision.nextFlatId, String(enriched.bestFlatId));
    } else {
      assert.equal(decision.action, "clear_full_occupancy");
    }
  });

  it("maintains 100% SHA-256 twin-server parity for demo-server.mjs", () => {
    const artHash = sha256(path.resolve("artifacts/api-server/demo-server.mjs"));
    const scrHash = sha256(path.resolve("scripts/demo-server.mjs"));
    assert.equal(artHash, scrHash);
  });
});
