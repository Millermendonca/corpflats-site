# Relatório de Handoff — Reviewer 2 & Critic (reviewer_m2_2)

**Autor:** Reviewer & Adversarial Critic (`reviewer_m2_2`)  
**Data:** 2026-10-22T11:48:00Z  
**Destinatário:** Orquestrador (`58ecb31f-60d2-4e1e-9aac-82400a58c263`)  
**Marco Auditado:** M2 (Ponto Eletrônico Mobile, Motor de Conformidade em 3 Níveis & Blindagem de Cris/Grazi)  
**Veredicto Oficial:** `REQUEST_CHANGES`

---

## Review Summary

**Verdict**: `REQUEST_CHANGES`  
**Overall Risk Assessment**: `HIGH`

A arquitetura central do Ponto Eletrônico (`timekeeping.mjs`), a fórmula Haversine submétrica, o NSR sequencial incremental, a validação biométrica de selfie com SHA-256 e a blindagem no endpoint principal `/api/hr/punch` estão muito bem construídas e passam nos testes pontuais (`8/8 PASS`).

Entretanto, uma auditoria aprofundada e testes adversariais empíricos revelaram **3 falhas Críticas** e **1 falha Major** nos endpoints do Motor de Conformidade (`/api/hr/compliance/*`):
1. **Contrato HTTP Quebrado em `POST /api/hr/compliance/validate`**: O endpoint retorna HTTP `200 OK` com `{ success: true, allowed: false }` para qualquer violação (`hard_block`, `admin_override` ou tentativa de prestadora), violando diretamente a especificação do contrato em `PROJECT.md § 3` (que exige `400` para `hard_block`, `422`/`403` para `admin_override` e `403` para Cris/Grazi).
2. **Blindagem Incompleta de Cris e Grazi no Preflight (`POST /api/hr/compliance/validate`)**: Ao submeter validação prévia com `employeeId: 2` ou `employeeId: 3` (ou variações "Cris" / "Grazi"), a rota responde com status HTTP `200 OK` em vez da rejeição mandatória com HTTP `403 Forbidden`.
3. **Falha de Execução / Crash com `RangeError: Invalid time value` em `compliance.mjs:264`**: Se a requisição de pré-validação não enviar explicitamente o campo `date`, o motor tenta instanciar `new Date("undefinedT00:00:00Z")`, gerando exceção não tratada na avaliação de dias consecutivos e derrubando a requisição com erro 400 inesperado.
4. **Ausência de Testes HTTP para os Endpoints de Conformidade**: A suíte `tests/hr-m2-timekeeping-compliance.test.mjs` testa exaustivamente `/api/hr/punch`, mas não realiza uma única chamada HTTP para os 4 endpoints `/compliance/*` (`/rules`, `/rules/:ruleId`, `/validate`, `/audits`), o que permitiu que as falhas acima passassem despercebidas.
5. **Duplicação de Regras em `GET /api/hr/compliance/rules`**: O endpoint retorna 17 itens em vez dos 10 canônicos devido à inclusão de aliases em inglês que apontam para as mesmas instâncias de objeto.

---

## 1. Observation

1. **Paridade Twin-Server SHA-256**:
   - Comando executado: `node scripts/check-twin-parity.mjs`
   - Resultado: 32/32 arquivos com 100% SHA-256 match. Status `100% PASS`.
   - Hashes idênticos entre `artifacts/api-server/hr/` e `scripts/hr/` para `compliance.mjs`, `timekeeping.mjs`, `router.mjs`, `index.mjs`, `employees.mjs`.

2. **Execução do Teste Pontual Existente**:
   - Comando executado: `node --test tests/hr-m2-timekeeping-compliance.test.mjs`
   - Resultado: 8 testes executados, 8 aprovados (`pass 8`, `fail 0`).
   - Porém, busca textual no arquivo de teste (`grep /compliance/`) revelou **0 ocorrências** de chamadas HTTP para `/compliance/validate`, `/compliance/rules` ou `/compliance/audits`. O teste M2-5 manipula diretamente o objeto em memória `harnessAlert.mockDb.hrComplianceSettings.rules.geofence_violada.level` e inspeciona `mockDb.hrComplianceAudits` em JavaScript puro.

