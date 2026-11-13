# Backend & Reconciliation Engine Survey Report
**Project**: Guest-Flow-Manager (CorpFlats)  
**Investigator**: Backend Engine Explorer (`explorer_survey_1`)  
**Date**: 2026-09-29  
**Target Files**: `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `data/database.json`, `server.mjs`

---

## 1. Executive Summary

An exhaustive investigation was conducted into the backend reconciliation logic, governance data flows, and state synchronization of the Guest-Flow-Manager platform. 

The investigation pinpointed the **exact root cause of the Clean-to-Dirty auto-reversion loop** that afflicted Flat 512 and other rooms:
1. Lines 1736–1753 of `reconcileUniversalIntegrity` in `artifacts/api-server/demo-server.mjs` (and its identical counterpart `scripts/demo-server.mjs`) contain a retroactive rule that forcibly flips any checkout cleaning from the past 7 days (`requestDate >= recentWindow`) back to `dirty` if `!c.assignedUserId && !c.completedAt` AND `c.adminNote.includes("Limpeza de check-out gerada automaticamente")`.
2. When administrators manually mark a flat as clean, the backend status patch route (`/api/cleaning/assignments/:requestId/status`) does NOT strip or overwrite `adminNote`, nor does it flag the record with a permanent administrative override tag (`markedByAdmin: true` or `source: "admin_manual"`).
3. If the admin user (user ID 1) marks the room clean without selecting a maid from the maid roster (users 2 or 3), or if `completedAt` is absent or stripped during hydration, the next invocation of `reconcileUniversalIntegrity` (which triggers automatically on every `GET /api/flats` and `GET /api/pms/calendar` request) unconditionally reverts the cleaning back to `dirty`.
4. Once reverted to `dirty`, the `getRequestsForDate()` engine flags the historical cleaning as an uncompleted carry-over (`isPendingFromPreviousDay: true`), forcing the flat to reappear on the housekeeping dashboard day after day indefinitely.
5. In addition, `reconcileCleaningRequests()` (lines 3391–3443) actively copy-pollutes clean deduplicated records with `other.adminNote`, propagating the trigger phrase into previously unpolluted records.

The report below provides the comprehensive code evidence, call traces, synchronization status between files, specific flat survey diagnostics (Flats 512, 904, 313, 511, 712), and the definitive architectural protection strategy.

---

## 2. Server Topology & Synchronization Analysis

### 2.1 File Relationship & Byte-Level Verification
The backend server implementation exists in two locations:
1. `artifacts/api-server/demo-server.mjs` (Primary path imported by `server.mjs`, `start-server.mjs`, and `artifacts/limpeza/run-vite.mjs`)
2. `scripts/demo-server.mjs` (Historical mirror copy kept in `scripts/`)

A binary git diff verification was performed:
```bash
git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
```
**Result**: Exactly 0 differences. Both files are 24,287 lines and 1,003,235 bytes, identical character-by-character.

### 2.2 Entry Points
- `server.mjs` (Lines 71–72):
  ```javascript
  const apiServerPath = path.resolve(__dirname, "./artifacts/api-server/demo-server.mjs");
  await import(pathToFileURL(apiServerPath).href);
  ```
- `start-server.mjs`:
  ```javascript
  import "./artifacts/api-server/demo-server.mjs";
  ```
- `artifacts/limpeza/run-vite.mjs`:
  ```javascript
  const apiServerPath = path.resolve(__dirname, "../api-server/demo-server.mjs");
  ```

**Critical Takeaway for Downstream Implementation**:
Even though `artifacts/api-server/demo-server.mjs` is the runtime target imported by Node.js, `scripts/demo-server.mjs` MUST be kept 100% in sync with every edit to prevent divergence during git merges or deployment scripts.

---

## 3. Deep Dive: Reconciliation & Integrity Functions

The server relies on several interconnected reconciliation and sanitization routines:

| Function | Lines in `demo-server.mjs` | Purpose & Behavior |
|---|---|---|
| `reconcileUniversalIntegrity(incomingState)` | 1433–1789 | Central integrity orchestrator. Merges PostgreSQL/JSON states, removes Flat 502, aligns reservations with flats, creates missing checkout cleanings, auto-reverts unverified cleanings, purges legacy instruction duplicates. |
| `reconcileCleaningRequests()` | 3391–3443 | Deduplicates cleanings per flat/date. Prioritizes `clean` over `dirty`, enriches guest details from duplicates onto clean records, saves to `db.cleaningRequests`. Called inside `saveDatabase()`. |
| `sanitizeAndRecoverCleanings()` | 800–1376 | Hardcodes historical September cleanings and 3 canonical cleanings (Flat 715 on 22/09, Flat 512 on 24/09, Flat 212 on 27/09). Runs during database hydration / boot. |
| `reconcileFromAuditLogs(db, pgPool)` | 1984–2415 | Scans `db.auditLogs` to reconstruct reservations, breakfast orders, and maid cleanings if lost from the main JSON/PG store. |
| `getRequestsForDate(dateStr, isNested)` | 5479–5890 | Generates the active housekeeping cards for a given date. Detects stayovers, past 7-day uncleaned checkouts, today's checkouts/checkins, and carries over uncleaned past requests as `isPendingFromPreviousDay: true`. |
| `sanitizeMaidUsers()` | 1797–1868 | Enforces user profiles, phone numbers, and PIX keys for Cris (ID 2) and Grazi (ID 3). |

### 3.1 Invocation Triggers of `reconcileUniversalIntegrity()`
`reconcileUniversalIntegrity` is NOT just a startup task. It is executed dynamically during runtime in multiple high-frequency endpoints:
1. **Database Hydration / Boot** (Lines 2423, 2562): When local JSON or PostgreSQL state is loaded.
2. **`GET /api/flats`** (Line 4972): Called whenever the frontend requests the flat list (on page loads, dashboard refreshes, and polling).
3. **`GET /api/pms/calendar`** (Line 8738): Called whenever the PMS calendar view is loaded or refreshed.
4. **`POST /api/pms/reservations/restore-sept` & `/api/system/restore-sept`** (Line 8525).
5. **`POST /api/pms/reservations/restore-all`** (Line 8719).
6. **`POST /api/pms/import-csv`** (Line 9982).

Because `GET /api/flats` and `GET /api/pms/calendar` call `reconcileUniversalIntegrity()` and immediately call `saveDatabase()` if it returns `true`, **any condition inside `reconcileUniversalIntegrity` that mutates state will execute within milliseconds of any user interaction in the application.**

---

## 4. The Clean-to-Dirty Auto-Reversion Loop: Forensic Trace

### 4.1 The Mechanism (Lines 1736–1753)
```javascript
  // Auto-correção: Se uma limpeza de checkout recente (últimos 7 dias) foi gerada automaticamente como "clean" 
  // sem ter sido realizada por nenhuma camareira (sem assignedUserId e sem completedAt, como o Flat 408 da Danielle), ela deve ser "dirty"!
  const recentWindow = typeof getOffsetDateStr === "function" ? getOffsetDateStr(-7) : "2026-09-20";
  (db.cleaningRequests || []).forEach(c => {
    if (
      c.source === "checkout" &&
      c.status === "clean" &&
      !c.assignedUserId &&
      !c.completedAt &&
      c.requestDate >= recentWindow &&
      c.adminNote && c.adminNote.includes("Limpeza de check-out gerada automaticamente")
    ) {
      c.status = "dirty";
      c.durationMinutes = null;
      changed = true;
      console.log(`[Universal Integrity] Corrigindo limpeza não realizada do Flat ${c.flatNumber} em ${c.requestDate} de clean para dirty`);
    }
  });
