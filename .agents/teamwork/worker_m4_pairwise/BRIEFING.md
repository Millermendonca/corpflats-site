# BRIEFING — 2026-10-11T05:03:00Z

## Mission
Implementar e validar exaustivamente a suíte E2E Pairwise Testing (Milestone 4 - R4) em `e2e/suites/03-pairwise-matrix.spec.mjs`, cobrindo matriz de reservas & durações, auditoria dos 19 flats sob 7 estados de governança, ciclo completo de ordens de serviço e regras de café da manhã com corte rígido das 22h via time-travel, com 100% de aprovação e integridade genuína.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_pairwise
- Original parent: 5a1d1171-401e-4601-9229-45485822d731
- Milestone: Milestone 4 - Matriz Combinatória de Estados (Pairwise Testing - R4)

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine. No hardcoded results, dummy facades or fabricated verifications.
- Twin-Server Parity: `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` must remain byte-by-byte identical.
- Build frontend via `npm run build` in `artifacts/limpeza` if frontend files are modified, committing `artifacts/limpeza/dist/`.
- Always `git push origin main` after git commit per project rules.
- Run tests against local isolated sandbox (`node e2e/runner.mjs e2e/suites/03-pairwise-matrix.spec.mjs`).
- Never mutate production `data/database.json`.
- Communication via `send_message` to caller `5a1d1171-401e-4601-9229-45485822d731`.

## Current Parent
- Conversation ID: 5a1d1171-401e-4601-9229-45485822d731
- Updated: 2026-10-11T05:03:00Z

## Task Summary
- **What to build**:
  1. Cenário 1: Matriz de composições de reserva (solo, casal, família 2+1, lotação máxima 4) e durações (1 diária, pernoite, fim de semana 2 diárias, longa permanência >15 diárias).
  2. Cenário 2: Auditoria dos 19 flats ativos sob os 7 estados de governança (`dirty`, `clean`, `occupied`, `checkout_today`, `stayover`, `touchup`, `maintenance`) no dashboard de limpeza (`/dashboard`), incluindo transições (iniciar faxina, concluir, bloquear manutenção e desbloquear).
  3. Cenário 3: Ciclo completo de Ordens de Serviço (criação admin em `/servicos`, acesso externo `/servico/:token`, cadastro de prestador/equipe, início de flat respeitando limites e `cleanFlatMode`, upload de fotos, conclusão com flag `needsCleaning`, verificação no admin e badge na camareira).
  4. Cenário 4: Regras de café da manhã e corte rígido das 22h testado via time-travel (seleção de itens, envio pré-22h aprovado e visível na cozinha, avanço de relógio >22h com rejeição amigável).
- **Success criteria**: 100% de testes aprovados em `03-pairwise-matrix.spec.mjs` com zero falhas, integridade real, relatório de handoff detalhado.
- **Interface contracts**: `PROJECT.md`
- **Code layout**: `PROJECT.md` § Code Layout

## Key Decisions Made
- Implementada a suíte `e2e/suites/03-pairwise-matrix.spec.mjs` cobrindo 100% dos 4 cenários combinatórios em 3 viewports (Desktop-1920, Tablet-768, Mobile-375).
- Aplicada regra de corte rígido das 22:00 no backend (`demo-server.mjs`) com avanço de relógio via time-travel e feedback visual no portal do hóspede (`guest-breakfast.tsx`).
- Refinada a transição de estado da ordem de serviço para apartamentos limpos (`wasCleanWhenStarted`) que passam a necessitar de limpeza (`needsCleaning: true`), garantindo transição para `dirty` com `source: "service_order"`.
- Adicionada rota estática explícita `/assets` no servidor para blindar contra falhas de carregamento de scripts em viewports móveis.
- Mantida paridade byte-a-byte estrita entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (SHA-256 match).

## Artifact Index
- `DISPATCH.md` — Assignment instructions
- `BRIEFING.md` — Active working memory and identity
- `progress.md` — Heartbeat and execution step tracker
- `handoff.md` — Self-contained 5-component handoff report

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/demo-server.mjs`: Corte das 22h no café, transição `needsCleaning` da OS e rota estática `/assets`
  - `scripts/demo-server.mjs`: Cópia idêntica byte-a-byte do servidor twin
  - `artifacts/limpeza/src/pages/guest-breakfast.tsx`: Indicadores visuais de encerramento do corte das 22h
  - `artifacts/limpeza/dist/`: Build de produção compilado via `npm run build`
  - `e2e/sandbox/db-seeder.mjs`: Inclusão da reserva de café `RES-TEST-BREAKFAST`
  - `e2e/suites/03-pairwise-matrix.spec.mjs`: Suíte completa de testes combinatórios M4 (12/12 aprovados)
- **Build status**: PASS (Vite build concluído em 34.65s)
- **Pending issues**: none

## Quality Status
- **Build/test result**: 12/12 passed (100% pass rate em Desktop-1920, Tablet-768 e Mobile-375)
- **Lint status**: clean
- **Tests added/modified**: `e2e/suites/03-pairwise-matrix.spec.mjs` (4 cenários combinatórios)

## Loaded Skills
- None explicitly loaded for M4.
