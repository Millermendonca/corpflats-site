# Relatório de Análise Técnica: Frontend, WhatsApp Automation & Gestão de FAQ (R1)

**Data**: 2026-10-11T01:28:00Z  
**Autor**: Explorer Subagent (Survey 2)  
**Projeto**: Guest-Flow-Manager (CorpFlats)  
**Escopo**: Arquitetura do Frontend (`artifacts/limpeza`), tela `/whatsapp-automation`, tabs, componentes de UI, chamadas de API, requisitos de R1 (Base de Conhecimento & FAQ) e pipeline de build.

---

## 1. Arquitetura do Frontend (`artifacts/limpeza`)

### 1.1 Stack Tecnológico & Framework
- **Framework & Biblioteca Base**: React 18+ com TypeScript (`tsconfig.json`).
- **Bundler & Dev Server**: Vite 7.3.6 configurado via `artifacts/limpeza/vite.config.ts`.
- **Motor de Estilização**: Tailwind CSS v4 via plugin `@tailwindcss/vite`, complementado por `class-variance-authority` (cva), `clsx` e `tailwind-merge` para classes condicionais atômicas.
- **Roteamento**: `wouter` (`Route`, `Switch`, `useLocation`, `Router as WouterRouter`).
- **Gerenciamento de Estado do Servidor**: `@tanstack/react-query` (`QueryClientProvider`, `useQuery`, `useMutation`), configurado em `App.tsx` com `refetchOnWindowFocus: false` e `staleTime: 5000`.
- **Cliente API Tipado**: `@workspace/api-client-react` para autenticação de usuário (`useGetMe`), settings e PMS.
- **Ícones**: `lucide-react` (biblioteca primária do shadcn/ui) e `react-icons`.
- **Sistema de Notificações**: Radix Toast via hook `useToast` (`@/hooks/use-toast`).

### 1.2 Estrutura de Diretórios
```
artifacts/limpeza/
├── src/
│   ├── components/
│   │   ├── layout.tsx             # Shell wrapper de navegação administrativa
│   │   ├── access-denied.tsx      # Bloqueio de acesso para perfis sem permissão
│   │   ├── reservation-hover-card.tsx
│   │   └── ui/                    # 55 componentes shadcn/ui (Card, Table, Dialog, Badge, Switch, etc.)
│   ├── hooks/
│   │   ├── use-mobile.tsx         # Detecção responsiva
│   │   ├── use-quick-messages.ts  # Gerenciador de mensagens rápidas (CRUD + local + API)
│   │   └── use-toast.ts           # Despacho de alertas toast
│   ├── lib/
│   │   └── utils.ts               # Utilitário `cn()` (clsx + tailwind-merge)
│   ├── pages/
│   │   ├── whatsapp-automation.tsx# Página principal de automação Z-API e réguas (4.083 linhas)
│   │   ├── whatsapp-chat.tsx      # Interface WhatsApp Web / Live Chat corporativo
│   │   └── ...                    # 44 outras páginas PMS / hotelaria
│   ├── App.tsx                    # Declaração do roteador e Route Guards
│   ├── main.tsx                   # Ponto de entrada React (ReactDOM.createRoot)
│   └── index.css                  # Estilos globais Tailwind v4
├── vite.config.ts                 # Configuração do build e proxies
└── package.json                   # Dependências e scripts npm
```

### 1.3 Mapeamento de Rotas & Route Guards
Em `artifacts/limpeza/src/App.tsx`:
- A tela de automação está registrada sob as rotas com `AdminRoute` (protegida para administradores):
  ```tsx
  <AdminRoute path="/whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
  <AdminRoute path="/automacao-whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
  ```
- **Recomendação de Rota**: O pedido original referencia a rota `/whatsapp-automation`. Para garantir suporte completo tanto aos menus existentes quanto a links diretos, deve-se adicionar a rota alias em `App.tsx`:
  ```tsx
  <AdminRoute path="/whatsapp-automation" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
  ```
- No menu principal em `src/components/layout.tsx`:
  `{ href: "/whatsapp", label: "Automação WhatsApp", icon: Bot, description: "Réguas de gatilhos, editor, fila e histórico" }`

---

## 2. Implementação Atual de `/whatsapp-automation`

### 2.1 Estrutura da Página (`whatsapp-automation.tsx`)
A página possui 4.083 linhas e segue um padrão bem estruturado:
1. **Header Administrativo**:
   - Título "Automação de WhatsApp Corporativo (Z-API)".
   - Badges de conexão da Z-API (`statusInfo.connected`, número do WhatsApp conectado, latência).
   - Botões de ação rápida no topo: `Testar Disparo Z-API`, `Reconectar Z-API`, `Atualizar Status`.
