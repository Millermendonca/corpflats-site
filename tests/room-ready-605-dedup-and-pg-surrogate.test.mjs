import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  markReservationRoomReadySent,
  hasRoomReadyBeenSentOrScheduled,
  hasReservationEnteredOrCompletedCheckin
} from "../artifacts/api-server/zapi-service.mjs";

const serverSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");

function extractFunctionSlice(startMarker, endMarker) {
  const startIdx = serverSrc.indexOf(startMarker);
  const endIdx = serverSrc.indexOf(endMarker, startIdx);
  assert.ok(startIdx >= 0 && endIdx > startIdx, `Markers not found: ${startMarker} -> ${endMarker}`);
  return serverSrc
    .slice(startIdx, endIdx)
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b)/g, "");
}

function loadServerHelpersSandbox(initialDb = {}) {
  const sanitizeSlice = extractFunctionSlice(
    "export function sanitizeSafeJsonString(str, maxLen = 0)",
    "async function flushPgState()"
  );
  const reconcileUniversalSlice = extractFunctionSlice(
    "export function reconcileUniversalIntegrity(incomingState = null)",
    "// Alias de retrocompatibilidade"
  );
  const reconcileAuditSlice = extractFunctionSlice(
    "export async function reconcileFromAuditLogs(db, pgPool)",
    "export function ensureB2bSeedData(targetDb = db)"
  );
  const syncRoomBlocksSlice = extractFunctionSlice(
    "function getActiveServiceFlatBlockRange(oflat, todayStr = getTodayStr())",
    "// POST /api/service-orders — Cria nova ordem de serviço (Admin)"
  );

  const sandbox = {
    db: {
      flats: [],
      reservations: [],
      cleaningRequests: [],
      whatsappHistory: [],
      whatsappQueue: [],
      whatsappConversations: [],
      faqItems: [],
      serviceOrders: [],
      serviceWorkers: [],
      roomBlocks: [],
      auditLogs: [],
      ...initialDb
    },
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    getTodayStr: () => "2026-10-28",
    getOffsetDateStr: (days = 0) => `2026-10-${String(28 + days).padStart(2, "0")}`,
    getExecutionDateStr: (iso) => String(iso || "2026-10-28").slice(0, 10),
    ensureB2bSeedData: () => false,
    healContaminatedGuestAndReservationLinks: () => false,
    regularizeHousekeepingPreventiveTasks: () => false,
    isPreReservationBlocked: () => false,
    hasReservationCompletedAnyCheckin: () => false,
    reconcileAndMergeGuests: () => false,
    reconcileCleaningRequests: () => false,
    reconcileReservationsIntegrity: () => false
  };

  vm.createContext(sandbox);
  vm.runInContext(
    `${sanitizeSlice}\n${syncRoomBlocksSlice}\n${reconcileUniversalSlice}\n${reconcileAuditSlice}\nthis.exports = { sanitizeSafeJsonString, sanitizeJsonSerialized, reconcileUniversalIntegrity, reconcileFromAuditLogs, syncServiceOrderRoomBlocks, db };`,
    sandbox
  );
  return sandbox.exports;
}

