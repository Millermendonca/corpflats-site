/**
 * M2.3 Empirical Challenger Stress Tests
 * File: tests/m2-challenger-edge-cases.test.mjs
 *
 * Edge cases requested:
 * 1. High nesting of parentheses: `(A (B (C (D) E) F) G) Tj` and variants
 * 2. Voucher text where guest phone is present, hotel phone is present, but agency phone is missing: ensure agencyAgentPhone === ""
 * 3. Voucher text where company CNPJ is present, but agency CNPJ is missing: ensure agencyCnpj === "" and companyCnpj === ...
 * 4. Additional adversarial boundaries:
 *    - Deep nesting (10 levels)
 *    - Escaped parentheses combined with balanced nested parentheses
 *    - Ingesting missing agency CNPJ vs company CNPJ into DB
 *    - Dual CNPJs present (both preserved correctly)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import {
  parseB2bVoucherText,
  ingestB2bVoucherIntoDb
} from '../artifacts/api-server/zoho-mail-service.mjs';

import { extractTextFromPdfBuffer } from '../artifacts/api-server/pdf-extract-service.mjs';

function createMockDb() {
  return {
    flats: [
      { id: 1, number: "113", name: "Flat 113", status: "disponivel", active: true }
    ],
    agencies: [
      {
        id: 1,
        name: "Flytour Viagens e Turismo",
        tradeName: "Flytour",
        corporateName: "Flytour Business Travel Ltda",
        cnpj: "00.000.000/0001-91",
        email: "operacoes@flytour.com.br",
        phone: "(11) 4004-0001",
        posUnits: [],
        agents: [],
        clientCompanies: []
      }
    ],
    companies: [
      {
        id: 1,
        name: "Petróleo Brasileiro S.A.",
        tradeName: "Petrobras",
        corporateName: "Petróleo Brasileiro S.A. Petrobras",
        cnpj: "33.000.167/0001-01",
        phone: "(21) 3876-0000",
        billingTerms: "Faturamento 30 dias.",
        invoicingInstructions: "Faturamento 30 dias."
      }
    ],
    guests: [],
    reservations: []
  };
}

describe('M2.3 Challenger Edge Cases Stress Test', () => {

  describe('Edge Case 1: High Nesting of Parentheses in PDF Content Streams', () => {
    it('1.1 Should correctly extract high nesting: (A (B (C (D) E) F) G) Tj', () => {
      const stream = `
BT
/F1 12 Tf
(A (B (C (D) E) F) G) Tj
ET
`;
      const pdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
      const extracted = extractTextFromPdfBuffer(pdfBuffer);

      assert.ok(extracted.includes("A (B (C (D) E) F) G"), `Failed to extract nested parens! Got: "${extracted}"`);
    });

    it('1.2 Should handle deep nesting (10 levels deep)', () => {
      const stream = `
BT
/F1 12 Tf
(L0 (L1 (L2 (L3 (L4 (L5 (L6 (L7 (L8 (L9 Deep) R8) R7) R6) R5) R4) R3) R2) R1) R0) Tj
ET
`;
      const pdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
      const extracted = extractTextFromPdfBuffer(pdfBuffer);

      assert.ok(extracted.includes("Deep"), `Failed to extract 10-level nested string! Got: "${extracted}"`);
      assert.ok(extracted.includes("L0 (L1"), `Missing outer level! Got: "${extracted}"`);
    });

    it('1.3 Should handle escaped parentheses inside nested parentheses', () => {
      const stream = `
BT
/F1 12 Tf
(Start (Middle \\(escaped\\) (Deep (Deeper) EndDeep) MiddleEnd) Finish) Tj
ET
`;
      const pdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
      const extracted = extractTextFromPdfBuffer(pdfBuffer);

      assert.ok(extracted.includes("Start (Middle (escaped) (Deep (Deeper) EndDeep) MiddleEnd) Finish"), `Escaped parens within nested parens failed! Got: "${extracted}"`);
    });

    it('1.4 Should handle nested parentheses inside TJ arrays', () => {
      const stream = `
BT
/F1 12 Tf
[(Item1 (nested1) Item1End) -150 (Item2 (nested2 (deep2)) Item2End)] TJ
ET
`;
      const pdfBuffer = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
      const extracted = extractTextFromPdfBuffer(pdfBuffer);

      assert.ok(extracted.includes("Item1 (nested1) Item1End"), `Array TJ nested string 1 failed! Got: "${extracted}"`);
      assert.ok(extracted.includes("Item2 (nested2 (deep2)) Item2End"), `Array TJ nested string 2 failed! Got: "${extracted}"`);
    });

    it('1.5 Should handle Deflate compressed streams with high nesting of parentheses', () => {
      const rawStream = `
BT
/F1 12 Tf
(Hospede: Roberto (Beto) Silveira (Filho)) Tj
ET
`;
      const compressed = zlib.deflateSync(Buffer.from(rawStream));
      const pdf = Buffer.concat([
        Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`),
        compressed,
        Buffer.from(`\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`)
      ]);
      const extracted = extractTextFromPdfBuffer(pdf);
      assert.ok(extracted.includes("Roberto (Beto) Silveira (Filho)"), `FlateDecode nested parens failed! Got: "${extracted}"`);
    });
  });

  describe('Edge Case 2: Contact Segregation (Hotel Phone & Guest Phone vs Missing Agency Phone)', () => {
    it('2.1 When guest phone and hotel phone are present, but agency phone is missing, agencyAgentPhone must be empty string', () => {
      const voucherText = `
HOTEL PROMENADE LINCOLN FLAT
Av. do Contorno, 7000 - Belo Horizonte / MG
Telefone: (31) 3333-4444
Email: hotel.lincoln@promenade.com.br

CONFIRMAÇÃO DE RESERVA B2B
Número da Reserva: 88776655
Hóspede: Fernando Pessoa
Telefone do Hóspede: (21) 99111-2222
E-mail Hóspede: fpessoa@literatura.pt
Período: 01/12/2026 a 04/12/2026
Diárias: 3
Total: R$ 900,00

DADOS DA AGÊNCIA:
Agência Solicitante: Carlson Wagonlit Travel
Emissor: Mariana Neves
(Nenhum telefone informado pela agência)

DADOS DA EMPRESA:
Empresa: Vale S.A.
CNPJ: 33.592.510/0001-54
`;
      const parsed = parseB2bVoucherText(voucherText);

      assert.strictEqual(parsed.guestName, 'Fernando Pessoa');
      assert.strictEqual(parsed.agencyAgentPhone, '', 'Agency phone must be empty string and NOT steal hotel or guest phone!');
      assert.strictEqual(parsed.agencyAgentEmail, '', 'Agency email must be empty string and NOT steal hotel or guest email!');
    });

    it('2.2 When multiple non-agency phones appear throughout the text, agencyAgentPhone must not pick any of them up', () => {
      const voucherText = `
VOUCHER DE HOSPEDAGEM
Central de Atendimento Hotel: (11) 5000-8888
Recepção: (11) 5000-8889
Suporte 24h: 0800 707 0101

Passageiro: Marina da Glória
Contato Passageiro: (11) 97777-6666
Email Passageiro: marina@gloria.com

Agência de Viagens: CVC Brasil Operadora
Agente: Rodrigo Santoro

Empresa: Embraer S.A.
Telefone Empresa: (12) 3927-1000
`;
      const parsed = parseB2bVoucherText(voucherText);

      assert.strictEqual(parsed.guestName, 'Marina da Glória');
      assert.strictEqual(parsed.agencyAgentPhone, '', 'Agency phone must not pick up reception, central, or company phone!');
      assert.strictEqual(parsed.agencyAgentEmail, '', 'Agency email must be empty');
    });
  });

  describe('Edge Case 3: CNPJ Segregation (Company CNPJ Present vs Missing Agency CNPJ)', () => {
    it('3.1 When company CNPJ is explicitly present and agency has no CNPJ, agencyCnpj must be empty', () => {
      const voucherText = `
CONFIRMAÇÃO DE RESERVA
Localizador: 55443322
Check-in: 15/11/2026
Check-out: 18/11/2026
Hóspede: Carlos Alberto
Total: R$ 1.200,00

Agência: Maringá Turismo
Agente: Cláudia Souza

Dados para Faturamento / Tomador:
Empresa: Ambev S.A.
CNPJ Empresa: 07.526.557/0001-00
Inscrição Estadual: 111.222.333.444
Endereço: Rua Dr. Renato Paes de Barros, 1017 - São Paulo - SP
`;
      const parsed = parseB2bVoucherText(voucherText);

      assert.strictEqual(parsed.companyCnpj, '07.526.557/0001-00', 'Company CNPJ should be correctly captured');
      assert.strictEqual(parsed.agencyCnpj, '', 'Agency CNPJ must be empty and NOT steal company CNPJ!');
    });

    it('3.2 When company CNPJ appears under Dados da Empresa without explicit "Empresa" label next to CNPJ', () => {
      const voucherText = `
CONFIRMAÇÃO DE HOSPEDAGEM: RES-9988
Agência: BeFly Travel
Emissor: Carlos Eduardo

Dados da Empresa:
Razão Social: Gerdau Aços Longos S.A.
CNPJ: 07.358.761/0001-69
Endereço: Av. das Nações Unidas, 8501

Hóspede: Roberto Marinho
Diárias: 1
Total: R$ 450,00
`;
      const parsed = parseB2bVoucherText(voucherText);

      assert.strictEqual(parsed.companyCnpj, '07.358.761/0001-69', 'Company CNPJ should be identified from Dados da Empresa block');
      assert.strictEqual(parsed.agencyCnpj, '', 'Agency CNPJ must not steal company CNPJ from block');
    });

    it('3.3 Ingesting voucher with missing agency CNPJ and present company CNPJ into DB must not contaminate agency table', () => {
      const db = createMockDb();

      const voucher = {
        b2bReservationNumber: "B2B-TEST-7788",
        b2bLocatorRloc: "B2B-TEST-7788",
        guestName: "Juliana Paes",
        guestEmail: "jpaes@globo.com",
        guestPhone: "(21) 98765-4321",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        nights: 2,
        dailyRate: 350.00,
        totalAmount: 700.00,
        roomNumber: "113",
        flatNumber: "113",
        hotelName: "Flat 113",
        // Agency has NO CNPJ
        agencyName: "Nova Agência Sem CNPJ",
        agencyCnpj: "",
        agencyAgentName: "Lucas Mendes",
        agencyAgentEmail: "lucas@novaagencia.com.br",
        agencyAgentPhone: "(11) 91111-2222",
        // Company HAS CNPJ
        companyName: "Suzano Papel e Celulose S.A.",
        companyCnpj: "16.404.287/0001-55",
        invoicingInstructions: "Faturar para Suzano em 28 dias."
      };

      const result = ingestB2bVoucherIntoDb(db, voucher);
      assert.strictEqual(result.ok, true);

      // Verify agency in DB
      const agencyInDb = db.agencies.find(a => a.name === "Nova Agência Sem CNPJ");
      assert.ok(agencyInDb, "Agency should be registered in DB");
      assert.strictEqual(agencyInDb.cnpj, "", "Agency in DB must NOT have stolen the company CNPJ!");

      // Verify company in DB
      const companyInDb = db.companies.find(c => c.cnpj === "16.404.287/0001-55");
      assert.ok(companyInDb, "Company should be registered in DB with its CNPJ");
      assert.strictEqual(companyInDb.cnpj, "16.404.287/0001-55");
    });

    it('3.4 When BOTH agency CNPJ and company CNPJ are present, both must be preserved without cross-contamination', () => {
      const voucherText = `
VOUCHER DE CONFIRMAÇÃO: B2B-DUAL-CNPJ
Agência: Copastur Viagens e Turismo Ltda
CNPJ Agência: 59.553.842/0001-83
Contato: Amanda Souza
Telefone da Agência: (11) 3218-0000

Dados de Faturamento:
Empresa Faturada: IBM Brasil Ltda
CNPJ Empresa: 33.372.251/0001-56
Endereço: Rua Tutóia, 1157 - São Paulo - SP

Hóspede: Linus Torvalds
Check-in: 10/11/2026
Check-out: 12/11/2026
Total: R$ 800,00
`;
      const parsed = parseB2bVoucherText(voucherText);

      assert.strictEqual(parsed.agencyCnpj, '59.553.842/0001-83', 'Agency CNPJ must match');
      assert.strictEqual(parsed.companyCnpj, '33.372.251/0001-56', 'Company CNPJ must match');
      assert.strictEqual(parsed.agencyAgentPhone, '(11) 3218-0000');
    });
  });

});
