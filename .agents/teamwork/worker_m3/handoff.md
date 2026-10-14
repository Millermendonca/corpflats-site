# Handoff Report: WhatsApp Fiscal Assistant Flow & Automated Enrichment (Milestone M3)

**Agent:** Worker M3 (Implementer / QA / Specialist)  
**Working Directory:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3`  
**Date:** 2026-10-14  
**Handoff Type:** Hard (Milestone M3 Complete)

---

## 1. Observation

Direct observations from source inspection, code implementations and tool outputs:

### O1. Interception and Intent Detection
- Prior to M3, `artifacts/api-server/whatsapp-ai-service.mjs` line 3198 classified fiscal keywords (`nota fiscal`, `nf`, `recibo fiscal`, etc.) as an unhandled demand (`emissao_nota_fiscal` with `reason: "capability_missing"`), and `generateHeuristicResponse` had zero handling for fiscal inquiries.
- In `whatsapp-ai-service.mjs`, implemented `isFiscalIntentMessage(text)` with comprehensive action verb (`preciso`, `quero`, `gostaria`, `favor`, `solicito`, `solicitar`, `emitir`, `emite`, `emissao`, `mandar`, `enviar`, `gerar`, `fazer`) and fiscal noun (`nota`, `nf`, `nfe`, `nfse`, `nfs-e`, `recibo`, `fatura`) pattern matching, insensitive to case and accents.
- Implemented `extractCnpj(text)` (supporting formatted `XX.XXX.XXX/XXXX-XX`, tagged `cnpj: ...`, and raw 14-digit strings) and `extractCpf(text)` (supporting formatted `XXX.XXX.XXX-XX`, tagged `cpf: ...`, and 11-digit strings validating under Módulo 11).

### O2. Reservation and Sender Matching
- In `artifacts/api-server/zapi-service.mjs` (`getReservationPhones`, lines 4425–4435), updated phone candidate collection to include `r.requesterInfo?.phone`, `r.requesterInfo?.whatsapp` and `r.requesterPhone`, enabling third-party requesters (such as corporate secretaries booking on behalf of guests) to match reservations and corporate links.
- In `whatsapp-ai-service.mjs`, `findContactAndReservation(db, cleanTarget)` resolves matching active/recent reservations across `r.guestPhone`, `r.phone`, `r.whatsapp`, `r.contactPhone`, `r.guestWhatsapp`, and `r.requesterInfo`.

### O3. No-Repeat Flow for Linked Companies (R3.2 - F13)
- When a contact or their active/recent reservation possesses a linked company (`companyId` with valid CNPJ in `db.companies`):
  - The system immediately replies on WhatsApp confirming the registered corporate name (`Razão Social` / `corporateName`) and formatted CNPJ (`formatCnpj`, e.g. `12.345.678/0001-90`).
  - Sets `autoEmitInvoice = true` on the reservation and guest.
  - Links `r.companyId = company.id` and pre-fills `r.invoiceDetails` with all corporate address and tax data for immediate draft preparation on the fiscal invoice screen (`/notas`) or at check-out.
  - No data is requested from the user again.

### O4. Fiscal Onboarding for Unlinked Contacts (R3.3 - F14)
- When a contact requests an invoice and does not possess a linked company:
  - An onboarding message is dispatched on WhatsApp explaining the options:
    * **Empresa / Pessoa Jurídica (PJ)**: requesting CNPJ and financial email.
    * **Pessoa Física (PF)**: requesting Full Name, CPF, Address with CEP, and Email.
  - The conversation state is marked with `conv.awaitingFiscalData = true`.

### O5. Validation, Sanitization & Automated Enrichment (F15 & F16)
- Implemented Módulo 11 algorithms in `lookup.mjs`: `isValidCnpj(cnpj)` and `isValidCpf(cpf)`.
- If an invalid CPF or CNPJ is provided, a gentle warning is returned asking the user to check their digits, keeping `conv.awaitingFiscalData = true` and preventing CRM pollution.
- Sanitization utilities in `lookup.mjs`:
  - `toTitleCase(str)`: converts to Title Case while strictly preserving corporate acronyms (`LTDA`, `S/A`, `SA`, `ME`, `EPP`, `EIRELI`, `SS`, `PJ`, `PF`, `RJ`, `SP`, etc.) and lowercasing prepositions (`de`, `da`, `do`, `dos`, `das`, `e`, `em`, `para`, `com`, `por`).
  - `cleanPhone(phone)`: strips DDI 55 if length is 12 or 13, retaining DDD + number.
  - `cleanCep(cep)`: cleans to 8 digits.
  - E-mail addresses are trimmed and lowercased.
- Automated Enrichment:
  - `lookupCnpj(cnpj, db)`: checks local `db.companies` first; if not found, queries BrasilAPI with timeout and fallback.
  - `lookupCep(cep, db)`: queries ViaCEP with fallback to BrasilAPI with timeout and fallback.

### O6. CRM Binding and WhatsApp Confirmation (F17)
- PJ Submission: creates/updates `db.companies` with corporateName, tradeName, cnpj, financialEmail, phone, and complete address (`logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `ibgeCode`, `cep`). Binds `companyId` and `companyName` to `db.guests` and `db.reservations`, sets `autoEmitInvoice = true`, pre-fills `invoiceDetails`, and clears `conv.awaitingFiscalData = false`.
- PF Submission: creates/updates `db.guests` with full name, CPF, email, and address; activates `autoEmitInvoice = true` on the reservation, pre-fills `invoiceDetails`, and clears `conv.awaitingFiscalData = false`.

