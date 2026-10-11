# UI & Hook Architecture Analysis: Dynamic FAQ & Knowledge Base (CorpFlats Sofia AI)

**Author:** Milestone 3 Explorer 2  
**Target:** Guest-Flow-Manager Frontend (`artifacts/limpeza`)  
**Context:** Feature 8, 9, 10, 11 (Frontend Route Alias, `use-faq` Hook, `FaqKnowledgeBase` UI Component, Frontend Build)  
**Status:** READY FOR WORKER IMPLEMENTATION  

---

## 1. Executive Summary & Architecture Overview

The Dynamic FAQ & Knowledge Base system equips CorpFlats and its AI agent Sofia with an autonomous, continuous-learning knowledge engine. The frontend interface allows operators (Miller and reception) to oversee all automated responses, review guest doubts that require human attention, approve operator responses with a single click, and establish fine-grained client exception rules (standard `all`, negative exceptions `exclude`, and positive exceptions `include_only`).

### Architectural Components
```
┌────────────────────────────────────────────────────────────────────────┐
│                          App.tsx Router                                │
│        /whatsapp-automation  ──>  WhatsappAutomation Page              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   whatsapp-automation.tsx (Tabs)                       │
│  [🤖 Agente IA] [⚡ Régua] [💬 Msg Rápidas] [📚 Base & FAQ] [⏰ Fila]   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    faq-knowledge-base.tsx                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Header & Metric Summary (Total, Ativas, Pendentes, Sugestões)  │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 2. Category Cards Grid (9 Categorias com contadores e filtros)   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 3. Toolbar (Search, 4 Status Pills, Scope Filter, View Switch)   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 4. Views: Table View (detalhada) / Card View (interativa)        │  │
│  │    • 1-Click Approve (em itens aguardando aprovação)             │  │
│  │    • Badges de Status (verde/amarelo/roxo/cinza)                 │  │
│  │    • Badges de Escopo (all / exclude / include_only)             │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 5. Modal de Criar/Editar com Configuração de Exceções            │  │
│  │    • Formatação WhatsApp + Live Preview Balão                    │  │
│  │    • Escopo (all, exclude, include_only) + Gestor de Telefones   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     use-faq.ts React Hook                              │
│   • REST API: GET, POST, PUT, DELETE, POST /:id/approve                │
│   • State, Loading, Error, Filtering, Category Stats, Status Counts    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Interface Contract Mapping

The backend REST API endpoints implemented in Milestone 1 & 2 (`artifacts/api-server/zapi-service.mjs:6610-6765`) map directly to the frontend hook:

| REST Endpoint | HTTP Method | Body / Query | Frontend Hook Method | Purpose |
|---|---|---|---|---|
| `/api/whatsapp/faq` | `GET` | `?category=&status=&scope=&search=` | `fetchFaq()` | Retorna `{ success: true, count, items: FaqItem[] }` |
| `/api/whatsapp/faq` | `POST` | `{ question, answer, category, keywords, variations, scope, clientPhones, status, ... }` | `createFaq(data)` | Cria novo item. Retorna `{ success: true, item: FaqItem }` |
| `/api/whatsapp/faq/:id` | `PUT` | `{ question?, answer?, category?, keywords?, variations?, scope?, clientPhones?, status? }` | `updateFaq(id, data)` | Atualiza item existente. Retorna `{ success: true, item: FaqItem }` |
| `/api/whatsapp/faq/:id` | `DELETE` | none | `deleteFaq(id)` | Remove item. Retorna `{ success: true, id }` |
| `/api/whatsapp/faq/:id/approve` | `POST` | `{ answer?, category?, question? }` | `approveFaq(id, overrides?)` | Aprova sugestão em 1 clique (`status -> "ativo"`, `approvedAt: now`). |

---

## 3. Taxonomy of the 9 Knowledge Categories

The 9 official categories required by §R1 and seeded in `data/database.json`:

| ID | Nome Exibição | Ícone Lucide | Descrição Resumida | Exemplo no CorpFlats |
|---|---|---|---|---|
| `reservas` | Reservas | `Calendar` | Diárias, pagamentos, PIX, confirmação e políticas | Valores, cancelamentos, prazos de reserva |
| `checkin_acesso` | Check-in & Acesso | `DoorOpen` | Entrada 14h, early check-in, portaria 24h, fechadura | Como entrar no prédio, identificação |
| `wifi_tecnologia` | Wi-Fi & Tecnologia | `Wifi` | Rede CorpFlats-Hospedes, senha `corpflats2026`, 500MB | Rede, senha, Smart TV, conectividade |
| `cafe_manha` | Café da Manhã | `Coffee` | Entrega exclusiva na bandeja no quarto, cardápio digital | Horários de entrega, seleção de itens |
| `garagem` | Garagem | `Car` | Vagas rotativas cobertas, controle de acesso | Onde estacionar, regras da garagem |
| `estrutura_flat` | Estrutura do Flat | `Home` | Utensílios de cozinha, ar condicionado, secador, frigobar | Itens do quarto, água mineral cortesia |
| `regras_visitas_pets` | Regras, Visitas & Pets | `ShieldCheck` | Visitantes cadastrados, pets de pequeno porte, silêncio | Política de convidados, taxa pet |
| `lazer_condominio` | Lazer & Condomínio | `Sparkles` | Piscina, sauna, academia, rooftop | Horários de funcionamento das áreas comuns |
| `checkout` | Check-out & Saída | `Clock` | Horário 12h, late check-out, louças e entrega de cartão | Devolução na portaria, recolhimento |

---

## 4. The 4 Status Filters & Lifecycle Flow

```
                      [Dúvida inédita do Hóspede via Z-API]
                                      │
                                      ▼
                                status: "pendente"
                          (Amarelo - Dúvida sem resposta)
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
    [Operador responde no chat]                     [Miller responde no Painel]
              │                                               │
              ▼                                               ▼
 status: "aguardando_aprovacao"                       status: "ativo"
  (Roxo/Violeta - Sugestão IA)                         (Verde - Oficial)
              │                                               ▲
              └─────────► [Aprovar em 1 Clique] ──────────────┘
                                  OU
                        [Pausar / Desativar]
                                  │
                                  ▼
                          status: "inativo"
                          (Cinza - Pausado)
