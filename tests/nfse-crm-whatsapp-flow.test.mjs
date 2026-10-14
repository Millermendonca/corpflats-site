/**
 * Dedicated Test Suite: NFS-e Dual Engine, CRM 360° Alignment & WhatsApp Fiscal Assistant
 * File: tests/nfse-crm-whatsapp-flow.test.mjs
 * Execution: node --test tests/nfse-crm-whatsapp-flow.test.mjs
 * 
 * Strict Compliance:
 * - Isolation: Runs against a temporary isolated database in os.tmpdir().
 * - Safety: DATABASE_URL is deleted to guarantee production database is never touched.
 * - Integrity: Asserts SHA-256 hash and mtime of data/database.json remain 100% unaltered.
 * - AGENTS.md: Dedicated punctual test file covering Milestones M1, M2, M3, M4.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  toTitleCase,
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  cleanPhone,
  cleanCep,
  formatCnpj,
  formatCpf
} from "../artifacts/api-server/lookup.mjs";

import {
  isFiscalIntentMessage,
  handleWhatsAppFiscalFlow,
  extractCnpj,
  extractCpf
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const prodDbPath = path.join(rootDir, "data/database.json");

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {}
}

async function waitForServer(baseUrl, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/system/version`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server failed to start at ${baseUrl}`);
}

describe("CorpFlats NFS-e, CRM 360° & WhatsApp Fiscal Flow Suite", () => {
  let tmpDir;
  let tmpDbPath;
  let serverProcess;
  let serverPort;
  let baseUrl;
  let initialProdHash;
  let initialProdMtime;

  before(async () => {
    // 1. Snapshot production database metadata to prove non-interference
    assert.ok(fs.existsSync(prodDbPath), "data/database.json must exist");
    initialProdHash = sha256File(prodDbPath);
    initialProdMtime = fs.statSync(prodDbPath).mtimeMs;

    // 2. Prepare isolated temporary environment
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gfm-nfse-test-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    // Copy database with seed test records
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf8"));
    if (!initialDb.companies) initialDb.companies = [];
    if (!initialDb.guests) initialDb.guests = [];
    if (!initialDb.reservations) initialDb.reservations = [];
    if (!initialDb.invoices) initialDb.invoices = [];

    // Ensure dedicated test company exists in isolated DB
    const existingComp = initialDb.companies.find(c => c.id === 901);
    if (!existingComp) {
      initialDb.companies.push({
        id: 901,
        corporateName: "Petroserv Logística Offshore S/A",
        tradeName: "Petroserv Offshore",
        cnpj: "02709449000159",
        stateRegistration: "78.910.112",
        municipalRegistration: "12345",
        financialEmail: "financeiro@petroserv.com.br",
        phone: "2227220011",
        contactPerson: "Dra. Renata Vasconcellos",
        address: "Av. Alberto Lamego",
        logradouro: "Av. Alberto Lamego",
        number: "2000",
        complement: "Bloco C Sala 12",
        neighborhood: "Parque Califórnia",
        cep: "28013602",
        city: "Campos dos Goytacazes",
        state: "RJ",
        ibgeCode: "3301009",
        billingTerms: "faturado_30d",
        createdAt: new Date().toISOString()
      });
    }

    fs.writeFileSync(tmpDbPath, JSON.stringify(initialDb, null, 2), "utf8");

    // 3. Find available port and launch server process
    serverPort = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = {
      ...process.env,
      PORT: String(serverPort),
      NODE_ENV: "test",
      DATA_FILE: tmpDbPath,
      DATABASE_FILE: tmpDbPath,
      AUDIT_LOG_FILE: path.join(tmpDir, "audit_logs.jsonl")
    };
    delete spawnEnv.DATABASE_URL;

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: spawnEnv,
      stdio: "pipe"
    });

    serverProcess.stderr.on("data", data => {
      const msg = data.toString();
      if (!msg.includes("ExperimentalWarning") && !msg.includes("DEP0040")) {
        // silent or debug
      }
    });

    await waitForServer(baseUrl);
  });

  after(async () => {
    // 1. Terminate server process tree
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }

    // 2. Clean temporary files
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}

    // 3. Verify production database was untouched
    const finalProdHash = sha256File(prodDbPath);
    const finalProdMtime = fs.statSync(prodDbPath).mtimeMs;

    assert.strictEqual(
      finalProdHash,
      initialProdHash,
      "CRITICAL: data/database.json SHA-256 hash was altered during tests!"
    );
    assert.strictEqual(
      finalProdMtime,
      initialProdMtime,
      "CRITICAL: data/database.json mtime was altered during tests!"
    );
  });

  // =========================================================================
  // T1: Emissão de NFS-e Municipal e Nacional (POST /api/nfse/emit)
  // =========================================================================
  describe("T1: Emissão de NFS-e Municipal e Nacional (POST /api/nfse/emit)", () => {
    it("T1.1 - Emite NFS-e via Padrão Nacional ADN com sucesso (sem ReferenceError, retorna 201, numeroNfse, codVerif, danfseUrl)", async () => {
      const payload = {
        sistemaEmissor: "padrao_nacional",
        tomadorNome: "Mariana Albuquerque Rocha",
        tomadorCpfCnpj: "11144477735",
        tomadorEmail: "mariana.rocha@email.com",
        tomadorTelefone: "22998877665",
        tomadorEndereco: "Rua Voluntários da Pátria",
        tomadorNumero: "450",
        tomadorComplemento: "Apto 802",
        tomadorBairro: "Centro",
        tomadorCep: "28035260",
        tomadorCidade: "Campos dos Goytacazes",
        tomadorUf: "RJ",
        tomadorCodigoMunicipio: "3301009",
        valorServico: 480.00,
        flatNumber: "105",
        checkinDate: "2026-10-20",
        checkoutDate: "2026-10-22",
        discriminacao: "Hospedagem Flat 105 CorpFlats - 2 diárias executivas"
      };

      const res = await fetch(`${baseUrl}/api/nfse/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 201, "Status code must be 201 Created");
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.ok(data.numeroNfse, "numeroNfse must be returned");
      assert.ok(data.numeroNota, "numeroNota must be returned");
      assert.ok(data.codigoVerificacao, "codigoVerificacao must be returned");
      assert.ok(data.danfseUrl, "danfseUrl must be returned");
      assert.strictEqual(data.danfseUrl, `/api/nfse/danfse/${data.numeroNfse}`);
      assert.strictEqual(data.invoice.sistemaEmissor, "padrao_nacional");
      assert.strictEqual(data.invoice.tomadorCpfCnpj, "11144477735");
      assert.strictEqual(data.invoice.tomadorEndereco, "Rua Voluntários da Pátria");
      assert.strictEqual(data.invoice.tomadorNumero, "450");
      assert.strictEqual(data.invoice.tomadorBairro, "Centro");
      assert.strictEqual(data.invoice.tomadorCep, "28035260");
      assert.strictEqual(data.invoice.valorServico, 480.00);
    });

    it("T1.2 - Emite NFS-e via GissOnline Prefeitura com persistência de endereço completo do tomador em db.invoices", async () => {
      const payload = {
        sistemaEmissor: "giss_prefeitura",
        tomadorNome: "Engenharia e Projetos Norte Fluminense LTDA",
        tomadorCpfCnpj: "47964813000165",
        tomadorEmail: "financeiro@engnorteflumi.com.br",
        tomadorTelefone: "2227334455",
        tomadorEndereco: "Av. 28 de Março",
        tomadorNumero: "1020",
        tomadorComplemento: "Sala 501",
        tomadorBairro: "Turf Club",
        tomadorCep: "28015010",
        tomadorCidade: "Campos dos Goytacazes",
        tomadorUf: "RJ",
        tomadorCodigoMunicipio: "3301009",
        valorServico: 850.00,
        flatNumber: "302",
        checkinDate: "2026-10-15",
        checkoutDate: "2026-10-18",
        discriminacao: "Serviços de hospedagem de colaboradores em flat mobiliado - Flat 302 CorpFlats"
      };

      const res = await fetch(`${baseUrl}/api/nfse/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 201, "Status code must be 201 Created");
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.ok(data.numeroNfse, "numeroNfse must be present without ReferenceError");
      assert.ok(data.codigoVerificacao, "codigoVerificacao must be present without ReferenceError");
      assert.ok(data.danfseUrl, "danfseUrl must be present");
      assert.strictEqual(data.invoice.sistemaEmissor, "giss_prefeitura");
      assert.strictEqual(data.invoice.tomadorEndereco, "Av. 28 de Março");
      assert.strictEqual(data.invoice.tomadorNumero, "1020");
      assert.strictEqual(data.invoice.tomadorComplemento, "Sala 501");
      assert.strictEqual(data.invoice.tomadorBairro, "Turf Club");
      assert.strictEqual(data.invoice.tomadorCep, "28015010");
      assert.strictEqual(data.invoice.tomadorCidade, "Campos dos Goytacazes");
      assert.strictEqual(data.invoice.tomadorUf, "RJ");
      assert.strictEqual(data.invoice.valorServico, 850.00);
    });

    it("T1.3 - GET /api/nfse/invoices preserva e lista as notas fiscais emitidas sem sobrescrevê-las (bug fix getFiscalData)", async () => {
      const res = await fetch(`${baseUrl}/api/nfse/invoices`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.invoices), "invoices must be an array");
      assert.ok(data.invoices.length >= 2, "Must contain at least the 2 newly emitted invoices");

      const national = data.invoices.find(i => i.tomadorCpfCnpj === "11144477735");
      assert.ok(national, "National invoice must be retained in db.invoices");
      assert.strictEqual(national.valorServico, 480.00);

      const municipal = data.invoices.find(i => i.tomadorCpfCnpj === "47964813000165");
      assert.ok(municipal, "Municipal invoice must be retained in db.invoices");
      assert.strictEqual(municipal.valorServico, 850.00);
    });
  });

  // =========================================================================
  // T2: Check-out com Auto-Emissão Corporativa (POST /api/pms/reservations/:id/checkout)
  // =========================================================================
  describe("T2: Check-out com Auto-Emissão Corporativa (POST /api/pms/reservations/:id/checkout)", () => {
    it("T2.1 - Check-out em reserva corporativa vinculada a companyId auto-emite nota para Tomador PJ com discriminação detalhada", async () => {
      // 1. Create a dedicated test reservation linked to company 901
      const resCreate = await fetch(`${baseUrl}/api/pms/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: "Dr. Marcos Aurelio Fontes",
          guestEmail: "marcos.fontes@petroserv.com.br",
          guestPhone: "22997788990",
          guestDocument: "11144477735",
          companyId: 901,
          autoEmitInvoice: true,
          flatId: 1,
          flatNumber: "101",
          checkinDate: "2026-10-10",
          checkoutDate: "2026-10-13",
          dailyRate: 300.00,
          totalAmount: 900.00,
          status: "in_house",
          channel: "direct"
        })
      });

      assert.ok(resCreate.ok, "Reservation creation must succeed");
      const createdRes = await resCreate.json();
      const reservationId = createdRes.reservation?.id || createdRes.id;
      assert.ok(reservationId, "Created reservation must have an id");

      // 2. Perform checkout
      const resCheckout = await fetch(`${baseUrl}/api/pms/reservations/${reservationId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      assert.strictEqual(resCheckout.status, 200, "Checkout endpoint must return 200");
      const checkoutData = await resCheckout.json();
      assert.strictEqual(checkoutData.success, true);
      assert.strictEqual(checkoutData.autoInvoiceEmitted, true, "autoInvoiceEmitted must be true");
      assert.ok(checkoutData.autoInvoiceNumber, "autoInvoiceNumber must be returned");
      assert.ok(checkoutData.autoInvoicePdf, "autoInvoicePdf must be returned");

      // 3. Verify that the emitted invoice has the Company as Tomador PJ
      const resInvoices = await fetch(`${baseUrl}/api/nfse/invoices`);
      const invData = await resInvoices.json();
      const emittedInv = invData.invoices.find(i => i.reservationId === Number(reservationId));

      assert.ok(emittedInv, "An invoice must be emitted on corporate checkout");
      assert.strictEqual(emittedInv.numeroNfse, checkoutData.autoInvoiceNumber);
      assert.strictEqual(emittedInv.companyId, 901);
      assert.strictEqual(emittedInv.tomadorCpfCnpj, "02709449000159", "Tomador document must be the Company CNPJ");
      assert.strictEqual(emittedInv.tomadorNome, "Petroserv Logística Offshore S/A", "Tomador name must be the Company corporate name");
      assert.strictEqual(emittedInv.tomadorEndereco, "Av. Alberto Lamego");
      assert.strictEqual(emittedInv.tomadorNumero, "2000");
      assert.strictEqual(emittedInv.tomadorCep, "28013602");
      assert.strictEqual(emittedInv.tomadorCidade, "Campos dos Goytacazes");

      // Verify detailed discrimination contains guest and stay details
      assert.match(emittedInv.discriminacao, /Marcos Aurelio Fontes/, "Discrimination must include guest name");
      assert.match(emittedInv.discriminacao, /113/, "Discrimination must include flat number");
      assert.match(emittedInv.discriminacao, /2026-10-10|10 de Out/i, "Discrimination must include check-in date");
      assert.match(emittedInv.discriminacao, /2026-10-13|13 de Out/i, "Discrimination must include check-out date");
      assert.match(emittedInv.discriminacao, /3 diárias/i, "Discrimination must include daily count");
    });
  });

  // =========================================================================
  // T3: CRM 360° Endpoints de Empresas & Hóspedes
  // =========================================================================
  describe("T3: CRM 360° Endpoints de Empresas & Hóspedes", () => {
    let companyId;
    let guestId;

    it("T3.1 - POST e PATCH /api/companies salvam e atualizam CNPJ, Razão Social, E-mail Financeiro e Endereço completo", async () => {
      // Create Company
      const createRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corporateName: "Subsea 7 do Brasil Servicos LTDA",
          tradeName: "Subsea 7",
          cnpj: "02.709.449/0001-59",
          financialEmail: "financeiro.brasil@subsea7.com",
          phone: "2221015000",
          contactPerson: "Mariana Alencar",
          logradouro: "Rodovia Amaral Peixoto",
          number: "Km 182",
          complement: "Galpão 4",
          neighborhood: "Zona Industrial",
          cep: "28055000",
          city: "Campos dos Goytacazes",
          state: "RJ",
          ibgeCode: "3301009",
          billingTerms: "faturado_28d"
        })
      });

      assert.strictEqual(createRes.status, 201);
      const createdComp = await createRes.json();
      companyId = createdComp.id;
      assert.ok(companyId, "Company ID must be assigned");
      assert.strictEqual(createdComp.corporateName, "Subsea 7 do Brasil Servicos LTDA");
      assert.strictEqual(createdComp.cep, "28055000");
      assert.strictEqual(createdComp.logradouro, "Rodovia Amaral Peixoto");
      assert.strictEqual(createdComp.number, "Km 182");
      assert.strictEqual(createdComp.city, "Campos dos Goytacazes");
      assert.strictEqual(createdComp.state, "RJ");

      // Update Company via PATCH
      const patchRes = await fetch(`${baseUrl}/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complement: "Galpão 4 e 5",
          billingTerms: "faturado_45d",
          financialEmail: "contasapagar@subsea7.com"
        })
      });

      assert.strictEqual(patchRes.status, 200);
      const updatedComp = await patchRes.json();
      assert.strictEqual(updatedComp.complement, "Galpão 4 e 5");
      assert.strictEqual(updatedComp.billingTerms, "faturado_45d");
      assert.strictEqual(updatedComp.financialEmail, "contasapagar@subsea7.com");
      assert.strictEqual(updatedComp.corporateName, "Subsea 7 do Brasil Servicos LTDA", "Unchanged fields must be preserved");
    });

    it("T3.2 - POST e PATCH /api/pms/guests salvam e atualizam endereço, vínculo corporativo companyId e autoEmitInvoice", async () => {
      // Create Guest
      const createRes = await fetch(`${baseUrl}/api/pms/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Felipe Nogueira Siqueira",
          documentNumber: "11144477735",
          documentType: "cpf",
          email: "felipe.siqueira@subsea7.com",
          phone: "22998811223",
          cep: "28035260",
          address: "Rua Conselheiro Otaviano",
          number: "185",
          complement: "Apto 302",
          neighborhood: "Centro",
          city: "Campos dos Goytacazes",
          state: "RJ",
          ibgeCode: "3301009",
          companyId: companyId,
          autoEmitInvoice: true
        })
      });

      assert.strictEqual(createRes.status, 201);
      const createdGuest = await createRes.json();
      guestId = createdGuest.id;
      assert.ok(guestId);
      assert.strictEqual(createdGuest.fullName, "Felipe Nogueira Siqueira");
      assert.strictEqual(createdGuest.companyId, companyId);
      assert.strictEqual(createdGuest.autoEmitInvoice, true);
      assert.strictEqual(createdGuest.address, "Rua Conselheiro Otaviano");
      assert.strictEqual(createdGuest.number, "185");
      assert.strictEqual(createdGuest.cep, "28035260");

      // Update Guest via PATCH
      const patchRes = await fetch(`${baseUrl}/api/pms/guests/${guestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complement: "Apto 302 Bloco B",
          phone: "22998811224"
        })
      });

      assert.strictEqual(patchRes.status, 200);
      const updatedGuest = await patchRes.json();
      assert.strictEqual(updatedGuest.complement, "Apto 302 Bloco B");
      assert.strictEqual(updatedGuest.companyId, companyId);
      assert.strictEqual(updatedGuest.autoEmitInvoice, true);
    });
  });

  // =========================================================================
  // T4: Fluxo WhatsApp de Solicitação de NF (Sem Perguntas Repetidas para Empresa Vinculada)
  // =========================================================================
  describe("T4: Fluxo WhatsApp de Solicitação de NF (Sem Perguntas Repetidas para Empresa Vinculada)", () => {
    it("T4.1 - Titular com empresa vinculada solicita nota fiscal: confirma dados cadastrados sem solicitar novamente e ativa autoEmitInvoice", async () => {
      const mockDb = {
        companies: [
          {
            id: 88,
            corporateName: "Ocyan Perfurações S/A",
            tradeName: "Ocyan",
            cnpj: "02709449000159",
            financialEmail: "nfe@ocyan.com.br",
            phone: "2221017000",
            address: "Av. Pelinca, 100",
            cep: "28035000"
          }
        ],
        guests: [
          {
            id: 77,
            name: "Lucas Brandão",
            phone: "22991112233",
            companyId: 88,
            autoEmitInvoice: false
          }
        ],
        reservations: [
          {
            id: 55,
            guestName: "Lucas Brandão",
            guestPhone: "22991112233",
            companyId: 88,
            status: "ativa",
            flatNumber: "401",
            checkinDate: "2026-10-14",
            checkoutDate: "2026-10-17",
            autoEmitInvoice: false
          }
        ],
        whatsappConversations: []
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522991112233",
        messageText: "Bom dia, preciso de nota fiscal da minha hospedagem",
        senderName: "Lucas Brandão",
        conv: null,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "confirmed_existing_company");
      assert.ok(sentZapi, "Reply must be dispatched via WhatsApp");
      assert.match(sentZapi.message, /Ocyan Perfurações S\/A/, "Message must mention registered corporate name");
      assert.match(sentZapi.message, /02\.709\.449\/0001-59/, "Message must mention formatted CNPJ");
      assert.doesNotMatch(sentZapi.message, /nos envie o número do CNPJ/i, "Must NOT ask for corporate data again");

      // Verify autoEmitInvoice was activated on reservation and guest
      assert.strictEqual(mockDb.reservations[0].autoEmitInvoice, true);
      assert.strictEqual(mockDb.guests[0].autoEmitInvoice, true);
      assert.ok(mockDb.reservations[0].invoiceDetails, "invoiceDetails must be prefilled");
      assert.strictEqual(mockDb.reservations[0].invoiceDetails.tomadorCpfCnpj, "02709449000159");
    });

    it("T4.2 - Solicitante terceiro (requesterInfo) de reserva vinculada a empresa solicita nota fiscal: confirma empresa sem repetição de perguntas", async () => {
      const mockDb = {
        companies: [
          {
            id: 99,
            corporateName: "Baker Hughes do Brasil LTDA",
            cnpj: "47964813000165",
            financialEmail: "fiscal@bakerhughes.com"
          }
        ],
        reservations: [
          {
            id: 66,
            guestName: "Engenheiro Visitante",
            guestPhone: "22995551122",
            requesterInfo: {
              name: "Juliana Andrade",
              phone: "22988884433",
              whatsapp: "22988884433"
            },
            companyId: 99,
            status: "ativa",
            flatNumber: "205",
            autoEmitInvoice: false
          }
        ],
        whatsappConversations: []
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522988884433", // Third-party requester phone
        messageText: "Favor emitir a NF da estadia no flat 205",
        senderName: "Juliana Andrade",
        conv: null,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "confirmed_existing_company");
      assert.match(sentZapi.message, /Baker Hughes do Brasil LTDA/);
      assert.strictEqual(mockDb.reservations[0].autoEmitInvoice, true);
      assert.strictEqual(mockDb.reservations[0].invoiceDetails.tomadorNome, "Baker Hughes do Brasil LTDA");
    });
  });

  // =========================================================================
  // T5: Fluxo WhatsApp de Solicitação de NF (Onboarding para Não Vinculados)
  // =========================================================================
  describe("T5: Fluxo WhatsApp de Solicitação de NF (Onboarding para Não Vinculados)", () => {
    it("T5.1 - Contato sem empresa vinculada solicita nota: sistema envia onboarding acolhedor (PJ vs PF) e marca awaitingFiscalData = true", async () => {
      const mockDb = {
        companies: [],
        guests: [{ id: 12, name: "Fernanda Costa", phone: "22992223344" }],
        reservations: [{ id: 34, guestPhone: "22992223344", status: "ativa" }],
        whatsappConversations: []
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522992223344",
        messageText: "Olá, gostaria de nota fiscal da minha hospedagem",
        senderName: "Fernanda",
        conv: null,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "requested_fiscal_data");
      assert.ok(sentZapi);
      assert.match(sentZapi.message, /Pessoa Jurídica - PJ/i, "Must instruct regarding PJ");
      assert.match(sentZapi.message, /Pessoa Física - PF/i, "Must instruct regarding PF");

      const conv = mockDb.whatsappConversations[0];
      assert.ok(conv, "Conversation record must be initialized");
      assert.strictEqual(conv.awaitingFiscalData, true, "awaitingFiscalData flag must be set to true");
    });

    it("T5.2 - Contato responde escolha PJ ou PF sem documento: sistema direciona para o formato correto", async () => {
      const conv = { awaitingFiscalData: true, messages: [] };
      const mockDb = {
        companies: [],
        guests: [],
        reservations: [],
        whatsappConversations: [conv]
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522992223344",
        messageText: "Quero emissão para Empresa / PJ",
        conv,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.action, "prompted_pj_data");
      assert.match(sentZapi.message, /CNPJ/i);
      assert.match(sentZapi.message, /e-mail financeiro/i);
    });
  });

  // =========================================================================
  // T6: Validação Módulo 11 & Tratamento de Erro Amigável
  // =========================================================================
  describe("T6: Validação Módulo 11 & Tratamento de Erro Amigável", () => {
    it("T6.1 - Envio de CNPJ com dígitos verificadores matematicamente inválidos: alerta amigável e nenhum registro inválido no CRM", async () => {
      const conv = { awaitingFiscalData: true };
      const mockDb = {
        companies: [],
        guests: [],
        reservations: [],
        whatsappConversations: [conv]
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522993334455",
        messageText: "O CNPJ é 47.964.813/0001-99", // Invalid check digits
        conv,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "invalid_cnpj");
      assert.match(sentZapi.message, /dígitos verificadores parecem incorretos/i);
      assert.match(sentZapi.message, /Módulo 11/i);
      assert.strictEqual(mockDb.companies.length, 0, "No invalid company should be created in CRM");
      assert.strictEqual(conv.awaitingFiscalData, true, "Must continue awaiting valid data");
    });

    it("T6.2 - Envio de CPF com dígitos verificadores matematicamente inválidos: alerta amigável e nenhum registro inválido no CRM", async () => {
      const conv = { awaitingFiscalData: true };
      const mockDb = {
        companies: [],
        guests: [],
        reservations: [],
        whatsappConversations: [conv]
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522993334455",
        messageText: "Meu CPF é 111.444.777-00", // Invalid check digits
        conv,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "invalid_cpf");
      assert.match(sentZapi.message, /dígitos verificadores parecem incorretos/i);
      assert.match(sentZapi.message, /Módulo 11/i);
      assert.strictEqual(mockDb.guests.length, 0, "No invalid guest should be created in CRM");
      assert.strictEqual(conv.awaitingFiscalData, true, "Must continue awaiting valid data");
    });
  });

  // =========================================================================
  // T7: Sanitização, Enriquecimento e Cadastro via WhatsApp
  // =========================================================================
  describe("T7: Sanitização, Enriquecimento e Cadastro via WhatsApp", () => {
    it("T7.1 - Sanitização via toTitleCase preserva siglas corporativas (LTDA, S/A, ME, EPP, EIRELI) e minúsculas em preposições", () => {
      assert.strictEqual(
        toTitleCase("RENTAL MILLER'S SERVICOS DE HOSPEDAGEM LTDA ME"),
        "Rental Miller's Servicos de Hospedagem LTDA ME"
      );
      assert.strictEqual(
        toTitleCase("PETROBRAS TRANSPORTE S/A"),
        "Petrobras Transporte S/A"
      );
      assert.strictEqual(
        toTitleCase("COMERCIO DE ALIMENTOS EPP"),
        "Comercio de Alimentos EPP"
      );
      assert.strictEqual(
        toTitleCase("HOLDING PARTICIPACOES EIRELI"),
        "Holding Participacoes EIRELI"
      );
      assert.strictEqual(
        toTitleCase("SUPERMERCADO DA PRACA LTDA"),
        "Supermercado da Praca LTDA"
      );
    });

    it("T7.2 - Envio de CNPJ válido com e-mail: validação Módulo 11, enriquecimento, cadastro/atualização em db.companies e vínculo", async () => {
      const conv = { awaitingFiscalData: true };
      const mockDb = {
        companies: [
          {
            id: "comp_seed",
            cnpj: "47964813000165",
            corporateName: "Rental Miller's Servicos de Hospedagem LTDA ME",
            tradeName: "CorpFlats",
            address: "Rua Voluntários da Pátria, 500",
            cep: "28035000"
          }
        ],
        guests: [{ id: "g_1", phone: "22994445566", name: "Eduardo Silveira" }],
        reservations: [{ id: "r_1", guestPhone: "22994445566", status: "ativa", autoEmitInvoice: false }],
        whatsappConversations: [conv]
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522994445566",
        messageText: "CNPJ 47.964.813/0001-65, email: nfe@corpflats.com",
        senderName: "Eduardo Silveira",
        conv,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "registered_pj");
      assert.ok(mockDb.companies.length > 0, "Company must be present in db.companies");

      const comp = mockDb.companies[0];
      assert.strictEqual(comp.cnpj, "47964813000165");
      assert.strictEqual(comp.financialEmail, "nfe@corpflats.com");
      assert.match(comp.corporateName, /LTDA\b/, "LTDA acronym must be preserved in uppercase");
      assert.match(comp.corporateName, /ME\b/, "ME acronym must be preserved in uppercase");

      // Verify binding
      assert.strictEqual(mockDb.guests[0].companyId, comp.id);
      assert.strictEqual(mockDb.guests[0].autoEmitInvoice, true);
      assert.strictEqual(mockDb.reservations[0].companyId, comp.id);
      assert.strictEqual(mockDb.reservations[0].autoEmitInvoice, true);
      assert.strictEqual(conv.awaitingFiscalData, false, "Conversation state cleared");

      // Verify WhatsApp confirmation
      assert.match(sentZapi.message, /Cadastramos e vinculamos a empresa/i);
    });

    it("T7.3 - Envio de CPF válido com dados PF: validação Módulo 11, sanitização de endereço, cadastro em db.guests e ativação na reserva", async () => {
      const conv = { awaitingFiscalData: true };
      const mockDb = {
        companies: [],
        guests: [],
        reservations: [{ id: "r_2", guestPhone: "22991122334", status: "ativa", autoEmitInvoice: false }],
        whatsappConversations: [conv]
      };

      let sentZapi = null;
      const res = await handleWhatsAppFiscalFlow({
        db: mockDb,
        cleanTarget: "5522991122334",
        messageText: "Nome: BEATRIZ CARVALHO DE SOUZA, CPF: 111.444.777-35, CEP: 28035-000, email: beatriz@gmail.com",
        senderName: "Beatriz Souza",
        conv,
        sendZapiMessage: async (_, payload) => {
          sentZapi = payload;
          return { success: true };
        },
        appendMessageFn: () => {}
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.action, "registered_pf");
      assert.ok(mockDb.guests.length > 0, "Guest must be created in db.guests");

      const guest = mockDb.guests[0];
      assert.strictEqual(guest.cpf, "11144477735");
      assert.strictEqual(guest.email, "beatriz@gmail.com");
      assert.strictEqual(guest.autoEmitInvoice, true);
      assert.match(guest.name, /Beatriz Carvalho de Souza/i, "Name must be sanitized to Title Case");

      assert.strictEqual(mockDb.reservations[0].autoEmitInvoice, true);
      assert.strictEqual(mockDb.reservations[0].invoiceDetails.tomadorCpfCnpj, "11144477735");
      assert.strictEqual(conv.awaitingFiscalData, false);
      assert.match(sentZapi.message, /Dados recebidos com sucesso/i);
    });
  });

  // =========================================================================
  // T8: Paridade Estrita dos Arquivos Gêmeos Twin-Server
  // =========================================================================
  describe("T8: Paridade Estrita dos Arquivos Gêmeos Twin-Server", () => {
    const twinFiles = [
      "demo-server.mjs",
      "giss-soap.mjs",
      "national-nfse.mjs",
      "chat-service.mjs",
      "lookup.mjs",
      "whatsapp-ai-service.mjs",
      "zapi-service.mjs"
    ];

    twinFiles.forEach(file => {
      it(`T8.${twinFiles.indexOf(file) + 1} - Paridade SHA-256 idêntica para ${file}`, () => {
        const p1 = path.join(rootDir, "artifacts/api-server", file);
        const p2 = path.join(rootDir, "scripts", file);

        assert.ok(fs.existsSync(p1), `File ${p1} must exist`);
        assert.ok(fs.existsSync(p2), `File ${p2} must exist`);

        const hash1 = sha256File(p1);
        const hash2 = sha256File(p2);

        assert.strictEqual(
          hash1,
          hash2,
          `Twin parity mismatch for ${file}: artifacts/api-server (${hash1}) vs scripts (${hash2})`
        );
      });
    });
  });

  // =========================================================================
  // T9: Verificação de Build do Frontend
  // =========================================================================
  describe("T9: Verificação de Build do Frontend", () => {
    it("T9.1 - Artefatos de produção em artifacts/limpeza/dist/public/ existem e estão íntegros", () => {
      const distIndex = path.join(rootDir, "artifacts/limpeza/dist/public/index.html");
      const distAssets = path.join(rootDir, "artifacts/limpeza/dist/public/assets");

      assert.ok(fs.existsSync(distIndex), "dist/public/index.html must exist");
      assert.ok(fs.statSync(distIndex).size > 500, "dist/public/index.html must not be empty");

      assert.ok(fs.existsSync(distAssets), "dist/public/assets must exist");
      const assetFiles = fs.readdirSync(distAssets);
      assert.ok(assetFiles.length >= 3, "dist/public/assets must contain generated bundles");

      const jsBundle = assetFiles.find(f => f.startsWith("index") && f.endsWith(".js"));
      const cssBundle = assetFiles.find(f => f.startsWith("index") && f.endsWith(".css"));

      assert.ok(jsBundle, "index.js bundle must exist");
      assert.ok(cssBundle, "index.css bundle must exist");
    });
  });

  // =========================================================================
  // T10: Verificação de Integridade de Banco
  // =========================================================================
  describe("T10: Verificação de Integridade de Banco", () => {
    it("T10.1 - data/database.json de produção permaneceu 100% inalterado (mesmo SHA-256 e mtime)", () => {
      const currentHash = sha256File(prodDbPath);
      const currentMtime = fs.statSync(prodDbPath).mtimeMs;

      assert.strictEqual(
        currentHash,
        initialProdHash,
        "Production data/database.json SHA-256 hash must not change"
      );
      assert.strictEqual(
        currentMtime,
        initialProdMtime,
        "Production data/database.json mtime must not change"
      );
    });
  });
});
