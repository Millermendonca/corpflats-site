## 2026-10-14T03:56:12Z

You are the Milestone 5 Backend Implementation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_backend`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first! specifically lines 120-175, R6, R7, and Cartões section)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md` (specifically parent directive 2026-10-14T03:34:19Z)
5. Explorer blueprints in:
   - `.agents/teamwork/explorer_m5_wbp_1/analysis.md` and `handoff.md` (Features 25 & 26: Vault, crypto, reauth, purge, zero-leakage scanner)
   - `.agents/teamwork/explorer_m5_wbp_2/analysis.md` and `handoff.md` (Feature 27 & Server mounting, provisional adapters, schedulers, twin parity)

Your Scope (Milestone 5 Backend: Features 25, 26, 27, Server Mounting & Targeted Tests):

1. Feature 25: Credit Card Encrypted Vault (`artifacts/api-server/wbp/vault.mjs` and mirror `scripts/wbp/vault.mjs`):
   - AES-256-GCM encryption with 12-byte random IV, 16-byte auth tag, and optional AAD (reservationId).
   - Key resolution: `process.env.CREDIT_CARD_VAULT_KEY || process.env.WBP_VAULT_KEY`. Key is 32 bytes (raw or sha256 derived). NEVER store key in database blob or file storage. In `NODE_ENV === "test"`, if neither env var is set, derive deterministically or generate a test key.
   - In-memory CVV/CVC discard: In `callbacks.mjs` / `inbox.mjs`, strip and delete any CVV/CVC fields (`/(card_)?(cvv|cvc|security_code)/i`) in memory BEFORE encryption or storage. Never encrypt, never store, never log CVV.
   - PAN Masking: General reservation payload stores only `maskedPan` (e.g. `•••• •••• •••• 1234`) and card metadata (brand, holderName, expireMonth, expireYear). Full PAN is encrypted into the vault record before masking in the payload.
   - Dedicated local storage: Store encrypted card payloads in `data/wbp_card_vault.json` (outside the main database blob `database.json`), keyed by `cardId` or `reservationId`.

2. Feature 26: Admin Reauth, Single-Use Token & Auto-Purge:
   - Admin Reauth: In `demo-server.mjs`, endpoint `POST /api/wbp/vault/reauth` receives `{ username, password }`. Validates that user exists in `db.users`, `role === "admin"`, and verifies password via `verifyPassword`. Does NOT alter normal login or sessions of reception/staff.
   - Generates a single-use token (`crypto.randomUUID()`) with strictly 5-minute expiration (`Date.now() + 5 * 60 * 1000`).
   - Secure Card Viewing: Endpoint `POST /api/wbp/vault/view` receives `{ token, reservationId, cardId }`. Validates token. Immediately invalidates and deletes the token from memory upon arrival (single-use: 1-time view!). Decrypts card details and returns `{ success: true, card: { holderName, cardNumber, expireMonth, expireYear } }`. CVV is never returned (was discarded).
   - Audit trail: Calls `logAuditEvent({ action: "WBP_VAULT_CARD_VIEW", ... })` logging user, timestamp, masked PAN. Never logs full PAN or CVV.
   - Auto-Purge Engine:
     - Rule 1 (post-checkout): `purgeExpiredCards(options)` checks `currentDate >= addDays(checkoutDate, 7)`. When matched, sets encrypted payload to null, status to `"purged"`, and emits audit log.
     - Rule 2 (cancellation): In `handleOtaCancellation`, when cancellation is without penalty, immediately call `vault.purgeCard(reservationId, "cancellation_no_penalty")`.
     - Wire daily auto-purge scheduler in `demo-server.mjs` startup when `NODE_ENV !== "test"` with `.unref()`.

3. Feature 27: Provisional Messages & Reviews Adapters (`artifacts/api-server/wbp/provisional.mjs` and mirror `scripts/wbp/provisional.mjs`):
   - `GetMessages` & `SendMessage`: Toggled OFF by default (`provisionalMessagesEnabled = false`).
   - `GetReviews` & `RespondReview`: Toggled OFF by default (`provisionalReviewsEnabled = false`).
   - Clearly marked as provisional / experimental in code and API responses.
   - Simulator validation: Update `e2e/wbp-simulator/server.mjs` and `e2e/wbp-simulator/schemas/index.mjs` to support and validate verbs `GetMessages`, `SendMessage`, `GetReviews`, and `RespondReview`.

