# Relatório de Investigação Técnica — Explorer Survey 2
**Mapeamento da Arquitetura do Frontend Mobile do Hóspede & Rotas de Autoatendimento do Frigobar**
**Data/Hora**: 2026-10-21T18:45:00Z  
**Autor**: explorer_survey_2 (Teamwork Explorer)  
**Projeto**: Guest-Flow-Manager (CorpFlats Soho Residence & Anserve)  

---

## 1. Resumo Executivo

O objetivo desta investigação foi mapear e desenhar com precisão cirúrgica a arquitetura do **Frontend Mobile do Hóspede** e as rotas de autoatendimento para o ecossistema de Frigobar (venda, consumo e emissão fiscal separada da hospedagem), integrando-o ao ecossistema existente do Guest-Flow-Manager sem quebrar nenhuma funcionalidade em operação.

### Principais Conclusões:
1. **Roteamento no Wouter (`App.tsx`)**: As rotas públicas do portal do hóspede operam sem autenticação de sessão (`AdminGuard`/`StaffGuard`), mas com autenticação por contexto (código de reserva ou token do flat). No Wouter, rotas mais específicas (ex: `/minha-reserva/:code/frigobar`) **devem obrigatoriamente preceder** rotas genéricas (`/minha-reserva/:code`) para evitar colisões de pattern matching.
2. **Dupla Experiência de Acesso Mobile**:
   - **Via QR Code no Flat (`/frigobar/flat/:flatNumber`)**: Apresenta tela de boas-vindas com desafio de segurança (últimos 4 dígitos do telefone cadastrado na reserva), validado via `POST /api/minibar/flat-context`, culminando em saudação calorosa personalizada pelo primeiro nome do hóspede.
   - **Via Link Direto ou Portal (`/minha-reserva/:code/frigobar`)**: Dispensa o desafio dos 4 dígitos, pois a reserva já está autenticada pelo código unívoco (`:code`), carregando imediatamente o catálogo e saudações.
3. **Padrão Não-Editável do Flat ("Padrão no flat: X un.")**: Elemento visual central no card de cada produto que permite ao hóspede conferir o estoque inicial deixado no flat e deduzir facilmente quantas unidades consumiu (ex: "Havia 4 águas, sobrou 1 -> consumi 3"), prevenindo erros e divergências na reposição da Anserve.
4. **Checkout Fiscal Inteligente (3 Descrições de NF)**: Atende à demanda crítica de faturamento corporativo, permitindo escolher entre:
   - *(a) Discriminar todos os itens* (detalhado);
   - *(b) Lançar como "Água"* (para hóspedes a trabalho cujas empresas vedam bebidas alcoólicas/doces em despesas);
   - *(c) Lançar como "Consumo de Frigobar"* (genérico consolidado).
   E permite alternar entre o CPF do hóspede ou informar outro CPF/CNPJ de empresa para a nota fiscal.
5. **Gateway de Pagamento Integrado**:
   - **PIX (Banco Inter)**: Geração de QR Code e Copia e Cola, com polling de verificação a cada 2.5s e tela de celebração imediata.
   - **Cartão de Crédito (Mercado Pago)**: Link seguro com polling de retorno.
6. **Compilação Vite e Tipagem**: O comando de produção do projeto (`npm --prefix artifacts/limpeza run build`) executa `vite build` com Rollup, gerando artefatos em `artifacts/limpeza/dist/public` em ~30 segundos com sucesso (código 0). O novo módulo deve ser escrito com TypeScript estrito, garantindo zero impacto nos builds contínuos de deploy no Render.

---

## 2. Análise do Roteamento em `artifacts/limpeza/src/App.tsx`

### 2.1 Estrutura Atual de Rotas Públicas
Em `artifacts/limpeza/src/App.tsx`, as páginas públicas destinadas a hóspedes e colaboradores externos estão alocadas entre as linhas 287 e 342, isoladas de qualquer guarda de permissão (`AdminGuard`, `DevGuard`, `StaffGuard` ou `ReceptionGuard`):

