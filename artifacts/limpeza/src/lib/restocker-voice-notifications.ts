// ══════════════════════════════════════════════════════════════════════════════
// Guest Flow Manager - Resilient Restocker Voice Notification System (Web Speech)
// ══════════════════════════════════════════════════════════════════════════════
// Exclusively announces room check-outs ("Check-out flat {number}") in real time
// for authenticated restockers (role 'anserve_repositora'), with fail-safe
// offline synchronization (up to 4-hour tolerance window) and strict deduplication.

export interface CheckoutAnnouncementItem {
  id: string;
  flatNumber: string;
  occurredAt?: string;
  checkoutTime?: string;
  reservationCode?: string;
  guestName?: string;
}

export interface SpokenCheckoutRecord {
  id: string;
  flatNumber: string;
  spokenAt: string;
  occurredAt?: string;
}

const STORAGE_KEY_SPOKEN = "corpflats_restocker_spoken_checkouts_v1";
const STORAGE_KEY_RADIO_MODE = "corpflats_restocker_radio_mode_v1";
const TOLERANCE_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 horas
const INTER_SPEECH_PAUSE_MS = 400; // Pausa entre anúncios para clareza
const WATCHDOG_TIMEOUT_MS = 8000; // Máximo de 8s por frase para evitar congelamento
const HTTP_FETCH_TIMEOUT_MS = 8000; // Timeout de requisições de rede para resiliência

// Regex robusto para extração e limpeza de prefixos de acomodação (apto, flat, etc.)
export const FLAT_PREFIX_REGEX = /^(?:apartamento|apto|apt|quarto|flat|uh|unidade)\b\.?\s*/i;
export const FLAT_TITLE_REGEX = /(?:apartamento|apto|apt|quarto|flat|uh|unidade)\b\.?\s*([A-Za-z0-9\-]+)/i;

/**
 * Sanitiza o identificador do flat removendo prefixos textuais comuns sem truncamento
 */
export function cleanFlatNumber(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "undefined" || s.toLowerCase() === "null") return "";
  return s.replace(FLAT_PREFIX_REGEX, "").trim();
}

// Estado em memória do motor de voz e Modo Rádio (Tela Bloqueada)
let isSpeaking = false;
let audioUnlocked = false;
let radioKeepAliveRunning = false;
let radioKeepAliveAudio: HTMLAudioElement | null = null;
let ttsPlaybackAudio: HTMLAudioElement | null = null;
let screenWakeLockSentinel: any = null;
let webLockReleaseResolver: (() => void) | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let watchdogTimer: any = null;
let interSpeechTimer: any = null;
let cachedSilentWavUri: string | null = null;
const speechQueue: CheckoutAnnouncementItem[] = [];

// Cache em memória de check-outs já anunciados (resiliência contra indisponibilidade/falha do localStorage)
const inMemorySpokenMap: Record<string, SpokenCheckoutRecord> = {};

/**
 * Retorna a data no fuso de Brasília no formato YYYY-MM-DD
 */
export function getBrasiliaTodayYmd(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Validação estrita de perfil: apenas repositoras recebem anúncios por voz.
 * Usuários dev, admin, recepção, camareira e gestores são terminantemente excluídos.
 */
export function isRestockerProfile(user?: { role?: string } | null): boolean {
  // 1. Se o usuário estiver presente com papel definido:
  if (user && user.role) {
    return String(user.role).toLowerCase().trim() === "anserve_repositora";
  }

  // 2. Se não houver objeto user direto, verifica sessão em cache
  try {
    if (typeof window !== "undefined") {
      const raw =
        sessionStorage.getItem("gfm_auth_user_session_v1") ||
        localStorage.getItem("gfm_auth_user_session_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role) {
          return String(parsed.role).toLowerCase().trim() === "anserve_repositora";
        }
      }
    }
  } catch {}

  // 3. Verifica token de PIN do Portal da Repositora (/frigobar-reposicao)
  try {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("corpflats_anserve_token");
      if (token) {
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Carrega conjunto de IDs e chaves compostas de check-outs já anunciados por voz,
 * fundindo o cache em memória com o armazenamento local persistente.
 */
export function getSpokenCheckoutsMap(): Record<string, SpokenCheckoutRecord> {
  const merged: Record<string, SpokenCheckoutRecord> = { ...inMemorySpokenMap };
  if (typeof window === "undefined") return merged;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SPOKEN);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.assign(merged, parsed);
      }
    }
  } catch {}
  return merged;
}

