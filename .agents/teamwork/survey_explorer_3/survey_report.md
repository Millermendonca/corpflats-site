# Survey Report: Re-Signature, Automated Notifications, Operational Panels Synchronization & Testing Infrastructure

**Author**: Survey Explorer 3  
**Date**: 2026-10-11T13:15:00Z  
**Project**: CorpFlats Guest-Flow-Manager  
**Scope**: In-depth architecture survey covering:
1. Check-in signing & document generation mechanisms (PDF/HTML, signature storage, reception delivery).
2. Automated communications (Z-API WhatsApp messaging, email dispatch, personalized re-signature links).
3. Real-time operational panels (Reception, Garage, Housekeeping schedule, and operational schedulers).
4. Testing infrastructure in `tests/` (runners, fixtures, mocks, and coverage gaps for modification, payment settlement, re-signature, and panels).

---

## Executive Summary

CorpFlats Guest-Flow-Manager implements a production PMS and Guest Experience suite. While foundational pieces for check-in digital signature, PDFKit document generation, forensic hash calculation, and reception email delivery are solidly built in `scripts/fnrh-pdf-service.mjs`, `scripts/mail-service.mjs`, and `scripts/demo-server.mjs`, the **reservation modification lifecycle** currently has critical integrity and synchronization gaps:
1. **Self-service modifications (`/api/pms/guest-portal/:code/modify`) update dates immediately without prior simulation (`/modify-preview`) and without verifying payment settlement when stay duration increases (`additionalAmountToPay > 0`)**.
2. **Date or flat changes in the guest portal do not trigger `needsReSignature = true`**, leaving invalidated old signatures or stale PDFs attached to the modified reservation.
3. **Automated re-signature dispatch (WhatsApp and Email) is not triggered upon modification**, preventing the guest from receiving the direct link to review and sign their updated declaration.
4. **The Guest Portal (`guest-portal.tsx`) lacks the re-signature requirement banner and signing interface**, even though `guest-pre-checkin.tsx` already contains the necessary signature renewal logic.
5. **Operational panels rely on in-memory polling without WebSocket/SSE**, but while the Reception tablet polls every 15s and Live Operations polls every 5s, the Garage dashboard does not auto-poll (mount-only).

---

## 1. Check-in Signing & Document Generation Mechanisms

### 1.1 Document Generation Engine (`scripts/fnrh-pdf-service.mjs` & `artifacts/api-server/fnrh-pdf-service.mjs`)
- **Library**: `pdfkit` (v0.20.2) combined with `qrcode` (v1.5.4) and Node's native `crypto`.
- **Primary Function**: `generateFnrhPdf({ reservation, guestData, signatureBase64, signerIp, signerUserAgent, appOrigin, whatsapp2faVerified, whatsappPhone, whatsappOtpVerifiedAt })`.
- **Layout & Visual Design**:
  - Official header: "CORP FLATS HOSPEDAGEM LTDA" (CNPJ: 47.964.813/0001-65 | Cadastur: 19.034.812/0001-90 | Edifício Soho Residence Service).
  - Title: "FICHA DE HOSPEDAGEM (CHECK-IN DIGITAL) • CORPFLATS".
  - Section 1: "1. DADOS DA HOSPEDAGEM" (Flat number, check-in date/time, check-out date/time, guest count, registered vehicle plate & model).
  - Section 2: "2. DADOS CADASTRAIS DO HÓSPEDE" (Full name, document CPF/Passport, birth date, gender, full address, travel reason, transport method, origin & destination).
  - Section 3: "3. DECLARAÇÃO, TERMOS E CONDIÇÕES GERAIS" (Acceptance of house rules, pool/gym regulations, checkout policy).
  - Section 4: "4. ASSINATURA ELETRÔNICA DO HÓSPEDE" (Embedded PNG/JPEG buffer of the handwritten canvas signature, along with forensic metadata).
  - Forensic Trail:
    - Signed UTC timestamp (ISO 8601) and Brasília local time.
    - Signer IP address (`x-forwarded-for` or remote address) and User-Agent.
    - WhatsApp 2FA verification badge (Z-API OTP verification timestamp and masked phone).
    - Legal compliance statement citing Art. 10, § 2º of MP nº 2.200-2/2001 and Federal Law nº 14.063/2020.
    - Dynamic QR Code pointing to verification URL (`${appOrigin}/verificar-ficha/${documentUuid}`).
    - **Canonical SHA-256 Hash**: Hash calculated from canonical JSON containing `documentUuid`, `reservationCode`, `guestCpf`, `guestName`, `signedAt`, `signerIp`, `signerUserAgent`, `whatsapp2faVerified`.
    - **Final File SHA-256 Hash**: SHA-256 computed directly from the generated `.pdf` binary on disk.
