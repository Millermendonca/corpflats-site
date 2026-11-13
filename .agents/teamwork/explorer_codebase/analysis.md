# Relatório de Análise da Arquitetura e Pontos de Integração (Guest-Flow-Manager)

**Data**: 2026-10-13  
**Autor**: Codebase Architecture Explorer  
**Status**: Concluído (Pronto para Planejamento e Implementação)  

---

## 1. Visão Geral da Arquitetura & Restrição de Arquivos Gêmeos

### 1.1 Topologia do Backend
O backend do **Guest-Flow-Manager** é um monolito Node.js (ES Modules, Express, V8) concentrado em um arquivo principal:
- `artifacts/api-server/demo-server.mjs` (~35.265 linhas, ~1,5 MB)
- `scripts/demo-server.mjs` (cópia gêmea)

### 1.2 Paridade SHA-256 dos Arquivos Gêmeos
A integridade entre os arquivos gêmeos foi verificada via criptografia SHA-256:
- `artifacts/api-server/demo-server.mjs`: `83980BF73F29E2F68497AC31F7E5DFCA4A7183BE8E4DDD1397FD1392E895337A`
- `scripts/demo-server.mjs`: `83980BF73F29E2F68497AC31F7E5DFCA4A7183BE8E4DDD1397FD1392E895337A`
- **Resultado**: **Paridade exata (100% idênticos byte a byte)**.

#### Status dos Serviços Duplicados (`artifacts/api-server/` vs `scripts/`)
| Arquivo de Serviço | Hash artifacts/api-server | Hash scripts/ | Status |
| :--- | :--- | :--- | :--- |
| `demo-server.mjs` | `83980bf7` | `83980bf7` | ✅ Idêntico |
| `fnrh-pdf-service.mjs` | `845254a8` | `845254a8` | ✅ Idêntico |
| `fnrh-serpro-service.mjs` | `daadda63` | `daadda63` | ✅ Idêntico |
| `maid-automation-service.mjs` | `a5bd2825` | `a5bd2825` | ✅ Idêntico |
| `server-monitor-service.mjs` | `0623b710` | `0623b710` | ✅ Idêntico |
| `storage-service.mjs` | `c3b6dbe7` | `c3b6dbe7` | ✅ Idêntico |
| `whatsapp-ai-service.mjs` | `4625efab` | `4625efab` | ✅ Idêntico |
| `zapi-service.mjs` | `c7ab9002` | `c7ab9002` | ✅ Idêntico |
| `mail-service.mjs` | `3f17611b` | `94717423` | ⚠️ **Divergência detectada** (linhas 939-940: fallbacks de rede Wi-Fi e senha) |

> **Diretriz Mandatória R10**: Qualquer novo módulo ou alteração no servidor/serviços deve manter sincronização byte a byte entre `artifacts/api-server/` e `scripts/`.

---

## 2. Modelo de Persistência e Proteção contra Poda (Pruning)

### 2.1 Armazenamento em Memória e Postgres
- **Objeto em memória**: `db` contém o estado integral da aplicação (flats, reservations, guests, cleaningRequests, tariffSettings, etc.).
- **Persistência em PostgreSQL**: Quando `DATABASE_URL` está configurada, o estado é gravado na tabela `system_store` no registro com chave `db_state`:
  ```sql
  INSERT INTO system_store (key, value, updated_at)
  VALUES ('db_state', $1::jsonb, NOW())
  ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW();
  ```
- **Debounce de Gravação (`saveDatabase`)**:
  - Disco local (`data/database.json`): Debounce de **300 ms** via `localSaveTimeout` e escrita atômica (`atomicWriteFileSync` / `atomicWriteFileAsync`).
  - PostgreSQL (`system_store`): Debounce de **800 ms** via `pgSaveTimeout` e `flushPgState()`.
  - Escrita Imediata/Síncrona: Ativada quando `reason` inicia com `manual_`, `repair_` ou é `shutdown`.
