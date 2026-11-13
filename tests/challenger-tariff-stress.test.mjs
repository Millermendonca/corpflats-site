/**
 * Challenger Test Suite: Adversarial Stress & Edge Cases for Tariff Engine
 * File: tests/challenger-tariff-stress.test.mjs
 * Execution: node --test tests/challenger-tariff-stress.test.mjs
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

const TEST_PORT = 3997;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("CHALLENGER: Adversarial Tariff Engine & Stress Testing Suite", () => {
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

    // 2. Spawn isolated server
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

  // ──────────────────────────────────────────────────────────────────────────
  // 1. DATE ROLLOVERS, SEASONALITY & LEAP YEARS
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Date Rollovers, Seasonality & Calendar Boundaries", () => {
    it("1.1 Year Rollover: 2026-12-31 (Thu) to 2027-01-01 (Fri)", async () => {
      // 2026-12-31 is Thursday (Alta factor 1.15, no weekend)
      // 2027-01-01 is Friday (Alta factor 1.15, weekend markup +15%)
      const quoteRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-12-31",
          checkOut: "2027-01-02", // 2 nights: Thu, Fri
          channel: "direct"
        })
      });
      assert.strictEqual(quoteRes.status, 200);
      const quote = await quoteRes.json();
      assert.strictEqual(quote.nights, 2);
      assert.strictEqual(quote.dailyRates.length, 2);

      const thuRate = quote.dailyRates[0].rate;
      const friRate = quote.dailyRates[1].rate;
      assert.strictEqual(quote.dailyRates[0].date, "2026-12-31");
      assert.strictEqual(quote.dailyRates[1].date, "2027-01-01");

      // Friday has weekend markup on top of Alta seasonality
      assert.ok(friRate > thuRate, `Friday rate (${friRate}) should exceed Thursday rate (${thuRate})`);
      const ratio = friRate / thuRate;
      assert.ok(Math.abs(ratio - 1.15) < 0.02, `Expected ~1.15 weekend ratio on year rollover, got ${ratio}`);
    });

    it("1.2 Seasonality Transition: March to April (Média 1.00 -> Baixa 0.90)", async () => {
      // 2026-03-31 is Tuesday (Média: 1.00)
      // 2026-04-01 is Wednesday (Baixa: 0.90)
      const quoteRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-03-31",
          checkOut: "2026-04-02",
          channel: "direct"
        })
      });
      assert.strictEqual(quoteRes.status, 200);
      const quote = await quoteRes.json();
      const marRate = quote.dailyRates[0].rate;
      const aprRate = quote.dailyRates[1].rate;

      assert.ok(marRate > aprRate, `March rate (${marRate}) must exceed April rate (${aprRate})`);
      const ratio = aprRate / marRate;
      assert.ok(Math.abs(ratio - 0.90) < 0.02, `Expected ~0.90 ratio for Baixa transition, got ${ratio}`);
    });

    it("1.3 Seasonality Transition: May to June (Baixa 0.90 -> Média 1.00)", async () => {
      // 2026-05-27 is Wednesday (Baixa: 0.90)
      // 2026-06-03 is Wednesday (Média: 1.00)
      const calMay = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-05&channel=direct`);
      const dataMay = await calMay.json();
      const mayWed = dataMay.days.find(d => d.date === "2026-05-27");

      const calJun = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-06&channel=direct`);
      const dataJun = await calJun.json();
      const junWed = dataJun.days.find(d => d.date === "2026-06-03");

      assert.ok(junWed.rate > mayWed.rate);
      const ratio = mayWed.rate / junWed.rate;
      assert.ok(Math.abs(ratio - 0.90) < 0.02, `Expected ~0.90 ratio, got ${ratio}`);
    });

    it("1.4 Seasonality Transition: June to July (Média 1.00 -> Alta 1.15)", async () => {
      const calJun = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-06&channel=direct`);
      const dataJun = await calJun.json();
      const junWed = dataJun.days.find(d => d.date === "2026-06-10");

      const calJul = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-07&channel=direct`);
      const dataJul = await calJul.json();
      const julWed = dataJul.days.find(d => d.date === "2026-07-08");

      assert.ok(julWed.rate > junWed.rate);
      const ratio = julWed.rate / junWed.rate;
      assert.ok(Math.abs(ratio - 1.15) < 0.02, `Expected ~1.15 Alta ratio, got ${ratio}`);
    });

    it("1.5 February days handling: Non-leap year 2026 has 28 days", async () => {
      const calFeb = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-02&channel=direct`);
      assert.strictEqual(calFeb.status, 200);
      const dataFeb = await calFeb.json();
      assert.strictEqual(dataFeb.days.length, 28);
      assert.strictEqual(dataFeb.days[27].date, "2026-02-28");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. DAY OF WEEK & WEEKEND VS WEEKDAY DYNAMICS
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Day of Week & Weekend Markup Dynamics", () => {
    it("2.1 Full 7-day week audit: only Friday (5) and Saturday (6) have weekendMarkup", async () => {
      // 2026-11-01 (Sun: 0) to 2026-11-07 (Sat: 6)
      const cal = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
      const data = await cal.json();
      const firstWeek = data.days.slice(0, 7);

      for (const d of firstWeek) {
        if (d.dayOfWeek === 5 || d.dayOfWeek === 6) {
          assert.strictEqual(d.isWeekend, true, `Day ${d.date} (dayOfWeek=${d.dayOfWeek}) must be weekend`);
        } else {
          assert.strictEqual(d.isWeekend, false, `Day ${d.date} (dayOfWeek=${d.dayOfWeek}) must NOT be weekend`);
        }
      }

      const sun = firstWeek.find(d => d.dayOfWeek === 0);
      const mon = firstWeek.find(d => d.dayOfWeek === 1);
      const wed = firstWeek.find(d => d.dayOfWeek === 3);
      const fri = firstWeek.find(d => d.dayOfWeek === 5);
      const sat = firstWeek.find(d => d.dayOfWeek === 6);

      // Weekdays and Sunday must have equal base rates
      assert.strictEqual(sun.rate, mon.rate);
      assert.strictEqual(mon.rate, wed.rate);

      // Friday and Saturday must have equal weekend rates higher than weekday
      assert.strictEqual(fri.rate, sat.rate);
      assert.ok(fri.rate > wed.rate);
      assert.ok(Math.abs(fri.rate / wed.rate - 1.15) < 0.02);
    });

    it("2.2 Setting weekendMarkupPct: 0 removes weekend price difference", async () => {
      // Set weekend markup to 0
      await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekendMarkupPct: 0 })
      });

      const cal = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
      const data = await cal.json();
      const wed = data.days.find(d => d.date === "2026-11-04");
      const fri = data.days.find(d => d.date === "2026-11-06");

      assert.strictEqual(wed.rate, fri.rate, "With 0% weekend markup, Friday rate should equal Wednesday rate");

      // Restore weekendMarkupPct to 0.15
      await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekendMarkupPct: 0.15 })
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MULTI-CHANNEL NORMALIZATION & UNKNOWN CHANNELS
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Channel Normalization & Fallback Handling", () => {
    it("3.1 Direct aliases (direto, site, whatsapp) normalize to direct (0% markup)", async () => {
      const aliases = ["direct", "direto", "direta", "site", "whatsapp"];
      const rates = [];

      for (const ch of aliases) {
        const qRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkIn: "2026-11-04",
            checkOut: "2026-11-05",
            channel: ch
          })
        });
        assert.strictEqual(qRes.status, 200);
        const qData = await qRes.json();
        rates.push(qData.dailyRates[0].rate);
      }

      // All aliases must yield identical daily rate
      const baseExpected = rates[0];
      for (let i = 1; i < rates.length; i++) {
        assert.strictEqual(rates[i], baseExpected, `Alias ${aliases[i]} should match direct rate ${baseExpected}`);
      }
    });

    it("3.2 Case insensitivity in quote channel: Booking, BOOKING, booking", async () => {
      const casings = ["booking", "Booking", "BOOKING"];
      const rates = [];

      for (const ch of casings) {
        const qRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkIn: "2026-11-04",
            checkOut: "2026-11-05",
            channel: ch
          })
        });
        const qData = await qRes.json();
        rates.push(qData.dailyRates[0].rate);
      }

      assert.strictEqual(rates[0], rates[1]);
      assert.strictEqual(rates[1], rates[2]);
    });

    it("3.3 Unknown channel (decolar, expedia, null) gracefully defaults to 0% markup without error", async () => {
      const qRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-11-04",
          checkOut: "2026-11-05",
          channel: "unknown_ota_channel"
        })
      });
      assert.strictEqual(qRes.status, 200);
      const qData = await qRes.json();

      const qDirect = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-11-04",
          checkOut: "2026-11-05",
          channel: "direct"
        })
      });
      const qDirectData = await qDirect.json();

      // Unknown channel defaults to 0% markup (same as direct)
      assert.strictEqual(qData.dailyRates[0].rate, qDirectData.dailyRates[0].rate);
    });

    it("3.4 Custom channel configuration via settings: decolar with 25% markup", async () => {
      await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelMarkups: {
            decolar: { channelName: "Decolar.com", markupPct: 0.25, commissionPct: 0.20 }
          }
        })
      });

      const qDecolar = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-11-04",
          checkOut: "2026-11-05",
          channel: "decolar"
        })
      });
      const dataDecolar = await qDecolar.json();

      const qDirect = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-11-04",
          checkOut: "2026-11-05",
          channel: "direct"
        })
      });
      const dataDirect = await qDirect.json();

      const ratio = dataDecolar.dailyRates[0].rate / dataDirect.dailyRates[0].rate;
      assert.ok(Math.abs(ratio - 1.25) < 0.02, `Expected ~1.25 Decolar ratio, got ${ratio}`);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. OVERRIDE PRECEDENCE & COLLISION MATRIX (The 4-level Hierarchy)
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Override Precedence & Strict Collision Hierarchy", () => {
    const targetDate = "2026-11-18"; // Wednesday

    it("4.1 Setup 4 simultaneous conflicting overrides on the same date", async () => {
      // Level 4: Global flat, All channels => 400
      await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: targetDate,
          endDate: targetDate,
          flatIds: ["all"],
          channels: ["all"],
          rate: 400,
          reason: "L4: Global All"
        })
      });

      // Level 3: Global flat, Booking channel => 500
      await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: targetDate,
          endDate: targetDate,
          flatIds: ["all"],
          channels: ["booking"],
          rate: 500,
          reason: "L3: Global Booking"
        })
      });

      // Level 2: Flat 1, All channels => 600
      await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: targetDate,
          endDate: targetDate,
          flatIds: [1],
          channels: ["all"],
          rate: 600,
          reason: "L2: Flat 1 All"
        })
      });

      // Level 1: Flat 1, Booking channel => 700
      await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: targetDate,
          endDate: targetDate,
          flatIds: [1],
          channels: ["booking"],
          rate: 700,
          reason: "L1: Flat 1 Booking"
        })
      });
    });

    it("4.2 Precedence verification across all 4 combinations", async () => {
      // 1. Flat 1 + Booking => L1 must win (700)
      const q1Booking = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn: targetDate, checkOut: "2026-11-19", flatId: 1, channel: "booking" })
      });
      const data1Booking = await q1Booking.json();
      assert.strictEqual(data1Booking.dailyRates[0].rate, 700, "Flat 1 on Booking must return Level 1 rate 700");

      // 2. Flat 1 + Direct => L2 must win (600)
      const q1Direct = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn: targetDate, checkOut: "2026-11-19", flatId: 1, channel: "direct" })
      });
      const data1Direct = await q1Direct.json();
      assert.strictEqual(data1Direct.dailyRates[0].rate, 600, "Flat 1 on Direct must return Level 2 rate 600");

      // 3. Flat 2 + Booking => L3 must win (500)
      const q2Booking = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn: targetDate, checkOut: "2026-11-19", flatId: 2, channel: "booking" })
      });
      const data2Booking = await q2Booking.json();
      assert.strictEqual(data2Booking.dailyRates[0].rate, 500, "Flat 2 on Booking must return Level 3 rate 500");

      // 4. Flat 2 + Direct => L4 must win (400)
      const q2Direct = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn: targetDate, checkOut: "2026-11-19", flatId: 2, channel: "direct" })
      });
      const data2Direct = await q2Direct.json();
      assert.strictEqual(data2Direct.dailyRates[0].rate, 400, "Flat 2 on Direct must return Level 4 rate 400");
    });

    it("4.3 Resolution by flat number string ('113' vs 1)", async () => {
      // Flat 1 has number 113. Calling with flatId='113' must resolve to same override
      const qNumBooking = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn: targetDate, checkOut: "2026-11-19", flatId: "113", channel: "booking" })
      });
      const dataNumBooking = await qNumBooking.json();
      assert.strictEqual(dataNumBooking.dailyRates[0].rate, 700, "Flat '113' must resolve to Flat 1 override rate 700");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. EXTREME VALUES & BOUNDARY CONDITIONS
  // ──────────────────────────────────────────────────────────────────────────
  describe("5. Extreme Values, Boundary Limits & Discount Rates", () => {
    it("5.1 Manual mode baseDailyRate: custom rate is preserved exactly", async () => {
      await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          baseDailyRate: 499.50,
          weekendMarkupPct: 0.10
        })
      });

      const cal = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
      const data = await cal.json();
      const wed = data.days.find(d => d.date === "2026-11-11");
      assert.strictEqual(wed.rate, 499.50);

      // Weekend 10%: 499.50 * 1.10 = 549.45
      const fri = data.days.find(d => d.date === "2026-11-13");
      assert.strictEqual(fri.rate, 549.45);
    });

    it("5.2 Probing baseDailyRate = 0 in manual mode", async () => {
      // Testing behavior when baseDailyRate is set to 0
      const setRes = await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          baseDailyRate: 0
        })
      });
      assert.strictEqual(setRes.status, 200);

      const cal = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
      const data = await cal.json();
      const wed = data.days.find(d => d.date === "2026-11-11");
      // Documenting whether 0 is accepted or falls back to default 237
      console.log(`[CHALLENGER PROBE] When baseDailyRate=0, calendar rate is: ${wed.rate}`);
      // If it falls back to 237 due to (settings.baseDailyRate || 237), we note this as an empirical observation.
    });

    it("5.3 Negative channel markup (discount, e.g. -15%)", async () => {
      await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          baseDailyRate: 200,
          weekendMarkupPct: 0,
          channelMarkups: {
            direct: { markupPct: -0.15 } // 15% discount on direct
          }
        })
      });

      const qRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2026-11-11",
          checkOut: "2026-11-12",
          channel: "direct"
        })
      });
      const qData = await qRes.json();
      // 200 * (1 - 0.15) = 170
      assert.strictEqual(qData.dailyRates[0].rate, 170, "Negative markup must calculate as discount");

      // Reset settings back to auto
      await fetch(`${BASE_URL}/api/tariffs/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "auto",
          weekendMarkupPct: 0.15,
          channelMarkups: {
            direct: { markupPct: 0.0 }
          }
        })
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. ADVERSARIAL & MALFORMED INPUTS TO BULK UPDATE
  // ──────────────────────────────────────────────────────────────────────────
  describe("6. Input Validation & Error Handling in Bulk Update", () => {
    it("6.1 Rejects inverted date range (startDate > endDate) with 400", async () => {
      const res = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-12-31",
          endDate: "2026-12-01",
          rate: 300
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "INVALID_DATE_RANGE");
    });

    it("6.2 Rejects non-numeric or non-positive rates with 400", async () => {
      // 1. rate = 0
      const resZero = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-12-01", endDate: "2026-12-02", rate: 0 })
      });
      assert.strictEqual(resZero.status, 400);
      assert.strictEqual((await resZero.json()).error, "INVALID_RATE");

      // 2. rate = -100
      const resNeg = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-12-01", endDate: "2026-12-02", rate: -100 })
      });
      assert.strictEqual(resNeg.status, 400);

      // 3. rate = "invalid_string"
      const resStr = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-12-01", endDate: "2026-12-02", rate: "cinquenta" })
      });
      assert.strictEqual(resStr.status, 400);
    });

    it("6.3 Rejects missing required parameters with 400", async () => {
      const resMissing = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-12-01" }) // missing endDate and rate
      });
      assert.strictEqual(resMissing.status, 400);
      assert.strictEqual((await resMissing.json()).error, "MISSING_PARAMETERS");
    });

    it("6.4 Idempotency: Duplicate bulk-update updates existing records without growing overrides array", async () => {
      const payload = {
        startDate: "2026-10-15",
        endDate: "2026-10-16",
        flatIds: [1],
        channels: ["direct"],
        rate: 350,
        reason: "Idempotency test"
      };

      // Call 1
      const res1 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data1 = await res1.json();
      const count1 = data1.overridesCount;

      // Call 2 with new rate
      payload.rate = 380;
      const res2 = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data2 = await res2.json();
      const count2 = data2.overridesCount;

      // overridesCount must remain equal (no duplicate rows inserted)
      assert.strictEqual(count1, count2, `Overrides count should not increase on idempotent update: was ${count1}, became ${count2}`);

      // Rate was successfully updated to 380
      const calRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-10&channel=direct&flatId=1`);
      const calData = await calRes.json();
      const day15 = calData.days.find(d => d.date === "2026-10-15");
      assert.strictEqual(day15.rate, 380);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. STRESS & VOLUME HARNESS
  // ──────────────────────────────────────────────────────────────────────────
  describe("7. Stress, High Volume & Performance Harness", () => {
    it("7.1 Large batch bulk update (60 days across 3 flats and 2 channels = 360 overrides)", async () => {
      const startTime = Date.now();
      const bulkRes = await fetch(`${BASE_URL}/api/tariffs/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2027-01-01",
          endDate: "2027-03-01", // 60 days
          flatIds: [1, 2, 3],
          channels: ["direct", "booking"],
          rate: 420,
          reason: "Stress batch test"
        })
      });
      const elapsed = Date.now() - startTime;
      assert.strictEqual(bulkRes.status, 200);
      const data = await bulkRes.json();

      assert.ok(data.updatedCount >= 360, `Expected at least 360 updates, got ${data.updatedCount}`);
      assert.ok(elapsed < 2000, `Bulk update took ${elapsed}ms (must be < 2000ms)`);
      console.log(`[STRESS METRIC] Bulk update of ${data.updatedCount} items completed in ${elapsed}ms`);
    });

    it("7.2 Calendar query performance with hundreds of overrides in database", async () => {
      const startTime = Date.now();
      const calRes = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2027-01&channel=booking&flatId=1`);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(calRes.status, 200);
      const calData = await calRes.json();
      assert.strictEqual(calData.days.length, 31);
      assert.strictEqual(calData.days[0].rate, 420);
      assert.ok(elapsed < 500, `Calendar query took ${elapsed}ms (must be < 500ms)`);
      console.log(`[STRESS METRIC] 31-day calendar query across ${calData.days.length} days completed in ${elapsed}ms`);
    });

    it("7.3 Multi-night quote accuracy: 30-night continuous stay sum verification", async () => {
      const quoteRes = await fetch(`${BASE_URL}/api/bot-actions/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: "2027-01-01",
          checkOut: "2027-01-31", // 30 nights
          flatId: 1,
          channel: "booking"
        })
      });
      assert.strictEqual(quoteRes.status, 200);
      const quote = await quoteRes.json();

      assert.strictEqual(quote.nights, 30);
      assert.strictEqual(quote.dailyRates.length, 30);

      // Verify that all 30 nights reflect the override 420
      for (const nr of quote.dailyRates) {
        assert.strictEqual(nr.rate, 420);
      }

      // Expected room total: 30 * 420 = 12,600
      assert.strictEqual(quote.roomTotal, 12600);
      assert.strictEqual(quote.total, 12600 + quote.cleaningFee + quote.extraBedFee + quote.breakfastFee);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. ADVERSARIAL CALENDAR ENDPOINT PROBES
  // ──────────────────────────────────────────────────────────────────────────
  describe("8. Calendar Endpoint Adversarial Probing", () => {
    it("8.1 Probe: channel case sensitivity in override matching in calendar", async () => {
      // We know an override exists for 'booking' on 2027-01-01 for flatId 1
      const resLower = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2027-01&channel=booking&flatId=1`);
      const dataLower = await resLower.json();
      const dayLower = dataLower.days[0];

      const resUpper = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2027-01&channel=Booking&flatId=1`);
      const dataUpper = await resUpper.json();
      const dayUpper = dataUpper.days[0];

      console.log(`[CHALLENGER PROBE] Lowercase 'booking': rate=${dayLower.rate}, hasOverride=${dayLower.hasOverride}`);
      console.log(`[CHALLENGER PROBE] Titlecase 'Booking': rate=${dayUpper.rate}, hasOverride=${dayUpper.hasOverride}`);

      // Both should have rate 420
      assert.strictEqual(dayLower.rate, 420);
      assert.strictEqual(dayUpper.rate, 420);
    });

    it("8.2 Probe: General calendar without flatId when specific flat override exists", async () => {
      // Override exists for flatId=1 on 2026-11-18 (rate 700)
      // When requesting general calendar without flatId, what does it report?
      const resGen = await fetch(`${BASE_URL}/api/tariffs/calendar?month=2026-11&channel=direct`);
      const dataGen = await resGen.json();
      const day18 = dataGen.days.find(d => d.date === "2026-11-18");

      console.log(`[CHALLENGER PROBE] General calendar on day with specific flat override: rate=${day18.rate}, hasOverride=${day18.hasOverride}, overrideFlatId=${day18.override?.flatId}`);
    });
  });
});
