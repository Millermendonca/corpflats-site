import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Challenger M1 Final: Empirical Verification of Start/Finish Notifications & Channel Execution', () => {
  const PORT = 3998;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const dbPath = path.resolve('data/database.json');
  let dbBackup = null;
  let serverProcess = null;
  let stdoutLogs = '';
  let stderrLogs = '';

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
    } catch {}
  }

  function readDbWithRetry(retries = 15, delayMs = 100) {
    for (let i = 0; i < retries; i++) {
      try {
        const content = fs.readFileSync(dbPath, 'utf8');
        if (content && content.trim()) {
          return JSON.parse(content);
        }
      } catch (e) {
        // file write in progress by server
      }
      try {
        execSync(`powershell -Command "Start-Sleep -Milliseconds ${delayMs}"`, { stdio: 'ignore' });
      } catch {}
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }

  async function waitForNotification(predicate, timeoutMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const currentDb = readDbWithRetry();
      const found = (currentDb.notifications || []).find(predicate);
      if (found) return found;
      await new Promise(r => setTimeout(r, 150));
    }
    const currentDb = readDbWithRetry();
    return (currentDb.notifications || []).find(predicate);
  }

  async function waitForNotificationCount(predicate, count, timeoutMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const currentDb = readDbWithRetry();
      const found = (currentDb.notifications || []).filter(predicate);
      if (found.length >= count) return found;
      await new Promise(r => setTimeout(r, 150));
    }
    const currentDb = readDbWithRetry();
    return (currentDb.notifications || []).filter(predicate);
  }

  before(async () => {
    dbBackup = fs.readFileSync(dbPath, 'utf8');

    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_URL: '' },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', data => {
      stdoutLogs += data.toString();
    });

    serverProcess.stderr.on('data', data => {
      stderrLogs += data.toString();
    });

    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/flats`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, 'Server failed to start within timeout');
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    if (dbBackup) {
      fs.writeFileSync(dbPath, dbBackup, 'utf8');
    }
  });

  it('1. Flat START creates internal notification in db.notifications without TypeErrors', async () => {
    const initialErrLogs = stderrLogs;

    // Create service order
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Pintura Fachada e Sala 101',
        cleanFlatMode: 'always',
        requirePhotos: true,
        estimatedDurationHours: 3,
        flats: [101]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    // Register worker
    const regRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Carlos Pintor', cpf: '12345678900' }
      })
    });
    assert.strictEqual(regRes.status, 200);

    // Start flat
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/101/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();
    assert.strictEqual(startData.success, true);
    assert.strictEqual(startData.flat.status, 'in_progress');

    // Polling oracle for async notification persistence in db.notifications
    const startNotif = await waitForNotification(
      n => n.category === 'service_order' &&
           n.metadata?.serviceOrderId === order.id &&
           n.title?.includes('🔧 Serviço iniciado') &&
           String(n.metadata?.flatNumber) === '101'
    );

    assert.ok(startNotif, 'Start notification MUST be present in db.notifications');
    assert.strictEqual(startNotif.category, 'service_order');
    assert.ok(startNotif.title.includes('Flat 101'), `Title should include Flat 101, got: ${startNotif.title}`);
    assert.ok(startNotif.message.includes('Carlos Pintor'), `Message should include worker name, got: ${startNotif.message}`);
    assert.strictEqual(startNotif.severity, 'info');
    assert.strictEqual(startNotif.targetUrl, '/servicos');

    // Verify NO TypeError occurred in dispatchServiceNotifications
    const newStderr = stderrLogs.substring(initialErrLogs.length);
    assert.ok(!newStderr.includes('TypeError: sendEmailAsync(...).catch is not a function'), 'Must not throw TypeError on sendEmailAsync');
    assert.ok(!newStderr.includes('[ServiceOrder] Error dispatching notifications:'), 'Must not log notification dispatch errors');
    assert.ok(!stdoutLogs.includes('[ServiceOrder] Error dispatching notifications:'), 'Must not log notification dispatch errors in stdout');
  });

  it('2. Flat FINISH creates internal notification in db.notifications without TypeErrors', async () => {
    const initialErrLogs = stderrLogs;

    // Create service order with 1 flat
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Revisão Hidráulica Flat 201',
        cleanFlatMode: 'always',
        requirePhotos: false,
        flats: [201]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    // Register worker
    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Mário Encanador', cpf: '98765432100' }
      })
    });

    // Start flat 201
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/201/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);

    // Wait a brief moment before finish
    await new Promise(r => setTimeout(r, 400));

    // Finish flat 201 with observations, needsCleaning, and photos
    const finishRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/201/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        needsCleaning: true,
        observations: 'Substituição de sifão e torneira concluída com sucesso.',
        photos: ['https://storage.corpflats.com/sifao_novo.jpg']
      })
    });
    assert.strictEqual(finishRes.status, 200);
    const finishData = await finishRes.json();
    assert.strictEqual(finishData.success, true);
    assert.strictEqual(finishData.flat.status, 'done');

    // Polling oracle for async finish notification in db.notifications
    const finishNotif = await waitForNotification(
      n => n.category === 'service_order' &&
           n.metadata?.serviceOrderId === order.id &&
           n.title?.includes('✅ Serviço finalizado') &&
           String(n.metadata?.flatNumber) === '201'
    );

    assert.ok(finishNotif, 'Finish notification MUST be present in db.notifications');
    assert.strictEqual(finishNotif.category, 'service_order');
    assert.ok(finishNotif.title.includes('Flat 201'), `Title should include Flat 201, got: ${finishNotif.title}`);
    assert.ok(finishNotif.message.includes('Mário Encanador'), `Message should include worker name, got: ${finishNotif.message}`);
    assert.strictEqual(finishNotif.severity, 'info');
    assert.strictEqual(finishNotif.targetUrl, '/servicos');

    // Verify NO TypeError occurred in finish dispatch
    const newStderr = stderrLogs.substring(initialErrLogs.length);
    assert.ok(!newStderr.includes('TypeError: sendEmailAsync(...).catch is not a function'), 'Must not throw TypeError on sendEmailAsync in finish');
    assert.ok(!newStderr.includes('[ServiceOrder] Error dispatching notifications:'), 'Must not log notification dispatch errors in finish');
  });

  it('3. Both START and FINISH notifications coexist with correct sequence and metadata', async () => {
    // Create service order with flat 301
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Manutenção de Ar Condicionado Flat 301',
        cleanFlatMode: 'always',
        requirePhotos: false,
        flats: [301]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    // Register worker
    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Roberto Climatização', cpf: '33344455566' }
      })
    });

    // Start flat 301
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/301/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);

    // Wait 400ms
    await new Promise(r => setTimeout(r, 400));

    // Finish flat 301
    const finishRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/301/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        needsCleaning: false,
        observations: 'Limpeza de filtros e carga de gás R410a efetuada.'
      })
    });
    assert.strictEqual(finishRes.status, 200);

    // Wait for both notifications
    const notifs = await waitForNotificationCount(
      n => n.category === 'service_order' && n.metadata?.serviceOrderId === order.id,
      2
    );

    assert.strictEqual(notifs.length, 2, 'Should have exactly 2 notifications (1 start, 1 finish)');
    
    const titles = notifs.map(n => n.title);
    assert.ok(titles.some(t => t.includes('🔧 Serviço iniciado')), 'Must contain start notification');
    assert.ok(titles.some(t => t.includes('✅ Serviço finalizado')), 'Must contain finish notification');
  });

  it('4. Multi-flat service order creates independent start & finish notifications for each flat', async () => {
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Troca de Lâmpadas LED Múltiplos Flats',
        cleanFlatMode: 'always',
        maxSimultaneousFlats: 3,
        requirePhotos: false,
        flats: [401, 402]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Eletricista Multi', cpf: '77788899911' }
      })
    });

    // Start 401 and 402
    const s1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/401/start`, { method: 'POST', headers: publicHeaders });
    assert.strictEqual(s1.status, 200);
    await new Promise(r => setTimeout(r, 300));

    const s2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/402/start`, { method: 'POST', headers: publicHeaders });
    assert.strictEqual(s2.status, 200);
    await new Promise(r => setTimeout(r, 300));

    // Finish 401
    const f1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/401/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        needsCleaning: false,
        observations: 'Concluído 401'
      })
    });
    assert.strictEqual(f1.status, 200);
    await new Promise(r => setTimeout(r, 300));

    // Finish 402
    const f2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/402/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        needsCleaning: true,
        observations: 'Concluído 402'
      })
    });
    assert.strictEqual(f2.status, 200);

    const orderNotifs = await waitForNotificationCount(
      n => n.category === 'service_order' && n.metadata?.serviceOrderId === order.id,
      4
    );

    assert.strictEqual(orderNotifs.length, 4, 'Should have exactly 4 notifications: 2 starts and 2 finishes');
    
    const notif401Start = orderNotifs.find(n => n.title.includes('🔧') && String(n.metadata?.flatNumber) === '401');
    const notif401Finish = orderNotifs.find(n => n.title.includes('✅') && String(n.metadata?.flatNumber) === '401');
    const notif402Start = orderNotifs.find(n => n.title.includes('🔧') && String(n.metadata?.flatNumber) === '402');
    const notif402Finish = orderNotifs.find(n => n.title.includes('✅') && String(n.metadata?.flatNumber) === '402');

    assert.ok(notif401Start, 'Notification for 401 start must exist');
    assert.ok(notif401Finish, 'Notification for 401 finish must exist');
    assert.ok(notif402Start, 'Notification for 402 start must exist');
    assert.ok(notif402Finish, 'Notification for 402 finish must exist');
  });

  it('5. Edge Case Stress: Worker with collaborators, custom reception contacts, empty notes, and clean execution across all channels', async () => {
    const initialErrLogs = stderrLogs;

    // Create service order
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Decoração e Cortinas 501',
        cleanFlatMode: 'always',
        requirePhotos: false,
        flats: [501]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    // Register worker with collaborators
    const regRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Ana Decoradora', cpf: '11122233344' },
        collaborators: [{ name: 'Ajudante Paulo', cpf: '55566677788' }]
      })
    });
    assert.strictEqual(regRes.status, 200);

    // Start flat 501
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/501/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);

    await new Promise(r => setTimeout(r, 400));

    // Finish flat 501 with empty/null observations
    const finishRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/501/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        needsCleaning: false,
        observations: ''
      })
    });
    assert.strictEqual(finishRes.status, 200);

    // Verify both notifications in db.notifications
    const orderNotifs = await waitForNotificationCount(
      n => n.category === 'service_order' && n.metadata?.serviceOrderId === order.id,
      2
    );

    assert.strictEqual(orderNotifs.length, 2, 'Should create exactly 2 notifications for order');
    const startN = orderNotifs.find(n => n.title.includes('🔧'));
    const finishN = orderNotifs.find(n => n.title.includes('✅'));

    assert.ok(startN, 'Start notification exists');
    assert.ok(finishN, 'Finish notification exists');
    assert.ok(startN.message.includes('Ana Decoradora'), 'Start notification includes worker name');
    assert.ok(finishN.message.includes('Ana Decoradora'), 'Finish notification includes worker name');

    // Confirm that stderr contains NO TypeErrors or dispatch crashes
    const recentErrLogs = stderrLogs.substring(initialErrLogs.length);
    assert.ok(!recentErrLogs.includes('TypeError'), 'Must have zero TypeErrors during notification dispatch');
    assert.ok(!recentErrLogs.includes('[ServiceOrder] Error dispatching notifications:'), 'Must have zero dispatch errors');
  });
});
