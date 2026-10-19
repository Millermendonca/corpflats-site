import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Coffee, Flame, ShieldAlert, Clock, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';

export interface DeviceCardProps {
  title?: string;
  description?: string;
  power: boolean;
  onTogglePower: (next: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  thermalWarning?: boolean;
  autoOffIndicator?: boolean;
  countdownMinutes?: number;
  hasEnteredFlat?: boolean;
  estimatedArrivalTime?: string;
  allowedFromTime?: string;
  isLoading?: boolean;
}

export function DeviceCard({
  title = 'Cafeteira Elétrica Express',
  description = 'Tomada inteligente 16A com sensor de temperatura NBR 14136',
  power,
  onTogglePower,
  disabled = false,
  disabledReason,
  thermalWarning = false,
  autoOffIndicator = true,
  countdownMinutes,
  hasEnteredFlat = false,
  estimatedArrivalTime,
  allowedFromTime,
  isLoading = false,
}: DeviceCardProps) {
  return (
    <Card className="overflow-hidden border border-border/60 shadow-sm transition-all hover:shadow-md bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                power
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Coffee className={`h-6 w-6 ${power ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold flex flex-wrap items-center gap-2">
                <span>{title}</span>
                {power && (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                )}
              </CardTitle>
              <CardDescription className="text-xs leading-snug">
                {description}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={power}
              onCheckedChange={onTogglePower}
              disabled={disabled || isLoading}
              aria-label={`Ligar ou desligar ${title}`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Status badges row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {power ? (
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1">
              <Zap className="h-3 w-3 shrink-0" /> Ligada & Aquecendo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 shrink-0" /> Em Standby
            </Badge>
          )}

          {thermalWarning && (
            <Badge variant="destructive" className="flex items-center gap-1 animate-bounce">
              <Flame className="h-3 w-3 shrink-0" /> Proteção Térmica Ativa
            </Badge>
          )}

          {disabled && disabledReason && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" /> Bloqueado: Janela de 30min
            </Badge>
          )}
        </div>

        {/* Disabled notification banner */}
        {disabled && disabledReason && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-medium">Programação Restrita</p>
              <p className="text-[11px] mt-0.5 opacity-90">{disabledReason}</p>
              {allowedFromTime && (
                <p className="text-[11px] mt-1 font-semibold">
                  Liberado a partir de: <span className="underline">{allowedFromTime}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Active Power & Safety Info */}
        {power && !disabled && (
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-xs text-muted-foreground space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1 font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                <Coffee className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Preparo Express em andamento</span>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                Consumo: ~850W
              </span>
            </div>
            <p className="text-[11px]">
              O café estará pronto e quentinho assim que você passar pela porta do seu flat.
            </p>

            {autoOffIndicator && !hasEnteredFlat && (
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-[11px] pt-1 border-t border-border/50">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Fail-Safe Ativo: desligamento automático 30min após o ETA ({estimatedArrivalTime || '14:00'}) se a entrada não for confirmada.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Protection metadata tag */}
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
          <span className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-muted-foreground shrink-0" />
            <span>Corte térmico aos 105°C</span>
          </span>
          <span>Plugue Tuya 16A NBR</span>
        </div>
      </CardContent>
    </Card>
  );
}
