/**
 * Strictly scoped unit test suite for Duplicar Reserva (Quick-Duplicate Reservation).
 * Run ONLY via:
 *   node --experimental-strip-types --test tests/duplicate-reservation.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  addDaysIso,
  diffNightsIso,
  extractOriginalNights,
  extractOriginalCharges,
  extractOriginalDailyRate,
  extractOriginalChannel,
  resolveInitialDuplicatePaymentMode,
  extractOriginalNotesBundle,
  getFlatBusyNightsSet,
  evaluateDuplicateSlotAvailability,
  computeDuplicateSlotTotal,
  buildDuplicateReservationPayload,
} from "../artifacts/limpeza/src/lib/duplicate-reservation.ts";

describe("duplicate-reservation helpers", () => {
  it("computes UTC-safe ISO dates and original stay nights accurately", () => {
    assert.equal(addDaysIso("2026-11-24", 1), "2026-11-25");
    assert.equal(addDaysIso("2026-11-30", 2), "2026-12-02");
    assert.equal(diffNightsIso("2026-11-24", "2026-11-27"), 3);
    assert.equal(
      extractOriginalNights({ checkinDate: "2026-11-24", checkoutDate: "2026-11-25" }),
      1
    );
    assert.equal(
      extractOriginalNights({ checkinDate: "2026-11-24", checkoutDate: "2026-11-28" }),
      4
    );
  });

  it("preserves exact daily rate and extra fees without overwriting by dynamic tariff", () => {
    const res = {
      checkinDate: "2026-11-24",
      checkoutDate: "2026-11-26",
      dailyRate: 235,
      dailyRates: [
        { date: "2026-11-24", rate: 240, channel: "whatsapp" },
        { date: "2026-11-25", rate: 240, channel: "whatsapp" },
      ],
      charges: [{ id: "c1", type: "cleaning", title: "Taxa de Limpeza", amount: 50 }],
      petFee: 40,
      totalAmount: 570,
    };
    const charges = extractOriginalCharges(res);
    assert.equal(charges.length, 2);
    assert.equal(charges[0].type, "cleaning");
    assert.equal(charges[1].type, "pet");

    const rate = extractOriginalDailyRate(res, charges);
    assert.equal(rate, 240);

    const calc3Nights = computeDuplicateSlotTotal("2026-12-01", "2026-12-04", rate, charges);
    assert.equal(calc3Nights.nights, 3);
    assert.equal(calc3Nights.nightsTotal, 720);
    assert.equal(calc3Nights.chargesTotal, 90);
    assert.equal(calc3Nights.total, 810);
  });

  it("inherits payment mode from original and normalizes checked-in/checked-out/cancelled statuses", () => {
    assert.equal(
      resolveInitialDuplicatePaymentMode({
        status: "checkout",
        channel: "whatsapp",
        paymentStatus: "pago_total",
        totalAmount: 250,
        paidAmount: 250,
      }),
      "confirmed_paid"
    );

    assert.equal(
      resolveInitialDuplicatePaymentMode({
        status: "in_house",
        channel: "whatsapp",
        paymentStatus: "pendente",
        totalAmount: 250,
        paidAmount: 0,
      }),
      "confirmed_pending"
    );

    assert.equal(
      resolveInitialDuplicatePaymentMode({
        status: "expirada",
        channel: "whatsapp",
        paymentStatus: "pendente",
        totalAmount: 250,
        paidAmount: 0,
      }),
      "pre_reserva"
    );

    assert.equal(
      resolveInitialDuplicatePaymentMode({
        status: "confirmada",
        channel: "b2b",
        isFaturadoBoleto: true,
        b2bPaymentType: "FATURADO",
      }),
      "faturado"
    );
  });

  it("detects flat conflicts (existing reservation + multi-period self-overlap) and suggests free Fair Share flat", () => {
    const flats = [
      { id: 1, number: "302", isActive: true },
      { id: 2, number: "204", isActive: true },
      { id: 3, number: "405", isActive: true },
    ];
    const reservations = [
      {
        id: 10,
        flatId: 1,
        flatNumber: "302",
        guestName: "Maria Silva",
        checkinDate: "2026-11-26",
        checkoutDate: "2026-11-28",
        status: "confirmada",
      },
    ];
    const fairShareResult = {
      _checkin: "2026-11-26",
      _checkout: "2026-11-27",
      bestFlatId: 3,
      bestFlatNumber: "405",
      allStats: [
        { flat: flats[0], isAvailable: false },
        { flat: flats[1], isAvailable: true },
        { flat: flats[2], isAvailable: true },
      ],
    };

    const slot1 = {
      uid: "s1",
      checkinDate: "2026-11-26",
      checkoutDate: "2026-11-27",
      flatId: "1",
      flatManuallyChosen: false,
    };

    const avail = evaluateDuplicateSlotAvailability({
      slot: slot1,
      otherSlots: [],
      originalFlatId: "1",
      flats,
      reservations,
      blocks: [],
      fairShareResult,
    });

    assert.equal(avail.isAvailable, false);
    assert.equal(avail.conflictSource, "reservation");
    assert.match(avail.conflictLabel || "", /Maria Silva/);
    assert.deepEqual(avail.suggestedFlat, { id: "3", number: "405" });

    // Multi-period overlap against another slot in the same duplication batch
    const slot2 = {
      uid: "s2",
      checkinDate: "2026-12-03",
      checkoutDate: "2026-12-05",
      flatId: "1",
      flatManuallyChosen: false,
    };
    const slot3Overlap = {
      uid: "s3",
      checkinDate: "2026-12-04",
      checkoutDate: "2026-12-06",
      flatId: "1",
      flatManuallyChosen: false,
    };
    const overlapAvail = evaluateDuplicateSlotAvailability({
      slot: slot3Overlap,
      otherSlots: [slot2],
      originalFlatId: "1",
      flats,
      reservations: [],
      blocks: [],
    });
    assert.equal(overlapAvail.isAvailable, false);
    assert.equal(overlapAvail.conflictSource, "slot_overlap");
    assert.equal(overlapAvail.suggestedFlat?.id, "2");

    // Busy nights set marks occupied nights for visual mini-calendar
    const busy = getFlatBusyNightsSet({
      flatId: "1",
      flats,
      reservations,
      blocks: [],
      otherSlots: [slot2],
    });
    assert.equal(busy.has("2026-11-26"), true);
    assert.equal(busy.has("2026-11-27"), true);
    assert.equal(busy.has("2026-11-28"), false); // checkout day is free for new check-in
    assert.equal(busy.has("2026-12-03"), true);
    assert.equal(busy.has("2026-12-04"), true);
    assert.equal(busy.has("2026-12-05"), false);
  });

  it("builds a clean payload: copies profile/companions/company/vehicle/prefs, strips package/external/old-stay fields, clears notes unless pulled", () => {
    const sourceRes = {
      id: 605,
      code: "RES-302-0605",
      packageId: "PKG-99",
      packageCode: "PKG-99",
      flatId: 1,
      flatNumber: "302",
      checkinDate: "2026-11-24",
      checkoutDate: "2026-11-25",
      checkinTime: "15:00",
      checkoutTime: "11:00",
      status: "checkout",
      checkoutDone: true,
      actualCheckoutAt: "2026-11-25T10:30:00Z",
      earlyCheckinAuthorized: true,
      fnhrCompleted: true,
      fnrhDocumentUuid: "uuid-old",
      pixTxId: "OLD_TX",
      pixEndToEndId: "OLD_E2E",
      externalOrderId: "BOOKING-99999",
      b2bLocatorRloc: "RLOC99",
      b2bVcnToken: "VCN-SECRET",
      voucherUrl: "https://old.voucher/123",
      channel: "booking",
      guestId: 42,
      guestName: "João Frequente",
      guestPhone: "22999998888",
      guestEmail: "joao@empresa.com",
      guestDocument: "12345678901",
      guestCount: 2,
      guests: [
        { guestId: 42, name: "João Frequente", cpf: "12345678901", phone: "22999998888", fnhrCompleted: true },
        { guestId: 43, name: "Ana Acompanhante", cpf: "98765432100", phone: "22988887777", fnhrCompleted: true },
      ],
      companyId: 7,
      companyName: "Empresa Frequente Ltda",
      companyCnpj: "12345678000199",
      includeBreakfast: true,
      twinBeds: true,
      prefersHighFloor: true,
      isFlatLocked: true,
      vehicle: { plate: "ABC1D23", brand: "Toyota", model: "Corolla", color: "Prata" },
      notes: "Chegou tarde na viagem passada",
      receptionNotes: "Entregar chave extra",
      specialRequests: "Berço",
      dailyRate: 260,
      cleaningFee: 50,
      totalAmount: 310,
      paidAmount: 310,
      paymentStatus: "pago_total",
    };

    const notesInfo = extractOriginalNotesBundle(sourceRes);
    assert.equal(notesInfo.hasAny, true);
    assert.equal(extractOriginalChannel(sourceRes), "booking");

    const payload = buildDuplicateReservationPayload({
      sourceRes,
      slot: {
        uid: "s1",
        checkinDate: "2026-11-26",
        checkoutDate: "2026-11-28",
        flatId: "1",
        flatManuallyChosen: false,
      },
      dailyRate: 260,
      charges: extractOriginalCharges(sourceRes),
      includeBreakfast: true,
      channel: "booking",
      paymentMode: "confirmed_paid",
      paymentMethod: "booking",
      holdPreset: "until_2359",
      notes: "",
      receptionNotes: "",
      specialRequests: "",
    });

    // Must keep profile, companions, company, vehicle, preferences
    assert.equal(payload.guestId, 42);
    assert.equal(payload.guestName, "João Frequente");
    assert.equal(payload.guests.length, 2);
    assert.equal(payload.guests[1].name, "Ana Acompanhante");
    assert.equal("fnhrCompleted" in payload.guests[0], false);
    assert.equal(payload.companyId, 7);
    assert.equal(payload.companyName, "Empresa Frequente Ltda");
    assert.equal(payload.includeBreakfast, true);
    assert.equal(payload.twinBeds, true);
    assert.equal(payload.prefersHighFloor, true);
    assert.equal(payload.isFlatLocked, true);
    assert.equal(payload.checkinTime, "15:00");
    assert.equal(payload.checkoutTime, "11:00");
    assert.equal(payload.vehicle?.plate, "ABC1D23");

    // Must recompute 2 nights * 260 + 50 cleaning = 570
    assert.equal(payload.dailyRates.length, 2);
    assert.equal(payload.dailyRates[0].date, "2026-11-26");
    assert.equal(payload.dailyRates[1].date, "2026-11-27");
    assert.equal(payload.totalAmount, 570);
    assert.equal(payload.paidAmount, 570);
    assert.equal(payload.status, "confirmada");
    assert.equal(payload.paymentStatus, "pago_total");
    assert.equal(payload.payments.length, 1);

    // Must NEVER copy package, external locators, old stay flags, or unpulled notes
    assert.equal(payload.packageId, undefined);
    assert.equal(payload.packageCode, undefined);
    assert.equal(payload.externalOrderId, undefined);
    assert.equal(payload.b2bLocatorRloc, undefined);
    assert.equal(payload.b2bVcnToken, undefined);
    assert.equal(payload.voucherUrl, undefined);
    assert.equal(payload.pixTxId, undefined);
    assert.equal(payload.pixEndToEndId, undefined);
    assert.equal(payload.earlyCheckinAuthorized, false);
    assert.equal(payload.notes, "");
    assert.equal(payload.receptionNotes, "");
    assert.equal(payload.specialRequests, "");

    // Must stamp audit origin
    assert.equal(payload.duplicatedFromId, 605);
    assert.equal(payload.duplicatedFromCode, "RES-302-0605");
    assert.equal(payload.source, "PMS Duplicação (de #RES-302-0605)");
  });
});
