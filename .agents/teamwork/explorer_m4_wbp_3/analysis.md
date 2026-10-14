# Architectural Blueprint: Quarantine Management Engine, Reservation Reconciliation & Critical Alerts
**Milestone 4 — Features 20, 22 & 24**
**Agent**: Explorer 3 (`explorer_m4_wbp_3`)
**Date**: 2026-10-14
**Status**: Completed

---

## 1. Executive Summary

This document establishes the comprehensive architectural specification for three mission-critical components of Milestone 4 in the **WebBookingPro (WBP) ↔ Guest-Flow-Manager (CorpFlats Soho Residence)** integration:

1. **Feature 20: Quarantine Management Engine (`wbp/quarantine.mjs`)**: An automated safety net and operational queue that isolates anomalous, conflicting, or unaccommodated OTA bookings without crashing or corrupting the PMS state, providing administrative workflows for manual assignment, resolution, and rejection.
2. **Feature 22: Manual Reservation Reconciliation Engine (`wbp/reconciliation.mjs`)**: A deterministic heuristic reconciler preventing disastrous duplicate reservations between pre-existing manually-typed OTA bookings (Booking.com/Airbnb) in the PMS and incoming electronic reservations from WebBookingPro.
3. **Feature 24: Critical Events & Daily Alerts Engine (`wbp/alerts.mjs`)**: A multi-channel notification dispatcher delivering real-time alerts (via WhatsApp and Email) to hotel managers upon critical anomalies (overbooking, quarantine routing, persistent ARI sync failures > 15 min, property-collected payments) and an automated daily operational summary at 08:00 (Brasília time).

All designs strictly enforce:
- **Zero test message leakage** (AGENTS.md compliance via dependency injection / sandbox mock servers `mock-zapi` and `mock-smtp`).
- **PaymentCollect semantics** (`PaymentCollect = "Property"` remains `pendente` and is NOT overwritten to `pago_total`).
- **Card hygiene on ingestion** (CVV discarded immediately in memory; PAN masked; zero raw card data in `db`, logs, or audit trails).
- **Safe deduplication** (exact matches linked without modifying existing reservations; ambiguous cases routed to Quarantine).

---

## 2. Feature 20: Quarantine Management Engine

### 2.1 Trigger Conditions & Anomaly Taxonomy

When an OTA booking arrives via WebBookingPro (via webhook `/BookingCreate`, `/NotifyBooking`, or periodic polling), the ingestion processor evaluates its viability against the hotel's 19 canonical flats. If automatic allocation cannot safely proceed, the booking is quarantined under one of seven distinct reason codes:

| Code | Severity | Description | Trigger Condition |
|---|---|---|---|
| `OVERBOOKING` | **CRITICAL** | Zero units available across the entire property | `calculateCanonicalAvailability(checkin, checkout).minAvailable === 0` |
| `CONFLICT` | **HIGH** | Requested flat or allocation target has an active conflict | Collision with active reservation, provisional hold (`pendingModification`), administrative block (`roomBlocks`), or maintenance order |
| `MAINTENANCE_BLOCKED` | **HIGH** | Flat is decommissioned or under active maintenance | Flat has `status === 'manutencao_bloqueada'`, `maintenanceStatus === 'em_manutencao'`, `isActive === false`, or active `serviceOrders` |
| `CHECKIN_CANCEL_ATTEMPT` | **CRITICAL** | OTA cancellation requested for guest already checked in | Inbound `IsCancellation === 1`, but PMS reservation has `status === 'checked_in'` or check-in completed |
| `MODIFICATION_CONFLICT` | **HIGH** | Modification cannot be accommodated on current or alternate flat | Inbound `IsModification === 1` changes dates/guests, conflicting with existing bookings, and no alternate flat is free for entire stay |
| `AMBIGUOUS_MANUAL_MATCH` | **MEDIUM** | Inbound booking partially matches an existing manual reservation | Reconciler calculates confidence between 50% and 89% (e.g., date overlap or similar name with different phone) |
| `MALFORMED_PAYLOAD` | **MEDIUM** | Booking payload missing critical fields | Missing dates, invalid dates (`checkin >= checkout`), zero nights, negative prices, or missing customer info |

### 2.2 Data Model & Schema (`db.wbpQuarantine`)

Quarantine records reside in `db.wbpQuarantine` (with fallback alias `db.quarantineBookings`) within the PMS database state, isolated from active reservations:

