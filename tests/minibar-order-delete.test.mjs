/**
 * Teste Pontual Estrito — Exclusão Administrativa de Pedidos de Frigobar & Expurgo de Testes (02/11/2026)
 *
 * Execução: node --test tests/minibar-order-delete.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4399;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const isolatedDbPath = path.join(
  os.tmpdir(),
  `test-minibar-order-delete-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {}
}

describe("Frigobar — Expurgo dos Pedidos de Teste (02/11) e Endpoint DELETE /api/minibar/orders/:id", () => {
  before(async () => {
    const initialDb = {
      flats: [
        { id: 1, number: "212", floor: 2, status: "clean" },
        { id: 2, number: "605", floor: 6, status: "clean" },
        { id: 3, number: "509", floor: 5, status: "clean" }
      ],
      reservations: [
        {
          id: 587,
          code: "RES-212-0587",
          flatId: 1,
          flatNumber: "212",
          guestId: 33,
          guestName: "Miller Mendonça Pessanha",
          guestPhone: "22998505276",
          guestDocument: "12585736792",
          guestEmail: "millerpessanha@gmail.com",
          status: "checked_out",
          checkinDate: "2026-11-02",
          checkoutDate: "2026-11-02",
          checkoutDone: true,
          finalMinibarInspectionAt: "2026-11-02T21:59:23.140Z",
          minibarPayments: [
            {
              orderId: "ORD-MB-SPLIT-RES-212-0587-G1",
              amount: 58,
              paidAt: "2026-11-02T22:03:05.748Z",
              paymentMethod: "pix"
            }
          ],
          timeline: [
            {
              id: "tl_mb_ORD-MB-SPLIT-RES-212-0587-G1",
              type: "minibar_payment",
              title: "Consumo de Frigobar Pago",
              description: "Pedido ORD-MB-SPLIT-RES-212-0587-G1 pago via PIX.",
              timestamp: "2026-11-02T22:03:05.748Z"
            }
          ],
          minibarSplitConfig: {
            mode: "by_item",
            itemAssignments: {
              "ORD-MB-DIV-1793656763136::prod_agua_mineral_copo::0": { "1": 2, "2": 0 }
            },
            updatedAt: "2026-11-02T22:00:41.637Z"
          }
        },
        {
          id: 564,
          code: "RES-509-0564",
          flatId: 3,
          flatNumber: "509",
          guestId: 33,
          guestName: "Miller Mendonça Pessanha",
          guestPhone: "22998505276",
          guestDocument: "12585736792",
          guestEmail: "millerpessanha@gmail.com",
          status: "checked_out",
          checkinDate: "2026-10-30",
          checkoutDate: "2026-11-01",
          checkoutDone: true,
          finalMinibarInspectionAt: "2026-10-30T14:19:34.058Z",
          minibarPayments: [
            {
              orderId: "ORD-MB-1793369576372-440",
              amount: 26,
              paidAt: "2026-10-30T14:14:32.047Z",
              paymentMethod: "pix"
            }
          ],
          timeline: [
            {
              id: "tl_mb_ORD-MB-1793369576372-440",
              type: "minibar_payment",
              title: "Consumo de Frigobar Pago",
              description: "Pedido ORD-MB-1793369576372-440 pago via PIX.",
              timestamp: "2026-10-30T14:14:32.047Z"
            }
          ]
        },
        {
          id: 937,
          code: "RES-605-0937",
          flatId: 2,
          flatNumber: "605",
          guestId: 901,
          guestName: "Hóspede Real",
          status: "confirmada",
          checkinDate: "2026-11-16",
          checkoutDate: "2026-11-18"
        }
      ],
      guests: [],
      users: [{ id: 1, username: "admin_test", role: "admin", name: "Admin Teste" }],
      minibarOrders: [
        {
          id: "ORD-MB-SPLIT-RES-212-0587-G1",
          flatNumber: "212",
          reservationId: 587,
          reservationCode: "RES-212-0587",
          guestName: "Miller Mendonça Pessanha",
          totalAmount: 58,
          paymentMethod: "pix",
          paymentStatus: "pago",
          source: "guest_split_checkout",
          paidAt: "2026-11-02T22:03:05.748Z",
          createdAt: "2026-11-02T22:01:02.521Z",
          invoice: { status: "anexada" },
          items: [
            {
              productId: "prod_agua_mineral_copo",
              productName: "Água Mineral Copo",
              quantity: 2,
              unitPrice: 5,
              totalPrice: 10,
              launchOrderId: "ORD-MB-DIV-1793656763136"
            }
          ]
        },
        {
          id: "ORD-MB-DIV-1793656763136",
          flatNumber: "212",
          reservationId: 587,
          reservationCode: "RES-212-0587",
          guestName: "Miller Mendonça Pessanha",
          totalAmount: 58,
          remainingAmount: 0,
          paymentMethod: "pendente",
          paymentStatus: "lancamento_quitado",
          source: "restocker_launch",
          createdAt: "2026-11-02T21:59:23.136Z",
          items: [
            {
              productId: "prod_agua_mineral_copo",
              productName: "Água Mineral Copo",
              quantity: 2,
              paidQuantity: 2,
              remainingQuantity: 0,
              unitPrice: 5,
              totalPrice: 10
            }
          ]
        },
        {
          id: "ORD-MB-1793369576372-440",
          flatNumber: "509",
          reservationId: 564,
          reservationCode: "RES-509-0564",
          guestName: "Miller Mendonça Pessanha",
          totalAmount: 26,
          paymentMethod: "pix",
          paymentStatus: "pago",
          source: "guest_mobile",
          paidAt: "2026-10-30T14:14:32.047Z",
          createdAt: "2026-10-30T14:12:57.028Z",
          invoice: { status: "pendente" },
          items: [
            {
              productId: "prod_agua_sem_gas",
              productName: "Água Mineral sem Gás 500ml",
              quantity: 2,
              unitPrice: 6,
              totalPrice: 12
            }
          ]
        },
        {
          id: "ORD-MB-DIV-1793369974058",
          flatNumber: "509",
          reservationId: 564,
          reservationCode: "RES-509-0564",
          guestName: "Miller Mendonça Pessanha",
          totalAmount: 12,
          paymentMethod: "pendente",
          paymentStatus: "pendente",
          source: "anserve_discrepancy",
          createdAt: "2026-10-30T14:19:34.058Z",
          items: [
            {
              productId: "prod_agua_sem_gas",
              productName: "Água Mineral sem Gás 500ml",
              quantity: 2,
              unitPrice: 6,
              totalPrice: 12
            }
          ]
        },
        {
          id: "ORD-MB-DIV-REAL-KEEP",
          flatNumber: "605",
          reservationId: 937,
          reservationCode: "RES-605-0937",
          guestName: "Hóspede Real",
          totalAmount: 14,
          remainingAmount: 14,
          paymentMethod: "pendente",
          paymentStatus: "pendente",
          source: "restocker_launch",
          createdAt: "2026-11-17T15:21:29.398Z",
          items: [{ productId: "prod_agua_mineral_garrafa", productName: "Água Mineral Garrafa", quantity: 2, unitPrice: 7, totalPrice: 14 }]
        },
        {
          id: "ORD-MB-TEST-MANUAL-DEL",
          flatNumber: "605",
          reservationId: 937,
          reservationCode: "RES-605-0937",
          guestName: "Teste Exclusão Manual",
          totalAmount: 12,
          paymentMethod: "pix",
          paymentStatus: "pago",
          source: "guest_mobile",
          paidAt: "2026-11-17T15:30:00.000Z",
          createdAt: "2026-11-17T15:29:00.000Z",
          items: [{ productId: "prod_refrigerante", productName: "Refrigerante", quantity: 1, unitPrice: 12, totalPrice: 12 }]
        }
      ],
      minibarInspections: [
        {
          id: "INSP-MB-1793656763138",
          flatNumber: "212",
          reservationId: 587,
          reservationCode: "RES-212-0587",
          chargeOrderId: "ORD-MB-DIV-1793656763136",
          hasDiscrepancy: true,
          discrepancyTotalAmount: 58,
          status: "divergencia",
          inspectedAt: "2026-11-02T21:59:23.138Z",
          createdAt: "2026-11-02T21:59:23.138Z"
        },
        {
          id: "INSP-MB-1793369974058",
          flatNumber: "509",
          reservationId: 564,
          reservationCode: "RES-509-0564",
          chargeOrderId: "ORD-MB-DIV-1793369974058",
          hasDiscrepancy: true,
          discrepancyTotalAmount: 12,
          status: "divergencia",
          inspectedAt: "2026-10-30T14:19:34.058Z",
          createdAt: "2026-10-30T14:19:34.058Z"
        }
      ],
      notifications: [
        {
          id: "notif_test_mb",
          category: "checkout",
          title: "Frigobar Pago",
          metadata: { orderId: "ORD-MB-SPLIT-RES-212-0587-G1" }
        }
      ],
      settings: {}
    };

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    const env = { ...process.env };
    delete env.DATABASE_URL;

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        AUTH_SECRET: "test-secret-minibar-del",
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE_URL}/api/minibar/products`);
        if (res.ok) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
  });

  after(() => {
    if (serverProcess?.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  it("1. Paridade SHA-256 exata entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs", () => {
    const a = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
    const b = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
    assert.strictEqual(
      crypto.createHash("sha256").update(a).digest("hex"),
      crypto.createHash("sha256").update(b).digest("hex")
    );
  });

  it("2. Expurga automaticamente ORD-MB-SPLIT-RES-212-0587-G1 e ORD-MB-DIV-1793656763136 (e inspeção vinculada) preservando pedidos reais", async () => {
    const [repRes, setRes, hubRes, ctxRes] = await Promise.all([
      fetch(`${BASE_URL}/api/minibar/anserve-reports?startDate=2026-01-01&endDate=2026-12-31`),
      fetch(`${BASE_URL}/api/minibar/settlement?startDate=2026-01-01&endDate=2026-12-31`),
      fetch(`${BASE_URL}/api/minibar/invoices/hub`),
      fetch(`${BASE_URL}/api/minibar/reservation-context/RES-212-0587`)
    ]);

    const rep = await repRes.json();
    const set = await setRes.json();
    const hub = await hubRes.json();
    const ctx = await ctxRes.json();

    const orderIds = (rep.salesSummary?.orders || []).map(o => o.id);
    assert.ok(!orderIds.includes("ORD-MB-SPLIT-RES-212-0587-G1"), "ORD-MB-SPLIT-RES-212-0587-G1 deve ter sido excluído");
    assert.ok(!orderIds.includes("ORD-MB-DIV-1793656763136"), "ORD-MB-DIV-1793656763136 deve ter sido excluído");
    assert.ok(orderIds.includes("ORD-MB-DIV-REAL-KEEP"), "Pedido real ORD-MB-DIV-REAL-KEEP deve permanecer intacto");

    const inspIds = (rep.productivitySummary?.inspections || []).map(i => i.id);
    assert.ok(!inspIds.includes("INSP-MB-1793656763138"), "Inspeção de teste INSP-MB-1793656763138 deve ter sido excluída");

    const setOrderIds = (set.breakdowns?.orders || []).map(o => o.id);
    assert.ok(!setOrderIds.includes("ORD-MB-SPLIT-RES-212-0587-G1"));

    const hubOrderIds = (hub.invoices || []).map(o => o.id);
    assert.ok(!hubOrderIds.includes("ORD-MB-SPLIT-RES-212-0587-G1"));

    assert.strictEqual(ctx.totalLaunchedAmount, 0);
    assert.strictEqual(ctx.totalPaidAmount, 0);
    assert.strictEqual((ctx.minibarOrders || []).length, 0);
  });

  it("2b. Expurga automaticamente pedidos de teste da reserva RES-509-0564 (ORD-MB-1793369576372-440 e ORD-MB-DIV-1793369974058) preservando pedidos reais", async () => {
    const [repRes, setRes, hubRes, ctxRes] = await Promise.all([
      fetch(`${BASE_URL}/api/minibar/anserve-reports?startDate=2026-01-01&endDate=2026-12-31`),
      fetch(`${BASE_URL}/api/minibar/settlement?startDate=2026-01-01&endDate=2026-12-31`),
      fetch(`${BASE_URL}/api/minibar/invoices/hub`),
      fetch(`${BASE_URL}/api/minibar/reservation-context/RES-509-0564`)
    ]);

    const rep = await repRes.json();
    const set = await setRes.json();
    const hub = await hubRes.json();
    const ctx = await ctxRes.json();

    const orderIds = (rep.salesSummary?.orders || []).map(o => o.id);
    assert.ok(!orderIds.includes("ORD-MB-1793369576372-440"), "ORD-MB-1793369576372-440 deve ter sido excluído de anserve-reports");
    assert.ok(!orderIds.includes("ORD-MB-DIV-1793369974058"), "ORD-MB-DIV-1793369974058 deve ter sido excluído de anserve-reports");
    assert.ok(orderIds.includes("ORD-MB-DIV-REAL-KEEP"), "Pedido real ORD-MB-DIV-REAL-KEEP deve permanecer intacto");

    const inspIds = (rep.productivitySummary?.inspections || []).map(i => i.id);
    assert.ok(!inspIds.includes("INSP-MB-1793369974058"), "Inspeção de teste INSP-MB-1793369974058 deve ter sido excluída");

    const setOrderIds = (set.breakdowns?.orders || []).map(o => o.id);
    assert.ok(!setOrderIds.includes("ORD-MB-1793369576372-440"), "ORD-MB-1793369576372-440 deve ter sido excluído de settlement");
    assert.ok(!setOrderIds.includes("ORD-MB-DIV-1793369974058"), "ORD-MB-DIV-1793369974058 deve ter sido excluído de settlement");

    const hubAllIds = [
      ...(hub.invoices || []),
      ...(hub.pendingInvoices || []),
      ...(hub.issuedInvoices || [])
    ].map(o => o.id);
    assert.ok(!hubAllIds.includes("ORD-MB-1793369576372-440"), "ORD-MB-1793369576372-440 deve ter sido excluído do hub de notas");
    assert.ok(!hubAllIds.includes("ORD-MB-DIV-1793369974058"), "ORD-MB-DIV-1793369974058 deve ter sido excluído do hub de notas");

    assert.strictEqual(ctx.totalLaunchedAmount, 0);
    assert.strictEqual(ctx.totalPaidAmount, 0);
    assert.strictEqual(ctx.pendingBalance, 0);
    assert.strictEqual((ctx.minibarOrders || []).length, 0);
  });

  it("3. Endpoint DELETE /api/minibar/orders/:id exige admin/dev e exclui pedido com tombstone", async () => {
    const unauthRes = await fetch(`${BASE_URL}/api/minibar/orders/ORD-MB-TEST-MANUAL-DEL`, {
      method: "DELETE",
      headers: { "x-enforce-auth": "true" }
    });
    assert.strictEqual(unauthRes.status, 403);

    const delRes = await fetch(`${BASE_URL}/api/minibar/orders/ORD-MB-TEST-MANUAL-DEL`, {
      method: "DELETE"
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);
    assert.deepStrictEqual(delData.removedOrderIds, ["ORD-MB-TEST-MANUAL-DEL"]);

    const repAfter = await (await fetch(`${BASE_URL}/api/minibar/anserve-reports?startDate=2026-01-01&endDate=2026-12-31`)).json();
    const orderIdsAfter = (repAfter.salesSummary?.orders || []).map(o => o.id);
    assert.ok(!orderIdsAfter.includes("ORD-MB-TEST-MANUAL-DEL"));
    assert.ok(orderIdsAfter.includes("ORD-MB-DIV-REAL-KEEP"));
  });
});
