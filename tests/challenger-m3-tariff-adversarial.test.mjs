/**
 * Challenger Test Suite: Milestone M3 Tariff Calendar, Channels & Bulk Update Adversarial Probes
 * File: tests/challenger-m3-tariff-adversarial.test.mjs
 * Execution: node --test tests/challenger-m3-tariff-adversarial.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3999;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger-m3-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("CHALLENGER M3: Tariff Calendar, Channels, Overrides & Bulk Update", () => {
  before(async () => {
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    initialDb.tariffSettings = {
      mode: "auto",
      baseDailyRate: 237,
      currency: "BRL",
      minNights: 1,
      weekendMarkupPct: 0.15,
      channelMarkups: {
        direct: { channelName: "Venda Direta / Site / WhatsApp", markupPct: 0.0, commissionPct: 0.0, discountPct: 0.15 },
        booking: { channelName: "Booking.com", markupPct: 0.18, commissionPct: 0.18, discountPct: 0.0 },
        airbnb: { channelName: "Airbnb", markupPct: 0.15, commissionPct: 0.15, discountPct: 0.0 }
      },
      updatedAt: new Date().toISOString()
    };
    initialDb.tariffOverrides = [];
    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }

    if (!isReady) {
      throw new Error(`Server failed to start on port ${TEST_PORT}`);
    }
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // 1. Channel markups (+18% Booking, +15% Airbnb, 0% Direct)
  it("1. Channel navigation & markups via GET /api/tariffs/calendar", async () => {
    const resDirect = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    assert.strictEqual(resDirect.status, 200);
    const dataDirect = await resDirect.json();
    assert.strictEqual(dataDirect.channel, "direct");

    const resBooking = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=booking`);
    assert.strictEqual(resBooking.status, 200);
    const dataBooking = await resBooking.json();
    assert.strictEqual(dataBooking.channel, "booking");

    const resAirbnb = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=airbnb`);
    assert.strictEqual(resAirbnb.status, 200);
    const dataAirbnb = await resAirbnb.json();
    assert.strictEqual(dataAirbnb.channel, "airbnb");

    // Compare weekday: 2026-11-04 (Wed)
    const dDirect = dataDirect.days.find(d => d.date === "2026-11-04");
    const dBooking = dataBooking.days.find(d => d.date === "2026-11-04");
    const dAirbnb = dataAirbnb.days.find(d => d.date === "2026-11-04");

    assert.ok(dDirect && dBooking && dAirbnb);
    const bookingRatio = dBooking.rate / dDirect.rate;
    const airbnbRatio = dAirbnb.rate / dDirect.rate;

    assert.ok(Math.abs(bookingRatio - 1.18) < 0.02, `Booking markup ratio expected ~1.18, got ${bookingRatio}`);
    assert.ok(Math.abs(airbnbRatio - 1.15) < 0.02, `Airbnb markup ratio expected ~1.15, got ${airbnbRatio}`);

    // Compare weekend: 2026-11-06 (Fri)
    const weDirect = dataDirect.days.find(d => d.date === "2026-11-06");
    const weBooking = dataBooking.days.find(d => d.date === "2026-11-06");
    const weAirbnb = dataAirbnb.days.find(d => d.date === "2026-11-06");

    assert.ok(Math.abs((weBooking.rate / weDirect.rate) - 1.18) < 0.02);
    assert.ok(Math.abs((weAirbnb.rate / weDirect.rate) - 1.15) < 0.02);
  });

  // 2. Individual override saving via POST /api/tariffs/bulk-update (single cell flow)
  it("2. Individual cell override flow and deletion via DELETE /api/tariffs/overrides/:id", async () => {
    // Tarifas.tsx handleSaveSingleOverride payload:
    // { startDate: "2026-11-10", endDate: "2026-11-10", flatIds: ["all"], channels: ["direct"], rate: 299, reason: "Ajuste manual individual" }
    const postRes = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-11-10",
        endDate: "2026-11-10",
        flatIds: ["all"],
        channels: ["direct"],
        rate: 299,
        reason: "Ajuste manual individual"
      })
    });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.strictEqual(postData.updatedCount, 1);

    // Verify calendar reflects override
    const calRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const calData = await calRes.json();
    const cellDay = calData.days.find(d => d.date === "2026-11-10");
    assert.strictEqual(cellDay.rate, 299);
    assert.strictEqual(cellDay.hasOverride, true);
    assert.ok(cellDay.override?.id);

    // Delete override via DELETE /api/tariffs/overrides/:id (handleRemoveOverride in tarifas.tsx)
    const delRes = await fetch(`${BASE_URL}/api/tariffs/overrides/${cellDay.override.id}`, {
      method: "DELETE"
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);
    assert.strictEqual(delData.deletedId, cellDay.override.id);

    // Verify rate is restored back to SEBRAE
    const calAfterRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const calAfterData = await calAfterRes.json();
    const cellAfter = calAfterData.days.find(d => d.date === "2026-11-10");
    assert.strictEqual(cellAfter.hasOverride, false);
    assert.strictEqual(cellAfter.override, null);
    assert.notStrictEqual(cellAfter.rate, 299);
  });

  // 3. Bulk Update Payload Validation and Filtering
  it("3. Bulk update payload structure and backend filtering", async () => {
    // 3.1 Validation: missing dates
    const missingDates = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate: 300 })
    });
    assert.strictEqual(missingDates.status, 400);

    // 3.2 Validation: negative rate
    const negativeRate = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: "2026-11-01", endDate: "2026-11-05", rate: -50 })
    });
    assert.strictEqual(negativeRate.status, 400);

    // 3.3 Validation: invalid date order
    const invalidRange = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: "2026-11-10", endDate: "2026-11-05", rate: 300 })
    });
    assert.strictEqual(invalidRange.status, 400);

    // 3.4 Valid execution with weekday filter: only Friday (5) and Saturday (6)
    const validBulk = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        flatIds: ["all"],
        channels: ["direct"],
        daysOfWeek: [5, 6],
        rate: 450,
        reason: "Pacote Fim de Semana Novembro"
      })
    });
    assert.strictEqual(validBulk.status, 200);
    const validData = await validBulk.json();
    assert.strictEqual(validData.success, true);
    // In Nov 1-14, 2026:
    // Nov 6 (Fri), Nov 7 (Sat), Nov 13 (Fri), Nov 14 (Sat) = exactly 4 days
    assert.strictEqual(validData.updatedCount, 4);

    const calRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const calData = await calRes.json();

    // Check Nov 6 (Fri) -> 450
    assert.strictEqual(calData.days.find(d => d.date === "2026-11-06").rate, 450);
    // Check Nov 7 (Sat) -> 450
    assert.strictEqual(calData.days.find(d => d.date === "2026-11-07").rate, 450);
    // Check Nov 8 (Sun) -> NOT 450 (should be base rate)
    assert.notStrictEqual(calData.days.find(d => d.date === "2026-11-08").rate, 450);
  });

  // 4. Contract Audit: GET /api/tariffs/calendar returns `overrides` array matching UI expectation
  it("4. Contract audit: GET /api/tariffs/calendar payload keys vs UI expectation", async () => {
    const res = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const data = await res.json();
    
    // Check whether data.overrides exists
    const hasOverridesProperty = Object.prototype.hasOwnProperty.call(data, "overrides");
    console.log("Contract check: data.overrides present in GET /api/tariffs/calendar?", hasOverridesProperty);
    
    // Verified: GET /api/tariffs/calendar returns overrides array required by tarifas.tsx
    assert.strictEqual(hasOverridesProperty, true, "GET /api/tariffs/calendar MUST return overrides property");
    assert.ok(Array.isArray(data.overrides), "data.overrides must be an array");
  });
});
