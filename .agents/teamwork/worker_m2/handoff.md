# Handoff Report — worker_m2 (Milestone 2: Fix Synchronization Logic)

## 1. Observation
- **Root Cause 1 (8-digit phone suffix collisions)**:
  - In `artifacts/api-server/demo-server.mjs`: `expandBrazilianPhoneVariants` previously generated pure 8-digit suffix keys (`suffixKeys.add(local8)` and `digits.slice(-8)`).
  - In `syncAllGuestsToGoogleContacts` (`POST /api/pms/guests/google-contacts/sync-all`): `existingByPhoneSuffix` previously indexed existing Google contacts using 8-digit suffixes. When two guests had numbers with identical local suffixes but different DDDs (e.g. `21976403551` in RJ vs `28976403551` in ES), the 8-digit suffix `76403551` matched both, causing Google Contacts of one guest to be updated and renamed with another guest's identity.
- **Root Cause 2 (Companion phone contamination in Caller ID)**:
  - In `buildGuestCallerIdContactData` (`artifacts/api-server/demo-server.mjs`): The loop `for (const rg of r.guests)` unconditionally added companion phones `rg.phone` to `rawPhonesCandidateList` for the primary guest, causing the companion's phone to be included as a variant of the main guest in Google Contacts.
- **Root Cause 3 (Unchecked overwrite of third-party contacts in Google Contacts)**:
  - In `syncSingleGuestToGoogleContacts` and `syncAllGuestsToGoogleContacts`: Querying Google Contacts returned contacts that might have belonged to another guest or have diverging names. `syncSingleGuestToGoogleContacts` previously patched the contact without verifying `CRM_ID` and display name compatibility against `contactData.fullName`.
- **Root Cause 4 (False merges in CRM deduplication)**:
  - In `mergeGuestRecords`: Single-token names previously merged with full names even if there was an email, doc, or phone conflict, and `srcPhoneRaw` was pushed to `additionalPhones` without checking if it was owned by another distinct guest.

## 2. Logic Chain
- **Step 1 — Suffix Isolation**:
  - In `expandBrazilianPhoneVariants`: Removed 8-digit suffix keys. All suffix keys now enforce full 2-digit DDD + 8 or 9 digits (e.g. `${ddd}${local9}`, `${ddd}${local8}`), guaranteeing that numbers from different DDDs never produce overlapping suffix keys.
  - In `syncAllGuestsToGoogleContacts`: Replaced `existingByPhoneSuffix` with `existingByPhone` keyed on full normalized phone with DDD. Updated batch deduplication `seenPhonesInBatch` to index by full phone with DDD (`contactData.phoneDigits.slice(-11)`), avoiding batch skips of different guests sharing local digits.
  - In `syncSingleGuestToGoogleContacts`: Changed People API query from 8-digit suffix to full 10-11 digit phone (`contactData.phoneDigits.slice(-11)`), and filtered results with `phonesMatch(pn.value, contactData.e164Phone)`.
- **Step 2 — Caller ID Companion Isolation**:
  - In `buildGuestCallerIdContactData`: Completely eliminated the loop over `r.guests`. Candidate phones are now strictly confined to `g.phone` (verified not owned by another guest), `g.additionalPhones` (verified), and `r.guestPhone` from reservations where `areGuestNamesCompatible(r.guestName, fullName)` is true.
- **Step 3 — Name & CRM_ID Protection**:
  - In `syncSingleGuestToGoogleContacts`: Added verification on `GET /{resourceName}`: extracts `CRM_ID` from `userDefined` and checks name compatibility using `areGuestNamesCompatible`. If a conflict is detected, `guest.googleContactResourceName` and `etag` are cleared, and the system proceeds to `createContact` (POST) to create an isolated contact instead of overwriting.
  - In `syncAllGuestsToGoogleContacts`: Added `isEntryCompatibleWithGuest` check that verifies no other guest in DB owns the resourceName, verifies `entry.crmId` matches `guestObj.id`, and verifies `areGuestNamesCompatible`. Incompatible candidate contacts are skipped and treated as new contacts (`toCreate`).
- **Step 4 — Twin-Server Parity**:
  - Synchronized `artifacts/api-server/demo-server.mjs` to `scripts/demo-server.mjs`.
  - Executed `node scripts/check-twin-parity.mjs`: Result: 36/36 files 100% PASS with identical SHA-256 hashes.
- **Step 5 — Unit Test Verification**:
  - Created isolated unit test `tests/google-contacts-sync-fix.test.mjs`.
  - Executed `node --test tests/google-contacts-sync-fix.test.mjs`: All 8 tests passed with 0 failures.

## 3. Caveats
- No live Google Contacts API calls were made during the unit test run (all logic was verified via mock DB and functional payloads).
- Live data restoration in CRM and Google Contacts (Milestones 3 & 4) will be handled in subsequent milestones with the audit reports and dedicated restoration script.

## 4. Conclusion
- All synchronization logic vulnerabilities in `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` have been eliminated.
- 8-digit suffix collisions across Brazilian area codes are prevented.
- Companion phone leakage into primary guest Caller ID is eliminated.
- Unchecked Google Contact mutation is guarded with strict name and `CRM_ID` checks.
- Perfect twin-server parity (SHA-256) is restored.

## 5. Verification Method
- **Twin-Server Parity**:
  ```bash
  node scripts/check-twin-parity.mjs
  ```
  Expected output: `STATUS: 100% PASS - Paridade perfeita restabelecida!`
- **Unit Test Execution**:
  ```bash
  node --test tests/google-contacts-sync-fix.test.mjs
  ```
  Expected output:
  ```
  # tests 8
  # suites 1
  # pass 8
  # fail 0
  ```
