## 2026-10-29T16:54:57Z
You are worker_m2, an implementation worker.
Your working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL PROJECT RULES (AGENTS.md):
1. NUNCA executar testes globais, varreduras ou em lote (`tests/*.test.mjs`).
2. Apenas o teste estritamente pontual do que foi alterado: rode APENAS `node --test tests/google-contacts-sync-fix.test.mjs`.
3. NUNCA disparar mensagens reais de WhatsApp para hóspedes.
4. Paridade byte-a-byte idêntica (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`. Use `node scripts/check-twin-parity.mjs` para verificar.

INPUT CONTEXT:
Read the following files before starting:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (lines 890 to 930)
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_1\analysis.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_2\analysis.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_3\analysis.md`

FILES YOU EXCLUSIVELY OWN:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`
- `tests/google-contacts-sync-fix.test.mjs`

TASK OBJECTIVE:
Implement the fix for the CRM-to-Google Contacts synchronization logic to resolve the root causes identified in Milestone 1:

1. **Eliminate 8-Digit Suffix Collisions (Enforce Full DDD + Number)**:
   - In `expandBrazilianPhoneVariants` (around line 33593): Ensure suffix keys always include the 2-digit DDD (`${ddd}${local9}` and `${ddd}${local8}`) and never omit the DDD.
   - In `syncAllGuestsToGoogleContacts` (`POST /api/pms/guests/google-contacts/sync-all`, around line 34509):
     - Replace `existingByPhoneSuffix` (keyed by 8 digits) with `existingByPhone` keyed by full normalized Brazilian phone numbers (e.g. `${ddd}${local9}` and `${ddd}${local8}`).
     - In batch creation duplicate check (`seenPhonesInBatch`), key by full phone with DDD, never by 8 digits.
   - In `syncSingleGuestToGoogleContacts` (around line 34083):
     - Query People API with full 10-11 digit phone (`contactData.phoneDigits.slice(-11)`), not `slice(-8)`.
     - When filtering search results, use `phonesMatch(pn.value, contactData.e164Phone)` instead of `slice(-8)` comparison.

2. **Stop Cross-Contaminating Companion & Reservation Numbers in Caller ID**:
   - In `buildGuestCallerIdContactData` (around line 33734-33762):
     - Limit `rawPhonesCandidateList` strictly to phones belonging to this specific guest (`g.phone` and verified `g.additionalPhones`).
     - Remove the loop that pulls companion phones (`rg.phone`) from `r.guests` into the main guest's contact.
     - For `r of sortedRes`, only consider `r.guestPhone` if `areGuestNamesCompatible(r.guestName, fullName)` is true.

3. **Strict Name & Identity Verification Before Google Contact Updates**:
   - In `syncSingleGuestToGoogleContacts` (around line 34114-34135):
     - When fetching `existingPerson` via `GET /{resourceName}`, extract its display name and `CRM_ID` (from `userDefined`).
     - If `existingPerson` has a name that is NOT compatible with `contactData.fullName`, or if its `CRM_ID` belongs to another guest:
       - DO NOT overwrite that person's contact or inject phone numbers!
       - Clear `guest.googleContactResourceName = null` and `guest.googleContactEtag = null`.
       - Proceed to `createContact` (POST) to create a separate, isolated Google Contact for this guest.
   - In `syncAllGuestsToGoogleContacts`:
     - Ensure candidate contact in Google has a name compatible with `g.fullName` before assigning to `toUpdate`. If incompatible, do not update it; treat as unmapped and create a new contact.

4. **Prevent False Name Overwrites in CRM Deduplication**:
   - In `mergeGuestRecords` / `areGuestNamesCompatible` (around lines 9783, 9833-9862):
     - Prevent single-token names from matching completely different full names (e.g. "Leonardo" matching "Leonardo da Silva Rodrigues" AND "Leonardo Portugal"). Require that if one name is single-token, it only matches if there's no conflict or require strict verification.
     - In `mergeGuestRecords`: Do NOT push `srcPhoneRaw` into `target.additionalPhones` if `srcPhoneRaw` belongs to another known distinct guest.

5. **Maintain Twin-File Parity**:
   - Synchronize all edits identically between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
   - Run `node scripts/check-twin-parity.mjs` to confirm parity.

6. **Create Dedicated Isolated Unit Test**:
   - Create `tests/google-contacts-sync-fix.test.mjs` testing the fixed functions (`buildGuestCallerIdContactData`, `expandBrazilianPhoneVariants`, `areGuestNamesCompatible`, Google Contact matching/payload logic):
     - Proves that two phones with the same 8-digit suffix but different DDDs (e.g. `21976403551` vs `28976403551`) do not collide.
     - Proves companion numbers are not added to guest Caller ID contact data.
     - Proves that contact update payload logic protects existing third-party contacts from being overwritten when names diverge.
   - Run `node --test tests/google-contacts-sync-fix.test.mjs`.

DELIVERABLES:
- Write completion report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md`.
- Send completion message to parent orchestrator via `send_message`.
