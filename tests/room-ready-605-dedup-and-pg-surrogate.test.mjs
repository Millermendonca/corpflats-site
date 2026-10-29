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
  const checkOverdueSlice = extractFunctionSlice(
    "function checkOverdueServiceFlats()",
    "// ── Flats Endpoints"
  );
  const ensureCatalogSlice = extractFunctionSlice(
    "export function ensureServiceCatalogAndReconcileOrders()",
    "// ── External Service Orders"
  );

  const dispatchedNotifications = [];
  const savedReasons = [];

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
      serviceCatalog: [],
      flatDiaryEntries: [],
      roomBlocks: [],
      auditLogs: [],
      ...initialDb
    },
    pgPool: null,
    pgHydratedSuccessfully: true,
    DEFAULT_SERVICE_CATALOG: [],
    inferServiceTypeFromText: () => null,
    saveDatabase: (reason) => savedReasons.push(reason || "default"),
    dispatchServiceNotifications: (event, order, flat, worker) => {
      dispatchedNotifications.push({ event, orderId: order?.id, flatNumber: flat?.flatNumber, worker });
    },
    checkAndNotifyAvailableServiceFlats: () => [],
    dispatchedNotifications,
    savedReasons,
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
    `${sanitizeSlice}\n${syncRoomBlocksSlice}\n${checkOverdueSlice}\n${ensureCatalogSlice}\n${reconcileUniversalSlice}\n${reconcileAuditSlice}\nthis.exports = { sanitizeSafeJsonString, sanitizeJsonSerialized, reconcileUniversalIntegrity, reconcileFromAuditLogs, syncServiceOrderRoomBlocks, checkOverdueServiceFlats, ensureServiceCatalogAndReconcileOrders, dispatchedNotifications, savedReasons, db };`,
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

test("5. Multi-cycle protection (done -> reset -> start): older finish log or stale done snapshot never overwrites newer in_progress cycle", async () => {
  const { reconcileFromAuditLogs, reconcileUniversalIntegrity, db } = loadServerHelpersSandbox({
    serviceOrders: [
      {
        id: "so_cycle_1",
        token: "tok_cycle_1",
        title: "Manutenção Ar",
        status: "active",
        updatedAt: "2026-10-28T15:00:00.000Z",
        flats: [
          {
            flatId: 18,
            flatNumber: "907",
            // Already in cycle 2 (started at 15:00 after reset at 14:00)
            status: "in_progress",
            startedAt: "2026-10-28T15:00:00.000Z",
            resetAt: "2026-10-28T14:00:00.000Z",
            finishedAt: null,
            workerName: "Anderson Alvarenga"
          }
        ]
      }
    ]
  });

  // Audit logs contain Cycle 1 finish (12:00), Reset (14:00), and Cycle 2 start (15:00)
  const mockPgPool = {
    query: async () => ({
      rows: [
        {
          id: 203,
          timestamp: "2026-10-28T15:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_cycle_1",
              flatId: 18,
              flatNumber: "907",
              action: "start",
              startedAt: "2026-10-28T15:00:00.000Z",
              workerName: "Anderson Alvarenga"
            }
          }
        },
        {
          id: 202,
          timestamp: "2026-10-28T14:00:00.000Z",
          action: "SERVICE_ORDER_RESET",
          details: {
            serviceOrderId: "so_cycle_1",
            flatId: 18,
            flatNumber: "907",
            action: "reset",
            resetAt: "2026-10-28T14:00:00.000Z"
          }
        },
        {
          id: 201,
          timestamp: "2026-10-28T12:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_cycle_1",
              flatId: 18,
              flatNumber: "907",
              action: "finish",
              startedAt: "2026-10-28T10:00:00.000Z",
              finishedAt: "2026-10-28T12:00:00.000Z",
              workerName: "Anderson Alvarenga"
            }
          }
        }
      ]
    })
  };

  await reconcileFromAuditLogs(db, mockPgPool);
  const f907 = db.serviceOrders[0].flats[0];
  assert.equal(f907.status, "in_progress", "Older finish log (12:00) must not overwrite newer in_progress (15:00)");
  assert.equal(f907.startedAt, "2026-10-28T15:00:00.000Z");
  assert.equal(f907.finishedAt, null);

  // Also test reconcileUniversalIntegrity against a stale snapshot that still had Cycle 1 'done' at 12:00
  reconcileUniversalIntegrity({
    serviceOrders: [
      {
        id: "so_cycle_1",
        token: "tok_cycle_1",
        title: "Manutenção Ar",
        status: "active",
        updatedAt: "2026-10-28T12:00:00.000Z",
        flats: [
          {
            flatId: 18,
            flatNumber: "907",
            status: "done",
            startedAt: "2026-10-28T10:00:00.000Z",
            finishedAt: "2026-10-28T12:00:00.000Z",
            workerName: "Anderson Alvarenga"
          }
        ]
      }
    ]
  });

  const f907AfterMerge = db.serviceOrders[0].flats[0];
  assert.equal(f907AfterMerge.status, "in_progress", "Stale done snapshot (12:00) must not overwrite newer in_progress cycle (15:00)");
  assert.equal(f907AfterMerge.startedAt, "2026-10-28T15:00:00.000Z");
});

