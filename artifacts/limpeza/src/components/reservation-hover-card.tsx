import React, { useState, useEffect } from "react"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { 
  MessageCircle, Phone, ExternalLink, Copy, Check, Coffee, 
  Users, Calendar, Eye, Building2, X, Zap, SlidersHorizontal, RefreshCw
} from "lucide-react"
import { format, parseISO, differenceInDays } from "date-fns"
import { useQuickMessages, renderQuickMessage, WhatsAppQuickMessage } from "@/hooks/use-quick-messages"

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

  // Mensagens Rápidas (Manuais) e Janelinha Flutuante de Prévia
  const { activeQuickMessages, dispatchQuickMessage } = useQuickMessages()
  const [hoveredQuickMsg, setHoveredQuickMsg] = useState<WhatsAppQuickMessage | null>(null)
  const [sendingMsgId, setSendingMsgId] = useState<string | null>(null)

  const handleTriggerQuickMessage = async (e: React.MouseEvent, qm: WhatsAppQuickMessage) => {
    e.stopPropagation()
    setSendingMsgId(qm.id)
    try {
      await dispatchQuickMessage(qm, resItem, originUrl)
    } finally {
      setSendingMsgId(null)
    }
  }

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
        className="w-[330px] max-w-[calc(100vw-24px)] p-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl z-50 text-xs relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Janelinha Flutuante de Prévia da Mensagem (Ao Repousar o Mouse) ──── */}
        {hoveredQuickMsg && (
          <div 
            className="absolute left-1 right-1 bottom-[calc(100%+8px)] z-50 p-3 rounded-2xl bg-slate-950/98 dark:bg-black/98 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 pointer-events-none select-none text-left"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                <span className="text-sm">{hoveredQuickMsg.icon}</span>
                <span className="truncate max-w-[170px]">{hoveredQuickMsg.title}</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                WhatsApp Manual
              </span>
            </div>

            <div className="text-[11px] leading-relaxed text-slate-200 font-normal whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
              {renderQuickMessage(hoveredQuickMsg.message, resItem, originUrl)}
            </div>

            {hoveredQuickMsg.buttons && hoveredQuickMsg.buttons.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex flex-wrap gap-1">
                {hoveredQuickMsg.buttons.map(b => (
                  <span key={b.id} className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                    {b.label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9.5px] text-slate-400">
              <span className="font-mono">Destino: {finalWaPhone ? `+${finalWaPhone}` : "Sem tel"}</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                ⚡ Clique no botão para disparar
              </span>
            </div>

            {/* Seta indicativa para o card */}
            <div className="absolute top-full left-8 w-2.5 h-2.5 -mt-1 bg-slate-950 dark:bg-black border-r border-b border-slate-700 rotate-45" />
          </div>
        )}

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
                {checkinStr} ({resItem.checkinTime || "14:00"}) até {checkoutStr} ({resItem.checkoutTime || "12:00"})
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

            <div className="flex items-center gap-1.5">
              {(() => {
                const chan = String(resItem.channel || "").toLowerCase();
                const isOta = chan.includes("booking") || chan.includes("airbnb");
                const isPaid = isOta || resItem.paymentStatus === "pago_total" || resItem.paymentStatus === "pago" || (Number(resItem.paidAmount) >= Number(resItem.totalAmount) && Number(resItem.totalAmount) > 0);
                return (
                  <Badge 
                    variant="outline" 
                    className={`text-[9.5px] font-bold px-1.5 py-0 ${
                      isPaid 
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300" 
                        : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    {isPaid ? (isOta ? (chan.includes("booking") ? "Pago (Booking)" : "Pago (Airbnb)") : "Pago ✓") : "Pendente"}
                  </Badge>
                );
              })()}
              {resItem.dailyRate > 0 && (
                <span className="text-[10.5px] text-slate-500 font-medium">
                  Diária: <strong className="text-slate-800 dark:text-slate-200 font-bold">R$ {resItem.dailyRate}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 2.5 Atalhos de Mensagens Rápidas (Compact Pill Row) ────────── */}
        {activeQuickMessages.length > 0 && (
          <div className="px-3.5 py-2 bg-emerald-50/50 dark:bg-emerald-950/20 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                Mensagens Rápidas
              </span>
              <a 
                href="/whatsapp?tab=quick_messages" 
                className="text-[9.5px] text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-0.5 transition-colors"
                title="Configurar e ativar/desativar atalhos de mensagens"
              >
                <span>Gerenciar</span>
                <SlidersHorizontal className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="flex flex-wrap gap-1">
              {activeQuickMessages.map(qm => {
                const isSending = sendingMsgId === qm.id;
                return (
                  <button
                    key={qm.id}
                    type="button"
                    disabled={isSending}
                    onClick={(e) => handleTriggerQuickMessage(e, qm)}
                    onMouseEnter={() => setHoveredQuickMsg(qm)}
                    onMouseLeave={() => setHoveredQuickMsg(null)}
                    className="h-6 px-2 rounded-lg text-[10.5px] font-semibold flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 active:scale-95 transition-all shadow-2xs cursor-pointer group/btn"
                    title={`Passe o mouse para ler a mensagem ou clique para disparar "${qm.title}"`}
                  >
                    {isSending ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                    ) : (
                      <span className="text-xs">{qm.icon || "💬"}</span>
                    )}
                    <span className="truncate max-w-[90px]">{qm.shortLabel || qm.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
