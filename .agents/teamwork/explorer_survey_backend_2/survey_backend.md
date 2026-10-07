# Levantamento Arquitetural Backend — FNRH SERPRO Check-in Provider Toggle

**Data:** 2026-10-07  
**Autor:** Explorer Survey Backend (`explorer_survey_backend_2`)  
**Repositório:** Guest-Flow-Manager (CorpFlats)  
**Status:** Concluído (Read-Only Investigation)  

---

## 1. Visão Geral e Contexto do Sistema

O sistema **Guest-Flow-Manager** gerencia as operações hoteleiras da CorpFlats (Edifício Soho Residence Service, Campos dos Goytacazes/RJ).  
Atualmente, o processo de check-in digital opera de forma autônoma: o hóspede recebe um link no formato `${baseUrl}/pre-checkin/:code?guest=1`, preenche seus dados cadastrais, anexa foto do documento oficial, assina digitalmente (com validação OTP via WhatsApp/e-mail) e o sistema gera internamente um PDF da FNRH (Ficha Nacional de Registro de Hóspedes) através do serviço `artifacts/api-server/fnrh-pdf-service.mjs`.

O novo requisito (ORIGINAL_REQUEST R1–R4 de 2026-10-07T15:33:29Z) exige a implementação de uma **chave seletora global e dinâmica** (`settings.checkinProvider`: `'proprio'` | `'gov_fnrh'`). Quando ativo o modo `gov_fnrh`:
1. O backend registra a reserva na **API SERPRO FNRH v2.4.2** (`POST /reservas`);
2. Captura e persiste o `serproReservaId` e o `link_precheckin` oficial emitido pelo Ministério do Turismo;
3. Todas as mensagens de WhatsApp, e-mails, portais e botões de "Copiar Link" utilizam a função centralizada `getCheckinUrl(reservation, guestIndex, baseUrl)`;
4. Conta com **fallback inteligente e transparente**: caso a API do SERPRO apresente lentidão (> 5s timeout) ou erro, o sistema retorna imediatamente o link do check-in próprio e emite um alerta de auditoria com notificação para a recepção.

---

## 2. Estrutura de Armazenamento de Configurações (`settings`)

### 2.1 Estado em `data/database.json`
- O banco de dados JSON já possui o objeto raiz `settings` (atualmente com 17 chaves).
- **Conteúdo atual de `db.settings`:**
  - `onedriveShareUrl`, `onedriveLinkConfigured`, `syncIntervalMinutes`, `lastSyncedAt`, `sheetName`
  - `alertHour`: 15
  - `adminWhatsApp`: `"5522997124021"`
  - `checkinTime`: `"14:00"`, `checkoutTime`: `"12:00"`
  - `autoEarlyCheckinForSite`: true
  - `buildingName`: `"Edifício Soho Residence Service"`
  - `receptionEmail`: `"millerpessanha@gmail.com"`, `garageEmail`: `"millerpessanha@gmail.com"`
  - `hotelAddress`, `googleMapsUrl`
  - `mercadoPagoConfig`
  - `breakfastReminderTemplate`
- **Nova chave necessária:**  
  `settings.checkinProvider`: `'proprio'` (default) ou `'gov_fnrh'`  
  Opcionalmente: `settings.serproConfig`: `{ user, password, cpfSolicitante, env }` para permitir parametrização via UI além das variáveis de ambiente.

### 2.2 Inicialização e Hidratação no Backend (`demo-server.mjs`)
- **Linhas 554–577:** Objeto `db.settings` padrão em memória.
  - Recomendação: Adicionar `checkinProvider: "proprio"` nos valores default de `db.settings`.
- **Linhas 3371–3530 (`loadDatabase`):**
  - O servidor lê `DB_FILE` (`data/database.json`) e mescla em `db` via `Object.assign(db, loaded)`.
  - Se `process.env.DATABASE_URL` estiver presente, conecta ao PostgreSQL em nuvem (Render/Supabase/Neon), busca `SELECT value FROM system_store WHERE key = 'db_state'` e restaura o estado.
  - Nas linhas 3488–3510 há blindagem especial para preservar e-mails e configurações críticas.
  - Recomendação: Adicionar preservação de `db.settings.checkinProvider`:
    ```javascript
    if (pgLoaded.settings?.checkinProvider) {
      db.settings.checkinProvider = pgLoaded.settings.checkinProvider;
    }
    ```
