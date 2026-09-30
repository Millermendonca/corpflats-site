# Handoff Report: Backend Architecture Survey for External Service Orders

**Agent**: Explorer 1 (Backend Survey Explorer)  
**Type**: Hard Handoff (Task Complete)  
**Timestamp**: 2026-09-30T18:53:30-03:00  
**Target Recipient**: Orchestrator / Milestone 1 Backend Worker  

---

## 1. Observation

1. **Database Persistence & Memory Structure**:
   - `artifacts/api-server/demo-server.mjs:457-461`:
     ```javascript
     const DATA_DIR = path.resolve(__dirname, "../../data");
     const DB_FILE = path.join(DATA_DIR, "database.json");
     ```
   - In-memory `db` initialized at line 469. `loadDatabase()` at line 2630 reads `DB_FILE` via `fs.readFileSync(DB_FILE, "utf-8")` and `JSON.parse()`.
   - Persistence occurs via `saveDatabase(reason)` at line 3680 using `fs.writeFileSync(DB_FILE, stateJson, "utf-8")` and optional PostgreSQL `system_store` update.
   - `data/database.json` has 52,046 lines and currently contains 19 active flats and zero `serviceOrders` or `serviceWorkers` keys.

2. **Authentication Middleware & Role Validation**:
   - `demo-server.mjs:3855-3871`:
     ```javascript
     const AUTH_COOKIE_NAME = "gfm_session_v2";
     const AUTH_SESSION_VERSION = 2;

     function getAuthUser(req) {
       const token = req.cookies?.[AUTH_COOKIE_NAME] || req.headers?.["authorization"]?.replace("Bearer ", "");
       if (!token) return null;
       try {
         const raw = Buffer.from(token, "base64").toString("utf-8");
         const data = JSON.parse(raw);
         if (data.v !== AUTH_SESSION_VERSION) return null;
         const found = db.users.find(u => u.id === data.id);
         if (!found) return null;
         return { id: found.id, username: found.username, role: found.role };
       } catch {
         return null;
       }
     }
     ```
   - Admin routes (e.g. `demo-server.mjs:4884`, `4901`, `4939`, `7434`, `7454`, `7480`, `7514`) check:
     ```javascript
     const userAuth = getAuthUser(req);
     if (!userAuth) return res.status(401).json({ error: "Não autenticado." });
     if (userAuth.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
     ```

3. **Insertion Points for New Routes**:
   - Line 7428 starts `// ── Periodic Tasks (Manutenções Preventivas & Recorrentes) ───────────────────`.
   - Line 7588 starts `// ── Observations / Issues ───────────────────────────────────────────────────`.
   - The ideal insertion point is line 7587 directly between these two maintenance modules.

4. **Flats API**:
   - `demo-server.mjs:5189-5195`:
     ```javascript
     app.get("/api/flats", (req, res) => {
       res.set("Cache-Control", "no-store, no-cache, must-revalidate");
       if (reconcileUniversalIntegrity()) saveDatabase();
       const activeFlats = (db.flats || []).filter(f => f.isActive !== false);
       triggerBackgroundSync();
       res.json(activeFlats);
     });
     ```
   - Calendar blocks at line 9234 in `app.get("/api/pms/calendar")` query `db.roomBlocks`.

5. **Notification Services & Reception Config**:
   - WhatsApp dispatch: `artifacts/api-server/zapi-service.mjs:2025` export `sendZapiMessage(config, options)`. Passing `bypassTestMode: true` bypasses test-mode/sandbox restrictions.
   - Email dispatch: `artifacts/api-server/mail-service.mjs:620` export `sendEmailAsync({ db, saveDatabase, recipient, subject, bodyHtml, ... })`.
   - Internal notifications: `demo-server.mjs:3778` function `createNotification({ category, title, message, severity, metadata, targetUrl })` writes to `db.notifications`, calls `logAuditEvent` (which writes to `audit_logs.jsonl` and PostgreSQL), and calls `saveDatabase()`.
   - Admin WhatsApp: `"5522998505276"` (per requirement R3).
   - Reception email: `db.settings?.receptionEmail || "millerpessanha@gmail.com"` (lines 514, 2753, 10850, 15609, 24749).
   - Reception phone: `db.settings?.receptionPhone || db.settings?.receptionWhatsApp || db.siteConfig?.branding?.whatsapp || db.users?.find(u => u.role === "recepcao")?.whatsapp || db.settings?.adminWhatsApp || "5522997124021"`.

6. **Photo Upload Pipeline**:
   - `artifacts/api-server/storage-service.mjs:92`: `export async function uploadImageToStorage(base64Data, filenamePrefix = "doc", db, folder = "guests")`.
   - Uses SigV4 to upload to Cloudflare R2 bucket `corpflats-docs` with graceful base64 URL fallback.
   - Body parser in `demo-server.mjs:185`: `app.use(express.json({ limit: "50mb" }))`.
   - Frontend convention across `flat-card.tsx:502`, `lost-and-found.tsx:218`, and `guest-pre-checkin.tsx:605` is Base64 JSON strings via `FileReader`.

