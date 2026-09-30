import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Milestone 1 Empirical Challenge: cleanFlatMode & Integrations', () => {
  const PORT = 3995;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  let serverProcess;
  const dbPath = path.resolve('data/database.json');
  let originalDbContent;

  const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString('base64');
  const maidToken = Buffer.from(JSON.stringify({ v: 2, id: 2 })).toString('base64');

  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  const maidHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${maidToken}`
  };

  const publicHeaders = {
    'Content-Type': 'application/json'
  };

  before(async () => {
    // 1. Backup database.json
    originalDbContent = fs.readFileSync(dbPath, 'utf8');

    // 2. Spawn server on PORT 3995
    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
      stdio: 'pipe'
    });

    serverProcess.stderr.on('data', () => {});

    // 3. Wait for server readiness
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/flats`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, 'Server did not respond within timeout');
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    // Restore original database content
    if (originalDbContent) {
      fs.writeFileSync(dbPath, originalDbContent, 'utf8');
    }
  });

  it('PARITY: artifacts/api-server and scripts/demo-server are byte-a-byte identical', () => {
    const artifactsCode = fs.readFileSync(path.resolve('artifacts/api-server/demo-server.mjs'), 'utf8');
    const scriptsCode = fs.readFileSync(path.resolve('scripts/demo-server.mjs'), 'utf8');
    assert.strictEqual(artifactsCode, scriptsCode, 'scripts/demo-server.mjs must strictly match artifacts/api-server/demo-server.mjs');
  });

  it('CHALLENGE 1: cleanFlatMode="never" strictly rejects clean flats and allows dirty flats', async () => {
    // Flat 18 is clean, Flat 1 is dirty (has active dirty cleaning request)
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Desafio Modo Never',
        cleanFlatMode: 'never',
        maxSimultaneousFlats: 2,
        maxFlatsPerDay: 4,
        requirePhotos: false,
        flats: [
          { flatId: 18, flatNumber: '907' }, // Clean
          { flatId: 1, flatNumber: '113' }   // Dirty
        ]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    // Register worker
    const regRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Empirical Worker', cpf: '11122233344' }
      })
    });
    assert.strictEqual(regRes.status, 200);

    // Verify public endpoint recognizes Flat 18 as clean and Flat 1 as dirty
    const pubRes = await fetch(`${BASE_URL}/api/service/public/${order.token}`);
    assert.strictEqual(pubRes.status, 200);
    const pubData = await pubRes.json();
    const f18Enriched = pubData.order.flats.find(f => f.flatId === 18);
    const f1Enriched = pubData.order.flats.find(f => f.flatId === 1);
    assert.strictEqual(f18Enriched.isDirty, false, 'Flat 18 should be identified as clean');
    assert.strictEqual(f1Enriched.isDirty, true, 'Flat 1 should be identified as dirty');

    // Attempt to start clean flat 18 -> MUST be rejected with HTTP 400
    const startCleanRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startCleanRes.status, 400, 'Starting clean flat in never mode must return 400');
    const startCleanData = await startCleanRes.json();
    assert.ok(startCleanData.error.includes('não permite intervenção em apartamentos limpos'));

    // Check that Flat 18 status was NOT changed to in_progress
    const pubCheck = await (await fetch(`${BASE_URL}/api/service/public/${order.token}`)).json();
    assert.strictEqual(pubCheck.order.flats.find(f => f.flatId === 18).status, 'pending');

    // Attempt to start dirty flat 1 -> MUST be allowed with HTTP 200
    const startDirtyRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startDirtyRes.status, 200, 'Starting dirty flat in never mode must return 200');
    const startDirtyData = await startDirtyRes.json();
    assert.strictEqual(startDirtyData.success, true);
    assert.strictEqual(startDirtyData.flat.status, 'in_progress');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 2A: cleanFlatMode="priority" rejects clean flat when dirty flat is pending, but allows when dirty flat is finished', async () => {
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Desafio Modo Priority Sequencial',
        cleanFlatMode: 'priority',
        maxSimultaneousFlats: 2,
        maxFlatsPerDay: 4,
        requirePhotos: false,
        flats: [
          { flatId: 18, flatNumber: '907' }, // Clean
          { flatId: 1, flatNumber: '113' }   // Dirty
        ]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Priority Worker', cpf: '22233344455' }
      })
    });

    // 1. Try to start Flat 18 (clean) while Flat 1 (dirty) is pending -> MUST return 400
    const startCleanFail = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startCleanFail.status, 400);
    const failData = await startCleanFail.json();
    assert.ok(failData.error.includes('Priorize os apartamentos sujos primeiro'));

    // 2. Start Flat 1 (dirty) -> MUST succeed
    const startDirty = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startDirty.status, 200);

    // 3. While Flat 1 is in_progress, Flat 18 (clean) should STILL be rejected because Flat 1 is not done
    const startCleanFail2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startCleanFail2.status, 400);

    // 4. Finish Flat 1 (dirty)
    const finishDirty = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ observations: 'Pintura do flat sujo concluida' })
    });
    assert.strictEqual(finishDirty.status, 200);

    // 5. Now Flat 1 is done, so NO other flat in the order is dirty and pending/in_progress.
    // Flat 18 (clean) MUST now be allowed to start!
    const startCleanSuccess = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startCleanSuccess.status, 200, 'Clean flat must be allowed when all dirty flats in order are done');
    const successData = await startCleanSuccess.json();
    assert.strictEqual(successData.flat.status, 'in_progress');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 2B: cleanFlatMode="priority" allows clean flat when NO dirty flats are in the service order, even if dirty flats exist elsewhere', async () => {
    // Hotel has other dirty flats (e.g. Flat 7, 313), but this order ONLY contains clean Flat 18
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Desafio Modo Priority Apenas Limpos',
        cleanFlatMode: 'priority',
        maxSimultaneousFlats: 2,
        maxFlatsPerDay: 4,
        requirePhotos: false,
        flats: [
          { flatId: 18, flatNumber: '907' } // Clean
        ]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Solo Worker', cpf: '33344455566' }
      })
    });

    // Start Flat 18 -> MUST succeed because no other flat in this service order is dirty
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200, 'Clean flat in priority mode must start if no flats in order are dirty');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 3: cleanFlatMode="always" allows clean flats immediately, returning prioritySuggested=true ONLY when starting dirty flat', async () => {
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Desafio Modo Always',
        cleanFlatMode: 'always',
        maxSimultaneousFlats: 2,
        maxFlatsPerDay: 4,
        requirePhotos: false,
        flats: [
          { flatId: 18, flatNumber: '907' }, // Clean
          { flatId: 1, flatNumber: '113' }   // Dirty
        ]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Always Worker', cpf: '44455566677' }
      })
    });

    // 1. Start Clean Flat 18 -> MUST succeed immediately, prioritySuggested must be false
    const startCleanRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startCleanRes.status, 200);
    const cleanData = await startCleanRes.json();
    assert.strictEqual(cleanData.success, true);
    assert.strictEqual(cleanData.flat.status, 'in_progress');
    assert.strictEqual(cleanData.prioritySuggested, false, 'prioritySuggested should be false for clean flat');

    // 2. Start Dirty Flat 1 -> MUST succeed, prioritySuggested must be true
    const startDirtyRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startDirtyRes.status, 200);
    const dirtyData = await startDirtyRes.json();
    assert.strictEqual(dirtyData.success, true);
    assert.strictEqual(dirtyData.flat.status, 'in_progress');
    assert.strictEqual(dirtyData.prioritySuggested, true, 'prioritySuggested should be true for dirty flat in always mode');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 4: GET /api/flats and GET /api/reservations/checkouts properly return serviceInProgress when in_progress, and null when finished or pending', async () => {
    // Check initial state: Flat 1 is pending/no service -> serviceInProgress should be null
    const initFlats = await (await fetch(`${BASE_URL}/api/flats`)).json();
    assert.strictEqual(initFlats.find(f => f.id === 1).serviceInProgress, null);

    const initCheckouts = await (await fetch(`${BASE_URL}/api/reservations/checkouts`, { headers: maidHeaders })).json();
    const initFlat1Card = initCheckouts.find(c => c.flatId === 1);
    if (initFlat1Card) {
      assert.strictEqual(initFlat1Card.serviceInProgress, null);
    }

    // Create service order and start Flat 1
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Manutenção Hidráulica',
        cleanFlatMode: 'always',
        requirePhotos: false,
        flats: [{ flatId: 1, flatNumber: '113' }]
      })
    });
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Mário Encanador', cpf: '55566677788' }
      })
    });

    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);

    // 1. Verify GET /api/flats returns serviceInProgress
    const flatsProg = await (await fetch(`${BASE_URL}/api/flats`)).json();
    const flat1Prog = flatsProg.find(f => f.id === 1);
    assert.ok(flat1Prog.serviceInProgress, 'Flat 1 should have serviceInProgress');
    assert.strictEqual(flat1Prog.serviceInProgress.serviceTitle, 'Manutenção Hidráulica');
    assert.strictEqual(flat1Prog.serviceInProgress.workerName, 'Mário Encanador');
    assert.strictEqual(flat1Prog.serviceInProgress.serviceOrderId, order.id);

    // 2. Verify GET /api/reservations/checkouts returns serviceInProgress
    const checkoutsProg = await (await fetch(`${BASE_URL}/api/reservations/checkouts`, { headers: maidHeaders })).json();
    const coFlat1Prog = checkoutsProg.find(c => c.flatId === 1);
    assert.ok(coFlat1Prog, 'Flat 1 checkout card should exist');
    assert.ok(coFlat1Prog.serviceInProgress, 'Flat 1 checkout card should have serviceInProgress');
    assert.strictEqual(coFlat1Prog.serviceInProgress.serviceTitle, 'Manutenção Hidráulica');
    assert.strictEqual(coFlat1Prog.serviceInProgress.workerName, 'Mário Encanador');

    // 3. Finish service on Flat 1
    const finishRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ observations: 'Troca de torneira feita' })
    });
    assert.strictEqual(finishRes.status, 200);

    // 4. Verify GET /api/flats returns null for serviceInProgress
    const flatsDone = await (await fetch(`${BASE_URL}/api/flats`)).json();
    const flat1Done = flatsDone.find(f => f.id === 1);
    assert.strictEqual(flat1Done.serviceInProgress, null, 'serviceInProgress must be null when done');

    // 5. Verify GET /api/reservations/checkouts returns null for serviceInProgress
    const checkoutsDone = await (await fetch(`${BASE_URL}/api/reservations/checkouts`, { headers: maidHeaders })).json();
    const coFlat1Done = checkoutsDone.find(c => c.flatId === 1);
    assert.strictEqual(coFlat1Done.serviceInProgress, null, 'serviceInProgress on checkout card must be null when done');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 5: GET /api/pms/calendar produces synthetic service blocks when in_progress with estimatedFinishAt, and does not block when finished', async () => {
    // 1. Initial check on PMS calendar
    const initCal = await (await fetch(`${BASE_URL}/api/pms/calendar?startDate=2026-09-01&endDate=2026-10-31`, { headers: adminHeaders })).json();
    const initBlock = (initCal.blocks || []).find(b => b.reason === 'service_order' && b.flatId === 1);
    assert.strictEqual(initBlock, undefined, 'No service order block should exist before start');

    // 2. Create order with estimatedDurationHours: 4
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Reforma Geral do Piso',
        cleanFlatMode: 'always',
        requirePhotos: false,
        estimatedDurationHours: 4,
        flats: [{ flatId: 1, flatNumber: '113' }]
      })
    });
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Roberto Piso', cpf: '66677788899' }
      })
    });

    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();
    assert.ok(startData.flat.estimatedFinishAt, 'Flat must have estimatedFinishAt calculated');

    // 3. Verify GET /api/pms/calendar synthesizes service block
    const activeCal = await (await fetch(`${BASE_URL}/api/pms/calendar?startDate=2026-09-01&endDate=2026-10-31`, { headers: adminHeaders })).json();
    const serviceBlock = (activeCal.blocks || []).find(b => b.reason === 'service_order' && b.flatId === 1);
    assert.ok(serviceBlock, 'Synthetic service block must exist in PMS calendar blocks');
    assert.strictEqual(serviceBlock.isServiceBlock, true);
    assert.strictEqual(serviceBlock.reason, 'service_order');
    assert.strictEqual(serviceBlock.serviceOrderId, order.id);
    assert.strictEqual(serviceBlock.workerName, 'Roberto Piso');
    assert.strictEqual(serviceBlock.serviceTitle, 'Reforma Geral do Piso');
    assert.ok(serviceBlock.title.includes('Reforma Geral do Piso'));

    // 4. Finish the flat
    const finishRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ observations: 'Piso reformado' })
    });
    assert.strictEqual(finishRes.status, 200);

    // 5. Verify GET /api/pms/calendar no longer produces service block
    const finishedCal = await (await fetch(`${BASE_URL}/api/pms/calendar?startDate=2026-09-01&endDate=2026-10-31`, { headers: adminHeaders })).json();
    const finishedBlock = (finishedCal.blocks || []).find(b => b.reason === 'service_order' && b.flatId === 1);
    assert.strictEqual(finishedBlock, undefined, 'Synthetic service block must be removed after service is finished');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 6: Edge cases — clean flat finish enforces needsCleaning and creates cleaning request; double-start rejected', async () => {
    // Create order with clean Flat 18
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Verificação Elétrica Flat Limpo',
        cleanFlatMode: 'always',
        requirePhotos: false,
        flats: [{ flatId: 18, flatNumber: '907' }]
      })
    });
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Eletricista Pro', cpf: '77788899900' }
      })
    });

    // Start clean Flat 18
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);

    // Double start: attempt to start again while in_progress -> MUST return 400
    const doubleStartRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(doubleStartRes.status, 400);
    const doubleStartData = await doubleStartRes.json();
    assert.ok(doubleStartData.error.includes('já está em andamento'));

    // Finish clean flat WITHOUT needsCleaning -> MUST return 400
    const finishMissingCleaning = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ observations: 'Testando sem needsCleaning' })
    });
    assert.strictEqual(finishMissingCleaning.status, 400);
    const missingCleaningData = await finishMissingCleaning.json();
    assert.ok(missingCleaningData.error.includes('needsCleaning'));

    // Finish clean flat WITH needsCleaning: true -> MUST return 200
    const finishSuccess = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        observations: 'Troca de fiação concluída, sujou o chão',
        needsCleaning: true
      })
    });
    assert.strictEqual(finishSuccess.status, 200);
    const finishData = await finishSuccess.json();
    assert.strictEqual(finishData.flat.status, 'done');
    assert.strictEqual(finishData.flat.needsCleaning, true);

    // Restart after done: attempt to start flat that is already done -> MUST return 400
    const startAfterDone = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startAfterDone.status, 400);
    const startAfterDoneData = await startAfterDone.json();
    assert.ok(startAfterDoneData.error.includes('já foi finalizado'));

    // Admin reset flat to pending
    const resetRes = await fetch(`${BASE_URL}/api/service-orders/${order.id}/flats/18/reset`, {
      method: 'POST',
      headers: adminHeaders
    });
    assert.strictEqual(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.flat.status, 'pending');

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });

  it('CHALLENGE 7: requirePhotos=true strictly rejects empty photos array and accepts valid photos', async () => {
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Serviço com Fotos Obrigatórias',
        cleanFlatMode: 'always',
        requirePhotos: true,
        flats: [{ flatId: 1, flatNumber: '113' }]
      })
    });
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Fotógrafo Prestador', cpf: '88899900011' }
      })
    });

    await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });

    // 1. Finish with empty photos -> MUST return 400
    const failRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ observations: 'Sem fotos', photos: [] })
    });
    assert.strictEqual(failRes.status, 400);
    const failData = await failRes.json();
    assert.ok(failData.error.includes('pelo menos 1 foto'));

    // 2. Finish with valid photo -> MUST return 200
    const successRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        observations: 'Com foto anexada',
        photos: ['https://example.com/proof.jpg']
      })
    });
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    assert.strictEqual(successData.flat.status, 'done');
    assert.strictEqual(successData.flat.photos.length, 1);

    // Cleanup
    await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { method: 'DELETE', headers: adminHeaders });
  });
});

