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
  ZoomIn, Eye, ExternalLink, X, Gift, MessageCircle
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

  // Visualizador Ampliado de Fotos (Zoom / Lightbox)
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; title: string } | null>(null)

  // Diálogo de Liberação Forçada de Quarto em Limpeza
  const [forceCheckinItem, setForceCheckinItem] = useState<any | null>(null)

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

  const handleCheckin = async (resItem: any, force = false) => {
    if (!resItem.isRoomReady && !force) {
      setForceCheckinItem(resItem)
      return
    }

    try {
      const res = await fetch(`/api/reception/checkin/${resItem.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
        credentials: "include"
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Erro ao realizar check-in.")
        return
      }
      setForceCheckinItem(null)
      fetchToday()
    } catch {}
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
                              href={`https://wa.me/55${(item.guestPhone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, ${item.guestName}! Falamos da recepção da CorpFlats referente à sua reserva no Flat ${item.flatNumber}.`)}`}
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
                          {(item.guests || [{ index: 1, name: item.guestName, hasCompletedCheckin: item.hasPreCheckin }]).map((g: any, gIdx: number) => {
                            const isCleared = Boolean(g.hasCompletedCheckin)
                            return (
                              <div 
                                key={gIdx} 
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium border ${
                                  isCleared 
                                    ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-200" 
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
                                  {isCleared ? (
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item)
                            setFnhrModalOpen(true)
                          }}
                          className="border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-200 font-bold text-xs h-12 rounded-xl"
                        >
                          <FileText className="w-4 h-4 mr-1 text-primary" />
                          <span>Ver Ficha / Link</span>
                        </Button>

                        <Button 
                          size="sm"
                          onClick={() => handleCheckin(item)}
                          className={`font-bold text-xs h-12 rounded-xl gap-2 shadow-md transition-all ${
                            isClean 
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white font-black" 
                              : "bg-rose-950/80 hover:bg-rose-900/90 border border-rose-800/80 text-rose-300"
                          }`}
                        >
                          {isClean ? (
                            <>
                              <Unlock className="w-4 h-4 shrink-0" />
                              <span>Liberar Entrada</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                              <span className="truncate">🔒 Quarto em Limpeza</span>
                            </>
                          )}
                        </Button>
                      </div>
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
                          {item.isCheckoutToday ? (
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

                      {/* Notice */}
                      {item.receptionNotes && (
                        <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 text-xs flex items-start gap-2">
                          <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span className="font-medium">{item.receptionNotes}</span>
                        </div>
                      )}

                      {/* Checkout Button 1 Click */}
                      <Button 
                        size="sm"
                        onClick={() => handleCheckout(item)}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs h-11 rounded-xl gap-2 shadow-md"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Fazer Check-out (Desocupar Quarto)</span>
                      </Button>
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

          {selectedItem && (
            <div className="py-3 space-y-4 text-xs">
              {/* Photos Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 block text-[10px] uppercase">Selfie do Hóspede</span>
                    {selectedItem.guestPhoto && (
                      <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                      </span>
                    )}
                  </div>
                  <div 
                    onClick={() => {
                      if (selectedItem.guestPhoto) {
                        setZoomedPhoto({ 
                          url: selectedItem.guestPhoto, 
                          title: `Selfie do Hóspede - ${selectedItem.guestName} (Apt ${selectedItem.flatNumber})` 
                        })
                      }
                    }}
                    className={`h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                      selectedItem.guestPhoto ? "cursor-pointer hover:border-primary/60 transition-all" : ""
                    }`}
                  >
                    {selectedItem.guestPhoto ? (
                      <>
                        <img src={selectedItem.guestPhoto} alt="Selfie" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
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
                    {selectedItem.docPhoto && (
                      <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                      </span>
                    )}
                  </div>
                  <div 
                    onClick={() => {
                      if (selectedItem.docPhoto) {
                        setZoomedPhoto({ 
                          url: selectedItem.docPhoto, 
                          title: `Foto do Documento - ${selectedItem.guestName} (Apt ${selectedItem.flatNumber})` 
                        })
                      }
                    }}
                    className={`h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                      selectedItem.docPhoto ? "cursor-pointer hover:border-primary/60 transition-all" : ""
                    }`}
                  >
                    {selectedItem.docPhoto ? (
                      <>
                        <img src={selectedItem.docPhoto} alt="Documento" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
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

              {/* Data Grid */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Nome Completo</span>
                    <span className="font-bold text-white text-sm">{selectedItem.guestName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Telefone / WhatsApp</span>
                    {selectedItem.guestPhone ? (
                      <a
                        href={`https://wa.me/55${(selectedItem.guestPhone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá, ${selectedItem.guestName}! Falamos da recepção da CorpFlats referente à sua reserva no Flat ${selectedItem.flatNumber}.`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-emerald-400 hover:text-emerald-300 hover:underline"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{selectedItem.guestPhone}</span>
                      </a>
                    ) : (
                      <span className="font-semibold text-slate-400">Não informado</span>
                    )}
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

              {/* Status dos Hóspedes e Links de Check-in Digital */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                <span className="font-bold text-[10px] uppercase block text-slate-400">
                  Hóspedes Autorizados ({selectedItem.guests?.length || selectedItem.guestCount || 1})
                </span>
                <div className="space-y-1.5">
                  {(selectedItem.guests || [{ index: 1, name: selectedItem.guestName, hasCompletedCheckin: selectedItem.hasPreCheckin }]).map((g: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                      <div>
                        <div className="font-bold text-slate-200">{g.name || `Hóspede ${g.index || i + 1}`}</div>
                        <div className="text-[10px] text-slate-400">
                          {g.hasCompletedCheckin ? "✅ Check-in Digital Realizado" : "⏳ Pendente de Preenchimento"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const preCheckinUrl = `${window.location.origin}/pre-checkin/${selectedItem.code || selectedItem.id}?guest=${g.index || i + 1}`
                            navigator.clipboard.writeText(preCheckinUrl)
                            alert(`Link copiado para a área de transferência:\n${preCheckinUrl}`)
                          }}
                          className="h-7 text-[10px] px-2 bg-slate-800 border-slate-700 hover:bg-slate-700"
                        >
                          Copiar Link
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const preCheckinUrl = `${window.location.origin}/pre-checkin/${selectedItem.code || selectedItem.id}?guest=${g.index || i + 1}`
                            const phone = (g.phone || selectedItem.guestPhone || "").replace(/\D/g, "")
                            const msg = encodeURIComponent(
                              `Olá, ${g.name || 'Hóspede'}! 🏨\n\nPor favor, realize seu Check-in Digital para liberação da sua entrada no Apt ${selectedItem.flatNumber}:\n${preCheckinUrl}\n\nObrigado e boa estadia! ✨`
                            )
                            window.open(phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank")
                          }}
                          className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                          WhatsApp
                        </Button>
                      </div>
                    </div>
                  ))}
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
              {selectedItem.signatureUrl && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 block text-[10px] uppercase">Assinatura Digital do Hóspede</span>
                    <span className="text-[9px] text-primary font-semibold flex items-center gap-0.5">
                      <ZoomIn className="w-3 h-3" /> Toque p/ ampliar
                    </span>
                  </div>
                  <div 
                    onClick={() => {
                      if (selectedItem.signatureUrl) {
                        setZoomedPhoto({ 
                          url: selectedItem.signatureUrl, 
                          title: `Assinatura Digital - ${selectedItem.guestName} (Apt ${selectedItem.flatNumber})` 
                        })
                      }
                    }}
                    className="h-24 bg-white rounded-xl p-2 flex items-center justify-center border cursor-pointer hover:border-primary transition-all relative group shadow-inner"
                  >
                    <img src={selectedItem.signatureUrl} alt="Assinatura" className="max-h-full object-contain group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-slate-900 text-xs font-bold gap-1 transition-opacity rounded-xl">
                      <ZoomIn className="w-4 h-4" /> <span>Ampliar</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              onClick={() => {
                if (selectedItem) {
                  window.open(`/pre-checkin/${selectedItem.code || selectedItem.id}`, "_blank")
                }
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
            >
              Abrir Ficha Digital no Tablet
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
    </div>
  )
}