```

### 4.2 Why Flat 512 Fell Into the Loop
1. **Creation**: On 2026-09-24, guest Márcio Alexandre checked out (Reserva `RES-512-0203`). `reconcileUniversalIntegrity` (lines 1706–1729) created an automated checkout cleaning:
   - `flatNumber: "512"`
   - `requestDate: "2026-09-24"`
   - `source: "checkout"`
   - `status: "dirty"`
   - `assignedUserId: null`
   - `adminNote: "Limpeza de check-out gerada automaticamente para o Flat 512 (Reserva RES-512-0203)"`
2. **Admin Interaction**: An administrator or concierge confirmed the flat as clean (or marked it clean via the dashboard or PMS).
3. **Flawed Mutation**:
   - In `PATCH /api/cleaning/assignments/:requestId/status` (lines 6574–6587), `status` was set to `"clean"`.
   - However, the route did NOT change `source: "checkout"`, nor did it wipe or update `adminNote`.
   - If the admin was user ID 1 (not a maid in the maid roster) or if `assignedUserId` was not explicitly sent or remained null, AND `completedAt` was missing or null:
4. **Reversion Trigger**:
   - The user navigated to `/dashboard` or `/pms/calendar`.
   - The frontend called `GET /api/flats` or `GET /api/pms/calendar`.
   - `reconcileUniversalIntegrity()` fired.
   - For Flat 512 on 2026-09-24:
     - `c.source === "checkout"`: TRUE
     - `c.status === "clean"`: TRUE
     - `!c.assignedUserId`: TRUE (null or unmapped)
     - `!c.completedAt`: TRUE
     - `c.requestDate >= recentWindow` ("2026-09-24" >= "2026-09-22"): TRUE
     - `c.adminNote.includes("Limpeza de check-out gerada automaticamente")`: TRUE
   - Line 1748 executed: `c.status = "dirty"`.
5. **Dashboard Carry-Over Propagation**:
   - When `getRequestsForDate(todayStr)` executed:
     - Lines 5844–5883 inspected previous uncleaned records.
     - Because Flat 512's cleaning on 24/09 was flipped to `"dirty"`, `alreadyCleanedOnOrAfter` evaluated to `false`.
     - The engine flagged Flat 512 with `isPendingFromPreviousDay: true` and injected it into the dashboard on 25/09, 26/09, 27/09, 28/09, and 29/09.
6. **The Brittle Hotfix**:
   - In commit `d7b1c9e`, a hotfix was committed that hardcoded Flat 512 (ID 1241) into `canonicalCleanings` with `assignedUserId: 2`, `assignedUsername: "Cris"`, `completedAt: "2026-09-24T16:20:00.000Z"`, and `adminNote: null`.
   - While this exempted ID 1241 from the `adminNote.includes(...)` check, it did NOT fix the underlying vulnerability for any subsequent checkout or manual marking.

### 4.3 Copy-Pollution in `reconcileCleaningRequests()`
A secondary propagation vector was identified in `reconcileCleaningRequests()` at line 3420:
```javascript
if (!cleanItem.adminNote && other.adminNote) cleanItem.adminNote = other.adminNote;
```
If an admin created a clean entry without an admin note, and `reconcileCleaningRequests()` merged it with a duplicate automated dirty record, the clean record **inherited** the string `"Limpeza de check-out gerada automaticamente..."`, instantly arming it for reversion on the next integrity pass!

---

## 5. Architectural Strategy to Protect Admin Markings and Canonical Cleanings

To permanently eradicate the auto-reversion loop while respecting governance rules, the following multi-layer protection architecture is required:

### 5.1 Layer 1: Explicit Governance Metadata on Cleaning Records
Every cleaning record marked clean by an administrator or marked via manual record MUST carry explicit governance flags:
1. `markedByAdmin: true`
2. `source`: If marked manually or via admin modal, set or preserve as `"admin_manual"` or `"manual"`.
3. `completedAt`: When `status === "clean"`, `completedAt` MUST NEVER be null. If missing, default to `new Date().toISOString()`.
4. `adminNote`: When marked clean by an admin, if `adminNote` contains `"Limpeza de check-out gerada automaticamente"`, it MUST be cleaned to `null` or updated to `"Limpeza confirmada manualmente pelo administrador"`.

### 5.2 Layer 2: Hardened Guard in `reconcileUniversalIntegrity()`
The reversion check at lines 1736–1753 must be fortified with strict immunity guards:
```javascript
  (db.cleaningRequests || []).forEach(c => {
    // IMMUNITY GUARDS: Never revert admin markings, manual records, canonical cleanings, or records with completion timestamps
    if (
      c.markedByAdmin === true ||
      c.isCanonical === true ||
      c.source === "admin_manual" ||
      c.source === "manual" ||
      c.addedBy === "admin" ||
      Boolean(c.completedAt) ||
      Boolean(c.assignedUserId)
    ) {
      return;
    }

    if (
      c.source === "checkout" &&
      c.status === "clean" &&
      c.requestDate >= recentWindow &&
      c.adminNote && c.adminNote.includes("Limpeza de check-out gerada automaticamente")
    ) {
      c.status = "dirty";
      c.durationMinutes = null;
      changed = true;
      console.log(`[Universal Integrity] Corrigindo limpeza não realizada do Flat ${c.flatNumber} em ${c.requestDate} de clean para dirty`);
    }
  });
