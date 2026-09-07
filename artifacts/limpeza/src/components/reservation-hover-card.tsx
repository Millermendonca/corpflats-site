import React, { useState, useEffect } from "react"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { 
  MessageCircle, Phone, ExternalLink, Copy, Check, Coffee, 
  Users, Calendar, Eye, Building2, X
} from "lucide-react"
import { format, parseISO, differenceInDays } from "date-fns"

interface ReservationHoverCardProps {
  resItem: any
  flat: any
  isBeingDragged?: boolean
  onOpenDetails: (resItem: any) => void
  channelCfg?: { label: string; bg: string; text: string; border: string }
  isMensalista?: boolean
  isOpenMobile?: boolean
  onCloseMobile?: () => void
  children: React.ReactNode
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  confirmada: { 
    label: "Confirmada", 
    className: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" 
  },
  checkin: { 
    label: "Hospedado (In)", 
    className: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800" 
  },
  hospedado: { 
    label: "Hospedado (In)", 
    className: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800" 
  },
  pendente: { 
    label: "Pendente", 
    className: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" 
  },
  checkout: { 
    label: "Check-out (Out)", 
    className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" 
  },
  cancelada: { 
    label: "Cancelada", 
    className: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800" 
  }
}

export function ReservationHoverCard({
  resItem,
  flat,
  isBeingDragged = false,
  onOpenDetails,
  channelCfg,
  isMensalista = false,
  isOpenMobile = false,
  onCloseMobile,
  children
}: ReservationHoverCardProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // O card abre se estiver em hover no desktop OU ativado via toque no celular
  const isCardOpen = !isBeingDragged && (Boolean(isOpenMobile) || isOpen)

  const handleClose = () => {
    setIsOpen(false)
    onCloseMobile?.()
  }

  // Fecha imediatamente se o usuário iniciar arraste da reserva
  useEffect(() => {
    if (isBeingDragged) {
      handleClose()
    }
  }, [isBeingDragged])

  // Fecha imediatamente ao detectar scroll (em qualquer elemento, incluindo grade do calendário)
  useEffect(() => {
    const handleScroll = () => {
      if (isCardOpen) handleClose()
    }
    window.addEventListener("scroll", handleScroll, true)
    return () => window.removeEventListener("scroll", handleScroll, true)
  }, [isCardOpen])

  // Dados sanitizados da reserva
  const resCode = resItem.code || `RES-${resItem.flatNumber || flat?.number}-${String(resItem.id).padStart(4, "0")}`
  const guestName = resItem.guestName || resItem.guests?.[0]?.name || "Hóspede Sem Nome"
  const rawPhone = resItem.guestPhone || resItem.guests?.[0]?.phone || ""
  const cleanPhone = rawPhone.replace(/\D/g, "")
  const finalWaPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone

  const flatNumber = resItem.flatNumber || flat?.number || "Flat"
  const nightsCount = differenceInDays(parseISO(resItem.checkoutDate), parseISO(resItem.checkinDate)) || 1
  const checkinStr = format(parseISO(resItem.checkinDate), "dd/MM")
  const checkoutStr = format(parseISO(resItem.checkoutDate), "dd/MM")
  const guestCount = resItem.guestCount || resItem.adults || (resItem.guests?.length || 1)
  const hasBreakfast = Boolean(resItem.includeBreakfast || resItem.hasBreakfast)

  const statusCfg = STATUS_MAP[resItem.status] || STATUS_MAP.confirmada
  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com"
  const portalUrl = `${originUrl}/minha-reserva/${resItem.code || resItem.id}`
  const breakfastUrl = `${originUrl}/minha-reserva/${resItem.code || resItem.id}/cafe`

  const waMessage = `Olá ${guestName}, tudo bem? Falamos da CorpFlats a respeito da sua estadia no Flat ${flatNumber} (${checkinStr} a ${checkoutStr}). Como podemos ajudar?`
  const waLink = finalWaPhone ? `https://wa.me/${finalWaPhone}?text=${encodeURIComponent(waMessage)}` : null

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(portalUrl)
    setCopiedLink(true)
    toast({
      title: "Link copiado! 📋",
      description: "Link da página do hóspede copiado para a área de transferência."
    })
    setTimeout(() => setCopiedLink(false), 2000)
  }

  // Se houver qualquer operação de arraste ou redimensionamento ativa no calendário,
  // ignora completamente o HoverCard para não interferir na captura de ponteiro
  if (isBeingDragged) {
    return <>{children}</>
  }

  return (
    <HoverCard 
      open={isCardOpen} 
      onOpenChange={(open) => {
        if (!isBeingDragged) {
          setIsOpen(open)
          if (!open) {
            onCloseMobile?.()
          }
        }
      }}
      openDelay={350} 
      closeDelay={200}
    >
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>

      <HoverCardContent 
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        avoidCollisions={true}
        onPointerDownOutside={handleClose}
        onInteractOutside={handleClose}
        className="w-[330px] max-w-[calc(100vw-24px)] p-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl overflow-hidden z-50 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 1. Topo & Identificação ────────────────────────────────────── */}
        <div className="p-3.5 pb-2.5 bg-slate-50/80 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="font-mono text-[11px] font-bold text-slate-500 tracking-wider">
              #{resCode}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {isMensalista && (
                <span className="text-[9px] uppercase font-black px-1.5 py-0.5 bg-amber-400 text-slate-950 rounded shadow-2xs">
                  👑 Mensalista
                </span>
              )}
              {channelCfg && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 shadow-2xs">
                  {channelCfg.label || resItem.channel}
                </span>
              )}
              <Badge variant="outline" className={`text-[10px] font-bold py-0.5 px-2 ${statusCfg.className}`}>
                {statusCfg.label}
              </Badge>
              {/* Botão de Fechar rápido no mobile / touch */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose()
                }}
                className="w-5 h-5 ml-0.5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Fechar janela rápida"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <h4 className="text-sm font-black text-slate-900 dark:text-slate-50 truncate leading-snug">
            {guestName}
          </h4>
        </div>

        {/* ── 2. Grid de Resumo da Reserva ───────────────────────────────── */}
        <div className="p-3.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Flat / Acomodação */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="leading-tight truncate">
                <span className="text-[10px] text-slate-400 block font-medium">Unidade</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">Flat {flatNumber}</span>
              </div>
            </div>

            {/* Hóspedes */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div className="leading-tight">
                <span className="text-[10px] text-slate-400 block font-medium">Ocupação</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {guestCount} {guestCount === 1 ? "hóspede" : "hóspedes"}
                </span>
              </div>
            </div>
          </div>

          {/* Período & Diárias */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-[11px]">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {checkinStr} até {checkoutStr}
              </span>
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-[10px]">
              {nightsCount} {nightsCount === 1 ? "diária" : "diárias"}
            </span>
          </div>

          {/* Café da Manhã & Financeiro */}
          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <div className="flex items-center gap-1.5">
              <Coffee className={`w-3.5 h-3.5 ${hasBreakfast ? "text-amber-500" : "text-slate-300"}`} />
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Café:</span>
              <Badge 
                variant="outline" 
                className={`text-[9.5px] font-bold px-1.5 py-0 ${
                  hasBreakfast 
                    ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300" 
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {hasBreakfast ? "Incluso ✓" : "Não incluso"}
              </Badge>
            </div>

            {resItem.dailyRate > 0 && (
              <span className="text-[10.5px] text-slate-500 font-medium">
                Diária: <strong className="text-slate-800 dark:text-slate-200 font-bold">R$ {resItem.dailyRate}</strong>
              </span>
            )}
          </div>
        </div>

        {/* ── 3. Barra de Ações Rápidas (Action Bar) ──────────────────────── */}
        <div className="p-3 bg-slate-50/90 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          {/* Linha 1: Ação Primária WhatsApp & Telefone */}
          <div className="flex items-center gap-1.5">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs shadow-xs transition-all group"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-white/20 group-hover:scale-110 transition-transform" />
                <span>WhatsApp</span>
              </a>
            ) : (
              <Button
                disabled
                size="sm"
                variant="outline"
                className="flex-1 h-8 rounded-xl text-xs font-bold text-slate-400 cursor-not-allowed"
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1" />
                Sem WhatsApp
              </Button>
            )}

            {cleanPhone && (
              <a
                href={`tel:+${finalWaPhone}`}
                className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors shrink-0 shadow-2xs"
                title={`Ligar para ${rawPhone}`}
              >
                <Phone className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </a>
            )}
          </div>

          {/* Linha 2: Links Públicos & Detalhes */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1 h-7 px-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/80 hover:bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold text-[11px] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Minha Reserva</span>
            </a>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              className="h-7 w-7 p-0 rounded-xl hover:bg-slate-200/80 text-slate-600 dark:text-slate-300"
              title="Copiar Link da Reserva"
            >
              {copiedLink ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>

            {hasBreakfast && (
              <a
                href={breakfastUrl}
                target="_blank"
                rel="noreferrer"
                className="h-7 px-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                title="Abrir Gestão de Café da Manhã"
              >
                <Coffee className="w-3 h-3 text-amber-600" />
                <span>Café</span>
              </a>
            )}

            <Button
              type="button"
              size="sm"
              onClick={() => {
                handleClose()
                onOpenDetails(resItem)
              }}
              className="h-7 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-bold text-[11px] flex items-center gap-1 shadow-2xs"
            >
              <Eye className="w-3 h-3" />
              <span>Detalhes</span>
            </Button>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
