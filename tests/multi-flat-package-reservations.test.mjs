import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  isPackageCode,
  generatePackageCode,
  isPackageItemActive,
  isReservationSettledInPackage,
  getPackageReservations,
  getPrimaryPackageReservation,
  isFlatGuestCredentialIncomplete,
  applyPackageRateioToDraftFlats,
  computePackageSummary,
  syncPackagePixAndPaymentLinks,
  dispatchPackagePreReservationCreated,
  dispatchIndividualFlatGuestInstructions,
  settlePackagePaymentAtomically,
  cancelSinglePackageFlat,
  reactivateExpiredPackage,
} from "../artifacts/api-server/package-reservations-service.mjs";

import {
  sendZapiMessage as realSendZapiMessage,
  appendMessageToConversation as realAppendMessageToConversation,
  scheduleUpcomingReservationTriggers as realScheduleUpcomingReservationTriggers,
} from "../artifacts/api-server/zapi-service.mjs";

import {
  wrapEmailTemplate as realWrapEmailTemplate,
  sendEmailAsync as realSendEmailAsync,
} from "../artifacts/api-server/mail-service.mjs";

import {
  consultarDisponibilidadeTool,
  calcularOrcamentoTool,
  gerarLinkReservaTool,
} from "../artifacts/api-server/agent-architecture.mjs";

function sha256File(relPath) {
  const full = path.resolve(relPath);
  return crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
}

function createIsolatedDb() {
  return {
    settings: {
      hotelName: "CorpFlats Soho",
      baseUrl: "https://corpflats.com.br",
      checkinTime: "14:00",
      checkoutTime: "12:00",
      interConfig: { pixKey: "47964813000165" },
    },
    zapiConfig: {
      instanceId: "",
      token: "",
      testModeOnly: true,
    },
    siteConfig: {
      pricing: {
        baseRateNoBreakfastSingle: 210,
        baseRateNoBreakfastDouble: 240,
        baseRateWithBreakfastSingle: 245,
        baseRateWithBreakfastDouble: 290,
        cleaningFeeNoBreakfast: 90,
      },
      extraBedConfig: { enabled: true, dailyFee: 70 },
      bedConfig: { twinAllowedFlats: ["101", "102", "103"] },
    },
    flats: [
      { id: 1, number: "101", category: "Executivo", isActive: true, status: "clean" },
      { id: 2, number: "102", category: "Executivo", isActive: true, status: "clean" },
      { id: 3, number: "103", category: "Luxo", isActive: true, status: "clean" },
      { id: 4, number: "104", category: "Luxo", isActive: true, status: "clean" },
    ],
    reservations: [],
    blocks: [],
    guests: [
      {
        id: 50,
        name: "Roberto Solicitante",
        cpf: "12345678909",
        phone: "5522999110000",
        email: "roberto@empresa.com.br",
        creditBalance: 0,
      },
    ],
    guestCredits: [],
    boletos: [],
    invoices: [],
    whatsappHistory: [],
    emailQueue: [],
  };
}

function mockPixGenerator({ amount, txid }) {
  return `00020126360014BR.GOV.BCB.PIX01144796481300016552040000530398654${Number(amount).toFixed(2)}62070503${txid}6304ABCD`;
}

function findConflictsMock(db, { flatId, flatNumber, checkinDate, checkoutDate, excludeResId }) {
  return (db.reservations || []).filter((r) => {
    if (excludeResId && String(r.id) === String(excludeResId)) return false;
    const st = String(r.status || "").toLowerCase();
    if (st === "cancelada" || st === "cancelled" || st === "expirada") return false;
    const sameFlat =
      (flatId && Number(r.flatId) === Number(flatId)) ||
      (flatNumber && String(r.flatNumber) === String(flatNumber));
    if (!sameFlat) return false;
    return r.checkinDate < checkoutDate && r.checkoutDate > checkinDate;
  });
}

