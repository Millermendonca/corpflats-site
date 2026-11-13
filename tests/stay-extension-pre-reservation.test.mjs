import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  resolveWhatsAppTags,
} from '../artifacts/api-server/zapi-service.mjs';
import {
  estenderEstadiaTool,
  alterarDatasReservaTool,
} from '../artifacts/api-server/agent-architecture.mjs';

const serverPath = path.resolve('artifacts/api-server/demo-server.mjs');
const mirrorPath = path.resolve('scripts/demo-server.mjs');
const pmsPath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');
const hoverPath = path.resolve('artifacts/limpeza/src/components/reservation-hover-card.tsx');
const portalPath = path.resolve('artifacts/limpeza/src/pages/guest-portal.tsx');

const serverSrc = fs.readFileSync(serverPath, 'utf8');
const pmsSrc = fs.readFileSync(pmsPath, 'utf8');
const hoverSrc = fs.readFileSync(hoverPath, 'utf8');
const portalSrc = fs.readFileSync(portalPath, 'utf8');

function extractFunction(src, name) {
  let start = src.indexOf(`export function ${name}(`);
  let stripExport = true;
  if (start < 0) {
    start = src.indexOf(`function ${name}(`);
    stripExport = false;
  }
  assert.ok(start >= 0, `função ${name} não encontrada em demo-server.mjs`);
  const headerEnd = src.indexOf(') {', start);
  assert.ok(headerEnd > start, `assinatura da função ${name} inválida`);
  let i = headerEnd + 2;
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const raw = src.substring(start, i + 1);
  return stripExport ? raw.replace(/^export\s+/, '') : raw;
}

function buildHoldEngine(customTriggerFn = null) {
  const code = [
    `const db = { reservations: [] };`,
    `const saveDatabase = () => {};`,
    `const computeCardAmountFromPix = (v) => Math.round((Number(v || 0) / 0.95) * 100) / 100;`,
    `const addReservationAuditLog = (r, entry) => { if (!Array.isArray(r.auditLogs)) r.auditLogs = []; r.auditLogs.push(entry); };`,
    `const notifyPmsMutation = () => {};`,
    `const triggerImmediateWhatsApp = customTriggerFn || (async () => {});`,
    extractFunction(serverSrc, 'computePreReservationReminderSchedule'),
    extractFunction(serverSrc, 'resolvePreReservationHold'),
    extractFunction(serverSrc, 'resolveStayExtensionHold'),
    extractFunction(serverSrc, 'rollbackExpiredOrCancelledStayExtension'),
    extractFunction(serverSrc, 'sweepExpiredPreReservations'),
    `return { computePreReservationReminderSchedule, resolvePreReservationHold, resolveStayExtensionHold, rollbackExpiredOrCancelledStayExtension, sweepExpiredPreReservations };`,
  ].join('\n');
  return new Function('customTriggerFn', code)(customTriggerFn);
}

