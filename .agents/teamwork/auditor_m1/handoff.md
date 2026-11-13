# Relatório de Auditoria Forense de Integridade — Marco M1

- **Auditor**: Forensic Auditor (`auditor_m1`)
- **Papéis Ativos**: critic, specialist, auditor
- **Milestone Auditado**: Marco M1 (Backend Core & Isolamento de Prestadoras)
- **Data/Hora**: 2026-10-22T10:44:00Z
- **Integrity Mode**: Development (conforme `ORIGINAL_REQUEST.md`)

---

## Forensic Audit Report

**Work Product**: Implementação do Marco M1 (`artifacts/api-server/hr/`, `scripts/hr/`, `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/hr-m1-backend-core.test.mjs`)  
**Profile**: General Project (Development Mode)  
**Verdict**: **CLEAN**

### Phase Results
- **Hardcoded test results**: **PASS** — Implementação 100% dinâmica. Nenhum retorno mockado ou pré-fabricado.
- **Facade implementations**: **PASS** — Lógica genuína de banco de dados (`db.hrEmployees`), validações trabalhistas reais (Art. 71 CLT, CPF Módulo 11, jornadas 6x1), histórico funcional auditado e hashes SHA-256.
- **Fabricated verification outputs**: **PASS** — Nenhuma saída de teste ou log pré-existente foi utilizada; verificação executada em tempo real com processos isolados.
- **Twin-Server SHA-256 Parity**: **PASS** — 29/29 arquivos idênticos byte a byte entre `artifacts/api-server/` e `scripts/`.
- **Cris & Grazi Isolation**: **PASS** — Cris (id: 2) e Grazi (id: 3) blindadas em 7 camadas lógicas e na persistência; impossível convertê-las para CLT ou disparar rotinas CLT para elas.
- **Prune & Legal Retention**: **PASS** — Coleções de RH imunes à poda por limites curtos em `pruneDatabase()` e com corte de 5 anos (1825 dias) conforme Art. 11 da CLT e Portaria 671 MTP.
- **Test Scope & Safety Compliance**: **PASS** — Execução restrita ao arquivo pontual `tests/hr-m1-backend-core.test.mjs`. Nenhuma varredura global ou teste em lote foi disparado.

---

## 1. Observation (Evidências Empíricas Diretas)

### 1.1. Paridade Twin-Server SHA-256 (29/29 Arquivos Idênticos)
Execução direta do verificador de paridade:
```powershell
node scripts/check-twin-parity.mjs
```
Resultado obtido:
```
================================================================================
            CorpFlats Soho - Verificador de Paridade Twin-Server SHA-256        
================================================================================
[PASS] artifacts/api-server/demo-server.mjs                 SHA: 40d5c1392673...
[PASS] artifacts/api-server/mail-service.mjs                SHA: 9126151c4a46...
[PASS] artifacts/api-server/zapi-service.mjs                SHA: 3da422ad0bd9...
[PASS] artifacts/api-server/chat-service.mjs                SHA: 9a55c1aa0ebb...
[PASS] artifacts/api-server/fnrh-pdf-service.mjs            SHA: 39a9e79a4bfe...
[PASS] artifacts/api-server/fnrh-serpro-service.mjs         SHA: 11ba7cfe2354...
[PASS] artifacts/api-server/inter-pix-service.mjs           SHA: 2d7fadf46bab...
[PASS] artifacts/api-server/lookup.mjs                      SHA: 7ddf9b78be3d...
[PASS] artifacts/api-server/maid-automation-service.mjs     SHA: 813410e808a8...
[PASS] artifacts/api-server/national-nfse.mjs               SHA: baa93854482a...
[PASS] artifacts/api-server/server-monitor-service.mjs      SHA: df12996014ad...
[PASS] artifacts/api-server/storage-service.mjs             SHA: c3b6dbe78a54...
[PASS] artifacts/api-server/whatsapp-ai-service.mjs         SHA: a6371582876a...
[PASS] artifacts/api-server/zoho-mail-service.mjs           SHA: 445130b30eeb...
[PASS] artifacts/api-server/hr/employees.mjs                SHA: 6ecf7f5b9a2a...
[PASS] artifacts/api-server/hr/index.mjs                    SHA: 052cc413c36c...
[PASS] artifacts/api-server/hr/router.mjs                   SHA: 1c81898ace4b...
[PASS] artifacts/api-server/wbp/alerts.mjs                  SHA: 154e3f7a0769...
[PASS] artifacts/api-server/wbp/ari-sync.mjs                SHA: 83c3107c6717...
[PASS] artifacts/api-server/wbp/availability.mjs            SHA: 6e8d6ef8e5e7...
[PASS] artifacts/api-server/wbp/callbacks.mjs               SHA: b10deef1dd82...
[PASS] artifacts/api-server/wbp/client.mjs                  SHA: 84c57d725079...
[PASS] artifacts/api-server/wbp/config.mjs                  SHA: 48367757385b...
[PASS] artifacts/api-server/wbp/inbox.mjs                   SHA: 48088a96bc09...
[PASS] artifacts/api-server/wbp/pricing.mjs                 SHA: 7b7fa4000266...
[PASS] artifacts/api-server/wbp/provisional.mjs             SHA: 67272c6db3d8...
[PASS] artifacts/api-server/wbp/reconciler.mjs              SHA: b0346bad024b...
[PASS] artifacts/api-server/wbp/storage.mjs                 SHA: b0e377ebc472...
[PASS] artifacts/api-server/wbp/vault.mjs                   SHA: c707b76bc408...
--------------------------------------------------------------------------------
Resultado: 29/29 arquivos gêmeos com 100% de paridade SHA-256.
STATUS: 100% PASS - Paridade perfeita restabelecida!
================================================================================
```
Comandos independentes de diff:
- `git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs`: Retornou 0 diferenças.
- `git diff --no-index artifacts/api-server/hr scripts/hr`: Retornou 0 diferenças.

