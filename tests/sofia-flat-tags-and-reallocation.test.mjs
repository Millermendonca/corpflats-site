/**
 * Test Suite: Sofia Flat Tags, Amenities & Intelligent Flat Reallocation
 * File: tests/sofia-flat-tags-and-reallocation.test.mjs
 * Execution: node --test tests/sofia-flat-tags-and-reallocation.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getFlatAmenitiesInfo,
  searchFlatsByAmenities,
  hasGuestRequestedSpecificFlat,
  findAlternateFlatForGuest,
  handleReallocateReservationFlat,
  handleGetFlatAmenities,
  executeBotAction
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

describe("Sofia Flat Amenities & Reallocation Suite", () => {
  // Mock Database
  const createMockDb = () => ({
    flats: [
      {
        id: 1,
        number: 406,
        name: "Flat 406",
        colName: "Apt 406 - Split / Casal",
        isActive: true,
        airConditionerType: "split",
        bedType: "casal",
        hasMicrowave: true,
        tags: ["Ar Split", "Cama Casal", "Micro-ondas", "Andar Alto"]
      },
      {
        id: 2,
        number: 408,
        name: "Flat 408",
        colName: "Apt 408 - Split / 2 Solteiro",
        isActive: true,
        airConditionerType: "split",
        bedType: "2_solteiro",
        hasMicrowave: false,
        tags: ["Ar Split", "2 Camas Solteiro", "Vista Mar"]
      },
      {
        id: 3,
        number: 502,
        name: "Flat 502",
        colName: "Apt 502 - Janela / Casal",
        isActive: true,
        airConditionerType: "janela",
        bedType: "casal",
        hasMicrowave: false,
        tags: ["Ar Janela", "Cama Casal"]
      },
      {
        id: 4,
        number: 504,
        name: "Flat 504",
        colName: "Apt 504 - Split / Casal",
        isActive: true,
        airConditionerType: "split",
        bedType: "casal",
        hasMicrowave: true,
        tags: ["Ar Split", "Cama Casal", "Micro-ondas"]
      }
    ],
    reservations: [],
    roomBlocks: [],
    auditLogs: [],
    whatsappConversations: [],
    botActionsSettings: {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true,
        reallocateReservationFlat: true,
        getFlatAmenities: true
      },
      preReservationHoldMinutes: 30,
      handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
    }
  });

  describe("1. Flat Amenities Extraction & Normalization", () => {
    it("should correctly extract amenities for flat with Split, Casal and Microwave", () => {
      const db = createMockDb();
      const info = getFlatAmenitiesInfo(db.flats[0]);
      assert.equal(info.number, "406");
      assert.equal(info.airConditionerType, "split");
      assert.equal(info.bedType, "casal");
      assert.equal(info.hasMicrowave, true);
    });

    it("should correctly extract amenities for flat with Janela, Casal and no Microwave", () => {
      const db = createMockDb();
      const info = getFlatAmenitiesInfo(db.flats[2]);
      assert.equal(info.number, "502");
      assert.equal(info.airConditionerType, "janela");
      assert.equal(info.bedType, "casal");
      assert.equal(info.hasMicrowave, false);
    });

    it("should correctly extract 2 camas de solteiro", () => {
      const db = createMockDb();
      const info = getFlatAmenitiesInfo(db.flats[1]);
      assert.equal(info.number, "408");
      assert.equal(info.bedType, "2_solteiro");
    });
  });

  describe("2. Search & Filter Flats by Amenities", () => {
    it("should filter flats by split air conditioning", () => {
      const db = createMockDb();
      const splits = searchFlatsByAmenities(db, { split: true });
      assert.equal(splits.length, 3);
      assert.ok(splits.every(f => f.airConditionerType === "split"));
    });

    it("should filter flats by 2 single beds", () => {
      const db = createMockDb();
      const singles = searchFlatsByAmenities(db, { bedType: "2_solteiro" });
      assert.equal(singles.length, 1);
      assert.equal(singles[0].number, "408");
    });

    it("should filter flats with microwave", () => {
      const db = createMockDb();
      const micros = searchFlatsByAmenities(db, { hasMicrowave: true });
      assert.equal(micros.length, 2);
      assert.ok(micros.every(f => f.hasMicrowave === true));
    });

    it("should filter via natural query string 'ar split'", () => {
      const db = createMockDb();
      const results = searchFlatsByAmenities(db, { query: "gostaria de um flat com ar split" });
      assert.equal(results.length, 3);
    });

    it("should execute handleGetFlatAmenities bot handler", () => {
      const db = createMockDb();
      const res = handleGetFlatAmenities(db, { bedType: "2_solteiro" });
      assert.equal(res.success, true);
      assert.equal(res.count, 1);
      assert.equal(res.flats[0].number, "408");
    });
  });

  describe("3. Preferred / Locked Flat Detection (hasGuestRequestedSpecificFlat)", () => {
    it("should detect explicit PMS lock via isFlatLocked", () => {
      const db = createMockDb();
      const res = { id: 101, flatNumber: "408", isFlatLocked: true };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), true);
    });

    it("should detect explicit PMS lock via flatLocked", () => {
      const db = createMockDb();
      const res = { id: 102, flatNumber: "408", flatLocked: true };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), true);
    });

    it("should detect explicit preference in requestedFlat field", () => {
      const db = createMockDb();
      const res = { id: 103, flatNumber: "408", requestedFlat: "408" };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), true);
    });

    it("should detect guest request in reservation notes", () => {
      const db = createMockDb();
      const res = { id: 104, flatNumber: "408", notes: "Hóspede pediu especificamente o flat 408 por ter 2 camas solteiro" };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), true);
    });

    it("should detect guest request in receptionNotes / specialRequests", () => {
      const db = createMockDb();
      const res = { id: 105, flatNumber: "408", specialRequests: "Quarto fixo preferencial não alterar" };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), true);
    });

    it("should detect guest request in WhatsApp conversation message history", () => {
      const db = createMockDb();
      db.whatsappConversations.push({
        clientPhone: "5522998877665",
        messages: [
          { fromMe: false, text: "Olá! Gostaria de ficar no flat 408 por favor" }
        ]
      });
      const res = { id: 106, flatNumber: "408", guestPhone: "22998877665" };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), true);
    });

    it("should return false for guest with no lock or request", () => {
      const db = createMockDb();
      const res = { id: 107, flatNumber: "408", guestName: "Hóspede Neutro", notes: "Sem pedidos" };
      assert.equal(hasGuestRequestedSpecificFlat(db, res, "408"), false);
    });
  });

  describe("4. Intelligent Reallocation (handleReallocateReservationFlat)", () => {
    it("should reallocate guest when target flat is completely vacant", () => {
      const db = createMockDb();
      db.reservations.push({
        id: 1,
        code: "RES-001",
        guestName: "João Silva",
        flatId: 1,
        flatNumber: "406",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada"
      });

      const result = handleReallocateReservationFlat(db, {
        reservationId: "RES-001",
        targetFlatNumber: "504"
      });

      assert.equal(result.success, true);
      assert.equal(result.newFlat, "504");
      assert.equal(result.displacedReservation, null);

      const updatedRes = db.reservations.find(r => r.code === "RES-001");
      assert.equal(updatedRes.flatNumber, "504");
      assert.equal(updatedRes.flatId, 4);
    });

    it("should displace an incoming guest who has not checked in and has no lock/preference", () => {
      const db = createMockDb();
      // Res A: quer ir para 408
      db.reservations.push({
        id: 1,
        code: "RES-A",
        guestName: "Solicitante Troca",
        flatId: 1,
        flatNumber: "406",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada"
      });
      // Res B: já está alocada no 408 para o mesmo período, mas NÃO pediu o 408 nem fez check-in
      db.reservations.push({
        id: 2,
        code: "RES-B",
        guestName: "Ocupante Deslocável",
        flatId: 2,
        flatNumber: "408",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada",
        checkedIn: false
      });

      const result = handleReallocateReservationFlat(db, {
        reservationId: "RES-A",
        targetFlatNumber: "408"
      });

      assert.equal(result.success, true);
      assert.equal(result.newFlat, "408");
      assert.ok(result.displacedReservation, "Deve indicar que um hóspede foi deslocado");
      assert.equal(result.displacedReservation.id, 2);

      const updatedResA = db.reservations.find(r => r.code === "RES-A");
      const updatedResB = db.reservations.find(r => r.code === "RES-B");
      assert.equal(updatedResA.flatNumber, "408");
      // Res B foi deslocado para o flat vago 406 (troca perfeita) ou outro disponível
      assert.notEqual(updatedResB.flatNumber, "408");
    });

    it("should reject reallocation if occupant has already checked in", () => {
      const db = createMockDb();
      db.reservations.push({
        id: 1,
        code: "RES-A",
        guestName: "Solicitante",
        flatId: 1,
        flatNumber: "406",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada"
      });
      db.reservations.push({
        id: 2,
        code: "RES-B",
        guestName: "Já Hospedado",
        flatId: 2,
        flatNumber: "408",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "hospedado",
        checkedIn: true
      });

      const result = handleReallocateReservationFlat(db, {
        reservationId: "RES-A",
        targetFlatNumber: "408"
      });

      assert.equal(result.success, false);
      assert.equal(result.error, "OCCUPANT_CHECKED_IN");
    });

    it("should reject reallocation if occupant has locked room (isFlatLocked: true)", () => {
      const db = createMockDb();
      db.reservations.push({
        id: 1,
        code: "RES-A",
        guestName: "Solicitante",
        flatId: 1,
        flatNumber: "406",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada"
      });
      db.reservations.push({
        id: 2,
        code: "RES-B",
        guestName: "Cliente Exigente",
        flatId: 2,
        flatNumber: "408",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada",
        isFlatLocked: true,
        flatLockReason: "Pediu 2 camas de solteiro expressamente"
      });

      const result = handleReallocateReservationFlat(db, {
        reservationId: "RES-A",
        targetFlatNumber: "408"
      });

      assert.equal(result.success, false);
      assert.equal(result.error, "FLAT_LOCKED_OR_REQUESTED");
    });
  });

  describe("5. Master Switch & Granular Permissions Governance", () => {
    it("should block autonomous reallocation when granular permission is disabled", async () => {
      const db = createMockDb();
      db.botActionsSettings.allowedActions.reallocateReservationFlat = false;
      db.reservations.push({
        id: 1,
        code: "RES-A",
        flatId: 1,
        flatNumber: "406",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada"
      });

      const result = await executeBotAction(db, "reallocateReservationFlat", {
        reservationId: "RES-A",
        targetFlatNumber: "504"
      });

      assert.equal(result.error, "ACTION_DISABLED");
      assert.equal(result.requiresHandover, true);
      assert.match(result.message, /pausada|atendimento humano/i);
    });

    it("should block autonomous reallocation when Master Switch is OFF", async () => {
      const db = createMockDb();
      db.botActionsSettings.apiActionsEnabled = false;
      db.reservations.push({
        id: 1,
        code: "RES-A",
        flatId: 1,
        flatNumber: "406",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        status: "confirmada"
      });

      const result = await executeBotAction(db, "reallocateReservationFlat", {
        reservationId: "RES-A",
        targetFlatNumber: "504"
      });

      assert.equal(result.error, "ACTION_DISABLED");
      assert.equal(result.requiresHandover, true);
      assert.match(result.message, /pausada|atendimento humano/i);
    });
  });
});