```javascript
/**
 * Schema: QuarantineRecord
 */
{
  id: "quar_1791928000_a1b2c3",             // Unique quarantine identifier
  bookingId: "WBP-9823114-BKG",             // WebBookingPro OrderId
  externalOrderId: "3920192831",             // OTA reservation number (Booking.com/Airbnb)
  rawPayloadId: "raw_1791927995_f0e1d2",     // Reference to wbp_raw_payloads table/JSONL
  source: "webhook",                         // "webhook" | "polling"
  channel: "booking",                        // "booking" | "airbnb" | "direct"
  
  // Guest Information (Sanitized)
  guestName: "Carlos Eduardo Mendes",
  guestEmail: "carlos.mendes@example.com",
  guestPhone: "5522998505276",
  guestCountry: "BR",
  
  // Stay Details
  checkinDate: "2026-11-10",                 // YYYY-MM-DD
  checkoutDate: "2026-11-14",                // YYYY-MM-DD
  nights: 4,
  adults: 2,
  children: 0,
  
  // Pricing & Commercial
  totalPrice: 1106.52,
  currency: "BRL",
  ratePlanId: "com_cafe",                    // "sem_cafe" | "com_cafe"
  breakfastIncluded: true,
  paymentCollect: "Channel",                 // "Channel" | "Property"
  
  // Nature of Mutation
  isModification: false,
  isCancellation: false,
  
  // Classification
  reason: "OVERBOOKING",                     // Enum from taxonomy above
  reasonDetails: {
    message: "Nenhum dos 19 flats possui disponibilidade contínua para o período solicitado (2026-11-10 a 2026-11-14).",
    availableUnitsOnDates: {
      "2026-11-10": 0,
      "2026-11-11": 0,
      "2026-11-12": 1,
      "2026-11-13": 2
    },
    conflictingReservationId: null,
    conflictingFlatNumber: null,
    potentialMatchId: null
  },
  
  // Suggested Available Alternatives
  suggestedFlats: [
    // Array of { flatId, flatNumber, isContinuousAvailable, freeNightsCount }
  ],
  
  // Sanitized Card Reference (Mandatory R6 - Zero CVV, Masked PAN)
  cardReference: {
    maskedPan: "************4321",
    cardType: "Visa",
    cardholderName: "CARLOS E MENDES",
    expiry: "12/28",
    vaultId: "vault_card_7890"               // Vault reference for Milestone 5
  },
  
  // Operational Status & Lifecycle
  status: "pending",                         // "pending" | "resolved" | "rejected"
  createdAt: "2026-10-14T01:30:00.000Z",
  resolvedAt: null,
  resolvedBy: null,                          // Username of staff/manager
  resolutionAction: null,                    // "manual_assigned" | "force_accepted" | "linked_manual" | "rejected_cancelled"
  resolutionNotes: null,
  assignedFlatNumber: null,
  assignedFlatId: null,
  createdReservationId: null,
  createdReservationCode: null
}
```

### 2.3 Quarantine Lifecycle & State Machine

```
               [Inbound OTA Booking]
                         |
           (Anomaly or Conflict Detected)
                         v
                +-----------------+
                | status: pending | <---+ (Manager alerts dispatched)
                +-----------------+
                         |
      +------------------+------------------+
      |                  |                  |
      v                  v                  v
[Assign Flat]     [Link Manual]      [Reject / Cancel]
      |                  |                  |
      v                  v                  v
+----------------+ +----------------+ +----------------+
|status: resolved| |status: resolved| |status: rejected|
| (Creates PMS   | | (Links legacy  | | (Logs rejection|
|  reservation)  | |  reservation)  | |  & audit trail)|
+----------------+ +----------------+ +----------------+
      |                                     |
(Triggers ARI Sync)                   (Triggers ARI Sync
                                       if held capacity)
```

### 2.4 Resolution Endpoints & Business Logic

The engine must expose the following REST endpoints mounted on `/api/wbp/quarantine`:

1. **`GET /api/wbp/quarantine`**:
   - Query filters: `status=pending|resolved|rejected`, `reason`, `channel`, `startDate`, `endDate`.
   - Response: `{ success: true, count: number, pendingCount: number, items: QuarantineRecord[] }`.
   - Provides instantaneous badge count for the UI top navigation.

2. **`GET /api/wbp/quarantine/:id`**:
   - Returns full item record, current live availability check for the stay dates, candidate flats evaluated by Fair-Share score, and conflicting reservations list.

