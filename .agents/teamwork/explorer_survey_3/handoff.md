# Handoff Report: Guest Portal & Frontend Housekeeping UI Explorer

**Agent:** `explorer_survey_3`  
**Timestamp:** 2026-10-27T16:10:00Z  
**Type:** Hard (Task Complete)  
**Parent / Recipient:** `5c8f06aa-a876-42b7-8e25-4f73f9a21590` (orchestrator_18)  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3`  

---

## 1. Observation

Direct observations obtained through file examination and code exploration:

1. **Backend Route `GET /api/pms/guest-portal/:code`:**
   - **Path:** `artifacts/api-server/demo-server.mjs:24360` (and `scripts/demo-server.mjs:24360`).
   - Line 24468 calculates B2B status verbatim:
     ```javascript
     const chanLower = String(r.channel || "").toLowerCase();
     const isB2b = chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName);
     ```
   - Line 24640 passes `isB2b` directly to the client: `reservation.isB2b = isB2b`.
   - Today's date is calculated on line 24371: `const todayStr = bNow.date;`.
   - Lines 24631–24762 return the full JSON response, currently lacking the `b2bHousekeeping` metadata block.

2. **Frontend Guest Portal Page:**
   - **Path:** `artifacts/limpeza/src/pages/guest-portal.tsx`.
   - Line 302 fetches portal data:
     ```typescript
     const res = await fetch(`/api/pms/guest-portal/${encodeURIComponent(q)}${isReqQuery ? "?requester=1" : ""}`)
     ```
   - Card structure in layout:
     - Line 2255: `1. Hero / Saudação e Resumo da Estadia`
     - Line 2604: `1.5 Card de Pagamento & Confirmação Financeira`
     - Line 3003: `2. Card: Acomodação & Chave de Acesso / Portaria` (ends at line 3236)
     - Line 3238: `3. Card: Room Service & Café da Manhã`

3. **Flat Card Component & 10-Minute Lock:**
   - **Path:** `artifacts/limpeza/src/components/flat-card.tsx`.
   - Line 114: `const [finishModalOpen, setFinishModalOpen] = useState(false)`
   - Lines 902–909 enforce a 10-minute minimum cleaning time before completing:
     ```typescript
     if (request?.cleaningStartedAt) {
       const started = new Date(request.cleaningStartedAt).getTime()
       const mins = (Date.now() - started) / 60000
       if (mins < 10) {
         setMinTimeAlertOpen(true)
         return
       }
     }
     ```
   - Lines 945–948 capture the backend 10-minute error:
     ```typescript
     if (err.error?.includes("Tempo insuficiente")) {
       setMinTimeAlertOpen(true)
       return
     }
     ```
   - Lines 911–914 open `finishModalOpen` for pending exit surveys:
     ```typescript
     if (pendingPeriodicTasks.length > 0 || pendingSurveys.length > 0) {
       setFinishModalOpen(true)
       return
     }
     ```
   - Lines 2183–2610 render `finishModalOpen`, including the exit survey (`pendingSurveys`) asking checkout-specific questions and photo evidence.

4. **Backend Assignment Status & Automatic Checkout Hazard:**
   - **Path:** `artifacts/api-server/demo-server.mjs:15743` (`PATCH /api/cleaning/assignments/:requestId/status`).
   - Lines 15824–15832 enforce 10-minute minimum:
     ```javascript
     if (status === "clean" && item.cleaningStartedAt && !customCompletedAt && !isInstructionRequest) {
       const started = new Date(item.cleaningStartedAt).getTime();
       const elapsedMinutes = (Date.now() - started) / 60000;
       if (elapsedMinutes < 10 && userAuth?.role !== "admin" && userAuth?.role !== "dev") {
         return res.status(400).json({
           error: "Não é possível finalizar a limpeza ainda. Tempo insuficiente de higienização (mínimo de 10 minutos)."
         });
       }
     }
     ```
   - Lines 15834–15875 automatically close checkout reservations upon `cleaning_now` or `clean`:
     ```javascript
     if (!isInstructionRequest && (status === "cleaning_now" || status === "in_progress" || status === "clean")) {
       ...
       checkoutRes.checkoutDone = true;
       checkoutRes.status = "completed";
       ...
       triggerCheckoutWhatsApp(db, saveDatabase, checkoutRes, autoSource);
     }
     ```
     *Hazard:* Unless `isStayover` is exempted, completing a stayover cleaning would prematurely complete the guest's reservation and send a checkout WhatsApp message.

5. **Existing Targeted Test Architecture:**
   - **Path:** `tests/tariff-engine.test.mjs`.
   - Spawns child server process on isolated port `3995` with `DATA_FILE: isolatedDbPath` and `NODE_ENV: "test"`.
   - Tears down process cleanly via `taskkill /F /T /PID` in `after()`.
   - Verifies SHA-256 integrity and leaves production data untouched.

---

## 2. Logic Chain

1. **Premise 1 (from Observation 1 & 2):**
   The Guest Portal already has the `r.channel` and `isB2b` detection mechanism in `demo-server.mjs:24468`. By exposing `b2bHousekeeping` in `GET /api/pms/guest-portal/:code` exclusively when `isB2b === true`, the frontend can safely render the DND and linen request controls without leaking this functionality to non-B2B guests.
2. **Premise 2 (from Observation 1 & 4):**
   New endpoints `POST /api/pms/guest-portal/:code/do-not-disturb` and `POST /api/pms/guest-portal/:code/linen-request` must validate `isB2b` immediately after looking up the reservation. If `!isB2b`, returning HTTP 403 satisfies acceptance criteria § Portal do Hóspede B2B. Scheduling linen change for `tomorrowStr` prevents day-of operational conflicts with housekeeping schedules.
3. **Premise 3 (from Observation 3 & 4):**
   The existing checkout flow in `flat-card.tsx` and `demo-server.mjs` enforces a 10-minute minimum duration and executes exit surveys (`pendingSurveys`). Stayover cleaning is an in-stay service, not an exit inspection. Therefore, stayover cards must bypass the 10-minute check and bypass exit surveys.
4. **Premise 4 (from Observation 4):**
   `PATCH /api/cleaning/assignments/:requestId/status` currently marks `checkoutDone = true` and `status = "completed"`. For stayovers (`source === "stayover"` or `cleaningType === "stayover"`), these mutations must be bypassed so the guest's reservation remains active (`status: "confirmada"` or `status: "in_house"`), flat remains occupied, and no checkout WhatsApp is triggered.
5. **Premise 5 (from Observation 3):**
   In `flat-card.tsx`, replacing the complex `finishModalOpen` with a streamlined `StayoverCompletionModal` that asks only:
   (1) "Toalhas de banho foram trocadas? (Sim / Não)"
   (2) "Roupa de cama foi trocada? (Sim / Não)"
   directly fulfills Requirement R3 and sends `towelsChanged` and `beddingChanged` in the status PATCH payload.
6. **Premise 6 (from Observation 5):**
   Designing `tests/b2b-stayover-housekeeping.test.mjs` using the child-process spawn pattern (`TEST_PORT = 3999`, isolated database file, `NODE_ENV = "test"`) guarantees 100% adherence to AGENTS.md rules: strict targeted execution, zero production data modification, and no batch test suite runs.

---

## 3. Caveats

- **Scope Boundary:** This investigation is strictly read-only and architectural. No production files were modified.
- **Twin-Server Parity Rule:** Any future changes to `artifacts/api-server/demo-server.mjs` must be synchronized byte-for-byte (SHA-256) with `scripts/demo-server.mjs`. The same applies to `maid-automation-service.mjs`.
- **Admin Clean on Behalf of Maid:** In `flat-card.tsx`, when an admin marks a stayover flat as clean via `adminCleanModalOpen`, the UI must include the two linen questions (`towelsChanged` and `beddingChanged`) so the admin can record whether linens were changed.

---

## 4. Conclusion

1. **Guest Portal Architecture:**
   - Endpoints `POST /api/pms/guest-portal/:code/do-not-disturb` and `POST /api/pms/guest-portal/:code/linen-request` can be implemented directly below line 24765 in `demo-server.mjs` (and twin).
   - In `guest-portal.tsx`, a new card between lines 3236 and 3238 provides the DND switch and next-day linen request buttons.
2. **FlatCard Stayover Architecture:**
   - Detect `isStayover = flat.source === "stayover" || flat.cleaningType === "stayover" || request?.source === "stayover" || request?.cleaningType === "stayover"`.
   - Bypass 10-minute lock in `flat-card.tsx:905` and `demo-server.mjs:15824`.
   - Bypass checkout exit survey in `flat-card.tsx:911`.
   - Prevent reservation completion / flat vacant marking in `demo-server.mjs:15836`.
   - Render distinct Stayover card visual with `Dia X de Y`, guest name, linen change counters, 3-day alert (`daysSinceBeddingChange >= 3`), and DND blocking banner.
   - Introduce `StayoverCompletionModal` with questions for bath towels and bed linen changes.
3. **Targeted Test Architecture:**
   - `tests/b2b-stayover-housekeeping.test.mjs` is fully specified to validate R1 through R4 against an isolated server instance without touching production data.

---

## 5. Verification Method

To independently verify these findings and line numbers:
1. **Inspect Guest Portal B2B Logic in Demo Server:**
   `view_file` at `artifacts/api-server/demo-server.mjs` lines 24360 to 24765.
2. **Inspect Checkout Completion & 10-Minute Lock:**
   `view_file` at `artifacts/limpeza/src/components/flat-card.tsx` lines 900 to 1024 and lines 2183 to 2260.
3. **Inspect Automatic Checkout Logic in Assignment Status Route:**
   `view_file` at `artifacts/api-server/demo-server.mjs` lines 15820 to 15880.
4. **Inspect Reference Test Suite:**
   `view_file` at `tests/tariff-engine.test.mjs` lines 1 to 90.
5. **Detailed Architecture Document:**
   Review `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\analysis.md`.
