/**
 * Targeted Test Suite: Welcome Kit (Kit de Boas-Vindas) - Milestones 2 & 3 (R3, R4, R5, R6)
 * File: tests/minibar-welcome-kit-targeted.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

describe('Minibar Welcome Kit (Kit de Boas-Vindas) - Requirements R3, R4, R5 & R6', () => {

  it('R3: demo-server.mjs contains prod_amendoim_mendorato in default catalog and guards', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // Product master check
    assert.match(code, /id:\s*"prod_amendoim_mendorato"/, 'prod_amendoim_mendorato must be registered in catalog');
    assert.match(code, /supplierOrigin:\s*"hotel_proprio"/, 'prod_amendoim_mendorato must have supplierOrigin hotel_proprio');
    assert.match(code, /supplierOrigin:\s*"anserve"/, 'prod_agua_mineral_copo must have supplierOrigin anserve');

    // Catalog integrity guards check
    assert.match(code, /db\.minibarProducts\.length < 18/, 'Integrity guards must use < 18 instead of !== 18');
  });

  it('R4: inspections filter out welcome kit courtesy items from restockedItems', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // R4 check: camareiras restock welcome kit on turnover, repositora never restocks courtesy kit
    assert.match(code, /isKitCourtesy/, 'demo-server must detect and skip welcome kit courtesies in restockedItems');
    assert.match(code, /welcomeKitConsumption:\s*welcomeKitRecord/, 'inspection object must persist welcomeKitConsumption');
  });

  it('R5: buildReservationMinibarStatement creates zeroed consumedCourtesyItems without adding to total bill', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // R5 check: consumedCourtesyItems with unitPrice: 0.00, totalPrice: 0.00
    assert.match(code, /consumedCourtesyItems\.push\(\{/, 'statement must build consumedCourtesyItems');
    assert.match(code, /unitPrice:\s*0\.00/, 'courtesy item must have unitPrice 0.00');
    assert.match(code, /totalPrice:\s*0\.00/, 'courtesy item must have totalPrice 0.00');
    assert.match(code, /welcomeKitSummary:\s*\{/, 'statement must export welcomeKitSummary');
  });

  it('R6: settlement calculation computes courtesy water reimbursement at R$ 2.00 and R$ 0.00 for peanuts', () => {
    const code = readFileSync('artifacts/api-server/demo-server.mjs', 'utf8');

    // Settlement check
    assert.match(code, /totalCourtesyWaterCups/, 'settlement must sum consumed courtesy water cups');
    assert.match(code, /courtesyWaterTotalCost/, 'settlement must compute water reimbursement');
    assert.match(code, /courtesyMendoratoTotalCost:\s*0\.00/, 'settlement must mark Mendorato peanuts as 0.00 reimbursement');
    assert.match(code, /courtesySummary:/, 'settlement must expose courtesySummary object');
  });

  it('Frontend checks: guest-minibar, anserve-restock, guest-portal, pms-calendar, anserve-dashboard', () => {
    const guestMinibar = readFileSync('artifacts/limpeza/src/pages/guest-minibar.tsx', 'utf8');
    assert.match(guestMinibar, /Kit de Boas-Vindas/, 'guest-minibar must have prominent Welcome Kit card');
    assert.match(guestMinibar, /consumedCourtesyItems\.length > 0/, 'guest-minibar must have consumed courtesy statement block');
    assert.match(guestMinibar, /Gratuito \(Cortesia\)|Cortesia/, 'guest-minibar must show courtesy badge');

    const anserveRestock = readFileSync('artifacts/limpeza/src/pages/anserve-restock.tsx', 'utf8');
    assert.match(anserveRestock, /setWelcomeKitWaterConsumed/, 'anserve-restock must have water consumption selector');
    assert.match(anserveRestock, /setWelcomeKitPeanutsConsumed/, 'anserve-restock must have peanuts consumption selector');
    assert.match(anserveRestock, /welcomeKitConsumption:\s*\{/, 'anserve-restock must send welcomeKitConsumption in payload');

    const guestPortal = readFileSync('artifacts/limpeza/src/pages/guest-portal.tsx', 'utf8');
    assert.match(guestPortal, /Kit de Boas-Vindas Consumido \(Cortesia/, 'guest-portal must show consumed courtesy section');

    const pmsCalendar = readFileSync('artifacts/limpeza/src/pages/pms-calendar.tsx', 'utf8');
    assert.match(pmsCalendar, /Kit de Boas-Vindas Consumido \(Cortesia\)/, 'pms-calendar must show consumed courtesy section');

    const anserveDashboard = readFileSync('artifacts/limpeza/src/pages/anserve-dashboard.tsx', 'utf8');
    assert.match(anserveDashboard, /Apuração do Kit de Boas-Vindas \(Fornecimento & Repasse\)/, 'anserve-dashboard must show supplier breakdown');
  });
});

describe('Welcome Kit — Repasse Dinâmico Copo d\'Água a Custo & Estoque Próprio do Amendoim (HTTP)', () => {
  const TEST_PORT = 4398;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
  const isolatedDbPath = path.join(
    os.tmpdir(),
    `test-welcome-kit-stock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
  );
  let serverProcess = null;

  function killProcessTree(pid) {
    if (!pid) return;
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    } catch (_) {}
  }

  before(async () => {
    const initialDb = {
      flats: [
        { id: 1, number: '509', floor: 5, status: 'occupied' },
        { id: 2, number: '605', floor: 6, status: 'clean' }
      ],
      reservations: [
        {
          id: 901,
          code: 'RES-509-0901',
          flatId: 1,
          flatNumber: '509',
          guestId: 101,
          guestName: 'Hóspede Teste Kit',
          status: 'checked_in',
          checkinDate: '2026-11-17',
          checkoutDate: '2026-11-19'
        }
      ],
      guests: [],
      users: [{ id: 1, username: 'admin_test', role: 'admin', name: 'Admin Teste' }],
      minibarOrders: [
        {
          id: 'ORD-MB-WK-1',
          flatNumber: '509',
          reservationId: 901,
          reservationCode: 'RES-509-0901',
          guestName: 'Hóspede Teste Kit',
          totalAmount: 100,
          paymentMethod: 'pix',
          paymentStatus: 'pago',
          source: 'guest_qr',
          paidAt: '2026-11-18T10:00:00.000Z',
          createdAt: '2026-11-18T10:00:00.000Z',
          items: [{ productId: 'prod_cerveja_long_neck', productName: 'Cerveja Long Neck', quantity: 5, unitPrice: 20, totalPrice: 100 }]
        }
      ],
      minibarInspections: [
        {
          id: 'INSP-MB-WK-INIT',
          flatNumber: '509',
          reservationId: 901,
          reservationCode: 'RES-509-0901',
          inspectorName: 'Repositora Anserve',
          inspectedAt: '2026-11-18T11:00:00.000Z',
          createdAt: '2026-11-18T11:00:00.000Z',
          status: 'conforme',
          hasDiscrepancy: false,
          restockedItems: [],
          restockedCourtesyTotalCost: 0,
          welcomeKitConsumption: {
            waterCups: 2,
            mendoratoPeanuts: 2,
            waterUnitCost: 2.00,
            waterTotalCost: 4.00,
            mendoratoUnitCost: 0.00,
            mendoratoTotalCost: 0.00,
            waterSupplier: 'anserve',
            mendoratoSupplier: 'hotel_proprio'
          }
        }
      ],
      settings: {}
    };

    writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), 'utf-8');

    const env = { ...process.env };
    delete env.DATABASE_URL;

    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      cwd: process.cwd(),
      env: {
        ...env,
        PORT: String(TEST_PORT),
        DATA_FILE: isolatedDbPath,
        DATABASE_FILE: isolatedDbPath,
        AUTH_SECRET: 'test-secret-welcome-kit',
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
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
      if (existsSync(isolatedDbPath)) unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  it('1. Copo d\'água repassa valor de custo atualizado e Amendoim permanece R$ 0,00 no repasse mesmo com custo próprio', async () => {
    const patchWaterRes = await fetch(`${BASE_URL}/api/minibar/products/prod_agua_mineral_copo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost: 2.5 })
    });
    assert.strictEqual(patchWaterRes.status, 200);

    const set1Res = await fetch(`${BASE_URL}/api/minibar/settlement?startDate=2026-01-01&endDate=2026-12-31`);
    const set1 = await set1Res.json();
    assert.strictEqual(set1.courtesyWaterUnitCost, 2.5);
    assert.strictEqual(set1.courtesyWaterCupsTotal, 2);
    assert.strictEqual(set1.courtesyWaterTotalCost, 5);
    assert.strictEqual(set1.courtesyMendoratoPeanutsTotal, 2);
    assert.strictEqual(set1.courtesyMendoratoTotalCost, 0);

    const netWithWaterAt250 = set1.netPayableToAnserve;
    const expectedNet = Number((100 - set1.totalFees - set1.commissionCorpFlats + 5).toFixed(2));
    assert.strictEqual(netWithWaterAt250, expectedNet);

    // Definir custo próprio interno no amendoim não pode alterar repasse Anserve
    const patchPeanutRes = await fetch(`${BASE_URL}/api/minibar/products/prod_amendoim_mendorato`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost: 1.75 })
    });
    assert.strictEqual(patchPeanutRes.status, 200);

    const set2 = await (await fetch(`${BASE_URL}/api/minibar/settlement?startDate=2026-01-01&endDate=2026-12-31`)).json();
    assert.strictEqual(set2.courtesyMendoratoTotalCost, 0);
    assert.strictEqual(set2.netPayableToAnserve, netWithWaterAt250);
  });

  it('2. Controle de estoque do amendoim ajusta inventário, dá baixa automática nas conferências, aceita entrada/baixa manual e integra relatórios', async () => {
    // Define saldo físico atual = 100 (mesmo com 2 unidades consumidas anteriormente)
    const setBalRes = await fetch(`${BASE_URL}/api/minibar/peanut-stock/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'set_balance', quantity: 100, notes: 'Inventário inicial' })
    });
    assert.strictEqual(setBalRes.status, 200);
    const setBalData = await setBalRes.json();
    assert.strictEqual(setBalData.peanutStock.currentBalance, 100);

    // Nova conferência no flat 605 consumindo +2 amendoins (ajuste interno sem hóspede)
    const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '605',
        unoccupiedLaunchMode: 'internal_adjustment',
        noActiveGuestInFlat: true,
        status: 'ocorrencia_interna',
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 2 },
        restockedItems: [],
        consumedItems: []
      })
    });
    assert.strictEqual(inspRes.status, 200);

    const afterInspStock = await (await fetch(`${BASE_URL}/api/minibar/peanut-stock`)).json();
    assert.strictEqual(afterInspStock.peanutStock.currentBalance, 98);

    // Entrada de compra +50 => 148
    const entryRes = await fetch(`${BASE_URL}/api/minibar/peanut-stock/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'entry', quantity: 50, notes: 'Compra caixa' })
    });
    assert.strictEqual(entryRes.status, 200);
    const entryData = await entryRes.json();
    assert.strictEqual(entryData.peanutStock.currentBalance, 148);

    // Baixa avulsa -3 => 145
    const outRes = await fetch(`${BASE_URL}/api/minibar/peanut-stock/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'manual_out', quantity: 3, notes: 'Pacotes avariados' })
    });
    assert.strictEqual(outRes.status, 200);
    const outData = await outRes.json();
    assert.strictEqual(outData.peanutStock.currentBalance, 145);

    // Relatórios Anserve expõem courtesyReportItems e saldo sem somar amendoim ao repasse
    const repData = await (await fetch(`${BASE_URL}/api/minibar/anserve-reports?startDate=2026-01-01&endDate=2026-12-31`)).json();
    assert.strictEqual(repData.peanutStock.currentBalance, 145);
    const waterRep = repData.courtesyReportItems.find(c => c.productId === 'prod_agua_mineral_copo');
    const peanutRep = repData.courtesyReportItems.find(c => c.productId === 'prod_amendoim_mendorato');
    assert.strictEqual(waterRep.supplier, 'anserve');
    assert.strictEqual(waterRep.reimbursementUnitCost, 2.5);
    assert.strictEqual(waterRep.totalReimbursementToAnserve, 5);
    assert.strictEqual(peanutRep.supplier, 'hotel_proprio');
    assert.strictEqual(peanutRep.unitsConsumed, 4);
    assert.strictEqual(peanutRep.reimbursementUnitCost, 0);
    assert.strictEqual(peanutRep.totalReimbursementToAnserve, 0);

    // Settlement segue com repasse R$ 0,00 para amendoim
    const setFinal = await (await fetch(`${BASE_URL}/api/minibar/settlement?startDate=2026-01-01&endDate=2026-12-31`)).json();
    assert.strictEqual(setFinal.courtesyMendoratoTotalCost, 0);
    assert.strictEqual(setFinal.courtesyWaterTotalCost, 5);
  });
});
