/**
 * Challenger Targeted Probes: Edge Cases and Subtle Failure Modes
 * File: tests/challenger-edge-probes.test.mjs
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

const TEST_PORT = 3998;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-probes-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Targeted Edge & Inconsistency Probes", () => {
  before(async () => {
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    initialDb.tariffSettings = {
      mode: "auto",
      baseDailyRate: 237,
      weekendMarkupPct: 0.15,
      channelMarkups: {
        direct: { markupPct: 0.0 },
        booking: { markupPct: 0.18 },
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

  it("Probe A: Specific Flat override leaking into general calendar query (no flatId)", async () => {
    // Create an override ONLY for flat 1 (flatNumber 113) on 2026-11-25 with rate 999
    const bulkRes = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-11-25",
        endDate: "2026-11-25",
        flatIds: [1],
        channels: ["direct"],
        rate: 999,
        reason: "Flat 1 only VIP"
      })
    });
    assert.strictEqual(bulkRes.status, 200);

    // Query general calendar WITHOUT flatId
    const calGen = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
    const dataGen = await calGen.json();
    const day25 = dataGen.days.find(d => d.date === "2026-11-25");

    console.log("Day 25 in General Calendar:", {
      rate: day25.rate,
      hasOverride: day25.hasOverride,
      overrideRate: day25.override?.rate,
      overrideFlatId: day25.override?.flatId
    });

    assert.strictEqual(day25.hasOverride, false, "General calendar must not report hasOverride=true for flat-specific override");
    assert.strictEqual(day25.override, null, "General calendar must not expose flat-specific override object");
  });

  it("Probe B: String array daysOfWeek in bulk-update (e.g. ['5', '6'])", async () => {
    const res = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-11-01",
        endDate: "2026-11-07",
        flatIds: [1],
        channels: ["direct"],
        daysOfWeek: ["5", "6"], // string numbers
        rate: 888,
        reason: "String daysOfWeek probe"
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    console.log("Bulk update with ['5', '6'] updatedCount:", data.updatedCount);
    assert.strictEqual(data.updatedCount, 2, "Bulk update with ['5', '6'] across 7 days must update 2 days (Fri, Sat)");
  });

  it("Probe C: Channel casing in calendar overrides lookup", async () => {
    // Override created for channel 'booking'
    await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-11-28",
        endDate: "2026-11-28",
        flatIds: ["all"],
        channels: ["booking"],
        rate: 777,
        reason: "Booking channel test"
      })
    });

    // Request calendar with lowercase 'booking'
    const resLower = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=booking`);
    const dataLower = await resLower.json();
    const day28Lower = dataLower.days.find(d => d.date === "2026-11-28");

    // Request calendar with uppercase 'Booking'
    const resUpper = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=Booking`);
    const dataUpper = await resUpper.json();
    const day28Upper = dataUpper.days.find(d => d.date === "2026-11-28");

    console.log("Day 28 Lowercase:", { rate: day28Lower.rate, hasOverride: day28Lower.hasOverride });
    console.log("Day 28 Uppercase:", { rate: day28Upper.rate, hasOverride: day28Upper.hasOverride });

    assert.strictEqual(day28Lower.rate, 777);
    assert.strictEqual(day28Lower.hasOverride, true);

    // Check if uppercase 'Booking' matched hasOverride
    assert.strictEqual(day28Upper.rate, 777);
    assert.strictEqual(day28Upper.hasOverride, true, "Titlecase 'Booking' must find override");
    assert.strictEqual(day28Upper.override?.rate, 777);
  });
});
