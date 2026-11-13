# Blueprint: Settings & Reservation Persistence (Feature 1, Milestone 1)

**Autor:** Explorer M1_2 (Settings & Persistence Specialist)  
**Data:** 2026-10-07  
**Alvo:** Milestone 1 / Feature 1 (ORIGINAL_REQUEST R1 & R2, PROJECT.md F1)  
**Status:** Especificação Aprovada para Implementação  

---

## 1. Visão Geral da Arquitetura

O objetivo desta funcionalidade é fornecer o alicerce de persistência e governança de dados para a **chave seletora global e dinâmica de check-in** (`settings.checkinProvider`), com suporte aos modos `'proprio'` (CorpFlats) e `'gov_fnrh'` (SERPRO FNRH Digital).

### Princípios Arquiteturais Centrais:
1. **Zero Downtime & Zero Restart:** A alternância do provedor de check-in via `PATCH /api/settings` reflete imediatamente em memória (`db.settings.checkinProvider`) e é gravada instantaneamente em disco e no PostgreSQL da nuvem.
2. **Backward Compatibility Rigorosa:** O valor padrão inicial de `settings.checkinProvider` é estritamente `'proprio'`, garantindo que nenhuma reserva ou fluxo pré-existente seja afetado antes de uma decisão explícita do administrador.
3. **Persistência Dual e Blindagem Cloud:** O sistema opera com persistência local em `data/database.json` e sincronização no PostgreSQL (`system_store`). Durante reboots ou restaurações em nuvem, `loadDatabase` deve proteger explicitamente `checkinProvider` e `serproConfig` contra sobrescritas acidentais por snapshots legados.
4. **Paridade Byte-a-Byte Absoluta:** O servidor Node.js possui um espelho mandatório em `scripts/demo-server.mjs` que deve permanecer 100% idêntico a `artifacts/api-server/demo-server.mjs`.

---

## 2. Especificação do Esquema de Dados (`data/database.json`)

### 2.1 Objeto `db.settings`
Em `data/database.json`, o objeto `settings` deve receber o campo `checkinProvider`:

```json
{
  "settings": {
    "onedriveShareUrl": "https://d.docs.live.net/CABA622DEF61CB38/Documentos/Calend%C3%A1rio%20de%20Reservas%2023-11-2025.xlsx",
    "onedriveLinkConfigured": true,
    "syncIntervalMinutes": 60,
    "lastSyncedAt": "2026-09-01T07:26:30.447Z",
    "sheetName": "Agenda",
    "alertHour": 15,
    "adminWhatsApp": "5522997124021",
    "checkinTime": "14:00",
    "checkoutTime": "12:00",
    "autoEarlyCheckinForSite": true,
    "checkinProvider": "proprio",
    "serproConfig": {
      "env": "homologacao",
      "cpfSolicitante": "12585736792"
    },
    "buildingName": "Edifício Soho Residence Service",
    "receptionEmail": "millerpessanha@gmail.com",
    "garageEmail": "millerpessanha@gmail.com",
    "hotelAddress": "Edifício Soho Residence Service, Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
    "googleMapsUrl": "https://share.google/LHu3541d5lhkdvbL2",
    "mercadoPagoConfig": { ... },
    "breakfastReminderTemplate": "..."
  }
}
```

### 2.2 Objeto de Reserva (`db.reservations`)
Cada reserva cadastrada enquanto `checkinProvider === 'gov_fnrh'` deve persistir os seguintes campos oficiais emitidos pelo SERPRO FNRH:

```typescript
interface SerproReservationExtension {
  serproReservaId?: string;       // UUID retornado pela API SERPRO (ex: "634eecb8-5973-47fd-a8a6-718e3c9d717f")
  serproPrecheckinUrl?: string;   // URL oficial emitida (ex: "https://fnrh.turismo.gov.br/precheckin/634eecb8-5973-47fd-a8a6-718e3c9d717f")
  link_precheckin?: string;       // Alias idêntico ao campo da API SERPRO para compatibilidade
  serproStatus?: string;          // Status retornado (ex: "CRIADA")
  serproCreatedAt?: string;       // Timestamp ISO do cadastro no SERPRO
  serproError?: string | null;    // Último erro de comunicação, caso tenha ocorrido fallback
}
```

