# Handoff Report — Minibar Visual Standardization & Preview Gallery (R1 & R2)

**Investigator:** `survey_explorer_1` (teamwork_explorer)  
**Parent / Caller:** `92ba65f0-be83-406c-8289-2ffbe5293de2`  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\`  
**Date:** 2026-11-11T10:42:00Z  
**Type:** Hard Handoff (Investigation & Architecture Complete)  

---

## 1. Observation

1. **Current Image Assets in Filesystem:**
   - Command: `Get-ChildItem -Path "artifacts\limpeza\public\images\frigobar"`
   - Output: Exactly 18 PNG files found:
     `achocolatado.png`, `agua_mineral_copo.png`, `agua_mineral_garrafa.png`, `barra_cereal.png`, `batata.png`, `biscoito_salgado.png`, `castanha_caju.png`, `cerveja_long_neck.png`, `chiclete.png`, `chocolate.png`, `chocolate_kinder_bueno.png`, `chocolate_kitkat_snickers.png`, `cookies.png`, `energetico.png`, `refrigerante.png`, `smirnoff_ice.png`, `suco_fruta.png`, `suco_uva_integral.png`.
   - Node dimension inspection confirmed: All 18 files are exactly `1024x1024` resolution, sized between 549.8 KB and 1399.9 KB.

2. **Visual Inspection of Current Images (`view_file` tool):**
   - `refrigerante.png`: Fictional red can with generic text *"REFRIGERANTE REFROSCANTE SODA 350ml e"* instead of real Coca-Cola.
   - `batata.png`: Fictional cylinder *"BATATA ORIGINAL POTATO CHIPS Crispy & Delicious Classic Salted"* instead of Pringles.
   - `achocolatado.png`: Fictional carton *"DELÍCIA CHOCO Achocolatado 250ml"* instead of Toddynho / Nescau.
   - `cerveja_long_neck.png`: Generic brown bottle *"CERVEJA LONG NECK Brewery Premium Quality 330ml"* instead of Heineken Long Neck 330ml.
   - `energetico.png`: Generic can *"ENERGÉTICO ENERGY DRINK ORIGINAL FLAVOR 250ml"* instead of Red Bull.
   - `chocolate_kinder_bueno.png`: Shows an unpacked broken chocolate wafer stick lying on a table, completely omitting the iconic branded Ferrero wrapper!
   - `castanha_caju.png`: Generic fictitious pouch *"NATURÉL CASTANHA DE CAJU"*.
   - `cookies.png`: Generic kraft pouch *"GRANDMA'S OWN CHOCOLATE CHIP COOKIES"*.
   - `suco_uva_integral.png`: Fictitious label *"VINHEDO PURO 1L"* (mismatch with the 300ml catalog description).

3. **Backend Catalog Definition (`artifacts/api-server/demo-server.mjs`):**
   - `getDefaultMinibarProducts()` (lines 1495–1768): Returns array of 18 products with attributes `id`, `name`, `category`, `price`, `cost`, `defaultQuantity`, `imageUrl`, `description`, `active`, `isCourtesy`, `sortOrder`, `createdAt`, `updatedAt`.
   - `getDefaultMinibarStock()` (lines 1770–1794): Defines `globalTemplate` mapping each product ID to `defaultQuantity` and `quantity`.
   - Hardcoded Integrity Guards (lines 11169 & 11434):
     ```javascript
     if (!Array.isArray(db.minibarProducts) || db.minibarProducts.length === 0 || db.minibarProducts.length !== 18 || !db.minibarProducts.some(p => p.id === "prod_achocolatado")) db.minibarProducts = getDefaultMinibarProducts();
     if (!db.minibarDefaultStock || !Array.isArray(db.minibarDefaultStock.globalTemplate) || db.minibarDefaultStock.globalTemplate.length !== 18 || !db.minibarDefaultStock.globalTemplate.some(t => t.productId === "prod_achocolatado")) db.minibarDefaultStock = getDefaultMinibarStock();
     ```
   - API endpoints:
     - `GET /api/minibar/products` (lines 74324–74353)
     - `POST /api/minibar/products` (lines 74355–74393)
     - `PATCH /api/minibar/products/:id` (lines 74395–74420)
     - `DELETE /api/minibar/products/:id` (lines 74422–74442)
     - `GET /api/minibar/default-stock` (lines 74444–74450)

4. **Frontend Admin & Guest Interface (`artifacts/limpeza/src/pages/`):**
   - `minibar-admin.tsx`:
     - Line 1086: Tabs container with 4 triggers (`insights`, `catalogo`, `equipe`, `extrato`).
     - Line 1728: `<TabsContent value="catalogo">`.
     - Lines 1730–1756: Sub-view buttons (`catalogSubView === "produtos"` e `catalogSubView === "gabarito"`).
     - Lines 1813–1819: Renders product image `<img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-2xl object-cover shrink-0" />`.
   - `guest-minibar.tsx`:
     - Lines 2160–2174: Product image container `<div className="w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden shadow-inner bg-white border-slate-700/50">` containing `<img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-contain p-0.5" />`.
     - Uses `bg-white`, which creates an unsightly contrast if product images do not have pure white `#FFFFFF` backgrounds.

5. **Static Asset Pipeline:**
   - Static files located in `artifacts/limpeza/public/images/frigobar/`.
   - Copied to `artifacts/limpeza/dist/images/frigobar/` during `npm run build`.
   - Served directly by Express in `demo-server.mjs` (lines 72243 & 72254).

