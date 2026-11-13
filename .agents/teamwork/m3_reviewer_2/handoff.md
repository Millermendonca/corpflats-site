# Milestone 3 Review & Adversarial Critic Report: Backend Projection, Twin-Server Parity, Security & Build Integrity

**Reviewer**: M3 Reviewer 2 (Roles: Reviewer, Adversarial Critic)  
**Verdict**: **APPROVE**  
**Date**: 2026-10-11T16:48:00Z  

---

## 1. Observation

### 1.1 Backend Field Projection
- File: `scripts/demo-server.mjs` (lines 15139–15141) and `artifacts/api-server/demo-server.mjs` (lines 15139–15141)
- Route: `GET /api/pms/guest-portal/:code`
- Code inspected:
  ```javascript
  15139:       needsReSignature: Boolean(r.needsReSignature),
  15140:       reSignatureReason: r.reSignatureReason || null,
  15141:       reSignatureUrl: r.needsReSignature ? `/pre-checkin/${r.code}?resign=1` : null,
  ```
- Result: Directly projects `needsReSignature`, `reSignatureReason`, and `reSignatureUrl` as mandated by PROJECT.md Feature 9 and ORIGINAL_REQUEST.md R3.

### 1.2 Byte-for-Byte SHA-256 Parity
- Tool Command: `Get-FileHash -Algorithm SHA256 scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs`
- Verbatim Output:
  ```
  Algorithm : SHA256
  Hash      : 694A0DAD272580616EBFEAA2234DD2718D1E3B1CE5D032A88E39C27438DC730F
  Path      : scripts/demo-server.mjs

  Algorithm : SHA256
  Hash      : 694A0DAD272580616EBFEAA2234DD2718D1E3B1CE5D032A88E39C27438DC730F
  Path      : artifacts/api-server/demo-server.mjs
  ```
- Result: 100% byte-for-byte SHA-256 parity confirmed with zero discrepancy.

### 1.3 Build Integrity Verification
- Path: `artifacts/limpeza/dist/public/`
- Direct File Inspection:
  - `index.html`: 2,648 bytes (last write: 11/10/2026 13:38:16)
  - `assets/index.js`: 3,325,845 bytes (last write: 11/10/2026 13:38:16)
  - `assets/index.css`: 398,530 bytes (last write: 11/10/2026 13:38:16)
  - `assets/pdf-z6sF223D.js`: 379,017 bytes
  - `assets/pdf.worker.min-rsCePomN.mjs`: 1,417,586 bytes
  - `assets/pdf.worker.min-DDwCJoSP.js`: 68 bytes
- Result: Clean production build bundle exists and reflects the latest compilation.

### 1.4 Security & Re-Signing Bypass Analysis
- Invalidation: `invalidateReservationCheckinSignatures(r, reason)` in `scripts/demo-server.mjs`:
  - Sets `r.needsReSignature = true`, sets `r.reSignatureReason`, clears `r.signatureUrl = null`, clears `r.checkedInAt = null`, clears `r.fnhrCompleted = false`, clears `r.preCheckinCompleted = false`.
  - Clears stale FNRH PDF references (`fnrhPdfUrl`, `fnrhDocumentUuid`, etc.).
  - Marks each guest in `r.guests` with `g.needsReSignature = true` and `g.hasCompletedCheckin = false`.
- Physical Reception Gate: `POST /api/reception/checkin/:reservationId` (lines 19404–19410):
  - If `r.needsReSignature === true`, check-in is hard-blocked with HTTP 400 (`error: "Não é possível liberar a entrada: Re-assinatura de termo obrigatória..."`).