test("6. Full Service Order lifecycle recovery from audit logs (CREATE, UPDATE, WORKER_REGISTERED, PHOTOS_UPLOADED, FORCE_RELEASE, DELETE)", async () => {
  const { reconcileFromAuditLogs, reconcileUniversalIntegrity, db } = loadServerHelpersSandbox({
    serviceOrders: [],
    serviceWorkers: [],
    roomBlocks: []
  });

  const mockPgPool = {
    query: async () => ({
      rows: [
        {
          id: 307,
          timestamp: "2026-10-28T18:30:00.000Z",
          action: "SERVICE_ORDER_DELETED",
          details: {
            serviceOrderId: "so_temp_del",
            orderId: "so_temp_del",
            action: "deleted"
          }
        },
        {
          id: 306,
          timestamp: "2026-10-28T18:10:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_new_1",
              flatId: 18,
              flatNumber: "907",
              action: "finish",
              startedAt: "2026-10-28T17:30:00.000Z",
              finishedAt: "2026-10-28T18:10:00.000Z",
              workerName: "Anderson Alvarenga",
              observations: "Higienizado com sucesso",
              wasCleanWhenStarted: true,
              needsCleaning: true
              // Intentionally omit 'photos' here to verify fallback to uploadedPhotos from SERVICE_ORDER_PHOTOS_UPLOADED
            }
          }
        },
        {
          id: 305,
          timestamp: "2026-10-28T18:05:00.000Z",
          action: "SERVICE_ORDER_PHOTOS_UPLOADED",
          details: {
            serviceOrderId: "so_new_1",
            flatId: 18,
            flatNumber: "907",
            action: "photos_uploaded",
            photos: ["https://r2.example.com/services/photo_907_1.webp"]
          }
        },
        {
          id: 304,
          timestamp: "2026-10-28T17:20:00.000Z",
          action: "SERVICE_ORDER_FORCE_RELEASE",
          details: {
            serviceOrderId: "so_new_1",
            flatId: 21,
            flatNumber: "1304",
            action: "force_release",
            forceReleased: true
          }
        },
        {
          id: 303,
          timestamp: "2026-10-28T17:10:00.000Z",
          action: "SERVICE_ORDER_WORKER_REGISTERED",
          details: {
            serviceOrderId: "so_new_1",
            token: "tok_new_1",
            action: "worker_registered",
            worker: {
              id: "sw_new_1",
              serviceOrderId: "so_new_1",
              token: "tok_new_1",
              mainWorker: { name: "Anderson Alvarenga", cpf: "12345678901", phone: "5522999999999" },
              registeredAt: "2026-10-28T17:10:00.000Z"
            }
          }
        },
        {
          id: 302,
          timestamp: "2026-10-28T17:05:00.000Z",
          action: "SERVICE_ORDER_CREATED",
          details: {
            serviceOrderId: "so_temp_del",
            orderId: "so_temp_del",
            token: "tok_temp_del",
            action: "created",
            order: {
              id: "so_temp_del",
              token: "tok_temp_del",
              title: "Ordem Excluída",
              status: "active",
              createdAt: "2026-10-28T17:05:00.000Z",
              updatedAt: "2026-10-28T17:05:00.000Z",
              flats: [{ flatId: 1, flatNumber: "113", status: "pending" }]
            }
          }
        },
        {
          id: 301,
          timestamp: "2026-10-28T17:00:00.000Z",
          action: "SERVICE_ORDER_CREATED",
          details: {
            serviceOrderId: "so_new_1",
            orderId: "so_new_1",
            token: "tok_new_1",
            action: "created",
            order: {
              id: "so_new_1",
              token: "tok_new_1",
              title: "Limpeza de Ar-condicionado",
              status: "active",
              requirePhotos: true,
              createdAt: "2026-10-28T17:00:00.000Z",
              updatedAt: "2026-10-28T17:00:00.000Z",
              flats: [
                { flatId: 18, flatNumber: "907", status: "pending", photos: [] },
                { flatId: 21, flatNumber: "1304", status: "pending", photos: [] }
              ]
            }
          }
        }
      ]
    })
  };

  const changed = await reconcileFromAuditLogs(db, mockPgPool);
  assert.equal(changed, true);

  // Only so_new_1 must remain (so_temp_del was created then deleted)
  assert.equal(db.serviceOrders.length, 1);
  assert.equal(db.serviceOrders[0].id, "so_new_1");
  assert.equal(db.serviceWorkers.length, 1);
  assert.equal(db.serviceWorkers[0].mainWorker.name, "Anderson Alvarenga");

  const f907 = db.serviceOrders[0].flats.find(f => f.flatNumber === "907");
  const f1304 = db.serviceOrders[0].flats.find(f => f.flatNumber === "1304");

  assert.equal(f907.status, "done");
  assert.deepEqual([...f907.photos], ["https://r2.example.com/services/photo_907_1.webp"]);
  assert.equal(f907.wasCleanWhenStarted, true);
  assert.equal(f907.needsCleaning, true);
  assert.equal(f1304.forceReleased, true);

  // Ensure reconcileUniversalIntegrity does not resurrect deleted order so_temp_del
  reconcileUniversalIntegrity({
    serviceOrders: [
      {
        id: "so_temp_del",
        token: "tok_temp_del",
        title: "Ordem Excluída",
        status: "active",
        flats: [{ flatId: 1, flatNumber: "113", status: "pending" }]
      }
    ]
  });
  assert.equal(db.serviceOrders.some(o => o.id === "so_temp_del"), false, "Deleted service order must not be resurrected");
});

