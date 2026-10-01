import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Adversarial Test: Service Order Notification Pipeline Integrity', () => {
  const PORT = 3997;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const prodDbPath = path.resolve('data/database.json');
  const isolatedDbPath = path.resolve('data/isolated-notifications-database.json');
  let serverProcess = null;

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

  before(async () => {
    fs.copyFileSync(prodDbPath, isolatedDbPath);

    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_URL: '', DATABASE_FILE: isolatedDbPath },
      stdio: 'pipe'
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
    assert.ok(ready, 'Server failed to start');
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    if (fs.existsSync(isolatedDbPath)) {
      try { fs.unlinkSync(isolatedDbPath); } catch {}
    }
  });

  it('Verifies internal notification (createNotification) is created when flat is started', async () => {
    // Create service order
    const orderRes = await fetch(`${BASE_URL}/api/service-orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Teste Notificação Interna',
        cleanFlatMode: 'always',
        requirePhotos: false,
        flats: [1]
      })
    });
    assert.strictEqual(orderRes.status, 201);
    const order = await orderRes.json();

    // Register worker
    await fetch(`${BASE_URL}/api/service/public/${order.token}/register`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({
        mainWorker: { name: 'Prestador Notificacao', cpf: '12312312399' }
      })
    });

    // Start flat
    const startRes = await fetch(`${BASE_URL}/api/service/public/${order.token}/flats/1/start`, {
      method: 'POST',
      headers: publicHeaders
    });
    assert.strictEqual(startRes.status, 200);

    // Wait a brief moment for async dispatch
    await new Promise(r => setTimeout(r, 500));

    // Verify notification exists in isolated db.notifications
    const currentDb = JSON.parse(fs.readFileSync(isolatedDbPath, 'utf8'));
    const notifications = (currentDb.notifications || []).filter(
      n => n.category === 'service_order' && n.metadata?.serviceOrderId === order.id
    );

    console.log(`[Notification Test] Service order notifications found: ${notifications.length}`);
    assert.ok(
      notifications.length > 0,
      'Internal notification MUST be created in db.notifications when flat is started'
    );
  });
});
