import assert from "node:assert/strict";
import { resolveWhatsAppTags, renderTemplateButtons, DEFAULT_WHATSAPP_TEMPLATES } from "../scripts/zapi-service.mjs";

console.log("▶ Iniciando teste pontual: Extensão de Reserva com Múltiplos Pagamentos (RES-113-0524)");

// 1. Simulação da Reserva RES-113-0524 quitada com Booking + PIX
const mockFullyPaidReservation = {
  id: 524,
  code: "RES-113-0524",
  guestName: "Cassio Leonardo Bragança Freitas",
  guestPhone: "+55 21 98630-9377",
  flatNumber: "113",
  checkinDate: "2026-10-26",
  checkoutDate: "2026-10-31",
  channel: "booking",
  totalAmount: 800.40,
  totalPrice: 800.40,
  paidAmount: 800.40,
  amountPaid: 800.40,
  paymentStatus: "pago_total",
  dailyRates: [
    { date: "2026-10-26", rate: 142.20, channel: "booking" },
    { date: "2026-10-27", rate: 165.90, channel: "booking" },
    { date: "2026-10-28", rate: 158.00, channel: "booking" },
    { date: "2026-10-29", rate: 134.30, channel: "booking" },
    { date: "2026-10-30", rate: 150.00, channel: "whatsapp", notes: "Diária extra" }
  ],
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking", date: "2026-10-25T23:21", notes: "Pagamento integral" },
    { id: "pay_2", amount: 150.00, method: "pix", date: "2026-10-28T18:26:44", notes: "Complemento PIX" }
  ],
  _changesContext: [
    { field: "checkoutDate", label: "Data de Saída (Check-out)", oldValue: "30/10/2026", newValue: "31/10/2026" },
    { field: "totalAmount", label: "Valor Total", oldValue: "R$ 650,40", newValue: "R$ 800,40" }
  ]
};

const mockDb = {
  settings: {
    hotelAddress: "Rua Conselheiro Otaviano, 209",
    adminWhatsApp: "5522997124021"
  },
  siteConfig: {
    branding: { brandName: "CorpFlats" }
  }
};

const tplDef = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_additional_daily_pending");
assert.ok(tplDef, "Template tpl_additional_daily_pending deve existir");

// 2. Renderização do texto para a reserva 100% quitada (com templateOrEvent explícito)
const renderedText = resolveWhatsAppTags(
  tplDef.message,
  mockFullyPaidReservation,
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);

console.log("--- Mensagem Renderizada (Quitada) ---");
console.log(renderedText);
console.log("--------------------------------------");

// Asserções para reserva quitada:
assert.ok(renderedText.includes("Valor Total Atualizado: *R$ 800,40*"), "Deve conter Valor Total Atualizado: R$ 800,40");
assert.ok(renderedText.includes("Valor Já Pago: *R$ 800,40*"), "Deve conter Valor Já Pago: R$ 800,40");
assert.ok(renderedText.includes("Situação do Pagamento: *Pago Integralmente*"), "Deve constar Situação do Pagamento: Pago Integralmente");
assert.ok(!renderedText.includes("Saldo Pendente da Diária Adicional"), "NÃO deve conter bloco de Saldo Pendente");
assert.ok(!renderedText.includes("PIX Copia e Cola"), "NÃO deve conter bloco de PIX Copia e Cola");
assert.ok(!renderedText.includes("00020101"), "NÃO deve conter payload PIX Copia e Cola");
assert.ok(renderedText.includes("Você pode consultar os detalhes atualizados da sua estadia em seu portal seguro:"), "Deve conter texto de consulta ao portal");

// 3. Renderização sem templateOrEvent explícito (garante detecção robusta por assinatura de texto)
const renderedTextNoParam = resolveWhatsAppTags(
  tplDef.message,
  mockFullyPaidReservation,
  mockDb,
  "https://corpflats.com.br",
  "guest"
);
assert.ok(renderedTextNoParam.includes("Situação do Pagamento: *Pago Integralmente*"), "Deve constar Situação do Pagamento: Pago Integralmente mesmo sem templateOrEvent explícito");
assert.ok(!renderedTextNoParam.includes("Saldo Pendente da Diária Adicional"), "NÃO deve conter bloco de Saldo Pendente mesmo sem templateOrEvent explícito");

// 4. Renderização dos botões para a reserva 100% quitada
const buttons = renderTemplateButtons(
  tplDef.buttons,
  mockFullyPaidReservation,
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);

