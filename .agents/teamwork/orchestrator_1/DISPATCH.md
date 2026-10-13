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

## 2026-10-13T22:50:11Z

ALERTA DE RISCO OPERACIONAL PARA O MARCO 2 (Mandatório - repassar imediatamente ao worker_m2 e subagentes):

O motor de tarifas atual (`calculateDailyRate`, `getTariffSettings`, `calculateSebraeSustainableRate`, `db.tariffSettings`/`tariffOverrides`) é usado FORA da integração: no motor de reservas do site (direct-booking), nas cotações do bot (`/api/bot-actions/quote`), na tela de Tarifas e no cálculo de `dailyRates` ao criar reservas manuais. Conforme R1, com a integração desligada o sistema DEVE se comportar EXATAMENTE como hoje.

Diretrizes obrigatórias para o Marco 2:
1) A nova precificação SEBRAE (custos corrigidos, imposto de 6%, sazonalidade por ocupação real etc.) NÃO PODE alterar os preços que o site, o bot e as reservas manuais calculam hoje enquanto o usuário não a ativar explicitamente, pela pré-visualização e "Publicar" ou por uma chave própria. Os valores e os modos existentes de `db.tariffSettings` devem ser preservados intactos, sem migração destrutiva.
2) O cálculo canônico de disponibilidade alimenta o ARI. Nas telas atuais, ele só pode ACRESCENTAR avisos de conflito, sem bloquear e sem mudar os resultados dos endpoints de disponibilidade existentes para o site e o bot, a menos que explicitamente aprovado.
3) Incluir no M2 um TESTE PONTUAL DE REGRESSÃO obrigatório: com a integração desligada e sem nenhuma publicação, `calculateDailyRate` e o endpoint de cotação devem retornar os mesmos valores exatos de antes da mudança para um conjunto de datas, flats e canais.

Por favor, confirme a recepção e o repasse ao worker_m2.

## 2026-10-13T23:10:08Z

REVISÃO BLOQUEANTE DO USUÁRIO/ORQUESTRADOR-PAI SOBRE tests/wbp-integration/m2-availability-pricing.test.mjs (BLOQUEANTE para o gate do M2 — não submeter nem executar o gate antes de corrigir):

1) ISOLAMENTO QUEBRADO (crítico):
   - Imports ESM são içados (hoisted). O `delete process.env.DATABASE_URL` na linha 24 roda DEPOIS de `demo-server.mjs` ter sido avaliado.
   - O teste não define `DATA_FILE` nem `NODE_ENV=test`, arriscando carregar ou regravar o `data/database.json` REAL.
   - CORREÇÃO: Definir `DATABASE_URL` removida, `DATA_FILE=cópia temporária em os.tmpdir()` e `NODE_ENV=test` ANTES do carregamento (via `await import()` dinâmico ou setup importado primeiro; ou servidor filho isolado como em `tests/tariff-engine.test.mjs`).
   - Provar no teste que `DB_FILE` aponta para a cópia e que o `data/database.json` real não teve mtime/hash alterado.

2) GUARDA DE NÃO-REGRESSÃO COM VALORES-OURO REAIS:
   - Não basta verificar proporções relativas.
   - Comparar com valores-ouro do comportamento LEGADO real: gerar valores de `calculateDailyRate` (vários flats, datas úteis/fins de semana/alta/baixa, canais direct/booking/airbnb, com/sem overrides P1-P4) extraindo o demo-server da `main` (`git show 0501d02:artifacts/api-server/demo-server.mjs` num diretório temporário, sobre a MESMA cópia de dados) e afirmar igualdade exata com o da branch com integração desligada/não publicada.

3) COTAÇÃO BOT E SITE:
   - Adicionar comparação legado vs branch da cotação do bot (`/api/bot-actions/quote`) e do endpoint de preço usado pelo site público com integração desligada.

4) REGRAS AGENTS.md:
   - Executar EXCLUSIVAMENTE este arquivo de teste pontual; proibições de testes em lote e de silenciar notificações permanecem ativas.

Repasse imediatamente ao `worker_m2`. Antes de iniciar o gate, envie as linhas alteradas e a confirmação para validação.

## 2026-10-13T23:22:08Z

REVISÃO DE AJUSTES FINAIS PARA tests/wbp-integration/m2-availability-pricing.test.mjs (Mandatório antes do gate de M2):

1) P1–P4 (linhas 789–836):
   - Os overrides foram gravados no arquivo DEPOIS do spawn; como o demo-server mantém estado em memória, os servidores estavam comparando sem overrides.
   - CORREÇÃO: Injetar os overrides na cópia ANTES do spawn (ou via API nos dois) e ASSERTAR explicitamente que o override foi aplicado e reflete o valor correto (ex: flat 1 em 2026-11-18 direct = 399.00 nos dois) provando que o teste não é vácuo.

2) DUAS CÓPIAS DE BANCO ISOLADAS:
   - Evitar arquivo de DB único compartilhado pelos dois processos (condição de corrida com debounce).
   - Usar DUAS cópias temporárias idênticas em os.tmpdir() (uma para o legado, outra para o ativo) e removê-las no after.

3) ORDEM DE EXECUÇÃO E RESERVA:
   - A criação de reserva (POST /api/pms/reservations na linha 685) ocorre só no servidor ativo antes das comparações, gerando divergência de estado para availability/quote.
   - Mover esse teste para DEPOIS das comparações ou usar instância isolada.
   - Garantir que as comparações de availability/quote cubram também datas com reservas existentes na base inicial.

Repasse ao worker_m2, execute exclusivamente este arquivo de teste pontual e me reporte a contagem final de testes e a asserção do item 1.

## 2026-10-13T23:27:41Z

Ajustes validados com sucesso!
As asserções explícitas de P1–P4 (R$ 399,00 a R$ 499,00), o isolamento com as duas bases em os.tmpdir() e a preservação estrita do data/database.json atendem integralmente aos requisitos da revisão bloqueante.

Está AUTORIZADO o disparo do Portão de Qualidade do Marco 2 (Reviewers, Challengers e Forensic Auditor). Prossiga com o portão e reporte os veredictos.
