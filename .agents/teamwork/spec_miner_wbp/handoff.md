# Handoff Report: WBP Specification Mining

**Role:** WBP Specification Miner (`spec_miner_wbp`)  
**Parent / Recipient:** Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Workspace:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_wbp`  
**Generated Artifact:** `analysis.md` (complete technical specification)  
**Date:** 2026-10-13T22:15:30Z  
**Type:** Hard Handoff (Task Complete)

---

## 1. Observation

Direct observations extracted verbatim from the authoritative specification files:

1. **OpenAPI Specification Size and Architecture:**
   - File: `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\wbpAPI.yaml`
   - Total lines: 4,893 lines; 182,839 bytes.
   - Servers: `url: https://secure.webbookingpro.com/api/cloudpms` (line 214).
   - Security: `shared_secret: []` (line 217), defined as apiKey in query (`components/securitySchemes/shared_secret`), and replicated in payload body (`components/schemas/auth:4373-4378`).

2. **Endpoints Enumerated (33 Paths in YAML):**
   - Lines 219-2120: Client Outbound Endpoints: `/HealthCheck` (219), `/SetupProperty` (309), `/GetRoomTypes` (453), `/GetRatePlans` (580), `/GetPromotions` (686), `/SetPromotion` (777), `/RemovePromotion` (840), `/GetChannels` (932), `/AddChannel` (1023), `/RemoveChannel` (1086), `/GetChannelRooms` (1178), `/SetChannelRooms` (1270), `/GetChannelRates` (1332), `/SetChannelRates` (1424), `/ARIUpdate` (1486), `/GetBookingList` (1756), `/GetBookingId` (1905), `/AckBooking` (2059), `/CancelBooking` (2121), `/CreateProperty` (2208), `/DeleteRoom` (2988), `/UpdateRoom` (3052), `/DeleteRatePlan` (3311), `/UpdateRatePlan` (3375), `/FullRefreshChannel` (3520), `/GetReviews` (3590), `/RespondReview` (3663), `/GetMessages` (3737), `/SendMessage` (3810).
   - Lines 3884-4261: Callbacks in PMS: `/ARIFullRefresh` (3884), `/BookingCreate` (3959), `/NotifyBooking` (4095), `/RoomInfo` (4174).

3. **Critical Payload Details & Behavioral Rules:**
   - **`ARIUpdate` Inclusivity:** `end_date` is explicitly defined as: `"Note that this date is inclusive. For example, if the end_date is 2028-08-29 and we send rate = 20.15, then this rate is applicable for someone staying/arriving on 2028-08-29."` (`wbpAPI.yaml:1585-1589`).
   - **`GetBookingList` 5-minute Margin & Null:** `"To ensure that no booking are skipped due to a time-offset between your and our servers make sure to always reduce 5 or more minutes from the time given. ... If wbp_booking_version is null please return all bookings."` (`wbpAPI.yaml:1824-1842`).
   - **`NotifyBooking` Form-Urlencoded:** `requestBody.content['application/x-www-form-urlencoded']` (`wbpAPI.yaml:4123`).
   - **`BookingCreate` Response:** Returns HTTP 200 `{}` on success, or `{ ErrorCode: int, Error: string }` / `{ Error: int, ErrorMsg: string }` on failure (`wbpAPI.yaml:4077, 4081-4082`).

4. **Documented Specification Errata & Schema Defects:**
   - `GetBookingId` (lines 2051-2055): Property is named `reservation`, but `required` list states `[success, Booking]`.
   - `BookingCreate` (lines 4057-4065): Property is named `reservation`, but `required` list states `[shared_secret, booking]`. Example line 4035 has typo `Rate": 34.5`, and line 4013 has numeric `OrderId: 123456789`.
   - `GetRoomTypes` (lines 561-573): Property is defined as `label`, but `required` list mandates `[wbp_room_id, title]`.
   - `FullRefreshChannel` (line 3550): Enum for `verb` is incorrectly defined as `UpdateRatePlan`.
   - `AckBooking` (lines 2067, 2111): Description cites error 4004, while failure example returns error 4001.

5. **Repository Status & Environment Constraints:**
   - Repository working directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`
   - Active branch: `main` (clean working tree with 11 local audit log lines in `artifacts/api-server/audit_logs.jsonl`).
   - User mandate in `ORIGINAL_REQUEST.md`: System in production; zero data loss; integration behind an off-by-default general switch; all development against a local WBP simulator; read-only rule for specification miner.

---

## 2. Logic Chain

1. **Connection Between Outbound Protocol and Architecture:**
   - From Observation 1 and 2, all PMS-initiated calls use `POST https://secure.webbookingpro.com/api/cloudpms/<Verb>` with `application/json`.
   - Each request embeds authentication credentials (`shared_secret`, `pms_cid`, `wbp_property_id`, `wbp_property_password`, `pms_property_id`) and a UUID v4 `guid` in the body.
   - Therefore, a single unified HTTP client wrapper (`WBPClient`) can handle signing, serialization, logging, retry backoff with reused `guid`, and standard response unwrapping for all 8 mandatory outbound endpoints.