console.log("--- Botões Renderizados (Quitada) ---");
console.log(JSON.stringify(buttons, null, 2));
console.log("-------------------------------------");

assert.ok(!buttons.some(b => b.id === "btn_pix" || b.type === "COPY"), "Botão PIX deve ser suprimido quando quitada");
const payBtn = buttons.find(b => b.id === "btn_pagar");
assert.ok(payBtn, "Botão de detalhes deve estar presente");
assert.equal(payBtn.label, "🏨 Ver Detalhes da Reserva", "Rótulo do botão deve ser '🏨 Ver Detalhes da Reserva' sem cobrar");

// 4b. Teste de Borda: Reserva com saldo zero / cortesia (totalAmount=0, paidAmount=0)
const zeroBalanceButtons = renderTemplateButtons(
  tplDef.buttons,
  { id: 999, code: "RES-CORTESIA", totalAmount: 0, paidAmount: 0, paymentStatus: "confirmada" },
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);
assert.ok(!zeroBalanceButtons.some(b => b.id === "btn_pix" || b.type === "COPY"), "Botão PIX deve ser suprimido em reserva cortesia de saldo zero");
const zeroPayBtn = zeroBalanceButtons.find(b => b.id === "btn_pagar");
assert.ok(zeroPayBtn, "Botão de detalhes deve estar presente para cortesia");
assert.equal(zeroPayBtn.label, "🏨 Ver Detalhes da Reserva", "Botão não deve cobrar em reserva cortesia");

// 5. Teste de regressão: Reserva com saldo verdadeiramente pendente
const mockPendingReservation = {
  ...mockFullyPaidReservation,
  totalAmount: 800.40,
  paidAmount: 650.40,
  amountPaid: 650.40,
  paymentStatus: "sinal_pago",
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking" }
  ]
};

const pendingText = resolveWhatsAppTags(
  tplDef.message,
  mockPendingReservation,
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);

assert.ok(pendingText.includes("Valor Já Pago: *R$ 650,40*"), "Deve indicar R$ 650,40 já pagos");
assert.ok(pendingText.includes("Saldo Pendente da Diária Adicional"), "Deve conter bloco de saldo pendente quando houver pendência");
assert.ok(pendingText.includes("PIX Copia e Cola"), "Deve conter PIX Copia e Cola quando houver pendência");
assert.ok(pendingText.includes("Situação do Pagamento: *Pago Parcialmente (Saldo de diária adicional em aberto)*"), "Situação do pagamento deve ser parcial quando há saldo pendente");

const pendingButtons = renderTemplateButtons(
  tplDef.buttons,
  mockPendingReservation,
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);
assert.ok(pendingButtons.some(b => b.id === "btn_pix"), "Botão PIX deve estar presente quando houver saldo pendente");
const pendingPayBtn = pendingButtons.find(b => b.id === "btn_pagar");
assert.ok(pendingPayBtn, "Botão pagar deve estar presente");
assert.equal(pendingPayBtn.label, "💳 Ver Detalhes & Pagar", "Rótulo deve ser '💳 Ver Detalhes & Pagar' quando há saldo pendente");

// 5b. Teste Crítico: Reserva OTA com saldo pendente (R$ 150) mas com paymentStatus='pago_total' residual no registro
const mockPendingWithPagoTotalStatus = {
  ...mockPendingReservation,
  paymentStatus: "pago_total" // status residual comum em OTAs importadas antes da extensão
};
const pendingOtaText = resolveWhatsAppTags(
  tplDef.message,
  mockPendingWithPagoTotalStatus,
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);
assert.ok(pendingOtaText.includes("Situação do Pagamento: *Pago Parcialmente (Saldo de diária adicional em aberto)*"), "Mesmo com paymentStatus='pago_total' no registro, se há saldo pendente deve constar Parcial");
assert.ok(!pendingOtaText.includes("Pago Integralmente"), "NÃO deve constar Pago Integralmente quando há R$ 150 pendentes");
assert.ok(pendingOtaText.includes("Saldo Pendente da Diária Adicional"), "Deve exibir bloco de saldo pendente");
assert.ok(pendingOtaText.includes("PIX Copia e Cola"), "Deve exibir PIX Copia e Cola");

const pendingOtaButtons = renderTemplateButtons(
  tplDef.buttons,
  mockPendingWithPagoTotalStatus,
  mockDb,
  "https://corpflats.com.br",
  "guest",
  tplDef
);
assert.ok(pendingOtaButtons.some(b => b.id === "btn_pix"), "Botão PIX DEVE estar presente quando há saldo pendente, mesmo com status pago_total residual");

