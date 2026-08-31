import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Shell } from "@/components/layout"
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
  Sparkles, ExternalLink, Lock, Eye, EyeOff, Save, Check, Smartphone, Globe
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

  // Form States - Profile
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [document, setDocument] = useState("")
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [vehicleColor, setVehicleColor] = useState("")
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
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
        // Tenta fallback local
        const raw = localStorage.getItem("corpflats_guest_profile")
        if (raw) {
          const parsed = JSON.parse(raw)
          setUser(parsed)
          populateFields(parsed)
        } else {
          // Redireciona para o site ou login
          setLocation("/reservar")
          return
        }
      } else {
        setUser(sessionUser)
        populateFields(sessionUser)
      }

      // Carrega histórico de reservas
      const email = sessionUser?.email || ""
      if (email) {
        const res = await fetch(`/api/guest-auth/me?email=${encodeURIComponent(email)}`)
        if (res.ok) {
          const data = await res.json()
          setReservations(data.reservations || [])
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  const populateFields = (data: any) => {
    setName(data.name || "")
    setPhone(data.phone || "")
    setDocument(data.document || "")
    if (data.vehicle) {
      setVehiclePlate(data.vehicle.plate || "")
      setVehicleModel(data.vehicle.model || "")
      setVehicleColor(data.vehicle.color || "")
    }
    if (data.companyData) {
      setCompanyCnpj(data.companyData.cnpj || "")
      setCompanyName(data.companyData.companyName || "")
      setCompanyEmail(data.companyData.companyEmail || "")
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const payload = {
        name,
        phone,
        document,
        vehicle: vehiclePlate ? { plate: vehiclePlate, model: vehicleModel, color: vehicleColor } : null,
        companyData: companyCnpj ? { cnpj: companyCnpj, companyName, companyEmail } : null
      }
      const res = await updateAccountProfile(payload)
      if (res.success) {
        toast({
          title: "Perfil atualizado com sucesso! ✨",
          description: "Suas informações cadastrais foram salvas com segurança."
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
          title: "Senha alterada com sucesso! 🔐",
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
          title: "Passkey cadastrada! 📱✨",
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
      <Shell>
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Carregando painel do usuário...</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
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
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
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
                  Mantenha seus dados atualizados para agilizar o check-in automático e a liberação de portaria.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Nome Completo</Label>
                      <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="rounded-xl h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">E-mail Cadastrado</Label>
                      <Input
                        disabled
                        value={user?.email || ""}
                        className="rounded-xl h-9 text-xs bg-slate-50 dark:bg-slate-800 text-slate-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">WhatsApp / Celular</Label>
                      <Input
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="(22) 99999-9999"
                        className="rounded-xl h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">CPF / Documento</Label>
                      <Input
                        value={document}
                        onChange={e => setDocument(e.target.value)}
                        placeholder="000.000.000-00"
                        className="rounded-xl h-9 text-xs font-mono"
                      />
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold">CNPJ da Empresa</Label>
                        <Input
                          value={companyCnpj}
                          onChange={e => setCompanyCnpj(e.target.value)}
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
    </Shell>
  )
}
