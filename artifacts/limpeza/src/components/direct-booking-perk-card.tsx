import { useState } from "react"
import {
  Sparkles,
  ExternalLink,
  UserPlus,
  Copy,
  Check,
  Star,
  ShieldCheck,
  Car,
  FileText,
  QrCode,
  RotateCcw,
} from "lucide-react"
import { trackDirectPerkClick } from "@/lib/analytics-tracking"

export interface DirectBookingPerkCardProps {
  portalSource: "guest_portal" | "guest_checkout" | "guest_breakfast" | "guest_minibar"
  channel?: string | null
  isB2b?: boolean
  variant?: "light" | "dark"
  compact?: boolean
  showGoogleReviewCta?: boolean
  className?: string
}

const GOOGLE_REVIEW_URL =
  "https://search.google.com/local/writereview?placeid=ChIJV6u4FRTVvQARAKQO7n-p-BA"

export function DirectBookingPerkCard({
  portalSource,
  channel,
  isB2b = false,
  variant = "light",
  compact = false,
  showGoogleReviewCta = false,
  className = "",
}: DirectBookingPerkCardProps) {
  const [copied, setCopied] = useState(false)

  const rawChannel = String(channel || "").toLowerCase().trim()
  const isOtaOrigin =
    rawChannel.includes("booking") ||
    rawChannel.includes("airbnb") ||
    rawChannel.includes("expedia") ||
    rawChannel.includes("decolar") ||
    rawChannel.includes("ota")

  const directSiteUrl = `https://corpflats.com.br/?utm_source=${encodeURIComponent(
    portalSource
  )}&utm_medium=in_stay_portal&utm_campaign=${isB2b ? "b2b_institutional" : "ota_to_direct"}`

  const safeTrack = (action: "open_site" | "save_vcard" | "copy_link" | "google_review") => {
    try {
      trackDirectPerkClick({
        portalSource,
        action,
        channel: channel || undefined,
      })
    } catch {
      // Never block user navigation or interaction if tracking fails
    }
  }

  const handleCopySite = async () => {
    safeTrack("copy_link")
    const shareUrl = "https://corpflats.com.br"
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const el = document.createElement("textarea")
        el.value = shareUrl
        el.style.position = "fixed"
        el.style.opacity = "0"
        document.body.appendChild(el)
        el.select()
        document.execCommand("copy")
        document.body.removeChild(el)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    }
  }

  const isDark = variant === "dark"

  return (
    <div className={`space-y-3 text-left ${className}`}>
      {/* Bloco opcional de Avaliação 5★ no Google (Pós Check-out / Quitação Frigobar) */}
      {showGoogleReviewCta && (
        <div
          className={
            isDark
              ? "rounded-2xl p-4 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-slate-900 border border-amber-400/35 text-slate-100 space-y-2.5"
              : "rounded-2xl p-4 bg-gradient-to-r from-amber-50 via-yellow-50/80 to-white border border-amber-200/90 text-slate-900 space-y-2.5 shadow-2xs"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                <span>Sua avaliação faz toda a diferença</span>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  isDark ? "text-slate-300" : "text-slate-600"
                }`}
              >
                Gostou do conforto e atendimento no Soho Residence? Avalie sua estadia no Google em menos de 30 segundos!
              </p>
            </div>
          </div>

          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => safeTrack("google_review")}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-xs transition-all"
          >
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className="w-3 h-3 fill-slate-950 text-slate-950" />
              ))}
            </div>
            <span>Avaliar no Google agora</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Card Principal de Reativação / Reserva Direta Zero-Spam */}
      <div
        className={
          isDark
            ? `relative overflow-hidden rounded-2xl border border-[#C5A059]/35 bg-gradient-to-br from-slate-900 via-[#0B2530] to-slate-900 text-slate-100 shadow-lg ${
                compact ? "p-4 space-y-3" : "p-5 space-y-4"
              }`
            : `relative overflow-hidden rounded-3xl border border-[#0F3D4C]/15 bg-gradient-to-br from-[#091E26] via-[#0F3D4C] to-[#091E26] text-white shadow-lg ${
                compact ? "p-4 space-y-3" : "p-5 sm:p-6 space-y-4"
              }`
        }
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#C5A059]/15 blur-2xl" />

        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#C5A059]/20 border border-[#C5A059]/40 px-2.5 py-0.5 text-[10.5px] font-extrabold text-[#F3D899]">
            <Sparkles className="w-3 h-3 shrink-0 text-[#E5C98B]" />
            <span>
              {isB2b
                ? "Hospitalidade Executiva CorpFlats"
                : isOtaOrigin
                  ? "Vai voltar a Campos? Reserve sem taxas de intermediários"
                  : "Benefício Oficial de Hóspede CorpFlats"}
            </span>
          </div>

          <h3
            className={`font-black tracking-tight text-white leading-snug ${
              compact ? "text-sm sm:text-base" : "text-base sm:text-lg"
            }`}
          >
            {isB2b
              ? "Salve nosso contato 24h e conheça o site oficial CorpFlats"
              : "Próxima estadia com Menor Preço Garantido + 5% OFF no PIX"}
          </h3>

          <p className="text-xs text-slate-200/90 leading-relaxed">
            {isB2b
              ? "Tenha a recepção digital 24h na sua agenda e conheça nossas suítes em corpflats.com.br para suas próximas agendas em Campos dos Goytacazes."
              : "Reservando direto em corpflats.com.br você garante a tarifa mais baixa sem comissões de portais, confirmação imediata e emissão automática de NFS-e."}
          </p>
        </div>

        {/* Pilares de Valor (Exibidos apenas para reservas não-B2B) */}
        {!isB2b && !compact && (
          <div className="relative z-10 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-100">
            <div className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-2.5 py-2">
              <QrCode className="w-3.5 h-3.5 text-[#E5C98B] shrink-0" />
              <span>5% OFF imediato no PIX</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-2.5 py-2">
              <Car className="w-3.5 h-3.5 text-[#E5C98B] shrink-0" />
              <span>Garagem Coberta Inclusa</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-2.5 py-2">
              <FileText className="w-3.5 h-3.5 text-[#E5C98B] shrink-0" />
              <span>NFS-e Nacional Automática</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-2.5 py-2">
              <RotateCcw className="w-3.5 h-3.5 text-[#E5C98B] shrink-0" />
              <span>Cancelamento Grátis 24h</span>
            </div>
          </div>
        )}

        {!isB2b && compact && (
          <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#F3D899]">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Menor Preço Garantido
            </span>
            <span>• ⚡ 5% OFF PIX</span>
            <span>• 🚗 Garagem Inclusa</span>
            <span>• 🧾 NFS-e Automática</span>
          </div>
        )}

        {/* CTAs de Ação Voluntária */}
        <div className="relative z-10 space-y-2 pt-0.5">
          <a
            href={directSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => safeTrack("open_site")}
            className="w-full h-10 sm:h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#C5A059] hover:bg-[#d3af68] text-slate-950 font-black text-xs sm:text-sm shadow-md transition-all"
          >
            <span>
              {isB2b
                ? "Conhecer corpflats.com.br"
                : compact
                  ? "Conhecer Tarifas Diretas (-5% PIX)"
                  : "Reservar Próxima Estadia em corpflats.com.br"}
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href="/api/public/contact.vcf"
              download="CorpFlats_Soho_Campos.vcf"
              onClick={() => safeTrack("save_vcard")}
              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-[11px] transition-colors px-3"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#E5C98B] shrink-0" />
              <span>Salvar Contato 24h (.vcf)</span>
            </a>

            <button
              type="button"
              onClick={handleCopySite}
              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-[11px] transition-colors px-3 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300">corpflats.com.br Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#E5C98B] shrink-0" />
                  <span>Guardar Site Oficial</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
