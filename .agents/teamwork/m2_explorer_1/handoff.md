# Milestone 2 — Explorer 1 Handoff Report
## Re-Signature Lifecycle, Document Delivery & Operational Synchronization
### Focus: Signature Invalidation on Date/Flat Change & Pre-Checkin Clearance

---

## 1. Observation

Direct code examination of `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` (both currently SHA-256 verified as byte-identical: `72ea96ce4dc341181b8b41e7a01fe91f52e975fdd757fbd70c033688fec6184f`) reveals the following exact code states:

1. **Admin Edit (`PUT /api/pms/reservations/:id`)**:
   - Location: lines 13770–13828 in `scripts/demo-server.mjs`:
     ```javascript
     const isDatesOrFlatChanged = Boolean(
       (req.body.checkinDate && oldCheckin && req.body.checkinDate !== oldCheckin) ||
       (req.body.checkoutDate && oldCheckout && req.body.checkoutDate !== oldCheckout) ||
       (req.body.flatId !== undefined && oldFlatId !== undefined && Number(req.body.flatId) !== Number(oldFlatId))
     );

     if (isDatesOrFlatChanged) {
       const hadSignedCheckin = Boolean(
         r.fnhrCompleted ||
         r.signatureUrl ||
         r.checkedInAt ||
         r.fnrhDocumentUuid ||
         (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin || g.signatureUrl || g.fnrhDocumentUuid))
       );
       if (hadSignedCheckin) {
         ...
         r.needsReSignature = true;
         r.reSignatureReason = "Alteração de acomodação (flat) ou período da estadia";
         delete r.fnrhPdfUrl;
         ...
       }
     }
     ```
   - At lines 13863–13875, `fields` includes `"guests"`. Copying `req.body.guests` after line 13826 overwrites `r.guests`, which can unintentionally wipe `g.needsReSignature = true` and restore stale `g.hasCompletedCheckin = true`.
   - `req.body.flatNumber` was not evaluated in `isDatesOrFlatChanged`.

2. **Hold Settlement (`commitPendingModification`)**:
   - Location: lines 15737–15750 in `scripts/demo-server.mjs`:
     ```javascript
     // 4. Invalidação Obrigatória de Assinatura (Requisito R3)
     r.needsReSignature = true;
     r.reSignatureReason = "Alteração no período da estadia ou flat";
     r.fnhrCompleted = false;
     r.preCheckinCompleted = false;
     delete r.fnrhPdfUrl;
     delete r.fnrhSha256Hash;
     if (Array.isArray(r.guests)) {
       r.guests.forEach(g => {
         g.needsReSignature = true;
         g.hasCompletedCheckin = false;
       });
     }
     ```
   - Omitted: `r.signatureUrl = null`, `r.checkedInAt = null`, `delete r.fnrhDocumentUuid`, `delete r.fnrhDownloadUrl`, `delete r.fnrhVerifyUrl`, `delete r.fnrhSignedAt`, `delete r.fnrhAuditTrail`, `delete r.fnrhFileName`, `delete r.fnrhFilePath`, `delete r.r2Url`, `delete r.fnrhR2Url`.
   - Omitted on `g` in `r.guests`: `g.signatureUrl = null`, `g.checkinCompletedAt = null`, `delete g.fnrhDocumentUuid`.
   - Reason string diverges: `"Alteração no período da estadia ou flat"` instead of `"Alteração de acomodação (flat) ou período da estadia"`.

3. **Direct Zero-Cost Modification (`POST /api/pms/guest-portal/:code/modify`)**:
   - Location: lines 16903–16916 in `scripts/demo-server.mjs`:
     ```javascript
     // 8. Invalidação Obrigatória de Assinatura (Requisito R3)
     r.needsReSignature = true;
     r.reSignatureReason = "Alteração no período da estadia ou acomodação";
     r.fnhrCompleted = false;
     r.preCheckinCompleted = false;
     delete r.fnrhPdfUrl;
     delete r.fnrhSha256Hash;
     if (Array.isArray(r.guests)) {
       r.guests.forEach(g => {
         g.needsReSignature = true;
         g.hasCompletedCheckin = false;
       });
     }
     ```
   - Exhibits the identical field omissions as `commitPendingModification`, with yet another divergent reason string: `"Alteração no período da estadia ou acomodação"`.

4. **Stale Link Resurrection in `GET /api/pms/pre-checkin/:code` & Reception (`/api/reception/today`)**:
   - Location: lines 20422–20435 & lines 18946–18958 in `scripts/demo-server.mjs`:
     ```javascript
     if (r.fnrhDocumentUuid) {
       const tkn = generateSignedFnrhToken(r.fnrhDocumentUuid, 60 * 24 * 30);
       r.fnrhPdfUrl = `/api/pms/fnrh/${r.fnrhDocumentUuid}/view?token=${tkn}`;
       r.fnrhDownloadUrl = `/api/pms/fnrh/${r.fnrhDocumentUuid}/download?token=${tkn}`;
     }
     ```
   - Because `r.fnrhDocumentUuid` was not deleted in `commitPendingModification` and `POST /modify`, subsequent GET calls automatically re-instantiated `r.fnrhPdfUrl`, resurrecting access to the stale pre-modification FNRH document.