test("1. Flat 605 & 905 room_ready deduplication across memory, whatsappHistory, whatsappConversations, and auditLogs", () => {
  const auditEvents = [];
  globalThis.__corpflatsLogAuditEvent = (evt) => auditEvents.push(evt);

  try {
    const todayStr = "2026-10-28";
    const db = {
      reservations: [
        {
          id: 6051,
          code: "RES-605A",
          flatId: 605,
          flatNumber: "605",
          guestName: "Hóspede 605",
          guestPhone: "5522999000605",
          checkinDate: todayStr,
          checkoutDate: "2026-10-30",
          status: "confirmada"
        },
        {
          id: 9051,
          code: "RES-905A",
          flatId: 905,
          flatNumber: "905",
          guestName: "Hóspede 905",
          guestPhone: "5522999000905",
          checkinDate: todayStr,
          checkoutDate: "2026-10-30",
          status: "confirmada"
        }
      ],
      whatsappHistory: [],
      whatsappConversations: [],
      whatsappQueue: [],
      auditLogs: []
    };

    // Clone of reservation (simulating non-canonical reference passed to triggerRoomReadyWhatsApp)
    const detached605 = { ...db.reservations[0] };
    assert.equal(hasRoomReadyBeenSentOrScheduled(db, detached605, todayStr), false);

    markReservationRoomReadySent(db, detached605, todayStr, "2026-10-28T15:00:00.000Z", "room_ready_ota");

    // Both detached and canonical reservation in db.reservations must be updated
    assert.equal(detached605.roomReadySentDate, todayStr);
    assert.equal(db.reservations[0].roomReadySentDate, todayStr);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "WHATSAPP_ROOM_READY_SENT");
    assert.equal(auditEvents[0].details.reservationCode, "RES-605A");

    // Repeated call on same day must not emit duplicate audit log
    markReservationRoomReadySent(db, detached605, todayStr, "2026-10-28T15:05:00.000Z", "room_ready_ota");
    assert.equal(auditEvents.length, 1);

    // Even if in-memory roomReadySentDate is lost on a fresh object, auditLogs / conversations / sameday_reservation prevent re-send
    const fresh905 = { ...db.reservations[1] };
    db.whatsappConversations.push({
      phone: "5522999000905",
      messages: [
        {
          fromMe: true,
          status: "sent",
          timestamp: `${todayStr}T13:10:00.000Z`,
          text: "Status do Flat: Limpo e liberado para entrada imediata!"
        }
      ]
    });
    assert.equal(hasRoomReadyBeenSentOrScheduled(db, fresh905, todayStr), true);
    assert.equal(fresh905.roomReadySentDate, todayStr);
    assert.equal(hasReservationEnteredOrCompletedCheckin(db, fresh905, todayStr), true);
  } finally {
    delete globalThis.__corpflatsLogAuditEvent;
  }
});

test("2. sanitizeSafeJsonString & sanitizeJsonSerialized prevent PostgreSQL JSONB UTF-16 lone surrogate errors", () => {
  const { sanitizeSafeJsonString, sanitizeJsonSerialized } = loadServerHelpersSandbox();

  // Case A: Truncating right in the middle of an emoji surrogate pair ("AB😀CD", emoji at indices 2..3)
  const withEmoji = "AB\uD83D\uDE00CD";
  const cutMiddle = sanitizeSafeJsonString(withEmoji, 3);
  assert.equal(cutMiddle, "AB", "Should back up 1 code unit instead of leaving a lone high surrogate at maxLen");

  // Case B: Lone high surrogate, lone low surrogate, and null char in raw string
  const dirtyRaw = "Hello\uD83DWorld\uDE00Test\u0000Valid\uD83D\uDE80End";
  const cleanRaw = sanitizeSafeJsonString(dirtyRaw, 0);
  assert.equal(cleanRaw, "HelloWorldTestValid\uD83D\uDE80End");

  // Case C: Serialized JSON containing lone surrogates, valid surrogate pair, and escaped backslashes
  // Raw JSON text:
  // - "loneHigh": "\ud83d" -> should become ""
  // - "loneLow": "\ude00" -> should become ""
  // - "validPair": "\ud83d\ude00" -> should remain "\ud83d\ude00" (😀)
  // - "literalBackslashU": "\\ud83d" -> literal string `\ud83d` in JSON, must NOT be stripped or corrupt the escaping backslash!
  // - "escapedBackslashThenLone": "\\\ud83d" -> literal `\` followed by lone high surrogate -> should become "\\"
  const rawJson = `{"loneHigh":"\\ud83d","loneLow":"\\ude00","nullChar":"a\\u0000b","validPair":"\\ud83d\\ude00","literalBackslashU":"\\\\ud83d","escapedBackslashThenLone":"\\\\\\ud83d"}`;
  const sanitizedJson = sanitizeJsonSerialized(rawJson);
  const parsed = JSON.parse(sanitizedJson);

  assert.equal(parsed.loneHigh, "");
  assert.equal(parsed.loneLow, "");
  assert.equal(parsed.nullChar, "ab");
  assert.equal(parsed.validPair, "😀");
  assert.equal(parsed.literalBackslashU, "\\ud83d");
  assert.equal(parsed.escapedBackslashThenLone, "\\");
});

