export type AcMode = 'cool' | 'fan' | 'heat' | 'dry';
export type FanSpeed = 'auto' | 'low' | 'med' | 'high';

export interface DeviceState {
  power: boolean;
  lastChangedAt?: string;
  autoOffCountdownMinutes?: number;
  thermalWarning?: boolean;
}

export interface AcDeviceState extends DeviceState {
  targetTemperature: number; // 18 to 26
  currentTemperature: number;
  mode: AcMode;
  fanSpeed: FanSpeed;
}

export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  audioUrl?: string;
}

export interface WelcomePlaylistState {
  isPlaying: boolean;
  autoTriggered: boolean;
  volume: number; // 0 to 100
  currentTrackIndex: number;
  currentTrack: string;
  tracks: AudioTrack[];
}

export interface FailSafeState {
  isEntranceConfirmed: boolean;
  warningActive: boolean;
  warningMessage: string;
  shutoffTriggered: boolean;
  shutoffReason?: string;
  countdownMinutesRemaining?: number;
  allowedFromTime?: string;
  shutoffAtTime?: string;
}

export interface SmartFlatState {
  flatNumber: string;
  reservationCode?: string;
  guestName?: string;
  checkinDate?: string;
  checkinTime?: string; // e.g. "14:00"
  estimatedArrivalTime?: string; // e.g. "14:00"
  hasEnteredFlat: boolean;
  coffeeMaker: DeviceState;
  ac: AcDeviceState;
  welcomePlaylist: WelcomePlaylistState;
  failSafe: FailSafeState;
  simulatedTime?: string; // "HH:mm"
  simulatedMinutesOffset?: number;
  updatedAt?: string;
}
