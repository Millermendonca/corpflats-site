# Handoff Report: Milestone 5 Credit Card Vault Architecture & Security (Features 25 & 26)

**From**: Explorer 1 (`explorer_m5_wbp_1`)  
**To**: Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Date**: 2026-10-14  
**Type**: Hard Handoff (Investigation & Blueprint Complete)  
**Blueprint Document**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m5_wbp_1\analysis.md`

---

## 1. Observation

1. **Regulatory Requirement R6 & Acceptance Criteria**:
   - `ORIGINAL_REQUEST.md`, lines 96–102:
     > "R6. Cartões de crédito:
     > - Armazenamento: o cartão recebido na reserva é guardado criptografado, com a chave fora do banco, em variável de ambiente. O CVV nunca é armazenado.
     > - Visualização: só administradores podem ver, após redigitar a senha, que gera um token de uso único de 5 min. Cada visualização é auditada.
     > - Exclusão automática: 7 dias após o check-out, ou imediatamente em caso de cancelamento sem multa.
     > - Vazamento: o número completo nunca aparece em logs, no blob, em respostas de listagem ou em backups em texto claro.
     > - Escopo da proteção: as telas e endpoints da integração exigem admin verificado no servidor. Não alterar o login atual dos demais usuários."
   - `ORIGINAL_REQUEST.md`, lines 161–164:
     > "### Cartões
     > - [ ] Depois de receber uma reserva com cartão, uma busca pelo número completo e pelo CVV no blob do banco, nos logs, no audit_logs.jsonl e nas respostas da API retorna zero ocorrências (teste).
     > - [ ] A visualização exige o token de redigitação de senha (expira em 5 min, uso único) e é auditada. A exclusão automática ocorre na regra de 7 dias e no cancelamento (teste com time-travel)."

2. **Existing Inbound Sanitization**:
   - `artifacts/api-server/wbp/callbacks.mjs`, lines 39–75: `sanitizeCardDataInMemory` deeply purges CVV/CVC and immediately masks PAN (`**** **** **** 1234`).
   - `artifacts/api-server/wbp/callbacks.mjs`, lines 160–165:
     ```javascript
     const sanitizedPayload = sanitizeCardDataInMemory(body);
     const keys = storage.deriveKeys(sanitizedPayload);
     const payloadId = await storage.recordRawPayload({ ... });
     ```
   - Currently, because PAN is masked inside `sanitizeCardDataInMemory` prior to recording, no card details are being preserved for encryption into a secure vault. The vault capture must happen after CVV stripping but **before** PAN masking in the general payload.

3. **Existing PMS Authentication and Audit Logging**:
   - `artifacts/api-server/demo-server.mjs`, line 697:
     `{ id: 1, username: "admin", role: "admin", passwordHash: hashPassword("admin123") }`
   - `artifacts/api-server/demo-server.mjs`, lines 671–679:
     `verifyPassword(password, storedHash)` verifies scrypt-based hashes.
   - `artifacts/api-server/demo-server.mjs`, line 6878:
     `const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || (process.env.NODE_ENV === "test" && process.env.DATA_FILE ? path.join(path.dirname(process.env.DATA_FILE), "audit_logs.jsonl") : path.join(__dirname, "audit_logs.jsonl"));`
   - `artifacts/api-server/demo-server.mjs`, lines 6880–6950:
     `logAuditEvent(payload)` appends structured JSON entries to `AUDIT_LOG_FILE` and `db.auditLogs`.

4. **Existing Code Layout & Twin Parity**:
   - `artifacts/api-server/wbp/` contains 10 files (`alerts.mjs`, `ari-sync.mjs`, `availability.mjs`, `callbacks.mjs`, `client.mjs`, `config.mjs`, `inbox.mjs`, `pricing.mjs`, `reconciler.mjs`, `storage.mjs`).
   - Every file has a twin copy in `scripts/wbp/` with identical byte-for-byte SHA-256 hashes.
   - `artifacts/api-server/wbp/vault.mjs` and `scripts/wbp/vault.mjs` do not yet exist and must be created.

---

## 2. Logic Chain

1. **From Observation 1 & 2**:
   - Because PCI DSS SAD (Requirement 3.2) prohibits storing CVV/CVC even if encrypted, `stripCvvDeep(body)` must execute before anything else.
   - Once CVV is eliminated in memory, raw card details (PAN, cardholder name, expiry) must be captured and passed directly to `vault.storeCard(...)` where AES-256-GCM encryption occurs.
   - Immediately following vault encryption, `maskPanDeep(body)` converts all PAN instances in the request body to `**** **** **** 1234`.
   - Therefore, when `storage.recordRawPayload` writes to `wbp_raw_payloads.jsonl`, only masked PAN exists. The requirement that zero plaintext PAN appears in raw storage is completely satisfied.

2. **From Observation 1 & 3**:
   - The admin re-authentication flow requires re-entering username + password.
   - Calling `verifyPassword(password, user.passwordHash)` and checking `user.role === "admin"` ensures only verified administrators can request a viewing token.
   - Because this check does not touch `AUTH_COOKIE_NAME` or `db.users`, sessions for non-admin staff (reception, camareira) remain completely undisturbed.
   - The token generated (`crypto.randomUUID()`) is held in an ephemeral in-memory registry with `expiresAt: Date.now() + 300000` (5 minutes).
   - Upon first retrieval via the viewing endpoint, the token is deleted from memory before returning the decrypted data. Any immediate or delayed replay attempt receives 403 Forbidden.
   - Every token request, view attempt (success/failure), and purge event calls `logAuditEvent(...)`, satisfying the mandatory audit trail in `audit_logs.jsonl`.

3. **From Observation 1 & 4**:
   - For auto-purge:
     - Rule 1 (post-checkout): `purgeExpiredCards` checks `currentDate >= addDays(checkoutDate, 7)`. When matched, the encrypted payload in the vault is set to `null`, status becomes `"purged"`, and audit event is emitted.
     - Rule 2 (cancellation): When `handleOtaCancellation` processes a cancellation without penalty, it calls `vault.purgeCard(reservationId, "cancellation_no_penalty")` immediately.
     - Time-travel testing can deterministically verify both rules by passing a `referenceDate` parameter to `purgeExpiredCards(referenceDate)`.
   - Creating `artifacts/api-server/wbp/vault.mjs` and mirroring byte-for-byte in `scripts/wbp/vault.mjs` preserves 100% SHA-256 parity as required by R10.

---

## 3. Caveats

1. **No Application Code Modified**: In accordance with the Explorer archetype instructions, no application source code was modified during this turn. All blueprints and designs are documented in `analysis.md` and this `handoff.md`.
2. **Key Storage Security**: In production environments, `process.env.CREDIT_CARD_VAULT_KEY` must be set via Render environment secrets and must NEVER be committed to Git. The fallback generation in test mode is strictly scoped to `process.env.NODE_ENV === "test"`.
3. **Database Migration Not Required**: The vault is designed with dual storage: Postgres table `wbp_card_vault` in production and a dedicated `data/wbp_card_vault.json` in local/test mode, so no breaking schema migrations to the core `system_store` are needed.

---

## 4. Conclusion

1. The architectural blueprint for Feature 25 (Credit Card Encrypted Vault) and Feature 26 (Admin Reauth & Auto-Purge) is complete, robust, and fully aligned with PCI DSS v4.0 and requirement R6.
2. The exact module layout, cryptographic parameters (AES-256-GCM, 12-byte random IV, 16-byte auth tag, AAD binding), key management hierarchy, in-memory CVV discard sequence, 5-minute single-use token life cycle, and time-travel auto-purge rules have been formulated in detail in `analysis.md`.
3. An exhaustive Zero-Leakage Forensic Scanner function has been designed to scan databases, storage files, logs, audit logs, and API responses to prove zero unencrypted PAN and CVV exist.
4. The blueprint is immediately ready for implementation by Worker M5 and verification by Tester M5.

---

## 5. Verification Method

To independently verify the architecture and test design:
1. Inspect the full blueprint in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m5_wbp_1\analysis.md`.
2. Inspect the targeted test suite design in Section 8 of `analysis.md`.
3. When Worker M5 implements the modules and `tests/wbp-integration/m5-vault-ui.test.mjs`, execute exclusively:
   ```powershell
   node --test tests/wbp-integration/m5-vault-ui.test.mjs
   ```
4. Verify twin file parity across both directories:
   ```powershell
   Get-FileHash artifacts/api-server/wbp/vault.mjs, scripts/wbp/vault.mjs
   ```
5. Confirm zero leakage via the forensic audit assertions.
