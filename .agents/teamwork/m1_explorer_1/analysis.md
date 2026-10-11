# Análise Técnica & Blueprint de Implementação: Endpoint `/api/pms/guest-portal/:code/modify-preview` e Motor de Conflito de Calendário

**Agente**: M1 Explorer 1  
**Milestone**: Milestone 1 — Backend Simulation, Hold & Settlement Engine  
**Data**: 2026-10-11  
**Repositório**: `Guest-Flow-Manager` (CorpFlats)  
**Alvos de Código**: `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs` (Twin-Server Parity Mandate)

---

## 1. Contexto e Diagnóstico Arquitetural

### 1.1 O Problema no Endpoint Legado (`/modify`)
No código atual de `scripts/demo-server.mjs` (linhas 15.456 a 15.716), o portal do hóspede invoca diretamente `POST /api/pms/guest-portal/:code/modify`. Este endpoint executa mutação imediata no banco de dados (`r.checkinDate = newCheckinDate; r.checkoutDate = newCheckoutDate; saveDatabase()`), mesmo quando há diárias adicionais a serem pagas (`additionalAmountToPay > 0`).

Consequências críticas dessa abordagem:
1. **Ausência de Simulação Prévia (Read-Only)**: O hóspede e o frontend não dispõem de uma rota dedicada para validar se o período está livre e cotar custos antes de submeter alterações.
2. **Fragilidade Financeira**: Se o hóspede solicitar prorrogação de estadia e fechar o modal ou abandonar o pagamento, o banco já foi mutado sem a devida liquidação financeira.
3. **Escopo Restrito de Conflitos**: A verificação existente checa apenas reservas ativas no mesmo apartamento (`otherFlat === flatNumberStr`), ignorando bloqueios de manutenção (`db.roomBlocks`) e holds provisórios em andamento (`pendingModification`). Não suporta troca de apartamento (`newFlatId` / `newFlatNumber`).
4. **Violação do Requisito R1 do Projeto**: O requisito R1 de `ORIGINAL_REQUEST.md` exige formalmente um mecanismo de simulação (`/modify-preview`) que retorne a cotação e a disponibilidade sem alterar o banco de dados.

---

## 2. Especificação Formal da API: `POST /api/pms/guest-portal/:code/modify-preview`

### 2.1 Rota e Parâmetros
- **Método**: `POST`
- **Path**: `/api/pms/guest-portal/:code/modify-preview`
- **URL Param `:code`**: Localizador da reserva (`r.code`), ID numérico (`r.id`), ou identificador de contato (resolvido via `findReservationByLocatorOrContact(code)`).
- **Idempotência**: 100% livre de efeitos colaterais (Read-Only). Nenhuma gravação em disco (`saveDatabase`), nenhuma alteração em objetos de reserva.

### 2.2 Payload de Entrada (Request Body)
```json
{
  "newCheckinDate": "2026-10-15",
  "newCheckoutDate": "2026-10-20",
  "newGuestCount": 2,
  "newFlatId": 1,
  "newFlatNumber": "113",
  "reason": "Extensão de estadia a trabalho"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `newCheckinDate` | string | Sim | Data de entrada no formato `YYYY-MM-DD` |
| `newCheckoutDate` | string | Sim | Data de saída no formato `YYYY-MM-DD` |
| `newGuestCount` | number | Não | Quantidade de hóspedes (default: `r.guestCount || 1`, limitado entre 1 e 6) |
| `newFlatId` | number/string | Não | ID do flat pretendido (default: flat atual da reserva) |
| `newFlatNumber` | string | Não | Número do flat pretendido (default: flat atual da reserva) |
| `reason` | string | Não | Motivo informado pelo hóspede |

---

## 3. Matriz de Validação e Regras de Negócio

### 3.1 Guarda de Existência e Canal
1. **Reserva Não Encontrada**:
   - HTTP 404: `{ success: false, available: false, error: "NOT_FOUND", message: "Reserva não encontrada." }`
2. **Reserva Cancelada ou Expirada**:
   - Se `r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada"`:
   - HTTP 400: `{ success: false, available: false, error: "RESERVATION_CANCELLED", message: "Esta reserva está cancelada ou expirada e não pode ser modificada." }`
