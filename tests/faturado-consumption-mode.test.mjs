import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const demoSrc = fs.readFileSync(
  path.resolve("artifacts/api-server/demo-server.mjs"),
  "utf8"
);
const zohoSrc = fs.readFileSync(
  path.resolve("artifacts/api-server/zoho-mail-service.mjs"),
  "utf8"
);

function extractFunctionSource(src, fnSignature) {
  const startIdx = src.indexOf(fnSignature);
  assert.ok(startIdx >= 0, `Função não localizada: ${fnSignature}`);
  const bodyOpenIdx = src.indexOf(") {", startIdx) + 2;
  assert.ok(bodyOpenIdx >= 2, `Abertura de corpo não localizada: ${fnSignature}`);
  let braceDepth = 0;
  for (let i = bodyOpenIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        return src.slice(startIdx, i + 1);
      }
    }
  }
  throw new Error(`Fechamento de chaves não encontrado para: ${fnSignature}`);
}

function buildIsolatedRuntime(mockDb, hooks = {}) {
  const fns = [
    extractFunctionSource(demoSrc, "function normalizeBoletoConsumptionMode("),
    extractFunctionSource(demoSrc, "function resolveReservationBoletoConsumptionMode("),
    extractFunctionSource(demoSrc, "function isReservationConsumptionFaturado("),
    extractFunctionSource(demoSrc, "function applyCrmBillingConfigFields("),
    extractFunctionSource(demoSrc, "function computeReservationAccommodationAndConsumption("),
    extractFunctionSource(demoSrc, "function resolveReservationCrmLinks("),
    extractFunctionSource(demoSrc, "function buildSinglePreBoletoFromReservation("),
    extractFunctionSource(demoSrc, "async function emitCheckoutFaturadoPackage("),
    extractFunctionSource(demoSrc, "async function runCheckoutAutoBillingAndNfse("),
  ].join("\n\n");

  const factory = new Function(
    "db",
    "hooks",
    `
    const onlyDigits = (v) => String(v || "").replace(/\\D/g, "");
    const cleanPhone = (v) => String(v || "").replace(/\\D/g, "");
    const validateEmailList = (raw) => {
      const emails = String(raw || "").split(/[;,]/).map(s => s.trim()).filter(Boolean);
      return { valid: true, emails };
    };
    const formatEmailList = (raw) => Array.isArray(raw) ? raw.join("; ") : String(raw || "").trim();
    const parseEmailList = (raw) => Array.isArray(raw) ? raw.filter(Boolean) : String(raw || "").split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const getBrasiliaDateStr = () => "2026-11-24";
    const addDaysToIsoDate = (base, days = 15) => {
      const d = new Date(String(base).slice(0, 10) + "T12:00:00Z");
      return new Date(d.getTime() + Number(days || 0) * 86400000).toISOString().slice(0, 10);
    };
    const isFaturadoBoletoMethod = (m) => ["boleto_faturado", "faturado_boleto", "boleto", "faturado_pj", "faturado_b2b"].includes(String(m || "").toLowerCase());
    const normalizePaymentMethodId = (m) => String(m || "").toLowerCase();
    const isFaturadoBoletoReservation = (r) => Boolean(r && (r.isFaturadoBoleto || isFaturadoBoletoMethod(r.paymentMethod) || String(r.b2bPaymentType || "").toUpperCase() === "FATURADO"));
    const getRoomMoveGroupReservations = (_db, r) => [r];
    const summarizeRoomMoveGroup = () => ({ isRoomMoveGroup: false });
    const getPackageReservations = (targetDb, pkgCode) => (targetDb.reservations || []).filter(x => (x.packageCode || x.packageId) === pkgCode);
    const isPackageItemActive = (x) => !["cancelada", "cancelled", "expirada", "no_show"].includes(String(x?.status || "").toLowerCase());
    const isReservationCheckoutClosedForNfse = (x) => Boolean(x?.checkoutDone || x?.status === "completed" || x?.status === "checked_out");
    const resolveBoletoPayerData = (r, payerType) => ({
      nome: payerType === "company" ? (r?.companyName || "Empresa Teste") : (r?.guestName || "Hóspede Teste"),
      cpfCnpj: payerType === "company" ? onlyDigits(r?.companyCnpj || "12345678000199") : onlyDigits(r?.guestDocument || "52998224725"),
      email: r?.guestEmail || "fin@empresa.com.br",
      telefone: r?.guestPhone || "22999990000"
    });
    const resolveReservationBillingRecipientsList = () => ({
      flags: { guest: false, requester: false, company: true, financialResponsible: false, sendEmail: false, sendWhatsapp: false, sendWhatsApp: false },
      financialResponsible: { name: "", email: "", phone: "", document: "" },
      recipients: []
    });
    const findExistingInvoiceForReservation = (targetDb, { reservationId }) =>
      (targetDb.invoices || []).find(i => Number(i.reservationId) === Number(reservationId)) || null;
    const enrichBoletoDynamicStatus = (b) => ({ ...b });
    const syncBoletoWithAccountsReceivable = () => {};
    const saveDatabase = () => {};
    const doesBoletoCoverReservation = (b, r) => Number(b.reservationId) === Number(r.id) || (Array.isArray(b.reservationIds) && b.reservationIds.includes(Number(r.id)));
    const buildB2bNfseDescription = (r) => "Hospedagem Reserva " + (r?.code || r?.id);
    const issueInterBoleto = async (args) => {
      if (hooks.onIssueBoleto) hooks.onIssueBoleto(args);
      return {
        seuNumero: args.seuNumero,
        nossoNumero: "007890001",
        codigoSolicitacao: "SOL-" + args.seuNumero,
        codigoBarras: "077919924000006000000011120000000007890001",
        linhaDigitavel: "07790.00116 12000.007892 00010.000001 1 99240000060000",
        pixCopiaECola: "00020126580014br.gov.bcb.pix",
        txId: "TX" + args.seuNumero,
        provider: "SIMULATED",
        simulated: true,
        interSynced: false,
        interLastSyncedAt: new Date().toISOString(),
        pagador: {
          nome: args.payer?.nome || args.payer?.name || "Pagador",
          cpfCnpj: onlyDigits(args.payer?.cpfCnpj || args.payer?.document || "12345678000199"),
          email: args.payer?.email || ""
        }
      };
    };
    const getPrimaryEmail = (raw) => String(raw || "").split(/[;,]/)[0]?.trim() || "";
    const isGenericPelincaAddr = () => false;
    const isGenericPelincaBairro = () => false;
    const isGenericPelincaCep = () => false;
    const executeNfseEmissionInternal = async (p) => {
      const inv = {
        id: (db.invoices.length || 0) + 500,
        numeroNfse: "2026001",
        reservationId: p.reservationId || p.reservation?.id,
        valorServico: Number(p.valorServico || 0),
        status: "autorizada",
        danfseUrl: "/api/nfse/500/pdf"
      };
      db.invoices.push(inv);
      return { success: true, invoice: inv };
    };
    const emitReservationOfficialNfse = async (targetDb, opts) => {
      const inv = {
        id: (targetDb.invoices.length || 0) + 500,
        numeroNfse: "2026001",
        reservationId: opts.reservation?.id,
        valorServico: Number(opts.valorServico || 0),
        status: "autorizada",
        danfseUrl: "/api/nfse/500/pdf"
      };
      targetDb.invoices.push(inv);
      return { invoice: inv };
    };
    const dispatchFaturadoBillingPackage = async (pkg) => ({ sent: true, count: (pkg.boletos || []).length });
    const getFiscalData = () => ({});
    const normalizeNfseChannelRules = () => ({ autoCheckout: true });
    const buildReservationMinibarStatement = (r) => ({
      isCheckedOut: Boolean(r?.checkoutDone || r?.status === "completed"),
      hasFinalCheckoutInspection: Boolean(r?.finalMinibarInspectionAt)
    });
    const _inFlightCheckoutAutoNfse = new Set();
    let _checkoutAutoNfseTestHooks = null;

    ${fns}

    return {
      normalizeBoletoConsumptionMode,
      resolveReservationBoletoConsumptionMode,
      isReservationConsumptionFaturado,
      applyCrmBillingConfigFields,
      computeReservationAccommodationAndConsumption,
      buildSinglePreBoletoFromReservation,
      emitCheckoutFaturadoPackage,
      runCheckoutAutoBillingAndNfse
    };
    `
  );

  return factory(mockDb, hooks);
}