3. **Inversão de Status HTTP em `POST /api/hr/compliance/validate`**:
   - Código em `artifacts/api-server/hr/router.mjs` (linhas 345-354):
     ```javascript
     // POST /api/hr/compliance/validate
     router.post("/compliance/validate", (req, res) => {
       try {
         const result = validatePunchCompliance(db, null, req.body, { source: "preflight" });
         res.json({
           success: true,
           ...result
         });
       } catch (err) {
         res.status(400).json({ success: false, error: err.message });
       }
     });
     ```
   - Teste empírico de chamada com violação de cerca virtual (raio > 150m, modo `admin_override`):
     ```bash
     POST /api/hr/compliance/validate
     Body: { employeeId: "emp_cozinha_01", punchType: "entrada", date: "2026-10-22", geolocation: { lat: 0, lng: 0 } }
     ```
     *Resposta recebida:*
     ```json
     HTTP/1.1 200 OK
     {
       "success": true,
       "allowed": false,
       "actionRequired": "admin_override",
       "ruleId": "geofence_violada"
     }
     ```
     *Contrato em `PROJECT.md § 3`:* Exige retorno com status `422` ou `403` quando `allowed: false`.

4. **Blindagem de Cris e Grazi em `POST /api/hr/compliance/validate`**:
   - Teste empírico de chamada com Cris (`employeeId: 2`):
     ```bash
     POST /api/hr/compliance/validate
     Body: { employeeId: 2, punchType: "entrada", date: "2026-10-22" }
     ```
     *Resposta recebida:*
     ```json
     HTTP/1.1 200 OK
     {
       "success": true,
       "allowed": false,
       "actionRequired": "hard_block",
       "ruleId": "prestadora_bloqueada"
     }
     ```
     *Requisito do Dispatch #2:* Exige rejeição com HTTP `403 Forbidden`. O endpoint respondeu `200 OK` com `success: true`.

5. **Exceção `RangeError: Invalid time value` em `compliance.mjs:264`**:
   - Teste empírico de preflight sem passar `date` explícito:
     ```bash
     POST /api/hr/compliance/validate
     Body: { employeeId: "emp_cozinha_01", punchType: "entrada" }
     ```
     *Saída verbatim do Node:*
     ```
     file:///.../artifacts/api-server/hr/compliance.mjs:264
         const prevDateStr = prevDate.toISOString().slice(0, 10);
                                      ^
     RangeError: Invalid time value
         at Date.toISOString (<anonymous>)
         at Object.evaluateMaximoDiasConsecutivos [as fn] (compliance.mjs:264:34)
         at validatePunchCompliance (compliance.mjs:592:24)
     ```
   - Em `compliance.mjs:258`, `targetDate = new Date(date + "T00:00:00Z")`. Quando `date` é `undefined`, resulta em `"undefinedT00:00:00Z"`, gerando `Invalid Date`.

6. **Catálogo Duplicado em `GET /api/hr/compliance/rules`**:
   - Chamada HTTP: `GET /api/hr/compliance/rules`
   - Resultado: `total: 17`, onde há 10 IDs únicos e 7 duplicados (`intrajornada_minima`, `interjornada_minima`, `limite_horas_extras`, `maximo_dias_consecutivos`, `geofence_violada`, `aparelho_nao_autorizado`, `trabalho_em_ferias_ou_afastamento`) originados dos aliases do objeto de regras.

---

## 2. Logic Chain

