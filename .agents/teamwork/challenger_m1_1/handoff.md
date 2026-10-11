# Relatório de Handoff — Challenger M1 (Adversarial Testing & Verification)

**Agente:** Challenger M1 (critic, specialist)  
**Milestone:** M1 — Motor de Tarifas & API de Ações do Bot  
**Data:** 2026-10-11T01:22:00Z  
**Diretório de Trabalho:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m1_1`  
**Veredicto:** **REQUEST_CHANGES**

---

## 1. Observation

Durante a auditoria adversarial empírica, foram criadas e executadas duas novas suítes de teste:
1. `tests/challenger-tariff-stress.test.mjs` (26 testes de estresse cobrindo viradas de ano/mês, sazonalidade, fim de semana, múltiplos canais, colisão de 4 níveis de overrides, validações de range e cargas de 360+ registros).
2. `tests/challenger-edge-probes.test.mjs` (3 probes direcionados a comportamentos de borda).

### Testes Executados e Resultados:
- `node --test tests/tariff-engine.test.mjs`: 8/8 aprovados.
- `node --test tests/bot-actions-api.test.mjs`: 5/5 aprovados.
- `node --test tests/challenger-tariff-stress.test.mjs`: 26/26 aprovados (tempo de execução: 4.4s).
- `node --test tests/challenger-edge-probes.test.mjs`: 3/3 executados com resultados diagnósticos.

### Defeitos Empíricos Identificados:

#### Defeito 1: Vazamento de Override de Flat Específico no Calendário Geral (`GET /api/tariffs/calendar`)
- **Arquivo**: `artifacts/api-server/demo-server.mjs`, linhas 19909–19925:
  ```javascript
  19909: const rate = calculateDailyRate(flatId || null, dayStr, channel);
  19910: 
  19911: const override = overrides.find(o =>
  19912:   o.date === dayStr &&
  19913:   (!flatId || String(o.flatId) === String(flatId)) &&
  19914:   (String(o.channel) === channel || !o.channel || String(o.channel) === "all")
  19915: );
  ```
- **Evidência Empírica (`tests/challenger-edge-probes.test.mjs` - Probe A)**:
  Quando existe um override apenas para o flat 1 (`flatId: 1, rate: 999`) e o cliente consulta o calendário geral sem especificar flat (`GET /api/tariffs/calendar?month=2026-11&channel=direct`):
  - `calculateDailyRate(null, dayStr, channel)` retorna `163.43` (tarifa base geral).
  - Porém, na linha 19913, como `flatId` é `undefined`, `!flatId` avalia como `true`.
  - O `overrides.find` captura o override pertencente ao flat 1.
  - O payload JSON retornado para o dia exibe:
    ```json
    {
      "rate": 163.43,
      "hasOverride": true,
      "override": {
        "flatId": 1,
        "rate": 999
      }
    }
    ```
  - **Inconsistência**: O calendário geral exibe `hasOverride: true` com objeto de override de 999 pertencente a uma UH isolada, enquanto a diária do dia (`rate`) é 163.43.

#### Defeito 2: Sensibilidade a Maiúsculas/Minúsculas no Lookup de Overrides do Calendário
- **Arquivo**: `artifacts/api-server/demo-server.mjs`, linha 19914:
  ```javascript
  (String(o.channel) === channel || !o.channel || String(o.channel) === "all")
  ```
- **Evidência Empírica (`tests/challenger-edge-probes.test.mjs` - Probe C)**:
  - No banco, overrides salvos via `bulk-update` possuem `channel: "booking"` (minúsculo).
  - Se o endpoint for chamado com `GET /api/tariffs/calendar?month=2026-11&channel=Booking` (B maiúsculo, comum em selects de frontend ou URLs):
    - `calculateDailyRate` usa `.toLowerCase()` e calcula a tarifa de override `777`.
    - No entanto, a linha 19914 compara `o.channel === "Booking"` de forma estrita (`===`), resultando em `false`.
    - Resultado retornado: `{ rate: 777, hasOverride: false, override: null }`.
  - **Inconsistência**: O preço do dia reflete o override (777), mas `hasOverride` retorna `false`.

#### Defeito 3: Falha Silenciosa em `POST /api/tariffs/bulk-update` com Array de Strings em `daysOfWeek`
- **Arquivo**: `artifacts/api-server/demo-server.mjs`, linhas 19964 e 19984:
  ```javascript
  19964: const targetDaysOfWeek = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  ...
  19984: if (targetDaysOfWeek.includes(dayOfWeek)) {
  ```
- **Evidência Empírica (`tests/challenger-edge-probes.test.mjs` - Probe B)**:
  - `dayOfWeek` é retornado por `cur.getUTCDay()`, que é um número `5` (sexta) ou `6` (sábado).
  - Se o payload da API contiver strings numéricas `daysOfWeek: ["5", "6"]`:
    - `["5", "6"].includes(5)` avalia como `false` devido à comparação estrita de tipos do JavaScript.
    - O endpoint retorna `HTTP 200 OK`, porém com `updatedCount: 0`. Nenhuma diária é atualizada e nenhum erro de validação é informado.

#### Observação Adicional: `baseDailyRate: 0` em modo manual
- **Arquivo**: `artifacts/api-server/demo-server.mjs`, linha 19825:
  ```javascript
  baseRate = Number(settings.baseDailyRate || 237);
  ```
  Se o valor configurado for `0`, a coerção booleana `0 || 237` redefine o valor para `237`. Recomenda-se utilizar o operador nullish `settings.baseDailyRate != null ? settings.baseDailyRate : 237`.

---

## 2. Logic Chain

1. **A partir da Observação 1 (Defeito 1)**:
   A intenção do endpoint `GET /api/tariffs/calendar` sem o parâmetro `flatId` é fornecer a visão geral tarifária do empreendimento. Ao utilizar a condição `(!flatId || String(o.flatId) === String(flatId))`, qualquer override específico de UH é capturado quando `flatId` é nulo. Isso faz com que a flag `hasOverride` seja ligada indevidamente para todas as UHs na visão geral, exibindo um valor de override divergente da diária vigente (`rate: 163.43` vs `override.rate: 999`).
   *Correção necessária*: Na ausência de `flatId`, o override considerado para o dia deve ser estritamente global:
   `(!flatId ? (!o.flatId || String(o.flatId) === "all") : (String(o.flatId) === String(flatId) || ...))`

2. **A partir da Observação 2 (Defeito 2)**:
   O motor de cálculo `calculateDailyRate` normaliza o canal para lowercase (`String(channel || "direct").toLowerCase()`). Porém, a verificação do override no loop do calendário compara diretamente com a variável crua `channel`. A discrepância de case resulta em dessincronização visual onde o dia tem taxa de override mas `hasOverride` reporta `false`.
   *Correção necessária*: Normalizar o canal na rota do calendário:
   `const normChannel = String(channel || "direct").toLowerCase();` e comparar `String(o.channel).toLowerCase() === normChannel`.

3. **A partir da Observação 3 (Defeito 3)**:
   Em APIs REST em JSON, filtros de dias da semana frequentemente chegam como `["0", "5", "6"]` (strings) a partir de formulários web ou query params serializados. O uso de `.includes` estrito sem `map(Number)` descarta todos os dias silenciosamente, gerando atualização vazia (`updatedCount: 0`) sem alerta ao usuário.
   *Correção necessária*: Converter os elementos para números inteiros:
   `const targetDaysOfWeek = (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) ? daysOfWeek.map(Number) : [0, 1, 2, 3, 4, 5, 6];`

4. **A partir dos Testes Positivos**:
   O núcleo de regras de negócio (cálculo SEBRAE, sazonalidade Jan/Mai/Jul, acréscimo de fins de semana, colisão hierárquica L1 > L2 > L3 > L4, geração de PIX, hold de 30min de pré-reserva, chave mestra e switches granulares) está matematicamente sólido e superou todos os 26 testes de estresse adversarial. As falhas estão restritas à camada de consulta do calendário e coerção de entrada do bulk update.

---

## 3. Caveats

- **Escopo M2**: O serviço WhatsApp AI Agent (`whatsapp-ai-service.mjs`) e as chamadas de ferramenta do Gemini foram validados apenas no nível de interface de API (`/api/bot-actions/*`), conforme definido para o Milestone M1. O teste end-to-end do Gemini pertence ao Milestone M2.
- **Não modificação pelo Challenger**: Em estrita conformidade com a restrição de papel (*"Review-only — do NOT modify implementation code directly; report any failures as findings — do NOT fix them yourself"*), nenhum código foi alterado pelo Challenger em `demo-server.mjs`.

---

## 4. Conclusion

Veredicto: **REQUEST_CHANGES**

O código do Milestone M1 implementou a quase totalidade das funções com alta performance e robustez (360 overrides processados em 37ms, tolerância a colisões complexas confirmada). Contudo, foram comprovados empiricamente 3 defeitos que afetam a integridade da API de tarifas:
1. **Defeito 1 (Médio)**: Vazamento de override de flat específico no calendário geral sem `flatId`.
2. **Defeito 2 (Médio)**: Falha de case-sensitivity no casamento de overrides de canal no calendário.
3. **Defeito 3 (Baixo/Médio)**: Falha silenciosa de `daysOfWeek` com array de strings numéricas em `POST /api/tariffs/bulk-update`.

Recomenda-se que o **Worker M1** aplique as três correções pontuais em `artifacts/api-server/demo-server.mjs` e garanta a paridade em `scripts/demo-server.mjs`.

---

## 5. Verification Method

Para reproduzir os achados e verificar a posterior correção pelo Worker:

1. **Executar a suíte de probes direcionados**:
   ```bash
   node --test tests/challenger-edge-probes.test.mjs
   ```
   *Condição de falha atual:*
   - Probe A demonstra `{ rate: 163.43, hasOverride: true, override: { flatId: 1, rate: 999 } }`.
   - Probe B demonstra `updatedCount: 0` quando enviado `["5", "6"]`.
   - Probe C demonstra `{ hasOverride: false }` para canal `"Booking"`.

2. **Executar a suíte completa de testes de estresse adversarial**:
   ```bash
   node --test tests/challenger-tariff-stress.test.mjs
   ```
   *Critério de aprovação:* 26/26 testes passando.

3. **Executar as suítes originais do projeto**:
   ```bash
   node --test tests/tariff-engine.test.mjs
   node --test tests/bot-actions-api.test.mjs
   ```
   *Critério de aprovação:* 13/13 testes passando.
