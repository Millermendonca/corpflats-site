# Análise Arquitetural — Marco 4: Webhooks de Entrada e Polling em Segundo Plano (Features 17 & 18)

**Autor:** Explorer 1 — Milestone 4 (Webhooks & Polling)  
**Data:** 2026-10-14  
**Repositório:** Guest-Flow-Manager (CorpFlats Soho Residence)  
**Branch Alvo:** `feature/wbp-integration`  
**Escopo:** Feature 17 (Inbound Webhooks & Form Parsing) e Feature 18 (Background Polling Backup)

---

## 1. Sumário Executivo & Limites do Problema

O Marco 4 habilita o fluxo de entrada de reservas de OTAs (Booking.com e Airbnb) roteadas pelo channel manager **WebBookingPro (WBP)** até o PMS **Guest-Flow-Manager**.

A responsabilidade das Features 17 e 18 constitui a **camada de transporte, segurança e ingestão resiliente**:
- **Feature 17 (Inbound Webhooks & Form Parsing)**: Receptor HTTP no PMS para callbacks assíncronos disparados pela WBP (`/BookingCreate`, `/NotifyBooking`, `/ARIFullRefresh`, `/RoomInfo`). Deve suportar tanto `application/json` quanto `application/x-www-form-urlencoded`, sanitizar cartões (descarte de CVV em memória), validar credenciais com proteção contra timing attacks, e gravar o payload bruto de forma imutável e durável antes de qualquer regra de negócio.
- **Feature 18 (Background Polling Backup)**: Mecanismo de contingência autônomo periódico (intervalo padrão de 30 minutos) que consulta a WBP via `GetBookingList` com desconto de margem temporal de 5 minutos (`wbp_booking_version - 5 min`) para mitigar assimetrias de relógio entre servidores. Baixa reservas pendentes via `GetBookingId`, grava no armazenamento durável com descarte prévio de CVV, e despacha confirmação via `AckBooking` **estritamente após** a persistência durável.
- **Resiliência e Interruptor Geral**: Conformidade estrita aos 3 modos operacionais do sistema (`off`, `observe`, `auto`), garantindo zero tráfego indesejado, zero vazamento de dados de cartão de crédito e zero falsos positivos de concorrência entre entregas simultâneas de webhook e polling.

---

## 2. Feature 17: Inbound Webhooks & Form Parsing

### 2.1 Mapeamento dos Endpoints de Callback e Content-Types

De acordo com a especificação oficial Build-To-Us v1.0 (`wbpAPI.yaml` e documentação local em `wbp_docs/`):

| Endpoint | Content-Type WBP | Formato do Payload | Campos Principais | Resposta Esperada pela WBP |
|---|---|---|---|---|
| `POST /api/callback/wbp/BookingCreate` | `application/json` (ou `urlencoded` fallback) | JSON Object | `shared_secret`, `pms_property_id`, `wbp_property_id`, `reservation` (ou `booking` conforme Erratum E2) | HTTP 200 `{}` |
| `POST /api/callback/wbp/NotifyBooking` | `application/x-www-form-urlencoded` | URL Encoded String | `shared_secret`, `wbp_property_id`, `booking_id` | HTTP 200 `{}` |
| `POST /api/callback/wbp/ARIFullRefresh` | `application/json` (ou `urlencoded`) | JSON Object | `shared_secret`, `pms_property_id`, `wbp_property_id` | HTTP 200 `{ "UpdateId": <timestamp> }` |
| `POST /api/callback/wbp/RoomInfo` | `application/json` | JSON Object | `shared_secret`, `pms_property_id` | HTTP 200 `{ "RoomInfo": [...] }` |

### 2.2 Estratégia de Parsing e Sanitização

1. **Suporte Dual a Content-Type**:
   - O roteador de callbacks no Express (`createWbpCallbackRouter`) deve incluir internamente middlewares de parsing dedicados:
     ```javascript
     router.use(express.json({ limit: "10mb" }));
     router.use(express.urlencoded({ extended: true, limit: "10mb" }));
     ```
   - Em cenários onde um gateway intermediário envia JSON dentro de um campo de formulário (ex: `req.body.payload` ou `req.body.reservation` como string serializada), o roteador deve aplicar fallback automático via `JSON.parse` seguro.