- **Snapshots de Histórico**:
  - Salvos em `system_store_backups` a cada 15 minutos (ou em operações manuais).
  - Poda automática retém apenas os **25 snapshots mais recentes** (`OFFSET 25 LIMIT 1` -> `DELETE FROM system_store_backups WHERE id < cutoffId`).

### 2.2 Comportamento da Função `pruneDatabase()`
A função `pruneDatabase()` (linhas 5796-5854) roda **em todo salvamento** (`flushLocalDiskState`, `flushPgState` e `saveDatabase` imediato). Ela impõe limites rígidos para conter consumo de RAM:
- `whatsappHistory`: máximo 500
- `whatsappConversations`: máximo 200 (e máximo 50 mensagens por conversa)
- `whatsappQueue`: máximo 100
- `breakfastOrders`: máximo 500
- `maidPayments`: máximo 500
- `maidStatementEntries`: máximo 500
- `lostAndFound`: máximo 300
- `garageAuthorizations`: máximo 500
- `reservationCommunications`: máximo 500
- `serviceOrders`: máximo 500
- `auditLogs`: máximo 200
- `notifications`: máximo 250
- `cleaningRequests`: se > 1.500 itens, remove limpezas concluídas há mais de 120 dias.
- `reservations`: se > 800 itens, remove reservas com check-out há mais de 180 dias (exceto status `confirmada`, `checkin` ou `pendente`).

### 2.3 Como Gravar Payloads WBP e Idempotência Fora do Blob Podável (R1 & Critérios de Aceite)
**Problema**: Se os payloads brutos da WebBookingPro ou as chaves de idempotência fossem guardados dentro de `db` (ex: `db.wbpPayloads`), eles aumentariam o peso do blob JSONB (~1,5MB+), consumiriam a memória do processo e estariam sujeitos a perda ou descarte pela poda.
**Solução Arquitetural Aprovada**:
1. **Ambiente com PostgreSQL (`pgPool` ativo)**:
   Criar tabelas relacionais dedicadas, **fora do blob `system_store`** (seguindo o mesmo padrão de `reservation_communications`, `system_audit_logs` e `fnrh_internal_audit_logs` já existentes no DDL de boot):
   ```sql
   CREATE TABLE IF NOT EXISTS wbp_raw_payloads (
     id BIGSERIAL PRIMARY KEY,
     guid UUID NOT NULL,
     action TEXT NOT NULL,
     source TEXT NOT NULL, -- 'callback' | 'polling'
     headers JSONB,
     payload JSONB NOT NULL,
     received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     processed BOOLEAN NOT NULL DEFAULT FALSE,
     processed_at TIMESTAMPTZ,
     booking_id TEXT,
     status TEXT NOT NULL DEFAULT 'received', -- 'received' | 'processed' | 'quarantine' | 'error'
     error_details TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_wbp_payloads_booking_id ON wbp_raw_payloads (booking_id);
   CREATE INDEX IF NOT EXISTS idx_wbp_payloads_processed ON wbp_raw_payloads (processed);

   CREATE TABLE IF NOT EXISTS wbp_idempotency (
     idempotency_key TEXT PRIMARY KEY, -- sha256 do payload ou booking_id + version
     booking_id TEXT NOT NULL,
     wbp_version TEXT,
     reservation_id INT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```
2. **Ambiente Isolado de Testes / Arquivo Local (`pgPool === null`)**:
   Armazenar em arquivo append-only separado: `data/wbp_payloads.jsonl` e `data/wbp_idempotency.json`.
   Dessa forma, `pruneDatabase()` nunca toca nesses arquivos e o payload bruto permanece 100% íntegro e imune à poda.

---

## 3. Limites de Memória e Hospedagem (Render)

### 3.1 Estado Atual (Configurado para Plano Free de 512 MB)
- `render.yaml`:
  - `plan: free`
  - `startCommand: node --max-old-space-size=380 --unhandled-rejections=warn server.mjs`
