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
  resolveWhatsAppTags,
  renderTemplateButtons,
  DEFAULT_WHATSAPP_TEMPLATES,
} from "../artifacts/api-server/zapi-service.mjs";

import {
  wrapEmailTemplate as realWrapEmailTemplate,
  sendEmailAsync as realSendEmailAsync,
  parseEmailList,
  validateEmailList,
  formatEmailList,
  getPrimaryEmail,
  validateGuestEmailAddress,
  notifyGuestInvalidEmailViaWhatsApp,
} from "../artifacts/api-server/mail-service.mjs";

import { getReservationRecipients } from "../artifacts/api-server/zapi-service.mjs";
import { buildNationalDpsPayload } from "../artifacts/api-server/national-nfse.mjs";
import { normalizeInterBoletoPayer } from "../artifacts/api-server/inter-boleto-service.mjs";
import { buildOfficialNfseDraftForReservation } from "../artifacts/api-server/chat-service.mjs";

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

    assert.ok(
      pmsSrc.includes('"/api/pms/reservations"') &&
      pmsSrc.includes("packageFlats") &&
      pmsSrc.includes("requesterIsGuest1") &&
      pmsSrc.includes("cancel-package-item") &&
      !pmsSrc.includes("isMultiFlatPackageMode")
    );
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
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
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
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
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
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
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
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
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
      const isPackageItemCancelled = (r) => String(r?.status || "").toLowerCase() === "cancelada";
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
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
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

  it("15. M1 Multi-Email (;), Isolamento [0] (SEFIN/Inter), Taxas Extras, Pagamentos Divididos/Sinal e Quitação de Saldo Restante", async () => {
    // 15a) Helpers multi-e-mail em mail-service.mjs
    const validRes = validateEmailList("Fin1@Emp.com; contas@emp.com, fin1@emp.com");
    assert.equal(validRes.valid, true);
    assert.deepEqual(validRes.emails, ["fin1@emp.com", "contas@emp.com"]);
    assert.deepEqual(validRes.invalidTokens, []);
    assert.equal(formatEmailList("A@X.COM; b@y.com"), "a@x.com; b@y.com");
    assert.equal(getPrimaryEmail("a@x.com; b@y.com"), "a@x.com");

    const invalidRes = validateEmailList("ok@emp.com; nao-eh-email");
    assert.equal(invalidRes.valid, false);
    assert.deepEqual(invalidRes.emails, ["ok@emp.com"]);
    assert.deepEqual(invalidRes.invalidTokens, ["nao-eh-email"]);

    const emptyRes = validateEmailList("");
    assert.equal(emptyRes.valid, true);
    assert.deepEqual(emptyRes.emails, []);

    // validateGuestEmailAddress continua estrito p/ 1 e-mail
    const singleCheck = await validateGuestEmailAddress("guest@corpflats.com.br", { checkDns: false });
    assert.equal(singleCheck.valid, true);
    const multiSingleCheck = await validateGuestEmailAddress("a@x.com; b@y.com", { checkDns: false });
    assert.equal(multiSingleCheck.valid, false);

    // 15b) Isolamento [0] em Gov.br SEFIN DPS e Banco Inter pagador.email
    const dps = buildNationalDpsPayload({
      numeroDps: 9001,
      tomador: {
        cpfCnpj: "11222333000181",
        nome: "Empresa Multi Email LTDA",
        email: "fin1@emp.com; fin2@emp.com",
        logradouro: "Av. Pelinca",
        numero: "100",
        bairro: "Pelinca",
        cidade: "Campos dos Goytacazes",
        uf: "RJ",
        cep: "28035000",
        codigoMunicipio: "3301009",
      },
      valorServico: 500,
    });
    assert.equal(dps.dpsPayload.infDPS.toma.email, "fin1@emp.com");

    const interPayer = normalizeInterBoletoPayer({
      cpfCnpj: "11222333000181",
      name: "Empresa Multi Email LTDA",
      email: "fin1@emp.com; fin2@emp.com",
    });
    assert.equal(interPayer.email, "fin1@emp.com");

    // 15c) sendEmailAsync com destinatários separados por ';' envia como ',' ao Nodemailer
    const sentMailCalls = [];
    const mailDb = { settings: { emailSettings: { enabled: true } }, reservationCommunications: [] };
    const mailLog = realSendEmailAsync({
      db: mailDb,
      saveDatabase: () => {},
      reservationId: "RES-101-0001",
      recipient: "fin1@emp.com; fin2@emp.com",
      subject: "Fatura Teste",
      bodyHtml: "<p>Teste</p>",
      overrides: {
        transporter: {
          sendMail: async (opts) => {
            sentMailCalls.push(opts);
            return { messageId: "smtp_multi_1" };
          },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(mailLog.recipient, "fin1@emp.com, fin2@emp.com");
    assert.deepEqual(mailLog.metadata.recipients, ["fin1@emp.com", "fin2@emp.com"]);
    assert.equal(sentMailCalls.length, 1);
    assert.equal(sentMailCalls[0].to, "fin1@emp.com, fin2@emp.com");

    // 15d) zapi-service getReservationRecipients preserva ';' em requester.email
    const recips = getReservationRecipients(
      {
        guestName: "João Hóspede",
        guestEmail: "joao@teste.com",
        requesterType: "company",
        companyId: 10,
      },
      {
        companies: [
          {
            id: 10,
            corporateName: "Empresa Multi LTDA",
            financialEmail: "fin1@emp.com; fin2@emp.com",
          },
        ],
      }
    );
    assert.equal(recips.requester.email, "fin1@emp.com; fin2@emp.com");

    // 15e) createMultiFlatPackageFromPayload: taxas extras, pagamentos divididos (Dinheiro + PIX), CNPJ inline & CRM Guest 1/2
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const start = demoSrc.indexOf("async function createMultiFlatPackageFromPayload(");
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
    mockDb.companies = [];
    mockDb.agencies = [];
    const sentMailInPkg = [];
    const convAppendCalls = [];

    const createPkg = new Function(
      "deps",
      `
      const {
        db, crypto, applyPackageRateioToDraftFlats, generatePackageCode,
        syncPackagePixAndPaymentLinks, dispatchPackagePreReservationCreated,
        computePackageSummary, findActiveOverbookingConflicts, sendEmailAsync, appendMessageToConversation
      } = deps;
      const DEFAULT_SITE_CONFIG = db.siteConfig;
      const DEFAULT_INTER_CONFIG = { pixKey: "47964813000165" };
      const normalizePaymentMethodId = (m) => String(m || "pix").toLowerCase();
      const isFaturadoBoletoMethod = (m) => m.includes("boleto") || m.includes("faturado");
      const getCanonicalFlats = (d) => d.flats;
      const calculateCanonicalDirectStayQuote = () => ({ pixTotalAmount: 500, avgDailyRatePerFlat: 250, perNightCombinedRates: [] });
      const isPendingGuestName = (n) => !n || /a definir|informar depois/i.test(n);
      const computeCardAmountFromPix = (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100;
      const addReservationAuditLog = (r, e) => { r.auditLogs.push(e); };
      const createInterPixCob = null;
      const generateStaticPixPayload = ({ amount, txid }) => "PIX_" + Number(amount).toFixed(2) + "_" + txid;
      const cleanWhatsAppPhone = (p) => String(p || "").replace(/\\D/g, "");
      const sendZapiMessage = async () => ({ success: true, messageId: "z_1" });
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const scheduleUpcomingReservationTriggers = () => {};
      const ensureReservationScheduledEmails = () => {};
      const dispatchConfirmedReservationToReceptionAndGarage = async () => {};
      const createNotification = () => {};
      const dispatchServerSidePurchaseConversion = async () => {};
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const saveDatabase = () => {};
      const emitCheckoutFaturadoPackage = async () => ({ boletos: [] });
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
      findActiveOverbookingConflicts: () => [],
      sendEmailAsync: (opts) => {
        sentMailInPkg.push(opts);
        return { ok: true, status: "sent" };
      },
      appendMessageToConversation: (d, payload) => {
        convAppendCalls.push(payload);
        return realAppendMessageToConversation(d, payload);
      },
    });

    const pkgResult = await createPkg(
      {
        requesterType: "company",
        requesterName: "Carlos Financeiro",
        requesterPhone: "22999887766",
        requesterEmail: "fin1@novaempresa.com.br; fin2@novaempresa.com.br",
        companyName: "Nova Empresa Inline LTDA",
        companyCnpj: "12.345.678/0001-95",
        companyData: {
          corporateName: "Nova Empresa Inline LTDA",
          cnpj: "12.345.678/0001-95",
          financialEmail: "fin1@novaempresa.com.br; fin2@novaempresa.com.br",
          phone: "2227331122",
        },
        nfDeliveryEmails: "fin1@novaempresa.com.br; fin2@novaempresa.com.br",
        nfHideFromGuest: true,
        charges: [{ id: "pkg_chg_1", type: "other", title: "Estacionamento Pacote", amount: 100 }],
        payments: [
          { method: "dinheiro", amount: 200, notes: "Sinal dinheiro" },
          { method: "pix", amount: 100, notes: "Sinal PIX" },
        ],
        packageFlats: [
          {
            flatId: 1,
            checkinDate: "2027-01-10",
            checkoutDate: "2027-01-12",
            dailyRate: 250,
            guestCount: 2,
            guestName: "Titular Flat Um",
            guestPhone: "22991112222",
            guestDocument: "11144477735",
            guest2Name: "Acompanhante Flat Um",
            guest2Phone: "22993334444",
          },
          {
            flatId: 2,
            checkinDate: "2027-01-10",
            checkoutDate: "2027-01-12",
            dailyRate: 250,
            guestCount: 2,
            guestName: "Titular Flat Dois",
            guestPhone: "22995556666",
            guest2InformLater: true,
          },
        ],
      },
      { baseUrl: "https://corpflats.com.br", suppressExternalSend: false }
    );

    // Total = 500 + 500 + 100 (package charge) = 1100; Pago = 300; Pendente = 800
    assert.equal(pkgResult.summary.totalAmount, 1100);
    assert.equal(pkgResult.summary.paidAmount, 300);
    assert.equal(pkgResult.summary.pendingAmount, 800);
    assert.equal(pkgResult.reservations[0].status, "confirmada", "Sinal parcial > 0 auto-confirma o pacote");
    assert.equal(pkgResult.reservations[0].paymentStatus, "sinal_pago");
    assert.equal(pkgResult.reservations[1].paymentStatus, "sinal_pago");
    assert.ok(pkgResult.summary.pixCopiaECola.includes("PIX_800.00_"), "PIX único gerado estritamente p/ saldo restante R$ 800");
    assert.equal(mockDb.companies.length, 1, "Empresa inline criada automaticamente no CRM");
    assert.equal(mockDb.companies[0].financialEmail, "fin1@novaempresa.com.br; fin2@novaempresa.com.br");
    assert.deepEqual(pkgResult.reservations[0].nfDeliveryEmails, ["fin1@novaempresa.com.br", "fin2@novaempresa.com.br"]);
    assert.equal(pkgResult.reservations[0].nfHideFromGuest, true);
    // Guest 1 + Guest 2 do Flat 1 e Guest 1 do Flat 2 no CRM (1 seeded + 3 criados = 4, sem criar fantasma p/ guest2InformLater)
    assert.equal(mockDb.guests.length, 4);
    assert.ok(pkgResult.reservations[0].guestId);
    assert.ok(pkgResult.reservations[0].guests[1].guestId);
    assert.equal(pkgResult.reservations[1].guests[1].guestId, null);

    // Verifica envio multi-e-mail com breakdown de sinal e packageCode na conversa WhatsApp
    assert.equal(sentMailInPkg.length, 1);
    assert.equal(sentMailInPkg[0].recipient, "fin1@novaempresa.com.br, fin2@novaempresa.com.br");
    assert.ok(sentMailInPkg[0].bodyHtml.includes("Sinal / Valor Já Pago"));
    assert.ok(sentMailInPkg[0].bodyHtml.includes("Saldo Restante a Pagar"));
    assert.equal(convAppendCalls.length, 1);
    assert.equal(convAppendCalls[0].packageCode, pkgResult.packageCode);

    // 15f) Quitação atômica após sinal parcial lança SOMENTE o saldo restante (rTotal - priorPaid) em r.payments
    await settlePackagePaymentAtomically(mockDb, pkgResult.packageCode, {
      paymentMethod: "pix",
      endToEndId: "E2E_RESTANTE_800",
      baseUrl: "https://corpflats.com.br",
      suppressExternalSend: true,
    });
    const sumPaymentsFlat0 = pkgResult.reservations[0].payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const sumPaymentsFlat1 = pkgResult.reservations[1].payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    assert.equal(Math.round((sumPaymentsFlat0 + sumPaymentsFlat1) * 100) / 100, 1100, "Soma dos pagamentos deve bater exatamente com R$ 1.100 (sem duplicar sinal)");
  });

  it("16. M1 Consumo de Irmãos & Abatimento de Sinal em emitCheckoutFaturadoPackage, markBoletoAsPaid e dispatchFaturadoBillingPackage", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractFn = (name) => {
      const sig = `function ${name}(`;
      const asyncSig = `async function ${name}(`;
      let s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada em demo-server.mjs`);
      const open = demoSrc.indexOf(") {", s) + 2;
      let d = 0;
      let e = open;
      for (; e < demoSrc.length; e++) {
        if (demoSrc[e] === "{") d++;
        else if (demoSrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return demoSrc.slice(s, e + 1);
    };

    const mockDb = createIsolatedDb();
    mockDb.companies = [
      {
        id: 50,
        corporateName: "Construtora Multi LTDA",
        cnpj: "11222333000181",
        financialEmail: "finA@construtora.com.br; finB@construtora.com.br",
        phone: "2227220000",
      },
    ];
    mockDb.agencies = [];
    mockDb.boletos = [];
    mockDb.accountsReceivable = [];
    mockDb.invoices = [];
    mockDb.minibarOrders = [
      { id: "MB-SIB-2", reservationId: 902, reservationCode: "RES-102-0902", totalAmount: 80, paymentStatus: "pendente" },
    ];
    const pkg = "PKG-FAT-99";
    mockDb.reservations = [
      {
        id: 901,
        code: "RES-101-0901",
        packageId: pkg,
        packageCode: pkg,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-02-01",
        checkoutDate: "2027-02-04",
        totalAmount: 800,
        paidAmount: 150,
        paymentStatus: "sinal_pago",
        payments: [{ id: "pay_sinal_1", amount: 150, method: "pix" }],
        dailyRates: [{ date: "2027-02-01", rate: 266.67 }, { date: "2027-02-02", rate: 266.67 }, { date: "2027-02-03", rate: 266.66 }],
        charges: [],
        companyId: 50,
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
        boletoConsumptionMode: "separate",
        status: "confirmada",
      },
      {
        id: 902,
        code: "RES-102-0902",
        packageId: pkg,
        packageCode: pkg,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-02-01",
        checkoutDate: "2027-02-04",
        totalAmount: 700,
        paidAmount: 150,
        paymentStatus: "sinal_pago",
        payments: [{ id: "pay_sinal_2", amount: 150, method: "pix" }],
        dailyRates: [{ date: "2027-02-01", rate: 233.33 }, { date: "2027-02-02", rate: 233.33 }, { date: "2027-02-03", rate: 233.34 }],
        charges: [],
        companyId: 50,
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
        boletoConsumptionMode: "separate",
        status: "confirmada",
      },
    ];

    const sentBoletoEmails = [];
    const runtime = new Function(
      "deps",
      `
      const {
        db, isPackageCode, getPackageReservations, isPackageItemActive,
        parseEmailList, formatEmailList, getPrimaryEmail, normalizeInterBoletoPayer, onSendEmail
      } = deps;
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isPackageItemCancelled = (r) => String(r?.status || "").toLowerCase() === "cancelada";
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const onlyDigits = (s) => String(s || "").replace(/\\D/g, "");
      const cleanPhone = (s) => String(s || "").replace(/\\D/g, "");
      const getBrasiliaDateStr = () => "2027-02-04";
      const addDaysToIsoDate = (_d, n) => "2027-02-" + String(4 + n).padStart(2, "0");
      const normalizeBoletoConsumptionMode = (m) => m === "separate" ? "separate" : "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const applyCrmBillingConfigFields = () => {};
      const findExistingInvoiceForReservation = () => null;
      const enrichBoletoDynamicStatus = (b) => b;
      const generateBoletoPdfBuffer = async () => Buffer.from("PDF");
      const generateNfsePdfBuffer = async () => Buffer.from("NFSEPDF");
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const sendEmailAsync = (opts) => { onSendEmail(opts); return { id: "em_1", status: "pending" }; };
      const sendZapiMessage = async () => ({ success: true });
      const sendZapiDocument = async () => ({ success: true });
      const createNotification = () => {};
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const saveDatabase = () => {};
      const ensurePaymentConfirmationDispatched = async () => {};
      const executeNfseEmissionInternal = async (p) => {
        const inv = { id: 700, numeroNfse: "2027001", valorServico: p.valorServico, tomadorEmail: getPrimaryEmail(p.tomadorEmail) };
        db.invoices.push(inv);
        return { success: true, invoice: inv };
      };
      const issueInterBoleto = async (opts) => ({
        seuNumero: opts.seuNumero,
        nossoNumero: "0001",
        codigoSolicitacao: "SOL-1",
        codigoBarras: "077",
        linhaDigitavel: "07790",
        pixCopiaECola: "PIX",
        txId: "TX1",
        provider: "inter_simulated",
        simulated: true,
        pagador: opts.payer,
      });
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("computeReservationAccommodationAndConsumption")}
      ${extractFn("resolveReservationCrmLinks")}
      ${extractFn("resolveReservationBillingRecipientsList")}
      ${extractFn("resolveBoletoPayerData")}
      ${extractFn("syncBoletoWithAccountsReceivable")}
      ${extractFn("markBoletoAsPaid")}
      ${extractFn("dispatchFaturadoBillingPackage")}
      ${extractFn("emitCheckoutFaturadoPackage")}
      return {
        emitCheckoutFaturadoPackage,
        markBoletoAsPaid,
        resolveReservationBillingRecipientsList,
        dispatchFaturadoBillingPackage,
      };
      `
    )({
      db: mockDb,
      isPackageCode,
      getPackageReservations,
      isPackageItemActive,
      parseEmailList,
      formatEmailList,
      getPrimaryEmail,
      normalizeInterBoletoPayer,
      onSendEmail: (opts) => sentBoletoEmails.push(opts),
    });

    const out = await runtime.emitCheckoutFaturadoPackage(mockDb.reservations[0], {
      packageId: pkg,
      consolidatePackage: true,
      boletoConsumptionMode: "separate",
      billingRecipients: { company: true, guest: false, requester: false, financialResponsible: false, sendEmail: true, sendWhatsApp: false },
    });

    assert.equal(out.invoice.valorServico, 1500, "NFS-e consolidada mantém valor cheio da hospedagem (R$ 800 + R$ 700)");
    assert.equal(out.boletos.length, 2, "Deve emitir 2 boletos (Hospedagem líquida + Consumo do Flat 2)");
    const hospBol = out.boletos.find((b) => b.billingScope === "accommodation_only");
    const consBol = out.boletos.find((b) => b.billingScope === "consumption_only");
    assert.equal(hospBol.amount, 1200, "Boleto hospedagem abate R$ 300 de sinal (1500 - 300 = 1200)");
    assert.equal(consBol.amount, 80, "Boleto consumo inclui frigobar do Flat 2 irmão (R$ 80)");
    assert.deepEqual(consBol.minibarOrderIds, ["MB-SIB-2"]);
    assert.equal(hospBol.payer.email, "fina@construtora.com.br", "Pagador Inter isola apenas [0]");

    // dispatchFaturadoBillingPackage envia p/ ambos os e-mails usando recipient: (nunca to:)
    assert.equal(sentBoletoEmails.length, 2);
    assert.deepEqual(
      sentBoletoEmails.map((m) => m.recipient).sort(),
      ["fina@construtora.com.br", "finb@construtora.com.br"]
    );
    assert.ok(sentBoletoEmails.every((m) => typeof m.saveDatabase === "function" && m.metadata?.category === "boleto_faturado"));

    // Liquidar apenas boleto de hospedagem mantém sinal_pago porque boleto de consumo ainda está aberto
    runtime.markBoletoAsPaid(hospBol, { paidAmount: 1200 });
    assert.equal(mockDb.reservations[0].paymentStatus, "sinal_pago");
    assert.equal(mockDb.reservations[1].paymentStatus, "sinal_pago");
    const flat0PaySum = mockDb.reservations[0].payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    assert.equal(flat0PaySum, 800, "Não deve duplicar sinal prévio de R$ 150 ao liquidar boleto (150 + 650 = 800)");

    // Liquidar boleto de consumo fecha como pago_total
    runtime.markBoletoAsPaid(consBol, { paidAmount: 80 });
    assert.equal(mockDb.reservations[0].paymentStatus, "pago_total");
    assert.equal(mockDb.reservations[1].paymentStatus, "pago_total");
  });

  it("17. M1 Rotas /api/companies (; validação), GET /api/pms/guests (acompanhantes), /communications (pacote/solicitante/acompanhante) e emit-consolidated", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };

    const routesDb = createIsolatedDb();
    routesDb.companies = [];
    routesDb.agencies = [];
    routesDb.invoices = [];
    routesDb.reservationCommunications = [
      {
        id: "comm_pkg_1",
        reservation_id: "RES-101-701",
        recipient: "fin1@emp.com, fin2@emp.com",
        subject: "Pacote PKG-COMMS-1",
        metadata: { packageCode: "PKG-COMMS-1" },
        created_at: "2027-03-01T10:00:00Z",
      },
    ];
    routesDb.emailQueue = [];
    routesDb.whatsappQueue = [];
    routesDb.whatsappHistory = [
      {
        id: "wh_req_1",
        reservationCode: "PKG-COMMS-1",
        packageCode: "PKG-COMMS-1",
        guestName: "Solicitante Corp",
        guestPhone: "5522999880011",
        message: "Resumo do pacote",
        sentAt: "2027-03-01T10:01:00Z",
      },
      {
        id: "wh_comp_2",
        guestPhone: "5522999770022",
        guestName: "Maria Acompanhante",
        message: "Instrução check-in",
        sentAt: "2027-03-01T12:00:00Z",
      },
      {
        id: "wh_other_pending",
        guestName: "A Definir (Aguardando Solicitante)",
        guestPhone: "5511999999999",
        message: "Nao vazar!",
        sentAt: "2027-03-01T12:00:00Z",
      },
    ];
    routesDb.whatsappConversations = [];
    routesDb.guests = [
      { id: 101, fullName: "João Titular", name: "João Titular", phone: "22991110001", documentNumber: "11144477735", email: "joao@emp.com" },
      { id: 102, fullName: "Maria Acompanhante", name: "Maria Acompanhante", phone: "22999770022", documentNumber: "52998224725", email: "maria@emp.com" },
    ];
    routesDb.reservations = [
      {
        id: 701,
        code: "RES-101-701",
        packageId: "PKG-COMMS-1",
        packageCode: "PKG-COMMS-1",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-03-01",
        checkoutDate: "2027-03-04",
        status: "confirmada",
        totalAmount: 900,
        guestId: 101,
        guestName: "João Titular",
        guestPhone: "22991110001",
        guestDocument: "11144477735",
        requesterPhone: "22999880011",
        guests: [
          { index: 1, guestId: 101, name: "João Titular", phone: "22991110001", cpf: "11144477735" },
          { index: 2, guestId: 102, name: "Maria Acompanhante", phone: "22999770022", cpf: "52998224725" },
        ],
        createdAt: "2027-03-01T09:00:00Z",
      },
      {
        id: 702,
        code: "RES-102-702",
        packageId: "PKG-COMMS-1",
        packageCode: "PKG-COMMS-1",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-03-01",
        checkoutDate: "2027-03-04",
        status: "confirmada",
        totalAmount: 700,
        guestName: "A Definir (Aguardando Solicitante)",
        requesterPhone: "22999880011",
        guests: [{ index: 1, name: "" }, { index: 2, guestId: 102, name: "Maria Acompanhante", phone: "22999770022" }],
        createdAt: "2027-03-01T09:00:00Z",
      },
    ];

    const registered = {};
    const appMock = {
      get: (p, h) => { registered[`GET ${p}`] = h; },
      post: (p, h) => { registered[`POST ${p}`] = h; },
      patch: (p, h) => { registered[`PATCH ${p}`] = h; },
      put: (p, h) => { registered[`PUT ${p}`] = h; },
    };
    const capturedEmitPayloads = [];
    const postCompBlock = extractRouteBlock('app.post("/api/companies"');
    const getGuestsBlock = extractRouteBlock('app.get("/api/pms/guests",');
    const getCommsBlock = extractRouteBlock('app.get("/api/pms/reservations/:id/communications"');
    const emitConsBlock = extractRouteBlock('app.post("/api/nfse/emit-consolidated"');

    new Function(
      "deps",
      `
      const {
        app, db, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, onEmitNfse
      } = deps;
      let cachedEnrichedGuests = null;
      let cachedEnrichedGuestsSource = null;
      let cachedEnrichedGuestsLength = -1;
      let cachedEnrichedGuestsTimestamp = 0;
      let pgPool = null;
      let pgHydratedSuccessfully = false;
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const applyCrmBillingConfigFields = () => {};
      const inferIbgeAndValidCep = () => ({ cep: "28035000", cidade: "Campos dos Goytacazes", uf: "RJ", codigoMunicipio: "3301009" });
      const reconcileAndMergeGuests = () => {};
      const normalizeDoc = (v) => String(v || "").replace(/\\D/g, "");
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const normalizePhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const phonesMatch = (a, b) => normalizePhone(a).slice(-8) === normalizePhone(b).slice(-8);
      const normalizeName = (s) => String(s || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim().replace(/\\s+/g, " ");
      const areGuestNamesCompatible = (a, b) => Boolean(normalizeName(a) && normalizeName(b) && normalizeName(a).split(" ")[0] === normalizeName(b).split(" ")[0]);
      const isPlaceholderOrEmptyGuestName = (n) => !n || /a definir|informar depois/i.test(n);
      const isPendingGuestName = isPlaceholderOrEmptyGuestName;
      const cleanWhatsAppPhone = (v) => String(v || "").replace(/\\D/g, "");
      const addDaysToIsoDate = (d, n) => {
        const dt = new Date(d + "T12:00:00Z");
        dt.setUTCDate(dt.getUTCDate() + n);
        return dt.toISOString().slice(0, 10);
      };
      const formatTriggerTitle = (t) => String(t || "");
      const ensureReservationScheduledEmails = () => {};
      const scheduleUpcomingReservationTriggers = () => {};
      const ensurePendingB2bAgencyCredentialDispatches = async () => {};
      const getFiscalData = () => {};
      const isPreReservationBlocked = () => false;
      const isValidCnpj = () => true;
      const isValidBrazilianCpf = () => true;
      const formatCnpj = (c) => c;
      const toTitleCase = (s) => String(s || "");
      const isGenericPelincaCompanyAddress = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const executeNfseEmissionInternal = async (p) => {
        onEmitNfse(p);
        return { success: true, invoice: { id: 888, numeroNfse: "2027888", danfseUrl: "/danfse/888", tomadorEmail: p.tomadorEmail, nfDeliveryEmails: p.nfDeliveryEmails }, numeroNfse: "2027888" };
      };
      ${postCompBlock}
      ${getGuestsBlock}
      ${getCommsBlock}
      ${emitConsBlock}
      `
    )({
      app: appMock,
      db: routesDb,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      onEmitNfse: (p) => capturedEmitPayloads.push(p),
    });

    const callR = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        {
          status(s) { status = s; return this; },
          json(p) { payload = p; return this; },
        }
      );
      return { status, payload };
    };

    // 17a) POST /api/companies rejeita token inválido com 400 e normaliza lista ';' válida
    const badComp = await callR("POST /api/companies", {
      body: { corporateName: "Empresa Ruim", cnpj: "99888777000166", financialEmail: "ok@emp.com; invalido" },
    });
    assert.equal(badComp.status, 400);

    const goodComp = await callR("POST /api/companies", {
      body: { corporateName: "Empresa Boa", cnpj: "99888777000166", financialEmail: "Fin1@Boa.com; fin2@boa.com" },
    });
    assert.equal(goodComp.status, 201);
    assert.equal(goodComp.payload.financialEmail, "fin1@boa.com; fin2@boa.com");

    // 17b) GET /api/pms/guests indexa acompanhante Maria (id 102) com reservationsCount = 2
    const guestsList = await callR("GET /api/pms/guests");
    const maria = guestsList.payload.find((g) => g.id === 102);
    assert.ok(maria);
    assert.equal(maria.reservationsCount, 2, "Acompanhante deve contabilizar todas as reservas em que aparece em r.guests[]");

    // 17c) GET /api/pms/reservations/:id/communications para Flat 2 (RES-102-702) vê e-mail do pacote + WhatsApp do solicitante/acompanhante sem vazar 'A Definir'
    const commsFlat2 = await callR("GET /api/pms/reservations/:id/communications", {
      params: { id: "702" },
    });
    assert.equal(commsFlat2.payload.emails.length, 1);
    assert.equal(commsFlat2.payload.emails[0].id, "comm_pkg_1");
    const waIds = commsFlat2.payload.whatsappHistory.map((h) => h.id);
    assert.ok(waIds.includes("wh_req_1"));
    assert.ok(waIds.includes("wh_comp_2"));
    assert.ok(!waIds.includes("wh_other_pending"), "Nunca vazar histórico de outro hóspede com nome pendente");

    // 17d) POST /api/nfse/emit-consolidated isola [0] em tomadorEmail e preserva lista completa em nfDeliveryEmails
    const consResp = await callR("POST /api/nfse/emit-consolidated", {
      body: {
        packageId: "PKG-COMMS-1",
        tomadorCpfCnpj: "99888777000166",
        tomadorNome: "Empresa Boa",
        tomadorEmail: "Fin1@Boa.com; fin2@boa.com",
        nfDeliveryEmails: "Fin1@Boa.com; fin2@boa.com; fiscal@boa.com",
      },
    });
    assert.equal(consResp.status, 201);
    assert.equal(capturedEmitPayloads.length, 1);
    assert.equal(capturedEmitPayloads[0].tomadorEmail, "fin1@boa.com");
    assert.deepEqual(capturedEmitPayloads[0].nfDeliveryEmails, ["fin1@boa.com", "fin2@boa.com", "fiscal@boa.com"]);
  });

  it("18. Regressão Challenger 1 (emit-consolidated nfHideFromGuest/override, pending-reservations [0], mail-service info.rejected/';', /api/companies array) + defaultBoletoTermDays & consumption_only", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const open = demoSrc.indexOf(") {", s) + 2;
      let d = 0;
      let e = open;
      for (; e < demoSrc.length; e++) {
        if (demoSrc[e] === "{") d++;
        else if (demoSrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return demoSrc.slice(s, e + 1);
    };

    // 18a/18b/18c/18e: Rotas emit-consolidated, pending-reservations e POST /api/companies
    const db18 = createIsolatedDb();
    db18.companies = [
      { id: 10, corporateName: "Corp Teste LTDA", cnpj: "11222333000181", financialEmail: "fin1@emp.com; fin2@emp.com" },
    ];
    db18.agencies = [];
    db18.invoices = [];
    db18.boletos = [];
    db18.minibarOrders = [];
    db18.guests = [
      { id: 201, fullName: "Hóspede Oculto", name: "Hóspede Oculto", documentNumber: "12345678909", email: "hospede.pessoal@gmail.com; hospede2@gmail.com", phone: "22999001122" },
    ];
    db18.reservations = [
      {
        id: 810,
        code: "RES-101-810",
        packageId: "PKG-PRIV-1",
        packageCode: "PKG-PRIV-1",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-04-01",
        checkoutDate: "2027-04-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        guestId: 201,
        guestName: "Hóspede Oculto",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com; hospede2@gmail.com",
        guestPhone: "22999001122",
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      {
        id: 811,
        code: "RES-102-811",
        packageId: "PKG-OVR-1",
        packageCode: "PKG-OVR-1",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-04-01",
        checkoutDate: "2027-04-03",
        status: "confirmada",
        totalAmount: 600,
        dailyRate: 300,
        companyId: 10,
        companyName: "Corp Teste LTDA",
        companyCnpj: "11222333000181",
        guestName: "Maria Corporativa",
        guestEmail: "Guest1@Mail.com; guest2@mail.com",
        nfHideFromGuest: false,
        nfDeliveryEmails: ["fin1@emp.com", "fiscal@emp.com"],
      },
    ];

    const registered18 = {};
    const capturedEmit18 = [];
    const appMock18 = {
      get: (p, h) => { registered18[`GET ${p}`] = h; },
      post: (p, h) => { registered18[`POST ${p}`] = h; },
    };

    new Function(
      "deps",
      `
      const {
        app, db, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, onEmitNfse
      } = deps;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const applyCrmBillingConfigFields = () => {};
      const inferIbgeAndValidCep = () => ({ cep: "28035000", cidade: "Campos dos Goytacazes", uf: "RJ", codigoMunicipio: "3301009" });
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const cleanWhatsAppPhone = (v) => String(v || "").replace(/\\D/g, "");
      const isPreReservationBlocked = () => false;
      const isValidCnpj = () => true;
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const formatCnpj = (c) => c;
      const toTitleCase = (s) => String(s || "");
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const getFiscalData = () => {};
      const resolveGuestDigitalCheckinData = () => null;
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        consumptionItems: [],
      });
      const buildB2bNfseDescription = () => "Hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const executeNfseEmissionInternal = async (p) => {
        onEmitNfse(p);
        return { success: true, invoice: { id: 991, numeroNfse: "2027991", danfseUrl: "/danfse/991", tomadorEmail: p.tomadorEmail, nfDeliveryEmails: p.nfDeliveryEmails }, numeroNfse: "2027991" };
      };
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/companies"')}
      `
    )({
      app: appMock18,
      db: db18,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      onEmitNfse: (p) => capturedEmit18.push(p),
    });

    const callR18 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered18[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // Bug 1A: nfHideFromGuest: true sem e-mail da empresa NUNCA vaza guestEmail no tomadorEmail nem em nfDeliveryEmails
    const hideResp = await callR18("POST /api/nfse/emit-consolidated", {
      body: {
        packageId: "PKG-PRIV-1",
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Hóspede Oculto",
        nfHideFromGuest: true,
      },
    });
    assert.equal(hideResp.status, 201);
    assert.equal(capturedEmit18[0].tomadorEmail, "", "nfHideFromGuest=true não deve vazar guestEmail em tomadorEmail");
    assert.deepEqual(capturedEmit18[0].nfDeliveryEmails, []);

    // Bug 1A+1B: nfHideFromGuest=true remove TODOS os e-mails de guestEmail (inclusive o 2º separado por ';')
    const hideFilterResp = await callR18("POST /api/nfse/emit-consolidated", {
      body: {
        packageId: "PKG-PRIV-1",
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Hóspede Oculto",
        nfHideFromGuest: true,
        nfDeliveryEmails: "fin@emp.com; hospede2@gmail.com",
      },
    });
    assert.equal(hideFilterResp.status, 201);
    assert.deepEqual(capturedEmit18[1].nfDeliveryEmails, ["fin@emp.com"]);

    // Bug 1B: nfDeliveryEmails explícito substitui a lista de entrega sem misturar guestEmail ou nfDeliveryEmails anteriores
    const overrideResp = await callR18("POST /api/nfse/emit-consolidated", {
      body: {
        packageId: "PKG-OVR-1",
        tomadorCpfCnpj: "11222333000181",
        tomadorNome: "Corp Teste LTDA",
        nfDeliveryEmails: "Fin1@Emp.com; fin2@emp.com; extra@emp.com",
      },
    });
    assert.equal(overrideResp.status, 201);
    assert.deepEqual(capturedEmit18[2].nfDeliveryEmails, ["fin1@emp.com", "fin2@emp.com", "extra@emp.com"]);

    // Bug 2: GET /api/nfse/pending-reservations sanitiza tomadorOptions.guest.tomadorEmail com getPrimaryEmail
    const pendResp = await callR18("GET /api/nfse/pending-reservations");
    assert.equal(pendResp.status, 200);
    const pend811 = (pendResp.payload.pendingReservations || []).find((x) => x.id === 811);
    assert.ok(pend811);
    assert.equal(pend811.tomadorOptions.guest.tomadorEmail, "guest1@mail.com", "tomadorOptions.guest.tomadorEmail não deve vazar ';'");

    // Bug 4: POST /api/companies aceita financialEmail como array sem lançar TypeError
    const arrCompOk = await callR18("POST /api/companies", {
      body: { corporateName: "Array Email SA", cnpj: "33444555000166", financialEmail: ["Arr1@Emp.com", "arr2@emp.com"] },
    });
    assert.equal(arrCompOk.status, 201);
    assert.equal(arrCompOk.payload.financialEmail, "arr1@emp.com; arr2@emp.com");

    const arrCompBad = await callR18("POST /api/companies", {
      body: { corporateName: "Array Ruim SA", cnpj: "33444555000166", financialEmail: ["ok@emp.com", "nao_valido"] },
    });
    assert.equal(arrCompBad.status, 400);

    // Bug 3A & 3B: mail-service sendEmailAsync (err.rejected e resolved info.rejected) + notifyGuestInvalidEmailViaWhatsApp com ';'
    const waAlerts = [];
    const mailDb18 = {
      settings: { emailSettings: { enabled: true } },
      reservationCommunications: [],
      reservations: [
        {
          id: 951,
          code: "RES-101-0951",
          flatNumber: "101",
          status: "confirmada",
          guestName: "João Multi",
          guestPhone: "5522999112233",
          guestEmail: "ok@guest.com; bad@nonexistent.invalid",
        },
        {
          id: 952,
          code: "RES-102-0952",
          flatNumber: "102",
          status: "confirmada",
          guestName: "Ana Parcial",
          guestPhone: "5522999445566",
          guestEmail: "ok@guest.com; bad2@nonexistent.invalid",
        },
      ],
    };

    // 3A: err.rejected com guestEmail separado por ';'
    const prevGlobalSendZapi = globalThis.__corpflatsSendZapiMessage;
    globalThis.__corpflatsSendZapiMessage = async (phone, msg) => {
      waAlerts.push({ phone, msg });
      return { success: true };
    };
    try {
      realSendEmailAsync({
        db: mailDb18,
        saveDatabase: () => {},
        reservationId: "RES-101-0951",
        recipient: "ok@guest.com; bad@nonexistent.invalid",
        subject: "Confirmação",
        bodyHtml: "<p>Oi</p>",
        overrides: {
          transporter: {
            sendMail: async () => {
              const err = new Error("550 5.1.1 User unknown");
              err.responseCode = 550;
              err.accepted = ["ok@guest.com"];
              err.rejected = ["bad@nonexistent.invalid"];
              throw err;
            },
          },
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(mailDb18.reservations[0].guestEmailInvalid, true, "err.rejected com guestEmail ';' deve sinalizar e-mail inválido");
      assert.equal(waAlerts.length, 1);
      assert.ok(waAlerts[0].msg.includes("bad@nonexistent.invalid"));

      // 3B: resolved info.rejected (falha parcial RCPT TO) dispara alerta e grava metadata.rejected
      const partialLog = realSendEmailAsync({
        db: mailDb18,
        saveDatabase: () => {},
        reservationId: "RES-102-0952",
        recipient: "ok@guest.com; bad2@nonexistent.invalid",
        subject: "Confirmação Parcial",
        bodyHtml: "<p>Oi</p>",
        overrides: {
          transporter: {
            sendMail: async () => ({
              messageId: "smtp_partial_952",
              accepted: ["ok@guest.com"],
              rejected: ["bad2@nonexistent.invalid"],
            }),
          },
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(partialLog.status, "sent");
      assert.deepEqual(partialLog.metadata.rejected, ["bad2@nonexistent.invalid"]);
      assert.equal(mailDb18.reservations[1].guestEmailInvalid, true, "info.rejected parcial deve sinalizar guestEmailInvalid");
      assert.equal(waAlerts.length, 2);
      assert.ok(waAlerts[1].msg.includes("bad2@nonexistent.invalid"));
    } finally {
      if (prevGlobalSendZapi === undefined) delete globalThis.__corpflatsSendZapiMessage;
      else globalThis.__corpflatsSendZapiMessage = prevGlobalSendZapi;
    }

    // 3B.2: recentSuccessExists reconhece metadata.recipients quando NÃO houve rejeição
    mailDb18.reservationCommunications.push({
      id: "comm_ok_multi",
      direction: "outbound",
      status: "sent",
      recipient: "ok@guest.com, dup@guest.com",
      metadata: { recipients: ["ok@guest.com", "dup@guest.com"], sentAt: new Date().toISOString() },
    });
    const recentRes = await notifyGuestInvalidEmailViaWhatsApp({
      db: mailDb18,
      reservation: { id: 953, code: "RES-103-0953", status: "confirmada", guestEmail: "dup@guest.com", guestPhone: "5522999000111" },
      invalidEmail: "dup@guest.com",
      source: "smtp_rejection",
    });
    assert.equal(recentRes.notified, false);
    assert.equal(recentRes.reason, "email_already_delivered_recently");

    // Nota 5: createMultiFlatPackageFromPayload herda company.defaultBoletoTermDays quando boletoTermDays é omitido
    const pkgDb18 = createIsolatedDb();
    pkgDb18.companies = [];
    pkgDb18.agencies = [];
    const createPkg18 = new Function(
      "deps",
      `
      const {
        db, crypto, applyPackageRateioToDraftFlats, generatePackageCode,
        syncPackagePixAndPaymentLinks, dispatchPackagePreReservationCreated,
        computePackageSummary, findActiveOverbookingConflicts
      } = deps;
      const DEFAULT_SITE_CONFIG = db.siteConfig;
      const DEFAULT_INTER_CONFIG = { pixKey: "47964813000165" };
      const normalizePaymentMethodId = (m) => String(m || "pix").toLowerCase();
      const isFaturadoBoletoMethod = (m) => m.includes("boleto") || m.includes("faturado");
      const getCanonicalFlats = (d) => d.flats;
      const calculateCanonicalDirectStayQuote = () => ({ pixTotalAmount: 500, avgDailyRatePerFlat: 250, perNightCombinedRates: [] });
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
      const isGuestReconciliationDirty = false;
      const lastGuestReconcileTimestamp = 0;
      const GUEST_RECONCILE_COOLDOWN_MS = 60000;
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const saveDatabase = () => {};
      const emitCheckoutFaturadoPackage = async () => ({ boletos: [] });
      ${extractFn("createMultiFlatPackageFromPayload")}
      return createMultiFlatPackageFromPayload;
      `
    )({
      db: pkgDb18,
      crypto,
      applyPackageRateioToDraftFlats,
      generatePackageCode,
      syncPackagePixAndPaymentLinks,
      dispatchPackagePreReservationCreated,
      computePackageSummary,
      findActiveOverbookingConflicts: () => [],
    });

    const pkgTermRes = await createPkg18(
      {
        requesterType: "company",
        requesterName: "Financeiro Prazo",
        requesterPhone: "22999881122",
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
        status: "confirmada",
        companyCnpj: "22333444000155",
        companyName: "Empresa Prazo 28 SA",
        companyData: { corporateName: "Empresa Prazo 28 SA", cnpj: "22333444000155", defaultBoletoTermDays: 28 },
        packageFlats: [
          { flatId: 1, checkinDate: "2027-05-01", checkoutDate: "2027-05-03", dailyRate: 250, guestName: "Hosp A" },
          { flatId: 2, checkinDate: "2027-05-01", checkoutDate: "2027-05-03", dailyRate: 250, guestName: "Hosp B" },
        ],
      },
      { suppressExternalSend: true }
    );
    assert.equal(pkgTermRes.reservations[0].boletoTermDays, 28, "boletoTermDays omitido deve herdar defaultBoletoTermDays=28 da empresa");

    // Nota 6: markBoletoAsPaid consumption_only NÃO joga metade do consumo no flat com consumo 0
    const consDb = createIsolatedDb();
    consDb.minibarOrders = [
      { id: "MB-ONLY-2", reservationId: 1002, reservationCode: "RES-102-1002", totalAmount: 80, paymentStatus: "pendente" },
    ];
    consDb.reservations = [
      { id: 1001, code: "RES-101-1001", packageId: "PKG-CONS-ONLY", packageCode: "PKG-CONS-ONLY", totalAmount: 500, paidAmount: 500, payments: [{ id: "p1", amount: 500, method: "pix" }], charges: [], status: "confirmada" },
      { id: 1002, code: "RES-102-1002", packageId: "PKG-CONS-ONLY", packageCode: "PKG-CONS-ONLY", totalAmount: 500, paidAmount: 500, payments: [{ id: "p2", amount: 500, method: "pix" }], charges: [], status: "confirmada" },
    ];
    const consBoleto = {
      id: 77,
      code: "BOL-CONS-77",
      packageId: "PKG-CONS-ONLY",
      reservationIds: [1001, 1002],
      billingScope: "consumption_only",
      amount: 80,
      status: "emitido",
      minibarOrderIds: ["MB-ONLY-2"],
    };
    consDb.boletos = [consBoleto];
    consDb.accountsReceivable = [];

    const runMarkPaid = new Function(
      "deps",
      `
      const { db, isPackageCode, isPackageItemActive } = deps;
      const isPackageItemCancelled = (r) => String(r?.status || "").toLowerCase() === "cancelada";
      const syncBoletoWithAccountsReceivable = () => {};
      const ensurePaymentConfirmationDispatched = async () => {};
      const createNotification = () => {};
      const enrichBoletoDynamicStatus = (b) => b;
      const saveDatabase = () => {};
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("computeReservationAccommodationAndConsumption")}
      ${extractFn("markBoletoAsPaid")}
      return markBoletoAsPaid;
      `
    )({ db: consDb, isPackageCode, isPackageItemActive });

    runMarkPaid(consBoleto, { paidAmount: 80 });
    assert.equal(consDb.reservations[0].payments.length, 1, "Flat 1 sem consumo não deve receber lançamento de consumo");
    assert.equal(consDb.reservations[1].payments.length, 2, "Flat 2 com consumo recebe o pagamento completo de R$ 80");
    assert.equal(consDb.reservations[1].payments[1].amount, 80);
  });

  it("19. Regressão Challenger R2 (nfHideFromGuest: true): bloqueio integral de e-mails de hóspedes em executeNfseEmissionInternal, emit-consolidated multi-flat/PF e pending-reservations", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    const db19 = createIsolatedDb();
    db19.companies = [
      { id: 10, corporateName: "Acme Corp LTDA", cnpj: "11222333000181", financialEmail: "fin@acme.com" },
    ];
    db19.agencies = [];
    db19.invoices = [];
    db19.boletos = [];
    db19.minibarOrders = [];
    db19.nfseRetryQueue = [];
    db19.nfseConfig = { ambiente: "homologacao", certificadoBase64: "CERT_OK" };
    db19.guests = [
      {
        id: 301,
        fullName: "Carlos Oculto",
        name: "Carlos Oculto",
        documentNumber: "12345678909",
        email: "hospede.pessoal@gmail.com; hospede2@gmail.com",
        phone: "22999001122",
      },
      {
        id: 302,
        fullName: "Maria Flat Dois",
        name: "Maria Flat Dois",
        documentNumber: "52998224725",
        email: "maria.hospede@gmail.com; maria.sec@gmail.com",
        phone: "22999003344",
      },
      {
        id: 303,
        fullName: "Fallback Sem Email Na Reserva",
        name: "Fallback Sem Email Na Reserva",
        documentNumber: "98765432100",
        email: "Fallback1@Mail.com; fallback2@mail.com",
        phone: "22999005566",
      },
    ];
    db19.reservations = [
      // Probe 1E: single reservation consolidated with nfHideFromGuest=true and secondary guest email in primaryRes.nfDeliveryEmails
      {
        id: 101,
        code: "RES-101-101",
        packageId: "PKG-1E",
        packageCode: "PKG-1E",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-06-01",
        checkoutDate: "2027-06-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        guestId: 301,
        guestName: "Carlos Oculto",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com; hospede2@gmail.com",
        guestPhone: "22999001122",
        requesterIsGuest1: true,
        requesterEmail: "hospede.pessoal@gmail.com",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede2@gmail.com"],
      },
      // Probe 1F: multi-flat flat 2 with distinct guestEmail + guests[] email
      {
        id: 102,
        code: "RES-102-102",
        packageId: "PKG-1F",
        packageCode: "PKG-1F",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-06-01",
        checkoutDate: "2027-06-03",
        status: "confirmada",
        totalAmount: 600,
        dailyRate: 300,
        guestId: 301,
        guestName: "Carlos Oculto",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com; hospede2@gmail.com",
        companyId: 10,
        companyName: "Acme Corp LTDA",
        companyCnpj: "11222333000181",
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      {
        id: 103,
        code: "RES-103-103",
        packageId: "PKG-1F",
        packageCode: "PKG-1F",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-06-01",
        checkoutDate: "2027-06-03",
        status: "confirmada",
        totalAmount: 600,
        dailyRate: 300,
        guestId: 302,
        guestName: "Maria Flat Dois",
        guestDocument: "52998224725",
        guestEmail: "maria.hospede@gmail.com",
        guests: [{ index: 1, guestId: 302, name: "Maria Flat Dois", email: "acomp.flat2@gmail.com" }],
        companyId: 10,
        companyName: "Acme Corp LTDA",
        companyCnpj: "11222333000181",
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      // Probe 1G: single-flat direct executeNfseEmissionInternal
      {
        id: 104,
        code: "RES-104-104",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2027-06-05",
        checkoutDate: "2027-06-07",
        status: "confirmada",
        totalAmount: 550,
        dailyRate: 275,
        guestId: 301,
        guestName: "Carlos Oculto",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com; hospede2@gmail.com",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede2@gmail.com"],
      },
      // Probe 1H: 2-flat PF consolidated with digital check-in email
      {
        id: 105,
        code: "RES-105-105",
        packageId: "PKG-1H",
        packageCode: "PKG-1H",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2027-06-10",
        checkoutDate: "2027-06-12",
        status: "confirmada",
        totalAmount: 400,
        dailyRate: 200,
        guestName: "Titular PF Digital",
        guestDocument: "12345678909",
        guestEmail: "",
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      {
        id: 106,
        code: "RES-106-106",
        packageId: "PKG-1H",
        packageCode: "PKG-1H",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2027-06-10",
        checkoutDate: "2027-06-12",
        status: "confirmada",
        totalAmount: 400,
        dailyRate: 200,
        guestName: "Acompanhante PF",
        guestEmail: "",
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      // Probe 2C: pending-reservations with fallback guest.email ';' and r.nfDeliveryEmails containing secondary guest email
      {
        id: 107,
        code: "RES-107-107",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2027-06-15",
        checkoutDate: "2027-06-17",
        status: "confirmada",
        totalAmount: 700,
        dailyRate: 350,
        guestId: 303,
        guestName: "Fallback Sem Email Na Reserva",
        guestDocument: "98765432100",
        guestEmail: "",
        companyId: 10,
        companyName: "Acme Corp LTDA",
        companyCnpj: "11222333000181",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["fallback2@mail.com", "fin@acme.com"],
      },
    ];

    const registered19 = {};
    const capturedDpsArgs19 = [];
    const appMock19 = {
      get: (p, h) => { registered19[`GET ${p}`] = h; },
      post: (p, h) => { registered19[`POST ${p}`] = h; },
    };

    const execInternalFn = new Function(
      "deps",
      `
      const {
        app, db, crypto, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, buildNationalDpsPayload, onDpsBuilt
      } = deps;
      const process = { env: { NODE_ENV: "test" } };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const enqueueNfseRetry = () => ({ id: "retry_1" });
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const dispatchNfseInvoiceWhatsApp = async () => ({ sent: false });
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        consumptionItems: [],
      });
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const resolveGuestDigitalCheckinData = ({ cpfCnpj, reservationId }) => {
        if (String(cpfCnpj || "") === "12345678909" || Number(reservationId) === 105 || Number(reservationId) === 106) {
          return {
            hasRealAddress: true,
            guestId: null,
            nome: "Titular PF Digital",
            cpfCnpj: "12345678909",
            email: "checkin.guest@gmail.com",
            telefone: "22999007788",
            logradouro: "Rua Real Teste",
            numero: "100",
            complemento: "",
            bairro: "Centro",
            cep: "28035053",
            cidade: "Campos dos Goytacazes",
            uf: "RJ",
            ibge: "3301009",
          };
        }
        return null;
      };
      const wrappedBuildNationalDpsPayload = (args) => {
        onDpsBuilt(args);
        return buildNationalDpsPayload(args);
      };
      const buildWrapped = (args) => wrappedBuildNationalDpsPayload(args);
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF123",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE123",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("executeNfseEmissionInternal").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      return executeNfseEmissionInternal;
      `
    )({
      app: appMock19,
      db: db19,
      crypto,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      buildNationalDpsPayload,
      onDpsBuilt: (a) => capturedDpsArgs19.push(a),
    });

    const callR19 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered19[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // Probe 1E: emit-consolidated -> active executeNfseEmissionInternal with primaryRes.nfDeliveryEmails containing secondary ';' guest email
    const probe1E = await callR19("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [101],
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Carlos Oculto",
        nfHideFromGuest: true,
      },
    });
    assert.equal(probe1E.status, 201);
    assert.equal(probe1E.payload.invoice.simulated, undefined, "Probe 1E deve executar via motor ativo executeNfseEmissionInternal (não simInv)");
    assert.equal(probe1E.payload.invoice.tomadorEmail, "", "Probe 1E: tomadorEmail não pode vazar e-mail secundário do hóspede nem requesterEmail quando requesterIsGuest1=true");
    assert.deepEqual(probe1E.payload.invoice.nfDeliveryEmails, [], "Probe 1E: nfDeliveryEmails=[] não deve cair no fallback primaryRes.nfDeliveryEmails");
    assert.equal(capturedDpsArgs19[0].tomador.email, "", "Probe 1E: DPS XML tomador.email não pode vazar e-mail do hóspede");

    // Probe 1F: multi-flat emit-consolidated [102, 103] with flat 2 guestEmail + guests[].email in nfDeliveryEmails
    const probe1F = await callR19("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [102, 103],
        tomadorCpfCnpj: "11222333000181",
        tomadorNome: "Acme Corp LTDA",
        nfHideFromGuest: true,
        nfDeliveryEmails: "maria.hospede@gmail.com; acomp.flat2@gmail.com; maria.sec@gmail.com; fin@acme.com",
      },
    });
    assert.equal(probe1F.status, 201);
    assert.deepEqual(probe1F.payload.invoice.nfDeliveryEmails, ["fin@acme.com"], "Probe 1F: deve remover todos os e-mails de hóspedes do flat 1 e flat 2");
    assert.equal(probe1F.payload.invoice.tomadorEmail, "fin@acme.com");
    assert.equal(capturedDpsArgs19[1].tomador.email, "fin@acme.com");

    // Probe 1G: direct single-flat executeNfseEmissionInternal with ';' guest emails
    const probe1G = await execInternalFn({
      reservationId: 104,
      reservationCode: "RES-104-104",
      tomadorCpfCnpj: "11222333000181",
      tomadorNome: "Acme Corp LTDA",
      nfHideFromGuest: true,
      nfDeliveryEmails: ["hospede2@gmail.com", "fin@acme.com"],
      valorServico: 550,
    });
    assert.equal(probe1G.success, true);
    assert.deepEqual(probe1G.invoice.nfDeliveryEmails, ["fin@acme.com"], "Probe 1G: executeNfseEmissionInternal single-flat deve filtrar e-mail secundário do hóspede");
    assert.equal(probe1G.invoice.tomadorEmail, "fin@acme.com");
    assert.equal(capturedDpsArgs19[2].tomador.email, "fin@acme.com");

    // Probe 1H: 2-flat PF emit-consolidated via active executeNfseEmissionInternal with digital check-in email
    const probe1H = await callR19("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [105, 106],
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Titular PF Digital",
        nfHideFromGuest: true,
      },
    });
    assert.equal(probe1H.status, 201);
    assert.equal(probe1H.payload.invoice.tomadorEmail, "", "Probe 1H: e-mail de check-in digital não deve vazar para tomadorEmail quando nfHideFromGuest=true");
    assert.deepEqual(probe1H.payload.invoice.nfDeliveryEmails, [], "Probe 1H: e-mail de check-in digital não deve vazar para nfDeliveryEmails");
    assert.equal(capturedDpsArgs19[3].tomador.email, "", "Probe 1H: DPS XML tomador.email não deve receber e-mail de check-in digital");

    // Probe 2C: GET /api/nfse/pending-reservations with r.nfHideFromGuest=true and ';' guest.email
    const probe2C = await callR19("GET /api/nfse/pending-reservations");
    assert.equal(probe2C.status, 200);
    const pend107 = (probe2C.payload.pendingReservations || []).find((x) => x.id === 107);
    assert.ok(pend107, "Reserva 107 deve aparecer em pending-reservations");
    assert.deepEqual(pend107.nfDeliveryEmails, ["fin@acme.com"], "Probe 2C: pending-reservations deve remover e-mail secundário de guest.email quando nfHideFromGuest=true");
  });

  it("20. Regressão Iteration 4b (Probe 2C guestAccounts, Checks 6D–6G, compCrmEmailList nfHideFromGuest=false, isExplicitConsolidatedDelivery, emit-batch/retry, billing recipients & skipAutoWhatsapp)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    // 20a) Probe 2C (multi-record db.guestAccounts), Checks 6D/6E/6F/6G, compCrmEmailList (nfHideFromGuest=false),
    //      isExplicitConsolidatedDelivery (nfHideFromGuest=false + []), emit-batch -> enqueueNfseRetry -> processSingleNfseRetryItem
    const db20 = createIsolatedDb();
    db20.companies = [
      { id: 10, corporateName: "Acme Corp LTDA", cnpj: "11222333000181", financialEmail: "fin@acme.com" },
    ];
    db20.agencies = [
      { id: 20, corporateName: "Agência Sem Email LTDA", cnpj: "77888999000144", financialEmail: "" },
    ];
    db20.invoices = [];
    db20.boletos = [];
    db20.minibarOrders = [];
    db20.nfseRetryQueue = [];
    db20.nfseConfig = { ambiente: "homologacao", certificadoBase64: "CERT_OK" };
    db20.guests = [
      { id: 303, fullName: "Hóspede Probe 2C", name: "Hóspede Probe 2C", documentNumber: "98765432100", email: "Fallback1@Mail.com; fallback2@mail.com", phone: "22999005566" },
      { id: 304, fullName: "Titular PJ Digital", name: "Titular PJ Digital", documentNumber: "44455566677", email: "", phone: "22999008899" },
      { id: 310, fullName: "Acompanhante DB", name: "Acompanhante DB", documentNumber: "52998224725", email: "acomp.db@gmail.com", phone: "22999007711" },
      { id: 311, fullName: "Hóspede Retry Oculto", name: "Hóspede Retry Oculto", documentNumber: "12345678909", email: "joao1@gmail.com; joao2@gmail.com", phone: "22999110001" },
    ];
    db20.guestAccounts = [
      { id: 1, guestId: 303, document: "98765432100", phone: "22999005566", email: "digital.extra@mail.com" },
      { id: 2, guestId: null, document: "", phone: "22999005566", email: "digital.phone@mail.com" },
      { id: 3, guestId: 304, document: "44455566677", phone: "22999008899", email: "digital.single.pj@gmail.com" },
      { id: 4, guestId: 311, document: "12345678909", phone: "22999110001", email: "joao.checkin@gmail.com" },
    ];
    db20.reservations = [
      // Probe 2C: r.guests[] + db.guests + 2 db.guestAccounts records
      {
        id: 201,
        code: "RES-201",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-07-01",
        checkoutDate: "2027-07-03",
        status: "confirmada",
        totalAmount: 700,
        dailyRate: 350,
        guestId: 303,
        guestName: "Hóspede Probe 2C",
        guestDocument: "98765432100",
        guestEmail: "",
        guestPhone: "22999005566",
        guests: [{ index: 1, name: "Acomp", email: "acomp.res@mail.com" }],
        companyId: 10,
        companyName: "Acme Corp LTDA",
        companyCnpj: "11222333000181",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["fallback2@mail.com", "acomp.res@mail.com", "digital.extra@mail.com", "digital.phone@mail.com", "fin@acme.com"],
      },
      // Check 6F p207: invoiceRecipientType='guest' + nfHideFromGuest=true
      {
        id: 207,
        code: "RES-207",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-07-01",
        checkoutDate: "2027-07-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        invoiceRecipientType: "guest",
        guestName: "Hóspede P207",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com"],
      },
      // Check 6F p208: invoiceRecipientType='agency' with agency.financialEmail='' and r.nfDeliveryEmails containing guest email
      {
        id: 208,
        code: "RES-208",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-07-01",
        checkoutDate: "2027-07-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        invoiceRecipientType: "agency",
        agencyId: 20,
        agencyCnpj: "77888999000144",
        guestName: "Hóspede P208",
        guestDocument: "12345678909",
        guestEmail: "hospede.ag@gmail.com",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.ag@gmail.com"],
      },
      // Check 6F p209: invoiceRecipientType='requester' with requesterIsGuest1=true
      {
        id: 209,
        code: "RES-209",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2027-07-01",
        checkoutDate: "2027-07-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        invoiceRecipientType: "requester",
        requesterIsGuest1: true,
        guestName: "Hóspede P209",
        guestDocument: "12345678909",
        guestEmail: "hospede.p209@gmail.com",
        requesterInfo: { name: "Hóspede P209", cpf: "12345678909", email: "hospede.req@gmail.com", phone: "22999001122" },
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      // Checks 6D & 6E: Single-flat PJ with digital check-in account email & companion guestId in db.guests
      {
        id: 210,
        code: "RES-210",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2027-07-05",
        checkoutDate: "2027-07-07",
        status: "confirmada",
        totalAmount: 800,
        dailyRate: 400,
        guestId: 304,
        guestName: "Titular PJ Digital",
        guestDocument: "44455566677",
        guestEmail: "",
        guestPhone: "22999008899",
        guests: [{ index: 2, guestId: 310, name: "Acompanhante DB" }],
        companyId: 10,
        companyCnpj: "11222333000181",
        nfHideFromGuest: true,
        nfDeliveryEmails: [],
      },
      // Direct isConsolidated + nfHideFromGuest=false + []
      {
        id: 501,
        code: "RES-501",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2027-07-10",
        checkoutDate: "2027-07-12",
        status: "confirmada",
        totalAmount: 450,
        companyId: 10,
        nfHideFromGuest: false,
      },
      {
        id: 502,
        code: "RES-502",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2027-07-10",
        checkoutDate: "2027-07-12",
        status: "confirmada",
        totalAmount: 450,
        companyId: 10,
        nfHideFromGuest: false,
      },
      // emit-batch -> retry -> processSingleNfseRetryItem
      {
        id: 601,
        code: "RES-601",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2027-07-15",
        checkoutDate: "2027-07-17",
        status: "confirmada",
        totalAmount: 600,
        dailyRate: 300,
        guestId: 311,
        guestName: "Hóspede Retry Oculto",
        guestDocument: "12345678909",
        guestEmail: "joao1@gmail.com; joao2@gmail.com",
        guestPhone: "22999110001",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao2@gmail.com"],
      },
    ];

    const registered20 = {};
    const capturedDpsArgs20 = [];
    const retryWaCalls = [];
    let sefinShouldFail = false;
    const appMock20 = {
      get: (p, h) => { registered20[`GET ${p}`] = h; },
      post: (p, h) => { registered20[`POST ${p}`] = h; },
    };

    const rt20 = new Function(
      "deps",
      `
      const {
        app, db, crypto, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, buildNationalDpsPayload, onDpsBuilt,
        onWaDispatch, shouldSefinFail
      } = deps;
      const process = { env: { NODE_ENV: "production" } };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const dispatchNfseInvoiceWhatsApp = async (inv, opts) => {
        onWaDispatch(inv, opts);
        return { sent: true };
      };
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        consumptionItems: [],
      });
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const wrappedBuildNationalDpsPayload = (args) => {
        onDpsBuilt(args);
        return buildNationalDpsPayload(args);
      };
      const buildWrapped = (args) => wrappedBuildNationalDpsPayload(args);
      const processNationalInvoiceEmission = async ({ invoiceData }) => {
        if (shouldSefinFail()) {
          return { success: false, error: "SEFIN indisponível" };
        }
        return {
          success: true,
          status: "autorizada",
          numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
          codigoVerificacao: "VERIF456",
          chaveAcesso: invoiceData?.chaveAcesso || "CHAVE456",
          protocoloAutorizacao: "SEFIN_OK",
        };
      };
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("enqueueNfseRetry")}
      ${extractFn("processSingleNfseRetryItem").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("executeNfseEmissionInternal").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-batch"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      return {
        executeNfseEmissionInternal,
        enqueueNfseRetry,
        processSingleNfseRetryItem,
      };
      `
    )({
      app: appMock20,
      db: db20,
      crypto,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      buildNationalDpsPayload,
      onDpsBuilt: (a) => capturedDpsArgs20.push(a),
      onWaDispatch: (inv, opts) => retryWaCalls.push({ inv, opts }),
      shouldSefinFail: () => sefinShouldFail,
    });

    const callR20 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered20[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // Probe 2C & Check 6F via GET /api/nfse/pending-reservations
    const pendResp20 = await callR20("GET /api/nfse/pending-reservations");
    assert.equal(pendResp20.status, 200);
    const p201 = pendResp20.payload.pendingReservations.find((x) => x.id === 201);
    assert.deepEqual(p201.nfDeliveryEmails, ["fin@acme.com"], "Probe 2C: deve filtrar todas as contas em db.guestAccounts + db.guests + r.guests[]");

    const p207 = pendResp20.payload.pendingReservations.find((x) => x.id === 207);
    assert.deepEqual(p207.nfDeliveryEmails, []);
    assert.equal(p207.tomadorEmail, "", "Check 6F (p207): tomadorEmail deve ser mascarado quando nfHideFromGuest=true");
    assert.equal(p207.tomadorOptions.guest.tomadorEmail, "");

    const p208 = pendResp20.payload.pendingReservations.find((x) => x.id === 208);
    assert.deepEqual(p208.nfDeliveryEmails, []);
    assert.equal(p208.tomadorEmail, "", "Check 6F (p208): agencyOption.tomadorEmail não deve vazar r.nfDeliveryEmails[0] de hóspede");
    assert.equal(p208.tomadorOptions.agency.tomadorEmail, "");

    const p209 = pendResp20.payload.pendingReservations.find((x) => x.id === 209);
    assert.equal(p209.tomadorEmail, "", "Check 6F (p209): requesterOption.tomadorEmail deve ser mascarado quando requesterIsGuest1=true");

    // Checks 6D & 6E: Single-flat PJ executeNfseEmissionInternal com db.guestAccounts e guests[].guestId
    const res6DE = await rt20.executeNfseEmissionInternal({
      reservationId: 210,
      reservationCode: "RES-210",
      tomadorCpfCnpj: "11222333000181",
      tomadorNome: "Acme Corp LTDA",
      nfHideFromGuest: true,
      nfDeliveryEmails: ["digital.single.pj@gmail.com", "acomp.db@gmail.com", "fin@acme.com"],
      valorServico: 800,
    });
    assert.equal(res6DE.success, true);
    assert.deepEqual(res6DE.invoice.nfDeliveryEmails, ["fin@acme.com"], "Checks 6D/6E: single-flat PJ deve filtrar guestAccounts + guests[].guestId");
    assert.equal(res6DE.invoice.tomadorEmail, "fin@acme.com");
    assert.equal(capturedDpsArgs20[0].tomador.email, "fin@acme.com");

    // Check 6G: auto-criação de agência no CRM filtra guestPersonalEmailSet quando nfHideFromGuest=true
    const res6G = await rt20.executeNfseEmissionInternal({
      reservationId: 210,
      invoiceRecipientType: "agency",
      tomadorCpfCnpj: "55666777000188",
      tomadorNome: "Nova Agência Auto LTDA",
      tomadorEmail: "digital.single.pj@gmail.com",
      nfDeliveryEmails: ["digital.single.pj@gmail.com", "contabil@agencia.com"],
      nfHideFromGuest: true,
      valorServico: 800,
    });
    assert.equal(res6G.success, true);
    const createdAg = db20.agencies.find((a) => a.cnpj === "55666777000188");
    assert.ok(createdAg);
    assert.equal(createdAg.financialEmail, "contabil@agencia.com", "Check 6G: agência auto-criada não pode persistir e-mail do hóspede");

    // compCrmEmailList com nfHideFromGuest=false preserva e-mail compartilhado com hóspede
    const resCompShared = await rt20.executeNfseEmissionInternal({
      tomadorCpfCnpj: "66777888000199",
      tomadorNome: "Empresa Email Compartilhado LTDA",
      tomadorEmail: "compartilhado@empresa.com",
      guestId: 399,
      nfHideFromGuest: false,
      valorServico: 400,
    });
    assert.equal(resCompShared.success, true);
    const createdCompShared = db20.companies.find((c) => c.cnpj === "66777888000199");
    assert.ok(createdCompShared);
    assert.equal(createdCompShared.financialEmail, "compartilhado@empresa.com", "nfHideFromGuest=false deve preservar financialEmail quando compartilhado");

    // isExplicitConsolidatedDelivery com isConsolidated=true, nfDeliveryEmails=[], nfHideFromGuest=false retém company.financialEmail
    const resDirectFalse = await rt20.executeNfseEmissionInternal({
      isConsolidated: true,
      reservationIds: [501, 502],
      companyId: 10,
      tomadorCpfCnpj: "11222333000181",
      tomadorNome: "Acme Corp LTDA",
      nfHideFromGuest: false,
      nfDeliveryEmails: [],
      valorServico: 900,
    });
    assert.equal(resDirectFalse.success, true);
    assert.equal(resDirectFalse.invoice.tomadorEmail, "fin@acme.com", "isConsolidated=true + nfDeliveryEmails=[] + nfHideFromGuest=false deve manter company.financialEmail");
    assert.deepEqual(resDirectFalse.invoice.nfDeliveryEmails, ["fin@acme.com"]);

    // emit-batch (SEFIN failure) -> enqueueNfseRetry -> processSingleNfseRetryItem com nfHideFromGuest=true
    sefinShouldFail = true;
    const batchFail = await callR20("POST /api/nfse/emit-batch", {
      body: { items: [601] },
    });
    assert.equal(batchFail.status, 200);
    assert.equal(batchFail.payload.failedCount, 1);
    assert.equal(db20.nfseRetryQueue.length, 1);
    const queuedItem = db20.nfseRetryQueue[0];
    assert.equal(queuedItem.payload.nfHideFromGuest, true);
    assert.equal(queuedItem.payload.tomadorEmail, "", "enqueueNfseRetry não deve armazenar e-mail pessoal do hóspede");
    assert.deepEqual(queuedItem.payload.nfDeliveryEmails, []);

    // Object-item branch de emit-batch também bloqueia e-mail de hóspede quando nfHideFromGuest=true
    db20.nfseRetryQueue.length = 0;
    const batchObjFail = await callR20("POST /api/nfse/emit-batch", {
      body: { items: [{ reservationId: 601, tomadorEmail: "joao1@gmail.com; joao2@gmail.com", nfDeliveryEmails: ["joao2@gmail.com"] }] },
    });
    assert.equal(batchObjFail.status, 200);
    assert.equal(batchObjFail.payload.failedCount, 1);
    assert.equal(db20.nfseRetryQueue.length, 1);
    const queuedObjItem = db20.nfseRetryQueue[0];
    assert.equal(queuedObjItem.payload.nfHideFromGuest, true);
    assert.equal(queuedObjItem.payload.tomadorEmail, "");
    assert.deepEqual(queuedObjItem.payload.nfDeliveryEmails, []);

    // Mesmo se um item legado na fila tivesse e-mail de hóspede, processSingleNfseRetryItem bloqueia DPS, fatura e WhatsApp
    retryWaCalls.length = 0;
    queuedObjItem.payload.tomadorEmail = "joao1@gmail.com; joao2@gmail.com";
    sefinShouldFail = false;
    const retryRes = await rt20.processSingleNfseRetryItem(queuedObjItem);
    assert.equal(retryRes.ok, true);
    assert.equal(retryRes.invoice.nfHideFromGuest, true);
    assert.equal(retryRes.invoice.tomadorEmail, "", "processSingleNfseRetryItem deve mascarar e-mail de hóspede e check-in digital");
    assert.equal(capturedDpsArgs20[capturedDpsArgs20.length - 1].tomador.email, "");
    assert.equal(retryWaCalls.length, 0, "processSingleNfseRetryItem NÃO pode disparar WhatsApp quando nfHideFromGuest=true");

    // 20b) resolveReservationBillingRecipientsList + dispatchFaturadoBillingPackage (nfHideFromGuest=true) + emitCheckoutFaturadoPackage skipAutoWhatsapp
    const dbBol20 = createIsolatedDb();
    dbBol20.companies = [
      { id: 10, corporateName: "Acme Corp LTDA", cnpj: "11222333000181", financialEmail: "fin1@acme.com; fin2@acme.com", phone: "2227000000" },
    ];
    dbBol20.agencies = [];
    dbBol20.guests = [
      { id: 311, fullName: "João Oculto", email: "joao1@gmail.com; joao2@gmail.com", phone: "22999110001" },
    ];
    dbBol20.guestAccounts = [
      { id: 4, guestId: 311, phone: "22999110001", email: "joao.account@gmail.com" },
    ];
    dbBol20.invoices = [
      { id: 901, numeroNfse: "2027901", valorServico: 600, reservationId: 701, reservationCode: "RES-701", nfHideFromGuest: true },
    ];
    dbBol20.boletos = [
      {
        id: 801,
        code: "BOL-801",
        reservationId: 701,
        reservationCode: "RES-701",
        invoiceId: 901,
        companyId: 10,
        amount: 600,
        dueDate: "2027-07-20",
        status: "emitido",
        billingScope: "accommodation_only",
        payer: { nome: "Acme Corp LTDA", cpfCnpj: "11222333000181", email: "fin1@acme.com" },
      },
    ];
    dbBol20.reservations = [
      {
        id: 701,
        code: "RES-701",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-07-15",
        checkoutDate: "2027-07-17",
        status: "confirmada",
        totalAmount: 600,
        guestId: 311,
        guestName: "João Oculto",
        guestEmail: "joao1@gmail.com; joao2@gmail.com",
        guestPhone: "22999110001",
        requesterIsGuest1: true,
        requesterInfo: { name: "João Oculto", email: "joao.req@gmail.com", phone: "22999110001" },
        companyId: 10,
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao2@gmail.com", "joao.account@gmail.com", "fin1@acme.com"],
        billingRecipients: { guest: true, requester: true, company: true, sendEmail: true, sendWhatsapp: true },
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
      },
    ];

    const disEmails = [];
    const disWaMsgs = [];
    const disWaDocs = [];
    const capturedEmitFatNfse = [];
    const rtBol20 = new Function(
      "deps",
      `
      const {
        db, isPackageCode, getPackageReservations, isPackageItemActive,
        parseEmailList, formatEmailList, getPrimaryEmail, normalizeInterBoletoPayer,
        onEmail, onWaMsg, onWaDoc, onNfsePayload
      } = deps;
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isPackageItemCancelled = () => false;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const onlyDigits = (s) => String(s || "").replace(/\\D/g, "");
      const cleanPhone = (s) => String(s || "").replace(/\\D/g, "");
      const isGenericFallbackAddress = () => false;
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const getBrasiliaDateStr = () => "2027-07-17";
      const addDaysToIsoDate = (_d, n) => "2027-07-" + String(17 + n).padStart(2, "0");
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const applyCrmBillingConfigFields = () => {};
      const findExistingInvoiceForReservation = () => null;
      const enrichBoletoDynamicStatus = (b) => b;
      const generateBoletoPdfBuffer = async () => Buffer.from("BOLPDF");
      const generateNfsePdfBuffer = async () => Buffer.from("NFSEPDF");
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const sendEmailAsync = (opts) => { onEmail(opts); return { id: "em", status: "sent" }; };
      const sendZapiMessage = async (_cfg, opts) => { onWaMsg(opts); return { success: true }; };
      const sendZapiDocument = async (_cfg, opts) => { onWaDoc(opts); return { success: true }; };
      const createNotification = () => {};
      const saveDatabase = () => {};
      const executeNfseEmissionInternal = async (p) => {
        onNfsePayload(p);
        const inv = { id: 902, numeroNfse: "2027902", valorServico: p.valorServico, nfHideFromGuest: Boolean(p.nfHideFromGuest) };
        db.invoices.push(inv);
        return { success: true, invoice: inv };
      };
      const issueInterBoleto = async (opts) => ({
        seuNumero: opts.seuNumero,
        nossoNumero: "0002",
        codigoSolicitacao: "SOL-2",
        codigoBarras: "077",
        linhaDigitavel: "07790",
        pixCopiaECola: "PIX",
        txId: "TX2",
        provider: "inter_simulated",
        simulated: true,
        pagador: opts.payer,
      });
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("computeReservationAccommodationAndConsumption")}
      ${extractFn("resolveReservationCrmLinks")}
      ${extractFn("resolveReservationBillingRecipientsList")}
      ${extractFn("resolveBoletoPayerData")}
      ${extractFn("syncBoletoWithAccountsReceivable")}
      ${extractFn("dispatchFaturadoBillingPackage")}
      ${extractFn("emitCheckoutFaturadoPackage")}
      return {
        resolveReservationBillingRecipientsList,
        dispatchFaturadoBillingPackage,
        emitCheckoutFaturadoPackage,
      };
      `
    )({
      db: dbBol20,
      isPackageCode,
      getPackageReservations,
      isPackageItemActive,
      parseEmailList,
      formatEmailList,
      getPrimaryEmail,
      normalizeInterBoletoPayer,
      onEmail: (o) => disEmails.push(o),
      onWaMsg: (o) => disWaMsgs.push(o),
      onWaDoc: (o) => disWaDocs.push(o),
      onNfsePayload: (p) => capturedEmitFatNfse.push(p),
    });

    const recList = rtBol20.resolveReservationBillingRecipientsList(dbBol20.reservations[0]);
    assert.ok(!recList.recipients.some((x) => x.role === "guest"), "guest deve ser excluído quando nfHideFromGuest=true");
    assert.ok(!recList.recipients.some((x) => x.role === "requester"), "requester deve ser excluído quando requesterIsGuest1=true e nfHideFromGuest=true");
    assert.deepEqual(
      recList.recipients.map((x) => x.email).sort(),
      ["fin1@acme.com", "fin2@acme.com"],
      "orgEmailList não pode incluir e-mails de hóspedes nem de guestAccounts"
    );

    await rtBol20.dispatchFaturadoBillingPackage({
      reservation: dbBol20.reservations[0],
      boletos: [dbBol20.boletos[0]],
      invoice: dbBol20.invoices[0],
    });
    assert.deepEqual(disEmails.map((m) => m.recipient).sort(), ["fin1@acme.com", "fin2@acme.com"]);
    assert.ok(!disWaMsgs.some((m) => String(m.phone).includes("999110001")), "WhatsApp do hóspede não deve receber NFS-e/faturamento quando nfHideFromGuest=true");
    assert.ok(!disWaDocs.some((d) => String(d.phone).includes("999110001")), "PDFs não devem ser enviados ao WhatsApp do hóspede");

    // Defense-in-depth 1: se linkedRes=null e linkedInvoice.nfHideFromGuest=true para boleto de hóspede, guest é excluído (0 e-mails / 0 docs)
    disEmails.length = 0;
    disWaDocs.length = 0;
    await rtBol20.dispatchFaturadoBillingPackage({
      reservation: null,
      boletos: [{
        id: 802,
        code: "BOL-802",
        amount: 300,
        dueDate: "2027-07-20",
        status: "emitido",
        guestName: "Hóspede Direto",
        billingRecipients: { guest: true, sendEmail: true, sendWhatsapp: true },
        payer: { nome: "Hóspede Direto", cpfCnpj: "12345678909", email: "direto@guest.com", ddd: "22", telefone: "998887766" },
      }],
      invoice: { id: 909, numeroNfse: "2027909", valorServico: 300, nfHideFromGuest: true },
    });
    assert.equal(disEmails.length, 0);
    assert.equal(disWaDocs.length, 0);

    // Defense-in-depth 2: se linkedRes.nfHideFromGuest=false mas linkedInvoice.nfHideFromGuest=true, hóspede recebe apenas o Boleto sem anexar/mencionar NFSe-*.pdf
    disEmails.length = 0;
    disWaDocs.length = 0;
    await rtBol20.dispatchFaturadoBillingPackage({
      reservation: {
        id: 799,
        code: "RES-799",
        guestName: "Hóspede Direto",
        guestEmail: "direto@guest.com",
        guestPhone: "22998887766",
        nfHideFromGuest: false,
        billingRecipients: { guest: true, sendEmail: true, sendWhatsapp: true },
      },
      boletos: [{
        id: 803,
        code: "BOL-803",
        reservationId: 799,
        reservationCode: "RES-799",
        amount: 300,
        dueDate: "2027-07-20",
        status: "emitido",
        guestName: "Hóspede Direto",
        billingRecipients: { guest: true, sendEmail: true, sendWhatsapp: true },
        payer: { nome: "Hóspede Direto", cpfCnpj: "12345678909", email: "direto@guest.com", ddd: "22", telefone: "998887766" },
      }],
      invoice: { id: 909, numeroNfse: "2027909", valorServico: 300, nfHideFromGuest: true },
    });
    assert.equal(disEmails.length, 1);
    assert.ok(!disEmails[0].attachments.some((a) => String(a.filename).startsWith("NFSe-")), "Anexo NFSe-*.pdf não pode ser enviado a hóspede quando linkedInvoice.nfHideFromGuest=true");
    assert.ok(!disWaDocs.some((d) => String(d.fileName).startsWith("NFSe-")), "Z-API document NFSe-*.pdf não pode ser enviado a hóspede");

    // emitCheckoutFaturadoPackage passa skipAutoWhatsapp: true (minúsculo)
    await rtBol20.emitCheckoutFaturadoPackage(
      {
        id: 702,
        code: "RES-702",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-07-15",
        checkoutDate: "2027-07-17",
        totalAmount: 500,
        companyId: 10,
        nfHideFromGuest: true,
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
      },
      { emitNfse: true, billingRecipients: { company: true, sendEmail: false, sendWhatsapp: false } }
    );
    assert.equal(capturedEmitFatNfse.length, 1);
    assert.equal(capturedEmitFatNfse[0].skipAutoWhatsapp, true, "emitCheckoutFaturadoPackage deve passar skipAutoWhatsapp: true (lowercase 'a')");
    assert.equal(capturedEmitFatNfse[0].skipAutoWhatsApp, undefined);
  });

  it("21. Regressão Iteration 5b (Challenges 1-3: mascaramento de telefone/WhatsApp e chat-service draft sob nfHideFromGuest=true, fallbackInvoice e vínculo consolidado no retry)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    // 21a) Challenge 1 + Low cleanups (pending-reservations, executeNfseEmissionInternal, emit-batch, dispatchNfseInvoiceWhatsApp, processSingleNfseRetryItem)
    const db21 = createIsolatedDb();
    db21.companies = [
      { id: 12, corporateName: "Corp Sem Telefone LTDA", cnpj: "11222333000181", financialEmail: "fin@corpsemtel.com", phone: "" },
      { id: 13, corporateName: "Corp Com Telefone LTDA", cnpj: "99888777000166", financialEmail: "fin@corpcomtel.com", phone: "2227000000" },
    ];
    db21.agencies = [
      { id: 22, corporateName: "Agência Sem Email LTDA", cnpj: "77888999000144", financialEmail: "", phone: "" },
    ];
    db21.guests = [
      { id: 401, fullName: "Hóspede Oculto Tel", name: "Hóspede Oculto Tel", documentNumber: "12345678909", email: "joao.leak@gmail.com", phone: "22999002222" },
      { id: 402, fullName: "Acompanhante Tel", name: "Acompanhante Tel", documentNumber: "98765432100", email: "acomp@gmail.com", phone: "22988887777" },
      { id: 403, fullName: "Solicitante Igual Hóspede", name: "Solicitante Igual Hóspede", documentNumber: "52998224725", email: "req.crm.guest@gmail.com", phone: "22999003333" },
    ];
    db21.guestAccounts = [
      { id: 10, guestId: 401, document: "12345678909", phone: "+55 22 99900-2222", email: "joao.account@gmail.com" },
      { id: 11, guestId: 403, document: "52998224725", phone: "22999003333", email: "req.digital@gmail.com" },
    ];
    db21.invoices = [];
    db21.boletos = [];
    db21.minibarOrders = [];
    db21.nfseRetryQueue = [];
    db21.nfseConfig = { ambiente: "homologacao", certificadoBase64: "CERT_OK" };
    db21.reservations = [
      {
        id: 213,
        code: "RES-213",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        status: "confirmada",
        totalAmount: 600,
        dailyRate: 300,
        guestId: 401,
        guestName: "Hóspede Oculto Tel",
        guestDocument: "12345678909",
        guestEmail: "joao.leak@gmail.com",
        guestPhone: "22999002222",
        guests: [{ index: 2, guestId: 402, name: "Acompanhante Tel", phone: "22988887777" }],
        companyId: 12,
        companyName: "Corp Sem Telefone LTDA",
        companyCnpj: "11222333000181",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao.leak@gmail.com", "fin@corpsemtel.com"],
      },
      {
        id: 214,
        code: "RES-214",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        invoiceRecipientType: "requester",
        requesterIsGuest1: true,
        guestName: "Solicitante Igual Hóspede",
        guestEmail: "",
        guestPhone: "",
        requesterInfo: { guestId: 403, name: "Solicitante Igual Hóspede", cpf: "52998224725", email: "", phone: "22999003333" },
        nfHideFromGuest: true,
      },
      {
        id: 215,
        code: "RES-215",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        status: "confirmada",
        totalAmount: 500,
        dailyRate: 250,
        invoiceRecipientType: "requester",
        requesterIsGuest1: false,
        guestId: 401,
        guestName: "Hóspede Oculto Tel",
        guestDocument: "12345678909",
        guestPhone: "22999002222",
        requesterInfo: { name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "22977776666" },
        nfHideFromGuest: true,
      },
      {
        id: 216,
        code: "RES-216",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        status: "confirmada",
        totalAmount: 700,
        dailyRate: 350,
        guestId: 401,
        guestName: "Hóspede Oculto Tel",
        guestDocument: "12345678909",
        guestPhone: "22999002222",
        companyId: 13,
        companyCnpj: "99888777000166",
        nfHideFromGuest: true,
      },
      {
        id: 217,
        code: "RES-217",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2027-08-05",
        checkoutDate: "2027-08-07",
        status: "confirmada",
        totalAmount: 400,
        dailyRate: 200,
        invoiceRecipientType: "guest",
        guestId: 401,
        guestName: "Hóspede Oculto Tel",
        guestDocument: "12345678909",
        guestEmail: "joao.leak@gmail.com",
        guestPhone: "22999002222",
        nfHideFromGuest: true,
      },
      {
        id: 603,
        code: "RES-603",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2027-08-10",
        checkoutDate: "2027-08-12",
        status: "confirmada",
        totalAmount: 450,
        companyId: 13,
        nfHideFromGuest: true,
      },
      {
        id: 604,
        code: "RES-604",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2027-08-10",
        checkoutDate: "2027-08-12",
        status: "confirmada",
        totalAmount: 450,
        companyId: 13,
        nfHideFromGuest: true,
      },
    ];

    const registered21 = {};
    const capturedDps21 = [];
    const waDocCalls21 = [];
    const waMsgCalls21 = [];
    const appMock21 = {
      get: (p, h) => { registered21[`GET ${p}`] = h; },
      post: (p, h) => { registered21[`POST ${p}`] = h; },
    };

    const rt21 = new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, buildNationalDpsPayload, onDpsBuilt,
        onWaDoc, onWaMsg
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        consumptionItems: [],
      });
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const generateNfsePdfBuffer = async () => Buffer.from("NFSE_PDF");
      const sendZapiDocument = async (_cfg, opts) => { onWaDoc(opts); return { success: true }; };
      const sendZapiMessage = async (_cfg, opts) => { onWaMsg(opts); return { success: true }; };
      const appendMessageToConversation = () => {};
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const wrappedBuildNationalDpsPayload = (args) => {
        onDpsBuilt(args);
        return buildNationalDpsPayload(args);
      };
      const buildWrapped = (args) => wrappedBuildNationalDpsPayload(args);
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF789",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE789",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("dispatchNfseInvoiceWhatsApp")}
      ${extractFn("enqueueNfseRetry")}
      ${extractFn("processSingleNfseRetryItem").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("executeNfseEmissionInternal").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      ${extractRouteBlock('app.post("/api/nfse/emit"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-batch"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/whatsapp/:id"')}
      return {
        collectReservationGuestPersonalEmails,
        collectReservationGuestPersonalPhones,
        dispatchNfseInvoiceWhatsApp,
        executeNfseEmissionInternal,
        enqueueNfseRetry,
        processSingleNfseRetryItem,
      };
      `
    )({
      app: appMock21,
      db: db21,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      buildNationalDpsPayload,
      onDpsBuilt: (a) => capturedDps21.push(a),
      onWaDoc: (o) => waDocCalls21.push(o),
      onWaMsg: (o) => waMsgCalls21.push(o),
    });

    const callR21 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered21[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // Low cleanup check: requesterIsGuest1 indexes requesterInfo.guestId/cpf/phone in collectReservationGuestPersonalEmails
    const reqSet214 = rt21.collectReservationGuestPersonalEmails(db21.reservations[1], db21);
    assert.ok(reqSet214.has("req.crm.guest@gmail.com"), "requesterIsGuest1 deve indexar requesterInfo.guestId/cpf/phone em db.guests");
    assert.ok(reqSet214.has("req.digital@gmail.com"), "requesterIsGuest1 deve indexar requesterInfo em db.guestAccounts");

    // GET /api/nfse/pending-reservations: Challenge 1 phone masking & requesterOption exposure
    const pend21 = await callR21("GET /api/nfse/pending-reservations");
    assert.equal(pend21.status, 200);
    const p213 = pend21.payload.pendingReservations.find((x) => x.id === 213);
    assert.equal(p213.tomadorTelefone, "", "company.phone='' + nfHideFromGuest=true não pode vazar guestPhone");
    assert.equal(p213.tomadorOptions.company.tomadorTelefone, "");
    assert.equal(p213.tomadorOptions.guest.tomadorTelefone, "");

    const p214 = pend21.payload.pendingReservations.find((x) => x.id === 214);
    assert.equal(p214.tomadorTelefone, "", "requesterIsGuest1=true + nfHideFromGuest=true deve mascarar telefone");
    assert.ok(p214.tomadorOptions.requester && p214.tomadorOptions.requesterOption, "requesterOption deve estar exposto em tomadorOptions");
    assert.equal(p214.tomadorOptions.requester.tomadorTelefone, "");

    const p215 = pend21.payload.pendingReservations.find((x) => x.id === 215);
    assert.equal(p215.tomadorTelefone, "22977776666", "Solicitante terceiro (requesterIsGuest1=false) preserva telefone próprio");
    assert.equal(p215.tomadorOptions.requester.tomadorTelefone, "22977776666");

    const p216 = pend21.payload.pendingReservations.find((x) => x.id === 216);
    assert.equal(p216.tomadorTelefone, "2227000000", "company.phone corporativo é preservado sob nfHideFromGuest=true");

    // POST /api/nfse/emit (executeNfseEmissionInternal) + POST /api/nfse/whatsapp/:id
    capturedDps21.length = 0;
    const emit213 = await callR21("POST /api/nfse/emit", {
      body: {
        reservationId: 213,
        companyId: 12,
        tomadorNome: p213.tomadorNome,
        tomadorCpfCnpj: p213.tomadorCpfCnpj,
        tomadorEmail: p213.tomadorEmail,
        tomadorTelefone: "22999002222", // tenta passar telefone pessoal do hóspede
        valorServico: 600,
        nfHideFromGuest: true,
      },
    });
    assert.equal(emit213.status, 201);
    assert.equal(capturedDps21[0].tomador.telefone, "", "SEFIN DPS XML tomador.telefone não pode receber telefone do hóspede");
    assert.equal(emit213.payload.invoice.tomadorTelefone, "", "Invoice persistido não pode gravar telefone do hóspede");
    assert.equal(emit213.payload.invoice.guestPhone, "");

    // Manual POST /api/nfse/whatsapp/:id bloqueado por privacidade mesmo se tomadorTelefone ou opts.phone bater com hóspede/acompanhante/guestAccounts
    const waBlocked1 = await callR21("POST /api/nfse/whatsapp/:id", { params: { id: emit213.payload.invoice.id }, body: {} });
    assert.equal(waBlocked1.payload.blockedByPrivacy, true);
    assert.equal(waBlocked1.payload.sent, false);

    const waBlockedCompanion = await rt21.dispatchNfseInvoiceWhatsApp(emit213.payload.invoice, { phone: "5522988887777" });
    assert.equal(waBlockedCompanion.blockedByPrivacy, true, "Telefone do acompanhante em r.guests[] também deve ser bloqueado");
    assert.equal(waBlockedCompanion.sent, false);

    const waBlockedGuestAcc = await rt21.dispatchNfseInvoiceWhatsApp({ ...emit213.payload.invoice, tomadorTelefone: "22999002222" }, {});
    assert.equal(waBlockedGuestAcc.blockedByPrivacy, true, "Telefone igual ao de db.guestAccounts/hóspede deve ser bloqueado");
    assert.equal(waDocCalls21.length, 0);
    assert.equal(waMsgCalls21.length, 0);

    // Telefone corporativo não pertencente ao hóspede continua permitido
    const waCorpOk = await rt21.dispatchNfseInvoiceWhatsApp({ ...emit213.payload.invoice, tomadorTelefone: "2227000000" }, {});
    assert.equal(waCorpOk.sent, true);
    assert.equal(waCorpOk.phone, "2227000000");

    // POST /api/nfse/emit-batch (string-id PF com nfHideFromGuest=true)
    capturedDps21.length = 0;
    const batch217 = await callR21("POST /api/nfse/emit-batch", { body: { items: [217] } });
    assert.equal(batch217.status, 200);
    assert.equal(batch217.payload.authorizedCount, 1);
    assert.equal(capturedDps21[0].tomador.telefone, "", "emit-batch PF com nfHideFromGuest=true não pode vazar guestPhone");
    assert.equal(batch217.payload.results[0].invoice.tomadorTelefone, "");

    // Low cleanup check: processSingleNfseRetryItem em retry consolidado vincula invoiceId/numeroNfse nas reservas
    const qConsItem = rt21.enqueueNfseRetry({
      isConsolidated: true,
      reservationIds: [603, 604],
      reservationCodes: ["RES-603", "RES-604"],
      companyId: 13,
      tomadorNome: "Corp Com Telefone LTDA",
      tomadorCpfCnpj: "99888777000166",
      tomadorEmail: "fin@corpcomtel.com",
      tomadorTelefone: "22999002222",
      valorServico: 900,
      nfHideFromGuest: true,
    }, "SEFIN Timeout");
    const retriedCons = await rt21.processSingleNfseRetryItem(qConsItem);
    assert.equal(retriedCons.ok, true);
    const r603After = db21.reservations.find((r) => r.id === 603);
    const r604After = db21.reservations.find((r) => r.id === 604);
    assert.equal(r603After.invoiceId, retriedCons.invoice.id, "Retry consolidado deve vincular invoiceId em todas as reservas");
    assert.equal(r603After.consolidatedInvoiceId, retriedCons.invoice.id);
    assert.equal(r603After.numeroNfse, retriedCons.invoice.numeroNfse);
    assert.equal(r604After.invoiceId, retriedCons.invoice.id);
    assert.equal(r604After.numeroNfse, retriedCons.invoice.numeroNfse);

    // 21b) Challenge 2: real buildOfficialNfseDraftForReservation (artifacts/api-server/chat-service.mjs)
    const draftDb = {
      guests: [
        { id: 81, fullName: "João Leak", name: "João Leak", documentNumber: "12345678909", email: "joao.crm@gmail.com", phone: "22999002222" },
        { id: 82, fullName: "Acomp Leak", name: "Acomp Leak", documentNumber: "98765432100", email: "acomp.crm@gmail.com", phone: "22988887777" },
      ],
      guestAccounts: [
        { id: 1, guestId: 81, documentNumber: "12345678909", email: "joao.acc@gmail.com", phone: "+55 22 99900-2222" },
      ],
      companies: [
        { id: 10, corporateName: "Acme Sem Email LTDA", cnpj: "11222333000181", financialEmail: "", phone: "" },
        { id: 11, corporateName: "Acme Com Email LTDA", cnpj: "47964813000165", financialEmail: "fin1@acme.com; fin2@acme.com", phone: "2227000000" },
      ],
      agencies: [
        { id: 20, corporateName: "Agência Oculta LTDA", cnpj: "77888999000144", financialEmail: "", phone: "" },
      ],
      invoices: [],
      reservations: [],
    };
    const draftHiddenNoCompEmail = buildOfficialNfseDraftForReservation(draftDb, {
      reservation: {
        id: 801,
        code: "RES-801",
        flatNumber: "101",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        totalAmount: 600,
        guestId: 81,
        guestName: "João Leak",
        guestDocument: "12345678909",
        guestEmail: "joao.leak@gmail.com",
        guestPhone: "22999002222",
        guests: [{ index: 2, guestId: 82, email: "acomp.slot@gmail.com", phone: "22988887777" }],
        companyId: 10,
        companyCnpj: "11222333000181",
        agencyId: 20,
        agencyCnpj: "77888999000144",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao.leak@gmail.com", "joao.acc@gmail.com", "acomp.crm@gmail.com"],
      },
    });
    assert.equal(draftHiddenNoCompEmail.nfHideFromGuest, true);
    assert.equal(draftHiddenNoCompEmail.tomadorEmail, "", "Draft não pode vazar guestEmail para tomadorEmail quando nfHideFromGuest=true");
    assert.equal(draftHiddenNoCompEmail.tomadorTelefone, "", "Draft não pode vazar guestPhone para tomadorTelefone quando nfHideFromGuest=true");
    assert.deepEqual(draftHiddenNoCompEmail.nfDeliveryEmails, []);
    assert.equal(draftHiddenNoCompEmail.tomadorOptions.company.tomadorEmail, "");
    assert.equal(draftHiddenNoCompEmail.tomadorOptions.company.tomadorTelefone, "");
    assert.equal(draftHiddenNoCompEmail.tomadorOptions.agency.tomadorEmail, "");
    assert.equal(draftHiddenNoCompEmail.tomadorOptions.agency.tomadorTelefone, "");
    assert.equal(draftHiddenNoCompEmail.tomadorOptions.guest.tomadorEmail, "");
    assert.equal(draftHiddenNoCompEmail.tomadorOptions.guest.tomadorTelefone, "");

    const draftHiddenWithCompEmail = buildOfficialNfseDraftForReservation(draftDb, {
      reservation: {
        id: 802,
        code: "RES-802",
        flatNumber: "102",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        totalAmount: 700,
        guestId: 81,
        guestName: "João Leak",
        guestDocument: "12345678909",
        guestEmail: "joao.leak@gmail.com",
        guestPhone: "22999002222",
        companyId: 11,
        companyCnpj: "47964813000165",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao.leak@gmail.com", "fin1@acme.com"],
      },
    });
    assert.equal(draftHiddenWithCompEmail.tomadorEmail, "fin1@acme.com");
    assert.equal(draftHiddenWithCompEmail.tomadorTelefone, "2227000000");
    assert.deepEqual(draftHiddenWithCompEmail.nfDeliveryEmails, ["fin1@acme.com", "fin2@acme.com"]);

    const draftVisible = buildOfficialNfseDraftForReservation(draftDb, {
      reservation: {
        id: 803,
        code: "RES-803",
        flatNumber: "103",
        checkinDate: "2027-08-01",
        checkoutDate: "2027-08-03",
        totalAmount: 500,
        guestId: 81,
        guestName: "João Leak",
        guestDocument: "12345678909",
        guestEmail: "joao.leak@gmail.com",
        guestPhone: "22999002222",
        nfHideFromGuest: false,
      },
    });
    assert.equal(draftVisible.nfHideFromGuest, false);
    assert.equal(draftVisible.tomadorEmail, "joao.crm@gmail.com");
    assert.equal(draftVisible.tomadorTelefone, "22999002222");

    // 21c) Challenge 3: emitCheckoutFaturadoPackage fallbackInvoice com nfHideFromGuest=true
    const dbFallback21 = createIsolatedDb();
    dbFallback21.companies = [
      { id: 10, corporateName: "Acme Corp LTDA", cnpj: "11222333000181", financialEmail: "fin@acme.com", phone: "2227000000" },
    ];
    dbFallback21.guests = [
      { id: 702, fullName: "Hóspede Fallback", documentNumber: "00000000000", email: "joao1@gmail.com", phone: "22999110001" },
    ];
    dbFallback21.guestAccounts = [
      { id: 1, guestId: 702, documentNumber: "00000000000", email: "joao.acc.fb@gmail.com", phone: "22999110001" },
    ];
    dbFallback21.boletos = [];
    dbFallback21.invoices = [];
    dbFallback21.minibarOrders = [];
    dbFallback21.reservations = [
      {
        id: 702,
        code: "RES-702",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-08-15",
        checkoutDate: "2027-08-17",
        totalAmount: 500,
        guestId: 702,
        guestName: "Hóspede Fallback",
        guestDocument: "00000000000",
        guestEmail: "joao1@gmail.com",
        guestPhone: "22999110001",
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao1@gmail.com"],
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
      },
      {
        id: 703,
        code: "RES-703-A",
        packageId: "PKG-703",
        packageCode: "PKG-703",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-08-15",
        checkoutDate: "2027-08-17",
        totalAmount: 400,
        guestId: 702,
        guestName: "Hóspede Fallback",
        guestDocument: "00000000000",
        guestEmail: "joao1@gmail.com",
        guestPhone: "22999110001",
        companyId: 10,
        nfHideFromGuest: false,
        nfDeliveryEmails: ["joao1@gmail.com", "fin@acme.com"],
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
      },
      {
        id: 704,
        code: "RES-703-B",
        packageId: "PKG-703",
        packageCode: "PKG-703",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-08-15",
        checkoutDate: "2027-08-17",
        totalAmount: 400,
        guestId: 702,
        guestName: "Hóspede Fallback",
        guestDocument: "00000000000",
        guestEmail: "joao1@gmail.com",
        guestPhone: "22999110001",
        companyId: 10,
        nfHideFromGuest: true,
        nfDeliveryEmails: ["joao1@gmail.com", "fin@acme.com"],
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
      },
    ];

    const rtFb21 = new Function(
      "deps",
      `
      const {
        db, isPackageCode, getPackageReservations, isPackageItemActive,
        parseEmailList, formatEmailList, getPrimaryEmail, normalizeInterBoletoPayer
      } = deps;
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isPackageItemCancelled = () => false;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const onlyDigits = (s) => String(s || "").replace(/\\D/g, "");
      const cleanPhone = (s) => String(s || "").replace(/\\D/g, "");
      const isGenericFallbackAddress = () => false;
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const getBrasiliaDateStr = () => "2027-08-17";
      const addDaysToIsoDate = (_d, n) => "2027-08-" + String(17 + n).padStart(2, "0");
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const applyCrmBillingConfigFields = () => {};
      const findExistingInvoiceForReservation = () => null;
      const enrichBoletoDynamicStatus = (b) => b;
      const generateBoletoPdfBuffer = async () => Buffer.from("BOLPDF");
      const generateNfsePdfBuffer = async () => Buffer.from("NFSEPDF");
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const sendEmailAsync = () => ({ id: "em", status: "sent" });
      const sendZapiMessage = async () => ({ success: true });
      const sendZapiDocument = async () => ({ success: true });
      const createNotification = () => {};
      const saveDatabase = () => {};
      // Força entrada na branch fallbackInvoice
      const executeNfseEmissionInternal = async () => ({ success: false, badRequest: true, error: "Documento inválido" });
      const issueInterBoleto = async (opts) => ({
        seuNumero: opts.seuNumero,
        nossoNumero: "0003",
        codigoSolicitacao: "SOL-3",
        codigoBarras: "077",
        linhaDigitavel: "07790",
        pixCopiaECola: "PIX",
        txId: "TX3",
        provider: "inter_simulated",
        simulated: true,
        pagador: opts.payer,
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("computeReservationAccommodationAndConsumption")}
      ${extractFn("resolveReservationCrmLinks")}
      ${extractFn("resolveReservationBillingRecipientsList")}
      ${extractFn("resolveBoletoPayerData")}
      ${extractFn("syncBoletoWithAccountsReceivable")}
      ${extractFn("dispatchFaturadoBillingPackage")}
      ${extractFn("emitCheckoutFaturadoPackage")}
      return { emitCheckoutFaturadoPackage };
      `
    )({
      db: dbFallback21,
      isPackageCode,
      getPackageReservations,
      isPackageItemActive,
      parseEmailList,
      formatEmailList,
      getPrimaryEmail,
      normalizeInterBoletoPayer,
    });

    const fbPf = await rtFb21.emitCheckoutFaturadoPackage(dbFallback21.reservations[0], {
      emitNfse: true,
      billingRecipients: { company: false, guest: true, sendEmail: false, sendWhatsapp: false },
    });
    assert.equal(fbPf.invoice.simulated, true);
    assert.equal(fbPf.invoice.nfHideFromGuest, true);
    assert.equal(fbPf.invoice.tomadorEmail, "", "fallbackInvoice PF com nfHideFromGuest=true não pode vazar e-mail do hóspede");
    assert.equal(fbPf.invoice.tomadorTelefone, "", "fallbackInvoice PF com nfHideFromGuest=true não pode vazar telefone do hóspede");
    assert.deepEqual(fbPf.invoice.nfDeliveryEmails, []);

    const fbPkg = await rtFb21.emitCheckoutFaturadoPackage(dbFallback21.reservations[1], {
      packageId: "PKG-703",
      consolidatePackage: true,
      emitNfse: true,
      billingRecipients: { company: true, sendEmail: false, sendWhatsapp: false },
    });
    assert.equal(fbPkg.invoice.simulated, true);
    assert.equal(fbPkg.invoice.nfHideFromGuest, true);
    assert.equal(fbPkg.invoice.tomadorEmail, "fin@acme.com");
    assert.deepEqual(fbPkg.invoice.nfDeliveryEmails, ["fin@acme.com"]);
  });

  it("22. Regressão Iteration 6 (Solicitante terceiro requesterIsGuest1=false sob nfHideFromGuest=true em emit/batch/faturado/retry/WhatsApp/consolidated/draft, fallback IIFE pending-reservations e replace/:id)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };
    const db22 = createIsolatedDb();
    db22.flats = [
      { id: 1, number: "101", name: "Flat 101" },
      { id: 2, number: "102", name: "Flat 102" },
      { id: 3, number: "103", name: "Flat 103" },
      { id: 4, number: "104", name: "Flat 104" },
      { id: 5, number: "105", name: "Flat 105" },
      { id: 6, number: "106", name: "Flat 106" },
      { id: 7, number: "107", name: "Flat 107" },
      { id: 8, number: "108", name: "Flat 108" },
      { id: 9, number: "109", name: "Flat 109" },
      { id: 10, number: "110", name: "Flat 110" },
    ];
    // Solicitante terceiro em index 0 (antes do hóspede 501) com endereço real no CRM e em guestAccounts
    db22.guests = [
      {
        id: 502,
        fullName: "Gestora Terceira",
        name: "Gestora Terceira",
        documentNumber: "11144477735",
        email: "gestora@terceiro.com",
        phone: "2227112233",
        street: "Rua dos Goytacazes",
        streetNumber: "450",
        neighborhood: "Centro",
        cep: "28010000",
        city: "Campos dos Goytacazes",
        state: "RJ",
        ibgeCode: "3301009",
        tags: ["solicitante_terceiro"],
      },
      {
        id: 501,
        fullName: "Hóspede Estadia",
        name: "Hóspede Estadia",
        documentNumber: "12345678909",
        email: "hospede.pessoal@gmail.com",
        phone: "22999111111",
      },
      {
        id: 503,
        fullName: "Solicitante Hospede",
        name: "Solicitante Hospede",
        documentNumber: "52998224725",
        email: "sol.hospede@gmail.com",
        phone: "22999220000",
      },
    ];
    db22.guestAccounts = [
      { id: 1, guestId: 501, documentNumber: "12345678909", email: "hospede.digital@gmail.com", phone: "+55 22 99911-1111" },
      { id: 2, guestId: 502, documentNumber: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
      { id: 3, guestId: 503, documentNumber: "52998224725", email: "sol.hospede@gmail.com", phone: "22999220000" },
    ];
    db22.companies = [];
    db22.agencies = [];
    db22.boletos = [];
    db22.invoices = [];
    db22.nfseRetryQueue = [];
    db22.minibarOrders = [];
    db22.reservations = [
      {
        id: 901,
        code: "RES-901",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-09-01",
        checkoutDate: "2027-09-03",
        status: "confirmada",
        totalAmount: 650,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 9010,
        code: "RES-901B",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-09-01",
        checkoutDate: "2027-09-03",
        status: "confirmada",
        totalAmount: 650,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 902,
        code: "RES-902",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-09-01",
        checkoutDate: "2027-09-03",
        status: "confirmada",
        totalAmount: 700,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
        billingRecipients: { guest: true, requester: true, company: false, sendEmail: true, sendWhatsapp: true },
      },
      {
        id: 903,
        code: "RES-903",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2027-09-01",
        checkoutDate: "2027-09-03",
        status: "confirmada",
        totalAmount: 500,
        guestId: 503,
        guestName: "Solicitante Hospede",
        guestDocument: "52998224725",
        guestEmail: "sol.hospede@gmail.com",
        guestPhone: "22999220000",
        requesterIsGuest1: true,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 503, name: "Solicitante Hospede", cpf: "52998224725", email: "sol.hospede@gmail.com", phone: "22999220000" },
        nfHideFromGuest: true,
      },
      {
        id: 904,
        code: "RES-904",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2027-09-05",
        checkoutDate: "2027-09-07",
        status: "confirmada",
        totalAmount: 550,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "other_person",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 905,
        code: "RES-905",
        packageId: "PKG-905",
        packageCode: "PKG-905",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2027-09-10",
        checkoutDate: "2027-09-12",
        status: "confirmada",
        totalAmount: 400,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 906,
        code: "RES-906",
        packageId: "PKG-905",
        packageCode: "PKG-905",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2027-09-10",
        checkoutDate: "2027-09-12",
        status: "confirmada",
        totalAmount: 400,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 907,
        code: "RES-907",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2027-09-15",
        checkoutDate: "2027-09-17",
        status: "confirmada",
        totalAmount: 480,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 908,
        code: "RES-908",
        flatId: 9,
        flatNumber: "109",
        checkinDate: "2027-09-18",
        checkoutDate: "2027-09-20",
        status: "confirmada",
        totalAmount: 520,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "other_person",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
      {
        id: 909,
        code: "RES-909",
        flatId: 10,
        flatNumber: "110",
        checkinDate: "2027-09-21",
        checkoutDate: "2027-09-23",
        status: "confirmada",
        totalAmount: 450,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "guest",
        nfHideFromGuest: false,
      },
    ];

    const registered22 = {};
    const capturedDps22 = [];
    const emailCalls22 = [];
    const waDocCalls22 = [];
    const waMsgCalls22 = [];
    const appMock22 = {
      get: (p, h) => { registered22[`GET ${p}`] = h; },
      post: (p, h) => { registered22[`POST ${p}`] = h; },
    };

    const rt22 = new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, isPackageCode, buildNationalDpsPayload,
        normalizeInterBoletoPayer, onDpsBuilt, onEmailSent, onWaDoc, onWaMsg
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isPackageItemCancelled = () => false;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const createNotification = () => {};
      const applyCrmBillingConfigFields = () => {};
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const getBrasiliaDateStr = () => "2027-09-03";
      const addDaysToIsoDate = (_d, n) => "2027-09-" + String(3 + n).padStart(2, "0");
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        consumptionItems: [],
      });
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const generateBoletoPdfBuffer = async () => Buffer.from("BOLPDF");
      const generateNfsePdfBuffer = async () => Buffer.from("NFSEPDF");
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const sendEmailAsync = (opts) => { onEmailSent(opts); return { id: "em22", status: "sent" }; };
      const sendZapiDocument = async (_cfg, opts) => { onWaDoc(opts); return { success: true }; };
      const sendZapiMessage = async (_cfg, opts) => { onWaMsg(opts); return { success: true }; };
      const appendMessageToConversation = () => {};
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const issueInterBoleto = async (opts) => ({
        seuNumero: opts.seuNumero,
        nossoNumero: "0022",
        codigoSolicitacao: "SOL-22",
        codigoBarras: "077",
        linhaDigitavel: "07790",
        pixCopiaECola: "PIX22",
        txId: "TX22",
        provider: "inter_simulated",
        simulated: true,
        pagador: opts.payer,
      });
      const wrappedBuildNationalDpsPayload = (args) => {
        onDpsBuilt(args);
        return buildNationalDpsPayload(args);
      };
      const buildWrapped = (args) => wrappedBuildNationalDpsPayload(args);
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF22",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE22",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("resolveReservationCrmLinks")}
      ${extractFn("resolveReservationBillingRecipientsList")}
      ${extractFn("resolveBoletoPayerData")}
      ${extractFn("syncBoletoWithAccountsReceivable")}
      ${extractFn("dispatchFaturadoBillingPackage")}
      ${extractFn("dispatchNfseInvoiceWhatsApp")}
      ${extractFn("enqueueNfseRetry")}
      ${extractFn("processSingleNfseRetryItem").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("executeNfseEmissionInternal").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("emitCheckoutFaturadoPackage")}
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      ${extractRouteBlock('app.post("/api/nfse/emit"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-batch"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/replace/:id"')}
      return {
        dispatchNfseInvoiceWhatsApp,
        enqueueNfseRetry,
        processSingleNfseRetryItem,
        executeNfseEmissionInternal,
        emitCheckoutFaturadoPackage,
      };
      `
    )({
      app: appMock22,
      db: db22,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      isPackageCode,
      buildNationalDpsPayload,
      normalizeInterBoletoPayer,
      onDpsBuilt: (a) => capturedDps22.push(a),
      onEmailSent: (o) => emailCalls22.push(o),
      onWaDoc: (o) => waDocCalls22.push(o),
      onWaMsg: (o) => waMsgCalls22.push(o),
    });

    const callR22 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered22[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 22a) pending-reservations -> POST /api/nfse/emit -> dispatchNfseInvoiceWhatsApp -> POST /api/nfse/emit-batch
    const pend22 = await callR22("GET /api/nfse/pending-reservations");
    assert.equal(pend22.status, 200);
    const p901 = pend22.payload.pendingReservations.find((x) => x.id === 901);
    assert.equal(p901.invoiceRecipientType, "requester");
    assert.equal(p901.tomadorCpfCnpj, "11144477735");
    assert.equal(p901.tomadorEmail, "gestora@terceiro.com");
    assert.equal(p901.tomadorTelefone, "2227112233");
    assert.deepEqual(p901.nfDeliveryEmails, ["gestora@terceiro.com"]);
    const p903 = pend22.payload.pendingReservations.find((x) => x.id === 903);
    assert.equal(p903.tomadorEmail, "", "requesterIsGuest1=true sob nfHideFromGuest=true deve mascarar email");
    assert.equal(p903.tomadorTelefone, "", "requesterIsGuest1=true sob nfHideFromGuest=true deve mascarar telefone");
    const p909 = pend22.payload.pendingReservations.find((x) => x.id === 909);
    assert.equal(p909.tomadorEmail, "hospede.pessoal@gmail.com", "nfHideFromGuest=false preserva contato do hóspede");
    assert.equal(p909.tomadorTelefone, "22999111111");

    capturedDps22.length = 0;
    const emit901 = await callR22("POST /api/nfse/emit", {
      body: {
        reservationId: p901.reservationId,
        reservationCode: p901.code,
        guestId: p901.guestId,
        invoiceRecipientType: p901.invoiceRecipientType,
        tomadorNome: p901.tomadorNome,
        tomadorCpfCnpj: p901.tomadorCpfCnpj,
        tomadorEmail: p901.tomadorEmail,
        tomadorTelefone: p901.tomadorTelefone,
        nfDeliveryEmails: p901.nfDeliveryEmails,
        nfHideFromGuest: true,
        valorServico: p901.valorServico,
      },
    });
    assert.equal(emit901.status, 201);
    assert.equal(capturedDps22[0].tomador.email, "gestora@terceiro.com");
    assert.equal(capturedDps22[0].tomador.telefone, "2227112233");
    assert.equal(emit901.payload.invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(emit901.payload.invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(emit901.payload.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(emit901.payload.invoice.guestPhone, "");
    assert.equal(emit901.payload.invoice.guestId, 501);
    assert.equal(emit901.payload.invoice.invoiceRecipientType, "requester");

    // RES-901B sem guestId (e com guestId=502 do solicitante) não pode contaminar guestId nem apagar contatos
    capturedDps22.length = 0;
    const emit901b = await callR22("POST /api/nfse/emit", {
      body: {
        reservationId: 9010,
        reservationCode: "RES-901B",
        invoiceRecipientType: "requester",
        tomadorNome: "Gestora Terceira",
        tomadorCpfCnpj: "11144477735",
        tomadorEmail: "gestora@terceiro.com",
        tomadorTelefone: "2227112233",
        nfHideFromGuest: true,
        valorServico: 650,
      },
    });
    assert.equal(emit901b.status, 201);
    assert.equal(emit901b.payload.invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(emit901b.payload.invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(emit901b.payload.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(emit901b.payload.invoice.guestId, 501, "newInvoice.guestId deve registrar o hóspede da estadia (501), nunca o solicitante (502)");
    assert.equal(emit901b.payload.invoice.guestName, "Hóspede Estadia");

    // dispatchNfseInvoiceWhatsApp: libera para solicitante terceiro e bloqueia telefone do hóspede
    waDocCalls22.length = 0;
    waMsgCalls22.length = 0;
    const waReqOk = await rt22.dispatchNfseInvoiceWhatsApp(emit901b.payload.invoice, {});
    assert.equal(waReqOk.sent, true, "WhatsApp deve ser enviado para o solicitante terceiro mesmo com nfHideFromGuest=true");
    assert.equal(waReqOk.blockedByPrivacy, undefined);
    assert.equal(waReqOk.phone, "2227112233");

    const waGuestBlocked = await rt22.dispatchNfseInvoiceWhatsApp(emit901b.payload.invoice, { phone: "22999111111" });
    assert.equal(waGuestBlocked.blockedByPrivacy, true);
    assert.equal(waGuestBlocked.sent, false);

    // emit-batch string-id e object-item para solicitante terceiro sob nfHideFromGuest=true
    capturedDps22.length = 0;
    const batch22 = await callR22("POST /api/nfse/emit-batch", {
      body: { items: [907, { reservationId: 908, invoiceRecipientType: "other_person" }] },
    });
    assert.equal(batch22.status, 200);
    assert.equal(batch22.payload.authorizedCount, 2);
    assert.equal(batch22.payload.results[0].invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(batch22.payload.results[0].invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(batch22.payload.results[0].invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(batch22.payload.results[1].invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(batch22.payload.results[1].invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(batch22.payload.results[1].invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);

    // 22b) emitCheckoutFaturadoPackage para RES-902 (solicitante terceiro sob nfHideFromGuest=true)
    emailCalls22.length = 0;
    waDocCalls22.length = 0;
    waMsgCalls22.length = 0;
    const fat902 = await rt22.emitCheckoutFaturadoPackage(db22.reservations.find((r) => r.id === 902), {
      emitNfse: true,
    });
    assert.equal(fat902.invoice.tomadorCpfCnpj, "11144477735");
    assert.equal(fat902.invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(fat902.invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(fat902.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(fat902.invoice.nfHideFromGuest, true);
    assert.equal(fat902.invoice.guestId, 501);
    assert.equal(fat902.invoice.invoiceRecipientType, "requester");
    const sentEmailRecipients22 = emailCalls22.flatMap((c) => parseEmailList(c?.recipient || c?.to || ""));
    assert.ok(sentEmailRecipients22.includes("gestora@terceiro.com"));
    assert.ok(!sentEmailRecipients22.includes("hospede.pessoal@gmail.com"));
    assert.ok(!sentEmailRecipients22.includes("hospede.digital@gmail.com"));
    const sentWaPhones22 = [...waMsgCalls22, ...waDocCalls22].map((w) => String(w?.phone || "").replace(/\D/g, ""));
    assert.ok(sentWaPhones22.some((p) => p.endsWith("27112233")));
    assert.ok(!sentWaPhones22.some((p) => p.endsWith("99111111")));

    // 22c) enqueueNfseRetry -> processSingleNfseRetryItem para RES-904
    capturedDps22.length = 0;
    const retryItem904 = rt22.enqueueNfseRetry({
      reservationId: 904,
      reservationCode: "RES-904",
      guestId: 502,
      invoiceRecipientType: "other_person",
      tomadorNome: "Gestora Terceira",
      tomadorCpfCnpj: "11144477735",
      tomadorEmail: "gestora@terceiro.com",
      tomadorTelefone: "2227112233",
      nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      nfHideFromGuest: true,
      valorServico: 550,
    }, "SEFIN Timeout");
    const retriedReq = await rt22.processSingleNfseRetryItem(retryItem904);
    assert.equal(retriedReq.ok, true);
    assert.equal(capturedDps22[0].tomador.email, "gestora@terceiro.com");
    assert.equal(capturedDps22[0].tomador.telefone, "2227112233");
    assert.equal(retriedReq.invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(retriedReq.invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(retriedReq.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(retriedReq.invoice.guestId, 501);

    // 22d) POST /api/nfse/emit-consolidated para pacote PF solicitante terceiro PKG-905
    capturedDps22.length = 0;
    const consReq = await callR22("POST /api/nfse/emit-consolidated", {
      body: { packageCode: "PKG-905" },
    });
    assert.equal(consReq.status, 201);
    assert.equal(capturedDps22[0].tomador.email, "gestora@terceiro.com");
    assert.equal(capturedDps22[0].tomador.telefone, "2227112233");
    assert.equal(consReq.payload.invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(consReq.payload.invoice.tomadorTelefone, "2227112233");
    assert.deepEqual(consReq.payload.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(consReq.payload.invoice.guestId, 501);

    // 22e) GET /api/nfse/pending-reservations fallback IIFE sem collectReservationGuestPersonalEmails/Phones (valida correção do TDZ)
    const registeredFallback22 = {};
    new Function(
      "deps",
      `
      const { app, db, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail } = deps;
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidCnpj = () => true;
      const isGenericFallbackAddress = () => false;
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const getFiscalData = () => {};
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        consumptionItems: [],
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      `
    )({
      app: { get: (p, h) => { registeredFallback22[`GET ${p}`] = h; } },
      db: {
        ...db22,
        invoices: [],
        reservations: db22.reservations.filter((r) => [901, 903, 909].includes(r.id)).map((r) => ({ ...r, invoiceId: null, numeroNfse: null })),
      },
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
    });
    let fbStatus22 = 200;
    let fbPayload22 = null;
    await registeredFallback22["GET /api/nfse/pending-reservations"](
      { query: {}, user: { role: "admin" } },
      { status(s) { fbStatus22 = s; return this; }, json(p) { fbPayload22 = p; return this; } }
    );
    assert.equal(fbStatus22, 200, "Fallback IIFE de pending-reservations não pode lançar ReferenceError TDZ");
    const fbP903 = fbPayload22.pendingReservations.find((x) => x.id === 903);
    assert.equal(fbP903.tomadorEmail, "");
    assert.equal(fbP903.tomadorTelefone, "");
    const fbP901 = fbPayload22.pendingReservations.find((x) => x.id === 901);
    assert.equal(fbP901.tomadorEmail, "gestora@terceiro.com");
    assert.equal(fbP901.tomadorTelefone, "2227112233");

    // 22f) POST /api/nfse/replace/:id mascara contatos pessoais quando nfHideFromGuest=true e preserva solicitante terceiro
    db22.invoices.push(
      {
        id: 990,
        numeroNfse: "2027000990",
        status: "autorizada",
        reservationId: 901,
        reservationCode: "RES-901",
        nfHideFromGuest: true,
        invoiceRecipientType: "guest",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.pessoal@gmail.com",
        tomadorTelefone: "22999111111",
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
        valorServico: 650,
        discriminacao: "Hospedagem",
      },
      {
        id: 991,
        numeroNfse: "2027000991",
        status: "autorizada",
        reservationId: 901,
        reservationCode: "RES-901",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Gestora Terceira",
        tomadorCpfCnpj: "11144477735",
        tomadorEmail: "gestora@terceiro.com",
        tomadorTelefone: "2227112233",
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
        valorServico: 650,
        discriminacao: "Hospedagem",
      }
    );
    const rep990 = await callR22("POST /api/nfse/replace/:id", { params: { id: 990 }, body: {} });
    assert.equal(rep990.status, 200);
    assert.equal(rep990.payload.draft.nfHideFromGuest, true);
    assert.equal(rep990.payload.draft.tomadorEmail, "");
    assert.equal(rep990.payload.draft.tomadorTelefone, "");
    assert.deepEqual(rep990.payload.draft.nfDeliveryEmails, ["gestora@terceiro.com"]);

    const rep991 = await callR22("POST /api/nfse/replace/:id", { params: { id: 991 }, body: {} });
    assert.equal(rep991.status, 200);
    assert.equal(rep991.payload.draft.nfHideFromGuest, true);
    assert.equal(rep991.payload.draft.tomadorEmail, "gestora@terceiro.com");
    assert.equal(rep991.payload.draft.tomadorTelefone, "2227112233");
    assert.deepEqual(rep991.payload.draft.nfDeliveryEmails, ["gestora@terceiro.com"]);

    // 22g) buildOfficialNfseDraftForReservation (chat-service.mjs) com nota prévia de solicitante terceiro em db.invoices
    const draftDb22 = {
      guests: JSON.parse(JSON.stringify(db22.guests)),
      guestAccounts: JSON.parse(JSON.stringify(db22.guestAccounts)),
      companies: [],
      agencies: [],
      reservations: [],
      invoices: [
        {
          id: 980,
          status: "autorizada",
          guestId: 501,
          invoiceRecipientType: "requester",
          tomadorNome: "Gestora Terceira",
          tomadorCpfCnpj: "11144477735",
          tomadorEmail: "gestora@terceiro.com",
          tomadorTelefone: "2227112233",
        },
      ],
    };
    const draft901 = buildOfficialNfseDraftForReservation(draftDb22, {
      reservation: {
        id: 901,
        code: "RES-901",
        flatNumber: "101",
        checkinDate: "2027-09-01",
        checkoutDate: "2027-09-03",
        totalAmount: 650,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "gestora@terceiro.com"],
      },
    });
    assert.equal(draft901.nfHideFromGuest, true);
    assert.equal(draft901.tomadorEmail, "gestora@terceiro.com");
    assert.equal(draft901.tomadorTelefone, "2227112233");
    assert.deepEqual(draft901.nfDeliveryEmails, ["gestora@terceiro.com"]);
    assert.equal(draft901.tomadorOptions.guest.tomadorEmail, "");
    assert.equal(draft901.tomadorOptions.guest.tomadorTelefone, "");
  });

  it("23. Regressão Iteration 7b (3B-ATTACK/Test C guestAccounts spoof, 1C-ATTACK emit-consolidated email, 1B/Test B requester_pf, 3G-ATTACK guestAccounts requester, 1G-ATTACK replace órfã, Test A ;-email, resolveBoletoPayerData privacy e emit-consolidated agency+company)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    const db23 = createIsolatedDb();
    db23.guests = [
      {
        id: 501,
        fullName: "Hóspede Estadia",
        name: "Hóspede Estadia",
        cpf: "12345678909",
        documentNumber: "12345678909",
        email: "hospede.pessoal@gmail.com",
        phone: "22999111111",
      },
      {
        id: 502,
        fullName: "Gestora Terceira",
        name: "Gestora Terceira",
        cpf: "11144477735",
        documentNumber: "11144477735",
        email: "gestora@terceiro.com",
        phone: "2227112233",
        tags: ["solicitante_terceiro"],
      },
      {
        id: 503,
        fullName: "Hóspede Flat Dois",
        name: "Hóspede Flat Dois",
        cpf: "98765432100",
        documentNumber: "98765432100",
        email: "flat2.stay@gmail.com",
        phone: "22998887777",
      },
    ];
    db23.guestAccounts = [
      {
        id: 1,
        guestId: 501,
        fullName: "Hóspede Estadia",
        documentNumber: "12345678909",
        email: "hospede.digital@gmail.com",
        phone: "22999111111",
      },
      {
        id: 2,
        guestId: 503,
        fullName: "Hóspede Flat Dois",
        documentNumber: "98765432100",
        email: "flat2.digital@gmail.com",
        phone: "22998887777",
      },
      {
        // 3G-ATTACK: Solicitante 504 existe APENAS em db.guestAccounts (não em db.guests)
        id: 3,
        guestId: 504,
        fullName: "Solicitante Digital Apenas",
        documentNumber: "22255588810",
        email: "sol504.digital@terceiro.com",
        phone: "2227445566",
      },
    ];
    db23.companies = [
      {
        id: 70,
        corporateName: "Acme Corp LTDA",
        tradeName: "Acme Corp",
        cnpj: "33000167000101",
        financialEmail: "hospede.pessoal@gmail.com; fin1@acme.com; fin2@acme.com",
        phone: "2133334444",
        address: "Av. Rio Branco",
        number: "100",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "20040001",
      },
    ];
    db23.agencies = [
      {
        id: 20,
        corporateName: "Fly B2B Viagens LTDA",
        tradeName: "Fly B2B",
        cnpj: "11222333000181",
        financialEmail: "flat2.stay@gmail.com; ag1@flyb2b.com",
        phone: "1132220000",
        address: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        cep: "01310100",
      },
    ];
    db23.reservations = [
      // 3B-ATTACK: guestId=null, guestDocument="", guestEmail="", guestPhone="", apenas guestName="Hóspede Estadia"
      {
        id: 921,
        code: "RES-921",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-10-01",
        checkoutDate: "2027-10-03",
        status: "confirmada",
        totalAmount: 650,
        guestId: null,
        guestName: "Hóspede Estadia",
        guestDocument: "",
        guestEmail: "",
        guestPhone: "",
        requesterIsGuest1: false,
        nfHideFromGuest: true,
      },
      // Test C: guestId=501, guestDocument="", guestEmail="", guestPhone=""
      {
        id: 922,
        code: "RES-922",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-10-01",
        checkoutDate: "2027-10-03",
        status: "confirmada",
        totalAmount: 650,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "",
        guestEmail: "",
        guestPhone: "",
        nfHideFromGuest: true,
      },
      // 1C-ATTACK: Pacote PKG-923 (solicitante terceiro sob nfHideFromGuest=true)
      {
        id: 923,
        code: "RES-923",
        packageId: "PKG-923",
        packageCode: "PKG-923",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-10-04",
        checkoutDate: "2027-10-06",
        status: "confirmada",
        totalAmount: 500,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
      },
      {
        id: 924,
        code: "RES-924",
        packageId: "PKG-923",
        packageCode: "PKG-923",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2027-10-04",
        checkoutDate: "2027-10-06",
        status: "confirmada",
        totalAmount: 500,
        guestId: 503,
        guestName: "Hóspede Flat Dois",
        guestDocument: "98765432100",
        guestEmail: "flat2.stay@gmail.com",
        guestPhone: "22998887777",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
      },
      // 1B & Test B: requester_pf com companyId: 70
      {
        id: 925,
        code: "RES-925",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2027-10-07",
        checkoutDate: "2027-10-09",
        status: "confirmada",
        totalAmount: 600,
        companyId: 70,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester_pf",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
      },
      {
        id: 926,
        code: "RES-926",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2027-10-07",
        checkoutDate: "2027-10-09",
        status: "confirmada",
        totalAmount: 600,
        companyId: 70,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester_pf",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
      },
      // Test A: ;-separated requesterInfo.email
      {
        id: 927,
        code: "RES-927",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2027-10-10",
        checkoutDate: "2027-10-12",
        status: "confirmada",
        totalAmount: 700,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora1@terceiro.com; gestora2@terceiro.com", phone: "2227112233" },
        nfHideFromGuest: true,
      },
      // Challenger 2 Bug 1: single & consolidated faturado com email do hóspede contaminando company.financialEmail
      {
        id: 928,
        code: "RES-928",
        packageId: "PKG-FAT23",
        packageCode: "PKG-FAT23",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2027-10-12",
        checkoutDate: "2027-10-14",
        status: "checkout_realizado",
        totalAmount: 800,
        companyId: 70,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        nfHideFromGuest: true,
        isFaturadoBoleto: true,
        invoiceRecipientType: "company",
      },
      {
        id: 929,
        code: "RES-929",
        packageId: "PKG-FAT23",
        packageCode: "PKG-FAT23",
        flatId: 9,
        flatNumber: "109",
        checkinDate: "2027-10-12",
        checkoutDate: "2027-10-14",
        status: "checkout_realizado",
        totalAmount: 800,
        companyId: 70,
        guestId: 503,
        guestName: "Hóspede Flat Dois",
        guestDocument: "98765432100",
        guestEmail: "flat2.stay@gmail.com",
        guestPhone: "22998887777",
        nfHideFromGuest: true,
        isFaturadoBoleto: true,
        invoiceRecipientType: "company",
      },
      // Challenger 2 Bug 1 (requesterIsGuest1=true, pType="requester")
      {
        id: 930,
        code: "RES-930",
        flatId: 10,
        flatNumber: "110",
        checkinDate: "2027-10-14",
        checkoutDate: "2027-10-16",
        status: "confirmada",
        totalAmount: 550,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        requesterIsGuest1: true,
        invoiceRecipientType: "requester",
        boletoPayerType: "requester",
        requesterInfo: { guestId: 501, name: "Hóspede Estadia", cpf: "12345678909", email: "hospede.pessoal@gmail.com", phone: "22999111111" },
        nfHideFromGuest: true,
      },
      // Challenger 2 Bug 2: Pacote B2B NET com ambos agencyId e companyId e invoiceRecipientType="agency"
      {
        id: 931,
        code: "RES-931",
        packageId: "PKG-AG-CO-23",
        packageCode: "PKG-AG-CO-23",
        flatId: 11,
        flatNumber: "111",
        checkinDate: "2027-10-16",
        checkoutDate: "2027-10-18",
        status: "confirmada",
        totalAmount: 900,
        agencyId: 20,
        companyId: 70,
        b2bRatePolicy: "NET",
        invoiceRecipientType: "agency",
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22999111111",
        nfHideFromGuest: true,
      },
      {
        id: 932,
        code: "RES-932",
        packageId: "PKG-AG-CO-23",
        packageCode: "PKG-AG-CO-23",
        flatId: 12,
        flatNumber: "112",
        checkinDate: "2027-10-16",
        checkoutDate: "2027-10-18",
        status: "confirmada",
        totalAmount: 900,
        agencyId: 20,
        companyId: 70,
        b2bRatePolicy: "NET",
        invoiceRecipientType: "agency",
        guestId: 503,
        guestName: "Hóspede Flat Dois",
        guestDocument: "98765432100",
        guestEmail: "flat2.stay@gmail.com",
        guestPhone: "22998887777",
        nfHideFromGuest: true,
      },
    ];

    const registered23 = {};
    const capturedDps23 = [];
    const capturedInterPayers23 = [];
    const appMock23 = {
      get: (p, h) => { registered23[`GET ${p}`] = h; },
      post: (p, h) => { registered23[`POST ${p}`] = h; },
    };

    const rt23 = new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, isPackageCode, buildNationalDpsPayload,
        normalizeInterBoletoPayer, onDpsBuilt, onInterBoleto
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isPackageItemCancelled = () => false;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const createNotification = () => {};
      const applyCrmBillingConfigFields = () => {};
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const getBrasiliaDateStr = () => "2027-10-14";
      const addDaysToIsoDate = (_d, n) => "2027-10-" + String(14 + n).padStart(2, "0");
      const computeReservationAccommodationAndConsumption = (r) => ({
        accommodationAmount: Number(r.totalAmount || 0),
        consumptionAmount: 0,
        totalWithConsumption: Number(r.totalAmount || 0),
        priorPaidAmount: 0,
        netAccommodationBoletoAmount: Number(r.totalAmount || 0),
        netConsumptionBoletoAmount: 0,
        netTotalBoletoAmount: Number(r.totalAmount || 0),
        consumptionItems: [],
        minibarOrderIds: [],
      });
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const generateBoletoPdfBuffer = async () => Buffer.from("BOLPDF");
      const generateNfsePdfBuffer = async () => Buffer.from("NFSEPDF");
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const sendEmailAsync = () => ({ id: "em23", status: "sent" });
      const sendZapiDocument = async () => ({ success: true });
      const sendZapiMessage = async () => ({ success: true });
      const appendMessageToConversation = () => {};
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const issueInterBoleto = async (opts) => {
        onInterBoleto(opts);
        return {
          seuNumero: opts.seuNumero,
          nossoNumero: "0023",
          codigoSolicitacao: "SOL-23",
          codigoBarras: "077",
          linhaDigitavel: "07790",
          pixCopiaECola: "PIX23",
          txId: "TX23",
          provider: "inter_simulated",
          simulated: true,
          pagador: opts.payer,
        };
      };
      const wrappedBuildNationalDpsPayload = (args) => {
        onDpsBuilt(args);
        return buildNationalDpsPayload(args);
      };
      const buildWrapped = (args) => wrappedBuildNationalDpsPayload(args);
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF23",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE23",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("resolveReservationCrmLinks")}
      ${extractFn("resolveReservationBillingRecipientsList")}
      ${extractFn("resolveBoletoPayerData")}
      ${extractFn("syncBoletoWithAccountsReceivable")}
      ${extractFn("dispatchFaturadoBillingPackage")}
      ${extractFn("enqueueNfseRetry")}
      ${extractFn("processSingleNfseRetryItem").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("executeNfseEmissionInternal").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("emitCheckoutFaturadoPackage")}
      ${extractRouteBlock('app.get("/api/nfse/pending-reservations"')}
      ${extractRouteBlock('app.post("/api/nfse/emit"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-batch"')}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/replace/:id"')}
      return {
        resolveBoletoPayerData,
        enqueueNfseRetry,
        processSingleNfseRetryItem,
        executeNfseEmissionInternal,
        emitCheckoutFaturadoPackage,
      };
      `
    )({
      app: appMock23,
      db: db23,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      isPackageCode,
      buildNationalDpsPayload,
      normalizeInterBoletoPayer,
      onDpsBuilt: (a) => capturedDps23.push(a),
      onInterBoleto: (o) => capturedInterPayers23.push(o),
    });

    const callR23 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered23[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 1) 3B-ATTACK: spoof invoiceRecipientType="requester" com CPF do hóspede 501 quando guestId=null e guestDocument=""
    capturedDps23.length = 0;
    const atk3b = await callR23("POST /api/nfse/emit", {
      body: {
        reservationId: 921,
        invoiceRecipientType: "requester",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999111111",
        nfHideFromGuest: true,
        valorServico: 650,
      },
    });
    assert.equal(atk3b.status, 201);
    assert.equal(atk3b.payload.invoice.tomadorEmail, "", "3B-ATTACK: não pode vazar email de db.guestAccounts");
    assert.equal(atk3b.payload.invoice.tomadorTelefone, "", "3B-ATTACK: não pode vazar telefone de db.guestAccounts");
    assert.equal(capturedDps23[0].tomador.email, "");
    assert.equal(capturedDps23[0].tomador.telefone, "");
    assert.equal(atk3b.payload.invoice.invoiceRecipientType, "guest");
    const r921 = db23.reservations.find((r) => r.id === 921);
    assert.equal(r921.requesterInfo, undefined, "3B-ATTACK: não pode mutar requesterInfo");

    // Test C: spoof em reserva com guestId=501 e guestDocument=""
    capturedDps23.length = 0;
    const testC = await callR23("POST /api/nfse/emit", {
      body: {
        reservationId: 922,
        invoiceRecipientType: "requester",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999111111",
        nfHideFromGuest: true,
        valorServico: 650,
      },
    });
    assert.equal(testC.status, 201);
    assert.equal(testC.payload.invoice.tomadorEmail, "");
    assert.equal(testC.payload.invoice.tomadorTelefone, "");
    assert.equal(testC.payload.invoice.invoiceRecipientType, "guest");
    const r922 = db23.reservations.find((r) => r.id === 922);
    assert.equal(r922.requesterInfo, undefined, "Test C: não pode mutar requesterInfo");

    // 2) 1C-ATTACK: emit-consolidated com tomadorEmail válido e nfDeliveryEmails contendo apenas email do hóspede
    capturedDps23.length = 0;
    const atk1c = await callR23("POST /api/nfse/emit-consolidated", {
      body: {
        packageCode: "PKG-923",
        tomadorEmail: "gestora@terceiro.com",
        nfDeliveryEmails: ["hospede.pessoal@gmail.com"],
        nfHideFromGuest: true,
      },
    });
    assert.equal(atk1c.status, 201);
    assert.equal(atk1c.payload.invoice.tomadorEmail, "gestora@terceiro.com", "1C-ATTACK: não pode apagar tomadorEmail válido");
    assert.equal(capturedDps23[0].tomador.email, "gestora@terceiro.com");
    assert.deepEqual(atk1c.payload.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);

    // 3) 1B & Test B: requester_pf com companyId=70 em pending-reservations e emit-batch (string + object)
    const pend23 = await callR23("GET /api/nfse/pending-reservations");
    assert.equal(pend23.status, 200);
    const p925 = pend23.payload.pendingReservations.find((x) => x.id === 925);
    assert.equal(p925.invoiceRecipientType, "requester", "Test B: pending-reservations não pode deixar companyId sequestrar requester_pf");
    assert.equal(p925.tomadorCpfCnpj, "11144477735");
    assert.equal(p925.tomadorEmail, "gestora@terceiro.com");

    capturedDps23.length = 0;
    const batch23 = await callR23("POST /api/nfse/emit-batch", {
      body: { items: [925, { reservationId: 926, invoiceRecipientType: "requester_pf" }] },
    });
    assert.equal(batch23.status, 200);
    assert.equal(batch23.payload.authorizedCount, 2);
    assert.equal(batch23.payload.results[0].invoice.invoiceRecipientType, "requester");
    assert.equal(batch23.payload.results[0].invoice.tomadorCpfCnpj, "11144477735");
    assert.equal(batch23.payload.results[0].invoice.tomadorEmail, "gestora@terceiro.com");
    assert.equal(batch23.payload.results[1].invoice.invoiceRecipientType, "requester");
    assert.equal(batch23.payload.results[1].invoice.tomadorCpfCnpj, "11144477735");
    assert.equal(batch23.payload.results[1].invoice.tomadorEmail, "gestora@terceiro.com");

    // 4) 3G-ATTACK: solicitante 504 apenas em db.guestAccounts (matchedRes=null) + enqueue/process retry
    capturedDps23.length = 0;
    const atk3g = await callR23("POST /api/nfse/emit", {
      body: {
        guestId: 504,
        invoiceRecipientType: "requester",
        tomadorNome: "Solicitante Digital Apenas",
        tomadorCpfCnpj: "22255588810",
        tomadorEmail: "sol504.digital@terceiro.com",
        tomadorTelefone: "2227445566",
        nfHideFromGuest: true,
        valorServico: 400,
      },
    });
    assert.equal(atk3g.status, 201);
    assert.equal(atk3g.payload.invoice.tomadorEmail, "sol504.digital@terceiro.com", "3G-ATTACK: solicitante apenas em guestAccounts não pode se auto-bloquear");
    assert.equal(atk3g.payload.invoice.tomadorTelefone, "2227445566");

    const retry3g = rt23.enqueueNfseRetry({
      guestId: 504,
      invoiceRecipientType: "requester",
      tomadorNome: "Solicitante Digital Apenas",
      tomadorCpfCnpj: "22255588810",
      tomadorEmail: "sol504.digital@terceiro.com",
      tomadorTelefone: "2227445566",
      nfHideFromGuest: true,
      valorServico: 420,
    }, "SEFIN timeout");
    const retried3g = await rt23.processSingleNfseRetryItem(retry3g);
    assert.equal(retried3g.ok, true);
    assert.equal(retried3g.invoice.tomadorEmail, "sol504.digital@terceiro.com");
    assert.equal(retried3g.invoice.tomadorTelefone, "2227445566");

    // 5) 1G-ATTACK: POST /api/nfse/replace/:id para notas órfãs (reservationId=null) sob nfHideFromGuest=true
    db23.invoices.push(
      {
        id: 992,
        numeroNfse: "2027000992",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 501,
        nfHideFromGuest: true,
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999111111",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "hospede.pessoal@gmail.com"],
        valorServico: 650,
        discriminacao: "Hospedagem",
      },
      {
        id: 993,
        numeroNfse: "2027000993",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 501,
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Gestora Terceira",
        tomadorCpfCnpj: "11144477735",
        tomadorEmail: "gestora@terceiro.com",
        tomadorTelefone: "2227112233",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "gestora@terceiro.com"],
        valorServico: 650,
        discriminacao: "Hospedagem",
      }
    );
    const rep992 = await callR23("POST /api/nfse/replace/:id", { params: { id: 992 }, body: {} });
    assert.equal(rep992.status, 200);
    assert.equal(rep992.payload.draft.tomadorEmail, "", "1G-ATTACK: nota órfã de hóspede deve mascarar email");
    assert.equal(rep992.payload.draft.tomadorTelefone, "", "1G-ATTACK: nota órfã de hóspede deve mascarar telefone");
    assert.deepEqual(rep992.payload.draft.nfDeliveryEmails, []);

    const rep993 = await callR23("POST /api/nfse/replace/:id", { params: { id: 993 }, body: {} });
    assert.equal(rep993.status, 200);
    assert.equal(rep993.payload.draft.tomadorEmail, "gestora@terceiro.com", "1G-ATTACK: nota órfã de solicitante terceiro preserva tomadorEmail");
    assert.equal(rep993.payload.draft.tomadorTelefone, "2227112233");
    assert.deepEqual(rep993.payload.draft.nfDeliveryEmails, ["gestora@terceiro.com"]);

    // 6) Test A: preservar ;-separated emails em matchedRes.requesterInfo.email para chat-service.mjs
    const emit927 = await callR23("POST /api/nfse/emit", {
      body: {
        reservationId: 927,
        invoiceRecipientType: "requester",
        tomadorNome: "Gestora Terceira",
        tomadorCpfCnpj: "11144477735",
        tomadorEmail: "gestora1@terceiro.com",
        tomadorTelefone: "2227112233",
        nfHideFromGuest: true,
        valorServico: 700,
      },
    });
    assert.equal(emit927.status, 201);
    const r927 = db23.reservations.find((r) => r.id === 927);
    assert.equal(r927.requesterInfo.email, "gestora1@terceiro.com; gestora2@terceiro.com");
    const draft927 = buildOfficialNfseDraftForReservation(
      { guests: db23.guests, guestAccounts: db23.guestAccounts, companies: db23.companies, agencies: db23.agencies, reservations: [], invoices: [] },
      { reservation: r927 }
    );
    assert.deepEqual(draft927.nfDeliveryEmails, ["gestora1@terceiro.com", "gestora2@terceiro.com"]);

    // 7) Challenger 2 Bug 1: resolveBoletoPayerData & emitCheckoutFaturadoPackage (single & consolidado) sob nfHideFromGuest=true
    const r928 = db23.reservations.find((r) => r.id === 928);
    const payer928Single = rt23.resolveBoletoPayerData(r928, "company", null);
    assert.equal(payer928Single.email, "fin1@acme.com", "resolveBoletoPayerData deve remover email pessoal do hóspede de company.financialEmail");
    const r930 = db23.reservations.find((r) => r.id === 930);
    const payer930ReqGuest1 = rt23.resolveBoletoPayerData(r930, "requester", null);
    assert.equal(payer930ReqGuest1.email, "", "resolveBoletoPayerData com requesterIsGuest1=true deve mascarar email");
    assert.notEqual(payer930ReqGuest1.telefone, "999111111", "resolveBoletoPayerData com requesterIsGuest1=true não pode vazar telefone do hóspede");
    assert.ok(!payer930ReqGuest1.telefone || payer930ReqGuest1.telefone === "999999999");

    capturedInterPayers23.length = 0;
    const fatPkg23 = await rt23.emitCheckoutFaturadoPackage(r928, {
      packageCode: "PKG-FAT23",
      consolidatePackage: true,
      emitNfse: true,
    });
    assert.equal(fatPkg23.boletos.length, 1);
    assert.equal(fatPkg23.boletos[0].payer.email, "fin1@acme.com");
    assert.equal(capturedInterPayers23[0].payer.email, "fin1@acme.com");

    // 8) Challenger 2 Bug 2 + Reviewer 2 note: emit-consolidated com agencyId + companyId e invoiceRecipientType="agency"
    capturedDps23.length = 0;
    const consAgCo = await callR23("POST /api/nfse/emit-consolidated", {
      body: { packageCode: "PKG-AG-CO-23" },
    });
    assert.equal(consAgCo.status, 201);
    assert.equal(consAgCo.payload.invoice.invoiceRecipientType, "agency", "emit-consolidated deve rotear para agency quando ambos agencyId e companyId existem e invoiceRecipientType==='agency'");
    assert.equal(consAgCo.payload.invoice.tomadorCpfCnpj, "11222333000181");
    assert.equal(consAgCo.payload.invoice.agencyId, 20);
    assert.equal(consAgCo.payload.invoice.companyId, null);
    assert.equal(consAgCo.payload.invoice.tomadorEmail, "ag1@flyb2b.com");

    // Reviewer 2 note: emit-consolidated com primaryRecType="requester" porém tomadorCpfCnpj do hóspede da estadia
    db23.reservations.push({
      id: 933,
      code: "RES-933",
      packageId: "PKG-REV2",
      packageCode: "PKG-REV2",
      flatId: 13,
      flatNumber: "113",
      checkinDate: "2027-10-20",
      checkoutDate: "2027-10-22",
      status: "confirmada",
      totalAmount: 500,
      guestId: 501,
      guestName: "Hóspede Estadia",
      guestDocument: "12345678909",
      guestEmail: "hospede.pessoal@gmail.com",
      guestPhone: "22999111111",
      requesterIsGuest1: false,
      invoiceRecipientType: "requester",
      requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227112233" },
      nfHideFromGuest: true,
    });
    const consRev2 = await callR23("POST /api/nfse/emit-consolidated", {
      body: {
        packageCode: "PKG-REV2",
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Hóspede Estadia",
        nfHideFromGuest: true,
      },
    });
    assert.equal(consRev2.status, 201);
    assert.equal(consRev2.payload.invoice.invoiceRecipientType, "guest", "Reviewer 2: emit-consolidated com CPF de hóspede não pode marcar invoiceRecipientType='requester'");
    assert.equal(consRev2.payload.invoice.tomadorEmail, "");
    assert.equal(consRev2.payload.invoice.tomadorTelefone, "");
  });

  it("24. Regressão Iteration 8b (Orphan replace NEW-V4a/E3, WhatsApp guest-phone leak & sibling hideFinancialForGuest, emit-consolidated explicit Company/3rd-party CNPJ override e supressão de 22999999999)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    const db24 = createIsolatedDb();
    db24.guests = [
      {
        id: 501,
        fullName: "Hóspede Estadia",
        name: "Hóspede Estadia",
        cpf: "12345678909",
        documentNumber: "12345678909",
        email: "hospede.pessoal@gmail.com",
        phone: "22998887766",
      },
      {
        id: 502,
        fullName: "Gestora Terceira",
        name: "Gestora Terceira",
        cpf: "11144477735",
        documentNumber: "11144477735",
        email: "gestora@terceiro.com",
        phone: "2227112233",
        tags: ["solicitante_terceiro"],
      },
      {
        id: 503,
        fullName: "Hóspede Flat Dois",
        name: "Hóspede Flat Dois",
        cpf: "98765432100",
        documentNumber: "98765432100",
        email: "flat2.stay@gmail.com",
        phone: "22998887744",
      },
      {
        // NEW-V4a: solicitante_terceiro sem CPF cadastrado no CRM
        id: 505,
        fullName: "Carlos Terceiro",
        name: "Carlos Terceiro",
        cpf: "",
        documentNumber: "",
        email: "carlos@terceiro.com",
        phone: "2227998877",
        tags: ["solicitante_terceiro"],
      },
    ];
    db24.guestAccounts = [
      {
        id: 1,
        guestId: 501,
        fullName: "Hóspede Estadia",
        documentNumber: "12345678909",
        email: "hospede.digital@gmail.com",
        phone: "22998887755",
      },
    ];
    db24.companies = [
      {
        id: 70,
        corporateName: "Acme Corp LTDA",
        tradeName: "Acme Corp",
        cnpj: "33000167000101",
        financialEmail: "hospede.pessoal@gmail.com; fin1@acme.com",
        phone: "22998887766",
        address: "Av. Rio Branco",
        number: "100",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "20040001",
      },
      {
        id: 71,
        corporateName: "Beta Sem Telefone LTDA",
        tradeName: "Beta LTDA",
        cnpj: "44000167000102",
        financialEmail: "fin@beta.com",
        phone: "",
        address: "Rua do Ouvidor",
        number: "50",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "20040030",
      },
    ];
    db24.agencies = [
      {
        id: 20,
        corporateName: "Fly B2B Viagens LTDA",
        tradeName: "Fly B2B",
        cnpj: "11222333000181",
        financialEmail: "ag1@flyb2b.com",
        phone: "1132220000",
        address: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        cep: "01310100",
      },
    ];
    db24.invoices = [
      {
        id: 992,
        numeroNfse: "2027992",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 501,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "guest",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.pessoal@gmail.com",
        tomadorTelefone: "22998887766",
        nfDeliveryEmails: ["hospede.pessoal@gmail.com", "hospede.digital@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
      {
        id: 994,
        numeroNfse: "2027994",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 505,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Carlos Terceiro",
        tomadorCpfCnpj: "44455566600",
        tomadorEmail: "carlos@terceiro.com",
        tomadorTelefone: "2227998877",
        nfDeliveryEmails: ["carlos@terceiro.com", "hospede.digital@gmail.com"],
        valorServico: 550,
        discriminacao: "Hospedagem",
      },
      {
        id: 995,
        numeroNfse: "2027995",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: null,
        guestName: null,
        nfHideFromGuest: true,
        invoiceRecipientType: "guest",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22998887755",
        nfDeliveryEmails: ["hospede.digital@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
      {
        id: 996,
        numeroNfse: "2027996",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        companyId: 70,
        guestId: 502,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "company",
        tomadorNome: "Acme Corp LTDA",
        tomadorCpfCnpj: "33000167000101",
        tomadorEmail: "fin1@acme.com",
        nfDeliveryEmails: ["gestora@terceiro.com", "hospede.digital@gmail.com"],
        valorServico: 700,
        discriminacao: "Hospedagem",
      },
    ];
    db24.reservations = [
      {
        id: 941,
        code: "RES-941",
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2027-11-01",
        checkoutDate: "2027-11-03",
        status: "checkout_realizado",
        totalAmount: 600,
        companyId: 70,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22998887766",
        nfHideFromGuest: true,
        isFaturadoBoleto: true,
        invoiceRecipientType: "company",
        financialResponsible: { name: "Resp Fin", email: "finresp@acme.com; hospede.digital@gmail.com", phone: "22998887755" },
        billingRecipients: { company: true, financialResponsible: true, sendEmail: true, sendWhatsapp: true },
      },
      // Pacote misto onde flat 1 tem nfHideFromGuest=false e flat 2 tem hideFinancialForGuest=true
      {
        id: 942,
        code: "RES-942",
        packageId: "PKG-MIX24",
        packageCode: "PKG-MIX24",
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2027-11-04",
        checkoutDate: "2027-11-06",
        status: "checkout_realizado",
        totalAmount: 500,
        companyId: 70,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22998887766",
        nfHideFromGuest: false,
        hideFinancialForGuest: false,
        isFaturadoBoleto: true,
        invoiceRecipientType: "company",
        billingRecipients: { guest: true, company: true, sendEmail: true, sendWhatsapp: true },
      },
      {
        id: 943,
        code: "RES-943",
        packageId: "PKG-MIX24",
        packageCode: "PKG-MIX24",
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2027-11-04",
        checkoutDate: "2027-11-06",
        status: "checkout_realizado",
        totalAmount: 500,
        companyId: 70,
        guestId: 503,
        guestName: "Hóspede Flat Dois",
        guestDocument: "98765432100",
        guestEmail: "flat2.stay@gmail.com",
        guestPhone: "22998887744",
        nfHideFromGuest: false,
        hideFinancialForGuest: true,
        isFaturadoBoleto: true,
        invoiceRecipientType: "company",
      },
      // Pacote B2B agency+company com invoiceRecipientType="agency" para testar override explícito de CNPJ
      {
        id: 944,
        code: "RES-944",
        packageId: "PKG-AG-CO-24",
        packageCode: "PKG-AG-CO-24",
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2027-11-07",
        checkoutDate: "2027-11-09",
        status: "confirmada",
        totalAmount: 800,
        agencyId: 20,
        companyId: 70,
        invoiceRecipientType: "agency",
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22998887766",
        nfHideFromGuest: true,
      },
      {
        id: 945,
        code: "RES-945",
        packageId: "PKG-AG-CO-24",
        packageCode: "PKG-AG-CO-24",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2027-11-07",
        checkoutDate: "2027-11-09",
        status: "confirmada",
        totalAmount: 800,
        agencyId: 20,
        companyId: 70,
        invoiceRecipientType: "agency",
        guestId: 503,
        guestName: "Hóspede Flat Dois",
        guestDocument: "98765432100",
        guestEmail: "flat2.stay@gmail.com",
        guestPhone: "22998887744",
        nfHideFromGuest: true,
      },
      // Reserva com empresa sem telefone para validar supressão do placeholder 22999999999
      {
        id: 946,
        code: "RES-946",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2027-11-10",
        checkoutDate: "2027-11-12",
        status: "checkout_realizado",
        totalAmount: 750,
        companyId: 71,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22998887766",
        nfHideFromGuest: true,
        isFaturadoBoleto: true,
        invoiceRecipientType: "company",
      },
      // Segundo pacote B2B agency+company para testar override com CNPJ de terceiro desconhecido
      {
        id: 947,
        code: "RES-947",
        packageId: "PKG-AG-CO-24B",
        packageCode: "PKG-AG-CO-24B",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2027-11-13",
        checkoutDate: "2027-11-15",
        status: "confirmada",
        totalAmount: 800,
        agencyId: 20,
        companyId: 70,
        invoiceRecipientType: "agency",
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.pessoal@gmail.com",
        guestPhone: "22998887766",
        nfHideFromGuest: true,
      },
      {
        id: 948,
        code: "RES-948",
        packageId: "PKG-AG-CO-24B",
        packageCode: "PKG-AG-CO-24B",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2027-11-13",
        checkoutDate: "2027-11-15",
        status: "confirmada",
        totalAmount: 800,
        agencyId: 20,
        companyId: 70,
        invoiceRecipientType: "agency",
        guestId: 503,
        guestName: "Hóspede Flat Dois",
        guestDocument: "98765432100",
        guestEmail: "flat2.stay@gmail.com",
        guestPhone: "22998887744",
        nfHideFromGuest: true,
      },
    ];

    const registered24 = {};
    const sentEmails24 = [];
    const sentWaMsgs24 = [];
    const sentWaDocs24 = [];
    const capturedDps24 = [];
    const appMock24 = {
      get: (p, h) => { registered24[`GET ${p}`] = h; },
      post: (p, h) => { registered24[`POST ${p}`] = h; },
    };

    const rt24 = new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, isPackageCode, buildNationalDpsPayload,
        normalizeInterBoletoPayer, onEmail, onWaMsg, onWaDoc, onDpsBuilt
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const isSyntheticAutoQuitacaoEntry = () => false;
      const isPackageItemCancelled = () => false;
      const isFaturadoBoletoReservation = (r) => Boolean(r?.isFaturadoBoleto);
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const createNotification = () => {};
      const applyCrmBillingConfigFields = () => {};
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const enrichBoletoDynamicStatus = (b) => b;
      const normalizeBoletoConsumptionMode = (m) => m || "single";
      const normalizePaymentMethodId = (m) => m || "boleto_faturado";
      const getBrasiliaDateStr = () => "2027-11-01";
      const addDaysToIsoDate = (_d, n) => "2027-11-" + String(1 + n).padStart(2, "0");
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const generateBoletoPdfBuffer = async () => Buffer.from("BOLPDF24");
      const generateNfsePdfBuffer = async () => Buffer.from("NFSEPDF24");
      const wrapEmailTemplate = ({ contentHtml }) => contentHtml;
      const sendEmailAsync = (o) => { onEmail(o); return { id: "em24", status: "sent" }; };
      const sendZapiMessage = async (_cfg, o) => { onWaMsg(o); return { success: true }; };
      const sendZapiDocument = async (_cfg, o) => { onWaDoc(o); return { success: true }; };
      const appendMessageToConversation = () => {};
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const issueInterBoleto = async (opts) => ({
        seuNumero: opts.seuNumero,
        nossoNumero: "0024",
        codigoSolicitacao: "SOL-24",
        codigoBarras: "077",
        linhaDigitavel: "07790",
        pixCopiaECola: "PIX24",
        txId: "TX24",
        provider: "inter_simulated",
        simulated: true,
        pagador: opts.payer,
      });
      const wrappedBuildNationalDpsPayload = (args) => {
        onDpsBuilt(args);
        return buildNationalDpsPayload(args);
      };
      const buildWrapped = (args) => wrappedBuildNationalDpsPayload(args);
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF24",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE24",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("doesBoletoCoverReservation")}
      ${extractFn("computeReservationAccommodationAndConsumption")}
      ${extractFn("resolveReservationCrmLinks")}
      ${extractFn("resolveReservationBillingRecipientsList")}
      ${extractFn("resolveBoletoPayerData")}
      ${extractFn("buildSinglePreBoletoFromReservation")}
      ${extractFn("syncBoletoWithAccountsReceivable")}
      ${extractFn("dispatchFaturadoBillingPackage")}
      ${extractFn("executeNfseEmissionInternal").replace(/buildNationalDpsPayload\(/g, "buildWrapped(")}
      ${extractFn("emitCheckoutFaturadoPackage")}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/replace/:id"')}
      return {
        resolveReservationBillingRecipientsList,
        buildSinglePreBoletoFromReservation,
        emitCheckoutFaturadoPackage,
      };
      `
    )({
      app: appMock24,
      db: db24,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      isPackageCode,
      buildNationalDpsPayload,
      normalizeInterBoletoPayer,
      onEmail: (o) => sentEmails24.push(o),
      onWaMsg: (o) => sentWaMsgs24.push(o),
      onWaDoc: (o) => sentWaDocs24.push(o),
      onDpsBuilt: (a) => capturedDps24.push(a),
    });

    const callR24 = async (key, { params = {}, query = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered24[key](
        { params, query, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 1) Orphaned replace/:id NEW-V4a (solicitante_terceiro sem CPF) & E3 (orphan company com solicitante_terceiro guestId) + 992/995 mascarados
    const rep992 = await callR24("POST /api/nfse/replace/:id", { params: { id: 992 }, body: {} });
    assert.equal(rep992.status, 200);
    assert.equal(rep992.payload.draft.tomadorEmail, "");
    assert.equal(rep992.payload.draft.tomadorTelefone, "");
    assert.deepEqual(rep992.payload.draft.nfDeliveryEmails, []);

    const rep995 = await callR24("POST /api/nfse/replace/:id", { params: { id: 995 }, body: {} });
    assert.equal(rep995.status, 200);
    assert.equal(rep995.payload.draft.tomadorEmail, "");
    assert.equal(rep995.payload.draft.tomadorTelefone, "");
    assert.deepEqual(rep995.payload.draft.nfDeliveryEmails, []);

    const rep994 = await callR24("POST /api/nfse/replace/:id", { params: { id: 994 }, body: {} });
    assert.equal(rep994.status, 200);
    assert.equal(rep994.payload.draft.tomadorEmail, "carlos@terceiro.com", "NEW-V4a: solicitante_terceiro sem CPF deve preservar tomadorEmail");
    assert.equal(rep994.payload.draft.tomadorTelefone, "2227998877");
    assert.deepEqual(rep994.payload.draft.nfDeliveryEmails, ["carlos@terceiro.com"]);

    const rep996 = await callR24("POST /api/nfse/replace/:id", { params: { id: 996 }, body: {} });
    assert.equal(rep996.status, 200);
    assert.equal(rep996.payload.draft.tomadorEmail, "fin1@acme.com");
    assert.deepEqual(rep996.payload.draft.nfDeliveryEmails, ["gestora@terceiro.com"], "E3: nota órfã company com guestId de solicitante_terceiro deve preservar gestora@terceiro.com");

    // 2a) resolveReservationBillingRecipientsList & emitCheckoutFaturadoPackage autoDispatch:true bloqueando telefones de hóspede/guestAccounts
    const r941 = db24.reservations.find((r) => r.id === 941);
    const rec941 = rt24.resolveReservationBillingRecipientsList(r941);
    assert.ok(rec941.recipients.every((c) => !String(c.phone || "").includes("998887766") && !String(c.phone || "").includes("998887755")), "Telefones pessoais do hóspede/guestAccounts devem ser removidos dos destinatários");
    assert.deepEqual(rec941.recipients.map((c) => c.email).sort(), ["fin1@acme.com", "finresp@acme.com"]);

    sentEmails24.length = 0;
    sentWaMsgs24.length = 0;
    sentWaDocs24.length = 0;
    const fat941 = await rt24.emitCheckoutFaturadoPackage(r941, { emitNfse: true, autoDispatch: true });
    assert.equal(fat941.boletos.length, 1);
    assert.deepEqual(sentEmails24.map((e) => e.recipient).sort(), ["fin1@acme.com", "finresp@acme.com"]);
    assert.equal(sentWaMsgs24.length, 0, "WhatsApp não pode ser disparado para telefone do hóspede ou guestAccounts colidindo com company/financialResponsible");
    assert.equal(sentWaDocs24.length, 0);

    // 2b) Pacote misto onde flat 2 tem hideFinancialForGuest=true (e flat 1 tem false) + buildSinglePreBoletoFromReservation com targetDb
    const r942 = db24.reservations.find((r) => r.id === 942);
    const recMix = rt24.resolveReservationBillingRecipientsList(r942);
    assert.ok(!recMix.recipients.some((c) => c.role === "guest"), "Sibling hideFinancialForGuest=true deve excluir destinatário guest");
    assert.ok(recMix.recipients.every((c) => !String(c.phone || "").includes("998887766") && !String(c.phone || "").includes("998887744")));
    const pre942 = rt24.buildSinglePreBoletoFromReservation(r942, db24);
    assert.equal(pre942.payerEmail, "fin1@acme.com");

    sentEmails24.length = 0;
    sentWaMsgs24.length = 0;
    sentWaDocs24.length = 0;
    await rt24.emitCheckoutFaturadoPackage(r942, { packageCode: "PKG-MIX24", consolidatePackage: true, emitNfse: true, autoDispatch: true });
    assert.deepEqual(sentEmails24.map((e) => e.recipient), ["fin1@acme.com"]);
    assert.equal(sentWaMsgs24.length, 0);
    assert.equal(sentWaDocs24.length, 0);

    // 3) POST /api/nfse/emit-consolidated explicit Company CNPJ override & explicit 3rd-party PJ CNPJ override
    capturedDps24.length = 0;
    const consCoOverride = await callR24("POST /api/nfse/emit-consolidated", {
      body: {
        packageCode: "PKG-AG-CO-24",
        tomadorCpfCnpj: "33.000.167/0001-01",
      },
    });
    assert.equal(consCoOverride.status, 201);
    assert.equal(consCoOverride.payload.invoice.invoiceRecipientType, "company");
    assert.equal(consCoOverride.payload.invoice.companyId, 70);
    assert.equal(consCoOverride.payload.invoice.agencyId, null);
    assert.equal(consCoOverride.payload.invoice.tomadorNome, "Acme Corp LTDA");
    assert.equal(consCoOverride.payload.invoice.tomadorEmail, "fin1@acme.com");

    const consThirdPj = await callR24("POST /api/nfse/emit-consolidated", {
      body: {
        packageCode: "PKG-AG-CO-24B",
        tomadorCpfCnpj: "99.888.777/0001-66",
        tomadorNome: "Terceiro PJ",
        tomadorEmail: "fin@terceiro.com",
      },
    });
    assert.equal(consThirdPj.status, 201);
    assert.equal(consThirdPj.payload.invoice.invoiceRecipientType, "company");
    assert.notEqual(consThirdPj.payload.invoice.companyId, 70, "CNPJ explícito de terceiro PJ não deve herdar companyId=70 da reserva");
    assert.equal(db24.companies.find((c) => c.id === consThirdPj.payload.invoice.companyId)?.cnpj, "99888777000166");
    assert.equal(consThirdPj.payload.invoice.agencyId, null);
    assert.equal(consThirdPj.payload.invoice.tomadorCpfCnpj, "99888777000166");
    assert.equal(consThirdPj.payload.invoice.tomadorNome, "Terceiro PJ");
    assert.equal(consThirdPj.payload.invoice.tomadorEmail, "fin@terceiro.com");
    assert.deepEqual(consThirdPj.payload.invoice.nfDeliveryEmails, ["fin@terceiro.com"]);

    // 4) Supressão explícita do placeholder sintético "22999999999" em emitCheckoutFaturadoPackage sob nfHideFromGuest=true
    capturedDps24.length = 0;
    const r946 = db24.reservations.find((r) => r.id === 946);
    const fat946 = await rt24.emitCheckoutFaturadoPackage(r946, { emitNfse: true, autoDispatch: false });
    assert.equal(fat946.invoice.tomadorTelefone, "", "Placeholder sintético 22999999999 não pode vazar para NFS-e sob nfHideFromGuest=true");
    assert.equal(capturedDps24[0].tomador.telefone, "");
  });

  it("25. Regressão Iteration 9b (Orphan replace spoof 998/999/1000 vs 994/996/997 e emit-consolidated 1-reserva explicit Company/3rd-party PJ override sem herdar agencyId/companyId)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    const db25 = createIsolatedDb();
    db25.guests = [
      {
        id: 501,
        fullName: "Hóspede Estadia",
        name: "Hóspede Estadia",
        cpf: "12345678909",
        documentNumber: "12345678909",
        email: "hospede.digital@gmail.com",
        phone: "22999887766",
      },
      {
        id: 502,
        fullName: "Gestora Terceira",
        name: "Gestora Terceira",
        cpf: "11144477735",
        documentNumber: "11144477735",
        email: "gestora@terceiro.com",
        phone: "2227001122",
        tags: ["solicitante_terceiro"],
      },
      {
        id: 505,
        fullName: "Carlos Terceiro",
        name: "Carlos Terceiro",
        cpf: "",
        documentNumber: "",
        email: "carlos@terceiro.com",
        phone: "2227998877",
        tags: ["solicitante_terceiro"],
      },
    ];
    db25.guestAccounts = [
      {
        id: 1,
        guestId: 501,
        fullName: "Hóspede Estadia",
        documentNumber: "12345678909",
        email: "hospede.conta@gmail.com",
        phone: "22999887766",
      },
      {
        // guestAccounts-only 3rd-party requester (997)
        id: 2,
        guestId: 506,
        fullName: "Julia Terceira",
        documentNumber: "",
        email: "julia@terceiro.com",
        phone: "2227889900",
      },
    ];
    db25.companies = [
      {
        id: 70,
        corporateName: "Acme Corp LTDA",
        tradeName: "Acme Corp",
        cnpj: "33000167000101",
        financialEmail: "fin@acme.com",
        phone: "2227001122",
        address: "Av. Rio Branco",
        number: "100",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "20040001",
      },
    ];
    db25.agencies = [
      {
        id: 20,
        corporateName: "Fly B2B Viagens LTDA",
        tradeName: "Fly B2B",
        cnpj: "11222333000181",
        financialEmail: "ag1@flyb2b.com",
        phone: "1132220000",
        address: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        cep: "01310100",
      },
    ];
    db25.invoices = [
      {
        id: 994,
        numeroNfse: "2027994",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 505,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Carlos Terceiro",
        tomadorCpfCnpj: "44455566600",
        tomadorEmail: "carlos@terceiro.com",
        tomadorTelefone: "2227998877",
        nfDeliveryEmails: ["carlos@terceiro.com", "hospede.digital@gmail.com"],
        valorServico: 550,
        discriminacao: "Hospedagem",
      },
      {
        id: 996,
        numeroNfse: "2027996",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        companyId: 70,
        guestId: 502,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "company",
        tomadorNome: "Acme Corp LTDA",
        tomadorCpfCnpj: "33000167000101",
        tomadorEmail: "fin@acme.com",
        tomadorTelefone: "2227001122",
        nfDeliveryEmails: ["gestora@terceiro.com", "hospede.digital@gmail.com"],
        valorServico: 700,
        discriminacao: "Hospedagem",
      },
      {
        id: 997,
        numeroNfse: "2027997",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 506,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Julia Terceira",
        tomadorCpfCnpj: "55566677788",
        tomadorEmail: "julia@terceiro.com",
        tomadorTelefone: "2227889900",
        nfDeliveryEmails: ["julia@terceiro.com", "hospede.conta@gmail.com"],
        valorServico: 600,
        discriminacao: "Hospedagem",
      },
      {
        // Spoof 998: guestId=501 (hóspede da estadia) com tomadorNome === guestName posando de requester
        id: 998,
        numeroNfse: "2027998",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 501,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999887766",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "hospede.conta@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
      {
        // Spoof 999: guestId=501 (hóspede da estadia) com CPF do hóspede e tomadorNome fake posando de requester
        id: 999,
        numeroNfse: "2027999",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 501,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Terceiro Fake",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999887766",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "hospede.conta@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
      {
        // Spoof 1000: guestId=null com guestName === tomadorNome posando de requester
        id: 1000,
        numeroNfse: "2028000",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: null,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999887766",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "hospede.conta@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
    ];
    db25.reservations = [
      {
        id: 914,
        code: "RES-914",
        flatId: 5,
        flatNumber: "105",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        status: "confirmada",
        totalAmount: 800,
        agencyId: 20,
        invoiceRecipientType: "agency",
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 915,
        code: "RES-915",
        flatId: 6,
        flatNumber: "106",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        status: "confirmada",
        totalAmount: 800,
        agencyId: 20,
        invoiceRecipientType: "agency",
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 916,
        code: "RES-916",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2026-11-13",
        checkoutDate: "2026-11-15",
        status: "confirmada",
        totalAmount: 900,
        agencyId: 20,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "agency",
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 917,
        code: "RES-917",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2026-11-16",
        checkoutDate: "2026-11-18",
        status: "confirmada",
        totalAmount: 500,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227001122" },
        nfHideFromGuest: true,
      },
    ];

    const registered25 = {};
    const appMock25 = {
      post: (p, h) => { registered25[`POST ${p}`] = h; },
    };

    new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, isPackageCode, buildNationalDpsPayload
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const isPackageItemCancelled = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF25",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE25",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("executeNfseEmissionInternal")}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/replace/:id"')}
      `
    )({
      app: appMock25,
      db: db25,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      isPackageCode,
      buildNationalDpsPayload,
    });

    const callR25 = async (key, { params = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered25[key](
        { params, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 1) Orphaned replace/:id spoof cases 998, 999, 1000 vs genuine 3rd-party 994, 996, 997
    for (const spoofId of [998, 999, 1000]) {
      const repSpoof = await callR25("POST /api/nfse/replace/:id", { params: { id: spoofId }, body: {} });
      assert.equal(repSpoof.status, 200);
      assert.equal(repSpoof.payload.draft.tomadorEmail, "", `Spoof ${spoofId}: não pode vazar email pessoal/conta do hóspede`);
      assert.equal(repSpoof.payload.draft.tomadorTelefone, "", `Spoof ${spoofId}: não pode vazar telefone do hóspede`);
      assert.deepEqual(repSpoof.payload.draft.nfDeliveryEmails, [], `Spoof ${spoofId}: nfDeliveryEmails deve estar vazio`);
    }

    const rep994 = await callR25("POST /api/nfse/replace/:id", { params: { id: 994 }, body: {} });
    assert.equal(rep994.status, 200);
    assert.equal(rep994.payload.draft.tomadorEmail, "carlos@terceiro.com");
    assert.equal(rep994.payload.draft.tomadorTelefone, "2227998877");
    assert.deepEqual(rep994.payload.draft.nfDeliveryEmails, ["carlos@terceiro.com"]);

    const rep996 = await callR25("POST /api/nfse/replace/:id", { params: { id: 996 }, body: {} });
    assert.equal(rep996.status, 200);
    assert.equal(rep996.payload.draft.tomadorEmail, "fin@acme.com");
    assert.equal(rep996.payload.draft.tomadorTelefone, "2227001122");
    assert.deepEqual(rep996.payload.draft.nfDeliveryEmails, ["gestora@terceiro.com"]);

    const rep997 = await callR25("POST /api/nfse/replace/:id", { params: { id: 997 }, body: {} });
    assert.equal(rep997.status, 200);
    assert.equal(rep997.payload.draft.tomadorEmail, "julia@terceiro.com");
    assert.equal(rep997.payload.draft.tomadorTelefone, "2227889900");
    assert.deepEqual(rep997.payload.draft.nfDeliveryEmails, ["julia@terceiro.com"]);

    // 2) 1-reservation emit-consolidated explicit Company CNPJ override (agencyId: 20 -> null, companyId: 70)
    const consSingleCo = await callR25("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [914],
        tomadorCpfCnpj: "33.000.167/0001-01",
      },
    });
    assert.equal(consSingleCo.status, 201);
    assert.equal(consSingleCo.payload.invoice.invoiceRecipientType, "company");
    assert.equal(consSingleCo.payload.invoice.companyId, 70);
    assert.equal(consSingleCo.payload.invoice.agencyId, null, "1-reserva emit-consolidated para Company não pode herdar agencyId=20");
    assert.equal(db25.reservations.find((r) => r.id === 914).agencyId, 20, "Reserva 914 mantém agencyId=20");

    // 3) 1-reservation emit-consolidated explicit 3rd-party PJ CNPJ override with matchedRes having BOTH agencyId: 20 AND companyId: 70
    const consSinglePjBoth = await callR25("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [916],
        tomadorCpfCnpj: "99.888.777/0001-66",
        tomadorNome: "Terceira PJ LTDA",
        tomadorEmail: "fin@terceirapj.com",
      },
    });
    assert.equal(consSinglePjBoth.status, 201);
    assert.equal(consSinglePjBoth.payload.invoice.invoiceRecipientType, "company");
    assert.equal(consSinglePjBoth.payload.invoice.agencyId, null, "1-reserva emit-consolidated para 3ª PJ não pode herdar agencyId=20");
    assert.notEqual(consSinglePjBoth.payload.invoice.companyId, 70, "Não pode associar CNPJ 99888777000166 à Company 70");
    const created3rdCo = db25.companies.find((c) => c.id === consSinglePjBoth.payload.invoice.companyId);
    assert.equal(created3rdCo?.cnpj, "99888777000166");
    assert.equal(created3rdCo?.companyRole, "invoice_only");
    assert.equal(db25.companies.find((c) => c.id === 70)?.cnpj, "33000167000101", "Company 70 CNPJ deve permanecer intacto");
    const r916 = db25.reservations.find((r) => r.id === 916);
    assert.equal(r916.agencyId, 20);
    assert.equal(r916.companyId, 70);
    assert.equal(r916.companyCnpj, "33000167000101");
    assert.equal(r916.invoiceRecipientType, "agency");

    // 4) 1-reservation emit-consolidated explicit 3rd-party PJ CNPJ override with matchedRes having agencyId: 20 only
    const consSinglePjOnlyAg = await callR25("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [915],
        tomadorCpfCnpj: "99.888.777/0001-66",
        tomadorNome: "Terceira PJ LTDA",
        tomadorEmail: "fin@terceirapj.com",
      },
    });
    assert.equal(consSinglePjOnlyAg.status, 201);
    assert.equal(consSinglePjOnlyAg.payload.invoice.invoiceRecipientType, "company");
    assert.equal(consSinglePjOnlyAg.payload.invoice.agencyId, null, "1-reserva emit-consolidated para 3ª PJ não pode herdar agencyId=20");
    assert.notEqual(consSinglePjOnlyAg.payload.invoice.companyId, 70);
    assert.equal(consSinglePjOnlyAg.payload.invoice.companyId, created3rdCo.id);

    // 5) Stay-guest CPF spoof rejection on 1-reservation emit-consolidated
    const consSpoof = await callR25("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [917],
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Hóspede Estadia",
        nfHideFromGuest: true,
      },
    });
    assert.equal(consSpoof.status, 201);
    assert.equal(consSpoof.payload.invoice.invoiceRecipientType, "guest");
    assert.equal(consSpoof.payload.invoice.tomadorEmail, "");
    assert.equal(consSpoof.payload.invoice.tomadorTelefone, "");
    assert.deepEqual(consSpoof.payload.invoice.nfDeliveryEmails, []);
  });

  it("26. Regressão Iteration 10b (REPLACE_1001/1002 placeholder Hóspede vs 994/996/997, emit-consolidated override nfDeliveryEmails isolation CONS_SINGLE_3RDPJ & ADV_E7_AG_PLUS_COID, e ADV_E4_REQ_PLUS_COID)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    const db26 = createIsolatedDb();
    db26.guests = [
      {
        id: 501,
        fullName: "Hóspede Estadia",
        name: "Hóspede Estadia",
        cpf: "12345678909",
        documentNumber: "12345678909",
        email: "hospede.digital@gmail.com",
        phone: "22999887766",
      },
      {
        id: 502,
        fullName: "Gestora Terceira",
        name: "Gestora Terceira",
        cpf: "11144477735",
        documentNumber: "11144477735",
        email: "gestora@terceiro.com",
        phone: "2227001122",
        tags: ["solicitante_terceiro"],
      },
      {
        id: 505,
        fullName: "Carlos Terceiro",
        name: "Carlos Terceiro",
        cpf: "",
        documentNumber: "",
        email: "carlos@terceiro.com",
        phone: "2227998877",
        tags: ["solicitante_terceiro"],
      },
    ];
    db26.guestAccounts = [
      {
        id: 1,
        guestId: 501,
        fullName: "Hóspede Estadia",
        documentNumber: "12345678909",
        email: "hospede.conta@gmail.com",
        phone: "22999887766",
      },
      {
        id: 2,
        guestId: 506,
        fullName: "Julia Terceira",
        documentNumber: "",
        email: "julia@terceiro.com",
        phone: "2227889900",
      },
    ];
    db26.companies = [
      {
        id: 70,
        corporateName: "Acme Corp LTDA",
        tradeName: "Acme Corp",
        cnpj: "33000167000101",
        financialEmail: "fin@acme.com",
        phone: "2227001122",
        address: "Av. Rio Branco",
        number: "100",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "20040001",
      },
    ];
    db26.agencies = [
      {
        id: 20,
        corporateName: "Fly B2B Viagens LTDA",
        tradeName: "Fly B2B",
        cnpj: "11222333000181",
        financialEmail: "ag1@flyb2b.com",
        phone: "1132220000",
        address: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        cep: "01310100",
      },
    ];
    db26.invoices = [
      {
        id: 994,
        numeroNfse: "2027994",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 505,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Carlos Terceiro",
        tomadorCpfCnpj: "44455566600",
        tomadorEmail: "carlos@terceiro.com",
        tomadorTelefone: "2227998877",
        nfDeliveryEmails: ["carlos@terceiro.com", "hospede.digital@gmail.com"],
        valorServico: 550,
        discriminacao: "Hospedagem",
      },
      {
        id: 996,
        numeroNfse: "2027996",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        companyId: 70,
        guestId: 502,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "company",
        tomadorNome: "Acme Corp LTDA",
        tomadorCpfCnpj: "33000167000101",
        tomadorEmail: "fin@acme.com",
        tomadorTelefone: "2227001122",
        nfDeliveryEmails: ["gestora@terceiro.com", "hospede.digital@gmail.com"],
        valorServico: 700,
        discriminacao: "Hospedagem",
      },
      {
        id: 997,
        numeroNfse: "2027997",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 506,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Julia Terceira",
        tomadorCpfCnpj: "55566677788",
        tomadorEmail: "julia@terceiro.com",
        tomadorTelefone: "2227889900",
        nfDeliveryEmails: ["julia@terceiro.com", "hospede.conta@gmail.com"],
        valorServico: 600,
        discriminacao: "Hospedagem",
      },
      {
        id: 1001,
        numeroNfse: "2028001",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 501,
        guestName: "Hóspede",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999887766",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "hospede.conta@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
      {
        id: 1002,
        numeroNfse: "2028002",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: null,
        guestName: "Hóspede",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Hóspede Estadia",
        tomadorCpfCnpj: "12345678909",
        tomadorEmail: "hospede.digital@gmail.com",
        tomadorTelefone: "22999887766",
        nfDeliveryEmails: ["hospede.digital@gmail.com", "hospede.conta@gmail.com"],
        valorServico: 500,
        discriminacao: "Hospedagem",
      },
    ];
    db26.reservations = [
      {
        id: 916,
        code: "RES-916",
        flatId: 7,
        flatNumber: "107",
        checkinDate: "2026-11-13",
        checkoutDate: "2026-11-15",
        status: "confirmada",
        totalAmount: 900,
        agencyId: 20,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "agency",
        nfDeliveryEmails: ["fin@acme.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 922,
        code: "RES-922",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-17",
        status: "confirmada",
        totalAmount: 950,
        agencyId: 20,
        invoiceRecipientType: "agency",
        nfDeliveryEmails: ["ag1@flyb2b.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 921,
        code: "RES-921",
        flatId: 9,
        flatNumber: "109",
        checkinDate: "2026-11-18",
        checkoutDate: "2026-11-20",
        status: "confirmada",
        totalAmount: 650,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227001122" },
        nfDeliveryEmails: ["gestora@terceiro.com"],
        nfHideFromGuest: true,
      },
      {
        id: 924,
        code: "RES-924",
        flatId: 10,
        flatNumber: "110",
        checkinDate: "2026-11-21",
        checkoutDate: "2026-11-23",
        status: "confirmada",
        totalAmount: 750,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "company",
        nfDeliveryEmails: ["custom@acme.com", "fin@acme.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 925,
        code: "RES-925",
        flatId: 11,
        flatNumber: "111",
        checkinDate: "2026-11-24",
        checkoutDate: "2026-11-26",
        status: "confirmada",
        totalAmount: 600,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227001122" },
        nfDeliveryEmails: ["gestora@terceiro.com"],
        nfHideFromGuest: true,
      },
    ];

    const registered26 = {};
    const appMock26 = {
      post: (p, h) => { registered26[`POST ${p}`] = h; },
    };

    new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, isPackageCode, buildNationalDpsPayload
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const isPackageItemCancelled = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF26",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE26",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("executeNfseEmissionInternal")}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/replace/:id"')}
      `
    )({
      app: appMock26,
      db: db26,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      isPackageCode,
      buildNationalDpsPayload,
    });

    const callR26 = async (key, { params = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered26[key](
        { params, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 1) REPLACE_1001 & REPLACE_1002: guestName: "Hóspede" placeholder deve mascarar e-mail pessoal, guestAccounts e telefone
    for (const id of [1001, 1002]) {
      const rep = await callR26("POST /api/nfse/replace/:id", { params: { id }, body: {} });
      assert.equal(rep.status, 200);
      assert.equal(rep.payload.draft.tomadorEmail, "", `REPLACE_${id}: não pode vazar e-mail do hóspede/guestAccounts`);
      assert.equal(rep.payload.draft.tomadorTelefone, "", `REPLACE_${id}: não pode vazar telefone do hóspede`);
      assert.deepEqual(rep.payload.draft.nfDeliveryEmails, [], `REPLACE_${id}: nfDeliveryEmails deve estar vazio`);
    }

    // Preservação 994 (NEW-V4a), 996 (E3) e 997 (guestAccounts-only 3rd-party requester)
    const rep994 = await callR26("POST /api/nfse/replace/:id", { params: { id: 994 }, body: {} });
    assert.equal(rep994.status, 200);
    assert.equal(rep994.payload.draft.tomadorEmail, "carlos@terceiro.com");
    assert.equal(rep994.payload.draft.tomadorTelefone, "2227998877");
    assert.deepEqual(rep994.payload.draft.nfDeliveryEmails, ["carlos@terceiro.com"]);

    const rep996 = await callR26("POST /api/nfse/replace/:id", { params: { id: 996 }, body: {} });
    assert.equal(rep996.status, 200);
    assert.equal(rep996.payload.draft.tomadorEmail, "fin@acme.com");
    assert.equal(rep996.payload.draft.tomadorTelefone, "2227001122");
    assert.deepEqual(rep996.payload.draft.nfDeliveryEmails, ["gestora@terceiro.com"]);

    const rep997 = await callR26("POST /api/nfse/replace/:id", { params: { id: 997 }, body: {} });
    assert.equal(rep997.status, 200);
    assert.equal(rep997.payload.draft.tomadorEmail, "julia@terceiro.com");
    assert.equal(rep997.payload.draft.tomadorTelefone, "2227889900");
    assert.deepEqual(rep997.payload.draft.nfDeliveryEmails, ["julia@terceiro.com"]);

    // 2a) CONS_SINGLE_3RDPJ: primaryRes.nfDeliveryEmails: ["fin@acme.com"] NÃO pode vazar ao sobrescrever tomador p/ 3ª PJ
    const cons3rdPj = await callR26("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [916],
        tomadorCpfCnpj: "99.888.777/0001-66",
        tomadorNome: "Terceira PJ LTDA",
        tomadorEmail: "fin1@terceira.com; fin2@terceira.com",
      },
    });
    assert.equal(cons3rdPj.status, 201);
    assert.equal(cons3rdPj.payload.invoice.invoiceRecipientType, "company");
    assert.equal(cons3rdPj.payload.invoice.agencyId, null);
    assert.notEqual(cons3rdPj.payload.invoice.companyId, 70);
    assert.equal(cons3rdPj.payload.invoice.tomadorEmail, "fin1@terceira.com");
    assert.deepEqual(cons3rdPj.payload.invoice.nfDeliveryEmails, ["fin1@terceira.com", "fin2@terceira.com"]);

    // 2b) ADV_E7_AG_PLUS_COID: Agency 20 (ag1@flyb2b.com) -> companyId: 70 -> apenas ["fin@acme.com"], sem vazar ag1@flyb2b.com
    const advE7 = await callR26("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [922],
        companyId: 70,
      },
    });
    assert.equal(advE7.status, 201);
    assert.equal(advE7.payload.invoice.invoiceRecipientType, "company");
    assert.equal(advE7.payload.invoice.companyId, 70);
    assert.equal(advE7.payload.invoice.agencyId, null);
    assert.equal(advE7.payload.invoice.tomadorCpfCnpj, "33000167000101");
    assert.equal(advE7.payload.invoice.tomadorEmail, "fin@acme.com");
    assert.deepEqual(advE7.payload.invoice.nfDeliveryEmails, ["fin@acme.com"]);

    // 2c) Emissão normal (sem override de tomador) continua mesclando primaryRes.nfDeliveryEmails
    const consNormal = await callR26("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [924],
      },
    });
    assert.equal(consNormal.status, 201);
    assert.equal(consNormal.payload.invoice.companyId, 70);
    assert.deepEqual(consNormal.payload.invoice.nfDeliveryEmails, ["fin@acme.com", "custom@acme.com"]);

    // 3) ADV_E4_REQ_PLUS_COID: reserva "requester" + companyId: 70 explícito sem tomadorCpfCnpj -> roteia p/ Company 70
    const advE4 = await callR26("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [921],
        companyId: 70,
      },
    });
    assert.equal(advE4.status, 201);
    assert.equal(advE4.payload.invoice.invoiceRecipientType, "company");
    assert.equal(advE4.payload.invoice.companyId, 70);
    assert.equal(advE4.payload.invoice.agencyId, null);
    assert.equal(advE4.payload.invoice.tomadorCpfCnpj, "33000167000101");
    assert.equal(advE4.payload.invoice.tomadorNome, "Acme Corp LTDA");
    assert.deepEqual(advE4.payload.invoice.nfDeliveryEmails, ["fin@acme.com"]);

    // Reserva "requester" sem companyId/agencyId/tomadorCpfCnpj continua roteando p/ solicitante PF
    const reqDefault = await callR26("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [925],
      },
    });
    assert.equal(reqDefault.status, 201);
    assert.equal(reqDefault.payload.invoice.invoiceRecipientType, "requester");
    assert.equal(reqDefault.payload.invoice.companyId, null);
    assert.equal(reqDefault.payload.invoice.tomadorCpfCnpj, "11144477735");
    assert.deepEqual(reqDefault.payload.invoice.nfDeliveryEmails, ["gestora@terceiro.com"]);
  });

  it("27. Regressão Iteration 11b (overrides de tomador sem e-mail em emit-consolidated sem vazamento/poluição CRM + REPLACE_1009 guestAccounts)", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const extractRouteBlock = (marker) => {
      const start = demoSrc.indexOf(marker);
      assert.ok(start >= 0, `Rota não encontrada: ${marker}`);
      let i = demoSrc.indexOf("=>", start);
      i = demoSrc.indexOf("{", i);
      let d = 0;
      for (; i < demoSrc.length; i++) {
        if (demoSrc[i] === "{") d++;
        else if (demoSrc[i] === "}") {
          d--;
          if (d === 0) {
            let endPos = i + 1;
            while (endPos < demoSrc.length && /[\s);]/.test(demoSrc[endPos])) {
              endPos++;
              if (demoSrc[endPos - 1] === ";") break;
            }
            return demoSrc.slice(start, endPos);
          }
        }
      }
      throw new Error(`Bloco não fechado para ${marker}`);
    };
    const extractFn = (name) => {
      const asyncSig = `async function ${name}(`;
      const exportAsyncSig = `export async function ${name}(`;
      const sig = `function ${name}(`;
      let s = demoSrc.indexOf(exportAsyncSig);
      if (s === -1) s = demoSrc.indexOf(asyncSig);
      if (s === -1) s = demoSrc.indexOf(sig);
      assert.ok(s >= 0, `Função ${name} não encontrada`);
      const bodySrc = demoSrc.slice(s).replace(/^export\s+/, "");
      const open = bodySrc.indexOf(") {") + 2;
      let d = 0;
      let e = open;
      for (; e < bodySrc.length; e++) {
        if (bodySrc[e] === "{") d++;
        else if (bodySrc[e] === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return bodySrc.slice(0, e + 1);
    };

    const db27 = createIsolatedDb();
    db27.guests = [
      {
        id: 501,
        fullName: "Hóspede Estadia",
        name: "Hóspede Estadia",
        cpf: "12345678909",
        documentNumber: "12345678909",
        email: "hospede.digital@gmail.com",
        phone: "22999887766",
      },
      {
        id: 502,
        fullName: "Gestora Terceira",
        name: "Gestora Terceira",
        cpf: "11144477735",
        documentNumber: "11144477735",
        email: "gestora@terceiro.com",
        phone: "2227001122",
        tags: ["solicitante_terceiro"],
      },
      {
        id: 508,
        fullName: "Maria SemCpf",
        name: "Maria SemCpf",
        cpf: "",
        documentNumber: "",
        email: "maria.semcpf@gmail.com",
        phone: "22977665544",
      },
    ];
    db27.guestAccounts = [
      {
        id: 1,
        guestId: 501,
        fullName: "Hóspede Estadia",
        documentNumber: "12345678909",
        email: "hospede.conta@gmail.com",
        phone: "22999887766",
      },
      {
        id: 2,
        guestId: 506,
        fullName: "Julia Terceira",
        documentNumber: "",
        email: "julia@terceiro.com",
        phone: "2227889900",
      },
      {
        id: 3,
        guestId: 508,
        fullName: "Maria SemCpf",
        documentNumber: "22233344455",
        email: "maria.conta@gmail.com",
        phone: "22977665544",
      },
    ];
    db27.companies = [
      {
        id: 70,
        corporateName: "Acme Corp LTDA",
        tradeName: "Acme Corp",
        cnpj: "33000167000101",
        financialEmail: "fin@acme.com",
        phone: "2227001122",
        address: "Av. Rio Branco",
        number: "100",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "20040001",
      },
      {
        id: 75,
        corporateName: "Beta Sem Email LTDA",
        tradeName: "Beta Sem Email",
        cnpj: "55444333000122",
        financialEmail: "",
        phone: "2227112233",
        address: "Rua Sete",
        number: "50",
        neighborhood: "Centro",
        city: "Campos dos Goytacazes",
        state: "RJ",
        cep: "28010000",
      },
    ];
    db27.agencies = [
      {
        id: 20,
        corporateName: "Fly B2B Viagens LTDA",
        tradeName: "Fly B2B",
        cnpj: "11222333000181",
        financialEmail: "ag1@flyb2b.com",
        phone: "1132220000",
        address: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        cep: "01310100",
      },
      {
        id: 21,
        corporateName: "Agencia Sem Email LTDA",
        tradeName: "Agencia Sem Email",
        cnpj: "22333444000199",
        financialEmail: "",
        phone: "1133334444",
        address: "Av. Faria Lima",
        number: "200",
        neighborhood: "Itaim Bibi",
        city: "São Paulo",
        state: "SP",
        cep: "04538132",
      },
    ];
    db27.invoices = [
      {
        id: 997,
        numeroNfse: "2027997",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: 506,
        guestName: "Hóspede Estadia",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Julia Terceira",
        tomadorCpfCnpj: "55566677788",
        tomadorEmail: "julia@terceiro.com",
        tomadorTelefone: "2227889900",
        nfDeliveryEmails: ["julia@terceiro.com", "hospede.conta@gmail.com"],
        valorServico: 600,
        discriminacao: "Hospedagem",
      },
      {
        id: 1009,
        numeroNfse: "2028009",
        status: "autorizada",
        reservationId: null,
        reservationCode: null,
        guestId: null,
        guestName: "Hóspede",
        nfHideFromGuest: true,
        invoiceRecipientType: "requester",
        tomadorNome: "Maria SemCpf",
        tomadorCpfCnpj: "22233344455",
        tomadorEmail: "maria.semcpf@gmail.com",
        tomadorTelefone: "22977665544",
        nfDeliveryEmails: ["maria.semcpf@gmail.com", "maria.conta@gmail.com"],
        valorServico: 520,
        discriminacao: "Hospedagem",
      },
    ];
    db27.reservations = [
      {
        id: 917,
        code: "RES-917",
        flatId: 8,
        flatNumber: "108",
        checkinDate: "2026-11-16",
        checkoutDate: "2026-11-18",
        status: "confirmada",
        totalAmount: 500,
        agencyId: 20,
        invoiceRecipientType: "agency",
        nfDeliveryEmails: ["ag1@flyb2b.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 921,
        code: "RES-921",
        flatId: 9,
        flatNumber: "109",
        checkinDate: "2026-11-18",
        checkoutDate: "2026-11-20",
        status: "confirmada",
        totalAmount: 650,
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        requesterIsGuest1: false,
        invoiceRecipientType: "requester",
        requesterInfo: { guestId: 502, name: "Gestora Terceira", cpf: "11144477735", email: "gestora@terceiro.com", phone: "2227001122" },
        nfDeliveryEmails: ["gestora@terceiro.com"],
        nfHideFromGuest: true,
      },
      {
        id: 924,
        code: "RES-924",
        flatId: 10,
        flatNumber: "110",
        checkinDate: "2026-11-21",
        checkoutDate: "2026-11-23",
        status: "confirmada",
        totalAmount: 750,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "company",
        nfDeliveryEmails: ["custom@acme.com", "fin@acme.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 926,
        code: "RES-926",
        flatId: 12,
        flatNumber: "112",
        checkinDate: "2026-11-27",
        checkoutDate: "2026-11-29",
        status: "confirmada",
        totalAmount: 720,
        agencyId: 20,
        invoiceRecipientType: "agency",
        nfDeliveryEmails: ["ag1@flyb2b.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 927,
        code: "RES-927",
        flatId: 13,
        flatNumber: "113",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        status: "confirmada",
        totalAmount: 820,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "company",
        nfDeliveryEmails: ["fin@acme.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
      {
        id: 928,
        code: "RES-928",
        flatId: 14,
        flatNumber: "114",
        checkinDate: "2026-12-04",
        checkoutDate: "2026-12-06",
        status: "confirmada",
        totalAmount: 840,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "company",
        nfDeliveryEmails: ["fin@acme.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: false,
      },
      {
        id: 930,
        code: "RES-930",
        flatId: 15,
        flatNumber: "115",
        checkinDate: "2026-12-07",
        checkoutDate: "2026-12-09",
        status: "confirmada",
        totalAmount: 680,
        companyId: 70,
        companyCnpj: "33000167000101",
        invoiceRecipientType: "company",
        nfDeliveryEmails: ["fin@acme.com"],
        guestId: 501,
        guestName: "Hóspede Estadia",
        guestDocument: "12345678909",
        guestEmail: "hospede.digital@gmail.com",
        guestPhone: "22999887766",
        nfHideFromGuest: true,
      },
    ];

    const registered27 = {};
    const appMock27 = {
      post: (p, h) => { registered27[`POST ${p}`] = h; },
    };

    new Function(
      "deps",
      `
      const {
        app, db, crypto, path, fs, parseEmailList, validateEmailList, formatEmailList, getPrimaryEmail,
        isPackageItemActive, getPackageReservations, isPackageCode, buildNationalDpsPayload
      } = deps;
      const process = { env: { NODE_ENV: "production" }, cwd: () => "." };
      const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
      const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
      const cleanCep = (v) => String(v || "").replace(/\\D/g, "");
      const toTitleCase = (s) => String(s || "");
      const isValidCpf = () => true;
      const isValidBrazilianCpf = () => true;
      const isValidCnpj = () => true;
      const formatCnpj = (c) => c;
      const isPreReservationBlocked = () => false;
      const isGenericFallbackAddress = () => false;
      const isGenericPelincaAddr = () => false;
      const isGenericPelincaBairro = () => false;
      const isGenericPelincaCep = () => false;
      const isGenericPelincaCompanyAddress = () => false;
      const isInternalOrForbiddenGuestPhone = () => false;
      const isPackageItemCancelled = () => false;
      const resolveKnownCnpjDirectory = () => null;
      const enrichCrmEntityWithCnpjData = () => {};
      const lookupCnpj = async () => null;
      const saveDatabase = () => {};
      const logAuditEvent = () => {};
      const getFiscalData = () => {};
      const getAuthUser = () => ({ id: 1, role: "admin" });
      const enableAutoEmitInvoiceForGuestAndReservations = () => {};
      const findExistingInvoiceForReservation = () => null;
      const buildB2bNfseDescription = () => "Serviço de hospedagem";
      const normalizeTomadorAddressFields = (o) => ({
        logradouro: o.tomadorEndereco || o.tomadorStreet || "",
        numero: o.tomadorNumero || "",
        complemento: o.tomadorComplemento || "",
        bairro: o.tomadorBairro || "",
        cep: o.tomadorCep || "",
        cidade: o.tomadorCidade || "",
        uf: o.tomadorUf || "",
        ibge: o.tomadorCodigoMunicipio || "3301009",
      });
      const resolveValidCepAndIbge = async (x) => x;
      const findNfseInvoiceByAnyId = (id) => (db.invoices || []).find(i => String(i.id) === String(id) || String(i.numeroNfse) === String(id));
      const processNationalInvoiceEmission = async ({ invoiceData }) => ({
        success: true,
        status: "autorizada",
        numeroNfse: "2027" + String(invoiceData?.numeroDps || "001"),
        codigoVerificacao: "VERIF27",
        chaveAcesso: invoiceData?.chaveAcesso || "CHAVE27",
        protocoloAutorizacao: "SEFIN_OK",
      });
      ${extractFn("resolveGuestDigitalCheckinData")}
      ${extractFn("collectReservationGuestPersonalEmails")}
      ${extractFn("collectReservationGuestPersonalPhones")}
      ${extractFn("isGuestPersonalPhone")}
      ${extractFn("executeNfseEmissionInternal")}
      ${extractRouteBlock('app.post("/api/nfse/emit-consolidated"')}
      ${extractRouteBlock('app.post("/api/nfse/replace/:id"')}
      `
    )({
      app: appMock27,
      db: db27,
      crypto,
      path,
      fs,
      parseEmailList,
      validateEmailList,
      formatEmailList,
      getPrimaryEmail,
      isPackageItemActive,
      getPackageReservations,
      isPackageCode,
      buildNationalDpsPayload,
    });

    const callR27 = async (key, { params = {}, body = {} } = {}) => {
      let status = 200;
      let payload = null;
      await registered27[key](
        { params, body, protocol: "https", get: () => "corpflats.com.br", user: { role: "admin" } },
        { status(s) { status = s; return this; }, json(p) { payload = p; return this; } }
      );
      return { status, payload };
    };

    // 1) CONS_SPOOF (917 Agency 20 -> stay-guest CPF sem tomadorEmail): não pode vazar ag1@flyb2b.com
    const consSpoof = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [917],
        tomadorCpfCnpj: "12345678909",
        tomadorNome: "Hóspede Estadia",
        nfHideFromGuest: true,
      },
    });
    assert.equal(consSpoof.status, 201);
    assert.equal(consSpoof.payload.invoice.invoiceRecipientType, "guest");
    assert.equal(consSpoof.payload.invoice.tomadorEmail, "");
    assert.equal(consSpoof.payload.invoice.tomadorTelefone, "");
    assert.deepEqual(consSpoof.payload.invoice.nfDeliveryEmails, []);

    // 2) ADV_OVERRIDE_EMPTY_EMAIL_CO (926 Agency 20 -> companyId 75 sem financialEmail)
    const advEmptyCo = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [926],
        companyId: 75,
      },
    });
    assert.equal(advEmptyCo.status, 201);
    assert.equal(advEmptyCo.payload.invoice.invoiceRecipientType, "company");
    assert.equal(advEmptyCo.payload.invoice.companyId, 75);
    assert.equal(advEmptyCo.payload.invoice.agencyId, null);
    assert.equal(advEmptyCo.payload.invoice.tomadorEmail, "");
    assert.deepEqual(advEmptyCo.payload.invoice.nfDeliveryEmails, []);

    // 3) ADV_OVERRIDE_EMPTY_EMAIL_3RDPJ (927 Company 70 -> 3ª PJ sem tomadorEmail, nfHideFromGuest: true) + zero poluição CRM
    const advEmpty3rdPj = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [927],
        tomadorCpfCnpj: "99.888.777/0001-66",
        tomadorNome: "Terceira Sem Email LTDA",
      },
    });
    assert.equal(advEmpty3rdPj.status, 201);
    assert.equal(advEmpty3rdPj.payload.invoice.invoiceRecipientType, "company");
    assert.equal(advEmpty3rdPj.payload.invoice.tomadorEmail, "");
    assert.equal(advEmpty3rdPj.payload.invoice.tomadorTelefone, "");
    assert.deepEqual(advEmpty3rdPj.payload.invoice.nfDeliveryEmails, []);
    const created3rdCo1 = db27.companies.find((c) => c.id === advEmpty3rdPj.payload.invoice.companyId);
    assert.ok(created3rdCo1 && created3rdCo1.id !== 70);
    assert.equal(created3rdCo1.financialEmail, "", "Nova empresa invoice_only não pode herdar fin@acme.com no CRM");

    // 4) ADV_OVERRIDE_EMPTY_EMAIL_3RDPJ_NOHIDE (928 Company 70, nfHideFromGuest: false -> 3ª PJ sem tomadorEmail) + zero poluição CRM
    const advEmpty3rdPjNoHide = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [928],
        tomadorCpfCnpj: "88.777.666/0001-55",
        tomadorNome: "Quarta Sem Email LTDA",
      },
    });
    assert.equal(advEmpty3rdPjNoHide.status, 201);
    assert.equal(advEmpty3rdPjNoHide.payload.invoice.invoiceRecipientType, "company");
    assert.equal(advEmpty3rdPjNoHide.payload.invoice.tomadorEmail, "");
    assert.deepEqual(advEmpty3rdPjNoHide.payload.invoice.nfDeliveryEmails, []);
    const created3rdCo2 = db27.companies.find((c) => c.id === advEmpty3rdPjNoHide.payload.invoice.companyId);
    assert.ok(created3rdCo2 && created3rdCo2.id !== 70);
    assert.equal(created3rdCo2.financialEmail, "", "Nova empresa (nfHideFromGuest:false) não pode herdar fin@acme.com no CRM");

    // 5) ADV_OVERRIDE_PF_EMPTY_EMAIL (930 Company 70 -> 3º PF sem tomadorEmail)
    const advEmptyPf = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [930],
        tomadorCpfCnpj: "44455566600",
        tomadorNome: "Carlos Terceiro",
      },
    });
    assert.equal(advEmptyPf.status, 201);
    assert.equal(advEmptyPf.payload.invoice.tomadorCpfCnpj, "44455566600");
    assert.equal(advEmptyPf.payload.invoice.tomadorEmail, "");
    assert.deepEqual(advEmptyPf.payload.invoice.nfDeliveryEmails, []);

    // 6) ADV_OVERRIDE_AG_EMPTY_EMAIL (924 Company 70 -> agencyId 21 sem financialEmail)
    const advEmptyAg = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [924],
        agencyId: 21,
      },
    });
    assert.equal(advEmptyAg.status, 201);
    assert.equal(advEmptyAg.payload.invoice.invoiceRecipientType, "agency");
    assert.equal(advEmptyAg.payload.invoice.agencyId, 21);
    assert.equal(advEmptyAg.payload.invoice.companyId, null);
    assert.equal(advEmptyAg.payload.invoice.tomadorEmail, "");
    assert.deepEqual(advEmptyAg.payload.invoice.nfDeliveryEmails, []);

    // 7) REQ_921_TO_CO75_EMPTY (921 requester -> companyId 75 sem financialEmail)
    const reqToCo75 = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [921],
        companyId: 75,
      },
    });
    assert.equal(reqToCo75.status, 201);
    assert.equal(reqToCo75.payload.invoice.invoiceRecipientType, "company");
    assert.equal(reqToCo75.payload.invoice.companyId, 75);
    assert.equal(reqToCo75.payload.invoice.tomadorEmail, "");
    assert.deepEqual(reqToCo75.payload.invoice.nfDeliveryEmails, []);
    assert.equal(db27.companies.find((c) => c.id === 75).financialEmail, "");

    // 8) Preservação: 924 sem override continua mesclando custom@acme.com + fin@acme.com
    db27.invoices = db27.invoices.filter((inv) => !(Array.isArray(inv.reservationIds) && inv.reservationIds.includes(924)));
    const nonOverride924 = await callR27("POST /api/nfse/emit-consolidated", {
      body: {
        reservationIds: [924],
      },
    });
    assert.equal(nonOverride924.status, 201);
    assert.equal(nonOverride924.payload.invoice.companyId, 70);
    assert.deepEqual(nonOverride924.payload.invoice.nfDeliveryEmails, ["fin@acme.com", "custom@acme.com"]);

    // 9) REPLACE_1009 (guestId: null, guestName: "Hóspede", CPF só em db.guestAccounts ligado a db.guests[508] sem tag) + preservação 997
    const rep1009 = await callR27("POST /api/nfse/replace/:id", { params: { id: 1009 }, body: {} });
    assert.equal(rep1009.status, 200);
    assert.equal(rep1009.payload.draft.tomadorEmail, "", "REPLACE_1009: não pode vazar e-mail de db.guests[508] nem db.guestAccounts[3]");
    assert.equal(rep1009.payload.draft.tomadorTelefone, "", "REPLACE_1009: não pode vazar telefone de db.guests[508]");
    assert.deepEqual(rep1009.payload.draft.nfDeliveryEmails, [], "REPLACE_1009: nfDeliveryEmails deve estar vazio");

    const rep997 = await callR27("POST /api/nfse/replace/:id", { params: { id: 997 }, body: {} });
    assert.equal(rep997.status, 200);
    assert.equal(rep997.payload.draft.tomadorEmail, "julia@terceiro.com");
    assert.equal(rep997.payload.draft.tomadorTelefone, "2227889900");
    assert.deepEqual(rep997.payload.draft.nfDeliveryEmails, ["julia@terceiro.com"]);
  });

  it("28. isFaturadoBoleto (pacote e 1-flat) e pacote 100% pago (paymentStatus='paid') nunca vazam PIX estático em resolveWhatsAppTags/scheduleUpcomingReservationTriggers/computePackageSummary", () => {
    const db = createIsolatedDb();
    db.zapiConfig.testModeOnly = false;
    db.whatsappTemplates = JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES));
    db.whatsappQueue = [];

    const now = new Date();
    const checkinDate = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    const checkoutDate = new Date(now.getTime() + 12 * 86400000).toISOString().slice(0, 10);

    // 1) Pacote 2-flat Faturado Boleto (confirmado, sem PIX)
    const pkgFaturado = "PKG-FAT901";
    const f1 = {
      id: 2801,
      code: "RES-FAT-2801",
      packageCode: pkgFaturado,
      packageId: pkgFaturado,
      packageIndex: 1,
      isPackagePrimary: true,
      flatId: 1,
      flatNumber: "101",
      checkinDate,
      checkoutDate,
      status: "confirmada",
      channel: "direto",
      guestName: "Hóspede Faturado 1",
      guestPhone: "5522999110001",
      guestEmail: "fat1@empresa.com",
      requesterType: "company",
      requesterName: "Gestor Empresa",
      requesterPhone: "5522999110000",
      requesterEmail: "fin@empresa.com",
      isFaturadoBoleto: true,
      paymentMethod: "boleto_faturado",
      paymentStatus: "faturado",
      totalAmount: 500,
      paidAmount: 0,
      pixCopiaECola: null,
      packagePixCopiaECola: null,
      pixChargedAmount: 0,
      guests: [{ index: 1, name: "Hóspede Faturado 1", phone: "5522999110001", email: "fat1@empresa.com" }],
    };
    const f2 = {
      ...f1,
      id: 2802,
      code: "RES-FAT-2802",
      packageIndex: 2,
      isPackagePrimary: false,
      flatId: 2,
      flatNumber: "102",
      guestName: "Hóspede Faturado 2",
      guestPhone: "5522999110002",
      guestEmail: "fat2@empresa.com",
      guests: [{ index: 1, name: "Hóspede Faturado 2", phone: "5522999110002", email: "fat2@empresa.com" }],
    };

    // 2) Reserva 1-flat Faturado Boleto (confirmada, sem PIX)
    const singleFaturado = {
      id: 2803,
      code: "RES-FAT-SINGLE",
      flatId: 3,
      flatNumber: "103",
      checkinDate,
      checkoutDate,
      status: "confirmada",
      channel: "direto",
      guestName: "Hóspede Single Faturado",
      guestPhone: "5522999110003",
      guestEmail: "singlefat@empresa.com",
      isFaturadoBoleto: true,
      paymentMethod: "boleto_faturado",
      paymentStatus: "faturado",
      totalAmount: 600,
      paidAmount: 0,
      pixCopiaECola: null,
      pixChargedAmount: 0,
      guests: [{ index: 1, name: "Hóspede Single Faturado", phone: "5522999110003", email: "singlefat@empresa.com" }],
    };

    // 3) Pacote 2-flat 100% quitado com paymentStatus: "paid" (não faturado)
    const pkgPaid = "PKG-PAID28";
    const p1 = {
      id: 2804,
      code: "RES-PAID-2804",
      packageCode: pkgPaid,
      packageId: pkgPaid,
      packageIndex: 1,
      isPackagePrimary: true,
      flatId: 4,
      flatNumber: "104",
      checkinDate,
      checkoutDate,
      status: "confirmada",
      channel: "direto",
      guestName: "Hóspede Quitado 1",
      guestPhone: "5522999110004",
      guestEmail: "paid1@empresa.com",
      isFaturadoBoleto: false,
      paymentMethod: "pix",
      paymentStatus: "paid",
      totalAmount: 450,
      paidAmount: 0,
      pixCopiaECola: null,
      packagePixCopiaECola: null,
      pixChargedAmount: 0,
      guests: [{ index: 1, name: "Hóspede Quitado 1", phone: "5522999110004", email: "paid1@empresa.com" }],
    };
    const p2 = {
      ...p1,
      id: 2805,
      code: "RES-PAID-2805",
      packageIndex: 2,
      isPackagePrimary: false,
      flatNumber: "105",
      guestName: "Hóspede Quitado 2",
      guestPhone: "5522999110005",
      guestEmail: "paid2@empresa.com",
      guests: [{ index: 1, name: "Hóspede Quitado 2", phone: "5522999110005", email: "paid2@empresa.com" }],
    };

    db.reservations.push(f1, f2, singleFaturado, p1, p2);

    // Teste direto de resolveWhatsAppTags com {{pix_copia_e_cola}}
    for (const r of [f1, f2, singleFaturado, p1, p2]) {
      const rendered = resolveWhatsAppTags("PIX:[{{pix_copia_e_cola}}]", r, db, "https://corpflats.com.br", "requester");
      assert.equal(rendered, "PIX:[]", `Tag {{pix_copia_e_cola}} deve vir vazia para ${r.code}`);
      assert.equal(r.pixCopiaECola, null, `pixCopiaECola deve continuar null em ${r.code}`);
      assert.equal(r.pixChargedAmount, 0, `pixChargedAmount deve continuar 0 em ${r.code}`);
    }

    // Teste via scheduleUpcomingReservationTriggers (disparo real em lote sobre reservas confirmadas)
    realScheduleUpcomingReservationTriggers(db);
    assert.ok(db.whatsappQueue.length > 0, "scheduleUpcomingReservationTriggers deve agendar mensagens para reservas futuras");

    for (const r of [f1, f2, singleFaturado, p1, p2]) {
      assert.equal(r.pixCopiaECola, null, `scheduleUpcomingReservationTriggers não pode gerar pixCopiaECola em ${r.code}`);
      assert.equal(r.pixChargedAmount, 0, `scheduleUpcomingReservationTriggers não pode alterar pixChargedAmount em ${r.code}`);
    }

    assert.equal(computePackageSummary(db, pkgFaturado).pixCopiaECola, null);
    assert.equal(computePackageSummary(db, pkgPaid).pixCopiaECola, null);
    assert.equal(computePackageSummary(db, pkgPaid).isPaid, true);

    // Mesmo se existir resíduo legado em pixCopiaECola num item faturado, computePackageSummary suprime
    f1.pixCopiaECola = "RESIDUO_LEGADO_PIX";
    const summaryWithResidual = computePackageSummary(db, pkgFaturado);
    assert.equal(summaryWithResidual.pixCopiaECola, null, "computePackageSummary deve suprimir pixCopiaECola em pacote isFaturadoBoleto mesmo com resíduo");
    assert.equal(summaryWithResidual.pixTxId, null);
    assert.equal(summaryWithResidual.mpInitPoint, null);
  });

  it("29. Pacote multi-flat confirmado com pagamento parcial (sinal_pago) preserva PIX consolidado de pendingAmount=1000 e não sintetiza PIX por flat sem packagePixCopiaECola", async () => {
    const db = createIsolatedDb();
    db.zapiConfig.testModeOnly = false;
    db.whatsappTemplates = JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES));
    db.whatsappQueue = [];

    const now = new Date();
    const checkinDate = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    const checkoutDate = new Date(now.getTime() + 12 * 86400000).toISOString().slice(0, 10);

    const pkgCode = "PKG-SINAL29";
    const items = [
      {
        id: 2901,
        code: "RES-SINAL-2901",
        packageCode: pkgCode,
        packageId: pkgCode,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate,
        checkoutDate,
        status: "confirmada",
        channel: "direto",
        guestName: "Hóspede Sinal 1",
        guestPhone: "5522999220001",
        guestEmail: "sinal1@teste.com",
        requesterType: "other_person",
        requesterName: "Solicitante Sinal",
        requesterPhone: "5522999220000",
        requesterEmail: "req@teste.com",
        paymentMethod: "pix",
        paymentStatus: "sinal_pago",
        totalAmount: 495,
        paidAmount: 485,
        guests: [{ index: 1, name: "Hóspede Sinal 1", phone: "5522999220001", email: "sinal1@teste.com" }],
      },
      {
        id: 2902,
        code: "RES-SINAL-2902",
        packageCode: pkgCode,
        packageId: pkgCode,
        packageIndex: 2,
        isPackagePrimary: false,
        flatId: 2,
        flatNumber: "102",
        checkinDate,
        checkoutDate,
        status: "confirmada",
        channel: "direto",
        guestName: "Hóspede Sinal 2",
        guestPhone: "5522999220002",
        guestEmail: "sinal2@teste.com",
        requesterType: "other_person",
        requesterName: "Solicitante Sinal",
        requesterPhone: "5522999220000",
        requesterEmail: "req@teste.com",
        paymentMethod: "pix",
        paymentStatus: "sinal_pago",
        totalAmount: 495,
        paidAmount: 0,
        guests: [{ index: 1, name: "Hóspede Sinal 2", phone: "5522999220002", email: "sinal2@teste.com" }],
      },
      {
        id: 2903,
        code: "RES-SINAL-2903",
        packageCode: pkgCode,
        packageId: pkgCode,
        packageIndex: 3,
        isPackagePrimary: false,
        flatId: 3,
        flatNumber: "103",
        checkinDate,
        checkoutDate,
        status: "confirmada",
        channel: "direto",
        guestName: "Hóspede Sinal 3",
        guestPhone: "5522999220003",
        guestEmail: "sinal3@teste.com",
        requesterType: "other_person",
        requesterName: "Solicitante Sinal",
        requesterPhone: "5522999220000",
        requesterEmail: "req@teste.com",
        paymentMethod: "pix",
        paymentStatus: "sinal_pago",
        totalAmount: 495,
        paidAmount: 0,
        guests: [{ index: 1, name: "Hóspede Sinal 3", phone: "5522999220003", email: "sinal3@teste.com" }],
      },
    ];
    db.reservations.push(...items);

    await syncPackagePixAndPaymentLinks(db, pkgCode, { generateStaticPixPayload: mockPixGenerator });
    const expectedSummary = computePackageSummary(db, pkgCode);
    assert.equal(expectedSummary.totalAmount, 1485);
    assert.equal(expectedSummary.paidAmount, 485);
    assert.equal(expectedSummary.pendingAmount, 1000);
    assert.ok(expectedSummary.pixCopiaECola && expectedSummary.pixCopiaECola.includes("1000.00"), "PIX sincronizado deve refletir pendingAmount=1000.00");

    // 1) Chamadas diretas a resolveWhatsAppTags por flat filho
    for (const r of items) {
      const renderedPix = resolveWhatsAppTags("{{pix_copia_e_cola}}", r, db, "https://corpflats.com.br", "requester");
      assert.equal(renderedPix, expectedSummary.pixCopiaECola);
      assert.equal(r.packagePixChargedAmount, 1000);
      assert.equal(r.pixChargedAmount, 1000);
      assert.equal(r.pixCopiaECola, expectedSummary.pixCopiaECola);
    }

    // 2) scheduleUpcomingReservationTriggers sobre os flats confirmados
    realScheduleUpcomingReservationTriggers(db);
    assert.ok(db.whatsappQueue.length > 0, "scheduleUpcomingReservationTriggers deve popular fila para os flats");

    for (const r of items) {
      assert.equal(r.packagePixChargedAmount, 1000, `packagePixChargedAmount deve permanecer 1000 em ${r.code}`);
      assert.equal(r.pixChargedAmount, 1000, `pixChargedAmount não pode ser sobrescrito pelo saldo do flat individual em ${r.code}`);
      assert.equal(r.pixCopiaECola, expectedSummary.pixCopiaECola, `pixCopiaECola não pode ser sobrescrito em ${r.code}`);
      assert.equal(r.packagePixCopiaECola, expectedSummary.pixCopiaECola);
    }
    assert.equal(computePackageSummary(db, pkgCode).pixCopiaECola, expectedSummary.pixCopiaECola);

    // 3) Edge case: item de pacote com packageCode definido e packagePixCopiaECola=null não deve sintetizar PIX por flat
    const unsyncedPkgItem = {
      id: 2904,
      code: "RES-UNSYNC-2904",
      packageCode: "PKG-UNSYNC29",
      packageId: "PKG-UNSYNC29",
      flatId: 4,
      flatNumber: "104",
      checkinDate,
      checkoutDate,
      status: "confirmada",
      channel: "direto",
      guestName: "Hóspede Sem Sync",
      guestPhone: "5522999220004",
      requesterType: "other_person",
      requesterName: "Solicitante Sem Sync",
      requesterPhone: "5522999220099",
      paymentMethod: "pix",
      paymentStatus: "pendente",
      totalAmount: 500,
      paidAmount: 0,
      pixCopiaECola: null,
      packagePixCopiaECola: null,
      pixChargedAmount: 0,
    };
    const unsyncedRendered = resolveWhatsAppTags("PIX:[{{pix_copia_e_cola}}]", unsyncedPkgItem, db, "https://corpflats.com.br", "requester");
    assert.equal(unsyncedRendered, "PIX:[]");
    assert.equal(unsyncedPkgItem.pixCopiaECola, null, "Item de pacote sem packagePixCopiaECola não pode sintetizar PIX estático por flat");
    assert.equal(unsyncedPkgItem.pixChargedAmount, 0);
  });

  it("30. reconcileUniversalIntegrity (demo-server.mjs) suprime PIX para paymentStatus='paid' (paidAmount=0) e isFaturadoBoleto, mantendo PIX de extensão parcial OTA", () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const fnFaturadoMethod = extractJsBlock(demoSrc, "export function isFaturadoBoletoMethod(").replace(/^export\s+/, "");
    const fnNormPm = extractJsBlock(demoSrc, "export function normalizePaymentMethodId(").replace(/^export\s+/, "");
    const fnFaturadoRes = extractJsBlock(demoSrc, "export function isFaturadoBoletoReservation(").replace(/^export\s+/, "");
    const fnEvidence = extractJsBlock(demoSrc, "function hasRealPaymentEvidence(");
    const fnUnverified = extractJsBlock(demoSrc, "function isUnverifiedPreReservation(");

    const anchorIdx = demoSrc.indexOf("Sincronização do valor de Cartão (+5%) e payloads PIX/Mercado Pago quando houver saldo pendente");
    assert.ok(anchorIdx >= 0, "Bloco de reconciliação PIX deve existir em reconcileUniversalIntegrity");
    const reconcilePixBlock = extractJsBlock(demoSrc.slice(anchorIdx), 'if (r.status !== "cancelada" && r.status !== "cancelled" && r.status !== "expirada")');

    const runReconcilePix = new Function(
      "deps",
      `
      const { db, computeCardAmountFromPix, isPixPayloadStaleForAmount, generateStaticPixPayload, DEFAULT_INTER_CONFIG } = deps;
      ${fnFaturadoMethod}
      ${fnNormPm}
      ${fnFaturadoRes}
      ${fnEvidence}
      ${fnUnverified}
      return function reconcileReservationPix(r) {
        let changed = false;
        const resTotalAmt = Number(r.totalAmount) || 0;
        ${reconcilePixBlock}
        return changed;
      };
      `
    )({
      db: { settings: { interConfig: { pixKey: "47964813000165" } } },
      computeCardAmountFromPix: (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100,
      isPixPayloadStaleForAmount: (r, amt) => Boolean(r.pixCopiaECola && Math.abs((Number(r.pixChargedAmount) || 0) - amt) > 0.01),
      generateStaticPixPayload: mockPixGenerator,
      DEFAULT_INTER_CONFIG: { pixKey: "47964813000165" },
    });

    // 1) 1-flat paymentStatus='paid' com paidAmount=0 -> NÃO pode gerar PIX
    const paidZeroRes = {
      id: 3001,
      code: "RES-PAID-3001",
      status: "confirmada",
      channel: "direta",
      paymentMethod: "pix",
      paymentStatus: "paid",
      totalAmount: 500,
      paidAmount: 0,
      pixCopiaECola: null,
      pixChargedAmount: 0,
    };
    runReconcilePix(paidZeroRes);
    assert.equal(paidZeroRes.pixCopiaECola, null, "reconcileUniversalIntegrity não pode gerar PIX para paymentStatus='paid'");
    assert.equal(paidZeroRes.pixChargedAmount, 0);

    // 2) 1-flat isFaturadoBoleto=true com paymentMethod='pix' -> NÃO pode gerar PIX
    const fatRes = {
      id: 3002,
      code: "RES-FAT-3002",
      status: "confirmada",
      channel: "direta",
      isFaturadoBoleto: true,
      paymentMethod: "pix",
      paymentStatus: "faturado",
      totalAmount: 500,
      paidAmount: 0,
      pixCopiaECola: null,
      pixChargedAmount: 0,
    };
    runReconcilePix(fatRes);
    assert.equal(fatRes.pixCopiaECola, null, "reconcileUniversalIntegrity não pode gerar PIX para isFaturadoBoleto=true");
    assert.equal(fatRes.pixChargedAmount, 0);

    // 3) 1-flat OTA com extensão parcial (sinal_pago) -> DEVE gerar PIX apenas do residual (150.00)
    const otaExtSinal = {
      id: 3003,
      code: "RES-OTA-3003",
      status: "confirmada",
      channel: "booking",
      paymentStatus: "sinal_pago",
      paidAmount: 650.40,
      totalAmount: 800.40,
      pixCopiaECola: null,
      pixChargedAmount: 0,
    };
    runReconcilePix(otaExtSinal);
    assert.equal(otaExtSinal.pixChargedAmount, 150, "Extensão parcial OTA sinal_pago deve gerar PIX de 150");
    assert.ok(String(otaExtSinal.pixCopiaECola || "").includes("150.00"));

    // 4) 1-flat OTA com extensão parcial (paymentStatus='pago_total' + pendingStayExtension pending_payment) -> DEVE gerar PIX residual
    const otaExtPending = {
      id: 3004,
      code: "RES-OTA-3004",
      status: "confirmada",
      channel: "booking",
      paymentStatus: "pago_total",
      pendingStayExtension: { status: "pending_payment", extraNights: 1 },
      paidAmount: 650.40,
      totalAmount: 800.40,
      pixCopiaECola: null,
      pixChargedAmount: 0,
    };
    runReconcilePix(otaExtPending);
    assert.equal(otaExtPending.pixChargedAmount, 150, "Extensão parcial OTA com pendingStayExtension deve gerar PIX de 150");
    assert.ok(String(otaExtPending.pixCopiaECola || "").includes("150.00"));

    // 5) OTA normal quitada (sem extensão) -> NÃO gera PIX
    const otaNormal = {
      id: 3005,
      code: "RES-OTA-3005",
      status: "confirmada",
      channel: "booking",
      paymentStatus: "pago_total",
      paidAmount: 425,
      totalAmount: 500,
      pixCopiaECola: null,
      pixChargedAmount: 0,
    };
    runReconcilePix(otaNormal);
    assert.equal(otaNormal.pixCopiaECola, null, "OTA normal sem extensão não pode gerar PIX");
    assert.equal(otaNormal.pixChargedAmount, 0);
  });

  it("31. resolveWhatsAppTags e renderTemplateButtons suprimem instrução PIX/saldo e btn_pix/copiar-pix em faturado e 'paid' (paidAmount=0), preservando extensão OTA", () => {
    const db = createIsolatedDb();
    const tplDirect = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_new_reservation_direct");
    const tplConfirmed = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_payment_confirmed");
    const tplPreReserva = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_reserva");
    const tplPayPending = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_payment_pending");
    const tplAddDaily = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_additional_daily_pending");
    assert.ok(tplDirect && tplConfirmed && tplPreReserva && tplPayPending && tplAddDaily);

    const fatRes = {
      id: 3101,
      code: "RES-FAT-3101",
      flatId: 1,
      flatNumber: "101",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      status: "confirmada",
      channel: "direta",
      guestName: "Carlos Faturado",
      guestPhone: "5522999310001",
      requesterType: "other_person",
      requesterName: "Financeiro Corp",
      requesterPhone: "5522999310099",
      isFaturadoBoleto: true,
      paymentMethod: "boleto_faturado",
      paymentStatus: "faturado",
      totalAmount: 600,
      paidAmount: 0,
      pixCopiaECola: null,
    };

    const paidZeroRes = {
      id: 3102,
      code: "RES-PAID-3102",
      flatId: 2,
      flatNumber: "102",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      status: "confirmada",
      channel: "direta",
      guestName: "Ana Quitada",
      guestPhone: "5522999310002",
      isFaturadoBoleto: false,
      paymentMethod: "pix",
      paymentStatus: "paid",
      totalAmount: 500,
      paidAmount: 0,
      pixCopiaECola: null,
    };

    for (const r of [fatRes, paidZeroRes]) {
      for (const tpl of [tplDirect, tplConfirmed]) {
        const rendered = resolveWhatsAppTags(tpl.message, r, db, "https://corpflats.com.br", "requester", tpl);
        assert.equal(rendered.includes("Desconto no PIX"), false, `${tpl.id} não pode vazar 'Desconto no PIX' para ${r.code}`);
        assert.equal(rendered.includes("Resta o saldo"), false, `${tpl.id} não pode vazar 'Resta o saldo' para ${r.code}`);
        assert.equal(rendered.includes("000201"), false, `${tpl.id} não pode conter payload PIX para ${r.code}`);
      }
      const renderedPre = resolveWhatsAppTags(tplPreReserva.message, r, db, "https://corpflats.com.br", "requester", tplPreReserva);
      assert.equal(renderedPre.includes("efetue o pagamento via PIX"), false, `tpl_pre_reserva não pode vazar pitch de pagamento PIX em {{instrucao_pagamento}} para ${r.code}`);
      assert.equal(renderedPre.includes("Resta o saldo"), false, `tpl_pre_reserva não pode vazar 'Resta o saldo' para ${r.code}`);
      assert.equal(renderedPre.includes("000201"), false, `tpl_pre_reserva não pode conter payload PIX para ${r.code}`);
      const renderedTagsOnly = resolveWhatsAppTags("{{instrucao_pagamento}}|{{instrucao_saldo}}", r, db, "https://corpflats.com.br", "requester", tplPreReserva);
      assert.equal(renderedTagsOnly.includes("PIX"), false, `{{instrucao_pagamento}}/{{instrucao_saldo}} não podem mencionar PIX para ${r.code}`);
      assert.equal(renderedTagsOnly.includes("Resta o saldo"), false);

      const btnTemplatesToCheck = r.isFaturadoBoleto ? [tplPreReserva, tplPayPending, tplAddDaily] : [tplPreReserva, tplPayPending];
      for (const tpl of btnTemplatesToCheck) {
        const btns = renderTemplateButtons(tpl.buttons, r, db, "https://corpflats.com.br", "requester", tpl);
        assert.equal(btns.some(b => b.id === "btn_pix" || b.type === "COPY" || String(b.url || "").includes("/copiar-pix/")), false, `${tpl.id} não pode emitir btn_pix ou /copiar-pix/ para ${r.code}`);
        const payBtn = btns.find(b => b.id === "btn_pagar" || b.id === "btn_portal");
        if (payBtn) {
          assert.equal(payBtn.label, r.isFaturadoBoleto ? "📄 Ver Reserva" : "🏨 Ver Detalhes da Reserva");
        }
      }
    }

    // Pacote sem packagePixCopiaECola sincronizado nunca anexa /copiar-pix/
    const unsyncedPkg = {
      id: 3103,
      code: "RES-UNSYNC-3103",
      packageCode: "PKG-UNSYNC31",
      packageId: "PKG-UNSYNC31",
      flatId: 3,
      flatNumber: "103",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      status: "pre_reserva",
      channel: "direta",
      guestName: "João Pacote",
      guestPhone: "5522999310003",
      paymentMethod: "pix",
      paymentStatus: "pendente",
      totalAmount: 500,
      paidAmount: 0,
      pixCopiaECola: null,
      packagePixCopiaECola: null,
    };
    const unsyncedBtns = renderTemplateButtons(tplPreReserva.buttons, unsyncedPkg, db, "https://corpflats.com.br", "requester", tplPreReserva);
    assert.equal(unsyncedBtns.some(b => b.id === "btn_pix" || String(b.url || "").includes("/copiar-pix/")), false, "Pacote sem PIX sincronizado não pode emitir btn_pix com /copiar-pix/");

    // Regressão: extensão parcial OTA com paymentStatus='pago_total' residual continua com btn_pix
    const otaPendingRes = {
      id: 3104,
      code: "RES-OTA-3104",
      flatId: 4,
      flatNumber: "104",
      checkinDate: "2026-12-10",
      checkoutDate: "2026-12-12",
      status: "confirmada",
      channel: "booking",
      guestName: "Hóspede Booking",
      guestPhone: "5522999310004",
      paymentMethod: "pix",
      paymentStatus: "pago_total",
      totalAmount: 800.40,
      paidAmount: 650.40,
    };
    const otaBtns = renderTemplateButtons(tplAddDaily.buttons, otaPendingRes, db, "https://corpflats.com.br", "guest", tplAddDaily);
    const otaPixBtn = otaBtns.find(b => b.id === "btn_pix");
    assert.ok(otaPixBtn && String(otaPixBtn.copyCode || "").startsWith("000201"), "Extensão parcial OTA deve manter btn_pix com payload PIX");
    assert.equal(otaBtns.find(b => b.id === "btn_pagar")?.label, "💳 Ver Detalhes & Pagar");
  });

  it("32. isB2bReservation e GET /api/pms/guest-portal/:packageCode?requester=1 tratam pacotes corporativos diretos (channel='direta' + companyName) com isB2b=false e summary completo", async () => {
    const demoSrc = fs.readFileSync(path.resolve("artifacts/api-server/demo-server.mjs"), "utf8");
    const fnIsB2b = extractJsBlock(demoSrc, "function isB2bReservation(");
    const fnFaturadoMethod = extractJsBlock(demoSrc, "export function isFaturadoBoletoMethod(").replace(/^export\s+/, "");
    const fnNormPm = extractJsBlock(demoSrc, "export function normalizePaymentMethodId(").replace(/^export\s+/, "");
    const fnFaturadoRes = extractJsBlock(demoSrc, "export function isFaturadoBoletoReservation(").replace(/^export\s+/, "");
    const fnEvidence = extractJsBlock(demoSrc, "function hasRealPaymentEvidence(");
    const fnUnverified = extractJsBlock(demoSrc, "function isUnverifiedPreReservation(");
    const fnPreBlocked = extractJsBlock(demoSrc, "function isPreReservationBlocked(");
    const fnEnrichPay = extractJsBlock(demoSrc, "function enrichReservationPayments(");
    const portalRouteSrc = extractJsBlock(demoSrc, 'app.get("/api/pms/guest-portal/:code"', true);

    const db = createIsolatedDb();
    db.cleaningRequests = [];
    db.breakfastOrders = [];
    const pkgPix = "PKG-PIX3201";
    const pixPayload = mockPixGenerator({ amount: 700, txid: pkgPix });
    db.reservations.push(
      {
        id: 3201,
        code: "RES-101-3201",
        packageCode: pkgPix,
        packageId: pkgPix,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 1,
        flatNumber: "101",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-17",
        status: "confirmada",
        channel: "direta",
        companyName: "Empresa Probe Ltda",
        companyCnpj: "11.222.333/0001-81",
        requesterType: "other_person",
        requesterName: "Solicitante Corp",
        requesterPhone: "5522999000001",
        requesterIsGuest1: false,
        guestName: "Hóspede Um",
        guestPhone: "5522999000011",
        paymentMethod: "pix",
        paymentStatus: "sinal_pago",
        totalAmount: 550,
        paidAmount: 200,
        packageTotalAmount: 1050,
        packagePaidAmount: 350,
        packagePendingAmount: 700,
        packagePixCopiaECola: pixPayload,
        pixCopiaECola: pixPayload,
        pixChargedAmount: 700,
        guests: [{ index: 1, name: "Hóspede Um", phone: "5522999000011" }],
      },
      {
        id: 3202,
        code: "RES-102-3202",
        packageCode: pkgPix,
        packageId: pkgPix,
        packageIndex: 2,
        isPackagePrimary: false,
        flatId: 2,
        flatNumber: "102",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-17",
        status: "confirmada",
        channel: "direta",
        companyName: "Empresa Probe Ltda",
        companyCnpj: "11.222.333/0001-81",
        requesterType: "other_person",
        requesterName: "Solicitante Corp",
        requesterPhone: "5522999000001",
        requesterIsGuest1: false,
        guestName: "Hóspede Dois",
        guestPhone: "5522999000012",
        paymentMethod: "pix",
        paymentStatus: "sinal_pago",
        totalAmount: 500,
        paidAmount: 150,
        packageTotalAmount: 1050,
        packagePaidAmount: 350,
        packagePendingAmount: 700,
        packagePixCopiaECola: pixPayload,
        pixCopiaECola: pixPayload,
        pixChargedAmount: 700,
        guests: [{ index: 1, name: "Hóspede Dois", phone: "5522999000012" }],
      }
    );

    const pkgFat = "PKG-FAT3201";
    db.reservations.push(
      {
        id: 3203,
        code: "RES-103-3203",
        packageCode: pkgFat,
        packageId: pkgFat,
        packageIndex: 1,
        isPackagePrimary: true,
        flatId: 3,
        flatNumber: "103",
        checkinDate: "2026-12-18",
        checkoutDate: "2026-12-20",
        status: "confirmada",
        channel: "direta",
        companyName: "Empresa Probe Ltda",
        companyCnpj: "11.222.333/0001-81",
        requesterType: "company",
        requesterName: "Financeiro Corp",
        requesterPhone: "5522999000001",
        requesterIsGuest1: false,
        guestName: "Hóspede Faturado 1",
        guestPhone: "5522999000013",
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
        paymentStatus: "faturado",
        totalAmount: 600,
        paidAmount: 0,
        pixCopiaECola: null,
        packagePixCopiaECola: null,
        guests: [{ index: 1, name: "Hóspede Faturado 1", phone: "5522999000013" }],
      },
      {
        id: 3204,
        code: "RES-104-3204",
        packageCode: pkgFat,
        packageId: pkgFat,
        packageIndex: 2,
        isPackagePrimary: false,
        flatId: 4,
        flatNumber: "104",
        checkinDate: "2026-12-18",
        checkoutDate: "2026-12-20",
        status: "confirmada",
        channel: "direta",
        companyName: "Empresa Probe Ltda",
        companyCnpj: "11.222.333/0001-81",
        requesterType: "company",
        requesterName: "Financeiro Corp",
        requesterPhone: "5522999000001",
        requesterIsGuest1: false,
        guestName: "Hóspede Faturado 2",
        guestPhone: "5522999000014",
        isFaturadoBoleto: true,
        paymentMethod: "boleto_faturado",
        paymentStatus: "faturado",
        totalAmount: 600,
        paidAmount: 0,
        pixCopiaECola: null,
        packagePixCopiaECola: null,
        guests: [{ index: 1, name: "Hóspede Faturado 2", phone: "5522999000014" }],
      }
    );

    const routes = {};
    const appMock = {
      get(p, h) { routes[`GET ${p}`] = h; },
    };

    const { isB2bReservation } = new Function(
      "deps",
      `
      const {
        app, db, isPackageCode, getPrimaryPackageReservation, computePackageSummary,
        syncPackagePixAndPaymentLinks, getReservationRecipients, computeCardAmountFromPix,
        generateStaticPixPayload, DEFAULT_INTER_CONFIG
      } = deps;
      const sweepExpiredPreReservations = () => {};
      const findReservationByLocatorOrContact = (c) => isPackageCode(c) ? getPrimaryPackageReservation(db, c) : db.reservations.find(x => x.code === c);
      const ensureReservationCompositeTotal = () => {};
      const getEffectiveDate = () => new Date("2026-12-10T12:00:00Z");
      const getBrasiliaNow = () => ({ date: "2026-12-10", hour: 12, minute: 0, timeStr: "12:00" });
      const getRequestsForDate = () => [];
      const isFlatStillBeingCleanedOnCheckinDay = () => false;
      const isOtaOrB2bReservation = (r) => Boolean(r && (String(r.channel || "").toLowerCase().includes("booking") || String(r.channel || "").toLowerCase().includes("airbnb") || isB2bReservation(r)));
      const addDaysToDateStr = (d, n) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
      const hasRealSettlementForFaturadoBoleto = (r) => Boolean(r && (r.paidAt || r.boletoPaidAt || Number(r.paidAmount) >= Number(r.totalAmount || 0) && Number(r.totalAmount) > 0));
      const saveDatabase = () => {};
      const hasReservationCompletedAnyCheckin = () => false;
      const createInterPixCob = null;
      const isPixPayloadStaleForAmount = () => false;
      const ensurePaymentConfirmationDispatched = () => {};
      const isReservationB2bDndActiveForDate = () => false;
      const isReservationAnserveDndActiveForDate = () => false;
      const getVisibleReservationMinibarOrders = () => [];
      const evaluateSelfCheckinEligibility = () => ({ allowed: false, reason: "future_date" });
      const buildGuestAnserveDndPayload = () => null;
      const computeLinenTracking = () => ({});
      const DEFAULT_TERMS_AND_RULES = "";
      const DEFAULT_HOUSE_RULES = "";
      const DEFAULT_CONTRACT_TERMS = "";
      ${fnFaturadoMethod}
      ${fnNormPm}
      ${fnFaturadoRes}
      ${fnEvidence}
      ${fnUnverified}
      ${fnPreBlocked}
      ${fnEnrichPay}
      ${fnIsB2b}
      ${portalRouteSrc}
      return { isB2bReservation };
      `
    )({
      app: appMock,
      db,
      isPackageCode,
      getPrimaryPackageReservation,
      computePackageSummary,
      syncPackagePixAndPaymentLinks,
      getReservationRecipients,
      computeCardAmountFromPix: (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100,
      generateStaticPixPayload: mockPixGenerator,
      DEFAULT_INTER_CONFIG: { pixKey: "47964813000165" },
    });

    // 1) Testes diretos em isB2bReservation
    for (const chan of ["direta", "particular", "corporativo", "empresa", "pms", "recepcao", "manual", "whatsapp", "site"]) {
      assert.equal(isB2bReservation({ channel: chan, companyName: "Empresa Probe Ltda" }), false, `Canal direto '${chan}' com companyName não deve ser classificado como B2B`);
    }
    assert.equal(isB2bReservation({ companyName: "Empresa Direta", requesterType: "company" }), false);
    assert.equal(isB2bReservation({ companyName: "Empresa Direta", requesterType: "other_person" }), false);
    assert.equal(isB2bReservation({ channel: "b2b", agencyId: 10, companyName: "Petrobras" }), true);
    assert.equal(isB2bReservation({ channel: "direta", agencyId: 10, requesterType: "agency_b2b" }), true);
    assert.equal(isB2bReservation({ b2bReservationNumber: "25055349" }), true);
    assert.equal(isB2bReservation({ isB2b: true }), true);

    async function invokePortal(code, query = {}) {
      let status = 200;
      let body = null;
      const req = {
        params: { code },
        query,
        protocol: "https",
        get: (h) => (String(h).toLowerCase() === "host" ? "corpflats.com.br" : ""),
      };
      const res = {
        status(s) { status = s; return this; },
        json(b) { body = b; return this; },
      };
      await routes["GET /api/pms/guest-portal/:code"](req, res);
      return { status, body };
    }

    // 2) Portal do solicitante para pacote corporativo direto PIX pendente (R$ 700)
    const resPixPortal = await invokePortal(pkgPix, { requester: "1" });
    assert.equal(resPixPortal.status, 200);
    assert.equal(resPixPortal.body.reservation.isB2b, false);
    assert.equal(resPixPortal.body.hideFinancialForGuest, false);
    assert.equal(resPixPortal.body.isPackageView, true);
    assert.equal(resPixPortal.body.packageSummary.pendingAmount, 700);
    assert.equal(resPixPortal.body.reservation.isPaid, false);
    assert.equal(resPixPortal.body.reservation.pixCopiaECola, pixPayload);

    // 3) Portal do solicitante para pacote corporativo direto isFaturadoBoleto (sem PIX)
    const resFatPortal = await invokePortal(pkgFat, { requester: "1" });
    assert.equal(resFatPortal.status, 200);
    assert.equal(resFatPortal.body.reservation.isB2b, false);
    assert.equal(resFatPortal.body.hideFinancialForGuest, false);
    assert.equal(resFatPortal.body.isPackageView, true);
    assert.equal(resFatPortal.body.packageSummary.pixCopiaECola, null);
    assert.equal(resFatPortal.body.reservation.isFaturadoBoleto, true);
    assert.equal(resFatPortal.body.reservation.pixCopiaECola, null);
    assert.equal(resFatPortal.body.reservation.isPaid, false);

    // 4) Hóspede não-solicitante pelo código individual mantém sigilo financeiro
    const resGuestPrivacy = await invokePortal("RES-101-3201", {});
    assert.equal(resGuestPrivacy.status, 200);
    assert.equal(resGuestPrivacy.body.hideFinancialForGuest, true);
    assert.equal(resGuestPrivacy.body.reservation.totalAmount, 0);
    assert.equal(resGuestPrivacy.body.reservation.pixCopiaECola, null);
  });
});
