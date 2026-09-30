# Backend Survey Report: External Service Orders & Maintenance Module

**Explorer**: Explorer 1 (Backend Survey Explorer)  
**Date**: 2026-09-30  
**Target System**: Guest-Flow-Manager / CorpFlats  
**Working Directory**: `.agents/teamwork/explorer_survey_backend/`

---

## Executive Summary

The backend architecture is a Node.js/Express monolith centered on `artifacts/api-server/demo-server.mjs` (24,812 lines), backed by an in-memory database object `db` persisted synchronously to `data/database.json` and optionally replicated to PostgreSQL. An identical mirror file `scripts/demo-server.mjs` must remain byte-for-byte identical at all times (enforced by automated tests).

This investigation surveyed all 7 critical areas requested, providing the exact insertion points, schemas, authentication middleware, validation rules, notification hooks, storage integrations, and mirror synchronization mechanics needed for Milestone 1.

---

## 1. Database Persistence & Memory Model

### Current Mechanism
- **File location**: `data/database.json`, resolved via `DATA_DIR = path.resolve(__dirname, "../../data")` and `DB_FILE = path.join(DATA_DIR, "database.json")` (`artifacts/api-server/demo-server.mjs:457-461`).
- **In-memory state**: Global object `db` declared at line 469. Contains root collections (`users`, `flats`, `cleaningRequests`, `reservations`, `notifications`, `auditLogs`, `settings`, etc.).
- **Startup Loading**: `loadDatabase()` (`demo-server.mjs:2630`):
  1. Reads `DB_FILE` synchronously via `fs.readFileSync(DB_FILE, "utf-8")`.
  2. Parses JSON and assigns to in-memory state: `Object.assign(db, loaded)`.
  3. If PostgreSQL is configured (`pgPool`), attempts to read from `system_store` table where `key = 'db_state'`. Reconciles data and sets `pgHydratedSuccessfully = true`.
- **Saving / Persistence**: `saveDatabase(reason = "auto_save")` (`demo-server.mjs:3680`):
  1. Calls `reconcileCleaningRequests()`.
  2. Serializes in-memory `db`: `const stateJson = JSON.stringify(db, null, 2);`.
  3. Writes to disk synchronously: `fs.writeFileSync(DB_FILE, stateJson, "utf-8");`.
  4. If `pgPool` is active and hydrated, updates `system_store` and creates a snapshot in `system_store_backups` (retaining the latest 100 snapshots).

### Service Orders Schema Insertion (R1)
To add `serviceOrders` and `serviceWorkers`:
1. **In `artifacts/api-server/demo-server.mjs` (and mirror)**:
   - Line 469 (initial `db` declaration): Add `serviceOrders: []` and `serviceWorkers: []`.
   - Line 2807 (inside `loadDatabase()`): Add defensive hydration guards:
     ```javascript
     if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
     if (!Array.isArray(db.serviceWorkers)) db.serviceWorkers = [];
     ```
2. **In `data/database.json`**:
   - Add `"serviceOrders": []` and `"serviceWorkers": []` at the root object level.
3. **Data Schema**:
   - `serviceOrders`:
     ```typescript
     interface ServiceOrder {
       id: string; // e.g. "so_1727734800000_abc1" or auto-increment number
       title: string;
       token: string; // 24-character hexadecimal (crypto.randomBytes(12).toString("hex"))
       status: "draft" | "active" | "closed";
       createdAt: string; // ISO 8601
       createdBy: string | number; // Admin user ID or name
       cleanFlatMode: "never" | "priority" | "always";
       maxSimultaneousFlats: number; // default 2
       maxFlatsPerDay: number; // default 4
       requirePhotos: boolean;
       estimatedDurationHours: number | null;
       instructionFormat: "text" | "list";
       flats: Array<{
         flatId: number;
         flatNumber: string;
         instructions: string;
         status: "pending" | "in_progress" | "done";
         startedAt: string | null;
         finishedAt: string | null;
         workerName: string | null;
         workerCpf: string | null;
         estimatedFinishAt: string | null;
         observations: string | null;
         photos: string[];
         needsCleaning: boolean | null;
       }>;
     }
     ```
   - `serviceWorkers`:
     ```typescript
     interface ServiceWorker {
       id: string; // e.g. "sw_1727734800000_xyz9"
       serviceOrderId: string;
       token: string;
       mainWorker: {
         name: string;
         cpf: string;
       };
       collaborators: Array<{
         name: string;
         cpf: string;
       }>;
       registeredAt: string; // ISO 8601
     }
     ```