/**
 * Salva e limpa registros antigos (> 48h) no cache em memória e no localStorage para manter leve
 */
function saveSpokenCheckoutsMap(map: Record<string, SpokenCheckoutRecord>): void {
  const now = Date.now();
  for (const [key, item] of Object.entries(map)) {
    if (!item) continue;
    const ts = new Date(item.spokenAt || item.occurredAt || 0).getTime();
    if (now - ts < 48 * 60 * 60 * 1000) {
      inMemorySpokenMap[key] = item;
    } else {
      delete inMemorySpokenMap[key];
    }
  }

  if (typeof window === "undefined") return;
  try {
    const cleanMap: Record<string, SpokenCheckoutRecord> = {};
    for (const [key, item] of Object.entries(inMemorySpokenMap)) {
      cleanMap[key] = item;
    }
    localStorage.setItem(STORAGE_KEY_SPOKEN, JSON.stringify(cleanMap));
  } catch {}
}

/**
 * Monta chave única canônica para deduplicação absoluta
 */
export function buildCheckoutDedupeKey(item: {
  id?: string | number;
  flatNumber: string;
  reservationCode?: string;
  todayYmd?: string;
}): string {
  const flat = cleanFlatNumber(item.flatNumber).toLowerCase();
  const today = item.todayYmd || getBrasiliaTodayYmd();
  if (item.id) {
    return `notif_${item.id}`;
  }
  if (item.reservationCode) {
    return `code_${item.reservationCode}_${flat}_${today}`;
  }
  return `flat_${flat}_${today}`;
}

/**
 * Verifica se um check-out já foi anunciado por voz anteriormente
 */
export function isCheckoutAlreadySpoken(item: {
  id?: string | number;
  flatNumber: string;
  reservationCode?: string;
  todayYmd?: string;
}): boolean {
  const isTest = String(item.id || "").startsWith("test_");
  const map = getSpokenCheckoutsMap();
  const directKey = item.id ? `notif_${item.id}` : "";
  if (directKey && map[directKey]) return true;

  // Se for teste de som manual, não é bloqueado por anúncios de saídas reais
  if (isTest) return false;

  const flatClean = cleanFlatNumber(item.flatNumber).toLowerCase();
  const today = item.todayYmd || getBrasiliaTodayYmd();

  if (item.reservationCode) {
    const codeKey = `code_${item.reservationCode}_${flatClean}_${today}`;
    if (map[codeKey]) return true;
  }

  if (flatClean) {
    const flatKey = `flat_${flatClean}_${today}`;
    if (map[flatKey]) return true;
  }

  return false;
}

/**
 * Registra check-out como anunciado com persistência local à prova de reload
 */
export function markCheckoutAsSpoken(item: CheckoutAnnouncementItem): void {
  const isTest = String(item.id || "").startsWith("test_");
  const map = getSpokenCheckoutsMap();
  const nowIso = new Date().toISOString();
  const flatClean = cleanFlatNumber(item.flatNumber);

  const record: SpokenCheckoutRecord = {
    id: String(item.id),
    flatNumber: flatClean,
    spokenAt: nowIso,
    occurredAt: item.occurredAt
  };

  const primaryKey = item.id ? `notif_${item.id}` : buildCheckoutDedupeKey(item);
  map[primaryKey] = record;

  // Não polui chaves reais de flat do dia para cliques de teste
  if (!isTest && flatClean) {
    const today = getBrasiliaTodayYmd();
    const flatKey = `flat_${flatClean.toLowerCase()}_${today}`;
    map[flatKey] = record;

    if (item.reservationCode) {
      const codeKey = `code_${item.reservationCode}_${flatClean.toLowerCase()}_${today}`;
      map[codeKey] = record;
    }
  }

  saveSpokenCheckoutsMap(map);
}

/**
 * Valida a janela de tolerância: check-out deve ser de HOJE e ter ocorrido
 * nos últimos 240 minutos (4 horas). Eventos mais antigos são rigorosamente descartados.
 */
