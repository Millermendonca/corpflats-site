## 2026-10-13T22:06:32Z

Você é o Project Orchestrator para o projeto Guest-Flow-Manager (integração PMS CorpFlats Soho Residence com o channel manager WebBookingPro e reestruturação do módulo de precificação SEBRAE).

Seu diretório de trabalho dedicado é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1`

O caminho da solicitação original com todos os requisitos detalhados (R1 a R10), critérios de aceitação e referências é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`

Por favor:
1. Leia `ORIGINAL_REQUEST.md` na íntegra.
2. Crie e mantenha seu `BRIEFING.md` e `progress.md` em seu diretório de trabalho (`.agents/teamwork/orchestrator_1/`).
3. Trabalhe no repositório `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager` na branch `feature/wbp-integration` (nunca faça merge na `main` sem aprovação do usuário).
4. Siga estritamente todas as regras do projeto (`AGENTS.md`), incluindo:
   - Paridade byte-a-byte idêntica (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` e qualquer serviço duplicado.
   - Executar EXCLUSIVAMENTE testes pontuais específicos da integração criados neste projeto; NUNCA executar suítes completas ou testes em lote.
   - Ao alterar `artifacts/limpeza/src`, rodar build e commitar `artifacts/limpeza/dist/`.
   - Realizar `git push` a cada `git commit` na branch ativa.
5. Decomponha o trabalho, coordene os especialistas necessários, mantenha `progress.md` atualizado continuamente e comunique seus avanços e a conclusão final via handoff report.

## 2026-10-13T22:21:52Z

CORREÇÃO URGENTE do usuário (instrução mandatória para o orquestrador e repasse a todos os subagentes):

1) BRANCH: Verifique `git branch --show-current`. Se estiver na `main`, execute imediatamente `git switch -c feature/wbp-integration` a partir de `0501d02`, levando junto as alterações não commitadas da working tree. NUNCA fazer commit ou push na `main`. Confirmem a branch antes de cada commit.

2) NÃO PERDER DOCUMENTAÇÃO EXISTENTE: `PROJECT.md` (projeto anterior "Smart Flat Hub") foi sobrescrito na raiz, e `TEST_INFRA.md` / `TEST_READY.md` (projeto anterior "Reservation Modification Flow") correm o mesmo risco.
   - Isole os arquivos deste projeto em diretório próprio: `docs/integracoes/webbookingpro/PROJECT.md` e `docs/integracoes/webbookingpro/TEST_INFRA.md`.
   - Restaure os originais na raiz com `git checkout 0501d02 -- PROJECT.md` (e qualquer outro arquivo pré-existente afetado).

3) `artifacts/api-server/audit_logs.jsonl` possui 11 linhas locais não commitadas que DEVEM ser preservadas (não fazer checkout ou reset desse arquivo).

Por favor, execute essas correções imediatamente e confirme o cumprimento dos três pontos.
