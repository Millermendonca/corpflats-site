# Relatório de Revisão & Auditoria Adversarial — Marco M1 (Backend Core & Isolamento de Prestadoras)

- **Revisor**: Reviewer 1 (`reviewer_m1_1`)
- **Papéis**: Reviewer, Adversarial Critic
- **Milestone**: M1 (Backend Core & Isolamento de Prestadoras)
- **Data/Hora**: 2026-10-22T10:42:00Z
- **Veredicto**: **APPROVE**

---

## 1. Observation (O que foi diretamente observado)

1. **Execução Independente do Teste Pontual Dedicado (`tests/hr-m1-backend-core.test.mjs`)**:
   - Comando executado: `node --test tests/hr-m1-backend-core.test.mjs`
   - Código de saída: `0`
   - Saída verbatim:
     ```
     TAP version 13
     # Subtest: M1-1: Twin-Server Parity (100% SHA-256)
     ok 1 - M1-1: Twin-Server Parity (100% SHA-256)
       ---
       duration_ms: 42.1132
       ...
     # Subtest: M1-2: Isolamento Estrito de Prestadoras (Cris e Grazi)
     ok 2 - M1-2: Isolamento Estrito de Prestadoras (Cris e Grazi)
       ---
       duration_ms: 0.8005
       ...
     # Subtest: M1-3: Seed Seguro e Validação de Funcionários CLT
     ok 3 - M1-3: Seed Seguro e Validação de Funcionários CLT
       ---
       duration_ms: 0.5457
       ...
     # Subtest: M1-4: Inicialização de Coleções de RH (ensureHrCollections)
     ok 4 - M1-4: Inicialização de Coleções de RH (ensureHrCollections)
       ---
       duration_ms: 1.5706
       ...
     # Subtest: M1-5: Proteção contra Poda em pruneDatabase() (Guarda de 5 Anos)
     ok 5 - M1-5: Proteção contra Poda em pruneDatabase() (Guarda de 5 Anos)
       ---
       duration_ms: 0.3478
       ...
     # Subtest: M1-6: Endpoints CRUD de RH via Roteador Express
     ok 6 - M1-6: Endpoints CRUD de RH via Roteador Express
       ---
       duration_ms: 123.7343
       ...
     1..6
     # tests 6
     # suites 0
     # pass 6
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 936.2781
     ```

2. **Auditoria de Paridade Twin-Server SHA-256**:
   - Comando executado: `node scripts/check-twin-parity.mjs`
   - Código de saída: `0`
   - Verificados 29/29 pares de arquivos gêmeos entre `artifacts/api-server/` e `scripts/`, incluindo:
     - `demo-server.mjs`: SHA-256 idêntico (`40d5c1392673...`)
     - `hr/employees.mjs`: SHA-256 idêntico (`6ecf7f5b9a2a...`)
     - `hr/index.mjs`: SHA-256 idêntico (`052cc413c36c...`)
     - `hr/router.mjs`: SHA-256 idêntico (`1c81898ace4b...`)
     - Todos os 13 serviços adicionais de `artifacts/api-server/` e submódulo `wbp/`.

3. **Inspeção de `artifacts/api-server/hr/employees.mjs`**:
   - Linhas 8–11: `hashPin(pin)` utiliza SHA-256 nativo via `crypto.createHash("sha256")`.
   - Linhas 17–36: `isPrestadora(entity)` verifica IDs (`2`, `3`, `"2"`, `"3"`), usernames (`"cris"`, `"grazi"`), nomes/apelidos contendo `"cris"` ou `"grazi"`, telefones (`22988486446`, `22999106204`) e `contractType` (`"prestador"`, `"prestadora"`, `"diarista"`).
   - Linhas 41–47: `isCltEmployee(emp)` aplica filtragem rigorosa: rejeita nulos, entidades identificadas por `isPrestadora`, exige `contractType === "clt"`, rejeita `isClt === false` ou `cltExempt === true` e exige `active !== false`.
   - Linhas 52–58: `validateRecipientNotPrestador(recipient)` lança `[CRITICAL_SECURITY_VIOLATION]` caso uma prestadora seja passada como destinatária de rotinas CLT.
   - Linhas 63–253: `getDefaultHrEmployees()` cria sementes com schema completo para Cozinheira Geral (`emp_cozinha_01`, Sebastiana Ramos dos Santos, CLT-001, 44h semanais, salário R$ 1.780,00, 20% insalubridade, PIN "4021") e Camareira CLT (`emp_camareira_01`, Luciana Moreira Ribeiro, CLT-002, 44h semanais, salário R$ 1.650,00, 20% insalubridade, PIN "1234").
   - Linhas 258–265: `sanitizeEmployee(emp)` remove `pinHash` e `pin`, expondo apenas o boolean `pinConfigured`.
   - Linhas 270–281: `calculateTimeDiffMinutes(startTime, endTime)` calcula minutos considerando cruzamento de meia-noite.
   - Linhas 359–528: `createEmployee(db, payload, author)` valida unicidade de CPF (11 dígitos), matrícula sequencial, obrigatoriedade de intervalo intrajornada >= 60 min para jornadas > 6h (Art. 71 CLT), salário base > 0, PIN de 4 dígitos e inicializa `functionalHistory` para auditoria. Rejeita expressamente nomes contendo "Cris" ou "Grazi".
   - Linhas 533–667: `updateEmployee(db, id, payload, author)` bloqueia prestadoras, audita em `functionalHistory` alterações salariais, de cargo e de status, valida Art. 71 CLT caso a escala seja modificada e rejeita nomes de prestadoras.

