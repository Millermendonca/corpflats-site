# Handoff Report — challenger_m1_1 (Housekeeping Challenger)

## 1. Observation

### 1.1 Executed Test Suite
Executed the isolated adversarial test harness:
```bash
node --test tests/challenger-m1-1.test.mjs
```
Output:
```
# Subtest: CHALLENGER M1: Adversarial Housekeeping Challenge
    # Subtest: 1. Card Generation Adversarial Testing (getRequestsForDate & GET /api/reservations/checkouts)
        ok 1 - Scenario 1: B2B reservation on check-in day (checkinDate === dateStr) MUST NOT generate stayover card
        ok 2 - Scenario 2: B2B reservation on checkout day (checkoutDate === dateStr) MUST NOT generate stayover card (generates checkout)
        ok 3 - Scenario 3: Non-B2B channels (Booking, Airbnb, WhatsApp, Site Direto) in intermediate days MUST NEVER generate stayover cards
        not ok 4 - Adversarial Probe A: Non-B2B channels with companyName / agencyName MUST NOT leak into B2B stayovers
          ---
          error: 'CRITICAL LEAK: Booking reservation with companyName was classified as B2B and generated a stayover card!'
          code: 'ERR_ASSERTION'
          expected: undefined
          actual: { id: ..., source: 'stayover', cleaningType: 'stayover', ... }
          ...
        not ok 5 - Adversarial Probe B: B2B reservations that are already completed / checked-out MUST NOT generate stayover cards
          ---
          error: 'DEFECT: getRequestsForDate generated stayover card for a reservation with status === "completed" / checkoutDone === true!'
          code: 'ERR_ASSERTION'
          expected: undefined
          actual: { id: ..., source: 'stayover', cleaningType: 'stayover', ... }
          ...
        ok 6 - Scenario 4: B2B reservation in intermediate day (checkinDate < dateStr && checkoutDate > dateStr) MUST generate stayover card
        ok 7 - Scenario 4b: Idempotency of card generation in getRequestsForDate
    # Subtest: 2. Stayover Cleaning Completion Adversarial Testing (PATCH /api/cleaning/assignments/:id/status)
        ok 1 - Scenario 5: Completing stayover cleaning MUST NOT free flat, complete reservation, or set checkoutDone
        ok 2 - Scenario 6: 10-minute minimum lock does NOT block housekeeper in stayover, but DOES block in checkout
        ok 3 - Scenario 7: Do Not Disturb (DND) mode blocks maid from starting or completing stayover with HTTP 422
        ok 4 - Scenario 8: Passing isVacant: true for a stayover request is safely overridden (invariant holds)
    # Subtest: 3. Twin-Server SHA-256 Parity Empirical Audit
        ok 1 - Twin servers artifacts/api-server/demo-server.mjs and scripts/demo-server.mjs SHA-256 parity
# tests 12
# suites 4
# pass 10
# fail 2
```

### 1.2 Direct Code Inspections

#### Defect 1: Leak of Non-B2B Channels into Stayover Cards via `companyName` / `agencyName`
- File: `artifacts/api-server/demo-server.mjs:14636-14651` (and `scripts/demo-server.mjs`):
```javascript
function isB2bReservation(r) {
  if (!r) return false;
  const chanLower = String(r.channel || "").toLowerCase().trim();
  return Boolean(
    chanLower === "b2b" ||
    chanLower.includes("b2b") ||
    r.isB2b === true ||
    r.b2bReservationNumber ||
    r.agencyId ||
    r.agencyName ||
    r.agencyTradeName ||
    r.companyName ||
    r.b2bLocatorRloc ||
    String(r.code || "").startsWith("B2B-")
  );
}
```
- Empirical Verification:
```bash
node -e "import('./artifacts/api-server/demo-server.mjs').then(({ isB2bReservation }) => {
  console.log('bookingWithCompany:', isB2bReservation({ channel: 'booking', companyName: 'Petrobras S.A.' }));
  console.log('airbnbWithCompany: ', isB2bReservation({ channel: 'airbnb', companyName: 'Vale S.A.' }));
  console.log('whatsappWithAgency:', isB2bReservation({ channel: 'whatsapp', agencyName: 'Agência Corporativa' }));
  process.exit(0);
});"
```
Output verbatim:
```
bookingWithCompany: true
airbnbWithCompany:  true
whatsappWithAgency: true
```
Any OTA or Direct reservation (Booking.com, Airbnb, WhatsApp) that includes corporate billing details (`companyName` or `agencyName`) is falsely classified as B2B, causing `getRequestsForDate` and `/api/reservations/checkouts` to generate stayover cards on intermediate days.

