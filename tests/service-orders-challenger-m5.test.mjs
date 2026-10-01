import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

describe('CHALLENGER M5: Empirical Stress-Test & Adversarial Challenge Suite (R1 - R8)', { concurrency: 1 }, () => {
  const PORT = 4399;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  const prodDbPath = path.resolve('data/database.json');
  const isolatedDbPath = path.resolve('data/challenger-m5-database.json');
  const demoServerPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const pmsCalendarPath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');

  let serverChild = null;

  const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString('base64');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  const publicHeaders = {
    'Content-Type': 'application/json'
  };

  function killProcessTree(pid) {
    if (!pid) return;
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }

  // Setup: Spawn isolated backend server on port 4399 with dedicated database
  before(async () => {
    const rawProdDb = fs.readFileSync(prodDbPath, 'utf8');
    const parsedDb = JSON.parse(rawProdDb);

    parsedDb.serviceOrders = [];
    parsedDb.serviceWorkers = [];
    if (!Array.isArray(parsedDb.notifications)) parsedDb.notifications = [];
    if (!Array.isArray(parsedDb.auditLogs)) parsedDb.auditLogs = [];

    const today = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('/').reverse().join('-');

    // Ensure flat 2 (114) and flat 18 (907) are clean: all cleaning requests completed clean, no checkout reservations today
    parsedDb.cleaningRequests = (parsedDb.cleaningRequests || []).map(c => {
      if (Number(c.flatId) === 2 || String(c.flatNumber) === '114' || Number(c.flatId) === 18 || String(c.flatNumber) === '907') {
        return { ...c, status: 'clean', completedAt: new Date().toISOString() };
      }
      return c;
    });
    parsedDb.reservations = (parsedDb.reservations || []).filter(r => {
      return !((Number(r.flatId) === 2 || Number(r.flatId) === 18) && r.checkoutDate === today);
    });

    // Ensure flat 1 (113) has dirty cleaning request
    parsedDb.cleaningRequests = (parsedDb.cleaningRequests || []).filter(c => Number(c.flatId) !== 1);
    parsedDb.cleaningRequests.push({
      id: 88881,
      flatId: 1,
      flatNumber: '113',
      requestDate: today,
      source: 'checkout',
      status: 'dirty',
      isVacant: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    fs.writeFileSync(isolatedDbPath, JSON.stringify(parsedDb, null, 2), 'utf8');

    serverChild = spawn('node', [demoServerPath], {
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    let online = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/flats`);
        if (res.ok) {
          online = true;
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(online, `Test server failed to start on port ${PORT}`);
  });

  after(() => {
    if (serverChild && serverChild.pid) {
      killProcessTree(serverChild.pid);
    }
    try {
      if (fs.existsSync(isolatedDbPath)) {
        fs.unlinkSync(isolatedDbPath);
      }
    } catch {}
  });

  // =========================================================================
  // CHALLENGE 1: Unverified Start Attempts & Registration Validation
  // =========================================================================
  describe('Challenge 1: Unverified Start Attempts & Registration Security', { concurrency: 1 }, () => {
    let testOrderToken = '';
    let testOrderId = '';

    before(async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Challenge 1 Security Order',
          cleanFlatMode: 'never',
          maxSimultaneousFlats: 2,
          maxFlatsPerDay: 4,
          requirePhotos: true,
          flats: [
            { flatId: 1, flatNumber: '113', instructions: 'Instalação' },
            { flatId: 2, flatNumber: '114', instructions: 'Pintura' }
          ]
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      const order = data.order || data;
      testOrderToken = order.token;
      testOrderId = order.id;
    });

    it('1.1 Start attempt with invalid non-existent token returns 404', async () => {
      const res = await fetch(`${BASE_URL}/api/service/public/deadbeefcafebabedeadbeef/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.ok(data.error.includes('não encontrada'));
    });

    it('1.2 Start attempt with valid token before worker registration returns 403', async () => {
      const res = await fetch(`${BASE_URL}/api/service/public/${testOrderToken}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('se identificar'));
    });

    it('1.3 Registration validation: rejects CPF with less than 11 digits with 400', async () => {
      const res = await fetch(`${BASE_URL}/api/service/public/${testOrderToken}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'João Prestador', cpf: '123.456.789-0' } // 10 digits
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('11 dígitos'));
    });

    it('1.4 Registration validation: rejects empty worker name with 400', async () => {
      const res = await fetch(`${BASE_URL}/api/service/public/${testOrderToken}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: '   ', cpf: '12345678901' }
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('obrigatórios'));
    });

    it('1.5 Worker registered for Order B cannot start flats on Order A (token isolation)', async () => {
      // Create Order B
      const orderBRes = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Order B For Isolation Test',
          cleanFlatMode: 'never',
          flats: [{ flatId: 1, flatNumber: '113' }]
        })
      });
      const orderBData = await orderBRes.json();
      const tokenB = (orderBData.order || orderBData).token;

      // Register worker ONLY on Order B
      const regRes = await fetch(`${BASE_URL}/api/service/public/${tokenB}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Carlos Isolation', cpf: '99988877766' }
        })
      });
      assert.strictEqual(regRes.status, 200);

      // Attempt start on Order A (which has no registered worker)
      const res = await fetch(`${BASE_URL}/api/service/public/${testOrderToken}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(res.status, 403, 'Order A must remain guarded against workers registered on other orders');
    });
  });

  // =========================================================================
  // CHALLENGE 2: cleanFlatMode Edge Cases ('never', 'priority', 'always')
  // =========================================================================
  describe('Challenge 2: cleanFlatMode Edge Cases ("never", "priority", "always")', { concurrency: 1 }, () => {
    it('2.1 cleanFlatMode "never": clean flat is strictly blocked, dirty flat is permitted', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Mode Never Test Order',
          cleanFlatMode: 'never',
          requirePhotos: false,
          flats: [
            { flatId: 1, flatNumber: '113' }, // dirty
            { flatId: 18, flatNumber: '907' } // clean
          ]
        })
      });
      const data = await res.json();
      const order = data.order || data;

      // Register worker
      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Roberto Never', cpf: '11122233344' }
        })
      });

      // Try starting clean flat (18) -> must fail 400
      const cleanStartRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(cleanStartRes.status, 400);
      const cleanErr = await cleanStartRes.json();
      assert.ok(cleanErr.error.includes('não permite intervenção em apartamentos limpos'));

      // Try starting dirty flat (1) -> must succeed 200
      const dirtyStartRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(dirtyStartRes.status, 200);
    });

    it('2.2 cleanFlatMode "priority": clean flat blocked while dirty flat exists, unblocked once dirty is done', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Mode Priority Test Order',
          cleanFlatMode: 'priority',
          requirePhotos: false,
          flats: [
            { flatId: 1, flatNumber: '113' }, // dirty
            { flatId: 18, flatNumber: '907' } // clean
          ]
        })
      });
      const data = await res.json();
      const order = data.order || data;

      // Register worker
      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Mariana Priority', cpf: '22233344455' }
        })
      });

      // Step 1: Clean flat (18) attempt while dirty flat (1) is pending -> 400
      const step1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(step1.status, 400);
      const err1 = await step1.json();
      assert.ok(err1.error.includes('Priorize os apartamentos sujos primeiro'));

      // Step 2: Start dirty flat (1) -> 200
      const step2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(step2.status, 200);

      // Step 3: While dirty flat is in_progress, clean flat (18) still blocked because flat 1 is not done
      const step3 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(step3.status, 400);

      // Step 4: Finish dirty flat (1)
      const step4 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Concluído reparo elétrico no flat sujo'
        })
      });
      assert.strictEqual(step4.status, 200);

      // Step 5: Now that no pending/in_progress dirty flats remain in the order, clean flat (18) starts successfully!
      const step5 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(step5.status, 200, 'Clean flat must be allowed once all dirty flats in order are done');
    });

    it('2.3 cleanFlatMode "always": permits starting clean flat immediately and flags prioritySuggested for dirty flats', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Mode Always Test Order',
          cleanFlatMode: 'always',
          maxSimultaneousFlats: 3,
          requirePhotos: false,
          flats: [
            { flatId: 1, flatNumber: '113' }, // dirty
            { flatId: 18, flatNumber: '907' } // clean
          ]
        })
      });
      const data = await res.json();
      const order = data.order || data;

      // Register worker
      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Lucas Always', cpf: '33344455566' }
        })
      });

      // Starting clean flat (18) succeeds immediately even though dirty flat (1) is pending
      const cleanStart = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(cleanStart.status, 200);
      const cleanData = await cleanStart.json();
      assert.strictEqual(cleanData.prioritySuggested, false, 'Clean flat should not have prioritySuggested: true');

      // Starting dirty flat (1) returns prioritySuggested: true
      const dirtyStart = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(dirtyStart.status, 200);
      const dirtyData = await dirtyStart.json();
      assert.strictEqual(dirtyData.prioritySuggested, true, 'Dirty flat in always mode should return prioritySuggested: true');
    });
  });

  // =========================================================================
  // CHALLENGE 3: Simultaneous Flat Limit Adversarial Stress
  // =========================================================================
  describe('Challenge 3: Simultaneous Flat Limit Stress-Testing', { concurrency: 1 }, () => {
    it('3.1 Enforces strict simultaneous flat limit (maxSimultaneousFlats = 1)', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Simultaneous Limit Order',
          cleanFlatMode: 'always',
          maxSimultaneousFlats: 1,
          requirePhotos: false,
          flats: [
            { flatId: 1, flatNumber: '113' },
            { flatId: 2, flatNumber: '114' }
          ]
        })
      });
      const data = await res.json();
      const order = data.order || data;

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Felipe Simul', cpf: '44455566677' }
        })
      });

      // Start Flat 1 -> 200
      const start1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(start1.status, 200);

      // Attempt Start Flat 2 -> 400 (limit 1 reached)
      const start2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/2/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(start2.status, 400);
      const err = await start2.json();
      assert.ok(err.error.includes('Limite de apartamentos simultâneos atingido'));

      // Cannot re-start Flat 1 while in progress
      const reStart1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(reStart1.status, 400);
      assert.ok((await reStart1.json()).error.includes('já está em andamento'));

      // Finish Flat 1
      const finish1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ observations: 'Pronto 1' })
      });
      assert.strictEqual(finish1.status, 200);

      // Now Flat 2 can start (flat 2 was clean, so it starts cleanly in always mode)
      const start2After = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/2/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(start2After.status, 200);

      // Cannot start Flat 1 after it is already done
      const start1AfterDone = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(start1AfterDone.status, 400);
      assert.ok((await start1AfterDone.json()).error.includes('já foi finalizado'));
    });
  });

  // =========================================================================
  // CHALLENGE 4: Daily Flat Limit Adversarial Stress
  // =========================================================================
  describe('Challenge 4: Daily Flat Limit Stress-Testing', { concurrency: 1 }, () => {
    it('4.1 Enforces strict daily flat limit (maxFlatsPerDay = 1)', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Daily Limit Order',
          cleanFlatMode: 'always',
          maxSimultaneousFlats: 2,
          maxFlatsPerDay: 1,
          requirePhotos: false,
          flats: [
            { flatId: 1, flatNumber: '113' },
            { flatId: 2, flatNumber: '114' }
          ]
        })
      });
      const data = await res.json();
      const order = data.order || data;

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Diego Daily', cpf: '55566677788' }
        })
      });

      // Start & Finish Flat 1 today
      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, { method: 'POST', headers: publicHeaders });
      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ observations: 'Feito hoje' })
      });

      // Attempt to start Flat 2 today -> 400 (daily limit of 1 reached)
      const start2Res = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/2/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(start2Res.status, 400);
      const err = await start2Res.json();
      assert.ok(err.error.includes('Limite diário de apartamentos atingido para hoje'));
    });
  });

  // =========================================================================
  // CHALLENGE 5: Finish Validation Rules (requirePhotos & Clean Flat needsCleaning)
  // =========================================================================
  describe('Challenge 5: Finish Validations (requirePhotos & Clean Flat needsCleaning)', { concurrency: 1 }, () => {
    let orderToken = '';

    it('5.1 Creates dedicated order with clean flat 18 (Flat 907) and registered worker', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Finish Validations Order',
          cleanFlatMode: 'always',
          requirePhotos: true,
          flats: [
            { flatId: 18, flatNumber: '907' } // clean flat
          ]
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      const order = data.order || data;
      orderToken = order.token;

      const regRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Patricia Finish', cpf: '66677788899' }
        })
      });
      assert.strictEqual(regRes.status, 200);

      // Start clean flat 18
      const startRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 200);
      const startData = await startRes.json();
      assert.strictEqual(startData.flat.wasCleanWhenStarted, true, 'Flat 907 must be recorded as clean when started');
    });

    it('5.2 requirePhotos: true rejects finish when photos is empty array (400)', async () => {
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: true,
          photos: []
        })
      });
      assert.strictEqual(finishRes.status, 400);
      const data = await finishRes.json();
      assert.ok(data.error.includes('pelo menos 1 foto'));
    });

    it('5.3 requirePhotos: true rejects finish when photos contains only whitespace strings (400)', async () => {
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: true,
          photos: ['   ', '']
        })
      });
      assert.strictEqual(finishRes.status, 400);
      const data = await finishRes.json();
      assert.ok(data.error.includes('pelo menos 1 foto'));
    });

    it('5.4 Clean flat requires mandatory needsCleaning boolean; string "true" is rejected (400)', async () => {
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: 'true', // string instead of boolean
          photos: ['data:image/webp;base64,mockphoto']
        })
      });
      assert.strictEqual(finishRes.status, 400);
      const data = await finishRes.json();
      assert.ok(data.error.includes("'needsCleaning'"));
    });

    it('5.5 Clean flat requires mandatory needsCleaning boolean; omitted value is rejected (400)', async () => {
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          photos: ['data:image/webp;base64,mockphoto']
        })
      });
      assert.strictEqual(finishRes.status, 400);
      const data = await finishRes.json();
      assert.ok(data.error.includes("'needsCleaning'"));
    });

    it('5.6 Clean flat finish with needsCleaning: false succeeds (200) without marking flat dirty', async () => {
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: false,
          photos: ['data:image/webp;base64,valid_after_photo']
        })
      });
      assert.strictEqual(finishRes.status, 200);

      // Verify no dirty cleaning request was created for flat 18
      const checkoutsRes = await fetch(`${BASE_URL}/api/reservations/checkouts`);
      const checkoutsData = await checkoutsRes.json();
      const flat18Item = (checkoutsData.items || []).find(i => Number(i.flatId) === 18);
      assert.ok(!flat18Item || flat18Item.cleaningStatus !== 'dirty', 'Flat 18 must not be marked dirty when needsCleaning is false');
    });

    it('5.7 Clean flat finish with needsCleaning: true marks flat dirty and creates cleaning request', async () => {
      // Create new order for flat 18 to test needsCleaning: true
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Clean Needs Cleaning Order',
          cleanFlatMode: 'always',
          requirePhotos: false,
          flats: [{ flatId: 18, flatNumber: '907' }]
        })
      });
      const data = await res.json();
      const order = data.order || data;

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Patricia Finish', cpf: '66677788899' }
        })
      });

      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, { method: 'POST', headers: publicHeaders });

      const finishRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: true,
          photos: [],
          observations: 'Poeira de perfuração no quarto'
        })
      });
      assert.strictEqual(finishRes.status, 200);

      // Verify dirty cleaning request was created
      const updatedDb = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
      const flat18Req = (updatedDb.cleaningRequests || []).find(c => Number(c.flatId) === 18 && c.status === 'dirty');
      assert.ok(flat18Req, 'Cleaning request must be dirty for flat 18');
      assert.ok(flat18Req.adminNote.includes('Clean Needs Cleaning Order'));
    });
  });

  // =========================================================================
  // CHALLENGE 6: PMS Calendar Integration & Conflict Detection Override
  // =========================================================================
  describe('Challenge 6: PMS Calendar Service Block Integration & Override', { concurrency: 1 }, () => {
    let orderToken = '';
    let orderId = '';

    it('6.1 Sets up order with estimatedDurationHours and starts service', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Revisão Hidráulica Geral',
          cleanFlatMode: 'always',
          estimatedDurationHours: 6,
          requirePhotos: false,
          flats: [{ flatId: 1, flatNumber: '113' }]
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      const order = data.order || data;
      orderToken = order.token;
      orderId = order.id;

      const regRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Gustavo Hidráulico', cpf: '77788899900' }
        })
      });
      assert.strictEqual(regRes.status, 200);

      // Start service
      const startRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 200);
    });

    it('6.2 Start generates synthetic service block in GET /api/pms/calendar with isServiceBlock: true', async () => {
      // Check PMS calendar for current month
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const calRes = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${startDate}&endDate=${endDate}`, {
        headers: adminHeaders
      });
      assert.strictEqual(calRes.status, 200);
      const calData = await calRes.json();

      const serviceBlock = (calData.blocks || []).find(b => b.isServiceBlock === true && Number(b.flatId) === 1);
      assert.ok(serviceBlock, 'Synthetic service block must exist in PMS calendar');
      assert.strictEqual(serviceBlock.reason, 'service_order');
      assert.strictEqual(serviceBlock.workerName, 'Gustavo Hidráulico');
      assert.ok(serviceBlock.title.includes('Revisão Hidráulica Geral'));
    });

    it('6.3 Calendar date range boundary filtering properly excludes outside query ranges', async () => {
      // Query 2 years into the future
      const calRes = await fetch(`${BASE_URL}/api/pms/calendar?startDate=2028-01-01&endDate=2028-01-31`, {
        headers: adminHeaders
      });
      assert.strictEqual(calRes.status, 200);
      const calData = await calRes.json();

      const serviceBlock = (calData.blocks || []).find(b => b.isServiceBlock === true && Number(b.flatId) === 1);
      assert.strictEqual(serviceBlock, undefined, 'Calendar query outside block window must not contain service block');
    });

    it('6.4 Finishing service clears estimatedFinishAt and removes block from PMS calendar', async () => {
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ observations: 'Concluído reparo' })
      });
      assert.strictEqual(finishRes.status, 200);

      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const calRes = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${startDate}&endDate=${endDate}`, {
        headers: adminHeaders
      });
      const calData = await calRes.json();
      const serviceBlock = (calData.blocks || []).find(b => b.isServiceBlock === true && Number(b.flatId) === 1);
      assert.strictEqual(serviceBlock, undefined, 'Service block must be removed after service finishes');
    });

    it('6.5 Static verification: pms-calendar.tsx implements conflict detection, confirmation override, and delete protection', () => {
      const content = fs.readFileSync(pmsCalendarPath, 'utf8');

      // 1. Conflict detection banner
      assert.ok(content.includes('activeServiceBlockConflict'), 'Must compute activeServiceBlockConflict');
      assert.ok(
        content.includes('⚠️ Atenção: Este apartamento possui serviço externo agendado/em andamento neste período:'),
        'Must display conflict warning banner in modal'
      );

      // 2. Admin confirmation dialog in handleSaveRes
      assert.ok(content.includes('confirm('), 'Must call confirm/window.confirm for admin override');

      // 3. Delete trash icon protection
      assert.ok(content.includes('!b.isServiceBlock') || content.includes('!isService'), 'Must suppress delete icon on service blocks');
    });
  });

  // =========================================================================
  // CHALLENGE 7: Flat Reset & Order Closure Lifecycle
  // =========================================================================
  describe('Challenge 7: Flat Reset & Order Closure Lifecycle', { concurrency: 1 }, () => {
    let orderId = '';
    let orderToken = '';

    it('7.1 Sets up completed order for lifecycle testing', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Reset & Close Lifecycle Order',
          cleanFlatMode: 'always',
          requirePhotos: false,
          flats: [{ flatId: 1, flatNumber: '113' }]
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      const order = data.order || data;
      orderId = order.id;
      orderToken = order.token;

      const regRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Ana Lifecycle', cpf: '88899900011' }
        })
      });
      assert.strictEqual(regRes.status, 200);

      // Start and finish
      const startRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/start`, { method: 'POST', headers: publicHeaders });
      assert.strictEqual(startRes.status, 200);

      const finishRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ observations: 'Concluído para teste de reset' })
      });
      assert.strictEqual(finishRes.status, 200);
    });

    it('7.2 Admin resets done flat back to pending via POST /api/service-orders/:id/flats/:flatId/reset', async () => {
      const resetRes = await fetch(`${BASE_URL}/api/service-orders/${orderId}/flats/1/reset`, {
        method: 'POST',
        headers: adminHeaders
      });
      assert.strictEqual(resetRes.status, 200);
      const data = await resetRes.json();
      assert.strictEqual(data.flat.status, 'pending');
      assert.strictEqual(data.flat.startedAt, null);
      assert.strictEqual(data.flat.finishedAt, null);
      assert.strictEqual(data.flat.workerName, null);
    });

    it('7.3 Worker can re-start a reset flat', async () => {
      const startRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 200);
      const data = await startRes.json();
      assert.strictEqual(data.flat.status, 'in_progress');

      // Finish again
      await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ observations: 'Re-finalizado' })
      });
    });

    it('7.4 Admin closes order via PATCH /api/service-orders/:id with status closed', async () => {
      const closeRes = await fetch(`${BASE_URL}/api/service-orders/${orderId}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'closed' })
      });
      assert.strictEqual(closeRes.status, 200);
      const data = await closeRes.json();
      const order = data.order || data;
      assert.strictEqual(order.status, 'closed');
    });

    it('7.5 Start attempt on closed order is rejected with 400', async () => {
      const startRes = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 400);
      const data = await startRes.json();
      assert.ok(data.error.includes('encerrada'));
    });
  });
});