```tsx
// Trecho de App.tsx (linhas 287–312)
{/* Public Booking Engine & Guest Hub */}
<Route path="/reservar" component={BookingEngine} />
<Route path="/booking" component={BookingEngine} />
<Route path="/minha-conta" component={MyAccount} />
...
<Route path="/minha-reserva/:code/cafe" component={GuestBreakfast} />
<Route path="/minha-reserva/:code/room-service" component={GuestBreakfast} />
<Route path="/portal-hospede/:code/cafe" component={GuestBreakfast} />
<Route path="/guest-portal/:code/cafe" component={GuestBreakfast} />
<Route path="/minha-reserva/:code" component={GuestPortalWrapper} />
<Route path="/minha-reserva" component={GuestPortalWrapper} />
...
<Route path="/minha-reserva/:code/checkout" component={GuestCheckout} />
```

### 2.2 Regra de Precedência do Wouter
No roteador `wouter` (v3.3.5), o matching de rotas é avaliado de cima para baixo dentro do componente `<Switch>`.
- Se a rota genérica `<Route path="/minha-reserva/:code" component={GuestPortalWrapper} />` for posicionada **antes** de `<Route path="/minha-reserva/:code/frigobar" component={GuestMinibar} />`, o Wouter capturará a URL `/minha-reserva/RES-605/frigobar` atribuindo `code = "RES-605/frigobar"` ou renderizará o componente genérico de forma errônea.
- Portanto, **todas as sub-rotas com `:code/...` (como `/cafe`, `/checkout` e o novo `/frigobar`) devem preceder obrigatoriamente a rota base `/minha-reserva/:code`**.

### 2.3 Estrutura de Rotas Recomendada para o Frigobar
Para garantir total flexibilidade para os hóspedes (tanto ao escanear o QR code impresso no frigobar quanto ao clicar em links no WhatsApp ou no Portal), devem ser registradas as seguintes rotas públicas em `App.tsx`:

```tsx
{/* ── Public Minibar / Frigobar Guest Routes ── */}
{/* 1. Rotas de Sub-página por Código de Reserva (Link Direto / Portal / WhatsApp) */}
<Route path="/minha-reserva/:code/frigobar" component={GuestMinibar} />
<Route path="/minha-reserva/:code/minibar" component={GuestMinibar} />
<Route path="/portal-hospede/:code/frigobar" component={GuestMinibar} />
<Route path="/guest-portal/:code/frigobar" component={GuestMinibar} />

{/* 2. Rotas de Acesso por QR Code Físico no Flat */}
<Route path="/frigobar/flat/:flatNumber" component={GuestMinibar} />
<Route path="/frigobar/:flatNumber" component={GuestMinibar} />
<Route path="/minibar/flat/:flatNumber" component={GuestMinibar} />
<Route path="/minibar/:flatNumber" component={GuestMinibar} />

{/* 3. Rota Raiz de Autoatendimento com Formulário de Busca */}
<Route path="/frigobar" component={GuestMinibar} />
<Route path="/minibar" component={GuestMinibar} />
```

### 2.4 Ponto de Integração em `guest-portal.tsx`
No portal do hóspede (`artifacts/limpeza/src/pages/guest-portal.tsx`), já existem cards modulares para cada aspecto da hospedagem:
- Linha 2244: Resumo da Reserva e Boas-Vindas
- Linha 2594: Confirmação Financeira e Pagamento da Diária
- Linha 2629: Acesso ao Flat e Chave Digital
- Linha 3228: Cardápio do Café da Manhã (`hasBreakfast`)
- Linha 3341: Rede Wi-Fi & Senha

**Proposta de Inserção do Card de Frigobar**:
Inserir o Card do Frigobar logo após o bloco do Café da Manhã (linha 3338) e antes da Rede Wi-Fi (linha 3341), além de adicionar o atalho no menu superior `DropdownMenuContent` (linha 1860).