test("7. Self-healing of R2 photos & cleaning flags for so_1791912503911_wzey5 (Flats 907 & 1304) and LIMIT 600 saturation fallback query", async () => {
  const { reconcileFromAuditLogs, db } = loadServerHelpersSandbox({
    serviceOrders: [
      {
        id: "so_1791912503911_wzey5",
        token: "9bf18bd5202fb36e61a99115",
        title: "Higienização Ar Condicionado",
        status: "active",
        flats: [
          {
            flatId: 18,
            flatNumber: "907",
            status: "in_progress",
            startedAt: "2026-10-28T13:29:33.044Z",
            finishedAt: null,
            photos: [],
            needsCleaning: null,
            wasCleanWhenStarted: null
          },
          {
            flatId: 21,
            flatNumber: "1304",
            status: "in_progress",
            startedAt: "2026-10-28T13:29:04.005Z",
            finishedAt: null,
            photos: [],
            needsCleaning: null,
            wasCleanWhenStarted: null
          }
        ]
      }
    ]
  });

  // Simulate 560 non-OS audit logs in the primary query so the secondary SERVICE_ORDER query triggers
  let queriesExecuted = 0;
  const fillerRows = Array.from({ length: 560 }, (_, idx) => ({
    id: 90000 - idx,
    timestamp: "2026-10-28T22:00:00.000Z",
    action: "CLEANING_COMPLETED",
    details: { flatNumber: "113" }
  }));

  const mockPgPool = {
    query: async (sql) => {
      queriesExecuted++;
      if (queriesExecuted === 1) {
        return { rows: fillerRows };
      }
      assert.ok(sql.includes("NOTIFICATION_SERVICE_ORDER"), "Secondary query must specifically fetch SERVICE_ORDER logs");
      return {
        rows: [
          {
            id: 82597,
            timestamp: "2026-10-28T21:00:40.847Z",
            action: "NOTIFICATION_SERVICE_ORDER",
            details: {
              message: "Higienização Ar Condicionado: Anderson Alvarenga no Flat 1304",
              metadata: {
                serviceOrderId: "so_1791912503911_wzey5",
                flatId: 21,
                flatNumber: "1304",
                action: "finish"
              }
            }
          },
          {
            id: 82593,
            timestamp: "2026-10-28T20:59:55.032Z",
            action: "NOTIFICATION_SERVICE_ORDER",
            details: {
              message: "Higienização Ar Condicionado: Anderson Alvarenga no Flat 907",
              metadata: {
                serviceOrderId: "so_1791912503911_wzey5",
                flatId: 18,
                flatNumber: "907",
                action: "finish"
              }
            }
          }
        ]
      };
    }
  };

  const changed = await reconcileFromAuditLogs(db, mockPgPool);
  assert.equal(changed, true);
  assert.equal(queriesExecuted, 2, "Should execute secondary query when primary query returns >= 550 rows");

  const acOrder = db.serviceOrders[0];
  const f907 = acOrder.flats.find(f => f.flatNumber === "907");
  const f1304 = acOrder.flats.find(f => f.flatNumber === "1304");

  assert.equal(f907.status, "done");
  assert.equal(f907.photos.length, 2, "Flat 907 must recover its 2 Cloudflare R2 photos");
  assert.equal(f907.wasCleanWhenStarted, true);
  assert.equal(f907.needsCleaning, true);

  assert.equal(f1304.status, "done");
  assert.equal(f1304.photos.length, 1, "Flat 1304 must recover its Cloudflare R2 photo");
  assert.equal(f1304.wasCleanWhenStarted, true);
  assert.equal(f1304.needsCleaning, true);
});