---

## 2. Authentication & Authorization Middleware

### Existing Pattern
- **Session Auth Helper**: `getAuthUser(req)` at `artifacts/api-server/demo-server.mjs:3858`:
  ```javascript
  const AUTH_COOKIE_NAME = "gfm_session_v2";
  const AUTH_SESSION_VERSION = 2;

  function getAuthUser(req) {
    const token = req.cookies?.[AUTH_COOKIE_NAME] || req.headers?.["authorization"]?.replace("Bearer ", "");
    if (!token) return null;
    try {
      const raw = Buffer.from(token, "base64").toString("utf-8");
      const data = JSON.parse(raw);
      if (data.v !== AUTH_SESSION_VERSION) return null; // Invalidates legacy sessions
      const found = db.users.find(u => u.id === data.id);
      if (!found) return null;
      return { id: found.id, username: found.username, role: found.role };
    } catch {
      return null;
    }
  }
  ```
- **Admin Guard Enforcement**:
  Every admin route in `demo-server.mjs` checks:
  ```javascript
  const userAuth = getAuthUser(req);
  if (!userAuth) return res.status(401).json({ error: "Não autenticado." });
  if (userAuth.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
  ```
  This returns `401` when unauthenticated and `403` when authenticated as non-admin, exactly satisfying Acceptance Criteria:
  > `GET /api/service-orders retorna 200 com autenticação admin; retorna 401/403 sem autenticação`

---

## 3. Structure & Insertion Points for New Routes

### Optimal Insertion Location
- **Location**: Line ~7587 in `artifacts/api-server/demo-server.mjs`.
- **Context**: Directly follows `// ── Periodic Tasks` (lines 7428–7586) and precedes `// ── Observations / Issues` (line 7588). This is the dedicated operational/maintenance section of the server.

### Route Catalog to Implement

#### A. Admin Routes (Protected by `getAuthUser` + `role === "admin"`)
1. `GET /api/service-orders`:
   - Returns all service orders sorted by creation date descending (`db.serviceOrders || []`).
2. `POST /api/service-orders`:
   - Validates `title` (required) and `flats` (array).
   - Generates unique 24-hex token: `crypto.randomBytes(12).toString("hex")`.
   - Populates initial flat structures with `status: "pending"`, `photos: []`, `needsCleaning: null`.
   - Appends to `db.serviceOrders`, persists with `saveDatabase("create_service_order")`, returns `201`.
3. `GET /api/service-orders/:id`:
   - Returns order details by ID or token. Returns `404` if not found.
4. `PATCH /api/service-orders/:id`:
   - Updates mutable fields (`title`, `status`, `cleanFlatMode`, `maxSimultaneousFlats`, `maxFlatsPerDay`, `requirePhotos`, `estimatedDurationHours`, `instructionFormat`, `flats`).
   - Persists with `saveDatabase("update_service_order")`.
5. `DELETE /api/service-orders/:id`:
   - Removes order from `db.serviceOrders` and removes associated workers from `db.serviceWorkers`.
   - Persists with `saveDatabase("delete_service_order")`.
6. `GET /api/service-orders/:id/progress`:
   - Returns aggregated progress statistics (`totalFlats`, `doneFlats`, `inProgressFlats`, `pendingFlats`, `percentage`) along with each flat's execution details, worker name, finish time, and photos.
7. `POST /api/service-orders/:id/flats/:flatId/reset`:
   - Helper for Tab 3 admin action: resets a flat back to `status: "pending"`, clearing `startedAt`, `finishedAt`, `photos`, and `observations`.

#### B. Public Routes (No Authentication)
1. `GET /api/service/public/:token`:
   - Looks up `order` by `token`. If not found, returns `404 { error: "Ordem de serviço não encontrada ou link inválido." }`.
   - Finds matching worker in `db.serviceWorkers` by `token`.
   - Returns `{ success: true, order, worker: worker || null }`.
2. `POST /api/service/public/:token/register`:
   - Validates `mainWorker.name` and `mainWorker.cpf`.
   - Finds or creates worker entry in `db.serviceWorkers`.
   - Updates `mainWorker`, `collaborators` (array), and `registeredAt: new Date().toISOString()`.
   - Persists with `saveDatabase("register_service_worker")`.
   - Returns `{ success: true, worker }`.
