import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Live HTTP API Tests for External Service Orders', () => {
  const PORT = 3987;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const prodDbPath = path.resolve('data/database.json');
  const isolatedDbPath = path.resolve('data/isolated-api-live-database.json');
  let serverProcess;

  // Session tokens based on getAuthUser implementation (v: 2)
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
    fs.copyFileSync(prodDbPath, isolatedDbPath);

    // Start server in background with custom PORT and isolated database
    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_URL: '', DATABASE_FILE: isolatedDbPath },
      stdio: 'pipe'
    });

    serverProcess.stderr.on('data', (d) => {
      // Ignore background task logs
    });

    // Wait for server to be responsive
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
    assert.ok(ready, 'Server did not start in time');
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    if (fs.existsSync(isolatedDbPath)) {
      try { fs.unlinkSync(isolatedDbPath); } catch {}
    }
  });

  let createdOrder = null;
  let orderToken = null;

  it('1. GET /api/service-orders requires admin authentication', async () => {
    // Unauthenticated
    const resNoAuth = await fetch(`${BASE_URL}/api/service-orders`);
    assert.strictEqual(resNoAuth.status, 401);

    // Non-admin (camareira)
    const resMaid = await fetch(`${BASE_URL}/api/service-orders`, { headers: maidHeaders });
    assert.strictEqual(resMaid.status, 403);

    // Admin
    const resAdmin = await fetch(`${BASE_URL}/api/service-orders`, { headers: adminHeaders });
    assert.strictEqual(resAdmin.status, 200);
    const data = await resAdmin.json();
    assert.ok(Array.isArray(data));
  });

  it('2. POST /api/service-orders creates order with 24-hex token and defaults', async () => {
    const payload = {
      title: 'Pintura e Reparos de Teste E2E',
      cleanFlatMode: 'priority',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 4,
      requirePhotos: true,
      estimatedDurationHours: 3,
      instructionFormat: 'text',
      defaultInstructions: 'Pintar rodapés e verificar tomadas',
      flats: [
        { flatId: 1, flatNumber: '113', instructions: 'Pintar sala e quarto' },
        { flatId: 2, flatNumber: '114' },
        { flatId: 3, flatNumber: '116' }
      ]
    };

    const res = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    createdOrder = await res.json();

    assert.ok(createdOrder.id.startsWith('so_'));
    assert.strictEqual(createdOrder.title, payload.title);
    assert.strictEqual(createdOrder.token.length, 24, 'Token must be exactly 24 hex characters');
    assert.match(createdOrder.token, /^[0-9a-f]{24}$/, 'Token must be valid hexadecimal');
    assert.strictEqual(createdOrder.flats.length, 3);
    assert.strictEqual(createdOrder.flats[0].instructions, 'Pintar sala e quarto');
    assert.strictEqual(createdOrder.flats[1].instructions, payload.defaultInstructions);

    orderToken = createdOrder.token;
  });

  it('3. GET /api/service-orders/:id returns order details for admin', async () => {
    const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
      headers: adminHeaders
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, createdOrder.id);
    assert.strictEqual(data.title, createdOrder.title);
  });

  it('4. PATCH /api/service-orders/:id updates configuration', async () => {
    const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        maxSimultaneousFlats: 1,
        title: 'Pintura e Reparos de Teste E2E (Atualizado)'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.maxSimultaneousFlats, 1);
    assert.strictEqual(data.title, 'Pintura e Reparos de Teste E2E (Atualizado)');
  });

  it('5. GET /api/service-orders/:id/progress returns aggregated progress', async () => {
    const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}/progress`, {
      headers: adminHeaders
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.stats.total, 3);
    assert.strictEqual(data.stats.done, 0);
    assert.strictEqual(data.stats.inProgress, 0);
    assert.strictEqual(data.stats.pending, 3);
    assert.strictEqual(data.stats.percentage, 0);
  });

  it('6. GET /api/service/public/:token returns public data and handles invalid tokens', async () => {
    // Invalid token -> 404
    const resInvalid = await fetch(`${BASE_URL}/api/service/public/000000000000000000000000`);
    assert.strictEqual(resInvalid.status, 404);

    // Valid token -> 200 without authentication
    const resValid = await fetch(`${BASE_URL}/api/service/public/${orderToken}`);
    assert.strictEqual(resValid.status, 200);
    const data = await resValid.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.order.title, 'Pintura e Reparos de Teste E2E (Atualizado)');
    assert.strictEqual(data.order.flats.length, 3);
    assert.strictEqual(data.worker, null, 'Worker should not be registered yet');
  });

  it('7. POST /api/service/public/:token/flats/:flatId/start fails if worker not registered (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('se identificar'));
  });

  it('8. POST /api/service/public/:token/register validates and registers worker identification', async () => {
    // Missing fields
    const resInvalid = await fetch(`${BASE_URL}/api/service/public/${orderToken}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ mainWorker: { name: 'João' } })
    });
    assert.strictEqual(resInvalid.status, 400);

    // Invalid CPF
    const resInvalidCpf = await fetch(`${BASE_URL}/api/service/public/${orderToken}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ mainWorker: { name: 'João Silva', cpf: '123' } })
    });
    assert.strictEqual(resInvalidCpf.status, 400);

    // Valid registration
    const resValid = await fetch(`${BASE_URL}/api/service/public/${orderToken}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'João Pintor', cpf: '12345678901' },
        collaborators: [{ name: 'Carlos Ajudante', cpf: '98765432100' }]
      })
    });
    assert.strictEqual(resValid.status, 200);
    const data = await resValid.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.worker.mainWorker.name, 'João Pintor');
    assert.strictEqual(data.worker.collaborators.length, 1);
  });

  it('9. POST /api/service/public/:token/flats/:flatId/start initiates flat service', async () => {
    const res = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.flat.status, 'in_progress');
    assert.strictEqual(data.flat.workerName, 'João Pintor');
    assert.ok(data.flat.startedAt);
  });

  it('10. POST /api/service/public/:token/flats/:flatId/start enforces maxSimultaneousFlats limit (400)', async () => {
    // maxSimultaneousFlats was set to 1 in patch test
    const res = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/2/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('simultâneos atingido'));
  });

  it('11. Injected serviceInProgress is visible on GET /api/flats and checkouts', async () => {
    const resFlats = await fetch(`${BASE_URL}/api/flats`);
    assert.strictEqual(resFlats.status, 200);
    const flats = await resFlats.json();
    const flat1 = flats.find(f => f.id === 1);
    assert.ok(flat1, 'Flat 1 should exist');
    assert.ok(flat1.serviceInProgress, 'Flat 1 should have serviceInProgress');
    assert.strictEqual(flat1.serviceInProgress.workerName, 'João Pintor');

    const resCheckouts = await fetch(`${BASE_URL}/api/reservations/checkouts`, { headers: maidHeaders });
    assert.strictEqual(resCheckouts.status, 200);
    const checkouts = await resCheckouts.json();
    const checkoutItem = checkouts.find(c => c.flatId === 1);
    if (checkoutItem) {
      assert.ok(checkoutItem.serviceInProgress);
      assert.strictEqual(checkoutItem.serviceInProgress.workerName, 'João Pintor');
    }
  });

  it('12. POST /api/service/public/:token/flats/:flatId/photos uploads photos', async () => {
    const fakeBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/photos`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ photo: fakeBase64 })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.url);
  });

  it('13. POST /api/service/public/:token/flats/:flatId/finish validates needsCleaning and requirePhotos', async () => {
    // Missing photos when requirePhotos is true
    const resNoPhotos = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ observations: 'Tudo pronto', needsCleaning: true, photos: [] })
    });
    assert.strictEqual(resNoPhotos.status, 400);
    const noPhotosData = await resNoPhotos.json();
    assert.ok(noPhotosData.error.includes('foto'));

    // Valid finish
    const resValid = await fetch(`${BASE_URL}/api/service/public/${orderToken}/flats/1/finish`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        observations: 'Pintura concluída com acabamento fosco',
        needsCleaning: true,
        photos: ['https://example.com/photo1.jpg']
      })
    });
    assert.strictEqual(resValid.status, 200);
    const validData = await resValid.json();
    assert.strictEqual(validData.success, true);
    assert.strictEqual(validData.flat.status, 'done');
    assert.ok(validData.flat.finishedAt);
    assert.strictEqual(validData.flat.needsCleaning, true);
  });

  it('14. Flat serviceInProgress is cleared after finish on GET /api/flats', async () => {
    const resFlats = await fetch(`${BASE_URL}/api/flats`);
    assert.strictEqual(resFlats.status, 200);
    const flats = await resFlats.json();
    const flat1 = flats.find(f => f.id === 1);
    assert.strictEqual(flat1.serviceInProgress, null, 'serviceInProgress should be cleared after finish');
  });

  it('15. POST /api/service-orders/:id/flats/:flatId/reset allows admin to reopen flat', async () => {
    const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}/flats/1/reset`, {
      method: 'POST',
      headers: adminHeaders
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.flat.status, 'pending');
    assert.strictEqual(data.flat.finishedAt, null);
  });

  it('16. DELETE /api/service-orders/:id removes order and associated workers', async () => {
    const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
      method: 'DELETE',
      headers: adminHeaders
    });
    assert.strictEqual(res.status, 200);

    const resCheck = await fetch(`${BASE_URL}/api/service-orders/${createdOrder.id}`, {
      headers: adminHeaders
    });
    assert.strictEqual(resCheck.status, 404);
  });
});