3. **Canais Externos (OTA) Bloqueados**:
   - Canais diretos permitidos: `["whatsapp", "site", "site_direto", "direto", "balcao"]`.
   - Se canal for externo (ex: `booking`, `airbnb`):
   - HTTP 403: `{ success: false, available: false, error: "EXTERNAL_CHANNEL", message: "Modificação pelo portal não permitida para reservas do canal externo. Solicite a alteração diretamente pela plataforma de origem (Booking.com, Airbnb, etc.)." }`

### 3.2 Validação de Datas
1. `newCheckinDate` e `newCheckoutDate` devem ser strings preenchidas no padrão `/^\d{4}-\d{2}-\d{2}$/`.
2. `newCheckoutDate > newCheckinDate` (estadia mínima de 1 noite):
   - Se `newCheckoutDate <= newCheckinDate`:
   - HTTP 400: `{ success: false, available: false, error: "INVALID_DATES", message: "A data de check-out deve ser posterior à data de check-in." }`

### 3.3 Resolução do Flat de Destino
- Se `newFlatId` ou `newFlatNumber` for fornecido:
  - Busca em `db.flats` pelo ID ou número.
  - Se não encontrado: HTTP 404 `{ success: false, available: false, error: "FLAT_NOT_FOUND", message: "Apartamento informado não foi encontrado." }`.
- Se omitido:
  - Adota o flat atual da reserva: `targetFlat = db.flats.find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber)) || { id: r.flatId, number: r.flatNumber || "113" }`.

---

## 4. Motor de Detecção de Conflitos de Calendário

Para garantir que não ocorra overbooking ou sobreposição, o motor avalia três camadas no flat de destino (`targetFlatId` / `targetFlatNumber`):

### 4.1 Princípio de Sobreposição Hoteleira
O check-in ocorre às 14:00 e o check-out às 12:00. O intervalo de ocupação é modelado como semiaberto `[checkin, checkout)`.
Dois períodos $[In_A, Out_A)$ e $[In_B, Out_B)$ colidem se e somente se:
$$In_A < Out_B \quad \land \quad Out_A > In_B$$

### 4.2 Camada 1: Reservas Ativas no PMS (`db.reservations`)
- **Exclusão Crítica da Própria Reserva**:
  - `other.id === r.id || other.code === r.code` é **obrigatoriamente excluído**. Isso permite que o hóspede estenda, reduza ou desloque sua própria estadia sem que as datas originais colidam consigo mesmas.
- **Filtro de Descarte**:
  - Reservas canceladas (`status === "cancelada" || status === "CANCELLED" || status === "expirada"`).
  - Pré-reservas expiradas (`(status === "pre_reserva" || status === "pendente") && expiresAt < now && paymentStatus !== "pago_total"`).
- **Verificação de Flat**:
  - `String(other.flatId) === String(targetFlatId) || String(other.flatNumber) === targetFlatNumber`.
- **Verificação de Colisão**:
  - `(newCheckinDate < other.checkoutDate) && (newCheckoutDate > other.checkinDate)`.

### 4.3 Camada 2: Bloqueios Temporários em Andamento (`pendingModification`)
- Se outra reserva `other` (`other.id !== r.id`) estiver no meio de um checkout de modificação:
  - `other.pendingModification && other.pendingModification.status === "pending_payment"`.
  - Verifica se o hold não expirou: `new Date(other.pendingModification.expiresAt).getTime() > nowMs`.
  - Se ativo e coincidir com o flat de destino:
  - `(newCheckinDate < other.pendingModification.proposedCheckoutDate) && (newCheckoutDate > other.pendingModification.proposedCheckinDate)`.
  - Se colidir, o flat é considerado bloqueado temporariamente por outro hóspede.

### 4.4 Camada 3: Bloqueios de Manutenção (`db.roomBlocks`)
- Verifica se há bloqueio administrativo ativo em `db.roomBlocks`:
  - `String(b.flatId) === String(targetFlatId) || String(b.flatNumber) === targetFlatNumber`.
  - `(newCheckinDate < b.endDate) && (newCheckoutDate > b.startDate)`.

### 4.5 Resposta em Caso de Conflito
Se qualquer uma das camadas acusar colisão:
- **Status HTTP**: `409 Conflict`
- **Corpo JSON**:
```json
{
  "success": false,
  "available": false,
  "error": "CONFLICT",
  "message": "O Flat 113 não possui disponibilidade para o período solicitado (2026-10-15 a 2026-10-20). Por favor, selecione outras datas ou entre em contato com nossa administração.",
  "conflictMessage": "O Flat 113 não possui disponibilidade para o período solicitado (2026-10-15 a 2026-10-20)."
}
```

