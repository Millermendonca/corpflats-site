# Análise Técnica de Arquitetura Frontend — Milestone 3 (Knowledge Base & FAQ)

**Data de Elaboração**: 2026-10-11T04:24:00Z  
**Autor**: Milestone 3 Explorer 1  
**Escopo**: Frontend em `artifacts/limpeza` (Roteamento, Abas, Hook de Estado, Componentes UI, Modal, Build)  

---

## 1. Diagnóstico de Roteamento (`App.tsx`)

### 1.1 Situação Atual
O roteamento do frontend utiliza a biblioteca `wouter` com controle de acesso administrativo através do componente `AdminRoute` (`artifacts/limpeza/src/App.tsx:98-104`).

Em `App.tsx`:
- Linha 45: `import WhatsappAutomation from '@/pages/whatsapp-automation';`
- Linhas 276-277:
  ```tsx
  <AdminRoute path="/whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
  <AdminRoute path="/automacao-whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
  ```

### 1.2 Lacuna Identificada
O requisito R1 do usuário (`ORIGINAL_REQUEST.md:13`) e a especificação do roadmap (`PROJECT.md:25`, Feature 8) exigem expressamente que a rota `/whatsapp-automation` abra a página de automação do WhatsApp. Atualmente, tentar acessar `/whatsapp-automation` cai na rota fallback `NotFound` (`App.tsx:341`).

### 1.3 Solução Proposta (Feature 8)
Adicionar a rota correspondente em `artifacts/limpeza/src/App.tsx`:
```tsx
<AdminRoute path="/whatsapp-automation" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
```
Isso garante a resolução imediata do path `/whatsapp-automation`, mantendo total retrocompatibilidade com `/whatsapp` e `/automacao-whatsapp`.

---

## 2. Estrutura de Abas em `whatsapp-automation.tsx`

### 2.1 Estrutura Atual
A página `artifacts/limpeza/src/pages/whatsapp-automation.tsx` (4.621 linhas) utiliza o componente de abas do Radix UI (`@/components/ui/tabs`):
- Estado de controle: `const [activeTab, setActiveTab] = useState<string>("rules")` (linha 375).
- Cabeçalho das abas (`TabsList`, linhas 1695-1726):
  ```tsx
  <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
    <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full md:w-auto rounded-xl p-1 bg-muted/60">
      <TabsTrigger value="ai_agent" ...>🤖 Agente de IA</TabsTrigger>
      <TabsTrigger value="rules" ...>⚡ Régua Automática</TabsTrigger>
      <TabsTrigger value="quick_messages" ...>💬 Mensagens Rápidas</TabsTrigger>
      <TabsTrigger value="queue" ...>⏱️ Fila de Envios</TabsTrigger>
      <TabsTrigger value="history" ...>✓ Histórico</TabsTrigger>
    </TabsList>
  ```
- Conteúdo das abas (`TabsContent`):
  1. `ai_agent` (linhas 1730-2487): Configurações gerais da IA, chaves de ação do bot (PMS/PIX/Orçamento), teste de simulação de conversa.
  2. `rules` (linhas 2492-3580): Regras automáticas do ciclo do hóspede e editor de gatilhos.
  3. `quick_messages` (linhas 3585-3850): Mensagens rápidas e atalhos manuais.
  4. `queue` (linhas 3855-3997): Fila de agendamentos futuros.
  5. `history` (linhas 4002-4050): Histórico de disparos concluídos.

### 2.2 Inclusão da Nova Aba "Base de Conhecimento & FAQ"
1. **Adição do Trigger em `TabsList`**:
   - Alterar o grid de `grid-cols-2 md:grid-cols-5` para `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` para acomodar 6 abas harmoniosamente em todas as resoluções.
   - Posicionar a nova aba com valor `faq_knowledge`:
     ```tsx
     <TabsTrigger value="faq_knowledge" className="rounded-lg text-xs font-bold gap-1.5 relative">
       <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
       Base de Conhecimento & FAQ
       {pendingFaqCount > 0 && (
         <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-white font-black animate-pulse">
           {pendingFaqCount}
         </span>
       )}
     </TabsTrigger>
     ```
