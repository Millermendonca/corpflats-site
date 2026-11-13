import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Music,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Volume1,
  Radio,
  Sparkles,
  Info,
  ListMusic,
} from 'lucide-react';
import { WelcomePlaylistState, AudioTrack } from './types';

export interface WelcomeMusicPlayerProps {
  state: WelcomePlaylistState;
  onTogglePlay: (nextPlaying: boolean) => void;
  onChangeVolume: (volume: number) => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onSelectTrack: (index: number) => void;
  checkinTime?: string;
  isCheckinDay?: boolean;
}

export function WelcomeMusicPlayer({
  state,
  onTogglePlay,
  onChangeVolume,
  onNextTrack,
  onPrevTrack,
  onSelectTrack,
  checkinTime = '14:00',
  isCheckinDay = true,
}: WelcomeMusicPlayerProps) {
  const [showPlaylist, setShowPlaylist] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const currentTrack = state.tracks[state.currentTrackIndex] || state.tracks[0] || {
    id: 'track-1',
    title: 'Soho Bossa Lounge',
    artist: 'CorpFlats Acoustic Sessions',
    duration: '3:45',
  };

  // Soft synth chime generator for realistic sound in browser without external CDN dependencies
  const startGentleSound = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (audioContextRef.current && !oscillatorRef.current) {
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // Gentle A3 chord
        
        // Gentle volume mapping
        const currentGain = Math.max(0.001, (state.volume / 100) * 0.05);
        gain.gain.setValueAtTime(currentGain, ctx.currentTime);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        oscillatorRef.current = osc;
        gainNodeRef.current = gain;
      }
    } catch {
      // AudioContext could be blocked by autoplay policies
    }
  };

  const stopGentleSound = () => {
    try {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        oscillatorRef.current = null;
      }
    } catch {
      // Ignore audio teardown exceptions
    }
  };

  useEffect(() => {
    if (state.isPlaying) {
      startGentleSound();
    } else {
      stopGentleSound();
    }
    return () => {
      stopGentleSound();
    };
  }, [state.isPlaying]);

  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      const currentGain = Math.max(0.0001, (state.volume / 100) * 0.05);
      gainNodeRef.current.gain.setValueAtTime(currentGain, audioContextRef.current.currentTime);
    }
  }, [state.volume]);

  const handlePlayPause = () => {
    onTogglePlay(!state.isPlaying);
  };

  return (
    <Card className="overflow-hidden border border-border/60 shadow-sm transition-all hover:shadow-md bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                state.isPlaying
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Music className={`h-6 w-6 ${state.isPlaying ? 'animate-bounce' : ''}`} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold flex flex-wrap items-center gap-2">
                <span>Trilha Sonora de Boas-Vindas</span>
                {state.isPlaying && (
                  <span className="flex h-2 w-2 rounded-full bg-purple-500 animate-ping shrink-0" />
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Música ambiente automática a partir das {checkinTime} no dia do check-in
              </CardDescription>
            </div>
          </div>

          <Badge
            variant={state.isPlaying ? 'default' : 'secondary'}
            className={`shrink-0 ${state.isPlaying ? 'bg-purple-600 text-white' : ''}`}
          >
            {state.isPlaying ? 'Tocando Agora' : 'Pausado'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Auto-Trigger Info Banner */}
        {state.autoTriggered && (
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2.5 text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2">
            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-purple-600" />
            <div>
              <p className="font-semibold text-[12px]">Boas-Vindas Automáticas Ativadas</p>
              <p className="text-[11px] opacity-90">
                A trilha sonora suave iniciou automaticamente às {checkinTime} para acolher sua chegada ao Soho Residence Service.
              </p>
            </div>
          </div>
        )}

        {/* Current Track Display & Waveform */}
        <div className="rounded-xl border bg-gradient-to-br from-purple-500/5 via-primary/5 to-transparent p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="space-y-0.5 flex-1 min-w-0 pr-3">
              <p className="text-sm font-bold text-foreground truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentTrack.artist}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPlaylist(!showPlaylist)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ListMusic className="h-4 w-4" />
              <span>Playlist ({state.tracks.length})</span>
            </Button>
          </div>

          {/* Equalizer animation bar */}
          <div className="flex items-center justify-center gap-1.5 h-8 my-2">
            {[40, 75, 55, 90, 65, 30, 85, 45, 95, 60, 35, 80].map((height, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-300 ${
                  state.isPlaying
                    ? 'bg-purple-500 dark:bg-purple-400 animate-pulse'
                    : 'bg-muted-foreground/30 h-1.5'
                }`}
                style={{
                  height: state.isPlaying ? `${Math.max(15, (height * state.volume) / 100)}%` : '6px',
                  animationDelay: `${i * 120}ms`,
                  animationDuration: '600ms',
                }}
              />
            ))}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-border/60 hover:bg-muted"
              onClick={onPrevTrack}
              aria-label="Faixa anterior"
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              className="h-12 w-12 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-md active:scale-95 transition-all"
              onClick={handlePlayPause}
              aria-label={state.isPlaying ? 'Pausar música' : 'Reproduzir música'}
            >
              {state.isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-border/60 hover:bg-muted"
              onClick={onNextTrack}
              aria-label="Próxima faixa"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Volume Slider */}
          <div className="flex items-center gap-3 pt-3 px-2">
            <button
              type="button"
              onClick={() => onChangeVolume(state.volume === 0 ? 35 : 0)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Alternar mudo"
            >
              {state.volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : state.volume < 50 ? (
                <Volume1 className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <Slider
              value={[state.volume]}
              min={0}
              max={100}
              step={1}
              onValueChange={(val) => onChangeVolume(val[0])}
              className="flex-1 cursor-pointer"
              aria-label="Controle de volume"
            />
            <span className="text-[11px] font-mono font-medium text-muted-foreground w-8 text-right">
              {state.volume}%
            </span>
          </div>
        </div>

        {/* Playlist Drawer / List */}
        {showPlaylist && (
          <div className="rounded-xl border border-border/60 divide-y divide-border/50 max-h-48 overflow-y-auto bg-background/50">
            {state.tracks.map((track, idx) => {
              const isSelected = idx === state.currentTrackIndex;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onSelectTrack(idx)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/50 transition-colors ${
                    isSelected ? 'bg-purple-500/10 font-semibold text-purple-700 dark:text-purple-300' : 'text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[11px] text-muted-foreground font-mono w-4">
                      {idx + 1}
                    </span>
                    <span className="truncate">{track.title}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono ml-2">
                    {track.duration}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Smart Speaker IoT Note */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2">
          <span className="flex items-center gap-1">
            <Radio className="h-3 w-3" />
            Amazon Echo Pop / Dot Alexa no flat
          </span>
          <span>Som ambiente suave</span>
        </div>
      </CardContent>
    </Card>
  );
}
