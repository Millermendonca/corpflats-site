import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SERVER_PRIMARY = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const DATABASE_FILE = path.join(ROOT_DIR, 'data', 'database.json');

function extractFunction(code, fnName) {
  const startIdx = code.indexOf(`function ${fnName}(`);
  if (startIdx === -1) throw new Error(`Function ${fnName} not found`);
  let openBraces = 0;
  let started = false;
  let endIdx = -1;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') {
      openBraces++;
      started = true;
    } else if (code[i] === '}') {
      openBraces--;
      if (started && openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return code.substring(startIdx, endIdx);
}

function createServerSandbox(initialDb, mockTodayStr = '2026-10-05') {
  const serverCode = fs.readFileSync(SERVER_PRIMARY, 'utf8');
  const ruiCode = extractFunction(serverCode, 'reconcileUniversalIntegrity');
  const rcrCode = extractFunction(serverCode, 'reconcileCleaningRequests');
  const grfdCode = extractFunction(serverCode, 'getRequestsForDate');
  const eurIdCode = extractFunction(serverCode, 'ensureUniqueRequestIds');

  const db = JSON.parse(JSON.stringify(initialDb));
  const getTodayStr = () => mockTodayStr;
  const getOffsetDateStr = (days) => {
    const d = new Date(`${mockTodayStr}T12:00:00Z`);
    d.setDate(d.getDate() + days);
    return d.toISOString().substring(0, 10);
  };
  const saveDatabase = () => {};

  const fn = new Function('db', 'getTodayStr', 'getOffsetDateStr', 'saveDatabase',
    eurIdCode + '\n' +
    rcrCode + '\n' +
    ruiCode + '\n' +
    grfdCode + '\n' +
    'return { reconcileUniversalIntegrity, reconcileCleaningRequests, getRequestsForDate, ensureUniqueRequestIds };'
  );

  const scope = fn(db, getTodayStr, getOffsetDateStr, saveDatabase);
  return { db, ...scope };
}

describe('Ciclo de Vida de Instruções: Automáticas vs Manuais', () => {
  it('1. Instruções automáticas via reserva devem seguir a reserva para a data de check-in', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const prevRes = db.reservations.find(r => r.code === 'RES-509-0036');
    if (prevRes) prevRes.checkoutDate = '2026-10-05';
    // Injeta reserva com 2 camas de solteiro e colchão extra no Flat 509 para 2026-10-05
    db.reservations.push({
      id: 9901,
      code: 'RES-509-AUTO-1',
      flatId: 10,
      flatNumber: '509',
      guestName: 'Hóspede Solteiro Colchão',
      checkinDate: '2026-10-05',
      checkoutDate: '2026-10-08',
      status: 'confirmada',
      twinBeds: true,
      extraMattress: true,
      specialRequests: 'Colocar 2 camas de solteiro e colchão extra'
    });

    const sandbox = createServerSandbox(db, '2026-10-05');
    sandbox.reconcileUniversalIntegrity();
    const reqs = sandbox.getRequestsForDate('2026-10-05');
    const card509 = reqs.find(r => String(r.flatNumber) === '509');

    assert.ok(card509, 'Card do Flat 509 deve existir');
    assert.strictEqual(card509.twinBeds, true, 'Deve herdar twinBeds: true da reserva');
    assert.strictEqual(card509.extraMattress, true, 'Deve herdar extraMattress: true da reserva');
  });

  it('2. Quando a reserva for removida de hoje (cancelada ou alterada de data), as instruções automáticas NÃO devem permanecer', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    // Reserva removida (ou seja, sem reserva com check-in hoje no 509)
    // db.reservations NÃO contém reserva para o 509 em 2026-10-05
    const sandbox = createServerSandbox(db, '2026-10-05');
    sandbox.reconcileUniversalIntegrity();
    const reqs = sandbox.getRequestsForDate('2026-10-05');
    const card509 = reqs.find(r => String(r.flatNumber) === '509');

    if (card509) {
      assert.strictEqual(Boolean(card509.twinBeds), false, 'Flat 509 NÃO deve ter twinBeds se a reserva foi removida');
      assert.strictEqual(Boolean(card509.extraMattress), false, 'Flat 509 NÃO deve ter extraMattress se a reserva foi removida');
      assert.strictEqual(Boolean(card509.adminNote && card509.adminNote.includes('2 solteiras')), false, 'Flat 509 NÃO deve ter instrução de 2 solteiras se a reserva foi removida');
    }
  });

  it('3. Instruções adicionadas MANUALMENTE no card devem se manter mesmo sem reserva ou se a reserva mudar', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    // Card manual no Flat 509 em 2026-10-05
    db.cleaningRequests.push({
      id: 9991,
      flatId: 10,
      flatNumber: '509',
      requestDate: '2026-10-05',
      source: 'checkout',
      status: 'dirty',
      twinBeds: true,
      extraMattress: true,
      manualTwinBeds: true,
      manualExtraMattress: true,
      manualAdminNote: true,
      isManualInstruction: true,
      adminNote: 'Instrução configurada manualmente pelo admin'
    });

    const sandbox = createServerSandbox(db, '2026-10-05');
    sandbox.reconcileUniversalIntegrity();
    const reqs = sandbox.getRequestsForDate('2026-10-05');
    const card509 = reqs.find(r => String(r.flatNumber) === '509');

    assert.ok(card509, 'Card do Flat 509 deve existir');
    assert.strictEqual(card509.twinBeds, true, 'Deve manter twinBeds: true pois foi adicionado manualmente');
    assert.strictEqual(card509.extraMattress, true, 'Deve manter extraMattress: true pois foi adicionado manualmente');
    assert.strictEqual(card509.adminNote, 'Instrução configurada manualmente pelo admin', 'Deve manter nota manual');
  });

  it('4. Quando a reserva for remarcada de uma data para outra, as instruções automáticas devem seguir para a nova data', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const prevRes = db.reservations.find(r => r.code === 'RES-509-0036');
    if (prevRes) prevRes.checkoutDate = '2026-10-07';
    // Reserva foi remarcada de 2026-10-05 para 2026-10-07
    db.reservations.push({
      id: 9902,
      code: 'RES-509-AUTO-2',
      flatId: 10,
      flatNumber: '509',
      guestName: 'Hóspede Remarcado',
      checkinDate: '2026-10-07',
      checkoutDate: '2026-10-10',
      status: 'confirmada',
      twinBeds: true,
      extraMattress: true,
      specialRequests: '2 camas de solteiro e colchão extra'
    });

    const sandbox05 = createServerSandbox(db, '2026-10-05');
    sandbox05.reconcileUniversalIntegrity();
    const reqs05 = sandbox05.getRequestsForDate('2026-10-05');
    const card509_05 = reqs05.find(r => String(r.flatNumber) === '509');
    if (card509_05) {
      assert.strictEqual(Boolean(card509_05.twinBeds), false, 'Em 05/10 (data antiga) NÃO deve ter twinBeds');
      assert.strictEqual(Boolean(card509_05.extraMattress), false, 'Em 05/10 (data antiga) NÃO deve ter extraMattress');
    }

    const sandbox07 = createServerSandbox(db, '2026-10-07');
    sandbox07.reconcileUniversalIntegrity();
    const reqs07 = sandbox07.getRequestsForDate('2026-10-07');
    const card509_07 = reqs07.find(r => String(r.flatNumber) === '509');
    assert.ok(card509_07, 'Card em 07/10 deve existir');
    assert.strictEqual(card509_07.twinBeds, true, 'Em 07/10 (nova data de check-in) DEVE ter twinBeds: true');
    assert.strictEqual(card509_07.extraMattress, true, 'Em 07/10 (nova data de check-in) DEVE ter extraMattress: true');
  });
});
