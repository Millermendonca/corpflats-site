# Handoff Report: Google Contacts Synchronization & Contact Management Exploration

## 1. Observation
- **Twin Files Located**:
  - `artifacts/api-server/demo-server.mjs` (2,637,141 bytes, 61,560 lines)
  - `scripts/demo-server.mjs` (2,637,141 bytes, 61,560 lines)
  - `scripts/check-twin-parity.mjs` enforces byte-level SHA-256 parity between these files.
- **Google Contacts Integration Code**:
  - Located at lines 33560–34852 of `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
  - Phone expansion logic in `expandBrazilianPhoneVariants` (lines 33593–33674).
  - Caller ID payload assembly in `buildGuestCallerIdContactData` (lines 33676–33907).
  - Single guest sync logic in `syncSingleGuestToGoogleContacts` (lines 34039–34235).
  - Bulk sync endpoint in `POST /api/pms/guests/google-contacts/sync-all` (lines 34508–34798).
- **Companion and Reservation Phone Aggregation**:
  - Lines 33750–33762: `buildGuestCallerIdContactData` loops through all reservations and companion slots (`r.guests`), pushing every `rg.phone` into `rawPhonesCandidateList`.
  - Lines 33993–33995: `personPayload.phoneNumbers` packages all expanded variants of all candidate phones into a single Google Contact payload.
- **Area-Code-Free Suffix Collisions**:
  - Lines 34083 & 34103 (`syncSingleGuestToGoogleContacts`):
    `searchUrl = ... query=${encodeURIComponent(contactData.phoneDigits.slice(-8))}`
    `pDigits.slice(-8) === contactData.phoneDigits.slice(-8)`
  - Lines 34569–34571 & 34643 (`sync-all`):
    `existingByPhoneSuffix.set(digits.slice(-8), entry)`
    `existingByPhoneSuffix.get(phoneKey8)`
  - Line 34664:
    `seenPhonesInBatch.has(phoneKey8)` checks only 8 digits, skipping legitimate distinct guests in other area codes.
- **Unverified Name Overwriting**:
  - Lines 34114–34135: `syncSingleGuestToGoogleContacts` fetches `existingPerson` to get `etag`, but never validates whether `existingPerson.names` matches `contactData.fullName` before submitting `names` update to Google People API.
  - Lines 34553–34554 & 34613: `sync-all` extracts `unstructuredName || givenName`, truncating full names to single first names (e.g. "Raiza", "João") and bypassing compatibility checks if names are empty or structured differently.
  - Lines 9833–9838 (`mergeGuestRecords`): Overwrites `target.fullName` with `source.fullName` simply if `source.fullName.length > target.fullName.length`.
- **Database & Incident Records**:
  - `data/database.json`:
    - Line 8584: Guest 143 (Roselene) has `phone`: `"21997598289"` and `additionalPhones`: `["21976403551"]`.
    - Line 28701: Reservation `RES-712-0012` has `guestName`: `"Roselene"`, `guestPhone`: `"21976403551"`.
    - Line 14150: Guest 359 (Fabiana) has `phone`: `"28999136926"`.
    - Line 12686: Guest 20 (João Eduardo Leal Correa) had previously accumulated Fabiana's phone and resourceName `people/c5362578501072660427`.

---

## 2. Logic Chain
1. **Aggregating Companion Phones into Single Payloads**:
   `buildGuestCallerIdContactData` (lines 33750–33762) does not distinguish between a guest's personal phone and companion phones listed in reservation slots. Every companion number is placed into `rawPhonesCandidateList`. Each phone is expanded into 3 variants by `expandBrazilianPhoneVariants` (lines 33636–33641) and sent as `phoneNumbers` in Google People API.
   -> **Direct Consequence**: Unrelated companions and guests from past stays are merged into the primary guest's Google Contact.

2. **Matching on 8-Digit Suffixes Without Area Code (DDD)**:
   In `sync-all` (lines 34569–34571) and `syncSingleGuestToGoogleContacts` (line 34083), phone lookups query and match on `digits.slice(-8)`. Brazilian phone numbers repeat the last 8 digits across different state/city DDDs (e.g. (21) 97640-3551 vs (22) 97640-3551 vs (27) 97640-3551).
   -> **Direct Consequence**: Contacts in different DDDs collide. Roselene's phone `21976403551` matched an unrelated contact ("Raiza Castro Tavares") whose phone ended in `76403551`, causing Roselene's number to be merged into Raiza's Google Contact.

3. **Overwriting Google Contact Names**:
   When updating an existing Google Contact, both `syncSingleGuestToGoogleContacts` (lines 34121–34135) and `batchUpdateContacts` (lines 34739–34751) include `names` in `updatePersonFields`/`updateMask`.
   Neither verifies that the existing Google Contact's full name matches the CRM guest's full name.
   -> **Direct Consequence**: When Fabiana (Guest 359) was linked to Guest 20's contact (`people/c5362578501072660427`), the contact's name was overwritten to "Fabiana". When João Eduardo was synced, it was overwritten back to "João Eduardo Leal Correa", while retaining Fabiana's phone number.

4. **Name Overwriting in CRM Database**:
   In `mergeGuestRecords` (lines 9833–9838), any source record with a longer string length replaces `target.fullName`. Combined with `areGuestNamesCompatible` (lines 9769–9786) which treats single-token names as matching any name sharing the first token, distinct people with the same first name (or unlinked reservations) overwrite existing CRM records.

---

## 3. Caveats
- No live calls were made to Google People API during this investigation, as this is a read-only exploration step and network access to live Google OAuth tokens is strictly restricted to runtime execution.
- The live Google Contacts account may contain legacy contacts created or edited manually outside the CRM; the programmatic audit must compare live Google Contacts against historical reservations, guest documents, and WhatsApp chat history to identify all discrepancies.
- Strictly adhered to `AGENTS.md`: No global test suites (`tests/*.test.mjs`) were run, and no WhatsApp messages were sent.

---

## 4. Conclusion
The root cause consists of four interacting flaws in `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`:
1. **Lines 33750–33762**: Companion phones in reservation slots are indiscriminately collected into `rawPhonesCandidateList` and mapped into `phoneNumbers`.
2. **Lines 34083, 34103, 34569–34571, 34643, 34664**: Phone lookups use 8-digit suffixes without DDD (`slice(-8)`), causing cross-DDD collision across Brazil.
3. **Lines 34114–34135 & 34739–34751**: `updateContact` replaces contact `names` without verifying that the existing Google Contact belongs to the guest being synced.
4. **Lines 9833–9838 & 9857–9862**: `mergeGuestRecords` unconditionally overwrites shorter names with longer names and appends mismatched phones to `additionalPhones`.

**Fix Strategy**:
1. Require full E.164 phone numbers (with DDD) for all matching and searching; eliminate all 8-digit suffix lookups.
2. Verify contact identity and name compatibility before updating any existing Google Contact; if incompatible, clear `resourceName` and create a distinct contact.
3. Remove companion phone aggregation from `buildGuestCallerIdContactData`.
4. Deploy an automated restoration routine to unmerge CRM records and Google Contacts, restoring phone `21976403551` to Roselene and phone `28999136926` to Fabiana.
5. Mirror all changes across both twin files (`artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`) ensuring `scripts/check-twin-parity.mjs` passes.

---

## 5. Verification Method
1. **Twin Parity Verification**:
   Execute `node scripts/check-twin-parity.mjs` to verify 100% SHA-256 consistency between `artifacts/api-server/` and `scripts/`.
2. **Unit / Logic Verification (Safe & Isolated)**:
   Create or run a dedicated, isolated test script targeting solely the sandbox functions (`loadReconciliationSandbox` logic for phone matching and contact builder) without running `tests/*.test.mjs`.
3. **Audit Script Verification**:
   Run an audit script comparing CRM guests (IDs 143, 359, 20, etc.) ensuring:
   - Roselene (Guest 143) has primary phone `21976403551` and no merged foreign numbers.
   - Fabiana (Guest 359) has phone `28999136926` and is not attached to João Eduardo's contact.
   - João Eduardo (Guest 20) has only his own phones and does not contain Fabiana's phone `28999136926`.
