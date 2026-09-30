# Handoff Report — Explorer 3: Integrations Survey (R6 & R7)

**Type:** Hard Handoff  
**Agent:** Explorer 3 (Integrations Survey Explorer)  
**Date:** 2026-09-30  
**Target Audience:** Parent Orchestrator & Implementers for Milestones M1 and M4  

---

## 1. Observation

1. **Maid Dashboard Flat Card (`artifacts/limpeza/src/components/flat-card.tsx`):**
   - Flat status is calculated at line 393: `const currentStatus: FlatStatus = (request?.status as FlatStatus) || "dirty"`.
   - Badges are rendered in a horizontal flex container at lines 1061–1126 (`<div className="flex flex-wrap items-center gap-1.5">`), currently showing status label, remuneration (admin only), previous day pending, check-in today/tomorrow, and elapsed cleaning time.
   - Action buttons are rendered at lines 1315–1568:
     - In `currentStatus === "dirty"`: Admin sees `"Vou Limpar"` (line 1330) and `"Marcar Limpo"` (line 1344); Maid sees `"Vou Limpar"` (line 1355).
     - In `currentStatus === "will_clean"`: Admin and Maid see `"Iniciar"` with `Sparkles` icon (line 1375).
     - Selection for batch cleaning checkbox is rendered at lines 945–958: `selectable && currentStatus === "dirty" && !isAssignedToOther && !isInstruction`.
   - Radix Tooltip components (`Tooltip`, `TooltipTrigger`, `TooltipContent`) are already created in `artifacts/limpeza/src/components/ui/tooltip.tsx` and wrapped globally with `TooltipProvider` in `artifacts/limpeza/src/App.tsx` (lines 386–393).

2. **Dashboard Data Source (`artifacts/limpeza/src/pages/dashboard.tsx`):**
   - Cards in the Maid Dashboard are populated at lines 87–90 and 609–630 using `useListCheckouts({ date: selectedDateStr })`, which fetches `GET /api/reservations/checkouts`.
   - In `artifacts/api-server/demo-server.mjs`, `GET /api/reservations/checkouts` starts at line 6107 and maps flats at lines 6114–6345. It currently does not include `serviceInProgress`.

3. **PMS Calendar Architecture & Blocks (`artifacts/limpeza/src/pages/pms-calendar.tsx`):**
   - Time range: `timelineStart = subDays(new Date(), 30)` to `timelineEnd = addDays(new Date(), 90)` (lines 1416–1418).
   - Horizontal coordinate layout: `dayLayoutMap` maps each date to `{ left, width, idx }` (lines 1433–1443).
   - Block coordinate calculation: `getBlockPosition(startDate, endDate)` (lines 1497–1525) determines `left` and `width` in pixels.
   - Data loading: `fetchData()` (lines 1555–1607) calls `GET /api/pms/calendar?startDate=...&endDate=...`.
   - Server data: `demo-server.mjs` line 9234–9249 returns `blocks: (db.roomBlocks || []).filter(...)`.
   - Visual Block Rendering: Lines 3848–3886 loop over `flatBlocks = data.blocks.filter(...)` and render absolute positioned bars with `Lock` icon and notes.
   - Reservation Creation Flow: Triggered via mouse drag (`handleStartDrag` -> `handleOpenNewResRange`, lines 1936–1962), touch (`mobileRangeStart` -> `handleOpenNewResRange`, lines 1980–1995), or button click (`handleOpenNewRes`, lines 2010–2050). All three open `Dialog open={resModalOpen}` (line 4072) and submit via `handleSaveRes` (line 2658).
   - Collision Check on Drag: Line 1184 checks `hasBlockConflict = data.blocks.some(...)` and strictly blocks movement at line 1190 with `alert(...)`.

---

## 2. Logic Chain

1. **R6 Requirement Logic:**
   - The user requested: display `"🔧 Serviço em andamento"` when `flat.serviceInProgress` is present and disable the button to start cleaning with an explanatory tooltip.
   - Because `dashboard.tsx` uses `useListCheckouts` to populate flats, if `serviceInProgress` is only placed on `GET /api/flats`, the Maid Dashboard cards will not receive `flat.serviceInProgress`.
   - Therefore, `serviceInProgress: { serviceTitle, workerName, serviceOrderId } | null` must be computed in both `GET /api/flats` (line 5189) and `GET /api/reservations/checkouts` (line 6107) in `demo-server.mjs`.
   - In `flat-card.tsx`, checking `flat.serviceInProgress` allows conditionally rendering the badge at line 1062, adding the alert card at line 1278, and rendering the disabled button wrapped in `<Tooltip>` at lines 1325–1371 and 1373–1406. Checkbox selection at line 945 must also require `!flat.serviceInProgress`.

