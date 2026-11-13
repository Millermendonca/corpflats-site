# Relatório Técnico de Investigação — Requisitos R3 & R5
**Data:** 11/11/2026  
**Investigador:** `survey_explorer_2` (Teamwork Explorer)  
**Projeto:** Guest-Flow-Manager (CorpFlats)  
**Escopo:** Cardápio Digital do Hóspede (Kit de Boas-Vindas) & Segregação de Extrato com Valor Zerado  

---

## 1. Sumário Executivo

Esta investigação analisa os **Requisitos R3 e R5** do projeto de Frigobar e Kit de Boas-Vindas da CorpFlats:
- **R3**: Inclusão dos itens de cortesia do Kit de Boas-Vindas (até 2 copos d'água mineral 200ml e até 2 amendoins Mendorato 27g) no topo da interface do cardápio do hóspede (`/frigobar/:flatNumber`), com destaque visual, badge de cortesia ("Cortesia da Casa", "100% Grátis", "R$ 0,00"), segregação explícita dos produtos pagos e impossibilidade técnica de gerar cobrança.
- **R5**: Discriminação segregada no extrato de consumo da reserva (portal do hóspede, cardápio do frigobar e painel operacional/PMS), exibindo **apenas as quantidades efetivamente consumidas** (0, 1 ou 2 unidades) em um bloco destacado próprio com valor exibido de **R$ 0,00**, garantindo imunidade matemática total do saldo a pagar da reserva.

A análise abrangeu o código-fonte do frontend (`guest-minibar.tsx`, `guest-portal.tsx`, `guest-checkout.tsx`, `reception-checkout.tsx`, `pms-calendar.tsx`, `pms-reports.tsx`) e os endpoints de backend em `demo-server.mjs`.

---

## 2. Investigação R3: Cardápio do Frigobar do Hóspede (`guest-minibar.tsx`)

### 2.1. Arquitetura Atual da Página `/frigobar/:flatNumber`
- **Arquivo**: `artifacts/limpeza/src/pages/guest-minibar.tsx` (2.670 linhas).
- **Rotas Suportadas**:
  - `/frigobar/flat/:flatNumber`, `/frigobar/:flatNumber` (acesso via QR Code no flat).
  - `/minha-reserva/:code/frigobar` (acesso pelo link exclusivo da reserva).
- **Modo Operacional Atual**: `restocker_daily_launch` (Lançamento diário pela repositora da Anserve).
  - O hóspede **não adiciona itens ao carrinho para efetuar compra manual**. O frigobar funciona em modelo de conferência física pela repositora terceirizada (Anserve), que lança o consumo constatado.
  - A interface do hóspede combina:
    1. **Header Mobile** (linhas 1380–1438): Número do flat, código da reserva, status de conferência e botão *"Ver Cardápio"* (que executa scroll suave e expande a Seção 5).
    2. **Seção 1 — Resumo Único do Consumo do Quarto** (linhas 1448–1475): Exibe o valor total consumido (`totalLaunchedAmount`) e o status da conferência pós check-out.
    3. **Seção 2 — Extrato de Consumo por Dia & Divisão** (linhas 1477–1728): Lista os lançamentos agrupados por data (`dailyLaunches`), detalhando produtos, quantidades, subtotais e controles de divisão (Titular, Meio a meio, Por item).
    4. **Seção 3 — Hóspedes do Flat & Preferências Fiscais** (linhas 1730–1962): Gestão de CPF/CNPJ para emissão de NFS-e por consumidor.
    5. **Seção 4 — Pagamentos Realizados & Notas Fiscais** (linhas 1964–2037): Histórico de pagamentos com links diretos para PDF da NF.
    6. **Seção 5 — Cardápio Digital do Frigobar** (linhas 2039–2215): Tabela consultiva de preços (atualmente recolhida por padrão via `showReferenceCatalog`), com filtros de categoria (`todos`, `bebidas`, `snacks`, `cervejas`, `cortesias`).
    7. **Barra Fixa Inferior** (linhas 2218–2250): Exibe o total a pagar e botão para quitação via PIX / Cartão.

### 2.2. Como os Itens São Renderizados e Agrupados
- O catálogo de produtos é carregado da API através de `POST /api/minibar/flat-context` ou `GET /api/minibar/reservation-context/:code` (armazenado no estado `catalog: MinibarProduct[]`).
- O filtro de categorias atual (linhas 2077–2100) possui as abas:
  - `✨ Todos`
  - `💧 Bebidas`
  - `🍫 Petiscos & Snacks`
  - `🍺 Cervejas & Alcoólicos`
  - `☕ Cafés & Cortesias`
- Na categoria `cortesias` (linhas 2108–2110), a lógica atual filtra por `Boolean(prod.isCourtesy) || cat.includes("cafe") || name.includes("cápsula")`.
- Na renderização de cada card (linhas 2150–2211), se `prod.isCourtesy` for verdadeiro, o card recebe fundo com gradiente verde suave (`from-emerald-950/30 via-slate-950/90 to-slate-950/90 border-emerald-500/30`), badge "Cortesia" e preço substituído pelo texto "Cortesia".
- **Limitação Observada**: O cardápio digital fica recolhido no final da página (Seção 5), misturando o que é cortesia dentro da lista geral ou aba de café. Não existe hoje um bloco de boas-vindas com destaque no topo informando ao hóspede o que ele tem direito gratuitamente ao chegar.

---

## 3. Especificação do Requisito R3: Seção "Kit de Boas-Vindas (Cortesia da Casa)"

### 3.1. Posicionamento e Visibilidade
Para máxima clareza e acolhimento do hóspede, a seção **"Kit de Boas-Vindas (Cortesia da Casa)"** deve ser implementada em **dois pontos estratégicos**:
1. **Destaque Permanente no Topo do Cardápio Digital (Seção 5)**: Imediatamente acima do seletor de categorias de produtos pagos, exibido sempre que o cardápio for aberto/consultado.
2. **Card de Boas-Vindas Inicial no Extrato**: No topo do `<main>`, logo abaixo do resumo geral ou acima da lista de lançamentos diários, informando os itens de cortesia incluídos na estadia desde o primeiro minuto de check-in.

### 3.2. Itens do Kit de Boas-Vindas
O kit é composto estritamente por:
1. **Copo d'Água Mineral 200ml**: Até 2 unidades de cortesia por estadia (fornecimento pelo estoque da Anserve).
2. **Amendoim Mendorato 27g**: Até 2 unidades de cortesia por estadia (fornecimento próprio CorpFlats / Hotel).

### 3.3. Padrão Visual e Badges Distintivos
O bloco do Kit de Boas-Vindas deve adotar linguagem visual premium de hotelaria (verde esmeralda e dourado):
- **Container**: `bg-gradient-to-br from-emerald-950/70 via-slate-900 to-emerald-950/40 border-2 border-emerald-500/50 rounded-3xl p-5 shadow-2xl space-y-4`
- **Cabeçalho**:
  - Ícone: `<Gift className="w-5 h-5 text-emerald-400" />` em círculo com brilho esmeralda.
  - Título: `<h2 className="text-base sm:text-lg font-black text-white">Kit de Boas-Vindas (Cortesia da Casa)</h2>`
  - Badges em linha:
    - `<Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-[10px] font-black uppercase tracking-wider">100% Gratuito</Badge>`
    - `<Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-bold">Cortesia da Hospedagem</Badge>`
  - Subtítulo explicativo: *"Itens selecionados especialmente para sua chegada. Aproveite sem qualquer custo ou acréscimo em sua estadia!"*
- **Grid dos Itens (2 Colunas Responsivas)**:
  - Cada item deve apresentar:
    - Foto do produto real sobre fundo branco padronizado (conforme R1: copo d'água selado 200ml e pacote Mendorato).
    - Nome do produto em destaque (`font-black text-white text-sm`).
    - Subtítulo de cota: *"Disponível na sua chegada: até 2 unidades"*.
    - Selo de gratuidade à direita: `<strong className="text-emerald-400 font-mono text-sm font-black">R$ 0,00</strong>` acompanhado de badge *"Grátis"*.
    - Nota de rodapé do item: *"Reposição realizada exclusivamente na virada de hóspede pela camareira"*.

### 3.4. Segregação Clara dos Produtos Pagos
Abaixo do bloco do Kit de Boas-Vindas, insere-se um separador nítido com título explicativo:
```tsx
<div className="pt-2 pb-1 border-t border-slate-800">
  <div className="flex items-center gap-2">
    <Refrigerator className="w-4 h-4 text-cyan-400" />
    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
      Produtos Pagos do Frigobar (Tabela de Preços)
    </h3>
  </div>
</div>
```
Os produtos pagos mantêm sua identidade visual em ciano/azul (`cyan-400`), enquanto os itens de cortesia permanecem em verde esmeralda (`emerald-400`), eliminando qualquer confusão cognitiva por parte do hóspede.

### 3.5. Impossibilidade Técnica de Gerar Cobrança
- Não há botões de incremento/decremento (`+` / `-`) ou de adição a pedido no cardápio de referência.
- Caso qualquer rotina de backend processe itens de cortesia (ex: no payload de conferência da repositora), o preço unitário e o total são forçados estritamente para `0.00`:
  ```javascript
  unitPrice: 0.00,
  totalPrice: 0.00,
  isCourtesy: true
  ```
- O cálculo do total da ordem e do saldo pendente da reserva ignora totalmente itens onde `isCourtesy: true`.

---

## 4. Investigação do Ecossistema: Onde o Consumo É Exibido e Calculado

Mapeamos todos os pontos da plataforma onde o consumo de frigobar e extratos são apresentados ou calculados:

| Componente / Tela | Arquivo | Rota / Função | Como Exibe / Calcula o Consumo |
|---|---|---|---|
| **Cardápio & Extrato Frigobar** | `artifacts/limpeza/src/pages/guest-minibar.tsx` | `/frigobar/:flatNumber`, `/minha-reserva/:code/frigobar` | Exibe `totalLaunchedAmount`, extrato diário (`dailyLaunches`), divisão por hóspede e cardápio consultivo. |
| **Portal do Hóspede** | `artifacts/limpeza/src/pages/guest-portal.tsx` | `/minha-reserva/:code` (linhas 4409–4501) | Card *"Cardápio & Extrato do Frigobar"*: lista `minibarOrders` com status, valores, itens e botão para abrir o frigobar. |
| **Check-out do Hóspede** | `artifacts/limpeza/src/pages/guest-checkout.tsx` | `/checkout/:code` | Confirmação de saída expressa em 1 clique. Direciona para o portal `/minha-reserva/:code` para consulta e quitação de pendências. |
| **Recepção / Portaria** | `artifacts/limpeza/src/pages/reception-checkout.tsx` | `/recepcao`, `/portaria` | Baixa operacional do flat para liberar a equipe de governança. |
| **PMS — Detalhes da Reserva** | `artifacts/limpeza/src/pages/pms-calendar.tsx` | Modal da reserva (linhas 10879–11010) | Seção *"Frigobar & Notas Fiscais da Reserva"*: lista pedidos, itens (`quantity x name`), status de pagamento e download da NFS-e. |
| **PMS — Faturamento / Boleto** | `artifacts/limpeza/src/pages/pms-calendar.tsx` | Linhas 11760–11772 | Configuração de 1 boleto unificado ou 2 boletos (Hospedagem vs Consumo). NFS-e restrita a hospedagem. |
| **Relatórios PMS** | `artifacts/limpeza/src/pages/pms-reports.tsx` | `/relatorios-reservas` | Métricas de ocupação e diárias (não mistura com consumo de frigobar). |
| **Backend — Extrato da Reserva** | `artifacts/api-server/demo-server.mjs` | `buildReservationMinibarStatement()` (linha 75408) | Constrói `dailyLaunches`, `pendingLaunchedItems`, `pendingBalance` e `totalLaunchedAmount`. |
| **Backend — Contexto Frigobar** | `artifacts/api-server/demo-server.mjs` | `POST /api/minibar/flat-context` (linha 76305) & `GET /api/minibar/reservation-context/:code` (linha 76491) | Retorna extrato consolidado, catálogo, estoque padrão e histórico para o frontend. |
| **Backend — Pedidos Visíveis** | `artifacts/api-server/demo-server.mjs` | `getVisibleReservationMinibarOrders()` (linha 75452) | Filtra pedidos anexados à reserva para exibição no PMS e no portal. |
| **Backend — Inspeção Repositora** | `artifacts/api-server/demo-server.mjs` | `POST /api/minibar/inspections` (linha 78080) | Recebe conferência da repositora e gera `ORD-MB-DIV-...` / `ORD-MB-LANC-...`. |

---

## 5. Especificação do Requisito R5: Extrato Segregado com Valor Zerado

O Requisito R5 determina que:
> *"No extrato de consumo da reserva (tanto na visão do hóspede quanto no painel operacional/PMS), os itens de cortesia consumidos devem constar discriminados individualmente por unidade consumida em seção destacada e separada dos consumos pagos, sem cobrança e com valor exibido de R$ 0,00."*

### 5.1. Regra de Discriminação de Quantidades Consumidas
1. **Regra de Exibição Condicional Estrita**:
   - Se o hóspede consumiu **0 unidades** de um item de cortesia, este item **NÃO deve constar** no extrato de consumos da reserva.
   - Se o hóspede consumiu **1 copo d'água** e **0 amendoins**, o extrato exibirá **exclusivamente**:
     - `1x Copo d'Água Mineral (Kit Boas-Vindas) — R$ 0,00`
   - Se o hóspede consumiu **2 copos d'água** e **2 amendoins**, ambos aparecem com suas respectivas 2 unidades e R$ 0,00.
2. **Origem dos Dados no Backend**:
   - A repositora registra a contagem consumida (conforme R4: 0, 1 ou 2 para água; 0, 1 ou 2 para amendoim) em `POST /api/minibar/inspections`.
   - O backend armazena o consumo de cortesias na reserva e na inspeção:
     ```javascript
     reservation.welcomeKitConsumption = {
       waterCupsConsumed: consumedWaterQty,      // 0, 1 ou 2
       peanutsConsumed: consumedPeanutsQty,      // 0, 1 ou 2
       inspectedAt: new Date().toISOString(),
       inspectorName: resolvedInspectorName
     };
     ```

### 5.2. Formato do Bloco Segregado no Frontend

#### A. No Cardápio e Extrato do Frigobar (`guest-minibar.tsx`)
Na Seção 2 (Extrato), logo acima da listagem diária de produtos pagos, insere-se o **Bloco de Cortesias Consumidas**:
```tsx
{/* Bloco Segregado: Cortesias Consumidas do Kit de Boas-Vindas */}
{consumedCourtesyItems.length > 0 && (
  <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/30 p-4 space-y-2.5 shadow-md">
    <div className="flex items-center justify-between gap-2 border-b border-emerald-500/20 pb-2">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs font-black text-emerald-300">
          🎁 Kit de Boas-Vindas Consumido (Cortesia da Casa)
        </span>
      </div>
      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
        Cortesia • R$ 0,00
      </Badge>
    </div>

    <div className="divide-y divide-emerald-500/10">
      {consumedCourtesyItems.map((cItem) => (
        <div key={cItem.productId} className="py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">
                {cItem.quantity}x {cItem.productName}
              </span>
              <span className="text-[10px] text-emerald-300/80">
                Item de cortesia da hospedagem
              </span>
            </div>
          </div>
          <strong className="text-emerald-400 font-mono font-black text-xs">
            R$ 0,00
          </strong>
        </div>
      ))}
    </div>

    <div className="pt-1 flex items-center justify-between text-[11px] text-emerald-400/80 font-medium">
      <span>Subtotal de Cortesias</span>
      <span className="font-mono font-bold text-emerald-300">
        R$ 0,00 (Sem acréscimo no total da reserva)
      </span>
    </div>
  </div>
)}
```

#### B. No Portal do Hóspede (`guest-portal.tsx`)
No card *"Cardápio & Extrato do Frigobar"*, havendo itens de cortesia consumidos registrados:
```tsx
{courtesyItemsConsumed.length > 0 && (
  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-1.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 font-bold text-emerald-800">
        <Gift className="w-3.5 h-3.5 text-emerald-600" />
        <span>Kit de Boas-Vindas Consumido (Cortesia da Casa)</span>
      </div>
      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] font-bold">
        R$ 0,00
      </Badge>
    </div>
    <p className="text-[11px] text-emerald-700">
      {courtesyItemsConsumed.map((it: any) => `${it.quantity}x ${it.productName}`).join(" • ")}
    </p>
  </div>
)}
```

#### C. No PMS Operacional (`pms-calendar.tsx`)
No modal de detalhes da reserva (Seção *"Frigobar & Notas Fiscais da Reserva"*, linha 10879):
```tsx
{/* Sub-bloco Segregado de Cortesias Consumidas */}
{courtesyItemsConsumed.length > 0 && (
  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
    <div className="flex items-center justify-between">
      <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
        <Gift className="w-3.5 h-3.5" />
        <span>Kit de Boas-Vindas Consumido (Cortesia)</span>
      </span>
      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
        R$ 0,00
      </Badge>
    </div>
    <p className="text-[11px] text-muted-foreground">
      {courtesyItemsConsumed.map((it: any) => `${it.quantity}x ${it.productName}`).join(", ")}
    </p>
  </div>
)}
```

### 5.3. Imunidade Matemática do Total a Pagar
1. **Regra de Acumulação no Backend (`buildReservationMinibarStatement`)**:
   - `totalLaunchedAmount`: Somatório exclusivo dos pedidos pagos/lançados onde `isCourtesy !== true` e `unitPrice > 0`.
   - `pendingBalance`: Somatório de `remainingAmount` estritamente de produtos pagos.
   - Itens de cortesia são anotados com `unitPrice: 0`, `totalPrice: 0`, `remainingTotalPrice: 0`, `isCourtesy: true`, `isPaid: true`.
2. **Imunidade da Reserva (`reservation.totalAmount` e `reservation.totalPrice`)**:
   - As cortesias do Kit de Boas-Vindas não alteram nenhum campo financeiro da entidade `reservation` (`totalAmount`, `paidAmount`, `balanceDue`, `price`).
   - Não geram débitos de checkout, não bloqueiam a saída rápida no tablet da portaria e não constam na apuração de impostos da NFS-e.

---

## 6. Modelagem de Dados Recomendada

Para garantir coerência total entre os módulos de Catálogo (Explorer 1), Extrato (Explorer 2) e Reposição Anserve (Explorer 3), recomenda-se a seguinte estrutura:

### 6.1. Cadastro dos Produtos em `db.minibarProducts`
```javascript
// Copo d'água mineral cortesia (fornecimento Anserve)
{
  id: "prod_cortesia_agua_copo",
  name: "Copo d'Água Mineral 200ml",
  category: "cortesias",
  price: 0.00,
  cost: 2.00,                 // Custo Anserve para repasse financeiro do hotel (R$ 2,00)
  defaultQuantity: 2,         // Cota máxima de cortesia
  isCourtesy: true,
  courtesyLimitPerStay: 2,
  supplier: "anserve",        // Identificador de fornecedor para R6
  imageUrl: "/images/frigobar/agua_mineral_copo.png",
  description: "Água mineral natural em copo selado 200ml (Kit de Boas-Vindas)",
  active: true,
  sortOrder: 1
},
// Amendoim Mendorato cortesia (fornecimento próprio hotel)
{
  id: "prod_cortesia_amendoim_mendorato",
  name: "Amendoim Mendorato 27g",
  category: "cortesias",
  price: 0.00,
  cost: 0.00,                 // Custo repasse Anserve = R$ 0,00 (fornecimento próprio)
  defaultQuantity: 2,         // Cota máxima de cortesia
  isCourtesy: true,
  courtesyLimitPerStay: 2,
  supplier: "hotel_proprio",  // Identificador de fornecedor para R6
  imageUrl: "/images/frigobar/amendoim_mendorato.png",
  description: "Amendoim crocante Mendorato 27g (Kit de Boas-Vindas)",
  active: true,
  sortOrder: 2
}
```

### 6.2. Estrutura do Statement Retornado ao Frontend
Em `buildReservationMinibarStatement()` (`demo-server.mjs`):
```javascript
return {
  isCheckedOut,
  hasFinalCheckoutInspection,
  checkoutTime,
  dailyLaunches,
  pendingLaunchedItems,
  pendingBalance,
  totalLaunchedAmount,
  totalPaidAmount,
  // NOVO: Array consolidado de cortesias consumidas (apenas itens com qty > 0)
  consumedCourtesyItems: [
    // ex: { productId: "prod_cortesia_agua_copo", productName: "Copo d'Água Mineral 200ml", quantity: 1, unitPrice: 0, totalPrice: 0 }
  ],
  welcomeKitSummary: {
    waterCupsConsumed: consumedWaterQty,
    peanutsConsumed: consumedPeanutsQty,
    totalCourtesyValue: 0.00
  },
  splitConfig,
  splitBreakdown
};
```

---

## 7. Conclusão da Investigação
- Todos os pontos de exibição e cálculo de consumo foram mapeados com precisão cirúrgica de linhas de código.
- A implementação dos Requisitos R3 e R5 é direta, modular e plug-and-play, sem risco de regressão para o motor financeiro ou rotinas de checkout.
- As diretrizes de tipagem, segregação visual e integridade de saldo foram 100% detalhadas para a etapa de implementação.