3. **`POST /api/wbp/quarantine/:id/resolve`**:
   - Request Body: `{ action: "assign_flat", flatNumber: string, forceOverride?: boolean, notes?: string, user: string }`.
   - Logic:
     - Validates that `quarantineItem.status === "pending"`.
     - Checks target flat availability with `checkReservationConflicts`.
     - If conflict exists and `forceOverride !== true`, returns `{ success: false, conflict: true, warnings }`.
     - If free (or forced by authorized admin), creates official PMS reservation in `db.reservations`:
       - `code`: Generated via `generateReservationCode(flatNumber)`.
       - `channel`: `quarantineItem.channel`.
       - `externalOrderId`: `quarantineItem.bookingId`.
       - `paymentCollect`: `quarantineItem.paymentCollect`.
       - `paymentStatus`: If `PaymentCollect === "Channel"`, set `pago_total`; if `PaymentCollect === "Property"`, set `pendente`.
       - `breakfastIncluded`: `quarantineItem.breakfastIncluded`.
       - **Strict PIX suppression**: `pixTxId = null`, `pixCopiaECola = null`.
       - In `auto` mode: schedules standard guest communications (WhatsApp boas-vindas, SERPRO link, housekeeping task, reception email if same-day).
     - Marks quarantine item as `status = "resolved"`, `resolutionAction = "manual_assigned"`, `resolvedAt = NOW()`, `assignedFlatNumber = flatNumber`.
     - Triggers debounced incremental ARI update for the affected date window via `getAriSynchronizer(db).triggerIncrementalSync([checkin, checkout])`.
     - Saves database.

4. **`POST /api/wbp/quarantine/:id/reject`**:
   - Request Body: `{ reason: string, notes?: string, user: string }`.
   - Logic:
     - Sets `status = "rejected"`, `resolutionAction = "rejected_cancelled"`, `resolutionNotes = notes`, `resolvedAt = NOW()`.
     - Records audit log in `audit_logs.jsonl`.
     - If the item had temporarily reserved a hold, releases it and recalculates availability.

5. **`POST /api/wbp/quarantine/:id/link`**:
   - Request Body: `{ pmsReservationId: number | string, notes?: string, user: string }`.
   - Logic:
     - Finds existing manual reservation in `db.reservations`.
     - Sets `reservation.externalOrderId = quarantineItem.bookingId`, `reservation.wbpSynced = true`.
     - Does **not** modify flat, daily rates, or guest data.
     - Sets quarantine item `status = "resolved"`, `resolutionAction = "linked_manual"`.

---

## 3. Feature 22: Manual Reservation Reconciliation Engine

### 3.1 Problem Statement & Background

Prior to the WebBookingPro integration, hotel receptionists manually registered OTA bookings (typing `channel = "booking"` or `channel = "airbnb"`) into the PMS. When WebBookingPro goes live, the OTA feeds will electronically send those same historical and upcoming reservations.

Without a robust reconciliation engine:
- The system would create **duplicate reservations** for the exact same guests.
- Available flats would be artificially reduced by 50% for those dates, creating fictitious overbookings.
- Guests would receive duplicate WhatsApp welcome messages and check-in links.

### 3.2 Matching Heuristics & Scoring Algorithm

The reconciliation algorithm processes an incoming OTA reservation against all active, non-cancelled PMS reservations (`status !== 'cancelada'`) within an overlapping date window `[checkin - 2 days, checkout + 2 days]`.

The composite score $S \in [0, 100]$ is computed as follows:

```
Total Score S = S_channel + S_date + S_name + S_contact + S_price
```

#### 1. Channel Match ($S_{channel} \in [0, 20]$ pts)
- Exact match (`pms.channel.toLowerCase() === ota.channel.toLowerCase()`): **+20 pts**.
- Both are OTA channels (e.g. `booking` vs `airbnb`): **0 pts**.
- PMS is direct (`direct`, `site`, `balcao`): **-10 pts** (penalizes hijacking a direct reservation).

#### 2. Date Match ($S_{date} \in [0, 30]$ pts)
- Exact check-in AND exact check-out: **+30 pts**.
- Exact check-in, check-out differs by 1 night (or vice-versa): **+15 pts**.
- Overlapping stay with $\ge 50\%$ night overlap: **+10 pts**.
- No overlap: **0 pts** (disqualifies candidate).

