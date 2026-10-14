# Milestone 4 Architectural Blueprint: Features 19, 21, and 23
**Author**: Explorer 2 (Milestone 4 — Fair-Share Allocation, Mutations & PIX Suppression)  
**Date**: 2026-10-14  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m4_wbp_2`  

---

## Executive Summary

This document formulates the technical architecture and algorithmic specifications for **Feature 19 (OTA Inbox & Fair-Share Flat Allocation)**, **Feature 21 (OTA Mutations: Cancel & Mod)**, and **Feature 23 (Automations & Strict PIX Suppression)** within the WebBookingPro integration of CorpFlats Soho Residence (19 flats in Campos dos Goytacazes/RJ). It directly addresses and enforces the four mandatory architectural directives from the project orchestrator: strict test notification isolation without code silencing, exact `PaymentCollect` semantics preventing legacy `pago_total` corruption, strict credit card hygiene upon ingestion (zero CVV, zero PAN leakage), and safe reconciliation/linking of legacy manual OTA reservations.

---

## 1. Feature 19: OTA Inbox & Fair-Share Flat Allocation

### 1.1 Inbound OTA Booking Payload Anatomy & Normalization
WebBookingPro (WBP) pushes bookings via JSON webhook `/BookingCreate`, notifies via form-urlencoded `/NotifyBooking` (triggering `GetBookingId`), or yields bookings via periodic polling (`GetBookingList` -> `GetBookingId`).

#### WBP Reservation Data Schema (wbpAPI.yaml / OpenAPI 3.1):
- `OrderId`: Unique OTA booking identifier (e.g. Booking.com 9-digit ID, Airbnb alphanumeric, up to 64 chars).
- `OrderDate` & `OrderTime`: UTC creation timestamp.
- `OrderModifDate` & `OrderModifTime`: UTC modification timestamp (null on new bookings).
- `IsCancellation` (0 or 1) & `IsModification` (0 or 1).
- `PaymentCollect`: Enum `"Channel"` | `"Property"`.
- `Channel`: Lowercase string identifier (e.g., `"booking"`, `"airbnb"`).
- `TotalCurrency` & `TotalPrice`: Gross price charged to the guest including taxes.
- `Customers`: Array of customer profiles (`CustomerFName`, `CustomerLName`, `CustomerEmail`, `CustomerCountry`).
- `Rooms`: Array of booked rooms (for Soho Residence, 1 room per booking):
  - `StartDate`: Arrival date (`YYYY-MM-DD`).
  - `EndDate`: **Last night of stay** (inclusive in WBP spec!).
  - `Units`: Integer (1).
  - `Adults`, `Children`, `Babies`, `Occupancy`.
  - `RateId`: Rate plan identifier (`"sem_cafe"` or `"com_cafe"`).
  - `DayRates`: Array of daily rates: `[{ Date: "YYYY-MM-DD", Rate: number, Currency: "BRL", RateId: string }]`.

#### Resolution of `EndDate` Inclusivity:
In WBP specification (`wbpAPI.yaml` lines 4609–4614 and `README.md` line 49):
> `EndDate`: *"The date of the last night of stay (equal to departure date minus one)."*
In the PMS (`db.reservations`), check-in date is the arrival date and check-out date is the departure date.
Therefore, the canonical check-out date must be computed as:
```javascript
const checkoutDate = normalizedDayRates.length > 0
  ? addDays(normalizedDayRates[normalizedDayRates.length - 1].Date, 1)
  : addDays(room.EndDate, 1);
