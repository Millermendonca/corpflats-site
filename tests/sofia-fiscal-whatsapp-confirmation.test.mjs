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
  findExistingInvoiceForReservation,
  isReservationCheckedOutForFiscal,
  resolveCrmFiscalTomador,
  parseFlexibleMoney,
  formatDateBr,
  formatMoneyBr,
  formatCpfOrCnpj,
  findContactAndReservation,
  processAiInboundMessage
} from "../artifacts/api-server/whatsapp-ai-service.mjs";
import {
  extractIncomingMessageInfo,
  resolveWhatsAppTargetPhone
} from "../artifacts/api-server/zapi-service.mjs";
import {
  buildOfficialNfseDraftForReservation
} from "../artifacts/api-server/chat-service.mjs";

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

    // 2. Descrição da estadia (padrão do sistema /notas)
    assert.match(result.replyText, /Nota relativa à hospedagem de Miller Ferreira, no Flat 605\./, "Deve conter o cabeçalho padrão de /notas com hóspede e flat");
    assert.match(result.replyText, /Local: CorpFlats\./, "Deve conter o local CorpFlats");
    assert.match(result.replyText, /Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ/, "Deve conter o endereço do local");
    assert.match(result.replyText, /Quantidade de diárias: 4/, "Deve conter a quantidade de diárias calculada");
    assert.match(result.replyText, /Check-in: 2026-11-01/, "Deve conter a data de check-in no formato padrão");
    assert.match(result.replyText, /Check-out: 2026-11-05/, "Deve conter a data de check-out no formato padrão");

    // 3. Valor total
    assert.match(result.replyText, /600,00/, "Deve apresentar o valor total de R$ 600,00");

    // 4. Estado da conversa aguardando confirmação
    assert.ok(conv.fiscalConferenceState, "Deve salvar o rascunho de conferência na conversa");
    assert.strictEqual(conv.fiscalConferenceState.status, "awaiting_confirmation");
    assert.strictEqual(conv.fiscalConferenceState.valorOriginal, 600.00);
    assert.strictEqual(conv.fiscalConferenceState.valorServico, 600.00);
  });

  it("Critério 2 (R1): Mediante confirmação explícita do usuário (pós-check-out), aciona emissão da NFS-e e envia dados/link no WhatsApp", async () => {
    const sentZapi = [];
    const mockSendZapi = async (cfg, payload) => {
      sentZapi.push(payload);
      return { success: true, messageId: `msg_${Date.now()}` };
    };

    const res605 = testDb.reservations.find(r => r.id === 605);
    res605.checkoutDone = true;

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

    // 5. Gestor aprova a solicitação ("Aprovar fiscal") para reserva já em pós-check-out
    const res501 = testDb.reservations.find(r => r.id === 501);
    res501.checkoutDone = true;

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

    // Caso B: Número autorizado pede nota fiscal (reserva sem nota prévia) -> Interceptado com sucesso
    const res605 = testDb.reservations.find(r => r.id === 605);
    delete res605.invoiceId;
    delete res605.numeroNfse;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 605);

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

    const res605 = testDb.reservations.find(r => r.id === 605);
    res605.checkoutDone = true;
    delete res605.invoiceId;
    delete res605.numeroNfse;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 605);

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

    const res501 = testDb.reservations.find(r => r.id === 501);
    res501.checkoutDone = true;
    delete res501.invoiceId;
    delete res501.numeroNfse;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 501);

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

    // Agora gestor aprova a solicitação (em reserva pós-check-out sem nota prévia)
    const res605 = testDb.reservations.find(r => r.id === 605);
    res605.checkoutDone = true;
    delete res605.invoiceId;
    delete res605.numeroNfse;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 605);

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

  // ── AGENDAMENTO PRÉ-CHECK-OUT E TRAVA ANTI-DUPLICIDADE ──

  it("Agendamento Pré-Check-out (1): Hóspede com reserva ativa (antes do check-out) confirma dados da nota -> Sofia NÃO emite ainda, agenda para o check-out e salva confirmedFiscalData", async () => {
    const resPre = {
      id: 801,
      code: "RES-801-PRE",
      guestId: 501,
      guestName: "Miller Ferreira",
      guestPhone: "22998505276",
      companyId: 701,
      flatNumber: "801",
      checkinDate: "2026-11-01",
      checkoutDate: "2099-12-31", // Futura (antes do check-out)
      totalAmount: 1200.00,
      status: "checked_in",
      checkoutDone: false
    };
    testDb.reservations.push(resPre);

    const conv = {
      id: "conv_pre_checkout_schedule",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: [],
      fiscalConferenceState: {
        status: "awaiting_confirmation",
        reservationId: 801,
        reservationCode: "RES-801-PRE",
        flatNumber: "801",
        checkinDate: "2026-11-01",
        checkoutDate: "2099-12-31",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        tomadorEndereco: "Av. Pelinca, 150",
        descricaoServico: "Hospedagem corporativa Flat 801",
        valorOriginal: 1200.00,
        valorServico: 1200.00
      }
    };
    testDb.whatsappConversations.push(conv);

    const invoicesBefore = testDb.invoices.length;

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Sim, está tudo correto, pode confirmar!",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "scheduled_for_checkout", "Antes do check-out, a confirmação deve agendar a emissão para o check-out");
    assert.strictEqual(result.scheduledForCheckout, true);
    assert.strictEqual(testDb.invoices.length, invoicesBefore, "Nenhuma nota fiscal deve ser emitida antes do check-out");
    assert.strictEqual(conv.fiscalConferenceState.status, "scheduled_for_checkout");
    assert.strictEqual(resPre.autoEmitInvoice, true, "Reserva deve ter autoEmitInvoice = true ativado");
    assert.ok(resPre.confirmedFiscalData, "Reserva deve armazenar confirmedFiscalData para uso no check-out");
    assert.strictEqual(resPre.confirmedFiscalData.tomadorCpfCnpj, "12345678000195");
    assert.strictEqual(resPre.confirmedFiscalData.descricaoServico, "Hospedagem corporativa Flat 801");
    assert.match(result.replyText, /será emitida e enviada automaticamente.*check-out/i);
  });

  it("Agendamento Pré-Check-out (2): Aprovação do gestor para alteração de valor antes do check-out agenda o valor aprovado para o check-out sem emitir antecipadamente", async () => {
    const resPreVal = {
      id: 802,
      code: "RES-802-PRE",
      guestId: 501,
      guestName: "Miller Ferreira",
      guestPhone: "22998505276",
      companyId: 701,
      flatNumber: "802",
      checkinDate: "2026-11-01",
      checkoutDate: "2099-12-31",
      totalAmount: 1000.00,
      status: "confirmada",
      checkoutDone: false
    };
    testDb.reservations.push(resPreVal);

    const pendingId = `NFSE-PRE-VAL-${Date.now()}`;
    testDb.pendingFiscalApprovals.push({
      id: pendingId,
      status: "pending_manager",
      requesterPhone: "22998505276",
      requesterName: "Miller Ferreira",
      reservationId: 802,
      reservationCode: "RES-802-PRE",
      flatNumber: "802",
      originalValue: 1000.00,
      requestedValue: 1150.00,
      reason: "Ajuste de diária acordado",
      pendingFiscalInvoice: {
        reservationId: 802,
        reservationCode: "RES-802-PRE",
        flatNumber: "802",
        tomadorNome: "TecnoPetro Engenharia Subsea LTDA",
        tomadorCpfCnpj: "12345678000195",
        tomadorTipo: "PJ",
        tomadorEmail: "financeiro@tecnopetro.com.br",
        descricaoServico: "Hospedagem Flat 802",
        valorOriginal: 1000.00,
        valorServico: 1150.00
      },
      createdAt: new Date().toISOString()
    });

    const invoicesBefore = testDb.invoices.length;

    const approvalRes = await handleManagerFiscalApprovalReply({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: `Aprovar #${pendingId}`,
      conv: { id: "conv_mgr_pre", phone: "22998505276", messages: [] },
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(approvalRes.handled, true);
    assert.strictEqual(approvalRes.action, "manager_approved_fiscal_scheduled", "Aprovação antes do check-out deve agendar para o check-out");
    assert.strictEqual(approvalRes.scheduledForCheckout, true);
    assert.strictEqual(testDb.invoices.length, invoicesBefore, "Nenhuma nota deve ser emitida antes do check-out");
    assert.strictEqual(resPreVal.autoEmitInvoice, true);
    assert.ok(resPreVal.confirmedFiscalData, "Deve gravar confirmedFiscalData na reserva");
    assert.strictEqual(resPreVal.confirmedFiscalData.valorServico, 1150.00, "Deve preservar o valor aprovado pelo gestor");
    assert.strictEqual(resPreVal.confirmedFiscalData.managerApprovedValue, true);
  });

  it("Trava Anti-Duplicidade (1): Impede emissão de segunda NFS-e para a mesma reserva em executeWhatsAppFiscalEmission", async () => {
    const resDup = {
      id: 803,
      code: "RES-803-DUP",
      guestId: 501,
      guestName: "Miller Ferreira",
      guestPhone: "22998505276",
      flatNumber: "803",
      checkinDate: "2026-10-01",
      checkoutDate: "2026-10-05",
      totalAmount: 500.00,
      status: "completed",
      checkoutDone: true
    };
    testDb.reservations.push(resDup);

    // 1ª emissão (autorizada normalmente)
    const firstEmit = await executeWhatsAppFiscalEmission({
      db: testDb,
      payload: {
        reservationId: 803,
        reservationCode: "RES-803-DUP",
        guestId: 501,
        flatNumber: "803",
        tomadorNome: "Miller Ferreira",
        tomadorCpfCnpj: "11144477735",
        valorServico: 500.00,
        descricaoServico: "Hospedagem Flat 803"
      },
      saveDatabase: () => {}
    });

    assert.strictEqual(firstEmit.success, true);
    assert.strictEqual(Boolean(firstEmit.alreadyEmitted), false);
    const invoicesCountAfterFirst = testDb.invoices.length;

    // 2ª tentativa de emissão para a mesma reserva (ex.: gatilho de check-out ou clique duplo)
    const secondEmit = await executeWhatsAppFiscalEmission({
      db: testDb,
      payload: {
        reservationId: 803,
        reservationCode: "RES-803-DUP",
        guestId: 501,
        flatNumber: "803",
        tomadorNome: "Miller Ferreira",
        tomadorCpfCnpj: "11144477735",
        valorServico: 500.00,
        descricaoServico: "Hospedagem Flat 803"
      },
      saveDatabase: () => {}
    });

    assert.strictEqual(secondEmit.success, true);
    assert.strictEqual(secondEmit.alreadyEmitted, true, "Deve indicar que a nota já foi emitida (trava anti-duplicidade)");
    assert.strictEqual(String(secondEmit.numeroNfse), String(firstEmit.numeroNfse), "Deve retornar a mesma NFS-e original");
    assert.strictEqual(testDb.invoices.length, invoicesCountAfterFirst, "NÃO pode criar uma segunda nota fiscal em db.invoices");
  });

  it("Trava Anti-Duplicidade (2): Se o hóspede pede nota no WhatsApp para reserva que já tem NFS-e emitida, Sofia não duplica e reenvia a nota existente", async () => {
    // Garante que a reserva 605 (primeira reserva encontrada para o hóspede 501) já possui nota emitida
    const res605 = testDb.reservations.find(r => r.id === 605);
    const existingInv = findExistingInvoiceForReservation(testDb, { reservation: res605 });
    assert.ok(existingInv, "Reserva 605 já possui nota emitida do teste anterior");

    const invoicesBefore = testDb.invoices.length;
    const conv = {
      id: "conv_dup_whatsapp_request",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: []
    };

    const result = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Oi Sofia, pode emitir minha nota fiscal do flat 605?",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: (db, msg) => conv.messages.push(msg),
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, "already_emitted_resent", "Deve detectar nota já emitida e apenas reenviar");
    assert.strictEqual(result.alreadyEmitted, true);
    assert.strictEqual(String(result.numeroNfse), String(existingInv.numeroNfse));
    assert.strictEqual(testDb.invoices.length, invoicesBefore, "Nenhuma nota duplicada deve ser criada");
    assert.match(result.replyText, /já foi emitida/i);
  });

  // ── REUSO DE DADOS DO CRM SEM PEDIR CPF/NOME/ENDEREÇO NOVAMENTE ──

  it("Reuso CRM (1): Hóspede PF com dados em db.guests (document/documentNumber, fullName, street, neighborhood, city, state, cep, email) não é solicitado a digitar CPF/nome/endereço e vai direto para conferência", async () => {
    // Simula exatamente o formato real do CRM (db.guests com document/documentNumber e sem companyId)
    const guestMiller = testDb.guests.find(g => g.id === 501);
    const savedCompanyId = guestMiller.companyId;
    const savedCpf = guestMiller.cpf;

    delete guestMiller.companyId;
    delete guestMiller.cpf;
    guestMiller.fullName = "Miller Mendonça Pessanha";
    guestMiller.name = "Miller Mendonça Pessanha";
    guestMiller.document = "12585736792";
    guestMiller.documentNumber = "12585736792";
    guestMiller.email = "millerpessanha@gmail.com";
    guestMiller.street = "Rua Conselheiro Otaviano";
    guestMiller.streetNumber = "209";
    guestMiller.neighborhood = "Centro";
    guestMiller.city = "Campos dos Goytacazes";
    guestMiller.state = "RJ";
    guestMiller.cep = "28010-140";

    // Reserva ativa hoje sem companyId e sem nota emitida
    const res605 = testDb.reservations.find(r => r.id === 605);
    const savedResCompanyId = res605.companyId;
    delete res605.companyId;
    delete res605.invoiceId;
    delete res605.numeroNfse;
    res605.guestDocument = "12585736792";
    res605.checkoutDone = false;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 605);

    const conv = {
      id: "conv_crm_pf_direct",
      phone: "22998505276",
      name: "Miller Mendonça Pessanha",
      messages: []
    };

    try {
      const result = await handleWhatsAppFiscalFlow({
        db: testDb,
        cleanTarget: "22998505276",
        messageText: "Olá Sofia, gostaria da minha nota fiscal por favor",
        senderName: "Miller Mendonça Pessanha",
        conv,
        sendZapiMessage: async () => ({ success: true }),
        appendMessageFn: (db, msg) => conv.messages.push(msg),
        saveDatabase: () => {},
        createNotification: () => {}
      });

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, "presented_conference", "Deve ir direto para a conferência usando os dados do CRM sem pedir CPF/nome/endereço");
      assert.notStrictEqual(result.action, "requested_fiscal_data", "NUNCA deve pedir CPF, nome ou endereço se já constam no CRM");
      assert.doesNotMatch(result.replyText, /Informe seu \*\*Nome Completo\*\*, \*\*CPF\*\*/i);
      assert.match(result.replyText, /Miller Mendonça Pessanha/i);
      assert.match(result.replyText, /125\.857\.367-92/);
      assert.match(result.replyText, /millerpessanha@gmail\.com/i);

      assert.strictEqual(conv.fiscalConferenceState.tomadorCpfCnpj, "12585736792");
      assert.strictEqual(conv.fiscalConferenceState.tomadorNome, "Miller Mendonça Pessanha");
      assert.strictEqual(conv.fiscalConferenceState.tomadorEndereco, "Rua Conselheiro Otaviano");
      assert.strictEqual(conv.fiscalConferenceState.tomadorNumero, "209");
      assert.strictEqual(conv.fiscalConferenceState.tomadorBairro, "Centro");
      assert.strictEqual(conv.fiscalConferenceState.tomadorCep, "28010140");
    } finally {
      guestMiller.companyId = savedCompanyId;
      guestMiller.cpf = savedCpf;
      res605.companyId = savedResCompanyId;
    }
  });

  it("Desafio Empírico 9: Resolução de Webhook Z-API com @lid (37228843659494@lid) e momment numérico aciona conferência fiscal para 22998505276", async () => {
    const rawWebhookPayload = {
      text: { message: "me envia minha nota fiscal" },
      type: "ReceivedCallback",
      phone: "37228843659494@lid",
      fromMe: true,
      isEdit: false,
      status: "RECEIVED",
      chatLid: "37228843659494@lid",
      fromApi: false,
      isGroup: false,
      momment: 1793595282000,
      chatName: "Miller Mendonça Pessanha • Mensalista [UH 509]",
      messageId: "A5F7FFE24077B83A49DB164FA758E636",
      senderName: "CorpFlats",
      connectedPhone: "5522997124021"
    };

    const incomingInfo = extractIncomingMessageInfo(rawWebhookPayload);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(incomingInfo.timestamp), "Timestamp deve ser normalizado para string ISO 8601");

    const cleanTarget = resolveWhatsAppTargetPhone(rawWebhookPayload, incomingInfo, testDb);
    assert.strictEqual(cleanTarget, "5522998505276", "Deve resolver 37228843659494@lid para 5522998505276");

    const res605 = testDb.reservations.find(r => r.id === 605);
    delete res605.invoiceId;
    delete res605.numeroNfse;
    res605.checkoutDone = false;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 605);

    const sentReplies = [];
    const aiRes = await processAiInboundMessage({
      db: testDb,
      incomingInfo: { ...incomingInfo, fromMe: false, senderName: "Miller" },
      cleanTarget,
      saveDatabase: () => {},
      createNotification: () => {},
      sendZapiMessage: async (_cfg, payload) => {
        sentReplies.push(payload);
        return { success: true };
      },
      appendMessageFn: () => {}
    });

    assert.strictEqual(aiRes.handled, true, "Deve processar a solicitação de nota fiscal do número resolvido via @lid");
    assert.strictEqual(aiRes.action, "presented_conference");
    assert.strictEqual(sentReplies.length, 1);
    assert.match(sentReplies[0].message, /Conferência de Dados para Emissão de Nota Fiscal/i);
  });

  it("Integração Direta /notas <-> Sofia: Sofia busca exatamente o rascunho oficial de /notas (buildOfficialNfseDraftForReservation) e sincroniza edições de volta na reserva", async () => {
    const res605 = testDb.reservations.find(r => r.id === 605);
    delete res605.invoiceId;
    delete res605.numeroNfse;
    delete res605.confirmedFiscalData;
    res605.checkoutDone = false;
    testDb.invoices = testDb.invoices.filter(i => Number(i.reservationId) !== 605);

    const officialDraft = buildOfficialNfseDraftForReservation(testDb, { reservation: res605 });
    const conv = {
      id: "conv_notas_direct_integration",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: []
    };

    const res1 = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Preciso da nota fiscal",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(res1.action, "presented_conference");
    assert.strictEqual(
      conv.fiscalConferenceState.descricaoServico,
      officialDraft.descricaoServico,
      "A descrição na Sofia deve ser 100% idêntica à extraída da plataforma oficial /notas"
    );
    assert.strictEqual(conv.fiscalConferenceState.tomadorCpfCnpj, officialDraft.tomadorCpfCnpj);
    assert.strictEqual(conv.fiscalConferenceState.valorServico, officialDraft.valorServico);

    // Se o hóspede pedir alteração na descrição, ela atualiza e já grava em res605.confirmedFiscalData para o /notas ler
    const res2 = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Muda a descrição para Nota relativa à hospedagem executiva no Flat 605.",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(res2.action, "updated_conference_data");
    assert.ok(res605.confirmedFiscalData, "Deve sincronizar alteração de volta na reserva para o Studio /notas");
    const updatedDraftFromNotas = buildOfficialNfseDraftForReservation(testDb, { reservation: res605 });
    assert.strictEqual(
      updatedDraftFromNotas.descricaoServico,
      conv.fiscalConferenceState.descricaoServico,
      "O painel /notas passa a refletir imediatamente a alteração feita via Sofia"
    );
    delete res605.confirmedFiscalData;
  });

  it("Adição de Hóspede na Descrição (1): Solicitar acrescentar uma pessoa pelo nome como hóspede na descrição atualiza o cabeçalho padrão de /notas", async () => {
    const res605 = testDb.reservations.find(r => r.id === 605);
    delete res605.invoiceId;
    delete res605.numeroNfse;
    delete res605.confirmedFiscalData;
    res605.checkoutDone = false;

    const conv = {
      id: "conv_add_guest_named",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: []
    };

    await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Preciso da nota fiscal",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    const editRes = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Quero alterar minha nota, acrescentando Maria Silva como hóspede na descrição do serviço",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(editRes.action, "updated_conference_data", "Deve atualizar a descrição com o novo hóspede");
    assert.match(
      conv.fiscalConferenceState.descricaoServico,
      /Nota relativa à hospedagem de Miller (?:Ferreira|Mendonça Pessanha) e Maria Silva, no Flat 605\./,
      "Deve inserir o segundo hóspede no cabeçalho padrão da descrição de /notas"
    );
    delete res605.confirmedFiscalData;
  });

  it("Adição de Hóspede na Descrição (2): Solicitar acrescentar 'uma pessoa como hóspede na descrição do serviço' sem dizer o nome pergunta o nome e depois aplica na descrição", async () => {
    const res605 = testDb.reservations.find(r => r.id === 605);
    delete res605.invoiceId;
    delete res605.numeroNfse;
    delete res605.confirmedFiscalData;
    res605.checkoutDone = false;

    const conv = {
      id: "conv_add_guest_unnamed",
      phone: "22998505276",
      name: "Miller Ferreira",
      messages: []
    };

    await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Preciso da nota fiscal",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    const askRes = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Solicitei uma alteração da minha nota, pedindo para acrescentar uma pessoa como hóspede na descrição do serviço",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(askRes.action, "prompted_guest_name_for_description", "Deve perguntar o nome da pessoa a ser acrescentada");
    assert.strictEqual(conv.fiscalConferenceState.pendingFieldEdit, "add_guest_to_description");

    const nameReplyRes = await handleWhatsAppFiscalFlow({
      db: testDb,
      cleanTarget: "22998505276",
      messageText: "Ana Clara Pessanha",
      senderName: "Miller Ferreira",
      conv,
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {},
      saveDatabase: () => {},
      createNotification: () => {}
    });

    assert.strictEqual(nameReplyRes.action, "updated_conference_data", "Deve atualizar a descrição com o nome informado");
    assert.match(
      conv.fiscalConferenceState.descricaoServico,
      /Nota relativa à hospedagem de Miller (?:Ferreira|Mendonça Pessanha) e Ana Clara Pessanha, no Flat 605\./,
      "Deve inserir Ana Clara Pessanha na descrição padrão de /notas"
    );
    delete res605.confirmedFiscalData;
  });
});