1. **Da Observação 3 ao Contrato Quebrado**:
   - `PROJECT.md` define taxativamente no item 3 da seção Interface Contracts:
     - `hard_block`: Retorna status `400` com `{ allowed: false, actionRequired: "hard_block" }`.
     - `admin_override`: Retorna status `422` ou `403` com `{ allowed: false, actionRequired: "admin_override" }`.
   - O controlador Express em `router.mjs` apenas executa `res.json({ success: true, ...result })`. Em Express, `res.json()` assume código de status `200 OK` por padrão a menos que `res.status(...)` seja explicitado.
   - Consequentemente, o cliente mobile ou frontend React interpretará a requisição como bem-sucedida (`status 200` e `success: true`), quebrando a lógica de interceptação prévia antes da batida de ponto.

2. **Da Observação 4 à Falha de Blindagem**:
   - O comando de dispatch estipula: *"Verificar a blindagem estrita de Cris (id: 2) e Grazi (id: 3): rejeição mandatória com HTTP 403 Forbidden para qualquer tentativa de registro de ponto ou consulta de espelho vinculada a prestadoras."*
   - Enquanto `/punch` e `/timekeeping/monthly-mirror/:employeeId` aplicam `res.status(403)`, o endpoint `/compliance/validate` devolve `200 OK`, violando o princípio de blindagem consistente em todas as rotas expostas.

3. **Da Observação 5 ao Crash em Tempo de Execução**:
   - Em chamadas reais de pré-validação (`/compliance/validate`), o payload do frontend pode enviar apenas `{ employeeId, punchType }` antes de montar todos os metadados.
   - `validatePunchCompliance` não preenche o fallback para `date` (data de hoje no fuso de Campos dos Goytacazes). A regra `evaluateMaximoDiasConsecutivos` tenta montar um `new Date` sobre string indefinida, gerando `RangeError` e quebrando a requisição com código 400 genérico.

4. **Da Observação 2 e 6 à Lacuna de Testes**:
   - Como os testes em `hr-m2-timekeeping-compliance.test.mjs` cobriram apenas a rota de escrita `/punch`, os 4 endpoints REST de conformidade (`/compliance/*`) ficaram com zero cobertura HTTP.

---

## 3. Caveats

- **Timekeeping & Haversine**: O motor de cálculo geodésico Haversine, a detecção de aparelhos e a validação de selfie em `/punch` funcionam perfeitamente e não foram afetados pelas falhas de `/compliance/validate`.
- **Integridade**: Não foram detectadas violações de integridade deliberadas (sem resultados mockados ou dados falsos hardcoded nas regras de cálculo). As falhas encontradas decorrem de omissão de status code no controlador e ausência de testes HTTP dedicados aos endpoints de conformidade.

---

## 4. Conclusion & Actionable Recommendations

### Veredicto: `REQUEST_CHANGES`

O Worker M2 (`worker_m2`) deve realizar as seguintes correções pontuais:

### Correção 1: Ajustar `POST /api/hr/compliance/validate` em `artifacts/api-server/hr/router.mjs` (e sincronizar espelho)
Aplicar o controle de status codes conforme `PROJECT.md § 3` e blindar Cris/Grazi com HTTP 403:
```javascript
// POST /api/hr/compliance/validate
router.post("/compliance/validate", (req, res) => {
  try {
    const rawId = req.body?.employeeId;
    const idStr = String(rawId || "").toLowerCase().trim();

    // Blindagem estrita de Cris e Grazi
    if (
      rawId === 2 ||
      rawId === 3 ||
      idStr === "2" ||
      idStr === "3" ||
      idStr === "cris" ||
      idStr === "grazi" ||
      isPrestadora({ id: rawId, employeeId: rawId, username: rawId, name: rawId })
    ) {
      return res.status(403).json({
        success: false,
        allowed: false,
        actionRequired: "hard_block",
        ruleId: "prestadora_bloqueada",
        error: "Prestadora de serviço autônoma (Cris ou Grazi) não é funcionária CLT e não pode ser validada no motor CLT."
      });
    }

    const result = validatePunchCompliance(db, null, req.body, { source: "preflight" });

    if (!result.allowed) {
      const statusCode = result.badPassword
        ? 403
        : (result.actionRequired === "hard_block" ? 400 : 422);
      return res.status(statusCode).json({
        success: false,
        ...result
      });
    }

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});
```