4. **Inspeção de `artifacts/api-server/hr/router.mjs`**:
   - Linhas 13–136: `createHrRouter({ db, saveDatabase })` monta:
     - `GET /health`: status do módulo.
     - `GET /employees`: listagem filtrada por `isCltEmployee`, sanitizada (sem hashes) e excluindo Cris e Grazi.
     - `POST /employees`: criação com status 201 e chamada a `saveDatabase("hr_employee_create")`, retornando 400 em caso de validação inválida.
     - `GET /employees/:id`: busca individual, retornando 404 se `isPrestadora` for true ou colaborador inexistente.
     - `PATCH /employees/:id`: atualização com auditoria e chamada a `saveDatabase("hr_employee_update")`, retornando 404 para prestadoras ou não encontrados, e 400/403 para validações e acesso negado.

5. **Inspeção de `artifacts/api-server/hr/index.mjs`**:
   - Linhas 20–40: `getDefaultHrSettings()` com geofence no Soho (-21.7584, -41.3262, raio de 150m), tolerância de 10 min, limite diário de 10h e 2h extras.
   - Linhas 46–112: `getDefaultHrComplianceSettings()` com 10 regras sindicais/trabalhistas configuradas nos 3 níveis (`alert`, `admin_override`, `hard_block`).
   - Linhas 117–140: `ensureHrCollections(db)` garante a existência e integridade das 11 coleções no `db`.
   - Linhas 146–151: `initHrWhatsAppAutomation` silenciado com `if (process.env.NODE_ENV === "test") return;` para evitar timers pendentes ou mensagens indesejadas em testes.

6. **Inspeção das Conexões em `artifacts/api-server/demo-server.mjs`**:
   - Linha 228: Importação de `createHrRouter, ensureHrCollections, initHrWhatsAppAutomation`.
   - Linhas 1086–1087: `defaultUsers` com `contractType: "prestador"` explicitado para Cris (`id: 2`) e Grazi (`id: 3`).
   - Linhas 1472, 6501 e 6744: Invocação de `ensureHrCollections(db)` na inicialização em memória, após carga de disco e após carga do PostgreSQL.
   - Linha 1497: Montagem canônica `app.use("/api/hr", createHrRouter({ db, saveDatabase }));`.
   - Linhas 5139 e 5160: `sanitizeMaidUsers()` assegurando continuamente `contractType = "prestador"`.
   - Linhas 8890–8905: `LIMITS` em `pruneDatabase()` remove todas as 11 coleções de RH da poda por limites curtos.
   - Linhas 8968–8980: Aplicação de retenção legal de 5 anos (1825 dias) para grandes volumes (>50.000 em `hrTimeRecords` e >20.000 em `hrComplianceAudits`).
   - Linhas 50588–50589: `initHrWhatsAppAutomation` acionado na inicialização do servidor HTTP fora de ambiente de teste.

---

## 2. Logic Chain (Cadeia de Raciocínio)

