# Handoff Report — Explorer 2: Maid Attribution & WhatsApp Delivery Architecture

**Agent**: Explorer 2 (Maid Attribution & WhatsApp Delivery Explorer)  
**Date**: 2026-11-10T02:00:00Z  
**Scope**: Exploration of Maid Management, Housekeeping Records, Scheduling, WhatsApp Z-API Pipeline, and November 2026 Historical Review Attribution.

---

## 1. Observation

### 1.1 Maid Identity and Directory
Direct observation of `data/database.json` and `artifacts/api-server/maid-automation-service.mjs`:
- Maids are defined in `db.users` with `role === "camareira"` or `role === "cleaner"`.
- As verified via Node.js execution on `data/database.json`:
  ```json
  [
    {
      "id": 2,
      "username": "Cris",
      "name": "Cris",
      "phone": "22988486446",
      "whatsapp": "5522988486446",
      "active": true
    },
    {
      "id": 3,
      "username": "Grazi",
      "name": "Grazi",
      "phone": "22999106204",
      "whatsapp": "5522999106204",
      "active": true
    }
  ]
  ```
- In `artifacts/api-server/maid-automation-service.mjs:661-678`, the endpoint `/api/maid-automation/config` queries these users and handles phone normalization and pixKey assignments.

### 1.2 Cleaning Records Data Model & Lifecycle
Observed in `artifacts/api-server/demo-server.mjs` (lines 21800–21950, 24038–24560, 24641–24702) and `data/database.json`:
- `db.cleaningRequests` contains 266 total records, of which 246 have `status: "clean"` (Cris: 91, Grazi: 109, legacy auto-generated: 46).
- Attributes of a cleaning request card:
  - `id`: Unique integer.
  - `flatId`: Number (e.g. `1` for Flat 113, `4` for Flat 211, `7` for Flat 313).
  - `flatNumber`: String (e.g. `"113"`, `"211"`, `"313"`).
  - `status`: `"dirty"` | `"will_clean"` | `"cleaning_now"` | `"clean"` | `"pending_issue"` | `"deleted"`.
  - `assignedUserId`: Integer (`2` for Cris, `3` for Grazi).
  - `assignedUsername`: String (`"Cris"`, `"Grazi"`).
  - `requestDate`: String `YYYY-MM-DD`.
  - `effectiveDate`: String `YYYY-MM-DD` (date cleaning was finalized).
  - `cleaningStartedAt`: ISO timestamp string.
  - `completedAt`: ISO timestamp string.
  - `durationMinutes`: Number (default min 10 mins enforced at line 24174).
  - `source`: `"checkout"` | `"stayover"` | `"manual_instruction"`.
  - `cleaningType`: `"checkout"` | `"stayover"` | `"service_order"`.
  - `autoReservationId`: Integer (ID of incoming reservation arriving after cleaning).
  - `autoReservationCode`: String (PMS code of arriving reservation, e.g. `"RES-113-B2B-25201908"`).
  - `checkoutReservationId`: Integer (ID of outgoing reservation that departed before cleaning).
  - `checkoutReservationCode`: String (code of departed reservation).
  - `leavingGuest`: String (name of guest who checked out).
  - `arrivingGuest`: String (name of guest checking in).
- In `artifacts/api-server/maid-automation-service.mjs:173-307`, `syncMaidCredits(db, userId)` synchronizes completed cleanings (`status === "clean"`) to `db.maidStatementEntries` with:
  - `entryType: "credit"`
  - `cleaningRequestId: cleaning.id`
  - `amount: rate` (R$ 22.50 checkout, R$ 15.00 stayover)
  - `entryDate`: `c.completedAt` or `c.effectiveDate`
  - `description`: `"Diária — Flat 113"` or `"Diária Stayover — Flat 113"`