- **On-the-Fly Rebuild**:
  - `rebuildFnrhPdfOnTheFly({ reservation, guest, guestData, auditTrail, appOrigin, db })`: Allows instantaneous re-compilation of lost PDF files after container restarts in ephemeral storage environments like Render.

### 1.2 Signature & Document Storage
- **Local File System**: Saved to `secure_uploads/fnrh_documents/` with format:  
  `Ficha_Checkin_${reservationId}_${cleanCpf}_${timestamp}.pdf`.
- **Cloud Storage**: Asynchronous upload to Cloudflare R2 via `storage-service.mjs` (`uploadImageToStorage`), setting `r2Url` / `fnrhR2Url`.
- **In-Memory & Database State (`data/database.json`)**:
  - Reservation properties: `fnrhDocumentUuid`, `fnrhPdfUrl`, `fnrhDownloadUrl`, `fnrhSha256Hash`, `fnrhVerifyUrl`, `fnrhSignedAt`, `fnrhAuditTrail`, `fnrhFileName`, `fnrhFilePath`, `r2Url`.
  - Guest records (`r.guests[i]` and `db.guests`): `targetGuest.hasCompletedCheckin = true`, `targetGuest.status = "CHECKED_IN"`, `targetGuest.fnrhDocumentUuid`, `targetGuest.signatureUrl`.
  - Secure Access Tokens: `generateSignedFnrhToken(documentUuid, 60 * 24 * 30)` HMAC-SHA256 token used in `/api/pms/fnrh/:documentUuid/view?token=...` and `/download?token=...` to protect against unauthorized document enumeration.
  - Audit Trail Table: Stored in `db.fnrhAuditDocuments` and logged in `db.fnrhInternalAuditLogs` via `logFnrhInternalAudit()`.

### 1.3 Reception Document Delivery Flow
- **Email Service (`scripts/mail-service.mjs`)**:
  - Template: `renderCheckinConfirmedEmail({ reservation, flat, settings })`.
  - Recipient: `flat.receptionEmail || db.settings.receptionEmail || "millerpessanha@gmail.com"`, with CC to `garageEmail`.
  - Attachments resolution: `resolveReservationAttachments({ reservation, guest, db })`:
    - Attaches `FNRH_<code/id>_<guestName>.pdf` (file from disk or Base64 buffer).
    - Attaches guest ID document photo `Documento_<name>.<ext>`.
    - Attaches co-guest documents if multi-guest booking.
  - Dispatch Timing Rules:
    - **Today or Past Check-in (`isReservationForTodayOrPast(r)`)**: Dispatched immediately upon check-in completion via `sendEmailAsync()`.
    - **Future Check-in (`isReservationForFuture(r)`)**: Suppressed at signing time. The PDF remains saved on disk and database, and delivery is deferred to the 07:00 morning routine on the check-in day (`r.checkinDate`).

---

## 2. Automated Communications: WhatsApp, Email & Re-Signature Links

