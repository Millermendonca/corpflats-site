import React from "react";
import { BarChart3, TrendingUp, PieChart, DollarSign, Award, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SebraeCalculationResult } from "./types";

interface AnalyticsTabProps {
  calculation: SebraeCalculationResult;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ calculation }) => {
  const totalUHs = Number(calculation.totalUHs || 19);
  const occRate = Number(calculation.occupancyRate || 0.65);
  const totalRoomNightsYear = totalUHs * 365 * occRate;
  const avgRate = Number(calculation.tarifaMinima || 276.63);
  const commPct = Number(calculation.percentuais?.comissaoPct ?? 0.15);
  const taxPct = Number(calculation.percentuais?.impostoPct ?? 0.06);
  const marginPct = Number(calculation.percentuais?.margemPct ?? 0.25);
  const custoPct = Number(calculation.percentuais?.custoPct ?? 0.54);
  const netRatio = Math.max(0.01, 1 - commPct - taxPct);

  const grossRevenueYear = totalRoomNightsYear * avgRate;
  const totalCostYear = totalRoomNightsYear * Number(calculation.custoUH || 149.38);
  const fixedYear = Number(calculation.fixedCostsMonth || 38906.61) * 12;
  const varYear = totalRoomNightsYear * Number(calculation.varCostPerUnit || 47.76);
  const totalCommissionYear = grossRevenueYear * commPct;
  const totalTaxesYear = grossRevenueYear * taxPct;
  const totalNetMarginYear = grossRevenueYear - totalCostYear - totalCommissionYear - totalTaxesYear;

  // RevPAR = Occupancy * Average Daily Rate (ADR)
  const revparGross = avgRate * occRate;
  const revparNet = (avgRate * Number(calculation.divisor || 0.54)) * occRate;

  return (
    <div className="space-y-6">
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Receita Bruta Projetada / Ano
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-black text-foreground">
              R$ {grossRevenueYear.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Baseada em {totalRoomNightsYear.toFixed(0)} diárias a R$ {avgRate.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Custos Operacionais Anuais
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              R$ {totalCostYear.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Fixos (R$ {(fixedYear / 1000).toFixed(0)}k) + Variáveis (R$ {(varYear / 1000).toFixed(0)}k)
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Lucro Líquido Projetado ({Math.round(marginPct * 100)}%)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              R$ {totalNetMarginYear.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Margem livre após comissões ({Math.round(commPct * 100)}%) e Simples ({Math.round(taxPct * 100)}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              RevPAR Líquido Médio
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
              R$ {revparNet.toFixed(2)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              RevPAR Bruto: R$ {revparGross.toFixed(2)} / dia
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Mix de Canais & DRE Resumido */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Mix & Net Indicators */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              <CardTitle className="text-base font-bold text-foreground">
                Indicadores e Mix por Canal
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Distribuição ideal de vendas para maximização do RevPAR Líquido
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Direct */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-foreground">Site Direto (CorpFlats)</span>
                  <span className="font-mono font-bold text-emerald-600">
                    40% do mix • RevPAR Liq: R$ {(avgRate * (1 - taxPct) * occRate).toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
                  <div style={{ width: "40%" }} className="bg-emerald-600" />
                </div>
              </div>

              {/* Booking.com */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-foreground">Booking.com</span>
                  <span className="font-mono font-bold text-sky-600">
                    45% do mix • RevPAR Liq: R$ {(avgRate * (1 - commPct - taxPct) * occRate).toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
                  <div style={{ width: "45%" }} className="bg-sky-600" />
                </div>
              </div>

              {/* Airbnb */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-foreground">Airbnb</span>
                  <span className="font-mono font-bold text-rose-500">
                    15% do mix • RevPAR Liq: R$ {(avgRate * (1 - Math.max(commPct, 0.15) - taxPct) * occRate).toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
                  <div style={{ width: "15%" }} className="bg-rose-500" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DRE Resumido */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base font-bold text-foreground">
                Demonstrativo de Resultado (DRE SEBRAE Anual)
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Demonstração contábil estimada com base nas tarifas publicadas
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 text-xs font-mono space-y-2">
            <div className="flex justify-between py-1 border-b border-border/40 font-bold">
              <span>(=) Receita Operacional Bruta (100%)</span>
              <span>R$ {grossRevenueYear.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40 text-rose-600">
              <span>(-) Comissões das OTAs ({Math.round(commPct * 100)}%)</span>
              <span>- R$ {totalCommissionYear.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40 text-rose-600">
              <span>(-) Impostos s/ Faturamento ({Math.round(taxPct * 100)}%)</span>
              <span>- R$ {totalTaxesYear.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40 font-semibold text-foreground">
              <span>(=) Receita Operacional Líquida ({Math.round(netRatio * 100)}%)</span>
              <span>R$ {(grossRevenueYear - totalCommissionYear - totalTaxesYear).toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40 text-rose-600">
              <span>(-) Custos Totais da UH ({Math.round(custoPct * 100)}%)</span>
              <span>- R$ {totalCostYear.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 bg-emerald-500/10 px-2 rounded-lg font-black text-emerald-700 dark:text-emerald-400 text-sm">
              <span>(=) Lucro Operacional Líquido ({Math.round(marginPct * 100)}%)</span>
              <span>R$ {totalNetMarginYear.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
