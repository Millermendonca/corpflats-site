# Análise de Engenharia — Milestone 2: Comunicação Automatizada de Re-Assinatura (WhatsApp & E-mail)

**Responsável**: M2 Explorer 2  
**Data**: 2026-10-11  
**Escopo**: Milestone 2 — Re-Signature Lifecycle, Document Delivery & Ops Synchronization  
**Foco**: Automação de comunicação com o hóspede via WhatsApp e E-mail com link direto e personalizado de re-assinatura (`/pre-checkin/:code?resign=1`).

---

## 1. Resumo Executivo

Quando uma reserva confirmada tem suas datas de estadia (`checkinDate`, `checkoutDate`) ou apartamento (`flatId`, `flatNumber`) alterados — seja pelo **Portal do Hóspede** (após liquidação de pagamento ou alteração direta) ou pelo **PMS Administrativo** — a assinatura FNRH anterior é compulsoriamente invalidada (`r.needsReSignature = true`, `r.fnhrCompleted = false`).

Para atender aos requisitos **R3** de `ORIGINAL_REQUEST.md` e **Feature 6** do `PROJECT.md`, foi desenhado o mecanismo de comunicação automatizada com:
1. **Resolução de Link Personalizado**: A tag `{{link_checkin_digital}}` e as funções `getCheckinUrlSync`/`getCheckinUrl` passam a anexar o parâmetro `?resign=1` (ex.: `https://corpflats.onrender.com/pre-checkin/RES-605?resign=1`), ativando instantaneamente o banner de re-assinatura no portal e abrindo o canvas digital limpo com todos os dados cadastrais preservados.
2. **Disparo Multicanal Resiliente**: Disparo simultâneo ou balanceado de mensagem no WhatsApp via Z-API (`tpl_reservation_updated`) e espelho por E-mail oficial via Zoho SMTP (`sendMirrorEmail`), garantindo que a indisponibilidade ou modo teste de um canal não bloqueie a entrega do outro.
3. **Execução Não-Bloqueante & Trilha de Auditoria**: Processamento assíncrono via `setImmediate`, captura de exceções para fail-soft, e registro completo em `db.auditLogs` (`RE_SIGNATURE_NOTIFICATION_DISPATCHED`) e `r.auditLogs` (`re_signature_requested`).
4. **Fechamento do Ciclo na Submissão**: Ao re-assinar em `POST /api/pms/pre-checkin`, o sistema limpa `r.needsReSignature = false`, gera a nova FNRH com hash SHA-256 e entrega imediatamente à recepção.

---

## 2. Cadeia de Evidências no Código Existente

