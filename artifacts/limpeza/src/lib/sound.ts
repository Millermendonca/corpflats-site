// Utilitário de Som Web Audio API Nativo para Alertas do Hotel
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
