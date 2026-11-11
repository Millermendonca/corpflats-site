import { useEffect, useRef } from "react";
import { useGetMe } from "@workspace/api-client-react";
import {
  isRestockerProfile,
  syncAndRecoverCheckouts,
  unlockSpeechAudio
} from "@/lib/restocker-voice-notifications";

/**
 * Componente Global Invisível que orquestra a Notificação por Voz Exclusiva para Repositoras.
 * Permanece ativo por toda a aplicação e reage a eventos de reconexão de rede, foco da aba
 * e ciclo periódico resiliente para garantir recuperação sem perdas.
 */
export function RestockerVoiceNotifier() {
  const { data: user } = useGetMe();
  const isRestocker = isRestockerProfile(user);
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    // Escuta primeira interação para desbloquear áudio Web Speech no navegador
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

  useEffect(() => {
    // Se o usuário logado não for repositora, encerra o ciclo imediatamente
    if (!isRestocker) {
      return;
    }

    const triggerSync = async () => {
      if (syncInProgressRef.current) return;
      try {
        syncInProgressRef.current = true;
        await syncAndRecoverCheckouts(user);
      } finally {
        syncInProgressRef.current = false;
      }
    };

    // 1. Sincronização inicial imediata ao montar/autenticar
    triggerSync();

    // 2. Reconexão automática ao restabelecer conectividade de rede
    const handleOnline = () => {
      console.log("[Restocker Voice Notifier] Rede restabelecida (online). Recuperando check-outs pendentes...");
      triggerSync();
    };

    // 3. Recuperação ao retornar à aba ou reabrir tela
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        triggerSync();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 4. Polling resiliente contínuo a cada 12 segundos
    const intervalTimer = setInterval(triggerSync, 12000);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalTimer);
    };
  }, [isRestocker, user]);

  return null;
}
