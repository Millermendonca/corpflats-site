## 2026-10-14T01:39:04Z
You are Explorer 3 for Milestone 4 (Quarantine Engine, Reconciler & Critical Alerts).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m4_wbp_3`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. Existing implementation files:
   - `artifacts/api-server/wbp/config.mjs` (modes and settings)
   - `artifacts/api-server/demo-server.mjs` (notifications, alerts, database structure)

Your Mission:
Analyze and formulate the architectural blueprint for Features 20 (Quarantine Management Engine), 22 (Manual Reservation Reconciliation), and 24 (Critical Events & Daily Alerts):
1. Quarantine Management Engine (Feature 20):
   - Trigger conditions for quarantine: overbooking (0 flats available), conflict with existing reservation, flat under maintenance/blocked, ambiguous payload.
   - Quarantine record schema: stored in `db.wbpQuarantine` (or `db.quarantineBookings`), with `reason`, `rawPayloadId`, `suggestedFlats`, `createdAt`, `status: pending | resolved | rejected`.
   - Resolution endpoints: manual flat assignment, reject/cancel with channel notification.
2. Manual Reservation Reconciliation (Feature 22):
   - Reconciliation algorithm between legacy manual reservations in PMS and incoming OTA reservations.
   - Matching heuristics: guest name fuzzy match, phone/email match, overlapping date window.
   - Reconciliation report structure: `matched`, `unmatched_pms`, `unmatched_ota`, `potential_duplicates`.
3. Critical Events & Daily Alerts (Feature 24):
   - Immediate manager alerts (WhatsApp/email) on:
     - Overbooking attempt or quarantine placement.
     - Persistent ARI synchronization failure (> 15 minutes of retrying without success).
   - Daily summary alert (scheduled at reception handover, e.g. 08:00): active OTA bookings, quarantine queue, sync health.
4. Output: Write your findings and recommendations in `analysis.md` and complete handoff in `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion. Do NOT write or modify application code.


## 2026-10-14T01:40:10Z
**Context**: Milestone 4 Architectural Directive (Immediate Repass)
**Content**: Mandatory architectural directives from parent for Milestone 4:
1. TEST NOTIFICATION ISOLATION (AGENTS.md):
   In all M4 tests, ZERO real messages to WhatsApp (Z-API), SMTP, or SERPRO. Production code must NEVER silence notifications. Use dependency injection/transport interceptors or sandbox mocks (`e2e/sandbox/mock-zapi`, `mock-smtp`) + `NODE_ENV="test"`, `DATABASE_URL` unset, `DATA_FILE` in `os.tmpdir()`, and real database hash/mtime assertions.
2. PAYMENT COLLECT vs LEGACY `pago_total` (R5):
   Legacy code forces `paymentStatus = "pago_total"` for `booking`/`airbnb`. For WBP bookings:
   - `PaymentCollect = "Channel"` -> paid by OTA (`pago_total`), record net amount receivable (`netAmount` / commission deducted).
   - `PaymentCollect = "Property"` -> pending collection at hotel (`pendente`), MUST NOT be overwritten to `pago_total`, and generate reception alert to collect at check-in.
3. CARD HYGIENE ON INGESTION (R6):
   WBP payloads (`BookingCreate`/`GetBookingId`) may contain cards (PAN & CVV). In `storage.mjs` and `inbox.mjs`:
   - Immediately discard CVV (`card_cvv`, `cvv`, `cvc`, `security_code`) in memory BEFORE saving to any file or log.
   - Full PAN NEVER enters `db.reservations`, `wbpInbox`, `quarantineBookings`, `audit_logs.jsonl` or `console.log` (only mask/last4 + vault reference for M5).
4. SAFE TRANSITION / DEDUPLICATION (R5):
   Existing manual Booking/Airbnb reservations matching securely (same channel, dates, compatible name) are LINKED (`externalOrderId`), never duplicated or altered. Ambiguous cases route to Quarantine.
**Action**: Incorporate these 4 points into your `analysis.md` and `handoff.md` (especially quarantine routing for ambiguous manual reservation conflicts and manager alerts for PaymentCollect = Property).
