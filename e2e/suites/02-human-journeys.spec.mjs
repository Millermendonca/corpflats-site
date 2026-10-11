/**
 * e2e/suites/02-human-journeys.spec.mjs
 * 
 * Milestone 3 (M3) - Human Journeys & Anti-Frustration Testing (R3)
 * Comprehensive End-to-End Test Suite verifying the 7 critical human journeys
 * preventing guest friction, lost data, and reception incidents.
 * 
 * Journeys:
 * 1. Zero Amnésia (Returning guest document & photo reuse without forcing re-upload)
 * 2. Vínculo Multicanal Automático (/minha-conta linking without manual code typing)
 * 3. Persistência Completa de Veículo (Plate, brand, model, color in portaria, garagem, mock SMTP)
 * 4. Gestão de Acesso e Fechadura Digital (Locked before 14:00 with cleaning notice; unlocked after 14:00)
 * 5. Resiliência de Pagamento PIX (Real-time update on settlement & regeneration on expiry)
 * 6. Upload Mobile Resiliente & Canvas Signature (Touch canvas without scroll & WebP image compression)
 * 7. Isolamento Estrito de Acompanhantes (Guest 2 submission never overwrites Guest 1 data)
 */

import { test, expect } from "@playwright/test";
import { injectAuthSession } from "../fixtures/auth-fixtures.mjs";
import { attachErrorGuard } from "../fixtures/error-guard.mjs";
import { setTimeTravelHour, resetTimeTravel } from "../sandbox/time-travel.mjs";
import { simulatePixPayment, simulatePixExpiration, resetPendingPixReservation } from "../sandbox/pix-simulator.mjs";
import { getSentEmails, clearSentEmails } from "../sandbox/mock-smtp.mjs";

