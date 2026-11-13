# Handoff Report — Levantamento Arquitetural de Backend e Integrações (RH / CLT)

**Agente**: `explorer_survey_backend` (Explorer 1)  
**Data**: 2026-10-22  
**Destinatário**: `orchestrator` / `parent` (`58ecb31f-60d2-4e1e-9aac-82400a58c263`)  
**Status**: Concluído (Hard Handoff)

---

## 1. Observation

### 1.1 Servidor e Persistência de Dados (`demo-server.mjs`)
- **Arquivo principal**: `artifacts/api-server/demo-server.mjs` (50.562 linhas, ~2.1 MB).
- **Arquivo gêmeo**: `scripts/demo-server.mjs` (49.467 linhas).
- **Verificação de Paridade SHA-256 executada**:
  ```powershell
  node -e "const crypto = require('crypto'), fs = require('fs'); const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/demo-server.mjs')).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('scripts/demo-server.mjs')).digest('hex'); console.log('artifacts:', h1); console.log('scripts: ', h2); console.log('match:', h1 === h2);"
  ```
  **Resultado observado**:
  - `artifacts: 9780be92d7638809244a1a6830f2e5fb5f023e05f037dd08fbfd4079dc3c18a5`
  - `scripts:   6bf58bf7c484a3b54e71cc26871aa1a32bab9b72f431146d4cebb1de0338ce26`
  - `match: false`
  - **Causa direta**: O commit anterior `a7d4f78` (`feat(minibar)...`) alterou 1.355 linhas em `artifacts/api-server/demo-server.mjs` sem sincronizar `scripts/demo-server.mjs`. O código autoritativo em produção com as funcionalidades mais recentes está em `artifacts/api-server/demo-server.mjs`.
- **Mecanismo de Persistência**:
  - `demo-server.mjs:760`:
    ```javascript
    const DB_FILE = process.env.DATA_FILE || process.env.DATABASE_FILE || path.join(DATA_DIR, "database.json");
    ```
  - Estado em memória `db`: objeto JavaScript global hidratado em `loadDatabase()` (`demo-server.mjs:6458-6750`).
  - Quando PostgreSQL (`pgPool`) está configurado via `DATABASE_URL`:
    * Lê de `system_store WHERE key = 'db_state'` (`demo-server.mjs:6578`).
    * Salva via `saveDatabase(reason)` (`demo-server.mjs:9135-9194`):
      - Em modo rápido (`auto_save`): debounce de 300ms para disco local via `atomicWriteFileSync` (`demo-server.mjs:8939`) e debounce de 800ms para PostgreSQL via `flushPgState` (`demo-server.mjs:8795`).
      - Em modo manual (`manual_*`, `repair_*`, `settings_*`, `shutdown`): gravação síncrona imediata em disco e flush imediato para PostgreSQL (`demo-server.mjs:9140-9168`).
    * Gravação no Postgres: `INSERT INTO system_store (key, value, updated_at) VALUES ('db_state', $1::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()` (`demo-server.mjs:8813`).
    * Snapshots periódicos a cada 15 minutos (ou em razões manuais) na tabela `system_store_backups` (`demo-server.mjs:8821-8837`), retendo os 25 snapshots mais recentes.
    * Função `pruneDatabase()` (`demo-server.mjs:8856-8936`): poda coleções volumosas para evitar esgotamento de memória no container de 2GB do Render. **Atenção**: As coleções de ponto e folha de pagamento do módulo de RH NÃO devem sofrer poda agressiva, pois a legislação trabalhista exige guarda documental de no mínimo 5 anos.

### 1.2 Organização dos Módulos Existentes
- **Módulo WBP (`artifacts/api-server/wbp/` e `scripts/wbp/`)**:
  - Estrutura exemplar modularizada em subpasta: `alerts.mjs`, `ari-sync.mjs`, `availability.mjs`, `callbacks.mjs`, `client.mjs`, `config.mjs`, `inbox.mjs`, `pricing.mjs`, `provisional.mjs`, `reconciler.mjs`, `storage.mjs`, `vault.mjs`.
  - Montagem limpa em `demo-server.mjs:1490`:
    ```javascript
    app.use("/api/callback/wbp", createWbpCallbackRouter({ db, storage: wbpStorage, client: wbpClient, worker: wbpWorker, alertsManager: wbpAlertsManager, saveDatabase }));
    ```
