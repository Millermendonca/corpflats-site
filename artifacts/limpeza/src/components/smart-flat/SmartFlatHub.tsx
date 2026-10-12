import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Wifi,
  Sparkles,
  ShieldCheck,
  Coffee,
  Snowflake,
  Music,
  DoorOpen,
  LayoutGrid,
} from 'lucide-react';
import { DeviceCard } from './DeviceCard';
import { ClimateControl } from './ClimateControl';
import { FailSafeStatus } from './FailSafeStatus';
import { WelcomeMusicPlayer } from './WelcomeMusicPlayer';
import { SandboxToolbar } from './SandboxToolbar';
import { SmartFlatState, AcMode, FanSpeed, AudioTrack } from './types';

// Standard hotel playlist
const DEFAULT_TRACKS: AudioTrack[] = [
  { id: '1', title: 'Soho Bossa Sunset', artist: 'CorpFlats Acoustic Studio', duration: '3:45' },
  { id: '2', title: 'Jazz & Café Lounge', artist: 'Campos Jazz Collective', duration: '4:12' },
  { id: '3', title: 'Acoustic Welcome', artist: 'Hospitality Sounds RJ', duration: '3:30' },
  { id: '4', title: 'Lo-Fi Balcony Breeze', artist: 'Chill Residence Beats', duration: '2:58' },
];

export interface SmartFlatHubProps {
  initialFlatNumber?: string;
  reservationCode?: string;
  guestName?: string;
  isSandboxMode?: boolean;
}

