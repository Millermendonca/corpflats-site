# BRIEFING — 2026-10-21T19:15:00Z

## Mission
Implementar o Marco M1 (Backend Core, Dados & APIs de Frigobar — Features F01 a F10) com paridade SHA-256 e testes pontuais isolados.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
- Original parent: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Milestone: M1 (Backend Core, Dados & APIs de Frigobar)

## 🔒 Key Constraints
- Não trapacear (Integrity Mandate): implementação genuína de estado e regras, sem hardcode ou fachadas.
- Regra estrita de testes do AGENTS.md: NUNCA rodar testes globais (`tests/*.test.mjs`), suítes completas ou varreduras. Executar EXCLUSIVAMENTE `node --test tests/minibar-backend-flow.test.mjs`.
- Sempre manter paridade SHA-256 exata entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
- Desacoplamento financeiro: consumo de frigobar NUNCA altera o valor da hospedagem (`r.totalAmount` inalterado).
- Retenção mínima de 730 dias para `minibarOrders` fiscais no `pruneDatabase`.

## Current Parent
- Conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9
- Updated: 2026-10-21T19:15:00Z

## Task Summary
- **What to build**: Features F01 a F10 do Frigobar no backend: Coleções (`minibarProducts`, `minibarDefaultStock`, `minibarOrders`, `minibarInspections`, `minibarSettings`), APIs de catálogo/gabarito, contexto flat/reserva com validação por 4 dígitos de telefone, checkout PIX (Inter) e Cartão (MP), consulta de status de pedido, upload de NF com envio WhatsApp/Email e portal do hóspede, registro de inspeção da repositora com detecção de divergência e disparo Sofia, extrato de repasse.
- **Success criteria**: APIs funcionais, validações sólidas, paridade SHA-256 de `demo-server.mjs`, teste pontual `minibar-backend-flow.test.mjs` passando 100%.
- **Interface contracts**: `PROJECT.md` e `ORIGINAL_REQUEST.md`.
- **Code layout**: `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `tests/minibar-backend-flow.test.mjs`.

## Key Decisions Made
- `minibarOrders` possui ciclo de vida desacoplado de reservas, mantendo `r.totalAmount` imutável.
- Cortesia de boas-vindas limitada a 1x gratuita por estadia, convertendo tentativas posteriores em pedidos tarifados.
- Divergências físicas identificadas na inspeção da repositora geram pedido `pendente_cobranca` e disparam alerta Sofia para o WhatsApp da recepção.
- Repasse Anserve desconta taxas reais de pagamento (3,99% Cartão MP / 0,99% PIX Inter) e adiciona crédito pelas cortesias CorpFlats.
- Paridade SHA-256 mantida estritamente via cópia atômica entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

## Artifact Index
- `.agents/teamwork/worker_m1/DISPATCH.md` — Assignment
- `.agents/teamwork/worker_m1/BRIEFING.md` — Persistent memory
- `.agents/teamwork/worker_m1/progress.md` — Liveness & status tracking
- `.agents/teamwork/worker_m1/changes.md` — Detailed implementation changes
- `.agents/teamwork/worker_m1/handoff.md` — 5-component handoff report

## Change Tracker
- **Files modified**:
  - `artifacts/api-server/demo-server.mjs`: Core backend, schemas, webhooks e APIs completas F01-F10
  - `scripts/demo-server.mjs`: Servidor gêmeo espelhado com hash idêntico
  - `tests/minibar-backend-flow.test.mjs`: Suíte pontual de testes com 20 subtestes
- **Build status**: Pass (20/20 tests passing)
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (20 passed, 0 failed, 0 skipped)
- **Lint status**: Clean
- **Tests added/modified**: `tests/minibar-backend-flow.test.mjs` (20 subtestes)