2. **Autenticação & Timing Attack Protection**:
   - A autenticação é baseada em `shared_secret`.
   - A verificação deve utilizar hashing SHA-256 e comparação em tempo constante (`crypto.timingSafeEqual`) para evitar ataques de temporização (timing attacks):
     ```javascript
     export function verifyWbpCallbackAuth(reqSharedSecret, configuredSecret = null) {
       const secret = configuredSecret || process.env.WBP_SHARED_SECRET || "";
       if (!secret || !reqSharedSecret) {
         if (process.env.NODE_ENV === "test" && secret === "") return true;
         return false;
       }
       const bufA = crypto.createHash("sha256").update(String(secret)).digest();
       const bufB = crypto.createHash("sha256").update(String(reqSharedSecret)).digest();
       return crypto.timingSafeEqual(bufA, bufB);
     }
     ```
   - Se a validação falhar: responder HTTP 200 `{ "ErrorCode": 1001, "Error": "Invalid credentials" }`. (A WBP exige HTTP 200 com código numérico para identificação de erros).

3. **Higiene de Cartões na Ingestão (Diretriz Crítica R6)**:
   - A especificação WBP prevê que reservas podem carregar dados de cartão de crédito no objeto `reservation.Payments` ou `reservation.Cards` (PAN, bandeira, titular, validade e código de segurança/CVV).
   - **Regra de Ouro**: O CVV (`card_cvv`, `cvv`, `cvc`, `security_code`, `card_security_code`, etc.) deve ser **descartado imediatamente da memória** antes de qualquer chamada a `storage.recordRawPayload` e antes de qualquer gravação em arquivo ou log.
   - Implementação recomendada da função sanitizadora:
     ```javascript
     export function sanitizeCardDataInMemory(payload) {
       if (!payload || typeof payload !== "object") return payload;
       const clone = JSON.parse(JSON.stringify(payload));

       function scrub(obj) {
         if (!obj || typeof obj !== "object") return;
         if (Array.isArray(obj)) {
           obj.forEach(scrub);
           return;
         }
         for (const key of Object.keys(obj)) {
           const lower = key.toLowerCase();
           if (
             lower.includes("cvv") ||
             lower.includes("cvc") ||
             lower.includes("security_code") ||
             lower === "securitycode"
           ) {
             delete obj[key];
           } else if (typeof obj[key] === "object") {
             scrub(obj[key]);
           }
         }
       }

       scrub(clone);
       return clone;
     }
     ```
   - O PAN completo nunca deve ser registrado em `audit_logs.jsonl`, `console.log` ou passado em texto claro para os campos do PMS.

### 2.3 Registro Pré-Processamento Durável (`storage.recordRawPayload`)

- Antes de qualquer processamento de negócio (alocação de flat, cálculo tarifário, busca de conflito ou envio de mensagens), o payload sanitizado é gravado de forma imutável e durável via `storage.recordRawPayload`:
  ```javascript
  const payloadId = await storage.recordRawPayload({
    source: "webhook",
    endpoint: "BookingCreate",
    payload: sanitizedPayload,
    idempotencyKey: keys.idempotencyKey,
    orderId: keys.orderId
  });
  ```
- **Imunidade Operacional**:
  - Em PostgreSQL de produção: salvo na tabela isolada `wbp_raw_payloads` (fora do blob JSONB `system_store`).
  - Em modo de arquivos locais / testes isolados: salvo no arquivo append-only JSONL `data/wbp_raw_payloads.jsonl`.
  - Esta tabela/arquivo é 100% imune a `pruneDatabase` (rotina de poda de reservas antigas do demo-server).

### 2.4 Respostas HTTP e Códigos de Status

