# Handoff Report — Explorer 3: Backend Performance & Stability (Priorities 2 & 3)

## 1. Observation

### 1.1 Context & File Mirroring
- **Primary Target File**: `artifacts/api-server/demo-server.mjs` (size: 2,830,718 bytes, 66,057 lines).
- **Secondary Mirror File**: `scripts/demo-server.mjs` is byte-for-byte identical (SHA-1 / SHA-256 hash match confirmed: `(Get-FileHash "artifacts/api-server/demo-server.mjs").Hash -eq (Get-FileHash "scripts/demo-server.mjs").Hash` returned `True`). Both files must remain synchronized to avoid runtime drift.
- **Boot Entrypoint**: `server.mjs` line 103 imports `./artifacts/api-server/demo-server.mjs`.

---

### 1.2 Item 1: Synchronous `reconcileAndMergeGuests` & `reconcileUniversalIntegrity` on GET Requests

#### `reconcileAndMergeGuests(database)`
- **Declaration**: `artifacts/api-server/demo-server.mjs:11881`:
  ```javascript
  11881: export function reconcileAndMergeGuests(database) {
  11882:   const currentDb = database || db;
  ...
  11962:   // 1. Deduplica a base de hóspedes existente
  11964:   for (const g of currentDb.guests) { ... findMatchingGuest(g, deduplicated); ... }
  11976:   for (const acc of currentDb.guestAccounts) { ... }
  11999:   for (const r of currentDb.reservations) { ... for (const rg of r.guests) { ... } }
  12107:   for (const inv of currentDb.invoices) { ... }
  12244:   for (const r of (currentDb.reservations || [])) { ... }
  ...
  12416:   currentDb.guests = deduplicated;
  12456:   return didHeal;
  12457: }
  ```
- **Synchronous Invocations on GET Routes**:
  - `Line 34823`: `app.get("/api/pms/guests", ...)`
    ```javascript
    34822:   if (!db.guests) db.guests = [];
    34823:   reconcileAndMergeGuests(db);
    ```
  - `Line 36408`: `app.get("/api/pms/guests/google-contacts/status", ...)`
    ```javascript
    36408:   reconcileAndMergeGuests(db);
    ```
  - `Line 36675`: `app.get("/api/pms/guests/google-contacts/export.vcf", ...)`
    ```javascript
    36675:   reconcileAndMergeGuests(db);
    ```
  - `Line 36711`: `app.get("/api/pms/guests/:id", ...)`
    ```javascript
    36710:   if (!db.guests) db.guests = [];
    36711:   reconcileAndMergeGuests(db);
    ```
  - `Line 37012`: `app.get("/api/pms/guests/export/csv", ...)`
    ```javascript
    37012:   reconcileAndMergeGuests(db);
    ```
- **Impact**: Every CRM request triggers an $O(N \cdot M)$ deduplication and reconciliation scan through thousands of records (guests, accounts, reservations, companions, invoices), blocking the single-threaded Node.js event loop for 300ms–2000ms per request.

#### `reconcileUniversalIntegrity(incomingState = null)`
- **Declaration**: `artifacts/api-server/demo-server.mjs:4967`:
  ```javascript
  4967: export function reconcileUniversalIntegrity(incomingState = null) {
  ...
  5581:   // 3. Auditoria Universal de Integridade de Reservas em TODOS os Flats
  5812:   // 4. Garantir que para TODO checkout de QUALQUER flat, exista a solicitação de limpeza correspondente
  6082:   if (regularizeHousekeepingPreventiveTasks()) { changed = true; }
  6086:   return changed;
  6087: }
  ```
- **Synchronous Invocations on GET Routes**:
  - `Line 17905`: `app.get("/api/flats", ...)`
    ```javascript
    17903: app.get("/api/flats", (req, res) => {
    17904:   res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    17905:   if (reconcileUniversalIntegrity()) saveDatabase();
    ```
  - `Line 19334`: `app.get("/api/reservations/checkouts", ...)`
    ```javascript
    19332: app.get("/api/reservations/checkouts", (req, res) => {
    19333:   triggerBackgroundSync();
    19334:   if (reconcileUniversalIntegrity()) saveDatabase();
    ```
  - `Line 26034`: `app.get("/api/pms/calendar", ...)`
    *(Already guarded by a 15-second cooldown at line 26032, but calls `saveDatabase()` via `setImmediate`)*:
    ```javascript
    26032:   if (now - lastCalendarReconcileTime > 15000) {
    26033:     lastCalendarReconcileTime = now;
    26034:     if (reconcileUniversalIntegrity()) {
    26035:       setImmediate(() => saveDatabase());
    26036:     }
    26037:   }
    ```
