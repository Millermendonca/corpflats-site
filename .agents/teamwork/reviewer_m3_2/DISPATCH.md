## 2026-10-22T12:54:38Z
Você é o Reviewer 2 (reviewer_m3_2) para o Marco M3 (Escalas 6x1 44h, Art. 58 CLT, Horas Extras 50%/100%, Adicional Noturno e Gestão de Férias CLT).
Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m3_2`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (seções R4 e R7).
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md` (Features F15, F16, F17, F18).
3. Leia o relatório do worker: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3\handoff.md`.

SUA MISSÃO DE REVISÃO TÉCNICA:
1. Examinar minuciosamente o código implementado em `artifacts/api-server/hr/schedules.mjs` e seu espelho em `scripts/hr/schedules.mjs`:
   - Feriados oficiais: municipais de Campos dos Goytacazes/RJ (Santo Amaro 15/01, Santíssimo Salvador 06/08), estadual do RJ (São Jorge 23/04), móveis e nacionais.
   - `generateMonthlySchedule`: grade 6x1 44h (modalidades 7h20 e 8h+4h), limite de 6 dias consecutivos sem folga (OJ 410 TST), revezamento dominical (quinzenal para mulheres per Art. 386 CLT e máx 7 semanas para homens).
   - `calculatePunchTolerance`: Art. 58 §1º CLT (5 min/batida, 10 min/dia) e aplicação estrita da regra da integralidade (Súmula 366 TST).
   - `calculateDayOvertimeAndNight`: apuração de horas extras 50% em dias normais e 100% em DSR trabalhado e feriados (Lei 605/49 Art. 9º).
   - `calculateNightShiftAndExtension`: horário noturno urbano (22h00 às 05h00), hora ficta de 52m30s (fator 60/52.5 = 1.142857), adicional de 20% e prorrogação pós-05h00 per Súmula 60, II do TST.
   - Gestão de Férias: validação do Art. 134 CLT (máx 3 períodos, um >= 14 dias, nenhum < 5 dias, proibição de início 2 dias antes de DSR ou feriado) e alerta de risco de dobra do concessivo (Art. 137 CLT).
   - Blindagem estrita de Cris (`id: 2`) e Grazi (`id: 3`): nenhuma rotina CLT deve aceitar ou processar prestadoras.
2. Executar as verificações pontuais:
   - `node --test tests/hr-m3-whatsapp-schedules.test.mjs` (NUNCA rodar testes globais).
   - `node --test tests/hr-m2-timekeeping-compliance.test.mjs` (verificar ausência de regressões).
3. Escrever seu relatório em `handoff.md` com veredicto explícito: `APPROVE` ou `REQUEST_CHANGES`.
4. Enviar mensagem ao orquestrador via `send_message`.
