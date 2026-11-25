#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolamento total: banco temporário em /tmp e porta dedicada, sem tocar data/database.json
const tmpDbFile = path.join(os.tmpdir(), `gfm_financial_hub_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`);
const tmpAuditFile = path.join(os.tmpdir(), `gfm_financial_hub_audit_${Date.now()}.jsonl`);
fs.writeFileSync(tmpDbFile, JSON.stringify({ reservations: [], guests: [], companies: [], agencies: [], boletos: [], invoices: [], guestAccounts: [], financialHubTokens: [] }), "utf8");

process.env.NODE_ENV = "test";
process.env.PORT = String(5180 + Math.floor(Math.random() * 100));
process.env.DATA_FILE = tmpDbFile;
process.env.AUDIT_LOG_FILE = tmpAuditFile;
process.env.DATABASE_URL = "";
process.env.SERVER_BASE_URL = "https://corpflats.com.br";

const mod = await import("../artifacts/api-server/demo-server.mjs");
const {
  httpServer,
  db,
  dispatchNfseInvoiceEmail,
  dispatchNfseInvoiceWhatsApp,
  setCheckoutAutoNfseTestHooks
} = mod;

// Desabilita Z-API externo durante o teste
db.zapiConfig = { ...(db.zapiConfig || {}), enabled: false, instanceId: "", token: "" };

// Aguarda servidor HTTP ficar pronto
await new Promise((resolve) => {
  if (httpServer.listening) return resolve();
  httpServer.once("listening", resolve);
});
const addr = httpServer.address();
const BASE = `http://127.0.0.1:${addr.port}`;

function isoDaysOffset(days) {
  // Data local de Brasília (UTC-3)
  const nowBr = new Date(Date.now() - 3 * 3600000);
  nowBr.setUTCDate(nowBr.getUTCDate() + days);
  return nowBr.toISOString().slice(0, 10);
}

const todayStr = isoDaysOffset(0);
const yesterdayStr = isoDaysOffset(-3);
const nextWeekStr = isoDaysOffset(7);
const lastWeekStr = isoDaysOffset(-10);

