# Handoff Report: Milestone 1 Remedy 3 — Photo Array Sanitization & Verification Protocol

**Agent**: Explorer M1 Remedy 3  
**Role**: Investigation & Synthesis Specialist  
**Working Directory**: `.agents/teamwork/explorer_m1_remedy_3/`  
**Status**: COMPLETE  
**Recipient**: Orchestrator, Worker M1 (Backend Data & API), Challenger 1 / Reviewers  
**Timestamp**: 2026-09-30T22:25:00Z  

---

## 1. Observation

### 1.1 Current Implementation of Photo Handling in `finish` Endpoint
File: `artifacts/api-server/demo-server.mjs` (and mirror `scripts/demo-server.mjs`), lines 8234–8247:
```javascript
  // 2. Se requirePhotos: true na ordem: photos não pode ser vazio (400 if empty)
  const photos = Array.isArray(req.body.photos) ? req.body.photos : [];
  if (order.requirePhotos && photos.length === 0) {
    return res.status(400).json({ error: "É obrigatório anexar pelo menos 1 foto para finalizar este serviço." });
  }

  const now = new Date();
  flat.status = "done";
  flat.finishedAt = now.toISOString();
  flat.observations = req.body.observations ? String(req.body.observations).trim() : "";
  flat.photos = photos;
  flat.needsCleaning = typeof req.body.needsCleaning === "boolean" ? req.body.needsCleaning : null;
  flat.estimatedFinishAt = null;
```

### 1.2 Photo Array Sanitization Flaw
- If a payload contains `photos: [""]`, `photos: ["   "]`, `photos: ["  \t\n  "]`, or non-string items like `photos: [null]`, `Array.isArray(req.body.photos)` is `true` and `photos.length >= 1`.
- The guard `if (order.requirePhotos && photos.length === 0)` evaluates to `false`.
- The request succeeds (HTTP 200) even when `requirePhotos === true`, bypassing the photo requirement completely.
- `flat.photos` persists invalid, empty, or whitespace strings directly into `data/database.json`.
- At line 5281 (`dispatchServiceNotifications`), `const photosCount = Array.isArray(flat.photos) ? flat.photos.length : 0;` reports fake photo counts in WhatsApp and email notifications (e.g. `📷 1 foto(s) disponíveis no sistema`).
- In the admin tracking panel modal (`artifacts/limpeza/src/pages/service-orders.tsx`), rendering `flat.photos` results in broken image elements (`<img src="   " />`).

### 1.3 Photo Upload Route Comparison
File: `artifacts/api-server/demo-server.mjs:8314`:
```javascript
if (typeof p === "string" && p.trim()) { ... }
```
The photo upload route (`POST /api/service/public/:token/flats/:flatId/photos`) already validates `typeof p === "string" && p.trim()`, but the `finish` route omitted this sanitization.

### 1.4 Review of Challenger 1 Test Scripts
1. **`tests/test-midnight-logic-audit.mjs`**:
   - Executed via `node tests/test-midnight-logic-audit.mjs`.
   - Exit code: `0`.
   - Empirically proves that for flats completed between 21:00:00 and 23:59:59 BRT (UTC-3), naive `substring(0, 10)` generates tomorrow's UTC date, bypassing `maxFlatsPerDay` on the completion night and stealing 1 unit of quota on the following morning.
   - Proves `getExecutionDateStr(isoString)` completely resolves the issue.

2. **`tests/test-calendar-timezone-audit.mjs`**:
   - Executed via `node tests/test-calendar-timezone-audit.mjs`.
   - Exit code: `0`.
   - Empirically proves that naive `substring(0, 10)` in `GET /api/pms/calendar` (lines 9981–9982) hides active evening service blocks from the current day's calendar.
   - Proves `getExecutionDateStr(isoString)` correctly retains the block on today's calendar.

3. **`tests/adversarial-milestone1.test.mjs` (Suite 7)**:
   - Executed via `node --test tests/adversarial-milestone1.test.mjs`.
   - Output: 19 tests passed across 8 suites.
   - **Gap Identified**: Suite 7 tests only `photos: []`, omitted field, and string `'photo.jpg'`. It does **not** test arrays containing empty strings `[""]`, whitespace strings `["   "]`, non-string items `[null, 123]`, or whitespace trimming on valid photo URLs.

