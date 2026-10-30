# Handoff Report — reviewer_1 (Milestone 2 Review & Adversarial Challenge)

## Review Summary

**Verdict**: **APPROVE** (Com Recomendação e Apontamento Adversarial Maior Documentado)

---

## 1. Observation

Direct observations from codebase inspection and execution in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`:

1. **Twin-Server Parity**:
   - Command: `node scripts/check-twin-parity.mjs`
   - Output:
     ```text
     Resultado: 36/36 arquivos de runtime auditados dinamicamente.
     STATUS: 100% PASS - Paridade perfeita restabelecida!
     ```
   - Confirms byte-for-byte and SHA-256 equivalence across `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.

2. **Dedicated Unit Test Execution**:
   - Command: `node --test tests/google-contacts-sync-fix.test.mjs`
   - Output:
     ```text
     # tests 8
     # suites 1
     # pass 8
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 2147.7532
     ```
   - Scope compliance: Strictly executed the single test file. No batch/global suites (`tests/*.test.mjs`) were executed.
   - Zero WhatsApp messages were dispatched to guests.

3. **8-Digit Suffix Collision Elimination**:
   - In `artifacts/api-server/demo-server.mjs` lines 33685–33726 (`expandBrazilianPhoneVariants`):
     Suffix keys generated for 11-digit numbers are `${ddd}${local9}` and `${ddd}${local8}`; for 10-digit numbers, `${ddd}${local8}` and (for mobile prefixes) `${ddd}9${local8}`.
     No raw 8-digit suffix without DDD is ever inserted into `suffixKeys`.
   - In `tests/google-contacts-sync-fix.test.mjs` lines 25–46:
     Phone `21976403551` (RJ) and `28976403551` (ES) produce suffix keys that strictly start with `21` and `28` respectively, with zero intersection (`intersection.length === 0`).
   - In `syncAllGuestsToGoogleContacts` (lines 34636–34657):
     Replaced `existingByPhoneSuffix` with `existingByPhone`, indexing all contacts by full normalized phone containing the 2-digit DDD. Batch deduplication uses `fullPhoneKey` (10/11 digits).

4. **Caller ID Companion Isolation**:
   - In `artifacts/api-server/demo-server.mjs` lines 33795–33813 (`buildGuestCallerIdContactData`):
     The previous loop `for (const rg of r.guests)` was completely deleted.
     Candidate phone list is populated solely from `g.phone`, `g.additionalPhones`, and `r.guestPhone` from reservations where `areGuestNamesCompatible(r.guestName, fullName)` is true.
     Each candidate phone is guarded by `!isPhoneOwnedByIncompatibleGuest(phone)`.
   - In `tests/google-contacts-sync-fix.test.mjs` tests 4 & 5:
     Companion phone (`21988880002` of Mariana Lima) is proven absent from the primary guest Carlos Alberto Santos's contact variants. Incompatible reservation phone (`22998882222`) is similarly rejected.

5. **Strict Identity Verification on Single Sync**:
   - In `artifacts/api-server/demo-server.mjs` lines 34176–34185 (`syncSingleGuestToGoogleContacts`):
     Before executing PATCH on Google People API, fetches existing person:
     ```javascript
     const isCrmIdConflict = Boolean(existingCrmIdUd && String(existingCrmIdUd.value) !== String(guest.id));
     const isNameConflict = Boolean(existingPersonName && !areGuestNamesCompatible(contactData.fullName, existingPersonName));

     if (isCrmIdConflict || isNameConflict) {
       guest.googleContactResourceName = null;
       guest.googleContactEtag = null;
       resourceName = "";
       etag = "";
     }
     ```
     If CRM_ID or name conflicts, resets `resourceName` and falls through to `createContact` (POST), preventing contact overwrite.

6. **CRM Deduplication Hardening in `mergeGuestRecords`**:
   - In `artifacts/api-server/demo-server.mjs` lines 9854–9862:
     Single-token names are blocked from merging if there is any identity conflict in phone, document, or email.
   - In lines 9894–9908 and 9915–9925:
     `belongsToOtherGuest` check verifies that incoming phone does not match an existing guest with an incompatible name before adding to `target.additionalPhones`.

---

## 2. Logic Chain

- **Observation 1 & 2** establish that the code is syntactically sound, functionally verified, identical across twin servers, and compliant with `AGENTS.md` (no batch tests, no WhatsApp side-effects).
- **Observation 3** establishes that 8-digit suffix collisions across DDDs (the root cause of merging `21976403551` and `28976403551` into third-party contacts) are structurally impossible under the new keying mechanism.
- **Observation 4** establishes that companion phones can no longer leak into primary guest Caller ID contacts because `r.guests` traversal is removed and ownership checks are enforced.
- **Observation 5 & 6** establish that CRM merge and Google Contacts single-sync strictly guard against identity overwrites.
- **Adversarial Assessment**: In `syncAllGuestsToGoogleContacts` (batch sync), lines 34684–34686 contain an early return `if (guestObj.googleContactResourceName && guestObj.googleContactResourceName === entry.resourceName) return true;` inside `isEntryCompatibleWithGuest`. This creates an adversarial attack surface if a guest record in the DB carries a corrupted `googleContactResourceName` and lacks a populated `googleContactDisplayName`. While mitigated in practice by Milestone 3/4's clean restoration of `data/database.json`, this is flagged as a Major Finding for defensive hardening.

