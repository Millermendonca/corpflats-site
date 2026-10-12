# Handoff Report — Explorer 1: Backend WhatsApp Architecture, AI Pause Bypass & Data Models

## 1. Observation

### 1.1 Inbound WhatsApp Architecture and Message Flow
- **Entry Point Server**: `scripts/demo-server.mjs` line 6449 initializes WhatsApp routes by calling:
  ```javascript
  initWhatsAppEngine(app, () => db, saveDatabase, createNotification, (text, ctx) => analyzeTextSentimentWithAI(text, ctx));
  ```
  Corresponding twin file: `artifacts/api-server/demo-server.mjs` line 6449.
- **Webhook Receiver**: `scripts/zapi-service.mjs` lines 5888–6134 defines `app.post("/api/whatsapp/webhook/received", async (req, res) => { ... })`.
  - Line 5905: `const incomingInfo = extractIncomingMessageInfo(req.body);`
  - Line 5916: `const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);`
  - Line 5920: `updatedConv = appendMessageToConversation(db, { ... });`
  - Lines 5951–5960: When `incomingInfo.fromMe` (operator sends message from WhatsApp client):
    ```javascript
    const conv = updatedConv || (db.whatsappConversations || []).find(c => matchClientPhone(c.phone, cleanTarget));
    if (conv) {
      conv.aiPaused = true;
      conv.aiPausedAt = incomingInfo.timestamp || new Date().toISOString();
      conv.aiPausedReason = "operator_manual_reply";
    }
    ```
  - Lines 6119–6131: When `!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget`, invokes:
    ```javascript
    processAiInboundMessage({
      db,
      incomingInfo,
      cleanTarget,
      saveDatabase,
      createNotification,
      sendZapiMessage,
      appendMessageFn: appendMessageToConversation
    })
    ```
- **Autonomous AI Processing**: `scripts/whatsapp-ai-service.mjs` line 2146 defines `export async function processAiInboundMessage({ ... })`.
  - Line 2186: Checks pause state:
    ```javascript
    if (conv && conv.aiPaused === true) {
      console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
      return { skipped: true, reason: "conversation_ai_paused" };
    }
    ```
  - Lines 2282–2287: When human handover is triggered (`aiResult.shouldHandover`):
    ```javascript
    if (conv) {
      conv.aiPaused = true;
      conv.aiPausedAt = new Date().toISOString();
      conv.aiPausedReason = "guest_requested_human";
    }
    ```
  - Lines 2342–2348: Dispatches Sofia's response via `sendZapiMessage(db.zapiConfig, { phone: cleanTarget, message: aiResult.replyText, bypassTestMode: true })`.
  - Lines 2350–2360: Records Sofia's response in chat history via `appendMessageFn(db, { phone: cleanTarget, senderName: aiConfig.agentName || "Sofia", fromMe: true, text: aiResult.replyText, ... })`.

### 1.2 `aiPaused` Check, Mutation Points, and Storage
- **Storage**: Chats are stored in `db.whatsappConversations` as an array of conversation objects in `data/database.json`. Each conversation object maintains:
  - `conv.aiPaused`: `boolean` (`true` | `false`)
  - `conv.aiPausedAt`: `string` (ISO timestamp) or `null`
  - `conv.aiPausedReason`: `string` (`"operator_manual_reply"`, `"guest_requested_human"`, `"operator_toggle"`) or `null`
- **Mutations Setting `aiPaused = true`** (5 distinct places):
  1. `scripts/zapi-service.mjs:5956` — In webhook received (`/api/whatsapp/webhook/received`) when operator replies from external WhatsApp (`incomingInfo.fromMe`).
  2. `scripts/zapi-service.mjs:6538` — In `handleChatSend` (`/api/whatsapp/chat/send` and `/api/whatsapp/chats/:phone/messages`) when operator sends a message through the web UI `/whatsapp-chat`.
  3. `scripts/zapi-service.mjs:1276` — In `linkOperatorResponseToPendingFaq` when operator replies to a client with a pending FAQ.
  4. `scripts/zapi-service.mjs:6859` — In `/api/whatsapp/chat/:phone/ai-toggle` when toggled manually via web UI or API.
  5. `scripts/whatsapp-ai-service.mjs:2284` — In `processAiInboundMessage` when Sofia detects human handover intent (`aiResult.shouldHandover`).