#### 3. Guest Name Fuzzy Match ($S_{name} \in [0, 30]$ pts)
Names undergo rigorous normalization before comparison:
- Lowercase, Unicode NFKD accent stripping (`é` $\to$ `e`, `ç` $\to$ `c`).
- Removal of salutations/honorifics (e.g., "Sr.", "Sra.", "Dr.").
- Removal of punctuation and excess whitespace.
- Token set analysis:
  - Token Set Jaccard Similarity: $J(T_1, T_2) = \frac{|T_1 \cap T_2|}{|T_1 \cup T_2|}$.
  - Token Sort Ratio & Levenshtein Distance $L(N_1, N_2)$.
- Scoring:
  - Exact normalized match ($N_1 = N_2$): **+30 pts**.
  - Token Jaccard $\ge 0.8$ or Levenshtein similarity $\ge 0.85$: **+25 pts** (e.g., "Carlos Eduardo Mendes" vs "Carlos Mendes").
  - First Name + Last Name match with missing middle name: **+22 pts**.
  - First Name match only or similarity between 0.6 and 0.84: **+10 pts**.
  - Similarity $< 0.6$: **0 pts**.

#### 4. Guest Contact Match ($S_{contact} \in [0, 15]$ pts)
- **Phone Number Match**:
  - Normalize to digits only. Compare last 8 or 9 digits (handles Brazil country code `55` and area code `22`).
  - Identical phone: **+15 pts** (extremely strong signal).
- **Email Match**:
  - Normalize to trimmed lowercase.
  - Identical email: **+15 pts** (ignoring masked OTA proxy emails like `*@guest.booking.com` unless exact).

#### 5. Monetary Match ($S_{price} \in [0, 5]$ pts)
- Total price within $\pm 2\%$: **+5 pts**.
- Price differs (due to commission/net vs gross): **0 pts** (neutral, does not penalize).

### 3.3 Confidence Classification & Rules

```
Score >= 80 pts   --> SAFE MATCH (High Confidence)
50 <= Score < 80  --> POTENTIAL DUPLICATE / AMBIGUOUS (Moderate Confidence)
Score < 50 pts    --> NO MATCH (Distinct Reservation)
```

1. **Safe Match ($\ge 80$ pts)**:
   - Typically: Same channel (20) + Exact dates (30) + Name similarity $\ge 0.85$ (25) + Price/Contact (5) = **80–100 pts**.
   - **Automated Rule**: When a booking arrives in `auto` mode and matches an existing reservation with Safe Match:
     - Automatically **links** the existing manual reservation:
       `pmsRes.externalOrderId = otaBooking.OrderId;`
       `pmsRes.wbpChannel = otaBooking.Channel;`
       `pmsRes.wbpSynced = true;`
       `pmsRes.wbpMatchedAt = new Date().toISOString();`
     - **DO NOT** create a duplicate reservation.
     - **DO NOT** alter the flat number, daily rates, guest documents, or notes.
     - Logs audit trail: `RESERVATION_RECONCILED_LINKED`.

2. **Potential Duplicate / Ambiguous ($50 \le \text{Score} < 80$)**:
   - Typically: Same channel (20) + Exact dates (30) + Weak name similarity (10) = 60 pts.
   - Or: Same name (30) + Same channel (20) + Shifted dates by 1 night (15) = 65 pts.
   - **Automated Rule**: Must **NOT** automatically link (risk of false positive) and must **NOT** automatically allocate (risk of double booking).
   - Routes to Quarantine under reason `AMBIGUOUS_MANUAL_MATCH`.
   - Displays both reservations side-by-side in the Quarantine drawer with highlighted discrepancies.

3. **No Match ($< 50$ pts)**:
   - Evaluated as a genuinely new booking. Proceeds to Canonical Availability and Fair-Share Flat Allocation.

### 3.4 Reconciliation Report Schema

The reconciliation engine generates a structured report accessible via API:

```javascript
/**
 * Schema: ReconciliationReport
 */
{
  generatedAt: "2026-10-14T01:35:00.000Z",
  window: {
    startDate: "2026-10-14",
    endDate: "2027-12-31"
  },
  summary: {
    totalPmsReservationsInWindow: 45,
    totalOtaBookingsReceived: 38,
    matchedCount: 32,
    potentialDuplicatesCount: 3,
    unmatchedPmsCount: 13,
    unmatchedOtaCount: 3
  },
  matched: [
    {
      pmsReservationId: 1042,
      pmsCode: "RES-408-0192",
      pmsGuestName: "Carlos Eduardo Mendes",
      pmsFlatNumber: "408",
      pmsCheckin: "2026-11-10",
      pmsCheckout: "2026-11-14",
      pmsTotalAmount: 1106.52,
      pmsChannel: "booking",
      
      otaBookingId: "WBP-9823114-BKG",
      otaGuestName: "Carlos Mendes",
      otaCheckin: "2026-11-10",
      otaCheckout: "2026-11-14",
      otaTotalPrice: 1106.52,
      otaChannel: "booking",
      
      matchScore: 95,
      matchReasons: [
        "Canal idêntico: booking",
        "Datas exatas de entrada e saída (2026-11-10 a 2026-11-14)",
        "Similaridade de nome: 91% (Carlos Mendes / Carlos Eduardo Mendes)",
        "Valor total compatível"
      ],
      isLinked: true
    }
  ],
  potential_duplicates: [
    {
      pmsReservationId: 1055,
      pmsCode: "RES-211-0198",
      pmsGuestName: "Mariana Souza",
      pmsFlatNumber: "211",
      pmsCheckin: "2026-11-15",
      pmsCheckout: "2026-11-18",
      
      otaBookingId: "WBP-9844012-BKG",
      otaGuestName: "Mariana S. Silva",
      otaCheckin: "2026-11-15",
      otaCheckout: "2026-11-19", // 1 day difference
      
      matchScore: 65,
      discrepancies: [
        "Checkout diverge em 1 diária (PMS: 2026-11-18 vs OTA: 2026-11-19)",
        "Sobrenome divergente (Souza vs Silva)"
      ],
      suggestedAction: "quarantine"
    }
  ],
  unmatched_pms: [
    // Array of PMS reservations typed as booking/airbnb with no OTA booking found
  ],
  unmatched_ota: [
    // Array of OTA bookings with no manual counterpart (genuine new bookings)
  ]
}
```

### 3.5 Pre-Launch Tooling & Endpoints

Before flipping the integration general switch from `observe` to `auto`, the administrator can execute:
- **`GET /api/wbp/reconciliation/report`**: Generates or retrieves the pre-launch audit report.
- **`POST /api/wbp/reconciliation/link-all-safe`**: One-click bulk confirmation of all safe matches ($\ge 80$ pts), safely populating `externalOrderId` across legacy reservations.
- **`POST /api/wbp/reconciliation/link-single`**: Manually link a specific PMS reservation with an OTA booking ID.

---

## 4. Feature 24: Critical Events & Daily Alerts Engine

### 4.1 Real-Time Immediate Manager Alerts

Immediate alerts are dispatched synchronously upon detection of critical operational hazards:

#### Alert 1: Overbooking Attempt or Quarantine Placement
- **Trigger**: Any booking routed to Quarantine (`OVERBOOKING`, `CONFLICT`, `CHECKIN_CANCEL_ATTEMPT`, `MODIFICATION_CONFLICT`).
- **Severity**: Critical.
- **Channels**: WhatsApp to `adminWhatsApp` AND Email to `receptionEmail` / `managerEmail`.
- **WhatsApp Template**:
  ```
  🚨 *ALERTA CRÍTICO: Reserva em Quarentena*
  *CorpFlats Soho Residence*

  ⚠️ *Motivo*: {REASON_LABEL}
  📌 *Canal*: {CHANNEL} | *ID*: {BOOKING_ID}
  👤 *Hóspede*: {GUEST_NAME}
  📅 *Período*: {CHECKIN} a {CHECKOUT} ({NIGHTS} noites)
  💰 *Valor*: R$ {TOTAL_PRICE} ({PAYMENT_COLLECT})

  *Ação Obrigatória*: Acesse o painel de Quarentena para alocar manualmente ou verificar conflito:
  🔗 {SERVER_BASE_URL}/wbp/quarantine/{QUARANTINE_ID}
  ```

#### Alert 2: Persistent ARI Synchronization Failure (> 15 Minutes)
- **Trigger**: `WbpAriSynchronizer.handleSyncFailure` where cumulative outage exceeds 15 minutes (`elapsedMs >= 15 * 60 * 1000`).
- **Severity**: Critical.
- **Channels**: WhatsApp to `adminWhatsApp` AND Email to `receptionEmail`.
- **WhatsApp Template**:
  ```
  🚨 *ALERTA DE SISTEMA: Falha Crítica de Sincronização ARI*
  *CorpFlats Soho Residence*

  A sincronização de disponibilidade e tarifas com a WebBookingPro está falhando há *{ELAPSED_MINUTES} minutos*!

  ❌ *Último Erro*: {ERROR_MESSAGE}
  ⚠️ *Risco Operacional*: O channel manager pode vender diárias desatualizadas nas OTAs (risco de overbooking).
  
  Por favor, verifique a conexão do servidor e os logs de auditoria.
  ```
