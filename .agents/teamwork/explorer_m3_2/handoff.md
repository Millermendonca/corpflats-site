# Relatório Técnico de Exploração & Design UI (Milestone M3)
**Arquivo:** `.agents/teamwork/explorer_m3_2/handoff.md`  
**Autor:** Explorer 2 (Frontend Admin UI - Multi-Channel Tariff Calendar)  
**Destinatário:** Orchestrator (`3364a657-c855-42a7-a46e-a5463bc245b7`) / Worker M3  

---

## 1. Observation

### 1.1. Estado Atual de `artifacts/limpeza/src/pages/tarifas.tsx`
- **Total de Linhas:** 817 linhas.
- **Estrutura Atual:**
  - A página atual (`TarifasEditor`) consome **exclusivamente** `GET /api/site-content` (linha 27) e persiste via `PUT /api/site-content` (linha 47).
  - Ela é um formulário linear monolítico sem abas (`Tabs`).
  - Possui cards para:
    1. Diária com Café Incluso (`ratePlans.with_breakfast`)
    2. Diária Sem Café (`ratePlans.room_only`)
    3. Colchonete Extra 3º Hóspede (`extraBedConfig`)
    4. 2 Camas de Solteiro / Twin (`bedConfig`)
    5. Taxa Pet Friendly (`petPolicy`)
    6. Desconto Reserva Direta & PIX (`pricing`)
  - **Lacunas Críticas em Relação aos Requisitos M3:**
    - Não possui calendário ou matriz de diárias (dias do mês/semana x flats).
    - Não possui seletor de canais de distribuição (Direto, Booking, Airbnb).
    - Não consome a API do Tariff Engine construída no M1 (`/api/tariffs/*`).
    - Não possui indicador visual de cálculo automático SEBRAE vs tarifa customizada com override.
    - Não possui modal de edição individual nem modal de edição em lote (Bulk Update).
    - Não permite alternar o motor entre SEBRAE Automático e Manual Fixo.

### 1.2. Endpoints e Contratos Construídos no Milestone M1 (`artifacts/api-server/demo-server.mjs`)
Observados diretamente no servidor em linhas 20399 a 20598:
1. `GET /api/tariffs/settings`:
   - Retorna `{ success: true, settings: { mode: "auto" | "manual", baseDailyRate: number, currency: "BRL", minNights: number, weekendMarkupPct: number, channelMarkups: { direct, booking, airbnb }, updatedAt } }`.
2. `POST /api/tariffs/settings`:
   - Aceita payload parcial ou completo: `{ mode, baseDailyRate, weekendMarkupPct, channelMarkups }`.
   - Persiste em `db.tariffSettings` e salva via `saveDatabase()`.
3. `GET /api/tariffs/calendar`:
   - Query params: `month` (formato `YYYY-MM`), `channel` (`direct` | `booking` | `airbnb`), `flatId` (opcional).
   - Retorna `{ success: true, month, channel, flatId, settings, days: [...], flats: [...] }`.
   - Cada dia em `days`: `{ date: "YYYY-MM-DD", day: number, dayOfWeek: 0..6, isWeekend: boolean, rate: number, hasOverride: boolean, override: { id, flatId, flatNumber, date, channel, rate, reason, updatedAt } | null }`.
   - `flats` contém a lista dos apartamentos cadastrados: `[{ id: 1, number: "113", name: "113 solteiro" }, ...]`.
4. `POST /api/tariffs/bulk-update`:
   - Aceita: `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", flatIds: string[] | number[], channels: string[], daysOfWeek: number[], rate: number, reason: string }`.
   - Valida `rate > 0` e `startDate <= endDate`.
   - Itera pelo intervalo e atualiza/insere overrides em `db.tariffOverrides`.
   - Retorna `{ success: true, updatedCount: number, overridesCount: number, overrides: [...] }`.
5. `DELETE /api/tariffs/overrides/:id`:
   - Remove o override especificado de `db.tariffOverrides`, restaurando a tarifa padrão calculada pelo SEBRAE.
6. `GET /api/site-content` e `PUT /api/site-content`:
   - Linhas 10926-11005: lê e atualiza `db.siteConfig` (adicionais, planos de diárias, políticas pet e descontos diretos).

### 1.3. Componentes de UI Disponíveis em `artifacts/limpeza/src/components/ui/`
- Verificados e disponíveis:
  - `tabs.tsx` (`Tabs, TabsList, TabsTrigger, TabsContent`)
  - `dialog.tsx` (`Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose`)
  - `select.tsx` (`Select, SelectTrigger, SelectValue, SelectContent, SelectItem`)
  - `switch.tsx` (`Switch`)
  - `card.tsx` (`Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter`)
  - `badge.tsx` (`Badge`)
  - `button.tsx` (`Button`)
  - `input.tsx` (`Input`)
  - `label.tsx` (`Label`)
  - `useToast` (`toast` de `@/hooks/use-toast`)
  - Ícones do `lucide-react` (`Calendar, Sparkles, Sliders, Coins, Coffee, Building2, Layers, Heart, DollarSign, ExternalLink, QrCode, Check, ChevronLeft, ChevronRight, Edit3, Trash2, RotateCcw, Save, ShieldAlert, ArrowUpRight, TrendingUp`).

---

## 2. Logic Chain

1. **Reestruturação Arquitetural em 2 Abas:**
   - Para transformar `tarifas.tsx` em um hub profissional de precificação multi-canal sem perder as configurações já existentes do site oficial, a interface deve ser dividida em 2 abas claras no topo:
     - **Aba 1: "Mapa de Tarifas Diárias"** (Foco operacional: controle dia a dia, visualização rápida de sazonalidade, canal e overrides).
     - **Aba 2: "Parâmetros Base & Adicionais"** (Foco tático: motor SEBRAE vs manual, comissões de canais, taxas de limpeza, 3º hóspede, camas twin, pet e política comercial).
