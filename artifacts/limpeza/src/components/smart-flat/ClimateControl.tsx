import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Thermometer,
  Snowflake,
  Wind,
  Sun,
  Droplets,
  Minus,
  Plus,
  ShieldAlert,
  Clock,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { AcMode, FanSpeed } from './types';

export interface ClimateControlProps {
  power: boolean;
  targetTemperature: number; // 18 to 26
  currentTemperature?: number;
  mode: AcMode;
  fanSpeed: FanSpeed;
  onTogglePower: (next: boolean) => void;
  onChangeTemperature: (temp: number) => void;
  onChangeMode: (mode: AcMode) => void;
  onChangeFanSpeed: (speed: FanSpeed) => void;
  disabled?: boolean;
  disabledReason?: string;
  hasEnteredFlat?: boolean;
  estimatedArrivalTime?: string;
  allowedFromTime?: string;
  isLoading?: boolean;
}

export function ClimateControl({
  power,
  targetTemperature,
  currentTemperature = 25,
  mode,
  fanSpeed,
  onTogglePower,
  onChangeTemperature,
  onChangeMode,
  onChangeFanSpeed,
  disabled = false,
  disabledReason,
  hasEnteredFlat = false,
  estimatedArrivalTime,
  allowedFromTime,
  isLoading = false,
}: ClimateControlProps) {
  const modes: Array<{ id: AcMode; label: string; icon: React.ReactNode }> = [
    { id: 'cool', label: 'Frio', icon: <Snowflake className="h-4 w-4" /> },
    { id: 'fan', label: 'Vento', icon: <Wind className="h-4 w-4" /> },
    { id: 'heat', label: 'Quente', icon: <Sun className="h-4 w-4" /> },
    { id: 'dry', label: 'Seco', icon: <Droplets className="h-4 w-4" /> },
  ];

  const fanSpeeds: Array<{ id: FanSpeed; label: string }> = [
    { id: 'auto', label: 'Auto' },
    { id: 'low', label: 'Baixa' },
    { id: 'med', label: 'Média' },
    { id: 'high', label: 'Alta' },
  ];

  const handleDecrement = () => {
    if (targetTemperature > 18) {
      onChangeTemperature(targetTemperature - 1);
    }
  };

  const handleIncrement = () => {
    if (targetTemperature < 26) {
      onChangeTemperature(targetTemperature + 1);
    }
  };

  return (
    <Card className="overflow-hidden border border-border/60 shadow-sm transition-all hover:shadow-md bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                power
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Snowflake className={`h-6 w-6 ${power ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold flex flex-wrap items-center gap-2">
                <span>Ar-Condicionado Split Inverter</span>
                {power && (
                  <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-ping shrink-0" />
                )}
              </CardTitle>
              <CardDescription className="text-xs leading-snug">
                Controle inteligente com infravermelho IR Blaster 38kHz
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={power}
              onCheckedChange={onTogglePower}
              disabled={disabled || isLoading}
              aria-label="Ligar ou desligar o ar-condicionado"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {power ? (
            <Badge variant="default" className="bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1">
              <Zap className="h-3 w-3" /> Ligado: {targetTemperature}°C ({mode.toUpperCase()})
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Desligado
            </Badge>
          )}

          <Badge variant="secondary" className="flex items-center gap-1 text-[11px]">
            <Thermometer className="h-3 w-3 text-muted-foreground" /> Ambiente: {currentTemperature}°C
          </Badge>

          {disabled && disabledReason && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Janela 30min
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

        {/* Temperature Dial / Big Display */}
        <div
          className={`rounded-xl border p-4 text-center transition-opacity ${
            power && !disabled ? 'bg-sky-500/5 border-sky-500/20' : 'bg-muted/30 border-border/50 opacity-60'
          }`}
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Temperatura Desejada
          </p>

          <div className="flex items-center justify-center gap-6 my-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-border/60 hover:bg-sky-500/10 hover:text-sky-600 active:scale-95"
              onClick={handleDecrement}
              disabled={!power || disabled || targetTemperature <= 18}
              aria-label="Diminuir temperatura"
            >
              <Minus className="h-5 w-5" />
            </Button>

            <div className="flex items-baseline justify-center">
              <span className="text-5xl font-extrabold tracking-tight text-foreground font-mono">
                {targetTemperature}
              </span>
              <span className="text-2xl font-bold text-sky-600 dark:text-sky-400 ml-0.5">
                °C
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-border/60 hover:bg-sky-500/10 hover:text-sky-600 active:scale-95"
              onClick={handleIncrement}
              disabled={!power || disabled || targetTemperature >= 26}
              aria-label="Aumentar temperatura"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          {/* Radix Slider for continuous fine-tuning between 18 and 26 */}
          <div className="pt-2 px-3">
            <Slider
              value={[targetTemperature]}
              min={18}
              max={26}
              step={1}
              disabled={!power || disabled}
              onValueChange={(val) => onChangeTemperature(val[0])}
              className="py-2 cursor-pointer"
              aria-label="Seletor de temperatura de 18 a 26 graus"
            />
            <div className="flex justify-between text-[11px] font-mono text-muted-foreground mt-1">
              <span>18°C (Mín)</span>
              <span>22°C (Conforto)</span>
              <span>26°C (Máx)</span>
            </div>
          </div>
        </div>

        {/* Operating Modes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Modo de Operação</span>
            <span className="text-[11px] uppercase text-primary font-semibold">{mode}</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {modes.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!power || disabled}
                  onClick={() => onChangeMode(m.id)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-xs font-medium transition-all ${
                    active
                      ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                      : 'border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  } ${!power || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="mb-1">{m.icon}</span>
                  <span className="text-[11px]">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fan Speed */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Velocidade do Ventilador</span>
            <span className="text-[11px] uppercase text-primary font-semibold">{fanSpeed}</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {fanSpeeds.map((f) => {
              const active = fanSpeed === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!power || disabled}
                  onClick={() => onChangeFanSpeed(f.id)}
                  className={`py-1.5 px-1 rounded-lg border text-xs font-medium text-center transition-all ${
                    active
                      ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  } ${!power || disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fail-Safe Notice if active */}
        {power && !hasEnteredFlat && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-medium">Proteção Fail-Safe Ativa</p>
              <p className="text-[11px] mt-0.5">
                O ar-condicionado desligará automaticamente caso a entrada no flat não seja confirmada até 30 minutos após seu horário previsto de chegada ({estimatedArrivalTime || '14:00'}).
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
