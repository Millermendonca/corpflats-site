# Relatório Handoff: Estresse Adversarial de Matemática Trabalhista CLT (Marco M3)

**Agente**: `challenger_m3_1` (Critic / Empirical Challenger)  
**Destinatário**: Project Orchestrator (`58ecb31f-60d2-4e1e-9aac-82400a58c263`)  
**Data**: 2026-10-22T13:00:00Z  
**Tipo**: Hard (Revisão Concluída com Diagnóstico Empírico)  
**Veredicto**: `REQUEST_CHANGES` (Bloqueante para homologação do M3)  

---

## 1. Observation (Observações Diretas)

1. **Execução do Script de Estresse Adversarial**:
   - Comando executado:
     ```powershell
     node .agents/teamwork/challenger_m3_1/stress_schedules_math.mjs
     ```
   - Resultado do Teste Adversarial:
     ```
     ================================================================================
     INICIANDO SUÍTE ADVERSARIAL: MATEMÁTICA TRABALHISTA CLT (MARCO M3)
     ================================================================================

     --- GRUPO 1: Tolerância Art. 58 CLT e Súmula 366 TST ---
     ✅ PASS [Art. 58 CLT] Limiar 4 min: deve ser desconsiderado (withinTolerance=true, 0 HE)
     ✅ PASS [Art. 58 CLT] Limiar 5 min exatos: deve ser desconsiderado (withinTolerance=true, 0 HE)
     ✅ PASS [Art. 58 CLT / Súmula 366 TST] Limiar 6 min: extrapola tolerância individual e computa a TOTALIDADE dos 6 min
     ✅ PASS [Art. 58 CLT] Soma diária 10 min (3+2+2+3): dentro do teto diário (withinTolerance=true, 0 HE)
     ✅ PASS [Art. 58 CLT / Súmula 366 TST] Soma diária 11 min (3+3+3+2): extrapola teto diário e computa TOTALIDADE de 11 min

     --- GRUPO 2: Horário Noturno e Hora Ficta (CLT Art. 73 e Súmula 60 TST) ---
     ✅ PASS [Horário Noturno] Turno 22:00 às 05:00: 7h relógio (420 min) -> exatamente 8,0h noturnas fictas (480 min)
     ✅ PASS [Súmula 60 TST] Turno 22:00 às 07:00: 7h noturnas + 2h prorrogação pós-05h com hora ficta e 20%
     ❌ FAIL [Horário Noturno] Turno puramente diurno (08:00 às 17:00): deve resultar em exatamente 0 horas noturnas
        Esperado: {"clockNightMinutes":0,"fictitiousNightMinutes":0,"extensionMinutes":0,"sumula60Applied":false,"totalFictitiousMinutes":0}
        Obtido:   {"clockNightMinutes":420,"fictitiousNightMinutes":480,"extensionMinutes":120,"sumula60Applied":true,"totalFictitiousMinutes":617.1428571428571}
        Detalhes: {"clockNightMinutes":420,"fictitiousNightMinutes":480,"extensionMinutes":120,"sumula60Applied":true,"totalFictitiousMinutes":617.1428571428571,"nightSurchargePercentage":20}
     ❌ FAIL [Horário Noturno] Turno misto 18:00 às 23:00: apenas 1h noturna (22h-23h = 60 min) sem prorrogação
        Esperado: {"clockNightMinutes":60,"fictitiousNightMinutes":68.57,"extensionMinutes":0,"sumula60Applied":false}
        Obtido:   {"clockNightMinutes":300,"fictitiousNightMinutes":342.86,"extensionMinutes":0,"sumula60Applied":false}
        Detalhes: {"clockNightMinutes":300,"fictitiousNightMinutes":342.85714285714283,"extensionMinutes":0,"sumula60Applied":false,"totalFictitiousMinutes":342.85714285714283,"nightSurchargePercentage":20}

     --- GRUPO 3: Regras de Férias CLT (Art. 134 e Art. 137 CLT) ---
     ✅ PASS [Férias CLT Art. 134 §1º] Período máximo de 13 dias: deve rejeitar com VACATION_MIN_14_DAYS_REQUIRED
     ✅ PASS [Férias CLT Art. 134 §1º] Período de 4 dias: deve rejeitar com VACATION_MIN_5_DAYS_REQUIRED
     ✅ PASS [Férias CLT Art. 134 §3º] Início em Sexta-feira (2 dias pré-DSR domingo): deve rejeitar com VACATION_START_PRE_DSR_FORBIDDEN
     ✅ PASS [Férias CLT Art. 134 §3º] Início em Sábado (1 dia pré-DSR domingo): deve rejeitar com VACATION_START_PRE_DSR_FORBIDDEN
     ✅ PASS [Férias CLT Art. 137] Alerta de dobra: período concessivo a 30 dias do fim acusa alertRiskDoublePay=true
     ✅ PASS [Férias scheduleVacation] scheduleVacation deve lançar exceção 422 ao tentar agendar em sexta-feira

     --- GRUPO 4: Férias Antecedendo Feriado Oficial (Art. 134 § 3º CLT) ---
     ❌ FAIL [Férias CLT Art. 134 §3º (Feriado)] Início em 24/12 (1 dia antes de feriado 25/12): deve proibir início pré-feriado
        Esperado: {"valid":false,"code":"VACATION_START_PRE_HOLIDAY_OR_DSR_FORBIDDEN"}
        Obtido:   {"valid":true}
        Detalhes: {"valid":true}

     ================================================================================
     RESUMO DO ESTRESSE ADVERSARIAL
     ================================================================================
     Total de testes: 16
     Passaram: 13
     Falharam: 3
     ```

