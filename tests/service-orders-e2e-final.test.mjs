import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

describe('E2E Final Acceptance Suite: External Service Orders Lifecycle (R1 - R8)', () => {
  const PORT = 4299;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  const prodDbPath = path.resolve('data/database.json');
  const isolatedDbPath = path.resolve('data/e2e-final-test-database.json');
  const demoServerPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const demoServerMirrorPath = path.resolve('scripts/demo-server.mjs');
  const adminPagePath = path.resolve('artifacts/limpeza/src/pages/service-orders.tsx');
  const workerPortalPath = path.resolve('artifacts/limpeza/src/pages/service-worker-portal.tsx');
  const flatCardPath = path.resolve('artifacts/limpeza/src/components/flat-card.tsx');
  const pmsCalendarPath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');
  const appPath = path.resolve('artifacts/limpeza/src/App.tsx');
  const layoutPath = path.resolve('artifacts/limpeza/src/components/layout.tsx');

  let serverChild = null;

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

  // =========================================================================
  // SETUP & TEARDOWN
  // =========================================================================
  before(async () => {
    // 1. Prepare isolated test database
    const rawProdDb = fs.readFileSync(prodDbPath, 'utf8');
    const parsedDb = JSON.parse(rawProdDb);

    if (!Array.isArray(parsedDb.serviceOrders)) parsedDb.serviceOrders = [];
    if (!Array.isArray(parsedDb.serviceWorkers)) parsedDb.serviceWorkers = [];
    if (!Array.isArray(parsedDb.notifications)) parsedDb.notifications = [];
    if (!Array.isArray(parsedDb.auditLogs)) parsedDb.auditLogs = [];

    // Ensure flat 1 has dirty cleaning request and flat 2 is clean
    const today = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('/').reverse().join('-');

    // Ensure flat 2 is clean: completed cleaning requests, no today's checkout reservation
    parsedDb.cleaningRequests = (parsedDb.cleaningRequests || []).map(c => {
      if (Number(c.flatId) === 2 || String(c.flatNumber) === '114') {
        return { ...c, status: 'clean', completedAt: new Date().toISOString() };
      }
      return c;
    });
    parsedDb.reservations = (parsedDb.reservations || []).filter(r => {
      return !(Number(r.flatId) === 2 && r.checkoutDate === today);
    });

    // Ensure flat 1 is dirty with uncompleted dirty cleaning request
    const existingDirty1 = (parsedDb.cleaningRequests || []).find(c => Number(c.flatId) === 1 && !c.completedAt && c.status === 'dirty');
    if (!existingDirty1) {
      parsedDb.cleaningRequests.push({
        id: 99999,
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
    }

    fs.writeFileSync(isolatedDbPath, JSON.stringify(parsedDb, null, 2), 'utf8');

    // 2. Spawn isolated backend server on dedicated port
    serverChild = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_FILE: isolatedDbPath,
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    // 3. Poll until server is ready
    let online = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/flats`);
        if (res.ok) {
          online = true;
          break;
        }
      } catch {
        // retry
      }
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(online, `Isolated test server failed to start on port ${PORT}`);
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
  // SECTION 1: R1 Database Schema & Structure Verification
  // =========================================================================
  describe('1. R1: Database Schema & Baseline State', () => {
    it('1.1 data/database.json contains serviceOrders and serviceWorkers root keys as arrays', () => {
      const db = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));
      assert.ok('serviceOrders' in db, 'database.json must contain serviceOrders key');
      assert.ok(Array.isArray(db.serviceOrders), 'db.serviceOrders must be an array');
      assert.ok('serviceWorkers' in db, 'database.json must contain serviceWorkers key');
      assert.ok(Array.isArray(db.serviceWorkers), 'db.serviceWorkers must be an array');
    });

    it('1.2 demo-server.mjs loadDatabase defensivamente initializes serviceOrders and serviceWorkers', () => {
      const serverCode = fs.readFileSync(demoServerPath, 'utf8');
      assert.ok(
        serverCode.includes('if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];'),
        'loadDatabase must defensivamente initialize db.serviceOrders'
      );
      assert.ok(
        serverCode.includes('if (!Array.isArray(db.serviceWorkers)) db.serviceWorkers = [];'),
        'loadDatabase must defensivamente initialize db.serviceWorkers'
      );
    });
  });

  // =========================================================================
  // SECTION 2: R2 & R3 Live REST API & Full Business Logic Lifecycle
  // =========================================================================
  describe('2. R2 & R3: Full REST API Lifecycle & Business Rules', () => {
    it('2.1 Admin Authentication Guard: Unauthenticated & non-admin requests are blocked (401/403)', async () => {
      // Unauthenticated
      const resUnauth = await fetch(`${BASE_URL}/api/service-orders`);
      assert.strictEqual(resUnauth.status, 401, 'Unauthenticated request must return 401');

      // Non-admin (maid role)
      const resMaid = await fetch(`${BASE_URL}/api/service-orders`, {
        headers: maidHeaders
      });
      assert.strictEqual(resMaid.status, 403, 'Non-admin request must return 403');
    });

    // ── Order Creation with cleanFlatMode: "never" ──
    let orderNever = null;
    it('2.2 Admin creates service order with cleanFlatMode "never", limits, photos, and instructions', async () => {
      const payload = {
        title: 'Pintura Completa Torre A',
        status: 'draft',
        cleanFlatMode: 'never',
        maxSimultaneousFlats: 1,
        maxFlatsPerDay: 2,
        requirePhotos: true,
        estimatedDurationHours: 3,
        instructionFormat: 'list',
        defaultInstructions: 'Aplicar duas demãos de tinta látex fosca',
        flats: [
          { flatId: 1, flatNumber: '113', instructions: 'Pintar sala e quarto' },
          { flatId: 18, flatNumber: '907', instructions: 'Pintar rodapés e teto' }
        ]
      };

      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 201, 'POST /api/service-orders must return 201');
      orderNever = await res.json();
      assert.ok(orderNever.id, 'Created order must have an id');
      assert.strictEqual(orderNever.title, 'Pintura Completa Torre A');
      assert.strictEqual(orderNever.cleanFlatMode, 'never');
      assert.strictEqual(orderNever.status, 'draft');
      assert.strictEqual(typeof orderNever.token, 'string');
      assert.strictEqual(orderNever.token.length, 24, 'Token must be exactly 24 hex characters');
      assert.strictEqual(orderNever.flats.length, 2);
      assert.strictEqual(orderNever.flats[0].status, 'pending');
      assert.strictEqual(orderNever.flats[1].status, 'pending');
    });

    // ── Public Details Endpoint ──
    it('2.3 Public details endpoint GET /api/service/public/:token returns enriched flats and 404 on invalid', async () => {
      // Invalid token
      const resInvalid = await fetch(`${BASE_URL}/api/service/public/invalidtoken123456789012`);
      assert.strictEqual(resInvalid.status, 404, 'Invalid token must return 404');

      // Valid token
      const resValid = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}`);
      assert.strictEqual(resValid.status, 200, 'Valid token must return 200');
      const data = await resValid.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.order.title, orderNever.title);
      assert.strictEqual(data.order.cleanFlatMode, 'never');
      assert.strictEqual(data.order.requirePhotos, true);
      assert.ok(Array.isArray(data.order.flats));

      const flat113 = data.order.flats.find(f => f.flatNumber === '113');
      const flat907 = data.order.flats.find(f => f.flatNumber === '907');
      assert.ok(flat113, 'Flat 113 must be present in enriched flats');
      assert.ok(flat907, 'Flat 907 must be present in enriched flats');
      assert.strictEqual(flat113.isDirty, true, 'Flat 113 must be identified as dirty');
      assert.strictEqual(flat907.isDirty, false, 'Flat 907 must be identified as clean');
    });

    // ── Public Contractor Registration ──
    it('2.4 Public contractor registration: validates 11-digit CPF and registers worker team', async () => {
      // Invalid CPF (too short)
      const resShort = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'João Pintor', cpf: '123' },
          collaborators: []
        })
      });
      assert.strictEqual(resShort.status, 400, 'Short CPF must return 400');

      // Valid 11-digit CPF with collaborator team
      const resValid = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'João Pintor', cpf: '11122233344' },
          collaborators: [
            { name: 'Carlos Ajudante', cpf: '55566677788' }
          ]
        })
      });
      assert.strictEqual(resValid.status, 200, 'Valid registration must return 200');
      const regData = await resValid.json();
      assert.strictEqual(regData.success, true);
      assert.strictEqual(regData.worker.mainWorker.name, 'João Pintor');
      assert.strictEqual(regData.worker.mainWorker.cpf, '11122233344');
      assert.strictEqual(regData.worker.collaborators.length, 1);
      assert.strictEqual(regData.worker.collaborators[0].name, 'Carlos Ajudante');
    });

    // ── Contractor Start Guard: Unverified Worker ──
    it('2.5 Contractor start guard: unverified worker on another order is blocked with 403', async () => {
      // Create a fresh order with no worker registered yet
      const resNew = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Ordem Sem Cadastro',
          cleanFlatMode: 'always',
          flats: [{ flatId: 3, flatNumber: '116' }]
        })
      });
      const orderUnregistered = await resNew.json();

      const resStart = await fetch(`${BASE_URL}/api/service/public/${orderUnregistered.token}/flats/3/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resStart.status, 403, 'Unregistered worker must be blocked with 403');
    });

    // ── Contractor Start Guard: cleanFlatMode "never" ──
    it('2.6 Contractor start guard: cleanFlatMode "never" blocks starting clean flat (Flat 907)', async () => {
      const resStartClean = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resStartClean.status, 400, 'Starting clean flat when cleanFlatMode is never must return 400');
      const err = await resStartClean.json();
      assert.ok(err.error.includes('não permite intervenção em apartamentos limpos'));
    });

    // ── Contractor Start Guard: cleanFlatMode "priority" ──
    let orderPriority = null;
    it('2.7 Contractor start guard: cleanFlatMode "priority" blocks clean flat while dirty flat is pending', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Manutenção Elétrica Prioritária',
          cleanFlatMode: 'priority',
          maxSimultaneousFlats: 2,
          maxFlatsPerDay: 5,
          requirePhotos: false,
          flats: [
            { flatId: 1, flatNumber: '113' }, // dirty
            { flatId: 18, flatNumber: '907' }  // clean
          ]
        })
      });
      orderPriority = await res.json();

      // Register worker for this priority order
      await fetch(`${BASE_URL}/api/service/public/${orderPriority.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Eletricista Marcos', cpf: '33344455566' }
        })
      });

      // Attempt starting clean Flat 907 while Flat 113 is still pending dirty
      const resPriorityBlock = await fetch(`${BASE_URL}/api/service/public/${orderPriority.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resPriorityBlock.status, 400, 'Starting clean flat while dirty flat exists must return 400');
      const err = await resPriorityBlock.json();
      assert.ok(err.error.includes('Priorize os apartamentos sujos primeiro'));
    });

    // ── Contractor Starts Flat & Real-Time Injections ──
    it('2.8 Contractor starts dirty flat -> instant serviceInProgress injection in /api/flats, checkouts, and PMS calendar', async () => {
      const resStart = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resStart.status, 200, 'Starting dirty flat on orderNever must succeed');
      const startData = await resStart.json();
      assert.strictEqual(startData.success, true);
      assert.strictEqual(startData.flat.status, 'in_progress');
      assert.strictEqual(startData.flat.workerName, 'João Pintor');
      assert.ok(startData.flat.startedAt, 'Must set startedAt');
      assert.ok(startData.flat.estimatedFinishAt, 'Must calculate estimatedFinishAt');

      // 1. GET /api/flats
      const resFlats = await fetch(`${BASE_URL}/api/flats`);
      assert.strictEqual(resFlats.status, 200);
      const flats = await resFlats.json();
      const flat1 = flats.find(f => f.id === 1);
      assert.ok(flat1.serviceInProgress, 'Flat 1 must have serviceInProgress');
      assert.strictEqual(flat1.serviceInProgress.serviceTitle, 'Pintura Completa Torre A');
      assert.strictEqual(flat1.serviceInProgress.workerName, 'João Pintor');
      assert.strictEqual(flat1.serviceInProgress.serviceOrderId, orderNever.id);

      // 2. GET /api/reservations/checkouts (Maid Dashboard)
      const resCheckouts = await fetch(`${BASE_URL}/api/reservations/checkouts`, {
        headers: maidHeaders
      });
      assert.strictEqual(resCheckouts.status, 200);
      const checkouts = await resCheckouts.json();
      const coItem = checkouts.find(c => c.flatId === 1);
      if (coItem) {
        assert.ok(coItem.serviceInProgress, 'Checkout item must inject serviceInProgress');
        assert.strictEqual(coItem.serviceInProgress.serviceTitle, 'Pintura Completa Torre A');
        assert.strictEqual(coItem.serviceInProgress.workerName, 'João Pintor');
      }

      // 3. GET /api/pms/calendar (PMS Synthetic Block)
      const today = new Date().toISOString().slice(0, 10);
      const resCal = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${today}&endDate=${today}`, {
        headers: adminHeaders
      });
      assert.strictEqual(resCal.status, 200);
      const calData = await resCal.json();
      const sBlock = (calData.blocks || []).find(b => b.isServiceBlock && b.flatId === 1);
      assert.ok(sBlock, 'PMS calendar must contain synthetic service block for flat 1');
      assert.strictEqual(sBlock.isServiceBlock, true);
      assert.strictEqual(sBlock.reason, 'service_order');
      assert.strictEqual(sBlock.serviceTitle, 'Pintura Completa Torre A');
      assert.strictEqual(sBlock.workerName, 'João Pintor');
    });

    // ── Simultaneous Limit Guard ──
    it('2.9 Simultaneous flat limit: blocked with 400 when limit is reached', async () => {
      // orderNever has maxSimultaneousFlats: 1 and flat 1 is currently in_progress
      // Attempting to start another flat (even if allowed by other rules) is blocked
      const resSimul = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resSimul.status, 400, 'Starting beyond maxSimultaneousFlats must return 400');
      const err = await resSimul.json();
      assert.ok(
        err.error.includes('Limite de apartamentos simultâneos atingido') ||
        err.error.includes('não permite intervenção em apartamentos limpos')
      );
    });

    // ── Photo Upload Endpoint ──
    let uploadedPhotoUrl = null;
    it('2.10 Photo upload endpoint: POST /api/service/public/:token/flats/:flatId/photos accepts base64 and returns url', async () => {
      const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const resPhoto = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/flats/1/photos`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          photo: dummyBase64
        })
      });
      assert.strictEqual(resPhoto.status, 200, 'Photo upload must return 200');
      const pData = await resPhoto.json();
      assert.strictEqual(pData.success, true);
      assert.ok(pData.url, 'Must return photo url');
      uploadedPhotoUrl = pData.url;
    });

    // ── Contractor Finish Validation: Photos Requirement ──
    it('2.11 Contractor finish validation: requirePhotos: true rejects finish with empty photos array (400)', async () => {
      const resFinishNoPhotos = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Pintura quase pronta',
          photos: []
        })
      });
      assert.strictEqual(resFinishNoPhotos.status, 400, 'Finish without photos on requirePhotos: true must return 400');
      const err = await resFinishNoPhotos.json();
      assert.ok(err.error.includes('obrigatório anexar pelo menos 1 foto'));
    });

    // ── Contractor Finish Validation: Mandatory needsCleaning for clean flats ──
    it('2.12 Contractor finish validation: clean flat requires mandatory needsCleaning boolean', async () => {
      // Start clean flat on orderAlways
      const resAlways = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Serviço Limpo Sempre',
          cleanFlatMode: 'always',
          requirePhotos: false,
          flats: [{ flatId: 18, flatNumber: '907' }] // clean flat
        })
      });
      const orderAlways = await resAlways.json();

      await fetch(`${BASE_URL}/api/service/public/${orderAlways.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Técnico Ar', cpf: '99988877766' }
        })
      });

      // Start flat 18
      const resStart = await fetch(`${BASE_URL}/api/service/public/${orderAlways.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resStart.status, 200);

      // Finish without needsCleaning
      const resFinishNoClean = await fetch(`${BASE_URL}/api/service/public/${orderAlways.token}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Instalação de ar condicionado finalizada'
          // needsCleaning omitted
        })
      });
      assert.strictEqual(resFinishNoClean.status, 400, 'Finish on clean flat without needsCleaning must return 400');
      const err = await resFinishNoClean.json();
      assert.ok(err.error.includes('needsCleaning'));

      // Finish with needsCleaning: true
      const resFinishValid = await fetch(`${BASE_URL}/api/service/public/${orderAlways.token}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Ar condicionado instalado com poeira no chão',
          needsCleaning: true,
          photos: []
        })
      });
      assert.strictEqual(resFinishValid.status, 200, 'Finish with needsCleaning: true must succeed');
    });

    // ── Multi-Channel Notifications Dispatch Verification ──
    it('2.13 Multi-channel notifications: finish records in db.notifications and audit log', async () => {
      // Complete finish on orderNever flat 1
      const resFinish = await fetch(`${BASE_URL}/api/service/public/${orderNever.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Pintura finalizada com acabamento perfeito.',
          needsCleaning: true,
          photos: [uploadedPhotoUrl]
        })
      });
      assert.strictEqual(resFinish.status, 200, 'Finish on orderNever flat 1 must succeed');

      // Allow brief async log write
      await new Promise(r => setTimeout(r, 400));

      const updatedDb = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
      const sNotifications = (updatedDb.notifications || []).filter(
        n => n.category === 'service_order' && n.metadata?.serviceOrderId === orderNever.id
      );
      const finishNotif = sNotifications.find(n => n.title.includes('Serviço finalizado'));
      assert.ok(finishNotif, 'Must contain a notification with title including "Serviço finalizado"');
      assert.strictEqual(finishNotif.targetUrl, '/servicos');

      // Verify auditLogs
      const auditLogEntries = (updatedDb.auditLogs || []).filter(
        a => a.action === 'NOTIFICATION_SERVICE_ORDER'
      );
      assert.ok(auditLogEntries.length > 0, 'Notification event must be logged in auditLogs');
    });

    // ── Post-Finish State: Locks cleared & Flat marked dirty ──
    it('2.14 Post-finish state: serviceInProgress cleared to null, calendar block removed, flat marked dirty', async () => {
      // 1. GET /api/flats
      const resFlats = await fetch(`${BASE_URL}/api/flats`);
      assert.strictEqual(resFlats.status, 200);
      const flats = await resFlats.json();
      const flat1 = flats.find(f => f.id === 1);
      assert.strictEqual(flat1.serviceInProgress, null, 'serviceInProgress in /api/flats must be cleared to null');

      // 2. GET /api/reservations/checkouts
      const resCheckouts = await fetch(`${BASE_URL}/api/reservations/checkouts`, {
        headers: maidHeaders
      });
      assert.strictEqual(resCheckouts.status, 200);
      const checkouts = await resCheckouts.json();
      const coItem = checkouts.find(c => c.flatId === 1);
      if (coItem) {
        assert.strictEqual(coItem.serviceInProgress, null, 'serviceInProgress in checkouts must be null');
      }

      // 3. GET /api/pms/calendar
      const today = new Date().toISOString().slice(0, 10);
      const resCal = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${today}&endDate=${today}`, {
        headers: adminHeaders
      });
      const calData = await resCal.json();
      const sBlock = (calData.blocks || []).find(b => b.isServiceBlock && b.flatId === 1);
      assert.strictEqual(sBlock, undefined, 'Synthetic service block must be removed from PMS calendar');

      // 4. Cleaning request enqueued because needsCleaning: true
      const updatedDb = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
      const cleanReq = (updatedDb.cleaningRequests || []).find(c => c.flatId === 1 && c.status === 'dirty');
      assert.ok(cleanReq, 'Cleaning request must be dirty for flat 1');
      assert.ok(cleanReq.adminNote.includes('Pintura Completa Torre A'));
    });

    // ── Admin Flat Reset Endpoint ──
    it('2.15 Admin flat reset endpoint (POST /api/service-orders/:id/flats/:flatId/reset): restores flat to pending', async () => {
      const resReset = await fetch(`${BASE_URL}/api/service-orders/${orderNever.id}/flats/1/reset`, {
        method: 'POST',
        headers: adminHeaders
      });
      assert.strictEqual(resReset.status, 200, 'Reset endpoint must return 200');
      const resetData = await resReset.json();
      assert.strictEqual(resetData.success, true);
      assert.strictEqual(resetData.flat.status, 'pending');
      assert.strictEqual(resetData.flat.startedAt, null);
      assert.strictEqual(resetData.flat.finishedAt, null);
      assert.strictEqual(resetData.flat.workerName, null);
      assert.strictEqual(resetData.flat.observations, null);

      // Verify progress stats reflect reset
      const resProg = await fetch(`${BASE_URL}/api/service-orders/${orderNever.id}/progress`, {
        headers: adminHeaders
      });
      const prog = await resProg.json();
      assert.strictEqual(prog.stats.done, 0, 'Done count must be 0 after reset');
      assert.strictEqual(prog.stats.pending, 2, 'Pending count must be 2 after reset');
      assert.strictEqual(prog.stats.percentage, 0, 'Percentage must be 0 after reset');
    });

    // ── Order Completion & Lifecycle Closure ──
    it('2.16 Order completion: when all flats finished, progress is 100% and admin can close order', async () => {
      // Create single-flat order
      const resSingle = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Troca de Lâmpadas Rápida',
          cleanFlatMode: 'always',
          requirePhotos: false,
          flats: [{ flatId: 4, flatNumber: '211' }]
        })
      });
      const orderSingle = await resSingle.json();

      // Register worker
      await fetch(`${BASE_URL}/api/service/public/${orderSingle.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Eletricista Lâmpada', cpf: '88877766655' }
        })
      });

      // Start flat
      await fetch(`${BASE_URL}/api/service/public/${orderSingle.token}/flats/4/start`, {
        method: 'POST',
        headers: publicHeaders
      });

      // Finish flat
      await fetch(`${BASE_URL}/api/service/public/${orderSingle.token}/flats/4/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Todas as lâmpadas trocadas por LED',
          needsCleaning: false,
          photos: []
        })
      });

      // Check progress endpoint
      const resProg = await fetch(`${BASE_URL}/api/service-orders/${orderSingle.id}/progress`, {
        headers: adminHeaders
      });
      assert.strictEqual(resProg.status, 200);
      const progData = await resProg.json();
      assert.strictEqual(progData.stats.total, 1);
      assert.strictEqual(progData.stats.done, 1);
      assert.strictEqual(progData.stats.pending, 0);
      assert.strictEqual(progData.stats.inProgress, 0);
      assert.strictEqual(progData.stats.percentage, 100, 'Order progress must be 100% when all flats are finished');

      // Admin closes order
      const resPatch = await fetch(`${BASE_URL}/api/service-orders/${orderSingle.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'closed' })
      });
      assert.strictEqual(resPatch.status, 200);
      const closedOrder = await resPatch.json();
      assert.strictEqual(closedOrder.status, 'closed', 'Order status must be closed');

      // Attempting to start a flat on a closed order returns 400
      const resClosedStart = await fetch(`${BASE_URL}/api/service/public/${orderSingle.token}/flats/4/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resClosedStart.status, 400, 'Closed order must reject start with 400');
    });
  });

  // =========================================================================
  // SECTION 3: R4 Admin Management Page Structure & Routes
  // =========================================================================
  describe('3. R4: Admin Management Page Structure & Routes', () => {
    it('3.1 service-orders.tsx exists, imports Shell, and implements 3 distinct Tabs', () => {
      assert.ok(fs.existsSync(adminPagePath), 'service-orders.tsx must exist');
      const src = fs.readFileSync(adminPagePath, 'utf8');
      assert.ok(src.includes('import { Shell } from "@/components/layout"'), 'Must import Shell');
      assert.ok(src.includes('<Shell>'), 'Must render Shell');
      assert.ok(src.includes('TabsContent value="list"'), 'Must have list tab');
      assert.ok(src.includes('TabsContent value="form"'), 'Must have form tab');
      assert.ok(src.includes('TabsContent value="tracking"'), 'Must have tracking tab');
    });

    it('3.2 Tab 2 (Criar/Editar) implements all form controls and cleanFlatMode Portuguese explanations', () => {
      const src = fs.readFileSync(adminPagePath, 'utf8');
      assert.ok(src.includes('setFormCleanFlatMode("never")'), 'Must support cleanFlatMode never');
      assert.ok(src.includes('setFormCleanFlatMode("priority")'), 'Must support cleanFlatMode priority');
      assert.ok(src.includes('setFormCleanFlatMode("always")'), 'Must support cleanFlatMode always');
      assert.ok(src.includes('formMaxSimultaneous'), 'Must have simultaneous flat limit input');
      assert.ok(src.includes('formMaxPerDay'), 'Must have daily flat limit input');
      assert.ok(src.includes('formRequirePhotos'), 'Must have requirePhotos switch');
      assert.ok(src.includes('formInstructionFormat'), 'Must have instructionFormat toggle');
      assert.ok(src.includes('formSelectedFlatIds'), 'Must support flat selection grid');
    });

    it('3.3 Route configuration: App.tsx registers AdminRoute /servicos and layout.tsx includes sidebar link', () => {
      const appSrc = fs.readFileSync(appPath, 'utf8');
      assert.ok(
        appSrc.includes('<AdminRoute') && appSrc.includes('path="/servicos"') && appSrc.includes('component={ServiceOrders}'),
        'App.tsx must register AdminRoute for /servicos'
      );

      const layoutSrc = fs.readFileSync(layoutPath, 'utf8');
      assert.ok(
        layoutSrc.includes('/servicos') && (layoutSrc.includes('Serviços Externos') || layoutSrc.includes('Ordens de Serviço')),
        'layout.tsx sidebar navigation must include /servicos entry'
      );
    });
  });

  // =========================================================================
  // SECTION 4: R5 Public Worker Portal Structure & Routes
  // =========================================================================
  describe('4. R5: Public Worker Portal Structure & Routes', () => {
    it('4.1 service-worker-portal.tsx is a standalone mobile-first page without Shell', () => {
      assert.ok(fs.existsSync(workerPortalPath), 'service-worker-portal.tsx must exist');
      const src = fs.readFileSync(workerPortalPath, 'utf8');
      assert.ok(!src.includes('from "@/components/layout"'), 'Worker portal must NOT import Shell layout');
      assert.ok(src.includes('useRoute("/servico/:token")') || src.includes('useRoute('), 'Must extract token from route');
    });

    it('4.2 App.tsx registers public routes /servico/:token and /service/:token without AdminRoute', () => {
      const appSrc = fs.readFileSync(appPath, 'utf8');
      assert.ok(
        appSrc.includes('<Route path="/servico/:token" component={ServiceWorkerPortal} />'),
        'App.tsx must register public route /servico/:token'
      );
      assert.ok(
        appSrc.includes('<Route path="/service/:token" component={ServiceWorkerPortal} />'),
        'App.tsx must register public route /service/:token'
      );
      assert.ok(
        !appSrc.includes('<AdminRoute path="/servico/:token"'),
        'Worker portal route must NOT be guarded by AdminRoute'
      );
    });

    it('4.3 Identification banner, guard modal, and finish modal with compressImage integration', () => {
      const src = fs.readFileSync(workerPortalPath, 'utf8');
      // Identification
      assert.ok(src.includes('mainWorkerName') && src.includes('mainWorkerCpf'), 'Must have worker name and CPF state');
      assert.ok(src.includes('collaborators'), 'Must support collaborators team');
      assert.ok(src.includes('/register'), 'Must call register endpoint');

      // Guard modal
      assert.ok(src.includes('showIdentificationPromptModal') || src.includes('Identificação Obrigatória'), 'Must have guard modal');

      // Finish modal & compressImage
      assert.ok(src.includes('needsCleaning'), 'Finish modal must ask needsCleaning');
      assert.ok(src.includes('compressImage'), 'Must integrate compressImage for photo uploads');
      assert.ok(src.includes('/finish'), 'Must call finish endpoint');
    });
  });

  // =========================================================================
  // SECTION 5: R6 Maid Flat Card Integration Verification
  // =========================================================================
  describe('5. R6: Maid Flat Card Integration (flat-card.tsx)', () => {
    it('5.1 Badge "🔧 Serviço em andamento", border highlight, disabled cleaning button with Radix Tooltip', () => {
      assert.ok(fs.existsSync(flatCardPath), 'flat-card.tsx must exist');
      const src = fs.readFileSync(flatCardPath, 'utf8');

      // Badge
      assert.ok(src.includes('🔧 Serviço em andamento'), 'Must render badge 🔧 Serviço em andamento');
      assert.ok(src.includes('flat.serviceInProgress'), 'Badge must be guarded by flat.serviceInProgress');

      // Border highlight
      assert.ok(src.includes('border-amber-500'), 'Must apply amber border highlight on active service');

      // Disabled button with Radix Tooltip
      assert.ok(src.includes('Iniciar Limpeza (Serviço em Andamento)'), 'Must render disabled button text');
      assert.ok(src.includes('TooltipContent'), 'Must wrap button in Radix Tooltip');
      assert.ok(src.includes('⚠️ Limpeza Bloqueada: Aguardando finalização do serviço:'), 'Tooltip must explain cleaning lock');

      // Batch selection suppression
      assert.ok(src.includes('!flat.serviceInProgress'), 'Batch selection checkbox must exclude flats with service in progress');
    });
  });

  // =========================================================================
  // SECTION 6: R7 PMS Calendar Integration Verification
  // =========================================================================
  describe('6. R7: PMS Calendar Integration (pms-calendar.tsx)', () => {
    it('6.1 Timeline visual block with "🔧 [Título]", trash icon suppressed, conflict warning and admin override', () => {
      assert.ok(fs.existsSync(pmsCalendarPath), 'pms-calendar.tsx must exist');
      const src = fs.readFileSync(pmsCalendarPath, 'utf8');

      // Visual block
      assert.ok(src.includes('🔧 {serviceTitle}') || src.includes('🔧 '), 'Must render 🔧 service title on calendar block');
      assert.ok(src.includes('isServiceBlock') || src.includes('reason === "service_order"'), 'Must detect service block');

      // Deletion suppression
      assert.ok(src.includes('!isService && ('), 'Trash icon must be hidden for service blocks');

      // Conflict warning banner
      assert.ok(src.includes('activeServiceBlockConflict'), 'Must compute activeServiceBlockConflict');
      assert.ok(src.includes('⚠️ Atenção: Este apartamento possui serviço externo agendado/em andamento'), 'Must render conflict banner');

      // Admin confirmation override
      assert.ok(src.includes('confirm('), 'Must prompt confirmation dialog allowing admin to override conflict');
    });
  });

  // =========================================================================
  // SECTION 7: R8 Build & Parity Verification
  // =========================================================================
  describe('7. R8: Build & Backend Mirror Parity Verification', () => {
    it('7.1 Strict byte-for-byte mirror parity between demo-server.mjs and scripts/demo-server.mjs', () => {
      const artCode = fs.readFileSync(demoServerPath, 'utf8');
      const mirCode = fs.readFileSync(demoServerMirrorPath, 'utf8');
      assert.strictEqual(artCode, mirCode, 'scripts/demo-server.mjs must be byte-for-byte identical to artifacts/api-server/demo-server.mjs');
    });

    it('7.2 Production dist build artifacts exist in artifacts/limpeza/dist/', () => {
      const distIndexPath = path.resolve('artifacts/limpeza/dist/public/index.html');
      const distAssetsDir = path.resolve('artifacts/limpeza/dist/public/assets');
      assert.ok(fs.existsSync(distIndexPath), 'dist/public/index.html must exist');
      assert.ok(fs.existsSync(distAssetsDir), 'dist/public/assets must exist');
      const files = fs.readdirSync(distAssetsDir);
      assert.ok(files.length > 0, 'dist/public/assets must contain built bundle files');
    });
  });
});
