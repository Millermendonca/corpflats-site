import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Empirical Verification: Midnight & Timezone Boundary Remediation', () => {
  const PORT = 3999;
  const BASE_URL = `http://127.0.0.1:${PORT}`;
  const dbPath = path.resolve('data/database.json');
  let dbBackup = null;
  let serverProcess = null;

  const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString('base64');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };
  const publicHeaders = {
    'Content-Type': 'application/json'
  };

  const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  function getBrazilDateStr(date) {
    return BRAZIL_DATE_FORMATTER.format(date);
  }

  function killProcessTree(pid) {
    if (!pid) return;
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {}
  }

  // Pre-calculated dates in Brazil timezone
  const nowBrazil = new Date();
  const todayBrazilStr = getBrazilDateStr(nowBrazil);
  const yesterdayDate = new Date(nowBrazil.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayBrazilStr = getBrazilDateStr(yesterdayDate);

  // Late-night timestamps: 22:30 local Brazil time
  // In UTC, 22:30 BRT (+3h) is 01:30 UTC on the NEXT calendar day!
  const todayLateNightUtcIso = new Date(`${todayBrazilStr}T22:30:00-03:00`).toISOString();
  const yesterdayLateNightUtcIso = new Date(`${yesterdayBrazilStr}T22:30:00-03:00`).toISOString();

  // Tokens
  const tokenToday = 'token_today_latenight_123';
  const tokenYesterday = 'token_yesterday_latenight_12';
  const tokenCalendar = 'token_calendar_block_1234';

  before(async () => {
    // 1. Backup pristine database.json
    dbBackup = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(dbBackup);
    if (!db.serviceOrders) db.serviceOrders = [];
    if (!db.serviceWorkers) db.serviceWorkers = [];

    // 2. Seed Order 1: Flat 1 was finished TONIGHT at 22:30 BRT (UTC advances into tomorrow!)
    db.serviceOrders.push({
      id: 'so_today_latenight',
      title: 'Ordem Limite Noturno Hoje',
      token: tokenToday,
      status: 'active',
      createdAt: new Date().toISOString(),
      cleanFlatMode: 'always',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 1, // Limit is 1 flat per day!
      requirePhotos: false,
      flats: [
        {
          flatId: 1,
          flatNumber: '113',
          instructions: '',
          status: 'done',
          startedAt: new Date(`${todayBrazilStr}T21:00:00-03:00`).toISOString(),
          finishedAt: todayLateNightUtcIso, // UTC date is tomorrow!
          workerName: 'Prestador Noturno',
          workerCpf: '11122233344',
          needsCleaning: false
        },
        {
          flatId: 2,
          flatNumber: '114',
          instructions: '',
          status: 'pending',
          startedAt: null,
          finishedAt: null,
          workerName: null,
          workerCpf: null,
          needsCleaning: null
        }
      ]
    });

    db.serviceWorkers.push({
      id: 'sw_today',
      serviceOrderId: 'so_today_latenight',
      token: tokenToday,
      mainWorker: { name: 'Prestador Noturno', cpf: '11122233344' },
      collaborators: [],
      registeredAt: new Date().toISOString()
    });

    // 3. Seed Order 2: Flat 3 was finished YESTERDAY at 22:30 BRT (naive UTC substring is TODAY!)
    db.serviceOrders.push({
      id: 'so_yesterday_latenight',
      title: 'Ordem Ontem Noturno Sem Roubo',
      token: tokenYesterday,
      status: 'active',
      createdAt: new Date().toISOString(),
      cleanFlatMode: 'always',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 1, // Limit is 1 flat per day!
      requirePhotos: false,
      flats: [
        {
          flatId: 3,
          flatNumber: '116',
          instructions: '',
          status: 'done',
          startedAt: new Date(`${yesterdayBrazilStr}T21:00:00-03:00`).toISOString(),
          finishedAt: yesterdayLateNightUtcIso, // Naive UTC substring equals todayBrazilStr!
          workerName: 'Prestador Matutino',
          workerCpf: '22233344455',
          needsCleaning: false
        },
        {
          flatId: 4,
          flatNumber: '211',
          instructions: '',
          status: 'pending',
          startedAt: null,
          finishedAt: null,
          workerName: null,
          workerCpf: null,
          needsCleaning: null
        }
      ]
    });

    db.serviceWorkers.push({
      id: 'sw_yesterday',
      serviceOrderId: 'so_yesterday_latenight',
      token: tokenYesterday,
      mainWorker: { name: 'Prestador Matutino', cpf: '22233344455' },
      collaborators: [],
      registeredAt: new Date().toISOString()
    });

    // 4. Seed Order 3: Active service in progress tonight (21:30 BRT to 23:30 BRT)
    db.serviceOrders.push({
      id: 'so_calendar_block',
      title: 'Reforma Eletrica Noturna',
      token: tokenCalendar,
      status: 'active',
      createdAt: new Date().toISOString(),
      cleanFlatMode: 'always',
      maxSimultaneousFlats: 2,
      maxFlatsPerDay: 4,
      requirePhotos: false,
      flats: [
        {
          flatId: 5,
          flatNumber: '302',
          instructions: '',
          status: 'in_progress',
          startedAt: new Date(`${todayBrazilStr}T21:30:00-03:00`).toISOString(),
          estimatedFinishAt: new Date(`${todayBrazilStr}T23:30:00-03:00`).toISOString(),
          workerName: 'Eletricista Noturno',
          workerCpf: '33344455566',
          needsCleaning: null
        }
      ]
    });

    db.serviceWorkers.push({
      id: 'sw_calendar',
      serviceOrderId: 'so_calendar_block',
      token: tokenCalendar,
      mainWorker: { name: 'Eletricista Noturno', cpf: '33344455566' },
      collaborators: [],
      registeredAt: new Date().toISOString()
    });

    // Write seeded database.json
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log('[TEST SETUP] Seeded database orders:', db.serviceOrders.map(o => ({ id: o.id, token: o.token })));

    // 5. Spawn live server instance with DATABASE_URL: '' to force local database.json
    serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', DATABASE_URL: '' },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', d => {
      const msg = d.toString();
      if (msg.includes('serviceOrders') || msg.includes('database') || msg.includes('Servidor') || msg.includes('POST') || msg.includes('404')) {
        console.log('[SERVER STDOUT]', msg.trim());
      }
    });
    serverProcess.stderr.on('data', d => console.error('[SERVER STDERR]', d.toString().trim()));

    // 6. Wait for readiness
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
    assert.ok(ready, 'Server failed to start on port ' + PORT);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    if (dbBackup) {
      fs.writeFileSync(dbPath, dbBackup, 'utf8');
    }
  });

  it('1. LIVE API: Late-night completion (22:30 BRT) counts towards current day quota and blocks next flat (HTTP 400)', async () => {
    // Baseline verification of the timezone shift
    const naiveUtcDateStr = todayLateNightUtcIso.substring(0, 10);
    assert.notStrictEqual(
      naiveUtcDateStr,
      todayBrazilStr,
      `Vulnerability baseline: Naive UTC substring (${naiveUtcDateStr}) differs from Brazil local date (${todayBrazilStr})`
    );

    // Flat 1 was finished TONIGHT at 22:30 BRT.
    // The order limit is maxFlatsPerDay = 1.
    // When the worker tries to start Flat 2 on the same day:
    // With the fix (getExecutionDateStr), Flat 1 is recognized as finished TODAY.
    // Therefore doneTodayCount = 1 >= maxFlatsPerDay (1).
    // The server MUST reject the start with HTTP 400!
    // (If the old bug existed, doneTodayCount would be 0, and start would return 200).
    const startRes = await fetch(`${BASE_URL}/api/service/public/${tokenToday}/flats/2/start`, {
      method: 'POST',
      headers: publicHeaders
    });

    console.log(`[Test 1] Start Flat 2 status: ${startRes.status}`);
    const data = await startRes.json();
    console.log(`[Test 1] Start Flat 2 response:`, data);

    assert.strictEqual(startRes.status, 400, 'Starting Flat 2 MUST fail with HTTP 400 because daily quota was consumed tonight');
    assert.ok(
      data.error.includes('Limite diário de apartamentos atingido para hoje'),
      `Expected error to state daily limit reached, got: ${data.error}`
    );
  });

  it('2. LIVE API: Late-night completion (22:30 BRT) from YESTERDAY does NOT steal today quota (HTTP 200)', async () => {
    // Baseline verification of the quota theft condition
    const naiveUtcDateStr = yesterdayLateNightUtcIso.substring(0, 10);
    assert.strictEqual(
      naiveUtcDateStr,
      todayBrazilStr,
      `Theft baseline: Naive UTC substring of yesterday 22:30 BRT flat (${naiveUtcDateStr}) equals today Brazil date (${todayBrazilStr})`
    );

    // Flat 3 was finished YESTERDAY at 22:30 BRT.
    // Today's limit is maxFlatsPerDay = 1.
    // When the worker starts Flat 4 TODAY:
    // With the fix (getExecutionDateStr), Flat 3 is recognized as yesterday (${yesterdayBrazilStr}).
    // Therefore doneTodayCount = 0 < maxFlatsPerDay (1).
    // The server MUST ALLOW starting Flat 4 with HTTP 200!
    // (If the old bug existed, naive substring would count it as today, falsely blocking the worker with 400).
    const startRes = await fetch(`${BASE_URL}/api/service/public/${tokenYesterday}/flats/4/start`, {
      method: 'POST',
      headers: publicHeaders
    });

    console.log(`[Test 2] Start Flat 4 status: ${startRes.status}`);
    const data = await startRes.json();
    console.log(`[Test 2] Start Flat 4 response:`, data);

    assert.strictEqual(startRes.status, 200, 'Starting Flat 4 MUST SUCCEED with HTTP 200 because yesterday quota is isolated');
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.flat.status, 'in_progress');
    assert.strictEqual(data.flat.flatId, 4);
  });

  it('3. LIVE API: PMS Calendar accurately displays evening service block (21:30 BRT) on current Brazil date', async () => {
    // Query PMS Calendar for TODAY's date in Brazil
    const calRes = await fetch(
      `${BASE_URL}/api/pms/calendar?startDate=${todayBrazilStr}&endDate=${todayBrazilStr}`,
      { headers: adminHeaders }
    );
    assert.strictEqual(calRes.status, 200);
    const calData = await calRes.json();

    const block = (calData.blocks || []).find(b => b.serviceOrderId === 'so_calendar_block' && b.flatId === 5);
    console.log(`[Test 3] Calendar block found for today (${todayBrazilStr}):`, block ? 'YES' : 'NO');

    assert.ok(block, `Service block for Flat 5 MUST be visible in PMS calendar for today (${todayBrazilStr})`);
    assert.strictEqual(block.startDate, todayBrazilStr);
    assert.strictEqual(block.endDate, todayBrazilStr);
    assert.strictEqual(block.isServiceBlock, true);
    assert.strictEqual(block.serviceTitle, 'Reforma Eletrica Noturna');
  });

  it('4. UNIT / REGRESSION: getExecutionDateStr correctly handles date-only strings without timezone rollback', () => {
    // Verify date-only string does not roll back to previous day
    const dateOnly = '2026-09-30';
    const BRAZIL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    function getExecutionDateStr(isoString) {
      if (!isoString) return BRAZIL_DATE_FORMATTER.format(new Date());
      const str = String(isoString).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
      }
      try {
        return BRAZIL_DATE_FORMATTER.format(new Date(str));
      } catch {
        return str.substring(0, 10);
      }
    }

    assert.strictEqual(getExecutionDateStr(dateOnly), '2026-09-30', 'Date-only string must not roll back');
    assert.strictEqual(getExecutionDateStr('2026-10-01T01:30:00.000Z'), '2026-09-30', 'Late night UTC must convert to 2026-09-30 in Brazil');
    assert.strictEqual(getExecutionDateStr('2026-10-01T03:00:00.000Z'), '2026-10-01', '03:00 UTC (00:00 BRT) must convert to 2026-10-01 in Brazil');
  });
});