| Componente | Arquivo e Linhas | Observação Observada | Impacto / Requisito |
|---|---|---|---|
| **Resolução de URL de Check-in** | `scripts/demo-server.mjs:5920-5935`<br>`scripts/zapi-service.mjs:52-72` | `internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`` | Não incluía `?resign=1` quando `reservation.needsReSignature = true`. |
| **Template de Alteração** | `scripts/zapi-service.mjs:497-519` | `tpl_reservation_updated` possui o botão `btn_checkin` apontando para `{{link_checkin_digital}}` com o rótulo `"📝 Assinar Ficha Atualizada"`. | O template já é perfeito; basta garantir que a tag `{{link_checkin_digital}}` resolva para a URL de re-assinatura. |
| **Resolução de Tags** | `scripts/zapi-service.mjs:1894, 2091` | `linkCheckinDigital = getCheckinUrlSync(reservation, recipientGuestIndex, appOrigin, db);`<br>`tagsMap["{{link_checkin_digital}}"] = linkCheckinDigital;` | Resolve tanto no corpo da mensagem quanto nos botões de ação do WhatsApp e nos botões de ação do e-mail. |
| **Commit de Modificação Paga** | `scripts/demo-server.mjs:15738-15749`<br>`scripts/demo-server.mjs:15880-15902` | `commitPendingModification` define `r.needsReSignature = true`, mas **não disparava** notificação ao hóspede. | Ponto crítico de integração: deve acionar `dispatchReservationReSignatureNotifications`. |
| **Commit de Modificação Direta** | `scripts/demo-server.mjs:16903-16916`<br>`scripts/demo-server.mjs:16955-16975` | `POST /api/pms/guest-portal/:code/modify` definia `r.needsReSignature = true` e enviava e-mail à portaria, mas **não ao hóspede**. | Ponto crítico de integração: deve acionar `dispatchReservationReSignatureNotifications`. |
| **Edição no PMS Admin** | `scripts/demo-server.mjs:13788-13826`<br>`scripts/demo-server.mjs:14489-14496` | `PUT /api/pms/reservations/:id` invalidava a assinatura e chamava `triggerImmediateWhatsApp`, mas dependia exclusivamente de WhatsApp ativo. | Deve chamar `dispatchReservationReSignatureNotifications` para garantir auditoria e fallback por e-mail. |
| **Trava de Z-API Desativado** | `scripts/zapi-service.mjs:7617-7620` | `if (!db.zapiConfig?.enabled) return;` | Se Z-API estivesse desativado, o envio de e-mail espelho era abortado silenciosamente. |
| **Conclusão de Re-Assinatura** | `scripts/demo-server.mjs:21054-21060` | `POST /api/pms/pre-checkin` não limpava explicitamente `r.needsReSignature = false`. | Deve limpar `r.needsReSignature = false` e despachar a nova FNRH para `receptionEmail`. |

---

## 3. Desenho Arquitetural da Notificação Automatizada

### 3.1. Resolução do Link Direto de Re-Assinatura

O link do check-in digital deve se comportar dinamicamente:
- **Fluxo Normal (Check-in Inicial)**: `${appOrigin}/pre-checkin/${r.code}?guest=${guestIndex}`
- **Fluxo de Re-Assinatura (`r.needsReSignature = true`)**:
  - Hóspede 1 (Titular): `${appOrigin}/pre-checkin/${r.code}?resign=1`
  - Hóspede 2+ (Acompanhante): `${appOrigin}/pre-checkin/${r.code}?guest=${guestIndex}&resign=1`

Ao acessar com `?resign=1`, o frontend em `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` (linhas 605-640 e 2067-2080) já reconhece a necessidade de nova assinatura:
- Exibe o banner em destaque: `"Reserva Atualizada • Nova Assinatura Necessária"`.
- Limpa o campo de assinatura anterior (`sig = null`), mantendo 100% dos dados cadastrais e documentos preenchidos.
- Habilita o canvas digital para assinatura imediata em 1 clique.

### 3.2. Disparo Multicanal (WhatsApp + E-mail)

```
[Evento: Mudança de Datas / Flat]
                │
                ▼
┌────────────────────────────────────────────────────────┐
│ dispatchReservationReSignatureNotifications(r, diffs)  │
└────────────────────────────────────────────────────────┘
                │
                ├─► 1. Trilha de Auditoria (Síncrona)
                │      - logAuditEvent: RE_SIGNATURE_NOTIFICATION_DISPATCHED
                │      - addReservationAuditLog: re_signature_requested
                │
                └─► 2. setImmediate (Assíncrono Não-Bloqueante)
                       │
                       ├─► Canal WhatsApp (Z-API)
                       │   - triggerImmediateWhatsApp("reservation_updated")
                       │   - Resolve tags: {{resumo_alteracoes}}, {{link_checkin_digital}}
                       │   - Botão URL: [📝 Assinar Ficha Atualizada] -> /pre-checkin/:code?resign=1
                       │   - Fallback gracioso se offline ou sandbox
                       │
                       └─► Canal E-mail (Zoho SMTP)
                           - Se não espelhado via Z-API (ou Z-API offline):
                           - sendMirrorEmail diretamente com template tpl_reservation_updated
                           - Botão de ação estilizado em HTML corporativo CorpFlats
                           - Link direto com resign=1
