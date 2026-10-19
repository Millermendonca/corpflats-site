# Task Assignment: Worker M2 (Frontend Guards, Team Page & WBP Purge)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Authoritative References
- ORIGINAL_REQUEST.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (read section `## 2026-10-19T02:58:52Z`)
- PROJECT.md: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_13\PROJECT.md`
- Explorer Team & WBP Report: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_team_wbp\analysis.md`
- Explorer Team & WBP Handoff: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_team_wbp\handoff.md`
- Explorer Auth Report: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_auth_roles\analysis.md`

## Exclusively Owned Files
- `artifacts/limpeza/src/App.tsx`
- `artifacts/limpeza/src/pages/equipe.tsx`
- `artifacts/limpeza/src/components/wbp/index.ts`
- Deletion of: `artifacts/limpeza/src/pages/wbp-manual.tsx`
- Deletion of: `artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx`
- In-page role guards across `artifacts/limpeza/src/pages/*.tsx` (updating `user?.role !== "admin"` to allow `dev`)

## Scope of Work
1. **Purge WBP Manual completely**:
   - Delete `artifacts/limpeza/src/pages/wbp-manual.tsx` and `artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx`.
   - In `artifacts/limpeza/src/components/wbp/index.ts`: remove export of `WbpHelpManualPage`.
   - In `artifacts/limpeza/src/App.tsx`: remove import of `WbpManualPage` and `/ajuda-wbp` route.
2. **Create Dedicated Team & Access Page**:
   - Create `artifacts/limpeza/src/pages/equipe.tsx` (export default `TeamPage`).
   - Accessible by both `admin` and `dev`.
   - CRUD interface for team members: list users, add new user, edit user (nome, WhatsApp, PIX, role: `dev`, `admin`, `camareira`, `recepcao`, `manutencao`), and reset password.
   - Do NOT expose any API keys, cloud secrets, or developer configurations (those remain in `/configuracoes` restricted to `dev`).
3. **Route Guards in `App.tsx`**:
   - Create `DevGuard` / `DevRoute` that checks `user?.role === "dev"`. If not, renders `<AccessDenied />` or redirects.
   - Update `AdminGuard` / `AdminRoute` to accept `user?.role === "admin" || user?.role === "dev"`.
   - Protect with `DevRoute`: `/configuracoes`, `/monitor-servidor`, `/logs`, `/ia-status`, `/zapi-conexao`, `/jornada-reservas`.
   - Mount routes for `/equipe`, `/usuarios`, `/team` using `AdminRoute`.
4. **Update In-Page Role Guards**:
   - In pages where `if (user?.role !== "admin")` was hardcoded, update to `if (user?.role !== "admin" && user?.role !== "dev")` so that `dev` accounts retain full administrative access.
5. Report results in `handoff.md`.