3. `POST /api/service/public/:token/flats/:flatId/start`:
   - **Validation 1**: Verifies worker registration exists for this order/token in `db.serviceWorkers`. If missing -> returns `403 { error: "Prestador deve se identificar antes de iniciar o serviço." }`.
   - **Validation 2**: Counts flats currently `in_progress` in this order -> if `>= order.maxSimultaneousFlats` (default 2) -> returns `400 { error: "Limite de apartamentos simultâneos atingido (máximo: X)." }`.
   - **Validation 3**: Counts flats completed today (`status === "done"` and `finishedAt.substring(0, 10) === todayStr`) -> if `>= order.maxFlatsPerDay` (default 4) -> returns `400 { error: "Limite diário de apartamentos atingido para hoje (máximo: X)." }`.
   - **Validation 4 (`cleanFlatMode`)**:
     - Determines if flat is dirty/turnover via helper `isFlatDirty(flatId, flatNumber)`.
     - `"never"`: If flat is clean -> returns `400 { error: "Este serviço não permite intervenção em apartamentos limpos." }`.
     - `"priority"`: If flat is clean, checks if ANY other flat in the service order is dirty. If any is dirty -> returns `400 { error: "Existem outros flats deste serviço que estão com check-out ou sujos. Finalize-os primeiro." }`.
     - `"always"`: Allowed to start any flat (response sets `prioritySuggested: true` if dirty).
   - **Execution**: Sets `flat.status = "in_progress"`, `flat.startedAt = new Date().toISOString()`, `flat.workerName = worker.mainWorker.name`, `flat.workerCpf = worker.mainWorker.cpf`.
   - Calculates `estimatedFinishAt`: if `order.estimatedDurationHours` is set, `startedAt + estimatedDurationHours * 3600000`.
   - Calls `saveDatabase()`.
   - Dispatches multi-channel notifications (WhatsApp admin + WhatsApp reception + Email reception + `createNotification`).
   - Returns `{ success: true, flat }`.
4. `POST /api/service/public/:token/flats/:flatId/finish`:
   - Checks that flat is currently `in_progress`.
   - **Validation 1 (`needsCleaning`)**: If flat was originally clean (was not dirty when started, e.g. occupied or vacant clean) -> `req.body.needsCleaning` is strictly mandatory (`typeof req.body.needsCleaning === "boolean"`). If missing -> returns `400 { error: "O campo 'needsCleaning' (precisa de limpeza de camareira) é obrigatório para flats que estavam limpos." }`.
   - **Validation 2 (`photos`)**: If `order.requirePhotos === true` -> `photos` array must not be empty. If empty -> returns `400 { error: "É obrigatório anexar pelo menos 1 foto para finalizar este serviço." }`.
   - **Execution**: Sets `flat.status = "done"`, `flat.finishedAt = new Date().toISOString()`, `flat.observations = req.body.observations || ""`, `flat.photos = req.body.photos || []`, `flat.needsCleaning = req.body.needsCleaning ?? null`.
   - Clears maid lock on this flat.
   - If `needsCleaning === true`, ensures a cleaning request with `status: "dirty"` is queued for the housekeeping dashboard.
   - Removes active `estimatedFinishAt` lock on PMS calendar.
   - Calls `saveDatabase()`.
   - Dispatches multi-channel notifications (WhatsApp admin + WhatsApp reception + Email reception + `createNotification`).
   - Returns `{ success: true, flat }`.
5. `POST /api/service/public/:token/flats/:flatId/photos`:
   - Receives photo base64 string(s) or payload.
   - Calls `uploadImageToStorage(photoBase64, "service_" + flatId, db, "services")`.
   - Returns `{ success: true, url, urls }`.

---

## 4. `GET /api/flats` & `serviceInProgress` Injection

### Current Implementation
- `artifacts/api-server/demo-server.mjs:5189`:
  ```javascript
  app.get("/api/flats", (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    if (reconcileUniversalIntegrity()) saveDatabase();
    const activeFlats = (db.flats || []).filter(f => f.isActive !== false);
    triggerBackgroundSync();
    res.json(activeFlats);
  });
  ```

### Proposed Enhancement
Inject `serviceInProgress: { serviceTitle, workerName, serviceOrderId } | null` onto each returned flat:
```javascript
app.get("/api/flats", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  if (reconcileUniversalIntegrity()) saveDatabase();
  
  // Find all currently active service orders
  const activeOrders = (db.serviceOrders || []).filter(o => o.status === "active");

  const activeFlats = (db.flats || []).filter(f => f.isActive !== false).map(flat => {
    let serviceInProgress = null;
    for (const order of activeOrders) {
      const activeFlat = (order.flats || []).find(oflat =>
        (Number(oflat.flatId) === Number(flat.id) || String(oflat.flatNumber) === String(flat.number)) &&
        oflat.status === "in_progress"
      );
      if (activeFlat) {
        serviceInProgress = {
          serviceTitle: order.title,
          workerName: activeFlat.workerName || "Prestador Externo",
          serviceOrderId: order.id
        };
        break;
      }
    }
    return {
      ...flat,
      serviceInProgress
    };
  });

  triggerBackgroundSync();
  res.json(activeFlats);
});
```