---

## 3. Inicialização Padrão em Memória (`demo-server.mjs`)

Em `artifacts/api-server/demo-server.mjs` (e espelho `scripts/demo-server.mjs`), nas linhas 554–577 onde o objeto `db.settings` inicial é instanciado:

### Trecho Original (Linhas 554–577):
```javascript
  settings: {
    onedriveShareUrl: "https://1drv.ms/x/c/caba622def61cb38/IQAABAFTc9qBR7cpKTgR2Lo3AYHW4JrwOU2p8ekBEcgydyI?e=Ohs2xW",
    onedriveLinkConfigured: true,
    syncIntervalMinutes: 60,
    lastSyncedAt: new Date().toISOString(),
    sheetName: "Agenda",
    alertHour: 15,
    adminWhatsApp: "5522997124021",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    autoEarlyCheckinForSite: true,
    googleMapsUrl: "https://share.google/LHu3541d5lhkdvbL2",
    buildingName: "Edifício Soho Residence Service",
    receptionEmail: "millerpessanha@gmail.com",
    emailSettings: { ... }
  }
```

### Modificação Exata:
```javascript
  settings: {
    onedriveShareUrl: "https://1drv.ms/x/c/caba622def61cb38/IQAABAFTc9qBR7cpKTgR2Lo3AYHW4JrwOU2p8ekBEcgydyI?e=Ohs2xW",
    onedriveLinkConfigured: true,
    syncIntervalMinutes: 60,
    lastSyncedAt: new Date().toISOString(),
    sheetName: "Agenda",
    alertHour: 15,
    adminWhatsApp: "5522997124021",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    autoEarlyCheckinForSite: true,
    checkinProvider: "proprio",
    serproConfig: {
      env: process.env.SERPRO_ENV || "homologacao",
      cpfSolicitante: process.env.SERPRO_CPF_SOLICITANTE || "12585736792"
    },
    googleMapsUrl: "https://share.google/LHu3541d5lhkdvbL2",
    buildingName: "Edifício Soho Residence Service",
    receptionEmail: "millerpessanha@gmail.com",
    emailSettings: { ... }
  }
```

---

## 4. Blindagem na Hidratação PostgreSQL Cloud (`loadDatabase`)

Em `artifacts/api-server/demo-server.mjs` (e espelho), nas linhas 3487–3510, dentro da função `loadDatabase()`:

### Trecho Original (Linhas 3487–3510):
```javascript
          // Blindagem de Configurações de E-mail / SMTP contra perda em reinícios ou restores
          const localEmailSettings = db.settings?.emailSettings;
          const pgEmailSettings = pgLoaded.settings?.emailSettings;
          const preservedEmailSettings = (pgEmailSettings?.pass && pgEmailSettings?.user)
            ? pgEmailSettings
            : ((localEmailSettings?.pass && localEmailSettings?.user) ? localEmailSettings : (pgEmailSettings || localEmailSettings));

          const localReceptionEmail = db.settings?.receptionEmail;
          const pgReceptionEmail = pgLoaded.settings?.receptionEmail;
          const preservedReceptionEmail = pgReceptionEmail || localReceptionEmail || "millerpessanha@gmail.com";

          const localGarageEmail = db.settings?.garageEmail;
          const pgGarageEmail = pgLoaded.settings?.garageEmail;
          const preservedGarageEmail = pgGarageEmail || localGarageEmail || "millerpessanha@gmail.com";

          Object.assign(db, pgLoaded);

          if (!db.settings) db.settings = {};
          if (preservedEmailSettings && (preservedEmailSettings.user || preservedEmailSettings.pass)) {
            db.settings.emailSettings = preservedEmailSettings;
          }
          if (preservedReceptionEmail) db.settings.receptionEmail = preservedReceptionEmail;
          if (preservedGarageEmail) db.settings.garageEmail = preservedGarageEmail;
```

