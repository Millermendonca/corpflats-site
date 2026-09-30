import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('External Service Orders Module (OS Prestadores de Serviços Externos)', () => {
  const artifactsServerPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const scriptsServerPath = path.resolve('scripts/demo-server.mjs');
  const dbPath = path.resolve('data/database.json');

  it('1. Paridade byte-a-byte estrita entre artifacts/api-server e scripts/demo-server.mjs', () => {
    const artifactsCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const scriptsCode = fs.readFileSync(scriptsServerPath, 'utf8');
    assert.strictEqual(artifactsCode, scriptsCode, 'scripts/demo-server.mjs deve ser idêntico a artifacts/api-server/demo-server.mjs');
  });

  it('2. data/database.json contém as chaves raiz serviceOrders e serviceWorkers', () => {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.ok(Array.isArray(db.serviceOrders), 'db.serviceOrders deve ser um array');
    assert.ok(Array.isArray(db.serviceWorkers), 'db.serviceWorkers deve ser um array');
  });

  it('3. Servidor inicializa serviceOrders e serviceWorkers defensivamente', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    assert.ok(serverCode.includes('if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];'), 'loadDatabase deve inicializar serviceOrders');
    assert.ok(serverCode.includes('if (!Array.isArray(db.serviceWorkers)) db.serviceWorkers = [];'), 'loadDatabase deve inicializar serviceWorkers');
  });

  it('4. Geração de token único com 24 caracteres hexadecimais no POST /api/service-orders', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    assert.ok(
      serverCode.includes('crypto.randomBytes(12).toString("hex")') ||
      serverCode.includes("crypto.randomBytes(12).toString('hex')"),
      'POST /api/service-orders deve gerar token de 24 hex usando crypto.randomBytes(12).toString("hex")'
    );
  });

  it('5. Rotas admin exigem autenticação e role === admin', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const adminRoutes = [
      'app.get("/api/service-orders"',
      'app.post("/api/service-orders"',
      'app.get("/api/service-orders/:id"',
      'app.patch("/api/service-orders/:id"',
      'app.delete("/api/service-orders/:id"',
      'app.get("/api/service-orders/:id/progress"'
    ];
    for (const route of adminRoutes) {
      const idx = serverCode.indexOf(route);
      assert.ok(idx !== -1, `Rota admin ${route} deve existir`);
      const snippet = serverCode.substring(idx, idx + 400);
      assert.ok(snippet.includes('getAuthUser(req)'), `Rota ${route} deve chamar getAuthUser`);
      assert.ok(snippet.includes('401'), `Rota ${route} deve retornar 401 se deslogado`);
      assert.ok(snippet.includes('403'), `Rota ${route} deve retornar 403 se não admin`);
    }
  });

  it('6. Rotas públicas não exigem autenticação e validam token', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const publicRoutes = [
      'app.get("/api/service/public/:token"',
      'app.post("/api/service/public/:token/register"',
      'app.post("/api/service/public/:token/flats/:flatId/start"',
      'app.post("/api/service/public/:token/flats/:flatId/finish"',
      'app.post("/api/service/public/:token/flats/:flatId/photos"'
    ];
    for (const route of publicRoutes) {
      const idx = serverCode.indexOf(route);
      assert.ok(idx !== -1, `Rota pública ${route} deve existir`);
      const snippet = serverCode.substring(idx, idx + 400);
      assert.ok(!snippet.includes('getAuthUser(req)'), `Rota pública ${route} NÃO deve exigir getAuthUser`);
      assert.ok(snippet.includes('token'), `Rota pública ${route} deve extrair e validar token`);
    }
  });

  it('7. start valida cadastro do prestador (403), maxSimultaneous (400), maxPerDay (400)', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const idx = serverCode.indexOf('app.post("/api/service/public/:token/flats/:flatId/start"');
    assert.ok(idx !== -1);
    const snippet = serverCode.substring(idx, idx + 2500);

    assert.ok(snippet.includes('403'), 'start deve retornar 403 se prestador não registrado');
    assert.ok(snippet.includes('maxSimultaneousFlats'), 'start deve validar maxSimultaneousFlats');
    assert.ok(snippet.includes('maxFlatsPerDay'), 'start deve validar maxFlatsPerDay');
  });

  it('8. start avalia cleanFlatMode (never, priority, always)', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const idx = serverCode.indexOf('app.post("/api/service/public/:token/flats/:flatId/start"');
    assert.ok(idx !== -1);
    const snippet = serverCode.substring(idx, idx + 5000);

    assert.ok(snippet.includes('cleanFlatMode === "never"'), 'start deve tratar modo never');
    assert.ok(snippet.includes('cleanFlatMode === "priority"'), 'start deve tratar modo priority');
    assert.ok(snippet.includes('prioritySuggested'), 'start deve retornar prioritySuggested para always');
  });

  it('9. finish valida needsCleaning obrigatório se flat estava limpo e requirePhotos', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const idx = serverCode.indexOf('app.post("/api/service/public/:token/flats/:flatId/finish"');
    assert.ok(idx !== -1);
    const snippet = serverCode.substring(idx, idx + 5000);

    assert.ok(snippet.includes('wasCleanWhenStarted'), 'finish deve checar se flat estava limpo quando iniciado');
    assert.ok(snippet.includes('needsCleaning'), 'finish deve validar campo needsCleaning');
    assert.ok(snippet.includes('requirePhotos'), 'finish deve validar requirePhotos');
    assert.ok(snippet.includes('estimatedFinishAt = null'), 'finish deve desobstruir calendário PMS');
  });

  it('10. Notificações multi-canal configuradas para start e finish (WhatsApp admin, WhatsApp recepção, Email recepção, Notificação interna)', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    assert.ok(serverCode.includes('5522998505276'), 'Deve conter número do WhatsApp admin 5522998505276');
    assert.ok(serverCode.includes('sendZapiMessage'), 'Deve chamar sendZapiMessage com bypassTestMode: true');
    assert.ok(serverCode.includes('sendEmailAsync'), 'Deve chamar sendEmailAsync para recepção');
    assert.ok(serverCode.includes('createNotification'), 'Deve gerar notificação interna do sistema');
  });

  it('11. Injeção de serviceInProgress em GET /api/flats e GET /api/reservations/checkouts', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const flatsIdx = serverCode.indexOf('app.get("/api/flats"');
    assert.ok(flatsIdx !== -1);
    const flatsSnippet = serverCode.substring(flatsIdx, flatsIdx + 500);
    assert.ok(flatsSnippet.includes('serviceInProgress'), 'GET /api/flats deve conter serviceInProgress');

    const checkoutsIdx = serverCode.indexOf('app.get("/api/reservations/checkouts"');
    assert.ok(checkoutsIdx !== -1);
    const checkoutsSnippet = serverCode.substring(checkoutsIdx, checkoutsIdx + 15000);
    assert.ok(checkoutsSnippet.includes('serviceInProgress'), 'GET /api/reservations/checkouts deve conter serviceInProgress');
  });

  it('12. Injeção de blocos de serviço sintéticos em GET /api/pms/calendar', () => {
    const serverCode = fs.readFileSync(artifactsServerPath, 'utf8');
    const calIdx = serverCode.indexOf('app.get("/api/pms/calendar"');
    assert.ok(calIdx !== -1);
    const calSnippet = serverCode.substring(calIdx, calIdx + 10000);
    assert.ok(calSnippet.includes('isServiceBlock: true'), 'GET /api/pms/calendar deve marcar isServiceBlock: true');
    assert.ok(calSnippet.includes('reason: "service_order"') || calSnippet.includes("reason: 'service_order'"), 'GET /api/pms/calendar deve marcar reason: "service_order"');
    assert.ok(calSnippet.includes('serviceOrderBlocks'), 'GET /api/pms/calendar deve sintetizar serviceOrderBlocks');
  });
});
