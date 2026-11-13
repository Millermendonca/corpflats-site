/**
 * Adversarial Challenger Suite: M1 - Correção de Diárias, Estadia B2B e Robustez
 * File: tests/b2b-voucher-challenger.test.mjs
 *
 * Scope:
 * - Adversarially stress-tests `ingestB2bVoucherIntoDb` and `parseB2bVoucherText`.
 * - Validates non-corruption of existing fields (guestName, status, paymentStatus, paymentMethod, custom fields).
 * - Tests repair of 1-night truncated reservations to multi-night (2 nights, 3 nights).
 * - Tests crash-resistance against malformed, null, undefined, inverted, and degenerate vouchers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseB2bVoucherText,
  ingestB2bVoucherIntoDb
} from '../artifacts/api-server/zoho-mail-service.mjs';

function createMockDb() {
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
        cnpj: "12.345.678/0001-99",
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
    guests: [
      {
        id: 101,
        name: "Arlindo Amorim Barcelos",
        fullName: "Arlindo Amorim Barcelos",
        cpf: "123.456.789-00",
        phone: "5522999999999"
      }
    ],
    reservations: []
  };
}

describe('CHALLENGER SUITE: M1 Correção de Diárias & Robustez B2B', () => {

  describe('1. Adversarial Challenge: Reparo de Reserva Truncada para 1 Noite', () => {
    it('1.1 Deve reparar reserva de 1 para 2 noites sem corromper status, paymentStatus, guestName ou custom fields', () => {
      const mockDb = createMockDb();

      // Reserva existente previamente truncada para 1 diária no Flat 113
      const existingReservation = {
        id: 50,
        code: 'RES-113-B2B-25055349',
        flatId: 1,
        flatNumber: '113',
        guestId: 101,
        guestName: 'Arlindo Amorim Barcelos',
        guestPhone: '5522999999999',
        guestDocument: '123.456.789-00',
        guestEmail: 'arlindo.barcelos@br.lactalis.com',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-27', // Truncado para 1 dia
        nights: 1,                  // Truncado para 1 dia
        dailyRate: 280.00,
        totalAmount: 280.00,        // Truncado para R$ 280
        dailyRates: [
          { date: '2026-10-26', rate: 280.00, channel: 'b2b' }
        ],
        status: 'checked_in',              // Hóspede já realizou check-in!
        paymentStatus: 'pago_integralmente', // Já quitado integralmente
        paymentMethod: 'cartao_empresa',
        customAuditNote: 'Auditoria de governança realizada às 14:00',
        vipGuest: true,
        b2bReservationNumber: '25055349',
        externalReservationNumber: '25055349'
      };
      mockDb.reservations.push(existingReservation);

      // Chega voucher oficial com 2 noites (total R$ 560,00)
      const parsedVoucher = {
        b2bReservationNumber: '25055349',
        b2bLocatorRloc: '25055349',
        guestName: 'Arlindo Amorim Barcelos',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-28',
        nights: 2,
        dailyRate: 280.00,
        totalAmount: 560.00,
        agencyName: 'Opus Viagens',
        companyName: 'Lactalis do Brasil'
      };

      const result = ingestB2bVoucherIntoDb(mockDb, parsedVoucher, { autoSendCredentialEmail: false });

      assert.strictEqual(result.ok, true, 'Ingestão deve ter sucesso');
      assert.strictEqual(result.created, false, 'Deve enriquecer/reparar e NÃO duplicar');
      assert.strictEqual(mockDb.reservations.length, 1, 'Não deve criar reserva duplicada');

      const rep = result.reservation;

      // 1. Reparo de datas e valores
      assert.strictEqual(rep.checkinDate, '2026-10-26', 'checkinDate deve ser mantido');
      assert.strictEqual(rep.checkoutDate, '2026-10-28', 'checkoutDate deve ser reparado para 2026-10-28');
      assert.strictEqual(rep.nights, 2, 'nights deve ser reparado para 2');
      assert.strictEqual(rep.totalAmount, 560.00, 'totalAmount deve ser reparado para 560.00');
      assert.strictEqual(rep.dailyRate, 280.00, 'dailyRate deve ser 280.00');

      // 2. Reparo do array dailyRates
      assert.ok(Array.isArray(rep.dailyRates), 'dailyRates deve ser Array');
      assert.strictEqual(rep.dailyRates.length, 2, 'dailyRates deve conter exatamente 2 diárias');
      assert.deepStrictEqual(rep.dailyRates[0], { date: '2026-10-26', rate: 280.00, channel: 'b2b' });
      assert.deepStrictEqual(rep.dailyRates[1], { date: '2026-10-27', rate: 280.00, channel: 'b2b' });

      // 3. NÃO CORRUPÇÃO DE CAMPOS EXISTENTES CRÍTICOS
      assert.strictEqual(rep.guestName, 'Arlindo Amorim Barcelos', 'guestName não pode ser corrompido');
      assert.strictEqual(rep.status, 'checked_in', 'status operacional não pode ser rebaixado ou corrompido');
      assert.strictEqual(rep.paymentStatus, 'pago_integralmente', 'paymentStatus não pode ser alterado');
      assert.strictEqual(rep.paymentMethod, 'cartao_empresa', 'paymentMethod existente não pode ser sobrescrito');
      assert.strictEqual(rep.customAuditNote, 'Auditoria de governança realizada às 14:00', 'customAuditNote deve permanecer intacto');
      assert.strictEqual(rep.vipGuest, true, 'vipGuest flag deve permanecer intacta');
      assert.strictEqual(rep.flatNumber, '113', 'flatNumber alocado não pode ser trocado');
      assert.strictEqual(rep.guestPhone, '5522999999999', 'guestPhone não pode ser apagado');
      assert.strictEqual(rep.guestDocument, '123.456.789-00', 'guestDocument não pode ser apagado');
    });

    it('1.2 Deve reparar reserva de 1 para 3 noites usando fallback matemático quando voucher omite checkoutDate', () => {
      const mockDb = createMockDb();

      // Reserva existente prévia de 1 dia
      mockDb.reservations.push({
        id: 77,
        code: 'RES-211-B2B-25088991',
        flatId: 4,
        flatNumber: '211',
        guestName: 'Mariana Souza',
        checkinDate: '2026-11-01',
        checkoutDate: '2026-11-02',
        nights: 1,
        dailyRate: 300.00,
        totalAmount: 300.00,
        dailyRates: [{ date: '2026-11-01', rate: 300.00, channel: 'b2b' }],
        status: 'confirmada',
        paymentStatus: 'pendente',
        b2bReservationNumber: '25088991'
      });

      // Voucher chega sem checkoutDate e sem nights explícito, mas com totalAmount = 900 e dailyRate = 300
      const parsed = {
        b2bReservationNumber: '25088991',
        guestName: 'Mariana Souza',
        checkinDate: '2026-11-01',
        dailyRate: 300.00,
        totalAmount: 900.00
      };

      const result = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.reservation.nights, 3, 'Deve deduzir 3 noites');
      assert.strictEqual(result.reservation.checkoutDate, '2026-11-04', 'Deve projetar checkoutDate para 2026-11-04');
      assert.strictEqual(result.reservation.totalAmount, 900.00);
      assert.strictEqual(result.reservation.dailyRates.length, 3, 'dailyRates deve ter 3 elementos');
      assert.strictEqual(result.reservation.dailyRates[0].date, '2026-11-01');
      assert.strictEqual(result.reservation.dailyRates[1].date, '2026-11-02');
      assert.strictEqual(result.reservation.dailyRates[2].date, '2026-11-03');
      assert.strictEqual(result.reservation.status, 'confirmada', 'status mantido');
      assert.strictEqual(result.reservation.paymentStatus, 'pendente', 'paymentStatus mantido');
    });

    it('1.3 Deve associar por token de hóspede reserva manual pré-existente e repará-la', () => {
      const mockDb = createMockDb();

      // Reserva manual criada na recepção com 1 noite
      mockDb.reservations.push({
        id: 99,
        code: 'RES-313-MANUAL-VALTENCIR',
        flatId: 8,
        flatNumber: '313',
        guestName: 'Valtencir Soares da Silva',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-27',
        nights: 1,
        dailyRate: 280.00,
        totalAmount: 280.00,
        dailyRates: [{ date: '2026-10-26', rate: 280.00, channel: 'balcao' }],
        status: 'confirmada',
        paymentStatus: 'pendente'
      });

      // Voucher B2B chega com nome abreviado "Valtencir Soares", checkinDate correspondente e 2 noites
      const parsed = {
        b2bReservationNumber: '25099901',
        guestName: 'Valtencir Soares',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-28',
        nights: 2,
        dailyRate: 280.00,
        totalAmount: 560.00
      };

      const result = ingestB2bVoucherIntoDb(mockDb, parsed, { autoSendCredentialEmail: false });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.created, false);
      assert.strictEqual(result.reservation.id, 99, 'Deve vincular à reserva manual id 99');
      assert.strictEqual(result.reservation.nights, 2);
      assert.strictEqual(result.reservation.checkoutDate, '2026-10-28');
      assert.strictEqual(result.reservation.totalAmount, 560.00);
      assert.strictEqual(result.reservation.dailyRates.length, 2);
    });
  });

  describe('2. Adversarial Challenge: Vouchers Malformados e Degenerados', () => {
    it('2.1 Deve lidar com entrada nula ou indefinida sem quebrar o servidor', () => {
      assert.doesNotThrow(() => {
        const resNull = ingestB2bVoucherIntoDb(null, null);
        assert.deepStrictEqual(resNull, { ok: false, skipped: true });

        const resUndef = ingestB2bVoucherIntoDb(undefined, undefined);
        assert.deepStrictEqual(resUndef, { ok: false, skipped: true });
      });
    });

    it('2.2 Deve rejeitar voucher vazio ou sem número de reserva/localizador de forma graciosa', () => {
      const mockDb = createMockDb();
      assert.doesNotThrow(() => {
        const resEmpty = ingestB2bVoucherIntoDb(mockDb, {});
        assert.deepStrictEqual(resEmpty, { ok: false, skipped: true });

        const resNoGuest = ingestB2bVoucherIntoDb(mockDb, {
          b2bReservationNumber: '25011122'
        });
        assert.deepStrictEqual(resNoGuest, { ok: false, skipped: true });

        const resNoCheckin = ingestB2bVoucherIntoDb(mockDb, {
          b2bReservationNumber: '25011122',
          guestName: 'Fulano de Tal'
        });
        assert.deepStrictEqual(resNoCheckin, { ok: false, skipped: true });
      });
      assert.strictEqual(mockDb.reservations.length, 0, 'Nenhuma reserva espúria deve ser gravada');
    });

    it('2.3 Deve suportar voucher sem valores e sem checkoutDate gerando defaults seguros sem NaN ou crash', () => {
      const mockDb = createMockDb();
      const parsedDegenerate = {
        b2bReservationNumber: '25077777',
        guestName: 'Cliente Teste Degenerado',
        checkinDate: '2026-11-15'
        // Sem checkoutDate, sem nights, sem dailyRate, sem totalAmount
      };

      let result;
      assert.doesNotThrow(() => {
        result = ingestB2bVoucherIntoDb(mockDb, parsedDegenerate, { autoSendCredentialEmail: false });
      });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.reservation.nights, 1, 'Deve usar fallback seguro de 1 noite');
      assert.strictEqual(result.reservation.checkoutDate, '2026-11-16', 'Deve projetar 1 dia a partir do checkin');
      assert.strictEqual(Number.isNaN(result.reservation.dailyRate), false, 'dailyRate não pode ser NaN');
      assert.strictEqual(Number.isNaN(result.reservation.totalAmount), false, 'totalAmount não pode ser NaN');
      assert.strictEqual(result.reservation.dailyRate, 280, 'Fallback de dailyRate deve ser 280');
      assert.strictEqual(result.reservation.totalAmount, 280, 'Fallback de totalAmount deve ser 280');
      assert.ok(Array.isArray(result.reservation.dailyRates));
      assert.strictEqual(result.reservation.dailyRates.length, 1);
      assert.strictEqual(result.reservation.dailyRates[0].date, '2026-11-15');
      assert.strictEqual(result.reservation.dailyRates[0].rate, 280);
    });

    it('2.4 parseB2bVoucherText: Resiliência contra payloads nulos, HTML puro, texto aleatório e datas invertidas', () => {
      // Payload vazio / nulo
      assert.doesNotThrow(() => {
        const pNull = parseB2bVoucherText(null);
        assert.ok(pNull && typeof pNull === 'object');
        assert.strictEqual(pNull.nights, 1);

        const pEmpty = parseB2bVoucherText('');
        assert.ok(pEmpty && typeof pEmpty === 'object');
        assert.strictEqual(pEmpty.nights, 1);
      });

      // HTML de erro 502 / SPAM
      const spamText = `
        <!DOCTYPE html>
        <html><head><title>502 Bad Gateway</title></head>
        <body><center><h1>502 Bad Gateway</h1></center>
        <p>The server encountered a temporary error and could not complete your request.</p>
        </body></html>
      `;
      assert.doesNotThrow(() => {
        const pSpam = parseB2bVoucherText(spamText);
        assert.strictEqual(pSpam.b2bReservationNumber, '');
        assert.strictEqual(pSpam.guestName, '');
        assert.strictEqual(pSpam.checkinDate, '');
      });

      // Datas invertidas (Check-in 28/10 e Check-out 26/10)
      const invertedDatesText = `
        Confirmação de Reserva: 25099999
        Hóspede: Invertido da Silva
        Check-in: 28/10/2026
        Check-out: 26/10/2026
        Diária: R$ 280,00
      `;
      assert.doesNotThrow(() => {
        const pInverted = parseB2bVoucherText(invertedDatesText);
        // dateNights será negativo (-2), o sistema não deve aceitar noites negativas
        assert.ok(pInverted.nights >= 1, 'Noites não podem ser negativas ou zero');
      });

      // Zeros literais
      const zerosText = `
        Confirmação de Reserva: 25099998
        Hóspede: Teste Zeros
        Check-in: 26/10/2026
        Diárias: 0
        Valor Total: R$ 0,00
        Tarifa Diária: R$ 0,00
      `;
      assert.doesNotThrow(() => {
        const pZeros = parseB2bVoucherText(zerosText);
        assert.strictEqual(pZeros.nights, 1, 'Deve usar fallback mínimo de 1 noite quando diárias for 0');
        assert.strictEqual(pZeros.checkoutDate, '2026-10-27');
      });
    });
  });

});
