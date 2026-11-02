/**
 * Punctual Dedicated Automated Test: Sofia Fiscal NFS-e WhatsApp Confirmation & Value Lock
 * File: tests/sofia-fiscal-whatsapp-confirmation.test.mjs
 * Execution: node --test tests/sofia-fiscal-whatsapp-confirmation.test.mjs
 *
 * Mandatory AGENTS.md & Project Rules:
 * - Isolation: Runs against a temporary isolated database in os.tmpdir().
 * - Safety: DATABASE_URL is deleted to guarantee production database is never touched.
 * - Integrity: Asserts SHA-256 hash and mtime of data/database.json remain 100% unaltered.
 * - Scope: Dedicated punctual test validating R1, R2, R3, R4.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  handleWhatsAppFiscalFlow,
  handleManagerFiscalApprovalReply,
  executeWhatsAppFiscalEmission,
  enableAutoEmitInvoiceForGuestAndReservations,
  parseFlexibleMoney,
  formatDateBr,
  formatMoneyBr,
  formatCpfOrCnpj,
  findContactAndReservation,
  processAiInboundMessage
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const prodDbPath = path.resolve(projectRoot, "data", "database.json");

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("Sofia WhatsApp Fiscal Flow: Conferência, Confirmação, Trava de Valor e Restrição (R1, R2, R3, R4)", () => {
  let tmpDir;
  let tmpDbPath;
  let initialProdHash;
  let initialProdMtime;
  let testDb;

  before(() => {
    // 1. Snapshot do banco de dados de produção para garantir não-interferência estrita
    assert.ok(fs.existsSync(prodDbPath), "data/database.json must exist");
    initialProdHash = sha256File(prodDbPath);
    initialProdMtime = fs.statSync(prodDbPath).mtimeMs;

    // 2. Ambiente temporário isolado em os.tmpdir()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gfm-sofia-fiscal-test-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    // Copia banco com segurança
    fs.copyFileSync(prodDbPath, tmpDbPath);

    // 3. Deleta DATABASE_URL e garante modo de teste isolado
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "test";

    // 4. Cria banco de dados de teste isolado com registros semente controlados
    testDb = {
      zapiConfig: {
        enabled: true,
        testModeOnly: false,
        developerPhone: "22998505276",
        channels: {
          ai_agent: { enabled: true, testMode: false, whitelist: ["22998505276", "5522998505276"] }
        }
      },
      whatsappAiSettings: {
        enabled: true,
        mode: "autonomous",
        agentName: "Sofia",
        developerPhone: "22998505276"
      },
      companies: [
        {
          id: 701,
          corporateName: "TecnoPetro Engenharia Subsea LTDA",
          tradeName: "TecnoPetro Subsea",
          cnpj: "12345678000195", // CNPJ válido para testes
          financialEmail: "financeiro@tecnopetro.com.br",
          phone: "22998505276",
          logradouro: "Av. Pelinca",
          numero: "150",
          bairro: "Pelinca",
          cidade: "Campos dos Goytacazes",
          uf: "RJ",
          cep: "28035000"
        }
      ],
      guests: [
        {
          id: 501,
          name: "Miller Ferreira",
          phone: "22998505276",
          whatsapp: "22998505276",
          email: "miller@corpflats.com.br",
          cpf: "11144477735",
          companyId: 701,
          companyName: "TecnoPetro Engenharia Subsea LTDA"
        },
        {
          id: 502,
          name: "Hóspede Não Autorizado",
          phone: "21999998888",
          whatsapp: "5521999998888",
          email: "hospede.externo@email.com",
          cpf: "22255588899"
        }
      ],
      reservations: [
        {
          id: 605,
          code: "RES-605-TEST",
          guestId: 501,
          guestName: "Miller Ferreira",
          guestPhone: "22998505276",
          guestEmail: "miller@corpflats.com.br",
          companyId: 701,
          flatNumber: "605",
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-05",
          totalAmount: 600.00,
          status: "confirmada"
        },
        {
          id: 501,
          code: "RES-501-TEST",
          guestId: 501,
          guestName: "Miller Ferreira",
          guestPhone: "22998505276",
          flatNumber: "501",
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-15",
          totalAmount: 750.00,
          status: "confirmada"
        },
        {
          id: 777,
          code: "RES-777-TEST",
          guestId: 502,
          guestName: "Hóspede Não Autorizado",
          guestPhone: "5521999998888",
          flatNumber: "702",
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-03",
          totalAmount: 400.00,
          status: "confirmada"
        }
      ],
      invoices: [],
      pendingFiscalApprovals: [],
      whatsappConversations: []
    };
  });

  after(() => {
    // 1. Remove diretório temporário
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}

    // 2. Prova forense incontestável de que data/database.json de produção permaneceu 100% intocado
    const finalProdHash = sha256File(prodDbPath);
    const finalProdMtime = fs.statSync(prodDbPath).mtimeMs;

    assert.strictEqual(
      finalProdHash,
      initialProdHash,
      "VIOLAÇÃO CRÍTICA DE INTEGRIDADE: data/database.json SHA-256 foi modificado durante os testes!"
    );
    assert.strictEqual(
      finalProdMtime,
      initialProdMtime,
      "VIOLAÇÃO CRÍTICA DE INTEGRIDADE: data/database.json mtime foi modificado durante os testes!"
    );
  });

  it("Critério 1 (R1): Ao receber solicitação de nota fiscal de 22998505276, apresenta dados de conferência (tomador, descrição e valor)", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const conv = {
      id: "conv_test_miller",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      unreadCount: 0
    };
    testDb.whatsappConversations = [conv];

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Olá Sofia, preciso da nota fiscal da minha hospedagem no flat 605",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true, "O fluxo fiscal deve interceptar a mensagem do número autorizado");
    assert.strictEqual(result.action, "presented_conference", "Deve apresentar a tela de conferência de dados");
    assert.ok(result.replyText, "Deve conter texto de resposta");

    // Valida os 3 pilares da conferência (R1)
    // 1. Tomador (Nome/Razão Social e Documento)
    assert.match(result.replyText, /TecnoPetro Engenharia Subsea LTDA/i, "Deve exibir a razão social do tomador");
    assert.match(result.replyText, /12\.345\.678\/0001-95/, "Deve exibir o CNPJ formatado do tomador");
    assert.match(result.replyText, /financeiro@tecnopetro\.com\.br/i, "Deve exibir o e-mail do tomador");

    // 2. Descrição da estadia
    assert.match(result.replyText, /Flat 605/i, "Deve conter a identificação do flat na descrição");
    assert.match(result.replyText, /01\/11\/2026/i, "Deve conter a data de check-in");
    assert.match(result.replyText, /05\/11\/2026/i, "Deve conter a data de check-out");

    // 3. Valor total
    assert.match(result.replyText, /600,00/, "Deve apresentar o valor total de R$ 600,00");

    // 4. Estado da conversa aguardando confirmação
    assert.ok(conv.fiscalConferenceState, "Deve salvar o rascunho de conferência na conversa");
    assert.strictEqual(conv.fiscalConferenceState.status, "awaiting_confirmation");
    assert.strictEqual(conv.fiscalConferenceState.valorOriginal, 600.00);
    assert.strictEqual(conv.fiscalConferenceState.valorServico, 600.00);
  });

  it("Critério 2 (R1): Mediante confirmação explícita do usuário, aciona emissão da NFS-e e envia dados/link no WhatsApp", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const conv = testDb.whatsappConversations.find(c => c.phone === "22998505276");
    assert.ok(conv?.fiscalConferenceState, "Deve haver conferência pendente do teste anterior");
    assert.strictEqual(conv.fiscalConferenceState.status, "awaiting_confirmation");

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Sim, os dados estão corretos, pode emitir a nota fiscal!",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true, "Deve processar a confirmação de emissão");
    assert.strictEqual(result.action, "emitted_nfse", "Ação deve ser emitida");
    assert.ok(result.numeroNfse, "Deve retornar o número da NFS-e emitida");
    assert.ok(result.linkPrefeitura, "Deve retornar o link de consulta da NFS-e");

    // Mensagem de resposta deve conter número da nota e link/documento
    assert.match(result.replyText, /Nota Fiscal Emitida com Sucesso/i);
    assert.match(result.replyText, new RegExp(result.numeroNfse));
    assert.match(result.replyText, /600,00/);

    // Valida persistência em db.invoices
    const emittedInvoice = testDb.invoices.find(i => String(i.numeroNfse) === String(result.numeroNfse));
    assert.ok(emittedInvoice, "A fatura deve ter sido inserida em db.invoices");
    assert.strictEqual(emittedInvoice.status, "autorizada");
    assert.strictEqual(Number(emittedInvoice.valorServico), 600.00);
    assert.strictEqual(emittedInvoice.tomadorCpfCnpj, "12345678000195");

    // Valida vínculo na reserva
    const res = testDb.reservations.find(r => r.id === 605);
    assert.strictEqual(String(res.numeroNfse), String(result.numeroNfse));
    assert.strictEqual(res.invoiceId, emittedInvoice.id);

    // Estado da conferência marcado como emitido
    assert.strictEqual(conv.fiscalConferenceState.status, "emitted");
  });

  it("Critério 3 (R2): Alteração de dados cadastrais/descrição é aplicada diretamente sem travar a emissão", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    // Prepara conferência para Reserva 501 (Valor: 750,00)
    const conv = {
      id: "conv_test_cadastral",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 501,
        reservationCode: "RES-501-TEST",
        flatNumber: "501",
        tomadorNome: "Miller Ferreira",
        tomadorCpfCnpj: "11144477735",
        tomadorTipo: "PF",
        tomadorEmail: "miller@corpflats.com.br",
        tomadorEndereco: "Av. Pelinca, 100",
        descricaoServico: "Diárias de hospedagem no Flat 501",
        valorOriginal: 750.00,
        valorServico: 750.00
      }
    };
    testDb.whatsappConversations.push(conv);

    // Usuário solicita alteração cadastral: mudar e-mail e descrição
    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Por gentileza, muda o e-mail para financeiro@novodominio.com.br e a descrição para Diárias executivas Flat 501",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "updated_conference_data", "Deve atualizar os dados cadastrais da conferência");
    assert.strictEqual(conv.fiscalConferenceState.tomadorEmail, "financeiro@novodominio.com.br");
    assert.strictEqual(conv.fiscalConferenceState.descricaoServico, "Diárias executivas Flat 501");
    // Valor permaneceu o original (750.00)
    assert.strictEqual(conv.fiscalConferenceState.valorServico, 750.00);
    // Não criou aprovação pendente no gestor porque o valor não foi alterado
    assert.strictEqual(testDb.pendingFiscalApprovals.length, 0);
  });

  it("Critério 3 (R2): Solicitação de alteração de valor BLOQUEIA emissão imediata, notifica gestor e exige aprovação", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const conv = testDb.whatsappConversations.find(c => c.id === "conv_test_cadastral");
    assert.strictEqual(conv.fiscalConferenceState.status, "awaiting_confirmation");
    assert.strictEqual(conv.fiscalConferenceState.valorOriginal, 750.00);

    // Usuário pede para alterar o valor para R$ 900,00
    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "O valor ficou incorreto, por favor altera o valor para 900 reais",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "value_lock_engaged", "Trava de segurança de valor deve ser ativada");
    assert.strictEqual(result.requestedValue, 900.00);
    assert.strictEqual(result.originalValue, 750.00);

    // 1. Emissão imediata foi BLOQUEADA (nenhuma nota de 900 emitida ainda)
    const invoice900 = (testDb.invoices || []).find(i => Number(i.valorServico) === 900.00);
    assert.strictEqual(invoice900, undefined, "Nenhuma NFS-e pode ser emitida diretamente com valor alterado");

    // 2. Registrou solicitação pendente em db.pendingFiscalApprovals
    assert.strictEqual(testDb.pendingFiscalApprovals.length, 1);
    const pending = testDb.pendingFiscalApprovals[0];
    assert.strictEqual(pending.status, "pending_manager");
    assert.strictEqual(pending.requestedValue, 900.00);
    assert.strictEqual(pending.originalValue, 750.00);
    assert.strictEqual(pending.flatNumber, "501");

    // 3. Notificação disparada no WhatsApp para o número do gestor (5522998505276)
    const managerNotif = sentZapi.find(s => s.phone === "5522998505276" || s.recipientRole === "developer");
    assert.ok(managerNotif, "Gestor deve receber notificação de alteração de valor via WhatsApp");
    assert.match(managerNotif.message, /Solicitação de Alteração de Valor/i);
    assert.match(managerNotif.message, /750,00/);
    assert.match(managerNotif.message, /900,00/);
    assert.match(managerNotif.message, /Flat 501/i);

    // 4. Mensagem ao solicitante informando necessidade de aprovação da gerência
    assert.match(result.replyText, /aprovação prévia do gestor/i);
    assert.match(result.replyText, /900,00/);

    // 5. Gestor aprova a solicitação ("Aprovar fiscal")
    const sentZapiManager = [];
    const mockSendZapiManager = async (cfg, payload) => {
      sentZapiManager.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const approvalResult = await handleManagerFiscalApprovalReply({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Aprovar fiscal",
      conv,
      sendZapiMessage: mockSendZapiManager,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(approvalResult.handled, true, "Gestor deve ter aprovação processada");
    assert.strictEqual(approvalResult.action, "manager_approved_fiscal");
    assert.ok(approvalResult.numeroNfse, "Deve retornar o número da NFS-e emitida após aprovação");

    // A nota agora SIM foi emitida com o valor aprovado de R$ 900,00
    const approvedInvoice = testDb.invoices.find(i => String(i.numeroNfse) === String(approvalResult.numeroNfse));
    assert.ok(approvedInvoice, "NFS-e deve existir no banco de dados");
    assert.strictEqual(Number(approvedInvoice.valorServico), 900.00, "O valor emitido deve ser o novo valor aprovado (900.00)");
    assert.strictEqual(pending.status, "approved", "Status da pendência deve ser aprovado");
  });

  it("Critério 4 (R3): Solicitações de nota fiscal vindas de números NÃO autorizados são descartadas silenciosamente (handled: false)", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const convUnauthorized = {
      id: "conv_unauthorized",
      phone: "5521999998888",
      name: "Cliente Externo",
      messages: []
    };
    testDb.whatsappConversations.push(convUnauthorized);

    const initialInvoicesCount = testDb.invoices.length;
    const initialApprovalsCount = testDb.pendingFiscalApprovals.length;

    // Número de teste diferente de 22998505276 pede nota fiscal
    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "5521999998888",
      messageText: "Olá Sofia, quero minha nota fiscal por favor!",
      senderName: "Cliente Externo",
      conv: convUnauthorized,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => convUnauthorized.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    // Deve descartar silenciosamente retornando handled: false
    assert.strictEqual(result.handled, false, "Mensagens fiscais de números não autorizados DEVEM retornar handled: false");
    assert.strictEqual(sentZapi.length, 0, "Nenhuma mensagem fiscal pode ser enviada para números não autorizados");
    assert.strictEqual(testDb.invoices.length, initialInvoicesCount, "Nenhuma nota pode ser emitida");
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovalsCount, "Nenhuma aprovação criada");
    assert.strictEqual(convUnauthorized.fiscalConferenceState, undefined, "Nenhum estado fiscal criado");
  });

  it("Validação de Integração em processAiInboundMessage: Roteamento de ponta a ponta", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    // Caso A: Mensagem de número não autorizado passa batido para atendimento normal (handled: false)
    const resultNonAuth = await processAiInboundMessage({
      db: testDb,
      incomingInfo: {
        senderPhone: "5521999998888",
        phone: "5521999998888",
        text: "Gostaria da minha nota fiscal",
        fromMe: false,
        isGroup: false,
        senderName: "Não Autorizado"
      },
      cleanTarget: "5521999998888",
      saveDatabase: () => {},
      createNotification: () => {},
      sendZapiMessage: mockSendZapi,
      appendMessageFn: () => {}
    });
    // O fluxo fiscal não manipula a mensagem (retorna handled: false / cai no fluxo normal)
    assert.notStrictEqual(resultNonAuth?.action, "presented_conference");
    assert.notStrictEqual(resultNonAuth?.action, "emitted_nfse");

    // Caso B: Número autorizado pede nota fiscal -> Interceptado com sucesso
    const convMiller = testDb.whatsappConversations.find(c => c.phone === "22998505276");
    convMiller.fiscalConferenceState = null;

    const resultAuth = await processAiInboundMessage({
      db: testDb,
      incomingInfo: {
        senderPhone: "5522998505276",
        phone: "5522998505276",
        text: "Preciso da minha nota fiscal da hospedagem",
        fromMe: false,
        isGroup: false,
        senderName: "Miller Ferreira"
      },
      cleanTarget: "22998505276",
      saveDatabase: () => {},
      createNotification: () => {},
      sendZapiMessage: mockSendZapi,
      appendMessageFn: () => {}
    });

    assert.strictEqual(resultAuth?.handled, true);
    assert.strictEqual(resultAuth?.action, "presented_conference");
    assert.match(resultAuth?.replyText, /Conferência de Dados/i);
  });

  // ── REGRAS DE OURO M1 ITERAÇÃO 2: PREVENÇÃO DE FALSOS POSITIVOS NA TRAVA DE VALOR ──

  it("Unitário: parseFlexibleMoney não deve capturar preposições com datas, diárias ou número de flat, mas deve capturar valores monetários reais", () => {
    // Falsos positivos que NÃO devem ser interpretados como valor monetário:
    assert.strictEqual(parseFlexibleMoney("Confirmo, pode emitir a nota de 01/11 a 05/11"), null);
    assert.strictEqual(parseFlexibleMoney("Muda a descrição para Diárias de 01/11 a 05/11"), null);
    assert.strictEqual(parseFlexibleMoney("Muda a descrição para Hospedagem de 3 diárias no flat 605"), null);
    assert.strictEqual(parseFlexibleMoney("Pode emitir para 501"), null);
    assert.strictEqual(parseFlexibleMoney("Quero emitir a nota fiscal do flat 605"), null);

    // Verdadeiros positivos que DEVEM ser interpretados como valor monetário:
    assert.strictEqual(parseFlexibleMoney("Muda o valor para R$ 850,00"), "850.00");
    assert.strictEqual(parseFlexibleMoney("altera o valor para 900 reais"), "900.00");
    assert.strictEqual(parseFlexibleMoney("coloca o valor de R$ 1.250,50"), "1250.50");
    assert.strictEqual(parseFlexibleMoney("preço: 750"), "750.00");
    assert.strictEqual(parseFlexibleMoney("850"), "850.00");
  });

  it("Regressão M1-It2 (1): Confirmação contendo datas de estadia ('Confirmo, pode emitir a nota de 01/11 a 05/11') deve emitir NFS-e sem acionar trava de valor", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const initialApprovals = testDb.pendingFiscalApprovals.length;
    const conv = {
      id: "conv_it2_confirm_dates",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 605,
        reservationCode: "RES-605-TEST",
        flatNumber: "605",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        tomadorEndereco: "Av. Pelinca, 150",
        descricaoServico: "Hospedagem no Flat 605 de 01/11/2026 a 05/11/2026",
        valorOriginal: 600.00,
        valorServico: 600.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Confirmo, pode emitir a nota de 01/11 a 05/11",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.notStrictEqual(result.action, "value_lock_engaged", "Não deve acionar trava de valor para datas na confirmação!");
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "emitted_nfse", "Deve emitir a nota fiscal diretamente");
    assert.ok(result.numeroNfse, "Deve conter número da NFS-e");
    assert.ok(result.linkPrefeitura, "Deve conter link de consulta da NFS-e");
    assert.strictEqual(conv.fiscalConferenceState.status, "emitted");
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovals, "Nenhuma aprovação pendente deve ter sido gerada");
  });

  it("Regressão M1-It2 (2): Alteração de descrição contendo datas ('Muda a descrição para Diárias de 01/11 a 05/11') deve atualizar descrição sem travar valor", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const initialApprovals = testDb.pendingFiscalApprovals.length;
    const conv = {
      id: "conv_it2_desc_dates",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 605,
        reservationCode: "RES-605-TEST",
        flatNumber: "605",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        tomadorEndereco: "Av. Pelinca, 150",
        descricaoServico: "Hospedagem no Flat 605",
        valorOriginal: 600.00,
        valorServico: 600.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Muda a descrição para Diárias de 01/11 a 05/11",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.notStrictEqual(result.action, "value_lock_engaged", "Não deve acionar trava de valor para datas na descrição!");
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "updated_conference_data", "Deve atualizar os dados cadastrais da conferência");
    assert.strictEqual(conv.fiscalConferenceState.descricaoServico, "Diárias de 01/11 a 05/11");
    assert.strictEqual(conv.fiscalConferenceState.valorServico, 600.00, "Valor do serviço deve permanecer inalterado em R$ 600,00");
    assert.strictEqual(conv.fiscalConferenceState.status, "awaiting_confirmation");
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovals, "Nenhuma aprovação de valor deve ser criada");
  });

  it("Regressão M1-It2 (3): Alteração de descrição com contagem de diárias ('Muda a descrição para Hospedagem de 3 diárias no flat 605') deve atualizar descrição sem travar valor", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const initialApprovals = testDb.pendingFiscalApprovals.length;
    const conv = {
      id: "conv_it2_desc_nights",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 605,
        reservationCode: "RES-605-TEST",
        flatNumber: "605",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        tomadorEndereco: "Av. Pelinca, 150",
        descricaoServico: "Hospedagem no Flat 605",
        valorOriginal: 600.00,
        valorServico: 600.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Muda a descrição para Hospedagem de 3 diárias no flat 605",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.notStrictEqual(result.action, "value_lock_engaged", "Não deve confundir contagem de diárias com R$ 3,00!");
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "updated_conference_data");
    assert.strictEqual(conv.fiscalConferenceState.descricaoServico, "Hospedagem de 3 diárias no flat 605");
    assert.strictEqual(conv.fiscalConferenceState.valorServico, 600.00, "Valor do serviço deve permanecer R$ 600,00");
    assert.strictEqual(conv.fiscalConferenceState.status, "awaiting_confirmation");
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovals);
  });

  it("Regressão M1-It2 (4): Confirmação mencionando número do flat ('Pode emitir para 501') deve emitir NFS-e sem acionar trava de valor", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const initialApprovals = testDb.pendingFiscalApprovals.length;
    const conv = {
      id: "conv_it2_confirm_flat",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 501,
        reservationCode: "RES-501-TEST",
        flatNumber: "501",
        tomadorNome: "Miller Ferreira",
        tomadorCpfCnpj: "11144477735",
        tomadorTipo: "PF",
        tomadorEmail: "miller@corpflats.com.br",
        tomadorEndereco: "Av. Pelinca, 100",
        descricaoServico: "Diárias executivas Flat 501",
        valorOriginal: 750.00,
        valorServico: 750.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Pode emitir para 501",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.notStrictEqual(result.action, "value_lock_engaged", "Não deve interpretar 'para 501' como novo valor de R$ 501,00!");
    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "emitted_nfse", "Deve emitir a NFS-e");
    assert.ok(result.numeroNfse);
    assert.strictEqual(conv.fiscalConferenceState.status, "emitted");
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovals, "Nenhuma aprovação pendente gerada");

    // Garante que o valor emitido permaneceu R$ 750,00 e não virou R$ 501,00
    const emittedInv = testDb.invoices.find(i => String(i.numeroNfse) === String(result.numeroNfse));
    assert.ok(emittedInv, "Nota fiscal emitida deve existir no banco de teste");
    assert.strictEqual(Number(emittedInv.valorServico), 750.00, "Valor emitido deve ser R$ 750,00");
  });

  it("Regressão M1-It2 (5): Alteração legítima de valor ('Muda o valor para R$ 850,00') deve engajar a trava de valor (value_lock_engaged)", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const initialApprovals = testDb.pendingFiscalApprovals.length;
    const conv = {
      id: "conv_it2_genuine_val_change",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 605,
        reservationCode: "RES-605-TEST",
        flatNumber: "605",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        tomadorEndereco: "Av. Pelinca, 150",
        descricaoServico: "Hospedagem no Flat 605",
        valorOriginal: 600.00,
        valorServico: 600.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Muda o valor para R$ 850,00",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "value_lock_engaged", "Deve engajar a trava de segurança de valor");
    assert.strictEqual(result.requestedValue, 850.00, "Novo valor solicitado deve ser 850.00");
    assert.strictEqual(result.originalValue, 600.00, "Valor original deve ser 600.00");

    // Nenhuma NFS-e emitida com 850 imediatamente
    const prematureInvoice = (testDb.invoices || []).find(i => Number(i.valorServico) === 850.00);
    assert.strictEqual(prematureInvoice, undefined, "Não pode emitir NFS-e de R$ 850,00 sem aprovação do gestor");

    // Registrou aprovação pendente no banco
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovals + 1);
    const pending = testDb.pendingFiscalApprovals[testDb.pendingFiscalApprovals.length - 1];
    assert.strictEqual(pending.status, "pending_manager");
    assert.strictEqual(pending.requestedValue, 850.00);
    assert.strictEqual(pending.originalValue, 600.00);
    assert.strictEqual(pending.flatNumber, "605");

    // Notificação enviada ao gestor
    const managerMsg = sentZapi.find(s => s.phone === "5522998505276" || s.recipientRole === "developer");
    assert.ok(managerMsg, "Gestor deve receber notificação no WhatsApp");
    assert.match(managerMsg.message, /850,00/);
    assert.match(managerMsg.message, /600,00/);

    // Resposta ao cliente informando sobre a necessidade de aprovação
    assert.match(result.replyText, /850,00/);
    assert.match(result.replyText, /aprovação prévia do gestor/i);
  });

  // ── DESAFIOS ADVERSARIAIS DO CHALLENGER (M1-IT2) ──

  it("Desafio Empírico 1: Alteração concomitante de descrição e valor ('Muda a descrição para Diárias executivas e o valor para R$ 800') atualiza descrição e engaja trava de valor", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const initialApprovals = testDb.pendingFiscalApprovals.length;
    const conv = {
      id: "conv_it2_concomitant",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 605,
        reservationCode: "RES-605-TEST",
        flatNumber: "605",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        tomadorEndereco: "Av. Pelinca, 150",
        descricaoServico: "Hospedagem no Flat 605",
        valorOriginal: 600.00,
        valorServico: 600.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Muda a descrição para Diárias executivas e o valor para R$ 800",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true, "Fluxo fiscal deve interceptar");
    assert.strictEqual(result.action, "value_lock_engaged", "Deve engajar a trava de valor");
    assert.strictEqual(result.requestedValue, 800.00, "Valor solicitado deve ser 800.00");
    assert.strictEqual(conv.fiscalConferenceState.descricaoServico, "Diárias executivas", "Descrição deve ser atualizada em conf");

    // Valida a aprovação pendente criada
    assert.strictEqual(testDb.pendingFiscalApprovals.length, initialApprovals + 1);
    const pending = testDb.pendingFiscalApprovals[testDb.pendingFiscalApprovals.length - 1];
    assert.strictEqual(pending.status, "pending_manager");
    assert.strictEqual(pending.requestedValue, 800.00);
    assert.strictEqual(pending.pendingFiscalInvoice.descricaoServico, "Diárias executivas", "Descrição na fatura pendente deve ser a nova");

    // Agora gestor aprova a solicitação
    const sentZapiManager = [];
    const mockSendZapiManager = async (cfg, payload) => {
      sentZapiManager.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const approvalResult = await handleManagerFiscalApprovalReply({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: `Aprovar #${pending.id}`,
      conv,
      sendZapiMessage: mockSendZapiManager,
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(approvalResult.handled, true);
    assert.strictEqual(approvalResult.action, "manager_approved_fiscal");

    const emittedInvoice = testDb.invoices.find(i => String(i.numeroNfse) === String(approvalResult.numeroNfse));
    assert.ok(emittedInvoice, "Nota fiscal emitida deve existir no banco");
    assert.strictEqual(Number(emittedInvoice.valorServico), 800.00, "Valor da nota deve ser 800.00");
    assert.strictEqual(emittedInvoice.discriminacao, "Diárias executivas", "Discriminação da nota deve ser a nova descrição");
  });

  it("Desafio Empírico 2: Telefones não autorizados (5521999998888, 5522988887777, aleatórios) são silenciosamente descartados ({ handled: false })", async () => {
    const mockSendZapi = async () => ({ success: true });
    const unauthorizedNumbers = [
      "5521999998888",
      "5522988887777",
      "5511987654321",
      "41999999999",
      "12345678"
    ];

    for (const phone of unauthorizedNumbers) {
      const conv = {
        id: `conv_${phone}`,
        phone,
        name: "Desconhecido",
        messages: []
      };

      // 1. Pedido de nota fiscal
      const resRequest = await handleWhatsAppFiscalFlow({
        db: testDb,
        cleanTarget: phone,
        messageText: "Quero minha nota fiscal da hospedagem",
        senderName: "Desconhecido",
        conv,
        sendZapiMessage: mockSendZapi,
        appendMessageFn: () => {},
        saveDatabase: () => {},
        createNotification: () => {}
      });
      assert.strictEqual(resRequest.handled, false, `Número ${phone} em pedido de nota deve retornar handled: false`);

      // 2. Confirmação
      const resConfirm = await handleWhatsAppFiscalFlow({
        db: testDb,
        cleanTarget: phone,
        messageText: "Sim, confirmo os dados da nota",
        senderName: "Desconhecido",
        conv,
        sendZapiMessage: mockSendZapi,
        appendMessageFn: () => {},
        saveDatabase: () => {},
        createNotification: () => {}
      });
      assert.strictEqual(resConfirm.handled, false, `Número ${phone} em confirmação deve retornar handled: false`);

      // 3. Alteração de valor
      const resValChange = await handleWhatsAppFiscalFlow({
        db: testDb,
        cleanTarget: phone,
        messageText: "Muda o valor para R$ 1000",
        senderName: "Desconhecido",
        conv,
        sendZapiMessage: mockSendZapi,
        appendMessageFn: () => {},
        saveDatabase: () => {},
        createNotification: () => {}
      });
      assert.strictEqual(resValChange.handled, false, `Número ${phone} em alteração de valor deve retornar handled: false`);
    }
  });

  it("Desafio Empírico 3: Spoofing de gestor - número não autorizado NÃO consegue aprovar pendência fiscal", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    // Cria aprovação pendente legítima
    const pendingId = `NFSE-APP-SPOOF-${Date.now()}`;
    const pendingApproval = {
      id: pendingId,
      status: "pending_manager",
      requesterPhone: "22998505276",
      requesterName: "Miller Ferreira",
      reservationId: 605,
      reservationCode: "RES-605-TEST",
      flatNumber: "605",
      originalValue: 600.00,
      requestedValue: 950.00,
      reason: "Muda valor para 950",
      pendingFiscalInvoice: {
        reservationId: 605,
        reservationCode: "RES-605-TEST",
        flatNumber: "605",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        descricaoServico: "Hospedagem Flat 605",
        valorOriginal: 600.00,
        valorServico: 950.00
      },
      createdAt: new Date().toISOString()
    };
    testDb.pendingFiscalApprovals.push(pendingApproval);

    const initialInvoices = testDb.invoices.length;

    // Invasor/não-gestor (5521999998888) tenta aprovar diretamente
    const spoofResultDirect = await handleManagerFiscalApprovalReply({
      db: testDb,
      cleanTarget: "5521999998888",
      messageText: `Aprovar fiscal #${pendingId}`,
      sendZapiMessage: mockSendZapi,
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });
    assert.strictEqual(spoofResultDirect.handled, false, "Tentativa de aprovação direta de não-gestor deve ser rejeitada com handled: false");
    assert.strictEqual(pendingApproval.status, "pending_manager", "Status da pendência deve permanecer pending_manager");
    assert.strictEqual(testDb.invoices.length, initialInvoices, "Nenhuma nota fiscal deve ser emitida por não-gestor");

    // Invasor/não-gestor (5522988887777) tenta aprovar via handleWhatsAppFiscalFlow
    const spoofResultFlow = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "5522988887777",
      messageText: "Aprovar fiscal",
      senderName: "Impostor",
      sendZapiMessage: mockSendZapi,
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });
    assert.strictEqual(spoofResultFlow.handled, false, "Tentativa de aprovação via fluxo de não-gestor deve ser rejeitada com handled: false");
    assert.strictEqual(pendingApproval.status, "pending_manager", "Status da pendência deve permanecer pending_manager");
    assert.strictEqual(testDb.invoices.length, initialInvoices, "Nenhuma nota fiscal deve ser emitida por não-gestor");
  });

  it("Autoemissão no Check-out (1): Ao pedir nota fiscal no WhatsApp (número autorizado), ativa autoEmitInvoice = true no hóspede e em todas as suas reservas", async () => {
    const guestMiller = testDb.guests.find(g => g.id === 501);
    const res605 = testDb.reservations.find(r => r.id === 605);
    const res501 = testDb.reservations.find(r => r.id === 501);

    // Reseta flags antes do teste
    guestMiller.autoEmitInvoice = false;
    res605.autoEmitInvoice = false;
    res501.autoEmitInvoice = false;

    const conv = {
      id: "conv_auto_emit_auth",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: []
    };

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Sofia, pode gerar minha nota fiscal por favor?",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(guestMiller.autoEmitInvoice, true, "Deve ativar autoEmitInvoice = true no cadastro do hóspede (db.guests)");
    assert.strictEqual(res605.autoEmitInvoice, true, "Deve ativar autoEmitInvoice = true na reserva principal do hóspede");
    assert.strictEqual(res501.autoEmitInvoice, true, "Deve propagar autoEmitInvoice = true para as demais reservas do mesmo hóspede");
  });

  it("Autoemissão no Check-out (2): Hóspede fora do número de teste (ex.: 5521999998888) que pede nota no WhatsApp tem autoEmitInvoice = true ativado silenciosamente enquanto a Sofia ignora a emissão no chat", async () => {
    const guestExterno = testDb.guests.find(g => g.id === 502);
    const res777 = testDb.reservations.find(r => r.id === 777);

    // Cria uma segunda reserva futura para o mesmo hóspede externo para validar propagação
    const res778 = {
      id: 778,
      code: "RES-778-TEST",
      guestId: 502,
      guestName: "Hóspede Não Autorizado",
      guestPhone: "5521999998888",
      flatNumber: "703",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      totalAmount: 550.00,
      status: "confirmada",
      autoEmitInvoice: false
    };
    testDb.reservations.push(res778);

    guestExterno.autoEmitInvoice = false;
    res777.autoEmitInvoice = false;

    let saveCalled = false;
    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "5521999998888",
      messageText: "Olá, gostaria de pedir a nota fiscal da minha estadia",
      senderName: "Hóspede Não Autorizado",
      conv: { id: "conv_ext_auto", phone: "5521999998888", messages: [] },
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => { saveCalled = true; },
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, false, "Sofia deve continuar ignorando a resposta fiscal no WhatsApp para números fora do teste");
    assert.strictEqual(guestExterno.autoEmitInvoice, true, "Deve ativar silenciosamente autoEmitInvoice = true no hóspede em db.guests");
    assert.strictEqual(res777.autoEmitInvoice, true, "Deve ativar autoEmitInvoice = true na reserva atual do hóspede");
    assert.strictEqual(res778.autoEmitInvoice, true, "Deve propagar autoEmitInvoice = true para as demais reservas do mesmo hóspede");
    assert.strictEqual(saveCalled, true, "Deve persistir a alteração no banco de dados");
  });

  it("Autoemissão no Check-out (3): Emissão de nota fiscal (WhatsApp ou Painel /notas) ativa autoEmitInvoice = true no hóspede e em todas as suas reservas", async () => {
    const guestExterno = testDb.guests.find(g => g.id === 502);
    const res777 = testDb.reservations.find(r => r.id === 777);
    const res778 = testDb.reservations.find(r => r.id === 778);

    guestExterno.autoEmitInvoice = false;
    res777.autoEmitInvoice = false;
    if (res778) res778.autoEmitInvoice = false;

    const emitRes = await executeWhatsAppFiscalEmission({
      db: testDb,
      payload: {
        reservationId: 777,
        reservationCode: "RES-777-TEST",
        guestId: 502,
        flatNumber: "702",
        tomadorNome: "Hóspede Não Autorizado",
        tomadorCpfCnpj: "11144477735",
        tomadorTelefone: "5521999998888",
        tomadorEmail: "hospede.externo@email.com",
        valorServico: 400.00,
        descricaoServico: "Hospedagem Flat 702"
      },
      saveDatabase: () => {}
    });

    assert.strictEqual(emitRes.success, true);
    assert.strictEqual(guestExterno.autoEmitInvoice, true, "Emissão fiscal deve ativar autoEmitInvoice = true no hóspede");
    assert.strictEqual(res777.autoEmitInvoice, true, "Emissão fiscal deve ativar autoEmitInvoice = true na reserva emitida");
    if (res778) {
      assert.strictEqual(res778.autoEmitInvoice, true, "Emissão fiscal deve propagar autoEmitInvoice = true para todas as reservas do hóspede");
    }
  });
});

