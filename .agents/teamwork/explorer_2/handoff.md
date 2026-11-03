# Handoff Report: Prioridade 2 — Frontend UI Performance in PMS Components

- **Date**: 2026-11-02T23:26:00Z
- **Author**: Teamwork Explorer 2 (`explorer_2`)
- **Target Audience**: Orchestrator & Worker Agent
- **Topic**: Dynamic Mounting of `<PmsCalendar modalOnly />` in `floating-new-reservation.tsx` & Polling / Computation Optimization in `pms-calendar.tsx`

---

## 1. Observation

### 1.1. Root Cause of Unconditional Mount in `floating-new-reservation.tsx`
- **File**: `artifacts/limpeza/src/components/floating-new-reservation.tsx`
- **Lines 5 & 208–210**:
  ```tsx
  5: import PmsCalendar from '@/pages/pms-calendar';
  ...
  208:     <>
  209:       {/* Monta os modais do PMS silenciosamente quando o admin está fora da tela /reservas */}
  210:       {!isOnReservationsPage && <PmsCalendar modalOnly />}
  ```
- **File**: `artifacts/limpeza/src/App.tsx` (Lines 11 & 607):
  ```tsx
  11: import { FloatingNewReservationButton } from '@/components/floating-new-reservation';
  ...
  607:            <FloatingNewReservationButton />
  ```
- **Observed Behavior**:
  1. `FloatingNewReservationButton` is rendered globally on all authenticated pages (outside `/login`) for Admin and Dev users.
  2. Because of static `import PmsCalendar from '@/pages/pms-calendar'`, the entire 687 KB (12,497 lines) of `pms-calendar.tsx` is bundled into the main chunk and imported immediately on page startup.
  3. Whenever `!isOnReservationsPage` (i.e. on Dashboard `/`, Limpeza `/limpeza`, Manutenção `/manutencao`, WhatsApp Chat `/chat`, etc.), `<PmsCalendar modalOnly />` is mounted directly in the React DOM tree, even when the modal is closed and the user has not clicked "+ Nova Reserva".
  4. The component listens to `gfm-res-modal-state` (lines 98–105) to track `isResModalOpen`, but never unmounts `<PmsCalendar modalOnly />` when closed.

### 1.2. Unconditional Network Fetch Storm on Mount in `pms-calendar.tsx`
- **File**: `artifacts/limpeza/src/pages/pms-calendar.tsx`
- **Lines 2015–2021**:
  ```tsx
  2015:   useEffect(() => {
  2016:     if (modalOnly) {
  2017:       const t = setTimeout(() => fetchData(false), 600);
  2018:       return () => clearTimeout(t);
  2019:     }
  2020:     fetchData(true);
  2021:   }, [modalOnly]);
  ```
- **Lines 1956–2005 (`fetchData`) & Lines 941–951**:
  - Exactly 600ms after mounting on ANY page, `<PmsCalendar modalOnly />` unconditionally calls `fetchData(false)`.
  - `fetchData(false)` triggers requests to:
    - `GET /api/pms/calendar?startDate=...&endDate=...&_t=...`
    - `GET /api/pms/companies`
    - `GET /api/pms/agencies`
    - `GET /api/pms/guests`
    - `GET /api/finance/payment-methods`
    - `GET /api/breakfast/orders?date=today`
    - `GET /api/breakfast/orders?date=tomorrow`
    - `GET /api/pms/fair-share...`
  - In addition, lines 941–951 trigger `GET /api/pms/amenities/essential-tags` on mount.
- **Observed Impact**: An administrator visiting `/` or `/limpeza` immediately fires 8+ heavy backend requests in the background, saturating Node.js and PostgreSQL connection pools.

