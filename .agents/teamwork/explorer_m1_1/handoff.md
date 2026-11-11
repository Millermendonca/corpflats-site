# Handoff Report: Feature F1 — Maid Attribution (`resolveMaidCleaningForReservation`)

**Agent**: Explorer M1.1 (Maid Attribution Investigator)  
**Target Milestone**: M1 (Maid Attribution Engine)  
**Date**: 2026-11-10T02:15:00Z  

---

## 1. Observation

### 1.1 Contexto de Arquitetura e Contratos Existentes
- **`PROJECT.md` (Linhas 8-9, 53-56)**:
  > Feature 1: `F1_MAID_ATTRIBUTION`: Algoritmo determinístico de identificação da camareira da última limpeza correspondente à reserva avaliada.
  > Assinatura: `resolveMaidCleaningForReservation(db, reservation: object): { maidUser: object | null, cleaningRequest: object | null, cleaningDate: string | null, isStayover: boolean }`.
  > Invariante: Localiza a limpeza concluída (`status: "clean"`) correspondente à reserva avaliada, priorizando stayover executado durante a estadia ou a limpeza de preparação na data ou anterior ao check-in.

- **`artifacts/api-server/maid-automation-service.mjs` (Linhas 191-195, 263-270)**:
  A governança do CorpFlats padroniza filtros de limpezas válidas descartando tarefas operacionais não pagas ou instruções manuais:
  ```javascript
  const cleanings = (db.cleaningRequests || []).filter(r => {
    if (r.status !== "clean" || r.isBedAdjustmentOnly || r.isInstructionOnly || r.type === "instruction" || r.source === "manual_instruction" || r.isPaidCleaning === false) return false;
    if (r.id === 1 && (r.flatId === 22 || r.requestDate === "2026-09-01")) return false;
    return r.assignedUserId === userId;
  });
  ```
  A extração de data efetiva da limpeza é resolvida por:
  ```javascript
  const entryDate = cleaning.completedAt
    ? getExecutionDateStr(cleaning.completedAt)
    : (cleaning.effectiveDate || cleaning.requestDate);
  ```

- **`artifacts/api-server/maid-automation-service.mjs` (Linhas 661-678)**:
  Estrutura dos usuários camareiras (`db.users`):
  Cris (`id: 2`, `whatsapp: "5522988486446"`, `phone: "22988486446"`), Grazi (`id: 3`, `whatsapp: "5522999106204"`, `phone: "22999106204"`). A função `cleanWhatsAppPhone` de `zapi-service.mjs` é importada na linha 11 para higienizar números de WhatsApp para o padrão internacional.

- **`artifacts/api-server/demo-server.mjs` (Linhas 4464-4474)**:
  Desduplicação canônica de limpezas:
  ```javascript
  // 4. Desduplicação estrita: 1 único registro por flat por requestDate (preservando instruções avulsas)
  const uniqueSeen = new Set();
  db.cleaningRequests = db.cleaningRequests.filter(r => {
    if (!r) return false;
    const isInst = Boolean(r.isInstructionOnly || r.source === "manual_instruction" || r.type === "instruction" || r.type === "bed_adjustment_only" || r.isBedAdjustmentOnly);
    const key = isInst ? `${r.flatNumber || r.flatId}_${r.requestDate}_inst_${r.id}` : `${r.flatNumber || r.flatId}_${r.requestDate}_${r.status}`;
    if (uniqueSeen.has(key)) return false;
    uniqueSeen.add(key);
    return true;
  });
  ```
  Isso garante que em qualquer dia do calendário, para determinado apartamento, há no máximo 1 registro canônico de limpeza diária concluída (além de possíveis instruções manuais avulsas).

- **`artifacts/api-server/demo-server.mjs` (Linhas 3995-3996)**:
  O modelo de `cleaningRequests` prevê transições de hóspedes:
  `leavingGuest: "Sergio", arrivingGuest: "Leonardo"`.

---

## 2. Logic Chain

