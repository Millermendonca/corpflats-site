/**
 * Test Suite: M1 - Correção de Diárias, Estadia B2B e Gabarito Flat 113
 * File: tests/b2b-voucher-dates.test.mjs
 *
 * Requirements covered:
 * - F1_CALCULO_DIARIAS: Suporte a períodos numéricos e regex explícito de diárias/noites no parser
 * - F2_FALLBACK_MATEMATICO_NOITES: Fallback matemático de noites por valor total / diária e cálculo seguro de checkout
 * - F3_DAILY_RATES_GERACAO: Geração do array completo de dailyRates para todas as noites da estadia
 * - F4_VALIDACAO_GABARITO_113: Conferência com o gabarito oficial do Flat 113 (B2B-25055349 / Arlindo Amorim Barcelos / 2 diárias)
 * - Twin-Server Parity: Garantia de paridade SHA-256 entre artifacts/api-server e scripts/
 *
 * AGENTS.md Compliance:
 * Strictly isolated test execution. Run ONLY via:
 *   node tests/b2b-voucher-dates.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  parseB2bVoucherText,
  ingestB2bVoucherIntoDb
} from '../artifacts/api-server/zoho-mail-service.mjs';

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
        posUnits: [{ name: "LACTALIS DO BRASIL", city: "", state: "" }]
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
    reservations: []
  };
}

describe('M1: Correção de Diárias & Ingestão B2B (F1, F2, F3, F4)', () => {

  describe('1. Parsing de Reservas Multi-Noites com Datas Explícitas (F1)', () => {
    it('1.1 Deve identificar 2 noites a partir de formato "Período: 26/10/2026 a 28/10/2026"', () => {
      const emailText = `
Confirmação da Reserva: 25055349
Hóspede: Arlindo Amorim Barcelos
Período: 26/10/2026 a 28/10/2026
Diária: R$ 280,00
Valor Total: R$ 560,00
`;
      const parsed = parseB2bVoucherText(emailText);
      assert.strictEqual(parsed.checkinDate, '2026-10-26', 'Data de check-in deve ser 2026-10-26');
      assert.strictEqual(parsed.checkoutDate, '2026-10-28', 'Data de check-out deve ser 2026-10-28');
      assert.strictEqual(parsed.nights, 2, 'Quantidade de noites calculada deve ser 2');
    });

    it('1.2 Deve identificar 2 noites com preposições "até" e traço "-"', () => {
      const sampleAte = `
Reserva: 25055349
Hóspede: Arlindo Amorim Barcelos
Período: 26/10/2026 até 28/10/2026
Diária Média: R$ 280,00
`;
      const parsedAte = parseB2bVoucherText(sampleAte);
      assert.strictEqual(parsedAte.checkinDate, '2026-10-26');
      assert.strictEqual(parsedAte.checkoutDate, '2026-10-28');
      assert.strictEqual(parsedAte.nights, 2);

      const sampleTraco = `
Confirmação de Reserva: 25055349
Hóspede: Arlindo Amorim Barcelos
26/10/2026 - 28/10/2026
Tarifa Diária: R$ 280,00
`;
      const parsedTraco = parseB2bVoucherText(sampleTraco);
      assert.strictEqual(parsedTraco.checkinDate, '2026-10-26');
      assert.strictEqual(parsedTraco.checkoutDate, '2026-10-28');
      assert.strictEqual(parsedTraco.nights, 2);
    });

    it('1.3 Deve identificar datas separadas em linhas distintas (ex: tabelas HTML higienizadas)', () => {
      const sampleTable = `
Confirmação da Reserva: 25055349
Hóspede: Arlindo Amorim Barcelos
Entrada: 26/10/2026
Saída: 28/10/2026
Diária: R$ 280,00
`;
      const parsed = parseB2bVoucherText(sampleTable);
      assert.strictEqual(parsed.checkinDate, '2026-10-26');
      assert.strictEqual(parsed.checkoutDate, '2026-10-28');
      assert.strictEqual(parsed.nights, 2);
      assert.strictEqual(
        parsed.nights,
        Math.round((new Date(`${parsed.checkoutDate}T12:00:00Z`) - new Date(`${parsed.checkinDate}T12:00:00Z`)) / 86400000),
        'Invariante de noites deve ser estritamente satisfeita'
      );
    });

    it('1.4 Deve identificar transição de ano com período abreviado "30/12 a 02/01/2027"', () => {
      const sampleYearCrossing = `
Confirmação da Reserva: 25055014
Hóspede: New Year Guest
Período: 30/12 a 02/01/2027
Diária: R$ 300,00
Valor Total: R$ 900,00
`;
      const parsed = parseB2bVoucherText(sampleYearCrossing);
      assert.strictEqual(parsed.checkinDate, '2026-12-30', 'Check-in deve ser no ano anterior (2026) quando m1 > m2');
      assert.strictEqual(parsed.checkoutDate, '2027-01-02', 'Check-out deve ser no ano de destino (2027)');
      assert.strictEqual(parsed.nights, 3, 'Quantidade de noites calculada deve ser 3');
      assert.strictEqual(
        parsed.nights,
        Math.round((new Date(`${parsed.checkoutDate}T12:00:00Z`) - new Date(`${parsed.checkinDate}T12:00:00Z`)) / 86400000),
        'Invariante de noites deve ser estritamente satisfeita'
      );
    });
  });

  describe('2. Fallback Matemático quando Check-out for Omitido (F2)', () => {
    it('2.1 Deve deduzir 2 noites e calcular checkoutDate correto via totalAmount / dailyRate', () => {
      const emailWithoutCheckout = `
Confirmação da Reserva: 25055349
Hóspede: Arlindo Amorim Barcelos
Entrada: 26/10/2026
Tarifa Diária: R$ 280,00
Valor Total: R$ 560,00
`;
      const parsed = parseB2bVoucherText(emailWithoutCheckout);
      assert.strictEqual(parsed.checkinDate, '2026-10-26');
      assert.strictEqual(parsed.dailyRate, 280);
      assert.strictEqual(parsed.totalAmount, 560);
      assert.strictEqual(parsed.nights, 2, 'Fallback deve calcular Math.round(560 / 280) = 2 noites');
      assert.strictEqual(parsed.checkoutDate, '2026-10-28', 'Data de checkout calculada deve ser 2026-10-28');
    });

    it('2.2 Ingestão no banco deve preservar 2 noites e R$ 560,00 sem truncar para 1 diária', () => {
      const mockDb = createCleanMockDb();
      const parsed = {
        b2bReservationNumber: "25055349",
        b2bLocatorRloc: "25055349",
        guestName: "Arlindo Amorim Barcelos",
        checkinDate: "2026-10-26",
        dailyRate: 280,
        totalAmount: 560,
        agencyName: "Opus Viagens",
        companyName: "Lactalis do Brasil"
      };

      const result = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.reservation.nights, 2, 'Reserva gravada deve ter nights = 2');
      assert.strictEqual(result.reservation.checkoutDate, '2026-10-28', 'Checkout gravado deve ser 2026-10-28');
      assert.strictEqual(result.reservation.totalAmount, 560.00, 'Valor total não pode ser corrompido para 280');
      assert.strictEqual(result.reservation.dailyRate, 280.00);
    });
  });

  describe('3. Reconhecimento de Contagem Explícita de Diárias (F1 / F2)', () => {
    it('3.1 Deve respeitar token "Diárias: 3" e calcular checkoutDate para 3 noites', () => {
      const emailWithNightsToken = `
Confirmação de Reserva: 25065298
Hóspede: Gabriela Silva
Check-in: 10/11/2026
Diárias: 3
Diária: R$ 280,00
`;
      const parsed = parseB2bVoucherText(emailWithNightsToken);
      assert.strictEqual(parsed.checkinDate, '2026-11-10');
      assert.strictEqual(parsed.nights, 3, 'Deve extrair 3 noites do token "Diárias: 3"');
      assert.strictEqual(parsed.checkoutDate, '2026-11-13', 'Check-out deduzido deve ser 2026-11-13');
      assert.strictEqual(parsed.totalAmount, 840, 'Total deve ser 280 * 3 = 840');
    });

    it('3.2 Deve suportar variações "Noites: 4", "3 diárias" e "5 noites"', () => {
      const sampleNoites = `Entrada: 01/12/2026\nNoites: 4\nDiária: R$ 300,00`;
      const parsedNoites = parseB2bVoucherText(sampleNoites);
      assert.strictEqual(parsedNoites.nights, 4);
      assert.strictEqual(parsedNoites.checkoutDate, '2026-12-05');

      const sampleExtenso = `Entrada: 01/12/2026\nPeríodo contratado: 5 noites\nTarifa: R$ 300,00`;
      const parsedExtenso = parseB2bVoucherText(sampleExtenso);
      assert.strictEqual(parsedExtenso.nights, 5);
      assert.strictEqual(parsedExtenso.checkoutDate, '2026-12-06');
    });
  });

  describe('4. Geração Completa do Array dailyRates (F3)', () => {
    it('4.1 Deve gerar dailyRates com exatamente `nights` elementos e datas consecutivas', () => {
      const mockDb = createCleanMockDb();
      const parsed = {
        b2bReservationNumber: "25055349",
        guestName: "Arlindo Amorim Barcelos",
        checkinDate: "2026-10-26",
        checkoutDate: "2026-10-28",
        nights: 2,
        dailyRate: 280.00,
        totalAmount: 560.00,
        agencyName: "Opus Viagens"
      };

      const res = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(res.ok, true);
      const r = res.reservation;

      assert.ok(Array.isArray(r.dailyRates), 'r.dailyRates deve ser um Array');
      assert.strictEqual(r.dailyRates.length, 2, 'Array dailyRates deve ter comprimento igual a 2');

      assert.deepStrictEqual(r.dailyRates[0], {
        date: '2026-10-26',
        rate: 280.00,
        channel: 'b2b'
      });
      assert.deepStrictEqual(r.dailyRates[1], {
        date: '2026-10-27',
        rate: 280.00,
        channel: 'b2b'
      });

      const ratesSum = r.dailyRates.reduce((acc, d) => acc + d.rate, 0);
      assert.strictEqual(ratesSum, r.totalAmount, 'Soma das diárias deve ser igual a totalAmount');
    });

    it('4.2 Deve atualizar dailyRates ao enriquecer uma reserva pré-existente', () => {
      const mockDb = createCleanMockDb();
      // Reserva manual inicial lançada com 1 diária
      mockDb.reservations.push({
        id: 10,
        code: 'RES-113-MANUAL',
        flatId: 1,
        flatNumber: '113',
        guestName: 'Arlindo Amorim Barcelos',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-27',
        nights: 1,
        dailyRate: 280.00,
        totalAmount: 280.00,
        dailyRates: [{ date: '2026-10-26', rate: 280.00, channel: 'balcao' }],
        status: 'confirmada'
      });

      // Voucher B2B chega com 2 diárias
      const parsed = {
        b2bReservationNumber: "25055349",
        guestName: "Arlindo Amorim Barcelos",
        checkinDate: "2026-10-26",
        checkoutDate: "2026-10-28",
        nights: 2,
        dailyRate: 280.00,
        totalAmount: 560.00,
        agencyName: "Opus Viagens"
      };

      const res = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.reservation.id, 10, 'Deve enriquecer a reserva existente');
      assert.strictEqual(res.reservation.nights, 2);
      assert.strictEqual(res.reservation.checkoutDate, '2026-10-28');
      assert.strictEqual(res.reservation.totalAmount, 560.00);
      assert.strictEqual(res.reservation.dailyRates.length, 2, 'dailyRates deve ser expandido para 2 noites');
      assert.strictEqual(res.reservation.dailyRates[1].date, '2026-10-27');
    });
  });

  describe('5. Ingestão de Payload Real do Flat 113 contra Gabarito Oficial (F4)', () => {
    it('5.1 Deve ingerir payload do Flat 113 e validar campos canônicos de demo-server.mjs:9074-9112', () => {
      const rawVoucherFlat113 = `
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
Agência Solicitante: Opus Viagens e Eventos Ltda
Unidade POS: LACTALIS DO BRASIL
Solicitante: WEBSERVICE
E-mail Agência: lactalis@opusviagens.com.br
Telefone Agência: (11) 3995-2500 / (11) 99155-8446
Empresa Cliente: Lactalis do Brasil
Centro de Custo: 9000700
Forma de Pagamento: Cartão Virtual VCN
Cartão: Mastercard 555047xxxxxx4135
Token VCN: Q3DQSN1
Despesas Autorizadas: DEBITAR SOMENTE DIARIAS
Tomador da Nota: Hóspede
Instruções de Faturamento: NF emitida para o Hóspede com envio para arlindo.barcelos@br.lactalis.com e lactalis@opusviagens.com.br.
`;
      const mockDb = createCleanMockDb();
      const parsed = parseB2bVoucherText(rawVoucherFlat113);
      const ingestResult = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });

      assert.strictEqual(ingestResult.ok, true, 'Ingestão deve ser concluída com sucesso');
      const r = ingestResult.reservation;

      // Validação pontual contra o gabarito oficial de seedB2bReservations[0] (demo-server.mjs:9074-9112)
      assert.strictEqual(r.b2bReservationNumber, '25055349', 'b2bReservationNumber deve bater com gabarito');
      assert.strictEqual(r.b2bLocatorRloc, '25055349', 'b2bLocatorRloc deve bater com gabarito');
      assert.strictEqual(r.flatNumber, '113', 'Flat alocado deve ser 113');
      assert.strictEqual(r.guestName, 'Arlindo Amorim Barcelos', 'Nome do hóspede deve ser normalizado');
      assert.strictEqual(r.checkinDate, '2026-10-26', 'Check-in deve ser 2026-10-26');
      assert.strictEqual(r.checkoutDate, '2026-10-28', 'Check-out deve ser 2026-10-28');
      assert.strictEqual(r.nights, 2, 'Quantidade de diárias deve ser exatamente 2');
      assert.strictEqual(r.dailyRate, 280.00, 'Diária média deve ser R$ 280,00');
      assert.strictEqual(r.totalAmount, 560.00, 'Total deve ser R$ 560,00');
      assert.strictEqual(r.includeBreakfast, true, 'Café da manhã deve estar incluso');
      assert.strictEqual(r.b2bRatePolicy, 'NET', 'Política de tarifa deve ser NET');
      assert.strictEqual(r.b2bCommissionPct, 0, 'Comissão deve ser 0%');
      assert.strictEqual(r.b2bCommissionAmount, 0, 'Valor de comissão deve ser 0');
      assert.strictEqual(r.b2bPaymentType, 'VIRTUAL_CARD', 'Pagamento deve ser VIRTUAL_CARD');
      assert.strictEqual(r.b2bCardBrand, 'Mastercard', 'Bandeira do cartão deve ser Mastercard');
      assert.strictEqual(r.b2bCardMasked, '555047xxxxxx4135', 'Cartão mascarado deve bater');
      assert.strictEqual(r.b2bVcnToken, 'Q3DQSN1', 'Token VCN deve bater');
      assert.strictEqual(r.b2bAuthorizedExpenses, 'DEBITAR SOMENTE DIARIAS');
      assert.strictEqual(r.invoiceRecipientType, 'guest', 'Tomador da nota deve ser guest');
      assert.ok(r.nfDeliveryEmails.includes('arlindo.barcelos@br.lactalis.com'), 'Deve incluir e-mail do hóspede na NF');
      assert.ok(r.nfDeliveryEmails.includes('lactalis@opusviagens.com.br'), 'Deve incluir e-mail da agência na NF');

      // Daily Rates verificação
      assert.ok(Array.isArray(r.dailyRates) && r.dailyRates.length === 2, 'dailyRates deve ter 2 noites');
      assert.strictEqual(r.dailyRates[0].date, '2026-10-26');
      assert.strictEqual(r.dailyRates[0].rate, 280.00);
      assert.strictEqual(r.dailyRates[1].date, '2026-10-27');
      assert.strictEqual(r.dailyRates[1].rate, 280.00);
    });
  });

  describe('6. Paridade Estrita Twin-Server (Regra AGENTS.md)', () => {
    it('6.1 Deve garantir paridade SHA-256 entre artifacts/api-server/zoho-mail-service.mjs e scripts/zoho-mail-service.mjs', () => {
      const primaryPath = path.resolve('artifacts/api-server/zoho-mail-service.mjs');
      const mirrorPath = path.resolve('scripts/zoho-mail-service.mjs');

      assert.ok(fs.existsSync(primaryPath), 'Arquivo primário artifacts/api-server/zoho-mail-service.mjs deve existir');
      assert.ok(fs.existsSync(mirrorPath), 'Arquivo espelho scripts/zoho-mail-service.mjs deve existir');

      const hashPrimary = computeSha256(primaryPath);
      const hashMirror = computeSha256(mirrorPath);

      assert.strictEqual(
        hashPrimary,
        hashMirror,
        `Discrepância SHA-256 detectada! artifacts (${hashPrimary.substring(0, 8)}) != scripts (${hashMirror.substring(0, 8)}). Execute sincronização de gêmeos.`
      );
    });
  });

});