A WebBookingPro requer que os endpoints retornem sempre HTTP 200:
- **Sucesso em BookingCreate**: HTTP 200 `{}`
- **Sucesso em NotifyBooking**: HTTP 200 `{}`
- **Sucesso em ARIFullRefresh**: HTTP 200 `{ "UpdateId": Date.now() }`
- **Sucesso em RoomInfo**: HTTP 200 `{ "RoomInfo": [ ... ] }`
- **Erros de Validação / Autenticação**:
  - `ErrorCode: 1001` — Credenciais inválidas (`shared_secret` incorreto)
  - `ErrorCode: 1031` — Integração desligada (`mode === 'off'`)
  - `ErrorCode: 4` — Payload inválido ou ausência de dados obrigatórios
  - `ErrorCode: 1003` — Falha interna temporária

---

## 3. Feature 18: Background Polling Backup & Worker

### 3.1 Intervalo e Ciclo de Vida do Worker

- **Intervalo Padrão**: 30 minutos (1.800.000 ms), configurável por variável de ambiente `WBP_POLLING_INTERVAL_MINUTES` ou `db.settings.wbp_polling_interval_minutes`.
- **Interruptor Geral**:
  - No modo `off`: nenhum timer (`setInterval`) é registrado. `intervalId` permanece `null`. Se o modo for alterado em tempo de execução para `off`, o worker para imediatamente.
  - Nos modos `observe` e `auto`: o timer é iniciado e monitora periodicamente novas reservas.

### 3.2 Rastreamento de Versão & Dedução de Margem de 5 Minutos

1. **Problema do Relógio**:
   - Pequenas assimetrias de relógio entre os servidores da WBP e o servidor do PMS poderiam causar a perda de reservas criadas ou alteradas exatamente no instante de transição entre polls.
2. **Especificação Oficial**:
   - *"To ensure that no booking are skipped due to a time-offset between your and our servers, make sure to always reduce 5 or more minutes from the time given."*
3. **Mecanismo Implementado**:
   - `client.adjustBookingVersion(lastVersion)`:
     - Formato esperado pela WBP: `YYYY-MM-DD HH:MM:SS` (UTC).
     - Subtrai 5 minutos exatos da timestamp UTC anterior.
     - Exemplo: `2026-10-14 14:35:00` → `2026-10-14 14:30:00`.
   - **Fallback para Primeira Execução (`null`)**:
     - Se `lastVersion` for `null`, `undefined` ou vazio: o client envia explicitamente `wbp_booking_version: null`. A WBP responde com a lista completa de reservas ativas.
   - **Persistência do Cursor**:
     - O cursor de versão bem-sucedido é atualizado no PMS (`db.settings.wbp_last_booking_version = newUtcVersion`) **apenas após** a conclusão bem-sucedida da rodada de polling.

### 3.3 Fluxo de Execução do Polling

```
                     +---------------------------------------+
                     |    WbpBackgroundWorker.poll()         |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     | 1. Recuperação de Falhas (Startup)    |
                     |    storage.getUnprocessedPayloads()   |
                     |    Processa e finaliza pendências     |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     | 2. client.getBookingList()            |
                     |    Com version - 5 min ou null        |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     | 3. Para cada booking_id retornado:    |
                     +---------------------------------------+
                                         |
                     +-------------------+-------------------+
                     | Já processado?                        |
                     +-------------------+-------------------+
                               | Sim               | Não
                               v                   v
                     +-----------------+   +---------------------------------------+
                     | Pula / Ignora   |   | 4. client.getBookingId(booking_id)    |
                     +-----------------+   +---------------------------------------+
                                                           |
                                                           v
                                           +---------------------------------------+
                                           | 5. Sanitização em Memória             |
                                           |    (Descarte absoluto de CVV)         |
                                           +---------------------------------------+
                                                           |
                                                           v
                                           +---------------------------------------+
                                           | 6. storage.recordRawPayload()         |
                                           |    Persistência durável (insert-only) |
                                           +---------------------------------------+
                                                           |
                                                           v
                                           +---------------------------------------+
                                           | 7. Modo 'auto'?                       |
                                           +---------------------------------------+
                                               | Sim                 | Observe / Off
                                               v                     v
                             +-----------------------------------+ +-------------------+
                             | claimForProcessing()              | | Apenas auditoria  |
                             | processIncomingOTA()              | +-------------------+
                             | PMS State Mutated (Reserva/Quar)  |
                             +-----------------------------------+
                                               |
                                               v
                             +-----------------------------------+
                             | 8. client.ackBooking(booking_id)  |
                             |    (Apenas após gravação durável!)|
                             +-----------------------------------+
                                               |
                                               v
                             +-----------------------------------+
                             | 9. claim.release(processed)       |
                             +-----------------------------------+
```