describe('Pré-Reserva de Diária Extra (Extensão Aguardando Pagamento)', () => {
  it('1. Paridade twin-server e cálculo inteligente de prazo padrão (resolveStayExtensionHold)', () => {
    assert.strictEqual(
      fs.readFileSync(serverPath).equals(fs.readFileSync(mirrorPath)),
      true,
      'demo-server.mjs e scripts/demo-server.mjs devem ser 100% idênticos'
    );

    const { resolveStayExtensionHold } = buildHoldEngine();
    globalThis.resolveStayExtensionHold = resolveStayExtensionHold;

    // 1a) IA do WhatsApp -> sempre 30m
    const aiHold = resolveStayExtensionHold(
      { source: 'whatsapp_ai' },
      '2026-11-20',
      { nowOverride: '2026-11-12T11:00:00-03:00' }
    );
    assert.strictEqual(aiHold.holdPreset, '30m');
    assert.strictEqual(aiHold.holdDurationMinutes, 30);
    assert.strictEqual(aiHold.reminderLeadMinutes, 10);

    // 1b) Hoje antes das 10:00h (08:30 BRT) -> 2h
    const morningHold = resolveStayExtensionHold(
      {},
      '2026-11-12',
      { nowOverride: '2026-11-12T08:30:00-03:00' }
    );
    assert.strictEqual(morningHold.holdPreset, '2h');
    assert.strictEqual(morningHold.holdDurationMinutes, 120);
    assert.strictEqual(morningHold.reminderLeadMinutes, 30);

    // 1c) Hoje após as 10:00h (14:15 BRT) -> 30m
    const afternoonHold = resolveStayExtensionHold(
      {},
      '2026-11-12',
      { nowOverride: '2026-11-12T14:15:00-03:00' }
    );
    assert.strictEqual(afternoonHold.holdPreset, '30m');
    assert.strictEqual(afternoonHold.holdDurationMinutes, 30);

    // 1d) Diária extra começando em data futura -> until_2359
    const futureHold = resolveStayExtensionHold(
      {},
      '2026-11-15',
      { nowOverride: '2026-11-12T14:15:00-03:00' }
    );
    assert.strictEqual(futureHold.holdPreset, 'until_2359');
    assert.strictEqual(futureHold.reminderLeadMinutes, 120);
  });

  it('2. Ciclo completo: lembrete antes de expirar + rollback parcial atômico sem afetar a reserva original nem FNRH', async () => {
    const firedEvents = [];
    const mockTrigger = async (_db, _save, eventName, resPayload) => {
      firedEvents.push({ eventName, resPayload: JSON.parse(JSON.stringify(resPayload)) });
    };
    const { resolveStayExtensionHold, sweepExpiredPreReservations } = buildHoldEngine(mockTrigger);

    const t0 = new Date('2026-11-12T14:00:00-03:00');
    const hold = resolveStayExtensionHold({}, '2026-11-12', { nowOverride: t0 });

    const origDailyRates = [
      { date: '2026-11-10', rate: 250, channel: 'whatsapp' },
      { date: '2026-11-11', rate: 250, channel: 'whatsapp' },
    ];
    const reservation = {
      id: 901,
      code: 'RES-901',
      flatId: 5,
      flatNumber: '501',
      guestName: 'Carlos Eduardo Teste',
      guestPhone: '5522999990000',
      guestCount: 2,
      channel: 'whatsapp',
      status: 'confirmada',
      checkinDate: '2026-11-10',
      checkoutDate: '2026-11-13',
      nights: 3,
      dailyRates: [
        ...origDailyRates,
        { date: '2026-11-12', rate: 250, channel: 'whatsapp' },
      ],
      charges: [],
      cleaningFee: 0,
      totalAmount: 750,
      paidAmount: 500,
      paymentStatus: 'sinal_pago',
      pixCopiaECola: '00020126580014BR.GOV.BCB.PIX0136teste-pix-extra',
      preCheckinCompleted: true,
      fnrhSignedAt: '2026-11-10T15:00:00.000Z',
      needsReSignature: false,
      pendingStayExtension: {
        isPreReservationHold: true,
        source: 'pms',
        status: 'pending_payment',
        amount: 250,
        extraNights: 1,
        newTotalNights: 3,
        oldCheckinDate: '2026-11-10',
        oldCheckoutDate: '2026-11-12',
        newCheckinDate: '2026-11-10',
        newCheckoutDate: '2026-11-13',
        addedDates: ['2026-11-12'],
        addedDailyRates: [{ date: '2026-11-12', rate: 250, channel: 'whatsapp' }],
        oldDailyRates: origDailyRates,
        oldCharges: [],
        oldCleaningFee: 0,
        oldTotalAmount: 500,
        oldPaidAmount: 500,
        oldPaymentStatus: 'pago_total',
        requiresDeferredReSignature: true,
        ...hold,
      },
    };

    const mockDb = {
      reservations: [reservation],
      flats: [{ id: 5, number: '501' }],
      cleaningRequests: [
        {
          id: 77,
          flatId: 5,
          flatNumber: '501',
          requestDate: '2026-11-13',
          originalRequestDateBeforeExtension: '2026-11-12',
          extensionHoldReservationId: 901,
          extensionHoldExpiresAt: hold.expiresAt,
          previousAdminNoteBeforeExtension: 'Check-out normal',
          adminNote: '⏳ Prorrogação em Pré-Reserva aguardando pagamento até 14:30',
          status: 'pending',
          source: 'checkout',
        },
      ],
      whatsappQueue: [],
    };

    // Verifica que o template inicial de cobrança pendente exibe o aviso de validade da pré-reserva da diária extra
    const tplPending = DEFAULT_WHATSAPP_TEMPLATES.find((t) => t.id === 'tpl_additional_daily_pending');
    const resolvedInitial = resolveWhatsAppTags(
      tplPending.message,
      { ...reservation, _nowOverride: t0 },
      mockDb,
      'https://corpflats.com.br',
      'requester',
      tplPending
    );
    assert.match(resolvedInitial, /Validade da Pré-Reserva da Diária Extra/);
    assert.match(resolvedInitial, /14:30/);

    // Avança +21 min (faltando 9 min -> dispara lembrete additional_daily_expiring_soon)
    const t21 = new Date(t0.getTime() + 21 * 60 * 1000);
    sweepExpiredPreReservations(mockDb, () => {}, { nowOverride: t21 });
    assert.strictEqual(firedEvents.length, 1);
    assert.strictEqual(firedEvents[0].eventName, 'additional_daily_expiring_soon');
    assert.ok(reservation.pendingStayExtension.reminderSentAt, 'reminderSentAt deve ser gravado');
    assert.strictEqual(reservation.status, 'confirmada', 'reserva ainda segue ativa antes dos 30m');

    const tplRem = DEFAULT_WHATSAPP_TEMPLATES.find((t) => t.id === 'tpl_additional_daily_expiring_soon');
    const resolvedRem = resolveWhatsAppTags(
      tplRem.message,
      firedEvents[0].resPayload,
      mockDb,
      'https://corpflats.com.br',
      'requester',
      tplRem
    );
    assert.match(resolvedRem, /Pré-Reserva de Diária Extra/);
    assert.match(resolvedRem, /10\/11\/2026 a 12\/11\/2026/);

    // Avança +31 min -> expira APENAS a diária extra e restaura a estadia original 100% paga!
    const t31 = new Date(t0.getTime() + 31 * 60 * 1000);
    const expCount = sweepExpiredPreReservations(mockDb, () => {}, { nowOverride: t31 });
    assert.strictEqual(expCount, 1);
    assert.strictEqual(firedEvents.length, 2);
    assert.strictEqual(firedEvents[1].eventName, 'additional_daily_expired');

    // Valida integridade atômica pós-rollback
    assert.strictEqual(reservation.status, 'confirmada');
    assert.strictEqual(reservation.checkinDate, '2026-11-10');
    assert.strictEqual(reservation.checkoutDate, '2026-11-12');
    assert.strictEqual(reservation.nights, 2);
    assert.strictEqual(reservation.dailyRates.length, 2);
    assert.strictEqual(reservation.totalAmount, 500);
    assert.strictEqual(reservation.paidAmount, 500);
    assert.strictEqual(reservation.paymentStatus, 'pago_total');
    assert.strictEqual(reservation.pendingStayExtension, undefined);
    assert.ok(reservation.expiredStayExtension, 'deve gravar metadado expiredStayExtension para reativação em 1 clique');
    assert.strictEqual(reservation.expiredStayExtension.extraAmount, 250);
    assert.deepStrictEqual(reservation.expiredStayExtension.addedDates, ['2026-11-12']);

    // FNRH permaneceu intacta durante e após a expiração da diária não paga
    assert.strictEqual(reservation.preCheckinCompleted, true);
    assert.strictEqual(reservation.needsReSignature, false);

    // Governança restaurada para a data original de check-out
    assert.strictEqual(mockDb.cleaningRequests[0].requestDate, '2026-11-12');
    assert.strictEqual(mockDb.cleaningRequests[0].adminNote, 'Check-out normal');
    assert.strictEqual(mockDb.cleaningRequests[0].extensionHoldExpiresAt, undefined);

    // Verifica mensagem de expiração tranquilizadora
    const tplExp = DEFAULT_WHATSAPP_TEMPLATES.find((t) => t.id === 'tpl_additional_daily_expired');
    const resolvedExp = resolveWhatsAppTags(
      tplExp.message,
      firedEvents[1].resPayload,
      mockDb,
      'https://corpflats.com.br',
      'requester',
      tplExp
    );
    assert.match(resolvedExp, /10\/11\/2026 a 12\/11\/2026/);
    assert.match(resolvedExp, /100% confirmada e garantida/);
  });

  it('3. Cancelamento manual da diária extra pendente (cancelled_by_admin) reverte sem gerar item expirado', () => {
    const { rollbackExpiredOrCancelledStayExtension } = buildHoldEngine();
    const res = {
      id: 902,
      code: 'RES-902',
      flatId: 6,
      flatNumber: '502',
      status: 'confirmada',
      checkinDate: '2026-11-10',
      checkoutDate: '2026-11-14',
      nights: 4,
      dailyRates: [
        { date: '2026-11-10', rate: 300, channel: 'booking' },
        { date: '2026-11-11', rate: 300, channel: 'booking' },
        { date: '2026-11-12', rate: 260, channel: 'whatsapp' },
        { date: '2026-11-13', rate: 260, channel: 'whatsapp' },
      ],
      totalAmount: 1120,
      paidAmount: 600,
      paymentStatus: 'sinal_pago',
      pendingStayExtension: {
        isPreReservationHold: true,
        status: 'pending_payment',
        amount: 520,
        extraNights: 2,
        oldCheckinDate: '2026-11-10',
        oldCheckoutDate: '2026-11-12',
        oldDailyRates: [
          { date: '2026-11-10', rate: 300, channel: 'booking' },
          { date: '2026-11-11', rate: 300, channel: 'booking' },
        ],
        oldCharges: [],
        oldCleaningFee: 0,
        oldTotalAmount: 600,
        oldPaidAmount: 600,
        oldPaymentStatus: 'pago_total',
        addedDates: ['2026-11-12', '2026-11-13'],
        expiresAt: '2026-11-12T23:59:59.000Z',
      },
    };
    const rb = rollbackExpiredOrCancelledStayExtension({ reservations: [res], cleaningRequests: [] }, res, {
      reason: 'cancelled_by_admin',
    });
    assert.strictEqual(rb.rolledBack, true);
    assert.strictEqual(res.checkoutDate, '2026-11-12');
    assert.strictEqual(res.totalAmount, 600);
    assert.strictEqual(res.paidAmount, 600);
    assert.strictEqual(res.paymentStatus, 'pago_total');
    assert.strictEqual(res.pendingStayExtension, undefined);
    assert.strictEqual(res.expiredStayExtension, undefined);
  });

  it('4. IA do WhatsApp (estender_estadia & alterar_datas_reserva) aplica Pré-Reserva de 30m e protege FNRH', async () => {
    const mockRes = {
      id: 903,
      code: 'RES-903',
      flatId: 7,
      flatNumber: '503',
      guestName: 'Mariana Costa',
      guestDocument: '12345678901',
      guestPhone: '5522988887777',
      guestCount: 1,
      channel: 'whatsapp',
      status: 'confirmada',
      checkinDate: '2026-11-10',
      checkoutDate: '2026-11-12',
      nights: 2,
      dailyRates: [
        { date: '2026-11-10', rate: 250, channel: 'whatsapp' },
        { date: '2026-11-11', rate: 250, channel: 'whatsapp' },
      ],
      totalAmount: 500,
      paidAmount: 500,
      paymentStatus: 'pago_total',
      preCheckinCompleted: true,
      fnrhSignedAt: '2026-11-10T14:10:00.000Z',
      needsReSignature: false,
    };
    const mockDb = {
      reservations: [mockRes],
      flats: [{ id: 7, number: '503' }],
      cleaningRequests: [
        {
          id: 88,
          flatId: 7,
          flatNumber: '503',
          requestDate: '2026-11-12',
          status: 'pending',
          source: 'checkout',
          adminNote: null,
        },
      ],
    };

    const ctx = {
      data_hora_atual: '2026-11-12T10:30:00-03:00',
      telefone_remetente: '5522988887777',
      estado_atual: 'IN_STAY_CONCIERGE',
      hospede: { id: 'h-903', nome: 'Mariana Costa' },
      reserva_ativa: {
        id: 'RES-903',
        imovel_id: '7',
        nome_imovel: 'Flat 503',
        data_checkin: '2026-11-10',
        data_checkout: '2026-11-12',
        valor_diaria: 250,
        quantidade_hospedes: 1,
        canal_reserva: 'whatsapp',
        status_pagamento: 'PAGO_INTEGRALMENTE',
      },
      runtime: {
        db: mockDb,
        saveDatabase: async () => {},
        triggerImmediateWhatsApp: async () => {},
      },
    };

    const result = await estenderEstadiaTool.execute(
      { nova_data_checkout: '2026-11-13', confirmacao_hospede: true },
      ctx
    );

    assert.strictEqual(result.status, 'SUCESSO_EXECUTADO');
    assert.ok(result.instrucao_para_ia.includes('Pré-Reserva da Diária Extra'));
    assert.ok(result.instrucao_para_ia.includes('30 minutos'));
    assert.ok(mockRes.pendingStayExtension, 'pendingStayExtension deve existir');
    assert.strictEqual(mockRes.pendingStayExtension.isPreReservationHold, true);
    assert.strictEqual(mockRes.pendingStayExtension.holdPreset, '30m');
    assert.strictEqual(mockRes.pendingStayExtension.oldCheckoutDate, '2026-11-12');
    assert.strictEqual(mockRes.pendingStayExtension.oldTotalAmount, 500);
    assert.strictEqual(mockRes.pendingStayExtension.requiresDeferredReSignature, true);
    // FNRH não foi invalidada prematuramente antes do pagamento!
    assert.strictEqual(mockRes.preCheckinCompleted, true);
    assert.strictEqual(mockRes.needsReSignature, false);
    // Governança pausada reversivelmente
    assert.ok(mockDb.cleaningRequests[0].extensionHoldExpiresAt);
    assert.match(mockDb.cleaningRequests[0].adminNote, /Pré-Reserva aguardando pagamento/);

    // Testa também alterarDatasReservaTool ampliando mais 1 diária em cima da extensão pendente (preserva baseline original!)
    ctx.reserva_ativa.data_checkout = '2026-11-13';
    const result2 = await alterarDatasReservaTool.execute(
      {
        nova_data_checkin: '2026-11-10',
        nova_data_checkout: '2026-11-14',
        efetivar_alteracao: true,
      },
      ctx
    );
    assert.strictEqual(result2.status, 'SUCESSO_EXECUTADO');
    assert.strictEqual(mockRes.pendingStayExtension.oldCheckoutDate, '2026-11-12', 'deve preservar o oldCheckoutDate original pago');
    assert.strictEqual(mockRes.pendingStayExtension.oldTotalAmount, 500, 'deve preservar o oldTotalAmount original pago');
    assert.deepStrictEqual(mockRes.pendingStayExtension.addedDates, ['2026-11-12', '2026-11-13']);
  });

  it('5. Garantias estruturais nas rotas do servidor e no Frontend (PMS Calendar, Hover Card e Portal do Hóspede)', () => {
    // 5a) Em ensureExtensionPaymentConfirmationDispatched, invalidação diferida da FNRH ocorre na baixa do pagamento
    assert.match(serverSrc, /extMeta\.requiresDeferredReSignature/);
    assert.match(serverSrc, /cancelPendingExtension/);
    assert.match(serverSrc, /isExpiredExtension:\s*true/);

    // 5b) No Portal do Hóspede, stayExtensionExpired é checado ANTES de json.paid para nunca disparar falso positivo de pagamento
    const idxStayExtExpired = portalSrc.indexOf('if (json.stayExtensionExpired)');
    const idxPaid = portalSrc.indexOf('if (json.paid)', idxStayExtExpired);
    assert.ok(idxStayExtExpired > 0, 'guest-portal.tsx deve tratar json.stayExtensionExpired');
    assert.ok(idxStayExtExpired < idxPaid, 'stayExtensionExpired deve vir estritamente antes de json.paid no polling');
    assert.match(portalSrc, /Solicitar Reativação da Diária Extra/);

    // 5c) No PMS Calendar e Hover Card, indicadores segmentados, modo sem prazo e reativação de diária extra existem
    assert.match(pmsSrc, /data-extension-hold-badge="true"/);
    assert.match(pmsSrc, /extensionHoldMode/);
    assert.match(pmsSrc, /Reativar Diária Extra/);
    assert.match(hoverSrc, /Pré-Reserva de \+/);
  });
});