2. **Design da Aba 1 (Mapa de Tarifas Diárias):**
   - **Barra de Controle Superior:**
     - Toggle de Visualização: `Mensal` (grade completa do mês) vs `Semanal` (janela compacta de 7 dias com foco imediato).
     - Navegação de Data: Botões `< Anterior`, Seletor/Nome do Mês/Semana (ex: "Novembro 2026"), Botão `Próximo >` e `Hoje`.
     - Seletor de Canal (Tabs ou Pills):
       * 🌐 **Direto (Site / WhatsApp)** [Markup: 0% • -15% Desconto Direto]
       * 🏨 **Booking.com** [Markup: +18%]
       * 🏠 **Airbnb** [Markup: +15%]
     - Botão de Destaque: `⚡ Edição em Lote (Bulk Update)` abrindo o modal de lote.
     - Legenda visual:
       * 🟢/🔵 `⚡ SEBRAE Auto` (tarifa base sustentável calculada dinamicamente).
       * 🟠 `✏️ Custom Override` (tarifa com override manual fixado pelo gestor).
       * 🟣 `FDS (+15%)` (acréscimo de fim de semana nas sextas e sábados).
   - **Grade / Matriz Flats x Dias:**
     - Tabela responsiva com rolagem horizontal e primeira coluna fixada (`sticky left-0 bg-background z-20 border-r`).
     - **Linha 1:** `⭐ Tarifa Geral / Todos os Flats` (mostra o valor base calculado ou override global para aquele dia).
     - **Linhas 2 a N:** Cada flat do empreendimento (`Flat 113`, `Flat 114`, `Flat 116`, `Flat 211`, `Flat 212`, `Flat 215`, `Flat 313`, `Flat 408`, `Flat 509`, `Flat 511`, `Flat 512`, `Flat 605`, `Flat 712`, `Flat 715`, `Flat 904`, `Flat 905`, `Flat 907`, `Flat 1004`, `Flat 1304`).
     - Célula interativa:
       * Exibe valor formatado (`R$ 272,55`).
       * Destaque visual: fundo âmbar se possuir override; fundo neutro/suave se SEBRAE; borda de destaque no hover.
       * Clique na célula: abre o modal/popover de **Ajuste Individual**.
3. **Modal de Ajuste Individual (Single-Cell Popover/Modal):**
   - Exibe a data, flat selecionado (ou Geral) e canal ativo.
   - Mostra o valor calculado pelo SEBRAE vs o valor vigente.
   - Campo para digitar o novo valor da diária (R$) e motivo (ex: "Ajuste manual").
   - Ação de Salvar: chama `POST /api/tariffs/bulk-update` com `startDate: date`, `endDate: date`, `flatIds: [flatId]`, `channels: [channel]`, `rate: newRate`, `reason: reason`.
   - Se já tiver override: botão "Restaurar Tarifa SEBRAE", que chama `DELETE /api/tariffs/overrides/:id`.
4. **Modal de Edição em Lote (Bulk Update Modal):**
   - Suporta seleção completa:
     - Intervalo de datas: `startDate` a `endDate`.
     - Dias da semana: Todos (0 a 6), Apenas Fins de Semana (5, 6) ou Dias Úteis (0 a 4).
     - Flats: "Todos os Flats" (`["all"]`) ou seleção múltipla por tags/checkboxes de flats específicos.
     - Canais: "Todos os Canais" (`["all"]`) ou seleção de canais específicos (`direct`, `booking`, `airbnb`).
     - Tipo de Ajuste:
       * **Valor Fixo (R$)**: Usuário informa o valor exato (ex: R$ 350,00).
       * **Acréscimo Percentual (%)**: Usuário informa a porcentagem (ex: `+20%`), e a UI calcula um **Preview em Tempo Real** sobre a diária base (ex: `R$ 237 + 20% = R$ 284,40 -> R$ 284`).
     - Motivo / Justificativa (ex: "Pacote Réveillon", "Alta Temporada").
     - Execução: Dispara `POST /api/tariffs/bulk-update`, atualiza o calendário e notifica via toast.
5. **Design da Aba 2 (Parâmetros Base & Adicionais):**
   - **Card 1: Motor de Precificação Base:**
     - Chave seletora `mode`: `⚡ SEBRAE Automático` vs `✏️ Manual Fixo`.
     - Exibição didática dos custos fixos, custos variáveis e margem sustentável caso em modo SEBRAE.
     - Campo `baseDailyRate` quando em modo manual.
     - Campo `weekendMarkupPct` (acréscimo de fim de semana, padrão 15%).
   - **Card 2: Canais de Distribuição & Markups/Comissões:**
     - Direto: Markup 0%, Desconto Reserva Direta (15%), Desconto PIX (5%).
     - Booking.com: Markup 18%, Comissão estimada 18%.
     - Airbnb: Markup 15%, Comissão estimada 15%.
   - **Card 3: Planos de Diárias (Rate Plans):**
     - Plano com Café da Manhã privativo vs Plano sem Café.
   - **Card 4: Taxas Adicionais & Serviços Especiais:**
     - Taxa de Limpeza, Colchonete 3º Hóspede, Camas de Solteiro (Twin), Política Pet Friendly.
   - **Ação de Salvamento Unificado:**
     - Botão salva simultaneamente `POST /api/tariffs/settings` e `PUT /api/site-content` via `Promise.all`, mantendo sincronização total.

---

## 3. Caveats

