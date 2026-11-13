# Milestone 2 — Technical Analysis & Code Blueprint
## Re-Signature Lifecycle, Document Delivery & Operational Synchronization
### Focus: Signature Invalidation on Date/Flat Change & Pre-Checkin Clearance

---

## 1. Executive Summary

In CorpFlats Soho / Guest-Flow-Manager, legal and operational compliance mandates that any stay modification involving accommodation (flat/apartment) or calendar stay window (check-in / check-out dates) must **strictly invalidate** any prior check-in digital signature and FNRH (Ficha Nacional de Registro de Hóspedes) legal declaration.

Prior to Milestone 2, signature invalidation across modification pathways was partially implemented with critical inconsistencies:
1. **Incomplete Field Invalidation**: In `commitPendingModification` and `POST /modify`, while `r.needsReSignature = true` and `delete r.fnrhPdfUrl` were executed, `r.signatureUrl = null`, `r.checkedInAt = null`, and `delete r.fnrhDocumentUuid` were **omitted**.
2. **Ghost Document URL Re-generation**: In `GET /api/pms/pre-checkin/:code` and `/api/reception/today`, if `r.fnrhDocumentUuid` remains on the reservation, the server automatically re-generates signed view and download URLs pointing to the obsolete FNRH document, resurrecting invalidated documents.
3. **Reason String Fragmentation**: The re-signature reason differed across endpoints (`"Alteração de acomodação (flat) ou período da estadia"` in Admin PUT, `"Alteração no período da estadia ou flat"` in `commitPendingModification`, and `"Alteração no período da estadia ou acomodação"` in Portal `/modify`).
4. **Missing Clearance on Renewal**: When guests submitted a renewed pre-checkin form via `POST /api/pms/pre-checkin`, `targetGuest.needsReSignature` was never set to `false`, and `r.needsReSignature` was not cleared to `false`, leaving reservations perpetually flagged as requiring re-signature.
5. **Array Overwrite Hazard**: In Admin PUT (`/api/pms/reservations/:id`), the mass-field assignment loop (`for (const f of fields) r[f] = req.body[f]`) copies `req.body.guests` *after* the initial guest invalidation loop, risking the clobbering of `g.needsReSignature = true` flags if the incoming payload contained stale guest objects.

This analysis provides the architectural rationale, root causes, operational ripple effects, and exact drop-in code blueprints for `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` to ensure 100% compliance with Milestone 2 and byte-for-byte twin-server parity.

---

## 2. Invalidation Contract Specification

Whenever a confirmed or active reservation is modified such that its check-in date, check-out date, flat ID, or flat number changes, the following state transitions are mandatory:

### Reservation Aggregate (`r`)
| Field | Desired State | Rationale |
|---|---|---|
| `r.needsReSignature` | `true` | Signals Guest Portal, Reception Tablet, and Schedulers that a new signature is required. |
| `r.reSignatureReason` | `"Alteração de acomodação (flat) ou período da estadia"` | Canonical, user-facing and audit explanation. |
| `r.fnhrCompleted` | `false` | Check-in is legally incomplete until renewed document is signed. |
| `r.preCheckinCompleted` | `false` | Unlocks pre-checkin form for review and signing. |
| `r.signatureUrl` | `null` | Removes prior canvas signature asset. |
| `r.checkedInAt` | `null` | Resets check-in timestamp. |
| `r.status` | Reverted to `"confirmada"` if `"CHECKED_IN"` or `"checkin"` | Blocks unauthorized entry at physical reception. |
| Stale FNRH Document Properties | `delete r.fnrhPdfUrl`<br>`delete r.fnrhDownloadUrl`<br>`delete r.fnrhDocumentUuid`<br>`delete r.fnrhSha256Hash`<br>`delete r.fnrhVerifyUrl`<br>`delete r.fnrhSignedAt`<br>`delete r.fnrhAuditTrail`<br>`delete r.fnrhFileName`<br>`delete r.fnrhFilePath`<br>`delete r.r2Url`<br>`delete r.fnrhR2Url` | Eliminates all forensic metadata and prevents link resurrection. |

