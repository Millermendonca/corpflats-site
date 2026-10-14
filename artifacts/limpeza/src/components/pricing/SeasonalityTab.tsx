import React, { useState } from "react";
import { Calendar, TrendingUp, Sun, Snowflake, Flame, Sliders } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PricingSettings, SeasonalityMonth } from "./types";

interface SeasonalityTabProps {
  settings: PricingSettings;
  baseRate: number;
}

const DEFAULT_MONTHS: SeasonalityMonth[] = [
  { month: 0, label: "Janeiro", occupancyRate: 0.78, season: "Alta", factor: 1.15, isManualOverride: false },
  { month: 1, label: "Fevereiro", occupancyRate: 0.68, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 2, label: "Março", occupancyRate: 0.65, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 3, label: "Abril", occupancyRate: 0.52, season: "Baixa", factor: 0.90, isManualOverride: false },
  { month: 4, label: "Maio", occupancyRate: 0.50, season: "Baixa", factor: 0.90, isManualOverride: false },
  { month: 5, label: "Junho", occupancyRate: 0.66, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 6, label: "Julho", occupancyRate: 0.81, season: "Alta", factor: 1.15, isManualOverride: false },
  { month: 7, label: "Agosto", occupancyRate: 0.64, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 8, label: "Setembro", occupancyRate: 0.63, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 9, label: "Outubro", occupancyRate: 0.67, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 10, label: "Novembro", occupancyRate: 0.69, season: "Média", factor: 1.00, isManualOverride: false },
  { month: 11, label: "Dezembro", occupancyRate: 0.83, season: "Alta", factor: 1.15, isManualOverride: false },
];

export const SeasonalityTab: React.FC<SeasonalityTabProps> = ({ settings, baseRate }) => {
  const [months, setMonths] = useState<SeasonalityMonth[]>(DEFAULT_MONTHS);
  const [weekendMarkup, setWeekendMarkup] = useState<number>(settings.weekendMarkupPct * 100 || 15);

  const handleFactorChange = (index: number, newFactor: number) => {
    setMonths(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        factor: newFactor,
        isManualOverride: true,
        season: newFactor > 1.05 ? "Alta" : newFactor < 0.95 ? "Baixa" : "Média",
      };
      return copy;
    });
  };

  const getSeasonBadge = (season: string) => {
    if (season === "Alta") {
      return (
        <Badge className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] gap-1">
          <Flame className="w-3 h-3" /> Alta (+15%)
        </Badge>
      );
    }
    if (season === "Baixa") {
      return (
        <Badge variant="outline" className="text-sky-600 border-sky-300 dark:border-sky-800 text-[10px] gap-1">
          <Snowflake className="w-3 h-3" /> Baixa (-10%)
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-muted-foreground text-[10px] gap-1">
        <Sun className="w-3 h-3" /> Média (1,00)
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Controls: Weekend Markup & Rules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-foreground">
              Acréscimo de Fim de Semana
            </CardTitle>
            <CardDescription className="text-xs">
              Sextas e sábados com markup configurável
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="50"
                value={weekendMarkup}
                onChange={(e) => setWeekendMarkup(Number(e.target.value) || 0)}
                className="w-24 text-xs font-bold text-right"
              />
              <span className="text-xs font-semibold text-muted-foreground">%</span>
              <span className="text-xs text-muted-foreground ml-auto">
                = R$ {(baseRate * (1 + weekendMarkup / 100)).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-foreground">
              Regra de Alta Temporada
            </CardTitle>
            <CardDescription className="text-xs">
              Ativação por histórico de ocupação
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-xs text-muted-foreground">
            Ocupação histórica <strong>≥ 75%</strong> aciona automaticamente o fator de <strong>+15%</strong> (Janeiro, Julho, Dezembro).
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-foreground">
              Regra de Baixa Temporada
            </CardTitle>
            <CardDescription className="text-xs">
              Sensibilidade e estímulo de demanda
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-xs text-muted-foreground">
            Ocupação histórica <strong>&lt; 55%</strong> aplica desconto de <strong>-10%</strong> (Abril, Maio) respeitando sempre o piso mínimo.
          </CardContent>
        </Card>
      </div>

      {/* 12 Months Seasonality Table */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold text-foreground">
              Curva Anual de Sazonalidade (12 Meses)
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Fatores aplicados sobre a tarifa mínima básica (R$ {baseRate.toFixed(2)})
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-muted-foreground">
                  <th className="text-left py-2.5 px-4 font-bold">Mês</th>
                  <th className="text-center py-2.5 px-3 font-bold">Ocupação Histórica</th>
                  <th className="text-center py-2.5 px-3 font-bold">Classificação</th>
                  <th className="text-center py-2.5 px-3 font-bold">Fator Multiplicador</th>
                  <th className="text-right py-2.5 px-3 font-bold">Tarifa Base Mês</th>
                  <th className="text-right py-2.5 px-4 font-bold">Fim de Semana (+{weekendMarkup}%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {months.map((m, idx) => {
                  const monthBaseRate = Math.max(baseRate, baseRate * m.factor);
                  const monthWeekendRate = monthBaseRate * (1 + weekendMarkup / 100);
                  return (
                    <tr key={m.month} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-4 text-left font-sans font-bold text-foreground">
                        {m.label}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {(m.occupancyRate * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {getSeasonBadge(m.season)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <Input
                            type="number"
                            step="0.05"
                            min="0.5"
                            max="2.0"
                            value={m.factor}
                            onChange={(e) => handleFactorChange(idx, Number(e.target.value) || 1)}
                            className="w-16 h-7 text-xs text-center font-bold"
                          />
                          {m.isManualOverride && (
                            <span className="text-[10px] text-amber-600" title="Override manual">
                              *
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-foreground">
                        R$ {monthBaseRate.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        R$ {monthWeekendRate.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