export function isCheckoutWithinTolerance(
  occurredAt?: string | null,
  checkoutTimeStr?: string | null,
  referenceNowMs: number = Date.now()
): boolean {
  const todayYmd = getBrasiliaTodayYmd();

  if (occurredAt) {
    const d = new Date(occurredAt);
    const ts = d.getTime();
    if (!isNaN(ts)) {
      // 1. Deve ser da data de hoje (Brasília)
      let itemYmd = "";
      try {
        itemYmd = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(d);
      } catch {
        itemYmd = d.toISOString().slice(0, 10);
      }

      if (itemYmd !== todayYmd) {
        return false;
      }

      // 2. Não pode ser mais antigo que 4 horas
      const ageMs = referenceNowMs - ts;
      if (ageMs > TOLERANCE_WINDOW_MS) {
        return false;
      }

      // Tolera até 5 minutos no futuro (pequena diferença de relógio)
      if (ageMs < -5 * 60 * 1000) {
        return false;
      }

      return true;
    }
    // Timestamp fornecido mas inválido (ex: "invalid-date") -> descarta
    return false;
  }

  // Se só tiver horário no formato HH:MM, HH:MM:SS ou 11h30 (fuso de Brasília)
  if (checkoutTimeStr) {
    const match = checkoutTimeStr.trim().match(/^(\d{1,2})[:h](\d{2})(?::(\d{2}))?(?:\s*(?:min|m))?$/i);
    if (match) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      const s = Number(match[3] || 0);

      if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const checkoutIso = `${todayYmd}T${pad(h)}:${pad(m)}:${pad(s)}-03:00`;
        const checkoutTs = new Date(checkoutIso).getTime();

        if (!isNaN(checkoutTs)) {
          const diffMs = referenceNowMs - checkoutTs;
          if (diffMs > TOLERANCE_WINDOW_MS) {
            return false;
          }
          if (diffMs < -5 * 60 * 1000) {
            return false;
          }
          return true;
        }
      }
    }
    // Formato de hora não reconhecido (ex: "hoje", etc.)
    return false;
  }

  // Sem timestamp ou horário válido: descarta para garantir regra de 4h (R2)
  return false;
}

/**
 * Gera um URI WAV PCM 8kHz mono silencioso (0.5s, ponto médio 0x80 sem ruído)
 * para manter a MediaSession do Modo Rádio viva quando o celular bloqueia a tela.
 */
function getSilentKeepAliveWavUri(): string {
  if (cachedSilentWavUri) return cachedSilentWavUri;
  const sampleRate = 8000;
  const numSamples = 4000; // 0.5 segundo
  const byteSize = 44 + numSamples;
  const bytes = new Uint8Array(byteSize);
  const view = new DataView(bytes.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) bytes[offset + i] = str.charCodeAt(i);
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // ByteRate
  view.setUint16(32, 1, true); // BlockAlign
  view.setUint16(34, 8, true); // BitsPerSample = 8
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);
  bytes.fill(0x80, 44); // 0x80 = silêncio absoluto em PCM 8-bit unsigned

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : "";
  cachedSilentWavUri = `data:audio/wav;base64,${b64}`;
  return cachedSilentWavUri;
}

/**
 * Verifica se o Modo Rádio (fala com tela bloqueada) está habilitado para a repositora (padrão: true).
 */
export function isRadioModeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RADIO_MODE);
    if (raw === null) return true;
    return raw !== "false" && raw !== "0";
  } catch {
    return true;
  }
}

export function isRadioKeepAliveActive(): boolean {
  return radioKeepAliveRunning;
}

/**
 * Ativa ou desativa o Modo Rádio (canal de áudio persistente em 2º plano para tela bloqueada).
 */
export function setRadioModeEnabled(enabled: boolean): boolean {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_RADIO_MODE, enabled ? "true" : "false");
    } catch {}
  }
  if (enabled) {
    startRestockerRadioKeepAlive();
  } else {
    stopRestockerRadioKeepAlive();
  }
  return enabled;
}

/**
 * Inicia o canal silencioso de MediaSession + Web Lock para impedir que Android/iOS
 * congelem o áudio quando a repositora bloqueia a tela e guarda o celular no bolso.
 */