2. **Banner de Segurança**:
   - Alerta visual quando o Modo de Teste Seguro está ativo (`testModeOnly: true`) com indicação dos telefones autorizados e botão de limpeza da fila de hóspedes reais.
   - Alerta vermelho de advertência caso o modo de produção real esteja ativado.
3. **Controle de Abas (`Tabs`)**:
   - Estado: `const [activeTab, setActiveTab] = useState<string>("rules")`.
   - Sincronização via Query Parameter:
     ```tsx
     useEffect(() => {
       if (typeof window !== "undefined") {
         const params = new URLSearchParams(window.location.search)
         const tabParam = params.get("tab")
         if (tabParam) setActiveTab(tabParam)
       }
     }, [])
     ```

### 2.2 Abas Atuais
1. `ai_agent` (`TabsTrigger value="ai_agent"`):
   - **Agente de IA (Sofia / Concierge Virtual)**:
     - 3 cards de visão geral: Motor de IA, Modelo LLM (Google Gemini vs Heurístico Local), Ambiente de Disparo (Teste vs Produção).
     - Modos de operação: Autônomo, Copiloto, Fora do Expediente.
     - Delay de resposta humanizado (1 a 15s).
     - Nome do agente ("Sofia") e papel ("Concierge Virtual CorpFlats").
     - Prompt base do sistema com restauração de padrão.
     - Campos básicos de base de conhecimento estática (Wi-Fi, Check-in/out, Café, Garagem, Endereço).
     - Simulador interativo com balão WhatsApp e detecção de contexto de reserva.
2. `rules` (`TabsTrigger value="rules"`):
   - **Régua Automática de Disparos**: listagem dos 18 templates de eventos de reserva (pré-reserva, pagamento, instruções de check-in, quarto limpo, café, check-out, NPS).
3. `quick_messages` (`TabsTrigger value="quick_messages"`):
   - **Mensagens Rápidas**: cards com atalhos de envio manual, switch ativo/inativo, modal de criação/edição com inserção de tags e botões de disparo Z-API.
4. `queue` (`TabsTrigger value="queue"`):
   - **Fila de Envios Agendados**: lista cronológica de mensagens agendadas para envio futuro com cancelamento ou disparo imediato.
5. `history` (`TabsTrigger value="history"`):
   - **Histórico**: registros das mensagens enviadas com status Z-API (entregue, lido, erro).

---

## 3. Padrão de Chamadas de API Frontend

### 3.1 Cliente HTTP e Headers
- Todas as chamadas dos módulos de WhatsApp e IA utilizam a API nativa `fetch()` do navegador com `async/await`.
- Headers padrão para mutações (POST/PUT):
  ```typescript
  headers: { "Content-Type": "application/json" }
  ```
- Não há necessidade de passar tokens manuais de autorização para as rotas `/api/whatsapp/*`, pois a autenticação de sessão é manipulada por cookies HTTP-only de sessão mesma-origem.
- O Vite faz proxy de `/api` para `http://127.0.0.1:5000` em ambiente de desenvolvimento local (definido em `vite.config.ts`, linhas 68-72).

### 3.2 Endpoints Existentes Relacionados
- `GET /api/whatsapp/status` — Status da conexão com a Z-API.
- `GET /api/whatsapp/ai-config` — Configurações da Sofia (modo, delay, prompt base, base rápida).
- `POST /api/whatsapp/ai-config` — Atualização das configurações da IA.
- `POST /api/whatsapp/ai-simulate` — Simulação de resposta com prompt e contexto.
- `GET /api/whatsapp/quick-messages` — Lista de mensagens rápidas.
- `POST /api/whatsapp/quick-messages` — Salva/edita mensagem rápida.
- `DELETE /api/whatsapp/quick-messages/:id` — Remove mensagem rápida.

### 3.3 Endpoints Necessários para FAQ (R1 a R5)
Para suportar o módulo completo de FAQ e Base de Conhecimento, foram mapeados os seguintes endpoints REST no backend:
1. `GET /api/whatsapp/faq` — Retorna a lista de todos os itens de FAQ cadastrados (`db.faqItems`).
2. `POST /api/whatsapp/faq` — Cria ou edita um item de FAQ.
3. `POST /api/whatsapp/faq/:id/approve` — Aprovação em 1 clique (transforma `"aguardando_aprovacao"` ou `"pendente"` em `"ativo"`).
4. `POST /api/whatsapp/faq/:id/toggle` — Alterna status entre ativo e inativo.
5. `DELETE /api/whatsapp/faq/:id` — Exclui um item de FAQ.
6. `POST /api/whatsapp/faq/reset-defaults` — Restaura as perguntas e respostas oficiais de fábrica do CorpFlats.

---

## 4. Biblioteca de Componentes, Estilos e Padrões de UI

O projeto conta com uma coleção completa de componentes em `artifacts/limpeza/src/components/ui/`:

| Componente | Caminho | Uso em R1 |
|---|---|---|
| `Card` | `@/components/ui/card` | Cards de categorias e visualização de itens do FAQ |
| `Table` | `@/components/ui/table` | Visualização em tabela com colunas: Categoria, Pergunta, Resposta, Exceções, Status, Ações |
| `Dialog` | `@/components/ui/dialog` | Modal completo de Criação e Edição de FAQ e Resposta Rápida |
| `Badge` | `@/components/ui/badge` | Chips de categorias, status (`Ativo`, `Pendente`, `Aguardando Aprovação`), e escopo (`Todos`, `Exceto`, `Apenas`) |
| `Button` | `@/components/ui/button` | Botões de Aprovação 1 clique, Novo FAQ, Editar, Pausar/Ativar, Excluir |
| `Input` | `@/components/ui/input` | Campo de pergunta principal, sinônimos, telefones de exceção, busca |
| `Textarea` | `@/components/ui/textarea` | Campo de resposta oficial com formatação WhatsApp |
| `Select` | `@/components/ui/select` | Seleção de categoria e escopo de exceção |
| `Switch` | `@/components/ui/switch` | Toggle rápido de status (Ativo / Inativo) |
| `Tabs` | `@/components/ui/tabs` | Filtros por status ("Todas", "Ativas", "Pendentes", "Sugestões") |
| `Toaster` / `useToast` | `@/hooks/use-toast` | Feedback visual imediato com mensagens de sucesso e erro |

### Padrão Visual de Balão WhatsApp
Em `whatsapp-automation.tsx` (linhas 3131-3156), existe um padrão consagrado no projeto para renderizar caixas no formato WhatsApp:
```tsx
<div className="p-3 rounded-2xl bg-[#E7FFDB] dark:bg-[#005C4B]/35 border border-emerald-200 dark:border-emerald-800/80 space-y-2 text-xs text-neutral-900 dark:text-neutral-100">
  <div className="whitespace-pre-wrap font-sans leading-relaxed text-[11.5px]">
    {faq.answer}
  </div>
</div>
```

---

## 5. Especificação Exata dos Requisitos para R1

### 5.1 Categorias Oficiais
As 9 categorias exigidas no `ORIGINAL_REQUEST.md`:
1. `reservas` — **Reservas** (ícone: `Calendar`, cor: azul)
2. `checkin_acesso` — **Check-in / Acesso** (ícone: `Key`, cor: esmeralda)
3. `wifi_tecnologia` — **Wi-Fi & Tecnologia** (ícone: `Wifi`, cor: ciano)
4. `cafe_manha` — **Café da Manhã** (ícone: `Coffee`, cor: âmbar)
5. `garagem` — **Garagem & Vagas** (ícone: `Car`, cor: índigo)
6. `estrutura_flat` — **Estrutura do Flat** (ícone: `Home`, cor: roxo)
7. `regras_visitas_pets` — **Regras, Visitas & Pets** (ícone: `ShieldCheck`, cor: rosa)
8. `lazer_condominio` — **Lazer & Condomínio** (ícone: `Sparkles`, cor: amarelo)
9. `checkout` — **Check-out** (ícone: `DoorOpen`, cor: vermelho)

### 5.2 Filtros Rápidos por Status
- **Todas**: Exibe o acervo completo.
- **Ativas / Respondidas** (`status === "ativo"`): FAQs oficiais que alimentam a IA.
- **Perguntas Pendentes** (`status === "pendente"`): Dúvidas capturadas no webhook de clientes que não tiveram resposta mapeada.
- **Sugestões de IA para Aprovar** (`status === "aguardando_aprovacao"`): Perguntas que receberam resposta humana do operador e estão aguardando validação do Miller em 1 clique.

### 5.3 Estrutura de Dados do FAQ (`FaqItem`)
```typescript
export interface FaqItem {
  id: string
  category: 
    | "reservas" 
    | "checkin_acesso" 
    | "wifi_tecnologia" 
    | "cafe_manha" 
    | "garagem" 
    | "estrutura_flat" 
    | "regras_visitas_pets" 
    | "lazer_condominio" 
    | "checkout"
  question: string                  // Pergunta principal
  variations: string[]              // Sinônimos e palavras-chave de busca
  answer: string                    // Resposta oficial (com formatação WhatsApp)
  status: "ativo" | "inativo" | "pendente" | "aguardando_aprovacao"
  scope: "all" | "exclude" | "include_only" // Regra de exceção de clientes
  clientPhones: string[]            // Telefones normalizados para a exceção
  
  // Metadados de Auto-Aprendizado (R2/R3)
  contactPhone?: string             // Telefone de quem enviou a dúvida
  contactName?: string              // Nome do contato
  suggestedAnswer?: string          // Resposta capturada do operador humano
  createdAt?: string                // ISO string
  answeredAt?: string               // Quando o operador respondeu
  approvedAt?: string               // Quando foi aprovado para produção
}
```