- **Módulo Frigobar/Minibar**:
  - Implementado inline no próprio `demo-server.mjs` (linhas 46.600 a 49.800). Essa inserção inline aumentou excessivamente o tamanho do arquivo para 50.562 linhas e propiciou a quebra de sincronização com o twin-server `scripts/demo-server.mjs`.
- **Serviço de WhatsApp (Z-API)**:
  - Localizado em `artifacts/api-server/zapi-service.mjs`.
  - Função principal de envio: `sendZapiMessage(config, { phone, message, ... })` (`zapi-service.mjs:3697-3730`).
  - Suporta `bypassTestMode`, verificação de políticas de canal e logs em `db.whatsappHistory`. Em `NODE_ENV === "test"`, disparos reais devem ser interceptados por sandbox mock ou sender injetável.
- **Serviço de Notificações Internas**:
  - Função `createNotification(arg1, arg2, arg3)` (`demo-server.mjs:9294-9340`), salva notificações em `db.notifications` (categorias: `contingency`, `reservation`, `system_error`, `cleaning_alert`, etc.).
- **Armazenamento de Imagens / Selfies / Documentos**:
  - Localizado em `artifacts/api-server/storage-service.mjs:96`:
    `uploadImageToStorage(base64Data, filenamePrefix, db, folder)`
  - Converte dados Base64 (`data:image/...;base64,...`) em imagens otimizadas, enviando para Cloudflare R2 ou salvando em `artifacts/api-server/uploads/`, retornando a URL pública.
  - Tabela PostgreSQL `media_blobs` (`demo-server.mjs:6552-6562`) para externalização de imagens históricas sem sobrecarregar o JSON principal.

### 1.3 Cadastro e Tratamento Atual de Cris e Grazi
- **Arquivo `demo-server.mjs` (linhas 5108-5180)**:
  - Função explícita `sanitizeMaidUsers()`:
    * **Cris**: `id: 2`, `username: "Cris"`, `role: "camareira"`, `phone: "22988486446"`, `whatsapp: "5522988486446"`, `pixKey: "22988486446"`, `active: true`.
    * **Grazi**: `id: 3`, `username: "Grazi"`, `role: "camareira"`, `phone: "22999106204"`, `whatsapp: "5522999106204"`, `pixKey: "12977795766"`, `active: true`.
- **Regime de Governança e Pagamento**:
  - Cris e Grazi são **diaristas / prestadoras de serviço avulsas**.
  - O pagamento é gerado **por faxina realizada** (`demo-server.mjs:45311-45360`):
    * Cada limpeza concluída em `db.cleaningRequests` com `assignedUserId === 2` ou `3` gera uma entrada de crédito (`entryType: "credit"`) em `db.maidStatementEntries` via `syncMaidCredits(userId)`.
    * O fechamento quinzenal e pagamentos avulsos são registrados em `db.maidPayments` e consultados no extrato de governança (`/reports` e `/meu-extrato`).
  - As camareiras possuem permissões limitadas em `permissions.ts:139-146`:
    `CAMAREIRA_MODULES = ["/dashboard", "/reports", "/lista-compras", "/observations", "/tasks", "/achados-perdidos"]`.

---

## 2. Logic Chain

1. **Premissa de Isolamento Estrito**:
   - O requisito R1 e as diretrizes do projeto exigem categoricamente que Cris e Grazi não sofram nenhuma interferência: não devem bater ponto, não devem receber lembretes de ponto, não devem ter escalas CLT nem constar na folha de pagamento CLT.
2. **Separação de Entidades no Modelo de Dados**:
   - Como `db.users` armazena credenciais de login gerais (admin, gestor, recepção, camareiras), criar funcionários CLT como meros usuários pode gerar acoplamento ou contaminação.
   - Portanto, a entidade de colaboradores CLT deve ser mantida em uma coleção dedicada: `db.hrEmployees`.
   - Adicionalmente, qualquer consulta ou rotina CLT deve aplicar filtro estrito:
     `employee.active && employee.contractType === "clt" && employee.id !== 2 && employee.id !== 3 && employee.username?.toLowerCase() !== "cris" && employee.username?.toLowerCase() !== "grazi"`.
