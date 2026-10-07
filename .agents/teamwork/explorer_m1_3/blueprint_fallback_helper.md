# Blueprint Técnico: Centralized Helper `getCheckinUrl` & Resilient Fallback Engine

**Milestone:** M1 (Feature 3)  
**Autor:** Explorer M1_3 (Resilient Helper Specialist)  
**Destino:** `artifacts/api-server/demo-server.mjs` e mirror `scripts/demo-server.mjs`  
**Data:** 2026-10-07  
**Status:** Arquitetura e Especificação Concluídas  

---

## 1. Visão Geral Executiva e Escopo Arquitetural

A função utilitária `getCheckinUrl` é o componente central de resolução de links de check-in de todo o ecossistema CorpFlats (Guest-Flow-Manager). Ela unifica o acesso ao pré-check-in digital para:
- Mensagens automáticas e manuais do WhatsApp (via Z-API);
- E-mails transacionais (confirmação, lembretes de pré-check-in, instruções de acesso);
- IA Sofia / Concierge Virtual;
- Painel Administrativo do PMS (Calendário, Modais, Cards de Governança, Botões "Copiar Link");
- Rotas REST de reenvio de links de pré-check-in.

### Invariantes Arquiteturais Críticos
1. **Zero Exceções Vazadas:** A função NUNCA deve estourar erro ou interromper o fluxo de negócio do chamador (ex: quebrar envio de WhatsApp, cadastro de reserva ou resposta de API). Se houver qualquer falha ou lentidão na API SERPRO FNRH, a função absorve a falha e aciona contingência imediata.
2. **Guarda de Timeout Estrito (5000ms):** Nenhuma chamada ao SERPRO pode prender a requisição por mais de 5 segundos. Ao atingir 5000ms, o fallback para o check-in próprio é ativado instantaneamente.
3. **Audit Trail e Notificação Automática:** Toda ativação do fallback emite um evento no Fail-Safe Audit Log (`FNRH_SERPRO_FALLBACK`) e gera uma notificação interna no painel da recepção (`system_error` / `alerta`).
4. **Bifurcação Segura Sync / Async:** Funções puramente síncronas de template rendering (como `resolveWhatsAppTags` ou mappers de listas) NÃO podem receber Promises (`[object Promise]`). Um par síncrono `getCheckinUrlSync` opera em conjunto com a versão assíncrona `getCheckinUrl`.
5. **Paridade Byte-a-Byte Estrita:** O código deve residir em `artifacts/api-server/demo-server.mjs` e ser replicado de forma idêntica em `scripts/demo-server.mjs`.

---

## 2. Assinaturas Exatas e Especificação dos Métodos

### 2.1 Método Assíncrono Principal (`getCheckinUrl`)
Assinatura:
```javascript
export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbInstance = null)
```

#### Parâmetros
| Parâmetro | Tipo | Default | Descrição |
|---|---|---|---|
| `reservation` | `Object` | Obrigatório | Objeto da reserva contendo `id`, `code`, `guests`, `serproPrecheckinUrl`, etc. Suporta objetos parciais ou nulos de forma defensiva. |
| `guestIndex` | `number \| string` | `1` | Índice do hóspede na reserva (1 para o titular, 2 para o segundo hóspede em reservas duplas). |
| `baseUrl` | `string` | `""` | Origem da aplicação (ex: `https://corpflats.onrender.com` ou `http://localhost:3000`). Se vazio, resolve via `process.env.SERVER_BASE_URL` ou default de produção. |
| `dbInstance` | `Object` | `null` | Instância opcional do banco em memória para injeção de dependência em testes. Se omitido, utiliza a variável `db` do escopo do módulo. |

#### Retorno
- `Promise<string>`: URL absoluta resolvida para o check-in.
  - No modo `'proprio'`: `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`
  - No modo `'gov_fnrh'` com sucesso: URL oficial do Ministério do Turismo (`https://fnrh.turismo.gov.br/precheckin/...`)
  - No modo `'gov_fnrh'` com falha/timeout: URL interna própria (fallback transparente).

---

