# Worker Dispatch: Milestone 4 - Matriz Combinatória de Estados (Pairwise Testing - R4)

## Instructions
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically section `## 2026-10-11T00:38:03Z`).
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\PROJECT.md`.
Read previous workers' handoffs:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_sandbox\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2_crawler\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_journeys\handoff.md`

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective & Owned Files
Implement the complete test suite in `e2e/suites/03-pairwise-matrix.spec.mjs` verifying the exhaustive business permutations of CorpFlats:

1. **Cenário 1: Matriz de Composições de Reserva & Durações**
   - Composições: individual (1 hóspede), casais (2 hóspedes), família com menor (2 adultos + 1 menor), lotação máxima (4 hóspedes).
   - Durações: 1 diária, pernoite, fim de semana (2 diárias), estadia longa (>15 diárias).
   - Validar cálculo de tarifas, campos gerados, status no PMS Calendar (`/reservas`) e geração de voucher/código.

2. **Cenário 2: Auditoria dos 19 Flats sob Todos os 7 Estados de Governança**
   - Auditar todos os 19 flats ativos (113, 114, 116, 211, 212, 215, 313, 408, 509, 511, 512, 605, 712, 715, 904, 905, 907, 1004, 1304).
   - Cobrir os 7 estados no dashboard de governança (`/dashboard`):
     - Vago Sujo (`dirty` / pós-checkout)
     - Limpo (`clean`)
     - Ocupado (`occupied`)
     - Saída Prevista (`checkout_today`)
     - Faxina Periódica / Estadia (`stayover`)
     - Arrumação (`touchup`)
     - Manutenção Bloqueada (`maintenance`)
   - Verificar transição de status (iniciar limpeza, concluir limpeza, bloquear e desbloquear).

3. **Cenário 3: Ciclo Completo de Ordens de Serviço Externas (Service Orders)**
   - Admin cria ordem de serviço em `/servicos`.
   - Acesso público pelo prestador de serviço via link com token `/servico/:token`.
   - Identificação do prestador principal e colaboradores.
   - Início de flat com validação de limites simultâneos (`maxSimultaneousFlats`), limites diários (`maxFlatsPerDay`) e regra de flat limpo (`cleanFlatMode`: "never", "priority", "always").
   - Conclusão com observações, flag `needsCleaning` e fotos.
   - Verificação no painel de acompanhamento do admin e badge de serviço no card da camareira.

4. **Cenário 4: Regras de Café da Manhã & Cutoff Rígido das 22:00**
   - Seleção de opções de café (bebidas, pães, frutas, restrições) para os hóspedes no portal `/cafe/:code`.
   - Submissão antes das 22:00: pedido aceito com sucesso e refletido no painel de produção da cozinha (`/pedidos-cafe` ou `breakfast-production`).
   - Avanço de relógio via time-travel para após as 22:00 (ex: 22:15).
   - Submissão após as 22:00: sistema rejeita amigavelmente com mensagem explicativa de encerramento do horário de corte.

## Twin-Server Parity & Git Rule
- Ensure `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` remain byte-by-byte identical.
- Build frontend via `npm run build` in `artifacts/limpeza` if any frontend files are touched.
- Commit and `git push origin main` per project rules.

## Output
Execute the suite with Playwright against the sandbox (`node e2e/runner.mjs e2e/suites/03-pairwise-matrix.spec.mjs`), verify 100% pass rate, and document results in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_pairwise\handoff.md`.


## 2026-10-11T05:02:32Z
Você é o Worker M4 (Matriz Combinatória de Estados - Pairwise Testing - R4).
Seu diretório de trabalho é: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_pairwise
Leia com atenção o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_pairwise\DISPATCH.md e o arquivo c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implemente e execute a suíte e2e/suites/03-pairwise-matrix.spec.mjs cobrindo:
1. Composições de reserva (solo, casal, família, lotação máxima) e durações (1 diária, pernoite, fim de semana, >15 dias).
2. Todos os 19 flats em todos os 7 estados de governança no dashboard de limpeza.
3. Ciclo completo de ordens de serviço (criação admin, portal externo via token, cadastro de prestador, início de flat com limites, fotos e conclusão com needsCleaning).
4. Regras de café da manhã e corte rígido das 22h testado com time-travel.

Execute os testes contra o sandbox local, garanta 100% de aprovação e documente os resultados em c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_pairwise\handoff.md.