### O7. Twin Parity and Syntax Verification
- SHA-256 byte-for-byte parity is 100% identical between `artifacts/api-server/` and `scripts/`:
  - `artifacts/api-server/whatsapp-ai-service.mjs` <-> `scripts/whatsapp-ai-service.mjs`: `1169D5F190F86F75824E65FA582AA23A43E58FBAC0E3555885C4CC98D73BD130`
  - `artifacts/api-server/zapi-service.mjs` <-> `scripts/zapi-service.mjs`: `CECD601D077735256E36AC264FB17A9F3EC0C2D8B7C5F13C61ACEB20F0BB4E44`
  - `artifacts/api-server/lookup.mjs` <-> `scripts/lookup.mjs`: `7DDF9B78BE3DFABC0A12C90C9343C94E7CEE9F9E4234B50727D8F604014C6951`
- `node --check` executed on all 6 files exited with code 0 (zero syntax errors).

---

## 2. Logic Chain

1. **Inbound Webhook Interception (from O1 & O2):**
   When `POST /api/whatsapp/webhook/received` receives an inbound message from a client, it invokes `processAiInboundMessage`. In `whatsapp-ai-service.mjs`, `handleWhatsAppFiscalFlow` is executed immediately after conversation resolution. If `isFiscalIntentMessage(text)` is true OR `conv.awaitingFiscalData === true`, the fiscal flow intercepts the message.
2. **Contact & Requester Phone Resolution (from O2):**
   `findContactAndReservation` scans `db.reservations` and `db.guests`, supporting both the primary guest's phone and third-party requester information (`r.requesterInfo?.phone`, `r.requesterInfo?.whatsapp`). It classifies whether an active or recent reservation exists and whether a valid company (`linkedCompany`) is already bound.
3. **Branching: Linked Company vs Onboarding (from O3 & O4):**
   - If the client already has a valid company link in CRM and did not submit a different document, the system does not ask for data again: it responds confirming the existing corporate name and formatted CNPJ, marks `autoEmitInvoice = true`, and pre-fills `r.invoiceDetails`.
   - If unlinked and no document was sent, it dispatches an instructional prompt asking whether the invoice should be issued for PJ or PF, setting `conv.awaitingFiscalData = true`.