**Mockup Estrutural do Card em `guest-portal.tsx`**:
```tsx
{/* ── Card: Frigobar & Autoatendimento no Flat ── */}
<Card className="bg-gradient-to-b from-cyan-50/50 via-white to-cyan-50/20 border border-cyan-200/70 rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-200/50 pb-3.5">
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-2xl bg-cyan-100/70 text-cyan-700 border border-cyan-200/60 flex items-center justify-center shrink-0 shadow-2xs">
        <Refrigerator className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
          Frigobar & Autoatendimento
        </h2>
        <span className="text-xs text-cyan-950/80 font-medium block mt-0.5">
          Bebidas geladas, cervejas, cafés especiais e snacks disponíveis no seu flat
        </span>
      </div>
    </div>
    <div className="flex items-center self-start sm:self-auto">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-100/60 border border-cyan-200/50 text-cyan-800 text-xs font-semibold shrink-0">
        🧊 Autoatendimento 24h
      </span>
    </div>
  </div>

  <div className="text-xs text-slate-600 leading-relaxed space-y-2">
    <p>
      Consuma livremente durante a sua estadia. Selecione os itens consumidos para efetuar o pagamento instantâneo via PIX ou Cartão.
    </p>
    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <span>O consumo de frigobar não pode ser faturado junto com o valor da diária de hospedagem. A cobrança e a nota fiscal são emitidas separadamente pela distribuidora conveniada.</span>
    </div>
  </div>

  <div className="flex flex-col sm:flex-row gap-2.5 pt-1 w-full">
    <Button
      onClick={() => setLocation(`/minha-reserva/${reservation.code || code}/frigobar`)}
      className="w-full h-auto min-h-12 py-2.5 px-4 bg-cyan-700 hover:bg-cyan-800 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm rounded-2xl shadow-sm inline-flex items-center justify-center gap-2.5 transition-all"
    >
      <Refrigerator className="w-5 h-5 shrink-0" />
      <span>Abrir Frigobar do Flat {reservation.flatNumber}</span>
      <ArrowRight className="w-5 h-5 shrink-0" />
    </Button>
  </div>
</Card>
```

---

## 3. Jornada Mobile do Hóspede (Especificação Passo a Passo)

A experiência mobile foi concebida para ser ágil, intuitiva e à prova de falhas em smartphones (telas de 360px a 430px de largura). O fluxo é dividido em 5 etapas funcionais:

```
[Entrada QR Code Flat]      [Entrada Link Reserva]
          │                           │
          ▼                           │
[Etapa 0: Verificação 4 Dígitos]      │
  • InputOTP (4 slots)                │
  • POST /api/minibar/flat-context    │
          │                           │
          └───────────┬───────────────┘
                      ▼
        [Etapa 1: Catálogo de Produtos]
          • Saudação personalizada ("Olá, Carlos!")
          • Aviso de Faturamento Separado (Destaque)
          • Indicador não-editável ("Padrão no flat: 4 un.")
          • Cortesias gratuitas destacadas (ex: Nespresso)
          • Controles de quantidade (- / +)
          • Seção retrátil de itens já pagos na estadia
          • Barra Fixa Inferior (Subtotal em tempo real)
                      │
                      ▼
        [Etapa 2: Checkout & Preferência Fiscal]
          • Resumo dos itens e valores
          • 3 Opções de Descrição na NF (Todos os itens / Água / Consumo Frigobar)
          • Documento: CPF cadastrado vs Outro CPF/CNPJ
          • E-mail para envio da NF (obrigatório)
                      │
                      ▼
        [Etapa 3: Interface de Pagamento]
          • Aba PIX (QR Code + Copia e Cola + Polling 2.5s)
          • Aba Cartão de Crédito (Mercado Pago Checkout Pro)
                      │
                      ▼
        [Etapa 4: Confirmação & Celebração]
          • Notificação de sucesso em tempo real
          • Envio automático da NF por WhatsApp e E-mail
```