### Calendar PMS Blocking Integration (`GET /api/pms/calendar`)
In `artifacts/api-server/demo-server.mjs:9234`, `GET /api/pms/calendar` queries `db.roomBlocks`.  
To reflect active service orders with `estimatedFinishAt`:
```javascript
const serviceOrderBlocks = [];
for (const order of (db.serviceOrders || []).filter(o => o.status === "active")) {
  for (const oflat of (order.flats || [])) {
    if (oflat.status === "in_progress" && oflat.startedAt) {
      const startDate = oflat.startedAt.substring(0, 10);
      const endDate = oflat.estimatedFinishAt ? oflat.estimatedFinishAt.substring(0, 10) : startDate;
      serviceOrderBlocks.push({
        id: `service_block_${order.id}_${oflat.flatId}`,
        flatId: oflat.flatId,
        flatNumber: oflat.flatNumber,
        startDate,
        endDate,
        reason: `🔧 ${order.title}`,
        notes: `Serviço em andamento: ${order.title} (${oflat.workerName || "Prestador"})`,
        isServiceOrder: true,
        serviceOrderId: order.id,
        createdAt: oflat.startedAt
      });
    }
  }
}
// Merge serviceOrderBlocks with db.roomBlocks in response
```

---

## 5. Notification Architecture & Reception Configs

### 1. Z-API WhatsApp Engine (`artifacts/api-server/zapi-service.mjs`)
- Primary dispatch function: `sendZapiMessage(config, options)` (`line 2025`).
- Required options:
  ```javascript
  await sendZapiMessage(db.zapiConfig, {
    phone: targetPhone,
    message: formattedText,
    bypassTestMode: true // Essential: prevents test-mode blocking for staff/admin alerts
  });
  ```
- **Fallback safety**: If Z-API is not configured or in sandbox, `sendZapiMessage` returns `{ success: true, simulated: true }` without crashing or throwing.

### 2. Email Service (`artifacts/api-server/mail-service.mjs`)
- Primary dispatch function: `sendEmailAsync(options)` (`line 620`).
- Runs in background queue without blocking HTTP response, logs directly to `db.reservationCommunications`:
  ```javascript
  sendEmailAsync({
    db,
    saveDatabase,
    reservationId: "0",
    recipient: receptionEmail,
    subject: `[CorpFlats] Serviço ${action === "start" ? "Iniciado" : "Finalizado"} - Flat ${flatNumber} (${order.title})`,
    bodyHtml: htmlContent,
    metadata: {
      category: "service_order",
      serviceOrderId: order.id,
      flatNumber: flatNumber
    }
  });
  ```

### 3. Internal Notifications & Audit Logs
- Central engine function: `createNotification(options)` (`artifacts/api-server/demo-server.mjs:3778`).
- Behavior:
  - Writes to `db.notifications` (prepends, caps at 250 items, sets `read: false`, timestamps with ISO 8601).
  - Automatically calls `logAuditEvent()` to persist event to `db.auditLogs`, local `audit_logs.jsonl`, and PostgreSQL.
  - Automatically calls `saveDatabase()`.
  - Dispatches webhook if configured in `db.notificationSettings.webhookUrl`.
  - Served directly to UI via `GET /api/notifications` (`demo-server.mjs:12466`).

### 4. Reception & Admin Contact Configurations
- **Admin WhatsApp**: Explicitly mandated as `5522998505276` in R3.
- **Reception WhatsApp / Phone**:
  - Found in `db.settings.receptionPhone` or `db.settings.receptionWhatsApp` or `db.siteConfig.branding.whatsapp` or `db.users.find(u => u.role === "recepcao").whatsapp` or fallback `db.settings.adminWhatsApp || "5522997124021"`.
- **Reception Email**:
  - Found in `flat?.receptionEmail || db.settings?.receptionEmail || db.settings?.buildingEmail || process.env.RECEPTION_EMAIL || "millerpessanha@gmail.com"` (verified across lines 2753, 5207, 8090, 10850, 11899, 14647, 15609, 24749).