### 1.3. Heavy Computations Running Unconditionally in `pms-calendar.tsx`
- **File**: `artifacts/limpeza/src/pages/pms-calendar.tsx`
- **Lines 1809–1836 (Timeline Layout)**:
  ```tsx
  1809:   const timelineStart = subDays(new Date(), 30)
  1810:   const timelineEnd = addDays(new Date(), 90)
  1811:   const daysInView = eachDayOfInterval({ start: timelineStart, end: timelineEnd })
  1819:   const gridTemplateColumns = `${FLAT_COL_WIDTH}px ${daysInView.map(day => `${getDayColWidth(day)}px`).join(" ")}`
  1820:   const totalGridMinWidth = FLAT_COL_WIDTH + daysInView.reduce((acc, day) => acc + getDayColWidth(day), 0)
  1822:   const timelineStartStr = format(daysInView[0], "yyyy-MM-dd")
  1823:   const timelineEndStr = format(daysInView[daysInView.length - 1], "yyyy-MM-dd")
  1826:   const dayLayoutMap = useMemo(() => { ... }, [daysInView])
  ```
- **Lines 4650–4709 (Flats & Reservations Filters)**:
  - `reservationsTodayWithBf` and `reservationsTomorrowWithBf` (filtering all reservations).
  - `dirtyFlatsCount` and `cleanFlatsCount` (filtering all flats).
  - `minorReservationsCount` and `riskAttentionCount` (filtering reservations with nested guest lookup).
  - `displayedFlats` (iterating over all flats with nested `.some()` loops across all reservations).
- **Observed Impact**: When `modalOnly` is true, lines 4720–5800 hide the entire calendar timeline grid and filter controls (`{!modalOnly && (...)`). None of these values are ever rendered, but they execute repeatedly on every render cycle of `PmsCalendar`.

### 1.4. Polling Mechanism & Tab Visibility in `pms-calendar.tsx`
- **File**: `artifacts/limpeza/src/pages/pms-calendar.tsx`
- **Lines 2217–2268**:
  ```tsx
  2218:   useEffect(() => {
  2219:     if (modalOnly) return;
  2220:     const doSilentSync = () => {
  2221:       if (typeof document !== "undefined" && document.hidden) return;
  2222:       if (resDragStateRef.current) return;
  2223:       if (isDraggingRef.current) return;
  2224:       if (isAnyModalOpenRef.current) return;
  2225: 
  2226:       fetchData(false);
  2227:     };
  2228: 
  2229:     const intervalId = setInterval(doSilentSync, 4000);
  ...
  2268:   }, []);
  ```
- **Observed Defects**:
  1. Polling interval is hardcoded to 4000ms (4 seconds).
  2. While `doSilentSync` returns early when `document.hidden` is true, the `setInterval` timer is NEVER stopped or cleared. JavaScript keeps waking the event loop every 4s.
  3. The dependency array `[]` at line 2268 omits `modalOnly`.
  4. Tooltip at line 4740 still states `sincronização automática em tempo real a cada 4s`.

---

## 2. Logic Chain & Recommended Strategy

### Step 1: Code-Splitting and On-Demand Mounting in `floating-new-reservation.tsx`
- **Logic**:
  1. When on `/reservas`, `PmsCalendar` is already mounted as the main page route. `FloatingNewReservationButton` does not need to mount anything; clicking the button merely dispatches `window.dispatchEvent(new CustomEvent('open-new-reservation-modal'))`.
  2. When outside `/reservas`, `<PmsCalendar />` should NOT be rendered while closed.
  3. Replace the static import with `React.lazy`:
     `const PmsCalendarLazy = React.lazy(() => import('@/pages/pms-calendar'));`
     This removes 687 KB of source code from the main bundle on all other pages.
  4. Add state `const [isModalMounted, setIsModalMounted] = useState(false);`.
  5. In `handleTriggerNewReservation`:
     - If `isOnReservationsPage`: dispatch `'open-new-reservation-modal'`.
     - If `!isOnReservationsPage`: `setIsModalMounted(true)` and dispatch `'open-new-reservation-modal'`.
  6. In `handleModalState`:
     - When `customEvent.detail.open === true`: `setIsResModalOpen(true)`, `setIsModalMounted(true)`.
     - When `customEvent.detail.open === false`: `setIsResModalOpen(false)`. Set a 300ms timeout (`setTimeout(() => setIsModalMounted(false), 300)`) so the Radix Dialog fade-out animation completes smoothly before the component is completely unmounted.
  7. Render:
     ```tsx
     {!isOnReservationsPage && isModalMounted && (
       <Suspense fallback={null}>
         <PmsCalendarLazy modalOnly autoOpenNewRes />
       </Suspense>
     )}
     ```

