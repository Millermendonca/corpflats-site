/**
 * Targeted Isolated Test Suite — Anserve Minibar Restock Enhancements & Fixes
 * File: tests/minibar-anserve-restock-flow.test.mjs
 *
 * Covers:
 * 1. Twin-server SHA-256 parity (artifacts/api-server/demo-server.mjs === scripts/demo-server.mjs).
 * 2. Flat statuses: ENTRADA HOJE -> OCUPADO (at standard check-in time, reception check-in, or guest button),
 *    SAÍDA HOJE -> Saiu às HH:MM, OCUPADO, LIVRE.
 * 3. Dobradinha (same-day turnover): stays on departing guest until post-checkout inspection is concluded,
 *    then transitions to ENTRADA HOJE on incoming reservation (preserving previousCheckoutInspectedToday),
 *    and later transitions to OCUPADO.
 * 4. Unoccupied flat inspections (LIVRE & ENTRADA HOJE):
 *    - Included in Pendentes Hoje until conferred today.
 *    - Option 1: internal_adjustment (records write-off, restock & notes with R$ 0 guest charge and zero WhatsApp).
 *    - Option 2: link_last_reservation (links consumption to last departed reservation with zero automatic WhatsApp).
 *    - Error path: link_last_reservation when no prior reservation exists returns 400.
 * 5. Courtesy consumption saving & day-by-day consumption separation:
 *    - Courtesy-only launches save properly across multiple days (Day 1 + Day 2 accumulate up to 2/2 limit).
 *    - Courtesy items appear separated by day in dailyLaunches AND in consumedCourtesyItems / welcomeKitSummary
 *      in /flats-status, /reservation-context/:code, and /flat-context, adding R$ 0.00 to financial totals.
 * 6. Frontend UI & sorting/modal invariants in anserve-restock.tsx.
 *
 * Strict Isolation (AGENTS.md):
 * - Isolated PORT: 59879
 * - Temporary DATA_FILE in os.tmpdir(), DATABASE_URL removed, zero Z-API config, real data/database.json untouched.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");

const initialRealDbHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
const initialRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;

const TEST_PORT = 59879;
process.env.NODE_ENV = "test";
process.env.PORT = String(TEST_PORT);
delete process.env.DATABASE_URL;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mb-anserve-flow-"));
const tmpDbPath = path.join(tmpDir, "test-db.json");
process.env.DATA_FILE = tmpDbPath;

function getBrlDateOffset(daysOffset = 0) {
  const now = new Date(Date.now() + daysOffset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

const yesterdayStr = getBrlDateOffset(-1);
const todayStr = getBrlDateOffset(0);
const tomorrowStr = getBrlDateOffset(1);
const twoDaysAgoStr = getBrlDateOffset(-2);

const initialMockData = {
  settings: {
    checkinTime: "15:00",
    checkoutTime: "11:00"
  },
  users: [
    { id: 1, username: "admin", role: "admin", name: "Admin Teste", active: true },
    { id: 20, username: "repositora", role: "anserve_repositora", name: "Maria Repositora", pin: "1234", active: true }
  ],
  flats: [
    { id: 1, number: "101", colName: "Flat 101", active: true }, // Arrival today (standard check-in time test)
    { id: 2, number: "102", colName: "Flat 102", active: true }, // Arrival today (guest button / portaria test)
    { id: 3, number: "211", colName: "Flat 211", active: true }, // Stayover occupied + multi-day courtesy & paid launch
    { id: 4, number: "313", colName: "Flat 313", active: true }, // Dobradinha (turnover: checkout today + checkin today)
    { id: 5, number: "408", colName: "Flat 408", active: true }, // Livre WITH prior departed reservation
    { id: 6, number: "509", colName: "Flat 509", active: true }  // Livre WITHOUT any prior reservation
  ],
  reservations: [
    // Flat 101: Entrada Hoje (15:00)
    {
      id: 1001,
      code: "RES-101-IN",
      guestName: "Carlos Entrada Hoje",
      flatId: 1,
      flatNumber: "101",
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      checkinTime: "15:00",
      status: "confirmada"
    },
    // Flat 102: Entrada Hoje + uma reserva passada para testar vínculo antes do check-in
    {
      id: 10020,
      code: "RES-102-PREV",
      guestName: " Patrícia Saiu Ontem",
      flatId: 2,
      flatNumber: "102",
      checkinDate: twoDaysAgoStr,
      checkoutDate: yesterdayStr,
      status: "completed",
      checkoutDone: true
    },
    {
      id: 1002,
      code: "RES-102-IN",
      guestName: "Fernanda Botão Entrada",
      flatId: 2,
      flatNumber: "102",
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      checkinTime: "15:00",
      status: "confirmada"
    },
    // Flat 211: Hóspede já hospedado (entrou antes de hoje, sai amanhã)
    {
      id: 1003,
      code: "RES-211-STAY",
      guestName: "Roberto Hospedado",
      flatId: 3,
      flatNumber: "211",
      checkinDate: twoDaysAgoStr,
      checkoutDate: tomorrowStr,
      status: "checkin",
      checkedIn: true
    },
    // Flat 313: Dobradinha — Hóspede A sai hoje + Hóspede B entra hoje
    {
      id: 1004,
      code: "RES-313-OUT",
      guestName: " Marcos Saída Dobradinha",
      flatId: 4,
      flatNumber: "313",
      checkinDate: yesterdayStr,
      checkoutDate: todayStr,
      status: "checkin",
      checkedIn: true
    },
    {
      id: 1005,
      code: "RES-313-IN",
      guestName: "Juliana Entrada Dobradinha",
      flatId: 4,
      flatNumber: "313",
      checkinDate: todayStr,
      checkoutDate: tomorrowStr,
      checkinTime: "15:00",
      status: "confirmada"
    },
    // Flat 408: Livre hoje, mas teve saída ontem
    {
      id: 1006,
      code: "RES-408-LAST",
      guestName: "Eduardo Última Reserva",
      flatId: 5,
      flatNumber: "408",
      checkinDate: twoDaysAgoStr,
      checkoutDate: yesterdayStr,
      status: "completed",
      checkoutDone: true
    }
  ],
  minibarProducts: [],
  minibarInspections: [],
  minibarOrders: [],
  minibarSettings: {
    anservePin: "1234",
    courtesyReimbursementEnabled: true,
    autoNotifySofiaOnDiscrepancy: true,
    creditCardFeePercent: 3.99,
    pixFeePercent: 0.99,
    pixFeeFixed: 0,
    corpFlatsCommissionPercent: 0
  }
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialMockData, null, 2), "utf-8");

const serverModule = await import("../artifacts/api-server/demo-server.mjs");
const { httpServer, db } = serverModule;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function setSimulatedClockHHMM(hhmm) {
  const res = await fetch(`${BASE_URL}/api/smart-flat/101/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset: true, simulatedTime: hhmm })
  });
  assert.strictEqual(res.status, 200, "Time simulation endpoint must respond 200");
}

async function fetchFlatsStatus() {
  const res = await fetch(`${BASE_URL}/api/minibar/inspections/flats-status`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  return data.flats;
}

describe("Anserve Minibar Restock — Statuses, Dobradinha, Unoccupied Flats, Sorting & Courtesy by Day", () => {
  before(() => {
    // Limpa reservas auto-semeadas pela rotina de startup na instância isolada em memória
    db.reservations = JSON.parse(JSON.stringify(initialMockData.reservations));
    db.cleaningRequests = [];
    db.minibarOrders = [];
    db.minibarInspections = [];
    db.smartFlats = {};
  });

  after(() => {
    global.__simulatedTimeOffsetMs = 0;
    if (httpServer && typeof httpServer.close === "function") {
      httpServer.close();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    const finalRealDbHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
    const finalRealDbMtime = fs.statSync(REAL_DB_PATH).mtimeMs;
    assert.strictEqual(finalRealDbHash, initialRealDbHash, "Real data/database.json hash must remain untouched");
    assert.strictEqual(finalRealDbMtime, initialRealDbMtime, "Real data/database.json mtime must remain untouched");
    setTimeout(() => process.exit(0), 50);
  });

  it("1. Paridade Twin-Server SHA-256 exata entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs", () => {
    const hashA = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/demo-server.mjs")))
      .digest("hex");
    const hashB = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(ROOT_DIR, "scripts/demo-server.mjs")))
      .digest("hex");
    assert.strictEqual(hashA, hashB, "Twin demo-server.mjs files must match byte-for-byte");
  });

  it("2. Status dos Flats às 10:00 (ENTRADA HOJE, OCUPADO, SAÍDA HOJE, LIVRE) e transição para OCUPADO (Q1)", async () => {
    await setSimulatedClockHHMM("10:00");
    let flats = await fetchFlatsStatus();

    const f101 = flats.find((f) => f.flatNumber === "101");
    const f102 = flats.find((f) => f.flatNumber === "102");
    const f211 = flats.find((f) => f.flatNumber === "211");
    const f313 = flats.find((f) => f.flatNumber === "313");
    const f408 = flats.find((f) => f.flatNumber === "408");
    const f509 = flats.find((f) => f.flatNumber === "509");

    assert.strictEqual(f101.status, "entrada_hoje", "Flat 101 às 10:00 deve estar ENTRADA HOJE");
    assert.strictEqual(f102.status, "entrada_hoje", "Flat 102 às 10:00 deve estar ENTRADA HOJE");
    assert.strictEqual(f211.status, "ocupado", "Flat 211 em trânsito deve estar OCUPADO");
    assert.strictEqual(f313.status, "checkout_hoje", "Flat 313 antes de sair deve estar SAÍDA HOJE");
    assert.strictEqual(f313.isCheckedOut, false);
    assert.strictEqual(f408.status, "livre", "Flat 408 sem reserva hoje deve estar LIVRE");
    assert.strictEqual(f509.status, "livre", "Flat 509 sem reserva deve estar LIVRE");

    // Todos sem conferência hoje começam pendentes (hasRealInspectionToday === false)
    for (const fl of [f101, f102, f211, f313, f408, f509]) {
      assert.strictEqual(fl.hasRealInspectionToday, false, `Flat ${fl.flatNumber} deve iniciar pendente hoje`);
    }

    // Q1b/Q1c: Hóspede do Flat 102 informa entrada pelo botão às 10:30 (antes das 15h) -> vira OCUPADO imediatamente
    const res102 = db.reservations.find((r) => r.code === "RES-102-IN");
    res102.guestSelfCheckin = true;
    res102.guestSelfCheckinAt = new Date().toISOString();

    flats = await fetchFlatsStatus();
    assert.strictEqual(
      flats.find((f) => f.flatNumber === "102").status,
      "ocupado",
      "Flat 102 deve mudar para OCUPADO assim que o hóspede informa entrada pelo botão"
    );
    assert.strictEqual(
      flats.find((f) => f.flatNumber === "101").status,
      "entrada_hoje",
      "Flat 101 sem check-in antes das 15h permanece ENTRADA HOJE"
    );

    // Q1a: Relógio chega às 15:05 (após horário padrão 15:00) -> Flat 101 vira OCUPADO automaticamente
    await setSimulatedClockHHMM("15:05");
    flats = await fetchFlatsStatus();
    assert.strictEqual(
      flats.find((f) => f.flatNumber === "101").status,
      "ocupado",
      "Flat 101 deve mudar automaticamente para OCUPADO a partir do horário padrão de check-in (15:00)"
    );

    // Reseta Flat 102 para testar conferência antes do check-in nos próximos testes e volta relógio para 11:00
    res102.guestSelfCheckin = false;
    res102.guestSelfCheckinAt = null;
    if (db.smartFlats?.["102"]) delete db.smartFlats["102"];
    await setSimulatedClockHHMM("11:00");
  });

  it("3. Dobradinha (Q2): Saiu às HH:MM -> Conferência Final -> ENTRADA HOJE (com indicação de saída conferida) -> OCUPADO", async () => {
    await setSimulatedClockHHMM("11:00");

    // 3a. Passagem matinal antes do check-out NÃO pode encerrar a dobradinha quando o hóspede sair depois
    const morningPass = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "313",
        reservationCode: "RES-313-OUT",
        inspectedBy: "Maria Repositora",
        status: "conforme",
        isDailyLaunch: false,
        isFinalCheckoutInspection: false,
        launchDate: todayStr
      })
    });
    assert.strictEqual(morningPass.status, 200);

    // Hóspede A faz check-out às 11:20
    const resOut = db.reservations.find((r) => r.code === "RES-313-OUT");
    resOut.checkoutDone = true;
    resOut.actualCheckoutTime = "11:20";
    resOut.actualCheckoutAt = new Date(Date.now() + 60000).toISOString();

    let flats = await fetchFlatsStatus();
    let f313 = flats.find((f) => f.flatNumber === "313");
    assert.strictEqual(f313.status, "checkout_hoje", "Deve continuar em checkout_hoje aguardando vistoria pós-saída");
    assert.strictEqual(f313.isCheckedOut, true, "Deve indicar que saiu");
    assert.strictEqual(f313.checkoutTime, "11:20", "Deve preservar horário de saída 11:20");
    assert.strictEqual(f313.currentReservation.code, "RES-313-OUT", "Ainda vinculado ao hóspede que saiu");
    assert.strictEqual(f313.hasRealInspectionToday, false, "Aguardando conferência FINAL pós-checkout");

    // 3b. Repositora conclui a conferência pós-checkout de RES-313-OUT
    const finalInsp = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "313",
        reservationCode: "RES-313-OUT",
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        isFinalCheckoutInspection: true,
        launchDate: todayStr,
        consumedItems: [{ productId: "prod_cerveja_long_neck", quantity: 1 }],
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(finalInsp.status, 200);

    // Agora às 11:00 (antes das 15:00), Flat 313 DEVE passar imediatamente para ENTRADA HOJE na nova reserva RES-313-IN!
    flats = await fetchFlatsStatus();
    f313 = flats.find((f) => f.flatNumber === "313");
    assert.strictEqual(f313.status, "entrada_hoje", "Após conferência pós-checkout, dobradinha passa para ENTRADA HOJE");
    assert.strictEqual(f313.currentReservation.code, "RES-313-IN", "Já aponta para a nova reserva do dia");
    assert.ok(f313.previousCheckoutInspectedToday, "Mantém indicação de que a saída anterior foi conferida");
    assert.strictEqual(f313.previousCheckoutInspectedToday.reservationCode, "RES-313-OUT");
    // Consumo de RES-313-OUT NÃO vaza para RES-313-IN
    assert.strictEqual(f313.totalLaunchedAmount, 0, "Extrato da nova reserva começa zerado");
    assert.strictEqual(f313.welcomeKitSummary.waterCupsConsumed, 0, "Cortesias da saída anterior não vazam para a nova reserva");

    // 3c. Às 15:30 (ou na entrada), vira OCUPADO mantendo indicação da saída anterior conferida
    await setSimulatedClockHHMM("15:30");
    flats = await fetchFlatsStatus();
    f313 = flats.find((f) => f.flatNumber === "313");
    assert.strictEqual(f313.status, "ocupado", "Na entrada/horário padrão vira OCUPADO");
    assert.strictEqual(f313.currentReservation.code, "RES-313-IN");
    assert.strictEqual(f313.previousCheckoutInspectedToday.reservationCode, "RES-313-OUT");

    await setSimulatedClockHHMM("11:00");
  });

  it("4. Flats Sem Hóspede (Q4 & Q5): Ajuste Interno vs Vincular à Última Reserva, sem WhatsApp automático", async () => {
    const ordersBefore = db.minibarOrders.length;

    // 4a. Opção 1: Ocorrência / Ajuste Interno no Flat 408 (LIVRE) com 1 energético e 1 água cortesia
    const adjRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "408",
        unoccupiedLaunchMode: "internal_adjustment",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        status: "ocorrencia_interna",
        isDailyLaunch: true,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 0 },
        consumedItems: [{ productId: "prod_energetico", quantity: 1 }],
        restockedItems: [{ productId: "prod_energetico", quantity: 1, isCourtesy: false }],
        notes: "Falta constatada em flat livre"
      })
    });
    assert.strictEqual(adjRes.status, 200);
    const adjData = await adjRes.json();
    assert.strictEqual(adjData.success, true);
    assert.strictEqual(adjData.chargeOrderId, null, "Ajuste interno NÃO pode criar pedido de cobrança");
    assert.strictEqual(db.minibarOrders.length, ordersBefore, "Nenhum minibarOrder criado em ajuste interno");
    assert.strictEqual(adjData.whatsappSofiaAlertSent, false, "Nenhum WhatsApp disparado (Q5)");
    assert.strictEqual(adjData.inspection.status, "ocorrencia_interna");
    assert.strictEqual(adjData.inspection.internalAdjustmentItems.length, 1);
    assert.strictEqual(adjData.inspection.restockedItems.length, 1, "Reposição deve ser contabilizada");

    // Verifica como o Flat 408 aparece em flats-status após o ajuste interno
    let flats = await fetchFlatsStatus();
    const f408 = flats.find((f) => f.flatNumber === "408");
    assert.strictEqual(f408.hasRealInspectionToday, true, "Flat 408 passa para Conferido Hoje");
    assert.strictEqual(f408.totalLaunchedAmount, 0, "Sem valor cobrado de hóspede");
    assert.ok(f408.dailyLaunches.length >= 1, "Ajuste interno de hoje fica visível por dia no card/modal");
    assert.ok(f408.dailyLaunches[0].items.some((i) => i.isInternalAdjustment && i.productId === "prod_energetico"));

    // 4b. Opção 2: Vincular à última reserva que saiu no Flat 102 (ENTRADA HOJE antes do check-in -> vincula a RES-102-PREV)
    const linkRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "102",
        reservationCode: "RES-102-PREV",
        targetLastReservationCode: "RES-102-PREV",
        unoccupiedLaunchMode: "link_last_reservation",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 2 },
        consumedItems: [{ productId: "prod_refrigerante", quantity: 2 }],
        restockedItems: [{ productId: "prod_refrigerante", quantity: 2, isCourtesy: false }],
        notes: "2 refrigerantes esquecidos do checkout de ontem"
      })
    });
    assert.strictEqual(linkRes.status, 200);
    const linkData = await linkRes.json();
    assert.strictEqual(linkData.success, true);
    assert.strictEqual(linkData.whatsappSofiaAlertSent, false, "Q5: Vincular à última reserva NÃO dispara WhatsApp automático");
    assert.strictEqual(linkData.inspection.reservationCode, "RES-102-PREV", "Deve vincular a RES-102-PREV e nunca a RES-102-IN");
    assert.strictEqual(linkData.statement.totalLaunchedAmount, 24.0, "2x Refrigerante (R$ 12) = R$ 24,00 na reserva anterior");
    assert.strictEqual(linkData.statement.welcomeKitSummary.peanutsConsumed, 2, "Cortesia salva na reserva anterior");

    // Confere que RES-102-IN (hóspede que ainda vai entrar hoje) permanece com extrato R$ 0,00!
    flats = await fetchFlatsStatus();
    const f102 = flats.find((f) => f.flatNumber === "102");
    assert.strictEqual(f102.currentReservation.code, "RES-102-IN");
    assert.strictEqual(f102.totalLaunchedAmount, 0, "Hóspede que vai entrar hoje não recebe cobrança anterior");
    assert.strictEqual(f102.hasRealInspectionToday, true, "Flat 102 já consta como conferido hoje");
    assert.strictEqual(f102.linkedCorrectionToday, true, "Indica que houve correção vinculada à última reserva hoje");

    // 4c. Edge Case: Tentar link_last_reservation no Flat 509 (sem nenhuma reserva anterior) -> retorna 400
    const errRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "509",
        unoccupiedLaunchMode: "link_last_reservation",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        isDailyLaunch: true,
        consumedItems: [{ productId: "prod_chiclete", quantity: 1 }]
      })
    });
    assert.strictEqual(errRes.status, 400, "Deve rejeitar vínculo quando não existe reserva anterior no flat");
  });

  it("5. Consumo Separado por Dia + Consumo das Cortesias (Bug Fix: apenas cortesia + soma multi-dia sem cobrar R$)", async () => {
    // Dia 1 (ontem): hóspede do Flat 211 consumiu APENAS cortesias (1 água + 1 amendoim, 0 itens pagos)
    const day1Res = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-211-STAY",
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        launchDate: yesterdayStr,
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 1 },
        consumedItems: [],
        restockedItems: []
      })
    });
    assert.strictEqual(day1Res.status, 200);

    // Dia 2 (hoje): hóspede do Flat 211 consumiu mais 1 água + 1 amendoim de cortesia + 2 chocolates pagos (R$ 12 un = R$ 24)
    const day2Res = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-211-STAY",
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 1 },
        consumedItems: [{ productId: "prod_chocolate", quantity: 2 }],
        restockedItems: [{ productId: "prod_chocolate", quantity: 2, isCourtesy: false }]
      })
    });
    assert.strictEqual(day2Res.status, 200);

    // Verifica em /api/minibar/inspections/flats-status
    const flats = await fetchFlatsStatus();
    const f211 = flats.find((f) => f.flatNumber === "211");
    assert.ok(f211);

    // Soma de cortesias dos 2 dias: 1 + 1 = 2 águas e 1 + 1 = 2 amendoins!
    assert.strictEqual(f211.welcomeKitSummary.waterCupsConsumed, 2, "Deve somar 1 + 1 = 2 águas de cortesia");
    assert.strictEqual(f211.welcomeKitSummary.peanutsConsumed, 2, "Deve somar 1 + 1 = 2 amendoins de cortesia");
    assert.strictEqual(f211.consumedCourtesyItems.length, 2);

    // Consumo separado por dia em dailyLaunches: 2 dias distintos!
    assert.strictEqual(f211.dailyLaunches.length, 2, "Deve separar o consumo nos 2 dias (ontem e hoje)");

    const groupDay1 = f211.dailyLaunches.find((g) => g.dateYmd === yesterdayStr);
    const groupDay2 = f211.dailyLaunches.find((g) => g.dateYmd === todayStr);
    assert.ok(groupDay1, "Grupo do Dia 1 (apenas cortesia) deve existir em dailyLaunches");
    assert.ok(groupDay2, "Grupo do Dia 2 (cortesia + pago) deve existir em dailyLaunches");

    assert.strictEqual(groupDay1.totalDayAmount, 0, "Dia apenas com cortesia tem subtotal pago R$ 0,00");
    assert.strictEqual(groupDay1.items.filter((i) => i.isCourtesy).length, 2, "Dia 1 lista água e amendoim cortesia");

    assert.strictEqual(groupDay2.totalDayAmount, 24.0, "Dia 2 soma apenas os 2 chocolates pagos (R$ 24,00)");
    assert.strictEqual(groupDay2.items.filter((i) => i.isCourtesy).length, 2, "Dia 2 lista água e amendoim cortesia");
    assert.strictEqual(groupDay2.items.filter((i) => !i.isCourtesy).length, 1, "Dia 2 lista item pago");

    assert.strictEqual(f211.totalLaunchedAmount, 24.0, "Total cobrado da estadia permanece R$ 24,00");
    assert.strictEqual(f211.pendingBalance, 24.0);

    // Verifica que /api/minibar/reservation-context/:code e /api/minibar/flat-context expõem consumedCourtesyItems no topo
    const resCtxResp = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-211-STAY`);
    const resCtx = await resCtxResp.json();
    assert.strictEqual(resCtx.success, true);
    assert.strictEqual(Array.isArray(resCtx.consumedCourtesyItems), true);
    assert.strictEqual(resCtx.consumedCourtesyItems.length, 2, "Portal do hóspede recebe consumedCourtesyItems no topo");
    assert.strictEqual(resCtx.courtesyConsumed, true);
  });

  it("6. Contrato de UI em anserve-restock.tsx (Ordenamento salvo, Filtro Pendentes Todos, Modal Ver Consumo e Botão Cortesia)", () => {
    const uiCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/anserve-restock.tsx"), "utf-8");

    // Statuses exigidos
    assert.match(uiCode, /ENTRADA HOJE/, "Card deve exibir ENTRADA HOJE");
    assert.match(uiCode, /SAÍDA HOJE/, "Card deve exibir SAÍDA HOJE");
    assert.match(uiCode, /OCUPADO/, "Card deve exibir OCUPADO");
    assert.match(uiCode, /LIVRE/, "Card deve exibir LIVRE");

    // Ordenamento combinável salvo em localStorage (Q6)
    assert.match(uiCode, /ANSERVE_SORT_MODE_KEY/, "Deve persistir escolha de ordenamento no aparelho");
    assert.match(uiCode, /menor_maior/, "Deve ter opção Menor -> Maior");
    assert.match(uiCode, /maior_menor/, "Deve ter opção Maior -> Menor");

    // Janelinha Ver Consumo sem sair da tela e com rolagem
    assert.match(uiCode, /viewConsumptionModalFlat/, "Deve possuir modal dedicado Ver Consumo");
    assert.match(uiCode, /Ver Consumo/, "Card deve possuir botão Ver Consumo");
    assert.match(uiCode, /overflow-y-auto overscroll-contain/, "Janelinha Ver Consumo deve ter rolagem contida");

    // Botão de salvar no modal de lançamento habilitado quando há apenas cortesia
    assert.match(
      uiCode,
      /welcomeKitWaterConsumed === 0 &&\s*welcomeKitPeanutsConsumed === 0/,
      "Botão de salvar lançamento deve permitir salvar quando apenas cortesia foi selecionada"
    );

    // Opções de conferência em flat sem hóspede (Q4)
    assert.match(uiCode, /internal_adjustment/, "Deve permitir Ajuste Interno em flat sem hóspede");
    assert.match(uiCode, /link_last_reservation/, "Deve permitir Vincular à última reserva que saiu");
  });

  it("7. Regressão: Preservação de cortesias em múltiplos vínculos pós-saída, extrato visível após virar OCUPADO e blindagem de flat LIVRE sem código", async () => {
    await setSimulatedClockHHMM("11:00");

    // 7a. Registra uma inspeção retroativa da estadia de RES-102-PREV (twoDaysAgoStr) com 1 água de cortesia
    const inStayPrevRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "102",
        reservationCode: "RES-102-PREV",
        inspectedBy: "Maria Repositora",
        status: "conforme",
        isDailyLaunch: false,
        launchDate: twoDaysAgoStr,
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(inStayPrevRes.status, 200);

    // 7b. Faz um SEGUNDO lançamento link_last_reservation em RES-102-PREV hoje (sem novas cortesias, apenas +1 chiclete)
    // Antes da correção, !i.noActiveGuestInFlat apagava os 2 amendoins vinculados no teste 4b!
    const secondLinkRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "102",
        reservationCode: "RES-102-PREV",
        targetLastReservationCode: "RES-102-PREV",
        unoccupiedLaunchMode: "link_last_reservation",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 0 },
        consumedItems: [{ productId: "prod_chiclete", quantity: 1 }]
      })
    });
    assert.strictEqual(secondLinkRes.status, 200);
    const secondLinkData = await secondLinkRes.json();
    assert.strictEqual(secondLinkData.whatsappSofiaAlertSent, false);
    assert.strictEqual(
      secondLinkData.statement.welcomeKitSummary.waterCupsConsumed,
      1,
      "Deve preservar 1 água da estadia anterior"
    );
    assert.strictEqual(
      secondLinkData.statement.welcomeKitSummary.peanutsConsumed,
      2,
      "NÃO pode apagar os 2 amendoins vinculados anteriormente via link_last_reservation"
    );
    assert.strictEqual(
      secondLinkData.statement.dailyLaunches.length,
      2,
      "Deve separar por dia a cortesia de anteontem e a correção vinculada de hoje"
    );

    // 7c. Às 15:30 Flat 102 vira OCUPADO (RES-102-IN), mantendo linkedCorrectionToday === true E o extrato de lastDepartedReservation preenchido para o botão [Ver]
    await setSimulatedClockHHMM("15:30");
    const flatsAfter15 = await fetchFlatsStatus();
    const f102After15 = flatsAfter15.find((f) => f.flatNumber === "102");
    assert.strictEqual(f102After15.status, "ocupado");
    assert.strictEqual(f102After15.linkedCorrectionToday, true);
    assert.ok(
      f102After15.lastDepartedReservation.dailyLaunches.length >= 2,
      "Botão [Ver] da correção vinculada deve continuar exibindo dailyLaunches mesmo após o flat virar OCUPADO às 15h"
    );
    await setSimulatedClockHHMM("11:00");

    // 7d. Chamada legada/direta em flat LIVRE (Flat 408) sem reservationCode e sem noActiveGuestInFlat NÃO pode cobrar RES-408-LAST!
    const ordersCountBefore408 = db.minibarOrders.length;
    const rawFreeFlatRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "408",
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        launchDate: todayStr,
        consumedItems: [{ productId: "prod_refrigerante", quantity: 1 }]
      })
    });
    assert.strictEqual(rawFreeFlatRes.status, 200);
    const rawFreeData = await rawFreeFlatRes.json();
    assert.strictEqual(rawFreeData.chargeOrderId, null, "Flat LIVRE sem reservationCode nunca deve cobrar reserva passada");
    assert.strictEqual(rawFreeData.whatsappSofiaAlertSent, false, "Flat LIVRE nunca dispara WhatsApp");
    assert.strictEqual(db.minibarOrders.length, ordersCountBefore408);

    // 7e. Tentar marcar NQ em flat ENTRADA HOJE antes do check-in (11:00) sem hóspede hospedado -> retorna 400
    const nqBeforeCheckinRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "101",
        inspectedBy: "Maria Repositora",
        status: "nq"
      })
    });
    assert.strictEqual(nqBeforeCheckinRes.status, 400, "NQ em ENTRADA HOJE antes do check-in deve ser rejeitado com 400");
  });

  it("8. Regressão Financeira: Teto rígido de 2/2 cortesias por estadia em /api/minibar/settlement mesmo após 3+ inspeções", async () => {
    const settleBeforeResp = await fetch(`${BASE_URL}/api/minibar/settlement`);
    const settleBefore = await settleBeforeResp.json();
    const waterBefore = settleBefore.courtesyWaterCupsTotal;

    // RES-211-STAY já atingiu 2/2 águas e 2/2 amendoins no teste 5; enviar mais 2 de cada em 3ª inspeção NÃO pode inflar settlement
    const extraCourtesyRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-211-STAY",
        inspectedBy: "Maria Repositora",
        status: "conforme",
        isDailyLaunch: false,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 2, mendoratoPeanuts: 2 }
      })
    });
    assert.strictEqual(extraCourtesyRes.status, 200);
    const extraData = await extraCourtesyRes.json();
    assert.strictEqual(
      extraData.inspection.welcomeKitConsumption.waterCups,
      0,
      "Inspeção excedente após atingir 2/2 na estadia deve gravar delta 0 de água"
    );
    assert.strictEqual(
      extraData.inspection.welcomeKitConsumption.mendoratoPeanuts,
      0,
      "Inspeção excedente após atingir 2/2 na estadia deve gravar delta 0 de amendoim"
    );

    const settleAfterResp = await fetch(`${BASE_URL}/api/minibar/settlement`);
    const settleAfter = await settleAfterResp.json();
    assert.strictEqual(
      settleAfter.courtesyWaterCupsTotal,
      waterBefore,
      "Reembolso de copos d'água da Anserve em /settlement não pode ultrapassar 2 un. por estadia"
    );
  });

  it("9. Ajuste Interno sem hóspede NÃO infla reembolso de cortesia em /settlement nem em /anserve-reports (courtesySummary)", async () => {
    const settleBeforeResp = await fetch(`${BASE_URL}/api/minibar/settlement`);
    const settleBefore = await settleBeforeResp.json();
    const reportsBeforeResp = await fetch(`${BASE_URL}/api/minibar/anserve-reports`);
    const reportsBefore = await reportsBeforeResp.json();

    // Estadias reais até aqui: RES-313-OUT (1 água, 0 amendoim), RES-102-PREV (1 água, 2 amendoins), RES-211-STAY (2 águas, 2 amendoins) = 4 águas e 4 amendoins
    // (O 1 copo d'água do ajuste interno do Flat 408 no teste 4a NÃO pode entrar nessa conta!)
    assert.strictEqual(
      settleBefore.courtesyWaterCupsTotal,
      4,
      "Settlement deve somar apenas cortesias de hóspedes (4 copos), excluindo ajuste interno do Flat 408"
    );
    assert.strictEqual(settleBefore.courtesyMendoratoPeanutsTotal, 4);
    assert.strictEqual(settleBefore.courtesyWaterTotalCost, 8.0);
    assert.strictEqual(
      reportsBefore.courtesySummary.totalCourtesyWaterCups,
      4,
      "anserve-reports courtesySummary deve excluir ajustes internos sem hóspede"
    );
    assert.strictEqual(reportsBefore.courtesySummary.totalCourtesyMendoratoPeanuts, 4);

    // Registra novo Ajuste Interno em flat LIVRE (Flat 509) com 2 águas e 2 amendoins de baixa interna
    const intCourtesyRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "509",
        unoccupiedLaunchMode: "internal_adjustment",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        status: "ocorrencia_interna",
        isDailyLaunch: true,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 2, mendoratoPeanuts: 2 },
        notes: "Baixa interna de kit danificado em flat livre"
      })
    });
    assert.strictEqual(intCourtesyRes.status, 200);

    const settleAfterResp = await fetch(`${BASE_URL}/api/minibar/settlement`);
    const settleAfter = await settleAfterResp.json();
    const reportsAfterResp = await fetch(`${BASE_URL}/api/minibar/anserve-reports`);
    const reportsAfter = await reportsAfterResp.json();

    assert.strictEqual(
      settleAfter.courtesyWaterCupsTotal,
      4,
      "Baixa interna em flat sem hóspede não pode inflar totalCourtesyWaterCups"
    );
    assert.strictEqual(
      settleAfter.netPayableToAnserve,
      settleBefore.netPayableToAnserve,
      "Baixa interna não pode inflar netPayableToAnserve"
    );
    assert.strictEqual(reportsAfter.courtesySummary.totalCourtesyWaterCups, 4);
    assert.strictEqual(reportsAfter.courtesySummary.totalCourtesyMendoratoPeanuts, 4);
  });

  it("10. Produtividade e Relatórios: ocorrencia_interna é contabilizada separadamente e NUNCA cai em conformeCount / totalConforme", async () => {
    const repBefore = await (await fetch(`${BASE_URL}/api/minibar/anserve-reports`)).json();
    const staffBefore = await (await fetch(`${BASE_URL}/api/minibar/staff`)).json();
    const mariaBefore = staffBefore.staff.find((s) => s.username === "repositora").productivity;

    const psBefore = repBefore.productivitySummary;
    assert.ok(psBefore.totalInternalAdjustments >= 3, "Deve contabilizar ajustes internos já registrados");
    assert.strictEqual(
      psBefore.totalInspections,
      psBefore.totalConforme +
        psBefore.totalDiscrepancies +
        psBefore.totalInternalAdjustments +
        psBefore.totalNq +
        psBefore.totalNp,
      "Soma exata das categorias de inspeção deve igualar totalInspections"
    );
    assert.strictEqual(
      mariaBefore.inspectionsCount,
      mariaBefore.conformeCount +
        mariaBefore.discrepancyCount +
        mariaBefore.internalAdjustmentCount +
        mariaBefore.nqCount +
        mariaBefore.npCount,
      "Soma exata das categorias de Maria Repositora deve igualar inspectionsCount"
    );

    // 10a. Passagem preventiva CONFORME (0 itens em falta) em flat livre -> incrementa conformeCount (+1) e NÃO internalAdjustmentCount
    const prevConformeRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "509",
        unoccupiedLaunchMode: "internal_adjustment",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        status: "conforme",
        isDailyLaunch: false,
        launchDate: todayStr
      })
    });
    assert.strictEqual(prevConformeRes.status, 200);

    // 10b. Ocorrência / Ajuste Interno (status ocorrencia_interna com item em falta) -> incrementa internalAdjustmentCount (+1) e NUNCA conformeCount
    const newAdjRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "509",
        unoccupiedLaunchMode: "internal_adjustment",
        noActiveGuestInFlat: true,
        inspectedBy: "Maria Repositora",
        status: "ocorrencia_interna",
        isDailyLaunch: true,
        launchDate: todayStr,
        consumedItems: [{ productId: "prod_chiclete", quantity: 1 }],
        restockedItems: [{ productId: "prod_chiclete", quantity: 1, isCourtesy: false }]
      })
    });
    assert.strictEqual(newAdjRes.status, 200);

    const repAfter = await (await fetch(`${BASE_URL}/api/minibar/anserve-reports`)).json();
    const staffAfter = await (await fetch(`${BASE_URL}/api/minibar/staff`)).json();
    const mariaAfter = staffAfter.staff.find((s) => s.username === "repositora").productivity;

    assert.strictEqual(
      repAfter.productivitySummary.totalConforme,
      psBefore.totalConforme + 1,
      "Apenas a passagem conforme incrementa totalConforme (+1); ocorrencia_interna NÃO entra em totalConforme"
    );
    assert.strictEqual(
      repAfter.productivitySummary.totalInternalAdjustments,
      psBefore.totalInternalAdjustments + 1,
      "ocorrencia_interna incrementa exclusivamente totalInternalAdjustments (+1)"
    );
    assert.strictEqual(mariaAfter.conformeCount, mariaBefore.conformeCount + 1);
    assert.strictEqual(mariaAfter.internalAdjustmentCount, mariaBefore.internalAdjustmentCount + 1);
  });

  it("11. Correção de Cortesia Lançada por Engano (2/2 -> 1/2 -> 0/2 -> novo lançamento) + Botões Inequívocos na UI", async () => {
    const staffBefore = await (await fetch(`${BASE_URL}/api/minibar/staff`)).json();
    const mariaCountBefore = staffBefore.staff.find((s) => s.username === "repositora").productivity.inspectionsCount;

    // 11a. Correção inline (janelinha Ver Consumo -> /api/minibar/inspections/courtesy-correction) em RES-211-STAY:
    //      Estava em 2/2 águas e 2/2 amendoins (Dia 1 = 1+1, Dia 2 = 1+1). Corrige para 1/2 água e 0/2 amendoins!
    const corrInlineRes = await fetch(`${BASE_URL}/api/minibar/inspections/courtesy-correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-211-STAY",
        inspectedBy: "Maria Repositora",
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(corrInlineRes.status, 200);
    const corrInlineData = await corrInlineRes.json();
    assert.strictEqual(corrInlineData.success, true);
    assert.strictEqual(corrInlineData.whatsappSofiaAlertSent, false, "Correção de cortesia nunca envia WhatsApp");
    assert.strictEqual(corrInlineData.statement.welcomeKitSummary.waterCupsConsumed, 1);
    assert.strictEqual(corrInlineData.statement.welcomeKitSummary.peanutsConsumed, 0);

    // Não deve inflar contador de passagens da repositora
    const staffAfterInline = await (await fetch(`${BASE_URL}/api/minibar/staff`)).json();
    assert.strictEqual(
      staffAfterInline.staff.find((s) => s.username === "repositora").productivity.inspectionsCount,
      mariaCountBefore,
      "Correção inline na janelinha Ver Consumo não deve criar passagem fantasma"
    );

    // Verifica separação por dia em flats-status: Dia 1 manteve 1 água (0 amendoins) e Dia 2 zerou cortesias mantendo os 2 chocolates pagos
    let flats = await fetchFlatsStatus();
    let f211 = flats.find((f) => f.flatNumber === "211");
    assert.strictEqual(f211.welcomeKitSummary.waterCupsConsumed, 1);
    assert.strictEqual(f211.welcomeKitSummary.peanutsConsumed, 0);
    const d1AfterCorr = f211.dailyLaunches.find((g) => g.dateYmd === yesterdayStr);
    const d2AfterCorr = f211.dailyLaunches.find((g) => g.dateYmd === todayStr);
    assert.ok(d1AfterCorr, "Dia 1 continua visível com a 1 água restante");
    assert.strictEqual(d1AfterCorr.items.length, 1);
    assert.strictEqual(d1AfterCorr.items[0].productId, "prod_agua_mineral_copo");
    assert.strictEqual(d1AfterCorr.items[0].quantity, 1);
    assert.strictEqual(d2AfterCorr.items.filter((i) => i.isCourtesy).length, 0, "Cortesias lançadas por engano hoje foram removidas do Dia 2");
    assert.strictEqual(d2AfterCorr.totalDayAmount, 24.0, "Itens pagos do Dia 2 permanecem intactos");

    // Verifica que /settlement refletiu imediatamente a redução (de 4 águas p/ 3 águas = R$ 6,00)
    let settle = await (await fetch(`${BASE_URL}/api/minibar/settlement`)).json();
    assert.strictEqual(settle.courtesyWaterCupsTotal, 3, "Settlement deve reduzir de 4 para 3 copos após correção");
    assert.strictEqual(settle.courtesyWaterTotalCost, 6.0);
    assert.strictEqual(settle.courtesyMendoratoPeanutsTotal, 2);

    // 11b. Zerar totalmente as cortesias via modal Lançar/Sem Consumo (POST /api/minibar/inspections com welcomeKitMode: 'set_total' -> 0/2 e 0/2)
    const zeroCorrRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-211-STAY",
        inspectedBy: "Maria Repositora",
        status: "lancamento_diario",
        isDailyLaunch: true,
        launchDate: todayStr,
        welcomeKitMode: "set_total",
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 0 },
        consumedItems: []
      })
    });
    assert.strictEqual(zeroCorrRes.status, 200);
    const zeroCorrData = await zeroCorrRes.json();
    assert.strictEqual(zeroCorrData.whatsappSofiaAlertSent, false);
    assert.strictEqual(zeroCorrData.statement.welcomeKitSummary.waterCupsConsumed, 0);
    assert.strictEqual(zeroCorrData.statement.welcomeKitSummary.peanutsConsumed, 0);
    assert.strictEqual(
      zeroCorrData.statement.dailyLaunches.some((g) => g.dateYmd === yesterdayStr),
      false,
      "Dia 1 (que só tinha cortesia) deve sumir de dailyLaunches após zerar a cortesia sem deixar dia vazio"
    );

    settle = await (await fetch(`${BASE_URL}/api/minibar/settlement`)).json();
    assert.strictEqual(settle.courtesyWaterCupsTotal, 2, "Settlement cai para 2 copos após zerar cortesia de RES-211-STAY");

    // 11c. Novo lançamento aditivo normal (+1 água) após correção volta a funcionar normalmente sem ficar travado pelo antigo 2/2
    const relaunchRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-211-STAY",
        inspectedBy: "Maria Repositora",
        status: "conforme",
        isDailyLaunch: false,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(relaunchRes.status, 200);
    flats = await fetchFlatsStatus();
    f211 = flats.find((f) => f.flatNumber === "211");
    assert.strictEqual(f211.welcomeKitSummary.waterCupsConsumed, 1, "Novo lançamento aditivo após correção registra 1/2 água");

    // 11d. Contrato de UI: botões inequívocos (+0/+1/+2 quando já há cortesia salva) + modo de correção em anserve-restock.tsx
    const uiCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/anserve-restock.tsx"), "utf-8");
    assert.match(uiCode, /Corrigir cortesia salva/, "Deve ter botão explícito para corrigir cortesia já salva");
    assert.match(uiCode, /courtesy-correction/, "Janelinha Ver Consumo deve acionar endpoint de correção de cortesia");
    assert.match(uiCode, /welcomeKitMode/, "Modais devem enviar welcomeKitMode='set_total' ao corrigir cortesia");
    assert.match(uiCode, /\+\$\{num\}/, "Botões aditivos devem exibir prefixo + (+0, +1, +2) quando já existe cortesia salva");
  });

  it("12. Regressão: Passagem +0 preserva cortesia semeada na reserva e correção p/ cima respeita a data do dia (effectiveDateStr)", async () => {
    await setSimulatedClockHHMM("15:30");

    // 12a. Reserva RES-101-IN (OCUPADO às 15:30) possui cortesia gravada na reserva + 1 passagem conforme anterior sem welcomeKitConsumption
    const res101 = db.reservations.find((r) => r.code === "RES-101-IN");
    res101.welcomeKitConsumption = {
      waterCups: 2,
      mendoratoPeanuts: 1,
      waterCupsConsumed: 2,
      peanutsConsumed: 1,
      lastLaunchDate: todayStr
    };
    db.minibarInspections.push({
      id: "INSP-101-PRIOR-CONFORME",
      flatNumber: "101",
      reservationId: res101.id,
      reservationCode: "RES-101-IN",
      inspectorName: "Maria Repositora",
      inspectedAt: new Date().toISOString(),
      launchDate: todayStr,
      status: "conforme",
      welcomeKitConsumption: null
    });

    // Envia passagem Sem Consumo com +0 águas e +0 amendoins -> NÃO pode zerar o 2/2 e 1/2 semeado!
    const passZeroRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "101",
        reservationCode: "RES-101-IN",
        inspectedBy: "Maria Repositora",
        status: "conforme",
        isDailyLaunch: false,
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(passZeroRes.status, 200);
    const passZeroData = await passZeroRes.json();
    assert.strictEqual(
      passZeroData.statement.welcomeKitSummary.waterCupsConsumed,
      2,
      "Passagem aditiva +0 não pode apagar 2/2 águas semeadas quando já existe inspeção prévia"
    );
    assert.strictEqual(
      passZeroData.statement.welcomeKitSummary.peanutsConsumed,
      1,
      "Passagem aditiva +0 não pode apagar 1/2 amendoim semeado quando já existe inspeção prévia"
    );

    // Zera cortesia de RES-101-IN via courtesy-correction para manter base limpa p/ próximos asserts
    const reset101 = await fetch(`${BASE_URL}/api/minibar/inspections/courtesy-correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "101",
        reservationCode: "RES-101-IN",
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(reset101.status, 200);

    // 12b. Correção para cima (1 -> 2 águas) hoje em RES-102-PREV (cuja única água era de anteontem twoDaysAgoStr)
    //      deve alocar a +1 água em todayStr e NÃO alterar a quantidade do grupo de twoDaysAgoStr!
    const upCorrRes = await fetch(`${BASE_URL}/api/minibar/inspections/courtesy-correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "102",
        reservationCode: "RES-102-PREV",
        targetLastReservationCode: "RES-102-PREV",
        unoccupiedLaunchMode: "link_last_reservation",
        inspectedBy: "Maria Repositora",
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 2, mendoratoPeanuts: 2 }
      })
    });
    assert.strictEqual(upCorrRes.status, 200);
    const upCorrData = await upCorrRes.json();
    assert.strictEqual(upCorrData.statement.welcomeKitSummary.waterCupsConsumed, 2);
    const groupTwoDaysAgo = upCorrData.statement.dailyLaunches.find((g) => g.dateYmd === twoDaysAgoStr);
    const groupToday102 = upCorrData.statement.dailyLaunches.find((g) => g.dateYmd === todayStr);
    assert.strictEqual(
      groupTwoDaysAgo.items.find((i) => i.productId === "prod_agua_mineral_copo")?.quantity,
      1,
      "Inspeção histórica de anteontem deve permanecer com 1 água"
    );
    assert.strictEqual(
      groupToday102.items.find((i) => i.productId === "prod_agua_mineral_copo")?.quantity,
      1,
      "Delta positivo (+1 água) corrigido hoje deve aparecer no grupo de hoje"
    );

    await setSimulatedClockHHMM("11:00");
  });

  it("13. Blindagem de Escopo em courtesy-correction (sem fallthrough indevido + ajuste interno) e ocorrencia_interna direta", async () => {
    await setSimulatedClockHHMM("15:30");

    // 13a. Flat 101 às 15:30 está OCUPADO por RES-101-IN e NÃO tem reserva anterior que saiu:
    //      chamar courtesy-correction com unoccupiedLaunchMode='link_last_reservation' DEVE retornar 400 e NUNCA alterar RES-101-IN!
    const badLinkCorr = await fetch(`${BASE_URL}/api/minibar/inspections/courtesy-correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "101",
        unoccupiedLaunchMode: "link_last_reservation",
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 2, mendoratoPeanuts: 2 }
      })
    });
    assert.strictEqual(badLinkCorr.status, 400, "Sem reserva anterior, link_last_reservation em courtesy-correction deve retornar 400");
    const flatsCheck101 = await fetchFlatsStatus();
    assert.strictEqual(
      flatsCheck101.find((f) => f.flatNumber === "101").welcomeKitSummary.waterCupsConsumed,
      0,
      "RES-101-IN não pode ser mutada por fallthrough de link_last_reservation"
    );

    await setSimulatedClockHHMM("11:00");

    // 13b. Correção de baixa interna de cortesia em flat LIVRE (Flat 509 tinha 2 águas e 2 amendoins internos do teste 9)
    let flats509Before = await fetchFlatsStatus();
    let f509Before = flats509Before.find((f) => f.flatNumber === "509");
    assert.strictEqual(f509Before.internalWelcomeKitToday.waterCups, 2);
    assert.strictEqual(f509Before.internalWelcomeKitToday.mendoratoPeanuts, 2);

    const intCorrRes = await fetch(`${BASE_URL}/api/minibar/inspections/courtesy-correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "509",
        unoccupiedLaunchMode: "internal_adjustment",
        inspectedBy: "Maria Repositora",
        launchDate: todayStr,
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 0 }
      })
    });
    assert.strictEqual(intCorrRes.status, 200);
    const intCorrData = await intCorrRes.json();
    assert.strictEqual(intCorrData.internalWelcomeKitToday.waterCups, 0);
    assert.strictEqual(intCorrData.internalWelcomeKitToday.mendoratoPeanuts, 0);

    const flats509After = await fetchFlatsStatus();
    const f509After = flats509After.find((f) => f.flatNumber === "509");
    assert.strictEqual(f509After.internalWelcomeKitToday.waterCups, 0);

    // 13c. Enviar status='ocorrencia_interna' diretamente sem unoccupiedLaunchMode em flat ocupado NÃO cobra hóspede nem envia WhatsApp
    const ordersBeforeDirectInt = db.minibarOrders.length;
    const directIntRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "211",
        status: "ocorrencia_interna",
        inspectedBy: "Maria Repositora",
        launchDate: todayStr,
        consumedItems: [{ productId: "prod_chiclete", quantity: 1 }],
        notes: "Item avariado substituído pela equipe"
      })
    });
    assert.strictEqual(directIntRes.status, 200);
    const directIntData = await directIntRes.json();
    assert.strictEqual(directIntData.chargeOrderId, null, "ocorrencia_interna direta nunca pode gerar pedido de cobrança");
    assert.strictEqual(directIntData.whatsappSofiaAlertSent, false, "ocorrencia_interna direta nunca dispara WhatsApp");
    assert.strictEqual(directIntData.inspection.status, "ocorrencia_interna");
    assert.strictEqual(db.minibarOrders.length, ordersBeforeDirectInt);
  });

  it("14. Consistência de Insights 360°, Analytics e UI de Reembolso/Correção (anserve-dashboard.tsx & anserve-restock.tsx)", async () => {
    const insightsResp = await fetch(`${BASE_URL}/api/minibar/analytics/insights-360`);
    assert.strictEqual(insightsResp.status, 200);
    const insights = await insightsResp.json();
    const settle = await (await fetch(`${BASE_URL}/api/minibar/settlement`)).json();

    // Estadias de hóspedes neste momento: RES-313-OUT (1 água), RES-102-PREV (2 águas, 2 amendoins), RES-211-STAY (1 água) = 4 águas (R$ 8,00) + 2 amendoins = 6 unidades
    assert.strictEqual(settle.courtesyWaterCupsTotal, 4);
    assert.strictEqual(settle.courtesyWaterTotalCost, 8.0);
    assert.strictEqual(
      insights.kpis.courtesyCostTotal,
      8.0,
      "Insights 360° deve refletir exatamente o custo de águas de cortesia de hóspedes (R$ 8,00), sem somar baixas internas"
    );
    assert.strictEqual(
      insights.kpis.courtesyUnitsTotal,
      6,
      "Insights 360° deve somar as 6 cortesias consumidas por hóspedes (4 águas + 2 amendoins), excluindo baixas internas"
    );

    const analytics = await (await fetch(`${BASE_URL}/api/minibar/analytics`)).json();
    const nonSyntheticCount = db.minibarInspections.filter((i) => i && !i.isCourtesyCorrectionOnly).length;
    assert.strictEqual(
      analytics.inspections.total,
      nonSyntheticCount,
      "/api/minibar/analytics não deve inflar total de inspeções com registros técnicos isCourtesyCorrectionOnly"
    );

    const dashCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/anserve-dashboard.tsx"), "utf-8");
    assert.match(
      dashCode,
      /settlement\?\.totalCourtesyReimbursement/,
      "Card de Líquido a Receber em anserve-dashboard.tsx deve exibir totalCourtesyReimbursement em vez de apenas courtesyRestockCost legado"
    );
    assert.match(dashCode, /Passagens Conformes/, "CSV de produtividade deve exportar coluna Passagens Conformes");

    const restockCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/anserve-restock.tsx"), "utf-8");
    assert.match(
      restockCode,
      /handleSaveViewModalCourtesyCorrection\("last_departed"\)/,
      "Janelinha Ver Consumo deve permitir corrigir cortesia da última reserva que saiu (dobradinha / pós-saída)"
    );
  });
});
