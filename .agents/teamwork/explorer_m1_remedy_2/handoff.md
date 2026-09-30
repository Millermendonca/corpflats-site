# Handoff Report: Explorer M1 Remedy 2 — Edge Case Defenses Analysis

**Agent**: Explorer M1 Remedy 2  
**Role**: Explorer, Synthesizer  
**Target Recipient**: Orchestrator (`2a43f791-5cc7-4933-bdd2-688af9234cb1`)  
**Working Directory**: `.agents/teamwork/explorer_m1_remedy_2/`  
**Timestamp**: 2026-09-30T22:22:00Z  

---

## 1. Observation

### 1.1 Files Inspected & Parity Baseline
- Primary monolith: `artifacts/api-server/demo-server.mjs` (25,607 lines)
- Mirror monolith: `scripts/demo-server.mjs` (25,607 lines)
- Baseline mirror parity verified via `git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs`:
  - Result: **0 bytes difference** (100% byte-for-byte identical).
- Reviewer reports reviewed:
  - Reviewer 1 (`reviewer_m1_1/handoff.md` §Finding 1 & §Challenge 1)
  - Reviewer 2 (`reviewer_m1_2/handoff.md` §Finding 2)

---

### 1.2 Issue 1: Closed Service Orders in Public Flat Start Endpoint

#### Exact Code Observed in `artifacts/api-server/demo-server.mjs` (lines 8126–8141) and `scripts/demo-server.mjs` (lines 8126–8141):
```javascript
8126: // POST /api/service/public/:token/flats/:flatId/start — Inicia serviço no apartamento
8127: app.post("/api/service/public/:token/flats/:flatId/start", async (req, res) => {
8128:   const { token, flatId } = req.params;
8129:   const order = (db.serviceOrders || []).find(o => o.token === token);
8130:   if (!order) return res.status(404).json({ error: "Ordem de serviço não encontrada ou link inválido." });
8131: 
8132:   // 1. Prestador deve ter registro em serviceWorkers para aquele token (se não tiver → 403)
8133:   const worker = (db.serviceWorkers || []).find(w => (w.token === token || w.serviceOrderId === order.id) && w.mainWorker?.name && w.mainWorker?.cpf);
8134:   if (!worker) {
8135:     return res.status(403).json({ error: "Prestador deve se identificar antes de iniciar o serviço." });
8136:   }
8137: 
8138:   const fId = Number(flatId);
8139:   const flat = (order.flats || []).find(f => Number(f.flatId) === fId || String(f.flatNumber) === String(flatId));
8140:   if (!flat) return res.status(404).json({ error: "Apartamento não encontrado nesta ordem de serviço." });
```

#### Related Downstream Code in `artifacts/api-server/demo-server.mjs`:
1. Lines 5199–5200 (`getFlatServiceInProgress`):
   ```javascript
   for (const order of db.serviceOrders) {
     if (order.status !== "active") continue;
   ```
2. Lines 8197–8199 (start endpoint status transition):
   ```javascript
   if (order.status === "draft") {
     order.status = "active";
   }
   ```
3. Line 9979 (`GET /api/pms/calendar`):
   ```javascript
   for (const order of db.serviceOrders) {
     if (order.status !== "active") continue;
   ```

---

### 1.3 Issue 2: Empty/Whitespace-only Title in Admin PATCH Endpoint

#### Exact Code Observed in `artifacts/api-server/demo-server.mjs` (lines 7886–7905) and `scripts/demo-server.mjs` (lines 7886–7905):
```javascript
7886: // PATCH /api/service-orders/:id — Atualiza ordem de serviço (Admin)
7887: app.patch("/api/service-orders/:id", (req, res) => {
7888:   const userAuth = getAuthUser(req);
7889:   if (!userAuth) return res.status(401).json({ error: "Não autenticado." });
7890:   if (userAuth.role !== "admin") return res.status(403).json({ error: "Acesso negado." });
7891: 
7892:   const { id } = req.params;
7893:   const order = (db.serviceOrders || []).find(o => o.id === id || o.token === id);
7894:   if (!order) return res.status(404).json({ error: "Ordem de serviço não encontrada." });
7895: 
7896:   const body = req.body || {};
7897:   if (body.title !== undefined) order.title = String(body.title).trim();
7898:   if (body.status !== undefined && ["draft", "active", "closed"].includes(body.status)) order.status = body.status;
7899:   if (body.cleanFlatMode !== undefined && ["never", "priority", "always"].includes(body.cleanFlatMode)) order.cleanFlatMode = body.cleanFlatMode;
7900:   if (body.maxSimultaneousFlats !== undefined) order.maxSimultaneousFlats = Math.max(1, parseInt(body.maxSimultaneousFlats, 10) || 2);
```