```

### 3.3. Resiliência e Tolerância a Falhas (Gateways Offline / Test Mode)

1. **Z-API Offline ou Sem Conexão**:
   - `sendZapiMessage` possui tratamento interno que simula envio sem gerar rejeição não tratada.
   - O e-mail do hóspede é despachado independentemente do status do Z-API.
2. **Modo Sandbox / Test Mode Ativo**:
   - Se `r.guestPhone` não estiver na lista de testes, o WhatsApp registra no log e suprime o envio externo.
   - O e-mail corporativo é entregue normalmente.
3. **SMTP Offline ou Sem Credenciais**:
   - `sendEmailAsync` captura o erro e marca `db.reservationCommunications[].status = "failed"` com motivo amigável sem interromper a execução do servidor.

---

## 4. Blueprint Drop-in de Código

### Blueprint 1: `scripts/zapi-service.mjs` (e `artifacts/api-server/zapi-service.mjs`)

#### Alteração A: Suporte a `resign=1` em `getCheckinUrlSync` (Linha ~52)

```javascript
// ANTES:
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrlSync === "function") {
    return globalThis.getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrlSync === "function") {
    return getSerproCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  const activeDb = dbInstance || (typeof globalThis.db !== "undefined" ? globalThis.db : null);
  const activeSettings = activeDb?.settings || activeDb || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  if (currentProvider === "gov_fnrh" && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}

// DEPOIS:
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrlSync === "function") {
    return globalThis.getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrlSync === "function") {
    return getSerproCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  const activeDb = dbInstance || (typeof globalThis.db !== "undefined" ? globalThis.db : null);
  const activeSettings = activeDb?.settings || activeDb || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const isResign = Boolean(reservation?.needsReSignature);
  const resignParam = isResign
    ? (safeGuestIndex > 1 ? `?guest=${safeGuestIndex}&resign=1` : "?resign=1")
    : `?guest=${safeGuestIndex}`;
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}${resignParam}`;

  if (currentProvider === "gov_fnrh" && !isResign && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}
```

#### Alteração B: Resiliência em `triggerImmediateWhatsApp` (Linha ~7617)

```javascript
// ANTES:
    if (!db.zapiConfig?.enabled) {
      console.warn(`[WhatsApp Trigger] Evento '${eventName}' para reserva ${reservation?.code || reservation?.id} (${reservation?.guestName}) IGNORADO pois o motor de envio está desativado (zapiConfig.enabled = false).`);
      return;
    }

// DEPOIS:
    const waEnabled = Boolean(db?.zapiConfig?.enabled);
    const emailEnabled = db?.settings?.emailSettings?.enabled !== false;
    if (!waEnabled && !emailEnabled) {
      console.warn(`[Trigger] Evento '${eventName}' para reserva ${reservation?.code || reservation?.id} (${reservation?.guestName}) IGNORADO pois os motores de envio (WhatsApp e E-mail) estão desativados.`);
      return;
    }
```

---

### Blueprint 2: `scripts/demo-server.mjs` (e `artifacts/api-server/demo-server.mjs`)

#### Alteração A: Resolução Dinâmica de Check-in em `demo-server.mjs` (Linha ~5920)

```javascript
// ANTES:
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

// DEPOIS:
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  const activeDb = dbInstance || (typeof db !== "undefined" ? db : null);
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const isResign = Boolean(reservation?.needsReSignature);
  const resignParam = isResign
    ? (safeGuestIndex > 1 ? `?guest=${safeGuestIndex}&resign=1` : "?resign=1")
    : `?guest=${safeGuestIndex}`;
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}${resignParam}`;

  const currentProvider = activeDb?.settings?.checkinProvider || "proprio";

  if (currentProvider === "gov_fnrh" && !isResign && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}
```

#### Alteração B: Helper Central `dispatchReservationReSignatureNotifications`

Inserir logo antes de `commitPendingModification` (após a linha 15633):

```javascript
/**
 * M2: Despacha notificações automáticas ao hóspede quando datas ou flat mudam,
 * enviando WhatsApp via Z-API e espelho por E-mail com o link direto de re-assinatura.
 * Executa de forma assíncrona, não-bloqueante e tolerante a falhas de gateway.
 */
