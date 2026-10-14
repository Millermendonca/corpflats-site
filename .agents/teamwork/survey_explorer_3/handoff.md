# Handoff Report: WhatsApp Fiscal Assistant Flow, Validation & Testing Architecture

**Agent:** Survey Explorer 3  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3`  
**Date:** 2026-10-14  
**Handoff Type:** Hard (Survey Complete)

---

## 1. Observation

Direct observations from source inspection and filesystem tools:

### O1. WhatsApp Inbound Webhook & Message Ingestion
- **File:** `artifacts/api-server/zapi-service.mjs`, line 6109:
  `app.post("/api/whatsapp/webhook/received", async (req, res) => {`
- Ingestion pipeline:
  - Extracts message data via `extractIncomingMessageInfo(req.body)` (line 6126).
  - Cleans sender phone: `cleanTarget = cleanWhatsAppPhone(...)` (line 6137).
  - Stores message in conversation store: `appendMessageToConversation(db, { phone: cleanTarget, ... })` (line 6141).
  - Triggers AI processing: `processAiInboundMessage({ db, incomingInfo, cleanTarget, saveDatabase, createNotification, sendZapiMessage, appendMessageFn })` (line 6354).

### O2. Missing Intent Handling in AI & Heuristics
- **File:** `artifacts/api-server/whatsapp-ai-service.mjs`, lines 3198–3205:
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
- **File:** `artifacts/api-server/whatsapp-ai-service.mjs`, lines 4814–5200 (`generateHeuristicResponse`):
  There is currently ZERO logic for fiscal intent interception, fiscal data collection state, or CRM company linkage confirmation.

### O3. Sender Phone & CRM Resolution
- **File:** `artifacts/api-server/whatsapp-ai-service.mjs`, lines 264–315 (`buildGuestContext`):
  Resolves reservations via `r.guestPhone || r.phone`, but does NOT currently check `r.requesterInfo?.phone` (third-party requester phone recorded in `r.requesterInfo`).
- **File:** `artifacts/api-server/zapi-service.mjs`, lines 1706–1725 (`getReservationRecipients`):
  Already demonstrates how `requesterInfo` and corporate linkage are extracted:
  `if (requesterType === "other_person" && reservation.requesterInfo) requesterPhone = reservation.requesterInfo.phone;`
  `else if (requesterType === "company") companyObj = db.companies.find(c => String(c.id) === String(reservation.companyId));`

### O4. Validation, Sanitization & Enrichment Implementations
- **File:** `artifacts/api-server/national-nfse.mjs`, lines 66–155:
  - `toTitleCase(str)` (line 66): converts to title case while preserving corporate acronyms `["LTDA", "ME", "EPP", "S/A", "SA", "EIRELI", "SS", "PJ", "PF", "RJ", ...]` and prepositions `["de", "da", "do", "dos", "das", "e", "em", "para", "com", "por"]`.
  - `isValidCpf(cpf)` (line 94): mathematical Modulo 11 validation for 11-digit CPFs.
  - `isValidCnpj(cnpj)` (line 112): mathematical Modulo 11 validation for 14-digit CNPJs.
  - `cleanPhone(phone)` (line 141): strips DDI 55 and retains 10 or 11 digits.
  - `cleanCep(cep)` (line 152): cleans and normalizes to 8 digits.
- **File:** `artifacts/api-server/lookup.mjs`, lines 3–58:
  - `lookupCep(cep)`: calls ViaCEP (`https://viacep.com.br/ws/${cleanCep}/json/`).
  - `lookupCnpj(cnpj)`: calls BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`).

### O5. Runtime Bug in `POST /api/nfse/emit`
- **File:** `artifacts/api-server/demo-server.mjs`, lines 27467–27473:
  ```javascript
  res.status(201).json({
    success: true,
    invoice: newInvoice,
    numeroNfse: numNfseReal,       // ReferenceError: numNfseReal is not defined!
    numeroNota: numNfseReal,       // ReferenceError: numNfseReal is not defined!
    codigoVerificacao: codVerifReal, // ReferenceError: codVerifReal is not defined!
    danfseUrl: `/api/nfse/danfse/${numNfseReal}`,
    linkPrefeitura: newInvoice.linkPrefeitura,
    qrCodeUrl: newInvoice.qrCodeUrl,
    message: `Nota Fiscal Nº ${numNfseReal} emitida com sucesso pelo GissOnline Municipal!`
  });
  ```
- Line 27415 sets `numeroNfse: emissionResult.numeroNfse`, but `emitirNfseGissReal` in `giss-soap.mjs` returns `{ ok: true, numeroNota, codigoVerificacao, ... }`, causing `newInvoice.numeroNfse` to be `undefined`.

### O6. Missing Address Fields in Company Endpoints
- **File:** `artifacts/api-server/demo-server.mjs`, lines 28705–28769 (`POST /api/companies` and `PATCH /api/companies/:id`):
  Currently only accepts: `corporateName, tradeName, cnpj, stateRegistration, municipalRegistration, financialEmail, phone, contactPerson, billingTerms, notes`.
  Completely omits: `address / logradouro, number, neighborhood / bairro, cep, city / cidade, state / uf, ibgeCode / codigoMunicipio`.
- **File:** `artifacts/limpeza/src/pages/crm-guests.tsx`, lines 385–396:
  The company modal payload also lacks these address fields.

### O7. Twin-Server Missing Files in `scripts/`
- Directory listing of `scripts/` reveals that while `demo-server.mjs`, `whatsapp-ai-service.mjs`, and `zapi-service.mjs` exist in `scripts/`, the following files present in `artifacts/api-server/` are missing in `scripts/`:
  - `chat-service.mjs`
  - `national-nfse.mjs`
  - `giss-soap.mjs`
  - `lookup.mjs`
  However, `scripts/demo-server.mjs` line 53–55 explicitly imports them:
  `import { emitirNfseGissReal, COD_MUNICIPIO, renderGissDanfseHtml } from "./giss-soap.mjs";`
  `import { processChatConversation, formatarDescricaoComTemplate, DEFAULT_FISCAL_TEMPLATE } from "./chat-service.mjs";`
  `import { lookupCep, lookupCnpj } from "./lookup.mjs";`
  Running `scripts/demo-server.mjs` directly will crash due to missing module imports.

---

## 2. Logic Chain

1. **Inbound Webhook to Bot Flow (from O1 & O2):**
   When a user sends a message on WhatsApp requesting an invoice (e.g. "preciso de nota fiscal"), `POST /api/whatsapp/webhook/received` parses the payload and invokes `processAiInboundMessage`. Since `classifyUnmetDemand` tags "emissao_nota_fiscal" as an unhandled demand (`capability_missing`), the bot currently fails to act autonomously. Therefore, an active intent interceptor must be placed in `whatsapp-ai-service.mjs` (or in the webhook handler) to capture fiscal inquiries.

2. **Sender Identification & CRM Resolution (from O3):**
   A sender might be the primary guest or a third-party requester (`r.requesterInfo`). Normalizing the incoming phone and matching against `db.reservations` (checking `r.guestPhone`, `r.phone`, and `r.requesterInfo?.phone`) and `db.guests` identifies the contact and their active/recent reservation. Checking `guest.companyId` or `r.companyId` against `db.companies` reveals whether a corporate entity is already bound.

3. **Conditional Flow Without Repeated Questions (from O2 & O3):**
   - If the contact is already linked to a company in `db.companies` with a valid CNPJ:
     Asking them for data again creates user friction and contradicts R3.2. The system must immediately reply confirming the registered Razão Social and formatted CNPJ, set `autoEmitInvoice = true` on the reservation and guest, link `r.companyId`, and create a draft/pre-fill in `r.invoiceDetails`.
   - If not linked:
     The assistant must send a clear, warm message asking whether the invoice is for PJ (requiring CNPJ + financial email) or PF (requiring Full Name, CPF, Address/CEP, Email), and set `conv.awaitingFiscalData = true`.

4. **Validation, Sanitization & CRM Persistence (from O4):**
   When the user replies with data:
   - If CNPJ (14 digits) is provided, `isValidCnpj` validates Modulo 11 check digits. If invalid, a gentle correction message is sent without corrupting the database. If valid, `lookupCnpj` enriches company data (checking local `db.companies` first, then BrasilAPI). `toTitleCase` sanitizes the corporate name, `cleanPhone` and `cleanCep` sanitize contact fields. The company is created/updated in `db.companies`, linked via `companyId` to `db.guests` and `db.reservations`, `autoEmitInvoice` is set to `true`, and confirmation is sent.
   - If CPF (11 digits) is provided, `isValidCpf` validates Modulo 11. `db.guests` and the reservation are updated with PF data, `autoEmitInvoice` is set to `true`, and confirmation is sent.

5. **NFS-e Emission & UI Resolution (from O5 & O6):**
   Fixing `POST /api/nfse/emit` to use `newInvoice.numeroNfse` and `newInvoice.codigoVerificacao` eliminates the `ReferenceError`. Supporting both `giss_prefeitura` and `padrao_nacional`, persisting full tomador address fields in `newInvoice`, and adding address fields to `POST /api/companies` and `PATCH /api/companies/:id` fulfills R1 & R2. In `fiscal-invoices.tsx`, integrating `/api/companies` into the combobox and providing the quick PJ/PF toggle completes the CRM 360° loop.

6. **Twin-Server Parity & Strict Testing (from O7 & AGENTS.md):**
   To maintain the project's strict 100% SHA-256 parity rule, any changes in `artifacts/api-server/` must be mirrored in `scripts/`, and missing twin files (`chat-service.mjs`, `national-nfse.mjs`, `giss-soap.mjs`, `lookup.mjs`) must be copied to `scripts/`. Per `AGENTS.md`, no global test suites may be run; testing must be strictly confined to `tests/nfse-crm-whatsapp-flow.test.mjs`.

---

## 3. Caveats

1. **Network Connectivity for Lookups:** In production, `lookupCnpj` calls BrasilAPI and `lookupCep` calls ViaCEP. In test environments (or during offline development), external HTTP calls may fail or time out. The implementation must prioritize local CRM lookups (`db.companies`) and provide safe mock fallbacks when running under `NODE_ENV === "test"`.
2. **Ambiguity between 11-digit CPF and Phone Numbers:** An unformatted 11-digit string in WhatsApp could potentially be a phone number or a CPF. The logic must rely on `isValidCpf` (Modulo 11 algorithm) and conversational context (`conv.awaitingFiscalData === true` or explicit keywords like "cpf") so that valid phone numbers are not mistakenly ingested as CPFs.
3. **No Caveats Beyond Above:** No other architectural blockers or uninvestigated components exist.

---

## 4. Conclusion

The path to full compliance with the requirements is clear, actionable, and strictly scoped:
1. **Fix `POST /api/nfse/emit`**: Resolve the undefined variable bug (`numNfseReal`/`codVerifReal`), normalize `emissionResult.numeroNota` -> `newInvoice.numeroNfse`, support both `giss_prefeitura` and `padrao_nacional`, and persist full tomador address fields.
2. **Upgrade Company Endpoints & CRM**: Extend `POST /api/companies` and `PATCH /api/companies/:id` to accept and persist address fields (`logradouro`, `numero`, `bairro`, `cep`, `cidade`, `uf`, `codigoMunicipio`), and update `crm-guests.tsx`.
3. **Upgrade Fiscal Invoices UI (`fiscal-invoices.tsx`)**: Allow searching both guests and companies, auto-fill tomador with linked company PJ data when `companyId` exists, offer a quick PJ/PF toggle, and prefill active reservation stay details.
4. **Implement WhatsApp Fiscal Flow**: Intercept fiscal intent in `whatsapp-ai-service.mjs` / `zapi-service.mjs`, check sender phone and reservation `requesterInfo`, conditionally branch (confirm existing company without re-asking vs prompt for PJ/PF data), validate via Modulo 11, enrich via local CRM/BrasilAPI/ViaCEP, sanitize via `toTitleCase`/`cleanPhone`/`cleanCep`, persist in `db.companies` and `db.guests`, link reservation, set `autoEmitInvoice=true`, and send WhatsApp confirmation.
5. **Ensure Twin Parity & Strict Testing**: Sync twin files in `scripts/`, ensure identical SHA-256 hashes, build `artifacts/limpeza`, and create the dedicated test suite `tests/nfse-crm-whatsapp-flow.test.mjs` running in complete isolation without global test runs.

---

## 5. Verification Method

To independently verify all findings and validate future implementations:

### V1. Code Inspection Commands
- Verify `numNfseReal` undefined bug in `demo-server.mjs`:
  `view_file` on `artifacts/api-server/demo-server.mjs` lines 27465–27475.
- Verify `classifyUnmetDemand` for `emissao_nota_fiscal`:
  `view_file` on `artifacts/api-server/whatsapp-ai-service.mjs` lines 3198–3206.
- Verify missing twin files in `scripts/`:
  `find_by_name` on `scripts` with pattern `*nfse*` or `chat-service.mjs`.

### V2. Dedicated Isolated Test Execution
Run exclusively the single test file:
```powershell
node --test tests/nfse-crm-whatsapp-flow.test.mjs
```
*Note: In accordance with `AGENTS.md`, never run `tests/*.test.mjs` or batch test commands.*

### V3. Build & Parity Verification
- Compile frontend:
  ```powershell
  npm --prefix artifacts/limpeza run build
  ```
- Verify SHA-256 twin parity between `artifacts/api-server/` and `scripts/`:
  ```powershell
  Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
  Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs, scripts/whatsapp-ai-service.mjs
  Get-FileHash artifacts/api-server/zapi-service.mjs, scripts/zapi-service.mjs
  ```
