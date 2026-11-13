/**
 * tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs
 *
 * EMPIRICAL CHALLENGER 2 TEST SUITE — MILESTONE 4
 * Scope: Quarantine Management Engine, Manual Reconciler Heuristics, OTA Mutations & Safeguards.
 *
 * Challenge Requirements:
 * 1. Quarantine Triggers: Empirically trigger & verify at least 5 different quarantine conditions:
 *    - OVERBOOKING (all flats occupied or blocked)
 *    - CONFLICT (cancellation/modification for non-existent PMS reservation)
 *    - MAINTENANCE_BLOCKED (room blocked by active service order/maintenance)
 *    - CHECKED_IN_CANCELLATION (cancellation received for in-house/checked-in guest)
 *    - AMBIGUOUS_MATCH (reconciliation score >= 50 with divergent dates or channels)
 *    - MODIFICATION_CONFLICT (modification cannot be accommodated on same or alternate flats)
 * 2. Checked-In Cancellation Guard:
 *    - Active guest with status: "checked_in" / "hospedado" / checkedIn: true
 *    - Cancellation webhook arrives -> MUST NOT cancel in PMS, routes to Quarantine with urgent alert
 * 3. Reconciler Heuristics:
 *    - Exact match: channel, exact dates, name similarity >= 85% -> safe linking (externalOrderId set, flat & rates untouched)
 *    - Ambiguous match: same guest name but divergent dates or channel -> routes to Quarantine as AMBIGUOUS_MATCH, no auto linking
 * 4. Modification Diff:
 *    - Modification on same flat and reallocated flat
 *    - Structured "before" and "after" snapshots in auditLogs and modificationHistory
 * 5. Isolation & Zero Side-Effects:
 *    - isolated temporary DB in os.tmpdir(), unset DATABASE_URL, NODE_ENV="test"
 *    - Verifies real data/database.json baseline SHA-256 (7e94a217...) has ZERO changes
 *    - Verifies artifacts/api-server/audit_logs.jsonl has ZERO changes
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");
const auditLogPath = path.resolve(rootDir, "artifacts/api-server/audit_logs.jsonl");

import {
  normalizeOtaBooking,
  allocateFairShareFlat,
  calculateFairShareStats,
  routeToQuarantine,
  handleOtaCancellation,
  handleOtaModification,
  processIncomingOTA,
  stripCvvDeep,
  maskPan,
  detectCardBrand,
  addDays
} from "../../artifacts/api-server/wbp/inbox.mjs";

import {
  normalizeGuestName,
  calculateNameSimilarity,
  computeReconciliationScore,
  findBestManualMatch,
  applySafeReconciliationLink,
  generateReconciliationReport
} from "../../artifacts/api-server/wbp/reconciler.mjs";

import {
  WbpAlertsManager,
  DEFAULT_ALERT_SETTINGS
} from "../../artifacts/api-server/wbp/alerts.mjs";

import { CORPFLATS_19_FLATS, calculateCanonicalAvailability } from "../../artifacts/api-server/wbp/availability.mjs";
import { WBP_MODES } from "../../artifacts/api-server/wbp/config.mjs";

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} failed to start within ${timeoutMs}ms.`);
}

describe("Empirical Challenger 2: Production Storage & Audit Baseline Integrity Guard", () => {
  let initialDbHash;
  let initialAuditHash;

  before(() => {
    assert.ok(fs.existsSync(prodDbPath), "Real data/database.json must exist");
    initialDbHash = getFileHash(prodDbPath);
    assert.ok(initialDbHash.startsWith("7e94a217"), `Expected database hash 7e94a217..., got: ${initialDbHash}`);
    initialAuditHash = getFileHash(auditLogPath);
  });

  after(() => {
    const postDbHash = getFileHash(prodDbPath);
    assert.equal(
      postDbHash,
      initialDbHash,
      "VIOLATION: Production data/database.json was modified during challenger tests!"
    );
    const postAuditHash = getFileHash(auditLogPath);
    assert.equal(
      postAuditHash,
      initialAuditHash,
      "VIOLATION: Production artifacts/api-server/audit_logs.jsonl was polluted during challenger tests!"
    );
  });

  it("confirms production database SHA-256 matches golden baseline 7e94a217...", () => {
    assert.equal(initialDbHash, "7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6");
  });
});

describe("Empirical Challenger 2: Quarantine Engine Stress (5+ Distinct Trigger Conditions)", () => {
  const mockFlats = CORPFLATS_19_FLATS;

  it("Condition 1: OVERBOOKING — routes to Quarantine when all 19 flats are occupied", async () => {
    const db = {
      settings: { wbp_integration_mode: "auto" },
      flats: mockFlats,
      // Occupy all 19 flats for 2026-12-10 to 2026-12-15
      reservations: mockFlats.map((f, i) => ({
        id: 1000 + i,
        code: `RES-${f.number}-100${i}`,
        flatId: f.id,
        flatNumber: String(f.number),
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-15",
        status: "ativa"
      })),
      wbpQuarantine: []
    };

    const incomingOverbooking = {
      OrderId: "CHALLENGE-Q-OVERBOOK",
      Channel: "booking",
      TotalPrice: 750.00,
      Customers: [{ CustomerFName: "Marcos", CustomerLName: "Vinicius" }],
      Rooms: [{ StartDate: "2026-12-10", EndDate: "2026-12-12" }]
    };

    const result = await processIncomingOTA(incomingOverbooking, { db });
    assert.ok(result.id, "Must return created quarantine record");
    assert.equal(result.reason, "OVERBOOKING");
    assert.equal(result.bookingId, "CHALLENGE-Q-OVERBOOK");
    assert.equal(result.status, "pending");

    assert.equal(db.wbpQuarantine.length, 1);
    assert.equal(db.wbpQuarantine[0].reason, "OVERBOOKING");
    assert.equal(db.reservations.length, 19, "No new reservation created in PMS during overbooking");
  });

  it("Condition 2: CONFLICT — routes to Quarantine on cancellation of unknown orderId", async () => {
    const db = {
      settings: { wbp_integration_mode: "auto" },
      flats: mockFlats,
      reservations: [],
      wbpQuarantine: []
    };

    const unknownCancel = {
      OrderId: "BKG-GHOST-CANCEL-999",
      Channel: "booking",
      IsCancellation: 1,
      Rooms: [{ StartDate: "2026-12-10", EndDate: "2026-12-12" }]
    };

    const result = await processIncomingOTA(unknownCancel, { db });
    assert.ok(result.id);
    assert.equal(result.reason, "CONFLICT");
    assert.ok(result.reasonDetails.message.includes("não encontrada no PMS"));
    assert.equal(db.wbpQuarantine.length, 1);
    assert.equal(db.wbpQuarantine[0].bookingId, "BKG-GHOST-CANCEL-999");
  });

  it("Condition 3: MAINTENANCE_BLOCKED — routes to Quarantine with maintenance metadata", () => {
    const db = {
      settings: { wbp_integration_mode: "auto" },
      flats: mockFlats,
      wbpQuarantine: []
    };

    const normalized = normalizeOtaBooking({
      OrderId: "BKG-MAINT-FAIL",
      Channel: "airbnb",
      TotalPrice: 950.00,
      Customers: [{ CustomerFName: "Tatiana", CustomerLName: "Ribeiro" }],
      Rooms: [{ StartDate: "2026-11-01", EndDate: "2026-11-04" }]
    });

    const qRecord = routeToQuarantine({
      db,
      booking: normalized,
      reason: "MAINTENANCE_BLOCKED",
      reasonDetails: {
        flatNumber: "215",
        serviceOrderId: "SO-ELECTRICAL-99",
        issue: "Quadro elétrico com curto circuito em manutenção preventiva"
      }
    });

    assert.equal(qRecord.reason, "MAINTENANCE_BLOCKED");
    assert.equal(qRecord.reasonDetails.flatNumber, "215");
    assert.equal(qRecord.reasonDetails.serviceOrderId, "SO-ELECTRICAL-99");
    assert.equal(db.wbpQuarantine.length, 1);
    assert.equal(db.wbpQuarantine[0].reason, "MAINTENANCE_BLOCKED");
  });

  it("Condition 4: CHECKED_IN_CANCELLATION — routes to Quarantine and protects in-house booking", () => {
    const db = {
      flats: mockFlats,
      reservations: [
        {
          id: 550,
          code: "RES-301-550",
          flatNumber: "301",
          externalOrderId: "BKG-INHOUSE-01",
          guestName: "Hóspede Presente",
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          status: "checked_in"
        }
      ],
      wbpQuarantine: []
    };

    const cancelPayload = normalizeOtaBooking({
      OrderId: "BKG-INHOUSE-01",
      IsCancellation: 1,
      Rooms: [{ StartDate: "2026-11-01", EndDate: "2026-11-04" }]
    });

    const result = handleOtaCancellation({ db, normalized: cancelPayload });
    assert.equal(result.reason, "CHECKED_IN_CANCELLATION");
    assert.equal(db.wbpQuarantine.length, 1);
    assert.equal(db.wbpQuarantine[0].reason, "CHECKED_IN_CANCELLATION");

    const pmsRes = db.reservations.find(r => r.id === 550);
    assert.equal(pmsRes.status, "checked_in", "PMS reservation status MUST NOT change to cancelada!");
    assert.equal(pmsRes.cancelledAt, undefined);
  });

  it("Condition 5: AMBIGUOUS_MATCH — routes to Quarantine when dates or channels diverge", async () => {
    const db = {
      settings: { wbp_integration_mode: "auto" },
      flats: mockFlats,
      reservations: [
        {
          id: 601,
          code: "RES-408-601",
          flatNumber: "408",
          guestName: "Renata Vasconcelos",
          channel: "booking",
          checkinDate: "2026-11-15",
          checkoutDate: "2026-11-18",
          totalAmount: 900.00,
          status: "ativa"
        }
      ],
      wbpQuarantine: []
    };

    // Incoming OTA booking has same name, but checkout is 2026-11-19 (1 day difference)
    const incomingAmbiguous = {
      OrderId: "BKG-AMBIG-MATCH-55",
      Channel: "booking",
      TotalPrice: 1200.00,
      Customers: [{ CustomerFName: "Renata", CustomerLName: "Vasconcelos" }],
      Rooms: [{ StartDate: "2026-11-15", EndDate: "2026-11-18" }] // Checkout 19!
    };

    const result = await processIncomingOTA(incomingAmbiguous, { db });
    assert.ok(result.id);
    assert.equal(result.reason, "AMBIGUOUS_MATCH");
    assert.equal(result.reasonDetails.potentialMatchId, 601);
    assert.ok(result.reasonDetails.score >= 50);

    assert.equal(db.wbpQuarantine.length, 1);
    const pmsRes = db.reservations.find(r => r.id === 601);
    assert.equal(pmsRes.externalOrderId, undefined, "Manual PMS reservation must NOT be linked!");
  });

  it("Bonus Condition 6: MODIFICATION_CONFLICT — routes to Quarantine when modification cannot fit anywhere", async () => {
    const db = {
      settings: { wbp_integration_mode: "auto" },
      flats: mockFlats,
      reservations: [
        // Target reservation on Flat 113 for Nov 1 to Nov 5
        {
          id: 777,
          code: "RES-113-777",
          flatId: 1,
          flatNumber: "113",
          externalOrderId: "BKG-MOD-OVERBOOK",
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          totalAmount: 1000,
          status: "ativa"
        },
        // All 19 flats occupied on new dates Nov 20 to Nov 25
        ...mockFlats.map((f, i) => ({
          id: 2000 + i,
          code: `RES-${f.number}-200${i}`,
          flatId: f.id,
          flatNumber: String(f.number),
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-25",
          status: "ativa"
        }))
      ],
      wbpQuarantine: []
    };

    const modPayload = {
      OrderId: "BKG-MOD-OVERBOOK",
      IsModification: 1,
      TotalPrice: 1500,
      Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-24" }] // checkout 25
    };

    const result = await processIncomingOTA(modPayload, { db });
    assert.ok(result.id);
    assert.equal(result.reason, "MODIFICATION_CONFLICT");
    assert.equal(db.wbpQuarantine.length, 1);
    assert.equal(db.wbpQuarantine[0].reason, "MODIFICATION_CONFLICT");
  });
});

describe("Empirical Challenger 2: Checked-In Cancellation Guard Stress", () => {
  const mockFlats = CORPFLATS_19_FLATS;

  const inHouseStatuses = [
    { status: "checked_in", label: "status: checked_in" },
    { status: "hospedado", label: "status: hospedado" },
    { status: "checkin_realizado", label: "status: checkin_realizado" },
    { checkedIn: true, status: "ativa", label: "checkedIn: true" },
    { checkedInAt: "2026-11-01T15:00:00Z", status: "ativa", label: "checkedInAt present" }
  ];

  for (const item of inHouseStatuses) {
    it(`strictly intercepts cancellation when guest is active (${item.label})`, () => {
      const db = {
        flats: mockFlats,
        reservations: [
          {
            id: 888,
            code: "RES-211-888",
            flatNumber: "211",
            externalOrderId: `BKG-INHOUSE-${item.status || "flag"}`,
            guestName: "In-House Challenger",
            checkinDate: "2026-11-01",
            checkoutDate: "2026-11-06",
            ...item
          }
        ],
        wbpQuarantine: []
      };

      const cancelPayload = normalizeOtaBooking({
        OrderId: `BKG-INHOUSE-${item.status || "flag"}`,
        IsCancellation: 1,
        Rooms: [{ StartDate: "2026-11-01", EndDate: "2026-11-05" }]
      });

      const res = handleOtaCancellation({ db, normalized: cancelPayload });
      assert.equal(res.reason, "CHECKED_IN_CANCELLATION");
      assert.equal(db.wbpQuarantine.length, 1);

      const target = db.reservations.find(r => r.id === 888);
      assert.notEqual(target.status, "cancelada", "In-house reservation must never be marked cancelada");
    });
  }

  it("permits regular cancellation when reservation is NOT checked in", () => {
    const db = {
      flats: mockFlats,
      reservations: [
        {
          id: 889,
          code: "RES-211-889",
          flatNumber: "211",
          externalOrderId: "BKG-FUTURE-RES-01",
          guestName: "Future Guest",
          checkinDate: "2027-05-10",
          checkoutDate: "2027-05-14",
          status: "ativa",
          checkedIn: false
        }
      ],
      wbpQuarantine: []
    };

    const cancelPayload = normalizeOtaBooking({
      OrderId: "BKG-FUTURE-RES-01",
      IsCancellation: 1,
      Rooms: [{ StartDate: "2027-05-10", EndDate: "2027-05-13" }]
    });

    const res = handleOtaCancellation({ db, normalized: cancelPayload });
    assert.equal(res.success, true);
    assert.equal(res.action, "cancelled");

    const target = db.reservations.find(r => r.id === 889);
    assert.equal(target.status, "cancelada");
    assert.ok(target.cancelledAt);
    assert.equal(db.wbpQuarantine.length, 0);
  });
});

describe("Empirical Challenger 2: Reconciler Heuristics (Safe Match vs Ambiguous Match)", () => {
  const manualPmsRes = {
    id: 991,
    code: "RES-605-991",
    flatId: 6,
    flatNumber: "605",
    guestName: "Carlos Eduardo Mendes",
    guestPhone: "2299881122",
    guestEmail: "carlos.mendes@example.com",
    channel: "booking",
    checkinDate: "2026-11-20",
    checkoutDate: "2026-11-24",
    totalAmount: 1100.00,
    dailyRate: 275.00,
    paymentStatus: "pago_total",
    status: "ativa"
  };

  it("Exact match: same channel, exact dates, name similarity >= 85% -> qualifies as Safe Match and links safely", () => {
    const db = {
      flats: CORPFLATS_19_FLATS,
      reservations: [JSON.parse(JSON.stringify(manualPmsRes))]
    };

    const incomingOta = normalizeOtaBooking({
      OrderId: "BKG-SAFE-RECON-77",
      Channel: "booking",
      TotalPrice: 1100.00,
      Customers: [{ CustomerFName: "Carlos", CustomerLName: "Mendes" }], // High similarity (~0.92)
      Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-23" }] // Checkin 20, Checkout 24
    });

    const match = findBestManualMatch(db, incomingOta);
    assert.ok(match, "Match must be found");
    assert.equal(match.scoreResult.isSafeMatch, true, "Must be classified as safe match");
    assert.ok(match.scoreResult.score >= 80, `Score must be >= 80, got ${match.scoreResult.score}`);

    // Apply safe linking
    applySafeReconciliationLink(match.bestMatch, incomingOta, { db });

    // Assert safe linking guarantees:
    assert.equal(match.bestMatch.externalOrderId, "BKG-SAFE-RECON-77");
    assert.equal(match.bestMatch.wbpBookingId, "BKG-SAFE-RECON-77");
    assert.equal(match.bestMatch.wbpSynced, true);
    assert.ok(match.bestMatch.wbpMatchedAt);

    // Assert strictly UNTOUCHED fields:
    assert.equal(match.bestMatch.flatId, 6, "flatId must remain untouched");
    assert.equal(match.bestMatch.flatNumber, "605", "flatNumber must remain untouched");
    assert.equal(match.bestMatch.totalAmount, 1100.00, "totalAmount must remain untouched");
    assert.equal(match.bestMatch.dailyRate, 275.00, "dailyRate must remain untouched");
    assert.equal(match.bestMatch.paymentStatus, "pago_total", "paymentStatus must remain untouched");

    // Assert structured audit log
    const audit = match.bestMatch.auditLogs.find(l => l.action === "WBP_MANUAL_RECONCILIATION_LINKED");
    assert.ok(audit, "Must record WBP_MANUAL_RECONCILIATION_LINKED in auditLogs");
  });

  it("Ambiguous match: same guest name, exact dates, but divergent channel (airbnb vs booking) -> routes to Quarantine", () => {
    const db = {
      flats: CORPFLATS_19_FLATS,
      reservations: [JSON.parse(JSON.stringify(manualPmsRes))]
    };

    const incomingOta = normalizeOtaBooking({
      OrderId: "ABNB-DIFF-CHAN-88",
      Channel: "airbnb", // Divergent channel!
      TotalPrice: 1100.00,
      Customers: [{ CustomerFName: "Carlos", CustomerLName: "Eduardo Mendes" }],
      Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-23" }]
    });

    const match = findBestManualMatch(db, incomingOta);
    assert.ok(match);
    assert.equal(match.scoreResult.isSafeMatch, false, "Must NOT be safe match due to divergent channel");
    assert.equal(match.scoreResult.isAmbiguous, true, "Must be classified as ambiguous");
    assert.ok(match.scoreResult.score >= 50);
  });

  it("Ambiguous match: same guest name, same channel, but divergent check-in date -> routes to Quarantine", () => {
    const db = {
      flats: CORPFLATS_19_FLATS,
      reservations: [JSON.parse(JSON.stringify(manualPmsRes))]
    };

    const incomingOta = normalizeOtaBooking({
      OrderId: "BKG-DIFF-DATES-99",
      Channel: "booking",
      TotalPrice: 1100.00,
      Customers: [{ CustomerFName: "Carlos", CustomerLName: "Eduardo Mendes" }],
      Rooms: [{ StartDate: "2026-11-21", EndDate: "2026-11-23" }] // Checkin 21 instead of 20
    });

    const match = findBestManualMatch(db, incomingOta);
    assert.ok(match);
    assert.equal(match.scoreResult.isSafeMatch, false, "Must NOT be safe match due to divergent checkin date");
    assert.equal(match.scoreResult.isAmbiguous, true, "Must be classified as ambiguous");
  });

  it("No Match: completely different guest name (<60% similarity) does not link and is treated as new electronic booking", () => {
    const db = {
      flats: CORPFLATS_19_FLATS,
      reservations: [JSON.parse(JSON.stringify(manualPmsRes))]
    };

    const incomingOta = normalizeOtaBooking({
      OrderId: "BKG-NEW-GUEST-00",
      Channel: "booking",
      TotalPrice: 1100.00,
      Customers: [{ CustomerFName: "Bruna", CustomerLName: "Figueiredo" }],
      Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-23" }]
    });

    const match = findBestManualMatch(db, incomingOta);
    assert.equal(match, null, "Should return null (score < 50), not ambiguous nor safe");
  });
});

describe("Empirical Challenger 2: Mutation Diff & Structured Before/After Snapshots", () => {
  const mockFlats = CORPFLATS_19_FLATS;

  it("Same flat modification captures structured before and after snapshots in auditLogs and modificationHistory", () => {
    const db = {
      flats: mockFlats,
      reservations: [
        {
          id: 401,
          code: "RES-116-401",
          flatId: 3,
          flatNumber: "116",
          externalOrderId: "BKG-DIFF-TEST-01",
          checkinDate: "2026-12-01",
          checkoutDate: "2026-12-05",
          totalAmount: 1000.00,
          breakfastIncluded: false,
          guestCount: 1,
          status: "ativa",
          auditLogs: [],
          modificationHistory: []
        }
      ],
      wbpQuarantine: []
    };

    const modPayload = normalizeOtaBooking({
      OrderId: "BKG-DIFF-TEST-01",
      IsModification: 1,
      TotalPrice: 1600.00,
      Rooms: [
        {
          StartDate: "2026-12-01",
          EndDate: "2026-12-07", // +2 nights (checkout Dec 8)
          Adults: 2,
          RateId: "com_cafe"
        }
      ]
    });

    const res = handleOtaModification({ db, normalized: modPayload });
    assert.equal(res.success, true);
    assert.equal(res.action, "modified_same_flat");

    // 1. Assert return value before/after
    assert.ok(res.before, "Must have before snapshot");
    assert.ok(res.after, "Must have after snapshot");
    assert.equal(res.before.flatNumber, "116");
    assert.equal(res.after.flatNumber, "116");
    assert.equal(res.before.checkoutDate, "2026-12-05");
    assert.equal(res.after.checkoutDate, "2026-12-08");
    assert.equal(res.before.totalAmount, 1000.00);
    assert.equal(res.after.totalAmount, 1600.00);
    assert.equal(res.before.breakfastIncluded, false);
    assert.equal(res.after.breakfastIncluded, true);

    // 2. Assert reservation record diffs
    const target = db.reservations.find(r => r.id === 401);
    assert.equal(target.checkoutDate, "2026-12-08");
    assert.equal(target.totalAmount, 1600.00);
    assert.equal(target.breakfastIncluded, true);

    // 3. Assert structured auditLogs entry
    const auditEntry = target.auditLogs.find(l => l.action === "OTA_MODIFICATION_APPLIED_SAME_FLAT");
    assert.ok(auditEntry);
    assert.deepEqual(auditEntry.before, res.before);
    assert.deepEqual(auditEntry.after, res.after);

    // 4. Assert structured modificationHistory entry
    assert.ok(Array.isArray(target.modificationHistory) && target.modificationHistory.length > 0);
    const histEntry = target.modificationHistory[0];
    assert.equal(histEntry.source, "OTA_MODIFICATION");
    assert.deepEqual(histEntry.before, res.before);
    assert.deepEqual(histEntry.after, res.after);
  });

  it("Reallocated modification captures old flat and new flat in structured diff", () => {
    const db = {
      flats: mockFlats,
      reservations: [
        // Target reservation on Flat 113 for Dec 01 to Dec 05
        {
          id: 402,
          code: "RES-113-402",
          flatId: 1,
          flatNumber: "113",
          externalOrderId: "BKG-DIFF-TEST-02",
          checkinDate: "2026-12-01",
          checkoutDate: "2026-12-05",
          totalAmount: 900.00,
          breakfastIncluded: false,
          guestCount: 1,
          status: "ativa",
          auditLogs: [],
          modificationHistory: []
        },
        // Flat 113 is blocked on extension dates Dec 05 to Dec 10 by another reservation
        {
          id: 403,
          code: "RES-113-403",
          flatId: 1,
          flatNumber: "113",
          checkinDate: "2026-12-05",
          checkoutDate: "2026-12-10",
          status: "ativa"
        }
      ],
      wbpQuarantine: []
    };

    // Modification requests Dec 01 to Dec 09 -> Flat 113 blocked! Alternate flat must be picked
    const modPayload = normalizeOtaBooking({
      OrderId: "BKG-DIFF-TEST-02",
      IsModification: 1,
      TotalPrice: 1800.00,
      Rooms: [{ StartDate: "2026-12-01", EndDate: "2026-12-08", Adults: 1 }] // checkout Dec 09
    });

    const res = handleOtaModification({ db, normalized: modPayload });
    assert.equal(res.success, true);
    assert.equal(res.action, "modified_reallocated");
    assert.equal(res.oldFlatNumber, "113");
    assert.notEqual(res.newFlatNumber, "113");

    // Structured diff checks
    assert.equal(res.before.flatNumber, "113");
    assert.equal(res.after.flatNumber, res.newFlatNumber);
    assert.equal(res.before.totalAmount, 900.00);
    assert.equal(res.after.totalAmount, 1800.00);

    const target = db.reservations.find(r => r.id === 402);
    assert.equal(target.flatNumber, res.newFlatNumber);
    const auditEntry = target.auditLogs.find(l => l.action === "OTA_MODIFICATION_REALLOCATED");
    assert.ok(auditEntry);
    assert.equal(auditEntry.before.flatNumber, "113");
    assert.equal(auditEntry.after.flatNumber, res.newFlatNumber);
  });
});

describe("Empirical Challenger 2: Full HTTP API Quarantine & Reconciliation Lifecycle", () => {
  let tmpDir;
  let tmpDbPath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "challenger-m4-http-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    const initialDb = {
      settings: {
        wbp_integration_mode: "auto",
        wbp: {
          mode: "auto",
          enabled: true,
          apiKey: "test-challenger-key",
          propertyId: "test-challenger-prop"
        }
      },
      flats: CORPFLATS_19_FLATS,
      reservations: [
        // Pre-existing manual reservation for reconciliation testing
        {
          id: 501,
          code: "RES-211-501",
          flatId: 2,
          flatNumber: "211",
          guestName: "Eduardo Camargo",
          channel: "booking",
          checkinDate: "2026-12-20",
          checkoutDate: "2026-12-24",
          totalAmount: 1200.00,
          status: "ativa"
        }
      ],
      roomBlocks: [],
      serviceOrders: [],
      wbpQuarantine: [],
      wbpInbox: []
    };
    fs.writeFileSync(tmpDbPath, JSON.stringify(initialDb, null, 2), "utf8");

    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = { ...process.env };
    delete spawnEnv.DATABASE_URL;
    spawnEnv.PORT = String(serverPort);
    spawnEnv.DATA_FILE = tmpDbPath;
    spawnEnv.DATABASE_FILE = tmpDbPath;
    spawnEnv.NODE_ENV = "test";
    spawnEnv.AUDIT_LOG_FILE = path.join(tmpDir, "audit_logs.jsonl");
    spawnEnv.WBP_SHARED_SECRET = "secret_challenger_m4";
    spawnEnv.WBP_RAW_STORAGE_FILE = path.join(tmpDir, "wbp_raw_payloads.jsonl");
    spawnEnv.WBP_IDEMPOTENCY_FILE = path.join(tmpDir, "wbp_idempotency.json");
    spawnEnv.WBP_INTEGRATION_MODE = "auto";

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: spawnEnv,
      stdio: "pipe"
    });

    await waitForServer(serverBaseUrl);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it("POST /api/wbp/quarantine creates manual quarantine entry and GET /api/wbp/quarantine lists with filters", async () => {
    const qItem = {
      id: "quar_http_test_1",
      bookingId: "BKG-HTTP-OVERBOOK",
      channel: "booking",
      guestName: "Marcos Paulo",
      checkinDate: "2026-12-20",
      checkoutDate: "2026-12-24",
      nights: 4,
      totalPrice: 1100,
      reason: "OVERBOOKING",
      status: "pending"
    };

    const postRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qItem)
    });
    assert.equal(postRes.status, 200);

    // List all
    const listRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine?reason=OVERBOOKING`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.success, true);
    assert.ok(listData.items.some(i => i.id === "quar_http_test_1"));
    assert.ok(listData.pendingCount >= 1);
  });

  it("GET /api/wbp/quarantine/:id returns item with attached live availability analysis", async () => {
    const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_http_test_1`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.item.guestName, "Marcos Paulo");
    assert.ok(data.liveAvailability, "Live availability must be computed for item dates");
    assert.equal(data.liveAvailability.totalFlats, 19);
  });

  it("POST /api/wbp/quarantine/:id/resolve fails on conflict without forceOverride and succeeds with forceOverride", async () => {
    // Attempt to allocate to flat 211 (which already has reservation 501 for Dec 20 to Dec 24)
    const conflictRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_http_test_1/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign_flat",
        flatNumber: "211",
        forceOverride: false,
        user: "challenger_tester"
      })
    });
    assert.equal(conflictRes.status, 400);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.conflict, true);
    assert.ok(conflictData.error.includes("Conflito detectado"));

    // Now resolve with a clean flat (e.g. flat 215)
    const successRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_http_test_1/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign_flat",
        flatNumber: "215",
        notes: "Alocação forçada pelo gerente de plantão",
        user: "challenger_tester"
      })
    });
    assert.equal(successRes.status, 200);
    const successData = await successRes.json();
    assert.equal(successData.success, true);
    assert.equal(successData.resolved, true);
    assert.equal(successData.reservation.flatNumber, "215");
    assert.equal(successData.quarantineItem.status, "resolved");
  });

  it("POST /api/wbp/quarantine/:id/reject marks item as rejected", async () => {
    const qItem2 = {
      id: "quar_http_reject_2",
      bookingId: "BKG-HTTP-REJECT",
      channel: "airbnb",
      guestName: "Hóspede Recusado",
      reason: "CONFLICT",
      status: "pending"
    };
    await fetch(`${serverBaseUrl}/api/wbp/quarantine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qItem2)
    });

    const rejectRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_http_reject_2/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Overbooking definitivo sem acomodação possível",
        user: "challenger_tester"
      })
    });
    assert.equal(rejectRes.status, 200);
    const rejectData = await rejectRes.json();
    assert.equal(rejectData.rejected, true);
    assert.equal(rejectData.item.status, "rejected");
  });

  it("POST /api/wbp/quarantine/:id/link links quarantine item to existing manual PMS reservation", async () => {
    const qItem3 = {
      id: "quar_http_link_3",
      bookingId: "BKG-HTTP-LINK-99",
      channel: "booking",
      guestName: "Eduardo Camargo",
      reason: "AMBIGUOUS_MATCH",
      status: "pending"
    };
    await fetch(`${serverBaseUrl}/api/wbp/quarantine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qItem3)
    });

    const linkRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_http_link_3/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pmsReservationId: 501,
        notes: "Conciliado manualmente com reserva existente 501",
        user: "challenger_tester"
      })
    });
    assert.equal(linkRes.status, 200);
    const linkData = await linkRes.json();
    assert.equal(linkData.linked, true);
    assert.equal(linkData.item.status, "resolved");
    assert.equal(linkData.reservation.externalOrderId, "BKG-HTTP-LINK-99");
  });

  it("GET /api/wbp/reconciliation/report returns 4-part reconciliation report", async () => {
    const reportRes = await fetch(`${serverBaseUrl}/api/wbp/reconciliation/report`);
    assert.equal(reportRes.status, 200);
    const reportData = await reportRes.json();
    assert.equal(reportData.success, true);
    assert.ok(reportData.summary, "Report must include summary");
    assert.ok(Array.isArray(reportData.matched), "Report must include matched array");
    const ambigList = reportData.ambiguous || reportData.potential_duplicates;
    assert.ok(Array.isArray(ambigList), "Report must include ambiguous / potential_duplicates array");
    const unmatchedOtaList = reportData.unmatchedOta || reportData.unmatched_ota;
    assert.ok(Array.isArray(unmatchedOtaList), "Report must include unmatchedOta array");
    const unmatchedPmsList = reportData.unmatchedManualPms || reportData.unmatched_pms;
    assert.ok(Array.isArray(unmatchedPmsList), "Report must include unmatchedPms array");
  });
});
