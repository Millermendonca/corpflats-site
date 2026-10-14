import React, { useState } from "react";
import { 
  Lock, 
  Send, 
  Trash2, 
  Check, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Layers,
  ArrowUpDown,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { PreviewRateItem, PreviewSummary } from "./types";

interface PublishPreviewTabProps {
  summary: PreviewSummary;
  onConfirmVariation: (itemId: string) => Promise<void>;
  onDiscardVariation: (itemId: string) => Promise<void>;
  onDiscardAll: () => Promise<void>;
  onPublish: () => Promise<void>;
  onRefresh: () => Promise<void>;
  isPublishing: boolean;
  isLoading: boolean;
}

export const PublishPreviewTab: React.FC<PublishPreviewTabProps> = ({
  summary,
  onConfirmVariation,
  onDiscardVariation,
  onDiscardAll,
  onPublish,
  onRefresh,
  isPublishing,
  isLoading,
}) => {
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  const handleConfirm = async (id: string) => {
    setActionInProgressId(id);
    try {
      await onConfirmVariation(id);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDiscard = async (id: string) => {
    setActionInProgressId(id);
    try {
      await onDiscardVariation(id);
    } finally {
      setActionInProgressId(null);
    }
  };

  const unconfirmedRetained = summary.retainedItems.filter(item => !item.confirmed);
  const hasUnconfirmedLocks = unconfirmedRetained.length > 0;

  return (
    <div className="space-y-6">
      {/* 4 KPI Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* KPI 1: Datas afetadas */}
        <div className="p-3.5 bg-card border border-border rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-medium block">
              Datas afetadas
            </span>
            <span className="text-2xl font-black text-foreground">
              {summary.affectedDatesCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-muted/60 text-muted-foreground flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Preços alterados */}
        <div className="p-3.5 bg-card border border-border rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-medium block">
              Preços alterados
            </span>
            <span className="text-2xl font-black text-foreground">
              {summary.alteredRatesCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center">
            <ArrowUpDown className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Retidos pela trava */}
        <div className={`p-3.5 border rounded-xl shadow-xs flex items-center justify-between transition-colors ${
          summary.retainedLockedCount > 0 
            ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60" 
            : "bg-card border-border"
        }`}>
          <div>
            <span className="text-xs text-muted-foreground font-medium block">
              Retidos pela trava
            </span>
            <span className={`text-2xl font-black ${
              summary.retainedLockedCount > 0 
                ? "text-amber-700 dark:text-amber-400" 
                : "text-foreground"
            }`}>
              {summary.retainedLockedCount}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            summary.retainedLockedCount > 0 
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" 
              : "bg-muted/60 text-muted-foreground"
          }`}>
            <Lock className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Abaixo do piso */}
        <div className="p-3.5 bg-card border border-border rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground font-medium block">
              Abaixo do piso
            </span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {summary.belowFloorCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Grid: Pending changes table on left, Retained variations card on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2 spans): Alterações Pendentes Table */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Alterações Pendentes de Envio
                </CardTitle>
                <CardDescription className="text-xs">
                  Comparativo data a data entre a tarifa atualmente no canal e a nova tarifa calculada
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 text-xs">
                      <TableHead className="w-28 font-bold">Data</TableHead>
                      <TableHead className="font-bold">Plano</TableHead>
                      <TableHead className="text-right font-bold">Atual</TableHead>
                      <TableHead className="text-right font-bold">Novo</TableHead>
                      <TableHead className="text-center font-bold">Variação</TableHead>
                      <TableHead className="text-right font-bold">Livres</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                          Nenhuma alteração pendente de publicação no momento. Todas as tarifas enviadas estão em sincronia.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.items.map((item) => {
                        const isLockedAndPending = item.isLocked && !item.confirmed;
                        return (
                          <TableRow 
                            key={item.id}
                            className={`text-xs transition-colors ${
                              isLockedAndPending 
                                ? "bg-amber-100/50 dark:bg-amber-950/25 border-l-4 border-l-amber-500" 
                                : item.confirmed
                                  ? "bg-emerald-50/30 dark:bg-emerald-950/20"
                                  : "hover:bg-muted/30"
                            }`}
                          >
                            <TableCell className="font-medium whitespace-nowrap">
                              {item.date}
                            </TableCell>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                                {item.planName}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              R$ {item.currentRate.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-foreground">
                              R$ {item.newRate.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              {isLockedAndPending ? (
                                <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-mono text-[11px] gap-1 px-1.5 py-0.5">
                                  +{Math.abs(item.variationPct)}%
                                  <Lock className="w-3 h-3" />
                                </Badge>
                              ) : item.confirmed ? (
                                <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-400 text-[10px] gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  Confirmado
                                </Badge>
                              ) : (
                                <span className={`font-mono text-[11px] ${
                                  item.variationPct > 0 
                                    ? "text-emerald-600 dark:text-emerald-400" 
                                    : item.variationPct < 0 
                                      ? "text-rose-600 dark:text-rose-400" 
                                      : "text-muted-foreground"
                                }`}>
                                  {item.variationPct > 0 ? `+${item.variationPct}%` : `${item.variationPct}%`}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-muted-foreground">
                              {item.freeUnits} UHs
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Retidos pela trava de variação (30%) Card */}
        <div className="space-y-4">
          <Card className="border-amber-300 dark:border-amber-700/60 shadow-xs bg-amber-50/20 dark:bg-amber-950/10">
            <CardHeader className="pb-3 border-b border-amber-200 dark:border-amber-800/40 bg-amber-500/10">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <CardTitle className="text-sm font-bold text-amber-950 dark:text-amber-200">
                  Retidos pela trava de variação (30%)
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Oscilações superiores ao limite configurado requerem autorização expressa do gestor.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {summary.retainedItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                  Nenhuma tarifa retida por variação excessiva. Todas dentro do teto seguro de 30%.
                </div>
              ) : (
                summary.retainedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-card border border-amber-300/80 dark:border-amber-700/80 rounded-xl space-y-2 shadow-2xs"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-xs text-foreground block">
                          {item.date} • {item.planName}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                          <span className="text-muted-foreground font-mono">
                            R$ {item.currentRate.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-bold font-mono text-foreground">
                            R$ {item.newRate.toFixed(2)}
                          </span>
                          <Badge className="bg-amber-500 text-white text-[10px] ml-1 px-1 py-0">
                            +{item.variationPct}%
                          </Badge>
                        </div>
                      </div>
                      {item.confirmed && (
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          Confirmado
                        </Badge>
                      )}
                    </div>

                    {!item.confirmed && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleConfirm(item.id)}
                          disabled={actionInProgressId === item.id}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDiscard(item.id)}
                          disabled={actionInProgressId === item.id}
                          className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs h-7 gap-1 border-rose-200"
                        >
                          <X className="w-3 h-3" />
                          Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-0 z-20 bg-card/95 backdrop-blur-md border border-border p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-sm text-foreground block">
              Pronto para Publicar na WebBookingPro
            </span>
            <p className="text-xs text-muted-foreground">
              {hasUnconfirmedLocks
                ? "⚠️ Existem tarifas retidas pela trava de 30% que requerem confirmação antes do envio."
                : `${summary.alteredRatesCount} alterações prontas para envio imediato às OTAs.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={onDiscardAll}
            disabled={isPublishing || summary.alteredRatesCount === 0}
            className="text-xs text-muted-foreground hover:text-destructive h-9 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Descartar tudo
          </Button>
          <Button
            onClick={onPublish}
            disabled={isPublishing || summary.alteredRatesCount === 0 || hasUnconfirmedLocks}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-5 gap-2 shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            {isPublishing 
              ? "Enviando à WBP..." 
              : `Publicar ${summary.alteredRatesCount} alterações na WebBookingPro`}
          </Button>
        </div>
      </div>
    </div>
  );
};
