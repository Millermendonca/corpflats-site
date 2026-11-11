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
const TOLERANCE_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 horas
const INTER_SPEECH_PAUSE_MS = 400; // Pausa entre anúncios para clareza
const WATCHDOG_TIMEOUT_MS = 8000; // Máximo de 8s por frase para evitar congelamento

// Estado em memória do motor de voz
let isSpeaking = false;
let audioUnlocked = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let watchdogTimer: any = null;
const speechQueue: CheckoutAnnouncementItem[] = [];

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
    return user.role === "anserve_repositora";
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
          return parsed.role === "anserve_repositora";
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
 * Carrega conjunto de IDs e chaves compostas de check-outs já anunciados por voz
 */
export function getSpokenCheckoutsMap(): Record<string, SpokenCheckoutRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SPOKEN);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {}
  return {};
}

/**
 * Salva e limpa registros antigos (> 48h) do localStorage para manter leve
 */
function saveSpokenCheckoutsMap(map: Record<string, SpokenCheckoutRecord>): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const cleanMap: Record<string, SpokenCheckoutRecord> = {};
    for (const [key, item] of Object.entries(map)) {
      const ts = new Date(item.spokenAt || item.occurredAt || 0).getTime();
      // Mantém últimos 2 dias (48h)
      if (now - ts < 48 * 60 * 60 * 1000) {
        cleanMap[key] = item;
      }
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
  const flat = String(item.flatNumber || "").trim().toLowerCase();
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
  const map = getSpokenCheckoutsMap();
  const directKey = item.id ? `notif_${item.id}` : "";
  const codeKey = item.reservationCode
    ? `code_${item.reservationCode}_${String(item.flatNumber).trim().toLowerCase()}_${item.todayYmd || getBrasiliaTodayYmd()}`
    : "";
  const flatKey = `flat_${String(item.flatNumber).trim().toLowerCase()}_${item.todayYmd || getBrasiliaTodayYmd()}`;

  if (directKey && map[directKey]) return true;
  if (codeKey && map[codeKey]) return true;
  if (map[flatKey]) return true;
  return false;
}

/**
 * Registra check-out como anunciado com persistência local à prova de reload
 */
export function markCheckoutAsSpoken(item: CheckoutAnnouncementItem): void {
  const map = getSpokenCheckoutsMap();
  const nowIso = new Date().toISOString();
  const record: SpokenCheckoutRecord = {
    id: String(item.id),
    flatNumber: item.flatNumber,
    spokenAt: nowIso,
    occurredAt: item.occurredAt
  };

  const primaryKey = item.id ? `notif_${item.id}` : buildCheckoutDedupeKey(item);
  map[primaryKey] = record;

  // Chaves secundárias para blindar contra repetição em rotas e endpoints diferentes
  const flatKey = `flat_${String(item.flatNumber).trim().toLowerCase()}_${getBrasiliaTodayYmd()}`;
  map[flatKey] = record;

  if (item.reservationCode) {
    const codeKey = `code_${item.reservationCode}_${String(item.flatNumber).trim().toLowerCase()}_${getBrasiliaTodayYmd()}`;
    map[codeKey] = record;
  }

  saveSpokenCheckoutsMap(map);
}

/**
 * Valida a janela de tolerância: check-out deve ser de HOJE e ter ocorrido
 * nos últimos 240 minutos (4 horas). Eventos mais antigos são descartados.
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
  }

  // Se só tiver horário no formato HH:MM (ex: "11:30")
  if (checkoutTimeStr && /^\d{1,2}:\d{2}$/.test(checkoutTimeStr.trim())) {
    const [h, m] = checkoutTimeStr.trim().split(":").map(Number);
    const now = new Date(referenceNowMs);
    const checkoutDate = new Date(now);
    checkoutDate.setHours(h, m, 0, 0);

    const diffMs = referenceNowMs - checkoutDate.getTime();
    if (diffMs > TOLERANCE_WINDOW_MS) {
      return false;
    }
    if (diffMs < -5 * 60 * 1000) {
      return false;
    }
    return true;
  }

  // Sem timestamp confiável recente: permite se for evento em tempo real
  return true;
}

/**
 * Desbloqueia o áudio da Web Speech API na primeira interação do usuário (touch/click/key)
 */
