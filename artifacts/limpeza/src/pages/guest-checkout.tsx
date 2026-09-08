import { useState, useEffect } from "react"
import { useRoute, useLocation } from "wouter"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Sparkles, CheckCircle2, KeyRound, Heart, AlertCircle, 
  ArrowLeft, Clock, Building2, Check, ExternalLink, Loader2,
  Lightbulb, ShieldCheck, DoorOpen
} from "lucide-react"

interface ReservationContext {
  id: string | number
  code: string
  guestName: string
  firstName: string
  flatNumber: string
  checkinDate?: string
  checkoutDate?: string
  checkoutTime?: string
  isAlreadyCheckedOut?: boolean
}

export default function GuestCheckout() {
  const [, setLocation] = useLocation()

  // Rotas personalizadas suportadas
  const [, paramsCheckout] = useRoute("/checkout/:code")
  const [, paramsCheckOut] = useRoute("/check-out/:code")
  const [, paramsSaida] = useRoute("/saida/:code")
  const [, paramsMinhaReserva] = useRoute("/minha-reserva/:code/checkout")
  const [, paramsMinhaReservaSaida] = useRoute("/minha-reserva/:code/saida")
  const [, paramsPortal] = useRoute("/portal-hospede/:code/checkout")
  const [, paramsGuestPortal] = useRoute("/guest-portal/:code/checkout")

  // Obter código inicial da URL (path param ou query param)
  const getInitialCode = () => {
    if (paramsCheckout?.code) return paramsCheckout.code
    if (paramsCheckOut?.code) return paramsCheckOut.code
    if (paramsSaida?.code) return paramsSaida.code
    if (paramsMinhaReserva?.code) return paramsMinhaReserva.code
    if (paramsMinhaReservaSaida?.code) return paramsMinhaReservaSaida.code
    if (paramsPortal?.code) return paramsPortal.code
    if (paramsGuestPortal?.code) return paramsGuestPortal.code
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("code") || sp.get("res") || sp.get("reserva") || sp.get("r") || ""
    }
    return ""
  }

  const rawCode = getInitialCode()
  const [code] = useState(rawCode)

  // Estados do contexto personalizado
  const [loadingContext, setLoadingContext] = useState(Boolean(rawCode))
  const [resContext, setResContext] = useState<ReservationContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)

  // Estados de submissão
  const [flatNumber, setFlatNumber] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [submittedData, setSubmittedData] = useState<{ flatNumber: string; guestName?: string } | null>(null)

  // Branding & Configurações
  const [hotelName, setHotelName] = useState("CorpFlats")

  useEffect(() => {
    fetch("/api/site-content")
      .then(r => r.json())
      .then(d => {
        if (d?.branding?.brandName) setHotelName(d.branding.brandName)
      })
      .catch(() => {})
  }, [])

  // Carregar contexto da reserva quando houver código
  useEffect(() => {
    if (!code) {
      setLoadingContext(false)
      return
    }

    let isMounted = true
    setLoadingContext(true)
    setContextError(null)

    fetch(`/api/public/checkout/context?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!isMounted) return
        if (res.ok && data?.reservation) {
          setResContext(data.reservation)
          if (data.reservation.isAlreadyCheckedOut) {
            setSubmittedData({
              flatNumber: data.reservation.flatNumber,
              guestName: data.reservation.guestName
            })
          }
        } else {
          setContextError(data?.error || "Reserva não localizada pelo link.")
        }
      })
      .catch(() => {
        if (isMounted) setContextError("Falha de conexão ao carregar dados da estadia.")
      })
      .finally(() => {
        if (isMounted) setLoadingContext(false)
      })

    return () => {
      isMounted = false
    }
  }, [code])

  // Submissão pelo Fluxo Personalizado (1 clique, zero formulário)
  const handlePersonalizedConfirm = async () => {
    if (!resContext && !code) return
    setLoading(true)
    setErrorMsg("")

    try {
      const res = await fetch("/api/public/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          code: resContext?.code || code,
          flatNumber: resContext?.flatNumber
        })
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Não foi possível registrar o check-out. Por favor, avise a recepção.")
      } else {
        setSubmittedData({
          flatNumber: data.flatNumber || resContext?.flatNumber || "Flat",
          guestName: data.guestName || resContext?.guestName
        })
      }
    } catch (err) {
      setErrorMsg("Erro de conexão. Por favor, tente novamente ou avise a recepção.")
    } finally {
      setLoading(false)
    }
  }

  // Submissão Manual de Fallback (apenas se acessado sem código)
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")
    const cleanNumber = flatNumber.replace(/\D/g, "").trim()

    if (!cleanNumber) {
      setErrorMsg("Por favor, digite o número do seu apartamento.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/public/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flatNumber: cleanNumber })
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Não foi possível registrar o check-out. Por favor, avise a recepção.")
      } else {
        setSubmittedData({
          flatNumber: data.flatNumber || cleanNumber,
          guestName: data.guestName
        })
      }
    } catch (err) {
      setErrorMsg("Erro de conexão. Por favor, tente novamente ou avise a recepção.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-md">

        {/* ── ESTADO 1: Carregando Contexto da Reserva ── */}
        {loadingContext ? (
          <Card className="border-border/80 shadow-2xl rounded-3xl overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs p-8 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                Localizando sua reserva...
              </h3>
              <p className="text-xs text-muted-foreground">
                Estamos preparando o seu check-out expresso personalizado.
              </p>
            </div>
          </Card>
        ) : submittedData ? (
          /* ── ESTADO 2: Check-out Confirmado (Sucesso com destaque do Cartão) ── */
          <Card className="border-emerald-200/80 dark:border-emerald-900 shadow-2xl rounded-3xl overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-6 text-white text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-white text-emerald-600 rounded-2xl flex items-center justify-center shadow-lg mb-3">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">Check-out Confirmado!</h2>
              <p className="text-emerald-100 text-sm mt-1 font-semibold">
                Flat {submittedData.flatNumber} {submittedData.guestName ? `• ${submittedData.guestName}` : ""}
              </p>
            </div>

            <CardContent className="p-6 text-center space-y-5">
              {/* Card de Alerta Máximo: Devolver o Cartão na Recepção */}
              <div className="p-4 sm:p-5 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl flex items-start gap-3.5 text-left shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-black text-amber-950 dark:text-amber-100">
                    Lembrete Importante de Saída
                  </div>
                  <p className="text-xs sm:text-sm text-amber-900/90 dark:text-amber-200 leading-relaxed font-medium">
                    Por favor, <strong>devolva o cartão de acesso na recepção</strong> ao sair do edifício.
                  </p>
                </div>
              </div>

              {/* Mensagem de Gratidão */}
              <div className="py-2 space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-primary font-bold text-base">
                  <Heart className="w-5 h-5 fill-primary text-primary" />
                  <span>Muito obrigado por sua estadia!</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Foi uma imensa satisfação receber você no {hotelName}. Esperamos ter a honra de recebê-lo novamente em breve! ✨
                </p>
              </div>

              {/* Botões de Ação Opcionais */}
              <div className="pt-2 flex flex-col gap-2">
                {resContext?.code && (
                  <Button
                    variant="outline"
                    onClick={() => setLocation(`/minha-reserva/${resContext.code}`)}
                    className="w-full h-11 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    Acessar Portal da Minha Reserva
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : resContext ? (
          /* ── ESTADO 3: Fluxo Personalizado (Zero Formulário, Confirmação Direta) ── */
          <Card className="border-border/80 shadow-2xl rounded-3xl overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs animate-in fade-in duration-300">
            {/* Cabeçalho */}
            <CardHeader className="text-center pb-4 pt-7 bg-slate-50/60 dark:bg-slate-800/40 border-b">
              <div className="mx-auto w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-2.5 shadow-2xs">
                <DoorOpen className="w-7 h-7" />
              </div>
              <div className="inline-flex items-center gap-1 mx-auto text-[11px] font-extrabold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Check-out Expresso</span>
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Olá, {resContext.firstName || resContext.guestName}! 👋
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Esperamos que sua hospedagem no <strong>{hotelName}</strong> tenha sido excelente!
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-7 space-y-5">
              {/* Detalhes da Acomodação (já preenchidos e confirmados) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Sua Acomodação
                  </span>
                  <span className="text-xl font-black text-slate-900 dark:text-slate-100">
                    Flat {resContext.flatNumber}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Horário Limite
                  </span>
                  <Badge variant="outline" className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 font-bold text-xs">
                    <Clock className="w-3 h-3 mr-1 text-primary" />
                    Até às {resContext.checkoutTime || "12:00"}
                  </Badge>
                </div>
              </div>

              {/* Card de Destaque: Devolução do Cartão na Recepção */}
              <div className="p-4 sm:p-4.5 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-start gap-3.5 text-left shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                    <span>Lembrete Importante na Saída</span>
                  </div>
                  <p className="text-xs text-amber-900/90 dark:text-amber-200 leading-relaxed font-medium">
                    Por favor, <strong>não se esqueça de devolver o cartão de acesso na recepção</strong> ao sair do edifício.
                  </p>
                </div>
              </div>

              {/* Recomendações Rápidas de Saída */}
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-800/30 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 font-medium">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Apagar luzes e desligar o ar-condicionado.</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Verificar se não esqueceu carregadores ou pertences.</span>
                </div>
              </div>

              {errorMsg && (
                <div className="text-xs text-destructive bg-destructive/10 p-3.5 rounded-xl border border-destructive/20 flex items-center gap-2.5 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Botão de Confirmação em 1 Clique */}
              <Button 
                type="button" 
                onClick={handlePersonalizedConfirm}
                disabled={loading} 
                className="w-full h-14 text-base font-black rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Registrando saída...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirmar que estou saindo</span>
                  </>
                )}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                Ao confirmar, seu quarto é liberado para higienização pela governança.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* ── ESTADO 4: Fallback Manual (Acessado sem código ou reserva não encontrada) ── */
          <Card className="border-border/80 shadow-2xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
            <CardHeader className="text-center pb-4 pt-8 bg-slate-50/50 dark:bg-slate-800/30 border-b">
              <div className="mx-auto w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-3 shadow-2xs">
                <Sparkles className="w-7 h-7" />
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Check-out Expresso
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                {contextError 
                  ? "Não foi possível carregar a reserva automaticamente. Digite o número do seu flat para confirmar a saída."
                  : "Informe o número do seu flat para registrar a sua saída com rapidez e praticidade."}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleManualSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="flatNum" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Número do Apartamento
                  </Label>
                  <Input
                    id="flatNum"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={flatNumber}
                    onChange={(e) => setFlatNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ex: 509"
                    className="h-14 text-center text-2xl font-black tracking-wider rounded-2xl border-slate-300 dark:border-slate-700 focus-visible:ring-primary shadow-xs"
                    autoFocus
                    required
                  />
                  <p className="text-[11px] text-center text-muted-foreground">
                    Digite apenas os números (sem a palavra "Apto").
                  </p>
                </div>

                {/* Card de Aviso de Devolução do Cartão */}
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-left">
                  <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                    Lembre-se de <strong>devolver o cartão na recepção</strong> na saída.
                  </div>
                </div>

                {errorMsg && (
                  <div className="text-xs text-destructive bg-destructive/10 p-3.5 rounded-xl border border-destructive/20 flex items-center gap-2.5 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <Button 
                  type="submit" 
                  disabled={loading || !flatNumber.trim()} 
                  className="w-full h-12 text-sm font-bold rounded-2xl shadow-md transition-all hover:scale-[1.01]"
                >
                  {loading ? "Registrando saída..." : "Confirmar Check-out"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="text-center mt-6 text-[11px] text-muted-foreground">
          {hotelName} • Check-out Expresso Inteligente
        </div>
      </div>
    </div>
  )
}