### 3.1 Etapa 0: Verificação por QR Code no Flat
- **Gatilho**: Escaneamento do QR Code físico localizado na porta do frigobar do flat (ex: `/frigobar/flat/204`).
- **Problema resolvido**: Prevenção de consumo indevido ou lançamento acidental por terceiros que estejam no corredor ou que fotografaram o QR Code.
- **Componente**: `InputOTP` com `maxLength={4}` (usando slots de dígito numérico grande e teclado numérico nativo `inputMode="numeric"`).
- **Chamada de API**:
  - `POST /api/minibar/flat-context`
  - Payload: `{ flatNumber: "204", phoneLast4: "1234" }`
  - Retorno de Sucesso:
    ```json
    {
      "ok": true,
      "reservation": {
        "code": "RES-605",
        "flatNumber": "204",
        "guestName": "Carlos Eduardo Silva",
        "firstName": "Carlos",
        "guestPhone": "22998881234",
        "guestEmail": "carlos@empresa.com.br",
        "guestDocument": "123.456.789-00",
        "checkinDate": "2026-10-20",
        "checkoutDate": "2026-10-23",
        "status": "checked_in"
      },
      "previousOrders": [],
      "complimentaryAllowance": { "capsules": 2, "claimed": 2 }
    }
    ```
- **Persistência de Sessão**: Para evitar que o hóspede precise redigitar os 4 dígitos a cada reload da página, salvar no `sessionStorage`:
  `sessionStorage.setItem("gfm_minibar_auth_204", JSON.stringify({ code: "RES-605", ts: Date.now() }))`.

### 3.2 Etapa 1: Catálogo de Produtos e Indicador Visual Não-Editável
- **Saudação Calorosa**:
  "Olá, **Carlos**! 👋 Bem-vindo ao Frigobar do Flat **204**."
- **Aviso Obrigatório de Não-Faturamento Conjunto**:
  Banner destacado em tom âmbar com ícone `AlertTriangle`:
  > ⚠️ **Aviso de Faturamento:** O consumo do frigobar é gerido pela parceira Anserve e **não pode ser faturado junto com a diária de hospedagem**. A cobrança e a nota fiscal são emitidas separadamente da hospedagem.
- **Card de Produto com Indicador de Padrão**:
  * **Foto do produto**: Com fallback visual para placeholder quando não houver URL de imagem.
  * **Título e Categoria**: Nome em negrito e categoria em badge discreta (`bg-slate-100 text-slate-600`).
  * **Preço unitário**: `R$ 6,00`.
  * **🔒 INDICADOR NÃO-EDITÁVEL DO PADRÃO**:
    ```tsx
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200/80">
      <Package className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      <span>Padrão no flat: <strong>4 un.</strong></span>
    </div>
    ```
    *Efeito no usuário*: O hóspede olha para dentro do frigobar físico, conta que restam 2 águas e, olhando para o app, vê que o padrão é 4. Conclui imediatamente que consumiu 2 unidades.
  * **Itens de Cortesia**:
    Se o produto for elegível a cortesia de boas-vindas (ex: 2 cápsulas de Nespresso ou balas):
    - Se a reserva ainda não usufruiu da cortesia: exibir badge `✨ Cortesia de Boas-Vindas Inclusa (2 un.)`.
    - Unidades além da cota de cortesia entram automaticamente como item tarifado avulso.
- **Controles de Quantidade**:
  Botões circulares `-` e `+` com tamanho mínimo de toque de 40x40px, permitindo incrementar ou decrementar de forma ergonômica com o polegar.
- **Histórico de Consumos Anteriores**:
  Se a reserva possuir `previousOrders` com `status: "paid"`, renderizar um card retrátil (`Accordion`):
  > 📋 **Itens já pagos nesta estadia (Total: R$ 18,00)**  
  > • 2x Água Mineral sem Gás (Pago via PIX em 21/10 às 10:15)  
  > *Esses itens já foram quitados e não serão cobrados novamente.*
- **Barra Fixa Inferior (Sticky Bottom Bar)**:
  Fixada na base da tela (`fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t p-4 z-40 shadow-2xl`):
  - Esquerda: `Total a pagar: R$ 24,00 (3 itens)`
  - Direita: Botão `Avançar para Pagamento →` (habilitado apenas se total > 0).

