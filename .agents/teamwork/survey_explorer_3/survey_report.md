# Relatório Técnico de Investigação — Requisitos R4 e R6
## Painel de Conferência da Repositora Anserve, Kit de Boas-Vindas e Apuração Financeira de Repasse

**Data**: 2026-11-11  
**Investigador**: `survey_explorer_3` (Teamwork Explorer)  
**Projeto**: Guest-Flow-Manager (CorpFlats Soho Residence)  
**Status**: Concluído (Read-Only)  

---

## 1. Resumo Executivo (Executive Summary)

Este relatório detalha a arquitetura técnica, os fluxos de tela e as regras de negócio de backend para o atendimento rigoroso dos **Requisitos R4 e R6** estabelecidos no projeto de frigobar da CorpFlats:
- **Requisito R4**: Adaptação da interface de conferência da repositora da Anserve (`anserve-restock.tsx`) para permitir o registro individual da quantidade consumida dos itens do kit de boas-vindas (0 a 2 copos d'água mineral 200ml e 0 a 2 pacotes de amendoim Mendorato 27g), garantindo que esse consumo **NÃO gere ordens ou alertas de reposição para a repositora** (a reposição do kit cabe exclusivamente à camareira na virada de hóspede/turnover).
- **Requisito R6**: Distinção clara da origem dos fornecedores nas regras financeiras e relatórios contábeis:
  * **Amendoim Mendorato**: Fornecimento próprio pelo hotel/proprietário (custo de repasse à Anserve: **R$ 0,00**, com tag explícita de suprimento próprio do hotel).
  * **Copos d'Água Mineral**: Supridos pelo estoque da Anserve, com apuração do volume consumido multiplicado pelo custo unitário nominal (ex: R$ 2,00/copo), compondo o totalizador de repasse a pagar pelo hotel à Anserve.

---

## 2. Mapa Arquitetural do Módulo de Frigobar e Anserve

| Componente | Arquivo Principal | Arquivo Gêmeo / Espelho | Função Principal |
| :--- | :--- | :--- | :--- |
| **Painel da Repositora** | `artifacts/limpeza/src/pages/anserve-restock.tsx` | N/A (Frontend) | Interface mobile/PWA das repositoras nos flats (PIN rápido, prioridade de flats, conferência de consumo) |
| **Painel do Gestor Anserve** | `artifacts/limpeza/src/pages/anserve-dashboard.tsx` | N/A (Frontend) | Vendas, repasse financeiro, gestão de equipe, WhatsApp de trabalho e exportação de CSVs |
| **Painel Executivo CorpFlats** | `artifacts/limpeza/src/pages/minibar-admin.tsx` | N/A (Frontend) | Catálogo de produtos, gabarito de dotação por flat, displays A6 e fechamento do repasse |
| **Central de Notas Fiscais** | `artifacts/limpeza/src/pages/minibar-invoices.tsx` | N/A (Frontend) | Emissão, anexação e monitoramento de entrega de NFs para os hóspedes |
| **Cardápio Digital do Hóspede** | `artifacts/limpeza/src/pages/guest-minibar.tsx` | N/A (Frontend) | Visualização do cardápio e extrato de consumo com segregação de cortesias (R$ 0,00) |
| **Backend & APIs** | `artifacts/api-server/demo-server.mjs` | `scripts/demo-server.mjs` (Paridade SHA-256) | Rotas `/api/minibar/*`, motor de conferência, persistência e extrato de fechamento |

---

## 3. Investigação Detalhada: Fluxo Atual da Repositora

### 3.1. Como a repositora opera hoje (`anserve-restock.tsx`)
1. **Acesso e Autenticação**:
   - Acesso via `/frigobar-reposicao` ou link direto com PIN de 4 dígitos.
   - Endpoint: `POST /api/minibar/auth-pin`. Valida o PIN (padrão `"1234"` ou PIN individual da colaboradora com perfil `anserve_repositora`).
   - Salva token em `localStorage.getItem("corpflats_anserve_token")` e nome em `corpflats_anserve_user_name`.
2. **Painel de Priorização Diária**:
   - Consome `GET /api/minibar/inspections/flats-status`.
   - Ordena os 19 flats do Soho Residence por prioridade:
     * Rank 0: Check-out realizado hoje (sinalizador vermelho piscando) aguardando conferência final.
     * Rank 1: Saída prevista para hoje pendente.
     * Rank 2: Ocupado aguardando conferência do dia.
     * Rank 3: Check-out realizado e já conferido hoje (verde).
     * Rank 4: Ocupado e já conferido hoje.
     * Rank 5: Flat livre.
3. **Modais de Ação**:
   - **Modal A — "Lançar Consumo do Dia" (`launchModalFlat`)**:
     * Aberto quando a repositora identifica itens consumidos.
     * Exibe a lista de produtos filtrando apenas `products.filter(p => !p.isCourtesy)` (linha 518). Os itens de cortesia são totalmente omitidos da lista de contagem!
     * Possui botões `-` e `+` para incrementar quantidades.
     * Possui um checkbox obsoleto: `"Repor Cortesias Consumidas (Cápsulas Nespresso / cortesias gratuitas)"` (`launchCourtesyRestock`).
     * Exige que ao menos 1 item pago tenha `qty > 0` (linhas 631-638). Se nenhum item pago for consumido, o modal bloqueia o envio.
     * Ao submeter, envia `consumedItems: consumedItemsList` e `restockedItems`.
   - **Modal B — "Sem Consumo" (`semConsumoModalFlat`)**:
     * Aberto quando a repositora entra no flat e nenhum item pago foi consumido.
     * Possui um checkbox fixo: `"Repor Kit de Cortesias de Boas-Vindas (2 Cápsulas Nespresso + Balas + Amendoim)"` (`semConsumoCourtesyRestock`, linha 1292).
     * Se marcado, injeta no payload de envio itens de reposição mockados (2 nespresso, 4 balas, 1 amendoim) em `restockedItems`.
     * Envia `POST /api/minibar/inspections` com `status: "conforme"` e `isDailyLaunch: false`.

### 3.2. Problemas identificados no fluxo atual em relação a R4 e R6
1. **Omissão da conferência do kit de cortesia**: Não há campos para registrar se foram consumidos 0, 1 ou 2 copos d'água, nem 0, 1 ou 2 amendoins Mendorato.
2. **Incoerência operacional na reposição**: O código atual assume que a própria repositora da Anserve faz a reposição das cortesias (injetando itens em `restockedItems`). No modelo oficial CorpFlats (R4), **a reposição do kit de boas-vindas é de responsabilidade da camareira na virada de hóspede (turnover)**, e NÃO da repositora da Anserve.
3. **Trava de envio indevida**: Se um hóspede consumir apenas 1 copo d'água do kit e nenhum item pago, a repositora não consegue lançar essa conferência pelo modal de consumo diário, e no modal "Sem Consumo" não há como especificar que a água foi consumida.
4. **Falta de distinção de fornecimento financeiro**: O amendoim e o café eram somados genericamente em `restockedCourtesyTotalCost`, sem distinguir o que é do hotel (R$ 0,00) do que é da Anserve (custo unitário da água).

---

## 4. Adaptação da Interface de Conferência para o Requisito R4

### 4.1. Estrutura do Novo Checklist do Kit de Boas-Vindas
O checklist deve ser integrado em **ambos os modais** da repositora (`anserve-restock.tsx`):

#### A. No Modal "Lançar Consumo do Dia" (`launchModalFlat`)
Inserir uma seção destacada no topo (antes dos itens pagos):
```tsx
{/* Bloco R4: Kit de Boas-Vindas (Cortesia da Casa) */}
<div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-sky-500/10 to-transparent border border-amber-500/30 space-y-3">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="text-base">🎁</span>
      <div>
        <h4 className="text-xs font-black text-foreground">Kit de Boas-Vindas (Cortesia da Casa)</h4>
        <p className="text-[10px] text-muted-foreground">
          Conferência individual de consumo • Limite de até 2 unidades de cada por estadia
        </p>
      </div>
    </div>
    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[9px] font-black">
      Cortesia R$ 0,00
    </Badge>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
    {/* Copo d'Água Mineral 200ml */}
    <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="font-bold text-xs text-foreground block truncate">💧 Copo d'Água Mineral (200ml)</span>
        <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold block">
          Estoque Anserve • Cortesia R$ 0,00
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {[0, 1, 2].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => setWelcomeKitWaterConsumed(num)}
            className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
              welcomeKitWaterConsumed === num
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-muted/70 text-foreground hover:bg-muted"
            }`}
          >
            {num}
          </button>
        ))}
      </div>
    </div>

    {/* Amendoim Mendorato 27g */}
    <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="font-bold text-xs text-foreground block truncate">🥜 Amendoim Mendorato (27g)</span>
        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">
          Fornecimento Próprio Hotel • R$ 0,00
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {[0, 1, 2].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => setWelcomeKitPeanutsConsumed(num)}
            className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
              welcomeKitPeanutsConsumed === num
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-muted/70 text-foreground hover:bg-muted"
            }`}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  </div>

  <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
    ℹ️ A repositora registra apenas a contagem. A reposição do kit é realizada exclusivamente pela camareira na virada de hóspede.
  </p>
</div>
```

