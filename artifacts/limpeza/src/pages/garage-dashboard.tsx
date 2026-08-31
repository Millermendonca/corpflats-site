import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Car, ShieldCheck, CheckCircle2, Send, Plus, RefreshCw,
  Building2, Calendar, User, Phone, Check, Copy, FileText, AlertCircle, MessageCircle
} from "lucide-react"

export default function GarageDashboard() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Form states for new vehicle authorization
  const [plate, setPlate] = useState("")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [color, setColor] = useState("")
  const [guestName, setGuestName] = useState("")
  const [flatNumber, setFlatNumber] = useState("")
  const [checkinDate, setCheckinDate] = useState("")
  const [checkoutDate, setCheckoutDate] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("portaria.soho@corpflats.com.br")

  const fetchGarageData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pms/garage/daily-sheet")
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.warn("Erro ao buscar dados da garagem:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGarageData()
  }, [])

  const handleSendAuthorization = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plate.trim() || !flatNumber.trim()) return

    setSending(true)
    try {
      const res = await fetch("/api/pms/garage/send-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate,
          brand,
          model,
          color,
          guestName,
          flatNumber,
          checkinDate,
          checkoutDate,
          recipientEmail
        })
      })
      if (res.ok) {
        setAuthModalOpen(false)
        setPlate("")
        setModel("")
        setBrand("")
        setColor("")
        setGuestName("")
        setFlatNumber("")
        fetchGarageData()
        alert("Autorização de garagem gerada e registrada com sucesso!")
      }
    } finally {
      setSending(false)
    }
  }

  const handleCopyText = (v: any, idx: number) => {
    const text = `*AUTORIZAÇÃO DE GARAGEM - CORPFLATS / SOHO RESIDENCE*\n` +
      `Apartamento: ${v.flatNumber}\n` +
      `Hóspede: ${v.guestName}\n` +
      `Veículo: ${v.brand} ${v.model} (${v.color || 'Cor Padrão'})\n` +
      `Placa: ${v.plate}\n` +
      `Período de Estadia: ${v.checkinDate} até ${v.checkoutDate}\n` +
      `Portaria autorizada a liberar vaga rotativa na garagem.`;
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2500)
  }

  const vehicles = data?.vehicles || []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans space-y-6">
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs font-bold mb-2">
            <Car className="w-4 h-4 text-blue-400" />
            <span>Estacionamento & Garagem • Soho Residence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Gestão de Veículos e Autorização de Garagem CORPFLATS
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Controle de placas de veículos autorizados na garagem e envio automático de autorizações para a portaria.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={fetchGarageData}
            variant="outline"
            className="bg-slate-900 border-slate-700 text-slate-200 hover:text-white text-xs font-bold gap-2 rounded-xl h-10"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          <Button
            onClick={() => setAuthModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black gap-2 rounded-xl h-10 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Autorização de Garagem</span>
          </Button>
        </div>
      </header>

      {/* ── Top Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Veículos Autorizados Hoje</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-white font-mono">{vehicles.length}</span>
            <span className="text-xs text-blue-400 font-bold">carros registrados</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Vagas rotativas ativas na garagem</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Status da Portaria</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-xl font-black text-emerald-400">Sincronizado 24h</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Tablet da portaria atualizado</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Regras de Vaga</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-lg font-black text-white">1 Vaga por Flat</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Sistema rotativo gratuito</span>
        </Card>
      </div>

      {/* ── Tabela de Veículos Autorizados ──────────────────────────────── */}
      <Card className="bg-slate-900 border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-black text-white">Relação de Veículos Autorizados ({vehicles.length})</h2>
          </div>
          <Badge variant="outline" className="text-xs text-slate-400 border-slate-700">
            Data: {data?.date || "Hoje"}
          </Badge>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">
            Nenhum veículo com placa cadastrada para as estadias de hoje.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {vehicles.map((v: any, idx: number) => {
              const phoneClean = (v.phone || "").replace(/\D/g, "")
              return (
                <div key={idx} className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg font-black text-white tracking-widest bg-slate-900 px-3 py-1 rounded-xl border border-slate-700">
                        {v.plate}
                      </span>
                      <Badge className="bg-blue-950 text-blue-300 border-blue-800 font-bold text-xs">
                        Apt {v.flatNumber}
                      </Badge>
                    </div>

                    <span className="font-bold text-sm text-slate-200 block">
                      {v.brand} {v.model} {v.color ? `• ${v.color}` : ''}
                    </span>

                    <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-900">
                      <p><strong className="text-slate-300">Hóspede:</strong> {v.guestName}</p>
                      <p><strong className="text-slate-300">Estadia:</strong> {v.checkinDate} a {v.checkoutDate}</p>
                      
                      {v.phone && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-300 font-medium truncate">
                            <strong className="text-slate-400">Tel:</strong> {v.phone}
                          </span>
                          <a
                            href={`https://wa.me/55${phoneClean}?text=${encodeURIComponent(`Olá, ${v.guestName}! Tudo bem? Falamos da CorpFlats sobre a vaga de garagem do seu veículo ${v.plate} para o Apt ${v.flatNumber}.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-[11px] font-bold transition-colors shrink-0 ml-2"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-900 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyText(v, idx)}
                      className="flex-1 bg-slate-900 border-slate-700 text-xs font-bold text-slate-200 hover:text-white gap-1.5 h-8.5 rounded-xl"
                    >
                      {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedIndex === idx ? "Copiado!" : "Copiar Texto"}</span>
                    </Button>

                    {v.phone && (
                      <a
                        href={`https://wa.me/55${phoneClean}?text=${encodeURIComponent(`Olá, ${v.guestName}! Tudo bem? Falamos da CorpFlats sobre a vaga de garagem do seu veículo ${v.plate} para o Apt ${v.flatNumber}.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold h-8.5 transition-colors shadow-sm"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Chamar</span>
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Modal: Nova Autorização de Garagem ───────────────────────────── */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-800 text-white">
          <form onSubmit={handleSendAuthorization}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Car className="w-5 h-5 text-blue-400" />
                Emitir Autorização de Garagem
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Gere a liberação formal de vaga de garagem para a portaria do Soho.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 font-bold">Placa do Veículo *</Label>
                  <Input 
                    value={plate} 
                    onChange={e => setPlate(e.target.value.toUpperCase())} 
                    required 
                    placeholder="ABC1D23" 
                    className="bg-slate-950 border-slate-700 text-xs font-mono font-bold uppercase" 
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-slate-300 font-bold">Número do Flat *</Label>
                  <Input 
                    value={flatNumber} 
                    onChange={e => setFlatNumber(e.target.value)} 
                    required 
                    placeholder="Ex: 1017, 304" 
                    className="bg-slate-950 border-slate-700 text-xs font-bold" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-300">Marca</Label>
                  <Input 
                    value={brand} 
                    onChange={e => setBrand(e.target.value)} 
                    placeholder="Toyota" 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Modelo</Label>
                  <Input 
                    value={model} 
                    onChange={e => setModel(e.target.value)} 
                    placeholder="Corolla" 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Cor</Label>
                  <Input 
                    value={color} 
                    onChange={e => setColor(e.target.value)} 
                    placeholder="Prata" 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Nome do Hóspede / Motorista</Label>
                <Input 
                  value={guestName} 
                  onChange={e => setGuestName(e.target.value)} 
                  placeholder="Nome do Titular" 
                  className="bg-slate-950 border-slate-700 text-xs" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300">Data Check-in</Label>
                  <Input 
                    type="date"
                    value={checkinDate} 
                    onChange={e => setCheckinDate(e.target.value)} 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-slate-300">Data Check-out</Label>
                  <Input 
                    type="date"
                    value={checkoutDate} 
                    onChange={e => setCheckoutDate(e.target.value)} 
                    className="bg-slate-950 border-slate-700 text-xs" 
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAuthModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={sending} className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs gap-1.5">
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? "Emitindo..." : "Emitir Autorização"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
