import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

describe('Service Worker Public Portal (R5) Verification Suite', () => {
  const portalFilePath = path.resolve('artifacts/limpeza/src/pages/service-worker-portal.tsx');
  const appFilePath = path.resolve('artifacts/limpeza/src/App.tsx');
  const dbPath = path.resolve('data/database.json');

  let portalContent = '';
  let appContent = '';

  before(() => {
    assert.ok(fs.existsSync(portalFilePath), 'service-worker-portal.tsx must exist');
    portalContent = fs.readFileSync(portalFilePath, 'utf8');

    assert.ok(fs.existsSync(appFilePath), 'App.tsx must exist');
    appContent = fs.readFileSync(appFilePath, 'utf8');
  });

  describe('1. Route Configuration in App.tsx', () => {
    it('imports ServiceWorkerPortal from @/pages/service-worker-portal', () => {
      assert.match(
        appContent,
        /import\s+ServiceWorkerPortal\s+from\s+['"]@\/pages\/service-worker-portal['"]/,
        'App.tsx must import ServiceWorkerPortal from @/pages/service-worker-portal'
      );
    });

    it('registers public /servico/:token and /service/:token routes', () => {
      assert.match(
        appContent,
        /<Route\s+path=["']\/servico\/:token["']\s+component=\{ServiceWorkerPortal\}\s*\/>/,
        'App.tsx must register public route for /servico/:token'
      );
      assert.match(
        appContent,
        /<Route\s+path=["']\/service\/:token["']\s+component=\{ServiceWorkerPortal\}\s*\/>/,
        'App.tsx must register public route for /service/:token'
      );
    });

    it('ensures public service routes are not wrapped in AdminRoute or StaffRoute', () => {
      assert.doesNotMatch(
        appContent,
        /<AdminRoute[^>]*path=["']\/servico\/:token["']/,
        'Route /servico/:token must not be an AdminRoute'
      );
      assert.doesNotMatch(
        appContent,
        /<StaffRoute[^>]*path=["']\/servico\/:token["']/,
        'Route /servico/:token must not be a StaffRoute'
      );
    });
  });

  describe('2. Standalone & Mobile Layout Architecture', () => {
    it('is a standalone page that does NOT import Shell layout', () => {
      assert.doesNotMatch(
        portalContent,
        /import\s*\{[^}]*Shell[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
        'service-worker-portal.tsx must be standalone without Shell sidebar'
      );
      assert.doesNotMatch(
        portalContent,
        /<Shell\b/,
        'service-worker-portal.tsx must not render <Shell>'
      );
    });

    it('extracts :token parameter using wouter useRoute and props fallback', () => {
      assert.match(
        portalContent,
        /useRoute\(['"]\/servico\/:token['"]\)/,
        'Should extract token from /servico/:token'
      );
      assert.match(
        portalContent,
        /token\s*=/,
        'Should assign token variable'
      );
    });

    it('uses TanStack Query useQuery to fetch /api/service/public/:token', () => {
      assert.match(
        portalContent,
        /useQuery\b/,
        'Must use TanStack Query useQuery'
      );
      assert.match(
        portalContent,
        /\/api\/service\/public\//,
        'Must fetch from /api/service/public/:token'
      );
    });
  });

  describe('3. Identification Banner (R5)', () => {
    it('renders identification banner with mainWorker name and CPF inputs', () => {
      assert.match(
        portalContent,
        /Nome Completo do Responsável/i,
        'Must contain mainWorker name label or placeholder'
      );
      assert.match(
        portalContent,
        /CPF do Responsável/i,
        'Must contain mainWorker CPF label or placeholder'
      );
    });

    it('provides collaborator team management (+ Adicionar Ajudante and remove)', () => {
      assert.match(
        portalContent,
        /Adicionar Ajudante/i,
        'Must have button or text "+ Adicionar Ajudante"'
      );
      assert.match(
        portalContent,
        /handleRemoveCollaborator|filter\(/,
        'Must have removal logic for collaborators'
      );
    });

    it('calls POST /api/service/public/:token/register on save', () => {
      assert.match(
        portalContent,
        /\/api\/service\/public\/.*\/register/,
        'Must send registration to /api/service/public/:token/register'
      );
    });

    it('displays identified emerald banner when worker is saved', () => {
      assert.match(
        portalContent,
        /Prestador Identificado/i,
        'Must show "Prestador Identificado" in saved state'
      );
      assert.match(
        portalContent,
        /bg-emerald/,
        'Must use emerald / green styling for identified banner'
      );
    });

    it('blocks starting flat without saved identification with exact guard dialog message', () => {
      assert.match(
        portalContent,
        /Identificação Obrigatória: Você precisa preencher e salvar sua identificação \(Nome e CPF\) antes de iniciar qualquer apartamento\./,
        'Must contain exact blocking alert message required by R5'
      );
      assert.match(
        portalContent,
        /setGuardDialogOpen\((true|!)/,
        'Must trigger guard dialog when starting without saved worker'
      );
    });
  });

  describe('4. Flats List Cards & Dynamic Rules (R5)', () => {
    it('renders flat occupancy badges (Ocupado, Sujo, Vago Limpo)', () => {
      assert.match(
        portalContent,
        /🔴 Ocupado por Hóspede/,
        'Must render "🔴 Ocupado por Hóspede" badge'
      );
      assert.match(
        portalContent,
        /🧹 Sujo \/ Pós-Checkout/,
        'Must render "🧹 Sujo / Pós-Checkout" badge'
      );
      assert.match(
        portalContent,
        /🟢 Vago \/ Limpo/,
        'Must render "🟢 Vago / Limpo" badge'
      );
    });

    it('renders current status badges (Pendente, Em Andamento with pulse, Finalizado)', () => {
      assert.match(portalContent, /Pendente/, 'Must render Pendente badge');
      assert.match(portalContent, /Em Andamento/, 'Must render Em Andamento badge');
      assert.match(portalContent, /animate-pulse|animate-ping/, 'Em Andamento badge must have pulsing animation');
      assert.match(portalContent, /Finalizado/, 'Must render Finalizado badge');
    });

    it('supports text and list formats for flat instructions', () => {
      assert.match(
        portalContent,
        /instructionFormat === ["']list["']/,
        'Must check instructionFormat for list rendering'
      );
    });

    it('implements simultaneous flat limit disabling message', () => {
      assert.match(
        portalContent,
        /Limite de simultâneos atingido \(máx:.*\)\. Finalize o flat em andamento\./,
        'Must show exact simultaneous limit disabled message'
      );
    });

    it('implements daily flat limit disabling message', () => {
      assert.match(
        portalContent,
        /Limite diário de .* flats atingido para hoje\./,
        'Must show exact daily limit disabled message'
      );
    });

    it('implements clean flat mode blocking messages (never and priority)', () => {
      assert.match(
        portalContent,
        /Bloqueado: serviço não permite flats limpos\./,
        'Must show exact cleanFlatMode "never" message'
      );
      assert.match(
        portalContent,
        /Bloqueado: priorize os apartamentos sujos primeiro\./,
        'Must show exact cleanFlatMode "priority" message'
      );
    });

    it('displays priority suggested badge when cleanFlatMode is always and flat is dirty', () => {
      assert.match(
        portalContent,
        /⭐ Recomendado iniciar este primeiro/,
        'Must show "⭐ Recomendado iniciar este primeiro" badge'
      );
    });

    it('renders action buttons: "▶️ Iniciar Apartamento" and "🏁 Finalizar Serviço"', () => {
      assert.match(
        portalContent,
        /▶️ Iniciar Apartamento/,
        'Must render "▶️ Iniciar Apartamento" button'
      );
      assert.match(
        portalContent,
        /🏁 Finalizar Serviço/,
        'Must render "🏁 Finalizar Serviço" button'
      );
      assert.match(
        portalContent,
        /\/flats\/.*\/start/,
        'Must call start endpoint'
      );
    });
  });

  describe('5. Finish Modal (R5)', () => {
    it('includes warning callout in finish modal', () => {
      assert.match(
        portalContent,
        /Atenção: verifique se todo o serviço foi inspecionado e o apartamento está em condições adequadas\./,
        'Must render exact inspection warning callout'
      );
    });

    it('renders mandatory cleaning question for clean flats with RadioGroup', () => {
      assert.match(
        portalContent,
        /Precisa de camareira para finalizar a limpeza\?/,
        'Must render mandatory question'
      );
      assert.match(
        portalContent,
        /<RadioGroup\b/,
        'Must use RadioGroup for yes/no choice'
      );
    });

    it('integrates client-side image compression via compressImage', () => {
      assert.match(
        portalContent,
        /import\s*\{[^}]*compressImage[^}]*\}\s*from\s*['"]@\/lib\/image-compression['"]/,
        'Must import compressImage from @/lib/image-compression'
      );
      assert.match(
        portalContent,
        /compressImage\(/,
        'Must call compressImage when processing uploaded photos'
      );
    });

    it('enforces maximum 5 photos and mandatory photos if order.requirePhotos === true', () => {
      assert.match(
        portalContent,
        /5\s*fotos/i,
        'Must mention 5 photos limit'
      );
      assert.match(
        portalContent,
        /requirePhotos/,
        'Must check requirePhotos'
      );
    });

    it('calls POST /api/service/public/:token/flats/:flatId/finish with complete payload', () => {
      assert.match(
        portalContent,
        /\/api\/service\/public\/.*\/flats\/.*\/finish/,
        'Must call finish endpoint'
      );
      assert.match(
        portalContent,
        /needsCleaning/,
        'Must pass needsCleaning to finish'
      );
      assert.match(
        portalContent,
        /observations/,
        'Must pass observations to finish'
      );
      assert.match(
        portalContent,
        /photos/,
        'Must pass photos to finish'
      );
    });
  });

  describe('6. End-to-End API Integration & Flow', () => {
    const PORT = 3992;
    const BASE_URL = `http://127.0.0.1:${PORT}`;
    const prodDbPath = path.resolve('data/database.json');
    const isolatedDbPath = path.resolve('data/isolated-worker-portal-database.json');
    let serverProcess = null;

    const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString('base64');
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    };
    const publicHeaders = {
      'Content-Type': 'application/json',
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
        stdio: 'pipe',
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
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(ready, 'Server failed to start on test port');
    });

    after(() => {
      if (serverProcess && serverProcess.pid) {
        killProcessTree(serverProcess.pid);
      }
      if (fs.existsSync(isolatedDbPath)) {
        try { fs.unlinkSync(isolatedDbPath); } catch {}
      }
    });

    it('completes the full R5 worker lifecycle: query -> register -> guard -> start -> finish', async () => {
      // Step A: Create active service order via Admin API
      const createRes = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Pintura Completa Torre A',
          cleanFlatMode: 'priority',
          maxSimultaneousFlats: 1,
          maxFlatsPerDay: 3,
          requirePhotos: true,
          flats: [1, 2],
        }),
      });
      assert.strictEqual(createRes.status, 201, 'Should create service order');
      const order = await createRes.json();
      const token = order.token;
      assert.ok(token, 'Order must have a unique token');

      // Step B: Worker fetches public order data via GET /api/service/public/:token
      const getRes = await fetch(`${BASE_URL}/api/service/public/${token}`);
      assert.strictEqual(getRes.status, 200, 'Public GET must return 200');
      const publicData = await getRes.json();
      assert.strictEqual(publicData.success, true);
      assert.strictEqual(publicData.order.title, 'Pintura Completa Torre A');
      assert.strictEqual(publicData.order.flats.length, 2);
      assert.strictEqual(publicData.worker, null, 'No worker registered yet');

      // Step C: Attempting to start flat without registered worker returns 403
      const unauthStartRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(unauthStartRes.status, 403, 'Must return 403 when worker is not identified');

      // Step D: Worker registers identification + collaborators via POST /api/service/public/:token/register
      const registerRes = await fetch(`${BASE_URL}/api/service/public/${token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: {
            name: 'Carlos Pinturas ME',
            cpf: '11122233344',
          },
          collaborators: [
            { name: 'Lucas Ajudante', cpf: '55566677788' },
          ],
        }),
      });
      assert.strictEqual(registerRes.status, 200, 'Registration should return 200');
      const regData = await registerRes.json();
      assert.strictEqual(regData.success, true);
      assert.strictEqual(regData.worker.mainWorker.name, 'Carlos Pinturas ME');
      assert.strictEqual(regData.worker.collaborators.length, 1);

      // Step E: Worker starts flat 1
      const startRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(startRes.status, 200, 'Start flat 1 should succeed');
      const startData = await startRes.json();
      assert.strictEqual(startData.flat.status, 'in_progress');
      assert.strictEqual(startData.flat.workerName, 'Carlos Pinturas ME');

      // Step F: Attempting to start flat 2 when simultaneous limit (1) is reached returns 400
      const simulRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/2/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(simulRes.status, 400, 'Simultaneous limit exceeded must return 400');

      // Step G: Attempting to finish flat 1 without photos when requirePhotos is true returns 400
      const missingPhotosRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: true,
          observations: 'Teste sem fotos',
          photos: [],
        }),
      });
      assert.strictEqual(missingPhotosRes.status, 400, 'Missing photos when required must return 400');

      // Step H: Successfully finish flat 1 with photos and needsCleaning
      const finishRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: true,
          observations: 'Pintura concluída com acabamento fosco',
          photos: ['data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAA='],
        }),
      });
      assert.strictEqual(finishRes.status, 200, 'Finish should succeed with valid photos & cleaning info');
      const finishData = await finishRes.json();
      assert.strictEqual(finishData.flat.status, 'done');
      assert.strictEqual(finishData.flat.needsCleaning, true);
      assert.strictEqual(finishData.flat.photos.length, 1);

      // Step I: Verify updated state in public query
      const verifyRes = await fetch(`${BASE_URL}/api/service/public/${token}`);
      const verifyData = await verifyRes.json();
      const flat1 = verifyData.order.flats.find((f) => Number(f.flatId) === 1);
      assert.strictEqual(flat1.status, 'done');
      assert.strictEqual(flat1.workerName, 'Carlos Pinturas ME');
      assert.ok(flat1.finishedAt);
    });
  });
});