- `package.json`:
  - `"start": "node --max-old-space-size=384 server.mjs"`
- `server.mjs` (linhas 20-37):
  ```javascript
  const currentHeapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
  if (isDirectRun && !process.env.__CONTAINER_OPT__ && currentHeapLimitMB > 450 && process.env.NODE_ENV !== "test") {
    const child = spawn(process.execPath, ["--max-old-space-size=384", ...process.argv.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, __CONTAINER_OPT__: "1" }
    });
    // ...
  }
  ```

### 3.2 Adequação para o Plano Pago Render (~2 GB de RAM) (R10)
O Render aloca ~2.048 MB de RAM no plano contratado. Para aproveitar a capacidade do plano sem risco de o kernel Linux disparar `SIGKILL (OOM)`:
- Limite de Heap V8 recomendado: **`1536 MB`** (`--max-old-space-size=1536`).
- Margem de segurança reservada: **`512 MB`** para o sistema operacional Linux, runtime Node.js, buffers de rede, buffers do PostgreSQL e alocações nativas do V8.
- **Ajustes necessários**:
  1. `render.yaml`: atualizar `plan` para o plano pago (ou omitir) e `startCommand: node --max-old-space-size=1536 --unhandled-rejections=warn server.mjs`.
  2. `package.json`: atualizar `"start": "node --max-old-space-size=1536 server.mjs"`.
  3. `server.mjs`: elevar a trava de respawn de `450` para `1600` e o parâmetro para `--max-old-space-size=1536`.

---

## 4. Ciclo de Vida da Reserva e Automações

### 4.1 Criação de Reservas e Canais Existentes
As reservas hoje são criadas em:
1. `app.post("/api/pms/reservations")` (linha 13669): Criação manual pela recepção/administração.
2. `app.post("/api/reservations/direct-booking")` (linha 12526): Criação via motor direto do site.
3. `app.post("/api/pms/reservations/import-csv")` (linha 14703): Importação em lote.

Canais reconhecidos: `direta`, `site`, `site_direto`, `whatsapp`, `booking`, `airbnb`.

#### Regra Atual para OTAs (Booking / Airbnb)
Nas linhas 13745-13751 e 13774-13779:
```javascript
const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
if (isOta && (resolvedPaymentStatus === "pendente" || !resolvedPaymentStatus)) {
  resolvedPaymentStatus = "pago_total";
  resolvedPaidAmount = finalTotalAmount;
}
```
**Lacuna do Código Atual**: Toda reserva Booking/Airbnb hoje é tratada cegamente como paga integralmente (`pago_total`).
**Requisito R5**: Deve respeitar `PaymentCollect`:
- `PaymentCollect=Channel`: Pago pela OTA (`pago_total`, registra valor líquido a receber).
- `PaymentCollect=Property`: Pendente de cobrança no balcão/hotel (`pendente`, gera alerta à recepção).

### 4.2 Motor de Alocação de Flats ("Quarto da Vez" / Fair-Share)
Implementado na função `calculateFairShareStats(checkinDate, checkoutDate, excludeResId)` (linhas 13122-13222):
- Considera os 19 flats do condomínio Soho Residence Service.
- Filtra conflitos de reservas ativas (`r.checkinDate < checkoutDate && r.checkoutDate > checkinDate`).
- Filtra bloqueios (`db.roomBlocks`).
- Critérios de desempate e ordenação:
  1. Menor número de diárias ocupadas no mês do check-in (`monthOccupiedDays`).
  2. Maior ociosidade em dias desde o último check-out (`daysSinceLastCheckout`).
  3. Ordem alfanumérica do número do flat.