```

#### Canonical `NormalizedBooking` Interface:
```typescript
interface NormalizedBooking {
  rawPayloadId: string;
  wbpBookingId: string;
  externalOrderId: string;
  channel: "booking" | "airbnb" | string;
  status: "new" | "modified" | "cancelled";
  isCancellation: boolean;
  isModification: boolean;
  orderDate: string;
  orderTime: string;
  orderModifDate?: string;
  orderModifTime?: string;
  checkinDate: string;
  checkoutDate: string;
  nights: number;
  guestCount: number;
  adults: number;
  children: number;
  guest: {
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    country: string;
    phone?: string;
    document?: string;
  };
  ratePlanId: "sem_cafe" | "com_cafe";
  includeBreakfast: boolean;
  totalPrice: number;
  currency: string;
  paymentCollect: "Channel" | "Property";
  netAmount: number;
  dayRates: Array<{ date: string; rate: number; rateId: string }>;
  hasCard: boolean;
  cardLast4?: string;
  cardBrand?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  cardHolderName?: string;
  cardVaultRef?: string;
}
```

---

### 1.2 Card Hygiene on Ingestion (Parent Directive 3 & R6)
When WBP delivers booking payloads containing credit/debit card information (e.g. within `Payments` or `Cards` blocks):
1. **Immediate In-Memory CVV Stripping**:
   Before any payload is serialized to disk or database (`wbp_raw_payloads`, `wbp_storage_state.json`, or PostgreSQL), an in-memory recursive sanitizer function must recursively remove all CVV/CVC properties:
   ```javascript
   export function stripCvvDeep(obj) {
     if (!obj || typeof obj !== "object") return obj;
     if (Array.isArray(obj)) return obj.map(stripCvvDeep);
     const copy = {};
     for (const [key, value] of Object.entries(obj)) {
       if (/^(card_?)?cv[vc2]|security_code$/i.test(key)) {
         continue; // Purged immediately in memory
       }
       copy[key] = stripCvvDeep(value);
     }
     return copy;
   }
   ```
2. **Zero Full PAN Leakage**:
   The full Primary Account Number (PAN) must NEVER be written to:
   - `db.reservations`
   - `db.wbpInbox`
   - `db.quarantineBookings`
   - `artifacts/api-server/audit_logs.jsonl`
   - Application console logs (`console.log`, `console.warn`, `console.error`)
   Only the masked PAN and metadata are retained in the reservation:
   `{ cardLast4: pan.slice(-4), cardBrand: detectCardBrand(pan), cardExpMonth, cardExpYear }`.
   Full card data is handed off exclusively to the encrypted vault (`artifacts/api-server/wbp/card-vault.mjs`) scheduled for Milestone 5.

---

### 1.3 Deduplication & Safe Transition / Linking (Parent Directive 4 & R5)
When an incoming booking arrives:
1. **Direct Idempotency / WBP Order Match**:
   Check if `db.reservations` already contains a reservation with `r.externalOrderId === normalized.externalOrderId` or `r.wbpBookingId === normalized.wbpBookingId`.
   - If found: dispatch to Mutation Handler (Section 2).
2. **Reconciliation with Legacy Manual Reservations**:
   Reception currently enters Booking.com and Airbnb reservations manually into the PMS. When WBP is activated, historical or pre-existing bookings must not be duplicated.
   - Matching heuristics:
     - `r.channel` matches normalized channel (e.g. `booking` or `airbnb`).
     - Dates match exactly: `r.checkinDate === normalized.checkinDate && r.checkoutDate === normalized.checkoutDate`.
     - Guest name compatibility: String similarity >= 85% (using normalized Levenshtein distance or substring equality after removing diacritics and converting to lowercase).
   - **Safe Match Action**:
     - The legacy reservation is **LINKED**:
       `r.externalOrderId = normalized.externalOrderId;`
       `r.wbpBookingId = normalized.wbpBookingId;`
       `r.wbpRawPayloadId = normalized.rawPayloadId;`
       `r.paymentCollect = normalized.paymentCollect;`
     - **DO NOT alter** the assigned flat, do not alter price, do not alter status, do not duplicate.
     - Append an audit log: `"Reserva manual do canal vinculada com sucesso à reserva WebBookingPro."`
   - **Ambiguous Match Action**:
     - If dates match but guest name differs, or guest name matches but dates overlap partially:
       Route directly to Quarantine (`reason = "AMBIGUOUS_MANUAL_MATCH"`). Do not auto-link and do not create a duplicate.

---

### 1.4 PaymentCollect vs Legacy `pago_total` (Parent Directive 2 & R5)
In the legacy codebase (`demo-server.mjs` lines 14038, 14201, 14226):
```javascript
const chanLower = String(channel || "").toLowerCase();
const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
if (isOta) {
  resolvedPaymentStatus = "pago_total"; // FORCED LEGACY OVERRIDE
}
```
For WBP integration, this unconditional override MUST be superseded:
1. **`PaymentCollect === "Channel"`**:
   - The OTA collects the payment directly from the guest (virtual credit card or channel payout).
   - `r.paymentStatus = "pago_total"`
   - `r.paidAmount = normalized.totalPrice`
   - `r.netAmount = calculateChannelNetAmount(normalized.totalPrice, normalized.channel)`
   - Notes: `"Pagamento processado pelo canal (OTA)."`
2. **`PaymentCollect === "Property"`**:
   - The guest will pay at the front desk upon check-in (cash or card).
   - `r.paymentStatus = "pendente"` (**MUST NOT** be overridden to `pago_total`!)
   - `r.paidAmount = 0`
   - `r.receptionAlert = "COBRAR NO CHECK-IN: R$ " + normalized.totalPrice.toFixed(2)`
   - Notes: `"Pagamento a cobrar diretamente pelo hotel no check-in."`
   - Displays a prominent warning banner on the reception PMS dashboard and daily check-in list.

---

### 1.5 Fair-Share Flat Allocation Algorithm
CorpFlats Soho Residence operates 19 individual flats:
`113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304`.
*(Note: Reference in prompt to 101-105 is reconciled to the actual canonical 19 flats defined in `availability.mjs` and `db.flats`)*.

#### Objective:
Distribute guest turnover and wear-and-tear equitably across all 19 units, preventing hot-spotting (e.g. flat 113 receiving 50 checkouts while flat 1304 receives 5).

#### Algorithmic Execution Steps:
1. **Canonical Availability Filtering**:
   Call `calculateCanonicalAvailability(checkinDate, checkoutDate, { db })`.
   A flat is eligible IF AND ONLY IF `checkFlatBlockedOnNight(flat, night, db)` returns `isBlocked: false` for every night in `[checkinDate, checkoutDate - 1]`.
   - If eligible flats count === 0:
     **OVERBOOKING DETECTED**.
     Route payload to Quarantine (`reason = "OVERBOOKING"`). Do NOT allocate any flat.
2. **Turnover & Usage Statistics Calculation**:
   Iterate through `db.reservations` (excluding status `"cancelada"` and `"cancelled"`):
   ```javascript
   export function calculateFairShareStats(db) {
     const flats = getCanonicalFlats(db);
     const stats = {};
     for (const f of flats) {
       const fn = String(f.number);
       stats[fn] = {
         flatId: f.id,
         flatNumber: fn,
         checkoutCount: 0,
         occupiedNights: 0,
         lastCheckoutDate: "1970-01-01"
       };
     }
     for (const r of (db.reservations || [])) {
       if (r.status === "cancelada" || r.status === "cancelled") continue;
       const fn = String(r.flatNumber);
       if (stats[fn]) {
         stats[fn].checkoutCount += 1;
         stats[fn].occupiedNights += getNightsBetween(r.checkinDate, r.checkoutDate).length;
         if (r.checkoutDate > stats[fn].lastCheckoutDate) {
           stats[fn].lastCheckoutDate = r.checkoutDate;
         }
       }
     }
     return stats;
   }
   ```
3. **Special Constraints (Bed Type)**:
   If the OTA booking requests twin beds (`bedType === "twin"` or special requests mention twin configuration):
   Filter eligible flats to twin-capable inventory (`113, 114, 212, 215, 313, 605, 712, 715, 1004, 1304`).
   If none of the twin-capable flats are free, fall back to any available flat and attach an explicit reception instruction.
4. **Multi-Criterion Ranking & Selection**:
   Sort eligible candidate flats by:
   - **Primary**: Ascending `checkoutCount` (least turnover/cleanings).
   - **Secondary**: Ascending `occupiedNights` (least air-conditioner / appliance runtime).
   - **Tertiary**: Ascending `lastCheckoutDate` (longest vacancy/rest period since last departure).
   - **Tie-breaker**: Ascending `flat.id` (deterministic).
5. **Selection**:
   Select candidate at index 0.

---

## 2. Feature 21: OTA Mutations (Cancellations & Modifications)

### 2.1 OTA Cancellations (`IsCancellation: 1`)
When a mutation payload indicates `IsCancellation === 1`:

```
Incoming Cancellation Payload
              │
              ▼
   Locate Existing Reservation
   (by externalOrderId / wbpBookingId)
              │
      ┌───────┴───────┐
      │ Found?        │
      ▼               ▼
     YES              NO ──► Route to Quarantine: UNKNOWN_RESERVATION_CANCELLATION
      │
      ▼
   Safety Rule Evaluation:
   (r.status === 'checked_in' || now >= checkinDateTime)?
      │
      ├───────► TRUE  ──► DO NOT CANCEL RESERVATION!
      │                   Route to Quarantine: CANCELLATION_AFTER_CHECKIN (Urgent Alert)
      │
      ▼ FALSE
   Apply Automatic Cancellation:
   1. Set r.status = 'cancelada'
   2. Record r.cancelReason & r.cancelledAt
   3. Clear housekeeping tasks on checkinDate
   4. Cancel associated breakfast orders
   5. Immediately purge credit card from vault (R6)
   6. Record before/after diff in r.auditLogs
   7. Trigger debounced ARI refresh:
      notifyPmsMutation(db, { type: 'reservation_cancelled', checkinDate, checkoutDate })