2. **Modularização por Componente**:
   - Como `whatsapp-automation.tsx` já possui 4.621 linhas, é altamente recomendável criar um componente dedicado em `artifacts/limpeza/src/components/faq-knowledge-base.tsx`.
   - Em `whatsapp-automation.tsx`, simplesmente renderizar:
     ```tsx
     <TabsContent value="faq_knowledge" className="space-y-6">
       <FaqKnowledgeBase />
     </TabsContent>
     ```
   - Esta abordagem isola o estado do FAQ, evita re-renderizações desnecessárias da página inteira e facilita a manutenção e testes.

---

## 3. Arquitetura do Hook de Estado (`use-faq.ts`)

Seguindo o padrão de sucesso de `use-quick-messages.ts`, criamos `artifacts/limpeza/src/hooks/use-faq.ts` com as seguintes responsabilidades:

### 3.1 Interface de Dados (`FaqItem`)
Correspondência estrita com o backend (`artifacts/api-server/zapi-service.mjs:6665-6680` e `PROJECT.md:50-68`):
```typescript
export type FaqCategory =
  | "reservas"
  | "checkin_acesso"
  | "wifi_tecnologia"
  | "cafe_manha"
  | "garagem"
  | "estrutura_flat"
  | "regras_visitas_pets"
  | "lazer_condominio"
  | "checkout";

export type FaqStatus = "ativo" | "inativo" | "pendente" | "aguardando_aprovacao";
export type FaqScope = "all" | "exclude" | "include_only";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
  keywords: string[];
  variations: string[];
  status: FaqStatus;
  scope: FaqScope;
  clientPhones: string[];
  suggestedAnswer?: string;
  sourceClientPhone?: string;
  sourceClientName?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}
```

### 3.2 Métodos do Hook
- `fetchFaqs(filters?: { category?: string; status?: string; search?: string })`: Consome `GET /api/whatsapp/faq`.
- `createFaq(faq: Partial<FaqItem>)`: Dispara `POST /api/whatsapp/faq`.
- `updateFaq(id: string, faq: Partial<FaqItem>)`: Dispara `PUT /api/whatsapp/faq/:id`.
- `deleteFaq(id: string)`: Dispara `DELETE /api/whatsapp/faq/:id`.
- `approveFaq(id: string, payload?: { answer?: string; category?: string; question?: string })`: Dispara `POST /api/whatsapp/faq/:id/approve`.
- `toggleStatus(id: string, currentStatus: FaqStatus)`: Alterna rapidamente entre `"ativo"` e `"inativo"`.
- Métricas calculadas para badges e contadores:
  - `totalCount`: número total de FAQs cadastrados.
  - `activeCount`: itens com status `"ativo"`.
  - `pendingCount`: itens com status `"pendente"`.
  - `approvalCount`: itens com status `"aguardando_aprovacao"`.

---

## 4. Design System & Componentes UI para a Aba FAQ

### 4.1 Categorias Oficiais e Metadados Visuais
Definir a matriz com as 9 categorias exigidas no requisito R1:
| ID da Categoria | Nome Amigável | Ícone Sugerido | Cor de Destaque / Tailwind |
|---|---|---|---|
| `reservas` | Reservas | `Calendar` | Indigo (`indigo-500`) |
| `checkin_acesso` | Check-in / Acesso | `Key` | Emerald (`emerald-500`) |
| `wifi_tecnologia` | Wi-Fi / Tecnologia | `Wifi` | Sky (`sky-500`) |
| `cafe_manha` | Café da Manhã | `Coffee` | Amber (`amber-500`) |
| `garagem` | Garagem | `Car` / `DoorOpen` | Blue (`blue-500`) |
| `estrutura_flat` | Estrutura do Flat | `Building` / `Tv` | Violet (`violet-500`) |
| `regras_visitas_pets` | Regras / Visitas / Pets | `ShieldAlert` / `PawPrint` | Rose (`rose-500`) |
| `lazer_condominio` | Lazer / Condomínio | `Waves` / `Sparkles` | Cyan (`cyan-500`) |
| `checkout` | Check-out | `LogOut` | Orange (`orange-500`) |

