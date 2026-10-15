import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Frontend Admin Service Orders (M2 Verification)', () => {
  const serviceOrdersPagePath = path.resolve('artifacts/limpeza/src/pages/service-orders.tsx');
  const appPath = path.resolve('artifacts/limpeza/src/App.tsx');
  const layoutPath = path.resolve('artifacts/limpeza/src/components/layout.tsx');
  const distIndexPath = path.resolve('artifacts/limpeza/dist/public/index.html');
  const distJsPath = path.resolve('artifacts/limpeza/dist/public/assets/index.js');

  it('1. artifacts/limpeza/src/pages/service-orders.tsx exists and uses Shell from layout.tsx', () => {
    assert.ok(fs.existsSync(serviceOrdersPagePath), 'service-orders.tsx must exist');
    const content = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    assert.ok(content.includes('import { Shell } from "@/components/layout"'), 'Must import Shell');
    assert.ok(content.includes('<Shell>'), 'Must render <Shell>');
  });

  it('2. service-orders.tsx implements Tabs with 3 tabs (Lista, Criar/Editar, Acompanhamento)', () => {
    const content = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    assert.ok(content.includes('TabsContent value="list"'), 'Must contain list tab');
    assert.ok(content.includes('TabsContent value="form"'), 'Must contain form tab');
    assert.ok(content.includes('TabsContent value="tracking"'), 'Must contain tracking tab');
  });

  it('3. Tab 1 (Lista) contains cards, copyable link, progress bar, action buttons', () => {
    const content = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    assert.ok(content.includes('/servico/'), 'Must build copyable portal link');
    assert.ok(content.includes('copyPortalLink'), 'Must have copyPortalLink function');
    assert.ok(content.includes('<Progress'), 'Must render Progress bar');
    assert.ok(content.includes('Ver Progresso'), 'Must have "Ver Progresso" button');
    assert.ok(content.includes('Editar'), 'Must have "Editar" button');
    assert.ok(content.includes('toggleStatusMutation'), 'Must support Encerrar/Reativar');
  });

  it('4. Tab 2 (Criar/Editar) implements all R4 form fields and cleanFlatMode options', () => {
    const content = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    // cleanFlatMode 3 options
    assert.ok(content.includes('setFormCleanFlatMode("never")'), 'Must support cleanFlatMode never');
    assert.ok(content.includes('setFormCleanFlatMode("priority")'), 'Must support cleanFlatMode priority');
    assert.ok(content.includes('setFormCleanFlatMode("always")'), 'Must support cleanFlatMode always');
    assert.ok(content.includes('Bloquear se o flat estiver limpo') || content.includes('Bloquear se estiver limpo'), 'Must describe never option');
    assert.ok(content.includes('Só liberar flat limpo se nenhum outro flat do serviço estiver sujo') || content.includes('Prioridade para flats sujos'), 'Must describe priority option');
    assert.ok(content.includes('Liberar qualquer flat a qualquer momento') || content.includes('Liberar qualquer flat'), 'Must describe always option');

    // numeric & toggles
    assert.ok(content.includes('formMaxSimultaneous'), 'Must have maxSimultaneousFlats');
    assert.ok(content.includes('formMaxPerDay'), 'Must have maxFlatsPerDay');
    assert.ok(content.includes('formRequirePhotos'), 'Must have requirePhotos switch');
    assert.ok(content.includes('formEstimatedDurationHours'), 'Must have estimatedDurationHours');

    // flat selection & instructions
    assert.ok(content.includes('formSelectedFlatIds'), 'Must support flat selection grid');
    assert.ok(content.includes('formDefaultInstructions'), 'Must have default instructions (aplicar a todos)');
    assert.ok(content.includes('formHasCustomInstructions'), 'Must support individual flat instructions');
    assert.ok(content.includes('formInstructionFormat'), 'Must support instructionFormat toggle');

    // Save calling POST or PATCH
    assert.ok(content.includes('fetch(url'), 'Must call API to save order');
    assert.ok(content.includes('/api/service-orders'), 'Must target /api/service-orders endpoint');
  });

  it('5. Tab 3 (Painel de Acompanhamento) implements polling, real-time table, dialog modal, reset button', () => {
    const content = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    assert.ok(content.includes('refetchInterval: 10000'), 'Must poll progress every 10 seconds');
    assert.ok(content.includes('/api/service-orders/${effectiveTrackingOrderId}/progress') || content.includes('/progress'), 'Must query progress endpoint');
    assert.ok(content.includes('<Table'), 'Must render Table');
    assert.ok(content.includes('trackingStatusFilter'), 'Must support filtering by status');
    assert.ok(content.includes('setDetailModalFlat'), 'Must open Dialog modal on row click');
    assert.ok(content.includes('/reset'), 'Must have reset flat action');
    assert.ok(content.includes('POST') && content.includes('/api/service-orders/'), 'Must call reset endpoint');
  });

  it('6. App.tsx registers AdminRoute for /servicos with moduleName', () => {
    const content = fs.readFileSync(appPath, 'utf8');
    assert.ok(content.includes('import ServiceOrders from \'@/pages/service-orders\';') || content.includes('import ServiceOrders from "@/pages/service-orders";'), 'Must import ServiceOrders');
    assert.ok(
      content.includes('<AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />'),
      'Must register /servicos with exact AdminRoute moduleName'
    );
  });

  it('7. layout.tsx includes Serviços Externos in navCategories under Governança & Camareiras', () => {
    const content = fs.readFileSync(layoutPath, 'utf8');
    assert.ok(content.includes('Wrench'), 'Must import Wrench');
    assert.ok(content.includes('Serviços Externos'), 'Must include Serviços Externos label/title');
    assert.ok(content.includes('href: "/servicos"'), 'Must link to /servicos');
  });

  it('8. Production dist build is complete and contains service orders route bundle', () => {
    assert.ok(fs.existsSync(distIndexPath), 'dist/public/index.html must exist');
    assert.ok(fs.existsSync(distJsPath), 'dist/public/assets/index.js must exist');
    const jsContent = fs.readFileSync(distJsPath, 'utf8');
    assert.ok(jsContent.includes('/servicos'), 'Compiled JS bundle must contain /servicos route');
  });

  it('9. Worker availability WhatsApp notification & worker/collaborator deletion are implemented in backend and frontend', () => {
    const backendPath = path.resolve('artifacts/api-server/demo-server.mjs');
    const scriptBackendPath = path.resolve('scripts/demo-server.mjs');
    const portalPagePath = path.resolve('artifacts/limpeza/src/pages/service-worker-portal.tsx');

    const backendContent = fs.readFileSync(backendPath, 'utf8');
    const scriptBackendContent = fs.readFileSync(scriptBackendPath, 'utf8');
    const adminContent = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    const portalContent = fs.readFileSync(portalPagePath, 'utf8');

    // Parity between demo-server.mjs and scripts/demo-server.mjs
    assert.equal(backendContent, scriptBackendContent, 'demo-server.mjs and scripts/demo-server.mjs must be 100% identical');

    // Backend availability notification engine + anti-loop
    assert.ok(backendContent.includes('function checkAndNotifyAvailableServiceFlats('), 'Backend must define checkAndNotifyAvailableServiceFlats');
    assert.ok(backendContent.includes('workerNotifiedAvailable'), 'Backend must track workerNotifiedAvailable anti-loop flag');
    assert.ok(backendContent.includes('app.delete("/api/service-orders/:id/worker"'), 'Backend must support admin DELETE worker route');
    assert.ok(backendContent.includes('app.delete("/api/service/public/:token/worker"'), 'Backend must support public portal DELETE worker route');

    // Frontend Admin & Portal deletion + WhatsApp requirement
    assert.ok(adminContent.includes('deleteAdminWorkerMutation'), 'Admin page must have deleteAdminWorkerMutation');
    assert.ok(adminContent.includes('formWorkerCollaborators'), 'Admin page must manage worker collaborators');
    assert.ok(portalContent.includes('deleteWorkerMutation'), 'Portal page must have deleteWorkerMutation');
    assert.ok(portalContent.includes('Você receberá avisos no WhatsApp assim que houver apartamento liberado para o serviço'), 'Portal page must confirm WhatsApp availability alerts');
  });

  it('10. R1: Tab 3 tracking table fixes squished Flat column and translates notification events', () => {
    const adminContent = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    assert.ok(!adminContent.includes('<TableHead className="w-24 font-bold text-xs">Flat</TableHead>'), 'Must not use narrow w-24 on Flat TableHead');
    assert.ok(adminContent.includes('min-w-[220px]'), 'Must apply generous min-width to Flat column');
    assert.ok(adminContent.includes('whitespace-nowrap rounded-md'), 'Scenario badges must use whitespace-nowrap rounded-md');
    assert.ok(adminContent.includes('NOTIFICATION_EVENT_LABELS'), 'Must translate notification event keys to Portuguese');
  });

  it('11. R2: Clean-flat finish question is strictly scoped to vago_limpo and checkin_hoje_limpo', () => {
    const backendPath = path.resolve('artifacts/api-server/demo-server.mjs');
    const portalPagePath = path.resolve('artifacts/limpeza/src/pages/service-worker-portal.tsx');
    const backendContent = fs.readFileSync(backendPath, 'utf8');
    const portalContent = fs.readFileSync(portalPagePath, 'utf8');

    assert.ok(
      backendContent.includes('flat.wasCleanWhenStarted = scenario === "vago_limpo" || scenario === "checkin_hoje_limpo"'),
      'Backend /start must set wasCleanWhenStarted strictly for vago_limpo and checkin_hoje_limpo'
    );
    assert.ok(
      backendContent.includes('flat.needsCleaning = flat.wasCleanWhenStarted === true && typeof req.body.needsCleaning === "boolean" ? req.body.needsCleaning : null'),
      'Backend /finish must force needsCleaning to null when wasCleanWhenStarted is not true'
    );
    assert.ok(portalContent.includes('export function isCleanWhenStarted('), 'Portal must define isCleanWhenStarted helper');
    assert.ok(portalContent.includes('O flat permanece limpo'), 'Portal finish modal must display "O flat permanece limpo" option');
    assert.ok(portalContent.includes('Precisa de uma camareira para limpeza'), 'Portal finish modal must display "Precisa de uma camareira para limpeza" option');
  });

  it('12. R3: Per-flat manual override (force-release / forceReleased) is implemented across backend, admin, and portal', () => {
    const backendPath = path.resolve('artifacts/api-server/demo-server.mjs');
    const portalPagePath = path.resolve('artifacts/limpeza/src/pages/service-worker-portal.tsx');
    const backendContent = fs.readFileSync(backendPath, 'utf8');
    const adminContent = fs.readFileSync(serviceOrdersPagePath, 'utf8');
    const portalContent = fs.readFileSync(portalPagePath, 'utf8');

    assert.ok(backendContent.includes('app.post("/api/service-orders/:id/flats/:flatId/force-release"'), 'Backend must expose POST /force-release endpoint');
    assert.ok(backendContent.includes('Boolean(flat.forceReleased) || (isScenarioAllowed && isCleanModeAllowed)'), 'checkAndNotifyAvailableServiceFlats must bypass restrictions when forceReleased is true');
    assert.ok(adminContent.includes('forceReleaseMutation'), 'Admin page must have forceReleaseMutation');
    assert.ok(adminContent.includes('🔓 Liberar Flat'), 'Admin page must render "🔓 Liberar Flat" button');
    assert.ok(adminContent.includes('🔓 Liberado Manualmente'), 'Admin page must render "🔓 Liberado Manualmente" badge');
    assert.ok(portalContent.includes('🔓 Liberado pela Administração'), 'Worker portal must render "🔓 Liberado pela Administração" badge');
  });
});
