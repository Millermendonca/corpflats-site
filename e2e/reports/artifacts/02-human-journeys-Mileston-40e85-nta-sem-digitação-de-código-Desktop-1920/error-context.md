# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-human-journeys.spec.mjs >> Milestone 3 (M3) - Jornadas Humanas Anti-Frustração (R3) >> Jornada 2: Vínculo Multicanal Automático - Reservas vinculadas no /minha-conta sem digitação de código
- Location: e2e\suites\02-human-journeys.spec.mjs:92:3

# Error details

```
Error: [Zero White Screen Violation] #root is completely empty or has 0 children after 15000ms. HTML: ""
```

# Test source

```ts
  73  |         location: msg.location(),
  74  |         timestamp: new Date().toISOString()
  75  |       });
  76  |     }
  77  |   };
  78  | 
  79  |   // 3. Monitor network responses on internal /api/ calls
  80  |   const responseHandler = (response) => {
  81  |     const url = response.url();
  82  |     const status = response.status();
  83  | 
  84  |     if (url.includes("/api/") && status >= 400) {
  85  |       // Normal guest check on unauthenticated public pages (/api/auth/me, /api/v2/auth/me, /api/guest-auth/me)
  86  |       if (allowGuestAuth401 && status === 401 && (url.includes("/guest-auth/me") || url.includes("/auth/me"))) {
  87  |         return;
  88  |       }
  89  |       // Allowed expected errors if explicitly configured
  90  |       if (options.allowedApiStatuses?.includes(status)) {
  91  |         return;
  92  |       }
  93  | 
  94  |       apiErrors.push({
  95  |         url,
  96  |         status,
  97  |         statusText: response.statusText(),
  98  |         timestamp: new Date().toISOString()
  99  |       });
  100 |     }
  101 |   };
  102 | 
  103 |   page.on("pageerror", pageErrorHandler);
  104 |   page.on("console", consoleHandler);
  105 |   page.on("response", responseHandler);
  106 | 
  107 |   return {
  108 |     getConsoleErrors: () => [...consoleErrors],
  109 |     getPageErrors: () => [...pageErrors],
  110 |     getApiErrors: () => [...apiErrors],
  111 |     clearErrors: () => {
  112 |       consoleErrors.length = 0;
  113 |       pageErrors.length = 0;
  114 |       apiErrors.length = 0;
  115 |     },
  116 |     detach: () => {
  117 |       page.off("pageerror", pageErrorHandler);
  118 |       page.off("console", consoleHandler);
  119 |       page.off("response", responseHandler);
  120 |     },
  121 | 
  122 |     /**
  123 |      * Asserts that no critical errors occurred during page render/interaction.
  124 |      */
  125 |     assertNoErrors: () => {
  126 |       const issues = [];
  127 |       if (pageErrors.length > 0) {
  128 |         issues.push(`Page Errors (${pageErrors.length}):\n` + pageErrors.map(e => `  - ${e.message}`).join("\n"));
  129 |       }
  130 |       if (consoleErrors.length > 0) {
  131 |         issues.push(`Console Errors (${consoleErrors.length}):\n` + consoleErrors.map(e => `  - ${e.text}`).join("\n"));
  132 |       }
  133 |       if (apiErrors.length > 0) {
  134 |         issues.push(`Unexpected API Errors (${apiErrors.length}):\n` + apiErrors.map(e => `  - [${e.status}] ${e.url}`).join("\n"));
  135 |       }
  136 | 
  137 |       if (issues.length > 0) {
  138 |         throw new Error(`[ErrorGuard Assertion Failure]\n${issues.join("\n\n")}`);
  139 |       }
  140 |     },
  141 | 
  142 |     /**
  143 |      * Verifies that #root has rendered non-empty, visible DOM elements (Zero White Screen).
  144 |      * @param {number} [timeoutMs=15000]
  145 |      */
  146 |     assertZeroWhiteScreen: async (timeoutMs = 15000) => {
  147 |       // Wait for #root to exist
  148 |       const root = page.locator("#root");
  149 |       await root.waitFor({ state: "attached", timeout: timeoutMs });
  150 | 
  151 |       // Wait for at least one child element inside #root to be attached and visible
  152 |       const childCount = await page.evaluate(async (maxWait) => {
  153 |         const start = performance.now();
  154 |         while (performance.now() - start < maxWait) {
  155 |           const rootEl = document.getElementById("root");
  156 |           if (rootEl && rootEl.children.length > 0) {
  157 |             // Check if there is rendered content (not a blank canvas or empty div)
  158 |             const text = (rootEl.innerText || "").trim();
  159 |             const hasSvgOrCanvas = !!rootEl.querySelector("svg, canvas, img, input, button, table");
  160 |             if (text.length > 0 || hasSvgOrCanvas || rootEl.offsetHeight > 50) {
  161 |               return rootEl.children.length;
  162 |             }
  163 |           }
  164 |           await new Promise(r => setTimeout(r, 50));
  165 |         }
  166 |         const finalEl = document.getElementById("root");
  167 |         return finalEl ? finalEl.children.length : 0;
  168 |       }, timeoutMs);
  169 | 
  170 |       if (childCount === 0) {
  171 |         // Capture innerHTML for forensics
  172 |         const rootHtml = await page.evaluate(() => document.getElementById("root")?.innerHTML || "");
> 173 |         throw new Error(`[Zero White Screen Violation] #root is completely empty or has 0 children after ${timeoutMs}ms. HTML: "${rootHtml.slice(0, 200)}"`);
      |               ^ Error: [Zero White Screen Violation] #root is completely empty or has 0 children after 15000ms. HTML: ""
  174 |       }
  175 |     }
  176 |   };
  177 | }
  178 | 
```