# Survey & Architectural Analysis: Messaging Channels, Templates, and Check-in URL Construction

**Author:** Explorer Survey Messaging (`teamwork_preview_explorer`)  
**Date:** 2026-10-07  
**Working Directory:** `.agents/teamwork/explorer_survey_messaging_2/`  
**Target Milestone:** Gov.br (FNRH Digital Serpro v2.4.2) & CorpFlats Check-in Selector Toggle

---

## 1. Executive Summary

This investigation conducted a comprehensive survey across all backend services, dispatch triggers, template engines, mailers, and frontend UI components in **Guest-Flow-Manager (CorpFlats)** where check-in URLs are constructed, formatted, rendered, copied, or dispatched.

Currently, check-in URLs are constructed in an ad-hoc manner in multiple disjoint locations using hardcoded template literals of the shape:
`${baseUrl}/pre-checkin/${reservation.code}?guest=${guestIndex || 1}` or `https://corpflats.onrender.com/pre-checkin/${code}`.

To support the dynamic check-in selector (`checkinProvider: 'proprio' | 'gov_fnrh'`) with intelligent fallback to internal check-in upon Serpro latency/downtime, every call site must be unified under the centralized helper function:
```javascript
getCheckinUrl(reservation, guestIndex = 1, baseUrl = "")
```

### Critical Architecture & Repository Constraints Identified
1. **Mirror File Synchronization Obligation:**  
   Every backend file modified in `artifacts/api-server/` (`demo-server.mjs`, `zapi-service.mjs`, `mail-service.mjs`, `whatsapp-ai-service.mjs`) has a mandatory twin mirror in `scripts/` (`scripts/demo-server.mjs`, `scripts/zapi-service.mjs`, `scripts/mail-service.mjs`, `scripts/whatsapp-ai-service.mjs`). These twin files must remain **100% byte-for-byte identical**. Tests explicitly assert `s1.equals(s2) === true`.
2. **Dual-Layer Tag Resolution:**  
   In WhatsApp messaging, template tags like `{{link_checkin_digital}}` are evaluated in both message text (`renderTemplateMessage` -> `resolveWhatsAppTags`) and action buttons (`buildTemplateActionButtons` -> `renderTemplateButtons`).
3. **Button Filtering Pattern:**  
   Existing button exclusion/deduplication logic filters check-in buttons using `(!b.url || !String(b.url).includes("/pre-checkin"))`. When Gov.br URLs (`https://fnrh.turismo.gov.br/precheckin/...`) are injected, string matchers checking only `/pre-checkin` with hyphen would fail unless updated to match button IDs (`btn_chk`, `btn_pre`, `btn_chk_digital`) or Gov.br URL domains (`turismo.gov.br`).

---

## 2. Master Inventory Table: All Check-in URL Construction Call Sites

