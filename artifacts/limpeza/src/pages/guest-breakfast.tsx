import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { 
  Coffee, Clock, Home as HomeIcon, CheckCircle2, 
  Sparkles, ChevronRight, ChevronLeft, Utensils, Copy, Apple, Cookie, Milk, User, Users,
  AlertTriangle, Layers, MessageCircle, ArrowLeft, Check, Calendar, ArrowRight, RotateCcw, Pencil
} from "lucide-react"
import { format, addDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useLocation, useRoute } from "wouter"
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo"
import { DirectBookingPerkCard } from "@/components/direct-booking-perk-card"

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
  accompaniments: ["Queijo mussarela", "Presunto", "Ovos mexidos"],
  complements: ["Manteiga"],
  sweets: ["Bolo do dia"],
  fruit: "Banana",
  fruitHoney: false,
  fruitSaladOption: "Salada pura",
  sweetener: "Açúcar"
}

export default function GuestBreakfast() {
  const [, setLocation] = useLocation()
  const [, paramsMinhaReserva] = useRoute("/minha-reserva/:code/cafe")
  const [, paramsMinhaReservaAlt] = useRoute("/minha-reserva/:code/room-service")
  const [, paramsPortal] = useRoute("/portal-hospede/:code/cafe")
  const [, paramsGuest] = useRoute("/guest-portal/:code/cafe")
  const [, paramsCafeCode] = useRoute("/cafe/:code")
  const [, paramsCafeDaManhaCode] = useRoute("/cafe-da-manha/:code")
  const [, paramsBreakfastCode] = useRoute("/breakfast/:code")
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

  // Preferências por hóspede
  const [guest1Pref, setGuest1Pref] = useState<GuestPreference>({ ...defaultGuestPref })
  const [guest2Pref, setGuest2Pref] = useState<GuestPreference>({ ...defaultGuestPref })
  const [guest3Pref, setGuest3Pref] = useState<GuestPreference>({ ...defaultGuestPref })

  // Controle da Aba Ativa no modo individual (1, 2 ou 3)
  const [activeGuestTab, setActiveGuestTab] = useState<1 | 2 | 3>(1)

  const sanitizeResCode = (val?: string | null): string => {
    if (!val) return ""
    let decoded = String(val).trim()
    try {
      decoded = decodeURIComponent(decoded).trim()
    } catch {}
    if (
      !decoded ||
      ["undefined", "null", "none", "cafe", "cafe-da-manha", "breakfast", "room-service"].includes(decoded.toLowerCase())
    ) {
      return ""
    }
    return decoded
  }

  const resolveCurrentResCode = (): string => {
    const fromRoutes =
      sanitizeResCode(paramsMinhaReserva?.code) ||
      sanitizeResCode(paramsMinhaReservaAlt?.code) ||
      sanitizeResCode(paramsPortal?.code) ||
      sanitizeResCode(paramsGuest?.code) ||
      sanitizeResCode(paramsCafeCode?.code) ||
      sanitizeResCode(paramsCafeDaManhaCode?.code) ||
      sanitizeResCode(paramsBreakfastCode?.code)
    if (fromRoutes) return fromRoutes

    if (typeof window !== "undefined") {
      const pathname = window.location.pathname || ""
      const nestedMatch = pathname.match(/(?:minha-reserva|portal-hospede|guest-portal)\/([^/?#]+)\/(?:cafe|room-service)/i)
      if (nestedMatch?.[1]) {
        const cleanNested = sanitizeResCode(nestedMatch[1])
        if (cleanNested) return cleanNested
      }
      const directMatch = pathname.match(/(?:cafe-da-manha|cafe|breakfast)\/([^/?#]+)/i)
      if (directMatch?.[1]) {
        const cleanDirect = sanitizeResCode(directMatch[1])
        if (cleanDirect) return cleanDirect
      }

      const params = new URLSearchParams(window.location.search)
      const fromQuery =
        sanitizeResCode(params.get("res")) ||
        sanitizeResCode(params.get("code")) ||
        sanitizeResCode(params.get("token")) ||
        sanitizeResCode(params.get("reserva")) ||
        sanitizeResCode(params.get("r")) ||
        sanitizeResCode(params.get("id")) ||
        sanitizeResCode(params.get("reservation")) ||
        sanitizeResCode(params.get("reservationCode"))
      if (fromQuery) return fromQuery
    }

    return ""
  }

  const [submitting, setSubmitting] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null)
  const [loadedFromReservation, setLoadedFromReservation] = useState(false)
  const [reservationData, setReservationData] = useState<any | null>(null)
  const [breakfastDays, setBreakfastDays] = useState<any[]>([])
  const [nowBrasilia, setNowBrasilia] = useState<any>(null)
  const [selectedRepeatDates, setSelectedRepeatDates] = useState<string[]>([])
  const [repeatAllDays, setRepeatAllDays] = useState(false)
  const [loadingContext, setLoadingContext] = useState(() => Boolean(resolveCurrentResCode()))
  const [contextError, setContextError] = useState<string | null>(null)

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = parseISO(dateStr)
      return format(d, "dd/MM (EEE)", { locale: ptBR })
    } catch {
      return dateStr
    }
  }

  const normalizeSavedPref = (raw?: any, fallbackItems?: any[]): GuestPreference => {
    if (raw && typeof raw === "object" && (raw.coffee || raw.otherBeverage || Array.isArray(raw.breads) || raw.fruit)) {
      const mappedCoffee =
        raw.coffee === "Café, Leite"
          ? "Café com leite"
          : ["Café", "Café com leite", "Não quero café"].includes(raw.coffee)
            ? raw.coffee
            : defaultGuestPref.coffee

      return {
        coffee: mappedCoffee,
        otherBeverage: raw.otherBeverage || defaultGuestPref.otherBeverage,
        breads: Array.isArray(raw.breads) ? raw.breads : [...defaultGuestPref.breads],
        accompaniments: Array.isArray(raw.accompaniments) ? raw.accompaniments : [...defaultGuestPref.accompaniments],
        complements: Array.isArray(raw.complements) ? raw.complements : [...defaultGuestPref.complements],
        sweets: Array.isArray(raw.sweets) ? raw.sweets : [...defaultGuestPref.sweets],
        fruit: raw.fruit && raw.fruit !== "Fruta do dia" ? raw.fruit : defaultGuestPref.fruit,
        fruitHoney: Boolean(raw.fruitHoney),
        fruitSaladOption: raw.fruitSaladOption || "Salada pura",
        sweetener: raw.sweetener || defaultGuestPref.sweetener
      }
    }

    if (Array.isArray(fallbackItems) && fallbackItems.length > 0) {
      const names = new Set(fallbackItems.map((i: any) => (typeof i === "string" ? i : i?.name)).filter(Boolean))
      const hasCoffee = names.has("Café") || names.has("Café duplo")
      const hasMilk = names.has("Leite") || names.has("Leite duplo")
      const coffee = hasCoffee && hasMilk ? "Café com leite" : hasCoffee ? "Café" : "Não quero café"
      const otherBeverage =
        ["Achocolatado gelado", "Água", "Suco de laranja", "Vitamina de banana com iogurte de morango"].find(b => names.has(b)) ||
        "Nenhuma outra bebida"
      const breads = ["Pão francês", "Pão de queijo"].filter(b => names.has(b))
      const accompaniments = [
        "Queijo prato",
        "Queijo mussarela",
        "Queijo Minas frescal",
        "Peito de Peru",
        "Presunto",
        "Ovos mexidos"
      ].filter(a => names.has(a))
      const complements = ["Manteiga", "Requeijão"].filter(c => names.has(c))
      const matchedSweets = ["Bolo do dia", "Torradas amanteigadas", "Casadinho (biscoito com goiabada)"].filter(s => names.has(s))
      const sweets = matchedSweets.length > 0 ? matchedSweets : ["Não quero nenhum desses"]
      const fruit = ["Maçã", "Banana", "Mamão", "Salada de frutas"].find(f => names.has(f)) || "Nenhuma fruta"
      const fruitHoney = fruit === "Mamão" && names.has("Mel")
      const fruitSaladOption = names.has("Leite condensado") ? "Leite condensado" : names.has("Mel") ? "Mel" : "Salada pura"
      const sweetener =
        names.has("Açúcar") && names.has("Adoçante")
          ? "Ambos"
          : names.has("Adoçante")
            ? "Adoçante"
            : names.has("Açúcar")
              ? "Açúcar"
              : "Nenhum"

      return {
        coffee,
        otherBeverage,
        breads,
        accompaniments,
        complements,
        sweets,
        fruit,
        fruitHoney,
        fruitSaladOption,
        sweetener
      }
    }

    return { ...defaultGuestPref }
  }

  const applyExistingOrderToForm = (order: any) => {
    if (!order || order.status === "cancelled") return

    if (order.deliveryTime) {
      setDeliveryTime(order.deliveryTime)
    }
    setNotes(order.notes || "")

    if (order.guestCount) {
      const count = Math.min(3, Math.max(1, Number(order.guestCount || 1))) as 1 | 2 | 3
      setGuestCount(count)
    }

    const isInd = order.orderMode === "individual"
    setOrderDistribution(isInd ? "individual" : "same_for_all")

    const isStdOrder = Boolean(order.isStandard || order.orderType === "standard")
    setBreakfastType(isStdOrder ? "standard" : "custom")

    const choices = Array.isArray(order.guestChoices) && order.guestChoices.length > 0 ? order.guestChoices : null
    if (choices) {
      const c1 = choices[0]
      if (c1) {
        if (c1.guestName) setGuest1Name(c1.guestName)
        const c1Std = isInd ? Boolean(c1.isStandard) : isStdOrder
        setGuest1Type(c1Std ? "standard" : "custom")
        if (!c1Std) setGuest1Pref(normalizeSavedPref(c1, order.items))
      }
      const c2 = choices[1]
      if (c2) {
        if (c2.guestName) setGuest2Name(c2.guestName)
        const c2Std = isInd ? Boolean(c2.isStandard) : isStdOrder
        setGuest2Type(c2Std ? "standard" : "custom")
        if (!c2Std) setGuest2Pref(normalizeSavedPref(c2, order.items))
      }
      const c3 = choices[2]
      if (c3) {
        if (c3.guestName) setGuest3Name(c3.guestName)
        const c3Std = isInd ? Boolean(c3.isStandard) : isStdOrder
        setGuest3Type(c3Std ? "standard" : "custom")
        if (!c3Std) setGuest3Pref(normalizeSavedPref(c3, order.items))
      }
    } else {
      if (order.clientName) setGuest1Name(order.clientName)
      setGuest1Type(isStdOrder ? "standard" : "custom")
      setGuest2Type(isStdOrder ? "standard" : "custom")
      setGuest3Type(isStdOrder ? "standard" : "custom")
      if (!isStdOrder) {
        const reconstructed = normalizeSavedPref(order.preferences, order.items)
        setGuest1Pref(reconstructed)
        setGuest2Pref({ ...reconstructed })
        setGuest3Pref({ ...reconstructed })
      }
    }

    setActiveGuestTab(1)
  }

  const loadReservationContext = async (code: string, preferredDate?: string) => {
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
        const urlDateParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("date") : null
        const requestedDate = preferredDate || (urlDateParam ? urlDateParam.trim() : "")
        const matchedRequested = requestedDate ? dates.find(d => d.date === requestedDate) : null
        const pendingOpen = dates.find(d => d.status === "pending" && d.isOpen)
        const firstOpen = dates.find(d => d.isOpen)
        const chosenDay = matchedRequested || pendingOpen || firstOpen || dates[0]
        if (chosenDay?.date) {
          setDeliveryDate(chosenDay.date)
          if (chosenDay.status === "scheduled" && chosenDay.existingOrder) {
            applyExistingOrderToForm(chosenDay.existingOrder)
          }
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
    const resCode = resolveCurrentResCode()
    const roomParam = sanitizeResCode(params.get("room") || params.get("quarto"))
    const nameParam = params.get("nome") || params.get("name")

    if (resCode) {
      loadReservationContext(resCode)
    } else if (roomParam) {
      setRoomNumber(roomParam)
      if (nameParam) setGuest1Name(nameParam)
      loadReservationContext(roomParam)
    } else {
      if (nameParam) setGuest1Name(nameParam)
    }
  }, [paramsMinhaReserva?.code, paramsMinhaReservaAlt?.code, paramsPortal?.code, paramsGuest?.code, paramsCafeCode?.code, paramsCafeDaManhaCode?.code, paramsBreakfastCode?.code])

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

  // Fetch slots livres e configuração padrão na data (mantendo o horário atual do próprio quarto liberado ao editar)
  useEffect(() => {
    setLoadingSlots(true)
    const slotParams = new URLSearchParams({ date: deliveryDate })
    if (roomNumber.trim()) slotParams.set("roomNumber", roomNumber.trim())
    const activeCode = reservationData?.code || resolveCurrentResCode()
    if (activeCode) slotParams.set("res", activeCode)

    fetch(`/api/breakfast/available-slots?${slotParams.toString()}`)
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
        setDeliveryTime(prev => (slotsList.length > 0 && !slotsList.includes(prev) ? slotsList[0] : prev))
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
  }, [deliveryDate, roomNumber, reservationData?.code])

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
        const wasEditingCurrent = Boolean(breakfastDays.find(d => d.date === deliveryDate)?.status === "scheduled")
        if (reservationData?.code) {
          loadReservationContext(reservationData.code, deliveryDate)
        }
        setOrderSuccess({
          roomNumber,
          clientName: g1,
          guestCount,
          deliveryDates: allDatesToSubmit,
          deliveryDate,
          deliveryTime,
          isStandard: isStd,
          wasEditing: wasEditingCurrent
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

    const sanitizePref = (p: GuestPreference): GuestPreference => ({
      ...p,
      fruitSaladOption: p.fruit === "Salada de frutas" ? (p.fruitSaladOption || "Salada pura") : undefined,
      fruitHoney: p.fruit === "Mamão" ? Boolean(p.fruitHoney) : false
    })

    let isOverallStandard = false
    let p1 = sanitizePref(guest1Pref)
    let p2 = sanitizePref(guest2Pref)
    let p3 = sanitizePref(guest3Pref)

    if (orderDistribution === "same_for_all" || guestCount === 1) {
      if (breakfastType === "standard") {
        isOverallStandard = true
        p1 = stdItemPref
        p2 = stdItemPref
        p3 = stdItemPref
      } else {
        isOverallStandard = false
        p1 = sanitizePref(guest1Pref)
        p2 = sanitizePref(guest1Pref)
        p3 = sanitizePref(guest1Pref)
      }
    } else {
      isOverallStandard = (guest1Type === "standard" && guest2Type === "standard" && (guestCount < 3 || guest3Type === "standard"))
      p1 = guest1Type === "standard" ? stdItemPref : sanitizePref(guest1Pref)
      p2 = guest2Type === "standard" ? stdItemPref : sanitizePref(guest2Pref)
      p3 = guest3Type === "standard" ? stdItemPref : sanitizePref(guest3Pref)
    }

    await executeSubmit(g1, g2, g3, isOverallStandard, p1, p2, p3)
  }

  // Tela de Bloqueio se a Reserva foi Cancelada
  if (loadedFromReservation && reservationData && (reservationData.isCancelled || reservationData.status === "cancelada" || reservationData.status === "cancelado")) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Reserva Cancelada</h2>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              A reserva do <strong>Apt {reservationData.flatNumber}</strong> em nome de <strong>{reservationData.guestName}</strong> consta como cancelada. O agendamento de café da manhã está indisponível.
            </p>
          </div>
          <div className="pt-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs transition-colors shadow-md"
            >
              <MessageCircle className="w-4 h-4 text-[#E5C98B]" />
              <span>Falar com a Recepção no WhatsApp</span>
            </a>
          </div>
        </Card>
      </div>
    )
  }

  // Tela de Bloqueio se a Reserva ainda estiver como Pré-Reserva (não confirmada/não paga) ou Expirada
  if (
    loadedFromReservation &&
    reservationData &&
    (
      reservationData.isPreReservation ||
      reservationData.preReservationBlocked ||
      reservationData.isExpiredPreReservation ||
      reservationData.status === "pre_reserva" ||
      reservationData.status === "pendente" ||
      reservationData.status === "pending_payment" ||
      reservationData.status === "expirada"
    )
  ) {
    const isExpired = reservationData.isExpiredPreReservation || reservationData.status === "expirada"
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40 flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {isExpired ? "Pré-Reserva Expirada" : "Aguardando Confirmação da Reserva"}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed pt-1">
              {isExpired ? (
                <>
                  O prazo de validade da pré-reserva do <strong>Apt {reservationData.flatNumber}</strong> expirou sem confirmação de pagamento.
                </>
              ) : (
                <>
                  A reserva do <strong>Apt {reservationData.flatNumber}</strong> ainda aguarda confirmação de pagamento para liberar o agendamento do café da manhã.
                </>
              )}
            </p>
          </div>
          <div className="pt-2 space-y-2.5">
            {!isExpired && reservationData.code && (
              <Button
                onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
                className="w-full bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs h-11 rounded-xl shadow-md"
              >
                Acessar Minha Reserva
              </Button>
            )}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-[#0F3D4C]" />
              <span>Falar no WhatsApp</span>
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
        <Card className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40 flex items-center justify-center mx-auto">
            <Coffee className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Café da Manhã não incluso</h2>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              A reserva do <strong>Apt {reservationData.flatNumber}</strong> foi contratada na modalidade sem café da manhã.
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
              className="w-full bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs h-11 rounded-xl shadow-md"
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
    const nextPending = breakfastDays.find(d => 
      d.status === "pending" && d.isOpen && !orderSuccess.deliveryDates?.includes(d.date) && d.date !== orderSuccess.deliveryDate
    )

    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex items-center justify-center p-4 selection:bg-[#0F3D4C] selection:text-white font-sans">
        <Card className="w-full max-w-lg bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-[#091E26] border border-[#C5A059]/40 text-[#C5A059] flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {orderSuccess.wasEditing ? "Pedido de Café Atualizado!" : "Café da Manhã Agendado!"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              Pedido {orderSuccess.isStandard ? 'Padrão CorpFlats' : 'Personalizado'} {orderSuccess.wasEditing ? 'atualizado' : 'registrado'} para {orderSuccess.guestCount} {orderSuccess.guestCount === 1 ? 'hóspede' : 'hóspedes'}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-left">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Apartamento</span>
              <span className="font-black text-lg text-slate-900">Flat {orderSuccess.roomNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Data e Horário</span>
              <span className="font-black text-sm text-[#0F3D4C] flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {orderSuccess.deliveryDates && orderSuccess.deliveryDates.length > 1
                    ? `${orderSuccess.deliveryDates.length} dias às ${orderSuccess.deliveryTime}`
                    : `${formatDateDisplay(orderSuccess.deliveryDate)} às ${orderSuccess.deliveryTime}`}
                </span>
              </span>
            </div>
            <div className="pt-2.5 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Hóspede Titular</span>
              <span className="font-bold text-slate-800 truncate block mt-0.5">{orderSuccess.clientName}</span>
            </div>
            <div className="pt-2.5 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Modalidade</span>
              <span className="font-bold text-[#0F3D4C] block mt-0.5">
                {orderSuccess.isStandard ? 'Café Padrão' : 'Personalizado'}
              </span>
            </div>
          </div>

          {orderSuccess.deliveryDates && orderSuccess.deliveryDates.length > 1 && (
            <div className="p-3 bg-[#0F3D4C]/[0.04] border border-[#C5A059]/30 rounded-2xl text-left text-xs text-slate-800">
              <span className="font-bold block">Entregas programadas:</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {orderSuccess.deliveryDates.map((d: string) => (
                  <Badge key={d} variant="outline" className="bg-white border-slate-200 text-[#0F3D4C] font-mono text-[10px]">
                    ✓ {formatDateDisplay(d)} às {orderSuccess.deliveryTime}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Aviso se ainda há dias pendentes na estadia */}
          {nextPending && (
            <div className="p-4 bg-[#0F3D4C]/[0.05] border border-[#C5A059]/40 rounded-2xl text-left space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-[#091E26] font-black text-xs">
                <Calendar className="w-4 h-4 text-[#0F3D4C]" />
                <span>Agendar próximo dia ({formatDateDisplay(nextPending.date)})</span>
              </div>
              <Button
                onClick={() => {
                  setDeliveryDate(nextPending.date)
                  setSelectedRepeatDates([])
                  setRepeatAllDays(false)
                  setOrderSuccess(null)
                  setActiveGuestTab(1)
                }}
                className="w-full bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs h-10 rounded-xl shadow-xs"
              >
                Montar Pedido para {formatDateDisplay(nextPending.date)} →
              </Button>
            </div>
          )}

          {/* Aviso das Louças & Porcelanas */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-1">
            <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              <span>Louças & Porcelanas CorpFlats</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Ao finalizar, mantenha as louças, garrafas e bandejas dentro do apartamento para recolhimento da nossa equipe (não entregue no restaurante nem deixe no corredor).
            </p>
          </div>

          {/* Benefício Reserva Direta Zero-Spam (Compacto) */}
          <DirectBookingPerkCard
            portalSource="guest_breakfast"
            channel={reservationData?.channel}
            isB2b={Boolean(reservationData?.isB2b || reservationData?.agencyId)}
            compact={true}
            variant="light"
          />

          <div className="space-y-2 pt-1">
            {loadedFromReservation && reservationData?.code ? (
              <Button 
                onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
                className="w-full bg-gradient-to-r from-[#091E26] via-[#0F3D4C] to-[#091E26] hover:brightness-110 text-white border border-[#C5A059]/50 font-bold h-11 rounded-xl text-xs shadow-md transition-all"
              >
                Voltar à Minha Reserva
              </Button>
            ) : null}

            <Button 
              variant="outline"
              onClick={() => {
                setOrderSuccess(null)
                setActiveGuestTab(1)
              }}
              className="w-full bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold h-10 rounded-xl text-xs"
            >
              Ver ou Alterar Pedido
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
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-[#0F3D4C] selection:text-white w-full max-w-full overflow-x-hidden">
      {/* ── Top Navigation Bar (Header Clean & Sofisticado) ──────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div 
            onClick={() => setLocation(loadedFromReservation && reservationData?.code ? `/minha-reserva/${reservationData.code}` : "/minha-reserva")}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl"
              />
            ) : (
              <CorpFlatsIcon className="w-8 h-8 sm:w-9 sm:h-9" />
            )}
            <div>
              <CorpFlatsWordmark className="text-base sm:text-lg text-[#0F3D4C] group-hover:text-[#091E26] transition-colors block leading-none" />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loadedFromReservation && reservationData?.code && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/minha-reserva/${reservationData.code}`)}
                className="h-8 sm:h-9 px-2.5 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </Button>
            )}

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#0F3D4C] font-semibold text-xs border border-slate-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#0F3D4C]" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero Section (Capa) ────────────────────── */}
      <header className="relative min-h-[140px] sm:min-h-[165px] flex items-center justify-center px-4 sm:px-8 py-6 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="/photos/soho/cafe-mesa-quarto.jpg"
            alt="Café da Manhã CorpFlats no Edifício Soho Residence"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#091E26]/60 via-[#091E26]/65 to-[#091E26]/80" />
        </div>

        <div className="relative z-10 max-w-xl mx-auto space-y-1 text-white">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight drop-shadow-md text-white">
            Café da Manhã no Flat
          </h1>
          <p className="text-xs sm:text-sm font-normal text-[#E5C98B] drop-shadow-sm">
            Entregas diárias das 05h às 09h30
          </p>
        </div>
      </header>

      {/* ── Main Form Container ─────────────────────────────────────────── */}
      <main className="max-w-3xl w-full mx-auto px-4 -mt-5 sm:-mt-6 z-20 space-y-4 pb-16">
        
        {/* Quando acessado com link de reserva: Card de Identificação + Datas Integrados */}
        {loadingContext && !loadedFromReservation ? (
          <Card className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#091E26] text-[#C5A059] flex items-center justify-center mx-auto animate-pulse">
              <Coffee className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-800">Carregando dados da reserva...</p>
          </Card>
        ) : loadedFromReservation && reservationData ? (
          <Card className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
            {/* Cabeçalho enxuto do hóspede */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Olá, {(guest1Name || reservationData?.guestName || "Hóspede").trim().split(" ")[0]}!
              </h2>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 font-bold text-xs">
                  Flat {roomNumber}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                  {guestCount} {guestCount === 1 ? 'Hóspede' : 'Hóspedes'}
                </span>
              </div>
            </div>

            {/* Seleção do Dia da Entrega */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#0F3D4C] shrink-0" />
                  <span>Data da Entrega</span>
                </span>
              </div>

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
                        if (d.status === "scheduled" && d.existingOrder) {
                          applyExistingOrderToForm(d.existingOrder)
                        }
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? "bg-[#0F3D4C]/[0.06] border-[#0F3D4C] ring-2 ring-[#C5A059]/35 shadow-xs"
                          : isScheduled
                            ? "bg-slate-50 border-slate-300 hover:border-[#0F3D4C]"
                            : isClosed
                              ? "bg-slate-50/60 border-slate-200 opacity-60 cursor-not-allowed"
                              : "bg-white border-slate-200 hover:border-[#C5A059]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 w-full">
                        <span className={`font-black text-xs ${isSelected ? 'text-[#091E26]' : 'text-slate-800'}`}>
                          {formatDateDisplay(d.date)}
                        </span>
                        {isScheduled ? (
                          <Badge className="bg-[#0F3D4C] text-white text-[9px] font-bold px-1.5 py-0.5">
                            ✓ {d.existingOrder?.deliveryTime || '08:00'}
                          </Badge>
                        ) : isCancelled ? (
                          <Badge variant="destructive" className="text-[9px] font-bold px-1.5 py-0.5">
                            Cancelado
                          </Badge>
                        ) : isClosed ? (
                          <Badge className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5">
                            Encerrado
                          </Badge>
                        ) : d.isOpen ? (
                          <Badge className="bg-[#C5A059]/20 text-[#091E26] border border-[#C5A059]/40 text-[9px] font-bold px-1.5 py-0.5">
                            Pendente
                          </Badge>
                        ) : null}
                      </div>

                      <span className="text-[10px] text-slate-500 font-medium">
                        {isScheduled && d.isOpen
                          ? (isSelected ? "Editando pedido agendado" : "Agendado • Toque p/ editar")
                          : d.isToday 
                            ? (d.isClosedTodayAfter5am ? "Pedidos encerrados às 05:00" : "Hoje (pedir até 05:00)")
                            : d.isTomorrow
                              ? "Amanhã (alterar até 05:00)"
                              : d.isPast ? "Finalizado" : "Disponível"}
                      </span>
                    </button>
                  )
                })}
              </div>

              {currentDayInfo?.isClosedTodayAfter5am && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>O horário limite para pedidos de hoje encerrou às 05:00. Selecione o próximo dia disponível acima.</span>
                </div>
              )}

              {currentDayInfo?.status === "scheduled" && currentDayInfo?.isOpen && (
                <div className="p-3 bg-[#0F3D4C]/[0.05] border border-[#C5A059]/40 rounded-xl text-xs text-slate-800 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-[#0F3D4C] shrink-0" />
                  <span>
                    Você está visualizando o pedido de <strong>{formatDateDisplay(currentDayInfo.date)}</strong> (agendado às <strong>{currentDayInfo.existingOrder?.deliveryTime}</strong>). Seus itens já foram carregados abaixo — altere o que desejar e toque em <strong>Salvar Alterações</strong> no final.
                  </span>
                </div>
              )}

              {/* Repetição em Múltiplos Dias */}
              {eligibleOtherDays.length > 0 && currentDayInfo?.isOpen && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                      Repetir este mesmo pedido nos outros dias?
                    </span>

                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 hover:border-[#0F3D4C] transition-colors">
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
                        className="rounded text-[#0F3D4C] accent-[#0F3D4C] w-4 h-4"
                      />
                      <span className="text-xs font-bold text-slate-800">Repetir em todos</span>
                    </label>
                  </div>

                  {!repeatAllDays && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {eligibleOtherDays.map((d: any) => {
                        const isChecked = selectedRepeatDates.includes(d.date)
                        return (
                          <label 
                            key={d.date} 
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                              isChecked ? 'bg-[#0F3D4C]/[0.06] border-[#0F3D4C] text-[#091E26]' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
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
                                className="rounded text-[#0F3D4C] accent-[#0F3D4C] w-4 h-4"
                              />
                              <span>{formatDateDisplay(d.date)}</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        ) : (
          /* Card 1: Identificação Manual (Fallback para pedidos avulsos sem reserva vinculada) */
          <Card className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <span className="text-xs sm:text-sm font-bold uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center font-bold shrink-0">
                  <HomeIcon className="w-4 h-4" />
                </div>
                <span>Identificação do Apartamento</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Número do Apartamento *
                </Label>
                <Input 
                  value={roomNumber} 
                  onChange={e => setRoomNumber(e.target.value)} 
                  placeholder="Ex: 1304" 
                  required 
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm font-bold h-10 rounded-xl" 
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
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
                      className={`h-10 rounded-xl font-bold text-xs border transition-all flex items-center justify-center ${
                        guestCount === n 
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs" 
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
                <Label className="text-xs font-bold text-slate-700">
                  Nome do Hóspede Titular *
                </Label>
                <Input 
                  value={guest1Name} 
                  onChange={e => setGuest1Name(e.target.value)} 
                  placeholder="Seu nome completo" 
                  required 
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-bold h-10 rounded-xl" 
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Data da Entrega *
                </Label>
                <Input 
                  type="date"
                  value={deliveryDate} 
                  onChange={e => setDeliveryDate(e.target.value)} 
                  required 
                  className="bg-slate-50 border-slate-200 text-slate-900 text-xs font-bold h-10 rounded-xl" 
                />
              </div>
            </div>
          </Card>
        )}

        {/* ── Distribuição do Pedido (Apenas quando a reserva for para mais de 1 pessoa) ── */}
        {guestCount > 1 && (
          <Card className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <span className="text-xs sm:text-sm font-bold uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center font-bold shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <span>Formato do Pedido</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção A: O mesmo pedido para todos */}
              <div
                onClick={() => {
                  setOrderDistribution("same_for_all")
                  setActiveGuestTab(1)
                }}
                className={`cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 relative ${
                  orderDistribution === "same_for_all"
                    ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] text-slate-900 ring-2 ring-[#C5A059]/35 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
                }`}
              >
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  orderDistribution === "same_for_all" ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40" : "bg-slate-100 text-slate-500"
                }`}>
                  <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-black text-xs sm:text-sm text-slate-900 block">
                    O mesmo pedido para os {guestCount}
                  </span>
                  <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                    Monte uma única vez para todos os hóspedes do flat.
                  </p>
                </div>
              </div>

              {/* Opção B: Personalizar por hóspede */}
              <div
                onClick={() => setOrderDistribution("individual")}
                className={`cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 relative ${
                  orderDistribution === "individual"
                    ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] text-slate-900 ring-2 ring-[#C5A059]/35 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
                }`}
              >
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  orderDistribution === "individual" ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40" : "bg-slate-100 text-slate-500"
                }`}>
                  <User className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-black text-xs sm:text-sm text-slate-900 block">
                    Individual por hóspede
                  </span>
                  <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                    Escolha os itens separadamente para cada pessoa.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Opções de Café da Manhã & Cardápio ───────── */}
        <Card id="breakfast-options-section" className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs sm:text-sm font-bold uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center font-bold shrink-0">
                <Utensils className="w-4 h-4" />
              </div>
              <span>Opções de Cardápio</span>
            </span>
          </div>

          {/* Abas para alternar entre os hóspedes quando modo individual */}
          {guestCount > 1 && orderDistribution === "individual" && (
            <div className="space-y-2.5">
              <div className="p-1.5 bg-slate-100 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-1.5">
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
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between sm:justify-center gap-1.5 min-w-0 ${
                        isActive
                          ? "bg-white text-[#091E26] shadow-xs border border-[#0F3D4C]/30 font-black ring-2 ring-[#C5A059]/30"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 text-left">
                        <User className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" />
                        <span className="break-words leading-tight min-w-0">{nameLabel}</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-slate-100 text-slate-700">
                        {curType === 'standard' ? 'Padrão' : 'Personalizado'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {activeGuestTab > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="text-slate-700 font-medium text-[11px]">
                    Deseja repetir a mesma escolha de {g1Label}?
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyGuest1To2}
                    className="text-[#0F3D4C] hover:text-[#091E26] hover:bg-slate-200/60 font-bold text-xs h-7 px-2.5 rounded-lg flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3 h-3 shrink-0" />
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
              className={`cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-start gap-3 sm:gap-3.5 relative ${
                getCurrentType() === "standard"
                  ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] text-slate-900 ring-2 ring-[#C5A059]/35 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                getCurrentType() === "standard" ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40" : "bg-slate-100 text-slate-500"
              }`}>
                <Coffee className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs sm:text-sm text-slate-900 leading-snug">
                    Café Padrão CorpFlats
                  </span>
                  <Badge className="shrink-0 whitespace-nowrap bg-[#C5A059] hover:bg-[#b08d47] text-[#091E26] font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-2xs">
                    Recomendado
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                  {stdConfig?.description || "Café, Leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Ovos mexidos, Manteiga, Bolo do dia e Fruta do dia."}
                </p>
              </div>
            </div>

            {/* Opção 2: Personalizar Itens */}
            <div 
              onClick={() => setCurrentType("custom")}
              className={`cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-start gap-3 sm:gap-3.5 relative ${
                getCurrentType() === "custom"
                  ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] text-slate-900 ring-2 ring-[#C5A059]/35 shadow-xs"
                  : "border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                getCurrentType() === "custom" ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40" : "bg-slate-100 text-slate-500"
              }`}>
                <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs sm:text-sm text-slate-900 leading-snug">
                    Montar / Personalizar
                  </span>
                  <Badge variant="outline" className="shrink-0 whitespace-nowrap text-slate-600 border-slate-300 bg-slate-50 font-bold text-[10px] px-2 py-0.5 rounded-full">
                    Sob Medida
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug mt-1 font-medium">
                  Escolha individualmente as bebidas, pães, frios, frutas e acompanhamentos.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Bloco quando selecionado: Café Personalizado */}
        {getCurrentType() === "custom" && (
          <Card id="menu-section" className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-bold uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center font-bold shrink-0">
                  <Utensils className="w-4 h-4" />
                </div>
                <span>Itens do Cardápio {guestCount > 1 && orderDistribution === "individual" ? `(${activeGuestTab}º Hóspede)` : ''}</span>
              </span>
            </div>

            {guestCount > 1 && orderDistribution === "individual" && (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" />
                  Nome do {activeGuestTab}º Hóspede *
                </Label>
                <Input 
                  value={getCurrentGuestName()} 
                  onChange={e => setCurrentGuestName(e.target.value)} 
                  placeholder={activeGuestTab === 1 ? "Nome do titular" : `Nome do ${activeGuestTab}º hóspede`} 
                  required 
                  className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-bold h-10 rounded-xl" 
                />
              </div>
            )}

            {/* 1. Café (1 opção) */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" /> Café (1 opção)
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
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                      currentPref.coffee === opt
                        ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
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
                <Milk className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" /> Outras Bebidas (1 opção)
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
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                      currentPref.otherBeverage === opt
                        ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
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
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label className="text-xs font-bold text-slate-800">
                  Pães (até 2 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-[#0F3D4C] border-[#C5A059]/40 bg-[#0F3D4C]/5 font-bold">
                  {currentPref.breads.length}/2
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
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                        isChecked
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
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
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label className="text-xs font-bold text-slate-800">
                  Acompanhamentos (até 4 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-[#0F3D4C] border-[#C5A059]/40 bg-[#0F3D4C]/5 font-bold">
                  {currentPref.accompaniments.length}/4
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
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                        isChecked
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
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
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label className="text-xs font-bold text-slate-800">
                  Complementos (até 2 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-[#0F3D4C] border-[#C5A059]/40 bg-[#0F3D4C]/5 font-bold">
                  {currentPref.complements.length}/2
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
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                        isChecked
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
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
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Cookie className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" /> Doces e Biscoitos (até 2 opções)
                </Label>
                <Badge variant="outline" className="text-[10px] text-[#0F3D4C] border-[#C5A059]/40 bg-[#0F3D4C]/5 font-bold">
                  {currentPref.sweets.length}/2
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
                      className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                        isChecked
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
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
                <Apple className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" /> Frutas (1 opção)
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
                    onClick={() => updateCurrentPref({ 
                      fruit: opt,
                      ...(opt === "Salada de frutas" && !currentPref.fruitSaladOption ? { fruitSaladOption: "Salada pura" } : {})
                    })}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                      currentPref.fruit === opt
                        ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {currentPref.fruit === opt ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>

              {/* Condicional Mamão: Deseja Mel? */}
              {currentPref.fruit === "Mamão" && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-in fade-in">
                  <span className="text-xs font-bold text-slate-800 block">Deseja mel no Mamão?</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentPref({ fruitHoney: true })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        currentPref.fruitHoney 
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs" 
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Sim, com mel
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentPref({ fruitHoney: false })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        !currentPref.fruitHoney 
                          ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs" 
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
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-in fade-in">
                  <span className="text-xs font-bold text-slate-800 block">Acompanhamento da Salada de Frutas:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "Salada pura", label: "Pura" },
                      { id: "Mel", label: "Com Mel" },
                      { id: "Leite condensado", label: "Com Leite Condensado" }
                    ].map(item => {
                      const isSelected = (currentPref.fruitSaladOption || "Salada pura") === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateCurrentPref({ fruitSaladOption: item.id })}
                          className={`p-2.5 rounded-xl text-xs font-bold border whitespace-normal leading-snug transition-all flex items-center justify-center gap-1.5 ${
                            isSelected 
                              ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs" 
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span>{isSelected ? "✓ " : ""}{item.label}</span>
                        </button>
                      )
                    })}
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
                    className={`p-3 rounded-xl text-xs font-bold border transition-all text-left whitespace-normal leading-snug break-words ${
                      currentPref.sweetener === opt
                        ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-1 ring-[#C5A059]/50 font-bold"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {currentPref.sweetener === opt ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Card Horário de Entrega */}
        <Card className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs sm:text-sm font-bold uppercase text-slate-800 tracking-wider flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <span>Horário de Entrega</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">05:00 às 09:30</span>
          </div>

          {loadingSlots ? (
            <div className="p-8 text-center text-xs text-slate-400 animate-pulse font-medium">
              Carregando horários disponíveis...
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 text-xs text-center font-medium">
              Sem horários disponíveis para esta data. Por favor, contate a recepção pelo WhatsApp.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 pr-2">
                {availableSlots.map(t => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setDeliveryTime(t)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                      deliveryTime === t
                        ? "bg-[#0F3D4C] text-white border-[#0F3D4C] shadow-xs ring-2 ring-[#C5A059]/35 font-black"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 text-center pt-1 font-medium">
                Tolerância de ±10 min conforme rota de entrega.
              </p>
            </div>
          )}
        </Card>

        {/* Card Observações Gerais */}
        <Card className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-2.5">
          <Label className="text-xs font-bold text-slate-800 block">
            Observações (Opcional)
          </Label>
          <Textarea 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            placeholder="Alguma restrição alimentar ou observação?" 
            className="bg-slate-50 border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 resize-none h-20 rounded-xl focus-visible:ring-[#0F3D4C]" 
          />
        </Card>

        {/* Card Aviso de Louças & Porcelanas */}
        <Card className="bg-[#0F3D4C]/[0.04] border border-[#C5A059]/35 rounded-2xl p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#091E26] font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-[#C5A059] shrink-0" />
            <span>Louças & Porcelanas CorpFlats</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            Ao finalizar seu café, mantenha as louças, garrafas e bandejas <strong>dentro do apartamento</strong> para recolhimento da nossa equipe (não entregue no restaurante do prédio nem deixe no corredor).
          </p>
        </Card>

        {/* ── Botão de Envio Consolidado ── */}
        <div className="pt-1">
          <Button 
            type="button" 
            onClick={handleSubmitOrder}
            disabled={submitting || Boolean(loadedFromReservation && currentDayInfo && !currentDayInfo.isOpen)}
            className="w-full bg-gradient-to-r from-[#091E26] via-[#0F3D4C] to-[#091E26] hover:brightness-110 text-white border border-[#C5A059]/50 font-black text-xs sm:text-sm h-13 px-4 rounded-2xl shadow-lg shadow-[#091E26]/20 gap-2 tracking-wide uppercase transition-all"
          >
            {submitting ? (
              <span>{currentDayInfo?.status === "scheduled" ? "Salvando alterações..." : "Agendando pedido..."}</span>
            ) : currentDayInfo?.status === "scheduled" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-[#E5C98B] shrink-0" />
                <span>Salvar Alterações do Pedido</span>
              </>
            ) : (
              <>
                <Coffee className="w-4 h-4 text-[#E5C98B] shrink-0" />
                <span>Confirmar Pedido de Café da Manhã</span>
              </>
            )}
          </Button>
        </div>
      </main>

      {/* ── Footer Corporativo / Hospitalidade ────────────────────────── */}
      <footer className="bg-white border-t border-slate-200/80 py-6 px-4 text-center text-xs text-slate-500 space-y-2 mt-auto">
        <div className="flex items-center justify-center gap-2 font-bold text-sm text-slate-800">
          <CorpFlatsIcon className="w-6 h-6" />
          <CorpFlatsWordmark className="text-xs text-[#0F3D4C]" />
          <span className="text-slate-300">•</span>
          <span className="text-slate-500 font-semibold text-xs">Room Service</span>
        </div>
        <div>
          <a
            href="https://corpflats.com.br/?utm_source=guest_breakfast&utm_medium=portal_footer&utm_campaign=ota_to_direct"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0F3D4C] hover:underline"
          >
            <span>✨ Próxima estadia com Menor Preço + 5% OFF no PIX em corpflats.com.br</span>
          </a>
        </div>
        <p className="text-[10px] text-slate-400">
          © {new Date().getFullYear()} {brandName}. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  )
}
