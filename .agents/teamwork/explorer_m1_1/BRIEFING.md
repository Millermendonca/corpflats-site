# BRIEFING — 2026-10-07T16:10:30Z

## Mission
Design the exact specification and implementation blueprint for `scripts/fnrh-serpro-service.mjs` (SERPRO FNRH v2.4.2 API Client).

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, SERPRO Client Specialist
- Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_1
- Original parent: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Milestone: Milestone 1 (Feature 2: scripts/fnrh-serpro-service.mjs blueprint)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT write source code or run build commands
- Write implementation blueprint to `blueprint_serpro_service.md` and complete `handoff.md`
- Send message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete

## Current Parent
- Conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Updated: 2026-10-07T16:10:30Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`, `PROJECT.md`, `survey_backend.md`
  - `scratch/analyze_fnrh.mjs`, `api_doc_v2_4_2_full.json` (Pages 3, 15, 16, 20, 21, 44, 53, 54)
  - `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`
  - `artifacts/api-server/zapi-service.mjs`, `artifacts/api-server/mail-service.mjs`, `scripts/fnrh-pdf-service.mjs`
- **Key findings**:
  - Node version v20.10.0 supports native fetch, AbortController, Buffer, and crypto.
  - API SERPRO v2.4.2 uses Basic Auth (`RFC 7617`) and mandatory header `cpf_solicitante`.
  - Base URLs: `https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2` (homologacao) and `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2` (producao).
  - Lightweight health check endpoint: `GET /dominios/reservas/situacoes`.
  - Reservation registration endpoint: `POST /reservas` (`numero_reserva`, `data_entrada`, `data_saida`, `quantidade_hospede_adulto`, `quantidade_hospede_menor`, `origem_reserva_id: 'MEIOHOSPEDAGEM'`).
  - Response parsing maps `reserva.reserva_id` and `reserva.link_precheckin`.
  - Mirroring convention requires `scripts/fnrh-serpro-service.mjs` to be byte-for-byte synced with `artifacts/api-server/fnrh-serpro-service.mjs`.
- **Unexplored areas**: None for M1 Feature 2 scope.

## Key Decisions Made
- Designed `FnrhSerproClient` class and singleton export `fnrhSerproService`.
- Standardized strict 5000ms timeout with `AbortController` and error code `ETIMEDOUT`.
- Formatted `checkHealth` to categorize statuses: `healthy`, `not_configured`, `auth_error`, `unreachable`, `server_error`.
- Delivered full blueprint in `blueprint_serpro_service.md` and handoff report in `handoff.md`.

## Artifact Index
- `DISPATCH.md` — Incoming task instructions
- `BRIEFING.md` — Persistent state tracking
- `progress.md` — Liveness heartbeat
- `blueprint_serpro_service.md` — Exhaustive specification and complete implementation code
- `handoff.md` — 5-component handoff report