### 2.2 Método Síncrono Companheiro (`getCheckinUrlSync`)
Assinatura:
```javascript
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null)
```

#### Propósito
Execução instantânea (0ms, sem I/O de rede) para uso obrigatório em:
- `resolveWhatsAppTags(text, reservation, db, baseUrl, ...)` em `zapi-service.mjs`;
- `renderTemplateButtons(buttons, reservation, db, baseUrl, ...)` em `zapi-service.mjs`;
- Mapeamento em massa de reservas em `GET /api/pms/calendar`;
- Templates síncronos de e-mail e respostas de IA.

#### Retorno
- `string`: 
  - Se `db.settings.checkinProvider === 'gov_fnrh'` E a reserva já possui `serproPrecheckinUrl` ou `link_precheckin`: retorna a URL do Gov.br.
  - Caso contrário (modo próprio OU link do Gov.br ainda não gerado): retorna imediatamente a URL interna `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`.
  - **Garantia:** NUNCA retorna `Promise`, prevenindo corrupção de mensagens de texto.

---

## 3. Fluxo Lógico e Matriz de Decisão do Fallback

```
                     ┌───────────────────────────────────┐
                     │ Chamada a getCheckinUrl(...)      │
                     └─────────────────┬─────────────────┘
                                       │
                        Normalização defensiva de inputs
                        e cálculo da internalCheckinUrl
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ db.settings.checkinProvider       │
                     │         === 'gov_fnrh' ?          │
                     └─────────┬───────────────┬─────────┘
                           NÃO │               │ SIM
                               │               ▼
                               │   ┌───────────────────────────────────┐
                               │   │ reservation.serproPrecheckinUrl   │
                               │   │ ou reservation.link_precheckin?   │
                               │   └───────┬───────────────────┬───────┘
                               │       SIM │                   │ NÃO
                               │           ▼                   ▼
                               │     Retorna link       Dispara registro on-the-fly
                               │     oficial salvo      na API SERPRO (timeout 5s)
                               │                               │
                               │               ┌───────────────┴───────────────┐
                               │       Sucesso │                               │ Erro ou Timeout > 5s
                               │               ▼                               ▼
                               │   Persiste serproReservaId            Log FNRH_SERPRO_FALLBACK
                               │   e serproPrecheckinUrl               Alerta recepção createNotification
                               │   Retorna link Gov.br                 Retorna internalCheckinUrl
                               ▼                                               ▼
                     ┌───────────────────────────────────────────────────────────┐
                     │ Retorna URL resolvida (sem lançar erro em nenhum caso)     │
                     └───────────────────────────────────────────────────────────┘
```

---

## 4. Implementação Completa em Código

### 4.1 Código de `getCheckinUrl` e `getCheckinUrlSync`
Inserir em `artifacts/api-server/demo-server.mjs` (e no mirror `scripts/demo-server.mjs`) logo após o bloco do Notification Engine (~linha 4950):

