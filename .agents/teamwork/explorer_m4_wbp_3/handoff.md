# Handoff Report — Explorer 3 (Milestone 4: Features 20, 22 & 24)

**From**: Explorer 3 (`explorer_m4_wbp_3`)  
**To**: Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`) / Implementer Worker M4  
**Date**: 2026-10-14  
**Scope**: Feature 20 (Quarantine Management Engine), Feature 22 (Manual Reservation Reconciliation), Feature 24 (Critical Events & Daily Alerts)

---

## 1. Observation

Direct observations from codebase inspection and documentation:

1. **Legacy Forced Payment Status (`demo-server.mjs:14196-14230`)**:
   ```javascript
   const chanLower = String(channel || "").toLowerCase();
   const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
   let resolvedPaidAmount = Number(paidAmount) || 0;
   let resolvedPaymentStatus = paymentStatus || "pendente";
   if (isOta && (resolvedPaymentStatus === "pendente" || !resolvedPaymentStatus)) {
     resolvedPaymentStatus = "pago_total";
   }
   ...
   if (isOta) {
     resolvedPaymentStatus = "pago_total";
     if (finalTotalAmount > 0) {
       resolvedPaidAmount = finalTotalAmount;
     }
   }
   ```
   *Impact*: Legacy reservations typed as `booking` or `airbnb` blindly force `paymentStatus = "pago_total"`. For WebBookingPro electronic reservations, `PaymentCollect = "Property"` indicates payment must be collected at the hotel and must remain `pendente`.

2. **Persistent ARI Failure Hook in Synchronizer (`artifacts/api-server/wbp/ari-sync.mjs:747-785`)**:
   ```javascript
   handleSyncFailure(err, minDate, maxDate) {
     if (!this.failureStartTime) {
       this.failureStartTime = Date.now();
     }
     ...
     const elapsedMs = Date.now() - this.failureStartTime;
     if (elapsedMs >= this.alertThresholdMs && !this.persistentAlertSent) {
       this.triggerPersistentFailureAlert(err, elapsedMs);
       this.persistentAlertSent = true;
     }
   }
   triggerPersistentFailureAlert(err, elapsedMs) {
     const alertPayload = {
       type: "persistent_failure",
       severity: "critical",
       elapsedMinutes: Math.round(elapsedMs / 60000),
       error: err.message,
       timestamp: new Date().toISOString()
     };
     if (this.onAlert) {
       this.onAlert(alertPayload);
     }
   }
   ```
   *Impact*: `WbpAriSynchronizer` already tracks outage time and fires `this.onAlert` when exceeding 15 minutes (`alertThresholdMs = 900000`). It is ready to connect directly to the alert dispatcher.

3. **Existing WhatsApp & Email Transport Signatures (`artifacts/api-server/zapi-service.mjs:2770-2804`, `mail-service.mjs:100`)**:
   `sendZapiMessage(config, { phone, message, bypassTestMode, recipientRole })` and `sendEmailAsync({ db, saveDatabase, recipient, subject, bodyHtml, metadata })` are active in production and are backed by in-memory sandbox servers (`mock-zapi.mjs` on port 5056 and `mock-smtp.mjs` on port 5025).

4. **WBP Wire Format for Bookings (`e2e/wbp-simulator/server.mjs:304-363`)**:
   `OrderId` is string up to 64 chars; `IsCancellation` and `IsModification` (0 or 1); `PaymentCollect` (`"Channel"` or `"Property"`); `Rooms` has `StartDate` (check-in) and `EndDate` (last night, checkout minus 1 day); `Customers` array has `CustomerFName`, `CustomerLName`, `CustomerEmail`, `CustomerCountry`, `CustomerPhone`.

5. **Canonical Availability Collision Sources (`artifacts/api-server/wbp/availability.mjs:121-335`)**:
   `calculateCanonicalAvailability(startDate, endDate)` unifies all 5 sources: active reservations, holds (`pendingModification`), room blocks (`roomBlocks`), maintenance orders (`serviceOrders`), and decommissioned flats (`status === 'manutencao_bloqueada'`).

6. **Parent Directive on Card Hygiene & Deduplication (`DISPATCH.md:2026-10-14T01:40:10Z`)**:
   - Discard CVV (`card_cvv`, `cvv`, `cvc`, `security_code`) immediately in memory before any storage or logs.
   - PAN must never appear in `db.reservations`, `db.wbpQuarantine`, or logs in cleartext (only mask/last4).
   - Existing manual reservations matching safely must be linked (`externalOrderId`), never duplicated. Ambiguous matches route to Quarantine.

---

## 2. Logic Chain

1. **From Observation 1 to Feature 20 & Feature 24**:
   Because `PaymentCollect = "Property"` means the hotel must charge the guest upon arrival, applying the legacy `pago_total` override would lead to revenue leakage. Therefore, the intake pipeline must preserve `paymentStatus = "pendente"` and dispatch an alert to the front desk.
2. **From Observation 4 & 5 to Feature 20**:
   When an incoming OTA reservation has `minAvailable === 0` across the 19 flats for any requested night, it cannot be fulfilled without displacing another guest. Placing it into `db.wbpQuarantine` with `reason: OVERBOOKING` protects existing reservations while preventing data loss, and exposes endpoints for staff intervention (`assign_flat`, `reject`).
3. **From Observation 4 & 6 to Feature 22**:
   Pre-existing manual bookings share channel, date ranges, and similar names with incoming OTA payloads. An automated scoring heuristic combining channel matching, date matching, token-based fuzzy name similarity, and phone/email matching classifies comparisons into Safe Match ($\ge 80\%$), Ambiguous ($50-79\%$), and Distinct ($<50\%$). Safe matches are linked by populating `externalOrderId` without altering PMS reservation attributes; ambiguous cases route to Quarantine.
4. **From Observation 2 & 3 to Feature 24**:
   The `WbpAriSynchronizer.onAlert` callback connects to `WbpAlertsManager`, transmitting immediate alerts to `adminWhatsApp` and `receptionEmail`. Combined with the daily handover routine at 08:00 (checking `bNow.hours === 8`), management receives proactive alerts for overbooking, quarantine backlog, and sync degradation.
5. **From Observation 3 & 6 to Test Isolation**:
   Because `AGENTS.md` strictly forbids external notification firing during test runs, and test suites must run isolated, `WbpAlertsManager` supports pluggable sender injection and routes to local sandbox mocks (`mock-zapi` on 5056 and `mock-smtp` on 5025) whenever `NODE_ENV === "test"`.

---

## 3. Caveats

1. **WBP Cancellation Protocol**: WebBookingPro standard callbacks push `BookingCreate` with `IsCancellation = 1`. If the hotel desires to initiate a cancellation back to the channel manager from the PMS (`CancelBooking`), the WBP API specification indicates this endpoint requires property-level certification. Hence, rejecting a quarantine item currently records an internal rejection and does not initiate outbound `CancelBooking` until certified.
2. **Card Vault Separation**: Full card encryption and re-authentication tokens belong strictly to Milestone 5 (Feature 25 & 26). In Milestone 4, card hygiene is enforced by stripping CVV immediately in memory and storing only masked PAN (`**** **** **** 1234`).
3. **Simulated Environment**: WebBookingPro production credentials are not yet provisioned; all validations must continue to run exclusively against `e2e/wbp-simulator`.

---

## 4. Conclusion

The architectural designs for Features 20, 22, and 24 are fully formulated, documented in `analysis.md`, and ready for immediate implementation by Worker M4:
- **`wbp/quarantine.mjs`**: Handles 7 anomaly triggers, stores structured records in `db.wbpQuarantine`, and provides `resolve`, `reject`, and `link` endpoints.
- **`wbp/reconciliation.mjs`**: Normalizes guest names, evaluates composite match scores, produces the 4-part reconciliation report (`matched`, `potential_duplicates`, `unmatched_pms`, `unmatched_ota`), and safely links duplicate reservations.
- **`wbp/alerts.mjs`**: Dispatches immediate manager alerts for overbooking, quarantine, and persistent ARI failures (>15 min), schedules the 08:00 daily shift summary, and maintains 100% test isolation.

---

## 5. Verification Method

To verify the implementation once coded by Worker M4:

1. **Test Execution**:
   Run ONLY the dedicated Milestone 4 test file (respecting AGENTS.md):
   ```bash
   node --test tests/wbp-integration/m4-quarantine-alerts.test.mjs
   ```
2. **Specific Assertions to Verify**:
   - Ingest an OTA booking when all 19 flats are occupied $\to$ verify it appears in `db.wbpQuarantine` with `status: "pending"` and `reason: "OVERBOOKING"`.
   - Verify manager WhatsApp/Email alert is dispatched to mock servers (counter increases in `mock-zapi` / `mock-smtp`).
   - Call `POST /api/wbp/quarantine/:id/resolve` with `assign_flat` $\to$ verify reservation is added to `db.reservations`, quarantine status updates to `resolved`, and incremental ARI sync is triggered.
   - Run reconciliation on sample PMS data vs WBP bookings $\to$ verify safe matches are linked without duplicating, and ambiguous cases route to quarantine.
   - Verify `PaymentCollect = "Property"` creates reservation with `paymentStatus = "pendente"` (not overwritten to `pago_total`).
   - Confirm zero external HTTP calls to `api.z-api.io` or live SMTP servers.
   - Confirm `data/database.json` maintains unmutated SHA-256 and mtime before and after test execution.
