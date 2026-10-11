# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-human-journeys.spec.mjs >> Milestone 3 (M3) - Jornadas Humanas Anti-Frustração (R3) >> Jornada 6: Upload Mobile Resiliente & Canvas Signature - touch-action: none sem scroll e compressão de imagem
- Location: e2e\suites\02-human-journeys.spec.mjs:338:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6] [cursor=pointer]:
          - generic [ref=e7]: CF
          - generic [ref=e8]:
            - generic [ref=e9]: CorpFlats
            - generic [ref=e10]: Flat 305 • Pré-Check-in Digital
        - generic [ref=e11]:
          - button [ref=e12]
          - link "WhatsApp" [ref=e15] [cursor=pointer]:
            - /url: https://wa.me/5522997124021?text=Ol%C3%A1!%20Gostaria%20de%20ajuda%20com%20o%20pr%C3%A9-check-in%20digital%20da%20reserva%20RES-TEST-MOBILE-SIGN.
    - banner [ref=e19]:
      - img "Pré-Check-in CorpFlats" [ref=e21]
      - generic [ref=e23]:
        - generic [ref=e24]: Ficha de Hospedagem (FNRH)
        - heading "Check-in Digital" [level=1] [ref=e29]
        - paragraph [ref=e30]: Confirme seus dados cadastrais e assine para liberação do acesso
    - main [ref=e31]:
      - generic [ref=e32]:
        - heading "Olá, Gabriel! 👋" [level=2] [ref=e34]
        - generic [ref=e35]:
          - generic [ref=e36]:
            - generic [ref=e37]: Acomodação
            - generic [ref=e38]: Flat 305
            - text: Soho Residence
          - generic [ref=e39]:
            - generic [ref=e40]: Check-in
            - generic [ref=e41]: 2026-10-11
            - generic [ref=e42]: a partir das 14:00
          - generic [ref=e43]:
            - generic [ref=e44]: Check-out
            - generic [ref=e45]: 2026-10-12
            - generic [ref=e46]: até as 12:00
          - generic [ref=e47]:
            - generic [ref=e48]: Hóspedes
            - generic [ref=e49]: 1 Pessoa(s)
            - text: Direto Site
        - paragraph [ref=e50]: Confirme seus dados cadastrais obrigatórios pela legislação brasileira para agilizar a liberação das chaves e autorização na portaria do condomínio.
      - generic [ref=e52]:
        - generic [ref=e54]:
          - generic [ref=e55]: ✓
          - generic [ref=e56]: Dados
        - generic [ref=e59]:
          - generic [ref=e60]: ✓
          - generic [ref=e61]: Documento
        - generic [ref=e64]:
          - generic [ref=e65]: "3"
          - generic [ref=e66]: Assinatura
      - generic [ref=e68]:
        - heading "3. Assinatura Digital com Validade Jurídica" [level=3] [ref=e70]
        - generic [ref=e77]:
          - generic [ref=e78]:
            - generic [ref=e79]: Sessão de Assinatura Eletrônica Ativa
            - generic [ref=e84]: "Validade: 1h 59m 59s"
          - paragraph [ref=e90]:
            - text: Esta sessão possui
            - strong [ref=e91]: validade máxima de 2 horas
            - text: nos termos da
            - strong [ref=e92]: MP nº 2.200-2/2001
            - text: e
            - strong [ref=e93]: Lei nº 14.063/2020
            - text: . Seus metadados forenses de IP, dispositivo e carimbo de tempo serão vinculados ao hash criptográfico SHA-256 da FNRH.
          - generic [ref=e94]:
            - button "Copiar Link para Celular" [ref=e95]
            - button "Reiniciar 2 Horas" [ref=e100]
        - paragraph [ref=e107]: "Assine com o dedo ou mouse na área abaixo confirmando a exatidão dos seus dados:"
        - button "Limpar Assinatura" [ref=e110]
        - generic [ref=e111]:
          - generic [ref=e112]:
            - generic [ref=e117]:
              - generic [ref=e118]: Código de Segurança no WhatsApp (2FA)
              - generic [ref=e119]: Enviado para o WhatsApp (••) •••••-7667
            - generic [ref=e120]: Posse Comprovada
          - paragraph [ref=e121]: "Para conferir validade jurídica à sua assinatura (Lei 14.063/2020), enviamos um código de 6 dígitos no seu WhatsApp. Digite-o abaixo:"
          - generic [ref=e122]: Código enviado com sucesso para seu WhatsApp (••) •••••-7667.
          - generic [ref=e127]:
            - textbox "000000" [ref=e129]
            - generic [ref=e130]:
              - button "Reenviar (60s)" [disabled]
          - generic [ref=e131]:
            - generic [ref=e132]: Não recebeu o código no WhatsApp?
            - button "Receber código por E-mail →" [ref=e133]
        - generic [ref=e134]:
          - generic [ref=e135]: Seus dados e documentos estão protegidos
          - paragraph [ref=e140]: Suas informações são coletadas para cumprimento de obrigação legal regulatória (FNRH - Lei Geral do Turismo nº 11.771/2008 e Decreto nº 7.381/2010) e execução do contrato de hospedagem (Art. 7º, II e V da LGPD).
          - generic [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]: "• Segurança:"
              - generic [ref=e144]: O tráfego e o armazenamento são protegidos por criptografia de ponta a ponta.
            - generic [ref=e145]:
              - generic [ref=e146]: "• Uso restrito:"
              - generic [ref=e147]: Acesso limitado exclusivamente à gestão da hospedagem e autoridades competentes conforme exigido em lei. Seus dados nunca são comercializados.
            - generic [ref=e148]:
              - generic [ref=e149]: "• Seus direitos:"
              - generic [ref=e150]: Você pode revisar ou atualizar seus dados cadastrais a qualquer momento.
          - generic [ref=e151] [cursor=pointer]: Acesse nossa Política de Privacidade para mais detalhes
        - generic [ref=e156]:
          - generic [ref=e157] [cursor=pointer]:
            - checkbox "Declaração Obrigatória de Veracidade e LGPD * Declaro que as informações prestadas são verdadeiras e estou ciente dos termos de hospedagem e política de privacidade/LGPD. [Regras do Edifício] [Termos de Hospedagem]" [ref=e158]
            - generic [ref=e159]:
              - generic [ref=e160]: Declaração Obrigatória de Veracidade e LGPD *
              - paragraph [ref=e161]: Declaro que as informações prestadas são verdadeiras e estou ciente dos termos de hospedagem e política de privacidade/LGPD.
              - generic [ref=e162]:
                - button "[Regras do Edifício]" [ref=e163]
                - button "[Termos de Hospedagem]" [ref=e164]
          - generic [ref=e165] [cursor=pointer]:
            - checkbox "Comunicações e Benefícios Exclusivos (Opcional) Aceito receber novidades, benefícios e comunicações sobre futuras estadias via WhatsApp ou E-mail." [ref=e166]
            - generic [ref=e167]:
              - generic [ref=e168]: Comunicações e Benefícios Exclusivos (Opcional)
              - paragraph [ref=e169]: Aceito receber novidades, benefícios e comunicações sobre futuras estadias via WhatsApp ou E-mail.
        - generic [ref=e170]:
          - button "Voltar" [ref=e171]
          - button "Confirmar Check-in e Gerar Ficha" [disabled]
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  295 |         baseUrl,
  296 |         txid: "PIX_SANDBOX_TX_001",
  297 |         amount: 280.00
  298 |       });
  299 |       expect(simResult.success).toBe(true);
  300 | 
  301 |       // 4. Assert page updates in real-time without full page reload via 6s polling
  302 |       // Wait for payment confirmation UI
  303 |       await expect(async () => {
  304 |         const liveText = await page.locator("#root").innerText();
  305 |         const isConfirmed = 
  306 |           liveText.includes("Confirmado") || 
  307 |           liveText.includes("pago") || 
  308 |           liveText.includes("Voucher") || 
  309 |           /senha fechadura/i.test(liveText) ||
  310 |           liveText.includes("Acomodação Confirmada");
  311 |         expect(isConfirmed).toBe(true);
  312 |       }).toPass({ timeout: 15000 });
  313 | 
  314 |       // 5. Test QR Code expiration and regeneration flow
  315 |       const expireResult = await simulatePixExpiration({
  316 |         baseUrl,
  317 |         reservationCode: "RES-TEST-PIX-PENDING"
  318 |       });
  319 |       expect(expireResult.success).toBe(true);
  320 | 
  321 |       // Fetch guest portal API to verify automated renewal
  322 |       const portalRes = await page.request.get(`${baseURL}/api/pms/guest-portal/RES-TEST-PIX-PENDING`);
  323 |       expect(portalRes.ok()).toBe(true);
  324 |       const portalJson = await portalRes.json();
  325 |       expect(portalJson.reservation).toBeTruthy();
  326 |       expect(portalJson.reservation.pixCopiaECola).toBeTruthy();
  327 | 
  328 |       guard.assertNoErrors();
  329 |     } finally {
  330 |       guard.detach();
  331 |     }
  332 |   });
  333 | 
  334 | 
  335 |   // =========================================================================
  336 |   // JORNADA 6: UPLOAD MOBILE RESILIENTE & CANVAS SIGNATURE
  337 |   // =========================================================================
  338 |   test("Jornada 6: Upload Mobile Resiliente & Canvas Signature - touch-action: none sem scroll e compressão de imagem", async ({ page, baseURL }) => {
  339 |     // 1. Configure Mobile Viewport (iPhone 12 - 375x812, hasTouch: true)
  340 |     await page.setViewportSize({ width: 375, height: 812 });
  341 | 
  342 |     const guard = attachErrorGuard(page, { allowGuestAuth401: true });
  343 | 
  344 |     try {
  345 |       // 2. Open pre-checkin on Mobile
  346 |       await page.goto("/pre-checkin/RES-TEST-MOBILE-SIGN?step=3", {
  347 |         waitUntil: "domcontentloaded",
  348 |         timeout: 25000
  349 |       });
  350 |       await guard.assertZeroWhiteScreen(15000);
  351 | 
  352 |       // 3. Locate signature canvas
  353 |       const canvas = page.locator("canvas").first();
  354 |       await expect(canvas).toBeVisible({ timeout: 10000 });
  355 | 
  356 |       // 4. Verify touch-action: none prevents accidental page scrolling on mobile
  357 |       const touchAction = await canvas.evaluate((el) => {
  358 |         const computed = window.getComputedStyle(el).touchAction;
  359 |         const parentComputed = el.parentElement ? window.getComputedStyle(el.parentElement).touchAction : "";
  360 |         return computed || parentComputed;
  361 |       });
  362 |       expect(["none", "pan-x", "pan-y", "manipulation"]).toContain(touchAction);
  363 |       expect(touchAction).toBe("none");
  364 | 
  365 |       // 5. Test touch drawing events on canvas
  366 |       const canvasBox = await canvas.boundingBox();
  367 |       expect(canvasBox).toBeTruthy();
  368 | 
  369 |       const startX = canvasBox.x + 20;
  370 |       const startY = canvasBox.y + 30;
  371 |       const endX = canvasBox.x + 120;
  372 |       const endY = canvasBox.y + 60;
  373 | 
  374 |       // Dispatch real touch drawing sequence via W3C TouchEvent
  375 |       await canvas.evaluate((c, { startX, startY, endX, endY }) => {
  376 |         try {
  377 |           const t1 = new Touch({ identifier: 1, target: c, clientX: startX, clientY: startY });
  378 |           const t2 = new Touch({ identifier: 1, target: c, clientX: endX, clientY: endY });
  379 |           c.dispatchEvent(new TouchEvent("touchstart", { touches: [t1], changedTouches: [t1], targetTouches: [t1], bubbles: true }));
  380 |           c.dispatchEvent(new TouchEvent("touchmove", { touches: [t2], changedTouches: [t2], targetTouches: [t2], bubbles: true }));
  381 |           c.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t2], targetTouches: [], bubbles: true }));
  382 |         } catch {
  383 |           c.dispatchEvent(new MouseEvent("mousedown", { clientX: startX, clientY: startY, bubbles: true }));
  384 |           c.dispatchEvent(new MouseEvent("mousemove", { clientX: endX, clientY: endY, bubbles: true }));
  385 |           c.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  386 |         }
  387 |       }, { startX, startY, endX, endY });
  388 | 
  389 |       // Assert canvas has content
  390 |       const canvasNotEmpty = await canvas.evaluate((c) => {
  391 |         const ctx = c.getContext("2d");
  392 |         const imgData = ctx.getImageData(0, 0, c.width, c.height).data;
  393 |         return imgData.some(channel => channel > 0);
  394 |       });
