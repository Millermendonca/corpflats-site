## 2026-10-14T01:39:03Z
You are Explorer 1 for Milestone 4 (Webhooks & Polling).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m4_wbp_1`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. Existing implementation files:
   - `artifacts/api-server/wbp/storage.mjs` (raw storage and idempotency)
   - `artifacts/api-server/wbp/client.mjs` (outbound client, getBookingList, ackBooking)
   - `e2e/wbp-simulator/server.mjs` (WBP simulator callback behavior and payload formats)
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\wbpAPI.yaml`

Your Mission:
Analyze and formulate the architectural blueprint for Features 17 (Inbound Webhooks & Form Parsing) and 18 (Background Polling):
1. Inbound Webhook Callbacks (Feature 17):
   - WBP pushes `/BookingCreate`, `/NotifyBooking`, and `/ARIFullRefresh`.
   - In WBP specification, webhooks are delivered as `application/x-www-form-urlencoded` containing parameters (e.g. `pms_id`, `hotel_id`, `version`, `order_id`, XML or JSON booking payload).
   - How to parse, sanitize, validate credentials/signatures, and store raw payloads immediately via `storage.mjs` (`recordRawPayload`) before any business logic.
   - Expected return status and body to WBP (e.g., standard XML or JSON `{ Success: true }` or status 200).
2. Background Polling Backup (Feature 18):
   - Periodic polling interval: every 30 minutes.
   - Version tracking: `wbp_booking_version - 5 minutes` margin deduction to prevent missing concurrent updates, with fallback to null/0 on first run.
   - Retrieval via `client.getBookingList({ propertyId, lastVersion })`.
   - Processing each booking and calling `client.ackBooking` only after durable storage.
3. Resilience & Modes:
   - Behavior under switch modes `off` (reject/ignore or 503), `observe` (store raw payload, log, but do not mutate PMS), `auto` (full processing).
4. Output: Write your findings and recommendations in `analysis.md` and complete handoff in `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion. Do NOT write or modify application code.

## 2026-10-14T01:39:43Z
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
**Action**: Incorporate these 4 points into your `analysis.md` and `handoff.md`.
