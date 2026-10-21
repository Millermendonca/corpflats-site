# BRIEFING — 2026-10-21T19:50:00Z

## Mission
Executar as remediações e correções técnicas de M1 no backend do Frigobar/Minibar (`artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/minibar-backend-flow.test.mjs`), assegurando paridade SHA-256 twin-server, precisão contábil (taxa 0.99% PIX), RBAC staff, webhook Mercado Pago resiliente, anti-abuso de cortesia, status HTTP 401 na validação de 4 dígitos e aprovação em todos os testes pontuais.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_fix
- Original parent: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Milestone: M1 Remediation (Minibar Backend Fixes)

## 🔒 Key Constraints
- NUNCA trapacear ou criar implementações falsas/facades.
- Sincronização exata SHA-256 byte-a-byte entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
- AGENTS.md: NUNCA rodar testes globais (`tests/*.test.mjs`), apenas os 3 testes pontuais estritamente autorizados.
- Sempre realizar `git push origin main` após commit.
- `.agents/teamwork/` deve conter apenas metadados (nunca arquivos de código do projeto).

## Current Parent
- Conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Updated: 2026-10-21T19:50:00Z

## Task Summary
- **What to build**: Correções pontuais no demo-server (twin-servers) e suíte de testes pontual de backend do Frigobar.
- **Success criteria**:
  1. Boot sem TDZ.
  2. Paridade SHA-256 estrita entre os twin-servers.
  3. Taxa 0.99% PIX no settlement e asserções matemáticas no teste.
  4. RBAC em POST /api/minibar/inspections.
  5. Webhook Mercado Pago com resolução de MB-* e teste com asserção real "pago".
  6. Anti-abuso cortesia: bloqueio paralelo, limite de 1 kit e flat sem reserva ativa.
  7. HTTP 401 para 4 dígitos incorretos e priorização de checkout recente.
  8. Heurística base64 preservando URLs > 200 chars.
  9. Coerção de quantidades (ignorar <= 0).
  10. Testes pontuais passando 100%.
  11. Git commit e git push concluídos.
- **Interface contracts**: `.agents/teamwork/orchestrator_16/PROJECT.md`
- **Code layout**: `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/minibar-backend-flow.test.mjs`

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: Not run yet
- **Lint status**: Clean
- **Tests added/modified**: `tests/minibar-backend-flow.test.mjs`

## Key Decisions Made
- [TBD]

## Artifact Index
- `DISPATCH.md` — Despacho e diretrizes recebidas do orquestrador
- `BRIEFING.md` — Memória de trabalho persistente
- `progress.md` — Heartbeat e rastreio de progresso
- `changes.md` — Registro detalhado de alterações de código
- `handoff.md` — Relatório final de handoff de 5 seções