```javascript
// ── Centralized Check-in URL Resolver & Resilient Fallback Engine ─────────────
import { fnrhSerproService, registerSerproReservation } from "./fnrh-serpro-service.mjs";

/**
 * Resolve de forma centralizada e resiliente a URL de check-in para uma reserva.
 * No modo 'gov_fnrh', busca o link oficial do Ministério do Turismo no SERPRO.
 * Em caso de falha ou timeout (> 5000ms), ativa fallback automático para o check-in próprio.
 * 
 * @param {Object} reservation - Objeto da reserva
 * @param {number|string} [guestIndex=1] - Índice do hóspede (1 ou 2)
 * @param {string} [baseUrl=""] - Host base da aplicação
 * @param {Object} [dbInstance=null] - Instância opcional do db para injeção
 * @returns {Promise<string>} URL de check-in resolvida
 */
export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  const activeDb = dbInstance || (typeof db !== "undefined" ? db : null);
  const hostBase = (baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  const currentProvider = activeDb?.settings?.checkinProvider || "proprio";

  // 1. Provedor Próprio: resolução imediata sem I/O
  if (currentProvider !== "gov_fnrh") {
    return internalCheckinUrl;
  }

  // 2. Modo Gov.br ativo e link já previamente armazenado na reserva
  if (reservation?.serproPrecheckinUrl || reservation?.link_precheckin) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  // 3. Modo Gov.br ativo mas link não gerado: tenta registrar na API SERPRO com timeout de 5 segundos
  try {
    if (!reservation || (!reservation.code && !reservation.id)) {
      throw new Error("Reserva inválida ou sem identificador.");
    }

    // Promessa de registro SERPRO
    const registrationTask = (async () => {
      if (typeof fnrhSerproService?.registerReservation === "function") {
        return await fnrhSerproService.registerReservation(reservation, {
          timeoutMs: 5000,
          db: activeDb
        });
      } else if (typeof registerSerproReservation === "function") {
        return await registerSerproReservation(reservation, {
          timeoutMs: 5000,
          db: activeDb
        });
      }
      throw new Error("Cliente SERPRO FNRH não inicializado.");
    })();

    // Guarda de timeout estrito de 5000ms via Promise.race
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Timeout de 5000ms excedido na comunicação com a API SERPRO FNRH"));
      }, 5000);
      if (timeoutHandle?.unref) timeoutHandle.unref();
    });

    const serproResult = await Promise.race([registrationTask, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const linkPrecheckin = serproResult?.link_precheckin || serproResult?.serproPrecheckinUrl;
    const reservaId = serproResult?.reserva_id || serproResult?.serproReservaId;

    if (!linkPrecheckin) {
      throw new Error(serproResult?.error || "link_precheckin não retornado pela API SERPRO");
    }

    // Atualiza a reserva em memória
    reservation.serproReservaId = reservaId;
    reservation.serproPrecheckinUrl = linkPrecheckin;
    reservation.link_precheckin = linkPrecheckin; // alias retrocompatível
    reservation.serproStatus = serproResult.situacao_reserva_id || "CRIADA";
    reservation.serproCreatedAt = new Date().toISOString();
    reservation.serproError = null;

    // Persiste no banco de dados se disponível
    if (typeof saveDatabase === "function") {
      try {
        saveDatabase("serpro_reservation_created");
      } catch (saveErr) {
        console.warn("[getCheckinUrl] Aviso ao salvar database:", saveErr.message);
      }
    }

    return linkPrecheckin;
  } catch (err) {
    // ── Ativação do Fallback Inteligente e Transparente (< 5s ou erro) ────────
    console.warn(`[FNRH_SERPRO_FALLBACK] Reserva ${reservation?.code || reservation?.id}: ${err.message}. Retornando check-in próprio.`);

    if (reservation) {
      reservation.serproError = err.message;
      reservation.serproLastFallbackAt = new Date().toISOString();
    }

    // 1. Registro no Audit Log
    if (typeof logAuditEvent === "function") {
      try {
        logAuditEvent("FNRH_SERPRO_FALLBACK", {
          reservationCode: reservation?.code || String(reservation?.id || ""),
          guestIndex: safeGuestIndex,
          error: err.message
        });
      } catch (auditErr) {
        console.error("[FNRH Fallback] Erro ao registrar log de auditoria:", auditErr.message);
      }
    }

    // 2. Alerta na central de notificações da recepção
    if (typeof createNotification === "function") {
      try {
        createNotification("alerta", `Falha SERPRO FNRH: Check-in fallback ativado para reserva ${reservation?.code || reservation?.id || ""}`, {
          reservationId: reservation?.id,
          reservationCode: reservation?.code,
          error: err.message
        });
      } catch (notifErr) {
        console.error("[FNRH Fallback] Erro ao criar notificação:", notifErr.message);
      }
    }

    // 3. Retorna URL interna SEM lançar exceção
    return internalCheckinUrl;
  }
}

/**
 * Versão síncrona do resolvedor para locais onde async/await não é viável
 * (ex.: tags dinâmicas de templates, renderização de botões e mapas de listas).
 * 
 * @param {Object} reservation - Objeto da reserva
 * @param {number|string} [guestIndex=1] - Índice do hóspede (1 ou 2)
 * @param {string} [baseUrl=""] - Host base da aplicação
 * @param {Object} [dbInstance=null] - Instância opcional do db para injeção
 * @returns {string} URL de check-in resolvida síncronamente
 */
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  const activeDb = dbInstance || (typeof db !== "undefined" ? db : null);
  const hostBase = (baseUrl || process.env.SERVER_BASE_URL || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  const currentProvider = activeDb?.settings?.checkinProvider || "proprio";

  if (currentProvider === "gov_fnrh" && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}
```