### 2.1 WhatsApp Messaging Infrastructure (`scripts/zapi-service.mjs`)
- **Integration**: Z-API gateway with endpoints for instance status, text messages (`sendZapiMessage`), and action buttons (`sendZapiButtonList` / `sendZapiOtpButton`).
- **Template System (`defaultTemplates`)**:
  - `tpl_reservation_updated`: Trigger `reservation_updated`. Sent when changes occur.
    - Includes summary: `{{resumo_alteracoes}}`.
    - Action buttons:
      - `📝 Assinar Ficha Atualizada` (`{{link_checkin_digital}}`)
      - `🏨 Ver Detalhes da Reserva` (`{{link_portal_hospede}}`)
      - `📞 Falar com Atendimento` (`{{telefone_hotel}}`)
  - `tpl_additional_daily_pending`: Trigger `additional_daily_pending`. Sent when stay extension or pending balance is detected.
  - `tpl_pre_checkin_reminder`: Trigger `pre_checkin_reminder`. Sent before arrival with check-in link.
  - `tpl_checkin_day_instructions`: Sent on check-in day at 07:00 with building address and access instructions.
- **Dynamic Tag Resolution (`resolveWhatsAppTags`)**:
  - Replaces `{{link_checkin_digital}}` via `getCheckinUrlSync(reservation, recipientGuestIndex, appOrigin, db)`.
  - Replaces `{{link_portal_hospede}}` with `${appOrigin}/minha-reserva/${resCode}`.
  - Generates static PIX code `{{codigo_pix_copia_cola}}` when balance is pending.
- **Email Mirroring (`mail-service.mjs:renderWhatsAppMirrorEmail`)**:
  - When WhatsApp messages with action buttons or links are dispatched, the system formats and mirrors an HTML copy to the guest's email.

### 2.2 Re-Signature Link Generation Architecture
- **URL Structure**:
  - Check-in declaration URL: `${appOrigin}/pre-checkin/${reservation.code}?guest=${guestIndex}`.
  - If signed via 2-hour compliant session token: includes `?token=${signatureToken}`.
  - Guest Portal direct review URL: `${appOrigin}/minha-reserva/${reservation.code}`.
- **State in `guest-pre-checkin.tsx`**:
  - Pre-checkin recognizes `isReSignatureNeeded = Boolean(res.needsReSignature || currentG?.needsReSignature)`.
  - It clears the signature buffer (`sig = null`) and flags `fnhrDone = false`.
  - It displays the alert banner: *"Reserva Atualizada • Nova Assinatura Necessária: {reservation.reSignatureReason}"*.
  - It preserves 100% of guest personal fields (CPF, address, phone, photos) so the guest only reviews changes and provides the new signature.
- **Gaps in Re-Signature Workflow**:
  - **No automated message dispatch on self-service modification**: When `/api/pms/guest-portal/:code/modify` executes, it neither sets `needsReSignature = true` nor invokes `triggerImmediateWhatsApp` or `sendEmailAsync` with the re-signing link.
  - **In admin PMS edit (`PUT /api/pms/reservations/:id`)**: The server correctly sets `r.needsReSignature = true` (lines 13731-13753), but dispatches generic `reservation_updated` without prioritizing the explicit re-signature call-to-action link.

---

## 3. Real-Time Operational Panels & Operations Synchronization

### 3.1 Reception Panel (`reception-tablet.tsx` / `/portaria`)
- **Backend Route**: `GET /api/reception/today` (lines 17163-17402 of `demo-server.mjs`).
- **Sync Mechanism**: **HTTP Polling every 15 seconds** (`setInterval(fetchToday, 15000)`).
- **Data Model**:
  - Computed live from `db.reservations` in memory:
    - `arrivals`: Reservations with check-in today (or partial check-in pending).
    - `inHouse`: Current active stays (`in_house` or active date window).
    - `departures`: Expected check-outs today.
    - `completedToday`: Checked-in units.
  - Re-signature awareness:
    - Lines 17248 & 17399: `hasCompletedCheckin: Boolean(r.fnhrCompleted && !r.needsReSignature)`.
    - `hasPreCheckin: Boolean((r.fnhrCompleted && !r.needsReSignature) || someCheckinDone)`.
    - If `r.needsReSignature` is true, the arrival card displays the pre-checkin as pending/unauthorized until the guest signs the updated form.