1. **Separação entre Hóspede que Sai e Hóspede que Chega (Same-Day Turnover)**:
   - Em um mesmo dia $D$, o Hóspede A realiza check-out às 11:00 e o Hóspede B realiza check-in às 14:00.
   - A limpeza realizada no dia $D$ entre 11:30 e 13:00 tem `requestDate: D` e `status: "clean"`.
   - Para o Hóspede B, a regra `requestDate <= checkinDate` ($D \le D$) é **VERDADEIRA**: esta limpeza preparou o quarto para o Hóspede B.
   - Para o Hóspede A (que deu check-in em $D - 5$ e check-out em $D$), a regra `requestDate <= checkinDate` ($D \le D - 5$) é **FALSA**: portanto, a limpeza de turnover do dia $D$ nunca é erroneamente atribuída ao Hóspede A que está saindo. O Hóspede A recebe a limpeza de preparação executada em $D - 5$ ou anterior (ou um stayover intermediário).

2. **Priorização de Stayover durante a Estadia**:
   - Se o hóspede teve uma limpeza de stayover (troca de toalhas/roupa de cama com arrumação do quarto) durante a sua estadia ($checkinDate \le cleaningDate \le checkoutDate$), o hóspede avalia a experiência mais recente e tangível vivenciada no quarto.
   - Portanto, a busca deve primeiro inspecionar se houve stayover concluído durante o período da reserva (`isStayover: true`). Se houver múltiplos stayovers, seleciona o mais recente por data/horário de conclusão.
   - Se não houver stayover, busca a última limpeza de preparação concluída com `requestDate <= checkinDate` (`isStayover: false`).

3. **Filtragem de Ruído (Instruções Manuais e Ajustes de Cama)**:
   - Ordens do tipo `isInstructionOnly: true`, `isBedAdjustmentOnly: true`, `type: "instruction"`, `source: "manual_instruction"` ou `isPaidCleaning === false` representam notas avulsas de supervisão ou manutenção simples, e não higienização do apartamento. Devem ser descartadas imediatamente da busca de atribuição.

4. **Tratamento de Dados Incompletos / Missing `assignedUserId`**:
   - Se `assignedUserId` for nulo no registro de limpeza:
     - *Fallback 1*: Inspeciona `db.maidStatementEntries` para verificar se já existe lançamento de crédito financeiro (`entryType: "credit"`) com `cleaningRequestId === cleaning.id` que possua `userId`.
     - *Fallback 2*: Inspeciona `assignedUsername`, `assignedUserName` ou `maidName` em `db.users` buscando correspondência insensível a maiúsculas/minúsculas.
     - *Fallback 3*: Caso nenhuma camareira seja resolvida no banco de usuários, retorna `maidUser: null`, mas preserva `cleaningRequest` e `cleaningDate`, garantindo transparência à auditoria do sistema.

5. **Tolerância a Diferentes Formatos de Entrada da Reserva**:
   - O parâmetro `reservation` pode ser fornecido como ID numérico, código de reserva (string), objeto simplificado (`{ id }`), objeto de review do NPS (`{ flatMentioned: "211", date: "2026-11-10" }`) ou o objeto completo de reserva. O algoritmo normaliza e busca em `db.reservations` e `db.flats` sempre que necessário.

---

## 3. Caveats

- **Premissa de Persistência em Memória**: O sistema opera sobre o objeto `db` em memória sincronizado com PostgreSQL/JSON via `saveDatabase()`. A função `resolveMaidCleaningForReservation` é estritamente de leitura (read-only), pura e sem efeitos colaterais (`idempotente`).
- **Lookback Histórico**: Quartos que ficaram vagos por muitos dias antes da entrada do hóspede terão a atribuição vinculada à última limpeza de check-out do hóspede anterior. Essa é a regra correta de hotelaria, pois foi exatamente aquela higienização que preparou o apartamento para a entrada atual.
- **Paridade Twin-Server Obrigatória**: Ao ser implementada pelo agente codificador, a função deve ser adicionada em `artifacts/api-server/maid-automation-service.mjs` e copiada integralmente para `scripts/maid-automation-service.mjs` mantendo paridade de hash SHA-256 byte a byte.

---

## 4. Conclusion & Concrete Specification

