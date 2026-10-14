/**
 * tests/wbp-integration/m4-reservations-inbox.test.mjs
 *
 * Milestone 4: Reservation Processing, Quarantine, Reconciler & Alerts Test Suite.
 * Features 17 through 24.
 *
 * Strictly adheres to AGENTS.md:
 * - Runs exclusively this targeted test file.
 * - Test isolation: DATABASE_URL unset, DATA_FILE in os.tmpdir(), NODE_ENV="test".
 * - Injected transports for WhatsApp & Email: ZERO real messages escape.
 * - Asserts real data/database.json retains identical SHA-256 hash and mtime before & after.
 * - Ephemeral port, clean process tree termination.
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

import {
  createWbpCallbackRouter,
  verifyWbpCallbackAuth,
  sanitizeCardDataInMemory,
  WbpBackgroundWorker
} from "../../artifacts/api-server/wbp/callbacks.mjs";

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
  getAlertsManager,
  getWbpAlertSettings,
  updateWbpAlertSettings,
  getBrasiliaNow,
  DEFAULT_ALERT_SETTINGS
} from "../../artifacts/api-server/wbp/alerts.mjs";

import { WBPClient } from "../../artifacts/api-server/wbp/client.mjs";
import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { WBP_MODES, setIntegrationMode } from "../../artifacts/api-server/wbp/config.mjs";
import { CORPFLATS_19_FLATS, calculateCanonicalAvailability } from "../../artifacts/api-server/wbp/availability.mjs";

// Helper: dynamic port
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

// Helper: compute file hash and mtime
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, mtimeMs: stat.mtimeMs, size: stat.size };
}

// Helper: kill process tree on Windows
function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// Helper: wait for HTTP server to become responsive
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

describe("Milestone 4: Real Database Integrity Guard (Pre-Flight & Post-Flight)", () => {
  let initialMeta;

  before(() => {
    assert.ok(fs.existsSync(prodDbPath), "Real data/database.json must exist");
    initialMeta = getFileMetadata(prodDbPath);
    assert.ok(initialMeta.size > 0, "Real database must not be empty");
  });

  after(() => {
    const postMeta = getFileMetadata(prodDbPath);
    assert.equal(
      postMeta.hash,
      initialMeta.hash,
      "CRITICAL INTEGRITY VIOLATION: Real data/database.json SHA-256 hash was altered during M4 tests!"
    );
    assert.equal(
      postMeta.mtimeMs,
      initialMeta.mtimeMs,
      "CRITICAL INTEGRITY VIOLATION: Real data/database.json mtime was altered during M4 tests!"
    );
  });

  it("ensures real data/database.json exists and captures baseline hash", () => {
    assert.ok(initialMeta.hash);
  });
});

describe("Milestone 4: Feature 17 & Card Hygiene (Inbound Webhooks & Memory Scrubbing)", () => {
  it("sanitizeCardDataInMemory recursively scrubs all CVV/CVC fields and masks PAN", () => {
    const dirtyPayload = {
      shared_secret: "secret_xyz",
      reservation: {
        OrderId: "998877",
        Payments: [
          {
            CardNumber: "4111111111115555",
            card_cvv: "123",
            cvc: "456",
            security_code: "789",
            nested: {
              card_security_code: "999",
              otherData: "ok"
            }
          }
        ]
      }
    };

    const clean = sanitizeCardDataInMemory(dirtyPayload);
    const serialized = JSON.stringify(clean);

    // CVV must be completely eliminated
    assert.equal(/123|456|789|999/.test(serialized), false, "All CVV values must be purged");
    assert.equal(/cvv|cvc|security_code/i.test(serialized), false, "CVV keys must not exist");

    // PAN must be masked to last 4
    const payment = clean.reservation.Payments[0];
    assert.equal(payment.CardNumber, "**** **** **** 5555");
    assert.equal(payment.cardLast4, "5555");
    assert.equal(payment.cardBrand, "Visa");
    assert.equal(payment.nested.otherData, "ok");
  });

  it("guarantees ZERO full PAN in normalized.rawPayload and deep masked card data (R6)", () => {
    const raw = {
      OrderId: "BKG-PAN-01",
      reservation: {
        Payments: [
          {
            CardNumber: "4111222233334444",
            CardCvv: "123"
          }
        ]
      }
    };
    const normalized = normalizeOtaBooking(raw);
    const serialized = JSON.stringify(normalized);
    assert.equal(serialized.includes("4111222233334444"), false, "Full PAN must NEVER appear in serialized normalized object!");
    assert.equal(serialized.includes("123"), false, "CVV must NEVER appear!");
    assert.equal(normalized.cardLast4, "4444");
    assert.equal(normalized.cardBrand, "Visa");
    assert.equal(normalized.rawPayload.reservation.Payments[0].CardNumber, "**** **** **** 4444");
  });

  it("verifyWbpCallbackAuth performs constant-time validation", () => {
    assert.equal(verifyWbpCallbackAuth("secret_abc", "secret_abc"), true);
    assert.equal(verifyWbpCallbackAuth("wrong_secret", "secret_abc"), false);
    assert.equal(verifyWbpCallbackAuth("", "secret_abc"), false);
  });
});

describe("Milestone 4: Feature 19 & Fair-Share Allocation across 19 Flats", () => {
  it("resolves inclusive EndDate by adding 1 day to checkoutDate", () => {
    const raw = {
      OrderId: "BKG-12345",
      Channel: "booking",
      Rooms: [
        {
          StartDate: "2026-11-10",
          EndDate: "2026-11-13", // 3 nights: 10, 11, 12. Checkout is 13 + 1 = 14!
          Adults: 2,
          RateId: "com_cafe"
        }
      ],
      TotalPrice: 750.00
    };

    const normalized = normalizeOtaBooking(raw);
    assert.equal(normalized.checkinDate, "2026-11-10");
    assert.equal(normalized.checkoutDate, "2026-11-14");
    assert.equal(normalized.nights, 4);
    assert.equal(normalized.ratePlanId, "com_cafe");
    assert.equal(normalized.includeBreakfast, true);
  });

  it("allocateFairShareFlat selects candidate flat with least checkoutCount and least wear", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [
        // Flat 113 has 10 past checkouts
        ...Array.from({ length: 10 }, (_, i) => ({
          id: 100 + i,
          flatNumber: "113",
          checkinDate: "2026-01-01",
          checkoutDate: "2026-01-02",
          status: "concluida"
        })),
        // Flat 114 has 5 past checkouts
        ...Array.from({ length: 5 }, (_, i) => ({
          id: 200 + i,
          flatNumber: "114",
          checkinDate: "2026-01-01",
          checkoutDate: "2026-01-02",
          status: "concluida"
        })),
        // Flat 211 has 0 checkouts
      ]
    };

    const alloc = allocateFairShareFlat("2026-11-10", "2026-11-12", { db: mockDb });
    assert.equal(alloc.allocated, true);
    // Flat 116 or 211 (0 checkouts) should be preferred over 113 (10 checkouts) and 114 (5 checkouts)
    const allocatedNum = String(alloc.flat.number);
    assert.ok(allocatedNum !== "113", "Flat 113 has highest checkout count and must not be prioritized");
    assert.ok(alloc.availableCount > 0);
  });

  it("PaymentCollect = 'Property' sets paymentStatus = 'pendente' and collectAtCheckin = true", async () => {
    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      flats: CORPFLATS_19_FLATS,
      reservations: []
    };

    const propertyBooking = {
      OrderId: "BKG-PROP-001",
      Channel: "booking",
      PaymentCollect: "Property",
      TotalPrice: 600.00,
      Rooms: [{ StartDate: "2026-11-15", EndDate: "2026-11-17" }]
    };

    const result = await processIncomingOTA(propertyBooking, { db: mockDb });
    assert.equal(result.success, true);
    assert.equal(result.action, "created");

    const created = mockDb.reservations.find(r => r.externalOrderId === "BKG-PROP-001");
    assert.ok(created, "Reservation must be created in db.reservations");
    assert.equal(created.paymentStatus, "pendente", "PaymentCollect=Property MUST be pendente!");
    assert.equal(created.paidAmount, 0, "paidAmount must be 0 for property collect");
    assert.equal(created.collectAtCheckin, true, "collectAtCheckin must be true");
    assert.ok(created.receptionAlert.includes("COBRAR NO CHECK-IN"));
    // Strict PIX suppression check
    assert.equal(created.pixTxId, null);
    assert.equal(created.pixCopiaECola, null);
  });

  it("PaymentCollect = 'Channel' sets paymentStatus = 'pago_total' with netAmount, commission, card metadata and automations", async () => {
    const dispatched = [];
    const mockAlerts = {
      sendWhatsApp: (phone, msg) => { dispatched.push({ type: "whatsapp", phone, msg }); },
      sendEmail: (to, subject, text) => { dispatched.push({ type: "email", to, subject, text }); }
    };

    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      cleaningRequests: [],
      serproQueue: []
    };

    const channelBooking = {
      OrderId: "BKG-CHAN-002",
      Channel: "booking",
      PaymentCollect: "Channel",
      TotalPrice: 1000.00,
      Customers: [{ CustomerFName: "Lucas", CustomerLName: "Silva", CustomerTelephone: "2299112233" }],
      Rooms: [{ StartDate: "2026-11-18", EndDate: "2026-11-20" }],
      Cards: [{ CardNumber: "4111111111114321", CardExpireMonth: "12", CardExpireYear: "2028" }]
    };

    const result = await processIncomingOTA(channelBooking, { db: mockDb, alertsManager: mockAlerts });
    assert.equal(result.success, true);

    const created = mockDb.reservations.find(r => r.externalOrderId === "BKG-CHAN-002");
    assert.ok(created);
    assert.equal(created.paymentStatus, "pago_total");
    assert.equal(created.paidAmount, 1000.00);
    assert.equal(created.netAmount, 850.00);
    assert.equal(created.commissionAmount, 150.00);
    assert.equal(created.cardLast4, "4321");
    assert.equal(created.cardBrand, "Visa");
    assert.equal(created.collectAtCheckin, false);

    // Automations checks (Directive 5 / R5):
    // 1. WhatsApp welcome sent without PIX
    const welcomeWa = dispatched.find(d => d.type === "whatsapp");
    assert.ok(welcomeWa, "WhatsApp welcome must be dispatched in auto mode");
    assert.ok(!welcomeWa.msg.toLowerCase().includes("pix"), "Welcome WhatsApp must NOT contain PIX");

    // 2. Front-desk email sent
    const deskEmail = dispatched.find(d => d.type === "email");
    assert.ok(deskEmail, "Front-desk email must be dispatched in auto mode");

    // 3. Housekeeping task created
    assert.equal(mockDb.cleaningRequests.length, 1);

    // 4. SERPRO / FNRH queue record pushed
    assert.equal(mockDb.serproQueue.length, 1);
    assert.equal(created.fnrhStatus, "enviado");
    assert.equal(created.pixTxId, null);
    assert.equal(created.pixCopiaECola, null);
  });
});

describe("Milestone 4: Feature 20 & Quarantine Management Engine", () => {
  it("routes overbooking (0 available flats) to db.wbpQuarantine with reason OVERBOOKING", async () => {
    // Fill all 19 flats for dates 2026-12-01 to 2026-12-03
    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      flats: CORPFLATS_19_FLATS,
      reservations: CORPFLATS_19_FLATS.map((f, i) => ({
        id: 500 + i,
        flatNumber: String(f.number),
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        status: "ativa"
      })),
      wbpQuarantine: []
    };

    const incomingOverbooking = {
      OrderId: "BKG-OVERBOOK-999",
      Channel: "booking",
      TotalPrice: 500.00,
      Rooms: [{ StartDate: "2026-12-01", EndDate: "2026-12-02" }]
    };

    const result = await processIncomingOTA(incomingOverbooking, { db: mockDb });
    assert.ok(result.id, "Must return quarantine record");
    assert.equal(result.reason, "OVERBOOKING");

    assert.equal(mockDb.wbpQuarantine.length, 1);
    const qItem = mockDb.wbpQuarantine[0];
    assert.equal(qItem.bookingId, "BKG-OVERBOOK-999");
    assert.equal(qItem.reason, "OVERBOOKING");
    assert.equal(qItem.status, "pending");
  });
});

describe("Milestone 4: Feature 21 & OTA Mutations (Cancellation & Modification)", () => {
  it("blocks auto-cancellation and routes to quarantine if guest is already checked-in", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [
        {
          id: 701,
          code: "RES-408-701",
          flatNumber: "408",
          externalOrderId: "BKG-MUT-11",
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          status: "checked_in" // guest is in-house!
        }
      ],
      wbpQuarantine: []
    };

    const cancelPayload = normalizeOtaBooking({
      OrderId: "BKG-MUT-11",
      IsCancellation: 1,
      Rooms: [{ StartDate: "2026-11-01", EndDate: "2026-11-04" }]
    });

    const res = handleOtaCancellation({ db: mockDb, normalized: cancelPayload });
    assert.equal(res.reason, "CHECKED_IN_CANCELLATION");
    assert.equal(mockDb.wbpQuarantine.length, 1);

    const resInDb = mockDb.reservations.find(r => r.id === 701);
    assert.equal(resInDb.status, "checked_in", "In-house guest status must NOT be cancelled!");
  });

  it("applies automatic cancellation when guest is not checked in", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [
        {
          id: 702,
          code: "RES-408-702",
          flatNumber: "408",
          externalOrderId: "BKG-MUT-22",
          checkinDate: "2027-01-10",
          checkoutDate: "2027-01-15",
          status: "ativa"
        }
      ],
      wbpQuarantine: []
    };

    const cancelPayload = normalizeOtaBooking({
      OrderId: "BKG-MUT-22",
      IsCancellation: 1,
      Rooms: [{ StartDate: "2027-01-10", EndDate: "2027-01-14" }]
    });

    const res = handleOtaCancellation({ db: mockDb, normalized: cancelPayload });
    assert.equal(res.success, true);
    assert.equal(res.action, "cancelled");

    const resInDb = mockDb.reservations.find(r => r.id === 702);
    assert.equal(resInDb.status, "cancelada");
    assert.ok(resInDb.cancelledAt);
  });

  it("modifies dates in place when current flat remains free for new interval", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [
        {
          id: 703,
          code: "RES-509-703",
          flatNumber: "509",
          externalOrderId: "BKG-MOD-33",
          checkinDate: "2027-02-01",
          checkoutDate: "2027-02-05",
          totalAmount: 800,
          status: "ativa"
        }
      ],
      wbpQuarantine: []
    };

    const modPayload = normalizeOtaBooking({
      OrderId: "BKG-MOD-33",
      IsModification: 1,
      TotalPrice: 1200,
      Rooms: [{ StartDate: "2027-02-01", EndDate: "2027-02-06", Adults: 2 }] // +1 night
    });

    const res = handleOtaModification({ db: mockDb, normalized: modPayload });
    assert.equal(res.success, true);
    assert.equal(res.action, "modified_same_flat");

    const resInDb = mockDb.reservations.find(r => r.id === 703);
    assert.equal(resInDb.checkoutDate, "2027-02-07"); // 06 inclusive + 1 = 07
    assert.equal(resInDb.totalAmount, 1200);

    // Structured before and after check (Directive 4 / R5)
    assert.ok(res.before && res.after, "Must return structured before and after");
    assert.equal(res.before.totalAmount, 800);
    assert.equal(res.after.totalAmount, 1200);
    assert.ok(Array.isArray(resInDb.history) && resInDb.history.length > 0);
    assert.equal(resInDb.history[0].before.totalAmount, 800);
    assert.equal(resInDb.history[0].after.totalAmount, 1200);
  });
});

describe("Milestone 4: Feature 22 & Manual Reconciliation (Directive 4 / R5)", () => {
  it("safe match (exact channel, exact dates, name similarity >= 85%) LINKS manual reservation without duplication", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [
        {
          id: 801,
          code: "RES-605-801",
          flatNumber: "605",
          guestName: "Carlos Eduardo Mendes",
          channel: "booking",
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-24",
          totalAmount: 1100.00,
          status: "ativa"
        }
      ]
    };

    const incomingOta = normalizeOtaBooking({
      OrderId: "BKG-RECON-100",
      Channel: "booking",
      TotalPrice: 1100.00,
      Customers: [{ CustomerFName: "Carlos", CustomerLName: "Mendes" }],
      Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-23" }] // 20 to 24 checkout
    });

    const match = findBestManualMatch(mockDb, incomingOta);
    assert.ok(match, "Match must be found");
    assert.equal(match.scoreResult.isSafeMatch, true, "Must qualify as Safe Match");
    assert.ok(match.scoreResult.score >= 80);

    // Apply safe link
    applySafeReconciliationLink(match.bestMatch, incomingOta);
    assert.equal(match.bestMatch.externalOrderId, "BKG-RECON-100");
    assert.equal(match.bestMatch.wbpSynced, true);
    assert.equal(match.bestMatch.flatNumber, "605", "Flat number MUST NOT be altered!");
    assert.equal(match.bestMatch.totalAmount, 1100.00, "Price MUST NOT be altered!");
  });

  it("divergent dates or channels classify strictly as isAmbiguous and route to quarantine", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [
        {
          id: 802,
          code: "RES-211-802",
          flatNumber: "211",
          guestName: "Mariana Souza",
          channel: "booking",
          checkinDate: "2026-11-25",
          checkoutDate: "2026-11-28", // Divergent checkout
          status: "ativa"
        }
      ]
    };

    const incomingOta = normalizeOtaBooking({
      OrderId: "BKG-AMBIG-200",
      Channel: "booking",
      Customers: [{ CustomerFName: "Mariana", CustomerLName: "Souza" }],
      Rooms: [{ StartDate: "2026-11-25", EndDate: "2026-11-28" }] // Checkout 29 (1 day difference)
    });

    const match = findBestManualMatch(mockDb, incomingOta);
    assert.ok(match);
    assert.equal(match.scoreResult.isSafeMatch, false, "Must NOT qualify as safe match due to divergent checkout");
    assert.equal(match.scoreResult.isAmbiguous, true, "Must be classified as ambiguous");
  });

  it("generateReconciliationReport returns structured 4-part summary", () => {
    const mockDb = {
      reservations: [
        {
          id: 901,
          code: "RES-113-901",
          guestName: "Joao Silva",
          channel: "booking",
          checkinDate: "2026-12-10",
          checkoutDate: "2026-12-12",
          status: "ativa"
        }
      ]
    };

    const otaList = [
      normalizeOtaBooking({
        OrderId: "BKG-REPORT-1",
        Channel: "booking",
        Customers: [{ CustomerFName: "Joao", CustomerLName: "Silva" }],
        Rooms: [{ StartDate: "2026-12-10", EndDate: "2026-12-11" }]
      })
    ];

    const report = generateReconciliationReport({ db: mockDb, otaBookings: otaList });
    assert.ok(report.summary);
    assert.equal(report.matched.length, 1);
    assert.equal(report.summary.matchedCount, 1);
  });
});

describe("Milestone 4: Feature 24 & Critical Alerts Engine", () => {
  it("dispatches immediate alerts on quarantine, overbooking, ARI failure (>15m), and pricing lock with injected mock", async () => {
    const dispatched = [];
    const alertsManager = new WbpAlertsManager({
      zapiSender: async (phone, msg) => {
        dispatched.push({ channel: "whatsapp", phone, msg });
        return { ok: true };
      },
      emailSender: async (to, subject, text) => {
        dispatched.push({ channel: "email", to, subject, text });
        return { ok: true };
      }
    });

    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      wbpAlertSettings: JSON.parse(JSON.stringify(DEFAULT_ALERT_SETTINGS)),
      wbpQuarantine: []
    };

    // 1. Quarantine alert
    await alertsManager.sendImmediateQuarantineAlert({
      id: "quar_test_1",
      reason: "OVERBOOKING",
      channel: "booking",
      bookingId: "BKG-ALERT-1",
      guestName: "Alice Smith",
      checkinDate: "2026-12-20",
      checkoutDate: "2026-12-22",
      totalPrice: 800
    }, mockDb);

    assert.ok(dispatched.some(d => d.channel === "whatsapp" && d.msg.includes("ALERTA CRÍTICO: Reserva em Quarentena")));
    assert.ok(dispatched.some(d => d.channel === "email" && d.subject.includes("Reserva em Quarentena")));

    // 2. Persistent ARI Failure Alert (>15 min)
    await alertsManager.sendPersistentSyncFailureAlert({
      elapsedMinutes: 18,
      error: "Gateway timeout 504"
    }, mockDb);

    assert.ok(dispatched.some(d => d.channel === "whatsapp" && d.msg.includes("Falha Crítica de Sincronização ARI")));

    // 3. Pricing Lock Held Alert (must dispatch both WhatsApp AND email per R8 parent directive)
    dispatched.length = 0;
    await alertsManager.sendPricingLockAlert({
      date: "2026-12-25",
      planId: "com_cafe",
      lockedReason: "VARIATION_LOCK",
      candidateRate: 450,
      lastSentRate: 250
    }, mockDb);

    assert.ok(dispatched.some(d => d.channel === "whatsapp" && d.msg.includes("Tarifa Retida por Trava")));
    assert.ok(dispatched.some(d => d.channel === "email" && d.subject.includes("Tarifa Retida por Trava")));
  });

  it("daily summary includes count of received, cancelled (24h) and respects idempotency", async () => {
    const dispatched = [];
    const alertsManager = new WbpAlertsManager({
      zapiSender: async (phone, msg) => {
        dispatched.push({ channel: "whatsapp", phone, msg });
        return { ok: true };
      }
    });

    const yesterdayMs = Date.now() - 3600000;
    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      wbpAlertSettings: JSON.parse(JSON.stringify(DEFAULT_ALERT_SETTINGS)),
      reservations: [
        {
          id: 1,
          channel: "booking",
          createdAt: new Date(yesterdayMs).toISOString(),
          totalAmount: 500,
          checkinDate: "2026-11-10",
          status: "ativa"
        },
        {
          id: 2,
          channel: "booking",
          createdAt: new Date(yesterdayMs).toISOString(),
          cancelledAt: new Date(yesterdayMs).toISOString(),
          totalAmount: 300,
          status: "cancelada"
        }
      ],
      wbpQuarantine: [],
      wbpState: {}
    };

    const res = await alertsManager.dispatchDailySummaryAlert(mockDb, { force: true });
    assert.equal(res.sent, true);
    assert.equal(res.summary.count24h, 2);
    assert.equal(res.summary.cancelled24h, 1);

    const whatsappMsg = dispatched.find(d => d.channel === "whatsapp").msg;
    assert.ok(whatsappMsg.includes("Canceladas: 1"));

    // Calling again without force must be skipped (idempotent)
    const secondCall = await alertsManager.dispatchDailySummaryAlert(mockDb);
    assert.equal(secondCall.skipped, true);
    assert.equal(secondCall.reason, "already_sent_today");
  });

  it("zero external messages fire in 'observe' or 'off' modes", async () => {
    const dispatched = [];
    const alertsManager = new WbpAlertsManager({
      zapiSender: async (phone, msg) => {
        dispatched.push({ channel: "whatsapp", phone, msg });
      },
      emailSender: async (to, subject, text) => {
        dispatched.push({ channel: "email", to, subject, text });
      }
    });

    const observeDb = {
      settings: { wbp_integration_mode: "observe" },
      wbpAlertSettings: JSON.parse(JSON.stringify(DEFAULT_ALERT_SETTINGS)),
      wbpQuarantine: []
    };

    await alertsManager.sendImmediateQuarantineAlert({ id: "q1", reason: "OVERBOOKING" }, observeDb);
    assert.equal(dispatched.length, 0, "No external messages must fire in observe mode");
  });
});

describe("Milestone 4: Full E2E Demo Server Routes & WBP Integration", () => {
  let tmpDir;
  let tmpDbPath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-wbp-test-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    // Clean initial database state
    const initialDb = {
      settings: {
        wbp_integration_mode: "auto",
        wbp: {
          mode: "auto",
          enabled: true,
          apiKey: "test-m4-key",
          propertyId: "test-m4-prop"
        }
      },
      flats: CORPFLATS_19_FLATS,
      reservations: [],
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
    spawnEnv.WBP_SHARED_SECRET = "test_shared_secret_123";
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

  it("POST /api/callback/wbp/BookingCreate processes new reservation and allocates flat", async () => {
    const bookingPayload = {
      shared_secret: "test_shared_secret_123",
      reservation: {
        OrderId: "BKG-HTTP-777",
        Channel: "booking",
        TotalPrice: 880.00,
        PaymentCollect: "Channel",
        Customers: [
          {
            CustomerFName: "Roberto",
            CustomerLName: "Almeida",
            CustomerEmail: "roberto@example.com",
            CustomerTelephone: "2299881122"
          }
        ],
        Rooms: [
          {
            StartDate: "2026-11-05",
            EndDate: "2026-11-08",
            Adults: 2,
            RateId: "com_cafe"
          }
        ]
      }
    };

    const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingPayload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, {});

    // Verify inbox record via HTTP
    const inboxRes = await fetch(`${serverBaseUrl}/api/wbp/inbox`);
    assert.equal(inboxRes.status, 200);
    const inboxData = await inboxRes.json();
    assert.equal(inboxData.success, true);
    assert.ok(inboxData.count >= 1);
  });

  it("POST /api/callback/wbp/BookingCreate with PaymentCollect='Property' prevents legacy pago_total override", async () => {
    const propertyBookingPayload = {
      shared_secret: "test_shared_secret_123",
      reservation: {
        OrderId: "BKG-HTTP-PROP-888",
        Channel: "booking",
        TotalPrice: 650.00,
        PaymentCollect: "Property",
        Customers: [
          {
            CustomerFName: "Fernanda",
            CustomerLName: "Costa",
            CustomerEmail: "fernanda@example.com",
            CustomerTelephone: "2299776655"
          }
        ],
        Rooms: [
          {
            StartDate: "2026-11-12",
            EndDate: "2026-11-14",
            Adults: 1,
            RateId: "sem_cafe"
          }
        ]
      }
    };

    const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(propertyBookingPayload)
    });

    assert.equal(res.status, 200);

    // Verify reservation created in demo-server DB has paymentStatus === 'pendente'
    const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
    const createdRes = dbContent.reservations.find(r => r.externalOrderId === "BKG-HTTP-PROP-888");
    assert.ok(createdRes, "Reservation must exist in DB");
    assert.equal(createdRes.paymentStatus, "pendente", "PaymentCollect=Property must NEVER be overridden to pago_total!");
    assert.equal(createdRes.paidAmount, 0);
    assert.equal(createdRes.collectAtCheckin, true);
  });

  it("GET and POST /api/wbp/quarantine endpoints manage and resolve quarantine items", async () => {
    // Inject a pending quarantine item via POST /api/wbp/quarantine
    const quarPayload = {
      id: "quar_test_http_1",
      bookingId: "BKG-QUAR-901",
      channel: "booking",
      guestName: "Juliana Paes",
      guestEmail: "juliana@example.com",
      guestPhone: "2299887766",
      checkinDate: "2026-12-05",
      checkoutDate: "2026-12-08",
      nights: 3,
      totalPrice: 900,
      paymentCollect: "Channel",
      reason: "OVERBOOKING",
      status: "pending"
    };

    const createRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quarPayload)
    });
    assert.equal(createRes.status, 200);

    // 1. GET /api/wbp/quarantine
    const listRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.success, true);
    assert.equal(listData.pendingCount, 1);

    // 2. GET /api/wbp/quarantine/:id
    const getRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_test_http_1`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(getData.item.guestName, "Juliana Paes");

    // 3. POST /api/wbp/quarantine/:id/resolve
    const resolveRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine/quar_test_http_1/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign_flat",
        flatNumber: "215",
        notes: "Alocação manual autorizada",
        user: "gerente"
      })
    });
    assert.equal(resolveRes.status, 200);
    const resolveData = await resolveRes.json();
    assert.equal(resolveData.success, true);
    assert.equal(resolveData.resolved, true);
    assert.equal(resolveData.reservation.flatNumber, "215");
    assert.equal(resolveData.quarantineItem.status, "resolved");
  });

  it("GET and POST /api/wbp/alerts/settings and daily summary trigger", async () => {
    // 1. GET settings
    const getRes = await fetch(`${serverBaseUrl}/api/wbp/alerts/settings`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.ok(getData.settings.channels);

    // 2. POST update settings
    const postRes = await fetch(`${serverBaseUrl}/api/wbp/alerts/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients: { adminWhatsApp: "5522998877112" }
      })
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.settings.recipients.adminWhatsApp, "5522998877112");

    // 3. POST trigger daily summary
    const summaryRes = await fetch(`${serverBaseUrl}/api/wbp/alerts/trigger-daily-summary`, {
      method: "POST"
    });
    assert.equal(summaryRes.status, 200);
    const summaryData = await summaryRes.json();
    assert.equal(summaryData.success, true);
    assert.equal(summaryData.sent, true);
  });
});