async function apiJson(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("   Teste Pontual: Portal de Notas Fiscais, Boletos & Painel Financeiro Hub      ");
  console.log("================================================================================");

  // ── Seed isolado de cenários realistas ──
  const compId = 9001;
  const compCnpj = "11.222.333/0001-81";
  db.companies = [
    ...(db.companies || []).filter(c => c.id !== compId),
    {
      id: compId,
      corporateName: "Acme Offshore Energia Ltda",
      tradeName: "Acme Offshore",
      cnpj: compCnpj,
      financialEmail: "financeiro@acmeoffshore.com.br",
      phone: "22999887766",
      defaultBoletoTermDays: 15
    }
  ];

  // 1. Reserva direta do próprio hóspede (faturada) — !hideFinancialForGuest
  const resSelf = {
    id: 91001,
    code: "RES-501-91001",
    flatId: 1,
    flatNumber: "501",
    checkinDate: lastWeekStr,
    checkoutDate: yesterdayStr,
    status: "confirmada",
    channel: "site",
    guestName: "Lucas Titular Direto",
    guestEmail: "lucas.direto@example.com",
    guestPhone: "22991112222",
    guestDocument: "12345678909",
    totalAmount: 900,
    paidAmount: 0,
    paymentStatus: "pendente",
    paymentMethod: "boleto_faturado",
    isFaturadoBoleto: true,
    requesterType: "guest",
    requesterIsGuest1: true
  };

  // 2. Reserva corporativa (Solicitante ≠ Hóspede, sigilo ativo) — boleto VENCIDO + NFS-e autorizada
  const resCorp1 = {
    id: 91002,
    code: "RES-502-91002",
    flatId: 2,
    flatNumber: "502",
    checkinDate: lastWeekStr,
    checkoutDate: yesterdayStr,
    status: "confirmada",
    channel: "b2b",
    companyId: compId,
    companyName: "Acme Offshore",
    companyCnpj: compCnpj,
    guestName: "Colaborador Hospedado Um",
    guestEmail: "colab1@acmeoffshore.com.br",
    guestPhone: "22992223333",
    guestDocument: "98765432100",
    requesterType: "company",
    requesterIsGuest1: false,
    requesterPortalToken: "REQ_TEST_CORP1_SECRET",
    requesterInfo: {
      name: "Marina Solicitante",
      email: "marina.viagens@acmeoffshore.com.br",
      phone: "22993334444"
    },
    hideFinancialForGuest: true,
    nfHideFromGuest: true,
    totalAmount: 1500,
    paidAmount: 0,
    paymentStatus: "pendente",
    paymentMethod: "boleto_faturado",
    isFaturadoBoleto: true
  };

  // 3. Reserva corporativa em Pacote — boleto VENCE HOJE + reserva 4 AGUARDANDO EMISSÃO (pré-boleto)
  const resPkg1 = {
    id: 91003,
    code: "RES-503-91003",
    packageId: "PKG-TEST99",
    packageCode: "PKG-TEST99",
    flatId: 3,
    flatNumber: "503",
    checkinDate: yesterdayStr,
    checkoutDate: todayStr,
    status: "confirmada",
    channel: "direto",
    companyId: compId,
    companyName: "Acme Offshore",
    companyCnpj: compCnpj,
    guestName: "Colaborador Pacote A",
    guestEmail: "colaba@acmeoffshore.com.br",
    guestPhone: "22994445555",
    requesterType: "company",
    requesterIsGuest1: false,
    requesterPortalToken: "REQ_TEST_PKG99_SECRET",
    requesterInfo: {
      name: "Marina Solicitante",
      email: "marina.viagens@acmeoffshore.com.br",
      phone: "22993334444"
    },
    hideFinancialForGuest: true,
    nfHideFromGuest: true,
    totalAmount: 1200,
    paidAmount: 0,
    paymentStatus: "pendente",
    paymentMethod: "boleto_faturado",
    isFaturadoBoleto: true
  };

  // 4. Reserva corporativa futura faturada sem boleto emitido ainda (pré-boleto "aguardando_emissao")
  const resCorpAwaiting = {
    id: 91004,
    code: "RES-504-91004",
    flatId: 4,
    flatNumber: "504",
    checkinDate: todayStr,
    checkoutDate: nextWeekStr,
    status: "confirmada",
    channel: "direto",
    companyId: compId,
    companyName: "Acme Offshore",
    companyCnpj: compCnpj,
    guestName: "Colaborador Futuro",
    guestEmail: "colabfuturo@acmeoffshore.com.br",
    guestPhone: "22995556666",
    requesterType: "company",
    requesterIsGuest1: false,
    requesterInfo: {
      name: "Marina Solicitante",
      email: "marina.viagens@acmeoffshore.com.br",
      phone: "22993334444"
    },
    hideFinancialForGuest: true,
    nfHideFromGuest: true,
    totalAmount: 2100,
    paidAmount: 0,
    paymentStatus: "pendente",
    paymentMethod: "boleto_faturado",
    isFaturadoBoleto: true
  };

  // 5. Reserva corporativa com boleto PAGO (e outro cancelado que NÃO deve aparecer)
  const resCorpPaid = {
    id: 91005,
    code: "RES-505-91005",
    flatId: 5,
    flatNumber: "505",
    checkinDate: lastWeekStr,
    checkoutDate: yesterdayStr,
    status: "completed",
    channel: "direto",
    companyId: compId,
    companyName: "Acme Offshore",
    companyCnpj: compCnpj,
    guestName: "Colaborador Quitado",
    guestEmail: "colabquit@acmeoffshore.com.br",
    requesterType: "company",
    requesterIsGuest1: false,
    requesterInfo: {
      name: "Outro Solicitante da Acme",
      email: "outro.solicitante@acmeoffshore.com.br",
      phone: "22996667777"
    },
    hideFinancialForGuest: true,
    nfHideFromGuest: true,
    totalAmount: 800,
    paidAmount: 800,
    paymentStatus: "pago_total",
    paymentMethod: "boleto_faturado",
    isFaturadoBoleto: true
  };

  db.reservations = [resSelf, resCorp1, resPkg1, resCorpAwaiting, resCorpPaid];

  // Boletos:
  db.boletos = [
    {
      id: 92001,
      code: "BOL-SELF-1",
      reservationId: resSelf.id,
      reservationCode: resSelf.code,
      flatNumber: "501",
      guestName: resSelf.guestName,
      amount: 900,
      dueDate: nextWeekStr,
      status: "aberto",
      linhaDigitavel: "07790001161200000001000000012345198760000090000",
      pixCopiaECola: "00020126580014BR.GOV.BCB.PIX0136test-self-pix",
      payer: { nome: resSelf.guestName, cpfCnpj: resSelf.guestDocument, email: resSelf.guestEmail }
    },
    {
      id: 92002,
      code: "BOL-CORP-OVERDUE",
      reservationId: resCorp1.id,
      reservationCode: resCorp1.code,
      companyId: compId,
      companyName: "Acme Offshore",
      flatNumber: "502",
      guestName: resCorp1.guestName,
      amount: 1500,
      dueDate: yesterdayStr,
      finePct: 2,
      interestPct: 1,
      status: "aberto",
      linhaDigitavel: "07790001161200000002000000012345198760000150000",
      pixCopiaECola: "00020126580014BR.GOV.BCB.PIX0136test-corp-overdue",
      payer: { nome: "Acme Offshore Energia Ltda", cpfCnpj: compCnpj, email: "financeiro@acmeoffshore.com.br" }
    },
    {
      id: 92003,
      code: "BOL-PKG-TODAY",
      reservationId: resPkg1.id,
      reservationCode: resPkg1.packageCode,
      packageId: resPkg1.packageCode,
      companyId: compId,
      companyName: "Acme Offshore",
      flatNumber: "503",
      guestName: resPkg1.guestName,
      amount: 1200,
      dueDate: todayStr,
      status: "aberto",
      linhaDigitavel: "07790001161200000003000000012345198760000120000",
      pixCopiaECola: "00020126580014BR.GOV.BCB.PIX0136test-pkg-today",
      payer: { nome: "Acme Offshore Energia Ltda", cpfCnpj: compCnpj, email: "financeiro@acmeoffshore.com.br" }
    },
    {
      id: 92004,
      code: "BOL-CORP-PAID",
      reservationId: resCorpPaid.id,
      reservationCode: resCorpPaid.code,
      companyId: compId,
      companyName: "Acme Offshore",
      flatNumber: "505",
      guestName: resCorpPaid.guestName,
      amount: 800,
      paidAmount: 800,
      paidAt: `${yesterdayStr}T14:00:00Z`,
      dueDate: yesterdayStr,
      status: "pago",
      payer: { nome: "Acme Offshore Energia Ltda", cpfCnpj: compCnpj, email: "financeiro@acmeoffshore.com.br" }
    },
    {
      id: 92005,
      code: "BOL-CORP-CANCELLED",
      reservationId: resCorp1.id,
      reservationCode: resCorp1.code,
      companyId: compId,
      companyName: "Acme Offshore",
      flatNumber: "502",
      amount: 999,
      dueDate: yesterdayStr,
      status: "cancelado",
      payer: { nome: "Acme Offshore Energia Ltda", cpfCnpj: compCnpj }
    }
  ];

  // Notas Fiscais (db.invoices):
  db.invoices = [
    {
      id: 93001,
      numeroNfse: "93001",
      codigoVerificacao: "SELF1234",
      chaveAcesso: "330100912479648130001650000000093001",
      dataEmissao: `${yesterdayStr}T15:00:00Z`,
      reservationId: resSelf.id,
      reservationCode: resSelf.code,
      flatNumber: "501",
      guestName: resSelf.guestName,
      tomadorNome: resSelf.guestName,
      tomadorCpfCnpj: resSelf.guestDocument,
      tomadorEmail: resSelf.guestEmail,
      valorServico: 900,
      status: "autorizada"
    },
    {
      id: 93002,
      numeroNfse: "93002",
      codigoVerificacao: "CORP1234",
      chaveAcesso: "330100912479648130001650000000093002",
      dataEmissao: `${yesterdayStr}T16:00:00Z`,
      reservationId: resCorp1.id,
      reservationCode: resCorp1.code,
      companyId: compId,
      flatNumber: "502",
      guestName: resCorp1.guestName,
      tomadorNome: "Acme Offshore Energia Ltda",
      tomadorCpfCnpj: compCnpj,
      tomadorEmail: "financeiro@acmeoffshore.com.br",
      invoiceRecipientType: "company",
      nfHideFromGuest: true,
      valorServico: 1500,
      status: "autorizada"
    },
    {
      id: 93003,
      numeroNfse: "93003",
      codigoVerificacao: "CANC9999",
      dataEmissao: `${yesterdayStr}T16:30:00Z`,
      reservationId: resCorp1.id,
      reservationCode: resCorp1.code,
      companyId: compId,
      tomadorNome: "Acme Offshore Energia Ltda",
      tomadorCpfCnpj: compCnpj,
      valorServico: 1500,
      status: "cancelada"
    }
  ];

  // ── TESTE 1: /api/pms/guest-portal/:code (Sigilo Corporativo vs Hóspede Pagador) ──
  console.log("\n[1/5] Validando /api/pms/guest-portal/:code (Sigilo vs Hóspede Titular)...");
  const gpSelf = await apiJson(`/api/pms/guest-portal/${resSelf.code}`);
  assert.strictEqual(gpSelf.status, 200);
  assert.strictEqual(gpSelf.data.hideFinancialForGuest, false);
  assert.strictEqual(gpSelf.data.nfseInvoices.length, 1, "Hóspede pagador deve ver a NFS-e autorizada");
  assert.strictEqual(gpSelf.data.nfseInvoices[0].numeroNfse, "93001");
  assert(gpSelf.data.nfseInvoices[0].pdfUrl.includes("/api/nfse/pdf/93001"));
  assert(gpSelf.data.nfseInvoices[0].xmlUrl.includes("/api/nfse/xml/93001"));
  assert.strictEqual(gpSelf.data.boletos.length, 1, "Hóspede pagador deve ver o boleto faturado");
  assert.strictEqual(gpSelf.data.boletos[0].displayStatus, "aberto");
  assert.strictEqual(gpSelf.data.boletos[0].code, "BOL-SELF-1");

  const gpCorp = await apiJson(`/api/pms/guest-portal/${resCorp1.code}`);
  assert.strictEqual(gpCorp.status, 200);
  assert.strictEqual(gpCorp.data.hideFinancialForGuest, true, "Hóspede corporativo deve estar em modo sigilo");
  assert.strictEqual(gpCorp.data.nfseInvoices.length, 0, "Hóspede corporativo NÃO pode ver NFS-e");
  assert.strictEqual(gpCorp.data.boletos.length, 0, "Hóspede corporativo NÃO pode ver boletos");
  assert.strictEqual(gpCorp.data.preBoletos.length, 0, "Hóspede corporativo NÃO pode ver pré-boletos");
  console.log("  ✓ Sigilo corporativo e exibição para hóspede titular 100% validados!");

  // ── TESTE 2: /api/pms/requester-portal/:code (db.invoices fix + single res + proteção do financialHubUrl) ──
  console.log("\n[2/5] Validando /api/pms/requester-portal/:code (reserva avulsa, pacote e proteção de token)...");
  const rpNoTok = await apiJson(`/api/pms/requester-portal/${resCorp1.code}`);
  assert.strictEqual(rpNoTok.status, 403, "Reserva avulsa sem ?t=TOKEN deve exigir token");

  const rpValid = await apiJson(`/api/pms/requester-portal/${resCorp1.code}?t=${resCorp1.requesterPortalToken}`);
  assert.strictEqual(rpValid.status, 200);
  assert.strictEqual(rpValid.data.nfseInvoices.length, 1, "Deve retornar NFS-e real de db.invoices (sem canceladas)");
  assert.strictEqual(rpValid.data.nfseInvoices[0].numeroNfse, "93002");
  assert.strictEqual(rpValid.data.boletos.length, 1, "Deve retornar boleto ativo (excluindo cancelado)");
  assert.strictEqual(rpValid.data.boletos[0].displayStatus, "vencido");
  assert(rpValid.data.boletos[0].daysOverdue >= 1, "Boleto vencido deve calcular dias em atraso");
  assert(rpValid.data.boletos[0].updatedTotalWithCharges > 1500, "Boleto vencido deve calcular multa + juros");
  assert(rpValid.data.financialHubUrl && rpValid.data.financialHubUrl.startsWith("/painel-financeiro/fhub_"), "Com ?t=TOKEN válido, deve expor financialHubUrl");

  const rpPkgNoTok = await apiJson(`/api/pms/requester-portal/${resPkg1.packageCode}`);
  assert.strictEqual(rpPkgNoTok.status, 200);
  assert.strictEqual(rpPkgNoTok.data.financialHubUrl, null, "Pacote SEM ?t=TOKEN NÃO pode expor financialHubUrl da empresa!");
  assert.strictEqual(rpPkgNoTok.data.boletos.length, 1);
  assert.strictEqual(rpPkgNoTok.data.boletos[0].displayStatus, "vence_hoje");
  console.log("  ✓ Portal do solicitante (avulsa + pacote + proteção de token) 100% validado!");

  // ── TESTE 3: Conta Unificada (/api/v2/auth/bookings e /api/v2/auth/financial) ──
  console.log("\n[3/5] Validando Conta Unificada (Solicitante, Financeiro CRM validado, Terceiro malicioso e Hóspede corporativo)...");
  async function registerAndToken(payload) {
    const r = await apiJson("/api/guest-auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(r.status, 200, `Falha no cadastro de ${payload.email}: ${JSON.stringify(r.data)}`);
    return r.data.token;
  }

  // 3A. Marina (Solicitante pessoal, não está em db.companies.financialEmail, só nas reservas dela)
  const marinaToken = await registerAndToken({
    name: "Marina Solicitante",
    email: "marina.viagens@acmeoffshore.com.br",
    phone: "22993334444",
    password: "password123"
  });
  const marinaFin = await apiJson("/api/v2/auth/financial", {
    headers: { Authorization: `Bearer ${marinaToken}` }
  });
  assert.strictEqual(marinaFin.status, 200);
  // Marina solicitou resCorp1, resPkg1 e resCorpAwaiting (não solicitou resCorpPaid que foi de outro solicitante)
  assert.strictEqual(marinaFin.data.summary.overdueCount, 1, "Marina vê 1 boleto em atraso");
  assert.strictEqual(marinaFin.data.summary.dueTodayCount, 1, "Marina vê 1 boleto vencendo hoje");
  assert.strictEqual(marinaFin.data.summary.awaitingCount, 1, "Marina vê 1 pré-boleto aguardando emissão");
  assert.strictEqual(marinaFin.data.summary.paidCount, 0, "Marina (sem e-mail no CRM da empresa) NÃO vê boleto de outro solicitante");
  assert.strictEqual(marinaFin.data.invoices.length, 1);

  const marinaBookings = await apiJson("/api/v2/auth/bookings", {
    headers: { Authorization: `Bearer ${marinaToken}` }
  });
  assert.strictEqual(marinaBookings.data.reservations.length, 3, "Marina vê as 3 reservas que solicitou");
  assert(marinaBookings.data.reservations.every(r => r.isRequesterRole && r.portalUrl.startsWith("/solicitante/")));

  // 3B. Financeiro validado no CRM da empresa (financeiro@acmeoffshore.com.br)
  const finToken = await registerAndToken({
    name: "Financeiro Acme",
    email: "financeiro@acmeoffshore.com.br",
    password: "password123"
  });
  const finData = await apiJson("/api/v2/auth/financial", {
    headers: { Authorization: `Bearer ${finToken}` }
  });
  assert.strictEqual(finData.status, 200);
  assert.strictEqual(finData.data.linkedCompanies.length, 1, "E-mail do CRM deve vincular empresa automaticamente");
  assert.strictEqual(finData.data.summary.overdueCount, 1);
  assert.strictEqual(finData.data.summary.dueTodayCount, 1);
  assert.strictEqual(finData.data.summary.awaitingCount, 1);
  assert.strictEqual(finData.data.summary.paidCount, 1, "Financeiro da empresa vê também o boleto pago de outro solicitante da mesma empresa!");
  assert.strictEqual(finData.data.boletos.length, 3, "3 boletos ativos da Acme (cancelado excluído)");
  assert.strictEqual(finData.data.boletos[0].displayStatus, "vencido", "Ordenação prioriza vencido primeiro");
  assert.strictEqual(finData.data.boletos[1].displayStatus, "vence_hoje", "Depois vence hoje");
  assert.strictEqual(finData.data.boletos[2].displayStatus, "pago", "Depois pago");

  // 3C. Terceiro de fora que digita o CNPJ da Acme manualmente no perfil (DEVE SER BLOQUEADO)
  const outsiderToken = await registerAndToken({
    name: "Curioso Externo",
    email: "curioso@externo.com",
    password: "password123",
    companyData: { cnpj: compCnpj, companyName: "Acme Offshore" }
  });
  const outsiderFin = await apiJson("/api/v2/auth/financial", {
    headers: { Authorization: `Bearer ${outsiderToken}` }
  });
  assert.strictEqual(outsiderFin.status, 200);
  assert.strictEqual(outsiderFin.data.linkedCompanies.length, 0, "Preencher CNPJ no perfil NÃO pode liberar empresa não validada");
  assert.strictEqual(outsiderFin.data.boletos.length, 0, "Curioso externo NÃO pode ver boletos da empresa");
  assert.strictEqual(outsiderFin.data.invoices.length, 0, "Curioso externo NÃO pode ver notas da empresa");

  // 3D. Hóspede corporativo logado (colab1@acmeoffshore.com.br) — sigilo preservado!
  const colabToken = await registerAndToken({
    name: "Colaborador Hospedado Um",
    email: "colab1@acmeoffshore.com.br",
    password: "password123"
  });
  const colabBookings = await apiJson("/api/v2/auth/bookings", {
    headers: { Authorization: `Bearer ${colabToken}` }
  });
  assert.strictEqual(colabBookings.data.reservations.length, 1);
  assert.strictEqual(colabBookings.data.reservations[0].hideFinancialForGuest, true);
  assert.strictEqual(colabBookings.data.reservations[0].totalAmount, 0);
  assert.strictEqual(colabBookings.data.reservations[0].boletos.length, 0);
  assert.strictEqual(colabBookings.data.reservations[0].nfseInvoices.length, 0);

  const colabFin = await apiJson("/api/v2/auth/financial", {
    headers: { Authorization: `Bearer ${colabToken}` }
  });
  assert.strictEqual(colabFin.data.boletos.length, 0, "Hóspede corporativo não vê boletos da empresa no Financeiro");
  assert.strictEqual(colabFin.data.invoices.length, 0, "Hóspede corporativo não vê NFS-e sigilosa no Financeiro");
  console.log("  ✓ Escopo unificado e blindagem anti-vazamento 100% validados!");

  // ── TESTE 4: Admin gera Link Mágico, acesso público funciona e regeneração revoga o anterior ──
  console.log("\n[4/5] Validando Link Mágico do Painel Financeiro (criação, leitura pública e revogação)...");
  const unauthAdmin = await apiJson("/api/admin/financial-hub-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "company", companyId: compId })
  });
  assert.strictEqual(unauthAdmin.status, 403, "Endpoint admin sem autenticação staff deve retornar 403");

  // Faz login como admin existente em db.users
  const adminUser = (db.users || []).find(u => u.role === "admin" || u.role === "dev");
  assert(adminUser, "Deve existir usuário admin/dev para autenticar no teste");
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminUser.username, password: adminUser.password || "admin123" })
  });
  const setCookieHeader = loginRes.headers.get("set-cookie") || "";
  const adminCookie = setCookieHeader.split(";")[0];
  assert(adminCookie, "Login admin deve retornar cookie de sessão");

  const gen1 = await apiJson("/api/admin/financial-hub-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ kind: "company", companyId: compId })
  });
  assert.strictEqual(gen1.status, 200);
  assert(gen1.data.token && gen1.data.token.startsWith("fhub_"));

  const pub1 = await apiJson(`/api/public/financial-hub/${gen1.data.token}`);
  assert.strictEqual(pub1.status, 200);
  assert.strictEqual(pub1.data.mode, "magic_hub");
  assert.strictEqual(pub1.data.financial.boletos.length, 3);
  assert.strictEqual(pub1.data.financial.preBoletos.length, 1);
  assert.strictEqual(pub1.data.financial.invoices.length, 1);
  assert.strictEqual(pub1.data.reservations.length, 4);

  // Regenera/Revoga token anterior
  const gen2 = await apiJson("/api/admin/financial-hub-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ kind: "company", companyId: compId, regenerate: true })
  });
  assert.strictEqual(gen2.status, 200);
  assert.notStrictEqual(gen2.data.token, gen1.data.token, "Novo token deve ser diferente do revogado");

  const pubOld = await apiJson(`/api/public/financial-hub/${gen1.data.token}`);
  assert.strictEqual(pubOld.status, 404, "Token revogado deve falhar imediatamente com 404");
  assert.strictEqual(pubOld.data.revoked, true);

  const pubNew = await apiJson(`/api/public/financial-hub/${gen2.data.token}`);
  assert.strictEqual(pubNew.status, 200, "Novo token deve funcionar normalmente");
  console.log("  ✓ Ciclo completo do Link Mágico (geração, acesso sem senha e revogação) validado!");

  // ── TESTE 5: Inclusão automática do Link do Painel Financeiro nos disparos de NFS-e ──
  console.log("\n[5/5] Validando inclusão automática do link nos disparos de NFS-e (E-mail e WhatsApp)...");
  const capturedEmails = [];
  setCheckoutAutoNfseTestHooks({
    sendEmailAsync: (opts) => {
      capturedEmails.push(opts);
      return { id: "mock_email_1" };
    }
  });
  try {
    const invCorp = db.invoices.find(i => i.id === 93002);
    const emOut = await dispatchNfseInvoiceEmail(invCorp, { force: true });
    assert.strictEqual(emOut.sent, true);
    assert(emOut.financialHubUrl && emOut.financialHubUrl.includes("/painel-financeiro/fhub_"), "Disparo de e-mail NFS-e deve incluir financialHubUrl");
    assert.strictEqual(capturedEmails.length, 1);
    assert.strictEqual(capturedEmails[0].recipient, "financeiro@acmeoffshore.com.br", "Sigilo: e-mail vai só para a empresa, nunca para o hóspede");
    assert(capturedEmails[0].bodyHtml.includes(emOut.financialHubUrl), "HTML do e-mail da NFS-e deve conter o botão/link do Painel Financeiro");

    const waOut = await dispatchNfseInvoiceWhatsApp(invCorp, { phone: "22999887766", sendZapi: false });
    assert(waOut.financialHubUrl && waOut.financialHubUrl.includes("/painel-financeiro/fhub_"), "Disparo WhatsApp NFS-e deve incluir financialHubUrl");
    assert(waOut.captionText.includes(waOut.financialHubUrl), "Texto do WhatsApp da NFS-e deve conter o link do Painel Financeiro");

    const waBlocked = await dispatchNfseInvoiceWhatsApp(invCorp, { phone: resCorp1.guestPhone, sendZapi: false });
    assert.strictEqual(waBlocked.blockedByPrivacy, true, "Tentativa de enviar NFS-e sigilosa para telefone do hóspede deve ser bloqueada!");
  } finally {
    setCheckoutAutoNfseTestHooks(null);
  }
  console.log("  ✓ Disparos automáticos com link do Painel Financeiro e respeito ao sigilo validados!");

  console.log("\n================================================================================");
  console.log("   SUCESSO TOTAL: 5/5 suítes pontuais passaram 100%!                            ");
  console.log("================================================================================\n");
}

try {
  await runTests();
  httpServer.close(() => {
    try { fs.unlinkSync(tmpDbFile); } catch {}
    try { fs.unlinkSync(tmpAuditFile); } catch {}
    process.exit(0);
  });
} catch (err) {
  console.error("\n[FALHA NO TESTE]:", err);
  httpServer.close(() => {
    try { fs.unlinkSync(tmpDbFile); } catch {}
    try { fs.unlinkSync(tmpAuditFile); } catch {}
    process.exit(1);
  });
}
