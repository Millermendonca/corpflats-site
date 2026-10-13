## 2026-10-13T22:48:50Z
You are the Milestone 2 Implementation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_sebrae\handoff.md` and `analysis.md`
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_codebase\handoff.md` and `analysis.md`

Your Scope (Milestone 2: Canonical Availability & SEBRAE Pricing Engine with Locks):
1. Canonical Availability Engine:
   - Implement `artifacts/api-server/wbp/availability.mjs` and mirror byte-for-byte in `scripts/wbp/availability.mjs`.
   - Implement `calculateCanonicalAvailability(startDate, endDate, options)` resolving the 4 divergent calculations in the legacy codebase across the 19 flats.
   - Accurately account for: active reservations, roomBlocks, active non-expired holds/pre-reservations, and maintenance OS that block flats.
   - Provide non-blocking conflict warnings for reservation creation/movement routes in `demo-server.mjs`.
2. SEBRAE Pricing Engine:
   - Implement `artifacts/api-server/wbp/pricing.mjs` and mirror byte-for-byte in `scripts/wbp/pricing.mjs`.
   - Implement exact SEBRAE math:
     - Fixed cost per sold unit = 38,906.61 / (19 * 31 * 0.65) = R$ 101.62.
     - Variable costs: cleaning R$ 23.25 + linen R$ 15.51 + energy/water R$ 9.00 = R$ 47.76 (R$/day commission removed!).
     - Total UH cost = R$ 149.38.
     - Tarifa Mínima = 149.38 / (1 - 0.15 comissão - 0.25 margem - 0.06 imposto Simples/ISS) = R$ 276.63 (± R$ 0.05).
     - Analytical decomposition: Custo R$ 149.38 + Comissão R$ 41.49 + Margem R$ 69.16 + Imposto R$ 16.60 = R$ 276.63, closing 100% with zero residue.
     - Historical occupancy-based seasonality with manual override.
3. Pricing Safety Locks:
   - Floor lock: reject/block sending any rate below `max(tarifaMinima, pisoManual)`.
   - Variation lock (30% default): changes >30% compared to the last sent rate are automatically retained and require explicit confirmation.
   - Staged publication: configuration, cost, and rate changes remain in draft/staged state until previewed and published.
4. Breakfast Surcharge:
   - "Sem café" = base rate.
   - "Com café" = "Sem café" + surcharge per guest per night (e.g. R$ 25/guest), correctly populated in `rate`, `rdef_single`, and `adult_3`.
5. Twin Files Parity & Integration:
   - Mount new availability and pricing functions/endpoints in `artifacts/api-server/demo-server.mjs` and mirror byte-for-byte in `scripts/demo-server.mjs`.
   - Ensure 100% SHA-256 byte-by-byte parity across all twin file pairs.
6. Targeted Tests:
   - Create `tests/wbp-integration/m2-availability-pricing.test.mjs` and run exclusively via `node --test tests/wbp-integration/m2-availability-pricing.test.mjs` with `DATABASE_URL` unset.
   - Verify: availability across all 4 conflict scenarios, exact SEBRAE math (149.38 -> 276.63 closing 100%), breakfast surcharge mapping, and the 3 safety locks. (NEVER run global sweeps!).
7. Git & Commit:
   - Verify `git branch --show-current` is `feature/wbp-integration`.
   - Commit and `git push` to `origin feature/wbp-integration`.

## 2026-10-13T22:50:35Z
**Context**: ALERTA MANDATÓRIO DE RISCO OPERACIONAL PARA O MARCO 2.
**Content**:
O usuário determinou diretrizes obrigatórias de NÃO-REGRESSÃO para o Marco 2:
1. O motor de tarifas legado (`calculateDailyRate`, `getTariffSettings`, `calculateSebraeSustainableRate`, `db.tariffSettings`/`tariffOverrides`) é usado pelo motor de direct-booking do site, cotações do bot (`/api/bot-actions/quote`), tela de Tarifas e criação manual de reservas.
2. A nova precificação SEBRAE (custos corrigidos, 6% de imposto, sazonalidade por ocupação etc.) NÃO PODE alterar os preços calculados pelo site, bot e reservas manuais enquanto a nova tarifa não for ativada explicitamente pelo administrador (via pré-visualização + "Publicar" ou flag própria). Os valores e modos existentes de `db.tariffSettings` devem ser preservados intactos, sem migração destrutiva.
3. O cálculo canônico de disponibilidade alimenta o ARI e as telas internas. Nas telas atuais de recepção/site/bot, ele só pode ACRESCENTAR avisos claros de conflito, sem bloquear e sem alterar os resultados dos endpoints existentes de disponibilidade para o site/bot.
4. INCLUIR TESTE PONTUAL DE REGRESSÃO OBRIGATÓRIO em `tests/wbp-integration/m2-availability-pricing.test.mjs`: provar que com a integração desligada e sem publicação, `calculateDailyRate` e `/api/bot-actions/quote` retornam os mesmos valores exatos de antes para as datas, flats e canais existentes.
**Action**: Implemente M2 cumprindo rigorosamente essas travas de compatibilidade e não-regressão.