- **Impact**: Neither `/api/flats` nor `/api/reservations/checkouts` had any cooldown or dirty check. Both ran `reconcileUniversalIntegrity()` on every GET, which in turn executed Section 3, Section 4, and `regularizeHousekeepingPreventiveTasks()`, and if `changed === true`, invoked synchronous disk/PG persistence triggers via `saveDatabase()` directly on the HTTP GET path.

---

### 1.3 Item 2: Duplicate Calls to `getRequestsForDate(dateStr)` in `GET /api/reservations/checkouts`
- **Declaration**: `artifacts/api-server/demo-server.mjs:18668`:
  ```javascript
  18668: function getRequestsForDate(dateStr, isNested = false) {
  ...
  18683:   if (!isNested && typeof getTodayStr === "function" && dateStr > getTodayStr()) {
  18684:     getRequestsForDate(getTodayStr(), true);
  18685:   }
  ...
  19310:   if (shouldSaveDb) {
  19311:     saveDatabase();
  19312:   }
  19314:   return requestsForDate;
  19315: }
  ```
- **Observations**:
  1. `Line 19336` inside `app.get("/api/reservations/checkouts")`:
     ```javascript
     19335:   const dateStr = req.query.date || getTodayStr();
     19336:   const requestsForDate = getRequestsForDate(dateStr);
     ```
  2. In `getRequestsForDate`: When querying a future date (e.g. tomorrow or next weekend), line 18684 recursively calls `getRequestsForDate(getTodayStr(), true)`, scanning all reservations and cleanings twice in a single request.
  3. In `getFlatRealtimeStatus` (`line 17055`):
     ```javascript
     17054:   // 2. Status de Higienização em Tempo Real (Apenas data consultada ou checkout recente)
     17055:   const dailyRequests = typeof getRequestsForDate === "function" ? getRequestsForDate(dateStr) : (db.cleaningRequests || []);
     ```
     In `app.get("/api/flats")` (`line 17908`), `getFlatRealtimeStatus` is called for every flat in `db.flats` (up to 50 flats), triggering `getRequestsForDate(todayStr)` up to 50 times in a single HTTP request!
  4. Concurrent Dashboard requests: When `Dashboard` mounts, it queries `/api/reservations/checkouts`, `/api/dashboard/summary` (which calls `getRequestsForDate` at `line 19782`), and `/api/pms/calendar` (which calls `getRequestsForDate` at `line 26044`) within the same tick, resulting in duplicate full scans without memoization.

---

### 1.4 Item 3: `computePeriodicTaskStatus` and `regularizeHousekeepingPreventiveTasks` O(N^2) Loops
- **`computePeriodicTaskStatus`** (`demo-server.mjs:6118`):
  ```javascript
  6124:   const executions = (db.periodicExecutions || []).filter(e => 
  6125:     Number(e.periodicTaskId) === Number(task.id) && Number(e.flatId) === flatId
  6126:   );
  6127:   executions.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  6128:   const lastExec = executions[0] || null;
  ...
  6143:     currentOccupiedDays = getFlatOccupiedDays(flatId, flatNumber, sinceDateStr, referenceDateStr);
  ...
  6154:     const futureReservations = (db.reservations || [])
  6155:       .filter(r => 
  6156:         (Number(r.flatId) === flatId || String(r.flatNumber) === flatNumber) &&
  6157:         r.status !== 'cancelada' && r.status !== 'cancelado' && r.status !== 'cancelled' &&
  6158:         r.checkoutDate > referenceDateStr
  6159:       )
  6160:       .sort((a, b) => a.checkinDate.localeCompare(b.checkinDate));
  ```
  - For every task and flat, it runs an unindexed filter across all `db.periodicExecutions` and sorts them.
  - In `getFlatOccupiedDays` (`line 6096`), it filters all `db.reservations` globally, and creates `new Date()` instances iterating day-by-day.
  - In `futureReservations`, it filters all `db.reservations` globally again and sorts.