### 3.4 Ordem Estrita de Confirmação (`AckBooking`)

- **Regra de Segurança Inegociável**: O método `client.ackBooking({ booking_id })` **NUNCA** pode ser chamado antes de o payload ter sido gravado de forma durável no storage (`recordRawPayload`) e persistido no estado do PMS (seja na Caixa de Entrada OTA, seja na Quarentena).
- Se ocorrer uma falha de conexão, desligamento ou crash do servidor entre o `recordRawPayload` e o `ackBooking`:
  - O payload bruto permanece marcado com `status = 'unprocessed'`.
  - Ao reiniciar o processo ou no próximo ciclo de polling, `storage.getUnprocessedPayloads()` detecta a reserva pendente, reprocessa de forma idempotente e conclui o `ackBooking`.

---

## 4. Matriz de Resiliência & Modos Operacionais

O interruptor geral governa estritamente o comportamento das rotas de entrada e das rotinas em segundo plano:

| Operação / Cenário | Modo `off` (Desligado) | Modo `observe` (Somente Observar) | Modo `auto` (Automático) |
|---|---|---|---|
| **Chamada a `POST /BookingCreate`** | Retorna HTTP 200 `{ ErrorCode: 1031, Error: "Integration disabled" }`. Zero gravações. Zero mutações. | Retorna HTTP 200 `{}`. Sanitiza CVV. Grava no storage durável (`wbp_raw_payloads`). Log de auditoria. Zero reservas criadas. Zero automações. | Retorna HTTP 200 `{}`. Sanitiza CVV. Grava storage durável. Bloqueio de concorrência. Cria reserva ou envia para Quarentena. Dispara automações. |
| **Chamada a `POST /NotifyBooking`** | Retorna HTTP 200 `{ ErrorCode: 1031 }`. Ignora. | Retorna HTTP 200 `{}`. Grava payload bruto de notificação. Não busca reserva. | Retorna HTTP 200 `{}`. Grava payload bruto. Dispara busca imediata do `booking_id` e processamento. |
| **Chamada a `POST /ARIFullRefresh`** | Retorna HTTP 200 `{ ErrorCode: 1031 }`. | Retorna HTTP 200 `{ UpdateId: ts }`. Grava payload bruto. Loga requisição (dry-run). | Retorna HTTP 200 `{ UpdateId: ts }`. Grava payload bruto. Enfileira `WbpAriSynchronizer.enqueueFullPush()`. |
| **Timer de Polling em Segundo Plano** | **Desativado** (`intervalId === null`). Zero chamadas de saída. | Ativo a cada 30 min. Baixa reservas, sanitiza CVV e salva no storage durável para auditoria, mas **não** cria reservas e **não** ack. | Ativo a cada 30 min. Baixa reservas, sanitiza CVV, salva duravelmente, processa no PMS e envia `AckBooking`. |
| **Chamadas de Saída do `WBPClient`** | Lança `WbpApiError` com código 1031. Zero tráfego de rede. | Permitidas para consultas de leitura (`HealthCheck`, `GetRoomTypes`, `GetBookingList`). | Permitidas para todos os endpoints, incluindo `ARIUpdate` e `AckBooking`. |
| **Automações (WhatsApp, SERPRO, E-mails)** | Inativas. | **Rigorosamente zero disparos.** | Disparadas para reservas criadas (WhatsApp de boas-vindas, FNRH/SERPRO, governança, portaria). **PIX estritamente suprimido.** |

---

## 5. Diretrizes Parentais Obrigatórias & Impacto em F17/F18

