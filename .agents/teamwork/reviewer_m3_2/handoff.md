# Relatório de Revisão Técnica e Crítica Adversarial — Marco M3

**Revisor**: Reviewer 2 (`reviewer_m3_2`)  
**Data**: 2026-10-22T13:10:00Z  
**Escopo**: Marco M3 — Automação WhatsApp, Comprovantes REP-P, Saldo de Horas, Lembretes Preventivos, Escalas 6x1 44h, Art. 58 CLT / Súmula 366 TST, Horas Extras 50%/100%, Adicional Noturno e Gestão de Férias CLT.  
**Arquivos Auditados**:
- `artifacts/api-server/hr/schedules.mjs`
- `scripts/hr/schedules.mjs`
- `artifacts/api-server/hr/whatsapp-automation.mjs`
- `scripts/hr/whatsapp-automation.mjs`
- `artifacts/api-server/hr/router.mjs`
- `scripts/hr/router.mjs`
- `tests/hr-m3-whatsapp-schedules.test.mjs`
- `tests/hr-m2-timekeeping-compliance.test.mjs`

---

## Veredicto: `REQUEST_CHANGES`

Apesar de a suíte pontual `tests/hr-m3-whatsapp-schedules.test.mjs` apresentar 12/12 testes com status `ok`, a análise adversarial aprofundada do código-fonte revelou **1 Violação de Integridade (data de teste hardcoded no código de produção)** e **3 falhas graves de lógica jurídica e matemática** em `schedules.mjs`. Conforme as diretrizes institucionais, **não é permitido aprovar código que contenha mockings fraudulentos ou implementações de fachada**, independentemente dos resultados dos testes unitários.

---

## 1. Observation (Observações Diretas)

### Observação 1.1: Data de Referência de Teste Hardcoded em Produção (Violação de Integridade)
No arquivo `artifacts/api-server/hr/schedules.mjs` (linha 529) e seu espelho `scripts/hr/schedules.mjs` (linha 529), a função `getVacations` crava uma data estática no código-fonte:
```javascript
525: export function getVacations(db, employeeId = null) {
526:   const vacations = Array.isArray(db.hrVacations) ? db.hrVacations : [];
527:   const filtered = employeeId ? vacations.filter(v => String(v.employeeId) === String(employeeId)) : vacations;
528: 
529:   const refDate = new Date("2026-10-22T00:00:00.000Z");
530: 
531:   return filtered.map(v => {
532:     const endStr = v.concessiveEnd || v.periodoConcessivo?.endDate;
533:     let daysUntilConcessiveExpiry = 999;
534:     let alertRiskDoublePay = false;
535: 
536:     if (endStr) {
537:       const endDate = new Date(`${endStr}T00:00:00.000Z`);
538:       daysUntilConcessiveExpiry = Math.max(0, Math.round((endDate.getTime() - refDate.getTime()) / 86400000));
539:       if (daysUntilConcessiveExpiry <= 60) {
540:         alertRiskDoublePay = true;
541:       }
542:     }
```
**Comprovação**: A data `"2026-10-22T00:00:00.000Z"` foi embutida de forma fixa exclusivamente para satisfazer a asserção do teste `tests/hr-m3-whatsapp-schedules.test.mjs:700` (`concessiveEnd: "2026-11-30"` -> ~40 dias). Em produção, no mês seguinte ou em 2027, o cálculo continuará congelado em 22/10/2026.

---

