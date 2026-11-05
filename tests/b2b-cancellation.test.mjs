/**
 * Test Suite: M3 - Cancelamento Autônomo B2B & Notificação ao Gestor
 * File: tests/b2b-cancellation.test.mjs
 *
 * Requirements covered (R3 / M3):
 * - F12_DETECCAO_EMAIL_CANCELAMENTO: Detecção precisa de intenção de cancelamento vs voucher de confirmação
 * - F13_CASAMENTO_RESERVA_CANCELAMENTO: Localização determinística em 4 camadas (B2B num, RLOC, PMS code, heurística)
 * - F14_TRAVA_SEGURANCA_CHECKED_IN: Invariante operacional CHECKED_IN_CANCELLATION
 * - F15_CASCATA_CANCELAMENTO_PMS: Cascata canônica do PMS (demo-server.mjs:37170-37328), governança, café e seeds
 * - F16_AUDITORIA_NOTIFICACAO_GESTOR: Auditoria dupla (reserva + global) e alerta WhatsApp Z-API ao gestor (5522997124021)
 * - Integração Zoho Mail: Execução transparente via webhook e sincronização de mensagens
 * - Twin-Server Parity: 100% paridade SHA-256 entre artifacts/api-server e scripts/
 *
 * AGENTS.md Compliance:
 * Strictly isolated test execution. Run ONLY via:
 *   node tests/b2b-cancellation.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  detectB2bEmailIntent,
  extractCancellationData,
  matchReservationForCancellation,
  formatCancellationManagerAlert,
  formatBlockedCancellationAlert,
  executeAutonomousB2bCancellation
} from '../artifacts/api-server/b2b-cancellation-service.mjs';

import {
  handleZohoIncomingWebhook,
  syncZohoMessagesToCache
} from '../artifacts/api-server/zoho-mail-service.mjs';

function computeSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createMockDatabase() {
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
      { id: 1, number: '113', name: 'Flat 113', status: 'ocupado', active: true },
      { id: 2, number: '205', name: 'Flat 205', status: 'ocupado', active: true },
      { id: 3, number: '302', name: 'Flat 302', status: 'ocupado', active: true },
      { id: 4, number: '410', name: 'Flat 410', status: 'ocupado', active: true }
    ],
    reservations: [
      {
        id: 101,
        code: 'B2B-25055349',
        reservationCode: 'B2B-25055349',
        b2bReservationNumber: '25055349',
        b2bLocatorRloc: 'LOC-OPUS99',
        flatId: 1,
        flatNumber: '113',
        guestName: 'Carlos Pires Hage',
        guestEmail: 'carlos.hage@lactalis.com.br',
        guestPhone: '5511988887777',
        checkinDate: '2026-10-26',
        checkoutDate: '2026-10-28',
        status: 'confirmada',
        channel: 'b2b',
        agencyName: 'Opus Viagens e Eventos Ltda',
        companyName: 'Lactalis do Brasil',
        dailyRate: 280.0,
        nights: 2,
        totalAmount: 560.0,
        calendarSequence: 1,
        auditLogs: []
      },
      {
        id: 102,
        code: 'RES-205',
        reservationCode: 'RES-205',
        b2bReservationNumber: '88776655',
        b2bLocatorRloc: 'RLOC-AZUL01',
        flatId: 2,
        flatNumber: '205',
        guestName: 'Mariana Mendonça Ferreira',
        checkinDate: '2026-11-15',
        checkoutDate: '2026-11-18',
        status: 'confirmada',
        channel: 'b2b',
        agencyName: 'CVC Corporativo',
        dailyRate: 310.0,
        nights: 3,
        totalAmount: 930.0,
        calendarSequence: 1,
        auditLogs: []
      },
      {
        id: 103,
        code: 'RES-302',
        reservationCode: 'RES-302',
        b2bReservationNumber: '99112233',
        b2bLocatorRloc: 'RLOC-CHECKED',
        flatId: 3,
        flatNumber: '302',
        guestName: 'Roberto Alves de Souza',
        checkinDate: '2026-11-04',
        checkoutDate: '2026-11-08',
        status: 'in_house',
        checkedInAt: '2026-11-04T15:20:00.000Z',
        channel: 'b2b',
        agencyName: 'Flytour Business Travel',
        dailyRate: 290.0,
        nights: 4,
        totalAmount: 1160.0,
        calendarSequence: 2,
        auditLogs: []
      },
      {
        id: 104,
        code: 'RES-410',
        reservationCode: 'RES-410',
        b2bReservationNumber: '',
        b2bLocatorRloc: '',
        flatId: 4,
        flatNumber: '410',
        guestName: 'Juliana Beatriz Silveira',
        checkinDate: '2026-12-01',
        checkoutDate: '2026-12-03',
        status: 'confirmada',
        channel: 'b2b',
        agencyName: 'B2B Reservas',
        dailyRate: 300.0,
        nights: 2,
        totalAmount: 600.0,
        calendarSequence: 1,
        auditLogs: []
      }
    ],
    cleaningRequests: [
      {
        id: 501,
        flatId: 1,
        flatNumber: '113',
        requestDate: '2026-10-26',
        source: 'checkin',
        status: 'pending',
        arrivingGuest: 'Carlos Pires Hage',
        autoReservationCode: 'B2B-25055349',
        autoReservationId: 101,
        twinBeds: true,
        extraMattress: false
      },
      {
        id: 502,
        flatId: 1,
        flatNumber: '113',
        requestDate: '2026-10-28',
        source: 'checkout',
        status: 'pending',
        isDeleted: false
      }
    ],
    breakfastOrders: [
      {
        id: 601,
        reservationCode: 'B2B-25055349',
        reservationId: 101,
        roomNumber: '113',
        date: '2026-10-27',
        status: 'confirmed'
      }
    ],
    tasks: [
      {
        id: 701,
        reservationId: 101,
        reservationCode: 'B2B-25055349',
        title: 'Preparar berço no Flat 113',
        status: 'pending'
      }
    ],
    deletedB2bSeeds: [],
    auditLogs: [],
    notifications: [],
    zohoMessagesCache: []
  };
}

describe('M3: Cancelamento Autônomo B2B & Notificação ao Gestor', () => {

  describe('1. Detecção Precisa de Intenção de Cancelamento (F12)', () => {

    it('1.1 Deve identificar cancelamento explícito no assunto em português', () => {
      const email = {
        subject: 'Cancelamento de Reserva - 25055349 - Carlos Pires Hage',
        text: 'Prezados, confirmamos o cancelamento da reserva 25055349 do hóspede Carlos Pires Hage.',
        from: 'reservas@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(email);
      assert.equal(intent.isCancellation, true);
      assert.equal(intent.isVoucher, false);
      assert.ok(intent.confidence >= 0.9);
      assert.ok(intent.cancellationKeywords.includes('cancelamento'));
    });

    it('1.2 Deve identificar cancelamento em inglês no assunto e no corpo', () => {
      const email = {
        subject: 'Booking Cancellation - RLOC AZUL01',
        text: 'Please be advised that the reservation for Mariana Mendonca has been cancelled by the guest.',
        from: 'corporate@booking-partner.com'
      };
      const intent = detectB2bEmailIntent(email);
      assert.equal(intent.isCancellation, true);
      assert.equal(intent.isVoucher, false);
      assert.ok(intent.confidence >= 0.9);
      assert.ok(intent.cancellationKeywords.includes('cancellation') || intent.cancellationKeywords.includes('cancelled'));
    });

    it('1.3 Deve identificar solicitação de cancelamento no corpo quando assunto for genérico', () => {
      const email = {
        subject: 'Solicitação urgente ref. hóspede Carlos Pires Hage',
        text: 'Bom dia. Por motivos corporativos, solicitamos o cancelamento da reserva B2B-25055349 com entrada prevista para 26/10/2026.',
        from: 'atendimento@opusviagens.com.br'
      };
      const intent = detectB2bEmailIntent(email);
      assert.equal(intent.isCancellation, true);
      assert.equal(intent.isVoucher, false);
      assert.ok(intent.confidence >= 0.85);
    });

    it('1.4 NÃO deve classificar voucher de confirmação como cancelamento mesmo citando política de cancelamento', () => {
      const voucherEmail = {
        subject: 'Confirmação de Reserva - B2B-25055349',
        text: 'Prezado hotel, segue voucher de confirmação. Política de cancelamento: cancelamento gratuito até 24 horas antes do check-in. Multa de cancelamento após esse prazo.',
        from: 'confirmacao@b2breservas.com.br'
      };
      const intent = detectB2bEmailIntent(voucherEmail);
      assert.equal(intent.isCancellation, false);
      assert.equal(intent.isVoucher, true);
      assert.equal(intent.cancellationKeywords.length, 0);
    });

    it('1.5 Deve retornar falso para newsletters, e-mails promocionais ou comunicados sem relação', () => {
      const spamEmail = {
        subject: 'Novidades no Portal B2B - Tarifas de Temporada',
        text: 'Confira as melhores oportunidades de hospedagem para a alta temporada corporativa em Macaé.',
        from: 'marketing@b2breservas.com.br'
      };
      const intent = detectB2bEmailIntent(spamEmail);
      assert.equal(intent.isCancellation, false);
      assert.equal(intent.isVoucher, false);
      assert.equal(intent.confidence, 0);
    });

  });

  describe('2. Localização Determinística em 4 Camadas (F13)', () => {

    it('2.1 Tier 1: Deve localizar reserva por número B2B (b2bReservationNumber)', () => {
      const db = createMockDatabase();
      const match = matchReservationForCancellation(db, {
        b2bReservationNumber: '25055349'
      });
      assert.equal(match.matched, true);
      assert.equal(match.matchedBy, 'b2b_number');
      assert.equal(match.reservation.id, 101);
      assert.equal(match.reservation.code, 'B2B-25055349');
    });

    it('2.2 Tier 2: Deve localizar reserva por Localizador / RLOC', () => {
      const db = createMockDatabase();
      const match = matchReservationForCancellation(db, {
        rloc: 'RLOC-AZUL01'
      });
      assert.equal(match.matched, true);
      assert.equal(match.matchedBy, 'rloc');
      assert.equal(match.reservation.id, 102);
      assert.equal(match.reservation.flatNumber, '205');
    });

    it('2.3 Tier 3: Deve localizar reserva por Código PMS (id ou code)', () => {
      const db = createMockDatabase();
      const match = matchReservationForCancellation(db, {
        pmsCode: 'RES-205'
      });
      assert.equal(match.matched, true);
      assert.equal(match.matchedBy, 'pms_code');
      assert.equal(match.reservation.id, 102);
    });

    it('2.4 Tier 4: Deve localizar reserva por Heurística (Tokens do Hóspede + Check-in)', () => {
      const db = createMockDatabase();
      // Reserva 104 não tem número B2B nem RLOC nos metadados de busca
      const match = matchReservationForCancellation(db, {
        guestName: 'Sra. Juliana Silveira',
        checkinDate: '2026-12-01'
      });
      assert.equal(match.matched, true);
      assert.equal(match.matchedBy, 'heuristic');
      assert.equal(match.reservation.id, 104);
      assert.equal(match.reservation.guestName, 'Juliana Beatriz Silveira');
    });

    it('2.5 Deve retornar matched: false quando a reserva não existir no sistema', () => {
      const db = createMockDatabase();
      const match = matchReservationForCancellation(db, {
        b2bReservationNumber: '99999999',
        guestName: 'Hóspede Inexistente',
        checkinDate: '2026-05-10'
      });
      assert.equal(match.matched, false);
      assert.equal(match.candidatesCount, 0);
    });

    it('2.6 Deve detectar ambiguidade quando múltiplos candidatos forem encontrados sem critério de desempate', () => {
      const db = createMockDatabase();
      // Adiciona duplicata proposital com mesmo checkin e nome
      db.reservations.push({
        id: 999,
        code: 'RES-DUP',
        guestName: 'Juliana Beatriz Silveira',
        checkinDate: '2026-12-01',
        status: 'confirmada'
      });
      const match = matchReservationForCancellation(db, {
        guestName: 'Juliana Beatriz Silveira',
        checkinDate: '2026-12-01'
      });
      assert.equal(match.matched, false);
      assert.equal(match.candidatesCount, 2);
    });

  });

  describe('3. Invariante de Segurança CHECKED_IN_CANCELLATION (F14)', () => {

    it('3.1 Deve bloquear cancelamento autônomo se o hóspede já estiver hospedado (in_house / checkedInAt)', async () => {
      const db = createMockDatabase();
      let capturedWhatsAppAlert = null;

      const emailData = {
        subject: 'Cancelamento de Reserva - 99112233 - Roberto Alves',
        text: 'Favor cancelar a reserva 99112233 referente ao hóspede Roberto Alves de Souza.',
        from: 'operacoes@flytour.com.br'
      };

      const result = await executeAutonomousB2bCancellation(db, emailData, {
        sendZapiMessage: async (phone, msg) => {
          capturedWhatsAppAlert = { phone, msg };
          return { success: true };
        }
      });

      // Validações da trava
      assert.equal(result.success, false);
      assert.equal(result.cancelled, false);
      assert.equal(result.blockedReason, 'CHECKED_IN_CANCELLATION');
      assert.equal(result.reservationCode, 'RES-302');
      assert.equal(result.alertSent, true);

      // Status da reserva deve permanecer in_house intocado
      const res302 = db.reservations.find(r => r.id === 103);
      assert.equal(res302.status, 'in_house');

      // Auditoria na reserva deve registrar a tentativa bloqueada
      assert.ok(res302.auditLogs.length > 0);
      assert.equal(res302.auditLogs[0].action, 'cancellation_blocked');

      // Auditoria global deve registrar o bloqueio
      const globalLog = db.auditLogs.find(l => l.action === 'RESERVATION_CANCELLATION_BLOCKED_CHECKED_IN');
      assert.ok(globalLog);
      assert.equal(globalLog.level, 'danger');
      assert.equal(globalLog.details.flatNumber, '302');

      // Notificação de perigo criada na central
      const notif = db.notifications.find(n => n.metadata?.blockedReason === 'CHECKED_IN_CANCELLATION');
      assert.ok(notif);
      assert.equal(notif.severity, 'danger');

      // Alerta urgente disparado ao WhatsApp do gestor 5522997124021
      assert.ok(capturedWhatsAppAlert);
      assert.equal(capturedWhatsAppAlert.phone, '5522997124021');
      assert.ok(capturedWhatsAppAlert.msg.includes('ALERTA URGENTE: TENTATIVA DE CANCELAMENTO BLOQUEADA'));
      assert.ok(capturedWhatsAppAlert.msg.includes('Flat 302'));
    });

  });

  describe('4. Cascata Canônica de Cancelamento PMS (F15)', () => {

    it('4.1 Deve aplicar a cascata completa: status cancelada, desocupação, governança e café', async () => {
      const db = createMockDatabase();
      let ariSyncCalled = false;

      const emailData = {
        subject: 'Cancelamento de Reserva - 25055349 - Carlos Pires Hage',
        text: 'Prezados, confirmamos o cancelamento da reserva B2B-25055349 do hóspede Carlos Pires Hage.',
        from: 'reservas@opusviagens.com.br'
      };

      const result = await executeAutonomousB2bCancellation(db, emailData, {
        sendZapiMessage: async () => ({ success: true }),
        syncAriForReservation: async (r) => {
          if (r.id === 101) ariSyncCalled = true;
        }
      });

      assert.equal(result.success, true);
      assert.equal(result.cancelled, true);
      assert.equal(result.matchedBy, 'b2b_number');

      // 1. Status da reserva atualizado
      const r101 = db.reservations.find(r => r.id === 101);
      assert.equal(r101.status, 'cancelada');
      assert.ok(r101.cancelledAt);
      assert.ok(r101.cancellationReason);
      assert.equal(r101.calendarSequence, 2);

      // 2. deletedB2bSeeds registrado
      assert.ok(db.deletedB2bSeeds.includes('25055349'));
      assert.ok(db.deletedB2bSeeds.includes('B2B-25055349'));

      // 3. Governança: Limpeza de check-in higienizada
      const checkinClean = db.cleaningRequests.find(c => c.id === 501);
      assert.equal(checkinClean.arrivingGuest, null);
      assert.equal(checkinClean.autoReservationCode, null);
      assert.equal(checkinClean.twinBeds, false);

      // 4. Governança: Limpeza de check-out descartada automaticamente (sem outro check-out no dia)
      const checkoutClean = db.cleaningRequests.find(c => c.id === 502);
      assert.equal(checkoutClean.isDeleted, true);
      assert.equal(checkoutClean.status, 'deleted');
      assert.equal(checkoutClean.deletedBy, 'reservation_cancelled');
      assert.equal(checkoutClean.deletedReservationId, 101);

      // 5. Café da manhã vinculado cancelado
      const breakfast = db.breakfastOrders.find(b => b.id === 601);
      assert.equal(breakfast.status, 'cancelled');

      // 6. Tarefas vinculadas canceladas
      const task = db.tasks.find(t => t.id === 701);
      assert.equal(task.status, 'cancelled');

      // 7. ARI sync invocado
      assert.equal(ariSyncCalled, true);
    });

  });

  describe('5. Auditoria Dupla e Alerta WhatsApp Z-API ao Gestor (F16)', () => {

    it('5.1 Deve gravar auditoria na reserva, auditoria global e disparar WhatsApp para 5522997124021', async () => {
      const db = createMockDatabase();
      let sentWhatsApp = null;

      const emailData = {
        subject: 'Cancelamento - RLOC RLOC-AZUL01',
        text: 'Solicitamos o cancelamento da estadia da passageira Mariana Mendonca. Motivo: evento corporativo transferido.',
        from: 'corporativo@cvc.com.br'
      };

      const result = await executeAutonomousB2bCancellation(db, emailData, {
        sendZapiMessage: async (phone, msg, opts) => {
          sentWhatsApp = { phone, msg, opts };
          return { success: true };
        }
      });

      assert.equal(result.success, true);
      assert.equal(result.cancelled, true);
      assert.equal(result.matchedBy, 'rloc');

      const r102 = db.reservations.find(r => r.id === 102);

      // 1. Auditoria na reserva
      assert.ok(r102.auditLogs.length > 0);
      const resAudit = r102.auditLogs[0];
      assert.equal(resAudit.action, 'cancelled');
      assert.equal(resAudit.actor.name, 'Sistema Autônomo B2B');
      assert.equal(resAudit.changes[0].field, 'status');
      assert.equal(resAudit.changes[0].newValue, 'cancelada');

      // 2. Auditoria global
      const globalAudit = db.auditLogs.find(l => l.action === 'RESERVATION_CANCELLED_B2B_AUTONOMOUS');
      assert.ok(globalAudit);
      assert.equal(globalAudit.category, 'reservation');
      assert.equal(globalAudit.details.reservationId, 102);
      assert.equal(globalAudit.details.flatNumber, '205');
      assert.equal(globalAudit.details.guestName, 'Mariana Mendonça Ferreira');
      assert.equal(globalAudit.details.matchedBy, 'rloc');

      // 3. Central de Notificações
      const notif = db.notifications.find(n => n.metadata?.reservationId === 102);
      assert.ok(notif);
      assert.equal(notif.severity, 'warning');
      assert.ok(notif.message.includes('Flat 205'));

      // 4. Alerta WhatsApp ao Gestor
      assert.ok(sentWhatsApp);
      assert.equal(sentWhatsApp.phone, '5522997124021');
      assert.ok(sentWhatsApp.msg.includes('CANCELAMENTO AUTÔNOMO B2B PROCESSADO'));
      assert.ok(sentWhatsApp.msg.includes('*Flat:* 205'));
      assert.ok(sentWhatsApp.msg.includes('Mariana Mendonça Ferreira'));
      assert.ok(sentWhatsApp.msg.includes('RLOC-AZUL01'));
      assert.ok(sentWhatsApp.msg.includes('Quarto e escala de governança foram liberados'));
    });

  });

  describe('6. Integração com Webhook e Sincronização do Zoho Mail', () => {

    it('6.1 handleZohoIncomingWebhook deve cancelar reserva autônoma quando receber e-mail de cancelamento', async () => {
      const db = createMockDatabase();
      const webhookPayload = {
        subject: 'Cancelamento de Reserva - 25055349 - Carlos Pires Hage',
        fromAddress: 'reservas@opusviagens.com.br',
        summary: 'Confirmamos o cancelamento da reserva 25055349.',
        content: '<p>Confirmamos o cancelamento da reserva B2B-25055349 do hóspede Carlos Pires Hage.</p>'
      };

      const res = await handleZohoIncomingWebhook(db, () => {}, webhookPayload);
      assert.equal(res.ok, true);
      assert.equal(res.directCancelled, true);
      assert.equal(res.directCancelledReservation, 'B2B-25055349');

      const r101 = db.reservations.find(r => r.id === 101);
      assert.equal(r101.status, 'cancelada');
    });

  });

  describe('7. Verificação de Paridade Twin-Server SHA-256 (Regra AGENTS.md)', () => {

    it('7.1 b2b-cancellation-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/b2b-cancellation-service.mjs');
      const scrPath = path.resolve('scripts/b2b-cancellation-service.mjs');
      assert.ok(fs.existsSync(artPath), 'Arquivo em artifacts deve existir');
      assert.ok(fs.existsSync(scrPath), 'Arquivo em scripts deve existir');

      const artHash = computeSha256(artPath);
      const scrHash = computeSha256(scrPath);
      assert.equal(artHash, scrHash, 'Hashes SHA-256 devem ser estritamente idênticos');
    });

    it('7.2 zoho-mail-service.mjs deve manter 100% de paridade SHA-256 entre artifacts e scripts', () => {
      const artPath = path.resolve('artifacts/api-server/zoho-mail-service.mjs');
      const scrPath = path.resolve('scripts/zoho-mail-service.mjs');
      assert.ok(fs.existsSync(artPath), 'Arquivo em artifacts deve existir');
      assert.ok(fs.existsSync(scrPath), 'Arquivo em scripts deve existir');

      const artHash = computeSha256(artPath);
      const scrHash = computeSha256(scrPath);
      assert.equal(artHash, scrHash, 'Hashes SHA-256 devem ser estritamente idênticos');
    });

  });

});