- **Developer Phone Configuration**:
  - `scripts/zapi-service.mjs:1297`:
    ```javascript
    export const DEFAULT_TEST_ALLOWED_PHONES = [
      "22998505276", "5522998505276",
      "21997142513", "5521997142513"
    ];
    ```
  - `cleanWhatsAppPhone` at line 1123 converts `22998505276` to `5522998505276` (prepends `55` if 10 or 11 digits).
  - Unnormalized formats include `+5522998505276`, `(22) 99850-5276`, `22998505276`, `5522998505276`, and WhatsApp JID `5522998505276@c.us`.

### 1.3 `database.json` Data Model & Location for `developerGuidelines`
- Current properties in `data/database.json`:
  - `db.zapiConfig`: stores instance tokens, status, delivery modes, and `db.zapiConfig.aiAgent`.
  - `db.zapiConfig.aiAgent`: stores `enabled`, `mode`, `agentName`, `agentRole`, `responseDelaySeconds`, `offHoursStart`, `offHoursEnd`, `handoverKeywords`, `systemPrompt`, `knowledgeBase`.
  - `db.whatsappConversations`: stores conversations and message history.
  - `db.faqItems`: stores mapped and pending FAQs.
- `db.whatsappAiSettings`: Does not exist yet in `data/database.json`.
- Prompt and specification mandate:
  - Store guidelines and tone calibrations in `db.whatsappAiSettings.developerGuidelines` and `aiConfig.systemPrompt`.
  - `db.whatsappAiSettings` must be defaulted in `ensureDbDefaults()` (`scripts/zapi-service.mjs:4640`) as `{ developerGuidelines: [] }`.

### 1.4 Twin-Server Parity Audit
Executing SHA-256 hash comparison between `scripts/` and `artifacts/api-server/`:
- `demo-server.mjs`: **MATCH** (SHA-256 identical)
- `zapi-service.mjs`: **MATCH** (SHA-256 identical)
- `server-monitor-service.mjs`: **MATCH** (SHA-256 identical)
- `fnrh-pdf-service.mjs`: **MATCH** (SHA-256 identical)
- `fnrh-serpro-service.mjs`: **MATCH** (SHA-256 identical)
- `storage-service.mjs`: **MATCH** (SHA-256 identical)
- `whatsapp-ai-service.mjs`: **DIFF** (`scripts/` is 96,608 bytes vs `artifacts/api-server/` is 95,066 bytes).
  - Diff reveals `scripts/whatsapp-ai-service.mjs` has updated CorpFlats domain specifics (Soho Residence, café tray, single Wi-Fi password format) that were not synced to `artifacts/api-server/`.
- `mail-service.mjs`: **DIFF** (`scripts/` is 79,826 bytes vs `artifacts/api-server/` is 79,782 bytes).

### 1.5 Missing Endpoints for R3
- `/api/whatsapp/chat/:phone/correct-message`: **DOES NOT EXIST**.
  - Current chat routes in `scripts/zapi-service.mjs` end around line 6873 (`/api/whatsapp/chat/:phone/ai-suggest`).
  - Need to create `/api/whatsapp/chat/:phone/correct-message` and guidelines CRUD endpoints.

---

## 2. Logic Chain

1. **Root Cause of Developer Chat Muting**:
   - Because `scripts/zapi-service.mjs` sets `conv.aiPaused = true` whenever an operator replies from mobile (`incomingInfo.fromMe` at line 5956) or sends a message from the web UI (`handleChatSend` at line 6538), sending any message to or from Miller's number marks `conv.aiPaused = true`.
   - When Miller subsequently sends a message, `scripts/whatsapp-ai-service.mjs:2186` encounters `conv.aiPaused === true` and aborts with `{ skipped: true, reason: "conversation_ai_paused" }`.
   - Furthermore, if Miller triggers a test for handover ("falar com humano"), line 2284 sets `conv.aiPaused = true; conv.aiPausedReason = "guest_requested_human";`, locking the chat until manually toggled in the UI.

2. **Defense-in-Depth Solution for Developer Immunity**:
   - **Layer 1: Identification Helper (`isDeveloperPhone`)**:
     Normalizes any input (strips non-digits, checks for `22998505276`, `5522998505276`, handles DDD 22 with last 8/9 digits).
   - **Layer 2: Guarding Mutations**:
     In all 5 locations where `aiPaused = true` is set, wrap with `if (!isDeveloperPhone(targetPhone))`.
   - **Layer 3: Conversation Auto-Unpause & Flagging**:
     In `appendMessageToConversation`, if `isDeveloperPhone(cleanPhone)`, set `conv.isDeveloper = true` and `conv.aiPaused = false`.
   - **Layer 4: Inbound Active Bypass**:
     In `processAiInboundMessage:2186`, if `isDeveloperPhone(cleanTarget)`, automatically reset `conv.aiPaused = false` and continue processing instead of returning `skipped: true`.

