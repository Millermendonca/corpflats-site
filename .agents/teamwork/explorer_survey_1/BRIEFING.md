# BRIEFING — 2026-10-27T16:15:00Z

## Mission
Investigar e mapear a arquitetura de backend do fluxo de governança (housekeeping), checkouts, cards de limpeza diária, estadias ativas (stayover), identificação B2B, linenTracking e arquivos gêmeos.

## 🔒 My Identity
- Archetype: explorer
- Roles: Backend & Housekeeping Architecture Explorer
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_1
- Original parent: 5c8f06aa-a876-42b7-8e25-4f73f9a21590
- Milestone: Housekeeping Stayover & B2B Architecture Discovery

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly NO global or batch tests
- Respect twin files synchronization rules (scripts/demo-server.mjs vs artifacts/api-server/demo-server.mjs)
- Write only to .agents/teamwork/explorer_survey_1/

## Current Parent
- Conversation ID: 5c8f06aa-a876-42b7-8e25-4f73f9a21590
- Updated: 2026-10-27T16:15:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs` (linhas 13150-13250, 14596-15092, 15109-15374, 15743-16120, 18966-19130, 24450-24650, 50540-50670)
  - `scripts/demo-server.mjs` (twin)
  - `artifacts/api-server/maid-automation-service.mjs` (linhas 1-430)
  - `scripts/maid-automation-service.mjs` (twin)
  - `data/database.json` (reservas B2B e canais)
  - `artifacts/limpeza/src/components/flat-card.tsx`
  - `artifacts/limpeza/src/pages/guest-portal.tsx`
  - `artifacts/limpeza/src/pages/reports.tsx`
  - `artifacts/limpeza/src/pages/hr-dashboard.tsx`
- **Key findings**:
  - `getRequestsForDate` localiza-se na linha 14596 e atualmente apenas descarta checkouts em stayovers sem gerar cards diários.
  - Rota `GET /api/reservations/checkouts` (linha 15109) mapeia `requestsForDate` em cards com metadados de hóspede e quarto.
  - Reservas B2B são identificadas por `channel === 'b2b'`, `channel.includes('b2b')`, `b2bReservationNumber`, `agencyId` ou `b2bLocatorRloc`.
  - `PATCH /api/cleaning/assignments/:requestId/status` força `checkoutDone = true` e desocupa o quarto ao mudar para `cleaning_now` ou `clean`; exige bypass explícito para `isStayover`.
  - Lógica de `linenTracking` desenhada com histórico de trocas de cama/banho e alerta visual a cada 3 dias (`daysSinceBeddingChange >= 3`).
  - Tarifação de camareiras (`syncMaidCredits` e `getMaidPeriodFinances`) exige suporte a `userStayoverRates` (R$ 15,00) discriminando no extrato.
  - Endpoints do portal do hóspede (`do-not-disturb` e `linen-request` para `tomorrowStr`) devem validar e restringir para B2B retornando 403 para outros canais.
  - Hashes SHA-256 dos arquivos gêmeos conferidos e 100% idênticos.
- **Unexplored areas**: Nenhuma. Todos os 6 itens foram completamente investigados.

## Key Decisions Made
- Estruturação completa em `analysis.md` e `handoff.md` pronta para consumo imediato pelo orquestrador e workers de implementação.

## Artifact Index
- DISPATCH.md — Log das diretivas de dispatch recebidas
- BRIEFING.md — Persistência de contexto e identidade
- progress.md — Heartbeat de execução
- analysis.md — Relatório técnico aprofundado com linhas exatas e algoritmos
- handoff.md — Relatório formal de handoff em 5 seções