### Guest Items (`r.guests[...]`)
| Field | Desired State | Rationale |
|---|---|---|
| `g.needsReSignature` | `true` | Flags guest item in multi-guest arrays. |
| `g.hasCompletedCheckin` | `false` | Invalidates individual guest check-in completion. |
| `g.checkinCompletedAt` | `null` | Resets individual timestamp. |
| `g.signatureUrl` | `null` | Wipes individual signature graphic. |
| Stale FNRH Properties | `delete g.fnrhPdfUrl`<br>`delete g.fnrhDownloadUrl`<br>`delete g.fnrhDocumentUuid`<br>`delete g.fnrhSha256Hash`<br>`delete g.fnrhVerifyUrl`<br>`delete g.fnrhSignedAt`<br>`delete g.fnrhAuditTrail`<br>`delete g.fnrhFileName`<br>`delete g.fnrhFilePath`<br>`delete g.r2Url`<br>`delete g.fnrhR2Url` | Purges individual forensic document references. |

---

## 3. Clearance Contract Specification on Renewed Pre-Checkin

Upon submission of the renewed pre-checkin form via `POST /api/pms/pre-checkin`:

### Guest Target (`targetGuest = r.guests.find(g => g.index === guestIndex)`)
- `targetGuest.needsReSignature = false`
- `targetGuest.hasCompletedCheckin = true`
- `targetGuest.checkinCompletedAt = new Date().toISOString()`
- `targetGuest.signatureUrl = signatureUrl`
- `targetGuest.fnrhDocumentUuid = fnrhDocument.documentUuid`
- `targetGuest.fnrhPdfUrl = fnrhDocument.fileUrl`
- `targetGuest.fnrhSha256Hash = fnrhDocument.sha256Hash`
- `targetGuest.status = "CHECKED_IN"`

### Reservation Aggregate (`r`)
- `r.needsReSignature = false` (when titular guest signs or when all co-guests have `needsReSignature === false`)
- `delete r.reSignatureReason`
- `r.fnhrCompleted = true`
- `r.preCheckinCompleted = true`
- `r.hasPreCheckin = true`
- `r.signatureUrl = signatureUrl`
- `r.checkedInAt = fnrhDocument.signedAt || new Date().toISOString()`
- Forensic document properties populated with the new FNRH PDF hash, UUID, and download URLs.
- Database persisted immediately via `saveDatabase()`.

---

## 4. Architectural Analysis Across Pathways

### Pathway 1: Admin Edit via PMS Calendar (`PUT /api/pms/reservations/:id`)
- **Location**: `scripts/demo-server.mjs`, lines 13749–14533.
- **Trigger**: An administrative user edits a reservation through the calendar drawer or edit modal.
- **Change Detection**:
  ```javascript
  const isDatesOrFlatChanged = Boolean(
    (req.body.checkinDate && oldCheckin && req.body.checkinDate !== oldCheckin) ||
    (req.body.checkoutDate && oldCheckout && req.body.checkoutDate !== oldCheckout) ||
    (req.body.flatId !== undefined && oldFlatId !== undefined && Number(req.body.flatId) !== Number(oldFlatId)) ||
    (req.body.flatNumber !== undefined && r.flatNumber !== undefined && String(req.body.flatNumber) !== String(r.flatNumber))
  );
  ```
- **Identified Flaw in Current Code**:
  At lines 13779–13786, the check `if (hadSignedCheckin)` only executed invalidation if `r.fnhrCompleted` or `r.signatureUrl` were truthy. If an admin moved dates on a reservation that had pre-checkin in a partial state or where `r.needsReSignature` was already set, certain fields were left dirty. Furthermore, lines 13863–13875 copied `req.body.guests` into `r.guests` without reapplying `g.needsReSignature = true`.
- **Remedy**:
  Standardize through a shared helper `invalidateReservationCheckinSignatures(r, reason)`. Call this helper if `isDatesOrFlatChanged`, and re-apply the guest-level invalidation after copying `req.body.guests`.