3. **Dual Intent Engine for Developer (R1 & R2 & R3)**:
   - When `isDeveloperPhone(cleanTarget)` is true:
     - Check if message matches **Tone Calibration (R2)** (e.g., *"responda de forma mais curta por favor"*, *"use menos emojis"*, *"seja mais executiva"*):
       - Extract tone rule, update `aiConfig.toneSettings` and `aiConfig.systemPrompt`.
       - Persist to `db.whatsappAiSettings.developerGuidelines`.
       - Reply with: Cordial confirmation + Summary of guideline + Sample response in the new calibrated tone.
     - Check if message matches **Factual Correction / Instruction (R3)** (e.g., *"Sofia, para o flat 905 a informação correta é..."*, *"Sofia, o horário mudou para as 15h"*):
       - Extract rule and target (flat/reservation).
       - Persist to `db.whatsappAiSettings.developerGuidelines`.
       - Cordially confirm learning to developer.
     - Else **Guest Simulation (R1)** (e.g., *"Qual horário de check-in?"*, *"Flat 408 está livre?"*):
       - Route through standard `generateAiWhatsAppResponse`, responding as Virtual Concierge.

4. **Message Rectification Endpoint Design (R3)**:
   - Endpoint: `POST /api/whatsapp/chat/:phone/correct-message`
   - Payload:
     ```json
     {
       "correctionText": "O café da manhã é servido exclusivamente em bandeja no quarto",
       "rectificationMessage": "Olá! Gostaria de retificar uma informação...",
       "sendToGuest": true,
       "learnGuideline": true,
       "category": "cafe_da_manha",
       "flatNumber": "101"
     }
     ```
   - Actions:
     1. Cleans phone: `cleanWhatsAppPhone(req.params.phone)`.
     2. Appends new guideline to `db.whatsappAiSettings.developerGuidelines`.
     3. If `sendToGuest !== false`: dispatches `rectificationMessage` via `sendZapiMessage` with `bypassTestMode: true`, and logs to chat via `appendMessageToConversation`.
     4. Persists via `saveDatabase()`.
     5. Responds with `{ success: true, guideline, sentMessage }`.

5. **Twin Parity Realization**:
   - `scripts/whatsapp-ai-service.mjs` and `artifacts/api-server/whatsapp-ai-service.mjs` must be unified so that `scripts/` is copied to `artifacts/api-server/` prior to adding new features.
   - Any modifications made in `scripts/zapi-service.mjs` and `scripts/whatsapp-ai-service.mjs` must be synchronized 1:1 to `artifacts/api-server/`.

---

## 3. Caveats

- **No Caveats** regarding the backend flow: the code path from Z-API webhook to AI engine was traced line-by-line.
- **Frontend Note**: The Web UI button in `/whatsapp-chat` and the administrative card in `/whatsapp-automation` are part of subsequent milestones, but their backend API contract is completely established in this report.
- **Pre-existing parity drift**: `scripts/whatsapp-ai-service.mjs` and `scripts/mail-service.mjs` currently have minor differences with their counterparts in `artifacts/api-server/`. The Implementer must ensure that before or during M1/M2 implementation, both files achieve 100% SHA-256 parity.

---

## 4. Conclusion & Actionable Blueprint

### Blueprint for Implementer:

#### 1. In `scripts/zapi-service.mjs` & `artifacts/api-server/zapi-service.mjs`:
- **Line 1139 (add helper)**:
  ```javascript
  export const DEVELOPER_PHONES = ["22998505276", "5522998505276"];

  export function isDeveloperPhone(rawPhone) {
    if (!rawPhone) return false;
    const digits = String(rawPhone).replace(/\D/g, "");
    if (!digits) return false;
    if (DEVELOPER_PHONES.includes(digits)) return true;
    const clean = cleanWhatsAppPhone(digits);
    if (clean === "5522998505276" || clean === "22998505276") return true;
    if ((digits.endsWith("998505276") || digits.endsWith("98505276")) && (clean.startsWith("5522") || digits.startsWith("22"))) {
      return true;
    }
    return false;
  }
  ```
- **Line 4425 (`appendMessageToConversation`)**:
  ```javascript
  const isDev = isDeveloperPhone(cleanPhone);
  if (!conv) {
    conv = {
      // ...
      isDeveloper: isDev,
      aiPaused: isDev ? false : false,
      // ...
    };
  } else if (isDev) {
    conv.isDeveloper = true;
    conv.aiPaused = false;
  }
  ```