### 5.4 Formulário e Modal de Criação / Edição
- **Campos**:
  1. `question`: Input de texto para a pergunta principal (obrigatório).
  2. `variations`: Campo de texto dinâmico para adicionar variações/sinônimos de busca (ex: tags com botão `+`).
  3. `category`: Select dropdown com as 9 categorias.
  4. `answer`: Textarea com prévia em tempo real simulando o balão WhatsApp.
  5. `status`: Switch Liga/Desliga ou Select (Ativo / Inativo).
  6. **Motor de Exceções & Segmentação (R4)**:
     - Seletor de 3 estados:
       - **Regra Padrão (`all`)**: Vale para todos os clientes sem exceção.
       - **Exceção Negativa (`exclude`)**: "Não vale para os clientes..." (A IA ignora e busca alternativa ou transborda).
       - **Exceção Positiva (`include_only`)**: "Só vale para os clientes..." (A resposta só é entregue se o telefone bater).
     - Input de telefones: Suporte a múltiplos números separados por vírgula ou espaço.
- **Ações na Listagem**:
  - **Aprovar com 1 Clique**: Botão de destaque verde (`CheckCheck`) visível quando o status for `"aguardando_aprovacao"`. Ao clicar, promove o status para `"ativo"`, gravando data e aplicando a resposta oficial.
  - **Responder**: Botão para perguntas com status `"pendente"`, abrindo modal com a pergunta pré-preenchida para digitação da resposta oficial.
  - **Editar**: Abre o modal com todos os dados pré-carregados.
  - **Pausar / Ativar**: Switch rápido direto na listagem ou menu de ações.
  - **Excluir**: Confirmação visual para exclusão segura.

---

## 6. Pipeline de Build e Verificação do Frontend

### 6.1 Configuração de Empacotamento
Em `artifacts/limpeza/package.json`:
- `"build": "vite build --config vite.config.ts"`
- `"typecheck": "tsc -p tsconfig.json --noEmit"`

Em `artifacts/limpeza/vite.config.ts`:
- `outDir`: `artifacts/limpeza/dist/public`
- Arquivos de saída:
  - `dist/public/index.html`
  - `dist/public/assets/index.js` (fixo)
  - `dist/public/assets/index.css` (fixo)
  - Chunks dinâmicos e bibliotecas em `dist/public/assets/`

### 6.2 Teste de Execução Real do Build
O build foi executado no diretório `artifacts/limpeza` com o comando `npm run build`:
- **Resultado**: Código de saída `0` (Sucesso absoluto).
- **Tempo**: 44.76 segundos.
- **Módulos transformados**: 3.353 módulos.
- **Saídas geradas**:
  - `dist/public/index.html` (2.65 kB)
  - `dist/public/assets/index.css` (380.67 kB)
  - `dist/public/assets/index.js` (3.172.70 kB)
  - `dist/public/assets/pdf.worker.min-rsCePomN.mjs` (1.417.59 kB)
  - `dist/public/assets/pdf-z6sF223D.js` (379.02 kB)

A pipeline está 100% íntegra, estável e pronta para receber o novo componente de FAQ.

---

## 7. Arquitetura Recomendada para Implementação do Frontend

Para manter a organização do código limpa, desacoplada e reutilizável:
1. **Hook Dedicado**: Criar `artifacts/limpeza/src/hooks/use-faq.ts` (espelhando a excelente arquitetura de `use-quick-messages.ts`), responsável por carregar `GET /api/whatsapp/faq`, manter cache local em `localStorage`, manipular estados de filtros e disparar as mutações de API (`saveFaqItem`, `deleteFaqItem`, `approveFaqItem`, `toggleFaqItem`, `resetDefaultFaqs`).
2. **Componente Modular**: Criar `artifacts/limpeza/src/components/faq-knowledge-base.tsx` ou embutir a aba diretamente em `whatsapp-automation.tsx`. Uma abordagem modular através de um componente dedicado `FaqKnowledgeBase` mantém `whatsapp-automation.tsx` protegido contra inchaço excessivo de linhas e facilita manutenção e testes.
3. **Inclusão na Aba**: Em `whatsapp-automation.tsx`:
   - Adicionar o `TabsTrigger value="faq"` no cabeçalho de abas com badge animado de perguntas pendentes/sugestões.
   - Adicionar `<TabsContent value="faq">` renderizando o componente ou a aba dedicada.
   - Atualizar a grid de abas para suportar a 6ª aba em resoluções móveis e desktop (`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6`).
4. **Alias de Rota em App.tsx**: Adicionar `<AdminRoute path="/whatsapp-automation" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />`.