### 4.3 Automações Disparadas ao Criar Reserva
Ao criar uma reserva confirmada hoje, os seguintes gatilhos são executados:
1. **Governança / Camareiras**: Lança ou atualiza solicitação em `db.cleaningRequests` no dia do check-in (`twinBeds`, `extraMattress`, `adminNote`, `arrivingGuest`).
2. **SERPRO / FNRH**: Se `db.settings?.checkinProvider === "gov_fnrh"`, chama `fnrhSerproService.registerReservation(newReservation, db.settings)`.
3. **PIX (Inter / Estático)**: Se a reserva estiver com status `pre_reserva`, chama `createInterPixCob()` ou gera PIX estático.
4. **WhatsApp**: Chama `triggerImmediateWhatsApp(db, saveDatabase, "reservation_created" | "sameday_reservation", newReservation)`.
5. **E-mails de Recepção / Garagem**: Se o check-in for no próprio dia (`isReservationForToday`), renderiza `renderCheckinConfirmedEmail` e envia para `receptionEmail` e `garageEmail`.

### 4.4 Controle de Automações e Prevenção de PIX por Modo de Integração (R1 & R5)
| Modo | Cria Reserva no PMS? | Aloca Flat? | Dispara WhatsApp? | Dispara FNRH/SERPRO? | Dispara E-mails Recepção/Garagem? | Gera Cobrança PIX? |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`off` (Desligado)** | ❌ Não | ❌ Não | ❌ Não | ❌ Não | ❌ Não | ❌ Não |
| **`observe` (Somente Observar)** | ❌ Não | ❌ Não | ❌ Não | ❌ Não | ❌ Não | ❌ Não |
| **`auto` (Automático)** | ✅ Sim | ✅ Sim (Fair-Share) | ✅ Sim (Boas-vindas) | ✅ Sim | ✅ Sim (Same-day) | ❌ **PROIBIDO** |

> **Regra Mandatória**: Reservas originadas de OTAs via WebBookingPro **NUNCA** devem gerar cobrança PIX automática ou transição para `pre_reserva`, independentemente do modo de pagamento.

---

## 5. Disponibilidade Atual e Tarifas

### 5.1 As 4 Implementações Divergentes de Disponibilidade
No código atual existem quatro funções/rotas separadas calculando disponibilidade com regras conflitantes:
1. `GET /api/reservations/availability` (linhas 12258-12320): Checa reservas ativas e holds em `r.pendingModification`, além de corte de horário para camas twin. **Ignora completamente `db.roomBlocks` e ordens de serviço de manutenção**.
2. `POST /api/reservations/direct-booking` (linhas 12593-12624): Possui lógica inline própria. Checa reservas ativas e holds provisórios. **Ignora `db.roomBlocks` e ordens de serviço**.
3. `calculateFairShareStats` (linhas 13122-13222): Checa reservas ativas e `db.roomBlocks`. **Ignora holds provisórios (`r.pendingModification`) e ordens de serviço**.
4. `hasReservationConflict` (linhas 16974-17063): Checa reservas ativas, holds provisórios (`r.pendingModification`) e bloqueios (`db.roomBlocks`). **Ignora ordens de serviço (`serviceOrders`) e bloqueios preventivos de flat**.

> **Requisito R3 (Cálculo Único de Disponibilidade)**:
> Deve existir uma função unificada canônica `getSingleAvailability(startDate, endDate, flatId = null)` que consolide:
> - Reservas ativas (`confirmada`, `checkin`, `pendente`).
> - Pré-reservas não expiradas (`r.expiresAt > nowMs`).
> - Holds provisórios de modificação (`r.pendingModification`).
> - Bloqueios de quarto (`db.roomBlocks`).
> - Manutenções em andamento com bloqueio de UH (`db.serviceOrders` com `isBlocking === true`).
> Essa mesma função canônica deve alimentar tanto o cálculo de ARI (estoque) quanto as telas de reserva do PMS.

### 5.2 Estrutura Atual de Tarifas
- `db.tariffSettings`:
  - `mode`: `"auto"` (cálculo SEBRAE) ou `"manual"`.
  - `baseDailyRate`: R$ 237,00 (padrão).
  - `minNights`: 1 (atualmente não validado/ignorado).
  - `weekendMarkupPct`: 0.15 (15% em sextas e sábados).
  - `channelMarkups`: markups percentuais por canal (`direct`: 0%, `booking`: 18%, `airbnb`: 15%).
