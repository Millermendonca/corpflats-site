/**
 * e2e/playwright.config.mjs
 * 
 * Playwright Configuration for CorpFlats Guest-Flow-Manager E2E Testing.
 * Configured for host Google Chrome across Desktop 1920px, Tablet 768px, and Mobile 375px.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./suites",
  outputDir: "./reports/artifacts",
  timeout: 60000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  retries: 0,
  workers: 1, // Deterministic sequential execution against isolated test database
  reporter: [
    ["list"],
    ["html", { outputFolder: "./reports/html-report", open: "never" }],
    ["json", { outputFile: "./reports/test-results.json" }],
    ["./reporters/html-reporter.mjs", { outputFile: "e2e/reports/index.html" }]
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:5055",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000
  },
  webServer: {
    command: "node e2e/sandbox/cli-server.mjs",
    url: "http://127.0.0.1:5055/api/health",
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    {
      name: "Desktop-1920",
      use: {
        viewport: { width: 1920, height: 1080 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CorpFlatsDesktop/1.0"
      }
    },
    {
      name: "Tablet-768",
      use: {
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 CorpFlatsTablet/1.0"
      }
    },
    {
      name: "Mobile-375",
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 CorpFlatsMobile/1.0"
      }
    }
  ]
});
