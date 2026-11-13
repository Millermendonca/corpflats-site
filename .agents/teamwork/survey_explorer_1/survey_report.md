# Relatório Técnico de Mapeamento do Frigobar, Padronização Visual e Painel de Homologação (R1 & R2)

**Data de Elaboração:** 11 de Novembro de 2026  
**Investigador:** `survey_explorer_1` (Teamwork Explorer / Frontend UI)  
**Escopo:** Requisitos R1 (Padronização e Fotos de Marcas Comerciais Reais) e R2 (Galeria de Validação e Homologação Prévia)  
**Projeto:** Guest-Flow-Manager (CorpFlats)  
**Status:** Concluído com Sucesso — Pronto para Revisão do Orquestrador e Implementação  

---

## 1. Sumário Executivo

A presente investigação técnica realizou um raio-x completo do módulo de Frigobar no repositório `Guest-Flow-Manager`, inspecionando o backend (`artifacts/api-server/demo-server.mjs`), os portais de gerenciamento e consumo (`minibar-admin.tsx` e `guest-minibar.tsx`) e a pasta de assets estáticos (`artifacts/limpeza/public/images/frigobar/`).

### Principais Descobertas:
1. **Diagnóstico dos Assets Atuais:** Existem exatamente 18 arquivos de imagem PNG (todos em resolução 1024x1024 px) na pasta `artifacts/limpeza/public/images/frigobar/`. No entanto, **praticamente todas as imagens retratam marcas fictícias e genéricas criadas por IA** (ex: *"REFRIGERANTE SODA"* imitando lata vermelha, *"DELÍCIA CHOCO"* em vez de Toddynho, *"BATATA ORIGINAL"* em vez de Pringles, e *"Chocolate Kinder Bueno"* exibindo pedaços de wafer soltos sem a embalagem icônica).
2. **Mapeamento para Marcas Reais:** Todos os 18 itens do catálogo ativo + os 2 itens do Kit de Boas-Vindas (Amendoim Mendorato e Água em Copo selado da Anserve) foram mapeados com precisão para marcas comerciais consagradas no mercado brasileiro, com volumes, fabricantes e especificações de embalagem.
3. **Padrão Fotográfico Rigoroso:** Definidas as especificações exatas para o padrão e-commerce premium: proporção 1:1 (1024x1024), fundo branco puro isolado (`#FFFFFF`), iluminação de estúdio 5500K sem sombras duras, ângulo frontal levemente inclinado (~10-15° de elevação) exibindo tanto o rótulo principal quanto a tampa/lacre, e sombra de contato suave (*ambient occlusion*) na base.
4. **Arquitetura da Galeria de Validação (R2):** Projetada uma sub-visão dedicada (`galeria_marcas`) integrada à aba `catalogo` em `minibar-admin.tsx`, contendo cards de comparação lado a lado (Legado vs Proposta Real), modal de zoom em alta resolução, seletor de marcas alternativas e fluxo de aprovação explícita em lote ou individual antes da publicação definitiva.
5. **Alerta Crítico de Integridade Backend:** Identificada trava rígida em `artifacts/api-server/demo-server.mjs` (linhas 11169 e 11434) que verifica `db.minibarProducts.length !== 18`. Qualquer alteração na quantidade de produtos sem adaptar essa linha provocará reset automático para o catálogo padrão.

---

## 2. Mapeamento das Estruturas de Dados do Catálogo de Frigobar

### 2.1 Backend (`artifacts/api-server/demo-server.mjs`)

No servidor backend, o catálogo de produtos é definido na função `getDefaultMinibarProducts()` (linhas 1495 a 1768) e armazenado no estado em memória `db.minibarProducts` (persistido via PostgreSQL na tabela `system_store` chave `db_state`).