4. **`tests/challenger-m1-cleanflat-integrations.test.mjs`**:
   - Executed via `node --test tests/challenger-m1-cleanflat-integrations.test.mjs`.
   - Output: 9 tests passed.
   - Confirms byte-parity check, cleanFlatModes (`never`, `priority`, `always`), `serviceInProgress` injection, and clean flat finish mechanics.

---

## 2. Logic Chain

1. **Vulnerability Mechanics**:
   - Line 8235 assigns `const photos = Array.isArray(req.body.photos) ? req.body.photos : []`.
   - Any array with length > 0 satisfies `photos.length > 0`, regardless of whether the elements are empty strings, spaces, or non-strings.
   - Therefore, a client sending `{ photos: ["   "] }` bypasses the `requirePhotos` business rule.
2. **Persistence and Downstream Impacts**:
   - `flat.photos = photos` saves unvalidated elements directly into the persistent store.
   - Notification dispatchers format `flat.photos.length` as the count of available photos.
   - The frontend tracking modal attempts to display invalid URLs as images.
3. **Remedy Requirements**:
   - The array must be filtered to keep only string elements, trimmed of leading/trailing whitespace, and filtered to retain only non-empty strings.
   - If `order.requirePhotos === true` and the sanitized array is empty, HTTP 400 must be returned.
   - When valid URLs with whitespace are supplied (e.g. `["  https://domain.com/photo.jpg  "]`), they must be trimmed and stored cleanly.
   - If `order.requirePhotos === false`, any provided whitespace/empty elements must be sanitized to `[]`.
4. **Mirror Consistency**:
   - Any change to `artifacts/api-server/demo-server.mjs` must be synchronized byte-for-byte to `scripts/demo-server.mjs`.

---

## 3. Caveats

1. The backend stores photos as URL or data URL strings. The sanitization filters for `typeof p === "string"` and non-empty trimmed content (`p.trim().length > 0`). It does not validate image MIME types or protocol schemes at the finish endpoint since photos may either be Cloudflare R2 URLs or local data URLs generated during offline/fallback operations.
2. No source code modifications were made during this investigation, in strict adherence to read-only constraints.

---

## 4. Conclusion

### Required Code Fix for Worker M1

In `artifacts/api-server/demo-server.mjs` and mirror `scripts/demo-server.mjs`, replace lines 8234–8238:

#### Before:
```javascript
  // 2. Se requirePhotos: true na ordem: photos não pode ser vazio (400 if empty)
  const photos = Array.isArray(req.body.photos) ? req.body.photos : [];
  if (order.requirePhotos && photos.length === 0) {
    return res.status(400).json({ error: "É obrigatório anexar pelo menos 1 foto para finalizar este serviço." });
  }
```

#### After:
```javascript
  // 2. Se requirePhotos: true na ordem: photos não pode ser vazio (400 if empty)
  const rawPhotos = Array.isArray(req.body.photos) ? req.body.photos : [];
  const photos = rawPhotos
    .filter(p => typeof p === "string")
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (order.requirePhotos && photos.length === 0) {
    return res.status(400).json({ error: "É obrigatório anexar pelo menos 1 foto para finalizar este serviço." });
  }
```

### Required Test Augmentation in `tests/adversarial-milestone1.test.mjs`

In `Suite 7: Photo Attachment Validation on Finish`, add test case 7.3:
```javascript
    it('7.3 Order with requirePhotos=true rejects finish with array containing only empty/whitespace/non-string items (400) and trims valid photos', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Photo Whitespace & Sanitization Test',
          requirePhotos: true,
          cleanFlatMode: 'always',
          flats: [1]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Photo Whitespace Worker', cpf: '99988877766' } })
      });

      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, { method: 'POST', headers: publicHeaders });

      // 1. Array with empty string -> 400
      const resEmptyString = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: [""], needsCleaning: false })
      });
      assert.strictEqual(resEmptyString.status, 400);

      // 2. Array with whitespace strings -> 400
      const resWhitespace = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: ["   ", "\t\n  "], needsCleaning: false })
      });
      assert.strictEqual(resWhitespace.status, 400);

      // 3. Array with non-strings only -> 400
      const resNonStrings = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: [null, 123, false, {}], needsCleaning: false })
      });
      assert.strictEqual(resNonStrings.status, 400);

      // 4. Array with mixed whitespace and valid URL -> 200, valid URL trimmed and preserved
      const resValidMixed = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          photos: ["  https://example.com/p1.jpg  ", "   ", ""],
          needsCleaning: false
        })
      });
      assert.strictEqual(resValidMixed.status, 200);
      const dataValid = await resValidMixed.json();
      assert.strictEqual(dataValid.flat.status, 'done');
      assert.deepStrictEqual(dataValid.flat.photos, ['https://example.com/p1.jpg']);
    });
```

