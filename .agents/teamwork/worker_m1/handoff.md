# Handoff Report — M1: Backend Housekeeping B2B & Twin-Server Parity

## 1. Observation
- **Primary Server File**: `artifacts/api-server/demo-server.mjs`
  - Helpers added at lines ~14636–14705: `isB2bReservation`, `computeLinenTracking`.
  - Stayover card generation added to `getRequestsForDate` at lines ~14780–14840.
  - Checkouts endpoint enriched with `linenTracking`, `isOccupied: true`, `isVacant: false`, and stayover safety at lines ~17150–17320.
  - Status update endpoint `PATCH /api/cleaning/assignments/:requestId/status` updated with DND block (HTTP 422), 10-minute lock exemption, checkout protection, and linen change history persistence at lines ~41870–42050.
  - Guest Portal endpoints added at lines ~25410–25575 (`/do-not-disturb`, `/linen-request`, `/linen-request/:requestId/cancel`) and `b2bHousekeeping` injected into `GET /api/pms/guest-portal/:code` at lines ~25390–25405.
  - Helpers exported at bottom of file (lines ~56790–56797).
- **Twin Mirror File**: `scripts/demo-server.mjs`
  - Synchronized via copy from `artifacts/api-server/demo-server.mjs`.
  - Hash command execution:
    ```
    (Get-FileHash artifacts/api-server/demo-server.mjs).Hash; (Get-FileHash scripts/demo-server.mjs).Hash
    ```
    Output:
    ```
    824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A
    824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A
    ```
- **Syntax Verification**:
  - `node -c artifacts/api-server/demo-server.mjs` exited with code 0.
  - `node -c scripts/demo-server.mjs` exited with code 0.
  - `git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs` exited with code 0 (zero diff).
- **Unit Testing**:
  - Test command: `cmd /c "set NODE_ENV=test&& node --test tests/b2b-housekeeping-m1.test.mjs"`
  - Results verbatim:
    ```
    # tests 5
    # suites 4
    # pass 5
    # fail 0
    # cancelled 0
    # skipped 0
    # todo 0
    # duration_ms 3033.3063
    ```

---

## 2. Logic Chain
1. *Observation 1*: B2B reservations in intermediate days require daily stayover housekeeping without prematurely triggering room checkout or marking apartments vacant.
2. *Observation 2*: `getRequestsForDate` checks active reservations with `checkinDate < dateStr && checkoutDate > dateStr` and `isB2bReservation(r)`. Non-B2B channels (Booking, Airbnb, Site, WhatsApp) return false in `isB2bReservation(r)`, preserving their existing immunity from intermediate cards.
3. *Observation 3*: `computeLinenTracking` measures calendar days between `dateStr` and `lastBeddingChangeDate` (or `checkinDate` fallback). When `daysSinceBeddingChange >= 3`, `needsBeddingChangeAlert` evaluates to true, meeting the 3-day housekeeping requirement.
4. *Observation 4*: In `PATCH /api/cleaning/assignments/:requestId/status`, guards verify `isStayover`. For stayover cards, `checkoutDone` remains untouched, reservation status is not modified to `completed`, flat occupancy is kept (`relatedFlat.isOccupied = true`), and the 10-minute minimum cleaning lock is bypassed.
5. *Observation 5*: Both twin servers (`artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`) share the identical SHA-256 hash `824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A`, preventing regression between production and development scripts.

---

## 3. Caveats
- `maid-automation-service.mjs` stayover rates and maid accounting are part of Milestone 2 (M2) and were not modified in M1.
- Frontend components (`flat-card.tsx`, `guest-portal.tsx`, `reports.tsx`) are part of Milestones 3 & 4 and will consume the endpoints and fields delivered in this milestone.
- No caveats regarding backend stayover card generation or twin-server parity.

---

## 4. Conclusion
Milestone 1 (M1) is completely implemented, verified, and ready for integration:
- Canonical helper `isB2bReservation` is active and exported.
- Stayover cleaning cards generate exclusively for B2B reservations on intermediate days.
- Rich `linenTracking` with 3-day alert threshold is attached to checkout responses.
- Safe stayover completion logic prevents accidental check-out, protects flat occupancy, and persists linen change history.
- Guest Portal B2B endpoints for DND and linen request are fully operational.
- Twin-server parity is verified at 100% SHA-256 identity.

---

## 5. Verification Method
To independently verify:
1. **Twin-Server Parity Check**:
   ```powershell
   Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
   ```
   Both must return `824C8A26E29379DE7728D8731236406B7E107D6F0BD71AD4A659FF950159671A`.
2. **Syntax Validation**:
   ```bash
   node -c artifacts/api-server/demo-server.mjs
   node -c scripts/demo-server.mjs
   ```
3. **Dedicated Unit Test**:
   ```cmd
   cmd /c "set NODE_ENV=test&& node --test tests/b2b-housekeeping-m1.test.mjs"
   ```
   Confirms all 5 tests pass (B2B recognition, 3-day linen alert threshold, DND/guest request tracking, twin-server SHA-256 match).