#### Schema do Produto (`MinibarProduct`):
```typescript
interface MinibarProduct {
  id: string;                     // ex: "prod_achocolatado", "prod_refrigerante"
  name: string;                   // Nome exibido no cardápio
  category: "Bebidas" | "Petiscos"; // Categoria principal
  price: number;                  // Preço de venda ao hóspede (R$)
  cost: number;                   // Custo de reposição devido à Anserve (R$)
  defaultQuantity: number;        // Quantidade nominal de gabarito por flat
  imageUrl: string;               // Caminho estático (/images/frigobar/*.png)
  description: string;            // Descrição breve do produto
  active: boolean;                // Se está ativo no cardápio
  isCourtesy: boolean;            // Se é item de cortesia (R$ 0,00)
  courtesyLimitPerStay?: number;  // Limite de cortesia por estadia
  extraPaidProductId?: string | null; // ID do produto pago excedente
  sortOrder: number;              // Ordem de exibição na interface
  createdAt: string;              // Timestamp ISO 8601
  updatedAt: string;              // Timestamp ISO 8601
}
```

#### Endpoints de API Mapeados:
- `GET /api/minibar/products`: Retorna a lista de produtos (filtra `active !== false` para hóspedes e omite `cost` quando o usuário não é administrador).
- `POST /api/minibar/products`: Criação de novo item (requer permissão de admin).
- `PATCH /api/minibar/products/:id`: Atualização de campos do produto (nome, categoria, preço, custo, `imageUrl`, `description`, etc.).
- `DELETE /api/minibar/products/:id`: Soft delete (`active: false`).
- `GET /api/minibar/default-stock`: Retorna o gabarito padrão global (`minibarDefaultStock.globalTemplate`) com as quantidades padrão por flat.

#### ⚠️ Alerta de Trava Rígida no Backend (Linhas 11169 e 11434):
No bootstrap e hidratação do banco de dados em `demo-server.mjs`:
```javascript
if (!Array.isArray(db.minibarProducts) || db.minibarProducts.length === 0 || db.minibarProducts.length !== 18 || !db.minibarProducts.some(p => p.id === "prod_achocolatado")) {
  db.minibarProducts = getDefaultMinibarProducts();
}
if (!db.minibarDefaultStock || !Array.isArray(db.minibarDefaultStock.globalTemplate) || db.minibarDefaultStock.globalTemplate.length !== 18 || !db.minibarDefaultStock.globalTemplate.some(t => t.productId === "prod_achocolatado")) {
  db.minibarDefaultStock = getDefaultMinibarStock();
}
```
**Impacto:** Se forem adicionados novos SKUs (como o amendoim Mendorato do Kit de Boas-Vindas), essa verificação de `length !== 18` forçará a reinicialização de `db.minibarProducts`. **Recomendação:** A equipe de backend deve flexibilizar ou atualizar esse contador para 19 ou 20 itens no momento da inclusão dos itens do Kit de Boas-Vindas.

---

### 2.2 Frontend (`artifacts/limpeza/src/`)

1. **Painel Administrativo (`artifacts/limpeza/src/pages/minibar-admin.tsx`):**
   - Rota: `/frigobar-admin` (e aliases `/frigobar`, `/minibar-admin`, `/admin/frigobar`).
   - Linhas 1085-1107: Tabs principais (`insights`, `catalogo`, `equipe`, `extrato`).
   - Linhas 1728-1865: Aba `catalogo` com sub-visões alternadas por botão (`catalogSubView === "produtos"` e `catalogSubView === "gabarito"`).
   - Renderização dos cards: Linhas 1813-1819 exibem `<img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-2xl object-cover shrink-0" />`.

2. **Portal do Hóspede (`artifacts/limpeza/src/pages/guest-minibar.tsx`):**
   - Rota: `/frigobar/:flatNumber` (e `/minha-reserva/:code/frigobar`).
   - Linhas 2160-2180: Container de imagem com fundo branco forçado:
     ```tsx
     <div className="w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden shadow-inner bg-white border-slate-700/50">
       <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-contain p-0.5" />
     </div>
     ```
   - **Conclusão de Design:** Como o portal do hóspede utiliza um container com `bg-white`, imagens sem fundo branco puro geram bordas acinzentadas antiestéticas. Com a padronização `#FFFFFF`, o produto se funde perfeitamente ao container.

---

## 3. Arquitetura de Entrega de Imagens (Serving Pipeline)

1. **Repositório de Origem:** `artifacts/limpeza/public/images/frigobar/`
2. **Build Vite:** Durante o processo de build do frontend (`npm run build` na pasta `artifacts/limpeza`), os arquivos de `artifacts/limpeza/public/` são copiados integralmente para `artifacts/limpeza/dist/public/` (ou `dist/`).
3. **Servidor Express:** Em `artifacts/api-server/demo-server.mjs` (linhas 72243 e 72254), o Express entrega arquivos estáticos com:
   ```javascript
   app.use(express.static(distPath, { maxAge: '1d' }));
   app.use(express.static(fallbackDistPath));
   ```
