## 2026-10-21T19:49:27Z
Você é o subagente worker_m1_fix (teamwork_preview_worker).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1_fix

O diretório raiz do projeto é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

Seu parent é o Project Orchestrator (conversation ID: d10c20e2-adfb-4695-835e-52dd3bebe9a9).

Leia atentamente TODOS estes arquivos antes de iniciar o trabalho:
1. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (seção 2026-10-21T18:26:13Z)
2. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md
3. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_16\PROJECT.md
4. c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_16\GATE_STATUS.md
5. RELATÓRIOS DOS EXPLORERS DE REMEDIAÇÃO:
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_fix_1\analysis.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_fix_2\analysis.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m1_fix_3\analysis.md
6. RELATÓRIO DO AUDITOR FORENSE (VETO DE INTEGRIDADE):
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\auditor_m1\handoff.md
7. RELATÓRIOS DOS REVISORES E CHALLENGERS:
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m1_1\handoff.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m1_2\handoff.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m1_1\handoff.md
   - c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m1_2\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Missão do Worker M1 Fix (Remediação de M1):
Aplicar pontualmente todas as correções mapeadas nos arquivos `demo-server.mjs`, espelhar em `scripts/demo-server.mjs` e atualizar `tests/minibar-backend-flow.test.mjs`:

1. **Paridade SHA-256 Twin-Server e TDZ de Boot**:
   - Mover o bloco de configuração e certificados do Banco Inter para antes de `loadDatabase()`, eliminando o risco de TDZ (`ReferenceError: Cannot access 'DEFAULT_INTER_CONFIG' before initialization`).
   - Sincronizar de forma exata e permanente `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`, garantindo que `(Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash` retorne `True`.
2. **Taxa de 0.99% PIX no Fechamento Financeiro (`GET /api/minibar/settlement`)**:
   - Em `getDefaultMinibarSettings()` adicionar `pixFeePercent: 0.99`.
   - Em `GET /api/minibar/settlement` deduzir `(pixOrdersAmount * pixFeePercent) / 100`.
   - Em `tests/minibar-backend-flow.test.mjs`, atualizar as asserções para validar com precisão matemática a dedução de PIX e o valor líquido exato `netPayableToAnserve`.
3. **RBAC em `POST /api/minibar/inspections`**:
   - Implementar helper `isMinibarStaff(user)` para aceitar `anserve_repositora`, `anserve_gestor`, `admin` e `dev`. Rejeitar anônimos em produção (permitindo bypass controlado em `NODE_ENV === "test"` se `!req.headers["x-enforce-auth"]`).
4. **Resiliência do Webhook Mercado Pago (`POST /api/pms/mercadopago/webhook`)**:
   - Extrair `external_reference` (`MB-*`) e status diretamente do corpo da requisição caso a busca externa síncrona não responda ou em ambiente de teste, liquidando o pedido para `"pago"`.
   - No teste F07 em `tests/minibar-backend-flow.test.mjs`, validar via polling que `dataStatusAfter.status === "pago"`.
5. **Anti-Abuso de Cortesia em `POST /api/minibar/orders`**:
   - Verificar pedidos prévios não cancelados (`o.paymentStatus !== "cancelado"`) para barrar pedidos paralelos simultâneos de cortesias gratuitas.
   - Forçar limite estrito de `quantity: 1` para o kit cortesia gratuito (`prod_cortesia_kit`), convertendo unidades excedentes em avulsas pagas (`prod_nespresso_extra` R$ 5.00).
   - Bloquear criação de cortesias gratuitas em flats sem reserva ativa.
6. **Validação de 4 Dígitos (`POST /api/minibar/flat-context`)**:
   - Retornar HTTP 401 Unauthorized quando os 4 dígitos forem inválidos ou não houver reserva.
   - Ajustar `findActiveOrRecentReservationForFlat` para priorizar a reserva recém-saída (checkout de hoje) sobre reservas futuras distantes.
   - Atualizar asserção no teste `tests/minibar-backend-flow.test.mjs` de 400 para 401.
7. **Heurística de Base64 em Upload de NF (`POST /api/minibar/orders/:id/invoice`)**:
   - Não tratar URLs externas longas (`http://`, `https://`) com mais de 200 caracteres como Base64.
8. **Coerção de Quantidades**:
   - Ignorar itens com `quantity <= 0`. Se nenhum item válido restar, retornar HTTP 400.
9. **Execução Estrita de Testes Pontuais (AGENTS.md)**:
   - Executar EXCLUSIVAMENTE:
     `node --test tests/minibar-backend-flow.test.mjs`
     `node --test tests/minibar-stress-challenger.test.mjs`
     `node --test tests/challenger-m1-2-verification.test.mjs`
   - NUNCA executar `tests/*.test.mjs` ou varreduras globais.
10. **Paridade e Git**:
    - Garantir `Get-FileHash` idêntico byte-a-byte entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.
    - Executar `git commit` e `git push origin main`.