```

#### Detailed Safety Rule Logic:
If the guest is currently in-house or past the check-in threshold (14:00 on check-in day):
Automatic cancellation would leave an active in-house guest without a room record and release the flat into channel inventory, causing immediate overbooking.
The cancellation is diverted to Quarantine with an **urgent alert** sent to management via WhatsApp and Email.

---

### 2.2 OTA Modifications (`IsModification: 1`)
When a mutation payload indicates `IsModification === 1`:
1. **Locate Existing Reservation**:
   If not found, route to Quarantine (`MODIFICATION_UNKNOWN_RESERVATION`).
2. **Field Diffing**:
   Compute differences between current reservation and new payload:
   - Check-in date & check-out date
   - Number of guests / room occupancy
   - Rate plan (`sem_cafe` vs `com_cafe`)
   - Total amount
3. **Availability Evaluation**:
   - **Case A (Same flat available)**:
     Check `calculateCanonicalAvailability` on new dates with `{ excludeReservationId: r.id }`.
     If the current flat `r.flatNumber` is completely unblocked for all new dates:
     Update reservation in place on the same flat.
   - **Case B (Current flat blocked, alternative flat free)**:
     If the current flat has a conflict on the new dates, but other flats are available:
     Apply `allocateFairShareFlat` across available alternatives.
     Reallocate reservation to the new flat, migrate housekeeping tasks, and record the room movement in audit logs.
   - **Case C (No flats available / Conflict)**:
     If 0 flats are available on the requested dates:
     **DO NOT overwrite or corrupt the current reservation**.
     Route the modification request to Quarantine (`MODIFICATION_CONFLICT`).
     Notify hotel manager immediately.
4. **Commitment & ARI Synchronization**:
   On successful modification (Case A or B):
   - Update reservation dates, guest count, plan, breakfast, and amounts.
   - Invalidate guest digital check-in signature if dates or room changed (`needsReSignature = true`).
   - Sincronize housekeeping tasks on both previous and new check-in dates.
   - Append full before/after audit log.
   - Trigger incremental ARI refresh covering the span of both old and new dates:
     ```javascript
     const minDate = oldCheckin < newCheckin ? oldCheckin : newCheckin;
     const maxDate = oldCheckout > newCheckout ? oldCheckout : newCheckout;
     notifyPmsMutation(db, {
       type: "reservation_modified",
       checkinDate: minDate,
       checkoutDate: maxDate
     });
     ```

---

## 3. Feature 23: Automations & Strict PIX Suppression

### 3.1 Strict PIX Suppression Engine
In direct bookings (site/WhatsApp), the PMS creates pre-reservations with dynamic Inter PIX QR codes or static copy-paste payloads.
For OTA reservations (Booking.com & Airbnb):
- **Hard Operational Constraint**:
  Under NO circumstance should an OTA guest receive a PIX payment link, dynamic QR code, or payment reminder.
  OTA guests either paid through the channel (`PaymentCollect = Channel`) or will pay the property at check-in (`PaymentCollect = Property`).
  Attempting to collect PIX from an OTA guest causes severe guest friction, reputational harm, and claims of double charging.
- **Enforcement Rules in Code**:
  1. Set `newReservation.pixTxId = null;` and `newReservation.pixCopiaECola = null;`.
  2. Never call `createInterPixCob` or `generateStaticPixPayload`.
  3. In `triggerImmediateWhatsApp`, NEVER dispatch `"pre_reservation_created"` with PIX parameters.
  4. In Guest Portal (`/api/pms/guest-portal/:code`), suppress the PIX payment accordion when `channel === "booking" || channel === "airbnb"`.

---

### 3.2 Automation Modes (`off`, `observe`, `auto`)

| Integration Mode | Reservation Creation | Flat Allocation | External Messages (WhatsApp, SMTP, SERPRO) | ARI Sync Trigger |
|---|---|---|---|---|
| `off` | None (rejected / disabled) | None | 0 (none) | 0 (none) |
| `observe` | Recorded as Intent in `wbpInbox` | Simulated | 0 (none, intent logged only) | 0 (none) |
| `auto` | Created in `db.reservations` | Fair-Share Allocated | Active (SERPRO, Housekeeping, Reception Email, WhatsApp Welcome) | Debounced Push |

#### Automated Pipeline in `auto` Mode:
1. **Digital Check-in Link & FNRH Registration**:
   If `db.settings.checkinProvider === "gov_fnrh"`, invoke `fnrhSerproService.registerReservation(newReservation, db.settings)`.
   Attach `serproPrecheckinUrl` to the reservation.
2. **Housekeeping Task Creation**:
   Ensure `cleaningRequests` contains a task on `checkinDate` for the allocated flat, specifying bed configuration (twin vs couple) and arrival guest name.
3. **Reception / Front Desk Notification**:
   If check-in is scheduled for today (`isReservationForToday(newReservation)`):
   Dispatch check-in notification email to reception with guest name, flat number, OTA channel, and payment collection instructions (`Channel` = Paid, `Property` = Collect at desk).
4. **Vehicle & Garage Notification**:
   If guest provided vehicle details and arrival is today, dispatch garage gate clearance email.
5. **WhatsApp Welcome Dispatch**:
   Send standard welcome message with digital check-in link (and ZERO PIX content).

---

### 3.3 Test Notification Isolation (AGENTS.md & Parent Directive 1)
AGENTS.md strictly dictates:
> *"Sem mascarar/silenciar notificações em código: Os disparos de mensagens nos testes NÃO devem ser desativados ou silenciados no código. O comportamento correto é o agente NÃO disparar testes desnecessários ou não solicitados."*

To satisfy this rule with 100% rigor:
- Production code retains all normal notification logic without commented lines or boolean flags silencing alerts.
- In test harnesses (`tests/wbp-integration/m4-*.test.mjs`):
  1. Define `process.env.NODE_ENV = "test"` before any module imports.
  2. Route all outbound HTTP calls (Z-API, Mail, SERPRO) to local loopback sandbox servers (`e2e/sandbox/mock-zapi`, `mock-smtp`) or use dependency-injected transports.
  3. Ensure `DATABASE_URL` is deleted from `process.env` and data runs against an isolated temporary copy in `os.tmpdir()`.
  4. Assert that real `data/database.json` retains identical SHA-256 hash and modification timestamp throughout test execution.

---

## 4. Module Architecture & Code Layout

### New Module: `artifacts/api-server/wbp/inbox.mjs`
*(With byte-for-byte SHA-256 mirror at `scripts/wbp/inbox.mjs`)*

#### Exported Functions:
1. `normalizeOtaBooking(rawPayload)`:
   Extracts and validates booking fields, purges CVV in memory, masks PAN, calculates checkout date.
2. `calculateFairShareStats(db)`:
   Analyzes all 19 flats and compiles checkout count, occupied nights, and recency metrics.
3. `allocateFairShareFlat(checkinDate, checkoutDate, options)`:
   Applies canonical availability check and multi-criterion fair-share sorting to select optimal flat.
4. `processIncomingOTA(normalizedBooking, options)`:
   Master coordinator: handles deduplication, legacy linking, mutations, fair-share allocation, PIX suppression, and automation triggers.
5. `handleOtaCancellation(reservation, normalizedBooking, db)`:
   Evaluates safety rule and executes clean cancellation or quarantine routing.
6. `handleOtaModification(reservation, normalizedBooking, db)`:
   Evaluates 3-tier reallocation logic and executes clean modification or quarantine routing.

---

## 5. Summary Matrix: Directives to Implementation Mapping

| Directive / Requirement | Architectural Mechanism | Implementation File |
|---|---|---|
| **Parent Directive 1: Test Notification Isolation** | Loopback sandbox mocks (`mock-zapi`, `mock-smtp`), zero production silencing, `NODE_ENV=test` | `tests/wbp-integration/m4-*.test.mjs` |
| **Parent Directive 2: PaymentCollect vs `pago_total`** | Branch by `PaymentCollect`: `Channel` -> `pago_total` + netAmount; `Property` -> `pendente` + front desk banner | `wbp/inbox.mjs`, `demo-server.mjs` |
| **Parent Directive 3: Card Hygiene on Ingestion** | In-memory `stripCvvDeep` before storage; PAN masking to last4/brand, zero full PAN in logs/db | `wbp/storage.mjs`, `wbp/inbox.mjs` |
| **Parent Directive 4: Safe Transition / Linking** | Fuzzy matching (dates, channel, guest name >=85%); safe link without duplicate; ambiguous to quarantine | `wbp/inbox.mjs`, `wbp/reconciler.mjs` |
| **Feature 19: Fair-Share Allocation** | Canonical availability verification + turnover ranking across 19 Soho flats | `wbp/inbox.mjs`, `wbp/availability.mjs` |
| **Feature 21: Mutation Safety (Cancellation)** | In-house / past check-in check: blocks auto-cancel, routes to quarantine with urgent manager alert | `wbp/inbox.mjs`, `wbp/alerts.mjs` |
| **Feature 21: Mutation Safety (Modification)** | 3-tier check (same flat -> alternate flat -> quarantine on conflict); debounced ARI union sync | `wbp/inbox.mjs`, `wbp/ari-sync.mjs` |
| **Feature 23: Strict PIX Suppression** | Complete bypass of Inter PIX / static PIX generation and payment links for OTA channels | `wbp/inbox.mjs`, `demo-server.mjs` |