3. **Padrão Arquitetural Recomendado (Submódulos em `artifacts/api-server/hr/`)**:
   - A experiência do módulo WBP provou que modularizar em subdiretório dedicado (`artifacts/api-server/wbp/` e `scripts/wbp/`) mantém o código desacoplado, manutenível, legível e previne conflitos de merge.
   - Pelo contrário, a inserção inline do frigobar no `demo-server.mjs` resultou em 50.562 linhas e causou a descontinuidade de sincronização observada entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
   - Criando `artifacts/api-server/hr/` e sincronizando byte a byte com `scripts/hr/`, o `demo-server.mjs` apenas importa e monta o router `app.use("/api/hr", createHrRouter({ ... }))` e inicializa o motor de lembretes `initHrAutomationEngine(...)`.
   - Isso requer modificar menos de 30 linhas em `demo-server.mjs`, tornando a restauração da paridade SHA-256 imediata e segura.

---

## 3. Caveats

- **Divergência Existente no Repositório**:
  - Os arquivos `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` atualmente não possuem o mesmo hash SHA-256 (diferença de 1.095 linhas de frigobar decorrentes do commit `a7d4f78`). O implementador do backend deve sincronizar `scripts/demo-server.mjs` a partir de `artifacts/api-server/demo-server.mjs` no momento da implementação para cumprir a regra de paridade.
- **Armazenamento de Selfies de Ponto**:
  - As fotos de selfie de ponto eletrônico são capturadas em Base64 na batida. Para evitar inchaço do JSON `db` no PostgreSQL, o backend deve converter/salvar as imagens via `uploadImageToStorage` (Cloudflare R2 ou disco local em uploads) ou armazenar referência URL.
- **Coordenadas do Hotel (Geofence)**:
  - O hotel físico é o Edifício Soho Residence Service, na Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes/RJ. As coordenadas padrão do hotel são Latitude: `-21.7580`, Longitude: `-41.3235`, com raio padrão de 150 metros. Esses valores devem ser configuráveis pelo Admin em `db.hrSettings`.

---

## 4. Conclusion & Especificação Detalhada

### 4.1 Estrutura de Arquivos Recomendada para o Backend

```
artifacts/api-server/hr/  (e espelho idêntico em scripts/hr/)
├── employees.mjs           # CRUD de Funcionários CLT, cargos, salários e isolamento de Cris/Grazi
├── timekeeping.mjs         # Registro de ponto (selfie, GPS, geofence, device whitelist, espelhos)
├── compliance.mjs          # Motor de regras CLT e sindicato com 3 níveis (alert, admin_override, hard_block)
├── schedules.mjs           # Escalas 6x1 (44h), DSR, folgas dominicais cíclicas, horas extras e férias
├── payroll.mjs             # Fechamento de folha mensal, proventos, descontos INSS progressivo, holerite e PIX
├── contracts-aso.mjs       # Minutas contratuais, assinatura eletrônica em canvas e controle de ASO (PCMSO)
├── whatsapp-automation.mjs # Lembretes de ponto (entrada, almoço, 6h contínuas) e confirmação com histórico
├── router.mjs              # Express Router consolidando todos os endpoints REST do módulo /api/hr
└── index.mjs               # Exportações consolidadas e inicializadores
```

### 4.2 Modelo de Dados no `db` (`data/database.json` / Postgres `system_store`)

