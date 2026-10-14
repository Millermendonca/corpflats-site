# BRIEFING — 2026-10-14T11:38:00Z

## Mission
Adversarially challenge and stress-test the NFS-e & CRM 360° implementation: anomalous calls to `POST /api/nfse/emit` (nulls, divergent CEP/UF formats, special characters in discrimination), `getFiscalData()` persistence across reboots and repeated queries, corporate check-out auto-emission with and without company address, fast PJ ↔ PF toggle on UI, and dedicated pontual test execution (`node --test tests/nfse-crm-whatsapp-flow.test.mjs`).

## 🔒 My Identity
- Archetype: EMPIRICAL CHALLENGER
- Roles: critic, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_1
- Original parent: d9d088c2-767a-4f5a-9d52-d234243c2f9b
- Milestone: Developer AI Coaching Verification
- Instance: 1 of 1
- Appended Milestone: Smart Flat Hub Adversarial Verification (Parent: 26335f75-5ae5-4381-97dc-4cdaaa103cfd, Instance 1 of 1)
- Appended Milestone: NFS-e & CRM Stress/Edge Case Challenge (Parent: 3d03f136-f013-4588-99e3-f22e17cc1ae4, Instance 1 of 1)

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code.
- NUNCA executar testes globais, varreduras ou em lote (PROIBIDO rodar tests/*.test.mjs).
- Apenas teste estritamente pontual: execute EXCLUSIVAMENTE node --test tests/developer-ai-coaching.test.mjs.
- Empirical verification required: all bugs must be reproduced empirically.
- Twin-server parity between scripts/ and artifacts/api-server/.
- Issue verdict: APPROVE or REQUEST_CHANGES in handoff.md and send message back to parent.
- Smart Flat Hub Constraint: Execute EXCLUSIVAMENTE node --test tests/smart-flat-hub.test.mjs.
- NFS-e & CRM Constraint: Execute EXCLUSIVAMENTE node --test tests/nfse-crm-whatsapp-flow.test.mjs (ou testes isolados temporários em memória).
- Desafiar anomalias em POST /api/nfse/emit, getFiscalData persistence, auto-emissão check-out (empresa com vs sem endereço), e alternância rápida PJ ↔ PF na UI.

## Current Parent
- Conversation ID: 3d03f136-f013-4588-99e3-f22e17cc1ae4
- Updated: 2026-10-14T11:38:00Z

## Review Scope
- **Files to review**: `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `artifacts/api-server/giss-soap.mjs`, `scripts/giss-soap.mjs`, `artifacts/api-server/national-nfse.mjs`, `scripts/national-nfse.mjs`, `artifacts/api-server/chat-service.mjs`, `scripts/chat-service.mjs`, `artifacts/api-server/lookup.mjs`, `scripts/lookup.mjs`, `artifacts/api-server/whatsapp-ai-service.mjs`, `scripts/whatsapp-ai-service.mjs`, `artifacts/api-server/zapi-service.mjs`, `scripts/zapi-service.mjs`, `artifacts/limpeza/src/pages/fiscal-invoices.tsx`, `artifacts/limpeza/src/pages/crm-guests.tsx`, `tests/nfse-crm-whatsapp-flow.test.mjs`.
- **Interface contracts**: `PROJECT.md` and `ORIGINAL_REQUEST.md`.
- **Review criteria**:
  1. Anomalous inputs to `POST /api/nfse/emit` (null fields, boundary lengths, formatted vs unformatted CEP/UF, special/escaped chars in discrimination).
  2. Persistence guarantee in `getFiscalData()`: no invoice wiping upon repeated reads, reboot, or state updates.
  3. Corporate check-out auto-emission: company with full address vs company without address (fallback behaviors).
  4. Fast toggle PJ ↔ PF in `fiscal-invoices.tsx` (state consistency and tomador field switching).
  5. Pontual test execution passing (`node --test tests/nfse-crm-whatsapp-flow.test.mjs`).
  6. Twin-server SHA-256 parity for all 7 twin files.

## Attack Surface
- **Hypotheses tested**:
  - Anomalous `POST /api/nfse/emit` calls:
    - Empty/whitespace/null names rejected with HTTP 400: VERIFIED EMPIRICALLY.
    - Invalid CPF/CNPJ check digits, repeated digits, short digits, alphanumeric, null rejected with HTTP 400: VERIFIED EMPIRICALLY.
    - Zero/negative/string/null valorServico rejected with HTTP 400: VERIFIED EMPIRICALLY.
    - Divergent CEP formats normalized to 8 digits / default 28035000: VERIFIED EMPIRICALLY.
    - Divergent UF formats normalized to uppercase 2 letters / default RJ: VERIFIED EMPIRICALLY.
    - XML entities, special symbols, quotes, linebreaks, emojis in discrimination safely processed without crashing GISS or ADN: VERIFIED EMPIRICALLY.
  - `getFiscalData()` persistence:
    - 20 concurrent calls preserved all invoices without data loss: VERIFIED EMPIRICALLY.
    - Other fiscal endpoints (/danfse, /settings) preserve invoices: VERIFIED EMPIRICALLY.
    - Full server reboot with debounced disk flush preserves 100% of invoices (14/14): VERIFIED EMPIRICALLY.
  - Corporate check-out:
    - Company with full address sets Tomador PJ with complete address: VERIFIED EMPIRICALLY.
    - Company without address / null address fields falls back safely without crash: VERIFIED EMPIRICALLY.
    - Idempotency guard prevents double emission on repeat check-out: VERIFIED EMPIRICALLY.
  - UI fast PJ ↔ PF toggle:
    - 100 rapid alternations maintain 100% field consistency, switching between company PJ and guest PF while preserving stay details: VERIFIED EMPIRICALLY.
- **Vulnerabilities found**:
  - None critical. Server disk write uses a 300ms debounce timer (`saveDatabase`), meaning hard process termination (`SIGKILL`) within 300ms of mutation would leave disk unflushed; graceful shutdown (`SIGTERM`/`SIGINT`) or normal debounced write flushes completely to disk.
- **Untested angles**:
  - Live production mTLS certificate authentication with SEFIN Nacional and GissOnline SOAP (tested against mock/sandbox in `NODE_ENV=test`).

## Loaded Skills
- None specified by orchestrator.

## Key Decisions Made
- Executed strict pontual test `node --test tests/nfse-crm-whatsapp-flow.test.mjs` (24/24 tests passing).
- Verified twin-server parity SHA-256 match for all 7 files: True.
- Verified frontend build `npm --prefix artifacts/limpeza run build`: Exit code 0.
- Executed dedicated isolated stress suite in os.tmpdir(): 100% pass across all 4 challenge dimensions.
- Verdict: APPROVE.

## Artifact Index
- `handoff.md` — Final 5-component challenge report and APPROVE verdict.
- `progress.md` — Liveness and progress heartbeat.
- `DISPATCH.md` — Incoming dispatch messages.