- **Persistência (`saveDatabase` - Linha 4779):**
  - Executa `fs.writeFileSync(DB_FILE, JSON.stringify(db))` e, se `pgPool` estiver ativo e hidratado, executa `INSERT INTO system_store (key, value, updated_at) VALUES ('db_state', $1::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`.
  - Persiste instantaneamente sem necessidade de restart.

### 2.3 Endpoints Existentes de Configuração
- **`GET /api/settings` (Linhas 10042–10052):**
  - Retorna `{ ...db.settings, petPolicy, houseRules, contractTerms, termsAndRules }`.
  - Já retornará `checkinProvider` automaticamente se presente em `db.settings`.
- **`PATCH /api/settings` (Linhas 10054–10088):**
  - Desestrutura chaves permitidas do `req.body`:
    ```javascript
    const { onedriveShareUrl, syncIntervalMinutes, sheetName, alertHour, termsAndRules, houseRules, contractTerms, adminWhatsApp, autoEarlyCheckinForSite, checkinTime, checkoutTime, hotelAddress, googleMapsUrl, receptionEmail, garageEmail, buildingName, petPolicy } = req.body;
    ```
  - **Ação Necessária:** Incluir `checkinProvider` e `serproConfig` na desestruturação:
    ```javascript
    const { ..., checkinProvider, serproConfig } = req.body;
    if (checkinProvider !== undefined) {
      if (checkinProvider !== "proprio" && checkinProvider !== "gov_fnrh") {
        return res.status(400).json({ error: "checkinProvider inválido. Deve ser 'proprio' ou 'gov_fnrh'." });
      }
      db.settings.checkinProvider = checkinProvider;
    }
    if (serproConfig !== undefined && typeof serproConfig === "object") {
      db.settings.serproConfig = { ...(db.settings.serproConfig || {}), ...serproConfig };
    }
    ```
  - Executa `saveDatabase("settings_update")` e responde imediatamente 200 com os dados atualizados.

---

## 3. Estrutura de Reservas (`db.reservations`) e Ciclo de Vida

### 3.1 Formato dos Objetos de Reserva
O array `db.reservations` contém 203 reservas atualmente. Cada reserva possui a seguinte estrutura central:
```typescript
interface Reservation {
  id: number;                          // Ex: 325
  code: string;                        // Ex: "RES-113-0325"
  flatId: number;                      // Ex: 1
  flatNumber: string | number;         // Ex: "113"
  guestId: number;                     // ID no db.guests
  guestName: string;                   // "Miller Pessanha"
  guestPhone: string;                  // "22998505276"
  guestEmail: string;                  // "millerpessanha@gmail.com"
  guestDocument?: string;              // "12585736792"
  guestCount: number;                  // 1 ou 2
  adults: number;                      // 1 ou 2
  children: number;                    // 0
  checkinDate: string;                 // "2026-10-10"
  checkoutDate: string;                // "2026-10-15"
  checkinTime: string;                 // "14:00"
  checkoutTime: string;                // "12:00"
  channel: string;                     // "direta" | "site" | "booking" | "airbnb"
  status: string;                      // "pre_reserva" | "confirmada" | "checkin" | "checkout" | "cancelada"
  paymentStatus: string;               // "pendente" | "sinal_pago" | "pago_total"
  totalAmount: number;                 // 1250.00
  paidAmount: number;                  // 1250.00
  guests: Array<{
    index: number;
    name: string;
    cpf: string;
    phone: string;
    email: string;
    hasCompletedCheckin: boolean;
    checkinCompletedAt: string | null;
  }>;

  // Novos campos a persistir para o SERPRO FNRH:
  serproReservaId?: string;            // UUID gerado pelo SERPRO (reserva.reserva_id)
  serproPrecheckinUrl?: string;        // URL do link_precheckin retornado pelo SERPRO
  serproCreatedAt?: string;            // Timestamp ISO de cadastro no SERPRO
  serproStatus?: string;               // Ex: "CRIADA"
  serproError?: string | null;         // Último erro de integração, se houver
}
```

### 3.2 Onde e Como as Reservas são Criadas, Atualizadas e Consultadas
1. **Criação Manual (PMS Calendário):**
   - **Endpoint:** `POST /api/pms/reservations` (Linhas 11385–11910).
   - Valida flat, datas e hóspede; cria `newReservation`; insere com `db.reservations.unshift(newReservation)`; executa `saveDatabase()`.
   - Se `checkinProvider === 'gov_fnrh'`, deve invocar a integração com o SERPRO nesta criação (ou de forma assíncrona blindada com persistência).
2. **Criação via Motor de Reserva Direta (Site Oficial):**
   - **Endpoint:** `POST /api/reservations/direct-booking` (Linhas 10343–10860).
   - Cria reserva confirmada ou pré-reserva com PIX dinâmico do Banco Inter.
