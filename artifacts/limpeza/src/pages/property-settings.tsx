import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { 
  useGetSettings, 
  useUpdateSettings, 
  useGetMe,
  getGetSettingsQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { 
  Building2, Home, Plus, Edit2, Trash2, Clock, Phone, MapPin, FileText, 
  Check, RefreshCw, Sparkles, ShieldCheck
} from "lucide-react"

import { AccessDenied } from "@/components/access-denied"

export default function PropertySettings() {
  const { data: user, isLoading: loadingUser } = useGetMe()
  const queryClient = useQueryClient()
  const { data: settings } = useGetSettings()

  const [saved, setSaved] = useState(false)

  // Flats CRUD states
  const [flatsList, setFlatsList] = useState<any[]>([])
  const [loadingFlats, setLoadingFlats] = useState(true)
  const [flatModalOpen, setFlatModalOpen] = useState(false)
  const [editingFlat, setEditingFlat] = useState<any | null>(null)
  const [flatNumberInput, setFlatNumberInput] = useState("")
  const [savingFlat, setSavingFlat] = useState(false)

  // Regras da Casa e Termos Contratuais
  const [houseRulesInput, setHouseRulesInput] = useState("")
  const [contractTermsInput, setContractTermsInput] = useState("")
  const [adminWhatsAppInput, setAdminWhatsAppInput] = useState("")
  const [checkinTimeInput, setCheckinTimeInput] = useState("14:00")
  const [checkoutTimeInput, setCheckoutTimeInput] = useState("12:00")
  const [hotelAddressInput, setHotelAddressInput] = useState("CorpFlats")
  const [googleMapsUrlInput, setGoogleMapsUrlInput] = useState("https://www.google.com/maps/search/?api=1&query=CorpFlats")
  const [savingTerms, setSavingTerms] = useState(false)
  const [termsSuccess, setTermsSuccess] = useState("")

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })
      }
    }
  })

  const fetchFlats = async () => {
    setLoadingFlats(true)
    try {
      const res = await fetch("/api/flats", { credentials: "include" })
      const data = await res.json()
      if (Array.isArray(data)) setFlatsList(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingFlats(false)
    }
  }

  useEffect(() => {
    fetchFlats()
  }, [])

  useEffect(() => {
    if (settings) {
      if (settings.houseRules) setHouseRulesInput(settings.houseRules)
      if (settings.contractTerms) setContractTermsInput(settings.contractTerms)
      if (settings.adminWhatsApp) setAdminWhatsAppInput(settings.adminWhatsApp)
      if (settings.checkinTime) setCheckinTimeInput(settings.checkinTime)
      if (settings.checkoutTime) setCheckoutTimeInput(settings.checkoutTime)
      if (settings.hotelAddress) setHotelAddressInput(settings.hotelAddress)
      if (settings.googleMapsUrl) setGoogleMapsUrlInput(settings.googleMapsUrl)
    }
  }, [settings])

  if (loadingUser) return null
  if (user?.role !== "admin") return <Shell><AccessDenied /></Shell>

  const handleSaveTerms = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingTerms(true)
    setTermsSuccess("")

    try {
      await updateSettings.mutateAsync({
        data: {
          houseRules: houseRulesInput,
          contractTerms: contractTermsInput,
          adminWhatsApp: adminWhatsAppInput,
          checkinTime: checkinTimeInput,
          checkoutTime: checkoutTimeInput,
          hotelAddress: hotelAddressInput,
          googleMapsUrl: googleMapsUrlInput
        }
      })
      setTermsSuccess("Políticas e regras da propriedade salvas com sucesso!")
      setTimeout(() => setTermsSuccess(""), 3000)
    } catch (err: any) {
      alert("Erro ao salvar regras: " + err.message)
    } finally {
      setSavingTerms(false)
    }
  }

  const handleSaveFlat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!flatNumberInput.trim()) return

    setSavingFlat(true)
    try {
      if (editingFlat) {
        await fetch(`/api/flats/${editingFlat.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: flatNumberInput.trim() }),
          credentials: "include"
        })
      } else {
        await fetch("/api/flats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number: flatNumberInput.trim() }),
          credentials: "include"
        })
      }
      setFlatModalOpen(false)
      setFlatNumberInput("")
      setEditingFlat(null)
      fetchFlats()
    } finally {
      setSavingFlat(false)
    }
  }

  const handleDeleteFlat = async (flatId: number) => {
    if (!confirm("Tem certeza que deseja remover este flat da propriedade?")) return
    try {
      await fetch(`/api/flats/${flatId}`, { method: "DELETE", credentials: "include" })
      fetchFlats()
    } catch (err: any) {
      alert("Erro ao remover flat: " + err.message)
    }
  }

  return (
    <Shell>
      <div className="space-y-6 pb-20 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground">Gestão da Propriedade & Regras</h1>
              <p className="text-xs text-muted-foreground">Flats, horários de check-in/out, regras da casa e termos contratuais</p>
            </div>
          </div>

          {termsSuccess && (
            <Badge className="bg-emerald-600 text-white text-xs py-1.5 px-3 gap-1.5 shadow-sm">
              <Check className="w-4 h-4" /> {termsSuccess}
            </Badge>
          )}
        </div>

        {/* ── CARD 1: CADASTRO E GESTÃO DE FLATS ── */}
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Home className="w-4 h-4 text-amber-500" />
                <span>Flats e Apartamentos ({flatsList.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">Unidades ativas gerenciadas pelo CorpFlats</CardDescription>
            </div>
            <Button 
              size="sm"
              onClick={() => {
                setEditingFlat(null)
                setFlatNumberInput("")
                setFlatModalOpen(true)
              }}
              className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Flat</span>
            </Button>
          </CardHeader>

          <CardContent className="p-5">
            {loadingFlats ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Carregando flats...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {flatsList.map(f => (
                  <div key={f.id} className="p-3 rounded-2xl bg-muted/40 border border-border/80 flex flex-col justify-between space-y-2 hover:border-border transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-base text-foreground">Apt {f.number}</span>
                      <Badge variant={f.isOccupied ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {f.isOccupied ? "Ocupado" : "Vago"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/50">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => {
                          setEditingFlat(f)
                          setFlatNumberInput(f.number)
                          setFlatModalOpen(true)
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => handleDeleteFlat(f.id)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── CARD 2: POLÍTICAS, HORÁRIOS E LOCALIZAÇÃO ── */}
        <form onSubmit={handleSaveTerms} className="space-y-6">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Horários, Políticas & Contato</span>
              </CardTitle>
              <CardDescription className="text-xs">Parâmetros operacionais e informativos fornecidos aos hóspedes</CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Horário Oficial de Check-in
                  </Label>
                  <Input 
                    value={checkinTimeInput}
                    onChange={e => setCheckinTimeInput(e.target.value)}
                    placeholder="14:00"
                    className="text-xs rounded-xl h-9.5"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Horário Limite de Check-out
                  </Label>
                  <Input 
                    value={checkoutTimeInput}
                    onChange={e => setCheckoutTimeInput(e.target.value)}
                    placeholder="12:00"
                    className="text-xs rounded-xl h-9.5"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" /> WhatsApp da Administração (com DDD)
                  </Label>
                  <Input 
                    value={adminWhatsAppInput}
                    onChange={e => setAdminWhatsAppInput(e.target.value)}
                    placeholder="22998505276"
                    className="text-xs rounded-xl h-9.5"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Nome / Endereço da Propriedade
                  </Label>
                  <Input 
                    value={hotelAddressInput}
                    onChange={e => setHotelAddressInput(e.target.value)}
                    placeholder="CorpFlats - Av. Pelinca, 100"
                    className="text-xs rounded-xl h-9.5"
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Link do Google Maps / Rota de Acesso
                  </Label>
                  <Input 
                    value={googleMapsUrlInput}
                    onChange={e => setGoogleMapsUrlInput(e.target.value)}
                    placeholder="https://maps.google.com/?q=..."
                    className="text-xs rounded-xl h-9.5 font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── CARD 3: REGRAS DA CASA E TERMOS CONTRATUAIS ── */}
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Regras da Casa & Termos de Locação</span>
              </CardTitle>
              <CardDescription className="text-xs">Textos exibidos no Pré-Check-in e assinados digitalmente pelos hóspedes</CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold">Regras da Casa (Regimento Interno do Imóvel)</Label>
                <Textarea 
                  value={houseRulesInput}
                  onChange={e => setHouseRulesInput(e.target.value)}
                  rows={6}
                  placeholder="1. Proibido fumar no interior do flat...\n2. Silêncio após às 22h..."
                  className="text-xs font-mono rounded-2xl p-3.5 leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Termos e Condições Contratuais de Locação por Temporada</Label>
                <Textarea 
                  value={contractTermsInput}
                  onChange={e => setContractTermsInput(e.target.value)}
                  rows={8}
                  placeholder="CLÁUSULA PRIMEIRA - DO OBJETO...\nCLÁUSULA SEGUNDA - DA RESPONSABILIDADE..."
                  className="text-xs font-mono rounded-2xl p-3.5 leading-relaxed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  type="submit"
                  disabled={savingTerms}
                  className="h-11 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs gap-2 shadow-md"
                >
                  {savingTerms ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Salvar Regras e Políticas da Propriedade</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Modal Adicionar/Editar Flat */}
        <Dialog open={flatModalOpen} onOpenChange={setFlatModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black">{editingFlat ? "Editar Flat" : "Novo Flat"}</DialogTitle>
              <DialogDescription className="text-xs">Número da unidade para gestão de limpeza e reservas</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveFlat} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Número do Apartamento *</Label>
                <Input 
                  value={flatNumberInput}
                  onChange={e => setFlatNumberInput(e.target.value)}
                  placeholder="Ex: 408"
                  required
                  className="text-xs rounded-xl h-9.5 font-bold"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFlatModalOpen(false)} className="rounded-xl h-9.5 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingFlat} className="rounded-xl h-9.5 text-xs font-bold bg-primary text-primary-foreground">
                  {savingFlat ? "Salvando..." : "Salvar Flat"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