#### Contrast with `POST /api/service-orders` (lines 7807–7809):
```javascript
7807:   if (!title || !String(title).trim()) {
7808:     return res.status(400).json({ error: "Título do serviço é obrigatório." });
7809:   }
```

---

## 2. Logic Chain

### 2.1 Logic Chain for Issue 1: Closed Service Orders Check in POST /start

1. **Premise**: In business operations, once an admin sets an order's `status` to `"closed"`, work on that order is officially terminated or concluded.
2. **Current Flaw**: Line 8130 confirms the order exists, but does not check `order.status`.
3. **Desynchronization Hazard**:
   - If a worker has the portal open or bookmarked and clicks "Iniciar Serviço", the backend modifies `flat.status = "in_progress"` (line 8185), sets `flat.startedAt` (line 8186), dispatches notifications (line 8204), and persists the database.
   - Because `order.status` is `"closed"` (not `"draft"`), lines 8197–8199 do NOT alter `order.status`. The order remains `"closed"`.
   - However, `getFlatServiceInProgress()` (line 5200) and the PMS calendar builder (line 9979) strictly filter with `if (order.status !== "active") continue;`.
   - Consequently, `GET /api/flats`, `GET /api/reservations/checkouts` (Maid Dashboard), and `GET /api/pms/calendar` will **NOT** display the flat as having an active service in progress.
   - The worker is in the room, but the hotel governance staff, maids, and reception have no visibility of the lock, allowing maids to enter or double-bookings to occur.
4. **Resolution**:
   - At line 8131, immediately after confirming `order` existence, verify:
     ```javascript
     if (order.status === "closed") {
       return res.status(400).json({ error: "Esta ordem de serviço está encerrada." });
     }
     ```
   - This prevents any state alteration on closed orders and returns a clear, descriptive HTTP 400 error.

---

### 2.2 Logic Chain for Issue 2: Empty/Whitespace Title Sanitization in PATCH /api/service-orders/:id

1. **Premise**: `order.title` is a mandatory identifier required across the application:
   - WhatsApp notifications: `🔧 *Serviço iniciado* — ${order.title}` (line 5275)
   - Reception email notifications: `[CorpFlats] Serviço iniciado: ${order.title}` (line 5328)
   - PMS calendar block label: `title: "🔧 " + order.title` (line 9993)
   - Maid dashboard badge: displays `serviceTitle` (line 5208)
   - Admin UI (`/servicos`): cards and table headers.
2. **Current Flaw**: Line 7897 executes:
   ```javascript
   if (body.title !== undefined) order.title = String(body.title).trim();
   ```
   If a client sends `{ title: "" }` or `{ title: "   " }`, `String(body.title).trim()` yields `""`.
   `order.title` is overwritten with an empty string, corrupting notification messages, calendar blocks, and UI cards.
3. **Resolution**:
   - When `body.title !== undefined`, validate that the trimmed value is non-empty.
   - If empty or whitespace-only, reject the request with HTTP 400:
     ```javascript
     if (body.title !== undefined) {
       const trimmedTitle = String(body.title).trim();
       if (!trimmedTitle) {
         return res.status(400).json({ error: "Título do serviço não pode ser vazio." });
       }
       order.title = trimmedTitle;
     }
     ```
   - This matches the creation invariant from `POST /api/service-orders` (lines 7807–7809) and prevents saving a headless/titleless order.

---

## 3. Caveats & Design Options

### 3.1 Alternative Interpretation for PATCH Title Sanitization
- **Option 1 (Recommended — Explicit HTTP 400 Rejection)**:
  - If `body.title !== undefined` and `!String(body.title).trim()`, return `res.status(400).json({ error: "Título do serviço não pode ser vazio." })`.
  - **Pros**: Follows standard REST validation semantics; informs the client explicitly why the request was rejected; prevents silent discrepancy between UI form input and persisted backend state.
  - **Cons**: Requires the client to handle the 400 error if it accidentally sends an empty title.
- **Option 2 (Silent Ignore / Fallback)**:
  - `if (body.title !== undefined && String(body.title).trim()) order.title = String(body.title).trim();`
  - **Pros**: Does not abort PATCH requests if multiple fields are updated simultaneously and title was mistakenly sent empty.
  - **Cons**: Silently succeeds (HTTP 200) without applying the title change, hiding potential frontend bugs.
- **Recommendation**: **Option 1** is strongly recommended as it strictly enforces "reject empty/whitespace-only updates". Both options are provided with exact code snippets below.

### 3.2 Ordering of Checks in POST /start
- Placing `if (order.status === "closed")` at line 8131 (before `serviceWorkers` lookup at line 8133) is optimal because if the order itself is closed, no operation can proceed regardless of who is attempting it.

