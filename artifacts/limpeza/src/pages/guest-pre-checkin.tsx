import { useState, useEffect, useRef, useMemo } from "react"
import { useRoute, useLocation } from "wouter"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Building2, User, Phone, Mail, Camera, FileText, CheckCircle2, 
  MapPin, ShieldCheck, ArrowRight, ArrowLeft, PenTool, Sparkles, AlertCircle, Zap, Car,
  Printer, Edit3, Share2, Eye, ZoomIn, Download, ExternalLink, MessageCircle, Clock, Calendar, Check, Ban, Lock, Award, KeyRound, Search
} from "lucide-react"
import { compressImage } from "@/lib/image-compression"

export default function GuestPreCheckin() {
  const [, params] = useRoute("/pre-checkin/:code")
  const [, setLocation] = useLocation()

  const getQueryCode = () => {
    if (params?.code) return params.code
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("code") || sp.get("res") || sp.get("reserva") || sp.get("q") || ""
    }
    return ""
  }

  const code = getQueryCode()
  const [searchCodeInput, setSearchCodeInput] = useState("")

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [compressing, setCompressing] = useState(false)

  // Minor of age (ECA Art. 82)
  const [minorKinship, setMinorKinship] = useState("filho")
  const [minorAuthDocPhoto, setMinorAuthDocPhoto] = useState<string | null>(null)

  // Read-only / Immutable document mode (tablet / print)
  const isReadOnlyDocument = useMemo(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("view") === "document" || sp.get("readonly") === "true"
    }
    return false
  }, [])

  // Zoom / Lightbox State
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string, title: string } | null>(null)

  // Reservation & Guest info
  const [reservation, setReservation] = useState<any | null>(null)
  const [guestList, setGuestList] = useState<any[]>([])
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(1)
  const [completedTimestamp, setCompletedTimestamp] = useState<string | null>(null)

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [document, setDocument] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [gender, setGender] = useState("masculino")
  const [cep, setCep] = useState("")
  const [loadingCep, setLoadingCep] = useState(false)
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("RJ")
  const [transportMethod, setTransportMethod] = useState("carro")
  const [travelReason, setTravelReason] = useState("lazer")

  // Photos, Signature, Terms & Vehicle
  const [docPhoto, setDocPhoto] = useState<string | null>(null)
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [acceptedHouseRules, setAcceptedHouseRules] = useState(false)
  const [acceptedContract, setAcceptedContract] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsModalTab, setTermsModalTab] = useState<"rules" | "contract">("rules")
  const [settings, setSettings] = useState<any>(null)
  const [siteConfig, setSiteConfig] = useState<any>(null)

  // Veículo para Garagem
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleColor, setVehicleColor] = useState("")

  // Cálculo de idade e detecção de menor de idade (ECA Art. 82)
  const calculatedAge = useMemo(() => {
    if (!birthDate) return null
    const parts = birthDate.split("-")
    if (parts.length < 3) return null
    const bYear = parseInt(parts[0], 10)
    const bMonth = parseInt(parts[1], 10) - 1
    const bDay = parseInt(parts[2], 10)
    if (isNaN(bYear) || isNaN(bMonth) || isNaN(bDay)) return null
    const bDate = new Date(bYear, bMonth, bDay)
    const now = new Date()
    let age = now.getFullYear() - bDate.getFullYear()
    const m = now.getMonth() - bDate.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < bDate.getDate())) {
      age--
    }
    return age >= 0 ? age : null
  }, [birthDate])

  const isMinorGuest = calculatedAge !== null && calculatedAge < 18

  // Canvas for signature
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const handleLookupPreCheckinCep = async (val: string) => {
    const clean = val.replace(/\D/g, "")
    if (clean.length === 8) {
      setLoadingCep(true)
      try {
        const res = await fetch(`/api/lookup-cep/${clean}`)
        if (res.ok) {
          const data = await res.json()
          if (data.logradouro) setAddress(`${data.logradouro}, ${data.bairro || ''}`.trim())
          if (data.cidade && data.uf) setCity(`${data.cidade} / ${data.uf}`)
        }
      } catch {}
      finally {
        setLoadingCep(false)
      }
    }
  }

  // URL query param ?guest=1,2,3
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const gParam = urlParams.get("guest")
    if (gParam) {
      setSelectedGuestIndex(Number(gParam) || 1)
    }
  }, [])

  const loadGuestData = (resData: any, gIdx: number) => {
    const gList = resData.guests || []
    setGuestList(gList)
    const currentG = gList.find((g: any) => g.index === gIdx) || gList[0]
    const res = resData.reservation || {}
    const guest = resData.guest || {}

    // Limpeza completa para evitar vazamento de estado entre hóspedes
    setDocPhoto(null)
    setSelfiePhoto(null)
    setSignatureData(null)
    setMinorAuthDocPhoto(null)
    setMinorKinship("filho")

    const isTitular = gIdx === 1

    const gName = currentG?.name && !currentG.name.startsWith("Hóspede")
      ? currentG.name
      : (isTitular ? (res.guestName || guest.name || "") : "")

    const gPhone = currentG?.phone
      ? currentG.phone
      : (isTitular ? (res.guestPhone || guest.phone || "") : "")

    const gEmail = currentG?.email
      ? currentG.email
      : (isTitular ? (res.guestEmail || guest.email || "") : "")

    const gDoc = currentG?.cpf
      ? currentG.cpf
      : (isTitular ? (res.guestDocument || guest.document || "") : "")

    setFullName(gName)
    setPhone(gPhone)
    setEmail(gEmail)
    setDocument(gDoc)

    setBirthDate(currentG?.birthDate || (isTitular ? (guest.birthDate || "") : ""))
    setGender(currentG?.gender || (isTitular ? (guest.gender || "masculino") : "masculino"))
    setAddress(currentG?.address || (isTitular ? (guest.address || "") : ""))
    setCity(currentG?.city || (isTitular ? (guest.city || "") : ""))
    setState(currentG?.state || (isTitular ? (guest.state || "RJ") : "RJ"))

    setMinorKinship(currentG?.minorKinship || "filho")
    setMinorAuthDocPhoto(currentG?.minorAuthDocUrl || null)

    const v = res.vehicle || guest.vehicle
    if (v && v.plate) {
      setVehiclePlate(v.plate)
      setVehicleModel(v.model || "")
      setVehicleBrand(v.brand || "")
      setVehicleColor(v.color || "")
      setTransportMethod("carro")
    }

    // Isolamento estrito de fotos e biometria:
    // Hóspede 1: pode ler do cadastro titular
    // Hóspede 2+: lê SOMENTE de currentG (NUNCA herda fotos do hóspede 1!)
    const selfie = currentG?.selfieUrl || (isTitular ? (res.selfieUrl || guest.photoUrl || null) : null)
    const doc = currentG?.docPhotoUrl || (isTitular ? (res.docPhotoUrl || guest.docPhotoUrl || null) : null)
    const sig = currentG?.signatureUrl || (isTitular ? (res.signatureUrl || guest.signatureUrl || null) : null)

    setSelfiePhoto(selfie || null)
    setDocPhoto(doc || null)
    setSignatureData(sig || null)

    // O Hóspede só é considerado concluído se ELE MESMO (currentG) tiver check-in feito!
    const fnhrDone = Boolean(
      currentG?.hasCompletedCheckin || 
      (isTitular && (res.fnhrCompleted || guest.fnhrCompleted) && selfie && sig)
    )

    if (currentG?.checkinCompletedAt || (isTitular && res.updatedAt)) {
      setCompletedTimestamp(currentG?.checkinCompletedAt || res.updatedAt)
    } else {
      setCompletedTimestamp(null)
    }

    if (isReadOnlyDocument) {
      setIsCompleted(true)
      setIsEditing(false)
    } else {
      setIsCompleted(fnhrDone)
      setIsEditing(!fnhrDone)
    }
  }

  useEffect(() => {
    if (code) {
      fetch(`/api/pms/pre-checkin/${code}`)
        .then(r => r.json())
        .then(data => {
          if (data.reservation) {
            setReservation(data.reservation)
            loadGuestData(data, selectedGuestIndex)
          }
        })
        .catch(() => {})
    }

    fetch("/api/settings")
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(() => {})

    fetch("/api/site-content")
      .then(r => r.json())
      .then(data => setSiteConfig(data))
      .catch(() => {})
  }, [code, selectedGuestIndex])

  // Branding & Contacts
  const brandName = siteConfig?.branding?.brandName && !siteConfig.branding.brandName.includes("Macaé") 
    ? siteConfig.branding.brandName 
    : "CorpFlats"
  const whatsappNumber = siteConfig?.branding?.whatsapp || settings?.adminWhatsApp || "5522997124021"
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Olá! Gostaria de ajuda com o pré-check-in digital${reservation?.code ? ` da reserva ${reservation.code}` : ''}.`)}`

  // Signature canvas handlers
  const startDrawing = (e: any) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: any) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.strokeStyle = "#0f172a"
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL("image/png"))
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setSignatureData(null)
    }
  }

  // Handle file uploads with automatic client-side WebP compression
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    setter: (val: string) => void,
    type: "doc" | "selfie" | "auth"
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCompressing(true)
    try {
      const result = await compressImage(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.8,
        preferredFormat: "image/webp"
      })

      setter(result.base64)
    } catch (err) {
      console.warn("Erro ao comprimir imagem, usando fallback:", err)
      const reader = new FileReader()
      reader.onload = () => setter(reader.result as string)
      reader.readAsDataURL(file)
    } finally {
      setCompressing(false)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pms/pre-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code || reservation?.code,
          reservationId: reservation?.id,
          guestIndex: selectedGuestIndex,
          fullName,
          phone,
          email,
          document,
          birthDate,
          gender,
          address,
          city,
          state,
          transportMethod,
          travelReason,
          selfieBase64: selfiePhoto,
          docPhotoBase64: docPhoto,
          signatureBase64: signatureData,
          isMinor: calculatedAge !== null && calculatedAge < 18,
          minorAge: calculatedAge,
          minorKinship: (calculatedAge !== null && calculatedAge < 18) ? minorKinship : null,
          minorAuthDocBase64: (calculatedAge !== null && calculatedAge < 18 && minorKinship !== "filho") ? minorAuthDocPhoto : null
        })
      })

      // Se informou carro, registra veículo e autorização de garagem
      if (transportMethod === "carro" && vehiclePlate.trim()) {
        const resCode = code || reservation?.code
        if (resCode) {
          fetch(`/api/pms/reservations/${resCode}/vehicle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plate: vehiclePlate.trim().toUpperCase(),
              brand: vehicleBrand.trim(),
              model: vehicleModel.trim(),
              color: vehicleColor.trim()
            })
          }).catch(() => {})
        }
      }

      if (res.ok) {
        setIsCompleted(true)
        setIsEditing(false)
        setSuccess(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO 0: BUSCA DE RESERVA SE NÃO HOUVER CÓDIGO
  // ══════════════════════════════════════════════════════════════════════════════
  if (!code && !reservation) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
        {/* Top Navbar */}
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div 
              onClick={() => setLocation("/reservar")}
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
            >
              {siteConfig?.branding?.logoImage ? (
                <img 
                  src={siteConfig.branding.logoImage} 
                  alt={brandName} 
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm group-hover:bg-slate-800 transition-colors">
                  CF
                </div>
              )}
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors block leading-none">
                {brandName}
              </span>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </a>
          </div>
        </nav>

        {/* Hero Banner */}
        <header className="relative min-h-[160px] sm:min-h-[190px] flex items-center justify-center px-4 sm:px-8 py-6 sm:py-8 text-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
              alt="Pré-Check-in CorpFlats"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/50 to-black/60" />
          </div>

          <div className="relative z-10 max-w-xl mx-auto space-y-1.5 text-white">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-[11px] font-semibold tracking-wide text-white/95 mb-1 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Autoatendimento Digital • 100% Rápido & Seguro</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md text-white">
              Pré-Check-in Digital
            </h1>
            <p className="text-xs sm:text-sm font-normal text-white/90 drop-shadow-sm tracking-normal">
              Ficha Nacional de Registro de Hóspedes (FNHR) & Acesso Facilitado
            </p>
          </div>
        </header>

        {/* Search Card */}
        <main className="max-w-lg w-full mx-auto px-4 -mt-6 sm:-mt-8 z-20 space-y-4 pb-20">
          <Card className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center mx-auto shadow-2xs">
              <FileText className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Localizar Pré-Check-in</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Informe o código da sua reserva, CPF ou WhatsApp cadastrado para iniciar seu pré-check-in digital.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const q = searchCodeInput.trim()
                if (!q) return
                setLocation(`/pre-checkin/${encodeURIComponent(q)}`)
              }}
              className="space-y-4 text-left"
            >
              <div className="space-y-1.5">
                <Label htmlFor="preCheckinSearch" className="text-xs font-bold text-slate-700">
                  Localizador, CPF ou Telefone:
                </Label>
                <div className="relative">
                  <Input
                    id="preCheckinSearch"
                    value={searchCodeInput}
                    onChange={(e) => setSearchCodeInput(e.target.value)}
                    placeholder="Ex: RES-211-0045, CPF ou 22997124021"
                    className="pl-10 h-11 text-xs sm:text-sm rounded-xl border-slate-200 focus-visible:ring-sky-500"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <Button
                type="submit"
                disabled={!searchCodeInput.trim()}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Acessar Pré-Check-in</span>
              </Button>
            </form>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/reservar")}
                className="text-slate-500 hover:text-slate-800 text-xs font-semibold p-0 h-auto"
              >
                ← Ir para Site de Reservas
              </Button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 text-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Falar com a Administração</span>
              </a>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO 1: FICHA DIGITAL DE HOSPEDAGEM (FNHR) CONCLUÍDA & CERTIFICADA
  // ══════════════════════════════════════════════════════════════════════════════
  if (isCompleted && !isEditing) {
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
        {/* Top Navigation Bar */}
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full print:hidden">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div 
              onClick={() => setLocation(reservation?.code ? `/minha-reserva/${reservation.code}` : "/minha-reserva")}
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
            >
              {siteConfig?.branding?.logoImage ? (
                <img 
                  src={siteConfig.branding.logoImage} 
                  alt={brandName} 
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm group-hover:bg-slate-800 transition-colors">
                  CF
                </div>
              )}
              <div>
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors block leading-none">
                  {brandName}
                </span>
                <span className="text-[10px] text-slate-500 font-mono font-medium block mt-0.5">
                  FNHR Certificada • Apt {reservation?.flatNumber}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {reservation?.code && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation(`/minha-reserva/${reservation.code}`)}
                  className="h-8 sm:h-9 px-2.5 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Portal do Hóspede</span>
                </Button>
              )}

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <header className="relative min-h-[140px] sm:min-h-[170px] flex items-center justify-center px-4 sm:px-8 py-6 sm:py-8 text-center overflow-hidden print:hidden">
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
              alt="Pré-Check-in CorpFlats"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/50 to-black/60" />
          </div>

          <div className="relative z-10 max-w-xl mx-auto space-y-1 text-white">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 backdrop-blur-md border border-emerald-400/30 text-[11px] font-semibold tracking-wide text-white mb-1 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
              <span>Check-in Digital Concluído & Autenticado</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md text-white">
              Ficha de Hospedagem (FNHR)
            </h1>
            <p className="text-xs sm:text-sm font-normal text-white/90 drop-shadow-sm">
              Apartamento {reservation?.flatNumber} • Edifício Soho Residence Service
            </p>
          </div>
        </header>

        {/* Main Certificate Container */}
        <main className="max-w-3xl w-full mx-auto px-4 -mt-6 sm:-mt-8 z-20 space-y-4 sm:space-y-5 pb-20">
          
          {/* Top Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white border border-slate-200/80 p-3 sm:p-4 rounded-2xl shadow-sm print:hidden">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-3 flex items-center gap-1.5 shadow-none">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Documento Registrado</span>
              </Badge>
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                Reserva <strong className="text-slate-900 font-mono">#{reservation?.code || code}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-9 text-xs bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-bold gap-1.5 rounded-xl shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Imprimir / Salvar PDF</span>
              </Button>

              {!isReadOnlyDocument ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-9 text-xs bg-amber-50/70 border-amber-200 hover:bg-amber-100/70 text-amber-800 font-bold gap-1.5 rounded-xl shadow-2xs"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                  <span>Editar Dados</span>
                </Button>
              ) : (
                <Badge className="bg-slate-900 text-white border-slate-900 text-xs font-bold py-1.5 px-3 flex items-center gap-1.5 shadow-xs">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Documento Oficial Imutável</span>
                </Badge>
              )}

              <Button
                size="sm"
                onClick={() => {
                  const phoneClean = (phone || reservation?.guestPhone || "").replace(/\D/g, "")
                  const url = window.location.href
                  const msg = encodeURIComponent(
                    `Olá, ${fullName}! 🏨 Sua Ficha Digital de Hospedagem (FNHR) do Apt ${reservation?.flatNumber} está confirmada e assinada:\n${url}`
                  )
                  window.open(phoneClean ? `https://wa.me/55${phoneClean}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank")
                }}
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 rounded-xl shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compartilhar WhatsApp</span>
              </Button>
            </div>
          </div>

          {/* Multi-Guest Selector (se houver mais de 1 pessoa) */}
          {guestList.length > 1 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm space-y-2 print:hidden">
              <span className="text-[11px] uppercase font-bold text-slate-500 block tracking-wider">
                Hóspedes Cadastrados na Reserva ({guestList.length} Pessoas):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {guestList.map((g: any) => {
                  const isCurrent = selectedGuestIndex === g.index
                  return (
                    <button
                      key={g.index}
                      type="button"
                      onClick={() => {
                        setSelectedGuestIndex(g.index)
                        if (reservation) {
                          loadGuestData({ reservation, guests: guestList }, g.index)
                        }
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border ${
                        isCurrent
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : g.hasCompletedCheckin
                          ? "bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="truncate">{g.name || `Hóspede ${g.index}`}</span>
                      {g.hasCompletedCheckin ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                      ) : (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0 ml-1">Pendente</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ficha Oficial FNHR Certificada */}
          <Card className="bg-white border border-slate-200/80 text-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            {/* Cabeçalho da Ficha */}
            <div className="border-b border-slate-100 pb-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {siteConfig?.branding?.logoImage ? (
                    <img 
                      src={siteConfig.branding.logoImage} 
                      alt={brandName} 
                      className="w-11 h-11 rounded-2xl object-contain shadow-xs"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
                      CF
                    </div>
                  )}
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
                      Ficha Nacional de Registro de Hóspedes (FNHR)
                    </h2>
                    <span className="text-[11px] text-sky-600 font-bold uppercase tracking-wider block">
                      {brandName} • Edifício Soho Residence Service
                    </span>
                  </div>
                </div>

                <Badge className="bg-emerald-50 hover:bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-3 flex items-center gap-1.5 shadow-none">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Check-in Digital Concluído</span>
                </Badge>
              </div>

              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                <span>Apartamento: <strong className="text-slate-900 font-bold">Studio Apt {reservation?.flatNumber}</strong></span>
                <span>Localizador: <strong className="text-sky-600 font-mono font-bold">{reservation?.code || code}</strong></span>
                {completedTimestamp && (
                  <span>Registro: <strong className="text-slate-700">{new Date(completedTimestamp).toLocaleString("pt-BR")}</strong></span>
                )}
              </div>
            </div>

            {/* 1. Dados Pessoais do Hóspede */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-sky-600" />
                <span>1. Dados de Identificação do Hóspede</span>
              </div>
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Nome Completo</span>
                  <span className="font-bold text-slate-900 text-sm">{fullName || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">CPF / Documento</span>
                  <span className="font-semibold text-slate-800 font-mono">{document || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">WhatsApp / Telefone</span>
                  <span className="font-semibold text-slate-800">{phone || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">E-mail</span>
                  <span className="font-medium text-slate-700 truncate block">{email || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Data de Nascimento</span>
                  <span className="font-medium text-slate-700">{birthDate || "Não informada"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Gênero</span>
                  <span className="font-medium text-slate-700 capitalize">{gender || "Não informado"}</span>
                </div>
                <div className="sm:col-span-3 pt-2 border-t border-slate-200/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Endereço Residencial</span>
                  <span className="font-medium text-slate-800">{address ? `${address} • ${city} - ${state}` : "Campos dos Goytacazes - RJ"}</span>
                </div>
              </div>
            </div>

            {/* 2. Dados da Estadia & Acomodação */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span>2. Dados da Hospedagem & Período</span>
              </div>
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Data de Check-in</span>
                  <span className="font-bold text-slate-900">{reservation?.checkinDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Data de Check-out</span>
                  <span className="font-bold text-slate-900">{reservation?.checkoutDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Canal de Origem</span>
                  <span className="font-bold text-sky-600 capitalize">{reservation?.channel || "Site Oficial"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Motivo da Viagem</span>
                  <span className="font-medium text-slate-800 capitalize">{travelReason || "Lazer / Turismo"}</span>
                </div>
              </div>
            </div>

            {/* 3. Veículo & Garagem Soho (se cadastrado) */}
            {vehiclePlate && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Car className="w-3.5 h-3.5 text-sky-600" />
                  <span>3. Veículo Cadastrado para Garagem</span>
                </div>
                <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-white border-2 border-slate-900 rounded-lg text-center font-mono shadow-xs">
                      <span className="text-[8px] block text-sky-600 font-bold uppercase leading-none">BRASIL</span>
                      <span className="text-sm font-black text-slate-900 tracking-widest leading-none">{vehiclePlate}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">{vehicleBrand} {vehicleModel}</span>
                      <span className="text-[11px] text-slate-600">
                        {vehicleColor ? `Cor: ${vehicleColor} • ` : ""}1 Vaga Privativa no Soho
                      </span>
                    </div>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                    ✓ Garagem Autorizada na Portaria
                  </Badge>
                </div>
              </div>
            )}

            {/* 4. Documentos & Biometria Anexados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-sky-600" />
                  <span>4. Documentação & Biometria Facial</span>
                </div>
                <span className="text-[11px] text-slate-400 font-normal lowercase">Toque na foto para ampliar</span>
              </div>

              {/* Aviso de Menor de Idade se aplicável */}
              {minorKinship && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 space-y-0.5">
                    <span className="font-bold block">
                      Hóspede Menor de Idade • ECA (Lei Federal nº 8.069/1990)
                    </span>
                    <p className="text-rose-700 text-[11px] leading-relaxed">
                      Parentesco declarado: <strong>
                        {minorKinship === "filho" ? "Filho(a) do responsável acompanhante" : minorKinship === "neto" ? "Neto(a)" : minorKinship === "sobrinho" ? "Sobrinho(a)" : minorKinship === "irmao" ? "Irmão / Irmã" : "Acompanhante Autorizado"}
                      </strong>
                      {minorAuthDocPhoto ? " • Autorização de Cartório Anexada com Sucesso" : minorKinship === "filho" ? " • Acompanhado diretamente pelos pais" : ""}
                    </p>
                  </div>
                </div>
              )}

              <div className={`grid grid-cols-1 ${minorAuthDocPhoto ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
                {/* Selfie do Hóspede */}
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Selfie com Documento</span>
                    {selfiePhoto && (
                      <span className="text-[10px] text-sky-600 font-bold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Ampliar
                      </span>
                    )}
                  </div>
                  <div
                    onClick={() => {
                      if (selfiePhoto) setZoomedPhoto({ url: selfiePhoto, title: `Selfie com Documento - ${fullName}` })
                    }}
                    className={`h-40 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden relative group shadow-2xs ${
                      selfiePhoto ? "cursor-pointer hover:border-sky-500" : ""
                    }`}
                  >
                    {selfiePhoto ? (
                      <>
                        <img src={selfiePhoto} alt="Selfie" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                          <ZoomIn className="w-4 h-4" /> <span>Ampliar Foto</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Selfie não anexada</span>
                    )}
                  </div>
                </div>

                {/* Foto do Documento */}
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Foto do Documento (RG / CNH)</span>
                    {docPhoto && (
                      <span className="text-[10px] text-sky-600 font-bold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Ampliar
                      </span>
                    )}
                  </div>
                  <div
                    onClick={() => {
                      if (docPhoto) setZoomedPhoto({ url: docPhoto, title: `Documento de Identidade - ${fullName}` })
                    }}
                    className={`h-40 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden relative group shadow-2xs ${
                      docPhoto ? "cursor-pointer hover:border-sky-500" : ""
                    }`}
                  >
                    {docPhoto ? (
                      <>
                        <img src={docPhoto} alt="Documento" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                          <ZoomIn className="w-4 h-4" /> <span>Ampliar Foto</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Documento não anexado</span>
                    )}
                  </div>
                </div>

                {/* Foto da Autorização de Cartório (se houver) */}
                {minorAuthDocPhoto && (
                  <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-rose-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-rose-800">Autorização Cartório (ECA)</span>
                      <span className="text-[10px] text-rose-600 font-bold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Ampliar
                      </span>
                    </div>
                    <div
                      onClick={() => {
                        setZoomedPhoto({ url: minorAuthDocPhoto, title: `Autorização em Cartório - ${fullName}` })
                      }}
                      className="h-40 bg-white rounded-xl border border-rose-200 flex items-center justify-center overflow-hidden relative group shadow-2xs cursor-pointer hover:border-rose-400"
                    >
                      <img src={minorAuthDocPhoto} alt="Autorização em Cartório" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                        <ZoomIn className="w-4 h-4" /> <span>Ampliar Foto</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Assinatura Digital & Termo de Aceite */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <PenTool className="w-3.5 h-3.5 text-sky-600" />
                <span>5. Assinatura Digital & Termos Aceitos</span>
              </div>
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                {signatureData ? (
                  <div 
                    onClick={() => setZoomedPhoto({ url: signatureData, title: `Assinatura Digital - ${fullName}` })}
                    className="bg-white rounded-xl p-2 h-28 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group border border-slate-200 shadow-2xs"
                  >
                    <img src={signatureData} alt="Assinatura Digital" className="max-h-full object-contain" />
                    <div className="absolute top-1.5 right-2 text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold shadow-xs">
                      ✓ Assinado Eletronicamente
                    </div>
                  </div>
                ) : (
                  <div className="h-20 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
                    Assinatura não registrada
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Regras do Imóvel & Conveniência Aceitas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Contrato de Locação por Temporada Aceito</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Flats 100% Não Fumantes (Ciente da Multa)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
                    <span>Dados protegidos conforme LGPD (Lei 13.709)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé Oficial da Ficha */}
            <div className="text-center pt-3 text-[11px] text-slate-400 border-t border-slate-100">
              {brandName} • Edifício Soho Residence Service • Centro, Campos dos Goytacazes - RJ
            </div>
          </Card>
        </main>

        {/* Modal: Lightbox Zoom de Fotos */}
        <Dialog open={Boolean(zoomedPhoto)} onOpenChange={(open) => !open && setZoomedPhoto(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[92vh] p-4 bg-white border border-slate-200 text-slate-900 flex flex-col justify-between rounded-3xl shadow-2xl">
            <DialogHeader className="pb-2 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Eye className="w-4 h-4 text-sky-600" />
                <span>{zoomedPhoto?.title || "Visualização da Foto"}</span>
              </DialogTitle>
            </DialogHeader>

            {zoomedPhoto?.url && (
              <div className="flex-1 flex items-center justify-center p-2 min-h-[300px] max-h-[65vh] overflow-hidden bg-slate-50 rounded-2xl">
                <img 
                  src={zoomedPhoto.url} 
                  alt="Foto Ampliada" 
                  className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-md border border-slate-200" 
                />
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between flex-row pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (zoomedPhoto?.url) window.open(zoomedPhoto.url, "_blank")
                }}
                className="text-xs bg-white hover:bg-slate-50 text-slate-700 border-slate-200 font-bold gap-1.5 rounded-xl"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir Original</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setZoomedPhoto(null)}
                className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODO 2: FORMULÁRIO DE PREENCHIMENTO PASSO-A-PASSO (PASSOS 1 A 4)
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div 
            onClick={() => setLocation(reservation?.code ? `/minha-reserva/${reservation.code}` : "/minha-reserva")}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm group-hover:bg-slate-800 transition-colors">
                CF
              </div>
            )}
            <div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors block leading-none">
                {brandName}
              </span>
              <span className="text-[10px] text-slate-500 font-mono font-medium block mt-0.5">
                {reservation?.flatNumber ? `Flat ${reservation.flatNumber} • Pré-Check-in Digital` : "Pré-Check-in Digital"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {reservation?.code && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/minha-reserva/${reservation.code}`)}
                className="h-8 sm:h-9 px-2.5 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Portal do Hóspede</span>
              </Button>
            )}

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative min-h-[160px] sm:min-h-[190px] flex items-center justify-center px-4 sm:px-8 py-6 sm:py-8 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
            alt="Pré-Check-in CorpFlats"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/50 to-black/60" />
        </div>

        <div className="relative z-10 max-w-xl mx-auto space-y-1.5 text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-[11px] font-semibold tracking-wide text-white/95 mb-1 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Ficha Nacional de Registro de Hóspedes (FNHR)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md text-white">
            Pré-Check-in Digital
          </h1>
          <p className="text-xs sm:text-sm font-normal text-white/90 drop-shadow-sm tracking-normal">
            Agilize sua entrada e libere seu acesso à portaria em menos de 2 minutos
          </p>
        </div>
      </header>

      {/* Main Form Container */}
      <main className="max-w-3xl w-full mx-auto px-4 -mt-6 sm:-mt-8 z-20 space-y-4 sm:space-y-5 pb-20">
        
        {/* Card de Identificação da Estada */}
        {reservation && (
          <Card className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-6 shadow-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Olá, {(fullName || reservation?.guestName || "Hóspede").trim().split(" ")[0]}! 👋
              </h2>

              {isCompleted && isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  className="text-xs border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold rounded-xl"
                >
                  ✕ Voltar à Ficha Concluída
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                Flat {reservation.flatNumber}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                {reservation.guestCount || 1} {(reservation.guestCount || 1) === 1 ? 'Hóspede' : 'Hóspedes'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                Entrada: {reservation.checkinDate}
              </span>
              <Badge className="bg-sky-50 hover:bg-sky-50 text-sky-700 border border-sky-200/80 font-semibold text-xs px-2.5 py-1 rounded-lg shadow-none">
                {reservation.channel || "Site Oficial"}
              </Badge>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
              Confirme seus dados cadastrais obrigatórios pela legislação brasileira para agilizar a liberação das chaves e autorização na portaria do condomínio.
            </p>
          </Card>
        )}

        {/* Banner de Preenchimento Único CorpFlats */}
        <div className="p-4 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-emerald-50/40 border border-sky-200/80 rounded-2xl flex items-start gap-3 shadow-xs">
          <div className="p-2 bg-slate-900 text-white rounded-xl shrink-0 mt-0.5 shadow-2xs">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                ⚡ Preenchimento Único CorpFlats
              </span>
              <Badge className="bg-sky-100 text-sky-800 text-[10px] font-bold border-sky-200 py-0 px-2">
                1x Apenas
              </Badge>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px] sm:text-xs">
              Seus dados cadastrais precisam ser preenchidos <strong>apenas 1 única vez</strong>. Nas próximas reservas que fizer conosco, seu cadastro já estará pronto automaticamente e você não precisará preencher tudo de novo! Cada hóspede possui um cadastro único, seguro e intransferível.
            </p>
          </div>
        </div>

        {/* Multi-Guest Selector (se a reserva for para mais de 1 pessoa) */}
        {guestList.length > 1 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-xs space-y-2">
            <span className="text-[11px] uppercase font-bold text-slate-500 block tracking-wider">
              Selecione o Hóspede para Preenchimento ({guestList.length} Pessoas):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {guestList.map((g: any) => {
                const isCurrent = selectedGuestIndex === g.index
                return (
                  <button
                    key={g.index}
                    type="button"
                    onClick={() => {
                      setSelectedGuestIndex(g.index)
                      setStep(1)
                      if (reservation) {
                        loadGuestData({ reservation, guests: guestList }, g.index)
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border ${
                      isCurrent
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : g.hasCompletedCheckin
                        ? "bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="truncate">{g.name || `Hóspede ${g.index}`}</span>
                    {g.hasCompletedCheckin ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                    ) : (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0 ml-1">Pendente</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Stepper Progress Bar */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {[
              { num: 1, label: "Dados" },
              { num: 2, label: "Documento" },
              { num: 3, label: "Selfie" },
              { num: 4, label: "Assinatura" }
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    step === s.num 
                      ? "bg-slate-900 text-white ring-4 ring-slate-900/10 shadow-xs" 
                      : step > s.num 
                      ? "bg-emerald-600 text-white" 
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}>
                    {step > s.num ? "✓" : s.num}
                  </div>
                  <span className={`text-[10px] mt-1 font-semibold ${step === s.num ? "text-slate-900 font-bold" : "text-slate-400"}`}>
                    {s.label}
                  </span>
                </div>
                {idx < 3 && (
                  <div className={`w-8 sm:w-16 h-1 rounded-full -mt-4 ${step > s.num ? "bg-emerald-600" : "bg-slate-100"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <Card className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-7 shadow-xl">
          {/* ── Passo 1: Dados Pessoais & Endereço ────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-sky-600" />
                  <span>1. Dados Pessoais & Ficha FNHR</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">* Campos obrigatórios</span>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Nome Completo *</Label>
                  <Input 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    required 
                    placeholder="Seu nome completo como no documento" 
                    className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">CPF ou Passaporte *</Label>
                    <Input 
                      value={document} 
                      onChange={e => setDocument(e.target.value)} 
                      required 
                      placeholder="000.000.000-00" 
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-mono font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Data de Nascimento *</Label>
                    <Input 
                      type="date" 
                      value={birthDate} 
                      onChange={e => setBirthDate(e.target.value)} 
                      required 
                      className="bg-white border-slate-200 text-slate-900 text-xs sm:text-sm font-semibold rounded-xl h-11 focus-visible:ring-sky-500" 
                    />
                  </div>
                </div>

                {/* Bloco Obrigatório do Estatuto da Criança e do Adolescente (ECA - Art. 82) */}
                {isMinorGuest && (
                  <div className="p-4 bg-rose-50/90 border border-rose-200 rounded-2xl space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-xs text-rose-900 block">
                          Hóspede Menor de Idade ({calculatedAge} {calculatedAge === 1 ? 'ano' : 'anos'}) • Estatuto da Criança e do Adolescente (ECA)
                        </span>
                        <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                          De acordo com o <strong>Art. 82 da Lei Federal nº 8.069/1990 (ECA)</strong>, é proibida a hospedagem de criança ou adolescente desacompanhado dos pais ou responsáveis legais sem expressa autorização formal.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-rose-200/60">
                      <Label className="text-xs font-bold text-rose-950">
                        Qual o grau de parentesco com o responsável acompanhante? *
                      </Label>
                      <Select value={minorKinship} onValueChange={setMinorKinship}>
                        <SelectTrigger className="bg-white border-rose-300 text-slate-900 text-xs sm:text-sm rounded-xl h-11 focus:ring-rose-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900 rounded-xl">
                          <SelectItem value="filho">Filho(a) do responsável acompanhante</SelectItem>
                          <SelectItem value="neto">Neto(a)</SelectItem>
                          <SelectItem value="sobrinho">Sobrinho(a)</SelectItem>
                          <SelectItem value="irmao">Irmão / Irmã</SelectItem>
                          <SelectItem value="outro">Outro parentesco / Sem parentesco direto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {minorKinship !== "filho" && (
                      <div className="p-3.5 bg-white border border-rose-300 rounded-xl space-y-2">
                        <span className="font-bold text-xs text-rose-900 block">
                          📜 Autorização dos Pais com Firma Reconhecida em Cartório (Obrigatório) *
                        </span>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Como o menor não está acompanhado diretamente de pai ou mãe, a legislação exige autorização por escrito dos pais com <strong>firma reconhecida em cartório</strong>. Por favor, anexe uma foto legível do documento.
                        </p>

                        {minorAuthDocPhoto ? (
                          <div className="flex items-center justify-between p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                            <span className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              Autorização de cartório anexada com sucesso
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setMinorAuthDocPhoto(null)}
                              className="text-[11px] h-7 px-2.5 border-rose-300 text-rose-800 hover:bg-rose-100 font-bold rounded-lg"
                            >
                              Trocar Foto
                            </Button>
                          </div>
                        ) : (
                          <label className="cursor-pointer flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-rose-300 hover:border-rose-500 rounded-xl bg-rose-50/50 text-rose-800 text-xs font-bold transition-colors">
                            <Camera className="w-4 h-4" />
                            <span>Tirar Foto ou Anexar Autorização</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={e => handleFileUpload(e, setMinorAuthDocPhoto, "auth")}
                              className="hidden"
                              disabled={compressing}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">WhatsApp / Celular</Label>
                    <Input 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                      placeholder="(22) 99999-9999" 
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Gênero</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs sm:text-sm rounded-xl h-11 focus:ring-sky-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 text-slate-900 rounded-xl">
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                        <SelectItem value="outro">Outro / Prefere não informar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">E-mail</Label>
                  <Input 
                    type="email"
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    placeholder="seuemail@exemplo.com" 
                    className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                  />
                </div>

                {/* CEP com Auto-Preenchimento */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-700">CEP</Label>
                      {loadingCep && <span className="text-[10px] text-sky-600 animate-pulse font-bold">Buscando...</span>}
                    </div>
                    <Input 
                      value={cep} 
                      onChange={e => {
                        setCep(e.target.value)
                        handleLookupPreCheckinCep(e.target.value)
                      }} 
                      onBlur={e => handleLookupPreCheckinCep(e.target.value)}
                      placeholder="00000-000" 
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-mono rounded-xl h-11 focus-visible:ring-sky-500" 
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700">Endereço Residencial (Rua, Nº, Bairro)</Label>
                    <Input 
                      value={address} 
                      onChange={e => setAddress(e.target.value)} 
                      placeholder="Ex: Av. Pelinca, 100 - Centro" 
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Cidade / Estado</Label>
                    <Input 
                      value={city} 
                      onChange={e => setCity(e.target.value)} 
                      placeholder="Ex: Campos dos Goytacazes / RJ" 
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">Meio de Transporte</Label>
                    <Select value={transportMethod} onValueChange={setTransportMethod}>
                      <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs sm:text-sm rounded-xl h-11 focus:ring-sky-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 text-slate-900 rounded-xl">
                        <SelectItem value="carro">🚗 Automóvel Próprio / Alugado (Garagem)</SelectItem>
                        <SelectItem value="aviao">✈️ Avião</SelectItem>
                        <SelectItem value="onibus">🚌 Ônibus</SelectItem>
                        <SelectItem value="outro">Outro / Carona</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 🚗 Garagem & Veículo Soho */}
                {transportMethod === "carro" && (
                  <div className="p-4 bg-sky-50/70 border border-sky-200/80 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                        <Car className="w-4 h-4 text-sky-600" />
                        Estacionamento Privativo • Edifício Soho Residence
                      </span>
                      <Badge className="bg-sky-100 text-sky-800 text-[10px] font-bold border-sky-200">1 Vaga Inclusa</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-700 font-bold">Placa do Veículo *</Label>
                        <Input 
                          value={vehiclePlate} 
                          onChange={e => setVehiclePlate(e.target.value.toUpperCase())} 
                          placeholder="ABC1D23" 
                          className="bg-white border-sky-200 text-slate-900 text-xs sm:text-sm font-mono font-bold uppercase rounded-xl h-10" 
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-700">Modelo do Carro</Label>
                        <Input 
                          value={vehicleModel} 
                          onChange={e => setVehicleModel(e.target.value)} 
                          placeholder="Ex: Corolla, Civic, T-Cross" 
                          className="bg-white border-sky-200 text-slate-900 text-xs sm:text-sm rounded-xl h-10" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-700">Marca / Fabricante</Label>
                        <Input 
                          value={vehicleBrand} 
                          onChange={e => setVehicleBrand(e.target.value)} 
                          placeholder="Ex: Toyota, Honda, VW" 
                          className="bg-white border-sky-200 text-slate-900 text-xs sm:text-sm rounded-xl h-10" 
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-700">Cor do Veículo</Label>
                        <Input 
                          value={vehicleColor} 
                          onChange={e => setVehicleColor(e.target.value)} 
                          placeholder="Ex: Prata, Preto, Branco" 
                          className="bg-white border-sky-200 text-slate-900 text-xs sm:text-sm rounded-xl h-10" 
                        />
                      </div>
                    </div>

                    <span className="text-[11px] text-sky-700 block leading-tight">
                      Sua placa será cadastrada automaticamente no sistema da portaria para entrada liberada na garagem.
                    </span>
                  </div>
                )}
              </div>

              <Button 
                onClick={() => {
                  if (!fullName.trim() || !document.trim()) {
                    alert("Por favor, preencha pelo menos seu Nome Completo e CPF/Passaporte.")
                    return
                  }
                  if (isMinorGuest) {
                    if (!minorKinship) {
                      alert("Por favor, selecione o grau de parentesco do menor acompanhado.")
                      return
                    }
                    if (minorKinship !== "filho" && !minorAuthDocPhoto) {
                      alert("Atenção: Para hóspede menor de idade desacompanhado dos pais, é obrigatório anexar a autorização com firma reconhecida em cartório (Art. 82 do ECA).")
                      return
                    }
                  }
                  setStep(2)
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm h-12 rounded-xl mt-4 gap-2 shadow-md"
              >
                <span>Avançar para Foto do Documento</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* ── Passo 2: Foto do Documento ─────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <span>2. Foto do Documento (RG / CNH / Passaporte)</span>
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Tire uma foto nítida da frente ou verso do seu documento oficial de identificação para validação segura na portaria.
              </p>

              <div className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-2xl p-6 sm:p-8 text-center bg-slate-50/50 relative overflow-hidden transition-colors">
                {docPhoto ? (
                  <div className="space-y-3">
                    <img src={docPhoto} alt="Documento" className="max-h-52 mx-auto rounded-xl object-contain border border-slate-200 shadow-sm bg-white" />
                    <div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setDocPhoto(null)}
                        className="border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-xl"
                      >
                        Trocar Foto do Documento
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 py-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-2xs">
                      {compressing ? <Sparkles className="w-7 h-7 animate-spin text-sky-600" /> : <Camera className="w-7 h-7" />}
                    </div>
                    <span className="font-bold text-sm text-slate-900 mt-1">
                      {compressing ? "Processando imagem..." : "Tirar Foto ou Enviar Arquivo"}
                    </span>
                    <span className="text-xs text-slate-400">Foto nítida da frente ou verso do seu documento</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      onChange={e => handleFileUpload(e, setDocPhoto, "doc")} 
                      className="hidden" 
                      disabled={compressing}
                    />
                  </label>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep(1)} 
                  className="border-slate-200 text-slate-700 font-bold text-xs h-11 rounded-xl bg-white hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button 
                  onClick={() => setStep(3)} 
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm h-11 rounded-xl gap-2 shadow-md"
                >
                  <span>Avançar para Selfie</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Passo 3: Selfie do Hóspede ─────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-sky-600" />
                  <span>3. Biometria Facial (Selfie com Documento Oficial ao Lado)</span>
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Tire uma selfie segurando seu documento oficial (RG ou CNH) ao lado do seu rosto com nitidez. Nossa inteligência artificial fará a conferência visual entre a sua selfie e o documento para sua total segurança.
              </p>

              <div className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-2xl p-6 sm:p-8 text-center bg-slate-50/50 relative overflow-hidden transition-colors">
                {selfiePhoto ? (
                  <div className="space-y-3">
                    <img src={selfiePhoto} alt="Selfie" className="w-40 h-40 rounded-2xl mx-auto object-cover border-4 border-white shadow-md" />
                    <div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setSelfiePhoto(null)}
                        className="border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-xl"
                      >
                        Tirar Outra Selfie
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 py-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-2xs">
                      {compressing ? <Sparkles className="w-7 h-7 animate-spin text-sky-600" /> : <Camera className="w-7 h-7" />}
                    </div>
                    <span className="font-bold text-sm text-slate-900 mt-1">
                      {compressing ? "Processando selfie..." : "Abrir Câmera Frontal"}
                    </span>
                    <span className="text-xs text-slate-400">Segure o documento ao lado do rosto em local bem iluminado</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="user"
                      onChange={e => handleFileUpload(e, setSelfiePhoto, "selfie")} 
                      className="hidden" 
                      disabled={compressing}
                    />
                  </label>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep(2)} 
                  className="border-slate-200 text-slate-700 font-bold text-xs h-11 rounded-xl bg-white hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button 
                  onClick={() => setStep(4)} 
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm h-11 rounded-xl gap-2 shadow-md"
                >
                  <span>Avançar para Assinatura & Termos</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Passo 4: Assinatura Digital & Termos ────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-sky-600" />
                  <span>4. Assinatura Digital do Hóspede</span>
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Assine com o dedo ou mouse no quadro abaixo confirmando a autenticidade dos dados da sua FNHR.
              </p>

              <div className="bg-white rounded-2xl p-2 border border-slate-200 overflow-hidden relative touch-none shadow-inner">
                <canvas 
                  ref={canvasRef}
                  width={340}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-36 cursor-crosshair bg-white"
                />
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="absolute bottom-2 right-2 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg transition-colors"
                >
                  Limpar Assinatura
                </button>
              </div>

              {/* 📜 Aceite Obrigatório dos Termos */}
              <div className="space-y-2.5 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
                <span className="font-bold text-slate-900 text-xs block">
                  Aceite Obrigatório dos Termos de Hospedagem *
                </span>

                <label className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  acceptedHouseRules ? "bg-emerald-50/70 border-emerald-300 text-emerald-900" : "bg-white border-slate-200 hover:border-slate-300"
                }`}>
                  <input 
                    type="checkbox" 
                    checked={acceptedHouseRules} 
                    onChange={e => setAcceptedHouseRules(e.target.checked)}
                    required
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 shrink-0"
                  />
                  <div className="text-xs text-slate-700">
                    <span className="font-bold text-slate-900">1. Regras do Imóvel e Conveniência</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Concordo com horários (14h/12h), condomínio 100% não fumantes, vagas rotativas e normas do Edifício Soho.{" "}
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setTermsModalTab("rules"); setTermsModalOpen(true); }}
                        className="text-sky-600 hover:underline font-bold inline"
                      >
                        [Ler Regras]
                      </button>
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  acceptedContract ? "bg-emerald-50/70 border-emerald-300 text-emerald-900" : "bg-white border-slate-200 hover:border-slate-300"
                }`}>
                  <input 
                    type="checkbox" 
                    checked={acceptedContract} 
                    onChange={e => setAcceptedContract(e.target.checked)}
                    required
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 shrink-0"
                  />
                  <div className="text-xs text-slate-700">
                    <span className="font-bold text-slate-900">2. Termos e Condições Contratuais</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Aceito as cláusulas de locação por temporada autônoma, responsabilidade e políticas de estadia.{" "}
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setTermsModalTab("contract"); setTermsModalOpen(true); }}
                        className="text-indigo-600 hover:underline font-bold inline"
                      >
                        [Ler Contrato]
                      </button>
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep(3)} 
                  className="border-slate-200 text-slate-700 font-bold text-xs h-11 rounded-xl bg-white hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button 
                  disabled={loading || !acceptedHouseRules || !acceptedContract}
                  onClick={handleSubmit} 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm h-11 rounded-xl gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Registrando..." : "Concluir Pré-Check-in"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      {/* Modal: Regras da Casa & Termos Contratuais (Com Abas) */}
      <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-white border border-slate-200 text-slate-900 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="w-5 h-5 text-sky-600" />
              Regras da Casa & Termos Contratuais
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Consulte as regras de convivência do imóvel e as cláusulas contratuais da sua estadia na {brandName}.
            </DialogDescription>
          </DialogHeader>

          {/* Abas de Navegação */}
          <div className="flex gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setTermsModalTab("rules")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                termsModalTab === "rules"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              🏡 1. Regras do Imóvel e Conveniência
            </button>
            <button
              type="button"
              onClick={() => setTermsModalTab("contract")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                termsModalTab === "contract"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              📜 2. Termos e Condições Contratuais
            </button>
          </div>

          <div className="py-3 text-xs leading-relaxed text-slate-700 whitespace-pre-line bg-slate-50 p-4 rounded-2xl border border-slate-200/80 font-sans max-h-96 overflow-y-auto">
            {termsModalTab === "rules" ? (
              settings?.houseRules || "Regras de Convivência:\n• Check-in a partir das 14h / Check-out até 12h.\n• Silêncio após às 22h.\n• Proibido fumar dentro dos apartamentos e nas áreas comuns fechadas.\n• Utilização de vagas demarcadas conforme orientação."
            ) : (
              settings?.contractTerms || "Termos e Condições de Locação por Temporada:\n• A locação tem finalidade estritamente residencial por temporada (Lei 8.245/91).\n• O hóspede se compromete a zelar pelo imóvel e seus equipamentos."
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button 
              type="button" 
              onClick={() => {
                setAcceptedHouseRules(true)
                setAcceptedContract(true)
                setTermsModalOpen(false)
              }} 
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-11 rounded-xl shadow-md"
            >
              ✓ Li e Aceito Ambos os Termos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