#### B. No Modal "Passagem Sem Consumo" (`semConsumoModalFlat`)
Remover o checkbox antigo que prometia repor cápsulas Nespresso e balas, e substituí-lo pelo mesmo seletor de conferência do kit:
- Permite registrar se o hóspede consumiu 0, 1 ou 2 copos d'água e 0, 1 ou 2 amendoins Mendorato.
- Explicação clara na interface: *"Frigobar conferido sem consumo de itens pagos. Informe se houve consumo das cortesias do kit de boas-vindas para atualização do relatório e repasse de custos."*

### 4.2. Garantia de NÃO Disparo de Ordem de Reposição para a Repositora
Para cumprir a regra expressa de R4:
1. **Payload enviado pela Repositora**:
   O payload de `POST /api/minibar/inspections` deve enviar um bloco dedicado:
   ```json
   {
     "flatNumber": "101",
     "reservationCode": "RES-605",
     "inspectedBy": "Maria Repositora",
     "launchDate": "2026-11-11",
     "status": "lancamento_diario",
     "welcomeKitConsumption": {
       "waterCups": 1,
       "mendoratoPeanuts": 2
     },
     "consumedItems": [
       { "productId": "prod_refrigerante", "quantity": 1 }
     ],
     "restockedItems": [
       { "productId": "prod_refrigerante", "quantity": 1, "isCourtesy": false }
     ]
   }
   ```
