import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

describe('Adversarial Challenge: Public Worker Portal (R5 / Milestone M3)', () => {
  const portalFilePath = path.resolve('artifacts/limpeza/src/pages/service-worker-portal.tsx');
  const appFilePath = path.resolve('artifacts/limpeza/src/App.tsx');
  const distBundlePath = path.resolve('artifacts/limpeza/dist/public/assets/index.js');
  const dbPath = path.resolve('data/database.json');

  let portalContent = '';
  let appContent = '';

  before(() => {
    assert.ok(fs.existsSync(portalFilePath), 'service-worker-portal.tsx must exist');
    portalContent = fs.readFileSync(portalFilePath, 'utf8');

    assert.ok(fs.existsSync(appFilePath), 'App.tsx must exist');
    appContent = fs.readFileSync(appFilePath, 'utf8');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 1: Route Resolution & Standalone Layout Architecture (Adversarial)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 1: Route Resolution & Standalone Architecture', () => {
    it('1.1. Resolves both /servico/:token and /service/:token routes without auth guards', () => {
      // Must have /servico/:token
      const servicoMatch = appContent.match(/<Route\s+path=["']\/servico\/:token["']\s+component=\{ServiceWorkerPortal\}\s*\/>/);
      assert.ok(servicoMatch, 'Route /servico/:token must be registered with ServiceWorkerPortal');

      // Must have /service/:token (English alias)
      const serviceMatch = appContent.match(/<Route\s+path=["']\/service\/:token["']\s+component=\{ServiceWorkerPortal\}\s*\/>/);
      assert.ok(serviceMatch, 'Route /service/:token must be registered with ServiceWorkerPortal');

      // Ensure neither route is guarded by AdminRoute or StaffRoute
      assert.doesNotMatch(appContent, /<AdminRoute[^>]*path=["']\/(servico|service)\/:token["']/, 'Public routes must not be AdminRoute');
      assert.doesNotMatch(appContent, /<StaffRoute[^>]*path=["']\/(servico|service)\/:token["']/, 'Public routes must not be StaffRoute');
    });

    it('1.2. Public portal is strictly standalone and does NOT render Shell navigation', () => {
      assert.doesNotMatch(portalContent, /import\s*\{[^}]*Shell[^}]*\}\s*from/, 'Must not import Shell layout');
      assert.doesNotMatch(portalContent, /<Shell\b/, 'Must not render <Shell> component');
      // Must contain independent mobile header
      assert.match(portalContent, /<header\s+className=["'][^"']*sticky top-0/, 'Must render independent mobile header');
      assert.match(portalContent, /CorpFlats/, 'Header must feature CorpFlats branding');
    });

    it('1.3. Token extraction handles route parameters and props fallback defensively', () => {
      assert.match(portalContent, /useRoute\(["']\/servico\/:token["']\)/, 'Extracts /servico/:token');
      assert.match(portalContent, /useRoute\(["']\/service\/:token["']\)/, 'Extracts /service/:token');
      assert.match(portalContent, /propsParams\?\.token/, 'Supports props.params.token injection for testing');
    });

    it('1.4. React Query hook handles invalid or missing token defensively with auto-refresh', () => {
      // Query enabled only when token exists
      assert.match(portalContent, /enabled:\s*Boolean\(token\)/, 'Query should be enabled only when token is present');
      // 10s auto-refresh
      assert.match(portalContent, /refetchInterval:\s*10000/, 'Query must configure 10s auto-refresh polling');
      // Friendly error state for broken/expired links
      assert.match(portalContent, /Link de Serviço Inválido/, 'Must show friendly "Link de Serviço Inválido" screen');
      assert.match(portalContent, /Tentar Novamente/, 'Must show retry button on error');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 2: Identification Banner & Collaborator Management (Adversarial & Edge Cases)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 2: Identification Banner & Validation Edge Cases', () => {
    // Helper function reproducing the component's formatCpf implementation for unit-level verification
    function formatCpf(val) {
      const digits = val.replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
      if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
    }

    function cleanCpfDigits(val) {
      return val.replace(/\D/g, '');
    }

    it('2.1. CPF formatting mask correctly handles partial, dirty, and oversized input', () => {
      // Partial inputs
      assert.strictEqual(formatCpf('123'), '123');
      assert.strictEqual(formatCpf('1234'), '123.4');
      assert.strictEqual(formatCpf('123456'), '123.456');
      assert.strictEqual(formatCpf('1234567'), '123.456.7');
      assert.strictEqual(formatCpf('123456789'), '123.456.789');
      assert.strictEqual(formatCpf('1234567890'), '123.456.789-0');
      assert.strictEqual(formatCpf('12345678901'), '123.456.789-01');

      // Dirty characters
      assert.strictEqual(formatCpf('abc123def456ghi78901'), '123.456.789-01');
      assert.strictEqual(formatCpf('123.456.789-01'), '123.456.789-01');

      // Oversized input truncated at 11 digits
      assert.strictEqual(formatCpf('12345678901999999'), '123.456.789-01');

      // Clean digits helper
      assert.strictEqual(cleanCpfDigits('123.456.789-01'), '12345678901');
    });

    it('2.2. Unverified state: inputs are rendered with clear labels and validation limits', () => {
      assert.match(portalContent, /Nome Completo do Responsável \*/, 'Must require main worker name');
      assert.match(portalContent, /CPF do Responsável \*/, 'Must require main worker CPF');
      assert.match(portalContent, /maxLength=\{14\}/, 'Must cap CPF input at 14 formatted chars (000.000.000-00)');
    });

    it('2.3. Identification submission validation prevents incomplete inputs', () => {
      // Client validation checks
      assert.match(portalContent, /!mainWorkerName\.trim\(\)/, 'Validates non-empty main worker name');
      assert.match(portalContent, /cleanCpf\.length !== 11/, 'Validates main worker CPF must be exactly 11 digits');
      // Save button disabled condition
      assert.match(
        portalContent,
        /disabled=\{.*!mainWorkerName\.trim\(\)\s*\|\|\s*cleanCpfDigits\(mainWorkerCpf\)\.length !== 11\}/,
        'Save button must be disabled when name is empty or CPF is not 11 digits'
      );
    });

    it('2.4. Collaborator management: supports dynamic add, remove, and per-collaborator CPF validation', () => {
      assert.match(portalContent, /\+ Adicionar Ajudante/, 'Renders add collaborator button');
      assert.match(portalContent, /handleRemoveCollaborator/, 'Contains remove collaborator handler');
      assert.match(portalContent, /Trash2/, 'Includes trash icon for deletion');
      // Per collaborator validation in mutation
      assert.match(
        portalContent,
        /col\.cpf\.length !== 11/,
        'Validates that each collaborator has exactly 11 CPF digits'
      );
    });

    it('2.5. Identified state: renders emerald banner with details and edit option', () => {
      assert.match(portalContent, /bg-emerald-50/, 'Identified banner uses emerald background');
      assert.match(portalContent, /border-emerald-500/, 'Identified banner uses emerald border');
      assert.match(portalContent, /✓ Prestador Identificado/, 'Displays confirmed identification heading');
      assert.match(portalContent, /serverWorker\?\.mainWorker\?\.name/, 'Displays worker name');
      assert.match(portalContent, /formatCpf\(serverWorker\?\.mainWorker\?\.cpf/, 'Displays formatted CPF');
      assert.match(portalContent, /setIsEditingWorker\(true\)/, 'Provides edit button to modify information');
    });

    it('2.6. Identification Guard Dialog: blocks flat start with exact mandatory text and scroll target', () => {
      // Exact required blocking text from R5
      const exactAlert = 'Identificação Obrigatória: Você precisa preencher e salvar sua identificação (Nome e CPF) antes de iniciar qualquer apartamento.';
      assert.ok(
        portalContent.includes(exactAlert),
        `Dialog must include exact alert text: "${exactAlert}"`
      );

      // Start action intercepts if not identified
      assert.match(
        portalContent,
        /if\s*\(!hasSavedWorker\)\s*\{\s*setGuardDialogOpen\(true\);\s*return;\s*\}/,
        'handleStartFlatClick must intercept start when worker is not identified'
      );

      // Action button navigates/scrolls to banner
      assert.match(portalContent, /scrollToBanner\(\)/, 'Guard dialog button must trigger smooth scroll to banner');
      assert.match(portalContent, /ref=\{bannerRef\}/, 'Banner must have bannerRef for scroll targeting');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 3: Flats List Cards, Format Rendering & Dynamic Limit Blocking (Adversarial)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 3: Flats Cards, Instructions & Dynamic Rules', () => {
    it('3.1. Occupancy badges: renders distinct badges for Ocupado, Sujo, and Vago Limpo', () => {
      // Occupied badge
      assert.match(portalContent, /🔴 Ocupado por Hóspede/, 'Must render "🔴 Ocupado por Hóspede"');
      // Dirty badge
      assert.match(portalContent, /🧹 Sujo \/ Pós-Checkout/, 'Must render "🧹 Sujo / Pós-Checkout"');
      // Vacant clean badge
      assert.match(portalContent, /🟢 Vago \/ Limpo/, 'Must render "🟢 Vago / Limpo"');
    });

    it('3.2. Status badges: renders Pendente, Em Andamento with animation, and Finalizado', () => {
      assert.match(portalContent, />\s*Pendente\s*<\//, 'Renders Pendente badge');
      assert.match(portalContent, /animate-pulse/, 'Em Andamento badge must have pulsing animation');
      assert.match(portalContent, /animate-ping/, 'Em Andamento badge includes ping indicator');
      assert.match(portalContent, /<CheckCircle2[^>]*\/>\s*Finalizado/, 'Renders Finalizado badge with CheckCircle2');
    });

    it('3.3. Instruction format rendering: handles list vs text formats and strips bullet prefixes', () => {
      assert.match(portalContent, /order\.instructionFormat === ["']list["']/, 'Branches on instructionFormat');
      // Check bullet stripping regex
      assert.match(portalContent, /\.replace\(\/\^\[-\*•\]\\s\*\//, 'Strips leading dash, asterisk, or bullet markers');
      // Check text fallback
      assert.match(portalContent, /whitespace-pre-line/, 'Text format preserves newlines');
    });

    it('3.4. Dynamic limit blocking: simultaneous limit reached disables button with exact message', () => {
      assert.match(
        portalContent,
        /isSimulLimitReached\s*=\s*inProgressFlats\s*>=\s*maxSimul/,
        'Evaluates simultaneous limit reached'
      );
      assert.match(
        portalContent,
        /Limite de simultâneos atingido \(máx: \$\{maxSimul\}\)\. Finalize o flat em andamento\./,
        'Shows exact simultaneous limit exceeded message'
      );
    });

    it('3.5. Dynamic limit blocking: daily limit reached disables button with exact message', () => {
      assert.match(
        portalContent,
        /isDailyLimitReached\s*=\s*doneTodayCount\s*>=\s*maxDaily/,
        'Evaluates daily limit reached'
      );
      assert.match(
        portalContent,
        /Limite diário de \$\{maxDaily\} flats atingido para hoje\./,
        'Shows exact daily limit exceeded message'
      );
    });

    it('3.6. Clean flat mode "never": blocks clean flats with exact message', () => {
      assert.match(
        portalContent,
        /cleanFlatMode === ["']never["']/,
        'Checks cleanFlatMode === "never"'
      );
      assert.match(
        portalContent,
        /Bloqueado: serviço não permite flats limpos\./,
        'Shows exact cleanFlatMode never blocked message'
      );
    });

    it('3.7. Clean flat mode "priority": blocks clean flat if any other flat in order is dirty', () => {
      assert.match(
        portalContent,
        /cleanFlatMode === ["']priority["']/,
        'Checks cleanFlatMode === "priority"'
      );
      assert.match(
        portalContent,
        /Bloqueado: priorize os apartamentos sujos primeiro\./,
        'Shows exact priority mode blocked message'
      );
      // Ensures dirty check applies ONLY to flats of THIS service order
      assert.match(
        portalContent,
        /order\.flats\.some\(/,
        'Evaluates dirty flats scoped strictly to order.flats'
      );
      // Checks that completed dirty flats do not block clean flats
      assert.match(
        portalContent,
        /f\.status !== ["']done["']/,
        'Only pending or in_progress dirty flats block clean flats'
      );
    });

    it('3.8. Clean flat mode "always": highlights dirty flats with priority suggested badge', () => {
      assert.match(
        portalContent,
        /cleanFlatMode === ["']always["']/,
        'Checks cleanFlatMode === "always"'
      );
      assert.match(
        portalContent,
        /⭐ Recomendado iniciar este primeiro/,
        'Displays "⭐ Recomendado iniciar este primeiro" badge on dirty flats'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 4: Finish Modal, Inspections & Validations (Adversarial)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 4: Finish Modal & Validations Edge Cases', () => {
    it('4.1. Inspection warning callout is always present with exact mandatory text', () => {
      const warningText = 'Atenção: verifique se todo o serviço foi inspecionado e o apartamento está em condições adequadas.';
      assert.ok(
        portalContent.includes(warningText),
        `Modal must contain exact inspection warning: "${warningText}"`
      );
      assert.match(portalContent, /AlertTriangle/, 'Warning callout renders AlertTriangle icon');
    });

    it('4.2. Clean flat mandatory needsCleaning question with RadioGroup and blocking validation', () => {
      // Question condition: flat was clean when started or not dirty
      assert.match(
        portalContent,
        /finishingFlat\?\.wasCleanWhenStarted === true\s*\|\|\s*!finishingFlat\?\.isDirty/,
        'Renders question when flat was clean'
      );
      assert.match(
        portalContent,
        /Precisa de camareira para finalizar a limpeza\? \*/,
        'Renders exact question title'
      );
      // Radio options
      assert.match(portalContent, /Sim, precisa de camareira/, 'Option: Sim, precisa de camareira');
      assert.match(portalContent, /Não, mantido limpo/, 'Option: Não, mantido limpo');

      // Submit button disabled when clean and no choice made
      assert.match(
        portalContent,
        /needsCleaningChoice === null/,
        'Disabled submit button when needsCleaningChoice is null'
      );

      // Submission handler guard
      assert.match(
        portalContent,
        /Por favor, responda se o apartamento precisa de camareira para limpeza\./,
        'Shows error toast if bypassed'
      );
    });

    it('4.3. Mandatory photo enforcement when requirePhotos: true', () => {
      // Check submit button disable condition
      assert.match(
        portalContent,
        /Boolean\(order\.requirePhotos\)\s*&&\s*uploadedPhotos\.length === 0/,
        'Submit button must be disabled when requirePhotos is true and 0 photos uploaded'
      );

      // Check warning notice in modal
      assert.match(
        portalContent,
        /⚠️ É obrigatório anexar pelo menos 1 foto para finalizar este serviço\./,
        'Shows mandatory photo warning text'
      );

      // Check submission handler guard
      assert.match(
        portalContent,
        /Esta ordem de serviço exige pelo menos 1 foto para finalização\./,
        'Shows error toast if bypassed'
      );
    });

    it('4.4. Enforces maximum 5 photos limit and thumbnail preview with remove button', () => {
      assert.match(
        portalContent,
        /uploadedPhotos\.length \+ files\.length > 5/,
        'Blocks uploading more than 5 photos'
      );
      assert.match(
        portalContent,
        /Você pode anexar no máximo 5 fotos por apartamento\./,
        'Shows 5 photos max error message'
      );
      assert.match(portalContent, /handleRemovePhoto/, 'Has photo removal function');
      assert.match(portalContent, /<img\s+src=\{photo\}/, 'Renders thumbnail preview for uploaded photos');
    });

    it('4.5. Integrates compressImage with camera capture and WebP optimization', () => {
      assert.match(
        portalContent,
        /import\s*\{[^}]*compressImage[^}]*\}\s*from\s*["']@\/lib\/image-compression["']/,
        'Imports compressImage from @/lib/image-compression'
      );
      assert.match(portalContent, /capture=["']environment["']/, 'Requests environment camera capture');
      assert.match(portalContent, /preferredFormat:\s*["']image\/webp["']/, 'Configures WebP format');
      assert.match(portalContent, /quality:\s*0\.8/, 'Configures 0.8 quality compression');
      assert.match(portalContent, /maxWidth:\s*1280/, 'Configures 1280px max dimension');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 5: Live HTTP Interoperability with Backend Monolith
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 5: Live HTTP Interoperability & Backend Stress Test', () => {
    const TEST_PORT = 3998;
    const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
    let dbBackup = null;
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
      dbBackup = fs.readFileSync(dbPath, 'utf8');

      serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
        env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test', DATABASE_URL: '' },
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
      assert.ok(ready, 'Server failed to start on test port 3998');
    });

    after(() => {
      if (serverProcess && serverProcess.pid) {
        killProcessTree(serverProcess.pid);
      }
      if (dbBackup) {
        fs.writeFileSync(dbPath, dbBackup, 'utf8');
      }
    });

    it('5.1. Non-existent or invalid token returns 404 on public route', async () => {
      const res = await fetch(`${BASE_URL}/api/service/public/invalidtoken123456789012`);
      assert.strictEqual(res.status, 404, 'Must return 404 for unknown token');
    });

    it('5.2. Live E2E Stress Scenario: Order creation -> Registration -> Guard -> Priority Rules -> Simultaneous Limit -> Finish with Photos', async () => {
      // 1. Create a service order with 3 flats:
      // - Flat 1: Clean (vacant)
      // 1. Create a service order with 3 flats:
      // - Flat 18: Clean (vacant 907)
      // - Flat 1: Dirty (needs checkout cleaning 113)
      // - Flat 2: Dirty (needs checkout cleaning 114)
      // Settings: cleanFlatMode = "priority", maxSimultaneous = 1, maxFlatsPerDay = 2, requirePhotos = true
      const createRes = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Revisão Elétrica e Pintura Desafio M3',
          cleanFlatMode: 'priority',
          maxSimultaneousFlats: 1,
          maxFlatsPerDay: 2,
          requirePhotos: true,
          flats: [18, 1, 2],
        }),
      });
      assert.strictEqual(createRes.status, 201, 'Order must be created successfully');
      const order = await createRes.json();
      const token = order.token;
      assert.ok(token && token.length === 24, 'Token must be 24 hex characters');

      // 2. Fetch public data: worker should be null
      const initialGetRes = await fetch(`${BASE_URL}/api/service/public/${token}`);
      assert.strictEqual(initialGetRes.status, 200);
      const initialData = await initialGetRes.json();
      assert.strictEqual(initialData.success, true);
      assert.strictEqual(initialData.worker, null, 'No worker should be registered yet');

      // 3. Attempt to start flat before registering: MUST FAIL with 403 Forbidden
      const unregStartRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(unregStartRes.status, 403, 'Start without registration must return 403');

      // 4. Register worker with 1 main worker and 1 collaborator
      const regRes = await fetch(`${BASE_URL}/api/service/public/${token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          mainWorker: {
            name: 'Mendonça Engenharia',
            cpf: '12345678909',
          },
          collaborators: [
            { name: 'Roberto Ajudante', cpf: '98765432100' },
          ],
        }),
      });
      assert.strictEqual(regRes.status, 200, 'Registration must succeed');
      const regData = await regRes.json();
      assert.strictEqual(regData.worker.mainWorker.name, 'Mendonça Engenharia');
      assert.strictEqual(regData.worker.collaborators.length, 1);

      // 5. Test cleanFlatMode "priority":
      // In this order, Flat 1 and Flat 2 are dirty, and Flat 18 is clean.
      // Attempting to start clean Flat 18 first MUST return 400.
      const cleanStartRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(cleanStartRes.status, 400, 'Starting clean flat when dirty flat exists under priority mode must fail with 400');
      const cleanStartErr = await cleanStartRes.json();
      assert.ok(cleanStartErr.error.includes('Priorize os apartamentos sujos primeiro'));

      // 6. Start the dirty Flat (Flat 1)
      const dirtyStartRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(dirtyStartRes.status, 200, 'Starting dirty flat must succeed');
      const dirtyStartData = await dirtyStartRes.json();
      assert.strictEqual(dirtyStartData.flat.status, 'in_progress');
      assert.strictEqual(dirtyStartData.flat.workerName, 'Mendonça Engenharia');

      // 7. Simultaneous limit enforcement:
      // maxSimultaneousFlats is 1. Flat 1 is already in progress.
      // Attempting to start any other flat (Flat 2) must return 400.
      const simulRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/2/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(simulRes.status, 400, 'Exceeding simultaneous limit must return 400');

      // 8. Upload photos to photo endpoint
      const photoUploadRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/photos`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          photos: ['data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAAAAAAAAAA='],
        }),
      });
      assert.strictEqual(photoUploadRes.status, 200, 'Photo upload endpoint should return 200');
      const photoData = await photoUploadRes.json();
      assert.ok(photoData.urls && photoData.urls.length === 1, 'Should return uploaded image URLs');

      // 9. Finish Flat 1:
      // Attempt finish without photos when requirePhotos is true -> 400
      const noPhotoFinishRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Sem fotos',
          photos: [],
        }),
      });
      assert.strictEqual(noPhotoFinishRes.status, 400, 'Finish without required photos must return 400');

      // Finish Flat 1 properly with photo
      const finishRes1 = await fetch(`${BASE_URL}/api/service/public/${token}/flats/1/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Tomadas e disjuntores revisados no flat 1',
          photos: photoData.urls,
          needsCleaning: true,
        }),
      });
      assert.strictEqual(finishRes1.status, 200, 'Finish flat 1 must succeed');
      const finishData1 = await finishRes1.json();
      assert.strictEqual(finishData1.flat.status, 'done');

      // 10. Flat 2 is ALSO dirty. So clean Flat 18 is STILL blocked because Flat 2 is pending dirty!
      const cleanStillBlockedRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(cleanStillBlockedRes.status, 400, 'Clean flat 18 is still blocked while flat 2 is dirty');

      // 11. Start and finish Flat 2 (dirty)
      const startFlat2Res = await fetch(`${BASE_URL}/api/service/public/${token}/flats/2/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(startFlat2Res.status, 200, 'Start flat 2 should succeed');

      const finishFlat2Res = await fetch(`${BASE_URL}/api/service/public/${token}/flats/2/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Flat 2 pintura finalizada',
          photos: photoData.urls,
          needsCleaning: true,
        }),
      });
      assert.strictEqual(finishFlat2Res.status, 200, 'Finish flat 2 should succeed');

      // 12. Daily limit enforcement on Order 1:
      // Flat 1 and Flat 2 are now done today (2 flats done).
      // maxFlatsPerDay is 2.
      // Attempting to start Flat 18 must return 400 (Daily limit reached: 2).
      const dailyLimitRes = await fetch(`${BASE_URL}/api/service/public/${token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(dailyLimitRes.status, 400, 'Starting flat when daily limit (2) is reached must return 400');
      const dailyLimitErr = await dailyLimitRes.json();
      assert.ok(dailyLimitErr.error.includes('Limite diário de apartamentos atingido para hoje'));

      // 13. Clean Flat Validation on Order 2 (Order with only clean flat 18 and cleanFlatMode "priority"):
      // Create Order 2 with Flat 18 only
      const order2Res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          title: 'Serviço em Flat Limpo Desafio M3',
          cleanFlatMode: 'priority',
          maxSimultaneousFlats: 1,
          maxFlatsPerDay: 5,
          requirePhotos: false,
          flats: [18],
        }),
      });
      assert.strictEqual(order2Res.status, 201);
      const order2 = await order2Res.json();

      // Register worker for Order 2
      await fetch(`${BASE_URL}/api/service/public/${order2.token}/register`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({ mainWorker: { name: 'Mendonça Engenharia', cpf: '12345678909' } }),
      });

      // Since NO other dirty flats exist in Order 2, Flat 18 can start immediately!
      const startCleanOrder2Res = await fetch(`${BASE_URL}/api/service/public/${order2.token}/flats/18/start`, {
        method: 'POST',
        headers: publicHeaders,
      });
      assert.strictEqual(startCleanOrder2Res.status, 200, 'Clean flat 18 can start when no other dirty flats in order');

      // Finish Flat 18 without needsCleaning: Flat 18 was clean when started. Must fail with 400!
      const noCleanChoiceRes = await fetch(`${BASE_URL}/api/service/public/${order2.token}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          observations: 'Sem resposta sobre camareira',
          photos: [],
        }),
      });
      assert.strictEqual(noCleanChoiceRes.status, 400, 'Clean flat without needsCleaning must return 400');

      // Finish Flat 18 with needsCleaning: false -> must succeed
      const finishCleanOrder2Res = await fetch(`${BASE_URL}/api/service/public/${order2.token}/flats/18/finish`, {
        method: 'POST',
        headers: publicHeaders,
        body: JSON.stringify({
          needsCleaning: false,
          observations: 'Flat 18 inspecionado e mantido limpo',
          photos: [],
        }),
      });
      assert.strictEqual(finishCleanOrder2Res.status, 200, 'Clean flat with needsCleaning: false must succeed');

      // 14. Verify final state via public GET endpoint
      const finalGetRes = await fetch(`${BASE_URL}/api/service/public/${order2.token}`);
      const finalData = await finalGetRes.json();
      assert.strictEqual(finalData.order.flats[0].status, 'done');
      assert.strictEqual(finalData.order.flats[0].needsCleaning, false);
    });
  });
});

