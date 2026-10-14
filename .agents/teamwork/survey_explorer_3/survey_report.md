# Survey Report 3: WhatsApp Fiscal Assistant Flow, Validation & Testing Architecture

**Date:** 2026-10-14  
**Author:** Survey Explorer 3  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3`  
**Target Project:** Guest-Flow-Manager (CorpFlats)

---

## Executive Summary

This investigation audits and maps the end-to-end architecture for the WhatsApp Fiscal Assistant, CRM 360° linkage (`db.guests`, `db.companies`), validation/sanitization/enrichment pipelines, NFS-e emission engine parity, and testing infrastructure.

Key architectural discoveries:
1. **WhatsApp Inbound Handling & Bot Architecture:** Messages enter via Z-API webhooks (`POST /api/whatsapp/webhook/received` in `artifacts/api-server/zapi-service.mjs`, lines 6108–6368), are persisted in `db.whatsappConversations`, and forwarded to `processAiInboundMessage` (`whatsapp-ai-service.mjs`, line 6237). In `classifyUnmetDemand` (line 3198), requests matching `/\b(?:nota\s*fiscal|nf|nfe|fatura|recibo\s*fiscal|comprovante\s*fiscal|cnpj\s*(?:na\s*nota)?)\b/i` are currently classified as `capability_missing` ("emissao_nota_fiscal"), leaving a clear gap where the automated assistant flow must be wired.
2. **CRM 360° & Sender Resolution:** `buildGuestContext` resolves senders by phone against `db.reservations` and `db.guests`. To fully satisfy R3, the resolution must also cross-reference `r.requesterInfo?.phone` (third-party bookers/requesters) and check `guest.companyId` / `r.companyId` against `db.companies`.
3. **Conditional Flow Logic (No Repeated Questions):** If the contact is already linked to a company in `db.companies` with a valid CNPJ, the assistant must NOT ask for fiscal data again; it immediately replies confirming the company details (Razão Social & formatted CNPJ), sets `autoEmitInvoice = true`, and links the reservation. If not linked, it sends a welcoming prompt detailing PJ vs PF requirements and enters an awaiting state (`awaitingFiscalData`).
4. **Validation, Sanitization & Enrichment Engine:** Algorithmic validation (Modulo 11) for CPF and CNPJ is implemented in `national-nfse.mjs` (`isValidCpf`, `isValidCnpj`), along with `cleanPhone`, `cleanCep`, and `toTitleCase`. Enrichment is provided by `lookup.mjs` (`lookupCnpj`, `lookupCep`). We map the strategy to check the local CRM first before calling BrasilAPI/ViaCEP to guarantee speed and offline test resilience.
5. **NFS-e Emission Bug & Twin Parity:** `POST /api/nfse/emit` in `demo-server.mjs` (lines 27467–27473) contains an immediate runtime bug: returning undeclared variables `numNfseReal` and `codVerifReal` (`ReferenceError`), and hardcodes municipal emission without persisting tomador address fields. Furthermore, `scripts/` is missing `national-nfse.mjs`, `chat-service.mjs`, `lookup.mjs`, and `giss-soap.mjs`, which must be synchronized for byte-for-byte twin parity.
6. **Testing Architecture (`AGENTS.md`):** Global tests and directory scans are strictly prohibited. The dedicated test file `tests/nfse-crm-whatsapp-flow.test.mjs` must run in isolation on a dedicated port using a temporary database in `os.tmpdir()`, verifying 100% of the acceptance criteria.

---

## 1. WhatsApp Inbound Routing & Bot Pipeline

### 1.1 Webhook Entry Points in `zapi-service.mjs`
- Primary route: `POST /api/whatsapp/webhook/received` (Line 6109)
- Fallback route: `POST /api/whatsapp/webhook` (Line 6401)
- Data ingestion:
  ```javascript
  const incomingInfo = extractIncomingMessageInfo(req.body);
  const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);
  ```
- Conversation record update:
  - Calls `appendMessageToConversation(db, { phone: cleanTarget, ... })`
  - Stores message in `db.whatsappConversations`
- Downstream triggers:
  - If group: `handleConciergeGroupMessage` (line 6225)
  - Sentiment & NPS: `processInboundSentimentAndNps` (line 6237)
  - Early arrival prediction: `parseArrivalFromWhatsAppText` (line 6294)
  - AI Assistant processing: `processAiInboundMessage` (line 6354)

### 1.2 Intent Detection Gap in `whatsapp-ai-service.mjs`
In `whatsapp-ai-service.mjs`, inbound messages reach `classifyUnmetDemand` (lines 3013–3230). Line 3198 specifies:
```javascript
if (/\b(?:nota\s*fiscal|nf|nfe|fatura|recibo\s*fiscal|comprovante\s*fiscal|cnpj\s*(?:na\s*nota)?)\b/i.test(lower)) {
  return {
    category: "emissao_nota_fiscal",
    demandTitle: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.title,
    reason: "capability_missing",
    actionTarget: null,
    suggestedFeature: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.defaultSuggested
  };
}
```
Because the capability was flagged as missing, the AI previously routed this to human handover or an unmet demand record.

---

## 2. Sender Phone Resolution & CRM 360° Linkage

### 2.1 Sender Identification Algorithm
To resolve the sender comprehensively:
1. **Phone Normalization:**
   `const cleanPhone = cleanWhatsAppPhone(incomingPhone);` (strips DDI 55, retains 10 or 11 digits).
2. **Reservation Matching (`db.reservations`):**
   - Check primary guest phone: `r.guestPhone`, `r.phone`, `r.guests?.[0]?.phone`.
   - Check third-party requester phone: `r.requesterInfo?.phone` (when booked by a company secretary or third party).
   - Priority matching order:
     a. Active in-house today: `checkinDate <= todayStr && checkoutDate >= todayStr`
     b. Future confirmed reservation: `checkinDate >= todayStr` (nearest check-in)
     c. Past recent reservation: `checkoutDate < todayStr` (most recent check-out)
3. **Guest Matching (`db.guests`):**
   - Check by `cleanPhone` against `g.phone` or `g.whatsapp`.
   - Or by `r.guestId === g.id`.
4. **Company Linkage Check (`db.companies`):**
   - Check `guest.companyId` or `r.companyId`.
   - If present, locate company: `const comp = db.companies.find(c => Number(c.id) === Number(companyId));`
   - Verify that `comp && comp.cnpj && onlyDigits(comp.cnpj).length === 14`.

### 2.2 Branching Flow Specification

```
                                [Inbound WhatsApp Message]
                                             │
                       Does message request NF OR is conv awaiting fiscal data?
                                             │
                         ┌───────────────────┴───────────────────┐
                         ▼ YES                                   ▼ NO
          Does contact have linked Company PJ?          Continue standard AI /
             (companyId with valid CNPJ)                 heuristic processing
                         │
          ┌──────────────┴──────────────┐
          ▼ YES                         ▼ NO
  [BRANCH A: Linked Company]     [BRANCH B: Not Linked]
  - Do NOT ask again!            - Send structured prompt:
  - Reply with Razão Social        🏢 PJ: CNPJ + Financial Email
    and formatted CNPJ             👤 PF: Name, CPF, Address/CEP, Email
  - Set autoEmitInvoice = true   - Set conv.awaitingFiscalData = true
  - Link reservation & draft NF  - Await reply
