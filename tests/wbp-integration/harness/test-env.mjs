/**
 * tests/wbp-integration/harness/test-env.mjs
 *
 * Master Isolation Test Environment for WebBookingPro Integration.
 * Guarantees zero leakage to production:
 * - Unsets DATABASE_URL completely.
 * - Creates an isolated temporary clone of database.json.
 * - Allocates exclusive ephemeral/collision-free ports.
 * - Spawns isolated backend and WBP simulator.
 * - Provides guaranteed teardown with process tree termination and DB cleanup.
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WbpSimulatorHarness } from "./wbp-simulator-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

/**
 * Finds an available, unused TCP port on localhost.
 * @returns {Promise<number>}
 */
export async function getAvailablePort(startPort = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(startPort, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Kills a process tree cleanly across Windows and Unix platforms.
 * @param {number} pid
 */
export function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

/**
 * Polls an HTTP endpoint until it answers successfully or times out.
 */
async function waitForHttp(url, timeoutMs = 25000, intervalMs = 250) {
  const start = Date.now();
  let lastErr = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 304 || res.status === 404) {
        return true;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`[test-env] Service failed to respond at ${url} within ${timeoutMs}ms. Last error: ${lastErr?.message}`);
}

/**
 * Boots the isolated WebBookingPro test environment.
 * @param {object} [options]
 * @returns {Promise<IsolatedWbpContext>}
 */
export async function startIsolatedWbpEnvironment(options = {}) {
  // 1. Prepare temporary isolated database
  const prodDbPath = path.join(rootDir, "data/database.json");
  const randSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tempDbPath = path.join(rootDir, `data/test-wbp-env-${randSuffix}.json`);

  let baseData = {};
  if (fs.existsSync(prodDbPath)) {
    try {
      baseData = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    } catch (_) {
      baseData = {};
    }
  }

  // Seed default test state
  const testData = {
    ...baseData,
    wbpSettings: {
      enabled: options.wbpEnabled ?? false,
      mode: options.wbpMode || "off",
      cid: options.wbpCid || "CORPFLATS_TEST_CID",
      sharedSecret: options.wbpSharedSecret || "test_secret_123",
      propertyId: options.wbpPropertyId || "101",
      propertyPassword: options.wbpPropertyPassword || "test_pass_123",
      syncIntervalMinutes: 30,
      ...options.wbpSettingsOverrides
    },
    quarantineBookings: options.initialQuarantine || [],
    wbpRawPayloads: options.initialRawPayloads || [],
    ...options.dbOverrides
  };

  fs.writeFileSync(tempDbPath, JSON.stringify(testData, null, 2), "utf-8");

  // 2. Allocate ports
  const simulatorPort = options.simulatorPort || (await getAvailablePort());
  const backendPort = options.backendPort || (await getAvailablePort());

  // 3. Start WBP Simulator
  const simulator = new WbpSimulatorHarness({
    port: simulatorPort,
    propertyId: options.wbpPropertyId || "101",
    sharedSecret: options.wbpSharedSecret || "test_secret_123"
  });
  await simulator.start();

  // 4. Spawn isolated backend process
  const backendEntry = path.join(rootDir, "artifacts/api-server/demo-server.mjs");
  const env = {
    ...process.env,
    PORT: String(backendPort),
    DATABASE_URL: "", // Strictly unset! Zero connection to production Postgres
    DATA_FILE: tempDbPath,
    DATABASE_FILE: tempDbPath,
    NODE_ENV: "test",
    WBP_API_URL: simulator.baseUrl,
    WBP_ENABLED: String(options.wbpEnabled ?? "false"),
    WBP_MODE: String(options.wbpMode || "off"),
    WBP_CID: options.wbpCid || "CORPFLATS_TEST_CID",
    WBP_SHARED_SECRET: options.wbpSharedSecret || "test_secret_123",
    WBP_PROPERTY_ID: options.wbpPropertyId || "101",
    WBP_PROPERTY_PASSWORD: options.wbpPropertyPassword || "test_pass_123",
    CARD_ENCRYPTION_KEY: options.cardKey || "test-card-encryption-key-32b-!",
    SERPRO_MOCK: "true",
    ZAPI_TEST_MODE: "true"
  };

  const backendProcess = spawn("node", [backendEntry], {
    cwd: rootDir,
    env,
    stdio: options.verbose ? "inherit" : "pipe"
  });

  const pid = backendProcess.pid;

  // 5. Wait for backend health
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
  try {
    await waitForHttp(`${backendBaseUrl}/api/health`, 25000);
  } catch (startupErr) {
    killProcessTree(pid);
    await simulator.stop();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch (_) {}
    throw new Error(`[test-env] Isolated backend failed to start: ${startupErr.message}`);
  }

  let isStopped = false;

  const teardown = async () => {
    if (isStopped) return;
    isStopped = true;

    // Terminate backend
    if (pid) {
      killProcessTree(pid);
    }

    // Stop simulator
    await simulator.stop();

    // Clean up temporary database file
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (_) {}
  };

  return {
    backendUrl: backendBaseUrl,
    backendPort,
    simulatorUrl: simulator.baseUrl,
    simulatorPort,
    simulator,
    dbPath: tempDbPath,
    pid,
    teardown,
    stop: teardown,
    readDatabase: () => {
      try {
        return JSON.parse(fs.readFileSync(tempDbPath, "utf-8"));
      } catch (_) {
        return null;
      }
    }
  };
}
