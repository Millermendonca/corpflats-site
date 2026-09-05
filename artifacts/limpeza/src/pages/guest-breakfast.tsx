import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Coffee, Clock, Home as HomeIcon, CheckCircle2, 
  Sparkles, ChevronRight, ChevronLeft, Utensils, Copy, Apple, Cookie, Milk, User, Users,
  AlertTriangle, Layers, MessageCircle, ArrowLeft, Check, Calendar, ArrowRight, RotateCcw
} from "lucide-react"
import { format, addDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useLocation } from "wouter"

interface GuestPreference {
  coffee: string
  otherBeverage: string
  breads: string[]
  accompaniments: string[]
  complements: string[]
  sweets: string[]
  fruit: string
  fruitHoney?: boolean
  fruitSaladOption?: string
  sweetener: string
}

const defaultGuestPref: GuestPreference = {
  coffee: "Café com leite",
  otherBeverage: "Suco de laranja",
  breads: ["Pão francês", "Pão de queijo"],
  accompaniments: ["Queijo mussarela", "Presunto"],
  complements: ["Manteiga"],
  sweets: ["Bolo do dia"],
  fruit: "Banana",
  fruitHoney: false,
  fruitSaladOption: "Salada pura",
  sweetener: "Açúcar"
}

export default function GuestBreakfast() {
  const [, setLocation] = useLocation()
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [stdConfig, setStdConfig] = useState<any>(null)
  const [stdFruitOption, setStdFruitOption] = useState("Fruta do dia")
  const [siteConfig, setSiteConfig] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)

  // Step 1: Identificação do Quarto e Agendamento Geral
  const [roomNumber, setRoomNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [guestCount, setGuestCount] = useState<1 | 2 | 3>(2)
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"))
  const [deliveryTime, setDeliveryTime] = useState("08:00")
  const [notes, setNotes] = useState("")

  // Tipo de Pedido quando unificado / mesmo para todos: "standard" (Café Padrão) | "custom" (Personalizado)
  const [breakfastType, setBreakfastType] = useState<"standard" | "custom">("standard")

  // Distribuição do pedido quando guestCount > 1: "same_for_all" (o mesmo para todos) | "individual" (personalizar por hóspede)
  const [orderDistribution, setOrderDistribution] = useState<"same_for_all" | "individual">("same_for_all")

  // Tipo individual quando no modo personalizado por hóspede ("standard" ou "custom")
  const [guest1Type, setGuest1Type] = useState<"standard" | "custom">("standard")
  const [guest2Type, setGuest2Type] = useState<"standard" | "custom">("standard")
  const [guest3Type, setGuest3Type] = useState<"standard" | "custom">("standard")

  // Nomes individuais de cada hóspede
  const [guest1Name, setGuest1Name] = useState("")
  const [guest2Name, setGuest2Name] = useState("")
  const [guest3Name, setGuest3Name] = useState("")

  // Modal para Repetir Pedido Rapidamente
  const [repeatModalOpen, setRepeatModalOpen] = useState(false)

  // Preferências por hóspede
  const [guest1Pref, setGuest1Pref] = useState<GuestPreference>({ ...defaultGuestPref })
  const [guest2Pref, setGuest2Pref] = useState<GuestPreference>({ ...defaultGuestPref })
  const [guest3Pref, setGuest3Pref] = useState<GuestPreference>({ ...defaultGuestPref })

  // Controle da Aba Ativa no modo individual (1, 2 ou 3)
  const [activeGuestTab, setActiveGuestTab] = useState<1 | 2 | 3>(1)

  const [submitting, setSubmitting] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null)
  const [loadedFromReservation, setLoadedFromReservation] = useState(false)
  const [reservationData, setReservationData] = useState<any | null>(null)
  const [breakfastDays, setBreakfastDays] = useState<any[]>([])
  const [nowBrasilia, setNowBrasilia] = useState<any>(null)
  const [selectedRepeatDates, setSelectedRepeatDates] = useState<string[]>([])
  const [repeatAllDays, setRepeatAllDays] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = parseISO(dateStr)
      return format(d, "dd/MM (EEE)", { locale: ptBR })
    } catch {
      return dateStr
    }
  }

  const loadReservationContext = async (code: string) => {
    setLoadingContext(true)
    try {
      const res = await fetch(`/api/breakfast/reservation-context?res=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (res.ok && data?.reservation) {
        const r = data.reservation
        setReservationData(r)
        setLoadedFromReservation(true)
        setBreakfastDays(data.breakfastDates || [])
        setNowBrasilia(data.nowBrasilia || null)

        if (r.flatNumber || r.flatId) setRoomNumber(String(r.flatNumber || r.flatId))
        if (r.guestName) setGuest1Name(r.guestName)
        if (r.guestPhone) setPhone(r.guestPhone)
        if (r.guestCount) {
          const count = Math.min(3, Math.max(1, Number(r.guestCount || 1))) as 1 | 2 | 3
          setGuestCount(count)
        }
        if (r.guests && Array.isArray(r.guests)) {
          if (r.guests[0]?.name) setGuest1Name(r.guests[0].name)
          if (r.guests[1]?.name) setGuest2Name(r.guests[1].name)
          if (r.guests[2]?.name) setGuest3Name(r.guests[2].name)
        }

        const dates: any[] = data.breakfastDates || []
        const pendingOpen = dates.find(d => d.status === "pending" && d.isOpen)
        const firstOpen = dates.find(d => d.isOpen)
        const chosen = pendingOpen?.date || firstOpen?.date || dates[0]?.date
        if (chosen) {
          setDeliveryDate(chosen)
        }
      } else if (data?.error) {
        setContextError(data.error)
      }
    } catch (err) {
      console.error("Falha ao carregar contexto da reserva:", err)
    } finally {
      setLoadingContext(false)
    }
  }

  // Branding & Configurações Oficiais
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})

    fetch("/api/site-content")
      .then(r => r.json())
      .then(d => setSiteConfig(d))
      .catch(() => {})
  }, [])

  const brandName = siteConfig?.branding?.brandName && !siteConfig.branding.brandName.includes("Macaé") 
    ? siteConfig.branding.brandName 
    : "CorpFlats"
  const whatsappNumber = siteConfig?.branding?.whatsapp || settings?.adminWhatsApp || "5522997124021"
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Olá! Gostaria de falar sobre o café da manhã no flat.")}`

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resCode = params.get("res") || params.get("code") || params.get("token") || params.get("reserva")
    const roomParam = params.get("room") || params.get("quarto")
    const nameParam = params.get("nome") || params.get("name")

    if (resCode) {
      loadReservationContext(resCode)
    } else {
      if (roomParam) setRoomNumber(roomParam)
      if (nameParam) setGuest1Name(nameParam)
    }
  }, [])

  // Gera horários padrão das 05:00 às 09:30 a cada 7 minutos
  const generateDefaultSlots = () => {
    const arr: string[] = []
    for (let m = 5 * 60; m <= 9 * 60 + 30; m += 7) {
      const h = Math.floor(m / 60)
      const min = m % 60
      arr.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
    }
    return arr
  }

  // Fetch slots livres e configuração padrão na data
  useEffect(() => {
    setLoadingSlots(true)
    fetch(`/api/breakfast/available-slots?date=${deliveryDate}`)
      .then(res => res.json())
      .then(data => {
        let slotsList: string[] = []
        if (Array.isArray(data?.availableSlots) && data.availableSlots.length > 0) {
          slotsList = data.availableSlots
        } else if (Array.isArray(data?.slots) && data.slots.length > 0) {
          slotsList = data.slots.filter((s: any) => s.isAvailable !== false).map((s: any) => s.time || s)
        } else {
          slotsList = generateDefaultSlots()
        }

        setAvailableSlots(slotsList)
        if (slotsList.length > 0 && !slotsList.includes(deliveryTime)) {
          setDeliveryTime(slotsList[0])
        }
      })
      .catch(() => {
        const fallback = generateDefaultSlots()
        setAvailableSlots(fallback)
      })
      .finally(() => setLoadingSlots(false))

    fetch("/api/breakfast/standard-config")
      .then(res => res.json())
      .then(cfg => {
        if (cfg) {
          setStdConfig(cfg)
          if (cfg.fruitSelected) setStdFruitOption(cfg.fruitSelected)
        }
      })
      .catch(() => {})
  }, [deliveryDate])

  const g1Label = guest1Name.trim() ? guest1Name.trim().split(" ")[0] : "1º Hóspede"
  const g2Label = guest2Name.trim() ? guest2Name.trim().split(" ")[0] : "2º Hóspede"
  const g3Label = guest3Name.trim() ? guest3Name.trim().split(" ")[0] : "3º Hóspede"

  const getCurrentGuestName = () => {
    if (activeGuestTab === 1) return guest1Name
    if (activeGuestTab === 2) return guest2Name
    return guest3Name
  }

  const setCurrentGuestName = (val: string) => {
    if (activeGuestTab === 1) setGuest1Name(val)
    else if (activeGuestTab === 2) setGuest2Name(val)
    else setGuest3Name(val)
  }

  const getCurrentType = () => {
    if (orderDistribution === "same_for_all" || guestCount === 1) return breakfastType
    if (activeGuestTab === 1) return guest1Type
    if (activeGuestTab === 2) return guest2Type
    return guest3Type
  }

  const setCurrentType = (type: "standard" | "custom") => {
    if (orderDistribution === "same_for_all" || guestCount === 1) {
      setBreakfastType(type)
    } else {
      if (activeGuestTab === 1) setGuest1Type(type)
      else if (activeGuestTab === 2) setGuest2Type(type)
      else setGuest3Type(type)
    }
  }

  const getCurrentPref = () => {
    if (activeGuestTab === 1) return guest1Pref
    if (activeGuestTab === 2) return guest2Pref
    return guest3Pref
  }

  const updateCurrentPref = (updates: Partial<GuestPreference>) => {
    if (activeGuestTab === 1) setGuest1Pref(prev => ({ ...prev, ...updates }))
    else if (activeGuestTab === 2) setGuest2Pref(prev => ({ ...prev, ...updates }))
    else setGuest3Pref(prev => ({ ...prev, ...updates }))
  }

  const toggleArrayItem = (key: "breads" | "accompaniments" | "complements" | "sweets", item: string, max: number) => {
    const current = getCurrentPref()[key]

    if (item === "Não quero nenhum desses") {
      updateCurrentPref({ [key]: current.includes(item) ? [] : ["Não quero nenhum desses"] })
      return
    }

    const cleanedCurrent = current.filter(i => i !== "Não quero nenhum desses")

    if (cleanedCurrent.includes(item)) {
      updateCurrentPref({ [key]: cleanedCurrent.filter(i => i !== item) })
    } else {
      if (cleanedCurrent.length < max) {
        updateCurrentPref({ [key]: [...cleanedCurrent, item] })
      } else {
        alert(`Você pode escolher no máximo ${max} opções nesta categoria.`)
      }
    }
  }

  const handleCopyGuest1To2 = () => {
    setGuest2Type(guest1Type)
    setGuest2Pref({ ...guest1Pref })
    alert(`As escolhas de ${g1Label} foram copiadas para ${g2Label}!`)
  }

  // Executa o envio final consolidado
  const executeSubmit = async (g1: string, g2: string, g3: string, isStd: boolean, p1: GuestPreference, p2: GuestPreference, p3: GuestPreference) => {
    setSubmitting(true)
    try {
      const stdItemPref: GuestPreference = { 
        ...defaultGuestPref, 
        coffee: "Café, Leite", 
        fruit: "Fruta do dia" 
      }

      const isUnified = orderDistribution === "same_for_all" || guestCount === 1

      const guestChoices = [
        { 
          guestIndex: 1, 
          guestName: g1, 
          deliveryTime,
          isStandard: isUnified ? isStd : guest1Type === "standard",
          ...(isUnified ? (isStd ? stdItemPref : p1) : (guest1Type === "standard" ? stdItemPref : p1))
        }
      ]

      if (guestCount >= 2) {
        guestChoices.push({ 
          guestIndex: 2, 
          guestName: g2 || "2º Hóspede", 
          deliveryTime,
          isStandard: isUnified ? isStd : guest2Type === "standard",
          ...(isUnified ? (isStd ? stdItemPref : p2) : (guest2Type === "standard" ? stdItemPref : p2))
        })
      }

      if (guestCount === 3) {
        guestChoices.push({ 
          guestIndex: 3, 
          guestName: g3 || "Hóspede 3", 
          deliveryTime,
          isStandard: isUnified ? isStd : guest3Type === "standard",
          ...(isUnified ? (isStd ? stdItemPref : p3) : (guest3Type === "standard" ? stdItemPref : p3))
        })
      }

      const allDatesToSubmit = Array.from(new Set([deliveryDate, ...selectedRepeatDates])).filter(Boolean)

      const res = await fetch("/api/breakfast/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber,
          clientName: g1,
          phone,
          reservationCode: reservationData?.code || undefined,
          guestCount,
          deliveryDates: allDatesToSubmit,
          deliveryDate,
          deliveryTime,
          isStandard: isStd,
          fruitSelected: isStd ? "Fruta do dia" : undefined,
          orderType: isStd ? "standard" : "custom",
          orderMode: isUnified ? "unified" : "individual",
          preferences: isStd ? stdItemPref : p1,
          guestChoices,
          notes
        })
      })
      const json = await res.json()
      if (res.ok) {
        if (reservationData?.code) {
          loadReservationContext(reservationData.code)
        }
        setOrderSuccess({
          roomNumber,
          clientName: g1,
          guestCount,
          deliveryDates: allDatesToSubmit,
          deliveryDate,
          deliveryTime,
          isStandard: isStd
        })
      } else {
        alert(json.error || "Erro ao registrar o pedido de café.")
      }
    } catch (err) {
      alert("Falha de conexão ao enviar o pedido. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitOrder = async () => {
    if (!roomNumber.trim()) {
      alert("Por favor, informe o número do seu apartamento.")
      return
    }
    if (!guest1Name.trim()) {
      alert("Por favor, informe seu nome completo.")
      return
    }
    if (!deliveryTime) {
      alert("Por favor, selecione o horário de entrega.")
      return
    }

    const g1 = guest1Name.trim()
    const g2 = guest2Name.trim() || (guestCount >= 2 ? "2º Hóspede" : "")
    const g3 = guest3Name.trim() || (guestCount === 3 ? "3º Hóspede" : "")

    const stdItemPref: GuestPreference = { 
      ...defaultGuestPref, 
      coffee: "Café, Leite", 
      fruit: "Fruta do dia" 
    }

    let isOverallStandard = false
    let p1 = guest1Pref
    let p2 = guest2Pref
    let p3 = guest3Pref

    if (orderDistribution === "same_for_all" || guestCount === 1) {
      if (breakfastType === "standard") {
        isOverallStandard = true
        p1 = stdItemPref
        p2 = stdItemPref
        p3 = stdItemPref
      } else {
        isOverallStandard = false
        p1 = guest1Pref
        p2 = guest1Pref
        p3 = guest1Pref
      }
    } else {
      isOverallStandard = (guest1Type === "standard" && guest2Type === "standard" && (guestCount < 3 || guest3Type === "standard"))
      p1 = guest1Type === "standard" ? stdItemPref : guest1Pref
      p2 = guest2Type === "standard" ? stdItemPref : guest2Pref
      p3 = guest3Type === "standard" ? stdItemPref : guest3Pref
    }

    await executeSubmit(g1, g2, g3, isOverallStandard, p1, p2, p3)
  }

  // Tela de Bloqueio se a Reserva foi Cancelada
  if (loadedFromReservation && reservationData && (reservationData.isCancelled || reservationData.status === "cancelada" || reservationData.status === "cancelado")) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-md bg-white border border-rose-200 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl shadow-rose-200/40">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto shadow-2xs">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Reserva Cancelada</h2>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              A reserva do <strong>Apt {reservationData.flatNumber}</strong> em nome de <strong>{reservationData.guestName}</strong> consta como cancelada no calendário do hotel. O serviço de agendamento de café da manhã está indisponível para esta estadia.
            </p>
          </div>
          <div className="pt-2 space-y-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-md shadow-emerald-600/20"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Falar com a Recepção no WhatsApp</span>
            </a>
          </div>
        </Card>
      </div>
    )
  }

  // Tela de Bloqueio se a Reserva NÃO tiver Café da Manhã Incluso
  if (loadedFromReservation && reservationData && !(reservationData.includeBreakfast || reservationData.hasBreakfast)) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl shadow-slate-200/60">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-2xs">
            <Coffee className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Café da Manhã não incluso</h2>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              A reserva do <strong>Apt {reservationData.flatNumber}</strong> em nome de <strong>{reservationData.guestName}</strong> foi contratada sem a inclusão da tarifa de café da manhã.
            </p>
          </div>
          <div className="pt-2 space-y-2">
            <Button
              onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-11 rounded-xl shadow-md shadow-sky-600/20"
            >
              Voltar aos Detalhes da Reserva
            </Button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Solicitar Inclusão pelo WhatsApp</span>
            </a>
          </div>
        </Card>
      </div>
    )
  }

  // Tela de Confirmação e Sucesso
  if (orderSuccess) {
    const nextPending = breakfastDays.find(d => 
      d.status === "pending" && d.isOpen && !orderSuccess.deliveryDates?.includes(d.date) && d.date !== orderSuccess.deliveryDate
    )

    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex items-center justify-center p-4 selection:bg-sky-500 selection:text-white font-sans">
        <Card className="w-full max-w-lg bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl shadow-slate-200/60 relative overflow-hidden">
          <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pedido Confirmado com Sucesso</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Café da Manhã Agendado!
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              Seu café da manhã {orderSuccess.isStandard ? 'Padrão Completo' : 'Personalizado'} será preparado com todo o carinho para {orderSuccess.guestCount} {orderSuccess.guestCount === 1 ? 'pessoa' : 'pessoas'} e entregue pontualmente no seu flat.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 bg-slate-50/80 rounded-2xl border border-slate-200 text-xs text-left">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Apartamento</span>
              <span className="font-black text-xl text-slate-900">Apt {orderSuccess.roomNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Data(s) e Horário</span>
              <span className="font-black text-sm text-emerald-600 flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {orderSuccess.deliveryDates && orderSuccess.deliveryDates.length > 1
                    ? `${orderSuccess.deliveryDates.length} dias às ${orderSuccess.deliveryTime}`
                    : `${formatDateDisplay(orderSuccess.deliveryDate)} às ${orderSuccess.deliveryTime}`}
                </span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Variação de até ±10 min</span>
            </div>
            <div className="pt-2.5 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Hóspede Titular</span>
              <span className="font-bold text-slate-800 truncate block mt-0.5">{orderSuccess.clientName}</span>
            </div>
            <div className="pt-2.5 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tipo do Pedido</span>
              <span className="font-bold text-sky-600 block mt-0.5">
                {orderSuccess.isStandard ? '☕ Café Padrão' : '🎨 Personalizado'}
              </span>
            </div>
          </div>

          {orderSuccess.deliveryDates && orderSuccess.deliveryDates.length > 1 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-left text-xs text-emerald-900">
              <span className="font-bold block">Entregas programadas para:</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {orderSuccess.deliveryDates.map((d: string) => (
                  <Badge key={d} variant="outline" className="bg-white border-emerald-300 text-emerald-800 font-mono text-[10px]">
                    ✓ {formatDateDisplay(d)} às {orderSuccess.deliveryTime}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Aviso se ainda há dias pendentes na estadia */}
          {nextPending && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-left space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-sky-900 font-black text-xs">
                <Calendar className="w-4 h-4 text-sky-600" />
                <span>Deseja agendar os outros dias da estadia?</span>
              </div>
              <p className="text-[11px] text-sky-800 leading-relaxed font-medium">
                Você ainda não montou o pedido para o dia <strong>{formatDateDisplay(nextPending.date)}</strong>. Você pode montá-lo agora com escolhas diferentes ou voltar mais tarde neste mesmo link.
              </p>
              <Button
                onClick={() => {
                  setDeliveryDate(nextPending.date)
                  setSelectedRepeatDates([])
                  setRepeatAllDays(false)
                  setOrderSuccess(null)
                  setActiveGuestTab(1)
                }}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-11 rounded-xl shadow-xs"
              >
                Montar Pedido para {formatDateDisplay(nextPending.date)} Agora →
              </Button>
            </div>
          )}

          {/* Aviso Importante das Louças & Porcelanas */}
          <div className="p-4 sm:p-5 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-left space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Aviso Importante: Louças & Porcelanas CorpFlats</span>
            </div>
            <p className="text-[11px] text-amber-900/80 leading-relaxed font-medium">
              Por favor, <strong>não entregue as louças, garrafas térmicas, bandejas ou porcelanas às camareiras nem ao restaurante do prédio</strong>, e <strong>não as deixe no corredor</strong>, pois as mesmas pertencem à administração exclusiva da CorpFlats. Ao terminar, <strong>mantenha tudo dentro do apartamento</strong> que nossa equipe fará o recolhimento.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            {loadedFromReservation && reservationData?.code ? (
              <Button 
                onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-black h-12 rounded-2xl text-xs uppercase tracking-wider shadow-md shadow-sky-600/20 transition-all"
              >
                Voltar ao Portal do Hóspede
              </Button>
            ) : null}

            <Button 
              variant="outline"
              onClick={() => {
                setOrderSuccess(null)
                setActiveGuestTab(1)
              }}
              className="w-full bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold h-11 rounded-2xl text-xs uppercase tracking-wider"
            >
              Ver ou Alterar Pedidos
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const currentPref = getCurrentPref()
  const currentDayInfo = breakfastDays.find(d => d.date === deliveryDate)
  const eligibleOtherDays = breakfastDays.filter(d => d.date !== deliveryDate && d.isOpen)

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* ── Top Navigation Bar (Header Clean & Sofisticado) ──────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div 
            onClick={() => setLocation(loadedFromReservation && reservationData?.code ? `/minha-reserva/${reservationData.code}` : "/reservar")}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-sky-600 group-hover:bg-sky-700 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm transition-colors">
                CF
              </div>
            )}
            <div>
              <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-sky-600 transition-colors block leading-none">
                {brandName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loadedFromReservation && reservationData?.code && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
                className="h-8 sm:h-9 px-2.5 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs rounded-xl flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </Button>
            )}

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero Section (Banner Suave & Sofisticado) ────────────────────── */}
      <header className="relative min-h-[170px] sm:min-h-[200px] flex items-center justify-center px-4 sm:px-8 py-8 sm:py-10 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=1920&q=80"
            alt="Café da Manhã CorpFlats"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/55 to-slate-950/45" />
        </div>

        <div className="relative z-10 max-w-xl mx-auto space-y-1.5 text-white">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight drop-shadow-md text-white">
            Café da Manhã
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-200 drop-shadow-sm">
            Entregas diárias das 05h às 09h30
          </p>
        </div>
      </header>

      {/* ── Main Form Container ─────────────────────────────────────────── */}
      <main className="max-w-3xl w-full mx-auto px-4 -mt-8 sm:-mt-10 z-20 space-y-5 pb-20">
        
        {/* Quando acessado com link de reserva: Boas-vindas Acolhedora + Hub de Dias de Café da Estadia */}
        {loadedFromReservation && reservationData ? (
          <>
            {/* Card de Boas-Vindas Sofisticado */}
            <Card className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-7 shadow-xl shadow-slate-200/60 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Olá, {(guest1Name || reservationData?.guestName || "Hóspede").trim().split(" ")[0]}!
                </h2>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs py-1 px-3">
                  ✓ Incluso na estadia
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold">
                  Flat {roomNumber}
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold">
                  {guestCount} {guestCount === 1 ? 'pessoa' : 'pessoas'}
                </span>
                {breakfastDays.length > 0 && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 font-medium">
                      {breakfastDays.length} {breakfastDays.length === 1 ? 'manhã' : 'manhãs'} de café
                    </span>
                  </>
                )}
              </div>

              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                Monte o seu café da manhã selecionando as opções desejadas para a sua estadia.
              </p>
            </Card>

            {/* Hub Interativo dos Dias de Café da Estadia */}
            <Card className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs sm:text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  1. Dias de Café da Manhã da sua Estadia
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Clique no dia para montar ou visualizar</span>
              </div>

              {/* Grid com cada dia da estadia */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {breakfastDays.map((d: any) => {
                  const isSelected = deliveryDate === d.date
                  const isScheduled = d.status === "scheduled"
                  const isClosed = d.status === "closed" || d.isClosedTodayAfter5am
                  const isCancelled = d.status === "cancelled"

                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => {
                        setDeliveryDate(d.date)
                        setSelectedRepeatDates(selectedRepeatDates.filter(x => x !== d.date))
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? "bg-sky-50/90 border-sky-500 ring-2 ring-sky-500/30 shadow-xs"
                          : isScheduled
                            ? "bg-emerald-50/40 border-emerald-200 hover:border-emerald-300"
                            : isClosed
                              ? "bg-slate-50/60 border-slate-200 opacity-60 cursor-not-allowed"
                              : "bg-white border-slate-200 hover:border-sky-300"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`font-black text-xs ${isSelected ? 'text-sky-950 font-black' : 'text-slate-800'}`}>
                          {formatDateDisplay(d.date)}
                        </span>
                        {isScheduled && (
                          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] font-black px-1.5 py-0.5">
                            ✓ Agendado ({d.existingOrder?.deliveryTime || '08:00'})
                          </Badge>
                        )}
                        {!isScheduled && d.isOpen && (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-black px-1.5 py-0.5">
                            ⏳ Pendente
                          </Badge>
                        )}
                        {isClosed && (
                          <Badge className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5">
                            🔒 Encerrado
                          </Badge>
                        )}
                        {isCancelled && (
                          <Badge variant="destructive" className="text-[9px] font-bold px-1.5 py-0.5">
                            🚫 Cancelado
                          </Badge>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-500 font-medium">
                        {d.isToday 
                          ? (d.isClosedTodayAfter5am ? "Hoje (pedidos encerrados às 05:00)" : "Hoje (pedir até 05:00)")
                          : d.isPast ? "Dia finalizado" : "Manhã no Flat"}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Aviso se o dia selecionado for hoje após 05:00 */}
              {currentDayInfo?.isClosedTodayAfter5am && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-black block">Horário Limite Encerrado para Hoje (05:00)</strong>
                    <span>O serviço de café da manhã inicia pontualmente às 05:00 e não é mais possível realizar novos pedidos para o mesmo dia ({formatDateDisplay(currentDayInfo.date)}). Por favor, selecione acima a data de amanhã ou outro dia disponível para realizar o pedido.</span>
                  </div>
                </div>
              )}

              {/* Informação se o dia já tem pedido salvo */}
              {currentDayInfo?.status === "scheduled" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Você já possui um café agendado para <strong>{formatDateDisplay(currentDayInfo.date)}</strong> às <strong>{currentDayInfo.existingOrder?.deliveryTime}</strong>. Ao confirmar abaixo, você atualizará as escolhas deste dia.</span>
                </div>
              )}

              {/* Seção de Repetição em Múltiplos Dias */}
              {eligibleOtherDays.length > 0 && currentDayInfo?.isOpen && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 pt-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        Deseja repetir este pedido nos outros dias?
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Replique este mesmo cardápio e horário para os outros dias da sua estadia com 1 clique.
                      </span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 hover:border-sky-400 transition-colors shadow-2xs">
                      <input
                        type="checkbox"
                        checked={repeatAllDays}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setRepeatAllDays(checked)
                          if (checked) {
                            setSelectedRepeatDates(eligibleOtherDays.map((d: any) => d.date))
                          } else {
                            setSelectedRepeatDates([])
                          }
                        }}
                        className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                      />
                      <span className="text-xs font-black text-slate-800">Repetir em Todos</span>
                    </label>
                  </div>

                  {!repeatAllDays && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
                      {eligibleOtherDays.map((d: any) => {
                        const isChecked = selectedRepeatDates.includes(d.date)
                        return (
                          <label 
                            key={d.date} 
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                              isChecked ? 'bg-sky-50 border-sky-300 text-sky-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRepeatDates([...selectedRepeatDates, d.date])
                                  } else {
                                    setSelectedRepeatDates(selectedRepeatDates.filter(x => x !== d.date))
                                  }
                                }}
                                className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                              />
                              <span>{formatDateDisplay(d.date)}</span>
                            </div>
                            {d.status === "scheduled" && (
                              <span className="text-[9px] text-emerald-600 font-bold">Substituir existente</span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  <div className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-100 px-3 py-2 rounded-xl flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>
                      Este pedido será entregue em <strong>{1 + selectedRepeatDates.length} {1 + selectedRepeatDates.length === 1 ? 'dia' : 'dias'}</strong>: {[deliveryDate, ...selectedRepeatDates].sort().map(d => formatDateDisplay(d)).join(", ")} às {deliveryTime}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </>
        ) : (
          /* Card 1: Identificação Manual (Fallback para pedidos avulsos sem reserva vinculada) */
          <Card className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <span className="text-xs sm:text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <HomeIcon className="w-4 h-4" />
                </div>
                1. Apartamento & Identificação
              </span>
              <Badge className="bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                1 a 3 Pessoas
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <HomeIcon className="w-3.5 h-3.5 text-sky-600" />
                  Número do Apartamento *
                </Label>
                <Input 
                  value={roomNumber} 
                  onChange={e => setRoomNumber(e.target.value)} 
                  placeholder="Ex: 1017" 
                  required 
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm font-bold h-11 rounded-xl focus-visible:ring-sky-500" 
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-600" />
                  Quantidade de Pessoas *
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 2, 3] as const).map(n => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => {
                        setGuestCount(n)
                        if (activeGuestTab > n) setActiveGuestTab(1)
                      }}
                      className={`h-11 rounded-xl font-black text-xs border transition-all flex items-center justify-center gap-1 ${
                        guestCount === n 
                          ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-2 ring-sky-500/20" 
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span>{n} {n === 1 ? 'Pessoa' : 'Pessoas'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-600" />
                  Nome do Hóspede Titular *
                </Label>
                <Input 
                  value={guest1Name} 
                  onChange={e => setGuest1Name(e.target.value)} 
                  placeholder="Seu nome completo" 
                  required 
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-bold h-11 rounded-xl focus-visible:ring-sky-500" 
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-600" />
                  Data da Entrega *
                </Label>
                <Input 
                  type="date"
                  value={deliveryDate} 
                  onChange={e => setDeliveryDate(e.target.value)} 
                  required 
                  className="bg-slate-50 border-slate-200 text-slate-900 text-xs font-bold h-11 rounded-xl focus-visible:ring-sky-500" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp para Notificação (Opcional)
              </Label>
              <Input 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                placeholder="(21) 99999-9999" 
                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-semibold h-11 rounded-xl focus-visible:ring-sky-500" 
              />
            </div>
          </Card>
        )}

        {/* ── Distribuição do Pedido (Apenas quando a reserva for para mais de 1 pessoa) ── */}
        {guestCount > 1 && (
          <Card className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <span className="text-xs sm:text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                Como deseja montar o café para os {guestCount} hóspedes?
              </span>
              <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-bold">
                {guestCount} Hóspedes no Flat
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção A: O mesmo pedido para os dois */}
              <div
                onClick={() => {
                  setOrderDistribution("same_for_all")
                  setActiveGuestTab(1)
                }}
                className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 relative ${
                  orderDistribution === "same_for_all"
                    ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  orderDistribution === "same_for_all" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  <Copy className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-black text-xs sm:text-sm text-slate-900 block">
                    O mesmo pedido para os {guestCount}
                  </span>
                  <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                    Prático e rápido: monte uma única vez e ambos receberão o mesmo cardápio.
                  </p>
                </div>
              </div>

              {/* Opção B: Personalizar por hóspede */}
              <div
                onClick={() => setOrderDistribution("individual")}
                className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 relative ${
                  orderDistribution === "individual"
                    ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  orderDistribution === "individual" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-black text-xs sm:text-sm text-slate-900 block">
                    Personalizar por hóspede
                  </span>
                  <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                    Escolha itens sob medida para cada hóspede.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Opções de Café da Manhã & Cardápio (ANTES DO HORÁRIO!) ───────── */}
        <Card id="breakfast-options-section" className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <span className="text-xs sm:text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                <Utensils className="w-4 h-4" />
              </div>
              Opções de Café da Manhã
            </span>
            {guestCount > 1 && orderDistribution === "individual" ? (
              <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-200 bg-sky-50 font-bold">
                Configurando: {getCurrentGuestName() ? getCurrentGuestName().split(' ')[0] : `Hóspede ${activeGuestTab}`}
              </Badge>
            ) : null}
          </div>

          {/* Abas para alternar entre os hóspedes quando modo individual */}
          {guestCount > 1 && orderDistribution === "individual" && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Selecione para qual hóspede está montando o pedido:
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {activeGuestTab} de {guestCount}
                </span>
              </div>

              <div className="p-1.5 bg-slate-100 rounded-2xl flex gap-1.5">
                {Array.from({ length: guestCount }).map((_, i) => {
                  const idx = (i + 1) as 1 | 2 | 3
                  const isActive = activeGuestTab === idx
                  const curType = idx === 1 ? guest1Type : idx === 2 ? guest2Type : guest3Type
                  const nameLabel = idx === 1 ? g1Label : idx === 2 ? g2Label : g3Label
                  
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveGuestTab(idx)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                        isActive
                          ? "bg-white text-sky-900 shadow-xs border border-slate-200 font-black ring-2 ring-sky-500/20"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="truncate">{nameLabel}</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        curType === 'standard' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                      }`}>
                        {curType === 'standard' ? '☕ Padrão' : '🎨 Personalizado'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Botão para copiar escolhas do 1º hóspede se estiver no 2º */}
              {activeGuestTab > 1 && (
                <div className="flex items-center justify-between p-2.5 bg-sky-50/80 border border-sky-100 rounded-xl text-xs">
                  <span className="text-sky-900 font-medium text-[11px]">
                    Deseja copiar o mesmo café escolhido para {g1Label}?
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyGuest1To2}
                    className="text-sky-700 hover:text-sky-900 hover:bg-sky-100 font-bold text-xs h-7 px-2.5 rounded-lg flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar de {g1Label}</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Escolha entre Café Padrão CorpFlats vs Personalizado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Opção 1: Café Padrão CorpFlats */}
            <div 
              onClick={() => setCurrentType("standard")}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 relative ${
                getCurrentType() === "standard"
                  ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                getCurrentType() === "standard" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                <Coffee className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-xs sm:text-sm text-slate-900 block">
                    Café Padrão CorpFlats
                  </span>
                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[9px] px-1.5 py-0 shadow-2xs">
                    Recomendado ⭐
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                  Café completo tradicional pronto com: <strong>{stdConfig?.description || "Café, Leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Manteiga, Bolo do dia e Fruta do dia (Mamão, maçã ou banana)."}</strong>
                </p>
              </div>
            </div>

            {/* Opção 2: Personalizar Itens */}
            <div 
              onClick={() => setCurrentType("custom")}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 relative ${
                getCurrentType() === "custom"
                  ? "border-sky-600 bg-sky-50/70 text-slate-900 ring-2 ring-sky-500/20 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                getCurrentType() === "custom" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-xs sm:text-sm text-slate-900 block">
                    Montar / Personalizar Itens
                  </span>
                  <Badge variant="outline" className="text-slate-600 border-slate-300 text-[9px] px-1.5 py-0 font-bold">
                    Sob Medida
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                  Escolha individualmente as bebidas, pães, acompanhamentos, frutas e doces de cada hóspede.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Bloco quando selecionado: Café Personalizado */}
        {getCurrentType() === "custom" && (
          <Card id="menu-section" className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-6">
            <div className="border-b border-slate-100 pb-3.5 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  <Utensils className="w-4 h-4" />
                </div>
                Itens do Cardápio {guestCount > 1 ? `(Hóspede ${activeGuestTab} de ${guestCount})` : ''}
              </span>
              <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-200 bg-sky-50 font-bold uppercase tracking-wider">
                {guestCount > 1 ? `Etapa ${activeGuestTab} de ${guestCount}` : 'Cardápio'}
              </Badge>
            </div>

            {/* Campo de Nome do Hóspede da Aba Ativa */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-600" />
                Nome do {activeGuestTab}º Hóspede {activeGuestTab === 1 ? '(Titular)' : '(Acompanhante)'} *
              </Label>
              <Input 
                value={getCurrentGuestName()} 
                onChange={e => setCurrentGuestName(e.target.value)} 
                placeholder={activeGuestTab === 1 ? "Nome completo do titular" : `Nome do ${activeGuestTab}º hóspede`} 
                required 
                className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-bold h-10 rounded-xl focus-visible:ring-sky-500" 
              />
            </div>

            {/* 1. Café (1 opção) */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-600" /> Café (Escolha 1 opção)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  "Café",
                  "Café com leite",
                  "Não quero café"
                ].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateCurrentPref({ coffee: opt })}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                      currentPref.coffee === opt
                        ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {currentPref.coffee === opt ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Outras Bebidas (1 opção) */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Milk className="w-3.5 h-3.5 text-sky-600" /> Outras Bebidas (Escolha 1 opção)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  "Achocolatado gelado",
                  "Água",
                  "Suco de laranja",
                  "Vitamina de banana com iogurte de morango",
                  "Nenhuma outra bebida"
                ].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateCurrentPref({ otherBeverage: opt })}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                      currentPref.otherBeverage === opt
                        ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {currentPref.otherBeverage === opt ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Pães (até 2 opções) */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  🍞 Pães (Escolha até 2 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-200 bg-sky-50 font-bold">
                  {currentPref.breads.length}/2 selecionados
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "Pão francês",
                  "Pão de queijo"
                ].map(opt => {
                  const isChecked = currentPref.breads.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArrayItem("breads", opt, 2)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        isChecked
                          ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isChecked ? "✓ " : ""}{opt}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 4. Acompanhamentos (até 4 opções) */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  🧈 Acompanhamentos (Escolha até 4 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-200 bg-sky-50 font-bold">
                  {currentPref.accompaniments.length}/4 selecionados
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  "Queijo prato",
                  "Queijo mussarela",
                  "Queijo Minas frescal",
                  "Peito de Peru",
                  "Presunto",
                  "Ovos mexidos"
                ].map(opt => {
                  const isChecked = currentPref.accompaniments.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArrayItem("accompaniments", opt, 4)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        isChecked
                          ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isChecked ? "✓ " : ""}{opt}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 5. Complementos (até 2 opções) */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Complementos (Escolha até 2 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-200 bg-sky-50 font-bold">
                  {currentPref.complements.length}/2 selecionados
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "Manteiga",
                  "Requeijão"
                ].map(opt => {
                  const isChecked = currentPref.complements.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArrayItem("complements", opt, 2)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        isChecked
                          ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isChecked ? "✓ " : ""}{opt}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 6. Doces e Biscoitos (até 2 opções) */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Cookie className="w-3.5 h-3.5 text-amber-600" /> Doces e Biscoitos (Escolha até 2 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-sky-700 border-sky-200 bg-sky-50 font-bold">
                  {currentPref.sweets.length}/2 selecionados
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  "Bolo do dia",
                  "Torradas amanteigadas",
                  "Casadinho (biscoito com goiabada)",
                  "Não quero nenhum desses"
                ].map(opt => {
                  const isChecked = currentPref.sweets.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArrayItem("sweets", opt, 2)}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        isChecked
                          ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-1 ring-sky-400"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isChecked ? "✓ " : ""}{opt}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 7. Frutas (1 opção + Condicionais) */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Apple className="w-3.5 h-3.5 text-emerald-600" /> Frutas (Escolha 1 opção)
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  "Maçã",
                  "Banana",
                  "Mamão",
                  "Salada de frutas",
                  "Nenhuma fruta"
                ].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateCurrentPref({ fruit: opt })}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                      currentPref.fruit === opt
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs ring-1 ring-emerald-400"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {currentPref.fruit === opt ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>

              {/* Condicional Mamão: Deseja Mel? */}
              {currentPref.fruit === "Mamão" && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl space-y-2 animate-in fade-in">
                  <span className="text-xs font-bold text-amber-900 block">Deseja mel no seu Mamão?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentPref({ fruitHoney: true })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        currentPref.fruitHoney 
                          ? "bg-amber-500 text-white border-amber-500 shadow-xs" 
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      🍯 Sim, com mel
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentPref({ fruitHoney: false })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        !currentPref.fruitHoney 
                          ? "bg-amber-500 text-white border-amber-500 shadow-xs" 
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Sem mel
                    </button>
                  </div>
                </div>
              )}

              {/* Condicional Salada de Frutas: Opções */}
              {currentPref.fruit === "Salada de frutas" && (
                <div className="p-3.5 bg-sky-50/80 border border-sky-200/80 rounded-2xl space-y-2 animate-in fade-in">
                  <span className="text-xs font-bold text-sky-900 block">Como prefere sua Salada de Frutas?</span>
                  <div className="grid grid-cols-3 gap-2">
                    {["Salada pura", "Mel", "Leite condensado"].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateCurrentPref({ fruitSaladOption: opt })}
                        className={`p-2.5 rounded-xl text-xs font-bold border truncate transition-all ${
                          currentPref.fruitSaladOption === opt 
                            ? "bg-sky-600 text-white border-sky-600 shadow-xs" 
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 8. Açúcar ou Adoçante */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <Label className="text-xs font-bold text-slate-800">Açúcar ou Adoçante</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  "Açúcar",
                  "Adoçante",
                  "Ambos",
                  "Nenhum"
                ].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateCurrentPref({ sweetener: opt })}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                      currentPref.sweetener === opt
                        ? "bg-slate-800 text-white border-slate-800 shadow-xs ring-1 ring-slate-700 font-bold"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {currentPref.sweetener === opt ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Ação Rápida: Repetir o Mesmo Pedido do 1º Hóspede para Todos e Finalizar */}
            {guestCount > 1 && (
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <span className="text-xs text-slate-500 text-center sm:text-left font-medium">
                  Deseja o mesmo café do 1º hóspede para todos?
                </span>
                <Button
                  type="button"
                  onClick={() => setRepeatModalOpen(true)}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Repetir Pedido do 1º e Finalizar</span>
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Card 2: Horário Único de Entrega para o Apartamento */}
        <Card className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <span className="text-xs sm:text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              2. Horário de Entrega no Apartamento
            </span>
            <span className="text-[10px] text-slate-500 font-medium">05:00 às 09:30 (±10 min)</span>
          </div>

          {loadingSlots ? (
            <div className="p-8 text-center text-xs text-slate-400 animate-pulse font-medium">
              Carregando horários disponíveis para {deliveryDate}...
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs text-center font-medium">
              Sem horários disponíveis para esta data. Por favor, contate a recepção pelo WhatsApp.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 pr-2">
              {availableSlots.map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setDeliveryTime(t)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                    deliveryTime === t
                      ? "bg-sky-600 text-white border-sky-600 shadow-xs ring-2 ring-sky-500/20 font-black"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Card 4: Observações Gerais */}
        <Card className="bg-white shadow-xl shadow-slate-200/60 border border-slate-200/80 rounded-3xl p-5 sm:p-7 space-y-2.5">
          <Label className="text-xs font-bold text-slate-800 block">
            Observações
          </Label>
          <Textarea 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            placeholder="" 
            className="bg-slate-50 border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 resize-none h-20 rounded-2xl focus-visible:ring-sky-500" 
          />
        </Card>

        {/* Card 5: Aviso Importante de Louças & Porcelanas */}
        <Card className="bg-amber-50/90 border border-amber-200/90 rounded-3xl p-5 sm:p-6 shadow-md space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Aviso Importante: Louças & Porcelanas CorpFlats</span>
          </div>
          <p className="text-xs text-amber-900/85 leading-relaxed font-medium">
            Por favor, <strong>não entregue as louças, garrafas, bandejas ou porcelanas às camareiras nem ao restaurante do prédio</strong>, e <strong>não as deixe no corredor</strong>. Todo o material pertence à administração exclusiva da CorpFlats. Ao finalizar seu café, <strong>mantenha tudo dentro do apartamento</strong> que nossa equipe fará o recolhimento.
          </p>
        </Card>

        {/* ── Botão de Envio Consolidado ── */}
        <div className="space-y-2.5 pt-2">
          <Button 
            type="button" 
            onClick={handleSubmitOrder}
            disabled={submitting}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-black text-sm sm:text-base h-14 rounded-2xl shadow-lg shadow-sky-600/25 gap-2 tracking-wide uppercase transition-all transform active:scale-98"
          >
            {submitting ? (
              <span>Agendando com a cozinha...</span>
            ) : (
              <>
                <Coffee className="w-5 h-5 text-white" />
                <span>Confirmar Pedido de Café da Manhã ({guestCount} {guestCount === 1 ? 'Pessoa' : 'Pessoas'}) 🚀</span>
              </>
            )}
          </Button>
          <p className="text-xs text-slate-500 text-center font-medium">
            O café será entregue no Flat {roomNumber || '...'} às {deliveryTime || '...'} no dia {formatDateDisplay(deliveryDate)}.
          </p>
        </div>
      </main>

      {/* ── Footer Corporativo / Hospitalidade ────────────────────────── */}
      <footer className="bg-white border-t border-slate-200/80 py-8 px-4 text-center text-xs text-slate-500 space-y-2 mt-auto">
        <div className="flex items-center justify-center gap-2 font-black text-sm text-slate-800">
          <span>{brandName}</span>
          <span className="text-slate-300">•</span>
          <span className="text-sky-600 font-bold text-xs">Room Service & Hospitalidade</span>
        </div>
        <p className="text-[11px] text-slate-400">
          Edifício Soho Residence Service • Campos dos Goytacazes, RJ
        </p>
        <p className="text-[10px] text-slate-400">
          © {new Date().getFullYear()} {brandName}. Todos os direitos reservados.
        </p>
      </footer>

      {/* Modal: Repetir Pedido do 1º Hóspede para Todos e Finalizar */}
      <Dialog open={repeatModalOpen} onOpenChange={setRepeatModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 text-slate-900 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-black text-lg">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Copy className="w-4 h-4" />
              </div>
              Repetir Pedido do 1º Hóspede
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs leading-relaxed">
              Os mesmos itens e horário de entrega de <strong>{guest1Name || '1º Hóspede'}</strong> serão preparados para todos. Informe o nome dos demais hóspedes para finalizarmos:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Nome do 2º Hóspede (Acompanhante) *</Label>
              <Input 
                value={guest2Name}
                onChange={e => setGuest2Name(e.target.value)}
                placeholder="Ex: Maria da Silva"
                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-bold h-11 rounded-xl focus-visible:ring-sky-500"
              />
            </div>

            {guestCount === 3 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Nome do 3º Hóspede *</Label>
                <Input 
                  value={guest3Name}
                  onChange={e => setGuest3Name(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-bold h-11 rounded-xl focus-visible:ring-sky-500"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setRepeatModalOpen(false)}
              className="border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancelar
            </Button>
            <Button 
              type="button" 
              onClick={handleConfirmRepeatAndSubmit}
              disabled={submitting}
              className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-10 rounded-xl uppercase tracking-wider flex-1 shadow-md shadow-sky-600/20"
            >
              {submitting ? "Confirmando..." : "Confirmar & Finalizar Pedido 🚀"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