```json
{
  "hrEmployees": [
    {
      "id": "emp_cozinha_01",
      "userId": null,
      "name": "Funcionário de Cozinha",
      "cpf": "11122233344",
      "rg": "123456789",
      "ctps": "12345/001-RJ",
      "pis": "123.45678.90-1",
      "role": "cozinheiro",
      "roleName": "Cozinheiro(a) Geral",
      "department": "Cozinha",
      "unionCategory": "Hotéis, Restaurantes e Similares",
      "contractType": "clt",
      "workRegime": "6x1_44h",
      "weeklyHours": 44,
      "baseSalary": 1850.00,
      "additionalAllowances": {
        "insalubridadePercent": 0,
        "periculosidadePercent": 0,
        "outros": 0
      },
      "standardSchedule": {
        "workDaysPerWeek": 6,
        "dailyHours": "07:20",
        "entryTime": "07:00",
        "lunchExitTime": "12:00",
        "lunchReturnTime": "13:00",
        "exitTime": "15:20",
        "weeklyRestDay": "segunda"
      },
      "phone": "22988000001",
      "whatsapp": "5522988000001",
      "pixKey": "22988000001",
      "admissionDate": "2026-10-01",
      "active": true,
      "createdAt": "2026-10-22T10:00:00.000Z"
    },
    {
      "id": "emp_camareira_01",
      "userId": null,
      "name": "Camareira CLT",
      "cpf": "22233344455",
      "rg": "987654321",
      "ctps": "54321/001-RJ",
      "pis": "987.65432.10-9",
      "role": "camareira_clt",
      "roleName": "Camareira CLT",
      "department": "Governança",
      "unionCategory": "Hotéis, Restaurantes e Similares",
      "contractType": "clt",
      "workRegime": "6x1_44h",
      "weeklyHours": 44,
      "baseSalary": 1850.00,
      "additionalAllowances": {
        "insalubridadePercent": 20,
        "periculosidadePercent": 0,
        "outros": 0
      },
      "standardSchedule": {
        "workDaysPerWeek": 6,
        "dailyHours": "07:20",
        "entryTime": "08:00",
        "lunchExitTime": "12:00",
        "lunchReturnTime": "13:00",
        "exitTime": "16:20",
        "weeklyRestDay": "terca"
      },
      "phone": "22988000002",
      "whatsapp": "5522988000002",
      "pixKey": "22988000002",
      "admissionDate": "2026-10-01",
      "active": true,
      "createdAt": "2026-10-22T10:00:00.000Z"
    }
  ],
  "hrTimeRecords": [
    {
      "id": "rec_punch_1730000000",
      "employeeId": "emp_cozinha_01",
      "date": "2026-10-22",
      "time": "07:05:12",
      "punchType": "entrada",
      "selfieUrl": "/api/media/blob/blob_punch_...",
      "geolocation": {
        "lat": -21.75801,
        "lng": -41.32352,
        "accuracy": 12,
        "distanceFromHotelMeters": 8,
        "withinGeofence": true
      },
      "device": {
        "deviceId": "term_hotel_01",
        "isOfficialTerminal": true,
        "platform": "Android 14",
        "ip": "192.168.1.50"
      },
      "complianceFlags": [],
      "adminOverride": null,
      "whatsappNotificationSent": true,
      "createdAt": "2026-10-22T07:05:12.000Z"
    }
  ],
  "hrSettings": {
    "hotelLatitude": -21.7580,
    "hotelLongitude": -41.3235,
    "geofenceRadiusMeters": 150,
    "deviceWhitelistEnabled": false,
    "authorizedDevices": [
      {
        "deviceId": "term_hotel_01",
        "name": "Tablet Recepção / Terminal Ponto",
        "isOfficialTerminal": true,
        "authorizedAt": "2026-10-22T10:00:00Z"
      }
    ],
    "toleranceMinutes": 10,
    "nightShiftStart": "22:00",
    "nightShiftEnd": "05:00",
    "nightHourFactor": 1.142857,
    "nightAdditionPercent": 20,
    "overtimePercentWeekday": 50,
    "overtimePercentSundayHoliday": 100
  },
  "hrComplianceSettings": {
    "rules": {
      "intrajornada_6h": {
        "enabled": true,
        "level": "hard_block",
        "description": "Trabalhar mais de 6h contínuas sem intervalo ou intervalo inferior a 1h"
      },
      "interjornada_11h": {
        "enabled": true,
        "level": "hard_block",
        "description": "Descanso entre jornadas inferior a 11 horas consecutivas (Art. 66 CLT)"
      },
      "dsr_max_6_days": {
        "enabled": true,
        "level": "hard_block",
        "description": "Mais de 6 dias consecutivos trabalhados sem folga DSR (Art. 67 CLT / OJ 410)"
      },
      "overtime_max_2h": {
        "enabled": true,
        "level": "admin_override",
        "description": "Mais de 2 horas extras no dia ou jornada total superior a 10h (Art. 59 CLT)"
      },
      "health_vacation_block": {
        "enabled": true,
        "level": "hard_block",
        "description": "Escala ou batida em período de férias, afastamento ou com ASO vencido"
      },
      "geofence_device_lock": {
        "enabled": true,
        "level": "admin_override",
        "description": "Batida fora do raio permitido (GPS) ou dispositivo não autorizado na whitelist"
      }
    }
  },
  "hrSchedules": [],
  "hrVacations": [],
  "hrPayrolls": [],
  "hrContracts": [],
  "hrAsoRecords": []
}
```