### 1.3 Guest Evaluations and NPS Feedback Flow
Observed in `artifacts/api-server/zapi-service.mjs:16211-16550` and `demo-server.mjs:63090-63640`:
- Post-checkout surveys (`tpl_post_checkout_review`) invite guests to score 1 to 5.
- `handleInboundNpsScoreOrComment` in `zapi-service.mjs:16211`:
  - When guest replies `5`:
    - `existingNps.score = 5`
    - `existingNps.googleLinkSent = true`
    - `existingNps.awaitingFeedbackComment = false`
    - Google Review link is sent.
  - When guest replies `1..4`:
    - If inline comment provided (e.g., `"3 - toalha com mancha"`):
      - `existingNps.comment = inlineComment`
      - `existingNps.commentReceivedAt = new Date().toISOString()`
      - `syncNpsCommentToReviews(db, existingNps)`
    - If no comment initially:
      - `existingNps.awaitingFeedbackComment = true`
      - `existingNps.awaitingFeedbackSince = new Date().toISOString()`
      - Dispatches template asking for feedback reason (`tpl_nps_score_4`, `tpl_nps_score_3`, etc.).
      - When guest replies with text within 48h, lines 16466–16488 append the comment, unset `awaitingFeedbackComment`, and invoke `syncNpsCommentToReviews(db, existingNps)`.
- Data model in `db.npsResponses`:
  ```typescript
  interface NpsResponse {
    id: string; // e.g. "nps_1731195600000_abc"
    reservationId: number | string | null;
    reservationCode: string | null;
    guestPhone: string;
    guestName: string;
    flatNumber: string | null;
    channel: string | null;
    score: number | null; // 1 to 5
    comment: string | null;
    sentAt: string;
    respondedAt: string | null;
    googleLinkSent: boolean;
    autoAction: "google_link_sent" | "feedback_collected" | "recovery_ticket_created" | null;
    pendingResponse: boolean;
    surveyVerifiedSent: boolean;
  }
  ```

### 1.4 WhatsApp Delivery Pipeline (Z-API)
Observed in `artifacts/api-server/zapi-service.mjs:4854-5000` and `maid-automation-service.mjs:765-773, 826-834, 1028-1036`:
- Dispatch method: `sendZapiMessage(db.zapiConfig, { phone, message, channelId: "maids", recipientRole: "camareira", triggerEvent, db })`.
- Phone sanitization: `cleanWhatsAppPhone(rawPhone)` normalizes Brazilian phone numbers by stripping non-digits, removing leading zeros, and prepending country code `55` to 10/11-digit numbers.
- Throttling: In bulk loops, `await new Promise(r => setTimeout(r, 1500))` is used between sends to protect WhatsApp connections and avoid rate-limiting.
- Logging: Dispatches are unshifted to `db.maidAutomationConfig.history` (capped at 100 entries) with status (`sent` or `failed`), method (`zapi` or `simulado`), timestamp, and full message payload.

### 1.5 Scheduled Background Jobs and Time Handling
Observed in `artifacts/api-server/maid-automation-service.mjs:860-1064`:
- Background loop: `setInterval(async () => { ... }, 60 * 1000)` running every 60 seconds (initialized via `initMaidAutomationEngine` in `demo-server.mjs:17940`).
- Time calculation: `getBrasiliaNow()` extracts `{ date, hour, minute, second, timeStr }` in the `America/Sao_Paulo` timezone, factoring in `global.__simulatedTimeOffsetMs`.
- Idempotency guard:
  - Trigger object contains `scheduledTime` (e.g. `"18:00"`) and `lastExecutedDate` (string `YYYY-MM-DD` or `null`).
  - Condition: `isPastOrAtTime && trigger.lastExecutedDate !== bNow.date`.
  - Once executed, `trigger.lastExecutedDate = bNow.date` is set and `saveDatabase()` is called.