4. **Resolução de URLs no Navegador:**
   O navegador requisita URLs relativas como `/images/frigobar/refrigerante.png`. O Express atende a requisição diretamente a partir do diretório de assets públicos.
5. **Mitigação de Cache do Navegador (Cache-Busting):**
   Para evitar que clientes ou recepcionistas vejam imagens antigas em cache local após a atualização das fotos, é recomendada a adoção de query string de versão (ex: `/images/frigobar/refrigerante.png?v=2`) ou nomes semânticos versionados (ex: `/images/frigobar/coca_cola_350ml.png`).

---

## 4. Mapeamento Completo dos Produtos para Marcas Comerciais Reais

A tabela abaixo detalha cada um dos 18 produtos atuais do frigobar + os 2 itens do Kit de Boas-Vindas (R3), confrontando a situação atual (genérica/fictícia) com a especificação da marca comercial real aprovada:

| # | ID do Produto | Nome no Sistema | Categoria | Venda / Custo | Imagem Atual (`/images/frigobar/`) | Diagnóstico Visual Atual | Marca Comercial Real Proposta | Embalagem & Volume Oficial | Fabricante / Detentor |
|---|---|---|---|---|---|---|---|---|---|
| **01** | `prod_achocolatado` | Achocolatado | Bebidas | R$ 12,00 / R$ 6,00 | `achocolatado.png` | Fictícia: *"DELÍCIA CHOCO"* | **Toddynho Tradicional** | Caixa cartonada Tetra Pak 200ml com canudo acoplado | PepsiCo do Brasil |
| **02** | `prod_agua_mineral_copo` | Água Mineral Copo | Bebidas | R$ 5,00 / R$ 2,00 | `agua_mineral_copo.png` | Fictícia: *"Fonte Pureza 200ml"* | **Água Mineral Crystal Copo** *(ou Lindoya / Levity)* | Copo plástico selado 200ml com tampa metálica | Coca-Cola FEMSA / Anserve |
| **03** | `prod_agua_mineral_garrafa` | Água Mineral Garrafa | Bebidas | R$ 7,00 / R$ 3,00 | `agua_mineral_garrafa.png` | Fictícia: *"Fonte Natural 500ml"* | **Água Mineral Crystal Sem Gás** *(ou Minalba / Bonafont)* | Garrafa PET cristalina 500ml com tampa azul | Coca-Cola FEMSA |
| **04** | `prod_cerveja_long_neck` | Cerveja Long Neck | Bebidas | R$ 20,00 / R$ 9,00 | `cerveja_long_neck.png` | Fictícia: *"Brewery Long Neck 330ml"* | **Cerveja Heineken Puro Malte** | Garrafa Long Neck de vidro verde 330ml com estrela vermelha | Heineken Brasil |
| **05** | `prod_energetico` | Energético | Bebidas | R$ 28,00 / R$ 12,00 | `energetico.png` | Fictícia: *"ENERGÉTICO 250ml"* | **Red Bull Energy Drink** | Lata sleek de alumínio 250ml azul e prata | Red Bull GmbH |
| **06** | `prod_refrigerante` | Refrigerante | Bebidas | R$ 12,00 / R$ 5,00 | `refrigerante.png` | Fictícia: *"REFRIGERANTE SODA"* | **Coca-Cola Original** *(opção: Coca-Cola Sem Açúcar)* | Lata de alumínio tradicional 350ml vermelha com logo oficial | The Coca-Cola Company |
| **07** | `prod_smirnoff_ice` | Smirnoff Ice | Bebidas | R$ 28,00 / R$ 13,00 | `smirnoff_ice.png` | Recreação genérica | **Smirnoff Ice Original** | Garrafa Long Neck de vidro 275ml com tampa prata | Diageo |
| **08** | `prod_suco_fruta` | Suco de Fruta | Bebidas | R$ 12,00 / R$ 5,00 | `suco_fruta.png` | Fictícia: *"SUCO DE FRUTA Néctar"* | **Suco Del Valle Néctar Laranja / Pêssego** | Garrafa de vidro 290ml ou lata sleek 290ml | The Coca-Cola Company |
| **09** | `prod_suco_uva_integral` | Suco de Uva Integral | Bebidas | R$ 25,00 / R$ 12,00 | `suco_uva_integral.png` | Mismatch: Imagem exibe garrafa de 1L, texto diz 300ml | **Suco de Uva Tinto 100% Integral Aurora** | Garrafa de vidro escura 300ml com tampa preta | Vinícola Aurora |
| **10** | `prod_barra_cereal` | Barra de Cereal | Petiscos | R$ 12,00 / R$ 4,50 | `barra_cereal.png` | Fictícia: *"NATURAL HARVEST"* | **Barra de Cereal Nutry Aveia, Castanhas e Mel** | Embalagem flow-pack metalizada individual 22g | Nutimental |
| **11** | `prod_batata` | Batata | Petiscos | R$ 28,00 / R$ 12,00 | `batata.png` | Fictícia: *"BATATA ORIGINAL"* | **Batata Pringles Original** *(ou Ruffles 76g)* | Tubo cilíndrico vermelho 114g / 40g com tampa transparente | Kellogg Company |
| **12** | `prod_biscoito_salgado` | Biscoito Salgado | Petiscos | R$ 12,00 / R$ 5,00 | `biscoito_salgado.png` | Fictícia: *"FORNO DO BRASIL"* | **Biscoito Salgado Club Social Original** | Pacote clássico vermelho com crackers crocantes (24g individual / 144g) | Mondelez International |
| **13** | `prod_castanha_caju` | Castanha de Caju | Petiscos | R$ 14,00 / R$ 6,00 | `castanha_caju.png` | Fictícia: *"NATURÉL"* | **Castanha de Caju Torrada e Salgada DaColônia** *(ou Yoki)* | Pouch stand-up 50g preto e dourado com visor | DaColônia Alimentos |
| **14** | `prod_chiclete` | Chiclete | Petiscos | R$ 8,00 / R$ 3,00 | `chiclete.png` | Fictícia: *"CHICLETE MENTHA"* | **Goma de Mascar Trident Hortelã / Menta Verde** | Envelope verde característico sem açúcar (8g, 5 unidades) | Mondelez International |
| **15** | `prod_chocolate` | Chocolate | Petiscos | R$ 12,00 / R$ 5,00 | `chocolate.png` | Fictícia: *"DELIGHTS MILK CHOCOLATE"* | **Chocolate Nestlé Classic Ao Leite** *(ou Lacta Ao Leite)* | Tablete retangular em embalagem lacrada vermelha 80g | Nestlé Brasil |
| **16** | `prod_chocolate_kinder_bueno` | Chocolate Kinder Bueno | Petiscos | R$ 26,00 / R$ 12,00 | `chocolate_kinder_bueno.png` | **Defeituosa:** Exibe wafer quebrado na mesa, sem embalagem | **Chocolate Kinder Bueno Tradicional Duplo** | Embalagem flow-pack oficial branca e vermelha lacrada 43g | Ferrero Rocher |
| **17** | `prod_chocolate_kitkat_snickers` | Chocolate Kit Kat / Snickers | Petiscos | R$ 16,00 / R$ 7,00 | `chocolate_kitkat_snickers.png` | Montagem com dois produtos de marcas rivais soltos | **Chocolate KitKat 4-Finger Milk** *(ou Snickers 45g padronizado)* | Flow-pack vermelho oficial KitKat 41,5g com 4 tabletes | Nestlé Brasil |
| **18** | `prod_cookies` | Cookies | Petiscos | R$ 12,00 / R$ 5,00 | `cookies.png` | Fictícia: *"GRANDMA'S OWN"* | **Cookies Bauducco Tradicional com Gotas de Chocolate** | Pacote amarelo brilhante 100g / 40g com gotas de chocolate | Bauducco |
| **19** *(R3)* | `prod_cortesia_amendoim_mendorato` | Amendoim Mendorato (Cortesia) | Kit de Boas-Vindas | R$ 0,00 / R$ 0,00 | *(novo asset)* | Novo item exigido em R3 (fornecimento próprio hotel) | **Amendoim Dourado Japonês Mendorato** | Pacote metalizado amarelo/dourado 27g lacrado | Santa Helena |
| **20** *(R3)* | `prod_cortesia_agua_copo` | Água Mineral Copo (Cortesia) | Kit de Boas-Vindas | R$ 0,00 / R$ 2,00 | *(novo asset ou compartilhado)* | Novo item exigido em R3 (estoque e repasse Anserve) | **Água Mineral Copo Selado 200ml Crystal** *(ou Levity / Minalba)* | Copo plástico selado com selo oficial de alumínio 200ml | Coca-Cola FEMSA / Anserve |