export function unlockSpeechAudio(): void {
  if (audioUnlocked || typeof window === "undefined") return;
  try {
    if ("speechSynthesis" in window) {
      // Pequeno comando de inicialização sem volume audível para conceder autoplay
      window.speechSynthesis.resume();
      audioUnlocked = true;
      // Dispara fila pendente se houver
      processNextInQueue();
    }
  } catch {}
}

/**
 * Enfileira anúncio de check-out no formato "Check-out flat {número}"
 */
export function enqueueCheckoutAnnouncement(item: CheckoutAnnouncementItem): boolean {
  if (!item || !item.flatNumber) return false;

  // Deduplicação imediata
  if (isCheckoutAlreadySpoken(item)) {
    return false;
  }

  // Evita duplicatas na própria fila em espera
  const alreadyInQueue = speechQueue.some(
    q =>
      (q.id && q.id === item.id) ||
      (String(q.flatNumber).trim() === String(item.flatNumber).trim())
  );
  if (alreadyInQueue) {
    return false;
  }

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

  // Dupla conferência contra repetições
  if (isCheckoutAlreadySpoken(currentItem)) {
    speechQueue.shift();
    setTimeout(processNextInQueue, 50);
    return;
  }

  isSpeaking = true;

  try {
    const flatNumClean = String(currentItem.flatNumber).trim();
    const spokenText = `Check-out flat ${flatNumClean}`;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Seleciona voz em português se disponível no navegador
    const voices = window.speechSynthesis.getVoices?.() || [];
    const ptVoice = voices.find(
      v => (v.lang && (v.lang.toLowerCase().startsWith("pt-br") || v.lang.toLowerCase().startsWith("pt_br"))) ||
           (v.name && v.name.toLowerCase().includes("brazil") || v.name.toLowerCase().includes("portuguese"))
    );
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    // Retém referência de escopo global para impedir Garbage Collection no Chromium
    activeUtterance = utterance;

    const cleanup = () => {
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      activeUtterance = null;
      markCheckoutAsSpoken(currentItem);
      speechQueue.shift();
      isSpeaking = false;
      // Pausa natural de 400ms antes de anunciar o próximo quarto
      setTimeout(processNextInQueue, INTER_SPEECH_PAUSE_MS);
    };

    utterance.onend = () => {
      cleanup();
    };

    utterance.onerror = (e) => {
      console.warn("[Voice Notifier] Erro na síntese de voz:", e);
      cleanup();
    };

    // Watchdog de 8 segundos caso o navegador trave silenciosamente
    watchdogTimer = setTimeout(() => {
      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.resume();
        }
      } catch {}
      cleanup();
    }, WATCHDOG_TIMEOUT_MS);

    // Destrava se estiver em estado pausado do Chrome
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("[Voice Notifier] Exceção ao disparar speak:", err);
    markCheckoutAsSpoken(currentItem);
    speechQueue.shift();
    isSpeaking = false;
    setTimeout(processNextInQueue, 100);
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

    // Consulta endpoint de notificações categorizado em checkout
    const res = await fetch("/api/notifications?category=checkout&limit=50", {
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
          const flatNum = n.metadata?.flatNumber || (n.title?.match(/(?:Apt|Flat)\s*(\d+)/i)?.[1]);
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
          const tsA = new Date(a.createdAt || a.timestamp || 0).getTime();
          const tsB = new Date(b.createdAt || b.timestamp || 0).getTime();
          return tsA - tsB;
        });

      for (const c of candidates) {
        const flatNum = String(c.metadata?.flatNumber || (c.title?.match(/(?:Apt|Flat)\s*(\d+)/i)?.[1])).trim();
        const enqueued = enqueueCheckoutAnnouncement({
          id: String(c.id),
          flatNumber: flatNum,
          occurredAt: c.createdAt,
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

  // Consulta complementar via checkoutSummary do status dos flats do frigobar
  try {
    const resFlats = await fetch("/api/minibar/inspections/flats-status", {
      credentials: "include"
    });
    if (resFlats.ok) {
      const json = await resFlats.json();
      const doneCheckouts: any[] = json?.checkoutSummary?.doneCheckouts || [];
      for (const d of doneCheckouts) {
        const flatNum = String(d.flatNumber || "").trim();
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
 * Função de teste direto de anúncio por voz (utilizada no botão do painel)
 */
export function testVoiceAnnouncement(flatNumber: string = "1004"): boolean {
  unlockSpeechAudio();
  const testId = `test_${Date.now()}`;
  return enqueueCheckoutAnnouncement({
    id: testId,
    flatNumber,
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
