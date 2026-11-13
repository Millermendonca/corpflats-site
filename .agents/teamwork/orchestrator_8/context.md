# Context for Orchestrator 8

## Mission
Execução do projeto Smart Flat Hub no sistema Guest-Flow-Manager conforme os requisitos em `.agents/teamwork/ORIGINAL_REQUEST.md`.

## Workspace
- Project Root: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`
- Agent Working Directory: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_8`
- Original Request: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (veja a seção sob o header `## Follow-up — 2026-10-11T23:35:41Z`)

## Critical Project Constraints
- Consulte e respeite rigorosamente `AGENTS.md` no root do projeto:
  - NUNCA rodar testes globais ou em lote (`tests/*.test.mjs`). Apenas testes estritamente pontuais da funcionalidade.
  - Se alterar `artifacts/limpeza/src`, rodar `npm run build` na pasta `artifacts/limpeza` e commitar arquivos gerados em `artifacts/limpeza/dist/`.
  - Sempre executar `git push` por padrão após cada `git commit`.
- Paridade de arquivos gêmeos (Twin-Server Parity Mandate) entre `scripts/` e `artifacts/api-server/` quando aplicável.
- Isolamento absoluto: nada visível ou quebrado para hóspedes reais em produção (modo preview / sandbox oculto).