---

## 2. Logic Chain

1. **Premise 1:** The user request explicitly demands replacing all minibar product photos with real commercial brands (Coca-Cola, Kinder Bueno, etc.) adhering to an identical visual standard: pure white background `#FFFFFF`, uniform proportions, camera angle, distance, and lighting (Requirement R1).
2. **Premise 2:** As observed in Observation 2, 17 of the 18 current images are AI-generated generics with fictitious labels (*"DELÍCIA CHOCO"*, *"REFRIGERANTE SODA"*, *"BATATA ORIGINAL"*), and the Kinder Bueno image depicts an unpackaged chocolate bar rather than the recognizable commercial package.
3. **Premise 3:** In `guest-minibar.tsx` (Observation 4), product images are rendered inside a container with `bg-white`. Images with off-white, grey, or colored studio backdrops cause visible square artifacts. Therefore, isolating the product on pure `#FFFFFF` with a soft diffuse contact shadow is essential for visual perfection in both dark-mode guest UI and light-mode admin UI.
4. **Premise 4:** Requirement R2 dictates that before updating definitive files, a preview gallery or validation panel must be provided so the user can inspect side-by-side each proposed photo, product name, and chosen brand, and provide explicit approval or request swaps before final deployment.
5. **Premise 5:** In `minibar-admin.tsx` (Observation 4), tab `catalogo` already has an established sub-view selector pattern (`produtos` vs `gabarito`). Adding a 3rd sub-view `galeria_marcas` seamlessly integrates the validation workflow without cluttering the primary navigation tabs.
6. **Premise 6:** Backend analysis (Observation 3) revealed that `demo-server.mjs` hardcodes `length !== 18` checks at lines 11169 & 11434. Adding the 2 welcome kit courtesy items (Amendoim Mendorato and Água Copo) will trigger an automatic reset if these lines are not updated in lockstep.

---

## 3. Caveats

1. **Read-Only Scope:** In compliance with instructions, no source code, database state, or image files were modified during this investigation.
2. **Twin Server Files Parity:** Per `AGENTS.md`, any future backend code modifications to `artifacts/api-server/demo-server.mjs` must be synchronized to `scripts/demo-server.mjs`.
3. **Alternative Brand Preferences:** The mapping proposes the dominant market leader for each SKU (e.g. Toddynho for Achocolatado, Heineken for Cerveja Long Neck, Pringles for Batata). The Preview Gallery UI design includes alternative brand selection (e.g., Nescau, Stella Artois, Ruffles) so the hotel administrator can easily swap brands according to supplier agreements.
4. **Courtesy Item SKU Separation:** Requisite R3 introduces Amendoim Mendorato and Água Copo as courtesy items. Whether they are added as new SKUs (`prod_cortesia_amendoim_mendorato`) or reuse existing catalog items with `isCourtesy: true` must be coordinated with the backend investigator for Requirements R3–R6.

---

## 4. Conclusion

1. **Full Catalog & Brand Mapping Complete:**
   All 18 minibar products + 2 courtesy items have been cataloged with their exact IDs, prices, current image flaws, proposed real commercial brands, official packaging volumes, and manufacturers (see Section 4 of `survey_report.md`).
2. **Standardized Photographic Blueprint Established:**
   - Aspect ratio: 1:1 Square (1024x1024 px PNG).
   - Canvas isolation: Pure white `#FFFFFF` (RGB 255, 255, 255) with soft ambient contact shadow beneath base.
   - Framing: Product occupies 75%–80% of canvas height/width with 10%–12% margin padding.
   - Angle: Frontal 10°–15° elevated perspective capturing both branding and top seal/cap.
   - Lighting: 5500K balanced daylight studio lighting.
3. **Validation Panel (R2) UI Architecture Defined:**
   A dedicated sub-view `galeria_marcas` within `<TabsContent value="catalogo">` in `minibar-admin.tsx`, featuring side-by-side legacy vs proposed comparisons, high-resolution zoom modals, brand replacement selectors, and batch/individual approval mechanisms.
4. **Backend Guard Identified:**
   The `length !== 18` guard in `artifacts/api-server/demo-server.mjs` (lines 11169 & 11434) has been documented with an explicit recommendation for backend adjustments.

---

## 5. Verification Method

To independently verify the findings in this report:

1. **Inspect Existing Image Files & Dimensions:**
   ```powershell
   $dir = "artifacts\limpeza\public\images\frigobar"
   Get-ChildItem -Path $dir | Select-Object Name, Length
   ```
2. **Inspect Current Generic Artwork:**
   Use `view_file` to inspect `refrigerante.png`, `batata.png`, `achocolatado.png`, and `chocolate_kinder_bueno.png` to confirm the generic/fictional AI artwork and unpackaged wafer.
3. **Verify Backend Schema & Length Guards:**
   ```powershell
   Select-String -Path "artifacts\api-server\demo-server.mjs" -Pattern "length !== 18" | Select-Object LineNumber, Line
   ```
4. **Verify Frontend Catalog Tabs & Sub-views:**
   Inspect lines 1086–1107 and 1728–1768 in `artifacts\limpeza\src\pages\minibar-admin.tsx`.
5. **Inspect Detailed Survey Report:**
   Read the full technical specification in `.agents/teamwork/survey_explorer_1/survey_report.md`.
