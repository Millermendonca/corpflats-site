import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {
  getMaidPeriodFinances,
  syncMaidCredits,
  matchesPeriod,
  resolveMaidTemplateTags,
  getMaidStats,
  getExecutionDateStr,
  formatCurrency
} from '../artifacts/api-server/maid-automation-service.mjs';

describe('Motor Canônico de Finanças e Extrato de Camareiras (CorpFlats)', () => {

  it('1. Paridade estrita byte-a-byte entre os arquivos primary e seus mirrors em scripts/', () => {
    const demoServerPrimary = fs.readFileSync(path.resolve('artifacts/api-server/demo-server.mjs'));
    const demoServerMirror = fs.readFileSync(path.resolve('scripts/demo-server.mjs'));
    assert.strictEqual(demoServerPrimary.equals(demoServerMirror), true, 'demo-server.mjs primary e scripts/ devem ter paridade 100% byte-a-byte');

    const maidServicePrimary = fs.readFileSync(path.resolve('artifacts/api-server/maid-automation-service.mjs'));
    const maidServiceMirror = fs.readFileSync(path.resolve('scripts/maid-automation-service.mjs'));
    assert.strictEqual(maidServicePrimary.equals(maidServiceMirror), true, 'maid-automation-service.mjs primary e scripts/ devem ter paridade 100% byte-a-byte');
  });

  it('2. getMaidPeriodFinances: Cálculo básico de produção bruta com diárias limpas', () => {
    const mockDb = {
      users: [{ id: 10, username: 'maria', name: 'Maria da Silva', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00, userRates: { 10: 30.00 } },
      cleaningRequests: [
        { id: 'req-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 101 },
        { id: 'req-2', assignedUserId: 10, status: 'clean', completedAt: '2026-09-08T14:30:00.000Z', flatNumber: 102 },
        { id: 'req-3', assignedUserId: 10, status: 'clean', requestDate: '2026-09-10', flatNumber: 103 },
        // Outra camareira
        { id: 'req-4', assignedUserId: 20, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 104 },
        // Fora do período
        { id: 'req-5', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-20', flatNumber: 105 },
        // Não é paga / instrução
        { id: 'req-6', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-06', flatNumber: 106, isBedAdjustmentOnly: true }
      ],
      maidPayments: [],
      maidStatementEntries: []
    };

    const fin = getMaidPeriodFinances(mockDb, 10, '2026-09-01', '2026-09-15');
    assert.strictEqual(fin.cleaningsCount, 3);
    assert.strictEqual(fin.grossAmount, 90.00); // 3 * 30.00
    assert.strictEqual(fin.previousDebitBalance, 0);
    assert.strictEqual(fin.advancesAmount, 0);
    assert.strictEqual(fin.paymentsAmount, 0);
    assert.strictEqual(fin.netPendingAmount, 90.00);
  });

  it('3. getMaidPeriodFinances: Discriminação de vales (adiantamentos) no período', () => {
    const mockDb = {
      users: [{ id: 10, username: 'maria', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00 },
      cleaningRequests: [
        { id: 'req-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-02', flatNumber: 201 },
        { id: 'req-2', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-03', flatNumber: 202 },
        { id: 'req-3', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-04', flatNumber: 203 },
        { id: 'req-4', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 204 },
      ],
      maidPayments: [
        { id: 'pay-vale-1', userId: 10, type: 'advance', amount: 30.00, paidAt: '2026-09-04T12:00:00Z', referencePeriod: '2026-09-01_2026-09-15' }
      ],
      maidStatementEntries: [
        { id: 'st-vale-1', userId: 10, entryType: 'debit', amount: 30.00, entryDate: '2026-09-04', paymentId: 'pay-vale-1' }
      ]
    };

    const fin = getMaidPeriodFinances(mockDb, 10, '2026-09-01', '2026-09-15');
    assert.strictEqual(fin.cleaningsCount, 4);
    assert.strictEqual(fin.grossAmount, 100.00); // 4 * 25.00
    assert.strictEqual(fin.advancesAmount, 30.00);
    assert.strictEqual(fin.paymentsAmount, 0);
    assert.strictEqual(fin.netPendingAmount, 70.00); // 100 - 30
  });

  it('4. getMaidPeriodFinances: Abatimento de pagamentos quitando o saldo pendente', () => {
    const mockDb = {
      users: [{ id: 10, username: 'maria', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00 },
      cleaningRequests: [
        { id: 'req-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-02', flatNumber: 201 },
        { id: 'req-2', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-03', flatNumber: 202 },
      ],
      maidPayments: [
        { id: 'pay-vale-1', userId: 10, type: 'advance', amount: 15.00, paidAt: '2026-09-04T12:00:00Z', referencePeriod: '2026-09-01_2026-09-15' },
        { id: 'pay-pix-1', userId: 10, type: 'payment', amount: 35.00, paidAt: '2026-09-16T10:00:00Z', referencePeriod: '2026-09-01_2026-09-15' }
      ],
      maidStatementEntries: [
        { id: 'st-v1', userId: 10, entryType: 'debit', amount: 15.00, entryDate: '2026-09-04', paymentId: 'pay-vale-1' },
        { id: 'st-p1', userId: 10, entryType: 'debit', amount: 35.00, entryDate: '2026-09-16', paymentId: 'pay-pix-1' }
      ]
    };

    const fin = getMaidPeriodFinances(mockDb, 10, '2026-09-01', '2026-09-15');
    assert.strictEqual(fin.grossAmount, 50.00); // 2 * 25
    assert.strictEqual(fin.advancesAmount, 15.00);
    assert.strictEqual(fin.paymentsAmount, 35.00);
    assert.strictEqual(fin.netPendingAmount, 0.00); // 50 - 15 - 35 = 0
  });

  it('5. getMaidPeriodFinances: Transporte de saldo devedor entre quinzenas (conta-corrente)', () => {
    // Cenário: Na 1ª quinzena (01 a 15), a camareira fez 1 quarto (R$ 25), mas recebeu um vale de R$ 60.
    // Ficou com dívida (saldo devedor) de R$ 35 na virada para a 2ª quinzena.
    // Na 2ª quinzena (16 a 30), ela faz 4 quartos (R$ 100).
    const mockDb = {
      users: [{ id: 10, username: 'maria', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00 },
      cleaningRequests: [
        // 1ª Quinzena: 1 quarto = R$ 25
        { id: 'req-q1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 101 },
        // 2ª Quinzena: 4 quartos = R$ 100
        { id: 'req-q2-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-18', flatNumber: 201 },
        { id: 'req-q2-2', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-19', flatNumber: 202 },
        { id: 'req-q2-3', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-20', flatNumber: 203 },
        { id: 'req-q2-4', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-21', flatNumber: 204 },
      ],
      maidPayments: [
        { id: 'pay-vale-excess', userId: 10, type: 'advance', amount: 60.00, paidAt: '2026-09-08T12:00:00Z', referencePeriod: '2026-09-01_2026-09-15' }
      ],
      maidStatementEntries: [
        { id: 'st-c1', userId: 10, entryType: 'credit', amount: 25.00, entryDate: '2026-09-05', cleaningRequestId: 'req-q1' },
        { id: 'st-d1', userId: 10, entryType: 'debit', amount: 60.00, entryDate: '2026-09-08', paymentId: 'pay-vale-excess' },
        { id: 'st-c2-1', userId: 10, entryType: 'credit', amount: 25.00, entryDate: '2026-09-18', cleaningRequestId: 'req-q2-1' },
        { id: 'st-c2-2', userId: 10, entryType: 'credit', amount: 25.00, entryDate: '2026-09-19', cleaningRequestId: 'req-q2-2' },
        { id: 'st-c2-3', userId: 10, entryType: 'credit', amount: 25.00, entryDate: '2026-09-20', cleaningRequestId: 'req-q2-3' },
        { id: 'st-c2-4', userId: 10, entryType: 'credit', amount: 25.00, entryDate: '2026-09-21', cleaningRequestId: 'req-q2-4' },
      ]
    };

    const finQ2 = getMaidPeriodFinances(mockDb, 10, '2026-09-16', '2026-09-30');
    assert.strictEqual(finQ2.grossAmount, 100.00, 'Bruto de Q2 deve ser 100.00');
    assert.strictEqual(finQ2.previousDebitBalance, 35.00, 'Saldo devedor anterior de Q1 deve ser 35.00');
    assert.strictEqual(finQ2.advancesAmount, 0);
    assert.strictEqual(finQ2.paymentsAmount, 0);
    // Líquido restante: 100.00 - 35.00 = 65.00
    assert.strictEqual(finQ2.netPendingAmount, 65.00, 'Líquido pendente deve abater a dívida anterior');
    assert.strictEqual(finQ2.lifetimeBalance, 65.00, 'Saldo contábil geral deve ser 65.00');
  });

  it('6. Desconsideração de pagamentos estornados (reversedAt)', () => {
    const mockDb = {
      users: [{ id: 10, username: 'maria', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00 },
      cleaningRequests: [
        { id: 'req-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-02', flatNumber: 201 },
      ],
      maidPayments: [
        {
          id: 'pay-estornado',
          userId: 10,
          type: 'payment',
          amount: 25.00,
          paidAt: '2026-09-03T12:00:00Z',
          referencePeriod: '2026-09-01_2026-09-15',
          reversedAt: '2026-09-04T10:00:00Z',
          interStatus: 'ESTORNADO'
        }
      ],
      maidStatementEntries: [
        // A contrapartida foi removida no estorno
      ]
    };

    const fin = getMaidPeriodFinances(mockDb, 10, '2026-09-01', '2026-09-15');
    assert.strictEqual(fin.grossAmount, 25.00);
    assert.strictEqual(fin.paymentsAmount, 0, 'Pagamento estornado não deve ser somado');
    assert.strictEqual(fin.netPendingAmount, 25.00, 'Saldo líquido deve continuar pendente');
  });

  it('7. resolveMaidTemplateTags: Substituição correta de tags discriminadas', () => {
    const template = 'Olá, {{primeiro_nome}}!\n' +
      'Bruto: {{bruto_quinzena}}\n' +
      'Vales: {{vales_quinzena}}\n' +
      'Saldo Anterior: {{saldo_anterior}}\n' +
      'Líquido a Receber: {{saldo_liquido_quinzena}}\n' +
      'PIX: {{chave_pix}}';

    const maidUser = {
      id: 10,
      name: 'Carla Souza',
      pixKey: 'carla@pix.com'
    };

    const stats = {
      grossAmount: 180.00,
      advancesAmount: 40.00,
      previousDebitBalance: 15.00,
      netPendingAmount: 125.00,
      quinzenaCount: 6,
      ratePerRoom: 30.00
    };

    const rendered = resolveMaidTemplateTags(template, maidUser, stats);

    assert.ok(rendered.includes('Olá, Carla!'), 'Deve conter primeiro nome');
    assert.ok(rendered.includes(`Bruto: ${formatCurrency(180)}`), 'Deve conter bruto formatado');
    assert.ok(rendered.includes(`Vales: ${formatCurrency(40)}`), 'Deve conter vales formatado');
    assert.ok(rendered.includes(`Saldo Anterior: ${formatCurrency(15)}`), 'Deve conter saldo anterior');
    assert.ok(rendered.includes(`Líquido a Receber: ${formatCurrency(125)}`), 'Deve conter líquido formatado');
    assert.ok(rendered.includes('PIX: carla@pix.com'), 'Deve conter chave PIX');
  });

  it('8. syncMaidCredits: Preserva histórico fechado de Agosto (< 2026-09-01)', () => {
    const mockDb = {
      users: [{ id: 10, username: 'maria', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00 },
      cleaningRequests: [
        { id: 'req-sep-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 101 },
      ],
      maidPayments: [],
      maidStatementEntries: [
        // Lançamento de agosto fechado que não deve ser tocado nem apagado
        { id: 'aug-entry-1', userId: 10, entryType: 'credit', amount: 22.50, entryDate: '2026-08-15', description: 'Diária 15/08 - Flat 101' },
        { id: 'aug-entry-2', userId: 10, entryType: 'debit', amount: 22.50, entryDate: '2026-08-16', description: 'Pagamento Quinzena Agosto' }
      ]
    };

    syncMaidCredits(mockDb, 10);

    const augustEntries = mockDb.maidStatementEntries.filter(e => e.id.startsWith('aug-entry-'));
    assert.strictEqual(augustEntries.length, 2, 'Lançamentos de agosto não devem ser excluídos');
    
    // Novo lançamento de setembro deve ter sido gerado
    const sepEntry = mockDb.maidStatementEntries.find(e => e.cleaningRequestId === 'req-sep-1');
    assert.ok(sepEntry, 'Novo crédito de setembro deve ser gerado');
    assert.strictEqual(sepEntry.amount, 25.00);
  });

  it('9. Rejeição de instruções e limpezas não faturáveis', () => {
    const mockDb = {
      users: [{ id: 10, username: 'maria', role: 'camareira' }],
      cleaningRates: { defaultRatePerRoom: 25.00 },
      cleaningRequests: [
        { id: 'req-clean', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 101 },
        { id: 'req-inst-1', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 102, isInstructionOnly: true },
        { id: 'req-inst-2', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 103, type: 'instruction' },
        { id: 'req-inst-3', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 104, source: 'manual_instruction' },
        { id: 'req-not-paid', assignedUserId: 10, status: 'clean', effectiveDate: '2026-09-05', flatNumber: 105, isPaidCleaning: false },
        { id: 'req-not-clean', assignedUserId: 10, status: 'in_progress', effectiveDate: '2026-09-05', flatNumber: 106 }
      ],
      maidPayments: [],
      maidStatementEntries: []
    };

    const fin = getMaidPeriodFinances(mockDb, 10, '2026-09-01', '2026-09-15');
    assert.strictEqual(fin.cleaningsCount, 1, 'Apenas req-clean deve ser contabilizada');
    assert.strictEqual(fin.grossAmount, 25.00);
  });

  it('10. matchesPeriod: Correspondência dinâmica de quinzena e referencePeriod', () => {
    // Pagamento feito no dia 16 referente à 1ª quinzena (01 a 15)
    const paymentWithRef = {
      id: 'pay-1',
      referencePeriod: '2026-09-01_2026-09-15',
      paidAt: '2026-09-16T14:00:00Z'
    };
    const entry1 = { entryDate: '2026-09-16', paymentId: 'pay-1' };
    assert.strictEqual(matchesPeriod(entry1, paymentWithRef, '2026-09-01', '2026-09-15'), true, 'Deve associar à 1ª quinzena via referencePeriod');
    assert.strictEqual(matchesPeriod(entry1, paymentWithRef, '2026-09-16', '2026-09-30'), false, 'Não deve vazar para a 2ª quinzena');

    // Pagamento feito no dia 16 sem referencePeriod (fallback dinâmico do dia seguinte ao fechamento)
    const paymentWithoutRef = {
      id: 'pay-2',
      type: 'payment',
      paidAt: '2026-09-16T10:00:00Z'
    };
    const entry2 = { entryDate: '2026-09-16', paymentId: 'pay-2' };
    assert.strictEqual(matchesPeriod(entry2, paymentWithoutRef, '2026-09-01', '2026-09-15'), true, 'Fallback dinâmico deve associar dia 16 ao fechamento da 1ª quinzena');
  });

  it('11. getMaidPeriodFinances: Casos limites (camareira sem limpezas, período vazio)', () => {
    const mockDb = {
      users: [{ id: 99, username: 'novata', role: 'camareira' }],
      cleaningRequests: [],
      maidPayments: [],
      maidStatementEntries: []
    };

    const fin = getMaidPeriodFinances(mockDb, 99, '2026-09-01', '2026-09-15');
    assert.strictEqual(fin.cleaningsCount, 0);
    assert.strictEqual(fin.grossAmount, 0);
    assert.strictEqual(fin.previousDebitBalance, 0);
    assert.strictEqual(fin.advancesAmount, 0);
    assert.strictEqual(fin.paymentsAmount, 0);
    assert.strictEqual(fin.netPendingAmount, 0);
    assert.strictEqual(fin.lifetimeBalance, 0);
  });

});