### Step 2: Auto-Open & Fetch Deactivation in `pms-calendar.tsx`
- **Logic**:
  1. Accept `autoOpenNewRes?: boolean` in `PmsCalendar(props?: { modalOnly?: boolean; autoOpenNewRes?: boolean; ... })`.
  2. In the mount effect (lines 2015–2021):
     ```tsx
     useEffect(() => {
       if (modalOnly) {
         if (autoOpenNewRes) {
           handleOpenNewResRef.current();
           fetchData(false);
         } else if (resModalOpen) {
           fetchData(false);
         }
         return;
       }
       fetchData(true);
     }, [modalOnly, autoOpenNewRes]);
     ```
  3. If `modalOnly` is true and `!autoOpenNewRes` and `!resModalOpen`:
     NO network calls run. Zero data fetching on mount.
  4. Skip `fetch("/api/pms/amenities/essential-tags")` at line 941 when `modalOnly` is true:
     `if (modalOnly) return;`.

### Step 3: Deactivating Heavy Layout & Filter Computations when `modalOnly`
- **Logic**:
  1. Wrap `daysInView`, `gridTemplateColumns`, `totalGridMinWidth`, and `dayLayoutMap` in `useMemo` with an early exit if `modalOnly` is true:
     - `daysInView`: returns `[]` when `modalOnly`.
     - `gridTemplateColumns`: returns `""` when `modalOnly`.
     - `totalGridMinWidth`: returns `0` when `modalOnly`.
     - `timelineStartStr` / `timelineEndStr`: returns `""` when `modalOnly || daysInView.length === 0`.
     - `dayLayoutMap`: returns `{}` when `modalOnly`.
  2. Memoize header metrics (`reservationsTodayWithBf`, `reservationsTomorrowWithBf`, `dirtyFlatsCount`, `cleanFlatsCount`, `minorReservationsCount`, `riskAttentionCount`, `displayedFlats`) with `useMemo` and return empty/0 if `modalOnly` is true.

### Step 4: 12s Polling and Tab Visibility Pausing in `pms-calendar.tsx`
- **Logic**:
  1. Update polling interval from 4,000ms to 12,000ms (within the 10s–15s requirement). This reduces background requests by 67%.
  2. Introduce active timer management (`startPolling()` and `stopPolling()`):
     ```tsx
     let pollIntervalId: ReturnType<typeof setInterval> | null = null;
     const startPolling = () => {
       if (pollIntervalId) clearInterval(pollIntervalId);
       pollIntervalId = setInterval(doSilentSync, 12000);
     };
     const stopPolling = () => {
       if (pollIntervalId) {
         clearInterval(pollIntervalId);
         pollIntervalId = null;
       }
     };
     ```
  3. Start polling ONLY when the tab is visible:
     `if (typeof document === "undefined" || !document.hidden) startPolling();`
  4. In `handleVisibilityChange`:
     - When `document.hidden === true`: call `stopPolling()`. The timer is cleared completely.
     - When `document.hidden === false`: call `doSilentSync()` immediately and `startPolling()`.
  5. Include `modalOnly` in the `useEffect` dependencies: `[modalOnly]`.
  6. Update tooltip at line 4740 to:
     `title="Sincronizar dados agora (sincronização automática em tempo real a cada 12s)"`.

