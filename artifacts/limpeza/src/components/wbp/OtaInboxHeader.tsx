import React, { useState } from "react";
import { 
  Globe, 
  Activity, 
  RefreshCw, 
  Send, 
  Radio, 
  CheckCircle2, 
  Eye, 
  PowerOff,
  Sparkles,
  Zap,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { WbpIntegrationMode, WbpTelemetryHealth } from "./types";

interface OtaInboxHeaderProps {
  telemetry: WbpTelemetryHealth;
  onChangeMode: (newMode: WbpIntegrationMode) => Promise<void>;
  onPollNow: () => Promise<void>;
  onSyncAriNow: () => Promise<void>;
  isPolling: boolean;
  isSyncingAri: boolean;
}

export const OtaInboxHeader: React.FC<OtaInboxHeaderProps> = ({
  telemetry,
  onChangeMode,
  onPollNow,
  onSyncAriNow,
  isPolling,
  isSyncingAri,
}) => {
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<WbpIntegrationMode>(telemetry.mode);
  const [isSavingMode, setIsSavingMode] = useState(false);

  const handleSaveMode = async () => {
    setIsSavingMode(true);
    try {
      await onChangeMode(selectedMode);
      setIsModeDialogOpen(false);
    } finally {
      setIsSavingMode(false);
    }
  };

  const getModePill = () => {
    if (telemetry.mode === "auto") {
      return (
        <button
          onClick={() => { setSelectedMode("auto"); setIsModeDialogOpen(true); }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors shadow-2xs cursor-pointer"
          title="Clique para alterar o modo de operação"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>WebBookingPro • Modo: Automático</span>
          <Settings className="w-3 h-3 opacity-60 ml-0.5" />
        </button>
      );
    }
    if (telemetry.mode === "observe") {
      return (
        <button
          onClick={() => { setSelectedMode("observe"); setIsModeDialogOpen(true); }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors shadow-2xs cursor-pointer"
          title="Clique para alterar o modo de operação"
        >
          <Eye className="w-3 h-3 text-amber-600" />
          <span>WebBookingPro • Modo: Somente observar</span>
          <Settings className="w-3 h-3 opacity-60 ml-0.5" />
        </button>
      );
    }
    return (
      <button
        onClick={() => { setSelectedMode("off"); setIsModeDialogOpen(true); }}
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors shadow-2xs cursor-pointer"
        title="Clique para alterar o modo de operação"
      >
        <PowerOff className="w-3 h-3" />
        <span>WebBookingPro • Modo: Desligado</span>
        <Settings className="w-3 h-3 opacity-60 ml-0.5" />
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        {/* Title & Mode Pill */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              Caixa de Entrada OTA
            </h1>
            {getModePill()}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Ingestão automática, conciliação e quarentena de reservas Booking.com e Airbnb
          </p>
        </div>

        {/* Telemetry Status & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Polling & ARI Telemetry pills */}
          <div className="flex items-center gap-2 text-xs bg-muted/30 px-3 py-1.5 rounded-xl border border-border/60">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Último polling: <strong className="text-foreground">há {telemetry.lastPollingMinutesAgo} min</strong>
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Último ARI: <strong className="text-foreground">há {telemetry.lastAriSyncSecondsAgo} s</strong>
            </span>
          </div>

          {/* Action: Poll now */}
          <Button
            variant="outline"
            size="sm"
            onClick={onPollNow}
            disabled={isPolling || telemetry.mode === "off"}
            className="h-8 text-xs gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? "animate-spin" : ""}`} />
            {isPolling ? "Consultando..." : "Consultar OTAs"}
          </Button>

          {/* Action: Sync ARI */}
          <Button
            size="sm"
            onClick={onSyncAriNow}
            disabled={isSyncingAri || telemetry.mode === "off"}
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs"
          >
            <Zap className={`w-3.5 h-3.5 ${isSyncingAri ? "animate-spin" : ""}`} />
            {isSyncingAri ? "Sincronizando..." : "Sincronizar ARI"}
          </Button>
        </div>
      </div>

      {/* Mode Change Modal */}
      <Dialog open={isModeDialogOpen} onOpenChange={setIsModeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Modo Operacional da WebBookingPro
            </DialogTitle>
            <DialogDescription className="text-xs">
              Alterne o comportamento de processamento das reservas recebidas das OTAs.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <RadioGroup
              value={selectedMode}
              onValueChange={(val: any) => setSelectedMode(val)}
              className="space-y-3"
            >
              {/* Option 1: Desligado */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 cursor-pointer">
                <RadioGroupItem value="off" id="mode-off" className="mt-0.5" />
                <Label htmlFor="mode-off" className="cursor-pointer text-xs space-y-0.5">
                  <span className="font-bold text-foreground block">Desligado (off)</span>
                  <span className="text-muted-foreground block text-[11px]">
                    Nenhuma chamada de saída, nenhum envio de ARI e callbacks respondem como não habilitado. Zero impacto.
                  </span>
                </Label>
              </div>

              {/* Option 2: Somente Observar */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/50 cursor-pointer">
                <RadioGroupItem value="observe" id="mode-observe" className="mt-0.5" />
                <Label htmlFor="mode-observe" className="cursor-pointer text-xs space-y-0.5">
                  <span className="font-bold text-amber-950 dark:text-amber-200 block">Somente Observar (observe)</span>
                  <span className="text-amber-800/80 dark:text-amber-300/80 block text-[11px]">
                    Recebe e grava payloads de forma durável e exibe na Caixa de Entrada, mas NÃO cria reservas reais e NÃO dispara WhatsApp/e-mail.
                  </span>
                </Label>
              </div>

              {/* Option 3: Automático */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 hover:bg-emerald-50/50 cursor-pointer">
                <RadioGroupItem value="auto" id="mode-auto" className="mt-0.5" />
                <Label htmlFor="mode-auto" className="cursor-pointer text-xs space-y-0.5">
                  <span className="font-bold text-emerald-950 dark:text-emerald-200 block">Automático (auto)</span>
                  <span className="text-emerald-800/80 dark:text-emerald-300/80 block text-[11px]">
                    Processamento total: aloca flat livre nos 19 flats, importa reserva, envia ARI em segundos e dispara automações (sem PIX).
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModeDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveMode}
              disabled={isSavingMode}
              className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {isSavingMode ? "Gravando..." : "Salvar Modo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
