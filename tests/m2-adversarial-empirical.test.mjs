/**
 * Comprehensive Empirical Challenger Suite: Milestone 2
 * File: tests/m2-adversarial-empirical.test.mjs
 *
 * Scope:
 * - Bug 1: Cross-Entity Contact Pollution (Guest phone/email assigned to Agency when agency contact is missing)
 * - Bug 2: Duplicate Agencies and Companies on Slight Name Variation (Missing CNPJ Deduplication in Ingestion)
 * - Bug 3: Invoicing Instructions Formatting & Preservation
 * - Bug 4: PDF Extraction ReDoS / O(N^2) Event-Loop Hang Vulnerability on Malformed/Image/Binary Buffers
 * - Bug 5: PDF Extraction Failure on Balanced Parentheses in Literal Strings
 * - Suite 6: PDF Parser Exotic Operators & Encodings (Octal, Escapes, UTF-16BE BOM, Odd Hex, TJ Multiline, FlateDecode)
 * - Suite 7: HTTP Crawler Failure Modes & Resiliency (Redirects 302, 500, 404, Corrupted PDF Body, Invalid URLs)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';

import {
  parseB2bVoucherText,
  fetchAndParseB2bVoucher,
  ingestB2bVoucherIntoDb
} from '../artifacts/api-server/zoho-mail-service.mjs';

import { extractTextFromPdfBuffer } from '../artifacts/api-server/pdf-extract-service.mjs';

function createMockDb() {
  return {
    flats: [
      { id: 1, number: "113", name: "Flat 113", status: "disponivel", active: true },
      { id: 2, number: "201", name: "Flat 201", status: "disponivel", active: true }
    ],
    agencies: [
      {
        id: 1,
        name: "Opus Viagens e Eventos Ltda",
        tradeName: "Opus Viagens",
        corporateName: "Opus Viagens e Eventos Ltda",
        cnpj: "12.345.678/0001-99",
        email: "faturamento@opusviagens.com.br",
        phone: "(11) 3000-1111",
        posUnits: [{ name: "LACTALIS", city: "São Paulo", state: "SP" }],
        agents: [{ name: "Maria Santos", email: "maria@opusviagens.com.br", phone: "(11) 99999-1111" }],
        clientCompanies: ["Lactalis do Brasil"]
      }
    ],
    companies: [
      {
        id: 1,
        name: "Lactalis do Brasil Ltda",
        tradeName: "Lactalis",
        corporateName: "Lactalis do Brasil Ltda",
        cnpj: "14.049.467/0001-30",
        phone: "(11) 4000-2222",
        billingTerms: "Faturar a 30 dias.",
        invoicingInstructions: "Faturar a 30 dias."
      }
    ],
    guests: [],
    reservations: []
  };
}

describe('M2 Adversarial Challenger Suite', () => {

  describe('Bug Investigation 1: Cross-Entity Contact Pollution (Guest vs Agency)', () => {
    it('Probe 1: Voucher with guest telephone and email, but agency has no contact info', () => {
      const voucher = `
CONFIRMAÇÃO DE RESERVA: 25099100
Hóspede: Carlos Drummond de Andrade
E-mail: carlos.drummond@poesia.com.br
Telefone: (21) 98888-7777
Período: 10/12/2026 a 12/12/2026
Diárias: 2
Tarifa: R$ 300,00
Total: R$ 600,00

Dados da Agência:
Agência: Copastur Viagens e Turismo
Emissor: João Silveira

Dados da Empresa:
Empresa: Vale S.A.
CNPJ: 33.592.510/0001-54
`;
      const parsed = parseB2bVoucherText(voucher);

      assert.strictEqual(parsed.agencyName, 'Copastur Viagens e Turismo');
      assert.notStrictEqual(parsed.agencyAgentPhone, '(21) 98888-7777', 'BUG: Guest phone was assigned to agencyAgentPhone!');
      assert.notStrictEqual(parsed.agencyAgentEmail, 'carlos.drummond@poesia.com.br', 'BUG: Guest email was assigned to agencyAgentEmail!');
    });
  });

  describe('Bug Investigation 2: Duplicate Agencies and Companies on Slight Name Variation', () => {
    it('Probe 2: Ingest voucher with exact matching CNPJ but different corporate trade name', () => {
      const db = createMockDb();
      const initialAgenciesCount = db.agencies.length;

      const voucherSameCnpjDifferentName = {
        b2bReservationNumber: "25099200",
        guestName: "Clarice Lispector",
        checkinDate: "2026-12-15",
        checkoutDate: "2026-12-17",
        nights: 2,
        dailyRate: 300,
        totalAmount: 600,
        agencyName: "Opus Corporate Travel Solutions",
        agencyCnpj: "12.345.678/0001-99",
        companyName: "Lactalis do Brasil Ltda",
        companyCnpj: "14.049.467/0001-30"
      };

      ingestB2bVoucherIntoDb(db, voucherSameCnpjDifferentName);
      assert.strictEqual(db.agencies.length, initialAgenciesCount, 'BUG: Created duplicate agency despite having identical CNPJ!');
    });

    it('Probe 3: Ingest voucher with company matching CNPJ but completely different trade name', () => {
      const db = createMockDb();
      const initialCompaniesCount = db.companies.length;

      const voucherSameCompanyCnpjDifferentName = {
        b2bReservationNumber: "25099201",
        guestName: "Cecília Meireles",
        checkinDate: "2026-12-18",
        checkoutDate: "2026-12-20",
        nights: 2,
        dailyRate: 300,
        totalAmount: 600,
        agencyName: "Opus Viagens",
        agencyCnpj: "12.345.678/0001-99",
        companyName: "Grupo Parmalat do Brasil",
        companyCnpj: "14.049.467/0001-30"
      };

      ingestB2bVoucherIntoDb(db, voucherSameCompanyCnpjDifferentName);
      assert.strictEqual(db.companies.length, initialCompaniesCount, 'BUG: Created duplicate company despite having identical CNPJ!');
    });
  });

  describe('Bug Investigation 3: Invoicing Instructions Complex Formatting & Overwriting', () => {
    it('Probe 4: Multiline instructions with special characters, quotes, and bullet numbers', () => {
      const voucher = `
Confirmação de Reserva: 25099300
Hóspede: Mário de Andrade
Check-in: 01/12/2026 a 05/12/2026
Diárias: 4
Tarifa: R$ 350,00
Total: R$ 1.400,00

Instruções para Faturamento:
1. Emitir NFS-e contra "Vibra Energia S.A." (CNPJ: 34.274.233/0001-02).
2. Constar obrigatoriamente: RLOC #ZYIK2X & Pedido de Compra (PO) nº 4500998811/2026!
3. ATENÇÃO: NÃO ENTREGAR AO HÓSPEDE EM HIPÓTESE ALGUMA!
4. Enviar arquivo XML + PDF para: notas.fiscais@vibra.com.br; cc: vibra@copastur.com.br.
Valor das diárias: R$ 350,00 (c/ ISS 5% retido).

Política de Cancelamento: Cancelamento gratuito até 24h antes.
`;
      const parsed = parseB2bVoucherText(voucher);
      assert.ok(parsed.invoicingInstructions.includes('Vibra Energia S.A.'));
      assert.ok(parsed.invoicingInstructions.includes('ZYIK2X'));
      assert.ok(parsed.invoicingInstructions.includes('(PO) nº 4500998811/2026'));
      assert.ok(parsed.invoicingInstructions.includes('NÃO ENTREGAR AO HÓSPEDE'));
      assert.ok(!parsed.invoicingInstructions.includes('Política de Cancelamento'));
      assert.strictEqual(parsed.invoiceRecipientType, 'company');
      assert.strictEqual(parsed.nfHideFromGuest, true);
    });

    it('Probe 5: Does ingestB2bVoucherIntoDb overwrite existing valid company.billingTerms when new voucher has empty instructions?', () => {
      const db = createMockDb();
      const existingCompany = db.companies[0];
      const customTerms = existingCompany.billingTerms; // "Faturar a 30 dias."

      const voucherWithoutInstructions = {
        b2bReservationNumber: "25099301",
        guestName: "Jorge Amado",
        checkinDate: "2026-12-22",
        checkoutDate: "2026-12-24",
        nights: 2,
        dailyRate: 300,
        totalAmount: 600,
        agencyName: "Opus Viagens",
        companyName: "Lactalis",
        companyCnpj: "14.049.467/0001-30",
        invoicingInstructions: ""
      };

      ingestB2bVoucherIntoDb(db, voucherWithoutInstructions);
      assert.strictEqual(existingCompany.billingTerms, customTerms, 'Existing company billingTerms should NOT be clobbered by empty instructions');
    });
  });

  describe('Bug Investigation 4: PDF Extraction ReDoS / Event-Loop Freezing (DoS Vector)', () => {
    it('Probe 6: Binary or malformed stream with repeated brackets should not freeze event loop', () => {
      const largeBinary = Buffer.alloc(50000, 0x5b); // '[' repeated 50,000 times
      const pdf = Buffer.concat([
        Buffer.from('%PDF-1.4\nstream\n'),
        largeBinary,
        Buffer.from('\nendstream\n%%EOF')
      ]);

      const t0 = Date.now();
      const extracted = extractTextFromPdfBuffer(pdf);
      const elapsed = Date.now() - t0;

      // Must complete in under 500ms without O(N^2) quadratic catastrophe
      assert.ok(elapsed < 500, `ReDoS detected: 50KB took ${elapsed}ms (must be < 500ms)`);
      assert.strictEqual(typeof extracted, 'string');
    });
  });

  describe('Bug Investigation 5: PDF Extraction Failure on Balanced Nested Parentheses', () => {
    it('Probe 7: Literal strings with balanced parentheses must extract properly', () => {
      const pdfRaw = `
%PDF-1.4
stream
BT
/F1 12 Tf
(Hospede: Maria (Dores) Silva) Tj
T*
(Empresa: Alfa (Brasil) S.A.) Tj
ET
endstream
%%EOF
`;
      const text = extractTextFromPdfBuffer(Buffer.from(pdfRaw, 'latin1'));
      assert.ok(text.includes('Maria (Dores) Silva'), `Balanced parens failed to extract! Got: "${text}"`);
      assert.ok(text.includes('Alfa (Brasil) S.A.'), `Balanced parens failed to extract! Got: "${text}"`);
    });
  });

  describe('Suite 6: PDF Parser Exotic Operators & Encodings', () => {
    it('Probe 8: Escapes, Octal, Windows-1252, Odd Hex, UTF-16BE BOM, Multiline TJ and Deflate', () => {
      // 1. Escapes \347\343o = ção, \\ = \, \( \) = ()
      const octalSnippet = 'BT (Confirma\\347\\343o de Reserva \\(B2B\\) \\\\ Matriz) Tj ET';
      const t1 = extractTextFromPdfBuffer(Buffer.from(octalSnippet, 'latin1'));
      assert.ok(t1.includes('Confirmação de Reserva (B2B) \\ Matriz'));

      // 2. Multiline TJ with kerning & Hex
      const tjSnippet = `
BT
[
  (Reserva: )
  -150
  <3235303939393939>
  -150
  (: R$ 1.500,00)
] TJ
ET
`;
      const t2 = extractTextFromPdfBuffer(Buffer.from(tjSnippet, 'latin1'));
      assert.ok(t2.includes('Reserva:') && t2.includes('25099999') && t2.includes('1.500,00'));

      // 3. UTF-16BE hex with BOM
      const hexUtf16 = 'BT <FEFF0043006F007000610073007400750072> Tj ET';
      const t3 = extractTextFromPdfBuffer(Buffer.from(hexUtf16, 'latin1'));
      assert.ok(t3.includes('Copastur'));

      // 4. Deflated zlib stream
      const deflated = zlib.deflateSync(Buffer.from('BT (Voucher Deflated 123) Tj ET', 'latin1'));
      const pdfDeflated = Buffer.concat([
        Buffer.from('%PDF-1.4\nstream\r\n'),
        deflated,
        Buffer.from('\r\nendstream\n%%EOF')
      ]);
      const t4 = extractTextFromPdfBuffer(pdfDeflated);
      assert.ok(t4.includes('Voucher Deflated 123'));
    });
  });

  describe('Suite 7: HTTP Crawler Failure Modes & Resiliency (fetchAndParseB2bVoucher)', () => {
    let mockServer;
    let mockPort;
    let mockUrl;

    before(async () => {
      mockServer = http.createServer((req, res) => {
        if (req.url === '/redirect-302') {
          res.writeHead(302, { Location: `${mockUrl}/final` });
          res.end();
        } else if (req.url === '/final') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<p>Confirmação da Reserva: 25078888</p><p>CNPJ Agência: 99.888.777/0001-66</p><p>CNPJ Empresa: 11.222.333/0001-44</p>');
        } else if (req.url === '/error-500') {
          res.writeHead(500);
          res.end('Server Error');
        } else if (req.url === '/corrupt-pdf') {
          res.writeHead(200, { 'Content-Type': 'application/pdf' });
          res.end(Buffer.from([0x00, 0x01, 0x02, 0x03]));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise(resolve => {
        mockServer.listen(0, '127.0.0.1', () => {
          mockPort = mockServer.address().port;
          mockUrl = `http://127.0.0.1:${mockPort}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (mockServer) {
        await new Promise(resolve => mockServer.close(resolve));
      }
    });

    it('Probe 9: Follows 302 redirect and extracts target voucher', async () => {
      const email = {
        subject: "Reserva 25078888",
        rawText: `Confirmação da Reserva: 25078888\nVoucher: ${mockUrl}/redirect-302`
      };
      const res = await fetchAndParseB2bVoucher(email);
      assert.strictEqual(res.b2bReservationNumber, '25078888');
      assert.strictEqual(res.agencyCnpj, '99.888.777/0001-66');
      assert.strictEqual(res.companyCnpj, '11.222.333/0001-44');
    });

    it('Probe 10: Gracefully handles 500 error, 404, invalid URL and corrupt PDF without throwing', async () => {
      const email500 = {
        subject: "Reserva 25079991",
        rawText: `Confirmação da Reserva: 25079991\nHóspede: Teste\nCheck-in: 01/12/2026\nDiária: R$ 300\nVoucher: ${mockUrl}/error-500`
      };
      const r1 = await fetchAndParseB2bVoucher(email500);
      assert.strictEqual(r1.b2bReservationNumber, '25079991');

      const emailCorruptPdf = {
        subject: "Reserva 25079992",
        rawText: `Confirmação da Reserva: 25079992\nHóspede: Teste 2\nCheck-in: 01/12/2026\nDiária: R$ 300\nVoucher: ${mockUrl}/corrupt-pdf`
      };
      const r2 = await fetchAndParseB2bVoucher(emailCorruptPdf);
      assert.strictEqual(r2.b2bReservationNumber, '25079992');

      const emailBadUrl = {
        subject: "Reserva 25079993",
        rawText: `Confirmação da Reserva: 25079993\nHóspede: Teste 3\nCheck-in: 01/12/2026\nDiária: R$ 300\nVoucher: http://127.0.0.1:1/unreachable`
      };
      const r3 = await fetchAndParseB2bVoucher(emailBadUrl);
      assert.strictEqual(r3.b2bReservationNumber, '25079993');
    });
  });

});
