import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Challenger 2 Empirical Verification: Milestone 1 Remediation', () => {
  const PORT = 3996;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const dbPath = path.resolve('data/database.json');
  let dbBackup = null;
  let serverProcess = null;

  // Session token for admin (v: 2, id: 1)
  const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString('base64');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };
  const publicHeaders = {
    'Content-Type': 'application/json'
  };

  const SEED_NIGHT_ORDER_ID = 'so_test_night_order_21h';
  const SEED_CROSS_MIDNIGHT_ORDER_ID = 'so_test_cross_midnight_order';
  const SEED_CLOSED_ORDER_CALENDAR_ID = 'so_test_closed_cal_order';

  before(async () => {
    // 1. Snapshot database.json
    dbBackup = fs.readFileSync(dbPath, 'utf8');

    // 2. Pre-seed database with orders to test PMS calendar loading
    const dbObj = JSON.parse(dbBackup);
    if (!Array.isArray(dbObj.serviceOrders)) dbObj.serviceOrders = [];

    // Order 1: Started at 21:30 BRT on Sep 30 (00:30 UTC Oct 01), estimated finish 23:30 BRT (02:30 UTC Oct 01)
    dbObj.serviceOrders.push({
      id: SEED_NIGHT_ORDER_ID,
      title: 'Serviço Noturno 21h30',
      token: 'night21h0000000000000001',
      status: 'active',
      createdAt: '2026-10-01T00:25:00.000Z',
      createdBy: 'admin',
      cleanFlatMode: 'always',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 4,
      requirePhotos: false,
      estimatedDurationHours: 2,
      flats: [
        {
          flatId: 901,
          flatNumber: '901',
          instructions: 'Pintura noturna',
          status: 'in_progress',
          startedAt: '2026-10-01T00:30:00.000Z', // 21:30 BRT on 2026-09-30
          finishedAt: null,
          workerName: 'Pintor Noturno',
          workerCpf: '11122233344',
          estimatedFinishAt: '2026-10-01T02:30:00.000Z', // 23:30 BRT on 2026-09-30
          observations: null,
          photos: [],
          needsCleaning: null,
          wasCleanWhenStarted: false
        }
      ]
    });

    // Order 2: Started at 22:30 BRT on Sep 30 (01:30 UTC Oct 01), estimated finish 01:30 BRT on Oct 01 (04:30 UTC Oct 01)
    dbObj.serviceOrders.push({
      id: SEED_CROSS_MIDNIGHT_ORDER_ID,
      title: 'Serviço Cruza Meia-Noite',
      token: 'crossmid0000000000000002',
      status: 'active',
      createdAt: '2026-10-01T01:25:00.000Z',
      createdBy: 'admin',
      cleanFlatMode: 'always',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 4,
      requirePhotos: false,
      estimatedDurationHours: 3,
      flats: [
        {
          flatId: 902,
          flatNumber: '902',
          instructions: 'Manutenção elétrica',
          status: 'in_progress',
          startedAt: '2026-10-01T01:30:00.000Z', // 22:30 BRT on 2026-09-30
          finishedAt: null,
          workerName: 'Eletricista Noturno',
          workerCpf: '22233344455',
          estimatedFinishAt: '2026-10-01T04:30:00.000Z', // 01:30 BRT on 2026-10-01
          observations: null,
          photos: [],
          needsCleaning: null,
          wasCleanWhenStarted: false
        }
      ]
    });

    // Order 3: Closed order with in_progress flat (should NOT appear on calendar)
    dbObj.serviceOrders.push({
      id: SEED_CLOSED_ORDER_CALENDAR_ID,
      title: 'Serviço Encerrado Calendário',
      token: 'closedcal000000000000003',
      status: 'closed',
      createdAt: '2026-10-01T00:00:00.000Z',
      createdBy: 'admin',
      cleanFlatMode: 'always',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 4,
      requirePhotos: false,
      estimatedDurationHours: 2,
      flats: [
        {
          flatId: 903,
          flatNumber: '903',
          instructions: 'Teste fechado',
          status: 'in_progress',
          startedAt: '2026-10-01T00:30:00.000Z',
          finishedAt: null,
          workerName: 'Pintor',
          workerCpf: '33344455566',
          estimatedFinishAt: '2026-10-01T02:30:00.000Z',
          observations: null,
          photos: [],
          needsCleaning: null,
          wasCleanWhenStarted: false
        }
      ]
    });

    fs.writeFileSync(dbPath, JSON.stringify(dbObj, null, 2), 'utf8');

    // 3. Spawn demo-server on test port
    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
      stdio: 'pipe'
    });

    serverProcess.stderr.on('data', () => {});

    // 4. Wait until server responds
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/flats`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (e) {
        // waiting
      }
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, 'Test server failed to start within timeout');
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    if (dbBackup) {
      try {
        fs.writeFileSync(dbPath, dbBackup, 'utf8');
      } catch (e) {
        console.error('Failed to restore database.json backup:', e);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CHALLENGE 1: PMS Calendar Service Block Date Calculation (Started after 21:00 BRT)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Challenge 1: PMS Calendar Block Date Calculation for Evening Starts (> 21:00 BRT)', () => {
    it('1.1 Timezone date logic converts UTC ISO times to Brazil local dates across evening boundaries', () => {
      const brazilFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      // Exactly 21:00 BRT on Sep 30 = 00:00 UTC Oct 01
      const at21hUtc = '2026-10-01T00:00:00.000Z';
      assert.strictEqual(at21hUtc.substring(0, 10), '2026-10-01', 'Naive substring yields tomorrow');
      assert.strictEqual(brazilFormatter.format(new Date(at21hUtc)), '2026-09-30', 'Brazil formatter resolves Sep 30');

      // 21:30 BRT on Sep 30 = 00:30 UTC Oct 01
      const at21h30Utc = '2026-10-01T00:30:00.000Z';
      assert.strictEqual(brazilFormatter.format(new Date(at21h30Utc)), '2026-09-30');

      // 23:59:59 BRT on Sep 30 = 02:59:59 UTC Oct 01
      const at23h59Utc = '2026-10-01T02:59:59.000Z';
      assert.strictEqual(brazilFormatter.format(new Date(at23h59Utc)), '2026-09-30');

      // 00:00:01 BRT on Oct 01 = 03:00:01 UTC Oct 01
      const atMidnight1sUtc = '2026-10-01T03:00:01.000Z';
      assert.strictEqual(brazilFormatter.format(new Date(atMidnight1sUtc)), '2026-10-01');

      // Date-only string test (avoid ECMAScript UTC midnight rollback)
      const dateOnlyStr = '2026-09-30';
      // If regex /^\d{4}-\d{2}-\d{2}$/ is used, dateOnlyStr is returned as '2026-09-30'
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dateOnlyStr));
    });

    it('1.2 Live HTTP GET /api/pms/calendar places evening started service block on today (2026-09-30), NOT tomorrow', async () => {
      // Query PMS calendar for TODAY: 2026-09-30
      const resToday = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-09-30&end=2026-09-30`, {
        headers: adminHeaders
      });
      assert.strictEqual(resToday.status, 200);
      const dataToday = await resToday.json();

      const blockToday = (dataToday.blocks || []).find(b => b.isServiceBlock && b.serviceOrderId === SEED_NIGHT_ORDER_ID);
      assert.ok(blockToday, 'Service block for flat started at 21:30 BRT MUST be present in today\'s (2026-09-30) PMS calendar');
      assert.strictEqual(blockToday.startDate, '2026-09-30', 'startDate MUST be 2026-09-30 (today), NOT 2026-10-01');
      assert.strictEqual(blockToday.endDate, '2026-09-30', 'endDate MUST be 2026-09-30');
      assert.notStrictEqual(blockToday.startDate, '2026-10-01', 'CRITICAL CHECK: startDate must not be tomorrow');

      // Query PMS calendar for TOMORROW: 2026-10-01
      const resTomorrow = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-10-01&end=2026-10-01`, {
        headers: adminHeaders
      });
      assert.strictEqual(resTomorrow.status, 200);
      const dataTomorrow = await resTomorrow.json();
      const blockTomorrow = (dataTomorrow.blocks || []).find(b => b.isServiceBlock && b.serviceOrderId === SEED_NIGHT_ORDER_ID);
      assert.strictEqual(blockTomorrow, undefined, 'Block finishing at 23:30 BRT should NOT appear on tomorrow\'s calendar (2026-10-01)');
    });

    it('1.3 Live HTTP GET /api/pms/calendar handles service block spanning across midnight (22:30 -> 01:30 BRT)', async () => {
      // Sep 30 query
      const resSep30 = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-09-30&end=2026-09-30`, {
        headers: adminHeaders
      });
      assert.strictEqual(resSep30.status, 200);
      const dataSep30 = await resSep30.json();
      const blockSep30 = (dataSep30.blocks || []).find(b => b.isServiceBlock && b.serviceOrderId === SEED_CROSS_MIDNIGHT_ORDER_ID);
      assert.ok(blockSep30, 'Cross-midnight block must appear on Sep 30');
      assert.strictEqual(blockSep30.startDate, '2026-09-30', 'startDate must be 2026-09-30');
      assert.strictEqual(blockSep30.endDate, '2026-10-01', 'endDate must be 2026-10-01');

      // Oct 01 query
      const resOct01 = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-10-01&end=2026-10-01`, {
        headers: adminHeaders
      });
      assert.strictEqual(resOct01.status, 200);
      const dataOct01 = await resOct01.json();
      const blockOct01 = (dataOct01.blocks || []).find(b => b.isServiceBlock && b.serviceOrderId === SEED_CROSS_MIDNIGHT_ORDER_ID);
      assert.ok(blockOct01, 'Cross-midnight block must also appear on Oct 01');
      assert.strictEqual(blockOct01.startDate, '2026-09-30');
      assert.strictEqual(blockOct01.endDate, '2026-10-01');
    });

    it('1.4 Inactive or closed orders do NOT generate PMS calendar blocks', async () => {
      const res = await fetch(`${BASE_URL}/api/pms/calendar?start=2026-09-30&end=2026-10-05`, {
        headers: adminHeaders
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const closedBlock = (data.blocks || []).find(b => b.isServiceBlock && b.serviceOrderId === SEED_CLOSED_ORDER_CALENDAR_ID);
      assert.strictEqual(closedBlock, undefined, 'Closed orders must not produce service blocks on calendar');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CHALLENGE 2: Closed Service Order Start Flat Guard
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Challenge 2: Closed Service Order Guard on Start Flat', () => {
    it('2.1 Starting a flat in a closed service order returns 400 with error message', async () => {
      // Create active order (POST returns 201)
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Ordem a ser Fechada',
          cleanFlatMode: 'always',
          flats: [102, 103]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      // Register worker
      const resReg = await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Trabalhador 1', cpf: '99988877766' }
        })
      });
      assert.strictEqual(resReg.status, 200);

      // Close the order via PATCH
      const resClose = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'closed' })
      });
      assert.strictEqual(resClose.status, 200);
      const closedOrder = await resClose.json();
      assert.strictEqual(closedOrder.status, 'closed');

      // Attempt to start flat 102 on closed order
      const resStart = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/102/start`, {
        method: 'POST',
        headers: publicHeaders
      });

      assert.strictEqual(resStart.status, 400, 'Expected HTTP 400 when attempting to start a flat in a closed order');
      const startData = await resStart.json();
      assert.strictEqual(startData.success, false);
      assert.strictEqual(startData.error, 'Esta ordem de serviço está encerrada.');

      // Verify that flat 102 remains in 'pending' status
      const resProgress = await fetch(`${BASE_URL}/api/service-orders/${order.id}/progress`, {
        headers: adminHeaders
      });
      const progress = await resProgress.json();
      const f102 = progress.flats.find(f => f.flatNumber === '102' || f.flatId === 102);
      assert.strictEqual(f102.status, 'pending', 'Flat status must remain pending');
      assert.strictEqual(f102.startedAt, null, 'Flat startedAt must remain null');
    });

    it('2.2 Closed order start attempt by unregistered worker also returns 400 (order status checked first)', async () => {
      // Create new order
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Ordem Fechada Sem Registro',
          cleanFlatMode: 'always',
          flats: [104]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      // Immediately close order
      await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'closed' })
      });

      // Try to start flat 104 without registering worker first
      const resStart = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/104/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resStart.status, 400, 'Expected 400 because order is closed before worker registration check');
      const data = await resStart.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error, 'Esta ordem de serviço está encerrada.');
    });

    it('2.3 Reopening closed order to active allows flat to be started normally', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Ordem Reativável',
          cleanFlatMode: 'always',
          flats: [105]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      // Close it
      await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'closed' })
      });

      // Reopen it
      const resReopen = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'active' })
      });
      assert.strictEqual(resReopen.status, 200);

      // Register worker
      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Trabalhador Reaberto', cpf: '00011122233' }
        })
      });

      // Start flat
      const resStart = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/105/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(resStart.status, 200);
      const startData = await resStart.json();
      assert.strictEqual(startData.flat.status, 'in_progress');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CHALLENGE 3: Empty or Whitespace Title in PATCH returns 400
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Challenge 3: Empty and Whitespace Title Validation in PATCH', () => {
    it('3.1 Reject empty string "" in PATCH with 400', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Título Original Válido',
          cleanFlatMode: 'always',
          flats: [106]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      const resPatch = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ title: '' })
      });
      assert.strictEqual(resPatch.status, 400, 'Expected 400 for empty string title');
      const data = await resPatch.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error, 'Título do serviço não pode ser vazio.');

      // Verify title was not corrupted
      const resGet = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { headers: adminHeaders });
      const currentOrder = await resGet.json();
      assert.strictEqual(currentOrder.title, 'Título Original Válido');
    });

    it('3.2 Reject whitespace-only strings ("   ", tabs, newlines) in PATCH with 400', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Título Antes de Whitespace',
          cleanFlatMode: 'always',
          flats: [107]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      const invalidTitles = ['   ', '     ', '\t', '\n', ' \t \r\n  '];
      for (const badTitle of invalidTitles) {
        const resPatch = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
          method: 'PATCH',
          headers: adminHeaders,
          body: JSON.stringify({ title: badTitle })
        });
        assert.strictEqual(resPatch.status, 400, `Expected 400 for title ${JSON.stringify(badTitle)}`);
        const data = await resPatch.json();
        assert.strictEqual(data.success, false);
        assert.strictEqual(data.error, 'Título do serviço não pode ser vazio.');
      }

      // Verify original title is still intact
      const resGet = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, { headers: adminHeaders });
      const currentOrder = await resGet.json();
      assert.strictEqual(currentOrder.title, 'Título Antes de Whitespace');
    });

    it('3.3 Accept valid title with leading/trailing spaces and verify trim', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Título Antigo',
          cleanFlatMode: 'always',
          flats: [108]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      const resPatch = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ title: '   Novo Título Aparado   ' })
      });
      assert.strictEqual(resPatch.status, 200);
      const data = await resPatch.json();
      assert.strictEqual(data.title, 'Novo Título Aparado');
    });

    it('3.4 PATCH with omitted title preserves existing title without error', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Preserve My Title',
          cleanFlatMode: 'always',
          flats: [109]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      const resPatch = await fetch(`${BASE_URL}/api/service-orders/${order.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ maxSimultaneousFlats: 3 })
      });
      assert.strictEqual(resPatch.status, 200);
      const data = await resPatch.json();
      assert.strictEqual(data.title, 'Preserve My Title');
      assert.strictEqual(data.maxSimultaneousFlats, 3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CHALLENGE 4: Whitespace-only Photo String in Finish with requirePhotos=true
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Challenge 4: Whitespace-only Photo String in Finish Endpoint', () => {
    it('4.1 Order with requirePhotos=true rejects whitespace-only photo strings with 400', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Requer Fotos Teste Whitespace',
          cleanFlatMode: 'always',
          requirePhotos: true,
          flats: [110]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      // Register worker
      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Fotógrafo', cpf: '55544433322' }
        })
      });

      // Start flat 110
      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/110/start`, {
        method: 'POST',
        headers: publicHeaders
      });

      // Test whitespace payloads
      const invalidPhotoPayloads = [
        ['   '],
        ['', ' '],
        ['\t', '\n'],
        ['   ', '   '],
        [null],
        [123, true]
      ];

      for (const photosPayload of invalidPhotoPayloads) {
        const resFinish = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/110/finish`, {
          method: 'POST',
          headers: publicHeaders,
          body: JSON.stringify({
            photos: photosPayload,
            needsCleaning: false,
            observations: 'Test observation'
          })
        });

        assert.strictEqual(resFinish.status, 400, `Expected 400 for photos ${JSON.stringify(photosPayload)}`);
        const data = await resFinish.json();
        assert.ok(data.error.includes('foto'), 'Error message must mention photo requirement');
      }

      // Verify flat is still in_progress
      const resProgress = await fetch(`${BASE_URL}/api/service-orders/${order.id}/progress`, {
        headers: adminHeaders
      });
      const progress = await resProgress.json();
      const f110 = progress.flats.find(f => f.flatNumber === '110' || f.flatId === 110);
      assert.strictEqual(f110.status, 'in_progress', 'Flat must remain in_progress after failed finish attempts');
    });

    it('4.2 Valid photos with extraneous whitespace are sanitized and trimmed on finish', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Fotos Válidas Com Espaços',
          cleanFlatMode: 'always',
          requirePhotos: true,
          flats: [111]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Fotógrafo 2', cpf: '55544433399' }
        })
      });

      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/111/start`, {
        method: 'POST',
        headers: publicHeaders
      });

      // Finish with a mix of whitespace items and one valid URL with whitespace
      const resFinish = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/111/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          photos: ['   ', '  https://storage.corpflats.com/foto_real.jpg  ', ''],
          needsCleaning: false,
          observations: 'Fotos anexadas'
        })
      });

      assert.strictEqual(resFinish.status, 200, 'Expected 200 when at least one valid photo string is present');
      const data = await resFinish.json();
      assert.strictEqual(data.flat.status, 'done');
      assert.strictEqual(data.flat.photos.length, 1, 'Only the trimmed valid photo should be stored');
      assert.strictEqual(data.flat.photos[0], 'https://storage.corpflats.com/foto_real.jpg', 'Photo URL must be trimmed');
    });

    it('4.3 Order with requirePhotos=false strips whitespace strings and stores clean empty array', async () => {
      const resOrder = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Fotos Opcionais Sanitizadas',
          cleanFlatMode: 'always',
          requirePhotos: false,
          flats: [112]
        })
      });
      assert.strictEqual(resOrder.status, 201);
      const order = await resOrder.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Sem Fotos', cpf: '77788899900' }
        })
      });

      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/112/start`, {
        method: 'POST',
        headers: publicHeaders
      });

      const resFinish = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/112/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          photos: ['   ', ''],
          needsCleaning: false
        })
      });

      assert.strictEqual(resFinish.status, 200);
      const data = await resFinish.json();
      assert.strictEqual(data.flat.status, 'done');
      assert.deepStrictEqual(data.flat.photos, [], 'Whitespace strings should be discarded, resulting in empty array');
    });
  });
});