---

## 6. Photo Uploads & Storage Pipeline

### Storage Mechanism (`artifacts/api-server/storage-service.mjs`)
- Function: `uploadImageToStorage(base64Data, filenamePrefix, db, folder)` (`line 92`).
- Parameters:
  1. `base64Data`: Base64 string (e.g. `data:image/jpeg;base64,...`) or URL.
  2. `filenamePrefix`: e.g. `service_flat_${flatId}`.
  3. `db`: Global DB object (reads `db?.storageConfig?.r2` credentials).
  4. `folder`: e.g. `"services"`.
- Behavior:
  - If input is already an HTTP(S) URL, returns it directly.
  - Generates unique key: `${folder}/${filenamePrefix}_${timestamp}_${random}.${ext}`.
  - Attempts upload to Cloudflare R2 via SigV4 (`uploadToCloudflareR2Direct`).
  - If R2 is unconfigured or fails, gracefully falls back to returning the base64 Data URL.
- Server Limits: `demo-server.mjs:185-186` sets `express.json({ limit: "50mb" })` and `express.urlencoded({ limit: "50mb", extended: true })`.
- Frontend Convention: All photo uploads across `Guest-Flow-Manager` (`flat-card.tsx:502`, `lost-and-found.tsx:218`, `guest-pre-checkin.tsx:605`) read files into Base64 via `FileReader.readAsDataURL()` and send JSON bodies with `photoBase64: string` or `photos: string[]`. Supporting JSON base64 payloads on `POST /api/service/public/:token/flats/:flatId/photos` integrates seamlessly with both the frontend components and `uploadImageToStorage`.

---

## 7. Server Mirror Synchronization (`artifacts` vs `scripts`)

### Current Relationship
- Primary server file: `artifacts/api-server/demo-server.mjs`.
- Mirror file: `scripts/demo-server.mjs`.
- Integrity tests:
  - `tests/checkout-occupancy-rule.test.mjs:11-15`:
    ```javascript
    it('1. Deve ter paridade estrita entre demo-server.mjs em artifacts e scripts', () => {
      const serverCode = fs.readFileSync(serverPath, 'utf8');
      const scriptsCode = fs.readFileSync(scriptsServerPath, 'utf8');
      assert.strictEqual(serverCode, scriptsCode, 'demo-server.mjs deve ser idêntico em artifacts/api-server e scripts/');
    });
    ```
  - `tests/governance-integrity.test.mjs:255`: Checks exact SHA-256 hash match between primary and mirror.
  - `tests/adversarial-stress.test.mjs:19-20`: Checks dual-server parity.

### Critical Finding
- Running `node --test tests/checkout-occupancy-rule.test.mjs` currently fails Subtest 1 because uncommitted modifications exist in `artifacts/api-server/demo-server.mjs` (survey overhaul) that were not yet synced to `scripts/demo-server.mjs`.
- **Mandate for M1 Implementation**:
  Every modification made to `artifacts/api-server/demo-server.mjs` MUST be mirrored byte-for-byte to `scripts/demo-server.mjs` before committing.
  Verification command:
  ```powershell
  node --test tests/checkout-occupancy-rule.test.mjs
  ```

---

## Actionable Recommendations for Milestone 1

1. **Database Schema Setup**:
   Add `"serviceOrders": []` and `"serviceWorkers": []` to `data/database.json`. In `demo-server.mjs` lines 469 and 2807, initialize `db.serviceOrders = []` and `db.serviceWorkers = []`.
2. **Helper Functions**:
   Implement helper functions before line 7587:
   - `isFlatDirty(flatId, flatNumber)`: Checks cleaning requests and checkout reservations.
   - `formatServiceDuration(startIso, endIso)`: Generates friendly duration string.
   - `dispatchServiceOrderNotification(event, order, flat, worker, extra)`: Orchestrates WhatsApp to admin (`5522998505276`), WhatsApp to reception, email to reception, and `createNotification`.
3. **Route Implementation**:
   Insert the 6 admin endpoints and 5 public endpoints at line 7587 in `artifacts/api-server/demo-server.mjs`.
4. **Flats API & Calendar**:
   Update `GET /api/flats` (line 5189) with `serviceInProgress` and `GET /api/pms/calendar` (line 9234) with service block synthesis.
5. **Mirror Sync**:
   Copy `artifacts/api-server/demo-server.mjs` to `scripts/demo-server.mjs` and execute `node --test tests/checkout-occupancy-rule.test.mjs` to ensure 100% parity.