### Modificação Exata:
```javascript
          // Blindagem de Configurações de E-mail / SMTP contra perda em reinícios ou restores
          const localEmailSettings = db.settings?.emailSettings;
          const pgEmailSettings = pgLoaded.settings?.emailSettings;
          const preservedEmailSettings = (pgEmailSettings?.pass && pgEmailSettings?.user)
            ? pgEmailSettings
            : ((localEmailSettings?.pass && localEmailSettings?.user) ? localEmailSettings : (pgEmailSettings || localEmailSettings));

          const localReceptionEmail = db.settings?.receptionEmail;
          const pgReceptionEmail = pgLoaded.settings?.receptionEmail;
          const preservedReceptionEmail = pgReceptionEmail || localReceptionEmail || "millerpessanha@gmail.com";

          const localGarageEmail = db.settings?.garageEmail;
          const pgGarageEmail = pgLoaded.settings?.garageEmail;
          const preservedGarageEmail = pgGarageEmail || localGarageEmail || "millerpessanha@gmail.com";

          // Blindagem da Chave Seletora de Check-in e Configurações SERPRO
          const localCheckinProvider = db.settings?.checkinProvider;
          const pgCheckinProvider = pgLoaded.settings?.checkinProvider;
          const preservedCheckinProvider = pgCheckinProvider || localCheckinProvider || "proprio";

          const localSerproConfig = db.settings?.serproConfig;
          const pgSerproConfig = pgLoaded.settings?.serproConfig;
          const preservedSerproConfig = pgSerproConfig || localSerproConfig || null;

          Object.assign(db, pgLoaded);

          if (!db.settings) db.settings = {};
          if (preservedEmailSettings && (preservedEmailSettings.user || preservedEmailSettings.pass)) {
            db.settings.emailSettings = preservedEmailSettings;
          }
          if (preservedReceptionEmail) db.settings.receptionEmail = preservedReceptionEmail;
          if (preservedGarageEmail) db.settings.garageEmail = preservedGarageEmail;
          if (preservedCheckinProvider) db.settings.checkinProvider = preservedCheckinProvider;
          if (preservedSerproConfig) db.settings.serproConfig = preservedSerproConfig;
```

---

## 5. Endpoints de Configuração (`GET /api/settings` e `PATCH /api/settings`)

### 5.1 Endpoint `GET /api/settings` (Linhas 10042–10052)
Garante retorno do `checkinProvider` e `serproConfig`:

```javascript
app.get("/api/settings", (req, res) => {
  const petPolicy = db.siteConfig?.petPolicy || db.settings?.petPolicy || DEFAULT_SITE_CONFIG.petPolicy;
  res.json({
    garageEmail: db.settings?.garageEmail || "millerpessanha@gmail.com",
    ...db.settings,
    checkinProvider: db.settings?.checkinProvider || "proprio",
    serproConfig: db.settings?.serproConfig || {
      env: process.env.SERPRO_ENV || "homologacao",
      cpfSolicitante: process.env.SERPRO_CPF_SOLICITANTE || "12585736792"
    },
    petPolicy,
    houseRules: db.settings.houseRules || DEFAULT_HOUSE_RULES,
    contractTerms: db.settings.contractTerms || DEFAULT_CONTRACT_TERMS,
    termsAndRules: db.settings.termsAndRules || DEFAULT_TERMS_AND_RULES
  });
});
```

### 5.2 Endpoint `PATCH /api/settings` (Linhas 10054–10088)
Adiciona validação e persistência imediata de `checkinProvider` e `serproConfig`:

```javascript
app.patch("/api/settings", (req, res) => {
  const {
    onedriveShareUrl,
    syncIntervalMinutes,
    sheetName,
    alertHour,
    termsAndRules,
    houseRules,
    contractTerms,
    adminWhatsApp,
    autoEarlyCheckinForSite,
    checkinTime,
    checkoutTime,
    hotelAddress,
    googleMapsUrl,
    receptionEmail,
    garageEmail,
    buildingName,
    petPolicy,
    checkinProvider,
    serproConfig
  } = req.body;

  if (onedriveShareUrl !== undefined) db.settings.onedriveShareUrl = onedriveShareUrl;
  if (syncIntervalMinutes !== undefined) db.settings.syncIntervalMinutes = syncIntervalMinutes;
  if (sheetName !== undefined) db.settings.sheetName = sheetName;
  if (alertHour !== undefined) db.settings.alertHour = alertHour;
  if (houseRules !== undefined) db.settings.houseRules = houseRules;
  if (contractTerms !== undefined) db.settings.contractTerms = contractTerms;
  if (termsAndRules !== undefined) db.settings.termsAndRules = termsAndRules;
  if (adminWhatsApp !== undefined) db.settings.adminWhatsApp = adminWhatsApp;
  if (autoEarlyCheckinForSite !== undefined) db.settings.autoEarlyCheckinForSite = Boolean(autoEarlyCheckinForSite);
  if (checkinTime !== undefined) db.settings.checkinTime = checkinTime;
  if (checkoutTime !== undefined) db.settings.checkoutTime = checkoutTime;
  if (hotelAddress !== undefined) db.settings.hotelAddress = hotelAddress;
  if (googleMapsUrl !== undefined) db.settings.googleMapsUrl = googleMapsUrl;
  if (receptionEmail !== undefined) db.settings.receptionEmail = receptionEmail;
  if (garageEmail !== undefined) db.settings.garageEmail = garageEmail ? String(garageEmail).trim() : "millerpessanha@gmail.com";
  if (buildingName !== undefined) db.settings.buildingName = buildingName;

  // Validação e persistência do checkinProvider
  if (checkinProvider !== undefined) {
    if (checkinProvider !== "proprio" && checkinProvider !== "gov_fnrh") {
      return res.status(400).json({
        error: "checkinProvider inválido. Deve ser 'proprio' ou 'gov_fnrh'."
      });
    }
    db.settings.checkinProvider = checkinProvider;
  }

  // Validação e mesclagem de serproConfig
  if (serproConfig !== undefined) {
    if (typeof serproConfig !== "object" || serproConfig === null) {
      return res.status(400).json({ error: "serproConfig deve ser um objeto válido." });
    }
    if (serproConfig.env && !["homologacao", "producao"].includes(serproConfig.env)) {
      return res.status(400).json({ error: "serproConfig.env inválido. Deve ser 'homologacao' ou 'producao'." });
    }
    db.settings.serproConfig = {
      ...(db.settings.serproConfig || {}),
      ...serproConfig
    };
  }

  if (petPolicy !== undefined) {
    if (!db.siteConfig) db.siteConfig = {};
    db.siteConfig.petPolicy = {
      ...(db.siteConfig.petPolicy || DEFAULT_SITE_CONFIG.petPolicy),
      ...petPolicy
    };
    db.settings.petPolicy = db.siteConfig.petPolicy;
  }

  saveDatabase("settings_update");

  const currentPetPolicy = db.siteConfig?.petPolicy || db.settings?.petPolicy || DEFAULT_SITE_CONFIG.petPolicy;
  res.json({
    ...db.settings,
    checkinProvider: db.settings.checkinProvider || "proprio",
    petPolicy: currentPetPolicy,
    houseRules: db.settings.houseRules || DEFAULT_HOUSE_RULES,
    contractTerms: db.settings.contractTerms || DEFAULT_CONTRACT_TERMS
  });
});
```

---

## 6. Rota de Status da Conexão SERPRO (`GET /api/fnrh-serpro/status`)

Posicionada logo após `app.patch("/api/settings")`:

```javascript
// ── Health Check da Conexão SERPRO FNRH Digital v2.4.2 ────────────────────────
app.get("/api/fnrh-serpro/status", async (req, res) => {
  try {
    const provider = db.settings?.checkinProvider || "proprio";
    const health = await fnrhSerproService.checkHealth(db.settings?.serproConfig);
    return res.json({
      ok: Boolean(health.ok),
      provider,
      env: health.env || db.settings?.serproConfig?.env || process.env.SERPRO_ENV || "homologacao",
      latencyMs: Number(health.latencyMs) || 0,
      status: health.status || (health.ok ? "healthy" : "unreachable"),
      message: health.message || (health.ok ? "Conexão operacional com SERPRO FNRH" : health.error || "Falha de conexão"),
      error: health.error || null
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      provider: db.settings?.checkinProvider || "proprio",
      env: db.settings?.serproConfig?.env || process.env.SERPRO_ENV || "homologacao",
      latencyMs: 0,
      status: "internal_error",
      error: err.message
    });
  }
});
```