---

## 3. Concrete Code Changes (For Worker)

### Modification A: `artifacts/limpeza/src/components/floating-new-reservation.tsx`

```diff
--- a/artifacts/limpeza/src/components/floating-new-reservation.tsx
+++ b/artifacts/limpeza/src/components/floating-new-reservation.tsx
@@ -1,6 +1,8 @@
-import React, { useState, useEffect, useRef, useCallback } from 'react';
+import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
 import { useLocation } from 'wouter';
 import { useGetMe } from '@workspace/api-client-react';
 import { Plus, GripVertical, CalendarPlus, Minimize2, Maximize2 } from 'lucide-react';
-import PmsCalendar from '@/pages/pms-calendar';
+
+const PmsCalendarLazy = lazy(() => import('@/pages/pms-calendar'));
 
@@ -65,2 +67,4 @@
   const [isResModalOpen, setIsResModalOpen] = useState(false);
+  const [isModalMounted, setIsModalMounted] = useState(false);
+  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 
@@ -98,6 +102,19 @@
     const handleModalState = (e: Event) => {
       const customEvent = e as CustomEvent<{ open: boolean }>;
       if (customEvent.detail && typeof customEvent.detail.open === 'boolean') {
-        setIsResModalOpen(customEvent.detail.open);
+        const isOpen = customEvent.detail.open;
+        setIsResModalOpen(isOpen);
+        if (isOpen) {
+          if (unmountTimerRef.current) {
+            clearTimeout(unmountTimerRef.current);
+            unmountTimerRef.current = null;
+          }
+          setIsModalMounted(true);
+        } else {
+          if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
+          unmountTimerRef.current = setTimeout(() => {
+            setIsModalMounted(false);
+            unmountTimerRef.current = null;
+          }, 300);
+        }
       }
     };
     window.addEventListener('gfm-res-modal-state', handleModalState);
-    return () => window.removeEventListener('gfm-res-modal-state', handleModalState);
+    return () => {
+      window.removeEventListener('gfm-res-modal-state', handleModalState);
+      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
+    };
   }, []);
 
@@ -192,3 +209,7 @@
     if (hasMovedRef.current) return;
+    if (isOnReservationsPage) {
+      window.dispatchEvent(new CustomEvent('open-new-reservation-modal'));
+    } else {
+      setIsModalMounted(true);
+      window.dispatchEvent(new CustomEvent('open-new-reservation-modal'));
+    }
-    window.dispatchEvent(new CustomEvent('open-new-reservation-modal'));
   };
 
@@ -209,3 +230,7 @@
-      {/* Monta os modais do PMS silenciosamente quando o admin está fora da tela /reservas */}
-      {!isOnReservationsPage && <PmsCalendar modalOnly />}
+      {/* Monta os modais do PMS sob demanda apenas quando o usuário solicita abertura fora de /reservas */}
+      {!isOnReservationsPage && isModalMounted && (
+        <Suspense fallback={null}>
+          <PmsCalendarLazy modalOnly autoOpenNewRes />
+        </Suspense>
+      )}
```

---

### Modification B: `artifacts/limpeza/src/pages/pms-calendar.tsx`

#### 1. Props Definition (Line 227–228)
```tsx
export default function PmsCalendar(props?: { modalOnly?: boolean; autoOpenNewRes?: boolean; [key: string]: any }) {
  const modalOnly = Boolean(props?.modalOnly)
  const autoOpenNewRes = Boolean(props?.autoOpenNewRes)
```

#### 2. Essential Tags fetch (Line 941–951)
```tsx
  useEffect(() => {
    if (modalOnly) return;
    fetch("/api/pms/amenities/essential-tags")
      .then(r => r.json())
      .then(d => {
        if (d.essentialTagIds && Array.isArray(d.essentialTagIds)) {
          setEssentialTagIds(d.essentialTagIds);
          localStorage.setItem("gfm_essential_tags", JSON.stringify(d.essentialTagIds));
        }
      })
      .catch(() => {});
  }, [modalOnly]);
```