### 4.3 Mapeamento Completo de Endpoints REST (`/api/hr/*`)

| # | Método | Endpoint | Descrição e Parâmetros |
|---|---|---|---|
| 1 | `GET` | `/api/hr/employees` | Lista funcionários CLT (exclui estritamente Cris e Grazi). Filtro opcional: `status`. |
| 2 | `POST` | `/api/hr/employees` | Cadastra funcionário CLT (dados pessoais, 6x1 44h, salário, PIX, adicionais). |
| 3 | `GET` | `/api/hr/employees/:id` | Retorna ficha cadastral completa, histórico funcional, escala ativa, ASO e contratos. |
| 4 | `PATCH` | `/api/hr/employees/:id` | Atualiza dados cadastrais, cargo, escala padrão ou status do funcionário. |
| 5 | `POST` | `/api/hr/punch` | **Registro de batida de ponto mobile/terminal**. Exige: `employeeId`, `punchType`, `selfie` (base64), `geolocation` (`lat`, `lng`, `accuracy`), `device` (`deviceId`). Valida cerca virtual, whitelist e regras CLT. Executa trava (`alert`, `admin_override`, `hard_block`) e dispara confirmação via WhatsApp. |
| 6 | `GET` | `/api/hr/timekeeping/records` | Consulta histórico de batidas filtrado por funcionário e período (`startDate`, `endDate`). |
| 7 | `GET` | `/api/hr/timekeeping/daily-sheet` | Espelho diário geral da equipe para a data informada (entradas, saídas, horas e status). |
| 8 | `GET` | `/api/hr/timekeeping/monthly-mirror/:employeeId` | Espelho mensal de ponto com horas normais, extras 50%/100%, ad. noturno e saldo acumulado. |
| 9 | `POST` | `/api/hr/timekeeping/records/:id/adjust` | Ajuste/abono manual de batida de ponto com justificativa do Admin (trilha de auditoria). |
| 10 | `GET` | `/api/hr/devices` | Lista aparelhos autorizados e estado do toggle `deviceWhitelistEnabled`. |
| 11 | `POST` | `/api/hr/devices/authorize` | Autoriza dispositivo na whitelist (terminal oficial ou aparelho homologado de funcionário). |
| 12 | `PATCH` | `/api/hr/devices/settings` | Atualiza configuração de whitelist de aparelhos e raio/coordenadas da cerca virtual. |
| 13 | `DELETE` | `/api/hr/devices/:deviceId` | Remove aparelho da whitelist de autorizados. |
| 14 | `GET` | `/api/hr/schedules` | Consulta escalas de trabalho programadas por funcionário e período. |
| 15 | `POST` | `/api/hr/schedules` | Gera ou salva escala de trabalho (grade 6x1 44h, DSRs e folgas dominicais). |
| 16 | `POST` | `/api/hr/schedules/validate` | Pré-valida grade de escala contra as 6 travas do motor de conformidade CLT. |
| 17 | `GET` | `/api/hr/vacations` | Consulta períodos aquisitivos, concessivos, saldo de dias e alertas de dobra de férias. |
| 18 | `POST` | `/api/hr/vacations/schedule` | Programa período de férias (validação de fracionamento em até 3 períodos). |
| 19 | `GET` | `/api/hr/compliance/settings` | Retorna as regras de conformidade e o nível de trava de cada uma (`alert`, `admin_override`, `hard_block`). |
| 20 | `PUT` | `/api/hr/compliance/settings` | Atualiza regras e níveis de trava do motor de conformidade. |
| 21 | `GET` | `/api/hr/compliance/audit-log` | Trilha de auditoria das ocorrências de desconformidade, overrides e bloqueios. |
| 22 | `POST` | `/api/hr/automation/trigger-check` | Executa varredura de lembretes de ponto no WhatsApp (esquecimento, almoço, limite de 6h). Nunca dispara em folgas/férias. |
| 23 | `GET` | `/api/hr/payroll` | Lista folhas de pagamento mensais geradas. |
| 24 | `POST` | `/api/hr/payroll/calculate` | Apura proventos (salário, HE 50%/100%, ad. noturno, reflexo DSR) e descontos legais (INSS progressivo, VT, vales, faltas) para uma competência. |
| 25 | `POST` | `/api/hr/payroll/close` | Fecha a folha da competência e gera holerites/demonstrativos oficiais. |
| 26 | `GET` | `/api/hr/payroll/:id/payslip` | Retorna o holerite estruturado em formato visual para impressão/PDF. |
| 27 | `POST` | `/api/hr/payroll/:id/send-whatsapp` | Envia o demonstrativo de pagamento / holerite diretamente ao WhatsApp do colaborador. |
| 28 | `GET` | `/api/hr/contracts` | Lista contratos gerados e status de assinatura. |
| 29 | `POST` | `/api/hr/contracts/generate` | Gera minuta de contrato CLT, acordo de banco de horas, termo de ponto e ficha de EPI. |
| 30 | `POST` | `/api/hr/contracts/:id/sign` | Registra assinatura eletrônica via canvas (Base64, timestamp UTC, IP e hash SHA-256). |
| 31 | `GET` | `/api/hr/aso` | Lista exames de saúde ocupacional (admissional, periódico, demissional, etc.). |
| 32 | `POST` | `/api/hr/aso` | Registra novo ASO (médico, clínica, aptidão, vencimento e upload do laudo). |
| 33 | `GET` | `/api/hr/aso/alerts` | Retorna alertas de ASOs vencidos ou a vencer em menos de 30 dias. |

