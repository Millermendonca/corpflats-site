# BRIEFING — 2026-11-10T03:39:00Z

## Mission
Aplicar a correção cirúrgica do bug identificado pelo Revisor 1 em `artifacts/api-server/maid-automation-service.mjs`, garantindo que templates customizados de `trigger_daily_review_summary` não sejam resetados em `ensureConfig()`, enriquecer `resolveMaidTemplateTags` com tags de avaliação para modal de teste, e dinamicizar data em `dispatchNovemberRetroactiveReviews`.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_fix
- Original parent: 5c040e5e-c55e-4650-ac48-960c732d710d
- Milestone: M3-fix

## 🔒 Key Constraints
- Minimal change principle.
- Sincronização atômica entre `artifacts/api-server/maid-automation-service.mjs` e `scripts/maid-automation-service.mjs` com paridade SHA-256 byte-a-byte idêntica (`check-twin-parity.mjs`).
- NUNCA executar testes globais, varreduras ou em lote (proibido rodar tests/*.test.mjs).
- Executar exclusivamente o teste pontual especificado no dispatch (`tests/maid-review-ai-synthesis.test.mjs`).
- Preservar integridade estrita (sem hardcoding, sem mocks/falsificações).

## Current Parent
- Conversation ID: 5c040e5e-c55e-4650-ac48-960c732d710d
- Updated: 2026-11-10T03:39:00Z

## Task Summary
- **What to build**:
  1. Restringir reset em `ensureConfig()` apenas a `trigger_daily_summary` e `trigger_quinzena_closing`.
  2. Adicionar substituição de `{{lista_avaliacoes}}` e `{{media_dia}}` em `resolveMaidTemplateTags`.
  3. Substituir data estática `"2026-11-10"` por `getBrasiliaNow().date` em `dispatchNovemberRetroactiveReviews`.
  4. Sincronizar twin server `scripts/maid-automation-service.mjs` via `Copy-Item`.
  5. Validar via `check-twin-parity.mjs`.
  6. Validar o teste do bug de template via script node inline.
  7. Rodar teste pontual `node --test tests/maid-review-ai-synthesis.test.mjs`.
- **Success criteria**: 100% twin-server parity, template bug test passes, 44/44 tests pass in `maid-review-ai-synthesis.test.mjs`.
- **Interface contracts**: `maidAutomationConfig` schema, `AgentToolResponse`, Z-API.
- **Code layout**: `artifacts/api-server/maid-automation-service.mjs` mirrored to `scripts/maid-automation-service.mjs`.

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/maid-automation-service.mjs`:
    - `ensureConfig()`: restrita condição de migração legada apenas a `trigger_daily_summary` e `trigger_quinzena_closing`.
    - `resolveMaidTemplateTags`: adicionada resolução das tags `{{lista_avaliacoes}}` e `{{media_dia}}` com fallback formatado real.
    - `dispatchNovemberRetroactiveReviews`: substituída data estática por `getBrasiliaNow().date`.
  - `scripts/maid-automation-service.mjs`: sincronizado 100% byte-a-byte via Copy-Item.
- **Build status**: Pass (100% Twin-Server SHA-256 Parity)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (44/44 tests passed in `tests/maid-review-ai-synthesis.test.mjs`)
- **Lint status**: Clean
- **Tests added/modified**: Testes pontuais executados e validados

## Loaded Skills
- None

## Key Decisions Made
- `resolveMaidTemplateTags` extrai avaliações fornecidas em `extra.reviews`, `extra.reviewsList`, ou recorre a um exemplo formatado e realista com a data do dia em Brasília (`stats.todayBr` ou `getBrasiliaNow().date`).
- A trava de reset em `ensureConfig` foi isolada especificamente aos IDs de quinzena que usam `saldo_liquido_quinzena`, blindando o template customizado do resumo de avaliações.

## Artifact Index
- DISPATCH.md — Assignment instructions
- BRIEFING.md — Persistent state
- progress.md — Liveness heartbeat
- handoff.md — 5-component handoff report
