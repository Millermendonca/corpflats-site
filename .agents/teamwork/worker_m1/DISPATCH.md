## 2026-09-30T21:55:47Z
You are Worker M1: Backend Data & API Implementer.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1

You MUST read:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\PROJECT.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\analysis.md
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_backend\handoff.md

Write Ownership:
You own exclusively:
- data/database.json
- artifacts/api-server/demo-server.mjs
- scripts/demo-server.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. R1: In data/database.json, add "serviceOrders": [] and "serviceWorkers": []. Ensure loadDatabase() in demo-server.mjs initializes them if missing.
2. R2: Implement all Admin REST endpoints (requiring auth and role === 'admin'):
   - GET /api/service-orders
   - POST /api/service-orders (token: 24 hex characters using crypto.randomBytes(12).toString('hex'))
   - GET /api/service-orders/:id
   - PATCH /api/service-orders/:id
   - DELETE /api/service-orders/:id
   - GET /api/service-orders/:id/progress
3. R2: Implement all Public REST endpoints (unauthenticated):
   - GET /api/service/public/:token (returns 404 if invalid token, returns order and worker registration if valid)
   - POST /api/service/public/:token/register ({ mainWorker: { name, cpf }, collaborators: [] })
   - POST /api/service/public/:token/flats/:flatId/start
   - POST /api/service/public/:token/flats/:flatId/finish ({ observations, needsCleaning, photos })
   - POST /api/service/public/:token/flats/:flatId/photos (accepts photo data / uploadImageToStorage)
4. R2, R6, R7: In existing routes:
   - In GET /api/flats AND GET /api/reservations/checkouts: inject flat.serviceInProgress: { serviceTitle, workerName, serviceOrderId } | null
   - In GET /api/pms/calendar: inject synthetic service blocks into data.blocks for active services with estimatedFinishAt (isServiceBlock: true, reason: 'service_order')
5. R3: Business logic validation:
   - start:
     * verify serviceWorkers exists for token (403 if not)
     * check in_progress flats < maxSimultaneousFlats (400 if reached)
     * check done flats today < maxFlatsPerDay (400 if reached)
     * cleanFlatMode ("never": block if flat clean; "priority": block clean if any other flat in service is dirty/checkout today; "always": allow, return prioritySuggested: true if dirty)
   - finish:
     * needsCleaning mandatory if flat was clean (400 if missing)
     * requirePhotos: true requires photos non-empty (400 if empty)
     * record finishedAt, observations, photos, needsCleaning
   - notifications on start & finish:
     * WhatsApp via sendZapiMessage(bypassTestMode: true) to admin (5522998505276) and reception phone
     * Email via sendEmailAsync to reception email
     * internal notification via createNotification or db.notifications
6. Mirror Synchronization:
   - scripts/demo-server.mjs MUST be copied from artifacts/api-server/demo-server.mjs and be byte-for-byte identical!
7. Verification:
   - Run tests: run existing tests (e.g. node --test tests/checkout-occupancy-rule.test.mjs) and verify demo-server starts or parses without syntax errors (node -c artifacts/api-server/demo-server.mjs and node -c scripts/demo-server.mjs).
   - Write a node test script to test all the new service endpoints directly against the running server or logic.
8. Deliverables:
   - Write a comprehensive handoff report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md with all code diffs, verification commands, and test outputs.
   - When complete, send a message to parent with summary.