### Pathway 2: Settlement of Portal Modification Hold (`commitPendingModification`)
- **Location**: `scripts/demo-server.mjs`, lines 15635–15900.
- **Trigger**: Financial settlement of a reservation modification requiring payment (PIX Copia e Cola / QR Code or Credit Card) verified via `/modify-status` polling or payment webhook.
- **Identified Flaw in Current Code**:
  Lines 15737–15750 only set:
  ```javascript
  r.needsReSignature = true;
  r.reSignatureReason = "Alteração no período da estadia ou flat";
  r.fnhrCompleted = false;
  r.preCheckinCompleted = false;
  delete r.fnrhPdfUrl;
  delete r.fnrhSha256Hash;
  ```
  It did **NOT** clear `r.signatureUrl = null`, `r.checkedInAt = null`, `delete r.fnrhDocumentUuid`, or the corresponding fields on `g` in `r.guests`.
- **Remedy**:
  Call `invalidateReservationCheckinSignatures(r, "Alteração de acomodação (flat) ou período da estadia")`.

### Pathway 3: Direct Zero-Cost Portal Modification (`POST /api/pms/guest-portal/:code/modify`)
- **Location**: `scripts/demo-server.mjs`, lines 16693–17013.
- **Trigger**: Guest initiates date shifting (e.g. 2 nights to 2 nights on different dates) or stay reduction where no additional payment is required.
- **Identified Flaw in Current Code**:
  Lines 16903–16916 had identical omissions to `commitPendingModification`, with reason string `"Alteração no período da estadia ou acomodação"`.
- **Remedy**:
  Call `invalidateReservationCheckinSignatures(r, "Alteração de acomodação (flat) ou período da estadia")`.

### Pathway 4: Renewed Pre-Checkin Submission (`POST /api/pms/pre-checkin`)
- **Location**: `scripts/demo-server.mjs`, lines 20657–21312.
- **Trigger**: Guest opens `/pre-checkin/:code?resign=1`, fills the check-in declaration, signs the digital signature canvas, and submits.
- **Identified Flaw in Current Code**:
  Lines 21016–21018 marked `targetGuest.hasCompletedCheckin = true`, but **never** set `targetGuest.needsReSignature = false`.
  Lines 21054–21058 updated `r.fnhrCompleted`, but **never** set `r.needsReSignature = false` or deleted `r.reSignatureReason`.
- **Remedy**:
  Explicitly clear `targetGuest.needsReSignature = false` and `r.needsReSignature = false`, delete `r.reSignatureReason`, set `r.fnhrCompleted = true`, and persist via `saveDatabase()`.

---

## 5. Canonical Invalidation Helper

