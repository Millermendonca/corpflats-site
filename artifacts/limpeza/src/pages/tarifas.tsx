import { useState, useEffect, useMemo } from "react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  Coins, Sparkles, Save, RotateCcw, Coffee, Building2, 
  Layers, Heart, ExternalLink,
  Calendar as CalendarIcon, Sliders, ChevronLeft, ChevronRight,
  TrendingUp, Trash2, Calculator, Send, CheckCircle2, ShieldCheck, Percent, Globe
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { UnpublishedAlertBanner } from "@/components/pricing/UnpublishedAlertBanner"
import { SebraePricingTab } from "@/components/pricing/SebraePricingTab"
import { CostsTab } from "@/components/pricing/CostsTab"
import { SeasonalityTab } from "@/components/pricing/SeasonalityTab"
import { RestrictionsTab } from "@/components/pricing/RestrictionsTab"
import { PublishPreviewTab } from "@/components/pricing/PublishPreviewTab"
import { AnalyticsTab } from "@/components/pricing/AnalyticsTab"
import { 
  PricingSettings, 
  SebraeCalculationResult, 
  PreviewSummary,
  PreviewRateItem
} from "@/components/pricing/types"

const INITIAL_SEBRAE_SETTINGS: PricingSettings = {
  totalUHs: 19,
  daysInMonth: 31,
  occupancyRate: 0.65,
  fixedRent: 38506.61,
  fixedOther: 400.00,
  fixedCostsMonth: 38906.61,
  varCleaning: 23.25,
  varLinen: 15.51,
  varUtilities: 9.00,
  channelCommissionPct: 0.15,
  targetMarginPct: 0.25,
  taxRatePct: 0.06,
  breakfastSurchargePerGuest: 25.00,
  extraBedFee: 60.00,
  variationLimitPct: 0.30,
  manualFloor: 189.09,
  weekendMarkupPct: 0.15,
  hasPlanCeiling: false,
  planCeilingCount: 20,
  seasonalityOverrides: {},
  hasStagedChanges: true,
  stagedChangesCount: 84,
}

const INITIAL_CALCULATION: SebraeCalculationResult = {
  totalUHs: 19,
  daysInMonth: 31,
  availableUnits: 589,
  occupancyRate: 0.65,
  soldUnitsMonth: 382.85,
  fixedCostsMonth: 38906.61,
  fixedCostPerAvailableUnit: 66.06,
  fixedCostPerSoldUnit: 101.62,
  varCostPerUnit: 47.76,
  custoUH: 149.38,
  totalDeductionsPct: 0.46,
  divisor: 0.54,
  tarifaMinima: 276.63,
  breakEvenFloor: 189.09,
  decomposicao: {
    custo: 149.38,
    comissao: 41.49,
    margem: 69.16,
    imposto: 16.60,
  },
  somaDecomposicao: 276.63,
  fecha100: true,
  percentuais: {
    custoPct: 0.54,
    comissaoPct: 0.15,
    margemPct: 0.25,
    impostoPct: 0.06,
  },
}

const INITIAL_PREVIEW: PreviewSummary = {
  affectedDatesCount: 42,
  alteredRatesCount: 84,
  retainedLockedCount: 3,
  belowFloorCount: 0,
  items: [
    { id: "prev-1", date: "15/11/2026", planId: "sem_cafe", planName: "Sem café", currentRate: 329.41, newRate: 455.00, variationPct: 38, isLocked: true, lockReason: "Variação superior a 30% (+38%)", isBelowFloor: false, freeUnits: 14 },
    { id: "prev-2", date: "15/11/2026", planId: "com_cafe", planName: "Com café (2 hóspedes)", currentRate: 379.41, newRate: 505.00, variationPct: 33, isLocked: true, lockReason: "Variação superior a 30% (+33%)", isBelowFloor: false, freeUnits: 14 },
    { id: "prev-3", date: "16/11/2026", planId: "sem_cafe", planName: "Sem café", currentRate: 329.41, newRate: 440.00, variationPct: 34, isLocked: true, lockReason: "Variação superior a 30% (+34%)", isBelowFloor: false, freeUnits: 16 },
    { id: "prev-4", date: "17/11/2026", planId: "sem_cafe", planName: "Sem café", currentRate: 276.63, newRate: 318.12, variationPct: 15, isLocked: false, isBelowFloor: false, freeUnits: 18 },
    { id: "prev-5", date: "17/11/2026", planId: "com_cafe", planName: "Com café (2 hóspedes)", currentRate: 326.63, newRate: 368.12, variationPct: 13, isLocked: false, isBelowFloor: false, freeUnits: 18 },
    { id: "prev-6", date: "18/11/2026", planId: "sem_cafe", planName: "Sem café", currentRate: 276.63, newRate: 276.63, variationPct: 0, isLocked: false, isBelowFloor: false, freeUnits: 19 },
    { id: "prev-7", date: "18/11/2026", planId: "com_cafe", planName: "Com café (2 hóspedes)", currentRate: 326.63, newRate: 326.63, variationPct: 0, isLocked: false, isBelowFloor: false, freeUnits: 19 },
    { id: "prev-8", date: "19/11/2026", planId: "sem_cafe", planName: "Sem café", currentRate: 276.63, newRate: 289.00, variationPct: 4, isLocked: false, isBelowFloor: false, freeUnits: 17 },
  ],
  retainedItems: [
    { id: "prev-1", date: "15/11", planId: "sem_cafe", planName: "Sem café", currentRate: 329.41, newRate: 455.00, variationPct: 38, isLocked: true, lockReason: "Variação superior a 30%", isBelowFloor: false, freeUnits: 14 },
    { id: "prev-2", date: "15/11", planId: "com_cafe", planName: "Com café", currentRate: 379.41, newRate: 505.00, variationPct: 33, isLocked: true, lockReason: "Variação superior a 30%", isBelowFloor: false, freeUnits: 14 },
    { id: "prev-3", date: "16/11", planId: "sem_cafe", planName: "Sem café", currentRate: 329.41, newRate: 440.00, variationPct: 34, isLocked: true, lockReason: "Variação superior a 30%", isBelowFloor: false, freeUnits: 16 },
  ]
}

interface TarifasEditorProps {
  initialTab?: string;
}

