/**
 * tests/wbp-integration/harness/index.mjs
 *
 * Unified Entrypoint for WebBookingPro Integration Test Fixtures.
 */

export { WbpSimulatorHarness } from "./wbp-simulator-harness.mjs";
export {
  startIsolatedWbpEnvironment,
  getAvailablePort,
  killProcessTree
} from "./test-env.mjs";
