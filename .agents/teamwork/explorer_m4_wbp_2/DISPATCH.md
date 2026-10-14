## 2026-10-14T01:39:03Z
You are Explorer 2 for Milestone 4 (Fair-Share Allocation, Mutations & PIX Suppression).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m4_wbp_2`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. Existing implementation files:
   - `artifacts/api-server/wbp/availability.mjs` (canonical availability & 19 flats list: 101-105, 201-205, 301-305, 401-404)
   - `artifacts/api-server/wbp/ari-sync.mjs` (triggering debounced ARI sync on mutations)
   - `artifacts/api-server/demo-server.mjs` (reservation schemas, guest portal, automation dispatch)

Your Mission:
Analyze and formulate the architectural blueprint for Features 19 (OTA Inbox & Fair-Share Flat Allocation), 21 (OTA Mutations: Cancel & Mod), and 23 (Automations & PIX Suppression):
1. OTA Inbox & Fair-Share Flat Allocation (Feature 19):
   - Structure of incoming OTA booking (guest name, dates, plan, channel: `booking.com`, `airbnb`, etc., `paymentCollect = Channel | Property`).
   - Fair-share allocation algorithm: balancing wear-and-tear and turnover across the 19 flats of Soho Residence based on checkout count, while strictly checking availability via `calculateCanonicalAvailability`.
   - Record external identifiers (`externalOrderId`, `wbp_booking_id`, `channel`).
2. OTA Mutations: Cancellations & Modifications (Feature 21):
   - Handling cancellation messages: release flat, update status to `cancelled`, trigger debounced ARI refresh.
   - Safety rule: If guest already checked in (`status === "checked_in"` or past check-in time), do NOT auto-cancel; route to quarantine with urgent alert.
   - Handling modifications: diff old vs new dates, guest count, plan. If new dates are available on same or another flat, update; if conflict, route to quarantine.
3. Automations & Strict PIX Suppression (Feature 23):
   - For OTA reservations (`channel: booking | airbnb`), strictly SUPPRESS PIX generation and payment links (payment is collected either by channel or at front desk; guests must not receive PIX requests).
   - In `auto` mode: schedule standard guest registration (SERPRO/FNRH link), housekeeping task generation, reception notifications.
   - In `observe` mode: record automation intents without dispatching external messages.
4. Output: Write your findings and recommendations in `analysis.md` and complete handoff in `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion. Do NOT write or modify application code.

## 2026-10-14T01:39:58Z
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
**Action**: Incorporate these 4 points into your `analysis.md` and `handoff.md` (especially points 2, 3, and 4 which directly impact allocation, payment status, and deduplication).

