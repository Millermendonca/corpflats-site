## 2026-10-14T03:56:12Z

You are the Milestone 5 Frontend Implementation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m5_frontend`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first! specifically lines 166-180 and Mockups section)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md` (specifically parent directive 2026-10-14T03:34:19Z)
5. Explorer 3 Blueprint:
   - `.agents/teamwork/explorer_m5_wbp_3/analysis.md` and `handoff.md` (Features 28, 29, 30, 31)
6. Approved Mockups:
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockup_precificacao_1791928509939.jpg`
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockup_previsualizacao_v2_1791928602700.jpg`
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockup_caixa_entrada_ota_1791928543273.jpg`
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\mockups.md`

Your Scope (Milestone 5 Frontend: Features 28, 29, 30, and 31):

1. Feature 28: Pricing & Publishing UI (`artifacts/limpeza/src/components/pricing/`):
   - Layout strictly following `mockup_precificacao_1791928509939.jpg`:
     - 7 tabs: Custos · Tarifa Mínima · Tarifário & Sazonalidade · Canais · Restrições · Pré-visualização & Publicar · Análises.
     - Numbers strictly follow corrected SEBRAE criteria: Custo UH R$ 149,38 -> Tarifa Mínima R$ 276,63 (±0,05) with 100% decomposition (Custo R$ 149,38 / 54%, Comissão R$ 41,49 / 15%, Margem R$ 69,16 / 25%, Imposto R$ 16,60 / 6% fechando 100%).
     - 3-card layout on Tarifa Mínima tab: "Custo por UH ocupada", "Fórmula" with stacked composition bar and "✓ fecha 100%", "Planos publicados".
     - Yellow alert banner when changes are staged / unpublished.
   - Modal / Tab Pré-visualização & Publicar (`mockup_previsualizacao_v2_1791928602700.jpg`):
     - 4 KPI chips: Datas afetadas, Preços alterados, Retidos pela trava, Abaixo do piso.
     - Table showing current vs new rate per plan (Sem café vs Com café by guest count) and available units.
     - Highlights locked variation (>30%) requiring explicit confirmation in amber (`+38% 🔒`).
     - Right card for retained variations with Confirm and Discard buttons.
     - Bottom bar with "Publicar X alterações na WebBookingPro" triggering `POST /api/wbp/pricing/publish`.

2. Feature 29: OTA Inbox & Quarantine UI (`artifacts/limpeza/src/components/wbp/`):
   - Layout strictly following `mockup_caixa_entrada_ota_1791928543273.jpg`:
     - Header: Mode status pill (Desligado / Somente Observar / Automático), connection health (last polling, last ARI sync).
     - Filter tabs/pills: Todas, Importadas, Quarentena, Vinculadas, Canceladas.
     - Table with deduplicated reservation items (no duplicate rows!).
     - Slide-over Quarantine Resolution Drawer: shows reason diagnostic (`OVERBOOKING`, `CONFLICT`, `MAINTENANCE_BLOCKED`, `CHECKED_IN_CANCELLATION`, etc.), suggested actions (assign flat from 19 units, force accept, reject and notify channel), raw JSON payload inspector.
     - Secure Card View Modal: requires admin password re-authentication (`POST /api/wbp/vault/reauth`), receives 5-minute single-use token, fetches and displays card number and expiry securely (`POST /api/wbp/vault/view`), never displays CVV (zero CVV).

3. Feature 30: In-System Help Manual (R9):
   - Rich and complete Portuguese in-system help manual component/page at `/ajuda-wbp` (and linked in sidebar / settings):
     - Admin guide: obtaining credentials (`cid`, `shared_secret`), room/rate mapping, operating modes (`off`, `observe`, `auto`), sandbox testing, initial reconciliation, SEBRAE pricing and locks, credit card vault, alerts.
     - WBP Error Codes troubleshooting table: codes `4`, `1001`, `1002`, `1003`, `1031`, `1102`, `9203` with exact cause and system remedy.
     - Reception guide: daily shift routine, OTA inbox navigation, quarantine resolution, payment rules (`PaymentCollect = Channel` vs `Property`).
     - Embedded visual mockups and screenshots.

4. Feature 31: Frontend Build & Packaging (R10):
   - Integrate routing in `artifacts/limpeza/src/App.tsx` and menu entries in `artifacts/limpeza/src/components/layout.tsx`.
   - Run `npm run build` in `artifacts/limpeza` to ensure zero compilation or TypeScript errors.
   - Include generated build artifacts in `artifacts/limpeza/dist/` in the git commit.

5. Git Commit & Push:
   - Check `git branch --show-current` is `feature/wbp-integration`.
   - Commit frontend changes (including `artifacts/limpeza/dist/`) and `git push origin feature/wbp-integration`.
   - Write handoff report in `handoff.md` in your working directory and notify orchestrator.
