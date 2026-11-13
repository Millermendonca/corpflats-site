/**
 * Challenger Clearance Verification Test Suite
 * Milestone: M1 Clearance Round
 * File: tests/challenger-clearance-verification.test.mjs
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
const isolatedDbPath = path.join(rootDir, `data/test-clearance-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Adversarial Clearance Verification: Calendar & Bulk-Update Defect Resolution", () => {
  before(async () => {
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    initialDb.tariffSettings = {
      mode: "manual",
      baseDailyRate: 200,
      weekendMarkupPct: 0.10,
      channelMarkups: {
        direct: { markupPct: 0.0 },
        booking: { markupPct: 0.20 },
        airbnb: { markupPct: 0.15 }
      }
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

    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
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

  it("1. Calendar query without flatId does NOT leak flat-specific override (neither rate nor override object)", async () => {
    // Setup: flat 1 has override 999 on 2026-12-15
    const res1 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-15",
        endDate: "2026-12-15",
        flatIds: [1],
        channels: ["direct"],
        rate: 999,
        reason: "Flat 1 VIP exclusive override"
      })
    });
    assert.strictEqual(res1.status, 200);

    // Also flat 2 has override 888 on 2026-12-15
    const res2 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-15",
        endDate: "2026-12-15",
        flatIds: [2],
        channels: ["direct"],
        rate: 888,
        reason: "Flat 2 VIP exclusive override"
      })
    });
    assert.strictEqual(res2.status, 200);

    // Query calendar WITHOUT flatId (general view)
    const calGeneral = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct`);
    assert.strictEqual(calGeneral.status, 200);
    const dataGeneral = await calGeneral.json();
    const day15Gen = dataGeneral.days.find(d => d.date === "2026-12-15");

    assert.ok(day15Gen, "Day 15 must exist in calendar response");
    // Base rate is 200 (2026-12-15 is Tuesday, no weekend markup)
    assert.strictEqual(day15Gen.rate, 200, "General calendar rate must be base rate 200, not leaked flat rate");
    assert.strictEqual(day15Gen.hasOverride, false, "General calendar must report hasOverride=false when only specific flats have overrides");
    assert.strictEqual(day15Gen.override, null, "General calendar must return override=null to prevent leakage");

    // Flat 1 query specifically must receive rate 999 and hasOverride=true
    const calFlat1 = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=1`);
    const dataFlat1 = await calFlat1.json();
    const day15Flat1 = dataFlat1.days.find(d => d.date === "2026-12-15");
    assert.strictEqual(day15Flat1.rate, 999);
    assert.strictEqual(day15Flat1.hasOverride, true);
    assert.strictEqual(String(day15Flat1.override.flatId), "1");

    // Flat 2 query specifically must receive rate 888 and hasOverride=true
    const calFlat2 = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=2`);
    const dataFlat2 = await calFlat2.json();
    const day15Flat2 = dataFlat2.days.find(d => d.date === "2026-12-15");
    assert.strictEqual(day15Flat2.rate, 888);
    assert.strictEqual(day15Flat2.hasOverride, true);
    assert.strictEqual(String(day15Flat2.override.flatId), "2");

    // Flat 3 query has no specific override, should get base rate 200 and hasOverride=false
    const calFlat3 = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=3`);
    const dataFlat3 = await calFlat3.json();
    const day15Flat3 = dataFlat3.days.find(d => d.date === "2026-12-15");
    assert.strictEqual(day15Flat3.rate, 200);
    assert.strictEqual(day15Flat3.hasOverride, false);
    assert.strictEqual(day15Flat3.override, null);
  });

  it("2. Global override vs Flat-specific override precedence and general view isolation", async () => {
    // Add global override for 2026-12-20 with rate 350
    const resGlobal = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-20",
        endDate: "2026-12-20",
        flatIds: ["all"],
        channels: ["direct"],
        rate: 350,
        reason: "Global event rate"
      })
    });
    assert.strictEqual(resGlobal.status, 200);

    // Add flat 1 override for 2026-12-20 with rate 550
    const resF1 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-20",
        endDate: "2026-12-20",
        flatIds: [1],
        channels: ["direct"],
        rate: 550,
        reason: "Flat 1 super premium"
      })
    });
    assert.strictEqual(resF1.status, 200);

    // Query general calendar (no flatId) -> should match global override (350), NOT flat 1 (550)
    const calGen = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct`);
    const dataGen = await calGen.json();
    const day20Gen = dataGen.days.find(d => d.date === "2026-12-20");
    assert.strictEqual(day20Gen.rate, 350, "General calendar must return global override rate");
    assert.strictEqual(day20Gen.hasOverride, true, "General calendar hasOverride must be true for global override");
    assert.strictEqual(day20Gen.override.rate, 350);

    // Flat 1 query -> must get 550 (flat override takes precedence over global)
    const calF1 = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=1`);
    const dataF1 = await calF1.json();
    const day20F1 = dataF1.days.find(d => d.date === "2026-12-20");
    assert.strictEqual(day20F1.rate, 550);
    assert.strictEqual(day20F1.hasOverride, true);
    assert.strictEqual(day20F1.override.rate, 550);

    // Flat 2 query -> must get 350 (falls back to global override)
    const calF2 = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct&flatId=2`);
    const dataF2 = await calF2.json();
    const day20F2 = dataF2.days.find(d => d.date === "2026-12-20");
    assert.strictEqual(day20F2.rate, 350);
    assert.strictEqual(day20F2.hasOverride, true);
    assert.strictEqual(day20F2.override.rate, 350);
  });

  it("3. Channel casing insensitivity: uppercase, lowercase, titlecase and trimmed queries return hasOverride: true", async () => {
    // Create override for channel 'booking'
    const resBulk = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        flatIds: ["all"],
        channels: ["booking"],
        rate: 750,
        reason: "Christmas Booking OTA special"
      })
    });
    assert.strictEqual(resBulk.status, 200);

    const testChannelVariations = [
      "booking",
      "Booking",
      "BOOKING",
      "bOoKiNg",
      " booking ",
      "BOOKING "
    ];

    for (const chan of testChannelVariations) {
      const res = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=${encodeURIComponent(chan)}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const day25 = data.days.find(d => d.date === "2026-12-25");
      assert.ok(day25, `Day 25 must exist for channel variant '${chan}'`);
      assert.strictEqual(day25.rate, 750, `Rate for '${chan}' must match override rate 750`);
      assert.strictEqual(day25.hasOverride, true, `hasOverride for '${chan}' must be true`);
      assert.strictEqual(day25.override?.rate, 750);
    }
  });

  it("4. Bulk update with numeric strings in daysOfWeek correctly filters target weekdays", async () => {
    // Range 2026-12-01 (Tue) to 2026-12-14 (Mon) = 14 days
    // Days in range:
    // Tue Dec 01: 2
    // Wed Dec 02: 3
    // Thu Dec 03: 4
    // Fri Dec 04: 5
    // Sat Dec 05: 6
    // Sun Dec 06: 0
    // Mon Dec 07: 1
    // Tue Dec 08: 2
    // Wed Dec 09: 3
    // Thu Dec 10: 4
    // Fri Dec 11: 5
    // Sat Dec 12: 6
    // Sun Dec 13: 0
    // Mon Dec 14: 1
    // Filter by daysOfWeek: ["5", "6"] (Fri, Sat) -> Exactly 4 days: Dec 04, 05, 11, 12

    const res = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-01",
        endDate: "2026-12-14",
        flatIds: ["all"],
        channels: ["direct"],
        daysOfWeek: ["5", "6"], // Numeric strings
        rate: 450,
        reason: "Weekend numeric string bulk update"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.updatedCount, 4, "Updated count must be exactly 4 days (two Fridays, two Saturdays)");

    // Verify calendar reflects these 4 days with rate 450 and hasOverride=true
    const calRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct`);
    const calData = await calRes.json();

    const expectedWeekendDates = ["2026-12-04", "2026-12-05", "2026-12-11", "2026-12-12"];
    for (const dStr of expectedWeekendDates) {
      const day = calData.days.find(d => d.date === dStr);
      assert.strictEqual(day.rate, 450, `Date ${dStr} must have override rate 450`);
      assert.strictEqual(day.hasOverride, true, `Date ${dStr} must have hasOverride=true`);
    }

    // Weekdays in that range (e.g. Dec 01, Dec 02, Dec 03) must NOT have override
    const nonWeekendDates = ["2026-12-01", "2026-12-02", "2026-12-03"];
    for (const dStr of nonWeekendDates) {
      const day = calData.days.find(d => d.date === dStr);
      assert.strictEqual(day.hasOverride, false, `Date ${dStr} must NOT have override`);
      assert.strictEqual(day.rate, 200, `Date ${dStr} must have base rate 200`);
    }
  });

  it("5. Bulk update with mixed number and numeric string daysOfWeek (e.g. [0, '1'])", async () => {
    // Range 2026-12-01 to 2026-12-07 = 7 days (Sun=1, Mon=1) -> 2 days total
    const resMixed = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-01",
        endDate: "2026-12-07",
        flatIds: ["all"],
        channels: ["direct"],
        daysOfWeek: [0, "1"], // Mixed number and numeric string
        rate: 310,
        reason: "Mixed daysOfWeek probe"
      })
    });

    assert.strictEqual(resMixed.status, 200);
    const dataMixed = await resMixed.json();
    assert.strictEqual(dataMixed.updatedCount, 2, "Mixed daysOfWeek [0, '1'] across 7 days must update 2 days");
  });
});