```

### 5.3 Layer 3: Eliminate Note Poisoning in `reconcileCleaningRequests()`
In `reconcileCleaningRequests()` (line 3420), do not inherit auto-generated notes:
```javascript
if (!cleanItem.adminNote && other.adminNote && !other.adminNote.includes("Limpeza de check-out gerada automaticamente")) {
  cleanItem.adminNote = other.adminNote;
}
```

### 5.4 Layer 4: Front-to-Back Status Patch Alignment
In `app.patch("/api/cleaning/assignments/:requestId/status")`:
When `status === "clean"`:
- Set `item.markedByAdmin = (userAuth?.role === "admin") || Boolean(markedByAdmin)`.
- If `userAuth?.role === "admin"` and `item.adminNote?.includes("Limpeza de check-out gerada automaticamente")`:
  - `item.adminNote = null;`
- Ensure `item.completedAt = customCompletedAt || item.completedAt || now;`.

---

## 6. Specific Flat Diagnostics & Findings

### 6.1 Flat 512
- **Issue 1**: Auto-reversion loop on 2026-09-24 (Márcio Alexandre checkout). Anchored in commit `d7b1c9e` with ID 1241 in `canonicalCleanings`. Status is now clean.
- **Issue 2**: Reservation `RES-712-0291` (Miller Mendonça Pessanha) was created on 2026-09-28 with `code: "RES-712-0291"`, but with `flatNumber: "512"` and `flatId: 12`!
  - Check-in: `2026-10-12`, Check-out: `2026-10-13`.
  - As a result, `reconcileUniversalIntegrity` generated cleaning request ID 1351 on 2026-10-13 for Flat 512!
  - **Resolution**: Reassign `RES-712-0291` to Flat 712 (`flatNumber: "712"`, `flatId: 14`), purge/reassign cleaning ID 1351 to Flat 712.

### 6.2 Flat 904
- **Issue**: Check-in on 2026-09-28, Check-out on 2026-09-29 (Guest Jorge, Reservation `RES-904-0297`).
- **Dashboard Trigger**: In `dashboard.tsx`, `getDefaultDate()` checks:
  ```typescript
  const now = new Date();
  if (now.getHours() >= 18) {
    // advances to tomorrow
  }
  ```
  After 18:00 on 28/09, the dashboard automatically shifted view to `2026-09-29`. Since Jorge's checkout is scheduled for 29/09, the card for Jorge appeared under 29/09 departures. However, without a distinct visual banner indicating that the dashboard was previewing "Tomorrow's Schedule", operators interpreted Jorge's checkout as a retrospective or misplaced card.
- **Backend Role**: In `getRequestsForDate("2026-09-29")`, Jorge correctly appears as checkout on 2026-09-29. The backend logic is accurate; the fix requires frontend date-badge clarity or preventing 18:00 auto-switch if active work remains for today.

### 6.3 Flat 313
- **Issue**: Cleaning request ID 1358 was automatically generated for 2026-09-25 (`requestDate: "2026-09-25"`) for Leonardo Primo de Sousa (Reserva `RES-313-0267`), with `status: "dirty"`.
- However, guest Felipe checked in on 2026-09-26 and only departs on 2026-10-02 (Reserva `RES-313-0301`).
- On 2026-09-26, cleaning ID 1336 was added manually with `status: "clean"`.
- Because ID 1358 remained `dirty` with `requestDate: "2026-09-25"`, it was carried over continuously as a pending cleaning from previous days (`isPendingFromPreviousDay: true`).
- **Resolution**: Scribe ID 1358 to `status: "clean"` or purge the ghost checkout, ensuring Felipe's stayover is respected until 02/10.

### 6.4 Flat 511
- **Issue**: A manual entry ID 1338 was created on 2026-09-28 via script `scripts/apply_maid_cleanings_dia26.mjs`:
  ```json
  {
    "id": 1338,
    "flatNumber": "511",
    "requestDate": "2026-09-26",
    "status": "clean",
    "assignedUserId": 3,
    "assignedUsername": "Grazi",
    "adminNote": "Limpeza realizada por Grazi"
  }
  ```
- **Audit Log Evidence**: In `db.auditLogs`, entry ID `2451` on 2026-09-27T17:09:09.533Z explicitly records:
  ```json
  {
    "action": "CLEANING_RECORD_ADDED_BY_ADMIN",
    "details": {
      "requestId": 1324,
      "flatNumber": "511",
      "requestDate": "2026-09-26",
      "assignedMaidName": "Cris"
    }
  }
  ```
  Grazi was NOT working on Saturday 2026-09-26; Cris was the assigned and active maid. Script `apply_maid_cleanings_dia26.mjs` mistakenly credited Grazi with Flat 511 (and created statement entry `stmt_3_1338_20260926`).
- **Resolution**: Correct ID 1338 / ID 1324: assign to Cris (ID 2), remove wrongful credit of R$ 23,25 from Grazi's statement, and reattribute to Cris.

---

## 7. Testing & Verification Infrastructure

### 7.1 Existing Test Files
- `scratch/test_dates.mjs`: A lightweight test harness extracting `getRequestsForDate` and evaluating output for dates `2026-09-28` and `2026-09-29`.
- `scratch/fix_rpm_res296.mjs`, `scratch/check_logs.mjs`, etc.: One-off forensic and verification scripts.
- No Jest or Vitest dependencies are configured in the root `package.json`.

### 7.2 Native Test Execution Method
The system runs Node.js `v20.10.0`. Node v20 features a built-in test runner (`node --test`).
Backend verification can be executed natively without extra dependencies:
```bash
node --test tests/integrity-reconciliation.test.mjs
```
Or directly executing verification scripts with Node:
```bash
node scratch/test_dates.mjs
```

### 7.3 Typecheck and Frontend Build
- Frontend build: `npm --prefix artifacts/limpeza run build` (outputs to `artifacts/limpeza/dist`)
- Scripts typecheck: `npm --prefix scripts run typecheck`
- Root build: `npm run build`

---

## 8. Implementation Checklist for Subsequent Phases

1. [ ] **Dual-Server Synchronization**: Ensure any edits to `reconcileUniversalIntegrity` or helper functions are applied identically to BOTH `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
2. [ ] **Fortify Auto-Reversion Rule**: Add guards for `markedByAdmin`, `source === "admin_manual"`, `isCanonical`, and non-null `completedAt` to lines 1736–1753.
3. [ ] **Sanitize Admin Status Patch**: In `/api/cleaning/assignments/:requestId/status`, clear auto-generated admin notes when status changes to `clean`, populate `completedAt`, and persist `markedByAdmin: true`.
4. [ ] **Neutralize Note Pollution**: In `reconcileCleaningRequests()` (line 3420), avoid copying auto-generated notes into clean records.
5. [ ] **Fix Data Inconsistencies in `data/database.json`**:
   - Reassign `RES-712-0291` from Flat 512 to Flat 712; delete/move cleaning 1351.
   - Sanitize Flat 313: mark/purge ID 1358 so it does not drag as a pending cleaning.
   - Sanitize Flat 511: correct 26/09 maid assignment from Grazi to Cris and adjust statement entries.
6. [ ] **Audit All 19 Flats**: Run universal audit on all flats to ensure zero unhandled checkouts or orphan cleanings.
7. [ ] **Verification**: Run `node scratch/test_dates.mjs`, typecheck, build `artifacts/limpeza`, verify git status, commit, and `git push`.