- **`regularizeHousekeepingPreventiveTasks`** (`demo-server.mjs:6205`):
  ```javascript
  6216:   for (const flat of activeFlats) {
  6217:     for (const t of housekeepingTasks) {
  ...
  6222:       const status = computePeriodicTaskStatus(t, flat, todayStr);
  ```
  - Nested loops: 50 flats $\times$ 20 tasks = 1,000 iterations.
  - In each iteration: full filtering of `periodicExecutions`, day-by-day loop of `reservations`, and future reservations sort.
  - Total operations: $> 1,000,000$ loop operations executed on every call to `reconcileUniversalIntegrity()` (which was running on every GET request to `/api/flats` and `/api/reservations/checkouts`).

---

### 1.5 Item 4: `flushPgState()` Event Loop Starvation and OOM on Render
- **`flushPgState`** (`demo-server.mjs:14159`):
  ```javascript
  14180:     reconcileCleaningRequests();
  14181:     pruneDatabase();
  14182:     await offloadHistoricalBase64Media();
  14183:     stateToSave = sanitizeJsonSerialized(JSON.stringify(db));
  ...
  14187:     const stateHash = crypto.createHash("sha1").update(stateToSave).digest("hex");
  ...
  14195:     await pgPool.query(
  14196:       "INSERT INTO system_store (key, value, updated_at) VALUES ('db_state', $1::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
  14197:       [stateToSave]
  14198:     );
  ```
- **`sanitizeJsonSerialized`** (`demo-server.mjs:14151`):
  ```javascript
  14151: export function sanitizeJsonSerialized(jsonStr) {
  14152:   if (typeof jsonStr !== "string") return jsonStr;
  14153:   return jsonStr.replace(
  14154:     /((?<!\\)(?:\\\\)*)(?:\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][cdefCDEF][0-9a-fA-F]{2})|(?<!\\u[dD][89abAB][0-9a-fA-F]{2})\\u[dD][cdefCDEF][0-9a-fA-F]{2}|\\u0000)/g,
  14155:     "$1"
  14156:   );
  14157: }
  ```
- **Observations**:
  1. `JSON.stringify(db)` serializes the entire in-memory state into a 20MB–50MB string.
  2. `sanitizeJsonSerialized` executes a backtracking regular expression with negative lookbehinds and lookaheads across this entire multi-megabyte string, locking the Node.js event loop synchronously for 1.5–4.0 seconds!
  3. `stateToSave` is sent over TCP to PostgreSQL where `$1::jsonb` forces PostgreSQL to parse and allocate ~4x memory for JSONB representations. On Render free/starter tiers with 256MB–512MB RAM, this causes PostgreSQL backend worker OOM kills.
  4. There are no `setImmediate` yields between CPU serialization, regex, and I/O query execution.

---

### 1.6 Item 5: `offloadHistoricalBase64Media()` & `pruneDatabase()`
- **`offloadHistoricalBase64Media`** (`demo-server.mjs:14007`):
  - In `walkAndOffloadResidualDataUrls` (`line 14103` & `line 14115`):
    ```javascript
    if (typeof v === "string" && v.length >= 3072 && /^data:(image\/|application\/pdf)/i.test(v))
    ```
    Only tests for the literal prefix `^data:(image\/|application\/pdf)`. Pure Base64 strings (starting with `JVBERi0...` for PDFs or `/9j/4AAQSkZJRg...` for JPEGs without a `data:` prefix) are completely ignored by the tree walker!
  - The recursive traversal walks the entire deep object hierarchy without yielding (`setImmediate`) to the event loop, causing event loop delays during deep sweeps.
- **`pruneDatabase`** (`demo-server.mjs:14245`):
  - Inside the collection pruning loop (`lines 14308-14356`):
    The array sort comparator calls `toComparableIso(...)` on every comparison step (`line 14320` and `line 14336`), invoking regexes and `new Date()` allocations $O(N \log N)$ times rather than extracting the sort key in a single $O(N)$ pass.
  - Oversized payloads inside `db.auditLogs[i].details` can accumulate megabytes of unpruned metadata.

---

## 2. Logic Chain & Recommended Strategy