---

## 5. Especificações de Padronização Visual e Fotográfica

Para assegurar que o cardápio do frigobar tenha acabamento idêntico ao dos melhores portais de hospitalidade e e-commerce do mundo (como Nespresso, Apple e grandes redes hoteleiras), todas as novas imagens devem respeitar rigorosamente os seguintes parâmetros:

### 5.1 Parâmetros Técnicos de Arquivo
- **Formato:** PNG (24-bit ou 32-bit com transparência / fundo `#FFFFFF`).
- **Resolução de Renderização:** 1024 x 1024 pixels (proporção 1:1, perfeitamente quadrada).
- **Densidade:** 72 a 150 DPI (otimizado para web, mantendo nitidez absoluta em telas Retina / 4K).
- **Peso do Arquivo:** Entre 400 KB e 1.2 MB por imagem (sem compressão com perdas que degrade logotipos ou textos dos rótulos).

### 5.2 Composição e Enquadramento Espacial
- **Plano de Fundo:** Branco sólido puro absoluto (`#FFFFFF`, RGB `255, 255, 255`). Nenhum degradê, nenhuma vinheta acinzentada, nenhum reflexo espelhado artificial.
- **Área Útil do Produto (Framing):** O produto deve ocupar entre **72% e 80% da altura e largura da tela**, mantendo uma margem de respiro (*padding*) periférico consistente de ~10% a 14% em todas as laterais. Isso garante equilíbrio visual quando uma garrafa esguia (ex: Heineken 330ml) é exibida ao lado de um pacote retangular (ex: Club Social) ou um copo largo.
- **Posicionamento:** Perfeitamente centralizado no eixo horizontal (X) e alinhado no terço inferior no eixo vertical (Y) para acomodar a sombra de contato.

