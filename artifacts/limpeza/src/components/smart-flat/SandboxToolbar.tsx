import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Clock,
  RotateCcw,
  FastForward,
  CheckCircle2,
  AlertTriangle,
  PowerOff,
  Building,
  HelpCircle,
  FlaskConical,
} from 'lucide-react';

export interface SandboxToolbarProps {
  selectedFlat: string;
  onSelectFlat: (flat: string) => void;
  availableFlats: string[];
  simulatedTime: string; // "HH:mm"
  estimatedArrivalTime: string; // "HH:mm"
  offsetMinutes: number;
  onChangeOffset: (minutes: number) => void;
  onApplyScenario: (scenario: 'eta_minus_45' | 'eta_minus_20' | 'eta_plus_10' | 'eta_plus_35' | 'confirm_entrance' | 'reset') => void;
  isEntranceConfirmed: boolean;
  hasActiveShutoff: boolean;
  isWarningActive: boolean;
}

export function SandboxToolbar({
  selectedFlat,
  onSelectFlat,
  availableFlats,
  simulatedTime,
  estimatedArrivalTime,
  offsetMinutes,
  onChangeOffset,
  onApplyScenario,
  isEntranceConfirmed,
  hasActiveShutoff,
  isWarningActive,
}: SandboxToolbarProps) {
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 space-y-3 shadow-xs">
      {/* Top row: Developer badge & Flat selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center gap-1.5 uppercase tracking-wide">
            <FlaskConical className="h-3.5 w-3.5" />
            Laboratório & Sandbox de Testes
          </Badge>
          <span className="text-xs text-amber-900/80 dark:text-amber-200/80 font-medium hidden sm:inline">
            Isolado de hóspedes reais em produção
          </span>
        </div>

        {/* Flat Selector */}
        <div className="flex items-center gap-1.5">
          <Building className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Flat:</span>
          <select
            value={selectedFlat}
            onChange={(e) => onSelectFlat(e.target.value)}
            className="text-xs font-semibold rounded-md border border-amber-500/40 bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {availableFlats.map((flat) => (
              <option key={flat} value={flat}>
                Flat {flat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center row: Clock & Time Scrubbing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
        <div className="flex items-center gap-3 bg-background/80 rounded-lg p-2 border border-border/60">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Relógio Virtual:</span>
              <span className="font-mono font-bold text-sm text-foreground">
                {simulatedTime}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>ETA: {estimatedArrivalTime}</span>
              <span>
                {offsetMinutes > 0 ? `+${offsetMinutes}m` : `${offsetMinutes}m`}
              </span>
            </div>
          </div>
        </div>

        {/* Offset Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
            <span>-60 min</span>
            <span className="font-semibold text-foreground">Offset de Horário</span>
            <span>+60 min</span>
          </div>
          <Slider
            value={[offsetMinutes]}
            min={-60}
            max={60}
            step={5}
            onValueChange={(val) => onChangeOffset(val[0])}
            className="py-1 cursor-pointer"
            aria-label="Deslocamento de tempo virtual"
          />
        </div>
      </div>

      {/* Preset Scenario Buttons */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
          Cenários de Teste Rápido (Time-Travel):
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onApplyScenario('eta_minus_45')}
            className="h-8 text-[11px] bg-background/60 hover:bg-background border-amber-300 dark:border-amber-800 text-foreground flex items-center justify-center gap-1"
            title="Mais de 30min antes do ETA: Deve bloquear acionamento de cafeteira e ar"
          >
            <span>-45m (Bloqueio)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onApplyScenario('eta_minus_20')}
            className="h-8 text-[11px] bg-background/60 hover:bg-background border-emerald-300 dark:border-emerald-800 text-foreground flex items-center justify-center gap-1"
            title="Dentro da janela de 30min: Permite ligar aparelhos"
          >
            <span>-20m (Liberado)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onApplyScenario('eta_plus_10')}
            className="h-8 text-[11px] bg-background/60 hover:bg-background border-amber-400 dark:border-amber-700 text-foreground flex items-center justify-center gap-1"
            title="Passou o ETA sem confirmação: Dispara aviso 'Você já chegou?'"
          >
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span>+10m (Alerta)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onApplyScenario('eta_plus_35')}
            className="h-8 text-[11px] bg-background/60 hover:bg-background border-destructive/40 text-foreground flex items-center justify-center gap-1"
            title="Passou 30min pós-ETA sem check-in: Desliga aparelhos por segurança"
          >
            <PowerOff className="h-3 w-3 text-destructive" />
            <span>+35m (Corte)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onApplyScenario('confirm_entrance')}
            className="h-8 text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 flex items-center justify-center gap-1"
            title="Confirma entrada no flat e desarma fail-safe"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>Entrada OK</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onApplyScenario('reset')}
            className="h-8 text-[11px] bg-background/60 hover:bg-background border-border flex items-center justify-center gap-1"
            title="Restaura estado inicial do flat"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Resetar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
