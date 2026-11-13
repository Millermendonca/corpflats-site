/**
 * e2e/sandbox/test-server.mjs
 * 
 * Master Sandbox Controller for CorpFlats E2E Synthetic Testing.
 * Boots isolated mock servers, seeds database.test.json, launches test backend on port 5055,
 * and coordinates clean shutdown with zero leaks to production.
 */

import { spawn, execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { seedTestDatabase, cleanTestDatabase } from "./db-seeder.mjs";
import { startMockZapi, stopMockZapi, getSentMessages, clearSentMessages, dispatchIncomingMessage } from "./mock-zapi.mjs";
import { startMockSmtp, stopMockSmtp, getSentEmails, clearSentEmails, getLastEmail } from "./mock-smtp.mjs";
import * as timeTravelHelpers from "./time-travel.mjs";
import * as pixSimulatorHelpers from "./pix-simulator.mjs";

let backendProcess = null;
let currentConfig = null;

/**
 * Checks if a TCP port is responding or if the HTTP endpoint is alive.
 */
async function waitForHealthCheck(url, timeoutMs = 25000, intervalMs = 400) {
  const start = Date.now();
  let lastErr = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 304) {
        return true;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error(`[test-server] Server failed to become healthy at ${url} within ${timeoutMs}ms. Last error: ${lastErr?.message}`);
}

/**
 * Kills a process tree cleanly on Windows and Unix.
 */
function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (err) {
    // Process might already be dead
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

/**
 * Boots the entire isolated sandbox ecosystem:
 * 1. Seeds `data/database.test.json`.
 * 2. Starts Mock Z-API on port 5056.
 * 3. Starts Mock SMTP on port 5025.
 * 4. Spawns isolated backend on port 5055.
 * 5. Waits for healthcheck.
 * 
 * @param {object} [options]
 * @param {number} [options.port=5055] - Test backend HTTP port
 * @param {number} [options.zapiPort=5056] - Mock Z-API HTTP port
 * @param {number} [options.smtpPort=5025] - Mock SMTP TCP port
 * @param {string} [options.dbPath="data/database.test.json"] - Test database path
 * @param {boolean} [options.silent=true] - Suppress stdout from child backend
 * @returns {Promise<object>} Active sandbox controller
 */
export async function startSandbox(options = {}) {
  if (backendProcess) {
    console.warn("[test-server] Sandbox is already running! Returning existing instance.");
    return getSandboxInfo();
  }

  const port = Number(options.port || 5055);
  const zapiPort = Number(options.zapiPort || 5056);
  const smtpPort = Number(options.smtpPort || 5025);
  const dbPath = path.resolve(process.cwd(), options.dbPath || "data/database.test.json");
  const silent = options.silent !== false;

  console.log(`[test-server] Initializing isolated sandbox on port ${port}...`);

  // 1. Seed database.test.json safely
  seedTestDatabase({
    testDbPath: dbPath,
    zapiPort,
    smtpPort,
    overrides: options.dbOverrides || {}
  });

  // 2. Start mock servers
  console.log(`[test-server] Starting Mock Z-API on port ${zapiPort}...`);
  await startMockZapi(zapiPort);

  console.log(`[test-server] Starting Mock SMTP on port ${smtpPort}...`);
  await startMockSmtp(smtpPort);

  // 3. Spawn isolated backend
  const backendEntry = path.resolve(process.cwd(), "artifacts/api-server/demo-server.mjs");
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: "", // Disable Postgres pool connection completely
    DATABASE_FILE: dbPath,
    DATA_FILE: dbPath,
    NODE_ENV: "test",
    SERPRO_MOCK: "true",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_USER: "sandbox@corpflats.local",
    SMTP_PASS: "sandbox",
    ZAPI_TEST_MODE: "true"
  };

  console.log(`[test-server] Spawning isolated Express backend (PID pending)...`);
  backendProcess = spawn("node", [backendEntry], {
    env,
    stdio: silent ? "ignore" : "inherit",
    detached: false
  });

  const pid = backendProcess.pid;
  console.log(`[test-server] Isolated backend spawned with PID ${pid}.`);

  backendProcess.on("exit", (code, signal) => {
    if (backendProcess?.pid === pid) {
      console.log(`[test-server] Backend process ${pid} exited (code: ${code}, signal: ${signal}).`);
      backendProcess = null;
    }
  });

  // 4. Wait for health check
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[test-server] Waiting for backend health at ${baseUrl}/api/health...`);
  await waitForHealthCheck(`${baseUrl}/api/health`, 25000);
  console.log(`[test-server] Isolated sandbox backend is healthy and ready!`);

  currentConfig = {
    baseUrl,
    port,
    zapiPort,
    smtpPort,
    dbPath,
    pid,
    stop: stopSandbox,
    timeTravel: timeTravelHelpers,
    pixSimulator: pixSimulatorHelpers,
    mockZapi: {
      getSentMessages,
      clearSentMessages,
      dispatchIncomingMessage
    },
    mockSmtp: {
      getSentEmails,
      clearSentEmails,
      getLastEmail
    }
  };

  return currentConfig;
}

/**
 * Gracefully terminates the sandbox backend and mock servers.
 * @returns {Promise<void>}
 */
export async function stopSandbox() {
  console.log("[test-server] Stopping sandbox...");

  if (backendProcess) {
    const pid = backendProcess.pid;
    console.log(`[test-server] Killing backend process tree (PID: ${pid})...`);
    killProcessTree(pid);
    backendProcess = null;
  }

  try {
    await stopMockZapi();
  } catch (err) {
    console.warn("[test-server] Error stopping mock Z-API:", err.message);
  }

  try {
    await stopMockSmtp();
  } catch (err) {
    console.warn("[test-server] Error stopping mock SMTP:", err.message);
  }

  currentConfig = null;
  console.log("[test-server] Sandbox teardown complete.");
}

/**
 * Returns current sandbox runtime info or null if stopped.
 */
export function getSandboxInfo() {
  return currentConfig;
}
