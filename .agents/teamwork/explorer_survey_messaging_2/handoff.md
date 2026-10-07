# Handoff Report: Survey Messaging Channels & Check-in URL Construction

**Agent:** `explorer_survey_messaging_2` (teamwork_preview_explorer)  
**Date:** 2026-10-07  
**Status:** Hard Handoff (Investigation Complete)  
**Working Directory:** `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_messaging_2`  
**Primary Deliverable:** `survey_messaging.md` in the working directory  

---

## 1. Observation

Direct observations from source inspection across the codebase:

1. **`artifacts/api-server/zapi-service.mjs` line 1395 & mirror `scripts/zapi-service.mjs` line 1395:**
   ```javascript
   const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
   ```
   Directly mapped into `tagsMap["{{link_checkin_digital}}"] = linkCheckinDigital` (line 1579) and embedded in multi-guest text `👉 ${linkCheckinDigital}` (line 1529).

2. **`artifacts/api-server/zapi-service.mjs` lines 1756, 1766, 1780, 1816–1828:**
   ```javascript
   const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
   ...
   list = list.filter(b => b.id !== "btn_chk" && (!b.url || !String(b.url).includes("/pre-checkin")));
   ...
   const existingChkIdx = list.findIndex(b => b.id === "btn_chk" || (b.url && String(b.url).includes("/pre-checkin")));
   const chkBtn = {
     id: "btn_chk",
     type: "URL",
     label: "📝 Fazer Check-in Online",
     url: linkCheckinDigital
   };
   ```

3. **`DEFAULT_WHATSAPP_TEMPLATES` in `zapi-service.mjs` (lines 155–841):**
   Templates using `{{link_checkin_digital}}` in text or action buttons include:
   - `tpl_new_reservation` (button `btn_chk`)
   - `tpl_new_reservation_direct` (button `btn_chk`)
   - `tpl_new_reservation_ota` (button `btn_chk`)
   - `tpl_pre_checkin_reminder` (button `btn_pre`, lines 460–482)
   - `tpl_checkin_day_instructions` (button `btn_chk`, lines 484–520)
   - `tpl_payment_confirmed` (button `btn_chk`, lines 757–800)
   - `tpl_sameday_reservation_instructions` (button `btn_chk`, lines 802–840)

4. **`artifacts/api-server/demo-server.mjs` lines 13780–13803 & mirror `scripts/demo-server.mjs`:**
   In `POST /api/pms/reservations/:id/resend-checkin-link`:
   ```javascript
   const baseUrl = `${req.protocol}://${req.get("host")}`;
   const preCheckinUrl = `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`;
   ...
   let buttons = [{ id: "btn_chk_digital", type: "URL", label: "📝 Preencher Check-in Digital", url: preCheckinUrl }];
   ```

5. **`artifacts/limpeza/src/pages/pms-calendar.tsx` lines 7353–7361, 7417, 7433:**
   ```typescript
   {
     id: "precheckin",
     title: "Pré Check-in Digital",
     url: `${origin}/pre-checkin/${resCode}`,
     ...
   }
   ...
   `📝 *Pré Check-in Digital:*\n${origin}/pre-checkin/${resCode}\n\n`
   ...
   const msg = `Olá ${guestName}, aqui está o link de ${title} para sua estadia no Flat ${flatNum} (Reserva #${resCode}):\n\n${url}`
   ```

6. **`artifacts/limpeza/src/components/reservation-hover-card.tsx` lines 196, 781–790:**
   ```typescript
   const preCheckinUrl = `${originUrl}/pre-checkin/${resItem.code || resItem.id}`
   ...
   <a href={preCheckinUrl} target="_blank" rel="noreferrer" ...>Check-in</a>
   ```

7. **`artifacts/limpeza/src/pages/reception-tablet.tsx` lines 772–777:**
   ```typescript
   const preCheckinUrl = `${window.location.origin}/pre-checkin/${item.code || item.id}?guest=${g.index || gIdx + 1}`
   const msg = encodeURIComponent(
     `Olá, ${g.name || 'Hóspede'}! 🏨\n\nPor favor, realize seu Check-in Digital para liberação da sua entrada no Apt ${item.flatNumber}:\n${preCheckinUrl}\n\nObrigado e boa estadia!`
   )
   ```

8. **`artifacts/limpeza/src/hooks/use-quick-messages.ts` lines 368, 409:**
   ```typescript
   const linkCheckin = `${origin}/pre-checkin/${resCode}`
   ...
   "{{link_checkin_digital}}": linkCheckin,
   ```

9. **Mirror Files Parity Constraint:**
   `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` are 1,164,206 bytes each.
   `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs` are 301,351 bytes each.
   `artifacts/api-server/mail-service.mjs` and `scripts/mail-service.mjs` are 44,419 bytes each.
   Project tests (`tests/future-reservation-email-rules.test.mjs:24-34`) explicitly assert byte-for-byte identity.

---

## 2. Logic Chain

1. From Observation 1 & 2, WhatsApp messages evaluate `linkCheckinDigital` as a hardcoded string `${appOrigin}/pre-checkin/${resCode}` at line 1395 and line 1756 of `zapi-service.mjs`.
2. From Observation 3, all standard WhatsApp dispatch templates (including `tpl_pre_checkin_reminder`, `tpl_new_reservation_direct`, `tpl_payment_confirmed`) reference `{{link_checkin_digital}}` or button `btn_chk`/`btn_pre`. When the queue scheduler runs (`scheduleUpcomingReservationTriggers:6443`), it calls `resolveWhatsAppTags` and `renderTemplateButtons`, baking this URL into `db.whatsappQueue`.
3. If `linkCheckinDigital` at line 1395 and line 1756 is redirected to `getCheckinUrl(reservation, 1, appOrigin, db)`, then whenever `db.settings.checkinProvider === 'gov_fnrh'` and `reservation.serproPrecheckinUrl` exists, both the message text and the action button URL will automatically receive the official Gov.br FNRH link (`https://fnrh.turismo.gov.br/precheckin/...`).
4. If Serpro has not yet responded or timed out, `getCheckinUrl` executes its resilient fallback to `${appOrigin}/pre-checkin/${resCode}?guest=1` without raising exceptions, and records a warning audit log.
5. In Observation 2, button filtering code currently checks `(!b.url || !String(b.url).includes("/pre-checkin"))`. If a Gov.br link is in `b.url`, this substring check would fail to recognize it as a checkin button. Therefore, button filtering must be updated to check button IDs (`btn_chk`, `btn_pre`, `btn_chk_digital`) and Gov.br URL domains.
6. From Observation 4, the reception resend endpoint (`POST /api/pms/reservations/:id/resend-checkin-link`) builds `preCheckinUrl` independently at line 13781. Refactoring line 13781 to call `getCheckinUrl(reservation, guestIndex, baseUrl, db)` unifies this route.
7. From Observations 5, 6, 7, and 8, UI components on the frontend (`pms-calendar.tsx`, `reservation-hover-card.tsx`, `reception-tablet.tsx`, and `use-quick-messages.ts`) build pre-checkin URLs on the client. Providing a matching frontend helper `getCheckinUrl(res, guestIndex, origin)` allows these components to copy and share the active URL (Gov.br or internal) seamlessly.
8. From Observation 9, any edits made to `artifacts/api-server/zapi-service.mjs` or `demo-server.mjs` must be duplicated byte-for-byte to `scripts/zapi-service.mjs` and `scripts/demo-server.mjs` to satisfy repo integrity constraints.