describe("Pagamento Faturado — Seleção Consumo Faturado (Sim vs Não)", () => {
  it("1. Normaliza corretamente os modos not_billed, single e separate respeitando retrocompatibilidade e novo padrão", () => {
    const mockDb = { reservations: [], companies: [], agencies: [], guests: [], boletos: [], invoices: [], minibarOrders: [] };
    const rt = buildIsolatedRuntime(mockDb);

    assert.equal(rt.normalizeBoletoConsumptionMode("not_billed"), "not_billed");
    assert.equal(rt.normalizeBoletoConsumptionMode("guest_individual"), "not_billed");
    assert.equal(rt.normalizeBoletoConsumptionMode("nao"), "not_billed");
    assert.equal(rt.normalizeBoletoConsumptionMode(false), "not_billed");
    assert.equal(rt.normalizeBoletoConsumptionMode("separate_boletos"), "separate");
    assert.equal(rt.normalizeBoletoConsumptionMode("single_boleto"), "single");
    assert.equal(rt.normalizeBoletoConsumptionMode(undefined, "not_billed"), "not_billed");
    assert.equal(rt.normalizeBoletoConsumptionMode(undefined, "single"), "single");

    // Reserva antiga já salva sem campo explícito preserva retrocompatibilidade ("single")
    const legacyRes = { id: 1, isFaturadoBoleto: true, paymentMethod: "boleto_faturado" };
    assert.equal(rt.resolveReservationBoletoConsumptionMode(legacyRes, mockDb), "single");
    assert.equal(rt.isReservationConsumptionFaturado(legacyRes, mockDb), true);

    // Nova reserva com Consumo Faturado = Não ("not_billed")
    const newResNoCons = { id: 2, isFaturadoBoleto: true, paymentMethod: "boleto_faturado", boletoConsumptionMode: "not_billed", isConsumptionFaturado: false };
    assert.equal(rt.resolveReservationBoletoConsumptionMode(newResNoCons, mockDb), "not_billed");
    assert.equal(rt.isReservationConsumptionFaturado(newResNoCons, mockDb), false);

    // Reserva individual PIX nunca tem consumo faturado
    const indivRes = { id: 3, isFaturadoBoleto: false, paymentMethod: "pix" };
    assert.equal(rt.isReservationConsumptionFaturado(indivRes, mockDb), false);
  });

  it("2. Quando Consumo Faturado = Não: exclui frigobar do Pré-Boleto e do Boleto da empresa, emitindo já no check-out sem esperar conferência", async () => {
    const mockDb = {
      companies: [{ id: 10, corporateName: "Empresa Só Hospedagem LTDA", cnpj: "12345678000199", defaultBoletoConsumptionMode: "not_billed", defaultBoletoTermDays: 28 }],
      agencies: [],
      guests: [],
      boletos: [],
      invoices: [],
      reservations: [
        {
          id: 101,
          code: "RES-514-0101",
          flatId: 2,
          flatNumber: "514",
          guestName: "Mariana Individual",
          guestDocument: "39053344705",
          companyId: 10,
          companyName: "Empresa Só Hospedagem LTDA",
          companyCnpj: "12345678000199",
          checkinDate: "2026-11-20",
          checkoutDate: "2026-11-24",
          totalAmount: 800,
          paidAmount: 0,
          paymentMethod: "boleto_faturado",
          isFaturadoBoleto: true,
          boletoConsumptionMode: "not_billed",
          isConsumptionFaturado: false,
          autoEmitBoletoOnCheckout: true,
          checkoutDone: true,
          status: "completed",
          finalMinibarInspectionAt: null // Conferência do frigobar AINDA NÃO FEITA!
        }
      ],
      minibarOrders: [
        {
          id: "ORD-MB-LANC-101",
          reservationId: 101,
          reservationCode: "RES-514-0101",
          flatNumber: "514",
          source: "restocker_launch",
          paymentStatus: "pendente",
          totalAmount: 65,
          remainingAmount: 65,
          items: [{ productId: "coca", productName: "Coca-Cola", quantity: 5, unitPrice: 13, totalPrice: 65 }]
        }
      ]
    };

    const rt = buildIsolatedRuntime(mockDb);
    const r = mockDb.reservations[0];

    const bd = rt.computeReservationAccommodationAndConsumption(r, mockDb);
    assert.equal(bd.accommodationAmount, 800);
    assert.equal(bd.consumptionAmount, 65, "Mantém registro informativo do consumo real na estadia");
    assert.equal(bd.netConsumptionBoletoAmount, 0, "Não inclui consumo no saldo do boleto faturado");
    assert.equal(bd.netTotalBoletoAmount, 800, "Total líquido do boleto faturado deve ser estritamente a hospedagem");
    assert.deepEqual(bd.minibarOrderIds, [], "Não vincula minibarOrderIds ao boleto da empresa");

    const pre = rt.buildSinglePreBoletoFromReservation(r, mockDb);
    assert.equal(pre.amount, 800, "Pré-boleto deve prever somente R$ 800 de hospedagem");
    assert.equal(pre.consumptionAmount, 0);
    assert.equal(pre.guestConsumptionAmount, 65);
    assert.equal(pre.isConsumptionFaturado, false);

    // Check-out automático: emite imediatamente sem esperar finalMinibarInspectionAt!
    const autoOut = await rt.runCheckoutAutoBillingAndNfse(r, { triggerSource: "reception_pms" });
    assert.equal(Boolean(autoOut.waitingMinibarInspection), false, "Não deve aguardar conferência de frigobar quando consumo = Não");
    assert.equal(autoOut.autoBoletosEmitted, true);
    assert.equal(autoOut.boletos.length, 1);
    assert.equal(autoOut.boletos[0].amount, 800);
    assert.equal(autoOut.boletos[0].billingScope, "accommodation_only");
    assert.deepEqual(autoOut.boletos[0].minibarOrderIds, []);
    assert.equal(mockDb.minibarOrders[0].paymentStatus, "pendente", "Pedido de frigobar permanece pendente para pagamento individual do hóspede");
  });

  it("3. Quando Consumo Faturado = Sim: check-out aguarda conferência pós-check-out do frigobar e emite já com consumo real após conferência", async () => {
    const mockDb = {
      companies: [{ id: 20, corporateName: "Empresa Completa LTDA", cnpj: "33000167000101", defaultBoletoConsumptionMode: "separate", defaultBoletoTermDays: 15 }],
      agencies: [],
      guests: [],
      boletos: [],
      invoices: [],
      reservations: [
        {
          id: 202,
          code: "RES-512-0202",
          flatId: 1,
          flatNumber: "512",
          guestName: "Carlos Corporativo",
          guestDocument: "52998224725",
          companyId: 20,
          companyName: "Empresa Completa LTDA",
          companyCnpj: "33000167000101",
          checkinDate: "2026-11-21",
          checkoutDate: "2026-11-24",
          totalAmount: 900,
          paidAmount: 0,
          paymentMethod: "boleto_faturado",
          isFaturadoBoleto: true,
          boletoConsumptionMode: "separate",
          isConsumptionFaturado: true,
          autoEmitBoletoOnCheckout: true,
          checkoutDone: true,
          status: "completed",
          finalMinibarInspectionAt: null
        }
      ],
      minibarOrders: []
    };

    const rt = buildIsolatedRuntime(mockDb);
    const r = mockDb.reservations[0];

    // 1º Momento: Check-out antes da conferência do frigobar -> aguarda conferência!
    const atCheckout = await rt.runCheckoutAutoBillingAndNfse(r, { triggerSource: "reception_pms" });
    assert.equal(atCheckout.skipped, true);
    assert.equal(atCheckout.waitingMinibarInspection, true);
    assert.equal(r.autoBoletoStatus, "waiting_minibar_inspection");
    assert.equal(mockDb.boletos.length, 0, "Nenhum boleto deve ser emitido antes da conferência final quando consumo = Sim");

    // 2º Momento: Repositora registra conferência pós-check-out com R$ 95 de frigobar
    mockDb.minibarOrders.push({
      id: "ORD-MB-DIV-202",
      reservationId: 202,
      reservationCode: "RES-512-0202",
      flatNumber: "512",
      source: "anserve_discrepancy",
      paymentStatus: "pendente",
      totalAmount: 95,
      remainingAmount: 95,
      items: [{ productId: "heineken", productName: "Heineken", quantity: 5, unitPrice: 19, totalPrice: 95 }]
    });
    r.finalMinibarInspectionAt = "2026-11-24T15:30:00.000Z";

    const afterInspection = await rt.runCheckoutAutoBillingAndNfse(r, { triggerSource: "post_checkout_minibar_inspection" });
    assert.equal(afterInspection.autoBoletosEmitted, true);
    assert.equal(afterInspection.boletos.length, 2, "Deve emitir os 2 boletos separados (Hospedagem + Consumo) após conferência");
    const hospBol = afterInspection.boletos.find(b => b.billingScope === "accommodation_only");
    const consBol = afterInspection.boletos.find(b => b.billingScope === "consumption_only");
    assert.equal(hospBol.amount, 900);
    assert.equal(consBol.amount, 95);
    assert.deepEqual(consBol.minibarOrderIds, ["ORD-MB-DIV-202"]);
    assert.equal(afterInspection.invoice.valorServico, 900, "NFS-e permanece exclusivamente no valor da hospedagem");
  });

  it("4. Verifica regras de importação B2B no zoho-mail-service e supressão/liberação no demo-server", () => {
    assert.ok(
      zohoSrc.includes("boletoConsumptionMode: resolvedConsMode"),
      "zoho-mail-service.mjs deve definir boletoConsumptionMode a partir das despesas autorizadas do voucher e padrão CRM"
    );
    assert.ok(
      demoSrc.includes('postCheckoutNotificationType = isTargetConsumptionFaturado\n        ? "faturado_informational_summary"'),
      "Conferência pós-check-out deve enviar resumo informativo sem link de pagamento quando consumo é faturado"
    );
    assert.ok(
      demoSrc.includes('code: "CONSUMPTION_BILLED_TO_COMPANY"'),
      "API de pedidos do frigobar deve bloquear cobrança duplicada no portal quando consumo é faturado"
    );
  });
});