### 3.2 Garage Panel (`garage-dashboard.tsx` / `/garagem`)
- **Backend Route**: `GET /api/pms/garage/daily-sheet` (lines 27291-27316 of `demo-server.mjs`).
- **Sync Mechanism**: **Mount-only fetch + manual refresh button**. No background polling timer is configured in `garage-dashboard.tsx`.
- **Data Model**:
  - Filters all active reservations: `r.checkinDate <= todayStr && r.checkoutDate >= todayStr`.
  - Maps registered vehicle: plate, brand, model, color, guest name, flat number, stay dates.
  - Automatic email dispatch: `triggerGarageEmailNotification(db, saveDatabase, r, r.vehicle)` triggered on check-in or vehicle updates for today's stays.

### 3.3 Housekeeping Schedule (`db.cleaningRequests` & PMS Calendar)
- **Sync Logic on Modification**:
  - When checkout date or flat changes:
    - Moves dirty checkout cleaning card to new checkout date (`oldReq.requestDate = r.checkoutDate`).
    - Cleans up stale cleaning instructions on old flat/dates.
    - Synchronizes bed preferences (twin beds / extra mattress) to the arrival day card.

### 3.4 Operational Schedulers
1. **07:00 Morning Reception & Garage Dispatch**:
   - Loop runs every 5 minutes (`setInterval(..., 300000)` in `demo-server.mjs:30665`).
   - At `hour >= 7`, finds all arrivals for `todayStr` with `morningEmailSentDate !== todayStr`.
   - Generates and dispatches `renderCheckinConfirmedEmail` with FNRH PDF attachments to reception and garage.
   - Cleared on date modification: When check-in is moved to a future date, `morningEmailSentDate`, `morningEmailSentAt`, and `receptionNotifiedAt` are deleted so the routine will fire on the new arrival day.
2. **Breakfast Order Routine**:
   - Stored in `db.breakfastOrders`.
   - When dates change: orders with dates outside the new stay window are marked `cancelled` with `cancelReason`.
   - When flat changes: all associated breakfast orders are reassigned to the new room number.
3. **WhatsApp Queue Scheduler**:
   - Runs every 60 seconds (`scheduleUpcomingReservationTriggers`).
   - Computes `scheduledFor` based on stay dates.
   - **Caveat**: If a reservation was already processed, existing queue items may retain stale timestamps unless re-evaluated upon date modification.

---

## 4. Test Infrastructure Analysis (`tests/`)

### 4.1 Test Runner & Environment
- **Runner**: Node.js built-in test runner (`node --test`).
- **Execution Command**: `node --test tests/<filename>.test.mjs`.
- **Framework**: Native `node:test` (`describe`, `it`, `before`, `after`) and `node:assert/strict`.
- **Current Suite Size**: 65 test files covering tariffs, bot actions, SERPRO FNRH, reception emails, service orders, and WhatsApp agents.

### 4.2 Fixture & Mock Patterns
- **Server Isolation**:
  - Tests like `tests/tariff-engine.test.mjs` and `tests/bot-actions-api.test.mjs` spawn an isolated server process on dynamic ports (e.g. 3995) using `spawn("node", ["artifacts/api-server/demo-server.mjs"])`.
  - Database isolation: Clones `data/database.json` to a unique temp file `data/test-*-<timestamp>.json` and passes `DATA_FILE` / `DATABASE_FILE` via environment variables.
  - Teardown: Kills the spawned process tree via `taskkill /F /T /PID ${pid}` and deletes the temp JSON file.