// 6. Testes do Cálculo de Quitação na Edição (PUT) para OTA e Canais Diretos
function simulatePutPaymentResolution(reservation, reqBody) {
  const r = { ...reservation };
  let explicitPaymentsSumOnPut = null;
  if (Array.isArray(reqBody.payments)) {
    r.payments = reqBody.payments.map(p => ({ ...p }));
    explicitPaymentsSumOnPut = r.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }

  const putChanLower = String(r.channel || "").toLowerCase();
  const putIsOta = putChanLower.includes("booking") || putChanLower.includes("airbnb");
  const isB2b = putChanLower === "b2b" || putChanLower.includes("b2b") || Boolean(r.b2bReservationNumber);
  const currentTot = Number(reqBody.totalAmount !== undefined ? reqBody.totalAmount : r.totalAmount) || 0;
  r.totalAmount = currentTot;

  const existingPaymentsSum = Array.isArray(r.payments) && r.payments.length > 0
    ? r.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    : 0;
  const totalPaymentsReceived = Math.round(Math.max(
    explicitPaymentsSumOnPut !== null ? explicitPaymentsSumOnPut : 0,
    reqBody.paidAmount !== undefined ? Number(reqBody.paidAmount) : 0,
    reqBody.amountPaid !== undefined ? Number(reqBody.amountPaid) : 0,
    Number(r.paidAmount) || 0,
    Number(r.amountPaid) || 0,
    existingPaymentsSum
  ) * 100) / 100;

  const hasDirectDailyRateInOta = Array.isArray(r.dailyRates) && r.dailyRates.some(d => {
    const dc = String(d?.channel || "").toLowerCase();
    return dc && !dc.includes("booking") && !dc.includes("airbnb") && !dc.includes("b2b");
  });
  const addedDirectRatesSum = Number(reqBody.addedDirectRatesSum || 0);
  const addedOtaRatesSum = Number(reqBody.addedOtaRatesSum || 0);
  const nightsChangedOnEdit = Boolean(reqBody.nightsChangedOnEdit);
  const newNightsCount = Number(reqBody.newNightsCount || 0);
  const oldNightsCount = Number(reqBody.oldNightsCount || 0);
  const oldTotalAmount = Number(reservation.totalAmount !== undefined ? reservation.totalAmount : reservation.totalPrice) || 0;
  const oldPaidAmount = Number(reservation.paidAmount !== undefined ? reservation.paidAmount : reservation.amountPaid) || 0;

  const isFullyPaidByPayments = currentTot > 0 && totalPaymentsReceived >= currentTot - 0.01;
  const isFullyPaidOnPut = isFullyPaidByPayments || (
    putIsOta &&
    (reqBody.paymentStatus === "pago_total" || reqBody.paymentStatus === "pago") &&
    !hasDirectDailyRateInOta &&
    addedDirectRatesSum <= 0 &&
    !(nightsChangedOnEdit && newNightsCount > oldNightsCount && totalPaymentsReceived < currentTot - 0.01) &&
    !(currentTot > oldTotalAmount + 0.01 && addedOtaRatesSum < currentTot - oldTotalAmount - 0.01 && totalPaymentsReceived < currentTot - 0.01)
  );

  if (isFullyPaidByPayments) {
    r.paymentStatus = "pago_total";
    r.paidAmount = Math.max(currentTot, totalPaymentsReceived);
  }

  if (isB2b) {
    if (r.b2bRatePolicy) {
      const commPct = r.b2bCommissionPct !== undefined && r.b2bCommissionPct !== null
        ? Number(r.b2bCommissionPct)
        : (r.b2bRatePolicy === "COMISSIONADA" ? 12 : 0);
      r.b2bCommissionPct = commPct;
      r.b2bCommissionAmount = Number((((Number(r.totalAmount) || 0) * commPct) / 100).toFixed(2));
      r.b2bNetAmount = Number(((Number(r.totalAmount) || 0) - r.b2bCommissionAmount).toFixed(2));
    }
    r.pixCopiaECola = "";
    r.pixChargedAmount = 0;
  } else if (putIsOta) {
    const otaMethod = putChanLower.includes("booking") ? "booking" : "airbnb";
    const hasOtaPartialPendingExtension = Boolean(
      !isFullyPaidOnPut &&
      currentTot > 0 &&
      totalPaymentsReceived < currentTot - 0.01
    );

    if (hasOtaPartialPendingExtension) {
      r.paidAmount = totalPaymentsReceived;
      r.paymentStatus = "sinal_pago";
    } else {
      if (!r.paymentMethod) r.paymentMethod = otaMethod;
      if (reqBody.paymentStatus === undefined || isFullyPaidOnPut || !r.paymentStatus || r.paymentStatus === "pendente" || r.paymentStatus === "sinal_pago" || r.paymentStatus === "parcial") {
        r.paymentStatus = "pago_total";
      }
      if (currentTot > 0) {
        r.paidAmount = Math.max(currentTot, totalPaymentsReceived);
      }
      if (!Array.isArray(r.payments) || r.payments.length === 0) {
        r.payments = [{ id: "pay_ota", amount: currentTot, method: otaMethod }];
      } else if (r.payments.length === 1 && (!r.payments[0].method || r.payments[0].method === otaMethod)) {
        r.payments[0].amount = currentTot;
      }
    }
  } else {
    const effectivePaidAfterOtaExt = Math.max(Number(r.paidAmount) || 0, totalPaymentsReceived);
    const hasUnpaidDirectExtension = Boolean(
      !isFullyPaidOnPut &&
      oldPaidAmount > 0 &&
      currentTot > Math.round((oldPaidAmount + addedOtaRatesSum) * 100) / 100 + 0.01 &&
      (addedDirectRatesSum > 0 || (nightsChangedOnEdit && newNightsCount > oldNightsCount) || currentTot > oldTotalAmount + 0.01) &&
      (explicitPaymentsSumOnPut === null || explicitPaymentsSumOnPut < currentTot - 0.01) &&
      (reqBody.paidAmount === undefined || Number(reqBody.paidAmount) < currentTot - 0.01) &&
      totalPaymentsReceived < currentTot - 0.01
    );
    if (hasUnpaidDirectExtension) {
      r.paidAmount = effectivePaidAfterOtaExt;
      r.paymentStatus = "sinal_pago";
    } else if ((effectivePaidAfterOtaExt >= currentTot - 0.01 || (isFullyPaidOnPut && totalPaymentsReceived >= currentTot - 0.01)) && currentTot > 0) {
      r.paidAmount = Math.max(currentTot, totalPaymentsReceived);
      r.paymentStatus = "pago_total";
    }
  }

  r.totalPrice = r.totalAmount;
  r.amountPaid = r.paidAmount;
  return r;
}

