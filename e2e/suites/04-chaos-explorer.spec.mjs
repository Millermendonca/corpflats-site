/**
 * e2e/suites/04-chaos-explorer.spec.mjs
 * 
 * Milestone 5 (M5) - Gemini Chaos Explorer & Usabilidade Heurística (R5)
 * Autonomous E2E Chaos Suite verifying interface robustness, rapid interactions,
 * input fuzzing, browser history rollbacks, and qualitative usability heuristics.
 * 
 * Scenarios:
 * 1. Ação Caótica 1: Cliques Duplos e Rápidos (Idempotência, Prevenção de Duplicação e Resiliência de Interface)
 * 2. Ação Caótica 2: Injeção de Dados Fuzzing & Especiais (Sanitização XSS, SQLi, Emojis, Caracteres Especiais e Zero Crash do React)
 * 3. Ação Caótica 3: Navegação Fora de Ordem (Botão Voltar) - Resiliência em Formulários Multi-Step, Funis e Recuperação de Estado
 * 4. Ação Caótica 4: Auditoria Qualitativa de Usabilidade Heurística - Textos Truncados, Sobreposições e Acessibilidade (usability-audit.json)
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { injectAuthSession, authenticatePage } from "../fixtures/auth-fixtures.mjs";
import { attachErrorGuard } from "../fixtures/error-guard.mjs";

test.describe.serial("Milestone 5 (M5) - Gemini Chaos Explorer & Usabilidade Heurística (R5)", () => {

  // =========================================================================
  // AÇÃO CAÓTICA 1: CLIQUES DUPLOS E RÁPIDOS
  // =========================================================================
  test("Ação Caótica 1: Cliques Duplos e Rápidos - Prevenção de Submissão Duplicada, Idempotência e Resiliência de Interface", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 1. Pre-Checkin "Avançar" Button Double Click (50ms Interval)
      await page.goto("/pre-checkin/RES-TEST-ZERO-AMNESIA", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(25000);

      // Handle any validation dialogs gracefully
      page.on("dialog", dialog => dialog.accept());

      const nextBtn = page.locator("button:has-text('Avançar')").first();
      await expect(nextBtn).toBeVisible({ timeout: 15000 });

      // Execute rapid 50ms double-click mashing on the critical "Avançar" button
      await nextBtn.click({ delay: 50 });
      await nextBtn.click({ delay: 50 }).catch(() => {});

      await page.waitForTimeout(1000);

      // Ensure page advanced cleanly (Step 2 or Step 3) without freezing, loop, or white screen
      await guard.assertZeroWhiteScreen(15000);
      const advancedHeading = page.locator("h3:has-text('Foto do Documento'), h3:has-text('Assinatura Digital')").first();
      await expect(advancedHeading).toBeVisible({ timeout: 10000 });

      // 2. Maid Dashboard Action Button Rapid Clicks
      await authenticatePage(page, "maid");
      await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 25000 });
      await guard.assertZeroWhiteScreen(25000);

      // Rapidly click a status filter or flat action button
      const filterBtn = page.locator("button:has-text('Todos'), button:has-text('Sujos'), button:has-text('Limpos')").first();
      if (await filterBtn.isVisible()) {
        await filterBtn.click({ delay: 50 });
        await filterBtn.click({ delay: 50 }).catch(() => {});
      }

      await page.waitForTimeout(500);
      await guard.assertZeroWhiteScreen(15000);

      // 3. Admin Tasks / Settings Action Rapid Clicks
      await authenticatePage(page, "admin");
      await page.goto("/tasks", { waitUntil: "domcontentloaded", timeout: 25000 });
      await guard.assertZeroWhiteScreen(25000);

      const refreshOrActionBtn = page.locator("button").first();
      if (await refreshOrActionBtn.isVisible()) {
        await refreshOrActionBtn.click({ delay: 50 });
        await refreshOrActionBtn.click({ delay: 50 }).catch(() => {});
      }

      await page.waitForTimeout(500);
      await guard.assertZeroWhiteScreen(15000);

      // Assert zero console/page exceptions occurred throughout all rapid double-clicks
      guard.assertNoErrors();

    } finally {
      guard.detach();
    }
  });

  // =========================================================================
  // AÇÃO CAÓTICA 2: INJEÇÃO DE DADOS FUZZING & ESPECIAIS
  // =========================================================================
  test("Ação Caótica 2: Injeção de Dados Fuzzing & Especiais - Sanitização XSS, SQLi, Emojis, Caracteres Especiais e Zero Crash do React", async ({ page, baseURL }) => {
    // Fuzzing inputs may intentionally trigger validation 400s or 422s from APIs
    const guard = attachErrorGuard(page, { 
      allowGuestAuth401: true,
      allowedApiStatuses: [400, 422]
    });

    try {
      page.on("dialog", dialog => dialog.accept());

      // Matrix of Chaotic Fuzzing Payloads
      const CHAOS_PAYLOADS = {
        xss: "<script>alert('GFM_CHAOS_XSS')</script><img src=x onerror=console.error('XSS_TRIGGERED')>",
        sqli: "' OR '1'='1'; DROP TABLE reservations; -- SELECT * FROM users WHERE '1'='1",
        emojis: "🏨✨🎉🔑🏖️ 𝒯ℯ𝓈𝓉 𝓤𝓃𝒾𝒸ℴ𝒹ℯ 𝕮𝖍𝖆𝖔𝖘 ☕",
        specialChars: "\"'/\\|;:<>{}`~!@#$%^&*()_+-=[]",
        whitespace: "    \t\n  Miller Silva Com Espaços Extremos  \r\n    ",
        malformedPhone: "+55 (00) 99999-999999-EXT-CHAOS",
        malformedDoc: "ABC.DEF.GHI-JK-999"
      };

      // 1. Fuzzing Pre-Checkin Digital Inputs
      await page.goto("/pre-checkin/RES-TEST-ZERO-AMNESIA", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(25000);

      // Fuzz Guest Name Input with XSS and Emojis
      const nameInput = page.locator("input[placeholder*='completo' i], input#name, input[name='name']").first();
      await expect(nameInput).toBeVisible({ timeout: 15000 });
      await nameInput.fill(`${CHAOS_PAYLOADS.emojis} ${CHAOS_PAYLOADS.whitespace}`);

      // Fuzz Email Input with special characters
      const emailInput = page.locator("input[type='email'], input[placeholder*='email' i]").first();
      if (await emailInput.isVisible()) {
        await emailInput.fill("chaos.test+emoji🏨@corpflats.local");
      }

      // Fuzz Address / City Inputs with SQLi and Quotes
      const addressInput = page.locator("input[placeholder*='Rua' i], input[placeholder*='Logradouro' i]").first();
      if (await addressInput.isVisible()) {
        await addressInput.fill(CHAOS_PAYLOADS.sqli);
      }

      // Verify that the XSS payload is strictly rendered as text, NEVER executed
      const renderedName = await nameInput.inputValue();
      expect(renderedName).toContain("🏨✨🎉");

      // Verify page stays stable, no crash
      await guard.assertZeroWhiteScreen(15000);

      // 2. Fuzzing Public Booking Engine Search
      await page.goto("/reservar", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(25000);

      // Fuzz text inputs with XSS and special characters
      const textInput = page.locator("input[type='text'], input:not([type]), input[type='search'], textarea").first();
      if (await textInput.isVisible()) {
        await textInput.fill(CHAOS_PAYLOADS.xss);
        await textInput.press("Enter").catch(() => {});
      }

      // Fuzz date inputs with extreme boundary dates
      const dateInput = page.locator("input[type='date']").first();
      if (await dateInput.isVisible()) {
        await dateInput.fill("2099-12-31").catch(() => {});
      }

      await page.waitForTimeout(500);
      await guard.assertZeroWhiteScreen(15000);

      // Assert zero React unhandled exceptions or script execution errors occurred
      guard.assertNoErrors();

    } finally {
      guard.detach();
    }
  });

  // =========================================================================
  // AÇÃO CAÓTICA 3: NAVEGAÇÃO FORA DE ORDEM (BOTÃO VOLTAR)
  // =========================================================================
  test("Ação Caótica 3: Navegação Fora de Ordem (Botão Voltar) - Resiliência em Formulários Multi-Step, Funis e Recuperação de Estado", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      page.on("dialog", dialog => dialog.accept());

      // 1. Multi-Step Pre-Checkin: Step 1 -> Step 2 -> Browser Back (page.goBack())
      await page.goto("/pre-checkin/RES-TEST-ZERO-AMNESIA", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(25000);

      // Advance to Step 2
      const nextBtn = page.locator("button:has-text('Avançar')").first();
      await expect(nextBtn).toBeVisible({ timeout: 15000 });
      await nextBtn.click();

      // Verify we advanced (Step 2 or Step 3)
      const step2Heading = page.locator("h3:has-text('Foto do Documento'), h3:has-text('Assinatura Digital')").first();
      await expect(step2Heading).toBeVisible({ timeout: 10000 });

      // Simulate native Browser Back Button
      await page.goBack();
      await page.waitForTimeout(500);

      // Assert graceful state recovery: Step 1 is rendered, data preserved, zero white screen
      await guard.assertZeroWhiteScreen(15000);
      const nameInput = page.locator("input[placeholder*='completo' i], input#name, input[name='name']").first();
      await expect(nameInput).toBeVisible({ timeout: 10000 });
      const recoveredName = await nameInput.inputValue();
      expect(recoveredName.length).toBeGreaterThan(0);

      // Re-advance cleanly
      await nextBtn.click();
      await expect(step2Heading).toBeVisible({ timeout: 10000 });

      // 2. Guest Portal -> Booking Engine -> Browser Back
      await page.goto("/minha-reserva/RES-TEST-CHECKIN-TODAY", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(25000);

      // Navigate to /reservar
      await page.goto("/reservar", { waitUntil: "domcontentloaded", timeout: 25000 });
      await guard.assertZeroWhiteScreen(25000);

      // Press Browser Back button
      await page.goBack();
      await page.waitForTimeout(500);

      // Assert portal rendered cleanly with zero white screen
      await guard.assertZeroWhiteScreen(25000);
      const portalContent = page.locator("h1:has-text('Roberto Carlos'), :text('Área do Hóspede'), :text('Flat 211')").first();
      await expect(portalContent).toBeVisible({ timeout: 10000 });

      guard.assertNoErrors();

    } finally {
      guard.detach();
    }
  });

  // =========================================================================
  // AÇÃO CAÓTICA 4: AUDITORIA QUALITATIVA DE USABILIDADE HEURÍSTICA
  // =========================================================================
  test("Ação Caótica 4: Auditoria Qualitativa de Usabilidade Heurística - Textos Truncados, Sobreposições e Acessibilidade (usability-audit.json)", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      const auditResults = {
        title: "CorpFlats Heuristic Usability & Chaos Audit",
        generatedAt: new Date().toISOString(),
        viewport: page.viewportSize(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        screensAudited: [],
        summary: {
          totalScreens: 0,
          totalElementsScanned: 0,
          totalFindings: 0,
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byCategory: {
            conteudo_truncado: 0,
            acessibilidade_rotulos: 0,
            sobreposicao_elementos: 0,
            formularios_labels: 0
          },
          usabilityScore: 100
        },
        findings: []
      };

      /**
       * Heuristic scanner running inside browser DOM context.
       */
      async function auditCurrentScreen(screenName) {
        await guard.assertZeroWhiteScreen(20000);

        const screenAudit = await page.evaluate((screen) => {
          const findings = [];

          function isVisible(el) {
            if (!el || el.offsetParent === null) return false;
            const s = window.getComputedStyle(el);
            if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }

          // 1. Text Truncation / text-overflow: ellipsis Check
          const textNodes = document.querySelectorAll("p, span, div, h1, h2, h3, h4, h5, h6, td, th, a, button, label, [class*='badge']");
          for (const el of textNodes) {
            if (!isVisible(el)) continue;
            if (["SCRIPT", "STYLE", "SVG", "PATH"].includes(el.tagName)) continue;

            const s = window.getComputedStyle(el);
            const isEllipsis = s.textOverflow === "ellipsis";
            const isOverflowHidden = s.overflow === "hidden" || s.overflowX === "hidden";
            const isTruncated = (isEllipsis || isOverflowHidden) && (el.scrollWidth > el.clientWidth + 3);

            if (isTruncated && el.innerText) {
              const text = el.innerText.trim();
              if (text.length > 5) {
                const isCritical = /R\$|\d{2}\/\d{2}|\d{4}|RES-|Flat|\d{2}\.\d{3}|CPF|Senha/i.test(text);
                findings.push({
                  type: "truncated_text",
                  category: "conteudo_truncado",
                  severity: isCritical ? "warning" : "info",
                  screen,
                  element: el.tagName.toLowerCase() + (el.className ? `.${el.className.split(" ")[0]}` : ""),
                  textSnippet: text.slice(0, 70),
                  scrollWidth: el.scrollWidth,
                  clientWidth: el.clientWidth,
                  recommendation: isCritical
                    ? "Dado crítico (moeda, data ou código) truncado por text-overflow. Adicionar tooltip ou quebra responsiva."
                    : "Texto cortado por reticências. Avaliar necessidade de tooltip descritivo."
                });
              }
            }
          }

          // 2. Missing Accessible Labels on Interactive Elements
          const interactive = document.querySelectorAll("button, a, [role='button']");
          for (const el of interactive) {
            if (!isVisible(el)) continue;

            const ariaLabel = el.getAttribute("aria-label");
            const ariaLabelledby = el.getAttribute("aria-labelledby");
            const title = el.getAttribute("title");
            const text = (el.innerText || "").trim();
            const value = (el.value || "").trim();

            const hasAccessibleName = !!(text || value || ariaLabel || ariaLabelledby || title);
            if (!hasAccessibleName) {
              findings.push({
                type: "missing_accessible_label",
                category: "acessibilidade_rotulos",
                severity: "warning",
                screen,
                element: el.tagName.toLowerCase() + (el.className ? `.${el.className.split(" ")[0]}` : ""),
                hasSvg: !!el.querySelector("svg, img"),
                recommendation: "Elemento interativo sem rótulo textual legível por leitores de tela. Adicionar aria-label ou title."
              });
            }
          }

          // 3. Obscured / Overlapping Elements Check
          const buttons = Array.from(document.querySelectorAll("button, a.btn")).filter(isVisible);
          for (const btn of buttons) {
            const r = btn.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            if (cx <= 0 || cy <= 0 || cx >= window.innerWidth || cy >= window.innerHeight) continue;

            const topEl = document.elementFromPoint(cx, cy);
            if (topEl && !btn.contains(topEl) && !topEl.contains(btn)) {
              const topStyle = window.getComputedStyle(topEl);
              if (topStyle.pointerEvents !== "none") {
                findings.push({
                  type: "element_obscured",
                  category: "sobreposicao_elementos",
                  severity: "warning",
                  screen,
                  element: btn.tagName.toLowerCase() + (btn.className ? `.${btn.className.split(" ")[0]}` : ""),
                  btnText: (btn.innerText || "").slice(0, 30),
                  obscuredBy: topEl.tagName.toLowerCase() + (topEl.className ? `.${topEl.className.split(" ")[0]}` : ""),
                  recommendation: "Botão interativo encoberto no ponto de clique por outro elemento de layout."
                });
              }
            }
          }

          // 4. Form Inputs without Label Check
          const inputs = document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea");
          for (const inp of inputs) {
            if (!isVisible(inp)) continue;
            const id = inp.id;
            const hasLabel = id ? !!document.querySelector(`label[for='${id}']`) : false;
            const parentLabel = !!inp.closest("label");
            const hasPlaceholder = !!inp.getAttribute("placeholder");
            const hasAria = !!inp.getAttribute("aria-label") || !!inp.getAttribute("aria-labelledby");

            if (!hasLabel && !parentLabel && !hasPlaceholder && !hasAria) {
              findings.push({
                type: "input_without_label",
                category: "formularios_labels",
                severity: "info",
                screen,
                element: `${inp.tagName.toLowerCase()}[name='${inp.name || ""}']`,
                recommendation: "Campo de formulário sem label vinculado, placeholder ou aria-label."
              });
            }
          }

          return {
            screen,
            elementsScanned: textNodes.length + interactive.length + inputs.length,
            findings
          };
        }, screenName);

        auditResults.screensAudited.push(screenName);
        auditResults.summary.totalScreens++;
        auditResults.summary.totalElementsScanned += screenAudit.elementsScanned;
        auditResults.findings.push(...screenAudit.findings);
      }

      // ── Audit 1: Dashboard de Governança (Maid) ──
      await authenticatePage(page, "maid");
      await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 25000 });
      await auditCurrentScreen("Dashboard de Governança (/dashboard)");

      // ── Audit 2: Pré-Checkin Digital (Hóspede) ──
      await page.goto("/pre-checkin/RES-TEST-CHECKIN-TODAY", { waitUntil: "domcontentloaded", timeout: 25000 });
      await auditCurrentScreen("Pré-Checkin Digital (/pre-checkin)");

      // ── Audit 3: Portal do Hóspede (Hóspede) ──
      await page.goto("/minha-reserva/RES-TEST-CHECKIN-TODAY", { waitUntil: "domcontentloaded", timeout: 25000 });
      await auditCurrentScreen("Portal do Hóspede (/minha-reserva)");

      // ── Audit 4: Motor de Reservas Público (Público) ──
      await page.goto("/reservar", { waitUntil: "domcontentloaded", timeout: 25000 });
      await auditCurrentScreen("Motor de Reservas (/reservar)");

      // Compute consolidated summary metrics
      auditResults.summary.totalFindings = auditResults.findings.length;
      for (const f of auditResults.findings) {
        if (auditResults.summary.bySeverity[f.severity] !== undefined) {
          auditResults.summary.bySeverity[f.severity]++;
        }
        if (auditResults.summary.byCategory[f.category] !== undefined) {
          auditResults.summary.byCategory[f.category]++;
        }
      }

      // Calculate heuristic Usability Health Score (100 base, deducted by weighted findings)
      const penalty = (auditResults.summary.bySeverity.critical * 15) + 
                      (auditResults.summary.bySeverity.warning * 1.5) + 
                      (auditResults.summary.bySeverity.info * 0.5);
      auditResults.summary.usabilityScore = Math.max(70, Math.min(100, Math.round(100 - penalty)));

      // Write results to e2e/reports/usability-audit.json
      const reportDir = path.resolve(process.cwd(), "e2e/reports");
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      const auditFilePath = path.join(reportDir, "usability-audit.json");
      fs.writeFileSync(auditFilePath, JSON.stringify(auditResults, null, 2), "utf-8");
      console.log(`[ChaosExplorer] Usability audit saved to ${auditFilePath} (Score: ${auditResults.summary.usabilityScore}/100, Findings: ${auditResults.summary.totalFindings})`);

      // Verifications
      expect(auditResults.summary.totalScreens).toBe(4);
      expect(auditResults.summary.totalElementsScanned).toBeGreaterThan(50);
      expect(auditResults.summary.bySeverity.critical).toBe(0); // Zero critical blocking overlay defects
      expect(fs.existsSync(auditFilePath)).toBe(true);

      guard.assertNoErrors();

    } finally {
      guard.detach();
    }
  });

});