### 4.1 Código de Implementação Canônico

O seguinte bloco de código deve ser adicionado e exportado em `artifacts/api-server/maid-automation-service.mjs` (imediatamente antes de `initMaidAutomationEngine`):

```javascript
/**
 * Localiza de forma determinística a camareira e a limpeza concluída correspondente à reserva avaliada,
 * priorizando limpezas de stayover executadas durante a estadia ou a limpeza de preparação
 * na data ou anterior ao check-in.
 * 
 * @param {object} db - Instância do banco de dados em memória
 * @param {object|string|number} reservation - Objeto da reserva ou ID/código
 * @param {object} [options] - Opções de busca ({ preferStayover?: boolean })
 * @returns {{
 *   maidUser: { id: number, name: string, username: string, phone: string, whatsapp: string, pixKey?: string, role?: string } | null,
 *   cleaningRequest: { id: any, flatNumber: string, requestDate: string, effectiveDate?: string, status: string, [key: string]: any } | null,
 *   cleaningDate: string | null,
 *   isStayover: boolean
 * }}
 */
export function resolveMaidCleaningForReservation(db, reservation, options = {}) {
  const defaultReturn = {
    maidUser: null,
    cleaningRequest: null,
    cleaningDate: null,
    isStayover: false
  };

  if (!db || !reservation) return defaultReturn;

  const { preferStayover = true } = options;

  // 1. Normalização do objeto de reserva
  let resObj = reservation;
  if (typeof reservation === "string" || typeof reservation === "number") {
    resObj = (db.reservations || []).find(r =>
      String(r.id) === String(reservation) ||
      String(r.code) === String(reservation)
    ) || null;
    if (!resObj) return defaultReturn;
  }

  // Se o objeto fornecido estiver incompleto (ex: apenas { id }), busca em db.reservations
  if (resObj && (!resObj.flatNumber && !resObj.flatId) && Array.isArray(db.reservations)) {
    const fullRes = db.reservations.find(r =>
      (resObj.id && String(r.id) === String(resObj.id)) ||
      (resObj.code && String(r.code) === String(resObj.code))
    );
    if (fullRes) {
      resObj = { ...fullRes, ...resObj };
    }
  }

  // Se recebemos um objeto review/feedback com flatMentioned e date
  if (resObj && !resObj.checkinDate && !resObj.checkIn && resObj.flatMentioned && resObj.date) {
    const candidateRes = (db.reservations || []).find(r => {
      const fn = String(r.flatNumber || r.roomNumber || "");
      if (fn !== String(resObj.flatMentioned)) return false;
      const cIn = String(r.checkinDate || r.checkIn || "").substring(0, 10);
      const cOut = String(r.checkoutDate || r.checkOut || "").substring(0, 10);
      const rDate = String(resObj.date).substring(0, 10);
      return (cOut === rDate) || (cIn <= rDate && cOut >= rDate);
    });
    if (candidateRes) {
      resObj = { ...candidateRes, ...resObj };
    }
  }

  // 2. Extração e validação de datas da reserva
  const checkinRaw = resObj.checkinDate || resObj.checkIn || resObj.checkInDate || resObj.arrivalDate || resObj.startDate;
  const checkoutRaw = resObj.checkoutDate || resObj.checkOut || resObj.checkOutDate || resObj.departureDate || resObj.endDate || checkinRaw;
  
  if (!checkinRaw) return defaultReturn;

  const checkinDate = String(checkinRaw).trim().substring(0, 10);
  const checkoutDate = String(checkoutRaw).trim().substring(0, 10);

  // Resolução do flat correspondente
  const flatObj = (db.flats || []).find(f =>
    (resObj.flatId != null && f.id === Number(resObj.flatId)) ||
    (resObj.flatNumber != null && (String(f.number) === String(resObj.flatNumber) || String(f.id) === String(resObj.flatNumber)))
  );

  const flatNumber = String(
    resObj.flatNumber ||
    resObj.roomNumber ||
    flatObj?.number ||
    (resObj.flatId ? String(resObj.flatId) : "")
  ).trim();

  if (!flatNumber) return defaultReturn;

  const flatDigits = flatNumber.replace(/\D/g, "");
  const targetFlatId = flatObj ? flatObj.id : (resObj.flatId ? Number(resObj.flatId) : null);

  // Filtro de correspondência do flat
  const matchesFlat = (c) => {
    if (!c) return false;
    if (targetFlatId != null && (c.flatId === targetFlatId || Number(c.flatId) === targetFlatId)) return true;
    const cFlatNum = String(c.flatNumber || c.flatId || "").trim();
    if (cFlatNum === flatNumber) return true;
    const cDigits = cFlatNum.replace(/\D/g, "");
    if (cDigits && flatDigits && cDigits === flatDigits) return true;
    return false;
  };

  // Filtro de limpeza concluída válida (ignora instruções manuais, ajustes de cama e não pagas)
  const isValidCleaning = (c) => {
    if (!c) return false;
    if (c.status !== "clean") return false;
    if (c.isBedAdjustmentOnly || c.isInstructionOnly) return false;
    if (c.type === "instruction" || c.type === "bed_adjustment_only") return false;
    if (c.source === "manual_instruction") return false;
    if (c.isPaidCleaning === false) return false;
    if (c.id === 1 && (c.flatId === 22 || c.requestDate === "2026-09-01")) return false;
    return true;
  };

  // Helper de data de execução
  const getCleaningDate = (c) => {
    if (c.completedAt) return getExecutionDateStr(c.completedAt);
    if (c.effectiveDate) return String(c.effectiveDate).trim().substring(0, 10);
    if (c.requestDate) return String(c.requestDate).trim().substring(0, 10);
    if (c.createdAt) return getExecutionDateStr(c.createdAt);
    return "";
  };

  const cleaningsPool = (db.cleaningRequests || []).filter(c => matchesFlat(c) && isValidCleaning(c));

  let matchedCleaning = null;
  let isStayover = false;

  // 3. Etapa 1: Priorização de Stayover executado durante a estadia do hóspede
  if (preferStayover) {
    const stayoverCandidates = cleaningsPool.filter(c => {
      const isSt = c.cleaningType === "stayover" || c.source === "stayover" || c.type === "stayover";
      if (!isSt) return false;
      const cDate = getCleaningDate(c);
      if (!cDate) return false;
      return cDate >= checkinDate && cDate <= checkoutDate;
    });

    if (stayoverCandidates.length > 0) {
      stayoverCandidates.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        const dateA = getCleaningDate(a);
        const dateB = getCleaningDate(b);
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      matchedCleaning = stayoverCandidates[0];
      isStayover = true;
    }
  }

  // 4. Etapa 2: Limpeza de preparação do quarto (requestDate <= checkinDate)
  if (!matchedCleaning) {
    const prepCandidates = cleaningsPool.filter(c => {
      const isSt = c.cleaningType === "stayover" || c.source === "stayover" || c.type === "stayover";
      if (isSt) return false;
      const reqDate = String(c.requestDate || c.effectiveDate || getCleaningDate(c)).substring(0, 10);
      if (!reqDate) return false;
      return reqDate <= checkinDate;
    });

    if (prepCandidates.length > 0) {
      prepCandidates.sort((a, b) => {
        // Bônus para vínculo explícito de reserva ou hóspede que chega (arrivingGuest)
        const resCode = String(resObj.code || resObj.id || "").toLowerCase();
        const aCodeMatch = Boolean(resCode && (String(a.reservationCode || a.reservationId || "").toLowerCase() === resCode));
        const bCodeMatch = Boolean(resCode && (String(b.reservationCode || b.reservationId || "").toLowerCase() === resCode));
        if (aCodeMatch && !bCodeMatch) return -1;
        if (!aCodeMatch && bCodeMatch) return 1;

        const guestName = String(resObj.guestName || "").trim().toLowerCase();
        const aArrMatch = Boolean(guestName && a.arrivingGuest && String(a.arrivingGuest).trim().toLowerCase() === guestName);
        const bArrMatch = Boolean(guestName && b.arrivingGuest && String(b.arrivingGuest).trim().toLowerCase() === guestName);
        if (aArrMatch && !bArrMatch) return -1;
        if (!aArrMatch && bArrMatch) return 1;

        // Data mais recente
        const dateA = String(a.requestDate || a.effectiveDate || getCleaningDate(a)).substring(0, 10);
        const dateB = String(b.requestDate || b.effectiveDate || getCleaningDate(b)).substring(0, 10);
        if (dateA !== dateB) return dateB.localeCompare(dateA);

        // Horário de conclusão mais recente
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;

        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });

      matchedCleaning = prepCandidates[0];
      isStayover = false;
    }
  }

  if (!matchedCleaning) {
    return defaultReturn;
  }

  // 5. Resolução da Camareira responsável (com fallbacks para missing assignedUserId)
  let resolvedMaidUser = null;
  const cleaningDate = getCleaningDate(matchedCleaning);

  let maidId = matchedCleaning.assignedUserId != null ? Number(matchedCleaning.assignedUserId) : null;

  // Fallback 1: db.maidStatementEntries
  if (!maidId && Array.isArray(db.maidStatementEntries)) {
    const linkedEntry = db.maidStatementEntries.find(e => e.cleaningRequestId === matchedCleaning.id && e.userId);
    if (linkedEntry) {
      maidId = Number(linkedEntry.userId);
    }
  }

  // Busca do usuário em db.users
  let rawUser = null;
  if (maidId && Array.isArray(db.users)) {
    rawUser = db.users.find(u => Number(u.id) === maidId);
  }

  // Fallback 2: username ou assignedUserName
  if (!rawUser && Array.isArray(db.users)) {
    const rawMaidName = String(matchedCleaning.assignedUserName || matchedCleaning.assignedUsername || matchedCleaning.maidName || "").trim().toLowerCase();
    if (rawMaidName) {
      rawUser = db.users.find(u =>
        (u.username && u.username.toLowerCase() === rawMaidName) ||
        (u.name && u.name.toLowerCase() === rawMaidName)
      );
    }
  }

  if (rawUser) {
    const isCris = rawUser.id === 2 || (rawUser.username && rawUser.username.toLowerCase() === "cris");
    const isGrazi = rawUser.id === 3 || (rawUser.username && rawUser.username.toLowerCase() === "grazi");
    const rawWpp = rawUser.whatsapp || rawUser.phone || (isCris ? "5522988486446" : (isGrazi ? "5522999106204" : ""));
    const rawPhone = rawUser.phone || rawUser.whatsapp || (isCris ? "22988486446" : (isGrazi ? "22999106204" : ""));
    const cleanWpp = cleanWhatsAppPhone(rawWpp) || rawWpp;

    resolvedMaidUser = {
      id: rawUser.id,
      name: rawUser.name || rawUser.username || (isCris ? "Cris" : isGrazi ? "Grazi" : "Camareira"),
      username: rawUser.username || "",
      phone: rawPhone,
      whatsapp: cleanWpp,
      pixKey: rawUser.pixKey || (isCris ? "22988486446" : isGrazi ? "12977795766" : ""),
      role: rawUser.role || "camareira"
    };
  }

  return {
    maidUser: resolvedMaidUser,
    cleaningRequest: {
      id: matchedCleaning.id,
      flatNumber: String(matchedCleaning.flatNumber || flatNumber),
      requestDate: String(matchedCleaning.requestDate || cleaningDate),
      effectiveDate: String(matchedCleaning.effectiveDate || cleaningDate),
      status: matchedCleaning.status,
      completedAt: matchedCleaning.completedAt || null,
      cleaningType: matchedCleaning.cleaningType || (isStayover ? "stayover" : "checkout"),
      source: matchedCleaning.source || null,
      assignedUserId: matchedCleaning.assignedUserId || (resolvedMaidUser ? resolvedMaidUser.id : null),
      assignedUsername: matchedCleaning.assignedUsername || (resolvedMaidUser ? resolvedMaidUser.username : null)
    },
    cleaningDate,
    isStayover
  };
}
```

