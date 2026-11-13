# Handoff Report — Requisitos R4 e R6 (Conferência Anserve & Repasse Financeiro)

**Agent ID**: `survey_explorer_3`  
**Parent / Caller**: `92ba65f0-be83-406c-8289-2ffbe5293de2`  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3\`  
**Timestamp**: 2026-11-11T10:40:00Z  
**Type**: Hard (Task Complete)  

---

## 1. Observation (O que foi diretamente observado)

1. **Interface da Repositora (`anserve-restock.tsx`)**:
   - Em `anserve-restock.tsx` (linhas 518–539 e 624–638), o modal "Lançar Consumo" calcula produtos a partir de `products.filter((p) => !p.isCourtesy)`. Itens de cortesia são totalmente filtrados e omitidos da tela de contagem.
   - Em `anserve-restock.tsx` (linhas 553–566 e 1292–1302), o modal "Sem Consumo" possui um checkbox fixo `"Repor Kit de Cortesias de Boas-Vindas"` que injeta itens mockados (`nespresso: 2`, `balas: 4`, `amendoim: 1`) diretamente no array `restockedItems`.
   - Em `anserve-restock.tsx` (linhas 631–637), existe a trava que exige `consumedItemsList.length > 0` (itens pagos com quantidade > 0) para permitir o envio do formulário de lançamento diário.
2. **Backend de Inspeção e Lançamento (`demo-server.mjs`)**:
   - Em `demo-server.mjs` (linhas 78240–78243), o loop de contagem de itens em `app.post("/api/minibar/inspections")` descarta qualquer produto com `prod.isCourtesy === true`:
     ```javascript
     for (const m of effectiveCountedList) {
       const prod = (db.minibarProducts || []).find(p => p.id === m.productId);
       if (!prod || prod.isCourtesy) continue;
     ```
   - Em `demo-server.mjs` (linhas 78183–78200), qualquer item em `restockedItems` marcado como `isCourtesy: true` é computado em `restockedCourtesyTotalCost`.
   - Em `demo-server.mjs` (linhas 78694–78706), o objeto salvo em `db.minibarInspections` grava `restockedCourtesyTotalCost`, mas não possui campos discriminados para o kit de boas-vindas (`waterCups`, `mendoratoPeanuts`).
3. **Catálogo de Produtos (`demo-server.mjs` e `database.json`)**:
   - Em `demo-server.mjs` (linhas 1513–1526), o produto `prod_agua_mineral_copo` possui `price: 5.00`, `cost: 2.00`, `defaultQuantity: 4`, `isCourtesy: false`.
   - No catálogo padrão (linhas 1495–1768), **NÃO EXISTE** o produto `prod_amendoim_mendorato`. Havia apenas `prod_barra_cereal`, `prod_castanha_caju`, `prod_biscoito_salgado`, etc.
4. **Fechamento Financeiro e Repasse à Anserve (`demo-server.mjs`)**:
   - Em `demo-server.mjs` (linhas 79181–79203 em `GET /api/minibar/settlement`), o repasse líquido é calculado como:
     ```javascript
     const netPayableToAnserve = totalOrdersAmount - cardFees - pixFees - commissionCorpFlats + netCourtesyCredit;
     ```
     Onde `netCourtesyCredit` é a soma de `insp.restockedCourtesyTotalCost`.
   - Em `anserve-dashboard.tsx` (linhas 1030–1036 e 1108–1115), a interface exibe `"3. Crédito de Cortesias: + R$ X"` de forma agregada e sem detalhar a origem dos fornecedores.
   - Em `minibar-admin.tsx` (linhas 2233–2243), a aba "extrato" exibe a mesma informação agregada no card `"Repasse Líquido à Anserve"`.
5. **Extrato da Reserva (`demo-server.mjs` — `buildReservationMinibarStatement`)**:
   - Em `demo-server.mjs` (linhas 75723–75731), itens com `isCourtesy: true` já são ignorados na montagem de `pendingLaunchedItems`, o que garante que não gerem saldo a pagar (`pendingBalance`).

---

## 2. Logic Chain (Cadeia Lógica de Raciocínio)

1. **Necessidade do Requisito R4**:
   - O Requisito R4 exige que o checklist da repositora permita registrar individualmente a quantidade exata consumida de cada item do kit (0, 1 ou 2 copos d'água; 0, 1 ou 2 amendoins Mendorato).
   - Como observado em 1.1 e 1.2, atualmente os itens de cortesia são excluídos da contagem de consumo e o modal "Lançar Consumo" bloqueia o envio caso não haja itens pagos.
   - Além disso, o fluxo legado erroneamente colocava a reposição de cortesias a cargo da repositora Anserve (injetando itens em `restockedItems`), violando a diretriz de que a reposição é feita pela camareira no turnover.
   - Logo, para atender a R4, é imperativo:
     a) Adicionar em `anserve-restock.tsx` (em ambos os modais de lançamento e sem consumo) seletores com valores fixos `0, 1, 2` para Copos d'Água e Amendoim Mendorato;
     b) Enviar essa contagem no campo `welcomeKitConsumption: { waterCups, mendoratoPeanuts }`;
     c) Não injetar nenhum item do kit em `restockedItems`, prevenindo ordens ou alertas de reposição para a repositora.
2. **Necessidade do Requisito R6**:
   - O Requisito R6 estabelece que o Amendoim Mendorato é de fornecimento próprio do hotel (R$ 0,00 de repasse à Anserve) e os Copos d'Água são do estoque Anserve (repasse apurado por `volume consumido × custo unitário`).
   - Como observado em 1.3, o Amendoim Mendorato sequer existia formalmente no catálogo de produtos, e o copo d'água possui custo unitário cadastrado de R$ 2,00.
   - Como observado em 1.4, o fechamento financeiro em `GET /api/minibar/settlement` calculava genericamente `restockedCourtesyTotalCost`.
   - Logo, para atender a R6:
     a) O Amendoim Mendorato deve ser inserido no catálogo com `supplierOrigin: "hotel_proprio"`, `price: 0.00`, `cost: 0.00` e tag visual de fornecimento próprio;
     b) O Copo d'Água deve ser marcado com `supplierOrigin: "anserve"` com custo unitário R$ 2,00;
     c) O cálculo de `settlement` deve computar:
        $$\text{Repasse Água Cortesia} = (\text{Total de Copos d'Água Cortesia Consumidos}) \times \text{R\$ 2,00}$$
        Somando este valor ao crédito a pagar à Anserve, enquanto o amendoim gera estritamente R$ 0,00 de débito/crédito;
     d) Este cálculo e totalizador devem ser expostos na aba 1 de `anserve-dashboard.tsx`, na aba "extrato" de `minibar-admin.tsx` e nos relatórios CSV de exportação.

---

## 3. Caveats (Ressalvas e Limitações)

1. **Modo Read-Only**: Este explorer atuou em modo estritamente analítico (leitura). Nenhuma linha de código fonte de produção (`artifacts/` ou `scripts/`) foi modificada.
2. **Regra dos Arquivos Gêmeos**: Quando o agente implementador codificar as alterações em `artifacts/api-server/demo-server.mjs`, ele deve obrigatoriamente copiar/espelhar o arquivo para `scripts/demo-server.mjs` mantendo paridade SHA-256 byte-a-byte.
3. **Escopo dos Itens Pagos de Água**: Se o hóspede consumir mais de 2 copos d'água mineral (acima da cota gratuita de boas-vindas), os copos adicionais (3º, 4º) são tratados como produto pago normal do frigobar (`prod_agua_mineral_copo` a R$ 5,00 cada), gerando ordem de cobrança e receita/custo normal de venda da Anserve.

---

## 4. Conclusion (Conclusão e Diagnóstico Técnico)

A solução está completamente mapeada e é 100% aderente aos Requisitos R4 e R6:
1. **Frontend da Repositora (`anserve-restock.tsx`)**:
   - Criação do bloco visual `"🎁 Kit de Boas-Vindas (Cortesia da Casa)"` com botões seletores `[0, 1, 2]` para Água e `[0, 1, 2]` para Mendorato em ambos os modais (`launchModalFlat` e `semConsumoModalFlat`).
   - Remoção completa de checkboxes e inserções em `restockedItems` para o kit, eliminando alertas de reposição para a repositora.
2. **Backend (`demo-server.mjs` / `scripts/demo-server.mjs`)**:
   - Inclusão do produto `prod_amendoim_mendorato` com `supplierOrigin: "hotel_proprio"` e R$ 0,00 de custo.
   - Atualização de `POST /api/minibar/inspections` para persistir `welcomeKitConsumption`.
   - Atualização de `buildReservationMinibarStatement` para segregar cortesias com R$ 0,00 no extrato sem somar saldo devedor.
   - Atualização de `GET /api/minibar/settlement` e `GET /api/minibar/anserve-reports` para calcular e totalizar o repasse devido à Anserve: $\text{Total Copos Água Cortesia} \times \text{R\$ 2,00}$.
3. **Painéis de Gestão (`anserve-dashboard.tsx` e `minibar-admin.tsx`)**:
   - Exibição do demonstrativo de repasse com segregação transparente do que é reembolso de água Anserve e o que é insumo próprio do hotel.

---

## 5. Verification Method (Método de Verificação Independente)

Para validar a implementação de forma segura e sem violar as regras de teste do projeto:

1. **Verificação de Paridade Twin-Server**:
   ```powershell
   node scripts/check-twin-parity.mjs
   ```
2. **Teste Unitário Pontual de Backend (Estritamente o teste de minibar)**:
   ```powershell
   node --test tests/minibar-backend-flow.test.mjs
   ```
   *(Nota: Proibido rodar testes globais `tests/*.test.mjs` ou suítes de outros módulos).*
3. **Verificação Visual e de Rede nos Endpoints**:
   - Abrir `/frigobar-reposicao` (com PIN 1234), abrir o modal de um flat e conferir os seletores 0, 1 e 2.
   - Submeter uma passagem com 1 copo d'água e 2 amendoins e verificar no payload HTTP se foi enviado `welcomeKitConsumption: { waterCups: 1, mendoratoPeanuts: 2 }` e `restockedItems` sem cortesias.
   - Consultar `GET /api/minibar/settlement` e verificar a presença do campo `courtesyBreakdown` totalizando os copos consumidos × R$ 2,00 e amendoins a R$ 0,00.