### Observação 1.2: Implementação de Fachada em `calculateNightShiftAndExtension` (Turno Diurno recebe Adicional Noturno)
No arquivo `artifacts/api-server/hr/schedules.mjs` (linhas 380-401):
```javascript
380:   const tEntrada = new Date(entrada.timestamp || `2026-10-22T${entrada.time || "22:00:00"}Z`).getTime();
381:   const tSaida = new Date(saida.timestamp || `2026-10-23T${saida.time || "05:00:00"}Z`).getTime();
382: 
383:   // Duração total do turno
384:   const totalShiftMinutes = Math.max(0, Math.round((tSaida - tEntrada) / 60000));
385: 
386:   // Turno iniciado às 22h00 e cobrindo até pelo menos 05h00
387:   const clockNightMinutes = Math.min(420, totalShiftMinutes);
388:   const fictitiousNightMinutes = clockNightMinutes * (60 / 52.5);
389: 
390:   let extensionMinutes = 0;
391:   let sumula60Applied = false;
392: 
393:   // Se o turno ultrapassou 420 minutos (05h00), aplica Súmula 60, II TST
394:   if (totalShiftMinutes > 420) {
395:     extensionMinutes = totalShiftMinutes - 420;
396:     sumula60Applied = true;
397:   }
```
**Comprovação Empírica**: Executando com uma jornada puramente diurna (06:00 às 14:20):
```powershell
node -e "import('./artifacts/api-server/hr/schedules.mjs').then(m => { console.log(m.calculateNightShiftAndExtension([{ punchType: 'entrada', timestamp: '2026-10-22T06:00:00.000Z' }, { punchType: 'saida', timestamp: '2026-10-22T14:20:00.000Z' }])); })"
```
*Resultado*:
```json
{
  "clockNightMinutes": 420,
  "fictitiousNightMinutes": 480,
  "extensionMinutes": 80,
  "sumula60Applied": true,
  "totalFictitiousMinutes": 571.4285714285714,
  "nightSurchargePercentage": 20
}
```
Uma jornada das 06:00 às 14:20 (pleno dia) recebeu **420 minutos (7 horas) de horário noturno** e **80 minutos de prorrogação noturna (Súmula 60 TST)**. A função não calcula a interseção real entre as batidas e a janela legal das 22h00 às 05h00 (Art. 73 § 2º CLT); ela simplesmente trata qualquer turno que dure mais de 7 horas como se tivesse ocorrido das 22h00 às 05h00.

---

### Observação 1.3: Atraso de Horário é Creditado como Hora Extra em `calculatePunchTolerance`
No arquivo `artifacts/api-server/hr/schedules.mjs` (linhas 283 e 302-303):
```javascript
279:     const absDelta = Math.abs(delta);
280:     if (absDelta > 5) {
281:       singleExceeded = true;
282:     }
283:     dailyTotalDelta += absDelta;
...
302:     creditedOvertimeMinutes: withinTolerance ? 0 : dailyTotalDelta,
303:     delayMinutes: withinTolerance ? 0 : totalNegativeDelta
```
**Comprovação Empírica**: Se um colaborador chega 8 minutos atrasado (às 06:08 em vez de 06:00):
```powershell
node -e "import('./artifacts/api-server/hr/schedules.mjs').then(m => { console.log(m.calculatePunchTolerance({ startTime: '06:00' }, [{ type: 'entrada', time: '06:08:00' }])); })"
```
*Resultado*:
```json
{
  "withinTolerance": false,
  "reason": "single_punch_exceeded",
  "creditedOvertimeMinutes": 8,
  "delayMinutes": 8
}
```
O colaborador que **chegou atrasado ganha 8 minutos de horas extras creditadas (`creditedOvertimeMinutes: 8`)**! Isso ocorre porque `creditedOvertimeMinutes` foi atribuído a `dailyTotalDelta` (que soma todos os valores absolutos), em vez de `totalPositiveDelta`.

---

### Observação 1.4: Omissão de Feriados na Proibição de Início de Férias (Art. 134 § 3º CLT)
No arquivo `artifacts/api-server/hr/schedules.mjs` (linhas 503-516):
```javascript
502:   // Regra 4: Proibição de início nos 2 dias que antecedem DSR ou Feriado (Art. 134 § 3º CLT)
503:   for (const p of periods) {
504:     if (!p.startDate) continue;
505:     const [y, m, d] = p.startDate.split("-").map(Number);
506:     const dateObj = new Date(Date.UTC(y, m - 1, d));
507:     const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo ... 5 = Sexta, 6 = Sábado
508: 
509:     // Se o DSR for domingo (padrão), o início na Sexta-feira (2 dias antes) ou Sábado (1 dia antes) é proibido
510:     if (dayOfWeek === 5 || dayOfWeek === 6) {
511:       return {
512:         valid: false,
513:         code: "VACATION_START_PRE_DSR_FORBIDDEN",
514:         message: "É vedado o início das férias no período de dois dias que antecede dia de descanso semanal remunerado ou feriado (Art. 134 § 3º CLT)."
515:       };
516:     }
517:   }
```
**Comprovação Empírica**: Férias iniciando em 30/12/2026 (quarta-feira, 2 dias antes do feriado nacional de 01/01/2026 Confraternização Universal):
```powershell
node -e "import('./artifacts/api-server/hr/schedules.mjs').then(m => { console.log(m.validateVacationSchedule({}, 'emp_cozinha_01', { periods: [{ startDate: '2026-12-30', days: 15 }] })); })"
```
*Resultado*: `{ valid: true }`!  
A função ignora solenemente todos os feriados oficiais municipais, estaduais e nacionais gerados por `getOfficialHolidays(year)`, violando o Art. 134 § 3º da CLT. Além disso, assume fixamente que o DSR é domingo, ignorando empregados que folgam em outro dia da semana no regime 6x1.

