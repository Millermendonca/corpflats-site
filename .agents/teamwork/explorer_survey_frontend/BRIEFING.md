# BRIEFING — 2026-10-22T10:09:40Z

## Mission
Survey de frontend em `artifacts/limpeza/` para planejar o Sistema de Gestão de Funcionários CLT (Painel Admin RH e Ponto Eletrônico Mobile com Selfie/GPS/Whitelist).

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer_survey_frontend
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_frontend
- Original parent: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- Milestone: Survey do Sistema de Gestão de Funcionários CLT

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify any source code files (only metadata/reports in explorer_survey_frontend)
- Never run global or bulk tests (AGENTS.md strict rule)

## Current Parent
- Conversation ID: 58ecb31f-60d2-4e1e-9aac-82400a58c263
- Updated: 2026-10-22T10:09:40Z

## Investigation State
- **Explored paths**:
  - `artifacts/limpeza/package.json`
  - `artifacts/limpeza/src/App.tsx`
  - `artifacts/limpeza/src/components/layout.tsx`
  - `artifacts/limpeza/src/lib/permissions.ts`
  - `artifacts/limpeza/src/pages/equipe.tsx`
  - `artifacts/limpeza/src/pages/anserve-dashboard.tsx`
  - `artifacts/limpeza/src/pages/anserve-restock.tsx`
  - `artifacts/limpeza/src/pages/guest-pre-checkin.tsx`
  - `artifacts/limpeza/src/lib/image-compression.ts`
  - `artifacts/api-server/zapi-service.mjs` (coordenadas do hotel)
  - `data/database.json` (usuários Cris id:2 e Grazi id:3)
- **Key findings**:
  - Build pipeline (`npm --prefix artifacts/limpeza run build`) executado com sucesso (código 0, 53s).
  - Wouter é o roteador SPA padrão (`Route, Switch, useLocation`).
  - Rotas protegidas usam `AdminRoute` / `AdminGuard` com `hasModuleAccess()`.
  - Assinatura digital já possui padrão comprovado em HTML5 Canvas (`guest-pre-checkin.tsx`). Nenhuma lib externa necessária.
  - Selfie ao vivo usa Web API nativa (`navigator.mediaDevices.getUserMedia` + `<video>` + `<canvas>` snapshot + fallback input capture).
  - GPS usa `navigator.geolocation.getCurrentPosition` com cálculo Haversine contra coordenadas do Soho Residence (-21.7584, -41.3262).
  - Whitelist de dispositivos usa fingerprint persistente em `localStorage` (`gfm_device_token`).
  - Cris e Grazi permanecem identificadas como prestadoras autônomas com badge diferenciado no RH.
- **Unexplored areas**: Nenhuma pendência para a fase de Survey de frontend.

## Key Decisions Made
- Recomendar criação de duas páginas principais:
  1. `artifacts/limpeza/src/pages/hr-dashboard.tsx` (Painel Admin RH com 6 abas + whitelist).
  2. `artifacts/limpeza/src/pages/ponto-mobile.tsx` (Terminal Mobile de Batida de Ponto com Câmera/GPS/Whitelist).
- Adicionar `/rh` em `permissions.ts` e aliases `/colaboradores`, `/funcionarios`.
- Adicionar `/ponto` e `/rh/ponto` como rotas operacionais mobile.

## Artifact Index
- DISPATCH.md — Incoming dispatch instructions
- BRIEFING.md — Working memory and identity
- progress.md — Liveness heartbeat and step tracking
- handoff.md — Final comprehensive survey handoff report