// 6a. Cenário OTA RES-113-0524: Extensão com 2 pagamentos quitando integralmente
const resOtaSim = simulatePutPaymentResolution({
  id: 524,
  channel: "booking",
  totalAmount: 650.40,
  paidAmount: 800.40,
  amountPaid: 800.40,
  paymentStatus: "sinal_pago",
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking" },
    { id: "pay_2", amount: 150.00, method: "pix" }
  ]
}, { totalAmount: 800.40 });

assert.equal(resOtaSim.paymentStatus, "pago_total", "Cenário OTA 524 deve normalizar para pago_total");
assert.equal(resOtaSim.paidAmount, 800.40, "paidAmount deve ser 800.40");
assert.equal(resOtaSim.totalPrice, 800.40, "totalPrice deve ser 800.40");
assert.equal(resOtaSim.payments.length, 2, "Array de pagamentos com 2 itens não pode ser sobrescrito");

// 6b. Cenário Canal Direto (WhatsApp) com múltiplos pagamentos quitando integralmente
const resDirectSim = simulatePutPaymentResolution({
  id: 601,
  channel: "whatsapp",
  totalAmount: 650.40,
  paidAmount: 650.40,
  paymentStatus: "pago_total",
  payments: [
    { id: "pay_d1", amount: 650.40, method: "pix" },
    { id: "pay_d2", amount: 150.00, method: "pix" }
  ]
}, { totalAmount: 800.40 });

assert.equal(resDirectSim.paymentStatus, "pago_total", "Cenário direto deve reconhecer quitação com múltiplos pagamentos");
assert.equal(resDirectSim.paidAmount, 800.40, "paidAmount direto deve ser 800.40");

// 6c. Edge Case [R1-1]: Operador envia reqBody.paymentStatus = "sinal_pago" quando a reserva já está paga
const resOperatorDowngradeAttempt = simulatePutPaymentResolution({
  id: 524,
  channel: "booking",
  totalAmount: 800.40,
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking" },
    { id: "pay_2", amount: 150.00, method: "pix" }
  ]
}, { totalAmount: 800.40, paymentStatus: "sinal_pago" });