export function startRestockerRadioKeepAlive(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  if (!isRestockerProfile() || !isRadioModeEnabled()) return;

  try {
    const silentUri = getSilentKeepAliveWavUri();

    if (!radioKeepAliveAudio) {
      radioKeepAliveAudio = new Audio(silentUri);
      radioKeepAliveAudio.loop = true;
      radioKeepAliveAudio.volume = 0.01;
      (radioKeepAliveAudio as any).playsInline = true;
    }

    if (!ttsPlaybackAudio) {
      ttsPlaybackAudio = new Audio(silentUri);
      ttsPlaybackAudio.volume = 1.0;
      (ttsPlaybackAudio as any).playsInline = true;
      // Destrava o elemento <audio> de TTS na interação do usuário
      ttsPlaybackAudio.play().then(() => {
        ttsPlaybackAudio?.pause();
      }).catch(() => {});
    }

    const playPromise = radioKeepAliveAudio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          radioKeepAliveRunning = true;
          try {
            if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: "Rádio Check-out Ativo",
                artist: "CorpFlats • Perfil Repositora",
                album: "Alertas por Voz em Tempo Real"
              });
              navigator.mediaSession.playbackState = "playing";
            }
          } catch {}
        })
        .catch(() => {});
    }

    // Segura Web Lock para evitar congelamento da aba em 2º plano no Android Chrome
    const navAny = navigator as any;
    if (!webLockReleaseResolver && navAny?.locks && typeof navAny.locks.request === "function") {
      navAny.locks
        .request("corpflats_restocker_radio_lock", () => {
          return new Promise<void>((resolve) => {
            webLockReleaseResolver = resolve;
          });
        })
        .catch(() => {});
    }

    // Solicita Screen Wake Lock enquanto o painel estiver aberto no carrinho
    if (!screenWakeLockSentinel && navAny?.wakeLock && typeof navAny.wakeLock.request === "function" && typeof document !== "undefined" && !document.hidden) {
      navAny.wakeLock
        .request("screen")
        .then((sentinel: any) => {
          screenWakeLockSentinel = sentinel;
          sentinel?.addEventListener?.("release", () => {
            screenWakeLockSentinel = null;
          });
        })
        .catch(() => {});
    }
  } catch {}
}

export function stopRestockerRadioKeepAlive(): void {
  radioKeepAliveRunning = false;
  try {
    if (radioKeepAliveAudio) {
      radioKeepAliveAudio.pause();
    }
  } catch {}
  try {
    if (webLockReleaseResolver) {
      webLockReleaseResolver();
      webLockReleaseResolver = null;
    }
  } catch {}
  try {
    if (screenWakeLockSentinel) {
      screenWakeLockSentinel.release?.().catch(() => {});
      screenWakeLockSentinel = null;
    }
  } catch {}
}

/**
 * Desbloqueia o áudio da Web Speech API e inicia o Modo Rádio na primeira interação do usuário
 * (touch/click/key) para conformidade estrita com políticas do Android Chrome e Safari iOS.
 */
export function unlockSpeechAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if (isRestockerProfile() && isRadioModeEnabled()) {
      startRestockerRadioKeepAlive();
    }
    if ("speechSynthesis" in window) {
      if (!audioUnlocked) {
        const silent = new SpeechSynthesisUtterance("");
        silent.volume = 0;
        silent.rate = 10;
        window.speechSynthesis.speak(silent);
        window.speechSynthesis.resume();
        audioUnlocked = true;
      } else if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
    processNextInQueue();
  } catch {}
}

/**
 * Enfileira anúncio de check-out no formato "Check-out flat {número}"
 */
export function enqueueCheckoutAnnouncement(item: CheckoutAnnouncementItem): boolean {
  if (!item) return false;

  const cleanFlat = cleanFlatNumber(item.flatNumber);
  if (!cleanFlat) {
    return false;
  }
  item.flatNumber = cleanFlat;

  // Deduplicação imediata
  if (isCheckoutAlreadySpoken(item)) {
    return false;
  }

  // Evita duplicatas na própria fila em espera
  const isTest = String(item.id || "").startsWith("test_");
  const alreadyInQueue = speechQueue.some(q => {
    const qIsTest = String(q.id || "").startsWith("test_");
    if (isTest && qIsTest) return true; // Já existe teste na fila
    if (!isTest && !qIsTest) {
      return (
        (q.id && q.id === item.id) ||
        (cleanFlatNumber(q.flatNumber).toLowerCase() === cleanFlat.toLowerCase())
      );
    }
    return false;
  });
  if (alreadyInQueue) {
    return false;
  }

  // Reserva imediata no storage para impedir que outra aba ou ciclo paralelo duplique
  markCheckoutAsSpoken(item);

  speechQueue.push(item);
  processNextInQueue();
  return true;
}