### 1.6 November 2026 Historical Dataset (Requirement R4)
Inspection of `data/database.json`:
- November 2026 reservations count: 7.
  1. `RES-113-B2B-25152172` (Flat 113, Samuel Avila, Checkin: 2026-11-03, Checkout: 2026-11-05, Phone: `5551989677542`, Status: `confirmada`)
  2. `RES-113-B2B-25201908` (Flat 113, Gabriel Pires Hage Chahine, Checkin: 2026-11-05, Checkout: 2026-11-06, Status: `confirmada`)
  3. `RES-113-B2B-25150895` (Flat 113, Edson Jose Leite Junior, Checkin: 2026-11-12, Checkout: 2026-11-13, Status: `confirmada`)
  4. `B2B-25065298` (Flat 313, Gabriela Silva, Checkin: 2026-11-16, Checkout: 2026-11-19, Status: `confirmada`)
  5. `B2B-25252964` (Flat 211, Anderson Archanjo, Checkin: 2026-11-17, Checkout: 2026-11-18, Phone: `11975362061`, Status: `confirmada`)
  6. `RES-113-B2B-25193040` (Flat 113, Nilton Santos, Checkin: 2026-11-25, Checkout: 2026-11-27, Status: `confirmada`)
  7. `B2B-25078591` (Flat 408, Fernanda Oliveira, Checkin: 2026-11-02, Checkout: 2026-11-03, Status: `cancelada`)
- November 2026 cleaning requests count: 7.

---

## 2. Logic Chain

### 2.1 Principle of Maid Attribution to Guest Evaluations
1. A guest evaluates the physical cleanliness, bed linen, bath towels, amenities, kitchen utensils, and hygiene of the room they occupied during their stay.
2. The cleaning that prepared the room for that guest is completed **on or before the check-in date** (pre-checkin/checkout of prior occupant), OR during their stay if an authorized **stayover cleaning** took place.
3. A cleaning performed on or after checkout date is performed *after* the guest has vacated the room to prepare for the *subsequent* guest; the guest who just checked out never experienced that post-checkout cleaning.
4. Therefore, the maid responsible for the evaluation of reservation $R$ is the maid who performed the **last completed cleaning** of that flat on or before $R$'s check-in date (or the latest stayover cleaning during $R$'s stay).

### 2.2 Algorithm for Maid Attribution: `resolveMaidCleaningForReservation`
From observations 1.2 and 1.3:
```
Given a reservation R (with flatNumber, checkinDate, checkoutDate, id, code):
Step 1: Check for direct arrival link in cleaningRequests:
        Find C where (C.autoReservationId === R.id || C.autoReservationCode === R.code)
                 and C.status === "clean" and C.assignedUserId != null
        If found -> Return C.

Step 2: Check for in-stay stayover cleanings:
        Find all C where (C.flatNumber === R.flatNumber || C.flatId === R.flatId)
                 and C.status === "clean" and C.assignedUserId != null
                 and (C.source === "stayover" || C.cleaningType === "stayover" || C.reservationId === R.id)
                 and (effectiveDate >= R.checkinDate && effectiveDate < R.checkoutDate)
        If found -> Return the one with the latest effectiveDate / completedAt.

Step 3: Check for preparation cleaning (most common standard case):
        Find all C where (C.flatNumber === R.flatNumber || C.flatId === R.flatId)
                 and C.status === "clean" and C.assignedUserId != null
                 and !C.isInstructionOnly and C.source !== "manual_instruction" and C.type !== "instruction"
                 and (effectiveDate <= R.checkinDate)
        Order by (completedAt || effectiveDate || requestDate) DESC.
        If found -> Return the top record.

Step 4: Fallback to maid statement credits:
        If cleaning record C has assignedUserId === null, query db.maidStatementEntries
        where entryType === "credit" and cleaningRequestId === C.id to retrieve userId.
```

