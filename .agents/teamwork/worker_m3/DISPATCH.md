## 2026-10-22T12:31:41Z
Você é o Worker M3 (worker_m3) responsável pela implementação integral do Marco M3 (Automação WhatsApp, Comprovantes REP-P, Saldo de Horas, Lembretes Preventivos, Grade de Escalas 6x1 44h, Art. 58 CLT, Horas Extras 50%/100%, Adicional Noturno e Gestão de Férias CLT).

Seu diretório de trabalho exclusivo é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3`
A raiz do projeto é:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`

MANDATÓRIO:
1. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
2. Leia `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_17\PROJECT.md`.
3. Leia atentamente os relatórios dos 3 Explorers do Marco M3:
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_whatsapp\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_schedules\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_test_design\handoff.md`
   - O código completo da suíte de testes projetada está em:
     `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m3_test_design\hr-m3-whatsapp-schedules.test.mjs`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

PROPRIEDADE EXCLUSIVA DE ESCRITA:
- `artifacts/api-server/hr/whatsapp-automation.mjs` e `scripts/hr/whatsapp-automation.mjs`
- `artifacts/api-server/hr/schedules.mjs` e `scripts/hr/schedules.mjs`
- `artifacts/api-server/hr/router.mjs` e `scripts/hr/router.mjs`
- `artifacts/api-server/hr/index.mjs` e `scripts/hr/index.mjs`
- `artifacts/api-server/hr/timekeeping.mjs` e `scripts/hr/timekeeping.mjs` (para acoplamento de `whatsappNotification` em `registerPunch`)
- `tests/hr-m3-whatsapp-schedules.test.mjs`
- `.agents/teamwork/worker_m3/*`

SUAS TAREFAS DE IMPLEMENTAÇÃO:

1. **Implementar `artifacts/api-server/hr/whatsapp-automation.mjs` e espelhar identicamente em `scripts/hr/whatsapp-automation.mjs`**:
   - `generateRepPReceiptText(punchRecord, employee, summary)`: Formata o comprovante legal REP-P (Portaria 671 MTP) contendo Razão Social (CorpFlats Soho Residence), endereço, nome do colaborador, CPF mascarado (`123.***.***-01`), matrícula, NSR sequencial, data e hora local de Campos dos Goytacazes, tipo de batida, geolocalização e cerca virtual, dados do terminal, hash SHA-256 e saldo acumulado.
   - `calculateMonthlyHourBalance(db, employeeId, targetDate)`: Confronta as horas previstas na escala ativa até a data contra as horas trabalhadas apuradas em `db.hrTimeRecords`, retornando `{ totalWorkedMinutes, totalExpectedMinutes, balanceMinutes, formattedBalance: "+02:15" | "-00:45" | "+00:00" }`.
   - `sendPunchReceipt(db, punchRecord, employee, options)`: Envia o comprovante via Z-API (`sendZapiMessage` ou mock em teste), registrando log de auditoria em `db.hrWhatsAppLogs`. Se o colaborador for Cris (`id: 2`), Grazi (`id: 3`), prestador ou contiver "cris"/"grazi", aborta imediatamente sem envio.
   - `isDaySilencedForEmployee(db, employeeId, dateStr)`: Verifica 4 camadas defensivas (Prestadora, Férias em `hrVacations`, Escala em `hrSchedules` com folga/isDsr/afastamento/atestado/licenca, ou DSR semanal padrão) para silenciar lembretes.
   - `checkEmployeeReminders(db, employeeId, currentTimeStr)`: Avalia os 5 gatilhos (esquecimento de entrada, saída de almoço, retorno de almoço aos 50 min, alerta crítico de 6h contínuas de trabalho sem pausa per Art. 71 CLT, e esquecimento de saída) com idempotência diária per tipo per colaborador em `db.hrWhatsAppLogs`.
   - `processRemindersScan(db, options)`: Varredura de todos os colaboradores CLT ativos.
   - `getWhatsAppLogs(db, query)`: Consulta do histórico de disparos.
   - BLINDAGEM ESTRITA DE PRESTADORAS: Nunca enviar mensagem ou comprovante CLT para Cris (`id: 2`) ou Grazi (`id: 3`).

2. **Implementar `artifacts/api-server/hr/schedules.mjs` e espelhar identicamente em `scripts/hr/schedules.mjs`**:
   - `generateMonthlySchedule(db, employeeId, yearMonth, options)`: Gerador automático de escala 6x1 (44h semanais). Suporta modalidades `7h20_diarias` (440 min x 6 = 44h) e `8h_seg_sex_4h_sab` (40h + 4h = 44h). Respeita feriados oficiais (nacionais, RJ e Campos dos Goytacazes/RJ) e férias ativas. Limita o trabalho a no máximo 6 dias consecutivos antes do DSR (OJ 410 TST). Revezamento dominical legal (Art. 386 CLT e Portaria 671 MTP).
   - `getSchedules(db, query)` e `updateSchedule(db, scheduleId, payload)`.
   - `calculatePunchTolerance(actualPunches, expectedTimes)`: Tolerância do Art. 58 §1º CLT (5 min por batida, máx 10 min diários). Se ultrapassado, computa a totalidade da variação (Súmula 366 TST).
   - `calculateDayOvertimeAndNight(punches, schedule, options)`: Horas extras 50% em dias úteis normais e 100% em DSR e feriados (Lei 605/49 Art. 9º e Súmula 146 TST).
   - `calculateNightShiftAndExtension(segments, options)`: Adicional noturno urbano (22h00 às 05h00) com hora ficta reduzida de 52m30s (fator 60/52.5 = 1.142857), adicional de 20%, e prorrogação de jornada noturna após as 05h00 com hora reduzida e adicional (Súmula 60, II do TST e OJ 388 SDI-1).
   - `validateSundayRotation(schedules, gender)`: Validação de escala de revezamento de domingo (mulheres a cada 15 dias per Art. 386 CLT; homens a cada no máximo 7 semanas).
   - `validateVacationSchedule(db, employeeId, proposedPeriods)`: Regras do Art. 134 CLT (máx 3 períodos, um >= 14 dias, nenhum < 5 dias, proibição de início 2 dias antes de DSR ou feriado) e alerta de vencimento/dobra do concessivo (Art. 137 CLT).
   - `scheduleVacation(db, employeeId, vacationData)` e `getVacations(db, query)`.

3. **Atualizar `artifacts/api-server/hr/router.mjs` e `index.mjs` (e espelhos em `scripts/hr/`)**:
   - Em `router.mjs`, expor as novas rotas sob `/api/hr`:
     * WhatsApp: `POST /whatsapp/send-receipt`, `POST /whatsapp/check-reminders`, `GET /whatsapp/logs`, `GET /whatsapp/balance/:employeeId`.
     * Schedules: `GET /schedules`, `POST /schedules/generate-month`, `PUT /schedules/:id`, `POST /schedules/calculate-overtime-night`.
     * Vacations: `GET /vacations/:employeeId`, `POST /vacations/schedule`, `PATCH /vacations/:id/approve`.
   - Em `index.mjs`, exportar todas as funções públicas dos novos módulos e garantir inicialização de `hrWhatsAppLogs = []` em `ensureHrCollections`.
   - Em `timekeeping.mjs` (e espelho `scripts/hr/timekeeping.mjs`), acoplar `sendPunchReceipt` no final de `registerPunch` para que o response retorne `whatsappNotification: { sent: true, balanceMinutes, formattedBalance }`.

4. **Instalar a Suíte de Testes Pontual e Executar**:
   - Salvar o arquivo de teste completo em `tests/hr-m3-whatsapp-schedules.test.mjs` (baseado no gabarito projetado em `.agents/teamwork/explorer_m3_test_design/hr-m3-whatsapp-schedules.test.mjs`).
   - Executar: `node --test tests/hr-m3-whatsapp-schedules.test.mjs` -> Todos os 12 testes DEVEM PASSAR (12/12 PASS).
   - Executar: `node scripts/check-twin-parity.mjs` -> Deve auditar 34/34 arquivos e reportar 100% PASS.
   - Executar os testes anteriores para garantir regressão ZERO:
     * `node --test tests/hr-m1-backend-core.test.mjs` -> 7/7 PASS.
     * `node --test tests/hr-m2-timekeeping-compliance.test.mjs` -> 10/10 PASS.
   - NUNCA executar testes globais (`tests/*.test.mjs`).

Entregue seu relatório detalhado em `handoff.md` no seu diretório e envie mensagem ao orquestrador via `send_message`.