- **Recovery Notification**: When synchronization successfully resumes after a persistent alert, an automatic resolution message is dispatched:
  `✅ *RECUPERAÇÃO ARI*: Sincronização com a WebBookingPro restabelecida com sucesso após {MINUTES} minutos de instabilidade.`

#### Alert 3: Pricing Safety Lock Held (> 30% Variation or Floor Breach)
- **Trigger**: When SEBRAE pricing engine calculates a rate change exceeding the configured variation ceiling (default 30%) or hitting the absolute price floor.
- **Channels**: WhatsApp notification to manager and internal warning banner.
- **Message**: "⚠️ *Tarifa Retida por Trava*: O preço de {PLAN} para {DATE} variou {VAR_PCT}% (de R$ {OLD_RATE} para R$ {NEW_RATE}). Confirmação necessária antes do envio às OTAs."

#### Alert 4: Property-Collected Payment (`PaymentCollect = "Property"`)
- **Trigger**: Incoming OTA booking indicates payment must be collected by the hotel at check-in.
- **Action**: In-system notification in `db.notifications` (`category: "reservation"`, `severity: "warning"`) and reception flag: "⚠️ Cobrança Obrigatória na Recepção: R$ {AMOUNT} pendente de pagamento (Booking.com)."

---

### 4.2 Reception Daily Summary Alert (08:00 Handover Shift)

Hotel reception operates on morning shift handover at **08:00 (Brasília time / UTC-3)**. A scheduled routine generates an operational synthesis of the channel manager state:

```
📊 *RESUMO DIÁRIO DE OPERAÇÃO OTA — CorpFlats*
*Data: {TODAY_STR} — 08:00*
────────────────────────────
📥 *Reservas OTA (Últimas 24h)*: {LAST_24H_COUNT} recebidas (R$ {LAST_24H_REVENUE})
   • Booking.com: {BOOKING_COUNT}
   • Airbnb: {AIRBNB_COUNT}

🛑 *Fila de Quarentena*: {PENDING_QUARANTINE_COUNT} pendentes
   {OLDEST_QUARANTINE_SNIPPET}

🔄 *Saúde da Integração WBP*:
   • Status ARI: {ARI_STATUS_ICON} {ARI_STATUS_TEXT}
   • Último Sync: {LAST_ARI_TIME}
   • Modo Atual: {INTEGRATION_MODE_LABEL}

🚪 *Movimentação de Hoje ({TODAY_STR})*:
   • Check-ins Previstos: {TODAY_CHECKINS_COUNT} (OTA: {TODAY_OTA_CHECKINS_COUNT})
   • Check-outs Previstos: {TODAY_CHECKOUTS_COUNT}

🔗 Painel Geral: {SERVER_BASE_URL}/wbp/inbox
────────────────────────────
```

#### Scheduler Guard & Idempotency
- Evaluated every 60 seconds within `setInterval`.
- Compares Brasília current time:
  ```javascript
  const bNow = getBrasiliaNow();
  const todayStr = bNow.dateStr;
  const isTargetHour = bNow.hours === 8 && bNow.minutes >= 0 && bNow.minutes < 5;
  ```
- Guarded by `db.wbpState.dailySummaryLastSentDate !== todayStr` to guarantee strictly **one** dispatch per calendar day.

---

### 4.3 Multi-Channel Dispatch Architecture

The alert engine unifies three transport mechanisms already proven in `demo-server.mjs`:

```
                    +---------------------------+
                    |    WbpAlertsManager       |
                    +---------------------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
         v                        v                        v
+------------------+     +------------------+     +------------------+
| Z-API WhatsApp   |     | MailService SMTP |     | In-System Feed   |
| (sendZapiMessage)|     | (sendEmailAsync) |     | (db.notifications|
|                  |     |                  |     |  createNotif)    |
+------------------+     +------------------+     +------------------+
```

1. **WhatsApp Transport**:
   - Calls `sendZapiMessage(db.zapiConfig, { phone: recipient, message: text, bypassTestMode: false, recipientRole: "staff" })`.
   - Cleans phone numbers via `cleanWhatsAppPhone`.
2. **Email Transport**:
   - Calls `sendEmailAsync({ db, saveDatabase, recipient, subject, bodyHtml, metadata })`.
   - Uses existing Zoho / SMTP credentials configured in `db.settings.emailSettings`.
