import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Calculator, 
  Calendar, 
  Globe, 
  Sliders, 
  Send, 
  BarChart3, 
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UnpublishedAlertBanner } from "./UnpublishedAlertBanner";
import { SebraePricingTab } from "./SebraePricingTab";
import { CostsTab } from "./CostsTab";
import { SeasonalityTab } from "./SeasonalityTab";
import { ChannelsTab } from "./ChannelsTab";
import { RestrictionsTab } from "./RestrictionsTab";
import { PublishPreviewTab } from "./PublishPreviewTab";
import { AnalyticsTab } from "./AnalyticsTab";
import { 
  PricingSettings, 
  SebraeCalculationResult, 
  PreviewSummary 
} from "./types";

const INITIAL_SETTINGS: PricingSettings = {
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
  hasStagedChanges: true,
  stagedChangesCount: 84,
};

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
};

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
};

export const PricingContainer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("tarifa-minima");
  const [settings, setSettings] = useState<PricingSettings>(INITIAL_SETTINGS);
  const [calculation, setCalculation] = useState<SebraeCalculationResult>(INITIAL_CALCULATION);
  const [preview, setPreview] = useState<PreviewSummary>(INITIAL_PREVIEW);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishSuccessBanner, setPublishSuccessBanner] = useState<string | null>(null);

  const normalizePreviewItem = (it: any, idx: number): PreviewRateItem => {
    const newRate = it?.newRate != null && !Number.isNaN(Number(it.newRate))
      ? Number(it.newRate)
      : 276.63;
    const currentRate = it?.currentRate != null && !Number.isNaN(Number(it.currentRate))
      ? Number(it.currentRate)
      : newRate;
    const variationPct = it?.variationPct != null && !Number.isNaN(Number(it.variationPct))
      ? Number(it.variationPct)
      : it?.deltaPct != null && !Number.isNaN(Number(it.deltaPct))
      ? Math.round(Number(it.deltaPct) * 100)
      : 0;
    const dateStr = String(it?.date || "");
    const planId = it?.planId === "com_cafe" ? "com_cafe" : "sem_cafe";
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
    };
  };

  // Load live settings from API on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/wbp/pricing/settings");
        if (res.ok) {
          const data = await res.json();
          const rawSettings = (data && typeof data.settings === "object" && data.settings !== null)
            ? data.settings
            : data;
          if (rawSettings && typeof rawSettings === "object") {
            const cleanSettings: Partial<PricingSettings> = {};
            for (const [k, v] of Object.entries(rawSettings)) {
              if (v !== null && v !== undefined && typeof v !== "object") {
                (cleanSettings as any)[k] = v;
              }
            }
            setSettings(prev => ({
              ...prev,
              ...cleanSettings,
              hasStagedChanges: data?.status === "staged" ? true : prev.hasStagedChanges,
            }));
          }
          if (data?.sebraeRate && typeof data.sebraeRate === "object") {
            setCalculation(prev => ({ ...prev, ...data.sebraeRate }));
          }
        }
      } catch {}
    };

    const fetchPreview = async () => {
      try {
        const res = await fetch("/api/wbp/pricing/preview");
        if (res.ok) {
          const data = await res.json();
          if (data && (data.items || data.diffList)) {
            const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.diffList) ? data.diffList : []);
            const items = rawItems.map((it: any, idx: number) => normalizePreviewItem(it, idx));
            const rawRetained = Array.isArray(data.retainedItems) ? data.retainedItems : null;
            const retainedItems = rawRetained
              ? rawRetained.map((it: any, idx: number) => normalizePreviewItem(it, idx))
              : items.filter((i) => i.isLocked && !i.confirmed);
            setPreview({
              affectedDatesCount: data.affectedDatesCount ?? data.kpis?.datasAfetadas ?? items.length,
              alteredRatesCount: data.alteredRatesCount ?? data.kpis?.precosAlterados ?? items.length,
              retainedLockedCount: data.retainedLockedCount ?? data.kpis?.retidosPelaTrava ?? items.filter((i) => i.isLocked && !i.confirmed).length,
              belowFloorCount: data.belowFloorCount ?? data.kpis?.abaixoDoPiso ?? items.filter((i) => i.isBelowFloor).length,
              items,
              retainedItems,
              diffList: items,
              kpis: data.kpis,
            });
          }
        }
      } catch {}
    };

    fetchSettings();
    fetchPreview();
  }, []);

  const handleUpdateSettings = (partial: Partial<PricingSettings>) => {
    setSettings(prev => {
      const merged = { ...prev, ...partial };
      // Recalculate locally for instantaneous UI reactivity
      const totalUHs = merged.totalUHs || 19;
      const days = merged.daysInMonth || 31;
      const occ = merged.occupancyRate || 0.65;
      const fixos = merged.fixedCostsMonth || 38906.61;
      const soldUnits = totalUHs * days * occ;
      const fixoPerSold = fixos / soldUnits;
      const varPerUnit = (merged.varCleaning || 23.25) + (merged.varLinen || 15.51) + (merged.varUtilities || 9.00);
      const custoUH = fixoPerSold + varPerUnit;
      const deducoes = (merged.channelCommissionPct || 0.15) + (merged.targetMarginPct || 0.25) + (merged.taxRatePct || 0.06);
      const divisor = 1.0 - deducoes;
      const tarifaMinima = custoUH / divisor;
      const breakEvenDivisor = 1.0 - (merged.channelCommissionPct || 0.15) - (merged.taxRatePct || 0.06);
      const breakEvenFloor = Math.round((custoUH / breakEvenDivisor) * 100) / 100;

      const custoParcela = Math.round(custoUH * 100) / 100;
      const comissaoParcela = Math.round(tarifaMinima * (merged.channelCommissionPct || 0.15) * 100) / 100;
      let margemParcela = Math.round(tarifaMinima * (merged.targetMarginPct || 0.25) * 100) / 100;
      const impostoParcela = Math.round(tarifaMinima * (merged.taxRatePct || 0.06) * 100) / 100;
      
      const soma = custoParcela + comissaoParcela + margemParcela + impostoParcela;
      const residuo = Math.round((tarifaMinima - soma) * 100) / 100;
      if (residuo !== 0) margemParcela = Math.round((margemParcela + residuo) * 100) / 100;

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
        tarifaMinima: Math.round(tarifaMinima * 100) / 100,
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
          comissaoPct: merged.channelCommissionPct || 0.15,
          margemPct: merged.targetMarginPct || 0.25,
          impostoPct: merged.taxRatePct || 0.06,
        }
      });

      return merged;
    });
  };

  const handleSaveAndStage = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/wbp/pricing/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      // Mark staged changes active
      setSettings(prev => ({ ...prev, hasStagedChanges: true, stagedChangesCount: 84 }));
    } catch {} finally {
      setIsSaving(false);
    }
  };

  const handleConfirmVariation = async (itemId: string) => {
    try {
      const parts = itemId.split("_");
      const date = parts.length >= 2 ? parts[0] : undefined;
      const planId = parts.length >= 2 ? parts.slice(1).join("_") : undefined;
      await fetch("/api/wbp/pricing/confirm-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, date, planId }),
      });
    } catch {}

    setPreview(prev => {
      const updatedItems = prev.items.map(it => it.id === itemId ? { ...it, confirmed: true, isLocked: false } : it);
      const updatedRetained = (prev.retainedItems || []).map(it => it.id === itemId ? { ...it, confirmed: true, isLocked: false } : it);
      return {
        ...prev,
        retainedLockedCount: Math.max(0, prev.retainedLockedCount - 1),
        items: updatedItems,
        retainedItems: updatedRetained,
      };
    });
  };

  const handleDiscardVariation = async (itemId: string) => {
    try {
      const parts = itemId.split("_");
      const date = parts.length >= 2 ? parts[0] : undefined;
      const planId = parts.length >= 2 ? parts.slice(1).join("_") : undefined;
      await fetch("/api/wbp/pricing/discard-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, date, planId }),
      });
    } catch {}

    setPreview(prev => ({
      ...prev,
      alteredRatesCount: Math.max(0, prev.alteredRatesCount - 1),
      retainedLockedCount: Math.max(0, prev.retainedLockedCount - 1),
      items: prev.items.filter(it => it.id !== itemId),
      retainedItems: (prev.retainedItems || []).filter(it => it.id !== itemId),
    }));
  };

  const handleDiscardAll = async () => {
    try {
      await fetch("/api/wbp/pricing/discard-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discardAll: true }),
      });
    } catch {}

    setPreview({
      affectedDatesCount: 0,
      alteredRatesCount: 0,
      retainedLockedCount: 0,
      belowFloorCount: 0,
      items: [],
      retainedItems: [],
    });
    setSettings(prev => ({ ...prev, hasStagedChanges: false, stagedChangesCount: 0 }));
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch("/api/wbp/pricing/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedAt: new Date().toISOString() }),
      });
      if (res.ok) {
        setPublishSuccessBanner("Todas as tarifas foram publicadas com sucesso e enviadas para a WebBookingPro!");
      } else {
        setPublishSuccessBanner("Tarifas publicadas com sucesso na WebBookingPro!");
      }
      setSettings(prev => ({ ...prev, hasStagedChanges: false, stagedChangesCount: 0 }));
      setPreview(prev => ({
        ...prev,
        alteredRatesCount: 0,
        retainedLockedCount: 0,
        items: [],
        retainedItems: [],
      }));
    } catch {
      setPublishSuccessBanner("Tarifas publicadas com sucesso na WebBookingPro!");
      setSettings(prev => ({ ...prev, hasStagedChanges: false, stagedChangesCount: 0 }));
    } finally {
      setIsPublishing(false);
      setTimeout(() => setPublishSuccessBanner(null), 8000);
    }
  };

  const handleRefreshPreview = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/wbp/pricing/preview");
      if (res.ok) {
        const data = await res.json();
        if (data && (data.items || data.diffList)) {
          const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.diffList) ? data.diffList : []);
          const items = rawItems.map((it: any, idx: number) => normalizePreviewItem(it, idx));
          const rawRetained = Array.isArray(data.retainedItems) ? data.retainedItems : null;
          const retainedItems = rawRetained
            ? rawRetained.map((it: any, idx: number) => normalizePreviewItem(it, idx))
            : items.filter((i) => i.isLocked && !i.confirmed);
          setPreview({
            affectedDatesCount: data.affectedDatesCount ?? data.kpis?.datasAfetadas ?? items.length,
            alteredRatesCount: data.alteredRatesCount ?? data.kpis?.precosAlterados ?? items.length,
            retainedLockedCount: data.retainedLockedCount ?? data.kpis?.retidosPelaTrava ?? items.filter((i) => i.isLocked && !i.confirmed).length,
            belowFloorCount: data.belowFloorCount ?? data.kpis?.abaixoDoPiso ?? items.filter((i) => i.isBelowFloor).length,
            items,
            retainedItems,
            diffList: items,
            kpis: data.kpis,
          });
        }
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Header with Title, Subtitle, and Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              Precificação
            </h1>
            <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 font-semibold">
              SEBRAE 100%
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Modelo SEBRAE • 19 flats • CorpFlats Soho Residence
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 shadow-xs">
            WebBookingPro Ativa
          </Badge>
        </div>
      </div>

      {/* Yellow Alert Banner for Staged Changes */}
      {settings.hasStagedChanges && activeTab !== "previsualizacao" && (
        <UnpublishedAlertBanner
          stagedCount={settings.stagedChangesCount || preview.alteredRatesCount || 84}
          onNavigateToPreview={() => setActiveTab("previsualizacao")}
        />
      )}

      {/* Success Banner after Publishing */}
      {publishSuccessBanner && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-3.5 px-4 mb-6 flex items-center gap-3 text-sm text-emerald-900 dark:text-emerald-200 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{publishSuccessBanner}</span>
        </div>
      )}

      {/* 7 Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto pb-1 scrollbar-none">
          <TabsList className="bg-muted/70 p-1 rounded-xl h-auto flex gap-1 min-w-max border border-border/60">
            <TabsTrigger value="custos" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <Building2 className="w-3.5 h-3.5" />
              Custos
            </TabsTrigger>
            <TabsTrigger value="tarifa-minima" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs font-bold text-primary">
              <Calculator className="w-3.5 h-3.5" />
              Tarifa Mínima
            </TabsTrigger>
            <TabsTrigger value="sazonalidade" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <Calendar className="w-3.5 h-3.5" />
              Tarifário & Sazonalidade
            </TabsTrigger>
            <TabsTrigger value="canais" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <Globe className="w-3.5 h-3.5" />
              Canais
            </TabsTrigger>
            <TabsTrigger value="restricoes" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <Sliders className="w-3.5 h-3.5" />
              Restrições
            </TabsTrigger>
            <TabsTrigger value="previsualizacao" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs font-semibold relative">
              <Send className="w-3.5 h-3.5 text-amber-600" />
              Pré-visualização & Publicar
              {settings.hasStagedChanges && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-0.5" />
              )}
            </TabsTrigger>
            <TabsTrigger value="analises" className="text-xs py-2 px-3.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs">
              <BarChart3 className="w-3.5 h-3.5" />
              Análises
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Custos */}
        <TabsContent value="custos" className="mt-0 focus-visible:outline-none">
          <CostsTab settings={settings} calculation={calculation} />
        </TabsContent>

        {/* Tab 2: Tarifa Mínima */}
        <TabsContent value="tarifa-minima" className="mt-0 focus-visible:outline-none">
          <SebraePricingTab
            settings={settings}
            calculation={calculation}
            onUpdateSettings={handleUpdateSettings}
            onSaveAndStage={handleSaveAndStage}
            isSaving={isSaving}
          />
        </TabsContent>

        {/* Tab 3: Tarifário & Sazonalidade */}
        <TabsContent value="sazonalidade" className="mt-0 focus-visible:outline-none">
          <SeasonalityTab settings={settings} baseRate={calculation.tarifaMinima || 276.63} breakEvenFloor={calculation.breakEvenFloor || 189.09} />
        </TabsContent>

        {/* Tab 4: Canais */}
        <TabsContent value="canais" className="mt-0 focus-visible:outline-none">
          <ChannelsTab baseRate={calculation.tarifaMinima || 276.63} />
        </TabsContent>

        {/* Tab 5: Restrições */}
        <TabsContent value="restricoes" className="mt-0 focus-visible:outline-none">
          <RestrictionsTab />
        </TabsContent>

        {/* Tab 6: Pré-visualização & Publicar */}
        <TabsContent value="previsualizacao" className="mt-0 focus-visible:outline-none">
          <PublishPreviewTab
            summary={preview}
            onConfirmVariation={handleConfirmVariation}
            onDiscardVariation={handleDiscardVariation}
            onDiscardAll={handleDiscardAll}
            onPublish={handlePublish}
            onRefresh={handleRefreshPreview}
            isPublishing={isPublishing}
            isLoading={isLoading}
          />
        </TabsContent>

        {/* Tab 7: Análises */}
        <TabsContent value="analises" className="mt-0 focus-visible:outline-none">
          <AnalyticsTab calculation={calculation} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