2. **R7 Requirement Logic:**
   - The user requested: if flat has an active service with `estimatedFinishAt`, display blocked period with badge `"🔧 [Título do Serviço]"`; the block must be visual (admin can override), with a warning when attempting to create a reservation.
   - In `pms-calendar.tsx`, any block inside `data.blocks` is already positioned correctly on the multi-day timeline via `getBlockPosition`.
   - By synthesizing service blocks in `GET /api/pms/calendar` (lines 9234–9249 in `demo-server.mjs`) with `isServiceBlock: true`, `reason: "service_order"`, `startDate`, `endDate: estimatedFinishAt.slice(0, 10)`, `serviceTitle`, and `workerName`, the front-end receives them without schema friction.
   - In `pms-calendar.tsx` (lines 3848–3886), checking `blockItem.isServiceBlock` allows displaying the amber badge `"🔧 [Título do Serviço]"` and hiding the deletion trash icon.
   - In `resModalOpen` (line 4250), calculating `activeServiceBlockConflict` via date intersection displays a high-visibility warning banner. In `handleSaveRes` (line 2658), adding a `confirm()` prompt allows the administrator to override the visual block and proceed with saving.
   - In `hasBlockConflict` (line 1184), allowing service blocks to prompt for override rather than calling `alert()` prevents breaking drag-and-drop flexibility for admins.

---

## 3. Caveats

- **Time vs Date granularity in calendar:** `estimatedFinishAt` is an ISO timestamp (e.g. `2026-10-01T17:00:00Z`). The PMS calendar grid operates on full day columns. Slicing the date (`slice(0, 10)`) accurately blocks the day or span of days.
- **Assumed Service Order Structure:** Based on R1 and R2, active services reside in `db.serviceOrders` where `order.status === "active"` and `flat.status === "in_progress"`.
- **Offline / Caching:** The PMS calendar polls every ~30s or on window focus. When a service worker starts a service in the public portal, the calendar and maid dashboard will reflect the block on the next poll cycle or when manually refreshed.

---

## 4. Conclusion

1. **For R6 (Maid Dashboard Flat Card):**
   - The integration point is in `artifacts/limpeza/src/components/flat-card.tsx` at badge row (line 1062), card body (line 1278), and action button container (lines 1325–1371).
   - Crucial dependency: `artifacts/api-server/demo-server.mjs` must supply `serviceInProgress` in both `GET /api/flats` and `GET /api/reservations/checkouts`.
2. **For R7 (PMS Calendar):**
   - The integration point is in `artifacts/limpeza/src/pages/pms-calendar.tsx` at block bar rendering (lines 3848–3886), modal warning banner (line 4250), save confirmation (line 2658), and drag-collision check (line 1184).
   - Crucial dependency: `artifacts/api-server/demo-server.mjs` `GET /api/pms/calendar` must synthesize active service orders into `data.blocks` with `isServiceBlock: true`.

---

## 5. Verification Method

1. **Source Inspection:**
   - Inspect `analysis.md` in this directory for line-by-line recipes and proposed diffs.
   - Verify that `flat-card.tsx` imports `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`.
   - Verify that `pms-calendar.tsx` contains the `isServiceBlock` branch in `flatBlocks.map` and the `activeServiceBlockConflict` check in `handleSaveRes`.

2. **Build Verification (per AGENTS.md):**
   - Run: `cd "artifacts/limpeza" && npm run build`
   - Ensure zero TypeScript compiler errors or bundle breakages.

3. **Runtime Invalidation Conditions:**
   - If `GET /api/reservations/checkouts` does not return `serviceInProgress`, the maid card will remain in normal dirty mode without disabling the button.
   - If `GET /api/pms/calendar` does not include service orders in `data.blocks`, the PMS calendar will not render the visual badge or trigger the booking conflict warning.
