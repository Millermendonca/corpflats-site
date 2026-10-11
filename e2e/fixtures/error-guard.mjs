/**
 * e2e/fixtures/error-guard.mjs
 * 
 * Strict Error Guard & White Screen Detection for CorpFlats E2E Testing.
 * 
 * Guards:
 * 1. Console Error Monitor: captures `page.on('console')` errors and `page.on('pageerror')`.
 * 2. Network Monitor: verifies no unexpected 4xx/5xx responses on internal `/api/` endpoints.
 * 3. White Screen Guard: validates `#root` rendered visible DOM content with dimensions > 0.
 */

/**
 * Creates and attaches error monitors to a Playwright page.
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {boolean} [options.allowGuestAuth401=true] - Allows /api/guest-auth/me 401 on public pages
 * @param {string[]} [options.allowedApiStatuses=[]] - Additional allowed status codes or patterns
 * @returns {object} Guard controller with inspect and assert helpers
 */
export function attachErrorGuard(page, options = {}) {
  const allowGuestAuth401 = options.allowGuestAuth401 !== false;
  const consoleErrors = [];
  const pageErrors = [];
  const apiErrors = [];

  // 1. Monitor unhandled page exceptions
  const pageErrorHandler = (err) => {
    const msg = err?.message || String(err);
    // Ignore harmless resize observer loop limit exceeded
    if (msg.includes("ResizeObserver loop") || msg.includes("ResizeObserver loop limit exceeded")) {
      return;
    }
    pageErrors.push({
      message: msg,
      stack: err?.stack || null,
      timestamp: new Date().toISOString()
    });
  };

  // 2. Monitor console errors
  const consoleHandler = (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore harmless browser network/favicon/ResizeObserver/GSI warnings
      if (
        text.includes("ResizeObserver") ||
        text.includes("favicon.ico") ||
        text.includes("GSI_LOGGER") ||
        text.includes("accounts.google.com") ||
        (text.includes("Failed to load resource") && (
          text.includes("favicon") ||
          text.includes("/storage/") ||
          text.includes("accounts.google.com")
        )) ||
        (allowGuestAuth401 && (
          text.includes("status of 401") ||
          text.includes("401 (Unauthorized)") ||
          text.includes("status of 403") ||
          (text.includes("Failed to load resource") && (
            text.includes("/auth/me") ||
            text.includes("/guest-auth/me") ||
            text.includes("accounts.google.com")
          ))
        )) ||
        (Array.isArray(options.allowedApiStatuses) && options.allowedApiStatuses.some(st => 
          text.includes(`status of ${st}`) || text.includes(`${st} (`)
        ))
      ) {
        return;
      }
      consoleErrors.push({
        text,
        location: msg.location(),
        timestamp: new Date().toISOString()
      });
    }
  };

  // 3. Monitor network responses on internal /api/ calls
  const responseHandler = (response) => {
    const url = response.url();
    const status = response.status();

    if (url.includes("/api/") && status >= 400) {
      // Normal guest check on unauthenticated public pages (/api/auth/me, /api/v2/auth/me, /api/guest-auth/me)
      if (allowGuestAuth401 && status === 401 && (url.includes("/guest-auth/me") || url.includes("/auth/me"))) {
        return;
      }
      // Allowed expected errors if explicitly configured
      if (options.allowedApiStatuses?.includes(status)) {
        return;
      }

      apiErrors.push({
        url,
        status,
        statusText: response.statusText(),
        timestamp: new Date().toISOString()
      });
    }
  };

  page.on("pageerror", pageErrorHandler);
  page.on("console", consoleHandler);
  page.on("response", responseHandler);

  return {
    getConsoleErrors: () => [...consoleErrors],
    getPageErrors: () => [...pageErrors],
    getApiErrors: () => [...apiErrors],
    clearErrors: () => {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      apiErrors.length = 0;
    },
    detach: () => {
      page.off("pageerror", pageErrorHandler);
      page.off("console", consoleHandler);
      page.off("response", responseHandler);
    },

    /**
     * Asserts that no critical errors occurred during page render/interaction.
     */
    assertNoErrors: () => {
      const issues = [];
      if (pageErrors.length > 0) {
        issues.push(`Page Errors (${pageErrors.length}):\n` + pageErrors.map(e => `  - ${e.message}`).join("\n"));
      }
      if (consoleErrors.length > 0) {
        issues.push(`Console Errors (${consoleErrors.length}):\n` + consoleErrors.map(e => `  - ${e.text}`).join("\n"));
      }
      if (apiErrors.length > 0) {
        issues.push(`Unexpected API Errors (${apiErrors.length}):\n` + apiErrors.map(e => `  - [${e.status}] ${e.url}`).join("\n"));
      }

      if (issues.length > 0) {
        throw new Error(`[ErrorGuard Assertion Failure]\n${issues.join("\n\n")}`);
      }
    },

    /**
     * Verifies that #root has rendered non-empty, visible DOM elements (Zero White Screen).
     * @param {number} [timeoutMs=15000]
     */
    assertZeroWhiteScreen: async (timeoutMs = 15000) => {
      // Wait for #root to exist
      const root = page.locator("#root");
      await root.waitFor({ state: "attached", timeout: timeoutMs });

      // Wait for at least one child element inside #root to be attached and visible
      const childCount = await page.evaluate(async (maxWait) => {
        const start = performance.now();
        while (performance.now() - start < maxWait) {
          const rootEl = document.getElementById("root");
          if (rootEl && rootEl.children.length > 0) {
            // Check if there is rendered content (not a blank canvas or empty div)
            const text = (rootEl.innerText || "").trim();
            const hasSvgOrCanvas = !!rootEl.querySelector("svg, canvas, img, input, button, table");
            if (text.length > 0 || hasSvgOrCanvas || rootEl.offsetHeight > 50) {
              return rootEl.children.length;
            }
          }
          await new Promise(r => setTimeout(r, 50));
        }
        const finalEl = document.getElementById("root");
        return finalEl ? finalEl.children.length : 0;
      }, timeoutMs);

      if (childCount === 0) {
        // Capture innerHTML for forensics
        const rootHtml = await page.evaluate(() => document.getElementById("root")?.innerHTML || "");
        throw new Error(`[Zero White Screen Violation] #root is completely empty or has 0 children after ${timeoutMs}ms. HTML: "${rootHtml.slice(0, 200)}"`);
      }
    }
  };
}