To ensure strict DRY (Don't Repeat Yourself) compliance and avoid future divergence across pathways, define the following canonical function in `demo-server.mjs`:

```javascript
// ── M2: Canonical Invalidation of Check-in Signatures on Date/Flat Change ────
export function invalidateReservationCheckinSignatures(r, reason = "Alteração de acomodação (flat) ou período da estadia") {
  if (!r) return;

  r.fnhrCompleted = false;
  r.preCheckinCompleted = false;
  r.signatureUrl = null;
  r.checkedInAt = null;
  r.needsReSignature = true;
  r.reSignatureReason = reason;

  delete r.fnrhPdfUrl;
  delete r.fnrhDownloadUrl;
  delete r.fnrhDocumentUuid;
  delete r.fnrhSha256Hash;
  delete r.fnrhVerifyUrl;
  delete r.fnrhSignedAt;
  delete r.fnrhAuditTrail;
  delete r.fnrhFileName;
  delete r.fnrhFilePath;
  delete r.r2Url;
  delete r.fnrhR2Url;

  if (r.status === "CHECKED_IN" || r.status === "checkin") {
    r.status = "confirmada";
  }

  if (Array.isArray(r.guests)) {
    r.guests.forEach(g => {
      g.hasCompletedCheckin = false;
      g.checkinCompletedAt = null;
      g.signatureUrl = null;
      g.needsReSignature = true;
      delete g.fnrhPdfUrl;
      delete g.fnrhDownloadUrl;
      delete g.fnrhDocumentUuid;
      delete g.fnrhSha256Hash;
      delete g.fnrhVerifyUrl;
      delete g.fnrhSignedAt;
      delete g.fnrhAuditTrail;
      delete g.fnrhFileName;
      delete g.fnrhFilePath;
      delete g.r2Url;
      delete g.fnrhR2Url;
    });
  }
}
```

---

## 6. Exact Drop-In Code Blueprint

The following blueprint specifies the exact changes required in both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.

### Chunk 1: Helper Declaration (Place before `app.put("/api/pms/reservations/:id", ...)`)
**Target Location**: Around line 13748.

```javascript
// ── M2: Função Canônica de Invalidação de Assinatura de Check-in em Mudança de Flat/Datas ──
export function invalidateReservationCheckinSignatures(r, reason = "Alteração de acomodação (flat) ou período da estadia") {
  if (!r) return;
  r.fnhrCompleted = false;
  r.preCheckinCompleted = false;
  r.signatureUrl = null;
  r.checkedInAt = null;
  r.needsReSignature = true;
  r.reSignatureReason = reason;

  delete r.fnrhPdfUrl;
  delete r.fnrhDownloadUrl;
  delete r.fnrhDocumentUuid;
  delete r.fnrhSha256Hash;
  delete r.fnrhVerifyUrl;
  delete r.fnrhSignedAt;
  delete r.fnrhAuditTrail;
  delete r.fnrhFileName;
  delete r.fnrhFilePath;
  delete r.r2Url;
  delete r.fnrhR2Url;

  if (r.status === "CHECKED_IN" || r.status === "checkin") {
    r.status = "confirmada";
  }

  if (Array.isArray(r.guests)) {
    r.guests.forEach(g => {
      g.hasCompletedCheckin = false;
      g.checkinCompletedAt = null;
      g.signatureUrl = null;
      g.needsReSignature = true;
      delete g.fnrhPdfUrl;
      delete g.fnrhDownloadUrl;
      delete g.fnrhDocumentUuid;
      delete g.fnrhSha256Hash;
      delete g.fnrhVerifyUrl;
      delete g.fnrhSignedAt;
      delete g.fnrhAuditTrail;
      delete g.fnrhFileName;
      delete g.fnrhFilePath;
      delete g.r2Url;
      delete g.fnrhR2Url;
    });
  }
}
```

### Chunk 2: Admin Edit (`PUT /api/pms/reservations/:id`)
**Target Location**: Lines 13770–13830.

**Replace Existing Code**:
```javascript
  // Se datas ou flat mudarem em reserva já assinada, invalida assinatura para nova assinatura,
  // preservando 100% dos dados cadastrais do hóspede no cadastro e na reserva.
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
      console.log(`[PMS Edição] Reserva ${r.code || r.id} teve alteração de flat/datas após check-in digital. Invalidando assinatura para nova conferência e preservando 100% dos dados cadastrais.`);
      r.fnhrCompleted = false;
      r.signatureUrl = null;
      r.checkedInAt = null;
      r.needsReSignature = true;
      r.reSignatureReason = "Alteração de acomodação (flat) ou período da estadia";
      delete r.fnrhPdfUrl;
      delete r.fnrhDownloadUrl;
      delete r.fnrhDocumentUuid;
      delete r.fnrhSha256Hash;
      delete r.fnrhVerifyUrl;
      delete r.fnrhSignedAt;
      delete r.fnrhAuditTrail;
      delete r.fnrhFileName;
      delete r.fnrhFilePath;
      delete r.r2Url;
      delete r.fnrhR2Url;
      if (r.status === "CHECKED_IN" || r.status === "checkin") {
        r.status = "confirmada";
      }
      if (Array.isArray(r.guests)) {
        r.guests.forEach(g => {
          if (g.hasCompletedCheckin || g.signatureUrl || g.fnrhDocumentUuid) {
            g.hasCompletedCheckin = false;
            g.checkinCompletedAt = null;
            g.signatureUrl = null;
            g.needsReSignature = true;
            delete g.fnrhPdfUrl;
            delete g.fnrhDownloadUrl;
            delete g.fnrhDocumentUuid;
            delete g.fnrhSha256Hash;
            delete g.fnrhVerifyUrl;
            delete g.fnrhSignedAt;
            delete g.fnrhAuditTrail;
            delete g.fnrhFileName;
            delete g.fnrhFilePath;
            delete g.r2Url;
            delete g.fnrhR2Url;
          }
        });
      }
    }
  }
```

**With Replacement Code**:
```javascript
  // Se datas ou flat mudarem na edição, invalida assinatura para nova conferência legal,
  // preservando 100% dos dados cadastrais do hóspede no cadastro e na reserva.
  const isDatesOrFlatChanged = Boolean(
    (req.body.checkinDate && oldCheckin && req.body.checkinDate !== oldCheckin) ||
    (req.body.checkoutDate && oldCheckout && req.body.checkoutDate !== oldCheckout) ||
    (req.body.flatId !== undefined && oldFlatId !== undefined && Number(req.body.flatId) !== Number(oldFlatId)) ||
    (req.body.flatNumber !== undefined && r.flatNumber !== undefined && String(req.body.flatNumber) !== String(r.flatNumber))
  );

  if (isDatesOrFlatChanged) {
    console.log(`[PMS Edição] Reserva ${r.code || r.id} teve alteração de flat/datas. Invalidando assinatura de check-in (needsReSignature = true) e preservando dados cadastrais.`);
    invalidateReservationCheckinSignatures(r, "Alteração de acomodação (flat) ou período da estadia");
  }
```

**And in lines 13875 (after field copying)**:
```javascript
  for (const f of fields) {
    if (req.body[f] !== undefined) r[f] = req.body[f];
  }

  // Se houve alteração de flat ou datas, garante que req.body.guests não ressuscite flags de check-in concluído
  if (isDatesOrFlatChanged) {
    r.needsReSignature = true;
    r.reSignatureReason = "Alteração de acomodação (flat) ou período da estadia";
    r.fnhrCompleted = false;
    r.preCheckinCompleted = false;
    r.signatureUrl = null;
    r.checkedInAt = null;
    delete r.fnrhPdfUrl;
    delete r.fnrhDocumentUuid;
    delete r.fnrhSha256Hash;
    if (Array.isArray(r.guests)) {
      r.guests.forEach(g => {
        g.needsReSignature = true;
        g.hasCompletedCheckin = false;
        g.signatureUrl = null;
        g.checkinCompletedAt = null;
        delete g.fnrhPdfUrl;
        delete g.fnrhDocumentUuid;
        delete g.fnrhSha256Hash;
      });
    }
  }
```

### Chunk 3: Settlement of Modification Hold (`commitPendingModification`)
**Target Location**: Lines 15737–15750.

**Replace Existing Code**:
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

**With Replacement Code**:
```javascript
  // 4. Invalidação Obrigatória de Assinatura (Requisito R3 / M2)
  invalidateReservationCheckinSignatures(r, "Alteração de acomodação (flat) ou período da estadia");
```

### Chunk 4: Direct Zero-Cost Modification (`POST /api/pms/guest-portal/:code/modify`)
**Target Location**: Lines 16903–16916.

**Replace Existing Code**:
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

**With Replacement Code**:
```javascript
  // 8. Invalidação Obrigatória de Assinatura (Requisito R3 / M2)
  invalidateReservationCheckinSignatures(r, "Alteração de acomodação (flat) ou período da estadia");
```

### Chunk 5: Pre-Checkin Submission (`POST /api/pms/pre-checkin`)
**Target Location A (targetGuest setup)**: Around line 21016.

**Replace**:
```javascript
  targetGuest.hasCompletedCheckin = true;
  targetGuest.checkinCompletedAt = now;
```
**With**:
```javascript
  targetGuest.needsReSignature = false;
  targetGuest.hasCompletedCheckin = true;
  targetGuest.checkinCompletedAt = now;
```

**Target Location B (aggregate flags)**: Around lines 21053–21067.

**Replace**:
```javascript
  // Atualiza flags agregadas da reserva
  if (Number(guestIndex) === 1 || (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin))) {
    r.hasPreCheckin = true;
    r.preCheckinCompleted = true;
  }
  r.fnhrCompleted = r.guests.every(g => g.hasCompletedCheckin);
```
**With**:
```javascript
  // Atualiza flags agregadas da reserva
  if (Number(guestIndex) === 1 || (Array.isArray(r.guests) && r.guests.some(g => g.hasCompletedCheckin))) {
    r.hasPreCheckin = true;
    r.preCheckinCompleted = true;
  }
  // M2: Re-assinatura renovada limpa o bloqueio (se for titular ou se todos tiverem re-assinado)
  if (Number(guestIndex) === 1 || !r.guests.some(g => g.needsReSignature)) {
    r.needsReSignature = false;
    delete r.reSignatureReason;
    r.fnhrCompleted = true;
  } else {
    r.fnhrCompleted = r.guests.every(g => g.hasCompletedCheckin);
  }
  if (!r.checkedInAt) {
    r.checkedInAt = now;
  }
```

**Target Location C (post-PDF document linking)**: Around lines 21196–21205.

**Replace**:
```javascript
      targetGuest.status = "CHECKED_IN";
      targetGuest.hasCompletedCheckin = true;

      // Preserva status como "confirmada" caso não esteja in_house/checkin
      if (!r.status || r.status === "CHECKED_IN" || r.status === "pre_reserva") {
        r.status = "confirmada";
      }
      r.checkedInAt = fnrhDocument.signedAt;
      if (Number(guestIndex) === 1) {
        r.fnrhPdfUrl = fnrhDocument.fileUrl;
```
**With**:
```javascript
      targetGuest.status = "CHECKED_IN";
      targetGuest.hasCompletedCheckin = true;
      targetGuest.needsReSignature = false;

      // Preserva status como "confirmada" caso não esteja in_house/checkin
      if (!r.status || r.status === "CHECKED_IN" || r.status === "pre_reserva") {
        r.status = "confirmada";
      }
      r.checkedInAt = fnrhDocument.signedAt;
      if (Number(guestIndex) === 1) {
        r.needsReSignature = false;
        delete r.reSignatureReason;
        r.fnhrCompleted = true;
        r.fnrhPdfUrl = fnrhDocument.fileUrl;
```

---

## 7. Cross-System Operational Ripple Effects

1. **Zoho Mail & Background Queue (`mail-service.mjs`)**:
   - `ensureReservationAttachmentsReady` checks `!reservation.needsReSignature && !titularGuestRecord?.needsReSignature`.
   - When invalidated, dispatch of outdated FNRH PDFs to reception is blocked.
   - When cleared upon re-signing, the newly generated PDF is attached and dispatched immediately (or queued for 07:00 on future arrival dates).
2. **Reception Tablet (`reception-tablet.tsx` & `/api/reception/today`)**:
   - Maps `hasCompletedCheckin: Boolean(r.fnhrCompleted && !r.needsReSignature)`.
   - Displays clear warning and blocks check-in badge while `needsReSignature === true`.
   - Immediately turns green and enables access card release upon renewed signature.
3. **Garage Daily Sheet (`garage-dashboard.tsx` & `/api/pms/garage/daily-sheet`)**:
   - Filters reservations strictly by active dates `r.checkinDate <= todayStr && r.checkoutDate >= todayStr`.
   - Date modifications automatically shift vehicle presence without manual database reload.

---

## 8. Verification & Test Plan

In strict adherence to `AGENTS.md` (no global or suite-wide test sweeps):
1. **Targeted Unit Test Verification**:
   Execute exclusively targeted tests directly exercising reservation modification and settlement:
   ```bash
   node --test tests/m1-reservation-modification-settlement.test.mjs
   ```
2. **Dedicated Milestone 2 Verification Test**:
   Author and execute a dedicated test (e.g. `tests/m2-resign-lifecycle.test.mjs`) verifying:
   - Modification via PUT `/api/pms/reservations/:id` sets `needsReSignature = true`, `signatureUrl = null`, deletes stale `fnrhPdfUrl`, and flags all guests with `needsReSignature = true`.
   - Modification via `commitPendingModification` and `POST /modify` exhibits identical state invalidation.
   - Subsequent submission of `POST /api/pms/pre-checkin` clears `needsReSignature = false`, sets `fnhrCompleted = true`, and sets `targetGuest.needsReSignature = false`.
3. **Twin-Server SHA-256 Parity**:
   Run hash verification:
   ```bash
   node -e "const crypto=require('crypto'), fs=require('fs'); console.log(crypto.createHash('sha256').update(fs.readFileSync('scripts/demo-server.mjs')).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/demo-server.mjs')).digest('hex'));"
   ```
   Must output `true`.
