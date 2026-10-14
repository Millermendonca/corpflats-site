## 2026-10-14T01:52:28Z

You are the Milestone 4 Implementation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_wbp`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md` (specifically parent directive 2026-10-14T01:38:53Z)
5. Explorer reports:
   - `.agents/teamwork/explorer_m4_wbp_1/analysis.md` and `handoff.md` (Features 17 & 18)
   - `.agents/teamwork/explorer_m4_wbp_2/analysis.md` and `handoff.md` (Features 19, 21 & 23)
   - `.agents/teamwork/explorer_m4_wbp_3/analysis.md` and `handoff.md` (Features 20, 22 & 24)

Your Scope (Milestone 4: Reservation Processing, Quarantine, Reconciler & Alerts — Features F17 to F24):

1. Feature 17 (Inbound Webhooks) & Card Hygiene (Directive 3 / R6):
   - In `artifacts/api-server/wbp/callbacks.mjs` (and mirror `scripts/wbp/callbacks.mjs`):
   - Middleware: support both `application/json` and `application/x-www-form-urlencoded`.
   - Security: constant-time `crypto.timingSafeEqual` comparison of `shared_secret`.
   - In-memory Card Hygiene: implement `sanitizeCardDataInMemory(payload)` that recursively strips any CVV/CVC fields (`/(card_)?(cvv|cvc|security_code)/i`) in memory BEFORE saving to storage or logs. Mask full PAN to last 4 digits / brand.
   - Durable Storage & Idempotency: call `storage.recordRawPayload({ source: "webhook", endpoint, payload: sanitizedPayload })` before business logic. Check idempotency.
   - Endpoints:
     - `POST /BookingCreate` -> HTTP 200 `{}`
     - `POST /NotifyBooking` -> HTTP 200 `{}` (in `auto` mode, fetches booking via `client.getBookingId` or triggers worker)
     - `POST /ARIFullRefresh` -> HTTP 200 `{ UpdateId: Date.now() }` (triggers full push asynchronously)
     - `GET /RoomInfo` -> HTTP 200 with room flat list

2. Feature 18 (Background Polling):
   - In `artifacts/api-server/wbp/callbacks.mjs`:
   - `WbpBackgroundWorker`: poll every 30 minutes (or manual `runPollCycle()`).
   - Deduct 5-minute version margin: `client.adjustBookingVersion(lastVersion, 5)` with fallback to null on first run.
   - Process unacknowledged bookings through `processIncomingOTA`.
   - Call `client.ackBooking({ propertyId, orderId })` ONLY after successful persistent storage.
   - Mode rules: in `off` mode, returns skipped; in `observe` mode, records raw payload for audit without mutating PMS and does NOT call `ackBooking`.
   - Startup recovery: on startup, recover unprocessed payloads via `storage.getUnprocessedPayloads()`.

3. Feature 19 (OTA Inbox & Fair-Share Flat Allocation):
   - In `artifacts/api-server/wbp/inbox.mjs` (and mirror `scripts/wbp/inbox.mjs`):
   - Normalize WBP payload: inclusive `EndDate` resolved to `checkoutDate = addDays(EndDate, 1)`.
   - Fair-Share Allocation across Soho Residence 19 flats (`CORPFLATS_19_FLATS`):
     - Filter candidate flats using `calculateCanonicalAvailability` across all 5 collision sources (reservations, blocks, holds, maintenance).
     - If 0 available -> route to Quarantine (`OVERBOOKING`).
     - If >= 1 available -> rank by ascending historical checkout count, occupied nights, and rest time. Assign top flat.
   - Payment Status & `PaymentCollect` (Directive 2 / R5):
     - If `paymentCollect === "Channel"`: set `paymentStatus = "pago_total"`, `netAmount = total - commissionAmount`.
     - If `paymentCollect === "Property"`: set `paymentStatus = "pendente"`, `paidAmount = 0`, flag `collectAtCheckin: true`, and generate reception alert to collect at check-in. Strictly BLOCK legacy forced `pago_total` override!

4. Feature 20 (Quarantine Management Engine):
   - In `artifacts/api-server/wbp/inbox.mjs` and `demo-server.mjs`:
   - Store quarantine in `db.wbpQuarantine` with 7 trigger conditions: `OVERBOOKING`, `CONFLICT`, `MAINTENANCE_BLOCKED`, `CHECKED_IN_CANCELLATION`, `MODIFICATION_CONFLICT`, `AMBIGUOUS_MATCH`, `MALFORMED_PAYLOAD`.
   - Endpoints in `demo-server.mjs`: `GET /api/wbp/quarantine`, `POST /api/wbp/quarantine/:id/resolve`, `POST /api/wbp/quarantine/:id/reject`.
   - Trigger immediate manager alert on quarantine placement.