- **Twin-Server Parity Mandate**:
  - Standard test assertion in multiple test files (e.g. `tests/reception-email-document-attachments.test.mjs`):
    `assert.strictEqual(fs.readFileSync(file1).equals(fs.readFileSync(file2)), true)`
    Verifies that `artifacts/api-server/` and `scripts/` remain 100% byte-for-byte identical.

### 4.3 Test Coverage Gaps for New Requirements
| Requirement Area | Existing Coverage | Gap Identified |
|---|---|---|
| **R1. Simulation (`/modify-preview`)** | None | No test file tests pre-commit availability validation, extra nights calculation, or refund preview. |
| **R2. Payment Settlement Guardrail** | None | No test verifies that `/modify` rejects or halts date updates when `additionalAmountToPay > 0` before PIX/Card settlement. |
| **R3. Mandatory Re-Signature** | Partial (unit check in `fnrh-pdf-multi-guest-resilience.test.mjs`) | No test verifies that `/modify` flags `needsReSignature = true`, invalidates previous FNRH, and triggers re-signature notifications. |
| **R3. Automated Re-Signing Link Dispatch** | None | No test checks dispatch of WhatsApp/email containing the direct pre-checkin re-signing link upon modification. |
| **R4. Panel & Scheduler Synchronization** | Partial (`reception-email-document-attachments.test.mjs`) | No test verifies reception tablet arrival status update from `CHECKED_IN` to `Aguardando Assinatura` after date change, nor garage sync. |

---

## 5. Architectural Findings & Key Recommendations

### Finding 1: Two Distinct Modification Paths Exist
- **Path A: Admin PMS Edit** (`PUT /api/pms/reservations/:id`, lines 13710-14440):
  - Correctly detects `isDatesOrFlatChanged`.
  - Sets `r.needsReSignature = true`, resets `r.fnhrCompleted = false`, clears PDF metadata.
  - However, does NOT dispatch the automated WhatsApp/email message with the direct re-signature link.
- **Path B: Guest Self-Service Modify** (`POST /api/pms/guest-portal/:code/modify`, lines 15456-15716):
  - Directly commits new dates to `r.checkinDate` and `r.checkoutDate` without payment verification.
  - Does NOT set `needsReSignature = true`.
  - Does NOT generate a simulation preview.

### Finding 2: Simulation Endpoint (`/modify-preview`) is Missing
- The guest portal currently has a simple `<Dialog>` that submits directly to `/modify`.
- A dedicated endpoint `POST /api/pms/guest-portal/:code/modify-preview` is required to:
  1. Check flat availability against active reservations.
  2. Compute night difference and daily rates.
  3. Calculate `additionalAmountToPay` and `refundAmount` (applying the 24h cutoff).
  4. Return financial breakdown and payment necessity flags.

### Finding 3: Payment Verification Guardrail Before Modification
- When `additionalAmountToPay > 0`, the reservation dates must remain unchanged.
- A temporary modification pending state or payment intent (e.g. PIX QR Code / Mercado Pago preference for the difference) must be returned.
- Upon verified payment (via Inter Extrato or Mercado Pago webhook/poll), the dates are updated, a payment record is inserted into `r.payments`, and re-signature is triggered.

### Finding 4: Re-Signature Integration in Guest Portal Frontend
- `artifacts/limpeza/src/pages/guest-portal.tsx` must be updated with:
  1. Prominent warning banner when `reservation.needsReSignature === true`.
  2. Action button `"Reassinar Ficha de Check-in"` linking to `/pre-checkin/${reservation.code}`.
  3. Multi-step modification dialog with simulation preview and payment integration before confirmation.

### Finding 5: Real-Time Panel Polling Synchronization
- While the Reception tablet polls every 15s (`fetchToday`), `garage-dashboard.tsx` has no background polling interval. Adding a 15s or 30s polling interval to `garage-dashboard.tsx` will ensure garage attendants immediately see modified dates and license plates.
