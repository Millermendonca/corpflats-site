# Handoff Report — Explorer 1 (Review Flow Explorer)

**Target Component**: Guest Reviews, NPS Satisfaction Survey, Rating Storage, and Downstream Hook Points  
**Date**: 2026-11-10  
**Archetype**: Explorer / Investigator  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1\`

---

## 1. Observation

### 1.1 Backend Review Routes and Storage Structures

1. **Storage Entities in In-Memory / PostgreSQL (`system_store` / `database.json`)**:
   - `artifacts/api-server/demo-server.mjs` lines 1802–1835:
     ```javascript
     let db = {
       users: defaultUsers,
       flats: [],
       cleaningRequests: [],
       reviews: [],
       reviewInsights: null,
       reservations: [],
       ...
     };
     ```
   - In addition, initialized dynamically:
     - `db.npsResponses`: Array storing NPS survey dispatches and inbound scores/comments.
     - `db.npsImprovements`: Object storing continuous improvement categories and executive summary.
     - `db.guestSentiment`: Array storing guest chat sentiment and keyword tracking.
     - `db.observations`: Array storing maintenance tickets and complaints (recovery tickets).

2. **Core Backend Endpoints**:
   - **`GET /api/ai/reviews`** (`demo-server.mjs`, lines 62568–62609):
     Returns `{ reviews: db.reviews, insights: { ...db.reviewInsights, actionItems: pendingActionItems } }`.
   - **`POST /api/ai/nps-response`** (`demo-server.mjs`, lines 63395–63451):
     Accepts `{ reservationId, guestPhone, guestName, score, comment, flatNumber, channel }`.
     - Validates `score` (1 to 5).
     - If `score === 5`, sets `googleLinkSent = true`, `autoAction = "google_link_sent"`.
     - If `score <= 2`, pushes ticket to `db.observations` (`severity: score === 1 ? "alta" : "media"`).
     - If `score <= 4` and comment is provided:
       ```javascript
       if (comment && String(comment).trim()) {
         syncNpsCommentToReviews(db, targetNpsEntry);
       }
       improvements = await rebuildNpsImprovementsSummary(db);
       await sendNpsManagerAlertWhatsApp(db, targetNpsEntry, {
         reason: "manual_or_portal_nps_response",
         saveDatabase
       });
       ```
   - **`POST /api/ai/nps-sent`** (`demo-server.mjs`, lines 63540–63559):
     Records survey dispatch event in `db.npsResponses` with `pendingResponse = true, surveyVerifiedSent = true`.
   - **`GET /api/ai/nps-responses`** (`demo-server.mjs`, lines 63575–63585):
     Returns list of NPS entries filtered by query param (`promoters`, `neutrals`, `detractors`, `pending`).
   - **`POST /api/ai/import-review`** (`demo-server.mjs`, lines 62819–62850):
     Accepts external reviews (OTA/Google/manual): `{ author, rating, channel, comment, flatMentioned }`.
     Unshifts into `db.reviews`. If `rating <= 4`, calls `rebuildNpsImprovementsSummary(db)`.
   - **`POST /api/public/checkout`** (`demo-server.mjs`, lines 19540–19650):
     Handles digital express checkout from `artifacts/limpeza/src/pages/guest-checkout.tsx`.
     Marks `flat.isOccupied = false`, marks cleaning request `isVacant = true` (`source: "guest_checkout"`), and invokes `triggerCheckoutWhatsApp(db, saveDatabase, r, "link_digital")`. **Does NOT collect ratings on this page directly** — the rating survey is triggered automatically 24 hours later via WhatsApp.

### 1.2 Data Schemas

1. **`db.npsResponses[]` Schema**:
   Defined in `zapi-service.mjs` (lines 16063–16082, 16274–16294, 16467–16475):
   ```typescript
   interface NpsResponseEntry {
     id: string;                     // "nps_${Date.now()}_${rand}"
     reservationId: string | number | null; // e.g. "RES-501" or 541
     reservationCode: string | null; // e.g. "RES-113-B2B-25152172"
     guestPhone: string;             // Cleaned phone "5522999990005"
     guestName: string;              // Guest name
     flatNumber: string | null;      // Flat number "113", "304", etc.
     channel: string;                // "whatsapp", "site", "booking", etc.
     score: number | null;           // 1 to 5 (null while pending)
     comment: string | null;         // Feedback text / reason
     sentAt: string;                 // ISO date when survey prompt was sent
     respondedAt: string | null;     // ISO date when guest rated 1-5
     commentReceivedAt?: string;     // ISO date when feedback explanation was received
     googleLinkSent: boolean;        // true only if score === 5
     autoAction: "google_link_sent" | "feedback_collected" | "recovery_ticket_created" | null;
     pendingResponse: boolean;       // true before rating is provided
     surveyVerifiedSent: boolean;    // strict guard flag
     awaitingFeedbackComment?: boolean; // true while score is 1-4 and awaiting guest explanation
     awaitingFeedbackSince?: string; // ISO date timestamp when score 1-4 arrived
     scoreFollowupSent?: boolean;    // true when tpl_nps_score_X sent
     scoreFollowupSentAt?: string;
     managerAlertSent?: boolean;     // true when WhatsApp alert sent to manager (22998505276)
     managerCommentAlertSent?: boolean;
     sentimentScore?: number | null;
     sentimentTone?: "positive" | "mixed" | "neutral" | "negative" | null;
     sentimentSummary?: string | null;
   }
   ```

2. **`db.reviews[]` Schema**:
   Defined in `zapi-service.mjs` (lines 15720–15735) and `demo-server.mjs` (lines 62828–62838):
   ```typescript
   interface ReviewEntry {
     id: number;                     // Autoincrement integer
     fromNpsId?: string | null;      // Link to db.npsResponses entry id
     author: string;                 // Guest name
     guestPhone?: string | null;     // Guest phone
     rating: number;                 // 1 to 5
     channel: string;                // "whatsapp", "airbnb", "booking", "google"
     date: string;                   // "YYYY-MM-DD"
     flatMentioned: string | null;   // Flat number e.g. "113"
     comment: string;                // Guest review/feedback text
     sentiment: "positive" | "mixed" | "negative";
     analyzed: boolean;              // IA diagnosis processed flag
     maintenanceChecked?: boolean;
     maintenanceGenerated?: boolean;
   }
   ```

3. **`db.cleaningRequests[]` Schema**:
   Defined in `demo-server.mjs` (lines 913–932, 21149–21165):
   ```typescript
   interface CleaningRequest {
     id: number;
     flatId: number;
     flatNumber: string;             // e.g. "113", "313"
     requestDate: string;            // "YYYY-MM-DD"
     effectiveDate?: string;         // "YYYY-MM-DD"
     status: "clean" | "dirty" | "in_progress" | "no_show" | "extended" | "deleted";
     assignedUserId: number | null;  // Maid User ID (e.g. 2 for Cris, 3 for Grazi)
     assignedUsername: string | null;// "Cris", "Grazi"
     assignedUserName?: string | null;
     source: "checkout" | "stayover" | "guest_checkout" | "manual_instruction";
     cleaningType?: "checkout" | "stayover";
     isPaidCleaning?: boolean;
     isVacant: boolean;
     isPriority: boolean;
     leavingGuest: string | null;    // Name of guest checking out
     arrivingGuest: string | null;   // Name of guest checking in
     willCleanAt?: string;
     cleaningStartedAt?: string;
     completedAt?: string | null;    // ISO timestamp
     durationMinutes?: number;
   }
   ```

4. **Maid Users in `db.users`**:
   - Filter: `(u.role === "camareira" || u.role === "cleaner") && u.active !== false`.
   - Found in `data/database.json`:
     - ID 2: `name: "Cris"`, `phone: "22988486446"`, `whatsapp: "5522988486446"`.
     - ID 3: `name: "Grazi"`, `phone: "22999106204"`, `whatsapp: "5522999106204"`.

### 1.3 The Two-Step WhatsApp Rating & Feedback Collection Flow (Requirement R2)

Observed in `artifacts/api-server/zapi-service.mjs`:

1. **Step 1: Dispatching the Satisfaction Survey**:
   - Template: `tpl_nps_satisfaction_check` (lines 978–996):
     - `triggerEvent`: `"post_checkout_review"`
     - Timing: `offsetValue: 24`, `offsetUnit: "hours"`, `triggerTiming: "after_event"`.
     - Message:
       ```text
       Olá, {{primeiro_nome}}! 😊

       Sua estadia conosco no CorpFlats chegou ao fim e adoraríamos saber como foi! De 1 a 5 (sendo 5 perfeito), que nota você daria para a sua experiência?

       Basta responder apenas com o número! 💙
       ```
   - When dispatched via ruler (`processWhatsAppRuler`, lines 13053–13066):
     Calls `registerNpsSurveySent(db, { phone, guestName, reservationId, reservationCode, flatNumber, channel, sentAt })`.
   - Guard check (`getLatestNpsSurveySentInfo`, lines 16090–16203):
     Only guests who **actually received** `post_checkout_review` / `tpl_nps_satisfaction_check` have their incoming digits 1–5 interpreted as ratings. Numbers from normal conversation without prior survey are strictly ignored.

2. **Step 2A: Handling Inbound Score (1 to 5)** (`handleInboundNpsScoreOrComment`, lines 16252–16452):
   - Regex matcher (lines 16253–16256):
     ```javascript
     const pureScoreMatch = cleanText.match(/^([1-5])$/) || cleanText.match(/^nota\s*([1-5])$/i) || cleanText.match(/^([1-5])\s*estrelas?$/i);
     const inlineScoreMatch = !pureScoreMatch
       ? cleanText.match(/^(?:nota\s*)?([1-5])(?:\s*estrelas?)?\s*[-–:,.]\s*(.{3,})$/i)
       : null;
     ```
   - **Score = 5**:
     - Sets `existingNps.score = 5`, `existingNps.autoAction = "google_link_sent"`, `existingNps.googleLinkSent = true`, `existingNps.awaitingFeedbackComment = false`.
     - Dispatches `tpl_post_checkout_review` (`nps_approved`, lines 998–1016) with humanized 2-minute delay + 5s typing simulation (lines 16359–16375), inviting the guest to post 5 stars on Google Reviews.
   - **Score <= 4 (Scores 1, 2, 3, 4)**:
     - Sets `existingNps.score = score`, `existingNps.googleLinkSent = false`.
     - If score <= 2: creates `db.observations` recovery ticket (`type: "reclamacao"`, `generatedFromNps: true`).
     - **If inline comment was present** (e.g. `"4 - faltou toalha"`):
       - Sets `existingNps.comment = inlineComment`.
       - Sets `existingNps.awaitingFeedbackComment = false`.
       - Calls `syncNpsCommentToReviews(db, existingNps)` (line 16347).
       - Calls `rebuildNpsImprovementsSummary(db)` (line 16436).
       - Calls `sendNpsManagerAlertWhatsApp(db, existingNps, ...)` (line 16437).
     - **If pure score without comment** (e.g. `"4"`):
       - Sets `existingNps.awaitingFeedbackComment = true`.
       - Sets `existingNps.awaitingFeedbackSince = new Date().toISOString()`.
       - Sets `existingNps.managerAlertSent = false`.
       - Sends the corresponding feedback prompt template:
         - **Score 4**: `tpl_nps_score_4` (lines 1018–1038): *"Como buscamos sempre a excelência para nossos hóspedes, o que você acha que faltou ou o que poderíamos melhorar para que sua próxima experiência conosco seja nota 5?"*
         - **Score 3**: `tpl_nps_score_3` (lines 1040–1060): *"Você poderia nos contar brevemente o que não saiu como esperado ou o que podemos melhorar no flat e no atendimento?"*
         - **Score 2**: `tpl_nps_score_2` (lines 1062–1080): *"Sentimos muito que sua experiência no Flat {{quarto}} não tenha atendido às suas expectativas... Por favor, conte para nós aqui no WhatsApp o que aconteceu durante sua estadia e o que precisamos melhorar:"*
         - **Score 1**: `tpl_nps_score_1` (lines 1082–1100): *"Pedimos sinceras desculpas por sua experiência no Flat {{quarto}} ter sido negativa... Você poderia digitar aqui o que aconteceu ou os pontos que falharam em sua estadia?"*

3. **Step 2B: Capturing the Guest's Follow-up Feedback Comment** (`handleInboundNpsScoreOrComment`, lines 16454–16581):
   - When `existingNps.awaitingFeedbackComment === true` and message arrives within a 48h window:
     - Appends/sets `existingNps.comment = cleanText`.
     - Sets `existingNps.commentReceivedAt = new Date().toISOString()`.
     - Sets `existingNps.awaitingFeedbackComment = false`.
     - Updates `db.observations` description if a recovery ticket was created.
     - **Syncs to reviews**: Calls `syncNpsCommentToReviews(db, existingNps)` (line 16487), which inserts or updates the record in `db.reviews`.
     - Sends thank-you template: `tpl_nps_feedback_thanks` (`nps_feedback_thanks`, lines 16489–16550).
     - Updates continuous improvements: Calls `rebuildNpsImprovementsSummary(db)` (line 16553).
     - Alerts manager WhatsApp (`22998505276`): Calls `sendNpsManagerAlertWhatsApp(...)` (lines 16554–16558).
     - Emits in-app system notification via `createNotification(...)` pointing to `/avaliacoes-ia` (line 16560).

### 1.4 Maid Automation Architecture (`maid-automation-service.mjs`)

- `DEFAULT_MAID_TRIGGERS` (lines 13–80):
  1. `trigger_overtime_cleaning`: Overtime cleaning alert (> 40 min).
  2. `trigger_daily_summary`: Daily productivity summary at 18:00 (`scheduledTime: "18:00"`).
  3. `trigger_quinzena_closing`: Bi-weekly statement on day 15 and last day of month at 18:00.
- Cron Engine: `initMaidAutomationEngine(app, getDb, saveDatabase)` (lines 619–1067) checks every 60 seconds against Brasília time (`getBrasiliaNow()`).
  - Iterates over active maids: `(db.users || []).filter(u => (u.role === "camareira" || u.role === "cleaner") && u.active !== false && (u.whatsapp || u.phone))`.
  - Dispatches message via `sendZapiMessage(db.zapiConfig, { phone, message, channelId: "maids", recipientRole: "camareira", triggerEvent })`.
  - Appends to `config.history` (in `db.maidAutomationConfig.history`).

---

## 2. Logic Chain

1. **Preservation of Existing Review Collection (Requirement R2)**:
   - *Observation*: The two-step NPS conversation flow (`tpl_nps_satisfaction_check` -> `tpl_nps_score_1..4` -> `tpl_nps_feedback_thanks`) is completely contained in `zapi-service.mjs` (lines 16252–16584) and tested in `tests/nps-score-messages-and-improvements.test.mjs`.
   - *Deduction*: Requirement R2 ("Preservação do fluxo atual de avaliações") requires zero modifications to how scores are asked or how feedback reasons are requested. The existing prompts already ask for the exact reason when score < 5. Any new feature must hook into the **results** of this flow without altering the templates, timing, or state machine of `tpl_nps_satisfaction_check` and `tpl_nps_score_1..4`.

2. **Connecting Reviews to the Responsible Maid (Requirement R1 & Acceptance Criterion)**:
   - *Observation*:
     - An NPS entry in `db.npsResponses` stores `reservationId`, `reservationCode`, and `flatNumber`.
     - A review in `db.reviews` stores `fromNpsId`, `flatMentioned`, and `guestPhone`.
     - In `db.reservations`, the reservation record `r` has `r.flatNumber`, `r.checkinDate`, `r.checkoutDate`, `r.guestName`.
     - In `db.cleaningRequests`, each cleaning has `flatNumber`, `requestDate`, `status: 'clean'`, `assignedUserId`, `assignedUsername`, `leavingGuest`, `arrivingGuest`.
   - *Deduction*:
     To identify "qual camareira realizou a última limpeza do quarto correspondente à reserva avaliada":
     - Search `db.cleaningRequests` for cleanings of flat `r.flatNumber` where `status === "clean"` and `assignedUserId` is not null.
     - For the stay of reservation `r`:
       1. Check for stayover cleanings during the stay (`requestDate >= r.checkinDate && requestDate < r.checkoutDate`). If present, the most recent stayover is the last cleaning experienced by the guest during their stay.
       2. If no stayover, check the cleaning that prepared the flat for checkin: `requestDate <= r.checkinDate` (or `arrivingGuest === r.guestName`), taking the most recent clean prior to or on checkin day.
       3. Alternatively, if the hotel operational model considers the checkout cleaning associated with `leavingGuest === r.guestName` (or `requestDate === r.checkoutDate`), check that cleaning.
       4. Match `assignedUserId` to `db.users` to find the maid's profile (`name`, `phone`, `whatsapp`).

3. **Hook Points for Review Submission Events (Requirements R3, R4, R5)**:
   - *Observation*:
     There are three points where review evaluations and feedback comments are committed:
     - **Hook Point A (Real-time WhatsApp Comment Arrival — Score < 5)**:
       In `artifacts/api-server/zapi-service.mjs`:
       - Line 16348 (inline comment with score) and Line 16488 (subsequent follow-up comment text).
       - At this exact moment, `existingNps.comment` is populated, `existingNps.score` is known (1–4), and `flatNumber` / `reservationId` are resolved.
       - *Downstream Trigger*: This is the exact location to trigger:
         1. **AI Triage (Requirement R3)**: Analyze `existingNps.comment` using Gemini (with heuristic fallback). If classified as cleaning-related, mark as eligible for maid notification; if non-cleaning (Wi-Fi, check-in, noise, reception), flag as non-maid issue.
         2. **Instant Consolidated Synthesis Update (Requirement R5)**: If eligible for cleaning, send the review alert and updated consolidated opinion synthesis to the responsible maid's WhatsApp.
     - **Hook Point B (Real-time WhatsApp Score 5 Arrival)**:
       In `artifacts/api-server/zapi-service.mjs`, line 16321 / 16445:
       - Score 5 is registered immediately.
       - Per R3: 5-star ratings are always included in the maid's daily summary without requiring comments.
     - **Hook Point C (API / Manual Review Creation)**:
       In `artifacts/api-server/demo-server.mjs`:
       - Line 63445 (`POST /api/ai/nps-response`): When score <= 4 and comment provided, triggers the same triage and synthesis flow.
       - Line 62844 (`POST /api/ai/import-review`): For imported reviews mentioning a flat.
     - **Hook Point D (Daily Scheduled Consolidation — Requirement R1)**:
       In `artifacts/api-server/maid-automation-service.mjs`, inside `initMaidAutomationEngine`:
       - Can register a scheduled trigger (e.g. `trigger_daily_review_summary` at fixed time, or integrate alongside `trigger_daily_summary` at 18:00).
       - Runs daily, aggregates all eligible reviews received in the 24-hour cycle (or retroactively for November per R4) for rooms cleaned by each maid, and sends the consolidated WhatsApp summary.

4. **November Retroactive Consolidation (Requirement R4)**:
   - *Observation*:
     - In `data/database.json`, dates are indexed under year 2026 (`2026-11-01` to `2026-11-30`).
     - There are 7 November reservations and 7 cleaning requests currently registered.
     - The retroactive scan must query `db.npsResponses` (and `db.reviews`) where `sentAt` or `respondedAt` or `date` falls within November 2026 (`>= "2026-11-01"` up to activation date), identify eligible reviews, associate them with maids via `db.cleaningRequests`, and execute the one-time dispatch.

---

## 3. Caveats

1. **Digital Checkout Portal does not collect ratings**:
   `artifacts/limpeza/src/pages/guest-checkout.tsx` only registers departure and room vacancy. It does not contain star rating inputs. Rating collection occurs strictly 24h later via WhatsApp message (`tpl_nps_satisfaction_check`). No frontend modifications to `guest-checkout.tsx` are needed for review collection.
2. **Review Storage Dualism**:
   `db.npsResponses` holds WhatsApp-specific interactive state (`pendingResponse`, `awaitingFeedbackComment`, `scoreFollowupSent`), while `db.reviews` holds canonical review records across all channels (WhatsApp, Airbnb, Booking, Google). `syncNpsCommentToReviews` bridges them. Both structures must be kept in mind when querying reviews.
3. **Maid Attribution Logic for Room Cleanings**:
   In `db.cleaningRequests`, a cleaning has both `leavingGuest` and `arrivingGuest`. The implementer must ensure the helper handles:
   - Same-day turnover where `leavingGuest` is Guest A and `arrivingGuest` is Guest B.
   - Separate checkout cleanings.
   - Stayover cleanings during multi-day reservations.
4. **Offline / Fallback AI Triage**:
   In test environments or when `GEMINI_API_KEY` is not present, the AI triage function must include an immediate deterministic heuristic fallback (similar to `analyzeTextSentimentWithAI` in `demo-server.mjs`, line 62889) so automated tests pass reliably without external network dependencies.

---

## 4. Conclusion

- **Current Survey Mechanism**: The survey mechanism is a robust, production-tested two-step WhatsApp flow implemented in `artifacts/api-server/zapi-service.mjs`. Step 1 sends `tpl_nps_satisfaction_check` (score 1–5 prompt) 24h post-checkout; Step 2 routes Score 5 to Google Reviews (`tpl_post_checkout_review`) and Scores 1–4 to dedicated prompt templates (`tpl_nps_score_1..4`), capturing subsequent explanation comments within 48h.
- **Requirement R2 Preservation**: This flow already satisfies Requirement R2 completely and must not be altered. The new features for maid notifications, AI triage, and opinion synthesis should be attached via non-invasive listeners / hook points.
- **Hook Points Identified**:
  - `handleInboundNpsScoreOrComment` in `artifacts/api-server/zapi-service.mjs` (lines 16321, 16348, 16488) for real-time review/comment intake.
  - `app.post("/api/ai/nps-response")` in `artifacts/api-server/demo-server.mjs` (line 63445) for API-based reviews.
  - `initMaidAutomationEngine` in `artifacts/api-server/maid-automation-service.mjs` (line 1000) for daily fixed-time consolidation dispatches.
- **Data Schemas & Maids Mapped**:
  - `db.npsResponses`, `db.reviews`, `db.cleaningRequests`, and `db.users` provide all fields needed to match reservations to maids (Cris ID 2, Grazi ID 3) and trace flat numbers, cleaning dates, and scores.

---

## 5. Verification Method

1. **Verify Files and Line Locations**:
   - Inspect `artifacts/api-server/zapi-service.mjs`:
     - Lines 978–1100: Templates `tpl_nps_satisfaction_check`, `tpl_post_checkout_review`, `tpl_nps_score_1..4`, `tpl_nps_feedback_thanks`.
     - Lines 15699–15736: `syncNpsCommentToReviews(db, npsItem)`.
     - Lines 16090–16203: `getLatestNpsSurveySentInfo(db, phone)`.
     - Lines 16211–16584: `handleInboundNpsScoreOrComment(...)`.
     - Lines 16866–16920: `processInboundNpsAndSentiment(...)`.
   - Inspect `artifacts/api-server/demo-server.mjs`:
     - Lines 63395–63451: `/api/ai/nps-response`.
     - Lines 62819–62850: `/api/ai/import-review`.
     - Lines 62885–62930: `analyzeTextSentimentWithAI(...)`.
   - Inspect `artifacts/api-server/maid-automation-service.mjs`:
     - Lines 13–80: `DEFAULT_MAID_TRIGGERS`.
     - Lines 619–1067: `initMaidAutomationEngine(...)`.
     - Lines 173–307: `syncMaidCredits(...)`.
2. **Verify Canonical Flow Against Test Suite**:
   Inspect `tests/nps-score-messages-and-improvements.test.mjs` to observe how score 5 sends Google link, scores 1–4 transition to `awaitingFeedbackComment = true`, and follow-up replies trigger `syncNpsCommentToReviews` and manager alerts.
3. **Invalidation Conditions**:
   - If any change modifies `tpl_nps_satisfaction_check` or `tpl_nps_score_1..4` text or removes the 2-step prompt behavior, Requirement R2 is violated.
   - If maid summary fails to link flat to `db.cleaningRequests`, attribution will fail.
