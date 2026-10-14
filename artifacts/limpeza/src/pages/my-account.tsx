import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  User, Shield, Key, KeyRound, Fingerprint, Calendar, Car, Briefcase, 
  Trash2, Download, CheckCircle2, AlertTriangle, LogOut, ArrowRight, 
  ExternalLink, Lock, Eye, EyeOff, Save, Check, Smartphone, Globe, MapPin
} from "lucide-react"
import { 
  getCurrentSession, updateAccountProfile, changeAccountPassword, 
  registerPasskeyDevice, exportUserData, deleteUserAccount, logoutAccount,
  UserProfile 
} from "@/lib/auth-client"
import { AddToCalendar } from "@/components/add-to-calendar"
import { useToast } from "@/hooks/use-toast"

export default function MyAccount() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("profile")

  // Form States - Profile (Personal & Demographic)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [docType, setDocType] = useState("CPF")
  const [document, setDocument] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [gender, setGender] = useState("")
  const [nationality, setNationality] = useState("Brasileira")
  const [profession, setProfession] = useState("")

  // Form States - Address
  const [cep, setCep] = useState("")
  const [street, setStreet] = useState("")
  const [streetNumber, setStreetNumber] = useState("")
  const [complement, setComplement] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("RJ")
  const [loadingCep, setLoadingCep] = useState(false)

  // Form States - Vehicle & Corporate
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [vehicleColor, setVehicleColor] = useState("")
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)

  // Form States - Security
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [registeringPasskey, setRegisteringPasskey] = useState(false)
  const [passkeyDeviceName, setPasskeyDeviceName] = useState("")

  // Modal States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Reservations History
  const [reservations, setReservations] = useState<any[]>([])

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      setLoading(true)
      const sessionUser = await getCurrentSession()
      if (!sessionUser) {
        const raw = localStorage.getItem("corpflats_guest_profile")
        if (raw) {
          const parsed = JSON.parse(raw)
          setUser(parsed)
          populateFields(parsed)
        } else {
          setLocation("/reservar")
          return
        }
      } else {
        setUser(sessionUser)
        populateFields(sessionUser)
      }

      // Carrega histórico de reservas via sessão autenticada
      const legacyToken = localStorage.getItem("corpflats_guest_token") || ""
      const headers: Record<string, string> = {}
      if (legacyToken) {
        headers["Authorization"] = `Bearer ${legacyToken}`
      }
      const bookingsRes = await fetch("/api/v2/auth/bookings", {
        method: "GET",
        credentials: "include",
        headers
      })
      if (bookingsRes.ok) {
        const bData = await bookingsRes.json()
        setReservations(bData.bookings || bData.reservations || [])
      } else {
        const meRes = await fetch("/api/guest-auth/me", {
          method: "GET",
          credentials: "include",
          headers
        })
        if (meRes.ok) {
          const meData = await meRes.json()
          setReservations(meData.reservations || [])
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  const maskCpf = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 11)
    if (clean.length <= 3) return clean
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`
  }

  const maskPhone = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 11)
    if (clean.length <= 2) return clean
    if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`
    if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  }

  const maskCep = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 8)
    if (clean.length <= 5) return clean
    return `${clean.slice(0, 5)}-${clean.slice(5)}`
  }

  const maskCnpj = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 14)
    if (clean.length <= 2) return clean
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`
    if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`
  }

  const handleLookupCep = async (val: string) => {
    const formatted = maskCep(val)
    setCep(formatted)
    const clean = val.replace(/\D/g, "")
    if (clean.length === 8) {
      setLoadingCep(true)
      try {
        const res = await fetch(`/api/lookup-cep/${clean}`)
        if (res.ok) {
          const data = await res.json()
          const st = data.logradouro || data.street || ""
          const nb = data.bairro || data.neighborhood || ""
          const ct = data.localidade || data.cidade || data.city || ""
          const uf = data.uf || data.state || ""
          if (st) setStreet(st)
          if (nb) setNeighborhood(nb)
          if (st || nb) setAddress([st, nb].filter(Boolean).join(", "))
          if (ct) setCity(ct)
          if (uf) setState(uf)
        }
      } catch {}
      finally {
        setLoadingCep(false)
      }
    }
  }

  const populateFields = (data: any) => {
    setName(data.name || "")
    setEmail(data.email || "")
    setPhone(maskPhone(data.phone || ""))
    const dType = data.docType || "CPF"
    setDocType(dType)
    setDocument(dType === "CPF" ? maskCpf(data.document || "") : (data.document || ""))
    setBirthDate(data.birthDate || "")
    setGender(data.gender || "")
    setNationality(data.nationality || "Brasileira")
    setProfession(data.profession || "")

    setCep(maskCep(data.cep || ""))
    setStreet(data.street || data.address || "")
    setStreetNumber(data.streetNumber || data.number || "")
    setComplement(data.complement || "")
    setNeighborhood(data.neighborhood || "")
    setAddress(data.address || data.street || "")
    setCity(data.city || "")
    setState(data.state || "RJ")

    if (data.vehicle) {
      setVehiclePlate(data.vehicle.plate || "")
      setVehicleBrand(data.vehicle.brand || "")
      setVehicleModel(data.vehicle.model || "")
      setVehicleColor(data.vehicle.color || "")
    } else {
      setVehiclePlate("")
      setVehicleBrand("")
      setVehicleModel("")
      setVehicleColor("")
    }

    if (data.companyData) {
      setCompanyCnpj(maskCnpj(data.companyData.cnpj || ""))
      setCompanyName(data.companyData.companyName || "")
      setCompanyEmail(data.companyData.companyEmail || "")
      setCompanyPhone(maskPhone(data.companyData.companyPhone || ""))
    } else {
      setCompanyCnpj("")
      setCompanyName("")
      setCompanyEmail("")
      setCompanyPhone("")
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const composedAddress = [
        street.trim(),
        streetNumber.trim() ? `nº ${streetNumber.trim()}` : "",
        complement.trim(),
        neighborhood.trim()
      ].filter(Boolean).join(", ") || address.trim()

      const hasAnyVehicle = Boolean(vehiclePlate.trim() || vehicleBrand.trim() || vehicleModel.trim() || vehicleColor.trim())
      const hasAnyCompany = Boolean(companyCnpj.trim() || companyName.trim() || companyEmail.trim() || companyPhone.trim())

      const payload: any = {
        name: name.trim(),
        email: email.trim(),
        newEmail: user?.email && email.trim().toLowerCase() !== user.email.toLowerCase() ? email.trim() : undefined,
        phone: phone.trim(),
        docType,
        document: document.trim(),
        birthDate,
        gender,
        nationality: nationality.trim() || "Brasileira",
        profession: profession.trim(),
        cep: cep.trim(),
        street: street.trim() || composedAddress,
        streetNumber: streetNumber.trim(),
        number: streetNumber.trim(),
        complement: complement.trim(),
        neighborhood: neighborhood.trim(),
        address: composedAddress,
        city: city.trim(),
        state: state.trim(),
        vehicle: hasAnyVehicle
          ? {
              plate: vehiclePlate.trim().toUpperCase(),
              brand: vehicleBrand.trim(),
              model: vehicleModel.trim(),
              color: vehicleColor.trim()
            }
          : null,
        companyData: hasAnyCompany
          ? {
              cnpj: companyCnpj.trim(),
              companyName: companyName.trim(),
              companyEmail: companyEmail.trim(),
              companyPhone: companyPhone.trim()
            }
          : null
      }
      const res = await updateAccountProfile(payload)
      if (res.success) {
        if (res.user) {
          setUser(res.user)
          populateFields(res.user)
        }
        toast({
          title: "Perfil atualizado com sucesso! ✨",
          description: "Suas informações cadastrais foram sincronizadas com segurança."
        })
      } else {
        throw new Error(res.error || "Erro ao salvar perfil.")
      }
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A nova senha deve ter no mínimo 6 caracteres.",
        variant: "destructive"
      })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "A confirmação de senha é diferente da nova senha.",
        variant: "destructive"
      })
      return
    }

    setSavingPassword(true)
    try {
      const res = await changeAccountPassword(currentPassword, newPassword)
      if (res.success) {
        toast({
          title: "Senha alterada com sucesso!",
          description: "Sua nova senha já está ativa."
        })
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        throw new Error(res.error || "Senha atual incorreta.")
      }
    } catch (err: any) {
      toast({
        title: "Erro ao alterar senha",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setSavingPassword(false)
    }
  }

  const handleAddPasskey = async () => {
    setRegisteringPasskey(true)
    try {
      const deviceLabel = passkeyDeviceName.trim() || (/iPhone|iPad|Mac/i.test(navigator.userAgent) ? "Apple Touch/Face ID" : "Biometria do Dispositivo")
      const res = await registerPasskeyDevice(deviceLabel)
      if (res.success) {
        toast({
          title: "Passkey cadastrada!",
          description: "Agora você pode entrar instantaneamente usando Touch ID, Face ID ou Windows Hello."
        })
        loadUserData()
      } else {
        throw new Error(res.error || "Não foi possível registrar a Passkey.")
      }
    } catch (err: any) {
      toast({
        title: "Registro de Biometria",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setRegisteringPasskey(false)
    }
  }

  const handleLogout = async () => {
    await logoutAccount()
    localStorage.removeItem("corpflats_guest_profile")
    localStorage.removeItem("corpflats_guest_email")
    localStorage.removeItem("corpflats_guest_token")
    toast({
      title: "Sessão encerrada",
      description: "Você saiu com segurança da sua conta."
    })
    setLocation("/reservar")
  }

  const handleDeleteAccount = async () => {
    setDeletingAccount(true)
    try {
      const res = await deleteUserAccount()
      if (res.success) {
        localStorage.clear()
        toast({
          title: "Conta excluída",
          description: "Seus dados foram removidos em conformidade com a LGPD."
        })
        setLocation("/reservar")
      } else {
        throw new Error(res.error || "Erro ao excluir conta.")
      }
    } catch (err: any) {
      toast({
        title: "Erro na exclusão",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setDeletingAccount(false)
      setDeleteModalOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Carregando painel do hóspede...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Navbar do Hóspede */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div 
            onClick={() => setLocation("/reservar")} 
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
              CF
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-slate-900 dark:text-slate-100">CorpFlats</span>
              <span className="hidden sm:inline-block text-[11px] text-slate-400 ml-2 font-medium">Área do Hóspede</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/reservar")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl border-slate-200 hover:border-slate-300 dark:border-slate-800"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>Voltar a Reservas</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 pb-28">
        {/* Header do Usuário */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md">
              {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {user?.name || "Minha Conta"}
                </h1>
                <Badge className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                  ✓ Hóspede Verificado
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {user?.email || "Sem e-mail vinculado"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/reservar")}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl flex-1 sm:flex-none border-slate-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
            >
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              <span>Fazer Reserva</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-xs font-bold gap-1.5 h-9 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </Button>
          </div>
        </div>

        {/* Abas Principais */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 inline-flex gap-1 h-auto w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="profile" className="rounded-xl py-2 px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 data-[state=active]:shadow-xs gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Meu Perfil</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-xl py-2 px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 data-[state=active]:shadow-xs gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Segurança & Passkeys</span>
            </TabsTrigger>
            <TabsTrigger value="reservations" className="rounded-xl py-2 px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 data-[state=active]:shadow-xs gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Minhas Reservas</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="rounded-xl py-2 px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-sky-700 data-[state=active]:shadow-xs gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Privacidade & LGPD</span>
            </TabsTrigger>
          </TabsList>

          {/* 1. ABA MEU PERFIL */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <User className="w-5 h-5 text-sky-600" />
                  Dados Pessoais & Documentação
                </CardTitle>
                <CardDescription className="text-xs">
                  Mantenha seus dados atualizados para agilizar o check-in automático, emissão de FNRH/NFS-e e liberação de portaria.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Dados Pessoais Principais */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Nome Completo *</Label>
                      <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="rounded-xl h-9 text-xs"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">E-mail de Acesso & Contato *</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="rounded-xl h-9 text-xs font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">WhatsApp / Celular *</Label>
                      <Input
                        value={phone}
                        onChange={e => setPhone(maskPhone(e.target.value))}
                        placeholder="(22) 99999-9999"
                        className="rounded-xl h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Tipo de Documento</Label>
                      <select
                        value={docType}
                        onChange={e => {
                          const nextType = e.target.value
                          setDocType(nextType)
                          if (nextType === "CPF") {
                            setDocument(maskCpf(document))
                          }
                        }}
                        className="w-full rounded-xl h-9 text-xs px-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      >
                        <option value="CPF">CPF</option>
                        <option value="RG">RG</option>
                        <option value="Passaporte">Passaporte</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">{docType === "CPF" ? "CPF *" : "Número do Documento *"}</Label>
                      <Input
                        value={document}
                        onChange={e => setDocument(docType === "CPF" ? maskCpf(e.target.value) : e.target.value)}
                        placeholder={docType === "CPF" ? "000.000.000-00" : "Número do documento"}
                        className="rounded-xl h-9 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Dados Demográficos (FNRH / CRM) */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Data de Nascimento</Label>
                      <Input
                        type="date"
                        value={birthDate}
                        onChange={e => setBirthDate(e.target.value)}
                        className="rounded-xl h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Gênero</Label>
                      <select
                        value={gender}
                        onChange={e => setGender(e.target.value)}
                        className="w-full rounded-xl h-9 text-xs px-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      >
                        <option value="">Selecione...</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Feminino">Feminino</option>
                        <option value="Outro">Outro</option>
                        <option value="Prefiro não informar">Prefiro não informar</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Nacionalidade</Label>
                      <Input
                        value={nationality}
                        onChange={e => setNationality(e.target.value)}
                        placeholder="Brasileira"
                        className="rounded-xl h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Profissão / Ocupação</Label>
                      <Input
                        value={profession}
                        onChange={e => setProfession(e.target.value)}
                        placeholder="Ex: Engenheiro, Médico..."
                        className="rounded-xl h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Seção de Endereço Completo com Busca de CEP */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-sky-600" />
                        <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          Endereço Residencial (FNRH & Nota Fiscal)
                        </h4>
                      </div>
                      {loadingCep && (
                        <span className="text-[11px] text-sky-600 font-semibold animate-pulse">
                          Buscando CEP...
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">CEP</Label>
                        <Input
                          value={cep}
                          onChange={e => handleLookupCep(e.target.value)}
                          placeholder="00000-000"
                          className="rounded-xl h-8 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-[11px] font-bold">Logradouro / Rua / Avenida</Label>
                        <Input
                          value={street}
                          onChange={e => {
                            setStreet(e.target.value)
                            setAddress(e.target.value)
                          }}
                          placeholder="Rua, Avenida, Alameda..."
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Número</Label>
                        <Input
                          value={streetNumber}
                          onChange={e => setStreetNumber(e.target.value)}
                          placeholder="Ex: 120, S/N"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Complemento</Label>
                        <Input
                          value={complement}
                          onChange={e => setComplement(e.target.value)}
                          placeholder="Apto, Bloco, Casa..."
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Bairro</Label>
                        <Input
                          value={neighborhood}
                          onChange={e => setNeighborhood(e.target.value)}
                          placeholder="Seu bairro"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Cidade</Label>
                        <Input
                          value={city}
                          onChange={e => setCity(e.target.value)}
                          placeholder="Sua cidade"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">UF / Estado</Label>
                        <Input
                          value={state}
                          onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                          placeholder="RJ"
                          maxLength={2}
                          className="rounded-xl h-8 text-xs font-mono uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seção de Veículo para Garagem */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-sky-600" />
                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Veículo & Estacionamento (Liberação de Portaria)
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Placa do Carro</Label>
                        <Input
                          value={vehiclePlate}
                          onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                          placeholder="ABC-1234 ou ABC1D23"
                          className="rounded-xl h-8 text-xs font-mono uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Marca</Label>
                        <Input
                          value={vehicleBrand}
                          onChange={e => setVehicleBrand(e.target.value)}
                          placeholder="Ex: Toyota, Honda, VW"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Modelo</Label>
                        <Input
                          value={vehicleModel}
                          onChange={e => setVehicleModel(e.target.value)}
                          placeholder="Ex: Corolla, Civic, Onix"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Cor</Label>
                        <Input
                          value={vehicleColor}
                          onChange={e => setVehicleColor(e.target.value)}
                          placeholder="Ex: Preto, Prata, Branco"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seção de Faturamento PJ / Empresas */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-sky-600" />
                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        Dados de Faturamento & Emissão de NFS-e (PJ)
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">CNPJ da Empresa</Label>
                        <Input
                          value={companyCnpj}
                          onChange={e => setCompanyCnpj(maskCnpj(e.target.value))}
                          placeholder="00.000.000/0001-00"
                          className="rounded-xl h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Razão Social</Label>
                        <Input
                          value={companyName}
                          onChange={e => setCompanyName(e.target.value)}
                          placeholder="Nome da empresa..."
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">E-mail Financeiro</Label>
                        <Input
                          value={companyEmail}
                          onChange={e => setCompanyEmail(e.target.value)}
                          placeholder="financeiro@empresa.com"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">Telefone Comercial / Financeiro</Label>
                        <Input
                          value={companyPhone}
                          onChange={e => setCompanyPhone(maskPhone(e.target.value))}
                          placeholder="(22) 99999-9999"
                          className="rounded-xl h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="submit"
                      disabled={savingProfile}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs px-6 h-9 rounded-xl shadow-md gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingProfile ? "Salvando..." : "Salvar Alterações"}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. ABA SEGURANÇA & PASSKEYS */}
          <TabsContent value="security" className="space-y-6">
            {/* Métodos de Acesso & Passkeys */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-sky-600" />
                  Acesso com Biometria & Passkeys (FIDO2)
                </CardTitle>
                <CardDescription className="text-xs">
                  Entre na sua conta sem digitar senhas, utilizando o Touch ID, Face ID ou Windows Hello do seu aparelho.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl bg-sky-50/50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold shrink-0">
                      <Fingerprint className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        Autenticação Biométrica Rápida
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Criptografia de chave pública protegida pelo hardware de segurança do seu dispositivo.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleAddPasskey}
                    disabled={registeringPasskey}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs gap-1.5 shrink-0 w-full sm:w-auto"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{registeringPasskey ? "Registrando..." : "Cadastrar este Dispositivo"}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Alteração de Senha */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-sky-600" />
                  Alterar Senha de Acesso
                </CardTitle>
                <CardDescription className="text-xs">
                  Crie uma senha forte e única para proteger seus dados e reservas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Senha Atual</Label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Sua senha atual..."
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Nova Senha</Label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres..."
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Confirmar Nova Senha</Label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha..."
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-slate-500 flex items-center gap-1 hover:text-slate-800"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? "Ocultar" : "Mostrar"} senhas</span>
                    </button>

                    <Button
                      type="submit"
                      disabled={savingPassword || !newPassword}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 h-9 rounded-xl"
                    >
                      {savingPassword ? "Atualizando..." : "Salvar Nova Senha"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. ABA MINHAS RESERVAS */}
          <TabsContent value="reservations" className="space-y-6">
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-600" />
                  Histórico de Estadias & Reservas
                </CardTitle>
                <CardDescription className="text-xs">
                  Acompanhe seus flats reservados, códigos de fechadura digital e comprovantes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {reservations.length > 0 ? (
                  <div className="space-y-3">
                    {reservations.map((r, idx) => (
                      <div
                        key={r.id || idx}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-sky-600 text-white font-bold text-xs">
                              Flat {r.flatNumber || r.roomNumber}
                            </Badge>
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                              {r.checkinDate || r.checkIn} até {r.checkoutDate || r.checkOut}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Hóspede: {r.guestName} • Valor: R$ {r.totalAmount || r.totalPrice || "---"}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {r.accessCode && (
                            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-center text-xs font-mono font-bold">
                              Senha: {r.accessCode}
                            </div>
                          )}
                          <AddToCalendar
                            variant="compact"
                            reservation={{
                              id: r.id || r.reservationCode || "res",
                              reservationCode: r.reservationCode || r.code || "CORPFLATS",
                              guestName: r.guestName || user?.name || "Hóspede",
                              guestEmail: r.guestEmail || user?.email,
                              flatNumber: r.flatNumber || r.roomNumber || "905",
                              checkinDate: r.checkinDate || r.checkIn,
                              checkoutDate: r.checkoutDate || r.checkOut,
                              numGuests: r.guestCount || 2,
                              accessCode: r.accessCode
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/minha-reserva/${r.id || r.reservationCode || ""}`, "_blank")}
                            className="text-xs font-bold gap-1 rounded-xl h-8"
                          >
                            <span>Ver Detalhes</span>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-3">
                    <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">Você ainda não possui reservas vinculadas a este e-mail.</p>
                    <Button
                      onClick={() => setLocation("/reservar")}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs"
                    >
                      Reservar um Flat Agora
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. ABA PRIVACIDADE & LGPD */}
          <TabsContent value="privacy" className="space-y-6">
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Lock className="w-5 h-5 text-sky-600" />
                  Direitos do Titular & LGPD (Lei Geral de Proteção de Dados)
                </CardTitle>
                <CardDescription className="text-xs">
                  Você tem controle total sobre os seus dados pessoais armazenados na plataforma CorpFlats.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Exportar Meus Dados</h4>
                      <p className="text-[11px] text-slate-500">
                        Baixe uma cópia completa em JSON de todas as suas informações cadastrais, veículos e histórico.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportUserData}
                      className="text-xs font-bold gap-1.5 h-8 rounded-xl shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-600" />
                      <span>Baixar Dados</span>
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-950 bg-rose-50/50 dark:bg-rose-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-rose-900 dark:text-rose-200">Exclusão Definitiva da Conta</h4>
                      <p className="text-[11px] text-rose-600 dark:text-rose-400">
                        Remove seu cadastro, credenciais de login e desvincula seus dados de acordo com a LGPD.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteModalOpen(true)}
                      className="text-xs font-bold gap-1.5 h-8 rounded-xl shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Conta</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Confirmação de Exclusão de Conta */}
        <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-rose-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Confirmar Exclusão de Conta
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Tem certeza que deseja excluir sua conta? Esta ação é irreversível e removerá todas as suas credenciais de login.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 pt-3">
              <Button variant="outline" onClick={() => setDeleteModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="font-bold text-xs rounded-xl"
              >
                {deletingAccount ? "Excluindo..." : "Sim, Excluir Minha Conta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  </div>
)
}
