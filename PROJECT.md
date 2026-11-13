# Project: Padronização Visual do Frigobar, Kit de Boas-Vindas & Repasse Anserve

## Architecture
- **Catálogo de Produtos & Marcas Reais (`artifacts/api-server/demo-server.mjs` & `artifacts/limpeza/public/images/frigobar/`)**:
  - Definição do catálogo em `getDefaultMinibarProducts()` e integridade em `db.minibarProducts`.
  - Inclusão dos itens de cortesia do Kit de Boas-Vindas (`prod_cortesia_amendoim_mendorato` e `prod_cortesia_agua_copo` / `prod_agua_mineral_copo`).
  - Atualização dos guards de tamanho (`length !== 18` atualizado para acomodar cortesias sem auto-reset).
  - Padronização de imagens: 1024x1024 px PNG, proporção 1:1, fundo branco puro `#FFFFFF`, iluminação de estúdio 5500K, ângulo frontal 10°-15°, sombra de contato suave.
- **Painel de Homologação e Galeria de Fotos (`artifacts/limpeza/src/pages/minibar-admin.tsx`)**:
  - Nova sub-visão `galeria_marcas` na aba `catalogo` (ou modal dedicado de homologação).
  - Exibição lado a lado de foto proposta vs foto legada, nome do produto e marca comercial mapeada (Coca-Cola, Kinder Bueno, Toddynho, Heineken, Pringles, etc.).
  - Ações de homologação individual e em lote para validação prévia do usuário.
- **Cardápio Digital do Hóspede (`artifacts/limpeza/src/pages/guest-minibar.tsx`)**:
  - Seção em destaque no topo: "Kit de Boas-Vindas (Cortesia da Casa)" com borda e badges verde esmeralda ("100% Gratuito" / "Cortesia da Casa").
  - Exibição de até 2 copos d'água mineral 200ml e até 2 amendoins Mendorato 27g com valor R$ 0,00, segregados dos produtos pagos e sem botões de cobrança.
- **Conferência da Repositora Anserve (`artifacts/limpeza/src/pages/anserve-restock.tsx`)**:
  - Bloco de conferência dedicado do Kit de Boas-Vindas nos modais "Lançar Consumo" e "Sem Consumo".
  - Contadores independentes `[0, 1, 2]` para copos d'água e `[0, 1, 2]` para amendoins Mendorato.
  - Envio desacoplado em `welcomeKitConsumption: { waterCups, mendoratoPeanuts }` sem injetar itens em `restockedItems` (sem ordens/alertas de reposição para a repositora).
- **Extrato Segregado e Imunidade de Saldo (`demo-server.mjs`, `guest-minibar.tsx`, `guest-portal.tsx`, `pms-calendar.tsx`)**:
  - Rotina `buildReservationMinibarStatement()` agrupa e expõe `consumedCourtesyItems`.
  - Exibição apenas dos itens consumidos (se 0 não exibe, se 1 ou 2 exibe) em bloco destacado verde esmeralda com R$ 0,00.
  - Saldo devedor e total da reserva (`totalLaunchedAmount`, `pendingBalance`, `reservation.totalAmount`) matematicamente imunes (sempre R$ 0,00 de acréscimo).