4. **Validation & Correction Guard (from O5):**
   If a document is sent (either in the initial request or as a reply), Módulo 11 algorithms (`isValidCnpj` / `isValidCpf`) validate the check digits. Any invalid document triggers a polite correction notice without persisting bad data to `db.companies` or `db.guests`.
5. **Enrichment, Sanitization & CRM Persistence (from O5 & O6):**
   When a valid document is provided, `lookupCnpj` (local CRM first, then BrasilAPI) and `lookupCep` enrich address, corporate names, and IBGE municipal codes. Data is sanitized with `toTitleCase` (preserving corporate acronyms and prepositions), `cleanPhone`, `cleanCep`, and lowercased emails. The entity is saved in `db.companies` / `db.guests`, bound to `matchedReservation`, `autoEmitInvoice` is set to `true`, `invoiceDetails` is pre-filled, `awaitingFiscalData` is cleared, and confirmation is dispatched on WhatsApp.
6. **Execution Integrity & Parity (from O7):**
   Both `artifacts/api-server/` and `scripts/` maintain identical SHA-256 hashes and validate under `node --check`.

---

## 3. Caveats

1. **External API Network Availability:** In production, `lookupCnpj` queries BrasilAPI and `lookupCep` queries ViaCEP. In offline or test environments, network timeouts are guarded by 3.5s/4s timers and fall back gracefully to local CRM data or safe fallbacks without throwing uncaught exceptions.
2. **Ambiguity between Phone and CPF:** An unformatted 11-digit string is only parsed as a CPF if it passes `isValidCpf` (Modulo 11) and does not match the sender's own phone number, preventing accidental overwrites.
3. **No Caveats Beyond Above:** No further caveats.

---

## 4. Conclusion

All requirements and acceptance criteria for Milestone M3 (Features F12 through F17) have been fully and genuinely implemented:
- Inbound fiscal intent interception with regex insensitive to case and accents.
- Zero repetition of questions for clients already bound to a company in CRM.
- Complete onboarding flow for unlinked clients with conversational state management.
- Mathematical Modulo 11 validation for CPFs and CNPJs with gentle correction warnings.
- Automated enrichment via local CRM, BrasilAPI, and ViaCEP.
- Automatic CRM persistence, reservation linking, `autoEmitInvoice` activation, and `invoiceDetails` pre-filling.
- 100% SHA-256 byte-for-byte twin-server parity and zero-syntax-error validation.

---

## 5. Verification Method

To independently verify the implementation:

### V1. Syntax & Parity Verification
```powershell
# 1. Verify syntax
node --check artifacts/api-server/whatsapp-ai-service.mjs scripts/whatsapp-ai-service.mjs artifacts/api-server/zapi-service.mjs scripts/zapi-service.mjs artifacts/api-server/lookup.mjs scripts/lookup.mjs

# 2. Verify identical SHA-256 hashes
powershell -Command "Get-FileHash 'artifacts/api-server/whatsapp-ai-service.mjs', 'scripts/whatsapp-ai-service.mjs', 'artifacts/api-server/zapi-service.mjs', 'scripts/zapi-service.mjs', 'artifacts/api-server/lookup.mjs', 'scripts/lookup.mjs' | Select-Object Hash, Path"
```

