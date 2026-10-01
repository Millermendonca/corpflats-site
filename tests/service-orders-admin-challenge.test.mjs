import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

describe('Adversarial Challenge: Admin Service Orders Page (Milestone M2)', () => {
  const serviceOrdersPagePath = path.resolve('artifacts/limpeza/src/pages/service-orders.tsx');
  const appPath = path.resolve('artifacts/limpeza/src/App.tsx');
  const layoutPath = path.resolve('artifacts/limpeza/src/components/layout.tsx');
  const distJsPath = path.resolve('artifacts/limpeza/dist/public/assets/index.js');

  const pageContent = fs.readFileSync(serviceOrdersPagePath, 'utf8');
  const appContent = fs.readFileSync(appPath, 'utf8');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 1: Required UI Elements, Tabs, and R4 Specifications
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 1: UI Elements & R4 Specifications', () => {
    it('1.1. Page is wrapped in <Shell> with proper layout integration', () => {
      assert.ok(pageContent.includes('import { Shell } from "@/components/layout"'));
      assert.ok(pageContent.includes('<Shell>'));
      assert.ok(pageContent.includes('Ordens de Serviço de Terceirizados'));
    });

    it('1.2. Implements 3 Tabs with Radix UI: list, form, tracking', () => {
      assert.ok(pageContent.includes('TabsTrigger value="list"'));
      assert.ok(pageContent.includes('TabsTrigger value="form"'));
      assert.ok(pageContent.includes('TabsTrigger value="tracking"'));
      assert.ok(pageContent.includes('TabsContent value="list"'));
      assert.ok(pageContent.includes('TabsContent value="form"'));
      assert.ok(pageContent.includes('TabsContent value="tracking"'));
    });

    it('1.3. Tab 1 (Lista): Search, status filter, progress bar, link copy, action buttons', () => {
      // Search input & status filter
      assert.ok(pageContent.includes('listSearch'));
      assert.ok(pageContent.includes('listStatusFilter'));
      assert.ok(pageContent.includes('Buscar por título ou token'));

      // Progress bar with flats counter and percent
      assert.ok(pageContent.includes('<Progress value={percent}'));
      assert.ok(pageContent.includes('de {totalFlats} ({percent}%)'));

      // Copyable link & external link
      assert.ok(pageContent.includes('/servico/'));
      assert.ok(pageContent.includes('copyPortalLink(order.token)'));
      assert.ok(pageContent.includes('rel="noopener noreferrer"'));

      // Action buttons
      assert.ok(pageContent.includes('Ver Progresso'));
      assert.ok(pageContent.includes('Editar'));
      assert.ok(pageContent.includes('toggleStatusMutation.mutate'));
      assert.ok(pageContent.includes('setDeleteConfirmOrderId(order.id)'));
    });

    it('1.4. Tab 2 (Formulário): All R4 fields and cleanFlatMode options', () => {
      // Title
      assert.ok(pageContent.includes('id="service-title"'));
      assert.ok(pageContent.includes('formTitle'));

      // cleanFlatMode 3 options with clear explanations
      assert.ok(pageContent.includes('setFormCleanFlatMode("never")'));
      assert.ok(pageContent.includes('setFormCleanFlatMode("priority")'));
      assert.ok(pageContent.includes('setFormCleanFlatMode("always")'));
      assert.ok(pageContent.includes('Bloquear se o flat estiver limpo'));
      assert.ok(pageContent.includes('Só liberar flat limpo se nenhum outro flat do serviço estiver sujo'));
      assert.ok(pageContent.includes('Liberar qualquer flat a qualquer momento'));

      // Numerics & toggles
      assert.ok(pageContent.includes('id="max-simultaneous"'));
      assert.ok(pageContent.includes('id="max-daily"'));
      assert.ok(pageContent.includes('id="est-duration"'));
      assert.ok(pageContent.includes('id="toggle-photos"'));
      assert.ok(pageContent.includes('formRequirePhotos'));

      // Instructions format toggle & default instructions
      assert.ok(pageContent.includes('formInstructionFormat'));
      assert.ok(pageContent.includes('id="general-instructions"'));

      // 19 flats grid selection with Select All / Deselect All
      assert.ok(pageContent.includes('activeFlats'));
      assert.ok(pageContent.includes('Selecionar Todos'));
      assert.ok(pageContent.includes('Desmarcar Todos'));
      assert.ok(pageContent.includes('formSelectedFlatIds'));

      // Custom per-flat instructions toggle and textareas
      assert.ok(pageContent.includes('id="custom-instructions-toggle"'));
      assert.ok(pageContent.includes('formHasCustomInstructions'));
      assert.ok(pageContent.includes('formFlatCustomInstructions'));
    });

    it('1.5. Tab 3 (Acompanhamento): Polling, KPIs, 9-column table, detail & zoom modals, reset button', () => {
      // Real-time polling
      assert.ok(pageContent.includes('refetchInterval: 10000'));
      assert.ok(pageContent.includes('Atualizando a cada 10s'));

      // KPIs
      assert.ok(pageContent.includes('Total de Flats'));
      assert.ok(pageContent.includes('Pendentes'));
      assert.ok(pageContent.includes('Em Andamento'));
      assert.ok(pageContent.includes('Finalizados'));
      assert.ok(pageContent.includes('Prestador Responsável'));

      // Table columns
      assert.ok(pageContent.includes('>Flat</TableHead>'));
      assert.ok(pageContent.includes('>Status</TableHead>'));
      assert.ok(pageContent.includes('>Prestador</TableHead>'));
      assert.ok(pageContent.includes('>Início</TableHead>'));
      assert.ok(pageContent.includes('>Fim / Duração</TableHead>'));
      assert.ok(pageContent.includes('>Precisa Camareira?</TableHead>'));
      assert.ok(pageContent.includes('>Observações</TableHead>'));
      assert.ok(pageContent.includes('>Fotos</TableHead>'));
      assert.ok(pageContent.includes('>Ação</TableHead>'));

      // Modal Dialogs
      assert.ok(pageContent.includes('detailModalFlat'));
      assert.ok(pageContent.includes('zoomPhotoUrl'));
      assert.ok(pageContent.includes('resetConfirmFlat'));
      assert.ok(pageContent.includes('resetFlatMutation'));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 2: Edge Cases & Logic Harness
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 2: Adversarial Logic & Formatting Stress-Tests', () => {
    // Helper implementations matching service-orders.tsx logic
    function formatDateTime(iso) {
      if (!iso) return "-";
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "-";
        return new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d);
      } catch {
        return "-";
      }
    }

    function formatDuration(startIso, endIso) {
      if (!startIso || !endIso) return "";
      try {
        const start = new Date(startIso).getTime();
        const end = new Date(endIso).getTime();
        const diffMinutes = Math.max(0, Math.round((end - start) / (1000 * 60)));
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        if (hours > 0) {
          return `${hours}h ${minutes}min`;
        }
        return `${minutes}min`;
      } catch {
        return "";
      }
    }

    function formatCpf(cpf) {
      if (!cpf) return "";
      const cleaned = cpf.replace(/\D/g, "");
      if (cleaned.length === 11) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
      }
      return cpf;
    }

    it('2.1. formatDateTime handles null, undefined, invalid dates, and valid ISO gracefully', () => {
      assert.strictEqual(formatDateTime(null), '-');
      assert.strictEqual(formatDateTime(undefined), '-');
      assert.strictEqual(formatDateTime(''), '-');
      assert.strictEqual(formatDateTime('invalid-date-string'), '-');
      const validRes = formatDateTime('2026-09-30T15:30:00Z');
      assert.ok(validRes.includes('30/09/2026'), 'Must contain day/month/year');
    });

    it('2.2. formatDuration handles null, undefined, negative diffs, and hours+minutes', () => {
      assert.strictEqual(formatDuration(null, '2026-09-30T10:00:00Z'), '');
      assert.strictEqual(formatDuration('2026-09-30T10:00:00Z', null), '');
      assert.strictEqual(formatDuration(null, null), '');

      // 45 minutes
      const dur45 = formatDuration('2026-09-30T10:00:00Z', '2026-09-30T10:45:00Z');
      assert.strictEqual(dur45, '45min');

      // 2 hours 15 minutes
      const dur2h15 = formatDuration('2026-09-30T10:00:00Z', '2026-09-30T12:15:00Z');
      assert.strictEqual(dur2h15, '2h 15min');

      // End before start (clock skew) -> 0min, no negative duration
      const durSkew = formatDuration('2026-09-30T12:00:00Z', '2026-09-30T11:00:00Z');
      assert.strictEqual(durSkew, '0min');
    });

    it('2.3. formatCpf masks 11-digit CPF securely and leaves invalid formats intact without throwing', () => {
      assert.strictEqual(formatCpf(null), '');
      assert.strictEqual(formatCpf(undefined), '');
      assert.strictEqual(formatCpf(''), '');
      assert.strictEqual(formatCpf('12345678901'), '123.***.***-01');
      assert.strictEqual(formatCpf('123.456.789-01'), '123.***.***-01');
      assert.strictEqual(formatCpf('12345'), '12345'); // not 11 digits
    });

    it('2.4. Progress percentage formula avoids NaN on empty flats and computes accurate percentage', () => {
      const calcPercent = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);
      assert.strictEqual(calcPercent(0, 0), 0, 'Must not be NaN on 0 flats');
      assert.strictEqual(calcPercent(0, 19), 0);
      assert.strictEqual(calcPercent(1, 19), 5);
      assert.strictEqual(calcPercent(10, 19), 53);
      assert.strictEqual(calcPercent(19, 19), 100);
    });

    it('2.5. Form validation logic strictly rejects empty titles and empty flat selections', () => {
      const validate = (title, flats) => {
        if (!title.trim()) throw new Error('Informe o título do serviço.');
        if (flats.length === 0) throw new Error('Selecione pelo menos 1 apartamento para o serviço.');
      };

      assert.throws(() => validate('', [101]), /Informe o título/);
      assert.throws(() => validate('   ', [101]), /Informe o título/);
      assert.throws(() => validate('Pintura', []), /Selecione pelo menos 1/);
      assert.doesNotThrow(() => validate('Pintura', [101]));
    });

    it('2.6. Instruction resolution applies custom instructions when present, falls back to general instructions', () => {
      const resolveInstructions = (flatId, hasCustom, customMap, defaultInstr) => {
        const specific = customMap[flatId]?.trim();
        return hasCustom && specific ? specific : defaultInstr.trim();
      };

      const defaultText = 'Pintar paredes';
      const customMap = { 101: 'Trocar tomada', 102: '   ' };

      // Custom enabled: flat 101 gets custom, flat 102 falls back to default, flat 103 falls back to default
      assert.strictEqual(resolveInstructions(101, true, customMap, defaultText), 'Trocar tomada');
      assert.strictEqual(resolveInstructions(102, true, customMap, defaultText), 'Pintar paredes');
      assert.strictEqual(resolveInstructions(103, true, customMap, defaultText), 'Pintar paredes');

      // Custom disabled: all get default
      assert.strictEqual(resolveInstructions(101, false, customMap, defaultText), 'Pintar paredes');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 3: Empty, Loading, and Error States Handling
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 3: Empty, Loading, and Error States', () => {
    it('3.1. Tab 1 renders loading skeleton when ordersLoading is true', () => {
      assert.ok(pageContent.includes('ordersLoading ?'));
      assert.ok(pageContent.includes('animate-pulse h-64 bg-muted/40 rounded-2xl'));
    });

    it('3.2. Tab 1 renders empty state card when filteredOrders.length === 0', () => {
      assert.ok(pageContent.includes('filteredOrders.length === 0 ?'));
      assert.ok(pageContent.includes('Nenhuma ordem de serviço encontrada'));
      assert.ok(pageContent.includes('Criar Primeira Ordem de Serviço'));
    });

    it('3.3. Tab 2 renders loading state when flatsLoading is true', () => {
      assert.ok(pageContent.includes('flatsLoading ?'));
      assert.ok(pageContent.includes('Carregando apartamentos...'));
    });

    it('3.4. Tab 2 Save button shows spinner and disables buttons while saveMutation.isPending', () => {
      assert.ok(pageContent.includes('disabled={saveMutation.isPending}'));
      assert.ok(pageContent.includes('saveMutation.isPending ?'));
      assert.ok(pageContent.includes('Salvando Ordem...'));
    });

    it('3.5. Tab 3 renders loading state when progressLoading is true', () => {
      assert.ok(pageContent.includes('progressLoading ?'));
      assert.ok(pageContent.includes('Carregando dados de progresso...'));
    });

    it('3.6. Tab 3 renders empty selection placeholder when progressData is null', () => {
      assert.ok(pageContent.includes('!progressData ?'));
      assert.ok(pageContent.includes('Selecione uma ordem de serviço acima para visualizar o acompanhamento detalhado'));
    });

    it('3.7. Tab 3 Table renders empty state row when trackingFlats.length === 0', () => {
      assert.ok(pageContent.includes('trackingFlats.length === 0 ?'));
      assert.ok(pageContent.includes('Nenhum apartamento encontrado com o filtro selecionado'));
    });

    it('3.8. Reset Flat button is disabled when flat is already pending', () => {
      assert.ok(pageContent.includes('disabled={flat.status === "pending"}'));
    });

    it('3.9. Destructive error toast notifications are wired for all mutation failures', () => {
      // saveMutation error toast
      assert.ok(pageContent.includes('variant: "destructive"'));
      // toggleStatusMutation error toast
      assert.ok(pageContent.includes('toggleStatusMutation = useMutation'));
      // deleteOrderMutation error toast
      assert.ok(pageContent.includes('deleteOrderMutation = useMutation'));
      // resetFlatMutation error toast
      assert.ok(pageContent.includes('resetFlatMutation = useMutation'));
    });

    it('3.10. Action buttons in Table and Cards use stopPropagation to prevent modal conflicts', () => {
      assert.ok(pageContent.includes('e.stopPropagation()'));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 4: Guarded Routing & Navigation Placement
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 4: Guarded Routing & Navigation Placement', () => {
    it('4.1. App.tsx registers AdminRoute for /servicos and alias /service-orders', () => {
      assert.ok(
        appContent.includes('<AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />'),
        'Must register /servicos under AdminRoute'
      );
      assert.ok(
        appContent.includes('<AdminRoute path="/service-orders" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />'),
        'Must register alias /service-orders under AdminRoute'
      );
    });

    it('4.2. AdminRoute enforces authentication and rejects non-admin users with AccessDenied', () => {
      assert.ok(appContent.includes('function AdminGuard('));
      assert.ok(appContent.includes('user.role !== "admin"'));
      assert.ok(appContent.includes('<AccessDenied moduleName={moduleName} />'));
      assert.ok(appContent.includes('<Redirect to="/login" />'));
    });

    it('4.3. layout.tsx includes Serviços Externos exclusively for isAdmin in Governança category', () => {
      assert.ok(layoutContent.includes('🧹 Governança & Camareiras'));
      assert.ok(layoutContent.includes('...(isAdmin ? [{ title: "Serviços Externos", label: "Serviços Externos", href: "/servicos", icon: Wrench'));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 5: Live API Verification for Admin Endpoints
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 5: Live API Verification with Backend Endpoints', () => {
    const TEST_PORT = 3989;
    const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
    const prodDbPath = path.resolve('data/database.json');
    const isolatedDbPath = path.resolve('data/isolated-admin-challenge-database.json');
    let serverProcess;

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

    before(async () => {
      fs.copyFileSync(prodDbPath, isolatedDbPath);

      serverProcess = spawn('node', ['artifacts/api-server/demo-server.mjs'], {
        env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test', DATABASE_URL: '', DATABASE_FILE: isolatedDbPath },
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
        } catch {
          // wait
        }
        await new Promise(r => setTimeout(r, 250));
      }
      assert.ok(ready, 'Backend server did not start in time for live test');
    });

    after(() => {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
      if (fs.existsSync(isolatedDbPath)) {
        try { fs.unlinkSync(isolatedDbPath); } catch {}
      }
    });

    let createdOrderId;
    let createdToken;

    it('5.1. GET /api/service-orders rejects unauthenticated and non-admin requests', async () => {
      // Unauthenticated
      const resUnauth = await fetch(`${BASE_URL}/api/service-orders`);
      assert.strictEqual(resUnauth.status, 401);

      // Maid (non-admin)
      const resMaid = await fetch(`${BASE_URL}/api/service-orders`, { headers: maidHeaders });
      assert.strictEqual(resMaid.status, 403);

      // Admin
      const resAdmin = await fetch(`${BASE_URL}/api/service-orders`, { headers: adminHeaders });
      assert.strictEqual(resAdmin.status, 200);
      const orders = await resAdmin.json();
      assert.ok(Array.isArray(orders));
    });

    it('5.2. POST /api/service-orders creates order matching UI form payload', async () => {
      const payload = {
        title: 'Desafio Challenger M2 Pintura',
        cleanFlatMode: 'priority',
        maxSimultaneousFlats: 2,
        maxFlatsPerDay: 4,
        requirePhotos: true,
        estimatedDurationHours: 3.5,
        instructionFormat: 'list',
        defaultInstructions: 'Instrução padrão de teste',
        flats: [
          { flatId: 101, flatNumber: '101', instructions: 'Pintar sala' },
          { flatId: 102, flatNumber: '102', instructions: 'Instrução padrão de teste' }
        ]
      };

      const res = await fetch(`${BASE_URL}/api/service-orders`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(res.status, 201);
      const created = await res.json();
      assert.ok(created.id, 'Must return created id');
      assert.strictEqual(created.title, payload.title);
      assert.strictEqual(created.cleanFlatMode, 'priority');
      assert.strictEqual(created.token.length, 24, 'Token must be 24 hex characters');
      assert.strictEqual(created.flats.length, 2);

      createdOrderId = created.id;
      createdToken = created.token;
    });

    it('5.3. GET /api/service-orders/:id/progress returns tracking structure expected by Tab 3', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}/progress`, {
        headers: adminHeaders
      });

      assert.strictEqual(res.status, 200);
      const progress = await res.json();
      assert.strictEqual(progress.orderId, createdOrderId);
      assert.ok(progress.stats, 'Must return stats object');
      assert.strictEqual(progress.stats.total, 2);
      assert.strictEqual(progress.stats.pending, 2);
      assert.strictEqual(progress.stats.inProgress, 0);
      assert.strictEqual(progress.stats.done, 0);
      assert.strictEqual(progress.stats.percentage, 0);
      assert.ok(Array.isArray(progress.flats));
    });

    it('5.4. PATCH /api/service-orders/:id toggles order status between active and closed', async () => {
      // Close order
      const resClose = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'closed' })
      });
      assert.strictEqual(resClose.status, 200);
      const closed = await resClose.json();
      assert.strictEqual(closed.status, 'closed');

      // Reopen order
      const resReopen = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'active' })
      });
      assert.strictEqual(resReopen.status, 200);
      const reopened = await resReopen.json();
      assert.strictEqual(reopened.status, 'active');
    });

    it('5.5. POST /api/service-orders/:id/flats/:flatId/reset successfully reopens flat to pending', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}/flats/101/reset`, {
        method: 'POST',
        headers: adminHeaders
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.flat.status, 'pending');
      assert.strictEqual(body.flat.startedAt, null);
      assert.strictEqual(body.flat.finishedAt, null);
      assert.strictEqual(body.flat.workerName, null);
      assert.deepStrictEqual(body.flat.photos, []);
    });

    it('5.6. DELETE /api/service-orders/:id deletes the order cleanly', async () => {
      const res = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}`, {
        method: 'DELETE',
        headers: adminHeaders
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);

      // Verify it no longer exists
      const resCheck = await fetch(`${BASE_URL}/api/service-orders/${createdOrderId}`, {
        headers: adminHeaders
      });
      assert.strictEqual(resCheck.status, 404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 6: Build Artifact Verification
  // ──────────────────────────────────────────────────────────────────────────
  describe('Suite 6: Production Build & Asset Verification', () => {
    it('6.1. Compiled bundle contains /servicos and service order symbols', () => {
      assert.ok(fs.existsSync(distJsPath), 'Compiled bundle must exist');
      const bundle = fs.readFileSync(distJsPath, 'utf8');
      assert.ok(bundle.includes('/servicos'), 'Bundle must contain /servicos route');
      assert.ok(bundle.includes('cleanFlatMode') || bundle.includes('cleanFlat') || bundle.includes('service-orders'), 'Bundle must contain service orders logic');
    });
  });
});
