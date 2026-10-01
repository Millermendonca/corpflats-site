## 2026-09-30T23:20:51Z

You are Worker M2: Frontend Admin Implementer.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2

You MUST read:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\PROJECT.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_frontend\analysis.md
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_frontend\handoff.md

Write Ownership:
You own exclusively:
- artifacts/limpeza/src/pages/service-orders.tsx (new file)
- artifacts/limpeza/src/App.tsx
- artifacts/limpeza/src/components/layout.tsx

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Create artifacts/limpeza/src/pages/service-orders.tsx implementing R4:
   - Use Shell from components/layout.tsx
   - Use Tabs (components/ui/tabs.tsx) with 3 tabs:
     * Tab 1 (Lista): Cards showing title, status badge, progress bar (X/Y flats completed), copyable portal link (${window.location.origin}/servico/${token}), buttons: "Novo Serviço", "Ver Progresso", "Editar", "Encerrar/Reativar".
     * Tab 2 (Criar/Editar): Full form with:
       - title
       - cleanFlatMode radio/select with 3 clear explanatory labels:
         "never": Bloquear se o flat estiver limpo (não tem pós-checkout nem dirty)
         "priority": Só liberar flat limpo se nenhum outro flat do serviço estiver sujo
         "always": Liberar qualquer flat a qualquer momento (com sugestão de prioridade)
       - maxSimultaneousFlats (number)
       - maxFlatsPerDay (number)
       - requirePhotos (switch / toggle)
       - estimatedDurationHours (number, optional)
       - Flat selection checkbox grid for all 19 active flats
       - Instructions field "aplicar a todos" + option for individual flat instructions
       - instructionFormat toggle: "text" (texto corrido) or "list" (lista de itens)
       - Save button calling POST /api/service-orders or PATCH /api/service-orders/:id.
     * Tab 3 (Painel de Acompanhamento): Real-time polling/refetch table with:
       - Flat | Status badge | Prestador | Início | Fim | Precisa Camareira | Observações | Fotos
       - Filter by status (Todos, Pendente, Em Andamento, Finalizado)
       - Clickable row opening Dialog modal with full photos, observations, timestamps
       - Admin button to reset flat to "pending" via POST /api/service-orders/:id/flats/:flatId/reset.
2. In artifacts/limpeza/src/App.tsx:
   - Register <AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />
3. In artifacts/limpeza/src/components/layout.tsx:
   - In navCategories under "🧹 Governança & Camareiras", add { title: "Serviços Externos", href: "/servicos", icon: Wrench } (import Wrench from lucide-react).
4. Run build verification:
   - Run npm run build in artifacts/limpeza (must build cleanly with exit code 0).
5. Git commit and push:
   - Stage modified files and dist/, commit, and git push origin main per AGENTS.md.
6. Deliver report:
   - Write comprehensive report to c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m2\handoff.md and send message.
