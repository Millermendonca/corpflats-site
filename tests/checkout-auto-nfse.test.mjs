process.env.NODE_ENV = "test";
process.env.PORT = "0";

import test from "node:test";
import assert from "node:assert/strict";
import {
  httpServer,
  db,
  runCheckoutAutoBillingAndNfse,
  normalizeFiscalChannelKey,
  normalizeNfseChannelRules,
  setCheckoutAutoNfseTestHooks
} from "../artifacts/api-server/demo-server.mjs";
import { buildOfficialNfseDraftForReservation } from "../artifacts/api-server/chat-service.mjs";
import { handleWhatsAppFiscalFlow, handleInformCheckout } from "../artifacts/api-server/whatsapp-ai-service.mjs";
import { gerenciarNotaFiscalNfseTool } from "../artifacts/api-server/agent-architecture.mjs";

const CPF_A = "52998224725";
const CPF_B = "11144477735";
const CNPJ_A = "11222333000181";
const CNPJ_B = "11444777000161";

let sentWhatsapps = [];
let sentEmails = [];
let sentNfseWhatsapps = [];
let baseUrl = "";
const origGlobalDispatchNfseWa = globalThis.dispatchNfseInvoiceWhatsApp;

function emittedInvoices() {
  return (db.invoices || []).filter(i => i && !["202600184", "202600185"].includes(String(i.numeroNfse)));
}

function resetTestData() {
  sentWhatsapps = [];
  sentEmails = [];
  sentNfseWhatsapps = [];
  db.reservations = [];
  db.invoices = [];
  db.guests = [];
  db.companies = [];
  db.agencies = [];
  db.boletos = [];
  db.cleaningRequests = [];
  db.whatsappConversations = [];
  db.notifications = [];
  db.nfseRetryQueue = [];
  db.zapiConfig = { enabled: false, testModeOnly: true };
  globalThis.dispatchNfseInvoiceWhatsApp = async (inv, opts) => {
    sentNfseWhatsapps.push({ inv, opts });
    return { success: true, sent: true, pdfSent: true, phone: opts?.phone || inv?.tomadorTelefone || "" };
  };
  db.flats = [
    { id: 101, number: "113", isOccupied: true },
    { id: 102, number: "204", isOccupied: true },
    { id: 103, number: "511", isOccupied: true }
  ];
  db.nfseConfig = {
    padrao: "nacional_adn",
    cnpjPrestador: "47.964.813/0001-65",
    inscricaoMunicipal: "142591",
    razaoSocial: "Rental Miller's LTDA",
    nomeFantasia: "CorpFlats",
    codigoMunicipio: "3301009",
    regimeTributario: "simples_nacional",
    aliquotaIss: 2.0,
    ambiente: "producao",
    autoEmitOnCheckout: true,
    channelRules: {
      direct: true,
      site: true,
      whatsapp: true,
      b2b: true,
      booking: false,
      airbnb: false,
      autoCheckout: true
    }
  };
  setCheckoutAutoNfseTestHooks({
    sendZapiMessage: async (_cfg, payload) => {
      sentWhatsapps.push(payload);
      return { success: true };
    },
    sendEmailAsync: (payload) => {
      sentEmails.push(payload);
      return { id: `mail_${sentEmails.length}`, status: "sent" };
    },
    dispatchNfseWhatsapp: async (inv, opts) => {
      sentNfseWhatsapps.push({ inv, opts });
      return { success: true, sent: true, pdfSent: true, phone: opts?.phone || inv.tomadorTelefone || "" };
    }
  });
}

test.before(async () => {
  if (!httpServer.listening) {
    await new Promise((resolve) => httpServer.once("listening", resolve));
  }
  const addr = httpServer.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  setCheckoutAutoNfseTestHooks(null);
  globalThis.dispatchNfseInvoiceWhatsApp = origGlobalDispatchNfseWa;
  await new Promise((resolve) => httpServer.close(resolve));
  setTimeout(() => process.exit(0), 50);
});

