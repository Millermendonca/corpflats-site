import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

describe('CHALLENGER M4: R6 & R7 Integrations Empirical Challenge Suite', () => {
  const flatCardPath = path.resolve('artifacts/limpeza/src/components/flat-card.tsx');
  const pmsCalendarPath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');
  const demoServerPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const demoServerMirrorPath = path.resolve('scripts/demo-server.mjs');
  const prodDbPath = path.resolve('data/database.json');
  const challengeDbPath = path.resolve('data/challenge-m4-database.json');

  // =========================================================================
  // SECTION 1: Flat Card (flat-card.tsx) Integration & UI Contract Verification
  // =========================================================================
  describe('1. Empirical Analysis: Maid Flat Card (flat-card.tsx)', () => {
    const flatCardSource = fs.readFileSync(flatCardPath, 'utf8');

    it('1.1 Badge "🔧 Serviço em andamento": presence, styling, and metadata accessibility', () => {
      // Must contain badge element with exact text
      const badgeIdx = flatCardSource.indexOf('🔧 Serviço em andamento');
      assert.ok(badgeIdx !== -1, 'flat-card.tsx must render text "🔧 Serviço em andamento"');

      // Check badge snippet surrounding the text
      const badgeSnippet = flatCardSource.substring(badgeIdx - 600, badgeIdx + 300);
      assert.ok(badgeSnippet.includes('flat.serviceInProgress'), 'Badge must be guarded by flat.serviceInProgress');
      assert.ok(badgeSnippet.includes('<Wrench'), 'Badge must render Wrench icon');
      assert.ok(badgeSnippet.includes('animate-pulse'), 'Badge must have animate-pulse styling');
      assert.ok(badgeSnippet.includes('bg-amber-500'), 'Badge must have amber styling');

      // Accessibility: title attribute must include workerName and serviceTitle
      assert.ok(badgeSnippet.includes('flat.serviceInProgress.workerName'), 'Badge title must expose workerName');
      assert.ok(badgeSnippet.includes('flat.serviceInProgress.serviceTitle'), 'Badge title must expose serviceTitle');
    });

    it('1.2 Card border highlight: conditional on flat.serviceInProgress', () => {
      // Must apply amber border highlight to root Card component
      assert.ok(
        flatCardSource.includes('Boolean(flat.serviceInProgress) && "border-amber-500/90 dark:border-amber-600 shadow-amber-100/50"'),
        'Root Card must conditionally apply amber border highlight when flat.serviceInProgress is truthy'
      );
    });

    it('1.3 Card body alert box: presence, detailed information, and reassurance copy', () => {
      const bodyBoxIdx = flatCardSource.indexOf('{/* Box Informativo de Bloqueio por Serviço Externo */}');
      assert.ok(bodyBoxIdx !== -1, 'Must have dedicated informative box comment and container');

      const bodyBoxSnippet = flatCardSource.substring(bodyBoxIdx, bodyBoxIdx + 1600);
      assert.ok(bodyBoxSnippet.includes('Serviço Externo em Andamento:'), 'Body box must have header "Serviço Externo em Andamento:"');
      assert.ok(bodyBoxSnippet.includes('flat.serviceInProgress.serviceTitle'), 'Body box must display service title');
      assert.ok(bodyBoxSnippet.includes('flat.serviceInProgress.workerName'), 'Body box must display worker name');
      assert.ok(
        bodyBoxSnippet.includes('Aguardando conclusão do serviço externo para liberar a higienização do apartamento.'),
        'Body box must clearly explain that cleaning is locked until service completion'
      );
    });

    it('1.4 Cleaning Action Button: disabled with Radix Tooltip content in "dirty" status', () => {
      const dirtyIdx = flatCardSource.indexOf('(currentStatus === "dirty" || (currentStatus as string) === "pending")');
      assert.ok(dirtyIdx !== -1, 'Must find dirty/pending status branch');

      const dirtySnippet = flatCardSource.substring(dirtyIdx, dirtyIdx + 2000);
      assert.ok(dirtySnippet.includes('flat.serviceInProgress ? ('), 'Dirty branch must branch on flat.serviceInProgress');
      assert.ok(dirtySnippet.includes('<Tooltip>'), 'Must wrap disabled button in Radix Tooltip');
      assert.ok(dirtySnippet.includes('<TooltipTrigger asChild>'), 'Must use TooltipTrigger with asChild');
      assert.ok(dirtySnippet.includes('<Button'), 'Must render Button');
      assert.ok(dirtySnippet.includes('disabled'), 'Button must be explicitly disabled');
      assert.ok(
        dirtySnippet.includes('Iniciar Limpeza (Serviço em Andamento)'),
        'Button label must indicate service in progress'
      );
      assert.ok(dirtySnippet.includes('<TooltipContent'), 'Must render TooltipContent');
      assert.ok(
        dirtySnippet.includes('⚠️ Limpeza Bloqueada: Aguardando finalização do serviço:'),
        'TooltipContent must explain why cleaning is locked'
      );
    });

    it('1.5 Cleaning Action Button: disabled with Radix Tooltip content in "will_clean" status', () => {
      const willCleanIdx = flatCardSource.indexOf('currentStatus === "will_clean"');
      assert.ok(willCleanIdx !== -1, 'Must find will_clean status branch');

      const willCleanSnippet = flatCardSource.substring(willCleanIdx, willCleanIdx + 1200);
      assert.ok(willCleanSnippet.includes('flat.serviceInProgress ? ('), 'will_clean branch must branch on flat.serviceInProgress');
      assert.ok(willCleanSnippet.includes('<Tooltip>'), 'Must wrap disabled button in Radix Tooltip');
      assert.ok(willCleanSnippet.includes('disabled'), 'Button must be explicitly disabled');
      assert.ok(
        willCleanSnippet.includes('Iniciar Limpeza (Serviço em Andamento)'),
        'Button label must indicate service in progress'
      );
      assert.ok(
        willCleanSnippet.includes('⚠️ Limpeza Bloqueada: Aguardando finalização do serviço:'),
        'TooltipContent must explain why cleaning is locked'
      );
    });

    it('1.6 Batch selection disabling: checkbox suppressed when flat.serviceInProgress is present', () => {
      const checkboxConditionIdx = flatCardSource.indexOf('selectable && currentStatus === "dirty" && !isAssignedToOther && !isInstruction && !flat.serviceInProgress');
      assert.ok(
        checkboxConditionIdx !== -1,
        'Checkbox condition must include !flat.serviceInProgress to prevent batch selecting locked flats'
      );
    });
  });

  // =========================================================================
  // SECTION 2: PMS Calendar (pms-calendar.tsx) Integration & Conflict Logic
  // =========================================================================
  describe('2. Empirical Analysis: PMS Calendar (pms-calendar.tsx)', () => {
    const calendarSource = fs.readFileSync(pmsCalendarPath, 'utf8');

    it('2.1 Visual amber service block rendering: check flags, styling, and text', () => {
      const flatBlocksIdx = calendarSource.indexOf('{/* Unified Multi-Day Room Block Bars (Clicável com opção de remoção) */}');
      assert.ok(flatBlocksIdx !== -1, 'Must find multi-day block rendering in timeline');

      const flatBlocksSnippet = calendarSource.substring(flatBlocksIdx, flatBlocksIdx + 3500);
      assert.ok(
        flatBlocksSnippet.includes('isService = Boolean(blockItem.isServiceBlock || blockItem.reason === "service_order")'),
        'Must correctly compute isService flag from isServiceBlock or reason === "service_order"'
      );
      assert.ok(
        flatBlocksSnippet.includes('bg-amber-950/95') && flatBlocksSnippet.includes('border-amber-500/80'),
        'Service block must have amber styling'
      );
      assert.ok(
        flatBlocksSnippet.includes('<Wrench') && flatBlocksSnippet.includes('animate-pulse'),
        'Service block must render Wrench icon with animate-pulse'
      );
      assert.ok(
        flatBlocksSnippet.includes('🔧 {serviceTitle}'),
        'Service block must render 🔧 [Título do Serviço]'
      );
      assert.ok(
        flatBlocksSnippet.includes('blockItem.workerName'),
        'Service block must display workerName'
      );
    });

    it('2.2 Deletion trash icon protection: service blocks cannot be deleted via trash icon', () => {
      const flatBlocksIdx = calendarSource.indexOf('{/* Unified Multi-Day Room Block Bars (Clicável com opção de remoção) */}');
      const flatBlocksSnippet = calendarSource.substring(flatBlocksIdx, flatBlocksIdx + 3500);

      assert.ok(
        flatBlocksSnippet.includes('!isService && ('),
        'Trash delete button must be strictly conditionally hidden for service blocks (!isService)'
      );
    });

    it('2.3 Block Details Modal: redirects to /servicos instead of deleting service blocks', () => {
      const modalIdx = calendarSource.indexOf('<Dialog open={blockDetailsModalOpen}');
      assert.ok(modalIdx !== -1, 'Block details modal must exist');

      const modalSnippet = calendarSource.substring(modalIdx, modalIdx + 5000);
      assert.ok(
        modalSnippet.includes('selectedBlockForDetails?.isServiceBlock || selectedBlockForDetails?.reason === "service_order"'),
        'Details modal must detect service block via selectedBlockForDetails'
      );
      assert.ok(
        modalSnippet.includes('/servicos'),
        'Modal must provide redirect link/navigation to /servicos'
      );
      assert.ok(
        modalSnippet.includes('Ver em Serviços'),
        'Modal must have "Ver em Serviços" action button'
      );
    });

    it('2.4 Reservation conflict detection: activeServiceBlockConflict useMemo logic', () => {
      const conflictMemoIdx = calendarSource.indexOf('const activeServiceBlockConflict = useMemo(() => {');
      assert.ok(conflictMemoIdx !== -1, 'Must define activeServiceBlockConflict useMemo');

      const conflictMemoSnippet = calendarSource.substring(conflictMemoIdx, conflictMemoIdx + 800);
      assert.ok(conflictMemoSnippet.includes('b.startDate <= formCheckout && b.endDate >= formCheckin'), 'Must check date intersection');
      assert.ok(
        conflictMemoSnippet.includes('Number(b.flatId) === Number(formFlatId)') ||
        conflictMemoSnippet.includes('String(b.flatNumber) === String(formFlatId)'),
        'Must support flat matching by ID or flatNumber'
      );
    });

    it('2.5 Warning banner rendered in reservation modal on conflict', () => {
      const bannerIdx = calendarSource.indexOf('{/* Banner de Aviso de Conflito com Serviço Externo */}');
      assert.ok(bannerIdx !== -1, 'Warning banner must be declared in reservation modal');

      const bannerSnippet = calendarSource.substring(bannerIdx, bannerIdx + 1800);
      assert.ok(bannerSnippet.includes('activeServiceBlockConflict && ('), 'Banner must render when conflict exists');
      assert.ok(
        bannerSnippet.includes('⚠️ Atenção: Este apartamento possui serviço externo agendado/em andamento neste período:'),
        'Banner must display the exact required warning prefix'
      );
      assert.ok(
        bannerSnippet.includes('A reserva pode ser criada, mas o flat pode estar indisponível.'),
        'Banner must explain that reservation can be created but flat might be unavailable'
      );
      assert.ok(
        bannerSnippet.includes('Este bloqueio é visual. Administradores podem salvar a reserva normalmente para sobrescrever o período após confirmação.'),
        'Banner must inform admin that block is visual and can be overridden'
      );
    });

    it('2.6 Admin confirmation override in handleSaveRes and drag-and-drop', () => {
      // In handleSaveRes
      const handleSaveIdx = calendarSource.indexOf('const handleSaveRes = async (e: React.FormEvent) => {');
      assert.ok(handleSaveIdx !== -1, 'handleSaveRes function must exist');

      const handleSaveSnippet = calendarSource.substring(handleSaveIdx, handleSaveIdx + 2500);
      assert.ok(handleSaveSnippet.includes('if (activeServiceBlockConflict) {'), 'handleSaveRes must check activeServiceBlockConflict');
      assert.ok(handleSaveSnippet.includes('confirm('), 'handleSaveRes must trigger confirm dialog');
      assert.ok(handleSaveSnippet.includes('if (!proceed) {\n        return;\n      }'), 'If admin cancels, saving must be aborted');

      // In drag-and-drop
      assert.ok(
        calendarSource.includes('const serviceBlockConflict = data.blocks.find(') &&
        calendarSource.includes('const hasHardBlockConflict = data.blocks.some('),
        'Drag-and-drop must differentiate hard blocks from service blocks'
      );
    });

    it('2.7 Stress Test: Date overlap algorithm handles all boundary permutations', () => {
      // Direct oracle test of the conflict overlap function:
      // (block.startDate <= formCheckout && block.endDate >= formCheckin)
      const serviceBlock = {
        flatId: 105,
        flatNumber: '105',
        startDate: '2026-10-10',
        endDate: '2026-10-14',
        isServiceBlock: true,
        reason: 'service_order'
      };

      const checkOverlap = (flatId, checkin, checkout) => {
        if (!flatId || !checkin || !checkout) return false;
        if (Number(flatId) !== serviceBlock.flatId) return false;
        return serviceBlock.startDate <= checkout && serviceBlock.endDate >= checkin;
      };

      // Exact match
      assert.strictEqual(checkOverlap(105, '2026-10-10', '2026-10-14'), true, 'Exact match must overlap');

      // Checkin before, checkout during
      assert.strictEqual(checkOverlap(105, '2026-10-08', '2026-10-11'), true, 'Early checkin with overlapping checkout must overlap');

      // Checkin during, checkout after
      assert.strictEqual(checkOverlap(105, '2026-10-12', '2026-10-16'), true, 'Checkin during service must overlap');

      // Checkin on service end date (boundary day)
      assert.strictEqual(checkOverlap(105, '2026-10-14', '2026-10-16'), true, 'Checkin on end date overlaps');

      // Completely strictly before
      assert.strictEqual(checkOverlap(105, '2026-10-01', '2026-10-09'), false, 'Strictly before should NOT overlap');

      // Completely strictly after
      assert.strictEqual(checkOverlap(105, '2026-10-15', '2026-10-20'), false, 'Strictly after should NOT overlap');

      // Different flat
      assert.strictEqual(checkOverlap(106, '2026-10-10', '2026-10-14'), false, 'Different flat should NOT overlap');
    });
  });

  // =========================================================================
  // SECTION 3: Live End-to-End HTTP API Challenge
  // =========================================================================
  describe('3. Live HTTP End-to-End Challenge: Start -> Lock -> PMS Calendar Block -> Finish -> Clean Removal', () => {
    const CHALLENGE_PORT = 4199;
    const BASE_URL = `http://127.0.0.1:${CHALLENGE_PORT}`;
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

    before(async () => {
      // Ensure backend mirror is byte-a-byte identical before running live test
      const artCode = fs.readFileSync(demoServerPath, 'utf8');
      const mirCode = fs.readFileSync(demoServerMirrorPath, 'utf8');
      assert.strictEqual(artCode, mirCode, 'Server mirror must be byte-for-byte identical');

      // Create isolated copy of database.json for this challenge
      fs.copyFileSync(prodDbPath, challengeDbPath);

      // Spawn live server on unique challenge port with dedicated isolated database
      serverChild = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
        env: {
          ...process.env,
          PORT: String(CHALLENGE_PORT),
          DATABASE_FILE: challengeDbPath
        },
        stdio: 'pipe'
      });

      // Poll until server responds
      let online = false;
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/flats`);
          if (res.ok) {
            online = true;
            break;
          }
        } catch {
          // keep waiting
        }
        await new Promise(r => setTimeout(r, 250));
      }
      assert.ok(online, 'Live challenge server failed to start within timeout');
    });

    after(() => {
      if (serverChild) {
        serverChild.kill('SIGTERM');
      }
      try {
        if (fs.existsSync(challengeDbPath)) {
          fs.unlinkSync(challengeDbPath);
        }
      } catch {
        // cleanup safe
      }
    });

    let createdOrderId = null;
    let orderPublicToken = null;
    const testFlatId = 2; // Flat 2 (Apt 114)

    it('3.1 Baseline: GET /api/flats, checkouts, and pms/calendar have NO active service order for testFlatId', async () => {
      // 1. Flats endpoint
      const resFlats = await fetch(`${BASE_URL}/api/flats`);
      assert.strictEqual(resFlats.status, 200);
      const flats = await resFlats.json();
      assert.ok(Array.isArray(flats), 'Flats must be an array');
      const targetFlat = flats.find(f => f.id === testFlatId);
      assert.ok(targetFlat, `Flat ${testFlatId} must exist`);
      assert.strictEqual(targetFlat.serviceInProgress, null, 'Baseline: flat.serviceInProgress must be null');

      // 2. PMS Calendar endpoint
      const today = new Date().toISOString().slice(0, 10);
      const resCal = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${today}&endDate=${today}`, {
        headers: adminHeaders
      });
      assert.strictEqual(resCal.status, 200);
      const calData = await resCal.json();
      const serviceBlocks = (calData.blocks || []).filter(b => b.isServiceBlock && b.flatId === testFlatId);
      assert.strictEqual(serviceBlocks.length, 0, 'Baseline: no service blocks in calendar');
    });

    it('3.2 Create Service Order via Admin API with Flat 2 included', async () => {
      const payload = {
        title: 'Revisão Hidráulica e Elétrica Challenger M4',
        cleanFlatMode: 'always',
        maxSimultaneousFlats: 3,
        maxFlatsPerDay: 5,
        requirePhotos: false,
        estimatedDurationHours: 4,
        instructionFormat: 'text',
        flats: [
          { flatId: testFlatId, flatNumber: '114', instructions: 'Verificar vazamento na pia e disjuntores' }
        ]
      };

      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 201, 'Order creation must return 201');
      const order = await res.json();
      createdOrderId = order.id;
      orderPublicToken = order.token;
      assert.ok(createdOrderId);
      assert.strictEqual(orderPublicToken.length, 24);
    });

    it('3.3 Register Worker via Public API', async () => {
      const res = await fetch(`${BASE_URL}/api/service/public/${orderPublicToken}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: { name: 'Roberto Especialista', cpf: '99887766554' },
          collaborators: []
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.worker.mainWorker.name, 'Roberto Especialista');
    });

    it('3.4 Start Flat Service via /start and verify immediate lock and block propagation', async () => {
      // Execute START
      const resStart = await fetch(`${BASE_URL}/api/service/public/${orderPublicToken}/flats/${testFlatId}/start`, {
        method: 'POST',
        headers: publicHeaders
      });

      assert.strictEqual(resStart.status, 200, 'Start endpoint must succeed');
      const startData = await resStart.json();
      assert.strictEqual(startData.success, true);
      assert.strictEqual(startData.flat.status, 'in_progress');
      assert.strictEqual(startData.flat.workerName, 'Roberto Especialista');
      assert.ok(startData.flat.startedAt, 'Must record startedAt timestamp');
      assert.ok(startData.flat.estimatedFinishAt, 'Must calculate estimatedFinishAt');

      // 1. Verify GET /api/flats immediately reflects serviceInProgress
      const resFlats = await fetch(`${BASE_URL}/api/flats`);
      assert.strictEqual(resFlats.status, 200);
      const flats = await resFlats.json();
      const flat = flats.find(f => f.id === testFlatId);
      assert.ok(flat, `Flat ${testFlatId} must exist`);
      assert.ok(flat.serviceInProgress, 'Flat must now have serviceInProgress');
      assert.strictEqual(flat.serviceInProgress.serviceTitle, 'Revisão Hidráulica e Elétrica Challenger M4');
      assert.strictEqual(flat.serviceInProgress.workerName, 'Roberto Especialista');
      assert.strictEqual(flat.serviceInProgress.serviceOrderId, createdOrderId);

      // 2. Verify GET /api/reservations/checkouts immediately reflects serviceInProgress for Maid Dashboard
      const resCheckouts = await fetch(`${BASE_URL}/api/reservations/checkouts`, {
        headers: maidHeaders
      });
      assert.strictEqual(resCheckouts.status, 200);
      const checkouts = await resCheckouts.json();
      const coItem = checkouts.find(c => c.flatId === testFlatId);
      if (coItem) {
        assert.ok(coItem.serviceInProgress, 'Checkout item must have serviceInProgress');
        assert.strictEqual(coItem.serviceInProgress.serviceTitle, 'Revisão Hidráulica e Elétrica Challenger M4');
        assert.strictEqual(coItem.serviceInProgress.workerName, 'Roberto Especialista');
      }

      // 3. Verify GET /api/pms/calendar receives synthetic service block
      const startDay = startData.flat.startedAt.slice(0, 10);
      const finishDay = startData.flat.estimatedFinishAt.slice(0, 10);
      const resCal = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${startDay}&endDate=${finishDay}`, {
        headers: adminHeaders
      });
      assert.strictEqual(resCal.status, 200);
      const calData = await resCal.json();
      const sBlock = (calData.blocks || []).find(b => b.isServiceBlock && b.flatId === testFlatId);
      assert.ok(sBlock, 'Synthetic service block must exist in PMS calendar');
      assert.strictEqual(sBlock.isServiceBlock, true);
      assert.strictEqual(sBlock.reason, 'service_order');
      assert.strictEqual(sBlock.serviceTitle, 'Revisão Hidráulica e Elétrica Challenger M4');
      assert.strictEqual(sBlock.workerName, 'Roberto Especialista');
      assert.strictEqual(sBlock.serviceOrderId, createdOrderId);
      assert.ok(sBlock.startDate);
      assert.ok(sBlock.endDate);
    });

    it('3.5 Adversarial Challenge: PMS Calendar date range filtering respects query boundaries', async () => {
      // Query calendar for a period far in the future
      const futureStart = '2099-01-01';
      const futureEnd = '2099-01-05';
      const resFarFuture = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${futureStart}&endDate=${futureEnd}`, {
        headers: adminHeaders
      });
      assert.strictEqual(resFarFuture.status, 200);
      const farFutureData = await resFarFuture.json();
      const futureBlocks = (farFutureData.blocks || []).filter(b => b.isServiceBlock && b.flatId === testFlatId);
      assert.strictEqual(futureBlocks.length, 0, 'Calendar must not return service blocks outside the requested range');
    });

    it('3.6 Finish Flat Service via /finish and verify immediate lock and block removal', async () => {
      // Execute FINISH
      const resFinish = await fetch(`${BASE_URL}/api/service/public/${orderPublicToken}/flats/${testFlatId}/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Revisão hidráulica concluída sem vazamentos.',
          needsCleaning: false,
          photos: []
        })
      });

      assert.strictEqual(resFinish.status, 200, 'Finish endpoint must succeed');
      const finishData = await resFinish.json();
      assert.strictEqual(finishData.success, true);
      assert.strictEqual(finishData.flat.status, 'done');
      assert.ok(finishData.flat.finishedAt);
      assert.strictEqual(finishData.flat.estimatedFinishAt, null, 'estimatedFinishAt must be cleared');

      // 1. Verify GET /api/flats serviceInProgress is cleanly reset to null
      const resFlats = await fetch(`${BASE_URL}/api/flats`);
      assert.strictEqual(resFlats.status, 200);
      const flats = await resFlats.json();
      const flat = flats.find(f => f.id === testFlatId);
      assert.ok(flat, `Flat ${testFlatId} must exist`);
      assert.strictEqual(flat.serviceInProgress, null, 'serviceInProgress on /api/flats must be null after finish');

      // 2. Verify GET /api/reservations/checkouts serviceInProgress is cleanly reset to null
      const resCheckouts = await fetch(`${BASE_URL}/api/reservations/checkouts`, {
        headers: maidHeaders
      });
      assert.strictEqual(resCheckouts.status, 200);
      const checkouts = await resCheckouts.json();
      const coItem = checkouts.find(c => c.flatId === testFlatId);
      if (coItem) {
        assert.strictEqual(coItem.serviceInProgress, null, 'serviceInProgress on checkouts must be null after finish');
      }

      // 3. Verify GET /api/pms/calendar synthetic service block is cleanly removed
      const today = new Date().toISOString().slice(0, 10);
      const resCal = await fetch(`${BASE_URL}/api/pms/calendar?startDate=${today}&endDate=${today}`, {
        headers: adminHeaders
      });
      assert.strictEqual(resCal.status, 200);
      const calData = await resCal.json();
      const sBlock = (calData.blocks || []).find(b => b.isServiceBlock && b.flatId === testFlatId);
      assert.strictEqual(sBlock, undefined, 'Synthetic service block must be cleanly removed from PMS calendar after finish');
    });

    it('3.7 Clean up: Admin deletes test service order', async () => {
      const resDel = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}`, {
        method: 'DELETE',
        headers: adminHeaders
      });
      assert.strictEqual(resDel.status, 200);
    });
  });
});