```

---

## 3. Data Ingestion, Validation, Sanitization & Enrichment

### 3.1 Reception of User Fiscal Data
When the user sends data (either immediately with the request or when `conv.awaitingFiscalData === true`):

1. **Document Classification (PJ vs PF):**
   - Extract contiguous digits or formatted document:
     - `/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/` or 14 digits -> **CNPJ (PJ)**
     - `/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/` or 11 digits -> **CPF (PF)**
2. **Modulo 11 Verification:**
   - For CNPJ: `isValidCnpj(cleanDoc)` from `national-nfse.mjs`.
     - If mathematically invalid: reply asking for correction without corrupting CRM.
   - For CPF: `isValidCpf(cleanDoc)` from `national-nfse.mjs`.
     - Validates check digits; prevents misinterpreting 11-digit phone numbers as CPFs.
3. **Automatic Enrichment (`lookup.mjs`):**
   - For CNPJ:
     - Local CRM check first: `db.companies.find(c => onlyDigits(c.cnpj) === cleanDoc)`.
     - Fallback: `lookupCnpj(cleanDoc)` via BrasilAPI / Receita.
     - Retrieves: `razaoSocial`, `nomeFantasia`, `logradouro`, `numero`, `bairro`, `cep`, `codigoMunicipio`, `uf`, `email`, `telefone`.
   - For CEP:
     - `lookupCep(cleanCep)` via ViaCEP / BrasilAPI to populate street, neighborhood, city, and IBGE code.
4. **Sanitization Rules:**
   - **`toTitleCase(name)`**: Converts to title case while preserving:
     - Corporate suffixes: `LTDA`, `S/A`, `SA`, `ME`, `EPP`, `EIRELI`, `SS`
     - State abbreviations: `RJ`, `SP`, `MG`, etc.
     - Lowercase prepositions: `de`, `da`, `do`, `dos`, `das`, `e`, `em`, `para`, `com`, `por` (except first word).
   - **`cleanPhone(phone)`**: Strips DDI `55` if length 12/13, strips non-digits.
   - **`cleanCep(cep)`**: Normalizes to 8 digits.
   - **`email`**: Trimmed and lowercased.
5. **CRM Persistence:**
   - **PJ:**
     - Create or update company in `db.companies` with full address and tax fields.
     - Link `companyId` and `companyName` to `guest` (`db.guests`) and `reservation` (`db.reservations`).
     - Set `autoEmitInvoice = true`.
     - Clear `awaitingFiscalData`.
     - Reply confirming corporate linkage on WhatsApp.
   - **PF:**
     - Create or update `db.guests` with CPF, full name, address/CEP, email, phone.
     - Set `autoEmitInvoice = true` on guest and reservation.
     - Clear `awaitingFiscalData`.
     - Reply confirming personal fiscal data on WhatsApp.

---

## 4. NFS-e Engine & CRM Endpoints Audit

### 4.1 Bug in `POST /api/nfse/emit` (`artifacts/api-server/demo-server.mjs`)
Lines 27467–27473:
```javascript
    res.status(201).json({
      success: true,
      invoice: newInvoice,
      numeroNfse: numNfseReal,       // BUG: numNfseReal is undefined!
      numeroNota: numNfseReal,       // BUG: ReferenceError!
      codigoVerificacao: codVerifReal, // BUG: codVerifReal is undefined!
      danfseUrl: `/api/nfse/danfse/${numNfseReal}`,
      linkPrefeitura: newInvoice.linkPrefeitura,
      qrCodeUrl: newInvoice.qrCodeUrl,
      message: `Nota Fiscal Nº ${numNfseReal} emitida com sucesso pelo GissOnline Municipal!`
    });