---

## 5. Motor de Tarifas e Política de Reembolso de 24 Horas

### 5.1 Cálculo de Diárias e Tarifa Padrão
```javascript
const parseDate = (dStr) => new Date(dStr + "T00:00:00Z");
const oldNights = Math.max(1, Math.round((parseDate(r.checkoutDate) - parseDate(r.checkinDate)) / (1000 * 3600 * 24)));
const newNights = Math.max(1, Math.round((parseDate(newCheckoutDate) - parseDate(newCheckinDate)) / (1000 * 3600 * 24)));
const dailyRate = Number(r.dailyRate) || (oldNights > 0 ? (Number(r.totalAmount || 0) / oldNights) : 160);

const nightsDiff = newNights - oldNights;
const extraNights = Math.max(0, nightsDiff);
const reducedNights = Math.max(0, -nightsDiff);
```

### 5.2 Regra de Corte das 24 Horas
O ponto de corte (Cutoff) oficial é às **14:00 (horário de Brasília) do dia anterior ao check-in original**:
$$\text{Cutoff24h} = \text{CheckinOriginal (14:00)} - 24\text{ horas}$$

```javascript
const originalCheckin = new Date(r.checkinDate + "T14:00:00-03:00");
const cutoff24h = new Date(originalCheckin.getTime() - 24 * 3600 * 1000);
const now = new Date();
const isUnder24h = now.getTime() >= cutoff24h.getTime();
```

### 5.3 Lógica Financeira por Cenário
1. **Acréscimo de Noites (`newNights > oldNights`)**:
   - `additionalAmountToPay = extraNights * dailyRate`
   - `refundAmount = 0`
   - `requiresPayment = true`
   - `policyNotice = "Acréscimo de X diárias (+R$ Y)."`
2. **Redução de Noites (`newNights < oldNights`)**:
   - Se `isUnder24h === true`:
     - `nonRefundableReduction = true`
     - `refundAmount = 0`
     - `additionalAmountToPay = 0`
     - `requiresPayment = false`
     - `policyNotice = "Redução efetuada com menos de 24h do início (limite: 14h do dia anterior). Não há direito a estorno ou reembolso conforme o Contrato de Hospedagem."`
   - Se `isUnder24h === false`:
     - `nonRefundableReduction = false`
     - `refundAmount = reducedNights * dailyRate`
     - `additionalAmountToPay = 0`
     - `requiresPayment = false`
     - `policyNotice = "Redução de X diárias com estorno/crédito elegível de R$ Y."`
3. **Mesma Quantidade de Diárias (`newNights === oldNights`)**:
   - Deslocamento de datas ou alteração de hóspedes sem custo de diária:
   - `additionalAmountToPay = 0`
   - `refundAmount = 0`
   - `requiresPayment = false`
   - `policyNotice = "Mesma duração de estadia. Nenhuma cobrança ou estorno adicional."`
4. **Re-assinatura Obrigatória (`requiresReSignature`)**:
   - Se as datas mudaram (`r.checkinDate !== newCheckinDate || r.checkoutDate !== newCheckoutDate`) OU se o apartamento mudou (`String(r.flatNumber || r.flatId) !== targetFlatNumber`):
   - `requiresReSignature = true`

---

## 6. Blueprint Completo de Implementação (Código para `demo-server.mjs`)