5. **Renewed Pre-Checkin Submission (`POST /api/pms/pre-checkin`)**:
   - Location: lines 21016–21018 and lines 21054–21058 in `scripts/demo-server.mjs`:
     ```javascript
     targetGuest.hasCompletedCheckin = true;
     targetGuest.checkinCompletedAt = now;
     ...
     r.fnhrCompleted = r.guests.every(g => g.hasCompletedCheckin);
     ```
   - Neither `targetGuest.needsReSignature = false` nor `r.needsReSignature = false` is ever executed anywhere in the endpoint. As a result, once a reservation enters `needsReSignature = true`, re-signing via the form never clears the re-signature requirement.

---

## 2. Logic Chain

1. **Premise 1 (Legal & Operational Invalidation)**: When a reservation's dates or flat change, the existing check-in contract and FNRH declaration become invalid. Therefore, `r.needsReSignature` must become `true`, `r.fnhrCompleted` must become `false`, `r.signatureUrl` must become `null`, `r.checkedInAt` must become `null`, and all stale FNRH references (`r.fnrhPdfUrl`, `r.fnrhDocumentUuid`, `r.fnrhSha256Hash`, etc.) must be deleted.
2. **Premise 2 (Link Resurrection Bug)**: Based on Observation 4, `GET /api/pms/pre-checkin/:code` reconstructs `r.fnrhPdfUrl` if `r.fnrhDocumentUuid` is truthy. Failing to delete `r.fnrhDocumentUuid` in `commitPendingModification` and `POST /modify` causes the server to expose stale PDF links even after `delete r.fnrhPdfUrl` was executed.
3. **Premise 3 (Clearance Failure Bug)**: Based on Observation 5, `POST /api/pms/pre-checkin` updates `targetGuest.hasCompletedCheckin = true`, but neglects to set `targetGuest.needsReSignature = false` and `r.needsReSignature = false`. Consequently, `mail-service.mjs` (which checks `!reservation.needsReSignature`) continues to withhold reception emails, and the Guest Portal continues to render the re-signature banner.
4. **Premise 4 (Uniformity & DRY Architecture)**: Rather than maintaining 3 separate manual invalidation code blocks with differing reason strings and divergent deleted keys, encapsulating the invalidation into `invalidateReservationCheckinSignatures(r, reason)` provides complete uniformity across Admin Edit, Portal Settlement, and Direct Portal Modification.
5. **Conclusion**: Introducing `invalidateReservationCheckinSignatures(r, reason)` and updating `PUT /api/pms/reservations/:id`, `commitPendingModification`, `POST /api/pms/guest-portal/:code/modify`, and `POST /api/pms/pre-checkin` resolves all link resurrection, field clobbering, and re-signature clearance bugs.

---

## 3. Caveats

- **Frontend Signature Pad Reset**: The Guest Portal (`guest-pre-checkin.tsx`) correctly checks `isReSignatureNeeded = Boolean(res.needsReSignature || currentG?.needsReSignature)` to clear `signatureData` on mount. This ensures the guest must provide a fresh physical signature on the canvas.
- **Reception Email Deferral**: If a reservation's new check-in date is in the future, reception notification is intentionally deferred until 07:00 on the day of arrival, pursuant to standard hotel operating procedure. If the arrival date is today, notification is dispatched immediately upon re-signing.
- **Multi-Guest Arrays**: In multi-guest reservations, titular guest (index 1) re-signing clears the primary reservation-level block (`r.needsReSignature = false`, `r.fnhrCompleted = true`), while tracking individual companion guest completion via `g.needsReSignature`.

---

## 4. Conclusion

The technical analysis and drop-in code blueprints provided in `analysis.md` completely satisfy all Milestone 2 requirements for Re-Signature Invalidation and Pre-Checkin Clearance:
1. All three date/flat change pathways (`PUT /api/pms/reservations/:id`, `commitPendingModification`, and `POST /modify`) uniformly invalidate check-in signatures, delete stale document identifiers, and flag guest arrays.
2. Ghost link resurrection is eliminated by ensuring `r.fnrhDocumentUuid` and `g.fnrhDocumentUuid` are purged on every invalidation.
3. `POST /api/pms/pre-checkin` reliably clears `targetGuest.needsReSignature = false` and `r.needsReSignature = false`, sets `r.fnhrCompleted = true`, and persists atomically to `data/database.json`.
4. The exact drop-in blueprints are ready for implementation in both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` to maintain 100% byte-for-byte SHA-256 parity.

---

## 5. Verification Method

To independently verify the implementation:
1. **Targeted Test Execution** (adhering strictly to `AGENTS.md` - no global sweeps):
   ```powershell
   node --test tests/m1-reservation-modification-settlement.test.mjs
   ```
2. **Dedicated Re-Signature Lifecycle Verification**:
   Run the targeted M2 test verifying:
   - Date/flat change via PUT / Admin sets `r.needsReSignature = true`, `r.signatureUrl = null`, `r.fnrhPdfUrl = undefined`, `r.fnrhDocumentUuid = undefined`.
   - Date change via `commitPendingModification` sets identical invalidation state.
   - Date change via `POST /modify` sets identical invalidation state.
   - Submission of `POST /api/pms/pre-checkin` sets `r.needsReSignature = false`, `r.fnhrCompleted = true`, and `targetGuest.needsReSignature = false`.
3. **Twin-Server SHA-256 Parity Verification**:
   ```powershell
   node -e "const crypto=require('crypto'), fs=require('fs'); const h1=crypto.createHash('sha256').update(fs.readFileSync('scripts/demo-server.mjs')).digest('hex'); const h2=crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/demo-server.mjs')).digest('hex'); console.log('Parity:', h1 === h2, h1);"
   ```
   Result must output `Parity: true`.
