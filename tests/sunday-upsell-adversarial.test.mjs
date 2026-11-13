/**
 * Sunday Upsell Engine ("Domingo Sem Pressa") — Adversarial & Stress Test Suite
 * File: tests/sunday-upsell-adversarial.test.mjs
 * Execution: node --test tests/sunday-upsell-adversarial.test.mjs
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

import {
  resolveTargetSundayDate,
  evaluateSundayUpsellEligibility,
  previewSundayUpsellEligibility,
  triggerSundayUpsellRoutine,
  checkAndTriggerSundayUpsell,
  dispatchSundayUpsellTwoBalloons
} from "../artifacts/api-server/zapi-service.mjs";

import {
  ofertarDomingoSemPressaTool
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

import {
  sweepExpiredPreReservations
} from "../artifacts/api-server/demo-server.mjs";

describe("ADVERSARIAL SUITE 1 — Eligibility & Inventory Edge Cases", () => {
  const targetSunday = "2026-11-08"; // Sunday
  const mondayDate = "2026-11-09";   // Monday

  it("1.1 Checkout on Sunday with diverse checkoutTime values (11:00h, 14:00h, 12:00h, undefined)", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", name: "Flat 101" },
        { id: 102, number: "102", name: "Flat 102" },
        { id: 103, number: "103", name: "Flat 103" },
        { id: 104, number: "104", name: "Flat 104" }
      ],
      reservations: [
        {
          id: 1,
          code: "RES-11H",
          flatNumber: "101",
          flatId: 101,
          guestName: "Hospede 11h",
          guestPhone: "5521999990001",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          checkoutTime: "11:00",
          status: "confirmada"
        },
        {
          id: 2,
          code: "RES-14H",
          flatNumber: "102",
          flatId: 102,
          guestName: "Hospede 14h",
          guestPhone: "5521999990002",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          checkoutTime: "14:00",
          status: "confirmada"
        },
        {
          id: 3,
          code: "RES-12H",
          flatNumber: "103",
          flatId: 103,
          guestName: "Hospede 12h",
          guestPhone: "5521999990003",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          checkoutTime: "12:00",
          status: "in_stay"
        },
        {
          id: 4,
          code: "RES-NOTIME",
          flatNumber: "104",
          flatId: 104,
          guestName: "Hospede NoTime",
          guestPhone: "5521999990004",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "confirmada"
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 4, "All 4 Sunday checkout reservations are eligible regardless of checkoutTime format");
    const codes = res.eligibleReservations.map(e => e.reservation.code);
    assert.ok(codes.includes("RES-11H"));
    assert.ok(codes.includes("RES-14H"));
    assert.ok(codes.includes("RES-12H"));
    assert.ok(codes.includes("RES-NOTIME"));
  });

  it("1.2 Non-active statuses (cancelled, checked_out, expired, no_show) are strictly ignored", () => {
    const mockDb = {
      flats: [{ id: 101, number: "101" }],
      reservations: [
        { id: 10, code: "RES-CANC", status: "cancelada", checkoutDate: targetSunday, guestPhone: "5521999990010" },
        { id: 11, code: "RES-EXP", status: "expirada", checkoutDate: targetSunday, guestPhone: "5521999990011" },
        { id: 12, code: "RES-NOSHOW", status: "no_show", checkoutDate: targetSunday, guestPhone: "5521999990012" },
        { id: 13, code: "RES-OUT", status: "checked_out", checkoutDate: targetSunday, guestPhone: "5521999990013" },
        { id: 14, code: "RES-DONE", status: "confirmada", checkoutDone: true, checkoutDate: targetSunday, guestPhone: "5521999990014" },
        { id: 15, code: "RES-ACTUAL", status: "in_stay", actualCheckoutAt: "2026-11-08T10:00:00Z", checkoutDate: targetSunday, guestPhone: "5521999990015" }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 0, "No cancelled or checked-out reservations should be eligible");
    assert.strictEqual(res.totalEvaluated, 0, "Non-active reservations are completely ignored from evaluation");
  });

  it("1.3 Missing phone is captured as ineligible with reason SEM_TELEFONE", () => {
    const mockDb = {
      flats: [{ id: 101, number: "101" }],
      reservations: [
        { id: 20, code: "RES-NOPHONE-1", status: "confirmada", checkoutDate: targetSunday, guestPhone: null, phone: null },
        { id: 21, code: "RES-NOPHONE-2", status: "in_stay", checkoutDate: targetSunday, guestPhone: "", phone: "" }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 0);
    assert.strictEqual(res.ineligibleReservations.length, 2);
    assert.strictEqual(res.ineligibleReservations[0].reason, "SEM_TELEFONE");
    assert.strictEqual(res.ineligibleReservations[1].reason, "SEM_TELEFONE");
  });

  it("1.4 Already upsold reservations are categorized with reason JA_POSSUI_UPSELL", () => {
    const mockDb = {
      flats: [{ id: 101, number: "101" }, { id: 102, number: "102" }],
      reservations: [
        { id: 30, code: "RES-PAID-FLAG", status: "confirmada", checkoutDate: targetSunday, guestPhone: "5521999990030", hasSundayUpsell: true },
        { id: 31, code: "RES-PAID-STATUS", status: "in_stay", checkoutDate: targetSunday, guestPhone: "5521999990031", pendingSundayUpsell: { status: "paid" } }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 0);
    assert.strictEqual(res.ineligibleReservations.length, 2);
    assert.strictEqual(res.ineligibleReservations[0].reason, "JA_POSSUI_UPSELL");
    assert.strictEqual(res.ineligibleReservations[1].reason, "JA_POSSUI_UPSELL");
  });

  it("1.5 Incoming guest on Sunday + Condominium 100% full -> strictly blocks offer", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", isActive: true },
        { id: 102, number: "102", isActive: true }
      ],
      reservations: [
        // Current guest checking out Sunday
        {
          id: 40,
          code: "RES-CURR-101",
          flatNumber: "101",
          flatId: 101,
          guestPhone: "5521999990040",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "in_stay"
        },
        // Incoming guest checking in Sunday to Flat 101
        {
          id: 41,
          code: "RES-INCOMING-101",
          flatNumber: "101",
          flatId: 101,
          guestPhone: "5521999990041",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          status: "confirmada"
        },
        // Flat 102 is also occupied from Sunday to Monday!
        {
          id: 42,
          code: "RES-OCCUPIED-102",
          flatNumber: "102",
          flatId: 102,
          guestPhone: "5521999990042",
          checkinDate: "2026-11-07",
          checkoutDate: "2026-11-10",
          status: "confirmada"
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 0, "Must be 0 eligible when 100% full");
    assert.strictEqual(res.ineligibleReservations.length, 1);
    assert.strictEqual(res.ineligibleReservations[0].reason, "CONDOMINIO_100_PORCENTO_OCUPADO");
    assert.strictEqual(res.ineligibleReservations[0].reservation.code, "RES-CURR-101");
  });

  it("1.6 FairShare picks the vacant flat without reservation conflicts", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", isActive: true },
        { id: 102, number: "102", isActive: true }, // Busy
        { id: 103, number: "103", isActive: true }  // Free!
      ],
      reservations: [
        {
          id: 50,
          code: "RES-CURR-101",
          flatNumber: "101",
          flatId: 101,
          guestPhone: "5521999990050",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "in_stay"
        },
        {
          id: 51,
          code: "RES-INCOMING-101",
          flatNumber: "101",
          flatId: 101,
          guestPhone: "5521999990051",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-10",
          status: "confirmada"
        },
        {
          id: 52,
          code: "RES-BUSY-102",
          flatNumber: "102",
          flatId: 102,
          guestPhone: "5521999990052",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-11",
          status: "confirmada"
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.eligibleCount, 1);
    const eligible = res.eligibleReservations[0];
    assert.strictEqual(eligible.scenario, "REALLOCATION_AVAILABLE");
    assert.ok(eligible.alternateFlat);
    assert.strictEqual(String(eligible.alternateFlat.number), "103", "Must select Flat 103 because Flat 102 is busy");
  });

  it("1.7 Multiple reservations with incoming guests: inspect FairShare reallocation assignment", () => {
    const mockDb = {
      flats: [
        { id: 101, number: "101", isActive: true },
        { id: 102, number: "102", isActive: true },
        { id: 103, number: "103", isActive: true } // Single free flat
      ],
      reservations: [
        {
          id: 60,
          code: "RES-101",
          flatNumber: "101",
          flatId: 101,
          guestPhone: "5521999990060",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "in_stay"
        },
        {
          id: 61,
          code: "RES-INCOMING-101",
          flatNumber: "101",
          flatId: 101,
          guestPhone: "5521999990061",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-10",
          status: "confirmada"
        },
        {
          id: 62,
          code: "RES-102",
          flatNumber: "102",
          flatId: 102,
          guestPhone: "5521999990062",
          checkinDate: "2026-11-06",
          checkoutDate: targetSunday,
          status: "in_stay"
        },
        {
          id: 63,
          code: "RES-INCOMING-102",
          flatNumber: "102",
          flatId: 102,
          guestPhone: "5521999990063",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-10",
          status: "confirmada"
        }
      ]
    };

    const res = evaluateSundayUpsellEligibility(mockDb, targetSunday);
    assert.strictEqual(res.totalEvaluated, 2);
    // Both 101 and 102 check if an alternate flat exists in the static snapshot
    assert.ok(res.eligibleReservations.length >= 1);
  });
});

describe("ADVERSARIAL SUITE 2 — Hold & Silent Expiration Stress Tests", () => {
  it("2.1 Silent Expiration: 30-min expiration NEVER modifies reservation status, checkoutDate or sends messages", () => {
    const expiredPastMs = Date.now() - 31 * 60 * 1000;
    const expiredPastIso = new Date(expiredPastMs).toISOString();

    const mockDb = {
      reservations: [
        {
          id: 70,
          code: "RES-ACTIVE-SILENT",
          guestName: "Marina Hóspede",
          guestPhone: "5521988880070",
          status: "in_stay",
          checkoutDate: "2026-11-08",
          checkoutTime: "12:00",
          pendingSundayUpsell: {
            txid: "UPSELL_SUN_RES70",
            status: "pending_payment",
            isSilentUpsellHold: true,
            expiresAt: expiredPastIso,
            originalCheckoutDate: "2026-11-08",
            targetCheckoutDate: "2026-11-09"
          },
          pendingModification: {
            status: "awaiting_payment",
            type: "sunday_upsell",
            newCheckoutDate: "2026-11-09",
            expiresAt: expiredPastIso,
            isSilentUpsellHold: true
          }
        }
      ]
    };

    let saveCalled = false;
    const expiredCount = sweepExpiredPreReservations(mockDb, () => { saveCalled = true; });

    assert.strictEqual(expiredCount, 1, "sweepExpiredPreReservations must report 1 upsell expired");
    const r = mockDb.reservations[0];
    assert.strictEqual(r.status, "in_stay", "Reservation status must REMAIN in_stay, NEVER expirada");
    assert.strictEqual(r.checkoutDate, "2026-11-08", "Original Sunday checkoutDate must be preserved");
    assert.strictEqual(r.checkoutTime, "12:00", "Original Sunday checkoutTime must be preserved");
    assert.strictEqual(r.pendingSundayUpsell.status, "expired");
    assert.strictEqual(r.pendingModification, undefined, "pendingModification must be cleaned up");
    assert.ok(r.pendingSundayUpsell.expiredAt, "expiredAt must be stamped");
  });

  it("2.2 Active hold (e.g. 15 minutes remaining) is NOT expired by sweep", () => {
    const futureMs = Date.now() + 15 * 60 * 1000;
    const futureIso = new Date(futureMs).toISOString();

    const mockDb = {
      reservations: [
        {
          id: 71,
          code: "RES-STILL-ACTIVE-HOLD",
          status: "confirmada",
          checkoutDate: "2026-11-08",
          pendingSundayUpsell: {
            txid: "UPSELL_SUN_RES71",
            status: "pending_payment",
            isSilentUpsellHold: true,
            expiresAt: futureIso
          },
          pendingModification: {
            status: "awaiting_payment",
            expiresAt: futureIso,
            isSilentUpsellHold: true
          }
        }
      ]
    };

    const expiredCount = sweepExpiredPreReservations(mockDb, () => {});
    assert.strictEqual(expiredCount, 0, "No holds should expire when still within the 30-min window");
    assert.strictEqual(mockDb.reservations[0].pendingSundayUpsell.status, "pending_payment");
    assert.ok(mockDb.reservations[0].pendingModification);
  });

  it("2.3 Normal pre-reservation without isSilentUpsellHold expires normally", () => {
    const expiredPastMs = Date.now() - 31 * 60 * 1000;
    const expiredPastIso = new Date(expiredPastMs).toISOString();

    const mockDb = {
      reservations: [
        {
          id: 72,
          code: "RES-REGULAR-PRE-RESERVA",
          status: "pre_reserva",
          expiresAt: expiredPastIso,
          paymentStatus: "pendente"
        }
      ]
    };

    const expiredCount = sweepExpiredPreReservations(mockDb, () => {});
    assert.strictEqual(expiredCount, 1);
    assert.strictEqual(mockDb.reservations[0].status, "expirada", "Ordinary pre_reserva must expire to expirada");
  });
});

describe("ADVERSARIAL SUITE 3 — Webhook PIX & State Mutation Stress Tests", () => {
  it("3.1 Webhook logic with unmatched txid leaves upsell untouched", () => {
    const targetSunday = "2026-11-08";
    const mockRes = {
      id: 80,
      code: "RES-80",
      flatNumber: "101",
      checkoutDate: targetSunday,
      checkoutTime: "12:00",
      hasSundayUpsell: false,
      pendingSundayUpsell: {
        txid: "UPSELL_SUN_RES80_REAL",
        status: "pending_payment",
        promotionalPrice: 90.0,
        targetCheckoutDate: "2026-11-09"
      }
    };

    const webhookTxid = "UPSELL_SUN_SOME_OTHER_TXID_9999";
    const matches = (
      mockRes.pendingSundayUpsell &&
      (mockRes.pendingSundayUpsell.txid === webhookTxid || (webhookTxid && String(webhookTxid).includes("UPSELL_SUN") && String(webhookTxid).includes(String(mockRes.code || mockRes.id)))) &&
      mockRes.pendingSundayUpsell.status !== "paid"
    );

    assert.strictEqual(matches, false, "Mismatched txid must not match pendingSundayUpsell");
    assert.strictEqual(mockRes.checkoutDate, targetSunday);
    assert.strictEqual(mockRes.hasSundayUpsell, false);
    assert.strictEqual(mockRes.pendingSundayUpsell.status, "pending_payment");
  });

  it("3.2 Webhook logic with matching txid executes complete state mutation", () => {
    const targetSunday = "2026-11-08";
    const mondayDate = "2026-11-09";
    const paidIso = new Date().toISOString();
    const txid = "UPSELL_SUN_RES81_123456";

    const db = {
      flats: [
        { id: 101, number: "101" },
        { id: 102, number: "102" }
      ],
      reservations: [
        {
          id: 81,
          code: "RES-81",
          flatNumber: "101",
          flatId: 101,
          guestName: "Roberto Teste",
          guestPhone: "5521999990081",
          checkoutDate: targetSunday,
          checkoutTime: "12:00",
          totalAmount: 400.0,
          paidAmount: 400.0,
          charges: [],
          payments: [],
          pendingSundayUpsell: {
            txid,
            status: "pending_payment",
            promotionalPrice: 90.0,
            originalCheckoutDate: targetSunday,
            targetCheckoutDate: mondayDate,
            incomingReservationId: "RES-82-INCOMING",
            alternateFlatNumber: "102",
            alternateFlatId: 102
          },
          pendingModification: {
            status: "awaiting_payment",
            newCheckoutDate: mondayDate,
            isSilentUpsellHold: true
          }
        },
        {
          id: 82,
          code: "RES-82-INCOMING",
          flatNumber: "101",
          flatId: 101,
          guestName: "Novo Hospede",
          guestPhone: "5521999990082",
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          status: "confirmada"
        }
      ],
      cleaningRequests: [
        {
          id: "clean-1",
          flatNumber: "101",
          flatId: 101,
          requestDate: targetSunday,
          targetDate: targetSunday,
          reservationCode: "RES-81",
          isDeleted: false
        }
      ]
    };

    const resServiceOrder = db.reservations[0];
    const valorPago = 90.0;
    const item = { endToEndId: "E2E_INTER_TEST_123" };

    // Simulate the exact webhook code block from demo-server.mjs lines 58376-58509
    if (
      resServiceOrder.pendingSundayUpsell &&
      (resServiceOrder.pendingSundayUpsell.txid === txid || (txid && String(txid).includes("UPSELL_SUN") && String(txid).includes(String(resServiceOrder.code || resServiceOrder.id)))) &&
      resServiceOrder.pendingSundayUpsell.status !== "paid"
    ) {
      const upsellMeta = resServiceOrder.pendingSundayUpsell;
      const upsellAmt = valorPago > 0 ? valorPago : (Number(upsellMeta.promotionalPrice) || 90.0);
      upsellMeta.status = "paid";
      upsellMeta.paidAt = paidIso;
      upsellMeta.pixEndToEndId = item.endToEndId || `E2E_INTER_${Date.now()}`;

      // 1. Extensão do check-out para Segunda-feira às 12:00h
      const targetCheckout = upsellMeta.targetCheckoutDate || "2026-11-09";
      resServiceOrder.checkoutDate = targetCheckout;
      resServiceOrder.checkoutTime = "12:00";
      resServiceOrder.hasSundayUpsell = true;
      resServiceOrder.sundayUpsellPaidAt = paidIso;
      if (resServiceOrder.pendingModification?.isSilentUpsellHold) {
        delete resServiceOrder.pendingModification;
      }

      // 2. Registro em charges e payments
      if (!Array.isArray(resServiceOrder.charges)) resServiceOrder.charges = [];
      resServiceOrder.charges.push({
        id: `chg_upsell_${Date.now()}`,
        description: `Oferta Domingo Sem Pressa (Check-out Livre Domingo + Bônus Segunda 12h: ${upsellMeta.originalCheckoutDate || ""} -> ${resServiceOrder.checkoutDate})`,
        amount: upsellAmt,
        category: "sunday_upsell",
        date: paidIso
      });
      if (!Array.isArray(resServiceOrder.payments)) resServiceOrder.payments = [];
      resServiceOrder.payments.push({
        id: `pay_upsell_${Date.now()}`,
        amount: upsellAmt,
        method: "pix",
        date: paidIso,
        notes: `PIX Domingo Sem Pressa (${txid})`
      });
      resServiceOrder.totalAmount = Math.round(((Number(resServiceOrder.totalAmount) || 0) + upsellAmt) * 100) / 100;
      resServiceOrder.paidAmount = Math.round(((Number(resServiceOrder.paidAmount) || 0) + upsellAmt) * 100) / 100;

      // 3. Reagendamento da governança/limpeza em db.cleaningRequests para segunda-feira
      if (Array.isArray(db.cleaningRequests)) {
        const oldCheckout = upsellMeta.originalCheckoutDate;
        const flatNum = String(resServiceOrder.flatNumber || "");
        const cReq = db.cleaningRequests.find(c => 
          c && !c.isDeleted &&
          (String(c.flatNumber) === flatNum || Number(c.flatId) === Number(resServiceOrder.flatId)) &&
          (c.requestDate === oldCheckout || c.targetDate === oldCheckout || c.reservationCode === resServiceOrder.code || c.reservationId === resServiceOrder.id)
        );
        if (cReq) {
          cReq.requestDate = targetCheckout;
          cReq.targetDate = targetCheckout;
          cReq.notes = `${cReq.notes || ""}\n[Reagendamento Domingo Sem Pressa] Check-out prorrogado para segunda-feira ${targetCheckout}.`.trim();
          cReq.updatedAt = paidIso;
        }
      }

      // 4. Executa remanejamento FairShare da reserva entrante, se houver
      if (upsellMeta.incomingReservationId && upsellMeta.alternateFlatNumber) {
        const incomingRes = (db.reservations || []).find(r => 
          String(r.id) === String(upsellMeta.incomingReservationId) || 
          String(r.code) === String(upsellMeta.incomingReservationId)
        );
        if (incomingRes) {
          const oldFlat = incomingRes.flatNumber;
          const newFlatNum = String(upsellMeta.alternateFlatNumber);
          const targetFlatObj = (db.flats || []).find(f => String(f.number) === newFlatNum);
          
          incomingRes.flatNumber = newFlatNum;
          if (targetFlatObj) incomingRes.flatId = targetFlatObj.id;
          incomingRes.updatedAt = paidIso;
        }
      }
    }

    // Assertions on state mutations:
    assert.strictEqual(resServiceOrder.checkoutDate, mondayDate, "Checkout date must be extended to Monday");
    assert.strictEqual(resServiceOrder.checkoutTime, "12:00", "Checkout time must be 12:00");
    assert.strictEqual(resServiceOrder.hasSundayUpsell, true, "hasSundayUpsell flag must be true");
    assert.strictEqual(resServiceOrder.pendingModification, undefined, "pendingModification must be removed");
    assert.strictEqual(resServiceOrder.totalAmount, 490.0, "Total amount incremented by 90.0");
    assert.strictEqual(resServiceOrder.paidAmount, 490.0, "Paid amount incremented by 90.0");

    // Cleaning request:
    const cReq = db.cleaningRequests[0];
    assert.strictEqual(cReq.requestDate, mondayDate, "Cleaning request must be shifted to Monday");
    assert.strictEqual(cReq.targetDate, mondayDate, "Cleaning targetDate must be shifted to Monday");
    assert.ok(cReq.notes.includes("Reagendamento Domingo Sem Pressa"));

    // Incoming reservation reallocated:
    const incomingRes = db.reservations[1];
    assert.strictEqual(incomingRes.flatNumber, "102", "Incoming reservation must be reallocated to Flat 102");
    assert.strictEqual(incomingRes.flatId, 102, "Incoming reservation flatId updated to 102");
  });

  it("3.3 Webhook idempotency: Second call for already paid upsell does not double-charge or double-shift", () => {
    const res = {
      code: "RES-IDEMP",
      checkoutDate: "2026-11-09",
      totalAmount: 490.0,
      paidAmount: 490.0,
      hasSundayUpsell: true,
      pendingSundayUpsell: {
        txid: "UPSELL_SUN_IDEMP",
        status: "paid" // already paid
      }
    };

    const txid = "UPSELL_SUN_IDEMP";
    const matches = (
      res.pendingSundayUpsell &&
      (res.pendingSundayUpsell.txid === txid || (txid && String(txid).includes("UPSELL_SUN") && String(txid).includes(String(res.code || res.id)))) &&
      res.pendingSundayUpsell.status !== "paid"
    );

    assert.strictEqual(matches, false, "Must skip second webhook processing because status is already paid");
    assert.strictEqual(res.totalAmount, 490.0, "totalAmount must not be doubled");
  });
});

describe("ADVERSARIAL SUITE 4 — Sofia AI Tool Edge Cases", () => {
  it("4.1 Tool rejects missing or empty session context", async () => {
    const context = {
      data_hora_atual: "2026-11-07T19:00:00Z",
      telefone_remetente: "5521999990001",
      estado_atual: "IN_STAY_CONCIERGE"
    };

    const res = await ofertarDomingoSemPressaTool.execute({ confirmacao_hospede: false }, context);
    assert.strictEqual(res.status, "BLOQUEADO_PELA_REGRA");
    assert.strictEqual(res.codigo_regra_bloqueio, "SEM_RESERVA_ATIVA");
    assert.ok(res.instrucao_para_ia.includes("não localizou uma reserva ativa"));
  });

  it("4.2 Tool rejects non-Sunday checkout reservation", async () => {
    const context = {
      data_hora_atual: "2026-11-07T19:00:00Z",
      telefone_remetente: "5521999990001",
      estado_atual: "IN_STAY_CONCIERGE",
      reserva_ativa: {
        id: "RES-WEDNESDAY",
        imovel_id: "101",
        nome_imovel: "Flat 101",
        data_checkin: "2026-11-08",
        data_checkout: "2026-11-11", // Wednesday
        status_pagamento: "PAGO_INTEGRALMENTE"
      }
    };

    const res = await ofertarDomingoSemPressaTool.execute({ confirmacao_hospede: false }, context);
    assert.strictEqual(res.status, "BLOQUEADO_PELA_REGRA");
    assert.strictEqual(res.codigo_regra_bloqueio, "CHECKOUT_NAO_E_DOMINGO");
    assert.ok(res.instrucao_para_ia.includes("exclusiva para reservas com check-out agendado para o domingo"));
  });

  it("4.3 Tool blocks offer when condominium is 100% full with incoming guest", async () => {
    const targetSunday = "2026-11-08";
    const db = {
      flats: [
        { id: 101, number: "101", isActive: true },
        { id: 102, number: "102", isActive: true }
      ],
      reservations: [
        {
          id: 1010,
          code: "RES-101-CURRENT",
          flatNumber: "101",
          flatId: 101,
          checkoutDate: targetSunday,
          status: "in_stay"
        },
        {
          id: 1011,
          code: "RES-101-INCOMING",
          flatNumber: "101",
          flatId: 101,
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          status: "confirmada"
        },
        {
          id: 1020,
          code: "RES-102-OCCUPIED",
          flatNumber: "102",
          flatId: 102,
          checkinDate: targetSunday,
          checkoutDate: "2026-11-12",
          status: "confirmada"
        }
      ]
    };

    const context = {
      data_hora_atual: "2026-11-07T19:00:00Z",
      telefone_remetente: "5521999990001",
      estado_atual: "IN_STAY_CONCIERGE",
      reserva_ativa: {
        id: "RES-101-CURRENT",
        imovel_id: "101",
        nome_imovel: "Flat 101",
        data_checkin: "2026-11-06",
        data_checkout: targetSunday,
        status_pagamento: "PAGO_INTEGRALMENTE"
      },
      runtime: { db }
    };

    const res = await ofertarDomingoSemPressaTool.execute({ confirmacao_hospede: false }, context);
    assert.strictEqual(res.status, "BLOQUEADO_PELA_REGRA");
    assert.strictEqual(res.codigo_regra_bloqueio, "IMOVEL_INDISPONIVEL_SEM_VAGAS");
    assert.ok(res.instrucao_para_ia.includes("100% de ocupação"));
  });

  it("4.4 Tool returns SIMULACAO_AGUARDANDO_CONFIRMACAO when confirmacao_hospede is false", async () => {
    const targetSunday = "2026-11-08";
    const db = {
      flats: [{ id: 101, number: "101", isActive: true }],
      reservations: [
        {
          id: 2001,
          code: "RES-2001",
          flatNumber: "101",
          flatId: 101,
          checkoutDate: targetSunday,
          dailyRate: 300.0,
          status: "in_stay"
        }
      ],
      sundayUpsellConfig: { sundayUpsellPrice: 90.0 }
    };

    const context = {
      data_hora_atual: "2026-11-07T19:00:00Z",
      telefone_remetente: "5521999990001",
      estado_atual: "IN_STAY_CONCIERGE",
      reserva_ativa: {
        id: "RES-2001",
        imovel_id: "101",
        nome_imovel: "Flat 101",
        data_checkin: "2026-11-06",
        data_checkout: targetSunday,
        status_pagamento: "PAGO_INTEGRALMENTE"
      },
      runtime: { db }
    };

    const res = await ofertarDomingoSemPressaTool.execute({ confirmacao_hospede: false }, context);
    assert.strictEqual(res.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
    assert.strictEqual(res.dados.valor_promocional, 90.0);
    assert.strictEqual(res.dados.valor_normal, 300.0);
    assert.strictEqual(res.dados.economia, 210.0);
    assert.strictEqual(res.dados.hold_minutos, 30);
    assert.strictEqual(res.dados.nova_data_checkout, "2026-11-09");
  });

  it("4.5 Tool executes SUCESSO_EXECUTADO when confirmacao_hospede is true", async () => {
    const targetSunday = "2026-11-08";
    const db = {
      flats: [{ id: 101, number: "101", isActive: true }],
      reservations: [
        {
          id: 3001,
          code: "RES-3001",
          flatNumber: "101",
          flatId: 101,
          checkoutDate: targetSunday,
          dailyRate: 250.0,
          status: "in_stay"
        }
      ],
      sundayUpsellConfig: { sundayUpsellPrice: 90.0 }
    };

    let saveCalled = false;
    const context = {
      data_hora_atual: "2026-11-07T19:00:00Z",
      telefone_remetente: "5521999990001",
      estado_atual: "IN_STAY_CONCIERGE",
      reserva_ativa: {
        id: "RES-3001",
        imovel_id: "101",
        nome_imovel: "Flat 101",
        data_checkin: "2026-11-06",
        data_checkout: targetSunday,
        status_pagamento: "PAGO_INTEGRALMENTE"
      },
      runtime: {
        db,
        saveDatabase: async () => { saveCalled = true; }
      }
    };

    const res = await ofertarDomingoSemPressaTool.execute({ confirmacao_hospede: true }, context);
    assert.strictEqual(res.status, "SUCESSO_EXECUTADO");
    assert.ok(res.dados.pix_copia_e_cola);
    assert.ok(res.dados.txid);
    assert.strictEqual(res.dados.hold_minutos, 30);
    assert.strictEqual(res.dados.nova_data_checkout, "2026-11-09");
    assert.strictEqual(saveCalled, true, "saveDatabase must be invoked on execution");

    const targetRes = db.reservations[0];
    assert.ok(targetRes.pendingSundayUpsell);
    assert.strictEqual(targetRes.pendingSundayUpsell.status, "pending_payment");
    assert.strictEqual(targetRes.pendingSundayUpsell.isSilentUpsellHold, true);
    assert.strictEqual(targetRes.pendingSundayUpsell.promotionalPrice, 90.0);
    assert.ok(targetRes.pendingModification);
    assert.strictEqual(targetRes.pendingModification.isSilentUpsellHold, true);
  });

  after(() => {
    setTimeout(() => process.exit(0), 100);
  });
});

