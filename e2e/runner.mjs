/**
 * e2e/runner.mjs
 * 
 * Master Orchestrator Script for CorpFlats E2E Synthetic Testing.
 * Boots isolated sandbox on port 5055, runs Playwright test suites,
 * and ensures 100% clean teardown with zero leaks to production.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { startSandbox, stopSandbox } from "./sandbox/test-server.mjs";

async function main() {
  console.log("================================================================================");
  console.log(" CORPFLATS E2E SYNTHETIC TEST RUNNER");
  console.log("================================================================================");

  let sandbox = null;
  let testExitCode = 1;

  try {
    // 1. Boot isolated sandbox
    sandbox = await startSandbox({
      port: 5055,
      zapiPort: 5056,
      smtpPort: 5025,
      silent: true
    });
    console.log(`[runner] Sandbox running at ${sandbox.baseUrl}. Backend PID: ${sandbox.pid}`);

    // 2. Determine args to pass to playwright
    const userArgs = process.argv.slice(2);
    const playwrightArgs = [
      "exec",
      "playwright",
      "test",
      "--config",
      "e2e/playwright.config.mjs",
      ...userArgs
    ];

    console.log(`[runner] Executing Playwright: pnpm.cmd ${playwrightArgs.join(" ")}`);

    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    testExitCode = await new Promise((resolve) => {
      const child = spawn(pnpmCmd, playwrightArgs, {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          BASE_URL: sandbox.baseUrl
        }
      });

      child.on("exit", (code) => {
        resolve(code ?? 1);
      });

      child.on("error", (err) => {
        console.error("[runner] Failed to spawn Playwright runner:", err);
        resolve(1);
      });
    });

    console.log(`[runner] Playwright execution finished with exit code ${testExitCode}.`);

  } catch (err) {
    console.error("[runner] Fatal error during test execution:", err);
    testExitCode = 1;
  } finally {
    // 3. Graceful teardown
    console.log("[runner] Tearing down sandbox environment...");
    try {
      await stopSandbox();
    } catch (cleanupErr) {
      console.warn("[runner] Teardown warning:", cleanupErr.message);
    }
  }

  process.exit(testExitCode);
}

main().catch((err) => {
  console.error("[runner] Unhandled error:", err);
  process.exit(1);
});
