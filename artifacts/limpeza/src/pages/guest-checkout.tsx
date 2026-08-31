import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sparkles, CheckCircle2, KeyRound, Heart, AlertCircle, ArrowLeft } from "lucide-react"

export default function GuestCheckout() {
  const [flatNumber, setFlatNumber] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [submittedFlat, setSubmittedFlat] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
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
        setSubmittedFlat(data.flatNumber || cleanNumber)
      }
    } catch (err) {
      setErrorMsg("Erro de conexão. Por favor, tente novamente ou avise a recepção.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 sm:p-6">
      <div className="w-full max-w-md">
        {submittedFlat ? (
          /* Success Screen */
          <Card className="border-emerald-200/80 dark:border-emerald-900 shadow-xl rounded-3xl overflow-hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs animate-in fade-in zoom-in duration-300">
            <div className="bg-emerald-600 p-6 text-white text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-lg mb-3">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">Check-out Confirmado!</h2>
              <p className="text-emerald-100 text-sm mt-1 font-medium">Apartamento {submittedFlat}</p>
            </div>

            <CardContent className="p-6 text-center space-y-5">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 rounded-2xl flex items-start gap-3 text-left">
                <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                  Por favor, <strong>devolva o cartão de acesso</strong> na recepção ao sair.
                </div>
              </div>

              <div className="py-2 space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-primary font-bold text-base">
                  <Heart className="w-5 h-5 fill-primary text-primary" />
                  <span>Muito obrigado pela estadia!</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Agradecemos a sua preferência e esperamos ter o privilégio de recebê-lo novamente em breve! ✨
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Checkout Form */
          <Card className="border-border/80 shadow-2xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
            <CardHeader className="text-center pb-4 pt-8 bg-slate-50/50 dark:bg-slate-800/30 border-b">
              <div className="mx-auto w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-3 shadow-2xs">
                <Sparkles className="w-7 h-7" />
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Auto Check-out
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Informe o número do seu flat para registrar a sua saída com rapidez e praticidade.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
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
          Guest Flow Manager • Hotel & Governança
        </div>
      </div>
    </div>
  )
}
