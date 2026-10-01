import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function extractFunction(code, fnName) {
  const match = code.match(new RegExp(`(?:export\\s+)?function\\s+${fnName}\\s*\\(`));
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
        { id: 296, code: "RES-212-0296", flatNumber: "212", guestName: "Alexandre De Oliveira Carvalho", checkinDate: "2026-09-28", checkoutDate: "2026-10-09" },
        { id: 295, code: "RES-512-0295", flatNumber: "512", guestName: "Marco", checkinDate: "2026-09-28", checkoutDate: "2026-10-01" }
      ],
      breakfastOrders: [],
      systemMigrations: []
    };

    const changedFirst = repairIncident(mockDb);
    assert.strictEqual(changedFirst, true, "Primeira execução deve retornar true indicando reparação");
    assert.ok(mockDb.systemMigrations.includes("migration_20260930_breakfast_repaired"));

    // Verifica que Alexandre recebeu 9 pedidos e Marco 1 pedido
    const alexOrders = mockDb.breakfastOrders.filter(o => String(o.roomNumber) === "212");
    assert.strictEqual(alexOrders.length, 9, "Alexandre deve ter 9 pedidos restaurados");
    assert.strictEqual(alexOrders[0].deliveryTime, "06:45");
    assert.strictEqual(alexOrders[0].clientName, "Alexandre De Oliveira Carvalho");
    assert.strictEqual(alexOrders[0].isStandard, true);

    const marcoOrder = mockDb.breakfastOrders.find(o => String(o.roomNumber) === "512" && o.date === "2026-10-01");
    assert.ok(marcoOrder, "Marco deve ter pedido restaurado para 01/10");
    assert.strictEqual(marcoOrder.deliveryTime, "08:02");
    assert.strictEqual(marcoOrder.clientName, "Marco");
    assert.strictEqual(marcoOrder.isStandard, false);
    assert.strictEqual(marcoOrder.preferences.coffee, "Café");

    // Idempotência: segunda execução não duplica
    const countBefore = mockDb.breakfastOrders.length;
    const changedSecond = repairIncident(mockDb);
    assert.strictEqual(changedSecond, false, "Segunda execução não deve alterar nada");
    assert.strictEqual(mockDb.breakfastOrders.length, countBefore, "Contagem de pedidos não deve mudar");
  });

  await t.test("4. reconcileFromAuditLogs cria pedidos ausentes a partir do audit log", () => {
    const content = fs.readFileSync(artifactsServerPath, "utf-8");
    // Verifica que a seção de reconciliação de café da manhã em reconcileFromAuditLogs cria pedidos quando !existing
    assert.ok(content.includes("[Reconcile Audit] Pedido de café restaurado/criado"), "reconcileFromAuditLogs deve conter criação de pedidos ausentes");
    assert.ok(content.includes("maxBfId++"), "reconcileFromAuditLogs deve incrementar maxBfId ao criar pedidos");
    assert.ok(content.includes("db.breakfastOrders.unshift(newOrder)"), "reconcileFromAuditLogs deve adicionar novo pedido ao banco");
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
});