### 3.3 Strict Mirror Parity
- Every modification to `artifacts/api-server/demo-server.mjs` must be replicated identically in `scripts/demo-server.mjs`.

---

## 4. Conclusion & Exact Code Changes

### Summary Table of Proposed Changes

| # | Target Endpoint | File(s) | Existing Line(s) | Action | Description |
|---|-----------------|---------|------------------|--------|-------------|
| 1 | `POST /api/service/public/:token/flats/:flatId/start` | `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs` | 8130–8131 | Insert check after line 8130 | Reject flat start with HTTP 400 if `order.status === "closed"` |
| 2 | `PATCH /api/service-orders/:id` | `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs` | 7897 | Replace line 7897 | Reject empty/whitespace-only `title` with HTTP 400 (or sanitize) |

---

### Detailed Code Diffs

#### Change 1: Closed Order Guard in `POST /api/service/public/:token/flats/:flatId/start`

**Target Files**:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`

**Location**: Lines 8127–8136

```diff
 // POST /api/service/public/:token/flats/:flatId/start — Inicia serviço no apartamento
 app.post("/api/service/public/:token/flats/:flatId/start", async (req, res) => {
   const { token, flatId } = req.params;
   const order = (db.serviceOrders || []).find(o => o.token === token);
   if (!order) return res.status(404).json({ error: "Ordem de serviço não encontrada ou link inválido." });
+
+  if (order.status === "closed") {
+    return res.status(400).json({ error: "Esta ordem de serviço está encerrada." });
+  }
 
   // 1. Prestador deve ter registro em serviceWorkers para aquele token (se não tiver → 403)
   const worker = (db.serviceWorkers || []).find(w => (w.token === token || w.serviceOrderId === order.id) && w.mainWorker?.name && w.mainWorker?.cpf);
```

---

#### Change 2: Title Sanitization & Rejection in `PATCH /api/service-orders/:id`

**Target Files**:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`

**Location**: Line 7897

##### Option 1 (Recommended — Explicit HTTP 400 Rejection):
```diff
   const body = req.body || {};
-  if (body.title !== undefined) order.title = String(body.title).trim();
+  if (body.title !== undefined) {
+    const trimmedTitle = String(body.title).trim();
+    if (!trimmedTitle) {
+      return res.status(400).json({ error: "Título do serviço não pode ser vazio." });
+    }
+    order.title = trimmedTitle;
+  }
   if (body.status !== undefined && ["draft", "active", "closed"].includes(body.status)) order.status = body.status;
```

##### Option 2 (Alternative — Silent Ignore Sanitization):
```diff
   const body = req.body || {};
-  if (body.title !== undefined) order.title = String(body.title).trim();
+  if (body.title !== undefined && String(body.title).trim()) {
+    order.title = String(body.title).trim();
+  }
   if (body.status !== undefined && ["draft", "active", "closed"].includes(body.status)) order.status = body.status;
```

---

## 5. Verification Method

### 5.1 Verification Commands
Once the implementer applies the changes, run:

```powershell
# 1. Syntax check for both primary and mirror servers
node -c artifacts/api-server/demo-server.mjs
node -c scripts/demo-server.mjs

# 2. Strict byte-for-byte mirror parity check (must produce 0 output)
git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs

# 3. Existing static contract tests
node --test tests/service-orders.test.mjs

# 4. Existing live integration tests
node --test tests/service-orders-api-live.test.mjs

# 5. Core regression tests
node --test tests/checkout-occupancy-rule.test.mjs
node --test tests/governance-integrity.test.mjs
```

### 5.2 Dedicated Test Cases to Add in Test Suite
The following automated tests can be appended to `tests/service-orders-api-live.test.mjs` to verify both defenses:

```javascript
it('POST /start rejects with 400 when order.status is closed', async () => {
  // Set order status to closed
  await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'closed' })
  });

  const res = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/3/start`, {
    method: 'POST',
    headers: publicHeaders
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /encerrada/i);

  // Revert back to active for remaining tests
  await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'active' })
  });
});

it('PATCH /api/service-orders/:id rejects empty or whitespace title with 400', async () => {
  const resEmpty = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ title: '   ' })
  });
  assert.strictEqual(resEmpty.status, 400);
  const data = await resEmpty.json();
  assert.match(data.error, /vazio|obrigatório/i);
});
```

### 5.3 Invalidation Conditions
This analysis is invalidated if:
1. The route signature for `app.post("/api/service/public/:token/flats/:flatId/start")` or `app.patch("/api/service-orders/:id")` is moved to a different controller or route file.
2. The mirror file `scripts/demo-server.mjs` is intentionally deprecated by architectural directive (currently strictly required).
