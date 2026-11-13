# Relatório de Handoff — survey_explorer_2
**Data:** 11/11/2026  
**Missão:** Investigação Técnica dos Requisitos R3 & R5 (Cardápio Digital do Frigobar com Kit de Boas-Vindas e Segregação de Extrato com Valor Zerado).  
**Diretório do Agente:** `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\`  
**Destinatário (Caller ID):** `92ba65f0-be83-406c-8289-2ffbe5293de2`  

---

## 1. Observation (Observações Diretas com Evidências de Código)

### 1.1 Arquitetura e Renderização do Cardápio do Frigobar do Hóspede
- **Arquivo**: `artifacts/limpeza/src/pages/guest-minibar.tsx`
- **Rotas Mapeadas (Linhas 176–201)**:
  - `/frigobar/flat/:flatNumber` e `/frigobar/:flatNumber` (acesso por QR Code fixo no quarto).
  - `/minha-reserva/:code/frigobar` (acesso pelo link de autosserviço da reserva).
- **Consumo de Contexto (Linhas 734, 755)**:
  - Executa `GET /api/minibar/reservation-context/:code` ou `POST /api/minibar/flat-context`.
  - Hidrata o catálogo em `catalog: MinibarProduct[]` (linha 449) e os lançamentos em `dailyLaunches: DailyLaunchGroup[]` (linha 354).
- **Estrutura Visual do Cardápio (Linhas 2039–2215)**:
  - Seção 5: `<Card id="minibar-catalog-section">` recolhido por padrão com controle `showReferenceCatalog` (linhas 2043, 2065–2071).
  - Categorias de filtro atuais (linhas 2077–2083):
    - `✨ Todos`
    - `💧 Bebidas`
    - `🍫 Petiscos & Snacks`
    - `🍺 Cervejas & Alcoólicos`
    - `☕ Cafés & Cortesias`
  - Filtro atual para cortesias (linhas 2108–2110):
    ```typescript
    if (menuCategoryFilter === "cortesias") {
      return Boolean(prod.isCourtesy) || cat.includes("cafe") || name.includes("cápsula") || name.includes("capsula");
    }
    ```
  - Renderização dos cards de produto (linhas 2150–2211):
    ```typescript
    const isCourtesyItem = Boolean(prod.isCourtesy);
    const isCourtesyFree = Boolean(prod.isCourtesy && !courtesyConsumed);
    ```
    Exibe badge "Cortesia" e preço substituído por texto "Cortesia" se `isCourtesyFree`, mas fica misturado no catálogo geral, sem destaque no topo e sem discriminação clara do Kit de Boas-Vindas.

### 1.2 Extrato de Consumo e Subtotais em `guest-minibar.tsx`
- **Linhas 1448–1456**: Resumo geral no topo exibe `totalLaunchedAmount` em destaque font-black `cyan-400`.
- **Linhas 1553–1608**: Extrato por dia (`dailyLaunches.map(group => ...)`):
  - Subtotal do dia: `formatBRL(group.totalDayAmount)` (linha 1563).
  - Cada item exibe `quantity`x `productName`, preço unitário ou `"Gratuito (Cortesia)"` (linha 1595), e à direita `item.isCourtesy ? "Cortesia" : formatBRL(item.totalPrice)` (linha 1607).
  - **Limitação Observada**: Cortesias consumidas ficam misturadas na mesma lista de produtos pagos do dia, sem um bloco segregado e destacado conforme preconizado no Requisito R5.

### 1.3 Extrato no Portal do Hóspede (`guest-portal.tsx`)
- **Arquivo**: `artifacts/limpeza/src/pages/guest-portal.tsx`
- **Linhas 4409–4501**: Card *"Cardápio & Extrato do Frigobar"*:
  - Renderiza `data.minibarOrders`: exibe pedidos pagos e pendentes, discriminando itens (`it.quantity`x `it.productName`), total em R$, badges de status e link para baixar NFS-e anexada.
  - Botão *"Abrir Frigobar (Flat X)"* direciona para `/minha-reserva/:code/frigobar`.

### 1.4 Extrato no Modal de Detalhes da Reserva do PMS (`pms-calendar.tsx`)
- **Arquivo**: `artifacts/limpeza/src/pages/pms-calendar.tsx`
- **Linhas 10879–11010**: Seção *"Frigobar & Notas Fiscais da Reserva"*:
  - Exibe botões para copiar link do frigobar ou abrir `/minha-reserva/:code/frigobar`.
  - Itera sobre `visibleOrders` (pedidos não cancelados), exibindo nome do hóspede, badge de status (`✓ Pago • R$ X,XX` ou `Pendente`), itens consumidos e botão de download da Nota Fiscal.
- **Linhas 11760–11772**: Configuração de faturamento de boletos:
  - Destaca explicitamente: *"📌 Na NFS-e entra sempre apenas Hospedagem (Consumo é emitido pela Anserve)"*. O consumo não se confunde com diárias de hospedagem.

### 1.5 Cálculo do Extrato no Backend (`demo-server.mjs`)
- **Arquivo**: `artifacts/api-server/demo-server.mjs`
- **Linhas 75408–75668 (`buildReservationMinibarStatement`)**:
  - `totalLaunchedAmount` soma `ordTotal` (linha 75503).
  - `pendingBalance` soma `ordRem` (linha 75504).
  - Linhas 75554–75562:
    ```javascript
    dayEntry.items.push(enrichedItem);
    if (!enrichedItem.isCourtesy && remQty > 0 && ordRem > 0.01) {
      pendingLaunchedItems.push(enrichedItem);
    }
    ```
    *Observação Crítica*: Itens onde `enrichedItem.isCourtesy === true` já são excluídos de `pendingLaunchedItems`, o que impede a cobrança no checkout do hóspede. Contudo, se a ordem de lançamento tiver `unitPrice > 0`, `ordTotal` adicionaria valor a `totalLaunchedAmount`. Por isso, os itens de cortesia devem possuir `unitPrice: 0` e `totalPrice: 0` de ponta a ponta.

---

## 2. Logic Chain (Cadeia de Raciocínio Passo a Passo)

1. **Da Observação 1.1 para o Posicionamento do Requisito R3**:
   - A página `/frigobar/:flatNumber` é acessada pelo hóspede logo após a entrada no quarto.
   - O Kit de Boas-Vindas deve acolher o hóspede imediatamente. Colocá-lo apenas dentro da Seção 5 recolhida prejudicaria a descoberta.
   - Portanto, o Kit de Boas-Vindas deve figurar:
     - No **topo do Cardápio Digital** (Seção 5), em container destacado antes dos filtros de produtos pagos; e
     - Como **card informativo de boas-vindas** no topo do extrato, informando os 2 copos d'água e 2 amendoins Mendorato disponíveis gratuitamente na chegada.

2. **Da Observação 1.1 e 1.5 para a Impossibilidade de Cobrança (R3)**:
   - No modo `restocker_daily_launch`, o cardápio é estritamente consultivo (sem botão de checkout ou carrinho para produtos).
   - Ao definir os itens do kit com `isCourtesy: true`, `price: 0.00` e cota máxima de 2 unidades, o hóspede visualiza claramente `R$ 0,00` e nenhuma ordem financeira pode ser gerada a partir do cardápio.

3. **Das Observações 1.2, 1.3, 1.4 e 1.5 para o Extrato Segregado (R5)**:
   - A conferência da repositora registrará as unidades consumidas (0 a 2 copos d'água; 0 a 2 amendoins).
   - Se o hóspede consumiu 0 unidades, o item não é incluído no extrato.
   - Se consumiu 1 ou 2 unidades, esses itens são consolidados no backend em `statement.consumedCourtesyItems` com `quantity`, `unitPrice: 0` e `totalPrice: 0`.
   - Nas três interfaces (`guest-minibar.tsx`, `guest-portal.tsx` e `pms-calendar.tsx`), esses itens são renderizados em um **bloco próprio verde esmeralda** intitulado *"Kit de Boas-Vindas Consumido (Cortesia da Casa)"*, totalmente separado dos pedidos pagos.

4. **Da Observação 1.5 para a Imunidade do Saldo da Reserva (R5)**:
   - Como `unitPrice = 0.00` e `totalPrice = 0.00`, a multiplicação `quantity * 0` é identicamente `0.00`.
   - Os campos `totalLaunchedAmount`, `pendingBalance`, `splitBreakdown.shares` e `reservation.totalAmount` permanecem inalterados, garantindo que o hóspede nunca seja cobrado pelas cortesias.

---

## 3. Caveats (Ressalvas e Casos de Borda)

1. **Reposição Exclusiva na Virada de Hóspede**:
   - O consumo do Kit de Boas-Vindas pela repositora durante a estadia não deve solicitar reposição para a repositora (reponsabilidade da governança/camareiras no check-in do próximo hóspede).
2. **Consumo Acima da Cota de Cortesia**:
   - Se houver consumo de copos d'água além dos 2 copos de cortesia do kit, as unidades excedentes devem ser lançadas como o produto pago `prod_agua_mineral_copo` ao valor regular de R$ 5,00.
3. **Paridade Twin-Server**:
   - Toda alteração nos arquivos de backend (`demo-server.mjs`) deve ser realizada em `artifacts/api-server/` e espelhada para `scripts/` para manter SHA-256 idêntico.
4. **Isolamento de Testes**:
   - Não executar varreduras globais com `tests/*.test.mjs`. Rodar apenas testes pontuais da funcionalidade de frigobar quando implementada.

---

## 4. Conclusion (Conclusão Arquitetural)

1. **Requisito R3 totalmente delineado**:
   - Inserção do bloco *"Kit de Boas-Vindas (Cortesia da Casa)"* no topo do cardápio digital do hóspede (`guest-minibar.tsx`).
   - Conteúdo: até 2 copos d'água mineral 200ml e até 2 amendoins Mendorato 27g.
   - Badges visuais: *"100% Gratuito"*, *"Cortesia da Casa"*, *"R$ 0,00"*.
   - Segregação estética nítida (container esmeralda vs catálogo pago em ardósia/ciano).
   - Impossibilidade de cobrança (itens sem ação de compra e valor R$ 0,00).

2. **Requisito R5 totalmente delineado**:
   - No extrato da reserva (visão do hóspede em `guest-minibar.tsx` e `guest-portal.tsx`, e visão PMS em `pms-calendar.tsx`), apenas as unidades efetivamente consumidas (1 ou 2) aparecem discriminadas. Se 0, não aparecem.
   - Apresentação em bloco destacado próprio com valor exibido de R$ 0,00.
   - Total a pagar da reserva e saldo devedor matematicamente imunes.

---

## 5. Verification Method (Método de Verificação Independente)

Os implementadores podem validar de forma independente os requisitos R3 e R5 com o seguinte procedimento:

1. **Verificação Visual do Cardápio (`guest-minibar.tsx`)**:
   - Iniciar o servidor de desenvolvimento (`npm run dev`).
   - Acessar no navegador: `http://localhost:5000/frigobar/509` ou `http://localhost:5000/minha-reserva/RES-TESTE/frigobar`.
   - Clicar em *"Ver Cardápio"*:
     - **Critério 1**: O bloco *"Kit de Boas-Vindas (Cortesia da Casa)"* aparece destacado no topo com borda esmeralda, ícone de presente e badges de gratuidade.
     - **Critério 2**: Contém Copo d'Água Mineral (até 2 un.) e Amendoim Mendorato (até 2 un.) com valor de R$ 0,00.
     - **Critério 3**: Não existem botões para adicionar cobrança aos itens de cortesia.

2. **Verificação do Extrato com Cortesias Consumidas (R5)**:
   - Simular lançamento de inspeção via curl contendo 1 copo d'água e 2 amendoins consumidos:
     ```powershell
     Invoke-RestMethod -Uri "http://localhost:5000/api/minibar/inspections" -Method POST -ContentType "application/json" -Body '{"flatNumber":"509","status":"lancamento_diario","isDailyLaunch":true,"consumedCourtesyItems":[{"productId":"prod_cortesia_agua_copo","quantity":1},{"productId":"prod_cortesia_amendoim_mendorato","quantity":2}]}'
     ```
   - Abrir `http://localhost:5000/frigobar/509`:
     - **Critério 1**: O bloco de cortesias consumidas aparece acima do extrato diário exibindo exatamente `1x Copo d'Água Mineral` e `2x Amendoim Mendorato` com valor `R$ 0,00`.
     - **Critério 2**: O total consumido e o saldo a pagar permanecem em `R$ 0,00`.
   - Abrir o modal da reserva no PMS (`/reservas`):
     - **Critério 3**: O bloco segregado de cortesias do Kit de Boas-Vindas aparece destacado com valor R$ 0,00.
