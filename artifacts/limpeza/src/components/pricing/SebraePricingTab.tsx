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
  channelMarkups?: {
    booking?: { markupPct?: number };
    airbnb?: { markupPct?: number };
  };
  onUpdateSettings: (newSettings: Partial<PricingSettings>) => void;
  onSaveAndStage: () => Promise<void>;
  isSaving: boolean;
}

export const SebraePricingTab: React.FC<SebraePricingTabProps> = ({
  settings,
  calculation,
  channelMarkups,
  onUpdateSettings,
  onSaveAndStage,
  isSaving,
}) => {
  const [localSettings, setLocalSettings] = useState<PricingSettings>(settings);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});

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

  const getRawOrVal = (key: string, val: number | string) =>
    rawInputs[key] !== undefined ? rawInputs[key] : val;

  const handleRawNumberChange = (
    key: string,
    raw: string,
    applyValid: (num: number) => void
  ) => {
    setRawInputs((prev) => ({ ...prev, [key]: raw }));
    if (raw.trim() === "" || raw === "-") return;
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      applyValid(parsed);
    }
  };

  const handleRawBlur = (
    key: string,
    normalizeOnEmptyOrClamp: (raw: string | undefined) => void
  ) => {
    normalizeOnEmptyOrClamp(rawInputs[key]);
    setRawInputs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
      channelCommissionPct: 0.0,
      targetMarginPct: 0.25,
      taxRatePct: 0.06,
      breakfastSurchargePerGuest: 20.00,
      extraBedFee: 60.00,
      variationLimitPct: 0.30,
      manualFloor: 158.91,
      weekendMarkupPct: 0.15,
      hasPlanCeiling: false,
      planCeilingCount: 12,
    };
    setRawInputs({});
    setLocalSettings(defaults);
    onUpdateSettings(defaults);
  };

  const resolveOtaMarkupDec = (chCfg: any, fallback: number) => {
    if (!chCfg) return fallback;
    if (chCfg.extraMarkupPct !== undefined && chCfg.extraMarkupPct !== null) {
      return Number(chCfg.commissionPct ?? fallback) + Number(chCfg.extraMarkupPct ?? 0);
    }
    return Math.max(Number(chCfg.markupPct ?? 0), Number(chCfg.commissionPct ?? fallback));
  };

  const breakfastSurcharge = Number(localSettings.breakfastSurchargePerGuest ?? 20);
  const extraBedFee = Number(localSettings.extraBedFee ?? 60);
  const baseRate = Number(calculation.tarifaMinima || 216.49);
  const bookingMarkupDec = resolveOtaMarkupDec(channelMarkups?.booking, 0.15);
  const airbnbMarkupDec = resolveOtaMarkupDec(channelMarkups?.airbnb, 0.15);
  const bookingFactor = 1 + bookingMarkupDec;
  const airbnbFactor = 1 + airbnbMarkupDec;
  const custoPctNum = Math.round((calculation.percentuais?.custoPct ?? 0.69) * 100);
  const comissaoPctNum = Math.round((calculation.percentuais?.comissaoPct ?? 0.0) * 100);
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
                  value={getRawOrVal("fixedRent", localSettings.fixedRent ?? 38506.61)}
                  onChange={(e) => handleRawNumberChange("fixedRent", e.target.value, (n) => handleInputChange("fixedRent", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("fixedRent", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("fixedRent", 0); })}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Folha de Pagamento / Equipe (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={getRawOrVal("fixedSalaries", localSettings.fixedSalaries ?? 0)}
                  onChange={(e) => handleRawNumberChange("fixedSalaries", e.target.value, (n) => handleInputChange("fixedSalaries", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("fixedSalaries", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("fixedSalaries", 0); })}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Condomínio + IPTU Mensal (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={getRawOrVal("fixedCondoIptu", localSettings.fixedCondoIptu ?? 0)}
                  onChange={(e) => handleRawNumberChange("fixedCondoIptu", e.target.value, (n) => handleInputChange("fixedCondoIptu", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("fixedCondoIptu", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("fixedCondoIptu", 0); })}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Sistemas, Internet & Manut. (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={getRawOrVal("fixedSystems", localSettings.fixedSystems ?? localSettings.fixedSystemsMaintenance ?? 0)}
                  onChange={(e) => handleRawNumberChange("fixedSystems", e.target.value, (n) => handleInputChange("fixedSystems", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("fixedSystems", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("fixedSystems", 0); })}
                  className="w-28 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Outros Custos Fixos Mensais (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={getRawOrVal("fixedOther", localSettings.fixedOther ?? 400.00)}
                  onChange={(e) => handleRawNumberChange("fixedOther", e.target.value, (n) => handleInputChange("fixedOther", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("fixedOther", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("fixedOther", 0); })}
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
                    min="5"
                    max="100"
                    value={getRawOrVal("occupancyRate", Math.round(Number(localSettings.occupancyRate ?? 0.65) * 100))}
                    onChange={(e) => {
                      handleRawNumberChange("occupancyRate", e.target.value, (n) => {
                        const safePreviewPct = Math.min(100, Math.max(1, n));
                        handleInputChange("occupancyRate", safePreviewPct / 100);
                      });
                    }}
                    onBlur={() =>
                      handleRawBlur("occupancyRate", (r) => {
                        const parsed = r !== undefined && r.trim() !== "" ? Number(r) : 65;
                        const clamped = Number.isNaN(parsed) ? 65 : Math.min(100, Math.max(5, parsed));
                        handleInputChange("occupancyRate", clamped / 100);
                      })
                    }
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
                  value={getRawOrVal("varCleaning", localSettings.varCleaning ?? 23.25)}
                  onChange={(e) => handleRawNumberChange("varCleaning", e.target.value, (n) => handleInputChange("varCleaning", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("varCleaning", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("varCleaning", 0); })}
                  className="w-24 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Lavanderia / Enxoval (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={getRawOrVal("varLinen", localSettings.varLinen ?? 15.51)}
                  onChange={(e) => handleRawNumberChange("varLinen", e.target.value, (n) => handleInputChange("varLinen", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("varLinen", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("varLinen", 0); })}
                  className="w-24 h-7 text-xs font-bold text-right"
                />
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-xs gap-2">
                <span className="text-muted-foreground">Energia elétrica e água (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={getRawOrVal("varUtilities", localSettings.varUtilities ?? 9.00)}
                  onChange={(e) => handleRawNumberChange("varUtilities", e.target.value, (n) => handleInputChange("varUtilities", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("varUtilities", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("varUtilities", 0); })}
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
                  Taxa Base Direta (%)
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={getRawOrVal("channelCommissionPct", Math.round(Number(localSettings.channelCommissionPct ?? 0) * 1000) / 10)}
                  onChange={(e) => handleRawNumberChange("channelCommissionPct", e.target.value, (n) => handleInputChange("channelCommissionPct", Math.min(50, Math.max(0, n)) / 100))}
                  onBlur={() => handleRawBlur("channelCommissionPct", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("channelCommissionPct", 0); })}
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
                  value={getRawOrVal("targetMarginPct", Math.round(Number(localSettings.targetMarginPct ?? 0.25) * 1000) / 10)}
                  onChange={(e) => handleRawNumberChange("targetMarginPct", e.target.value, (n) => handleInputChange("targetMarginPct", Math.min(60, Math.max(0, n)) / 100))}
                  onBlur={() => handleRawBlur("targetMarginPct", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("targetMarginPct", 0); })}
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
                  value={getRawOrVal("taxRatePct", Math.round(Number(localSettings.taxRatePct ?? 0.06) * 1000) / 10)}
                  onChange={(e) => handleRawNumberChange("taxRatePct", e.target.value, (n) => handleInputChange("taxRatePct", Math.min(30, Math.max(0, n)) / 100))}
                  onBlur={() => handleRawBlur("taxRatePct", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("taxRatePct", 0); })}
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
                  value={getRawOrVal("manualFloor", localSettings.manualFloor ?? 189.09)}
                  onChange={(e) => handleRawNumberChange("manualFloor", e.target.value, (n) => handleInputChange("manualFloor", Math.max(0, n)))}
                  onBlur={() => handleRawBlur("manualFloor", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("manualFloor", 0); })}
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
                  value={getRawOrVal("variationLimitPct", Math.round(Number(localSettings.variationLimitPct ?? 0.30) * 100))}
                  onChange={(e) =>
                    handleRawNumberChange("variationLimitPct", e.target.value, (n) =>
                      handleInputChange("variationLimitPct", Math.min(100, Math.max(1, n)) / 100)
                    )
                  }
                  onBlur={() =>
                    handleRawBlur("variationLimitPct", (r) => {
                      const parsed = r !== undefined && r.trim() !== "" ? Number(r) : 30;
                      const clamped = Number.isNaN(parsed) ? 30 : Math.min(100, Math.max(5, parsed));
                      handleInputChange("variationLimitPct", clamped / 100);
                    })
                  }
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
                  Valor interno café por hóspede/noite:
                </Label>
                <div className="flex items-center gap-1.5 w-28">
                  <span className="text-xs font-bold text-muted-foreground">R$</span>
                  <Input
                    id="breakfast-surcharge"
                    type="number"
                    step="1"
                    min="0"
                    value={getRawOrVal("breakfastSurchargePerGuest", breakfastSurcharge)}
                    onChange={(e) => handleRawNumberChange("breakfastSurchargePerGuest", e.target.value, (n) => handleInputChange("breakfastSurchargePerGuest", Math.max(0, n)))}
                    onBlur={() => handleRawBlur("breakfastSurchargePerGuest", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("breakfastSurchargePerGuest", 0); })}
                    className="h-8 text-xs font-bold text-right"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Soma +1x para 1 hóspede e +2x para 2 hóspedes (exibido ao cliente como tarifa de ocupação, sem item avulso). Sincroniza com Site, Booking e Airbnb.
              </p>
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
                    value={getRawOrVal("extraBedFee", extraBedFee)}
                    onChange={(e) => handleRawNumberChange("extraBedFee", e.target.value, (n) => handleInputChange("extraBedFee", Math.max(0, n)))}
                    onBlur={() => handleRawBlur("extraBedFee", (r) => { if (r !== undefined && r.trim() === "") handleInputChange("extraBedFee", 0); })}
                    className="h-8 text-xs font-bold text-right"
                  />
                </div>
              </div>
              {/* Pricing breakdown by guest count + OTA sync */}
              <div className="pt-2 border-t border-border/40 space-y-1.5 text-xs">
                <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-muted-foreground pb-0.5">
                  <span>Ocupação</span>
                  <span className="text-right">Direto (PIX)</span>
                  <span className="text-right">Booking ({bookingMarkupDec >= 0 ? `+${Math.round(bookingMarkupDec * 100)}%` : `${Math.round(bookingMarkupDec * 100)}%`})</span>
                  <span className="text-right">Airbnb ({airbnbMarkupDec >= 0 ? `+${Math.round(airbnbMarkupDec * 100)}%` : `${Math.round(airbnbMarkupDec * 100)}%`})</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
                  <span>Sem Café (1-2p)</span>
                  <span className="text-right font-medium text-foreground">R$ {baseRate.toFixed(2)}</span>
                  <span className="text-right font-medium text-sky-700 dark:text-sky-400">R$ {(baseRate * bookingFactor).toFixed(2)}</span>
                  <span className="text-right font-medium text-rose-700 dark:text-rose-400">R$ {(baseRate * airbnbFactor).toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
                  <span>Com Café (1p)</span>
                  <span className="text-right font-medium text-foreground">R$ {(baseRate + breakfastSurcharge).toFixed(2)}</span>
                  <span className="text-right font-medium text-sky-700 dark:text-sky-400">R$ {((baseRate + breakfastSurcharge) * bookingFactor).toFixed(2)}</span>
                  <span className="text-right font-medium text-rose-700 dark:text-rose-400">R$ {((baseRate + breakfastSurcharge) * airbnbFactor).toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
                  <span>Com Café (2p)</span>
                  <span className="text-right font-semibold text-amber-800 dark:text-amber-300">R$ {(baseRate + breakfastSurcharge * 2).toFixed(2)}</span>
                  <span className="text-right font-semibold text-sky-700 dark:text-sky-400">R$ {((baseRate + breakfastSurcharge * 2) * bookingFactor).toFixed(2)}</span>
                  <span className="text-right font-semibold text-rose-700 dark:text-rose-400">R$ {((baseRate + breakfastSurcharge * 2) * airbnbFactor).toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground">
                  <span>Com Café (3p)</span>
                  <span className="text-right font-medium text-foreground">R$ {(baseRate + breakfastSurcharge * 3 + extraBedFee).toFixed(2)}</span>
                  <span className="text-right font-medium text-sky-700 dark:text-sky-400">R$ {((baseRate + breakfastSurcharge * 3 + extraBedFee) * bookingFactor).toFixed(2)}</span>
                  <span className="text-right font-medium text-rose-700 dark:text-rose-400">R$ {((baseRate + breakfastSurcharge * 3 + extraBedFee) * airbnbFactor).toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10.5px] text-muted-foreground pt-1 border-t border-border/30">
                  <span>Café / hósp.</span>
                  <span className="text-right font-medium text-foreground">R$ {breakfastSurcharge.toFixed(2)}</span>
                  <span className="text-right font-medium text-sky-700 dark:text-sky-400">R$ {(breakfastSurcharge * bookingFactor).toFixed(2)}</span>
                  <span className="text-right font-medium text-rose-700 dark:text-rose-400">R$ {(breakfastSurcharge * airbnbFactor).toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10.5px] text-muted-foreground">
                  <span>3º Hósp. Extra</span>
                  <span className="text-right font-medium text-foreground">R$ {extraBedFee.toFixed(2)}</span>
                  <span className="text-right font-medium text-sky-700 dark:text-sky-400">R$ {(extraBedFee * bookingFactor).toFixed(2)}</span>
                  <span className="text-right font-medium text-rose-700 dark:text-rose-400">R$ {(extraBedFee * airbnbFactor).toFixed(2)}</span>
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
                    value={getRawOrVal("planCeilingCount", localSettings.planCeilingCount ?? 12)}
                    onChange={(e) => handleRawNumberChange("planCeilingCount", e.target.value, (n) => handleInputChange("planCeilingCount", Math.min(19, Math.max(1, Math.round(n)))))}
                    onBlur={() =>
                      handleRawBlur("planCeilingCount", (r) => {
                        const parsed = r !== undefined && r.trim() !== "" ? Number(r) : 12;
                        const clamped = Number.isNaN(parsed) ? 12 : Math.min(19, Math.max(1, Math.round(parsed)));
                        handleInputChange("planCeilingCount", clamped);
                      })
                    }
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
                {isSaving ? "Salvando e Sincronizando..." : "Salvar & Sincronizar (Site + OTAs)"}
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
