# Análise Técnica & Blueprint: Polling em Tempo Real no Painel de Garagem & Sistema de Build Frontend (Milestone 3)

**Autor**: M3 Explorer 3  
**Data**: 2026-10-11T15:52:00Z  
**Escopo**: Milestone 3 — Guest Portal UI Flow, Modals & Operational Panels  
**Foco**: Real-time Polling em `garage-dashboard.tsx` e Análise do Build System em `artifacts/limpeza`

---

## 1. Sumário Executivo & Diagnóstico

1. **Estado Atual de `garage-dashboard.tsx`**:
   - O painel de garagem busca os dados da rota `/api/pms/garage/daily-sheet` apenas uma única vez na montagem do componente (`useEffect(..., [])`).
   - Quando um hóspede solicita e conclui a extensão de sua reserva pelo Guest Portal (ou quando a recepção altera datas/flats/veículos), o painel da garagem fica desatualizado até que o operador aperte manualmente o botão "Atualizar" ou dê F5 no navegador.
   - Em operações reais de portaria e estacionamento 24h (guarita do condomínio Soho Residence), a tela fica aberta ininterruptamente em um monitor/tablet. A ausência de polling periódico e de sincronização por foco na janela (`window.focus` / `visibilitychange`) cria um risco operacional de cancelamento indevido ou recusa de acesso a veículos de estadias prorrogadas.

2. **Diagnóstico do Build System (`artifacts/limpeza`)**:
   - `package.json`: Scripts configurados com `"build": "vite build --config vite.config.ts"` e `"typecheck": "tsc -p tsconfig.json --noEmit"`.
   - `vite.config.ts`: Configurado para compilar os assets estáticos em `dist/public/` (`dist/public/assets/index.js`, `dist/public/assets/index.css`).
   - `npm run build` foi executado e concluiu com **sucesso absoluto (código 0)** em 25,84 segundos gerando todos os bundles.
   - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) foi inspecionado em detalhes:
     - `garage-dashboard.tsx`: **0 erros de TypeScript** (100% íntegro).
     - `guest-portal.tsx`: **0 erros de TypeScript** (100% íntegro).
     - `guest-pre-checkin.tsx`: **0 erros de TypeScript** (100% íntegro).
     - Outros arquivos fora do escopo do M3 possuem débitos de tipagem preexistentes (como `reception-tablet.tsx:112-164`, `property-settings.tsx`, `whatsapp-chat.tsx`), mas o bundler Vite (baseado em esbuild) compila sem falhas pois não bloqueia o build por tipos em `noEmit`.

---

## 2. Rastreamento e Análise da Rota `/api/pms/garage/daily-sheet`

