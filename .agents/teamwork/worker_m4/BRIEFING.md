# BRIEFING — 2026-10-21T23:00:00Z

## Mission
Executar as Features F29 a F33 do Milestone M4: CRM 360º com LTV consolidado e histórico de frigobar, Analytics Demográfico de Consumo, Remoção de Textos Legados e FAQ, Sofia IA (contexto e módulo minibar), Cobrança Proativa de Divergências com suporte a `?ord=`, e garantir Paridade SHA-256 Twin-Server e Build de Produção Vite.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4
- Original parent: 2a43f791-5cc7-4933-bdd2-688af9234cb1
- Milestone: Worker M4 Integrations (R6 & R7)
- Current Milestone: Milestone M4 (Features F29 a F33 - Frigobar Anserve + CorpFlats)
- Active Parent: d10c20e2-adfb-4695-835e-52dd3bebe9a9 (Project Orchestrator)

## 🔒 Key Constraints
- Exclusively modify: artifacts/limpeza/src/components/flat-card.tsx, artifacts/limpeza/src/pages/pms-calendar.tsx, tests/service-orders-integrations.test.mjs
- No hardcoded test results, facade implementations, or cheating
- Always build artifacts/limpeza (npm run build)
- Always git commit and git push to origin main per AGENTS.md
- Escopo M4: `crm-guests.tsx`, `guest-minibar.tsx`, `demo-server.mjs`, `whatsapp-ai-service.mjs`, scripts espelhados, dist/
- Paridade SHA-256 obrigatória entre artifacts/api-server e scripts/
- NUNCA executar testes globais em lote (obedecer AGENTS.md), rodar apenas testes pontuais autorizados
- Não silenciar ou mascarar notificações em código

## Current Parent
- Conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Updated: 2026-10-21T22:56:07Z

## Task Summary
- **What to build**:
  1. F29: Em `demo-server.mjs` (`GET /api/pms/guests` e `:id`), somar `minibarSpent` ao `totalSpent`, gerar tags de preferência de frigobar, retornar histórico de consumo. Em `crm-guests.tsx`, injetar histórico de frigobar na ficha 360º, adicionar chips de filtro e refletir LTV.
  2. F30: Endpoint `GET /api/minibar/analytics/demographics` cruzando pedidos de frigobar com cidade/UF. 3ª aba em `crm-guests.tsx` com KPIs e matriz demográfica Estado vs Categorias.
  3. F31: Remoção de menções legadas de "frigobar vazio" em `whatsapp-ai-service.mjs` e atualização do seed `faq-agua-frigobar` em `demo-server.mjs`.
  4. F32: Sofia IA em `whatsapp-ai-service.mjs`: `minibarUrl` no `buildGuestContext`, suporte a `case "minibar": case "frigobar":` em `querySystemData`, e registro no tool system `buildGeminiTools`.
  5. F33: Quitação de divergência em `guest-minibar.tsx` (leitura de `?ord=`, banner e pagamento direto) e em `demo-server.mjs` (`POST /api/minibar/orders` com `orderId`).
  6. Twin Parity SHA-256 e Build Vite (`npm run build`).
- **Success criteria**:
  - SHA-256 idêntico entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (Confirmado: True).
  - SHA-256 idêntico entre `artifacts/api-server/whatsapp-ai-service.mjs` e `scripts/whatsapp-ai-service.mjs` (Confirmado: True).
  - Build Vite sem erros (código 0, Confirmado).
  - Testes pontuais passando: `node --test tests/minibar-backend-flow.test.mjs` (20/20 PASS), `node --test tests/challenger-m1-2-verification.test.mjs` (13/13 PASS), `node --test tests/minibar-stress-challenger.test.mjs` (13/13 PASS).
  - `git push origin main`.
- **Interface contracts**: PROJECT.md Milestone M4
- **Code layout**:
  - `artifacts/limpeza/src/pages/crm-guests.tsx`
  - `artifacts/limpeza/src/pages/guest-minibar.tsx`
  - `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`
  - `artifacts/api-server/whatsapp-ai-service.mjs` & `scripts/whatsapp-ai-service.mjs`
  - `artifacts/limpeza/dist/`

## Key Decisions Made
- Preservar o ID `faq-agua-frigobar` para compatibilidade com testes existentes em `whatsapp-ai-agent.test.mjs`.
- URL dinâmica em Sofia alert usando `process.env.SERVER_BASE_URL || db.settings?.baseUrl || "https://corpflats.com.br"`.
- Liquidar `orderId` em `POST /api/minibar/orders` preservando identificador `ORD-MB-DIV-...` sem duplicação no array.
- Quitação proativa em `guest-minibar.tsx` com banner destacado quando `?ord=` é informado na URL.

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/demo-server.mjs` & `scripts/demo-server.mjs`: F29, F30, F31, F33.
  - `artifacts/api-server/whatsapp-ai-service.mjs` & `scripts/whatsapp-ai-service.mjs`: F31, F32.
  - `artifacts/limpeza/src/pages/crm-guests.tsx`: F29, F30.
  - `artifacts/limpeza/src/pages/guest-minibar.tsx`: F33.
  - `artifacts/limpeza/dist/`: Build de produção Vite.
- **Build status**: Pass (código 0)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (46/46 testes pontuais passaram)
- **Lint status**: 0 lints pendentes
- **Tests added/modified**: Testes pontuais de frigobar executados e validados.

## Loaded Skills
- None

## Artifact Index
- DISPATCH.md — Assignment instructions & updates
- BRIEFING.md — Situational awareness
- progress.md — Heartbeat & status
- handoff.md — Final handoff report