### Correção 2: Tratamento de data padrão em `artifacts/api-server/hr/compliance.mjs`
Garantir fallback de `date`, `time` e `timestamp` em `validatePunchCompliance` quando omitidos no payload de preflight:
```javascript
const defaultCampos = getCamposLocalTime ? getCamposLocalTime() : null;
const defaultDate = defaultCampos?.date || new Date().toISOString().slice(0, 10);
const defaultTime = defaultCampos?.time || new Date().toISOString().slice(11, 19);
const defaultIso = defaultCampos?.iso || new Date().toISOString();

const mergedContext = {
  date: defaultDate,
  time: defaultTime,
  timestamp: defaultIso,
  ...context,
  ...punchPayload,
  employeeId
};
```
E em `evaluateMaximoDiasConsecutivos`:
Garantir que se `date` for inválido ou ausente, use a data atual com segurança sem disparar `RangeError`.

### Correção 3: Deduplicação de catálogo em `getComplianceRules(db)`
Em `artifacts/api-server/hr/compliance.mjs`:
```javascript
export function getComplianceRules(db) {
  const rulesObj = db?.hrComplianceSettings?.rules || {};
  const seen = new Set();
  return Object.values(rulesObj).filter(r => {
    if (!r || !r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
```

### Correção 4: Adicionar Cenários de Teste HTTP para `/compliance/*` em `tests/hr-m2-timekeeping-compliance.test.mjs`
Adicionar um novo subteste (ex: `M2-9: Endpoints REST de Conformidade Trabalhista (/compliance/rules, /validate, /audits)`):
- Chamar `GET /api/hr/compliance/rules` via `fetch` e assertar `total === 10` e status `200`.
- Chamar `PATCH /api/hr/compliance/rules/:ruleId` via `fetch` alterando nível e assertar persistência.
- Chamar `POST /api/hr/compliance/validate` via `fetch`:
  - Para Cris/Grazi -> assertar status `403` e `allowed: false`.
  - Para `hard_block` (ex: selfie corrompida) -> assertar status `400` e `allowed: false`.
  - Para `admin_override` sem senha -> assertar status `422` e `allowed: false`.
  - Para `admin_override` com senha errada -> assertar status `403` e `allowed: false`.
  - Para `admin_override` com senha correta -> assertar status `200`, `allowed: true`, `overridden: true`.
  - Sem passar `date` explícito -> assertar que não ocorre crash `RangeError`.
- Chamar `GET /api/hr/compliance/audits` via `fetch` e assertar que o override auditado consta na listagem.

### Correção 5: Sincronização Twin-Server
Garantir que após os ajustes, `node scripts/check-twin-parity.mjs` retorne `100% PASS` em todos os 32 arquivos.

---

## 5. Verification Method

Para verificar a resolução das pendências após o retrabalho:

1. **Executar teste pontual dedicado**:
   ```powershell
   node --test tests/hr-m2-timekeeping-compliance.test.mjs
   ```
   *Critério de Sucesso:* Todos os testes passam (incluindo o novo teste dos endpoints `/compliance/*`), 0 falhas.

2. **Auditar paridade twin-server**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Critério de Sucesso:* 32/32 arquivos auditados com 100% SHA-256 match.

3. **Verificação empírica dos status codes de `/compliance/validate`**:
   - `POST /api/hr/compliance/validate` com `{ employeeId: 2 }` deve retornar status HTTP `403`.
   - `POST /api/hr/compliance/validate` com violação hard_block deve retornar status HTTP `400`.
   - `POST /api/hr/compliance/validate` com violação admin_override deve retornar status HTTP `422`.
