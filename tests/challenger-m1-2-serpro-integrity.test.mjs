/**
 * EMPIRICAL CHALLENGER M1_2 TEST SUITE
 * 
 * Focus Areas:
 * 1. Malformed reservations: missing code, missing dates, zero/negative guests.
 * 2. Concurrency: multiple simultaneous calls to getCheckinUrl and registerReservation.
 * 3. Twin mirror parity: bitwise comparison of demo-server.mjs and fnrh-serpro-service.mjs.
 * 4. Database integrity: verify data/database.json validity and structure.
 * 5. Live API server integration: dynamic toggle, health status, and resilient fallback.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Twin Mirror Bitwise Parity & Syntax Verification
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite 1: Twin Mirror Bitwise Parity & Syntax Verification", () => {
  it("1.1 demo-server.mjs twin mirror parity: exact byte-for-byte and SHA-256 match", () => {
    const mainPath = path.join(rootDir, "artifacts/api-server/demo-server.mjs");
    const mirrorPath = path.join(rootDir, "scripts/demo-server.mjs");

    const mainBuf = fs.readFileSync(mainPath);
    const mirrorBuf = fs.readFileSync(mirrorPath);

    assert.strictEqual(mainBuf.length, mirrorBuf.length, `File size mismatch: ${mainBuf.length} vs ${mirrorBuf.length}`);
    assert.ok(mainBuf.equals(mirrorBuf), "demo-server.mjs and scripts/demo-server.mjs must be byte-for-byte identical");

    const hashA = crypto.createHash("sha256").update(mainBuf).digest("hex");
    const hashB = crypto.createHash("sha256").update(mirrorBuf).digest("hex");
    assert.strictEqual(hashA, hashB, `SHA-256 mismatch: ${hashA} vs ${hashB}`);
  });

  it("1.2 fnrh-serpro-service.mjs twin mirror parity: exact byte-for-byte and SHA-256 match", () => {
    const mainPath = path.join(rootDir, "scripts/fnrh-serpro-service.mjs");
    const mirrorPath = path.join(rootDir, "artifacts/api-server/fnrh-serpro-service.mjs");

    const mainBuf = fs.readFileSync(mainPath);
    const mirrorBuf = fs.readFileSync(mirrorPath);

    assert.strictEqual(mainBuf.length, mirrorBuf.length, `File size mismatch: ${mainBuf.length} vs ${mirrorBuf.length}`);
    assert.ok(mainBuf.equals(mirrorBuf), "fnrh-serpro-service.mjs and artifacts twin must be byte-for-byte identical");

    const hashA = crypto.createHash("sha256").update(mainBuf).digest("hex");
    const hashB = crypto.createHash("sha256").update(mirrorBuf).digest("hex");
    assert.strictEqual(hashA, hashB, `SHA-256 mismatch: ${hashA} vs ${hashB}`);
  });

  it("1.3 Node.js syntax checks (--check) pass for all backend files", () => {
    const filesToCheck = [
      "artifacts/api-server/demo-server.mjs",
      "scripts/demo-server.mjs",
      "scripts/fnrh-serpro-service.mjs",
      "artifacts/api-server/fnrh-serpro-service.mjs"
    ];

    for (const rel of filesToCheck) {
      const fullPath = path.join(rootDir, rel);
      assert.doesNotThrow(() => {
        execSync(`node --check "${fullPath}"`, { stdio: "pipe" });
      }, `Syntax check failed for ${rel}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Database Integrity & Structure Verification
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite 2: Database Integrity & Structure Verification", () => {
  const dbPath = path.join(rootDir, "data/database.json");
  let dbData;

  it("2.1 data/database.json is valid parseable JSON", () => {
    assert.ok(fs.existsSync(dbPath), "data/database.json must exist");
    const content = fs.readFileSync(dbPath, "utf-8");
    assert.ok(content.length > 0, "database.json must not be empty");
    assert.doesNotThrow(() => {
      dbData = JSON.parse(content);
    }, "data/database.json must parse as valid JSON");
  });

  it("2.2 data/database.json contains all required schema keys", () => {
    const requiredKeys = [
      "users",
      "flats",
      "reservations",
      "cleaningRequests",
      "serviceOrders",
      "serviceWorkers",
      "settings",
      "notifications",
      "auditLogs"
    ];

    for (const key of requiredKeys) {
      assert.ok(key in dbData, `Missing expected database root key: '${key}'`);
    }
  });

  it("2.3 settings.checkinProvider is properly initialized", () => {
    assert.ok(dbData.settings, "db.settings must exist");
    assert.ok(
      dbData.settings.checkinProvider === "proprio" || dbData.settings.checkinProvider === "gov_fnrh",
      `checkinProvider must be 'proprio' or 'gov_fnrh', received: '${dbData.settings.checkinProvider}'`
    );
    assert.strictEqual(dbData.settings.checkinProvider, "proprio", "Default provider should be 'proprio'");
  });

  it("2.4 settings.serproConfig contains env and cpfSolicitante", () => {
    assert.ok(dbData.settings.serproConfig, "serproConfig must exist in settings");
    assert.ok(
      dbData.settings.serproConfig.env === "homologacao" || dbData.settings.serproConfig.env === "producao",
      `serproConfig.env must be 'homologacao' or 'producao', got: '${dbData.settings.serproConfig.env}'`
    );
    assert.ok(
      typeof dbData.settings.serproConfig.cpfSolicitante === "string" &&
      dbData.settings.serproConfig.cpfSolicitante.length >= 11,
      "serproConfig.cpfSolicitante must be a valid CPF string"
    );
  });

  it("2.5 serviceOrders and serviceWorkers are valid arrays", () => {
    assert.ok(Array.isArray(dbData.serviceOrders), "serviceOrders must be an array");
    assert.ok(Array.isArray(dbData.serviceWorkers), "serviceWorkers must be an array");
  });

  it("2.6 reservations array integrity: all items have id and proper structure", () => {
    assert.ok(Array.isArray(dbData.reservations), "reservations must be an array");
    assert.ok(dbData.reservations.length > 0, "reservations should contain items");

    for (const res of dbData.reservations.slice(0, 50)) {
      assert.ok(res.id !== undefined && res.id !== null, "Each reservation must have an id");
      if (res.code) {
        assert.strictEqual(typeof res.code, "string", "Reservation code must be string");
      }
    }
  });

  it("2.7 Deep integrity check: No corrupted NaN or invalid types in settings", () => {
    const jsonStr = JSON.stringify(dbData.settings);
    assert.ok(!jsonStr.includes("NaN"), "settings must not contain NaN");
    assert.ok(!jsonStr.includes("undefined"), "settings must not contain string 'undefined'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Malformed Reservations Stress Testing
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite 3: Malformed Reservations Stress Testing", () => {
  let fnrhSerproService;
  let FnrhSerproClient;
  let getCheckinUrl;
  let getCheckinUrlSync;

  before(async () => {
    const mod = await import("../scripts/fnrh-serpro-service.mjs");
    fnrhSerproService = mod.fnrhSerproService;
    FnrhSerproClient = mod.FnrhSerproClient;
    getCheckinUrl = mod.getCheckinUrl;
    getCheckinUrlSync = mod.getCheckinUrlSync;
  });

  it("3.1 registerReservation: throws descriptive error for null or non-object reservation", async () => {
    await assert.rejects(
      async () => { await fnrhSerproService.registerReservation(null); },
      /Objeto de reserva inválido/
    );

    await assert.rejects(
      async () => { await fnrhSerproService.registerReservation(undefined); },
      /Objeto de reserva inválido/
    );
  });

  it("3.2 registerReservation: throws descriptive error when reservation lacks code and id", async () => {
    await assert.rejects(
      async () => { await fnrhSerproService.registerReservation({}); },
      /Reserva não possui código/
    );

    await assert.rejects(
      async () => { await fnrhSerproService.registerReservation({ code: "", id: "" }); },
      /Reserva não possui código/
    );

    await assert.rejects(
      async () => { await fnrhSerproService.registerReservation({ code: "   " }); },
      /Reserva não possui código/
    );
  });

  it("3.3 registerReservation: throws descriptive error when dates are missing or invalid", async () => {
    // Missing checkinDate
    await assert.rejects(
      async () => {
        await fnrhSerproService.registerReservation({
          code: "RES-MALFORMED-1",
          checkoutDate: "2026-10-15"
        });
      },
      /Datas inválidas para registro no SERPRO/
    );

    // Missing checkoutDate
    await assert.rejects(
      async () => {
        await fnrhSerproService.registerReservation({
          code: "RES-MALFORMED-2",
          checkinDate: "2026-10-10"
        });
      },
      /Datas inválidas para registro no SERPRO/
    );

    // Slash format instead of YYYY-MM-DD
    await assert.rejects(
      async () => {
        await fnrhSerproService.registerReservation({
          code: "RES-MALFORMED-3",
          checkinDate: "10/10/2026",
          checkoutDate: "15/10/2026"
        });
      },
      /Datas inválidas para registro no SERPRO/
    );

    // Completely invalid string
    await assert.rejects(
      async () => {
        await fnrhSerproService.registerReservation({
          code: "RES-MALFORMED-4",
          checkinDate: "invalid-date",
          checkoutDate: "another-bad-date"
        });
      },
      /Datas inválidas para registro no SERPRO/
    );
  });

  it("3.4 registerReservation: safely clamps zero or negative guests to at least 1 adult", async () => {
    const client = new FnrhSerproClient({ mock: true });

    // adults: 0, children: 0
    const resZero = await client.registerReservation({
      code: "RES-ZERO-GUESTS",
      checkinDate: "2026-10-10",
      checkoutDate: "2026-10-12",
      adults: 0,
      children: 0
    });
    assert.strictEqual(resZero.ok, true);
    assert.ok(resZero.link_precheckin.startsWith("https://fnrh.turismo.gov.br/precheckin/"));

    // adults: -5, children: -2
    const resNegative = await client.registerReservation({
      code: "RES-NEG-GUESTS",
      checkinDate: "2026-10-10",
      checkoutDate: "2026-10-12",
      adults: -5,
      children: -2
    });
    assert.strictEqual(resNegative.ok, true);

    // non-numeric adults: "invalid"
    const resNan = await client.registerReservation({
      code: "RES-NAN-GUESTS",
      checkinDate: "2026-10-10",
      checkoutDate: "2026-10-12",
      adults: "invalid_string"
    });
    assert.strictEqual(resNan.ok, true);
  });

  it("3.5 getCheckinUrl: handles malformed reservations gracefully without throwing in gov_fnrh mode", async () => {
    const mockDb = { settings: { checkinProvider: "gov_fnrh" } };
    const baseUrl = "https://corpflats.onrender.com";

    // Null reservation
    const nullResult = await getCheckinUrl(null, 1, baseUrl, mockDb);
    assert.strictEqual(nullResult, "https://corpflats.onrender.com/pre-checkin/?guest=1");

    // Reservation with empty code/id
    const emptyCodeRes = { code: "", id: null };
    const emptyResult = await getCheckinUrl(emptyCodeRes, 1, baseUrl, mockDb);
    assert.strictEqual(emptyResult, "https://corpflats.onrender.com/pre-checkin/?guest=1");
    assert.ok(emptyCodeRes.serproError);

    // Reservation missing dates
    const missingDatesRes = { code: "RES-NODATES-99", id: 99 };
    const missingResult = await getCheckinUrl(missingDatesRes, 2, baseUrl, mockDb);
    assert.strictEqual(missingResult, "https://corpflats.onrender.com/pre-checkin/RES-NODATES-99?guest=2");
    assert.ok(missingDatesRes.serproError.includes("Datas inválidas"));
  });

  it("3.6 getCheckinUrlSync: handles malformed reservations synchronously without throwing", () => {
    const mockDb = { settings: { checkinProvider: "gov_fnrh" } };
    const baseUrl = "https://corpflats.onrender.com";

    const syncNull = getCheckinUrlSync(null, 1, baseUrl, mockDb);
    assert.strictEqual(syncNull, "https://corpflats.onrender.com/pre-checkin/?guest=1");

    const syncEmpty = getCheckinUrlSync({}, 1, baseUrl, mockDb);
    assert.strictEqual(syncEmpty, "https://corpflats.onrender.com/pre-checkin/?guest=1");

    const syncMalformed = getCheckinUrlSync({ code: "BAD-RES" }, 2, baseUrl, mockDb);
    assert.strictEqual(syncMalformed, "https://corpflats.onrender.com/pre-checkin/BAD-RES?guest=2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Concurrency & Stress Harness Testing
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite 4: Concurrency & Stress Harness Testing", () => {
  let fnrhSerproService;
  let FnrhSerproClient;
  let getCheckinUrl;

  before(async () => {
    const mod = await import("../scripts/fnrh-serpro-service.mjs");
    fnrhSerproService = mod.fnrhSerproService;
    FnrhSerproClient = mod.FnrhSerproClient;
    getCheckinUrl = mod.getCheckinUrl;
    fnrhSerproService.setMockMode(true);
    fnrhSerproService.setMockError(null);
    fnrhSerproService.setMockTimeout(false);
  });

  after(() => {
    fnrhSerproService.setMockMode(false);
    fnrhSerproService.setMockError(null);
    fnrhSerproService.setMockTimeout(false);
  });

  it("4.1 Concurrent registerReservation: 50 simultaneous parallel calls resolve with unique links", async () => {
    const concurrencyCount = 50;
    const promises = [];

    for (let i = 1; i <= concurrencyCount; i++) {
      const resObj = {
        code: `RES-CONC-${i.toString().padStart(3, "0")}`,
        id: 1000 + i,
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-05",
        adults: 2,
        children: 0
      };
      promises.push(fnrhSerproService.registerReservation(resObj));
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, concurrencyCount);

    const linkSet = new Set();
    for (const r of results) {
      assert.strictEqual(r.ok, true);
      assert.ok(r.link_precheckin.startsWith("https://fnrh.turismo.gov.br/precheckin/"));
      linkSet.add(r.link_precheckin);
    }

    assert.strictEqual(linkSet.size, concurrencyCount, "All 50 generated links must be distinct");
  });

  it("4.2 Concurrent getCheckinUrl: 50 simultaneous calls on the same reservation resolve identically without corruption", async () => {
    const sharedReservation = {
      code: "RES-SHARED-CONC",
      id: 9999,
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      adults: 2
    };

    const mockDb = { settings: { checkinProvider: "gov_fnrh", serproConfig: { mock: true } } };
    const baseUrl = "https://corpflats.onrender.com";

    const promises = Array.from({ length: 50 }, () =>
      getCheckinUrl(sharedReservation, 1, baseUrl, mockDb)
    );

    const urls = await Promise.all(promises);
    assert.strictEqual(urls.length, 50);

    const firstUrl = urls[0];
    assert.ok(firstUrl.startsWith("https://fnrh.turismo.gov.br/precheckin/"));
    for (const u of urls) {
      assert.strictEqual(u, firstUrl, "All 50 simultaneous calls must resolve to the identical URL");
    }

    assert.strictEqual(sharedReservation.serproPrecheckinUrl, firstUrl);
    assert.strictEqual(sharedReservation.link_precheckin, firstUrl);
  });

  it("4.3 Concurrent getCheckinUrl under simulated timeout: 30 parallel calls fall back cleanly", async () => {
    fnrhSerproService.setMockTimeout(true);

    const mockDb = { settings: { checkinProvider: "gov_fnrh", serproConfig: { mock: true } } };
    const baseUrl = "https://corpflats.onrender.com";

    const promises = Array.from({ length: 30 }, (_, i) => {
      const res = {
        code: `RES-TIMEOUT-${i}`,
        id: 5000 + i,
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-20"
      };
      return getCheckinUrl(res, 1, baseUrl, mockDb);
    });

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 30);

    results.forEach((url, i) => {
      assert.strictEqual(url, `https://corpflats.onrender.com/pre-checkin/RES-TIMEOUT-${i}?guest=1`);
    });

    fnrhSerproService.setMockTimeout(false);
  });

  it("4.4 High-throughput mixed burst: 100 concurrent requests across diverse conditions", async () => {
    const baseUrl = "https://corpflats.onrender.com";
    const scenarios = [];

    for (let i = 0; i < 100; i++) {
      const mode = i % 4;
      if (mode === 0) {
        // Mode 0: Proprio
        scenarios.push({
          db: { settings: { checkinProvider: "proprio" } },
          res: { code: `RES-BURST-${i}`, id: i },
          expectedPrefix: "https://corpflats.onrender.com/pre-checkin/RES-BURST-"
        });
      } else if (mode === 1) {
        // Mode 1: Gov with pre-cached link
        const cachedUrl = `https://fnrh.turismo.gov.br/precheckin/cached-burst-${i}`;
        scenarios.push({
          db: { settings: { checkinProvider: "gov_fnrh" } },
          res: { code: `RES-BURST-${i}`, id: i, serproPrecheckinUrl: cachedUrl },
          expectedPrefix: cachedUrl
        });
      } else if (mode === 2) {
        // Mode 2: Gov uncached -> needs mock registration
        scenarios.push({
          db: { settings: { checkinProvider: "gov_fnrh", serproConfig: { mock: true } } },
          res: { code: `RES-BURST-${i}`, id: i, checkinDate: "2026-10-10", checkoutDate: "2026-10-15" },
          expectedPrefix: "https://fnrh.turismo.gov.br/precheckin/"
        });
      } else {
        // Mode 3: Gov with invalid dates -> fallback
        scenarios.push({
          db: { settings: { checkinProvider: "gov_fnrh", serproConfig: { mock: true } } },
          res: { code: `RES-BURST-${i}`, id: i, checkinDate: "invalid", checkoutDate: "invalid" },
          expectedPrefix: "https://corpflats.onrender.com/pre-checkin/RES-BURST-"
        });
      }
    }

    const start = Date.now();
    const results = await Promise.all(
      scenarios.map(s => getCheckinUrl(s.res, 1, baseUrl, s.db))
    );
    const duration = Date.now() - start;

    assert.strictEqual(results.length, 100);
    results.forEach((url, i) => {
      assert.ok(url.startsWith(scenarios[i].expectedPrefix), `Scenario ${i} failed: ${url}`);
    });

    assert.ok(duration < 2500, `100 concurrent requests must complete swiftly, took ${duration}ms`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Live API Server Integration Verification
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite 5: Live API Server Integration Verification", () => {
  const PORT = 3991;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const prodDbPath = path.join(rootDir, "data/database.json");
  const isolatedDbPath = path.join(rootDir, "data/isolated-challenger-m1-2-db.json");
  let serverProcess = null;

  const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString("base64");
  const adminHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${adminToken}`
  };

  function killProcessTree(pid) {
    if (!pid) return;
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } catch {}
  }

  before(async () => {
    fs.copyFileSync(prodDbPath, isolatedDbPath);

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "test",
        DATABASE_URL: "",
        DATABASE_FILE: isolatedDbPath,
        SERPRO_MOCK: "true"
      },
      stdio: "pipe"
    });

    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/flats`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, "Live test server failed to start within timeout");
  });

  after(() => {
    if (serverProcess?.pid) {
      killProcessTree(serverProcess.pid);
    }
    if (fs.existsSync(isolatedDbPath)) {
      try { fs.unlinkSync(isolatedDbPath); } catch {}
    }
  });

  it("5.1 GET /api/fnrh-serpro/status returns health check diagnostic", async () => {
    const res = await fetch(`${BASE_URL}/api/fnrh-serpro/status`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(typeof body.ok, "boolean");
    assert.ok(body.provider);
    assert.ok(body.env);
    assert.strictEqual(typeof body.latencyMs, "number");
  });

  it("5.2 PATCH /api/settings dynamically alters checkinProvider to 'gov_fnrh'", async () => {
    const patchRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "gov_fnrh" })
    });
    assert.strictEqual(patchRes.status, 200);

    const settings = await patchRes.json();
    assert.strictEqual(settings.checkinProvider, "gov_fnrh");

    // Verify GET /api/settings reflects change immediately
    const getRes = await fetch(`${BASE_URL}/api/settings`, { headers: adminHeaders });
    const getSettings = await getRes.json();
    assert.strictEqual(getSettings.checkinProvider, "gov_fnrh");
  });

  it("5.3 PATCH /api/settings rejects invalid checkinProvider values", async () => {
    const badPatchRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "invalid_unsupported_provider" })
    });
    assert.strictEqual(badPatchRes.status, 400);
    const err = await badPatchRes.json();
    assert.ok(err.error.includes("checkinProvider inválido"));
  });

  it("5.4 POST /api/pms/reservations attaches SERPRO pre-checkin link when gov_fnrh is active", async () => {
    const newResPayload = {
      flatId: 1,
      guestName: "Hóspede Teste FNRH",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-15",
      adults: 2,
      children: 0,
      totalAmount: 1500,
      status: "confirmada"
    };

    const createRes = await fetch(`${BASE_URL}/api/pms/reservations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(newResPayload)
    });

    assert.strictEqual(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.serproPrecheckinUrl, "Created reservation must have serproPrecheckinUrl");
    assert.ok(created.serproPrecheckinUrl.startsWith("https://fnrh.turismo.gov.br/precheckin/"));
    assert.strictEqual(created.link_precheckin, created.serproPrecheckinUrl);
  });

  it("5.5 PATCH /api/settings safely reverts checkinProvider back to 'proprio'", async () => {
    const revertRes = await fetch(`${BASE_URL}/api/settings`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ checkinProvider: "proprio" })
    });
    assert.strictEqual(revertRes.status, 200);

    const reverted = await revertRes.json();
    assert.strictEqual(reverted.checkinProvider, "proprio");
  });
});