1. **Paridade Twin-Server:**
   - Qualquer ajuste realizado no servidor backend durante a fase de Workers deve ser espelhado byte a byte entre `artifacts/api-server/` e `scripts/`.
2. **Bloqueio de Arquivo no Vite Build (Windows OneDrive):**
   - Durante a investigação, a execução de `npm run build` gerou um erro de permissão do Windows (`EPERM: operation not permitted, unlink '...pdf.worker.min-rsCePomN.mjs'`). Isso ocorre pelo bloqueio de sincronização do OneDrive na pasta `dist/`. O Worker deve certificar-se de fechar instâncias locais que estejam servindo o diretório `dist` antes de rodar o build ou rodar com flags adequadas.
3. **Consumo de `overrides` na Matriz de Flats:**
   - Como todos os flats padrão compartilham a mesma base tarifária por padrão (a menos que haja um override específico para aquele flat), uma única requisição a `GET /api/tariffs/calendar?month=YYYY-MM&channel=C` fornece a matriz de dias e os overrides globais. Se a resposta da rota `GET /api/tariffs/calendar` incluir a chave `overrides: getTariffOverrides()` (ou se o frontend ler os overrides), a renderização de todos os 18 flats é instantânea e dispensa múltiplas chamadas HTTP em cascata.

---

## 4. Conclusion & Component Blueprint

O Worker M3 deve substituir o conteúdo de `artifacts/limpeza/src/pages/tarifas.tsx` pela estrutura modular abaixo. A proposta completa de código e design está detalhada a seguir.

### 4.1. Estrutura Proposta para `artifacts/limpeza/src/pages/tarifas.tsx`