---

## 5. Verification Method

Para verificar de forma independente e empírica as observações deste relatório:

1. **Verificação de Paridade SHA-256**:
   ```powershell
   node -e "const crypto = require('crypto'), fs = require('fs'); const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/demo-server.mjs')).digest('hex'); const h2 = crypto.createHash('scripts/demo-server.mjs')).digest('hex'); console.log('Paridade:', h1 === h2);"
   ```
2. **Inspeção do Cadastro de Cris e Grazi**:
   Abrir `artifacts/api-server/demo-server.mjs` nas linhas 5108 a 5180 e confirmar a função `sanitizeMaidUsers()` com os IDs `2` e `3`, papéis `camareira`, e nas linhas 45311 a 45360 o cálculo de créditos por faxina em `syncMaidCredits()`.
3. **Inspeção do Mecanismo de Persistência Postgres / Disco**:
   Abrir `artifacts/api-server/demo-server.mjs` nas linhas 6578 (`SELECT value FROM system_store WHERE key = 'db_state'`), 8813 (`INSERT INTO system_store...`) e 9135 (`saveDatabase()`).
4. **Comando de Teste Pontual do Módulo RH**:
   O teste dedicado a ser implementado pelo time de backend e QA deve ser executado exclusivamente através do comando pontual isolado:
   ```powershell
   node --test tests/hr-employee-management.test.mjs
   ```
   **Condições de invalidação**:
   - Se o teste pontual tocar no `data/database.json` real ou disparar mensagens WhatsApp reais sem mock, a integridade é considerada violada.
   - Se o teste listar Cris ou Grazi no endpoint de colaboradores CLT (`GET /api/hr/employees`), a condição de aceite R1 é considerada violada.