/**
 * Executa sequencialmente a fila de voz, garantindo zero sobreposição ou cancelamento
 */
function processNextInQueue(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    // Ambiente sem suporte: esvazia fila registrando como falado para evitar acúmulo
    while (speechQueue.length > 0) {
      const it = speechQueue.shift();
      if (it) markCheckoutAsSpoken(it);
    }
    return;
  }

  if (isSpeaking || speechQueue.length === 0) {
    return;
  }

  const currentItem = speechQueue[0];
  if (!currentItem) return;

  isSpeaking = true;

  try {
    const flatNumClean = cleanFlatNumber(currentItem.flatNumber);
    const spokenText = `Check-out flat ${flatNumClean}`;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Seleciona voz em português se disponível no navegador
    const voices = window.speechSynthesis.getVoices?.() || [];
    const ptVoice = voices.find(
      v =>
        (v.lang && (v.lang.toLowerCase().startsWith("pt-br") || v.lang.toLowerCase().startsWith("pt_br"))) ||
        (v.name && (v.name.toLowerCase().includes("brazil") || v.name.toLowerCase().includes("portuguese")))
    );
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    // Retém referência de escopo global para impedir Garbage Collection no Chromium
    activeUtterance = utterance;

    // Trava de idempotência estrita: impede limpeza dupla caso o cancel() dispare onerror
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      activeUtterance = null;
      markCheckoutAsSpoken(currentItem);
      speechQueue.shift();
      isSpeaking = false;
      // Pausa natural de 400ms apenas se houver próximos anúncios na fila
      if (speechQueue.length > 0) {
        if (interSpeechTimer) {
          clearTimeout(interSpeechTimer);
          interSpeechTimer = null;
        }
        interSpeechTimer = setTimeout(() => {
          interSpeechTimer = null;
          processNextInQueue();
        }, INTER_SPEECH_PAUSE_MS);
      }
    };

    utterance.onend = () => {
      cleanup();
    };

    utterance.onerror = (e) => {
      console.warn("[Voice Notifier] Erro na síntese de voz:", e);
      cleanup();
    };

    // Watchdog de 8 segundos com cancelamento explícito do motor em caso de congelamento
    watchdogTimer = setTimeout(() => {
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      cleanup();
    }, WATCHDOG_TIMEOUT_MS);

    const speakViaNativeWebSpeech = () => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        cleanup();
      }
    };

    // Modo Rádio (Tela Bloqueada / App em 2º plano): usa canal HTML5 <audio> desbloqueado
    // que toca na tela bloqueada do Android e iOS sem ser silenciado pelo SO, com fallback p/ speechSynthesis
    const isLockedOrBackground =
      typeof document !== "undefined" &&
      Boolean(document.hidden) &&
      isRadioModeEnabled() &&
      typeof Audio !== "undefined";

    if (isLockedOrBackground) {
      try {
        if (!ttsPlaybackAudio) {
          ttsPlaybackAudio = new Audio();
          (ttsPlaybackAudio as any).playsInline = true;
        }
        ttsPlaybackAudio.volume = 1.0;
        ttsPlaybackAudio.onended = () => {
          if (ttsPlaybackAudio) {
            ttsPlaybackAudio.onended = null;
            ttsPlaybackAudio.onerror = null;
          }
          cleanup();
        };
        ttsPlaybackAudio.onerror = () => {
          if (ttsPlaybackAudio) {
            ttsPlaybackAudio.onended = null;
            ttsPlaybackAudio.onerror = null;
          }
          speakViaNativeWebSpeech();
        };
        ttsPlaybackAudio.src = `/api/tts/checkout?flat=${encodeURIComponent(flatNumClean)}`;
        const p = ttsPlaybackAudio.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            if (ttsPlaybackAudio) {
              ttsPlaybackAudio.onended = null;
              ttsPlaybackAudio.onerror = null;
            }
            speakViaNativeWebSpeech();
          });
        }
        return;
      } catch {
        speakViaNativeWebSpeech();
        return;
      }
    }

    speakViaNativeWebSpeech();
  } catch (err) {
    console.warn("[Voice Notifier] Exceção ao disparar speak:", err);
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
    activeUtterance = null;
    markCheckoutAsSpoken(currentItem);
    speechQueue.shift();
    isSpeaking = false;
    if (speechQueue.length > 0) {
      if (interSpeechTimer) {
        clearTimeout(interSpeechTimer);
        interSpeechTimer = null;
      }
      interSpeechTimer = setTimeout(() => {
        interSpeechTimer = null;
        processNextInQueue();
      }, 100);
    }
  }
}

