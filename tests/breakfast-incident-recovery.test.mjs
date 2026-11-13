import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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
  return code.substring(startIdx, endIdx).replace(/^\s*export\s+/, "");
}

test("Suite de Validação: Restauração e Blindagem de Breakfast Orders", async (t) => {
  const artifactsServerPath = path.join(rootDir, "artifacts/api-server/demo-server.mjs");
  const scriptsServerPath = path.join(rootDir, "scripts/demo-server.mjs");
  const dbPath = path.join(rootDir, "data/database.json");

  await t.test("1. Paridade estrita byte-a-byte entre demo-server.mjs em artifacts e scripts", () => {
    const b1 = fs.readFileSync(artifactsServerPath);
    const b2 = fs.readFileSync(scriptsServerPath);
    assert.strictEqual(b1.equals(b2), true, "artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs devem ser cópias idênticas byte-a-byte.");
  });

  await t.test("2. database.json contém os pedidos restaurados de Alexandre e Marco", () => {
    const raw = fs.readFileSync(dbPath, "utf-8");
    const db = JSON.parse(raw);
    assert.ok(Array.isArray(db.breakfastOrders), "breakfastOrders deve ser um array");

    // Marco (Flat 512, 01/10)
    const marco = db.breakfastOrders.find(o => String(o.roomNumber) === "512" && o.date === "2026-10-01");
    assert.ok(marco, "Pedido do Marco para 01/10 deve existir");
    assert.strictEqual(marco.deliveryTime, "08:02");
    assert.strictEqual(marco.clientName, "Marco");
    assert.strictEqual(marco.guestCount, 1);
    assert.strictEqual(marco.reservationCode, "RES-512-0295");
    assert.ok(marco.items.some(i => i.name === "Pão de queijo" && i.quantity === 2), "Marco deve ter 2 pães de queijo");
    assert.ok(marco.items.some(i => i.name === "Torradas amanteigadas"), "Marco deve ter torradas amanteigadas");
    assert.strictEqual(marco.preferences.coffee, "Café");
    assert.strictEqual(marco.preferences.fruit, "Nenhuma fruta");

    // Alexandre (Flat 212, 01/10 a 09/10 - 9 dias)
    const alexDates = [
      "2026-10-01", "2026-10-02", "2026-10-03",
      "2026-10-04", "2026-10-05", "2026-10-06",
      "2026-10-07", "2026-10-08", "2026-10-09"
    ];
    for (const dt of alexDates) {
      const alexOrder = db.breakfastOrders.find(o => String(o.roomNumber) === "212" && o.date === dt);
      assert.ok(alexOrder, `Pedido de Alexandre para ${dt} deve existir`);
      assert.strictEqual(alexOrder.deliveryTime, "06:45");
      assert.strictEqual(alexOrder.clientName, "Alexandre De Oliveira Carvalho");
      assert.strictEqual(alexOrder.guestCount, 1);
      assert.strictEqual(alexOrder.reservationCode, "RES-212-0296");
      assert.strictEqual(alexOrder.isStandard, true);
    }
  });

  await t.test("3. repairIncidentSept30 restaura pedidos de café ausentes e é estritamente idempotente", () => {
    const serverCode = fs.readFileSync(artifactsServerPath, "utf-8");
    const fnCode = extractFunction(serverCode, "repairIncidentSept30");
    const repairIncident = new Function("db", `${fnCode}; return repairIncidentSept30(db);`);

    // Mock DB sem pedidos
    const mockDb = {
      reservations: [
        { id: 295, code: "RES-512-0295", flatNumber: "512", guestName: "Marco", checkinDate: "2026-09-28", checkoutDate: "2026-10-01" },
        { id: 296, code: "RES-212-0296", flatNumber: "212", guestName: "Alexandre De Oliveira Carvalho", checkinDate: "2026-09-28", checkoutDate: "2026-10-09" }
      ],
      breakfastOrders: [],
      systemMigrations: []
    };

    const changedFirst = repairIncident(mockDb);
    assert.strictEqual(changedFirst, true, "Primeira execução deve retornar true indicando reparação");
    assert.ok(mockDb.systemMigrations.includes("migration_20260930_breakfast_repaired"));

    // Verifica que Marco recebeu ID 1 e Alexandre IDs 2 a 10 (ou ordens sequenciais)
    const marcoOrder = mockDb.breakfastOrders.find(o => String(o.roomNumber) === "512" && o.date === "2026-10-01");
    assert.ok(marcoOrder, "Marco deve ter pedido restaurado para 01/10");
    assert.strictEqual(marcoOrder.id, 1, "Marco restaurado primeiro deve receber ID 1");
    assert.strictEqual(marcoOrder.deliveryTime, "08:02");
    assert.strictEqual(marcoOrder.clientName, "Marco");
    assert.strictEqual(marcoOrder.isStandard, false);
    assert.strictEqual(marcoOrder.preferences.coffee, "Café");

    const alexOrders = mockDb.breakfastOrders.filter(o => String(o.roomNumber) === "212");
    assert.strictEqual(alexOrders.length, 9, "Alexandre deve ter 9 pedidos restaurados");
    assert.strictEqual(alexOrders[0].id, 2, "Primeiro pedido de Alexandre deve receber ID 2");
    assert.strictEqual(alexOrders[8].id, 10, "Último pedido de Alexandre deve receber ID 10");
    assert.strictEqual(alexOrders[0].deliveryTime, "06:45");
    assert.strictEqual(alexOrders[0].clientName, "Alexandre De Oliveira Carvalho");
    assert.strictEqual(alexOrders[0].isStandard, true);

    // Idempotência: segunda execução não duplica
    const countBefore = mockDb.breakfastOrders.length;
    const changedSecond = repairIncident(mockDb);
    assert.strictEqual(changedSecond, false, "Segunda execução não deve alterar nada");
    assert.strictEqual(mockDb.breakfastOrders.length, countBefore, "Contagem de pedidos não deve mudar");
  });

  await t.test("4. reconcileFromAuditLogs cria pedidos ausentes e lida defensivamente com Date objects, nomes e explicit IDs", async () => {
    const serverCode = fs.readFileSync(artifactsServerPath, "utf-8");
    const fnCode = extractFunction(serverCode, "reconcileFromAuditLogs");
    const reconcileFn = new Function("db", "pgPool", `${fnCode}; return reconcileFromAuditLogs(db, pgPool);`);

    const mockDb = {
      flats: [{ id: 1, number: "212" }, { id: 2, number: "512" }],
      reservations: [
        { id: 296, code: "RES-212-0296", flatNumber: "212", guestName: "Alexandre De Oliveira Carvalho", guestPhone: "11999990001", checkinDate: "2026-10-01", checkoutDate: "2026-10-09" }
      ],
      breakfastOrders: []
    };

    // Caso A: Log com timestamp Date object e SEM meta.dates (deve extrair data do Date sem crashar .substring)
    // E sem meta.clientName, devendo fazer fallback para o guestName da reserva ativa
    const mockPgPool = {
      query: async (sql) => {
        return {
          rows: [
            {
              id: 3110,
              timestamp: new Date("2026-10-01T17:42:08.000Z"),
              action: "NOTIFICATION_BREAKFAST",
              details: {
                title: "☕ Pedido de Café - Apt 212",
                message: "Pedido de café agendado", // Sem 'X agendou café'
                metadata: {
                  roomNumber: "212",
                  deliveryTime: "06:45",
                  guestCount: 1
                  // dates ausente propositalmente para testar fallback em Date object
                  // clientName ausente propositalmente para testar fallback em activeRes.guestName
                }
              }
            },
            {
              id: 3188,
              timestamp: new Date("2026-10-01T21:22:07.000Z"),
              action: "NOTIFICATION_BREAKFAST",
              details: {
                title: "☕ Pedido Repetido - Apt 512",
                message: "Marco repetiu o pedido de café para entrega às 08:02",
                metadata: {
                  orderId: 38,
                  roomNumber: "512",
                  dates: ["2026-10-01"],
                  deliveryTime: "08:02",
                  guestCount: 1,
                  clientName: "Marco",
                  items: [{ name: "Pão de queijo", quantity: 2 }]
                }
              }
            }
          ]
        };
      }
    };

    const changed = await reconcileFn(mockDb, mockPgPool);
    assert.strictEqual(changed, true, "Reconciliação deve retornar true indicando novos pedidos criados");

    // Verifica pedido criado para Flat 212
    const order212 = mockDb.breakfastOrders.find(o => String(o.roomNumber) === "212" && o.date === "2026-10-01");
    assert.ok(order212, "Pedido para Flat 212 na data 2026-10-01 deve ser criado");
    assert.strictEqual(order212.clientName, "Alexandre De Oliveira Carvalho", "clientName deve vir de activeRes.guestName quando ausente no metadata");
    assert.strictEqual(order212.deliveryTime, "06:45");
    assert.strictEqual(order212.status, "pending");

    // Verifica pedido criado para Flat 512 com ID explícito preservado
    const order512 = mockDb.breakfastOrders.find(o => String(o.roomNumber) === "512" && o.date === "2026-10-01");
    assert.ok(order512, "Pedido para Flat 512 deve ser criado");
    assert.strictEqual(order512.id, 38, "ID explícito 38 do metadata deve ser preservado");
    assert.strictEqual(order512.clientName, "Marco");

    // Idempotência: re-execução não duplica pedidos existentes
    const countBefore = mockDb.breakfastOrders.length;
    const changedAgain = await reconcileFn(mockDb, mockPgPool);
    assert.strictEqual(changedAgain, false, "Re-execução de reconcileFn não deve alterar nada se já existem");
    assert.strictEqual(mockDb.breakfastOrders.length, countBefore, "Contagem não deve aumentar na re-execução");
  });

  await t.test("5. logAuditEvent / createNotification grava items, preferences e guestChoices no metadata", () => {
    const content = fs.readFileSync(artifactsServerPath, "utf-8");
    // Verifica que a rota POST /api/breakfast/orders inclui items, preferences e guestChoices no metadata
    assert.ok(content.includes("items: finalItems"), "metadata da notificação de café deve incluir finalItems");
    assert.ok(content.includes("preferences: preferences || null"), "metadata da notificação de café deve incluir preferences");
    assert.ok(content.includes("guestChoices: Array.isArray(guestChoices)"), "metadata da notificação de café deve incluir guestChoices");
  });

  await t.test("6. Retenção de system_store_backups aumentada para cap 500 e throttle 30s", () => {
    const content = fs.readFileSync(artifactsServerPath, "utf-8");
    // Verifica cap de 500
    assert.ok(content.includes("ORDER BY timestamp DESC LIMIT 500"), "system_store_backups deve ter retenção de LIMIT 500");
    // Verifica throttle de 30s
    assert.ok(content.includes("nowMs - lastBackupSnapshotTime > 30000"), "system_store_backups deve ter throttle de 30000ms");
    assert.ok(!content.includes("nowMs - lastBackupSnapshotTime > 5000"), "system_store_backups não deve ter throttle de 5000ms");
  });

  await t.test("7. Casos de borda: meta.dates vazio, reativação de cancelados e deduplicação de múltiplos logs", async () => {
    const serverCode = fs.readFileSync(artifactsServerPath, "utf-8");
    const fnCode = extractFunction(serverCode, "reconcileFromAuditLogs");
    const reconcileFn = new Function("db", "pgPool", `${fnCode}; return reconcileFromAuditLogs(db, pgPool);`);

    const mockDb = {
      flats: [{ id: 1, number: "101" }, { id: 2, number: "102" }],
      reservations: [
        { id: 101, code: "RES-101-0101", flatNumber: "101", guestName: "Hóspede Teste", checkinDate: "2026-10-01", checkoutDate: "2026-10-05" }
      ],
      breakfastOrders: [
        // Pedido previamente cancelado
        { id: 99, date: "2026-10-02", deliveryTime: "08:00", roomNumber: "101", clientName: "Hóspede Teste", status: "cancelled", cancelReason: "teste" }
      ]
    };

    const mockPgPool = {
      query: async () => ({
        rows: [
          // 1. Log com dates vazio [] que deve usar a data do timestamp
          {
            id: 4001,
            timestamp: new Date("2026-10-01T08:00:00.000Z"),
            action: "NOTIFICATION_BREAKFAST",
            details: {
              metadata: {
                roomNumber: "101",
                dates: [], // Vazio! Deve fazer fallback para timestamp
                deliveryTime: "07:30"
              }
            }
          },
          // 2. Log duplicado para a mesma data (não deve duplicar)
          {
            id: 4002,
            timestamp: new Date("2026-10-01T08:05:00.000Z"),
            action: "NOTIFICATION_BREAKFAST",
            details: {
              metadata: {
                roomNumber: "101",
                dates: ["2026-10-01"],
                deliveryTime: "07:30"
              }
            }
          },
          // 3. Log para o pedido cancelado 99 (deve reativar para 'pending')
          {
            id: 4003,
            timestamp: new Date("2026-10-02T08:00:00.000Z"),
            action: "NOTIFICATION_BREAKFAST",
            details: {
              metadata: {
                roomNumber: "101",
                dates: ["2026-10-02"],
                deliveryTime: "08:00"
              }
            }
          }
        ]
      })
    };

    const changed = await reconcileFn(mockDb, mockPgPool);
    assert.strictEqual(changed, true);

    // Verifica que dates=[] gerou pedido para 2026-10-01
    const order101 = mockDb.breakfastOrders.filter(o => String(o.roomNumber) === "101" && o.date === "2026-10-01");
    assert.strictEqual(order101.length, 1, "Log duplicado não deve criar 2 pedidos para a mesma data e apt");
    assert.strictEqual(order101[0].deliveryTime, "07:30");
    assert.ok(Array.isArray(order101[0].items), "Itens padrão devem ser gerados");
    assert.ok(order101[0].preferences, "Preferências padrão devem ser geradas");

    // Verifica reativação do pedido 99
    const order99 = mockDb.breakfastOrders.find(o => o.id === 99);
    assert.strictEqual(order99.status, "pending", "Pedido cancelado deve ser reativado para pending");
    assert.strictEqual(order99.cancelReason, null, "cancelReason deve ser limpo");
  });
});