## 2026-10-13T23:10:38Z
**Context**: REVISÃO BLOQUEANTE DO USUÁRIO/ORQUESTRADOR-PAI SOBRE tests/wbp-integration/m2-availability-pricing.test.mjs.
**Content**:
ATENÇÃO: Instrução mandatória e bloqueante para o Marco 2 antes de qualquer gate:
1. **ISOLAMENTO DO TESTE (Crítico)**:
   - Imports ESM estáticos são içados (hoisted); qualquer manipulação de `process.env` feita no corpo do arquivo de teste ocorre DEPOIS de `demo-server.mjs` ter sido carregado e avaliado.
   - O teste DEVE garantir `delete process.env.DATABASE_URL`, `process.env.DATA_FILE = cópia em os.tmpdir()` e `process.env.NODE_ENV = 'test'` rigorosamente ANTES de qualquer import do servidor (use `await import(...)` dinâmico ou spawne servidor isolado em porta dedicada como em `tests/tariff-engine.test.mjs`).
   - O teste deve incluir asserção explícita provando que o banco em uso é a cópia temporária e que o `data/database.json` real não teve mtime nem hash alterados.
2. **NÃO-REGRESSÃO COM VALORES-OURO REAIS**:
   - Não use proporções aproximadas.
   - Extraia a versão legada de `demo-server.mjs` de `0501d02` (`git show 0501d02:artifacts/api-server/demo-server.mjs` em arquivo temporário sobre a mesma cópia do banco) e compare o resultado exato de `calculateDailyRate` entre a versão legada e a branch ativa (com integração desligada/não publicada) para múltiplos flats, dias úteis, finais de semana, alta/baixa temporada, canais `direct`, `booking`, `airbnb` e com/sem overrides P1-P4.
3. **COTAÇÃO BOT E SITE**:
   - Compare os resultados reais da rota `/api/bot-actions/quote` e do endpoint de direct-booking entre legado e branch com integração desligada.
4. **REGRAS AGENTS.md**:
   - Execute EXCLUSIVAMENTE esse arquivo de teste pontual.
**Action**: Ajuste imediatamente o teste e a implementação conforme essas 4 regras. Ao concluir, reporte as linhas alteradas e o resultado da execução.

## 2026-10-13T23:22:35Z
**Context**: AJUSTES FINAIS OBRIGATÓRIOS PARA tests/wbp-integration/m2-availability-pricing.test.mjs.
**Content**:
O usuário/orquestrador-pai identificou 3 correções pontuais obrigatórias no teste antes do portão:
1. **P1–P4 (Overrides de Tarifa)**:
   - Os overrides estavam sendo gravados no arquivo DEPOIS do spawn; como o `demo-server` mantém estado em memória, os servidores estavam comparando sem overrides.
   - CORREÇÃO: Injetar os overrides nas cópias do banco ANTES do spawn (ou via API em ambos) e ASSERTAR explicitamente que o override foi aplicado e reflete o valor correto (ex: flat 1 em 2026-11-18 direct = 399.00 nos dois), provando que o teste é efetivo.
2. **DUAS CÓPIAS DE BANCO ISOLADAS**:
   - Não use arquivo de banco único compartilhado entre os dois processos (evitar condição de corrida com debounce).
   - Crie DUAS cópias temporárias idênticas em `os.tmpdir()` (uma para o legado, outra para o ativo) e limpe ambas no `after()`.
3. **ORDEM DE EXECUÇÃO E RESERVAS**:
   - A criação de reserva (`POST /api/pms/reservations`) ocorria apenas no servidor ativo antes das comparações, gerando divergência de estado para availability/quote.
   - Mova o teste de criação de reservas para DEPOIS das comparações (ou use instância isolada).
   - Garanta que as comparações de availability/quote cubram também datas com reservas pré-existentes na base inicial.
4. Execute exclusivamente este arquivo de teste (`node --test tests/wbp-integration/m2-availability-pricing.test.mjs`), faça commit e push na branch `feature/wbp-integration`, e me reporte a contagem final de testes e a asserção do item 1.
**Action**: Ajuste o arquivo de teste e reporte a contagem e evidência.