assert.equal(resOperatorDowngradeAttempt.paymentStatus, "pago_total", "Operador não deve conseguir rebaixar para sinal_pago se total já foi pago");

// 6d. Edge Case [R1-2]: Edição OTA onde total diminui para menos do que o total original
const resOtaReducedStay = simulatePutPaymentResolution({
  id: 524,
  channel: "booking",
  totalAmount: 650.40,
  paidAmount: 650.40,
  paymentStatus: "pago_total",
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking" }
  ]
}, { totalAmount: 500.00 });

assert.equal(resOtaReducedStay.paymentStatus, "pago_total", "Reserva OTA reduzida deve permanecer como pago_total");
assert.ok(resOtaReducedStay.paidAmount >= 500.00, "paidAmount deve cobrir o novo total");

// 6e. Cenário de extensão com saldo verdadeiramente pendente
const resOtaRealPending = simulatePutPaymentResolution({
  id: 524,
  channel: "booking",
  totalAmount: 650.40,
  paidAmount: 650.40,
  paymentStatus: "pago_total",
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking" }
  ]
}, { totalAmount: 800.40 });

assert.equal(resOtaRealPending.paymentStatus, "sinal_pago", "Extensão sem quitação deve assumir sinal_pago");
assert.equal(resOtaRealPending.paidAmount, 650.40, "paidAmount preserva valor pago anteriormente");

// 6f. Extensão onde formulário do PMS envia paymentStatus="pago_total" (status anterior) com acréscimo de noites mas pagamentos não cobrem
const resOtaExtNightsUnpaid = simulatePutPaymentResolution({
  id: 524,
  channel: "booking",
  totalAmount: 650.40,
  paidAmount: 650.40,
  paymentStatus: "pago_total",
  payments: [
    { id: "pay_1", amount: 650.40, method: "booking" }
  ]
}, {
  totalAmount: 800.40,
  paymentStatus: "pago_total",
  nightsChangedOnEdit: true,
  oldNightsCount: 4,
  newNightsCount: 5
});

assert.equal(resOtaExtNightsUnpaid.paymentStatus, "sinal_pago", "Extensão de noites não quitada não pode virar pago_total mesmo com paymentStatus pré-preenchido");
assert.equal(resOtaExtNightsUnpaid.paidAmount, 650.40, "paidAmount não deve ser inflado sem pagamento real");

// 6g. Open Issues Ledger [R2-1]: Extensão de reserva corporativa B2B faturada com comissão (12%)
const resB2bExtended = simulatePutPaymentResolution({
  id: 406,
  code: "B2B-25057926",
  channel: "b2b",
  b2bReservationNumber: "25057926",
  b2bPaymentType: "FATURADO",
  b2bRatePolicy: "COMISSIONADA",
  b2bCommissionPct: 12,
  b2bCommissionAmount: 108.00,
  b2bNetAmount: 792.00,
  totalAmount: 900.00,
  paidAmount: 0,
  paymentStatus: "pendente",
  payments: []
}, {
  totalAmount: 1500.00,
  nightsChangedOnEdit: true,
  oldNightsCount: 3,
  newNightsCount: 5
});

assert.equal(resB2bExtended.totalAmount, 1500.00, "Novo total da reserva B2B deve ser 1500.00");
assert.equal(resB2bExtended.b2bCommissionAmount, 180.00, "Comissão B2B de 12% deve ser recalculada para 180.00");
assert.equal(resB2bExtended.b2bNetAmount, 1320.00, "Valor líquido B2B deve ser recalculado para 1320.00");
assert.equal(resB2bExtended.pixCopiaECola, "", "PIX Copia e Cola deve ser limpo para B2B faturado");

// 6h. Reserva B2B que recebe quitação integral via pagamento registrado
const resB2bPaidInFull = simulatePutPaymentResolution({
  id: 406,
  channel: "b2b",
  b2bReservationNumber: "25057926",
  totalAmount: 1500.00,
  paymentStatus: "pendente",
  payments: []
}, {
  totalAmount: 1500.00,
  payments: [{ id: "pay_b2b_settle", amount: 1500.00, method: "pix" }]
});
assert.equal(resB2bPaidInFull.paymentStatus, "pago_total", "Reserva B2B quitada por pagamento real deve ser pago_total");
assert.equal(resB2bPaidInFull.paidAmount, 1500.00, "paidAmount da B2B quitada deve ser 1500.00");