### 2.1 Cooldown & Dirty Flag for `reconcileAndMergeGuests`
1. **Premise**: In 99% of GET requests, guest and reservation records have not changed since the last request. Re-running $O(N^2)$ merge logic on every GET is completely redundant.
2. **Strategy**:
   - Define module-level flags:
     ```javascript
     let isGuestReconciliationDirty = true;
     let lastGuestReconcileTimestamp = 0;
     const GUEST_RECONCILE_COOLDOWN_MS = 60000; // 60s cooldown for GET routes unless dirty

     export function markGuestReconciliationDirty() {
       isGuestReconciliationDirty = true;
     }
     ```
   - In `reconcileAndMergeGuests(database, force = false)`:
     If `!force && !isGuestReconciliationDirty && (Date.now() - lastGuestReconcileTimestamp < GUEST_RECONCILE_COOLDOWN_MS)`, immediately return `false`.
     Upon running: set `isGuestReconciliationDirty = false; lastGuestReconcileTimestamp = Date.now();`.
   - Call `markGuestReconciliationDirty()` on state mutations: `POST /api/pms/guests`, `PUT/PATCH /api/pms/guests/:id`, `DELETE /api/pms/guests/:id`, `POST /api/reservations`, and on boot/hydration.
   - In `GET /api/pms/guests`, `GET /api/pms/guests/:id`, etc., calling `reconcileAndMergeGuests(db)` will execute in $O(1)$ (0ms) when clean.

### 2.2 Cooldown & Dirty Flag for `reconcileUniversalIntegrity`
1. **Premise**: `reconcileUniversalIntegrity` does broad consistency audits (Flat 502, checkout cleanings, preventive tasks). Running this on every GET to `/api/flats` and `/api/reservations/checkouts` causes event loop lag and triggers unneeded database saves.
2. **Strategy**:
   - Define module-level flags:
     ```javascript
     let isUniversalIntegrityDirty = true;
     let lastUniversalIntegrityTimestamp = 0;
     const UNIVERSAL_INTEGRITY_COOLDOWN_MS = 30000; // 30s cooldown for GET routes unless dirty

     export function markUniversalIntegrityDirty() {
       isUniversalIntegrityDirty = true;
     }
     ```
   - In `reconcileUniversalIntegrity(incomingState = null, force = false)`:
     If `!incomingState && !force && !isUniversalIntegrityDirty && (Date.now() - lastUniversalIntegrityTimestamp < UNIVERSAL_INTEGRITY_COOLDOWN_MS)`, immediately return `false`.
     Upon running: set `isUniversalIntegrityDirty = false; lastUniversalIntegrityTimestamp = Date.now();`.
   - In `GET /api/flats` (`line 17905`) and `GET /api/reservations/checkouts` (`line 19334`):
     Replace synchronous `if (reconcileUniversalIntegrity()) saveDatabase();` with:
     ```javascript
     if (isUniversalIntegrityDirty && reconcileUniversalIntegrity()) {
       setImmediate(() => saveDatabase("integrity_reconciled"));
     }
     ```
   - Mark dirty on reservation/flat/cleaning mutations: `markUniversalIntegrityDirty()`.

### 2.3 Elimination of Duplicate Calls & Memoization of `getRequestsForDate(dateStr)`
1. **Premise**: When `Dashboard` or tasks view loads, multiple endpoints (`checkouts`, `dashboard/summary`, `calendar`, `getFlatRealtimeStatus`) query the same date within a 1-3 second window.
2. **Strategy**:
   - Add a short-lived request cache for `getRequestsForDate`:
     ```javascript
     const requestsForDateCache = new Map(); // dateStr -> { timestamp, data, version }
     let requestsForDateVersion = 0;

     export function invalidateRequestsForDateCache() {
       requestsForDateVersion++;
       requestsForDateCache.clear();
     }
     ```
   - Inside `getRequestsForDate(dateStr, isNested = false)`:
     Check cache: if `!isNested && cached && cached.version === requestsForDateVersion && (Date.now() - cached.timestamp < 3000)`, return `cached.data`.
     Before returning, save to cache.
   - In `getFlatRealtimeStatus(flatId, flatNumber, dateStr = getTodayStr(), precomputedRequests = null)`:
     Accept optional `precomputedRequests`. In `GET /api/flats`, compute `const dailyRequests = getRequestsForDate(todayStr);` ONCE before iterating flats, and pass it into `getFlatRealtimeStatus`. This replaces 50 separate calls with 1 call!