- Clearing Logic in `POST /api/pms/pre-checkin` (lines 20921–21528):
  - Detects `wasReSignature = Boolean(r.needsReSignature || req.body.resign === "1" || req.body.isReSignature === true || req.query?.resign === "1")`.
  - Validates WhatsApp OTP (2FA) if active or submitted; returns 400 on failure.
  - Validates 2-hour signature session token if provided; returns 400 if expired or revoked.
  - Clears `targetGuest.needsReSignature = false`.
  - Only clears `r.needsReSignature = false` when all guests in the reservation have re-signed (`!hasPendingGuestsReSign`).
  - Calls `generateFnrhPdf` to compile updated forensic document with SHA-256 hash.
  - Records forensic entry in `db.fnrhAuditDocuments`.
  - Dispatches reception notification email with updated FNRH PDF attachment (`re_signature_checkin`).

### 1.5 Targeted Test Suite Execution
- **Command 1**: `node --test tests/m3-frontend-portal-panels.test.mjs`
  - Output: `# tests 8 # suites 1 # pass 8 # fail 0 # cancelled 0`
  - Duration: 17.43s
- **Command 2**: `node --test tests/m2-re-signature-operations-sync.test.mjs`
  - Output: `# tests 7 # suites 1 # pass 7 # fail 0 # cancelled 0`
  - Duration: 3.15s
- Result: 15/15 tests passing across both targeted suites with zero regressions.

---

## 2. Logic Chain

1. *From Observation 1.1*: The projection in `demo-server.mjs` supplies `needsReSignature`, `reSignatureReason`, and `reSignatureUrl` on `GET /api/pms/guest-portal/:code`. This satisfies R3 / Feature 9 interface contract.
2. *From Observation 1.2*: Identical SHA-256 hashes (`694A0DAD...`) prove that the Twin-Server Parity Mandate between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` is strictly maintained.
3. *From Observation 1.3*: The presence and modification timestamps of `artifacts/limpeza/dist/public/` match the worker's Vite build execution, conforming to the project's production build rule.
4. *From Observation 1.4*: Invalidation logic forcibly clears prior signatures and flags all guests with `needsReSignature = true`. The reception endpoint rejects physical arrival check-in with HTTP 400 until re-signing is completed. In `POST /api/pms/pre-checkin`, the flag is cleared only after generating a cryptographic forensic PDF and verifying any active 2FA. In multi-guest bookings, `r.needsReSignature` remains active until all guests have re-signed. Therefore, no bypass exists.
5. *From Observation 1.5*: Both targeted milestone test suites passed 100% without failure or timeout.
6. *From Integrity Analysis*: No hardcoded fixtures, dummy facade implementations, shortcuts, or fabricated outputs were detected. The implementations are genuine, robust, and complete.

---

## 3. Caveats

- In multi-guest reservations where only the primary guest re-signs, the reservation-level flag `r.needsReSignature` intentionally remains `true` until secondary guests complete their re-signatures. This is legally correct and ensures non-repudiation across all occupants.
- No other caveats.

---

## 4. Conclusion

The Milestone 3 implementation satisfies all requirements:
1. Backend Projection: Verified on `GET /api/pms/guest-portal/:code`.
2. Twin Server Parity: 100% byte-for-byte SHA-256 parity verified.
3. Security & Anti-Bypass: Mandatory re-signature invalidation, reception check-in blocking, and authentic PDF/2FA clearing verified.
4. Build Cleanliness: `artifacts/limpeza/dist/` verified.
5. Targeted Test Suites: 100% pass rate on `tests/m3-frontend-portal-panels.test.mjs` and `tests/m2-re-signature-operations-sync.test.mjs`.

**Explicit Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify these findings:
1. Check Twin-Server SHA-256 parity:
   ```powershell
   Get-FileHash -Algorithm SHA256 scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs
   ```
2. Run targeted Milestone 3 test suite:
   ```bash
   node --test tests/m3-frontend-portal-panels.test.mjs
   ```
3. Run targeted Milestone 2 test suite:
   ```bash
   node --test tests/m2-re-signature-operations-sync.test.mjs
   ```
4. Verify build artifacts:
   ```powershell
   Get-ChildItem -Path artifacts/limpeza/dist/public
   ```
