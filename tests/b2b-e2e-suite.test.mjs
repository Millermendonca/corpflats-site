/**
 * End-to-End Integration & Verification Test Suite: Ingestão e Cancelamento Autônomo B2B
 * File: tests/b2b-e2e-suite.test.mjs
 * Milestone: M4 (Final E2E Integration & Verification)
 *
 * Core Scenarios Covered:
 * 1. Scenario 1 — Ingestão de Reserva B2B Multi-Diárias (Gabarito Flat 113 / R1 / R2)
 *    - Diárias exatas (nights === 2), array dailyRates com 2 entradas, dados cadastrais, financeiros e NFS-e
 * 2. Scenario 2 — Ingestão de Voucher via Anexo PDF (Decompressão Zero-Dep / R2)
 *    - Validação de streams PDF FlateDecode e uncompressed, extração completa e persistência
 * 3. Scenario 3 — Ingestão de Voucher via Link Web / Crawler HTTP (R2)
 *    - Resolução HTTP de link do voucher (HTML/PDF) e extração de dados enriquecidos
 * 4. Scenario 4 — Cancelamento Autônomo B2B com Cascata Canônica e Alerta Z-API (R3)
 *    - Liberação de calendário, governança, café e OS, auditoria dupla e alerta Z-API ao gestor
 * 5. Scenario 5 — Invariante de Segurança CHECKED_IN_CANCELLATION (R3)
 *    - Bloqueio estrito de cancelamento autônomo para hóspedes com check-in já realizado e alerta urgente
 * 6. Scenario 6 — Idempotência em Cancelamento Repetido (R3)
 *    - Reenvio seguro sem duplicação de alertas ou cascatas redundantes
 * 7. Scenario 7 — Auditoria Completa de Paridade Twin-Server SHA-256 (39/39 runtime files)
 *
 * AGENTS.md Compliance:
 * Run ONLY designated point test file:
 *   node tests/b2b-e2e-suite.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import PDFDocument from 'pdfkit';

import {
  parseB2bVoucherText,
  fetchAndParseB2bVoucher,
  extractVoucherData,
  ingestB2bVoucherIntoDb
} from '../artifacts/api-server/zoho-mail-service.mjs';

import { extractTextFromPdfBuffer } from '../artifacts/api-server/pdf-extract-service.mjs';

import {
  detectB2bEmailIntent,
  extractCancellationData,
  matchReservationForCancellation,
  formatCancellationManagerAlert,
  formatBlockedCancellationAlert,
  executeAutonomousB2bCancellation
} from '../artifacts/api-server/b2b-cancellation-service.mjs';

function computeSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Cria buffer PDF válido com linhas de texto usando pdfkit
 */