### 1.2. Blindagem e Isolamento de Cris e Grazi
Verificações realizadas no código-fonte e no estado:
1. `data/database.json`: Usuários `id: 2` (Cris) e `id: 3` (Grazi) permanecem com `role: "camareira"` e `allowedModules` estritamente operacionais de governança (`/dashboard`, `/reports`, `/lista-compras`, `/observations`, `/tasks`, `/achados-perdidos`).
2. `demo-server.mjs` (linhas 1086-1087):
   ```javascript
   { id: 2, username: "Cris", name: "Cris", role: "camareira", contractType: "prestador", ... }
   { id: 3, username: "Grazi", name: "Grazi", role: "camareira", contractType: "prestador", ... }
   ```
3. `sanitizeMaidUsers()` em `demo-server.mjs` (linhas 5139 e 5160): Força `contractType = "prestador"` caso ocorra qualquer mutação ou restauração de snapshot.
4. `artifacts/api-server/hr/employees.mjs`:
   - `isPrestadora(entity)`: Bloqueia por ID (`2`, `3`), username (`"cris"`, `"grazi"`), nome/apelido, números de telefone (`22988486446`, `22999106204`) e `contractType` (`"prestador"`, `"prestadora"`, `"diarista"`).
   - `isCltEmployee(emp)`: Rejeita imediatamente qualquer entidade onde `isPrestadora()` seja verdadeiro ou `contractType !== "clt"`.
   - `validateRecipientNotPrestador(recipient)`: Dispara `Error("[CRITICAL_SECURITY_VIOLATION] ...")` caso qualquer tentativa de disparo CLT ocorra para Cris ou Grazi.
   - `createEmployee` e `updateEmployee`: Rejeitam sumariamente com erro caso qualquer tentativa de cadastro ou atualização use nomes de Cris ou Grazi.
   - Roteador `artifacts/api-server/hr/router.mjs`: Retorna `404 Not Found` em `GET /employees/:id` e `PATCH /employees/:id` para requisições com ID de prestadora.

### 1.3. Lógica Genuína vs. Ausência de Facades / Hardcoded
- `createEmployee(db, payload, author)`:
  - Valida extensão de CPF (11 dígitos numéricos com rejeição de duplicatas).
  - Gera matrícula sequencial (`CLT-001`, `CLT-002`, `CLT-003`).
  - Aplica cálculo matemático de horários para o intervalo intrajornada (Art. 71 CLT: bloqueia jornadas > 6h com intervalo < 60 min).
  - Trata PIN de 4 dígitos gerando hash criptográfico SHA-256 (`hashPin`).
  - Adiciona entrada auditada com data, autor e descrição em `functionalHistory`.
- `updateEmployee(db, id, payload, author)`:
  - Detecta alterações de salário e cargo, gravando entradas específicas com `oldValue`, `newValue` e autor em `functionalHistory`.
  - Revalida regras de escala e intrajornada.
- `sanitizeEmployee(emp)`: Remove `pinHash` e `pin` da resposta da API, expondo apenas a flag booleana `pinConfigured: true`.

### 1.4. Proteção de Poda e Retenção Trabalhista Legal (5 Anos)
Em `artifacts/api-server/demo-server.mjs`:
- Linhas 8889–8905: Todas as 11 coleções de RH (`hrEmployees`, `hrTimeRecords`, `hrSchedules`, etc.) são explicitamente removidas de `LIMITS` em `pruneDatabase()`, garantindo que não sejam truncadas pelo garbage collector padrão de dados voláteis.
- Linhas 8968–8980: Aplicação da regra legal de retenção de 5 anos (1825 dias) para `hrTimeRecords` e `hrComplianceAudits` em caso de volumes extraordinários (> 50.000 itens), em estrito cumprimento ao Art. 11 da CLT e Portaria 671 MTP.