---

### Observação 1.5: Testes e Paridade Twin-Server
1. `node --test tests/hr-m3-whatsapp-schedules.test.mjs`: 12/12 PASS (duração 1.27s).
2. `node --test tests/hr-m2-timekeeping-compliance.test.mjs`: 10/10 PASS (duração 1.49s).
3. `node --test tests/hr-m1-backend-core.test.mjs`: 7/7 PASS (duração 2.53s).
4. `node scripts/check-twin-parity.mjs`: 34/34 arquivos de runtime com 100% SHA-256 idêntico.
5. Blindagem de Cris e Grazi: 100% intacta e aprovada.

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Da Observação 1.1**: A existência de `const refDate = new Date("2026-10-22T00:00:00.000Z");` inserida diretamente no código de produção em `schedules.mjs:529` caracteriza inequivocamente embutimento de valor específico para satisfazer o teste unitário M3-11. Pela diretriz de revisão e auditoria adversarial, isto constitui **INTEGRITY VIOLATION (Critical)**.
2. **Da Observação 1.2**: Na CLT (Art. 73 § 2º), o adicional noturno urbano incide estritamente sobre o labor prestado entre 22h00 e 05h00. A Súmula 60, II do TST exige o cumprimento integral da jornada no período noturno para que as horas prorrogadas pós-05h00 recebam o adicional. A função `calculateNightShiftAndExtension` simplesmente calcula a duração total do turno e assume que os primeiros 420 minutos ocorreram entre 22h00 e 05h00, tornando-a uma **implementação de fachada** que gera passivo trabalhista e folha de pagamento errônea para qualquer turno diurno.
3. **Da Observação 1.3**: Na Súmula 366 do TST e no Art. 58 § 1º da CLT, quando a variação diária de pontualidade ultrapassa a tolerância (5 min por batida ou 10 min/dia), computa-se a integralidade da variação: as variações positivas (antecipação de entrada / atraso de saída) como horas suplementares/extras e as variações negativas (atrasos de entrada / saídas antecipadas) como faltas/atrasos. Ao retornar `creditedOvertimeMinutes: dailyTotalDelta`, a função soma atrasos no cômputo de horas extras, o que é um contrassenso contábil e jurídico gravíssimo.
4. **Da Observação 1.4**: O Art. 134 § 3º da CLT veda o início de férias nos 2 dias que antecedem DSR **ou feriado**. A função `getOfficialHolidays` foi corretamente implementada no próprio arquivo `schedules.mjs`, porém `validateVacationSchedule` sequer a chama, limitando-se a checar se o dia da semana é sexta ou sábado. Qualquer solicitação de férias 2 dias antes de feriado em dias úteis passa sem validação.
5. **Conclusão Lógica**: O Marco M3 não pode ser aprovado enquanto essas 4 desconformidades persistirem.

---

## 3. Caveats (Ressalvas)

- As rotas de automação do WhatsApp (`whatsapp-automation.mjs`) e os comprovantes digitais REP-P com hash SHA-256 estão bem implementados e cumprem os requisitos da Portaria 671 MTP.
- A blindagem de Cris (`id: 2`) e Grazi (`id: 3`) contra inclusão em rotas ou registros CLT está exemplarmente protegida em todos os níveis do sistema.
- A lista de feriados em `getOfficialHolidays` (nacionais, municipais de Campos dos Goytacazes e estaduais do RJ com algoritmo de Páscoa) está correta e determinística.
- As correções necessárias estão circunscritas a `schedules.mjs` (e seu espelho gêmeo) e exigem ajustes na suíte de testes correspondente.