2. **Isolamento de `restockedItems`**:
   Os itens do `welcomeKitConsumption` **JAMAIS** devem ser inseridos no array `restockedItems` da repositora.
   - O array `restockedItems` do payload da repositora conterá exclusivamente os itens pagos que ela de fato repôs no frigobar (refrigerantes, cervejas, chocolates, etc.).
   - O consumo do kit de cortesia não incrementa nenhuma tarefa na fila da repositora e não gera alertas de falta de estoque de frigobar no painel Anserve.
3. **Fluxo de Turnover pela Governança**:
   A reposição física do kit de boas-vindas permanece 100% vinculada ao checklist de turnover da camareira (`tasks.tsx` e `maid-automation-service.mjs`), onde a camareira monta o kit inicial ao preparar a suíte para o próximo check-in.

---

## 5. Investigação Financeira: Regras de Repasse de Custos (Requisito R6)

### 5.1. Regras Financeiras Atuais do Fechamento (`demo-server.mjs`)
No endpoint `GET /api/minibar/settlement` (linhas 79143-79225), o cálculo atual segue a fórmula:
$$\text{Net Payable to Anserve} = \text{Total Orders Amount} - \text{Card Fees} - \text{Pix Fees} - \text{Commission CorpFlats} + \text{Courtesy Restock Cost}$$
Onde:
- `Total Orders Amount`: total das vendas pagas pelos hóspedes no período.
- `Card Fees`: taxa de 3,99% sobre pagamentos com cartão (Mercado Pago).
- `Pix Fees`: taxa de 0,99% sobre pagamentos com PIX (Banco Inter).
- `Commission CorpFlats`: retenção acordada de intermediação (atualmente 0%).
- `Courtesy Restock Cost`: somatório de `insp.restockedCourtesyTotalCost` das inspeções.

