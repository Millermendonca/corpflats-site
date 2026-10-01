## 2026-09-30T23:51:00Z
You are Worker M4: Integrations Implementer (R6 Maid Flat Card & R7 PMS Calendar).
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4

You MUST read:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (specifically R6, R7, and Acceptance Criteria)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\PROJECT.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_integrations\analysis.md
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_integrations\handoff.md

Write Ownership:
You own exclusively:
- artifacts/limpeza/src/components/flat-card.tsx
- artifacts/limpeza/src/pages/pms-calendar.tsx
- tests/service-orders-integrations.test.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Implement R6 in artifacts/limpeza/src/components/flat-card.tsx:
   - Check if flat.serviceInProgress is present ({ serviceTitle, workerName, serviceOrderId }).
   - In badge row (around line 1062): display badge "🔧 Serviço em andamento" (amber badge with Wrench icon, animate-pulse).
   - In card body (around line 1278): display informative box showing service title and worker name, explaining that external service is in progress and cleaning is pending completion of service.
   - Highlight card border with amber border when flat.serviceInProgress is present.
   - In action buttons for dirty/will_clean: when flat.serviceInProgress is present, disable cleaning buttons, displaying disabled button "Iniciar Limpeza (Serviço em Andamento)" wrapped in Radix <Tooltip> with <TooltipContent> explaining: "⚠️ Limpeza Bloqueada: Aguardando finalização do serviço: [Título] (Prestador: [Nome])".
   - In batch cleaning checkbox (around line 945): add !flat.serviceInProgress to prevent selecting blocked flat.
2. Implement R7 in artifacts/limpeza/src/pages/pms-calendar.tsx:
   - In flatBlocks rendering (around lines 3848-3886):
     * Check if blockItem.isServiceBlock || blockItem.reason === "service_order".
     * If service block: render amber block with Wrench icon, badge "🔧 [Título do Serviço]", worker name if present, and hide manual delete trash icon.
   - In reservation modal / booking flow:
     * When selected dates overlap an active service block, display a prominent warning banner inside the modal: "⚠️ Atenção: Este apartamento possui serviço externo agendado/em andamento neste período: [Título] (Prestador: [Nome]). A reserva pode ser criada, mas o flat pode estar indisponível."
     * In handleSaveRes: if conflicting with a service block, prompt confirmation (confirm(...)) to allow admin to proceed consciously.
3. Write automated test suite tests/service-orders-integrations.test.mjs verifying:
   - flat-card.tsx service badge, disabled cleaning button with tooltip, batch select disabling.
   - pms-calendar.tsx visual block with "🔧 [Título]", warning banner and confirmation on conflict.
   - Backend injection verification for GET /api/flats, GET /api/reservations/checkouts, and GET /api/pms/calendar.
4. Run tests and build:
   - node --test tests/service-orders-integrations.test.mjs
   - node --test tests/service-orders.test.mjs tests/service-orders-admin-frontend.test.mjs tests/service-worker-portal.test.mjs
   - npm run build in artifacts/limpeza (must exit with code 0)
5. Git commit and push:
   - Stage modified files and artifacts/limpeza/dist/, commit with descriptive message, and git push origin main per AGENTS.md.
6. Write handoff report:
   - Write comprehensive report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4\handoff.md and send completion message.