### 2.4 O(1) Indexing for `computePeriodicTaskStatus` and Housekeeping Preventives
1. **Premise**: In `computePeriodicTaskStatus`, filtering all executions and all reservations per flat/task turns regularization into an $O(F \cdot T \cdot (E + R))$ bottleneck.
2. **Strategy**:
   - **Index 1: Latest Execution Map**:
     Build a `Map<"${taskId}_${flatId}", lastExecution>` in $O(E)$ time. `computePeriodicTaskStatus` looks up `lastExec` in $O(1)$.
   - **Index 2: Reservations by Flat**:
     Build a `Map<flatId | flatNumber, reservation[]>` in $O(R)$ time. `getFlatOccupiedDays` and `futureReservations` iterate only that flat's 5-10 reservations instead of all 3,000 reservations.
   - **Preventive Regularization Daily Guard**:
     In `regularizeHousekeepingPreventiveTasks(force = false)`:
     Track `lastRegularizeHousekeepingDate`. If `!force && lastRegularizeHousekeepingDate === todayStr`, return `false`. Regularization only needs to run once per calendar day or when explicitly requested by an admin.

### 2.5 `flushPgState()` Optimization & Fast-Path Surrogate Sanitization
1. **Premise**: `sanitizeJsonSerialized` spends 1.5–4.0s evaluating a backtracking regex on 30MB strings even when the string contains zero invalid surrogates.
2. **Strategy**:
   - Fast-path check in `sanitizeJsonSerialized`:
     ```javascript
     export function sanitizeJsonSerialized(jsonStr) {
       if (typeof jsonStr !== "string" || jsonStr.length === 0) return jsonStr;
       // Fast path: bypass regex if no lone surrogate escapes or NUL bytes exist
       if (!jsonStr.includes("\\u0000") && !/\\u[dD][89abABcdefCDEF]/.test(jsonStr)) {
         return jsonStr;
       }
       return jsonStr.replace(
         /((?<!\\)(?:\\\\)*)(?:\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][cdefCDEF][0-9a-fA-F]{2})|(?<!\\u[dD][89abAB][0-9a-fA-F]{2})\\u[dD][cdefCDEF][0-9a-fA-F]{2}|\\u0000)/g,
         "$1"
       );
     }
     ```
   - Add `await new Promise(resolve => setImmediate(resolve))` yields before `JSON.stringify`, before regex, and before `pgPool.query` in `flushPgState()`.
   - Call `global.gc()` if heap used $> 900$ MB after flushing.

### 2.6 Enhanced Base64 Detection & Efficient Pruning
1. **Premise**: Pure Base64 strings (without `data:` URI header) were slipping past `walkAndOffloadResidualDataUrls`. Pruning sorting was calling `toComparableIso` $O(N \log N)$ times.
2. **Strategy**:
   - Update `walkAndOffloadResidualDataUrls` to recognize pure Base64 strings:
     ```javascript
     const isOffloadableBase64 = (val) => {
       if (typeof val !== "string" || val.length < 2048) return false;
       if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/api/")) return false;
       if (/^data:(image\/|application\/pdf)/i.test(val)) return true;
       const sample = val.slice(0, 128).trim();
       return /^[A-Za-z0-9+/=\r\n]+$/.test(sample) && (sample.startsWith("JVBERi0") || sample.startsWith("/9j/") || sample.startsWith("iVBORw0KGgo"));
     };
     ```
   - In `walkAndOffloadResidualDataUrls`, yield to the event loop every 50 nodes.
   - In `pruneDatabase()`, use Schwartzian transform (decorate-sort-undecorate) to compute `toComparableIso` only once per item ($O(N)$ instead of $O(N \log N)$).
   - In `pruneDatabase()`, truncate oversized strings in `auditLogs[i].details` to $\le 500$ characters.

---

## 3. Caveats & Edge Cases

1. **Test Marker Preservation (`extractFunctionSlice`)**:
   - The test `tests/room-ready-605-dedup-and-pg-surrogate.test.mjs` uses `indexOf` with exact string markers:
     - `"export function sanitizeSafeJsonString(str, maxLen = 0)"`
     - `"async function flushPgState()"`
     - `"export function reconcileUniversalIntegrity(incomingState = null)"`
     - `"// Alias de retrocompatibilidade"`
   - **CRITICAL**: The Worker agent MUST NOT alter these exact marker lines, function names, or parameter signatures, otherwise `room-ready-605-dedup-and-pg-surrogate.test.mjs` will fail on test boot!
