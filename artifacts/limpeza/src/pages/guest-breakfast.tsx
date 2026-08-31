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
  Sparkles, ChevronRight, ChevronLeft, Utensils, Copy, Apple, Cookie, Milk, User, AlertTriangle, Layers
} from "lucide-react"
import { format, addDays } from "date-fns"

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
  fruit: "Fruta do dia",
  fruitHoney: false,
  fruitSaladOption: "Salada pura",
  sweetener: "Açúcar"
}

export default function GuestBreakfast() {
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [stdConfig, setStdConfig] = useState<any>(null)

  // Step 1: Identificação do Quarto e Agendamento Geral
  const [roomNumber, setRoomNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [guestCount, setGuestCount] = useState<1 | 2 | 3>(2)
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"))
  const [deliveryTime, setDeliveryTime] = useState("08:00")
  const [notes, setNotes] = useState("")

  // Tipo de Pedido: "standard" (Café Padrão Completo) | "custom" (Personalizado)
  const [breakfastType, setBreakfastType] = useState<"standard" | "custom">("standard")

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

  // Controle da Aba / Etapa Ativa no modo personalizado (1, 2 ou 3)
  const [activeGuestTab, setActiveGuestTab] = useState<1 | 2 | 3>(1)

  const [submitting, setSubmitting] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null)
  const [loadedFromReservation, setLoadedFromReservation] = useState(false)
  const [reservationData, setReservationData] = useState<any | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resCode = params.get("res") || params.get("code") || params.get("reserva")
    const roomParam = params.get("room") || params.get("quarto")
    const nameParam = params.get("nome") || params.get("name")

    if (resCode) {
      fetch(`/api/pms/guest-portal/${resCode}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.reservation) {
            const res = data.reservation
            setReservationData(res)
            setLoadedFromReservation(true)
            if (res.flatNumber || res.flatId) setRoomNumber(String(res.flatNumber || res.flatId))
            if (res.guestName) setGuest1Name(res.guestName)
            if (res.guestPhone) setPhone(res.guestPhone)
            if (res.adults || res.guestCount) {
              const count = Math.min(3, Math.max(1, Number(res.adults || res.guestCount || 1))) as 1 | 2 | 3
              setGuestCount(count)
            }
            if (res.checkinDate) setDeliveryDate(res.checkinDate)
          }
        })
        .catch(() => {})
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

  const handleNextStep = () => {
    if (!roomNumber.trim()) {
      alert("Por favor, informe o número do seu apartamento.")
      return
    }
    if (activeGuestTab === 1 && !guest1Name.trim()) {
      alert("Por favor, informe o nome do 1º hóspede.")
      return
    }
    if (!deliveryTime) {
      alert("Por favor, selecione o horário para a entrega do café.")
      return
    }

    if (activeGuestTab < guestCount) {
      const next = (activeGuestTab + 1) as 2 | 3
      setActiveGuestTab(next)
      window.scrollTo({ top: 220, behavior: "smooth" })
    }
  }

  // Executa o envio final consolidado
  const executeSubmit = async (g1: string, g2: string, g3: string, isStd: boolean, p1: GuestPreference, p2: GuestPreference, p3: GuestPreference) => {
    setSubmitting(true)
    try {
      const guestChoices = [
        { 
          guestIndex: 1, 
          guestName: g1, 
          deliveryTime,
          ...(isStd ? defaultGuestPref : p1)
        }
      ]

      if (guestCount >= 2) {
        guestChoices.push({ 
          guestIndex: 2, 
          guestName: g2 || "Hóspede 2", 
          deliveryTime,
          ...(isStd ? defaultGuestPref : p2)
        })
      }

      if (guestCount === 3) {
        guestChoices.push({ 
          guestIndex: 3, 
          guestName: g3 || "Hóspede 3", 
          deliveryTime,
          ...(isStd ? defaultGuestPref : p3)
        })
      }

      const res = await fetch("/api/breakfast/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber,
          clientName: g1,
          phone,
          reservationCode: reservationData?.code || undefined,
          guestCount,
          deliveryDate,
          deliveryTime,
          isStandard: isStd,
          fruitSelected: isStd ? "Fruta do dia" : undefined,
          orderType: isStd ? "standard" : "custom",
          orderMode: isStd ? "unified" : "individual",
          preferences: isStd ? defaultGuestPref : p1,
          guestChoices,
          notes
        })
      })
      const json = await res.json()
      if (res.ok) {
        setOrderSuccess(json.order || {
          roomNumber,
          clientName: g1,
          guestCount,
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

  const handleStandardSubmit = async () => {
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

    await executeSubmit(g1, g2, g3, true, defaultGuestPref, defaultGuestPref, defaultGuestPref)
  }

  const handleCustomFinalSubmit = async () => {
    if (!roomNumber.trim()) {
      alert("Por favor, informe o número do apartamento.")
      return
    }
    if (!guest1Name.trim()) {
      alert("Por favor, informe o nome do titular (1º Hóspede).")
      return
    }
    if (!deliveryTime) {
      alert("Por favor, selecione o horário de entrega.")
      return
    }

    const g1 = guest1Name.trim()
    const g2 = guest2Name.trim() || "Hóspede 2"
    const g3 = guest3Name.trim() || "Hóspede 3"

    await executeSubmit(g1, g2, g3, false, guest1Pref, guest2Pref, guest3Pref)
  }

  // Handler para Repetir Pedido do 1º Hóspede e Enviar Imediatamente
  const handleConfirmRepeatAndSubmit = async () => {
    if (!roomNumber.trim()) {
      alert("Por favor, informe o número do apartamento.")
      return
    }
    if (!guest1Name.trim()) {
      alert("Por favor, informe o nome do 1º hóspede.")
      return
    }
    if (!guest2Name.trim()) {
      alert("Por favor, informe o nome do 2º hóspede.")
      return
    }
    if (guestCount === 3 && !guest3Name.trim()) {
      alert("Por favor, informe o nome do 3º hóspede.")
      return
    }

    setRepeatModalOpen(false)

    setGuest2Pref({ ...guest1Pref })
    setGuest3Pref({ ...guest1Pref })

    const g1 = guest1Name.trim()
    const g2 = guest2Name.trim()
    const g3 = guest3Name.trim() || "Hóspede 3"

    await executeSubmit(g1, g2, g3, false, guest1Pref, guest1Pref, guest1Pref)
  }

  // Tela de Bloqueio se a Reserva NÃO tiver Café da Manhã Incluso
  if (loadedFromReservation && reservationData && !(reservationData.includeBreakfast || reservationData.hasBreakfast)) {
    return (
      <div className="min-h-screen bg-[#141210] text-[#f4efe8] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-[#1c1917] border border-amber-500/20 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto shadow-inner">
            <Coffee className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white">Café da Manhã não incluso</h2>
            <p className="text-xs text-slate-400 leading-relaxed pt-1">
              A reserva do <strong>Apt {reservationData.flatNumber}</strong> no nome de <strong>{reservationData.guestName}</strong> foi contratada sem o serviço de café da manhã.
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => window.location.href = `/minha-reserva/${reservationData.code}`}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-11 rounded-2xl shadow-lg"
            >
              Voltar aos Detalhes da Reserva
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // Tela de Confirmação e Sucesso
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-[#141210] text-[#f4efe8] flex items-center justify-center p-4 selection:bg-amber-500 selection:text-black">
        <Card className="w-full max-w-lg bg-[#1c1917] border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] uppercase tracking-widest font-black text-amber-400 block">
              ✦ CorpFlats • Room Service & Gastronomia
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Café da Manhã Agendado!
            </h1>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">
              Sua cesta {orderSuccess.isStandard ? 'Padrão Completa' : 'Personalizada'} será preparada com todo carinho para {orderSuccess.guestCount} {orderSuccess.guestCount === 1 ? 'pessoa' : 'pessoas'} e entregue pontualmente no seu quarto.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 p-4 bg-[#141210]/90 rounded-2xl border border-stone-800 text-xs text-left">
            <div>
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Apartamento</span>
              <span className="font-black text-xl text-amber-400">Apt {orderSuccess.roomNumber}</span>
            </div>
            <div>
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Horário Marcado</span>
              <span className="font-black text-sm text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5" /> {orderSuccess.deliveryDate} às {orderSuccess.deliveryTime}
              </span>
              <span className="text-[9px] text-stone-400 block mt-0.5">Variação de até ±10 min</span>
            </div>
            <div className="pt-2 border-t border-stone-800">
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Hóspede Titular</span>
              <span className="font-bold text-stone-200 truncate block">{orderSuccess.clientName}</span>
            </div>
            <div className="pt-2 border-t border-stone-800">
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Tipo do Pedido</span>
              <span className="font-bold text-amber-300">
                {orderSuccess.isStandard ? '☕ Cesta Padrão Completa' : '🎨 Cesta Personalizada'}
              </span>
            </div>
          </div>

          {/* Aviso Importante das Louças & Porcelanas */}
          <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-left space-y-1.5 shadow-inner">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Aviso Importante: Louças & Porcelanas CorpFlats</span>
            </div>
            <p className="text-[11px] text-stone-300 leading-relaxed">
              Por favor, <strong>não entregue as louças, garrafas térmicas, bandejas ou porcelanas às camareiras nem ao restaurante do prédio</strong>, e <strong>não as deixe no corredor</strong>, pois as mesmas pertencem à administração exclusiva da CorpFlats. Ao terminar, <strong>mantenha tudo dentro do apartamento</strong> que nossa equipe fará o recolhimento.
            </p>
          </div>

          <Button 
            onClick={() => {
              setOrderSuccess(null)
              setActiveGuestTab(1)
            }}
            className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-black h-12 rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-all"
          >
            Fazer Novo Pedido
          </Button>
        </Card>
      </div>
    )
  }

  const currentPref = getCurrentPref()

  return (
    <div className="min-h-screen bg-[#12100e] text-[#f5f0eb] pb-24 font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Banner CorpFlats */}
      <header className="relative bg-gradient-to-b from-[#1f1a16] via-[#181512] to-[#12100e] border-b border-amber-900/30 text-white px-4 pt-10 pb-12 overflow-hidden">
        <div className="max-w-2xl mx-auto text-center space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-black tracking-widest uppercase shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CorpFlats • Room Service & Gastronomia</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            Pedido de Café da Manhã
          </h1>

          <p className="text-xs sm:text-sm text-stone-300 font-medium max-w-md mx-auto leading-relaxed">
            Entregas pontuais no seu apartamento das <strong>05:00 às 09:30</strong> (tolerância operacional de até ±10 min).
          </p>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 -mt-6 relative z-20 space-y-4">
        {/* Card 1: Apartamento, Quantidade e Data */}
        <Card className="bg-[#1a1715]/95 border border-amber-500/20 rounded-3xl p-5 shadow-xl backdrop-blur space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800/80 pb-3">
            <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
              <HomeIcon className="w-4 h-4 text-amber-500" /> 1. Apartamento & Identificação
            </span>
            <Badge className={loadedFromReservation ? "bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold" : "bg-amber-950/80 text-amber-300 border border-amber-700/60 text-[10px] font-bold"}>
              {loadedFromReservation ? "✓ Vinculado à Reserva" : "1 a 3 Pessoas"}
            </Badge>
          </div>

          {loadedFromReservation ? (
            <div className="p-4 bg-[#0f0d0b] rounded-2xl border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Apartamento Alocado</span>
                  <span className="text-2xl font-black text-white">Flat {roomNumber}</span>
                  <span className="text-xs text-stone-300 block mt-0.5">Hóspede: <strong>{guest1Name}</strong> ({guestCount} {guestCount === 1 ? 'Pessoa' : 'Pessoas'})</span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-xl">
                  {roomNumber}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-stone-800">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-stone-300">Data de Entrega do Café</Label>
                  <Input 
                    type="date"
                    value={deliveryDate} 
                    onChange={e => setDeliveryDate(e.target.value)} 
                    required 
                    className="bg-[#141210] border-stone-700 text-white text-xs font-black h-10 rounded-xl [color-scheme:dark] focus-visible:ring-amber-500" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-stone-300">Quantidade de Pessoas</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {([1, 2, 3] as const).map(n => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => {
                          setGuestCount(n)
                          if (activeGuestTab > n) setActiveGuestTab(1)
                        }}
                        className={`h-10 rounded-xl font-bold text-xs border transition-all ${
                          guestCount === n 
                            ? "bg-amber-500 text-stone-950 border-amber-400 font-black" 
                            : "bg-[#141210] border-stone-800 text-stone-400 hover:text-white"
                        }`}
                      >
                        {n} {n === 1 ? 'Pessoa' : 'Pessoas'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-stone-300">Número do Apartamento *</Label>
                  <Input 
                    value={roomNumber} 
                    onChange={e => setRoomNumber(e.target.value)} 
                    placeholder="Ex: 1017" 
                    required 
                    className="bg-[#0f0d0b] border-stone-700 text-white placeholder:text-stone-600 text-sm font-black h-11 rounded-xl pl-3 focus-visible:ring-amber-500" 
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-stone-300">Quantidade de Pessoas *</Label>
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
                            ? "bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 border-amber-400 shadow-md ring-2 ring-amber-500/40" 
                            : "bg-[#0f0d0b] border-stone-800 text-stone-400 hover:bg-stone-900 hover:text-stone-200"
                        }`}
                      >
                        <span>{n} {n === 1 ? 'Pessoa' : 'Pessoas'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-stone-300">Nome do Hóspede Titular *</Label>
                  <Input 
                    value={guest1Name} 
                    onChange={e => setGuest1Name(e.target.value)} 
                    placeholder="Seu nome completo" 
                    required 
                    className="bg-[#0f0d0b] border-stone-700 text-white placeholder:text-stone-600 text-xs font-semibold h-11 rounded-xl focus-visible:ring-amber-500" 
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-stone-300">Data da Entrega *</Label>
                  <Input 
                    type="date"
                    value={deliveryDate} 
                    onChange={e => setDeliveryDate(e.target.value)} 
                    required 
                    className="bg-[#0f0d0b] border-stone-700 text-white placeholder:text-stone-600 text-xs font-black h-11 rounded-xl [color-scheme:dark] focus-visible:ring-amber-500" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-stone-300">WhatsApp para Notificação (Opcional)</Label>
                <Input 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  placeholder="(21) 99999-9999" 
                  className="bg-[#0f0d0b] border-stone-700 text-white placeholder:text-stone-600 text-xs font-medium h-11 rounded-xl focus-visible:ring-amber-500" 
                />
              </div>
            </>
          )}
        </Card>

        {/* Card 2: Horário Único de Entrega para o Apartamento */}
        <Card className="bg-[#1a1715]/95 border border-amber-500/20 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-stone-800/80 pb-3">
            <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> 
              2. Horário de Entrega no Apartamento
            </span>
            <span className="text-[10px] text-stone-400 font-medium">05:00 às 09:30 (Tolerância de ±10 min)</span>
          </div>

          {loadingSlots ? (
            <div className="p-6 text-center text-xs text-stone-400 animate-pulse">
              Carregando horários disponíveis para {deliveryDate}...
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-2xl text-amber-300 text-xs text-center">
              Sem horários disponíveis para esta data. Por favor, contate a recepção.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-44 overflow-y-auto p-1 pr-2">
              {availableSlots.map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setDeliveryTime(t)}
                  className={`py-2 px-1 rounded-xl text-xs font-black border transition-all text-center ${
                    deliveryTime === t
                      ? "bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 border-amber-400 shadow-md ring-2 ring-amber-500/40"
                      : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Card 3: Escolha entre Café Padrão CorpFlats vs Personalizado */}
        <Card className="bg-[#1a1715]/95 border border-amber-500/20 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800/80 pb-3">
            <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-500" /> 
              3. Opção de Café da Manhã
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Opção 1: Café Padrão CorpFlats */}
            <div 
              onClick={() => setBreakfastType("standard")}
              className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 relative ${
                breakfastType === "standard"
                  ? "bg-gradient-to-b from-amber-950/80 to-[#141210] border-amber-500 shadow-lg ring-2 ring-amber-500/30"
                  : "bg-[#0f0d0b] border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-white flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-amber-400" />
                  Café Padrão CorpFlats
                </span>
                <Badge className="bg-amber-500 text-stone-950 font-black text-[10px]">
                  Recomendado
                </Badge>
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Cesta completa tradicional pronta com: <strong>{stdConfig?.description || "Café com leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Manteiga, Bolo do dia e Fruta do dia (mamão, banana ou maçã)"}</strong>.
              </p>
            </div>

            {/* Opção 2: Personalizar Itens */}
            <div 
              onClick={() => setBreakfastType("custom")}
              className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 relative ${
                breakfastType === "custom"
                  ? "bg-gradient-to-b from-amber-950/80 to-[#141210] border-amber-500 shadow-lg ring-2 ring-amber-500/30"
                  : "bg-[#0f0d0b] border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Montar / Personalizar Itens
                </span>
                <Badge variant="outline" className="text-stone-400 border-stone-700 text-[10px]">
                  Sob Medida
                </Badge>
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Escolha individualmente as bebidas, pães, acompanhamentos, frutas e doces de cada hóspede.
              </p>
            </div>
          </div>
        </Card>

        {/* Bloco quando selecionado: Café Personalizado */}
        {breakfastType === "custom" && (
          <>
            {/* Barra de Abas de Hóspedes (Se for 2 ou 3 pessoas) */}
            {guestCount > 1 && (
              <Card className="bg-[#1a1715]/95 border border-amber-500/20 rounded-3xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-300">
                    Personalizar café por hóspede:
                  </span>
                  <span className="text-[11px] font-black text-amber-400">
                    Hóspede {activeGuestTab} de {guestCount}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Array.from({ length: guestCount }).map((_, i) => {
                    const idx = (i + 1) as 1 | 2 | 3
                    const isActive = activeGuestTab === idx
                    const nameLabel = idx === 1 
                      ? (guest1Name ? guest1Name.split(' ')[0] : '1º Hóspede (Titular)') 
                      : idx === 2 
                        ? (guest2Name ? guest2Name.split(' ')[0] : '2º Hóspede') 
                        : (guest3Name ? guest3Name.split(' ')[0] : '3º Hóspede')

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveGuestTab(idx)}
                        className={`py-3 px-3 rounded-2xl border text-xs font-black transition-all flex items-center justify-center gap-2 ${
                          isActive
                            ? "bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 border-amber-400 shadow-md ring-2 ring-amber-500/30"
                            : "bg-[#0f0d0b] border-stone-800 text-stone-400 hover:bg-stone-900 hover:text-stone-200"
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span className="truncate">{nameLabel}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Ação Rápida: Repetir o Mesmo Pedido do 1º Hóspede para Todos e Finalizar */}
                <div className="pt-2 border-t border-stone-800/80 flex flex-col sm:flex-row items-center justify-between gap-2">
                  <span className="text-[11px] text-stone-400 text-center sm:text-left">
                    Deseja o mesmo café do 1º hóspede para todos?
                  </span>
                  <Button
                    type="button"
                    onClick={() => setRepeatModalOpen(true)}
                    className="w-full sm:w-auto bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-black text-xs h-9 px-3 rounded-xl shadow-md gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Repetir Pedido do 1º e Finalizar</span>
                  </Button>
                </div>
              </Card>
            )}

            {/* Cardápio do Hóspede Selecionado */}
            <Card id="menu-section" className="bg-[#1a1715]/95 border border-amber-500/20 rounded-3xl p-5 shadow-xl space-y-5">
              <div className="border-b border-stone-800/80 pb-3 flex items-center justify-between">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-amber-500" /> 
                  Itens do Cardápio {guestCount > 1 ? `(Hóspede ${activeGuestTab} de ${guestCount})` : ''}
                </span>
                <span className="text-[10px] text-amber-400/80 uppercase tracking-wider font-bold">
                  {guestCount > 1 ? `Etapa ${activeGuestTab} de ${guestCount}` : 'Cardápio'}
                </span>
              </div>

              {/* Campo de Nome do Hóspede da Aba Ativa */}
              <div className="p-3 bg-[#0f0d0b] rounded-2xl border border-stone-800 space-y-1.5">
                <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  Nome do {activeGuestTab}º Hóspede {activeGuestTab === 1 ? '(Titular)' : '(Acompanhante)'} *
                </Label>
                <Input 
                  value={getCurrentGuestName()} 
                  onChange={e => setCurrentGuestName(e.target.value)} 
                  placeholder={activeGuestTab === 1 ? "Nome completo do titular" : `Nome do ${activeGuestTab}º hóspede`} 
                  required 
                  className="bg-[#1a1715] border-stone-700 text-white placeholder:text-stone-600 text-xs font-semibold h-10 rounded-xl focus-visible:ring-amber-500" 
                />
              </div>

              {/* 1. Café (1 opção) */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-amber-400" /> Café (Escolha 1 opção)
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
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        currentPref.coffee === opt
                          ? "bg-gradient-to-r from-amber-700 to-amber-600 text-white border-amber-500 shadow-xs ring-1 ring-amber-400"
                          : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Outras Bebidas (1 opção) */}
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                  <Milk className="w-3.5 h-3.5 text-sky-400" /> Outras Bebidas (Escolha 1 opção)
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
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        currentPref.otherBeverage === opt
                          ? "bg-gradient-to-r from-sky-800 to-sky-700 text-white border-sky-500 shadow-xs ring-1 ring-sky-400"
                          : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Pães (até 2 opções) */}
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                    🍞 Pães (Escolha até 2 opções)
                  </Label>
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-800">
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
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                          isChecked
                            ? "bg-amber-700 text-white border-amber-500 shadow-xs ring-1 ring-amber-400"
                            : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                        }`}
                      >
                        {isChecked ? "✓ " : ""}{opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 4. Acompanhamentos (até 4 opções) */}
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                    🧈 Acompanhamentos (Escolha até 4 opções)
                  </Label>
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-800">
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
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                          isChecked
                            ? "bg-amber-600 text-white border-amber-500 shadow-xs ring-1 ring-amber-400"
                            : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                        }`}
                      >
                        {isChecked ? "✓ " : ""}{opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 5. Complementos (até 2 opções) */}
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                    Complementos (Escolha até 2 opções)
                  </Label>
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-800">
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
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                          isChecked
                            ? "bg-amber-700 text-white border-amber-500 shadow-xs ring-1 ring-amber-400"
                            : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                        }`}
                      >
                        {isChecked ? "✓ " : ""}{opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 6. Doces e Biscoitos (até 2 opções) */}
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                    <Cookie className="w-3.5 h-3.5 text-amber-400" /> Doces e Biscoitos (Escolha até 2 opções)
                  </Label>
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-800">
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
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                          isChecked
                            ? "bg-amber-700 text-white border-amber-500 shadow-xs ring-1 ring-amber-400"
                            : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                        }`}
                      >
                        {isChecked ? "✓ " : ""}{opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 7. Frutas (1 opção + Condicionais) */}
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <Label className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                  <Apple className="w-3.5 h-3.5 text-emerald-400" /> Frutas (Escolha 1 opção)
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
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        currentPref.fruit === opt
                          ? "bg-emerald-700 text-white border-emerald-500 shadow-xs ring-1 ring-emerald-400"
                          : "bg-[#0f0d0b] border-stone-800 text-stone-300 hover:bg-stone-900"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>

                {/* Condicional Mamão: Deseja Mel? */}
                {currentPref.fruit === "Mamão" && (
                  <div className="p-3 bg-amber-950/50 border border-amber-700/60 rounded-2xl space-y-2 animate-in fade-in">
                    <span className="text-xs font-bold text-amber-300 block">Deseja mel no seu Mamão?</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateCurrentPref({ fruitHoney: true })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                          currentPref.fruitHoney 
                            ? "bg-amber-500 text-stone-950 border-amber-400 shadow-xs" 
                            : "bg-[#0f0d0b] border-stone-800 text-stone-400"
                        }`}
                      >
                        🍯 Sim, com mel
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCurrentPref({ fruitHoney: false })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                          !currentPref.fruitHoney 
                            ? "bg-amber-500 text-stone-950 border-amber-400 shadow-xs" 
                            : "bg-[#0f0d0b] border-stone-800 text-stone-400"
                        }`}
                      >
                        Sem mel
                      </button>
                    </div>
                  </div>
                )}

                {/* Condicional Salada de Frutas: Opções */}
                {currentPref.fruit === "Salada de frutas" && (
                  <div className="p-3 bg-pink-950/50 border border-pink-700/60 rounded-2xl space-y-2 animate-in fade-in">
                    <span className="text-xs font-bold text-pink-300 block">Como prefere sua Salada de Frutas?</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {["Salada pura", "Mel", "Leite condensado"].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateCurrentPref({ fruitSaladOption: opt })}
                          className={`p-2 rounded-xl text-xs font-black border truncate transition-all ${
                            currentPref.fruitSaladOption === opt 
                              ? "bg-pink-600 text-white border-pink-400 shadow-xs" 
                              : "bg-[#0f0d0b] border-stone-800 text-stone-400"
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
              <div className="space-y-2 pt-3 border-t border-stone-800/80">
                <Label className="text-xs font-bold text-stone-200">Açúcar ou Adoçante</Label>
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
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        currentPref.sweetener === opt
                          ? "bg-stone-700 text-white border-stone-500 shadow-xs ring-1 ring-stone-400"
                          : "bg-[#0f0d0b] border-stone-800 text-stone-400 hover:bg-stone-900"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Card 4: Observações Gerais */}
        <Card className="bg-[#1a1715]/95 border border-amber-500/20 rounded-3xl p-5 shadow-xl space-y-2">
          <span className="text-xs font-bold text-stone-200 block">Observações ou Restrições Alimentares:</span>
          <Textarea 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            placeholder="Ex: Sem lactose, intolerância a glúten, café bem quente..." 
            className="bg-[#0f0d0b] border-stone-700 text-xs font-medium text-white placeholder:text-stone-600 resize-none h-18 rounded-2xl focus-visible:ring-amber-500" 
          />
        </Card>

        {/* Card 5: Aviso Importante de Louças & Porcelanas */}
        <Card className="bg-amber-950/40 border border-amber-500/40 rounded-3xl p-5 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Aviso Importante: Louças & Porcelanas CorpFlats</span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">
            Por favor, <strong>não entregue as louças, garrafas, bandejas ou porcelanas às camareiras nem ao restaurante do prédio</strong>, e <strong>não as deixe no corredor</strong>. Todo o material pertence à administração exclusiva da CorpFlats. Ao finalizar seu café, <strong>mantenha tudo dentro do apartamento</strong> que nossa equipe fará o recolhimento.
          </p>
        </Card>

        {/* Botão de Envio: Modo Padrão vs Modo Personalizado */}
        {breakfastType === "standard" ? (
          <div className="space-y-2">
            <Button 
              type="button" 
              onClick={handleStandardSubmit}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-black text-sm h-14 rounded-2xl shadow-2xl gap-2 tracking-wide uppercase transition-all transform active:scale-98"
            >
              {submitting ? (
                <span>Agendando com a cozinha...</span>
              ) : (
                <>
                  <Coffee className="w-5 h-5 text-stone-950" />
                  <span>Confirmar Café Padrão CorpFlats ({guestCount} {guestCount === 1 ? 'Pessoa' : 'Pessoas'}) 🚀</span>
                </>
              )}
            </Button>
            <p className="text-[11px] text-stone-400 text-center">
              Cesta completa padrão será entregue no Apt {roomNumber || '...'} às {deliveryTime} do dia {deliveryDate}.
            </p>
          </div>
        ) : (
          /* Modo Personalizado */
          guestCount > 1 && activeGuestTab < guestCount ? (
            <div className="space-y-2">
              <Button 
                type="button" 
                onClick={handleNextStep}
                className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-sm h-14 rounded-2xl shadow-2xl gap-2 tracking-wide uppercase transition-all transform active:scale-98"
              >
                <span>Avançar para Escolher o Café do {activeGuestTab + 1}º Hóspede</span>
                <ChevronRight className="w-5 h-5" />
              </Button>
              <p className="text-[11px] text-stone-400 text-center">
                Você está na etapa {activeGuestTab} de {guestCount}. O pedido só será enviado após preencher todos os hóspedes.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                {guestCount > 1 && activeGuestTab > 1 && (
                  <Button 
                    type="button" 
                    onClick={() => {
                      setActiveGuestTab((activeGuestTab - 1) as 1 | 2)
                      window.scrollTo({ top: 220, behavior: "smooth" })
                    }}
                    className="bg-[#1a1715] border border-stone-800 hover:bg-stone-900 text-stone-300 font-bold text-xs h-14 px-4 rounded-2xl"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    <span>Voltar</span>
                  </Button>
                )}
                <Button 
                  type="button" 
                  onClick={handleCustomFinalSubmit}
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-black text-sm h-14 rounded-2xl shadow-2xl gap-2 tracking-wide uppercase transition-all transform active:scale-98"
                >
                  {submitting ? (
                    <span>Agendando com a cozinha...</span>
                  ) : (
                    <>
                      <Coffee className="w-5 h-5 text-stone-950" />
                      <span>Confirmar & Agendar Café ({guestCount} {guestCount === 1 ? 'Pessoa' : 'Pessoas'})</span>
                    </>
                  )}
                </Button>
              </div>
              {guestCount > 1 && (
                <p className="text-[11px] text-stone-400 text-center">
                  Etapa final ({activeGuestTab}/{guestCount}). Clique acima para confirmar os pedidos de todos os hóspedes.
                </p>
              )}
            </div>
          )
        )}
      </main>

      {/* Modal: Repetir Pedido do 1º Hóspede para Todos e Finalizar */}
      <Dialog open={repeatModalOpen} onOpenChange={setRepeatModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#1c1917] border border-amber-500/30 text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400 font-black text-lg">
              <Copy className="w-5 h-5" />
              Repetir Pedido do 1º Hóspede
            </DialogTitle>
            <DialogDescription className="text-stone-400 text-xs">
              Os mesmos itens e horário do <strong>{guest1Name || '1º Hóspede'}</strong> serão preparados para todos. Informe o nome dos demais hóspedes para finalizarmos:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-stone-300">Nome do 2º Hóspede (Acompanhante) *</Label>
              <Input 
                value={guest2Name}
                onChange={e => setGuest2Name(e.target.value)}
                placeholder="Ex: Maria da Silva"
                className="bg-[#0f0d0b] border-stone-700 text-white placeholder:text-stone-600 text-xs h-10 rounded-xl"
              />
            </div>

            {guestCount === 3 && (
              <div className="space-y-1">
                <Label className="text-xs font-bold text-stone-300">Nome do 3º Hóspede *</Label>
                <Input 
                  value={guest3Name}
                  onChange={e => setGuest3Name(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="bg-[#0f0d0b] border-stone-700 text-white placeholder:text-stone-600 text-xs h-10 rounded-xl"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setRepeatModalOpen(false)}
              className="border-stone-800 text-stone-400 hover:bg-stone-900 rounded-xl"
            >
              Cancelar
            </Button>
            <Button 
              type="button" 
              onClick={handleConfirmRepeatAndSubmit}
              disabled={submitting}
              className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-black text-xs h-10 rounded-xl uppercase tracking-wider flex-1"
            >
              {submitting ? "Confirmando..." : "Confirmar & Finalizar Pedido 🚀"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