- `db.tariffOverrides`: Lista de exceções com `{ id, date, flatId, channel, rate, reason }`.
- `calculateDailyRate(flatId, date, channel)`:
  1. Verifica se há override específico para a data/flat/canal.
  2. Obtém a diária base (SEBRAE ou manual).
  3. Aplica markup de fim de semana (sextas e sábados).
  4. Aplica markup do canal.

#### Lacunas em Relação ao R4 (Planilha SEBRAE & Travas)
1. **Falta de Planos Tarifários**: Não existem "Sem café" e "Com café" no motor de cálculo.
2. **Custo por UH e Imposto Simples/ISS (6%)**: O cálculo atual (`calculateSebraeSustainableRate`) não inclui a alíquota de 6% sobre faturamento nem fecha com a composição real dos custos da planilha.
3. **Contagem Dupla Corrigida**: A planilha do usuário tem R$ 149,38 de custo por UH. Com a fórmula corrigida (custo ÷ (1 - 0,15 comissão - 0,25 margem - 0,06 imposto)), a tarifa mínima sustentável é **R$ 276,63**.
4. **Travas Ausentes**: Não há trava de piso, trava de variação máxima (>30%) nem fluxo de aprovação com pré-visualização antes da publicação no ARI.

---

## 6. Cartões de Crédito e Segurança Administrativa (R6)

### 6.1 Estado Atual do Código
- Atualmente o sistema **NÃO armazena dados de cartão de crédito**.
- As reservas registram apenas referências a transações do Mercado Pago (`mpPaymentId`, `mpPreferenceId`) ou string de forma de pagamento (`"cartao_credito"`).
- O cookie de autenticação `gfm_session_v2` é apenas um payload JSON codificado em base64, sem assinatura criptográfica.

### 6.2 Especificação de Segurança Obrigatória para WBP (R6)
1. **Armazenamento Criptografado**:
   - Algoritmo: **AES-256-GCM** com IV aleatório de 12 bytes e Auth Tag de 16 bytes.
   - Chave mestra: Fornecida obrigatoriamente via variável de ambiente `CREDIT_CARD_ENCRYPTION_KEY` (32 bytes / 64 hex chars). **Nunca gravada no banco**.
   - **Exclusão terminante do CVV**: O CVV recebido no payload da OTA **NUNCA deve ser persistido**. Deve ser descartado imediatamente da memória.
   - Estrutura de armazenamento na reserva:
     ```json
     {
       "cardMasked": "************1234",
       "cardBrand": "mastercard",
       "cardHolder": "FULANO DE TAL",
       "cardExpiry": "12/28",
       "cardEncrypted": {
         "ciphertext": "...",
         "iv": "...",
         "tag": "..."
       },
       "cardStoredAt": "2026-10-13T22:00:00.000Z"
     }
     ```
2. **Visualização Restrita a Administradores**:
   - Exige rota específica: `POST /api/pms/reservations/:id/view-card`.
   - Requer **redigitação de senha** do usuário com perfil `admin` (`verifyPassword(password, user.passwordHash)`).
   - A confirmação de senha gera um token descartável de uso único com expiração de 5 minutos.
   - Toda tentativa (sucesso ou falha) é registrada em `system_audit_logs` e `artifacts/api-server/audit_logs.jsonl` com IP, usuário e timestamp.
   - Em nenhuma hipótese o número descriptografado pode ser emitido em listagens normais (`GET /api/pms/reservations`) ou logs.
3. **Ciclo de Vida e Exclusão Automática**:
   - Rotina diária/horária de limpeza: apaga `cardEncrypted` **7 dias após o check-out** da reserva.
   - Em caso de cancelamento sem custos, o cartão é apagado **imediatamente**.

---

## 7. Padrão de Testes Pontuais e Isolamento

