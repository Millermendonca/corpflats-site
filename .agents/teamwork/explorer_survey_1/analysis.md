# Análise de Arquitetura e Engenharia: Governança Diária (Stayover) e B2B

**Data:** 2026-10-27  
**Autor:** `explorer_survey_1` (Backend & Housekeeping Architecture Explorer)  
**Escopo:** Mapeamento minucioso do backend e governança em `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `artifacts/api-server/maid-automation-service.mjs`, `scripts/maid-automation-service.mjs`, contratos de API, paridade SHA-256 e plano cirúrgico de implementação.

---

## 1. Verificação de Arquivos Gêmeos (Twin Parity SHA-256)

Foi realizada verificação criptográfica dos arquivos gêmeos do backend via PowerShell `Get-FileHash`:

| Arquivo Gêmeo 1 | Arquivo Gêmeo 2 | Algoritmo | Hash SHA-256 | Status de Paridade |
|-----------------|-----------------|-----------|--------------|-------------------|
| `artifacts/api-server/demo-server.mjs` | `scripts/demo-server.mjs` | SHA-256 | `E3E697950560C692FDFF9D2E32C0269376E905A62DD4BEC388A238022859AFA8` | **100% IDÊNTICO** |
| `artifacts/api-server/maid-automation-service.mjs` | `scripts/maid-automation-service.mjs` | SHA-256 | `813410E808A8B6BDC04C8422A8E39940E3408523996F13B98D1E8756442A35CA` | **100% IDÊNTICO** |

*Observação Crítica para Implementação:* Qualquer alteração em `artifacts/api-server/demo-server.mjs` ou `artifacts/api-server/maid-automation-service.mjs` DEVE ser replicada byte a byte em `scripts/` correspondente para preservar paridade perfeita.

---

## 2. Localização e Mapeamento de `getRequestsForDate`

Em `artifacts/api-server/demo-server.mjs`:
- **Declaração:** Linha **14596** (`function getRequestsForDate(dateStr, isNested = false) {`)
- **Término:** Linha **15092** (`return requestsForDate; }`)
- **Consumo interno:** Linha **13174** (em `getFlatRealtimeStatus`) e Linha **15113** (em `GET /api/reservations/checkouts`).

### Comportamento Atual de `getRequestsForDate`:
1. **Passo 1 (Linhas 14624–14628):** Identifica flats com hóspedes contínuos (stayovers) exclusivamente para SUPRIMIR a geração de check-outs indevidos:
   ```javascript
   const stayoverFlatNumbers = new Set(
     (db.reservations || [])
       .filter(r => r.status !== "cancelada" && r.checkinDate < dateStr && r.checkoutDate > dateStr)
       .map(r => String(r.flatNumber || (db.flats.find(f => f.id === r.flatId)?.number || "")))
   );
   ```
   *Lacuna Encontrada:* Atualmente, nenhuma limpeza de estadia em andamento (stayover) é gerada. Se um flat estiver em stayover, ele simplesmente não gera card de checkout.
2. **Passo 2 (Linhas 14720–14734):** Busca reservas com `checkoutDate === dateStr`.
3. **Passo 3 (Linhas 14736–14963):** Cria ou busca registros em `db.cleaningRequests` e monta os cards de saída (`source: "checkout"`).
4. **Passo 4 (Linhas 14965–14977):** Incorpora solicitações manuais de limpeza e instruções.
5. **Passo 5 (Linhas 15003–15085):** Carry-over de pendências sujas não limpas de dias anteriores.

### Inserção Necessária para Geração de Cards Stayover B2B:
Logo após o Passo 1 (ou integrado antes do Passo 4):
- Filtrar reservas ativas que satisfaçam:
  1. `status !== "cancelada" && status !== "cancelled" && status !== "no_show"`
  2. `checkinDate < dateStr && checkoutDate > dateStr`
  3. `isB2BReservation(r)` (ver seção 4)
- Para cada uma dessas reservas B2B em stayover:
  - Verificar se já existe um card em `db.cleaningRequests` para `requestDate === dateStr` com `source === "stayover"` e `flatNumber === fNumber`.
  - Se não existir, instanciar novo objeto com:
    ```javascript
    {
      id: maxId + 1,
      flatId: flat.id,
      flatNumber: flat.number,
      requestDate: dateStr,
      source: "stayover",
      cleaningType: "stayover",
      status: "dirty",
      assignedUserId: null,
      assignedUsername: null,
      assignedUserName: null,
      isVacant: false,
      isVacantExplicitlySet: false,
      vacantSource: null,
      isPriority: false,
      isExtended: false,
      twinBeds: false,
      extraMattress: false,
      autoReservationCode: r.code || null,
      autoReservationId: r.id || null,
      adminNote: null,
      leavingGuest: null,
      currentGuest: r.guestName || r.title || "Hóspede",
      arrivingGuest: null,
      pendingObservation: null,
      doNotDisturb: Boolean(r.doNotDisturb),
      linenTracking: computeLinenTracking(r, dateStr, db),
      createdAt: `${dateStr}T08:00:00.000Z`,
      updatedAt: `${dateStr}T08:00:00.000Z`
    }
    ```
  - Persistir em `db.cleaningRequests` e adicionar a `requestsForDate`.
  - Marcar `existingFlatNumbersForDate.add(flatNumber)`.

---

## 3. Rota `GET /api/reservations/checkouts` e Schema do Card

Em `artifacts/api-server/demo-server.mjs`:
- **Declaração:** Linha **15109** (`app.get("/api/reservations/checkouts", (req, res) => {`)
- **Término:** Linha **15374** (`res.json(result); });`)

### Schema Retornado por Cada Card:
O endpoint mapeia cada item `req_` de `getRequestsForDate(dateStr)` gerando:
```typescript
interface CheckoutCardResponse {
  flatId: number;
  flatNumber: string;
  serviceInProgress: any | null;
  checkoutDate: string; // "YYYY-MM-DD"
  hasCheckinToday: boolean;
  isOccupied: boolean;
  isVacant: boolean;
  isPriority: boolean;
  isExtended: boolean;
  isPendingFromPreviousDay: boolean;
  originalRequestDate: string | null;
  leavingGuest: string | null;
  arrivingGuest: string | null;
  currentGuest?: string | null; // Adicionar para Stayover B2B
  activeReservation: {
    guestName: string;
    checkinDate: string;
    checkoutDate: string;
    isFutureCheckout: boolean;
  } | null;
  reservation: {
    id: number;
    code: string;
    guestName: string;
    checkinDate: string;
    checkoutDate: string;
    dailyRate: number;
    totalAmount: number;
    paidAmount: number;
    paymentStatus: string;
  } | null;
  hasFutureCheckoutOnly: boolean;
  setupInfo: {
    twinBeds: boolean;
    extraMattress: boolean;
    prefersHighFloor: boolean;
    specialRequests: string | null;
    adminNote: string | null;
    guestName: string | null;
  };
  pendingPeriodicTasks: any[];
  pendingSurveys: any[];
  isInstructionOnly: boolean;
  isBedAdjustmentOnly: boolean;
  isPaidCleaning: boolean;
  instructionText: string | null;
  source?: "checkout" | "stayover" | "manual"; // Na raiz
  cleaningType?: "checkout" | "stayover";     // Na raiz
  linenTracking?: LinenTrackingMeta | null;   // Na raiz e no cleaningRequest
  cleaningRequest: {
    id: number;
    flatId: number;
    flatNumber: string;
    requestDate: string;
    source: "checkout" | "stayover" | "manual";
    cleaningType?: "checkout" | "stayover";
    status: "dirty" | "will_clean" | "cleaning_now" | "clean" | "pending_issue";
    type: string;
    isInstructionOnly: boolean;
    isBedAdjustmentOnly: boolean;
    isPaidCleaning: boolean;
    instructionText: string | null;
    twinBeds: boolean;
    extraMattress: boolean;
    adminNote: string | null;
    pendingObservation: string | null;
    arrivingGuest: string | null;
    currentGuest?: string | null;
    isPriority: boolean;
    isExtended: boolean;
    isPendingFromPreviousDay: boolean;
    originalRequestDate: string | null;
    assignedUserId: number | null;
    assignedUsername: string | null;
    isVacant: boolean;
    isVacantExplicitlySet: boolean;
    vacantSource: string | null;
    willCleanAt: string | null;
    cleaningStartedAt: string | null;
    completedAt: string | null;
    durationMinutes: number | null;
    towelsChanged?: boolean;
    beddingChanged?: boolean;
    doNotDisturb?: boolean;
    linenTracking?: LinenTrackingMeta | null;
    createdAt: string;
    updatedAt: string;
  };
}
```

### Adaptação para Stayover B2B no Endpoint:
Nas linhas 15176–15199 e 15288–15360:
- Se `req_.source === "stayover"` ou `req_.cleaningType === "stayover"`:
  - `isOccupied = true`
  - `isVacant = false`
  - `leavingGuest = null`
  - `currentGuest = req_.currentGuest || activeResToday?.guestName || checkoutRes?.guestName`
  - `arrivingGuest = null`
  - `reservation = checkoutRes || activeResToday`
  - Inserir `linenTracking` no objeto raiz e em `cleaningRequest`.

---

## 4. Identificação Canônica de Reservas B2B no Banco de Dados

### Ocorrências Existentes no Código:
- Linha **21225**: `const isB2b = chanLower === "b2b" || chanLower.includes("b2b") || Boolean(b2bReservationNumber);`
- Linha **24468**: `const isB2b = chanLower === "b2b" || chanLower.includes("b2b") || Boolean(r.b2bReservationNumber || r.agencyId || r.agencyName);`
- Linha **31777**: `const isB2b = String(r.channel || "").toLowerCase().includes("b2b") || Boolean(r.b2bReservationNumber);`
- Linha **33415**: `const isB2bRes = Boolean(String(r.channel || "").toLowerCase() === "b2b" || r.b2bReservationNumber || r.agencyId || r.agencyName);`
- No frontend (`guest-portal.tsx`, Linha **613**): `const isB2b = Boolean(channelLower === "b2b" || channelLower.includes("b2b") || reservation?.agencyId || reservation?.b2bReservationNumber || reservation?.b2bLocatorRloc)`

### Registro Real Extraído de `data/database.json`:
Exemplo: Reserva ID 405 (`B2B-25055349`):
```json
{
  "id": 405,
  "code": "B2B-25055349",
  "b2bReservationNumber": "25055349",
  "b2bLocatorRloc": "25055349",
  "channel": "b2b",
  "agencyId": 1,
  "agencyName": "Opus Viagens e Eventos Ltda",
  "companyId": 5,
  "companyName": "Lactalis do Brasil",
  "checkinDate": "2026-10-26",
  "checkoutDate": "2026-10-28",
  "status": "confirmada"
}
```

### Função Canônica Recomendada para o Backend:
```javascript
export function isB2BReservation(r) {
  if (!r) return false;
  const chan = String(r.channel || "").toLowerCase().trim();
  return (
    chan === "b2b" ||
    chan.includes("b2b") ||
    Boolean(r.b2bReservationNumber) ||
    Boolean(r.agencyId) ||
    Boolean(r.agencyName) ||
    Boolean(r.b2bLocatorRloc) ||
    String(r.code || "").startsWith("B2B-")
  );
}
```

---

## 5. Análise de `PATCH /api/cleaning/assignments/:requestId/status` e Bloqueio de Baixa de Check-out

Em `artifacts/api-server/demo-server.mjs`:
- **Declaração:** Linha **15743** (`app.patch("/api/cleaning/assignments/:requestId/status", async (req, res) => {`)

### Pontos Críticos Onde Ocorre a Baixa Automática de Check-out:
1. **Linhas 15767–15820 (`if (typeof isVacant === "boolean")`):**
   Quando `isVacant === true`, o código executa:
   ```javascript
   checkoutRes.checkoutDone = true;
   checkoutRes.status = "completed";
   checkoutRes.actualCheckoutAt = now;
   cancelPendingStayRemindersForCheckout(...);
   triggerCheckoutWhatsApp(...);
   ```
2. **Linhas 15824–15832 (Trava de 10 Minutos Mínimos):**
   ```javascript
   const isInstructionRequest = Boolean(item.isInstructionOnly || item.isBedAdjustmentOnly || item.type === "instruction" || item.type === "bed_adjustment_only" || item.source === "manual_instruction");
   if (status === "clean" && item.cleaningStartedAt && !customCompletedAt && !isInstructionRequest) {
     const started = new Date(item.cleaningStartedAt).getTime();
     const elapsedMinutes = (Date.now() - started) / 60000;
     if (elapsedMinutes < 10 && userAuth?.role !== "admin" && userAuth?.role !== "dev") {
       return res.status(400).json({ error: "Tempo insuficiente de higienização (mínimo de 10 minutos)." });
     }
   }
   ```
   *Exigência de R3:* Stayover NÃO deve ter a trava de 10 minutos!
3. **Linhas 15836–15883 (Forçamento Automático ao Mudar para `cleaning_now` ou `clean`):**
   ```javascript
   if (!isInstructionRequest && (status === "cleaning_now" || status === "in_progress" || status === "clean")) {
     item.isVacant = true;
     relatedFlat.isOccupied = false;
     // Busca checkoutRes e marca checkoutDone = true, status = "completed"
   }
   ```
   *Risco Crítico Identificado:* Se um card for de `source: "stayover"`, passar por este bloco marcaria o flat como `isOccupied = false` e desocuparia indevidamente a reserva!
4. **Linha 16106 (`triggerRoomReadyWhatsApp`):**
   Dispara mensagem no WhatsApp avisando hóspede que chega hoje que o quarto está pronto para entrar. Em stayover, NÃO deve disparar isso.

### Desvio Cirúrgico Obrigatório para Stayover:
Identificar no início do handler:
```javascript
const isStayover = item.source === "stayover" || item.cleaningType === "stayover";
```
1. **Trava de 10 Minutos (Linha 15823):**
   `if (status === "clean" && item.cleaningStartedAt && !customCompletedAt && !isInstructionRequest && !isStayover)`
2. **Trava de Não Perturbe (DND):**
   Se `isStayover`: buscar a reserva B2B ativa no flat. Se `reservation.doNotDisturb === true` e `userAuth?.role !== "admin" && userAuth?.role !== "dev"`:
   Retornar status `422` ou `400`:
   `{ error: "Não é possível iniciar ou concluir limpeza. Hóspede ativou o modo Não Perturbe." }`
3. **Bloqueio de Desocupação / Checkout (Linhas 15767 e 15836):**
   Nos blocos que manipulam `checkoutRes`, `relatedFlat.isOccupied = false`, `checkoutRes.checkoutDone = true`:
   **ENVELOPAR OU PULAR** quando `isStayover`:
   - `relatedFlat.isOccupied` permanece `true` (quarto continua ocupado pelo hóspede corporativo).
   - `item.isVacant` permanece `false`.
   - Nenhuma reserva tem `checkoutDone` alterado.
   - Nenhuma mensagem de checkout WhatsApp (`triggerCheckoutWhatsApp`) é disparada.
   - Nenhum cancelamento de lembretes de estadia (`cancelPendingStayRemindersForCheckout`) é disparado.
   - `triggerRoomReadyWhatsApp` na linha 16106 NÃO é chamado quando `isStayover`.
4. **Checklist de Troca de Enxoval (R3):**
   Receber de `req.body`:
   ```javascript
   const { towelsChanged, beddingChanged } = req.body;
   if (isStayover) {
     if (typeof towelsChanged === "boolean") item.towelsChanged = towelsChanged;
     if (typeof beddingChanged === "boolean") item.beddingChanged = beddingChanged;
     
     // Atualiza datas de troca na reserva B2B ativa
     const activeStayRes = (db.reservations || []).find(r =>
       r.status !== "cancelada" && r.status !== "cancelled" &&
       (r.flatId === item.flatId || String(r.flatNumber) === String(item.flatNumber)) &&
       r.checkinDate < (item.requestDate || getTodayStr()) && r.checkoutDate > (item.requestDate || getTodayStr())
     );
     if (activeStayRes) {
       const todayOrExec = item.requestDate || getTodayStr();
       if (beddingChanged) activeStayRes.lastBeddingChangeDate = todayOrExec;
       if (towelsChanged) activeStayRes.lastTowelsChangeDate = todayOrExec;
       if (!Array.isArray(activeStayRes.linenChanges)) activeStayRes.linenChanges = [];
       activeStayRes.linenChanges.push({
         date: todayOrExec,
         beddingChanged: Boolean(beddingChanged),
         towelsChanged: Boolean(towelsChanged),
         performedByUserId: item.assignedUserId || userAuth?.id,
         createdAt: now
       });
     }
   }
   ```

---

## 6. Desenho da Lógica de Cálculo de `linenTracking`

### Especificação de Campos:
```typescript
interface LinenTrackingMeta {
  stayDayNumber: number;              // Dia atual da estadia (1-based, ex: 3)
  totalStayNights: number;            // Total de diárias da reserva (ex: 10)
  lastBeddingChangeDate: string;      // YYYY-MM-DD da última troca de cama (ou checkinDate)
  daysSinceBeddingChange: number;     // Dias corridos desde a última troca de cama
  needsBeddingChangeAlert: boolean;   // true se daysSinceBeddingChange >= 3
  lastTowelsChangeDate: string;       // YYYY-MM-DD da última troca de toalhas (ou checkinDate)
  daysSinceTowelsChange: number;      // Dias corridos desde a última troca de toalhas
  guestRequestedBedding: boolean;     // true se hóspede solicitou cama para hoje
  guestRequestedTowels: boolean;      // true se hóspede solicitou toalhas para hoje
  doNotDisturb: boolean;              // true se hóspede ativou Não Perturbe
}
```

### Algoritmo Canônico de Cálculo:
```javascript
export function computeLinenTracking(reservation, dateStr, db) {
  if (!reservation || !reservation.checkinDate || !reservation.checkoutDate) {
    return null;
  }

  const checkin = new Date(reservation.checkinDate);
  const checkout = new Date(reservation.checkoutDate);
  const current = new Date(dateStr);

  const msPerDay = 86400000;
  const totalStayNights = Math.max(1, Math.round((checkout - checkin) / msPerDay));
  const daysFromCheckin = Math.round((current - checkin) / msPerDay);
  const stayDayNumber = Math.min(totalStayNights, Math.max(1, daysFromCheckin + 1));

  // Busca histórico de limpezas concluídas desta reserva/flat
  const pastCleanings = (db.cleaningRequests || []).filter(c =>
    (c.flatId === reservation.flatId || String(c.flatNumber) === String(reservation.flatNumber)) &&
    (c.status === "clean" || Boolean(c.completedAt)) &&
    c.requestDate >= reservation.checkinDate &&
    c.requestDate <= dateStr
  );

  // Última troca de cama
  const beddingCleanings = pastCleanings.filter(c => c.beddingChanged);
  beddingCleanings.sort((a, b) => (b.requestDate || "").localeCompare(a.requestDate || ""));
  const lastBeddingChangeDate = beddingCleanings[0]?.requestDate || reservation.lastBeddingChangeDate || reservation.checkinDate;
  const daysSinceBeddingChange = Math.max(0, Math.round((current - new Date(lastBeddingChangeDate)) / msPerDay));
  const needsBeddingChangeAlert = daysSinceBeddingChange >= 3;

  // Última troca de toalhas
  const towelCleanings = pastCleanings.filter(c => c.towelsChanged);
  towelCleanings.sort((a, b) => (b.requestDate || "").localeCompare(a.requestDate || ""));
  const lastTowelsChangeDate = towelCleanings[0]?.requestDate || reservation.lastTowelsChangeDate || reservation.checkinDate;
  const daysSinceTowelsChange = Math.max(0, Math.round((current - new Date(lastTowelsChangeDate)) / msPerDay));

  // Solicitações ativas do hóspede pelo portal B2B para a data consultada
  const activeLinenRequest = (reservation.linenRequests || []).find(lr =>
    lr.targetDate === dateStr && lr.status !== "cancelled"
  );
  const guestRequestedBedding = Boolean(activeLinenRequest && (activeLinenRequest.type === "bedding" || activeLinenRequest.type === "both"));
  const guestRequestedTowels = Boolean(activeLinenRequest && (activeLinenRequest.type === "towels" || activeLinenRequest.type === "both"));

  const doNotDisturb = Boolean(reservation.doNotDisturb);

  return {
    stayDayNumber,
    totalStayNights,
    lastBeddingChangeDate,
    daysSinceBeddingChange,
    needsBeddingChangeAlert,
    lastTowelsChangeDate,
    daysSinceTowelsChange,
    guestRequestedBedding,
    guestRequestedTowels,
    doNotDisturb
  };
}
```

---

## 7. Tarifação Stayover & Extrato das Camareiras (`maid-automation-service.mjs`)

Em `artifacts/api-server/maid-automation-service.mjs` (e `scripts/`):
- `db.cleaningRates`:
  ```json
  {
    "defaultRatePerRoom": 22.50,
    "defaultStayoverRatePerRoom": 15.00,
    "userRates": {
      "2": 22.50,
      "3": 22.50
    },
    "userStayoverRates": {
      "2": 15.00,
      "3": 15.00
    }
  }
  ```
- Em `syncMaidCredits(db, userId)`:
  - Identificar se `cleaning.cleaningType === "stayover"` ou `cleaning.source === "stayover"`.
  - Se stayover:
    `rate = db.cleaningRates?.userStayoverRates?.[userId] ?? db.cleaningRates?.defaultStayoverRatePerRoom ?? 15.00`
    `description = "Limpeza Stayover (Diária) — Flat ${flatNum}"`
  - Se checkout:
    `rate = db.cleaningRates?.userRates?.[userId] ?? db.cleaningRates?.defaultRatePerRoom ?? 22.50`
    `description = "Diária — Flat ${flatNum}"`
  - Na normalização de Setembro+ (linha 217), garantir que créditos de Stayover NÃO sejam sobrescritos para o valor de checkout.
- Em `getMaidPeriodFinances`:
  - Contabilizar separadamente:
    - `checkoutCount`, `stayoverCount`, `checkoutGrossAmount`, `stayoverGrossAmount`
    - `cleaningsCount = checkoutCount + stayoverCount`
    - `grossAmount = checkoutGrossAmount + stayoverGrossAmount`
- Em `/api/analytics/report` (`artifacts/api-server/demo-server.mjs`, linha 19003):
  - Retornar no payload discriminação de `checkoutCount`, `stayoverCount`, `checkoutRate`, `stayoverRate` e totais.

---

## 8. Portal do Hóspede B2B (`do-not-disturb` e `linen-request`)

Endpoints a adicionar em `demo-server.mjs`:
1. `POST /api/pms/guest-portal/:code/do-not-disturb`
   - Valida código e localiza reserva.
   - Se `!isB2BReservation(res)` -> Retorna `403 Forbidden` (`{ error: "Acesso restrito a hóspedes B2B corporativos." }`).
   - `res.doNotDisturb = Boolean(req.body.doNotDisturb);`
   - `res.doNotDisturbUpdatedAt = new Date().toISOString();`
   - `saveDatabase();`
   - Retorna `{ success: true, doNotDisturb: res.doNotDisturb }`.
2. `POST /api/pms/guest-portal/:code/linen-request`
   - Valida código e localiza reserva.
   - Se `!isB2BReservation(res)` -> Retorna `403 Forbidden`.
   - Lê `type` (`"bedding" | "towels" | "both"`).
   - Define data de agendamento: `targetDate = req.body.targetDate || getOffsetDateStr(1)`.
   - Se `targetDate >= res.checkoutDate` -> Retorna `400` ("Agendamento deve ser anterior ao check-out").
   - Registra em `res.linenRequests`:
     ```javascript
     if (!Array.isArray(res.linenRequests)) res.linenRequests = [];
     const reqObj = {
       id: `req_linen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
       type: req.body.type,
       targetDate,
       status: "pending",
       requestedAt: new Date().toISOString()
     };
     res.linenRequests.push(reqObj);
     saveDatabase();
     ```
   - Retorna `{ success: true, request: reqObj, scheduledDate: targetDate }`.
3. `POST /api/pms/guest-portal/:code/linen-request/:requestId/cancel`
   - Permite cancelar uma solicitação pendente.
4. `GET /api/pms/guest-portal/:code`:
   - Incorpora `b2bHousekeeping` somente para reservas onde `isB2BReservation(r)` é `true`.

---

## 9. Conclusão da Investigação
Todos os pontos levantados pelo orquestrador foram plenamente mapeados, localizados com números de linha exatos, e validados conceitualmente contra o banco de produção e as regras de negócio existentes. Nenhum código de produção foi alterado neste ciclo de exploração.