> 395 |       expect(canvasNotEmpty).toBe(true);
      |                              ^ Error: expect(received).toBe(expected) // Object.is equality
  396 | 
  397 |       // 6. Test browser image compression utility in page context
  398 |       const compressionResult = await page.evaluate(async () => {
  399 |         // Create an uncompressed 3000x2000 high-resolution canvas
  400 |         const highRes = document.createElement("canvas");
  401 |         highRes.width = 3000;
  402 |         highRes.height = 2000;
  403 |         const ctx = highRes.getContext("2d");
  404 |         ctx.fillStyle = "#1e293b";
  405 |         ctx.fillRect(0, 0, 3000, 2000);
  406 |         ctx.fillStyle = "#38bdf8";
  407 |         ctx.fillRect(500, 500, 1000, 1000);
  408 | 
  409 |         const blob = await new Promise(resolve => highRes.toBlob(resolve, "image/jpeg", 0.95));
  410 |         const originalSizeBytes = blob.size;
  411 | 
  412 |         // Compress using resize algorithm identical to image-compression.ts
  413 |         const maxWidth = 1400;
  414 |         const maxHeight = 1400;
  415 |         let w = highRes.width;
  416 |         let h = highRes.height;
  417 |         if (w > maxWidth || h > maxHeight) {
  418 |           if (w > h) {
  419 |             h = Math.round((h * maxWidth) / w);
  420 |             w = maxWidth;
  421 |           } else {
  422 |             w = Math.round((w * maxHeight) / h);
  423 |             h = maxHeight;
  424 |           }
  425 |         }
  426 |         const compressedCanvas = document.createElement("canvas");
  427 |         compressedCanvas.width = w;
  428 |         compressedCanvas.height = h;
  429 |         const cCtx = compressedCanvas.getContext("2d");
  430 |         cCtx.drawImage(highRes, 0, 0, w, h);
  431 |         const webpBlob = await new Promise(resolve => compressedCanvas.toBlob(resolve, "image/webp", 0.8));
  432 | 
  433 |         return {
  434 |           originalSizeBytes,
  435 |           compressedSizeBytes: webpBlob.size,
  436 |           compressedWidth: w,
  437 |           compressedHeight: h,
  438 |           savedPercentage: Math.round(((originalSizeBytes - webpBlob.size) / originalSizeBytes) * 100)
  439 |         };
  440 |       });
  441 | 
  442 |       expect(compressionResult.compressedWidth).toBeLessThanOrEqual(1400);
  443 |       expect(compressionResult.compressedHeight).toBeLessThanOrEqual(1400);
  444 |       expect(compressionResult.compressedSizeBytes).toBeLessThan(compressionResult.originalSizeBytes);
  445 |       expect(compressionResult.savedPercentage).toBeGreaterThanOrEqual(50);
  446 | 
  447 |       guard.assertNoErrors();
  448 |     } finally {
  449 |       guard.detach();
  450 |     }
  451 |   });
  452 | 
  453 | 
  454 |   // =========================================================================
  455 |   // JORNADA 7: ISOLAMENTO ESTRITO DE ACOMPANHANTES
  456 |   // =========================================================================
  457 |   test("Jornada 7: Isolamento Estrito de Acompanhantes - Hóspede 2 não sobrescreve Hóspede 1", async ({ page, baseURL }) => {
  458 |     const guard = attachErrorGuard(page, { allowGuestAuth401: true });
  459 | 
  460 |     try {
  461 |       // 1. Submit pre-checkin for Companion (Guest Index 2)
  462 |       const companionSubmitRes = await page.request.post(`${baseURL}/api/pms/pre-checkin`, {
  463 |         data: {
  464 |           code: "RES-TEST-COMPANION-ISO",
  465 |           guestIndex: 2,
  466 |           fullName: "Bernardo Silveira",
  467 |           document: "55566677788",
  468 |           phone: "5522992222222",
  469 |           email: "bernardo@teste.corpflats",
  470 |           birthDate: "1994-08-12",
  471 |           gender: "masculino",
  472 |           address: "Av. Pelinca, 450",
  473 |           city: "Campos dos Goytacazes",
  474 |           state: "RJ",
  475 |           cep: "28035-000",
  476 |           legalTermsAccepted: true
  477 |         }
  478 |       });
  479 |       expect(companionSubmitRes.ok()).toBe(true);
  480 | 
  481 |       // 2. Fetch reservation details via API
  482 |       const resAfterApi = await page.request.get(`${baseURL}/api/pms/pre-checkin/RES-TEST-COMPANION-ISO`);
  483 |       expect(resAfterApi.ok()).toBe(true);
  484 |       const resJson = await resAfterApi.json();
  485 | 
  486 |       const reservation = resJson.reservation;
  487 |       const guests = reservation.guests || [];
  488 | 
  489 |       // 3. Strict Isolation Assertions:
  490 |       // Primary guest (Guest 1) must retain original data
  491 |       expect(reservation.guestName).toBe("Alice Silveira");
  492 |       expect(reservation.guestDocument).toBe("11122233344");
  493 |       expect(reservation.guestPhone).toBe("5522998877666");
  494 | 
  495 |       const guest1 = guests.find(g => g.index === 1);
```