### 1.5. Execução de Testes de Estresse Adversariais
Executado script de teste hostil com mutações e bypasses maliciosos:
```
--- 1. Testing Cris and Grazi Adversarial Bypass ---
PASS: All Cris/Grazi bypass attempts blocked.
--- 2. Testing Dynamic Persistence & State Modification ---
PASS: Dynamic state modification, query filtering and functional history verified.
--- 3. Testing CLT Compliance Edge Cases & Exceptions ---
PASS: All CLT compliance rules and constraints verified.
```
Todas as tentativas de bypass (inserir funcionário com nome "Cris Camareira", jornada de 9h com 45m de almoço, salário negativo, PIN com letras, e falsificação de `contractType: "clt"` em prestadora) foram sumariamente rejeitadas com as devidas exceções.

### 1.6. Execução da Suíte Pontual Dedicada
Comando executado:
```powershell
node --test tests/hr-m1-backend-core.test.mjs
```
Saída íntegra do TAP:
```
TAP version 13
# Subtest: M1-1: Twin-Server Parity (100% SHA-256)
ok 1 - M1-1: Twin-Server Parity (100% SHA-256)
# Subtest: M1-2: Isolamento Estrito de Prestadoras (Cris e Grazi)
ok 2 - M1-2: Isolamento Estrito de Prestadoras (Cris e Grazi)
# Subtest: M1-3: Seed Seguro e Validação de Funcionários CLT
ok 3 - M1-3: Seed Seguro e Validação de Funcionários CLT
# Subtest: M1-4: Inicialização de Coleções de RH (ensureHrCollections)
ok 4 - M1-4: Inicialização de Coleções de RH (ensureHrCollections)
# Subtest: M1-5: Proteção contra Poda em pruneDatabase() (Guarda de 5 Anos)
ok 5 - M1-5: Proteção contra Poda em pruneDatabase() (Guarda de 5 Anos)
# Subtest: M1-6: Endpoints CRUD de RH via Roteador Express
ok 6 - M1-6: Endpoints CRUD de RH via Roteador Express
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 752.3779
```

---

## 2. Logic Chain (Cadeia de Raciocínio Forense)

1. **Paridade Twin-Server**: A partir das observações 1.1, comprovou-se que tanto `demo-server.mjs`, os 13 serviços raiz e as subpastas `hr/` e `wbp/` possuem hashes SHA-256 idênticos byte a byte (29 pares auditados com 0 diffs). Isso satisfaz o requisito estrutural central do projeto.
2. **Autenticidade da Implementação**: A partir das observações 1.3 e 1.5, o código não utiliza dados mockados nem respostas de teste pré-computadas. O CRUD opera sobre a coleção em memória `db.hrEmployees`, manipula arrays, realiza hashes dinâmicos e armazena trilha de auditoria sequencial.
3. **Isolamento de Prestadoras (Cris e Grazi)**: A partir das observações 1.2 e 1.5, comprovou-se que mesmo se um invasor enviar uma entidade com `contractType: "clt"`, se o ID, telefone, username ou nome corresponder a Cris ou Grazi, o sistema anula a validação CLT e rejeita sumariamente qualquer ação. O isolamento de diaristas é absoluto e atende integralmente ao `ORIGINAL_REQUEST § R1`.
4. **Segurança de Poda e Retenção Legal**: A partir da observação 1.4, os dados de RH estão imunes a perdas acidentais no debounce e no prune do banco, cumprindo os 5 anos de exigência legal.
5. **Conformidade Operacional**: A partir da observação 1.6, nenhum teste global foi executado, respeitando estritamente o `AGENTS.md`.

---

## 3. Caveats (Ressalvas)

- A automação em segundo plano de mensagens WhatsApp para lembretes de ponto (`initHrWhatsAppAutomation`) está intencionalmente protegida em testes (`if (process.env.NODE_ENV === "test") return;`) para evitar disparos acidentais; a sua lógica completa será auditada no Marco M3.
- As telas de interface React (`/rh` e `/ponto`) serão auditadas no Marco M5.

---

## 4. Conclusion (Conclusão)

O trabalho entregue no **Marco M1** é autêntico, íntegro, seguro e atende a todos os critérios de aceitação com rigor.
Veredicto Final: **CLEAN**.

---

## 5. Verification Method (Método de Verificação Independente)

Para reproduzir os resultados de forma determinística:

1. **Auditoria de Paridade Twin-Server**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Critério*: Código de saída `0`, 29/29 arquivos idênticos.

2. **Auditoria da Suíte Pontual Dedicada M1**:
   ```powershell
   node --test tests/hr-m1-backend-core.test.mjs
   ```
   *Critério*: 6 subtestes executados, 0 falhas.
