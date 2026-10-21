# Handoff Report — Worker M4: Features F29 a F33 (Milestone M4)

**Agent**: `worker_m4`
**Recipient**: `d10c20e2-adfb-4695-835e-52dd3bebe9a9` (Project Orchestrator)
**Timestamp**: `2026-10-21T23:00:00Z`
**Status**: Concluído com Sucesso (Build OK, Paridade SHA-256 OK, 46/46 Testes Pontuais PASS)

---

## 1. Observation
1. **F29 (CRM Consumo 360º & LTV Agregado)**:
   - `artifacts/api-server/demo-server.mjs` (`GET /api/pms/guests`): busca pedidos pagos em `db.minibarOrders` vinculados ao documento, telefone ou códigos de reserva do hóspede. Soma `minibarSpent` ao `totalSpent` (LTV agregado). Computa tags automáticas: `"Consumidor Nespresso"` (>=3 cápsulas), `"Apreciador Cerveja"` (>=2 cervejas), `"Prefere Snacks"` (>=3 snacks), `"Consumo Alto"` (`minibarSpent >= 100` ou >=8 itens). Retorna `minibarSpent` e `minibarOrdersCount`.
   - `artifacts/api-server/demo-server.mjs` (`GET /api/pms/guests/:id`): retorna `minibarOrders` completo e `minibarSpent`, integrando o histórico na ficha 360º.
   - `artifacts/limpeza/src/pages/crm-guests.tsx`:
     - Modal 360º (`handleOpenDetail`): adicionada a seção "Histórico de Consumo de Frigobar" imediatamente após "Histórico de Estadias & Reservas" e antes de "Notas Fiscais Emitidas", com listagem de pedidos, badges de status (`pago`, `pendente`, `cortesia`), flat, data, total em R$ e itens.
     - Tabela principal: coluna de LTV exibe subtotal `Frigobar: R$ X.XX` quando `g.minibarSpent > 0`.
     - Tags: estilização visual com badges coloridas para as 4 tags de hábitos de frigobar.
     - Filtros: chips de filtro adicionados para `"nespresso"`, `"cerveja"`, `"snacks"` e `"alto_consumo"`.

2. **F30 (Analytics Demográfico de Consumo)**:
   - `artifacts/api-server/demo-server.mjs` (`GET /api/minibar/analytics/demographics`): cruza pedidos pagos com dados de cidade/UF usando cascata resiliente Hóspede -> Reserva (`guestState`) -> FNHR (`guests[0].state`) -> DDD do telefone (`inferStateFromPhone`) -> `"Outros"`. Retorna `summary`, `byState` (ranking de estados, topCity e faturamento por categoria) e `byCategory` (faturamento, unidades e percentual).
   - `artifacts/limpeza/src/pages/crm-guests.tsx`: 3ª aba de navegação `"guests" | "companies" | "analytics"`. Na aba "Analytics Demográfico & Frigobar", renderiza cards de KPIs (Faturamento Frigobar, Ticket Médio, Estado Líder, Categoria Top), cards de desempenho das 5 categorias com barra de progresso, e tabela com Matriz Demográfica Cruzada (Estado x Categorias) com rodapé de totais consolidados.

3. **F31 (Remoção de Textos Legados & Atualização de FAQ)**:
   - `artifacts/api-server/whatsapp-ai-service.mjs`: atualizado `DEFAULT_AI_CONFIG.knowledgeBase.amenities`, `minibarInfo`, `distillGuidelineFromOperatorResponse`, e `generateIntelligentFaqDraft` removendo menções legadas de "frigobar vazio / comprar no supermercado" e registrando o modelo Anserve (1 kit cortesia por estadia + bebidas/snacks por autoatendimento PIX/Cartão).
   - `artifacts/api-server/demo-server.mjs`: seed `faq-agua-frigobar` atualizado preservando o ID para compatibilidade com a suíte de testes existente.

4. **F32 (Sofia IA: Contexto e Módulo de Minibar)**:
   - `artifacts/api-server/whatsapp-ai-service.mjs`:
     - `buildGuestContext`: injeta `minibarUrl` e catálogo/regras de cortesia.
     - `contextString`: injeta Base de Conhecimento Oficial de Frigobar Anserve e link direto do flat.
     - `querySystemData`: implementado `case "minibar": case "frigobar":` retornando catálogo, link e status.
     - `buildGeminiTools`: adicionado módulo `"minibar"` nas ferramentas disponíveis da IA.
     - `generateHeuristicResponse`: adicionada regra 7.8b de atendimento heurístico de frigobar.

