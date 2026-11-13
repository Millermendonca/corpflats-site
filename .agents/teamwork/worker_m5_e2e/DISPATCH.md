# Dispatch for Worker M5: E2E Final Acceptance & Build Deploy
Date: 2026-10-01T00:15:00Z
Role: teamwork_preview_worker
Work Item: Milestone 5 (Final Acceptance E2E Testing, Build R8, Commit & Push)

## 2026-10-01T00:15:30Z
You are Worker M5: E2E Final Acceptance & Build Deploy Implementer.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_e2e

You MUST read:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (Authoritative requirements R1 to R8)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\PROJECT.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4\handoff.md
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m4\handoff.md

Write Ownership:
You own exclusively:
- tests/service-orders-e2e-final.test.mjs (new test file)
- artifacts/limpeza/dist/ (build artifacts)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Author comprehensive opaque-box E2E acceptance suite tests/service-orders-e2e-final.test.mjs validating the complete lifecycle across R1 through R8:
   - R1: Database JSON verification (serviceOrders and serviceWorkers in data/database.json and initial state).
   - R2 & R3: Full REST API lifecycle on isolated test server/database:
     * Admin creates service order with cleanFlatMode ('never', 'priority', 'always'), simultaneous flat limit, daily flat limit, photo requirement, instructions.
     * Public contractor registers with 11-digit CPF and helper team.
     * Contractor start guard: unverified blocked (403), clean flat blocked when 'never' or 'priority' (400), simultaneous limit blocked (400), daily limit blocked (400).
     * Contractor starts flat -> instant serviceInProgress injection in GET /api/flats and GET /api/reservations/checkouts, and synthetic block in GET /api/pms/calendar.
     * Contractor finish validation: mandatory needsCleaning if flat was clean, photo validation if requirePhotos: true, observations saved, completion timestamp recorded.
     * Multi-channel notifications dispatched: WhatsApp to admin 5522998505276, WhatsApp to reception, Email to reception, notification recorded in db.notifications, audit log recorded.
     * Post-finish state: serviceInProgress cleared to null, calendar block removed, flat marked dirty if needsCleaning: true.
     * Admin flat reset endpoint (POST /api/service-orders/:id/flats/:flatId/reset): restores flat to pending.
     * Order completion: when all flats finished, order status becomes 'completed'.
   - R4: Admin management page structure & routes (service-orders.tsx, /servicos route in App.tsx, sidebar in layout.tsx).
   - R5: Public worker portal structure & routes (service-worker-portal.tsx, /servico/:token and /service/:token routes in App.tsx, mobile layout, identification banner, finish modal, compressImage integration).
   - R6: Maid flat card integration (flat-card.tsx badge '🔧 Serviço em andamento', border highlight, disabled cleaning button with Radix Tooltip explaining the lock, batch select suppression).
   - R7: PMS calendar integration (pms-calendar.tsx visual block with '🔧 [Título]', delete trash icon suppressed, reservation conflict warning banner, admin confirmation override).
2. Execute the entire test suite battery:
   - node --test tests/service-orders-e2e-final.test.mjs
   - node --test tests/service-orders.test.mjs
   - node --test tests/test-service-order-notifications.test.mjs
   - node --test tests/service-orders-admin-frontend.test.mjs
   - node --test tests/service-worker-portal.test.mjs
   - node --test tests/service-orders-integrations.test.mjs
   - node --test tests/service-orders-integrations-challenge.test.mjs
3. Verify backend mirror parity is 100% byte-for-byte:
   - Get-FileHash -Algorithm SHA256 "artifacts/api-server/demo-server.mjs"
   - Get-FileHash -Algorithm SHA256 "scripts/demo-server.mjs"
   - git diff --no-index artifacts/api-server/demo-server.mjs scripts/demo-server.mjs (must be 0 diff bytes).
4. Perform production build (R8):
   - Run npm run build in artifacts/limpeza (must exit with code 0).
5. Commit & Push (R8 & AGENTS.md):
   - Check git status.
   - Stage tests/service-orders-e2e-final.test.mjs, artifacts/limpeza/dist/, and any other tracked changes.
   - Commit with clear message: feat(service-orders): complete R1-R8 external service provider management module and e2e test suite
   - Execute git push origin main and verify git log origin/main..HEAD is empty.
6. Write handoff report in c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_e2e\handoff.md and send completion message.