// Sincronização entre abas via evento storage
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY_SPOKEN && e.newValue) {
      try {
        // Remove itens da fila local que foram processados por outra aba
        for (let i = speechQueue.length - 1; i >= 0; i--) {
          const it = speechQueue[i];
          if (it && isCheckoutAlreadySpoken(it)) {
            if (!(i === 0 && isSpeaking)) {
              speechQueue.splice(i, 1);
            }
          }
        }
      } catch {}
    }
  });
}

/**
 * Wrapper de fetch com timeout resiliente para evitar travamentos de socket
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = HTTP_FETCH_TIMEOUT_MS): Promise<Response> {
  if (typeof AbortController === "undefined") {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Motor de sincronização resiliente e recuperação de notificações offline.
 * Executa ciclo de consulta, filtra pela tolerância de 4h e enfileira check-outs pendentes.
 */
export async function syncAndRecoverCheckouts(user?: { role?: string } | null): Promise<number> {
  // R1: Apenas repositoras recebem anúncios
  if (!isRestockerProfile(user)) {
    return 0;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return 0;
  }

  let enqueuedCount = 0;
  const nowMs = Date.now();

  try {
    const headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const anserveToken = localStorage.getItem("corpflats_anserve_token");
      if (anserveToken) {
        headers["x-anserve-token"] = anserveToken;
      }
    }

    // Consulta endpoint de notificações categorizado em checkout com timeout resiliente
    const res = await fetchWithTimeout("/api/notifications?category=checkout&limit=50", {
      credentials: "include",
      headers
    });

    if (res.ok) {
      const data = await res.json();
      const notifs: any[] = Array.isArray(data.notifications) ? data.notifications : [];

      // Ordena cronologicamente para anunciar primeiro os mais antigos da janela de 4h
      const candidates = notifs
        .filter(n => {
          if (!n || n.category !== "checkout") return false;
          const flatNum = cleanFlatNumber(
            n.metadata?.flatNumber ||
            (n.title?.match(FLAT_TITLE_REGEX)?.[1])
          );
          if (!flatNum) return false;

          // Deduplicação prévia
          if (isCheckoutAlreadySpoken({ id: n.id, flatNumber: flatNum, reservationCode: n.metadata?.code })) {
            return false;
          }

          // Validação da tolerância recente (até 4h hoje)
          const occurredAt = n.createdAt || n.timestamp || n.metadata?.actualCheckoutAt;
          const checkoutTimeStr = n.metadata?.checkoutTime || null;
          return isCheckoutWithinTolerance(occurredAt, checkoutTimeStr, nowMs);
        })
        .sort((a, b) => {
          const tsA = new Date(a.createdAt || a.timestamp || a.metadata?.actualCheckoutAt || 0).getTime();
          const tsB = new Date(b.createdAt || b.timestamp || b.metadata?.actualCheckoutAt || 0).getTime();
          return tsA - tsB;
        });

      for (const c of candidates) {
        const flatNum = cleanFlatNumber(
          c.metadata?.flatNumber ||
          (c.title?.match(FLAT_TITLE_REGEX)?.[1] || "")
        );
        const occurredAt = c.createdAt || c.timestamp || c.metadata?.actualCheckoutAt;
        const enqueued = enqueueCheckoutAnnouncement({
          id: String(c.id),
          flatNumber: flatNum,
          occurredAt: occurredAt || undefined,
          checkoutTime: c.metadata?.checkoutTime,
          reservationCode: c.metadata?.code,
          guestName: c.metadata?.guestName
        });
        if (enqueued) enqueuedCount++;
      }
    }
  } catch (err) {
    // Modo offline resiliente: silencia falhas de rede para retentar no evento 'online'
  }

  // Consulta complementar via checkoutSummary do status dos flats do frigobar com timeout resiliente
  try {
    const resFlats = await fetchWithTimeout("/api/minibar/inspections/flats-status", {
      credentials: "include"
    });
    if (resFlats.ok) {
      const json = await resFlats.json();
      const doneCheckouts: any[] = json?.checkoutSummary?.doneCheckouts || [];
      for (const d of doneCheckouts) {
        const flatNum = cleanFlatNumber(d.flatNumber);
        if (!flatNum) continue;

        if (isCheckoutAlreadySpoken({ id: d.id, flatNumber: flatNum, reservationCode: d.reservationCode })) {
          continue;
        }

        const occurredAt = d.actualCheckoutAt || null;
        const checkoutTimeStr = d.checkoutTime || null;
        if (!isCheckoutWithinTolerance(occurredAt, checkoutTimeStr, nowMs)) {
          continue;
        }

        const enqueued = enqueueCheckoutAnnouncement({
          id: d.id || `summary_${flatNum}_${getBrasiliaTodayYmd()}`,
          flatNumber: flatNum,
          occurredAt: occurredAt || undefined,
          checkoutTime: checkoutTimeStr || undefined,
          reservationCode: d.reservationCode,
          guestName: d.guestName
        });
        if (enqueued) enqueuedCount++;
      }
    }
  } catch {}

  return enqueuedCount;
}