// Time calculation helpers
function timeStrToMinutes(t: string): number {
  if (!t) return 14 * 60;
  const parts = t.replace('h', ':').split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function minutesToTimeStr(m: number): string {
  const norm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60).toString().padStart(2, '0');
  const min = (norm % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
}

export function SmartFlatHub({
  initialFlatNumber = '313',
  reservationCode = 'RES-313-0301',
  guestName = 'Miller',
  isSandboxMode = true,
}: SmartFlatHubProps) {
  const { toast } = useToast();
  const [flatNumber, setFlatNumber] = useState(initialFlatNumber);
  const [activeTab, setActiveTab] = useState<'all' | 'climate' | 'coffee' | 'music' | 'security'>('all');

  // Base ETA and Check-in times
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState('14:00');
  const checkinTime = '14:00';

  // Simulation time-travel state
  const [offsetMinutes, setOffsetMinutes] = useState(0);

  // Current simulated time derived from base ETA (e.g. 14:00 + offset)
  const simulatedTime = useMemo(() => {
    const baseMin = timeStrToMinutes(estimatedArrivalTime);
    return minutesToTimeStr(baseMin + offsetMinutes);
  }, [estimatedArrivalTime, offsetMinutes]);

  // Devices & Features State
  const [hasEnteredFlat, setHasEnteredFlat] = useState(false);
  const [coffeePower, setCoffeePower] = useState(false);
  const [acPower, setAcPower] = useState(false);
  const [acTemp, setAcTemp] = useState(22);
  const [acMode, setAcMode] = useState<AcMode>('cool');
  const [acFanSpeed, setAcFanSpeed] = useState<FanSpeed>('auto');
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(35);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);

  // Shutoff and warning states
  const [shutoffTriggered, setShutoffTriggered] = useState(false);
  const [shutoffReason, setShutoffReason] = useState(
    'Equipamento desligado automaticamente por questão de segurança e economia de energia.'
  );

  // Time window calculations
  const etaMinutes = useMemo(() => timeStrToMinutes(estimatedArrivalTime), [estimatedArrivalTime]);
  const allowedFromMinutes = useMemo(() => etaMinutes - 30, [etaMinutes]);
  const allowedFromTime = useMemo(() => minutesToTimeStr(allowedFromMinutes), [allowedFromMinutes]);
  const shutoffAtMinutes = useMemo(() => etaMinutes + 30, [etaMinutes]);
  const shutoffAtTime = useMemo(() => minutesToTimeStr(shutoffAtMinutes), [shutoffAtMinutes]);
  const currentMinutes = useMemo(() => timeStrToMinutes(simulatedTime), [simulatedTime]);

  // R2 Rule: Can only schedule up to 30 min before ETA (unless presence is confirmed)
  const isScheduleAllowed = hasEnteredFlat || currentMinutes >= allowedFromMinutes;
  const scheduleDisabledReason = !isScheduleAllowed
    ? `A programação só é permitida com até 30 minutos de antecedência da sua chegada (a partir das ${allowedFromTime} para chegada às ${estimatedArrivalTime}).`
    : undefined;

  // R3 Rule: Fail-Safe presence check & auto shutoff
  const isAnyDeviceOn = coffeePower || acPower;

  // Warning active: past ETA and devices on without confirmation
  const isWarningActive = useMemo(() => {
    if (hasEnteredFlat || !isAnyDeviceOn || shutoffTriggered) return false;
    return currentMinutes >= etaMinutes && currentMinutes < shutoffAtMinutes;
  }, [hasEnteredFlat, isAnyDeviceOn, shutoffTriggered, currentMinutes, etaMinutes, shutoffAtMinutes]);

  const countdownMinutesRemaining = useMemo(() => {
    if (shutoffTriggered) return 0;
    if (currentMinutes < etaMinutes) return 30;
    return Math.max(0, shutoffAtMinutes - currentMinutes);
  }, [shutoffTriggered, currentMinutes, etaMinutes, shutoffAtMinutes]);

  // Fail-Safe auto-shutdown trigger effect
  useEffect(() => {
    if (!hasEnteredFlat && isAnyDeviceOn && currentMinutes >= shutoffAtMinutes) {
      if (!shutoffTriggered) {
        setCoffeePower(false);
        setAcPower(false);
        setShutoffTriggered(true);
        setShutoffReason('Equipamento desligado automaticamente por questão de segurança e economia de energia.');
        toast({
          title: '🛡️ Desligamento Automático por Segurança',
          description: 'Aparelhos desligados: 30 minutos após o horário previsto sem confirmação de entrada.',
          variant: 'destructive',
        });
      }
    }
  }, [hasEnteredFlat, isAnyDeviceOn, currentMinutes, shutoffAtMinutes, shutoffTriggered, toast]);

  // R4 Rule: Welcome music automatically triggers at checkin time (14:00) on check-in day
  const isCheckinTimeReached = currentMinutes >= timeStrToMinutes(checkinTime);
  const autoTriggerMusic = isCheckinTimeReached;

  // Handlers for Coffee Maker
  const handleToggleCoffee = (next: boolean) => {
    if (!isScheduleAllowed && next) {
      toast({
        title: 'Horário Não Permitido',
        description: scheduleDisabledReason,
        variant: 'destructive',
      });
      return;
    }
    setCoffeePower(next);
    if (next && shutoffTriggered) {
      setShutoffTriggered(false);
    }
    toast({
      title: next ? '☕ Cafeteira Ligada' : 'Cafeteira Desligada',
      description: next
        ? 'A cafeteira está aquecendo. O café estará pronto ao chegar.'
        : 'Cafeteira em standby.',
    });
  };

  // Handlers for AC
  const handleToggleAc = (next: boolean) => {
    if (!isScheduleAllowed && next) {
      toast({
        title: 'Horário Não Permitido',
        description: scheduleDisabledReason,
        variant: 'destructive',
      });
      return;
    }
    setAcPower(next);
    if (next && shutoffTriggered) {
      setShutoffTriggered(false);
    }
    toast({
      title: next ? '❄️ Ar-Condicionado Ligado' : 'Ar-Condicionado Desligado',
      description: next
        ? `Climatizando para ${acTemp}°C em modo ${acMode.toUpperCase()}.`
        : 'Ar-condicionado em standby.',
    });
  };

  const handleChangeAcTemp = (temp: number) => {
    const clamped = Math.min(26, Math.max(18, temp));
    setAcTemp(clamped);
  };

  // Handler for Confirm Entrance
  const handleConfirmEntrance = () => {
    setHasEnteredFlat(true);
    setShutoffTriggered(false);
    toast({
      title: '🚪 Entrada Confirmada no Flat!',
      description: 'Presença registrada. O sistema fail-safe foi desarmado e seus aparelhos permanecerão ativos.',
      variant: 'default',
    });
  };

  // Handlers for Music
  const handleTogglePlayMusic = (next: boolean) => {
    setMusicPlaying(next);
    toast({
      title: next ? '🎵 Música Iniciada' : 'Música Pausada',
      description: next
        ? `Tocando "${DEFAULT_TRACKS[currentTrackIdx].title}"`
        : 'Trilha sonora pausada.',
    });
  };

  const handleNextTrack = () => {
    setCurrentTrackIdx((prev) => (prev + 1) % DEFAULT_TRACKS.length);
  };

  const handlePrevTrack = () => {
    setCurrentTrackIdx((prev) => (prev - 1 + DEFAULT_TRACKS.length) % DEFAULT_TRACKS.length);
  };

  // Quick scenario applicator for SandboxToolbar
  const handleApplyScenario = (
    scenario: 'eta_minus_45' | 'eta_minus_20' | 'eta_plus_10' | 'eta_plus_35' | 'confirm_entrance' | 'reset'
  ) => {
    switch (scenario) {
      case 'eta_minus_45':
        // Offset -45 min (e.g. 13:15 for 14:00 ETA) -> outside window
        setOffsetMinutes(-45);
        setHasEnteredFlat(false);
        setShutoffTriggered(false);
        toast({
          title: 'Cenário: ETA - 45 min',
          description: 'Horário anterior à janela de 30min. Programação deve ficar bloqueada.',
        });
        break;
      case 'eta_minus_20':
        // Offset -20 min (e.g. 13:40 for 14:00 ETA) -> within 30 min window
        setOffsetMinutes(-20);
        setHasEnteredFlat(false);
        setShutoffTriggered(false);
        toast({
          title: 'Cenário: ETA - 20 min',
          description: 'Dentro da janela de 30min! Acionamento da cafeteira e ar-condicionado liberado.',
        });
        break;
      case 'eta_plus_10':
        // Offset +10 min (e.g. 14:10 for 14:00 ETA) -> past ETA, warning
        setOffsetMinutes(10);
        setHasEnteredFlat(false);
        setCoffeePower(true);
        setAcPower(true);
        setShutoffTriggered(false);
        toast({
          title: 'Cenário: ETA + 10 min',
          description: 'Hóspede ainda não confirmou entrada. Alerta preventivo "Você já chegou?" ativado!',
        });
        break;
      case 'eta_plus_35':
        // Offset +35 min (e.g. 14:35 for 14:00 ETA) -> shutoff
        setOffsetMinutes(35);
        setHasEnteredFlat(false);
        setShutoffTriggered(true);
        setCoffeePower(false);
        setAcPower(false);
        toast({
          title: 'Cenário: ETA + 35 min',
          description: 'Corte fail-safe acionado! Aparelhos desligados compulsoriamente por segurança.',
          variant: 'destructive',
        });
        break;
      case 'confirm_entrance':
        handleConfirmEntrance();
        break;
      case 'reset':
        setOffsetMinutes(0);
        setHasEnteredFlat(false);
        setCoffeePower(false);
        setAcPower(false);
        setShutoffTriggered(false);
        setAcTemp(22);
        setMusicPlaying(false);
        toast({
          title: 'Estado Resetado',
          description: 'Simulação retornou aos parâmetros nominais iniciais.',
        });
        break;
    }
  };

  const availableFlats = ['113', '114', '116', '211', '212', '215', '313', '408', '509', '511', '512', '605', '712', '715', '904', '905', '907', '1004', '1304'];

  return (
    <div className="max-w-4xl mx-auto space-y-5 px-3 py-4 sm:px-6">
      {/* Sandbox Toolbar (Only shown in Sandbox Mode) */}
      {isSandboxMode && (
        <SandboxToolbar
          selectedFlat={flatNumber}
          onSelectFlat={setFlatNumber}
          availableFlats={availableFlats}
          simulatedTime={simulatedTime}
          estimatedArrivalTime={estimatedArrivalTime}
          offsetMinutes={offsetMinutes}
          onChangeOffset={setOffsetMinutes}
          onApplyScenario={handleApplyScenario}
          isEntranceConfirmed={hasEnteredFlat}
          hasActiveShutoff={shutoffTriggered}
          isWarningActive={isWarningActive}
        />
      )}

      {/* Main Header Card */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-primary/5 p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/30 font-semibold text-xs">
                Soho Residence Service
              </Badge>
              <Badge variant="secondary" className="text-[11px] font-mono">
                Flat {flatNumber}
              </Badge>
              {hasEnteredFlat ? (
                <Badge className="bg-emerald-600 text-white text-[11px] flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> No Flat
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-[11px]">
                  A Caminho (ETA {estimatedArrivalTime})
                </Badge>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 pt-1">
              Smart Flat Hub
              <Sparkles className="h-5 w-5 text-amber-500" />
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Olá, <span className="font-semibold text-foreground">{guestName}</span>! Prepare o flat com sua temperatura e café favoritos antes da sua chegada.
            </p>
          </div>

          {/* Quick info badges */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              <span>Wi-Fi 5GHz Ativo</span>
            </div>
            {!hasEnteredFlat && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleConfirmEntrance}
                className="h-8 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-1"
              >
                <DoorOpen className="h-3.5 w-3.5" />
                Confirmar Entrada
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-5 h-10 p-1 bg-muted/60">
          <TabsTrigger value="all" className="text-xs flex items-center gap-1">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Todos</span>
          </TabsTrigger>
          <TabsTrigger value="climate" className="text-xs flex items-center gap-1">
            <Snowflake className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clima</span>
          </TabsTrigger>
          <TabsTrigger value="coffee" className="text-xs flex items-center gap-1">
            <Coffee className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Café</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Segurança</span>
          </TabsTrigger>
          <TabsTrigger value="music" className="text-xs flex items-center gap-1">
            <Music className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Música</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: ALL DASHBOARD */}
        <TabsContent value="all" className="space-y-4 pt-2">
          {/* Fail-Safe Status card at the top for immediate visibility */}
          <FailSafeStatus
            hasEnteredFlat={hasEnteredFlat}
            estimatedArrivalTime={estimatedArrivalTime}
            allowedFromTime={allowedFromTime}
            shutoffAtTime={shutoffAtTime}
            warningActive={isWarningActive}
            shutoffTriggered={shutoffTriggered}
            shutoffReason={shutoffReason}
            countdownMinutesRemaining={countdownMinutesRemaining}
            devicesActive={isAnyDeviceOn}
            onConfirmEntrance={handleConfirmEntrance}
            onUpdateEta={setEstimatedArrivalTime}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Climate Control AC */}
            <ClimateControl
              power={acPower}
              targetTemperature={acTemp}
              mode={acMode}
              fanSpeed={acFanSpeed}
              onTogglePower={handleToggleAc}
              onChangeTemperature={handleChangeAcTemp}
              onChangeMode={setAcMode}
              onChangeFanSpeed={setAcFanSpeed}
              disabled={!isScheduleAllowed}
              disabledReason={scheduleDisabledReason}
              hasEnteredFlat={hasEnteredFlat}
              estimatedArrivalTime={estimatedArrivalTime}
              allowedFromTime={allowedFromTime}
            />

            {/* Coffee Maker Device Card */}
            <div className="space-y-4">
              <DeviceCard
                title="Cafeteira Elétrica Express"
                description="Tomada Tuya 16A com proteção térmica NBR 14136"
                power={coffeePower}
                onTogglePower={handleToggleCoffee}
                disabled={!isScheduleAllowed}
                disabledReason={scheduleDisabledReason}
                thermalWarning={false}
                autoOffIndicator={true}
                countdownMinutes={countdownMinutesRemaining}
                hasEnteredFlat={hasEnteredFlat}
                estimatedArrivalTime={estimatedArrivalTime}
                allowedFromTime={allowedFromTime}
              />

              {/* Welcome Music Player */}
              <WelcomeMusicPlayer
                state={{
                  isPlaying: musicPlaying,
                  autoTriggered: autoTriggerMusic,
                  volume: musicVolume,
                  currentTrackIndex: currentTrackIdx,
                  currentTrack: DEFAULT_TRACKS[currentTrackIdx].title,
                  tracks: DEFAULT_TRACKS,
                }}
                onTogglePlay={handleTogglePlayMusic}
                onChangeVolume={setMusicVolume}
                onNextTrack={handleNextTrack}
                onPrevTrack={handlePrevTrack}
                onSelectTrack={setCurrentTrackIdx}
                checkinTime={checkinTime}
                isCheckinDay={true}
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: CLIMATE ONLY */}
        <TabsContent value="climate" className="space-y-4 pt-2">
          <ClimateControl
            power={acPower}
            targetTemperature={acTemp}
            mode={acMode}
            fanSpeed={acFanSpeed}
            onTogglePower={handleToggleAc}
            onChangeTemperature={handleChangeAcTemp}
            onChangeMode={setAcMode}
            onChangeFanSpeed={setAcFanSpeed}
            disabled={!isScheduleAllowed}
            disabledReason={scheduleDisabledReason}
            hasEnteredFlat={hasEnteredFlat}
            estimatedArrivalTime={estimatedArrivalTime}
            allowedFromTime={allowedFromTime}
          />
        </TabsContent>

        {/* Tab 3: COFFEE ONLY */}
        <TabsContent value="coffee" className="space-y-4 pt-2">
          <DeviceCard
            title="Cafeteira Elétrica Express"
            description="Tomada Tuya 16A com proteção térmica NBR 14136"
            power={coffeePower}
            onTogglePower={handleToggleCoffee}
            disabled={!isScheduleAllowed}
            disabledReason={scheduleDisabledReason}
            thermalWarning={false}
            autoOffIndicator={true}
            countdownMinutes={countdownMinutesRemaining}
            hasEnteredFlat={hasEnteredFlat}
            estimatedArrivalTime={estimatedArrivalTime}
            allowedFromTime={allowedFromTime}
          />
        </TabsContent>

        {/* Tab 4: SECURITY ONLY */}
        <TabsContent value="security" className="space-y-4 pt-2">
          <FailSafeStatus
            hasEnteredFlat={hasEnteredFlat}
            estimatedArrivalTime={estimatedArrivalTime}
            allowedFromTime={allowedFromTime}
            shutoffAtTime={shutoffAtTime}
            warningActive={isWarningActive}
            shutoffTriggered={shutoffTriggered}
            shutoffReason={shutoffReason}
            countdownMinutesRemaining={countdownMinutesRemaining}
            devicesActive={isAnyDeviceOn}
            onConfirmEntrance={handleConfirmEntrance}
            onUpdateEta={setEstimatedArrivalTime}
          />
        </TabsContent>

        {/* Tab 5: MUSIC ONLY */}
        <TabsContent value="music" className="space-y-4 pt-2">
          <WelcomeMusicPlayer
            state={{
              isPlaying: musicPlaying,
              autoTriggered: autoTriggerMusic,
              volume: musicVolume,
              currentTrackIndex: currentTrackIdx,
              currentTrack: DEFAULT_TRACKS[currentTrackIdx].title,
              tracks: DEFAULT_TRACKS,
            }}
            onTogglePlay={handleTogglePlayMusic}
            onChangeVolume={setMusicVolume}
            onNextTrack={handleNextTrack}
            onPrevTrack={handlePrevTrack}
            onSelectTrack={setCurrentTrackIdx}
            checkinTime={checkinTime}
            isCheckinDay={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