test("3. reconcileUniversalIntegrity merges Service Orders per-flat without regressing done/in_progress flats", () => {
  const { reconcileUniversalIntegrity, db } = loadServerHelpersSandbox({
    serviceOrders: [
      {
        id: "so_pintura_1",
        token: "tok_pintura_1",
        title: "Pintura Geral",
        status: "active",
        updatedAt: "2026-10-28T10:00:00.000Z",
        flats: [
          {
            flatId: 301,
            flatNumber: "301",
            status: "done",
            startedAt: "2026-10-28T08:00:00.000Z",
            finishedAt: "2026-10-28T09:50:00.000Z",
            workerName: "Carlos Pintor",
            observations: "Pintura concluída"
          },
          {
            flatId: 302,
            flatNumber: "302",
            status: "pending",
            startedAt: null,
            finishedAt: null
          }
        ]
      }
    ]
  });

  // Incoming state has newer order timestamp, where flat 302 progressed to in_progress,
  // but flat 301 in incoming snapshot was stale ("pending")
  reconcileUniversalIntegrity({
    serviceOrders: [
      {
        id: "so_pintura_1",
        token: "tok_pintura_1",
        title: "Pintura Geral",
        status: "active",
        updatedAt: "2026-10-28T12:00:00.000Z",
        flats: [
          {
            flatId: 301,
            flatNumber: "301",
            status: "pending",
            startedAt: null,
            finishedAt: null,
            workerNotifiedAvailable: true,
            workerNotifiedAvailableAt: "2026-10-28T07:30:00.000Z",
            workerLastNotifiedPhone: "5522999112233"
          },
          {
            flatId: 302,
            flatNumber: "302",
            status: "in_progress",
            startedAt: "2026-10-28T11:30:00.000Z",
            estimatedFinishAt: "2026-10-28T14:30:00.000Z",
            workerName: "Carlos Pintor",
            entryRequested: true
          }
        ]
      }
    ]
  });

  const mergedOrder = db.serviceOrders[0];
  const flat301 = mergedOrder.flats.find(f => f.flatNumber === "301");
  const flat302 = mergedOrder.flats.find(f => f.flatNumber === "302");

  assert.equal(flat301.status, "done", "Flat 301 must remain 'done' and not regress to 'pending'");
  assert.equal(flat301.finishedAt, "2026-10-28T09:50:00.000Z");
  assert.equal(flat301.workerNotifiedAvailable, true, "Notification flag must be preserved");
  assert.equal(flat302.status, "in_progress", "Flat 302 must advance to 'in_progress'");
  assert.equal(flat302.startedAt, "2026-10-28T11:30:00.000Z");
});

