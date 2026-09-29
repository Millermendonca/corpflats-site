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
});