### 3.3 Etapa 2: Checkout & Preferência Fiscal
Quando o hóspede toca em "Avançar para Pagamento", abre-se um modal ou gaveta (`Drawer` / `Sheet` no mobile) apresentando:
1. **Resumo do Pedido**: Tabela com itens, quantidades, valores unitários e total.
2. **Preferência de Descrição na Nota Fiscal**:
   Três botões estilo rádio/cards selecionáveis:
   - **(a) Discriminar todos os itens**: Lista exata de cada produto (ex: "2x Água sem gás, 1x Coca-cola, 1x Cerveja Heineken").
   - **(b) Lançar como "Água"**: Agrupa o valor total e descreve a nota inteira como fornecimento de água mineral. *(Fundamental para viajantes a trabalho que precisam comprovar despesa perante políticas empresariais estritas).*
   - **(c) Lançar como "Consumo de Frigobar"**: Descrição consolidada genérica.
3. **Documento para a Nota Fiscal**:
   - Opção 1: Manter CPF cadastrado do hóspede (`123.456.789-00`).
   - Opção 2: Informar outro CPF ou **CNPJ da Empresa** para faturamento corporativo, com campo de máscara dinâmica e botão de preenchimento automático de Razão Social via `/api/invoices/lookup-cnpj/:cnpj`.
4. **E-mail de Recebimento da NF**:
   Pré-preenchido com o e-mail da reserva; se vazio, campo obrigatório para recebimento do PDF e XML da nota fiscal emitida pela Anserve.

### 3.4 Etapa 3: Interface de Pagamento (PIX & Cartão)
Seletor com duas abas em destaque:
- **Aba PIX (Banco Inter - Recomendado / Instantâneo)**:
  * Exibe QR Code grande escaneável (`api.qrserver.com` ou base64 inline).
  * Campo de texto com código PIX Copia e Cola e botão "Copiar Código PIX" que copia para a área de transferência (`navigator.clipboard.writeText`) e exibe feedback tátil/visual imediato.
  * Polling ativo: a tela executa uma checagem a cada 2.500 ms em `GET /api/minibar/orders/:orderId/status`.
  * Indicador de pulsação suave: *"Aguardando confirmação bancária em tempo real..."*
- **Aba Cartão de Crédito (Mercado Pago)**:
  * Botão de checkout seguro do Mercado Pago: *"Pagar no Mercado Pago ↗"*.
  * Abre o ambiente do Mercado Pago em nova aba e mantém o polling na tela original para detecção do retorno com sucesso.

### 3.5 Etapa 4: Tela de Confirmação e Sucesso
Assim que o status do pedido transiciona para `"paid"`:
- Feedback visual com ícone de sucesso verde (`CheckCircle2`), animação suave e mensagem:
  > **Pagamento Confirmado com Sucesso! 🎉**  
  > Muito obrigado por registrar seu consumo no Flat **204**.  
  > Sua Nota Fiscal será emitida pela Anserve com a descrição solicitada (*{preferenciaSelecionada}*) e enviada para **{email}** e pelo seu **WhatsApp**.
- Botões de ação:
  - `Voltar à Minha Reserva` (redireciona para `/minha-reserva/:code`)
  - `Comprovante de Consumo`

---

## 4. Mapeamento de Componentes UI Reutilizáveis

Todos os componentes necessários para construir esta experiência de nível hoteleiro já estão presentes e homologados no projeto `artifacts/limpeza`:

| Categoria | Componente / Recurso | Arquivo / Origem | Finalidade no Módulo Frigobar |
|---|---|---|---|
| **shadcn/ui** | `InputOTP`, `InputOTPGroup`, `InputOTPSlot` | `@/components/ui/input-otp.tsx` | Tela de desafio de segurança dos 4 últimos dígitos do celular |
| **shadcn/ui** | `Card`, `CardContent`, `CardHeader` | `@/components/ui/card.tsx` | Cards de produtos, container principal e cards de resumo |
| **shadcn/ui** | `Button` | `@/components/ui/button.tsx` | Botões de ação (`+`, `-`, avançar, copiar PIX, pagar) |
| **shadcn/ui** | `Badge` | `@/components/ui/badge.tsx` | Indicador do padrão do flat, tag de cortesia e status da reserva |
| **shadcn/ui** | `Dialog`, `DialogContent`, `DialogHeader` | `@/components/ui/dialog.tsx` | Modal de checkout fiscal e modal de pagamento em desktops |
| **shadcn/ui** | `Drawer`, `DrawerContent` / `Sheet` | `@/components/ui/drawer.tsx` | Bottom sheet deslizante para checkout mobile |
| **shadcn/ui** | `RadioGroup`, `RadioGroupItem` | `@/components/ui/radio-group.tsx` | Seleção de descrição da NF (Discriminado, Água, Frigobar) |
| **shadcn/ui** | `Tabs`, `TabsList`, `TabsTrigger` | `@/components/ui/tabs.tsx` | Alternância de métodos de pagamento (PIX vs Cartão) |
| **shadcn/ui** | `Accordion`, `AccordionItem` | `@/components/ui/accordion.tsx` | Exibição colapsável de consumos anteriores já pagos |
| **shadcn/ui** | `Input`, `Label` | `@/components/ui/input.tsx` | Campos de CPF/CNPJ, Razão Social e E-mail da NF |
| **shadcn/ui** | `Skeleton` | `@/components/ui/skeleton.tsx` | Estados de carregamento do catálogo e validação |
| **shadcn/ui** | `Toaster` / `useToast` | `@/components/ui/toaster.tsx` | Notificações de código PIX copiado e erros de validação |
| **Lucide Icons** | `Refrigerator` | `lucide-react` | Ícone canônico de frigobar no menu e cabeçalhos |
| **Lucide Icons** | `Package`, `Sparkles`, `Coffee` | `lucide-react` | Indicador de padrão no flat e cortesias |
| **Lucide Icons** | `Plus`, `Minus`, `Trash2` | `lucide-react` | Controles ergonômicos de quantidade |
| **Lucide Icons** | `QrCode`, `Copy`, `CheckCircle2` | `lucide-react` | Fluxo PIX e tela de confirmação bancária |
| **Lucide Icons** | `CreditCard`, `ExternalLink` | `lucide-react` | Fluxo de cartão via Mercado Pago |
| **Lucide Icons** | `AlertTriangle`, `ShieldAlert` | `lucide-react` | Aviso de não faturamento junto com a hospedagem |
| **Lucide Icons** | `FileText`, `Receipt`, `Mail` | `lucide-react` | Seção de faturamento e dados fiscais |
| **Tailwind CSS** | Utilitários de Layout Mobile | `@tailwindcss/vite` | `rounded-3xl`, `backdrop-blur-md`, `fixed bottom-0`, `min-h-12` |

---

## 5. Análise do Fluxo de Compilação Vite e Tipagem

### 5.1 Pipeline de Build (`vite.config.ts`)
O arquivo `artifacts/limpeza/vite.config.ts` configura o bundle de produção:
- **Base path**: `base: process.env.BASE_PATH || '/'`
- **Output**: `artifacts/limpeza/dist/public`
- **Rollup output naming**:
  - `entryFileNames: 'assets/index.js'`
  - `assetFileNames (css): 'assets/index.css'`
  - `chunkFileNames: 'assets/[name]-[hash].js'`
- **Aliases**:
  - `@/` aponta para `artifacts/limpeza/src`
  - `@workspace/api-client-react` aponta para a biblioteca de clientes de API local.

### 5.2 Teste Real de Build
Executamos o comando de compilação oficial:
`npm --prefix artifacts/limpeza run build`
- **Resultado**: Código de saída **0** (Sucesso total).
- **Tempo de build**: 30.61 segundos.
- **Artefatos gerados**:
  - `dist/public/index.html` (3.09 kB)
  - `dist/public/assets/index.js` (2.15 MB)
  - `dist/public/assets/index.css` (438 kB)
  - 50+ chunks assíncronos gerados para as páginas sob demanda.

