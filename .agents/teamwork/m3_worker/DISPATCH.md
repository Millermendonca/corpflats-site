# Dispatch — Milestone 3 Worker (Frontend UI & Build Delivery)

## Objective
Implement Features 8, 9, 10, and 11 of Milestone 3:
1. In `artifacts/limpeza/src/App.tsx`:
   - Register the admin route alias:
     `<AdminRoute path="/whatsapp-automation" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />`
2. Create `artifacts/limpeza/src/hooks/use-faq.ts`:
   - Strict TypeScript interfaces (`FaqItem`, `CreateFaqInput`, `UpdateFaqInput`).
   - Full integration with backend API (`GET /api/whatsapp/faq`, `POST /api/whatsapp/faq`, `PUT /api/whatsapp/faq/:id`, `DELETE /api/whatsapp/faq/:id`, `POST /api/whatsapp/faq/:id/approve`).
   - Category stats, status filter, search query, and toast feedback.
3. Create `artifacts/limpeza/src/components/faq-knowledge-base.tsx`:
   - 4 metric cards at top.
   - 9 category cards for quick filtering (`reservas`, `checkin_acesso`, `wifi_tecnologia`, `cafe_manha`, `garagem`, `estrutura_flat`, `regras_visitas_pets`, `lazer_condominio`, `checkout`).
   - 4 status filter tabs/pills: "Todas", "Ativas", "Perguntas Pendentes", "Sugestões de IA para Aprovar".
   - Search input.
   - Dual view: Table view & Cards view.
   - 1-Click Approval button for items with `status === "aguardando_aprovacao"`.
   - Create/Edit Modal with:
     - Question, formatted answer textarea.
     - Category select (all 9 categories).
     - Keywords tags input, Variations list input.
     - Client Exception Rule Configuration:
       - Scope radio/select (`all`, `exclude`, `include_only`).
       - Brazilian phone numbers input with normalization helper and tag management.
   - Delete confirmation dialog.
4. In `artifacts/limpeza/src/pages/whatsapp-automation.tsx`:
   - Add the 6th tab trigger (`value="faq"`) and tab content (`<TabsContent value="faq"><FaqKnowledgeBase /></TabsContent>`).
   - Adjust `TabsList` grid classes to fit 6 tabs cleanly on responsive screens.
5. Production Build & Git Delivery:
   - Run `npm run build` in `artifacts/limpeza` to ensure zero compilation or TypeScript errors and build assets to `artifacts/limpeza/dist/`.
   - Also run `node --test tests/whatsapp-ai-agent.test.mjs` to confirm backend tests continue to pass 24/24.
   - Execute git commit and mandatory `git push origin main` per `AGENTS.md`.

## Explorer References
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_1\handoff.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_2\handoff.md`
- Ready-to-use code in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_2\analysis.md`

## Write Ownership
- `artifacts/limpeza/src/App.tsx`
- `artifacts/limpeza/src/hooks/use-faq.ts`
- `artifacts/limpeza/src/components/faq-knowledge-base.tsx`
- `artifacts/limpeza/src/pages/whatsapp-automation.tsx`
- `artifacts/limpeza/dist/`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