| # | File Path | Line(s) | Channel / Scope | Current URL Construction Pattern | Context Available at Site | Refactoring Target |
|---|-----------|---------|-----------------|-----------------------------------|----------------------------|--------------------|
| 1 | `artifacts/api-server/zapi-service.mjs` (& `scripts/`) | 1395 | WhatsApp Template Engine (`resolveWhatsAppTags`) | `const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;` | `reservation`, `resCode`, `appOrigin` (baseUrl), `db` | `const linkCheckinDigital = getCheckinUrl(reservation, 1, appOrigin, db);` |
| 2 | `artifacts/api-server/zapi-service.mjs` (& `scripts/`) | 1529 | WhatsApp Multi-guest Pending Message | Text template embeds `👉 ${linkCheckinDigital}` for 2nd guest | `reservation`, `guest`, `linkCheckinDigital` | For guest 2: `getCheckinUrl(reservation, 2, appOrigin, db)` |
| 3 | `artifacts/api-server/zapi-service.mjs` (& `scripts/`) | 1579 | WhatsApp Tag Map (`tagsMap`) | `"{{link_checkin_digital}}": linkCheckinDigital` | `linkCheckinDigital` | Mapped from unified variable above |
| 4 | `artifacts/api-server/zapi-service.mjs` (& `scripts/`) | 1756 | WhatsApp Action Buttons (`buildTemplateActionButtons`) | `const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;` | `template`, `reservation`, `triggerEvent`, `appOrigin`, `db` | `const linkCheckinDigital = getCheckinUrl(reservation, 1, appOrigin, db);` |
| 5 | `artifacts/api-server/zapi-service.mjs` (& `scripts/`) | 1766, 1780, 1816 | WhatsApp Action Buttons (Filtering & Insertion) | `list.filter(b => b.id !== "btn_chk" && (!b.url \|\| !String(b.url).includes("/pre-checkin")))` | Button object `b`, `linkCheckinDigital` | Update predicate to check `b.id === "btn_chk" \|\| b.id === "btn_pre" \|\| b.id === "btn_chk_digital" \|\| (b.url && (b.url.includes("/pre-checkin") \|\| b.url.includes("turismo.gov.br")))` |
| 6 | `artifacts/api-server/zapi-service.mjs` (& `scripts/`) | 1821 | WhatsApp Action Buttons (`chkBtn.url`) | `url: linkCheckinDigital` | `linkCheckinDigital` | Already uses `linkCheckinDigital` |
| 7 | `artifacts/api-server/demo-server.mjs` (& `scripts/`) | 13781, 13790, 13798, 13803 | Reception Resend Check-in Endpoint (`POST /api/pms/reservations/:id/resend-checkin-link`) | `const preCheckinUrl = `${baseUrl}/pre-checkin/${reservation.code \|\| reservation.id}?guest=${guestIndex \|\| 1}`;` | `reservation`, `guestIndex`, `baseUrl`, `req`, `db` | `const preCheckinUrl = getCheckinUrl(reservation, Number(guestIndex) \|\| 1, baseUrl, db);` |
| 8 | `artifacts/api-server/whatsapp-ai-service.mjs` (& `scripts/`) | 234-245, 287-295 | WhatsApp AI Service (Sofia / Heuristic Context) | Context string currently lacks checkin URL; Heuristic prompt advises check-in without URL | `db`, `cleanPhone`, `matchedReservation`, `guestContext` | In `buildGuestContext`, expose `checkinUrl: matchedReservation ? getCheckinUrl(matchedReservation, 1, baseUrl, db) : null`; include in Sofia's prompt and heuristic reply |
| 9 | `artifacts/limpeza/src/hooks/use-quick-messages.ts` | 368, 409 | Frontend Quick Messages Hook (`renderQuickMessage`) | `const linkCheckin = `${origin}/pre-checkin/${resCode}`` | `resItem` (reservation), `resCode`, `origin` | `const linkCheckin = getCheckinUrlFrontend(resItem, 1, origin)` (or read `resItem.serproPrecheckinUrl` / `resItem.link_precheckin` if Gov.br) |
| 10 | `artifacts/limpeza/src/pages/pms-calendar.tsx` | 7355, 7417, 7433 | PMS Calendar (Links Modal, Copy Single, Copy All, Send WA) | `url: `${origin}/pre-checkin/${resCode}`` and formatted text `📝 *Pré Check-in Digital:*\n${origin}/pre-checkin/${resCode}\n\n` | `selectedRes` / `item`, `resCode`, `guestName`, `flatNum`, `origin`, `waPhone` | Use `getCheckinUrlFrontend(selectedRes, 1, origin)` for item URL, formatted text copy, and WhatsApp redirect |
| 11 | `artifacts/limpeza/src/components/reservation-hover-card.tsx` | 196, 782 | Calendar Reservation Hover Card ("Check-in" button) | `const preCheckinUrl = `${originUrl}/pre-checkin/${resItem.code \|\| resItem.id}`` | `resItem`, `originUrl` | `const preCheckinUrl = getCheckinUrlFrontend(resItem, 1, originUrl)` |
| 12 | `artifacts/limpeza/src/pages/reception-tablet.tsx` | 772-777 | Reception Tablet (Pending Guest List WhatsApp button) | `const preCheckinUrl = `${window.location.origin}/pre-checkin/${item.code \|\| item.id}?guest=${g.index \|\| gIdx + 1}`` | `item` (reservation), `g` (guest), `g.index`, `window.location.origin` | `const preCheckinUrl = getCheckinUrlFrontend(item, g.index \|\| gIdx + 1, window.location.origin)` |
| 13 | `artifacts/limpeza/src/pages/guest-portal.tsx` | 1287, 1363, 1393, 1612, 1643, 1652 | Guest Portal (`/minha-reserva/:code`) Check-in Buttons | `onClick={() => setLocation(`/pre-checkin/${code \|\| reservation.code}`)}` | `reservation`, `code`, `data?.checkinProvider`, `data?.serproPrecheckinUrl` | If Gov.br mode active and `serproPrecheckinUrl` present: `window.open(data.serproPrecheckinUrl, '_blank')`, otherwise internal `setLocation` |
| 14 | `artifacts/limpeza/src/components/booking-funnel-modal.tsx` | 2013 | Booking Engine Direct Checkout Modal ("Acessar Pré Check-in Digital") | `window.open(`/pre-checkin/${resCode}`, "_blank")` | `confirmedReservation`, `resCode` | If `confirmedReservation.serproPrecheckinUrl` present and Gov.br active: open Gov.br URL, else internal |
| 15 | `artifacts/limpeza/src/pages/whatsapp-chat.tsx` | 607 | Live Operator WhatsApp Chat Snippet (`case 'checkin'`) | `📝 https://corpflats.onrender.com/pre-checkin/${code}` | `activeContact`, `code`, `flatNum`, `guestFirstName`, `activeReservation` | If `activeReservation` is bound, resolve dynamic link; fallback to origin |
| 16 | `artifacts/limpeza/src/pages/crm-guests.tsx` | 430 | CRM Guests List Manual WhatsApp ("welcome") | `msg = `... https://corpflats.onrender.com/pre-checkin`` | `guest`, `firstName` | Generic portal entrance link or dynamic if reservation attached |
| 17 | `artifacts/api-server/demo-server.mjs` (& `scripts/`) | 17606 | Internal Pre-checkin Token Generation (`signature-token`) | `const signatureUrl = `${originHeader}/pre-checkin/${r.code \|\| code}?token=${token}&guest=${guestIndex}`;` | `r` (reservation), `token`, `guestIndex`, `originHeader` | Retain as internal signing token URL (specific to CorpFlats self-hosted checkin flow) |

