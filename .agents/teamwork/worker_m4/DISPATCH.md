# DISPATCH — Worker M4 (CRM 360º, Analytics Demográfico & Sofia IA)

## Metadata
- **Agent Name**: `worker_m4`
- **Archetype**: `teamwork_preview_worker`
- **Role**: CRM, Analytics & Sofia IA Worker
- **Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4`
- **Parent Conversation ID**: `d10c20e2-adfb-4695-835e-52dd3bebe9a9`
- **Assigned Milestone**: Milestone M4 (Features F29 a F33)

---

## Mandatory Integrity Warning
> **DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.**

---

## Scoped Files for Worker M4
- `artifacts/limpeza/src/pages/crm-guests.tsx` (F29, F30)
- `artifacts/limpeza/src/pages/guest-minibar.tsx` (F33 - suporte a `?ord=`)
- `artifacts/api-server/demo-server.mjs` (F29, F30, F31, F33)
- `scripts/demo-server.mjs` (twin parity)
- `artifacts/api-server/whatsapp-ai-service.mjs` (F31, F32)
- `scripts/whatsapp-ai-service.mjs` (twin parity)
- `artifacts/limpeza/dist/` (build de produção)

---

## Objectives & Detailed Tasks

### 1. CRM 360º & LTV Agregado (`crm-guests.tsx` & `demo-server.mjs` — F29)
1. **Backend (`demo-server.mjs` e `scripts/demo-server.mjs`)**:
   - Em `GET /api/pms/guests`:
     - Para cada hóspede, calcular `minibarOrders` pagos (`db.minibarOrders` com `guestDocument` ou `guestPhone` ou `reservationCode` correspondente e `paymentStatus === "pago"`).
     - Calcular `minibarSpent` e somar ao `totalSpent` (LTV agregado: diárias + frigobar pago).
     - Gerar tags automáticas baseadas em itens pagos:
       * >= 3 cápsulas Nespresso -> tag `"Consumidor Nespresso"`
       * >= 2 cervejas -> tag `"Apreciador Cerveja"`
       * >= 3 snacks/amendoins -> tag `"Prefere Snacks"`
       * `minibarSpent >= 100` ou >= 8 itens -> tag `"Consumo Alto"`
     - Retornar `minibarSpent` e `minibarOrdersCount` no objeto do hóspede.
   - Em `GET /api/pms/guests/:id`:
     - Incluir `minibarOrders` e `minibarSpent` no payload de resposta do hóspede.
2. **Frontend (`crm-guests.tsx`)**:
   - No modal 360º de detalhes do hóspede (`handleOpenDetail`):
     - Inserir seção "Histórico de Consumo de Frigobar" (imediatamente após "Histórico de Estadias & Reservas" e antes de "Notas Fiscais Emitidas").
     - Exibir cada pedido com data formatada, flat, número do pedido, badge de status (`pago` em verde, `pendente` em âmbar, `cortesia` em azul), lista de itens e total em R$.
   - Adicionar chips de filtro para as novas tags de consumo frigobar (`"nespresso"`, `"cerveja"`, `"snacks"`, `"alto_consumo"`).
   - Garantir que o LTV exibido no card superior e na tabela reflita o `totalSpent` consolidado.

### 2. Analytics Demográfico de Consumo (`crm-guests.tsx` & `demo-server.mjs` — F30)
1. **Backend**:
   - Criar endpoint `GET /api/minibar/analytics/demographics`:
     - Cruza pedidos pagos de frigobar com o cadastro/FNHR do hóspede (`city`, `state` de `db.guests` ou `r.guests[0]`).
     - Agrupa métricas:
       * `byState`: ranking de Estados por faturamento de frigobar e itens consumidos.
       * `byCategory`: faturamento e unidades vendidas por categoria ("Cervejas", "Refrigerantes", "Águas", "Snacks", "Cafés / Especiais").
       * `summary`: total faturado, total itens, ticket médio e estado líder.
2. **Frontend (`crm-guests.tsx`)**:
   - Adicionar uma 3ª aba no topo de `crm-guests.tsx`: `"guests" | "companies" | "analytics"`.
   - Na aba "Analytics Demográfico":
     - Exibir cards de KPIs (Total Frigobar, Ticket Médio, Estado Líder, Categoria Líder).
     - Exibir distribuição visual por Estados e tabela/matriz cruzando Estado vs Categorias de consumo.

### 3. Remoção de Textos Legados & Atualização de FAQ (`whatsapp-ai-service.mjs` & `demo-server.mjs` — F31)
1. Em `artifacts/api-server/whatsapp-ai-service.mjs`:
   - Remover qualquer menção de "frigobar vazio" ou "hóspede deve comprar no supermercado".
   - Atualizar para: "Os flats do Soho Residence contam com frigobar abastecido em parceria com a Anserve. O hóspede tem 1 kit de cortesia por estadia (cápsulas Nespresso e doces) e pode consumir bebidas e snacks com autoatendimento e pagamento via PIX ou Cartão."
2. Em `artifacts/api-server/demo-server.mjs`:
   - Atualizar o seed `faq-agua-frigobar` (preservando o ID `faq-agua-frigobar` para compatibilidade com testes existentes) informando o catálogo Anserve e autoatendimento.

### 4. Sofia IA: Contexto e Módulo de Minibar (`whatsapp-ai-service.mjs` — F32)
1. Em `buildGuestContext`:
   - Injetar `minibarUrl: `${appOrigin}/minha-reserva/${canonicalResCode}/frigobar`` e resumo do catálogo/cortesias.
2. Em `querySystemData`:
   - Adicionar `case "minibar": case "frigobar":`:
     - Retornar catálogo disponível, regras de cortesia, link direto e status de pedidos do hóspede.
3. Em `buildGeminiTools`:
   - Permitir `minibar` nos módulos aceitos pelo tool system.

### 5. Cobrança Proativa de Divergências & Quitação Direta (F33)
1. Em `artifacts/limpeza/src/pages/guest-minibar.tsx`:
   - Ler o parâmetro `?ord=` de `window.location.search`.
   - Se presente, consultar o status da ordem `GET /api/minibar/orders/:id/status`. Se pendente, exibir banner/alerta em destaque no topo com os itens não declarados e botão direto para pagar via PIX ou Cartão.
2. Em `artifacts/api-server/demo-server.mjs`:
   - No endpoint `POST /api/minibar/orders`: se `orderId` vier no body (ex: `ORD-MB-DIV-...`), atualizar a ordem existente com o método de pagamento escolhido e gerar o payload PIX/MP, evitando duplicar registros.

### 6. Paridade SHA-256 Twin-Server & Build de Produção
1. Espelhar `artifacts/api-server/demo-server.mjs` para `scripts/demo-server.mjs`.
2. Espelhar `artifacts/api-server/whatsapp-ai-service.mjs` para `scripts/whatsapp-ai-service.mjs`.
3. Validar SHA-256 byte-a-byte idêntico em ambos os pares:
   `(Get-FileHash artifacts/api-server/demo-server.mjs).Hash -eq (Get-FileHash scripts/demo-server.mjs).Hash`
   `(Get-FileHash artifacts/api-server/whatsapp-ai-service.mjs).Hash -eq (Get-FileHash scripts/whatsapp-ai-service.mjs).Hash`
4. Executar `npm --prefix artifacts/limpeza run build` (código de saída 0 obrigatório).
5. Executar os testes pontuais:
   - `node --test tests/minibar-backend-flow.test.mjs`
   - `node --test tests/challenger-m1-2-verification.test.mjs`
   - `node --test tests/minibar-stress-challenger.test.mjs`
6. Executar `git add`, `git commit` e `git push origin main`.

Documente em `changes.md` e `handoff.md` e notifique o Project Orchestrator via `send_message`.


## 2026-10-21T22:19:43Z
Você é o subagente worker_m4 (teamwork_preview_worker).
Seu diretório de trabalho exclusivo é:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4

Missão do Worker M4 (CRM 360, Analytics Demográfico & Sofia IA — Features F29 a F33):
1. CRM 360 & LTV Agregado (crm-guests.tsx & demo-server.mjs — F29)
2. Analytics Demográfico de Consumo (crm-guests.tsx & demo-server.mjs — F30)
3. Remoção de Textos Legados & FAQ (whatsapp-ai-service.mjs & demo-server.mjs — F31)
4. Sofia IA: Contexto e Módulo de Minibar (whatsapp-ai-service.mjs — F32)
5. Cobrança Proativa de Divergências & Quitação (guest-minibar.tsx & demo-server.mjs — F33)
6. Paridade SHA-256 Twin-Server & Build de Produção


## 2026-10-21T22:56:07Z
**Context**: Verificação de execução dos testes pontuais e finalização de M4.
**Content**: A tarefa task-405 do teste `minibar-backend-flow.test.mjs` finalizou com erro de porta ('Falha ao iniciar servidor de testes na porta 4199'). Verifique se há algum processo node remanescente prendendo a porta 4199, execute os testes pontuais autorizados, realize o commit e git push para origin main, e envie seu relatório de handoff.
**Action**: Concluir execução de testes, git push e enviar handoff report.