5. Feature 21 (OTA Mutations: Cancel & Mod):
   - Cancellation: If guest is already checked in or arrival date is past check-in time, DO NOT auto-cancel; route to Quarantine (`CHECKED_IN_CANCELLATION`) with urgent alert. Otherwise, set status `cancelada`, release flat, and call `notifyPmsMutation({ checkin, checkout })` for debounced ARI refresh.
   - Modification: Diff dates/guests/plan. If new dates available, update and trigger debounced ARI refresh for union interval; if conflict, route to Quarantine.

6. Feature 22 (Manual Reservation Reconciliation & Deduplication - Directive 4 / R5):
   - In `artifacts/api-server/wbp/reconciler.mjs` (and mirror `scripts/wbp/reconciler.mjs`):
   - Matching algorithm: match existing manual OTA bookings by channel, exact dates, and guest name (similarity >= 85%).
   - Safe Match: LINK external identifiers (`externalOrderId`, `wbp_booking_id`), do NOT duplicate, do NOT alter assigned flat or rate.
   - Ambiguous Match: route to Quarantine as `AMBIGUOUS_MATCH`.
   - `generateReconciliationReport({ db })`: returns 4-part report (`matched`, `potential_duplicates`, `unmatched_pms`, `unmatched_ota`).

7. Feature 23 (Automations & Strict PIX Suppression - Directive 1 / AGENTS.md):
   - PIX Suppression: strictly bypass Inter PIX and static PIX issuance and payment links for all OTA reservations (`channel: booking | airbnb`).
   - In `auto` mode: generate check-in housekeeping task, reception/garage emails, and WhatsApp welcome with SERPRO/FNRH link (no PIX).
   - In `observe` mode: record automation intents without dispatching external messages.

8. Feature 24 (Critical Events & Daily Alerts):
   - In `artifacts/api-server/wbp/alerts.mjs` (and mirror `scripts/wbp/alerts.mjs`):
   - Real-time manager alerts for: Quarantine entry, persistent ARI failure (>15 min, wired to `WbpAriSynchronizer.onAlert`), and `PaymentCollect = "Property"` arrivals.
   - Daily 08:00 handover summary alert.

9. Twin Parity & Wiring in `demo-server.mjs`:
   - Mount new routers and initialize worker in `artifacts/api-server/demo-server.mjs` and mirror byte-for-byte in `scripts/demo-server.mjs`.
   - Maintain 100% SHA-256 byte-for-byte identity across all twin file pairs between `artifacts/api-server/` and `scripts/`.
   - Preserve real database `data/database.json` (SHA-256 `e37d74b7...`) and 11 uncommitted audit log lines.

10. Targeted Test Execution:
   - Create `tests/wbp-integration/m4-reservations-inbox.test.mjs` covering all 8 features (webhooks, polling, card hygiene, PaymentCollect, fair-share allocation, quarantine, mutations, reconciler, alerts, PIX suppression).
   - Run EXCLUSIVELY via `node --test tests/wbp-integration/m4-reservations-inbox.test.mjs` and `tests/wbp-integration/m3-ari-sync.test.mjs` with `DATABASE_URL` unset, `DATA_FILE` in `os.tmpdir()`, `NODE_ENV="test"`. NEVER run batch sweeps.
   - Ensure git branch is `feature/wbp-integration`. Commit and `git push` to `origin feature/wbp-integration`.
   - Document results in `progress.md` and complete handoff to `handoff.md`. Send completion message to orchestrator.


## 2026-10-14T02:04:18Z

**Context**: Milestone 4 Implementation Directive (Immediate Repass for `alerts.mjs`)
**Content**: Mandatory parent architectural directive for `artifacts/api-server/wbp/alerts.mjs` (and mirror `scripts/wbp/alerts.mjs`):
1. Respect Master Switch (`off` / `observe`) & `NODE_ENV === "test"`:
   - In `startDailySummaryScheduler(db)`: if integration is `off`, DO NOT register `setInterval`. In timer callback, verify mode is `auto`.
   - In `observe` or `off` mode, ZERO external dispatches (WhatsApp/email) must fire.
   - In lines 131 & 152 (`global.sendZapiMessage` / `global.sendEmailAsync`), NEVER call global senders if `process.env.NODE_ENV === "test"` (in tests, strictly use `this.zapiSender` / `this.emailSender` injected).