### 7.1 Padrão Estabelecido em `tests/tariff-engine.test.mjs`
- **Framework**: Módulo nativo `node:test` (`describe, it, before, after`) e `node:assert/strict`.
- **Comando de Execução**: `node --test tests/tariff-engine.test.mjs`.
- **Isolamento Completo do Banco de Produção**:
  1. Cria uma cópia temporária exclusiva:
     ```javascript
     const isolatedDbPath = path.join(rootDir, `data/test-tariff-db-${Date.now()}.json`);
     ```
  2. Spawna o processo do servidor em porta dedicada (ex: 3995) passando:
     ```javascript
     env: {
       ...process.env,
       PORT: String(TEST_PORT),
       DATA_FILE: isolatedDbPath,
       DATABASE_FILE: isolatedDbPath,
       NODE_ENV: "test"
     }
     ```
  3. **Segurança de Dados**: Garante que `DATABASE_URL` não é passada ou é explicitamente removida do ambiente (`delete env.DATABASE_URL`), impedindo qualquer conexão ao PostgreSQL de produção.
  4. Aguarda inicialização via pooling em `GET /api/system/version`.
  5. Teardown (`after`): Encerra a árvore de processos via `taskkill /F /T /PID` (Windows) e remove o arquivo temporário `isolatedDbPath`.

### 7.2 Infraestrutura de Sandbox Disponível em `e2e/sandbox/`
O repositório já conta com ferramentas prontas para os testes da integração:
- `mock-zapi.mjs`: Servidor mock HTTP em memória para WhatsApp (porta 5056). Permite inspecionar mensagens enviadas (`getSentMessages()`) e simular webhooks de entrada (`dispatchIncomingMessage()`).
- `mock-smtp.mjs`: Interceptador SMTP TCP nativo (porta 5025). Grava todos os e-mails disparados em `.mock-smtp-emails.json` e memória (`getSentEmails()`). Zero tráfego de saída real.
- `time-travel.mjs`: Permite manipular o relógio do backend (`POST /api/test/time-travel`) para testar cutoffs de café, turnover de camareiras e expiração de dados de cartão de crédito.
- `db-seeder.mjs`: Seeder determinístico contendo os 19 flats reais e usuários padrão com sanitização estrita.
- `pix-simulator.mjs`: Simulador de webhook e liquidação PIX.

---

## 8. Status do Git e Branch de Trabalho
- **Branch Atual**: `main` (sincronizada com `origin/main`).
- **Branch Alvo da Demanda**: `feature/wbp-integration` (ainda a ser criada a partir de `main`).
- **Modificações não commitadas existentes**:
  - Arquivos em `.agents/teamwork/` (metadados e relatórios dos agentes).
  - 11 linhas de log local em `artifacts/api-server/audit_logs.jsonl` (a serem preservadas no primeiro commit).
- **Diretriz Mandatória de Versionamento**:
  - Nunca fazer merge direto na `main`.
  - Todo `git commit` deve ser acompanhado de `git push origin feature/wbp-integration`.
  - Ao mexer em `artifacts/limpeza/src`, executar `npm run build` na pasta `artifacts/limpeza` e versionar `dist/`.

---

## 9. Conclusão da Análise de Arquitetura
A arquitetura do Guest-Flow-Manager está completamente mapeada. O sistema possui robustez operacional com seu modelo em memória + debounced Postgres, mas possui pontos críticos que foram precisamente identificados para a integração WebBookingPro:
1. Payloads brutos e idempotência devem viver em tabelas dedicadas fora do blob para não serem afetados pela poda periódica.
2. O cálculo de disponibilidade precisa ser unificado antes de alimentar o ARI.
3. A criação de reservas de OTA precisa respeitar `PaymentCollect` e barrar geração de PIX.
4. Os dados de cartão de crédito precisam de blindagem AES-256-GCM com descarte de CVV e chave em variável de ambiente.
5. Os arquivos gêmeos devem ser rigorosamente espelhados a cada alteração.