---

## 3. Caveats

1. **Guest Portal In-App Routing:**
   In `guest-portal.tsx`, buttons use `setLocation('/pre-checkin/:code')` (single-page app route). When Gov.br mode is active, opening an external URL cannot use `setLocation`; it must execute `window.open(serproPrecheckinUrl, '_blank')`.
2. **Serpro Async Registration Lifecycle:**
   When a reservation is created or selected, if the Serpro POST `/reservas` call is asynchronous, there may be a window where `reservation.serproPrecheckinUrl` is not yet saved. The fallback mechanism in `getCheckinUrl` handles this gracefully by serving the internal link, but worker agents should ensure Serpro registration is triggered as early as possible (e.g. upon reservation creation/confirmation).
3. **No Code Written to Source:**
   In compliance with the Explorer role instructions, no source code files or build commands were executed. All proposals and patterns are documented for the implementer agent.

---

## 4. Conclusion

All communication channels, dispatch triggers, templates, endpoints, and UI copy actions where check-in URLs are constructed have been identified, line-numbered, and analyzed.

The refactoring path is clear and low-risk:
1. Implement the centralized `getCheckinUrl(reservation, guestIndex, baseUrl, db)` helper in `demo-server.mjs` and export it.
2. In `zapi-service.mjs`, replace lines 1395 and 1756 with `getCheckinUrl`, update line 1528 for guest index 2, and widen button filtering to catch button IDs and Gov.br domains.
3. In `demo-server.mjs`, update the reception resend endpoint at line 13781 to use `getCheckinUrl`.
4. Mirror identical changes to `scripts/demo-server.mjs` and `scripts/zapi-service.mjs`.
5. Implement the frontend companion helper in `artifacts/limpeza/src/lib/checkin-url.ts` and apply to `pms-calendar.tsx`, `reservation-hover-card.tsx`, `reception-tablet.tsx`, and `use-quick-messages.ts`.

---

## 5. Verification Method

To verify the findings and subsequent implementation independently:

1. **Grep Search Verification:**
   Run ripgrep across the codebase:
   ```bash
   grep -n "linkCheckinDigital" artifacts/api-server/zapi-service.mjs
   grep -n "resend-checkin-link" artifacts/api-server/demo-server.mjs
   grep -n "precheckin" artifacts/limpeza/src/pages/pms-calendar.tsx
   ```
2. **File Diff Parity Check:**
   Verify byte parity between mirrors:
   ```bash
   node -e "const fs = require('fs'); const a = fs.readFileSync('artifacts/api-server/zapi-service.mjs'); const b = fs.readFileSync('scripts/zapi-service.mjs'); console.log('Parity:', a.equals(b));"
   ```
3. **Automated Unit & Integration Test:**
   Run the project test suite via:
   ```bash
   node --test tests/future-reservation-email-rules.test.mjs
   ```
   And run the dedicated new test file `tests/fnrh-checkin-toggle.test.mjs` once implemented.