/**
 * Processa instantaneamente um evento de Web Push recebido via Service Worker (GFM_PUSH_RECEIVED),
 * acionando a voz em menos de 100ms mesmo com a tela bloqueada (Modo Rádio).
 */
export function handleIncomingCheckoutPushPayload(
  payload: any,
  user?: { role?: string } | null
): boolean {
  if (!payload || !isRestockerProfile(user)) return false;
  const isCheckout =
    payload.category === "checkout" ||
    payload.type === "restocker_checkout" ||
    Boolean(payload.isRestockerCheckout);
  if (!isCheckout) return false;

  const flatNum = cleanFlatNumber(
    payload.flatNumber || (payload.title?.match(FLAT_TITLE_REGEX)?.[1] || "")
  );
  if (!flatNum) return false;

  const occurredAt = payload.createdAt || new Date().toISOString();
  const checkoutTime = payload.checkoutTime || null;
  if (!payload.isTest && !isCheckoutWithinTolerance(occurredAt, checkoutTime, Date.now())) {
    return false;
  }

  return enqueueCheckoutAnnouncement({
    id: payload.isTest ? `test_push_${Date.now()}` : String(payload.id || `push_${flatNum}_${Date.now()}`),
    flatNumber: flatNum,
    occurredAt,
    checkoutTime: checkoutTime || undefined,
    reservationCode: payload.reservationCode || undefined
  });
}

/**
 * Função de teste direto de anúncio por voz (utilizada no botão do painel)
 */
export function testVoiceAnnouncement(flatNumber: string = "1004"): boolean {
  unlockSpeechAudio();
  const testId = `test_${Date.now()}`;
  return enqueueCheckoutAnnouncement({
    id: testId,
    flatNumber: cleanFlatNumber(flatNumber),
    occurredAt: new Date().toISOString()
  });
}

/**
 * Diagnóstico de telemetria do motor de voz
 */
export function getVoiceNotifierState() {
  return {
    isSpeaking,
    audioUnlocked,
    queueLength: speechQueue.length,
    spokenCount: Object.keys(getSpokenCheckoutsMap()).length,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true
  };
}

/**
 * Reinicialização do estado em memória (utilizado em testes)
 */
export function resetVoiceNotifierForTesting(): void {
  isSpeaking = false;
  audioUnlocked = false;
  if (activeUtterance) {
    try {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
    } catch {}
    activeUtterance = null;
  }
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  if (interSpeechTimer) {
    clearTimeout(interSpeechTimer);
    interSpeechTimer = null;
  }
  speechQueue.length = 0;
  for (const k of Object.keys(inMemorySpokenMap)) {
    delete inMemorySpokenMap[k];
  }
}
