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
});