#### Defect 2: Ghost Stayover Cards for Checked-Out / Completed Reservations
- File: `artifacts/api-server/demo-server.mjs:14792-14801`:
```javascript
  const b2bStayoversForDate = (db.reservations || []).filter(r =>
    r.status !== "cancelada" &&
    r.status !== "cancelado" &&
    r.status !== "no_show" &&
    r.checkinDate &&
    r.checkoutDate &&
    r.checkinDate < dateStr &&
    r.checkoutDate > dateStr &&
    isB2bReservation(r)
  );
```
- Observed Behavior: The filter excludes ONLY `cancelada`, `cancelado`, and `no_show`. It does NOT exclude reservations with `r.status === "completed"`, `r.status === "checked_out"`, `r.checkoutDone === true`, or `r.earlyCheckout === true`.
- Empirical Verification in Probe B: When a B2B guest checks out early (e.g. departs on day 2 of a 10-day stay and is marked `status: "completed"`, `checkoutDone: true`), `getRequestsForDate` on day 6 continues to generate a daily stayover cleaning card for Flat 105.

### 1.3 Verified Positive Invariants
1. **Scenario 1 (Check-in Day)**: `checkinDate === dateStr` correctly evaluates `checkinDate < dateStr` as `false`, generating 0 stayover cards.
2. **Scenario 2 (Checkout Day)**: `checkoutDate === dateStr` correctly evaluates `checkoutDate > dateStr` as `false`, generating a standard checkout card instead of a stayover card.
3. **Scenario 3 (Pure OTA Intermediate Days)**: Booking, Airbnb, and WhatsApp without companyName evaluate `isB2bReservation(r) === false`, producing 0 stayover cards.
4. **Scenario 4 (Valid B2B Intermediate Days)**: Valid active B2B reservations generate cards with `source: "stayover"`, `cleaningType: "stayover"`, `isOccupied: true`, `isVacant: false`, and `linenTracking` attached.
5. **Scenario 5 (Safe Completion)**: On transition to `clean`, `relatedFlat.isOccupied` remains `true`, reservation status remains active (e.g. `confirmada`), `checkoutDone` remains `false`, and `linenChangeHistory` records the bed/towel changes.
6. **Scenario 6 (10-Minute Lock Bypass)**: Stayovers bypass the 10-minute minimum lock (`!isStayover` guard in line 16181), whereas normal checkouts are blocked with HTTP 400 when elapsed time is under 10 minutes.
7. **Scenario 7 (Do Not Disturb Enforcement)**: Maids attempting to start or complete a stayover under DND receive HTTP 422 with `"Não é possível iniciar ou concluir a limpeza. Hóspede ativou o modo Não Perturbe."`.
8. **Scenario 8 (isVacant Invariant)**: Housekeepers sending `{ isVacant: true }` in stayover updates are overridden: `isVacant` remains `false` and `relatedFlat.isOccupied` remains `true`.
9. **Twin-Server Parity**: `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` match after twin resynchronization.

---

## 2. Logic Chain

1. *From Observation 1.1 and 1.2*: `isB2bReservation` evaluates `r.companyName`, `r.agencyName`, and `r.agencyTradeName` as independent fallback boolean OR clauses (`||`).
2. *From Observation 1.2*: OTA platforms (Booking.com, Airbnb) allow guests to enter corporate names or billing entities during checkout.
3. *Logic Step*: When a Booking.com or Airbnb guest enters a company name, `r.companyName` is truthy, triggering `isB2bReservation(r) = true` despite `r.channel === "booking"`.
4. *Direct Violation*: This directly violates requirement § R1 of `ORIGINAL_REQUEST.md`:
   *"Reservas de Booking, Airbnb, WhatsApp, Site Direto ou outros canais nunca geram limpeza diária de stayover."*
