/**
 * Minimal Reproducer: Race Condition & Double-Commit in /modify-status
 * File: tests/repro-concurrency-bug.test.mjs
 * Execution: node --test tests/repro-concurrency-bug.test.mjs
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

const TEST_PORT = 3996;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const isolatedDbPath = path.join(rootDir, `data/test-repro-concurrency-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Empirical Reproduction: Concurrent Polling Double-Commit Bug", () => {
  before(async () => {
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") killProcessTree(pid);
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}

    const initialDb = {
      flats: [{ id: 1, number: "113", colName: "113", isOccupied: false }],
      reservations: [
        {
          id: 7001,
          code: "RES-RACE-001",
          guestName: "Roberto Concurrency",
          flatId: 1,
          flatNumber: "113",
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          guestCount: 1,
          dailyRate: 150,
          totalAmount: 300,
          paidAmount: 300,
          paymentStatus: "pago_total",
          status: "confirmada",
          channel: "whatsapp",
          fnhrCompleted: true,
          needsReSignature: false,
          payments: [{ id: "p1", amount: 300, method: "pix", date: "2026-10-01T10:00:00Z" }]
        }
      ]
    };

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

    serverProcess.stderr?.on("data", d => process.stderr.write(d));

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
    if (serverProcess && serverProcess.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  it("3 concurrent requests to /modify-status commit exactly once without duplicate payments or balance corruption", async () => {
    // 1. Create checkout hold for +1 night (+150 BRL)
    const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-RACE-001/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-13",
        paymentMethod: "pix"
      })
    });
    assert.equal(checkoutRes.status, 200);
    const checkoutData = await checkoutRes.json();
    const pendingId = checkoutData.pendingId;

    // 2. Fire just 3 concurrent polling requests with payment simulation
    const p1 = fetch(`${BASE_URL}/api/pms/guest-portal/RES-RACE-001/modify-status?pendingId=${pendingId}&simulatePayment=true`);
    const p2 = fetch(`${BASE_URL}/api/pms/guest-portal/RES-RACE-001/modify-status?pendingId=${pendingId}&simulatePayment=true`);
    const p3 = fetch(`${BASE_URL}/api/pms/guest-portal/RES-RACE-001/modify-status?pendingId=${pendingId}&simulatePayment=true`);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    const d1 = await r1.json();
    const d2 = await r2.json();
    const d3 = await r3.json();

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);
    assert.equal(d1.success, true);
    assert.equal(d2.success, true);
    assert.equal(d3.success, true);
    assert.equal(d1.paid, true);
    assert.equal(d2.paid, true);
    assert.equal(d3.paid, true);
    assert.equal(d1.committed, true);
    assert.equal(d2.committed, true);
    assert.equal(d3.committed, true);

    // 3. Inspect database state
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-RACE-001");

    assert.equal(r.totalAmount, 450, "totalAmount must be exactly 450 (300 + 150)");
    assert.equal(r.paidAmount, 450, "paidAmount must be exactly 450");
    assert.equal(r.payments.length, 2, "Expected exactly 2 payments (1 initial + 1 modification)");
    assert.equal(r.modificationHistory?.length, 1, "Expected exactly 1 modificationHistory entry");
    assert.equal(r.pendingModification, undefined, "pendingModification must be cleaned up");
  });
});