---

## 5. Verification Method

### Step-by-Step Instructions for Worker M1

1. **Apply the 3 Code Fixes**:
   - **Fix 1 (Daily Limit Timezone)** in `artifacts/api-server/demo-server.mjs:8159`:
     ```javascript
     const doneTodayCount = (order.flats || []).filter(f => f.status === "done" && f.finishedAt && getExecutionDateStr(f.finishedAt) === todayStr).length;
     ```
   - **Fix 2 (Photo Sanitization)** in `artifacts/api-server/demo-server.mjs:8234-8238`:
     ```javascript
     const rawPhotos = Array.isArray(req.body.photos) ? req.body.photos : [];
     const photos = rawPhotos
       .filter(p => typeof p === "string")
       .map(p => p.trim())
       .filter(p => p.length > 0);

     if (order.requirePhotos && photos.length === 0) {
       return res.status(400).json({ error: "É obrigatório anexar pelo menos 1 foto para finalizar este serviço." });
     }
     ```
   - **Fix 3 (PMS Calendar Block Timezone)** in `artifacts/api-server/demo-server.mjs:9981-9982`:
     ```javascript
     const startDate = getExecutionDateStr(oflat.startedAt);
     const endDate = getExecutionDateStr(oflat.estimatedFinishAt);
     ```

2. **Sync the Server Mirror**:
   Copy the modified primary server file to the mirror location:
   ```powershell
   Copy-Item -Path artifacts/api-server/demo-server.mjs -Destination scripts/demo-server.mjs -Force
   ```
   Verify 0 byte difference:
   ```powershell
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```
   *Expected*: No differences printed.

3. **Add Test Case 7.3 to `tests/adversarial-milestone1.test.mjs`**:
   Insert the test case defined in Section 4 above into Suite 7.

4. **Execute Verification Tests**:
   ```powershell
   node tests/test-midnight-logic-audit.mjs
   node tests/test-calendar-timezone-audit.mjs
   node --test tests/adversarial-milestone1.test.mjs
   node --test tests/challenger-m1-cleanflat-integrations.test.mjs
   ```
   *Expected*: All tests pass with exit code `0`.

---

### Step-by-Step Instructions for Reviewers / Challengers

1. **Verify Mirror Parity**:
   ```powershell
   git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```
   *Pass Condition*: Zero output / identical files.

2. **Verify Code Diff**:
   Inspect git diff for:
   - Line ~8159 using `getExecutionDateStr(f.finishedAt)`
   - Line ~8234 sanitizing `rawPhotos` with `.filter`, `.map`, `.filter`
   - Lines ~9981-9982 using `getExecutionDateStr` for `startDate` and `endDate`

3. **Run Independent Boundary Checks**:
   ```powershell
   node tests/test-midnight-logic-audit.mjs
   node tests/test-calendar-timezone-audit.mjs
   ```
   *Pass Condition*: Both scripts exit with code `0`.

4. **Run Complete Milestone 1 Test Suites**:
   ```powershell
   node --test tests/adversarial-milestone1.test.mjs
   node --test tests/challenger-m1-cleanflat-integrations.test.mjs
   ```
   *Pass Condition*: 20+ tests pass in `adversarial-milestone1.test.mjs` (including Suite 7 photo sanitization) and 9 tests pass in `challenger-m1-cleanflat-integrations.test.mjs`.

5. **Verify Database Cleanliness**:
   ```powershell
   git status data/database.json
   ```
   *Pass Condition*: `database.json` retains its backup integrity, with no dangling test orders or corrupted array keys.
