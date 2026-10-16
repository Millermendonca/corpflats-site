import React, { useState } from "react";
import { 
  Building2, 
  Calculator, 
  CheckCircle2, 
  Coffee, 
  Layers, 
  Percent, 
  Sparkles,
  Info,
  Save,
  RotateCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SebraeCalculationResult, PricingSettings } from "./types";

interface SebraePricingTabProps {
  settings: PricingSettings;
  calculation: SebraeCalculationResult;
  onUpdateSettings: (newSettings: Partial<PricingSettings>) => void;
  onSaveAndStage: () => Promise<void>;
  isSaving: boolean;
}

export const SebraePricingTab: React.FC<SebraePricingTabProps> = ({
  settings,
  calculation,
  onUpdateSettings,
  onSaveAndStage,
  isSaving,
}) => {
  const [localSettings, setLocalSettings] = useState<PricingSettings>(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleInputChange = (field: keyof PricingSettings, value: any) => {
    const updated: PricingSettings = { ...localSettings, [field]: value };
    if (field === "fixedSystems" || field === "fixedSystemsMaintenance") {
      updated.fixedSystems = Number(value) || 0;
      updated.fixedSystemsMaintenance = Number(value) || 0;
    }
    if (field === "varCleaning" || field === "varCleaningPerDay") {
      updated.varCleaning = Number(value) || 0;
      updated.varCleaningPerDay = Number(value) || 0;
    }
    if (field === "varLinen" || field === "varCardBreakfastPerDay") {
      updated.varLinen = Number(value) || 0;
      updated.varCardBreakfastPerDay = Number(value) || 0;
    }
    if (field === "varUtilities" || field === "varUtilitiesPerDay") {
      updated.varUtilities = Number(value) || 0;
      updated.varUtilitiesPerDay = Number(value) || 0;
    }
    if (
      field === "fixedRent" ||
      field === "fixedOther" ||
      field === "fixedSalaries" ||
      field === "fixedCondoIptu" ||
      field === "fixedSystems" ||
      field === "fixedSystemsMaintenance"
    ) {
      updated.fixedCostsMonth = Math.round((
        Number(updated.fixedRent ?? 38506.61) +
        Number(updated.fixedOther ?? 400.0) +
        Number(updated.fixedSalaries ?? 0) +
        Number(updated.fixedCondoIptu ?? 0) +
        Number(updated.fixedSystems ?? updated.fixedSystemsMaintenance ?? 0)
      ) * 100) / 100;
    }
    setLocalSettings(updated);
    onUpdateSettings(updated);
  };

  const handleResetDefaults = () => {
    const defaults: PricingSettings = {
      totalUHs: 19,
      daysInMonth: 31,
      occupancyRate: 0.65,
      fixedRent: 38506.61,
      fixedOther: 400.00,
      fixedSalaries: 0,
      fixedCondoIptu: 0,
      fixedSystems: 0,
      fixedSystemsMaintenance: 0,
      fixedCostsMonth: 38906.61,
      varCleaning: 23.25,
      varCleaningPerDay: 23.25,
      varLinen: 15.51,
      varCardBreakfastPerDay: 15.51,
      varUtilities: 9.00,
      varUtilitiesPerDay: 9.00,
      channelCommissionPct: 0.15,
      targetMarginPct: 0.25,
      taxRatePct: 0.06,
      breakfastSurchargePerGuest: 25.00,
      extraBedFee: 60.00,
      variationLimitPct: 0.30,
      manualFloor: 189.09,
      weekendMarkupPct: 0.15,
      hasPlanCeiling: false,
      planCeilingCount: 12,
    };
    setLocalSettings(defaults);
    onUpdateSettings(defaults);
  };

  const breakfastSurcharge = Number(localSettings.breakfastSurchargePerGuest ?? 25);
  const extraBedFee = Number(localSettings.extraBedFee ?? 60);
  const baseRate = Number(calculation.tarifaMinima || 276.63);
  const custoPctNum = Math.round((calculation.percentuais?.custoPct ?? 0.54) * 100);
  const comissaoPctNum = Math.round((calculation.percentuais?.comissaoPct ?? 0.15) * 100);
  const margemPctNum = Math.round((calculation.percentuais?.margemPct ?? 0.25) * 100);
  const impostoPctNum = Math.round((calculation.percentuais?.impostoPct ?? 0.06) * 100);

  return (
    <div className="space-y-6">
      {/* 3-Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Card 1: Custo por UH Ocupada (Editável Inline) */}
        <Card className="border-border shadow-xs hover:shadow-sm transition-all">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  Custo por UH ocupada
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300">
                {Number(localSettings.totalUHs ?? 19)} flats
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Edite abaixo os custos fixos, variáveis e ocupação para recalcular em tempo real
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-sm">
            {/* Fixed costs sub-table (Editable) */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Custos Fixos Rateados (Editáveis)
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Arrendamento / Aluguel Mensal (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.fixedRent ?? 38506.61}
                  onChange={(e) => handleInputChange("fixedRent", Number(e.target.value) || 0)}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Folha de Pagamento / Equipe (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.fixedSalaries ?? 0}
                  onChange={(e) => handleInputChange("fixedSalaries", Number(e.target.value) || 0)}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Condomínio + IPTU Mensal (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.fixedCondoIptu ?? 0}
                  onChange={(e) => handleInputChange("fixedCondoIptu", Number(e.target.value) || 0)}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Sistemas, Internet & Manut. (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.fixedSystems ?? localSettings.fixedSystemsMaintenance ?? 0}
                  onChange={(e) => handleInputChange("fixedSystems", Number(e.target.value) || 0)}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Outros Custos Fixos Mensais (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.fixedOther ?? 400.00}
                  onChange={(e) => handleInputChange("fixedOther", Number(e.target.value) || 0)}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs">
                <span className="text-muted-foreground">Total Custos Fixos Mensais</span>
                <span className="font-semibold text-foreground">
                  R$ {Number(localSettings.fixedCostsMonth ?? 38906.61).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Ocupação média estimada (%)</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="1"
                    min="10"
                    max="100"
                    value={Math.round(Number(localSettings.occupancyRate ?? 0.65) * 100)}
                    onChange={(e) => {
                      const pct = Math.min(100, Math.max(5, Number(e.target.value) || 65));
                      handleInputChange("occupancyRate", pct / 100);
                    }}
                    className="w-16 h-7 text-xs font-bold text-right"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    ({Number(calculation.soldUnitsMonth ?? 382.85).toFixed(1)} diárias)
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs bg-muted/20 px-1 rounded">
                <span className="font-medium text-foreground">Custo fixo por diária vendida</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  R$ {Number(calculation.fixedCostPerSoldUnit ?? 101.62).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Variable costs sub-table (Editable) */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Custos Variáveis por Diária / UH (Editáveis)
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Limpeza e amenities (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.varCleaning ?? 23.25}
                  onChange={(e) => handleInputChange("varCleaning", Number(e.target.value) || 0)}
                  className="w-24 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Lavanderia / Enxoval (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.varLinen ?? 15.51}
                  onChange={(e) => handleInputChange("varLinen", Number(e.target.value) || 0)}
                  className="w-24 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Energia elétrica e água (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.varUtilities ?? 9.00}
                  onChange={(e) => handleInputChange("varUtilities", Number(e.target.value) || 0)}
                  className="w-24 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs bg-emerald-50/50 dark:bg-emerald-950/20 px-1 rounded text-emerald-800 dark:text-emerald-300">
                <span className="font-semibold">Subtotal variável por diária</span>
                <span className="font-bold">
                  R$ {Number(calculation.varCostPerUnit ?? 47.76).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Total UH Cost Highlight */}
            <div className="p-3 bg-emerald-600/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs uppercase font-bold text-emerald-900 dark:text-emerald-300 block">
                  Total Custo por UH Ocupada
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Fixo rateado (R$ {Number(calculation.fixedCostPerSoldUnit ?? 101.62).toFixed(2)}) + Variáveis (R$ {Number(calculation.varCostPerUnit ?? 47.76).toFixed(2)})
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                  R$ {Number(calculation.custoUH ?? 149.38).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1">
              <Info className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
              <span>
                <strong>Sem contagem dupla:</strong> A comissão do canal em R$ foi removida do custo e permanece unicamente como {comissaoPctNum}% na fórmula de marcação.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Fórmula e Tarifa Mínima com Barra 100% + Parâmetros Editáveis */}
        <Card className="border-border shadow-xs hover:shadow-sm transition-all border-emerald-500/30">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-bold text-foreground">
                  Fórmula de Marcação SEBRAE
                </CardTitle>
              </div>
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] gap-1">
                <CheckCircle2 className="w-3 h-3" />
                ✓ fecha 100%
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Tarifa mínima sustentável (piso) e parâmetros de margem, comissão e impostos
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Inline Markup Parameters (Comissão, Margem, Imposto, Piso, Trava) */}
            <div className="grid grid-cols-3 gap-2 p-2.5 bg-muted/25 rounded-xl border border-border/60">
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">
                  Comissão OTA (%)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={Math.round(Number(localSettings.channelCommissionPct ?? 0.15) * 1000) / 10}
                  onChange={(e) => handleInputChange("channelCommissionPct", (Number(e.target.value) || 0) / 100)}
                  className="h-7 text-xs font-bold mt-1 text-right"
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">
                  Margem Alvo (%)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="60"
                  value={Math.round(Number(localSettings.targetMarginPct ?? 0.25) * 1000) / 10}
                  onChange={(e) => handleInputChange("targetMarginPct", (Number(e.target.value) || 0) / 100)}
                  className="h-7 text-xs font-bold mt-1 text-right"
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">
                  Imposto ISS (%)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="30"
                  value={Math.round(Number(localSettings.taxRatePct ?? 0.06) * 1000) / 10}
                  onChange={(e) => handleInputChange("taxRatePct", (Number(e.target.value) || 0) / 100)}
                  className="h-7 text-xs font-bold mt-1 text-right"
                />
              </div>
            </div>

            {/* Formula Expression */}
            <div className="p-3 bg-muted/40 rounded-xl text-center space-y-1 border border-border/50">
              <div className="text-[11px] text-muted-foreground font-mono">
                Tarifa Mínima = Custo ÷ (1 − Comissão {comissaoPctNum}% − Margem {margemPctNum}% − Imposto {impostoPctNum}%)
              </div>
              <div className="text-xs font-semibold text-foreground font-mono">
                R$ {calculation.custoUH?.toFixed(2) || "149.38"} ÷ (1 − {(calculation.totalDeductionsPct ?? 0.46).toFixed(2)}) = R$ {calculation.custoUH?.toFixed(2) || "149.38"} ÷ {(calculation.divisor ?? 0.54).toFixed(2)}
              </div>
            </div>

            {/* Hero Price */}
            <div className="text-center py-2 bg-gradient-to-b from-emerald-500/10 to-transparent rounded-xl border border-emerald-500/20">
              <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                Tarifa mínima sustentável (25% margem)
              </span>
              <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                R$ {calculation.tarifaMinima?.toFixed(2) || "276.63"}
              </div>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                Break-Even Operacional (Margem 0%): <strong>R$ {(calculation.breakEvenFloor ?? 189.09).toFixed(2)}</strong>
              </span>
            </div>

            {/* Safety Locks Inline Inputs */}
            <div className="grid grid-cols-2 gap-2 p-2.5 bg-muted/25 rounded-xl border border-border/60">
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">
                  Piso Manual / Break-Even (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.manualFloor ?? 189.09}
                  onChange={(e) => handleInputChange("manualFloor", Number(e.target.value) || 0)}
                  className="h-7 text-xs font-bold mt-1 text-right"
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">
                  Trava Variação WBP (%)
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="5"
                  max="100"
                  value={Math.round(Number(localSettings.variationLimitPct ?? 0.30) * 100)}
                  onChange={(e) => handleInputChange("variationLimitPct", Math.max(0.05, (Number(e.target.value) || 30) / 100))}
                  className="h-7 text-xs font-bold mt-1 text-right"
                />
              </div>
            </div>

            {/* Stacked Composition Bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-muted-foreground">Composição da Diária:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  R$ {calculation.tarifaMinima?.toFixed(2) || "276.63"} (100%)
                </span>
              </div>

              {/* Progress bar with 4 colors */}
              <div className="w-full h-5 rounded-lg overflow-hidden flex shadow-inner border border-border/80">
                <div 
                  style={{ width: `${custoPctNum}%` }} 
                  className="bg-emerald-600 text-[10px] text-white flex items-center justify-center font-bold"
                  title={`Custo: R$ ${calculation.decomposicao?.custo?.toFixed(2)} (${custoPctNum}%)`}
                >
                  {custoPctNum}%
                </div>
                <div 
                  style={{ width: `${comissaoPctNum}%` }} 
                  className="bg-orange-500 text-[10px] text-white flex items-center justify-center font-bold"
                  title={`Comissão: R$ ${calculation.decomposicao?.comissao?.toFixed(2)} (${comissaoPctNum}%)`}
                >
                  {comissaoPctNum}%
                </div>
                <div 
                  style={{ width: `${margemPctNum}%` }} 
                  className="bg-teal-500 text-[10px] text-white flex items-center justify-center font-bold"
                  title={`Margem: R$ ${calculation.decomposicao?.margem?.toFixed(2)} (${margemPctNum}%)`}
                >
                  {margemPctNum}%
                </div>
                <div 
                  style={{ width: `${impostoPctNum}%` }} 
                  className="bg-sky-600 text-[10px] text-white flex items-center justify-center font-bold"
                  title={`Imposto: R$ ${calculation.decomposicao?.imposto?.toFixed(2)} (${impostoPctNum}%)`}
                >
                  {impostoPctNum}%
                </div>
              </div>

              {/* Legend with exact decomposed values */}
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                  <div className="truncate">
                    <span className="text-muted-foreground block text-[10px]">Custo UH ({custoPctNum}%)</span>
                    <strong className="text-foreground">R$ {calculation.decomposicao?.custo?.toFixed(2) || "149.38"}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                  <div className="truncate">
                    <span className="text-muted-foreground block text-[10px]">Comissão ({comissaoPctNum}%)</span>
                    <strong className="text-foreground">R$ {calculation.decomposicao?.comissao?.toFixed(2) || "41.49"}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
                  <div className="truncate">
                    <span className="text-muted-foreground block text-[10px]">Margem Lucro ({margemPctNum}%)</span>
                    <strong className="text-foreground">R$ {calculation.decomposicao?.margem?.toFixed(2) || "69.16"}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-600 shrink-0" />
                  <div className="truncate">
                    <span className="text-muted-foreground block text-[10px]">Imposto Simples ({impostoPctNum}%)</span>
                    <strong className="text-foreground">R$ {calculation.decomposicao?.imposto?.toFixed(2) || "16.60"}</strong>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Planos Publicados */}
        <Card className="border-border shadow-xs hover:shadow-sm transition-all">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <CardTitle className="text-base font-bold text-foreground">
                  Planos Publicados
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                2 Planos WBP
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Mapeamento de tarifas enviadas à Booking.com e Airbnb
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-sm">
            {/* Plano 1: Sem café */}
            <div className="p-3 bg-muted/30 border border-border/60 rounded-xl space-y-1">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  <span className="font-bold text-foreground text-sm">Sem café (Plano Base)</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">Padrão</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Tarifa direta calculada pelo motor SEBRAE para ocupação individual ou dupla.
              </p>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-xs text-muted-foreground">Piso tarifário:</span>
                <span className="font-bold text-foreground">R$ {baseRate.toFixed(2)}</span>
              </div>
            </div>

            {/* Plano 2: Com café */}
            <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300/60 dark:border-amber-800/60 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-foreground text-sm">Com café da manhã</span>
                </div>
                <Badge className="bg-amber-600 text-white text-[10px] hover:bg-amber-700">Adicional</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <Label htmlFor="breakfast-surcharge" className="text-xs text-muted-foreground">
                  Acréscimo café por hóspede/noite:
                </Label>
                <div className="flex items-center gap-1.5 w-28">
                  <span className="text-xs font-bold text-muted-foreground">R$</span>
                  <Input
                    id="breakfast-surcharge"
                    type="number"
                    step="1"
                    min="0"
                    value={breakfastSurcharge}
                    onChange={(e) => handleInputChange("breakfastSurchargePerGuest", Number(e.target.value) || 0)}
                    className="h-8 text-xs font-bold text-right"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <Label htmlFor="extra-bed-fee" className="text-xs text-muted-foreground">
                  Adicional 3º hóspede (cama extra):
                </Label>
                <div className="flex items-center gap-1.5 w-28">
                  <span className="text-xs font-bold text-muted-foreground">R$</span>
                  <Input
                    id="extra-bed-fee"
                    type="number"
                    step="1"
                    min="0"
                    value={extraBedFee}
                    onChange={(e) => handleInputChange("extraBedFee", Number(e.target.value) || 0)}
                    className="h-8 text-xs font-bold text-right"
                  />
                </div>
              </div>
              {/* Pricing breakdown by guest count */}
              <div className="pt-2 border-t border-border/40 space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>1 Hóspede (Com Café):</span>
                  <span className="font-medium text-foreground">R$ {(baseRate + breakfastSurcharge).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>2 Hóspedes (Com Café):</span>
                  <span className="font-medium text-foreground">R$ {(baseRate + breakfastSurcharge * 2).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>3 Hóspedes (+ Cama Extra R$ {extraBedFee.toFixed(0)}):</span>
                  <span className="font-medium text-foreground">R$ {(baseRate + breakfastSurcharge * 3 + extraBedFee).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Teto por plano (Persisted in settings) */}
            <div className="p-3 bg-muted/20 border border-border/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Teto por plano (opcional)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Limita o estoque máximo anunciado por plano
                  </p>
                </div>
                <Switch 
                  checked={Boolean(localSettings.hasPlanCeiling)} 
                  onCheckedChange={(val) => handleInputChange("hasPlanCeiling", val)} 
                />
              </div>
              {localSettings.hasPlanCeiling && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">Máximo de flats no plano:</span>
                  <Input
                    type="number"
                    min="1"
                    max="19"
                    value={localSettings.planCeilingCount ?? 12}
                    onChange={(e) => handleInputChange("planCeilingCount", Number(e.target.value) || 12)}
                    className="w-20 h-7 text-xs text-right font-bold"
                  />
                </div>
              )}
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={onSaveAndStage}
                disabled={isSaving}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 gap-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? "Salvando..." : "Salvar Parâmetros SEBRAE"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleResetDefaults}
                title="Restaurar padrões SEBRAE"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
