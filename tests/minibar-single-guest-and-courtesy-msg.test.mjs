/**
 * Teste Pontual Estrito — Ocultar Divisão de Conta para Hóspede Único +
 * Aviso Pós-Check-out no WhatsApp para Consumo Exclusivo de Cortesia
 *
 * Execução: node --test tests/minibar-single-guest-and-courtesy-msg.test.mjs
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const TEST_PORT = 59883;
process.env.NODE_ENV = "test";
process.env.PORT = String(TEST_PORT);
process.env.AUTH_SECRET = "test-secret-minibar-single-courtesy-59883";
delete process.env.DATABASE_URL;

const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");
const initialRealDbHash = fs.existsSync(REAL_DB_PATH)
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex")
  : null;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "minibar-single-courtesy-test-"));
const tmpDbPath = path.join(tmpDir, "isolated-db.json");
process.env.DATA_FILE = tmpDbPath;
process.env.DATABASE_FILE = tmpDbPath;

const initialSeedDb = {
  users: [
    { id: 1, username: "admin", role: "admin", name: "Admin Teste" },
    { id: 2, username: "repositora", role: "anserve_repositora", name: "Repositora Teste", pin: "1234" }
  ],
  flats: [
    { id: 211, number: "211", floor: 2, status: "clean" },
    { id: 212, number: "212", floor: 2, status: "clean" },
    { id: 215, number: "215", floor: 2, status: "clean" },
    { id: 313, number: "313", floor: 3, status: "clean" },
    { id: 408, number: "408", floor: 4, status: "clean" },
    { id: 511, number: "511", floor: 5, status: "clean" },
    { id: 605, number: "605", floor: 6, status: "clean" },
    { id: 907, number: "907", floor: 9, status: "clean" }
  ],
  guests: [],
  reservations: [],
  minibarProducts: [
    { id: "prod_agua_mineral_copo", name: "Copo d'Água Mineral 200ml", price: 0, cost: 2, isCourtesy: true, category: "Kit de Boas-Vindas" },
    { id: "prod_amendoim_mendorato", name: "Amendoim Mendorato 27g", price: 0, cost: 0, isCourtesy: true, category: "Kit de Boas-Vindas" },
    { id: "prod_biscoito", name: "Biscoito Salgado", price: 12, cost: 5, isCourtesy: false, category: "Snacks" }
  ],
  minibarOrders: [],
  minibarInspections: [],
  notifications: [],
  auditLogs: [],
  settings: { baseUrl: "https://corpflats.com.br" }
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialSeedDb, null, 2));

const serverMod = await import("../artifacts/api-server/demo-server.mjs");
const {
  httpServer,
  db,
  setMinibarTestHooks,
  DEFAULT_MINIBAR_COURTESY_ONLY_WA_TEMPLATE,
  formatMinibarCourtesyItemsNaturalList,
  computeMinibarCanSplitBill
} = serverMod;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("Divisão Oculta para Hóspede Único & Aviso Pós-Check-out de Cortesia", () => {
  const waSent = [];
  const convLogged = [];

  before(async () => {
    if (!httpServer.listening) {
      await new Promise(resolve => httpServer.once("listening", resolve));
    }
  });

  beforeEach(() => {
    waSent.length = 0;
    convLogged.length = 0;
    db.reservations = [];
    db.minibarOrders = [];
    db.minibarInspections = [];
    db.fnrhAuditDocuments = [];
    db.minibarSettings = {
      ...(db.minibarSettings || {}),
      anservePin: "1234",
      autoNotifySofiaOnDiscrepancy: true,
      sendCourtesyOnlyCheckoutWhatsApp: true,
      courtesyOnlyCheckoutWhatsAppTemplate: DEFAULT_MINIBAR_COURTESY_ONLY_WA_TEMPLATE
    };
    setMinibarTestHooks({
      sendZapiMessage: async (_cfg, payload) => {
        waSent.push(payload);
        return { success: true };
      },
      appendMessageToConversation: (_db, payload) => {
        convLogged.push(payload);
      }
    });
  });

  after(async () => {
    setMinibarTestHooks(null);
    try {
      if (typeof httpServer.closeAllConnections === "function") httpServer.closeAllConnections();
      await new Promise(resolve => httpServer.close(() => resolve()));
    } catch (_) {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    if (initialRealDbHash && fs.existsSync(REAL_DB_PATH)) {
      const finalHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
      assert.strictEqual(finalHash, initialRealDbHash, "data/database.json real jamais pode ser alterado pelo teste");
    }
    setTimeout(() => process.exit(0), 50).unref?.();
    setTimeout(() => process.exit(0), 250);
  });

  it("1. Reserva para 1 pessoa bloqueia divisão (canSplitBill: false) mesmo tentando salvar half_and_half/by_item ou placeholder", async () => {
    db.reservations.push({
      id: 1001,
      code: "RES-SOLO-211",
      flatId: 211,
      flatNumber: "211",
      guestName: "João Sozinho",
      guestPhone: "5522999111111",
      numGuests: 1,
      status: "checked_in",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-20"
    });
    db.minibarOrders.push({
      id: "ORD-MB-DIV-SOLO-211",
      flatNumber: "211",
      reservationId: 1001,
      reservationCode: "RES-SOLO-211",
      guestName: "João Sozinho",
      totalAmount: 24,
      remainingAmount: 24,
      paymentStatus: "pendente",
      source: "restocker_launch",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 2, unitPrice: 12, totalPrice: 24 }]
    });

    const ctxRes = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-SOLO-211`);
    assert.strictEqual(ctxRes.status, 200);
    const ctx = await ctxRes.json();
    assert.strictEqual(ctx.canSplitBill, false);
    assert.strictEqual(ctx.registeredGuestsCount, 1);
    assert.strictEqual(ctx.splitBreakdown.canSplitBill, false);
    assert.strictEqual(ctx.splitBreakdown.mode, "titular");

    // Tentativa de forçar divisão meio a meio com placeholder "2º Hóspede" deve ficar travada em "titular"
    const saveRes = await fetch(`${BASE_URL}/api/minibar/split-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-SOLO-211",
        mode: "half_and_half",
        guestUpdate: { index: 2, name: "2º Hóspede", phone: "", email: "", cpf: "" }
      })
    });
    assert.strictEqual(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.strictEqual(saveData.canSplitBill, false);
    assert.strictEqual(saveData.splitConfig.mode, "titular");
    assert.strictEqual(saveData.splitBreakdown.mode, "titular");
    assert.strictEqual(saveData.reservationGuests.length, 1, "Não pode injetar slot placeholder em reserva solo");
  });

  it("2. Reserva com numGuests: 2 mas apenas 1 hóspede com dados reais também bloqueia divisão (canSplitBill: false)", async () => {
    db.reservations.push({
      id: 1002,
      code: "RES-TWO-ONLY1-212",
      flatId: 212,
      flatNumber: "212",
      guestName: "Maria Titular",
      guestPhone: "5522999222222",
      numGuests: 2,
      guests: [{ index: 1, name: "Maria Titular", phone: "5522999222222" }],
      minibarSplitConfig: { mode: "by_item", itemAssignments: {} },
      status: "checked_in",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-20"
    });
    db.minibarOrders.push({
      id: "ORD-MB-DIV-212",
      flatNumber: "212",
      reservationId: 1002,
      reservationCode: "RES-TWO-ONLY1-212",
      totalAmount: 12,
      remainingAmount: 12,
      paymentStatus: "pendente",
      source: "restocker_launch",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }]
    });

    const ctxRes = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-TWO-ONLY1-212`);
    assert.strictEqual(ctxRes.status, 200);
    const ctx = await ctxRes.json();
    assert.strictEqual(ctx.canSplitBill, false, "Com apenas 1 hóspede real e 2º slot placeholder, divisão deve ficar bloqueada");
    assert.strictEqual(ctx.registeredGuestsCount, 1);
    assert.strictEqual(ctx.splitBreakdown.mode, "titular", "Mesmo se havia config antiga by_item, força titular");
  });

  it("3. Reserva com 2 hóspedes reais cadastrados libera divisão (canSplitBill: true) normalmente", async () => {
    db.reservations.push({
      id: 1003,
      code: "RES-DUO-215",
      flatId: 215,
      flatNumber: "215",
      guestName: "Roberto Mendes",
      guestPhone: "5522999333331",
      numGuests: 2,
      guests: [
        { index: 1, name: "Roberto Mendes", phone: "5522999333331" },
        { index: 2, name: "Juliana Paiva", phone: "5522999333332" }
      ],
      status: "checked_in",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-20"
    });
    db.minibarOrders.push({
      id: "ORD-MB-DIV-215",
      flatNumber: "215",
      reservationId: 1003,
      reservationCode: "RES-DUO-215",
      totalAmount: 24,
      remainingAmount: 24,
      paymentStatus: "pendente",
      source: "restocker_launch",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 2, unitPrice: 12, totalPrice: 24 }]
    });

    const saveRes = await fetch(`${BASE_URL}/api/minibar/split-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationCode: "RES-DUO-215", mode: "half_and_half" })
    });
    assert.strictEqual(saveRes.status, 200);
    const data = await saveRes.json();
    assert.strictEqual(data.canSplitBill, true);
    assert.strictEqual(data.registeredGuestsCount, 2);
    assert.strictEqual(data.splitConfig.mode, "half_and_half");
    assert.strictEqual(data.splitBreakdown.shares.length, 2);
    assert.strictEqual(data.splitBreakdown.shares[0].amount, 12);
    assert.strictEqual(data.splitBreakdown.shares[1].amount, 12);
  });

  it("4. Conferência final pós-check-out com APENAS cortesia envia 1 msg curta ao Titular (idempotente)", async () => {
    const resObj = {
      id: 2001,
      code: "RES-CORTESIA-313",
      flatId: 313,
      flatNumber: "313",
      guestName: "Carlos Oliveira",
      guestPhone: "5522999444441",
      numGuests: 2,
      guests: [
        { index: 1, name: "Carlos Oliveira", phone: "5522999444441" },
        { index: 2, name: "Ana Acompanhante", phone: "5522999444442" }
      ],
      status: "completed",
      checkoutDone: true,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19"
    };
    db.reservations.push(resObj);

    const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "313",
        reservationCode: "RES-CORTESIA-313",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 2,
          mendoratoPeanuts: 1
        },
        missingItems: []
      })
    });
    assert.strictEqual(inspRes.status, 200);
    const inspData = await inspRes.json();

    assert.strictEqual(inspData.postCheckoutNotificationType, "courtesy_only_no_charge");
    assert.strictEqual(waSent.length, 1, "Deve enviar APENAS 1 mensagem (somente para o Titular, não para o acompanhante)");
    assert.strictEqual(waSent[0].phone, "5522999444441");
    assert.strictEqual(waSent[0].triggerEvent, "minibar_courtesy_only_checkout");
    assert.strictEqual(
      waSent[0].message,
      "Olá, Carlos! 😊 Conferimos o frigobar do *Flat 313* após seu check-out: não houve consumo cobrável. Os itens consumidos (2x Copo d'Água Mineral 200ml e 1x Amendoim Mendorato 27g) são cortesia do nosso Kit de Boas-Vindas. Obrigado pela estadia!"
    );
    assert.strictEqual(convLogged.length, 1, "Deve registrar no histórico do chat WhatsApp");
    assert.ok(resObj.minibarCourtesyOnlyWhatsappSentAt, "Deve gravar flag de idempotência na reserva");

    // 2ª inspeção/re-conferência pós-check-out NÃO pode reenviar (idempotente)
    const inspRes2 = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "313",
        reservationCode: "RES-CORTESIA-313",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 0,
          mendoratoPeanuts: 1
        },
        missingItems: []
      })
    });
    assert.strictEqual(inspRes2.status, 200);
    assert.strictEqual(waSent.length, 1, "Idempotência: não deve reenviar após 2ª passagem/ajuste");
  });

  it("5. Conferência final sem NENHUM consumo (nem cortesia), passagem diária em estadia e reserva com item pago NÃO enviam aviso de cortesia indevidamente", async () => {
    // 5a: Zero consumo total (0 água, 0 amendoim, 0 pagos)
    db.reservations.push({
      id: 2002,
      code: "RES-ZERO-408",
      flatId: 408,
      flatNumber: "408",
      guestName: "Pedro Zero",
      guestPhone: "5522999555551",
      status: "completed",
      checkoutDone: true,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19"
    });

    const zeroRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "408",
        reservationCode: "RES-ZERO-408",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 0,
          mendoratoPeanuts: 0
        },
        missingItems: []
      })
    });
    assert.strictEqual(zeroRes.status, 200);
    const zeroData = await zeroRes.json();
    assert.strictEqual(zeroData.postCheckoutNotificationType, "none_needed");
    assert.strictEqual(waSent.length, 0, "Quem não consumiu nem cortesia não recebe mensagem");

    // 5b: Consumiu cortesia, mas também teve consumo pago já quitado na estadia
    db.reservations.push({
      id: 2003,
      code: "RES-PAID-511",
      flatId: 511,
      flatNumber: "511",
      guestName: "Lucas Pagou",
      guestPhone: "5522999555552",
      status: "completed",
      checkoutDone: true,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19"
    });
    db.minibarOrders.push({
      id: "ORD-MB-PAID-511",
      flatNumber: "511",
      reservationId: 2003,
      reservationCode: "RES-PAID-511",
      guestName: "Lucas Pagou",
      totalAmount: 12,
      paymentMethod: "pix",
      paymentStatus: "pago",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }]
    });

    const paidRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "511",
        reservationCode: "RES-PAID-511",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 1,
          mendoratoPeanuts: 0
        },
        missingItems: []
      })
    });
    assert.strictEqual(paidRes.status, 200);
    assert.strictEqual(waSent.length, 0, "Se houve consumo pago na estadia, não deve dizer que não houve consumo");

    // 5c: Cortesia lançada durante a estadia (NÃO envia antes do check-out), depois check-out + conferência final (envia 1x)
    const inStayRes = {
      id: 2007,
      code: "RES-INSTAY-212",
      flatId: 212,
      flatNumber: "212",
      guestName: "Beatriz Estadia",
      guestPhone: "5522999555559",
      status: "checked_in",
      checkoutDone: false,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-20"
    };
    db.reservations.push(inStayRes);

    const dailyCourtesyRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "212",
        reservationCode: "RES-INSTAY-212",
        isDailyLaunch: true,
        isFinalCheckoutInspection: false,
        status: "lancamento_diario",
        welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 0 },
        consumedItems: []
      })
    });
    assert.strictEqual(dailyCourtesyRes.status, 200);
    assert.strictEqual(waSent.length, 0, "Durante a estadia NÃO deve enviar aviso de cortesia pós-check-out");

    // Hóspede faz check-out e repositora faz conferência final sem novos itens
    inStayRes.status = "completed";
    inStayRes.checkoutDone = true;
    const finalZeroNewRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "212",
        reservationCode: "RES-INSTAY-212",
        isDailyLaunch: false,
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: { waterCups: 0, mendoratoPeanuts: 0 },
        missingItems: []
      })
    });
    assert.strictEqual(finalZeroNewRes.status, 200);
    const finalZeroNewData = await finalZeroNewRes.json();
    assert.strictEqual(finalZeroNewData.postCheckoutNotificationType, "courtesy_only_no_charge");
    assert.strictEqual(waSent.length, 1, "Na conferência final pós-check-out, deve ler a cortesia acumulada da estadia e avisar o Titular");
    assert.match(waSent[0].message, /1x Copo d'Água Mineral 200ml/);
  });

  it("6. Reserva B2B com telefone do solicitante/agência é bloqueada pela guarda anti-solicitante", async () => {
    db.reservations.push({
      id: 2004,
      code: "RES-B2B-605",
      flatId: 605,
      flatNumber: "605",
      channel: "corporate_b2b",
      isB2b: true,
      guestName: "Engenheiro B2B",
      guestPhone: "5522999666666",
      requesterName: "Secretária Agência",
      requesterPhone: "5522999666666",
      requesterInfo: { name: "Secretária Agência", phone: "5522999666666", isGuest: false },
      status: "completed",
      checkoutDone: true,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19"
    });

    const b2bRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "605",
        reservationCode: "RES-B2B-605",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 2,
          mendoratoPeanuts: 0
        },
        missingItems: []
      })
    });
    assert.strictEqual(b2bRes.status, 200);
    assert.strictEqual(waSent.length, 0, "Telefone pertencente a solicitante/agência B2B deve ser bloqueado");
  });

  it("7. PUT /api/minibar/settings e GET /api/minibar/collections/overview personalizam e ligam/desligam o aviso de cortesia", async () => {
    const customTpl = "Oi {primeiro_nome}! Conferimos o Flat {flat}: zero cobrança, {itens_cortesia} são cortesia!";
    const putRes = await fetch(`${BASE_URL}/api/minibar/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sendCourtesyOnlyCheckoutWhatsApp: true,
        courtesyOnlyCheckoutWhatsAppTemplate: customTpl
      })
    });
    assert.strictEqual(putRes.status, 200);
    const putData = await putRes.json();
    assert.strictEqual(putData.settings.sendCourtesyOnlyCheckoutWhatsApp, true);
    assert.strictEqual(putData.settings.courtesyOnlyCheckoutWhatsAppTemplate, customTpl);

    const ovRes = await fetch(`${BASE_URL}/api/minibar/collections/overview`);
    const ovData = await ovRes.json();
    assert.strictEqual(ovData.settings.sendCourtesyOnlyCheckoutWhatsApp, true);
    assert.strictEqual(ovData.settings.courtesyOnlyCheckoutWhatsAppTemplate, customTpl);

    db.reservations.push({
      id: 2005,
      code: "RES-CUSTOM-907",
      flatId: 907,
      flatNumber: "907",
      guestName: "Fernanda Custom",
      guestPhone: "5522999777771",
      status: "completed",
      checkoutDone: true,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19"
    });

    const customInspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "907",
        reservationCode: "RES-CUSTOM-907",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 1,
          mendoratoPeanuts: 0
        },
        missingItems: []
      })
    });
    assert.strictEqual(customInspRes.status, 200);
    assert.strictEqual(waSent.length, 1);
    assert.strictEqual(
      waSent[0].message,
      "Oi Fernanda! Conferimos o Flat 907: zero cobrança, 1x Copo d'Água Mineral 200ml são cortesia!"
    );

    // Desativando toggle -> não dispara
    await fetch(`${BASE_URL}/api/minibar/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendCourtesyOnlyCheckoutWhatsApp: false })
    });

    db.reservations.push({
      id: 2006,
      code: "RES-OFF-211",
      flatId: 211,
      flatNumber: "211",
      guestName: "Marcos Off",
      guestPhone: "5522999777772",
      status: "completed",
      checkoutDone: true,
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19"
    });

    const offInspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anserve-pin": "1234" },
      body: JSON.stringify({
        flatNumber: "211",
        reservationCode: "RES-OFF-211",
        isFinalCheckoutInspection: true,
        status: "conforme",
        welcomeKitConsumption: {
          waterCups: 2,
          mendoratoPeanuts: 2
        },
        missingItems: []
      })
    });
    assert.strictEqual(offInspRes.status, 200);
    assert.strictEqual(waSent.length, 1, "Com toggle desativado não deve enviar aviso de cortesia");

    // Helper unit checks
    assert.strictEqual(
      formatMinibarCourtesyItemsNaturalList([
        { productName: "Copo d'Água Mineral 200ml", quantity: 2 },
        { productName: "Amendoim Mendorato 27g", quantity: 2 }
      ]),
      "2x Copo d'Água Mineral 200ml e 2x Amendoim Mendorato 27g"
    );
    assert.strictEqual(
      computeMinibarCanSplitBill({ numGuests: 1 }, [{ name: "A" }, { name: "B" }]).canSplitBill,
      false,
      "numGuests === 1 sempre bloqueia divisão"
    );
  });
});