```
Furthermore:
- `emitirNfseGissReal` returns `{ ok: true, numeroNota, codigoVerificacao, ... }`. Line 27415 sets `numeroNfse: emissionResult.numeroNfse`, which evaluates to `undefined`!
- The endpoint must correctly resolve `numeroNfse` as `newInvoice.numeroNfse = emissionResult.numeroNota || emissionResult.numeroNfse`.
- Both `giss_prefeitura` and `padrao_nacional` must be supported.
- Full address fields (`tomadorEndereco`, `tomadorNumero`, `tomadorBairro`, `tomadorCep`, `tomadorCodigoMunicipio`, `tomadorUf`) must be accepted and persisted in `newInvoice`.

### 4.2 Incomplete Company Endpoints in `demo-server.mjs`
`POST /api/companies` (lines 28705–28750) and `PATCH /api/companies/:id` (lines 28752–28769) currently do not accept or persist address fields:
`address / logradouro`, `number`, `neighborhood / bairro`, `cep`, `city`, `uf`, `ibgeCode`.
These fields must be added to both endpoints and reflected in `crm-guests.tsx`.

### 4.3 UI Enhancements in `fiscal-invoices.tsx`
1. Fetch and merge companies from `/api/companies` alongside guests from `/api/pms/guests` in the search dropdown.
2. When a guest with `companyId` is selected:
   - Automatically prefill tomador with the linked company PJ data.
   - Maintain guest name, flat, and dates in the service discrimination (`descricaoServico`).
   - Provide an instant toggle button between **Empresa Vinculada (PJ)** and **Hóspede (PF)**.
3. Automatically load active or recent reservation details (flat number, check-in, check-out, diárias, valor total).

---

## 5. Testing Architecture, Twin Parity & Build Process

### 5.1 Rules in `AGENTS.md`
- **Strict Testing Scope:** NEVER run `tests/*.test.mjs` in batch or scan all tests. Run exclusively `tests/nfse-crm-whatsapp-flow.test.mjs`.
- **No Notification Silencing:** Never disable notifications in production code with `if (process.env.NODE_ENV !== "test")`.
- **Git Push by Default:** Always push after commits.
- **Build Verification:** Execute `npm --prefix artifacts/limpeza run build` and commit `dist/`.

### 5.2 Twin-Server Parity Requirement
Files in `artifacts/api-server/` must have exact SHA-256 matches in `scripts/`.
Currently, `scripts/` lacks:
- `chat-service.mjs`
- `national-nfse.mjs`
- `giss-soap.mjs`
- `lookup.mjs`
These must be copied to `scripts/` to ensure full parity and prevent startup crashes when executing from `scripts/`.

### 5.3 Test Suite Structure: `tests/nfse-crm-whatsapp-flow.test.mjs`
The test file must follow the repository's standard isolated pattern:
- Spawn isolated test process on port `3998`.
- Temporary isolated database file in `os.tmpdir()` (`tempDbPath`).
- Verify production `data/database.json` SHA-256 and mtime before and after test execution.
- Assert 100% of acceptance criteria:
  1. `POST /api/nfse/emit` succeeds with status 201, returning `numeroNfse`, `codigoVerificacao`, `danfseUrl`.
  2. Company creation/update with address fields via `/api/companies`.
  3. WhatsApp request from unlinked contact triggers structured prompt and sets state.
  4. WhatsApp response with invalid Modulo 11 check digits returns gentle error without CRM pollution.
  5. WhatsApp response with valid CNPJ performs enrichment, creates/updates company & guest, links reservation, sets `autoEmitInvoice=true`, and sends confirmation.
  6. WhatsApp request from already linked contact confirms company data without re-asking.
