import http from "node:http";
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
const isolatedDbPath = path.join(rootDir, `data/test-empirical-calendar-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

async function run() {
  console.log("Starting empirical verification of GET /api/tariffs/calendar and UI expectations...");

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

  // Wait ready
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
    throw new Error("Server failed to start on test port");
  }

  try {
    // 1. Create a flat-specific override (e.g. flat 113 or flatId=1)
    console.log("Step 1: Creating flat-specific override for Flat 113 on 2026-12-25...");
    const bulkRes = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        flatIds: ["1"],
        channels: ["direct"],
        rate: 650,
        reason: "Flat 113 Special Rate"
      })
    });
    const bulkData = await bulkRes.json();
    console.log("Bulk update result:", bulkData);

    // 2. Now call GET /api/tariffs/calendar as the UI does:
    // Notice UI calls: fetch(`/api/tariffs/calendar?month=${selectedMonth}&channel=${selectedChannel}`)
    console.log("Step 2: Calling GET /api/tariffs/calendar?month=2026-12&channel=direct (as tarifas.tsx does)...");
    const calRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-12&channel=direct`);
    const calData = await calRes.json();
    
    console.log("calData top-level keys:", Object.keys(calData));
    console.log("Does calData have 'overrides' key?", "overrides" in calData);
    console.log("calData.overrides value:", calData.overrides);

    // 3. Emulate what tarifas.tsx lines 623-627 does:
    const flats = calData.flats || [];
    console.log(`Found ${flats.length} flats in calData.flats.`);
    const flat113 = flats.find(f => String(f.id) === "1" || String(f.number) === "113");
    console.log("Flat 113 object:", flat113);

    const xmasDay = calData.days.find(d => d.date === "2026-12-25");
    console.log("xmasDay in calData.days:", xmasDay);

    const flatOverrideInUi = (calData?.overrides || []).find(o =>
      o.date === xmasDay.date &&
      (String(o.flatId) === String(flat113?.id) || String(o.flatNumber) === String(flat113?.number)) &&
      (o.channel === "all" || o.channel === "direct")
    );
    console.log("flatOverride resolved by UI logic:", flatOverrideInUi);

    const hasFlatOverrideInUi = Boolean(flatOverrideInUi);
    const effectiveRateInUi = hasFlatOverrideInUi ? flatOverrideInUi.rate : xmasDay.rate;

    console.log(`UI hasFlatOverride: ${hasFlatOverrideInUi}`);
    console.log(`UI effectiveRate: ${effectiveRateInUi} (Expected 650!)`);

    if (effectiveRateInUi !== 650) {
      console.error("BUG CONFIRMED: UI displays", effectiveRateInUi, "instead of 650 because calendarData.overrides is MISSING from GET /api/tariffs/calendar!");
    } else {
      console.log("No bug detected.");
    }
  } finally {
    killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  }
}

run().catch(err => {
  console.error(err);
  if (serverProcess?.pid) killProcessTree(serverProcess.pid);
  process.exit(1);
});