---

## 3. Deep-Dive: WhatsApp Dispatch Routes, Triggers & Templates

### 3.1 Architecture of Z-API WhatsApp Engine
In `artifacts/api-server/zapi-service.mjs`, all outbound WhatsApp communications flow through three main pathways:
1. **Immediate Event Triggers** (`triggerImmediateWhatsApp`):  
   Invoked synchronously upon reservation lifecycle events (e.g., `reservation_created`, `payment_confirmed`, `sameday_reservation`, `reservation_updated`, `checkout_completed`).
2. **Scheduled Cron / Queue Engine** (`scheduleUpcomingReservationTriggers` & queue execution loop):  
   Every 30 seconds, the engine scans active reservations. For events scheduled with offsets (e.g., `tpl_pre_checkin_reminder` scheduled 24 hours prior to check-in, or `tpl_checkin_day_instructions` at 07:00 on arrival day), it renders the template message and action buttons, queuing them in `db.whatsappQueue`.
3. **Manual Reception Dispatches** (`POST /api/pms/reservations/:id/resend-checkin-link` in `demo-server.mjs`):  
   Operator clicks "Reenviar Link de Check-in" in the PMS or reception dashboard.

### 3.2 Exact Code Inspection in `zapi-service.mjs`

#### A. Template Text Rendering (`resolveWhatsAppTags` -> `renderTemplateMessage`)
Lines 1386–1395:
```javascript
// URL Base pública do sistema (prioriza domínio de produção ou host)
const appOrigin = baseUrl || "https://corpflats.onrender.com";
...
// Links inteligentes com autenticação por código de reserva
const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
```
Line 1528–1530 (multi-guest pending reminder):
```javascript
if (isMultiGuest && firstGuestDone) {
  mensagemPendenciaHospedes = `Recebemos com sucesso a ficha de Check-in Digital do(a) *${guest.firstName || guest.name}*, porém ainda está pendente o cadastro do *2º hóspede* para autorização na portaria.\n\nPor favor, repasse este link ao segundo acompanhante para preenchimento:\n👉 ${linkCheckinDigital}\n\n💡 _Caso vá viajar sozinho(a), basta confirmar em seu portal ou responder por aqui para atualizarmos sua reserva para 1 hóspede sem pendências._`;
}
```
Line 1579 (tag dictionary mapping):
```javascript
"{{link_checkin_digital}}": linkCheckinDigital,
```

