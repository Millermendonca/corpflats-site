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
  const nightsChangedOnEdit = Boolean(reqBody.nightsChangedOnEdit);
  const newNightsCount = Number(reqBody.newNightsCount || 0);
  const oldNightsCount = Number(reqBody.oldNightsCount || 0);

  const isFullyPaidByPayments = currentTot > 0 && totalPaymentsReceived >= currentTot - 0.01;
  const isFullyPaidOnPut = isFullyPaidByPayments || (
    (reqBody.paymentStatus === "pago_total" || reqBody.paymentStatus === "pago") &&
    !hasDirectDailyRateInOta &&
    addedDirectRatesSum <= 0 &&
    !(nightsChangedOnEdit && newNightsCount > oldNightsCount && totalPaymentsReceived < currentTot - 0.01)
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
    const hasUnpaidDirectExtension = Boolean(!isFullyPaidOnPut && totalPaymentsReceived < currentTot - 0.01);
    if (hasUnpaidDirectExtension) {
      r.paidAmount = effectivePaidAfterOtaExt;
      r.paymentStatus = "sinal_pago";
    } else if ((effectivePaidAfterOtaExt >= currentTot - 0.01 || isFullyPaidOnPut) && currentTot > 0) {
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

console.log("✔ Todos os testes pontuais de extensão, múltiplos pagamentos e casos de borda passaram com 100% de sucesso!");