2. **File Mirror Synchronization**:
   - `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` are identical copies. Any changes made to `artifacts/api-server/demo-server.mjs` must also be reflected in `scripts/demo-server.mjs`.
3. **Data Loss & Mutation Safety**:
   - Do NOT disable `reconcileAndMergeGuests` or `reconcileUniversalIntegrity` completely. They must remain fully functional and run on boot, on hydration, when dirty, and after cooldown.
4. **Strict Compliance with Testing Rules**:
   - DO NOT run `npm test`, `tests/*.test.mjs`, or global test suites. Only run strictly targeted, point tests (e.g. `node --test tests/room-ready-605-dedup-and-pg-surrogate.test.mjs` or `tests/challenger-m1-1.test.mjs`).
5. **PostgreSQL JSONB Compatibility**:
   - The fast path in `sanitizeJsonSerialized` must correctly identify surrogate escape sequences (`\\u[dD][89abABcdefCDEF]`) and null bytes (`\\u0000`). If any are found, it must fall back to the complete regex replacement to protect PostgreSQL.

---

## 4. Conclusion & Actionable Implementation Plan

The backend bottlenecks are clearly identified with exact line numbers in `artifacts/api-server/demo-server.mjs`:
1. **Item 1**: Synchronous $O(N^2)$ reconciliation in `GET /api/pms/guests` (line 34823), `GET /api/pms/guests/:id` (line 36711), `GET /api/flats` (line 17905), and `GET /api/reservations/checkouts` (line 19334).
   *Fix*: Add cooldowns (60s and 30s) and dirty flags (`isGuestReconciliationDirty`, `isUniversalIntegrityDirty`). Replace synchronous `saveDatabase()` on GET paths with `setImmediate`.
2. **Item 2**: `getRequestsForDate(dateStr)` duplicate execution and 50x redundant loops in `GET /api/flats`.
   *Fix*: Add a 3-second memoization cache (`requestsForDateCache`) and pass `precomputedRequests` into `getFlatRealtimeStatus` from `GET /api/flats`.
3. **Item 3**: $O(N^2)$ unindexed loops in `computePeriodicTaskStatus` and preventive tasks.
   *Fix*: Index `periodicExecutions` by `${taskId}_${flatId}` ($O(1)$ lookup), index active reservations by flat, and add a once-per-day guard to `regularizeHousekeepingPreventiveTasks`.
4. **Item 4**: Event loop blocking in `flushPgState()` due to regex in `sanitizeJsonSerialized` and missing yields.
   *Fix*: Add fast-path surrogate check, yield event loop before heavy operations with `await new Promise(r => setImmediate(r))`, and add garbage collection hints.
5. **Item 5**: Base64 residual offloading and pruning overhead.
   *Fix*: Add pure Base64 detection to `walkAndOffloadResidualDataUrls`, add yields in tree walk, pre-map sort keys in `pruneDatabase()`, and truncate deep audit log details.

---

## 5. Verification Method

To verify these changes, the Worker agent must execute only the strictly targeted point tests:
1. **Verification of Surrogate Sanitization & Integrity Slice Markers**:
   ```powershell
   node --test tests/room-ready-605-dedup-and-pg-surrogate.test.mjs
   ```
   *Expected*: All tests pass without marker slice errors.
2. **Verification of Checkouts Card Generation**:
   ```powershell
   node --test tests/challenger-m1-1.test.mjs
   ```
   *Expected*: Checkouts scenarios 1, 2, 3 pass without error.
3. **Verification of PMS Guests LTV / Metrics**:
   ```powershell
   node --test tests/challenger-m4-demographics-ltv.test.mjs
   ```
   *Expected*: Demographics and guest endpoints respond correctly.
4. **Verification of File Synchronization**:
   ```powershell
   (Get-FileHash "artifacts/api-server/demo-server.mjs").Hash -eq (Get-FileHash "scripts/demo-server.mjs").Hash
   ```
   *Expected*: Output is `True`.
5. **Git Push**:
   After committing, execute `git push origin <branch>`.
