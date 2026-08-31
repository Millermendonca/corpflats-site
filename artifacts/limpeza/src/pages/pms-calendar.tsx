import { useState, useEffect, useRef } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  CalendarDays, Plus, ChevronLeft, ChevronRight, Search, 
  Calendar as CalendarIcon, User, Users, Phone, Mail, ShieldAlert, CheckCircle2,
  Clock, DollarSign, BedDouble, AlertTriangle, Lock, Trash2, Edit3, MessageCircle, KeyRound, Sparkles, FileText
} from "lucide-react"
import { 
  format, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, isToday, parseISO, differenceInDays 
} from "date-fns"
import { ptBR } from "date-fns/locale"

const CHANNEL_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  site: { label: "Site Próprio", bg: "bg-indigo-600", text: "text-white", border: "border-indigo-700" },
  whatsapp: { label: "WhatsApp", bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700" },
  direta: { label: "WhatsApp", bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700" },
  booking: { label: "Booking", bg: "bg-sky-700", text: "text-white", border: "border-sky-800" },
  airbnb: { label: "Airbnb", bg: "bg-rose-600", text: "text-white", border: "border-rose-700" },
}

import { AccessDenied } from "@/components/access-denied"

export default function PmsCalendar() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()

  const [currentDate, setCurrentDate] = useState(new Date())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<{ flats: any[]; reservations: any[]; blocks: any[] }>({
    flats: [],
    reservations: [],
    blocks: []
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  // Modal States
  const [resModalOpen, setResModalOpen] = useState(false)
  const [selectedRes, setSelectedRes] = useState<any | null>(null)
  const [savingRes, setSavingRes] = useState(false)

  // Form fields
  const [formFlatId, setFormFlatId] = useState("")
  const [formGuestName, setFormGuestName] = useState("")
  const [formGuestPhone, setFormGuestPhone] = useState("")
  const [formGuestEmail, setFormGuestEmail] = useState("")
  const [formCheckin, setFormCheckin] = useState(format(new Date(), "yyyy-MM-dd"))
  const [formCheckout, setFormCheckout] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"))
  const [formChannel, setFormChannel] = useState("whatsapp")
  const [formDailyRate, setFormDailyRate] = useState("250")
  const [formPaidAmount, setFormPaidAmount] = useState("0")
  const [formPaymentStatus, setFormPaymentStatus] = useState("pendente")
  const [formNotes, setFormNotes] = useState("")
  const [formEarlyCheckin, setFormEarlyCheckin] = useState(false)
  const [formReceptionNotes, setFormReceptionNotes] = useState("")
  const [formAutoInvoice, setFormAutoInvoice] = useState(false)
  const [formPrefersHighFloor, setFormPrefersHighFloor] = useState(false)
  const [formTwinBeds, setFormTwinBeds] = useState(false)
  const [formExtraMattress, setFormExtraMattress] = useState(false)
  const [formIncludeBreakfast, setFormIncludeBreakfast] = useState(false)
  const [formSpecialRequests, setFormSpecialRequests] = useState("")

  // Multi-Guest & Corporate Requester State
  const [formGuestCount, setFormGuestCount] = useState<"1" | "2" | "3">("1")
  const [formRequesterType, setFormRequesterType] = useState<"guest" | "other_person" | "company">("guest")
  const [formRequesterName, setFormRequesterName] = useState("")
  const [formRequesterPhone, setFormRequesterPhone] = useState("")
  const [formRequesterEmail, setFormRequesterEmail] = useState("")
  const [formRequesterCpf, setFormRequesterCpf] = useState("")
  const [formCompanyId, setFormCompanyId] = useState("")
  const [formCompanyName, setFormCompanyName] = useState("")
  const [companies, setCompanies] = useState<any[]>([])

  // Guests individual fields
  const [formGuest1Cpf, setFormGuest1Cpf] = useState("")
  const [formGuest2Name, setFormGuest2Name] = useState("")
  const [formGuest2Cpf, setFormGuest2Cpf] = useState("")
  const [formGuest2Phone, setFormGuest2Phone] = useState("")
  const [formGuest2Email, setFormGuest2Email] = useState("")
  const [formGuest3Name, setFormGuest3Name] = useState("")
  const [formGuest3Cpf, setFormGuest3Cpf] = useState("")
  const [formGuest3Phone, setFormGuest3Phone] = useState("")
  const [formGuest3Email, setFormGuest3Email] = useState("")

  // Block Modal
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockFlatId, setBlockFlatId] = useState("")
  const [blockStart, setBlockStart] = useState(format(new Date(), "yyyy-MM-dd"))
  const [blockEnd, setBlockEnd] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"))
  const [blockReason, setBlockReason] = useState("manutencao")
  const [blockNotes, setBlockNotes] = useState("")

  // Timeline Contínua Multi-Mês (sem quebra de mês a mês)
  // Permite rolar continuamente para frente e para trás
  const timelineStart = subDays(new Date(), 30)
  const timelineEnd = addDays(new Date(), 90)
  const daysInView = eachDayOfInterval({ start: timelineStart, end: timelineEnd })

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies", { credentials: "include" })
      const json = await res.json()
      if (Array.isArray(json)) setCompanies(json)
    } catch {}
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const startStr = format(subDays(timelineStart, 5), "yyyy-MM-dd")
      const endStr = format(addDays(timelineEnd, 5), "yyyy-MM-dd")
      const res = await fetch(`/api/pms/calendar?startDate=${startStr}&endDate=${endStr}`, { credentials: "include" })
      const json = await res.json()
      setData(json)
      fetchCompanies()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Auto-scroll inicial para posicionar o dia de hoje na 3ª ou 4ª coluna à esquerda
  const scrollToToday = (behavior: "auto" | "smooth" = "smooth") => {
    if (scrollContainerRef.current) {
      const targetDateStr = format(subDays(new Date(), 3), "yyyy-MM-dd")
      const targetEl = scrollContainerRef.current.querySelector(`[data-header-day="${targetDateStr}"]`)
      if (targetEl) {
        targetEl.scrollIntoView({ inline: "start", behavior, block: "nearest" })
      }
    }
  }

  useEffect(() => {
    if (!loading && data.flats.length > 0) {
      setTimeout(() => {
        scrollToToday("auto")
      }, 100)
    }
  }, [loading])


  // Drag-to-Select State
  // Drag & Tap-to-Select State (Desktop & Mobile Touch)
  const [isDragging, setIsDragging] = useState(false)
  const [dragFlatId, setDragFlatId] = useState<number | null>(null)
  const [dragStartDay, setDragStartDay] = useState<Date | null>(null)
  const [dragHoverDay, setDragHoverDay] = useState<Date | null>(null)
  const [mobileRangeStart, setMobileRangeStart] = useState<{ flatId: number; day: Date; flatNumber: string } | null>(null)

  const handleOpenNewResRange = (defaultFlatId: number, startDate: Date, endDate: Date) => {
    const d1 = startDate <= endDate ? startDate : endDate
    const d2 = startDate <= endDate ? endDate : startDate
    setSelectedRes(null)
    setFormFlatId(String(defaultFlatId))
    const cin = format(d1, "yyyy-MM-dd")
    const cout = isSameDay(d1, d2) 
      ? format(addDays(d1, 1), "yyyy-MM-dd") 
      : format(d2, "yyyy-MM-dd")
    setFormCheckin(cin)
    setFormCheckout(cout)
    setFormGuestCount("1")
    setFormRequesterType("guest")
    setFormRequesterName("")
    setFormRequesterPhone("")
    setFormRequesterEmail("")
    setFormRequesterCpf("")
    setFormCompanyId("")
    setFormCompanyName("")
    setFormGuestName("")
    setFormGuest1Cpf("")
    setFormGuestPhone("")
    setFormGuestEmail("")
    setFormGuest2Name("")
    setFormGuest2Cpf("")
    setFormGuest2Phone("")
    setFormGuest2Email("")
    setFormGuest3Name("")
    setFormGuest3Cpf("")
    setFormGuest3Phone("")
    setFormGuest3Email("")
    setFormChannel("whatsapp")
    setFormDailyRate("250")
    setFormPaidAmount("0")
    setFormPaymentStatus("pendente")
    setFormNotes("")
    setFormEarlyCheckin(false)
    setFormReceptionNotes("")
    setFormAutoInvoice(false)
    setFormPrefersHighFloor(false)
    setFormTwinBeds(false)
    setFormExtraMattress(false)
    setFormIncludeBreakfast(false)
    setFormSpecialRequests("")
    setMobileRangeStart(null)
    setResModalOpen(true)
  }

  // Desktop Mouse Drag (apenas para ponteiro de precisão / mouse)
  const handleStartDrag = (flatId: number, day: Date, hasItem: boolean, e: React.MouseEvent) => {
    if (e.button !== 0 || hasItem) return
    // Previne que toques em telas touch (celulares/tablets) ativem drag de mouse
    if (typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches) return
    setIsDragging(true)
    setDragFlatId(flatId)
    setDragStartDay(day)
    setDragHoverDay(day)
  }

  const handleDragOver = (flatId: number, day: Date) => {
    if (isDragging && dragFlatId === flatId) {
      setDragHoverDay(day)
    }
  }

  const handleFinishDrag = () => {
    if (isDragging && dragFlatId !== null && dragStartDay && dragHoverDay) {
      if (!isSameDay(dragStartDay, dragHoverDay)) {
        handleOpenNewResRange(dragFlatId, dragStartDay, dragHoverDay)
      }
    }
    setIsDragging(false)
    setDragFlatId(null)
    setDragStartDay(null)
    setDragHoverDay(null)
  }

  // Cell Click / Tap Handler (Seleção Inteligente de 2 Toques no Celular)
  const handleCellClick = (flat: any, day: Date, resItem: any, blockItem: any) => {
    // Se houve drag de mouse no desktop de vários dias, ignora o click final
    if (isDragging && dragStartDay && dragHoverDay && !isSameDay(dragStartDay, dragHoverDay)) {
      return
    }

    if (resItem) {
      setMobileRangeStart(null)
      handleOpenEditRes(resItem)
      return
    }
    if (blockItem) {
      setMobileRangeStart(null)
      return
    }

    // Se já havia um 1º toque marcado:
    if (mobileRangeStart) {
      const startDay = mobileRangeStart.day
      const endDay = day
      const targetFlatId = flat.id
      // 2º Toque: abre o período entre a data inicial e a data clicada
      handleOpenNewResRange(targetFlatId, startDay, endDay)
      setMobileRangeStart(null)
    } else {
      // 1º Toque: Marca início do período
      setMobileRangeStart({ flatId: flat.id, day, flatNumber: flat.number })
    }
  }

  const isCellInDragRange = (flatId: number, day: Date) => {
    // 1. Dragging ativo (mouse ou touch)
    if (isDragging && dragFlatId === flatId && dragStartDay && dragHoverDay) {
      const min = dragStartDay <= dragHoverDay ? dragStartDay : dragHoverDay
      const max = dragStartDay <= dragHoverDay ? dragHoverDay : dragStartDay
      return day >= min && day <= max
    }
    // 2. Mobile 1º toque selecionado
    if (mobileRangeStart && mobileRangeStart.flatId === flatId && isSameDay(mobileRangeStart.day, day)) {
      return true
    }
    return false
  }

  const handleOpenNewRes = (defaultFlatId?: number, defaultDate?: Date) => {
    setMobileRangeStart(null)
    setSelectedRes(null)
    setFormFlatId(defaultFlatId ? String(defaultFlatId) : (data.flats[0]?.id ? String(data.flats[0].id) : ""))
    const cin = defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
    const cout = defaultDate ? format(addDays(defaultDate, 1), "yyyy-MM-dd") : format(addDays(new Date(), 1), "yyyy-MM-dd")
    setFormCheckin(cin)
    setFormCheckout(cout)
    setFormGuestCount("1")
    setFormRequesterType("guest")
    setFormRequesterName("")
    setFormRequesterPhone("")
    setFormRequesterEmail("")
    setFormRequesterCpf("")
    setFormCompanyId("")
    setFormCompanyName("")
    setFormGuestName("")
    setFormGuest1Cpf("")
    setFormGuestPhone("")
    setFormGuestEmail("")
    setFormGuest2Name("")
    setFormGuest2Cpf("")
    setFormGuest2Phone("")
    setFormGuest2Email("")
    setFormGuest3Name("")
    setFormGuest3Cpf("")
    setFormGuest3Phone("")
    setFormGuest3Email("")
    setFormChannel("whatsapp")
    setFormDailyRate("250")
    setFormPaidAmount("0")
    setFormPaymentStatus("pendente")
    setFormNotes("")
    setFormEarlyCheckin(false)
    setFormReceptionNotes("")
    setFormAutoInvoice(false)
    setFormPrefersHighFloor(false)
    setFormTwinBeds(false)
    setFormExtraMattress(false)
    setFormIncludeBreakfast(false)
    setFormSpecialRequests("")
    setResModalOpen(true)
  }

  const handleOpenEditRes = (resItem: any) => {
    setSelectedRes(resItem)
    setFormFlatId(String(resItem.flatId))
    setFormCheckin(resItem.checkinDate)
    setFormCheckout(resItem.checkoutDate)
    setFormGuestCount(String(resItem.guestCount || resItem.adults || (resItem.guests?.length || 1)) as any)
    setFormRequesterType(resItem.requesterType || "guest")
    setFormRequesterName(resItem.requesterInfo?.name || "")
    setFormRequesterPhone(resItem.requesterInfo?.phone || "")
    setFormRequesterEmail(resItem.requesterInfo?.email || "")
    setFormRequesterCpf(resItem.requesterInfo?.cpf || "")
    setFormCompanyId(resItem.companyId ? String(resItem.companyId) : "")
    setFormCompanyName(resItem.companyName || "")

    const g1 = resItem.guests?.[0]
    setFormGuestName(g1?.name || resItem.guestName || "")
    setFormGuest1Cpf(g1?.cpf || resItem.guestDocument || "")
    setFormGuestPhone(g1?.phone || resItem.guestPhone || "")
    setFormGuestEmail(g1?.email || resItem.guestEmail || "")

    const g2 = resItem.guests?.[1]
    setFormGuest2Name(g2?.name && !g2.name.startsWith("Hóspede") ? g2.name : "")
    setFormGuest2Cpf(g2?.cpf || "")
    setFormGuest2Phone(g2?.phone || "")
    setFormGuest2Email(g2?.email || "")

    const g3 = resItem.guests?.[2]
    setFormGuest3Name(g3?.name && !g3.name.startsWith("Hóspede") ? g3.name : "")
    setFormGuest3Cpf(g3?.cpf || "")
    setFormGuest3Phone(g3?.phone || "")
    setFormGuest3Email(g3?.email || "")

    setFormChannel(resItem.channel || "whatsapp")
    setFormDailyRate(String(resItem.dailyRate || 0))
    setFormPaidAmount(String(resItem.paidAmount || 0))
    setFormPaymentStatus(resItem.paymentStatus || "pendente")
    setFormNotes(resItem.notes || "")
    setFormEarlyCheckin(Boolean(resItem.earlyCheckinAuthorized))
    setFormReceptionNotes(resItem.receptionNotes || "")
    setFormAutoInvoice(Boolean(resItem.autoEmitInvoice))
    setFormPrefersHighFloor(Boolean(resItem.prefersHighFloor))
    setFormTwinBeds(Boolean(resItem.twinBeds))
    setFormExtraMattress(Boolean(resItem.extraMattress))
    setFormIncludeBreakfast(Boolean(resItem.includeBreakfast || resItem.hasBreakfast))
    setFormSpecialRequests(resItem.specialRequests || "")
    setResModalOpen(true)
  }

  const calculateTotal = () => {
    try {
      const d1 = parseISO(formCheckin)
      const d2 = parseISO(formCheckout)
      const nights = Math.max(1, differenceInDays(d2, d1))
      return nights * (Number(formDailyRate) || 0)
    } catch {
      return 0
    }
  }

  const handleSaveRes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formFlatId || !formGuestName.trim() || !formCheckin || !formCheckout) return

    setSavingRes(true)
    try {
      const totalAmount = calculateTotal()
      const numG = Number(formGuestCount) || 1
      const guestsPayload = [
        { index: 1, name: formGuestName.trim(), cpf: formGuest1Cpf.trim(), phone: formGuestPhone.trim(), email: formGuestEmail.trim() }
      ]
      if (numG >= 2) {
        guestsPayload.push({
          index: 2,
          name: formGuest2Name.trim() || "Hóspede 2",
          cpf: formGuest2Cpf.trim(),
          phone: formGuest2Phone.trim(),
          email: formGuest2Email.trim()
        })
      }
      if (numG === 3) {
        guestsPayload.push({
          index: 3,
          name: formGuest3Name.trim() || "Hóspede 3",
          cpf: formGuest3Cpf.trim(),
          phone: formGuest3Phone.trim(),
          email: formGuest3Email.trim()
        })
      }

      const selectedComp = companies.find(c => String(c.id) === formCompanyId)

      const payload = {
        flatId: Number(formFlatId),
        guestName: formGuestName.trim(),
        guestPhone: formGuestPhone.trim(),
        guestEmail: formGuestEmail.trim(),
        guestDocument: formGuest1Cpf.trim(),
        guestCount: numG,
        guests: guestsPayload,
        requesterType: formRequesterType,
        requesterInfo: formRequesterType === "other_person" ? {
          name: formRequesterName.trim(),
          cpf: formRequesterCpf.trim(),
          phone: formRequesterPhone.trim(),
          email: formRequesterEmail.trim()
        } : null,
        companyId: formRequesterType === "company" && formCompanyId ? Number(formCompanyId) : null,
        companyName: formRequesterType === "company" ? (selectedComp ? selectedComp.tradeName || selectedComp.corporateName : formCompanyName) : "",
        checkinDate: formCheckin,
        checkoutDate: formCheckout,
        channel: formChannel,
        dailyRate: Number(formDailyRate) || 0,
        totalAmount,
        paidAmount: Number(formPaidAmount) || 0,
        paymentStatus: formPaymentStatus,
        notes: formNotes,
        earlyCheckinAuthorized: formEarlyCheckin,
        receptionNotes: formReceptionNotes,
        autoEmitInvoice: formAutoInvoice,
        prefersHighFloor: formPrefersHighFloor,
        twinBeds: formTwinBeds,
        extraMattress: formExtraMattress,
        includeBreakfast: formIncludeBreakfast,
        specialRequests: formSpecialRequests
      }

      if (selectedRes) {
        await fetch(`/api/pms/reservations/${selectedRes.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      } else {
        await fetch("/api/pms/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      }
      setResModalOpen(false)
      fetchData()
    } finally {
      setSavingRes(false)
    }
  }

  const handleDeleteRes = async () => {
    if (!selectedRes) return
    if (!confirm("Tem certeza que deseja cancelar esta reserva?")) return
    try {
      await fetch(`/api/pms/reservations/${selectedRes.id}`, {
        method: "DELETE",
        credentials: "include"
      })
      setResModalOpen(false)
      fetchData()
    } catch {}
  }

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blockFlatId || !blockStart || !blockEnd) return
    try {
      await fetch("/api/pms/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: Number(blockFlatId),
          startDate: blockStart,
          endDate: blockEnd,
          reason: blockReason,
          notes: blockNotes
        }),
        credentials: "include"
      })
      setBlockModalOpen(false)
      fetchData()
    } catch {}
  }

  // Monthly stats
  const totalNights = data.reservations.reduce((acc, r) => {
    try {
      const d1 = parseISO(r.checkinDate)
      const d2 = parseISO(r.checkoutDate)
      return acc + Math.max(1, differenceInDays(d2, d1))
    } catch {
      return acc
    }
  }, 0)

  const totalRevenue = data.reservations.reduce((acc, r) => acc + (Number(r.totalAmount) || 0), 0)
  const occupancyRate = data.flats.length > 0 ? Math.round((totalNights / (data.flats.length * daysInView.length)) * 100) : 0

  if (!loadingUser && user?.role !== "admin") {
    return <AccessDenied moduleName="o Livro de Reservas & Mapa de Ocupação" />
  }

  return (
    <Shell>
      <div className="p-4 sm:p-6 space-y-6 max-w-[100vw] overflow-x-hidden">
        {/* Header Title & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-primary" />
              Livro de Reservas & Mapa de Ocupação
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Grade interativa de reservas, diárias e bloqueios em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setBlockModalOpen(true)} variant="outline" size="sm" className="font-semibold text-xs gap-1.5 shadow-2xs">
              <Lock className="w-3.5 h-3.5" />
              <span>Bloquear Quarto</span>
            </Button>
            <Button onClick={() => handleOpenNewRes()} size="sm" className="font-semibold text-xs gap-1.5 shadow-2xs">
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Reserva</span>
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="rounded-xl border shadow-2xs p-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ocupação do Mês</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{occupancyRate}%</div>
          </Card>
          <Card className="rounded-xl border shadow-2xs p-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Diárias Reservadas</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{totalNights} noites</div>
          </Card>
          <Card className="rounded-xl border shadow-2xs p-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Faturamento Previsto</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">R$ {totalRevenue.toLocaleString("pt-BR")}</div>
          </Card>
          <Card className="rounded-xl border shadow-2xs p-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Reservas Ativas</div>
            <div className="text-2xl font-black text-primary mt-1">{data.reservations.length}</div>
          </Card>
        </div>

        {/* Navigation & Controls */}
        <Card className="rounded-xl border shadow-2xs">
          <div className="p-3 bg-muted/20 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentDate(subDays(startOfMonth(currentDate), 1))}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => scrollToToday("smooth")}
                className="h-8 text-xs font-bold px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Ir para Hoje</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentDate(addDays(endOfMonth(currentDate), 1))}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="font-bold text-xs text-muted-foreground ml-2">
                Linha do Tempo Contínua (Rolar para o lado)
              </span>
            </div>

            {/* Channels Legend */}
            <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Site Próprio
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> WhatsApp
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-700" /> Booking.com
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600" /> Airbnb
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700" /> Bloqueio
              </span>
            </div>
          </div>

          {/* Timeline Grid Table */}
          <div 
            ref={scrollContainerRef}
            className="overflow-x-auto select-none scroll-smooth"
            onMouseUp={handleFinishDrag}
            onMouseLeave={() => { if (isDragging) handleFinishDrag(); }}
          >
            <div style={{ minWidth: `${110 + daysInView.length * 44}px` }}>
              {/* Header Days Row */}
              <div 
                style={{ gridTemplateColumns: `110px repeat(${daysInView.length}, minmax(44px, 1fr))` }}
                className="grid border-b bg-muted/40 text-center font-bold text-xs sticky top-0 z-20 shadow-2xs"
              >
                <div className="p-2.5 text-left border-r bg-card/95 backdrop-blur-md sticky left-0 z-30 font-black text-foreground shadow-xs">
                  Apartamento
                </div>
                {daysInView.map((day) => {
                  const today = isToday(day)
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isFirstOfMonth = day.getDate() === 1
                  const dayStr = format(day, "yyyy-MM-dd")

                  return (
                    <div 
                      key={day.toISOString()} 
                      data-header-day={dayStr}
                      className={`p-1 border-r relative flex flex-col items-center justify-center ${
                        isFirstOfMonth ? 'border-l-2 border-l-primary bg-primary/5' : ''
                      } ${
                        today ? 'bg-primary/20 text-primary font-black shadow-inner' : isWeekend ? 'bg-muted/60 text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {isFirstOfMonth && (
                        <span className="absolute -top-2.5 left-1 text-[9px] font-black uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.2 rounded-md shadow-xs">
                          {format(day, "MMM", { locale: ptBR })}
                        </span>
                      )}
                      <span className="text-[9px] uppercase font-bold">{format(day, "EEE", { locale: ptBR })}</span>
                      <span className={`text-xs font-black ${today ? 'bg-primary text-primary-foreground rounded-full w-5.5 h-5.5 flex items-center justify-center shadow-xs' : ''}`}>
                        {format(day, "d")}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Rows: Flats */}
              {loading ? (
                <div className="text-center py-16 text-xs text-muted-foreground">Carregando mapa de ocupação...</div>
              ) : data.flats.length === 0 ? (
                <div className="text-center py-16 text-xs text-muted-foreground">Nenhum apartamento cadastrado.</div>
              ) : (
                data.flats.map((flat) => {
                  return (
                    <div 
                      key={flat.id} 
                      style={{ gridTemplateColumns: `110px repeat(${daysInView.length}, minmax(44px, 1fr))` }}
                      className="grid border-b hover:bg-muted/20 transition-colors h-12 items-center"
                    >
                      {/* Flat Number Header */}
                      <div className="px-2.5 font-bold text-xs border-r text-foreground flex items-center justify-between h-full bg-card sticky left-0 z-10 shadow-xs">
                        <span>Apt {flat.number}</span>
                      </div>

                      {/* Days Cells */}
                      {daysInView.map((day) => {
                        const dayStr = format(day, "yyyy-MM-dd")
                        
                        // Find matching reservation
                        const resItem = data.reservations.find(r => 
                          r.flatId === flat.id && r.checkinDate <= dayStr && r.checkoutDate > dayStr
                        )

                        // Find matching block
                        const blockItem = data.blocks.find(b => 
                          b.flatId === flat.id && b.startDate <= dayStr && b.endDate >= dayStr
                        )

                        const isCheckinDay = resItem && resItem.checkinDate === dayStr
                        const channelCfg = resItem ? (CHANNEL_CONFIG[resItem.channel] || CHANNEL_CONFIG.direta) : null
                        const isMobileStart = mobileRangeStart && mobileRangeStart.flatId === flat.id && isSameDay(mobileRangeStart.day, day)
                        const inDragRange = isCellInDragRange(flat.id, day)

                        return (
                          <div 
                            key={dayStr} 
                            data-calendar-cell="true"
                            data-flat-id={flat.id}
                            data-day-str={dayStr}
                            onMouseDown={(e) => handleStartDrag(flat.id, day, Boolean(resItem || blockItem), e)}
                            onMouseEnter={() => handleDragOver(flat.id, day)}
                            onClick={() => handleCellClick(flat, day, resItem, blockItem)}
                            className={`h-full border-r relative flex items-center justify-center cursor-pointer transition-all select-none ${
                              isMobileStart
                                ? 'bg-emerald-500/25 dark:bg-emerald-500/35 border-emerald-500 z-20'
                                : inDragRange
                                ? 'bg-indigo-500/25 dark:bg-indigo-500/35 border-indigo-400 z-10'
                                : isToday(day) ? 'bg-primary/5' : ''
                            } hover:bg-primary/10`}
                            title={resItem ? `${resItem.guestName} (${resItem.channel}) - ${resItem.checkinDate} até ${resItem.checkoutDate}` : `Toque para selecionar início e fim no Apt ${flat.number}`}
                          >
                            {isMobileStart && !resItem && !blockItem && (
                              <div className="w-full h-8 mx-0.5 rounded-md bg-emerald-600 text-white flex flex-col items-center justify-center text-[9px] font-black shadow-xs ring-2 ring-emerald-400">
                                <span>Check-in</span>
                              </div>
                            )}

                            {!isMobileStart && inDragRange && !resItem && !blockItem && (
                              <div className="w-full h-8 mx-0.5 rounded-md bg-indigo-600/90 text-white flex items-center justify-center text-[10px] font-black shadow-xs ring-1 ring-indigo-400">
                                ✨
                              </div>
                            )}

                            {!isMobileStart && !inDragRange && resItem && (
                              <div 
                                className={`w-full h-8 mx-0.5 rounded-md ${channelCfg?.bg} ${channelCfg?.text} flex items-center px-1 text-[10px] font-bold overflow-hidden shadow-2xs border ${channelCfg?.border}`}
                              >
                                {isCheckinDay && (
                                  <span className="truncate">{resItem.guestName}</span>
                                )}
                              </div>
                            )}

                            {!isMobileStart && !inDragRange && blockItem && !resItem && (
                              <div 
                                className="w-full h-8 mx-0.5 rounded-md bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs"
                                title={`Bloqueio: ${blockItem.reason} (${blockItem.notes || ''})`}
                              >
                                <Lock className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </Card>

        {/* Mobile 2-Tap Selection Floating Banner (Topo não-obstrutivo) */}
        {mobileRangeStart && !isDragging && (
          <div className="fixed top-4 inset-x-3 sm:top-5 sm:inset-x-auto sm:right-6 z-50 bg-slate-950/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-xs border border-emerald-500/80 animate-in slide-in-from-top duration-200 max-w-md mx-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 text-white font-bold text-xs">
                1º
              </div>
              <div className="min-w-0">
                <span className="block font-black text-emerald-400 text-xs truncate">
                  Apt {mobileRangeStart.flatNumber} • Check-in: {format(mobileRangeStart.day, "dd/MM/yyyy")}
                </span>
                <span className="block text-[10px] text-slate-300 font-medium truncate">
                  👉 Toque no dia de saída para abrir a reserva
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button 
                type="button" 
                size="sm" 
                onClick={() => {
                  handleOpenNewRes(mobileRangeStart.flatId, mobileRangeStart.day)
                  setMobileRangeStart(null)
                }}
                className="h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 rounded-lg shadow-xs"
              >
                1 Diária
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={() => setMobileRangeStart(null)}
                className="h-7 text-xs font-bold text-slate-400 hover:text-white px-2 rounded-lg"
              >
                ✕
              </Button>
            </div>
          </div>
        )}

        {/* Floating Indicator during Drag */}
        {isDragging && dragStartDay && dragHoverDay && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold ring-2 ring-indigo-500 animate-bounce">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div>
              <span>
                Apt {data.flats.find(f => f.id === dragFlatId)?.number}: {format(dragStartDay <= dragHoverDay ? dragStartDay : dragHoverDay, "dd/MM")} até {format(addDays(dragStartDay <= dragHoverDay ? dragHoverDay : dragStartDay, 1), "dd/MM")} ({Math.max(1, differenceInDays(dragStartDay <= dragHoverDay ? dragHoverDay : dragStartDay, dragStartDay <= dragHoverDay ? dragStartDay : dragHoverDay) + 1)} diárias)
              </span>
              <span className="block text-[10px] font-normal opacity-80">Solte para abrir a reserva</span>
            </div>
          </div>
        )}

        {/* Modal: New / Edit Reservation */}
        <Dialog open={resModalOpen} onOpenChange={setResModalOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSaveRes}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary" />
                  {selectedRes ? `Editar Reserva: ${selectedRes.code}` : "Nova Reserva"}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados do hóspede, datas da estadia e valores.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Apartamento</Label>
                    <Select value={formFlatId} onValueChange={setFormFlatId}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Selecione o Flat" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.flats.map(f => (
                          <SelectItem key={f.id} value={String(f.id)}>Apt {f.number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Canal de Origem</Label>
                    <Select value={formChannel} onValueChange={setFormChannel}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Canal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="site">🌐 Site Próprio / Motor de Reservas</SelectItem>
                        <SelectItem value="whatsapp">💬 WhatsApp / Reserva Direta</SelectItem>
                        <SelectItem value="booking">🔵 Booking.com</SelectItem>
                        <SelectItem value="airbnb">🔴 Airbnb</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Data de Entrada (Check-in)</Label>
                    <Input 
                      type="date" 
                      value={formCheckin} 
                      onChange={e => setFormCheckin(e.target.value)} 
                      required 
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Data de Saída (Check-out)</Label>
                    <Input 
                      type="date" 
                      value={formCheckout} 
                      onChange={e => setFormCheckout(e.target.value)} 
                      required 
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Early Check-in Switch */}
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Autorizar Early Check-in</span>
                      <span className="text-[11px] text-muted-foreground">Permite liberação na portaria antes das 13:00</span>
                    </div>
                  </div>
                  <Switch checked={formEarlyCheckin} onCheckedChange={setFormEarlyCheckin} />
                </div>

                {/* Auto NFS-e Switch */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Auto-Emitir Nota Fiscal (NFS-e) no Check-out</span>
                      <span className="text-[11px] text-muted-foreground">Emite e envia NFS-e no WhatsApp deste cliente no check-out (Padrão: OFF)</span>
                    </div>
                  </div>
                  <Switch checked={formAutoInvoice} onCheckedChange={setFormAutoInvoice} />
                </div>

                {/* Special Reception Notice */}
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Aviso / Nota Especial para a Portaria & Recepção</span>
                  </Label>
                  <Input 
                    value={formReceptionNotes} 
                    onChange={e => setFormReceptionNotes(e.target.value)} 
                    placeholder="Ex: Entregar chave extra, vaga de garagem G2-14 liberada..." 
                    className="text-xs border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30"
                  />
                </div>

                {/* Configuração do Quarto para a Governança / Camareiras */}
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <BedDouble className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Preparação do Quarto para as Camareiras</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-300">
                      Exibido no Card da Governança
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Prefere quartos altos */}
                    <button
                      type="button"
                      onClick={() => setFormPrefersHighFloor(!formPrefersHighFloor)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formPrefersHighFloor 
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs" 
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-amber-400"
                      }`}
                    >
                      <span>🏢 Andar Alto</span>
                      {formPrefersHighFloor && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    {/* 2 Camas de solteiro */}
                    <button
                      type="button"
                      onClick={() => setFormTwinBeds(!formTwinBeds)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formTwinBeds 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" 
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                      }`}
                    >
                      <span>🛏️ 2 Camas Solteiro</span>
                      {formTwinBeds && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    {/* Colchão extra */}
                    <button
                      type="button"
                      onClick={() => setFormExtraMattress(!formExtraMattress)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formExtraMattress 
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs" 
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-purple-400"
                      }`}
                    >
                      <span>➕ Colchão Extra</span>
                      {formExtraMattress && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    {/* Café da manhã incluso */}
                    <button
                      type="button"
                      onClick={() => setFormIncludeBreakfast(!formIncludeBreakfast)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between sm:col-span-3 ${
                        formIncludeBreakfast 
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs" 
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-amber-400"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>☕ Café da Manhã Incluso na Diária</span>
                      </span>
                      {formIncludeBreakfast ? (
                        <span className="flex items-center gap-1 text-[11px] bg-amber-700 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Habilitado</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Sem Café</span>
                      )}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Observação / Pedido Especial para o Quarto (Ex: Decoração de Casal, Kit Bebê...)
                    </Label>
                    <Input 
                      value={formSpecialRequests}
                      onChange={e => setFormSpecialRequests(e.target.value)}
                      placeholder="Ex: Decoração de casal, montar berço desmontável, travesseiro extra..."
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* 1. Quantidade de Hóspedes Autorizados (1, 2 ou 3) */}
                <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Quantidade de Hóspedes na Reserva</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200">
                      Capacidade Máxima: 3 Pessoas
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["1", "2", "3"] as const).map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormGuestCount(num)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          formGuestCount === num
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>{num} {num === "1" ? "Hóspede" : "Hóspedes"}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Tipo de Solicitante da Reserva (Próprio Hóspede, Terceiro ou Empresa) */}
                <div className="p-3 bg-slate-100/80 dark:bg-slate-900/80 border rounded-xl space-y-2.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                    Quem está solicitando a reserva?
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormRequesterType("guest")}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "guest"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>👤 Próprio Hóspede</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRequesterType("other_person")}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "other_person"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>👥 Outra Pessoa (Terceiro)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRequesterType("company")}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "company"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>🏢 Empresa (PJ / Faturamento)</span>
                    </button>
                  </div>

                  {/* Detalhes do Solicitante Terceiro */}
                  {formRequesterType === "other_person" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <span className="text-[10px] uppercase font-black text-primary block">Dados do Solicitante (Contato)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formRequesterName} onChange={e => setFormRequesterName(e.target.value)} placeholder="Nome do Solicitante" className="text-xs h-8" />
                        <Input value={formRequesterPhone} onChange={e => setFormRequesterPhone(e.target.value)} placeholder="WhatsApp do Solicitante" className="text-xs h-8" />
                      </div>
                    </div>
                  )}

                  {/* Detalhes do Solicitante Empresa */}
                  {formRequesterType === "company" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <span className="text-[10px] uppercase font-black text-primary block">Selecione a Empresa Cadastrada</span>
                      <Select value={formCompanyId} onValueChange={(val) => {
                        setFormCompanyId(val)
                        const c = companies.find(comp => String(comp.id) === val)
                        if (c) setFormCompanyName(c.tradeName || c.corporateName)
                      }}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Selecione a Empresa Parceira..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.tradeName || c.corporateName} • CNPJ: {c.cnpj}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* 3. Dados dos Hóspedes Autorizados (1, 2 e 3) */}
                <div className="space-y-3">
                  {/* Hóspede 1 (Principal) */}
                  <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5">
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-primary" />
                        <span>Hóspede 1 (Titular)</span>
                      </span>
                      <Badge variant="outline" className="text-[9px]">Check-in Principal</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={formGuestName} onChange={e => setFormGuestName(e.target.value)} placeholder="Nome Completo *" required className="text-xs h-8" />
                      <Input value={formGuest1Cpf} onChange={e => setFormGuest1Cpf(e.target.value)} placeholder="CPF / Documento" className="text-xs h-8" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={formGuestPhone} onChange={e => setFormGuestPhone(e.target.value)} placeholder="WhatsApp / Celular" className="text-xs h-8" />
                      <Input type="email" value={formGuestEmail} onChange={e => setFormGuestEmail(e.target.value)} placeholder="E-mail" className="text-xs h-8" />
                    </div>
                  </div>

                  {/* Hóspede 2 */}
                  {Number(formGuestCount) >= 2 && (
                    <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Hóspede 2 (Autorizado)</span>
                        </span>
                        <Badge variant="outline" className="text-[9px]">Acompanhante</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest2Name} onChange={e => setFormGuest2Name(e.target.value)} placeholder="Nome do 2º Hóspede" className="text-xs h-8" />
                        <Input value={formGuest2Cpf} onChange={e => setFormGuest2Cpf(e.target.value)} placeholder="CPF do 2º Hóspede" className="text-xs h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest2Phone} onChange={e => setFormGuest2Phone(e.target.value)} placeholder="WhatsApp do 2º Hóspede" className="text-xs h-8" />
                        <Input type="email" value={formGuest2Email} onChange={e => setFormGuest2Email(e.target.value)} placeholder="E-mail" className="text-xs h-8" />
                      </div>
                    </div>
                  )}

                  {/* Hóspede 3 */}
                  {Number(formGuestCount) === 3 && (
                    <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-purple-600" />
                          <span>Hóspede 3 (Autorizado)</span>
                        </span>
                        <Badge variant="outline" className="text-[9px]">Acompanhante Extra</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest3Name} onChange={e => setFormGuest3Name(e.target.value)} placeholder="Nome do 3º Hóspede" className="text-xs h-8" />
                        <Input value={formGuest3Cpf} onChange={e => setFormGuest3Cpf(e.target.value)} placeholder="CPF do 3º Hóspede" className="text-xs h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest3Phone} onChange={e => setFormGuest3Phone(e.target.value)} placeholder="WhatsApp do 3º Hóspede" className="text-xs h-8" />
                        <Input type="email" value={formGuest3Email} onChange={e => setFormGuest3Email(e.target.value)} placeholder="E-mail" className="text-xs h-8" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Financial values */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Valor da Diária (R$)</Label>
                    <Input 
                      type="number" 
                      value={formDailyRate} 
                      onChange={e => setFormDailyRate(e.target.value)} 
                      className="text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Total Calculado</Label>
                    <div className="h-9 px-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-md flex items-center font-bold text-xs text-emerald-700 dark:text-emerald-300">
                      R$ {calculateTotal().toLocaleString("pt-BR")}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Pagamento</Label>
                    <Select value={formPaymentStatus} onValueChange={setFormPaymentStatus}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="sinal_pago">Sinal Pago (50%)</SelectItem>
                        <SelectItem value="pago_total">Pago Total (100%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações Gerais da Reserva</Label>
                  <Textarea 
                    value={formNotes} 
                    onChange={e => setFormNotes(e.target.value)} 
                    placeholder="Ex: Cama de casal, chegada de madrugada, berço..." 
                    className="text-xs h-16 resize-none"
                  />
                </div>

                {/* 💳 Detalhes Oficiais de Pagamento & Rastreamento Bancário */}
                {selectedRes && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        💳 <span>Comprovante & Rastreamento Bancário</span>
                      </span>
                      <Badge className={selectedRes.paymentStatus === "pago_total" || selectedRes.paymentStatus === "pago" ? "bg-emerald-600 text-white font-bold text-[10px]" : "bg-amber-600 text-white font-bold text-[10px]"}>
                        {selectedRes.paymentStatus === "pago_total" || selectedRes.paymentStatus === "pago" ? "✓ Pago Integralmente" : (selectedRes.paymentStatus === "aguardando_pix" ? "Aguardando PIX" : "Pendente")}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground block font-medium">Forma de Pagamento:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {selectedRes.pixTxId ? "⚡ PIX Instantâneo (Banco Inter)" : (selectedRes.mpPaymentId ? "💳 Cartão de Crédito (Mercado Pago)" : (selectedRes.channel === "site" ? "PIX / Motor de Reservas" : "Reserva Manual / Direta"))}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground block font-medium">Valor Recebido:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {(selectedRes.paidAmount || selectedRes.totalAmount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {selectedRes.paidAt && (
                      <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                        <span className="text-muted-foreground font-medium">Data e Hora da Liquidação:</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {format(parseISO(selectedRes.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                        </span>
                      </div>
                    )}

                    {selectedRes.pixEndToEndId && (
                      <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-0.5">
                        <span className="text-muted-foreground font-medium">End-to-End ID (Banco Central):</span>
                        <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-bold break-all select-all">
                          {selectedRes.pixEndToEndId}
                        </span>
                      </div>
                    )}

                    {selectedRes.pixTxId && (
                      <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-0.5">
                        <span className="text-muted-foreground font-medium">TxId da Cobrança (Banco Inter):</span>
                        <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all select-all">
                          {selectedRes.pixTxId}
                        </span>
                      </div>
                    )}

                    {selectedRes.mpPaymentId && (
                      <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                        <span className="text-muted-foreground font-medium">ID Pagamento Mercado Pago:</span>
                        <span className="font-mono text-[10px] text-sky-700 dark:text-sky-300 font-bold">
                          {selectedRes.mpPaymentId}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 justify-between">
                {selectedRes ? (
                  <Button type="button" variant="destructive" size="sm" onClick={handleDeleteRes} className="font-semibold text-xs gap-1">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancelar Reserva</span>
                  </Button>
                ) : <div />}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setResModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={savingRes} className="font-semibold text-xs">
                    {savingRes ? "Salvando..." : (selectedRes ? "Salvar Alterações" : "Criar Reserva")}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Room Block */}
        <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
          <DialogContent className="sm:max-w-sm">
            <form onSubmit={handleSaveBlock}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-slate-800" />
                  Bloquear Apartamento
                </DialogTitle>
                <DialogDescription>
                  Bloqueie o quarto para manutenção ou uso do proprietário.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Apartamento</Label>
                  <Select value={blockFlatId} onValueChange={setBlockFlatId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Selecione o Quarto" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.flats.map(f => (
                        <SelectItem key={f.id} value={String(f.id)}>Apt {f.number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Início</Label>
                    <Input type="date" value={blockStart} onChange={e => setBlockStart(e.target.value)} required className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Fim</Label>
                    <Input type="date" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} required className="text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Motivo do Bloqueio</Label>
                  <Select value={blockReason} onValueChange={setBlockReason}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manutencao">🛠️ Manutenção / Pintura</SelectItem>
                      <SelectItem value="proprietario">🔑 Uso do Proprietário</SelectItem>
                      <SelectItem value="outro">Outro Motivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Input value={blockNotes} onChange={e => setBlockNotes(e.target.value)} placeholder="Ex: Ar condicionado em reparo..." className="text-xs" />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setBlockModalOpen(false)}>Cancelar</Button>
                <Button type="submit" size="sm" className="font-semibold text-xs">Bloquear Quarto</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