#### B. Template Action Buttons (`buildTemplateActionButtons`)
Lines 1755–1757:
```javascript
const linkPortalHospede = `${appOrigin}/minha-reserva/${resCode}`;
const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
const linkAutocheckin = `${appOrigin}/api/pms/guest-portal/${resCode}/self-checkin`;
```
Lines 1815–1828 (inserting check-in button when pre-checkin is pending):
```javascript
if (isArrivalOrCheckinTemplate) {
  const existingChkIdx = list.findIndex(b => b.id === "btn_chk" || (b.url && String(b.url).includes("/pre-checkin")));
  const chkBtn = {
    id: "btn_chk",
    type: "URL",
    label: "📝 Fazer Check-in Online",
    url: linkCheckinDigital
  };
  if (existingChkIdx >= 0) {
    list[existingChkIdx] = chkBtn;
  } else {
    list.unshift(chkBtn);
  }
}
```

#### C. All Default WhatsApp Templates Using `{{link_checkin_digital}}`
In `DEFAULT_WHATSAPP_TEMPLATES` (`zapi-service.mjs`):
1. **`tpl_new_reservation`** (line 194):
   - Button `btn_chk`: `{ id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" }`
2. **`tpl_new_reservation_direct`** (line 234):
   - Text: `Para agilizar sua entrada na portaria, realize com antecedência o seu *Pré-Check-in Digital* pelo botão abaixo:`
   - Button `btn_chk`: `{ id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" }`
3. **`tpl_new_reservation_ota`** (line 282):
   - Text: `Para agilizar a liberação da portaria sem burocracia, realize seu *Pré-Check-in Digital* com antecedência:`
   - Button `btn_chk`: `{ id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" }`
4. **`tpl_payment_confirmed`** (line 757):
   - Text: `Para agilizar sua entrada na portaria na chegada, realize com antecedência o seu *Pré-Check-in Digital*:`
   - Button `btn_chk`: `{ id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" }`
5. **`tpl_sameday_reservation_instructions`** (line 802):
   - Button `btn_chk`: `{ id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" }`
6. **`tpl_pre_checkin_reminder`** (line 460) — **Crucial Trigger**:
   - Trigger: `pre_checkin_reminder`, 24 hours before check-in
   - Text: `{{mensagem_pendencia_hospedes}}\n\nPara que a portaria libere sua entrada com agilidade na chegada, acesse o link seguro:`
   - Button `btn_pre`: `{ id: "btn_pre", type: "URL", label: "📝 Ficha Digital de Check-in", url: "{{link_checkin_digital}}" }`
7. **`tpl_checkin_day_instructions`** (line 484):
   - Trigger: `checkin_day_instructions`, 07:00 on arrival day
   - Button `btn_chk`: `{ id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" }`

#### D. Quick Messages in `DEFAULT_WHATSAPP_QUICK_MESSAGES` (`zapi-service.mjs`):
1. **`qm_payment_confirmed`** (line 870):
   - Message embeds: `{{link_checkin_digital}}`
   - Button `btn_chk`: `{ url: "{{link_checkin_digital}}" }`
2. **`qm_summary_checkin`** (line 891):
   - Message embeds: `{{link_checkin_digital}}`
   - Button `btn_chk`: `{ url: "{{link_checkin_digital}}" }`

### 3.3 Reception WhatsApp Endpoint in `demo-server.mjs`
At lines 13754–13815:
```javascript
app.post(["/api/pms/reservations/:id/resend-checkin-link", "/api/reception/reservations/:id/resend-checkin-link"], async (req, res) => {
  ...
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const preCheckinUrl = `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`;

  const template = (db.whatsappTemplates || []).find(t => t.id === "tpl_pre_checkin_reminder");
  let msgText = "";
  let buttons = [
    {
      id: "btn_chk_digital",
      type: "URL",
      label: "📝 Preencher Check-in Digital",
      url: preCheckinUrl
    }
  ];
  ...
```
**Refactoring need:** Line 13781 must be replaced with `const preCheckinUrl = getCheckinUrl(reservation, guestIndex, baseUrl, db);`.

---

## 4. Deep-Dive: Email Dispatch Routes, Templates & Mailer Services

