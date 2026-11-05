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
  const ruiCode = extractFunction(serverCode, 'reconcileUniversalIntegrity').replace(/^export\s+/, '');
  const rcrCode = extractFunction(serverCode, 'reconcileCleaningRequests');
  const grfdCode = extractFunction(serverCode, 'getRequestsForDate');
  const eurIdCode = extractFunction(serverCode, 'ensureUniqueRequestIds');
  const foucrCode = extractFunction(serverCode, 'findOrUpsertCleaningRequest');

  const db = JSON.parse(JSON.stringify(initialDb));
  const getTodayStr = () => mockTodayStr;
  const getOffsetDateStr = (days) => {
    const d = new Date(`${mockTodayStr}T12:00:00Z`);
    d.setDate(d.getDate() + days);
    return d.toISOString().substring(0, 10);
  };
  const saveDatabase = () => {};

  const fn = new Function('db', 'getTodayStr', 'getOffsetDateStr', 'saveDatabase',
    'const requestsForDateCache = new Map();\n' +
    'let requestsForDateVersion = 1;\n' +
    'const invalidateRequestsForDateCache = () => { requestsForDateCache.clear(); requestsForDateVersion++; };\n' +
    'const healContaminatedGuestAndReservationLinks = () => false;\n' +
    'const computeCardAmountFromPix = (v) => Number(v || 0);\n' +
    'const isUnverifiedPreReservation = () => false;\n' +
    'const isPixPayloadStaleForAmount = () => false;\n' +
    'const generateStaticPixPayload = () => "000201";\n' +
    'const DEFAULT_INTER_CONFIG = { pixKey: "47964813000165" };\n' +
    'const regularizeHousekeepingPreventiveTasks = () => false;\n' +
    'const sanitizeMaidUsers = () => false;\n' +
    'const isB2bReservation = (r) => Boolean(r && (r.isB2b || r.channel === "b2b" || r.channel === "empresa"));\n' +
    'const cancelPendingStayRemindersForCheckout = () => {};\n' +
    eurIdCode + '\n' +
    rcrCode + '\n' +
    ruiCode + '\n' +
    grfdCode + '\n' +
    foucrCode + '\n' +
    `function patchAdminInstructions({ reqId = 0, flatId, flatNumber, requestDate, twinBeds, extraMattress, adminNote }) {
      const item = findOrUpsertCleaningRequest(reqId, flatNumber, flatId, requestDate);
      if (!item) return null;
      item.isManualInstruction = true;
      if (typeof twinBeds === "boolean") {
        item.twinBeds = twinBeds;
        item.manualTwinBeds = true;
      }
      if (typeof extraMattress === "boolean") {
        item.extraMattress = extraMattress;
        item.manualExtraMattress = true;
      }
      const targetDate = requestDate || item.requestDate || getTodayStr();
      if (adminNote !== undefined) {
        item.adminNote = adminNote ? String(adminNote).trim() : null;
        if (item.status !== "pending_issue") {
          item.pendingObservation = item.adminNote;
        }
        item.manualAdminNote = true;
        for (const priorReq of (db.cleaningRequests || [])) {
          if (
            priorReq.id !== item.id &&
            !priorReq.isDeleted &&
            priorReq.status !== "deleted" &&
            priorReq.status !== "clean" &&
            (Number(priorReq.flatId) === Number(item.flatId) || String(priorReq.flatNumber) === String(item.flatNumber)) &&
            priorReq.requestDate &&
            priorReq.requestDate < targetDate &&
            (priorReq.manualAdminNote || priorReq.isManualInstruction)
          ) {
            priorReq.adminNote = item.adminNote;
            if (priorReq.status !== "pending_issue") {
              priorReq.pendingObservation = item.adminNote;
            }
          }
        }
      }
      invalidateRequestsForDateCache();
      return item;
    }\n` +
    'return { reconcileUniversalIntegrity, reconcileCleaningRequests, getRequestsForDate, ensureUniqueRequestIds, findOrUpsertCleaningRequest, patchAdminInstructions, invalidateRequestsForDateCache };'
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

  it('5. Observação adicionada direto no card acompanha o card se ficar pendente para o dia seguinte e é descartada após limpo (nunca volta em próximas limpezas)', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    // Limpa solicitações e reservas futuras do Flat 509 a partir de 2026-11-10 para isolar o ciclo
    db.cleaningRequests = (db.cleaningRequests || []).filter(
      r => !(String(r.flatNumber) === '509' && r.requestDate >= '2026-11-10')
    );
    db.reservations = (db.reservations || []).filter(
      r => !(String(r.flatNumber) === '509' && (r.checkoutDate >= '2026-11-10' || r.checkinDate >= '2026-11-10'))
    );

    // Dia 1 (2026-11-10): Card de limpeza no Flat 509 sem observação na reserva
    db.reservations.push({
      id: 9910,
      code: 'RES-509-DESC-1',
      flatId: 10,
      flatNumber: '509',
      guestName: 'Hóspede Saindo Dia 10',
      checkinDate: '2026-11-08',
      checkoutDate: '2026-11-10',
      status: 'confirmada',
      specialRequests: ''
    });

    // Admin coloca observação diretamente no card em 2026-11-10
    const sandbox10 = createServerSandbox(db, '2026-11-10');
    sandbox10.getRequestsForDate('2026-11-10');
    sandbox10.patchAdminInstructions({
      flatId: 10,
      flatNumber: '509',
      requestDate: '2026-11-10',
      adminNote: 'Trocar pilha do controle da TV e verificar ralo'
    });

    const reqs10 = sandbox10.getRequestsForDate('2026-11-10');
    const card10 = reqs10.find(r => String(r.flatNumber) === '509');
    assert.ok(card10, 'Card deve existir em 2026-11-10');
    assert.strictEqual(card10.adminNote, 'Trocar pilha do controle da TV e verificar ralo');

    // Garante que a reserva NÃO foi contaminada pela observação descartável do card
    const resInDb = sandbox10.db.reservations.find(r => r.id === 9910);
    assert.strictEqual(resInDb.specialRequests, '', 'A reserva não deve ter seu specialRequests alterado pela nota do card');

    // Dia 2 (2026-11-11): O card NÃO foi limpo no dia 10 -> vai como pendente para o dia 11 mantendo a observação
    const sandbox11 = createServerSandbox(sandbox10.db, '2026-11-11');
    const reqs11 = sandbox11.getRequestsForDate('2026-11-11');
    const card11 = reqs11.find(r => String(r.flatNumber) === '509');
    assert.ok(card11, 'Card pendente deve aparecer em 2026-11-11');
    assert.strictEqual(card11.isPendingFromPreviousDay, true, 'Deve estar marcado como pendente do dia anterior');
    assert.strictEqual(card11.adminNote, 'Trocar pilha do controle da TV e verificar ralo', 'A observação deve acompanhar o card pendente');

    // Agora a camareira conclui a limpeza no dia 11 (status = 'clean')
    const persistedReq = sandbox11.db.cleaningRequests.find(
      r => String(r.flatNumber) === '509' && r.requestDate === '2026-11-10'
    );
    assert.ok(persistedReq, 'Registro persistido de 2026-11-10 deve existir');
    persistedReq.status = 'clean';
    persistedReq.completedAt = '2026-11-11T14:00:00.000Z';
    persistedReq.effectiveDate = '2026-11-11';

    // Dia 5 (2026-11-15): Próxima vez que o Flat 509 entra na lista de limpeza (novo checkout sem nota)
    sandbox11.db.reservations.push({
      id: 9911,
      code: 'RES-509-DESC-2',
      flatId: 10,
      flatNumber: '509',
      guestName: 'Novo Hóspede Saindo Dia 15',
      checkinDate: '2026-11-12',
      checkoutDate: '2026-11-15',
      status: 'confirmada',
      specialRequests: ''
    });

    const sandbox15 = createServerSandbox(sandbox11.db, '2026-11-15');
    const reqs15 = sandbox15.getRequestsForDate('2026-11-15');
    const card15 = reqs15.find(r => String(r.flatNumber) === '509');
    assert.ok(card15, 'Novo card de limpeza deve existir em 2026-11-15');
    assert.strictEqual(card15.adminNote, null, 'A observação anterior deve ter sido descartada e NÃO pode voltar na próxima limpeza');
  });

  it('6. Limpar a observação diretamente no card deve deixá-la vazia naquele card sem apagar a observação original da reserva', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    db.cleaningRequests = (db.cleaningRequests || []).filter(
      r => !(String(r.flatNumber) === '509' && r.requestDate >= '2026-11-20')
    );
    db.reservations = (db.reservations || []).filter(
      r => !(String(r.flatNumber) === '509' && (r.checkoutDate >= '2026-11-20' || r.checkinDate >= '2026-11-20'))
    );

    db.reservations.push(
      {
        id: 9920,
        code: 'RES-509-OUT-20',
        flatId: 10,
        flatNumber: '509',
        guestName: 'Hóspede Saindo 20',
        checkinDate: '2026-11-18',
        checkoutDate: '2026-11-20',
        status: 'confirmada'
      },
      {
        id: 9921,
        code: 'RES-509-IN-20',
        flatId: 10,
        flatNumber: '509',
        guestName: 'Hóspede Entrando 20',
        checkinDate: '2026-11-20',
        checkoutDate: '2026-11-23',
        status: 'confirmada',
        specialRequests: 'Deixar 2 toalhas extras'
      }
    );

    const sandbox = createServerSandbox(db, '2026-11-20');
    let reqs = sandbox.getRequestsForDate('2026-11-20');
    let card = reqs.find(r => String(r.flatNumber) === '509');
    assert.strictEqual(card.adminNote, 'Deixar 2 toalhas extras', 'Inicialmente unifica mostrando a observação da reserva');

    // Admin complementa a observação direto no card
    sandbox.patchAdminInstructions({
      flatId: 10,
      flatNumber: '509',
      requestDate: '2026-11-20',
      adminNote: 'Deixar 2 toalhas extras + limpar filtro do ar'
    });
    reqs = sandbox.getRequestsForDate('2026-11-20');
    card = reqs.find(r => String(r.flatNumber) === '509');
    assert.strictEqual(card.adminNote, 'Deixar 2 toalhas extras + limpar filtro do ar');
    assert.strictEqual(
      sandbox.db.reservations.find(r => r.id === 9921).specialRequests,
      'Deixar 2 toalhas extras',
      'Reserva original permanece intacta'
    );

    // Admin limpa a observação do card
    sandbox.patchAdminInstructions({
      flatId: 10,
      flatNumber: '509',
      requestDate: '2026-11-20',
      adminNote: ''
    });
    reqs = sandbox.getRequestsForDate('2026-11-20');
    card = reqs.find(r => String(r.flatNumber) === '509');
    assert.strictEqual(card.adminNote, null, 'Após limpar no card, adminNote deve ficar null no card');
  });
});