// 6i. Teste de Borda: Reserva Direta com aumento de tarifa/taxa de limpeza sem alteração de datas
const resDirectFeeIncrease = simulatePutPaymentResolution({
  id: 701,
  channel: "whatsapp",
  totalAmount: 650.40,
  paidAmount: 650.40,
  paymentStatus: "pago_total",
  checkinDate: "2026-10-26",
  checkoutDate: "2026-10-30",
  payments: [{ id: "pay_d1", amount: 650.40, method: "pix" }]
}, {
  totalAmount: 800.40, // + R$ 150 taxa de limpeza / serviço
  paymentStatus: "pago_total", // form pre-preenchido com status anterior
  nightsChangedOnEdit: false
});

assert.equal(resDirectFeeIncrease.paymentStatus, "sinal_pago", "Reserva direta com aumento de taxa sem pagamento não pode ser quitada");
assert.equal(resDirectFeeIncrease.paidAmount, 650.40, "paidAmount deve preservar o valor pago e não inflar para 800.40");

// 6j. Teste de Borda: Reserva OTA com taxa extra adicionada sem diária OTA adicional
const resOtaFeeIncrease = simulatePutPaymentResolution({
  id: 524,
  channel: "booking",
  totalAmount: 650.40,
  paidAmount: 650.40,
  paymentStatus: "pago_total",
  payments: [{ id: "pay_1", amount: 650.40, method: "booking" }]
}, {
  totalAmount: 800.40,
  paymentStatus: "pago_total",
  nightsChangedOnEdit: false,
  addedOtaRatesSum: 0 // nenhuma diária adicional via Booking
});

assert.equal(resOtaFeeIncrease.paymentStatus, "sinal_pago", "Acréscimo de taxa em OTA sem cobertura da Booking deve assumir sinal_pago");
assert.equal(resOtaFeeIncrease.paidAmount, 650.40, "paidAmount em OTA com taxa não deve inflar");

// 7. Adversarial Test Cases (Review Round 3): Blindagem de enriquecimento e casamento de pacotes
// 7a. Multi-PIX Identifier Unification (Identificadores pertencentes à mesma transação NÃO podem ser divididos entre pagamentos distintos)
function enrichReservationPaymentsAdversarial(r) {
  if (!r || !Array.isArray(r.payments)) return [];
  const needsPixE2E = Boolean(r.pixEndToEndId) && !r.payments.some(p => p && p.endToEndId && p.endToEndId === r.pixEndToEndId);
  const needsPixTxId = Boolean(r.pixTxId) && !r.payments.some(p => p && p.txId && p.txId === r.pixTxId);
  const needsMpId = Boolean(r.mpPaymentId) && !r.payments.some(p => p && p.mpPaymentId && p.mpPaymentId === r.mpPaymentId);

  let targetPixIndex = -1;
  if (needsPixE2E || needsPixTxId) {
    const partialMatchIndex = r.payments.findIndex(p => {
      if (!p) return false;
      const method = String(p.method || "").toLowerCase();
      const isOta = method === "booking" || method === "airbnb";
      if (isOta) return false;
      return (Boolean(r.pixEndToEndId) && p.endToEndId === r.pixEndToEndId) ||
             (Boolean(r.pixTxId) && p.txId === r.pixTxId);
    });

    if (partialMatchIndex !== -1) {
      targetPixIndex = partialMatchIndex;
    } else {
      for (let i = r.payments.length - 1; i >= 0; i--) {
        const p = r.payments[i];
        if (!p) continue;
        const method = String(p.method || "").toLowerCase();
        const isOta = method === "booking" || method === "airbnb";
        const isPix = method === "pix" || /pix/i.test(method);
        if (!isOta && isPix) {
          if (r.paidAt && p.date && (String(p.date).trim() === String(r.paidAt).trim() || String(p.date).startsWith(String(r.paidAt).slice(0, 10)))) {
            targetPixIndex = i;
            break;
          }
          if (targetPixIndex === -1) {
            targetPixIndex = i;
          }
        }
      }
    }
  }

  let targetCardIndex = -1;
  if (needsMpId) {
    for (let i = r.payments.length - 1; i >= 0; i--) {
      const p = r.payments[i];
      if (!p) continue;
      const method = String(p.method || "").toLowerCase();
      const isOta = method === "booking" || method === "airbnb";
      const isCard = /cart[aã]o|card|credito|crédito|debito|débito|mercadopago|infinite/i.test(method);
      if (!isOta && isCard) {
        if (r.paidAt && p.date && (String(p.date).trim() === String(r.paidAt).trim() || String(p.date).startsWith(String(r.paidAt).slice(0, 10)))) {
          targetCardIndex = i;
          break;
        }
        if (targetCardIndex === -1) {
          targetCardIndex = i;
        }
      }
    }
  }

  return r.payments.map((p, idx) => {
    if (!p) return p;
    const method = String(p.method || "").toLowerCase();
    const isOta = method === "booking" || method === "airbnb";
    const isCard = /cart[aã]o|card|credito|crédito|debito|débito|mercadopago|infinite/i.test(method);
    const isPix = method === "pix" || /pix/i.test(method);

    const enriched = { ...p };
    if (isOta) {
      delete enriched.endToEndId;
      delete enriched.txId;
      delete enriched.pixEndToEndId;
      delete enriched.pixTxId;
      delete enriched.mpPaymentId;
    } else {
      if (isPix && idx === targetPixIndex) {
        if (!enriched.endToEndId && needsPixE2E) {
          enriched.endToEndId = r.pixEndToEndId;
        }
        if (!enriched.txId && needsPixTxId) {
          enriched.txId = r.pixTxId;
        }
      }
      if (isCard && idx === targetCardIndex) {
        if (!enriched.mpPaymentId && needsMpId) {
          enriched.mpPaymentId = r.mpPaymentId;
        }
      }
    }
    return enriched;
  });
}