test("8. Flat 313 (so_1791912503911_wzey5) implicit reset via worker_room_available, 3-point self-healing, and 24h overdue alert guard", async () => {
  // Part A: reconcileFromAuditLogs recognizes implicit reset when worker_room_available occurs after an unfinished start
  // and heals Flat 313 in so_1791912503911_wzey5 even if a stale start from 2026-10-14 was replayed
  const {
    reconcileFromAuditLogs,
    reconcileUniversalIntegrity,
    ensureServiceCatalogAndReconcileOrders,
    checkOverdueServiceFlats,
    dispatchedNotifications,
    savedReasons,
    db
  } = loadServerHelpersSandbox({
    serviceOrders: [
      {
        id: "so_1791912503911_wzey5",
        token: "dbae89b4cf74e3cf06e7f013",
        title: "Higienização Ar Condicionado",
        status: "active",
        estimatedDurationHours: 2,
        flats: [
          {
            flatId: 7,
            flatNumber: "313",
            status: "in_progress",
            startedAt: "2026-10-14T02:22:00.201Z",
            estimatedFinishAt: "2026-10-14T04:22:00.201Z",
            workerName: "Miller Mendonça Pessanha",
            entryRequested: true,
            entryRequestedAt: "2026-10-14T02:22:00.201Z",
            delayNotified: true,
            finishedAt: null,
            workerNotifiedAvailable: true,
            workerNotifiedAvailableAt: "2026-10-27T14:11:29.398Z"
          }
        ]
      },
      {
        id: "so_generic_implicit",
        token: "tok_generic_implicit",
        title: "Revisão Geral",
        status: "active",
        estimatedDurationHours: 2,
        flats: [
          {
            flatId: 2,
            flatNumber: "114",
            status: "pending",
            startedAt: null,
            finishedAt: null
          }
        ]
      }
    ]
  });

  const mockPgPool = {
    query: async () => ({
      rows: [
        {
          id: 504,
          timestamp: "2026-10-28T23:45:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_1791912503911_wzey5",
              flatId: 7,
              flatNumber: "313",
              action: "overdue_alert"
            }
          }
        },
        {
          id: 503,
          timestamp: "2026-10-27T14:11:29.398Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_1791912503911_wzey5",
              action: "worker_room_available",
              flats: ["313"],
              workerPhone: "5522999990000"
            }
          }
        },
        {
          id: 502,
          timestamp: "2026-10-27T10:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_generic_implicit",
              action: "worker_room_available",
              flats: ["114"],
              workerPhone: "5522999990000"
            }
          }
        },
        {
          id: 501,
          timestamp: "2026-10-20T09:00:00.000Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_generic_implicit",
              flatId: 2,
              flatNumber: "114",
              action: "start",
              startedAt: "2026-10-20T09:00:00.000Z",
              workerName: "Teste Antigo"
            }
          }
        },
        {
          id: 500,
          timestamp: "2026-10-14T02:22:00.201Z",
          action: "NOTIFICATION_SERVICE_ORDER",
          details: {
            metadata: {
              serviceOrderId: "so_1791912503911_wzey5",
              flatId: 7,
              flatNumber: "313",
              action: "start",
              startedAt: "2026-10-14T02:22:00.201Z",
              estimatedFinishAt: "2026-10-14T04:22:00.201Z",
              workerName: "Miller Mendonça Pessanha"
            }
          }
        }
      ]
    })
  };

  await reconcileFromAuditLogs(db, mockPgPool);

  const f313 = db.serviceOrders[0].flats[0];
  assert.equal(f313.status, "pending", "Flat 313 must remain pending after audit log reconciliation");
  assert.equal(f313.startedAt, null);
  assert.equal(f313.estimatedFinishAt, null);
  assert.equal(f313.workerName, null);
  assert.equal(f313.entryRequested, false);
  assert.equal(f313.delayNotified, false);

  const f114 = db.serviceOrders[1].flats[0];
  assert.equal(f114.status, "pending", "Generic flat 114 with worker_room_available after unfinished start must be implicitly reset to pending");
  assert.equal(f114.startedAt, null);
  assert.equal(f114.resetAt, "2026-10-27T10:00:00.000Z");

  // Part B: reconcileUniversalIntegrity heals Flat 313 when contaminated by an incoming snapshot or in-memory state
  f313.status = "in_progress";
  f313.startedAt = "2026-10-14T02:22:00.201Z";
  f313.estimatedFinishAt = "2026-10-14T04:22:00.201Z";
  f313.workerName = "Miller Mendonça Pessanha";
  f313.entryRequested = true;
  f313.delayNotified = true;
  delete f313.resetAt;

  const changedInteg = reconcileUniversalIntegrity();
  assert.equal(changedInteg, true);
  assert.equal(f313.status, "pending", "reconcileUniversalIntegrity must heal Flat 313 back to pending");
  assert.equal(f313.startedAt, null);
  assert.equal(f313.workerName, null);
  assert.equal(f313.delayNotified, false);

  // Part C: ensureServiceCatalogAndReconcileOrders heals Flat 313 if it is in_progress with startedAt < workerNotifiedAvailableAt
  f313.status = "in_progress";
  f313.startedAt = "2026-10-14T02:22:00.201Z";
  f313.estimatedFinishAt = "2026-10-14T04:22:00.201Z";
  f313.workerName = "Miller Mendonça Pessanha";
  f313.entryRequested = true;
  f313.delayNotified = false;

  const changedCat = ensureServiceCatalogAndReconcileOrders();
  assert.equal(changedCat, true);
  assert.equal(f313.status, "pending", "ensureServiceCatalogAndReconcileOrders must heal Flat 313 back to pending");
  assert.equal(f313.startedAt, null);
  assert.equal(f313.estimatedFinishAt, null);

  // Part D: checkOverdueServiceFlats 24-hour temporal sanity guard
  const nowMs = Date.now();
  const expired14DaysAgoIso = new Date(nowMs - 14 * 24 * 3600 * 1000).toISOString();
  const expired30MinsAgoIso = new Date(nowMs - 30 * 60 * 1000).toISOString();

  db.serviceOrders.push({
    id: "so_overdue_guard_test",
    token: "tok_overdue_guard",
    title: "Teste Guard 24h",
    status: "active",
    flats: [
      {
        flatId: 101,
        flatNumber: "215",
        status: "in_progress",
        startedAt: expired14DaysAgoIso,
        estimatedFinishAt: expired14DaysAgoIso,
        delayNotified: false
      },
      {
        flatId: 102,
        flatNumber: "306",
        status: "in_progress",
        startedAt: expired30MinsAgoIso,
        estimatedFinishAt: expired30MinsAgoIso,
        delayNotified: false
      }
    ]
  });

  dispatchedNotifications.length = 0;
  savedReasons.length = 0;

  checkOverdueServiceFlats();

  const guardOrder = db.serviceOrders.find(o => o.id === "so_overdue_guard_test");
  const fOld = guardOrder.flats.find(f => f.flatNumber === "215");
  const fRecent = guardOrder.flats.find(f => f.flatNumber === "306");

  assert.equal(fOld.delayNotified, true, "Stale >24h overdue flat must be marked delayNotified=true silently");
  assert.equal(fRecent.delayNotified, true, "Recent <=24h overdue flat must be marked delayNotified=true");
  assert.equal(dispatchedNotifications.length, 1, "Only the recent (<=24h) overdue flat should trigger a WhatsApp/notification dispatch");
  assert.equal(dispatchedNotifications[0].flatNumber, "306");
  assert.equal(dispatchedNotifications[0].event, "overdue_alert");
  assert.ok(savedReasons.includes("check_overdue_service_flats"));
});


