import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { User, Phone, ShieldCheck, Check, Sparkles, Car, Building2, AlertCircle } from "lucide-react"
import { updateAccountProfile, saveSessionLocally, UserProfile } from "@/lib/auth-client"
import { useToast } from "@/hooks/use-toast"

export function maskPhone(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

export function maskCpf(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

interface CompleteProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserProfile | null
  onSuccess: (user: UserProfile) => void
}

export function CompleteProfileModal({ open, onOpenChange, user, onSuccess }: CompleteProfileModalProps) {
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [document, setDocument] = useState("")
  const [hasVehicle, setHasVehicle] = useState(false)
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [isWorkTrip, setIsWorkTrip] = useState(false)
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (user) {
      setName(user.name || "")
      setPhone(maskPhone(user.phone || ""))
      setDocument(maskCpf(user.document || ""))
      if (user.vehicle?.plate) {
        setHasVehicle(true)
        setVehiclePlate(user.vehicle.plate)
        setVehicleModel(user.vehicle.model || "")
      }
      if (user.companyData?.cnpj) {
        setIsWorkTrip(true)
        setCompanyCnpj(user.companyData.cnpj)
        setCompanyName(user.companyData.companyName || "")
      }
    }
  }, [user, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")

    const cleanPhone = phone.replace(/\D/g, "")
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg("Por favor, insira um número de WhatsApp/Celular válido com DDD.")
      return
    }

    const cleanDoc = document.replace(/\D/g, "")
    if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length < 5)) {
      setErrorMsg("Por favor, insira o número do CPF ou documento válido.")
      return
    }

    setLoading(true)
    try {
      const payload: any = {
        name: name.trim() || user?.name,
        phone: phone.trim(),
        document: document.trim(),
        vehicle: hasVehicle && vehiclePlate ? { plate: vehiclePlate.toUpperCase().trim(), model: vehicleModel.trim() } : null,
        companyData: isWorkTrip && companyCnpj ? { cnpj: companyCnpj.trim(), companyName: companyName.trim() } : null
      }

      const res = await updateAccountProfile(payload)
      if (res.success && res.user) {
        saveSessionLocally(res.user)
        toast({
          title: "Cadastro Concluído! 🎉",
          description: "Seus dados foram salvos com segurança na CorpFlats."
        })
        onSuccess(res.user)
        onOpenChange(false)
      } else {
        setErrorMsg(res.error || "Erro ao salvar dados do perfil.")
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro de comunicação com o servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4">
        <DialogHeader className="text-left space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 flex items-center justify-center text-sky-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-slate-100">
              Complete seu Cadastro
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {user?.email ? (
              <span>
                Você se conectou via Google como <strong className="text-slate-800 dark:text-slate-200">{user.email}</strong>. Confirme seu WhatsApp e CPF para liberar o voucher de reserva e acesso à portaria 24h.
              </span>
            ) : (
              "Preencha seus dados de contato e documento para concluir seu cadastro e liberar suas reservas."
            )}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Nome Completo *</span>
                {user?.googleSub && (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50/50">
                    ✓ Google
                  </Badge>
                )}
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Miller Mendonça"
                className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                WhatsApp / Celular com DDD *
              </Label>
              <Input
                value={phone}
                onChange={e => setPhone(maskPhone(e.target.value))}
                placeholder="(22) 99999-9999"
                className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100"
                autoFocus
                required
              />
              <p className="text-[10px] text-slate-400">Para envio do voucher e código da fechadura.</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                CPF ou Passaporte *
              </Label>
              <Input
                value={document}
                onChange={e => setDocument(maskCpf(e.target.value))}
                placeholder="000.000.000-00"
                className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono"
                required
              />
              <p className="text-[10px] text-slate-400">Exigido para liberação de portaria 24h e nota.</p>
            </div>
          </div>

          {/* Seção Veículo & Garagem */}
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-sky-600" />
                <span>Vai utilizar a Garagem Coberta? (Inclusa Grátis)</span>
              </span>
              <input
                type="checkbox"
                checked={hasVehicle}
                onChange={e => setHasVehicle(e.target.checked)}
                className="rounded text-sky-600"
              />
            </div>

            {hasVehicle && (
              <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in">
                <Input
                  value={vehiclePlate}
                  onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="Placa do Carro"
                  className="text-xs h-8 rounded-xl uppercase font-mono"
                />
                <Input
                  value={vehicleModel}
                  onChange={e => setVehicleModel(e.target.value)}
                  placeholder="Modelo (Ex: Corolla)"
                  className="text-xs h-8 rounded-xl"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-xs font-medium text-slate-500 rounded-xl order-2 sm:order-1"
            >
              Completar depois
            </Button>

            <Button
              type="submit"
              disabled={loading}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-10 px-6 rounded-xl shadow-md gap-1.5 order-1 sm:order-2"
            >
              {loading ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvar e Concluir Cadastro</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
