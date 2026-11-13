/**
 * Test: Smoke Harness Verification for WebBookingPro Integration
 * File: tests/wbp-integration/smoke-harness.test.mjs
 * Execution: node tests/wbp-integration/e2e-runner.mjs tests/wbp-integration/smoke-harness.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { startIsolatedWbpEnvironment } from "./harness/index.mjs";

describe("WBP Integration Harness & Simulator Smoke Test", () => {
  let env = null;

  before(async () => {
    // Start isolated test environment
    env = await startIsolatedWbpEnvironment({
      wbpEnabled: false,
      wbpMode: "off"
    });
  });

  after(async () => {
    if (env) {
      await env.stop();
    }
  });

  it("1. Isolated backend is healthy and responding on its exclusive port", async () => {
    assert.ok(env.backendPort > 0, "Backend port must be assigned");
    assert.ok(env.backendUrl.startsWith("http://127.0.0.1"), "Backend URL must be localhost");

    const res = await fetch(`${env.backendUrl}/api/health`);
    assert.strictEqual(res.status, 200, "Backend /api/health should return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.status, "ok");
  });

  it("2. WBP Simulator is running on its exclusive port and responds to HealthCheck", async () => {
    assert.ok(env.simulatorPort > 0, "Simulator port must be assigned");
    assert.notStrictEqual(env.backendPort, env.simulatorPort, "Ports must not collide");

    const simRes = await fetch(`${env.simulatorUrl}/cloudpms/HealthCheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guid: "test-guid-123" })
    });

    assert.strictEqual(simRes.status, 200);
    const simData = await simRes.json();
    assert.strictEqual(simData.success, true);
    assert.strictEqual(simData.guid, "test-guid-123");

    // Verify call tracking in simulator
    const calls = env.simulator.getCalls("HealthCheck");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].guid, "test-guid-123");
  });

  it("3. Test environment uses an isolated temporary database copy", async () => {
    assert.ok(fs.existsSync(env.dbPath), "Temporary database file must exist during test run");
    assert.ok(env.dbPath.includes("test-wbp-env-"), "Temporary database file must have test prefix");

    const db = env.readDatabase();
    assert.ok(db, "Database content must be valid JSON");
    assert.strictEqual(db.wbpSettings.enabled, false);
    assert.strictEqual(db.wbpSettings.mode, "off");
  });

  it("4. Simulator correctly injects faults on demand", async () => {
    env.simulator.setFault("ARIUpdate", { code: 1001, message: "FAULT.OTA.LOGIN Invalid credentials" });

    const ariRes = await fetch(`${env.simulatorUrl}/cloudpms/ARIUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guid: "ari-guid-456", updates: [] })
    });

    assert.strictEqual(ariRes.status, 200); // WBP spec returns HTTP 200 with error details
    const ariData = await ariRes.json();
    assert.strictEqual(ariData.success, false);
    assert.strictEqual(ariData.error, 1001);
    assert.ok(ariData.error_message.includes("FAULT.OTA.LOGIN"));

    // Clear fault for subsequent tests
    env.simulator.clearFault("ARIUpdate");
  });
});