7. **Server Mirror Parity**:
   - `tests/checkout-occupancy-rule.test.mjs:11-15`:
     ```javascript
     it('1. Deve ter paridade estrita entre demo-server.mjs em artifacts e scripts', () => {
       const serverCode = fs.readFileSync(serverPath, 'utf8');
       const scriptsCode = fs.readFileSync(scriptsServerPath, 'utf8');
       assert.strictEqual(serverCode, scriptsCode, 'demo-server.mjs deve ser idêntico em artifacts/api-server e scripts/');
     });
     ```
   - Running `node --test tests/checkout-occupancy-rule.test.mjs` failed with Subtest 1 error because recent survey changes in `artifacts/api-server/demo-server.mjs` were not yet synced to `scripts/demo-server.mjs`.

---

## 2. Logic Chain

1. From Observation 1, the database is a non-ORM in-memory object synced synchronously to `data/database.json`. Therefore, adding `serviceOrders: []` and `serviceWorkers: []` requires adding these keys to default `db` declaration in `demo-server.mjs` (line 469), `loadDatabase` guard (line 2807), and root of `data/database.json`.
2. From Observation 2, session authentication is handled via `getAuthUser(req)`. To meet Acceptance Criteria ("GET /api/service-orders retorna 200 com autenticação admin; retorna 401/403 sem autenticação"), every admin route must check `if (!userAuth) return res.status(401)...; if (userAuth.role !== 'admin') return res.status(403)...`.
3. From Observation 3, inserting routes at line 7587 keeps service orders in the operational tasks cluster (beside periodic tasks and observations) without disturbing database hydration or app initialization logic.
4. From Observation 4, `GET /api/flats` can be updated by mapping `activeFlats` and adding `serviceInProgress: { serviceTitle, workerName, serviceOrderId } | null`. In `GET /api/pms/calendar`, active service orders with `status === "in_progress"` should be merged into `blocks`.
5. From Observation 5, notifications on `start` and `finish` can invoke `sendZapiMessage(db.zapiConfig, { phone, message, bypassTestMode: true })` for both admin (`5522998505276`) and reception, `sendEmailAsync` for reception email, and `createNotification` for internal system push and audit logs.
6. From Observation 6, photo uploads should accept base64 JSON (`photoBase64` or `photos`), passing them to `uploadImageToStorage(base64, prefix, db, "services")`.
7. From Observation 7, any edit to `artifacts/api-server/demo-server.mjs` must be copied to `scripts/demo-server.mjs`, or the project test suite (`tests/checkout-occupancy-rule.test.mjs` and `tests/governance-integrity.test.mjs`) will fail.

---

## 3. Caveats

1. **Working Copy Diff in Server**: `artifacts/api-server/demo-server.mjs` already had unstaged modifications for surveys that were not yet mirrored to `scripts/demo-server.mjs`. When Milestone 1 begins, the implementer should decide whether to sync those existing modifications first or preserve them while adding the new service endpoints.
2. **Cloudflare R2 Credentials**: In development/local environments without live R2 credentials, `uploadImageToStorage` gracefully falls back to returning the base64 Data URL, which works seamlessly for previews and tests.
3. **Z-API WhatsApp Credentials**: If Z-API is offline or unconfigured, `sendZapiMessage` returns `{ success: true, simulated: true }`, ensuring tests and offline execution do not fail.

---

## 4. Conclusion

The backend architecture is mapped with high precision. All mechanisms (DB persistence, authentication, route insertion points, flats injection, notifications, file uploads, and server mirror synchronization) have clear, unambiguous specifications ready for implementation in Milestone 1. Full details are documented in `.agents/teamwork/explorer_survey_backend/analysis.md`.

---

## 5. Verification Method

To verify these observations independently:
1. **Server Parity Test**:
   ```powershell
   node --test tests/checkout-occupancy-rule.test.mjs
   ```
   (Observe failure on Subtest 1 due to current unsynced diff between artifacts and scripts).
2. **Governance Test Suite**:
   ```powershell
   node --test tests/governance-integrity.test.mjs
   ```
3. **Inspect Database & Server Files**:
   - `data/database.json`: Check root keys.
   - `artifacts/api-server/demo-server.mjs`: Inspect lines 457–526, 2630–2805, 3680–3715, 3855–3871, 5189–5195, 7428–7590.
   - `artifacts/api-server/storage-service.mjs`: Inspect line 92.
   - `artifacts/api-server/zapi-service.mjs`: Inspect line 2025.
   - `artifacts/api-server/mail-service.mjs`: Inspect line 620.