- **Apuração Financeira e Repasse Anserve (`demo-server.mjs`, `anserve-dashboard.tsx`, `minibar-admin.tsx`)**:
  - Distinção de fornecimento: Amendoim Mendorato = `hotel_proprio` (R$ 0,00 de repasse); Copos d'Água = `anserve` (custo unitário de R$ 2,00).
  - Cálculo de repasse devido pelo hotel à Anserve: $\text{Total Copos d'Água Cortesia} \times \text{R\$ 2,00}$.
  - Demonstrativo transparente na aba 1 de `anserve-dashboard.tsx` e aba extrato de `minibar-admin.tsx`.
- **Twin-Server Parity**: Todo arquivo `.mjs` alterado em `artifacts/api-server/` deve ser espelhado em `scripts/` mantendo 100% de paridade SHA-256.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1_REAL_BRAND_PHOTOS | Substituição das fotos por marcas reais comerciais com fundo branco puro #FFFFFF e padrão uniforme | M1 | R1, Survey 1 |
| 2 | F2_PREVIEW_APPROVAL_GALLERY | Galeria/painel de validação prévia das fotos com nomes de produtos e marcas lado a lado no minibar-admin | M1 | R2, Survey 1 |
| 3 | F3_WELCOME_KIT_MENU | Seção "Kit de Boas-Vindas (Cortesia da Casa)" no topo do cardápio do hóspede com R$ 0,00 e selo visual | M2 | R3, Survey 2 |
| 4 | F4_REPOSITA_CONFERENCE_CHECKLIST | Checklist da repositora para registro de 0 a 2 copos e 0 a 2 amendoins sem gerar ordem de reposição | M2 | R4, Survey 3 |
| 5 | F5_ZERO_CHARGE_STATEMENT_SEGREGATION | Segregação discriminada no extrato do hóspede e PMS com valor R$ 0,00 sem afetar o total da reserva | M2 | R5, Survey 2 |
| 6 | F6_ANSERVE_FINANCIAL_RECONCILIATION | Distinção de insumos e apuração de repasse de custo dos copos d'água (vol * R$ 2,00) à Anserve | M3 | R6, Survey 3 |
| 7 | F7_INTEGRATION_VERIFICATION_PUSH | Testes pontuais, paridade twin-server, build de produção e git push | M4 | Critérios de Aceite |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Padronização Visual & Galeria de Homologação de Fotos | F1, F2 | none | DONE |
| M2 | Kit de Boas-Vindas, Conferência Repositora & Extrato Zerado | F3, F4, F5 | M1 | DONE |
| M3 | Fechamento Financeiro & Repasse de Custos Anserve | F6 | M2 | DONE |
| M4 | Testes Pontuais, Paridade Twin, Build & Git Push | F7 | M1, M2, M3 | DONE |

## Interface Contracts

### M1: Galeria de Homologação (`minibar-admin.tsx`)
- Sub-visão: `catalogSubView === "galeria_marcas"` dentro de `<TabsContent value="catalogo">`.
- Interface de Produto Homologado:
  ```typescript
  interface ProductBrandPreview {
    id: string;
    name: string;
    category: string;
    currentImageUrl: string;
    proposedImageUrl: string;
    realBrand: string;
    manufacturer: string;
    volumeOrWeight: string;
    status: "aprovado" | "pendente" | "troca_solicitada";
    alternativeBrands?: string[];
  }
  ```

### M2: Kit de Boas-Vindas no Cardápio (`guest-minibar.tsx`)
- Identificação dos itens de cortesia:
  - `prod_cortesia_agua_copo`: Copo d'Água Mineral Selado 200ml (cota máxima 2 un., R$ 0,00).
  - `prod_cortesia_amendoim_mendorato`: Amendoim Mendorato Santa Helena 27g (cota máxima 2 un., R$ 0,00).
- Exibição no topo antes dos produtos pagos com badge `Cortesia da Casa • R$ 0,00`.

### M2: Conferência da Repositora (`anserve-restock.tsx` & `demo-server.mjs`)
- Payload enviado em `POST /api/minibar/inspections`:
  ```json
  {
    "flatNumber": "509",
    "isDailyLaunch": true,
    "welcomeKitConsumption": {
      "waterCups": 1,
      "mendoratoPeanuts": 2
    },
    "consumedItemsList": [...],
    "restockedItems": []
  }
  ```
- Invariante: `welcomeKitConsumption` NÃO é mesclado em `restockedItems`. A repositora não recebe tarefas de reposição de cortesias.

### M2: Extrato Discriminado (`demo-server.mjs` - `buildReservationMinibarStatement`)
- Retorno de extrato com nó próprio:
  ```typescript
  statement.consumedCourtesyItems = [
    { productId: "prod_cortesia_agua_copo", name: "Copo d'Água Mineral 200ml", quantity: 1, unitPrice: 0.00, totalPrice: 0.00 },
    { productId: "prod_cortesia_amendoim_mendorato", name: "Amendoim Mendorato 27g", quantity: 2, unitPrice: 0.00, totalPrice: 0.00 }
  ];
  ```
- Invariante: `statement.totalLaunchedAmount` e `statement.pendingBalance` não somam nenhum valor desses itens.

### M3: Repasse Financeiro Anserve (`demo-server.mjs` - `GET /api/minibar/settlement`)
- Apuração no endpoint de fechamento:
  ```javascript
  const courtesyWaterCount = totalCourtesyWaterCupsConsumed;
  const courtesyWaterUnitCost = 2.00;
  const courtesyWaterReimbursement = courtesyWaterCount * courtesyWaterUnitCost;
  const courtesyPeanutCount = totalCourtesyPeanutsConsumed;
  const courtesyPeanutReimbursement = 0.00; // Fornecimento próprio CorpFlats

  settlement.courtesySummary = {
    waterCups: { quantity: courtesyWaterCount, unitCost: 2.00, totalCost: courtesyWaterReimbursement, supplier: "anserve" },
    peanuts: { quantity: courtesyPeanutCount, unitCost: 0.00, totalCost: 0.00, supplier: "hotel_proprio" },
    totalReimbursementToAnserve: courtesyWaterReimbursement
  };
  ```

## Code Layout
- Backend:
  - `artifacts/api-server/demo-server.mjs`
  - Espelho idêntico (paridade SHA-256): `scripts/demo-server.mjs`
- Frontend:
  - `artifacts/limpeza/src/pages/minibar-admin.tsx` (Galeria de validação e extrato financeiro)
  - `artifacts/limpeza/src/pages/guest-minibar.tsx` (Cardápio do hóspede com kit no topo e extrato segregado)
  - `artifacts/limpeza/src/pages/anserve-restock.tsx` (Conferência individual da repositora)
  - `artifacts/limpeza/src/pages/anserve-dashboard.tsx` (Demonstrativo de repasse Anserve)
  - `artifacts/limpeza/src/pages/guest-portal.tsx` e `pms-calendar.tsx` (Extrato da reserva segregado)
  - Assets: `artifacts/limpeza/public/images/frigobar/`
- Testes Pontuais:
  - `tests/minibar-welcome-kit-and-brands.test.mjs`
