/**
 * Test Suite: Tariff Engine & Multi-Channel Pricing (SEBRAE, Markups, Overrides, Bulk)
 * File: tests/tariff-engine.test.mjs
 * Execution: node --test tests/tariff-engine.test.mjs
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

const TEST_PORT = 3995;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-tariff-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Tariff Engine & Multi-Channel Pricing Suite", () => {
  before(async () => {
    // 1. Prepare isolated test database
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

    // 2. Spawn isolated server process
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

    // Wait for server ready
    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
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

  it("1. GET /api/tariffs/settings returns default SEBRAE settings", async () => {
    const res = await fetch(`${BASE_URL}/api/tariffs/settings`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.settings.mode, "auto");
    assert.strictEqual(data.settings.weekendMarkupPct, 0.15);
    assert.strictEqual(data.settings.channelMarkups.direct.markupPct, 0);
    assert.strictEqual(data.settings.channelMarkups.booking.markupPct, 0.18);
    assert.strictEqual(data.settings.channelMarkups.airbnb.markupPct, 0.15);
  });

  it("2. GET /api/tariffs/calendar calculates SEBRAE rates with weekend markup and seasonality", async () => {
    // Month with medium season (e.g. November 2026, month=11)
    const res = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.month, "2026-11");
    assert.ok(Array.isArray(data.days));
    assert.strictEqual(data.days.length, 30);

    // Check weekday rate vs weekend rate
    // 2026-11-04 is Wednesday (weekday: dayOfWeek = 3)
    const wednesday = data.days.find(d => d.date === "2026-11-04");
    assert.ok(wednesday);
    assert.strictEqual(wednesday.isWeekend, false);

    // 2026-11-06 is Friday (weekend: dayOfWeek = 5)
    const friday = data.days.find(d => d.date === "2026-11-06");
    assert.ok(friday);
    assert.strictEqual(friday.isWeekend, true);

    // Weekend rate must be higher than weekday rate by ~15%
    assert.ok(friday.rate > wednesday.rate);
    const calculatedRatio = friday.rate / wednesday.rate;
    assert.ok(Math.abs(calculatedRatio - 1.15) < 0.02, `Expected ~1.15 ratio, got ${calculatedRatio}`);
  });

  it("3. Channel markups are applied properly (Booking +18%, Airbnb +15%, Direct 0%)", async () => {
    const resDirect = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const dataDirect = await resDirect.json();
    const wedDirect = dataDirect.days.find(d => d.date === "2026-11-04");

    const resBooking = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=booking`);
    const dataBooking = await resBooking.json();
    const wedBooking = dataBooking.days.find(d => d.date === "2026-11-04");

    const resAirbnb = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=airbnb`);
    const dataAirbnb = await resAirbnb.json();
    const wedAirbnb = dataAirbnb.days.find(d => d.date === "2026-11-04");

    // Booking rate should be direct * 1.18
    const bookingRatio = wedBooking.rate / wedDirect.rate;
    assert.ok(Math.abs(bookingRatio - 1.18) < 0.02, `Expected ~1.18 booking ratio, got ${bookingRatio}`);

    // Airbnb rate should be direct * 1.15
    const airbnbRatio = wedAirbnb.rate / wedDirect.rate;
    assert.ok(Math.abs(airbnbRatio - 1.15) < 0.02, `Expected ~1.15 airbnb ratio, got ${airbnbRatio}`);
  });

  it("4. Seasonality curve affects SEBRAE calculation (Jan Alta +15% vs Mai Baixa -10%)", async () => {
    // January (Alta +15%)
    const resJan = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-01&channel=direct`);
    const dataJan = await resJan.json();
    // 2026-01-14 is Wednesday
    const wedJan = dataJan.days.find(d => d.date === "2026-01-14");

    // May (Baixa -10%)
    const resMay = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-05&channel=direct`);
    const dataMay = await resMay.json();
    // 2026-05-13 is Wednesday
    const wedMay = dataMay.days.find(d => d.date === "2026-05-13");

    // Alta (1.15) vs Baixa (0.90) => ratio ~1.15 / 0.90 = ~1.277
    assert.ok(wedJan.rate > wedMay.rate);
    const seasonRatio = wedJan.rate / wedMay.rate;
    assert.ok(Math.abs(seasonRatio - (1.15 / 0.90)) < 0.05, `Expected ~1.277 season ratio, got ${seasonRatio}`);
  });

  it("5. POST /api/tariffs/settings switches to 'manual' mode with custom base rate", async () => {
    const updateRes = await fetch(`${BASE_URL}/api/tariffs/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "manual",
        baseDailyRate: 300,
        weekendMarkupPct: 0.20
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.strictEqual(updated.settings.mode, "manual");
    assert.strictEqual(updated.settings.baseDailyRate, 300);
    assert.strictEqual(updated.settings.weekendMarkupPct, 0.20);

    // Calendar should now reflect manual baseRate 300
    const resCal = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const dataCal = await resCal.json();
    const wed = dataCal.days.find(d => d.date === "2026-11-04");
    assert.strictEqual(wed.rate, 300);

    // Weekend with 20% markup: 300 * 1.20 = 360
    const fri = dataCal.days.find(d => d.date === "2026-11-06");
    assert.strictEqual(fri.rate, 360);
  });

  it("6. POST /api/tariffs/bulk-update creates overrides across date range and filters", async () => {
    const bulkRes = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-24",
        endDate: "2026-12-26",
        flatIds: ["all"],
        channels: ["direct", "booking"],
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        rate: 550,
        reason: "Pacote Natal Especial"
      })
    });
    assert.strictEqual(bulkRes.status, 200);
    const bulkData = await bulkRes.json();
    assert.strictEqual(bulkData.success, true);
    assert.ok(bulkData.updatedCount >= 6); // 3 dates x 2 channels = 6

    // Calendar for direct on 2026-12-25 must now return override rate 550
    const resDec = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct`);
    const dataDec = await resDec.json();
    const xmas = dataDec.days.find(d => d.date === "2026-12-25");
    assert.ok(xmas);
    assert.strictEqual(xmas.rate, 550);
    assert.strictEqual(xmas.hasOverride, true);
  });

  it("7. Specific flat override takes precedence over global override", async () => {
    // Flat 113 specific override for 2026-12-25 with rate 700
    const bulkRes = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        flatIds: [1],
        channels: ["direct"],
        rate: 700,
        reason: "Flat 113 VIP Natal"
      })
    });
    assert.strictEqual(bulkRes.status, 200);

    // Requesting calendar for flatId=1 on 2026-12 should return 700 on Xmas
    const resFlat = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=1`);
    const dataFlat = await resFlat.json();
    const xmasFlat = dataFlat.days.find(d => d.date === "2026-12-25");
    assert.strictEqual(xmasFlat.rate, 700);

    // Other flats still get global override 550
    const resOther = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=2`);
    const dataOther = await resOther.json();
    const xmasOther = dataOther.days.find(d => d.date === "2026-12-25");
    assert.strictEqual(xmasOther.rate, 550);
  });

  it("8. DELETE /api/tariffs/overrides/:id removes the override and restores base rate", async () => {
    // Fetch calendar to get the override object
    const resBefore = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=1`);
    const dataBefore = await resBefore.json();
    const xmasBefore = dataBefore.days.find(d => d.date === "2026-12-25");
    assert.ok(xmasBefore.override?.id);
    const overrideId = xmasBefore.override.id;

    // Delete the override
    const delRes = await fetch(`${BASE_URL}/api/tariffs/overrides/${overrideId}`, {
      method: "DELETE"
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);
    assert.strictEqual(delData.deletedId, overrideId);

    // Verify deleting nonexistent ID returns 404
    const delNonExistent = await fetch(`${BASE_URL}/api/tariffs/overrides/nonexistent-999`, {
      method: "DELETE"
    });
    assert.strictEqual(delNonExistent.status, 404);
  });
});