### 5.2. Implementação da Distinção de Origem do Fornecimento (R6)

#### Regra 1: Amendoim Mendorato (Fornecimento Próprio do Hotel)
- **Origem**: Comprado diretamente pelo Hotel / CorpFlats de distribuidores atacadistas.
- **Relação com a Anserve**: Nenhuma. Não entra no estoque Anserve e não gera débito ou crédito na conta Anserve.
- **Preço de Venda ao Hóspede**: R$ 0,00 (Gratuito).
- **Custo de Repasse à Anserve**: **R$ 0,00**.
- **Classificação**: `supplierOrigin: "hotel_proprio"`.

#### Regra 2: Copos d'Água Mineral (Estoque Anserve)
- **Origem**: Fornecidos pelo estoque Anserve (copos de 200ml selados).
- **Preço de Venda ao Hóspede**: R$ 0,00 (Gratuito como cortesia no limite de 2 copos por estadia).
- **Preço de Custo Unitário**: **R$ 2,00** (valor unitário de custo configurado no catálogo em `prod_agua_mineral_copo.cost`).
- **Custo de Repasse devido pelo Hotel à Anserve**:
  $$\text{Repasse Água Cortesia} = (\text{Volume total de copos d'água consumidos como cortesia no período}) \times \text{R\$ 2,00}$$
- **Classificação**: `supplierOrigin: "anserve"`.

#### Fórmula do Fechamento Financeiro Atualizada:
$$\text{Líquido a Repassar para a Anserve} = (\text{Vendas Pagas}) - (\text{Taxas Cartão/PIX}) - (\text{Comissão Hotel}) + \mathbf{(\text{Total Copos Água Cortesia} \times \text{R\$ 2,00})}$$

---

## 6. Onde Disponibilizar os Relatórios e Totalizadores de Repasse

Para total transparência entre a CorpFlats e a Anserve, os dados apurados devem ser exibidos nos seguintes locais:

### 6.1. No Painel do Gestor Anserve (`anserve-dashboard.tsx`)
1. **Na Aba 1 — "Vendas & Repasse (CSV)"**:
   - No card de fechamento `"Demonstrativo do Extrato de Repasse"`:
     Substituir o item genérico `"3. Crédito de Cortesias"` por um detalhamento discriminado:
     * **Copos d'Água Mineral (Estoque Anserve)**: `X copos consumidos × R$ 2,00 = + R$ Y (Repasse Devido pelo Hotel à Anserve)`.
     * **Amendoim Mendorato (Hotel)**: `Z pacotes consumidos (Fornecimento Próprio = R$ 0,00)`.
   - Card Exclusivo em Destaque:
     **"Apuração do Kit de Boas-Vindas (Reembolso de Águas Anserve)"**
     Exibindo:
     * Quantidade total de copos d'água cortesia consumidos no período.
     * Custo unitário contratual (R$ 2,00).
     * Total a pagar pelo hotel referente às águas de cortesia (R$ Y).
     * Tag de Amendoins Mendorato: "Suprimento Próprio CorpFlats (Isento de Repasse)".
2. **Nas Exportações CSV**:
   - `handleExportSalesCsv`: Adicionar ao cabeçalho/totalizador as colunas de consumo de cortesia (Águas Anserve vs Mendorato Próprio).
   - `handleExportProductsCsv`: Incluir linha específica:
     `"Água Mineral Copo 200ml (Cortesia Boas-Vindas)"; Categoria: "Kit de Boas-Vindas"; Qtd: X; Preço Venda: R$ 0,00; Custo Repasse Unitário: R$ 2,00; Total Repasse: R$ Y`.
     `"Amendoim Mendorato 27g (Cortesia Boas-Vindas)"; Categoria: "Kit de Boas-Vindas"; Qtd: Z; Preço Venda: R$ 0,00; Custo Repasse Unitário: R$ 0,00 (Fornecimento Próprio); Total Repasse: R$ 0,00`.

### 6.2. No Painel Executivo CorpFlats (`minibar-admin.tsx`)
1. **Na Aba "Extrato"**:
   - No bloco `"Fechamento Financeiro de Repasse (CorpFlats ↔ Anserve)"`, exibir o breakdown auditável:
     * Repasse Bruto de Vendas: R$ A
     * (-) Taxas Gateway: - R$ B
     * (+) Repasse de Copos d'Água Anserve (X un. × R$ 2,00): + R$ Y
     * (=) Líquido Transferido à Anserve: R$ (A - B + Y)
     * Informação complementar: "Amendoins Mendorato fornecidos pelo próprio hotel (Sem repasse à Anserve: R$ 0,00)".

### 6.3. No Histórico de Conferências da Repositora (`anserve-restock.tsx` e `anserve-dashboard.tsx` Tab 3)
- Na tabela de passagens e histórico de estadias:
  Exibir distintivo claro quando houver consumo do kit:
  `💧 1x Copo d'Água (Cortesia) • 🥜 2x Mendorato (Cortesia)`.

---

## 7. Modelagem de Dados e Contratos de Backend (`demo-server.mjs`)

### 7.1. Produto Amendoim Mendorato no Catálogo
Inserir em `getDefaultMinibarProducts()` e `data/database.json`:
```javascript
{
  id: "prod_amendoim_mendorato",
  name: "Amendoim Mendorato 27g",
  category: "Kit de Boas-Vindas",
  price: 0.00,
  cost: 0.00,
  defaultQuantity: 2,
  imageUrl: "/images/frigobar/amendoim_mendorato.png",
  description: "Amendoim crocante sabor japonês Mendorato 27g - Cortesia de Boas-Vindas",
  active: true,
  isCourtesy: true,
  courtesyLimitPerStay: 2,
  supplierOrigin: "hotel_proprio",
  sortOrder: 0,
  createdAt: "2026-11-11T00:00:00.000Z",
  updatedAt: "2026-11-11T00:00:00.000Z"
}
```

Atualizar o produto `prod_agua_mineral_copo` com a flag de fornecedor:
```javascript
{
  id: "prod_agua_mineral_copo",
  name: "Água Mineral Copo 200ml",
  category: "Bebidas",
  price: 5.00,
  cost: 2.00,
  defaultQuantity: 4,
  imageUrl: "/images/frigobar/agua_mineral_copo.png",
  description: "Água mineral natural em copo selado 200ml",
  active: true,
  isCourtesy: false, // Pode ser cortesia quando no kit de boas-vindas
  supplierOrigin: "anserve",
  sortOrder: 2
}
```

### 7.2. Estrutura da Inspeção (`db.minibarInspections`)
Na gravação da vistoria (`app.post("/api/minibar/inspections")`):
```javascript
const welcomeKitConsumption = {
  waterCups: Math.min(2, Math.max(0, Number(req.body.welcomeKitConsumption?.waterCups) || 0)),
  mendoratoPeanuts: Math.min(2, Math.max(0, Number(req.body.welcomeKitConsumption?.mendoratoPeanuts) || 0)),
  waterUnitCost: Number(db.minibarProducts.find(p => p.id === "prod_agua_mineral_copo")?.cost || 2.00),
  waterTotalCost: Math.min(2, Math.max(0, Number(req.body.welcomeKitConsumption?.waterCups) || 0)) * 2.00,
  mendoratoUnitCost: 0.00,
  mendoratoTotalCost: 0.00,
  waterSupplier: "anserve",
  mendoratoSupplier: "hotel_proprio"
};
```

### 7.3. Segregação no Extrato da Reserva (`buildReservationMinibarStatement`)
- Se houver consumo de `waterCups` ou `mendoratoPeanuts`, eles são incluídos em `dailyLaunches` com `isCourtesy: true`, `unitPrice: 0.00`, `totalPrice: 0.00`.
- Em `pendingLaunchedItems`, os itens de cortesia são **estritamente filtrados out**:
  `if (!enrichedItem.isCourtesy && remQty > 0) pendingLaunchedItems.push(enrichedItem);`
- Isso garante que o valor a pagar pelo hóspede seja **R$ 0,00** e não afete o checkout nem gere ordens de cobrança indevidas.

### 7.4. Extrato de Fechamento (`GET /api/minibar/settlement`)
Atualizar o cálculo das inspeções:
```javascript
let totalCourtesyWaterCups = 0;
let courtesyWaterUnitCost = Number(db.minibarProducts?.find(p => p.id === "prod_agua_mineral_copo")?.cost ?? 2.00);
let totalCourtesyMendorato = 0;

for (const insp of filteredInspections) {
  if (insp.welcomeKitConsumption) {
    totalCourtesyWaterCups += Number(insp.welcomeKitConsumption.waterCups) || 0;
    totalCourtesyMendorato += Number(insp.welcomeKitConsumption.mendoratoPeanuts) || 0;
  }
}

const courtesyWaterTotalCost = Number((totalCourtesyWaterCups * courtesyWaterUnitCost).toFixed(2));
const courtesyRestockCost = courtesyWaterTotalCost; // Apenas a água Anserve compõe o crédito de repasse

// Net payable to Anserve
const netPayableToAnserve = totalOrdersAmount - cardFees - pixFees - commissionCorpFlats + courtesyRestockCost;
```

---

## 8. Estratégia de Verificação e Testes

Conforme as leis do projeto (AGENTS.md):
- **PROIBIDO** rodar varreduras globais como `npm test` ou `tests/*.test.mjs`.
- Apenas testes pontuais estritamente focados no que foi implementado devem ser executados.
- Teste pontual recomendado para validação:
  Executar isoladamente o teste unitário de fluxo de backend:
  `node --test tests/minibar-backend-flow.test.mjs`
- Teste de Paridade Twin-Server:
  `node scripts/check-twin-parity.mjs` (ou conferência SHA-256 entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`).

---

## 9. Plano de Ação Recomendado para o Agente Implementador

1. **Catálogo de Dados**:
   - Adicionar o item `prod_amendoim_mendorato` ao banco e catálogo com `isCourtesy: true`, `cost: 0.00`, `price: 0.00`, `supplierOrigin: "hotel_proprio"`.
   - Adicionar campo `supplierOrigin: "anserve"` no item `prod_agua_mineral_copo`.
2. **Backend (`artifacts/api-server/demo-server.mjs`)**:
   - Atualizar `POST /api/minibar/inspections` para aceitar `welcomeKitConsumption: { waterCups, mendoratoPeanuts }`.
   - Garantir que `welcomeKitConsumption` NÃO seja inserido em `restockedItems`.
   - Atualizar `buildReservationMinibarStatement()` para expor os itens de cortesia com valor R$ 0,00 discriminados no extrato sem somar no total a pagar.
   - Atualizar `GET /api/minibar/settlement` e `GET /api/minibar/anserve-reports` para totalizar os copos d'água consumidos vezes o custo unitário e segregar o amendoim Mendorato a R$ 0,00.
   - Sincronizar com paridade SHA-256 em `scripts/demo-server.mjs`.
3. **Frontend da Repositora (`artifacts/limpeza/src/pages/anserve-restock.tsx`)**:
   - Adicionar o bloco de conferência do kit de boas-vindas com contadores 0 a 2 em `launchModalFlat` e `semConsumoModalFlat`.
   - Remover os checkboxes e código legado de reposição de cápsulas Nespresso / balas.
   - Permitir submeter "Lançar Consumo" ou "Sem Consumo" com o registro do kit de boas-vindas.
4. **Painel do Gestor Anserve (`artifacts/limpeza/src/pages/anserve-dashboard.tsx`)**:
   - Exibir na aba 1 o card e demonstrativo com a discriminação dos copos d'água (a repassar ao custo) e amendoins (fornecimento próprio hotel R$ 0,00).
   - Atualizar os relatórios e botões de exportação CSV.
5. **Painel Executivo CorpFlats (`artifacts/limpeza/src/pages/minibar-admin.tsx`)**:
   - Refletir o totalizador na aba "extrato".