3. **Internal Notification System**:
   - Calls `createNotification(category, message, metadata)` pushing to `db.notifications` (capped at 250 items with audit logging).

### 4.4 Alert Configuration & Operator Toggles (`db.wbpAlertSettings`)

Configuration is stored in `db.wbpAlertSettings`, managed via REST endpoints:

```javascript
/**
 * Schema: WbpAlertSettings
 */
{
  channels: {
    whatsapp: true,
    email: true,
    systemNotification: true
  },
  recipients: {
    adminWhatsApp: "5522997124021",
    receptionEmail: "millerpessanha@gmail.com",
    managerEmail: "millerpessanha@gmail.com"
  },
  triggers: {
    onQuarantine: true,
    onOverbooking: true,
    onAriPersistentFailure: true,
    onPricingLockHeld: true,
    onPropertyPaymentCollect: true,
    dailySummary: true,
    dailySummaryHour: 8
  }
}
```

---

### 4.5 Test Isolation Strategy (AGENTS.md Compliance)

The project user rules in `AGENTS.md` and the parent directives strictly prohibit any real messages leaking to WhatsApp (Z-API), SMTP, or SERPRO during tests, while forbidding production code from silencing notifications.

#### Strict 4-Pillar Isolation Implementation
1. **Dependency Injection / Pluggable Transport**:
   `WbpAlertsManager` constructor accepts optional custom transport handlers:
   ```javascript
   export class WbpAlertsManager {
     constructor(options = {}) {
       this.zapiSender = options.zapiSender || defaultZapiSender;
       this.emailSender = options.emailSender || defaultEmailSender;
     }
   }
   ```
2. **Sandbox Mock Servers (`e2e/sandbox/`)**:
   - `mock-zapi.mjs`: Running on port 5056, intercepts all POST `/instances/.../send-text` calls in-memory.
   - `mock-smtp.mjs`: Running on port 5025, intercepts all TCP/SMTP transactions into `.mock-smtp-emails.json`.
3. **Environment Guards (`NODE_ENV === "test"`)**:
   - When running tests, `process.env.NODE_ENV = "test"` routes Z-API endpoints to `http://localhost:5056` and SMTP to port `5025`.
4. **Database File Isolation**:
   - Tests execute against temporary copies in `os.tmpdir()`, verifying that `data/database.json` maintains identical SHA-256 and mtime before and after test suites.

---

## 5. Integration Contracts & Cross-Feature Coordination

### 5.1 PaymentCollect vs Legacy `pago_total` (Directive 2)

In `demo-server.mjs`, legacy lines 14201 and 14226 forced `resolvedPaymentStatus = "pago_total"` for any reservation matching `channel: booking | airbnb`.

For WebBookingPro electronic reservations, the engine enforces strict discrimination:
- **`PaymentCollect === "Channel"`**:
  - Payment is guaranteed and collected by the OTA (e.g., Virtual Credit Card or payout).
  - Status is marked `pago_total`.
  - The net receivable amount (`netAmount = totalPrice * (1 - commissionRate)`) is registered in `r.otaNetAmount`.
- **`PaymentCollect === "Property"`**:
  - The guest chose to pay at the hotel.
  - Status **MUST BE SET TO `pendente`** (or `pendente_balcao`).
  - The legacy forced `pago_total` override must be explicitly bypassed when `r.paymentCollect === "Property"`.
  - Triggers front-desk alert: "Cobrar no Check-in".

### 5.2 Card Hygiene on Ingestion (Directive 3)

In accordance with PCI-DSS guidelines and project Requirement R6:
- **Immediate CVV Destruction**: Before any payload is saved to `wbp_raw_payloads.jsonl`, `wbp_idempotency.json`, or the database blob, any card verification code (`card_cvv`, `cvv`, `cvc`, `security_code`) is deleted from memory:
  ```javascript
  export function sanitizeCardPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const sanitized = JSON.parse(JSON.stringify(payload));
    
    // Deep scan & delete CVV fields
    const scrub = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const k of Object.keys(obj)) {
        if (/cvv|cvc|security_code|card_cvv/i.test(k)) {
          delete obj[k];
        } else if (typeof obj[k] === "object") {
          scrub(obj[k]);
        }
      }
    };
    scrub(sanitized);
    return sanitized;
  }
  ```
- **PAN Masking**: The full credit card number (PAN) is never stored in cleartext in `db.reservations` or `db.wbpQuarantine`. Only the masked string (e.g. `**** **** **** 1234`) is persisted for reception reference. The full number is passed exclusively to the encrypted vault (`wbp/card-vault.mjs`) in Milestone 5.

