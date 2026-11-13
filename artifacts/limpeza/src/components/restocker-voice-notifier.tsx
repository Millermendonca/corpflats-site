import { useEffect, useRef } from "react";
import { useGetMe } from "@workspace/api-client-react";
import {
  isRestockerProfile,
  syncAndRecoverCheckouts,
  unlockSpeechAudio,
  handleIncomingCheckoutPushPayload,
  startRestockerRadioKeepAlive,
  stopRestockerRadioKeepAlive,
  isRadioModeEnabled
} from "@/lib/restocker-voice-notifications";
import {
  registerServiceWorker,
  syncWebPushSubscription
} from "@/lib/push-notifications";

/**
 * Componente Global Invisível que:
 * 1) Registra o Service Worker v4 e sincroniza automaticamente a inscrição de Web Push Real (VAPID)
 *    para QUALQUER usuário autenticado (incluindo WhatsApp standalone e Portal da Repositora).
 * 2) Orquestra a Notificação por Voz + Modo Rádio (Tela Bloqueada) EXCLUSIVAMENTE para Repositoras.
 */
export function RestockerVoiceNotifier() {
  const { data: user } = useGetMe();
  const isRestocker = isRestockerProfile(user);
  const syncInProgressRef = useRef(false);
  const syncStartTimeRef = useRef(0);

  // 1. Registro global do Service Worker e sincronização automática de Web Push Real por perfil
  useEffect(() => {
    registerServiceWorker().catch(() => {});

    const hasSession = Boolean(user?.role) || isRestocker;
    if (!hasSession) return;

    const effectiveRole = user?.role || (isRestocker ? "anserve_repositora" : undefined);
    syncWebPushSubscription({ roleHint: effectiveRole }).catch(() => {});

    const handleOnlinePushSync = () => {
      syncWebPushSubscription({ roleHint: effectiveRole }).catch(() => {});
    };
    window.addEventListener("online", handleOnlinePushSync);
    return () => {
      window.removeEventListener("online", handleOnlinePushSync);
    };
  }, [user?.id, user?.role, isRestocker]);

  // 2. Desbloqueio de áudio (Web Speech + Modo Rádio para tela bloqueada) na primeira interação
  useEffect(() => {
    const handleUserGesture = () => {
      unlockSpeechAudio();
    };

    window.addEventListener("click", handleUserGesture, { passive: true, once: false });
    window.addEventListener("touchstart", handleUserGesture, { passive: true, once: false });
    window.addEventListener("keydown", handleUserGesture, { passive: true, once: false });

    return () => {
      window.removeEventListener("click", handleUserGesture);
      window.removeEventListener("touchstart", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, []);

  // 3. Motor exclusivo da Repositora (Voz + Modo Rádio + Recuperação Offline + Gatilho Push Instantâneo)
  useEffect(() => {
    if (!isRestocker) {
      stopRestockerRadioKeepAlive();
      return;
    }

    if (isRadioModeEnabled()) {
      startRestockerRadioKeepAlive();
    }

    const triggerSync = async () => {
      const now = Date.now();
      if (syncInProgressRef.current) {
        if (now - syncStartTimeRef.current > 15000) {
          syncInProgressRef.current = false;
        } else {
          return;
        }
      }

      try {
        syncInProgressRef.current = true;
        syncStartTimeRef.current = Date.now();
        await syncAndRecoverCheckouts(user);
      } finally {
        syncInProgressRef.current = false;
      }
    };

    // Sincronização inicial imediata ao autenticar
    triggerSync();

    // Gatilho em tempo real vindo do Web Push Real (funciona mesmo com tela bloqueada no Modo Rádio!)
    const handlePushReceived = (e: Event) => {
      const customEv = e as CustomEvent;
      const payload = customEv?.detail;
      if (payload) {
        const handled = handleIncomingCheckoutPushPayload(payload, user);
        if (!handled && payload.category === "checkout") {
          triggerSync();
        }
      }
    };

    // Reconexão automática ao restabelecer conectividade de rede
    const handleOnline = () => {
      if (isRadioModeEnabled()) {
        startRestockerRadioKeepAlive();
      }
      triggerSync();
    };

    // Recuperação ao retornar à aba / desbloquear tela + renovação de Wake Lock
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        if (isRadioModeEnabled()) {
          startRestockerRadioKeepAlive();
        }
        triggerSync();
      }
    };

    window.addEventListener("gfm:push-received", handlePushReceived as EventListener);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Polling resiliente contínuo a cada 12 segundos (continua vivo em 2º plano quando Modo Rádio ativo)
    const intervalTimer = setInterval(triggerSync, 12000);

    return () => {
      window.removeEventListener("gfm:push-received", handlePushReceived as EventListener);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalTimer);
    };
  }, [isRestocker, user]);

  return null;
}