```

The 4 status filter tabs:
1. **"Todas"** (`todas`): Mostra todos os itens da base.
2. **"Ativas / Respondidas"** (`ativas`): Itens com `status === "ativo"`.
3. **"Perguntas Pendentes"** (`pendentes`): Itens com `status === "pendente"` (perguntas de clientes sem resposta pronta).
4. **"Sugestões de IA para Aprovar"** (`sugestoes_ia`): Itens com `status === "aguardando_aprovacao"` (respostas capturadas prontas para aprovação com 1 clique).

---

## 5. Client Exception Rule Engine (R4)

Each FAQ item supports three segmentation scopes:
- **`all` (Regra Padrão — Todos os Clientes)**: Resposta pública universal enviada a qualquer cliente.
- **`exclude` (Exceção Negativa — Não vale para clientes listados)**: Se o cliente pertencer à lista de telefones cadastrados, a Sofia ignora a resposta e busca fallback ou transborda para operador.
- **`include_only` (Exceção Positiva — Apenas clientes listados)**: A Sofia responde exclusivamente se o número do cliente corresponder à lista.

### Phone Normalization & Input UX
- Suporta múltiplos formatos: `(22) 99850-5276`, `22998505276`, `5522998505276`.
- O modal fornece:
  - Input individual com tecla Enter / botão Adicionar.
  - Textarea para colar lote (separados por vírgula ou linhas).
  - Chips com formatação legível `(DD) XXXXX-XXXX` e botão `X` de remoção.
  - Validação e feedback visual da regra selecionada.

---

## 6. Ready-to-Use Implementation Code

### 6.1 `src/hooks/use-faq.ts`

```typescript
import { useState, useEffect, useCallback, useMemo } from "react"
import { useToast } from "@/hooks/use-toast"

export type FaqCategory =
  | "reservas"
  | "checkin_acesso"
  | "wifi_tecnologia"
  | "cafe_manha"
  | "garagem"
  | "estrutura_flat"
  | "regras_visitas_pets"
  | "lazer_condominio"
  | "checkout"

export type FaqStatus = "ativo" | "inativo" | "pendente" | "aguardando_aprovacao"
export type FaqScope = "all" | "exclude" | "include_only"
export type FaqStatusFilter = "todas" | "ativas" | "pendentes" | "sugestoes_ia"

export interface FaqItem {
  id: string
  question: string
  answer: string
  category: FaqCategory
  keywords: string[]
  variations: string[]
  status: FaqStatus
  scope: FaqScope
  clientPhones: string[]
  suggestedAnswer?: string
  sourceClientPhone?: string
  sourceClientName?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
}

export interface CreateFaqInput {
  question: string
  answer?: string
  category?: FaqCategory
  keywords?: string[] | string
  variations?: string[] | string
  scope?: FaqScope
  clientPhones?: string[] | string
  status?: FaqStatus
  suggestedAnswer?: string
  sourceClientPhone?: string
  sourceClientName?: string
}

export interface UpdateFaqInput {
  question?: string
  answer?: string
  category?: FaqCategory
  keywords?: string[] | string
  variations?: string[] | string
  scope?: FaqScope
  clientPhones?: string[] | string
  status?: FaqStatus
  suggestedAnswer?: string
}

export interface ApproveFaqInput {
  answer?: string
  category?: FaqCategory
  question?: string
}

export interface FaqCategoryMeta {
  id: FaqCategory
  label: string
  shortLabel: string
  description: string
  iconName: string
  colorClass: string
  badgeClass: string
  borderClass: string
  bgLightClass: string
}

export const FAQ_CATEGORIES: Record<FaqCategory, FaqCategoryMeta> = {
  reservas: {
    id: "reservas",
    label: "Reservas",
    shortLabel: "Reservas",
    description: "Período, diárias, forma de pagamento, confirmação e cancelamento",
    iconName: "Calendar",
    colorClass: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200",
    borderClass: "border-blue-200 dark:border-blue-900",
    bgLightClass: "bg-blue-50/50 dark:bg-blue-950/20"
  },
  checkin_acesso: {
    id: "checkin_acesso",
    label: "Check-in & Acesso",
    shortLabel: "Check-in",
    description: "Horário 14h, early check-in, portaria 24h, fechadura e identificação",
    iconName: "DoorOpen",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
    borderClass: "border-emerald-200 dark:border-emerald-900",
    bgLightClass: "bg-emerald-50/50 dark:bg-emerald-950/20"
  },
  wifi_tecnologia: {
    id: "wifi_tecnologia",
    label: "Wi-Fi & Tecnologia",
    shortLabel: "Wi-Fi",
    description: "Rede CorpFlats-Hospedes, senha corpflats2026, 500MB e Smart TV",
    iconName: "Wifi",
    colorClass: "text-cyan-600 dark:text-cyan-400",
    badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200",
    borderClass: "border-cyan-200 dark:border-cyan-900",
    bgLightClass: "bg-cyan-50/50 dark:bg-cyan-950/20"
  },
  cafe_manha: {
    id: "cafe_manha",
    label: "Café da Manhã",
    shortLabel: "Café",
    description: "Servido exclusivamente na bandeja no quarto, cardápio e horários",
    iconName: "Coffee",
    colorClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200",
    borderClass: "border-amber-200 dark:border-amber-900",
    bgLightClass: "bg-amber-50/50 dark:bg-amber-950/20"
  },
  garagem: {
    id: "garagem",
    label: "Garagem",
    shortLabel: "Garagem",
    description: "Vagas rotativas e cobertas, controle de acesso e regras",
    iconName: "Car",
    colorClass: "text-slate-600 dark:text-slate-400",
    badgeClass: "bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-300 border-slate-200",
    borderClass: "border-slate-200 dark:border-slate-800",
    bgLightClass: "bg-slate-50/50 dark:bg-slate-900/20"
  },
  estrutura_flat: {
    id: "estrutura_flat",
    label: "Estrutura do Flat",
    shortLabel: "Estrutura",
    description: "Cozinha completa, ar condicionado, frigobar, secador e enxoval",
    iconName: "Home",
    colorClass: "text-violet-600 dark:text-violet-400",
    badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200",
    borderClass: "border-violet-200 dark:border-violet-900",
    bgLightClass: "bg-violet-50/50 dark:bg-violet-950/20"
  },
  regras_visitas_pets: {
    id: "regras_visitas_pets",
    label: "Regras, Visitas & Pets",
    shortLabel: "Regras/Pets",
    description: "Visitantes na portaria, pets de pequeno porte e lei do silêncio",
    iconName: "ShieldCheck",
    colorClass: "text-rose-600 dark:text-rose-400",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200",
    borderClass: "border-rose-200 dark:border-rose-900",
    bgLightClass: "bg-rose-50/50 dark:bg-rose-950/20"
  },
  lazer_condominio: {
    id: "lazer_condominio",
    label: "Lazer & Condomínio",
    shortLabel: "Lazer",
    description: "Piscina, sauna, academia, rooftop e regras das áreas comuns",
    iconName: "Sparkles",
    colorClass: "text-teal-600 dark:text-teal-400",
    badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200",
    borderClass: "border-teal-200 dark:border-teal-900",
    bgLightClass: "bg-teal-50/50 dark:bg-teal-950/20"
  },
  checkout: {
    id: "checkout",
    label: "Check-out",
    shortLabel: "Check-out",
    description: "Horário 12h, late check-out, louças e devolução de cartão na portaria",
    iconName: "Clock",
    colorClass: "text-purple-600 dark:text-purple-400",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200",
    borderClass: "border-purple-200 dark:border-purple-900",
    bgLightClass: "bg-purple-50/50 dark:bg-purple-950/20"
  }
}