### 4.2 Filtros Rápidos por Status
Implementar botões segmentados com badges numéricos:
1. **Todas** (`all`)
2. **Ativas / Respondidas** (`ativo`): Verde (`bg-emerald-100 text-emerald-800`)
3. **Perguntas Pendentes** (`pendente`): Âmbar (`bg-amber-100 text-amber-800 animate-pulse`)
4. **Sugestões de IA para Aprovar** (`aguardando_aprovacao`): Azul/Roxo (`bg-purple-100 text-purple-800 font-bold`)

### 4.3 Cards de Destaque no Topo
- **Card 1 (Total de FAQs)**: Indicador geral da base.
- **Card 2 (Ativas em Produção)**: Usadas ativamente pela Sofia e pelo Gemini.
- **Card 3 (Aguardando Aprovação)**: Sugestões capturadas do operador para aprovação em 1 clique.
- **Card 4 (Dúvidas Pendentes)**: Perguntas não reconhecidas necessitando de resposta.

### 4.4 Listagem em Tabela & Cards
- **Visão em Tabela / Cartões**:
  - Exibição clara de: Pergunta principal, Categoria, Status, Escopo de Clientes (Regra Geral, Exceção Negativa, Exceção Positiva) e Resposta (ou Resposta Sugerida em destaque).
  - Badge de origem quando capturado automaticamente (ex: "Capturado de: Juliana Mendes (21 98888-7777)").
  - Botão de Destaque: **"Aprovar em 1 Clique"** (`bg-emerald-600 hover:bg-emerald-700 text-white`) para itens aguardando aprovação.
  - Ações contextuais: Editar (`Edit3`), Pausar/Ativar (`Switch`), Excluir (`Trash2`).

### 4.5 Modal / Formulário Completo de Criação e Edição
Componente `Dialog` (`@/components/ui/dialog`):
1. **Pergunta Principal**: Input de texto obrigatório.
2. **Variações & Palavras-chave**:
   - Textarea ou input de tags para sinônimos de busca e heurística (ex: `wifi, senha da internet, rede wi-fi`).
3. **Resposta Oficial**:
   - Textarea com suporte à formatação WhatsApp (`*negrito*`, `_itálico_`, emojis).
   - Card de prévia em tempo real simulando balão do WhatsApp.
4. **Categoria**:
   - `Select` com as 9 categorias padronizadas.
5. **Status**:
   - `"ativo"` ou `"inativo"`.
6. **Motor de Regras de Exceção e Segmentação por Cliente** (Requisito R4):
   - Seletor de `scope`:
     - `"all"`: **Regra Padrão** (Válido para todos os clientes sem restrição).
     - `"exclude"`: **Exceção Negativa** ("Não vale para..."). Ex: clientes com reservas OTA não recebem early check-in gratuito.
     - `"include_only"`: **Exceção Positiva** ("Só vale para..."). Ex: clientes corporativos específicos com convênio.
   - Campo para Telefones dos Clientes (`clientPhones`): Input aceitando números separados por vírgula ou quebra de linha, normalizados com ou sem DDI 55.

---

## 5. Build Script & Verificação

- **Script**: `npm run build` em `artifacts/limpeza` executa `vite build --config vite.config.ts`.
- **Destino do Build**: `artifacts/limpeza/dist/public` (definido em `vite.config.ts:45`).
- **Conformidade com AGENTS.md**: Após as alterações no frontend, deve-se executar `npm run build` e commitar as alterações com `git push`.