### 2.3 AI Feedback Triage Logic (Requirement R3)
1. For any evaluation $E$:
   - If $E.\text{score} === 5$: Always eligible for inclusion in the maid's daily summary. No AI filtering required.
   - If $E.\text{score} < 5$:
     - Check if $E$ has a comment ($E.\text{comment}$).
     - If $E$ has no comment (e.g. still awaiting explanation within 48h): It cannot be classified as a cleaning fault. Do NOT send to maid until comment is provided.
     - If $E$ has a comment:
       - Run AI classification using Gemini API (with deterministic regex heuristic fallback).
       - Target categories:
         - **Cleaning / Responsibilities of Maid**: lençol manchado/sujo, fronha, toalha de banho, tapete, piso sujo, cabelo, pó, box do banheiro, vaso sanitário, lixo não recolhido, amenities faltantes (sabonete, xampu), louça suja, talheres engordurados.
           -> **Classification**: `ELIGIBLE_FOR_MAID`. Included in summary.
         - **Non-Cleaning / Outside Maid Scope**: check-in demorado, portaria, recepção, internet/Wi-Fi lento, ar-condicionado com defeito mecânico, barulho de vizinhos, vaga de garagem, TV sem sinal, preço da diária.
           -> **Classification**: `DISCARDED_FOR_MAID`. Excluded from summary and maid is protected from external blame.

### 2.4 Daily Summary Construction & WhatsApp Delivery (Requirement R1)
1. In `maid-automation-service.mjs`, create a dedicated trigger or scheduled routine `trigger_daily_reviews` (default `scheduledTime: "18:00"` or user-configured).
2. For each active maid (Cris, Grazi):
   - Find all evaluations received in the daily evaluation window (e.g. `todayStr`).
   - Match each evaluation to its maid via the attribution algorithm.
   - Filter to keep only eligible evaluations (score 5 OR score < 5 with AI-approved cleaning comment).
   - If the maid has eligible evaluations:
     - Format the WhatsApp message:
       ```
       🌟 *Resumo Diário de Avaliações dos Hóspedes • CorpFlats* 🧹

       Olá, *{{nome_camareira}}*!
       Aqui está o resumo das avaliações recebidas hoje dos hóspedes dos quartos higienizados por você:

       • *Flat 113* — Limpeza em 03/11/2026: ⭐⭐⭐⭐⭐ (5/5)
       • *Flat 211* — Limpeza em 08/11/2026: ⭐⭐⭐⭐ (4/5)
         💬 _"Gostei muito, mas faltou toalha de rosto extra."_

       Média de hoje: *4.5 ⭐*
       Parabéns pelo capricho e dedicação aos nossos hóspedes! ✨
       ```
     - Dispatch via `sendZapiMessage(db.zapiConfig, { phone, message, channelId: "maids", recipientRole: "camareira", triggerEvent: "daily_reviews_summary", db })`.
     - Record in `db.maidAutomationConfig.history`.

### 2.5 Real-Time Update: Consolidated Opinion Synthesis (Requirement R5)
1. When an evaluation with an eligible cleaning comment is received (in `zapi-service.mjs:handleInboundNpsScoreOrComment` or `demo-server.mjs:/api/ai/nps-response`):
   - Message 1: Immediately send the evaluation received to the attributed maid.
   - Message 2: Dispatch a separate updated consolidated opinion synthesis (Mercado Livre style):
     - Calculate historical average cleaning rating for the maid.
     - Extract recurring positive and improvement points (box, kitchen utensils, plates/cutlery, linen).
     - Compare with previous period (e.g., previous 15-day closing or previous month) showing evolution ($\uparrow$ or $\downarrow$).

---

## 3. Caveats

1. **Twin-File Requirement**:
   - Every file modified in `artifacts/api-server/*.mjs` MUST be duplicated to `scripts/*.mjs` with identical contents to maintain SHA-256 parity as required by `AGENTS.md`. Never edit `scripts/` directly.