---

### 4.2 Adaptação Polimórfica das Funções de Telemetria

Para garantir 100% de conformidade com a chamada exigida no dispatch:
- `logAuditEvent("FNRH_SERPRO_FALLBACK", { reservationCode: reservation.code, guestIndex, error: err.message })`
- `createNotification("alerta", "Falha SERPRO FNRH: Check-in fallback ativado para reserva " + reservation.code, { reservationId: reservation.id })`

As funções existentes em `demo-server.mjs` devem ser adaptadas para suportar tanto a chamada posicional quanto a chamada por objeto único:

#### Adaptador em `logAuditEvent` (Linha 4825):
```javascript
async function logAuditEvent(arg1, arg2) {
  try {
    if (!db.auditLogs) db.auditLogs = [];

    let payload = {};
    if (typeof arg1 === "string") {
      // Suporte à chamada posicional: logAuditEvent("FNRH_SERPRO_FALLBACK", details)
      payload = {
        action: arg1,
        details: arg2 || {},
        category: "integration",
        level: "warning"
      };
    } else if (arg1 && typeof arg1 === "object") {
      payload = arg1;
    }

    const {
      level = "info",
      category = "system",
      action = "EVENT",
      actor = null,
      details = {},
      source = "server",
      ip = "",
      userAgent = ""
    } = payload;

    const now = new Date().toISOString();
    const id = db.auditLogs.length > 0 ? (db.auditLogs[0].id || db.auditLogs.length) + 1 : 1;

    const logEntry = {
      id,
      timestamp: now,
      level,
      category,
      action,
      actor: actor || { name: "Sistema", role: "system" },
      details: details || {},
      source: source || "server",
      ip: ip || (actor && actor.ip) || "",
      userAgent: userAgent || (actor && actor.userAgent) || ""
    };

    // 1. Memória (Últimos 2.500 registros)
    db.auditLogs.unshift(logEntry);
    if (db.auditLogs.length > 2500) {
      db.auditLogs = db.auditLogs.slice(0, 2500);
    }

    // 2. Append-Only em arquivo local à prova de falhas
    try {
      fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(logEntry) + "\n", "utf-8");
    } catch {}

    // 3. Persistência em PostgreSQL dedicado
    if (pgPool) {
      pgPool.query(
        `INSERT INTO system_audit_logs (timestamp, level, category, action, actor, details, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [now, level, category, logEntry.action, JSON.stringify(logEntry.actor), JSON.stringify(logEntry.details), source]
      ).catch(() => {});
    }

    console.log(`[AUDIT:${level.toUpperCase()}] [${category.toUpperCase()}] ${logEntry.action}`);
    return logEntry;
  } catch (err) {
    console.error("[Audit Error]", err);
    return null;
  }
}
```

#### Adaptador em `createNotification` (Linha 4883):
```javascript
function createNotification(arg1, arg2, arg3) {
  try {
    if (!db.notifications) db.notifications = [];
    const settings = db.notificationSettings || {};

    let payload = {};
    if (typeof arg1 === "string") {
      // Suporte à chamada posicional: createNotification("alerta", "Mensagem...", { metadata })
      const cat = arg1 === "alerta" ? "system_error" : arg1;
      payload = {
        category: cat,
        title: "⚠️ Contingência FNRH SERPRO",
        message: String(arg2 || ""),
        severity: "warning",
        metadata: typeof arg3 === "object" ? (arg3 || {}) : {},
        targetUrl: arg3?.reservationCode ? `/reservas?code=${arg3.reservationCode}` : "/reservas"
      };
    } else if (arg1 && typeof arg1 === "object") {
      payload = arg1;
    }

    const { category, title, message, severity = "info", metadata = {}, targetUrl = "" } = payload;

    const categoryMap = {
      breakfast: settings.notifyOnBreakfast !== false,
      lost_item: settings.notifyOnLostItem !== false,
      defect: settings.notifyOnDefect !== false,
      checkout: settings.notifyOnCheckout !== false,
      system_error: settings.notifyOnSystemError !== false,
      abandoned_cart: settings.notifyOnAbandonedCart !== false,
      cleaning_alert: settings.notifyOnOvertimeCleaning !== false,
    };

    // Registra no Audit Log Fail-Safe simultaneamente
    logAuditEvent({
      level: severity === "danger" || severity === "error" ? "error" : (severity === "warning" ? "warning" : (severity === "success" ? "success" : "info")),
      category: category === "checkout" || category === "abandoned_cart" ? "reservation" : (category === "system_error" ? "system" : "cleaning"),
      action: `NOTIFICATION_${String(category).toUpperCase()}`,
      details: { title, message, metadata, targetUrl }
    });

    if (categoryMap[category] === false) {
      return null;
    }

    const id = db.notifications.length > 0 ? Math.max(...db.notifications.map(n => n.id)) + 1 : 1;
    const notification = {
      id,
      category,
      title,
      message,
      severity,
      metadata: metadata || {},
      targetUrl: targetUrl || "",
      read: false,
      createdAt: new Date().toISOString()
    };

    db.notifications.unshift(notification);
    if (db.notifications.length > 250) {
      db.notifications = db.notifications.slice(0, 250);
    }
    saveDatabase("notification_created");

    return notification;
  } catch (err) {
    console.error("[Notification] Erro ao criar notificação:", err);
    return null;
  }
}
```

---

## 5. Estratégia de Tratamento Síncrono vs Assíncrono

### O Problema do `[object Promise]`
No Node.js, invocar uma função `async` em um contexto síncrono retorna imediatamente um objeto `Promise`. Se esse objeto for concatenado em strings de templates (como `${linkCheckin}`), o texto final enviado no WhatsApp ou e-mail vira:
> *"Acesse seu check-in pelo link: [object Promise]"*

### A Solução: Arquitetura em Duas Camadas (Two-Tier Resolver)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CAMADA ASSÍNCRONA (TIER 1)                      │
│                  getCheckinUrl(reservation, guestIndex)                │
├────────────────────────────────────────────────────────────────────────┤
│ • Executada em rotas REST assíncronas e filas antes de renderizar:     │
│   1. POST /api/pms/reservations/:id/resend-checkin-link                │
│   2. POST /api/pms/reservations (criação PMS)                          │
│   3. POST /api/reservations/direct-booking (site oficial)              │
│   4. Antes do envio de mensagens agendadas na fila do Z-API            │
│ • Realiza I/O de rede (API SERPRO) com 5s timeout.                    │
│ • Ao receber a resposta, salva `serproPrecheckinUrl` na reserva.       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Hidrata reserva no banco
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        CAMADA SÍNCRONA (TIER 2)                        │
│                getCheckinUrlSync(reservation, guestIndex)              │
├────────────────────────────────────────────────────────────────────────┤
│ • Executada durante a interpolação síncrona de templates:              │
│   1. resolveWhatsAppTags(...) -> tagsMap["{{link_checkin_digital}}"]   │
│   2. renderTemplateButtons(...) -> botão "btn_chk_digital"             │
│   3. GET /api/pms/calendar -> enriquecimento do array reservations     │
│   4. Renderizadores de e-mail (renderCheckinConfirmedEmail)            │
│ • Zero I/O de rede. 0ms de latência.                                   │
│ • Se `serproPrecheckinUrl` já existir: usa link Gov.br.                │
│ • Se não existir ainda: usa link interno próprio sem estourar nada.    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Mapeamento de Pontos de Impacto no Sistema

### 6.1 `POST /api/pms/reservations/:id/resend-checkin-link`
Localização: `artifacts/api-server/demo-server.mjs` (linha ~13780) e `scripts/demo-server.mjs`:
```javascript
// ANTES:
const baseUrl = `${req.protocol}://${req.get("host")}`;
const preCheckinUrl = `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`;