test("4. reconcileFromAuditLogs recovers Service Order flat progress, notifications, admin_complete, and roomBlocks after restart", async () => {
  const { reconcileFromAuditLogs, db } = loadServerHelpersSandbox({
    serviceOrders: [
      {
        id: "so_pintura_2",
        token: "tok_pintura_2",
        title: "Pintura",
        status: "active",
        blockFlats: true,
        interdictFlats: true,
        blockStartDate: "2026-10-28",
        blockEndDate: "2026-10-29",
        estimatedDurationHours: 3,
        flats: [
          { flatId: 401, flatNumber: "401", status: "pending", startedAt: null, finishedAt: null },
          { flatId: 402, flatNumber: "402", status: "pending", startedAt: null, finishedAt: null },
          { flatId: 403, flatNumber: "403", status: "pending", startedAt: null, finishedAt: null }
        ]
      }
    ],
    roomBlocks: []
  });

  // Mock pgPool returning newest-first rows (as ORDER BY id DESC in SQL)
  const mockPgPool = {
    query: async () => ({
      rows: [
        {
          id: 106,
          timestamp: "2026-10-28T16:00:00.000Z",
          action: "SERVICE_ORDER_RESET",
          details: {
            serviceOrderId: "so_pintura_2",
            flatId: 403,
            flatNumber: "403",
            action: "reset"
          }
        },
        {
          id: 105,
          timestamp: "2026-10-28T15:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            message: "Pintura: João Pintor no Flat 403",
            metadata: {
              serviceOrderId: "so_pintura_2",
              flatId: 403,
              flatNumber: "403",
              action: "start",
              startedAt: "2026-10-28T15:00:00.000Z"
            }
          }
        },
        {
          id: 104,
          timestamp: "2026-10-28T14:20:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            message: "Pintura: João Pintor no Flat 402",
            metadata: {
              serviceOrderId: "so_pintura_2",
              flatId: 402,
              flatNumber: "402",
              action: "overdue_alert"
            }
          }
        },
        {
          id: 103,
          timestamp: "2026-10-28T13:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            message: "Pintura: João Pintor no Flat 402",
            metadata: {
              serviceOrderId: "so_pintura_2",
              flatId: 402,
              flatNumber: "402",
              action: "start",
              startedAt: "2026-10-28T13:00:00.000Z",
              estimatedFinishAt: "2026-10-28T14:00:00.000Z",
              workerName: "João Pintor"
            }
          }
        },
        {
          id: 102,
          timestamp: "2026-10-28T12:30:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            message: "Pintura: João Pintor no Flat 401",
            metadata: {
              serviceOrderId: "so_pintura_2",
              flatId: 401,
              flatNumber: "401",
              action: "finish",
              startedAt: "2026-10-28T10:00:00.000Z",
              finishedAt: "2026-10-28T12:30:00.000Z",
              workerName: "João Pintor",
              observations: "Demão dupla finalizada",
              needsCleaning: true
            }
          }
        },
        {
          id: 101,
          timestamp: "2026-10-28T09:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_pintura_2",
              action: "worker_room_available",
              flats: ["401", "402"],
              workerPhone: "5522988887777"
            }
          }
        }
      ]
    })
  };

  const changed = await reconcileFromAuditLogs(db, mockPgPool);
  assert.equal(changed, true);

  const order = db.serviceOrders[0];
  const f401 = order.flats.find(f => f.flatNumber === "401");
  const f402 = order.flats.find(f => f.flatNumber === "402");
  const f403 = order.flats.find(f => f.flatNumber === "403");

  // Flat 401 finished
  assert.equal(f401.status, "done");
  assert.equal(f401.finishedAt, "2026-10-28T12:30:00.000Z");
  assert.equal(f401.workerName, "João Pintor");
  assert.equal(f401.observations, "Demão dupla finalizada");
  assert.equal(f401.needsCleaning, true);
  assert.equal(f401.workerNotifiedAvailable, true);

  // Flat 402 in_progress with overdue_alert applied
  assert.equal(f402.status, "in_progress");
  assert.equal(f402.startedAt, "2026-10-28T13:00:00.000Z");
  assert.equal(f402.delayNotified, true);
  assert.equal(f402.workerNotifiedAvailable, true);

  // Flat 403 was started at 15:00 and reset at 16:00 -> back to pending
  assert.equal(f403.status, "pending");
  assert.equal(f403.startedAt, null);

  // Room blocks synced: done flat (401) has no block; 402 and 403 have active blocks
  const blockedFlatNumbers = db.roomBlocks.map(b => b.flatNumber).sort();
  assert.deepEqual(blockedFlatNumbers, ["402", "403"]);
});