#### 3. Timeline Heavy Computations (Lines 1809–1836)
```tsx
  // Timeline Contínua Multi-Mês (desativada quando modalOnly para evitar overhead pesado)
  const timelineStart = useMemo(() => modalOnly ? new Date() : subDays(new Date(), 30), [modalOnly])
  const timelineEnd = useMemo(() => modalOnly ? new Date() : addDays(new Date(), 90), [modalOnly])
  const daysInView = useMemo(() => {
    if (modalOnly) return []
    return eachDayOfInterval({ start: timelineStart, end: timelineEnd })
  }, [modalOnly, timelineStart, timelineEnd])

  // Configuração de larguras das colunas da agenda
  const EXPANDED_COL_WIDTH = 100 // Coluna de 100px no dia atual e dia anterior
  const NORMAL_COL_WIDTH = 48    // Largura padrão dos demais dias
  const FLAT_COL_WIDTH = 145     // Largura da coluna fixa de apartamentos

  const getDayColWidth = (day: Date) => (isToday(day) || isYesterday(day) ? EXPANDED_COL_WIDTH : NORMAL_COL_WIDTH)
  const gridTemplateColumns = useMemo(() => {
    if (modalOnly || daysInView.length === 0) return ""
    return `${FLAT_COL_WIDTH}px ${daysInView.map(day => `${getDayColWidth(day)}px`).join(" ")}`
  }, [modalOnly, daysInView])
  const totalGridMinWidth = useMemo(() => {
    if (modalOnly || daysInView.length === 0) return 0
    return FLAT_COL_WIDTH + daysInView.reduce((acc, day) => acc + getDayColWidth(day), 0)
  }, [modalOnly, daysInView])

  const timelineStartStr = modalOnly || daysInView.length === 0 ? "" : format(daysInView[0], "yyyy-MM-dd")
  const timelineEndStr = modalOnly || daysInView.length === 0 ? "" : format(daysInView[daysInView.length - 1], "yyyy-MM-dd")

  // Mapa cumulativo de posições horizontais (left e width) de cada dia na linha
  const dayLayoutMap = useMemo(() => {
    if (modalOnly || daysInView.length === 0) return {}
    const map: Record<string, { left: number; width: number; idx: number }> = {}
    let currentLeft = FLAT_COL_WIDTH
    daysInView.forEach((day, idx) => {
      const dayStr = format(day, "yyyy-MM-dd")
      const width = getDayColWidth(day)
      map[dayStr] = { left: currentLeft, width, idx }
      currentLeft += width
    })
    return map
  }, [modalOnly, daysInView])
```

#### 4. Initial Fetch Effect (Lines 2015–2021)
```tsx
  useEffect(() => {
    if (modalOnly) {
      if (autoOpenNewRes) {
        handleOpenNewResRef.current();
        fetchData(false);
      } else if (resModalOpen) {
        fetchData(false);
      }
      return;
    }
    fetchData(true);
  }, [modalOnly, autoOpenNewRes]);
```

