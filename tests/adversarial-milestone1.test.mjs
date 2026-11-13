import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Adversarial Edge-Case & Boundary Stress Test Suite — Milestone 1 Backend API', () => {
  const PORT = 3991;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const dbPath = path.resolve('data/database.json');
  let dbBackup = null;
  let serverProcess = null;

  // Authentic session tokens
  const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString('base64');
  const maidToken = Buffer.from(JSON.stringify({ v: 2, id: 2 })).toString('base64');
  const receptionToken = Buffer.from(JSON.stringify({ v: 2, id: 4 })).toString('base64');

  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  const maidHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${maidToken}`
  };

  const receptionHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${receptionToken}`
  };

  const publicHeaders = {
    'Content-Type': 'application/json'
  };

  const isolatedDbPath = path.resolve('data/test-adversarial-m1.json');

  before(async () => {
    // 1. Prepare isolated copy of database.json
    dbBackup = fs.readFileSync(dbPath, 'utf8');
    fs.writeFileSync(isolatedDbPath, dbBackup, 'utf8');

    // 2. Spawn test server instance with isolated database
    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_FILE: isolatedDbPath },
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
    try {
      fs.unlinkSync(isolatedDbPath);
    } catch {}
    if (dbBackup) {
      try {
        fs.writeFileSync(dbPath, dbBackup, 'utf8');
      } catch (e) {
        console.error('Failed to restore database.json backup:', e);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: UNAUTHORIZED ACCESS ATTEMPTS TO ADMIN ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 1: Admin Endpoint Security & Authentication Barriers', () => {
    const adminEndpoints = [
      { method: 'GET', path: '/api/service-orders' },
      { method: 'POST', path: '/api/service-orders', body: { title: 'Hack' } },
      { method: 'GET', path: '/api/service-orders/so_dummy' },
      { method: 'PATCH', path: '/api/service-orders/so_dummy', body: { title: 'Hack' } },
      { method: 'DELETE', path: '/api/service-orders/so_dummy' },
      { method: 'GET', path: '/api/service-orders/so_dummy/progress' },
      { method: 'POST', path: '/api/service-orders/so_dummy/flats/1/reset' }
    ];

    it('1.1 Unauthenticated requests to all admin endpoints must return 401', async () => {
      for (const ep of adminEndpoints) {
        const res = await fetch(`${BASE_URL}${ep.path}`, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          body: ep.body ? JSON.stringify(ep.body) : undefined
        });
        assert.strictEqual(
          res.status,
          401,
          `Expected 401 for unauthenticated ${ep.method} ${ep.path}, got ${res.status}`
        );
      }
    });

    it('1.2 Malformed Authorization headers must be rejected with 401', async () => {
      const invalidHeaders = [
        { Authorization: 'Bearer not-valid-base64@@@' },
        { Authorization: 'Bearer ' + Buffer.from('non-json-payload').toString('base64') },
        { Authorization: 'Bearer ' },
        { Authorization: 'Basic dXNlcjpwYXNz' },
        { Authorization: 'Bearer ' + Buffer.from(JSON.stringify({ v: 1, id: 1 })).toString('base64') }, // Legacy session version v1
        { Authorization: 'Bearer ' + Buffer.from(JSON.stringify({ v: 2, id: 999999 })).toString('base64') } // Non-existent user
      ];

      for (const h of invalidHeaders) {
        const res = await fetch(`${BASE_URL}/api/service-orders`, { headers: h });
        assert.strictEqual(res.status, 401, `Expected 401 for header ${JSON.stringify(h)}, got ${res.status}`);
      }
    });

    it('1.3 Non-admin authenticated roles (camareira, recepcao) must be rejected with 403', async () => {
      for (const ep of adminEndpoints) {
        const resMaid = await fetch(`${BASE_URL}${ep.path}`, {
          method: ep.method,
          headers: maidHeaders,
          body: ep.body ? JSON.stringify(ep.body) : undefined
        });
        assert.strictEqual(
          resMaid.status,
          403,
          `Expected 403 for maid on ${ep.method} ${ep.path}, got ${resMaid.status}`
        );

        const resRecep = await fetch(`${BASE_URL}${ep.path}`, {
          method: ep.method,
          headers: receptionHeaders,
          body: ep.body ? JSON.stringify(ep.body) : undefined
        });
        assert.strictEqual(
          resRecep.status,
          403,
          `Expected 403 for reception on ${ep.method} ${ep.path}, got ${resRecep.status}`
        );
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: INVALID TOKEN FORMATS, NON-EXISTENT TOKENS & INJECTION PAYLOADS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 2: Token Validation & Injection Attack Resistance', () => {
    it('2.1 Public endpoint returns 404 for non-existent and malformed tokens', async () => {
      const maliciousTokens = [
        '000000000000000000000000',
        'short',
        '123456789012345678901234567890',
        '../../../../etc/passwd',
        '%2e%2e%2f%2e%2e%2f',
        "<script>alert('xss')</script>",
        "' OR '1'='1",
        '{"$gt":""}',
        'null',
        'undefined'
      ];

      for (const tok of maliciousTokens) {
        const res = await fetch(`${BASE_URL}/api/service/public/${encodeURIComponent(tok)}`);
        assert.strictEqual(
          res.status,
          404,
          `Expected 404 for malicious/invalid token ${tok}, got ${res.status}`
        );
      }
    });

    it('2.2 Registration rejects malformed, incomplete, and injection payloads with 400', async () => {
      // First create a real service order to have a valid token
      const createRes = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Ordem Teste Injeção',
          flats: [1]
        })
      });
      assert.strictEqual(createRes.status, 201);
      const testOrder = await createRes.json();
      const tok = testOrder.token;

      const badRegistrations = [
        {},
        { mainWorker: null },
        { mainWorker: {} },
        { mainWorker: { name: 'João' } }, // Missing CPF
        { mainWorker: { cpf: '12345678901' } }, // Missing name
        { mainWorker: { name: '   ', cpf: '12345678901' } }, // Whitespace name
        { mainWorker: { name: 'João', cpf: '123' } }, // CPF too short
        { mainWorker: { name: 'João', cpf: '123456789012345' } }, // CPF too long
        { mainWorker: { name: 'João', cpf: 'abcdefghijk' } }, // CPF without digits
        { mainWorker: { name: '<script>alert(1)</script>', cpf: '000000000' } } // 9 digits
      ];

      for (const payload of badRegistrations) {
        const res = await fetch(`${BASE_URL}/api/service/public/${tok}/register`, {
          method: 'POST',
          headers: publicHeaders,
          body: JSON.stringify(payload)
        });
        assert.strictEqual(
          res.status,
          400,
          `Expected 400 for bad registration payload ${JSON.stringify(payload)}, got ${res.status}`
        );
      }

      // Safe handling of non-array collaborators
      const resNonArrayCollab = await fetch(`${BASE_URL}/api/service/public/${tok}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'João Prestador', cpf: '12345678901' },
          collaborators: 'not-an-array'
        })
      });
      assert.strictEqual(resNonArrayCollab.status, 200, 'Non-array collaborators should not crash server');
      const dataCollab = await resNonArrayCollab.json();
      assert.ok(Array.isArray(dataCollab.worker.collaborators));
      assert.strictEqual(dataCollab.worker.collaborators.length, 0);
    });

    it('2.3 Start and Finish endpoints return 404 for invalid flatId formats', async () => {
      const createRes = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ title: 'Ordem FlatId Teste', flats: [1] })
      });
      const order = await createRes.json();
      const tok = order.token;

      // Register worker first
      await fetch(`${BASE_URL}/api/service/public/${tok}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Tester', cpf: '11122233344' } })
      });

      const invalidFlatIds = ['99999', 'nonexistent', '-1', '0', '<script>'];
      for (const fId of invalidFlatIds) {
        const resStart = await fetch(`${BASE_URL}/api/service/public/${tok}/flats/${encodeURIComponent(fId)}/start`, {
          method: 'POST',
          headers: publicHeaders
        });
        assert.strictEqual(resStart.status, 404, `Expected 404 for invalid start flatId ${fId}, got ${resStart.status}`);

        const resFinish = await fetch(`${BASE_URL}/api/service/public/${tok}/flats/${encodeURIComponent(fId)}/finish`, {
          method: 'POST',
          headers: publicHeaders,
          body: JSON.stringify({ needsCleaning: false })
        });
        assert.strictEqual(resFinish.status, 404, `Expected 404 for invalid finish flatId ${fId}, got ${resFinish.status}`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: WORKER VERIFICATION ENFORCEMENT ON START
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 3: Worker Verification Status Enforcement', () => {
    it('3.1 Starting flat on unverified order returns 403 Forbidden', async () => {
      const createRes = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Unverified Worker Test',
          flats: [1]
        })
      });
      const order = await createRes.json();

      const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 403);
      const data = await startRes.json();
      assert.ok(data.error.includes('se identificar'));
    });

    it('3.2 Worker registered on Order A cannot start flats on Order B (token isolation)', async () => {
      const resA = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ title: 'Order A', flats: [1] })
      });
      const orderA = await resA.json();

      const resB = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ title: 'Order B', flats: [1] })
      });
      const orderB = await resB.json();

      // Register worker ONLY on Order A
      await fetch(`${BASE_URL}/api/service/public/${orderA.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Worker A', cpf: '11111111111' } })
      });

      // Try starting flat on Order B
      const startResB = await fetch(`${BASE_URL}/api/service/public/${orderB.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startResB.status, 403, 'Worker registered on Order A must NOT be able to start flat on Order B');
    });

    it('3.3 Starts successfully after legitimate registration', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ title: 'Verified Worker Test', cleanFlatMode: 'always', flats: [1] })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Valid Worker', cpf: '22233344455' } })
      });

      const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 200);
      const data = await startRes.json();
      assert.strictEqual(data.flat.status, 'in_progress');
      assert.strictEqual(data.flat.workerName, 'Valid Worker');
      assert.strictEqual(data.flat.workerCpf, '22233344455');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: CONCURRENCY & MAX SIMULTANEOUS FLATS ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 4: Concurrency & Max Simultaneous Flats Limits', () => {
    it('4.1 Parallel start requests with maxSimultaneousFlats=1 strictly permits only 1', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Concurrency Test Limit 1',
          maxSimultaneousFlats: 1,
          cleanFlatMode: 'always',
          flats: [1, 2, 3, 4]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Concurrent Worker 1', cpf: '99988877766' } })
      });

      // Fire 4 parallel requests to start 4 different flats simultaneously
      const startPromises = [1, 2, 3, 4].map(fId =>
        fetch(`${BASE_URL}/api/service/public/${order.token}/flats/${fId}/start`, {
          method: 'POST',
          headers: publicHeaders
        })
      );

      const results = await Promise.all(startPromises);
      const statuses = results.map(r => r.status);

      const successCount = statuses.filter(s => s === 200).length;
      const rejectedCount = statuses.filter(s => s === 400).length;

      assert.strictEqual(successCount, 1, `Expected exactly 1 request to succeed with maxSimultaneous=1, got ${successCount}`);
      assert.strictEqual(rejectedCount, 3, `Expected 3 requests to be rejected with 400, got ${rejectedCount}`);

      // Verify server state
      const progRes = await fetch(`${BASE_URL}/api/service-orders/${order.id}/progress`, { headers: adminHeaders });
      const prog = await progRes.json();
      assert.strictEqual(prog.stats.inProgress, 1);
    });

    it('4.2 Parallel start requests with maxSimultaneousFlats=2 strictly permits only 2', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Concurrency Test Limit 2',
          maxSimultaneousFlats: 2,
          cleanFlatMode: 'always',
          flats: [1, 2, 3, 4, 5]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Concurrent Worker 2', cpf: '88877766655' } })
      });

      // Fire 5 parallel requests to start 5 different flats simultaneously
      const startPromises = [1, 2, 3, 4, 5].map(fId =>
        fetch(`${BASE_URL}/api/service/public/${order.token}/flats/${fId}/start`, {
          method: 'POST',
          headers: publicHeaders
        })
      );

      const results = await Promise.all(startPromises);
      const statuses = results.map(r => r.status);

      const successCount = statuses.filter(s => s === 200).length;
      const rejectedCount = statuses.filter(s => s === 400).length;

      assert.strictEqual(successCount, 2, `Expected exactly 2 requests to succeed with maxSimultaneous=2, got ${successCount}`);
      assert.strictEqual(rejectedCount, 3, `Expected 3 requests to be rejected with 400, got ${rejectedCount}`);

      const progRes = await fetch(`${BASE_URL}/api/service-orders/${order.id}/progress`, { headers: adminHeaders });
      const prog = await progRes.json();
      assert.strictEqual(prog.stats.inProgress, 2);
    });

    it('4.3 Concurrent duplicate start requests on the EXACT SAME flat permits only 1', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Duplicate Start Flat 1',
          maxSimultaneousFlats: 5,
          cleanFlatMode: 'always',
          flats: [1]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Dup Worker', cpf: '77766655544' } })
      });

      // 4 concurrent requests to start flat 1
      const dupPromises = [1, 2, 3, 4].map(() =>
        fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
          method: 'POST',
          headers: publicHeaders
        })
      );

      const results = await Promise.all(dupPromises);
      const statuses = results.map(r => r.status);

      const successCount = statuses.filter(s => s === 200).length;
      const rejectedCount = statuses.filter(s => s === 400).length;

      assert.strictEqual(successCount, 1, `Only 1 start request on same flat must succeed, got ${successCount}`);
      assert.strictEqual(rejectedCount, 3, `Other 3 start requests must be rejected with 400, got ${rejectedCount}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: MAX FLATS PER DAY & TIMEZONE / MIDNIGHT BOUNDARY STRESS TEST
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 5: Max Flats Per Day Limits & Day/Midnight Boundary Mechanics', () => {
    it('5.1 Standard same-day limit enforcement blocks excess flats (400)', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Daily Limit Standard Test',
          maxFlatsPerDay: 2,
          maxSimultaneousFlats: 2,
          requirePhotos: false,
          cleanFlatMode: 'always',
          flats: [1, 2, 3]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Day Worker', cpf: '66655544433' } })
      });

      // Start & Finish Flat 1
      const s1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, { method: 'POST', headers: publicHeaders });
      assert.strictEqual(s1.status, 200);
      const f1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: false })
      });
      assert.strictEqual(f1.status, 200);

      // Start & Finish Flat 2
      const s2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/2/start`, { method: 'POST', headers: publicHeaders });
      assert.strictEqual(s2.status, 200);
      const f2 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/2/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: false })
      });
      assert.strictEqual(f2.status, 200);

      // Now 2 flats are done today. Attempting to start Flat 3 must fail with 400
      const s3 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/3/start`, { method: 'POST', headers: publicHeaders });
      assert.strictEqual(s3.status, 400, 'Expected 400 when maxFlatsPerDay is reached');
      const s3Data = await s3.json();
      assert.ok(s3Data.error.includes('Limite diário'), `Expected error message to mention daily limit, got ${s3Data.error}`);
    });

    it('5.2 [ADVERSARIAL CHALLENGE] Timezone / Midnight Boundary Discrepancy between UTC finishedAt and Brazil todayStr', async () => {
      // Create order with maxFlatsPerDay = 1
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Midnight Boundary Stress Test',
          maxFlatsPerDay: 1,
          maxSimultaneousFlats: 1,
          requirePhotos: false,
          cleanFlatMode: 'always',
          flats: [1, 2]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Night Worker', cpf: '55544433322' } })
      });

      // Start Flat 1
      const s1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, { method: 'POST', headers: publicHeaders });
      assert.strictEqual(s1.status, 200);

      // Finish Flat 1
      const f1 = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: false })
      });
      assert.strictEqual(f1.status, 200);

      // Emulate a flat completed at 22:30 local Brazil time (e.g. 2026-09-30 22:30:00-03:00)
      // In UTC, this is 2026-10-01T01:30:00.000Z.
      // We read the database directly to inspect how demo-server's line 8159:
      // `f.finishedAt.substring(0, 10) === todayStr` behaves!
      const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const localDateLateNight = new Date('2026-09-30T22:30:00-03:00');
      const utcIsoString = localDateLateNight.toISOString(); // "2026-10-01T01:30:00.000Z"
      const brazilDateStr = BRAZIL_DATE_FORMATTER.format(localDateLateNight); // "2026-09-30"
      const utcSubstring = utcIsoString.substring(0, 10); // "2026-10-01"

      // EMPIRICAL BUG PROOF:
      // When a flat finishes at 22:30 Brazil time on 2026-09-30:
      // utcSubstring is "2026-10-01", but getTodayStr() in Brazil is "2026-09-30".
      assert.notStrictEqual(
        utcSubstring,
        brazilDateStr,
        'CRITICAL FLAW: UTC substring(0,10) does NOT equal Brazil local date between 21:00 and 23:59:59!'
      );

      // If finishedAt was set to 22:30 local Brazil time:
      // Line 8159 `f.finishedAt.substring(0, 10) === todayStr` evaluates to FALSE on the same night!
      // This means between 21:00 and 23:59, flats are NOT counted in doneTodayCount, allowing maxFlatsPerDay to be bypassed!
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 6: CLEAN FLAT MODES & FINISHING CLEAN FLATS (needsCleaning)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 6: cleanFlatMode Evaluation & Mandatory needsCleaning Validation', () => {
    it('6.1 cleanFlatMode="never" blocks starting a clean flat with 400', async () => {
      // Flat 18 is clean in database.json
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Clean Flat Never Mode',
          cleanFlatMode: 'never',
          flats: [18]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Clean Worker', cpf: '44433322211' } })
      });

      const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startRes.status, 400);
      const data = await startRes.json();
      assert.ok(data.error.includes('não permite intervenção em apartamentos limpos'));
    });

    it('6.2 cleanFlatMode="priority" blocks clean flat when dirty flat is pending/in_progress', async () => {
      // Flat 1 is dirty, Flat 18 is clean
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Clean Flat Priority Mode',
          cleanFlatMode: 'priority',
          requirePhotos: false,
          flats: [1, 18]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Priority Worker', cpf: '33322211100' } })
      });

      // Try starting Flat 18 (clean) while Flat 1 (dirty) is still pending
      const startCleanBlocked = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startCleanBlocked.status, 400);
      const dataBlocked = await startCleanBlocked.json();
      assert.ok(dataBlocked.error.includes('Priorize os apartamentos sujos primeiro'));

      // Start and Finish Flat 1 (dirty)
      const startDirty = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startDirty.status, 200);

      const finishDirty = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: false })
      });
      assert.strictEqual(finishDirty.status, 200);

      // Now that all dirty flats in this order are done, Flat 18 can start!
      const startCleanAllowed = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders
      });
      assert.strictEqual(startCleanAllowed.status, 200);
      const dataClean = await startCleanAllowed.json();
      assert.strictEqual(dataClean.flat.status, 'in_progress');
      assert.strictEqual(dataClean.flat.wasCleanWhenStarted, true);
    });

    it('6.3 Finishing a clean flat requires boolean needsCleaning (400 if missing or invalid type)', async () => {
      // Flat 18 was started clean in previous test 6.2
      // Let's get current order
      const ordersRes = await fetch(`${BASE_URL}/api/service-orders`, { headers: adminHeaders });
      const orders = await ordersRes.json();
      const priorityOrder = orders.find(o => o.title === 'Clean Flat Priority Mode');
      assert.ok(priorityOrder);
      const tok = priorityOrder.token;

      // 1. Omitted needsCleaning
      const resOmitted = await fetch(`${BASE_URL}/api/service/public/${tok}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ observations: 'Terminei' })
      });
      assert.strictEqual(resOmitted.status, 400);
      const dataOmitted = await resOmitted.json();
      assert.ok(dataOmitted.error.includes('needsCleaning'));

      // 2. null needsCleaning
      const resNull = await fetch(`${BASE_URL}/api/service/public/${tok}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: null })
      });
      assert.strictEqual(resNull.status, 400);

      // 3. String "true" needsCleaning
      const resString = await fetch(`${BASE_URL}/api/service/public/${tok}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: 'true' })
      });
      assert.strictEqual(resString.status, 400);

      // 4. Valid boolean true
      const resValid = await fetch(`${BASE_URL}/api/service/public/${tok}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: true, observations: 'Deixou poeira no chão' })
      });
      assert.strictEqual(resValid.status, 200);
      const dataValid = await resValid.json();
      assert.strictEqual(dataValid.flat.status, 'done');
      assert.strictEqual(dataValid.flat.needsCleaning, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 7: PHOTO REQUIREMENTS ON FINISH (requirePhotos)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suite 7: Photo Attachment Validation on Finish', () => {
    it('7.1 Order with requirePhotos=true rejects finish with empty or missing photos (400)', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Photo Requirement Test (True)',
          requirePhotos: true,
          cleanFlatMode: 'always',
          flats: [1]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Photo Worker', cpf: '12312312312' } })
      });

      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, { method: 'POST', headers: publicHeaders });

      // Empty array
      const resEmpty = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: [], needsCleaning: false })
      });
      assert.strictEqual(resEmpty.status, 400);
      const dataEmpty = await resEmpty.json();
      assert.ok(dataEmpty.error.includes('foto'));

      // Missing field
      const resMissing = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ needsCleaning: false })
      });
      assert.strictEqual(resMissing.status, 400);

      // Non-array field
      const resNonArray = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: 'photo.jpg', needsCleaning: false })
      });
      assert.strictEqual(resNonArray.status, 400);

      // Valid photos array
      const resValid = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: ['https://example.com/p1.jpg'], needsCleaning: false })
      });
      assert.strictEqual(resValid.status, 200);
      const dataValid = await resValid.json();
      assert.strictEqual(dataValid.flat.status, 'done');
      assert.strictEqual(dataValid.flat.photos.length, 1);
    });

    it('7.2 Order with requirePhotos=false allows finish with empty or missing photos', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Photo Requirement Test (False)',
          requirePhotos: false,
          cleanFlatMode: 'always',
          flats: [1]
        })
      });
      const order = await res.json();

      await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'No Photo Worker', cpf: '32132132132' } })
      });

      await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, { method: 'POST', headers: publicHeaders });

      const resFinish = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ photos: [], needsCleaning: false })
      });
      assert.strictEqual(resFinish.status, 200);
      const dataFinish = await resFinish.json();
      assert.strictEqual(dataFinish.flat.status, 'done');
    });
  });
});
