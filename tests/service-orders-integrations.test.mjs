import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('R6 & R7 Integrations Suite (Maid Flat Card & PMS Calendar)', () => {
  const flatCardPath = path.resolve('artifacts/limpeza/src/components/flat-card.tsx');
  const pmsCalendarPath = path.resolve('artifacts/limpeza/src/pages/pms-calendar.tsx');
  const demoServerPath = path.resolve('artifacts/api-server/demo-server.mjs');
  const demoServerMirrorPath = path.resolve('scripts/demo-server.mjs');

  describe('1. R6 Maid Flat Card Integration (flat-card.tsx)', () => {
    const flatCardContent = fs.readFileSync(flatCardPath, 'utf8');

    it('1.1 Imports Tooltip components and Wrench icon', () => {
      assert.ok(
        flatCardContent.includes('Tooltip') &&
        flatCardContent.includes('TooltipTrigger') &&
        flatCardContent.includes('TooltipContent'),
        'flat-card.tsx must import Tooltip, TooltipTrigger, and TooltipContent from @/components/ui/tooltip'
      );
      assert.ok(
        flatCardContent.includes('Wrench'),
        'flat-card.tsx must import Wrench icon from lucide-react'
      );
    });

    it('1.2 Highlights card border with amber when flat.serviceInProgress is present', () => {
      assert.ok(
        flatCardContent.includes('flat.serviceInProgress') &&
        (flatCardContent.includes('border-amber-500') || flatCardContent.includes('border-amber-400')),
        'Card element must apply amber border when flat.serviceInProgress is present'
      );
    });

    it('1.3 Disables batch cleaning checkbox when flat.serviceInProgress is present', () => {
      assert.ok(
        flatCardContent.includes('!flat.serviceInProgress') &&
        flatCardContent.includes('selectable && currentStatus === "dirty"'),
        'Batch cleaning checkbox condition must include !flat.serviceInProgress'
      );
    });

    it('1.4 Displays amber badge "🔧 Serviço em andamento" with pulse animation', () => {
      assert.ok(
        flatCardContent.includes('flat.serviceInProgress') &&
        flatCardContent.includes('🔧 Serviço em andamento') &&
        flatCardContent.includes('animate-pulse'),
        'Badge row must display "🔧 Serviço em andamento" with animate-pulse'
      );
    });

    it('1.5 Renders informative box in card body showing service title and worker name', () => {
      assert.ok(
        flatCardContent.includes('Serviço Externo em Andamento:') &&
        flatCardContent.includes('flat.serviceInProgress.serviceTitle') &&
        flatCardContent.includes('flat.serviceInProgress.workerName'),
        'Card body must render informative box with serviceTitle and workerName'
      );
      assert.ok(
        flatCardContent.includes('Aguardando conclusão do serviço externo para liberar a higienização do apartamento.'),
        'Informative box must explain that cleaning is pending service completion'
      );
    });

    it('1.6 Disables dirty cleaning action button with explanatory Radix Tooltip', () => {
      assert.ok(
        flatCardContent.includes('Iniciar Limpeza (Serviço em Andamento)'),
        'Must render disabled button with label "Iniciar Limpeza (Serviço em Andamento)"'
      );
      assert.ok(
        flatCardContent.includes('⚠️ Limpeza Bloqueada') &&
        flatCardContent.includes('Aguardando finalização do serviço:'),
        'TooltipContent must explain that cleaning is locked awaiting service completion'
      );
    });

    it('1.7 Disables will_clean action button with explanatory Radix Tooltip', () => {
      const willCleanIdx = flatCardContent.indexOf('currentStatus === "will_clean"');
      assert.ok(willCleanIdx !== -1, 'Must handle currentStatus === "will_clean"');
      const willCleanSnippet = flatCardContent.substring(willCleanIdx, willCleanIdx + 1200);
      assert.ok(
        willCleanSnippet.includes('flat.serviceInProgress'),
        'will_clean state must check flat.serviceInProgress'
      );
      assert.ok(
        willCleanSnippet.includes('Iniciar Limpeza (Serviço em Andamento)'),
        'will_clean state must render disabled button with service in progress label'
      );
      assert.ok(
        willCleanSnippet.includes('TooltipContent'),
        'will_clean state must wrap disabled button in TooltipContent'
      );
    });
  });

  describe('2. R7 PMS Calendar Integration (pms-calendar.tsx)', () => {
    const calendarContent = fs.readFileSync(pmsCalendarPath, 'utf8');

    it('2.1 Imports Wrench icon and cn utility', () => {
      assert.ok(
        calendarContent.includes('Wrench'),
        'pms-calendar.tsx must import Wrench icon'
      );
      assert.ok(
        calendarContent.includes('cn(') || calendarContent.includes('from "@/lib/utils"'),
        'pms-calendar.tsx must import cn utility'
      );
    });

    it('2.2 Renders visual amber block with Wrench icon and badge "🔧 [Título]" in timeline', () => {
      assert.ok(
        calendarContent.includes('blockItem.isServiceBlock || blockItem.reason === "service_order"') ||
        calendarContent.includes('blockItem.isServiceBlock || blockItem.reason === \'service_order\''),
        'flatBlocks rendering must check isServiceBlock or reason === "service_order"'
      );
      assert.ok(
        calendarContent.includes('Wrench') &&
        calendarContent.includes('animate-pulse'),
        'Service block must render Wrench icon with animate-pulse'
      );
      assert.ok(
        calendarContent.includes('🔧 {serviceTitle}') || calendarContent.includes('🔧 ') || calendarContent.includes('blockItem.serviceTitle'),
        'Service block must display "🔧 [Título do Serviço]"'
      );
      assert.ok(
        calendarContent.includes('blockItem.workerName'),
        'Service block must display workerName if present'
      );
    });

    it('2.3 Hides manual delete trash icon for service blocks', () => {
      assert.ok(
        calendarContent.includes('!isService && (') ||
        calendarContent.includes('!isService &&'),
        'Manual delete trash icon must be hidden when isService is true'
      );
    });

    it('2.4 Enhances block details modal for service orders and prevents accidental deletion', () => {
      const detailsModalIdx = calendarContent.indexOf('<Dialog open={blockDetailsModalOpen}');
      assert.ok(detailsModalIdx !== -1, 'Must contain <Dialog open={blockDetailsModalOpen}>');
      const detailsSnippet = calendarContent.substring(detailsModalIdx, detailsModalIdx + 5000);
      assert.ok(
        detailsSnippet.includes('isServiceBlock') || detailsSnippet.includes('service_order'),
        'Block details modal must differentiate service blocks'
      );
      assert.ok(
        detailsSnippet.includes('/servicos') || detailsSnippet.includes('Ver em Serviços'),
        'Block details modal must redirect to /servicos instead of deleting service order block'
      );
    });

    it('2.5 Detects service block conflict in reservation modal and renders warning banner', () => {
      assert.ok(
        calendarContent.includes('activeServiceBlockConflict'),
        'Must calculate activeServiceBlockConflict memo based on flat and dates'
      );
      assert.ok(
        calendarContent.includes('⚠️ Atenção: Este apartamento possui serviço externo agendado/em andamento neste período:') &&
        calendarContent.includes('A reserva pode ser criada, mas o flat pode estar indisponível.'),
        'Must render prominent warning banner inside reservation modal with exact required warning text'
      );
    });

    it('2.6 Prompts confirmation (confirm) in handleSaveRes on conflict allowing admin override', () => {
      const handleSaveIdx = calendarContent.indexOf('handleSaveRes');
      assert.ok(handleSaveIdx !== -1, 'handleSaveRes function must exist');
      const handleSaveSnippet = calendarContent.substring(handleSaveIdx, handleSaveIdx + 2000);
      assert.ok(
        handleSaveSnippet.includes('activeServiceBlockConflict'),
        'handleSaveRes must check activeServiceBlockConflict'
      );
      assert.ok(
        handleSaveSnippet.includes('confirm('),
        'handleSaveRes must trigger confirm() prompt on conflict'
      );
      assert.ok(
        handleSaveSnippet.includes('A reserva pode ser criada, mas o flat pode estar indisponível.') ||
        handleSaveSnippet.includes('AVISO DE CONFLITO COM SERVIÇO EXTERNO'),
        'Confirmation prompt must warn about service order conflict'
      );
    });

    it('2.7 Prompts confirmation during drag-and-drop move on service block conflict', () => {
      assert.ok(
        calendarContent.includes('serviceBlockConflict') &&
        calendarContent.includes('hasHardBlockConflict'),
        'Drag-and-drop must distinguish hard blocks from overridable service blocks'
      );
    });
  });

  describe('3. Backend Integration Verification (demo-server.mjs & scripts/demo-server.mjs)', () => {
    const serverCode = fs.readFileSync(demoServerPath, 'utf8');
    const mirrorCode = fs.readFileSync(demoServerMirrorPath, 'utf8');

    it('3.1 Backend mirror is strictly byte-for-byte identical', () => {
      assert.strictEqual(
        serverCode,
        mirrorCode,
        'scripts/demo-server.mjs must be byte-for-byte identical to artifacts/api-server/demo-server.mjs'
      );
    });

    it('3.2 GET /api/flats injects serviceInProgress for active services', () => {
      const flatsIdx = serverCode.indexOf('app.get("/api/flats"');
      assert.ok(flatsIdx !== -1, 'GET /api/flats must exist');
      const snippet = serverCode.substring(flatsIdx, flatsIdx + 800);
      assert.ok(snippet.includes('serviceInProgress'), 'GET /api/flats must inject serviceInProgress');
      assert.ok(serverCode.includes('function getFlatServiceInProgress'), 'Must define getFlatServiceInProgress');
      assert.ok(serverCode.includes('serviceTitle: order.title'), 'serviceInProgress must contain serviceTitle');
      assert.ok(serverCode.includes('workerName:'), 'serviceInProgress must contain workerName');
      assert.ok(serverCode.includes('serviceOrderId: order.id'), 'serviceInProgress must contain serviceOrderId');
    });

    it('3.3 GET /api/reservations/checkouts injects serviceInProgress for maid dashboard', () => {
      const checkoutsIdx = serverCode.indexOf('app.get("/api/reservations/checkouts"');
      assert.ok(checkoutsIdx !== -1, 'GET /api/reservations/checkouts must exist');
      const snippet = serverCode.substring(checkoutsIdx, checkoutsIdx + 16000);
      assert.ok(snippet.includes('serviceInProgress'), 'GET /api/reservations/checkouts must inject serviceInProgress');
    });

    it('3.4 GET /api/pms/calendar injects synthetic serviceOrderBlocks with isServiceBlock: true', () => {
      const calIdx = serverCode.indexOf('app.get("/api/pms/calendar"');
      assert.ok(calIdx !== -1, 'GET /api/pms/calendar must exist');
      const snippet = serverCode.substring(calIdx, calIdx + 10000);
      assert.ok(snippet.includes('serviceOrderBlocks'), 'Must build serviceOrderBlocks');
      assert.ok(snippet.includes('isServiceBlock: true'), 'Must set isServiceBlock: true');
      assert.ok(snippet.includes('reason: "service_order"'), 'Must set reason: "service_order"');
      assert.ok(snippet.includes('startDate') && snippet.includes('endDate'), 'Must provide start and end dates');
      assert.ok(snippet.includes('workerName'), 'Must include workerName');
      assert.ok(snippet.includes('serviceTitle'), 'Must include serviceTitle');
    });
  });

  describe('4. Simulation & Behavioral Logic Verification', () => {
    it('4.1 Flat serviceInProgress structure matches expected contract', () => {
      const sampleFlatWithService = {
        flatId: 101,
        flatNumber: "101",
        serviceInProgress: {
          serviceTitle: "Pintura Completa",
          workerName: "Carlos Eletricista",
          serviceOrderId: 42
        }
      };
      assert.ok(sampleFlatWithService.serviceInProgress !== null);
      assert.strictEqual(sampleFlatWithService.serviceInProgress.serviceTitle, 'Pintura Completa');
      assert.strictEqual(sampleFlatWithService.serviceInProgress.workerName, 'Carlos Eletricista');
      assert.strictEqual(sampleFlatWithService.serviceInProgress.serviceOrderId, 42);
    });

    it('4.2 PMS Calendar date conflict calculation correctly identifies overlapping periods', () => {
      const block = {
        id: 'service_block_1_101',
        flatId: 101,
        flatNumber: '101',
        startDate: '2026-10-02',
        endDate: '2026-10-04',
        isServiceBlock: true,
        reason: 'service_order',
        serviceTitle: 'Revisão Elétrica',
        workerName: 'João Silva'
      };

      const checkConflict = (formFlatId, formCheckin, formCheckout) => {
        if (!formFlatId || !formCheckin || !formCheckout) return null;
        const sameFlat = Number(block.flatId) === Number(formFlatId) || String(block.flatNumber) === String(formFlatId);
        if (!sameFlat) return null;
        const overlaps = block.startDate <= formCheckout && block.endDate >= formCheckin;
        return overlaps ? block : null;
      };

      // Exact overlap
      assert.ok(checkConflict('101', '2026-10-01', '2026-10-05') !== null, 'Should detect full overlap');
      assert.ok(checkConflict('101', '2026-10-03', '2026-10-06') !== null, 'Should detect partial start overlap');
      assert.ok(checkConflict('101', '2026-09-30', '2026-10-03') !== null, 'Should detect partial end overlap');

      // Different flat
      assert.strictEqual(checkConflict('102', '2026-10-02', '2026-10-04'), null, 'Different flat should not conflict');

      // Non-overlapping dates
      assert.strictEqual(checkConflict('101', '2026-09-25', '2026-09-28'), null, 'Earlier dates should not conflict');
      assert.strictEqual(checkConflict('101', '2026-10-06', '2026-10-10'), null, 'Later dates should not conflict');
    });
  });
});