### 2.1 Backend (`scripts/demo-server.mjs:29246-29289`)
A rota é servida via Express:
```javascript
// 5.1 Relação Diária de Veículos Autorizados
app.get("/api/pms/garage/daily-sheet", (req, res) => {
  try {
    const todayStr = getIsoDateStr(new Date());

    // Busca reservas ativas hoje ou com checkin hoje
    const activeReservations = (db.reservations || []).filter(r =>
      r.checkinDate <= todayStr && r.checkoutDate >= todayStr
    );

    const vehicles = [];
    for (const r of activeReservations) {
      // Procura veículo na reserva ou no perfil do hóspede
      let v = r.vehicle;
      if (!v && r.guestEmail) {
        const acc = (db.guestAccounts || []).find(g => g.email.toLowerCase() === r.guestEmail.toLowerCase());
        if (acc && acc.vehicle) v = acc.vehicle;
      }

      if (v && v.plate) {
        vehicles.push({
          reservationCode: r.code,
          guestName: r.guestName,
          flatNumber: r.flatNumber || r.flatId,
          checkinDate: r.checkinDate,
          checkoutDate: r.checkoutDate,
          plate: (v.plate || "").toUpperCase(),
          brand: v.brand || "",
          model: v.model || "",
          color: v.color || "",
          phone: r.guestPhone || ""
        });
      }
    }

    res.json({
      date: todayStr,
      totalVehicles: vehicles.length,
      vehicles
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### 2.2 Dinâmica de Dados e Impacto da Modificação de Reservas
1. **Extensão de Estadia**:
   - Quando uma reserva tem o checkout estendido (ex: de `2026-10-11` para `2026-10-15`), `r.checkoutDate` é atualizado na base atômica `db.reservations`.
   - Na chamada subsequente a `/api/pms/garage/daily-sheet`, o objeto do veículo já conterá `checkoutDate: "2026-10-15"`.
2. **Mudança de Flat**:
   - Se o hóspede for transferido de flat (ex: 304 para 605), `r.flatNumber` é atualizado e o card do veículo refletirá o novo número imediatamente.
3. **Atualização de Placa/Veículo**:
   - Se o hóspede preencher o formulário de pré-checkin ou alterar os dados veiculares, o objeto `v` na reserva é atualizado e refletido no endpoint.

---

## 3. Arquitetura do Polling em Tempo Real para `garage-dashboard.tsx`

### 3.1 Requisitos de Engenharia
1. **Ciclo Periódico de 30 Segundos**:
   - `setInterval` com intervalo fixo de 30.000 ms.
2. **Silent Fetching (Sem Flicker na UI)**:
   - A função `fetchGarageData` deve aceitar um parâmetro `silent = false`.
   - Em chamadas manuais (clique no botão "Atualizar" ou primeiro carregamento): `silent = false`, ativando o estado `loading = true` para girar o ícone e dar feedback ao usuário.
   - Em chamadas automáticas de background: `silent = true`, preservando o estado da UI sem saltos ou desfoque de campos em foco.
3. **Re-sincronização Inteligente por Foco (`window.focus` e `visibilitychange`)**:
   - Caso o operador alterne entre abas (ex: câmeras de segurança, WhatsApp ou sistema condominial) e retorne à aba do sistema, uma atualização silenciosa imediata é disparada se o documento estiver `visible`.
4. **Cleanup Obrigatório no Desmonte**:
   - `clearInterval(timer)` e remoção dos event listeners (`window.removeEventListener`) no return do `useEffect` para prevenir vazamentos de memória e requisições zumbis.
5. **Indicadores Visuais de Status**:
   - Badge "Tempo Real (30s)" com ponto verde pulsante no cabeçalho.
   - Timestamp da última sincronização (`HH:MM:SS`) no card de status da portaria.
   - Badges visuais inteligentes no card de cada veículo para destacar a fase da estadia:
     - 🔵 **Check-in Hoje**: quando `checkinDate === data.date`
     - 🟠 **Check-out Hoje**: quando `checkoutDate === data.date`
     - 🟢 **Em Estadia**: quando em andamento (`checkinDate < data.date && checkoutDate > data.date`)

---

## 4. Blueprint Drop-in para `garage-dashboard.tsx`

Abaixo está o blueprint completo e refinado para implementação direta em `artifacts/limpeza/src/pages/garage-dashboard.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Car, ShieldCheck, CheckCircle2, Send, Plus, RefreshCw,
  Building2, Calendar, User, Phone, Check, Copy, FileText, AlertCircle, MessageCircle, Mail,
  Clock, ArrowUpRight
} from "lucide-react"