1. A partir da **Observação 2**, a paridade de 29/29 arquivos gêmeos foi confirmada de forma automatizada por SHA-256, cumprindo integralmente o requisito arquitetural R7 / F1 do projeto (`artifacts/api-server/` vs `scripts/`).
2. A partir da **Observação 3 e 4**, as entidades de colaboradores CLT em `employees.mjs` e as rotas em `router.mjs` implementam regras de negócio reais, completas e defensivas:
   - Validações de jornada 6x1 (44h) e intervalo intrajornada (Art. 71 CLT: >= 60 min para turnos > 6h) são aplicadas tanto na criação quanto na atualização.
   - A guarda de isolamento de Cris e Grazi opera em múltiplas camadas (IDs 2 e 3, nomes, apelidos, telefones e tipo de contrato), impedindo vazamento ou tratamento indevido como CLT.
   - Hashes de PIN (`pinHash`) e credenciais nunca são expostos em endpoints de leitura da API (`sanitizeEmployee`).
3. A partir da **Observação 5 e 6**, a inicialização das 11 coleções no `db` (`ensureHrCollections`) é chamada em todos os pontos de hidratação do banco de dados (inicialização, disco e nuvem Postgres), e a função de poda (`pruneDatabase()`) respeita o requisito de guarda documental legal de 5 anos (1825 dias).
4. A partir da **Observação 1**, o teste pontual dedicado `tests/hr-m1-backend-core.test.mjs` cobre todas as camadas (paridade, isolamento, schemas, coleções, poda e CRUD via Express) com 100% de sucesso (6/6 subtestes) e tempo de execução inferior a 1 segundo, sem afetar ou acionar suítes globais.
5. Não foi detectada nenhuma violação de integridade (sem hardcodes de testes, sem facades simuladas, sem atalhos espúrios, sem adulteração de logs).

---

## 3. Caveats (Ressalvas)

- **Parâmetro `payload.id` em `createEmployee`**: A função `createEmployee` aceita um `payload.id` opcional. Embora `isPrestadora({ id })` bloqueie buscas e atualizações para IDs 2 e 3, recomenda-se adicionar uma guarda explícita `if (payload.id && isPrestadora({ id: payload.id }))` no início de `createEmployee` para garantir rejeição imediata no momento da criação caso um cliente tente passar explicitamente `id: 2` ou `id: 3`.
- **Autenticação em `/api/hr`**: Os endpoints atuais utilizam `req.user?.username || "admin"` como autor padrão das ações em `functionalHistory`. A amarração com middleware de sessão/token JWT dos administradores será consolidada no Marco M5.
- **Testes Globais Preservados**: Conforme determinado estritamente no `AGENTS.md`, apenas o teste pontual `node --test tests/hr-m1-backend-core.test.mjs` foi executado. Nenhuma varredura global foi realizada.

---

## 4. Conclusion (Conclusão & Veredicto)

**Veredicto**: **APPROVE**

A implementação do **Marco M1 (Backend Core & Isolamento de Prestadoras)** cumpre com excelência todos os critérios de aceite definidos no `PROJECT.md` e `ORIGINAL_REQUEST.md`:
- Estrutura modular limpa e expansível sob `artifacts/api-server/hr/` e espelho em `scripts/hr/`.
- 100% de paridade SHA-256 restabelecida em todos os 29 arquivos gêmeos.
- Isolamento estrito e inviolável de Cris e Grazi como prestadoras de serviço diaristas.
- Sementes padrão corretas para Cozinheira Geral (CLT-001) e Camareira CLT (CLT-002).
- Proteção jurídica contra poda indevida com guarda de 5 anos (1825 dias).
- Roteador Express com operações CRUD funcionais, validação legal e trilha de auditoria em `functionalHistory`.

O Marco M1 está apto e homologado para o avanço ao Marco M2 (Ponto Eletrônico & Motor de Conformidade em 3 Níveis).

---

## 5. Verification Method (Método de Verificação Independente)

Para auditar de forma independente este veredicto:

1. **Executar a auditoria de paridade Twin-Server SHA-256**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
   *Critério*: Código de saída `0`, status `100% PASS` (29/29 arquivos).

2. **Executar a suíte de testes pontual dedicada do Marco M1**:
   ```powershell
   node --test tests/hr-m1-backend-core.test.mjs
   ```
   *Critério*: Código de saída `0`, 6 subtestes com status `ok`, 0 falhas.

3. **Inspecionar os arquivos de código implementados**:
   - `artifacts/api-server/hr/employees.mjs`
   - `artifacts/api-server/hr/router.mjs`
   - `artifacts/api-server/hr/index.mjs`
   - `artifacts/api-server/demo-server.mjs`
