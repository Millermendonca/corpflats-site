import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Sparkles, CheckCircle2, AlertCircle, Building, History, Clock } from "lucide-react"

interface RecentCheckout {
  flatNumber: string
  time: string
}

export default function ReceptionCheckout() {
  const [flatNumber, setFlatNumber] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)
  const [recentList, setRecentList] = useState<RecentCheckout[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")
    const cleanNumber = flatNumber.replace(/\D/g, "").trim()

    if (!cleanNumber) {
      setErrorMsg("Digite o número do apartamento.")
      inputRef.current?.focus()
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
        setErrorMsg(data.error || "Erro ao registrar check-out.")
      } else {
        const flatRegistered = data.flatNumber || cleanNumber
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        
        setLastSuccess(`Check-out do Apartamento ${flatRegistered} registrado com sucesso!`)
        setRecentList(prev => [{ flatNumber: flatRegistered, time: timeNow }, ...prev.slice(0, 7)])
        
        // Limpa o campo e foca imediatamente para o próximo
        setFlatNumber("")
        setTimeout(() => {
          inputRef.current?.focus()
        }, 50)
      }
    } catch (err) {
      setErrorMsg("Erro de conexão com o servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-4">
        <Card className="border-slate-800 shadow-2xl rounded-3xl overflow-hidden bg-slate-950 text-slate-100 border">
          <CardHeader className="text-center pb-4 pt-6 bg-slate-900/60 border-b border-slate-800/80">
            <div className="mx-auto w-12 h-12 bg-primary/20 text-primary rounded-2xl flex items-center justify-center mb-2 shadow-xs">
              <Building className="w-6 h-6" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              Recepção • Baixa de Check-out
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Digite o número do apartamento e pressione <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-[10px]">Enter</kbd> para liberar a limpeza imediatamente.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-5">
            {lastSuccess && (
              <div className="p-4 bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-200">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <span className="font-bold text-sm sm:text-base">{lastSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recFlatNum" className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Número do Flat
                </Label>
                <Input
                  ref={inputRef}
                  id="recFlatNum"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={flatNumber}
                  onChange={(e) => setFlatNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ex: 509"
                  className="h-16 text-center text-3xl font-black tracking-wider rounded-2xl bg-slate-900 border-slate-700 text-white focus-visible:ring-primary shadow-inner"
                  autoFocus
                  required
                />
              </div>

              {errorMsg && (
                <div className="text-xs text-rose-300 bg-rose-950/80 p-3 rounded-xl border border-rose-700/60 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Button 
                type="submit" 
                disabled={loading || !flatNumber.trim()} 
                className="w-full h-12 text-sm font-bold rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all"
              >
                {loading ? "Registrando..." : "Registrar Saída (Enter ↵)"}
              </Button>
            </form>

            {/* Recent Checkouts History */}
            {recentList.length > 0 && (
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <History className="w-3.5 h-3.5" />
                  <span>Últimos Check-outs Registrados Agora:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentList.map((item, idx) => (
                    <Badge key={idx} variant="outline" className="bg-slate-900 border-slate-700 text-slate-300 py-1 px-2.5 text-xs flex items-center gap-1.5 font-semibold">
                      <span className="text-emerald-400 font-bold">Apt {item.flatNumber}</span>
                      <span className="text-slate-500 font-mono text-[10px] flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {item.time}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-[11px] text-slate-500">
          Link da Recepção • Guest Flow Manager
        </div>
      </div>
    </div>
  )
}
