/**
 * Challenger Adversarial Test Suite: M4 Demographics, LTV Integrity & ?ord=
 * File: tests/challenger-m4-demographics-ltv.test.mjs
 * Execution: node --test tests/challenger-m4-demographics-ltv.test.mjs
 * 
 * Objectives:
 * 1. Paridade Twin-Server SHA-256 (demo-server & whatsapp-ai-service)
 * 2. LTV Integrity: minibarSpent agregado a totalSpent sem NUNCA poluir r.totalAmount / r.paidAmount
 * 3. LTV Edge cases: 0 minibar orders, sem telefone, sem documento, pedidos mistos (pendente/cancelado)
 * 4. Demographics Analytics (GET /api/minibar/analytics/demographics): telefones com DDD inválido/vazio caem no fallback sem quebrar
 * 5. Demographics Analytics: consistência estrutural por categoria e estado, e caso de borda com 0 pedidos
 * 6. ?ord= e Quitação Direta: status 404 para ordem inexistente, status pago e liquidação in-place sem duplicação
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
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(os.tmpdir(), `challenger-m4-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);

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

describe("Empirical Challenger M4 — Demographics, LTV Integrity & ?ord=", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Paridade Twin-Server SHA-256
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Paridade Twin-Server SHA-256", () => {
    it("1.1 demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte", () => {
      const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
      const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
      const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
      const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
      assert.strictEqual(hashA, hashB, "demo-server.mjs deve ter paridade exata SHA-256 entre artifacts e scripts");
    });

    it("1.2 whatsapp-ai-service.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte", () => {
      const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/whatsapp-ai-service.mjs"));
      const fileB = fs.readFileSync(path.join(rootDir, "scripts/whatsapp-ai-service.mjs"));
      const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
      const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
      assert.strictEqual(hashA, hashB, "whatsapp-ai-service.mjs deve ter paridade exata SHA-256 entre artifacts e scripts");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Ciclo de Vida do Servidor com Dados Adversários
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Servidor HTTP & Suíte de Testes Empíricos", () => {
    let authHeaders = {};

    before(async () => {
      let initialDb = {};
      if (fs.existsSync(prodDbPath)) {
        try {
          initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
        } catch (_) {
          initialDb = {};
        }
      }

      initialDb.reservations = Array.isArray(initialDb.reservations) ? initialDb.reservations : [];
      initialDb.guests = Array.isArray(initialDb.guests) ? initialDb.guests : [];
      initialDb.minibarOrders = Array.isArray(initialDb.minibarOrders) ? initialDb.minibarOrders : [];
      initialDb.minibarProducts = Array.isArray(initialDb.minibarProducts) ? initialDb.minibarProducts : [];

      // Catálogo de teste
      initialDb.minibarProducts = [
        { id: "PROD-NESP", name: "Cápsula Nespresso Ristretto", category: "Cafés / Especiais", price: 8.00 },
        { id: "PROD-BEER", name: "Cerveja Heineken Long Neck", category: "Cervejas", price: 15.00 },
        { id: "PROD-SNACK", name: "Batata Pringles Original", category: "Snacks", price: 18.00 },
        { id: "PROD-WATER", name: "Água Mineral Crystal sem Gás", category: "Águas", price: 6.00 },
        { id: "PROD-SODA", name: "Coca-Cola Zero Lata", category: "Refrigerantes", price: 8.00 }
      ];

      // Hóspede 1: Compras Pagas de Frigobar
      initialDb.guests.push({
        id: 7001,
        name: "Carlos Teste Frigobar",
        fullName: "Carlos Teste Frigobar",
        document: "111.222.333-44",
        documentNumber: "11122233344",
        phone: "5511988887777",
        email: "carlos.teste@example.com",
        city: "São Paulo",
        state: "SP",
        tags: []
      });
      initialDb.reservations.push({
        id: 8001,
        code: "RES-LTV-01",
        guestId: 7001,
        guestName: "Carlos Teste Frigobar",
        guestDocument: "11122233344",
        guestPhone: "5511988887777",
        flatNumber: "212",
        checkinDate: "2026-10-10",
        checkoutDate: "2026-10-14",
        totalAmount: 1200.00,
        paidAmount: 1200.00,
        status: "confirmada"
      });
      // 2 pedidos pagos para Carlos
      initialDb.minibarOrders.push({
        id: "ORD-MB-CARLOS-1",
        reservationCode: "RES-LTV-01",
        flatNumber: "212",
        guestName: "Carlos Teste Frigobar",
        guestDocument: "11122233344",
        guestPhone: "5511988887777",
        totalAmount: 85.00,
        paymentStatus: "pago",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-BEER", productName: "Cerveja Heineken Long Neck", quantity: 3, totalPrice: 45.00 },
          { productId: "PROD-SNACK", productName: "Batata Pringles Original", quantity: 2, totalPrice: 36.00 },
          { productId: "PROD-WATER", productName: "Água Mineral Crystal sem Gás", quantity: 1, totalPrice: 6.00 }
        ],
        createdAt: "2026-10-11T12:00:00Z"
      });
      initialDb.minibarOrders.push({
        id: "ORD-MB-CARLOS-2",
        reservationCode: "RES-LTV-01",
        flatNumber: "212",
        guestName: "Carlos Teste Frigobar",
        guestDocument: "11122233344",
        guestPhone: "5511988887777",
        totalAmount: 45.00,
        paymentStatus: "pago",
        paymentMethod: "credit_card",
        items: [
          { productId: "PROD-NESP", productName: "Cápsula Nespresso Ristretto", quantity: 3, totalPrice: 24.00 },
          { productId: "PROD-SNACK", productName: "Batata Pringles Original", quantity: 1, totalPrice: 18.00 }
        ],
        createdAt: "2026-10-12T14:00:00Z"
      });

      // Hóspede 2: Zero compras de Frigobar (Edge case minibarSpent === 0)
      initialDb.guests.push({
        id: 7002,
        name: "Mariana Sem Frigobar",
        fullName: "Mariana Sem Frigobar",
        document: "222.333.444-55",
        documentNumber: "22233344455",
        phone: "5521977776666",
        email: "mariana.sem@example.com",
        city: "Rio de Janeiro",
        state: "RJ",
        tags: []
      });
      initialDb.reservations.push({
        id: 8002,
        code: "RES-LTV-02",
        guestId: 7002,
        guestName: "Mariana Sem Frigobar",
        guestDocument: "22233344455",
        guestPhone: "5521977776666",
        flatNumber: "305",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        totalAmount: 850.00,
        paidAmount: 850.00,
        status: "confirmada"
      });

      // Hóspede 3: Sem documento e sem telefone (Edge case nulo/vazio)
      initialDb.guests.push({
        id: 7003,
        name: "Hóspede Anônimo Sem Doc",
        fullName: "Hóspede Anônimo Sem Doc",
        document: "",
        documentNumber: "",
        phone: "",
        email: "",
        city: "",
        state: "",
        tags: []
      });
      initialDb.reservations.push({
        id: 8003,
        code: "RES-LTV-03",
        guestId: 7003,
        guestName: "Hóspede Anônimo Sem Doc",
        guestDocument: "",
        guestPhone: "",
        flatNumber: "401",
        checkinDate: "2026-10-16",
        checkoutDate: "2026-10-19",
        totalAmount: 600.00,
        paidAmount: 600.00,
        status: "confirmada"
      });
      initialDb.minibarOrders.push({
        id: "ORD-MB-ANON-1",
        reservationCode: "RES-LTV-03",
        flatNumber: "401",
        guestName: "Hóspede Anônimo Sem Doc",
        guestDocument: "",
        guestPhone: "",
        totalAmount: 32.00,
        paymentStatus: "pago",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-NESP", productName: "Cápsula Nespresso", quantity: 4, totalPrice: 32.00 }
        ],
        createdAt: "2026-10-17T10:00:00Z"
      });

      // Hóspede 4: Pedidos Mistos (apenas "pago" soma; "pendente" e "cancelado" não)
      initialDb.guests.push({
        id: 7004,
        name: "Bruno Pedidos Mistos",
        fullName: "Bruno Pedidos Mistos",
        document: "44455566677",
        documentNumber: "44455566677",
        phone: "5531966665555",
        email: "bruno.mistos@example.com",
        city: "Belo Horizonte",
        state: "MG",
        tags: []
      });
      initialDb.reservations.push({
        id: 8004,
        code: "RES-LTV-04",
        guestId: 7004,
        guestName: "Bruno Pedidos Mistos",
        guestDocument: "44455566677",
        guestPhone: "5531966665555",
        flatNumber: "508",
        checkinDate: "2026-10-18",
        checkoutDate: "2026-10-20",
        totalAmount: 500.00,
        paidAmount: 500.00,
        status: "confirmada"
      });
      initialDb.minibarOrders.push({
        id: "ORD-MB-BRUNO-PAGO",
        reservationCode: "RES-LTV-04",
        flatNumber: "508",
        guestDocument: "44455566677",
        guestPhone: "5531966665555",
        totalAmount: 40.00,
        paymentStatus: "pago",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-BEER", productName: "Cerveja Heineken", quantity: 2, totalPrice: 30.00 },
          { productId: "PROD-WATER", productName: "Água Mineral", quantity: 1, totalPrice: 6.00 }
        ]
      });
      initialDb.minibarOrders.push({
        id: "ORD-MB-BRUNO-PEND",
        reservationCode: "RES-LTV-04",
        flatNumber: "508",
        guestDocument: "44455566677",
        guestPhone: "5531966665555",
        totalAmount: 60.00,
        paymentStatus: "pendente",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-SNACK", productName: "Batata Pringles", quantity: 3, totalPrice: 54.00 }
        ]
      });
      initialDb.minibarOrders.push({
        id: "ORD-MB-BRUNO-CANC",
        reservationCode: "RES-LTV-04",
        flatNumber: "508",
        guestDocument: "44455566677",
        guestPhone: "5531966665555",
        totalAmount: 100.00,
        paymentStatus: "cancelado",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-BEER", productName: "Cerveja Heineken", quantity: 5, totalPrice: 75.00 }
        ]
      });

      // Pedidos com Telefones Adversários para Analytics Demográfico
      // Telefone com DDD inexistente (99)
      initialDb.minibarOrders.push({
        id: "ORD-MB-DDD-INVALID",
        reservationCode: "RES-LTV-99",
        flatNumber: "101",
        guestName: "Hóspede DDD 99",
        guestDocument: "99988877766",
        guestPhone: "+5599987654321", // DDD 99 não mapeado no inferStateFromPhone
        totalAmount: 30.00,
        paymentStatus: "pago",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-BEER", productName: "Cerveja", quantity: 2, totalPrice: 30.00 }
        ]
      });

      // Telefone curto/inválido
      initialDb.minibarOrders.push({
        id: "ORD-MB-PHONE-SHORT",
        reservationCode: "RES-LTV-SHORT",
        flatNumber: "102",
        guestName: "Hóspede Fone Curto",
        guestDocument: "88877766655",
        guestPhone: "123", // Telefone curto sem DDD
        totalAmount: 16.00,
        paymentStatus: "pago",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-SODA", productName: "Refrigerante", quantity: 2, totalPrice: 16.00 }
        ]
      });

      // Ordem de divergência pendente para teste de ?ord=
      initialDb.minibarOrders.push({
        id: "ORD-MB-DIV-TEST-01",
        reservationCode: "RES-LTV-01",
        flatNumber: "212",
        guestName: "Carlos Teste Frigobar",
        guestDocument: "11122233344",
        guestPhone: "5511988887777",
        totalAmount: 36.00,
        paymentStatus: "pendente",
        paymentMethod: "pix",
        items: [
          { productId: "PROD-SNACK", productName: "Batata Pringles Original", quantity: 2, totalPrice: 36.00 }
        ]
      });

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
          NODE_ENV: "test"
        },
        stdio: "pipe"
      });

      let isReady = false;
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/system/version`);
          if (res.ok) {
            isReady = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
      }

      if (!isReady) {
        throw new Error(`Falha ao inicializar servidor de teste na porta ${TEST_PORT}`);
      }

      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" })
      });
      if (loginRes.ok) {
        const rawCookie = loginRes.headers.get("set-cookie");
        if (rawCookie) {
          authHeaders = { Cookie: rawCookie.split(";")[0] };
        }
      }
    });

    after(async () => {
      if (serverProcess?.pid) {
        killProcessTree(serverProcess.pid);
      }
      try {
        if (fs.existsSync(isolatedDbPath)) {
          fs.unlinkSync(isolatedDbPath);
        }
      } catch (_) {}
    });

    // ────────────────────────────────────────────────────────────────────────
    // Missão 1: Verificação Adversária da Integridade de LTV
    // ────────────────────────────────────────────────────────────────────────
    describe("Missão 1: LTV & Blindagem de Imutabilidade das Diárias de Reserva", () => {
      it("1.1 Hóspede com compras de frigobar: totalSpent = diárias (1200) + frigobar (130) = 1330", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guests`, { headers: authHeaders });
        assert.strictEqual(res.status, 200);
        const guests = await res.json();
        const carlos = guests.find(g => g.id === 7001 || g.documentNumber === "11122233344");
        assert.ok(carlos, "Hóspede Carlos deve existir na listagem");
        assert.strictEqual(carlos.minibarSpent, 130.00, "minibarSpent deve ser exatamente R$ 130.00");
        assert.strictEqual(carlos.totalSpent, 1330.00, "totalSpent (LTV) deve ser exatamente R$ 1330.00");
        assert.strictEqual(carlos.minibarOrdersCount, 3, "Total de ordens associadas (2 pagas + 1 pendente)");
      });

      it("1.2 r.totalAmount e r.paidAmount permanecem rigorosamente INALTERADOS em GET /api/pms/guests/:id", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guests/7001`);
        assert.strictEqual(res.status, 200);
        const detail = await res.json();

        assert.strictEqual(detail.totalSpent, 1330.00, "LTV agregado na ficha 360 deve ser R$ 1330.00");
        assert.strictEqual(detail.minibarSpent, 130.00, "Gasto de frigobar deve ser R$ 130.00");

        // Asserção Crítica: Imutabilidade da Reserva
        assert.ok(Array.isArray(detail.reservations) && detail.reservations.length > 0);
        const res0 = detail.reservations.find(r => r.code === "RES-LTV-01");
        assert.ok(res0, "Reserva RES-LTV-01 deve constar no detalhe");
        assert.strictEqual(Number(res0.totalAmount), 1200.00, "r.totalAmount JAMAIS pode ser contaminado pelo frigobar");
        assert.strictEqual(Number(res0.paidAmount), 1200.00, "r.paidAmount JAMAIS pode ser contaminado pelo frigobar");
      });

      it("1.3 Imutabilidade no banco de dados isolado em disco: totalAmount e paidAmount continuam 1200.00", () => {
        const dbOnDisk = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
        const resOnDisk = dbOnDisk.reservations.find(r => r.code === "RES-LTV-01");
        assert.ok(resOnDisk, "Reserva RES-LTV-01 deve existir no disco");
        assert.strictEqual(Number(resOnDisk.totalAmount), 1200.00, "totalAmount no banco deve ser 1200.00");
        assert.strictEqual(Number(resOnDisk.paidAmount), 1200.00, "paidAmount no banco deve ser 1200.00");
      });

      it("1.4 Caso de Borda: Hóspede com minibarSpent === 0 (Mariana) calcula LTV corretamente sem distorções", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guests/7002`);
        assert.strictEqual(res.status, 200);
        const detail = await res.json();

        assert.strictEqual(detail.minibarSpent, 0, "minibarSpent deve ser estritamente 0 para hóspede sem compras");
        assert.strictEqual(detail.totalSpent, 850.00, "totalSpent deve ser igual ao valor da diária (850.00)");
        assert.strictEqual(detail.minibarOrders.length, 0, "minibarOrders deve ser lista vazia");

        const res0 = detail.reservations.find(r => r.code === "RES-LTV-02");
        assert.strictEqual(Number(res0.totalAmount), 850.00);
        assert.strictEqual(Number(res0.paidAmount), 850.00);
      });

      it("1.5 Caso de Borda: Hóspede sem documento e sem telefone (Anônimo) não quebra regex nem gera exceção", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guests/7003`);
        assert.strictEqual(res.status, 200, "Endpoint não pode falhar com hóspede sem documento ou telefone");
        const detail = await res.json();

        assert.strictEqual(detail.minibarSpent, 32.00, "Deve encontrar a ordem vinculada pelo código da reserva");
        assert.strictEqual(detail.totalSpent, 632.00, "LTV agregado deve somar reserva (600) + frigobar (32)");
        assert.strictEqual(detail.minibarOrders.length, 1);
      });

      it("1.6 Caso de Borda: Pedidos mistos (Bruno) — apenas status 'pago' (40) é somado, ignorando 'pendente' (60) e 'cancelado' (100)", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guests/7004`);
        assert.strictEqual(res.status, 200);
        const detail = await res.json();

        assert.strictEqual(detail.minibarSpent, 40.00, "Apenas o pedido pago de R$ 40 deve compor minibarSpent");
        assert.strictEqual(detail.totalSpent, 540.00, "LTV deve ser 500 (diária) + 40 (pago)");
        assert.strictEqual(detail.minibarOrders.length, 3, "Histórico completo exibe as 3 ordens para auditoria");
      });

      it("1.7 Tags automáticas de preferência de frigobar: Carlos recebe 'Apreciador Cerveja', 'Prefere Snacks', 'Consumidor Nespresso' e 'Consumo Alto'", async () => {
        const res = await fetch(`${BASE_URL}/api/pms/guests`, { headers: authHeaders });
        assert.strictEqual(res.status, 200);
        const guests = await res.json();
        const carlos = guests.find(g => g.id === 7001);

        assert.ok(carlos.tags.includes("Apreciador Cerveja"), "Deve ter tag 'Apreciador Cerveja' (>=2 cervejas)");
        assert.ok(carlos.tags.includes("Prefere Snacks"), "Deve ter tag 'Prefere Snacks' (>=3 snacks)");
        assert.ok(carlos.tags.includes("Consumidor Nespresso"), "Deve ter tag 'Consumidor Nespresso' (>=3 cápsulas)");
        assert.ok(carlos.tags.includes("Consumo Alto"), "Deve ter tag 'Consumo Alto' (minibarSpent >= 100)");
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Missão 2: Verificação Adversária de Demographics Analytics
    // ────────────────────────────────────────────────────────────────────────
    describe("Missão 2: Demographics Analytics (GET /api/minibar/analytics/demographics)", () => {
      it("2.1 Pedidos com DDD inexistente (99) ou telefone curto (123) caem no fallback 'Outros' sem quebrar a API", async () => {
        const res = await fetch(`${BASE_URL}/api/minibar/analytics/demographics`);
        assert.strictEqual(res.status, 200, "API não pode quebrar com DDD inexistente ou telefone curto");
        const data = await res.json();

        assert.strictEqual(data.success, true);
        assert.ok(data.summary, "Deve conter summary");
        assert.ok(Array.isArray(data.byState), "byState deve ser um array");
        assert.ok(Array.isArray(data.byCategory), "byCategory deve ser um array");

        // Verifica se o estado 'Outros' acolheu os pedidos de telefones inválidos
        const outrosState = data.byState.find(s => s.state === "Outros");
        assert.ok(outrosState, "Estado 'Outros' deve estar presente para fallback");
        assert.ok(outrosState.ordersCount >= 2, "Outros deve conter pelo menos os 2 pedidos com telefones adversários");
      });

      it("2.2 Agregações por categoria e estados retornam estruturas estritamente consistentes", async () => {
        const res = await fetch(`${BASE_URL}/api/minibar/analytics/demographics`);
        const data = await res.json();

        // Checagem de Estrutura de Summary
        assert.ok(typeof data.summary.totalRevenue === "number" && !isNaN(data.summary.totalRevenue));
        assert.ok(typeof data.summary.totalOrders === "number" && data.summary.totalOrders > 0);
        assert.ok(typeof data.summary.totalItems === "number" && data.summary.totalItems > 0);
        assert.ok(typeof data.summary.averageTicket === "number" && !isNaN(data.summary.averageTicket));
        assert.ok(typeof data.summary.leadingState === "string");
        assert.ok(typeof data.summary.leadingCategory === "string");

        // Checagem de Estrutura em byState
        for (const s of data.byState) {
          assert.ok(typeof s.state === "string" && s.state.length > 0);
          assert.ok(typeof s.ordersCount === "number");
          assert.ok(typeof s.totalAmount === "number");
          assert.ok(typeof s.totalUnits === "number");
          assert.ok(typeof s.categories === "object");
          assert.ok(s.categories["Cervejas"], "Deve conter categoria Cervejas em categories do estado");
          assert.ok(s.categories["Snacks"], "Deve conter categoria Snacks em categories do estado");
          assert.ok(s.categories["Águas"], "Deve conter categoria Águas em categories do estado");
          assert.ok(s.categories["Refrigerantes"], "Deve conter categoria Refrigerantes em categories do estado");
          assert.ok(s.categories["Cafés / Especiais"], "Deve conter categoria Cafés / Especiais em categories do estado");
        }

        // Checagem de Estrutura em byCategory
        const expectedCats = ["Cervejas", "Refrigerantes", "Águas", "Snacks", "Cafés / Especiais"];
        for (const catName of expectedCats) {
          const found = data.byCategory.find(c => c.category === catName);
          assert.ok(found, `Categoria ${catName} deve existir em byCategory`);
          assert.ok(typeof found.revenue === "number");
          assert.ok(typeof found.units === "number");
          assert.ok(typeof found.percentage === "number");
        }
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Missão 3: Verificação Adversária de ?ord= e Quitação Direta
    // ────────────────────────────────────────────────────────────────────────
    describe("Missão 3: Verificação Adversária de ?ord= e Quitação Direta", () => {
      it("3.1 GET /api/minibar/orders/:id/status com id inexistente retorna 404 sem quebrar o servidor", async () => {
        const res = await fetch(`${BASE_URL}/api/minibar/orders/ORD-INEXISTENTE-9999/status`);
        assert.strictEqual(res.status, 404, "Ordem inexistente deve retornar 404");
        const body = await res.json();
        assert.strictEqual(body.success, false);
        assert.strictEqual(body.error, "Pedido não encontrado.");
      });

      it("3.2 GET /api/minibar/orders/:id/status com ordem de divergência retorna status e order", async () => {
        const res = await fetch(`${BASE_URL}/api/minibar/orders/ORD-MB-DIV-TEST-01/status`);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.status, "pendente");
        assert.ok(body.order, "Deve conter o objeto da ordem");
        assert.strictEqual(body.order.id, "ORD-MB-DIV-TEST-01");
        assert.strictEqual(body.order.totalAmount, 36.00);
      });

      it("3.3 Quitação Direta in-place: POST /api/minibar/orders com orderId liquida ordem existente sem duplicar registros", async () => {
        // Envia quitação via PIX com orderId especificado
        const settlePayload = {
          orderId: "ORD-MB-DIV-TEST-01",
          reservationCode: "RES-LTV-01",
          flatNumber: "212",
          paymentMethod: "pix",
          invoicePreference: "minibar_consumption",
          document: "11122233344",
          documentType: "cpf",
          email: "carlos.teste@example.com"
        };

        const res = await fetch(`${BASE_URL}/api/minibar/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settlePayload)
        });

        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.orderId, "ORD-MB-DIV-TEST-01", "Deve preservar o mesmo orderId");
        assert.ok(data.pixQrCode || data.pixCopiaECola, "Deve retornar credenciais PIX");

        // Verifica no banco se a ordem foi mantida única (não duplicada)
        const dbState = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
        const matches = dbState.minibarOrders.filter(o => o.id === "ORD-MB-DIV-TEST-01");
        assert.strictEqual(matches.length, 1, "Ordem NÃO pode ter sido duplicada no banco de dados");
      });

      it("3.4 Ordem já paga consultada via status retorna status 'pago', permitindo ao frontend renderizar o banner de quitação sem gerar nova cobrança", async () => {
        // Consulta status da ordem que já estava paga
        const res = await fetch(`${BASE_URL}/api/minibar/orders/ORD-MB-CARLOS-1/status`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.status, "pago");
        assert.ok(data.order);
        assert.strictEqual(data.order.paymentStatus, "pago");
      });
    });

  });
});