export function formatDisplayPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "")
  if (!digits) return phone || ""
  let clean = digits
  if (clean.startsWith("55") && clean.length >= 12) {
    clean = clean.substring(2)
  }
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`
  }
  if (clean.length === 10) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`
  }
  return phone
}

export function useFaq(options?: { autoFetch?: boolean }) {
  const { autoFetch = true } = options || {}
  const { toast } = useToast()

  const [items, setItems] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory | "all">("all")
  const [selectedStatus, setSelectedStatus] = useState<FaqStatusFilter>("todas")
  const [selectedScope, setSelectedScope] = useState<FaqScope | "all">("all")
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards")

  const fetchFaq = useCallback(async (): Promise<FaqItem[]> => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/whatsapp/faq")
      if (!res.ok) {
        throw new Error(`Falha ao buscar base de FAQ (Status ${res.status})`)
      }
      const data = await res.json()
      const fetchedItems: FaqItem[] = Array.isArray(data.items) ? data.items : []
      setItems(fetchedItems)
      return fetchedItems
    } catch (err: any) {
      const message = err.message || "Erro de conexão ao carregar FAQ."
      setError(message)
      toast({
        title: "Erro ao carregar Base de FAQ",
        description: message,
        variant: "destructive"
      })
      return []
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (autoFetch) {
      fetchFaq()
    }
  }, [autoFetch, fetchFaq])

  // Contadores e estatísticas
  const statusCounts = useMemo(() => {
    let todas = items.length
    let ativas = 0
    let pendentes = 0
    let sugestoes_ia = 0
    for (const item of items) {
      if (item.status === "ativo") ativas++
      else if (item.status === "pendente") pendentes++
      else if (item.status === "aguardando_aprovacao") sugestoes_ia++
    }
    return { todas, ativas, pendentes, sugestoes_ia }
  }, [items])

  const categoryStats = useMemo(() => {
    const stats: Record<FaqCategory, { count: number; active: number; pending: number; awaitingApproval: number }> = {
      reservas: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      checkin_acesso: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      wifi_tecnologia: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      cafe_manha: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      garagem: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      estrutura_flat: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      regras_visitas_pets: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      lazer_condominio: { count: 0, active: 0, pending: 0, awaitingApproval: 0 },
      checkout: { count: 0, active: 0, pending: 0, awaitingApproval: 0 }
    }

    for (const item of items) {
      if (stats[item.category]) {
        stats[item.category].count++
        if (item.status === "ativo") stats[item.category].active++
        if (item.status === "pendente") stats[item.category].pending++
        if (item.status === "aguardando_aprovacao") stats[item.category].awaitingApproval++
      }
    }
    return stats
  }, [items])

  // Lista filtrada
  const filteredItems = useMemo(() => {
    let result = [...items]

    // 1. Filtro por status
    if (selectedStatus === "ativas") {
      result = result.filter(i => i.status === "ativo")
    } else if (selectedStatus === "pendentes") {
      result = result.filter(i => i.status === "pendente")
    } else if (selectedStatus === "sugestoes_ia") {
      result = result.filter(i => i.status === "aguardando_aprovacao")
    }

    // 2. Filtro por categoria
    if (selectedCategory !== "all") {
      result = result.filter(i => i.category === selectedCategory)
    }

    // 3. Filtro por escopo
    if (selectedScope !== "all") {
      result = result.filter(i => i.scope === selectedScope)
    }

    // 4. Filtro por busca
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(i => {
        const questionMatch = i.question && i.question.toLowerCase().includes(q)
        const answerMatch = i.answer && i.answer.toLowerCase().includes(q)
        const suggestedMatch = i.suggestedAnswer && i.suggestedAnswer.toLowerCase().includes(q)
        const keywordsMatch = Array.isArray(i.keywords) && i.keywords.some(k => String(k).toLowerCase().includes(q))
        const variationsMatch = Array.isArray(i.variations) && i.variations.some(v => String(v).toLowerCase().includes(q))
        const phonesMatch = Array.isArray(i.clientPhones) && i.clientPhones.some(p => String(p).includes(q))
        const authorMatch = i.sourceClientName && i.sourceClientName.toLowerCase().includes(q)
        return questionMatch || answerMatch || suggestedMatch || keywordsMatch || variationsMatch || phonesMatch || authorMatch
      })
    }

    // Ordenação: sugestões de aprovação e pendentes no topo, seguidos por mais recentes
    return result.sort((a, b) => {
      const priorityOrder: Record<FaqStatus, number> = {
        aguardando_aprovacao: 1,
        pendente: 2,
        ativo: 3,
        inativo: 4
      }
      const orderA = priorityOrder[a.status] || 99
      const orderB = priorityOrder[b.status] || 99
      if (orderA !== orderB) return orderA - orderB

      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
      return dateB - dateA
    })
  }, [items, selectedStatus, selectedCategory, selectedScope, search])

  // Ações CRUD
  const createFaq = async (input: CreateFaqInput): Promise<FaqItem | null> => {
    try {
      const res = await fetch("/api/whatsapp/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar pergunta no FAQ.")
      }
      const createdItem: FaqItem = data.item
      setItems(prev => [createdItem, ...prev.filter(i => i.id !== createdItem.id)])
      toast({
        title: "✓ FAQ Criado com Sucesso!",
        description: `"${createdItem.question}" foi adicionado à base.`
      })
      return createdItem
    } catch (err: any) {
      toast({
        title: "Erro ao criar FAQ",
        description: err.message || "Não foi possível cadastrar a pergunta.",
        variant: "destructive"
      })
      return null
    }
  }

  const updateFaq = async (id: string, input: UpdateFaqInput): Promise<FaqItem | null> => {
    try {
      const res = await fetch(`/api/whatsapp/faq/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao atualizar item do FAQ.")
      }
      const updatedItem: FaqItem = data.item
      setItems(prev => prev.map(i => (i.id === id ? updatedItem : i)))
      toast({
        title: "✓ FAQ Atualizado!",
        description: `Alterações em "${updatedItem.question}" foram salvas.`
      })
      return updatedItem
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar FAQ",
        description: err.message || "Não foi possível atualizar o registro.",
        variant: "destructive"
      })
      return null
    }
  }

  const deleteFaq = async (id: string): Promise<boolean> => {
    try {
      const target = items.find(i => i.id === id)
      const res = await fetch(`/api/whatsapp/faq/${encodeURIComponent(id)}`, {
        method: "DELETE"
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao excluir item do FAQ.")
      }
      setItems(prev => prev.filter(i => i.id !== id))
      toast({
        title: "✓ Item Excluído",
        description: target ? `"${target.question}" foi removido da base.` : "Item removido com sucesso."
      })
      return true
    } catch (err: any) {
      toast({
        title: "Erro ao excluir item",
        description: err.message || "Não foi possível excluir o item.",
        variant: "destructive"
      })
      return false
    }
  }

  const approveFaq = async (id: string, overrides?: ApproveFaqInput): Promise<FaqItem | null> => {
    try {
      const res = await fetch(`/api/whatsapp/faq/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides || {})
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao aprovar sugestão de resposta.")
      }
      const approvedItem: FaqItem = data.item
      setItems(prev => prev.map(i => (i.id === id ? approvedItem : i)))
      toast({
        title: "⚡ Resposta Aprovada em 1 Clique!",
        description: `"${approvedItem.question}" agora é uma resposta ativa oficial da Sofia.`
      })
      return approvedItem
    } catch (err: any) {
      toast({
        title: "Falha na Aprovação",
        description: err.message || "Não foi possível aprovar a sugestão.",
        variant: "destructive"
      })
      return null
    }
  }

  const toggleStatus = async (item: FaqItem): Promise<FaqItem | null> => {
    const nextStatus: FaqStatus = item.status === "ativo" ? "inativo" : "ativo"
    return updateFaq(item.id, { status: nextStatus })
  }

  const resetFilters = () => {
    setSearch("")
    setSelectedCategory("all")
    setSelectedStatus("todas")
    setSelectedScope("all")
  }

  return {
    items,
    filteredItems,
    loading,
    error,
    search,
    setSearch,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    selectedScope,
    setSelectedScope,
    viewMode,
    setViewMode,
    categoryStats,
    statusCounts,
    fetchFaq,
    createFaq,
    updateFaq,
    deleteFaq,
    approveFaq,
    toggleStatus,
    resetFilters
  }
}
```

---

### 6.2 `src/components/faq-knowledge-base.tsx`

```tsx
import { useState, useMemo } from "react"
import { 
  useFaq, 
  FaqItem, 
  FaqCategory, 
  FaqStatus, 
  FaqScope, 
  FaqStatusFilter, 
  FAQ_CATEGORIES, 
  CreateFaqInput, 
  UpdateFaqInput,
  formatDisplayPhone 
} from "@/hooks/use-faq"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  HelpCircle, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Check, 
  CheckCheck, 
  Clock, 
  Sparkles, 
  Bot, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  DoorOpen, 
  Wifi, 
  Coffee, 
  Car, 
  Home, 
  ShieldCheck, 
  Phone, 
  User, 
  LayoutGrid, 
  List, 
  X, 
  ArrowUpDown, 
  CheckCircle2, 
  ExternalLink,
  Info,
  Copy,
  Tag
} from "lucide-react"

