// Utilitário de Som Web Audio API Nativo para Alertas do Hotel e Mensagens WhatsApp
export function playHotelChime(type: "urgent" | "normal" = "normal") {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()

    if (type === "urgent") {
      // Tom de Atenção / Avaria (Dois tons rápidos vibrantes)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime)
      osc1.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12)
      
      gain1.gain.setValueAtTime(0.3, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)

      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start()
      osc1.stop(ctx.currentTime + 0.6)
    } else {
      // Ding Suave de Hotel (Glockenspiel / Recepção)
      const notes = [523.25, 659.25, 783.99]
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "triangle"
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08)

        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.08)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.7)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + idx * 0.08)
        osc.stop(ctx.currentTime + idx * 0.08 + 0.7)
      })
    }
  } catch (e) {
    // Ignora restrições de autoplay silenciosamente
  }
}

/**
 * Toca o som característico do WhatsApp ao receber mensagem:
 * - Se `isActiveConversation === true` (conversa já aberta na tela): toca um "pop" suave de mensagem na conversa.
 * - Se `isActiveConversation === false` (nova mensagem de outra conversa ou segundo plano): toca o duplo chime cristalino estilo WhatsApp.
 */
export function playWhatsAppIncomingSound(isActiveConversation = false) {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const now = ctx.currentTime

    if (isActiveConversation) {
      // "Pop" suave de mensagem recebida na conversa aberta
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(420, now)
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.065)

      gain.gain.setValueAtTime(0.16, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.085)
      return
    }

    // Notificação estilo WhatsApp: Gota ascendente + Harmônico cristalino (D5 -> A5 -> D6)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = "sine"
    osc1.frequency.setValueAtTime(587.33, now) // D5
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.09) // A5

    gain1.gain.setValueAtTime(0.28, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.18)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.19)

    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(1174.66, now + 0.11) // D6

    gain2.gain.setValueAtTime(0.32, now + 0.11)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.11)
    osc2.stop(now + 0.46)
  } catch {
    // Ignora restrições de autoplay silenciosamente
  }
}

/**
 * Toca o "pop" sutil ao enviar mensagem no WhatsApp Chat
 */
export function playWhatsAppOutgoingSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(320, now)
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.045)

    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.06)
  } catch {}
}
