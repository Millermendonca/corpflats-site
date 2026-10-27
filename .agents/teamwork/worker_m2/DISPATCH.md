## 2026-10-27T17:43:49Z
Você é o worker_m2 (Maid Rates & Financial Statements Worker).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2

MANDATÓRIO: Leia integralmente:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_2\analysis.md e handoff.md
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (sob ## 2026-10-27T15:53:10Z, especialmente R2 e critérios)
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_18\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Regras Críticas (AGENTS.md):
- NUNCA executar testes globais, varreduras ou em lote (PROIBIDO rodar tests/*.test.mjs).
- Paridade Twin-Server: Manter 100% SHA-256 idêntico entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs, e entre scripts/maid-automation-service.mjs e artifacts/api-server/maid-automation-service.mjs.
- Atestar no handoff EXCLUSIVAMENTE resultados empiricamente obtidos.

Propriedade Exclusiva de Arquivos deste Worker:
- artifacts/api-server/maid-automation-service.mjs
- scripts/maid-automation-service.mjs
- artifacts/api-server/demo-server.mjs
- scripts/demo-server.mjs
- tests/b2b-housekeeping-m2.test.mjs

Tarefas a Implementar:
1. Em maid-automation-service.mjs:
   - Em syncMaidCredits:
     - Ler defaultStayoverRatePerRoom (padrão 15.00) e userStayoverRate (Cris: 15.00, Grazi: 15.00).
     - Na criação de novos créditos para limpezas: se cleaningType === 'stayover' || source === 'stayover', usar userStayoverRate, description: `Diária Stayover — Flat ${flatNum}`, e persistir cleaningType: "stayover". Para checkouts, manter userRate e `Diária — Flat ${flatNum}`.
     - No loop de normalização de Setembro+ (linhas 213–228): BLINDAR contra sobrescrita indevida de stayovers! Se for stayover, a taxa esperada é userStayoverRate (R$ 15,00); para checkouts, userRate (R$ 22,50/23,25).
   - Em getMaidPeriodFinances:
     - Separar checkoutCleanings e stayoverCleanings.
     - Calcular checkoutCount, stayoverCount, checkoutGross, stayoverGross, e grossAmount = checkoutGross + stayoverGross.
     - Retornar esses campos discriminados no objeto resultante.
2. Em demo-server.mjs:
   - Em db.cleaningRates: inicializar/assegurar defaultStayoverRatePerRoom: 15.00 e userStayoverRates: { "2": 15.00, "3": 15.00 }.
   - Em GET /api/cleaning/rates: retornar defaultStayoverRatePerRoom, userStayoverRates e stayoverRate para cada cleaner.
   - Em POST /api/cleaning/rates: receber e persistir defaultStayoverRatePerRoom e userStayoverRates.
   - Em /api/analytics/report: calcular e discriminar checkoutCount e stayoverCount por camareira e no total geral, aplicando as taxas corretas.
3. Paridade Twin-Server:
   - Copiar artifacts/api-server/maid-automation-service.mjs para scripts/maid-automation-service.mjs.
   - Copiar artifacts/api-server/demo-server.mjs para scripts/demo-server.mjs.
   - Executar Get-FileHash e comprovar paridade SHA-256 e zero diff em ambos os pares.
4. Teste Pontual Dedicado:
   - Criar tests/b2b-housekeeping-m2.test.mjs testando:
     - Leitura e atualização de taxas (/api/cleaning/rates).
     - syncMaidCredits gerando créditos discriminados com R$ 15,00 para stayover e R$ 22,50 para checkout.
     - Blindagem da normalização de setembro para não sobrescrever stayover.
     - getMaidPeriodFinances retornando contagens e totais separados.
     - Paridade SHA-256 de ambos os serviços gêmeos.
   - Executar node --test tests/b2b-housekeeping-m2.test.mjs e atestar logs reais.

Entregáveis:
- Relatório em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\changes.md
- Handoff em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md
- Enviar mensagem ao orchestrator_18 com os hashes e resultados dos testes.