2. **Offline / Test Mode Resilience**:
   - Tests and CI environments often run without live `GEMINI_API_KEY` or without internet.
   - The AI triage function MUST have a robust heuristic keyword matcher (as seen in `demo-server.mjs:62889`) that deterministically classifies cleaning terms vs non-cleaning terms when API is offline or in test mode.
3. **Multi-day Stayover Edge Case**:
   - If a guest stayed 10 days and had a stayover cleaning on day 5 by Grazi, but the check-in cleaning was done by Cris:
   - The algorithm prioritizes the *last* cleaning experienced by the guest prior to checkout (i.e. Grazi's stayover). This correctly credits the maid whose work was freshest in the guest's mind.
4. **Idempotency of Dispatches**:
   - Both daily routines and the retroactive November dispatch must track dispatched evaluation IDs (e.g. `dispatchedToMaidAt: string`) to guarantee that no evaluation is sent twice.

---

## 4. Conclusion & Recommendations

1. **Integration Target**:
   - The primary module to house the new feature is `artifacts/api-server/maid-automation-service.mjs`, which already possesses the background runner, time handling (`getBrasiliaNow`), Z-API dispatch helpers, template resolvers, and audit logging.
2. **Hooking into Inbound Evaluations**:
   - In `artifacts/api-server/zapi-service.mjs` (`handleInboundNpsScoreOrComment`), when a score or comment is received, trigger the evaluation-to-maid assignment and the R5 real-time opinion synthesis message.
3. **Retroactive November Endpoint**:
   - Expose `POST /api/maid-automation/dispatch-retroactive-reviews` in `maid-automation-service.mjs` to execute Requirement R4 on demand and record status in the automation configuration.
4. **Frontend Settings**:
   - In `artifacts/limpeza/src/pages/maid-whatsapp-automation.tsx`, add a trigger card for "Resumo Diário de Avaliações dos Hóspedes" under the `triggers` tab, allowing administrators to configure the dispatch time, toggle the automation, preview messages, and trigger the retroactive November dispatch with a single click.

---

## 5. Verification Method

To independently verify the observations and data structures documented above, run the following commands in PowerShell from the project root:

1. **Verify Maid Users & Active Status**:
   ```bash
   node -e "const fs = require('fs'); const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8')); console.log(db.users.filter(u => u.role === 'camareira' || u.role === 'cleaner'));"
   ```

2. **Verify November Reservations & Completed Cleanings**:
   ```bash
   node -e "const fs = require('fs'); const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8')); const novRes = db.reservations.filter(r => (r.checkoutDate||'').startsWith('2026-11')); console.log('Nov reservations count:', novRes.length); const novClean = db.cleaningRequests.filter(c => (c.effectiveDate||c.requestDate||'').startsWith('2026-11')); console.log('Nov cleanings count:', novClean.length);"
   ```

3. **Verify Maid Attribution Resolution on Existing Data**:
   ```bash
   node -e "const fs = require('fs'); const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8')); const novRes = db.reservations.filter(r => (r.checkoutDate||'').startsWith('2026-11')); novRes.forEach(r => { const fNum = String(r.flatNumber||''); const cleanings = db.cleaningRequests.filter(c => (String(c.flatNumber) === fNum || c.flatId === r.flatId) && c.status === 'clean' && !c.isInstructionOnly && c.source !== 'manual_instruction'); const before = cleanings.filter(c => (c.effectiveDate || c.requestDate) <= r.checkinDate).sort((a,b) => (b.completedAt||b.requestDate).localeCompare(a.completedAt||a.requestDate)); console.log('Res:', r.code, 'Flat:', fNum, 'In:', r.checkinDate, '-> Prep Cleaning:', before[0]?.id, 'Maid:', before[0]?.assignedUsername || before[0]?.assignedUserId); });"
   ```

4. **Verify Z-API Service and Maid Automation Exports**:
   ```bash
   node -e "import('./artifacts/api-server/maid-automation-service.mjs').then(m => console.log('Maid automation exports:', Object.keys(m)));"
   ```
