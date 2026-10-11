# Relatório de Handoff — Explorer 3 (Remediação de Tarifas & Calendário M1)

**Agente:** Explorer 3 (investigator, specialist)  
**Milestone:** M1 Remediation — Motor de Tarifas & API de Ações do Bot  
**Data:** 2026-10-11T01:27:00Z  
**Diretório de Trabalho:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_remedy_3`  
**Destinatário:** Orchestrator (`3364a657-c855-42a7-a46e-a5463bc245b7`) / Worker M1  

---

## 1. Observation

Durante a auditoria técnica do código-fonte e reprodução empírica dos defeitos reportados pelo Challenger 1, foram analisados os seguintes arquivos:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs` (ambos possuem SHA256 idêntico: `D9491B2A18EC04338CBA7C38E7A695077FC47A1F99B71272F4667ADE85470747`)
- `tests/challenger-edge-probes.test.mjs`
- `tests/challenger-tariff-stress.test.mjs`
- `tests/tariff-engine.test.mjs`
- `tests/bot-actions-api.test.mjs`

### Execução Empírica dos Testes Atuais:
Comando executado: `node --test tests/challenger-edge-probes.test.mjs`
Saída obtida no console:
```text
# Day 25 in General Calendar: {
#   rate: 163.43,
#   hasOverride: true,
#   overrideRate: 999,
#   overrideFlatId: 1
# }
# Bulk update with ['5', '6'] updatedCount: 0
# Day 28 Lowercase: { rate: 777, hasOverride: true }
# Day 28 Uppercase: { rate: 777, hasOverride: false }
```

### Defeitos Pontuais Observados no Código-Fonte:

#### Observação 1.1: Vazamento de Override de Flat Específico em `GET /api/tariffs/calendar`
- **Arquivo**: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, linhas 19919–19926:
  ```javascript
  19919: const rate = calculateDailyRate(flatId || null, dayStr, channel);
  19920: 
  19921: const override = overrides.find(o =>
  19922:   o.date === dayStr &&
  19923:   (!flatId || String(o.flatId) === String(flatId)) &&
  19924:   (String(o.channel) === channel || !o.channel || String(o.channel) === "all")
  19925: );
  ```
- **Fato observado**: Quando `flatId` é omitido na query string (`req.query.flatId` é `undefined`), a expressão `!flatId` avalia como `true`. Consequentemente, a cláusula `(!flatId || String(o.flatId) === String(flatId))` avalia como `true` para qualquer registro de override, inclusive aqueles específicos de uma unidade (ex: `o.flatId = 1`). Por outro lado, `calculateDailyRate(null, dayStr, channel)` ignora overrides específicos de UH e retorna a diária base (R$ 163,43).
- **Resultado retornado pela API**:
  ```json
  {
    "date": "2026-11-25",
    "rate": 163.43,
    "hasOverride": true,
    "override": {
      "flatId": 1,
      "rate": 999
    }
  }
  ```
  O calendário do empreendimento reporta `hasOverride: true` com objeto de override pertencente a um flat isolado, enquanto o valor da diária exibido é a tarifa padrão desprovida de override.

#### Observação 1.2: Sensibilidade de Caixa (`channel`) no Lookup do Calendário
- **Arquivo**: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, linha 19924:
  ```javascript
  (String(o.channel) === channel || !o.channel || String(o.channel) === "all")
  ```
- **Fato observado**: O banco armazena canais em minúsculas (ex: `channel: "booking"`). Em `calculateDailyRate` (linha 19767), o canal é normalizado via `String(channel || "direct").toLowerCase().trim()`, aplicando o override de R$ 777. Porém, a linha 19924 compara `String(o.channel) === channel` com igualdade estrita `===`.
- **Resultado retornado pela API com `channel=Booking`**:
  ```json
  {
    "date": "2026-11-28",
    "rate": 777,
    "hasOverride": false,
    "override": null
  }
  ```
  O valor da diária reflete o override (777), mas a flag visual `hasOverride` é `false` e o objeto `override` é `null`.

