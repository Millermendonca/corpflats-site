import React from "react";
import { Building, DollarSign, TrendingUp, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PricingSettings, SebraeCalculationResult } from "./types";

interface CostsTabProps {
  settings: PricingSettings;
  calculation: SebraeCalculationResult;
}

export const CostsTab: React.FC<CostsTabProps> = ({ settings, calculation }) => {
  const occupancyLevels = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fixed Costs Breakdown */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-indigo-600" />
              <CardTitle className="text-base font-bold text-foreground">
                Composição de Custos Fixos Mensais
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Valores reais da operação CorpFlats Soho Residence (19 flats)
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div className="flex justify-between items-center py-1.5 border-b border-border/40 text-xs">
              <span className="text-muted-foreground">Locação / Arrendamento dos Flats</span>
              <span className="font-semibold text-foreground">R$ 38.506,61</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-border/40 text-xs">
              <span className="text-muted-foreground">Outros Custos Fixos Operacionais</span>
              <span className="font-semibold text-foreground">R$ 400,00</span>
            </div>
            <div className="flex justify-between items-center py-2 bg-muted/30 px-3 rounded-lg text-xs">
              <span className="font-bold text-foreground">Total de Custos Fixos Mensais:</span>
              <span className="font-black text-foreground">
                R$ {Number(settings.fixedCostsMonth ?? 38906.61).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="p-3 bg-muted/20 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Diárias disponíveis no mês (19 flats × 31 dias):</span>
                <span className="font-mono font-bold text-foreground">589 diárias</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Custo fixo por diária disponível (100% ocupação):</span>
                <span className="font-mono font-bold text-foreground">
                  R$ {Number(calculation.fixedCostPerAvailableUnit ?? 66.06).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-800 dark:text-emerald-300 font-semibold pt-1 border-t border-border/40">
                <span>Custo fixo na ocupação real (65% = 382,9 diárias):</span>
                <span className="font-mono font-black">
                  R$ {Number(calculation.fixedCostPerSoldUnit ?? 101.62).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Variable Costs Breakdown */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base font-bold text-foreground">
                Custos Variáveis por Diária Vendida
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Gastos incorridos exclusivamente quando a UH é ocupada
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div className="flex justify-between items-center py-1.5 border-b border-border/40 text-xs">
              <span className="text-muted-foreground">Limpeza e amenities descartáveis</span>
              <span className="font-semibold text-foreground">R$ {Number(settings.varCleaning ?? 23.25).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-border/40 text-xs">
              <span className="text-muted-foreground">Lavanderia industrial e enxoval</span>
              <span className="font-semibold text-foreground">R$ {Number(settings.varLinen ?? 15.51).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-border/40 text-xs">
              <span className="text-muted-foreground">Energia elétrica e água consumida</span>
              <span className="font-semibold text-foreground">R$ {Number(settings.varUtilities ?? 9.00).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-2 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 rounded-lg text-xs">
              <span className="font-bold text-emerald-900 dark:text-emerald-200">Total Variável por UH:</span>
              <span className="font-black text-emerald-700 dark:text-emerald-400">
                R$ {Number(calculation.varCostPerUnit ?? 47.76).toFixed(2)}
              </span>
            </div>

            <div className="p-3 bg-muted/20 rounded-xl space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Info className="w-4 h-4 text-sky-600 shrink-0" />
                <span>
                  <strong>Aviso de Auditoria SEBRAE:</strong> A comissão por diária em R$ (R$ 28,50) foi desativada permanentemente para evitar duplicidade com a taxa de 15% das OTAs.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sensitivity Analysis Table */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold text-foreground">
              Tabela de Sensibilidade à Ocupação
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Impacto da oscilação da taxa de ocupação sobre o custo da UH e a tarifa mínima recomendada
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 font-bold">Ocupação</th>
                  <th className="text-right py-2 font-bold">Diárias Vendidas</th>
                  <th className="text-right py-2 font-bold">Fixo / Diária</th>
                  <th className="text-right py-2 font-bold">Custo Total UH</th>
                  <th className="text-right py-2 font-bold text-emerald-700 dark:text-emerald-400">Tarifa Mínima Piso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {occupancyLevels.map((occ) => {
                  const totalUHs = Number(settings.totalUHs ?? 19) || 19;
                  const days = Number(settings.daysInMonth ?? 31) || 31;
                  const fixed = Number(settings.fixedCostsMonth ?? 38906.61) || 38906.61;
                  const varUnit = Number(calculation.varCostPerUnit ?? 47.76) || 47.76;
                  const divisor = Number(calculation.divisor ?? 0.54) || 0.54;
                  const sold = totalUHs * days * occ;
                  const fixoUnit = fixed / sold;
                  const custoUH = fixoUnit + varUnit;
                  const tarifaMin = custoUH / divisor;
                  const isCurrent = Math.abs(occ - Number(settings.occupancyRate ?? 0.65)) < 0.005;
                  return (
                    <tr 
                      key={occ} 
                      className={`hover:bg-muted/30 transition-colors ${
                        isCurrent ? "bg-emerald-50/50 dark:bg-emerald-950/20 font-bold" : ""
                      }`}
                    >
                      <td className="py-2.5 text-left font-sans flex items-center gap-2">
                        {(occ * 100).toFixed(0)}%
                        {isCurrent && (
                          <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-sans">
                            Atual
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">{sold.toFixed(1)}</td>
                      <td className="py-2.5 text-right">R$ {fixoUnit.toFixed(2)}</td>
                      <td className="py-2.5 text-right">R$ {custoUH.toFixed(2)}</td>
                      <td className="py-2.5 text-right text-emerald-700 dark:text-emerald-400 font-bold">
                        R$ {tarifaMin.toFixed(2)}
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