test("1. Normalização de canais (site_direto/direct/site) e chave mestra autoCheckout", async () => {
  resetTestData();
  assert.equal(normalizeFiscalChannelKey("site_direto"), "direct");
  assert.equal(normalizeFiscalChannelKey("SITE"), "direct");
  assert.equal(normalizeFiscalChannelKey("direta"), "direct");
  assert.equal(normalizeFiscalChannelKey("Booking.com"), "booking");
  assert.equal(normalizeFiscalChannelKey("Corporativo"), "b2b");

  const normRules = normalizeNfseChannelRules({ site: false, booking: true });
  assert.equal(normRules.direct, false);
  assert.equal(normRules.site, false);
  assert.equal(normRules.booking, true);
  assert.equal(normRules.autoCheckout, true);

  // Chave mestra autoCheckout = false bloqueia mesmo com autoEmitInvoice = true
  db.nfseConfig.channelRules.autoCheckout = false;
  const resBlocked = {
    id: 9001,
    code: "RES-AUTO-01",
    flatId: 101,
    flatNumber: "113",
    channel: "site_direto",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 500,
    paidAmount: 500,
    paymentStatus: "pago_total",
    guestName: "João da Silva",
    guestDocument: CPF_A,
    guestEmail: "joao@teste.com",
    guestPhone: "22999112233",
    autoEmitInvoice: true
  };
  db.reservations.push(resBlocked);
  const outBlocked = await runCheckoutAutoBillingAndNfse(resBlocked, { triggerSource: "test" });
  assert.equal(outBlocked.skipped, true);
  assert.equal(outBlocked.reason, "global_auto_checkout_disabled");
  assert.equal(emittedInvoices().length, 0);

  // Ligando chave mestra: canal site_direto emite mesmo sem flag na reserva (canal direct = true)
  db.nfseConfig.channelRules.autoCheckout = true;
  resBlocked.autoEmitInvoice = false;
  const outDirect = await runCheckoutAutoBillingAndNfse(resBlocked, { triggerSource: "test" });
  assert.equal(outDirect.autoInvoiceEmitted, true);
  assert.equal(emittedInvoices().length, 1);
  assert.equal(emittedInvoices()[0].tomadorCpfCnpj, CPF_A);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].recipient, "joao@teste.com");
  assert.equal(sentNfseWhatsapps.length, 1);

  // Canal booking OFF + autoEmitInvoice = false -> não emite
  const resBookingOff = {
    id: 9002,
    code: "RES-BK-OFF",
    flatId: 102,
    flatNumber: "204",
    channel: "Booking.com",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 400,
    paidAmount: 400,
    paymentStatus: "pago_total",
    guestName: "Maria Oliveira",
    guestDocument: CPF_B,
    autoEmitInvoice: false
  };
  db.reservations.push(resBookingOff);
  const outBkOff = await runCheckoutAutoBillingAndNfse(resBookingOff, { triggerSource: "test" });
  assert.equal(outBkOff.skipped, true);
  assert.equal(outBkOff.reason, "rule_off");

  // Canal booking OFF + autoEmitInvoice = true -> emite!
  resBookingOff.autoEmitInvoice = true;
  const outBkOn = await runCheckoutAutoBillingAndNfse(resBookingOff, { triggerSource: "test" });
  assert.equal(outBkOn.autoInvoiceEmitted, true);
  assert.equal(emittedInvoices().length, 2);
});