### 5.3 Ângulo de Câmera e Perspectiva
- **Ângulo Frontal Superior (~12° a 15° de elevação):** A câmera fica posicionada na altura do produto com leve inclinação para baixo. Essa angulação permite que o hóspede visualize simultaneamente a face frontal do produto (com o logotipo da marca nítido e legível) e a parte superior (tampa de rosca, lacre de alumínio, anel da lata ou topo da embalagem).
- **Lente / Distorção:** Distância focal equivalente a 85mm a 105mm (teleobjetiva de estúdio comercial), eliminando distorções de grande angular e mantendo as linhas verticais retas e paralelas.

### 5.4 Iluminação e Sombras
- **Setup de Iluminação:** Iluminação difusa de três pontos (*key light*, *fill light* suave e sutil *rim light* para descolar o produto do fundo branco).
- **Temperatura de Cor:** 5500 Kelvin (Luz do dia neutra balanceada), reproduzindo fielmente as cores originais das marcas (o vermelho da Coca-Cola, o verde da Heineken, o azul do Red Bull).
- **Sombra de Contato (*Contact / Ambient Occlusion Shadow*):** Sombra suave e difusa projetada diretamente embaixo da base do produto, estendendo-se por não mais que 20-30 pixels e dissipando-se de forma 100% natural até o branco `#FFFFFF`. Nenhuma sombra dura projetada para trás ou para o lado.

### 5.5 Estado do Produto e Embalagem
- **Condição:** Embalagem comercial de varejo 100% fechada, lacrada, sem amassados, vincos ou imperfeições.
- **Legibilidade:** O nome da marca, o sabor e o volume líquido devem estar perfeitamente legíveis na foto principal.

---

## 6. Arquitetura e Design da Galeria de Validação / Painel de Homologação (R2)

