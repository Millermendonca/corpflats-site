/**
 * Adversarial Stress Test Suite: Milestone 3 - B2B Autonomous Cancellation & Intent/Lookup
 * File: tests/adversarial-b2b-cancellation.test.mjs
 *
 * Adversarial Stress Tests:
 * 1. Voucher confirmations with aggressive cancellation penalties & policy wording
 * 2. Real cancellations disguised as Replies (Re:, RES:) or Forwards (Fwd:, ENC:) to confirmation emails
 * 3. Ambiguous emails matching multiple active reservations (MULTIPLE_MATCHES)
 * 4. Cancellation emails with no matching reservation in DB (RESERVATION_NOT_FOUND)
 * 5. Lexical collisions in RLOC regex ("localizado" -> "ALIZADO") matching unrelated notes
 * 6. Operational Safety Invariant CHECKED_IN_CANCELLATION (in_house, checked_in, checkedInAt, actualCheckinTime)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectB2bEmailIntent,
  extractCancellationData,
  matchReservationForCancellation,
  executeAutonomousB2bCancellation
} from '../artifacts/api-server/b2b-cancellation-service.mjs';

function createMockDatabase() {
  return {
    settings: {
      adminWhatsApp: '5522997124021',
      hotelName: 'CorpFlats Soho'
    },
    flats: [
      { id: 1, number: '113', name: 'Flat 113', status: 'ocupado', active: true },
      { id: 2, number: '205', name: 'Flat 205', status: 'ocupado', active: true },
      { id: 3, number: '302', name: 'Flat 302', status: 'ocupado', active: true }
    ],
    reservations: [
      {
        id: 101,
        code: 'B2B-25055349',
        b2bReservationNumber: '25055349',
        flatNumber: '113',
        guestName: 'Carlos Pires Hage',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-28',
        status: 'confirmada',
        notes: 'Reserva B2B normal',
        auditLogs: []
      },
      {
        id: 102,
        code: 'RES-205',
        b2bReservationNumber: '88776655',
        b2bLocatorRloc: 'RLOC-AZUL01',
        flatNumber: '205',
        guestName: 'Mariana Mendonça Ferreira',
        checkinDate: '2026-11-15',
        checkoutDate: '2026-11-18',
        status: 'confirmada',
        notes: 'Flat bem localizado e silencioso',
        auditLogs: []
      },
      {
        id: 103,
        code: 'RES-302',
        b2bReservationNumber: '99112233',
        flatNumber: '302',
        guestName: 'Roberto Alves de Souza',
        checkinDate: '2026-11-04',
        checkoutDate: '2026-11-08',
        status: 'in_house',
        checkedInAt: '2026-11-04T15:20:00.000Z',
        auditLogs: []
      }
    ],
    cleaningRequests: [],
    breakfastOrders: [],
    tasks: [],
    deletedB2bSeeds: [],
    auditLogs: [],
    notifications: []
  };
}

describe('Adversarial M3.1: Intent Detection & 4-Tier Matching Stress Test', () => {

  describe('Suite 1: Voucher Emails with Cancellation Policy Phrases (False Positives)', () => {

    it('1.1 Voucher with "Voucher de Hospedagem" subject and policy text in body must NOT be isCancellation', () => {
      const email = {
        subject: 'Voucher de Hospedagem - 25055349 - Carlos Pires Hage',
        text: 'Segue anexo voucher da reserva. A política de cancelamento da reserva estabelece que cancelamentos até 24h são gratuitos.',
        from: 'reservas@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(email);
      // Adversarial check: A voucher confirmation must NOT be flagged as cancellation
      assert.equal(intent.isCancellation, false, 'Voucher with policy in body must NOT be isCancellation');
      assert.equal(intent.isVoucher, true, 'Must be identified as voucher');
    });

    it('1.2 Voucher with "Novo Voucher" subject and "O cancelamento da reserva" must NOT be isCancellation', () => {
      const email = {
        subject: 'Novo Voucher - Reserva B2B-25055349',
        text: 'Voucher atualizado. Regras: O cancelamento da reserva pode ser feito sem custos até 48h antes.',
        from: 'reservas@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(email);
      assert.equal(intent.isCancellation, false, 'Novo voucher must NOT be isCancellation');
      assert.equal(intent.isVoucher, true, 'Must be identified as voucher');
    });

    it('1.3 Execution safety: executeAutonomousB2bCancellation must NOT cancel a reservation on voucher email', async () => {
      const db = createMockDatabase();
      const voucherEmail = {
        subject: 'VOUCHER DE HOSPEDAGEM - B2B-25055349 - Carlos Hage',
        text: 'Segue em anexo voucher. Em caso de cancelamento da reserva, entrar em contato.',
        from: 'reservas@opusviagens.com.br'
      };

      const res = await executeAutonomousB2bCancellation(db, voucherEmail, {
        sendZapiMessage: async () => ({ success: true })
      });

      assert.equal(res.cancelled, false, 'Must NOT cancel reservation on voucher email');
      const r101 = db.reservations.find(r => r.id === 101);
      assert.equal(r101.status, 'confirmada', 'Reservation status must remain confirmada');
    });

  });

  describe('Suite 2: Real Cancellations disguised as Replies/Forwards to Confirmation Emails (False Negatives)', () => {

    it('2.1 Reply to confirmation email (Re: Confirmação de Reserva) with cancel request must be isCancellation', () => {
      const replyEmail = {
        subject: 'Re: Confirmação de Reserva - B2B-25055349',
        text: 'Bom dia. Solicitamos o cancelamento da reserva pois o evento foi cancelado pelo cliente.',
        from: 'reservas@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(replyEmail);
      assert.equal(intent.isCancellation, true, 'Reply with cancel request must be isCancellation: true');
      assert.equal(intent.isVoucher, false, 'Must not be classified as voucher');
    });

    it('2.2 Forward of confirmation email (Fwd: Confirmação de Reserva) with cancel command must be isCancellation', () => {
      const fwdEmail = {
        subject: 'Fwd: Confirmação de Reserva - 25055349',
        text: 'Prezados, favor cancelar esta reserva urgentemente.',
        from: 'reservas@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(fwdEmail);
      assert.equal(intent.isCancellation, true, 'Forward with cancel command must be isCancellation: true');
      assert.equal(intent.isVoucher, false, 'Must not be classified as voucher');
    });

    it('2.3 Brazilian Portuguese prefix (RES: Confirmação de Reserva) with cancel request must be isCancellation', () => {
      const resEmail = {
        subject: 'RES: Confirmação de Reserva - 25055349',
        text: 'Favor proceder com o cancelamento da reserva do Carlos Pires Hage.',
        from: 'reservas@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(resEmail);
      assert.equal(intent.isCancellation, true, 'RES: prefix with cancel request must be isCancellation: true');
    });

  });

  describe('Suite 3: Lexical Collisions in RLOC Regex & Notes Substring Matching', () => {

    it('3.1 Regex should not extract "ALIZADO" as RLOC from Portuguese word "localizado"', () => {
      const text = 'Favor cancelar a reserva do hóspede Carlos Hage no flat localizado no segundo andar.';
      const extracted = extractCancellationData({ text });
      assert.notEqual(extracted.rloc, 'ALIZADO', 'Must not extract ALIZADO as RLOC from word localizado');
    });

    it('3.2 matchReservationForCancellation must NOT match unrelated reservation having "localizado" in notes', () => {
      const db = createMockDatabase();
      // Reservation 102 has notes: "Flat bem localizado e silencioso"
      const cancelData = {
        text: 'Prezados, favor cancelar a reserva pois o hóspede esta localizado em outro estado.'
      };
      const match = matchReservationForCancellation(db, cancelData);
      assert.equal(match.matched, false, 'Must NOT match reservation 102 based on "localizado" in notes');
    });

  });

  describe('Suite 4: Ambiguous Emails Matching Multiple Reservations (MULTIPLE_MATCHES)', () => {

    it('4.1 Multiple active reservations with same B2B number must not cancel blindly', async () => {
      const db = createMockDatabase();
      // Add second active reservation with same B2B number (multi-room booking)
      db.reservations.push({
        id: 105,
        code: 'B2B-25055349-2',
        b2bReservationNumber: '25055349',
        flatNumber: '114',
        guestName: 'Assistente do Carlos Hage',
        status: 'confirmada'
      });

      const emailData = {
        subject: 'Cancelamento B2B-25055349',
        text: 'Favor cancelar reserva B2B-25055349.'
      };

      const res = await executeAutonomousB2bCancellation(db, emailData, {
        sendZapiMessage: async () => ({ success: true })
      });

      assert.equal(res.success, false);
      assert.equal(res.cancelled, false);
      assert.equal(res.blockedReason, 'MULTIPLE_MATCHES');
      assert.equal(db.reservations.find(r => r.id === 101).status, 'confirmada');
      assert.equal(db.reservations.find(r => r.id === 105).status, 'confirmada');
    });

  });

  describe('Suite 5: Emails with No Match in DB (RESERVATION_NOT_FOUND)', () => {

    it('5.1 Unmatched cancellation email must trigger RESERVATION_NOT_FOUND and notify manager', async () => {
      const db = createMockDatabase();
      let capturedAlert = null;

      const emailData = {
        subject: 'Cancelamento de Reserva - 99999999 - Fantasma',
        text: 'Favor cancelar reserva 99999999 do hóspede Fantasma.',
        from: 'agencia@teste.com'
      };

      const res = await executeAutonomousB2bCancellation(db, emailData, {
        sendZapiMessage: async (phone, msg) => {
          capturedAlert = { phone, msg };
          return { success: true };
        }
      });

      assert.equal(res.success, false);
      assert.equal(res.cancelled, false);
      assert.equal(res.blockedReason, 'RESERVATION_NOT_FOUND');
      assert.equal(res.alertSent, true);

      // Verify audit log
      const audit = db.auditLogs.find(l => l.action === 'B2B_CANCELLATION_RESERVATION_NOT_FOUND');
      assert.ok(audit, 'Audit log B2B_CANCELLATION_RESERVATION_NOT_FOUND must exist');

      // Verify alert routed to manager (5522998505276), never hotel's own Z-API bot (5522997124021)
      assert.ok(capturedAlert, 'WhatsApp alert must be sent');
      assert.equal(capturedAlert.phone, '5522998505276');
      assert.ok(capturedAlert.msg.includes('SEM CORRESPONDÊNCIA'));
    });

  });

  describe('Suite 6: Operational Invariant CHECKED_IN_CANCELLATION', () => {

    it('6.1 Must strictly block cancellation when guest has checkedInAt or in_house', async () => {
      const db = createMockDatabase();
      let capturedAlert = null;

      const emailData = {
        subject: 'Cancelamento de Reserva - 99112233 - Roberto Alves',
        text: 'Favor cancelar reserva 99112233 do Roberto Alves.',
        from: 'operacoes@flytour.com.br'
      };

      const res = await executeAutonomousB2bCancellation(db, emailData, {
        sendZapiMessage: async (phone, msg) => {
          capturedAlert = { phone, msg };
          return { success: true };
        }
      });

      assert.equal(res.cancelled, false);
      assert.equal(res.blockedReason, 'CHECKED_IN_CANCELLATION');

      const r103 = db.reservations.find(r => r.id === 103);
      assert.equal(r103.status, 'in_house', 'Status must remain in_house');

      assert.ok(capturedAlert);
      assert.ok(capturedAlert.msg.includes('ALERTA URGENTE: TENTATIVA DE CANCELAMENTO BLOQUEADA'));
      assert.ok(capturedAlert.msg.includes('Flat 302'));
    });

  });

});