const resMultiPixUnification = {
  pixEndToEndId: "E_ABC_SHARED",
  pixTxId: "TX_ABC_SHARED",
  payments: [
    { id: "pay_0", method: "pix", amount: 100, endToEndId: "E_ABC_SHARED" }, // já possui E2E, sem txId
    { id: "pay_1", method: "pix", amount: 50 } // novo pagamento PIX avulso
  ]
};
const resMultiPixResult = enrichReservationPaymentsAdversarial(resMultiPixUnification);
assert.equal(resMultiPixResult[0].endToEndId, "E_ABC_SHARED", "pay_0 preserva endToEndId");
assert.equal(resMultiPixResult[0].txId, "TX_ABC_SHARED", "pay_0 deve receber txId unificado na mesma transação");
assert.equal(resMultiPixResult[1].txId, undefined, "pay_1 NÃO deve ser poluído com txId de outra transação");
assert.equal(resMultiPixResult[1].endToEndId, undefined, "pay_1 NÃO deve ser poluído com endToEndId");

// 7b. Casamento Global em Passagem 3 quando pkg[i] já foi reivindicado
function getPaymentTitleAdversarial(payment, index, totalPayments, packages, allPayments) {
  const prefix = totalPayments > 1 ? `${index + 1}º Pagamento • ` : "";
  const paymentsList = Array.isArray(allPayments) && allPayments.length > 0 ? allPayments : [payment];

  const claimedPackageIds = new Set();
  const matchedPackages = new Array(paymentsList.length).fill(null);

  // Passagem 1: Prioriza índice correspondente se os valores baterem
  for (let i = 0; i < paymentsList.length; i++) {
    const p = paymentsList[i];
    const amt = Number(p?.amount || 0);
    const pkg = packages[i];
    if (pkg && !claimedPackageIds.has(pkg.id) && Math.abs(pkg.totalAmount - amt) < 0.5) {
      matchedPackages[i] = pkg;
      claimedPackageIds.add(pkg.id);
    }
  }

  // Passagem 2: Casa qualquer pagamento remanescente com pacote não reivindicado de mesmo valor
  for (let i = 0; i < paymentsList.length; i++) {
    if (matchedPackages[i]) continue;
    const p = paymentsList[i];
    const amt = Number(p?.amount || 0);
    const pkg = packages.find(pk => !claimedPackageIds.has(pk.id) && Math.abs(pk.totalAmount - amt) < 0.5);
    if (pkg) {
      matchedPackages[i] = pkg;
      claimedPackageIds.add(pkg.id);
    }
  }

  // Passagem 3: Quando a contagem de pacotes for igual à de pagamentos, associa com o pacote restante não reivindicado
  if (packages.length === paymentsList.length) {
    for (let i = 0; i < paymentsList.length; i++) {
      if (matchedPackages[i]) continue;
      const pkg = packages.find(pk => !claimedPackageIds.has(pk.id));
      if (pkg) {
        matchedPackages[i] = pkg;
        claimedPackageIds.add(pkg.id);
      }
    }
  }

  const matchedPkg = (index >= 0 && index < matchedPackages.length) ? matchedPackages[index] : null;

  if (matchedPkg) {
    if (matchedPkg.id === "pkg_0") {
      const chargeText = matchedPkg.chargesSum > 0
        ? ` + ${matchedPkg.chargesDescription || "Taxa de Limpeza"}`
        : "";
      return `${prefix}Reserva Inicial (${matchedPkg.nightsCount} diária${matchedPkg.nightsCount > 1 ? "s" : ""}${chargeText} — ${matchedPkg.channelLabel})`;
    } else {
      const extraLabel = matchedPkg.nightsCount > 1
        ? `${matchedPkg.nightsCount} Diárias Extras`
        : "1 Diária Extra";
      const requestLabel = matchedPkg.nightsCount > 1 ? "Solicitadas via" : "Solicitada via";
      return `${prefix}${extraLabel} (${requestLabel} ${matchedPkg.channelLabel})`;
    }
  }

  // Se houver apenas 1 pagamento cobrindo múltiplos pacotes
  if (totalPayments === 1 && packages.length > 1) {
    const extraNights = packages.slice(1).reduce((acc, p) => acc + p.nightsCount, 0);
    const extraText = extraNights > 1 ? `${extraNights} Diárias Extras` : "1 Diária Extra";
    return `Estadia Completa (Reserva Inicial + ${extraText})`;
  }

  if (packages.length === 1 && totalPayments > 1) {
    const pkg0 = packages[0];
    const noteLower = String(payment?.notes || "").toLowerCase();
    if (noteLower.includes("sinal") || noteLower.includes("entrada")) {
      return `${prefix}Sinal / Entrada (${pkg0.channelLabel})`;
    }
    if (noteLower.includes("complemento") || noteLower.includes("saldo")) {
      return `${prefix}Complemento de Saldo (${pkg0.channelLabel})`;
    }
    return `${prefix}Parcela ${index + 1} de ${totalPayments} (${pkg0.channelLabel})`;
  }

  if (index === 0) {
    return `${prefix}Reserva Inicial`;
  }
  return `${prefix}Pagamento Adicional / Complemento`;
}