### 5.1 Isolamento de Notificações em Testes (AGENTS.md)
- O código de produção **não pode ter notificações comentadas ou silenciadas**.
- Todos os testes pontuais de M4 (`tests/wbp-integration/m4-*.test.mjs`) devem rodar com:
  1. `NODE_ENV = "test"`
  2. `DATABASE_URL` estritamente deletada do `process.env`.
  3. `DATA_FILE` direcionado para uma cópia isolada em `os.tmpdir()`.
  4. Mocks de sandbox ativos (`e2e/sandbox/mock-zapi.mjs`, `e2e/sandbox/mock-smtp.mjs`) interceptando todo e qualquer tráfego externo.
  5. Asserção obrigatória de integridade de `data/database.json` real (SHA-256 e mtime inalterados antes e depois da execução).

### 5.2 Mapeamento de Pagamento `PaymentCollect` vs Regra Legada `pago_total`
- O código legado do `demo-server.mjs` (linha ~14226) impunha:
  ```javascript
  if (isOta) {
    resolvedPaymentStatus = "pago_total";
  }
  ```
- **Nova Regra Canônica para WBP**:
  - `PaymentCollect = "Channel"`: A reserva foi cobrada pela OTA (Booking.com ou Airbnb). O status deve ser `pago_total`, registrando o valor líquido a receber (`netAmount` após dedução da comissão).
  - `PaymentCollect = "Property"`: A reserva será cobrada na recepção do hotel pelo CorpFlats. O status **deve ser `pendente`**. O código de ingestão deve explicitamente proteger este valor contra sobrescrita pelo fluxo legado e gerar um alerta à recepção para cobrança no check-in.

### 5.3 Higiene de Cartões na Ingestão (Feature 17/18 & M5)
- Em conformidade com o R6:
  - O código de segurança/CVV (`card_cvv`, `cvv`, `cvc`, `security_code`) é descartado imediatamente em memória. Nunca entra em `wbp_raw_payloads`, `wbp_idempotency`, nem em logs.
  - O PAN (número do cartão) nunca deve ser gravado em texto claro em `db.reservations`, `quarantineBookings`, `wbpInbox` ou `audit_logs.jsonl`. Apenas o formato mascarado (`**** **** **** 1234`) ou os últimos 4 dígitos são disponibilizados no estado comum, enquanto a criptografia AES-256-GCM é delegada para o M5 (`card-vault.mjs`).

### 5.4 Transição Segura & Deduplicação (R5)
- Se uma reserva recebida por webhook ou polling coincidir com uma reserva manual pré-existente (mesmo canal, mesmas datas de check-in/out e nome do hóspede compatível):
  - A reserva manual é **vinculada** (gravando o `externalOrderId` e metadados da WBP), sem duplicar a reserva e sem alterar o flat ou o preço digitado manualmente.
  - Casos com divergências (datas diferentes, flats já ocupados ou ambiguidades) são roteados para a **Quarentena**.

---

## 6. Blueprint de Implementação (Proposta de Código para o Worker)

### 6.1 Módulo `artifacts/api-server/wbp/callbacks.mjs` Refatorado

Abaixo apresenta-se a estrutura recomendada para `callbacks.mjs`:

