## 2026-10-14T03:40:23Z
You are Explorer 1 for Milestone 5 (Credit Card Vault Architecture & Security).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m5_wbp_1`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first! specifically lines 120-175 and Cartões section)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md` (specifically parent directive 2026-10-14T03:34:19Z)
5. Existing code files:
   - `artifacts/api-server/wbp/callbacks.mjs` (inbound card sanitization)
   - `artifacts/api-server/wbp/inbox.mjs` (reservation storage and processing)
   - `artifacts/api-server/demo-server.mjs` (auth, admin users, audit logging)

Your Mission:
Analyze and formulate the architectural blueprint for Features 25 (Credit Card Encrypted Vault) and 26 (Admin Reauth & Auto-Purge):
1. Cryptographic Engine (Feature 25 — R6):
   - AES-256-GCM encryption with 12/16-byte random IV and 16-byte auth tag.
   - Key management: `process.env.CREDIT_CARD_VAULT_KEY` or `process.env.WBP_VAULT_KEY`. Never stored in the database blob or filesystem JSON. Fallback generation in test mode.
   - In-memory CVV/CVC discard: MUST discard CVV in memory BEFORE encryption or storage. Never encrypt, never store, never log CVV.
   - PAN Masking: mask card number keeping only last 4 digits (e.g. `•••• •••• •••• 1234`). Only masked PAN stored in general reservation payload.
   - Zero-Leakage Forensics: design a comprehensive verification mechanism to scan database, `wbp_storage_state.json`, logs, `audit_logs.jsonl`, and API responses to prove ZERO full PANs and ZERO CVVs exist unencrypted.
2. Admin Reauth & Token-based Viewing (Feature 26 — R6):
   - Viewing full PAN requires Admin credentials (username + password re-entry).
   - Must NOT alter normal login of other users in the system.
   - Generates single-use token (`crypto.randomUUID()`) with strictly 5-minute expiration.
   - Token is invalidated immediately upon first read (single-use!).
   - Every viewing attempt (success or failure) emits a structured audit log in `audit_logs.jsonl`.
3. Auto-Purge Engine (Feature 26 — R6):
   - Purge rule 1: purge cards 7 days after checkout date (`addDays(checkoutDate, 7)`).
   - Purge rule 2: immediately upon reservation cancellation without penalty.
   - Time-travel testing strategy for both purge conditions.
4. Twin File Parity & Targeted Testing:
   - Strategy for creating `artifacts/api-server/wbp/vault.mjs` and mirroring in `scripts/wbp/vault.mjs`.
   - Design of targeted test in `tests/wbp-integration/m5-vault-ui.test.mjs`.
5. Output: Write your findings and recommendations in `analysis.md` and complete handoff in `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion. Do NOT write or modify application code.