### 6.1 Posicionamento Estratégico na Interface
Para que o gestor da CorpFlats possa auditar e homologar previamente as novas fotos antes de elas irem para o catálogo de produção, a galeria de validação deve ser posicionada dentro de:
**`artifacts/limpeza/src/pages/minibar-admin.tsx`** na aba **`catalogo`** (`TabsContent value="catalogo"`).

Adiciona-se uma terceira opção ao seletor de sub-visões (atualmente composto por *"Produtos, Preços & Cortesias"* e *"Quantidade Padrão por Flat"*):
```tsx
<button
  type="button"
  onClick={() => setCatalogSubView("galeria_marcas")}
  className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
    catalogSubView === "galeria_marcas"
      ? "bg-amber-600 text-white shadow-sm"
      : "bg-muted/60 text-muted-foreground hover:text-foreground"
  }`}
>
  <Camera className="w-4 h-4" />
  <span>Validação de Marcas Reais ({approvedCount}/{totalCount})</span>
  {pendingCount > 0 && (
    <Badge className="bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded-full">
      {pendingCount} pendentes
    </Badge>
  )}
</button>
```

Além disso, enquanto houver fotos aguardando aprovação explícita, exibe-se um **Banner Notificador de Homologação** no topo da página:
> *"📸 **Homologação Visual das Marcas Reais:** 18 novas fotos com marcas comerciais padronizadas sobre fundo branco aguardam sua revisão e aprovação antes do lançamento definitivo."* [Botão: **Revisar Agora ➔**]

---

### 6.2 Componentes e Layout do Painel de Homologação

A sub-visão `galeria_marcas` é composta por 4 seções integradas:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  📸 Painel de Homologação de Fotos e Marcas Comerciais (CorpFlats Frigobar)       │
│  Status: 16 de 18 Aprovados • 2 Pendentes de Revisão                             │
│  [ ✅ Aprovar Todas em Lote ]  [ 🔄 Restaurar Padrões ]  [ 📄 Exportar Dossiê ]   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Filtros: [ Todas (18) ] [ Bebidas (9) ] [ Petiscos (9) ] [ Kit Boas-Vindas (2) ] │
│  Status:  [ Todos ] [ ✅ Aprovados ] [ ⏳ Pendentes ] [ 🔄 Troca Solicitada ]    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  GRID DE CARDS COMPARATIVOS (LADO A LADO):                                       │
│                                                                                  │
│  ┌─ Card de Produto: prod_achocolatado ────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │   [ Foto Atual ]                 [ Foto Proposta (Nova) ]                 │  │
│  │   ┌───────────────┐              ┌────────────────────────┐                │  │
│  │   │ ❌ Delícia    │      ➔       │ ✅ Toddynho Original   │                │  │
│  │   │   Choco       │              │    Tetra Pak 200ml     │                │  │
│  │   │ (Genérica IA) │              │    (Fundo #FFFFFF)     │                │  │
│  │   └───────────────┘              └────────────────────────┘                │  │
│  │                                  [ 🔍 Zoom Alta Resolução ]                │  │
│  │                                                                            │  │
│  │   Produto: Achocolatado                                                    │  │
│  │   Marca Selecionada: Toddynho Tradicional 200ml (PepsiCo)                  │  │
│  │   Status: [ ✅ APROVADO ]                                                   │  │
│  │                                                                            │  │
│  │   Ações: [ ✅ Aprovar Foto ]   [ 🔄 Trocar Marca... ]                      │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

#### Elementos de Cada Card de Produto:
1. **Comparação Visual Lado a Lado:**
   - **Coluna Esquerda (Foto Atual):** Miniatura com badge sutil *"Foto Atual (Legado)"*, com indicação do ponto fraco (ex: *"Marca fictícia"* ou *"Produto fora da embalagem"*).
   - **Coluna Direita (Foto Proposta):** Pré-visualização ampla da nova foto comercial real sobre fundo branco puro, com badge verde *"Nova Marca Comercial"*.
   - **Ícone de Lupa / Zoom:** Ao clicar, abre modal com a imagem em resolução total 1024x1024 para inspeção milimétrica de detalhes do rótulo e textura.
2. **Ficha Técnica da Marca:**
   - Nome comercial exato: ex: *"Toddynho Tradicional 200ml"*.
   - Fabricante: ex: *"PepsiCo do Brasil"*.
   - Tipo de Embalagem e Gramatura: ex: *"Tetra Pak com canudo acoplado"*.
   - Preço de Venda / Custo de Repasse: R$ 12,00 / R$ 6,00.
3. **Controles Interativos:**
   - **Botão "Aprovar Foto":** Alterna o status do item para homologado (`approved: true`).
   - **Botão "Trocar Marca...":** Abre o modal de substituição onde o usuário pode selecionar uma marca alternativa pré-cadastrada (ex: trocar *Toddynho* por *Nescau Prontinho*, ou trocar *Heineken* por *Stella Artois* / *Amstel*, ou trocar *Pringles* por *Ruffles*).
   - **Badge de Status:** `Aprovado para Produção` (Verde), `Aguardando Aprovação` (Amarelo) ou `Troca Solicitada` (Azul).

---

### 6.3 Fluxo de Homologação e Aplicação Definitiva

Para garantir total conformidade com o Requisito R2 ("aguardando aprovação explícita do usuário para eventuais trocas antes da implantação final"):

1. **Estado Inicial de Homologação:**
   - Uma estrutura de dados local ou persistida em `db.minibarSettings.proposedImagesReview` armazena o estado de cada foto proposta:
     ```typescript
     interface PhotoValidationItem {
       productId: string;
       productName: string;
       currentImageUrl: string;
       proposedImageUrl: string;
       brandName: string;
       manufacturer: string;
       volumeOrWeight: string;
       alternativeBrands: Array<{ brandName: string; imageUrl: string; manufacturer: string }>;
       status: "approved" | "pending" | "swap_requested";
       notes?: string;
     }
     ```
2. **Aprovação Parcial ou Total:**
   - O gestor pode aprovar item a item ou clicar em *"Aprovar Todas as Fotos Propostas em Lote"*.
3. **Efetivação no Catálogo:**
   - Somente após o usuário confirmar a aprovação, o sistema aciona a rotina que atualiza o campo `imageUrl` de cada produto em `db.minibarProducts` e sincroniza o gabarito. Se o usuário solicitar troca de marca, o item permanece com a foto legada até que a nova opção escolhida seja gerada e aprovada.

---

## 7. Relação com os Requisitos Posteriores (R3 a R6)

Durante a investigação, foram identificadas interdependências diretas com os requisitos de governança e fechamento financeiro:

1. **Requisito R3 (Kit de Boas-Vindas no Cardápio):**
   - Os 2 itens de cortesia (Água Mineral Copo e Amendoim Mendorato) devem ser fotografados seguindo o mesmo padrão rigoroso de estúdio com fundo `#FFFFFF` (1024x1024) para compor a seção de destaque no topo do cardápio do hóspede (`guest-minibar.tsx`).