2. `sendPricingLockAlert` (line 312 — R8):
   - Add email dispatch when `settings.channels.email && settings.recipients.managerEmail` (R8 requires both WhatsApp & email for all 4 critical events: quarantine, overbooking, ARI failure > 15m, price lock retention).
3. Toggle `triggers.onOverbooking` (line 195):
   - In `sendImmediateQuarantineAlert`, when `reason === "OVERBOOKING"`, check `settings.triggers.onOverbooking` (and `settings.triggers.onQuarantine` for other reasons) so the overbooking toggle operates independently.
4. Daily Summary (line 392 — R8):
   - Include count of cancelled OTA reservations in last 24h (`cancelled24h`) in both calculation and summary text.
**Action**: Incorporate these 4 adjustments directly into `alerts.mjs`, mirror in `scripts/wbp/alerts.mjs` with 100% SHA-256 parity, and cover in `m4-reservations-inbox.test.mjs`.


## 2026-10-14T02:05:55Z

**Context**: Milestone 4 Implementation Directive (Immediate Repass for `reconciler.mjs`)
**Content**: Mandatory parent architectural directive for `artifacts/api-server/wbp/reconciler.mjs` (and mirror `scripts/wbp/reconciler.mjs`):
1. Condition for `isSafeMatch` (lines 226 and 273 — R5):
   - `isSafeMatch` MUST strictly require `exactChannelMatch && exactDateMatch && nameSim >= 0.85` (adjust score to >= 80 in this case).
   - If `score >= 50` but `!exactChannelMatch || !exactDateMatch`, ALWAYS classify as `isAmbiguous = true` (`isSafeMatch = false`) to route to Quarantine. Never allow divergent dates or channels to safe-match!
2. Strict Preservation in Safe Link (`applySafeReconciliationLink`, line 353):
   - Do NOT overwrite existing fields of the manual reservation (assigned flat, rates, payment, etc.).
   - Attach linkage metadata ONLY to `externalOrderId`, `wbpBookingId`, `wbpSynced: true`, `wbpMatchedAt` / `wbpLinkMeta`.
**Action**: Incorporate both points directly into `reconciler.mjs`, mirror in `scripts/wbp/reconciler.mjs` with 100% SHA-256 parity, and cover in `m4-reservations-inbox.test.mjs`.


## 2026-10-14T02:11:51Z

**Context**: Milestone 4 Implementation Directive (Immediate Repass for `inbox.mjs`)
**Content**: Mandatory parent architectural directive for `artifacts/api-server/wbp/inbox.mjs` (and mirror `scripts/wbp/inbox.mjs`):
1. PAN LEAK PREVENTION in `normalizeOtaBooking` / `stripCvvDeep` (R6):
   - In `stripCvvDeep` (or `normalizeOtaBooking`), mask any `CardNumber`/`card_number`/`cardNumber`/`pan` in `sanitized` using `maskPan` AFTER extracting `cardLast4` and `cardBrand`. Guarantee ZERO full PAN in `normalized.rawPayload` and `db.wbpInbox`.
2. SAVE `netAmount` & `commissionAmount` in `newReservation` (R5):
   - In `newReservation` object (line 765), explicitly add `netAmount: normalized.netAmount`, `commissionAmount: normalized.commissionAmount`, `cardLast4: normalized.cardLast4`, `cardBrand: normalized.cardBrand`.
3. CANCELLATION GUARD in `handleOtaCancellation` (R5):
   - Remove `isPastCheckinTimeToday` from cancellation block. Block cancellation and route to Quarantine STRICTLY when check-in has actually been completed (`existing.status === "checked_in" || existing.status === "hospedado" || existing.status === "checkin_realizado" || existing.checkedIn === true || Boolean(existing.checkedInAt)`).
4. STRUCTURED BEFORE & AFTER in `handleOtaModification` (R5):
   - Capture `before = { flatId, flatNumber, checkinDate, checkoutDate, totalAmount, breakfastIncluded, guestCount }` and `after = { ... }` and record `before` & `after` in both `existing.auditLogs` and `existing.history` / `existing.modificationHistory`.
