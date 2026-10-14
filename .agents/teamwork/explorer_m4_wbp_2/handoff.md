# Handoff Report: Milestone 4 (Fair-Share Allocation, Mutations & PIX Suppression)
**Role**: Explorer 2 (Features 19, 21, and 23)  
**Recipient**: Parent Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m4_wbp_2`  
**Date**: 2026-10-14  

---

## 1. Observation

Direct code and documentation observations from the codebase:

1. **Canonical 19 Flats of CorpFlats Soho Residence**:
   - `artifacts/api-server/wbp/availability.mjs` lines 16–36:
     ```javascript
     export const CORPFLATS_19_FLATS = [
       { id: 1, number: "113", colName: "113 solteiro" },
       { id: 2, number: "114", colName: "114 Solteiro" },
       { id: 3, number: "116", colName: "116" },
       { id: 4, number: "211", colName: "211 de casal" },
       { id: 5, number: "212", colName: "212 solteiro" },
       { id: 6, number: "215", colName: "215 Solteiro" },
       { id: 7, number: "313", colName: "313 solteiro" },
       { id: 8, number: "408", colName: "408 casal" },
       { id: 10, number: "509", colName: "509 casal" },
       { id: 11, number: "511", colName: "511 casal" },
       { id: 12, number: "512", colName: "512 casal" },
       { id: 13, number: "605", colName: "605 solteiro" },
       { id: 14, number: "712", colName: "712 Solteiro SPLIT" },
       { id: 15, number: "715", colName: "715 Solteiro" },
       { id: 16, number: "904", colName: "904 split" },
       { id: 17, number: "905", colName: "905 split" },
       { id: 18, number: "907", colName: "X 907 casal" },
       { id: 19, number: "1004", colName: "1004 Solteiro X" },
       { id: 21, number: "1304", colName: "1304 Solteiro(ferro unindo)" }
     ];
     ```
   - Matches exactly the database records in `data/database.json` (`flats` array).

2. **Legacy `pago_total` Hardcoded Overwrite**:
   - `artifacts/api-server/demo-server.mjs` lines 14037–14039:
     ```javascript
     const isOtaRes = rChanLower.includes("booking") || rChanLower.includes("airbnb");
     const isPaid = isOtaRes || r.paymentStatus === "pago_total" || r.paymentStatus === "pago";
     ```
   - `artifacts/api-server/demo-server.mjs` lines 14200–14202:
     ```javascript
     if (isOta && (resolvedPaymentStatus === "pendente" || !resolvedPaymentStatus)) {
       resolvedPaymentStatus = "pago_total";
     }
     ```
   - `artifacts/api-server/demo-server.mjs` lines 14225–14230:
     ```javascript
     if (isOta) {
       resolvedPaymentStatus = "pago_total";
       if (finalTotalAmount > 0) {
         resolvedPaidAmount = finalTotalAmount;
       }
     }
     ```
   - This unconditionally converts `PaymentCollect = Property` to `pago_total`, which blinds reception to unpaid balances.

3. **Legacy Automatic PIX Issuance**:
   - `artifacts/api-server/demo-server.mjs` lines 14639–14665:
     ```javascript
     if (resolvedStatus === "pre_reserva") {
       if (!newReservation.pixCopiaECola && Number(newReservation.totalAmount) > 0) {
         try {
           const pixResult = await createInterPixCob({ ... });
           newReservation.pixTxId = pixResult.txid;
           newReservation.pixCopiaECola = pixResult.pixCopiaECola;
         } catch (pixErr) {
           const staticPayload = generateStaticPixPayload({ ... });
           newReservation.pixTxId = cleanTxId;
           newReservation.pixCopiaECola = staticPayload;
         }
       }
       triggerImmediateWhatsApp(db, saveDatabase, "pre_reservation_created", newReservation);
     }
     ```

4. **WebBookingPro Payload Inclusivity & Semantics**:
   - `wbpAPI.yaml` lines 4609–4614:
     ```yaml
     EndDate:
       type: string
       format: date
       description: >
         The date of the last night of stay (equal to departure date minus one).
     ```
   - `wbpAPI.yaml` lines 4497–4507:
     ```yaml
     PaymentCollect:
       type: string
       enum:
         - Property
         - Channel
       description: >
         Who collects outstanding balance from the guest? Property means that the property takes the payment, either by charging the credit card, or on arrival. Channel means that the channel will take the payment...
     ```

5. **Mutation Touchpoints & Debounced ARI Sync**:
   - `artifacts/api-server/demo-server.mjs` lines 14756–14762 (create), 16460 (update), 19774 (delete/cancel):
     ```javascript
     notifyPmsMutation(db, {
       type: "reservation_cancelled",
       checkinDate: r.checkinDate,
       checkoutDate: r.checkoutDate
     });
     ```
   - `artifacts/api-server/wbp/ari-sync.mjs` line 858: `notifyPmsMutation` initiates debounced push coalescing bursts into a single ARI update.

---

## 2. Logic Chain

1. **From Observation 1 & 4 -> Fair-Share Allocation Algorithm**:
   - Soho Residence operates 19 identical flats. Selecting flats purely sequentially (e.g. index 0) causes extreme wear on low-numbered flats.
   - By querying `calculateCanonicalAvailability(checkinDate, checkoutDate, { db })`, candidate flats are validated against all 5 collision sources.
   - For all available flats, computing the historical checkout count (`checkoutCount`) and ordering candidates ascendingly balances laundry, maintenance, and turnover across all 19 units.
   - If 0 units are available across the date range, an overbooking event is flagged and diverted to `db.quarantineBookings`.

2. **From Observation 2 & 4 -> Exact `PaymentCollect` Handling**:
   - WBP explicitly tags who collects: `PaymentCollect === "Channel"` vs `PaymentCollect === "Property"`.
   - When `PaymentCollect === "Channel"`, the OTA has collected the funds; setting `paymentStatus = "pago_total"` and recording `netAmount` is correct.
   - When `PaymentCollect === "Property"`, the hotel must collect at the desk; setting `paymentStatus = "pendente"` with an explicit reception alert (`receptionAlert`) prevents the financial loss caused by the legacy hardcoded override.

3. **From Observation 3 & Directive 2 -> Strict PIX Suppression**:
   - OTA guests must never receive PIX payment solicitations.
   - Bypassing `createInterPixCob` and `generateStaticPixPayload` completely for `channel: booking | airbnb` ensures `pixTxId` and `pixCopiaECola` remain null.
   - In `auto` mode, standard automations (SERPRO digital FNRH registration, housekeeping task, front-desk arrival email, WhatsApp welcome) proceed normally without payment links.

4. **From Observation 5 -> Mutation Handling & Safety Guard**:
   - Cancellations received after a guest has checked in (`status === "checked_in"` or current time >= check-in time) cannot be auto-cancelled without stranding an in-house guest and releasing the room into OTA inventory. Diverting these to Quarantine with an urgent alert guarantees operational integrity.
   - Modifications are checked against the canonical availability engine. If the current flat or an alternate fair-share flat can accommodate the new stay dates, the reservation is updated and the union date range is sent to `notifyPmsMutation`. If no flat is free, the modification is quarantined without corrupting the current reservation.

5. **From Parent Directives 1 & 3 -> Quality and Security Assurance**:
   - Zero CVV storage is enforced by recursive in-memory stripping before writing to raw storage.
   - Full PAN is masked to last4/brand, preventing leaks in logs or database records.
   - In test harnesses, sandbox loopback endpoints (`mock-zapi`, `mock-smtp`) and `NODE_ENV="test"` provide complete test isolation without violating AGENTS.md rules against silencing production code.

---

## 3. Caveats

1. **Inbound Webhook Parsing & Background Polling**: Handled by Explorer 1 (`wbp/callbacks.mjs` and `wbp/polling.mjs`). Explorer 2's `inbox.mjs` provides the entry point `processIncomingOTA(normalizedBooking)`.
2. **Quarantine UI, Manual Reallocation & Daily Management Alerts**: Formulated by Explorer 3 (`wbp/quarantine.mjs` and `wbp/alerts.mjs`).
3. **Credit Card Encrypted Vault (AES-256-GCM)**: Full decryption and admin re-authentication tokens are scheduled for Milestone 5 (F25, F26). M4 ingestion strictly performs CVV stripping and PAN masking.
4. **Soho Residence Flat Numbers**: The dispatch referenced `101-105, 201-205...` as an example; the real canonical flats are `113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304`, as confirmed in `availability.mjs` and `data/database.json`.

---

## 4. Conclusion

Features 19, 21, and 23 should be implemented within a dedicated module:
- `artifacts/api-server/wbp/inbox.mjs`
- Mirrored byte-for-byte at `scripts/wbp/inbox.mjs`

The module exposes:
1. `normalizeOtaBooking(rawPayload)`: Normalizes WBP schema, resolves inclusive `EndDate`, strips CVV in memory, masks PAN.
2. `calculateFairShareStats(db)`: Analyzes checkouts and wear across the 19 flats.
3. `allocateFairShareFlat(checkinDate, checkoutDate, options)`: Selects optimal available flat.
4. `processIncomingOTA(normalizedBooking, options)`: Coordinates deduplication, legacy linking, allocation, PIX suppression, and automation dispatch.
5. `handleOtaCancellation(reservation, normalizedBooking, db)`: Enforces check-in safety guard and triggers debounced ARI sync.
6. `handleOtaModification(reservation, normalizedBooking, db)`: Executes 3-tier reallocation, logs before/after diffs, and triggers ARI sync.

---

## 5. Verification Method

To independently verify this architectural specification and its upcoming implementation:

1. **Targeted Test Execution**:
   Run the dedicated Milestone 4 test file (when implemented by the worker):
   ```powershell
   node --test tests/wbp-integration/m4-booking-processing.test.mjs
   ```
2. **Database Integrity & Test Isolation Check**:
   Verify that `data/database.json` maintains identical SHA-256 hash and modification timestamp before and after test execution.
3. **Card Hygiene Verification**:
   Inspect database copies, logs, and `wbp_raw_payloads` to confirm:
   - Zero occurrences of `cvv`, `cvc`, `security_code`.
   - Zero unmasked 16-digit PAN numbers.
4. **PaymentCollect Assertion**:
   Assert that bookings with `PaymentCollect: "Property"` result in `paymentStatus: "pendente"`, while `PaymentCollect: "Channel"` result in `paymentStatus: "pago_total"`.
5. **PIX Suppression Assertion**:
   Assert that `newReservation.pixCopiaECola` and `newReservation.pixTxId` are null for all OTA bookings.
6. **Invalidation Conditions**:
   - Any execution of global test suites (`tests/*.test.mjs`) violates AGENTS.md.
   - Any silencing/commenting of notification triggers in production code violates AGENTS.md.
   - Any overwrite of `PaymentCollect: "Property"` to `"pago_total"` invalidates the financial contract.