describe("Pacotes Multi-Flat (Pagamento Único, Hóspedes 1 e 2 por Flat, PMS + Site + Sofia IA)", () => {
  it("1. Mantém 100% de paridade SHA-256 Twin-Server nos módulos de runtime", () => {
    const pairs = [
      ["artifacts/api-server/package-reservations-service.mjs", "scripts/package-reservations-service.mjs"],
      ["artifacts/api-server/demo-server.mjs", "scripts/demo-server.mjs"],
      ["artifacts/api-server/zapi-service.mjs", "scripts/zapi-service.mjs"],
    ];
    for (const [src, mirror] of pairs) {
      assert.equal(sha256File(src), sha256File(mirror), `Paridade quebrada entre ${src} e ${mirror}`);
    }
  });

  it("2. Rateio automático exato aos centavos (soma, desconto R$, desconto % e valor fechado) + casos de borda", () => {
    // Caso vazio
    const empty = applyPackageRateioToDraftFlats([], { mode: "fixed_total", fixedTotal: 500 });
    assert.equal(empty.items.length, 0);
    assert.equal(empty.targetTotal, 0);

    const drafts = [
      { flatNumber: "101", checkinDate: "2026-12-01", checkoutDate: "2026-12-03", nightsCount: 2, baseTotalAmount: 500 },
      { flatNumber: "102", checkinDate: "2026-12-02", checkoutDate: "2026-12-05", nightsCount: 3, baseTotalAmount: 750 },
      { flatNumber: "103", checkinDate: "2026-12-01", checkoutDate: "2026-12-02", nightsCount: 1, baseTotalAmount: 250 },
    ];

    // Valor fechado com centavos quebrados: R$ 1.000,00 divididos proporcionalmente entre 500 / 750 / 250 (= 1500)
    const fixed = applyPackageRateioToDraftFlats(drafts, { mode: "fixed_total", fixedTotal: 1000 });
    assert.equal(fixed.rawSum, 1500);
    assert.equal(fixed.targetTotal, 1000);
    assert.equal(fixed.discountApplied, 500);
    const sumFixedItems = Math.round(fixed.items.reduce((s, it) => s + it.totalAmount, 0) * 100) / 100;
    assert.equal(sumFixedItems, 1000, "A soma dos flats rateados deve bater exatamente R$ 1000,00 sem sobra de centavo");
    for (const it of fixed.items) {
      const sumNights = Math.round(it.dailyRates.reduce((s, d) => s + d.rate, 0) * 100) / 100;
      assert.equal(sumNights, it.totalAmount, `Soma das diárias do flat ${it.flatNumber} deve bater com totalAmount`);
    }

    // Desconto percentual 10%
    const pct = applyPackageRateioToDraftFlats(drafts, { mode: "discount_pct", discountPct: 10 });
    assert.equal(pct.targetTotal, 1350);
    assert.equal(
      Math.round(pct.items.reduce((s, it) => s + it.totalAmount, 0) * 100) / 100,
      1350
    );

    // Desconto em R$ maior que o bruto nunca gera total negativo
    const clamped = applyPackageRateioToDraftFlats(drafts, { mode: "discount_amount", discountAmount: 9999 });
    assert.equal(clamped.targetTotal, 0);
    assert.ok(clamped.items.every((it) => it.totalAmount === 0));
  });

  it("3. Fluxo antes do pagamento: 1 PIX único, disparo consolidado único, recálculo ao editar ou cancelar 1 flat", async () => {
    const db = createIsolatedDb();
    const pkgCode = generatePackageCode(db);
    assert.ok(isPackageCode(pkgCode));

    const sentWhatsappCalls = [];
    const sentEmails = [];

    db.reservations.push(
      {
        id: 1001,
        code: "101-1001",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 2,
        requesterIsGuest1: true,
        informGuestsLater: false,
        guest2InformLater: false,
        guestName: "Roberto Solicitante",
        guestPhone: "5522999110000",
        requesterInfo: {
          name: "Roberto Solicitante",
          whatsapp: "5522999110000",
          email: "roberto@empresa.com.br",
          cpf: "12345678909",
        },
        guests: [
          { index: 1, name: "Roberto Solicitante", phone: "5522999110000", cpf: "12345678909" },
          { index: 2, name: "Ana Esposa", phone: "5522999110001", cpf: "98765432100" },
        ],
        includeBreakfast: true,
        twinBeds: false,
        vehicle: { plate: "ABC1D23", model: "Corolla" },
        totalAmount: 580,
        paidAmount: 0,
      },
      {
        id: 1002,
        code: "102-1002",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-11",
        checkoutDate: "2026-12-14",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 2,
        requesterIsGuest1: false,
        informGuestsLater: false,
        guest2InformLater: false,
        hideFinancialForGuest: true,
        guestName: "Carlos Diretor",
        guestPhone: "5522999220001",
        requesterInfo: {
          name: "Roberto Solicitante",
          whatsapp: "5522999110000",
          email: "roberto@empresa.com.br",
          cpf: "12345678909",
        },
        guests: [
          { index: 1, name: "Carlos Diretor", phone: "5522999220001" },
          { index: 2, name: "Paulo Engenheiro", phone: "5522999220002" },
        ],
        includeBreakfast: false,
        twinBeds: true,
        totalAmount: 720,
        paidAmount: 0,
      },
      {
        id: 1003,
        code: "103-1003",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 3,
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2026-12-12",
        checkoutDate: "2026-12-13",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 1,
        requesterIsGuest1: false,
        informGuestsLater: true,
        guestPending: true,
        hideFinancialForGuest: true,
        guestName: "A Definir",
        guestPhone: "",
        requesterInfo: {
          name: "Roberto Solicitante",
          whatsapp: "5522999110000",
          email: "roberto@empresa.com.br",
          cpf: "12345678909",
        },
        guests: [],
        includeBreakfast: true,
        twinBeds: false,
        totalAmount: 245,
        paidAmount: 0,
      }
    );

    const deps = {
      generateStaticPixPayload: mockPixGenerator,
      sendZapiMessage: async (_cfg, payload) => {
        sentWhatsappCalls.push({ phone: payload.phone, text: payload.message, opts: payload });
        return { success: true, messageId: `msg_${sentWhatsappCalls.length}` };
      },
      appendMessageToConversation: (targetDb, convMsg) => realAppendMessageToConversation(targetDb, convMsg),
      wrapEmailTemplate: (tplOpts) => realWrapEmailTemplate(tplOpts),
      sendEmailAsync: async (mailPayload) => {
        sentEmails.push(mailPayload);
        return { ok: true, id: "mail_1" };
      },
    };

    const synced1 = await syncPackagePixAndPaymentLinks(db, pkgCode, deps);
    assert.equal(synced1.totalAmount, 1545);
    assert.equal(synced1.pendingAmount, 1545);
    assert.ok(synced1.pixCopiaECola.includes("1545.00"));
    assert.equal(synced1.needsGuestCredentials, true, "Flat 103 está marcado como informar depois");
    assert.deepEqual(synced1.missingCredentialCodes, ["103-1003"]);

    // Todos os 3 flats compartilham a mesma chave PIX única
    for (const r of db.reservations) {
      assert.equal(r.pixCopiaECola, synced1.pixCopiaECola);
      assert.equal(r.packagePixChargedAmount, 1545);
    }

    // Disparo inicial envia APENAS 1 WhatsApp e 1 E-mail para o Solicitante
    await dispatchPackagePreReservationCreated(db, pkgCode, "https://corpflats.com.br", deps);
    assert.equal(sentWhatsappCalls.length, 1);
    assert.equal(sentWhatsappCalls[0].phone, "5522999110000");
    assert.ok(sentWhatsappCalls[0].text.includes("1.545,00"));
    assert.equal(sentEmails.length, 1);

    // Editar Flat 102 antes de pagar (ex: adicionou café -> R$ 800) recalcula automaticamente o mesmo PIX único
    db.reservations[1].totalAmount = 800;
    db.reservations[1].mpInitPoint = "https://mp.old/link";
    db.reservations[1].packageMpChargedAmount = 1600;
    const syncedAfterEdit = await syncPackagePixAndPaymentLinks(db, pkgCode, deps);
    assert.equal(syncedAfterEdit.pendingAmount, 1625);
    assert.ok(syncedAfterEdit.pixCopiaECola.includes("1625.00"));
    assert.equal(db.reservations[1].mpInitPoint, null, "Preferência antiga de cartão deve ser invalidada ao alterar valor");

    // Cancelar Flat 103 antes de pagar recalcula PIX para os 2 flats restantes (580 + 800 = 1380)
    const cancelPre = await cancelSinglePackageFlat(db, db.reservations[2], { reason: "Desistiu do 3º flat" }, deps);
    assert.equal(cancelPre.cancelledItems.length, 1);
    assert.equal(db.reservations[2].status, "cancelada");
    assert.equal(cancelPre.summary.activeFlatsCount, 2);
    assert.equal(cancelPre.summary.pendingAmount, 1380);
    assert.ok(cancelPre.summary.pixCopiaECola.includes("1380.00"));
  });

  it("4. Quitação atômica, sigilo financeiro total p/ Hóspedes 1 e 2, e cancelamento parcial pós-pagamento (estorno, crédito, sem reembolso)", async () => {
    const db = createIsolatedDb();
    const pkgCode = "PKG-778899";
    const whatsappLog = [];

    db.reservations.push(
      {
        id: 2001,
        code: "101-2001",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-17",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 2,
        requesterIsGuest1: true,
        guestName: "Roberto Solicitante",
        guestPhone: "5522999110000",
        requesterInfo: { name: "Roberto Solicitante", whatsapp: "5522999110000", cpf: "12345678909" },
        guests: [
          { index: 1, name: "Roberto Solicitante", phone: "5522999110000" },
          { index: 2, name: "Ana Acompanhante", phone: "5522999110001" },
        ],
        includeBreakfast: true,
        totalAmount: 500,
        paidAmount: 0,
      },
      {
        id: 2002,
        code: "102-2002",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-18",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 2,
        requesterIsGuest1: false,
        hideFinancialForGuest: true,
        guestName: "Marcos Hóspede",
        guestPhone: "5522999330001",
        requesterInfo: { name: "Roberto Solicitante", whatsapp: "5522999110000", cpf: "12345678909" },
        guests: [
          { index: 1, name: "Marcos Hóspede", phone: "5522999330001" },
          { index: 2, name: "Júlia Hóspede 2", phone: "5522999330002" },
        ],
        includeBreakfast: false,
        twinBeds: true,
        totalAmount: 700,
        paidAmount: 0,
      },
      {
        id: 2003,
        code: "103-2003",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 3,
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2026-12-16",
        checkoutDate: "2026-12-18",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 1,
        requesterIsGuest1: false,
        informGuestsLater: true,
        guestPending: true,
        hideFinancialForGuest: true,
        guestName: "A Definir",
        guestPhone: "",
        requesterInfo: { name: "Roberto Solicitante", whatsapp: "5522999110000", cpf: "12345678909" },
        guests: [],
        includeBreakfast: true,
        totalAmount: 400,
        paidAmount: 0,
      }
    );

    const deps = {
      generateStaticPixPayload: mockPixGenerator,
      sendZapiMessage: async (_cfg, payload) => {
        whatsappLog.push({ phone: payload.phone, text: payload.message, buttons: payload.buttons });
        return { success: true };
      },
      appendMessageToConversation: (targetDb, convMsg) => realAppendMessageToConversation(targetDb, convMsg),
    };

    const settled = await settlePackagePaymentAtomically(
      db,
      pkgCode,
      { paymentMethod: "pix", txId: "TXPKG778899", endToEndId: "E2E999" },
      deps
    );

    assert.equal(settled.settledReservations.length, 3);
    assert.ok(db.reservations.every((r) => r.status === "confirmada" && r.paymentStatus === "pago_total"));
    assert.equal(settled.summary.isPaid, true);
    assert.equal(settled.summary.totalAmount, 1600);
    assert.equal(settled.summary.paidAmount, 1600);

    // Solicitante recebeu 1 recibo único COM valores e COM 1 link único /credenciamento/PKG-778899
    const msgSolicitante = whatsappLog.filter((m) => m.phone === "5522999110000");
    assert.equal(msgSolicitante.length, 1, "Solicitante recebe 1 único recibo sem duplicidade por ser Hóspede 1 do Flat 101");
    assert.ok(msgSolicitante[0].text.includes("1.600,00"));
    assert.ok(msgSolicitante[0].text.includes(`/credenciamento/${pkgCode}`));

    // Acompanhante do Flat 101 (Ana) e Hóspedes 1 e 2 do Flat 102 (Marcos e Júlia) receberam apenas instruções SEM NENHUM VALOR ("R$")
    const guestPhones = ["5522999110001", "5522999330001", "5522999330002"];
    for (const gp of guestPhones) {
      const msgs = whatsappLog.filter((m) => m.phone === gp);
      assert.equal(msgs.length, 1, `Hóspede ${gp} deve receber exatamente 1 mensagem exclusiva do seu flat`);
      assert.equal(msgs[0].text.includes("R$"), false, `Mensagem do hóspede ${gp} NUNCA pode conter valores financeiros`);
    }
    assert.ok(
      whatsappLog.find((m) => m.phone === "5522999110001").text.includes("?guest=2"),
      "Hóspede 2 recebe link individualizado ?guest=2"
    );

    // Pós-pagamento: Cancelar Flat 102 escolhendo CRÉDITO mantém Flats 101 e 103 confirmados e pagos!
    const cancelCredit = await cancelSinglePackageFlat(
      db,
      db.reservations[1],
      { refundResolution: "credit", refundAmount: 700, reason: "Viagem de Marcos adiada" },
      deps
    );
    assert.equal(db.reservations[1].status, "cancelada");
    assert.equal(db.reservations[1].refundStatus, "credito_gerado");
    assert.equal(db.guestCredits.length, 1);
    assert.equal(db.guestCredits[0].amount, 700);
    assert.equal(db.guests[0].creditBalance, 700, "Saldo de crédito no CRM do solicitante atualizado");
    assert.equal(db.reservations[0].status, "confirmada");
    assert.equal(db.reservations[0].paymentStatus, "pago_total");
    assert.equal(db.reservations[2].status, "confirmada");
    assert.equal(db.reservations[2].paymentStatus, "pago_total");
    assert.equal(cancelCredit.summary.isPaid, true);

    // Pós-pagamento: Cancelar Flat 103 escolhendo ESTORNO PARCIAL mantém Flat 101 confirmado e pago!
    const cancelPartial = await cancelSinglePackageFlat(
      db,
      db.reservations[2],
      { refundResolution: "partial_refund", refundAmount: 350 },
      deps
    );
    assert.equal(db.reservations[2].status, "cancelada");
    assert.equal(db.reservations[2].refundStatus, "estorno_parcial_solicitado");
    assert.equal(db.reservations[2].refundAmount, 350);
    assert.equal(cancelPartial.summary.activeFlatsCount, 1);
    assert.equal(cancelPartial.summary.isPaid, true);
  });

  it("5. Reativação de pacote expirado: pacote inteiro vs 1 flat + realocação automática se flat original ocupou", async () => {
    const db = createIsolatedDb();
    const pkgCode = "PKG-EXP999";

    db.reservations.push(
      {
        id: 3001,
        code: "101-3001",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 1,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-22",
        status: "expirada",
        paymentStatus: "pendente_pix",
        requesterInfo: { name: "Roberto", whatsapp: "5522999110000" },
        totalAmount: 450,
        paidAmount: 0,
      },
      {
        id: 3002,
        code: "102-3002",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-23",
        status: "expirada",
        paymentStatus: "pendente_pix",
        requesterInfo: { name: "Roberto", whatsapp: "5522999110000" },
        totalAmount: 650,
        paidAmount: 0,
      },
      // Outro hóspede reservou o Flat 102 enquanto o pacote estava expirado!
      {
        id: 3099,
        code: "102-3099",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-21",
        checkoutDate: "2026-12-24",
        status: "confirmada",
        paymentStatus: "pago_total",
        totalAmount: 800,
        paidAmount: 800,
      }
    );

    const reactivated = await reactivateExpiredPackage(
      db,
      pkgCode,
      { reactivateWholePackage: true, holdDurationMinutes: 60, sendWhatsapp: false },
      {
        generateStaticPixPayload: mockPixGenerator,
        findActiveOverbookingConflicts: findConflictsMock,
      }
    );

    assert.equal(reactivated.reactivatedCount, 2);
    assert.equal(reactivated.reassignedFlats.length, 1, "Flat 102 ocupado deve ser realocado automaticamente");
    assert.equal(reactivated.reassignedFlats[0].oldFlat, "102");
    assert.equal(reactivated.reassignedFlats[0].newFlat, "103");
    assert.equal(db.reservations[0].status, "pre_reserva");
    assert.equal(db.reservations[1].status, "pre_reserva");
    assert.equal(db.reservations[1].flatNumber, "103");
    assert.equal(reactivated.summary.pendingAmount, 1100);
    assert.ok(reactivated.summary.pixCopiaECola.includes("1100.00"));
  });

  it("6. Sofia IA (WhatsApp): disponibilidade, orçamento e pré-reserva multi-flat em 2 etapas respeitando as 5 Leis do AGENTS.md", async () => {
    const db = createIsolatedDb();
    // Garante execução isolada via db do contexto sem disparo externo
    const prevGlobalHook = globalThis.createSofiaMultiFlatPreReservation;
    delete globalThis.createSofiaMultiFlatPreReservation;

    try {
      const ctx = {
        data_hora_atual: "2026-11-17T15:00:00-03:00",
        telefone_remetente: "5522999887766",
        estado_atual: "COMERCIAL_VENDAS",
        hospede: { id: "h1", nome: "Fernanda Coordenadora" },
        runtime: { db, suppressExternalSend: true },
      };

      // 6a) Disponibilidade com datas diferentes por flat
      const disp = await consultarDisponibilidadeTool.execute(
        {
          data_checkin: "2026-12-10",
          data_checkout: "2026-12-12",
          quantidade_flats: 2,
          flats: [
            { data_checkin: "2026-12-10", data_checkout: "2026-12-12", quantidade_hospedes: 2 },
            { data_checkin: "2026-12-11", data_checkout: "2026-12-14", quantidade_hospedes: 1 },
          ],
        },
        ctx
      );
      assert.equal(disp.status, "SUCESSO_EXECUTADO");
      assert.ok(typeof disp.instrucao_para_ia === "string" && disp.instrucao_para_ia.length > 10);

      // 6b) Trava determinística no código: excesso de hóspedes em 1 dos flats
      const dispBlocked = await consultarDisponibilidadeTool.execute(
        {
          data_checkin: "2026-12-10",
          data_checkout: "2026-12-12",
          flats: [
            { data_checkin: "2026-12-10", data_checkout: "2026-12-12", quantidade_hospedes: 2 },
            { data_checkin: "2026-12-10", data_checkout: "2026-12-12", quantidade_hospedes: 5 },
          ],
        },
        ctx
      );
      assert.equal(dispBlocked.status, "BLOQUEADO_PELA_REGRA");
      assert.ok(dispBlocked.instrucao_para_ia);

      // 6c) Cotação multi-flat com datas e cafés independentes
      const orc = await calcularOrcamentoTool.execute(
        {
          data_checkin: "2026-12-10",
          data_checkout: "2026-12-12",
          flats: [
            { data_checkin: "2026-12-10", data_checkout: "2026-12-12", quantidade_hospedes: 2, incluir_cafe: true },
            { data_checkin: "2026-12-11", data_checkout: "2026-12-14", quantidade_hospedes: 1, incluir_cafe: false },
          ],
        },
        ctx
      );
      assert.equal(orc.status, "SUCESSO_EXECUTADO");
      assert.equal(orc.dados.quantidade_flats, 2);
      assert.ok(orc.dados.valor_total_pacote_pix > 0);
      assert.ok(orc.instrucao_para_ia);

      // 6d) Etapa 1: Simulação obrigatória (confirmacao_hospede = false) não grava no banco
      const sim = await gerarLinkReservaTool.execute(
        {
          data_checkin: "2026-12-10",
          data_checkout: "2026-12-12",
          nome_solicitante: "Fernanda Coordenadora",
          documento_solicitante: "12345678909",
          flats: [
            {
              data_checkin: "2026-12-10",
              data_checkout: "2026-12-12",
              quantidade_hospedes: 2,
              incluir_cafe: true,
              solicitante_hospeda_aqui: true,
              nome_hospede_2: "Lucas Marido",
            },
            {
              data_checkin: "2026-12-11",
              data_checkout: "2026-12-14",
              quantidade_hospedes: 2,
              incluir_cafe: false,
              preferencia_cama: "2 solteiros",
              informar_hospedes_depois: true,
            },
          ],
          confirmacao_hospede: false,
        },
        ctx
      );
      assert.equal(sim.status, "SIMULACAO_AGUARDANDO_CONFIRMACAO");
      assert.equal(db.reservations.length, 0, "Etapa 1 nunca pode gravar reservas antes do de acordo");

      // 6e) Etapa 2: Efetivação (confirmacao_hospede = true) cria pacote PKG-... com 1 PIX único
      const execRes = await gerarLinkReservaTool.execute(
        {
          data_checkin: "2026-12-10",
          data_checkout: "2026-12-12",
          nome_solicitante: "Fernanda Coordenadora",
          documento_solicitante: "12345678909",
          flats: [
            {
              data_checkin: "2026-12-10",
              data_checkout: "2026-12-12",
              quantidade_hospedes: 2,
              incluir_cafe: true,
              solicitante_hospeda_aqui: true,
              nome_hospede_2: "Lucas Marido",
            },
            {
              data_checkin: "2026-12-11",
              data_checkout: "2026-12-14",
              quantidade_hospedes: 2,
              incluir_cafe: false,
              preferencia_cama: "2 solteiros",
              informar_hospedes_depois: true,
            },
          ],
          confirmacao_hospede: true,
        },
        ctx
      );
      assert.equal(execRes.status, "SUCESSO_EXECUTADO");
      assert.ok(isPackageCode(execRes.dados.codigo_pacote));
      const pkgItems = getPackageReservations(db, execRes.dados.codigo_pacote);
      assert.equal(pkgItems.length, 2);
      assert.equal(pkgItems[0].checkinDate, "2026-12-10");
      assert.equal(pkgItems[1].checkinDate, "2026-12-11");
      assert.equal(pkgItems[0].requesterIsGuest1, true);
      assert.equal(pkgItems[1].informGuestsLater, true);
      assert.ok(execRes.dados.link_pacote.includes(`/minha-reserva/${execRes.dados.codigo_pacote}`));
      assert.ok(execRes.dados.link_credenciamento_pos_pagamento.includes(`/credenciamento/${execRes.dados.codigo_pacote}`));
      assert.ok(execRes.dados.chave_pix.length > 20);
      assert.ok(execRes.instrucao_para_ia);
    } finally {
      if (prevGlobalHook) globalThis.createSofiaMultiFlatPreReservation = prevGlobalHook;
    }
  });

  it("7. Execução real dos serializadores/localizadores de demo-server.mjs + validação de rotas, CPF/CNPJ na NFS-e única e sigilo financeiro", () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");

    // Extrai e executa serializeReservationForAgencyCredential real de demo-server.mjs
    const extractFn = (src, fnName) => {
      const start = src.indexOf(`function ${fnName}(`);
      assert.ok(start >= 0, `Função ${fnName} ausente em demo-server.mjs`);
      const bodyOpen = src.indexOf("{", start);
      let depth = 0;
      let i = bodyOpen;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      return src.slice(start, i + 1);
    };

    const mockDb = createIsolatedDb();
    mockDb.reservations.push(
      {
        id: 901,
        code: "101-0901",
        packageId: "PKG-554433",
        packageCode: "PKG-554433",
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-22",
        checkoutDate: "2026-12-25",
        status: "confirmada",
        guestCount: 2,
        requesterIsGuest1: true,
        guestName: "Roberto Solicitante",
        guestPhone: "5522999110000",
        guest2InformLater: false,
        guests: [
          { index: 1, name: "Roberto Solicitante", phone: "5522999110000" },
          { index: 2, name: "Helena Acompanhante", phone: "5522999110099", cpf: "11122233344" },
        ],
      },
      {
        id: 902,
        code: "102-0902",
        packageId: "PKG-554433",
        packageCode: "PKG-554433",
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-23",
        checkoutDate: "2026-12-26",
        status: "confirmada",
        guestCount: 2,
        informGuestsLater: true,
        guestPending: true,
        guest2InformLater: true,
        guestName: "A Definir",
        guests: [],
      }
    );

    const runtimeEvaluator = new Function(
      "db",
      "isPackageCode",
      "getPrimaryPackageReservation",
      "isFlatGuestCredentialIncomplete",
      `
      const areGuestNamesCompatible = () => true;
      const isPendingGuestName = (n) => !n || /a definir|informar depois/i.test(n);
      ${extractFn(demoSrc, "findReservationByLocatorOrContact")}
      ${extractFn(demoSrc, "serializeReservationForAgencyCredential")}
      return { findReservationByLocatorOrContact, serializeReservationForAgencyCredential };
      `
    )(mockDb, isPackageCode, getPrimaryPackageReservation, isFlatGuestCredentialIncomplete);

    // Localizador resolve PKG-554433 para a reserva primária do pacote
    const resolvedByPkg = runtimeEvaluator.findReservationByLocatorOrContact("PKG-554433");
    assert.ok(resolvedByPkg);
    assert.equal(resolvedByPkg.id, 901);

    // Serializador do link único de credenciamento expõe Hóspede 1 e Hóspede 2 conforme ocupação
    const ser1 = runtimeEvaluator.serializeReservationForAgencyCredential(mockDb.reservations[0]);
    assert.equal(ser1.packageCode, "PKG-554433");
    assert.equal(ser1.requesterIsGuest1, true);
    assert.equal(ser1.guest2.name, "Helena Acompanhante");
    assert.equal(ser1.guest2InformLater, false);

    const ser2 = runtimeEvaluator.serializeReservationForAgencyCredential(mockDb.reservations[1]);
    assert.equal(ser2.informGuestsLater, true);
    assert.equal(ser2.guestName, "");
    assert.equal(ser2.guest2InformLater, true);

    // Rotas dedicadas de pacote, NFS-e consolidada CPF (11) + CNPJ (14) e Boleto consolidado
    assert.ok(demoSrc.includes('app.post("/api/pms/reservations/package"'));
    assert.ok(demoSrc.includes('app.get("/api/pms/packages/:packageId"'));
    assert.ok(demoSrc.includes('app.post("/api/pms/packages/:packageId/reactivate"'));
    assert.ok(demoSrc.includes('app.post("/api/pms/packages/:packageId/confirm-payment"'));
    assert.ok(demoSrc.includes('app.post("/api/pms/reservations/:id/cancel-package-item"'));
    assert.ok(demoSrc.includes("cleanDoc.length === 14") && demoSrc.includes("else if (cleanDoc.length === 11)"), "NFS-e consolidada aceita CPF (11) e CNPJ (14)");
    assert.ok(demoSrc.includes("isPfConsolidated"), "NFS-e consolidada suporta Pessoa Física (CPF)");
    assert.ok(demoSrc.includes("hideFinancialForGuest"), "Portal do hóspede aplica bloqueio estrito de valores para não-solicitantes");

    // Verificação dos componentes Frontend (PMS, Site Público, Portal e Credenciamento Único)
    const pmsSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/pages/pms-calendar.tsx"), "utf8");
    const funnelSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/components/booking-funnel-modal.tsx"), "utf8");
    const portalSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/pages/guest-portal.tsx"), "utf8");
    const credSrc = fs.readFileSync(path.resolve("artifacts/limpeza/src/pages/agency-guest-credential.tsx"), "utf8");

    assert.ok(pmsSrc.includes("/api/pms/reservations/package") && pmsSrc.includes("O próprio Solicitante ficará neste flat") && pmsSrc.includes("cancel-package-item"));
    assert.equal(pmsSrc.includes("formGuestCpf"), false, "pms-calendar.tsx não pode referenciar identificador inexistente formGuestCpf (ReferenceError em runtime)");
    assert.ok(funnelSrc.includes("requesterIsGuest1") && funnelSrc.includes("informGuestsLater"));
    assert.ok(portalSrc.includes("/api/nfse/emit-consolidated") && portalSrc.includes("cancelWholePackage: false"));
    assert.ok(credSrc.includes("guest2InformLater") && credSrc.includes("agency-guest-credential-batch"));
  });

  it("8. Execução real de createMultiFlatPackageFromPayload (Pré-Reserva, Confirmada, Faturada c/ 1 Boleto Único e travas 400/409)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const start = demoSrc.indexOf("async function createMultiFlatPackageFromPayload(");
    assert.ok(start >= 0);
    const bodyOpen = demoSrc.indexOf(") {", start) + 2;
    let depth = 0;
    let end = bodyOpen;
    for (; end < demoSrc.length; end++) {
      if (demoSrc[end] === "{") depth++;
      else if (demoSrc[end] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const fnSrc = demoSrc.slice(start, end + 1);

    const mockDb = createIsolatedDb();
    let emittedBoletoCall = null;

    const createMultiFlatPackage = new Function(
      "deps",
      `
      const {
        db, crypto, applyPackageRateioToDraftFlats, generatePackageCode,
        syncPackagePixAndPaymentLinks, dispatchPackagePreReservationCreated,
        computePackageSummary, findActiveOverbookingConflicts, onEmitBoleto
      } = deps;
      const DEFAULT_SITE_CONFIG = db.siteConfig;
      const DEFAULT_INTER_CONFIG = { pixKey: "47964813000165" };
      const normalizePaymentMethodId = (m) => String(m || "pix").toLowerCase();
      const isFaturadoBoletoMethod = (m) => m.includes("boleto") || m.includes("faturado");
      const getCanonicalFlats = (d) => d.flats;
      const calculateCanonicalDirectStayQuote = () => ({ pixTotalAmount: 500, avgDailyRatePerFlat: 250, perNightCombinedRates: [{ date: "2026-12-10", rate: 250 }, { date: "2026-12-11", rate: 250 }] });
      const isPendingGuestName = (n) => !n || /a definir|informar depois/i.test(n);
      const computeCardAmountFromPix = (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100;
      const addReservationAuditLog = (r, e) => { r.auditLogs.push(e); };
      const createInterPixCob = null;
      const generateStaticPixPayload = ({ amount, txid }) => "PIX_" + Number(amount).toFixed(2) + "_" + txid;
      const cleanWhatsAppPhone = (p) => String(p || "").replace(/\\D/g, "");
      const sendZapiMessage = async () => ({ success: true });
      const appendMessageToConversation = () => {};
      const sendEmailAsync = async () => ({ ok: true });
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const scheduleUpcomingReservationTriggers = () => {};
      const ensureReservationScheduledEmails = () => {};
      const dispatchConfirmedReservationToReceptionAndGarage = async () => {};
      const createNotification = () => {};
      const dispatchServerSidePurchaseConversion = async () => {};
      const saveDatabase = () => {};
      const emitCheckoutFaturadoPackage = async (res0, opts) => {
        onEmitBoleto(res0, opts);
        return { boletos: [{ id: "BOL-PKG-1", reservationIds: opts.reservationIds }] };
      };
      ${fnSrc}
      return createMultiFlatPackageFromPayload;
      `
    )({
      db: mockDb,
      crypto,
      applyPackageRateioToDraftFlats,
      generatePackageCode,
      syncPackagePixAndPaymentLinks,
      dispatchPackagePreReservationCreated,
      computePackageSummary,
      findActiveOverbookingConflicts: findConflictsMock,
      onEmitBoleto: (res0, opts) => {
        emittedBoletoCall = { res0, opts };
      },
    });

    // 8a) Trava: menos de 2 flats -> erro 400
    await assert.rejects(
      () => createMultiFlatPackage({ requesterName: "Teste", packageFlats: [{ checkinDate: "2026-12-10", checkoutDate: "2026-12-12" }] }),
      (err) => err.statusCode === 400
    );

    // 8b) Trava: solicitante vazio -> erro 400
    await assert.rejects(
      () =>
        createMultiFlatPackage({
          requesterName: "",
          packageFlats: [
            { checkinDate: "2026-12-10", checkoutDate: "2026-12-12" },
            { checkinDate: "2026-12-10", checkoutDate: "2026-12-12" },
          ],
        }),
      (err) => err.statusCode === 400
    );

    // 8c) Trava: mesmo flat selecionado duas vezes com datas sobrepostas -> erro 409
    await assert.rejects(
      () =>
        createMultiFlatPackage({
          requesterName: "Empresa X",
          packageFlats: [
            { flatId: 1, checkinDate: "2026-12-10", checkoutDate: "2026-12-13", dailyRate: 250 },
            { flatId: 1, checkinDate: "2026-12-11", checkoutDate: "2026-12-14", dailyRate: 250 },
          ],
        }),
      (err) => err.statusCode === 409
    );

    // 8d) Modalidade Faturada com Valor Fechado (rateio R$ 1.200,00) + emissão de 1 Boleto Único consolidado
    const fatResult = await createMultiFlatPackage(
      {
        requesterName: "Construtora Alfa Ltda",
        requesterDocument: "11222333000181",
        requesterPhone: "5522999001122",
        status: "confirmada",
        isFaturadoBoleto: true,
        emitConsolidatedBoletoNow: true,
        packagePricingMode: "fixed_total",
        packageFixedTotal: 1200,
        packageFlats: [
          { checkinDate: "2026-12-10", checkoutDate: "2026-12-12", guestCount: 2, requesterIsGuest1: false, guestName: "Eng. Pedro", dailyRate: 300, includeBreakfast: true },
          { checkinDate: "2026-12-11", checkoutDate: "2026-12-15", guestCount: 1, informGuestsLater: true, dailyRate: 250, includeBreakfast: false, twinBeds: true },
        ],
      },
      { suppressExternalSend: true }
    );

    assert.ok(isPackageCode(fatResult.packageCode));
    assert.equal(fatResult.reservations.length, 2);
    assert.equal(fatResult.summary.totalAmount, 1200);
    assert.ok(emittedBoletoCall, "Deve acionar emissão de 1 Boleto Único consolidado para o pacote faturado");
    assert.equal(emittedBoletoCall.opts.consolidatePackage, true);
    assert.equal(emittedBoletoCall.opts.reservationIds.length, 2);

    // 8e) Modalidade Confirmada (Já Paga) com auto-alocação inteligente nos flats livres restantes (103 e 104)
    const confResult = await createMultiFlatPackage(
      {
        requesterName: "Clínica Vida",
        requesterPhone: "5522999009988",
        status: "confirmada",
        paymentStatus: "pago_total",
        markAsPaid: true,
        packageFlats: [
          { checkinDate: "2026-12-11", checkoutDate: "2026-12-13", guestCount: 2, requesterIsGuest1: true, dailyRate: 280 },
          { checkinDate: "2026-12-11", checkoutDate: "2026-12-13", guestCount: 2, informGuestsLater: true, dailyRate: 280 },
        ],
      },
      { suppressExternalSend: true }
    );
    assert.equal(confResult.summary.isPaid, true);
    assert.equal(confResult.summary.totalAmount, 1120);
    assert.equal(confResult.summary.paidAmount, 1120);
    // Flats 101 e 102 já estavam ocupados pelo pacote anterior nessas datas, então auto-alocou 103 e 104!
    assert.deepEqual(
      confResult.reservations.map((r) => r.flatNumber).sort(),
      ["103", "104"]
    );

    // 8f) Diária cortesia explícita (dailyRate = 0) e geração automática de tarefa de governança para 2 camas de solteiro (twinBeds)
    mockDb.cleaningRequests = [];
    const courtesyResult = await createMultiFlatPackage(
      {
        requesterName: "Diretoria Cortesia",
        requesterPhone: "5522999007777",
        status: "confirmada",
        paymentStatus: "pago_total",
        markAsPaid: true,
        packageFlats: [
          { flatId: 1, checkinDate: "2026-12-20", checkoutDate: "2026-12-22", guestCount: 1, requesterIsGuest1: true, dailyRate: 0 },
          { flatId: 2, checkinDate: "2026-12-20", checkoutDate: "2026-12-22", guestCount: 2, informGuestsLater: true, dailyRate: 0, twinBeds: true },
        ],
      },
      { suppressExternalSend: true }
    );
    assert.equal(courtesyResult.summary.totalAmount, 0, "dailyRate: 0 explícito deve preservar cortesia R$ 0,00 sem cair no fallback R$ 250");
    assert.ok(
      mockDb.cleaningRequests.some((cr) => cr.type === "bed_adjustment_only" && String(cr.flatNumber) === "102"),
      "Flat com twinBeds=true deve gerar tarefa bed_adjustment_only para governança"
    );
  });

  it("9. Segurança PMS: endpoints administrativos de pacote exigem autenticação de equipe (403 para anônimos/hóspedes)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractFn = (src, sig) => {
      const start = src.indexOf(sig);
      assert.ok(start >= 0, `Assinatura não encontrada: ${sig}`);
      const open = src.indexOf("{", start);
      let d = 0;
      let i = open;
      for (; i < src.length; i++) {
        if (src[i] === "{") d++;
        else if (src[i] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return src.slice(start, i + 1);
    };

    let currentAuthUser = null;
    const requireAuth = new Function(
      "getAuthUser",
      `${extractFn(demoSrc, "function requirePmsPackageStaffAuth(")}\nreturn requirePmsPackageStaffAuth;`
    )(() => currentAuthUser);

    const makeMockRes = () => ({
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    });

    // Anônimo com x-enforce-auth: true -> bloqueado com 403
    const resAnon = makeMockRes();
    const uAnon = requireAuth({ headers: { "x-enforce-auth": "true" } }, resAnon);
    assert.equal(uAnon, null);
    assert.equal(resAnon.statusCode, 403);

    // Papel sem permissão (ex: maid/guest) -> bloqueado com 403
    currentAuthUser = { id: 9, role: "maid" };
    const resMaid = makeMockRes();
    const uMaid = requireAuth({ headers: { "x-enforce-auth": "true" } }, resMaid);
    assert.equal(uMaid, null);
    assert.equal(resMaid.statusCode, 403);

    // Recepção ou Admin -> autorizado
    currentAuthUser = { id: 1, role: "reception", name: "Recepção" };
    const resStaff = makeMockRes();
    const uStaff = requireAuth({ headers: { "x-enforce-auth": "true" } }, resStaff);
    assert.equal(uStaff.id, 1);
    assert.equal(resStaff.statusCode, 200);

    // Confirma que TODAS as 5 rotas administrativas de pacote invocam requirePmsPackageStaffAuth logo na entrada
    for (const routeSig of [
      'app.post("/api/pms/reservations/package"',
      'app.get("/api/pms/packages/:packageId"',
      'app.post("/api/pms/packages/:packageId/reactivate"',
      'app.post("/api/pms/reservations/:id/cancel-package-item"',
      'app.post("/api/pms/packages/:packageId/confirm-payment"',
    ]) {
      const idx = demoSrc.indexOf(routeSig);
      assert.ok(idx >= 0, `Rota ausente: ${routeSig}`);
      const snippet = demoSrc.slice(idx, idx + 320);
      assert.ok(
        snippet.includes("requirePmsPackageStaffAuth(req, res)"),
        `Rota ${routeSig} deve exigir requirePmsPackageStaffAuth`
      );
    }
  });

  it("10. Sigilo financeiro absoluto em payment-status, cancellation-quote e autorização de portal para Hóspede 1/2 vs Solicitante", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractBlock = (src, marker) => {
      const start = src.indexOf(marker);
      assert.ok(start >= 0, `Bloco não encontrado: ${marker}`);
      const open = src.indexOf("{", start);
      let d = 0;
      let i = open;
      for (; i < src.length; i++) {
        if (src[i] === "{") d++;
        else if (src[i] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return src.slice(start, i + 1);
    };

    const mockDb = createIsolatedDb();
    const pkgCode = "PKG-909090";
    mockDb.reservations.push(
      {
        id: 501,
        code: "101-0501",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-02-10",
        checkoutDate: "2027-02-12",
        status: "confirmada",
        paymentStatus: "pago_total",
        paymentMethod: "pix",
        requesterIsGuest1: true,
        hideFinancialForGuest: false,
        guestCount: 2,
        guestName: "Roberto Solicitante",
        totalAmount: 600,
        paidAmount: 600,
        pixTxId: "TX909090",
        pixEndToEndId: "E2E909090",
      },
      {
        id: 502,
        code: "102-0502",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-02-10",
        checkoutDate: "2027-02-13",
        status: "confirmada",
        paymentStatus: "pago_total",
        paymentMethod: "pix",
        requesterIsGuest1: false,
        hideFinancialForGuest: true,
        guestCount: 2,
        guestName: "Camila Hóspede",
        totalAmount: 900,
        paidAmount: 900,
        pixTxId: "TX909090",
        pixEndToEndId: "E2E909090",
      }
    );

    const routes = {};
    const appMock = {
      get(p, h) { routes[`GET ${p}`] = h; },
      post(p, h) { routes[`POST ${p}`] = h; },
    };

    const cancellationQuoteBlock = demoSrc.slice(
      demoSrc.indexOf("function isGuestPortalRequesterAuthorized("),
      demoSrc.indexOf('app.post("/api/pms/guest-portal/:code/cancel"')
    );
    const paymentStatusBlock = demoSrc.slice(
      demoSrc.indexOf('app.get("/api/pms/reservations/:code/payment-status"'),
      demoSrc.indexOf('app.get("/api/pms/reservations/:code/payment-status"') +
        extractBlock(demoSrc, 'app.get("/api/pms/reservations/:code/payment-status"').length + 2
    );

    new Function(
      "deps",
      `
      const { app, db, isPackageCode, getPrimaryPackageReservation, computePackageSummary } = deps;
      const DEFAULT_SITE_CONFIG = { cancellationPolicy: { freeCancellationHours: 24, noShowPenaltyPercent: 100 } };
      const isB2bReservation = () => false;
      const getEffectiveDate = () => new Date("2027-02-01T12:00:00-03:00");
      const sweepExpiredPreReservations = async () => {};
      const saveDatabase = () => {};
      const computeCardAmountFromPix = (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100;
      const checkInterPixCobStatus = async () => null;
      const checkMercadoPagoPaymentByRef = async () => null;
      const confirmReservationPayment = async () => {};
      const findReservationByLocatorOrContact = (c) => isPackageCode(c) ? getPrimaryPackageReservation(db, c) : db.reservations.find(x => x.code === c);
      ${cancellationQuoteBlock}
      ${paymentStatusBlock}
      `
    )({
      app: appMock,
      db: mockDb,
      isPackageCode,
      getPrimaryPackageReservation,
      computePackageSummary,
    });

    const invoke = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await routes[key](
        { params, query, body, protocol: "https", headers: { host: "corpflats.com.br" }, get: () => "corpflats.com.br" },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 10a) Solicitante abrindo PKG-909090 ou Flat 101 diretamente (requesterIsGuest1=true) vê valores totais do pacote (1500)
    const stPkg = await invoke("GET /api/pms/reservations/:code/payment-status", { params: { code: pkgCode } });
    assert.equal(stPkg.payload.hideFinancialForGuest, false);
    assert.equal(stPkg.payload.totalAmount, 1500);
    assert.ok(stPkg.payload.packageSummary);

    const stFlat1Req = await invoke("GET /api/pms/reservations/:code/payment-status", { params: { code: "101-0501" } });
    assert.equal(stFlat1Req.payload.hideFinancialForGuest, false);
    assert.equal(stFlat1Req.payload.totalAmount, 1500);

    // 10b) Acompanhante do Flat 101 (?guest=2) NUNCA vê valores
    const stFlat1Guest2 = await invoke("GET /api/pms/reservations/:code/payment-status", {
      params: { code: "101-0501" },
      query: { guest: "2" },
    });
    assert.equal(stFlat1Guest2.payload.hideFinancialForGuest, true);
    assert.equal(stFlat1Guest2.payload.totalAmount, 0);
    assert.equal(stFlat1Guest2.payload.paidAmount, 0);
    assert.equal(stFlat1Guest2.payload.packageSummary, null);

    // 10c) Hóspede do Flat 102 (102-0502) NUNCA vê valores nem em payment-status nem em cancellation-quote
    const stFlat2 = await invoke("GET /api/pms/reservations/:code/payment-status", { params: { code: "102-0502" } });
    assert.equal(stFlat2.payload.hideFinancialForGuest, true);
    assert.equal(stFlat2.payload.totalAmount, 0);
    assert.equal(stFlat2.payload.paidAmount, 0);
    assert.equal(stFlat2.payload.pixEndToEndId, null);

    const cqFlat2 = await invoke("GET /api/pms/guest-portal/:code/cancellation-quote", { params: { code: "102-0502" } });
    assert.equal(cqFlat2.payload.hideFinancialForGuest, true);
    assert.equal(cqFlat2.payload.refundAmount, 0);
    assert.equal(cqFlat2.payload.totalPaid, 0);
    assert.equal(cqFlat2.payload.explanation.includes("R$"), false);
  });

  // Extrator léxico de blocos JS que ignora chaves dentro de strings, template literals e comentários
  function extractJsBlock(src, marker, includeTrailingParenSemi = false) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `Marcador não encontrado em demo-server.mjs: ${marker}`);
    const open = src.indexOf("{", start);
    assert.ok(open >= 0);
    let depth = 0;
    let i = open;
    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];
      if (ch === "/" && next === "/") {
        const nl = src.indexOf("\n", i + 2);
        i = nl < 0 ? src.length : nl + 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        const endC = src.indexOf("*/", i + 2);
        i = endC < 0 ? src.length : endC + 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        i++;
        while (i < src.length && src[i] !== ch) {
          if (src[i] === "\\") i += 2;
          else i++;
        }
        i++;
        continue;
      }
      if (ch === "`") {
        i++;
        while (i < src.length && src[i] !== "`") {
          if (src[i] === "\\") {
            i += 2;
          } else if (src[i] === "$" && src[i + 1] === "{") {
            i += 2;
            let tplDepth = 1;
            while (i < src.length && tplDepth > 0) {
              if (src[i] === "'" || src[i] === '"') {
                const q = src[i++];
                while (i < src.length && src[i] !== q) {
                  if (src[i] === "\\") i += 2;
                  else i++;
                }
                i++;
              } else if (src[i] === "{") {
                tplDepth++;
                i++;
              } else if (src[i] === "}") {
                tplDepth--;
                i++;
              } else {
                i++;
              }
            }
          } else {
            i++;
          }
        }
        i++;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          let endPos = i + 1;
          if (includeTrailingParenSemi) {
            while (endPos < src.length && /[\s);]/.test(src[endPos])) {
              endPos++;
              if (src[endPos - 1] === ";") break;
            }
          }
          return src.slice(start, endPos);
        }
      }
      i++;
    }
    throw new Error(`Bloco não fechado para ${marker}`);
  }

  it("11. Portal Self-Service (/cancel e /modify): bloqueia cross-package e não-solicitante, recálculo de PIX antes de pagar e política <24h pós-pagamento", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const mockDb = createIsolatedDb();
    const pkgCode = "PKG-404040";
    let simulatedNow = new Date("2026-12-01T10:00:00-03:00");

    mockDb.reservations.push(
      {
        id: 601,
        code: "101-0601",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 1,
        isPackagePrimary: true,
        channel: "site_direto",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        requesterIsGuest1: true,
        hideFinancialForGuest: false,
        guestCount: 2,
        dailyRate: 250,
        totalAmount: 500,
        paidAmount: 0,
      },
      {
        id: 602,
        code: "102-0602",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 2,
        channel: "site_direto",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        requesterIsGuest1: false,
        hideFinancialForGuest: true,
        guestCount: 1,
        dailyRate: 210,
        totalAmount: 420,
        paidAmount: 0,
      },
      // Reserva avulsa de OUTRO cliente (tentativa de ataque IDOR cross-package)
      {
        id: 9999,
        code: "104-9999",
        channel: "site_direto",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        status: "confirmada",
        paymentStatus: "pago_total",
        totalAmount: 800,
        paidAmount: 800,
      }
    );

    await syncPackagePixAndPaymentLinks(mockDb, pkgCode, { generateStaticPixPayload: mockPixGenerator });
    assert.equal(mockDb.reservations[0].packagePixChargedAmount, 920);

    const routes = {};
    const appMock = {
      get(p, h) { routes[`GET ${p}`] = h; },
      post(p, h) { routes[`POST ${p}`] = h; },
    };

    const helperAuthSrc = extractJsBlock(demoSrc, "function isGuestPortalRequesterAuthorized(");
    const cancelRouteSrc = extractJsBlock(demoSrc, 'app.post("/api/pms/guest-portal/:code/cancel"', true);
    const modifyPreviewRouteSrc = extractJsBlock(demoSrc, 'app.post("/api/pms/guest-portal/:code/modify-preview"', true);
    const modifyStatusRouteSrc = extractJsBlock(demoSrc, 'app.get("/api/pms/guest-portal/:code/modify-status"', true);
    const modifyCancelPendingRouteSrc = extractJsBlock(demoSrc, 'app.post("/api/pms/guest-portal/:code/modify-cancel-pending"', true);
    const modifyRouteSrc = extractJsBlock(demoSrc, 'app.post("/api/pms/guest-portal/:code/modify"', true);

    new Function(
      "deps",
      `
      const {
        app, db, isPackageCode, isPackageItemActive, isReservationSettledInPackage,
        getPackageReservations, getPrimaryPackageReservation,
        cancelSinglePackageFlat, syncPackagePixAndPaymentLinks, getNow
      } = deps;
      const process = { env: { NODE_ENV: "test" } };
      const activeModificationCommits = new Map();
      const DEFAULT_SITE_CONFIG = { cancellationPolicy: { freeCancellationHours: 24, noShowPenaltyPercent: 100 } };
      const DEFAULT_INTER_CONFIG = { pixKey: "47964813000165" };
      const isB2bReservation = () => false;
      const getEffectiveDate = () => getNow();
      const findReservationByLocatorOrContact = (c) => isPackageCode(c) ? getPrimaryPackageReservation(db, c) : db.reservations.find(x => x.code === c);
      const addReservationAuditLog = () => {};
      const ensureReservationAuditLogs = () => {};
      const logAuditEvent = () => {};
      const notifyPmsMutation = () => {};
      const createInterPixCob = null;
      const generateStaticPixPayload = ({ amount, txid }) => "PIX_" + Number(amount).toFixed(2) + "_" + txid;
      const computeCardAmountFromPix = (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100;
      const saveDatabase = () => {};
      const hasReservationConflict = () => false;
      const hasReservationCompletedAnyCheckin = () => false;
      const invalidateReservationCheckinSignatures = () => {};
      const getBrasiliaNow = () => ({ date: "2026-12-01" });
      const computeBreakfastCancellationReason = () => "";
      const hasReceptionReceivedReservation = () => false;
      const isReservationForTodayOrPast = () => false;
      const isReservationForToday = () => false;
      const dispatchConfirmedReservationToReceptionAndGarage = async () => {};
      const triggerImmediateWhatsApp = async () => {};
      const dispatchReservationReSignatureNotifications = () => {};
      const scheduleUpcomingReservationTriggers = () => {};
      const ensureReservationScheduledEmails = () => {};
      ${helperAuthSrc}
      ${cancelRouteSrc}
      ${modifyPreviewRouteSrc}
      ${modifyStatusRouteSrc}
      ${modifyCancelPendingRouteSrc}
      ${modifyRouteSrc}
      `
    )({
      app: appMock,
      db: mockDb,
      isPackageCode,
      isPackageItemActive,
      isReservationSettledInPackage,
      getPackageReservations,
      getPrimaryPackageReservation,
      cancelSinglePackageFlat,
      syncPackagePixAndPaymentLinks,
      getNow: () => simulatedNow,
    });

    const invokePost = async (pathKey, { code, query = {}, body = {} }) => {
      let status = 200;
      let payload = null;
      await routes[`POST ${pathKey}`](
        { params: { code }, query, body, protocol: "https", headers: { host: "corpflats.com.br" }, get: () => "corpflats.com.br" },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    const invokeGet = async (pathKey, { code, query = {}, body = {} }) => {
      let status = 200;
      let payload = null;
      await routes[`GET ${pathKey}`](
        { params: { code }, query, body, protocol: "https", headers: { host: "corpflats.com.br" }, get: () => "corpflats.com.br" },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 11a) Tentativa de cancelar reserva 9999 de outro cliente via pacote -> 403
    const crossCancel = await invokePost("/api/pms/guest-portal/:code/cancel", {
      code: pkgCode,
      body: { cancelWholePackage: false, reservationId: 9999 },
    });
    assert.equal(crossCancel.status, 403);
    assert.equal(mockDb.reservations[2].status, "confirmada");

    // 11b) Hóspede não-solicitante do Flat 102 tentando cancelar ou modificar -> 403
    const guestCancel = await invokePost("/api/pms/guest-portal/:code/cancel", {
      code: "102-0602",
      body: { cancelWholePackage: false },
    });
    assert.equal(guestCancel.status, 403);

    const guestModify = await invokePost("/api/pms/guest-portal/:code/modify", {
      code: "102-0602",
      body: { newCheckinDate: "2026-12-10", newCheckoutDate: "2026-12-14" },
    });
    assert.equal(guestModify.status, 403);

    const guestModStatus = await invokeGet("/api/pms/guest-portal/:code/modify-status", {
      code: "102-0602",
    });
    assert.equal(guestModStatus.status, 403, "Não-solicitante bloqueado em /modify-status");

    const guestModCancelPending = await invokePost("/api/pms/guest-portal/:code/modify-cancel-pending", {
      code: "102-0602",
    });
    assert.equal(guestModCancelPending.status, 403, "Não-solicitante bloqueado em /modify-cancel-pending");

    // 11c.0) Antes de pagar: /modify-preview em item de pacote retorna requiresPayment=false, recalculatesPackagePix=true e projectedPackagePixTotal=1130
    const reqPreviewPrePay = await invokePost("/api/pms/guest-portal/:code/modify-preview", {
      code: pkgCode,
      body: { reservationId: 602, newCheckinDate: "2026-12-10", newCheckoutDate: "2026-12-13" },
    });
    assert.equal(reqPreviewPrePay.status, 200);
    assert.equal(reqPreviewPrePay.payload.requiresPayment, false, "Pré-reserva de pacote não paga deve ir direto p/ /modify sem PIX avulso MOD-...");
    assert.equal(reqPreviewPrePay.payload.recalculatesPackagePix, true);
    assert.equal(reqPreviewPrePay.payload.newDates.totalAmount, 630);
    assert.equal(reqPreviewPrePay.payload.projectedPackagePixTotal, 1130);

    // 11c) Antes de pagar: Solicitante estende Flat 102 de 2 para 3 diárias -> recalcula PIX único automaticamente (500 + 630 = 1130)
    const reqModifyPrePay = await invokePost("/api/pms/guest-portal/:code/modify", {
      code: pkgCode,
      body: { reservationId: 602, newCheckinDate: "2026-12-10", newCheckoutDate: "2026-12-13" },
    });
    assert.equal(reqModifyPrePay.status, 200);
    assert.equal(mockDb.reservations[1].totalAmount, 630);
    assert.equal(reqModifyPrePay.payload.packageSummary.pendingAmount, 1130);
    assert.ok(mockDb.reservations[0].pixCopiaECola.includes("1130.00"));

    // 11d) Pós-pagamento a menos de 24h do check-in: aplica retenção (no_refund, refundAmount = 0) mantendo Flat 101 confirmado e pago!
    await settlePackagePaymentAtomically(
      mockDb,
      pkgCode,
      { paymentMethod: "pix", txId: "TX404040", suppressNotifications: true },
      { generateStaticPixPayload: mockPixGenerator }
    );
    simulatedNow = new Date("2026-12-10T10:00:00-03:00"); // 4h antes do check-in (< 24h)
    const lateSelfCancel = await invokePost("/api/pms/guest-portal/:code/cancel", {
      code: pkgCode,
      body: { cancelWholePackage: false, reservationId: 602, reason: "Imprevisto de última hora" },
    });
    assert.equal(lateSelfCancel.status, 200);
    assert.equal(lateSelfCancel.payload.refundAmount, 0);
    assert.equal(mockDb.reservations[1].status, "cancelada");
    assert.equal(mockDb.reservations[1].refundStatus, "sem_reembolso");
    assert.equal(mockDb.reservations[0].status, "confirmada");
    assert.equal(mockDb.reservations[0].paymentStatus, "pago_total");
  });

  it("12. Credenciamento pós-pagamento (/api/pms/agency-guest-credential/:code): trava ocupação contratada e envia apenas instruções sem valor", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const credPostSrc = extractJsBlock(demoSrc, 'app.post(["/api/pms/agency-guest-credential/:code"', true);

    const mockDb = createIsolatedDb();
    const pkgCode = "PKG-515151";
    mockDb.reservations.push({
      id: 701,
      code: "103-0701",
      packageId: pkgCode,
      packageCode: pkgCode,
      packageIndex: 2,
      channel: "site_direto",
      flatId: 3,
      flatNumber: "103",
      checkinDate: "2026-12-18",
      checkoutDate: "2026-12-20",
      status: "confirmada",
      paymentStatus: "pago_total",
      guestCount: 1, // Contratado para 1 pessoa!
      informGuestsLater: true,
      guestPending: true,
      hideFinancialForGuest: true,
      guestName: "A Definir",
      requesterInfo: { name: "Roberto Solicitante", whatsapp: "5522999110000" },
      guests: [],
      totalAmount: 490,
      paidAmount: 490,
    });

    let catchUpCalled = false;
    const sentGuestMessages = [];
    let postHandler = null;
    const appMock = {
      post(_paths, h) { postHandler = h; },
    };

    new Function(
      "deps",
      `
      const {
        app, db, isPackageCode, getPrimaryPackageReservation, isFlatGuestCredentialIncomplete,
        dispatchIndividualFlatGuestInstructions, onCatchUpCalled, sendZapiMessage
      } = deps;
      const findReservationByLocatorOrContact = (c) => isPackageCode(c) ? getPrimaryPackageReservation(db, c) : db.reservations.find(x => x.code === c);
      const isPendingGuestName = (n) => !n || /a definir|informar depois/i.test(n);
      const areGuestNamesCompatible = () => true;
      const isValidBrazilianCpf = () => true;
      const checkZapiPhoneExists = async () => ({ checked: false });
      const uploadImageToStorage = async (u) => u;
      const cancelPendingCredentialReminders = () => {};
      const cleanWhatsAppPhone = (p) => String(p || "").replace(/\\D/g, "");
      const ensureReservationAuditLogs = () => {};
      const addReservationAuditLog = () => {};
      const dispatchCatchUpGuestRulerMessages = async () => { onCatchUpCalled(); return []; };
      const scheduleUpcomingReservationTriggers = () => {};
      const ensureReservationScheduledEmails = () => {};
      const isReservationForTodayOrPast = () => false;
      const isReservationForToday = () => false;
      const dispatchConfirmedReservationToReceptionAndGarage = async () => {};
      const ensureReceptionAndGarageNotifiedForArrival = async () => {};
      const syncGuestToCrm = () => {};
      const saveDatabase = () => {};
      const serializeReservationForAgencyCredential = (r) => ({ id: r.id, code: r.code, guestCount: r.guestCount, guestName: r.guestName });
      const appendMessageToConversation = () => {};
      ${credPostSrc}
      `
    )({
      app: appMock,
      db: mockDb,
      isPackageCode,
      getPrimaryPackageReservation,
      isFlatGuestCredentialIncomplete,
      dispatchIndividualFlatGuestInstructions,
      onCatchUpCalled: () => { catchUpCalled = true; },
      sendZapiMessage: async (_cfg, payload) => {
        sentGuestMessages.push({ phone: payload.phone, text: payload.message, buttons: payload.buttons });
        return { success: true };
      },
    });

    let resStatus = 200;
    let resPayload = null;
    await postHandler(
      {
        params: { code: "103-0701" },
        body: {
          guestName: "Beatriz Médica",
          guestPhone: "5522999445566",
          guestDocument: "12345678909",
          // Tentativa indevida de subir ocupação paga de 1 para 3 hóspedes grátis:
          guestCount: 3,
          guest2Name: "Acompanhante Indevido",
          guest2Phone: "5522999445567",
        },
        protocol: "https",
        get: () => "corpflats.com.br",
      },
      { status(s) { resStatus = s; return this; }, json(p) { resPayload = p; return this; } }
    );

    assert.equal(resStatus, 200, `Esperava 200 mas recebeu ${resStatus}: ${JSON.stringify(resPayload)}`);
    assert.equal(resPayload.success, true);
    assert.equal(mockDb.reservations[0].guestCount, 1, "Ocupação contratada do flat pago (1 pessoa) não pode sofrer upgrade gratuito");
    assert.equal(catchUpCalled, false, "Reserva de pacote NUNCA deve acionar dispatchCatchUpGuestRulerMessages (que vazaria valores ou duplicaria envio)");
    assert.equal(sentGuestMessages.length, 1);
    assert.equal(sentGuestMessages[0].phone, "5522999445566");
    assert.equal(sentGuestMessages[0].text.includes("R$"), false, "Instruções enviadas ao hóspede credenciado NUNCA podem conter valores R$");
  });

  it("13. Faturado Consolidado (1 Pré-Boleto Único, 0 duplicatas em checkout_auto, NFS-e consolidada) & Sofia IA anti-overbooking", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");

    const mockDb = createIsolatedDb();
    const pkgCode = "PKG-FAT777";
    mockDb.reservations.push(
      {
        id: 801,
        code: "101-0801",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        status: "confirmada",
        paymentMethod: "boleto_faturado",
        paymentStatus: "pendente",
        isFaturadoBoleto: true,
        guestName: "Eng. Ricardo",
        companyName: "Construtora Beta S.A.",
        companyCnpj: "11222333000181",
        totalAmount: 600,
        paidAmount: 0,
      },
      {
        id: 802,
        code: "102-0802",
        packageId: pkgCode,
        packageCode: pkgCode,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-11",
        checkoutDate: "2026-12-14",
        status: "confirmada",
        paymentMethod: "boleto_faturado",
        paymentStatus: "pendente",
        isFaturadoBoleto: true,
        guestName: "Arq. Juliana",
        companyName: "Construtora Beta S.A.",
        companyCnpj: "11222333000181",
        totalAmount: 900,
        paidAmount: 0,
      }
    );

    const doesBolAndSettledSrc = demoSrc
      .slice(
        demoSrc.indexOf("export function doesBoletoCoverReservation("),
        demoSrc.indexOf("export function sanitizeFaturadoBoletoReservations(")
      )
      .replace(/\bexport\s+function/g, "function");
    const preBoletosSrc = demoSrc.slice(
      demoSrc.indexOf("function buildSinglePreBoletoFromReservation("),
      demoSrc.indexOf("function computeReservationAccommodationAndConsumption(")
    );
    const emitFatSrc = demoSrc.slice(
      demoSrc.indexOf("async function emitCheckoutFaturadoPackage("),
      demoSrc.indexOf("/**\n * Rotina de Lembretes Automáticos de Vencimento de Boletos") >= 0
        ? demoSrc.indexOf("/**\n * Rotina de Lembretes Automáticos de Vencimento de Boletos")
        : demoSrc.indexOf("async function processAutomaticBoletoReminders(")
    );

    let capturedNfsePayload = null;
    const faturadoRuntime = new Function(
      "deps",
      `
      const { db, isPackageCode, getPackageReservations, onNfse } = deps;
      const isPackageItemActive = (r) => r && r.status !== "cancelada";
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto || r?.paymentMethod === "boleto_faturado");
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r?.totalAmount || 0),
        consumptionAmount: 0,
        priorPaidAmount: 0,
        totalWithConsumption: Number(r?.totalAmount || 0),
        netAccommodationBoletoAmount: Number(r?.totalAmount || 0),
        netConsumptionBoletoAmount: 0,
        netTotalBoletoAmount: Number(r?.totalAmount || 0),
        minibarOrderIds: [],
      });
      const resolveReservationCrmLinks = () => ({ guest: null, company: { corporateName: "Construtora Beta S.A.", cnpj: "11222333000181" }, agency: null });
      const getBrasiliaDateStr = () => "2026-12-10";
      const addDaysToIsoDate = (_d, n) => "2026-12-" + String(10 + n).padStart(2, "0");
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const applyCrmBillingConfigFields = () => {};
      const resolveBoletoPayerData = () => ({ nome: "Construtora Beta S.A.", cpfCnpj: "11222333000181", email: "fin@beta.com.br", tipoPessoa: "JURIDICA" });
      const resolveReservationBillingRecipientsList = () => ({ flags: {}, financialResponsible: null });
      const findExistingInvoiceForReservation = () => null;
      const onlyDigits = (s) => String(s || "").replace(/\\D/g, "");
      const enrichBoletoDynamicStatus = (b) => b;
      const executeNfseEmissionInternal = async (payload) => {
        onNfse(payload);
        const inv = { id: "INV-PKG-1", numeroNfse: "20260001", valorServico: payload.valorServico };
        db.invoices.push(inv);
        return { success: true, invoice: inv };
      };
      const issueInterBoleto = async (opts) => ({
        seuNumero: opts.seuNumero,
        nossoNumero: "0009001",
        codigoSolicitacao: "SOL-9001",
        codigoBarras: "23790000",
        linhaDigitavel: "23790.0000",
        pixCopiaECola: "PIX_BOL",
        txId: "TXBOL1",
        provider: "inter_simulated",
        simulated: true,
        interSynced: false,
        interLastSyncedAt: null,
        pagador: opts.payer,
      });
      const syncBoletoWithAccountsReceivable = () => {};
      const dispatchFaturadoBillingPackage = async () => ({ success: true });
      const saveDatabase = () => {};
      ${doesBolAndSettledSrc}
      ${preBoletosSrc}
      ${emitFatSrc}
      return { doesBoletoCoverReservation, hasRealSettlementForFaturadoBoleto, buildAwaitingEmissionPreBoletos, emitCheckoutFaturadoPackage };
      `
    )({
      db: mockDb,
      isPackageCode,
      getPackageReservations,
      onNfse: (p) => { capturedNfsePayload = p; },
    });

    // 13a) Antes de emitir: gera 1 único Pré-Boleto consolidado do pacote (R$ 1.500,00) em vez de 2 separados
    const preBefore = faturadoRuntime.buildAwaitingEmissionPreBoletos(mockDb);
    assert.equal(preBefore.length, 1);
    assert.equal(preBefore[0].code, `PRE-${pkgCode}`);
    assert.equal(preBefore[0].amount, 1500);
    assert.deepEqual(preBefore[0].reservationIds, [801, 802]);

    // 13b) Emite Boleto + NFS-e consolidados
    const emitted = await faturadoRuntime.emitCheckoutFaturadoPackage(mockDb.reservations[0], {
      consolidatePackage: true,
      packageId: pkgCode,
      reservationIds: [801, 802],
      emitNfse: true,
    });
    assert.equal(emitted.boletos.length, 1);
    assert.equal(emitted.boletos[0].amount, 1500);
    assert.ok(capturedNfsePayload, "NFS-e consolidada deve ser emitida no faturamento do pacote");
    assert.equal(capturedNfsePayload.isConsolidated, true);
    assert.deepEqual(capturedNfsePayload.reservationIds, [801, 802]);
    assert.equal(capturedNfsePayload.flatNumber, "101, 102");
    assert.ok(capturedNfsePayload.discriminacao.includes("Flat 101") && capturedNfsePayload.discriminacao.includes("Flat 102"));

    // 13c) Após emitido, NÃO sobra nenhum pré-boleto órfão nem para o Flat 101 nem para o Flat 102!
    const preAfter = faturadoRuntime.buildAwaitingEmissionPreBoletos(mockDb);
    assert.equal(preAfter.length, 0);

    // 13d) Check-out automático do Flat 102 (2º flat) reconhece o boleto consolidado e NÃO emite duplicata!
    const autoCheckoutSecondFlat = await faturadoRuntime.emitCheckoutFaturadoPackage(mockDb.reservations[1], {
      triggerSource: "checkout_auto",
    });
    assert.equal(autoCheckoutSecondFlat.alreadyEmitted, true);
    assert.equal(mockDb.boletos.length, 1);

    // 13e) Quando o boleto único é liquidado, hasRealSettlementForFaturadoBoleto retorna true para AMBOS os flats!
    mockDb.boletos[0].status = "pago";
    assert.equal(faturadoRuntime.hasRealSettlementForFaturadoBoleto(mockDb.reservations[0], mockDb), true);
    assert.equal(faturadoRuntime.hasRealSettlementForFaturadoBoleto(mockDb.reservations[1], mockDb), true);

    // 13f) Sofia IA fallback anti-overbooking: se Flats 101 e 102 já estão ocupados, aloca 103 e 104 sem conflito
    const sofiaDb = createIsolatedDb();
    sofiaDb.reservations.push(
      { id: 1, flatId: 1, flatNumber: "101", checkinDate: "2026-12-10", checkoutDate: "2026-12-13", status: "confirmada" },
      { id: 2, flatId: 2, flatNumber: "102", checkinDate: "2026-12-10", checkoutDate: "2026-12-13", status: "pre_reserva" }
    );
    const prevHook = globalThis.createSofiaMultiFlatPreReservation;
    delete globalThis.createSofiaMultiFlatPreReservation;
    try {
      const sofiaRes = await gerarLinkReservaTool.execute(
        {
          data_checkin: "2026-12-10",
          data_checkout: "2026-12-12",
          nome_solicitante: "Cliente Anti-Overbooking",
          flats: [
            { data_checkin: "2026-12-10", data_checkout: "2026-12-12", quantidade_hospedes: 2, solicitante_hospeda_aqui: true },
            { data_checkin: "2026-12-10", data_checkout: "2026-12-12", quantidade_hospedes: 1, informar_hospedes_depois: true },
          ],
          confirmacao_hospede: true,
        },
        {
          data_hora_atual: "2026-11-17T15:00:00-03:00",
          telefone_remetente: "5522999776655",
          estado_atual: "COMERCIAL_VENDAS",
          runtime: { db: sofiaDb, suppressExternalSend: true },
        }
      );
      assert.equal(sofiaRes.status, "SUCESSO_EXECUTADO");
      const createdPkg = getPackageReservations(sofiaDb, sofiaRes.dados.codigo_pacote);
      assert.deepEqual(createdPkg.map((r) => r.flatNumber).sort(), ["103", "104"]);
    } finally {
      if (prevHook) globalThis.createSofiaMultiFlatPreReservation = prevHook;
    }

    const tsToolSrc = fs.readFileSync(path.resolve("src/agent/tools/gerar-link-reserva.tool.ts"), "utf8");
    assert.ok(
      tsToolSrc.includes("pkgCodeFallback") && tsToolSrc.includes("SEM_DISPONIBILIDADE_MULTI_FLAT"),
      "Tool TS gerar-link-reserva deve gerar pacote PKG-... com trava anti-overbooking sem cair no fluxo de 1 flat"
    );
  });

  it("14. Integração real: assinaturas reais (zapi-service + mail-service c/ transporte stubado), Inter Webhook (/api/pms/inter/webhook), change-payment-method (PIX <-> Cartão), central e credenciamento requesterIsGuest1", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");

    // 14a) Assinaturas 100% reais de sendZapiMessage, appendMessageToConversation, wrapEmailTemplate e sendEmailAsync (stubando apenas HTTP/SMTP outbound)
    const realDb = createIsolatedDb();
    realDb.zapiConfig = {
      instanceId: "inst_unit_pkg",
      token: "tok_unit_pkg",
      clientToken: "cli_unit_pkg",
      enabled: true,
      testModeOnly: false,
      deliveryMode: "text_links",
    };
    const pkgReal = "PKG-314159";
    realDb.reservations.push(
      {
        id: 4101,
        code: "101-4101",
        packageId: pkgReal,
        packageCode: pkgReal,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-22",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 2,
        requesterIsGuest1: true,
        guestName: "Roberto Solicitante",
        guestPhone: "5522999110000",
        requesterInfo: {
          name: "Roberto Solicitante",
          whatsapp: "5522999110000",
          email: "roberto@empresa.com.br",
          cpf: "12345678909",
        },
        guests: [
          { index: 1, name: "Roberto Solicitante", phone: "5522999110000" },
          { index: 2, name: "Carla Esposa", phone: "5522999110099" },
        ],
        totalAmount: 400,
        paidAmount: 0,
      },
      {
        id: 4102,
        code: "102-4102",
        packageId: pkgReal,
        packageCode: pkgReal,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-23",
        status: "pre_reserva",
        paymentStatus: "pendente_pix",
        guestCount: 1,
        requesterIsGuest1: false,
        informGuestsLater: true,
        guestPending: true,
        hideFinancialForGuest: true,
        guestName: "A Definir",
        guestPhone: "",
        requesterInfo: {
          name: "Roberto Solicitante",
          whatsapp: "5522999110000",
          email: "roberto@empresa.com.br",
          cpf: "12345678909",
        },
        guests: [],
        totalAmount: 600,
        paidAmount: 0,
      }
    );

    const outboundZapiHttp = [];
    const outboundSmtpMails = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      outboundZapiHttp.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ zaapId: `zaap_${outboundZapiHttp.length}`, messageId: `zmsg_${outboundZapiHttp.length}` }),
        text: async () => JSON.stringify({ messageId: `zmsg_${outboundZapiHttp.length}` }),
      };
    };

    try {
      const realDeps = {
        generateStaticPixPayload: mockPixGenerator,
        sendZapiMessage: realSendZapiMessage,
        appendMessageToConversation: realAppendMessageToConversation,
        wrapEmailTemplate: realWrapEmailTemplate,
        sendEmailAsync: realSendEmailAsync,
        scheduleUpcomingReservationTriggers: realScheduleUpcomingReservationTriggers,
        emailOverrides: {
          transporter: {
            sendMail: async (mailOpts) => {
              outboundSmtpMails.push(mailOpts);
              return { messageId: `smtp_${outboundSmtpMails.length}` };
            },
          },
        },
      };

      await syncPackagePixAndPaymentLinks(realDb, pkgReal, realDeps);
      const preDisp = await dispatchPackagePreReservationCreated(realDb, pkgReal, "https://corpflats.com.br", realDeps);
      assert.equal(preDisp.sentWhatsapp, true, "sendZapiMessage real (c/ fetch stubado) deve retornar success:true");
      assert.equal(preDisp.sentEmail, true, "sendEmailAsync + wrapEmailTemplate reais devem registrar o e-mail");
      assert.equal(outboundZapiHttp.length, 1);
      assert.ok((realDb.whatsappConversations || []).some((c) => c.phone === "5522999110000" && c.messages.length >= 1));
      assert.equal((realDb.reservationCommunications || []).length, 1);
      assert.ok(realDb.reservationCommunications[0].body.includes("<!DOCTYPE html>"), "wrapEmailTemplate real deve envolver o HTML");
      assert.ok(realDb.reservationCommunications[0].body.includes("Pré-Reserva Unificada"));

      // Liquidação em Cartão de Crédito (+5%: 1000 / 0.95 = 1052.63) rateia proporcionalmente entre os flats e envia recibo por WhatsApp + E-mail!
      const settledCard = await settlePackagePaymentAtomically(
        realDb,
        pkgReal,
        { paymentMethod: "cartao_credito", amount: 1052.63, mpPaymentId: "MP-998877" },
        realDeps
      );
      await new Promise((r) => setImmediate(r));
      assert.equal(settledCard.sentReceiptWhatsapp, true);
      assert.equal(settledCard.sentReceiptEmail, true);
      const sumProrated = Math.round((realDb.reservations[0].totalAmount + realDb.reservations[1].totalAmount) * 100) / 100;
      assert.equal(sumProrated, 1052.63, "Rateio proporcional de cartão (+5%) deve fechar exatamente os centavos");
      assert.ok(realDb.reservations[1].b2bCredentialWhatsappSentAt, "Item c/ credencial pendente marca b2bCredentialWhatsappSentAt");
      assert.ok(realDb.reservations[1].credentialFirstRequestSentAt, "Item c/ credencial pendente marca credentialFirstRequestSentAt");
      assert.ok(realDb.reservations[1].credentialSentStages?.initial?.whatsappSentAt, "Item c/ credencial pendente marca credentialSentStages.initial");
      assert.equal((realDb.reservationCommunications || []).length, 2, "Deve haver 1 e-mail de pré-reserva + 1 e-mail de recibo consolidado");
      assert.ok(realDb.reservationCommunications[0].body.includes("Pagamento Confirmado"));
      assert.equal(outboundSmtpMails.length, 2);
    } finally {
      globalThis.fetch = origFetch;
    }

    // 14b) Execução real de POST /api/pms/inter/webhook + confirmReservationPayment + POST /api/pms/reservations/:code/change-payment-method
    const hookDb = createIsolatedDb();
    hookDb.abandonedCarts = [{ id: "cart_1", reservationCode: "PKG-808080", status: "abandonado", currentStep: 3 }];
    const pkgWebhook = "PKG-808080";
    hookDb.reservations.push(
      {
        id: 4201,
        code: "101-4201",
        packageId: pkgWebhook,
        packageCode: pkgWebhook,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-22",
        checkoutDate: "2026-12-24",
        status: "pre_reserva",
        paymentStatus: "aguardando_pix",
        guestCount: 1,
        requesterIsGuest1: true,
        guestName: "Roberto Solicitante",
        guestPhone: "5522999110000",
        guestEmail: "roberto@empresa.com.br",
        requesterEmail: "roberto@empresa.com.br",
        requesterInfo: { name: "Roberto Solicitante", whatsapp: "5522999110000", email: "roberto@empresa.com.br" },
        totalAmount: 500,
        paidAmount: 0,
      },
      {
        id: 4202,
        code: "102-4202",
        packageId: pkgWebhook,
        packageCode: pkgWebhook,
        packageIndex: 2,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-22",
        checkoutDate: "2026-12-25",
        status: "pre_reserva",
        paymentStatus: "aguardando_pix",
        guestCount: 1,
        requesterIsGuest1: false,
        informGuestsLater: true,
        guestPending: true,
        hideFinancialForGuest: true,
        guestName: "A Definir",
        requesterInfo: { name: "Roberto Solicitante", whatsapp: "5522999110000", email: "roberto@empresa.com.br" },
        totalAmount: 700,
        paidAmount: 0,
      }
    );
    await syncPackagePixAndPaymentLinks(hookDb, pkgWebhook, { generateStaticPixPayload: mockPixGenerator });

    const notificationsCreated = [];
    const capiCalls = [];
    const receptionGarageCalls = [];
    const mpPreferencesCreated = [];
    const routes14 = {};
    const appMock14 = {
      get(p, h) { routes14[`GET ${p}`] = h; },
      post(p, h) {
        if (Array.isArray(p)) p.forEach((k) => { routes14[`POST ${k}`] = h; });
        else routes14[`POST ${p}`] = h;
      },
    };

    const webhookSrc = demoSrc.slice(
      demoSrc.indexOf('app.post("/api/pms/inter/webhook"'),
      demoSrc.indexOf("async function checkInterPixCobStatus(")
    );
    const confirmPaySrc = demoSrc.slice(
      demoSrc.indexOf("async function confirmReservationPayment("),
      demoSrc.indexOf('app.post("/api/pms/packages/:packageId/confirm-payment"')
    );
    const changePaySrc = demoSrc.slice(
      demoSrc.indexOf('app.post("/api/pms/reservations/:code/change-payment-method"'),
      demoSrc.indexOf('app.get("/api/integrations/inter/config"')
    );
    const centralSrc = demoSrc.slice(
      demoSrc.indexOf('app.get("/api/pms/reservations/central"'),
      demoSrc.indexOf('app.post("/api/pms/reservations/:id/quick-checkin"')
    );
    const credPostSrc14 = extractJsBlock(demoSrc, 'app.post(["/api/pms/agency-guest-credential/:code"', true);

    new Function(
      "deps",
      `
      const {
        app, db, isPackageCode, isPackageItemActive, isReservationSettledInPackage,
        isFlatGuestCredentialIncomplete, getPackageReservations, getPrimaryPackageReservation,
        computePackageSummary, syncPackagePixAndPaymentLinks, settlePackagePaymentAtomically,
        dispatchIndividualFlatGuestInstructions, onNotif, onCapi, onRecGar, onMpPref
      } = deps;
      const process = { env: { NODE_ENV: "test" } };
      const DEFAULT_INTER_CONFIG = { pixKey: "47964813000165" };
      const computeCardAmountFromPix = (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100;
      const createInterPixCob = null;
      const generateStaticPixPayload = ({ amount, txid }) => "PIX_" + Number(amount).toFixed(2) + "_" + txid;
      const cleanWhatsAppPhone = (p) => String(p || "").replace(/\\D/g, "");
      const sendZapiMessage = async () => ({ success: true });
      const appendMessageToConversation = () => {};
      const sendEmailAsync = async () => ({ ok: true });
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const scheduleUpcomingReservationTriggers = () => {};
      const ensureReservationScheduledEmails = () => {};
      const dispatchConfirmedReservationToReceptionAndGarage = async (r, src) => { onRecGar(r.code, src); };
      const dispatchServerSidePurchaseConversion = async (_d, r, meta) => { onCapi(r.code, meta); };
      const createNotification = (n) => { onNotif(n); };
      const sweepExpiredPreReservations = async () => {};
      const findReservationByLocatorOrContact = (c) => isPackageCode(c) ? getPrimaryPackageReservation(db, c) : db.reservations.find(x => x.code === c || String(x.id) === String(c));
      const createMercadoPagoPreference = async (opts) => {
        onMpPref(opts);
        return { id: "PREF_PKG_" + opts.reservationCode, initPoint: "https://mp.test/checkout/" + opts.reservationCode };
      };
      const ensureReservationCompositeTotal = () => {};
      const enrichReservationPayments = (p) => p;
      const ensureExtensionPaymentConfirmationDispatched = async () => {};
      const ensurePaymentConfirmationDispatched = async () => {};
      const saveDatabase = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const getTodayStr = () => "2026-12-10";
      const getRequestsForDate = () => [];
      const ensureReservationAuditLogs = () => {};
      const addReservationAuditLog = () => {};
      const getBrasiliaNow = () => ({ date: "2026-12-10" });
      const getGuestIndexes = () => ({ guestsById: new Map(), guestsByDoc: new Map(), guestsByPhone: new Map(), guestsByName: new Map() });
      const areGuestNamesCompatible = () => true;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const isPendingGuestName = (n) => !n || /a definir|informar depois/i.test(n);
      const isValidBrazilianCpf = () => true;
      const checkZapiPhoneExists = async () => ({ checked: false });
      const uploadImageToStorage = async (u) => u;
      const cancelPendingCredentialReminders = () => {};
      const dispatchCatchUpGuestRulerMessages = async () => ({ dispatchedStages: [] });
      const validateGuestEmailAddress = async () => ({ valid: true });
      const serializeReservationForAgencyCredential = (r) => ({ id: r.id, code: r.code, requesterIsGuest1: r.requesterIsGuest1, hideFinancialForGuest: r.hideFinancialForGuest });
      ${confirmPaySrc}
      ${webhookSrc}
      ${changePaySrc}
      ${centralSrc}
      ${credPostSrc14}
      `
    )({
      app: appMock14,
      db: hookDb,
      isPackageCode,
      isPackageItemActive,
      isReservationSettledInPackage,
      isFlatGuestCredentialIncomplete,
      getPackageReservations,
      getPrimaryPackageReservation,
      computePackageSummary,
      syncPackagePixAndPaymentLinks,
      settlePackagePaymentAtomically,
      dispatchIndividualFlatGuestInstructions,
      onNotif: (n) => notificationsCreated.push(n),
      onCapi: (code, meta) => capiCalls.push({ code, meta }),
      onRecGar: (code, src) => receptionGarageCalls.push({ code, src }),
      onMpPref: (opts) => mpPreferencesCreated.push(opts),
    });

    const callRoute14 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await routes14[key](
        { params, query, body, protocol: "https", headers: { host: "corpflats.com.br" }, get: () => "corpflats.com.br" },
        {
          set() { return this; },
          status(s) { status = s; return this; },
          json(p) { payload = p; return this; },
          send(p) { payload = p; return this; },
        }
      );
      return { status, payload };
    };

    // 14b.1) change-payment-method p/ Cartão (+5%: 1200 / 0.95 = 1263.16) gera 1 preferência MP p/ PKG-808080 e volta p/ PIX
    const toCard = await callRoute14("POST /api/pms/reservations/:code/change-payment-method", {
      params: { code: pkgWebhook },
      body: { method: "cartao_credito" },
    });
    assert.equal(toCard.status, 200);
    assert.equal(toCard.payload.paymentMethod, "cartao_credito");
    assert.equal(toCard.payload.cardAmount, 1263.16);
    assert.equal(mpPreferencesCreated.length, 1);
    assert.equal(mpPreferencesCreated[0].reservationCode, pkgWebhook);
    assert.equal(hookDb.reservations[0].packageMpInitPoint, `https://mp.test/checkout/${pkgWebhook}`);
    assert.equal(hookDb.reservations[1].packageMpInitPoint, `https://mp.test/checkout/${pkgWebhook}`);

    const backToPix = await callRoute14("POST /api/pms/reservations/:code/change-payment-method", {
      params: { code: pkgWebhook },
      body: { method: "pix" },
    });
    assert.equal(backToPix.status, 200);
    assert.equal(backToPix.payload.paymentMethod, "pix");
    assert.equal(backToPix.payload.pixAmount, 1200);

    // 14b.2) Trava contra pagamento parcial no Webhook Inter (R$ 300 de R$ 1.200 -> sinal_pago + recalcula PIX p/ R$ 900)
    const pkgTxIdBefore = hookDb.reservations[0].packagePixTxId;
    await callRoute14("POST /api/pms/inter/webhook", {
      body: { pix: [{ txid: pkgTxIdBefore, valor: "300.00", endToEndId: "E2E_PARTIAL_1" }] },
    });
    assert.equal(hookDb.reservations[0].paymentStatus, "sinal_pago");
    assert.equal(hookDb.reservations[1].paymentStatus, "sinal_pago");
    assert.equal(hookDb.reservations[0].status, "pre_reserva", "Pagamento parcial não deve quitar pré-reserva integralmente");
    assert.equal(hookDb.reservations[0].packagePixChargedAmount, 900, "PIX único recalculado para o saldo restante de R$ 900");

    // 14b.3) Liquidação do saldo restante (R$ 900) via Webhook Inter quita atomicamente o pacote todo!
    const pkgTxIdRest = hookDb.reservations[0].packagePixTxId;
    await callRoute14("POST /api/pms/inter/webhook", {
      body: { pix: [{ txid: pkgTxIdRest, valor: "900.00", endToEndId: "E2E_FULL_2" }] },
    });
    assert.ok(hookDb.reservations.every((r) => r.status === "confirmada" && r.paymentStatus === "pago_total"));
    assert.equal(hookDb.abandonedCarts[0].status, "concluido", "Carrinho abandonado marcado como concluído");
    assert.equal(capiCalls.length, 1, "Deve disparar 1 único evento CAPI consolidado p/ o pacote");
    assert.deepEqual(
      receptionGarageCalls.map((x) => x.code),
      ["101-4201"],
      "Apenas o flat já com hóspede identificado dispara recepção/garagem na hora (Flat 102 aguarda credenciamento)"
    );

    // 14b.4) GET /api/pms/reservations/central expõe metadados do pacote, hideFinancialForGuest, needsGuestCredential e consolidatedInvoiceId
    hookDb.reservations[0].consolidatedInvoiceId = 999;
    hookDb.reservations[1].consolidatedInvoiceId = 999;
    const centralRes = await callRoute14("GET /api/pms/reservations/central");
    const row1 = centralRes.payload.items.find((x) => x.code === "101-4201");
    const row2 = centralRes.payload.items.find((x) => x.code === "102-4202");
    assert.equal(row1.packageCode, pkgWebhook);
    assert.equal(row1.hideFinancialForGuest, false);
    assert.equal(row1.needsGuestCredential, false);
    assert.equal(row1.invoiceIssued, true);
    assert.equal(row2.packageCode, pkgWebhook);
    assert.equal(row2.hideFinancialForGuest, true);
    assert.equal(row2.needsGuestCredential, true);
    assert.equal(row2.invoiceIssued, true);

    // 14b.5) POST /api/pms/agency-guest-credential/:code com requesterIsGuest1: true no Flat 1 preenche a partir de requesterInfo e libera hideFinancialForGuest=false
    hookDb.reservations[0].guestName = "A Definir";
    hookDb.reservations[0].guestPhone = "";
    hookDb.reservations[0].informGuestsLater = true;
    hookDb.reservations[0].guestPending = true;
    hookDb.reservations[0].requesterIsGuest1 = false;
    hookDb.reservations[0].hideFinancialForGuest = true;
    hookDb.reservations[0].requesterInfo = {
      name: "Roberto Solicitante",
      whatsapp: "5522999110000",
      email: "roberto@empresa.com.br",
      cpf: "12345678909",
    };
    const credShortcut = await callRoute14("POST /api/pms/agency-guest-credential/:code", {
      params: { code: "101-4201" },
      body: { requesterIsGuest1: true },
    });
    assert.equal(credShortcut.status, 200);
    assert.equal(hookDb.reservations[0].guestName, "Roberto Solicitante");
    assert.equal(hookDb.reservations[0].guestPhone, "5522999110000");
    assert.equal(hookDb.reservations[0].requesterIsGuest1, true);
    assert.equal(hookDb.reservations[0].hideFinancialForGuest, false);
  });
});
