# Dispatch: Milestone 1 Worker (Backend Core & Database Layer)

## 2026-10-11T01:47:00Z
You are the Worker for Milestone 1 in the Guest-Flow-Manager project.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_worker
The project root is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

MANDATORY INSTRUCTION: You MUST read the Original User Request file before starting:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

And review the findings and concrete code diffs from the 3 M1 Explorers:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1\handoff.md
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2\handoff.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_spec_miner\handoff.md
4. Seed dataset: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_spec_miner\seed-faq-dataset.json

### Write Ownership:
You own and must modify:
- `artifacts/api-server/demo-server.mjs` AND `scripts/demo-server.mjs` (identical copies)
- `artifacts/api-server/zapi-service.mjs` AND `scripts/zapi-service.mjs` (identical copies)
- `artifacts/api-server/whatsapp-ai-service.mjs` AND `scripts/whatsapp-ai-service.mjs` (sync to resolve existing SHA-256 divergence)

### Tasks:
1. Reconcile SHA-256 between `artifacts/api-server/whatsapp-ai-service.mjs` and `scripts/whatsapp-ai-service.mjs`.
2. Implement in `demo-server.mjs`:
   - `atomicWriteFileSync` in `saveDatabase` to prevent file corruption.
   - Initial `faqItems: []` in `let db = { ... }` and `ensureDbDefaults`.
   - Seed all 9 official FAQ items + pending/exception test items from `seed-faq-dataset.json` with idempotent loading.
   - Protect against PostgreSQL snapshot overwrites.
   - Apply byte-for-byte in both `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
3. Implement in `zapi-service.mjs`:
   - `matchClientPhone` and `isFaqApplicableToClient(faqItem, clientPhone)` supporting `all`, `exclude`, `include_only`.
   - 5 REST endpoints in `initWhatsAppEngine`:
     - `GET /api/whatsapp/faq`
     - `POST /api/whatsapp/faq`
     - `PUT /api/whatsapp/faq/:id`
     - `DELETE /api/whatsapp/faq/:id`
     - `POST /api/whatsapp/faq/:id/approve`
   - Apply byte-for-byte in both `artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`.
4. Run tests and verifications:
   - `node --test tests/whatsapp-ai-agent.test.mjs`
   - SHA-256 parity check between `artifacts/api-server/` and `scripts/`
5. Write your complete handoff report to `handoff.md` in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