2. **Handling Schema Inconsistencies and Errata:**
   - From Observation 4 (Errata E1 through E10), strict JSON Schema validation against unaltered `wbpAPI.yaml` will fail on valid responses (e.g. `GetBookingId` missing property `Booking`, or `GetRoomTypes` missing `title`).
   - Therefore, the local WBP Simulator and the PMS Client parser must implement a dual-mode schema validator:
     - Strict mode: used to audit specification adherence.
     - Tolerant/Normalized mode: maps `reservation` <-> `booking`, `label` <-> `title`, converts `OrderId` to string, and handles both numeric and string property IDs.

3. **Handling Callbacks and Webhook Ingestion:**
   - From Observation 3, WBP calls the PMS on `/BookingCreate` (JSON) and `/NotifyBooking` (form-urlencoded).
   - In accordance with R1 and R5 in `ORIGINAL_REQUEST.md`, to guarantee zero data loss and crash recovery, the PMS callback endpoint MUST write the incoming raw payload to durable storage **before** invoking the business processing logic, and immediately respond with HTTP 200 `{}`.
   - The asynchronous worker picks up raw records, normalizes the booking, dedupes against existing `OrderId` records, and allocates flats.

4. **ARI Calculation and Date Boundary Math:**
   - From Observation 3, `ARIUpdate.end_date` is inclusive, whereas hotel reservations typically treat check-out as exclusive.
   - In CorpFlats (19 flats, 1 room type "Flat", 2 rate plans "Sem café" and "Com café"):
     - Availability = `min(plan_cap, free_flats)` for each calendar night.
     - Rate = SEBRAE tariff (R$ 276.63) for "Sem café", and SEBRAE tariff + per-guest breakfast surcharge for "Com café" (mapped into `rate`, `rdef_single`, and `adult_3`).
     - Dates are batched into contiguous blocks with identical units/rates/restrictions, with `end_date` set to the last night of the block.

---

## 3. Caveats

1. **Uncertified WBP Sandbox Access:**
   - No live WBP partner credentials or staging sandbox endpoints currently exist.
   - All behaviors, errata, and error codes were mined strictly from the official OpenAPI bundle, Markdown documentation, and Myallocator reference files.
2. **Review & Messaging Endpoints (R7):**
   - The official schemas for `GetReviews`, `RespondReview`, `GetMessages`, and `SendMessage` in `wbpAPI.yaml` are copy-paste duplicates of `GetRoomTypes`.
   - In accordance with R7 in `ORIGINAL_REQUEST.md`, these endpoints must be isolated behind disabled-by-default adapters until certified with WBP technical support.
3. **Payments / Credit Card Schema Underspecification:**
   - In `wbpAPI.yaml`, the `Payments` array inside `booking` is not broken down into detailed subfields.
   - In accordance with R6, the client and simulator assume standard card fields (`CardHolder`, `CardNumber`, `CardType`, `ExpireMonth`, `ExpireYear`, `CVV`) inside payment objects, ensuring encryption and CVV omission.

---

## 4. Conclusion

1. The technical specification mining is **complete and exhaustive**.
2. All 8 mandatory client endpoints, 4 PMS callbacks, and 13 optional/discovered endpoints are mapped with verbatim schemas, data types, constraints, and error codes in `analysis.md`.
3. All documented edge cases (`end_date` inclusive, 5-minute margin on `wbp_booking_version`, UTC weekend logic, single/OBP pricing, and 7 restrictions) and specification errata (E1-E10) are resolved with concrete engineering strategies.
4. The local WBP Simulator architectural blueprint is fully defined with schema validation, injection hooks, and programmable failure modes.
5. Ready for handoff to the implementer agents.

---

## 5. Verification Method

To independently verify the observations, logic, and findings of this report:

1. **Verify File Existence and Integrity:**
   ```powershell
   Test-Path "c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_wbp\analysis.md"
   Test-Path "C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\wbpAPI.yaml"
   ```
2. **Verify Inclusive End Date in OpenAPI Spec:**
   Inspect lines 1585-1589 of `wbpAPI.yaml`:
   ```bash
   # In bash/git-bash or node
   node -e "const fs = require('fs'); const lines = fs.readFileSync('C:/Users/mille/.gemini/antigravity/brain/70356aec-b041-4a86-8517-6963f7cb2aa9/wbp_docs/wbpAPI.yaml', 'utf8').split('\n'); console.log(lines.slice(1580, 1595).join('\n'));"
   ```
3. **Verify NotifyBooking Content-Type:**
   Inspect lines 4122-4125 of `wbpAPI.yaml`:
   ```bash
   node -e "const fs = require('fs'); const lines = fs.readFileSync('C:/Users/mille/.gemini/antigravity/brain/70356aec-b041-4a86-8517-6963f7cb2aa9/wbp_docs/wbpAPI.yaml', 'utf8').split('\n'); console.log(lines.slice(4120, 4126).join('\n'));"
   ```
4. **Verify Schema Errata E1 (`reservation` vs `Booking`):**
   Inspect lines 2050-2057 of `wbpAPI.yaml`:
   ```bash
   node -e "const fs = require('fs'); const lines = fs.readFileSync('C:/Users/mille/.gemini/antigravity/brain/70356aec-b041-4a86-8517-6963f7cb2aa9/wbp_docs/wbpAPI.yaml', 'utf8').split('\n'); console.log(lines.slice(2050, 2057).join('\n'));"
   ```
5. **Invalidation Condition:**
   This specification would be invalidated if WebBookingPro releases an updated OpenAPI bundle (v2.0) that alters the endpoint paths, replaces the `shared_secret` security scheme, or deprecates the `Build-To-Us` protocol.