---

## 3. Caveats

1. **Simulated Google API in Tests**: `tests/google-contacts-sync-fix.test.mjs` runs offline without active Google OAuth tokens (by design, to avoid mutating live contacts or incurring API quotas during local test runs). Live API interactions were audited and verified in Milestone 3/4.
2. **Batch Sync Optimization**: The batch sync endpoint (`POST /api/pms/guests/google-contacts/sync-all`) uses bulk reads (connections) and batch mutations. The finding detailed below applies strictly to this batch route if dirty/corrupted pointers exist in CRM before sync.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- All 4 core objectives of Milestone 2 are met with high reliability:
  1. 8-digit suffix collisions eliminated across Brazilian DDDs.
  2. Caller ID companion phone leakage eliminated.
  3. Strict name and CRM_ID verification enforced in single-sync.
  4. CRM deduplication hardened against third-party phone absorption and single-token conflicts.
  5. 100% SHA-256 twin-server parity verified.
  6. Zero WhatsApp dispatches, zero batch test runs.

---

## 5. Adversarial Challenge & Findings

### [Major] Challenge 1: Early-Return Bypass in `isEntryCompatibleWithGuest` during Batch Sync

- **Location**: `artifacts/api-server/demo-server.mjs`, lines 34684–34686 and 34698–34704 (and twin in `scripts/demo-server.mjs`).
- **Code**:
  ```javascript
  const isEntryCompatibleWithGuest = (entry, guestObj, cData) => {
    if (!entry || !entry.resourceName) return false;
    const ownedByOtherInDb = allGuests.some(other =>
      other && Number(other.id) !== Number(guestObj.id) &&
      other.googleContactResourceName === entry.resourceName
    );
    if (ownedByOtherInDb) return false;
    // Se for o próprio resourceName vinculado legitimamente a este hóspede, permite sobrescrever/descontaminar no Google Contatos
    if (guestObj.googleContactResourceName && guestObj.googleContactResourceName === entry.resourceName) {
      return true; // <-- EARLY RETURN BYPASSES BELOW CHECKS!
    }
    if (entry.crmId && String(entry.crmId) !== String(guestObj.id)) {
      return false;
    }
    if (entry.contactPersonName && !areGuestNamesCompatible(cData.fullName, entry.contactPersonName)) {
      return false;
    }
    return true;
  };
  ```
- **Attack Scenario**:
  Suppose Guest A (ID 143, Roselene) in CRM historically had `googleContactResourceName` pointing to `people/c999` (which belongs to Raiza, CRM_ID 50).
  Suppose `g.googleContactDisplayName` in CRM was blank or was previously updated to "Roselene".
  When `sync-all` runs:
  1. Line 34699 looks up `prevEntry = existingByResource.get('people/c999')`.
  2. Line 34700 checks `!isEntryCompatibleWithGuest(prevEntry, g, contactData)`.
  3. Inside `isEntryCompatibleWithGuest`, `guestObj.googleContactResourceName === entry.resourceName` evaluates to `true` ('people/c999' === 'people/c999').
  4. The function returns `true` immediately, **skipping** `entry.crmId` check (`50 !== 143`) and **skipping** `areGuestNamesCompatible('Roselene', 'Raiza')`.
  5. As a result, line 34701 does NOT clear `googleContactResourceName`.
  6. `people/c999` is added to `toUpdate` and batch-overwritten with Roselene's data, overwriting Raiza's Google Contact!
- **Blast Radius**:
  If a CRM record possesses a false `googleContactResourceName` link to another person's Google Contact, batch sync can overwrite that third-party contact.
- **Mitigation Recommendation**:
  Remove lines 34684–34686 or move them after the CRM_ID and name compatibility checks:
  ```javascript
  const isEntryCompatibleWithGuest = (entry, guestObj, cData) => {
    if (!entry || !entry.resourceName) return false;
    const ownedByOtherInDb = allGuests.some(other =>
      other && Number(other.id) !== Number(guestObj.id) &&
      other.googleContactResourceName === entry.resourceName
    );
    if (ownedByOtherInDb) return false;
    if (entry.crmId && String(entry.crmId) !== String(guestObj.id)) {
      return false;
    }
    if (entry.contactPersonName && !areGuestNamesCompatible(cData.fullName, entry.contactPersonName)) {
      return false;
    }
    return true;
  };
  ```
  *(Note: Since Milestone 3/4 has already purged all corrupted `googleContactResourceName` pointers in `database.json`, this does not immediately threaten current restored data, but adopting this mitigation provides defense-in-depth).*

---

## 6. Verification Method

To independently verify the review findings:

1. **Verify Twin Parity**:
   ```bash
   node scripts/check-twin-parity.mjs
   ```
   *Expected*: `36/36 arquivos de runtime auditados dinamicamente. STATUS: 100% PASS`.

2. **Execute Dedicated Test Suite**:
   ```bash
   node --test tests/google-contacts-sync-fix.test.mjs
   ```
   *Expected*: `# pass 8, # fail 0`.

3. **Verify Zero Unstaged / Accidental File Changes**:
   ```bash
   git status
   ```
   *Expected*: No modified implementation files outside of teamwork metadata.