#### 5. Polling and Visibility Handling (Lines 2217–2268)
```tsx
  // Sincronização em tempo real entre múltiplos dispositivos (PC, Tablet, Celular)
  // Desativado completamente se modalOnly. Polling reduzido de 4s para 12s e pausado quando a aba estiver oculta.
  useEffect(() => {
    if (modalOnly) return;
    const doSilentSync = () => {
      // Se a aba estiver oculta/minimizada, não executa o poll para economizar recursos
      if (typeof document !== "undefined" && document.hidden) return;
      // Não atualiza se o usuário estiver ativamente arrastando/redimensionando reserva
      if (resDragStateRef.current) return;
      // Não atualiza se estiver selecionando período com arrasto
      if (isDraggingRef.current) return;
      // Não atualiza se algum modal de formulário/edição estiver aberto
      if (isAnyModalOpenRef.current) return;

      fetchData(false);
    };

    let pollIntervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
      // Reduz frequência de polling de 4s para 12s (intervalo de 10s–15s)
      pollIntervalId = setInterval(doSilentSync, 12000);
    };

    const stopPolling = () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };

    // Inicia polling caso a aba esteja visível
    if (typeof document === "undefined" || !document.hidden) {
      startPolling();
    }

    // 2. Pausa o polling quando a aba estiver oculta e retoma/sincroniza imediatamente ao focar
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.hidden) {
        stopPolling();
      } else {
        doSilentSync();
        startPolling();
      }
    };
    const handleFocus = () => {
      doSilentSync();
      startPolling();
    };
    const handlePageShow = () => {
      doSilentSync();
      startPolling();
    };

    // 3. Sincronização instantânea entre abas no mesmo computador via StorageEvent
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pms_calendar_sync_trigger") {
        doSilentSync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [modalOnly]);
```

#### 6. Memoized Filters & Metrics (Lines 4650–4709)
```tsx
  const reservationsTodayWithBf = useMemo(() => {
    if (modalOnly) return []
    return data.reservations.filter(r => 
      r.status !== "cancelada" && 
      r.checkinDate <= todayStr && 
      r.checkoutDate >= todayStr && 
      Boolean(r.includeBreakfast || r.hasBreakfast)
    )
  }, [modalOnly, data.reservations, todayStr])
  const todayReservationsWithBfCount = reservationsTodayWithBf.length
  const todayBreakfastOrdersCount = breakfastStats !== null ? breakfastStats.todayOrders : 0

  const reservationsTomorrowWithBf = useMemo(() => {
    if (modalOnly) return []
    return data.reservations.filter(r => 
      r.status !== "cancelada" && 
      r.checkinDate <= tomorrowStr && 
      r.checkoutDate >= tomorrowStr && 
      Boolean(r.includeBreakfast || r.hasBreakfast)
    )
  }, [modalOnly, data.reservations, tomorrowStr])
  const tomorrowReservationsWithBfCount = reservationsTomorrowWithBf.length
  const tomorrowBreakfastOrdersCount = breakfastStats !== null ? breakfastStats.tomorrowOrders : 0

  // Regra das 09:00 para o Café da Manhã: até 08:59 foca em HOJE; a partir das 09:00 foca em AMANHÃ
  const brasiliaHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()))
  const isAfter9Am = brasiliaHour >= 9

  // Contagem e filtro de quartos sujos vs. limpos (desativados quando modalOnly)
  const dirtyFlatsCount = useMemo(() => {
    if (modalOnly) return 0
    return data.flats.filter(f => (f as any).cleaningStatus === "dirty" || (f as any).cleaningStatus === "cleaning_now").length
  }, [modalOnly, data.flats])

  const cleanFlatsCount = useMemo(() => {
    if (modalOnly) return 0
    return data.flats.filter(f => (f as any).cleaningStatus === "clean" || !(f as any).cleaningStatus).length
  }, [modalOnly, data.flats])

  // Contagem de reservas com menores de idade e com alerta de atenção (< 30a locais)
  const minorReservationsCount = useMemo(() => {
    if (modalOnly) return 0
    return data.reservations.filter(r => r.status !== "cancelada" && r.hasMinor).length
  }, [modalOnly, data.reservations])

  const riskAttentionCount = useMemo(() => {
    if (modalOnly) return 0
    return data.reservations.filter(r => {
      if (r.status === "cancelada") return false
      const matched = data.guests.find(g => g.id === r.guestId)
      return isResCamposResident(r, matched)
    }).length
  }, [modalOnly, data.reservations, data.guests])

  const displayedFlats = useMemo(() => {
    if (modalOnly) return []
    return data.flats.filter(f => {
      if (cleaningFilter === "dirty") {
        if (!((f as any).cleaningStatus === "dirty" || (f as any).cleaningStatus === "cleaning_now")) return false
      } else if (cleaningFilter === "clean") {
        if (!((f as any).cleaningStatus === "clean" || !(f as any).cleaningStatus)) return false
      }

      if (specialFilter === "minors") {
        const hasMinorInFlat = data.reservations.some(r => 
          (r.flatId === f.id || String(r.flatNumber) === String(f.number)) &&
          r.status !== "cancelada" &&
          r.hasMinor
        )
        if (!hasMinorInFlat) return false
      } else if (specialFilter === "risk") {
        const hasRiskInFlat = data.reservations.some(r => 
          (r.flatId === f.id || String(r.flatNumber) === String(f.number)) &&
          r.status !== "cancelada" &&
          isResCamposResident(r, data.guests.find(g => g.id === r.guestId))
        )
        if (!hasRiskInFlat) return false
      }

      return true
    })
  }, [modalOnly, data.flats, data.reservations, data.guests, cleaningFilter, specialFilter])
```

