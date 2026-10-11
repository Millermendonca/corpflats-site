/**
 * e2e/sandbox/cli-server.mjs
 * 
 * Standalone CLI entrypoint for running isolated sandbox.
 * Used by Playwright webServer and local development.
 */

import { startSandbox, stopSandbox } from "./test-server.mjs";

console.log("[cli-server] Starting CorpFlats isolated sandbox on port 5055...");
await startSandbox();

console.log("[cli-server] Sandbox is running and ready. Waiting for shutdown signal...");

const cleanup = async () => {
  console.log("[cli-server] Received shutdown signal, cleaning up...");
  await stopSandbox();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