- **Line 1276 (`linkOperatorResponseToPendingFaq`)**:
  Wrap pause mutation: `if (conv && !isDeveloperPhone(cleanPhone)) { conv.aiPaused = true; ... }`
- **Line 5956 (`/api/whatsapp/webhook/received`)**:
  Wrap pause mutation: `if (conv && !isDeveloperPhone(cleanTarget)) { conv.aiPaused = true; ... }`
- **Line 6538 (`handleChatSend`)**:
  Wrap pause mutation: `if (updatedConv && !isDeveloperPhone(cleanPhone)) { updatedConv.aiPaused = true; ... }`
- **Line 6857 (`/api/whatsapp/chat/:phone/ai-toggle`)**:
  If `isDeveloperPhone(cleanPhone)`, prevent pausing or return informative response.
- **Line 4640 (`ensureDbDefaults`)**:
  ```javascript
  if (!db.whatsappAiSettings) {
    db.whatsappAiSettings = { developerGuidelines: [] };
  }
  if (!Array.isArray(db.whatsappAiSettings.developerGuidelines)) {
    db.whatsappAiSettings.developerGuidelines = [];
  }
  ```
- **Line 6870 (Add `/api/whatsapp/chat/:phone/correct-message`)**:
  Implement the rectification endpoint handling guideline storage, message formatting, optional Z-API dispatch, and conversation append.
- **Add Guidelines CRUD**:
  - `GET /api/whatsapp/developer-guidelines`
  - `POST /api/whatsapp/developer-guidelines`
  - `DELETE /api/whatsapp/developer-guidelines/:id`
  - `PATCH /api/whatsapp/developer-guidelines/:id`

#### 2. In `scripts/whatsapp-ai-service.mjs` & `artifacts/api-server/whatsapp-ai-service.mjs`:
- **Line 14**: Import `isDeveloperPhone`, `DEVELOPER_PHONES`.
- **Line 2185 (`processAiInboundMessage`)**:
  ```javascript
  if (conv && conv.aiPaused === true) {
    if (isDeveloperPhone(cleanTarget)) {
      console.log(`[WhatsApp AI] Imunidade do Desenvolvedor ativada para ${cleanTarget}: desfazendo aiPaused.`);
      conv.aiPaused = false;
      conv.aiPausedReason = null;
    } else {
      console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
      return { skipped: true, reason: "conversation_ai_paused" };
    }
  }
  ```
- **Line 2223**: Developer coaching and feedback interceptor:
  - Detect tone calibration regex and reply with confirmation + summary + live sample in calibrated tone.
  - Detect factual correction regex and save to `db.whatsappAiSettings.developerGuidelines`.
  - Fall back to normal `generateAiWhatsAppResponse` for guest inquiries.
- **Line 1881 (`generateAiWhatsAppResponse`)**:
  Dynamically inject `(db?.whatsappAiSettings?.developerGuidelines || []).filter(g => g.active !== false)` into the system prompt context.
- **Line 2284 (`processAiInboundMessage`)**:
  `if (conv && !isDeveloperPhone(cleanTarget)) { conv.aiPaused = true; ... }`

---

## 5. Verification Method

To independently verify all findings and validate implementations:

1. **Verify Developer Recognition & Pause Bypass**:
   Inspect functions and run unit tests checking:
   ```javascript
   assert.equal(isDeveloperPhone("22998505276"), true);
   assert.equal(isDeveloperPhone("5522998505276"), true);
   assert.equal(isDeveloperPhone("+55 (22) 99850-5276"), true);
   assert.equal(isDeveloperPhone("21997142513"), false);
   ```

2. **Verify Rectification Endpoint**:
   Invoke `POST /api/whatsapp/chat/5522998505276/correct-message` with sample payload and assert:
   - Status 200 with `{ success: true, guideline, sentMessage }`
   - Guideline is present in `db.whatsappAiSettings.developerGuidelines`
   - Rectification message is present in `db.whatsappConversations`

3. **Verify Twin-Server Parity**:
   Run PowerShell hash verification:
   ```powershell
   powershell -Command "(Get-FileHash scripts/demo-server.mjs).Hash -eq (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/zapi-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/zapi-service.mjs).Hash; (Get-FileHash scripts/whatsapp-ai-service.mjs).Hash -eq (Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs).Hash"
   ```
   All must return `True`.

4. **Targeted Unit Test Verification (AGENTS.md Compliance)**:
   Run strictly the dedicated targeted test suite:
   ```bash
   node --test tests/developer-ai-coaching.test.mjs
   ```
   (Never run global test suites like `tests/*.test.mjs`).
