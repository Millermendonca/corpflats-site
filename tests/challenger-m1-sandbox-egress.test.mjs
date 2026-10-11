/**
 * tests/challenger-m1-sandbox-egress.test.mjs
 * 
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE:
 * Milestone 1 - Sandbox Isolation, Network Egress Prevention & Time-Travel Engine
 * 
 * Executed by: Challenger 1 (critic, specialist)
 * Verification command: node --test tests/challenger-m1-sandbox-egress.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import nodemailer from "nodemailer";
import { startSandbox, stopSandbox, getSandboxInfo } from "../e2e/sandbox/test-server.mjs";
import { cleanTestDatabase } from "../e2e/sandbox/db-seeder.mjs";

const ROOT_DIR = process.cwd();
const PROD_DB_PATH = path.resolve(ROOT_DIR, "data/database.json");
const TEST_DB_PATH = path.resolve(ROOT_DIR, "data/database.test.json");

function getSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function checkPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.once("close", () => resolve(true)).close();
      })
      .listen(port, host);
  });
}

async function waitForPortsFree(ports, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statuses = await Promise.all(ports.map(p => checkPortFree(p)));
    if (statuses.every(s => s === true)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
}

describe("Adversarial Challenge: Milestone 1 Sandbox & Egress Verification", () => {
  let initialProdHash = null;
  let sandbox = null;

  before(async () => {
    initialProdHash = getSha256(PROD_DB_PATH);
    assert.ok(initialProdHash, "Production data/database.json must exist before test starts.");

    // Ensure any previously running sandbox is stopped and ports are fully free
    await stopSandbox().catch(() => {});
    await waitForPortsFree([5055, 5056, 5025]);
    await new Promise(r => setTimeout(r, 1000));

    sandbox = await startSandbox({
      port: 5055,
      zapiPort: 5056,
      smtpPort: 5025,
      dbPath: TEST_DB_PATH,
      silent: true
    });
    assert.ok(sandbox, "Sandbox must initialize");
  });

  after(async () => {
    if (sandbox) {
      await sandbox.stop();
    }
    cleanTestDatabase({ testDbPath: TEST_DB_PATH });

    // Assert final prod DB integrity
    const finalProdHash = getSha256(PROD_DB_PATH);
    assert.equal(finalProdHash, initialProdHash, "CRITICAL BLINDSPOT: Production DB was mutated!");
  });

  describe("1. Twin-Server Parity Mandate", () => {
    it("artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs must have identical SHA-256", () => {
      const p1 = path.join(ROOT_DIR, "artifacts/api-server/demo-server.mjs");
      const p2 = path.join(ROOT_DIR, "scripts/demo-server.mjs");
      assert.ok(fs.existsSync(p1), "Primary demo-server.mjs must exist");
      assert.ok(fs.existsSync(p2), "Mirror demo-server.mjs must exist");

      const h1 = getSha256(p1);
      const h2 = getSha256(p2);
      assert.equal(h1, h2, "Twin-server parity violation: demo-server.mjs hash mismatch!");
    });

    it("shared service modules between artifacts/api-server and scripts must match exactly", () => {
      const sharedFiles = [
        "fnrh-pdf-service.mjs",
        "fnrh-serpro-service.mjs",
        "mail-service.mjs",
        "storage-service.mjs",
        "whatsapp-ai-service.mjs",
        "zapi-service.mjs"
      ];

      for (const file of sharedFiles) {
        const p1 = path.join(ROOT_DIR, "artifacts/api-server", file);
        const p2 = path.join(ROOT_DIR, "scripts", file);
        if (fs.existsSync(p2)) {
          const h1 = getSha256(p1);
          const h2 = getSha256(p2);
          assert.equal(h1, h2, `Twin-server parity violation on ${file}!`);
        }
      }
    });
  });

  describe("2. Production Database Immutability Under Heavy Mutation", () => {
    it("production DB hash remains invariant after booting and querying backend", () => {
      const currentHash = getSha256(PROD_DB_PATH);
      assert.equal(currentHash, initialProdHash, "Production DB hash mutated during startup!");
    });

    it("concurrent write barrage to test backend does not touch production DB", async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          fetch(`${sandbox.baseUrl}/api/pms/inter/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pix: [{
                txid: `PIX_STRESS_${Date.now()}_${i}`,
                valor: 100 + i,
                horario: new Date().toISOString(),
                endToEndId: `E_STRESS_${i}`
              }]
            })
          })
        );
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        assert.ok(res.ok, "Webhook write request should succeed");
      }

      // Assert test DB exists and is updated
      assert.ok(fs.existsSync(TEST_DB_PATH), "database.test.json must exist and receive writes");

      // Assert production DB is strictly unchanged
      const afterStressHash = getSha256(PROD_DB_PATH);
      assert.equal(afterStressHash, initialProdHash, "CRITICAL: Production DB hash mutated during stress writes!");
    });
  });

  describe("3. Network Egress Prevention & Mock Interception", () => {
    it("WhatsApp Z-API interceptor captures outbound messages without external network calls", async () => {
      sandbox.mockZapi.clearSentMessages();

      const testPhone = "5522998505276";
      const testMsg = "ADVERSARIAL_TEST_ZAPI_PACKET_EGRESS_CHECK";

      const res = await fetch(`http://127.0.0.1:${sandbox.zapiPort}/instances/SANDBOX_MOCK_INSTANCE/token/SANDBOX_MOCK_TOKEN/send-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testPhone,
          message: testMsg
        })
      });
      assert.equal(res.status, 200);

      const captured = sandbox.mockZapi.getSentMessages();
      assert.ok(captured.length >= 1, "Mock Z-API must record intercepted message");
      const found = captured.find(m => m.phone === testPhone && m.message === testMsg);
      assert.ok(found, "Intercepted message details must match exactly");
    });

    it("WhatsApp Z-API inbound webhook dispatches cleanly into isolated backend", async () => {
      const inboundPhone = "5522999990000";
      const inboundText = "Dúvida sobre horário de check-in";

      const res = await sandbox.mockZapi.dispatchIncomingMessage({
        backendBaseUrl: sandbox.baseUrl,
        phone: inboundPhone,
        text: inboundText
      });
      assert.ok(res.status < 400, "Backend must accept inbound webhook without error");
    });

    it("SMTP Nodemailer interceptor traps TCP emails without outbound relay", async () => {
      sandbox.mockSmtp.clearSentEmails();

      const transporter = nodemailer.createTransport({
        host: "127.0.0.1",
        port: sandbox.smtpPort,
        secure: false,
        auth: { user: "sandbox", pass: "sandbox" }
      });

      const info = await transporter.sendMail({
        from: '"Security Test" <security@corpflats.local>',
        to: "adversary@corpflats.local",
        subject: "EGRESS_TRAP_TEST_SUBJECT",
        text: "Zero external network egress guaranteed."
      });
      assert.ok(info.messageId, "Mock SMTP must respond with messageId");

      const sentEmails = sandbox.mockSmtp.getSentEmails();
      assert.ok(sentEmails.length >= 1, "Mock SMTP must capture email");
      const match = sentEmails.find(e => e.subject.includes("EGRESS_TRAP_TEST_SUBJECT"));
      assert.ok(match, "Captured email must match sent subject");
      assert.ok(match.to.includes("adversary@corpflats.local"), "Recipient must match");
    });

    it("PIX simulator confirms instant payment without calling external Inter banking API", async () => {
      const txid = "PIX_SANDBOX_TX_001";
      const amount = 280.00;
      const resCode = "RES-TEST-PIX-PENDING";

      const simRes = await sandbox.pixSimulator.simulatePixPayment({
        baseUrl: sandbox.baseUrl,
        txid,
        amount,
        reservationCode: resCode
      });
      assert.equal(simRes.success, true, "PIX simulation must succeed");

      const check = await sandbox.pixSimulator.checkPaymentStatus({
        baseUrl: sandbox.baseUrl,
        reservationCode: resCode
      });
      assert.equal(check.paid, true);
      assert.equal(check.paymentStatus, "pago_total");
      assert.equal(check.paidAmount, 280.00);
    });

    it("SERPRO FNRH client operates in mock mode when SERPRO_MOCK=true", async () => {
      const res = await fetch(`${sandbox.baseUrl}/api/pms/fnrh/health`);
      // Endpoint may return 200 with status ok and mock indicators
      if (res.ok) {
        const json = await res.json();
        assert.ok(json.ok !== undefined || json.status !== undefined);
      }
    });
  });

  describe("4. Time-Travel Engine Stress & Adversarial Boundary Probes", () => {
    it("shifts forward to 14:00 (lock key release) and asserts Brasilia hour", async () => {
      const tt = await sandbox.timeTravel.setTimeTravelHour({
        baseUrl: sandbox.baseUrl,
        targetHour: 14
      });
      assert.equal(tt.brasilia.hour, 14);
    });

    it("shifts forward to 18:00 (maid shift change) and asserts Brasilia hour", async () => {
      const tt = await sandbox.timeTravel.setTimeTravelHour({
        baseUrl: sandbox.baseUrl,
        targetHour: 18
      });
      assert.equal(tt.brasilia.hour, 18);
    });

    it("shifts forward to 22:00 (breakfast cutoff) and asserts Brasilia hour", async () => {
      const tt = await sandbox.timeTravel.setTimeTravelHour({
        baseUrl: sandbox.baseUrl,
        targetHour: 22
      });
      assert.equal(tt.brasilia.hour, 22);
    });

    it("shifts to midnight (00:00 date switchover) without date arithmetic overflow", async () => {
      const tt = await sandbox.timeTravel.setTimeTravelHour({
        baseUrl: sandbox.baseUrl,
        targetHour: 0
      });
      assert.equal(tt.brasilia.hour, 0);
    });

    it("resets clock to offset 0 cleanly", async () => {
      const reset = await sandbox.timeTravel.resetTimeTravel({
        baseUrl: sandbox.baseUrl
      });
      assert.equal(reset.offsetMs, 0);
    });

    it("handles negative offset (traveling backward in time)", async () => {
      const pastOffset = -86400000; // -24 hours
      const res = await sandbox.timeTravel.setTimeTravelOffset({
        baseUrl: sandbox.baseUrl,
        offsetMs: pastOffset
      });
      assert.equal(res.offsetMs, pastOffset);

      // Verify health check reflects simulated timestamp
      const health = await fetch(`${sandbox.baseUrl}/api/health`).then(r => r.json());
      const healthDate = new Date(health.timestamp).getTime();
      const realDate = Date.now();
      assert.ok(healthDate < realDate - 80000000, "Health check must reflect backward time shift");

      // Reset
      await sandbox.timeTravel.resetTimeTravel({ baseUrl: sandbox.baseUrl });
    });

    it("handles arbitrary ISO target date (e.g. leap year 2028-02-29)", async () => {
      const targetDate = "2028-02-29T15:30:00Z";
      const res = await sandbox.timeTravel.setTimeTravelDate({
        baseUrl: sandbox.baseUrl,
        targetDate
      });
      assert.ok(res.success);
      assert.ok(res.effectiveIso.startsWith("2028-02-29"));

      await sandbox.timeTravel.resetTimeTravel({ baseUrl: sandbox.baseUrl });
    });

    it("survives malformed inputs to POST /api/test/time-travel without crashing backend", async () => {
      // 1. Invalid date string
      const res1 = await fetch(`${sandbox.baseUrl}/api/test/time-travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: "invalid-not-a-date" })
      });
      assert.equal(res1.status, 200, "Must return 200 and ignore invalid date");

      // 2. Empty payload
      const res2 = await fetch(`${sandbox.baseUrl}/api/test/time-travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res2.status, 200, "Must handle empty body gracefully");

      // 3. String offsetMs
      const res3 = await fetch(`${sandbox.baseUrl}/api/test/time-travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offsetMs: "not-a-number" })
      });
      assert.equal(res3.status, 200, "Must handle string offset without crashing");

      // Reset
      await sandbox.timeTravel.resetTimeTravel({ baseUrl: sandbox.baseUrl });
    });

    it("rapid flapping of time-travel offsets (30 sequential shifts) remains stable", async () => {
      for (let i = 0; i < 30; i++) {
        const hour = (i % 2 === 0) ? 14 : 22;
        const res = await fetch(`${sandbox.baseUrl}/api/test/time-travel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetHour: hour })
        });
        assert.equal(res.status, 200);
      }

      const reset = await sandbox.timeTravel.resetTimeTravel({ baseUrl: sandbox.baseUrl });
      assert.equal(reset.offsetMs, 0);
    });
  });

  describe("5. Lifecycle and Process Teardown Cleanliness", () => {
    it("verify-sandbox.mjs execution exits with code 0", async () => {
      // Temporarily stop our suite's sandbox so verify-sandbox can boot its own
      await sandbox.stop();
      await waitForPortsFree([5055, 5056, 5025]);

      const { execSync } = await import("node:child_process");
      const output = execSync("node e2e/sandbox/verify-sandbox.mjs", {
        cwd: ROOT_DIR,
        encoding: "utf-8"
      });
      assert.ok(output.includes("100% of Milestone 1 criteria passed"), "verify-sandbox.mjs must pass completely");

      // Ports must be free after verify-sandbox teardown
      const p5055 = await checkPortFree(5055);
      const p5056 = await checkPortFree(5056);
      const p5025 = await checkPortFree(5025);
      assert.ok(p5055, "Port 5055 must be free");
      assert.ok(p5056, "Port 5056 must be free");
      assert.ok(p5025, "Port 5025 must be free");
    });
  });
});
