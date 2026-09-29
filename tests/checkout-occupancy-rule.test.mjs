import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Regra de Ocupação Padrão em Check-outs', () => {
  const dbPath = path.resolve('data/database.json');
  const serverPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const scriptsServerPath = path.resolve('scripts/demo-server.mjs');

  it('1. Deve ter paridade estrita entre demo-server.mjs em artifacts e scripts', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const scriptsCode = fs.readFileSync(scriptsServerPath, 'utf8');
    assert.strictEqual(serverCode, scriptsCode, 'demo-server.mjs deve ser idêntico em artifacts/api-server e scripts/');
  });

  it('2. reconcileUniversalIntegrity deve criar solicitações de check-out com isVacant: false por padrão', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      serverCode.includes('isVacant: false') && serverCode.includes('isVacantExplicitlySet: false'),
      'Checkouts automáticos devem ser gerados com isVacant: false e isVacantExplicitlySet: false'
    );
  });

  it('3. getRequestsForDate deve retornar isVacant: false e isOccupied: true por padrão para checkouts não desocupados explicitamente', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverCode.includes('isExplicitlyVacantCheckout'), 'getRequestsForDate deve validar confirmação explícita de desocupação');
    assert.ok(serverCode.includes('isVacant: isExplicitlyVacantCheckout'), 'isVacant no card deve ser false a menos que seja explicitamente desocupado');
  });

  it('4. Endpoint /api/reservations/checkouts deve retornar isOccupied: true e isVacant: false para checkouts padrão', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverCode.includes('Check-outs entram como padrão com status OCUPADO'), 'Regra de negócio explícita deve estar presente');
    assert.ok(serverCode.includes('const isVacant = isExplicitlyVacant;'));
    assert.ok(serverCode.includes('const isOccupied = !isVacant;'));
  });

  it('5. Link de checkout público do hóspede deve definir isVacant: true com vacantSource: "guest_checkout"', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const idx = serverCode.indexOf('app.post("/api/public/checkout"');
    assert.ok(idx !== -1);
    const snippet = serverCode.substring(idx, idx + 2500);
    assert.ok(snippet.includes('existing.isVacant = true'));
    assert.ok(snippet.includes('existing.isVacantExplicitlySet = true'));
    assert.ok(snippet.includes('existing.vacantSource = "guest_checkout"'));
  });

  it('6. Check-out da recepção deve definir isVacant: true com vacantSource: "reception_checkout"', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const idx = serverCode.indexOf('app.post("/api/reception/checkout/:reservationId"');
    assert.ok(idx !== -1);
    const snippet = serverCode.substring(idx, idx + 3500);
    assert.ok(snippet.includes('cleanReq.isVacant = true'));
    assert.ok(snippet.includes('cleanReq.isVacantExplicitlySet = true'));
    assert.ok(snippet.includes('cleanReq.vacantSource = "reception_checkout"'));
  });

  it('7. Alteração manual de status via card deve gravar isVacantExplicitlySet: true', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    const idx = serverCode.indexOf('app.patch("/api/cleaning/assignments/:requestId/status"');
    assert.ok(idx !== -1);
    const snippet = serverCode.substring(idx, idx + 2500);
    assert.ok(snippet.includes('item.isVacant = isVacant;'));
    assert.ok(snippet.includes('item.isVacantExplicitlySet = true;'));
    assert.ok(snippet.includes('item.vacantSource = userAuth?.role === "admin" ? "admin" : "manual_card";'));
  });

  it('8. No banco de dados, todas as solicitações de checkout ativas/sujas devem ter isVacant: false por padrão', () => {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const dirtyAutoCheckouts = (db.cleaningRequests || []).filter(c =>
      c.source === 'checkout' &&
      c.status !== 'clean' &&
      !c.isVacantExplicitlySet &&
      !c.vacantSource
    );
    for (const c of dirtyAutoCheckouts) {
      assert.strictEqual(c.isVacant, false, `Flat ${c.flatNumber} em ${c.requestDate} deve ser isVacant: false`);
    }
  });

  it('9. Deve ter paridade estrita entre zapi-service.mjs em artifacts e scripts', () => {
    const zapiArtifacts = fs.readFileSync(path.resolve('artifacts/api-server/zapi-service.mjs'), 'utf8');
    const zapiScripts = fs.readFileSync(path.resolve('scripts/zapi-service.mjs'), 'utf8');
    assert.strictEqual(zapiArtifacts, zapiScripts, 'zapi-service.mjs deve ser idêntico em artifacts/api-server e scripts/');
  });

  it('10. zapi-service.mjs deve configurar isVacantExplicitlySet: true e vacantSource: "reception_checkout" sem notas de checkout redundantes', () => {
    const zapiCode = fs.readFileSync(path.resolve('artifacts/api-server/zapi-service.mjs'), 'utf8');
    const idx = zapiCode.indexOf('for (const flat of matchedFlats)');
    assert.ok(idx !== -1, 'Loop de matchedFlats deve existir em handleConciergeGroupWebhook');
    const snippet = zapiCode.substring(idx, idx + 2500);
    assert.ok(snippet.includes('cleanReq.isVacant = true'), 'Deve marcar isVacant = true');
    assert.ok(snippet.includes('cleanReq.isVacantExplicitlySet = true'), 'Deve marcar isVacantExplicitlySet = true');
    assert.ok(snippet.includes('cleanReq.vacantSource = "reception_checkout"'), 'Deve marcar vacantSource = "reception_checkout"');
    assert.ok(!snippet.includes('cleanReq.pendingObservation = `Check-out confirmado'), 'Não deve criar notas de check-out em pendingObservation');
    assert.ok(snippet.includes('pendingObservation: null'), 'Nova solicitação deve ter pendingObservation: null');
  });

  it('11. sanitizeCardNote deve purificar mensagens redundantes de check-out e preservar instruções operacionais', async () => {
    const { sanitizeCardNote } = await import('../artifacts/api-server/zapi-service.mjs');
    assert.strictEqual(typeof sanitizeCardNote, 'function');
    assert.strictEqual(sanitizeCardNote('Check-out confirmado no grupo da portaria (Recepção)'), null);
    assert.strictEqual(sanitizeCardNote('Check-out expresso confirmado (Rodrigo)'), null);
    assert.strictEqual(sanitizeCardNote('Confirmado na Portaria (Portaria)'), null);
    assert.strictEqual(sanitizeCardNote('Limpeza de check-out gerada automaticamente para o Flat 511 (Reserva RES-511-0292)'), null);
    assert.strictEqual(sanitizeCardNote('Quarto desocupado'), null);
    assert.strictEqual(sanitizeCardNote('Montar 2 camas solteiro • Check-out confirmado no grupo da portaria'), 'Montar 2 camas solteiro');
    assert.strictEqual(sanitizeCardNote('Berço solicitado pelo hóspede'), 'Berço solicitado pelo hóspede');
  });

  it('12. Flat 511 deve estar desocupado sem recado redundante no banco de dados', () => {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const req511 = (db.cleaningRequests || []).find(r => (r.flatNumber == 511 || r.flatId == 11) && r.requestDate === '2026-09-29');
    assert.ok(req511, 'Solicitação para 511 em 2026-09-29 deve existir');
    assert.strictEqual(req511.isVacant, true, 'Flat 511 deve ter isVacant: true');
    assert.strictEqual(req511.isVacantExplicitlySet, true, 'Flat 511 deve ter isVacantExplicitlySet: true');
    assert.strictEqual(req511.vacantSource, 'reception_checkout', 'vacantSource do 511 deve ser reception_checkout');
    assert.strictEqual(req511.pendingObservation, null, 'pendingObservation do 511 não deve ter nota de checkout');
    
    const flatObj = (db.flats || []).find(f => f.number == 511 || f.id == 11);
    assert.ok(flatObj, 'Flat 511 deve existir em db.flats');
    assert.strictEqual(flatObj.isOccupied, false, 'Flat 511 deve ter isOccupied: false');
  });

  it('13. Flat 408 (Felipe Junqueira) tem checkout em 30/09 e não deve aparecer como checkout em 29/09', () => {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const res408 = (db.reservations || []).find(r => r.code === 'RES-408-0294' || (r.flatNumber == '408' && r.guestName && r.guestName.includes('Felipe')));
    assert.ok(res408, 'Reserva do Felipe Junqueira no 408 deve existir');
    assert.strictEqual(res408.checkoutDate, '2026-09-30', 'Checkout do Felipe deve ser 30/09');
    
    // Verifica que não há cleaning dirty em 29/09 para o 408
    const dirty408Today = (db.cleaningRequests || []).filter(c => (c.flatNumber == '408' || c.flatId == 8) && c.requestDate === '2026-09-29' && c.status === 'dirty');
    assert.strictEqual(dirty408Today.length, 0, 'Flat 408 não deve ter cleaningRequest dirty em 29/09');
  });

  it('14. Flat 509 (Heverton Martins) deve estar como dirty para o checkout de hoje sem atribuição de admin', () => {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const req509 = (db.cleaningRequests || []).find(c => (c.flatNumber == '509' || c.flatId == 10) && c.requestDate === '2026-09-29');
    assert.ok(req509, 'CleaningRequest do Flat 509 em 2026-09-29 deve existir');
    assert.strictEqual(req509.status, 'dirty', 'Flat 509 deve estar dirty');
    assert.strictEqual(req509.assignedUserId, null, 'Flat 509 não deve ter camareira/admin atribuído');
    assert.strictEqual(req509.completedAt, null, 'Flat 509 não deve ter completedAt');
  });

  it('15. Flat 1004 (Roselene) deve estar como dirty para o checkout de hoje sem atribuição de Cris', () => {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const req1004 = (db.cleaningRequests || []).find(c => (c.flatNumber == '1004' || c.flatId == 19) && c.requestDate === '2026-09-29');
    assert.ok(req1004, 'CleaningRequest do Flat 1004 em 2026-09-29 deve existir');
    assert.strictEqual(req1004.status, 'dirty', 'Flat 1004 deve estar dirty');
    assert.strictEqual(req1004.assignedUserId, null, 'Flat 1004 não deve estar atribuído a Cris');
    assert.strictEqual(req1004.completedAt, null, 'Flat 1004 não deve ter completedAt');
  });

  it('16. getRequestsForDate em 29/09 NÃO deve conter Flat 408 como pendência de 30/09 ("Não limpo em 30/09")', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    function extractFunction(code, fnName) {
      const startIdx = code.indexOf('function ' + fnName + '(');
      if (startIdx === -1) throw new Error('Function ' + fnName + ' not found');
      let openBraces = 0, started = false, endIdx = -1;
      for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '{') { openBraces++; started = true; }
        else if (code[i] === '}') {
          openBraces--;
          if (started && openBraces === 0) { endIdx = i + 1; break; }
        }
      }
      return code.substring(startIdx, endIdx);
    }
    const grfdCode = extractFunction(serverCode, 'getRequestsForDate');
    const ruiCode = extractFunction(serverCode, 'reconcileUniversalIntegrity');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const fn = new Function('db', 'getTodayStr', 'getOffsetDateStr', 'saveDatabase', grfdCode + '\n' + ruiCode + '\n return { getRequestsForDate, reconcileUniversalIntegrity };');
    const scope = fn(db, () => '2026-09-29', (d, off) => '2026-09-29', () => {});
    scope.reconcileUniversalIntegrity();

    const reqs29 = scope.getRequestsForDate('2026-09-29');
    const card408 = reqs29.find(r => String(r.flatNumber) === '408');
    assert.strictEqual(card408, undefined, 'Flat 408 não deve constar na listagem de 29/09, pois o hóspede Felipe só sai em 30/09');
  });

  it('17. Flat 509 em 29/09 deve conter twinBeds: true, extraMattress: true e instruções completas para a camareira', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    function extractFunction(code, fnName) {
      const startIdx = code.indexOf('function ' + fnName + '(');
      if (startIdx === -1) throw new Error('Function ' + fnName + ' not found');
      let openBraces = 0, started = false, endIdx = -1;
      for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '{') { openBraces++; started = true; }
        else if (code[i] === '}') {
          openBraces--;
          if (started && openBraces === 0) { endIdx = i + 1; break; }
        }
      }
      return code.substring(startIdx, endIdx);
    }
    const grfdCode = extractFunction(serverCode, 'getRequestsForDate');
    const ruiCode = extractFunction(serverCode, 'reconcileUniversalIntegrity');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const fn = new Function('db', 'getTodayStr', 'getOffsetDateStr', 'saveDatabase', grfdCode + '\n' + ruiCode + '\n return { getRequestsForDate, reconcileUniversalIntegrity };');
    const scope = fn(db, () => '2026-09-29', (d, off) => '2026-09-29', () => {});
    scope.reconcileUniversalIntegrity();

    const reqs29 = scope.getRequestsForDate('2026-09-29');
    const card509 = reqs29.find(r => String(r.flatNumber) === '509');
    assert.ok(card509, 'Flat 509 deve existir na listagem de 29/09');
    assert.strictEqual(card509.twinBeds, true, 'Flat 509 deve ter twinBeds: true');
    assert.strictEqual(card509.extraMattress, true, 'Flat 509 deve ter extraMattress: true');
    assert.ok(
      card509.adminNote && card509.adminNote.includes('2 solteiras') && card509.adminNote.includes('colchão extra'),
      'Flat 509 deve ter a nota completa de camas e colchão extra'
    );
  });

  it('18. Step 4.5 em getRequestsForDate deve restringir execDate === dateStr && r.requestDate < dateStr', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      serverCode.includes('if (execDate === dateStr && r.requestDate < dateStr)'),
      'Step 4.5 deve estritamente exigir r.requestDate < dateStr para impedir carryover fantasma de datas futuras'
    );
  });

  it('19. Edição de reserva em app.put deve sincronizar preferências de cama/colchão/recado em tempo real com a governança', () => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      serverCode.includes('Sincronização em tempo real das preferências de quarto (camas/colchão/recado) com o card de governança na data de check-in'),
      'app.put deve propagar alterações de twinBeds e extraMattress para a governança em tempo real'
    );
  });
});