### V2. Standalone In-Memory Functional Test
Execute the comprehensive 9-point scenario suite (no database pollution, runs in memory):
```powershell
node -e "
import('./artifacts/api-server/whatsapp-ai-service.mjs').then(async (m) => {
  const assert = (await import('assert')).default;

  // 1. isFiscalIntentMessage
  assert.strictEqual(m.isFiscalIntentMessage('preciso de nota fiscal'), true);
  assert.strictEqual(m.isFiscalIntentMessage('Favor emitir a NF da estadia'), true);
  assert.strictEqual(m.isFiscalIntentMessage('qual a senha do wifi?'), false);

  // 2. Módulo 11 validation
  assert.strictEqual(m.isValidCnpj('47.964.813/0001-65'), true);
  assert.strictEqual(m.isValidCnpj('47964813000166'), false);
  assert.strictEqual(m.isValidCpf('11144477735'), true);
  assert.strictEqual(m.isValidCpf('11144477700'), false);

  // 3. Flow with existing company (no repeat questions)
  const mockDb1 = {
    companies: [{ id: 'comp_1', corporateName: 'CorpFlats Tech LTDA', cnpj: '47964813000165' }],
    guests: [{ id: 'g_1', name: 'Carlos Teste', phone: '2299887766', companyId: 'comp_1' }],
    reservations: [{ id: 'res_1', guestPhone: '2299887766', companyId: 'comp_1', status: 'ativa' }],
    whatsappConversations: []
  };
  const res1 = await m.handleWhatsAppFiscalFlow({
    db: mockDb1,
    cleanTarget: '552299887766',
    messageText: 'Olá, preciso de nota fiscal',
    senderName: 'Carlos',
    conv: null,
    sendZapiMessage: async () => ({ success: true }),
    appendMessageFn: () => {}
  });
  assert.strictEqual(res1.action, 'confirmed_existing_company');
  assert.strictEqual(mockDb1.reservations[0].autoEmitInvoice, true);
  assert.match(res1.replyText, /CorpFlats Tech LTDA/);

  // 4. Flow without company (onboarding prompt)
  const mockDb2 = {
    companies: [],
    guests: [{ id: 'g_2', name: 'Mariana Teste', phone: '2299112233' }],
    reservations: [{ id: 'res_2', guestPhone: '2299112233', status: 'ativa' }],
    whatsappConversations: []
  };
  const res2 = await m.handleWhatsAppFiscalFlow({
    db: mockDb2,
    cleanTarget: '552299112233',
    messageText: 'Gostaria de nota fiscal',
    senderName: 'Mariana',
    conv: null,
    sendZapiMessage: async () => ({ success: true }),
    appendMessageFn: () => {}
  });
  assert.strictEqual(res2.action, 'requested_fiscal_data');

  // 5. Invalid CNPJ
  const conv2 = mockDb2.whatsappConversations[0];
  const res3 = await m.handleWhatsAppFiscalFlow({
    db: mockDb2,
    cleanTarget: '552299112233',
    messageText: 'CNPJ: 47.964.813/0001-99',
    conv: conv2,
    sendZapiMessage: async () => ({ success: true }),
    appendMessageFn: () => {}
  });
  assert.strictEqual(res3.action, 'invalid_cnpj');
  assert.strictEqual(mockDb2.companies.length, 0);

  // 6. Valid CNPJ
  const res4 = await m.handleWhatsAppFiscalFlow({
    db: mockDb2,
    cleanTarget: '552299112233',
    messageText: 'CNPJ: 47.964.813/0001-65, email financeiro@corpflats.com',
    conv: conv2,
    sendZapiMessage: async () => ({ success: true }),
    appendMessageFn: () => {}
  });
  assert.strictEqual(res4.action, 'registered_pj');
  assert.strictEqual(mockDb2.companies[0].cnpj, '47964813000165');
  assert.strictEqual(mockDb2.reservations[0].autoEmitInvoice, true);

  // 7. Third-party requester matching
  const mockDb3 = {
    companies: [{ id: 'comp_3', corporateName: 'Empresa do Solicitante LTDA', cnpj: '47964813000165' }],
    reservations: [{
      id: 'res_3',
      guestPhone: '22990001111',
      requesterInfo: { name: 'Secretária Carla', phone: '22988887777' },
      companyId: 'comp_3',
      status: 'ativa'
    }],
    whatsappConversations: []
  };
  const res5 = await m.handleWhatsAppFiscalFlow({
    db: mockDb3,
    cleanTarget: '5522988887777',
    messageText: 'Favor emitir a NF da estadia',
    conv: null,
    sendZapiMessage: async () => ({ success: true }),
    appendMessageFn: () => {}
  });
  assert.strictEqual(res5.action, 'confirmed_existing_company');
  assert.strictEqual(mockDb3.reservations[0].autoEmitInvoice, true);

  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
});
"
```