---

## 5. Verification Method

### 5.1 Casos de Teste Unitários Canônicos
Os testes abaixo devem ser incorporados na suíte pontual dedicada `tests/maid-review-ai-synthesis.test.mjs` (a ser executada isoladamente via `node --test tests/maid-review-ai-synthesis.test.mjs`):

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveMaidCleaningForReservation } from '../artifacts/api-server/maid-automation-service.mjs';

describe('Feature F1: resolveMaidCleaningForReservation (Maid Attribution Engine)', () => {
  const baseUsers = [
    { id: 2, username: 'cris', name: 'Cris', phone: '22988486446', role: 'camareira' },
    { id: 3, username: 'grazi', name: 'Grazi', phone: '22999106204', role: 'camareira' }
  ];

  it('1. Limpeza padrão de preparação no dia do check-in', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        { id: 101, flatNumber: '211', requestDate: '2026-11-10', status: 'clean', assignedUserId: 2, completedAt: '2026-11-10T12:00:00Z' }
      ]
    };
    const res = { id: 'res-1', flatNumber: '211', checkinDate: '2026-11-10', checkoutDate: '2026-11-15' };
    const result = resolveMaidCleaningForReservation(db, res);

    assert.strictEqual(result.isStayover, false);
    assert.strictEqual(result.cleaningDate, '2026-11-10');
    assert.strictEqual(result.maidUser?.id, 2);
    assert.strictEqual(result.maidUser?.name, 'Cris');
    assert.strictEqual(result.cleaningRequest?.id, 101);
  });

  it('2. Priorização de stayover executado durante a estadia', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        // Preparação inicial por Cris
        { id: 101, flatNumber: '211', requestDate: '2026-11-10', status: 'clean', assignedUserId: 2, completedAt: '2026-11-10T11:00:00Z' },
        // Stayover no dia 12 por Grazi
        { id: 102, flatNumber: '211', requestDate: '2026-11-12', cleaningType: 'stayover', status: 'clean', assignedUserId: 3, completedAt: '2026-11-12T14:30:00Z' }
      ]
    };
    const res = { id: 'res-1', flatNumber: '211', checkinDate: '2026-11-10', checkoutDate: '2026-11-15' };
    const result = resolveMaidCleaningForReservation(db, res);

    assert.strictEqual(result.isStayover, true);
    assert.strictEqual(result.cleaningDate, '2026-11-12');
    assert.strictEqual(result.maidUser?.id, 3);
    assert.strictEqual(result.maidUser?.name, 'Grazi');
    assert.strictEqual(result.cleaningRequest?.id, 102);
  });

  it('3. Same-Day Turnover: isolamento estrito entre hóspede que sai e hóspede que entra', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        // Limpeza de 5 dias atrás que preparou para o Hóspede A
        { id: 90, flatNumber: '313', requestDate: '2026-11-05', status: 'clean', assignedUserId: 2, completedAt: '2026-11-05T12:00:00Z' },
        // Turnover no dia 10 que preparou para o Hóspede B
        { id: 95, flatNumber: '313', requestDate: '2026-11-10', status: 'clean', assignedUserId: 3, arrivingGuest: 'Hospede B', completedAt: '2026-11-10T13:30:00Z' }
      ]
    };

    const resHospedeA = { id: 'res-A', flatNumber: '313', checkinDate: '2026-11-05', checkoutDate: '2026-11-10', guestName: 'Hospede A' };
    const resHospedeB = { id: 'res-B', flatNumber: '313', checkinDate: '2026-11-10', checkoutDate: '2026-11-14', guestName: 'Hospede B' };

    const resultA = resolveMaidCleaningForReservation(db, resHospedeA);
    const resultB = resolveMaidCleaningForReservation(db, resHospedeB);

    // Hóspede A recebe a limpeza de Nov 5 (Cris), NÃO a de Nov 10
    assert.strictEqual(resultA.maidUser?.id, 2);
    assert.strictEqual(resultA.cleaningDate, '2026-11-05');
    assert.strictEqual(resultA.cleaningRequest?.id, 90);

    // Hóspede B recebe a limpeza de Nov 10 (Grazi)
    assert.strictEqual(resultB.maidUser?.id, 3);
    assert.strictEqual(resultB.cleaningDate, '2026-11-10');
    assert.strictEqual(resultB.cleaningRequest?.id, 95);
  });

  it('4. Quarto vago limpo dias antes da data de check-in', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        { id: 200, flatNumber: '405', requestDate: '2026-11-02', status: 'clean', assignedUserId: 2, completedAt: '2026-11-02T16:00:00Z' }
      ]
    };
    const res = { id: 'res-vago', flatNumber: '405', checkinDate: '2026-11-06', checkoutDate: '2026-11-10' };
    const result = resolveMaidCleaningForReservation(db, res);

    assert.strictEqual(result.maidUser?.id, 2);
    assert.strictEqual(result.cleaningDate, '2026-11-02');
  });

  it('5. Descarte de instruções manuais e tarefas sem higienização', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        // Limpeza real no dia 09
        { id: 301, flatNumber: '501', requestDate: '2026-11-09', status: 'clean', assignedUserId: 2 },
        // Instrução manual avulsa no dia 10
        { id: 302, flatNumber: '501', requestDate: '2026-11-10', status: 'clean', isInstructionOnly: true, assignedUserId: 3 }
      ]
    };
    const res = { id: 'res-inst', flatNumber: '501', checkinDate: '2026-11-10', checkoutDate: '2026-11-12' };
    const result = resolveMaidCleaningForReservation(db, res);

    // Deve ignorar a instrução 302 da Grazi e pegar a limpeza real 301 da Cris
    assert.strictEqual(result.cleaningRequest?.id, 301);
    assert.strictEqual(result.maidUser?.id, 2);
  });

  it('6. Recuperação de missing assignedUserId via username ou maidStatementEntries', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        { id: 401, flatNumber: '601', requestDate: '2026-11-10', status: 'clean', assignedUserId: null, assignedUsername: 'grazi' }
      ]
    };
    const res = { id: 'res-rec', flatNumber: '601', checkinDate: '2026-11-10' };
    const result = resolveMaidCleaningForReservation(db, res);

    assert.strictEqual(result.maidUser?.id, 3);
    assert.strictEqual(result.maidUser?.username, 'grazi');
  });

  it('7. Quarto sem camareira atribuída retorna maidUser nulo de forma graciosa', () => {
    const db = {
      users: baseUsers,
      cleaningRequests: [
        { id: 501, flatNumber: '701', requestDate: '2026-11-10', status: 'clean', assignedUserId: null }
      ]
    };
    const res = { id: 'res-orphan', flatNumber: '701', checkinDate: '2026-11-10' };
    const result = resolveMaidCleaningForReservation(db, res);

    assert.strictEqual(result.maidUser, null);
    assert.strictEqual(result.cleaningRequest?.id, 501);
    assert.strictEqual(result.cleaningDate, '2026-11-10');
  });

  it('8. Nenhuma limpeza encontrada retorna objeto padrão nulo sem estourar exceção', () => {
    const db = { users: baseUsers, cleaningRequests: [] };
    const res = { id: 'res-empty', flatNumber: '999', checkinDate: '2026-11-10' };
    const result = resolveMaidCleaningForReservation(db, res);

    assert.strictEqual(result.maidUser, null);
    assert.strictEqual(result.cleaningRequest, null);
    assert.strictEqual(result.cleaningDate, null);
    assert.strictEqual(result.isStayover, false);
  });
});
```

### 5.2 Execução de Testes Autorizada
Quando o código for aplicado, rodar estritamente o teste pontual da funcionalidade:
```powershell
node --test tests/maid-review-ai-synthesis.test.mjs
```

### 5.3 Condição de Invalidação
A especificação seria invalidada se a governança do hotel exigisse que avaliações pós-checkout de estadias sem stayover fossem atribuídas à camareira que limpa o quarto *depois* da saída do hóspede. Como comprovado pela regra de negócio e pelos critérios de aceite do projeto, o hóspede avalia o estado em que encontrou o quarto e o serviço prestado durante sua permanência, tornando a atribuição à limpeza de preparação e a stayovers intermediários 100% canônica e determinística.
