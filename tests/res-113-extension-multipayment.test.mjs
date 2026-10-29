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

// 2. Renderização do texto para a reserva 100% quitada
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

// 3. Renderização dos botões para a reserva 100% quitada
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

// 4. Teste de regressão: Reserva com saldo verdadeiramente pendente
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

console.log("✔ Todos os testes pontuais de extensão e múltiplos pagamentos passaram com sucesso!");