```javascript
/**
 * artifacts/api-server/wbp/callbacks.mjs
 * 
 * Features 17 (Inbound Webhooks & Form Parsing) & 18 (Background Polling Backup)
 */

import crypto from "node:crypto";
import express from "express";
import { getIntegrationMode, isWbpEnabled, isWbpAutoMode, WBP_MODES } from "./config.mjs";
import { defaultStorage } from "./storage.mjs";
import { WBPClient } from "./client.mjs";
import { getAriSynchronizer } from "./ari-sync.mjs";

/**
 * Sanitiza recursivamente o payload em memória, descartando qualquer variante de CVV.
 */
export function sanitizeCardDataInMemory(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload));

  function scrub(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(scrub);
      return;
    }
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("cvv") ||
        lower.includes("cvc") ||
        lower.includes("security_code") ||
        lower === "securitycode"
      ) {
        delete obj[key];
      } else if (typeof obj[key] === "object") {
        scrub(obj[key]);
      }
    }
  }

  scrub(clone);
  return clone;
}

/**
 * Validação segura de shared_secret via tempo constante.
 */
export function verifyWbpCallbackAuth(reqSharedSecret, configuredSecret = null) {
  const secret = configuredSecret || process.env.WBP_SHARED_SECRET || "";
  if (!secret || !reqSharedSecret) {
    if (process.env.NODE_ENV === "test" && secret === "") return true;
    return false;
  }
  const bufA = crypto.createHash("sha256").update(String(secret)).digest();
  const bufB = crypto.createHash("sha256").update(String(reqSharedSecret)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Cria o Express Router para recepção de webhooks da WebBookingPro.
 */
export function createWbpCallbackRouter(options = {}) {
  const router = express.Router();
  const db = options.db || null;
  const storage = options.storage || defaultStorage;
  const configuredSecret = options.sharedSecret || process.env.WBP_SHARED_SECRET || "";
  const processIncomingOTA = options.processIncomingOTA || null;
  const backgroundWorker = options.backgroundWorker || null;

  // Middlewares dedicados para suportar JSON e application/x-www-form-urlencoded
  router.use(express.json({ limit: "10mb" }));
  router.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middleware do Interruptor Geral
  router.use((req, res, next) => {
    const mode = getIntegrationMode(db);
    if (mode === WBP_MODES.OFF) {
      return res.status(200).json({
        ErrorCode: 1031,
        Error: "Integration disabled"
      });
    }
    next();
  });

  // 1. POST /BookingCreate (JSON ou URL-encoded)
  router.post("/BookingCreate", async (req, res) => {
    try {
      const { shared_secret, reservation, booking, pms_property_id } = req.body || {};
      const bookingData = reservation || booking;

      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1001,
          Error: "Invalid credentials"
        });
      }

      if (!bookingData) {
        return res.status(200).json({
          ErrorCode: 4,
          Error: "Missing reservation data"
        });
      }

      // Higiene de cartões em memória antes de qualquer gravação
      const sanitizedPayload = sanitizeCardDataInMemory(req.body);

      // Gravação durável imediata pré-processamento (R1)
      const payloadId = await storage.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload: sanitizedPayload
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.OBSERVE) {
        return res.status(200).json({});
      }

      // Modo Automático: Lock de concorrência e idempotência
      const keys = storage.deriveKeys(sanitizedPayload);
      const claim = await storage.claimForProcessing(keys.idempotencyKey, payloadId, keys.orderId);

      if (!claim.shouldProcess) {
        return res.status(200).json({});
      }

      let processResult = null;
      if (typeof processIncomingOTA === "function") {
        processResult = await processIncomingOTA(sanitizedPayload.reservation || sanitizedPayload.booking, {
          db,
          source: "webhook",
          payloadId
        });
      }

      await claim.release(processResult || { status: "acknowledged", payloadId });
      return res.status(200).json({});
    } catch (err) {
      console.error("[WBP Callback] Erro em BookingCreate:", err);
      return res.status(200).json({
        ErrorCode: 1003,
        Error: "Internal processing error"
      });
    }
  });

  // 2. POST /NotifyBooking (application/x-www-form-urlencoded)
  router.post("/NotifyBooking", async (req, res) => {
    try {
      const { shared_secret, booking_id, wbp_property_id } = req.body || {};

      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1001,
          Error: "Invalid credentials"
        });
      }

      if (!booking_id) {
        return res.status(200).json({
          ErrorCode: 4,
          Error: "Missing booking_id"
        });
      }

      await storage.recordRawPayload({
        source: "webhook",
        endpoint: "NotifyBooking",
        payload: req.body,
        idempotencyKey: `notify_${booking_id}`,
        orderId: String(booking_id)
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.AUTO && backgroundWorker) {
        // Dispara busca assíncrona imediata da reserva notificada
        setImmediate(() => {
          backgroundWorker.pollSingleBooking(String(booking_id)).catch((err) => {
            console.warn(`[WBP Callback] Erro ao buscar reserva notificada ${booking_id}:`, err.message);
          });
        });
      }

      return res.status(200).json({});
    } catch (err) {
      console.error("[WBP Callback] Erro em NotifyBooking:", err);
      return res.status(200).json({
        ErrorCode: 1003,
        Error: "Internal processing error"
      });
    }
  });

  // 3. POST /ARIFullRefresh
  router.post("/ARIFullRefresh", async (req, res) => {
    try {
      const { shared_secret, pms_property_id } = req.body || {};

      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 1031,
          Error: "Channel not enabled for property"
        });
      }

      await storage.recordRawPayload({
        source: "webhook",
        endpoint: "ARIFullRefresh",
        payload: req.body
      });

      const mode = getIntegrationMode(db);
      if (mode === WBP_MODES.AUTO) {
        try {
          const synchronizer = getAriSynchronizer(db);
          synchronizer.enqueueFullPush({ reason: "ARIFullRefresh callback" });
        } catch (_) {}
      }

      const updateId = Date.now();
      return res.status(200).json({ UpdateId: updateId });
    } catch (err) {
      return res.status(200).json({
        ErrorCode: 1031,
        Error: "Internal error"
      });
    }
  });

  // 4. POST /RoomInfo
  router.post("/RoomInfo", async (req, res) => {
    try {
      const { shared_secret, pms_property_id } = req.body || {};

      if (!verifyWbpCallbackAuth(shared_secret, configuredSecret)) {
        return res.status(200).json({
          ErrorCode: 9203,
          Error: "Invalid property credentials"
        });
      }

      return res.status(200).json({
        RoomInfo: [
          {
            pms_room_id: 1,
            units: 19,
            beds: 2,
            dormitory: false,
            pricingModel: "occ",
            label: "Flat CorpFlats Soho",
            description: "Studio flat completo no Soho Residence"
          }
        ]
      });
    } catch (err) {
      return res.status(200).json({
        ErrorCode: 9203,
        Error: "Internal error"
      });
    }
  });

  return router;
}

/**
 * Worker para Background Polling e Recuperação de Falhas.
 */
export class WbpBackgroundWorker {
  constructor(options = {}) {
    this.db = options.db || null;
    this.storage = options.storage || defaultStorage;
    this.client = options.client || (options.db ? new WBPClient({ db: options.db }) : null);
    this.processIncomingOTA = options.processIncomingOTA || null;
    this.intervalId = null;
    this.isPolling = false;
  }

  start(intervalMs = null) {
    if (this.intervalId) return;

    if (!isWbpEnabled(this.db)) {
      return;
    }

    const defaultMs = (this.db?.settings?.wbp_polling_interval_minutes || 30) * 60 * 1000;
    const finalInterval = intervalMs || defaultMs;

    this.intervalId = setInterval(async () => {
      if (!isWbpEnabled(this.db)) {
        this.stop();
        return;
      }
      await this.poll();
    }, finalInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Recupera e processa payloads brutos interrompidos antes da conclusão.
   */
  async recoverUnprocessed() {
    const unprocessed = await this.storage.getUnprocessedPayloads();
    for (const item of unprocessed) {
      const claim = await this.storage.claimForProcessing(item.idempotencyKey, item.id, item.orderId);
      if (!claim.shouldProcess) continue;

      let result = null;
      if (isWbpAutoMode(this.db) && typeof this.processIncomingOTA === "function") {
        const bookingData = item.payload?.reservation || item.payload?.booking || item.payload;
        result = await this.processIncomingOTA(bookingData, {
          db: this.db,
          source: item.source || "recovery",
          payloadId: item.id
        });
      }

      await claim.release(result || { recovered: true });

      // Se originado de polling, confirma na WBP após persistência
      if (item.orderId && this.client && isWbpAutoMode(this.db)) {
        try {
          await this.client.ackBooking({ booking_id: item.orderId });
        } catch (_) {}
      }
    }
  }

  /**
   * Busca e processa uma reserva pontual (acionada por NotifyBooking).
   */
  async pollSingleBooking(bookingId) {
    if (!this.client || !isWbpEnabled(this.db)) return;

    const orderKey = `order_${bookingId}`;
    if (await this.storage.isAlreadyProcessed(orderKey)) return;

    const res = await this.client.getBookingId({ booking_id: bookingId });
    if (!res?.success || !res.reservation) return;

    const sanitizedReservation = sanitizeCardDataInMemory(res.reservation);

    const payloadId = await this.storage.recordRawPayload({
      source: "polling",
      endpoint: "GetBookingId",
      payload: sanitizedReservation,
      idempotencyKey: orderKey,
      orderId: String(bookingId)
    });

    if (isWbpAutoMode(this.db)) {
      const claim = await this.storage.claimForProcessing(orderKey, payloadId, String(bookingId));
      if (claim.shouldProcess) {
        let result = null;
        if (typeof this.processIncomingOTA === "function") {
          result = await this.processIncomingOTA(sanitizedReservation, {
            db: this.db,
            source: "polling",
            payloadId
          });
        }
        // AckBooking estritamente após gravação durável
        await this.client.ackBooking({ booking_id: bookingId });
        await claim.release(result || { processedFromNotify: true });
      }
    }
  }

  /**
   * Ciclo de polling periódico padrão.
   */
  async poll() {
    if (this.isPolling || !isWbpEnabled(this.db) || !this.client) return;
    this.isPolling = true;

    try {
      // 1. Recuperar pendências não processadas de quedas anteriores
      await this.recoverUnprocessed();

      // 2. Consultar lista com margem de 5 minutos
      const lastVersion = this.db?.settings?.wbp_last_booking_version || null;
      const res = await this.client.getBookingList({ wbp_booking_version: lastVersion });

      if (res?.success && Array.isArray(res.Bookings)) {
        for (const item of res.Bookings) {
          const bookingId = String(item.booking_id);
          const orderKey = `order_${bookingId}`;

          if (await this.storage.isAlreadyProcessed(orderKey)) continue;

          await this.pollSingleBooking(bookingId);
        }

        // Atualizar versão apenas após sucesso da rodada
        const nowUtc = new Date().toISOString().replace("T", " ").substring(0, 19);
        if (this.db?.settings) {
          this.db.settings.wbp_last_booking_version = nowUtc;
        }
      }
    } catch (err) {
      console.warn("[WBP Background Worker] Erro durante ciclo de polling:", err.message);
    } finally {
      this.isPolling = false;
    }
  }
}
```