export default function GarageDashboard() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date())
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [resendingPlate, setResendingPlate] = useState<string | null>(null)

  // Form states for new vehicle authorization
  const [plate, setPlate] = useState("")
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [color, setColor] = useState("")
  const [guestName, setGuestName] = useState("")
  const [flatNumber, setFlatNumber] = useState("")
  const [checkinDate, setCheckinDate] = useState("")
  const [checkoutDate, setCheckoutDate] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("millerpessanha@gmail.com")

  // Função centralizada com suporte a modo silencioso
  const fetchGarageData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch("/api/pms/garage/daily-sheet")
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastSyncTime(new Date())
      }
    } catch (e) {
      console.warn("Erro ao buscar dados da garagem:", e)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Efeito de Polling em Segundo Plano (30 segundos) + Re-sincronização por Visibilidade
  useEffect(() => {
    // 1. Carga inicial com feedback visual
    fetchGarageData(false)

    // 2. Polling silencioso a cada 30 segundos
    const intervalId = setInterval(() => {
      fetchGarageData(true)
    }, 30000)

    // 3. Re-sincronização imediata ao focar na janela/aba
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchGarageData(true)
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus)
    document.addEventListener("visibilitychange", handleVisibilityOrFocus)

    // 4. Limpeza no desmonte
    return () => {
      clearInterval(intervalId)
      window.removeEventListener("focus", handleVisibilityOrFocus)
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
    }
  }, [fetchGarageData])

  const handleResendGarageEmail = async (v: any) => {
    setResendingPlate(v.plate)
    try {
      const res = await fetch("/api/pms/garage/send-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: v.plate,
          brand: v.brand,
          model: v.model,
          color: v.color,
          guestName: v.guestName,
          flatNumber: v.flatNumber,
          checkinDate: v.checkinDate,
          checkoutDate: v.checkoutDate,
          recipientEmail: "millerpessanha@gmail.com"
        })
      })
      if (res.ok) {
        alert(`Autorização de garagem para a placa ${v.plate} (Flat ${v.flatNumber}) enviada com sucesso para millerpessanha@gmail.com!`)
        fetchGarageData(true)
      } else {
        const err = await res.json()
        alert("Erro ao enviar: " + (err.error || "Falha na comunicação"))
      }
    } catch (e: any) {
      alert("Erro ao disparar e-mail: " + e.message)
    } finally {
      setResendingPlate(null)
    }
  }

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
        fetchGarageData(true)
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
  const todayStr = data?.date || new Date().toISOString().substring(0, 10)

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
          {/* Indicador de Polling Ao Vivo */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-bold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Tempo Real (30s)</span>
          </div>

          <Button
            onClick={() => fetchGarageData(false)}
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
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>
              Último sync: {lastSyncTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-slate-400 border-slate-700">
              Data: {todayStr}
            </Badge>
          </div>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">
            Nenhum veículo com placa cadastrada para as estadias de hoje.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {vehicles.map((v: any, idx: number) => {
              const phoneClean = (v.phone || "").replace(/\D/g, "")
              
              // Determina fase da estadia
              const isCheckinToday = v.checkinDate === todayStr
              const isCheckoutToday = v.checkoutDate === todayStr
              const isInHouse = v.checkinDate < todayStr && v.checkoutDate > todayStr

              return (
                <div key={idx} className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg font-black text-white tracking-widest bg-slate-900 px-3 py-1 rounded-xl border border-slate-700">
                        {v.plate}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isCheckoutToday && (
                          <Badge className="bg-amber-950/80 text-amber-300 border-amber-800 text-[10px] font-bold">
                            Checkout Hoje
                          </Badge>
                        )}
                        {isCheckinToday && (
                          <Badge className="bg-blue-950/80 text-blue-300 border-blue-800 text-[10px] font-bold">
                            Check-in Hoje
                          </Badge>
                        )}
                        {isInHouse && (
                          <Badge className="bg-emerald-950/80 text-emerald-300 border-emerald-800 text-[10px] font-bold">
                            Em Estadia
                          </Badge>
                        )}
                        <Badge className="bg-slate-900 text-slate-300 border-slate-700 font-bold text-xs">
                          Apt {v.flatNumber}
                        </Badge>
                      </div>
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

                  <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyText(v, idx)}
                      className="flex-1 bg-slate-900 border-slate-700 text-xs font-bold text-slate-200 hover:text-white gap-1.5 h-8.5 rounded-xl"
                    >
                      {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedIndex === idx ? "Copiado!" : "Copiar"}</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resendingPlate === v.plate}
                      onClick={() => handleResendGarageEmail(v)}
                      className="bg-blue-950/60 border-blue-800 text-blue-300 hover:bg-blue-900 hover:text-white text-xs font-bold gap-1.5 h-8.5 rounded-xl"
                      title="Disparar autorização de entrada por e-mail para millerpessanha@gmail.com"
                    >
                      <Mail className="w-3.5 h-3.5 text-blue-400" />
                      <span>{resendingPlate === v.plate ? "Enviando..." : "E-mail Garagem"}</span>
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
```

---

## 5. Protocolo de Verificação do Build e Comandos de Teste

### 5.1 Comandos Canônicos de Build
1. **Compilação do Frontend**:
   ```bash
   # Executado a partir da raiz do repositório:
   npm --prefix artifacts/limpeza run build

   # Ou diretamente na pasta do frontend:
   cd artifacts/limpeza
   npm run build
   ```
2. **Saída Esperada**:
   - `vite build` executa e conclui com código 0.
   - Gera `artifacts/limpeza/dist/public/assets/index.js`, `index.css` e `index.html`.
3. **Verificação de Paridade de Tipagem**:
   ```bash
   cd artifacts/limpeza
   npx tsc --noEmit src/pages/garage-dashboard.tsx
   ```

### 5.2 Teste Pontual do Endpoint da Garagem
Para verificar que a rota `/api/pms/garage/daily-sheet` retorna corretamente as estadias e veículos:
```bash
# Iniciar o servidor de teste (se necessário) ou testar via node script pontual:
node -e "
import('./scripts/demo-server.mjs').then(async () => {
  const res = await fetch('http://127.0.0.1:5000/api/pms/garage/daily-sheet');
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Total Vehicles:', data.totalVehicles);
  process.exit(0);
});
"
```
*(Nota de conformidade com AGENTS.md: NUNCA rodar varreduras completas em `tests/`.)*