### 5.3 Análise de Tipagem TypeScript (`tsconfig.json`)
Ao executar `npm --prefix artifacts/limpeza run typecheck`:
- O comando executa `tsc -p tsconfig.json --noEmit`.
- Foram detectados erros de tipagem em arquivos legados de telas administrativas anteriores (`property-settings.tsx`, `reception-tablet.tsx`, `settings.tsx`, `surveys.tsx`, `whatsapp-chat.tsx`).
- **Diretriz Crítica de Engenharia**:
  1. O novo componente `guest-minibar.tsx` e as alterações em `App.tsx` e `guest-portal.tsx` devem ser desenvolvidos com TypeScript estrito, interfaces explícitas e sem utilizar tipos frouxos que possam introduzir novos erros de compilação.
  2. O gate de validação obrigatório e suficiente de deploy é o comando `npm run build` na pasta `artifacts/limpeza`, cujo output deve ser commitado na pasta `artifacts/limpeza/dist/` conforme a regra do projeto `AGENTS.md`.

### 5.4 Estratégia de Importação em `App.tsx` (Estática vs Dinâmica)
Em `App.tsx`:
- Telas públicas e críticas de hóspedes (`Login`, `BookingEngine`, `GuestPortal`, `GuestCheckout`, `GuestBreakfast`) são importadas **estaticamente** no topo do arquivo (linhas 14-28).
- **Recomendação para o Frigobar**:
  Importar `GuestMinibar` de forma **estática** no topo de `App.tsx`:
  ```tsx
  import GuestMinibar from '@/pages/guest-minibar';
  ```
  *Justificativa*: Quando o hóspede escaneia o QR Code físico dentro do quarto do hotel em uma conexão 4G/5G ou Wi-Fi inicial, a importação estática garante renderização instantânea (sem risco de falha de carregamento de chunk assíncrono em conexões móveis instáveis).

---

## 6. Proposta de Arquitetura de Código para Implementação

### 6.1 Novo Arquivo de Página: `artifacts/limpeza/src/pages/guest-minibar.tsx`
Sugestão de esqueleto tipado para guiar a equipe de implementação:

```tsx
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { 
  Refrigerator, Package, Plus, Minus, CheckCircle2, Copy, Check, 
  CreditCard, QrCode, AlertTriangle, RefreshCw, ArrowLeft, ArrowRight,
  ShieldCheck, Sparkles, Building2, User, Phone, Mail, Loader2
} from "lucide-react";

export interface MinibarProduct {
  id: string;
  name: string;
  category: "bebidas" | "cervejas_vinhos" | "snacks" | "cafe_capsulas";
  price: number;
  imageUrl?: string;
  standardStock: number;
  isCourtesy?: boolean;
  courtesyLimit?: number;
}

export interface CartSelection {
  [productId: string]: number;
}

export type InvoiceDescriptionType = "itemized" | "agua" | "minibar_consumption";

export default function GuestMinibar() {
  const [, setLocation] = useLocation();

  // Rotas Suportadas
  const [, paramsFlatDirect] = useRoute("/frigobar/flat/:flatNumber");
  const [, paramsFlatShort] = useRoute("/frigobar/:flatNumber");
  const [, paramsMinhaReserva] = useRoute("/minha-reserva/:code/frigobar");
  const [, paramsPortal] = useRoute("/portal-hospede/:code/frigobar");

  // Identificação do Modo de Acesso
  const flatFromUrl = paramsFlatDirect?.flatNumber || paramsFlatShort?.flatNumber || "";
  const codeFromUrl = paramsMinhaReserva?.code || paramsPortal?.code || "";

  // Estados de Etapa: "verify" | "catalog" | "checkout" | "payment" | "success"
  const [step, setStep] = useState<"verify" | "catalog" | "checkout" | "payment" | "success">("verify");

  // Estados de Autenticação / Contexto
  const [phoneLast4, setPhoneLast4] = useState("");
  const [validatingPhone, setValidatingPhone] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<any | null>(null);
  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [previousOrders, setPreviousOrders] = useState<any[]>([]);

  // Estados do Carrinho
  const [cart, setCart] = useState<CartSelection>({});

  // Estados Fiscais
  const [invoiceDesc, setInvoiceDesc] = useState<InvoiceDescriptionType>("itemized");
  const [docType, setDocType] = useState<"guest" | "custom">("guest");
  const [customDoc, setCustomDoc] = useState("");
  const [customName, setCustomName] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

  // Estados de Pagamento
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [orderData, setOrderData] = useState<any | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);

  // Inicialização e Carga Automática
  useEffect(() => {
    if (codeFromUrl) {
      loadContextByCode(codeFromUrl);
    } else if (flatFromUrl) {
      // Checa se já desbloqueou na sessão atual
      const cached = sessionStorage.getItem(`gfm_minibar_unlocked_${flatFromUrl}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.code) {
            loadContextByCode(parsed.code);
            return;
          }
        } catch {}
      }
      setStep("verify");
    }
  }, [codeFromUrl, flatFromUrl]);

  // Função para carregar contexto por código de reserva
  const loadContextByCode = async (code: string) => {
    try {
      const res = await fetch(`/api/minibar/reservation-context/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data?.reservation) {
        setReservation(data.reservation);
        setProducts(data.products || []);
        setPreviousOrders(data.previousOrders || []);
        setInvoiceEmail(data.reservation.guestEmail || "");
        setStep("catalog");
      } else {
        setAuthError(data.error || "Reserva não encontrada ou encerrada.");
      }
    } catch {
      setAuthError("Erro de comunicação ao carregar a reserva.");
    }
  };

  // Função para validar os 4 dígitos do flat
  const handleVerifyPhone = async () => {
    if (phoneLast4.length < 4 || !flatFromUrl) return;
    setValidatingPhone(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/minibar/flat-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flatNumber: flatFromUrl, phoneLast4 })
      });
      const data = await res.json();
      if (res.ok && data?.reservation) {
        setReservation(data.reservation);
        setProducts(data.products || []);
        setPreviousOrders(data.previousOrders || []);
        setInvoiceEmail(data.reservation.guestEmail || "");
        sessionStorage.setItem(`gfm_minibar_unlocked_${flatFromUrl}`, JSON.stringify({ code: data.reservation.code }));
        setStep("catalog");
      } else {
        setAuthError(data.error || "Os 4 dígitos não coincidem com o celular cadastrado na reserva deste flat.");
      }
    } catch {
      setAuthError("Falha ao validar os dígitos. Verifique sua conexão.");
    } finally {
      setValidatingPhone(false);
    }
  };

  // Funções de manipulação do carrinho
  const handleQuantityChange = (productId: string, delta: number) => {
    setCart(prev => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const totalAmount = Object.entries(cart).reduce((sum, [pId, qty]) => {
    const prod = products.find(p => p.id === pId);
    return sum + (prod ? prod.price * qty : 0);
  }, 0);

  const totalItemsCount = Object.values(cart).reduce((sum, q) => sum + q, 0);

  // Demais fluxos: handleCheckoutSubmit(), handlePollingStatus(), etc.
  // ...
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-28">
      {/* Container Mobile Centralizado */}
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-5">
        {/* Renderização condicional por etapa */}
      </div>
    </div>
  );
}
```

---

## 7. Próximos Passos Recomendados para os Implementadores

1. **Backend First**: Assegurar que os endpoints do Explorer 1 (`/api/minibar/products`, `/api/minibar/flat-context`, `/api/minibar/reservation-context/:code`, `/api/minibar/orders` e `/status`) estejam respondendo os contratos JSON especificados.
2. **Frontend UI**:
   - Criar `artifacts/limpeza/src/pages/guest-minibar.tsx` com a implementação mobile completa.
   - Adicionar o card do frigobar e o item de menu em `artifacts/limpeza/src/pages/guest-portal.tsx`.
   - Registrar as rotas públicas de frigobar em `artifacts/limpeza/src/App.tsx`.
3. **Build & Deploy Check**:
   - Executar `npm --prefix artifacts/limpeza run build` para compilar e atualizar `artifacts/limpeza/dist/`.
   - Conforme regra do projeto (`AGENTS.md`), fazer commit dos arquivos de código e do `dist/` gerado, executando `git push` imediatamente.