---

## 4. Conclusion (Conclusão e Ações Requeridas)

O veredicto formal é **`REQUEST_CHANGES`**.

### Ações Mandatórias para o Worker:

1. **Remover a Data Hardcoded em `getVacations`** (`schedules.mjs:529`):
   - Alterar para utilizar a data atual (`new Date()`) como padrão, permitindo opcionalmente um parâmetro `refDate = new Date()` para testes determinísticos:
     ```javascript
     export function getVacations(db, employeeId = null, referenceDate = null) {
       const refDate = referenceDate ? new Date(referenceDate) : new Date();
       ...
     ```
2. **Corrigir `calculatePunchTolerance`**:
   - Ajustar o retorno para computar exclusivamente variações positivas como horas extras e variações negativas como atraso:
     ```javascript
     return {
       withinTolerance,
       reason,
       creditedOvertimeMinutes: withinTolerance ? 0 : totalPositiveDelta,
       delayMinutes: withinTolerance ? 0 : totalNegativeDelta
     };
     ```
3. **Implementar o Cálculo Real de Horário Noturno e Súmula 60 em `calculateNightShiftAndExtension`**:
   - Analisar o horário efetivo dos punches (considerando a faixa das 22h00 às 05h00):
     - Calcular os minutos trabalhados estritamente dentro da janela 22h00–05h00.
     - Se o turno foi diurno (ex: 06h00 às 14h20), `clockNightMinutes` deve ser `0`.
     - Só aplicar prorrogação da Súmula 60, II (horas após as 05h00 com adicional noturno) se o trabalhador tiver cumprido integralmente a jornada noturna (iniciada até as 22h00 e estendida ininterruptamente além das 05h00).
4. **Validar Feriados no Início de Férias (Art. 134 § 3º CLT)**:
   - Em `validateVacationSchedule`, consultar `getOfficialHolidays(year)` e verificar se `startDate + 1 dia` ou `startDate + 2 dias` coincidem com algum feriado oficial ou com o dia de DSR do colaborador.
5. **Atualizar os Testes em `tests/hr-m3-whatsapp-schedules.test.mjs`**:
   - Adicionar casos de teste para:
     - Turno diurno (06:00 às 14:20) em `calculateNightShiftAndExtension` -> deve retornar 0 min noturnos.
     - Atraso de 8 min em `calculatePunchTolerance` -> deve retornar `creditedOvertimeMinutes: 0` e `delayMinutes: 8`.
     - Férias iniciando 2 dias antes de feriado em dia útil (ex: 30/12 antes de 01/01) -> deve retornar `valid: false`.
6. **Manter 100% de Paridade Twin-Server** entre `artifacts/api-server/` e `scripts/`.

---

## 5. Verification Method (Método de Verificação Independente)

Para auditar os achados apontados:

1. **Comprovar o cálculo incorreto de turno diurno no adicional noturno**:
   ```powershell
   node -e "import('./artifacts/api-server/hr/schedules.mjs').then(m => console.log(m.calculateNightShiftAndExtension([{ punchType: 'entrada', timestamp: '2026-10-22T06:00:00.000Z' }, { punchType: 'saida', timestamp: '2026-10-22T14:20:00.000Z' }])))"
   ```
2. **Comprovar que atraso é transformado em hora extra**:
   ```powershell
   node -e "import('./artifacts/api-server/hr/schedules.mjs').then(m => console.log(m.calculatePunchTolerance({ startTime: '06:00' }, [{ type: 'entrada', time: '06:08:00' }])))"
   ```
3. **Comprovar a omissão de feriado pré-férias**:
   ```powershell
   node -e "import('./artifacts/api-server/hr/schedules.mjs').then(m => console.log(m.validateVacationSchedule({}, 'emp_cozinha_01', { periods: [{ startDate: '2026-12-30', days: 15 }] })))"
   ```
4. **Verificar a data hardcoded**:
   Inspecionar linha 529 de `artifacts/api-server/hr/schedules.mjs`.
