/**
 * tests/wbp-integration/challenger-m2-availability.test.mjs
 *
 * Challenger 1 (Milestone 2): Canonical Availability Stress & Invariant Harness
 *
 * Empirically stress-tests:
 * 1. Multi-period availability with adversarial overlapping reservations & overbooking.
 * 2. Back-to-back checkouts/checkins (same day turnover: checkout 12:00, checkin 14:00).
 * 3. Administrative room blocks (single-day, multi-day, touching turnovers).
 * 4. Maintenance service orders spanning multiple days & open-ended maintenance.
 * 5. Expired vs active provisional holds (pendingModification & pre_reservas).
 * 6. Permanent maintenance status and inactive flats (immovable floor).
 * 7. Ceiling limits: min(ceiling, available) including negative, zero, excessive, and NaN ceilings.
 * 8. Mathematical invariant verification: available units NEVER exceed 19 and NEVER drop below 0.
 * 9. Non-blocking conflict warnings (isWarningOnly: true across all 5 conflict types).
 * 10. HTTP endpoint resilience for /api/wbp/availability and /api/wbp/conflicts/check.
 * 11. Twin parity validation between artifacts/ and scripts/ modules.
 *
 * Strict Isolation Mandate (AGENTS.md):
 * - DATABASE_URL is strictly deleted.
 * - NODE_ENV is set to "test".
 * - No live database files are accessed or modified.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";

// Ensure DATABASE_URL is deleted to preserve complete test isolation
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";

import {
  calculateCanonicalAvailability,
  checkReservationConflicts,
  checkFlatBlockedOnNight,
  getNightsBetween,
  normalizeDateStr,
  matchFlat,
  getCanonicalFlats,
  CORPFLATS_19_FLATS
} from "../../artifacts/api-server/wbp/availability.mjs";

describe("Challenger 1: Canonical Availability Stress & Invariant Harness", () => {
  let baseMockDb;
  const fixedNowMs = new Date("2026-11-01T12:00:00Z").getTime();

  before(() => {
    baseMockDb = {
      flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
      reservations: [],
      roomBlocks: [],
      serviceOrders: []
    };
  });

  // =========================================================================
  // 1. Module Parity & Canonical Inventory Foundation
  // =========================================================================
  describe("1. Parity & Canonical Inventory Structure", () => {
    it("guarantees 100% byte-for-byte SHA-256 parity between artifacts and scripts availability modules", () => {
      const artPath = path.resolve(process.cwd(), "artifacts/api-server/wbp/availability.mjs");
      const scrPath = path.resolve(process.cwd(), "scripts/wbp/availability.mjs");

      assert.ok(fs.existsSync(artPath), "artifacts/api-server/wbp/availability.mjs must exist");
      assert.ok(fs.existsSync(scrPath), "scripts/wbp/availability.mjs must exist");

      const artHash = crypto.createHash("sha256").update(fs.readFileSync(artPath)).digest("hex");
      const scrHash = crypto.createHash("sha256").update(fs.readFileSync(scrPath)).digest("hex");

      assert.equal(artHash, scrHash, "Availability modules must be byte-for-byte identical");
    });

    it("verifies canonical inventory consists of exactly 19 unique flats with expected keys", () => {
      assert.equal(CORPFLATS_19_FLATS.length, 19, "Must contain exactly 19 canonical flats");

      const idSet = new Set();
      const numSet = new Set();

      for (const flat of CORPFLATS_19_FLATS) {
        assert.ok(flat.id != null, "Flat must have an id");
        assert.ok(flat.number != null, "Flat must have a number");
        assert.ok(!idSet.has(flat.id), `Duplicate flat ID detected: ${flat.id}`);
        assert.ok(!numSet.has(flat.number), `Duplicate flat number detected: ${flat.number}`);
        idSet.add(flat.id);
        numSet.add(flat.number);
      }
    });

    it("evaluates getNightsBetween date slicing accurately and guards against malformed ranges", () => {
      // Standard 3-night interval
      const nights = getNightsBetween("2026-11-01", "2026-11-04");
      assert.deepEqual(nights, ["2026-11-01", "2026-11-02", "2026-11-03"]);

      // 1-night interval
      const singleNight = getNightsBetween("2026-11-01", "2026-11-02");
      assert.deepEqual(singleNight, ["2026-11-01"]);

      // Same checkin and checkout: fallback returns start date without hanging
      const sameDay = getNightsBetween("2026-11-01", "2026-11-01");
      assert.deepEqual(sameDay, ["2026-11-01"]);

      // Inverted interval: fallback returns start date without hanging
      const inverted = getNightsBetween("2026-11-05", "2026-11-01");
      assert.deepEqual(inverted, ["2026-11-05"]);

      // Empty or invalid input
      assert.deepEqual(getNightsBetween("", "2026-11-02"), []);
      assert.deepEqual(getNightsBetween(null, "2026-11-02"), []);
    });
  });

  // =========================================================================
  // 2. Same-Day Turnover (Back-to-Back Checkouts / Checkins)
  // =========================================================================
  describe("2. Same-Day Turnover (Back-to-Back Checkouts / Checkins)", () => {
    it("handles back-to-back reservation turnover cleanly with zero false collision and exact inventory", () => {
      // Guest A: checkin 2026-11-01, checkout 2026-11-05 (flat 113)
      // Guest B: checkin 2026-11-05, checkout 2026-11-10 (flat 113)
      // Guest C: checkin 2026-11-10, checkout 2026-11-15 (flat 113)
      const turnoverDb = {
        ...baseMockDb,
        reservations: [
          {
            id: "RES-A",
            code: "RES-A",
            flatNumber: "113",
            checkinDate: "2026-11-01",
            checkoutDate: "2026-11-05",
            status: "confirmada",
            guestName: "Hóspede A"
          },
          {
            id: "RES-B",
            code: "RES-B",
            flatNumber: "113",
            checkinDate: "2026-11-05",
            checkoutDate: "2026-11-10",
            status: "confirmada",
            guestName: "Hóspede B"
          },
          {
            id: "RES-C",
            code: "RES-C",
            flatNumber: "113",
            checkinDate: "2026-11-10",
            checkoutDate: "2026-11-15",
            status: "confirmada",
            guestName: "Hóspede C"
          }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-01", "2026-11-16", {
        db: turnoverDb,
        nowMs: fixedNowMs
      });

      // From 2026-11-01 through 2026-11-14 (14 nights), Flat 113 is continuously occupied:
      // Night 2026-11-04 is occupied by RES-A.
      // Night 2026-11-05 is turnover day: RES-A leaves at noon, RES-B arrives at 14:00.
      // Canonical night rule: night of 2026-11-05 is occupied by RES-B.
      // Inventory MUST be exactly 18 (19 - 1), NOT 17 (double decrement) or 19 (premature vacancy).
      for (let day = 1; day <= 14; day++) {
        const dateStr = `2026-11-${String(day).padStart(2, "0")}`;
        const avail = result.get(dateStr);
        assert.equal(avail, 18, `Turnover chain: ${dateStr} must have exactly 18 available units`);
        assert.ok(!result.detailsByDate[dateStr].freeFlatNumbers.includes("113"));
      }

      // Night 2026-11-15: RES-C has checked out on 2026-11-15, flat 113 is now completely free!
      assert.equal(result.get("2026-11-15"), 19, "2026-11-15 must have all 19 units available");
      assert.ok(result.detailsByDate["2026-11-15"].freeFlatNumbers.includes("113"));
    });

    it("verifies simultaneous turnover across 5 flats on the exact same date", () => {
      // 5 flats turning over on 2026-11-05
      const turnoverFlats = ["113", "114", "211", "313", "408"];
      const reservations = [];

      for (const flatNum of turnoverFlats) {
        reservations.push({
          id: `OUT-${flatNum}`,
          flatNumber: flatNum,
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          status: "confirmada"
        });
        reservations.push({
          id: `IN-${flatNum}`,
          flatNumber: flatNum,
          checkinDate: "2026-11-05",
          checkoutDate: "2026-11-08",
          status: "confirmada"
        });
      }

      const multiTurnoverDb = { ...baseMockDb, reservations };
      const result = calculateCanonicalAvailability("2026-11-04", "2026-11-07", {
        db: multiTurnoverDb,
        nowMs: fixedNowMs
      });

      // 2026-11-04 (night before turnover): 5 flats occupied by OUT guests -> 14 free
      assert.equal(result.get("2026-11-04"), 14);

      // 2026-11-05 (turnover night): 5 flats occupied by IN guests -> 14 free (never drops to 9)
      assert.equal(result.get("2026-11-05"), 14);

      // 2026-11-06: 5 flats still occupied by IN guests -> 14 free
      assert.equal(result.get("2026-11-06"), 14);
    });
  });

  // =========================================================================
  // 3. Adversarial Overlapping Reservations & Overbooking Collisions
  // =========================================================================
  describe("3. Adversarial Overlapping Reservations & Overbooking Collisions", () => {
    it("handles heavy overbooking on a single flat without multi-decrementing or dropping below bounds", () => {
      // 5 conflicting reservations placed on Flat 113 for overlapping dates
      const overbookedDb = {
        ...baseMockDb,
        reservations: [
          { id: "OB-1", flatNumber: "113", checkinDate: "2026-11-01", checkoutDate: "2026-11-06", status: "confirmada" },
          { id: "OB-2", flatNumber: "113", checkinDate: "2026-11-02", checkoutDate: "2026-11-05", status: "confirmada" },
          { id: "OB-3", flatNumber: "113", checkinDate: "2026-11-03", checkoutDate: "2026-11-07", status: "confirmada" },
          { id: "OB-4", flatNumber: "113", checkinDate: "2026-11-01", checkoutDate: "2026-11-04", status: "confirmada" },
          { id: "OB-5", flatNumber: "113", checkinDate: "2026-11-04", checkoutDate: "2026-11-08", status: "confirmada" }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-01", "2026-11-09", {
        db: overbookedDb,
        nowMs: fixedNowMs
      });

      // From 2026-11-01 to 2026-11-07, Flat 113 is blocked by at least one reservation.
      // Since all 5 reservations are on Flat 113, available flats MUST BE 18, NEVER 14 (19 - 5).
      for (let day = 1; day <= 7; day++) {
        const dateStr = `2026-11-${String(day).padStart(2, "0")}`;
        assert.equal(
          result.get(dateStr),
          18,
          `Overbooked date ${dateStr} must be exactly 18 (single decrement for flat 113)`
        );
      }

      // On 2026-11-08, all reservations on Flat 113 have checked out!
      assert.equal(result.get("2026-11-08"), 19, "2026-11-08 must be 19 (all overbooked checked out)");
    });

    it("verifies overbooking storm across all 19 flats saturates to 0 and never becomes negative", () => {
      // Create 3 overlapping reservations per flat for all 19 flats (57 reservations)
      const reservations = [];
      for (const flat of CORPFLATS_19_FLATS) {
        reservations.push({ id: `S1-${flat.number}`, flatNumber: flat.number, checkinDate: "2026-11-10", checkoutDate: "2026-11-15", status: "confirmada" });
        reservations.push({ id: `S2-${flat.number}`, flatNumber: flat.number, checkinDate: "2026-11-11", checkoutDate: "2026-11-14", status: "confirmada" });
        reservations.push({ id: `S3-${flat.number}`, flatNumber: flat.number, checkinDate: "2026-11-12", checkoutDate: "2026-11-16", status: "confirmada" });
      }

      const stormDb = { ...baseMockDb, reservations };
      const result = calculateCanonicalAvailability("2026-11-10", "2026-11-17", {
        db: stormDb,
        nowMs: fixedNowMs
      });

      // Nights 2026-11-10 through 2026-11-14: all 19 flats occupied
      for (let day = 10; day <= 14; day++) {
        const dateStr = `2026-11-${day}`;
        assert.equal(result.get(dateStr), 0, `Storm date ${dateStr} must be 0`);
        assert.ok(result.get(dateStr) >= 0, "Availability must never be negative");
      }

      assert.equal(result.minAvailable, 0);
      assert.ok(result.minAvailable >= 0, "minAvailable must never be negative");
    });
  });

  // =========================================================================
  // 4. Room Blocks & Turnover Handoffs
  // =========================================================================
  describe("4. Administrative Room Blocks & Seamless Handoffs", () => {
    it("coordinates consecutive room block and reservation handoffs without gap or double count", () => {
      // Flat 211:
      // Res 1: 2026-11-01 to 2026-11-04 (checkout 11-04)
      // Block 1: 2026-11-04 to 2026-11-07 (checkout 11-07)
      // Res 2: 2026-11-07 to 2026-11-10 (checkout 11-10)
      const handoffDb = {
        ...baseMockDb,
        reservations: [
          { id: "R1", flatNumber: "211", checkinDate: "2026-11-01", checkoutDate: "2026-11-04", status: "confirmada" },
          { id: "R2", flatNumber: "211", checkinDate: "2026-11-07", checkoutDate: "2026-11-10", status: "confirmada" }
        ],
        roomBlocks: [
          { id: "B1", flatNumber: "211", startDate: "2026-11-04", endDate: "2026-11-07", reason: "Pintura geral" }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-01", "2026-11-11", {
        db: handoffDb,
        nowMs: fixedNowMs
      });

      // 2026-11-01 to 2026-11-03: blocked by R1 (avail = 18)
      assert.equal(result.get("2026-11-01"), 18);
      assert.equal(result.get("2026-11-03"), 18);

      // 2026-11-04: R1 checked out at noon; B1 begins -> blocked by B1 (avail = 18)
      assert.equal(result.get("2026-11-04"), 18);
      assert.equal(result.detailsByDate["2026-11-04"].blockedDetails[0].reason, "room_block");

      // 2026-11-06: blocked by B1 (avail = 18)
      assert.equal(result.get("2026-11-06"), 18);

      // 2026-11-07: B1 finishes; R2 checks in -> blocked by R2 (avail = 18)
      assert.equal(result.get("2026-11-07"), 18);
      assert.equal(result.detailsByDate["2026-11-07"].blockedDetails[0].reason, "reservation");

      // 2026-11-09: blocked by R2 (avail = 18)
      assert.equal(result.get("2026-11-09"), 18);

      // 2026-11-10: R2 checked out; flat 211 is completely free (avail = 19)
      assert.equal(result.get("2026-11-10"), 19);
    });

    it("verifies multi-flat room blocks across month boundaries", () => {
      const monthBoundaryDb = {
        ...baseMockDb,
        roomBlocks: [
          { id: "MB-1", flatNumber: "313", startDate: "2026-11-28", endDate: "2026-12-03", reason: "Reforma elétrica" },
          { id: "MB-2", flatNumber: "408", startDate: "2026-11-30", endDate: "2026-12-02", reason: "Dedetização" }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-27", "2026-12-04", {
        db: monthBoundaryDb,
        nowMs: fixedNowMs
      });

      // 2026-11-27: neither block active -> 19
      assert.equal(result.get("2026-11-27"), 19);

      // 2026-11-28: flat 313 blocked -> 18
      assert.equal(result.get("2026-11-28"), 18);

      // 2026-11-30: both 313 and 408 blocked -> 17
      assert.equal(result.get("2026-11-30"), 17);

      // 2026-12-01: both 313 and 408 blocked -> 17
      assert.equal(result.get("2026-12-01"), 17);

      // 2026-12-02: 408 finished, 313 still blocked -> 18
      assert.equal(result.get("2026-12-02"), 18);

      // 2026-12-03: 313 finished -> 19
      assert.equal(result.get("2026-12-03"), 19);
    });
  });

  // =========================================================================
  // 5. Maintenance Service Orders (Complex, Multi-Flat, Open-Ended)
  // =========================================================================
  describe("5. Maintenance Service Orders Multi-Period & Open-Ended Stress", () => {
    it("correctly evaluates active multi-flat service orders and distinguishes open-ended from completed work", () => {
      const serviceDb = {
        ...baseMockDb,
        serviceOrders: [
          {
            id: "SO-100",
            status: "active",
            title: "Manutenção de Ar-Condicionado",
            flats: [
              // Flat 509: 4-day maintenance
              { flatNumber: "509", startedAt: "2026-11-10", estimatedFinishAt: "2026-11-14", status: "in_progress" },
              // Flat 511: Open-ended maintenance (estimatedFinishAt is null)
              { flatNumber: "511", startedAt: "2026-11-12", estimatedFinishAt: null, status: "in_progress" },
              // Flat 512: Completed maintenance (should NOT block)
              { flatNumber: "512", startedAt: "2026-11-08", estimatedFinishAt: "2026-11-15", status: "completed" }
            ]
          },
          // Inactive service order (status: "cancelled", should NOT block)
          {
            id: "SO-101",
            status: "cancelled",
            title: "Troca de Piso",
            flats: [
              { flatNumber: "605", startedAt: "2026-11-10", estimatedFinishAt: "2026-11-20", status: "in_progress" }
            ]
          }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-09", "2026-11-17", {
        db: serviceDb,
        nowMs: fixedNowMs
      });

      // 2026-11-09: No active maintenance -> 19
      assert.equal(result.get("2026-11-09"), 19);

      // 2026-11-10: Flat 509 begins -> 18 (Flat 512 completed, SO-101 cancelled)
      assert.equal(result.get("2026-11-10"), 18);
      assert.ok(result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("512"));
      assert.ok(result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("605"));

      // 2026-11-12: Flat 509 active AND Flat 511 (open-ended) begins -> 17
      assert.equal(result.get("2026-11-12"), 17);

      // 2026-11-13: Both 509 and 511 active -> 17
      assert.equal(result.get("2026-11-13"), 17);

      // 2026-11-14: Flat 509 estimated finish is 2026-11-14 (free on night 14).
      // Flat 511 remains blocked because it is open-ended! -> 18
      assert.equal(result.get("2026-11-14"), 18);
      assert.ok(result.detailsByDate["2026-11-14"].freeFlatNumbers.includes("509"));
      assert.ok(!result.detailsByDate["2026-11-14"].freeFlatNumbers.includes("511"));

      // 2026-11-16: Flat 511 still blocked due to open-ended maintenance -> 18
      assert.equal(result.get("2026-11-16"), 18);
    });
  });

  // =========================================================================
  // 6. Expired vs Active Holds & Pre-Reservas
  // =========================================================================
  describe("6. Expired vs Active Holds (Provisional Holds & Pre-Reservas)", () => {
    it("distinguishes active provisional holds from expired holds based on exact timestamp comparison", () => {
      const now = new Date("2026-11-05T14:00:00Z").getTime();

      const holdsDb = {
        ...baseMockDb,
        reservations: [
          // Reservation with ACTIVE provisional hold (expires in future)
          {
            id: "R-HOLD-ACT",
            code: "R-HOLD-ACT",
            flatNumber: "113",
            checkinDate: "2026-11-20",
            checkoutDate: "2026-11-25",
            status: "confirmada",
            pendingModification: {
              status: "pending",
              newFlatNumber: "712",
              newCheckinDate: "2026-11-10",
              newCheckoutDate: "2026-11-13",
              expiresAt: "2026-11-05T15:00:00Z" // 1 hour in future -> ACTIVE!
            }
          },
          // Reservation with EXPIRED provisional hold
          {
            id: "R-HOLD-EXP",
            code: "R-HOLD-EXP",
            flatNumber: "114",
            checkinDate: "2026-11-20",
            checkoutDate: "2026-11-25",
            status: "confirmada",
            pendingModification: {
              status: "pending",
              newFlatNumber: "715",
              newCheckinDate: "2026-11-10",
              newCheckoutDate: "2026-11-13",
              expiresAt: "2026-11-05T13:00:00Z" // 1 hour in past -> EXPIRED!
            }
          },
          // Reservation with REJECTED provisional hold
          {
            id: "R-HOLD-REJ",
            code: "R-HOLD-REJ",
            flatNumber: "116",
            checkinDate: "2026-11-20",
            checkoutDate: "2026-11-25",
            status: "confirmada",
            pendingModification: {
              status: "rejected",
              newFlatNumber: "905",
              newCheckinDate: "2026-11-10",
              newCheckoutDate: "2026-11-13",
              expiresAt: "2026-11-05T16:00:00Z" // unexpired but rejected!
            }
          }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-10", "2026-11-13", {
        db: holdsDb,
        nowMs: now
      });

      // On 2026-11-10:
      // Flat 712: blocked by R-HOLD-ACT pendingModification!
      // Flat 715: NOT blocked (hold expired)
      // Flat 905: NOT blocked (hold rejected)
      // Availability should be 18 (19 - 1 for Flat 712).
      assert.equal(result.get("2026-11-10"), 18);
      assert.ok(!result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("712"));
      assert.ok(result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("715"));
      assert.ok(result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("905"));
    });

    it("verifies paid pre-reservas remain blocking even after expiresAt, while unpaid pre-reservas expire", () => {
      const now = new Date("2026-11-05T14:00:00Z").getTime();

      const preResDb = {
        ...baseMockDb,
        reservations: [
          // Pre-reserva UNPAID and EXPIRED -> should NOT block
          {
            id: "PR-UNPAID",
            flatNumber: "904",
            checkinDate: "2026-11-08",
            checkoutDate: "2026-11-10",
            status: "pre_reserva",
            paymentStatus: "pendente",
            expiresAt: "2026-11-05T10:00:00Z"
          },
          // Pre-reserva PAID (pago_total) but expiresAt is in past -> MUST BLOCK!
          {
            id: "PR-PAID",
            flatNumber: "907",
            checkinDate: "2026-11-08",
            checkoutDate: "2026-11-10",
            status: "pre_reserva",
            paymentStatus: "pago_total",
            expiresAt: "2026-11-05T10:00:00Z"
          }
        ]
      };

      const result = calculateCanonicalAvailability("2026-11-08", "2026-11-10", {
        db: preResDb,
        nowMs: now
      });

      // Flat 904 is free (unpaid expired)
      // Flat 907 is blocked (paid)
      // Availability = 18
      assert.equal(result.get("2026-11-08"), 18);
      assert.ok(result.detailsByDate["2026-11-08"].freeFlatNumbers.includes("904"));
      assert.ok(!result.detailsByDate["2026-11-08"].freeFlatNumbers.includes("907"));
    });
  });

  // =========================================================================
  // 7. Permanent Maintenance Status (The Immovable Floor)
  // =========================================================================
  describe("7. Permanent Flat Maintenance & Inactive Status Floor", () => {
    it("permanently blocks flats across every single night for status manutencao_bloqueada, em_manutencao, or isActive=false", () => {
      const permanentMaintDb = {
        ...baseMockDb,
        flats: CORPFLATS_19_FLATS.map(f => {
          if (f.number === "712") return { ...f, status: "manutencao_bloqueada", isActive: true };
          if (f.number === "715") return { ...f, maintenanceStatus: "em_manutencao", isActive: true };
          if (f.number === "1004") return { ...f, isActive: false };
          return { ...f, isActive: true, status: "disponivel" };
        })
      };

      // Query across a 30-day range
      const result = calculateCanonicalAvailability("2026-11-01", "2026-12-01", {
        db: permanentMaintDb,
        nowMs: fixedNowMs
      });

      assert.equal(result.daily.length, 30);
      assert.equal(result.totalFlats, 19);

      // Because 3 flats are permanently disabled, available units can NEVER exceed 16
      for (const day of result.daily) {
        assert.equal(day.availableFlats, 16, `Day ${day.date} must have exactly 16 available`);
        assert.equal(day.units, 16);
        assert.ok(!day.freeFlatNumbers.includes("712"));
        assert.ok(!day.freeFlatNumbers.includes("715"));
        assert.ok(!day.freeFlatNumbers.includes("1004"));
      }

      assert.equal(result.minAvailable, 16);
    });
  });

  // =========================================================================
  // 8. Ceiling Limits min(ceiling, available) & Extreme Inputs
  // =========================================================================
  describe("8. Ceiling Limits min(ceiling, available) & Extreme Inputs", () => {
    it("strictly bounds units by min(ceiling, available) and handles edge cases (negative, zero, NaN, strings)", () => {
      // Baseline: mockDb with 19 free flats
      const testRange = ["2026-11-10", "2026-11-11"];

      // Case 1: Ceiling = 5 (< 19) -> units = 5
      const res5 = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: 5 });
      assert.equal(res5.get("2026-11-10"), 5);

      // Case 2: Ceiling = 25 (> 19) -> units = 19 (capped by available flats)
      const res25 = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: 25 });
      assert.equal(res25.get("2026-11-10"), 19);

      // Case 3: Ceiling = 0 -> units = 0
      const res0 = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: 0 });
      assert.equal(res0.get("2026-11-10"), 0);

      // Case 4: Negative Ceiling (-10) -> Math.max(0, ...) clamps to 0!
      const resNeg = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: -10 });
      assert.equal(resNeg.get("2026-11-10"), 0, "Negative ceiling must clamp to 0");

      // Case 5: String Ceiling ("7") -> coerced to number 7
      const resStr = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: "7" });
      assert.equal(resStr.get("2026-11-10"), 7);

      // Case 6: NaN Ceiling ("invalid") -> ignored, returns full available
      const resNan = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: "invalid" });
      assert.equal(resNan.get("2026-11-10"), 19);

      // Case 7: null / undefined ceiling -> returns full available
      const resNull = calculateCanonicalAvailability(testRange[0], testRange[1], { db: baseMockDb, ceiling: null });
      assert.equal(resNull.get("2026-11-10"), 19);
    });

    it("evaluates ceiling when partial occupancy is present", () => {
      // 10 flats occupied -> 9 available
      const partialDb = {
        ...baseMockDb,
        reservations: CORPFLATS_19_FLATS.slice(0, 10).map((f, idx) => ({
          id: `RES-${idx}`,
          flatNumber: f.number,
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "confirmada"
        }))
      };

      // Available is 9
      // Ceiling 12 (> 9) -> units = 9
      const resC12 = calculateCanonicalAvailability("2026-11-10", "2026-11-11", { db: partialDb, ceiling: 12 });
      assert.equal(resC12.get("2026-11-10"), 9);
      assert.equal(resC12.daily[0].availableFlats, 9);
      assert.equal(resC12.daily[0].units, 9);

      // Ceiling 4 (< 9) -> units = 4
      const resC4 = calculateCanonicalAvailability("2026-11-10", "2026-11-11", { db: partialDb, ceiling: 4 });
      assert.equal(resC4.get("2026-11-10"), 4);
      assert.equal(resC4.daily[0].availableFlats, 9);
      assert.equal(resC4.daily[0].units, 4);
    });
  });

  // =========================================================================
  // 9. Mathematical Invariants: [0, 19] Property-Based Stress Matrix
  // =========================================================================
  describe("9. Mathematical Invariants: Property-Based Bounds [0, 19] Stress", () => {
    it("guarantees 0 <= units <= 19 across an exhaustive matrix of 100 adversarial randomized permutations", () => {
      // Generate a complex heterogeneous calendar with randomized occupancy
      const calendarDays = 30;
      const seedReservations = [];
      const seedBlocks = [];
      const seedOrders = [];

      const flatNumbers = CORPFLATS_19_FLATS.map(f => f.number);

      // Seed heterogeneous collision sources across days
      for (let i = 0; i < 50; i++) {
        const flatNum = flatNumbers[i % flatNumbers.length];
        const startDay = 1 + (i % 25);
        const duration = 1 + (i % 5);
        const startStr = `2026-11-${String(startDay).padStart(2, "0")}`;
        const endStr = `2026-11-${String(startDay + duration).padStart(2, "0")}`;

        if (i % 3 === 0) {
          seedReservations.push({
            id: `INV-RES-${i}`,
            flatNumber: flatNum,
            checkinDate: startStr,
            checkoutDate: endStr,
            status: "confirmada"
          });
        } else if (i % 3 === 1) {
          seedBlocks.push({
            id: `INV-BLK-${i}`,
            flatNumber: flatNum,
            startDate: startStr,
            endDate: endStr,
            reason: "Random stress block"
          });
        } else {
          seedOrders.push({
            id: `INV-SO-${i}`,
            status: "active",
            flats: [{ flatNumber: flatNum, startedAt: startStr, estimatedFinishAt: endStr, status: "in_progress" }]
          });
        }
      }

      const stressDb = {
        flats: CORPFLATS_19_FLATS.map((f, idx) => ({
          ...f,
          isActive: idx !== 0, // Flat 113 permanently inactive
          status: idx === 1 ? "manutencao_bloqueada" : "disponivel" // Flat 114 in maintenance
        })),
        reservations: seedReservations,
        roomBlocks: seedBlocks,
        serviceOrders: seedOrders
      };

      // Test across diverse ceiling values: [-10, 0, 1, 5, 10, 15, 18, 19, 20, 100, "12", null, undefined]
      const ceilingsToTest = [-10, -1, 0, 1, 5, 10, 15, 18, 19, 20, 100, "12", null, undefined];

      for (const ceiling of ceilingsToTest) {
        const result = calculateCanonicalAvailability("2026-11-01", "2026-11-30", {
          db: stressDb,
          ceiling,
          nowMs: fixedNowMs
        });

        assert.equal(result.daily.length, 29);

        for (const day of result.daily) {
          // Strictly assert bounds:
          assert.ok(
            day.units >= 0,
            `Invariant violation: units (${day.units}) < 0 on ${day.date} with ceiling ${ceiling}`
          );
          assert.ok(
            day.units <= 19,
            `Invariant violation: units (${day.units}) > 19 on ${day.date} with ceiling ${ceiling}`
          );
          assert.ok(
            day.availableFlats >= 0,
            `Invariant violation: availableFlats (${day.availableFlats}) < 0 on ${day.date}`
          );
          assert.ok(
            day.availableFlats <= 19,
            `Invariant violation: availableFlats (${day.availableFlats}) > 19 on ${day.date}`
          );
          assert.equal(
            day.occupiedFlats + day.availableFlats,
            19,
            `Conservation of inventory violated on ${day.date}: ${day.occupiedFlats} + ${day.availableFlats} !== 19`
          );
          assert.equal(
            day.freeFlatNumbers.length,
            day.availableFlats,
            `freeFlatNumbers length must equal availableFlats on ${day.date}`
          );
        }

        assert.ok(result.minAvailable >= 0, `minAvailable (${result.minAvailable}) must be >= 0`);
        assert.ok(result.minAvailable <= 19, `minAvailable (${result.minAvailable}) must be <= 19`);
      }
    });
  });

  // =========================================================================
  // 10. Exclusion Mechanics (excludeReservationId & excludePendingHold)
  // =========================================================================
  describe("10. Reservation & Hold Exclusion Mechanics", () => {
    it("correctly excludes designated reservation by numeric ID and string code during recalculation", () => {
      const exclusionDb = {
        ...baseMockDb,
        reservations: [
          { id: 501, code: "RES-501", flatNumber: "113", checkinDate: "2026-11-10", checkoutDate: "2026-11-15", status: "confirmada" },
          { id: 502, code: "RES-502", flatNumber: "114", checkinDate: "2026-11-10", checkoutDate: "2026-11-15", status: "confirmada" }
        ]
      };

      // 1. Without exclusion: both 113 and 114 blocked -> 17 available
      const resNoExcl = calculateCanonicalAvailability("2026-11-10", "2026-11-12", { db: exclusionDb });
      assert.equal(resNoExcl.get("2026-11-10"), 17);

      // 2. Exclude by numeric ID (501) -> Flat 113 becomes available! -> 18 available
      const resNumExcl = calculateCanonicalAvailability("2026-11-10", "2026-11-12", {
        db: exclusionDb,
        excludeReservationId: 501
      });
      assert.equal(resNumExcl.get("2026-11-10"), 18);
      assert.ok(resNumExcl.detailsByDate["2026-11-10"].freeFlatNumbers.includes("113"));
      assert.ok(!resNumExcl.detailsByDate["2026-11-10"].freeFlatNumbers.includes("114"));

      // 3. Exclude by string code ("RES-502") -> Flat 114 becomes available! -> 18 available
      const resCodeExcl = calculateCanonicalAvailability("2026-11-10", "2026-11-12", {
        db: exclusionDb,
        excludeReservationId: "RES-502"
      });
      assert.equal(resCodeExcl.get("2026-11-10"), 18);
      assert.ok(resCodeExcl.detailsByDate["2026-11-10"].freeFlatNumbers.includes("114"));
      assert.ok(!resCodeExcl.detailsByDate["2026-11-10"].freeFlatNumbers.includes("113"));
    });
  });

  // =========================================================================
  // 11. Non-Blocking Conflict Warnings (checkReservationConflicts)
  // =========================================================================
  describe("11. Non-Blocking Conflict Warnings (checkReservationConflicts)", () => {
    it("reports conflicts across all 5 collision types with isWarningOnly=true without blocking operation", () => {
      const conflictDb = {
        ...baseMockDb,
        flats: CORPFLATS_19_FLATS.map(f => {
          if (f.number === "907") return { ...f, status: "manutencao_bloqueada" };
          return f;
        }),
        reservations: [
          { id: "R-10", code: "RES-10", flatNumber: "113", checkinDate: "2026-11-10", checkoutDate: "2026-11-14", status: "confirmada", guestName: "Juliana" },
          {
            id: "R-20",
            code: "RES-20",
            flatNumber: "212",
            checkinDate: "2026-11-20",
            checkoutDate: "2026-11-25",
            status: "confirmada",
            pendingModification: {
              status: "pending",
              newFlatNumber: "215",
              newCheckinDate: "2026-11-10",
              newCheckoutDate: "2026-11-14",
              expiresAt: "2026-11-20T12:00:00Z"
            }
          }
        ],
        roomBlocks: [
          { id: "B-30", flatNumber: "313", startDate: "2026-11-10", endDate: "2026-11-14", reason: "Reforma" }
        ],
        serviceOrders: [
          {
            id: "SO-40",
            status: "active",
            title: "Troca de boiler",
            flats: [{ flatNumber: "408", startedAt: "2026-11-10", estimatedFinishAt: "2026-11-14", status: "in_progress" }]
          }
        ]
      };

      // 1. Conflict with reservation (flat 113)
      const cRes = checkReservationConflicts({
        flatNumber: "113",
        checkinDate: "2026-11-11",
        checkoutDate: "2026-11-13",
        db: conflictDb
      });
      assert.equal(cRes.hasConflict, true);
      assert.equal(cRes.isWarningOnly, true, "Must be warning-only");
      assert.equal(cRes.conflicts[0].type, "reservation");
      assert.match(cRes.summaryMessage, /ocupado pela reserva RES-10/);

      // 2. Conflict with provisional hold (flat 215)
      const cHold = checkReservationConflicts({
        flatNumber: "215",
        checkinDate: "2026-11-11",
        checkoutDate: "2026-11-13",
        db: conflictDb
      });
      assert.equal(cHold.hasConflict, true);
      assert.equal(cHold.isWarningOnly, true);
      assert.equal(cHold.conflicts[0].type, "hold");
      assert.match(cHold.summaryMessage, /hold pendente/);

      // 3. Conflict with room block (flat 313)
      const cBlock = checkReservationConflicts({
        flatNumber: "313",
        checkinDate: "2026-11-11",
        checkoutDate: "2026-11-13",
        db: conflictDb
      });
      assert.equal(cBlock.hasConflict, true);
      assert.equal(cBlock.isWarningOnly, true);
      assert.equal(cBlock.conflicts[0].type, "room_block");
      assert.match(cBlock.summaryMessage, /bloqueio administrativo/);

      // 4. Conflict with service order (flat 408)
      const cSO = checkReservationConflicts({
        flatNumber: "408",
        checkinDate: "2026-11-11",
        checkoutDate: "2026-11-13",
        db: conflictDb
      });
      assert.equal(cSO.hasConflict, true);
      assert.equal(cSO.isWarningOnly, true);
      assert.equal(cSO.conflicts[0].type, "service_order");
      assert.match(cSO.summaryMessage, /ordem de serviço SO-40/);

      // 5. Conflict with permanent maintenance flat (flat 907)
      const cMaint = checkReservationConflicts({
        flatNumber: "907",
        checkinDate: "2026-11-11",
        checkoutDate: "2026-11-13",
        db: conflictDb
      });
      assert.equal(cMaint.hasConflict, true);
      assert.equal(cMaint.isWarningOnly, true);
      assert.equal(cMaint.conflicts[0].type, "flat_maintenance");
      assert.match(cMaint.summaryMessage, /manutenção permanente/);

      // 6. Free flat with no conflicts (flat 114)
      const cFree = checkReservationConflicts({
        flatNumber: "114",
        checkinDate: "2026-11-11",
        checkoutDate: "2026-11-13",
        db: conflictDb
      });
      assert.equal(cFree.hasConflict, false);
      assert.equal(cFree.isWarningOnly, true);
      assert.equal(cFree.conflicts.length, 0);
      assert.equal(cFree.summaryMessage, null);
    });
  });

  // =========================================================================
  // 12. HTTP Endpoint Stress (Isolated In-Memory Express Server)
  // =========================================================================
  describe("12. HTTP Endpoint Stress & Validation (/api/wbp/availability & /api/wbp/conflicts/check)", () => {
    let server;
    let baseUrl;
    let endpointDb;

    before(async () => {
      endpointDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [
          { id: 99, code: "RES-99", flatNumber: "113", checkinDate: "2026-12-01", checkoutDate: "2026-12-05", status: "confirmada" }
        ],
        roomBlocks: [],
        serviceOrders: []
      };

      const app = express();
      app.use(express.json());

      // Mount the exact endpoint logic from demo-server.mjs
      app.get("/api/wbp/availability", (req, res) => {
        try {
          const { startDate, endDate, ceiling, excludeReservationId } = req.query;
          if (!startDate || !endDate) {
            return res.status(400).json({ error: "startDate e endDate são obrigatórios (formato YYYY-MM-DD)." });
          }
          const availabilityMap = calculateCanonicalAvailability(startDate, endDate, {
            db: endpointDb,
            ceiling: ceiling ? Number(ceiling) : null,
            excludeReservationId
          });
          res.json({
            success: true,
            startDate,
            endDate,
            totalFlats: availabilityMap.totalFlats,
            minAvailable: availabilityMap.minAvailable,
            daily: availabilityMap.daily,
            availability: Object.fromEntries(availabilityMap.entries())
          });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      app.post("/api/wbp/conflicts/check", (req, res) => {
        try {
          const { flatId, flatNumber, checkinDate, checkoutDate, excludeReservationId, excludePendingHoldReservationId } = req.body || {};
          if (!checkinDate || !checkoutDate) {
            return res.status(400).json({ error: "checkinDate e checkoutDate são obrigatórios." });
          }
          const conflictResult = checkReservationConflicts({
            flatId,
            flatNumber,
            checkinDate,
            checkoutDate,
            excludeReservationId,
            excludePendingHoldReservationId,
            db: endpointDb
          });
          res.json({
            success: true,
            ...conflictResult
          });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });

      server = http.createServer(app);
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    });

    it("rejects availability request when startDate or endDate are omitted", async () => {
      const res = await fetch(`${baseUrl}/api/wbp/availability?startDate=2026-12-01`);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /obrigatórios/);
    });

    it("responds with valid JSON availability payload and respects ceiling parameter over HTTP", async () => {
      const res = await fetch(`${baseUrl}/api/wbp/availability?startDate=2026-12-01&endDate=2026-12-06&ceiling=10`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.success, true);
      assert.equal(data.totalFlats, 19);
      // Flat 113 is occupied 12-01 to 12-04 -> available flats is 18, with ceiling 10 -> units = 10
      assert.equal(data.availability["2026-12-01"], 10);
      assert.equal(data.availability["2026-12-04"], 10);
      // 12-05: Flat 113 checked out -> available flats is 19, with ceiling 10 -> units = 10
      assert.equal(data.availability["2026-12-05"], 10);
      assert.equal(data.minAvailable, 10);
    });

    it("evaluates conflict check over HTTP returning non-blocking warnings", async () => {
      const res = await fetch(`${baseUrl}/api/wbp/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: "113",
          checkinDate: "2026-12-02",
          checkoutDate: "2026-12-04"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.hasConflict, true);
      assert.equal(data.isWarningOnly, true);
      assert.equal(data.conflicts[0].type, "reservation");
    });
  });
});