5. *From Observation 1.1 and 1.2 (Probe B)*: In `getRequestsForDate`, `b2bStayoversForDate` only checks `r.status !== "cancelada" && r.status !== "cancelado" && r.status !== "no_show"`.
6. *Logic Step*: Completed reservations (including early check-outs) retain their original `checkinDate` and `checkoutDate`. Because their status is `"completed"` or `"checked_out"` (and not `"cancelada"`), they satisfy all predicates of `b2bStayoversForDate`.
7. *Direct Violation*: Housekeeping cards for stayover cleaning are generated for unoccupied rooms where the guest has already checked out and departed.
8. *Conclusion*: Milestone 1 fails adversarial verification on two functional counts. A `REQUEST_CHANGES` verdict is necessary.

---

## 3. Caveats

- Milestone 2 (Maid rates in `maid-automation-service.mjs`), Milestone 3 (Guest Portal UI), and Milestone 4 (Housekeeper Flat Cards UI) were not evaluated as they belong to subsequent milestones.
- The twin-server SHA-256 parity was temporarily broken earlier due to asynchronous edits in `artifacts/api-server/demo-server.mjs`, but is now passing.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

Milestone 1 core implementation is mostly solid (Scenarios 1, 2, 3, 4, 5, 6, 7, and 8 all passed 100%), but contains two critical empirical bugs that must be remediated by worker before proceeding to Milestone 2:

### Required Remediation:
1. **Fix `isB2bReservation` (demo-server.mjs ~line 14636)**:
   Explicitly reject non-B2B channels before inspecting corporate fields, unless `r.isB2b === true` or channel explicitly contains `"b2b"`:
   ```javascript
   function isB2bReservation(r) {
     if (!r) return false;
     const chanLower = String(r.channel || "").toLowerCase().trim();
     const nonB2b = ["booking", "airbnb", "whatsapp", "site", "direct", "balcao"];
     if (nonB2b.includes(chanLower) && !r.isB2b && !chanLower.includes("b2b")) {
       return false;
     }
     return Boolean(
       chanLower === "b2b" ||
       chanLower.includes("b2b") ||
       r.isB2b === true ||
       r.b2bReservationNumber ||
       r.agencyId ||
       r.agencyName ||
       r.agencyTradeName ||
       r.companyName ||
       r.b2bLocatorRloc ||
       String(r.code || "").startsWith("B2B-")
     );
   }
   ```
2. **Fix `b2bStayoversForDate` in `getRequestsForDate` (demo-server.mjs ~line 14792)**:
   Exclude completed, checked-out, or early-checkout reservations:
   ```javascript
   const b2bStayoversForDate = (db.reservations || []).filter(r =>
     r.status !== "cancelada" &&
     r.status !== "cancelado" &&
     r.status !== "no_show" &&
     r.status !== "completed" &&
     r.status !== "checked_out" &&
     !r.checkoutDone &&
     !r.earlyCheckout &&
     r.checkinDate &&
     r.checkoutDate &&
     r.checkinDate < dateStr &&
     r.checkoutDate > dateStr &&
     isB2bReservation(r)
   );
   ```
3. Keep twin-server parity 100% synchronized between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.

---

## 5. Verification Method

To independently verify the defects:
```bash
node --test tests/challenger-m1-1.test.mjs
```
Expected prior to fix:
- `Adversarial Probe A`: Fails with `AssertionError: CRITICAL LEAK: Booking reservation with companyName was classified as B2B and generated a stayover card!`
- `Adversarial Probe B`: Fails with `AssertionError: DEFECT: getRequestsForDate generated stayover card for a reservation with status === "completed" / checkoutDone === true!`

Expected post fix:
- 12/12 tests passing across 4 suites.
