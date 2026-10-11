# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-human-journeys.spec.mjs >> Milestone 3 (M3) - Jornadas Humanas Anti-Frustração (R3) >> Jornada 5: Resiliência de Pagamento PIX - Confirmação em tempo real sem reload e regeneração de QR Code
- Location: e2e\suites\02-human-journeys.spec.mjs:274:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text(\'Copiar Código PIX\')').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('button:has-text(\'Copiar Código PIX\')').first() with timeout 15000ms
  - waiting for locator('button:has-text(\'Copiar Código PIX\')').first()

```

```yaml
- navigation:
  - text: "CF CorpFlats ✓ Pago Loc:"
  - strong: RES-TEST-PIX-PENDING
  - link "WhatsApp":
    - /url: https://wa.me/5522997124021?text=Ol%C3%A1!%20Tenho%20uma%20reserva%20(RES-TEST-PIX-PENDING)%20no%20Flat%20511%20e%20gostaria%20de%20tirar%20uma%20d%C3%BAvida.
  - button "Atalhos e Opções da Reserva"
- main:
  - text: Área do Hóspede • Minha Reserva
  - heading "Olá, Juliana Peixoto! 👋" [level=1]
  - paragraph:
    - text: Sua estadia no
    - strong: Edifício Soho Residence Service
    - text: • Centro, Campos dos Goytacazes - RJ.
  - text: Flat 511 1 diária 1 hóspede Check-in (Entrada) Autoatendimento 11 de outubro de 2026 A partir das 14:00 (antecipado assim que limpo)
  - button "Pré-Check-in Digital"
  - text: Check-out (Saída) Autoatendimento 12 de outubro de 2026 Até as 12:00
  - button "Check-out Expresso"
  - heading "Pagamento Confirmado & Liquidado" [level=2]
  - text: Sua hospedagem está 100% garantida e o acesso ao condomínio liberado. ✓ Pago Valor Total da Estadia R$ 280,00 Valor Pago R$ 280,00 Reserva 100% Confirmada! Liquidado via PIX Banco Inter. 11/10/2026 às 01:03
  - button "Ver / Baixar Recibo"
  - button "Receber no WhatsApp"
  - heading "Flat Studio Executivo Completo" [level=2]
  - text: Unidade privativa completa, climatizada e com cozinha compacta 🧹 Em Higienização 511 Apartamento 511 Dirija-se à
  - strong: portaria 24h
  - text: e informe seu
  - strong: nome
  - text: e o número do flat. Apartamento em Preparação & Higienização 🧹
  - paragraph:
    - text: Nossa equipe de governança está higienizando e preparando o flat para a sua estada. O horário oficial de check-in é a partir das
    - strong: 14:00
    - text: .
  - paragraph:
    - text: ℹ️ O check-in antecipado (para reservas com benefício) é
    - strong: estritamente mediante disponibilidade
    - text: após a conclusão da limpeza e inspeção. Assim que finalizado, a entrada é liberada na portaria 24h.
  - strong: Que horas você pretende chegar hoje? ⏰
  - paragraph: Se você já souber o seu horário, nos avise para priorizarmos a finalização do seu flat ou verificarmos a liberação de uma acomodação pronta para entrada imediata!
  - button "14:30"
  - button "15:00"
  - button "16:00"
  - button "17:00"
  - button "18:00"
  - button "19:00+"
  - 'textbox "Ou digite o horário (ex: 16:30)"'
  - button "Salvar Previsão" [disabled]
  - heading "Rede Wi-Fi" [level=2]
  - text: ✓ Liberado Rede Wi-Fi (SSID) apto511
  - button "Copiar"
  - text: Senha de Acesso 1234567890123
  - button "Copiar"
  - heading "Estacionamento Rotativo Gratuito" [level=2]
  - text: Ampla garagem sem vaga demarcada, com segurança 24h e portão eletrônico Gratuito para Hóspedes
  - paragraph: "Cadastre a placa do seu veículo para que a portaria 24h do Edifício Soho libere a sua entrada no estacionamento rotativo gratuito (estacione em qualquer vaga livre):"
  - text: Placa do Veículo *
  - textbox "ABC1D23"
  - text: Modelo do Carro
  - 'textbox "Ex: Corolla, Civic"'
  - text: Marca
  - 'textbox "Ex: Toyota"'
  - text: Cor
  - 'textbox "Ex: Prata"'
  - button "Salvar e Liberar Estacionamento"
  - heading "Sincronizar com seu Calendário" [level=4]
  - text: Check-in 14:00
  - paragraph: Adicione as datas e horários da sua estada no Flat 511 à sua agenda pessoal.
  - button "Google Agenda"
  - button "Outlook / Office 365"
  - button "Apple / Arquivo .ICS"
  - heading "Localização & Como Chegar" [level=2]
  - text: Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ Soho Residence Service
  - link "Abrir no Google Maps":
    - /url: https://share.google/LHu3541d5lhkdvbL2
  - link "Abrir no Waze":
    - /url: https://waze.com/ul?q=Edif%C3%ADcio%20Soho%20Residence%20Service%2C%20Rua%20Conselheiro%20Otaviano%2C%20209%20-%20Centro%2C%20Campos%20dos%20Goytacazes%20-%20RJ
  - heading "Regras dos Flats & Contrato" [level=2]
  - button "🏡 Regras da Casa"
  - button "📜 Contrato Completo"
  - text: 🚭 100% Não Fumante Proibido fumar nos quartos e sacadas. Sujeito a taxa de higienização. 🐾 Pet de Pequeno Porte Até 10 kg, taxa fixa, transporte pelo elevador de serviço e no colo. 👥 Capacidade Máxima 1 pessoa autorizada (conforme contratado).
  - heading "Política de Cancelamento & Estorno" [level=2]
  - text: ⚠️ Fora do Prazo de Reembolso
  - paragraph: O prazo de cancelamento gratuito encerrou em 10/10/2026 às 14:00 (menos de 24 horas para o check-in). O cancelamento liberará o apartamento, mas sem devolução de valores.
  - button "Cancelar Reserva"
  - text: Atendimento & Concierge 24h
  - heading "Dúvidas ou solicitações na estadia?" [level=3]
  - paragraph: Fale diretamente com nossa equipe de hospitalidade pelo WhatsApp para qualquer suporte ou comodidade no Flat 511.
  - link "Conversar no WhatsApp":
    - /url: https://wa.me/5522997124021?text=Ol%C3%A1!%20Tenho%20uma%20reserva%20(RES-TEST-PIX-PENDING)%20no%20Flat%20511%20e%20gostaria%20de%20tirar%20uma%20d%C3%BAvida.
  - text: (22) 99712-4021
  - paragraph: CorpFlats Hospedagem • Edifício Soho Residence Service
  - paragraph: Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ • Portaria 24 horas
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  188 |       await guard.assertZeroWhiteScreen(15000);
  189 | 
  190 |       const garagemText = await page.locator("#root").innerText();
  191 |       expect(garagemText).toContain("KRT9F82");
  192 |       expect(garagemText).toContain("Toyota");
  193 |       expect(garagemText).toContain("Corolla Cross");
  194 |       expect(garagemText).toContain("Prata Metálico");
  195 | 
  196 |       // 4. Verify transactional email generated in Mock SMTP (async delivery)
  197 |       await expect.poll(() => getSentEmails().length, {
  198 |         message: "Waiting for garage authorization email in Mock SMTP",
  199 |         timeout: 8000,
  200 |         intervals: [200, 500, 1000]
  201 |       }).toBeGreaterThan(0);
  202 | 
  203 |       const sentEmails = getSentEmails();
  204 |       const garageEmail = sentEmails.find(e => 
  205 |         e.subject.includes("Garagem") || 
  206 |         e.subject.includes("KRT9F82") || 
  207 |         e.body.includes("KRT9F82") || 
  208 |         e.raw.includes("KRT9F82")
  209 |       );
  210 |       expect(garageEmail, "Expected garage authorization email captured in Mock SMTP").toBeTruthy();
  211 |       expect(garageEmail.raw).toContain("KRT9F82");
  212 |       expect(garageEmail.raw).toContain("Corolla Cross");
  213 | 
  214 |       guard.assertNoErrors();
  215 |     } finally {
  216 |       guard.detach();
  217 |     }
  218 |   });
  219 | 
  220 | 
  221 |   // =========================================================================
  222 |   // JORNADA 4: GESTÃO DE ACESSO E FECHADURA DIGITAL (CONTROLE 14H)
  223 |   // =========================================================================
  224 |   test("Jornada 4: Gestão de Acesso e Fechadura Digital - Bloqueio antes das 14h com aviso e liberação destacada após 14h", async ({ page, baseURL }) => {
  225 |     const baseUrl = baseURL;
  226 |     const guard = attachErrorGuard(page, { allowGuestAuth401: true });
  227 | 
  228 |     try {
  229 |       // 1. Shift time travel to morning 10:00 (before 14:00 official check-in)
  230 |       const travelRes10 = await setTimeTravelHour({ baseUrl, targetHour: 10 });
  231 |       expect(travelRes10.hour ?? travelRes10.brasilia?.hour).toBe(10);
  232 | 
  233 |       // 2. Navigate to guest portal for RES-TEST-LOCK-14H (Flat 212, in cleaning before 14h)
  234 |       await page.goto("/minha-reserva/RES-TEST-LOCK-14H", {
  235 |         waitUntil: "domcontentloaded",
  236 |         timeout: 25000
  237 |       });
  238 |       await guard.assertZeroWhiteScreen(15000);
  239 | 
  240 |       // 3. Assert friendly cleaning/preparation message is displayed and lock code is HIDDEN
  241 |       const rootMorningText = await page.locator("#root").innerText();
  242 |       expect(rootMorningText).toContain("Apartamento em Preparação & Higienização");
  243 |       expect(rootMorningText).toContain("14:00");
  244 |       expect(rootMorningText).not.toContain("4321#");
  245 | 
  246 |       // 4. Advance clock past 14:00 (e.g. 15:00) via time-travel
  247 |       const travelRes15 = await setTimeTravelHour({ baseUrl, targetHour: 15 });
  248 |       expect(travelRes15.hour ?? travelRes15.brasilia?.hour).toBe(15);
  249 | 
  250 |       // 5. Reload guest portal page
  251 |       await page.reload({ waitUntil: "domcontentloaded" });
  252 |       await guard.assertZeroWhiteScreen(15000);
  253 | 
  254 |       // 6. Assert digital lock code is now unlocked and prominently displayed
  255 |       const rootAfternoonText = await page.locator("#root").innerText();
  256 |       expect(rootAfternoonText).toMatch(/senha fechadura \/ portaria/i);
  257 |       expect(rootAfternoonText).toContain("4321#");
  258 | 
  259 |       // 7. Verify copy button is available and functional
  260 |       const copyKeyButton = page.locator("button:has-text('Copiar')").first();
  261 |       await expect(copyKeyButton).toBeVisible();
  262 | 
  263 |       guard.assertNoErrors();
  264 |     } finally {
  265 |       await resetTimeTravel({ baseUrl });
  266 |       guard.detach();
  267 |     }
  268 |   });
  269 | 
  270 | 
  271 |   // =========================================================================
  272 |   // JORNADA 5: RESILIÊNCIA DE PAGAMENTO PIX
  273 |   // =========================================================================
  274 |   test("Jornada 5: Resiliência de Pagamento PIX - Confirmação em tempo real sem reload e regeneração de QR Code", async ({ page, baseURL }) => {
  275 |     const baseUrl = baseURL;
  276 |     const guard = attachErrorGuard(page, { allowGuestAuth401: true });
  277 | 
  278 |     try {
  279 |       // 1. Navigate to pending PIX page in guest portal (/minha-reserva/RES-TEST-PIX-PENDING)
  280 |       await page.goto("/minha-reserva/RES-TEST-PIX-PENDING", {
  281 |         waitUntil: "domcontentloaded",
  282 |         timeout: 25000
  283 |       });
  284 |       await guard.assertZeroWhiteScreen(15000);
  285 | 
  286 |       // 2. Assert pending payment UI is displayed
  287 |       const copyPixBtn = page.locator("button:has-text('Copiar Código PIX')").first();
> 288 |       await expect(copyPixBtn).toBeVisible({ timeout: 15000 });
      |                                ^ Error: expect(locator).toBeVisible() failed
  289 | 
  290 |       const initialText = await page.locator("#root").innerText();
  291 |       expect(initialText).toContain("PIX");
  292 | 
  293 |       // 3. Trigger instant PIX settlement webhook via simulator
  294 |       const simResult = await simulatePixPayment({
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
```