#### Observação 1.3: Falha Silenciosa em `POST /api/tariffs/bulk-update` com Array de Strings em `daysOfWeek`
- **Arquivo**: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, linhas 19974 e 19994:
  ```javascript
  19974: const targetDaysOfWeek = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  ...
  19992: const dayOfWeek = cur.getUTCDay();
  19994: if (targetDaysOfWeek.includes(dayOfWeek)) {
  ```
- **Fato observado**: `cur.getUTCDay()` retorna um `Number` (ex: `5` para sexta-feira, `6` para sábado). Quando a requisição envia strings numéricas serializadas por formulários ou query params (ex: `daysOfWeek: ["5", "6"]`), o método `targetDaysOfWeek.includes(dayOfWeek)` executa `["5", "6"].includes(5)` (comparação estrita `===`), que retorna `false`.
- **Resultado retornado pela API**: Resposta `HTTP 200 OK` com `updatedCount: 0`. Nenhuma diária é criada ou atualizada no banco e nenhum erro é retornado ao cliente.

#### Observação 1.4: Reset Indesejado de `baseDailyRate: 0` em Modo Manual
- **Arquivo**: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, linha 19835:
  ```javascript
  baseRate = Number(settings.baseDailyRate || 237);
  ```
- **Fato observado**: Se `settings.baseDailyRate` for configurado como `0`, a operação booleana `0 || 237` descarta o `0` e restaura o valor padrão `237`.

---

## 2. Logic Chain

1. **Inferência a partir da Observação 1.1**:
   Na visão geral tarifária (`GET /api/tariffs/calendar` sem `flatId` ou com `flatId="all"`), o calendário representa o empreendimento como um todo. Overrides atribuídos a flats específicos não afetam o cálculo de `calculateDailyRate(null, ...)`. Portanto, a busca pelo override do dia na visão geral deve filtrar estritamente registros globais (`!o.flatId || String(o.flatId).toLowerCase() === "all" || o.flatId === null`). Quando `flatId` for especificado, a busca deve seguir a mesma precedência estrita já empregada em `calculateDailyRate` (P1: flat específico + canal exato > P2: flat específico + canal "all" > P3: global + canal exato > P4: global + canal "all").

2. **Inferência a partir da Observação 1.2**:
   O parâmetro `channel` deve ser normalizado no escopo da rota do calendário da mesma forma que em `calculateDailyRate`:
   `const normChannel = String(channel || "direct").toLowerCase().trim();`
   Adicionalmente, apelidos comuns (`whatsapp`, `site`, `direta`, `direto`) devem mapear para `direct`. Na verificação do override, a comparação de `o.channel` deve ser feita em minúsculas:
   `String(o.channel).toLowerCase() === normChannel`.

3. **Inferência a partir da Observação 1.3**:
   A sanitização do payload de entrada em `POST /api/tariffs/bulk-update` deve garantir que os valores contidos no array `daysOfWeek` sejam do tipo `Number`. Aplicando `daysOfWeek.map(Number)`, o array `["5", "6"]` é transformado em `[5, 6]`. Com isso, `[5, 6].includes(dayOfWeek)` avalia `true` para sextas e sábados, processando as atualizações esperadas.

4. **Inferência Arquitetural (Single Source of Truth)**:
   A causa raiz das divergências entre `rate` e `hasOverride` reside no fato de que `calculateDailyRate` e a rota `GET /api/tariffs/calendar` possuíam duas implementações concorrentes e não-idênticas da resolução de overrides. Ao extrair uma função compartilhada `findEffectiveTariffOverride(flatId, dateStr, channel)` que é chamada tanto por `calculateDailyRate` quanto por `GET /api/tariffs/calendar`, elimina-se qualquer possibilidade de descompasso futuro.

---

## 3. Caveats

