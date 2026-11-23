import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  formatShortBrDate,
  resolveEffectiveCheckoutDate,
  resolveLeavingGuestLabel,
} from "../artifacts/limpeza/src/lib/cleaning-card-labels.ts";

function extractFunction(code, fnName) {
  const match = code.match(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*\\(`));
  if (!match) throw new Error(`Function ${fnName} not found`);
  const startIdx = match.index;
  let openBraces = 0;
  let started = false;
  let endIdx = -1;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === "{") {
      openBraces++;
      started = true;
    } else if (code[i] === "}") {
      openBraces--;
      if (started && openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx === -1) throw new Error(`Could not find end of function ${fnName}`);
  return code.substring(startIdx, endIdx);
}

function buildGetRequestsScope(db, { todayStr = "2026-11-23", withGetExecutionDateStr = true } = {}) {
  const serverPath = path.resolve("artifacts/api-server/demo-server.mjs");
  const serverCode = fs.readFileSync(serverPath, "utf8");
  const grfdCode = extractFunction(serverCode, "getRequestsForDate");

  const brtFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const getExecutionDateStrImpl = (isoString) => {
    if (!isoString) return todayStr;
    const str = String(isoString).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return brtFormatter.format(new Date(str));
  };

  const getOffsetDateStrImpl = (offsetDays) => {
    const [y, m, d] = todayStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + Number(offsetDays));
    return dt.toISOString().substring(0, 10);
  };

  const fn = new Function(
    "db",
    "getTodayStr",
    "getOffsetDateStr",
    "getExecutionDateStr",
    "saveDatabase",
    "requestsForDateCache",
    "requestsForDateVersion",
    "isB2bReservation",
    "isReservationB2bDndActiveForDate",
    "cancelPendingStayRemindersForCheckout",
    "runCheckoutAutoBillingAndNfse",
    `${grfdCode}\nreturn { getRequestsForDate };`
  );

  return fn(
    db,
    () => todayStr,
    getOffsetDateStrImpl,
    withGetExecutionDateStr ? getExecutionDateStrImpl : undefined,
    () => {},
    new Map(),
    0,
    () => false,
    () => false,
    () => {},
    async () => {}
  );
}

describe("cleaning-card-labels: rótulos temporais de check-out e carry-over", () => {
  const todayStr = "2026-11-23";
  const yesterdayStr = "2026-11-22";
  const tomorrowStr = "2026-11-24";

  it("1. Check-out de ontem (22/11) visto hoje (23/11) exibe 'Check-out ontem (22/11):' quando sujo e 'Saiu ontem (22/11):' quando limpo", () => {
    const dirtyLabel = resolveLeavingGuestLabel({
      checkoutDateRef: "2026-11-22",
      todayStr,
      yesterdayStr,
      tomorrowStr,
      currentStatus: "dirty",
    });
    const cleanLabel = resolveLeavingGuestLabel({
      checkoutDateRef: "2026-11-22",
      todayStr,
      yesterdayStr,
      tomorrowStr,
      currentStatus: "clean",
    });
    assert.strictEqual(dirtyLabel, "Check-out ontem (22/11):");
    assert.strictEqual(cleanLabel, "Saiu ontem (22/11):");
  });

  it("2. Check-out de 2+ dias atrás (20/11) visto hoje (23/11) exibe 'Check-out em 20/11:' quando sujo e 'Saiu em 20/11:' quando limpo", () => {
    const dirtyLabel = resolveLeavingGuestLabel({
      checkoutDateRef: "2026-11-20",
      todayStr,
      yesterdayStr,
      tomorrowStr,
      currentStatus: "dirty",
    });
    const cleanLabel = resolveLeavingGuestLabel({
      checkoutDateRef: "2026-11-20",
      todayStr,
      yesterdayStr,
      tomorrowStr,
      currentStatus: "clean",
    });
    assert.strictEqual(dirtyLabel, "Check-out em 20/11:");
    assert.strictEqual(cleanLabel, "Saiu em 20/11:");
  });

  it("3. Check-out de hoje (23/11) visto hoje (23/11) exibe 'Check-out hoje:' quando sujo e 'Saiu:' quando limpo", () => {
    const dirtyLabel = resolveLeavingGuestLabel({
      checkoutDateRef: "2026-11-23",
      todayStr,
      yesterdayStr,
      tomorrowStr,
      currentStatus: "dirty",
    });
    const cleanLabel = resolveLeavingGuestLabel({
      checkoutDateRef: "2026-11-23",
      todayStr,
      yesterdayStr,
      tomorrowStr,
      currentStatus: "clean",
    });
    assert.strictEqual(dirtyLabel, "Check-out hoje:");
    assert.strictEqual(cleanLabel, "Saiu:");
  });

  it("4. Pendência de ontem ou de hoje exibida na aba Amanhã (24/11) preserva data real e nunca exibe 'Check-out amanhã:'", () => {
    const effYesterday = resolveEffectiveCheckoutDate({
      originalRequestDate: "2026-11-22",
      checkoutDate: "2026-11-22",
      viewDate: "2026-11-24",
    });
    const effToday = resolveEffectiveCheckoutDate({
      originalRequestDate: "2026-11-23",
      checkoutDate: "2026-11-23",
      viewDate: "2026-11-24",
    });

    assert.strictEqual(effYesterday, "2026-11-22");
    assert.strictEqual(effToday, "2026-11-23");

    assert.strictEqual(
      resolveLeavingGuestLabel({
        checkoutDateRef: effYesterday,
        todayStr,
        yesterdayStr,
        tomorrowStr,
        currentStatus: "dirty",
      }),
      "Check-out ontem (22/11):"
    );
    assert.strictEqual(
      resolveLeavingGuestLabel({
        checkoutDateRef: effToday,
        todayStr,
        yesterdayStr,
        tomorrowStr,
        currentStatus: "dirty",
      }),
      "Check-out hoje:"
    );
  });

  it("5. Check-out de amanhã (24/11) e futuro (27/11) exibem 'Check-out amanhã:' e 'Saída Prevista (27/11):'", () => {
    assert.strictEqual(
      resolveLeavingGuestLabel({
        checkoutDateRef: "2026-11-24",
        todayStr,
        yesterdayStr,
        tomorrowStr,
        currentStatus: "dirty",
      }),
      "Check-out amanhã:"
    );
    assert.strictEqual(
      resolveLeavingGuestLabel({
        checkoutDateRef: "2026-11-27",
        todayStr,
        yesterdayStr,
        tomorrowStr,
        currentStatus: "dirty",
      }),
      "Saída Prevista (27/11):"
    );
    assert.strictEqual(formatShortBrDate("2026-11-22T15:00:00.000Z"), "22/11");
  });

  it("6. resolveEffectiveCheckoutDate prioriza originalRequestDate sobre viewDate", () => {
    const resolved = resolveEffectiveCheckoutDate({
      originalRequestDate: "2026-11-22",
      checkoutDate: "2026-11-23",
      requestDate: "2026-11-23",
      reservationCheckoutDate: "2026-11-23",
      viewDate: "2026-11-24",
    });
    assert.strictEqual(resolved, "2026-11-22");
  });
});

describe("getRequestsForDate: carry-over Flat 113 / Edson e blindagem BRT", () => {
  it("7. Flat 113 / Edson com check-out confirmado no PMS (2026-11-22) visto hoje (2026-11-23) sincroniza Desocupado e mantém originalRequestDate", () => {
    const db = {
      flats: [{ id: 1, number: "113", isOccupied: false }],
      reservations: [
        {
          id: 501,
          code: "RES-113-EDSON",
          flatId: 1,
          flatNumber: "113",
          guestName: "Edson",
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-22",
          status: "completed",
          checkoutDone: true,
          actualCheckoutAt: "2026-11-22T14:30:00.000Z",
          checkoutMethod: "reception_pms",
        },
      ],
      cleaningRequests: [
        {
          id: 1001,
          flatId: 1,
          flatNumber: "113",
          requestDate: "2026-11-22",
          source: "checkout",
          status: "dirty",
          isVacant: false,
          isVacantExplicitlySet: false,
          leavingGuest: "Edson",
          checkoutReservationId: 501,
        },
      ],
      auditLogs: [],
    };

    const scope = buildGetRequestsScope(db, { todayStr: "2026-11-23" });
    const list = scope.getRequestsForDate("2026-11-23");
    const card113 = list.find((c) => String(c.flatNumber) === "113");

    assert.ok(card113, "Flat 113 deve aparecer na fila de limpeza de 2026-11-23");
    assert.strictEqual(card113.isPendingFromPreviousDay, true);
    assert.strictEqual(card113.originalRequestDate, "2026-11-22");
    assert.strictEqual(card113.leavingGuest, "Edson");
    assert.strictEqual(card113.isVacant, true, "Check-out confirmado no PMS deve sincronizar isVacant: true");
    assert.strictEqual(card113.isVacantExplicitlySet, true);
    assert.strictEqual(db.cleaningRequests[0].isVacant, true);
  });

  it("8. Flat 113 / Edson SEM confirmação de check-out no PMS permanece Ocupado (isVacant: false) por segurança", () => {
    const db = {
      flats: [{ id: 1, number: "113", isOccupied: true }],
      reservations: [
        {
          id: 502,
          code: "RES-113-EDSON-OPEN",
          flatId: 1,
          flatNumber: "113",
          guestName: "Edson",
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-22",
          status: "in_house",
          checkoutDone: false,
        },
      ],
      cleaningRequests: [
        {
          id: 1002,
          flatId: 1,
          flatNumber: "113",
          requestDate: "2026-11-22",
          source: "checkout",
          status: "dirty",
          isVacant: false,
          isVacantExplicitlySet: false,
          leavingGuest: "Edson",
          checkoutReservationId: 502,
        },
      ],
      auditLogs: [],
    };

    const scope = buildGetRequestsScope(db, { todayStr: "2026-11-23" });
    const list = scope.getRequestsForDate("2026-11-23");
    const card113 = list.find((c) => String(c.flatNumber) === "113");

    assert.ok(card113);
    assert.strictEqual(card113.isPendingFromPreviousDay, true);
    assert.strictEqual(card113.originalRequestDate, "2026-11-22");
    assert.strictEqual(card113.isVacant, false, "Sem confirmação de check-out no PMS, card deve permanecer Ocupado");
    assert.strictEqual(card113.isVacantExplicitlySet, false);
  });

  it("9. Flat 113 / Edson com marcação manual de Ocupado (isVacant: false, isVacantExplicitlySet: true) NÃO é sobrescrito pelo PMS", () => {
    const db = {
      flats: [{ id: 1, number: "113", isOccupied: true }],
      reservations: [
        {
          id: 503,
          code: "RES-113-EDSON-MAN",
          flatId: 1,
          flatNumber: "113",
          guestName: "Edson",
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-22",
          status: "completed",
          checkoutDone: true,
          actualCheckoutAt: "2026-11-22T14:30:00.000Z",
        },
      ],
      cleaningRequests: [
        {
          id: 1003,
          flatId: 1,
          flatNumber: "113",
          requestDate: "2026-11-22",
          source: "checkout",
          status: "dirty",
          isVacant: false,
          isVacantExplicitlySet: true,
          vacantSource: "admin",
          leavingGuest: "Edson",
          checkoutReservationId: 503,
        },
      ],
      auditLogs: [],
    };

    const scope = buildGetRequestsScope(db, { todayStr: "2026-11-23" });
    const list = scope.getRequestsForDate("2026-11-23");
    const card113 = list.find((c) => String(c.flatNumber) === "113");

    assert.ok(card113);
    assert.strictEqual(card113.isVacant, false, "Marcação manual explícita de Ocupado deve ser preservada");
    assert.strictEqual(card113.isVacantExplicitlySet, true);
  });

  it("10. Limpeza concluída ontem às 22:30 BRT (2026-11-23T01:30:00.000Z UTC) é reconhecida como 22/11 em BRT e não vaza para 23/11 no Step 4.5", () => {
    const makeDb = () => ({
      flats: [{ id: 1, number: "113", isOccupied: false }],
      reservations: [
        {
          id: 504,
          code: "RES-113-LATE",
          flatId: 1,
          flatNumber: "113",
          guestName: "Edson",
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-22",
          status: "completed",
          checkoutDone: true,
          actualCheckoutAt: "2026-11-22T15:00:00.000Z",
        },
      ],
      cleaningRequests: [
        {
          id: 1004,
          flatId: 1,
          flatNumber: "113",
          requestDate: "2026-11-22",
          source: "checkout",
          status: "clean",
          isVacant: true,
          isVacantExplicitlySet: true,
          leavingGuest: "Edson",
          checkoutReservationId: 504,
          completedAt: "2026-11-23T01:30:00.000Z",
        },
      ],
      auditLogs: [],
    });

    const scopeWithHelper = buildGetRequestsScope(makeDb(), { todayStr: "2026-11-23", withGetExecutionDateStr: true });
    const listWithHelper = scopeWithHelper.getRequestsForDate("2026-11-23");
    assert.strictEqual(
      listWithHelper.find((c) => String(c.flatNumber) === "113"),
      undefined,
      "Limpeza concluída em 22/11 às 22:30 BRT não deve reaparecer em 23/11"
    );

    const scopeFallback = buildGetRequestsScope(makeDb(), { todayStr: "2026-11-23", withGetExecutionDateStr: false });
    const listFallback = scopeFallback.getRequestsForDate("2026-11-23");
    assert.strictEqual(
      listFallback.find((c) => String(c.flatNumber) === "113"),
      undefined,
      "Fallback UTC-3 de toBrlDateStr também deve impedir vazamento para 23/11"
    );
  });
});