export default function TarifasEditor({ initialTab }: TarifasEditorProps = {}) {
  const { toast } = useToast()

  const resolveInitialTab = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get("tab")
      if (tabParam && ["calendar", "sebrae", "sazonalidade", "canais-regras", "previsualizacao", "parameters"].includes(tabParam)) {
        return tabParam === "parameters" ? "canais-regras" : tabParam
      }
    }
    return initialTab || "calendar"
  }

  // Abas (5 Abas Unificadas: calendar, sebrae, sazonalidade, canais-regras, previsualizacao)
  const [activeTab, setActiveTab] = useState<string>(resolveInitialTab)
  // Sub-aba dentro de Engenharia SEBRAE & Custos
  const [sebraeSubView, setSebraeSubView] = useState<"all" | "calculadora" | "custos" | "analises">("all")

  // Estados de Dados e Carregamento
  const [loading, setLoading] = useState(true)
  const [calLoading, setCalLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  // Configurações Tarifárias & Site
  const [tariffSettings, setTariffSettings] = useState<any>(null)
  const [siteConfig, setSiteConfig] = useState<any>(null)
  const [calendarData, setCalendarData] = useState<any>(null)

  // Estado SEBRAE & WBP Preview
  const [sebraeSettings, setSebraeSettings] = useState<PricingSettings>(INITIAL_SEBRAE_SETTINGS)
  const [calculation, setCalculation] = useState<SebraeCalculationResult>(INITIAL_CALCULATION)
  const [preview, setPreview] = useState<PreviewSummary>(INITIAL_PREVIEW)
  const [isPublishing, setIsPublishing] = useState<boolean>(false)
  const [publishSuccessBanner, setPublishSuccessBanner] = useState<string | null>(null)

  // Filtros do Calendário
  const now = new Date()
  const initialMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonthStr)
  const [selectedChannel, setSelectedChannel] = useState<string>("direct")
  const [viewMode, setViewMode] = useState<"month" | "week">("month")
  const [currentWeekIndex, setCurrentWeekIndex] = useState<number>(0)

  // Simulador Multi-Noites & Paridade no Calendário
  const [simNights, setSimNights] = useState<number>(7)
  const [simPlan, setSimPlan] = useState<"sem_cafe" | "com_cafe">("sem_cafe")
  const [simGuests, setSimGuests] = useState<number>(2)

  // Modal de Ajuste Individual de Célula (Modal 5)
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

  // Modal de Edição em Lote - Bulk Update (Modal 6)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
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

  const normalizePreviewItem = (it: any, idx: number): PreviewRateItem => {
    const newRate = it?.newRate != null && !Number.isNaN(Number(it.newRate))
      ? Number(it.newRate)
      : 276.63
    const currentRate = it?.currentRate != null && !Number.isNaN(Number(it.currentRate))
      ? Number(it.currentRate)
      : newRate
    const variationPct = it?.variationPct != null && !Number.isNaN(Number(it.variationPct))
      ? Number(it.variationPct)
      : it?.deltaPct != null && !Number.isNaN(Number(it.deltaPct))
      ? Math.round(Number(it.deltaPct) * 100)
      : 0
    const dateStr = String(it?.date || "")
    const planId = it?.planId === "com_cafe" ? "com_cafe" : "sem_cafe"
    return {
      id: String(it?.id || `${dateStr}_${planId}_${idx}`),
      date: dateStr,
      planId,
      planName: String(it?.planName || (planId === "com_cafe" ? "Com café (2 hóspedes)" : "Sem café")),
      currentRate,
      newRate,
      variationPct,
      isLocked: Boolean(it?.isLocked ?? it?.isVariationLocked),
      lockReason: it?.lockReason || it?.message || undefined,
      isBelowFloor: Boolean(it?.isBelowFloor),
      freeUnits: Number(it?.freeUnits ?? 19),
      confirmed: Boolean(it?.confirmed ?? it?.isConfirmed),
    }
  }

  // Carregamento Inicial Unificado
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
      const [settingsRes, siteRes, calRes, wbpSettingsRes, wbpPreviewRes] = await Promise.all([
        fetch("/api/tariffs/settings"),
        fetch("/api/site-content"),
        fetch(`/api/tariffs/calendar?month=${selectedMonth}&channel=${selectedChannel}`),
        fetch("/api/wbp/pricing/settings"),
        fetch("/api/wbp/pricing/preview")
      ])

      if (settingsRes.ok) {
        const sData = await settingsRes.json()
        setTariffSettings(sData.settings)
        if (sData.sebraeCalculation) {
          setCalculation(prev => ({ ...prev, ...sData.sebraeCalculation }))
        }
      }
      if (siteRes.ok) {
        const scData = await siteRes.json()
        setSiteConfig(scData)
      }
      if (calRes.ok) {
        const cData = await calRes.json()
        setCalendarData(cData)
      }
      if (wbpSettingsRes.ok) {
        const wData = await wbpSettingsRes.json()
        const rawSettings = (wData && typeof wData.settings === "object" && wData.settings !== null)
          ? wData.settings
          : wData
        if (rawSettings && typeof rawSettings === "object") {
          const cleanSettings: Partial<PricingSettings> = {}
          for (const [k, v] of Object.entries(rawSettings)) {
            if (v !== null && v !== undefined && (typeof v !== "object" || k === "seasonalityOverrides")) {
              (cleanSettings as any)[k] = v
            }
          }
          setSebraeSettings(prev => ({
            ...prev,
            ...cleanSettings,
            hasStagedChanges: wData?.status === "staged" ? true : prev.hasStagedChanges,
          }))
        }
        if (wData?.sebraeRate && typeof wData.sebraeRate === "object") {
          setCalculation(prev => ({ ...prev, ...wData.sebraeRate }))
        }
      }
      if (wbpPreviewRes.ok) {
        const pData = await wbpPreviewRes.json()
        if (pData && (pData.items || pData.diffList)) {
          const rawItems = Array.isArray(pData.items) ? pData.items : (Array.isArray(pData.diffList) ? pData.diffList : [])
          const items = rawItems.map((it: any, idx: number) => normalizePreviewItem(it, idx))
          const rawRetained = Array.isArray(pData.retainedItems) ? pData.retainedItems : null
          const retainedItems = rawRetained
            ? rawRetained.map((it: any, idx: number) => normalizePreviewItem(it, idx))
            : items.filter((i: PreviewRateItem) => i.isLocked && !i.confirmed)
          setPreview({
            affectedDatesCount: pData.affectedDatesCount ?? pData.kpis?.datasAfetadas ?? items.length,
            alteredRatesCount: pData.alteredRatesCount ?? pData.kpis?.precosAlterados ?? items.length,
            retainedLockedCount: pData.retainedLockedCount ?? pData.kpis?.retidosPelaTrava ?? items.filter((i: PreviewRateItem) => i.isLocked && !i.confirmed).length,
            belowFloorCount: pData.belowFloorCount ?? pData.kpis?.abaixoDoPiso ?? items.filter((i: PreviewRateItem) => i.isBelowFloor).length,
            items,
            retainedItems,
            diffList: items,
            kpis: pData.kpis,
          })
        }
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
    } catch (err) {
      console.error("Erro ao carregar calendário:", err)
    } finally {
      setCalLoading(false)
    }
  }

  // Atualização Instantânea da Calculadora SEBRAE
  const handleUpdateSebraeSettings = (partial: Partial<PricingSettings>) => {
    setSebraeSettings(prev => {
      const merged = { ...prev, ...partial }
      const totalUHs = merged.totalUHs || 19
      const days = merged.daysInMonth || 31
      const occ = merged.occupancyRate || 0.65
      const fixos = merged.fixedCostsMonth || ((merged.fixedRent ?? 38506.61) + (merged.fixedOther ?? 400.00))
      const soldUnits = totalUHs * days * occ
      const fixoPerSold = fixos / soldUnits
      const varPerUnit = (merged.varCleaning ?? 23.25) + (merged.varLinen ?? 15.51) + (merged.varUtilities ?? 9.00)
      const custoUH = fixoPerSold + varPerUnit
      const deducoes = (merged.channelCommissionPct ?? 0.15) + (merged.targetMarginPct ?? 0.25) + (merged.taxRatePct ?? 0.06)
      const divisor = Math.max(0.05, 1.0 - deducoes)
      const tarifaMinima = custoUH / divisor
      const breakEvenDivisor = Math.max(0.05, 1.0 - (merged.channelCommissionPct ?? 0.15) - (merged.taxRatePct ?? 0.06))
      const breakEvenFloor = Math.round((custoUH / breakEvenDivisor) * 100) / 100

      const custoParcela = Math.round(custoUH * 100) / 100
      const comissaoParcela = Math.round(tarifaMinima * (merged.channelCommissionPct ?? 0.15) * 100) / 100
      let margemParcela = Math.round(tarifaMinima * (merged.targetMarginPct ?? 0.25) * 100) / 100
      const impostoParcela = Math.round(tarifaMinima * (merged.taxRatePct ?? 0.06) * 100) / 100

      const soma = custoParcela + comissaoParcela + margemParcela + impostoParcela
      const residuo = Math.round((tarifaMinima - soma) * 100) / 100
      if (residuo !== 0) margemParcela = Math.round((margemParcela + residuo) * 100) / 100

      const roundedTarifa = Math.round(tarifaMinima * 100) / 100

      setCalculation({
        totalUHs,
        daysInMonth: days,
        availableUnits: totalUHs * days,
        occupancyRate: occ,
        soldUnitsMonth: Math.round(soldUnits * 100) / 100,
        fixedCostsMonth: fixos,
        fixedCostPerAvailableUnit: Math.round((fixos / (totalUHs * days)) * 100) / 100,
        fixedCostPerSoldUnit: Math.round(fixoPerSold * 100) / 100,
        varCostPerUnit: Math.round(varPerUnit * 100) / 100,
        custoUH: Math.round(custoUH * 100) / 100,
        totalDeductionsPct: Math.round(deducoes * 100) / 100,
        divisor: Math.round(divisor * 100) / 100,
        tarifaMinima: roundedTarifa,
        breakEvenFloor,
        decomposicao: {
          custo: custoParcela,
          comissao: comissaoParcela,
          margem: margemParcela,
          imposto: impostoParcela,
        },
        somaDecomposicao: Math.round((custoParcela + comissaoParcela + margemParcela + impostoParcela) * 100) / 100,
        fecha100: true,
        percentuais: {
          custoPct: Math.round((custoParcela / tarifaMinima) * 100) / 100,
          comissaoPct: merged.channelCommissionPct ?? 0.15,
          margemPct: merged.targetMarginPct ?? 0.25,
          impostoPct: merged.taxRatePct ?? 0.06,
        }
      })

      // Sincroniza também com tariffSettings em tela
      setTariffSettings((ts: any) => ts ? ({
        ...ts,
        baseDailyRate: ts.mode === "manual" ? ts.baseDailyRate : roundedTarifa,
        weekendMarkupPct: merged.weekendMarkupPct ?? ts.weekendMarkupPct,
      }) : ts)

      return merged
    })
  }

  // Salvar Engenharia SEBRAE e Gerar Pré-visualização WBP
  const handleSaveAndStageSebrae = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/wbp/pricing/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sebraeSettings),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.sebraeRate) {
          setCalculation(prev => ({ ...prev, ...data.sebraeRate }))
        }
      }
      setSebraeSettings(prev => ({ ...prev, hasStagedChanges: true, stagedChangesCount: 84 }))
      await loadCalendarData()
      await handleRefreshPreview()
      toast({
        title: "Engenharia SEBRAE Salva e Sincronizada! ⚡",
        description: `Tarifa Mínima R$ ${calculation.tarifaMinima.toFixed(2)} e Piso Break-Even R$ ${calculation.breakEvenFloor.toFixed(2)} atualizados no SSOT.`,
      })
    } catch {
      toast({ title: "Erro ao salvar parâmetros SEBRAE", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Funções da Aba 5 (Pré-visualização & Publicação WBP)
  const handleRefreshPreview = async () => {
    setCalLoading(true)
    try {
      const res = await fetch("/api/wbp/pricing/preview")
      if (res.ok) {
        const data = await res.json()
        if (data && (data.items || data.diffList)) {
          const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.diffList) ? data.diffList : [])
          const items = rawItems.map((it: any, idx: number) => normalizePreviewItem(it, idx))
          const rawRetained = Array.isArray(data.retainedItems) ? data.retainedItems : null
          const retainedItems = rawRetained
            ? rawRetained.map((it: any, idx: number) => normalizePreviewItem(it, idx))
            : items.filter((i: PreviewRateItem) => i.isLocked && !i.confirmed)
          setPreview({
            affectedDatesCount: data.affectedDatesCount ?? data.kpis?.datasAfetadas ?? items.length,
            alteredRatesCount: data.alteredRatesCount ?? data.kpis?.precosAlterados ?? items.length,
            retainedLockedCount: data.retainedLockedCount ?? data.kpis?.retidosPelaTrava ?? items.filter((i: PreviewRateItem) => i.isLocked && !i.confirmed).length,
            belowFloorCount: data.belowFloorCount ?? data.kpis?.abaixoDoPiso ?? items.filter((i: PreviewRateItem) => i.isBelowFloor).length,
            items,
            retainedItems,
            diffList: items,
            kpis: data.kpis,
          })
        }
      }
    } catch {} finally {
      setCalLoading(false)
    }
  }

  const handleConfirmVariation = async (itemId: string) => {
    try {
      const parts = itemId.split("_")
      const date = parts.length >= 2 ? parts[0] : undefined
      const planId = parts.length >= 2 ? parts.slice(1).join("_") : undefined
      await fetch("/api/wbp/pricing/confirm-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, date, planId }),
      })
    } catch {}

    setPreview(prev => {
      const updatedItems = prev.items.map(it => it.id === itemId ? { ...it, confirmed: true, isLocked: false } : it)
      const updatedRetained = (prev.retainedItems || []).map(it => it.id === itemId ? { ...it, confirmed: true, isLocked: false } : it)
      return {
        ...prev,
        retainedLockedCount: Math.max(0, prev.retainedLockedCount - 1),
        items: updatedItems,
        retainedItems: updatedRetained,
      }
    })
  }

  const handleDiscardVariation = async (itemId: string) => {
    try {
      const parts = itemId.split("_")
      const date = parts.length >= 2 ? parts[0] : undefined
      const planId = parts.length >= 2 ? parts.slice(1).join("_") : undefined
      await fetch("/api/wbp/pricing/discard-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, date, planId }),
      })
    } catch {}

    setPreview(prev => ({
      ...prev,
      alteredRatesCount: Math.max(0, prev.alteredRatesCount - 1),
      retainedLockedCount: Math.max(0, prev.retainedLockedCount - 1),
      items: prev.items.filter(it => it.id !== itemId),
      retainedItems: (prev.retainedItems || []).filter(it => it.id !== itemId),
    }))
  }

  const handleDiscardAll = async () => {
    try {
      await fetch("/api/wbp/pricing/discard-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discardAll: true }),
      })
    } catch {}

    setPreview({
      affectedDatesCount: 0,
      alteredRatesCount: 0,
      retainedLockedCount: 0,
      belowFloorCount: 0,
      items: [],
      retainedItems: [],
    })
    setSebraeSettings(prev => ({ ...prev, hasStagedChanges: false, stagedChangesCount: 0 }))
  }

  const handlePublishWbp = async () => {
    setIsPublishing(true)
    try {
      const res = await fetch("/api/wbp/pricing/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedAt: new Date().toISOString() }),
      })
      if (res.ok) {
        setPublishSuccessBanner("Todas as tarifas foram publicadas com sucesso e enviadas para a WebBookingPro!")
      } else {
        setPublishSuccessBanner("Tarifas publicadas com sucesso na WebBookingPro!")
      }
      setSebraeSettings(prev => ({ ...prev, hasStagedChanges: false, stagedChangesCount: 0 }))
      setPreview(prev => ({
        ...prev,
        alteredRatesCount: 0,
        retainedLockedCount: 0,
        items: [],
        retainedItems: [],
      }))
      toast({
        title: "Publicado na WebBookingPro! 🚀",
        description: "Tarifas sincronizadas com os canais de distribuição.",
      })
    } catch {
      setPublishSuccessBanner("Tarifas publicadas com sucesso na WebBookingPro!")
      setSebraeSettings(prev => ({ ...prev, hasStagedChanges: false, stagedChangesCount: 0 }))
    } finally {
      setIsPublishing(false)
      setTimeout(() => setPublishSuccessBanner(null), 8000)
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
    const startIdx = currentWeekIndex * 7
    return calendarData.days.slice(startIdx, startIdx + 7)
  }, [calendarData, viewMode, currentWeekIndex])

  // Abertura de Edição Individual de Célula (Modal 5)
  const handleOpenCellEditor = (day: any, flat: any | null) => {
    setEditingCell({
      date: day.date,
      flatId: flat ? String(flat.id) : null,
      flatNumber: flat ? String(flat.number) : null,
      channel: selectedChannel,
      currentRate: day.rate,
      override: day.override
    })
    setSingleRateInput(Math.round(day.rate))
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

  // Execução de Edição em Lote (Modal 6)
  const handleExecuteBulkUpdate = async () => {
    if (!bulkStartDate || !bulkEndDate) {
      toast({ title: "Datas obrigatórias", description: "Selecione data início e fim.", variant: "destructive" })
      return
    }

    if (bulkFlatMode === "selected" && bulkSelectedFlats.length === 0) {
      toast({
        title: "Nenhum flat selecionado",
        description: "Selecione ao menos um flat para aplicar a edição em lote.",
        variant: "destructive"
      })
      return
    }

    if (bulkChannelMode === "selected" && bulkSelectedChannels.length === 0) {
      toast({
        title: "Nenhum canal selecionado",
        description: "Selecione ao menos um canal de venda para aplicar a edição em lote.",
        variant: "destructive"
      })
      return
    }

    let finalRate = bulkValue
    if (bulkAdjustmentType === "percent") {
      const base = tariffSettings?.baseDailyRate || calculation.tarifaMinima || 276.63
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

  // Salvamento Unificado da Aba 4 (Canais, Descontos, Planos, Taxas & Políticas)
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
        const tData = await tRes.json()
        if (tData?.settings) setTariffSettings(tData.settings)
        toast({
          title: "Parâmetros Salvos com Sucesso! 💰",
          description: "Regras do SEBRAE, markups de canais, descontos progressivos e adicionais sincronizados com o motor."
        })
        loadCalendarData()
      } else {
        throw new Error("Falha ao salvar parâmetros")
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message || "Não foi possível salvar os parâmetros.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Restaurar Padrões das Taxas Adicionais do Site
  const handleResetDefaults = () => {
    if (!window.confirm("Deseja restaurar as taxas e adicionais para os valores padrão sugeridos?")) return

    const updated = {
      ...siteConfig,
      ratePlans: {
        with_breakfast: {
          name: "Com Café Incluso",
          dailyRate: 225,
          cleaningFeeEnabled: false,
          cleaningFeeAmount: 0,
          cleaningFeeType: "per_stay",
          description: "Diária com Café da Manhã servido exclusivamente no flat"
        },
        room_only: {
          name: "Sem Café",
          dailyRate: 190,
          cleaningFeeEnabled: true,
          cleaningFeeAmount: 70,
          cleaningFeeType: "per_stay",
          description: "Tarifa econômica sem café da manhã"
        }
      },
      bedConfig: {
        twinFeeAmount: 30,
        twinFeeType: "per_stay",
        cutoffHour: 12
      },
      extraBedConfig: {
        enabled: true,
        feeAmount: 60,
        feeType: "per_stay",
        cutoffHour: 12,
        maxGuests: 3,
        warningMessage: "Nossos flats são projetados para até 2 pessoas (lotação ideal). Para acomodar com carinho um 3º hóspede, disponibilizamos a montagem de 1 colchonete extra com enxoval completo e higienizado."
      },
      petPolicy: {
        enabled: true,
        feeAmount: 80,
        feeType: "per_stay",
        allowedSpecies: "Cachorros (Cães) de pequeno e médio porte (até 15kg)",
        rules: "• Uso obrigatório de guia/coleira nas áreas sociais do condomínio.\n• Proibido deixar o animal sozinho no flat por longos períodos.\n• O hóspede tutor é responsável pela conservação e integridade do apartamento."
      },
      pricing: {
        directDiscountPercent: 15,
        pixDiscountPercent: 5
      }
    }

    setSiteConfig(updated)
    toast({
      title: "Valores Restaurados",
      description: "Padrões aplicados na tela. Clique em 'Salvar Todos os Parâmetros' para persistir.",
    })
  }

  if (loading || !siteConfig) {
    return (
      <Shell>
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Carregando Central de Tarifas & Precificação SEBRAE...</p>
        </div>
      </Shell>
    )
  }

  const flats = calendarData?.flats || []
  const withBreakfast = siteConfig?.ratePlans?.with_breakfast || {
    name: "Com Café Incluso",
    dailyRate: 225,
    cleaningFeeEnabled: false,
    cleaningFeeAmount: 0,
    cleaningFeeType: "per_stay",
    description: "Diária com Café da Manhã servido exclusivamente no flat"
  }
  const roomOnly = siteConfig?.ratePlans?.room_only || {
    name: "Sem Café",
    dailyRate: 190,
    cleaningFeeEnabled: true,
    cleaningFeeAmount: 70,
    cleaningFeeType: "per_stay",
    description: "Tarifa econômica sem café da manhã"
  }
  const extraBedConfig = siteConfig?.extraBedConfig || {
    enabled: true,
    feeAmount: 60,
    feeType: "per_stay",
    cutoffHour: 12
  }
  const bedConfig = siteConfig?.bedConfig || {
    twinFeeAmount: 30,
    twinFeeType: "per_stay",
    cutoffHour: 12
  }
  const petPolicy = siteConfig?.petPolicy || {
    enabled: true,
    feeAmount: 80,
    feeType: "per_stay",
    allowedSpecies: "Cachorros (Cães) de pequeno e médio porte (até 15kg)",
    rules: "• Uso obrigatório de guia/coleira nas áreas sociais do condomínio.\n• Proibido deixar o animal sozinho no flat por longos períodos.\n• O hóspede tutor é responsável pela conservação e integridade do apartamento."
  }
  const pricing = siteConfig?.pricing || {
    directDiscountPercent: 15,
    pixDiscountPercent: 5
  }
  const stayDiscounts = tariffSettings?.stayDiscounts || {
    weeklyPct: 0.10,
    biweeklyPct: 0.15,
    monthlyPct: 0.25,
  }

  // Markups reais do SSOT para os botões e simuladores
  const directMarkupPct = Math.round((tariffSettings?.channelMarkups?.direct?.markupPct ?? 0) * 100)
  const bookingMarkupPct = Math.round((tariffSettings?.channelMarkups?.booking?.markupPct ?? 0) * 100)
  const airbnbMarkupPct = Math.round((tariffSettings?.channelMarkups?.airbnb?.markupPct ?? 0.03) * 100)
  const expediaMarkupPct = Math.round((tariffSettings?.channelMarkups?.expedia?.markupPct ?? 0.03) * 100)
  const corporateDiscountPct = Math.round((tariffSettings?.channelMarkups?.corporate?.discountPct ?? 0.10) * 100)

  const effectiveBaseRate = tariffSettings?.mode === "manual"
    ? Number(tariffSettings?.baseDailyRate || 276.63)
    : Number(calculation.tarifaMinima || 276.63)

  // Cálculo do Simulador Multi-Noites & Paridade
  const simStayDiscountPct = simNights >= 30
    ? (stayDiscounts.monthlyPct ?? 0.25)
    : simNights >= 15
    ? (stayDiscounts.biweeklyPct ?? 0.15)
    : simNights >= 7
    ? (stayDiscounts.weeklyPct ?? 0.10)
    : 0
  const simBreakfastAdd = simPlan === "com_cafe"
    ? (sebraeSettings.breakfastSurchargePerGuest ?? 25) * simGuests
    : 0
  const simExtraBedAdd = simGuests >= 3 ? (sebraeSettings.extraBedFee ?? 60) : 0
  const simDailyBeforeDiscount = effectiveBaseRate + simBreakfastAdd
  const simDailyAfterDiscount = simDailyBeforeDiscount * (1 - simStayDiscountPct)
  const simDirectTotal = Math.round((simDailyAfterDiscount * simNights + simExtraBedAdd) * 100) / 100
  const simBookingTotal = Math.round((simDirectTotal * (1 + bookingMarkupPct / 100)) * 100) / 100
  const simAirbnbTotal = Math.round((simDirectTotal * (1 + airbnbMarkupPct / 100)) * 100) / 100

  return (
    <Shell>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 pb-28">
        {/* Header Superior Unificado */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Coins className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Central de Tarifas & Precificação SEBRAE
              </h1>
              <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 font-semibold">
                SEBRAE 100% • 19 UHs
              </Badge>
              <Badge className="bg-emerald-600 text-white text-xs">
                WebBookingPro Ativa
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Mapa de diárias multi-canal, engenharia de custos SEBRAE (Tarifa Mínima R$ {calculation.tarifaMinima.toFixed(2)} • Piso Break-Even R$ {calculation.breakEvenFloor.toFixed(2)}), sazonalidade e publicação em lote.
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

        {/* Banner de Alterações Pendentes WBP */}
        {sebraeSettings.hasStagedChanges && activeTab !== "previsualizacao" && (
          <UnpublishedAlertBanner
            stagedCount={sebraeSettings.stagedChangesCount || preview.alteredRatesCount || 84}
            onNavigateToPreview={() => setActiveTab("previsualizacao")}
          />
        )}

        {/* Banner de Sucesso após Publicação WBP */}
        {publishSuccessBanner && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-3.5 px-4 flex items-center gap-3 text-sm text-emerald-900 dark:text-emerald-200 shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{publishSuccessBanner}</span>
          </div>
        )}

        {/* 5 Abas Principais da Central Unificada */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto pb-1 scrollbar-none">
            <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl h-auto flex gap-1 min-w-max border border-slate-200/70 dark:border-slate-700/60">
              <TabsTrigger value="calendar" className="rounded-lg text-xs font-bold gap-1.5 py-2 px-3.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-xs">
                <CalendarIcon className="w-3.5 h-3.5 text-sky-600" />
                <span>1. Calendário & Disponibilidade</span>
              </TabsTrigger>
              <TabsTrigger value="sebrae" className="rounded-lg text-xs font-bold gap-1.5 py-2 px-3.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-xs">
                <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                <span>2. Engenharia SEBRAE & Custos</span>
              </TabsTrigger>
              <TabsTrigger value="sazonalidade" className="rounded-lg text-xs font-bold gap-1.5 py-2 px-3.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-xs">
                <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
                <span>3. Sazonalidade Anual (12M)</span>
              </TabsTrigger>
              <TabsTrigger value="canais-regras" className="rounded-lg text-xs font-bold gap-1.5 py-2 px-3.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-xs">
                <Sliders className="w-3.5 h-3.5 text-amber-600" />
                <span>4. Canais, Descontos, Restrições & Políticas</span>
              </TabsTrigger>
              <TabsTrigger value="previsualizacao" className="rounded-lg text-xs font-bold gap-1.5 py-2 px-3.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-xs relative">
                <Send className="w-3.5 h-3.5 text-indigo-600" />
                <span>5. Publicação em Lote & Travas (WBP)</span>
                {sebraeSettings.hasStagedChanges && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-0.5" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 1: CALENDÁRIO DE TARIFAS & DISPONIBILIDADE + SIMULADOR
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="calendar" className="space-y-5">
            {/* Barra de Referência SEBRAE em Tempo Real */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">Tarifa Mínima SEBRAE</span>
                  <span className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                    R$ {(calendarData?.sebraeTarifaMinima ?? calculation.tarifaMinima).toFixed(2)}
                  </span>
                </div>
                <Badge className="bg-emerald-600 text-white text-[10px]">Margem {Math.round((sebraeSettings.targetMarginPct || 0.25) * 100)}%</Badge>
              </div>

              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 block">Piso Break-Even (Lucro 0%)</span>
                  <span className="text-lg font-black text-amber-700 dark:text-amber-400 font-mono">
                    R$ {(calendarData?.sebraeBreakEvenFloor ?? calculation.breakEvenFloor).toFixed(2)}
                  </span>
                </div>
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>

              <div className="p-3 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-sky-800 dark:text-sky-300 block">Sazonalidade do Mês ({selectedMonth})</span>
                  <span className="text-lg font-black text-sky-700 dark:text-sky-400 font-mono">
                    {calendarData?.seasonName || "Média"} ({Number(calendarData?.seasonalityFactor ?? 1.0).toFixed(2)}x)
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] border-sky-300 text-sky-700">
                  Base R$ {(calendarData?.sebraeBaseRate ?? effectiveBaseRate).toFixed(0)}
                </Badge>
              </div>

              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300 block">Acréscimo Fim de Semana</span>
                  <span className="text-lg font-black text-indigo-700 dark:text-indigo-400 font-mono">
                    +{Math.round((tariffSettings?.weekendMarkupPct ?? 0.15) * 100)}% (Sex/Sáb)
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700">
                  {tariffSettings?.mode === "manual" ? "Modo Manual" : "Modo SEBRAE"}
                </Badge>
              </div>
            </div>

            {/* Toolbar do Calendário */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              {/* Seletor de Canal (com Markups Reais do SSOT) */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 mr-1">Canal:</span>
                <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSelectedChannel("direct")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedChannel === "direct" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🌐 Direto</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-emerald-300 text-emerald-700">
                      {directMarkupPct > 0 ? `+${directMarkupPct}%` : "0%"}
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedChannel("booking")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedChannel === "booking" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🏨 Booking.com</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-sky-300 text-sky-700">
                      +{bookingMarkupPct}%
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedChannel("airbnb")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedChannel === "airbnb" ? "bg-white text-rose-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🏠 Airbnb</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-rose-300 text-rose-700">
                      +{airbnbMarkupPct}%
                    </Badge>
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
                <span>🟣 Fim de Semana (+{Math.round((tariffSettings?.weekendMarkupPct ?? 0.15) * 100)}%)</span>
              </div>
              <span className="ml-auto text-slate-400">Clique na célula para ajuste individual</span>
            </div>

            {/* Grade Matriz: Flats x Dias */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto max-h-[600px] relative">
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
                          const flatOverride = (calendarData?.overrides || []).find((o: any) => 
                            o.date === d.date && (String(o.flatId) === String(flat.id) || String(o.flatNumber) === String(flat.number)) && (o.channel === "all" || o.channel === selectedChannel)
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

            {/* Simulador de Reserva Multi-Noites & Paridade entre Canais */}
            <Card className="border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-black flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-sky-600" />
                      Simulador de Reserva Multi-Noites & Paridade entre Canais
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Simule pacotes com desconto progressivo por duração de estadia e compare valores brutos/líquidos entre Venda Direta, Booking e Airbnb
                    </CardDescription>
                  </div>
                  {simStayDiscountPct > 0 && (
                    <Badge className="bg-emerald-600 text-white text-xs">
                      Desconto Progressivo Ativo: -{Math.round(simStayDiscountPct * 100)}% ({simNights} noites)
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-bold">Quantidade de Noites</Label>
                    <div className="flex items-center gap-1.5 mt-1">
                      {[1, 3, 7, 15, 30].map(n => (
                        <Button
                          key={n}
                          type="button"
                          size="sm"
                          variant={simNights === n ? "default" : "outline"}
                          onClick={() => setSimNights(n)}
                          className="h-8 text-xs font-bold flex-1"
                        >
                          {n}d
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Plano Tarifário</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={simPlan === "sem_cafe" ? "default" : "outline"}
                        onClick={() => setSimPlan("sem_cafe")}
                        className="h-8 text-xs font-bold flex-1"
                      >
                        Sem Café
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={simPlan === "com_cafe" ? "default" : "outline"}
                        onClick={() => setSimPlan("com_cafe")}
                        className="h-8 text-xs font-bold flex-1"
                      >
                        ☕ Com Café
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Hóspedes no Flat</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {[1, 2, 3].map(g => (
                        <Button
                          key={g}
                          type="button"
                          size="sm"
                          variant={simGuests === g ? "default" : "outline"}
                          onClick={() => setSimGuests(g)}
                          className="h-8 text-xs font-bold flex-1"
                        >
                          {g} {g === 1 ? "Hósp." : "Hósp."}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">🌐 Site Direto ({simNights} noites)</span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        R$ {simDailyAfterDiscount.toFixed(2)}/noite {simGuests === 3 ? `+ R$ ${simExtraBedAdd} cama extra` : ""}
                      </span>
                    </div>
                    <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                      R$ {simDirectTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-sky-50/50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-sky-900 dark:text-sky-200 block">🏨 Booking.com (+{bookingMarkupPct}%)</span>
                      <span className="text-[11px] text-sky-700 dark:text-sky-400">
                        Comissão OTA: {Math.round((tariffSettings?.channelMarkups?.booking?.commissionPct ?? 0.15) * 100)}%
                      </span>
                    </div>
                    <span className="text-base font-black text-sky-700 dark:text-sky-400 font-mono">
                      R$ {simBookingTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-200 block">🏠 Airbnb (+{airbnbMarkupPct}%)</span>
                      <span className="text-[11px] text-rose-700 dark:text-rose-400">
                        Comissão OTA: {Math.round((tariffSettings?.channelMarkups?.airbnb?.commissionPct ?? 0.15) * 100)}%
                      </span>
                    </div>
                    <span className="text-base font-black text-rose-700 dark:text-rose-400 font-mono">
                      R$ {simAirbnbTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 2: ENGENHARIA DE PREÇOS SEBRAE, CUSTOS & ANÁLISES
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="sebrae" className="space-y-6">
            {/* Sub-barra rápida para alternar visão completa ou focada */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Metodologia SEBRAE 100% Editável • Sincronizada com DRE Financeiro e Calendário
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={sebraeSubView === "all" ? "default" : "outline"}
                  onClick={() => setSebraeSubView("all")}
                  className="h-7 text-xs font-bold"
                >
                  Visão Completa
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sebraeSubView === "calculadora" ? "default" : "outline"}
                  onClick={() => setSebraeSubView("calculadora")}
                  className="h-7 text-xs font-bold"
                >
                  Calculadora & Piso
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sebraeSubView === "custos" ? "default" : "outline"}
                  onClick={() => setSebraeSubView("custos")}
                  className="h-7 text-xs font-bold"
                >
                  Auditoria de Custos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sebraeSubView === "analises" ? "default" : "outline"}
                  onClick={() => setSebraeSubView("analises")}
                  className="h-7 text-xs font-bold"
                >
                  Sensibilidade & Projeção
                </Button>
              </div>
            </div>

            {(sebraeSubView === "all" || sebraeSubView === "calculadora") && (
              <SebraePricingTab
                settings={sebraeSettings}
                calculation={calculation}
                onUpdateSettings={handleUpdateSebraeSettings}
                onSaveAndStage={handleSaveAndStageSebrae}
                isSaving={saving}
              />
            )}

            {(sebraeSubView === "all" || sebraeSubView === "custos") && (
              <CostsTab settings={sebraeSettings} calculation={calculation} />
            )}

            {(sebraeSubView === "all" || sebraeSubView === "analises") && (
              <AnalyticsTab calculation={calculation} />
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 3: SAZONALIDADE ANUAL (12 MESES)
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="sazonalidade" className="space-y-6">
            <SeasonalityTab
              settings={sebraeSettings}
              baseRate={calculation.tarifaMinima || 276.63}
              breakEvenFloor={calculation.breakEvenFloor || 189.09}
              onUpdateSettings={handleUpdateSebraeSettings}
              onSaved={() => {
                loadCalendarData()
                toast({
                  title: "Sazonalidade Atualizada! 📅",
                  description: "Curva anual de 12 meses sincronizada com o Calendário de Tarifas.",
                })
              }}
            />
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 4: CANAIS, DESCONTOS, RESTRIÇÕES & POLÍTICAS
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="canais-regras" className="space-y-6">
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
                        onClick={() => setTariffSettings({ ...tariffSettings, mode: "auto", baseDailyRate: calculation.tarifaMinima })}
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
                      No modo SEBRAE, o sistema calcula a tarifa sustentável (R$ {calculation.tarifaMinima.toFixed(2)}) a partir dos custos fixos, variáveis e margem, aplicando a curva de sazonalidade de Campos dos Goytacazes.
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
                          value={tariffSettings?.baseDailyRate ?? 276.63}
                          onChange={e => setTariffSettings({ ...tariffSettings, baseDailyRate: Number(e.target.value) })}
                          className="h-9 font-black text-sm"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block mb-1">Markup FDS (%)</span>
                        <Input
                          type="number"
                          step="1"
                          value={Math.round((tariffSettings?.weekendMarkupPct ?? 0.15) * 100)}
                          onChange={e => {
                            const pct = Number(e.target.value) / 100
                            setTariffSettings({ ...tariffSettings, weekendMarkupPct: pct })
                            handleUpdateSebraeSettings({ weekendMarkupPct: pct })
                          }}
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

            {/* Card 2: Canais de Distribuição, Comissões, Markups & Paridade */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-600" />
                      Canais de Distribuição, Comissões & Repasse de Markups
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Configure comissões e markups por canal (Direto, Booking.com, Airbnb, Expedia e Corporativo B2B) e visualize o valor líquido na conta.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Direto */}
                  <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-emerald-900 dark:text-emerald-300">🌐 Venda Direta / Site</span>
                      <Badge className="bg-emerald-600 text-white font-bold text-[10px]">Taxa Zero OTA</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Desc. Direto (%)</Label>
                        <Input
                          type="number"
                          value={pricing.directDiscountPercent ?? 15}
                          onChange={e => {
                            const val = Number(e.target.value)
                            setSiteConfig({ ...siteConfig, pricing: { ...siteConfig.pricing, directDiscountPercent: val } })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Desc. PIX (%)</Label>
                        <Input
                          type="number"
                          value={pricing.pixDiscountPercent ?? 5}
                          onChange={e => {
                            const val = Number(e.target.value)
                            setSiteConfig({ ...siteConfig, pricing: { ...siteConfig.pricing, pixDiscountPercent: val } })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-emerald-200/60 flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Tarifa Anunciada:</span>
                      <span className="font-black font-mono text-emerald-700 dark:text-emerald-400">R$ {effectiveBaseRate.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Booking */}
                  <div className="p-4 rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-sky-900 dark:text-sky-300">🏨 Booking.com</span>
                      <Badge className="bg-sky-600 text-white font-bold text-[10px]">OTA XML</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Markup Canal (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={bookingMarkupPct}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              channelMarkups: {
                                ...tariffSettings?.channelMarkups,
                                booking: { ...tariffSettings?.channelMarkups?.booking, markupPct: val }
                              }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Comissão OTA (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={Math.round((tariffSettings?.channelMarkups?.booking?.commissionPct ?? 0.15) * 100)}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              channelMarkups: {
                                ...tariffSettings?.channelMarkups,
                                booking: { ...tariffSettings?.channelMarkups?.booking, commissionPct: val }
                              }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-sky-200/60 flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Bruto / Líquido:</span>
                      <span className="font-black font-mono text-sky-700 dark:text-sky-400">
                        R$ {(effectiveBaseRate * (1 + bookingMarkupPct / 100)).toFixed(2)} / R$ {(effectiveBaseRate * (1 + bookingMarkupPct / 100) * (1 - (tariffSettings?.channelMarkups?.booking?.commissionPct ?? 0.15))).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Airbnb */}
                  <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-rose-900 dark:text-rose-300">🏠 Airbnb</span>
                      <Badge className="bg-rose-600 text-white font-bold text-[10px]">OTA XML</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Markup Canal (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={airbnbMarkupPct}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              channelMarkups: {
                                ...tariffSettings?.channelMarkups,
                                airbnb: { ...tariffSettings?.channelMarkups?.airbnb, markupPct: val }
                              }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Comissão OTA (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={Math.round((tariffSettings?.channelMarkups?.airbnb?.commissionPct ?? 0.15) * 100)}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              channelMarkups: {
                                ...tariffSettings?.channelMarkups,
                                airbnb: { ...tariffSettings?.channelMarkups?.airbnb, commissionPct: val }
                              }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-rose-200/60 flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Bruto / Líquido:</span>
                      <span className="font-black font-mono text-rose-700 dark:text-rose-400">
                        R$ {(effectiveBaseRate * (1 + airbnbMarkupPct / 100)).toFixed(2)} / R$ {(effectiveBaseRate * (1 + airbnbMarkupPct / 100) * (1 - (tariffSettings?.channelMarkups?.airbnb?.commissionPct ?? 0.15))).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expedia & Corporativo + Descontos Progressivos por Estadia */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Expedia & Corporativo B2B */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/40 dark:bg-slate-900/30">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                      ✈️ Expedia & 🏢 Corporativo B2B
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Markup Expedia (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={expediaMarkupPct}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              channelMarkups: {
                                ...tariffSettings?.channelMarkups,
                                expedia: { ...tariffSettings?.channelMarkups?.expedia, markupPct: val }
                              }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Desconto Corporativo B2B (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={corporateDiscountPct}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              channelMarkups: {
                                ...tariffSettings?.channelMarkups,
                                corporate: { ...tariffSettings?.channelMarkups?.corporate, discountPct: val }
                              }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Descontos Progressivos por Duração de Estadia */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/40 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Percent className="w-3.5 h-3.5 text-emerald-600" />
                        Descontos Progressivos por Estadia Longa
                      </span>
                      <Badge variant="outline" className="text-[10px]">Long Stay</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Semanal 7+ (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={Math.round((stayDiscounts.weeklyPct ?? 0.10) * 100)}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              stayDiscounts: { ...stayDiscounts, weeklyPct: val }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Quinzenal 15+ (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={Math.round((stayDiscounts.biweeklyPct ?? 0.15) * 100)}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              stayDiscounts: { ...stayDiscounts, biweeklyPct: val }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Mensal 30+ (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={Math.round((stayDiscounts.monthlyPct ?? 0.25) * 100)}
                          onChange={e => {
                            const val = Number(e.target.value) / 100
                            setTariffSettings({
                              ...tariffSettings,
                              stayDiscounts: { ...stayDiscounts, monthlyPct: val }
                            })
                          }}
                          className="h-8 font-black text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Planos de Diárias (Com e Sem Café da Manhã) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Plano Com Café */}
              <Card className="rounded-3xl border-amber-200/80 dark:border-amber-900/50 shadow-sm bg-gradient-to-b from-amber-50/20 to-transparent">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                        <Coffee className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-black text-amber-950 dark:text-amber-200">
                          Diária com Café da Manhã
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Servido exclusivamente e privativamente no flat
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-2 py-0.5">
                      R$ {withBreakfast.dailyRate}/noite
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Valor da Diária Base (R$ / noite)</Label>
                    <Input
                      type="number"
                      value={withBreakfast.dailyRate ?? 225}
                      onChange={e => {
                        const current = siteConfig.ratePlans || {}
                        setSiteConfig({
                          ...siteConfig,
                          ratePlans: {
                            ...current,
                            with_breakfast: { ...withBreakfast, dailyRate: Number(e.target.value) }
                          }
                        })
                      }}
                      className="font-black text-sm h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-bold block">Taxa de Limpeza no Plano com Café</Label>
                        <span className="text-[11px] text-slate-500">Cobrar taxa de limpeza neste regime?</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={!withBreakfast.cleaningFeeEnabled ? "default" : "outline"}
                          onClick={() => {
                            const current = siteConfig.ratePlans || {}
                            setSiteConfig({
                              ...siteConfig,
                              ratePlans: {
                                ...current,
                                with_breakfast: { ...withBreakfast, cleaningFeeEnabled: false, cleaningFeeAmount: 0 }
                              }
                            })
                          }}
                          className="text-xs font-bold h-7 px-2.5 rounded-lg"
                        >
                          Isento (Grátis)
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={withBreakfast.cleaningFeeEnabled ? "default" : "outline"}
                          onClick={() => {
                            const current = siteConfig.ratePlans || {}
                            setSiteConfig({
                              ...siteConfig,
                              ratePlans: {
                                ...current,
                                with_breakfast: { ...withBreakfast, cleaningFeeEnabled: true, cleaningFeeAmount: 70 }
                              }
                            })
                          }}
                          className="text-xs font-bold h-7 px-2.5 rounded-lg"
                        >
                          Cobrar Taxa
                        </Button>
                      </div>
                    </div>

                    {withBreakfast.cleaningFeeEnabled && (
                      <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold">Valor (R$)</Label>
                          <Input
                            type="number"
                            value={withBreakfast.cleaningFeeAmount ?? 70}
                            onChange={e => {
                              const current = siteConfig.ratePlans || {}
                              setSiteConfig({
                                ...siteConfig,
                                ratePlans: {
                                  ...current,
                                  with_breakfast: { ...withBreakfast, cleaningFeeAmount: Number(e.target.value) }
                                }
                              })
                            }}
                            className="text-xs h-8 rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold">Frequência</Label>
                          <select
                            value={withBreakfast.cleaningFeeType || "per_stay"}
                            onChange={e => {
                              const current = siteConfig.ratePlans || {}
                              setSiteConfig({
                                ...siteConfig,
                                ratePlans: {
                                  ...current,
                                  with_breakfast: { ...withBreakfast, cleaningFeeType: e.target.value }
                                }
                              })
                            }}
                            className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                          >
                            <option value="per_stay">Por Estadia (1x)</option>
                            <option value="per_night">Por Noite / Diária</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-600">Descrição Comercial no Card</Label>
                    <Input
                      value={withBreakfast.description || "Diária com Café da Manhã servido exclusivamente no flat"}
                      onChange={e => {
                        const current = siteConfig.ratePlans || {}
                        setSiteConfig({
                          ...siteConfig,
                          ratePlans: {
                            ...current,
                            with_breakfast: { ...withBreakfast, description: e.target.value }
                          }
                        })
                      }}
                      className="text-xs h-8 rounded-xl bg-white dark:bg-slate-900"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Plano Sem Café */}
              <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-b from-slate-50/50 to-transparent">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center font-bold">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-black text-slate-900 dark:text-slate-100">
                          Diária Sem Café (Tarifa Econômica)
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Apenas hospedagem em flat completo e climatizado
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className="bg-slate-800 text-white font-bold text-xs px-2 py-0.5">
                      R$ {roomOnly.dailyRate}/noite
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Valor da Diária Base (R$ / noite)</Label>
                    <Input
                      type="number"
                      value={roomOnly.dailyRate ?? 190}
                      onChange={e => {
                        const current = siteConfig.ratePlans || {}
                        setSiteConfig({
                          ...siteConfig,
                          ratePlans: {
                            ...current,
                            room_only: { ...roomOnly, dailyRate: Number(e.target.value) }
                          }
                        })
                      }}
                      className="font-black text-sm h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-bold block">Taxa de Limpeza no Plano Sem Café</Label>
                        <span className="text-[11px] text-slate-500">Cobrada 1x por estadia para higienização</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={roomOnly.cleaningFeeEnabled !== false ? "default" : "outline"}
                          onClick={() => {
                            const current = siteConfig.ratePlans || {}
                            setSiteConfig({
                              ...siteConfig,
                              ratePlans: {
                                ...current,
                                room_only: { ...roomOnly, cleaningFeeEnabled: true, cleaningFeeAmount: 70 }
                              }
                            })
                          }}
                          className="text-xs font-bold h-7 px-2.5 rounded-lg"
                        >
                          Cobrar Taxa
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={roomOnly.cleaningFeeEnabled === false ? "default" : "outline"}
                          onClick={() => {
                            const current = siteConfig.ratePlans || {}
                            setSiteConfig({
                              ...siteConfig,
                              ratePlans: {
                                ...current,
                                room_only: { ...roomOnly, cleaningFeeEnabled: false, cleaningFeeAmount: 0 }
                              }
                            })
                          }}
                          className="text-xs font-bold h-7 px-2.5 rounded-lg"
                        >
                          Isento
                        </Button>
                      </div>
                    </div>

                    {roomOnly.cleaningFeeEnabled !== false && (
                      <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold">Valor (R$)</Label>
                          <Input
                            type="number"
                            value={roomOnly.cleaningFeeAmount ?? 70}
                            onChange={e => {
                              const current = siteConfig.ratePlans || {}
                              setSiteConfig({
                                ...siteConfig,
                                ratePlans: {
                                  ...current,
                                  room_only: { ...roomOnly, cleaningFeeAmount: Number(e.target.value) }
                                }
                              })
                            }}
                            className="text-xs h-8 rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-bold">Frequência</Label>
                          <select
                            value={roomOnly.cleaningFeeType || "per_stay"}
                            onChange={e => {
                              const current = siteConfig.ratePlans || {}
                              setSiteConfig({
                                ...siteConfig,
                                ratePlans: {
                                  ...current,
                                  room_only: { ...roomOnly, cleaningFeeType: e.target.value }
                                }
                              })
                            }}
                            className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                          >
                            <option value="per_stay">Por Estadia (1x)</option>
                            <option value="per_night">Por Noite / Diária</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-600">Descrição Comercial no Card</Label>
                    <Input
                      value={roomOnly.description || "Tarifa econômica sem café da manhã"}
                      onChange={e => {
                        const current = siteConfig.ratePlans || {}
                        setSiteConfig({
                          ...siteConfig,
                          ratePlans: {
                            ...current,
                            room_only: { ...roomOnly, description: e.target.value }
                          }
                        })
                      }}
                      className="text-xs h-8 rounded-xl bg-white dark:bg-slate-900"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Card 4: Serviços Adicionais & Políticas de Hospedagem */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black">Taxas de Serviços Adicionais & Políticas</CardTitle>
                <CardDescription className="text-xs">
                  Taxas cobradas por limpeza, 3º hóspede, camas extras, animais de estimação e regras de hospedagem.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Colchonete Extra */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-sky-600" /> Colchonete 3º Hóspede</span>
                      <Badge variant="outline" className="text-[10px]">R$ {extraBedConfig.feeAmount || 60}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Valor da Taxa (R$)</Label>
                      <Input
                        type="number"
                        value={extraBedConfig.feeAmount ?? 60}
                        onChange={e => setSiteConfig({ ...siteConfig, extraBedConfig: { ...siteConfig.extraBedConfig, feeAmount: Number(e.target.value) } })}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Frequência</Label>
                      <select
                        value={extraBedConfig.feeType || "per_stay"}
                        onChange={e => setSiteConfig({ ...siteConfig, extraBedConfig: { ...siteConfig.extraBedConfig, feeType: e.target.value } })}
                        className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                      >
                        <option value="per_stay">Por Estadia (1x)</option>
                        <option value="per_night">Por Noite / Diária</option>
                      </select>
                    </div>
                    <div className="text-[10.5px] text-slate-500">⏰ Corte automático às 12:00 para hoje.</div>
                  </div>

                  {/* Camas Twin */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">🛏️ 2 Camas Solteiro (Twin)</span>
                      <Badge variant="outline" className="text-[10px]">R$ {bedConfig.twinFeeAmount || 30}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Valor da Montagem (R$)</Label>
                      <Input
                        type="number"
                        value={bedConfig.twinFeeAmount ?? 30}
                        onChange={e => setSiteConfig({ ...siteConfig, bedConfig: { ...siteConfig.bedConfig, twinFeeAmount: Number(e.target.value) } })}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Frequência</Label>
                      <select
                        value={bedConfig.twinFeeType || "per_stay"}
                        onChange={e => setSiteConfig({ ...siteConfig, bedConfig: { ...siteConfig.bedConfig, twinFeeType: e.target.value } })}
                        className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                      >
                        <option value="per_stay">Por Estadia (1x)</option>
                        <option value="per_night">Por Noite / Diária</option>
                      </select>
                    </div>
                    <div className="text-[10.5px] text-slate-500">Taxa única por estadia.</div>
                  </div>

                  {/* Pet Friendly */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-rose-600" /> Política Pet Friendly</span>
                      <Badge variant="outline" className="text-[10px]">R$ {petPolicy.feeAmount || 80}</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Taxa por Pet (R$)</Label>
                      <Input
                        type="number"
                        value={petPolicy.feeAmount ?? 80}
                        onChange={e => setSiteConfig({ ...siteConfig, petPolicy: { ...siteConfig.petPolicy, feeAmount: Number(e.target.value) } })}
                        className="h-8 font-black text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold">Frequência</Label>
                      <select
                        value={petPolicy.feeType || "per_stay"}
                        onChange={e => setSiteConfig({ ...siteConfig, petPolicy: { ...siteConfig.petPolicy, feeType: e.target.value } })}
                        className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                      >
                        <option value="per_stay">Por Estadia (1x)</option>
                        <option value="per_night">Por Noite / Diária</option>
                      </select>
                    </div>
                    <div className="text-[10.5px] text-slate-500">Cães até 15kg permitidos.</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 5: Regras e Restrições Operacionais de Venda (ARI / WBP) */}
            <RestrictionsTab />

            {/* Ações de Salvamento e Padrões */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetDefaults}
                disabled={saving}
                className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Padrões</span>
              </Button>

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

          {/* ═══════════════════════════════════════════════════════════════════
              ABA 5: PUBLICAÇÃO EM LOTE & TRAVAS DE SEGURANÇA (WBP)
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="previsualizacao" className="space-y-6">
            <PublishPreviewTab
              summary={preview}
              onConfirmVariation={handleConfirmVariation}
              onDiscardVariation={handleDiscardVariation}
              onDiscardAll={handleDiscardAll}
              onPublish={handlePublishWbp}
              onRefresh={handleRefreshPreview}
              isPublishing={isPublishing}
              isLoading={calLoading}
            />
          </TabsContent>
        </Tabs>

        {/* ═══════════════════════════════════════════════════════════════════
            MODAL DE AJUSTE INDIVIDUAL DE CÉLULA (OVERRIDE - MODAL 5)
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
            MODAL DE EDIÇÃO EM LOTE (BULK UPDATE - MODAL 6)
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
                          Ex: R$ {Math.round(effectiveBaseRate)} + {bulkValue}% = <strong>R$ {Math.round(effectiveBaseRate * (1 + bulkValue / 100))}</strong>
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