- **Escopo Read-Only**: Este relatório não alterou arquivos de código-fonte no repositório (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`). A implementação cabe exclusivamente ao Worker.
- **Paridade Obrigatória**: O repositório mantém duas instâncias do servidor: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`. Qualquer alteração realizada pelo Worker deve ser aplicada identicamente em ambos os arquivos.
- **Probes de Teste**: Os testes em `tests/challenger-edge-probes.test.mjs` foram estruturados originalmente como probes diagnósticos com `console.log`. Recomenda-se adicionar asserções explícitas (`assert.strictEqual`) para garantir que futuros testes falhem caso ocorra regressão.

---

## 4. Conclusion & Recommended Implementation

Recomenda-se ao Worker a aplicação da **Opção A** (Arquitetura com Função Compartilhada), que resolve definitivamente os defeitos 1 e 2, além de detalhar a correção pontual para o defeito 3 e a observação de `baseDailyRate: 0`.

### Código Exato Recomendado:

#### Ação 1: Extrair e Compartilhar `findEffectiveTariffOverride`
Em `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (antes da linha 19762):

```javascript
// ── Resolução de Overrides com Prioridade Estrita ────────────────────────────
export function findEffectiveTariffOverride(flatId, date, channel = "direct") {
  const overrides = getTariffOverrides();
  let normChannel = String(channel || "direct").toLowerCase().trim();
  if (normChannel === "whatsapp" || normChannel === "site" || normChannel === "direta" || normChannel === "direto") {
    normChannel = "direct";
  }

  const isGlobalFlat = !flatId || String(flatId).toLowerCase() === "all" || String(flatId).toLowerCase() === "null";
  let targetFlatId = !isGlobalFlat ? String(flatId) : null;
  let targetFlatNumber = null;
  if (targetFlatId && Array.isArray(db.flats)) {
    const fObj = db.flats.find(f => String(f.id) === targetFlatId || String(f.number) === targetFlatId);
    if (fObj) {
      targetFlatId = String(fObj.id);
      targetFlatNumber = String(fObj.number);
    }
  }

  const dateStr = String(date).substring(0, 10);
  let matchedOverride = null;

  // 1. Resolução para Flat Específico (apenas se flatId foi fornecido e não é "all")
  if (targetFlatId || targetFlatNumber) {
    // P1: Flat específico + Canal exato
    matchedOverride = overrides.find(o =>
      o.date === dateStr &&
      (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
      (String(o.channel).toLowerCase() === normChannel)
    );
    // P2: Flat específico + Canal "all"
    if (!matchedOverride) {
      matchedOverride = overrides.find(o =>
        o.date === dateStr &&
        (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
        (!o.channel || String(o.channel).toLowerCase() === "all")
      );
    }
  }

  // 2. Resolução Global (aplica para visão geral ou como fallback para flat específico)
  if (!matchedOverride) {
    // P3: Flat global (null/'all') + Canal exato
    matchedOverride = overrides.find(o =>
      o.date === dateStr &&
      (!o.flatId || String(o.flatId).toLowerCase() === "all" || o.flatId === null) &&
      (String(o.channel).toLowerCase() === normChannel)
    );
  }

  if (!matchedOverride) {
    // P4: Flat global (null/'all') + Canal "all"
    matchedOverride = overrides.find(o =>
      o.date === dateStr &&
      (!o.flatId || String(o.flatId).toLowerCase() === "all" || o.flatId === null) &&
      (!o.channel || String(o.channel).toLowerCase() === "all")
    );
  }

  return matchedOverride || null;
}
```

#### Ação 2: Simplificar `calculateDailyRate` e Tratar `baseDailyRate: 0`
Em `calculateDailyRate` (linhas 19762–19859):

```javascript
export function calculateDailyRate(flatId, date, channel = "direct") {
  const settings = getTariffSettings();

  // 1. Resolução de Overrides via função compartilhada
  const matchedOverride = findEffectiveTariffOverride(flatId, date, channel);
  if (matchedOverride && matchedOverride.rate !== undefined && matchedOverride.rate !== null) {
    return Math.round(Number(matchedOverride.rate) * 100) / 100;
  }

  // 2. Determinação da Diária Base
  let baseRate = 0;
  const dateStr = String(date).substring(0, 10);
  const dParts = dateStr.split("-").map(Number);
  const monthIdx = (dParts.length >= 2 && !isNaN(dParts[1])) ? dParts[1] - 1 : new Date().getMonth();

  if (settings.mode === "auto") {
    baseRate = calculateSebraeSustainableRate(monthIdx);
  } else {
    // Correção: Operador nullish para aceitar diária base 0 sem resetar para 237
    baseRate = Number(settings.baseDailyRate != null ? settings.baseDailyRate : 237);
  }

  // 3. Fim de semana (+15% em sextas e sábados)
  let weekendMarkup = 0;
  const dateObj = new Date(Date.UTC(dParts[0], dParts[1] - 1, dParts[2], 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay(); // 5 = Sexta, 6 = Sábado
  const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
  if (isWeekend) {
    const weekendPct = Number(settings.weekendMarkupPct != null ? settings.weekendMarkupPct : 0.15);
    weekendMarkup = baseRate * weekendPct;
  }

  const rateBeforeChannel = baseRate + weekendMarkup;

  // 4. Markup de Canal
  let normChannel = String(channel || "direct").toLowerCase().trim();
  if (normChannel === "whatsapp" || normChannel === "site" || normChannel === "direta" || normChannel === "direto") {
    normChannel = "direct";
  }
  const channelCfg = settings.channelMarkups?.[normChannel] ||
                     (normChannel === "direct" ? { markupPct: 0.0 } :
                      normChannel === "booking" ? { markupPct: 0.18 } :
                      normChannel === "airbnb" ? { markupPct: 0.15 } : { markupPct: 0.0 });
  const channelMarkupPct = Number(channelCfg.markupPct || 0);
  const finalRate = rateBeforeChannel * (1 + channelMarkupPct);

  return Math.round(finalRate * 100) / 100;
}
```

#### Ação 3: Atualizar Rota `GET /api/tariffs/calendar`
Substituir o loop de dias em `app.get("/api/tariffs/calendar")` (linhas 19914–19936):

```javascript
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dObj = new Date(Date.UTC(year, m - 1, day, 12, 0, 0));
    const dayOfWeek = dObj.getUTCDay();
    const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
    const rate = calculateDailyRate(flatId || null, dayStr, channel);
    const override = findEffectiveTariffOverride(flatId || null, dayStr, channel);

    days.push({
      date: dayStr,
      day,
      dayOfWeek,
      isWeekend,
      rate,
      hasOverride: Boolean(override),
      override: override || null
    });
  }
```

#### Ação 4: Corrigir `POST /api/tariffs/bulk-update` com `.map(Number)`
Em `app.post("/api/tariffs/bulk-update")` (linha 19974):

Substituir:
```javascript
const targetDaysOfWeek = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
```
Por:
```javascript
const targetDaysOfWeek = Array.isArray(daysOfWeek) && daysOfWeek.length > 0
  ? daysOfWeek.map(Number)
  : [0, 1, 2, 3, 4, 5, 6];
```

---

### Opção B: Alternativa Inline (Mínimo Diff Sem Refatoração de `calculateDailyRate`)
Caso o Worker prefira manter `calculateDailyRate` inalterado, a rota `GET /api/tariffs/calendar` pode resolver o override diretamente:

```javascript
app.get("/api/tariffs/calendar", (req, res) => {
  const { month, channel = "direct", flatId } = req.query;
  const now = new Date();
  const targetMonthStr = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, mStr] = targetMonthStr.split("-");
  const year = Number(yearStr);
  const m = Number(mStr);

  if (isNaN(year) || isNaN(m) || m < 1 || m > 12) {
    return res.status(400).json({ error: "Parâmetro month inválido. Formato esperado: YYYY-MM" });
  }

  const daysInMonth = new Date(year, m, 0).getDate();
  const days = [];
  const overrides = getTariffOverrides();

  // Normalização do canal da requisição
  let normChannel = String(channel || "direct").toLowerCase().trim();
  if (normChannel === "whatsapp" || normChannel === "site" || normChannel === "direta" || normChannel === "direto") {
    normChannel = "direct";
  }

  // Normalização do flat
  const isGlobalQuery = !flatId || String(flatId).toLowerCase() === "all" || String(flatId).toLowerCase() === "null";
  const targetFlatId = !isGlobalQuery ? String(flatId) : null;
  let targetFlatNumber = null;
  if (targetFlatId && Array.isArray(db.flats)) {
    const fObj = db.flats.find(f => String(f.id) === targetFlatId || String(f.number) === targetFlatId);
    if (fObj) targetFlatNumber = String(fObj.number);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dObj = new Date(Date.UTC(year, m - 1, day, 12, 0, 0));
    const dayOfWeek = dObj.getUTCDay();
    const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
    const rate = calculateDailyRate(flatId || null, dayStr, channel);

    let override = null;
    if (targetFlatId || targetFlatNumber) {
      override = overrides.find(o =>
        o.date === dayStr &&
        (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
        String(o.channel).toLowerCase() === normChannel
      ) || overrides.find(o =>
        o.date === dayStr &&
        (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
        (!o.channel || String(o.channel).toLowerCase() === "all")
      );
    }

    if (!override) {
      override = overrides.find(o =>
        o.date === dayStr &&
        (!o.flatId || String(o.flatId).toLowerCase() === "all" || o.flatId === null) &&
        String(o.channel).toLowerCase() === normChannel
      ) || overrides.find(o =>
        o.date === dayStr &&
        (!o.flatId || String(o.flatId).toLowerCase() === "all" || o.flatId === null) &&
        (!o.channel || String(o.channel).toLowerCase() === "all")
      );
    }

    days.push({
      date: dayStr,
      day,
      dayOfWeek,
      isWeekend,
      rate,
      hasOverride: Boolean(override),
      override: override || null
    });
  }
  ...
```

---

## 5. Verification Method

Após o Worker aplicar as modificações, a validação de aceitação deve ser realizada executando os seguintes comandos:

### 1. Atualizar e Executar os Probes com Asserções Estritas
Em `tests/challenger-edge-probes.test.mjs`, substituir os `console.log` por asserções estritas:
- **Probe A**:
  ```javascript
  assert.strictEqual(day25.hasOverride, false, "General calendar must not report hasOverride=true for flat-specific override");
  assert.strictEqual(day25.override, null, "General calendar must not expose flat-specific override object");
  ```
- **Probe B**:
  ```javascript
  assert.strictEqual(data.updatedCount, 2, "Bulk update with ['5', '6'] across 7 days must update 2 days (Fri, Sat)");
  ```
- **Probe C**:
  ```javascript
  assert.strictEqual(day28Upper.hasOverride, true, "Titlecase 'Booking' must find override");
  assert.strictEqual(day28Upper.override?.rate, 777);
  ```

Comando de execução:
```bash
node --test tests/challenger-edge-probes.test.mjs
```
*Critério de aprovação:* 3/3 testes passando com código de saída 0.

### 2. Executar Suítes de Regressão Completas
```bash
node --test tests/tariff-engine.test.mjs
node --test tests/bot-actions-api.test.mjs
node --test tests/challenger-tariff-stress.test.mjs
```
*Critério de aprovação:* 39/39 testes passando (8 do tariff-engine + 5 do bot-actions-api + 26 do stress test).

### 3. Verificar Paridade de Arquivos
```powershell
Get-FileHash artifacts/api-server/demo-server.mjs, scripts/demo-server.mjs
```
*Critério de aprovação:* Hashes SHA256 rigorosamente idênticos.
