# Handoff Report: Milestone M3 Adversarial Evaluation (Tariff Calendar & Bulk Update)

**Author**: Challenger 2 (`challenger_m3_2`)  
**Target Recipient**: Orchestrator (`3364a657-c855-42a7-a46e-a5463bc245b7`)  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m3_2`  
**Date**: 2026-10-11T03:16:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Verificação de Navegação entre Canais & Markups (+18% Booking, +15% Airbnb, 0% Direto)
- **Arquivo inspecionado**: `artifacts/limpeza/src/pages/tarifas.tsx` (linhas 475–505) e `artifacts/api-server/demo-server.mjs` (linhas 20385–20394, 20433–20482).
- **Execução do Teste Empírico**: `node --test tests/challenger-m3-tariff-adversarial.test.mjs` (Subtest 1).
- **Resultados Observados**:
  - `GET /api/tariffs/calendar?month=2026-11&channel=direct`: Dia 2026-11-04 (quarta-feira) diária base R$ 237,00.
  - `GET /api/tariffs/calendar?month=2026-11&channel=booking`: Dia 2026-11-04 diária R$ 279,66 (Razão: $279,66 / 237 = 1,1800$, markup exato de +18%).
  - `GET /api/tariffs/calendar?month=2026-11&channel=airbnb`: Dia 2026-11-04 diária R$ 272,55 (Razão: $272,55 / 237 = 1,1500$, markup exato de +15%).
  - Finais de semana (2026-11-06 sexta-feira) com acréscimo de +15% do SEBRAE preservam proporcionalmente os markups dos canais.
- **Status**: **PASS**.

### 1.2 Verificação do Fluxo de Edição Individual de Célula e Exclusão (`DELETE /api/tariffs/overrides/:id`)
- **Arquivo inspecionado**: `artifacts/limpeza/src/pages/tarifas.tsx` (linhas 170–223) e `artifacts/api-server/demo-server.mjs` (linhas 20485–20596).
- **Execução do Teste Empírico**: `node --test tests/challenger-m3-tariff-adversarial.test.mjs` (Subtest 2).
- **Resultados Observados**:
  - Para override geral (`flatIds: ["all"]`), a chamada `POST /api/tariffs/bulk-update` com `rate: 299` cria o registro `hasOverride: true`.
  - A exclusão via `DELETE /api/tariffs/overrides/:id` retorna HTTP 200 `{ success: true, deletedId: "..." }` e restaura a diária ao cálculo automático do SEBRAE.
- **Status**: **PASS (apenas para overrides gerais)**.

### 1.3 Verificação da Estrutura de Payload de Edição em Lote (`POST /api/tariffs/bulk-update`)
- **Arquivo inspecionado**: `artifacts/limpeza/src/pages/tarifas.tsx` (linhas 224–271) e `artifacts/api-server/demo-server.mjs` (linhas 20485–20574).
- **Execução do Teste Empírico**: `node --test tests/challenger-m3-tariff-adversarial.test.mjs` (Subtest 3).
- **Resultados Observados**:
  - Envio sem datas: Retorna HTTP 400 `{ error: "MISSING_PARAMETERS" }`.
  - Diária negativa (`rate: -50`): Retorna HTTP 400 `{ error: "INVALID_RATE" }`.
  - Intervalo invertido (`startDate > endDate`): Retorna HTTP 400 `{ error: "INVALID_DATE_RANGE" }`.
  - Filtro por dias da semana (`daysOfWeek: [5, 6]` para 2026-11-01 a 2026-11-14): Aplica override em exatamente 4 dias (sextas e sábados), preservando os demais dias na tarifa base.
- **Status**: **PASS**.

### 1.4 Verificação do Build Frontend
- **Comando Executado**: `npm --prefix artifacts/limpeza run build`.
- **Resultado Verificado**: Código de saída `0` em 51.72s.
  ```
  dist/public/index.html                              2.65 kB │ gzip:   0.81 kB
  dist/public/assets/pdf.worker.min-rsCePomN.mjs  1,417.59 kB
  dist/public/assets/index.css                      384.58 kB │ gzip:  47.48 kB
  dist/public/assets/pdf.worker.min-DDwCJoSP.js       0.07 kB │ gzip:   0.09 kB
  dist/public/assets/pdf-z6sF223D.js                379.02 kB │ gzip: 114.08 kB
  dist/public/assets/index.js                     3,211.47 kB │ gzip: 774.55 kB
  ✓ built in 51.72s
  ```
- **Status**: **PASS**.

### 1.5 FALHA CRÍTICA ENCONTRADA: Quebra de Contrato API ↔ UI na Resolução de Overrides por Flat Individual
- **Arquivo Frontend**: `artifacts/limpeza/src/pages/tarifas.tsx`, linhas 623–628:
  ```tsx
  623: const flatOverride = (calendarData?.overrides || []).find((o: any) => 
  624:   o.date === d.date && (String(o.flatId) === String(flat.id) || String(o.flatNumber) === String(flat.number)) && (o.channel === "all" || o.channel === selectedChannel)
  625: )
  626: const hasFlatOverride = Boolean(flatOverride)
  627: const effectiveRate = hasFlatOverride ? flatOverride.rate : d.rate
  ```
- **Arquivo Backend**: `artifacts/api-server/demo-server.mjs` (e espelho `scripts/demo-server.mjs`), linhas 20447 e 20474–20482:
  ```javascript
  20447: const overrides = getTariffOverrides();
  ...
  20474: res.json({
  20475:   success: true,
  20476:   month: targetMonthStr,
  20477:   channel,
  20478:   flatId: flatId || null,
  20479:   settings: getTariffSettings(),
  20480:   days,
  20481:   flats
  20482: });
  ```
- **Execução do Teste Empírico de Prova**: `node tests/test-empirical-calendar-payload.mjs`.
- **Saída Verbatim**:
  ```
  Step 1: Creating flat-specific override for Flat 113 on 2026-12-25...
  Bulk update result: { success: true, updatedCount: 1, overridesCount: 1, overrides: [...] }
  Step 2: Calling GET /api/tariffs/calendar?month=2026-12&channel=direct (as tarifas.tsx does)...
  calData top-level keys: [ 'success', 'month', 'channel', 'flatId', 'settings', 'days', 'flats' ]
  Does calData have 'overrides' key? false
  calData.overrides value: undefined
  UI hasFlatOverride: false
  UI effectiveRate: 216.14 (Expected 650!)
  BUG CONFIRMED: UI displays 216.14 instead of 650 because calendarData.overrides is MISSING from GET /api/tariffs/calendar!
  ```
- **Status**: **FAIL (Bug de Integração)**.

---

## 2. Logic Chain

1. **Premissa de Arquitetura da UI**: A tela `tarifas.tsx` exibe uma matriz completa contendo na primeira linha a tarifa geral (`⭐ Geral (Todos)`) e nas linhas subsequentes todos os flats individuais cadastrados no PMS (`Flat 113`, `Flat 211`, etc.).
2. **Ciclo de Busca de Dados**: Para preencher essa matriz, o frontend faz uma única chamada `GET /api/tariffs/calendar?month=${selectedMonth}&channel=${selectedChannel}` (sem enviar `flatId`, pois precisa dos dados de todos os flats simultaneamente).
3. **Resolução Local no Frontend**: Para cada linha de flat, o componente avalia `(calendarData?.overrides || []).find(...)` para identificar se existe um override específico para aquele flat naquela data.
4. **Omissão no Backend**: O backend (`demo-server.mjs`) lê `const overrides = getTariffOverrides();` na linha 20447, mas na resposta `res.json(...)` (linha 20474) omite a chave `overrides`.
5. **Efeito Cascata no Comportamento da UI**:
   - `calendarData.overrides` é sempre `undefined`.
   - `flatOverride` é sempre `undefined`.
   - `hasFlatOverride` é sempre `false`.
   - O flat individual exibe na tela o valor `d.rate` (a diária geral calculada), ignorando completamente o override cadastrado para o flat.
   - O badge visual `Override` nunca é renderizado nas linhas dos flats.
   - Ao clicar na célula do flat para editar ou excluir, `editingCell.override` recebe `d.override` (que é o override geral ou `null`, e não o override do flat). Se não houver override geral, o modal **não renderiza o botão "Voltar ao SEBRAE"**, impossibilitando o operador humano de visualizar ou remover a tarifa personalizada do flat.
6. **Conclusão Lógica**: Embora o build compile e os markups de canais gerais funcionem, o fluxo central da matriz de flats individuais do M3 está comprometido por essa discrepância de contrato na API.

---

## 3. Caveats

- A rota `POST /api/tariffs/bulk-update` retorna a lista `overrides`, mas a UI sempre invoca `loadCalendarData()` logo após salvar, sobrescrevendo o estado `calendarData` com a resposta de `GET /api/tariffs/calendar`.
- Se o operador aplicar um override com `flatIds: ["all"]`, a linha geral reflete o override corretamente, pois `calculateDailyRate(null, dayStr, channel)` computa o override global em `d.override`. A falha ocorre exclusivamente na granularidade por flat individual (`Flat 113`, etc.).

---

## 4. Conclusion

O Milestone M3 apresenta uma inconsistência de contrato entre o endpoint `GET /api/tariffs/calendar` e o componente `tarifas.tsx`.

**Veredicto**: **REQUEST_CHANGES**

### Ação Necessária para Aprovação:
1. Em `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (mantendo a paridade estrita de twin servers):
   Na rota `app.get("/api/tariffs/calendar", ...)` (por volta da linha 20474), incluir `overrides` na resposta JSON:
   ```javascript
   res.json({
     success: true,
     month: targetMonthStr,
     channel,
     flatId: flatId || null,
     settings: getTariffSettings(),
     days,
     flats,
     overrides: getTariffOverrides() // Adicionar esta linha
   });
   ```
2. Garantir a paridade byte-a-byte (`SHA-256`) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
3. Executar o build `npm --prefix artifacts/limpeza run build` e confirmar que `tests/test-empirical-calendar-payload.mjs` reporta `effectiveRate: 650` e `hasFlatOverride: true`.

---

## 5. Verification Method

Para reproduzir e verificar o achado de forma independente:

1. **Executar a probe empírica de payload**:
   ```powershell
   node tests/test-empirical-calendar-payload.mjs
   ```
   *Comportamento observado antes da correção*: `Does calData have 'overrides' key? false` e `effectiveRate: 216.14 (Expected 650!)`.
   *Comportamento esperado após a correção*: `Does calData have 'overrides' key? true` e `UI effectiveRate: 650 (Expected 650!)`.

2. **Executar a suíte completa de testes adversariais do M3**:
   ```powershell
   node --test tests/challenger-m3-tariff-adversarial.test.mjs
   ```

3. **Verificar integridade do build**:
   ```powershell
   npm --prefix artifacts/limpeza run build
   ```