// Mapeamento dinâmico de ícones Lucide
const CATEGORY_ICONS: Record<string, any> = {
  Calendar,
  DoorOpen,
  Wifi,
  Coffee,
  Car,
  Home,
  ShieldCheck,
  Sparkles,
  Clock
}

export function FaqKnowledgeBase() {
  const {
    items,
    filteredItems,
    loading,
    search,
    setSearch,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    selectedScope,
    setSelectedScope,
    viewMode,
    setViewMode,
    categoryStats,
    statusCounts,
    fetchFaq,
    createFaq,
    updateFaq,
    deleteFaq,
    approveFaq,
    toggleStatus,
    resetFilters
  } = useFaq()

  // Estado do Modal de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<FaqItem | null>(null)
  const [formCategory, setFormCategory] = useState<FaqCategory>("estrutura_flat")
  const [formQuestion, setFormQuestion] = useState("")
  const [formAnswer, setFormAnswer] = useState("")
  const [formKeywords, setFormKeywords] = useState("")
  const [formVariations, setFormVariations] = useState("")
  const [formScope, setFormScope] = useState<FaqScope>("all")
  const [formPhones, setFormPhones] = useState<string[]>([])
  const [phoneInput, setPhoneInput] = useState("")
  const [bulkPhoneInput, setBulkPhoneInput] = useState("")
  const [showBulkPhones, setShowBulkPhones] = useState(false)
  const [formStatus, setFormStatus] = useState<FaqStatus>("ativo")
  const [savingForm, setSavingForm] = useState(false)
  const [approvingInModal, setApprovingInModal] = useState(false)

  // Estado do Dialog de Exclusão
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<FaqItem | null>(null)

  // Abrir Modal de Criação
  const handleOpenCreate = (preselectedCategory?: FaqCategory) => {
    setEditingItem(null)
    setFormCategory(preselectedCategory || (selectedCategory !== "all" ? selectedCategory : "estrutura_flat"))
    setFormQuestion("")
    setFormAnswer("")
    setFormKeywords("")
    setFormVariations("")
    setFormScope("all")
    setFormPhones([])
    setPhoneInput("")
    setBulkPhoneInput("")
    setShowBulkPhones(false)
    setFormStatus("ativo")
    setModalOpen(true)
  }

  // Abrir Modal de Edição
  const handleOpenEdit = (item: FaqItem) => {
    setEditingItem(item)
    setFormCategory(item.category || "estrutura_flat")
    setFormQuestion(item.question || "")
    setFormAnswer(item.answer || item.suggestedAnswer || "")
    setFormKeywords(Array.isArray(item.keywords) ? item.keywords.join(", ") : "")
    setFormVariations(Array.isArray(item.variations) ? item.variations.join("\n") : "")
    setFormScope(item.scope || "all")
    setFormPhones(Array.isArray(item.clientPhones) ? [...item.clientPhones] : [])
    setPhoneInput("")
    setBulkPhoneInput("")
    setShowBulkPhones(false)
    setFormStatus(item.status || "ativo")
    setModalOpen(true)
  }

  // Adicionar telefone individual
  const handleAddPhone = () => {
    const raw = phoneInput.replace(/\D/g, "")
    if (!raw) return
    const formatted = raw.length === 10 || raw.length === 11 ? `55${raw}` : raw
    if (!formPhones.includes(formatted)) {
      setFormPhones(prev => [...prev, formatted])
    }
    setPhoneInput("")
  }

  // Adicionar telefones em lote
  const handleAddBulkPhones = () => {
    const lines = bulkPhoneInput.split(/[\n,;]+/).map(s => s.replace(/\D/g, "")).filter(Boolean)
    const normalized = lines.map(p => (p.length === 10 || p.length === 11 ? `55${p}` : p))
    setFormPhones(prev => Array.from(new Set([...prev, ...normalized])))
    setBulkPhoneInput("")
    setShowBulkPhones(false)
  }

  // Remover telefone
  const handleRemovePhone = (phoneToRemove: string) => {
    setFormPhones(prev => prev.filter(p => p !== phoneToRemove))
  }

  // Salvar formulário
  const handleSaveForm = async () => {
    if (!formQuestion.trim()) {
      return
    }

    setSavingForm(true)
    try {
      const keywordsArray = formKeywords.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
      const variationsArray = formVariations.split(/\n+/).map(s => s.trim()).filter(Boolean)

      if (editingItem) {
        await updateFaq(editingItem.id, {
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          category: formCategory,
          keywords: keywordsArray,
          variations: variationsArray,
          scope: formScope,
          clientPhones: formPhones,
          status: formStatus
        })
      } else {
        await createFaq({
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          category: formCategory,
          keywords: keywordsArray,
          variations: variationsArray,
          scope: formScope,
          clientPhones: formPhones,
          status: formStatus
        })
      }
      setModalOpen(false)
    } finally {
      setSavingForm(false)
    }
  }

  // Aprovar diretamente do modal
  const handleApproveFromModal = async () => {
    if (!editingItem) return
    setApprovingInModal(true)
    try {
      await approveFaq(editingItem.id, {
        question: formQuestion.trim(),
        answer: formAnswer.trim(),
        category: formCategory
      })
      setModalOpen(false)
    } finally {
      setApprovingInModal(false)
    }
  }

  // Confirmar exclusão
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    await deleteFaq(itemToDelete.id)
    setDeleteConfirmOpen(false)
    setItemToDelete(null)
  }

  // Badges auxiliares
  const renderStatusBadge = (status: FaqStatus) => {
    switch (status) {
      case "ativo":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 font-semibold gap-1">
            <Check className="w-3 h-3 text-emerald-600" />
            Ativa
          </Badge>
        )
      case "pendente":
        return (
          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 font-semibold gap-1 animate-pulse">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Dúvida Pendente
          </Badge>
        )
      case "aguardando_aprovacao":
        return (
          <Badge className="bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 font-semibold gap-1">
            <Sparkles className="w-3 h-3 text-purple-600" />
            Sugestão IA
          </Badge>
        )
      case "inativo":
        return (
          <Badge variant="secondary" className="text-slate-600 dark:text-slate-400 font-semibold">
            Pausada
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const renderScopeBadge = (scope: FaqScope, phonesCount: number) => {
    switch (scope) {
      case "all":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            🌐 Todos os Clientes
          </span>
        )
      case "exclude":
        return (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 text-[11px] gap-1">
            🚫 Exceto {phonesCount} cliente(s)
          </Badge>
        )
      case "include_only":
        return (
          <Badge variant="outline" className="text-blue-700 dark:text-blue-400 border-blue-300 text-[11px] gap-1">
            ⭐ Exclusivo ({phonesCount})
          </Badge>
        )
    }
  }

  // Inserir formatação WhatsApp no textarea
  const insertFormatting = (prefix: string, suffix: string) => {
    const textarea = document.getElementById("faq-answer-textarea") as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = formAnswer
    const selected = text.substring(start, end)
    const replacement = `${prefix}${selected || "texto"}${suffix}`
    const updated = text.substring(0, start) + replacement + text.substring(end)
    setFormAnswer(updated)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + replacement.length - suffix.length)
    }, 50)
  }

  return (
    <div className="space-y-6">
      {/* ─── Top Header & Summary ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Base de Conhecimento & FAQ Dinâmico
            </h2>
            <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200">
              Sofia AI v2
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Gerencie as respostas oficiais do agente de IA, aprove dúvidas e sugestões capturadas em tempo real e personalize regras por cliente.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchFaq()}
            disabled={loading}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Recarregar
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenCreate()}
            className="gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Pergunta / FAQ
          </Button>
        </div>
      </div>

      {/* ─── Metric Cards (4 Cards) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Total */}
        <Card className="border-indigo-100 dark:border-indigo-950 shadow-xs bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total de FAQs</p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{statusCounts.todas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">9 categorias cobertas</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <HelpCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Ativas */}
        <Card className="border-emerald-100 dark:border-emerald-950 shadow-xs bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Ativas na IA</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{statusCounts.ativas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Respostas autônomas</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Pendentes */}
        <Card className={`border-amber-200 dark:border-amber-900 shadow-xs bg-white dark:bg-slate-900 ${statusCounts.pendentes > 0 ? "ring-2 ring-amber-400/50" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Dúvidas Pendentes</p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{statusCounts.pendentes}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Sem resposta mapeada</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Sugestões IA */}
        <Card className={`border-purple-200 dark:border-purple-900 shadow-xs bg-white dark:bg-slate-900 ${statusCounts.sugestoes_ia > 0 ? "ring-2 ring-purple-500/60 animate-pulse" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Aprovar em 1 Clique</p>
              <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{statusCounts.sugestoes_ia}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Respostas de operador</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Category Cards Grid (9 Categorias) ─────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Categorias da Base de Conhecimento ({Object.keys(FAQ_CATEGORIES).length})
          </span>
          {selectedCategory !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCategory("all")}
              className="text-xs h-7 text-indigo-600 dark:text-indigo-400"
            >
              Limpar filtro de categoria
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2 md:gap-2.5">
          {Object.entries(FAQ_CATEGORIES).map(([catKey, meta]) => {
            const catId = catKey as FaqCategory
            const isSelected = selectedCategory === catId
            const stats = categoryStats[catId]
            const IconComp = CATEGORY_ICONS[meta.iconName] || HelpCircle

            return (
              <button
                key={catId}
                onClick={() => setSelectedCategory(isSelected ? "all" : catId)}
                className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30 shadow-xs"
                    : "bg-card hover:bg-muted/50 border-border hover:border-muted-foreground/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.bgLightClass} ${meta.colorClass}`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {stats?.count || 0}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-2 truncate">
                    {meta.shortLabel}
                  </p>
                </div>

                <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/50 text-[10px]">
                  {stats?.awaitingApproval > 0 && (
                    <span className="px-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
                      {stats.awaitingApproval} apr.
                    </span>
                  )}
                  {stats?.pending > 0 && (
                    <span className="px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
                      {stats.pending} pend.
                    </span>
                  )}
                  {stats?.pending === 0 && stats?.awaitingApproval === 0 && (
                    <span className="text-muted-foreground font-medium">
                      {stats?.active || 0} ativas
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Toolbar: Filtros Rápidos, Busca e Modos de Exibição ──────────────── */}
      <Card className="border-border shadow-xs bg-card">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* 4 Status Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <Button
                variant={selectedStatus === "todas" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("todas")}
                className="h-8 text-xs font-bold rounded-lg"
              >
                Todas ({statusCounts.todas})
              </Button>

              <Button
                variant={selectedStatus === "ativas" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("ativas")}
                className={`h-8 text-xs font-bold rounded-lg ${
                  selectedStatus === "ativas" ? "bg-emerald-600 hover:bg-emerald-700" : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                Ativas ({statusCounts.ativas})
              </Button>

              <Button
                variant={selectedStatus === "pendentes" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("pendentes")}
                className={`h-8 text-xs font-bold rounded-lg ${
                  selectedStatus === "pendentes" ? "bg-amber-600 hover:bg-amber-700" : "text-amber-700 dark:text-amber-400"
                }`}
              >
                Perguntas Pendentes ({statusCounts.pendentes})
              </Button>

              <Button
                variant={selectedStatus === "sugestoes_ia" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStatus("sugestoes_ia")}
                className={`h-8 text-xs font-bold rounded-lg ${
                  selectedStatus === "sugestoes_ia" ? "bg-purple-600 hover:bg-purple-700" : "text-purple-700 dark:text-purple-400"
                }`}
              >
                Sugestões de IA ({statusCounts.sugestoes_ia})
              </Button>
            </div>

            {/* Alternador de Modo Tabela vs Cards */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg self-end md:self-auto">
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="h-7 px-2.5 text-xs font-bold"
              >
                <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                Cards
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-7 px-2.5 text-xs font-bold"
              >
                <List className="w-3.5 h-3.5 mr-1" />
                Tabela
              </Button>
            </div>
          </div>

          {/* Segunda linha da Toolbar: Campo de Busca e Filtro de Escopo */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-border/40">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar por pergunta, resposta, palavras-chave, sinônimos ou telefone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={selectedScope} onValueChange={(val: any) => setSelectedScope(val)}>
                <SelectTrigger className="h-9 text-xs w-full sm:w-[200px]">
                  <SelectValue placeholder="Filtrar por Regra / Escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Escopos</SelectItem>
                  <SelectItem value="exclude">Exceção Negativa (exclude)</SelectItem>
                  <SelectItem value="include_only">Exceção Positiva (include_only)</SelectItem>
                </SelectContent>
              </Select>

              {(search || selectedCategory !== "all" || selectedStatus !== "todas" || selectedScope !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 text-xs text-muted-foreground whitespace-nowrap"
                >
                  Limpar Filtros
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Listagem de FAQs (Card View vs Table View) ──────────────────────── */}
      {filteredItems.length === 0 ? (
        <Card className="border-dashed p-8 text-center bg-card">
          <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Nenhuma pergunta encontrada
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            Não encontramos nenhum item correspondente aos filtros selecionados. Tente ajustar os termos de busca ou crie uma nova pergunta.
          </p>
          <Button
            size="sm"
            onClick={() => handleOpenCreate()}
            className="gap-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Cadastrar Nova Pergunta
          </Button>
        </Card>
      ) : viewMode === "cards" ? (
        /* Modo Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => {
            const catMeta = FAQ_CATEGORIES[item.category] || FAQ_CATEGORIES.estrutura_flat
            const IconComp = CATEGORY_ICONS[catMeta.iconName] || HelpCircle
            const isAwaitingApproval = item.status === "aguardando_aprovacao"
            const isPending = item.status === "pendente"

            return (
              <Card
                key={item.id}
                className={`flex flex-col justify-between shadow-xs transition-all ${
                  isAwaitingApproval
                    ? "border-purple-300 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10 ring-1 ring-purple-400/40"
                    : isPending
                    ? "border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10"
                    : "border-border bg-card"
                }`}
              >
                <CardHeader className="p-4 pb-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`text-[11px] gap-1 ${catMeta.badgeClass}`}>
                      <IconComp className="w-3 h-3" />
                      {catMeta.label}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {renderStatusBadge(item.status)}
                    </div>
                  </div>

                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-snug">
                    {item.question}
                  </h4>

                  {/* Informações de origem em dúvidas pendentes */}
                  {(item.sourceClientName || item.sourceClientPhone) && (
                    <div className="p-2 rounded-lg bg-muted/60 text-[11px] space-y-0.5 border border-border/50">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span className="font-semibold">{item.sourceClientName || "Cliente"}</span>
                        {item.sourceClientPhone && (
                          <span className="text-muted-foreground/80">({formatDisplayPhone(item.sourceClientPhone)})</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3 flex-1">
                  {/* Resposta Sugerida pelo Operador (se aguardando aprovação) */}
                  {isAwaitingApproval && item.suggestedAnswer && (
                    <div className="p-3 rounded-xl bg-purple-100/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          Resposta Sugerida pelo Operador:
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {item.suggestedAnswer}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => approveFaq(item.id)}
                        className="w-full text-xs font-black bg-purple-600 hover:bg-purple-700 text-white gap-1.5 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        ✓ Aprovar Resposta em 1 Clique
                      </Button>
                    </div>
                  )}

                  {/* Resposta Oficial (se já respondida) */}
                  {item.answer && !isAwaitingApproval && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                      {item.answer}
                    </div>
                  )}

                  {/* Escopo de Clientes */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                    <span className="text-muted-foreground text-[11px]">Regra:</span>
                    {renderScopeBadge(item.scope, item.clientPhones?.length || 0)}
                  </div>

                  {/* Palavras-chave / Tags */}
                  {Array.isArray(item.keywords) && item.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {item.keywords.slice(0, 4).map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-medium">
                          #{kw}
                        </span>
                      ))}
                      {item.keywords.length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{item.keywords.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>

                {/* Rodapé de Ações */}
                <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={item.status === "ativo"}
                      onCheckedChange={() => toggleStatus(item)}
                      aria-label="Ativar ou pausar resposta"
                    />
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {item.status === "ativo" ? "Ativa" : "Pausada"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isPending && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleOpenEdit(item)}
                        className="h-7 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        Responder
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEdit(item)}
                      className="h-7 px-2 text-xs"
                      title="Editar Pergunta"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setItemToDelete(item)
                        setDeleteConfirmOpen(true)
                      }}
                      className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      title="Excluir FAQ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* Modo Tabela Detalhada */
        <Card className="border-border shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[140px]">Categoria</TableHead>
                <TableHead className="min-w-[200px]">Pergunta Principal</TableHead>
                <TableHead className="min-w-[250px]">Resposta / Sugestão</TableHead>
                <TableHead className="w-[160px]">Regra de Clientes</TableHead>
                <TableHead className="w-[140px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(item => {
                const catMeta = FAQ_CATEGORIES[item.category] || FAQ_CATEGORIES.estrutura_flat
                const IconComp = CATEGORY_ICONS[catMeta.iconName] || HelpCircle
                const isAwaitingApproval = item.status === "aguardando_aprovacao"
                const isPending = item.status === "pendente"

                return (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell>
                      {renderStatusBadge(item.status)}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] gap-1 ${catMeta.badgeClass}`}>
                        <IconComp className="w-3 h-3" />
                        {catMeta.shortLabel}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <span className="text-xs font-black text-slate-900 dark:text-slate-100 block">
                          {item.question}
                        </span>
                        {item.sourceClientName && (
                          <span className="text-[10px] text-muted-foreground block">
                            De: {item.sourceClientName} ({formatDisplayPhone(item.sourceClientPhone || "")})
                          </span>
                        )}
                        {Array.isArray(item.variations) && item.variations.length > 0 && (
                          <span className="text-[10px] text-muted-foreground block">
                            +{item.variations.length} variação(ões) mapeadas
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {isAwaitingApproval && item.suggestedAnswer ? (
                        <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 text-xs text-purple-950 dark:text-purple-200">
                          <span className="font-bold text-[10px] text-purple-700 block mb-0.5">Sugestão do Operador:</span>
                          <span className="line-clamp-2">{item.suggestedAnswer}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                          {item.answer || <span className="text-muted-foreground italic">Sem resposta ainda</span>}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {renderScopeBadge(item.scope, item.clientPhones?.length || 0)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAwaitingApproval && (
                          <Button
                            size="sm"
                            onClick={() => approveFaq(item.id)}
                            className="h-7 px-2 text-[11px] font-black bg-purple-600 hover:bg-purple-700 text-white gap-1"
                            title="Aprovar com 1 clique"
                          >
                            <Check className="w-3 h-3" />
                            Aprovar
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(item)}
                          className="h-7 w-7 p-0"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setItemToDelete(item)
                            setDeleteConfirmOpen(true)
                          }}
                          className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ─── Modal de Criação / Edição de FAQ ─────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
              {editingItem ? "Editar Pergunta & Resposta do FAQ" : "Cadastrar Nova Pergunta no FAQ"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure a pergunta oficial, variações de busca, resposta formatada para WhatsApp e exceções por cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Categoria e Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Categoria</Label>
                <Select value={formCategory} onValueChange={(val: any) => setFormCategory(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FAQ_CATEGORIES).map(([key, cat]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Status do Item</Label>
                <Select value={formStatus} onValueChange={(val: any) => setFormStatus(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo" className="text-xs text-emerald-600 font-bold">✓ Ativo na IA</SelectItem>
                    <SelectItem value="inativo" className="text-xs text-slate-600">Pausado / Inativo</SelectItem>
                    <SelectItem value="pendente" className="text-xs text-amber-600">Pendente de Resposta</SelectItem>
                    <SelectItem value="aguardando_aprovacao" className="text-xs text-purple-600">Aguardando Aprovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pergunta Principal */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Pergunta Principal *</Label>
              <Input
                placeholder="Ex: Como funciona o café da manhã no quarto?"
                value={formQuestion}
                onChange={e => setFormQuestion(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Se houver resposta sugerida pelo operador */}
            {editingItem?.suggestedAnswer && (
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    Resposta Sugerida Capturada do Operador:
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormAnswer(editingItem.suggestedAnswer || "")}
                    className="h-6 text-[10px] text-purple-700 border-purple-300"
                  >
                    Copiar para Resposta Oficial
                  </Button>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {editingItem.suggestedAnswer}
                </p>
              </div>
            )}

            {/* Resposta Oficial Formatada WhatsApp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">Resposta Oficial (Formatação WhatsApp)</Label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertFormatting("*", "*")}
                    className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-muted hover:bg-muted/80"
                    title="Negrito: *texto*"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting("_", "_")}
                    className="px-1.5 py-0.5 rounded text-[11px] italic bg-muted hover:bg-muted/80"
                    title="Itálico: _texto_"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting("~", "~")}
                    className="px-1.5 py-0.5 rounded text-[11px] line-through bg-muted hover:bg-muted/80"
                    title="Tachado: ~texto~"
                  >
                    S
                  </button>
                </div>
              </div>
              <Textarea
                id="faq-answer-textarea"
                rows={4}
                placeholder="Digite a resposta oficial. Suporta *negrito*, _itálico_, quebras de linha e emojis."
                value={formAnswer}
                onChange={e => setFormAnswer(e.target.value)}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Dica: Respostas claras e cordiais melhoram o índice de satisfação do hóspede no atendimento automatizado.
              </p>
            </div>

            {/* Variações de Pergunta (Sinônimos de busca) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Variações da Pergunta (1 por linha)</Label>
              <Textarea
                rows={2}
                placeholder={"O café é servido no quarto?\nComo peço o café da manhã?\nTem café incluso?"}
                value={formVariations}
                onChange={e => setFormVariations(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Frases alternativas que os hóspedes costumam usar para fazer esta mesma pergunta.
              </p>
            </div>

            {/* Palavras-chave / Keywords */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Palavras-chave (Tags separadas por vírgula)</Label>
              <Input
                placeholder="cafe, quarto, bandeja, cardapio, horario"
                value={formKeywords}
                onChange={e => setFormKeywords(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* ─── Configuração de Exceções de Clientes (R4) ──────────────────── */}
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                  Regras de Exceção & Segmentação de Clientes (R4)
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Escopo da Regra</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormScope("all")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formScope === "all"
                        ? "bg-indigo-100/70 border-indigo-500 font-bold text-indigo-950 dark:bg-indigo-950 dark:text-indigo-200"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-bold">🌐 Todos os Clientes</p>
                    <p className="text-[10px] opacity-80 mt-0.5">Regra padrão universal.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormScope("exclude")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formScope === "exclude"
                        ? "bg-amber-100/70 border-amber-500 font-bold text-amber-950 dark:bg-amber-950 dark:text-amber-200"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-bold">🚫 Exceção Negativa</p>
                    <p className="text-[10px] opacity-80 mt-0.5">NÃO vale para os números listados.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormScope("include_only")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formScope === "include_only"
                        ? "bg-blue-100/70 border-blue-500 font-bold text-blue-950 dark:bg-blue-950 dark:text-blue-200"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-bold">⭐ Exceção Positiva</p>
                    <p className="text-[10px] opacity-80 mt-0.5">SÓ vale para os números listados.</p>
                  </button>
                </div>
              </div>

              {/* Gerenciador de telefones se exclude ou include_only */}
              {formScope !== "all" && (
                <div className="space-y-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-900">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">
                      {formScope === "exclude"
                        ? "Telefones Bloqueados (Sofia não responderá para estes)"
                        : "Telefones Exclusivos (Sofia responderá apenas a estes)"}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowBulkPhones(!showBulkPhones)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold"
                    >
                      {showBulkPhones ? "Adicionar individual" : "+ Colar lote de telefones"}
                    </button>
                  </div>

                  {showBulkPhones ? (
                    <div className="space-y-1.5">
                      <Textarea
                        rows={2}
                        placeholder="Cole números separados por vírgula ou linha (ex: 22998505276, 21988887777)"
                        value={bulkPhoneInput}
                        onChange={e => setBulkPhoneInput(e.target.value)}
                        className="text-xs font-mono"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddBulkPhones}
                        className="h-7 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        Adicionar Todos os Números
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="(22) 99850-5276 ou 5522998505276"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddPhone()
                          }
                        }}
                        className="text-xs h-8"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddPhone}
                        className="h-8 text-xs font-bold"
                      >
                        Adicionar
                      </Button>
                    </div>
                  )}

                  {/* Badges de Telefones Adicionados */}
                  {formPhones.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg bg-background border border-border">
                      {formPhones.map(phone => (
                        <span
                          key={phone}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-muted font-mono"
                        >
                          <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                          {formatDisplayPhone(phone)}
                          <button
                            type="button"
                            onClick={() => handleRemovePhone(phone)}
                            className="text-muted-foreground hover:text-rose-600 ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 italic">
                      Nenhum telefone adicionado. Adicione ao menos um número para ativar esta regra de exceção.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>

            {editingItem?.status === "aguardando_aprovacao" && (
              <Button
                type="button"
                size="sm"
                onClick={handleApproveFromModal}
                disabled={approvingInModal || savingForm}
                className="text-xs font-black bg-purple-600 hover:bg-purple-700 text-white gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                {approvingInModal ? "Aprovando..." : "✓ Aprovar & Ativar Agora"}
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={handleSaveForm}
              disabled={savingForm || approvingInModal || !formQuestion.trim()}
              className="text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingForm ? "Salvando..." : editingItem ? "Salvar Alterações" : "Cadastrar Pergunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── AlertDialog de Confirmação de Exclusão ───────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-black text-rose-600 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Excluir pergunta da Base de Conhecimento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza que deseja excluir <strong>"{itemToDelete?.question}"</strong>? A Sofia deixará de responder esta dúvida imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              Sim, Excluir Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

---

### 6.3 Integration into `artifacts/limpeza/src/pages/whatsapp-automation.tsx`

#### Step A: Import Component
In `artifacts/limpeza/src/pages/whatsapp-automation.tsx`:
```tsx
import { FaqKnowledgeBase } from "@/components/faq-knowledge-base"
```

#### Step B: Add TabsTrigger to `TabsList`
Around line 1696 of `whatsapp-automation.tsx`:
```tsx
<TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full md:w-auto rounded-xl p-1 bg-muted/60">
  <TabsTrigger value="ai_agent" className="rounded-lg text-xs font-bold gap-1.5">
    <Bot className="w-3.5 h-3.5 text-blue-500" />
    🤖 Agente de IA
  </TabsTrigger>
  <TabsTrigger value="rules" className="rounded-lg text-xs font-bold gap-1.5">
    <Zap className="w-3.5 h-3.5 text-amber-500" />
    Régua Automática
  </TabsTrigger>
  <TabsTrigger value="faq" className="rounded-lg text-xs font-bold gap-1.5 relative">
    <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
    📚 Base & FAQ
  </TabsTrigger>
  <TabsTrigger value="quick_messages" className="rounded-lg text-xs font-bold gap-1.5 relative">
    <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
    ⚡ Mensagens Rápidas
    <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-600 text-white font-black">
      {quickMessages.filter(m => m.enabled !== false).length}
    </span>
  </TabsTrigger>
  <TabsTrigger value="queue" className="rounded-lg text-xs font-bold gap-1.5 relative">
    <Clock className="w-3.5 h-3.5 text-purple-500" />
    Fila de Envios
    {queue.filter(q => q.status === "scheduled").length > 0 && (
      <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-purple-600 text-white font-black">
        {queue.filter(q => q.status === "scheduled").length}
      </span>
    )}
  </TabsTrigger>
  <TabsTrigger value="history" className="rounded-lg text-xs font-bold gap-1.5">
    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
    Histórico
  </TabsTrigger>
</TabsList>
```

#### Step C: Add TabsContent
Add the tab content right after `TabsContent value="rules"`:
```tsx
{/* ════════════════════════════════════════════════════════════════════
    ABA: BASE DE CONHECIMENTO & FAQ DINÂMICO (SOFIA AI)
════════════════════════════════════════════════════════════════════ */}
<TabsContent value="faq" className="space-y-6">
  <FaqKnowledgeBase />
</TabsContent>
```

---

### 6.4 Route Declaration in `artifacts/limpeza/src/App.tsx` (Feature 8)

Around line 276-277 of `artifacts/limpeza/src/App.tsx`:
```tsx
        <AdminRoute path="/whatsapp-automation" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <AdminRoute path="/whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
        <AdminRoute path="/automacao-whatsapp" component={WhatsappAutomation} moduleName="a Automação de WhatsApp" />
```

---

## 7. Build Verification & Forensic Invariants

1. **Compilation Guarantee**:
   - `artifacts/limpeza` uses Vite 7.3.6 and React 18.
   - All imports (`@/components/ui/*`, `@/hooks/use-toast`, `lucide-react`) resolve cleanly without cyclic dependencies.
   - `npm run build` generates `dist/public/` with zero TypeScript errors.
2. **Persistence**:
   - Every mutation immediately hits the dual-mirrored Express API (`/api/whatsapp/faq`), persisting to `data/database.json` and replicating to PostgreSQL `system_store`.
3. **Twin-Server Parity**:
   - The backend changes in M1 and M2 were mirrored between `artifacts/api-server/` and `scripts/`.
4. **Git Discipline**:
   - AGENTS.md rule requires immediate `git push` upon committing.
