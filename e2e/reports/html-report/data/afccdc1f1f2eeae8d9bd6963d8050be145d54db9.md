# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-human-journeys.spec.mjs >> Milestone 3 (M3) - Jornadas Humanas Anti-Frustração (R3) >> Jornada 7: Isolamento Estrito de Acompanhantes - Hóspede 2 não sobrescreve Hóspede 1
- Location: e2e\suites\02-human-journeys.spec.mjs:467:3

# Error details

```
TimeoutError: apiRequestContext.post: Timeout 15000ms exceeded.
Call log:
  - → POST http://127.0.0.1:5055/api/pms/pre-checkin
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CorpFlatsDesktop/1.0
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 326

```

# Test source

```ts
  372 |       await canvas.evaluate((c) => {
  373 |         const rect = c.getBoundingClientRect();
  374 |         const startX = rect.left + 20;
  375 |         const startY = rect.top + 30;
  376 |         const endX = rect.left + 120;
  377 |         const endY = rect.top + 60;
  378 | 
  379 |         try {
  380 |           if (typeof Touch !== "undefined") {
  381 |             const t1 = new Touch({ identifier: 1, target: c, clientX: startX, clientY: startY });
  382 |             const t2 = new Touch({ identifier: 1, target: c, clientX: endX, clientY: endY });
  383 |             c.dispatchEvent(new TouchEvent("touchstart", { touches: [t1], changedTouches: [t1], targetTouches: [t1], bubbles: true }));
  384 |             c.dispatchEvent(new TouchEvent("touchmove", { touches: [t2], changedTouches: [t2], targetTouches: [t2], bubbles: true }));
  385 |             c.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t2], targetTouches: [], bubbles: true }));
  386 |           }
  387 |         } catch {}
  388 | 
  389 |         // Fallback to mouse event if touch did not write to canvas (e.g. desktop non-touch environment)
  390 |         const ctx = c.getContext("2d");
  391 |         const hasDrawn = ctx.getImageData(0, 0, c.width, c.height).data.some(ch => ch > 0);
  392 |         if (!hasDrawn) {
  393 |           c.dispatchEvent(new MouseEvent("mousedown", { clientX: startX, clientY: startY, bubbles: true }));
  394 |           c.dispatchEvent(new MouseEvent("mousemove", { clientX: endX, clientY: endY, bubbles: true }));
  395 |           c.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  396 |         }
  397 |       });
  398 | 
  399 |       // Assert canvas has content
  400 |       const canvasNotEmpty = await canvas.evaluate((c) => {
  401 |         const ctx = c.getContext("2d");
  402 |         const imgData = ctx.getImageData(0, 0, c.width, c.height).data;
  403 |         return imgData.some(channel => channel > 0);
  404 |       });
  405 |       expect(canvasNotEmpty).toBe(true);
  406 | 
  407 |       // 6. Test browser image compression utility in page context
  408 |       const compressionResult = await page.evaluate(async () => {
  409 |         // Create an uncompressed 3000x2000 high-resolution canvas
  410 |         const highRes = document.createElement("canvas");
  411 |         highRes.width = 3000;
  412 |         highRes.height = 2000;
  413 |         const ctx = highRes.getContext("2d");
  414 |         ctx.fillStyle = "#1e293b";
  415 |         ctx.fillRect(0, 0, 3000, 2000);
  416 |         ctx.fillStyle = "#38bdf8";
  417 |         ctx.fillRect(500, 500, 1000, 1000);
  418 | 
  419 |         const blob = await new Promise(resolve => highRes.toBlob(resolve, "image/jpeg", 0.95));
  420 |         const originalSizeBytes = blob.size;
  421 | 
  422 |         // Compress using resize algorithm identical to image-compression.ts
  423 |         const maxWidth = 1400;
  424 |         const maxHeight = 1400;
  425 |         let w = highRes.width;
  426 |         let h = highRes.height;
  427 |         if (w > maxWidth || h > maxHeight) {
  428 |           if (w > h) {
  429 |             h = Math.round((h * maxWidth) / w);
  430 |             w = maxWidth;
  431 |           } else {
  432 |             w = Math.round((w * maxHeight) / h);
  433 |             h = maxHeight;
  434 |           }
  435 |         }
  436 |         const compressedCanvas = document.createElement("canvas");
  437 |         compressedCanvas.width = w;
  438 |         compressedCanvas.height = h;
  439 |         const cCtx = compressedCanvas.getContext("2d");
  440 |         cCtx.drawImage(highRes, 0, 0, w, h);
  441 |         const webpBlob = await new Promise(resolve => compressedCanvas.toBlob(resolve, "image/webp", 0.8));
  442 | 
  443 |         return {
  444 |           originalSizeBytes,
  445 |           compressedSizeBytes: webpBlob.size,
  446 |           compressedWidth: w,
  447 |           compressedHeight: h,
  448 |           savedPercentage: Math.round(((originalSizeBytes - webpBlob.size) / originalSizeBytes) * 100)
  449 |         };
  450 |       });
  451 | 
  452 |       expect(compressionResult.compressedWidth).toBeLessThanOrEqual(1400);
  453 |       expect(compressionResult.compressedHeight).toBeLessThanOrEqual(1400);
  454 |       expect(compressionResult.compressedSizeBytes).toBeLessThan(compressionResult.originalSizeBytes);
  455 |       expect(compressionResult.savedPercentage).toBeGreaterThanOrEqual(50);
  456 | 
  457 |       guard.assertNoErrors();
  458 |     } finally {
  459 |       guard.detach();
  460 |     }
  461 |   });
  462 | 
  463 | 
  464 |   // =========================================================================
  465 |   // JORNADA 7: ISOLAMENTO ESTRITO DE ACOMPANHANTES
  466 |   // =========================================================================
  467 |   test("Jornada 7: Isolamento Estrito de Acompanhantes - Hóspede 2 não sobrescreve Hóspede 1", async ({ page, baseURL }) => {
  468 |     const guard = attachErrorGuard(page, { allowGuestAuth401: true });
  469 | 
  470 |     try {
  471 |       // 1. Submit pre-checkin for Companion (Guest Index 2)
> 472 |       const companionSubmitRes = await page.request.post(`${baseURL}/api/pms/pre-checkin`, {
      |                                                     ^ TimeoutError: apiRequestContext.post: Timeout 15000ms exceeded.
  473 |         data: {
  474 |           code: "RES-TEST-COMPANION-ISO",
  475 |           guestIndex: 2,
  476 |           fullName: "Bernardo Silveira",
  477 |           document: "55566677788",
  478 |           phone: "5522992222222",
  479 |           email: "bernardo@teste.corpflats",
  480 |           birthDate: "1994-08-12",
  481 |           gender: "masculino",
  482 |           address: "Av. Pelinca, 450",
  483 |           city: "Campos dos Goytacazes",
  484 |           state: "RJ",
  485 |           cep: "28035-000",
  486 |           legalTermsAccepted: true
  487 |         }
  488 |       });
  489 |       expect(companionSubmitRes.ok()).toBe(true);
  490 | 
  491 |       // 2. Fetch reservation details via API
  492 |       const resAfterApi = await page.request.get(`${baseURL}/api/pms/pre-checkin/RES-TEST-COMPANION-ISO`);
  493 |       expect(resAfterApi.ok()).toBe(true);
  494 |       const resJson = await resAfterApi.json();
  495 | 
  496 |       const reservation = resJson.reservation;
  497 |       const guests = reservation.guests || [];
  498 | 
  499 |       // 3. Strict Isolation Assertions:
  500 |       // Primary guest (Guest 1) must retain original data
  501 |       expect(reservation.guestName).toBe("Alice Silveira");
  502 |       expect(reservation.guestDocument).toBe("11122233344");
  503 |       expect(reservation.guestPhone).toBe("5522998877666");
  504 | 
  505 |       const guest1 = guests.find(g => g.index === 1);
  506 |       expect(guest1).toBeTruthy();
  507 |       expect(guest1.name).toBe("Alice Silveira");
  508 |       expect(guest1.cpf).toBe("11122233344");
  509 | 
  510 |       // Companion guest (Guest 2) must have updated Bernardo Silveira data
  511 |       const guest2 = guests.find(g => g.index === 2);
  512 |       expect(guest2).toBeTruthy();
  513 |       expect(guest2.name).toBe("Bernardo Silveira");
  514 |       expect(guest2.cpf).toBe("55566677788");
  515 |       expect(guest2.phone).toBe("5522992222222");
  516 | 
  517 |       // 4. Verify in UI that navigating to Guest 1 still shows Alice Silveira
  518 |       await page.goto("/pre-checkin/RES-TEST-COMPANION-ISO?guest=1&edit=1", {
  519 |         waitUntil: "domcontentloaded",
  520 |         timeout: 25000
  521 |       });
  522 |       await guard.assertZeroWhiteScreen(15000);
  523 | 
  524 |       const editBtn = page.locator("button:has-text('Editar Dados')").first();
  525 |       if (await editBtn.isVisible()) {
  526 |         await editBtn.click();
  527 |       }
  528 | 
  529 |       const nameInput = page.locator("input[placeholder*='completo' i], input#name, input[name='name']").first();
  530 |       if (await nameInput.isVisible()) {
  531 |         const nameVal = await nameInput.inputValue();
  532 |         expect(nameVal).toBe("Alice Silveira");
  533 |       } else {
  534 |         const pageText = await page.locator("#root").innerText();
  535 |         expect(pageText).toContain("Alice Silveira");
  536 |         expect(pageText).toContain("Bernardo Silveira");
  537 |       }
  538 | 
  539 |       guard.assertNoErrors();
  540 |     } finally {
  541 |       guard.detach();
  542 |     }
  543 |   });
  544 | 
  545 | });
  546 | 
```