### 5.3 Interaction with `WbpAriSynchronizer`

Whenever a quarantine item is resolved (flat assigned) or an OTA cancellation/modification is applied:
1. The affected date window `[checkinDate, checkoutDate]` is submitted to:
   ```javascript
   getAriSynchronizer(db).triggerIncrementalSync({
     minDate: checkinDate,
     maxDate: checkoutDate
   });
   ```
2. The synchronizer coalesces rapid bursts into a single bounding interval and debounces outbound transmission to the WBP Simulator in $\le 10$ seconds.

---

## 6. Blueprint for Worker M4 Implementation

The implementer for Milestone 4 should create the following modular files in `artifacts/api-server/wbp/` (with mirrored parity in `scripts/wbp/`):

1. **`artifacts/api-server/wbp/quarantine.mjs`**:
   - `createQuarantineRecord(bookingData, anomalyDetails, db)`
   - `listQuarantineRecords(db, filters)`
   - `getQuarantineRecordById(db, id)`
   - `resolveQuarantineItem(db, id, resolutionParams)`
   - `rejectQuarantineItem(db, id, reasonParams)`
   - `linkQuarantineItemToManual(db, id, pmsReservationId, notes)`

2. **`artifacts/api-server/wbp/reconciliation.mjs`**:
   - `normalizeGuestName(name)`
   - `calculateNameSimilarity(nameA, nameB)`
   - `computeReconciliationScore(pmsRes, otaBooking)`
   - `generateReconciliationReport(db, otaBookings, options)`
   - `findBestManualMatch(db, otaBooking)`
   - `applySafeReconciliationLink(db, pmsReservationId, otaBookingId)`

3. **`artifacts/api-server/wbp/alerts.mjs`**:
   - `WbpAlertsManager` class:
     - `sendImmediateQuarantineAlert(quarantineRecord, db)`
     - `sendPersistentSyncFailureAlert(syncFailurePayload, db)`
     - `sendSyncRecoveryAlert(recoveryPayload, db)`
     - `sendPricingLockAlert(pricingLockPayload, db)`
     - `sendPropertyPaymentAlert(reservation, db)`
     - `dispatchDailySummaryAlert(db)`
   - `startDailySummaryScheduler(db)`
   - `getWbpAlertSettings(db)`
   - `updateWbpAlertSettings(db, newSettings)`

4. **Integration in `demo-server.mjs`**:
   - Mount routes `/api/wbp/quarantine/*`, `/api/wbp/reconciliation/*`, and `/api/wbp/alerts/*`.
   - Wire `WbpAriSynchronizer.onAlert` to `alertsManager.sendPersistentSyncFailureAlert`.
   - Connect daily summary timer into the Braslia-time background evaluation loop.

---

## 7. Verification Strategy for Milestone 4

To independently verify Features 20, 22, and 24, the dedicated test file `tests/wbp-integration/m4-quarantine-alerts.test.mjs` should validate:
1. **Quarantine Triggers**:
   - Overbooking (0 flats available) routes booking to `db.wbpQuarantine` with `reason: OVERBOOKING` and dispatches mock manager alert.
   - Post check-in cancellation request routes to quarantine with `CHECKIN_CANCEL_ATTEMPT` without releasing flat.
   - Ambiguous payload or conflicting flat routes to quarantine.
2. **Quarantine Resolution**:
   - Calling `/api/wbp/quarantine/:id/resolve` with `assign_flat` creates active reservation, releases quarantine item, and triggers debounced ARI incremental sync.
3. **Reconciliation**:
   - Test safe match ($\ge 80$ pts) automatically links existing manual reservation without duplication or modification of flat/rate.
   - Test ambiguous match (score 65 pts) routes to quarantine under `AMBIGUOUS_MANUAL_MATCH`.
   - Test unmatched OTA booking creates new reservation.
4. **PaymentCollect**:
   - Test `PaymentCollect = "Property"` creates reservation with `paymentStatus = "pendente"` (proving legacy `pago_total` was not applied).
5. **Alerts & Test Isolation**:
   - Test that overbooking and persistent ARI failure (>15 min) invoke the alert dispatcher.
   - Assert that 0 real network calls escape to Z-API or external SMTP (verified via mock-zapi / mock-smtp counters).
   - Assert `data/database.json` maintains unmutated SHA-256 hash before and after execution.
