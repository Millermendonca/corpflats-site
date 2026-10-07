## 2026-10-07T16:00:55Z

You are teamwork_preview_explorer (Explorer M1_1 - SERPRO Client Specialist).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_1
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

Read the Project Plan at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/orchestrator_2/PROJECT.md
and backend survey at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_backend_2/survey_backend.md

YOUR MISSION FOR MILESTONE 1 (Feature 2):
Design the exact specification and implementation plan for `scripts/fnrh-serpro-service.mjs`:
1. SERPRO FNRH v2.4.2 API Client:
   - Base URLs: `https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2` (homologacao) and `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2` (producao).
   - Authentication: Basic Auth (base64 encoded `usuario:senha`) and header `cpf_solicitante`.
   - Credentials resolution: check environment variables (`SERPRO_USER`, `SERPRO_PASSWORD`, `SERPRO_CPF_SOLICITANTE`, `SERPRO_ENV`) and fallback/defaults in settings.
   - Request signature for `POST /reservas`: fields `numero_reserva`, `data_entrada` (YYYY-MM-DD), `data_saida` (YYYY-MM-DD), `quantidade_hospede_adulto`, `quantidade_hospede_menor`, `origem_reserva_id: 'MEIOHOSPEDAGEM'`.
   - Response parsing: extract `reserva.reserva_id` (or `reserva_id`) as `serproReservaId` and `reserva.link_precheckin` (or `link_precheckin`).
   - Timeout handling: default 5000ms abort controller.
   - Health check method `checkHealth()`: query lightweight endpoint `GET /dominios/reservas/situacoes` with 5000ms timeout, returning latency and status.
   - Standalone resilience: should be importable as ES module in `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
2. Write your implementation blueprint to:
   `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_1/blueprint_serpro_service.md`
   and write a complete `handoff.md` in your working directory.
3. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete. Do NOT write source code or run build commands.