2. **Inspeção de Código — `artifacts/api-server/hr/schedules.mjs` (Linhas 380 a 409)**:
   ```javascript
   const tEntrada = new Date(entrada.timestamp || `2026-10-22T${entrada.time || "22:00:00"}Z`).getTime();
   const tSaida = new Date(saida.timestamp || `2026-10-23T${saida.time || "05:00:00"}Z`).getTime();

   // Duração total do turno
   const totalShiftMinutes = Math.max(0, Math.round((tSaida - tEntrada) / 60000));

   // Turno iniciado às 22h00 e cobrindo até pelo menos 05h00
   const clockNightMinutes = Math.min(420, totalShiftMinutes);
   const fictitiousNightMinutes = clockNightMinutes * (60 / 52.5);

   let extensionMinutes = 0;
   let sumula60Applied = false;

   // Se o turno ultrapassou 420 minutos (05h00), aplica Súmula 60, II TST
   if (totalShiftMinutes > 420) {
     extensionMinutes = totalShiftMinutes - 420;
     sumula60Applied = true;
   }

   const totalEligibleClockMinutes = clockNightMinutes + (sumula60Applied ? extensionMinutes : 0);
   const totalFictitiousMinutes = totalEligibleClockMinutes * (60 / 52.5);
   ```
   - O código não verifica a interseção do horário real com a faixa noturna (22h00 às 05h00). Ele assume que qualquer turno informado tem 420 min de jornada noturna iniciando às 22h00.
   - Além disso, se o `timestamp` não for fornecido e apenas o `time` for passado, o código hardcodeia `2026-10-22` para a entrada e `2026-10-23` para a saída, gerando turnos fantasmas de mais de 30 horas para jornadas diurnas sem data explícita.
   - O endpoint exposto em produção `POST /api/hr/schedules/calculate-overtime-night` chama diretamente essa função na linha 611 de `router.mjs`.

3. **Inspeção de Código — `artifacts/api-server/hr/schedules.mjs` (Linhas 502 a 517)**:
   ```javascript
   // Regra 4: Proibição de início nos 2 dias que antecedem DSR ou Feriado (Art. 134 § 3º CLT)
   for (const p of periods) {
     if (!p.startDate) continue;
     const [y, m, d] = p.startDate.split("-").map(Number);
     const dateObj = new Date(Date.UTC(y, m - 1, d));
     const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo ... 5 = Sexta, 6 = Sábado

     // Se o DSR for domingo (padrão), o início na Sexta-feira (2 dias antes) ou Sábado (1 dia antes) é proibido
     if (dayOfWeek === 5 || dayOfWeek === 6) {
       return {
         valid: false,
         code: "VACATION_START_PRE_DSR_FORBIDDEN",
         message: "É vedado o início das férias no período de dois dias que antecede dia de descanso semanal remunerado ou feriado (Art. 134 § 3º CLT)."
       };
     }
   }
   ```
   - O código ignora completamente os feriados oficiais (que já estão mapeados na mesma biblioteca via `getOfficialHolidays(year)`). Uma tentativa de iniciar férias na quinta-feira 24/12 (véspera de Natal) é erroneamente aprovada como válida.

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Tolerância Art. 58 CLT e Súmula 366 TST**:
   - As premissas legais da CLT e do TST determinam que variações de até 5 minutos por batida (com teto de 10 minutos diários) não devem ser computadas.
   - No entanto, uma vez ultrapassado o teto de 5 minutos em uma batida ou de 10 minutos na soma diária, computa-se a totalidade dos minutos como horas extras.
   - O teste comprovou empiricamente que a função `calculatePunchTolerance` atende 100% a essa lógica nos 5 cenários testados (4 min ok, 5 min ok, 6 min computa 6 min; 10 min ok, 11 min computa 11 min).