// DEPOIS:
const baseUrl = `${req.protocol}://${req.get("host")}`;
const preCheckinUrl = await getCheckinUrl(reservation, guestIndex, baseUrl, db);
```

### 6.2 `GET /api/pms/calendar`
Localização: `artifacts/api-server/demo-server.mjs` (linhas 11306–11320) e `scripts/demo-server.mjs`:
```javascript
// No mapeamento das reservas:
return {
  ...r,
  checkinUrl: getCheckinUrlSync(r, 1, reqBaseUrl, db),
  paidAmount: sanitizedPaid,
  // ...
};
```

### 6.3 Criação de Reserva no PMS (`POST /api/pms/reservations`)
Localização: `artifacts/api-server/demo-server.mjs` (linha ~11880) e `scripts/demo-server.mjs`:
```javascript
// Se o modo Gov.br estiver ativo, tenta pré-registrar imediatamente na criação:
if (db.settings?.checkinProvider === "gov_fnrh") {
  try {
    const originUrl = `${req.protocol}://${req.get("host")}`;
    await getCheckinUrl(newReservation, 1, originUrl, db);
  } catch (serproErr) {
    console.warn("[PMS Reservation] Registro on-the-fly SERPRO em background:", serproErr.message);
  }
}
```

### 6.4 Motor de WhatsApp (`zapi-service.mjs`)
Localização: `artifacts/api-server/zapi-service.mjs` e `scripts/zapi-service.mjs`:
- Linha 1395:
  ```javascript
  const linkCheckinDigital = getCheckinUrlSync(reservation, 1, appOrigin, db);
  ```
- Linha 1529 (lembrete do 2º hóspede):
  ```javascript
  const linkSegundoHospede = getCheckinUrlSync(reservation, 2, appOrigin, db);
  mensagemPendenciaHospedes = `... Por favor, repasse este link ao segundo acompanhante:\n👉 ${linkSegundoHospede} ...`;
  ```
- Linha 1756 (botões de ação):
  ```javascript
  const linkCheckinDigital = getCheckinUrlSync(reservation, 1, appOrigin, db);
  ```

---

## 7. Estratégia de Testes Automatizados

O arquivo `tests/fnrh-checkin-toggle.test.mjs` deve validar:
1. **Modo Próprio (`'proprio'`):** `getCheckinUrl` retorna `${baseUrl}/pre-checkin/${code}?guest=1`.
2. **Modo Gov.br com Cache:** Se `reservation.serproPrecheckinUrl` existe, retorna o link Gov.br sem chamar a rede.
3. **Modo Gov.br com Registro Sucesso:** Simulação de SERPRO OK cadastra a reserva, armazena `serproReservaId` e `serproPrecheckinUrl`, e retorna o link Gov.br.
4. **Modo Gov.br com Falha da API:** Simulação de erro HTTP 500 do SERPRO ativa fallback em < 100ms, emite `logAuditEvent` e `createNotification`, e retorna URL própria.
5. **Modo Gov.br com Timeout (> 5000ms):** Simulação de API pendurada dispara abort em 5000ms, emite fallback e alerta, e retorna URL própria sem travar o processo.
6. **Reserva Multi-Hóspede:** Validação de que `guestIndex = 2` preserva `?guest=2` no fallback.
7. **Segurança Síncrona:** Validação de que `getCheckinUrlSync` retorna `string` (não `Promise`) em todos os cenários.

---

## 8. Verificação de Paridade de Arquivos (Mirror Parity)

Após qualquer alteração, executar verificação de hash SHA-256:
```powershell
(Get-FileHash artifacts/api-server/demo-server.mjs).Hash -eq (Get-FileHash scripts/demo-server.mjs).Hash
```
O resultado DEVE ser estritamente `True`.