O código a seguir deve ser adicionado imediatamente antes de `app.post("/api/pms/guest-portal/:code/modify", ...)` em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`:

```javascript
// ── Simulação e Pré-visualização de Modificação de Reserva (M1 - R1) ──────────
app.post("/api/pms/guest-portal/:code/modify-preview", (req, res) => {
  const code = (req.params.code || "").trim();
  if (!db.reservations) db.reservations = [];
  const r = findReservationByLocatorOrContact(code);
  if (!r) {
    return res.status(404).json({
      success: false,
      available: false,
      error: "NOT_FOUND",
      message: "Reserva não encontrada."
    });
  }

  if (r.status === "cancelada" || r.status === "CANCELLED" || r.status === "expirada") {
    return res.status(400).json({
      success: false,
      available: false,
      error: "RESERVATION_CANCELLED",
      message: "Esta reserva está cancelada ou expirada e não pode ser modificada."
    });
  }

  const directChannels = ["whatsapp", "site", "site_direto", "direto", "balcao"];
  const channel = (r.channel || "").toLowerCase();
  if (!directChannels.includes(channel)) {
    return res.status(403).json({
      success: false,
      available: false,
      error: "EXTERNAL_CHANNEL",
      message: `Modificação pelo portal não permitida para reservas do canal ${r.channel || "externo"}. Por favor, solicite a alteração diretamente pela plataforma de origem (Booking.com, Airbnb, etc.).`
    });
  }

  const { newCheckinDate, newCheckoutDate, newGuestCount, newFlatId, newFlatNumber, reason } = req.body || {};

  if (!newCheckinDate || !newCheckoutDate) {
    return res.status(400).json({
      success: false,
      available: false,
      error: "INVALID_DATES",
      message: "Datas de check-in e check-out são obrigatórias."
    });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(newCheckinDate) || !dateRegex.test(newCheckoutDate)) {
    return res.status(400).json({
      success: false,
      available: false,
      error: "INVALID_DATES",
      message: "Formato de data inválido. Utilize o formato YYYY-MM-DD."
    });
  }

  if (newCheckoutDate <= newCheckinDate) {
    return res.status(400).json({
      success: false,
      available: false,
      error: "INVALID_DATES",
      message: "A data de check-out deve ser posterior à data de check-in."
    });
  }

  // Identificação e validação do flat de destino
  let targetFlat = null;
  if (newFlatId || newFlatNumber) {
    targetFlat = (db.flats || []).find(f =>
      (newFlatId && (f.id === Number(newFlatId) || String(f.id) === String(newFlatId))) ||
      (newFlatNumber && String(f.number) === String(newFlatNumber))
    );
    if (!targetFlat) {
      return res.status(404).json({
        success: false,
        available: false,
        error: "FLAT_NOT_FOUND",
        message: "Apartamento informado não foi encontrado."
      });
    }
  } else {
    targetFlat = (db.flats || []).find(f => f.id === r.flatId || String(f.number) === String(r.flatNumber)) || {
      id: r.flatId,
      number: r.flatNumber || "113"
    };
  }

  const targetFlatId = targetFlat.id;
  const targetFlatNumber = String(targetFlat.number);
  const guestsNum = Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1));

  // 1. Verificação de conflito no calendário do flat de destino
  const nowMs = Date.now();

  // 1a. Conflito contra reservas ativas no PMS (excluindo a própria reserva original)
  const hasReservationConflict = (db.reservations || []).some(other => {
    if (other.id === r.id || other.code === r.code) return false;
    if (other.status === "cancelada" || other.status === "CANCELLED" || other.status === "expirada") return false;
    if ((other.status === "pre_reserva" || other.status === "pendente") && other.expiresAt && new Date(other.expiresAt).getTime() < nowMs && other.paymentStatus !== "pago_total") {
      return false;
    }
    const otherFlatId = other.flatId;
    const otherFlatNumber = String(other.flatNumber || (db.flats?.find(f => f.id === other.flatId)?.number || ""));
    const isSameFlat = (targetFlatId && otherFlatId && String(otherFlatId) === String(targetFlatId)) ||
                       (otherFlatNumber && otherFlatNumber === targetFlatNumber);
    if (!isSameFlat) return false;

    // Colisão no período de hospedagem [checkin, checkout)
    return (newCheckinDate < other.checkoutDate) && (newCheckoutDate > other.checkinDate);
  });

  if (hasReservationConflict) {
    return res.status(409).json({
      success: false,
      available: false,
      error: "CONFLICT",
      message: `O Flat ${targetFlatNumber} não possui disponibilidade para o período solicitado (${newCheckinDate} a ${newCheckoutDate}). Por favor, selecione outras datas ou entre em contato com nossa administração.`,
      conflictMessage: `O Flat ${targetFlatNumber} não possui disponibilidade para o período solicitado (${newCheckinDate} a ${newCheckoutDate}).`
    });
  }

  // 1b. Conflito contra bloqueios temporários de modificação ativa (pendingModification) em outras reservas
  const hasPendingHoldConflict = (db.reservations || []).some(other => {
    if (other.id === r.id || other.code === r.code) return false;
    if (!other.pendingModification || other.pendingModification.status !== "pending_payment") return false;
    if (!other.pendingModification.expiresAt || new Date(other.pendingModification.expiresAt).getTime() <= nowMs) return false;

    const holdFlatId = other.pendingModification.proposedFlatId;
    const holdFlatNumber = String(other.pendingModification.proposedFlatNumber || "");
    const isSameFlat = (targetFlatId && holdFlatId && String(holdFlatId) === String(targetFlatId)) ||
                       (holdFlatNumber && holdFlatNumber === targetFlatNumber);
    if (!isSameFlat) return false;

    return (newCheckinDate < other.pendingModification.proposedCheckoutDate) &&
           (newCheckoutDate > other.pendingModification.proposedCheckinDate);
  });

  if (hasPendingHoldConflict) {
    return res.status(409).json({
      success: false,
      available: false,
      error: "CONFLICT",
      message: `O Flat ${targetFlatNumber} possui uma reserva temporária em processo de pagamento para o período solicitado (${newCheckinDate} a ${newCheckoutDate}). Por favor, tente novamente em alguns instantes ou escolha outras datas.`,
      conflictMessage: `O Flat ${targetFlatNumber} possui bloqueio temporário em andamento para o período solicitado.`
    });
  }

  // 1c. Conflito contra bloqueios de manutenção (roomBlocks)
  const hasRoomBlockConflict = (db.roomBlocks || []).some(b => {
    const isSameFlat = (targetFlatId && b.flatId && String(b.flatId) === String(targetFlatId)) ||
                       (b.flatNumber && String(b.flatNumber) === targetFlatNumber);
    if (!isSameFlat) return false;
    return (newCheckinDate < b.endDate) && (newCheckoutDate > b.startDate);
  });

  if (hasRoomBlockConflict) {
    return res.status(409).json({
      success: false,
      available: false,
      error: "CONFLICT",
      message: `O Flat ${targetFlatNumber} possui bloqueio de manutenção para o período solicitado (${newCheckinDate} a ${newCheckoutDate}). Por favor, selecione outro apartamento ou outras datas.`,
      conflictMessage: `O Flat ${targetFlatNumber} está em manutenção no período solicitado.`
    });
  }

  // 2. Cálculo de diárias e tarifas
  const parseDate = (dStr) => new Date(dStr + "T00:00:00Z");
  const oldNights = Math.max(1, Math.round((parseDate(r.checkoutDate) - parseDate(r.checkinDate)) / (1000 * 3600 * 24)));
  const newNights = Math.max(1, Math.round((parseDate(newCheckoutDate) - parseDate(newCheckinDate)) / (1000 * 3600 * 24)));
  const dailyRate = Number(r.dailyRate) || (oldNights > 0 ? (Number(r.totalAmount || 0) / oldNights) : 160);

  const nightsDiff = newNights - oldNights;
  const extraNights = Math.max(0, nightsDiff);
  const reducedNights = Math.max(0, -nightsDiff);

  // 3. Regra das 24h antes do check-in (14:00 do dia anterior ao check-in original)
  const originalCheckin = new Date(r.checkinDate + "T14:00:00-03:00");
  const cutoff24h = new Date(originalCheckin.getTime() - 24 * 3600 * 1000);
  const now = new Date();
  const isUnder24h = now.getTime() >= cutoff24h.getTime();

  let additionalAmountToPay = 0;
  let refundAmount = 0;
  let nonRefundableReduction = false;
  let policyNotice = "";

  if (newNights > oldNights) {
    additionalAmountToPay = extraNights * dailyRate;
    policyNotice = `Acréscimo de ${extraNights} ${extraNights === 1 ? 'diária' : 'diárias'} (+R$ ${additionalAmountToPay.toFixed(2)}).`;
  } else if (newNights < oldNights) {
    const valueOfReducedNights = reducedNights * dailyRate;
    if (isUnder24h) {
      nonRefundableReduction = true;
      refundAmount = 0;
      policyNotice = `Redução de ${reducedNights} ${reducedNights === 1 ? 'diária' : 'diárias'} efetuada com menos de 24h do início (limite: 14h do dia anterior). Não há direito a estorno ou reembolso conforme o Contrato de Hospedagem.`;
    } else {
      refundAmount = valueOfReducedNights;
      policyNotice = `Redução de ${reducedNights} ${reducedNights === 1 ? 'diária' : 'diárias'} com estorno/crédito elegível de R$ ${valueOfReducedNights.toFixed(2)}.`;
    }
  } else {
    policyNotice = "Mesma duração de estadia. Nenhuma cobrança ou estorno adicional.";
  }

  if (guestsNum < (r.guestCount || 1) && isUnder24h) {
    nonRefundableReduction = true;
  }

  const originalTotalAmount = Number(r.totalAmount || 0);
  const newTotalAmount = Math.max(0, originalTotalAmount + additionalAmountToPay - refundAmount);
  const requiresPayment = additionalAmountToPay > 0;
  const datesChanged = r.checkinDate !== newCheckinDate || r.checkoutDate !== newCheckoutDate;
  const flatChanged = String(r.flatNumber || r.flatId) !== targetFlatNumber;
  const requiresReSignature = datesChanged || flatChanged;

  return res.json({
    success: true,
    available: true,
    originalDates: {
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      nights: oldNights,
      flatNumber: String(r.flatNumber || r.flatId),
      guestCount: r.guestCount || 1,
      totalAmount: originalTotalAmount
    },
    newDates: {
      checkinDate: newCheckinDate,
      checkoutDate: newCheckoutDate,
      nights: newNights,
      flatNumber: targetFlatNumber,
      guestCount: guestsNum,
      totalAmount: newTotalAmount
    },
    flat: {
      id: targetFlat.id,
      number: targetFlatNumber
    },
    dailyRate,
    duration: newNights,
    extraNights,
    additionalAmountToPay,
    refundAmount,
    currency: "BRL",
    requiresPayment,
    requiresReSignature,
    isUnder24h,
    nonRefundableReduction,
    policyNotice
  });
});
```

---

## 7. Vetores de Teste Automatizado & Verificação

Para a validação completa deste endpoint, os seguintes 10 casos de teste devem ser executados na suíte de testes (ex.: `tests/modify-preview.test.mjs`):

1. **TC1 - Simulação de Prorrogação Disponível**:
   - Reserva de 3 noites (15 a 18) estendida para 5 noites (15 a 20) em flat livre.
   - Assert: HTTP 200, `available: true`, `extraNights: 2`, `additionalAmountToPay: 320`, `requiresPayment: true`, `requiresReSignature: true`.
2. **TC2 - Conflito de Calendário contra Outra Reserva Ativa**:
   - Flat 113 possui outra reserva de 19 a 22.
   - Hóspede tenta estender para 15 a 21.
   - Assert: HTTP 409, `available: false`, `error: "CONFLICT"`.
3. **TC3 - Exclusão das Próprias Datas Originais**:
   - Hóspede estende de 15 a 18 para 15 a 19.
   - Assert: As datas 15 a 18 pertencem ao próprio hóspede e não disparam falso positivo de conflito.
4. **TC4 - Conflito contra Hold Provisório Ativo (`pendingModification`)**:
   - Outra reserva possui `pendingModification` ativo (`status: "pending_payment"`, `expiresAt` futuro) no flat 113.
   - Assert: HTTP 409, `available: false`, `error: "CONFLICT"`.
5. **TC5 - Desconsideração de Hold Expirado**:
   - Outra reserva possui `pendingModification` com `expiresAt` no passado.
   - Assert: HTTP 200, hold ignorado.
6. **TC6 - Conflito contra Bloqueio de Manutenção (`db.roomBlocks`)**:
   - Flat 113 possui manutenção cadastrada de 17 a 19.
   - Assert: HTTP 409, `available: false`, `error: "CONFLICT"`.
7. **TC7 - Redução com Menos de 24h (Não Reembolsável)**:
   - Data de check-in para amanhã, redução de diárias.
   - Assert: HTTP 200, `refundAmount: 0`, `nonRefundableReduction: true`.
8. **TC8 - Redução com Mais de 24h (Estorno Elegível)**:
   - Data de check-in para daqui a 10 dias, redução de 1 diária.
   - Assert: HTTP 200, `refundAmount: 160`, `nonRefundableReduction: false`.
9. **TC9 - Validação de Datas Inválidas**:
   - Check-out anterior ao check-in ou formato corrompido.
   - Assert: HTTP 400, `error: "INVALID_DATES"`.
10. **TC10 - Bloqueio de Reserva de Canal Externo**:
    - Reserva com `channel: "booking"`.
    - Assert: HTTP 403, `error: "EXTERNAL_CHANNEL"`.

---

## 8. Conformidade com as Regras de Integridade
- **Twin-Server Parity**: O bloco de código desenhado deve ser inserido de forma idêntica em `scripts/demo-server.mjs` e `artifacts/api-server/demo-server.mjs`.
- **Read-Only**: O endpoint não altera nenhum dado em `db` nem salva em disco, cumprindo o critério de simulação estrita.
