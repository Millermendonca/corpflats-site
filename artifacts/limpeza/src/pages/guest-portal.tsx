import { useState, useEffect } from "react"
import { useRoute, useLocation } from "wouter"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Building2, Star, RotateCcw, Calendar, Users, Coffee, ShieldCheck, 
  Sparkles, CheckCircle2, ArrowRight, Clock, KeyRound, 
  MessageCircle, FileText, Ban, AlertTriangle, ChevronRight,
  Wifi, HelpCircle, Check, Copy, Phone, UserCheck, ShieldAlert,
  MapPin, Navigation, ExternalLink, Car
} from "lucide-react"
import { format, parseISO, differenceInDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AddToCalendar } from "@/components/add-to-calendar"
import { generateLodgingJsonLd } from "@/lib/calendar-helper"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"

export default function GuestPortal() {
  const [, params] = useRoute("/minha-reserva/:code")
  const [, paramsAlt] = useRoute("/portal-hospede/:code")
  const [, paramsGuest] = useRoute("/guest-portal/:code")
  const [, setLocation] = useLocation()
  
  const code = params?.code || paramsAlt?.code || paramsGuest?.code || ""
  
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modals & Action States
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsModalTab, setTermsModalTab] = useState<"rules" | "contract">("rules")
  const [claimingEarly, setClaimingEarly] = useState(false)
  const [reminderSaved, setReminderSaved] = useState(false)

  // Cancelamento Self-Service States
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  // Breakfast Repeat & Favorite States
  const [repeatModalOpen, setRepeatModalOpen] = useState(false)
  const [selectedOrderToRepeat, setSelectedOrderToRepeat] = useState<any | null>(null)
  const [repeatDeliveryDate, setRepeatDeliveryDate] = useState("")
  const [repeatDeliveryTime, setRepeatDeliveryTime] = useState("08:00")
  const [isRepeatingOrder, setIsRepeatingOrder] = useState(false)
  const [favoriteTogglingId, setFavoriteTogglingId] = useState<number | null>(null)

  const handleToggleFavorite = async (orderId: number) => {
    try {
      setFavoriteTogglingId(orderId)
      const res = await fetch(`/api/breakfast/orders/${orderId}/favorite`, { method: "POST" })
      if (res.ok) {
        fetchPortalData()
      }
    } catch {}
    finally {
      setFavoriteTogglingId(null)
    }
  }

  const handleOpenRepeatModal = (order: any) => {
    setSelectedOrderToRepeat(order)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setRepeatDeliveryDate(tomorrow.toISOString().substring(0, 10))
    setRepeatDeliveryTime(order.deliveryTime || "08:00")
    setRepeatModalOpen(true)
  }

  const handleConfirmRepeatOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderToRepeat) return
    setIsRepeatingOrder(true)
    try {
      const res = await fetch("/api/breakfast/orders/repeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderToRepeat.id,
          targetDate: repeatDeliveryDate,
          deliveryTime: repeatDeliveryTime
        })
      })
      if (res.ok) {
        setRepeatModalOpen(false)
        fetchPortalData()
      }
    } catch {}
    finally {
      setIsRepeatingOrder(false)
    }
  }


  const fetchPortalData = async () => {
    if (!code) {
      setLoading(false)
      setError("Código de reserva não fornecido.")
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`/api/pms/guest-portal/${code}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || "Reserva não encontrada.")
        return
      }
      const json = await res.json()
      setData(json)
      if (code) {
        try {
          localStorage.setItem("corpflats_guest_session", code);
          localStorage.setItem("corpflats_guest_name", json.reservation?.guestName || "");
        } catch {}
      }
      setError(null)
    } catch (e: any) {
      setError(e.message || "Erro ao carregar dados da reserva.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPortalData()
  }, [code])

  const handleClaimEarlyCheckin = async () => {
    try {
      setClaimingEarly(true)
      const res = await fetch(`/api/pms/guest-portal/${code}/claim-early-checkin`, {
        method: "POST"
      })
      if (res.ok) {
        fetchPortalData()
      }
    } catch {}
    finally {
      setClaimingEarly(false)
    }
  }

  // Vehicle & Garage States
  const [portalPlate, setPortalPlate] = useState("")
  const [portalBrand, setPortalBrand] = useState("")
  const [portalModel, setPortalModel] = useState("")
  const [portalColor, setPortalColor] = useState("")
  const [portalCarEditing, setPortalCarEditing] = useState(false)
  const [savingCar, setSavingCar] = useState(false)
  const [portalCarSuccess, setPortalCarSuccess] = useState(false)

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!portalPlate.trim() || !code) return

    setSavingCar(true)
    try {
      const res = await fetch(`/api/pms/reservations/${code}/vehicle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: portalPlate.trim().toUpperCase(),
          brand: portalBrand.trim(),
          model: portalModel.trim(),
          color: portalColor.trim()
        })
      })
      if (res.ok) {
        setPortalCarSuccess(true)
        setPortalCarEditing(false)
        fetchPortalData()
        setTimeout(() => setPortalCarSuccess(false), 5000)
      }
    } catch {}
    finally {
      setSavingCar(false)
    }
  }

  const handleRequestBreakfastLater = async () => {
    try {
      const res = await fetch(`/api/pms/guest-portal/${code}/request-breakfast-later`, {
        method: "POST"
      })
      if (res.ok) {
        setReminderSaved(true)
        setTimeout(() => setReminderSaved(false), 4000)
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="text-sm font-medium text-slate-400">Carregando detalhes da sua reserva...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 text-center">
        <Card className="max-w-md w-full bg-slate-900 border-slate-800 text-white p-6 rounded-3xl space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Reserva Não Encontrada</h2>
          <p className="text-xs text-slate-400">{error || "Verifique o código localizador informado no link ou confirme com nossa recepção."}</p>
          <Button onClick={() => setLocation("/reservar")} className="w-full bg-primary font-bold text-xs">
            Ir para Motor de Reservas
          </Button>
        </Card>
      </div>
    )
  }

  const { reservation, isFlatRevealed, revealTimeMessage, canClaimFreeEarlyCheckin, breakfastOrder, preCheckinStatus, termsAndRules, adminWhatsApp } = data

  const checkinFormatted = reservation.checkinDate ? format(parseISO(reservation.checkinDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""
  const checkoutFormatted = reservation.checkoutDate ? format(parseISO(reservation.checkoutDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""
  const nights = reservation.checkinDate && reservation.checkoutDate ? Math.max(1, differenceInDays(parseISO(reservation.checkoutDate), parseISO(reservation.checkinDate))) : 1

  // WhatsApp Link formatado
  const rawAdminPhone = (adminWhatsApp || "5522999999999").replace(/\D/g, "")
  const whatsappUrl = `https://wa.me/${rawAdminPhone}?text=${encodeURIComponent(`Olá, tenho uma reserva número ${reservation.code} feita pelo site e gostaria de tirar uma dúvida.`)}`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-20">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800/80 px-4 sm:px-8 py-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/20 text-primary flex items-center justify-center font-black text-xl border border-primary/30">
              CF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white">CorpFlats • Área do Hóspede</h1>
                <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                  Reserva Confirmada
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Localizador: <span className="font-mono font-bold text-slate-200">{reservation.code}</span></p>
            </div>
          </div>

          <a 
            href={whatsappUrl} 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Falar com a Administradora do Flat</span>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 space-y-6">
        
        {/* Banner 100% Não Fumante */}
        <div className="p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-2xl flex items-center gap-3 text-xs text-rose-200">
          <div className="w-9 h-9 rounded-xl bg-rose-900/80 text-rose-300 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-white block">Flats 100% Não Fumantes 🚭</span>
            <span className="text-[11px] text-rose-300/90">
              É estritamente proibido fumar dentro dos apartamentos e sacadas. Sujeito a taxa de higienização de R$ 350,00.
            </span>
          </div>
        </div>

        {/* Card: Adicionar ao Calendário (Google Agenda, Outlook, Apple .ICS) */}
        <AddToCalendar
          reservation={{
            id: reservation.id || reservation.code,
            reservationCode: reservation.code,
            guestName: reservation.guestName || "Hóspede",
            guestEmail: reservation.guestEmail,
            guestPhone: reservation.guestPhone,
            flatNumber: reservation.flatNumber,
            flatName: reservation.roomCategory,
            checkinDate: reservation.checkinDate,
            checkoutDate: reservation.checkoutDate,
            numGuests: reservation.guestCount || 2,
            accessCode: reservation.doorPassword || reservation.accessCode,
            manageUrl: `https://corpflats.onrender.com/minha-reserva/${reservation.code}`
          }}
        />

        {/* Script JSON-LD Schema.org LodgingReservation para Gmail e Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateLodgingJsonLd({
              id: reservation.id || reservation.code,
              reservationCode: reservation.code,
              guestName: reservation.guestName || "Hóspede",
              guestEmail: reservation.guestEmail,
              guestPhone: reservation.guestPhone,
              flatNumber: reservation.flatNumber,
              checkinDate: reservation.checkinDate,
              checkoutDate: reservation.checkoutDate,
              numGuests: reservation.guestCount || 2,
              manageUrl: `https://corpflats.onrender.com/minha-reserva/${reservation.code}`
            }))
          }}
        />

        {/* Card: Acomodação & Chave de Acesso */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-bold text-primary uppercase tracking-wider block">Sua Acomodação</span>
              <h2 className="text-xl font-black text-white">{reservation.roomCategory || "Flat Studio Executivo Completo"}</h2>
            </div>
            <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs">
              {reservation.guestCount} {reservation.guestCount === 1 ? "Hóspede" : "Hóspedes"} • {nights} {nights === 1 ? "Diária" : "Diárias"}
            </Badge>
          </div>

          {/* Número do Apartamento & Status de Prontidão */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Número do seu Apartamento</span>
              <Badge className={
                data.isCheckinToday 
                  ? (data.isFlatClean ? "bg-emerald-600 text-white font-black text-xs" : "bg-amber-600/90 text-white font-bold text-xs")
                  : "bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-xs"
              }>
                {data.isCheckinToday 
                  ? (data.isFlatClean ? "✨ Flat Pronto e Limpo" : "🧹 Em Higienização")
                  : "✨ Flat Confirmado & Preparado"
                }
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center font-black text-xl border border-primary/40">
                {reservation.flatNumber}
              </div>
              <div>
                <span className="text-base font-black text-white block">Apartamento {reservation.flatNumber}</span>
                <span className="text-xs text-slate-300">
                  Dirija-se à <strong>portaria</strong> e informe seu <strong>nome</strong> e o número do flat: <strong>Apt {reservation.flatNumber}</strong>.
                </span>
              </div>
            </div>

            {/* Aviso Dinâmico de Check-in / Antecipação */}
            {data.isCheckinToday ? (
              data.isFlatClean ? (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-200 block">Check-in Antecipado Liberado! 🎉</span>
                    <span>Seu apartamento já foi limpo e inspecionado. Você já pode se dirigir à portaria e dar entrada agora mesmo.</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-200 block">Quarto em Preparação</span>
                    <span>Nossa equipe de governança está higienizando o apartamento. Check-in regular a partir das 14:00 (assim que for finalizado, a entrada antecipada é liberada automaticamente).</span>
                  </div>
                </div>
              )
            ) : null}

            {reservation.receptionNotes && (
              <div className="p-2.5 bg-indigo-950/30 border border-indigo-800/50 rounded-xl text-xs text-indigo-300">
                <span className="font-bold">Aviso da Recepção:</span> {reservation.receptionNotes}
              </div>
            )}
          </div>

          {/* Período da Estadia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block">Check-in (Entrada)</span>
              <span className="text-sm font-bold text-slate-200 mt-0.5 block">{checkinFormatted}</span>
              <span className="text-[11px] text-emerald-400 font-medium">A partir das {data?.checkinTime || "14:00"} (antecipado assim que limpo)</span>
            </div>
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-500 font-semibold block">Check-out (Saída)</span>
              <span className="text-sm font-bold text-slate-200 mt-0.5 block">{checkoutFormatted}</span>
              <span className="text-[11px] text-slate-400">Até as {data?.checkoutTime || "12:00"}</span>
            </div>
          </div>
        </Card>

        {/* Card: Café da Manhã no Flat (Se incluso na reserva) */}
        {(reservation.hasBreakfast || reservation.includeBreakfast || data.hasBreakfast) && (
          <Card className="bg-gradient-to-br from-amber-950/50 via-slate-900 to-slate-900 border-amber-600/40 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-800/40 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xl border border-amber-500/30 shadow-xs">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white flex items-center gap-2">
                    Café da Manhã no Flat
                  </h2>
                  <span className="text-[11px] text-amber-300/90 font-medium">
                    Room service artesanal servido pontualmente no seu apartamento
                  </span>
                </div>
              </div>
              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black px-2.5 py-0.5">
                ☕ Incluso na Diária
              </Badge>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Sua estadia no <strong>Apt {reservation.flatNumber}</strong> conta com café da manhã incluso entregue diretamente no seu quarto das <strong>05:00 às 09:30</strong>. Você pode montar suas opções favoritas e escolher o horário ideal através do seu link exclusivo.
            </p>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 pt-1">
              <Button
                onClick={() => window.open(`/cafe?res=${reservation.code || reservation.breakfastToken || code}`, "_blank")}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white font-black text-xs h-11 px-5 rounded-2xl shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 flex-1 transition-all"
              >
                <Coffee className="w-4 h-4" />
                <span>Montar / Acompanhar Pedido de Café da Manhã</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const url = `${window.location.origin}/cafe?res=${reservation.code || reservation.breakfastToken || code}`
                  navigator.clipboard.writeText(url)
                  alert("Link exclusivo do café da manhã copiado para a área de transferência!")
                }}
                className="h-11 px-4 rounded-2xl border-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs shrink-0"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                <span>Copiar Link</span>
              </Button>
            </div>
          </Card>
        )}

        {/* Card: Comprovante & Detalhes Oficiais do Pagamento */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold text-lg">💰</span>
              <h2 className="text-base font-bold text-white">Comprovante & Detalhes do Pagamento</h2>
            </div>
            <Badge className={reservation.paymentStatus === "pago_total" || reservation.paymentStatus === "pago" ? "bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold" : "bg-amber-950 text-amber-300 border border-amber-800 text-xs font-bold"}>
              {reservation.paymentStatus === "pago_total" || reservation.paymentStatus === "pago" ? "✓ Pago Integralmente" : "Aguardando Confirmação"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px] block font-medium">Forma de Pagamento</span>
              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                {reservation.pixTxId ? "⚡ PIX Instantâneo (Banco Inter)" : (reservation.mpPaymentId ? "💳 Cartão de Crédito (Mercado Pago)" : "PIX Oficial")}
              </span>
            </div>

            <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[11px] block font-medium">Valor Total Pago</span>
              <span className="text-base font-black text-emerald-400">
                R$ {(reservation.paidAmount || reservation.totalAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-2 text-xs text-slate-300">
            {reservation.paidAt && (
              <div className="flex flex-wrap justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400 font-medium">Data e Hora da Liquidação:</span>
                <span className="font-semibold text-slate-200">
                  {format(parseISO(reservation.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                </span>
              </div>
            )}

            {reservation.pixEndToEndId && (
              <div className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-800/60 pb-2 gap-1">
                <span className="text-slate-400 font-medium">ID da Transação (EndToEnd BCB):</span>
                <span className="font-mono text-[11px] text-emerald-400 font-bold break-all select-all">
                  {reservation.pixEndToEndId}
                </span>
              </div>
            )}

            {reservation.pixTxId && (
              <div className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-800/60 pb-2 gap-1">
                <span className="text-slate-400 font-medium">Identificador TxId (Banco Inter):</span>
                <span className="font-mono text-[11px] text-slate-300 break-all select-all">
                  {reservation.pixTxId}
                </span>
              </div>
            )}

            <div className="flex justify-between pt-1">
              <span className="text-slate-400 font-medium">Favorecido / Titular:</span>
              <span className="font-semibold text-slate-200">CorpFlats Hospedagens • CNPJ 47.964.813/0001-65</span>
            </div>
          </div>
        </Card>

        {/* Card: Café da Manhã Integrado na Área Logada */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-white">Café da Manhã no Quarto</h2>
            </div>
            <Badge className={reservation.includeBreakfast || reservation.hasBreakfast ? "bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-bold" : "bg-slate-800 text-slate-400 text-[10px]"}>
              {reservation.includeBreakfast || reservation.hasBreakfast ? "☕ Incluso na Estadia" : "Não Incluso"}
            </Badge>
          </div>

          {!(reservation.includeBreakfast || reservation.hasBreakfast) ? (
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-bold">
                <Ban className="w-4 h-4 text-slate-400" />
                <span>Café da Manhã não incluso nesta reserva</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Sua reserva atual foi contratada sem o serviço de café da manhã. Para reservas futuras, selecione uma tarifa com café da manhã incluso.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Pedido Ativo / Agendado */}
              {breakfastOrder && (
                <div className="p-4 bg-slate-950 rounded-2xl border border-emerald-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-400 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Pedido Agendado ({breakfastOrder.deliveryDate === format(new Date(), "yyyy-MM-dd") ? "Hoje" : "Próxima Entrega"})</span>
                    </span>
                    <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">
                      ⏰ Entrega às {breakfastOrder.deliveryTime || "08:00"}
                    </Badge>
                  </div>

                  <div className="text-[11px] text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Apartamento: <strong>Apt {breakfastOrder.roomNumber || reservation.flatNumber}</strong></span>
                      <span>Data: <strong>{breakfastOrder.deliveryDate}</strong></span>
                    </div>
                    {breakfastOrder.items && Array.isArray(breakfastOrder.items) && (
                      <div className="pt-1 text-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Itens Selecionados:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {breakfastOrder.items.map((it: any, idx: number) => (
                            <span key={idx} className="inline-block bg-slate-800 px-2 py-0.5 rounded-md text-[10px]">
                              {it.quantity > 1 ? `${it.quantity}x ` : ""}{it.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleFavorite(breakfastOrder.id)}
                      disabled={favoriteTogglingId === breakfastOrder.id}
                      className="text-xs h-8 bg-slate-900 border-amber-800/60 text-amber-300 hover:bg-amber-950/40 flex items-center gap-1.5"
                    >
                      <Star className={`w-3.5 h-3.5 ${breakfastOrder.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
                      <span>{breakfastOrder.isFavorite ? "Favoritado ⭐" : "Favoritar este Pedido"}</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setLocation(`/cafe?code=${code}`)}
                      className="text-xs h-8 bg-slate-800 hover:bg-slate-700 text-white ml-auto"
                    >
                      Alterar Opções
                    </Button>
                  </div>
                </div>
              )}

              {/* Botão de Repetir Último Pedido & Pedidos Favoritos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(reservation.lastBreakfastOrder || breakfastOrder) && (
                  <Button
                    type="button"
                    onClick={() => handleOpenRepeatModal(reservation.lastBreakfastOrder || breakfastOrder)}
                    className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs h-10 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>⚡ Repetir Último Pedido</span>
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={() => setLocation(`/cafe?code=${code}`)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs h-10 rounded-2xl flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Coffee className="w-4 h-4 text-amber-400" />
                  <span>{breakfastOrder ? "Fazer Novo Pedido" : "Montar Café da Manhã"}</span>
                </Button>
              </div>

              {/* Lista de Favoritos Salvos */}
              {Array.isArray(reservation.favoriteBreakfastOrders) && reservation.favoriteBreakfastOrders.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>Seus Pedidos Favoritos:</span>
                  </span>
                  <div className="space-y-1.5">
                    {reservation.favoriteBreakfastOrders.map((fav: any) => (
                      <div key={fav.id} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px]">
                        <div className="min-w-0">
                          <span className="font-bold text-slate-200 block truncate">
                            {fav.items?.map((i: any) => i.name).slice(0, 3).join(", ") || "Combinação Favorita"}
                          </span>
                          <span className="text-[10px] text-slate-400">Horário habitual: {fav.deliveryTime || "08:00"}</span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenRepeatModal(fav)}
                          className="h-7 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg shrink-0 ml-2"
                        >
                          Usar Este
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Card: Pré-Check-in Digital (FNHR) */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">Pré-Check-in & Cadastro dos Hóspedes</h2>
            </div>
            <Badge className={preCheckinStatus?.isFullyCompleted ? "bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px]" : "bg-amber-950 text-amber-400 border-amber-800 text-[10px]"}>
              {preCheckinStatus?.isFullyCompleted ? "Cadastro Concluído" : "Pendente de Preenchimento"}
            </Badge>
          </div>

          <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
            <p>
              <strong>É necessário ter feito o check-in digital</strong> para agilizar a liberação do seu acesso. Caso não tenha feito com antecedência, também é possível realizá-lo na hora na portaria preenchendo a ficha manualmente.
            </p>
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl flex items-start gap-2 text-indigo-200">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                <strong>Praticidade para futuras estadias:</strong> O check-in digital, uma vez realizado, fica salvo com segurança para que nas suas próximas vindas não seja necessário preencher tudo novamente!
              </span>
            </div>
          </div>

          <Button 
            onClick={() => setLocation(`/pre-checkin/${reservation.code}`)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 py-3"
          >
            <FileText className="w-4 h-4" />
            <span>{preCheckinStatus?.isFullyCompleted ? "Revisar Dados do Pré-Check-in" : "Preencher Pré-Check-in Digital Agora"}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Card>

        {/* Card: Estacionamento & Garagem Soho */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-bold text-white">Estacionamento & Garagem</h2>
            </div>
            <Badge className={reservation.vehicle?.plate ? "bg-blue-950 text-blue-300 border-blue-800 text-[10px]" : "bg-slate-800 text-slate-400 text-[10px]"}>
              {reservation.vehicle?.plate ? "Vaga Autorizada" : "1 Vaga Gratuita"}
            </Badge>
          </div>

          {portalCarSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>✓ Veículo salvo e autorizado na portaria do condomínio com sucesso!</span>
            </div>
          )}

          {reservation.vehicle?.plate && !portalCarEditing ? (
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Veículo Liberado na Portaria</span>
                <span className="text-base font-black font-mono text-amber-400 tracking-wider">
                  {reservation.vehicle.plate}
                </span>
                <span className="text-xs text-slate-300 block">
                  {reservation.vehicle.brand} {reservation.vehicle.model} {reservation.vehicle.color ? `• ${reservation.vehicle.color}` : ''}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPortalPlate(reservation.vehicle?.plate || "")
                  setPortalBrand(reservation.vehicle?.brand || "")
                  setPortalModel(reservation.vehicle?.model || "")
                  setPortalColor(reservation.vehicle?.color || "")
                  setPortalCarEditing(true)
                }}
                className="text-xs font-bold border-slate-700 text-slate-300"
              >
                Alterar Carro
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSaveVehicle} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Informe a placa do seu veículo para que a portaria do Edifício Soho libere a sua entrada na garagem:
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-300 font-bold text-[11px]">Placa do Veículo *</Label>
                  <Input
                    value={portalPlate}
                    onChange={e => setPortalPlate(e.target.value.toUpperCase())}
                    required
                    placeholder="ABC1D23"
                    className="bg-slate-950 border-slate-700 text-white font-mono font-bold uppercase text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-[11px]">Modelo do Carro</Label>
                  <Input
                    value={portalModel}
                    onChange={e => setPortalModel(e.target.value)}
                    placeholder="Ex: Corolla, Civic"
                    className="bg-slate-950 border-slate-700 text-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-[11px]">Marca</Label>
                  <Input
                    value={portalBrand}
                    onChange={e => setPortalBrand(e.target.value)}
                    placeholder="Ex: Toyota"
                    className="bg-slate-950 border-slate-700 text-white text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-[11px]">Cor</Label>
                  <Input
                    value={portalColor}
                    onChange={e => setPortalColor(e.target.value)}
                    placeholder="Ex: Prata"
                    className="bg-slate-950 border-slate-700 text-white text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {portalCarEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPortalCarEditing(false)}
                    className="border-slate-700 text-slate-400 text-xs"
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={savingCar}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                >
                  {savingCar ? "Salvando..." : "Salvar e Autorizar Garagem"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* Card: Localização & Como Chegar */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-400" />
              <h2 className="text-base font-bold text-white">Localização & Como Chegar</h2>
            </div>
            <Badge variant="outline" className="border-rose-900/60 bg-rose-950/40 text-rose-300 text-[10px]">
              GPS & Navegação
            </Badge>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/60 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 border border-rose-800/40">
                <Navigation className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <span className="font-bold text-white text-sm block">CorpFlats</span>
                <p className="text-xs text-slate-300">
                  {data?.hotelAddress || "CorpFlats - Localização e Recepção"}
                </p>
                <p className="text-[11px] text-slate-500">
                  Abra diretamente no seu aplicativo de navegação favorito para traçar a melhor rota.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
              <a
                href={data?.googleMapsUrl || "https://www.google.com/maps/search/?api=1&query=CorpFlats"}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <MapPin className="w-4 h-4" />
                <span>Abrir no Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>

              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(data?.hotelAddress || "CorpFlats")}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <Navigation className="w-4 h-4" />
                <span>Abrir no Waze</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            </div>
          </div>
        </Card>

        {/* Card: Contrato & Regras de Convivência */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold text-white">Regras dos Flats & Contrato</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setTermsModalTab("rules"); setTermsModalOpen(true); }}
                className="text-xs bg-slate-950 border-amber-900/60 text-amber-300 hover:bg-slate-800"
              >
                🏡 Regras da Casa
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setTermsModalTab("contract"); setTermsModalOpen(true); }}
                className="text-xs bg-slate-950 border-indigo-900/60 text-indigo-300 hover:bg-slate-800"
              >
                📜 Contrato Completo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-400">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="font-bold text-white block mb-1">🚭 100% Não Fumante</span>
              <span>Proibido fumar nos quartos e sacadas. Multa de higienização.</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="font-bold text-white block mb-1">🐾 Pet de Pequeno Porte</span>
              <span>Até 10 kg, taxa de R$ 40, elevador de serviço e no colo.</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="font-bold text-white block mb-1">👥 Capacidade Máxima</span>
              <span>
                {reservation.guestCount} {reservation.guestCount === 1 ? "pessoa autorizada (conforme contratado)" : "pessoas autorizadas (conforme contratado)"}.
              </span>
            </div>
          </div>
        </Card>

        {/* Card: Política de Cancelamento & Autoatendimento */}
        {(() => {
          const cancelPol = calculateCancellationPolicy(
            reservation.createdAt || reservation.checkinDate,
            reservation.checkinDate,
            Number(reservation.paidAmount || reservation.totalAmount || 0)
          )
          const isCancelled = reservation.status === "cancelada" || reservation.status === "CANCELLED"

          return (
            <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-sky-400" />
                  <h2 className="text-base font-bold text-white">Política de Cancelamento & Estorno</h2>
                </div>
                <Badge className={isCancelled ? "bg-rose-950 text-rose-300 border border-rose-800 text-[10px]" : cancelPol.policyType === "flexivel" ? "bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]" : "bg-amber-950 text-amber-300 border border-amber-800 text-[10px]"}>
                  {isCancelled ? "✕ Reserva Cancelada" : cancelPol.badgeText}
                </Badge>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                {isCancelled ? (
                  <div className="space-y-2">
                    <p className="text-rose-400 font-bold">Esta reserva foi cancelada.</p>
                    <p className="text-slate-400 text-[11px]">
                      {reservation.refundAmount > 0 
                        ? `Estorno de R$ ${Number(reservation.refundAmount).toFixed(2)} processado com sucesso.`
                        : "Cancelamento efetuado sem estorno conforme as políticas contratadas."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/reservations/${reservation.code || reservation.id}/calendar.ics?action=cancel`, "_blank")}
                      className="text-xs font-bold gap-1.5 h-8 rounded-xl border-slate-700 bg-slate-900 text-slate-200"
                    >
                      <span>Atualizar Minha Agenda (.ICS de Remoção)</span>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-slate-300 font-medium leading-relaxed">
                        {cancelPol.explanation}
                      </p>
                      {cancelPol.isEligibleForRefund && (
                        <p className="text-emerald-400 font-bold text-[11px]">
                          ✓ Elegível a 100% de estorno integral (R$ {Number(reservation.paidAmount || reservation.totalAmount || 0).toFixed(2)})
                        </p>
                      )}
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setCancelModalOpen(true)}
                      className="shrink-0 text-xs font-bold rounded-xl h-9 px-4"
                    >
                      Cancelar Reserva
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )
        })()}

        {/* Footer WhatsApp Support */}
        <div className="text-center pt-4 space-y-2">
          <p className="text-xs text-slate-500">Dúvidas ou solicitações especiais durante sua estadia?</p>
          <a 
            href={whatsappUrl} 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Falar com a Administradora do Flat pelo WhatsApp</span>
          </a>
        </div>

      </main>

      {/* Modal: Confirmação de Cancelamento e Cotação de Reembolso */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Cancelamento da Reserva
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Revise o valor do estorno calculado pelo sistema de acordo com a política vigente.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const cancelPol = calculateCancellationPolicy(
              reservation.createdAt || reservation.checkinDate,
              reservation.checkinDate,
              Number(reservation.paidAmount || reservation.totalAmount || 0)
            )

            return (
              <div className="space-y-4 py-2">
                <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
                  cancelPol.isEligibleForRefund 
                    ? "bg-emerald-950/40 border-emerald-800 text-emerald-200" 
                    : "bg-rose-950/40 border-rose-800 text-rose-200"
                }`}>
                  <div className="flex items-center justify-between font-bold text-sm">
                    <span>Reembolso Estimado:</span>
                    <span className="text-base font-black">
                      {cancelPol.isEligibleForRefund 
                        ? `R$ ${Number(reservation.paidAmount || reservation.totalAmount || 0).toFixed(2)} (100%)` 
                        : "R$ 0,00 (Sem Reembolso)"}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    {cancelPol.explanation}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-300">Motivo do cancelamento (opcional):</Label>
                  <Input
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="Ex: Imprevisto de trabalho, remarcação..."
                    className="bg-slate-950 border-slate-800 text-xs h-9 rounded-xl text-white"
                  />
                </div>

                <DialogFooter className="gap-2 sm:gap-0 pt-2">
                  <Button variant="outline" onClick={() => setCancelModalOpen(false)} className="rounded-xl border-slate-700 text-slate-200">
                    Manter Reserva
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={cancelling}
                    onClick={async () => {
                      setCancelling(true)
                      try {
                        const res = await fetch(`/api/pms/guest-portal/${code}/cancel`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reason: cancelReason })
                        })
                        const json = await res.json()
                        if (res.ok) {
                          setCancelModalOpen(false)
                          fetchPortalData()
                        } else {
                          alert(json.error || "Erro ao cancelar")
                        }
                      } catch {
                        alert("Erro de conexão com o servidor")
                      } finally {
                        setCancelling(false)
                      }
                    }}
                    className="font-bold text-xs rounded-xl"
                  >
                    {cancelling ? "Cancelando..." : "Sim, Cancelar Agora"}
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal: Regras da Casa & Contrato (Com Abas) */}
      <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Regras dos Flats & Contrato de Hospedagem
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Termos aceitos no momento da reserva para a garantia de uma excelente estadia.
            </DialogDescription>
          </DialogHeader>

          {/* Abas */}
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setTermsModalTab("rules")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                termsModalTab === "rules"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              🏡 1. Regras do Imóvel e Conveniência
            </button>
            <button
              type="button"
              onClick={() => setTermsModalTab("contract")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                termsModalTab === "contract"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              📜 2. Termos e Condições Contratuais
            </button>
          </div>

          <div className="py-3 text-xs leading-relaxed text-slate-300 whitespace-pre-line bg-slate-950 p-4 rounded-2xl border border-slate-800 font-sans max-h-96 overflow-y-auto">
            {termsModalTab === "rules" ? (
              data?.houseRules || termsAndRules
            ) : (
              data?.contractTerms || termsAndRules
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setTermsModalOpen(false)} className="w-full bg-primary font-bold text-xs">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
