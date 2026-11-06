/**
 * Test Suite: M2 - Ingestão Completa de Voucher B2B (PDF, Link HTTP, Agência e Faturamento)
 * File: tests/b2b-voucher-extraction.test.mjs
 *
 * Requirements covered (R2):
 * - F5_PDF_EXTRACTION_SERVICE: Extração de texto a partir de buffers PDF (zero-dependency / streams / FlateDecode)
 * - F6_DOWNLOAD_ANEXOS_EMAIL: Ingestão de vouchers recebidos em anexos PDF no webhook e sync
 * - F7_CRAWLER_HTTP_VOUCHER: Acesso HTTP ao link do voucher sem travas impeditivas (HTML e PDF)
 * - F8_EXTRACAO_DADOS_AGENCIA: Extração de Nome da Agência, CNPJ, Agente, Telefone e E-mail
 * - F9_EXTRACAO_VALORES_FINANCEIROS: Extração de Valor Total, Comissão da Agência e Valor Líquido
 * - F10_EXTRACAO_INSTRUCOES_NFSE: Extração integral das instruções de emissão de NFS-e do voucher
 * - F11_PERSISTENCIA_CAMPOS_AGENCIA_FISCAL: Gravação dos dados cadastrais/fiscais em reservas, agências e empresas
 * - F4_VALIDACAO_GABARITO_113: Validação do Flat 113 contra gabarito oficial com dados fiscais
 * - Twin-Server Parity: Garantia de paridade SHA-256 entre artifacts/api-server e scripts/
 *
 * AGENTS.md Compliance:
 * Strictly isolated test execution. Run ONLY via:
 *   node tests/b2b-voucher-extraction.test.mjs
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
  ingestB2bVoucherIntoDb,
  handleZohoIncomingWebhook
} from '../artifacts/api-server/zoho-mail-service.mjs';

import { extractTextFromPdfBuffer } from '../artifacts/api-server/pdf-extract-service.mjs';

function computeSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createCleanMockDb() {
  return {
    flats: [
      { id: 1, number: "113", name: "Flat 113", status: "disponivel", active: true },
      { id: 4, number: "211", name: "Flat 211", status: "disponivel", active: true },
      { id: 8, number: "313", name: "Flat 313", status: "disponivel", active: true }
    ],
    agencies: [
      {
        id: 1,
        name: "Opus Viagens e Eventos Ltda",
        tradeName: "Opus Viagens",
        corporateName: "Opus Viagens e Eventos Ltda",
        cnpj: "",
        email: "lactalis@opusviagens.com.br",
        phone: "",
        posUnits: [{ name: "LACTALIS DO BRASIL", city: "", state: "" }],
        agents: []
      }
    ],
    companies: [
      {
        id: 1,
        name: "Lactalis do Brasil",
        tradeName: "Lactalis do Brasil",
        corporateName: "Lactalis do Brasil",
        cnpj: "14.049.467/0001-30"
      }
    ],
    guests: [],
    reservations: [],
    zohoMessagesCache: []
  };
}

/**
 * Cria um Buffer de PDF válido com texto usando PDFDocument
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

describe('M2: Ingestão Completa de Voucher B2B (F5, F6, F7, F8, F9, F10, F11)', () => {

  describe('1. Serviço de Extração de Texto de PDF (F5)', () => {
    it('1.1 Deve extrair texto acentuado e campos de voucher a partir de buffer PDF gerado', async () => {
      const pdfLines = [
        'VOUCHER DE CONFIRMAÇÃO DE HOSPEDAGEM',
        'Confirmação da Reserva: 25057926',
        'RLOC: ZYIK2X',
        'Hóspede: Nilton França',
        'Período: 26/10/2026 a 31/10/2026',
        'Diárias: 5',
        'Tarifa Diária: R$ 313,00',
        'Valor Total: R$ 1.565,00',
        'Comissão: 12% (R$ 187,80)',
        'Agência: Copastur Viagens e Turismo Ltda',
        'CNPJ Agência: 12.345.678/0001-99',
        'Telefone Agência: (21) 3812-1128',
        'Emissor: Mateus Mizumoto',
        'Empresa: Vibra Energia S.A.',
        'CNPJ Empresa: 34.274.233/0001-02',
        'Instruções de Faturamento: NÃO ENTREGAR A NOTA FISCAL AO HÓSPEDE. Enviar para vibra@copastur.com.br.'
      ];

      const pdfBuf = await createPdfBuffer(pdfLines);
      assert.ok(Buffer.isBuffer(pdfBuf), 'PDF gerado deve ser um Buffer');
      assert.ok(pdfBuf.length > 500, 'PDF deve ter tamanho compatível');

      const extractedText = extractTextFromPdfBuffer(pdfBuf);
      assert.ok(typeof extractedText === 'string', 'Retorno deve ser string');
      assert.ok(extractedText.includes('25057926'), 'Deve conter número de reserva');
      assert.ok(extractedText.includes('Nilton França'), 'Deve conter nome com acento');
      assert.ok(extractedText.includes('Copastur'), 'Deve conter agência');
      assert.ok(extractedText.includes('12.345.678/0001-99'), 'Deve conter CNPJ agência');
      assert.ok(extractedText.includes('34.274.233/0001-02'), 'Deve conter CNPJ empresa');
      assert.ok(extractedText.includes('1.565,00'), 'Deve conter valor total');
    });

    it('1.2 Deve tratar buffers vazios, strings base64 e entradas inválidas com segurança', () => {
      assert.strictEqual(extractTextFromPdfBuffer(null), '');
      assert.strictEqual(extractTextFromPdfBuffer(undefined), '');
      assert.strictEqual(extractTextFromPdfBuffer(Buffer.alloc(0)), '');
      assert.strictEqual(extractTextFromPdfBuffer('not a valid pdf'), '');

      // Base64 inválido
      assert.strictEqual(extractTextFromPdfBuffer('JVBERnot_valid'), '');
    });

    it('1.3 Deve decodificar escapes octais ISO-8859-1 em blocos de texto PDF', () => {
      const rawPdfSnippet = 'BT /F1 12 Tf (Informa\\347\\343o de Faturamento: Emitir NFS-e) Tj ET';
      const text = extractTextFromPdfBuffer(Buffer.from(rawPdfSnippet, 'latin1'));
      assert.ok(text.includes('Informação de Faturamento: Emitir NFS-e'), 'Deve decodificar ç e ã');
    });
  });

  describe('2. Ingestão de Anexo PDF via Webhook de E-mail (F6)', () => {
    it('2.1 Deve extrair voucher de anexo PDF recebido no payload do webhook e cadastrar reserva no banco', async () => {
      const mockDb = createCleanMockDb();
      const pdfLines = [
        'CONFIRMAÇÃO DE RESERVA B2B: 25057926',
        'RLOC: ZYIK2X',
        'Hóspede: Nilton França',
        'Entrada: 26/10/2026',
        'Saída: 31/10/2026',
        'Diárias: 5',
        'Diária: R$ 313,00',
        'Total: R$ 1.565,00',
        'Comissão: 12% (R$ 187,80)',
        'Agência: Copastur Viagens e Turismo Ltda',
        'CNPJ Agência: 12.345.678/0001-99',
        'Telefone: (21) 3812-1128',
        'Emissor: Mateus Mizumoto',
        'E-mail Agência: vibra@copastur.com.br',
        'Empresa Cliente: Vibra Energia S.A.',
        'CNPJ Empresa: 34.274.233/0001-02',
        'Centro de Custo: 9000700',
        'Cartão: Mastercard 531492xxxxxx1980',
        'Token VCN: V3GOOX4',
        'Instruções de Faturamento: Emitir NFS-e para Vibra Energia S.A. NÃO ENTREGAR AO HÓSPEDE. Enviar para vibra@copastur.com.br.'
      ];
      const pdfBuffer = await createPdfBuffer(pdfLines);

      const webhookPayload = {
        subject: "Confirmação da Reserva: 25057926 - Nilton França",
        fromAddress: "reserva@b2breservas.com.br",
        summary: "Segue em anexo voucher de hospedagem para Nilton França.",
        content: "<p>Segue em anexo voucher de hospedagem.</p>",
        attachments: [
          {
            filename: "voucher_25057926.pdf",
            contentType: "application/pdf",
            content: pdfBuffer
          }
        ]
      };

      const result = await handleZohoIncomingWebhook(mockDb, () => {}, webhookPayload);
      assert.strictEqual(result.ok, true, 'Webhook deve responder com ok: true');

      const createdRes = mockDb.reservations.find(r => r.b2bReservationNumber === '25057926');
      assert.ok(createdRes, 'Reserva 25057926 deve ter sido criada a partir do anexo PDF');
      assert.strictEqual(createdRes.guestName, 'Nilton França');
      assert.strictEqual(createdRes.nights, 5);
      assert.strictEqual(createdRes.totalAmount, 1565.00);
      assert.strictEqual(createdRes.agencyCnpj, '12.345.678/0001-99', 'CNPJ da agência deve ser persistido na reserva');
      assert.strictEqual(createdRes.agencyAgentPhone, '(21) 3812-1128', 'Telefone da agência deve ser persistido');
      assert.strictEqual(createdRes.companyCnpj, '34.274.233/0001-02', 'CNPJ da empresa deve ser persistido');
      assert.strictEqual(createdRes.b2bCommissionAmount, 187.80, 'Comissão em R$ deve ser persistida');
      assert.ok(createdRes.invoicingInstructions.includes('Emitir NFS-e para Vibra Energia'), 'Instruções de faturamento devem ser persistidas');
    });
  });

  describe('3. Crawler HTTP de Links de Voucher sem Travas Impeditivas (F7)', () => {
    let mockServer;
    let mockServerPort;
    let mockServerUrl;
    let htmlVoucherContent;
    let pdfVoucherBuffer;

    before(async () => {
      htmlVoucherContent = `
<!DOCTYPE html>
<html>
<body>
  <h1>VOUCHER OFICIAL B2B RESERVAS</h1>
  <p>Confirmação da Reserva: 25058888</p>
  <p>RLOC: WXYZ99</p>
  <p>Hóspede: Carlos Alberto Drummond</p>
  <p>Check-in: 15/11/2026</p>
  <p>Check-out: 18/11/2026</p>
  <p>Diárias: 3</p>
  <p>Diária: R$ 300,00</p>
  <p>Valor Total: R$ 900,00</p>
  <p>Comissão: 12% (R$ 108,00)</p>
  <p>Agência Solicitante: Flytour Viagens e Turismo</p>
  <p>CNPJ Agência: 45.678.901/0001-23</p>
  <p>Telefone: (11) 4004-0022</p>
  <p>Agente Emissor: Renata Silveira</p>
  <p>E-mail Agência: faturamento@flytour.com.br</p>
  <p>Empresa Cliente: Ambev S.A.</p>
  <p>CNPJ Empresa: 07.526.557/0001-00</p>
  <p>Centro de Custo: 102030</p>
  <p>Instruções de Faturamento: Faturar contra Ambev S.A. Enviar NFS-e com boleto para faturamento@flytour.com.br. RLOC obrigatório no corpo da nota.</p>
</body>
</html>
`;
      pdfVoucherBuffer = await createPdfBuffer([
        'VOUCHER EM FORMATO PDF EXTERNO',
        'Confirmação da Reserva: 25059999',
        'RLOC: PDFRLOC',
        'Hóspede: Hóspede via Link PDF',
        'Check-in: 20/11/2026',
        'Check-out: 22/11/2026',
        'Diárias: 2',
        'Diária: R$ 350,00',
        'Valor Total: R$ 700,00',
        'Comissão: 12% (R$ 84,00)',
        'Agência: CVC Brasil Operadora',
        'CNPJ Agência: 11.222.333/0001-44',
        'Telefone: (11) 3003-9282',
        'Empresa: Vale S.A.',
        'CNPJ Empresa: 33.592.510/0001-54',
        'Instruções de Faturamento: Emitir nota para Vale S.A. com envio imediato.'
      ]);

      mockServer = http.createServer((req, res) => {
        if (req.url === '/voucher-html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(htmlVoucherContent);
        } else if (req.url === '/voucher-pdf') {
          res.writeHead(200, { 'Content-Type': 'application/pdf' });
          res.end(pdfVoucherBuffer);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      await new Promise(resolve => {
        mockServer.listen(0, '127.0.0.1', () => {
          mockServerPort = mockServer.address().port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (mockServer) {
        await new Promise(resolve => mockServer.close(resolve));
      }
    });

    it('3.1 Deve acessar link HTML e enriquecer CNPJ, telefone e regras fiscais mesmo quando dados básicos já constam no e-mail', async () => {
      // E-mail com dados básicos preliminares que antes bloqueavam o acesso HTTP
      const preliminaryEmail = {
        subject: "Confirmação de Reserva: 25058888",
        rawText: `
Confirmação da Reserva: 25058888
Hóspede: Carlos Alberto Drummond
Check-in: 15/11/2026
Check-out: 18/11/2026
Diária: R$ 300,00
Agência: Flytour
Empresa: Ambev
VCN: 555047xxxxxx1234
Acesse o voucher: ${mockServerUrl}/voucher-html
`,
        htmlText: `<a href="${mockServerUrl}/voucher-html">Visualizar Voucher Completo</a>`
      };

      const enriched = await fetchAndParseB2bVoucher(preliminaryEmail);
      assert.strictEqual(enriched.b2bReservationNumber, '25058888');
      assert.strictEqual(enriched.agencyCnpj, '45.678.901/0001-23', 'Crawler deve ter buscado CNPJ da agência no link');
      assert.strictEqual(enriched.agencyAgentPhone, '(11) 4004-0022', 'Crawler deve ter buscado telefone no link');
      assert.strictEqual(enriched.companyCnpj, '07.526.557/0001-00', 'Crawler deve ter buscado CNPJ da empresa no link');
      assert.strictEqual(enriched.b2bCommissionAmount, 108.00, 'Crawler deve ter buscado valor de comissão no link');
      assert.ok(enriched.invoicingInstructions.includes('Faturar contra Ambev S.A.'), 'Crawler deve ter extraído instruções de NFS-e no link');
    });

    it('3.2 Deve acessar link web que retorna Content-Type application/pdf e extrair dados via PDF extractor', async () => {
      const emailWithPdfLink = {
        subject: "Confirmação de Reserva: 25059999",
        rawText: `
Confirmação da Reserva: 25059999
Clique aqui para baixar seu voucher: ${mockServerUrl}/voucher-pdf
`,
        htmlText: `<a href="${mockServerUrl}/voucher-pdf">Baixar Voucher PDF</a>`
      };

      const enriched = await fetchAndParseB2bVoucher(emailWithPdfLink);
      assert.strictEqual(enriched.b2bReservationNumber, '25059999');
      assert.strictEqual(enriched.guestName, 'Hóspede via Link PDF');
      assert.strictEqual(enriched.agencyCnpj, '11.222.333/0001-44', 'Deve extrair CNPJ da agência do PDF baixado via HTTP');
      assert.strictEqual(enriched.companyCnpj, '33.592.510/0001-54', 'Deve extrair CNPJ da empresa do PDF baixado via HTTP');
      assert.strictEqual(enriched.totalAmount, 700.00);
      assert.strictEqual(enriched.b2bCommissionAmount, 84.00);
      assert.ok(enriched.invoicingInstructions.includes('Emitir nota para Vale S.A.'));
    });
  });

  describe('4. Extração Cadastral da Agência e Empresa (F8) e Faturamento (F9, F10)', () => {
    it('4.1 Deve extrair Nome, CNPJ, Agente, Telefone e E-mail da Agência em formatos variados', () => {
      const voucherText = `
Confirmação da Reserva: 25061234
Hóspede: Roberto Marinho
Entrada: 01/12/2026 a 05/12/2026
Diária: R$ 300,00
Total: R$ 1.200,00

Dados da Agência Solicitante:
Agência: BCD Travel Brasil Turismo Ltda
CNPJ: 09.876.543/0001-21
Emissor: Carlos Eduardo Mendonça
Telefone: (11) 3146-2000 / (11) 98765-4321
E-mail: faturamento@bcdtravel.com.br

Dados da Empresa:
Empresa: Nestlé Brasil Ltda
CNPJ: 60.409.075/0001-52
`;
      const parsed = parseB2bVoucherText(voucherText);
      assert.strictEqual(parsed.agencyName, 'BCD Travel Brasil Turismo Ltda');
      assert.strictEqual(parsed.agencyCnpj, '09.876.543/0001-21');
      assert.strictEqual(parsed.agencyAgentName, 'Carlos Eduardo Mendonça');
      assert.strictEqual(parsed.agencyAgentPhone, '(11) 3146-2000 / (11) 98765-4321');
      assert.strictEqual(parsed.agencyAgentEmail, 'faturamento@bcdtravel.com.br');
      assert.strictEqual(parsed.companyName, 'Nestlé Brasil Ltda');
      assert.strictEqual(parsed.companyCnpj, '60.409.075/0001-52');
    });

    it('4.2 Deve extrair Valor Total, Comissão (%) e Comissão em R$, e calcular Valor Líquido (F9)', () => {
      const sample = `
Confirmação da Reserva: 25062222
Hóspede: Marina Silva
Entrada: 01/12/2026
Saída: 05/12/2026
Diária: R$ 400,00
Valor Total: R$ 1.600,00
Comissão: 12% (R$ 192,00)
`;
      const parsed = parseB2bVoucherText(sample);
      assert.strictEqual(parsed.totalAmount, 1600.00);
      assert.strictEqual(parsed.b2bCommissionPct, 12);
      assert.strictEqual(parsed.b2bCommissionAmount, 192.00);
      assert.strictEqual(parsed.b2bNetAmount, 1408.00);
    });

    it('4.3 Deve extrair integralmente instruções complexas de emissão de NFS-e (F10)', () => {
      const complexNfse = `
Confirmação da Reserva: 25063333
Hóspede: Fernando Pessoa
Entrada: 01/12/2026
Saída: 03/12/2026
Instruções para Emissão de Nota Fiscal: Emitir NFS-e contra Nestlé Brasil Ltda (CNPJ 60.409.075/0001-52). NÃO ENTREGAR AO HÓSPEDE EM HIPÓTESE ALGUMA. Constar RLOC XYZ123 e Centro de Custo 9988. Enviar PDF e XML para notas@agencia.com.br.
Política: Cancelamento gratuito até 24h antes.
`;
      const parsed = parseB2bVoucherText(complexNfse);
      assert.ok(parsed.invoicingInstructions.includes('Emitir NFS-e contra Nestlé Brasil Ltda'));
      assert.ok(parsed.invoicingInstructions.includes('NÃO ENTREGAR AO HÓSPEDE EM HIPÓTESE ALGUMA'));
      assert.ok(parsed.invoicingInstructions.includes('Constar RLOC XYZ123 e Centro de Custo 9988'));
      assert.strictEqual(parsed.invoiceRecipientType, 'company');
      assert.strictEqual(parsed.nfHideFromGuest, true);
    });
  });

  describe('5. Persistência e Sincronização em Agências, Empresas e Reservas (F11)', () => {
    it('5.1 Deve persistir e enriquecer db.agencies e db.companies com dados do voucher', () => {
      const mockDb = createCleanMockDb();
      const parsed = {
        b2bReservationNumber: "25064444",
        guestName: "Juliana Paes",
        checkinDate: "2026-12-10",
        checkoutDate: "2026-12-12",
        nights: 2,
        dailyRate: 300,
        totalAmount: 600,
        agencyName: "Copastur Viagens e Turismo Ltda",
        agencyCnpj: "12.345.678/0001-99",
        agencyAgentName: "Agente Copastur",
        agencyAgentPhone: "(11) 3812-1100",
        agencyAgentEmail: "faturamento@copastur.com.br",
        companyName: "Petrobras S.A.",
        companyCnpj: "33.000.167/0001-01",
        invoicingInstructions: "Emitir contra Petrobras. Enviar para faturamento@copastur.com.br.",
        b2bCommissionPct: 12,
        b2bCommissionAmount: 72.00
      };

      const res = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(res.ok, true);

      // Conferência de Agência
      const agencyInDb = mockDb.agencies.find(a => a.cnpj === '12.345.678/0001-99');
      assert.ok(agencyInDb, 'Agência deve ter sido gravada no db.agencies com seu CNPJ');
      assert.strictEqual(agencyInDb.phone, '(11) 3812-1100', 'Telefone da agência deve constar');
      assert.strictEqual(agencyInDb.email, 'faturamento@copastur.com.br');

      // Conferência de Empresa
      const companyInDb = mockDb.companies.find(c => c.cnpj === '33.000.167/0001-01');
      assert.ok(companyInDb, 'Empresa deve ter sido gravada no db.companies com seu CNPJ');
      assert.ok(companyInDb.billingTerms.includes('Emitir contra Petrobras'));

      // Conferência de Reserva
      const resInDb = mockDb.reservations.find(r => r.b2bReservationNumber === '25064444');
      assert.ok(resInDb);
      assert.strictEqual(resInDb.agencyCnpj, '12.345.678/0001-99');
      assert.strictEqual(resInDb.agencyAgentPhone, '(11) 3812-1100');
      assert.strictEqual(resInDb.agencyAgentEmail, 'faturamento@copastur.com.br');
      assert.strictEqual(resInDb.companyCnpj, '33.000.167/0001-01');
      assert.strictEqual(resInDb.b2bCommissionAmount, 72.00);
      assert.strictEqual(resInDb.invoicingInstructions, 'Emitir contra Petrobras. Enviar para faturamento@copastur.com.br.');
    });
  });

  describe('6. Validação Completa do Gabarito Flat 113 (F4 / R2)', () => {
    it('6.1 Deve validar todos os campos cadastrais, financeiros e fiscais do gabarito oficial do Flat 113', () => {
      const flat113Voucher = `
Confirmação da Reserva : 25055349 - (BARCELOS/ARLINDO AMORIM)
RLOC: 25055349
Hóspede: ARLINDO AMORIM BARCELOS
E-mail: arlindo.barcelos@br.lactalis.com
Período: 26/10/2026 a 28/10/2026
Entrada: 26/10/2026
Saída: 28/10/2026
Diárias: 2
Tarifa Diária: R$ 280,00
Valor Total: R$ 560,00
Café da Manhã: Incluso
Política: Tarifa NET
Comissão: 0%

Dados da Agência:
Agência Solicitante: Opus Viagens e Eventos Ltda
CNPJ Agência: 12.345.678/0001-99
Unidade POS: LACTALIS DO BRASIL
Solicitante: WEBSERVICE
E-mail Agência: lactalis@opusviagens.com.br
Telefone Agência: (11) 3995-2500 / (11) 99155-8446

Dados da Empresa:
Empresa Cliente: Lactalis do Brasil
CNPJ Empresa: 14.049.467/0001-30
Centro de Custo: 9000700

Pagamento & Faturamento:
Forma de Pagamento: Cartão Virtual VCN
Cartão: Mastercard 555047xxxxxx4135
Token VCN: Q3DQSN1
Despesas Autorizadas: DEBITAR SOMENTE DIARIAS
Tomador da Nota: Hóspede
Instruções de Faturamento: NF emitida para o Hóspede com envio para arlindo.barcelos@br.lactalis.com e lactalis@opusviagens.com.br.
`;
      const mockDb = createCleanMockDb();
      const parsed = parseB2bVoucherText(flat113Voucher);
      const res = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(res.ok, true);

      const r = res.reservation;
      assert.strictEqual(r.b2bReservationNumber, '25055349');
      assert.strictEqual(r.flatNumber, '113');
      assert.strictEqual(r.guestName, 'Arlindo Amorim Barcelos');
      assert.strictEqual(r.checkinDate, '2026-10-26');
      assert.strictEqual(r.checkoutDate, '2026-10-28');
      assert.strictEqual(r.nights, 2);
      assert.strictEqual(r.dailyRate, 280.00);
      assert.strictEqual(r.totalAmount, 560.00);
      assert.strictEqual(r.b2bRatePolicy, 'NET');
      assert.strictEqual(r.b2bCommissionPct, 0);
      assert.strictEqual(r.b2bCommissionAmount, 0);
      assert.strictEqual(r.b2bNetAmount, 560.00);

      // Verificações fiscais e cadastrais R2
      assert.strictEqual(r.agencyCnpj, '12.345.678/0001-99', 'Gabarito CNPJ Agência');
      assert.strictEqual(r.agencyAgentPhone, '(11) 3995-2500 / (11) 99155-8446', 'Gabarito Telefone Agência');
      assert.strictEqual(r.companyCnpj, '14.049.467/0001-30', 'Gabarito CNPJ Empresa');
      assert.ok(r.invoicingInstructions.includes('NF emitida para o Hóspede com envio para arlindo.barcelos@br.lactalis.com e lactalis@opusviagens.com.br'));
    });
  });

  describe('7. Verificação de Paridade Twin-Server SHA-256 (Regra AGENTS.md)', () => {
    it('7.1 zoho-mail-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/zoho-mail-service.mjs');
      const scrPath = path.resolve('scripts/zoho-mail-service.mjs');
      assert.ok(fs.existsSync(artPath), 'Arquivo em artifacts/ deve existir');
      assert.ok(fs.existsSync(scrPath), 'Arquivo em scripts/ deve existir');
      assert.strictEqual(computeSha256(artPath), computeSha256(scrPath), 'SHA-256 de zoho-mail-service.mjs deve ser idêntico');
    });

    it('7.2 pdf-extract-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/pdf-extract-service.mjs');
      const scrPath = path.resolve('scripts/pdf-extract-service.mjs');
      assert.ok(fs.existsSync(artPath), 'Arquivo em artifacts/ deve existir');
      assert.ok(fs.existsSync(scrPath), 'Arquivo em scripts/ deve existir');
      assert.strictEqual(computeSha256(artPath), computeSha256(scrPath), 'SHA-256 de pdf-extract-service.mjs deve ser idêntico');
    });
  });

  describe('8. Testes de Regressão e Segregação Cadastral (Iteração 2)', () => {
    it('8.1 Voucher com apenas CNPJ de Empresa não deve vazar para agencyCnpj', () => {
      const voucherText = `
Confirmação da Reserva: 25099999
Hóspede: João da Silva
Check-in: 01/12/2026
Check-out: 03/12/2026
Total: R$ 600,00
Agência: Flytour
Dados da Empresa:
Empresa: Petrobras
CNPJ Empresa: 33.000.167/0001-01
`;
      const parsed = parseB2bVoucherText(voucherText);
      assert.strictEqual(parsed.companyCnpj, '33.000.167/0001-01');
      assert.strictEqual(parsed.agencyCnpj, '', 'agencyCnpj deve permanecer vazio quando apenas CNPJ Empresa é informado');
    });

    it('8.2 Telefone genérico de cabeçalho do hotel não deve sobrescrever telefone explícito da agência', () => {
      const emailText = `
Hotel CorpFlats Soho
Telefone: (22) 2759-0000

Confirmação da Reserva: 25099998
Hóspede: Clarice Lispector
Período: 01/12/2026 a 03/12/2026
Total: R$ 500,00

Dados da Agência:
Agência: Copastur Viagens e Turismo
Telefone Agência: (11) 4004-0022
Emissor: Carlos Eduardo
`;
      const parsed = parseB2bVoucherText(emailText);
      assert.strictEqual(parsed.agencyAgentPhone, '(11) 4004-0022', 'Deve extrair o telefone explícito da agência, não o do cabeçalho do hotel');
    });
  });

  describe('9. Extração de Vouchers B2B Reservas Reais (BRL, 1 ADT, Cabeçalho Unidade e Desmembramento Ponta 2 vs Ponta 3)', () => {
    it('9.1 Reserva #25150895 (Edson Jose Leite Junior) deve separar Globalis Viagens (Ponta 2) de Bimbo do Brasil Ltda (Ponta 3)', () => {
      const snippet = `
Confirmação da Reserva: 25150895 - (LEITE JUNIOR/EDSON JOSE)
De: BIMBO
Emissor: ARGO.GLOBALIS
Período: 12/11/2026 a 13/11/2026
Diária: R$ 280,00
Política: Tarifa NET
`;
      const parsed = parseB2bVoucherText(snippet);
      assert.strictEqual(parsed.b2bReservationNumber, '25150895');
      assert.strictEqual(parsed.guestName, 'Edson Jose Leite Junior');
      assert.strictEqual(parsed.agencyName, 'Globalis Viagens');
      assert.strictEqual(parsed.agencyCnpj, '19.933.930/0001-75');
      assert.strictEqual(parsed.companyName, 'Bimbo do Brasil Ltda');
      assert.strictEqual(parsed.companyCnpj, '35.402.759/0001-85');
      assert.notStrictEqual(parsed.agencyName, parsed.companyName);
    });

    it('9.2 Reserva #25201908 (Gabriel Pires Hage Chahine) deve extrair BRL 347,00, 12% comissão, Flytour Riocentro e Trident Energy', () => {
      const pdfText = `
CONFIRMAÇÃO DE RESERVA: 25201908 - RLOC: 10342505 BOOKING_WS
Unidade: TRIDENT - FLYTOUR RIOCENTRO
Emissor: ROQUE MIGUEZ
E-mail: roque.miguez@flytour.com.br
Tel: (21) 3400-7810
Cnpj: 31.370.836/0001-01
Para: HOTEL CORPFLATS
Período de 05/11/2026 a 06/11/2026
Valor médio da Diária para o período:BRL 347,00 + 0,00% ISS
Comissão: 12,00 %
Hóspedes (1 ADT): (PIRES HAGE
CHAHINE/GABRIEL)
Garantia de No Show / Forma de Pagamento: CARTÃO VIRTUAL: DEBITAR SOMENTE DIARIAS | Bandeira: MASTER CARD | TOKEN: I3JLT13
Dados para encaminhamento da documentação:
Razão Social: TURICENTER TURISMO LTDA - FLYTOUR SERVIÇOS DE VIAGENS
Cliente: TRIDENT ENERGY DO BRASIL
Cnpj/CPF: 31.370.836/0001-01
Email: roque.miguez@flytour.com.br
`;
      const parsed = parseB2bVoucherText(pdfText);
      assert.strictEqual(parsed.b2bReservationNumber, '25201908');
      assert.strictEqual(parsed.guestName, 'Gabriel Pires Hage Chahine');
      assert.strictEqual(parsed.checkinDate, '2026-11-05');
      assert.strictEqual(parsed.checkoutDate, '2026-11-06');
      assert.strictEqual(parsed.nights, 1);
      assert.strictEqual(parsed.dailyRate, 347);
      assert.strictEqual(parsed.totalAmount, 347);
      assert.strictEqual(parsed.b2bRatePolicy, 'COMISSIONADA');
      assert.strictEqual(parsed.b2bCommissionPct, 12);
      assert.strictEqual(parsed.b2bCommissionAmount, 41.64);
      assert.strictEqual(parsed.b2bNetAmount, 305.36);
      assert.strictEqual(parsed.agencyName, 'Flytour Riocentro');
      assert.strictEqual(parsed.agencyCnpj, '31.370.836/0001-01');
      assert.strictEqual(parsed.companyName, 'Trident Energy do Brasil');
      assert.strictEqual(parsed.companyCnpj, '34.061.157/0001-56');
      assert.strictEqual(parsed.b2bCardBrand, 'Mastercard');
      assert.strictEqual(parsed.b2bVcnToken, 'I3JLT13');
    });

    it('9.3 Reserva #25193040 (Nilton Santos) deve extrair 2 diárias (25/11 a 27/11), BRL 313,00 (Total 626,00), Copastur e Carrefour', () => {
      const pdfText = `
CONFIRMAÇÃO DE RESERVA: 25193040 - RLOC: ZYIG6P OTA_WS
Unidade: COPASTUR GRUPO CARREFOUR
Emissor: Fernanda Leite Ferreira Silva de Oliveira
E-mail: carrefour@copastur.com.br
Tel: (11) 2394-2122
Cnpj: 43.637.214/0001-86
Para: HOTEL CORPFLATS
Período de 25/11/2026 a 27/11/2026
Valor médio da Diária para o período:BRL 313,00 + 0,00% ISS
Comissão: 12,00 %
Hóspedes (1 ADT): (SANTOS/NILTON)
Garantia de No Show / Forma de Pagamento: CARTÃO VIRTUAL: DEBITAR SOMENTE DIARIAS | Bandeira: AMERICAN EXPRESS | TOKEN: H4FJSKB
Dados para encaminhamento da documentação:
Encaminhar para: COPASTUR VIAGENS E TURISMO LTDA
Email: conciliacao@copastur.com.br
Dados para emissao da Nota Fiscal:
Razão Social: Carrefour Comercio e Industria Ltda
Cliente Id: 211505
Cnpj/CPF: 45.543.915/0001-81
Observação: NÃO ENTREGAR A NOTA FISCAL AO HÓSPEDE NO BALCÃO.
`;
      const parsed = parseB2bVoucherText(pdfText);
      assert.strictEqual(parsed.b2bReservationNumber, '25193040');
      assert.strictEqual(parsed.guestName, 'Nilton Santos');
      assert.strictEqual(parsed.checkinDate, '2026-11-25');
      assert.strictEqual(parsed.checkoutDate, '2026-11-27');
      assert.strictEqual(parsed.nights, 2);
      assert.strictEqual(parsed.dailyRate, 313);
      assert.strictEqual(parsed.totalAmount, 626);
      assert.strictEqual(parsed.b2bCommissionAmount, 75.12);
      assert.strictEqual(parsed.b2bNetAmount, 550.88);
      assert.strictEqual(parsed.agencyName, 'Copastur');
      assert.strictEqual(parsed.agencyCnpj, '43.637.214/0001-86');
      assert.strictEqual(parsed.companyName, 'Carrefour Comércio e Indústria Ltda');
      assert.strictEqual(parsed.companyCnpj, '45.543.915/0001-81');
      assert.strictEqual(parsed.costCenter, '211505');
      assert.strictEqual(parsed.b2bCardBrand, 'American Express');
      assert.strictEqual(parsed.b2bVcnToken, 'H4FJSKB');
    });
  });

});