test("2. Múltiplos fluxos de check-out (/api/public/checkout, PATCH /api/flats/:id, handleInformCheckout) emitem e nunca duplicam", async () => {
  resetTestData();
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  // 2A. Link Digital POST /api/public/checkout
  const resDigital = {
    id: 9101,
    code: "RES-DIG-113",
    flatId: 101,
    flatNumber: "113",
    channel: "booking",
    status: "hospedado",
    checkinDate: "2026-11-17",
    checkoutDate: today,
    totalAmount: 600,
    paidAmount: 600,
    paymentStatus: "pago_total",
    guestName: "Carlos Alberto",
    guestDocument: CPF_A,
    guestEmail: "carlos@teste.com",
    guestPhone: "22999223344",
    autoEmitInvoice: true
  };
  db.reservations.push(resDigital);

  const respDig = await fetch(`${baseUrl}/api/public/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "RES-DIG-113", flatNumber: "113" })
  });
  assert.equal(respDig.status, 200);
  assert.equal(resDigital.checkoutDone, true);
  assert.equal(emittedInvoices().length, 1);
  assert.equal(resDigital.autoInvoiceStatus, "emitted");

  // Segundo disparo (ex.: governança marcando desocupado depois) NÃO duplica nota!
  const respFlat = await fetch(`${baseUrl}/api/flats/101`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isOccupied: false })
  });
  assert.equal(respFlat.status, 200);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(emittedInvoices().length, 1);

  // 2B. Governança marcando flat desocupado (PATCH /api/flats/102)
  const resVac = {
    id: 9102,
    code: "RES-GOV-204",
    flatId: 102,
    flatNumber: "204",
    channel: "whatsapp",
    status: "hospedado",
    checkinDate: "2026-11-17",
    checkoutDate: today,
    totalAmount: 350,
    paidAmount: 350,
    paymentStatus: "pago_total",
    guestName: "Ana Paula",
    guestDocument: CPF_B,
    guestEmail: "ana@teste.com",
    guestPhone: "22999334455",
    autoEmitInvoice: true
  };
  db.reservations.push(resVac);
  const respVac = await fetch(`${baseUrl}/api/flats/102`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isOccupied: false })
  });
  assert.equal(respVac.status, 200);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(emittedInvoices().length, 2);
  assert.equal(resVac.autoInvoiceStatus, "emitted");

  // 2C. Hóspede informando saída via WhatsApp (handleInformCheckout)
  const resWa = {
    id: 9103,
    code: "RES-WA-511",
    flatId: 103,
    flatNumber: "511",
    channel: "site_direto",
    status: "hospedado",
    checkinDate: "2026-11-17",
    checkoutDate: today,
    totalAmount: 420,
    paidAmount: 420,
    paymentStatus: "pago_total",
    guestName: "Bruno Mendes",
    guestDocument: CPF_A,
    guestEmail: "bruno@teste.com",
    guestPhone: "22999445566",
    autoEmitInvoice: true
  };
  db.reservations.push(resWa);
  handleInformCheckout(db, { flatNumber: "511", phone: "5522999445566" });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(emittedInvoices().length, 3);
  assert.equal(resWa.autoInvoiceStatus, "emitted");
});

test("3. Preferência estrita CPF vs Empresa (zero fallback cruzado + CNPJ novo em confirmedFiscalData)", async () => {
  resetTestData();

  // 3A. Preferência = company com CNPJ válido -> emite no CNPJ da empresa (não no CPF do hóspede)
  db.companies.push({
    id: 50,
    corporateName: "Acme Engenharia Ltda",
    cnpj: CNPJ_A,
    financialEmail: "fiscal@acme.com.br"
  });
  db.guests.push({
    id: 70,
    fullName: "Pedro Henrique",
    documentNumber: CPF_A,
    email: "pedro@pessoal.com",
    phone: "22999550001",
    companyId: 50,
    preferredInvoiceRecipient: "company",
    autoEmitInvoice: true
  });
  const resComp = {
    id: 9201,
    code: "RES-PJ-01",
    flatId: 101,
    flatNumber: "113",
    channel: "whatsapp",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 800,
    paidAmount: 800,
    paymentStatus: "pago_total",
    guestId: 70,
    guestName: "Pedro Henrique",
    guestDocument: CPF_A,
    guestEmail: "pedro@pessoal.com",
    guestPhone: "22999550001",
    companyId: 50,
    autoEmitInvoice: true
  };
  db.reservations.push(resComp);
  const outComp = await runCheckoutAutoBillingAndNfse(resComp, { triggerSource: "test" });
  assert.equal(outComp.autoInvoiceEmitted, true);
  assert.equal(outComp.invoice.tomadorCpfCnpj, CNPJ_A);
  assert.equal(outComp.invoice.invoiceRecipientType, "company");

  // 3B. Preferência = company SEM CNPJ -> NÃO cai no CPF do hóspede; pede CNPJ no WhatsApp!
  db.companies.push({
    id: 51,
    corporateName: "Empresa Sem Cnpj Ltda",
    cnpj: ""
  });
  db.guests.push({
    id: 71,
    fullName: "Lucas Ferreira",
    documentNumber: CPF_B,
    phone: "22999550002",
    companyId: 51,
    preferredInvoiceRecipient: "company",
    autoEmitInvoice: true
  });
  const resNoCnpj = {
    id: 9202,
    code: "RES-PJ-NOCNPJ",
    flatId: 102,
    flatNumber: "204",
    channel: "whatsapp",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 700,
    paidAmount: 700,
    paymentStatus: "pago_total",
    guestId: 71,
    guestName: "Lucas Ferreira",
    guestDocument: CPF_B,
    guestPhone: "22999550002",
    companyId: 51,
    autoEmitInvoice: true
  };
  db.reservations.push(resNoCnpj);
  const outNoCnpj = await runCheckoutAutoBillingAndNfse(resNoCnpj, { triggerSource: "test" });
  assert.equal(outNoCnpj.autoInvoiceEmitted, false);
  assert.equal(outNoCnpj.awaitingDocument, true);
  assert.equal(outNoCnpj.missingDocumentKind, "CNPJ");
  assert.equal(outNoCnpj.promptSent, true);
  assert.equal(resNoCnpj.autoInvoiceStatus, "awaiting_document_whatsapp");
  assert.equal(emittedInvoices().length, 1); // Não emitiu errado no CPF!

  // 3C. Preferência = guest SEM CPF (mas com empresa vinculada) -> NÃO cai no CNPJ; pede CPF!
  const resPrefPf = {
    id: 9203,
    code: "RES-PF-NOCPF",
    flatId: 103,
    flatNumber: "511",
    channel: "whatsapp",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 450,
    paidAmount: 450,
    paymentStatus: "pago_total",
    guestName: "Rafael Costa",
    guestDocument: "",
    guestPhone: "22999550003",
    companyId: 50,
    invoiceRecipientType: "guest",
    autoEmitInvoice: true
  };
  db.reservations.push(resPrefPf);
  const draftPf = buildOfficialNfseDraftForReservation(db, { reservation: resPrefPf, strictRecipientMatch: true });
  assert.equal(draftPf.expectedRecipientType, "guest");
  assert.equal(draftPf.missingRequiredDocument, true);
  assert.equal(draftPf.missingDocumentKind, "CPF");
  assert.equal(draftPf.tomadorCpfCnpj, "");

  // 3D. Novo CNPJ em confirmedFiscalData (que não está em db.companies ainda) emite no CNPJ!
  const resNewCnpj = {
    id: 9204,
    code: "RES-NEW-CNPJ",
    flatId: 103,
    flatNumber: "511",
    channel: "whatsapp",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 950,
    paidAmount: 950,
    paymentStatus: "pago_total",
    guestName: "Fernanda Lima",
    guestDocument: CPF_A,
    guestPhone: "22999550004",
    autoEmitInvoice: true,
    confirmedFiscalData: {
      tomadorNome: "Nova Consultoria Ltda",
      tomadorCpfCnpj: CNPJ_B,
      tomadorEmail: "contas@novaconsultoria.com.br"
    }
  };
  db.reservations.push(resNewCnpj);
  const outNewCnpj = await runCheckoutAutoBillingAndNfse(resNewCnpj, { triggerSource: "test" });
  assert.equal(outNewCnpj.autoInvoiceEmitted, true);
  assert.equal(outNewCnpj.invoice.tomadorCpfCnpj, CNPJ_B);
  assert.equal(outNewCnpj.invoice.invoiceRecipientType, "company");
});

test("4. Falta de CPF no check-out -> pergunta no WhatsApp -> hóspede responde CPF -> salva no CRM, emite e envia!", async () => {
  resetTestData();
  const guest = {
    id: 80,
    fullName: "Mariana Souza",
    documentNumber: "",
    phone: "22999667788",
    email: "mariana@teste.com",
    autoEmitInvoice: true
  };
  db.guests.push(guest);
  const resMissing = {
    id: 9301,
    code: "RES-CPF-ASK",
    flatId: 101,
    flatNumber: "113",
    channel: "direct",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 550,
    paidAmount: 550,
    paymentStatus: "pago_total",
    guestId: 80,
    guestName: "Mariana Souza",
    guestDocument: "",
    guestEmail: "mariana@teste.com",
    guestPhone: "22999667788",
    autoEmitInvoice: true
  };
  db.reservations.push(resMissing);

  // Passo 1: Check-out detecta falta de CPF e pergunta no WhatsApp
  const checkoutOut = await runCheckoutAutoBillingAndNfse(resMissing, { triggerSource: "link_digital" });
  assert.equal(checkoutOut.awaitingDocument, true);
  assert.equal(checkoutOut.promptSent, true);
  assert.equal(sentWhatsapps.length, 1);
  assert.match(sentWhatsapps[0].message, /CPF/i);
  assert.equal(db.whatsappConversations.length, 1);
  assert.ok(db.whatsappConversations[0].awaitingMissingDocForCheckoutNfse);

  // Passo 2: Hóspede responde com o CPF no WhatsApp (número comum, NÃO dev!)
  const waReplies = [];
  const flowRes = await handleWhatsAppFiscalFlow({
    db,
    cleanTarget: "5522999667788",
    messageText: `Meu CPF é ${CPF_A}`,
    senderName: "Mariana Souza",
    conv: db.whatsappConversations[0],
    sendZapiMessage: async (_cfg, payload) => {
      waReplies.push(payload);
      return { success: true };
    }
  });

  assert.equal(flowRes.handled, true);
  assert.equal(flowRes.action, "emitted_nfse_after_doc_collection");
  assert.equal(guest.documentNumber, CPF_A);
  assert.equal(resMissing.guestDocument, CPF_A);
  assert.equal(resMissing.autoInvoiceStatus, "emitted");
  assert.equal(emittedInvoices().length, 1);
  assert.equal(emittedInvoices()[0].tomadorCpfCnpj, CPF_A);
  assert.equal(db.whatsappConversations[0].awaitingMissingDocForCheckoutNfse, undefined);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].recipient, "mariana@teste.com");
  assert.equal(sentNfseWhatsapps.length, 1);
  assert.ok(waReplies.some(m => /Nota Fiscal emitida com sucesso/i.test(m.message)));
});

test("5. Sigilo Tarifário (nfHideFromGuest) emite e entrega SOMENTE ao financeiro/solicitante (nunca ao hóspede)", async () => {
  resetTestData();
  db.companies.push({
    id: 60,
    corporateName: "Petro Corp S.A.",
    cnpj: CNPJ_A,
    financialEmail: "financeiro@petrocorp.com.br",
    phone: "22999880000"
  });
  const resSigilo = {
    id: 9401,
    code: "RES-SIGILO-01",
    flatId: 101,
    flatNumber: "113",
    channel: "b2b",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "pago_total",
    guestName: "Engenheiro Hospede",
    guestDocument: CPF_A,
    guestEmail: "engenheiro@pessoal.com",
    guestPhone: "22999110000",
    companyId: 60,
    invoiceRecipientType: "company",
    nfHideFromGuest: true,
    nfDeliveryEmails: ["financeiro@petrocorp.com.br", "engenheiro@pessoal.com"],
    autoEmitInvoice: true
  };
  db.reservations.push(resSigilo);

  const outSigilo = await runCheckoutAutoBillingAndNfse(resSigilo, { triggerSource: "reception_pms" });
  assert.equal(outSigilo.autoInvoiceEmitted, true);
  assert.equal(outSigilo.invoice.tomadorCpfCnpj, CNPJ_A);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].recipient, "financeiro@petrocorp.com.br");
  assert.ok(!sentEmails.some(e => e.recipient === "engenheiro@pessoal.com"));
  // WhatsApp nunca enviado para o telefone do hóspede (somente empresa/solicitante não-hóspede)
  assert.ok(sentNfseWhatsapps.every(w => w.opts.phone !== "22999110000"));
});

test("6. Pacote Multi-Flat aguarda último flat ativo e emite 1 NFS-e consolidada", async () => {
  resetTestData();
  const resP1 = {
    id: 9501,
    code: "RES-PKG-A",
    packageId: "PKG-2026-01",
    packageCode: "PKG-2026-01",
    isPackagePrimary: true,
    flatId: 101,
    flatNumber: "113",
    channel: "whatsapp",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 500,
    paidAmount: 500,
    paymentStatus: "pago_total",
    guestName: "Hóspede Flat 1",
    guestPhone: "22999001111",
    requesterName: "Gestor Empresa",
    requesterInfo: { name: "Gestor Empresa", cpf: CPF_A, email: "gestor@empresa.com", whatsapp: "22999009999" },
    invoiceRecipientType: "requester",
    autoEmitInvoice: true
  };
  const resP2 = {
    id: 9502,
    code: "RES-PKG-B",
    packageId: "PKG-2026-01",
    packageCode: "PKG-2026-01",
    flatId: 102,
    flatNumber: "204",
    channel: "whatsapp",
    status: "hospedado",
    checkoutDone: false,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 650,
    paidAmount: 650,
    paymentStatus: "pago_total",
    guestName: "Hóspede Flat 2",
    guestPhone: "22999002222",
    requesterName: "Gestor Empresa",
    requesterInfo: { name: "Gestor Empresa", cpf: CPF_A, email: "gestor@empresa.com", whatsapp: "22999009999" },
    invoiceRecipientType: "requester",
    autoEmitInvoice: true
  };
  db.reservations.push(resP1, resP2);

  // 1º flat faz check-out -> aguarda o 2º flat
  const outP1 = await runCheckoutAutoBillingAndNfse(resP1, { triggerSource: "link_digital" });
  assert.equal(outP1.skipped, true);
  assert.equal(outP1.reason, "waiting_package_last_checkout");
  assert.equal(resP1.autoInvoiceStatus, "waiting_package_last_checkout");
  assert.equal(emittedInvoices().length, 0);

  // 2º (último) flat faz check-out -> emite 1 NFS-e consolidada com soma R$ 1.150,00!
  resP2.status = "completed";
  resP2.checkoutDone = true;
  const outP2 = await runCheckoutAutoBillingAndNfse(resP2, { triggerSource: "link_digital" });
  assert.equal(outP2.autoInvoiceEmitted, true);
  assert.equal(emittedInvoices().length, 1);
  assert.equal(emittedInvoices()[0].isConsolidated, true);
  assert.equal(Number(emittedInvoices()[0].valorServico), 1150);
  assert.equal(resP1.invoiceId, emittedInvoices()[0].id);
  assert.equal(resP2.invoiceId, emittedInvoices()[0].id);
});

test("7. Reserva direta com pagamento pendente bloqueia auto-emissão e alerta gestor", async () => {
  resetTestData();
  const resUnpaid = {
    id: 9601,
    code: "RES-UNPAID-01",
    flatId: 101,
    flatNumber: "113",
    channel: "direct",
    status: "completed",
    checkoutDone: true,
    checkinDate: "2026-11-17",
    checkoutDate: "2026-11-19",
    totalAmount: 500,
    paidAmount: 0,
    paymentStatus: "pendente",
    guestName: "Cliente Pendente",
    guestDocument: CPF_A,
    guestPhone: "22999770011",
    autoEmitInvoice: true
  };
  db.reservations.push(resUnpaid);

  const outUnpaid = await runCheckoutAutoBillingAndNfse(resUnpaid, { triggerSource: "reception_pms" });
  assert.equal(outUnpaid.autoInvoiceEmitted, false);
  assert.equal(outUnpaid.reason, "blocked_unpaid");
  assert.equal(resUnpaid.autoInvoiceStatus, "blocked_unpaid");
  assert.equal(emittedInvoices().length, 0);
  assert.ok(db.notifications.some(n => n.category === "fiscal" && n.metadata?.alertKey === "blocked_unpaid"));
  assert.ok(sentWhatsapps.some(w => w.recipientRole === "developer" && /Pagamento pendente/i.test(w.message)));
});

test("8. Hóspede comum (não-dev) pede NF no WhatsApp antes do check-out -> ativa autoEmitInvoice imediatamente e avisa que será enviada no check-out; após check-out emite na hora", async () => {
  resetTestData();
  const guest = {
    id: 90,
    fullName: "Juliana Martins",
    documentNumber: CPF_B,
    email: "juliana@teste.com",
    phone: "22998112233",
    autoEmitInvoice: false
  };
  db.guests.push(guest);
  const resInStay = {
    id: 9701,
    code: "RES-WA-REQ-01",
    flatId: 101,
    flatNumber: "113",
    channel: "booking",
    status: "hospedado",
    checkoutDone: false,
    checkinDate: "2026-11-18",
    checkoutDate: "2026-11-22",
    totalAmount: 900,
    paidAmount: 900,
    paymentStatus: "pago_total",
    guestId: 90,
    guestName: "Juliana Martins",
    guestDocument: CPF_B,
    guestEmail: "juliana@teste.com",
    guestPhone: "22998112233",
    autoEmitInvoice: false
  };
  db.reservations.push(resInStay);

  // 8A. Antes do check-out (telefone comum, não-dev!)
  const repliesBefore = [];
  const resBefore = await handleWhatsAppFiscalFlow({
    db,
    cleanTarget: "5522998112233",
    messageText: "Oi, vou precisar da nota fiscal da minha hospedagem",
    senderName: "Juliana Martins",
    sendZapiMessage: async (_cfg, payload) => {
      repliesBefore.push(payload);
      return { success: true };
    }
  });
  assert.equal(resBefore.handled, true);
  assert.equal(resBefore.action, "scheduled_for_checkout");
  assert.equal(resInStay.autoEmitInvoice, true);
  assert.equal(guest.autoEmitInvoice, true);
  assert.equal(emittedInvoices().length, 0);
  assert.ok(repliesBefore.some(m => /check-out/i.test(m.message) && /Emissão Automática/i.test(m.message)));

  // 8B. Tool gerenciar_nota_fiscal_nfse também ativa autoEmitInvoice logo em INICIAR_CONFERENCIA
  const resTool = {
    id: 9702,
    code: "RES-TOOL-01",
    flatId: 102,
    flatNumber: "204",
    status: "hospedado",
    checkinDate: "2026-11-18",
    checkoutDate: "2026-11-22",
    totalAmount: 600,
    guestId: 90,
    guestName: "Juliana Martins",
    guestDocument: CPF_B,
    autoEmitInvoice: false
  };
  db.reservations.push(resTool);
  const toolOut = await gerenciarNotaFiscalNfseTool.execute(
    { acao: "INICIAR_CONFERENCIA" },
    {
      telefone_remetente: "5522998112233",
      hospede: { id: "90", nome: "Juliana Martins" },
      reserva_ativa: {
        id: "RES-TOOL-01",
        imovel_id: "204",
        nome_imovel: "Flat 204",
        data_checkin: "2026-11-18",
        data_checkout: "2026-11-22"
      },
      runtime: { db }
    }
  );
  assert.equal(resTool.autoEmitInvoice, true);
  assert.match(toolOut.instrucao_para_ia, /check-out/i);

  // 8C. Após o check-out -> pede NF no WhatsApp -> emite na hora!
  resInStay.status = "completed";
  resInStay.checkoutDone = true;
  db.whatsappConversations = [];
  const repliesAfter = [];
  const resAfter = await handleWhatsAppFiscalFlow({
    db,
    cleanTarget: "5522998112233",
    messageText: "Pode enviar minha nota fiscal por favor?",
    senderName: "Juliana Martins",
    sendZapiMessage: async (_cfg, payload) => {
      repliesAfter.push(payload);
      return { success: true };
    }
  });
  assert.equal(resAfter.handled, true);
  assert.equal(resAfter.action, "emitted_nfse");
  assert.equal(emittedInvoices().length, 1);
  assert.equal(emittedInvoices()[0].tomadorCpfCnpj, CPF_B);
  assert.ok(repliesAfter.some(m => /Nota Fiscal Emitida com Sucesso/i.test(m.message)));
});