---

## 7. Hooks de Registro SERPRO na Criação de Reservas

### 7.1 Criação no PMS Calendário (`POST /api/pms/reservations`)
Local: Linha ~11810, logo antes de `db.reservations.unshift(newReservation)` e `saveDatabase()`.

```javascript
  // ── Integração Automática SERPRO FNRH se Modo Gov.br Estiver Ativo ────────
  if (db.settings?.checkinProvider === "gov_fnrh") {
    try {
      const serproRes = await fnrhSerproService.registerReservation(newReservation, db.settings?.serproConfig);
      if (serproRes && (serproRes.link_precheckin || serproRes.serproPrecheckinUrl)) {
        newReservation.serproReservaId = serproRes.reserva_id || serproRes.serproReservaId;
        newReservation.serproPrecheckinUrl = serproRes.link_precheckin || serproRes.serproPrecheckinUrl;
        newReservation.link_precheckin = serproRes.link_precheckin || serproRes.serproPrecheckinUrl;
        newReservation.serproStatus = serproRes.situacao_reserva_id || serproRes.serproStatus || "CRIADA";
        newReservation.serproCreatedAt = new Date().toISOString();
        console.log(`[FNRH SERPRO] Reserva ${newReservation.code} registrada com sucesso: ${newReservation.serproPrecheckinUrl}`);
      }
    } catch (serproErr) {
      console.warn(`[FNRH SERPRO Fallback] Falha ao registrar reserva ${newReservation.code} no SERPRO:`, serproErr.message);
      newReservation.serproError = serproErr.message;
      try {
        logAuditEvent({
          level: "warning",
          category: "integration",
          action: "FNRH_SERPRO_FALLBACK",
          details: {
            reservationId: newReservation.id,
            reservationCode: newReservation.code,
            reason: serproErr.message
          }
        });
        createNotification({
          category: "system_error",
          severity: "warning",
          title: "⚠️ FNRH Gov.br Indisponível — Contingência Ativa",
          message: `Falha ao registrar reserva ${newReservation.code} no SERPRO FNRH: ${serproErr.message}. Check-in próprio ativado automaticamente.`,
          metadata: { reservationCode: newReservation.code, error: serproErr.message },
          targetUrl: `/reservas?code=${newReservation.code}`
        });
      } catch (_) {}
    }
  }

  db.reservations.unshift(newReservation);
  saveDatabase();
```

### 7.2 Criação no Motor de Reserva Direta (`POST /api/reservations/direct-booking`)
Local: Linha ~10722, junto com `db.reservations.push(reservation)` e antes dos disparos de WhatsApp.

```javascript
    // ── Integração Automática SERPRO FNRH se Modo Gov.br Estiver Ativo ────────
    if (db.settings?.checkinProvider === "gov_fnrh") {
      try {
        const serproRes = await fnrhSerproService.registerReservation(reservation, db.settings?.serproConfig);
        if (serproRes && (serproRes.link_precheckin || serproRes.serproPrecheckinUrl)) {
          reservation.serproReservaId = serproRes.reserva_id || serproRes.serproReservaId;
          reservation.serproPrecheckinUrl = serproRes.link_precheckin || serproRes.serproPrecheckinUrl;
          reservation.link_precheckin = serproRes.link_precheckin || serproRes.serproPrecheckinUrl;
          reservation.serproStatus = serproRes.situacao_reserva_id || serproRes.serproStatus || "CRIADA";
          reservation.serproCreatedAt = new Date().toISOString();
          console.log(`[FNRH SERPRO Direct] Reserva ${reservation.code} registrada com sucesso: ${reservation.serproPrecheckinUrl}`);
        }
      } catch (serproErr) {
        console.warn(`[FNRH SERPRO Fallback Direct] Falha ao registrar reserva ${reservation.code}:`, serproErr.message);
        reservation.serproError = serproErr.message;
        try {
          logAuditEvent({
            level: "warning",
            category: "integration",
            action: "FNRH_SERPRO_FALLBACK",
            details: {
              reservationId: reservation.id,
              reservationCode: reservation.code,
              reason: serproErr.message
            }
          });
          createNotification({
            category: "system_error",
            severity: "warning",
            title: "⚠️ FNRH Gov.br Indisponível — Contingência Ativa",
            message: `Falha ao registrar reserva ${reservation.code} no SERPRO FNRH: ${serproErr.message}. Check-in próprio ativado automaticamente.`,
            metadata: { reservationCode: reservation.code, error: serproErr.message },
            targetUrl: `/reservas?code=${reservation.code}`
          });
        } catch (_) {}
      }
    }
```