3. **Importação em Lote via CSV:**
   - **Endpoint:** `POST /api/pms/reservations/import-csv` (Linhas 12328–12550).
4. **Atualização de Reserva:**
   - **Endpoint:** `PUT /api/pms/reservations/:id` (Linhas 12554–12600).
   - Detecta alterações de datas (`checkinDate`, `checkoutDate`) ou número de hóspedes. Se a reserva já estiver cadastrada no SERPRO, a especificação v2.4.2 suporta `PUT /reservas/{id}` para atualização de dados.
5. **Consulta de Reservas pelo Painel:**
   - **Endpoint Principal:** `GET /api/pms/calendar` (Linhas 11227–11365).
   - Mapeia as reservas (Linhas 11281–11320) e devolve para o front-end.
   - **Oportunidade Crucial:** Enriquecer cada reserva retornada neste endpoint com `checkinUrl: getCheckinUrl(r, 1, reqBaseUrl)`, facilitando a cópia e exibição dinâmica na interface web sem que o front precise adivinhar a URL.
6. **Reenvio Manual de Link de Check-in (Recepção / WhatsApp):**
   - **Endpoint:** `POST /api/pms/reservations/:id/resend-checkin-link` (Linhas 13754–13835).
   - Atualmente monta a URL hardcoded:  
     `const preCheckinUrl = `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`;`  
     **Deve ser substituído por:**  
     `const preCheckinUrl = await getCheckinUrl(reservation, guestIndex, baseUrl);`

---

## 4. Estado Atual das Integrações FNRH e SERPRO no Projeto

- **FNRH Interno Existente:**
  - `artifacts/api-server/fnrh-pdf-service.mjs` (e `scripts/fnrh-pdf-service.mjs`): gera o PDF impresso e assinado da FNRH localmente quando o hóspede preenche o formulário próprio.
  - `artifacts/api-server/fnrh-audit-schema.sql`: define tabelas locais de auditoria para conformidade com a LGPD.
  - `scratch/analyze_fnrh.mjs`: script de análise preliminar que lê o arquivo completo de especificação da API SERPRO v2.4.2.
- **Integração com SERPRO:**
  - **Nenhum arquivo ou cliente HTTP com a API SERPRO existia previamente.**
  - Deve ser criado `scripts/fnrh-serpro-service.mjs` (e seu mirror ou import correspondente em `artifacts/api-server/`).

---

## 5. Especificações Técnicas da API FNRH SERPRO v2.4.2

Investigado detalhadamente a partir da documentação técnica oficial (`api_doc_v2_4_2_full.json`):

### 5.1 URLs Base por Ambiente
- **Produção:** `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2`
- **Homologação:** `https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2`

### 5.2 Autenticação e Cabeçalhos Obrigatórios
- **Protocolo:** HTTPS (TLS 1.2+)
- **Formato:** JSON (UTF-8)
- **Método de Autenticação:** HTTP Basic Authentication (`RFC 7617`)
  ```http
  Authorization: Basic <base64(usuario:senha)>
  Content-Type: application/json
  Accept: application/json
  cpf_solicitante: <CPF_11_DIGITOS_SEM_PONTUACAO>
  ```
- **Nota de Segurança:** O cabeçalho `cpf_solicitante` é rastreado pelo Ministério do Turismo para auditoria de todas as operações de cadastro e consulta.

### 5.3 Chamada `POST /reservas` (Criação de Reserva e Obtenção do Link)
- **Path:** `/reservas` (ex: `${BASE_URL}/reservas`)
- **Método:** `POST`
- **Request Body (JSON):**
  ```json
  {
    "numero_reserva": "RES-113-0325",
    "numero_reserva_ota": "",
    "data_entrada": "2026-10-10",
    "data_saida": "2026-10-15",
    "quantidade_hospede_adulto": 2,
    "quantidade_hospede_menor": 0,
    "origem_reserva_id": "MEIOHOSPEDAGEM"
  }
  ```
  *Campos:*
  - `numero_reserva` (String, obrigatório, UNIQUE no meio de hospedagem)
  - `numero_reserva_ota` (String, opcional, código da reserva na OTA se `origem_reserva_id` for `"OTA"`)
  - `data_entrada` (Date: `YYYY-MM-DD`, obrigatório)
  - `data_saida` (Date: `YYYY-MM-DD`, obrigatório)
  - `quantidade_hospede_adulto` (Integer >= 1, obrigatório)
  - `quantidade_hospede_menor` (Integer >= 0, obrigatório)
  - `origem_reserva_id` (String: `"MEIOHOSPEDAGEM"` ou `"OTA"`, obrigatório)