---

## 7. Recomendações de Testes Pontuais para o Portão 4

Para verificar independentemente a implementação das Features 17 e 18 sem violar `AGENTS.md`:

1. **Teste Pontual Dedicado**:
   - Criar `tests/wbp-integration/m4-webhooks-polling.test.mjs`.
   - NUNCA executar `tests/*.test.mjs` em lote. Rodar estritamente `node --test tests/wbp-integration/m4-webhooks-polling.test.mjs`.
2. **Cenários Essenciais**:
   - **Caso 1: Switch Geral 'off'**:
     - Webhook `BookingCreate` recebe payload com shared_secret válido.
     - Responde HTTP 200 `{ ErrorCode: 1031, Error: "Integration disabled" }`.
     - Confirma que `getRawPayloadCount()` permanece zero.
     - `worker.start()` não instancia nenhum timer (`worker.intervalId === null`).
   - **Caso 2: Ingestão de `NotifyBooking` (form-urlencoded)**:
     - Dispara POST com `Content-Type: application/x-www-form-urlencoded` contendo `shared_secret`, `wbp_property_id` e `booking_id`.
     - Responde HTTP 200 `{}`.
     - Confirma gravação imediata de payload bruto com prefixo `notify_`.
   - **Caso 3: Higiene de Cartões**:
     - Envia payload contendo `reservation.Cards = [{ card_number: "4111222233334444", card_cvv: "123", card_name: "Test" }]`.
     - Inspeciona o arquivo `wbp_raw_payloads.jsonl`.
     - Asserta com expressão regular que `"123"` ou qualquer campo `card_cvv` **NÃO existe** no arquivo gravado.
   - **Caso 4: Polling com Version - 5 min**:
     - Define `wbp_last_booking_version = "2026-10-14 15:30:00"`.
     - Executa `worker.poll()`.
     - Intercepta requisição no simulador e confirma que `wbp_booking_version` recebido é `"2026-10-14 15:25:00"`.
   - **Caso 5: Ordem Estrita de AckBooking**:
     - Simula falha proposital no storage antes de gravar o payload.
     - Confirma que `simulator.acknowledgedBookings` tem tamanho zero (AckBooking não disparado).
     - Permite gravação durável e confirma que `AckBooking` é recebido com sucesso.