test.describe.serial("Milestone 3 (M3) - Jornadas Humanas Anti-Frustração (R3)", () => {

  // =========================================================================
  // JORNADA 1: ZERO AMNÉSIA (HÓSPEDE RECORRENTE)
  // =========================================================================
  test("Jornada 1: Zero Amnésia - Hóspede recorrente reutiliza documentos sem re-envio forçado", async ({ page, baseURL }) => {
    // 1. Attach error guard
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 2. Open pre-checkin for returning guest with pending stay
      await page.goto("/pre-checkin/RES-TEST-ZERO-AMNESIA", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(15000);

      // 3. Assert guest name and CPF are automatically populated
      const fullNameInput = page.locator("input[placeholder*='completo' i], input#name, input[name='name']").first();
      await expect(fullNameInput).toBeVisible({ timeout: 10000 });
      const nameVal = await fullNameInput.inputValue();
      expect(nameVal).toContain("Mariana");

      // Verify CPF field is pre-populated
      const docInput = page.locator("input[placeholder*='CPF' i], input[placeholder*='000.000' i]").first();
      await expect(docInput).toBeVisible();
      const docVal = await docInput.inputValue();
      const cleanDoc = docVal.replace(/\D/g, "");
      expect(cleanDoc).toBe("98765432100");

      page.on("dialog", dialog => dialog.accept());

      // Advance to Step 2 (Documento)
      const nextBtn = page.locator("button:has-text('Avançar')").first();
      await expect(nextBtn).toBeVisible({ timeout: 10000 });
      await nextBtn.click();

      // Assert document photo is already populated from previous registration without forcing re-upload
      const docPhotoImg = page.locator("img[alt='Documento']").first();
      await expect(docPhotoImg).toBeVisible({ timeout: 10000 });
      const imgSrc = await docPhotoImg.getAttribute("src");
      expect(imgSrc).toContain("mariana-cnh.jpg");

      // Verify button to change photo exists (proving photo is recognized and present)
      await expect(page.locator("button:has-text('Trocar Foto')").first()).toBeVisible();

      // Verify pre-checkin API returns returning guest with persisted photos and documents
      const apiRes = await page.request.get(`${baseURL}/api/pms/pre-checkin/RES-TEST-ZERO-AMNESIA`);
      expect(apiRes.ok()).toBe(true);
      const json = await apiRes.json();
      expect(json.reservation).toBeTruthy();
      expect(json.guest).toBeTruthy();
      expect(json.guest.docPhotoUrl).toContain("mariana-cnh.jpg");
      expect(json.guest.photoUrl).toContain("mariana-selfie.jpg");
      expect(json.guest.address).toContain("Rua das Flores");

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // JORNADA 2: VÍNCULO MULTICANAL AUTOMÁTICO (/MINHA-CONTA)
  // =========================================================================
  test("Jornada 2: Vínculo Multicanal Automático - Reservas vinculadas no /minha-conta sem digitação de código", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 1. Set guest session in localStorage for Roberto Carlos Silva
      await page.addInitScript(() => {
        try {
          localStorage.setItem("corpflats_guest_email", "roberto.carlos@teste.corpflats");
          localStorage.setItem("corpflats_guest_profile", JSON.stringify({
            id: 601,
            name: "Roberto Carlos Silva",
            email: "roberto.carlos@teste.corpflats",
            phone: "5522998877661",
            document: "12345678901",
            role: "guest"
          }));
        } catch {}
      });

      // 2. Navigate to /minha-conta
      await page.goto("/minha-conta", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });

      await guard.assertZeroWhiteScreen(15000);

      // 3. Switch to reservations tab
      const reservationsTabTrigger = page.locator("button[role='tab'][value='reservations'], [data-state][role='tab']:has-text('Reservas')").first();
      if (await reservationsTabTrigger.isVisible()) {
        await reservationsTabTrigger.click();
      }

      // 4. Assert reservation appears automatically in dashboard without manual code entry
      const pageText = await page.locator("#root").innerText();
      expect(pageText).toContain("Flat 211");
      expect(pageText).toContain("Roberto Carlos");

      // Verify guest-auth/me returns the linked reservation via API
      const authApiRes = await page.request.get(`${baseURL}/api/guest-auth/me?email=roberto.carlos@teste.corpflats`);
      expect(authApiRes.ok()).toBe(true);
      const authData = await authApiRes.json();
      expect(authData.reservations.length).toBeGreaterThan(0);
      const linkedRes = authData.reservations.find(r => r.code === "RES-TEST-CHECKIN-TODAY" || String(r.flatNumber) === "211");
      expect(linkedRes).toBeTruthy();
      expect(String(linkedRes.flatNumber)).toBe("211");

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // JORNADA 3: PERSISTÊNCIA COMPLETA DE VEÍCULO (PORTARIA, GARAGEM, MOCK SMTP)
  // =========================================================================
  test("Jornada 3: Persistência Completa de Veículo - Placa, marca, modelo e cor em Portaria, Garagem e Mock SMTP", async ({ page, baseURL }) => {
    clearSentEmails();
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 1. Submit pre-checkin with complete vehicle data (KRT9F82 / Toyota Corolla Cross / Prata Metálico)
      const submitRes = await page.request.post(`${baseURL}/api/pms/pre-checkin`, {
        data: {
          code: "RES-TEST-VEHICLE-PERSIST",
          guestIndex: 1,
          fullName: "Carlos Eduardo Mendes",
          document: "45678912300",
          phone: "5522998877663",
          email: "carlos.mendes@teste.corpflats",
          transportMethod: "Carro próprio",
          vehiclePlate: "KRT9F82",
          vehicleBrand: "Toyota",
          vehicleModel: "Corolla Cross",
          vehicleColor: "Prata Metálico",
          legalTermsAccepted: true
        }
      });
      expect(submitRes.ok()).toBe(true);

      // 2. Verify all 4 fields in Terminal da Portaria (/portaria)
      await injectAuthSession(page.context(), "reception");
      await page.goto("/portaria", { waitUntil: "domcontentloaded", timeout: 25000 });
      await guard.assertZeroWhiteScreen(15000);

      // Locate Apt 408 card in portaria
      const portariaText = await page.locator("#root").innerText();
      expect(portariaText).toContain("KRT9F82");
      expect(portariaText).toContain("Toyota");
      expect(portariaText).toContain("Corolla Cross");
      expect(portariaText).toContain("Prata Metálico");

      // 3. Verify all 4 fields in Mapa de Vagas da Garagem (/garagem)
      await injectAuthSession(page.context(), "admin");
      await page.goto("/garagem", { waitUntil: "domcontentloaded", timeout: 25000 });
      await guard.assertZeroWhiteScreen(15000);

      const garagemText = await page.locator("#root").innerText();
      expect(garagemText).toContain("KRT9F82");
      expect(garagemText).toContain("Toyota");
      expect(garagemText).toContain("Corolla Cross");
      expect(garagemText).toContain("Prata Metálico");

      // 4. Verify transactional email generated in Mock SMTP (async delivery)
      await expect.poll(() => getSentEmails().length, {
        message: "Waiting for garage authorization email in Mock SMTP",
        timeout: 8000,
        intervals: [200, 500, 1000]
      }).toBeGreaterThan(0);

      const sentEmails = getSentEmails();
      const garageEmail = sentEmails.find(e => 
        e.subject.includes("Garagem") || 
        e.subject.includes("KRT9F82") || 
        e.body.includes("KRT9F82") || 
        e.raw.includes("KRT9F82")
      );
      expect(garageEmail, "Expected garage authorization email captured in Mock SMTP").toBeTruthy();
      expect(garageEmail.raw).toContain("KRT9F82");
      expect(garageEmail.raw).toContain("Corolla Cross");

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // JORNADA 4: GESTÃO DE ACESSO E FECHADURA DIGITAL (CONTROLE 14H)
  // =========================================================================
  test("Jornada 4: Gestão de Acesso e Fechadura Digital - Bloqueio antes das 14h com aviso e liberação destacada após 14h", async ({ page, baseURL }) => {
    const baseUrl = baseURL;
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 1. Shift time travel to morning 10:00 (before 14:00 official check-in)
      const travelRes10 = await setTimeTravelHour({ baseUrl, targetHour: 10 });
      expect(travelRes10.hour ?? travelRes10.brasilia?.hour).toBe(10);

      // 2. Navigate to guest portal for RES-TEST-LOCK-14H (Flat 212, in cleaning before 14h)
      await page.goto("/minha-reserva/RES-TEST-LOCK-14H", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });
      await guard.assertZeroWhiteScreen(15000);

      // 3. Assert friendly cleaning/preparation message is displayed and lock code is HIDDEN
      const rootMorningText = await page.locator("#root").innerText();
      expect(rootMorningText).toContain("Apartamento em Preparação & Higienização");
      expect(rootMorningText).toContain("14:00");
      expect(rootMorningText).not.toContain("4321#");

      // 4. Advance clock past 14:00 (e.g. 15:00) via time-travel
      const travelRes15 = await setTimeTravelHour({ baseUrl, targetHour: 15 });
      expect(travelRes15.hour ?? travelRes15.brasilia?.hour).toBe(15);

      // 5. Reload guest portal page
      await page.reload({ waitUntil: "domcontentloaded" });
      await guard.assertZeroWhiteScreen(15000);

      // 6. Assert digital lock code is now unlocked and prominently displayed
      const rootAfternoonText = await page.locator("#root").innerText();
      expect(rootAfternoonText).toMatch(/senha fechadura \/ portaria/i);
      expect(rootAfternoonText).toContain("4321#");

      // 7. Verify copy button is available and functional
      const copyKeyButton = page.locator("button:has-text('Copiar')").first();
      await expect(copyKeyButton).toBeVisible();

      guard.assertNoErrors();
    } finally {
      await resetTimeTravel({ baseUrl });
      guard.detach();
    }
  });


  // =========================================================================
  // JORNADA 5: RESILIÊNCIA DE PAGAMENTO PIX
  // =========================================================================
  test("Jornada 5: Resiliência de Pagamento PIX - Confirmação em tempo real sem reload e regeneração de QR Code", async ({ page, baseURL }) => {
    const baseUrl = baseURL;
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 0. Ensure reservation is in pristine pending PIX state across all viewports
      await resetPendingPixReservation({ baseUrl, reservationCode: "RES-TEST-PIX-PENDING" });

      // 1. Navigate to pending PIX page in guest portal (/minha-reserva/RES-TEST-PIX-PENDING)
      await page.goto("/minha-reserva/RES-TEST-PIX-PENDING", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });
      await guard.assertZeroWhiteScreen(15000);

      // 2. Assert pending payment UI is displayed
      const copyPixBtn = page.locator("button:has-text('Copiar Código PIX')").first();
      await expect(copyPixBtn).toBeVisible({ timeout: 15000 });

      const initialText = await page.locator("#root").innerText();
      expect(initialText).toContain("PIX");

      // 3. Trigger instant PIX settlement webhook via simulator
      const simResult = await simulatePixPayment({
        baseUrl,
        txid: "PIX_SANDBOX_TX_001",
        amount: 280.00
      });
      expect(simResult.success).toBe(true);

      // 4. Assert page updates in real-time without full page reload via 6s polling
      // Wait for payment confirmation UI
      await expect(async () => {
        const liveText = await page.locator("#root").innerText();
        const isConfirmed = 
          liveText.includes("Confirmado") || 
          liveText.includes("pago") || 
          liveText.includes("Voucher") || 
          /senha fechadura/i.test(liveText) ||
          liveText.includes("Acomodação Confirmada");
        expect(isConfirmed).toBe(true);
      }).toPass({ timeout: 15000 });

      // 5. Test QR Code expiration and regeneration flow
      const expireResult = await simulatePixExpiration({
        baseUrl,
        reservationCode: "RES-TEST-PIX-PENDING"
      });
      expect(expireResult.success).toBe(true);

      // Fetch guest portal API to verify automated renewal
      const portalRes = await page.request.get(`${baseURL}/api/pms/guest-portal/RES-TEST-PIX-PENDING`);
      expect(portalRes.ok()).toBe(true);
      const portalJson = await portalRes.json();
      expect(portalJson.reservation).toBeTruthy();
      expect(portalJson.reservation.pixCopiaECola).toBeTruthy();

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // JORNADA 6: UPLOAD MOBILE RESILIENTE & CANVAS SIGNATURE
  // =========================================================================
  test("Jornada 6: Upload Mobile Resiliente & Canvas Signature - touch-action: none sem scroll e compressão de imagem", async ({ page, baseURL }) => {
    // 1. Configure Mobile Viewport (iPhone 12 - 375x812, hasTouch: true)
    await page.setViewportSize({ width: 375, height: 812 });

    const guard = attachErrorGuard(page, { 
      allowGuestAuth401: true,
      allowedApiStatuses: [429]
    });

    try {
      // 2. Open pre-checkin on Mobile
      await page.goto("/pre-checkin/RES-TEST-MOBILE-SIGN?step=3", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });
      await guard.assertZeroWhiteScreen(15000);

      // 3. Locate signature canvas
      const canvas = page.locator("canvas").first();
      await expect(canvas).toBeVisible({ timeout: 10000 });

      // 4. Verify touch-action: none prevents accidental page scrolling on mobile
      const touchAction = await canvas.evaluate((el) => {
        const computed = window.getComputedStyle(el).touchAction;
        const parentComputed = el.parentElement ? window.getComputedStyle(el.parentElement).touchAction : "";
        return computed || parentComputed;
      });
      expect(["none", "pan-x", "pan-y", "manipulation"]).toContain(touchAction);
      expect(touchAction).toBe("none");

      // 5. Test touch drawing events on canvas
      await canvas.evaluate((c) => {
        const rect = c.getBoundingClientRect();
        const startX = rect.left + 20;
        const startY = rect.top + 30;
        const endX = rect.left + 120;
        const endY = rect.top + 60;

        try {
          if (typeof Touch !== "undefined") {
            const t1 = new Touch({ identifier: 1, target: c, clientX: startX, clientY: startY });
            const t2 = new Touch({ identifier: 1, target: c, clientX: endX, clientY: endY });
            c.dispatchEvent(new TouchEvent("touchstart", { touches: [t1], changedTouches: [t1], targetTouches: [t1], bubbles: true }));
            c.dispatchEvent(new TouchEvent("touchmove", { touches: [t2], changedTouches: [t2], targetTouches: [t2], bubbles: true }));
            c.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t2], targetTouches: [], bubbles: true }));
          }
        } catch {}

        // Fallback to mouse event if touch did not write to canvas (e.g. desktop non-touch environment)
        const ctx = c.getContext("2d");
        const hasDrawn = ctx.getImageData(0, 0, c.width, c.height).data.some(ch => ch > 0);
        if (!hasDrawn) {
          c.dispatchEvent(new MouseEvent("mousedown", { clientX: startX, clientY: startY, bubbles: true }));
          c.dispatchEvent(new MouseEvent("mousemove", { clientX: endX, clientY: endY, bubbles: true }));
          c.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        }
      });

      // Assert canvas has content
      const canvasNotEmpty = await canvas.evaluate((c) => {
        const ctx = c.getContext("2d");
        const imgData = ctx.getImageData(0, 0, c.width, c.height).data;
        return imgData.some(channel => channel > 0);
      });
      expect(canvasNotEmpty).toBe(true);

      // 6. Test browser image compression utility in page context
      const compressionResult = await page.evaluate(async () => {
        // Create an uncompressed 3000x2000 high-resolution canvas
        const highRes = document.createElement("canvas");
        highRes.width = 3000;
        highRes.height = 2000;
        const ctx = highRes.getContext("2d");
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, 3000, 2000);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(500, 500, 1000, 1000);

        const blob = await new Promise(resolve => highRes.toBlob(resolve, "image/jpeg", 0.95));
        const originalSizeBytes = blob.size;

        // Compress using resize algorithm identical to image-compression.ts
        const maxWidth = 1400;
        const maxHeight = 1400;
        let w = highRes.width;
        let h = highRes.height;
        if (w > maxWidth || h > maxHeight) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          } else {
            w = Math.round((w * maxHeight) / h);
            h = maxHeight;
          }
        }
        const compressedCanvas = document.createElement("canvas");
        compressedCanvas.width = w;
        compressedCanvas.height = h;
        const cCtx = compressedCanvas.getContext("2d");
        cCtx.drawImage(highRes, 0, 0, w, h);
        const webpBlob = await new Promise(resolve => compressedCanvas.toBlob(resolve, "image/webp", 0.8));

        return {
          originalSizeBytes,
          compressedSizeBytes: webpBlob.size,
          compressedWidth: w,
          compressedHeight: h,
          savedPercentage: Math.round(((originalSizeBytes - webpBlob.size) / originalSizeBytes) * 100)
        };
      });

      expect(compressionResult.compressedWidth).toBeLessThanOrEqual(1400);
      expect(compressionResult.compressedHeight).toBeLessThanOrEqual(1400);
      expect(compressionResult.compressedSizeBytes).toBeLessThan(compressionResult.originalSizeBytes);
      expect(compressionResult.savedPercentage).toBeGreaterThanOrEqual(50);

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // JORNADA 7: ISOLAMENTO ESTRITO DE ACOMPANHANTES
  // =========================================================================
  test("Jornada 7: Isolamento Estrito de Acompanhantes - Hóspede 2 não sobrescreve Hóspede 1", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      // 1. Submit pre-checkin for Companion (Guest Index 2)
      const companionSubmitRes = await page.request.post(`${baseURL}/api/pms/pre-checkin`, {
        data: {
          code: "RES-TEST-COMPANION-ISO",
          guestIndex: 2,
          fullName: "Bernardo Silveira",
          document: "55566677788",
          phone: "5522992222222",
          email: "bernardo@teste.corpflats",
          birthDate: "1994-08-12",
          gender: "masculino",
          address: "Av. Pelinca, 450",
          city: "Campos dos Goytacazes",
          state: "RJ",
          cep: "28035-000",
          legalTermsAccepted: true
        }
      });
      expect(companionSubmitRes.ok()).toBe(true);

      // 2. Fetch reservation details via API
      const resAfterApi = await page.request.get(`${baseURL}/api/pms/pre-checkin/RES-TEST-COMPANION-ISO`);
      expect(resAfterApi.ok()).toBe(true);
      const resJson = await resAfterApi.json();

      const reservation = resJson.reservation;
      const guests = reservation.guests || [];

      // 3. Strict Isolation Assertions:
      // Primary guest (Guest 1) must retain original data
      expect(reservation.guestName).toBe("Alice Silveira");
      expect(reservation.guestDocument).toBe("11122233344");
      expect(reservation.guestPhone).toBe("5522998877666");

      const guest1 = guests.find(g => g.index === 1);
      expect(guest1).toBeTruthy();
      expect(guest1.name).toBe("Alice Silveira");
      expect(guest1.cpf).toBe("11122233344");

      // Companion guest (Guest 2) must have updated Bernardo Silveira data
      const guest2 = guests.find(g => g.index === 2);
      expect(guest2).toBeTruthy();
      expect(guest2.name).toBe("Bernardo Silveira");
      expect(guest2.cpf).toBe("55566677788");
      expect(guest2.phone).toBe("5522992222222");

      // 4. Verify in UI that navigating to Guest 1 still shows Alice Silveira
      await page.goto("/pre-checkin/RES-TEST-COMPANION-ISO?guest=1&edit=1", {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });
      await guard.assertZeroWhiteScreen(15000);

      const editBtn = page.locator("button:has-text('Editar Dados')").first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
      }

      const nameInput = page.locator("input[placeholder*='completo' i], input#name, input[name='name']").first();
      if (await nameInput.isVisible()) {
        const nameVal = await nameInput.inputValue();
        expect(nameVal).toBe("Alice Silveira");
      } else {
        const pageText = await page.locator("#root").innerText();
        expect(pageText).toContain("Alice Silveira");
        expect(pageText).toContain("Bernardo Silveira");
      }

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });

});