2. **Cálculo de Adicional Noturno e Hora Ficta**:
   - Pelo Art. 73 da CLT, o trabalho noturno urbano é compreendido exclusivamente entre as 22h00 de um dia e as 05h00 do dia seguinte.
   - A hora ficta reduzida (52m30s) e o adicional noturno de 20% aplicam-se apenas às horas trabalhadas dentro desse intervalo e, pela Súmula 60, II do TST, às horas prorrogadas após as 05h00 caso a jornada noturna tenha sido integralmente cumprida.
   - A implementação de `calculateNightShiftAndExtension` parte da falsa premissa de que qualquer turno recebido é noturno a partir das 22h00. Quando submetida a um turno puramente diurno (08:00 às 17:00), a função atribui 420 minutos noturnos + 120 minutos de prorrogação (totalizando 617,14 min fictos). Em um turno misto (18:00 às 23:00, onde apenas 1 hora é noturna), a função atribui 300 minutos noturnos.
   - Essa falha gera passivo e distorção na apuração de folha (Marco M4) e no endpoint `POST /api/hr/schedules/calculate-overtime-night`.

3. **Validação de Férias nos 2 Dias que Antecedem Feriados**:
   - O Art. 134 § 3º da CLT veda o início das férias "no período de dois dias que antecede feriado ou dia de descanso semanal remunerado".
   - Enquanto a validação contra o DSR dominical (sextas e sábados) está correta, a validação contra feriados oficiais não foi implementada, permitindo o agendamento de férias em vésperas de feriados nacionais, estaduais e municipais de Campos dos Goytacazes/RJ.

---

## 3. Caveats (Ressalvas)

- A suíte de testes original do worker (`tests/hr-m3-whatsapp-schedules.test.mjs`) passou 12/12 porque o teste `M3-10` continha apenas casos positivos noturnos (22h às 05h e 22h às 07h), omitindo os casos negativos (turnos diurnos e turnos mistos).
- O módulo `calculateDayOvertimeAndNight` opera corretamente para horas extras a 50% e 100% em dias úteis, DSR e feriados.
- Em respeito rigoroso ao `AGENTS.md` e às instruções do orquestrador, nenhum arquivo de produção foi alterado pelo Challenger.

---

## 4. Conclusion (Conclusão e Recomendações)

**Veredicto**: `REQUEST_CHANGES`.

### Correções Necessárias para o Worker:

1. **Refatorar `calculateNightShiftAndExtension` em `artifacts/api-server/hr/schedules.mjs` e `scripts/hr/schedules.mjs`**:
   - Realizar o cálculo minuto a minuto ou por fatias de intervalo entre o horário de entrada e o de saída:
     - Identificar a quantidade de minutos efetivamente trabalhados dentro da janela legal das 22:00 às 05:00 (`clockNightMinutes`).
     - Se o colaborador cumpriu integralmente o período noturno (entrada <= 22:00 e trabalhou até 05:00) e continuou trabalhando além das 05:00, calcular os minutos pós-05:00 como `extensionMinutes` e setar `sumula60Applied = true` (Súmula 60, II TST).
     - Se o turno não cruzar a janela das 22:00 às 05:00 (como 08:00 às 17:00), retornar `clockNightMinutes: 0`, `fictitiousNightMinutes: 0`, `extensionMinutes: 0`, `sumula60Applied: false`, `totalFictitiousMinutes: 0`.

2. **Adicionar checagem de feriados em `validateVacationSchedule`**:
   - Obter a lista de feriados via `getOfficialHolidays(year)`.
   - Para cada período solicitado, verificar se a `startDate` cai em um feriado oficial ou nos 2 dias que o antecedem (ex: feriado em `H`, proibido iniciar em `H`, `H-1` e `H-2`).
   - Se coincidir, rejeitar com `valid: false`, `code: "VACATION_START_PRE_HOLIDAY_FORBIDDEN"` e mensagem explicativa citando o Art. 134 § 3º da CLT.

3. **Atualizar Paridade Twin-Server e Suíte de Testes M3**:
   - Replicar as alterações identicamente em `scripts/hr/schedules.mjs`.
   - Adicionar o caso do turno diurno e do início pré-feriado no teste `tests/hr-m3-whatsapp-schedules.test.mjs`.
   - Garantir 100% de paridade SHA-256 via `node scripts/check-twin-parity.mjs`.

---

## 5. Verification Method (Método de Verificação Independente)

Para reproduzir empiricamente o diagnóstico:

1. **Executar o script de estresse adversarial**:
   ```powershell
   node .agents/teamwork/challenger_m3_1/stress_schedules_math.mjs
   ```
   *Comportamento observado*: 13 testes aprovados e 3 testes falhando com código de saída 1.

2. **Verificar os testes pontuais de regressão**:
   ```powershell
   node --test tests/hr-m3-whatsapp-schedules.test.mjs
   ```
