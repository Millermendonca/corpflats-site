import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SERVER_PRIMARY = path.join(ROOT_DIR, 'artifacts', 'api-server', 'demo-server.mjs');
const SERVER_MIRROR = path.join(ROOT_DIR, 'scripts', 'demo-server.mjs');
const DATABASE_FILE = path.join(ROOT_DIR, 'data', 'database.json');
const FLAT_CARD_FILE = path.join(ROOT_DIR, 'artifacts', 'limpeza', 'src', 'components', 'flat-card.tsx');

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

describe('Flat 509 & Regra do Badge Pendente', () => {
  it('1. Deve ter paridade estrita entre demo-server.mjs em artifacts e scripts', () => {
    const primary = fs.readFileSync(SERVER_PRIMARY);
    const mirror = fs.readFileSync(SERVER_MIRROR);
    assert.strictEqual(primary.equals(mirror), true, 'Primary e mirror demo-server.mjs devem ser 100% idênticos');
  });

  it('2. Flat 509 não limpo de dia anterior DEVE ser retornado em getRequestsForDate para hoje (carry-over de stayover)', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    const sandbox = createServerSandbox(db, '2026-10-05');
    const reqs = sandbox.getRequestsForDate('2026-10-05');

    const card509 = reqs.find(r => String(r.flatNumber) === '509');
    assert.ok(card509, 'Flat 509 deve estar presente na lista de quartos para limpar hoje');
    assert.strictEqual(card509.status, 'dirty', 'Flat 509 deve estar com status dirty');
    assert.strictEqual(card509.isPendingFromPreviousDay, true, 'Flat 509 deve vir marcado como pendente do dia anterior');
  });

  it('3. Quartos de hoje (checkoutDate === dateStr) NÃO devem possuir isPendingFromPreviousDay: true no backend', () => {
    const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
    // Injeta um checkout para a data de hoje
    db.reservations.push({
      id: 9999,
      code: 'RES-113-9999',
      flatId: 1,
      flatNumber: '113',
      guestName: 'Hóspede de Hoje',
      checkinDate: '2026-10-04',
      checkoutDate: '2026-10-05',
      status: 'confirmada'
    });

    const sandbox = createServerSandbox(db, '2026-10-05');
    const reqs = sandbox.getRequestsForDate('2026-10-05');

    const card113 = reqs.find(r => String(r.flatNumber) === '113');
    assert.ok(card113, 'Flat 113 deve estar presente');
    assert.strictEqual(Boolean(card113.isPendingFromPreviousDay), false, 'Quarto de hoje não deve ser isPendingFromPreviousDay');
  });

  it('4. flat-card.tsx deve ocultar o badge "Pendente" para quartos de hoje e exibir apenas para quartos pendentes de um dia para o outro', () => {
    const flatCardCode = fs.readFileSync(FLAT_CARD_FILE, 'utf8');

    // Valida que o flat-card.tsx possui a regra que suprime o badge se origDate === todayStr ou origDate >= date
    assert.ok(
      flatCardCode.includes('origDate === todayStr') || flatCardCode.includes('origDate >= date'),
      'flat-card.tsx deve conter regra para ocultar badge Pendente de quartos de hoje'
    );
    assert.ok(
      flatCardCode.includes('Pendente'),
      'flat-card.tsx deve conter texto Pendente para os quartos que ficaram pendentes de um dia para o outro'
    );
  });
});
