# Worker Dispatch: Milestone 1 - Sandbox Local Isolado & Interceptadores (R1)

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\PROJECT.md`.
Read Explorer findings in:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_e2e_infra\handoff.md`

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Owned Files
Implement the complete local sandbox infrastructure in `e2e/sandbox/`:
1. `e2e/sandbox/db-seeder.mjs`:
   - Safely copies `data/database.json` to `data/database.test.json` (creating backup if needed).
   - Sanitizes and ensures test users, flats (19 active flats), sample reservations, service orders, and configurations exist for deterministic testing.
   - NEVER modifies or writes to `data/database.json`.
2. `e2e/sandbox/mock-zapi.mjs`:
   - Express or HTTP mock server running on port 5056 (or dynamic port).
   - Simulates Z-API WhatsApp endpoints (`/instances/:id/token/:token/messages`, send-text, send-image, queue management).
   - Keeps in-memory sent messages log (`getSentMessages()`, `clearSentMessages()`).
   - Provides webhook dispatch method to simulate received messages into backend `POST /api/whatsapp/webhook/received`.
3. `e2e/sandbox/mock-smtp.mjs`:
   - In-memory SMTP server running on port 5025 (or internal Nodemailer mock) capturing all outbound email dispatches.
   - Keeps sent emails log (`getSentEmails()`, `clearSentEmails()`).
4. `e2e/sandbox/pix-simulator.mjs`:
   - Exposes helper to trigger instant PIX payment confirmation via `POST /api/pms/inter/webhook` with `{ pix: [{ txid, valor }] }`.
   - Exposes helper to simulate QR code expiration.
5. `e2e/sandbox/time-travel.mjs`:
   - Provides API and helper to shift system clock offset for testing 18:00 maid shifts, 22:00 breakfast cutoff, and 14:00 digital lock key release.
   - If adding a test time-travel endpoint `POST /api/test/time-travel` to backend `artifacts/api-server/demo-server.mjs`, REMEMBER: `scripts/demo-server.mjs` MUST remain byte-a-byte identical to `artifacts/api-server/demo-server.mjs`!
6. `e2e/sandbox/test-server.mjs`:
   - Master controller: boots the mock Z-API, mock SMTP, seeds `data/database.test.json`, spawns the isolated backend server on port 5055 with `DATABASE_FILE=data/database.test.json`, `DATABASE_URL=""`, `PORT=5055`, `SERPRO_MOCK=true`.
   - Waits for health check `http://localhost:5055/api/health` or `/api/pms/overview`.
   - Provides graceful teardown terminating all mock servers and killing the Node process tree via `taskkill /F /T /PID` on Windows.
7. `e2e/sandbox/verify-sandbox.mjs`:
   - Verification script running under `node e2e/sandbox/verify-sandbox.mjs`.
   - Proves that:
     a) Isolated backend boots on port 5055.
     b) Production `data/database.json` is completely untouched.
     c) Mocks capture WhatsApp messages and emails.
     d) PIX simulation confirms payments.
     e) Time-travel offset works.
     f) Teardown cleans up processes and ports.

## Output
Run the verification test `node e2e/sandbox/verify-sandbox.mjs` and document passing results in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md`.


## 2026-10-11T00:53:24Z
Você é o Worker M1 (Implementação do Sandbox Local Isolado & Interceptadores - R1).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox
Leia com atenção o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\DISPATCH.md e o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implemente a infraestrutura completa em e2e/sandbox/ (db-seeder.mjs, mock-zapi.mjs, mock-smtp.mjs, pix-simulator.mjs, time-travel.mjs, test-server.mjs e verify-sandbox.mjs).
Execute os testes de verificação e gere o relatório completo em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md.