5. **F33 (Cobrança Proativa de Divergências & Quitação Direta)**:
   - `artifacts/api-server/demo-server.mjs` (`POST /api/minibar/orders`): aceita `orderId` no payload (ex: `ORD-MB-DIV-...`) liquidando in-place o registro em `db.minibarOrders` com o método de pagamento selecionado (PIX Inter ou Cartão Mercado Pago) sem duplicar ordens.
   - `artifacts/api-server/demo-server.mjs` (`POST /api/minibar/inspections`): gera URL de Sofia dinâmica com `SERVER_BASE_URL`.
   - `artifacts/limpeza/src/pages/guest-minibar.tsx`: lê o parâmetro `?ord=` de `window.location.search`, consulta o status e, quando pendente, exibe card destacado com alerta da vistoria de checkout, detalhamento dos itens e botões para quitação direta ("Quitar via PIX" e "Quitar com Cartão"). Se já quitada, exibe banner verde de quitação confirmada.

6. **Paridade SHA-256 e Build de Produção**:
   - `artifacts/api-server/demo-server.mjs` == `scripts/demo-server.mjs` (True).
   - `artifacts/api-server/whatsapp-ai-service.mjs` == `scripts/whatsapp-ai-service.mjs` (True).
   - `npm --prefix artifacts/limpeza run build`: código 0, gerando bundle em `artifacts/limpeza/dist/`.

7. **Testes Pontuais Executados**:
   - `node --test tests/minibar-backend-flow.test.mjs`: 20/20 PASS.
   - `node --test tests/challenger-m1-2-verification.test.mjs`: 13/13 PASS.
   - `node --test tests/minibar-stress-challenger.test.mjs`: 13/13 PASS.
   - Total: 46/46 PASS (100% de sucesso).

---

## 2. Logic Chain
1. A agregação de `minibarSpent` ao LTV (`totalSpent`) em `demo-server.mjs` permite que o CRM reflita a receita total por hóspede, cumprindo F29 sem alterar o `totalAmount` das diárias das reservas.
2. A geração de tags por itens consumidos (`Consumidor Nespresso`, `Apreciador Cerveja`, `Prefere Snacks`, `Consumo Alto`) alimenta os chips de filtro e a visualização rápida de hábitos do cliente em `crm-guests.tsx`.
3. O endpoint `GET /api/minibar/analytics/demographics` agrupa as vendas por UF e por categoria de produto. Ao consumir esse endpoint na 3ª aba de `crm-guests.tsx`, a equipe tem visibilidade imediata das regiões de maior consumo e preferências dos hóspedes.
4. Ao atualizar os textos em `whatsapp-ai-service.mjs` e `demo-server.mjs`, a IA Sofia responde com precisão sobre o ecossistema Anserve, evitando orientações incorretas e direcionando o hóspede para o autoatendimento.
5. Ao suportar `orderId` em `POST /api/minibar/orders` e tratar `?ord=` em `guest-minibar.tsx`, ordens de divergência apuradas na vistoria são liquidadas diretamente pelo hóspede via link recebido por WhatsApp, com conciliação automática.

---

## 3. Caveats
- No teste `minibar-backend-flow.test.mjs`, o processo de servidor roda na porta 4199. Certificou-se de que a porta foi liberada e finalizada adequadamente ao término do teste.
- O build de produção Vite gerou novos hashes para os assets compilados em `artifacts/limpeza/dist/public/assets/`, substituindo os bundles anteriores; todos foram devidamente incluídos para commit e push.

---

## 4. Conclusion
Todas as 5 Features do Milestone M4 (F29, F30, F31, F32 e F33) estão plenamente implementadas, integradas e verificadas. A paridade SHA-256 entre `artifacts/api-server/` e `scripts/` está estritamente em 100%, o build de produção Vite foi concluído com sucesso (código 0) e toda a suíte de 46 testes pontuais do módulo foi aprovada sem falhas.

---

## 5. Verification Method
Para verificação independente pelo auditor:
1. **Verificação de Paridade SHA-256**:
   ```powershell
   (Get-FileHash 'artifacts/api-server/demo-server.mjs').Hash -eq (Get-FileHash 'scripts/demo-server.mjs').Hash
   (Get-FileHash 'artifacts/api-server/whatsapp-ai-service.mjs').Hash -eq (Get-FileHash 'scripts/whatsapp-ai-service.mjs').Hash
   ```
2. **Build de Produção**:
   ```bash
   npm --prefix artifacts/limpeza run build
   ```
3. **Execução de Testes Pontuais Autorizados**:
   ```bash
   node --test tests/minibar-backend-flow.test.mjs
   node --test tests/challenger-m1-2-verification.test.mjs
   node --test tests/minibar-stress-challenger.test.mjs
   ```
