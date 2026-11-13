## 2026-09-30T23:36:00Z

You are Worker M3: Public Worker Portal Implementer.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_portal

You MUST read:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (specifically R5 and Acceptance Criteria)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\PROJECT.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_frontend\analysis.md
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_frontend\handoff.md

Write Ownership:
You own exclusively:
- artifacts/limpeza/src/pages/service-worker-portal.tsx (new file)
- artifacts/limpeza/src/App.tsx (add public route /servico/:token)
- tests/service-worker-portal.test.mjs (new test file)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Create artifacts/limpeza/src/pages/service-worker-portal.tsx implementing R5:
   - Standalone mobile-friendly page (no Shell sidebar, responsive for smartphone screens).
   - Extracts :token from route using useRoute or params.
   - Fetches GET /api/service/public/:token using TanStack Query useQuery with error and loading states.
   - Identification Banner (R5):
     * Always visible at top, visually distinct.
     * When not saved yet:
       - Inputs: Nome completo (name) and CPF (cpf).
       - Collaborators section: list of collaborators (name + CPF), button "+ Adicionar Ajudante", remove button.
       - Button "Salvar Identificação": calls POST /api/service/public/:token/register with { mainWorker: { name, cpf }, collaborators }.
     * When saved (or worker exists in GET response):
       - Banner turns green/emerald showing: "✓ Prestador Identificado: [Nome] (CPF: [CPF])" + helpers list, with option to edit.
     * Guard: If worker clicks "Iniciar" without saved identification, open an alert/dialog blocking action: "Identificação Obrigatória: Você precisa preencher e salvar sua identificação (Nome e CPF) antes de iniciar qualquer apartamento."
   - Flats List Cards (R5):
     * Service title and instructions header.
     * Cards for each flat:
       - Flat number (e.g. "Flat 101").
       - Occupancy status badge:
         * "🔴 Ocupado por Hóspede" if flat.isOccupied
         * "🧹 Sujo / Pós-Checkout" if flat.isDirty
         * "🟢 Vago / Limpo" if !flat.isOccupied && !flat.isDirty
       - Flat instructions (rendered as text or checklist if order.instructionFormat === "list").
       - Current status badge: Pendente (slate), Em Andamento (blue/sky with pulsating animation), Finalizado (emerald with checkmark).
       - Action Button with dynamic states and reasons:
         * If status === "pending":
           - If simultaneous limit reached: disabled with message "Limite de simultâneos atingido (máx: X). Finalize o flat em andamento."
           - If daily limit reached: disabled with message "Limite diário de X flats atingido para hoje."
           - If cleanFlatMode === "never" and flat is clean: disabled "Bloqueado: serviço não permite flats limpos."
           - If cleanFlatMode === "priority" and flat is clean while others are dirty: disabled "Bloqueado: priorize os apartamentos sujos primeiro."
           - If priority suggested (cleanFlatMode === "always" and flat is dirty): show badge "⭐ Recomendado iniciar este primeiro".
           - Otherwise: enabled button "▶️ Iniciar Apartamento" (calls POST /api/service/public/:token/flats/:flatId/start).
         * If status === "in_progress":
           - Button "🏁 Finalizar Serviço" (opens Finish Modal).
         * If status === "done":
           - Indicator "✓ Concluído" with completion time.
   - Finish Modal (R5):
     * Dialog modal opening on "Finalizar Serviço".
     * Warning callout: "Atenção: verifique se todo o serviço foi inspecionado e o apartamento está em condições adequadas."
     * If flat was clean (flat.wasCleanWhenStarted === true or flat is clean):
       - Mandatory question: "Precisa de camareira para finalizar a limpeza?"
       - RadioGroup: Sim / Não (cannot confirm without selecting).
     * Textarea for "Observações do Serviço".
     * Photo Upload (max 5 photos):
       - File input (camera / gallery) supporting image upload.
       - Compresses photos with compressImage from src/lib/image-compression.ts.
       - Uploads photos via POST /api/service/public/:token/flats/:flatId/photos (or base64 array to finish endpoint).
       - Thumbnail previews with remove photo button.
       - If order.requirePhotos === true: photo is mandatory (Confirm button disabled if 0 photos).
     * Button "Confirmar e Finalizar":
       - Calls POST /api/service/public/:token/flats/:flatId/finish with { needsCleaning, observations, photos }.
       - Refetches query and shows success toast.
2. In artifacts/limpeza/src/App.tsx:
   - Import ServiceWorkerPortal from @/pages/service-worker-portal
   - Register public routes:
     <Route path="/servico/:token" component={ServiceWorkerPortal} />
     <Route path="/service/:token" component={ServiceWorkerPortal} />
3. Create test suite tests/service-worker-portal.test.mjs validating:
   - Component implementation, R5 requirements, public route registration, compressImage integration, finish validation.
4. Run tests and build:
   - node --test tests/service-worker-portal.test.mjs
   - npm run build in artifacts/limpeza (must exit with code 0)
5. Git commit and push:
   - Stage modified files and dist/, commit with descriptive message, and git push origin main per AGENTS.md.
6. Write handoff report:
   - Write comprehensive report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m3_portal\handoff.md and send completion message.
