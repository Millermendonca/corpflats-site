import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  DoorOpen,
  AlertTriangle,
  Info,
  CheckCircle2,
  Calendar,
  Flame,
  PowerOff,
} from 'lucide-react';

export interface FailSafeStatusProps {
  hasEnteredFlat: boolean;
  estimatedArrivalTime?: string;
  allowedFromTime?: string;
  shutoffAtTime?: string;
  warningActive?: boolean;
  warningMessage?: string;
  shutoffTriggered?: boolean;
  shutoffReason?: string;
  countdownMinutesRemaining?: number;
  devicesActive?: boolean;
  onConfirmEntrance: () => void;
  onUpdateEta?: (newEta: string) => void;
  isLoading?: boolean;
}

export function FailSafeStatus({
  hasEnteredFlat,
  estimatedArrivalTime = '14:00',
  allowedFromTime = '13:30',
  shutoffAtTime = '14:30',
  warningActive = false,
  warningMessage = 'Você já chegou? Não esqueça de informar sua entrada aqui.',
  shutoffTriggered = false,
  shutoffReason = 'Equipamento desligado automaticamente por questão de segurança e economia de energia.',
  countdownMinutesRemaining = 30,
  devicesActive = false,
  onConfirmEntrance,
  onUpdateEta,
  isLoading = false,
}: FailSafeStatusProps) {
  const [isEditingEta, setIsEditingEta] = useState(false);
  const [newEtaInput, setNewEtaInput] = useState(estimatedArrivalTime);

  const handleSaveEta = () => {
    if (onUpdateEta && newEtaInput.trim()) {
      onUpdateEta(newEtaInput.trim());
    }
    setIsEditingEta(false);
  };

  // Calculate percentage of remaining countdown (0 min = 100% elapsed / 0% remaining)
  const countdownProgress = Math.max(
    0,
    Math.min(100, Math.round(((30 - countdownMinutesRemaining) / 30) * 100))
  );

  return (
    <Card className="overflow-hidden border border-border/60 shadow-sm transition-all hover:shadow-md bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                hasEnteredFlat
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : shutoffTriggered
                  ? 'bg-destructive/15 text-destructive border border-destructive/30'
                  : warningActive
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-primary/10 text-primary border border-primary/20'
              }`}
            >
              {hasEnteredFlat ? (
                <ShieldCheck className="h-6 w-6" />
              ) : shutoffTriggered ? (
                <PowerOff className="h-6 w-6" />
              ) : (
                <ShieldAlert className="h-6 w-6" />
              )}
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Segurança & Presença no Flat
                {hasEnteredFlat && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 text-[10px]">
                    Presença Confirmada
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Protocolo fail-safe contra desperdício e superaquecimento
              </CardDescription>
            </div>
          </div>

          <Badge
            variant={
              hasEnteredFlat
                ? 'default'
                : shutoffTriggered
                ? 'destructive'
                : warningActive
                ? 'secondary'
                : 'outline'
            }
            className={`text-xs ${
              hasEnteredFlat
                ? 'bg-emerald-600 text-white'
                : warningActive
                ? 'bg-amber-500 text-white animate-pulse'
                : ''
            }`}
          >
            {hasEnteredFlat
              ? 'Protegido'
              : shutoffTriggered
              ? 'Corte Executado'
              : warningActive
              ? 'Alerta Ativo'
              : 'Monitorando'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* SHUTOFF TRIGGERED BANNER */}
        {shutoffTriggered && !hasEnteredFlat && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3.5 text-xs text-destructive flex items-start gap-3">
            <PowerOff className="h-5 w-5 shrink-0 mt-0.5 text-destructive animate-bounce" />
            <div className="space-y-1">
              <p className="font-bold text-sm">Desligamento Automático de Segurança</p>
              <p className="text-[12px] opacity-95">{shutoffReason}</p>
              <p className="text-[11px] opacity-85 pt-1">
                A cafeteira e o ar-condicionado foram desligados preventivamente porque se passaram mais de 30 minutos do horário previsto ({estimatedArrivalTime}) sem confirmação de entrada.
              </p>
            </div>
          </div>
        )}

        {/* WARNING ACTIVE BANNER ("Você já chegou?") */}
        {warningActive && !hasEnteredFlat && !shutoffTriggered && (
          <div className="rounded-xl bg-amber-500/15 border-2 border-amber-500/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 animate-pulse" />
            <div className="space-y-1.5 flex-1">
              <p className="font-bold text-sm flex items-center justify-between">
                <span>Aviso Preventivo de Chegada</span>
                <span className="text-[11px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-mono">
                  {countdownMinutesRemaining}m restantes
                </span>
              </p>
              <p className="text-[12px] font-medium leading-relaxed">
                "{warningMessage}"
              </p>
              <p className="text-[11px] opacity-90">
                Seus aparelhos estão ligados. Caso não confirme sua entrada em até 30 minutos após o horário previsto ({shutoffAtTime}), eles serão desligados automaticamente.
              </p>
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={onConfirmEntrance}
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <DoorOpen className="h-4 w-4" />
                  Confirmar Entrada no Flat Agora
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* PRESENCE CONFIRMED STATE */}
        {hasEnteredFlat ? (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Entrada Confirmada!</p>
              <p className="text-[12px] opacity-90">
                O ciclo fail-safe foi desarmado com sucesso. Seus equipamentos permanecerão ligados conforme sua preferência e você pode controlá-los livremente.
              </p>
            </div>
          </div>
        ) : (
          /* ACTION TO CONFIRM ENTRANCE WHEN NOT YET WARNING */
          !warningActive && (
            <div className="rounded-xl bg-muted/40 border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <DoorOpen className="h-4 w-4 text-primary" />
                  Já está no apartamento?
                </span>
                <Badge variant="outline" className="text-[11px]">
                  Presença Pendente
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Informe sua entrada para liberar o uso contínuo dos aparelhos e desarmar o timer de segurança.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={onConfirmEntrance}
                disabled={isLoading}
                className="w-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium text-xs flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Confirmar Minha Entrada no Flat
              </Button>
            </div>
          )
        )}

        {/* TIMELINE / COUNTDOWN PROGRESS IF DEVICES ARE ON AND NOT CONFIRMED */}
        {devicesActive && !hasEnteredFlat && !shutoffTriggered && (
          <div className="space-y-1.5 rounded-xl border border-border/50 bg-background/50 p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Tempo até o Desligamento Automático
              </span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                {countdownMinutesRemaining} min restantes
              </span>
            </div>
            <Progress value={countdownProgress} className="h-2 bg-muted" />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>ETA ({estimatedArrivalTime})</span>
              <span>Corte Fail-Safe ({shutoffAtTime})</span>
            </div>
          </div>
        )}

        {/* ETA & SCHEDULE WINDOW DETAILS */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Previsão (ETA)
              </span>
              {onUpdateEta && !hasEnteredFlat && (
                <button
                  type="button"
                  onClick={() => setIsEditingEta(!isEditingEta)}
                  className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                >
                  {isEditingEta ? 'Cancelar' : 'Alterar'}
                </button>
              )}
            </div>

            {isEditingEta ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="time"
                  value={newEtaInput}
                  onChange={(e) => setNewEtaInput(e.target.value)}
                  className="w-full text-xs font-mono rounded border border-border bg-background px-1.5 py-0.5"
                />
                <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveEta}>
                  Salvar
                </Button>
              </div>
            ) : (
              <p className="text-sm font-bold font-mono text-foreground">
                {estimatedArrivalTime}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Horário de chegada informado
            </p>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
              <Calendar className="h-3 w-3" /> Janela 30min
            </span>
            <p className="text-sm font-bold font-mono text-foreground">
              {allowedFromTime}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Início da programação permitida
            </p>
          </div>
        </div>

        {/* Safety standards footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border/40 pt-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            Regra operacional: programar até 30min antes; desligamento automático 30min após o ETA sem entrada.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