### 4.1 Current Email Architecture in `artifacts/api-server/mail-service.mjs`
The email system currently focuses on internal notifications to the building administration (`receptionEmail`) and condominium garage (`garageEmail`):
1. **`renderCheckinConfirmedEmail`** (`mail-service.mjs:238-380`):
   - Dispatched to `receptionEmail` (and CC `garageEmail`) on same-day check-in, 07:00 morning check-in routine, or when a guest completes their pre-checkin.
   - Includes full stay overview, authorized guest list, vehicle details, and link to the terminal (`https://corpflats.onrender.com/portaria`).
   - Line 310–318 handles the 2-guest alert (`⚠️ ATENÇÃO PORTARIA: RESERVA PARA X HÓSPEDES`).
2. **`renderReservationUpdateEmail`** (`mail-service.mjs:399-470`):
   - Dispatched to reception when reservation dates, rooms, or status change.
3. **`renderManualEmail`** (`mail-service.mjs:473-500`):
   - Renders custom messages typed by the receptionist in `email-hub.tsx` or `reservation-detail`.
4. **`renderGarageAuthorizationEmail`** (`mail-service.mjs:503-550`):
   - Dedicated vehicle authorization dispatched to `garageEmail`.

### 4.2 Guest Email Notifications & OTP
1. **WhatsApp / Email 2FA OTP (`demo-server.mjs:17619-17758`)**:
   - `POST /api/pms/pre-checkin/:code/whatsapp-otp` can send an email OTP to `targetEmail` with subject `Código de Confirmação: ${otpCode} - Flat ${flatNumber}`.
2. **FNRH Pre-checkin Completed Dispatch (`demo-server.mjs:18195-18225`)**:
   - `POST /api/pms/pre-checkin`: When guest submits the form, attaches the generated `FNRH_<code_name>.pdf` and sends `renderCheckinConfirmedEmail` to reception.

### 4.3 Guest Confirmation & Pre-Checkin Email Templates Blueprint
If email notifications directly to guests are enabled or introduced (or via `renderManualEmail`), they must embed the resolved check-in link using:
```javascript
const checkinLink = getCheckinUrl(reservation, 1, baseUrl, db);
```
In email HTML, CTA buttons should display:
- Label: `📝 Realizar Pré Check-in Digital` (or `🇧🇷 Fazer Check-in Oficial Gov.br (FNRH)` when `checkinProvider === 'gov_fnrh'`)
- HREF: `${checkinLink}`

---

## 5. Deep-Dive: Admin & Portals Endpoints, Copy/Share UI Components

### 5.1 PMS Calendar (`artifacts/limpeza/src/pages/pms-calendar.tsx`)
In `pms-calendar.tsx`, lines 7345–7435 manage the **"Links Rápidos da Reserva"** modal:
- **Pre-checkin link item (line 7352-7361):**
  ```typescript
  {
    id: "precheckin",
    title: "Pré Check-in Digital",
    url: `${origin}/pre-checkin/${resCode}`,
    desc: "Formulário para o hóspede preencher os dados dos acompanhantes, fotos de documentos e assinatura antecipada.",
    icon: FileText,
    badge: "Entrada Ágil", ...
  }
  ```
- **"Copiar Todos os Links" (line 7417):**
  ```typescript
  `📝 *Pré Check-in Digital:*\n${origin}/pre-checkin/${resCode}\n\n`
  ```
