import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Zap,
  Sparkles,
  ExternalLink,
  Settings,
  Terminal,
  ShieldCheck,
  HelpCircle,
  Eye,
  PowerOff,
} from "lucide-react";
import { useLocation } from "wouter";
import { navigateFromOverlay } from "@/lib/back-navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { WbpIntegrationMode } from "@/components/wbp/types";
import { useToast } from "@/hooks/use-toast";

interface ChannexTaskLog {
  id: string;
  timestamp: string;
  endpoint: string;
  taskIds: string[];
  valuesCount: number;
  dateFrom: string;
  dateTo: string;
  trigger: string;
  status: string;
}

interface ChannexSyncSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: WbpIntegrationMode;
  pendingQuarantineCount: number;
  onRefreshCentral: () => Promise<void> | void;
}

export const ChannexSyncSheet: React.FC<ChannexSyncSheetProps> = ({
  open,
  onOpenChange,
  initialMode = "observe",
  pendingQuarantineCount,
  onRefreshCentral,
}) => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<WbpIntegrationMode>(initialMode);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isSyncingAri, setIsSyncingAri] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [channexConfig, setChannexConfig] = useState<any>(null);
  const [taskLogs, setTaskLogs] = useState<ChannexTaskLog[]>([]);
  const [iframeUrl, setIframeUrl] = useState("");
  const [iframeOpen, setIframeOpen] = useState(false);

  const loadChannexTelemetry = useCallback(async () => {
    try {
      const [modeRes, chxRes] = await Promise.all([
        fetch("/api/wbp/mode"),
        fetch("/api/wbp/channex/config"),
      ]);
      if (modeRes.ok) {
        const md = await modeRes.json();
        if (md?.mode) setMode(md.mode);
      }
      if (chxRes.ok) {
        const cd = await chxRes.json();
        if (cd?.config) setChannexConfig(cd.config);
        if (Array.isArray(cd?.taskLogs)) setTaskLogs(cd.taskLogs);
      }
    } catch {
      // Resilient silent fallback
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadChannexTelemetry();
    }
  }, [open, loadChannexTelemetry]);

  const handleSaveMode = async (nextMode: WbpIntegrationMode) => {
    setMode(nextMode);
    setIsSavingMode(true);
    try {
      const res = await fetch("/api/wbp/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (res.ok) {
        toast({
          title: "Modo Channex atualizado",
          description: `Operação alterada para ${nextMode.toUpperCase()}.`,
        });
      }
    } catch {
      toast({
        title: "Erro ao salvar modo",
        description: "Não foi possível comunicar com o servidor.",
        variant: "destructive",
      });
    } finally {
      setIsSavingMode(false);
    }
  };

  const handlePollFeed = async () => {
    setIsPolling(true);
    try {
      const res = await fetch("/api/wbp/channex/poll-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bypassSwitch: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.error) {
        toast({ title: "Aviso no Feed Channex", description: data.error });
      } else {
        toast({
          title: "Feed de reservas consultado!",
          description: `${data?.processedCount ?? 0} revisões processadas na Channex.io.`,
        });
      }
      await loadChannexTelemetry();
      await onRefreshCentral();
    } catch {
      toast({ title: "Consulta de revisões disparada" });
    } finally {
      setIsPolling(false);
    }
  };

  const handleFullSyncAri = async () => {
    setIsSyncingAri(true);
    try {
      const res = await fetch("/api/wbp/channex/full-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 500, bypassSwitch: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.error) {
        toast({ title: "Aviso no Full Sync", description: data.error, variant: "destructive" });
      } else {
        toast({
          title: "Full Sync 500 dias concluído!",
          description: "Disponibilidade e tarifas das 19 unidades enviadas para Booking & Airbnb.",
        });
      }
      await loadChannexTelemetry();
    } catch {
      toast({ title: "Sincronização ARI disparada" });
    } finally {
      setIsSyncingAri(false);
    }
  };

  const handleAutoSetup = async () => {
    setIsSettingUp(true);
    try {
      const res = await fetch("/api/wbp/channex/auto-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bypassSwitch: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        toast({
          title: "Inventário configurado!",
          description: "19 Flats + Tarifas Com Café e Sem Café sincronizados na Channex.",
        });
        await loadChannexTelemetry();
      } else {
        toast({
          title: "Verifique a chave Channex",
          description: data?.error || "Configure CHANNEX_API_KEY antes do Auto-Setup.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleOpenIframe = async () => {
    try {
      const res = await fetch("/api/wbp/channex/iframe-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bypassSwitch: true, redirectTo: "/channels" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.iframeUrl) {
        setIframeUrl(data.iframeUrl);
        setIframeOpen(true);
      } else {
        toast({
          title: "Token indisponível",
          description: data?.error || "Configure Property ID e CHANNEX_API_KEY nas configurações.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Erro ao abrir IFrame Channex", variant: "destructive" });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center justify-between gap-2 pr-6">
              <SheetTitle className="text-lg font-black flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                Sincronização OTAs & Channex.io
              </SheetTitle>
              {pendingQuarantineCount > 0 && (
                <Badge className="bg-rose-600 text-white text-[10px] font-bold">
                  {pendingQuarantineCount} em Quarentena
                </Badge>
              )}
            </div>
            <SheetDescription className="text-xs">
              Controles técnicos de ingestão Booking.com / Airbnb, modo operacional, mapeamento de canais e auditoria ARI.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-5">
            {/* Ações Rápidas de Sincronização */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Ações Imediatas de Canal
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePollFeed}
                  disabled={isPolling}
                  className="justify-start gap-2 h-9 text-xs font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isPolling ? "animate-spin" : ""}`} />
                  {isPolling ? "Consultando Feed..." : "Consultar Feed Agora"}
                </Button>

                <Button
                  size="sm"
                  onClick={handleFullSyncAri}
                  disabled={isSyncingAri}
                  className="justify-start gap-2 h-9 text-xs font-bold"
                >
                  <Zap className={`w-3.5 h-3.5 ${isSyncingAri ? "animate-spin" : ""}`} />
                  {isSyncingAri ? "Sincronizando..." : "Full Sync 500d (ARI)"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoSetup}
                  disabled={isSettingUp}
                  className="justify-start gap-2 h-9 text-xs font-semibold"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isSettingUp ? "animate-spin" : ""}`} />
                  {isSettingUp ? "Configurando..." : "Auto-Setup 19 Flats"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenIframe}
                  className="justify-start gap-2 h-9 text-xs font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                  Conectar Canais (IFrame)
                </Button>
              </div>
            </div>

            {/* Modo Operacional */}
            <div className="space-y-2.5 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Modo do Channel Manager
                </h4>
                {isSavingMode && <span className="text-[11px] text-muted-foreground">Salvando...</span>}
              </div>

              <RadioGroup
                value={mode}
                onValueChange={(v) => handleSaveMode(v as WbpIntegrationMode)}
                className="space-y-2"
              >
                <div className="flex items-start space-x-2.5 p-2.5 rounded-xl border bg-emerald-500/5 border-emerald-500/30">
                  <RadioGroupItem value="auto" id="chx-mode-auto" className="mt-0.5" />
                  <Label htmlFor="chx-mode-auto" className="cursor-pointer space-y-0.5">
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Automático (Produção)
                    </div>
                    <p className="text-[11px] text-muted-foreground font-normal">
                      Importa reservas OTA direto no Mapa/Lista, envia ARI automaticamente e isola conflitos na aba Quarentena.
                    </p>
                  </Label>
                </div>

                <div className="flex items-start space-x-2.5 p-2.5 rounded-xl border">
                  <RadioGroupItem value="observe" id="chx-mode-obs" className="mt-0.5" />
                  <Label htmlFor="chx-mode-obs" className="cursor-pointer space-y-0.5">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-amber-600" />
                      Somente Observar (Homologação)
                    </div>
                    <p className="text-[11px] text-muted-foreground font-normal">
                      Recebe o feed das OTAs para conferência sem bloquear calendário automaticamente.
                    </p>
                  </Label>
                </div>

                <div className="flex items-start space-x-2.5 p-2.5 rounded-xl border">
                  <RadioGroupItem value="off" id="chx-mode-off" className="mt-0.5" />
                  <Label htmlFor="chx-mode-off" className="cursor-pointer space-y-0.5">
                    <div className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground">
                      <PowerOff className="w-3.5 h-3.5" />
                      Desligado
                    </div>
                    <p className="text-[11px] text-muted-foreground font-normal">
                      Pausa sincronização automática de disponibilidade, tarifas e webhooks.
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Config IDs & Documentação */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">Status do Mapeamento</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs gap-1"
                  onClick={() => {
                    navigateFromOverlay(setLocation, "/ajuda-wbp", () => onOpenChange(false));
                  }}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Manual Passo a Passo Channex
                </Button>
              </div>
              <div className="rounded-xl bg-muted/40 border p-3 text-[11px] space-y-1 font-mono">
                <div>Property ID: {channexConfig?.propertyId || "Não configurado"}</div>
                <div>Room Type (19 Flats): {channexConfig?.roomTypeId || "Não configurado"}</div>
              </div>
            </div>

            {/* Últimos Task Logs Channex */}
            {taskLogs.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  Últimas Sincronizações ARI ({taskLogs.length})
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {taskLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border bg-muted/20 px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <span className="font-bold text-foreground">{log.endpoint}</span>
                        <span className="text-muted-foreground ml-1.5">({log.valuesCount} itens)</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {log.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={iframeOpen} onOpenChange={setIframeOpen}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 py-3.5 border-b shrink-0">
            <DialogTitle className="text-sm font-bold">
              Conexão Segura de Canais Booking.com & Airbnb (Channex.io)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Autentique suas contas OTA diretamente no cofre certificado PCI-DSS da Channex.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 w-full bg-background">
            {iframeUrl && (
              <iframe
                src={iframeUrl}
                title="Channex Channel Mapping"
                className="w-full h-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