export function dispatchReservationReSignatureNotifications(reservation, changes = [], options = {}) {
  if (!reservation) return;
  const appOrigin = (options.origin || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/$/, "");
  const reSignatureUrl = `${appOrigin}/pre-checkin/${reservation.code}?resign=1`;

  // 1. Registro Imediato de Auditoria
  try {
    logAuditEvent({
      level: "info",
      category: "communication",
      action: "RE_SIGNATURE_NOTIFICATION_DISPATCHED",
      actor: options.actor || { name: "Sistema", role: "system" },
      source: options.source || "re_signature_lifecycle",
      details: {
        reservationCode: reservation.code,
        reSignatureUrl,
        guestPhone: reservation.guestPhone || null,
        guestEmail: reservation.guestEmail || null,
        changesCount: Array.isArray(changes) ? changes.length : 0
      }
    });

    addReservationAuditLog(reservation, {
      action: "re_signature_requested",
      actor: options.actor || { name: "Sistema", role: "system", type: "system" },
      source: options.source || "Notificações Automáticas",
      description: `Notificação de re-assinatura disparada para o hóspede. Link direto: ${reSignatureUrl}`,
      changes
    });
  } catch (auditErr) {
    console.warn("[Re-Signature Audit] Erro ao registrar auditoria de re-assinatura:", auditErr.message);
  }

  // 2. Execução Assíncrona Não-Bloqueante
  setImmediate(async () => {
    try {
      const resvWithChanges = { ...reservation, _changesContext: changes };

      // A. Disparo integrado via WhatsApp / Z-API
      if (typeof triggerImmediateWhatsApp === "function") {
        try {
          await triggerImmediateWhatsApp(db, saveDatabase, "reservation_updated", resvWithChanges, appOrigin);
        } catch (waErr) {
          console.warn("[Re-Signature WhatsApp] Falha graciosa no disparo WhatsApp:", waErr.message);
        }
      }

      // B. Garantia de Entrega de E-mail: Se o espelho de e-mail não foi disparado pelo Z-API
      // (ex.: se o Z-API estiver desativado no painel), despacha o e-mail diretamente via SMTP
      const alreadySentEmail = (db.reservationCommunications || []).some(c =>
        (String(c.reservation_id) === String(reservation.code) || String(c.reservation_id) === String(reservation.id)) &&
        (c.metadata?.trigger === "reservation_updated" || c.metadata?.trigger === "re_signature_requested") &&
        (Date.now() - new Date(c.created_at).getTime() < 10000)
      );

      if (reservation.guestEmail && !alreadySentEmail && typeof sendMirrorEmail === "function") {
        try {
          const tpl = (db.whatsappTemplates || []).find(t => t.id === "tpl_reservation_updated" || t.triggerEvent === "reservation_updated") ||
                      DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_reservation_updated");
          if (tpl) {
            sendMirrorEmail(db, saveDatabase, {
              reservation: resvWithChanges,
              email: reservation.guestEmail,
              recipientName: reservation.guestName,
              recipientType: "guest",
              templateId: tpl.id,
              triggerEvent: "reservation_updated",
              subject: buildMirrorEmailSubject(tpl, resvWithChanges, db, appOrigin, "guest"),
              message: resolveWhatsAppTags(tpl.message, resvWithChanges, db, appOrigin, "guest", tpl),
              buttons: renderTemplateButtons(tpl.buttons, resvWithChanges, db, appOrigin, "guest", tpl),
              footer: tpl.footer,
              baseUrl: appOrigin,
              source: "re_signature_direct_email"
            });
          }
        } catch (emailErr) {
          console.warn("[Re-Signature Email] Falha graciosa no disparo de e-mail:", emailErr.message);
        }
      }
    } catch (err) {
      console.warn("[Re-Signature Notifications] Erro global na rotina de notificação:", err.message);
    }
  });
}
```

#### Alteração C: Invocação no Commit de Modificação (`commitPendingModification`)

Dentro de `commitPendingModification` (logo antes da linha `return { success: true, committed: true, reservation: r };`):

```javascript
  // 11. Disparo de Notificações de Re-Assinatura ao Hóspede (WhatsApp & E-mail)
  const modChanges = [
    {
      field: "checkinDate",
      label: "Data de Entrada (Check-in)",
      oldValue: oldCheckin,
      newValue: targetCheckin
    },
    {
      field: "checkoutDate",
      label: "Data de Saída (Check-out)",
      oldValue: oldCheckout,
      newValue: targetCheckout
    },
    ...(oldFlatNumber !== targetFlatNumber ? [{
      field: "flatNumber",
      label: "Apartamento",
      oldValue: `Flat ${oldFlatNumber}`,
      newValue: `Flat ${targetFlatNumber}`
    }] : []),
    ...(additionalPaid > 0 ? [{
      field: "totalAmount",
      label: "Valor Total",
      oldValue: `R$ ${oldTotalAmount.toFixed(2)}`,
      newValue: `R$ ${(oldTotalAmount + additionalPaid).toFixed(2)} (+R$ ${additionalPaid.toFixed(2)})`
    }] : [])
  ];

  dispatchReservationReSignatureNotifications(r, modChanges, {
    origin: (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com",
    source: "portal_modify_settled",
    actor: { name: r.guestName || "Hóspede", role: "guest", type: "guest" }
  });
```

#### Alteração D: Invocação no `POST /api/pms/guest-portal/:code/modify`

Dentro da rota `/modify` (antes do `res.json(...)`):

```javascript
  // Disparo de Comunicação ao Hóspede com Link de Re-Assinatura
  const directModChanges = [
    {
      field: "checkinDate",
      label: "Data de Entrada (Check-in)",
      oldValue: r.modificationHistory[r.modificationHistory.length - 1]?.oldCheckin,
      newValue: newCheckinDate
    },
    {
      field: "checkoutDate",
      label: "Data de Saída (Check-out)",
      oldValue: r.modificationHistory[r.modificationHistory.length - 1]?.oldCheckout,
      newValue: newCheckoutDate
    },
    ...(targetFlatNumber !== String(r.flatNumber || r.flatId) ? [{
      field: "flatNumber",
      label: "Apartamento",
      oldValue: String(r.flatNumber || r.flatId),
      newValue: targetFlatNumber
    }] : [])
  ];

  dispatchReservationReSignatureNotifications(r, directModChanges, {
    origin: req.headers["origin"] || (req.headers["host"] ? `${req.protocol || "https"}://${req.headers["host"]}` : "https://corpflats.onrender.com"),
    source: "portal_modify_direct",
    actor: { name: r.guestName || "Hóspede", role: "guest", type: "guest" }
  });
```

#### Alteração E: Re-Assinatura Concluída em `POST /api/pms/pre-checkin`

Ao salvar a nova assinatura em `POST /api/pms/pre-checkin`:

```javascript
  const wasReSignature = Boolean(r.needsReSignature || targetGuest.needsReSignature);
  targetGuest.needsReSignature = false;
  if (r.guests.every(g => !g.needsReSignature) || Number(guestIndex) === 1) {
    r.needsReSignature = false;
    delete r.reSignatureReason;
  }

  if (wasReSignature) {
    addReservationAuditLog(r, {
      action: "re_signature_completed",
      actor: { id: guest.id, name: validName, role: "guest", type: "guest" },
      source: "Check-in Digital (Re-assinatura)",
      description: `Re-assinatura digital concluída com sucesso para Flat ${r.flatNumber}. Hash SHA-256: ${fnrhDocument?.sha256Hash || 'N/A'}`
    });
  }
```

E na entrega de e-mail à recepção (linha ~21236):
```javascript
  // Dispara à recepção se for check-in hoje OU se for re-assinatura de documento atualizado
  if (isCheckinTodayOrPast || wasReSignature) {
```

---

## 5. Matriz de Conformidade & Verificação

| Critério de Aceite | Mecanismo de Garantia | Verificação Independente |
|---|---|---|
| **Link Direto de Re-assinatura** | `getCheckinUrlSync` anexa `?resign=1` quando `needsReSignature = true` | `assert.match(url, /pre-checkin\/.*(\?|&)resign=1/)` |
| **WhatsApp Personalizado** | Template `tpl_reservation_updated` renderiza botão com link e diff | `db.whatsappHistory` possui registro com trigger `reservation_updated` e `buttons[0].url` contendo `resign=1` |
| **E-mail Espelho ao Hóspede** | `sendMirrorEmail` / `sendEmailAsync` despacha HTML para `r.guestEmail` | `db.reservationCommunications` registra `recipient === r.guestEmail` |
| **Resiliência a Falhas** | Disparos assíncronos em `setImmediate` com `try/catch` independentes | Simular gateway offline: a chamada HTTP retorna 200 e a reserva é alterada normalmente |
| **Auditoria** | Registro em `db.auditLogs` e `r.auditLogs` | Inspecionar `r.auditLogs` buscando `re_signature_requested` |
| **Paridade Twin-Server** | SHA-256 idêntico entre `scripts/` e `artifacts/api-server/` | `Get-FileHash` deve bater exatamente |
