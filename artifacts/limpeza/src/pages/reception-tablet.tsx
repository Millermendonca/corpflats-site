import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Building2, User, Phone, CheckCircle2, AlertTriangle, Lock, Unlock, 
  LogOut, Clock, RefreshCw, FileText, ArrowRight, ShieldCheck, Undo2, 
  Sparkles, BedDouble, Calendar, UserCheck, KeyRound, AlertCircle, MessageSquare,
  ZoomIn, Eye, ExternalLink, X, Gift, MessageCircle, Download, QrCode
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function ReceptionTablet() {
  const [, setLocation] = useLocation()
  const [data, setData] = useState<{
    today: string
    arrivals: any[]
    inHouse: any[]
    completedToday: any[]
    departures: any[]
    totalFlats: number
  }>({
    today: format(new Date(), "yyyy-MM-dd"),
    arrivals: [],
    inHouse: [],
    completedToday: [],
    departures: [],
    totalFlats: 0
  })

  const [activeTab, setActiveTab] = useState<"arrivals" | "inHouse" | "completed">("arrivals")
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Modal Ficha FNHR
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [fnhrModalOpen, setFnhrModalOpen] = useState(false)
  const [modalGuestIndex, setModalGuestIndex] = useState(1)

  // Visualizador Ampliado de Fotos (Zoom / Lightbox)
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; title: string } | null>(null)

  // Diálogo de Liberação Forçada de Quarto em Limpeza
  const [forceCheckinItem, setForceCheckinItem] = useState<any | null>(null)

  // Diálogo de Confirmação de Entrada Parcial
  const [partialCheckinItem, setPartialCheckinItem] = useState<{
    item: any
    clearedGuests: any[]
    pendingGuests: any[]
  } | null>(null)

  const [generatingTokenFor, setGeneratingTokenFor] = useState<number | null>(null)

  const handleGenerateSecureToken = async (item: any, guestIndex: number, action: "copy" | "whatsapp") => {
    setGeneratingTokenFor(guestIndex)
    try {
      const code = item.code || item.id
      const res = await fetch(`/api/pms/pre-checkin/${encodeURIComponent(code)}/signature-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIndex })
      })
      const data = await res.json()
      if (res.ok && data.signatureUrl) {
        if (action === "copy") {
          navigator.clipboard.writeText(data.signatureUrl)
          alert(`Link de assinatura com validade jurídica (expira em 2h) copiado com sucesso!\n\n${data.signatureUrl}`)
        } else {
          const rawGuests = item.guests || []
          const g = rawGuests.find((x: any) => x.index === guestIndex) || {}
          const phone = (g.phone || item.guestPhone || "").replace(/\D/g, "")
          const msg = encodeURIComponent(
            `Olá, ${g.name || item.guestName || 'Hóspede'}! 🏨\n\nSegue seu link seguro de Check-in Digital com validade de 2 horas (MP 2.200-2/2001 e Lei 14.063/2020):\n${data.signatureUrl}\n\nPreencha e assine no seu celular para autorização de entrada no Apt ${item.flatNumber}.`
          )
          window.open(phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank")
        }
      } else {
        alert(data.error || "Erro ao gerar link de assinatura temporário.")
      }
    } catch {
      alert("Erro ao conectar com servidor.")
    } finally {
      setGeneratingTokenFor(null)
    }
  }

  // Clock interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchToday = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/reception/today", { credentials: "include" })
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchToday()
    const poll = setInterval(fetchToday, 15000) // 15s auto-refresh for tablet
    return () => clearInterval(poll)
  }, [])

  const handleCheckin = async (resItem: any, force = false, guestIndices?: number[], isPartial = false) => {
    const rawGuests = resItem.guests || [{ index: 1, name: resItem.guestName, hasCompletedCheckin: resItem.hasPreCheckin, entryAuthorized: false }]
    const completedGuests = rawGuests.filter((g: any) => g.hasCompletedCheckin)
    const pendingGuests = rawGuests.filter((g: any) => !g.hasCompletedCheckin)

    if (completedGuests.length === 0) {
      alert("Acesso Bloqueado na Portaria:\n\nNenhum hóspede concluiu o Pré-Check-in Digital ainda. Conforme as normas de segurança da CorpFlats, o hóspede deve preencher a ficha digital antes da liberação de entrada.")
      return
    }

    // Se houver hóspedes pendentes e ainda não foi confirmado modal parcial nem especificado hóspedes
    if (pendingGuests.length > 0 && !isPartial && (!guestIndices || guestIndices.length === 0)) {
      const clearedNotEntered = rawGuests.filter((g: any) => g.hasCompletedCheckin && !g.entryAuthorized)
      setPartialCheckinItem({
        item: resItem,
        clearedGuests: clearedNotEntered.length > 0 ? clearedNotEntered : completedGuests,
        pendingGuests: pendingGuests
      })
      return
    }

    if (!resItem.isRoomReady && !force) {
      setForceCheckinItem(resItem)
      return
    }

    try {
      const payload: any = { force: true }
      if (isPartial) {
        payload.partial = true
      }
      if (guestIndices && guestIndices.length > 0) {
        payload.guestIndices = guestIndices
      }

      const res = await fetch(`/api/reception/checkin/${resItem.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Erro ao realizar check-in.")
        return
      }
      setForceCheckinItem(null)
      setPartialCheckinItem(null)
      fetchToday()
    } catch {
      alert("Erro de conexão ao registrar check-in.")
    }
  }

  const executePartialCheckin = async (info: { item: any; clearedGuests: any[]; pendingGuests: any[] }) => {
    await handleCheckin(
      info.item,
      true,
      info.clearedGuests.map((g: any) => g.index),
      true
    )
  }

  const handleCheckout = async (resItem: any) => {
    try {
      const res = await fetch(`/api/reception/checkout/${resItem.id}`, {
        method: "POST",
        credentials: "include"
      })
      const json = await res.json()
      if (json.autoInvoiceEmitted) {
        alert(`✅ Check-out do Apt ${resItem.flatNumber} concluído!\n🧾 NFS-e Nº ${json.autoInvoiceNumber} foi emitida automaticamente na Prefeitura de Campos dos Goytacazes e está disponível para envio no WhatsApp!`)
      }
      fetchToday()
    } catch {}
  }

  const handleUndoCheckout = async (resItem: any) => {
    try {
      await fetch(`/api/reception/undo-checkout/${resItem.id}`, {
        method: "POST",
        credentials: "include"
      })
      fetchToday()
    } catch {}
  }

  // Early Check-in logic: standard time is 14:00. Allowed from 13:00 without admin override.
  const currentHour = currentTime.getHours()
  const isWithinNormalWindow = currentHour >= 13

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none pb-16">
      {/* Top Tablet Header */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black shadow-lg">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">CorpFlats • Portaria & Recepção</h1>
              <Badge variant="outline" className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px] font-bold">
                Ao Vivo
              </Badge>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {format(currentTime, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>

        {/* Big Live Digital Clock */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-black text-primary font-mono tracking-wider">
              {format(currentTime, "HH:mm:ss")}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Horário de Brasília</div>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchToday}
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 h-10 px-3 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : ""}`} />
            <span className="text-xs font-bold">Atualizar</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Navigation Tabs (Big Touch Buttons) */}
        <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => setActiveTab("arrivals")}
            className={`py-3.5 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              activeTab === "arrivals"
                ? "bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-primary/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Chegadas Hoje ({data.arrivals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("inHouse")}
            className={`py-3.5 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              activeTab === "inHouse"
                ? "bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-primary/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
          >
            <BedDouble className="w-4 h-4" />
            <span>No Hotel ({data.inHouse.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={`py-3.5 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
              activeTab === "completed"
                ? "bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-primary/20"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
          >
            <Undo2 className="w-4 h-4" />
            <span>Saídas Realizadas ({data.completedToday?.length || 0})</span>
          </button>
        </div>

        {/* Tab 1: Chegadas de Hoje */}
        {activeTab === "arrivals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Check-ins Previstos para Hoje
              </h2>
              <span className="text-xs text-slate-400 font-medium">Toque no card para ver detalhes da FNHR e fotos</span>
            </div>

            {data.arrivals.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-base font-bold text-white">Nenhum check-in pendente para hoje!</div>
                <div className="text-xs">Todos os hóspedes previstos já realizaram a entrada.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.arrivals.map((item) => {
                  const isClean = item.isRoomReady
                  const canCheckin = Boolean(item.canAuthorizeEntry)

                  return (
                    <div 
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/80 hover:border-slate-600 rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all shadow-lg"
                    >
                      {/* Top: Flat number, Guest Info and Channel */}
                      <div className="border-b border-slate-700/60 pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            Apt {item.flatNumber}
                          </span>
                          <span className="text-xs font-semibold capitalize px-2.5 py-0.5 rounded-full bg-slate-700/80 text-sky-400 border border-slate-600/60">
                            {item.channel}
                          </span>
                        </div>
                        <div className="font-bold text-base text-slate-100 mt-1 truncate">
                          {item.guestName}
                        </div>
                        {item.guestPhone && (
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <a
                              href={`https://wa.me/55${(item.guestPhone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, ${item.guestName}! Falamos da administração da CorpFlats referente à sua reserva no Flat ${item.flatNumber}.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium hover:underline"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400 inline shrink-0" />
                              <span>{item.guestPhone}</span>
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Status de Governança do Flat & Check-in Antecipado */}
                      <div className="space-y-1.5 p-2.5 bg-slate-900/90 rounded-xl border border-slate-700/80 text-xs">
                        {/* Status do Flat */}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Status do flat:</span>
                          {item.cleaningStatus === "cleaning_now" ? (
                            <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold animate-pulse">
                              🧹 Limpando (há {item.cleaningMinutes || 0} min)
                            </Badge>
                          ) : item.cleaningStatus === "dirty" ? (
                            <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-bold">
                              ⚠️ Aguardando Limpeza (Sujo)
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                              ✨ Limpo
                            </Badge>
                          )}
                        </div>

                        {/* Check-in Antecipado */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                          <span className="text-slate-400 font-medium">Check-in antecipado:</span>
                          {item.earlyCheckinStatus === "Liberado" ? (
                            <span className="font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800 text-[10px]">
                              Liberado
                            </span>
                          ) : (
                            <span className="font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700 text-[10px]">
                              Não liberado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Lista de Hóspedes Autorizados a Subir (1, 2 ou 3) */}
                      <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-2.5 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                          <span>Hóspedes Autorizados ({item.guests?.length || item.guestCount || 1})</span>
                          <span className="text-slate-500 font-normal">Check-in Digital</span>
                        </div>
                        <div className="space-y-1">
                          {(item.guests || [{ index: 1, name: item.guestName, hasCompletedCheckin: item.hasPreCheckin, entryAuthorized: false }]).map((g: any, gIdx: number) => {
                            const isCleared = Boolean(g.hasCompletedCheckin)
                            const hasEntered = Boolean(g.entryAuthorized)
                            return (
                              <div 
                                key={gIdx} 
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium border ${
                                  hasEntered 
                                    ? "bg-emerald-950/60 border-emerald-700/70 text-emerald-200" 
                                    : isCleared 
                                      ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300" 
                                      : "bg-slate-800 border-slate-700/60 text-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">
                                    {g.index || gIdx + 1}
                                  </span>
                                  <span className="truncate font-semibold">{g.name || `Hóspede ${g.index || gIdx + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {hasEntered ? (
                                    <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 shadow-2xs">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Entrou
                                    </Badge>
                                  ) : isCleared ? (
                                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 shadow-2xs">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Liberado
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-amber-950/60 text-amber-400 border-amber-800 text-[9px] font-bold px-1.5 py-0">
                                      Pendente
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Special Reception Notice / Note (Highlighted Tag) */}
                      {item.receptionNotes && (
                        <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 text-xs flex items-start gap-2">
                          <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-black block uppercase text-[10px] text-amber-400">Aviso da Portaria</span>
                            <span className="font-medium">{item.receptionNotes}</span>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {(() => {
                        const guestsList = item.guests || [{ index: 1, name: item.guestName, hasCompletedCheckin: item.hasPreCheckin, entryAuthorized: false }]
                        const totalGuests = guestsList.length
                        const completedGuests = guestsList.filter((g: any) => g.hasCompletedCheckin).length
                        const pendingGuests = guestsList.filter((g: any) => !g.hasCompletedCheckin)
                        const enteredGuests = guestsList.filter((g: any) => g.entryAuthorized)
                        const clearedNotEntered = guestsList.filter((g: any) => g.hasCompletedCheckin && !g.entryAuthorized)

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedItem(item)
                                setModalGuestIndex(1)
                                setFnhrModalOpen(true)
                              }}
                              className="border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-200 font-bold text-xs h-12 rounded-xl"
                            >
                              <FileText className="w-4 h-4 mr-1 text-primary" />
                              <span>Ver Ficha / Link</span>
                            </Button>

                            {/* Caso 1: Há hóspede liberado que ainda não entrou e há hóspede com check-in pendente */}
                            {clearedNotEntered.length > 0 && pendingGuests.length > 0 ? (
                              <Button 
                                size="sm"
                                onClick={() => {
                                  setPartialCheckinItem({
                                    item,
                                    clearedGuests: clearedNotEntered,
                                    pendingGuests: pendingGuests
                                  })
                                }}
                                className="font-bold text-xs h-12 rounded-xl gap-2 shadow-md transition-all bg-amber-600 hover:bg-amber-500 text-white"
                              >
                                <Unlock className="w-4 h-4 shrink-0" />
                                <span className="truncate">
                                  {enteredGuests.length > 0 
                                    ? `Liberar Entrada Restante (${clearedNotEntered.length})` 
                                    : `Liberar Entrada Parcial (${completedGuests}/${totalGuests})`}
                                </span>
                              </Button>
                            ) : clearedNotEntered.length === 0 && pendingGuests.length > 0 ? (
                              /* Caso 2: Todos os liberados já entraram, restante pendente */
                              <Button 
                                size="sm"
                                onClick={() => {
                                  const names = pendingGuests.map((g: any) => g.name || `Hóspede ${g.index}`).join(", ")
                                  alert(`Check-in Digital Pendente:\n\nO(s) hóspede(s) ${names} ainda não concluíram o Pré-Check-in Digital.\n\nAcesse "Ver Ficha / Link" para enviar o link individual pelo WhatsApp. A entrada deles será liberada na portaria assim que preencherem.`)
                                }}
                                className="font-bold text-xs h-12 rounded-xl gap-2 shadow-md transition-all bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-300"
                              >
                                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="truncate">
                                  {enteredGuests.length > 0 
                                    ? `Aguardando Entrada (${enteredGuests.length}/${totalGuests} no apt)` 
                                    : `Check-in Pendente (0/${totalGuests})`}
                                </span>
                              </Button>
                            ) : completedGuests === 0 ? (
                              /* Caso 3: Nenhum hóspede concluiu o check-in */
                              <Button 
                                size="sm"
                                onClick={() => {
                                  alert(`Acesso Bloqueado na Portaria:\n\nNenhum hóspede concluiu o Pré-Check-in Digital nesta reserva ainda.\n\nPor favor, solicite aos hóspedes que preencham a ficha digital para liberação de entrada.`)
                                }}
                                className="font-bold text-xs h-12 rounded-xl gap-2 shadow-md transition-all bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-300"
                              >
                                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="truncate">Check-in Pendente (0/{totalGuests})</span>
                              </Button>
                            ) : !isClean ? (
                              /* Caso 4: Quarto ainda em limpeza */
                              <Button 
                                size="sm"
                                onClick={() => handleCheckin(item)}
                                className="font-bold text-xs h-12 rounded-xl gap-2 shadow-md transition-all bg-rose-950/80 hover:bg-rose-900/90 border border-rose-800/80 text-rose-300"
                              >
                                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                                <span className="truncate">Quarto em Limpeza</span>
                              </Button>
                            ) : (
                              /* Caso 5: Todos liberados e quarto limpo */
                              <Button 
                                size="sm"
                                onClick={() => handleCheckin(item)}
                                className="font-bold text-xs h-12 rounded-xl gap-2 shadow-md transition-all bg-emerald-600 hover:bg-emerald-500 text-white font-black"
                              >
                                <Unlock className="w-4 h-4 shrink-0" />
                                <span>Liberar Entrada</span>
                              </Button>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Hóspedes Hospedados (In House) */}
        {activeTab === "inHouse" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-primary" />
                Hóspedes Atualmente Hospedados ({data.inHouse.length})
              </h2>
              <span className="text-xs text-slate-400 font-medium">Toque em Check-out para registrar a saída</span>
            </div>

            {data.inHouse.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <BedDouble className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-base font-bold text-white">Nenhum hóspede hospedado no momento.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.inHouse.map((item) => {
                  return (
                    <div 
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-black text-white tracking-tight">Apt {item.flatNumber}</div>
                          <div className="font-bold text-sm text-slate-200">{item.guestName}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Estadia: {item.checkinDate} até {item.checkoutDate}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {item.autoEmitInvoice && (
                            <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold flex items-center gap-1">
                              <FileText className="w-3 h-3 text-emerald-400" />
                              <span>Auto NFS-e</span>
                            </Badge>
                          )}
                          {item.isPartialCheckin ? (
                            <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold animate-pulse">
                              🟡 Entrada Parcial
                            </Badge>
                          ) : item.isCheckoutToday ? (
                            <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-black animate-pulse">
                              Saída Hoje
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-900 text-slate-400 border-slate-700 text-[10px]">
                              Hospedado
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Lista de Hóspedes e Status de Entrada */}
                      <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-2.5 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                          <span>Hóspedes ({item.guests?.length || item.guestCount || 1})</span>
                          <span className="text-slate-500 font-normal">Entrada Portaria</span>
                        </div>
                        <div className="space-y-1">
                          {(item.guests || [{ index: 1, name: item.guestName, hasCompletedCheckin: true, entryAuthorized: true }]).map((g: any, gIdx: number) => {
                            const isCleared = Boolean(g.hasCompletedCheckin)
                            const hasEntered = Boolean(g.entryAuthorized)
                            return (
                              <div 
                                key={gIdx} 
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium border ${
                                  hasEntered
                                    ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-200"
                                    : isCleared
                                      ? "bg-sky-950/40 border-sky-800/50 text-sky-200"
                                      : "bg-amber-950/30 border-amber-800/40 text-amber-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate pr-2">
                                  <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">
                                    {g.index || gIdx + 1}
                                  </span>
                                  <span className="truncate font-semibold">{g.name || `Hóspede ${g.index || gIdx + 1}`}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {hasEntered ? (
                                    <Badge className="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0 flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> No Quarto
                                    </Badge>
                                  ) : isCleared ? (
                                    <Button
                                      size="sm"
                                      onClick={() => handleCheckin(item, true, [g.index], true)}
                                      className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1 shadow-xs"
                                    >
                                      <Unlock className="w-2.5 h-2.5" /> Liberar Entrada
                                    </Button>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="bg-amber-950/60 text-amber-400 border-amber-800 text-[9px] font-bold px-1.5 py-0">
                                        Pendente
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const preCheckinUrl = `${window.location.origin}/pre-checkin/${item.code || item.id}?guest=${g.index || gIdx + 1}`
                                          const phone = (g.phone || item.guestPhone || "").replace(/\D/g, "")
                                          const msg = encodeURIComponent(
                                            `Olá, ${g.name || 'Hóspede'}! 🏨\n\nPor favor, realize seu Check-in Digital para liberação da sua entrada no Apt ${item.flatNumber}:\n${preCheckinUrl}\n\nObrigado e boa estadia!`
                                          )
                                          window.open(phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank")
                                        }}
                                        className="h-6 w-6 p-0 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300"
                                        title="Enviar WhatsApp"
                                      >
                                        <MessageCircle className="w-3 h-3 text-emerald-400" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Notice */}
                      {item.receptionNotes && (
                        <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 text-xs flex items-start gap-2">
                          <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span className="font-medium">{item.receptionNotes}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item)
                            setModalGuestIndex(1)
                            setFnhrModalOpen(true)
                          }}
                          className="border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-200 font-bold text-xs h-11 rounded-xl"
                        >
                          <FileText className="w-4 h-4 mr-1 text-primary" />
                          <span>Ficha</span>
                        </Button>

                        <Button 
                          size="sm"
                          onClick={() => handleCheckout(item)}
                          className="col-span-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs h-11 rounded-xl gap-2 shadow-md"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Check-out</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Saídas Realizadas Hoje (Desfazer Permanente) */}
        {activeTab === "completed" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <Undo2 className="w-4 h-4 text-primary" />
                Check-outs Realizados Hoje ({data.completedToday?.length || 0})
              </h2>
              <span className="text-xs text-slate-400 font-medium">O botão de desfazer fica disponível o tempo todo</span>
            </div>

            {!data.completedToday || data.completedToday.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-base font-bold text-white">Nenhum check-out realizado hoje ainda.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.completedToday.map((item) => {
                  return (
                    <div 
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-black text-white tracking-tight">Apt {item.flatNumber}</div>
                          <div className="font-bold text-sm text-slate-200">{item.guestName}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Status: Quarto Desocupado
                          </div>
                        </div>

                        <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px] font-bold">
                          Check-out Concluído
                        </Badge>
                      </div>

                      {/* Permanent Undo Button */}
                      <Button 
                        size="sm"
                        onClick={() => handleUndoCheckout(item)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black text-xs h-11 rounded-xl gap-2 shadow-md"
                      >
                        <Undo2 className="w-4 h-4 text-amber-400" />
                        <span>Desfazer Check-out (Reativar Hospedado)</span>
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: Ficha Completa do Hóspede (FNHR, Selfie, Documento) */}
      <Dialog open={fnhrModalOpen} onOpenChange={setFnhrModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Ficha de Entrada & FNHR: Apt {selectedItem?.flatNumber}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Dados oficiais coletados no Pré-Checkin Digital.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (() => {
            const rawGuests = selectedItem.guests && selectedItem.guests.length > 0
              ? selectedItem.guests
              : [{ 
                  index: 1, 
                  name: selectedItem.guestName, 
                  phone: selectedItem.guestPhone,
                  document: selectedItem.guestDocument,
                  hasCompletedCheckin: selectedItem.hasPreCheckin,
                  selfieUrl: selectedItem.guestPhoto,
                  docPhotoUrl: selectedItem.docPhoto,
                  signatureUrl: selectedItem.signatureUrl
                }]

            const currentGuest = rawGuests.find((g: any) => g.index === modalGuestIndex) || rawGuests[0]
            const activeSelfie = currentGuest.selfieUrl || (currentGuest.index === 1 ? selectedItem.guestPhoto : null)
            const activeDoc = currentGuest.docPhotoUrl || (currentGuest.index === 1 ? selectedItem.docPhoto : null)
            const activeSig = currentGuest.signatureUrl || (currentGuest.index === 1 ? selectedItem.signatureUrl : null)

            return (
              <div className="py-3 space-y-4 text-xs">
                {/* Guest Switcher Tabs (Hóspede 1 / Hóspede 2) */}
                {rawGuests.length > 1 && (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                    {rawGuests.map((g: any) => {
                      const isSelected = modalGuestIndex === g.index
                      return (
                        <button
                          key={g.index}
                          type="button"
                          onClick={() => setModalGuestIndex(g.index)}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-slate-400 hover:text-white hover:bg-slate-800"
                          }`}
                        >
                          <span className="truncate">{g.name ? g.name.split(" ")[0] : `Hóspede ${g.index}`}</span>
                          {g.hasCompletedCheckin ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 shrink-0">Pendente</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Alerta de Menor de Idade (ECA Art. 82) se aplicável */}
                {currentGuest.isMinor && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl space-y-1.5 text-rose-300">
                    <div className="flex items-center gap-2 font-bold text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Hóspede Menor de Idade • ECA (Art. 82)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300">
                      Parentesco: <strong>{currentGuest.minorKinship === "filho" ? "Filho(a) dos pais acompanhantes" : currentGuest.minorKinship || "Outro"}</strong>
                      {currentGuest.minorAuthDocUrl ? " • Autorização em Cartório Anexada" : currentGuest.minorKinship === "filho" ? " • Acompanhado pelos pais" : " • ⚠️ Sem documento em cartório"}
                    </p>
                    {currentGuest.minorAuthDocUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setZoomedPhoto({ url: currentGuest.minorAuthDocUrl, title: `Autorização em Cartório - ${currentGuest.name}` })}
                        className="h-7 text-[10px] bg-rose-900/40 border-rose-700 text-rose-200 hover:bg-rose-900 font-bold gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Autorização do Cartório</span>
                      </Button>
                    )}
                  </div>
                )}

                {/* Alerta de Atenção da Gestão (ex: Jovem local < 30a) */}
                {selectedItem.riskAttentionAlert && (
                  <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl space-y-1 text-amber-300">
                    <div className="flex items-center gap-2 font-bold text-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Aviso de Atenção para a Portaria</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      {selectedItem.riskAttentionReason || "Hóspede local com menos de 30 anos (Campos dos Goytacazes). Recomenda-se conferência atenta de documentos e cumprimento estrito do regulamento."}
                    </p>
                  </div>
                )}

                {/* Status IA de Biometria e Documentos (se avaliado) */}
                {currentGuest.aiVerification && (
                  <div className="p-2.5 bg-sky-950/50 border border-sky-800/60 rounded-xl flex items-center justify-between text-[11px] text-sky-200">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      Auditoria de Identidade por IA
                    </span>
                    <Badge className={currentGuest.aiVerification.facesMatch ? "bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]" : "bg-rose-950 text-rose-300 border-rose-800 text-[10px]"}>
                      {currentGuest.aiVerification.facesMatch ? "✓ Rosto & Documento Conferem" : "⚠️ Divergência Detectada"}
                    </Badge>
                  </div>
                )}

                {/* Photos Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300 block text-[10px] uppercase">Selfie com Documento</span>
                      {activeSelfie && (
                        <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                          <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                        </span>
                      )}
                    </div>
                    <div 
                      onClick={() => {
                        if (activeSelfie) {
                          setZoomedPhoto({ 
                            url: activeSelfie, 
                            title: `Selfie - ${currentGuest.name || selectedItem.guestName} (Apt ${selectedItem.flatNumber})` 
                          })
                        }
                      }}
                      className={`h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                        activeSelfie ? "cursor-pointer hover:border-primary/60 transition-all" : ""
                      }`}
                    >
                      {activeSelfie ? (
                        <>
                          <img src={activeSelfie} alt="Selfie" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                            <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-600 text-center px-2">Selfie não enviada</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300 block text-[10px] uppercase">Foto do Documento</span>
                      {activeDoc && (
                        <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                          <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                        </span>
                      )}
                    </div>
                    <div 
                      onClick={() => {
                        if (activeDoc) {
                          setZoomedPhoto({ 
                            url: activeDoc, 
                            title: `Foto do Documento - ${currentGuest.name || selectedItem.guestName} (Apt ${selectedItem.flatNumber})` 
                          })
                        }
                      }}
                      className={`h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                        activeDoc ? "cursor-pointer hover:border-primary/60 transition-all" : ""
                      }`}
                    >
                      {activeDoc ? (
                        <>
                          <img src={activeDoc} alt="Documento" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                            <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-600 text-center px-2">Doc não enviado</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Data Grid do Hóspede Selecionado */}
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Nome do Hóspede</span>
                      <span className="font-bold text-white text-sm">{currentGuest.name || selectedItem.guestName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Telefone / WhatsApp</span>
                      {(currentGuest.phone || selectedItem.guestPhone) ? (
                        <a
                          href={`https://wa.me/55${((currentGuest.phone || selectedItem.guestPhone) || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, ${currentGuest.name || selectedItem.guestName}! Falamos da administração da CorpFlats referente à sua reserva no Flat ${selectedItem.flatNumber}.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-emerald-400 hover:text-emerald-300 hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{currentGuest.phone || selectedItem.guestPhone}</span>
                        </a>
                      ) : (
                        <span className="font-semibold text-slate-400">Não informado</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">CPF / Documento</span>
                      <span className="font-semibold text-slate-200 font-mono">{currentGuest.cpf || currentGuest.document || selectedItem.guestDocument || "Não informado"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Nascimento / Idade</span>
                      <span className="font-semibold text-slate-200">
                        {currentGuest.birthDate ? `${currentGuest.birthDate} ${currentGuest.age ? `(${currentGuest.age} anos)` : ''}` : "Não informado"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Check-in</span>
                      <span className="font-semibold text-slate-200">{selectedItem.checkinDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Check-out</span>
                      <span className="font-semibold text-slate-200">{selectedItem.checkoutDate}</span>
                    </div>
                  </div>
                </div>

                {/* Status dos Hóspedes e Links de Check-in Digital Jurídico */}
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[10px] uppercase block text-slate-400">
                      Check-in Digital Jurídico (Token 2h) • {rawGuests.length} Hóspede(s)
                    </span>
                    <Badge className="bg-sky-950 text-sky-300 border-sky-800 text-[9px] font-bold">
                      Validade Jurídica (MP 2.200-2/01)
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {rawGuests.map((g: any, i: number) => {
                      const guestIdx = g.index || i + 1;
                      const isGenerating = generatingTokenFor === guestIdx;
                      const hasPdf = Boolean(g.fnrhPdfUrl || selectedItem.fnrhPdfUrl);
                      const docUuid = g.fnrhDocumentUuid || selectedItem.fnrhDocumentUuid;

                      return (
                        <div key={i} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px]">
                                {guestIdx}
                              </span>
                              <div>
                                <span className="font-bold text-slate-200 block">{g.name || `Hóspede ${guestIdx}`}</span>
                                <span className="text-[10px] text-slate-400">
                                  {g.hasCompletedCheckin ? "✅ Ficha & Assinatura Concluídas" : "⏳ Assinatura Pendente"}
                                </span>
                              </div>
                            </div>
                            {g.hasCompletedCheckin ? (
                              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                                Concluído
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px] font-bold">
                                Pendente
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isGenerating}
                              onClick={() => handleGenerateSecureToken(selectedItem, guestIdx, "copy")}
                              className="h-7 text-[10px] px-2.5 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 font-bold rounded-lg"
                            >
                              <Clock className="w-3 h-3 mr-1 text-sky-400" />
                              <span>{isGenerating ? "Gerando..." : "Copiar Link (2h)"}</span>
                            </Button>

                            <Button
                              size="sm"
                              disabled={isGenerating}
                              onClick={() => handleGenerateSecureToken(selectedItem, guestIdx, "whatsapp")}
                              className="h-7 text-[10px] px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-xs"
                            >
                              <MessageCircle className="w-3 h-3 mr-1" />
                              <span>WhatsApp Seguro (2h)</span>
                            </Button>

                            {hasPdf && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(g.fnrhPdfUrl || selectedItem.fnrhPdfUrl, "_blank")}
                                className="h-7 text-[10px] px-2 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 font-bold rounded-lg"
                              >
                                <Download className="w-3 h-3 mr-1 text-emerald-400" />
                                <span>PDF FNRH</span>
                              </Button>
                            )}

                            {docUuid && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(`/verificar-ficha/${docUuid}`, "_blank")}
                                className="h-7 text-[10px] px-2 bg-sky-950 border-sky-800 hover:bg-sky-900 text-sky-300 font-bold rounded-lg"
                              >
                                <QrCode className="w-3 h-3 mr-1" />
                                <span>Validar QR Code</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reception Note */}
                {selectedItem.receptionNotes && (
                  <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300">
                    <span className="font-bold text-[10px] uppercase block text-amber-400">Aviso Especial para a Portaria</span>
                    <span className="font-medium text-xs">{selectedItem.receptionNotes}</span>
                  </div>
                )}

                {/* Digital Signature */}
                {activeSig && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300 block text-[10px] uppercase">Assinatura Digital</span>
                      <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                      </span>
                    </div>
                    <div 
                      onClick={() => {
                        setZoomedPhoto({ 
                          url: activeSig, 
                          title: `Assinatura Digital - ${currentGuest.name || selectedItem.guestName} (Apt ${selectedItem.flatNumber})` 
                        })
                      }}
                      className="h-24 bg-white rounded-xl p-2 flex items-center justify-center border cursor-pointer hover:border-primary transition-all relative group shadow-inner"
                    >
                      <img src={activeSig} alt="Assinatura" className="max-h-full object-contain group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-slate-900 text-xs font-bold gap-1 transition-opacity rounded-xl">
                        <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              onClick={() => {
                if (selectedItem) {
                  window.open(`/pre-checkin/${selectedItem.code || selectedItem.id}?guest=${modalGuestIndex}&readonly=true&view=document`, "_blank")
                }
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>Abrir Ficha Digital no Tablet</span>
            </Button>
            <Button 
              type="button" 
              onClick={() => setFnhrModalOpen(false)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Visualizador Ampliado de Fotos (Zoom / Lightbox) */}
      <Dialog open={Boolean(zoomedPhoto)} onOpenChange={(open) => !open && setZoomedPhoto(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] p-4 bg-slate-950/95 border-slate-800 text-white flex flex-col justify-between">
          <DialogHeader className="pb-2 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Eye className="w-4 h-4 text-primary" />
                <span>{zoomedPhoto?.title || "Visualização da Foto"}</span>
              </DialogTitle>
            </div>
          </DialogHeader>

          {zoomedPhoto?.url && (
            <div className="my-3 flex items-center justify-center overflow-hidden max-h-[65vh] bg-black/60 rounded-2xl border border-slate-800/80 p-2">
              <img 
                src={zoomedPhoto.url} 
                alt={zoomedPhoto.title} 
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-2xl" 
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between flex-row pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (zoomedPhoto?.url) {
                  const w = window.open("")
                  w?.document.write(`<img src="${zoomedPhoto.url}" style="max-width:100%;height:auto;display:block;margin:auto;background:#111;padding:20px;" />`)
                }
              }}
              className="text-xs bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir em Nova Aba</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setZoomedPhoto(null)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              Fechar Visualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmação de Liberação de Quarto em Limpeza */}
      <Dialog open={Boolean(forceCheckinItem)} onOpenChange={(open) => !open && setForceCheckinItem(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-400">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>Confirmar Liberação de Entrada</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Apt {forceCheckinItem?.flatNumber} • {forceCheckinItem?.guestName}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-2 text-xs">
            <div className="p-3.5 bg-rose-950/40 border border-rose-900/60 rounded-xl space-y-1 text-rose-300">
              <span className="font-bold block text-rose-200">⚠️ Quarto consta como "Em Higienização"</span>
              <p className="leading-relaxed text-slate-300">
                A governança ainda não havia marcado a conclusão da limpeza no sistema. Ao confirmar a liberação, o quarto será automaticamente registrado como <strong>Limpo & Ocupado</strong>.
              </p>
            </div>
            <p className="text-slate-400 text-[11px]">
              Deseja confirmar o check-in presencial do hóspede e liberar a entrada agora?
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForceCheckinItem(null)}
              className="text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => forceCheckinItem && handleCheckin(forceCheckinItem, true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
            >
              <Unlock className="w-4 h-4" />
              <span>Confirmar & Liberar Entrada</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmação de Entrada Parcial de Hóspede */}
      <Dialog open={Boolean(partialCheckinItem)} onOpenChange={(open) => !open && setPartialCheckinItem(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-400">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>Confirmar Entrada Parcial</span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Apt {partialCheckinItem?.item?.flatNumber} • {partialCheckinItem?.item?.guestName}
            </DialogDescription>
          </DialogHeader>

          {partialCheckinItem && (
            <div className="py-3 space-y-3 text-xs">
              {/* Box Hóspede(s) Pendente(s) */}
              <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl space-y-1.5 text-amber-200">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Hóspede(s) com Check-in Pendente:</span>
                </div>
                <div className="space-y-1 pl-5">
                  {partialCheckinItem.pendingGuests.map((g: any) => (
                    <div key={g.index} className="flex items-center justify-between font-semibold">
                      <span>• {g.name || `Hóspede ${g.index}`}</span>
                      <span className="text-[10px] text-amber-400/90 font-normal">Ficha digital não preenchida</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Box Hóspede(s) Liberado(s) */}
              <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl space-y-1.5 text-emerald-200">
                <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Entrada Liberada Apenas Para:</span>
                </div>
                <div className="space-y-1 pl-5">
                  {partialCheckinItem.clearedGuests.map((g: any) => (
                    <div key={g.index} className="flex items-center justify-between font-bold text-white">
                      <span>• {g.name || `Hóspede ${g.index}`}</span>
                      <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0">Check-in OK</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pergunta Solicitada pelo Usuário */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-2">
                <p className="text-sm font-black text-slate-100 leading-snug">
                  Deseja registrar a entrada apenas de{" "}
                  <span className="text-emerald-400">
                    {partialCheckinItem.clearedGuests.map((g: any) => g.name || `Hóspede ${g.index}`).join(" e ")}
                  </span>
                  ?
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  O hóspede pendente continuará com entrada bloqueada na portaria até que complete o pré-check-in digital.
                </p>
              </div>

              {/* Aviso caso quarto ainda esteja em limpeza */}
              {!partialCheckinItem.item.isRoomReady && (
                <div className="p-2.5 bg-rose-950/50 border border-rose-900/70 rounded-xl text-[11px] text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>Atenção: Quarto consta como em higienização. Ao confirmar, será atualizado como limpo e ocupado.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPartialCheckinItem(null)}
              className="text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => partialCheckinItem && executePartialCheckin(partialCheckinItem)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
            >
              <Unlock className="w-4 h-4" />
              <span>
                Confirmar Entrada de{" "}
                {partialCheckinItem?.clearedGuests?.length === 1
                  ? (partialCheckinItem.clearedGuests[0].name || "").split(" ")[0] || "Hóspede"
                  : "Hóspedes Liberados"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
