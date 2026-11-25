import { useState, useEffect, useMemo } from "react"
import { useLocation, useRoute } from "wouter"
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
  ExternalLink, Lock, Eye, EyeOff, Save, Check, Smartphone, Globe, MapPin,
  Wallet, Receipt, Building2, FileText, FileCode2, Search, Clock
} from "lucide-react"
import { 
  getCurrentSession, updateAccountProfile, changeAccountPassword, 
  registerPasskeyDevice, exportUserData, deleteUserAccount, logoutAccount,
  UserProfile 
} from "@/lib/auth-client"
import { AddToCalendar } from "@/components/add-to-calendar"
import { useToast } from "@/hooks/use-toast"
import { CorpFlatsIcon, CorpFlatsWordmark, CorpFlatsSplashScreen } from "@/components/brand-logo"
import { formatSmartPhone, formatPassport, isPlausibleCpfOrPassport } from "@/lib/phone-mask"
import { ClientFinancialHubPanel, FinancialHubSummary } from "@/components/client-financial-hub-panel"
import {
  PublicBoletoItem,
  PublicNfseItem,
  PublicPreBoletoItem,
  formatDateBrShort,
  formatMoneyBr,
  getBoletoStatusBadgeMeta,
} from "@/components/financial-documents-section"

export default function MyAccount() {
  const [, setLocation] = useLocation()
  const [, paramsHub1] = useRoute("/painel-financeiro/:token")
  const [, paramsHub2] = useRoute("/financeiro-cliente/:token")
  const { toast } = useToast()

  const magicHubToken = useMemo(() => {
    const fromRoute = paramsHub1?.token || paramsHub2?.token || ""
    if (fromRoute) return fromRoute.trim()
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return (sp.get("hub") || sp.get("portal") || "").trim()
    }
    return ""
  }, [paramsHub1?.token, paramsHub2?.token])

  const isMagicHubMode = Boolean(magicHubToken)

  const getInitialTab = () => {
    if (isMagicHubMode) return "financial"
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      const qTab = (sp.get("tab") || "").toLowerCase()
      if (qTab === "financeiro" || qTab === "financial") return "financial"
      if (qTab === "reservas" || qTab === "reservations") return "reservations"
      if (qTab === "seguranca" || qTab === "security") return "security"
      if (qTab === "privacidade" || qTab === "privacy") return "privacy"
    }
    return "profile"
  }

  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [hubError, setHubError] = useState<string | null>(null)
  const [hubMeta, setHubMeta] = useState<any | null>(null)
  const [linkedCompanies, setLinkedCompanies] = useState<Array<{ id: number; name: string; cnpj?: string }>>([])
  const [linkedAgencies, setLinkedAgencies] = useState<Array<{ id: number; name: string; cnpj?: string }>>([])

  // Financial Hub States
  const [loadingFinancial, setLoadingFinancial] = useState(false)
  const [financialSummary, setFinancialSummary] = useState<FinancialHubSummary | null>(null)
  const [financialBoletos, setFinancialBoletos] = useState<PublicBoletoItem[]>([])
  const [financialPreBoletos, setFinancialPreBoletos] = useState<PublicPreBoletoItem[]>([])
  const [financialInvoices, setFinancialInvoices] = useState<PublicNfseItem[]>([])

  // Reservations Filter States
  const [reservationRoleFilter, setReservationRoleFilter] = useState<"all" | "requester" | "guest">("all")
  const [reservationSearch, setReservationSearch] = useState("")

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicHubToken])

  const loadUserData = async () => {
    try {
      setLoading(true)
      setHubError(null)

      // Modo Link Mágico Revogável (/painel-financeiro/:token) — sem senha, escopo Reservas + Financeiro
      if (magicHubToken) {
        setActiveTab((prev) => (prev === "reservations" ? "reservations" : "financial"))
        const res = await fetch(`/api/public/financial-hub/${encodeURIComponent(magicHubToken)}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.success) {
          setHubError(json.error || "Este link do Painel Financeiro é inválido ou foi revogado.")
          setReservations([])
          setFinancialSummary(null)
          setFinancialBoletos([])
          setFinancialPreBoletos([])
          setFinancialInvoices([])
          return
        }
        setHubMeta(json.hubMeta || null)
        setLinkedCompanies(Array.isArray(json.linkedCompanies) ? json.linkedCompanies : [])
        setLinkedAgencies(Array.isArray(json.linkedAgencies) ? json.linkedAgencies : [])
        setReservations(Array.isArray(json.reservations) ? json.reservations : [])
        setFinancialSummary(json.financial?.summary || null)
        setFinancialBoletos(Array.isArray(json.financial?.boletos) ? json.financial.boletos : [])
        setFinancialPreBoletos(Array.isArray(json.financial?.preBoletos) ? json.financial.preBoletos : [])
        setFinancialInvoices(Array.isArray(json.financial?.invoices) ? json.financial.invoices : [])
        return
      }

      const sessionUser = await getCurrentSession()
      if (!sessionUser) {
        const raw = localStorage.getItem("corpflats_guest_profile")
        if (raw) {
          const parsed = JSON.parse(raw)
          setUser(parsed)
          populateFields(parsed)
        } else {
          setLocation("/reservar?login=1")
          return
        }
      } else {
        setUser(sessionUser)
        populateFields(sessionUser)
      }

      // Carrega histórico de reservas (Hóspede + Solicitante + Empresa validada) e Financeiro em paralelo
      const legacyToken = localStorage.getItem("corpflats_guest_token") || ""
      const headers: Record<string, string> = {}
      if (legacyToken) {
        headers["Authorization"] = `Bearer ${legacyToken}`
      }
      setLoadingFinancial(true)
      const [bookingsRes, financialRes] = await Promise.all([
        fetch("/api/v2/auth/bookings", { method: "GET", credentials: "include", headers }),
        fetch("/api/v2/auth/financial", { method: "GET", credentials: "include", headers }),
      ])

      if (bookingsRes.ok) {
        const bData = await bookingsRes.json()
        setReservations(bData.bookings || bData.reservations || [])
        if (Array.isArray(bData.linkedCompanies)) setLinkedCompanies(bData.linkedCompanies)
        if (Array.isArray(bData.linkedAgencies)) setLinkedAgencies(bData.linkedAgencies)
      } else {
        const meRes = await fetch("/api/guest-auth/me", {
          method: "GET",
          credentials: "include",
          headers
        })
        if (meRes.ok) {
          const meData = await meRes.json()
          setReservations(meData.reservations || [])
          if (Array.isArray(meData.linkedCompanies)) setLinkedCompanies(meData.linkedCompanies)
          if (Array.isArray(meData.linkedAgencies)) setLinkedAgencies(meData.linkedAgencies)
        }
      }

      if (financialRes.ok) {
        const fData = await financialRes.json()
        setFinancialSummary(fData.summary || null)
        setFinancialBoletos(Array.isArray(fData.boletos) ? fData.boletos : [])
        setFinancialPreBoletos(Array.isArray(fData.preBoletos) ? fData.preBoletos : [])
        setFinancialInvoices(Array.isArray(fData.invoices) ? fData.invoices : [])
        if (Array.isArray(fData.linkedCompanies)) setLinkedCompanies(fData.linkedCompanies)
        if (Array.isArray(fData.linkedAgencies)) setLinkedAgencies(fData.linkedAgencies)
      }
    } catch {
      // Ignore
    } finally {
      setLoadingFinancial(false)
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

  const maskPhone = (v: string) => formatSmartPhone(v)

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
    const rawDoc = String(data.document || "")
    const hasDocLetters = /[a-zA-Z]/.test(rawDoc)
    const dType = hasDocLetters && (!data.docType || data.docType === "CPF")
      ? "Passaporte"
      : (data.docType || (hasDocLetters ? "Passaporte" : "CPF"))
    setDocType(dType)
    setDocument(dType === "CPF" ? maskCpf(rawDoc) : (dType === "Passaporte" ? formatPassport(rawDoc) : rawDoc))
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

    const trimmedPhone = phone.trim()
    if (trimmedPhone) {
      const cleanPhone = trimmedPhone.replace(/\D/g, "")
      const isIntl = trimmedPhone.startsWith("+") && !cleanPhone.startsWith("55")
      if (cleanPhone.length < (isIntl ? 8 : 10)) {
        toast({
          title: "Telefone inválido",
          description: "Informe um WhatsApp / Celular válido com DDD (ou DDI internacional com +).",
          variant: "destructive"
        })
        return
      }
    }

    const trimmedDoc = document.trim()
    const resolvedDocType = /[a-zA-Z]/.test(trimmedDoc) && docType === "CPF" ? "Passaporte" : docType
    if (trimmedDoc) {
      if (resolvedDocType === "CPF") {
        const cpfDigits = trimmedDoc.replace(/\D/g, "")
        if (cpfDigits.length !== 11 || /^(\d)\1{10}$/.test(cpfDigits)) {
          toast({
            title: "CPF inválido",
            description: "Informe os 11 dígitos válidos do CPF (ou selecione Passaporte se for estrangeiro).",
            variant: "destructive"
          })
          return
        }
      } else if (resolvedDocType === "Passaporte" && !isPlausibleCpfOrPassport(trimmedDoc)) {
        toast({
          title: "Passaporte inválido",
          description: "Informe um número de Passaporte válido (mínimo de 5 caracteres).",
          variant: "destructive"
        })
        return
      }
    }

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
        docType: resolvedDocType,
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

  const requesterReservationsCount = useMemo(
    () => reservations.filter((r) => Boolean(r?.isRequesterRole)).length,
    [reservations]
  )
  const guestOwnReservationsCount = useMemo(
    () => reservations.filter((r) => Boolean(r?.isGuestRole && !r?.isRequesterRole)).length,
    [reservations]
  )
  const hasBothRoles = requesterReservationsCount > 0 && guestOwnReservationsCount > 0

  const filteredReservations = useMemo(() => {
    const q = reservationSearch.trim().toLowerCase()
    return reservations.filter((r) => {
      if (reservationRoleFilter === "requester" && !r?.isRequesterRole) return false
      if (reservationRoleFilter === "guest" && !(r?.isGuestRole && !r?.isRequesterRole)) return false
      if (!q) return true
      const hay = [
        r.code,
        r.reservationCode,
        r.packageCode,
        r.guestName,
        r.companyName,
        r.agencyName,
        r.flatNumber ? `flat ${r.flatNumber}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [reservations, reservationRoleFilter, reservationSearch])

  const urgentFinancialCount = (financialSummary?.overdueCount || 0) + (financialSummary?.dueTodayCount || 0)

  if (loading) {
    return <CorpFlatsSplashScreen label={isMagicHubMode ? "Carregando Painel Financeiro..." : "Carregando painel do cliente..."} />
  }

  if (isMagicHubMode && hubError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
        <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 min-h-16 py-2 flex items-center justify-between gap-2">
            <div onClick={() => setLocation("/reservar")} className="flex items-center gap-2.5 cursor-pointer">
              <CorpFlatsIcon className="w-9 h-9" />
              <CorpFlatsWordmark className="text-base text-[#0F3D4C] dark:text-white leading-tight" />
            </div>
            <Button size="sm" variant="outline" onClick={() => setLocation("/reservar?login=1")} className="rounded-xl text-xs font-bold">
              Entrar na Minha Conta
            </Button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md rounded-3xl border-rose-200 dark:border-rose-900 p-6 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
            <div className="space-y-1">
              <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">Link Inválido ou Revogado</h1>
              <p className="text-xs text-slate-500 leading-relaxed">{hubError}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button onClick={() => setLocation("/reservar?login=1")} className="rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs">
                Acessar com Login
              </Button>
              <Button variant="outline" onClick={() => setLocation("/reservar")} className="rounded-xl font-bold text-xs">
                Ir para Reservas
              </Button>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Navbar do Cliente / Solicitante */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 min-h-16 py-2 flex items-center justify-between gap-2">
          <div 
            onClick={() => setLocation("/reservar")} 
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
          >
            <CorpFlatsIcon className="w-9 h-9" />
            <div className="min-w-0 flex flex-col justify-center">
              <CorpFlatsWordmark className="text-base text-[#0F3D4C] dark:text-white leading-tight" />
              <span className="text-[10px] text-slate-500 font-semibold leading-tight mt-0.5">
                {isMagicHubMode
                  ? "Painel Financeiro & Reservas"
                  : requesterReservationsCount > 0 || linkedCompanies.length > 0
                    ? "Área do Hóspede & Solicitante"
                    : "Área do Hóspede"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/reservar")}
              className="text-xs font-bold gap-1.5 h-auto min-h-9 py-1.5 px-2.5 sm:px-3 rounded-xl border-slate-200 hover:border-slate-300 dark:border-slate-800"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180 shrink-0" />
              <span>Fazer Reserva</span>
            </Button>
            {isMagicHubMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/reservar?login=1")}
                className="text-xs font-bold gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl text-[#0F3D4C] dark:text-sky-300 border-sky-200 dark:border-sky-800 shrink-0"
              >
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Minha Conta</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-xs font-bold gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 pb-28">
        {/* Header do Usuário / Solicitante */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 w-full sm:w-auto">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#091E26] to-[#0F3D4C] border border-[#C5A059]/40 text-[#E5C98B] flex items-center justify-center font-black text-xl shadow-md shrink-0">
              {isMagicHubMode
                ? (hubMeta?.label ? hubMeta.label.charAt(0).toUpperCase() : <Building2 className="w-7 h-7" />)
                : (user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-7 h-7" />)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight break-words">
                  {isMagicHubMode ? (hubMeta?.label || "Painel Financeiro") : (user?.name || "Minha Conta")}
                </h1>
                {isMagicHubMode ? (
                  <Badge className="bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 text-[10px] font-bold shrink-0">
                    ✓ Acesso Direto ao Painel Financeiro
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                    ✓ Conta Verificada
                  </Badge>
                )}
                {(requesterReservationsCount > 0 || linkedCompanies.length > 0 || linkedAgencies.length > 0) && (
                  <Badge className="bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold shrink-0">
                    🏢 Solicitante / Corporativo
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-all">
                {isMagicHubMode
                  ? ([hubMeta?.companyName || hubMeta?.agencyName, hubMeta?.email, hubMeta?.document].filter(Boolean).join(" • ") || "Boletos, Notas Fiscais (NFS-e) e Reservas")
                  : (user?.email || "Sem e-mail vinculado")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/reservar")}
              className="text-xs font-bold gap-1.5 h-auto min-h-9 py-2 rounded-xl flex-1 sm:flex-none border-slate-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
            >
              <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>Nova Reserva</span>
            </Button>

            {!isMagicHubMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs font-bold gap-1.5 h-auto min-h-9 py-2 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Sair</span>
              </Button>
            )}
          </div>
        </div>

        {/* Abas Principais — linha única rolável com indicador estrutural de borda */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 flex overflow-x-auto justify-start gap-1 h-auto w-full">
            {!isMagicHubMode && (
              <TabsTrigger value="profile" className="shrink-0 relative rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-[#0F3D4C] dark:data-[state=active]:text-sky-300 data-[state=active]:border-b-2 data-[state=active]:border-[#0F3D4C] dark:data-[state=active]:border-sky-400 data-[state=active]:shadow-xs gap-1.5">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span>Meu Perfil</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="financial" className="shrink-0 relative rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-[#0F3D4C] dark:data-[state=active]:text-sky-300 data-[state=active]:border-b-2 data-[state=active]:border-[#0F3D4C] dark:data-[state=active]:border-sky-400 data-[state=active]:shadow-xs gap-1.5">
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>Financeiro (Boletos &amp; Notas)</span>
              {urgentFinancialCount > 0 && (
                <Badge className="bg-rose-600 text-white text-[10px] px-1.5 py-0 ml-0.5">
                  {urgentFinancialCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reservations" className="shrink-0 relative rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-[#0F3D4C] dark:data-[state=active]:text-sky-300 data-[state=active]:border-b-2 data-[state=active]:border-[#0F3D4C] dark:data-[state=active]:border-sky-400 data-[state=active]:shadow-xs gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{isMagicHubMode ? "Reservas" : "Minhas Reservas"} ({reservations.length})</span>
            </TabsTrigger>
            {!isMagicHubMode && (
              <>
                <TabsTrigger value="security" className="shrink-0 relative rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-[#0F3D4C] dark:data-[state=active]:text-sky-300 data-[state=active]:border-b-2 data-[state=active]:border-[#0F3D4C] dark:data-[state=active]:border-sky-400 data-[state=active]:shadow-xs gap-1.5">
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span>Segurança &amp; Passkeys</span>
                </TabsTrigger>
                <TabsTrigger value="privacy" className="shrink-0 relative rounded-xl py-2 px-3.5 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-[#0F3D4C] dark:data-[state=active]:text-sky-300 data-[state=active]:border-b-2 data-[state=active]:border-[#0F3D4C] dark:data-[state=active]:border-sky-400 data-[state=active]:shadow-xs gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Privacidade &amp; LGPD</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* 0. ABA FINANCEIRO (BOLETOS & NOTAS FISCAIS) */}
          <TabsContent value="financial" className="space-y-6">
            <ClientFinancialHubPanel
              summary={financialSummary}
              boletos={financialBoletos}
              preBoletos={financialPreBoletos}
              invoices={financialInvoices}
              loading={loadingFinancial}
              linkedCompanies={linkedCompanies}
              linkedAgencies={linkedAgencies}
            />
          </TabsContent>

          {/* 1. ABA MEU PERFIL */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <User className="w-5 h-5 text-sky-600 shrink-0" />
                  <span>Dados Pessoais & Documentação</span>
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
                      <Label className="text-xs font-semibold">Nome Completo *</Label>
                      <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="rounded-xl h-9 text-xs"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">E-mail de Acesso & Contato *</Label>
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
                        type="tel"
                        inputMode="tel"
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
                          } else if (nextType === "Passaporte") {
                            setDocument(formatPassport(document))
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
                      <Label className="text-xs font-bold">
                        {docType === "CPF" ? "CPF *" : docType === "Passaporte" ? "Passaporte *" : "Número do Documento *"}
                      </Label>
                      <Input
                        value={document}
                        onChange={e => {
                          const val = e.target.value
                          if (docType === "CPF" && /[a-zA-Z]/.test(val)) {
                            setDocType("Passaporte")
                            setDocument(formatPassport(val))
                            return
                          }
                          setDocument(
                            docType === "CPF"
                              ? maskCpf(val)
                              : docType === "Passaporte"
                                ? formatPassport(val)
                                : val
                          )
                        }}
                        placeholder={docType === "CPF" ? "000.000.000-00" : docType === "Passaporte" ? "Ex: AB123456" : "Número do documento"}
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
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
                      <Car className="w-4 h-4 text-sky-600 shrink-0" />
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
                      <Briefcase className="w-4 h-4 text-sky-600 shrink-0" />
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
                          type="tel"
                          inputMode="tel"
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
                      className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs px-6 h-auto min-h-9 py-2 rounded-xl shadow-md gap-1.5 w-full sm:w-auto"
                    >
                      <Save className="w-3.5 h-3.5 shrink-0" />
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
                  <Fingerprint className="w-5 h-5 text-sky-600 shrink-0" />
                  <span>Acesso com Biometria & Passkeys (FIDO2)</span>
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
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-auto min-h-9 py-2 px-4 rounded-xl shadow-xs gap-1.5 shrink-0 w-full sm:w-auto"
                  >
                    <Fingerprint className="w-4 h-4 shrink-0" />
                    <span>{registeringPasskey ? "Registrando..." : "Cadastrar este Dispositivo"}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Alteração de Senha */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-sky-600 shrink-0" />
                  <span>Alterar Senha de Acesso</span>
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

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-slate-500 flex items-center gap-1 hover:text-slate-800"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 shrink-0" />}
                      <span>{showPassword ? "Ocultar" : "Mostrar"} senhas</span>
                    </button>

                    <Button
                      type="submit"
                      disabled={savingPassword || !newPassword}
                      className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 h-auto min-h-9 py-2 rounded-xl"
                    >
                      {savingPassword ? "Atualizando..." : "Salvar Nova Senha"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. ABA MINHAS RESERVAS (Hóspede + Solicitante + Documentos por Reserva) */}
          <TabsContent value="reservations" className="space-y-6">
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-sky-600 shrink-0" />
                      <span>Histórico de Estadias &amp; Reservas</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Acompanhe suas reservas, acesse portais de hóspede/solicitante e baixe boletos e notas fiscais diretamente de cada estadia.
                    </CardDescription>
                  </div>
                  {(financialBoletos.length + financialPreBoletos.length + financialInvoices.length) > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("financial")}
                      className="rounded-xl text-xs font-bold gap-1.5 text-[#0F3D4C] dark:text-sky-300 border-sky-200 dark:border-sky-800 shrink-0"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Ver Painel Financeiro</span>
                    </Button>
                  )}
                </div>

                {reservations.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input
                        value={reservationSearch}
                        onChange={(e) => setReservationSearch(e.target.value)}
                        placeholder="Buscar por código, hóspede, flat ou empresa..."
                        className="pl-9 h-9 rounded-xl text-xs"
                      />
                    </div>
                    {hasBothRoles && (
                      <div className="flex overflow-x-auto gap-1.5 shrink-0">
                        {(
                          [
                            { id: "all", label: `Todas (${reservations.length})` },
                            { id: "requester", label: `Que Solicitei (${requesterReservationsCount})` },
                            { id: "guest", label: `Minhas Estadias (${guestOwnReservationsCount})` },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setReservationRoleFilter(opt.id)}
                            className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                              reservationRoleFilter === opt.id
                                ? "bg-[#0F3D4C] text-white border-[#0F3D4C] dark:bg-sky-600 dark:border-sky-600"
                                : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredReservations.length > 0 ? (
                  <div className="space-y-3">
                    {filteredReservations.map((r, idx) => {
                      const resBoletos: PublicBoletoItem[] = Array.isArray(r.boletos) ? r.boletos : []
                      const resPreBoletos: PublicPreBoletoItem[] = Array.isArray(r.preBoletos) ? r.preBoletos : []
                      const resInvoices: PublicNfseItem[] = Array.isArray(r.nfseInvoices) ? r.nfseInvoices : []
                      const detailUrl = r.portalUrl || `/minha-reserva/${encodeURIComponent(r.code || r.reservationCode || r.id || "")}`

                      return (
                        <div
                          key={r.id || r.code || idx}
                          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge className="bg-sky-600 text-white font-bold text-xs shrink-0">
                                  Flat {r.flatNumber || r.roomNumber}
                                </Badge>
                                {(r.code || r.reservationCode) && (
                                  <Badge variant="outline" className="font-mono text-[10px] font-bold bg-white dark:bg-slate-900">
                                    {r.code || r.reservationCode}
                                  </Badge>
                                )}
                                {r.isRequesterRole && (
                                  <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 text-[10px] font-bold">
                                    🏢 Solicitada
                                  </Badge>
                                )}
                                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                                  {formatDateBrShort(r.checkinDate || r.checkIn)} até {formatDateBrShort(r.checkoutDate || r.checkOut)}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 break-words">
                                Hóspede: <strong>{r.guestName || "A definir"}</strong>
                                {r.companyName ? ` • ${r.companyName}` : ""}
                                {" • "}
                                {r.hideFinancialForGuest ? (
                                  <span>Faturamento gerenciado pelo solicitante/empresa</span>
                                ) : (
                                  <span>Valor: <strong className="font-mono text-slate-800 dark:text-slate-200">R$ {formatMoneyBr(r.totalAmount || r.totalPrice)}</strong></span>
                                )}
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
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(detailUrl, "_blank")}
                                className="text-xs font-bold gap-1 rounded-xl h-auto min-h-8 py-1.5"
                              >
                                <span>{r.isRequesterRole ? "Portal Solicitante" : "Ver Detalhes"}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </Button>
                            </div>
                          </div>

                          {/* Documentos Fiscais & Boletos da Reserva (atalhos rápidos) */}
                          {!r.hideFinancialForGuest && (resBoletos.length > 0 || resPreBoletos.length > 0 || resInvoices.length > 0) && (
                            <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                              {resBoletos.map((b) => {
                                const meta = getBoletoStatusBadgeMeta(b.displayStatus, b.daysOverdue)
                                return (
                                  <a
                                    key={`rbol_${b.id || b.code}`}
                                    href={b.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-[11px] font-bold text-slate-800 dark:text-slate-100"
                                    title={`Baixar PDF do Boleto #${b.code}`}
                                  >
                                    <Download className="w-3 h-3 text-indigo-600 shrink-0" />
                                    <span>Boleto R$ {formatMoneyBr(b.amount)}</span>
                                    <Badge className={`text-[9px] px-1.5 py-0 border ${meta.className}`}>
                                      {meta.label}
                                    </Badge>
                                  </a>
                                )
                              })}

                              {resPreBoletos.map((pre) => (
                                <span
                                  key={`rpre_${pre.id}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                                >
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span>Boleto Aguardando Emissão • Venc. {formatDateBrShort(pre.dueDate)}</span>
                                </span>
                              ))}

                              {resInvoices.map((inv) => (
                                <div key={`rnf_${inv.id || inv.numeroNfse}`} className="inline-flex items-center gap-1">
                                  <a
                                    href={inv.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white text-[11px] font-bold"
                                  >
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span>NFS-e Nº {inv.numeroNfse} (PDF)</span>
                                  </a>
                                  <a
                                    href={inv.xmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-[10px] font-bold text-slate-700 dark:text-slate-200"
                                    title={`Baixar XML da NFS-e Nº ${inv.numeroNfse}`}
                                  >
                                    <FileCode2 className="w-3 h-3 shrink-0" />
                                    <span>XML</span>
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-3">
                    <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">
                      {reservations.length > 0
                        ? "Nenhuma reserva encontrada para o filtro informado."
                        : "Você ainda não possui reservas vinculadas a este cadastro."}
                    </p>
                    {reservations.length === 0 && (
                      <Button
                        onClick={() => setLocation("/reservar")}
                        className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-auto min-h-9 py-2 px-4 rounded-xl shadow-xs"
                      >
                        Reservar um Flat Agora
                      </Button>
                    )}
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
                  <Lock className="w-5 h-5 text-sky-600 shrink-0" />
                  <span>Direitos do Titular & LGPD (Lei Geral de Proteção de Dados)</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Você tem controle total sobre os seus dados pessoais armazenados na plataforma CorpFlats.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
                      className="text-xs font-bold gap-1.5 h-auto min-h-8 py-1.5 rounded-xl shrink-0 w-full sm:w-auto"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>Baixar Dados</span>
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-950 bg-rose-50/50 dark:bg-rose-950/20 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
                      className="text-xs font-bold gap-1.5 h-auto min-h-8 py-1.5 rounded-xl shrink-0 w-full sm:w-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
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
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>Confirmar Exclusão de Conta</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Tem certeza que deseja excluir sua conta? Esta ação é irreversível e removerá todas as suas credenciais de login.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 pt-3">
              <Button variant="outline" onClick={() => setDeleteModalOpen(false)} className="rounded-xl w-full sm:w-auto">
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="font-bold text-xs rounded-xl w-full sm:w-auto"
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