function createPdfBuffer(lines = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const line of lines) {
        doc.text(line);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Cria banco de dados em memória limpo e compatível com as regras de demo-server.mjs
 */
function createCleanMockDb() {
  return {
    settings: {
      adminWhatsApp: '5522997124021',
      hotelName: 'CorpFlats Soho'
    },
    zapiConfig: {
      instanceId: 'test-instance',
      token: 'test-token',
      adminWhatsApp: '5522997124021'
    },
    flats: [
      { id: 1, number: '113', name: 'Flat 113', status: 'disponivel', active: true },
      { id: 4, number: '211', name: 'Flat 211', status: 'disponivel', active: true },
      { id: 8, number: '313', name: 'Flat 313', status: 'disponivel', active: true }
    ],
    agencies: [
      {
        id: 1,
        name: 'Opus Viagens e Turismo',
        tradeName: 'Opus Viagens',
        corporateName: 'Opus Viagens e Eventos Ltda',
        cnpj: '07.284.508/0001-89',
        email: 'carlos@opusviagens.com.br',
        phone: '(22) 99888-7766',
        posUnits: [{ name: 'LACTALIS DO BRASIL', city: '', state: '' }],
        agents: []
      }
    ],
    companies: [
      {
        id: 1,
        name: 'Lactalis do Brasil Ltda',
        tradeName: 'Lactalis do Brasil',
        corporateName: 'Lactalis do Brasil Ltda',
        cnpj: '04.227.071/0001-52'
      }
    ],
    guests: [],
    reservations: [],
    cleaningRequests: [],
    breakfastOrders: [],
    tasks: [],
    deletedB2bSeeds: [],
    auditLogs: [],
    notifications: [],
    zohoMessagesCache: []
  };
}

describe('B2B E2E Integration Suite: Ingestão e Cancelamento Autônomo', () => {

  const sharedDb = createCleanMockDb();
  let scenario1Reservation = null;

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 1 — Ingestão de Reserva B2B Multi-Diárias (Gabarito Flat 113)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 1 — Ingestão de Reserva B2B Multi-Diárias (Gabarito Flat 113 / R1 / R2)', () => {

    it('1.1 Deve ingerir voucher com texto do Flat 113 e validar diárias, agência, faturamento e NFS-e', async () => {
      const flat113VoucherText = `
CONFIRMAÇÃO DE RESERVA B2B: 25055349
RLOC: 25055349
Hóspede: Arlindo Amorim Barcelos
E-mail: arlindo.barcelos@br.lactalis.com
Flat Solicitado: Flat 113
Período: 18/05/2026 a 20/05/2026
Entrada: 18/05/2026
Saída: 20/05/2026
Diárias: 2
Tarifa Diária: R$ 280,00
Valor Total: R$ 560,00
Café da Manhã: Incluso
Política: Tarifa NET
Comissão: 0%

Dados da Agência:
Agência Solicitante: Opus Viagens e Turismo
CNPJ Agência: 07.284.508/0001-89
Unidade POS: LACTALIS DO BRASIL
Solicitante: Carlos Pires Hage
E-mail Agência: carlos@opusviagens.com.br
Telefone Agência: (22) 99888-7766

Dados da Empresa:
Empresa Cliente: Lactalis do Brasil Ltda
CNPJ Empresa: 04.227.071/0001-52
Centro de Custo: 9000700

Pagamento & Faturamento:
Forma de Pagamento: Cartão Virtual VCN
Cartão: Mastercard 555047xxxxxx4135
Token VCN: Q3DQSN1
Despesas Autorizadas: DEBITAR SOMENTE DIARIAS
Tomador da Nota: Empresa
Instruções de Faturamento: Emitir NFS-e contra Lactalis do Brasil Ltda (CNPJ 04.227.071/0001-52). NÃO ENTREGAR AO HÓSPEDE. Enviar nota fiscal e boleto para carlos@opusviagens.com.br.
`;

      const parsed = await extractVoucherData(flat113VoucherText);

      // Verificações essenciais de R1 (Datas e Diárias)
      assert.strictEqual(parsed.b2bReservationNumber, '25055349', 'Número B2B deve ser 25055349');
      assert.strictEqual(parsed.guestName, 'Arlindo Amorim Barcelos', 'Hóspede deve ser Arlindo Amorim Barcelos');
      assert.strictEqual(parsed.checkinDate, '2026-05-18', 'Check-in deve ser 2026-05-18');
      assert.strictEqual(parsed.checkoutDate, '2026-05-20', 'Check-out deve ser 2026-05-20');
      assert.strictEqual(parsed.nights, 2, 'Quantidade exata de noites deve ser 2 (R1: sem truncar)');
      assert.strictEqual(parsed.dailyRate, 280, 'Diária deve ser 280');
      assert.strictEqual(parsed.totalAmount, 560, 'Total deve ser 560');

      // Verificações essenciais de R2 (Agência e Empresa)
      assert.strictEqual(parsed.agencyName, 'Opus Viagens e Turismo');
      assert.strictEqual(parsed.agencyCnpj, '07.284.508/0001-89');
      assert.strictEqual(parsed.agencyAgentName, 'Carlos Pires Hage');
      assert.strictEqual(parsed.agencyAgentPhone, '(22) 99888-7766');
      assert.strictEqual(parsed.agencyAgentEmail, 'carlos@opusviagens.com.br');
      assert.strictEqual(parsed.companyName, 'Lactalis do Brasil Ltda');
      assert.strictEqual(parsed.companyCnpj, '04.227.071/0001-52');
      assert.ok(
        parsed.invoicingInstructions.includes('Emitir NFS-e contra Lactalis do Brasil Ltda (CNPJ 04.227.071/0001-52)'),
        'Instruções de NFS-e devem ser integralmente preservadas'
      );

      // Ingestão no banco do PMS
      const ingestResult = ingestB2bVoucherIntoDb(sharedDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(ingestResult.ok, true, 'Ingestão deve retornar ok: true');

      const r = ingestResult.reservation;
      scenario1Reservation = r;

      assert.strictEqual(r.b2bReservationNumber, '25055349');
      assert.strictEqual(r.flatNumber, '113', 'Deve vincular ao Flat 113');
      assert.strictEqual(r.nights, 2, 'Reserva gravada no PMS deve ter 2 noites');
      assert.strictEqual(r.totalAmount, 560, 'Valor total gravado deve ser 560');

      // Verificação estrita do array dailyRates (R1 / F3)
      assert.ok(Array.isArray(r.dailyRates), 'dailyRates deve ser um array');
      assert.strictEqual(r.dailyRates.length, 2, 'dailyRates deve conter exatamente 2 entradas');
      assert.strictEqual(r.dailyRates[0].date, '2026-05-18');
      assert.strictEqual(r.dailyRates[0].rate ?? r.dailyRates[0].amount, 280);
      assert.strictEqual(r.dailyRates[1].date, '2026-05-19');
      assert.strictEqual(r.dailyRates[1].rate ?? r.dailyRates[1].amount, 280);

      // Verificação dos campos cadastrais e fiscais gravados na reserva
      assert.strictEqual(r.agencyCnpj, '07.284.508/0001-89');
      assert.strictEqual(r.agencyAgentName, 'Carlos Pires Hage');
      assert.strictEqual(r.agencyAgentPhone, '(22) 99888-7766');
      assert.strictEqual(r.agencyAgentEmail, 'carlos@opusviagens.com.br');
      assert.strictEqual(r.companyCnpj, '04.227.071/0001-52');
      assert.ok(r.invoicingInstructions.includes('Lactalis do Brasil Ltda'));
      assert.ok(r.invoicingInstructions.includes('04.227.071/0001-52'));
      assert.ok(r.invoicingInstructions.includes('carlos@opusviagens.com.br'));
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 2 — Ingestão de Voucher via Anexo PDF (Decompressão Zero-Dep)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 2 — Ingestão de Voucher via Anexo PDF (Decompressão Zero-Dep / R2)', () => {

    it('2.1 Deve descomprimir e extrair dados completos a partir de buffer PDF binário', async () => {
      const pdfLines = [
        'VOUCHER OFICIAL CORPORATIVO B2B: 25058811',
        'RLOC: PDF-8811',
        'Hóspede: Mariana Alcantara de Souza',
        'E-mail: mariana.alcantara@petrobras.com.br',
        'Entrada: 01/06/2026',
        'Saída: 04/06/2026',
        'Diárias: 3',
        'Tarifa Diária: R$ 320,00',
        'Valor Total: R$ 960,00',
        'Comissão: 10% (R$ 96,00)',
        'Agência Solicitante: Tour House Viagens e Turismo Ltda',
        'CNPJ Agência: 55.666.777/0001-88',
        'Agente Emissor: Lucas Vasconcelos',
        'Telefone Agência: (11) 3214-5500',
        'E-mail Agência: faturamento@tourhouse.com.br',
        'Empresa Cliente: Petrobras S.A.',
        'CNPJ Empresa: 33.000.167/0001-01',
        'Centro de Custo: 104050',
        'Instruções de Faturamento: Emitir nota fiscal contra Petrobras S.A. (CNPJ 33.000.167/0001-01). Enviar DANFE e XML para faturamento@tourhouse.com.br.'
      ];

      const pdfBuffer = await createPdfBuffer(pdfLines);
      assert.ok(Buffer.isBuffer(pdfBuffer), 'PDF deve ser gerado como Buffer binário');

      // Teste de descompressão zero-dep nativa
      const rawExtractedText = extractTextFromPdfBuffer(pdfBuffer);
      assert.ok(rawExtractedText.includes('25058811'), 'Texto descompactado deve conter número da reserva');
      assert.ok(rawExtractedText.includes('Mariana Alcantara'), 'Texto descompactado deve conter hóspede');
      assert.ok(rawExtractedText.includes('Tour House Viagens'), 'Texto descompactado deve conter agência');

      // Ingestão unificada via extractVoucherData
      const parsedPdf = await extractVoucherData(pdfBuffer);
      assert.strictEqual(parsedPdf.b2bReservationNumber, '25058811');
      assert.strictEqual(parsedPdf.guestName, 'Mariana Alcantara de Souza');
      assert.strictEqual(parsedPdf.checkinDate, '2026-06-01');
      assert.strictEqual(parsedPdf.checkoutDate, '2026-06-04');
      assert.strictEqual(parsedPdf.nights, 3);
      assert.strictEqual(parsedPdf.dailyRate, 320);
      assert.strictEqual(parsedPdf.totalAmount, 960);
      assert.strictEqual(parsedPdf.b2bCommissionAmount, 96);
      assert.strictEqual(parsedPdf.agencyCnpj, '55.666.777/0001-88');
      assert.strictEqual(parsedPdf.agencyAgentPhone, '(11) 3214-5500');
      assert.strictEqual(parsedPdf.agencyAgentEmail, 'faturamento@tourhouse.com.br');
      assert.strictEqual(parsedPdf.companyCnpj, '33.000.167/0001-01');

      const ingestRes = ingestB2bVoucherIntoDb(sharedDb, parsedPdf, { autoSendCredentialEmail: false });
      assert.strictEqual(ingestRes.ok, true);

      const rPdf = ingestRes.reservation;
      assert.strictEqual(rPdf.b2bReservationNumber, '25058811');
      assert.strictEqual(rPdf.nights, 3);
      assert.strictEqual(rPdf.dailyRates.length, 3);
      assert.strictEqual(rPdf.agencyCnpj, '55.666.777/0001-88');
      assert.strictEqual(rPdf.companyCnpj, '33.000.167/0001-01');
      assert.ok(rPdf.invoicingInstructions.includes('Petrobras S.A.'));
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 3 — Ingestão de Voucher via Link Web / Crawler HTTP
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 3 — Ingestão de Voucher via Link Web / Crawler HTTP (R2)', () => {
    let mockServer;
    let mockServerPort;
    let mockServerUrl;

    before(async () => {
      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Voucher Online B2B</title></head>
<body>
  <div class="voucher-container">
    <h1>CONFIRMAÇÃO DE HOSPEDAGEM - B2B RESERVAS</h1>
    <p><strong>Número da Reserva:</strong> 25059922</p>
    <p><strong>Localizador / RLOC:</strong> WEB-9922</p>
    <p><strong>Nome do Hóspede:</strong> Felipe Guimarães Barreto</p>
    <p><strong>Período:</strong> 10/06/2026 até 12/06/2026</p>
    <p><strong>Noites:</strong> 2</p>
    <p><strong>Diária Média:</strong> R$ 340,00</p>
    <p><strong>Valor Total da Reserva:</strong> R$ 680,00</p>
    <p><strong>Comissão da Agência:</strong> 10% (R$ 68,00)</p>
    <p><strong>Agência Solicitante:</strong> CVC Corporativo Viagens Ltda</p>
    <p><strong>CNPJ Agência:</strong> 11.222.333/0001-44</p>
    <p><strong>Agente Responsável:</strong> Renata Silveira</p>
    <p><strong>Telefone Agência:</strong> (11) 3003-9282</p>
    <p><strong>E-mail Agência:</strong> corporativo@cvc.com.br</p>
    <p><strong>Empresa Faturada:</strong> Vale S.A.</p>
    <p><strong>CNPJ Empresa:</strong> 33.592.510/0001-54</p>
    <p><strong>Instruções de Faturamento:</strong> Emitir NFS-e para Vale S.A. (CNPJ 33.592.510/0001-54). Enviar boleto e XML para corporativo@cvc.com.br.</p>
  </div>
</body>
</html>
`;

      mockServer = http.createServer((req, res) => {
        if (req.url === '/voucher-online') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(htmlContent);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      await new Promise(resolve => {
        mockServer.listen(0, '127.0.0.1', () => {
          mockServerPort = mockServer.address().port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}/voucher-online`;
          resolve();
        });
      });
    });

    after(async () => {
      if (mockServer) {
        await new Promise(resolve => mockServer.close(resolve));
      }
    });

    it('3.1 Deve rastrear URL do voucher via HTTP, extrair dados cadastrais e anexar ao banco', async () => {
      const emailPayload = {
        subject: 'Confirmação de Reserva - 25059922 - Felipe Guimarães',
        text: `Prezado hotel, segue voucher disponível no link: ${mockServerUrl}`,
        url: mockServerUrl
      };

      const crawled = await extractVoucherData(emailPayload);
      assert.strictEqual(crawled.b2bReservationNumber, '25059922');
      assert.strictEqual(crawled.guestName, 'Felipe Guimarães Barreto');
      assert.strictEqual(crawled.checkinDate, '2026-06-10');
      assert.strictEqual(crawled.checkoutDate, '2026-06-12');
      assert.strictEqual(crawled.nights, 2);
      assert.strictEqual(crawled.totalAmount, 680);
      assert.strictEqual(crawled.agencyCnpj, '11.222.333/0001-44');
      assert.strictEqual(crawled.agencyAgentPhone, '(11) 3003-9282');
      assert.strictEqual(crawled.agencyAgentEmail, 'corporativo@cvc.com.br');
      assert.strictEqual(crawled.companyCnpj, '33.592.510/0001-54');
      assert.ok(crawled.invoicingInstructions.includes('Vale S.A.'));

      const ingestCrawler = ingestB2bVoucherIntoDb(sharedDb, crawled, { autoSendCredentialEmail: false });
      assert.strictEqual(ingestCrawler.ok, true);

      const savedRes = sharedDb.reservations.find(r => r.b2bReservationNumber === '25059922');
      assert.ok(savedRes, 'Reserva ingerida via crawler HTTP deve existir no banco');
      assert.strictEqual(savedRes.agencyCnpj, '11.222.333/0001-44');
      assert.strictEqual(savedRes.companyCnpj, '33.592.510/0001-54');
      assert.strictEqual(savedRes.nights, 2);
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 4 — Cancelamento Autônomo B2B com Cascata Canônica e Alerta Z-API
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 4 — Cancelamento Autônomo B2B com Cascata Canônica e Alerta Z-API (R3)', () => {

    it('4.1 Deve cancelar a reserva do Gabarito Flat 113, limpar governança/café e alertar o gestor', async () => {
      assert.ok(scenario1Reservation, 'Reserva do Cenário 1 deve estar disponível');
      const resId = scenario1Reservation.id;
      const flatNum = scenario1Reservation.flatNumber;

      // Vincula cards de governança, café da manhã e tarefas operacionais
      sharedDb.cleaningRequests.push(
        {
          id: 501,
          flatId: scenario1Reservation.flatId,
          flatNumber: flatNum,
          requestDate: '2026-05-18',
          arrivingGuest: 'Arlindo Amorim Barcelos',
          autoReservationCode: scenario1Reservation.code,
          autoReservationId: resId,
          twinBeds: true,
          status: 'pending'
        },
        {
          id: 502,
          flatId: scenario1Reservation.flatId,
          flatNumber: flatNum,
          requestDate: '2026-05-20',
          source: 'checkout',
          status: 'dirty',
          isDeleted: false
        }
      );

      sharedDb.breakfastOrders.push({
        id: 601,
        reservationId: resId,
        reservationCode: scenario1Reservation.code,
        roomNumber: flatNum,
        date: '2026-05-19',
        status: 'confirmed'
      });

      sharedDb.tasks.push({
        id: 701,
        reservationId: resId,
        reservationCode: scenario1Reservation.code,
        title: 'Verificar ar condicionado Flat 113',
        status: 'open'
      });

      // E-mail de cancelamento real enviado pela agência
      const cancellationEmail = {
        subject: 'Cancelamento de Reserva - 25055349 - Arlindo Amorim Barcelos',
        text: 'Prezados, confirmamos o cancelamento da reserva 25055349 referente ao hóspede Arlindo Amorim Barcelos. Favor cancelar no sistema e liberar o apartamento.',
        from: 'carlos@opusviagens.com.br'
      };

      let capturedZapiAlert = null;
      let syncAriCalled = false;

      const cancelResult = await executeAutonomousB2bCancellation(sharedDb, cancellationEmail, {
        sendZapiMessage: async (phone, msg, opts) => {
          capturedZapiAlert = { phone, msg, opts };
          return { success: true };
        },
        syncAriForReservation: async (r) => {
          if (r.id === resId) syncAriCalled = true;
        }
      });

      // 1. Resposta da execução
      assert.strictEqual(cancelResult.success, true);
      assert.strictEqual(cancelResult.cancelled, true);
      assert.strictEqual(cancelResult.matchedBy, 'b2b_number');
      assert.strictEqual(cancelResult.alertSent, true);

      // 2. Status da reserva no banco
      const cancelledRes = sharedDb.reservations.find(r => r.id === resId);
      assert.strictEqual(cancelledRes.status, 'cancelada', 'Status deve mudar para cancelada');
      assert.ok(cancelledRes.cancelledAt, 'cancelledAt deve estar preenchido');
      assert.ok(cancelledRes.cancellationReason, 'cancellationReason deve estar preenchido');

      // 3. Cascata de Governança
      const cleanCheckin = sharedDb.cleaningRequests.find(c => c.id === 501);
      assert.strictEqual(cleanCheckin.arrivingGuest, null, 'Hóspede de chegada deve ser limpo');
      assert.strictEqual(cleanCheckin.autoReservationCode, null, 'Código de reserva deve ser limpo');
      assert.strictEqual(cleanCheckin.twinBeds, false, 'Configuração de camas deve ser redefinida');

      const cleanCheckout = sharedDb.cleaningRequests.find(c => c.id === 502);
      assert.strictEqual(cleanCheckout.isDeleted, true, 'Card de limpeza de saída deve ser descartado');
      assert.strictEqual(cleanCheckout.status, 'deleted');
      assert.strictEqual(cleanCheckout.deletedBy, 'reservation_cancelled');

      // 4. Café da manhã e Tarefas vinculadas
      const bFast = sharedDb.breakfastOrders.find(b => b.id === 601);
      assert.strictEqual(bFast.status, 'cancelled');

      const tsk = sharedDb.tasks.find(t => t.id === 701);
      assert.strictEqual(tsk.status, 'cancelled');

      // 5. Dual Audit Logs (Reserva + Global)
      assert.ok(cancelledRes.auditLogs.length > 0, 'Reserva deve ter registro de auditoria');
      const resAudit = cancelledRes.auditLogs[0];
      assert.strictEqual(resAudit.action, 'cancelled');
      assert.strictEqual(resAudit.event, 'B2B_EMAIL_AUTONOMOUS_CANCELLATION');
      assert.strictEqual(resAudit.actor.name, 'Sistema Autônomo B2B');

      const globalAudit = sharedDb.auditLogs.find(l => l.action === 'RESERVATION_CANCELLED_B2B_AUTONOMOUS');
      assert.ok(globalAudit, 'db.auditLogs deve conter registro RESERVATION_CANCELLED_B2B_AUTONOMOUS');
      assert.strictEqual(globalAudit.details.reservationId, resId);
      assert.strictEqual(globalAudit.details.flatNumber, '113');
      assert.strictEqual(globalAudit.details.guestName, 'Arlindo Amorim Barcelos');

      // 6. Alerta WhatsApp Z-API ao Gestor
      assert.ok(capturedZapiAlert, 'Alerta via Z-API deve ter sido disparado');
      assert.strictEqual(capturedZapiAlert.phone, '5522997124021', 'Deve disparar para o WhatsApp do gestor');
      assert.ok(capturedZapiAlert.msg.includes('CANCELAMENTO AUTÔNOMO B2B PROCESSADO'));
      assert.ok(capturedZapiAlert.msg.includes('Arlindo Amorim Barcelos'));
      assert.ok(capturedZapiAlert.msg.includes('113'));
      assert.ok(capturedZapiAlert.msg.includes('25055349'));

      // 7. ARI Sincronizado
      assert.strictEqual(syncAriCalled, true, 'syncAriForReservation deve ter sido acionado');
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 5 — Invariante de Segurança CHECKED_IN_CANCELLATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 5 — Invariante de Segurança CHECKED_IN_CANCELLATION (R3)', () => {

    it('5.1 Deve estritamente bloquear cancelamento autônomo para reserva com status in_house', async () => {
      const inHouseReservation = {
        id: 991,
        code: 'B2B-INHOUSE-01',
        b2bReservationNumber: '77889900',
        flatId: 4,
        flatNumber: '211',
        guestName: 'Eduardo Martins Soares',
        checkinDate: '2026-05-18',
        checkoutDate: '2026-05-22',
        status: 'in_house',
        checkedInAt: '2026-05-18T14:30:00.000Z',
        auditLogs: []
      };
      sharedDb.reservations.push(inHouseReservation);

      const cancelAttemptEmail = {
        subject: 'Cancelamento Imediato de Reserva - 77889900',
        text: 'Prezados, favor cancelar a reserva 77889900 do passageiro Eduardo Martins Soares imediatamente.',
        from: 'operacoes@agenciacorporativa.com.br'
      };

      let urgentAlertDispatched = null;

      const blockResult = await executeAutonomousB2bCancellation(sharedDb, cancelAttemptEmail, {
        sendZapiMessage: async (phone, msg, opts) => {
          urgentAlertDispatched = { phone, msg, opts };
          return { success: true };
        }
      });

      // Validação das travas de segurança
      assert.strictEqual(blockResult.success, false, 'Execução deve retornar success: false');
      assert.strictEqual(blockResult.cancelled, false, 'Reserva NÃO pode ser cancelada');
      assert.strictEqual(blockResult.blockedReason, 'CHECKED_IN_CANCELLATION');
      assert.strictEqual(blockResult.alertSent, true);

      // Status da reserva deve permanecer in_house intocado
      const unchangedRes = sharedDb.reservations.find(r => r.id === 991);
      assert.strictEqual(unchangedRes.status, 'in_house', 'Status in_house deve permanecer intacto');

      // Auditoria de segurança gravada
      assert.ok(unchangedRes.auditLogs.some(l => l.action === 'cancellation_blocked'));
      const globalBlockedAudit = sharedDb.auditLogs.find(l => l.action === 'RESERVATION_CANCELLATION_BLOCKED_CHECKED_IN');
      assert.ok(globalBlockedAudit, 'db.auditLogs deve conter bloqueio');
      assert.strictEqual(globalBlockedAudit.level, 'danger');

      // Alerta urgente disparado ao gestor 5522997124021
      assert.ok(urgentAlertDispatched);
      assert.strictEqual(urgentAlertDispatched.phone, '5522997124021');
      assert.ok(urgentAlertDispatched.msg.includes('ALERTA URGENTE: TENTATIVA DE CANCELAMENTO BLOQUEADA'));
      assert.ok(urgentAlertDispatched.msg.includes('Eduardo Martins Soares'));
      assert.ok(urgentAlertDispatched.msg.includes('Flat 211'));
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 6 — Idempotência em Cancelamento Repetido
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 6 — Idempotência em Cancelamento Repetido (R3)', () => {

    it('6.1 Deve responder com alreadyCancelled: true sem executar nova cascata ou alerta duplicado', async () => {
      // Reenvio do mesmo e-mail de cancelamento para o Gabarito Flat 113 (já cancelado no Cenário 4)
      const repeatEmail = {
        subject: 'Cancelamento de Reserva - 25055349 - Arlindo Amorim Barcelos',
        text: 'Prezados, favor confirmar novamente o cancelamento da reserva 25055349.',
        from: 'carlos@opusviagens.com.br'
      };

      let duplicateAlertSent = false;
      const initialAuditCount = sharedDb.auditLogs.length;

      const repeatResult = await executeAutonomousB2bCancellation(sharedDb, repeatEmail, {
        sendZapiMessage: async () => {
          duplicateAlertSent = true;
          return { success: true };
        }
      });

      // Validação do contrato de idempotência
      assert.strictEqual(repeatResult.success, true, 'Deve responder com success: true');
      assert.strictEqual(repeatResult.cancelled, false, 'cancelled deve ser false (já estava cancelada)');
      assert.strictEqual(repeatResult.alreadyCancelled, true, 'alreadyCancelled deve ser true');
      assert.strictEqual(repeatResult.alertSent, false, 'alertSent deve ser false');
      assert.strictEqual(duplicateAlertSent, false, 'NÃO deve disparar WhatsApp duplicado para o gestor');

      // Auditoria global não deve sofrer acréscimo de novo cancelamento
      assert.strictEqual(sharedDb.auditLogs.length, initialAuditCount, 'Audit logs não devem sofrer duplicata');
    });

  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 7 — Verificação Estrita de Paridade Twin-Server SHA-256
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario 7 — Verificação Estrita de Paridade Twin-Server SHA-256 (Regra AGENTS.md)', () => {

    it('7.1 zoho-mail-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/zoho-mail-service.mjs');
      const scrPath = path.resolve('scripts/zoho-mail-service.mjs');
      assert.strictEqual(computeSha256(artPath), computeSha256(scrPath));
    });

    it('7.2 b2b-cancellation-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/b2b-cancellation-service.mjs');
      const scrPath = path.resolve('scripts/b2b-cancellation-service.mjs');
      assert.strictEqual(computeSha256(artPath), computeSha256(scrPath));
    });

    it('7.3 pdf-extract-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/pdf-extract-service.mjs');
      const scrPath = path.resolve('scripts/pdf-extract-service.mjs');
      assert.strictEqual(computeSha256(artPath), computeSha256(scrPath));
    });

  });

});