2. **Requisito R4 (Conferência da Repositora):**
   - A repositora no painel Anserve (`anserve-restock.tsx`) verá as mesmas miniaturas padronizadas de marcas reais ao registrar as unidades consumidas de cada item (0 a 2 copos e 0 a 2 amendoins).
3. **Requisito R6 (Repasse Financeiro à Anserve):**
   - O item `Água Mineral Copo` já possui `cost: 2.00` registrado no backend. Ao ser consumido como cortesia do kit, esse custo unitário será a base de cálculo do repasse devido pelo hotel à Anserve, enquanto o amendoim Mendorato terá fornecimento próprio, sem débito com a Anserve.

---

## 8. Conclusão e Próximos Passos Recomendados

A investigação dos Requisitos R1 e R2 está concluída com 100% de cobertura técnica. A estrutura do catálogo foi integralmente mapeada, todas as marcas comerciais foram identificadas e descritas com precisão de SKU, as especificações fotográficas foram padronizadas e a interface do Painel de Homologação foi detalhada.

**Próxima Etapa:** Handoff para o agente orquestrador / implementador para proceder com:
1. Geração/preparação dos assets fotográficos padronizados (1024x1024 PNG `#FFFFFF`).
2. Implementação da sub-visão `galeria_marcas` em `minibar-admin.tsx` com suporte a comparação lado a lado e aprovação do usuário.
3. Ajuste preventivo da trava `length !== 18` em `artifacts/api-server/demo-server.mjs` para acomodar os itens de cortesia do Kit de Boas-Vindas.