4. Server Route Mounting in `demo-server.mjs`:
   - Mount vault endpoints: `POST /api/wbp/vault/reauth`, `POST /api/wbp/vault/view`, `POST /api/wbp/vault/purge`.
   - Mount provisional endpoints: `GET /api/wbp/provisional/messages`, `POST /api/wbp/provisional/messages/send`, `GET /api/wbp/provisional/reviews`, `POST /api/wbp/provisional/reviews/respond`, `GET/POST /api/wbp/provisional/settings`.
   - Apply identical changes to `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.

5. Twin Parity:
   - Ensure 100% byte-for-byte SHA-256 identity between `artifacts/api-server/` and `scripts/` across all mirrored files: `vault.mjs`, `provisional.mjs`, `config.mjs`, `callbacks.mjs`, `inbox.mjs`, `demo-server.mjs`.

6. Targeted Test Suite (`tests/wbp-integration/m5-vault-ui.test.mjs`):
   - Use `node --test` with isolated temporary DB in `os.tmpdir()`, unsetting `DATABASE_URL`.
   - Test 1: AES-256-GCM encryption & decryption with separate key.
   - Test 2: In-memory CVV discard before storage (CVV is never encrypted, never saved).
   - Test 3: Zero-Leakage Forensic Scan: recursively search database, `wbp_storage_state.json`, `audit_logs.jsonl`, logs, and API outputs to prove 0 full PANs and 0 CVVs exist unencrypted.
   - Test 4: Admin Reauth & Token Expiration: valid admin credentials produce token; invalid or non-admin rejected; token expires after 5 minutes.
   - Test 5: Single-Use Token Burning: token is invalidated immediately upon 1st view; 2nd attempt with same token fails (403/Forbidden).
   - Test 6: Auto-Purge 7 Days Post-Checkout (time-travel verification).
   - Test 7: Immediate Auto-Purge on Cancellation without penalty.
   - Test 8: Provisional Chat and Review Adapters disabled by default, testable against simulator when enabled.
   - Run EXCLUSIVELY targeted tests: `node --test tests/wbp-integration/m5-vault-ui.test.mjs` and previous targeted tests (`m4-reservations-inbox.test.mjs`, `m3-ari-sync.test.mjs`, `m2-availability-pricing.test.mjs`). (NEVER run global sweeps!).
   - Verify `data/database.json` baseline SHA-256 (`e37d74b7...`) has 0 changes.

7. Git Commit & Push:
   - Check `git branch --show-current` is `feature/wbp-integration`.
   - Commit changes and run `git push origin feature/wbp-integration`.
   - Write handoff report in `handoff.md` in your working directory and notify orchestrator.


## 2026-10-14T04:12:55Z

[Message] timestamp=2026-10-14T04:12:55Z sender=84d9f696-67d5-4529-bec4-c0232e9abea0 priority=MESSAGE_PRIORITY_HIGH content=**Context**: Milestone 5 Backend Implementation (CreditCardVault & Lifecycle Directives)
**Content**: DIRETIVA PRIORITÁRIA DO SENTINEL / PARENT — AJUSTES PREVENTIVOS EM `artifacts/api-server/wbp/vault.mjs` E INTEGRAÇÃO COM `callbacks.mjs` / `inbox.mjs` (aplicar já e espelhar em `scripts/wbp/`):

1) Segurança de boot em Produção sem variável configurada (`vault.mjs`, linha 140):
   - Não lançar erro no construtor `new CreditCardVault()`; se `CREDIT_CARD_VAULT_KEY` / `WBP_VAULT_KEY` não estiver definida em `NODE_ENV !== "test"`, usar uma chave derivada local de fallback (com `console.warn` apenas quando tentar criptografar em produção), garantindo que o servidor sempre suba com segurança mesmo se a env var ainda não foi cadastrada no painel do Render.

2) Guarda do interruptor geral em `startCardAutoPurgeScheduler` (`vault.mjs`, linha 607):
   - Se a integração estiver `off` (`!isWbpEnabled(db)`), `startCardAutoPurgeScheduler` NÃO deve registrar `setInterval` (critério de aceite: zero timers registrados com o interruptor geral desligado).

3) Fiação automática do Cofre na entrada e no cancelamento (`callbacks.mjs` e `inbox.mjs`):
   - Na entrada da reserva (`BookingCreate`, `NotifyBooking`/`GetBookingId`, `processIncomingOTA`): antes de mascarar o PAN, extrair o cartão (já sem CVV!) e gravar no cofre via `getCardVault().storeCard({ orderId, cardData, checkoutDate })`, vinculando `reservationId` e `checkoutDate` ao criar a reserva (`linkReservation`).
   - Em `handleOtaCancellation` (`inbox.mjs`): ao cancelar a reserva (sem multa), chamar automaticamente `getCardVault().purgeCard(normalized.externalOrderId, "cancelled_without_penalty", db)` para cumprir o critério de exclusão imediata no cancelamento sem multa.

4) Manter 100% de paridade SHA-256 byte-a-byte em todos os arquivos espelhados em `scripts/` e garantir testes pontuais passando.
**Action**: Incorpore essas 4 salvaguardas preventivas na sua implementação e confirme no seu handoff.