- **"Enviar WhatsApp" (line 7431-7435):**
  ```typescript
  const msg = `Olá ${guestName}, aqui está o link de ${title} para sua estadia no Flat ${flatNum} (Reserva #${resCode}):\n\n${url}`
  ```
**Refactoring specification:**
Replace line 7355 and 7417 with a frontend helper:
`const checkinUrl = getCheckinUrl(selectedRes, 1, origin)`
If Gov.br mode is active and `selectedRes.serproPrecheckinUrl` is available, copy/send the official Gov.br link.

### 5.2 Calendar Reservation Hover Card (`artifacts/limpeza/src/components/reservation-hover-card.tsx`)
Lines 196 and 781–790:
```typescript
const preCheckinUrl = `${originUrl}/pre-checkin/${resItem.code || resItem.id}`
...
<a
  href={preCheckinUrl}
  target="_blank"
  rel="noreferrer"
  className="..."
  title="Abrir Link de Pré-Check-in Digital"
>
  <FileText className="w-3 h-3 text-indigo-600" />
  <span>Check-in</span>
</a>
```
**Refactoring specification:**
Resolve `preCheckinUrl` using `getCheckinUrl(resItem, 1, originUrl)`.

### 5.3 Reception Tablet (`artifacts/limpeza/src/pages/reception-tablet.tsx`)
Lines 771–778 (WhatsApp button per guest):
```typescript
onClick={() => {
  const preCheckinUrl = `${window.location.origin}/pre-checkin/${item.code || item.id}?guest=${g.index || gIdx + 1}`
  const phone = (g.phone || item.guestPhone || "").replace(/\D/g, "")
  const msg = encodeURIComponent(
    `Olá, ${g.name || 'Hóspede'}! 🏨\n\nPor favor, realize seu Check-in Digital para liberação da sua entrada no Apt ${item.flatNumber}:\n${preCheckinUrl}\n\nObrigado e boa estadia!`
  )
  window.open(phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank")
}}
```
**Refactoring specification:**
Use `getCheckinUrl(item, g.index || gIdx + 1, window.location.origin)`.

### 5.4 Guest Portal (`artifacts/limpeza/src/pages/guest-portal.tsx`)
In `guest-portal.tsx`, multiple buttons (lines 1287, 1363, 1393, 1612, 1643, 1652) navigate to `/pre-checkin/:code`:
```typescript
onClick={() => setLocation(`/pre-checkin/${code || reservation.code}`)}
```
**Refactoring specification:**
When `checkinProvider === 'gov_fnrh'` and `serproPrecheckinUrl` is populated on the reservation, clicking should open `serproPrecheckinUrl` in a new tab (`window.open(serproPrecheckinUrl, '_blank')`) or redirect if on mobile. When in `'proprio'` mode (or fallback), keep the existing internal navigation.

### 5.5 Booking Funnel (`artifacts/limpeza/src/components/booking-funnel-modal.tsx`)
Line 2013:
```typescript
onClick={() => {
  const resCode = confirmedReservation.code || confirmedReservation.reservationCode || confirmedReservation.id;
  window.open(`/pre-checkin/${resCode}`, "_blank");
}}
```
**Refactoring specification:**
Check `confirmedReservation.serproPrecheckinUrl`; if Gov.br active and available, open the Gov.br link; otherwise open `/pre-checkin/${resCode}`.

---

## 6. Centralized `getCheckinUrl` Specification & Refactoring Blueprint

### 6.1 Backend Implementation Specification
Define in `artifacts/api-server/demo-server.mjs` (and twin in `scripts/demo-server.mjs`), exported for use in `zapi-service.mjs` and other services:

```javascript
/**
 * Resolves the dynamic check-in URL based on system settings and Serpro availability.
 * Fallback to CorpFlats internal check-in is applied automatically and logged if Gov.br is unavailable.
 *
 * @param {Object} reservation - The reservation object (must contain code or id)
 * @param {number} [guestIndex=1] - Guest sequence number (1, 2, ...)
 * @param {string} [baseUrl=""] - Base origin URL (e.g. "https://corpflats.onrender.com")
 * @param {Object} [dbRef=null] - Database instance (falls back to global db)
 * @returns {string} - The resolved check-in URL
 */
export function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbRef = null) {
  const activeDb = dbRef || (typeof db !== "undefined" ? db : null);
  const provider = activeDb?.settings?.checkinProvider || "proprio";
  const origin = baseUrl || (activeDb?.settings?.baseUrl) || "https://corpflats.onrender.com";
  const resCode = reservation?.code || reservation?.id || "reserva";
  const internalUrl = `${origin}/pre-checkin/${resCode}?guest=${guestIndex || 1}`;

  if (provider === "gov_fnrh") {
    const govUrl = reservation?.serproPrecheckinUrl || reservation?.link_precheckin;
    if (govUrl && typeof govUrl === "string" && govUrl.startsWith("http")) {
      return govUrl;
    }

    // Intelligent Fallback with Audit Logging
    console.warn(`[CheckinResolver ⚠️] Gov.br ativo mas link Serpro ausente para reserva ${resCode}. Aplicando fallback para check-in próprio.`);
    if (activeDb && typeof logAuditEvent === "function") {
      logAuditEvent({
        level: "warning",
        category: "fnrh_serpro",
        action: "FNRH_CHECKIN_URL_FALLBACK",
        details: {
          reservationCode: resCode,
          provider: "gov_fnrh",
          reason: "serpro_url_missing_or_failed",
          fallbackUrl: internalUrl
        }
      }).catch?.(() => {});
    }
    return internalUrl;
  }

  return internalUrl;
}
```

### 6.2 Frontend Helper Specification
Create in `artifacts/limpeza/src/lib/checkin-url.ts` (or co-located in `hooks/use-quick-messages.ts`):

```typescript
export function getCheckinUrl(
  reservation: any, 
  guestIndex: number = 1, 
  baseUrl?: string,
  settingsProvider?: string
): string {
  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com");
  const resCode = reservation?.code || reservation?.id || "";
  const internalUrl = `${origin}/pre-checkin/${resCode}?guest=${guestIndex || 1}`;

  const isGov = (settingsProvider === "gov_fnrh") || (reservation?.checkinProvider === "gov_fnrh");
  const govUrl = reservation?.serproPrecheckinUrl || reservation?.link_precheckin;

  if (isGov && govUrl && typeof govUrl === "string" && govUrl.startsWith("http")) {
    return govUrl;
  }

  return internalUrl;
}
```

### 6.3 Refactoring Plan for `zapi-service.mjs`
1. **Import `getCheckinUrl`**:
   Import from `./demo-server.mjs`.
2. **`renderTemplateMessage` (line 1395)**:
   ```javascript
   // BEFORE:
   const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;

   // AFTER:
   const linkCheckinDigital = getCheckinUrl(reservation, 1, appOrigin, db);
   ```
3. **`mensagemPendenciaHospedes` (line 1528)**:
   ```javascript
   // For the 2nd guest:
   const linkCheckinGuest2 = getCheckinUrl(reservation, 2, appOrigin, db);
   mensagemPendenciaHospedes = `Recebemos com sucesso a ficha de Check-in Digital do(a) *${guest.firstName || guest.name}*, porém ainda está pendente o cadastro do *2º hóspede* para autorização na portaria.\n\nPor favor, repasse este link ao segundo acompanhante para preenchimento:\n👉 ${linkCheckinGuest2}\n\n💡 _Caso vá viajar sozinho(a), basta confirmar em seu portal ou responder por aqui para atualizarmos sua reserva para 1 hóspede sem pendências._`;
   ```
4. **`buildTemplateActionButtons` (line 1756 & 1766/1780/1816)**:
   ```javascript
   // BEFORE:
   const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
   ...
   list = list.filter(b => b.id !== "btn_chk" && (!b.url || !String(b.url).includes("/pre-checkin")));

   // AFTER:
   const linkCheckinDigital = getCheckinUrl(reservation, 1, appOrigin, db);
   ...
   const isCheckinBtn = b => b.id === "btn_chk" || b.id === "btn_pre" || b.id === "btn_chk_digital" || 
     (b.url && (String(b.url).includes("/pre-checkin") || String(b.url).includes("turismo.gov.br")));
   list = list.filter(b => !isCheckinBtn(b));
   ```
5. **Exact byte-for-byte copy to `scripts/zapi-service.mjs`**.

---

## 7. Verification & Testing Matrix

To ensure full confidence during and after implementation:

| Test Scenario | Verification Target | Expected Behavior |
|---------------|---------------------|-------------------|
| **Mode: 'proprio'** | `getCheckinUrl(res, 1, origin)` | Returns `${origin}/pre-checkin/${res.code}?guest=1` |
| **Mode: 'gov_fnrh' (Success)** | `getCheckinUrl(res, 1, origin)` where `res.serproPrecheckinUrl = "https://fnrh.turismo.gov.br/precheckin/xyz"` | Returns `"https://fnrh.turismo.gov.br/precheckin/xyz"` |
| **Mode: 'gov_fnrh' (Fallback)** | `getCheckinUrl(res, 1, origin)` where `res.serproPrecheckinUrl = null` | Returns internal URL, does not throw exception, writes audit log |
| **WhatsApp Template Dispatches** | `tpl_pre_checkin_reminder`, `tpl_new_reservation_direct`, `tpl_checkin_day_instructions` | `renderedMessage` and `renderedButtons[0].url` contain Gov.br link in Gov.br mode and internal URL in 'proprio' mode |
| **PMS Calendar Link Modal** | Copy link button & WhatsApp share | Copies/sends Gov.br link when active; internal URL otherwise |
| **Mirror Parity Check** | `artifacts/api-server/*.mjs` vs `scripts/*.mjs` | `diff` / `Buffer.equals()` returns 0 differences |