---

## 8. Import do Serviço SERPRO no Servidor

No topo de `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, por volta da linha 88 (logo após os imports de `mail-service.mjs` e `fnrh-pdf-service.mjs`):

```javascript
import { fnrhSerproService } from "./fnrh-serpro-service.mjs";
```

> **Atenção:** Como o cliente HTTP SERPRO reside em `scripts/fnrh-serpro-service.mjs` e em `artifacts/api-server/fnrh-serpro-service.mjs`, o import relativo `./fnrh-serpro-service.mjs` funciona perfeitamente em ambos os ambientes, preservando a paridade de código.

---

## 9. Protocolo de Espelhamento e Garantia de Paridade Byte-a-Byte

Regra do projeto: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` **devem ser estritamente idênticos**.

### Procedimento para o Agente Implementador:
1. Aplica as edições em `artifacts/api-server/demo-server.mjs`.
2. Copia integralmente o conteúdo atualizado para `scripts/demo-server.mjs`:
   ```bash
   cp artifacts/api-server/demo-server.mjs scripts/demo-server.mjs
   ```
3. Executa verificação criptográfica imediata via Node.js:
   ```bash
   node -e "const crypto = require('crypto'); const fs = require('fs'); const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/demo-server.mjs')).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('scripts/demo-server.mjs')).digest('hex'); console.log('artifacts:', h1); console.log('scripts:  ', h2); if (h1 !== h2) { console.error('FALHA: Arquivos espelho diferem!'); process.exit(1); } else { console.log('OK: Paridade byte-a-byte confirmada!'); }"
   ```

---

## 10. Plano de Testes Automatizados (`tests/fnrh-checkin-toggle.test.mjs`)

Os testes para esta funcionalidade (F1) cobrirão:
1. **Inicialização:** Verificação de que `data/database.json` possui `settings.checkinProvider === 'proprio'`.
2. **Defesa em Memória:** Verificação de que o servidor inicializa com `db.settings.checkinProvider: "proprio"`.
3. **Endpoint `GET /api/settings`:** Retorno de `checkinProvider`.
4. **Endpoint `PATCH /api/settings`:**
   - Alternância para `'gov_fnrh'` retorna 200 e persiste no banco.
   - Alternância de volta para `'proprio'` retorna 200 e persiste no banco.
   - Envio de valor inválido (ex: `'outro'`) retorna 400 com mensagem de erro descritiva.
5. **Endpoint `GET /api/fnrh-serpro/status`:** Retorna objeto com `{ ok, provider, env, latencyMs }`.
6. **Persistência de Reserva no Modo Gov.br:** Mock ou stub de `fnrhSerproService.registerReservation` confirmando que `serproReservaId` e `serproPrecheckinUrl` são persistidos no objeto da reserva criada.
7. **Resiliência:** Quando `fnrhSerproService.registerReservation` rejeita, a reserva ainda é criada com sucesso, o erro é capturado e registrado no audit log sem estourar 500 no endpoint.
8. **Paridade de Espelho:** SHA-256 idêntico entre os dois arquivos `demo-server.mjs`.