const advPkgs = [
  { id: "pkg_0", totalAmount: 650.00, nightsCount: 4, channelLabel: "Booking.com", chargesSum: 50, chargesDescription: "Taxa de Limpeza" },
  { id: "pkg_1", totalAmount: 150.00, nightsCount: 1, channelLabel: "WhatsApp" }
];
const advPayments = [
  { amount: 150.00 }, // P0 casa com pkg_1 na passagem 2
  { amount: 652.00 }  // P1 tem valor ligeiramente diferente (ex. taxa bancária) e deve casar com pkg_0 restante na passagem 3
];
const titleAdvP0 = getPaymentTitleAdversarial(advPayments[0], 0, 2, advPkgs, advPayments);
const titleAdvP1 = getPaymentTitleAdversarial(advPayments[1], 1, 2, advPkgs, advPayments);
assert.equal(titleAdvP0, "1º Pagamento • 1 Diária Extra (Solicitada via WhatsApp)", "P0 deve casar com diária extra");
assert.equal(titleAdvP1, "2º Pagamento • Reserva Inicial (4 diárias + Taxa de Limpeza — Booking.com)", "P1 deve casar com pacote inicial não reivindicado em passagem 3");

// 7c. Pagamento Único que cobre múltiplos pacotes
const singlePayAdvTitle = getPaymentTitleAdversarial({ amount: 800.00 }, 0, 1, advPkgs, [{ amount: 800.00 }]);
assert.equal(singlePayAdvTitle, "Estadia Completa (Reserva Inicial + 1 Diária Extra)", "Pagamento único de múltiplos pacotes deve identificar Estadia Completa");

// 7d. Plural agreement para múltiplas diárias extras
const multiExtraPkgs = [
  { id: "pkg_0", totalAmount: 650.00, nightsCount: 4, channelLabel: "Booking.com", chargesSum: 50, chargesDescription: "Taxa de Limpeza" },
  { id: "pkg_1", totalAmount: 300.00, nightsCount: 2, channelLabel: "WhatsApp" }
];
const multiExtraTitle = getPaymentTitleAdversarial({ amount: 300.00 }, 1, 2, multiExtraPkgs, [{ amount: 650.00 }, { amount: 300.00 }]);
assert.equal(multiExtraTitle, "2º Pagamento • 2 Diárias Extras (Solicitadas via WhatsApp)", "Plural agreement deve usar 'Solicitadas via'");

console.log("✔ Todos os testes pontuais de extensão, múltiplos pagamentos e casos de borda passaram com 100% de sucesso!");