- **Response Schema (HTTP 200 OK):**
  ```json
  {
    "reserva": {
      "reserva_id": "634eecb8-5973-47fd-a8a6-718e3c9d717f",
      "numero_reserva": "RES-113-0325",
      "numero_reserva_ota": "",
      "situacao_reserva_id": "CRIADA",
      "origem_reserva_id": "MEIOHOSPEDAGEM",
      "data_entrada": "2026-10-10",
      "data_saida": "2026-10-15",
      "quantidade_hospede_adulto": 2,
      "quantidade_hospede_menor": 0,
      "link_precheckin": "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-718e3c9d717f"
    }
  }
  ```
  *Campos de retorno a persistir:*
  - `reserva.reserva_id` ➔ mapeado para `reservation.serproReservaId`
  - `reserva.link_precheckin` ➔ mapeado para `reservation.serproPrecheckinUrl`
  - `reserva.situacao_reserva_id` ➔ mapeado para `reservation.serproStatus`

### 5.4 Variáveis de Ambiente e Configuração
As credenciais devem ser resolvidas com a seguinte prioridade (Environment Variables com fallback em `db.settings.serproConfig`):
1. `SERPRO_USER` / `db.settings?.serproConfig?.user`
2. `SERPRO_PASSWORD` / `db.settings?.serproConfig?.password`
3. `SERPRO_CPF_SOLICITANTE` / `db.settings?.serproConfig?.cpfSolicitante` (default: `"12585736792"`)
4. `SERPRO_ENV` / `db.settings?.serproConfig?.env`: `"homologacao"` (padrão seguro) ou `"producao"`

---

## 6. Arquitetura da Função Helper `getCheckinUrl` e Fallback Inteligente

### 6.1 Regras de Resolução de URL
A função deve receber `(reservation, guestIndex = 1, baseUrl = "")`:

```javascript
export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "") {
  const hostBase = baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${reservation?.code || reservation?.id}?guest=${guestIndex || 1}`;

  const currentProvider = db.settings?.checkinProvider || "proprio";

  // Se o modo for próprio, retorna imediatamente a URL interna
  if (currentProvider !== "gov_fnrh") {
    return internalCheckinUrl;
  }

  // Se o link do Serpro já foi gerado e está salvo na reserva, retorna-o
  if (reservation?.serproPrecheckinUrl) {
    return reservation.serproPrecheckinUrl;
  }

  // Modo Gov.br ativo mas link ainda não gerado: tenta registrar na API SERPRO com timeout de 5 segundos
  try {
    const serproResult = await registerSerproReservationWithTimeout(reservation, 5000);
    if (serproResult && serproResult.link_precheckin) {
      reservation.serproReservaId = serproResult.reserva_id;
      reservation.serproPrecheckinUrl = serproResult.link_precheckin;
      reservation.serproStatus = serproResult.situacao_reserva_id || "CRIADA";
      reservation.serproCreatedAt = new Date().toISOString();
      if (typeof saveDatabase === "function") saveDatabase("serpro_reservation_created");
      return reservation.serproPrecheckinUrl;
    }
    throw new Error(serproResult?.error || "link_precheckin não retornado pela API SERPRO");
  } catch (err) {
    // ── Fallback Inteligente e Transparente (< 5s ou erro) ─────────────────────
    console.warn(`[FNRH SERPRO Fallback] Falha ao obter link oficial para reserva ${reservation?.code}: ${err.message}. Retornando check-in próprio.`);
    
    // 1. Registro no Audit Log Fail-Safe
    if (typeof logAuditEvent === "function") {
      logAuditEvent({
        level: "warning",
        category: "integration",
        action: "FNRH_SERPRO_FALLBACK",
        details: {
          reservationId: reservation?.id,
          reservationCode: reservation?.code,
          reason: err.message,
          fallbackUrl: internalCheckinUrl
        }
      });
    }

    // 2. Alerta na central de notificações da recepção
    if (typeof createNotification === "function") {
      createNotification({
        category: "system_error",
        severity: "warning",
        title: "⚠️ FNRH Gov.br Indisponível — Contingência Ativa",
        message: `A API FNRH Gov.br não respondeu a tempo para a reserva ${reservation?.code || reservation?.id}. O link de Check-in Próprio CorpFlats foi ativado automaticamente.`,
        metadata: { reservationCode: reservation?.code, error: err.message },
        targetUrl: `/reservas?code=${reservation?.code || reservation?.id}`
      });
    }

    return internalCheckinUrl;
  }
}
```

E uma variante síncrona `getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "")` para locais de renderização puramente síncronos:
```javascript
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "") {
  const hostBase = baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com";
  const internalUrl = `${hostBase}/pre-checkin/${reservation?.code || reservation?.id}?guest=${guestIndex || 1}`;
  if (db.settings?.checkinProvider === "gov_fnrh" && reservation?.serproPrecheckinUrl) {
    return reservation.serproPrecheckinUrl;
  }
  return internalUrl;
}
```

---

## 7. Mapeamento de Pontos de Impacto no Sistema

### 7.1 Gatilhos de WhatsApp (`artifacts/api-server/zapi-service.mjs`)
- **Linha 1395 & Linha 1756:** Definição da constante `linkCheckinDigital`.
  - Atualmente: `const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;`
  - Deve ser atualizado para chamar `getCheckinUrl(reservation, 1, appOrigin)`.
- **Linhas 1529 & 1579:**
  - Tag `{{link_checkin_digital}}` no dicionário `tagsMap` (Linha 1579) passa a receber o link resolvido dinamicamente.
- **Linhas 1780–1830:**
  - Botão `btn_chk` / `btn_chk_digital`: o atributo `url` deve receber o link resolvido por `getCheckinUrl`.

### 7.2 Reenvio de Link de Check-in (`demo-server.mjs`)
- **Linha 13781:** `POST /api/pms/reservations/:id/resend-checkin-link`:
  - `const preCheckinUrl = await getCheckinUrl(reservation, guestIndex, baseUrl);`

### 7.3 Calendário PMS e Painel Administrativo (`demo-server.mjs`)
- **Linhas 11306–11320:** No mapeamento de reservas em `GET /api/pms/calendar`:
  - Incluir a propriedade `checkinUrl: getCheckinUrlSync(r, 1, reqBaseUrl)` no objeto retornado ao front-end.
  - Assim, o botão "Copiar Link de Check-in" e os cards no front-end copiam o link ativo sem precisar de lógica de bifurcação duplicada no front.

### 7.4 Novo Endpoint de Health Check da Conexão SERPRO
- Endpoint: `GET /api/fnrh/serpro/health` (ou `GET /api/serpro/health`)
- Exige autenticação admin/recepção.
- Executa chamada de diagnóstico (com 5s de timeout) para o endpoint de domínio do SERPRO (`GET /dominios/reservas/situacoes`).
- Respostas padronizadas:
  - **Healthy:** `{ ok: true, status: "healthy", latencyMs: 312, env: "homologacao", message: "Conexão com a API FNRH SERPRO operacional." }`
  - **Não configurado:** `{ ok: false, status: "not_configured", env: "homologacao", message: "Credenciais SERPRO não configuradas no ambiente." }`
  - **Erro de Autenticação (401):** `{ ok: false, status: "auth_error", error: "Credenciais inválidas no SERPRO." }`
  - **Indisponível / Timeout (>5s):** `{ ok: false, status: "unreachable", error: "Timeout ou falha de conexão com os servidores do SERPRO." }`

---

## 8. Requisitos de Integridade e Mirroring

1. **Paridade Byte-a-Byte Estrita:**
   - Todo código adicionado em `artifacts/api-server/demo-server.mjs` **deve ser replicado identicamente em `scripts/demo-server.mjs`**.
   - O serviço `scripts/fnrh-serpro-service.mjs` pode ser colocado em `scripts/` e importado no servidor, ou mantido espelhado em `artifacts/api-server/` conforme o padrão dos outros serviços (`mail-service.mjs`, `zapi-service.mjs`, etc.).
2. **Sem Breaking Changes:**
   - Por padrão, `settings.checkinProvider` é inicializado como `'proprio'`, garantindo compatibilidade 100% retroativa com os formulários existentes e sem interrupção para os hóspedes atuais.
3. **Testes Automatizados:**
   - Criar `tests/fnrh-checkin-toggle.test.mjs` usando `node:test` e `node:assert`, cobrindo:
     1. Alternância de provedor via `PATCH /api/settings` e leitura via `GET /api/settings`.
     2. Resolução de `getCheckinUrl` no modo `'proprio'` e `'gov_fnrh'`.
     3. Resiliência do fallback com timeout simulado e validação do audit log.
     4. Formatação das mensagens e tags de WhatsApp com a URL resolvida.

---
*Levantamento concluído. Relatório detalhado para orquestração da equipe de implementação.*
