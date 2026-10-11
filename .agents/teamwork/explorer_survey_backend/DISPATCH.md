# Task Assignment: Survey Backend & Sandbox Isolation Points

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).

Your mission is to explore and map the backend architecture and external integration points in `artifacts/api-server/demo-server.mjs`, `scripts/`, `data/`, etc., to design the R1 Local Sandbox & Interceptors.

### Tasks to Investigate:
1. Examine `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, and related service files (`zapi-service.mjs`, `mail-service.mjs`, `fnrh-serpro-service.mjs`, etc.).
2. Map all external calls:
   - Z-API / WhatsApp endpoints and credentials
   - SMTP / Nodemailer configuration
   - Payment gateways / PIX (MercadoPago, EFI, webhooks)
   - SERPRO / FNRH gov.br API
   - NFS-e prefeitura integration
3. Check database storage mechanism (`data/database.json`) and how to isolate it completely for testing (e.g., `data/database.test.json`, environment variable `DATA_PATH` or test flag/config).
4. Analyze how server port is configured (PORT env var, default 3000 / 3001) and how to run a dedicated isolated test API server instance on an independent port without altering `data/database.json`.
5. Investigate time/clock mechanisms in the server: how time checks (18:00 turno, 22:00 café, 14:00 check-in lock) are implemented, and how a time-travel endpoint or hook can be plugged in or simulated for testing.
6. Write your complete findings to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\handoff.md`.

Working Directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend`


## 2026-10-11T00:40:39Z
Você é o Explorer 2 (Survey Backend & Sandbox Isolation Points).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend
Leia com atenção o arquivo de instruções c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\DISPATCH.md e o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.
Investigue a fundo a arquitetura do backend em artifacts/api-server/demo-server.mjs, scripts/, database.json, chamadas externas (Z-API WhatsApp, SMTP Nodemailer, webhooks PIX, SERPRO FNRH, NFS-e) e como subir um sandbox isolado em porta dedicada com database.test.json e time-travel sem alterar a base de produção.
Escreva seu relatório completo em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\handoff.md e envie uma mensagem com o resumo dos seus achados para o orchestrator.
