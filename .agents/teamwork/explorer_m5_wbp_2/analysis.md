# Architectural Analysis & Implementation Blueprint: Feature 27 Provisional Adapters, Server Mounting, and Twin Parity

**Author**: Explorer 2 (Milestone 5)  
**Date**: 2026-10-14  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m5_wbp_2`  
**Reference Directives**: `ORIGINAL_REQUEST.md` (R6, R7, R10), `docs/integracoes/webbookingpro/PROJECT.md` (F25, F26, F27), `AGENTS.md`, and Orchestrator Directive `2026-10-14T03:34:19Z`.

---

## 1. Executive Summary

Milestone 5 completes the backend integration surface of WebBookingPro (WBP) by delivering:
1. **Feature 27 (R7) — Provisional Reviews & Messages Adapters**: Isolated behind `artifacts/api-server/wbp/provisional.mjs`, disabled by default (`provisionalMessagesEnabled = false`, `provisionalReviewsEnabled = false`), clearly marked as provisional/experimental, and bridging WBP with existing PMS chat (`whatsapp-chat.tsx` / `chat-service.mjs`) and Review Insights (`review-insights.tsx`).
2. **Backend API Route Mounting in `demo-server.mjs`**: Exposing Admin Reauth (`/api/wbp/vault/reauth`), Secure Card Viewing (`/api/wbp/vault/view`), Card Purge Trigger (`/api/wbp/vault/purge`), and Provisional Chat/Review endpoints (`/api/wbp/provisional/*`).
3. **Daily Card Auto-Purge Scheduler**: Wired into server lifecycle in `demo-server.mjs`, running every 24 hours when `NODE_ENV !== "test"`, using `.unref()` timers to avoid hanging tests or processes.
4. **Twin Parity Strategy**: Enforcing 100% byte-for-byte SHA-256 identity between `artifacts/api-server/` and `scripts/` (`provisional.mjs`, `vault.mjs`, `config.mjs`, and `demo-server.mjs`).
5. **WBP Simulator Extensions**: Updating `e2e/wbp-simulator/server.mjs` and `schemas/index.mjs` to support `/GetMessages`, `/SendMessage`, `/GetReviews`, and `/RespondReview` with OpenAPI schema validation and programmable simulation states.

---

## 2. Investigation of WBP OpenAPI Specification & Documentation Gaps

### 2.1 Analysis of `wbpAPI.yaml` & `wbp_docs`
Inspection of `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\wbpAPI.yaml` and `README.md` reveals severe specification gaps regarding messages and reviews:

1. **`/GetMessages` (Lines 3737–3809 in `wbpAPI.yaml`)**:
   - **Request**: Example specifies `verb: "RespondMessage"` instead of `"GetMessages"` (Erratum documentation gap). Common auth envelope is present (`wbp_property_id`, `wbp_property_password`, `guid`, `pms_cid`, `shared_secret`).
   - **Response**: The OpenAPI schema specifies only `{ success: true }` or `response_error`. The payload structure of messages returned is completely omitted in the official schema!
2. **`/SendMessage` (Lines 3810–3883 in `wbpAPI.yaml`)**:
   - **Request**: Common auth envelope, plus `wbp_Message_id: 111`. Does not describe message text/payload schema.
   - **Response**: Simple `{ success: true }`.
3. **`/GetReviews` (Lines 3590–3662 in `wbpAPI.yaml`)**:
   - **Request**: Example specifies `verb: "RespondReview"` instead of `"GetReviews"`.
   - **Response**: Only `{ success: true }`. Review fields (author, rating, comments, dates) are not described.
4. **`/RespondReview` (Lines 3663–3736 in `wbpAPI.yaml`)**:
   - **Request**: Common auth envelope, plus `wbp_review_id: 111`.
   - **Response**: Simple `{ success: true }`.

### 2.2 Requirement R7 Rationale
Because the upstream specification is incomplete and WebBookingPro has not published standard payload schemas for these modules, Requirement R7 strictly mandates:
- **Strict Isolation**: Implementation isolated in a dedicated adapter (`provisional.mjs`).
- **Toggled OFF by Default**: `provisionalMessagesEnabled = false` and `provisionalReviewsEnabled = false`.
- **Zero Inadvertent Outbound Traffic**: When toggled off or when integration mode is `off`, zero outbound calls are made.
- **Provisional Notice**: All responses explicitly carry `{ provisional: true, experimental: true, notice: "..." }`.

---

## 3. Analysis of Existing Guest-Flow-Manager Chat & Reviews Architecture

### 3.1 Chat Architecture (`artifacts/limpeza/src/pages/whatsapp-chat.tsx` & `chat-service.mjs`)
- **Frontend Contract**: `whatsapp-chat.tsx` manages `ChatMessage` objects:
  ```typescript
  interface ChatMessage {
    id: string;
    fromMe: boolean;
    sender?: 'guest' | 'operator' | 'system';
    senderName?: string;
    text: string;
    timestamp: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed';
    channel?: string;
  }
  ```
- **Backend Endpoints**: Currently served at `/api/whatsapp/chat/conversations` and `/api/whatsapp/chat/send`.
- **Bridging Requirement**: `provisional.mjs` must provide a mapping layer that transforms WBP raw messages into the canonical `ChatMessage` structure, tagging them with `channel: "wbp"` and `provisional: true`.

### 3.2 Review Insights Architecture (`artifacts/limpeza/src/pages/review-insights.tsx`)
- **Frontend Contract**: `review-insights.tsx` manages reviews with fields:
  ```typescript
  interface ReviewItem {
    id: string;
    author: string;
    rating: number; // 1-5 scale (or 1-10 scaled to 1-5)
    rawRating?: number;
    channel: string;
    flatMentioned?: string;
    comment: string;
    date: string;
    tone: 'positive' | 'negative' | 'neutral';
    status: 'pending' | 'answered';
    response?: string | null;
  }
  ```
- **Backend Endpoints**: Currently served at `/api/ai/reviews` and `/api/ai/sentiment/overview`.
- **Bridging Requirement**: `provisional.mjs` maps WBP reviews into canonical review objects with calculated sentiment tones and response status.

---

## 4. Architecture of Feature 27: `artifacts/api-server/wbp/provisional.mjs`

### 4.1 Module Structure & Exports
The dedicated module `artifacts/api-server/wbp/provisional.mjs` will export:
- `WbpProvisionalAdapter`: Main class implementing the bridge.
- `getProvisionalAdapter(client, db)`: Factory / singleton helper.
- Configuration helpers: `isProvisionalMessagesEnabled(db)`, `isProvisionalReviewsEnabled(db)`, `setProvisionalMessagesEnabled(enabled, db)`, `setProvisionalReviewsEnabled(enabled, db)`.

### 4.2 Configuration & General Switch Guard
```javascript
export function isProvisionalMessagesEnabled(db = null) {
  if (process.env.WBP_PROVISIONAL_MESSAGES_ENABLED === "true") return true;
  return db?.settings?.wbp_provisional_messages_enabled === true; // Default false
}

export function isProvisionalReviewsEnabled(db = null) {
  if (process.env.WBP_PROVISIONAL_REVIEWS_ENABLED === "true") return true;
  return db?.settings?.wbp_provisional_reviews_enabled === true; // Default false
}
```

### 4.3 Adapter Methods Specification

#### 1. `getMessages({ propertyId, db, limit = 50, bypassSwitch = false })`
- **Guard**: If general switch is `off` (and `!bypassSwitch`), returns `{ success: true, enabled: false, provisional: true, messages: [], reason: "Integration disabled" }`.
- **Toggle Guard**: If `!isProvisionalMessagesEnabled(db)` (and `!bypassSwitch`), returns `{ success: true, enabled: false, provisional: true, messages: [], notice: "Provisional messages feature is disabled by default" }`.
- **Execution**: Calls `client.request("GetMessages", { wbp_property_id: propertyId || client.wbpPropertyId }, { bypassSwitch })`.
- **Normalization**:
  ```javascript
  const rawList = res?.Messages || res?.messages || [];
  const normalized = rawList.map((m, idx) => ({
    id: `wbp_msg_${m.wbp_Message_id || m.id || idx}`,
    wbpMessageId: m.wbp_Message_id || m.id || null,
    orderId: m.order_id || m.OrderId || null,
    fromMe: m.sender !== "guest" && m.sender !== "customer",
    sender: m.sender === "guest" || m.sender === "customer" ? "guest" : "operator",
    senderName: m.senderName || (m.sender === "guest" ? "Hóspede OTA" : "CorpFlats"),
    text: m.message || m.text || m.body || "",
    timestamp: m.timestamp || m.date || new Date().toISOString(),
    channel: m.channel || "wbp",
    status: "delivered",
    provisional: true
  }));
  return {
    success: true,
    enabled: true,
    provisional: true,
    experimental: true,
    count: normalized.length,
    messages: normalized,
    notice: "Provisional messages adapter: official WebBookingPro schema is unconfirmed."
  };
  ```

#### 2. `sendMessage({ propertyId, messageId, recipient, text, channel = "wbp", db, bypassSwitch = false })`
- **Guard**: Validates `isProvisionalMessagesEnabled(db)` and `text`. If disabled, throws error or returns `{ success: false, enabled: false, provisional: true, error: "Provisional messages feature is disabled by default." }`.
- **Execution**: Calls `client.request("SendMessage", { wbp_property_id: propertyId || client.wbpPropertyId, wbp_Message_id: messageId || 111, message: text }, { bypassSwitch })`.
- **Response**: `{ success: true, provisional: true, experimental: true, messageId: res.wbp_Message_id || messageId, text, sentAt: new Date().toISOString() }`.

#### 3. `getReviews({ propertyId, db, limit = 50, bypassSwitch = false })`
- **Guard**: Validates general switch & `isProvisionalReviewsEnabled(db)`. If disabled, returns empty list with notice.
- **Execution**: Calls `client.request("GetReviews", { wbp_property_id: propertyId || client.wbpPropertyId }, { bypassSwitch })`.
- **Normalization**:
  ```javascript
  const rawList = res?.Reviews || res?.reviews || [];
  const normalized = rawList.map((r, idx) => {
    const rawRating = Number(r.rating || r.score || 5);
    const starRating = rawRating > 5 ? Math.max(1, Math.min(5, Math.round(rawRating / 2))) : Math.max(1, Math.min(5, Math.round(rawRating)));
    const tone = (rawRating >= 8 || starRating >= 4) ? "positive" : (rawRating <= 4 || starRating <= 2 ? "negative" : "neutral");
    return {
      id: `wbp_rev_${r.wbp_review_id || r.id || idx}`,
      wbpReviewId: r.wbp_review_id || r.id || null,
      orderId: r.order_id || r.OrderId || null,
      author: r.guest_name || r.customer_name || r.author || "Hóspede OTA",
      rating: starRating,
      rawRating,
      channel: r.channel || "wbp",
      flatMentioned: r.flatNumber || r.room || "",
      comment: r.comment || r.text || r.review || "",
      date: r.review_date || r.date || new Date().toISOString().slice(0, 10),
      tone,
      status: r.response ? "answered" : "pending",
      response: r.response || null,
      provisional: true
    };
  });
  return {
    success: true,
    enabled: true,
    provisional: true,
    experimental: true,
    count: normalized.length,
    reviews: normalized,
    notice: "Provisional reviews adapter: official WebBookingPro schema is unconfirmed."
  };
  ```

#### 4. `respondReview({ propertyId, reviewId, responseText, db, bypassSwitch = false })`
- **Guard**: Validates `isProvisionalReviewsEnabled(db)`, `reviewId`, and `responseText`.
- **Execution**: Calls `client.request("RespondReview", { wbp_property_id: propertyId || client.wbpPropertyId, wbp_review_id: reviewId, response: responseText }, { bypassSwitch })`.
- **Response**: `{ success: true, provisional: true, experimental: true, reviewId, response: responseText, respondedAt: new Date().toISOString() }`.

---

## 5. Simulator Extensions (`e2e/wbp-simulator/`)

To validate Feature 27 in automated end-to-end tests against the official OpenAPI specification:

### 5.1 Updates to `e2e/wbp-simulator/server.mjs`
1. **Extend verb registry**:
   ```javascript
   const verbs = [
     "HealthCheck",
     "SetupProperty",
     "GetRoomTypes",
     "GetRatePlans",
     "ARIUpdate",
     "GetBookingList",
     "GetBookingId",
     "AckBooking",
     "GetMessages",
     "SendMessage",
     "GetReviews",
     "RespondReview"
   ];
   ```
2. **Add state containers**:
   - `this.simulatedMessages = [];`
   - `this.simulatedReviews = [];`
   - `this.sentMessagesHistory = [];`
   - `this.reviewResponsesHistory = [];`
3. **Endpoint Handlers**:
   - `case "GetMessages"`: returns `{ success: true, Messages: this.simulatedMessages }`.
   - `case "SendMessage"`: records to `this.sentMessagesHistory` and returns `{ success: true, wbp_Message_id: req.body?.wbp_Message_id || 111 }`.
   - `case "GetReviews"`: returns `{ success: true, Reviews: this.simulatedReviews }`.
   - `case "RespondReview"`: records to `this.reviewResponsesHistory` and returns `{ success: true, wbp_review_id: req.body?.wbp_review_id || 111 }`.
4. **Simulator programmatic test controls**:
   - `injectMessage(msg)`: pushes to `this.simulatedMessages`.
   - `injectReview(review)`: pushes to `this.simulatedReviews`.
   - `getSentMessages()`: returns history copy.
   - `getReviewResponses()`: returns history copy.
   - `reset()`: clears simulated messages and reviews.

### 5.2 Updates to `e2e/wbp-simulator/schemas/index.mjs`
1. **Tolerant verb handling in `validateCommonEnvelope`**:
   - When `options.tolerant` is true:
     - `expectedVerb === "GetMessages"` accepts `body.verb === "RespondMessage"` (matching `wbpAPI.yaml` example).
     - `expectedVerb === "GetReviews"` accepts `body.verb === "RespondReview"` (matching `wbpAPI.yaml` example).
2. **Schema validation in `validateRequest`**:
   - `case "GetMessages"`: verifies common envelope.
   - `case "SendMessage"`: verifies common envelope and presence of `wbp_Message_id` or `message` or `text`.
   - `case "GetReviews"`: verifies common envelope.
   - `case "RespondReview"`: verifies common envelope and presence of `wbp_review_id` or `response`.

---

## 6. Backend API Route Mounting Blueprint in `artifacts/api-server/demo-server.mjs`

All routes are mounted cleanly into `demo-server.mjs` alongside the existing WBP routes (lines 790–1466):

### 6.1 Imports to add to `demo-server.mjs`
```javascript
import {
  CreditCardVault,
  getCardVault,
  startCardAutoPurgeScheduler,
  stopCardAutoPurgeScheduler
} from "./wbp/vault.mjs";

import {
  WbpProvisionalAdapter,
  getProvisionalAdapter,
  isProvisionalMessagesEnabled,
  isProvisionalReviewsEnabled,
  setProvisionalMessagesEnabled,
  setProvisionalReviewsEnabled
} from "./wbp/provisional.mjs";
```

### 6.2 Instance Initialization
```javascript
const wbpVault = getCardVault();
const wbpProvisional = getProvisionalAdapter(wbpClient, db);
```

### 6.3 Credit Card Vault Endpoints (Features 25 & 26 — R6)

#### 1. `POST /api/wbp/vault/reauth`
- **Purpose**: Authenticates admin user with password re-entry and issues a 5-minute single-use token.
- **Handler Logic**:
  ```javascript
  app.post("/api/wbp/vault/reauth", (req, res) => {
    try {
      const { username, password } = req.body || {};
      const authUser = getAuthUser(req);
      const targetUsername = username || authUser?.username;

      if (!targetUsername || !password) {
        return res.status(400).json({ success: false, error: "Usuário e senha são obrigatórios." });
      }

      const user = (db.users || []).find(u => u.username === targetUsername && u.role === "admin");
      if (!user) {
        logAuditEvent({
          action: "WBP_VAULT_REAUTH_FAILED",
          level: "warning",
          category: "security",
          details: { username: targetUsername, reason: "Usuário não é administrador ou não existe." }
        });
        return res.status(401).json({ success: false, error: "Credenciais de administrador inválidas." });
      }

      const isValid = verifyPassword(password, user.passwordHash);
      if (!isValid) {
        logAuditEvent({
          action: "WBP_VAULT_REAUTH_FAILED",
          level: "warning",
          category: "security",
          details: { username: targetUsername, reason: "Senha incorreta." }
        });
        return res.status(401).json({ success: false, error: "Credenciais de administrador inválidas." });
      }

      const tokenData = wbpVault.createReauthToken(targetUsername);
      logAuditEvent({
        action: "WBP_VAULT_REAUTH_SUCCESS",
        level: "info",
        category: "security",
        details: { username: targetUsername, expiresInSeconds: 300 }
      });

      res.json({
        success: true,
        token: tokenData.token,
        expiresInSeconds: 300,
        expiresAt: tokenData.expiresAt
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  ```

#### 2. `POST /api/wbp/vault/view`
- **Purpose**: Decrypts and returns card details for a 1-time view. Invalidate token immediately. Audits the event.
- **Handler Logic**:
  ```javascript
  app.post("/api/wbp/vault/view", (req, res) => {
    try {
      const { token, bookingId, reservationId } = req.body || {};
      const identifier = bookingId || reservationId;

      if (!token || !identifier) {
        return res.status(400).json({ success: false, error: "Token e identificador da reserva (bookingId) são obrigatórios." });
      }

      // Invalidate token immediately upon consumption (SINGLE-USE!)
      const tokenUser = wbpVault.consumeReauthToken(token);
      if (!tokenUser) {
        logAuditEvent({
          action: "WBP_VAULT_VIEW_UNAUTHORIZED",
          level: "warning",
          category: "security",
          details: { identifier, reason: "Token inválido, expirado ou já utilizado." }
        });
        return res.status(403).json({ success: false, error: "Token de visualização inválido, expirado ou já utilizado." });
      }

      const cardData = wbpVault.decryptCardByIdentifier(identifier, db);
      if (!cardData) {
        return res.status(404).json({ success: false, error: "Cartão de crédito não encontrado para a reserva informada." });
      }

      // Assert CVV is NEVER present
      delete cardData.cvv;
      delete cardData.card_cvv;
      delete cardData.security_code;

      logAuditEvent({
        action: "WBP_CARD_VIEWED",
        level: "info",
        category: "security",
        details: {
          identifier,
          viewedBy: tokenUser.username,
          cardBrand: cardData.brand || "unknown",
          maskedPan: cardData.maskedPan || `•••• •••• •••• ${String(cardData.pan).slice(-4)}`
        }
      });

      res.json({
        success: true,
        card: cardData
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  ```

#### 3. `POST /api/wbp/vault/purge`
- **Purpose**: Manual or scheduled trigger to purge expired cards (7 days post check-out or cancelled without penalty).
- **Handler Logic**:
  ```javascript
  app.post("/api/wbp/vault/purge", (req, res) => {
    try {
      const { currentDate, user = "admin" } = req.body || {};
      const effectiveDate = currentDate || getTodayStr();
      const purgedCount = wbpVault.purgeExpiredCards(effectiveDate, db);

      if (purgedCount > 0) {
        saveDatabase("wbp_vault_manual_purge");
        logAuditEvent({
          action: "WBP_CARDS_PURGED",
          level: "info",
          category: "security",
          details: { purgedCount, effectiveDate, triggeredBy: user }
        });
      }

      res.json({
        success: true,
        purgedCount,
        effectiveDate
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  ```

---

### 6.4 Provisional Chat & Review Endpoints (Feature 27 — R7)

#### 1. `GET /api/wbp/provisional/messages`
```javascript
app.get("/api/wbp/provisional/messages", async (req, res) => {
  try {
    const { propertyId, limit } = req.query;
    const result = await wbpProvisional.getMessages({ propertyId, db, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, provisional: true, error: err.message });
  }
});
```

#### 2. `POST /api/wbp/provisional/messages/send`
```javascript
app.post("/api/wbp/provisional/messages/send", async (req, res) => {
  try {
    const { messageId, text, recipient, channel } = req.body || {};
    if (!text) {
      return res.status(400).json({ success: false, error: "Campo 'text' é obrigatório." });
    }
    const result = await wbpProvisional.sendMessage({ messageId, text, recipient, channel, db });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, provisional: true, error: err.message });
  }
});
```

#### 3. `GET /api/wbp/provisional/reviews`
```javascript
app.get("/api/wbp/provisional/reviews", async (req, res) => {
  try {
    const { propertyId, limit } = req.query;
    const result = await wbpProvisional.getReviews({ propertyId, db, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, provisional: true, error: err.message });
  }
});
```

#### 4. `POST /api/wbp/provisional/reviews/respond`
```javascript
app.post("/api/wbp/provisional/reviews/respond", async (req, res) => {
  try {
    const { reviewId, responseText } = req.body || {};
    if (!reviewId || !responseText) {
      return res.status(400).json({ success: false, error: "'reviewId' e 'responseText' são obrigatórios." });
    }
    const result = await wbpProvisional.respondReview({ reviewId, responseText, db });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, provisional: true, error: err.message });
  }
});
```

#### 5. `GET /api/wbp/provisional/settings` & `POST /api/wbp/provisional/settings`
```javascript
app.get("/api/wbp/provisional/settings", (req, res) => {
  res.json({
    success: true,
    provisional: true,
    messagesEnabled: isProvisionalMessagesEnabled(db),
    reviewsEnabled: isProvisionalReviewsEnabled(db)
  });
});

app.post("/api/wbp/provisional/settings", (req, res) => {
  try {
    const { messagesEnabled, reviewsEnabled } = req.body || {};
    if (messagesEnabled !== undefined) {
      setProvisionalMessagesEnabled(messagesEnabled, db);
    }
    if (reviewsEnabled !== undefined) {
      setProvisionalReviewsEnabled(reviewsEnabled, db);
    }
    saveDatabase("wbp_provisional_settings_update");
    res.json({
      success: true,
      provisional: true,
      messagesEnabled: isProvisionalMessagesEnabled(db),
      reviewsEnabled: isProvisionalReviewsEnabled(db)
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});
```

---

## 7. Schedulers & Server Lifecycle Integration

### 7.1 Daily Card Auto-Purge Scheduler
In `artifacts/api-server/wbp/vault.mjs` and wired in `demo-server.mjs`:
- The purge scheduler runs once every 24 hours (`24 * 60 * 60 * 1000`).
- **`.unref()` Timer Protection**: The timer must call `.unref()` so that running tests or CLI scripts are not held hostage waiting for the 24h timer to fire.
- **Server Startup Wiring** (`demo-server.mjs` line ~36303):
  ```javascript
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Demo Server] API rodando em http://0.0.0.0:${PORT}`);
    setAuditLogger(logAuditEvent);
    if (process.env.NODE_ENV !== "test") {
      startMonitoringEngine();
      if (isWbpEnabled(db)) {
        wbpWorker.start();
        wbpAlertsManager.startDailySummaryScheduler(db);
        startCardAutoPurgeScheduler(db, wbpVault);
      }
    }
  });
  ```
- **Dynamic Mode Switch Wiring** (`demo-server.mjs` line ~805):
  ```javascript
  app.post("/api/wbp/mode", (req, res) => {
    // ...
    if (process.env.NODE_ENV !== "test") {
      if (updated === "auto" || updated === "observe") {
        wbpWorker.start();
        wbpAlertsManager.startDailySummaryScheduler(db);
        startCardAutoPurgeScheduler(db, wbpVault);
      } else if (updated === "off") {
        wbpWorker.stop();
        wbpAlertsManager.stopDailySummaryScheduler();
        stopCardAutoPurgeScheduler();
      }
    }
    // ...
  });
  ```

---

## 8. Twin Parity Strategy

### 8.1 Files Subject to 100% SHA-256 Parity
Under R10 of `ORIGINAL_REQUEST.md` and `AGENTS.md`, every server and integration file has an exact twin that must match byte-for-byte:
1. `artifacts/api-server/demo-server.mjs` ↔ `scripts/demo-server.mjs`
2. `artifacts/api-server/wbp/provisional.mjs` ↔ `scripts/wbp/provisional.mjs`
3. `artifacts/api-server/wbp/vault.mjs` ↔ `scripts/wbp/vault.mjs`
4. `artifacts/api-server/wbp/config.mjs` ↔ `scripts/wbp/config.mjs`
5. `artifacts/api-server/wbp/client.mjs` ↔ `scripts/wbp/client.mjs`

### 8.2 Safe Workflow Protocol
1. **Primary Edits**: Implement code in `artifacts/api-server/`.
2. **Mirroring Step**: Copy identical files to `scripts/`:
   ```powershell
   Copy-Item -Path "artifacts/api-server/wbp/provisional.mjs" -Destination "scripts/wbp/provisional.mjs" -Force
   Copy-Item -Path "artifacts/api-server/wbp/config.mjs" -Destination "scripts/wbp/config.mjs" -Force
   Copy-Item -Path "artifacts/api-server/demo-server.mjs" -Destination "scripts/demo-server.mjs" -Force
   ```
3. **Automated Verification**:
   Execute hash check:
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
   Get-FileHash artifacts/api-server/wbp/*.mjs, scripts/wbp/*.mjs | Sort-Object Hash
   ```
4. **Test Assertion**: The test suite `m5-vault-ui.test.mjs` contains explicit assertions verifying that `artifacts/api-server/demo-server.mjs` hash matches `scripts/demo-server.mjs` hash, and each `wbp/*.mjs` file matches its `scripts/wbp/*.mjs` twin.

---

## 9. Targeted Test Suite Design (`tests/wbp-integration/m5-vault-ui.test.mjs`)

The test suite follows the established repository patterns:
- Isolated ephemeral server (`PORT = 0`).
- `NODE_ENV = "test"` and `DATABASE_URL` deleted before imports.
- `DATA_FILE` and `AUDIT_LOG_FILE` in `os.tmpdir()`.
- Real `data/database.json` hash and mtime verified unchanged before and after test execution.

### Test Matrix:
1. **Provisional Defaults & General Switch Safety**:
   - `isProvisionalMessagesEnabled` returns `false` by default.
   - `isProvisionalReviewsEnabled` returns `false` by default.
   - When mode is `off`, calling `/api/wbp/provisional/messages` returns disabled response and 0 outbound requests are made to simulator.
2. **Provisional Messages against WBP Simulator**:
   - Enable provisional messages.
   - Inject messages in `WBPSimulator`.
   - Call `GET /api/wbp/provisional/messages` -> simulator validates schema -> response returns mapped `ChatMessage` items with `channel: "wbp"` and `provisional: true`.
   - Call `POST /api/wbp/provisional/messages/send` -> simulator validates `SendMessage` -> returns success.
3. **Provisional Reviews against WBP Simulator**:
   - Enable provisional reviews.
   - Inject reviews in `WBPSimulator`.
   - Call `GET /api/wbp/provisional/reviews` -> simulator validates schema -> response returns mapped reviews with star ratings and sentiment tone.
   - Call `POST /api/wbp/provisional/reviews/respond` -> simulator validates `RespondReview` -> returns success.
4. **Admin Reauth & Token Viewing**:
   - Non-admin or bad password fails with 401.
   - Admin reauth succeeds and returns 5-min token.
   - Call `/api/wbp/vault/view` with token -> returns decrypted PAN.
   - Call `/api/wbp/vault/view` a second time with the SAME token -> rejected with 403 (single-use enforced).
   - Zero CVV in response, storage, or logs.
   - Audit event `WBP_CARD_VIEWED` recorded in `audit_logs.jsonl` with masked PAN only.
5. **Card Purge via API & Scheduler**:
   - Expired card (>7 days post checkout) and cancelled reservation card are purged.
   - Active card is retained.
   - Scheduler initializes with `.unref()` timer and does not block process exit.
6. **Twin Parity Verification**:
   - Asserts SHA-256 match for all twin files.