5. AUTOMATIONS in `auto` mode (R5):
   - In `processIncomingOTA` in `auto` mode (never in `observe`):
     • Welcome WhatsApp via `alertsManager.sendWhatsApp(normalized.guestPhone)` (WITHOUT PIX);
     • Reception/front-desk email via `alertsManager.sendEmail` (regardless of `checkinDate === todayStr`);
     • SERPRO/FNRH queue record (e.g. `db.serproQueue.push(...)` + `newReservation.fnrhStatus = "enviado"`), keeping `pixTxId: null` and `pixCopiaECola: null`.
**Action**: Incorporate all 5 points directly into `inbox.mjs`, mirror in `scripts/wbp/inbox.mjs` with 100% SHA-256 parity, and cover in `m4-reservations-inbox.test.mjs`.


## 2026-10-14T02:22:26Z

**Context**: Milestone 4 Implementation Directive (Immediate Repass for `inbox.mjs` & `ari-sync.mjs`)
**Content**: Mandatory parent architectural directive:
1. REMOVE `NODE_ENV !== "test"` guards around `notifyPmsMutation`:
   - In `artifacts/api-server/wbp/inbox.mjs` (and mirror `scripts/wbp/inbox.mjs`), remove `if (process.env.NODE_ENV !== "test")` around `notifyPmsMutation(...)` in `handleOtaCancellation`, `handleOtaModification`, and `processIncomingOTA`.
   - `notifyPmsMutation` MUST ALWAYS be called in `auto` mode so that tests can assert that cancellation/modification triggers debounced ARI resend (AGENTS.md prohibits silencing behavior via test-env guards).
2. Debounce Timers `.unref()` in `ari-sync.mjs`:
   - In `artifacts/api-server/wbp/ari-sync.mjs` (and mirror `scripts/wbp/ari-sync.mjs`), call explicit `.unref()` on debounce timers so `node --test` processes never hang:
     ```javascript
     if (this.debounceTimer?.unref) this.debounceTimer.unref();
     if (this.maxWaitTimer?.unref) this.maxWaitTimer.unref();
     ```
3. Mandatory Twin Parity:
   - Ensure 100% byte-for-byte SHA-256 identity between `artifacts/` and `scripts/` for `inbox.mjs` and `ari-sync.mjs`.
**Action**: Incorporate both points directly, maintain 100% twin parity, and verify via targeted tests.

## 2026-10-14T02:43:24Z

**Context**: Diretriz Crítica Repassada pelo Usuário (2026-10-14T02:42:05Z) — Higiene do Repositório antes do Commit de M4
**Content**: HIGIENE DO REPOSITÓRIO ANTES DO COMMIT DE M4 (`audit_logs.jsonl`):

Detectou-se no `git status` que `artifacts/api-server/audit_logs.jsonl` recebeu linhas de teste (`Pre Hóspede 3`, `RES-503`, etc.) durante os testes do Challenger 2, devido ao caminho fixo na linha ~6869 do `demo-server.mjs`:
`const AUDIT_LOG_FILE = path.join(__dirname, "audit_logs.jsonl");`

Ações obrigatórias antes do commit de M4:
1. Restaurar `artifacts/api-server/audit_logs.jsonl` (`git checkout -- artifacts/api-server/audit_logs.jsonl`) para limpar as linhas sintéticas e preservar exclusivamente os logs reais já commitados em `13d5043`.
2. Na linha ~6869 de `artifacts/api-server/demo-server.mjs` (e no espelho em `scripts/demo-server.mjs`), isolar o `AUDIT_LOG_FILE` em testes:
   ```javascript
   const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || (process.env.NODE_ENV === "test" && process.env.DATA_FILE ? path.join(path.dirname(process.env.DATA_FILE), "audit_logs.jsonl") : path.join(__dirname, "audit_logs.jsonl"));
   ```
   Dessa forma, qualquer teste com `NODE_ENV === "test"` e `DATA_FILE` em `os.tmpdir()` grava `audit_logs.jsonl` no diretório temporário, garantindo isolamento total e zero poluição no repositório.
3. Manter 100% de paridade SHA-256 entre os gêmeos de `demo-server.mjs`.

Por favor, execute estas correções, reverifique os testes pontuais e a paridade dos gêmeos, e só então finalize o commit e o handoff de M4.
**Action**: Aplicar isolamento de `AUDIT_LOG_FILE`, restaurar `artifacts/api-server/audit_logs.jsonl`, verificar paridade dos gêmeos de `demo-server.mjs` e prosseguir com commit e handoff.