#### 7. Tooltip update (Line 4740)
```tsx
title="Sincronizar dados agora (sincronização automática em tempo real a cada 12s)"
```

---

## 4. Caveats

1. **Radix Dialog Exit Animation**: Unmounting immediately on `open === false` would cut off the smooth fade-out / zoom-out exit transition of the dialog. A 300ms timeout preserves the native UI feel before removing the DOM elements.
2. **First-Time Chunk Download**: When a user clicks "+ Nova Reserva" from another screen for the very first time in their browser session, there is a sub-second network download for the `pms-calendar` lazy chunk. Because `autoOpenNewRes` is passed as a prop, once the chunk mounts, it immediately opens the modal without requiring a second click. Subsequent clicks in the same session open instantaneously as Vite caches the chunk.
3. **No Breaking Changes on `/reservas`**: On the main `/reservas` route, `isOnReservationsPage` is true, so `floating-new-reservation.tsx` does not mount `PmsCalendarLazy`. The main page component handles its own display and modal states exactly as before, with the enhanced 12s polling and tab visibility pause.

---

## 5. Conclusion

1. `<PmsCalendar modalOnly />` was previously mounted continuously across all authenticated pages, generating an initial burst of 8+ backend requests and continuous re-render CPU overhead even though the modal was closed.
2. Replacing static import with `React.lazy` and mounting `<PmsCalendarLazy modalOnly autoOpenNewRes />` strictly when `isModalMounted` is true completely eliminates this burden on non-reservations routes.
3. In `pms-calendar.tsx`, polling is reduced from 4s to 12s (within the 10s–15s requirement) and completely halted via `clearInterval` when the tab is hidden (`document.hidden`), resuming with an immediate sync when the tab is refocused.
4. Heavy calendar computations (`daysInView`, `gridTemplateColumns`, `displayedFlats`, and filter counters) are deactivated when `modalOnly` is true.

---

## 6. Verification Method

To verify the implementation without running forbidden global test suites:
1. **Build Verification**:
   ```powershell
   Set-Location "c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\limpeza"
   npm run build
   ```
   Confirm build finishes with exit code 0 and outputs chunked assets in `dist/`.
2. **Bundle Chunking Check**:
   Inspect `artifacts/limpeza/dist/assets/` to verify that `pms-calendar` is split into its own chunk and not bundled in `index.js`.
3. **Manual / Unit Verification**:
   - Verify that navigating to `/` or `/limpeza` does NOT trigger `/api/pms/calendar` in the network log.
   - Verify that clicking "+ Nova Reserva" dynamically loads and opens the reservation dialog.
   - Verify that closing the dialog unmounts the component after 300ms.
   - Verify that on `/reservas`, polling runs at 12s intervals and stops when `document.hidden` is true.