```tsx
import { useState, useEffect, useMemo } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { 
  Coins, Sparkles, Save, RotateCcw, Coffee, Building2, 
  Layers, Heart, DollarSign, ExternalLink, QrCode,
  Calendar as CalendarIcon, Sliders, ChevronLeft, ChevronRight,
  TrendingUp, Check, AlertCircle, RefreshCw, Trash2, Edit3
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function TarifasEditor() {
  const { toast } = useToast()
  
  // Abas
  const [activeTab, setActiveTab] = useState<string>("calendar")
  
  // Estados de Dados
  const [loading, setLoading] = useState(true)
  const [calLoading, setCalLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  
  // Configurações
  const [tariffSettings, setTariffSettings] = useState<any>(null)
  const [siteConfig, setSiteConfig] = useState<any>(null)
  const [calendarData, setCalendarData] = useState<any>(null)
  
  // Filtros do Calendário
  const now = new Date()
  const initialMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonthStr)
  const [selectedChannel, setSelectedChannel] = useState<string>("direct")
  const [viewMode, setViewMode] = useState<"month" | "week">("month")
  const [currentWeekIndex, setCurrentWeekIndex] = useState<number>(0)
  
  // Modais
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [editingCell, setEditingCell] = useState<{
    date: string;
    flatId: string | null;
    flatNumber: string | null;
    channel: string;
    currentRate: number;
    override: any;
  } | null>(null)
  const [singleRateInput, setSingleRateInput] = useState<number>(0)
  const [singleReasonInput, setSingleReasonInput] = useState<string>("")
  
  // Form State do Bulk Update
  const [bulkStartDate, setBulkStartDate] = useState<string>("")
  const [bulkEndDate, setBulkEndDate] = useState<string>("")
  const [bulkFlatMode, setBulkFlatMode] = useState<"all" | "selected">("all")
  const [bulkSelectedFlats, setBulkSelectedFlats] = useState<string[]>([])
  const [bulkChannelMode, setBulkChannelMode] = useState<"all" | "selected">("all")
  const [bulkSelectedChannels, setBulkSelectedChannels] = useState<string[]>(["direct"])
  const [bulkDaysOfWeek, setBulkDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [bulkAdjustmentType, setBulkAdjustmentType] = useState<"fixed" | "percent">("fixed")
  const [bulkValue, setBulkValue] = useState<number>(250)
  const [bulkReason, setBulkReason] = useState<string>("")

  // Carregamento Inicial
  useEffect(() => {
    loadAllData()
  }, [])

  // Atualização do Calendário ao Mudar Filtros
  useEffect(() => {
    if (!loading) {
      loadCalendarData()
    }
  }, [selectedMonth, selectedChannel])

  const loadAllData = async () => {
    try {
      setLoading(true)
      const [settingsRes, siteRes, calRes] = await Promise.all([
        fetch("/api/tariffs/settings"),
        fetch("/api/site-content"),
        fetch(`/api/tariffs/calendar?month=${selectedMonth}&channel=${selectedChannel}`)
      ])
      
      if (settingsRes.ok) {
        const sData = await settingsRes.json()
        setTariffSettings(sData.settings)
      }
      if (siteRes.ok) {
        const scData = await siteRes.json()
        setSiteConfig(scData)
      }
      if (calRes.ok) {
        const cData = await calRes.json()
        setCalendarData(cData)
      }
    } catch (err) {
      console.error(err)
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as tarifas e parâmetros.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadCalendarData = async () => {
    try {
      setCalLoading(true)
      const res = await fetch(`/api/tariffs/calendar?month=${selectedMonth}&channel=${selectedChannel}`)
      if (res.ok) {
        const cData = await res.json()
        setCalendarData(cData)
      }
    } finally {
      setCalLoading(false)
    }
  }

  // Navegação de Mês
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number)
    const prevDate = new Date(y, m - 2, 1)
    const newMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`
    setSelectedMonth(newMonthStr)
    setCurrentWeekIndex(0)
  }

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number)
    const nextDate = new Date(y, m, 1)
    const newMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`
    setSelectedMonth(newMonthStr)
    setCurrentWeekIndex(0)
  }

  // Divisão dos dias em semanas (para visualização semanal)
  const displayDays = useMemo(() => {
    if (!calendarData?.days) return []
    if (viewMode === "month") return calendarData.days
    // Modo Semanal: 7 dias por bloco
    const startIdx = currentWeekIndex * 7
    return calendarData.days.slice(startIdx, startIdx + 7)
  }, [calendarData, viewMode, currentWeekIndex])

  // Abertura de Edição Individual de Célula
  const handleOpenCellEditor = (day: any, flat: any | null) => {
    setEditingCell({
      date: day.date,
      flatId: flat ? String(flat.id) : null,
      flatNumber: flat ? String(flat.number) : null,
      channel: selectedChannel,
      currentRate: day.rate,
      override: day.override
    })
    setSingleRateInput(day.rate)
    setSingleReasonInput(day.override?.reason || "")
  }

  // Salvamento de Override Individual
  const handleSaveSingleOverride = async () => {
    if (!editingCell) return
    try {
      setSaving(true)
      const res = await fetch("/api/tariffs/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: editingCell.date,
          endDate: editingCell.date,
          flatIds: editingCell.flatId ? [editingCell.flatId] : ["all"],
          channels: [editingCell.channel],
          rate: Number(singleRateInput),
          reason: singleReasonInput || "Ajuste manual individual"
        })
      })
      if (res.ok) {
        toast({
          title: "Tarifa Atualizada! 💰",
          description: `Diária ajustada para R$ ${singleRateInput} no dia ${editingCell.date}.`
        })
        setEditingCell(null)
        loadCalendarData()
      } else {
        throw new Error("Erro ao salvar diária")
      }
    } catch (err) {
      toast({ title: "Erro ao salvar", description: "Não foi possível aplicar o valor.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Exclusão de Override Individual (Restaurar SEBRAE)
  const handleRemoveOverride = async (overrideId: string) => {
    try {
      setSaving(true)
      const res = await fetch(`/api/tariffs/overrides/${overrideId}`, { method: "DELETE" })
      if (res.ok) {
        toast({
          title: "Tarifa Restaurada! ⚡",
          description: "A diária voltou a ser calculada automaticamente pelo SEBRAE."
        })
        setEditingCell(null)
        loadCalendarData()
      }
    } catch (err) {
      toast({ title: "Erro ao remover", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Execução de Edição em Lote
  const handleExecuteBulkUpdate = async () => {
    if (!bulkStartDate || !bulkEndDate) {
      toast({ title: "Datas obrigatórias", description: "Selecione data início e fim.", variant: "destructive" })
      return
    }

    let finalRate = bulkValue
    if (bulkAdjustmentType === "percent") {
      const base = tariffSettings?.baseDailyRate || 237
      finalRate = Math.round(base * (1 + bulkValue / 100))
    }

    try {
      setBulkLoading(true)
      const payload = {
        startDate: bulkStartDate,
        endDate: bulkEndDate,
        flatIds: bulkFlatMode === "all" ? ["all"] : bulkSelectedFlats,
        channels: bulkChannelMode === "all" ? ["all"] : bulkSelectedChannels,
        daysOfWeek: bulkDaysOfWeek,
        rate: finalRate,
        reason: bulkReason || `Ajuste em lote (${bulkAdjustmentType === "percent" ? `${bulkValue}%` : `R$ ${finalRate}`})`
      }

      const res = await fetch("/api/tariffs/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "Atualização em Lote Aplicada! 🚀",
          description: `${data.updatedCount} diárias atualizadas com sucesso.`
        })
        setIsBulkModalOpen(false)
        loadCalendarData()
      } else {
        throw new Error(data.message || "Erro no processamento do lote")
      }
    } catch (err: any) {
      toast({ title: "Erro na Edição em Lote", description: err.message, variant: "destructive" })
    } finally {
      setBulkLoading(false)
    }
  }

  // Salvamento Unificado da Aba 2 (Parâmetros & siteConfig)
  const handleSaveParameters = async () => {
    try {
      setSaving(true)
      const [tRes, sRes] = await Promise.all([
        fetch("/api/tariffs/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tariffSettings)
        }),
        fetch("/api/site-content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(siteConfig)
        })
      ])

      if (tRes.ok && sRes.ok) {
        toast({
          title: "Parâmetros Salvos com Sucesso! 💰",
          description: "Regras do SEBRAE, markups e adicionais sincronizados com o motor de reservas."
        })
        loadCalendarData()
      } else {
        throw new Error("Falha ao salvar parâmetros")
      }
    } catch (err) {
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar os parâmetros.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Carregando mapa de tarifas multi-canal & parâmetros...</p>
        </div>
      </Shell>
    )
  }

  const flats = calendarData?.flats || []

  return (
    <Shell>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 pb-28">
        {/* Header Superior */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Coins className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Gestão de Tarifas & Calendário Multi-Canal
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Controle o mapa de diárias dinâmicas, comissões de canais e parâmetros base com cálculo sustentável SEBRAE.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/reservar", "_blank")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl"
            >
              <span>Ver no Motor de Reservas</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-60" />
            </Button>
            <Button
              size="sm"
              onClick={() => setIsBulkModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 h-9 px-4 rounded-xl shadow-xs"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edição em Lote (Bulk)</span>
            </Button>
          </div>
        </div>

        {/* Abas Principais */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl h-11">
            <TabsTrigger value="calendar" className="rounded-lg text-xs font-bold gap-2 px-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-xs">
              <CalendarIcon className="w-4 h-4 text-sky-600" />
              <span>Mapa de Tarifas Diárias</span>
            </TabsTrigger>
            <TabsTrigger value="parameters" className="rounded-lg text-xs font-bold gap-2 px-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 shadow-xs">
              <Sliders className="w-4 h-4 text-amber-600" />
              <span>Parâmetros Base & Adicionais</span>
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 1: MAPA DE TARIFAS DIÁRIAS (CALENDAR MATRIX)
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="calendar" className="space-y-5">
            {/* Toolbar do Calendário */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              {/* Seletor de Canal */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 mr-1">Canal:</span>
                <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    onClick={() => setSelectedChannel("direct")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedChannel === "direct" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🌐 Direto</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-emerald-300 text-emerald-700">0%</Badge>
                  </button>
                  <button
                    onClick={() => setSelectedChannel("booking")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedChannel === "booking" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🏨 Booking.com</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-sky-300 text-sky-700">+18%</Badge>
                  </button>
                  <button
                    onClick={() => setSelectedChannel("airbnb")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedChannel === "airbnb" ? "bg-white text-rose-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🏠 Airbnb</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-rose-300 text-rose-700">+15%</Badge>
                  </button>
                </div>
              </div>

              {/* Navegação de Mês & Alternância de Visualização */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <Button variant="ghost" size="sm" onClick={() => setViewMode("month")} className={`h-7 px-2.5 text-xs font-bold rounded-lg ${viewMode === "month" ? "bg-white shadow-xs" : ""}`}>
                    Mensal
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setViewMode("week")} className={`h-7 px-2.5 text-xs font-bold rounded-lg ${viewMode === "week" ? "bg-white shadow-xs" : ""}`}>
                    Semanal
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={handlePrevMonth} className="h-8 w-8 p-0 rounded-lg">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-black min-w-[110px] text-center text-slate-800 dark:text-slate-200">
                    {selectedMonth}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleNextMonth} className="h-8 w-8 p-0 rounded-lg">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {viewMode === "week" && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={currentWeekIndex <= 0} onClick={() => setCurrentWeekIndex(i => Math.max(0, i - 1))} className="h-8 px-2 text-xs">
                      Semana Ant.
                    </Button>
                    <Button variant="ghost" size="sm" disabled={(currentWeekIndex + 1) * 7 >= (calendarData?.days?.length || 0)} onClick={() => setCurrentWeekIndex(i => i + 1)} className="h-8 px-2 text-xs">
                      Próx. Semana
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Legenda Visual */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] px-2 text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-slate-100 border border-slate-300 dark:bg-slate-800" />
                <span>⚡ Tarifa SEBRAE Automática</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-amber-100 border border-amber-400 dark:bg-amber-950/80" />
                <span className="font-bold text-amber-900 dark:text-amber-200">✏️ Custom Override (Ajuste Manual)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-indigo-50 border border-indigo-200" />
                <span>🟣 Fim de Semana (+15%)</span>
              </div>
              <span className="ml-auto text-slate-400">Clique na célula para ajuste individual</span>
            </div>

            {/* Grade Matriz: Flats x Dias */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto max-h-[650px] relative">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-30 shadow-xs">
                    <tr>
                      <th className="p-3 font-black text-slate-700 dark:text-slate-300 min-w-[130px] sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 border-r border-slate-200 dark:border-slate-700">
                        Apartamento
                      </th>
                      {displayDays.map((d: any) => {
                        const dayName = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.dayOfWeek]
                        return (
                          <th
                            key={d.date}
                            className={`p-2.5 text-center min-w-[76px] border-r border-slate-200/60 dark:border-slate-700/60 ${
                              d.isWeekend ? "bg-indigo-50/60 dark:bg-indigo-950/30 font-black text-indigo-950 dark:text-indigo-200" : "font-bold text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-wider">{dayName}</div>
                            <div className="text-xs font-black">{String(d.day).padStart(2, "0")}</div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {/* Linha 1: Tarifa Geral (Todos os Flats) */}
                    <tr className="bg-slate-50/50 dark:bg-slate-850/50 hover:bg-slate-100/50 font-bold">
                      <td className="p-3 sticky left-0 bg-slate-50 dark:bg-slate-800 z-20 border-r border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                        <span>⭐ Geral (Todos)</span>
                      </td>
                      {displayDays.map((d: any) => (
                        <td
                          key={d.date}
                          onClick={() => handleOpenCellEditor(d, null)}
                          className={`p-2 text-center border-r border-slate-100 dark:border-slate-800 cursor-pointer transition-all hover:ring-2 hover:ring-sky-500 hover:z-10 ${
                            d.hasOverride
                              ? "bg-amber-100/80 dark:bg-amber-950/60 text-amber-950 dark:text-amber-100 font-black"
                              : d.isWeekend
                              ? "bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-950 dark:text-indigo-200"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <div className="text-xs leading-tight">
                            R$ {Math.round(d.rate)}
                          </div>
                          {d.hasOverride && (
                            <span className="text-[9px] block text-amber-700 dark:text-amber-300 font-bold">
                              Custom
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Linhas dos Flats Individuais */}
                    {flats.map((flat: any) => (
                      <tr key={flat.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="p-2.5 sticky left-0 bg-white dark:bg-slate-900 z-20 border-r border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200 text-xs">
                          Flat {flat.number}
                        </td>
                        {displayDays.map((d: any) => {
                          // Se houver override específico deste flat para a data
                          const flatOverride = calendarData?.overrides?.find((o: any) => 
                            o.date === d.date && String(o.flatId) === String(flat.id) && (o.channel === "all" || o.channel === selectedChannel)
                          )
                          const hasFlatOverride = Boolean(flatOverride)
                          const effectiveRate = hasFlatOverride ? flatOverride.rate : d.rate

                          return (
                            <td
                              key={`${flat.id}-${d.date}`}
                              onClick={() => handleOpenCellEditor({ ...d, rate: effectiveRate, override: flatOverride || d.override }, flat)}
                              className={`p-2 text-center border-r border-slate-100 dark:border-slate-800 cursor-pointer transition-all hover:ring-2 hover:ring-sky-500 hover:z-10 ${
                                hasFlatOverride
                                  ? "bg-amber-200/70 dark:bg-amber-900/50 text-amber-950 dark:text-amber-100 font-black"
                                  : d.hasOverride
                                  ? "bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                                  : d.isWeekend
                                  ? "bg-indigo-50/20 text-slate-800 dark:text-slate-300"
                                  : "text-slate-600 dark:text-slate-300"
                              }`}
                            >
                              <div className="text-[11px] font-bold leading-tight">
                                R$ {Math.round(effectiveRate)}
                              </div>
                              {hasFlatOverride && (
                                <span className="text-[8.5px] block text-amber-800 dark:text-amber-300 font-black">
                                  Override
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 2: PARÂMETROS BASE & ADICIONAIS
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="parameters" className="space-y-6">
            {/* Card 1: Motor de Precificação Base (SEBRAE vs Manual) */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 flex items-center justify-center font-bold">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-black">Motor de Precificação Base</CardTitle>
                      <CardDescription className="text-xs">
                        Defina se as diárias são derivadas do cálculo automático SEBRAE ou de um valor base manual fixo.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className={tariffSettings?.mode === "auto" ? "bg-emerald-600 text-white font-bold" : "bg-amber-500 text-white font-bold"}>
                    {tariffSettings?.mode === "auto" ? "⚡ SEBRAE Automático" : "✏️ Manual Fixo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <Label className="text-xs font-bold block">Modo de Operação</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={tariffSettings?.mode === "auto" ? "default" : "outline"}
                        onClick={() => setTariffSettings({ ...tariffSettings, mode: "auto" })}
                        className="text-xs font-bold flex-1"
                      >
                        ⚡ SEBRAE Automático
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={tariffSettings?.mode === "manual" ? "default" : "outline"}
                        onClick={() => setTariffSettings({ ...tariffSettings, mode: "manual" })}
                        className="text-xs font-bold flex-1"
                      >
                        ✏️ Manual Fixo
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      No modo SEBRAE, o sistema calcula a tarifa sustentável a partir dos custos fixos, variáveis e margem, aplicando a curva de sazonalidade de Campos dos Goytacazes.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <Label className="text-xs font-bold block">Diária Base & Fim de Semana</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block mb-1">Base Diária (R$)</span>
                        <Input
                          type="number"
                          disabled={tariffSettings?.mode === "auto"}
                          value={tariffSettings?.baseDailyRate ?? 237}
                          onChange={e => setTariffSettings({ ...tariffSettings, baseDailyRate: Number(e.target.value) })}
                          className="h-9 font-black text-sm"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block mb-1">Markup FDS (%)</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={Math.round((tariffSettings?.weekendMarkupPct ?? 0.15) * 100)}
                          onChange={e => setTariffSettings({ ...tariffSettings, weekendMarkupPct: Number(e.target.value) / 100 })}
                          className="h-9 font-black text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      O Markup de FDS aplica automaticamente o percentual nas noites de sexta-feira e sábado.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Comissões e Markups por Canal */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black">Canais de Distribuição & Repasse de Comissões</CardTitle>
                <CardDescription className="text-xs">
                  Ajuste os percentuais de markup para neutralizar as taxas cobradas pelas OTAs (Booking e Airbnb).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Direto */}
                  <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-emerald-900 dark:text-emerald-300">🌐 Venda Direta / Site</span>
                      <Badge className="bg-emerald-600 text-white font-bold text-[10px]">Taxa Zero</Badge>
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label className="text-[11px] font-bold">Desconto Reserva Direta (%)</Label>
                      <Input
                        type="number"
                        value={siteConfig?.pricing?.directDiscountPercent ?? 15}
                        onChange={e => {
                          const val = Number(e.target.value)
                          setSiteConfig({ ...siteConfig, pricing: { ...siteConfig.pricing, directDiscountPercent: val } })
                        }}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Desconto PIX Instantâneo (%)</Label>
                      <Input
                        type="number"
                        value={siteConfig?.pricing?.pixDiscountPercent ?? 5}
                        onChange={e => {
                          const val = Number(e.target.value)
                          setSiteConfig({ ...siteConfig, pricing: { ...siteConfig.pricing, pixDiscountPercent: val } })
                        }}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                  </div>

                  {/* Booking */}
                  <div className="p-4 rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-sky-900 dark:text-sky-300">🏨 Booking.com</span>
                      <Badge className="bg-sky-600 text-white font-bold text-[10px]">OTA</Badge>
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label className="text-[11px] font-bold">Markup sobre Tarifa Base (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={Math.round((tariffSettings?.channelMarkups?.booking?.markupPct ?? 0.18) * 100)}
                        onChange={e => {
                          const val = Number(e.target.value) / 100
                          setTariffSettings({
                            ...tariffSettings,
                            channelMarkups: {
                              ...tariffSettings.channelMarkups,
                              booking: { ...tariffSettings.channelMarkups?.booking, markupPct: val }
                            }
                          })
                        }}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <p className="text-[10.5px] text-slate-500 pt-1">
                      Repassa +18% na diária final para compensar a comissão da plataforma.
                    </p>
                  </div>

                  {/* Airbnb */}
                  <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-rose-900 dark:text-rose-300">🏠 Airbnb</span>
                      <Badge className="bg-rose-600 text-white font-bold text-[10px]">OTA</Badge>
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label className="text-[11px] font-bold">Markup sobre Tarifa Base (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        value={Math.round((tariffSettings?.channelMarkups?.airbnb?.markupPct ?? 0.15) * 100)}
                        onChange={e => {
                          const val = Number(e.target.value) / 100
                          setTariffSettings({
                            ...tariffSettings,
                            channelMarkups: {
                              ...tariffSettings.channelMarkups,
                              airbnb: { ...tariffSettings.channelMarkups?.airbnb, markupPct: val }
                            }
                          })
                        }}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <p className="text-[10.5px] text-slate-500 pt-1">
                      Repassa +15% na diária final para absorver a taxa de serviço.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Serviços Adicionais & Taxas (Sincronizado com siteConfig) */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black">Taxas de Serviços Adicionais & Políticas</CardTitle>
                <CardDescription className="text-xs">
                  Taxas cobradas por limpeza, 3º hóspede, camas extras e animais de estimação.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Colchonete Extra */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-sky-600" /> Colchonete 3º Hóspede</span>
                      <Badge variant="outline" className="text-[10px]">R$ {siteConfig?.extraBedConfig?.feeAmount || 60}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Valor da Taxa (R$)</Label>
                      <Input
                        type="number"
                        value={siteConfig?.extraBedConfig?.feeAmount ?? 60}
                        onChange={e => setSiteConfig({ ...siteConfig, extraBedConfig: { ...siteConfig.extraBedConfig, feeAmount: Number(e.target.value) } })}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="text-[10.5px] text-slate-500">⏰ Corte automático às 12:00 para hoje.</div>
                  </div>

                  {/* Camas Twin */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">🛏️ 2 Camas Solteiro (Twin)</span>
                      <Badge variant="outline" className="text-[10px]">R$ {siteConfig?.bedConfig?.twinFeeAmount || 30}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Valor da Montagem (R$)</Label>
                      <Input
                        type="number"
                        value={siteConfig?.bedConfig?.twinFeeAmount ?? 30}
                        onChange={e => setSiteConfig({ ...siteConfig, bedConfig: { ...siteConfig.bedConfig, twinFeeAmount: Number(e.target.value) } })}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="text-[10.5px] text-slate-500">Taxa única por estadia.</div>
                  </div>

                  {/* Pet Friendly */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-rose-600" /> Política Pet Friendly</span>
                      <Badge variant="outline" className="text-[10px]">R$ {siteConfig?.petPolicy?.feeAmount || 80}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Taxa por Pet (R$)</Label>
                      <Input
                        type="number"
                        value={siteConfig?.petPolicy?.feeAmount ?? 80}
                        onChange={e => setSiteConfig({ ...siteConfig, petPolicy: { ...siteConfig.petPolicy, feeAmount: Number(e.target.value) } })}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="text-[10.5px] text-slate-500">Cães até 15kg permitidos.</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Botão de Salvar Parâmetros */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveParameters}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs gap-1.5 h-10 px-6 rounded-xl shadow-md"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Salvando..." : "Salvar Todos os Parâmetros"}</span>
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* ═══════════════════════════════════════════════════════════════════
            MODAL DE AJUSTE INDIVIDUAL DE CÉLULA (OVERRIDE)
            ═══════════════════════════════════════════════════════════════════ */}
        {editingCell && (
          <Dialog open={Boolean(editingCell)} onOpenChange={open => !open && setEditingCell(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-black">Ajustar Tarifa Diária</DialogTitle>
                <DialogDescription className="text-xs">
                  {editingCell.flatNumber ? `Flat ${editingCell.flatNumber}` : "Todos os Flats (Geral)"} • Data: {editingCell.date} • Canal: {editingCell.channel}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Valor da Diária (R$)</Label>
                  <Input
                    type="number"
                    value={singleRateInput}
                    onChange={e => setSingleRateInput(Number(e.target.value))}
                    className="font-black text-base h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Motivo / Justificativa</Label>
                  <Input
                    placeholder="Ex: Feriado Local, Ajuste VIP, Promoção"
                    value={singleReasonInput}
                    onChange={e => setSingleReasonInput(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>
              <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
                {editingCell.override ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveOverride(editingCell.override.id)}
                    className="text-rose-600 hover:bg-rose-50 text-xs font-bold gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Voltar ao SEBRAE</span>
                  </Button>
                ) : <div />}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingCell(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveSingleOverride} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                    Salvar Tarifa
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MODAL DE EDIÇÃO EM LOTE (BULK UPDATE)
            ═══════════════════════════════════════════════════════════════════ */}
        {isBulkModalOpen && (
          <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base font-black flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  <span>Edição de Tarifas em Lote (Bulk Update)</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Aplique tarifas para múltiplos flats, canais e intervalos de datas com regras flexíveis.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* 1. Intervalo de Datas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Data Início</Label>
                    <Input
                      type="date"
                      value={bulkStartDate}
                      onChange={e => setBulkStartDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Data Fim</Label>
                    <Input
                      type="date"
                      value={bulkEndDate}
                      onChange={e => setBulkEndDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                {/* 2. Dias da Semana */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">Dias da Semana</Label>
                    <div className="flex gap-1.5 text-[10px]">
                      <button type="button" onClick={() => setBulkDaysOfWeek([0, 1, 2, 3, 4, 5, 6])} className="text-sky-600 hover:underline font-bold">Todos</button>
                      <span>•</span>
                      <button type="button" onClick={() => setBulkDaysOfWeek([5, 6])} className="text-sky-600 hover:underline font-bold">Sex/Sáb</button>
                      <span>•</span>
                      <button type="button" onClick={() => setBulkDaysOfWeek([0, 1, 2, 3, 4])} className="text-sky-600 hover:underline font-bold">Dom-Qui</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dName, dIdx) => {
                      const isChecked = bulkDaysOfWeek.includes(dIdx)
                      return (
                        <button
                          key={dName}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setBulkDaysOfWeek(bulkDaysOfWeek.filter(i => i !== dIdx))
                            } else {
                              setBulkDaysOfWeek([...bulkDaysOfWeek, dIdx])
                            }
                          }}
                          className={`py-1 rounded-lg text-center font-bold text-[11px] transition-all border ${
                            isChecked ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {dName}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Seleção de Flats */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Flats Aplicáveis</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkFlatMode === "all" ? "default" : "outline"}
                      onClick={() => setBulkFlatMode("all")}
                      className="text-xs font-bold flex-1 h-8"
                    >
                      Todos os Flats
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkFlatMode === "selected" ? "default" : "outline"}
                      onClick={() => setBulkFlatMode("selected")}
                      className="text-xs font-bold flex-1 h-8"
                    >
                      Flats Específicos
                    </Button>
                  </div>
                  {bulkFlatMode === "selected" && (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 border border-slate-200 rounded-xl">
                      {flats.map((f: any) => {
                        const sel = bulkSelectedFlats.includes(String(f.id))
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              if (sel) {
                                setBulkSelectedFlats(bulkSelectedFlats.filter(id => id !== String(f.id)))
                              } else {
                                setBulkSelectedFlats([...bulkSelectedFlats, String(f.id)])
                              }
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              sel ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700"
                            }`}
                          >
                            Flat {f.number}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 4. Canais */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Canais de Distribuição</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkChannelMode === "all" ? "default" : "outline"}
                      onClick={() => setBulkChannelMode("all")}
                      className="text-xs font-bold flex-1 h-8"
                    >
                      Todos os Canais
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bulkChannelMode === "selected" ? "default" : "outline"}
                      onClick={() => setBulkChannelMode("selected")}
                      className="text-xs font-bold flex-1 h-8"
                    >
                      Canais Específicos
                    </Button>
                  </div>
                  {bulkChannelMode === "selected" && (
                    <div className="flex gap-2 pt-1">
                      {["direct", "booking", "airbnb"].map(c => {
                        const sel = bulkSelectedChannels.includes(c)
                        const cLabel = c === "direct" ? "🌐 Direto" : c === "booking" ? "🏨 Booking" : "🏠 Airbnb"
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              if (sel) {
                                setBulkSelectedChannels(bulkSelectedChannels.filter(ch => ch !== c))
                              } else {
                                setBulkSelectedChannels([...bulkSelectedChannels, c])
                              }
                            }}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold border flex-1 ${
                              sel ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700"
                            }`}
                          >
                            {cLabel}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 5. Tipo de Ajuste e Valor com Preview */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-2 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">Tipo de Ajuste</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={bulkAdjustmentType === "fixed" ? "default" : "outline"}
                        onClick={() => { setBulkAdjustmentType("fixed"); setBulkValue(250) }}
                        className="h-6 text-[10px] px-2 font-bold"
                      >
                        Valor Fixo (R$)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={bulkAdjustmentType === "percent" ? "default" : "outline"}
                        onClick={() => { setBulkAdjustmentType("percent"); setBulkValue(15) }}
                        className="h-6 text-[10px] px-2 font-bold"
                      >
                        Acréscimo (%)
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <Input
                        type="number"
                        value={bulkValue}
                        onChange={e => setBulkValue(Number(e.target.value))}
                        className="h-9 font-black text-sm"
                      />
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      {bulkAdjustmentType === "fixed" ? (
                        <span>Diária fixada em <strong>R$ {bulkValue}</strong></span>
                      ) : (
                        <span>
                          Ex: R$ 237 + {bulkValue}% = <strong>R$ {Math.round(237 * (1 + bulkValue / 100))}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6. Motivo */}
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Motivo / Identificador da Regra</Label>
                  <Input
                    placeholder="Ex: Pacote Réveillon, Alta Temporada, Feriado"
                    value={bulkReason}
                    onChange={e => setBulkReason(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setIsBulkModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleExecuteBulkUpdate}
                  disabled={bulkLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs gap-1.5 px-4"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{bulkLoading ? "Aplicando..." : "Aplicar Atualização em Massa"}</span>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Shell>
  )
}
```

---

## 5. Verification Method

Para o Worker validar a implementação com 100% de integridade:

1. **Validação de Testes do Motor Tarifário Backend:**
   ```bash
   node --test tests/tariff-engine.test.mjs
   node --test tests/challenger-tariff-stress.test.mjs
   ```
   - Garante que a lógica de cálculo SEBRAE, sazonalidade e bulk-update continuam com 100% de aprovação.

2. **Validação do Build do Frontend:**
   ```bash
   cd artifacts/limpeza
   npm run build
   ```
   - Deve compilar sem erros de TypeScript ou lint e gerar os bundles em `artifacts/limpeza/dist/`.

3. **Validação Visual e Funcional no Navegador:**
   - Acessar `http://localhost:3000/tarifas` ou rota administrativa de gestão de tarifas.
   - Testar a alternância entre as abas "Mapa de Tarifas Diárias" e "Parâmetros Base & Adicionais".
   - No mapa, testar os botões de canal (Direto, Booking, Airbnb) e observar os valores recalculados em tempo real.
   - Clicar em uma célula de um flat qualquer, alterar a diária e salvar; verificar o badge âmbar `Override`.
   - Clicar na mesma célula e acionar "Voltar ao SEBRAE"; verificar o retorno ao valor base calculado.
   - Abrir o Modal de Edição em Lote, selecionar um intervalo de 3 dias com acréscimo de 20%, e confirmar a atualização simultânea de todas as diárias.
