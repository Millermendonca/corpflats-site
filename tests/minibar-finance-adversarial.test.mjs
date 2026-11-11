/**
 * Adversarial / Empirical Stress Test Suite for Backend Minibar Finance & Kit de Boas-Vindas
 *
 * Scope:
 * 1. Zero courtesy consumption: 0 water cups, 0 peanuts -> statement must NOT display ghost items or NaN/undefined.
 * 2. Exact consumption: 1 water cup, 2 peanuts -> statement must display exactly 1 water cup and 2 peanuts with R$ 0,00,
 *    without adding 1 cent to total launched amount, pending balance, or guest reservation total.
 * 3. Surplus water consumption: guest drinks 4 water cups -> first 2 cups must be courtesy (R$ 0,00),
 *    remaining 2 cups must be charged at regular paid price (R$ 5,00 each, total R$ 10,00).
 * 4. Settlement calculation in /api/minibar/settlement: courtesy water cups must be multiplied by R$ 2,00
 *    and added to netPayableToAnserve, while Mendorato peanuts must contribute R$ 0,00 to Anserve repasse (hotel_proprio).
 * 5. Inspection persistence: welcomeKitConsumption recorded properly and restockedItems does NOT trigger courtesy restocking for repositora.
 * 6. Adversarial input boundary stress: negative numbers, non-numeric strings, oversized values (> 2), null/undefined handling.
 *
 * Isolation:
 * - Isolated PORT: 59873
 * - NODE_ENV: 'test'
 * - DATA_FILE: temporary json in os.tmpdir()
 * - Real data/database.json SHA-256 verified unchanged before and after.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const TEST_PORT = 59873;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
delete process.env.DATABASE_URL;

const ROOT_DIR = 'c:\\Users\\mille\\OneDrive\\Hotel\\Documentos hóspedes\\Guest-Flow-Manager';
const REAL_DB_PATH = path.join(ROOT_DIR, 'data', 'database.json');

// Record real database hash & mtime before test
const initialRealDbHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
const initialRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;

// Prepare temporary isolated test database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-adv-test-'));
const tmpDbPath = path.join(tmpDir, 'test-db.json');
process.env.DATA_FILE = tmpDbPath;

const today = new Date();
const pad = n => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const initialMockData = {
  users: [
    { id: 1, username: 'admin', role: 'admin', name: 'Administrador' },
    { id: 2, username: 'repositora', role: 'camareira', name: 'Repositora Anserve' }
  ],
  flats: [
    { id: 10, number: '509', colName: '509 casal', isOccupied: true, active: true },
    { id: 13, number: '605', colName: '605 solteiro', isOccupied: true, active: true },
    { id: 14, number: '712', colName: '712 Solteiro SPLIT', isOccupied: true, active: true },
    { id: 16, number: '904', colName: '904 split', isOccupied: true, active: true }
  ],
  reservations: [
    {
      id: 509,
      code: 'RES-ADV-509',
      guestName: 'Hóspede Flat 509',
      channel: 'direct',
      flatId: 10,
      flatNumber: '509',
      checkinDate: todayStr,
      checkoutDate: todayStr,
      status: 'confirmada',
      isOccupied: true
    },
    {
      id: 605,
      code: 'RES-ADV-605',
      guestName: 'Hóspede Flat 605',
      channel: 'direct',
      flatId: 13,
      flatNumber: '605',
      checkinDate: todayStr,
      checkoutDate: todayStr,
      status: 'confirmada',
      isOccupied: true
    },
    {
      id: 712,
      code: 'RES-ADV-712',
      guestName: 'Hóspede Flat 712',
      channel: 'direct',
      flatId: 14,
      flatNumber: '712',
      checkinDate: todayStr,
      checkoutDate: todayStr,
      status: 'confirmada',
      isOccupied: true
    },
    {
      id: 904,
      code: 'RES-ADV-904',
      guestName: 'Hóspede Flat 904',
      channel: 'direct',
      flatId: 16,
      flatNumber: '904',
      checkinDate: todayStr,
      checkoutDate: todayStr,
      status: 'confirmada',
      isOccupied: true
    }
  ],
  minibarProducts: [],
  minibarInspections: [],
  minibarOrders: [],
  minibarSettings: {
    courtesyReimbursementEnabled: true,
    creditCardFeePercent: 3.99,
    pixFeePercent: 0.99,
    pixFeeFixed: 0,
    corpFlatsCommissionPercent: 0
  }
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialMockData, null, 2), 'utf-8');

// Dynamic import of the primary server module
const serverModule = await import('../artifacts/api-server/demo-server.mjs');
const {
  httpServer,
  db
} = serverModule;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('Minibar Backend Financial & Operational Adversarial Stress Suite', () => {

  after(() => {
    // 1. Close server
    if (httpServer && typeof httpServer.close === 'function') {
      httpServer.close();
    }
    // 2. Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    // 3. Verify real DB was NEVER touched
    const finalRealDbHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_DB_PATH)).digest('hex');
    const finalRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;
    assert.strictEqual(finalRealDbHash, initialRealDbHash, 'CRITICAL: Real data/database.json hash was altered during tests!');
    assert.strictEqual(finalRealDbMtime, initialRealDbMtime, 'CRITICAL: Real data/database.json mtime was altered during tests!');
    setTimeout(() => process.exit(0), 50);
  });

  it('1. Zero Courtesy Consumption: Statement displays NO ghost items and zero NaN/undefined values', async () => {
    // Submit inspection with 0 water cups and 0 peanuts
    const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '509',
        reservationCode: 'RES-ADV-509',
        inspectedBy: 'Repositora Anserve',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: 0,
          mendoratoPeanuts: 0
        },
        consumedItems: [],
        restockedItems: []
      })
    });

    assert.strictEqual(inspRes.status, 200, 'Inspection POST should succeed');
    const inspData = await inspRes.json();
    assert.strictEqual(inspData.success, true);

    // Retrieve guest/reservation statement context
    const stmtRes = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-ADV-509`);
    assert.strictEqual(stmtRes.status, 200, 'Statement GET should succeed');
    const stmtData = await stmtRes.json();
    assert.strictEqual(stmtData.success, true);

    const statement = stmtData.statement;
    assert.ok(statement, 'Statement must exist in response');

    // Requirement: Statement must NOT display ghost items
    assert.ok(Array.isArray(statement.consumedCourtesyItems), 'consumedCourtesyItems must be an array');
    assert.strictEqual(
      statement.consumedCourtesyItems.length,
      0,
      'When consumption is 0, consumedCourtesyItems MUST be empty array (no ghost items)'
    );

    // Requirement: Must not produce NaN or undefined
    assert.strictEqual(typeof statement.totalLaunchedAmount, 'number');
    assert.strictEqual(isNaN(statement.totalLaunchedAmount), false, 'totalLaunchedAmount must not be NaN');
    assert.strictEqual(statement.totalLaunchedAmount, 0, 'totalLaunchedAmount must be exactly 0.00');

    assert.strictEqual(typeof statement.pendingBalance, 'number');
    assert.strictEqual(isNaN(statement.pendingBalance), false, 'pendingBalance must not be NaN');
    assert.strictEqual(statement.pendingBalance, 0, 'pendingBalance must be exactly 0.00');

    // Welcome Kit summary check
    assert.ok(statement.welcomeKitSummary, 'welcomeKitSummary must exist');
    assert.strictEqual(statement.welcomeKitSummary.waterCupsConsumed, 0);
    assert.strictEqual(statement.welcomeKitSummary.peanutsConsumed, 0);
    assert.strictEqual(statement.welcomeKitSummary.totalCourtesyValue, 0.00);
  });

  it('2. Exact Consumption: 1 water cup, 2 peanuts -> segregated at R$ 0,00 without adding 1 cent to bill', async () => {
    // Submit inspection with 1 water cup and 2 peanuts
    const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '605',
        reservationCode: 'RES-ADV-605',
        inspectedBy: 'Repositora Anserve',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: 1,
          mendoratoPeanuts: 2
        },
        consumedItems: [],
        restockedItems: []
      })
    });

    assert.strictEqual(inspRes.status, 200);
    const inspData = await inspRes.json();
    assert.strictEqual(inspData.success, true);

    // Retrieve statement
    const stmtRes = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-ADV-605`);
    assert.strictEqual(stmtRes.status, 200);
    const stmtData = await stmtRes.json();
    const statement = stmtData.statement;

    // Requirement: statement must display exactly 1 water cup and 2 peanuts with R$ 0,00
    assert.strictEqual(statement.consumedCourtesyItems.length, 2, 'Must display exactly 2 consumed courtesy items');

    const waterItem = statement.consumedCourtesyItems.find(i => i.productId === 'prod_agua_mineral_copo');
    assert.ok(waterItem, 'Must contain water cup courtesy item');
    assert.strictEqual(waterItem.quantity, 1, 'Water cup quantity must be 1');
    assert.strictEqual(waterItem.unitPrice, 0.00, 'Water cup unitPrice must be R$ 0,00');
    assert.strictEqual(waterItem.totalPrice, 0.00, 'Water cup totalPrice must be R$ 0,00');
    assert.strictEqual(waterItem.isCourtesy, true);
    assert.strictEqual(waterItem.supplierOrigin, 'anserve');

    const peanutItem = statement.consumedCourtesyItems.find(i => i.productId === 'prod_amendoim_mendorato');
    assert.ok(peanutItem, 'Must contain Mendorato peanuts courtesy item');
    assert.strictEqual(peanutItem.quantity, 2, 'Mendorato peanut quantity must be 2');
    assert.strictEqual(peanutItem.unitPrice, 0.00, 'Mendorato peanut unitPrice must be R$ 0,00');
    assert.strictEqual(peanutItem.totalPrice, 0.00, 'Mendorato peanut totalPrice must be R$ 0,00');
    assert.strictEqual(peanutItem.isCourtesy, true);
    assert.strictEqual(peanutItem.supplierOrigin, 'hotel_proprio');

    // Financial Immunity: zero cents added to pendingBalance or totalLaunchedAmount
    assert.strictEqual(statement.totalLaunchedAmount, 0, 'totalLaunchedAmount must remain 0.00');
    assert.strictEqual(statement.pendingBalance, 0, 'pendingBalance must remain 0.00');
    assert.strictEqual(stmtData.totalLaunchedAmount, 0);
    assert.strictEqual(stmtData.pendingBalance, 0);
  });

  it('3. Surplus Water Consumption: 4 cups consumed -> first 2 courtesy (R$ 0,00), 2 charged at R$ 5,00 (total R$ 10,00)', async () => {
    // When a guest drinks 4 water cups total in the flat:
    // 2 are courtesy of the welcome kit, and 2 are surplus from the paid minibar stock
    const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '712',
        reservationCode: 'RES-ADV-712',
        inspectedBy: 'Repositora Anserve',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: 2,
          mendoratoPeanuts: 0
        },
        consumedItems: [
          { productId: 'prod_agua_mineral_copo', quantity: 2 }
        ],
        restockedItems: []
      })
    });

    assert.strictEqual(inspRes.status, 200);
    const inspData = await inspRes.json();
    assert.strictEqual(inspData.success, true);

    // Retrieve statement
    const stmtRes = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-ADV-712`);
    assert.strictEqual(stmtRes.status, 200);
    const stmtData = await stmtRes.json();
    const statement = stmtData.statement;

    // First 2 cups are courtesy:
    const courtesyWater = statement.consumedCourtesyItems.find(i => i.productId === 'prod_agua_mineral_copo');
    assert.ok(courtesyWater, 'Courtesy water item must exist');
    assert.strictEqual(courtesyWater.quantity, 2, 'Courtesy water cup quantity must be 2');
    assert.strictEqual(courtesyWater.unitPrice, 0.00, 'Courtesy water unitPrice must be 0.00');
    assert.strictEqual(courtesyWater.totalPrice, 0.00, 'Courtesy water totalPrice must be 0.00');

    // Remaining 2 cups are paid:
    assert.ok(statement.pendingLaunchedItems.length >= 1, 'Must have pending launched items');
    const paidWater = statement.pendingLaunchedItems.find(i => i.productId === 'prod_agua_mineral_copo');
    assert.ok(paidWater, 'Paid water item must exist in pending launched items');
    assert.strictEqual(paidWater.quantity, 2, 'Paid water quantity must be 2');
    assert.strictEqual(paidWater.unitPrice, 5.00, 'Paid water unitPrice must be R$ 5,00');
    assert.strictEqual(paidWater.totalPrice, 10.00, 'Paid water totalPrice must be R$ 10,00');
    assert.strictEqual(paidWater.isCourtesy, false, 'Paid water isCourtesy must be false');

    // Financial totals: exactly R$ 10,00
    assert.strictEqual(statement.totalLaunchedAmount, 10.00, 'Total launched must be exactly 10.00');
    assert.strictEqual(statement.pendingBalance, 10.00, 'Pending balance must be exactly 10.00');
  });

  it('4. Settlement Calculation: Water cups reimbursed at R$ 2,00, Mendorato contributes R$ 0,00', async () => {
    // Setup known state in db for settlement
    // We already have:
    // Flat 509: 0 water, 0 peanuts
    // Flat 605: 1 water, 2 peanuts
    // Flat 712: 2 water, 0 peanuts
    // Total courtesy water across inspections so far: 1 + 2 = 3 cups
    // Total courtesy peanuts across inspections so far: 2 + 0 = 2 peanuts

    // Also add one paid order to verify total calculation
    const testOrder = {
      id: 'ORD-TEST-SETTLE-01',
      reservationCode: 'RES-ADV-712',
      flatNumber: '712',
      paymentStatus: 'pago',
      paymentMethod: 'pix',
      totalAmount: 100.00,
      paidAt: `${todayStr}T12:00:00.000Z`,
      createdAt: `${todayStr}T12:00:00.000Z`,
      items: [
        { productId: 'prod_cerveja_long_neck', quantity: 5, unitPrice: 20.00, totalPrice: 100.00 }
      ]
    };
    db.minibarOrders.push(testOrder);

    const settleRes = await fetch(`${BASE_URL}/api/minibar/settlement?startDate=${todayStr}&endDate=${todayStr}`);
    assert.strictEqual(settleRes.status, 200, 'Settlement endpoint should respond with 200');
    const settle = await settleRes.json();
    assert.strictEqual(settle.success, true);

    // Courtesy summary verification
    assert.ok(settle.courtesySummary, 'courtesySummary must exist');
    assert.strictEqual(settle.courtesySummary.totalCourtesyWaterCups, 3, 'Total courtesy water cups must be 3');
    assert.strictEqual(settle.courtesySummary.courtesyWaterUnitCost, 2.00, 'Water unit cost must be R$ 2,00');
    assert.strictEqual(settle.courtesySummary.courtesyWaterTotalCost, 6.00, 'Water total cost must be 3 * 2.00 = R$ 6,00');

    assert.strictEqual(settle.courtesySummary.totalCourtesyMendoratoPeanuts, 2, 'Total peanuts must be 2');
    assert.strictEqual(settle.courtesySummary.courtesyMendoratoUnitCost, 0.00, 'Peanuts unit cost must be R$ 0,00');
    assert.strictEqual(settle.courtesySummary.courtesyMendoratoTotalCost, 0.00, 'Peanuts total cost must be R$ 0,00');

    assert.strictEqual(settle.courtesySummary.waterSupplier, 'anserve');
    assert.strictEqual(settle.courtesySummary.mendoratoSupplier, 'hotel_proprio');

    // Net payable to Anserve calculation:
    // totalOrdersAmount = 100.00
    // pixFees = (100 * 0.99%) = 0.99
    // netCourtesyCredit = 6.00 (water cups reimbursement)
    // netPayableToAnserve = 100.00 - 0.99 + 6.00 = 105.01
    const expectedNetPayable = Number((100.00 - 0.99 + 6.00).toFixed(2));
    assert.strictEqual(settle.netPayableToAnserve, expectedNetPayable, `Net payable must include water reimbursement (${expectedNetPayable})`);

    // Amendoim contributed exactly R$ 0,00
    assert.strictEqual(settle.courtesyMendoratoTotalCost, 0.00);
  });

  it('5. Inspection Persistence & Restocking Guard: Courtesy items are NOT restocked by repositora', async () => {
    // Repositora attempts to pass courtesy items in restockedItems
    const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '904',
        reservationCode: 'RES-ADV-904',
        inspectedBy: 'Repositora Anserve',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: 2,
          mendoratoPeanuts: 1
        },
        consumedItems: [],
        restockedItems: [
          // Courtesy items that must be filtered out:
          { productId: 'prod_amendoim_mendorato', quantity: 2, isCourtesy: true },
          { productId: 'prod_agua_mineral_copo', quantity: 2, isCourtesy: true },
          // Regular paid item that should be accepted:
          { productId: 'prod_cerveja_long_neck', quantity: 1, unitCost: 9.00, isCourtesy: false }
        ]
      })
    });

    assert.strictEqual(inspRes.status, 200);
    const inspData = await inspRes.json();
    assert.strictEqual(inspData.success, true);

    const savedInsp = inspData.inspection;
    assert.ok(savedInsp, 'Saved inspection must exist');

    // Persistence of welcomeKitConsumption
    assert.ok(savedInsp.welcomeKitConsumption, 'welcomeKitConsumption must be persisted on inspection');
    assert.strictEqual(savedInsp.welcomeKitConsumption.waterCups, 2);
    assert.strictEqual(savedInsp.welcomeKitConsumption.mendoratoPeanuts, 1);
    assert.strictEqual(savedInsp.welcomeKitConsumption.waterUnitCost, 2.00);
    assert.strictEqual(savedInsp.welcomeKitConsumption.waterTotalCost, 4.00);
    assert.strictEqual(savedInsp.welcomeKitConsumption.mendoratoUnitCost, 0.00);
    assert.strictEqual(savedInsp.welcomeKitConsumption.mendoratoTotalCost, 0.00);

    // Reservation updated
    const resObj = db.reservations.find(r => r.code === 'RES-ADV-904');
    assert.ok(resObj.welcomeKitConsumption);
    assert.strictEqual(resObj.welcomeKitConsumption.waterCups, 2);
    assert.strictEqual(resObj.welcomeKitConsumption.mendoratoPeanuts, 1);

    // Restocking Guard: Courtesy items MUST NOT be included in restocked items
    const restockedList = savedInsp.restockedItems || [];
    const hasCourtesyWaterInRestocked = restockedList.some(r => r.productId === 'prod_agua_mineral_copo' && r.isCourtesy);
    const hasCourtesyMendoratoInRestocked = restockedList.some(r => r.productId === 'prod_amendoim_mendorato');

    assert.strictEqual(hasCourtesyWaterInRestocked, false, 'Courtesy water cup must NOT be in restocked items');
    assert.strictEqual(hasCourtesyMendoratoInRestocked, false, 'Mendorato peanut must NOT be in restocked items');

    // Regular item must be preserved
    const beerRestocked = restockedList.find(r => r.productId === 'prod_cerveja_long_neck');
    assert.ok(beerRestocked, 'Regular paid item must be in restocked items');
    assert.strictEqual(beerRestocked.quantity, 1);
  });

  it('6. Adversarial Stress & Malformed Inputs: Boundary clamping, negative/string sanitization', async () => {
    // 6a. Negative numbers: should clamp to 0 and not produce negative balance or NaN
    const resNegative = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '509',
        reservationCode: 'RES-ADV-509',
        inspectedBy: 'Adversary Tester',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: -5,
          mendoratoPeanuts: -10
        },
        consumedItems: []
      })
    });
    assert.strictEqual(resNegative.status, 200);
    const dataNeg = await resNegative.json();
    assert.strictEqual(dataNeg.inspection.welcomeKitConsumption.waterCups, 0, 'Negative water cups clamped to 0');
    assert.strictEqual(dataNeg.inspection.welcomeKitConsumption.mendoratoPeanuts, 0, 'Negative peanuts clamped to 0');

    // 6b. Non-numeric strings & nulls: should safely parse to 0 and not throw or produce NaN
    const resStrings = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '509',
        reservationCode: 'RES-ADV-509',
        inspectedBy: 'Adversary Tester',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: 'tres',
          mendoratoPeanuts: null
        },
        consumedItems: []
      })
    });
    assert.strictEqual(resStrings.status, 200);
    const dataStr = await resStrings.json();
    assert.strictEqual(dataStr.inspection.welcomeKitConsumption.waterCups, 0, 'Non-numeric string parsed to 0');
    assert.strictEqual(dataStr.inspection.welcomeKitConsumption.mendoratoPeanuts, 0, 'Null parsed to 0');

    // 6c. Oversized values (> 2): should clamp to maximum allowed courtesy (2 units)
    const resOversized = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '509',
        reservationCode: 'RES-ADV-509',
        inspectedBy: 'Adversary Tester',
        isDailyLaunch: true,
        welcomeKitConsumption: {
          waterCups: 99,
          mendoratoPeanuts: 100
        },
        consumedItems: []
      })
    });
    assert.strictEqual(resOversized.status, 200);
    const dataOver = await resOversized.json();
    assert.strictEqual(dataOver.inspection.welcomeKitConsumption.waterCups, 2, 'Oversized water cups clamped to 2');
    assert.strictEqual(dataOver.inspection.welcomeKitConsumption.mendoratoPeanuts, 2, 'Oversized peanuts clamped to 2');

    // 6d. Empty/null welcomeKitConsumption payload
    const resNullKit = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flatNumber: '509',
        reservationCode: 'RES-ADV-509',
        inspectedBy: 'Adversary Tester',
        isDailyLaunch: true,
        consumedItems: []
      })
    });
    assert.strictEqual(resNullKit.status, 200);
  });
});
