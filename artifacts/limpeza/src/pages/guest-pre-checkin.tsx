import { useState, useEffect, useRef, useMemo } from "react"
import { useRoute, useLocation } from "wouter"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { PdfPreview } from "@/components/pdf-preview"
import { 
  Building2, User, Phone, Mail, Camera, Upload, FileText, CheckCircle2, 
  MapPin, ShieldCheck, ArrowRight, ArrowLeft, PenTool, AlertCircle, AlertTriangle, Zap, Car,
  Printer, Edit3, Share2, Eye, ZoomIn, Download, ExternalLink, MessageCircle, Clock, Calendar, Check, Ban, Lock, Award, KeyRound, Search, RefreshCw, Copy
} from "lucide-react"
import { getCurrentSession, saveSessionLocally } from "@/lib/auth-client"
import { compressImage } from "@/lib/image-compression"
import { isValidBrazilianCpf } from "./agency-guest-credential"

const toDisplayDate = (val?: string | null): string => {
  if (!val) return ""
  const s = String(val).trim()
  if (s.includes("/")) return s
  if (s.includes("-")) {
    const parts = s.substring(0, 10).split("-")
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`
    }
  }
  return s
}

const toIsoDate = (val?: string | null): string => {
  if (!val) return ""
  const s = String(val).trim()
  if (s.includes("-") && s.split("-")[0].length === 4) {
    return s.substring(0, 10)
  }
  if (s.includes("/")) {
    const parts = s.split("/")
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
    }
  }
  return s
}

const isValidBirthDate = (day: number, month: number, year: number): boolean => {
  const currentYear = new Date().getFullYear()
  if (year < 1900 || year > currentYear) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

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

  const isResignParam = useMemo(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      return sp.get("resign") === "1"
    }
    return false
  }, [])

  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get("resign") === "1" && !sp.get("step")) return 3
      const st = parseInt(sp.get("step") || "1", 10)
      if (st >= 1 && st <= 3) return st
    }
    return 1
  })

  // Synchronize browser history and popstate for out-of-order Back button navigation
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search)
        const st = parseInt(sp.get("step") || "1", 10)
        if (st >= 1 && st <= 3) {
          setStep(st)
        }
      }
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href)
        const currentUrlStep = parseInt(url.searchParams.get("step") || "1", 10)
        if (currentUrlStep !== step) {
          url.searchParams.set("step", String(step))
          window.history.pushState({ step }, "", url.toString())
        }
      } catch {}
    }
  }, [step])
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
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(() => {
    if (typeof window !== "undefined") {
      const gParam = new URLSearchParams(window.location.search).get("guest")
      if (gParam) return Number(gParam) || 1
    }
    return 1
  })
  const [completedTimestamp, setCompletedTimestamp] = useState<string | null>(null)
  const [guestCode, setGuestCode] = useState<string>("")
  const [isReturningGuest, setIsReturningGuest] = useState<boolean>(false)

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [document, setDocument] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [birthDateInput, setBirthDateInput] = useState("")
  const datePickerRef = useRef<HTMLInputElement>(null)
  const [gender, setGender] = useState("masculino")
  const [cep, setCep] = useState("")
  const [loadingCep, setLoadingCep] = useState(false)
  const [address, setAddress] = useState("")
  const [street, setStreet] = useState("")
  const [streetNumber, setStreetNumber] = useState("")
  const [complement, setComplement] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const numberInputRef = useRef<HTMLInputElement>(null)
  const [city, setCity] = useState("")
  const [state, setState] = useState("RJ")
  const [transportMethod, setTransportMethod] = useState("")
  // Qualquer opção de carro (inclui o valor legado "carro") habilita o cadastro completo do veículo
  const isCarTransport = ["carro", "Carro próprio", "Carro alugado"].includes(transportMethod)
  const [travelReason, setTravelReason] = useState("")
  const [originCity, setOriginCity] = useState("")
  const [originState, setOriginState] = useState("RJ")
  const [originCountry, setOriginCountry] = useState("Brasil")
  const [destinationCity, setDestinationCity] = useState("Campos dos Goytacazes")
  const [destinationState, setDestinationState] = useState("RJ")
  const [destinationCountry, setDestinationCountry] = useState("Brasil")
  const [optInMarketing, setOptInMarketing] = useState(false)
  const [geolocationData, setGeolocationData] = useState<{
    latitude?: number
    longitude?: number
    accuracy?: number
    status: "granted" | "denied" | "unavailable" | "prompt"
  }>({ status: "prompt" })

  // Photos, Signature, Terms & Vehicle
  const [docPhoto, setDocPhoto] = useState<string | null>(null)
  const [isSavedDocFromProfile, setIsSavedDocFromProfile] = useState(false)
  const [aiInspectingDoc, setAiInspectingDoc] = useState(false)
  const [aiDocResult, setAiDocResult] = useState<{
    isOfficialDocument?: boolean
    documentType?: string
    isLegible?: boolean
    legibilityReason?: string
    isCamposResident?: boolean
    isMinor?: boolean
    calculatedAge?: number | null
    extractedName?: string
    extractedCpf?: string
    extractedCity?: string
    extractedState?: string
    extractedBirthDate?: string
    nameMatches?: boolean | null
    providedNameMatches?: boolean | null
    reservationName?: string
    reservationNameMatches?: boolean | null
    cpfMatches?: boolean | null
    reservationCpfMatches?: boolean | null
    birthDateMatches?: boolean | null
    identityMatches?: boolean
    mismatchReasons?: string[]
    summary?: string
  } | null>(null)
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [acceptedHouseRules, setAcceptedHouseRules] = useState(false)
  const [acceptedContract, setAcceptedContract] = useState(false)
  const [legalDeclarationAccepted, setLegalDeclarationAccepted] = useState(false)
  const [generatedPdfInfo, setGeneratedPdfInfo] = useState<any | null>(null)
  const [tokenInfo, setTokenInfo] = useState<{ valid: boolean, message?: string } | null>(null)
  // Token temporário de assinatura de 2 horas (MP 2.200-2/2001 e Lei 14.063/2020)
  const [signatureToken, setSignatureToken] = useState<string>("")
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)
  const [tokenSecondsRemaining, setTokenSecondsRemaining] = useState<number | null>(null)
  const isTokenSessionExpired = Boolean(
    (tokenSecondsRemaining !== null && tokenSecondsRemaining <= 0) ||
    (tokenInfo && !tokenInfo.valid)
  )
  const [isRefreshingToken, setIsRefreshingToken] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [termsModalTab, setTermsModalTab] = useState<"rules" | "contract">("rules")
  const [settings, setSettings] = useState<any>(null)
  const [siteConfig, setSiteConfig] = useState<any>(null)
  const [checkinProvider, setCheckinProvider] = useState<string>("proprio")
  const [serproPrecheckinUrl, setSerproPrecheckinUrl] = useState<string | null>(null)
  const resolvedSerproUrl = serproPrecheckinUrl || reservation?.serproPrecheckinUrl || reservation?.link_precheckin || null
  const isGovTriagemMode = Boolean(
    (checkinProvider === "gov_fnrh" || settings?.checkinProvider === "gov_fnrh") &&
    resolvedSerproUrl
  )

  // Token OTP via WhatsApp / E-mail (2FA - Duplo Fator de Autenticação)
  const [whatsappOtpInput, setWhatsappOtpInput] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [otpMaskedPhone, setOtpMaskedPhone] = useState("")
  const [otpMaskedEmail, setOtpMaskedEmail] = useState("")
  const [otpChannel, setOtpChannel] = useState<"whatsapp" | "email">("whatsapp")
  const [otpVerified, setOtpVerified] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpSuccessMessage, setOtpSuccessMessage] = useState<string | null>(null)

  // Veículo para Garagem & Previsão de Chegada (ETA)
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleColor, setVehicleColor] = useState("")
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState("")

  // Cálculo de idade e detecção de menor de idade (ECA Art. 82)
  const calculatedAge = useMemo(() => {
    if (!birthDate) return null
    let y: number, m: number, d: number
    if (birthDate.includes("-")) {
      const parts = birthDate.split("-")
      if (parts.length < 3) return null
      y = parseInt(parts[0], 10)
      m = parseInt(parts[1], 10) - 1
      d = parseInt(parts[2], 10)
    } else if (birthDate.includes("/")) {
      const parts = birthDate.split("/")
      if (parts.length < 3) return null
      d = parseInt(parts[0], 10)
      m = parseInt(parts[1], 10) - 1
      y = parseInt(parts[2], 10)
    } else {
      return null
    }
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null
    const bDate = new Date(y, m, d)
    const now = new Date()
    let age = now.getFullYear() - bDate.getFullYear()
    const monthDiff = now.getMonth() - bDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bDate.getDate())) {
      age--
    }
    return age >= 0 ? age : null
  }, [birthDate])

  const isMinorGuest = calculatedAge !== null && calculatedAge < 18

  const handleBirthDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8)
    let masked = raw
    if (raw.length > 2 && raw.length <= 4) {
      masked = `${raw.slice(0, 2)}/${raw.slice(2)}`
    } else if (raw.length > 4) {
      masked = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4, 8)}`
    }
    setBirthDateInput(masked)

    if (raw.length === 8) {
      const day = parseInt(raw.slice(0, 2), 10)
      const month = parseInt(raw.slice(2, 4), 10)
      const year = parseInt(raw.slice(4, 8), 10)
      if (isValidBirthDate(day, month, year)) {
        const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        setBirthDate(iso)
      } else {
        setBirthDate("")
      }
    } else {
      setBirthDate("")
    }
  }

  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value
    setBirthDate(iso)
    if (iso) {
      setBirthDateInput(toDisplayDate(iso))
    } else {
      setBirthDateInput("")
    }
  }

  // Temporizador regressivo de reenvio do OTP (60s)
  useEffect(() => {
    if (otpCooldown > 0) {
      const timer = setTimeout(() => setOtpCooldown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [otpCooldown])

  const handleSendOtp = async (channel: "whatsapp" | "email" = "whatsapp", forceNew = false) => {
    setOtpLoading(true)
    setOtpError(null)
    setOtpSuccessMessage(null)
    try {
      const isTitular = selectedGuestIndex === 1
      const targetPhone = phone || (isTitular ? reservation?.guestPhone : "") || ""
      const targetEmail = email || (isTitular ? reservation?.guestEmail : "") || ""

      if (channel === "whatsapp" && !targetPhone) {
        setOtpError(
          isTitular 
            ? "Telefone não informado para envio via WhatsApp."
            : "Telefone do acompanhante não informado. Por favor, volte ao Passo 1 e preencha seu celular com DDD."
        )
        setOtpLoading(false)
        return
      }
      if (channel === "email" && !targetEmail) {
        setOtpError("E-mail não informado para envio.")
        setOtpLoading(false)
        return
      }

      const resCode = code || reservation?.code
      const res = await fetch(`/api/pms/pre-checkin/${resCode}/whatsapp-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestIndex: selectedGuestIndex,
          phone: targetPhone,
          email: targetEmail,
          fullName,
          channel,
          forceNew
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setOtpSent(true)
        setOtpChannel(channel)
        setOtpCooldown(data.cooldownSeconds || 60)
        if (data.maskedPhone) setOtpMaskedPhone(data.maskedPhone)
        if (data.maskedEmail) setOtpMaskedEmail(data.maskedEmail)
        setOtpSuccessMessage(data.message || (channel === "whatsapp" ? "Código enviado no WhatsApp!" : "Código enviado por e-mail!"))
      } else {
        if (data.cooldownRemaining) {
          setOtpCooldown(data.cooldownRemaining)
        }
        setOtpError(data.error || "Não foi possível enviar o código agora.")
      }
    } catch (err: any) {
      setOtpError("Erro de conexão ao solicitar código de confirmação.")
    } finally {
      setOtpLoading(false)
    }
  }

  // Disparo automático do código OTP no WhatsApp ao chegar no Passo 3 (Assinatura)
  useEffect(() => {
    if (isGovTriagemMode || isReadOnlyDocument || isCompleted || !isEditing || !reservation) return
    const resStatus = String(reservation?.status || "").toLowerCase()
    if (resStatus === "completed" || resStatus === "cancelada" || resStatus === "cancelled" || reservation?.checkoutDone) return
    if (reservation?.checkoutDate) {
      const todayBrasilia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
      if (String(reservation.checkoutDate).slice(0, 10) < todayBrasilia) return
    }
    const isTitular = selectedGuestIndex === 1
    const targetPhone = phone || (isTitular ? reservation?.guestPhone : "")
    if (step === 3 && !otpSent && targetPhone && !isTokenSessionExpired) {
      handleSendOtp("whatsapp")
    }
  }, [step, otpSent, phone, selectedGuestIndex, reservation, isTokenSessionExpired, isGovTriagemMode, isReadOnlyDocument, isCompleted, isEditing])

  // Canvas for signature

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeolocationData({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            status: "granted"
          })
        },
        (err) => {
          setGeolocationData({
            status: err.code === 1 ? "denied" : "unavailable"
          })
        },
        { timeout: 8000, maximumAge: 60000 }
      )
    }
  }, [])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const syncAddress = (st: string, num: string, comp: string, neigh: string) => {
    const parts: string[] = []
    const cleanSt = st.trim()
    const cleanNum = num.trim()
    const cleanComp = comp.trim()
    const cleanNeigh = neigh.trim()

    let line1 = cleanSt
    if (cleanNum) {
      line1 = line1 ? `${line1}, ${cleanNum}` : cleanNum
    }
    if (cleanComp) {
      line1 = line1 ? `${line1} - ${cleanComp}` : cleanComp
    }
    if (line1) parts.push(line1)
    if (cleanNeigh) parts.push(cleanNeigh)

    const finalAddr = parts.join(" - ")
    setAddress(finalAddr)
    return finalAddr
  }

  const formatCep = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8)
    if (digits.length > 5) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`
    }
    return digits
  }

  const handleLookupPreCheckinCep = async (val: string) => {
    const clean = val.replace(/\D/g, "")
    if (clean.length === 8) {
      setLoadingCep(true)
      try {
        const res = await fetch(`/api/lookup-cep/${clean}`)
        if (res.ok) {
          const data = await res.json()
          const logradouro = data.logradouro || ""
          const bairro = data.bairro || ""
          const cidade = data.cidade || ""
          const uf = data.uf || ""

          if (logradouro) setStreet(logradouro)
          if (bairro) setNeighborhood(bairro)
          if (cidade && uf) {
            setCity(`${cidade} / ${uf}`)
            setState(uf)
          }
          syncAddress(logradouro, streetNumber, complement, bairro)
          setTimeout(() => {
            numberInputRef.current?.focus()
          }, 150)
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

  const navigateToPortal = () => {
    const targetCode = reservation?.code || code
    if (!targetCode) {
      setLocation("/minha-reserva")
      return
    }
    const gParam = selectedGuestIndex > 1 ? `?guest=${selectedGuestIndex}` : ""
    try {
      sessionStorage.setItem(`cf_active_guest_${targetCode}`, String(selectedGuestIndex))
      localStorage.setItem(`cf_active_guest_${targetCode}`, String(selectedGuestIndex))
      if (fullName) localStorage.setItem("corpflats_guest_name", fullName)
    } catch {}
    setLocation(`/minha-reserva/${targetCode}${gParam}`)
  }

  const getTitularData = () => {
    const titularGuest = (guestList || []).find((g: any) => Number(g.index) === 1)
    const res = reservation || {}
    const guestObj = (res as any)?.guest || {}
    return {
      cep: titularGuest?.cep || res.guestCep || guestObj.cep || "",
      street: titularGuest?.street || res.guestStreet || res.guestAddress || guestObj.street || guestObj.address || "",
      streetNumber: titularGuest?.streetNumber || res.guestStreetNumber || titularGuest?.number || guestObj.streetNumber || "",
      complement: titularGuest?.complement || res.guestComplement || guestObj.complement || "",
      neighborhood: titularGuest?.neighborhood || res.guestNeighborhood || titularGuest?.bairro || guestObj.neighborhood || "",
      city: titularGuest?.city || res.guestCity || guestObj.city || "",
      state: titularGuest?.state || res.guestState || guestObj.state || "RJ",
      address: titularGuest?.address || res.guestAddress || guestObj.address || "",
      vehicle: titularGuest?.vehicle || res.vehicle || guestObj.vehicle || (guestObj.vehiclePlate ? {
        plate: guestObj.vehiclePlate,
        brand: guestObj.vehicleBrand || "",
        model: guestObj.vehicleModel || "",
        color: guestObj.vehicleColor || ""
      } : null),
      transportMethod: titularGuest?.transportMethod || res.transportMethod || guestObj.transportMethod || "Carro próprio",
      travelReason: titularGuest?.travelReason || res.travelReason || guestObj.travelReason || "Lazer / Férias",
      originCity: titularGuest?.originCity || res.originCity || guestObj.originCity || "",
      originState: titularGuest?.originState || res.originState || guestObj.originState || "RJ",
      destinationCity: titularGuest?.destinationCity || res.destinationCity || guestObj.destinationCity || "Campos dos Goytacazes",
      destinationState: titularGuest?.destinationState || res.destinationState || guestObj.destinationState || "RJ"
    }
  }

  const handleCopyTitularAddress = () => {
    const tit = getTitularData()
    if (tit.cep) setCep(tit.cep)
    if (tit.street) setStreet(tit.street)
    if (tit.streetNumber) setStreetNumber(tit.streetNumber)
    if (tit.complement) setComplement(tit.complement)
    if (tit.neighborhood) setNeighborhood(tit.neighborhood)
    if (tit.city) setCity(tit.city)
    if (tit.state) setState(tit.state)
    if (tit.address) {
      setAddress(tit.address)
    } else if (tit.street) {
      syncAddress(tit.street, tit.streetNumber, tit.complement, tit.neighborhood)
    }
  }

  const handleCopyTitularVehicle = () => {
    const tit = getTitularData()
    if (tit.transportMethod) setTransportMethod(tit.transportMethod)
    if (tit.vehicle) {
      setVehiclePlate(tit.vehicle.plate || "")
      setVehicleModel(tit.vehicle.model || "")
      setVehicleBrand(tit.vehicle.brand || "")
      setVehicleColor(tit.vehicle.color || "")
    }
    if (tit.originCity) setOriginCity(tit.originCity)
    if (tit.originState) setOriginState(tit.originState)
    if (tit.destinationCity) setDestinationCity(tit.destinationCity)
    if (tit.destinationState) setDestinationState(tit.destinationState)
    if (tit.travelReason) setTravelReason(tit.travelReason)
  }

  const loadGuestData = (resData: any, gIdx: number) => {
    const gList = resData.guests || []
    setGuestList(gList)
    const currentG = gList.find((g: any) => g.index === gIdx) || gList[0]
    const res = resData.reservation || {}
    const guest = resData.guest || {}

    // Limpeza completa para evitar vazamento de estado entre hóspedes
    setDocPhoto(null)
    setIsSavedDocFromProfile(false)
    setAiDocResult(null)
    setSelfiePhoto(null)
    setSignatureData(null)
    setGeneratedPdfInfo(null)
    setMinorAuthDocPhoto(null)
    setMinorKinship("filho")

    // Isolamento estrito de 2FA / OTP entre titular e acompanhantes
    setWhatsappOtpInput("")
    setOtpSent(false)
    setOtpLoading(false)
    setOtpCooldown(0)
    setOtpMaskedPhone("")
    setOtpMaskedEmail("")
    setOtpVerified(false)
    setOtpError(null)
    setOtpSuccessMessage(null)

    const isTitular = gIdx === 1

    const gCode = currentG?.guestCode || (isTitular ? (res.guestCode || guest.guestCode || "") : "")
    setGuestCode(gCode)

    const gName = currentG?.name && !currentG.name.startsWith("Hóspede")
      ? currentG.name
      : (isTitular ? (res.guestName || guest.fullName || guest.name || "") : "")

    const gPhone = currentG?.phone
      ? currentG.phone
      : (isTitular ? (res.guestPhone || guest.phone || "") : "")

    const gEmail = currentG?.email
      ? currentG.email
      : (isTitular ? (res.guestEmail || guest.email || "") : "")

    const gDoc = currentG?.cpf || currentG?.document
      ? (currentG.cpf || currentG.document)
      : (isTitular ? (res.guestDocument || res.document || guest.document || guest.documentNumber || "") : "")

    setFullName(gName)
    setPhone(gPhone)
    setEmail(gEmail)
    setDocument(gDoc)

    try {
      const activeCode = res.code || code
      if (activeCode && gIdx) {
        sessionStorage.setItem(`cf_active_guest_${activeCode}`, String(gIdx))
        localStorage.setItem(`cf_active_guest_${activeCode}`, String(gIdx))
        if (gName) localStorage.setItem("corpflats_guest_name", gName)
      }
    } catch {}

    const rawBirth = currentG?.birthDate || (isTitular ? (guest.birthDate || res.birthDate || "") : "")
    setBirthDate(toIsoDate(rawBirth))
    setBirthDateInput(toDisplayDate(rawBirth))
    setGender(currentG?.gender || (isTitular ? (guest.gender || res.gender || "masculino") : "masculino"))
    const rawAddress = currentG?.address || (isTitular ? (guest.address || res.guestAddress || "") : "")
    setAddress(rawAddress)
    setStreet(currentG?.street || (isTitular ? (guest.street || res.guestStreet || "") : "") || rawAddress || "")
    setStreetNumber(currentG?.streetNumber || (isTitular ? (guest.streetNumber || res.guestStreetNumber || "") : "") || currentG?.number || "")
    setComplement(currentG?.complement || (isTitular ? (guest.complement || res.guestComplement || "") : "") || "")
    setNeighborhood(currentG?.neighborhood || (isTitular ? (guest.neighborhood || res.guestNeighborhood || "") : "") || currentG?.bairro || "")
    setCity(currentG?.city || (isTitular ? (guest.city || res.guestCity || "") : ""))
    setState(currentG?.state || (isTitular ? (guest.state || res.guestState || "RJ") : "RJ"))
    setCep(currentG?.cep || (isTitular ? (guest.cep || res.guestCep || "") : ""))

    // Dados da Viagem MTur (isolamento estrito: acompanhante não herda dados de estadia do titular automaticamente)
    const travelReasonVal = currentG?.travelReason || (isTitular ? (guest.travelReason || res.travelReason || "") : "")
    setTravelReason(travelReasonVal || "")

    const transportVal = currentG?.transportMethod || (isTitular ? (guest.transportMethod || res.transportMethod || "") : "")
    setTransportMethod(transportVal || "")

    const etaVal = currentG?.estimatedArrivalTime || res.estimatedArrivalTime || ""
    setEstimatedArrivalTime(etaVal || "")

    const originCityVal = currentG?.originCity || (isTitular ? (guest.originCity || res.originCity || "") : "")
    setOriginCity(originCityVal || "")

    const originStateVal = currentG?.originState || (isTitular ? (guest.originState || res.originState || "RJ") : "RJ")
    setOriginState(originStateVal || "RJ")

    const destCityVal = currentG?.destinationCity || (isTitular ? (guest.destinationCity || res.destinationCity || "") : "")
    setDestinationCity(destCityVal || "")

    const destStateVal = currentG?.destinationState || (isTitular ? (guest.destinationState || res.destinationState || "RJ") : "RJ")
    setDestinationState(destStateVal || "RJ")

    setMinorKinship(currentG?.minorKinship || "filho")
    setMinorAuthDocPhoto(currentG?.minorAuthDocUrl || null)

    // Isolamento estrito de veículo: titular lê da reserva; acompanhante lê SOMENTE de currentG.vehicle
    const v = isTitular 
      ? (res.vehicle || guest.vehicle || (guest.vehiclePlate ? {
          plate: guest.vehiclePlate,
          brand: guest.vehicleBrand || "",
          model: guest.vehicleModel || "",
          color: guest.vehicleColor || ""
        } : null))
      : (currentG?.vehicle || null)

    if (v && v.plate) {
      setVehiclePlate(v.plate)
      setVehicleModel(v.model || "")
      setVehicleBrand(v.brand || "")
      setVehicleColor(v.color || "")
      if (!transportVal) {
        setTransportMethod(prev => (prev === "Carro próprio" || prev === "Carro alugado") ? prev : "Carro próprio")
      }
    } else {
      setVehiclePlate("")
      setVehicleModel("")
      setVehicleBrand("")
      setVehicleColor("")
    }

    // Isolamento estrito de fotos e biometria:
    // Hóspede 1: pode ler do cadastro titular
    // Hóspede 2+: lê SOMENTE de currentG (NUNCA herda fotos do hóspede 1!)
    let selfie = currentG?.selfieUrl || (isTitular ? (res.selfieUrl || guest.photoUrl || null) : null)
    let doc = currentG?.docPhotoUrl || (isTitular ? (res.docPhotoUrl || res.documentPhotoUrl || guest.docPhotoUrl || guest.documentPhotoUrl || null) : null)

    if (!doc && isTitular && typeof window !== "undefined") {
      try {
        const rawProf = localStorage.getItem("corpflats_guest_profile")
        if (rawProf) {
          const prof = JSON.parse(rawProf)
          const profCpf = String(prof?.document || "").replace(/\D/g, "")
          const resCpf = String(gDoc || "").replace(/\D/g, "")
          const profEmail = String(prof?.email || "").trim().toLowerCase()
          const resEmail = String(gEmail || "").trim().toLowerCase()
          const profPhone = String(prof?.phone || "").replace(/\D/g, "")
          const resPhone = String(gPhone || "").replace(/\D/g, "")
          const profName = String(prof?.name || prof?.fullName || "").trim().toLowerCase()
          const resName = String(gName || "").trim().toLowerCase()
          const isSamePersonCache = Boolean(
            (profCpf.length >= 8 && resCpf.length >= 8 && profCpf === resCpf) ||
            (profEmail.includes("@") && resEmail.includes("@") && profEmail === resEmail) ||
            (profPhone.length >= 8 && resPhone.length >= 8 && profPhone === resPhone) ||
            (profName.length >= 5 && resName.length >= 5 && profName === resName)
          )
          if (isSamePersonCache && prof?.docPhotoUrl) {
            doc = prof.docPhotoUrl
          }
          if (isSamePersonCache && !selfie && prof?.photoUrl) {
            selfie = prof.photoUrl
          }
        }
      } catch {}
    }

    // Sincronização direta com perfil permanente do hóspede autenticado (somente se for a mesma pessoa da reserva)
    if (isTitular) {
      getCurrentSession().then((sessionUser) => {
        if (!sessionUser) return
        const sessCpf = String(sessionUser.document || "").replace(/\D/g, "")
        const resCpf = String(gDoc || "").replace(/\D/g, "")
        const sessEmail = String(sessionUser.email || "").trim().toLowerCase()
        const resEmail = String(gEmail || "").trim().toLowerCase()
        const sessPhone = String(sessionUser.phone || "").replace(/\D/g, "")
        const resPhone = String(gPhone || "").replace(/\D/g, "")
        const sessName = String(sessionUser.name || sessionUser.fullName || "").trim().toLowerCase()
        const resName = String(gName || "").trim().toLowerCase()
        const isGenericResName = !resName || /^h[oó]spede\s*\d*$/i.test(resName)
        const isSameSess = Boolean(
          (sessCpf.length >= 8 && resCpf.length >= 8 && sessCpf === resCpf) ||
          (sessEmail.includes("@") && resEmail.includes("@") && sessEmail === resEmail) ||
          (sessPhone.length >= 8 && resPhone.length >= 8 && sessPhone === resPhone) ||
          (sessName.length >= 5 && resName.length >= 5 && sessName === resName) ||
          (!resCpf && !resEmail && !resPhone && isGenericResName)
        )
        if (!isSameSess) return

        if (!gName && sessionUser.name) setFullName(sessionUser.name)
        if (!gEmail && sessionUser.email) setEmail(sessionUser.email)
        if (!gPhone && sessionUser.phone) setPhone(sessionUser.phone)
        if (!gDoc && sessionUser.document) setDocument(sessionUser.document)
        if (!currentG?.birthDate && !guest.birthDate && !res.birthDate && sessionUser.birthDate) {
          setBirthDate(toIsoDate(sessionUser.birthDate))
          setBirthDateInput(toDisplayDate(sessionUser.birthDate))
        }
        if (!currentG?.address && !guest.address && !res.guestAddress && sessionUser.address) {
          setAddress(sessionUser.address)
          setStreet(sessionUser.street || sessionUser.address)
          if (sessionUser.streetNumber) setStreetNumber(sessionUser.streetNumber)
          if (sessionUser.complement) setComplement(sessionUser.complement)
          if (sessionUser.neighborhood) setNeighborhood(sessionUser.neighborhood)
        }
        if (!currentG?.city && !guest.city && !res.guestCity && sessionUser.city) {
          setCity(sessionUser.city)
        }
        if (!currentG?.state && !guest.state && !res.guestState && sessionUser.state) {
          setState(sessionUser.state)
        }
        const sessCleanCep = String(sessionUser.cep || "").replace(/\D/g, "")
        if (!currentG?.cep && !guest.cep && !res.guestCep && !res.cep && sessCleanCep && sessCleanCep !== "28035000") {
          setCep(sessionUser.cep)
        }
        if (sessionUser.vehicle?.plate && !v?.plate) {
          setVehiclePlate(sessionUser.vehicle.plate)
          setVehicleModel(sessionUser.vehicle.model || "")
          setVehicleBrand(sessionUser.vehicle.brand || "")
          setVehicleColor(sessionUser.vehicle.color || "")
          setTransportMethod(prev => (prev === "Carro próprio" || prev === "Carro alugado") ? prev : "Carro próprio")
        }
        if (!doc && sessionUser.docPhotoUrl) {
          setDocPhoto(sessionUser.docPhotoUrl)
          setIsSavedDocFromProfile(true)
        }
        if (!selfie && sessionUser.photoUrl) {
          setSelfiePhoto(sessionUser.photoUrl)
        }
      }).catch(() => {})
    }

    // Avaliação estritamente individual da necessidade de re-assinatura
    const isGuestPendingReSign = currentG?.needsReSignature !== undefined
      ? Boolean(currentG.needsReSignature)
      : (Boolean(res.needsReSignature) && !currentG?.hasCompletedCheckin)

    const isReSignatureNeeded = isGuestPendingReSign
    const sig = isReSignatureNeeded ? null : (currentG?.signatureUrl || (isTitular ? res.signatureUrl : null))

    setSelfiePhoto(selfie || null)
    setDocPhoto(doc || null)
    setIsSavedDocFromProfile(Boolean(doc))
    setSignatureData(sig || null)

    // O Hóspede só é considerado concluído se ELE MESMO (currentG) tiver check-in feito nesta reserva e não precisar re-assinar!
    const fnhrDone = Boolean(
      !isReSignatureNeeded && (
        currentG?.hasCompletedCheckin ||
        currentG?.status === "CHECKED_IN" ||
        Boolean(currentG?.fnrhSignedAt) ||
        Boolean(currentG?.fnrhDocumentUuid) ||
        (isTitular && (res.fnhrCompleted || res.preCheckinCompleted) && (sig || res.signatureUrl || res.fnrhDocumentUuid) && selfie)
      )
    )

    // Detecção de cadastro prévio / hóspede frequente salvo
    const hasPreviousProfile = Boolean(
      (isTitular && (guest.fnhrCompleted || guest.id)) ||
      (doc && gName && gDoc) ||
      currentG?.hasCompletedCheckin
    )
    setIsReturningGuest(hasPreviousProfile)

    if (currentG?.checkinCompletedAt || (isTitular && res.updatedAt)) {
      setCompletedTimestamp(currentG?.checkinCompletedAt || res.updatedAt)
    } else {
      setCompletedTimestamp(null)
    }

    if (isReadOnlyDocument) {
      setIsCompleted(true)
      setIsEditing(false)
      setStep(1)
    } else if (isReSignatureNeeded) {
      setIsCompleted(false)
      setIsEditing(true)
      // Fast-track: se já possui os dados cadastrais preservados e não há ?step= na URL, direciona diretamente para o Passo 3 (Assinatura)
      const hasBaseData = Boolean(gName && gDoc && gPhone)
      if (hasBaseData && !new URLSearchParams(window.location.search).get("step")) {
        setStep(3)
      } else {
        setStep(1)
      }
    } else {
      setIsCompleted(fnhrDone)
      setIsEditing(!fnhrDone)
      setStep(1)
      if (fnhrDone && typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href)
          if (url.searchParams.has("resign") || url.searchParams.get("step") === "3") {
            url.searchParams.delete("resign")
            url.searchParams.delete("step")
            window.history.replaceState({}, "", url.toString())
          }
        } catch {}
      }
    }
  }

  useEffect(() => {
    if (code) {
      const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()
      const queryToken = sp.get("token") || ""
      const url = `/api/pms/pre-checkin/${code}${queryToken ? `?token=${encodeURIComponent(queryToken)}` : ""}`
      if (queryToken) {
        setSignatureToken(queryToken)
      }
      fetch(url)
        .then(r => r.json())
        .then(data => {
          if (data.tokenStatus) {
            setTokenInfo(data.tokenStatus)
            if (data.tokenStatus.valid && data.tokenStatus.expiresAt) {
              setTokenExpiresAt(data.tokenStatus.expiresAt)
              const diff = Math.floor((new Date(data.tokenStatus.expiresAt).getTime() - Date.now()) / 1000)
              setTokenSecondsRemaining(diff > 0 ? diff : 0)
            } else if (!data.tokenStatus.valid) {
              setTokenSecondsRemaining(0)
            }
          }
          if (data.checkinProvider) {
            setCheckinProvider(data.checkinProvider)
          }
          if (data.serproPrecheckinUrl) {
            setSerproPrecheckinUrl(data.serproPrecheckinUrl)
          }
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

  // Temporizador regressivo da sessão de assinatura (2 horas)
  useEffect(() => {
    if (!tokenExpiresAt) return

    const tick = () => {
      const diff = Math.floor((new Date(tokenExpiresAt).getTime() - Date.now()) / 1000)
      if (diff <= 0) {
        setTokenSecondsRemaining(0)
        setTokenInfo({ valid: false, message: "Sua sessão de assinatura de 2 horas expirou por motivos de segurança jurídica." })
      } else {
        setTokenSecondsRemaining(diff)
      }
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [tokenExpiresAt])

  // Função para garantir ou renovar o token temporário de 2 horas
  const ensureOrRefreshToken = async (forceNew = false) => {
    const activeCode = code || reservation?.code
    if (!activeCode) return null

    if (!forceNew && signatureToken && tokenExpiresAt) {
      const diff = Math.floor((new Date(tokenExpiresAt).getTime() - Date.now()) / 1000)
      if (diff > 60) {
        return signatureToken
      }
    }

    setIsRefreshingToken(true)
    try {
      const res = await fetch(`/api/pms/pre-checkin/${activeCode}/signature-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestIndex: selectedGuestIndex,
          phone,
          email
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.token) {
          setSignatureToken(data.token)
          setTokenExpiresAt(data.expiresAt)
          setTokenInfo({ valid: true })
          const diff = Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
          setTokenSecondsRemaining(diff > 0 ? diff : 7200)

          if (typeof window !== "undefined") {
            const currentUrl = new URL(window.location.href)
            currentUrl.searchParams.set("token", data.token)
            window.history.replaceState(null, "", currentUrl.toString())
          }
          return data.token
        }
      }
    } catch (err) {
      console.warn("Erro ao gerar/renovar token de assinatura:", err)
    } finally {
      setIsRefreshingToken(false)
    }
    return null
  }

  // Ao entrar no Passo 3, se não houver token ativo ou se expirado, assegura novo token de 2h
  useEffect(() => {
    if (step === 3 && !isCompleted) {
      if (!signatureToken || (tokenSecondsRemaining !== null && tokenSecondsRemaining <= 0)) {
        ensureOrRefreshToken()
      }
    }
  }, [step, isCompleted])

  const formatRemainingTime = (totalSeconds: number | null) => {
    if (totalSeconds === null) return "--:--"
    if (totalSeconds <= 0) return "00:00 (Expirado)"
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
    }
    return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
  }

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      const url = window.location.href
      navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 3000)
    }
  }

  // Branding & Contacts
  const brandName = siteConfig?.branding?.brandName && !siteConfig.branding.brandName.includes("Macaé") 
    ? siteConfig.branding.brandName 
    : "CorpFlats"
  const whatsappNumber = siteConfig?.branding?.whatsapp || settings?.adminWhatsApp || "5522997124021"
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Olá! Gostaria de ajuda com o pré-check-in digital${reservation?.code ? ` da reserva ${reservation.code}` : ''}.`)}`

  // Signature canvas handlers
  const isDrawingRef = useRef(false)
  const startDrawing = (e: any) => {
    setIsDrawing(true)
    isDrawingRef.current = true
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
    if (!isDrawing && !isDrawingRef.current) return
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
    isDrawingRef.current = false
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

  const runAiDocInspection = async (base64String: string, fileNameStr: string) => {
    setAiInspectingDoc(true)
    try {
      const currentGuestSlot = (guestList || []).find((g: any) => Number(g.index) === Number(selectedGuestIndex))
      const expectedResName = selectedGuestIndex === 1
        ? (reservation?.guestName || currentGuestSlot?.name || "")
        : (currentGuestSlot?.name && !String(currentGuestSlot.name).startsWith("Hóspede") ? currentGuestSlot.name : "")
      const expectedResCpf = selectedGuestIndex === 1
        ? (reservation?.guestDocument || currentGuestSlot?.cpf || currentGuestSlot?.document || "")
        : (currentGuestSlot?.cpf || currentGuestSlot?.document || "")

      const res = await fetch("/api/ai/inspect-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64String,
          fileName: fileNameStr,
          providedName: fullName,
          providedCpf: document,
          reservationName: expectedResName,
          reservationCpf: expectedResCpf,
          guestIndex: selectedGuestIndex,
          providedCity: city,
          providedAddress: address,
          providedBirthDate: birthDate,
          providedOriginCity: originCity,
          providedOriginState: originState,
          providedState: state,
          providedCep: cep,
          originCity,
          originState,
          state,
          cep
        })
      })
      if (res.ok) {
        const data = await res.json()
        setAiDocResult(data)
        if (data.isCamposResident) {
          if (!city || city.trim() === "") setCity("Campos dos Goytacazes")
          if (!originCity || originCity.trim() === "" || originCity === "Não informada") setOriginCity("Campos dos Goytacazes")
          if (!state || state.trim() === "") setState("RJ")
          if (!originState || originState.trim() === "") setOriginState("RJ")
        } else if (data.extractedCity && (!city || city.trim() === "")) {
          setCity(data.extractedCity)
        }
        if (data.extractedName && (!fullName || fullName.trim() === "" || fullName.startsWith("Hóspede"))) {
          setFullName(data.extractedName)
        }
        if (data.extractedCpf && (!document || document.trim() === "")) {
          setDocument(data.extractedCpf)
        }
        if (data.extractedBirthDate && (!birthDate || birthDate.trim() === "")) {
          setBirthDate(toIsoDate(data.extractedBirthDate))
          setBirthDateInput(toDisplayDate(data.extractedBirthDate))
        }
      }
    } catch (err) {
      console.warn("Falha ao analisar documento com IA:", err)
    } finally {
      setAiInspectingDoc(false)
    }
  }

  // Disparo automático da inspeção do documento ao navegar para a etapa de documento se a foto já existir
  useEffect(() => {
    if (step === 2 && docPhoto && !aiDocResult && !aiInspectingDoc) {
      runAiDocInspection(docPhoto, "documento_hospede")
    }
  }, [step, docPhoto, aiDocResult, aiInspectingDoc])

  // Handle file uploads with automatic client-side WebP compression
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    setter: (val: string) => void,
    type: "doc" | "selfie" | "auth"
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limite estrito de 5 MB
    if (file.size > 5 * 1024 * 1024) {
      alert("O arquivo selecionado possui " + (file.size / (1024 * 1024)).toFixed(1) + " MB e excede o limite máximo permitido de 5 MB. Por favor, envie um arquivo de até 5 MB.")
      return
    }

    if (type === "doc") {
      setIsSavedDocFromProfile(false)
      setAiDocResult(null)
    }

    setCompressing(true)
    let payloadBase64 = ""
    try {
      const isPdfFile = file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")
      if (isPdfFile) {
        const reader = new FileReader()
        reader.onload = async () => {
          let b64 = reader.result as string
          if (b64.startsWith("data:application/octet-stream;base64,")) {
            b64 = b64.replace("data:application/octet-stream;base64,", "data:application/pdf;base64,")
          }
          setter(b64)
          setCompressing(false)
          if (type === "doc") {
            await runAiDocInspection(b64, file.name)
          }
        }
        reader.readAsDataURL(file)
        return
      } else {
        const result = await compressImage(file, {
          maxWidth: 1400,
          maxHeight: 1400,
          quality: 0.8,
          preferredFormat: "image/webp"
        })
        payloadBase64 = result.base64
        setter(payloadBase64)
      }
    } catch (err) {
      console.warn("Erro ao processar imagem, usando fallback FileReader:", err)
      const reader = new FileReader()
      reader.onload = async () => {
        const b64 = reader.result as string
        setter(b64)
        if (type === "doc") {
          await runAiDocInspection(b64, file.name)
        }
      }
      reader.readAsDataURL(file)
      return
    } finally {
      setCompressing(false)
    }

    if (type === "doc" && payloadBase64) {
      await runAiDocInspection(payloadBase64, file.name)
    }
  }

  const handleSubmit = async () => {
    if (!isGovTriagemMode && otpSent && whatsappOtpInput.trim().length !== 6) {
      alert("Por favor, informe o código de 6 dígitos recebido no seu WhatsApp para confirmar a assinatura.")
      return
    }
    setLoading(true)
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 25000)

    try {
      const cleanPlate = isCarTransport ? vehiclePlate.trim().toUpperCase() : ""
      const cleanBrand = isCarTransport ? vehicleBrand.trim() : ""
      const cleanModel = isCarTransport ? vehicleModel.trim() : ""
      const cleanColor = isCarTransport ? vehicleColor.trim() : ""

      const currentGuestItem = guestList.find((g: any) => g.index === selectedGuestIndex) || guestList[selectedGuestIndex - 1]
      const isReSignatureNeeded = currentGuestItem?.needsReSignature !== undefined
        ? Boolean(currentGuestItem.needsReSignature)
        : (Boolean(reservation?.needsReSignature) && !currentGuestItem?.hasCompletedCheckin)

      const res = await fetch("/api/pms/pre-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          code: code || reservation?.code,
          reservationId: reservation?.id,
          guestIndex: selectedGuestIndex,
          token: signatureToken || (typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("token") || "") : ""),
          whatsappOtp: whatsappOtpInput.trim(),
          govTriagemMode: isGovTriagemMode,
          resign: isReSignatureNeeded ? "1" : undefined,
          isReSignature: isReSignatureNeeded,
          fullName,
          phone,
          email,
          document,
          birthDate,
          gender,
          cep,
          address,
          street,
          streetNumber,
          complement,
          neighborhood,
          city,
          state,
          transportMethod: transportMethod || "Carro próprio",
          travelReason: travelReason || "Lazer / Férias",
          originCity: originCity || "Não informada",
          originState: originState || "RJ",
          originCountry: originCountry || "Brasil",
          destinationCity: destinationCity || "Campos dos Goytacazes",
          destinationState: destinationState || "RJ",
          destinationCountry: destinationCountry || "Brasil",
          optInMarketing,
          legalDeclarationAccepted,
          geolocation: geolocationData,
          clientTimezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Sao_Paulo",
          clientLocalTime: new Date().toISOString(),
          selfieBase64: selfiePhoto,
          docPhotoBase64: docPhoto,
          signatureBase64: signatureData,
          legalTermsAccepted: legalDeclarationAccepted || acceptedHouseRules,
          isMinor: calculatedAge !== null && calculatedAge < 18,
          minorAge: calculatedAge,
          minorKinship: (calculatedAge !== null && calculatedAge < 18) ? minorKinship : null,
          minorAuthDocBase64: (calculatedAge !== null && calculatedAge < 18 && minorKinship !== "filho") ? minorAuthDocPhoto : null,
          aiDocResult: aiDocResult || null,
          isCamposResident: (() => {
            const isCamposCityStr = (s?: string) => {
              if (!s) return false
              const l = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\/\s*[a-z]{2}\s*$/, "").trim()
              if (!l) return false
              if (
                l.includes("sao jose dos campos") ||
                l.includes("campos do jordao") ||
                l.includes("campos novos") ||
                l.includes("campos belos") ||
                l.includes("campos altos") ||
                l.includes("campos gerais") ||
                l.includes("campos sales") ||
                l.includes("campos lindos") ||
                l.includes("siqueira campos")
              ) return false
              return (
                l.includes("goytacazes") ||
                l.includes("goitacazes") ||
                l === "campos" ||
                l === "campos rj" ||
                l === "campos-rj" ||
                /^campos\s*[-/,]\s*rj$/.test(l) ||
                l.startsWith("campos dos goytacazes") ||
                l.startsWith("campos dos goitacazes")
              )
            }
            const cleanSubCep = String(cep || "").replace(/\D/g, "")
            const isValidCamposCep = (cleanSubCep.startsWith("280") || cleanSubCep.startsWith("281")) && cleanSubCep !== "28035000"
            const hasExplicitOtherCity = Boolean(city && city.trim() !== "" && !isCamposCityStr(city) && !isCamposCityStr(originCity))
            return Boolean(
              aiDocResult?.isCamposResident ||
              isCamposCityStr(city) ||
              isCamposCityStr(originCity) ||
              (!hasExplicitOtherCity && (
                (address && (address.toLowerCase().includes("goytacazes") || address.toLowerCase().includes("goitacazes"))) ||
                isValidCamposCep
              ))
            )
          })(),
          vehiclePlate: cleanPlate,
          vehicleBrand: cleanBrand,
          vehicleModel: cleanModel,
          vehicleColor: cleanColor,
          estimatedArrivalTime: estimatedArrivalTime || undefined
        })
      })

      // Se informou carro, garante registro na autorização de portaria e garagem
      if (isCarTransport && cleanPlate) {
        const resCode = code || reservation?.code
        if (resCode) {
          fetch(`/api/pms/reservations/${resCode}/vehicle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plate: cleanPlate,
              brand: cleanBrand,
              model: cleanModel,
              color: cleanColor
            })
          }).catch(() => {})
        }
      }

      let resData: any = null
      try {
        resData = await res.json()
      } catch (parseErr) {
        if (!res.ok) {
          throw new Error(`Falha no servidor (HTTP ${res.status}). Por favor, tente novamente.`)
        }
      }

      if (res.ok && resData) {
        // Atualiza perfil permanente local em cache para sincronização imediata (incluindo documento e foto para próximos check-ins)
        try {
          if (typeof window !== "undefined" && selectedGuestIndex === 1) {
            const rawProfile = localStorage.getItem("corpflats_guest_profile")
            const currentProf = rawProfile ? JSON.parse(rawProfile) : {}
            saveSessionLocally({
              ...currentProf,
              id: currentProf.id || resData.guest?.guestCode || resData.reservation?.id,
              name: fullName || currentProf.name,
              email: email || currentProf.email,
              phone: phone || currentProf.phone,
              document: document || currentProf.document,
              birthDate: birthDate || currentProf.birthDate,
              address: address || currentProf.address,
              street: street || currentProf.street,
              streetNumber: streetNumber || currentProf.streetNumber,
              complement: complement || currentProf.complement,
              neighborhood: neighborhood || currentProf.neighborhood,
              city: city || currentProf.city,
              state: state || currentProf.state,
              cep: cep || currentProf.cep,
              docPhotoUrl: resData.guest?.docPhotoUrl || resData.reservation?.docPhotoUrl || docPhoto || currentProf.docPhotoUrl || null,
              photoUrl: resData.guest?.photoUrl || resData.reservation?.selfieUrl || selfiePhoto || currentProf.photoUrl || null,
              vehicle: cleanPlate ? {
                plate: cleanPlate,
                brand: cleanBrand,
                model: cleanModel,
                color: cleanColor
              } : currentProf.vehicle
            })
          }
        } catch {}
        try {
          const activeCode = resData.reservation?.code || code
          if (activeCode && selectedGuestIndex) {
            sessionStorage.setItem(`cf_active_guest_${activeCode}`, String(selectedGuestIndex))
            localStorage.setItem(`cf_active_guest_${activeCode}`, String(selectedGuestIndex))
            if (fullName) localStorage.setItem("corpflats_guest_name", fullName)
          }
        } catch {}
        if (resData.fnrhDocument) {
          setGeneratedPdfInfo(resData.fnrhDocument)
        }
        if (resData.reservation) {
          setReservation(resData.reservation)
          if (Array.isArray(resData.reservation.guests) && resData.reservation.guests.length > 0) {
            setGuestList(resData.reservation.guests)
          }
        }
        if (resData.guest?.guestCode) {
          setGuestCode(resData.guest.guestCode)
        } else if (resData.reservation?.guestCode) {
          setGuestCode(resData.reservation.guestCode)
        }
        if (resData.serproPrecheckinUrl) {
          setSerproPrecheckinUrl(resData.serproPrecheckinUrl)
        }
        if (resData.checkinProvider) {
          setCheckinProvider(resData.checkinProvider)
        }
        setIsCompleted(true)
        setIsEditing(false)
        setSuccess(true)

        const targetGovUrl = resData.serproPrecheckinUrl || resolvedSerproUrl
        if (isGovTriagemMode && targetGovUrl && typeof window !== "undefined") {
          try {
            const win = window.open(targetGovUrl, "_blank")
            if (!win) {
              setTimeout(() => {
                window.location.href = targetGovUrl
              }, 1200)
            }
          } catch {}
        } else if (isReSignatureNeeded || resData.wasReSignature) {
          // Fast-track: Redireciona com confirmação de sucesso de volta ao Portal do Hóspede
          const targetCode = resData.reservation?.code || reservation?.code || code
          setTimeout(() => {
            setLocation(`/minha-reserva/${encodeURIComponent(targetCode)}?resign_success=1${selectedGuestIndex > 1 ? `&guest=${selectedGuestIndex}` : ""}`)
          }, 1500)
        }
      } else {
        alert(resData?.error || "Erro ao registrar check-in. Por favor, tente novamente.")
      }
    } catch (err: any) {
      console.error("[Check-in Digital Error]", err)
      if (err.name === "AbortError") {
        alert("O envio demorou mais que o esperado devido à conexão. Por favor, clique novamente em Concluir Check-in.")
      } else {
        alert(err.message || "Erro de conexão ao registrar check-in. Por favor, verifique sua internet e tente novamente.")
      }
    } finally {
      clearTimeout(timeoutId)
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
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            <div 
              onClick={() => setLocation("/reservar")}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0 flex-1"
            >
              {siteConfig?.branding?.logoImage ? (
                <img 
                  src={siteConfig.branding.logoImage} 
                  alt={brandName} 
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl shrink-0"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm group-hover:bg-slate-800 transition-colors shrink-0">
                  CF
                </div>
              )}
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors block leading-none truncate">
                {brandName}
              </span>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp</span>
            </a>
          </div>
        </nav>

        {/* Hero Banner */}
        <header className="relative min-h-[160px] sm:min-h-[190px] flex items-center justify-center px-4 sm:px-8 pt-5 pb-10 sm:pt-7 sm:pb-12 text-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
              alt="Pré-Check-in CorpFlats"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/50 to-black/60" />
          </div>

          <div className="relative z-10 max-w-xl mx-auto space-y-1.5 text-white">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-900/75 backdrop-blur-md border border-white/25 text-[11px] font-semibold tracking-wide text-white/95 mb-1 shadow-xs max-w-full">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              <span className="leading-snug">Ficha Nacional de Registro de Hóspedes (FNRH)</span>
            </div>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md text-white">
              Check-in Digital
            </h1>
            <p className="text-xs sm:text-sm font-normal text-white/90 drop-shadow-sm tracking-normal">
              Localize sua reserva e confirme seus dados cadastrais para liberação de acesso
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
  // MODO 0.5: PRÉ-RESERVA AGUARDANDO PAGAMENTO (CHECK-IN DIGITAL BLOQUEADO)
  // ══════════════════════════════════════════════════════════════════════════════
  const isPreReservationBlocked = useMemo(() => {
    if (!reservation) return false
    const chan = String(reservation.channel || "").toLowerCase()
    const isOtaChan = chan.includes("booking") || chan.includes("airbnb") || chan.includes("b2b") || Boolean(reservation.agencyId || reservation.b2bReservationNumber)
    if (isOtaChan) return false
    const st = String(reservation.status || "").toLowerCase()
    if (st === "pre_reserva" || st === "pendente") return true
    return false
  }, [reservation])

  if (reservation && isPreReservationBlocked) {
    const portalPath = `/minha-reserva/${encodeURIComponent(reservation.code || code)}`
    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs w-full max-w-full">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            <div
              onClick={() => setLocation(portalPath)}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0 flex-1"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm shrink-0">
                CF
              </div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 block leading-none truncate">
                {brandName}
              </span>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp</span>
            </a>
          </div>
        </nav>

        <main className="max-w-lg w-full mx-auto px-4 py-10 sm:py-16 space-y-4">
          <Card className="bg-white border-2 border-amber-200 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-2xs">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <Badge className="bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs px-3 py-1">
                ⏳ Pré-Reserva • Aguardando Pagamento
              </Badge>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Check-in Digital Aguardando Confirmação
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Olá, <strong>{reservation.guestName || "Hóspede"}</strong>! Sua reserva <strong>{reservation.code}</strong> encontra-se atualmente como <strong>Pré-Reserva</strong>.
              </p>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                O preenchimento do <strong>Check-in Digital (FNRH)</strong> e o envio da autorização de entrada para a <strong>recepção/portaria 24h</strong> são liberados automaticamente assim que o pagamento for confirmado.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-left text-xs text-amber-950 space-y-1.5">
              <span className="font-bold block">Como confirmar sua reserva agora:</span>
              <p className="leading-relaxed text-amber-900">
                Acesse o Portal da sua Reserva abaixo para concluir o pagamento via <strong>PIX com baixa imediata</strong> ou <strong>Cartão de Crédito</strong>. Assim que quitada, o check-in digital será desbloqueado na mesma hora!
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <Button
                type="button"
                onClick={() => setLocation(portalPath)}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md gap-2"
              >
                <span>Ir para Minha Reserva & Efetuar Pagamento</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full h-10 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Já paguei / Falar com o Atendimento</span>
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
    const isCurrentTitular = selectedGuestIndex === 1
    const currentGuestRecord = guestList.find((g: any) => Number(g.index) === Number(selectedGuestIndex)) || guestList[selectedGuestIndex - 1] || (isCurrentTitular ? guestList[0] : {}) || {}
    const targetUuid = generatedPdfInfo?.documentUuid || currentGuestRecord?.fnrhDocumentUuid || (isCurrentTitular ? reservation?.fnrhDocumentUuid : "")
    const resCodeParam = encodeURIComponent(reservation?.code || code || "")

    let targetViewUrl = generatedPdfInfo?.fileUrl || currentGuestRecord?.fnrhPdfUrl || (isCurrentTitular ? reservation?.fnrhPdfUrl : "") || ""
    if (targetViewUrl) {
      if (!targetViewUrl.includes("code=")) {
        targetViewUrl += (targetViewUrl.includes("?") ? "&" : "?") + `code=${resCodeParam}`
      }
    } else if (targetUuid) {
      targetViewUrl = `/api/pms/fnrh/${targetUuid}/view?code=${resCodeParam}`
    }

    let targetDownloadUrl = generatedPdfInfo?.downloadUrl || currentGuestRecord?.fnrhDownloadUrl || (isCurrentTitular ? reservation?.fnrhDownloadUrl : "") || ""
    if (targetDownloadUrl) {
      if (!targetDownloadUrl.includes("code=")) {
        targetDownloadUrl += (targetDownloadUrl.includes("?") ? "&" : "?") + `code=${resCodeParam}`
      }
    } else if (targetUuid) {
      targetDownloadUrl = `/api/pms/fnrh/${targetUuid}/download?code=${resCodeParam}`
    } else if (targetViewUrl) {
      targetDownloadUrl = targetViewUrl.replace("/view", "/download")
    }

    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
        {/* Top Navigation Bar */}
        <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-8 py-2.5 sm:py-3 shadow-2xs w-full max-w-full print:hidden">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            <div 
              onClick={navigateToPortal}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0 flex-1"
            >
              {siteConfig?.branding?.logoImage ? (
                <img 
                  src={siteConfig.branding.logoImage} 
                  alt={brandName} 
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl shrink-0"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm group-hover:bg-slate-800 transition-colors shrink-0">
                  CF
                </div>
              )}
              <div className="min-w-0">
                <span className="font-bold text-sm sm:text-lg tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors block leading-none truncate">
                  {brandName}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block mt-0.5 leading-tight">
                  Check-in Digital Registrado • <span className="whitespace-nowrap font-mono">Apt {reservation?.flatNumber}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {reservation?.code && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={navigateToPortal}
                  className="h-8 sm:h-9 px-2 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Portal do Hóspede</span>
                </Button>
              )}

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <header className="relative min-h-[140px] sm:min-h-[170px] flex items-center justify-center px-4 sm:px-8 pt-5 pb-10 sm:pt-7 sm:pb-12 text-center overflow-hidden print:hidden">
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
              alt="Pré-Check-in CorpFlats"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/50 to-black/60" />
          </div>

          <div className="relative z-10 max-w-xl mx-auto space-y-1.5 text-white">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/85 border border-emerald-400/50 text-[11px] font-semibold tracking-wide text-emerald-100 mb-1 shadow-xs max-w-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span className="leading-snug">Check-in Digital Concluído & Autenticado</span>
            </div>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md text-white leading-tight">
              Ficha de Hospedagem <span className="whitespace-nowrap">(Check-in Digital)</span>
            </h1>
            <p className="text-xs sm:text-sm font-normal text-white/95 drop-shadow-sm">
              Apartamento {reservation?.flatNumber} • Edifício Soho Residence Service
            </p>
          </div>
        </header>

        {/* Main Certificate Container */}
        <main className="max-w-3xl w-full mx-auto px-4 -mt-6 sm:-mt-8 z-20 space-y-4 sm:space-y-5 pb-20">
          {isGovTriagemMode && resolvedSerproUrl && (
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white rounded-2xl border-2 border-emerald-400/60 shadow-lg space-y-3 print:hidden">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <Badge className="bg-emerald-400/20 text-emerald-200 border border-emerald-400/40 text-[10px] font-bold">
                    ✓ Etapa 1 Concluída (Portaria Soho & Garagem)
                  </Badge>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    Etapa 2 Obrigatória: Finalizar FNRH Digital no Portal Gov.br
                  </h3>
                  <p className="text-xs text-emerald-100/90 leading-relaxed">
                    Seus dados de acesso ao condomínio e veículo já foram liberados para a recepção. Agora clique abaixo para assinar a Ficha Oficial do Ministério do Turismo com sua conta Gov.br:
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => window.open(resolvedSerproUrl, "_blank")}
                  className="w-full sm:w-auto bg-white hover:bg-emerald-50 text-emerald-950 font-black text-xs sm:text-sm h-11 px-5 rounded-xl shadow-md gap-2 shrink-0"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Acessar FNRH Oficial no Gov.br</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
              </div>
            </div>
          )}

          {/* Top Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white border border-slate-200/80 p-3 sm:p-4 rounded-2xl shadow-sm print:hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-2.5 sm:px-3 flex items-center gap-1.5 shadow-none">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Documento Registrado</span>
              </Badge>
              {(guestCode || reservation?.guestCode) && (
                <Badge className="bg-sky-50 text-sky-800 border-sky-200 text-xs font-mono font-bold py-1 px-2.5 flex items-center gap-1 shadow-none">
                  <Award className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>{guestCode || reservation?.guestCode}</span>
                </Badge>
              )}
              {isReadOnlyDocument && (
                <Badge className="bg-slate-900 text-white border-slate-900 text-xs font-bold py-1 px-2.5 sm:px-3 flex items-center gap-1.5 shadow-xs whitespace-normal h-auto">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Documento Oficial Imutável</span>
                </Badge>
              )}
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                Reserva <strong className="text-slate-900 font-mono">#{reservation?.code || code}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-stretch gap-2 w-full sm:w-auto">
              {targetDownloadUrl && (
                <Button
                  size="sm"
                  onClick={() => window.open(targetDownloadUrl, "_blank")}
                  className="flex-1 basis-[130px] sm:basis-auto sm:flex-initial h-auto min-h-9 py-2 px-3 whitespace-normal text-center leading-tight text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold gap-1.5 rounded-xl shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Baixar PDF Assinado</span>
                </Button>
              )}

              {targetUuid && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/verificar-ficha/${targetUuid}`, "_blank")}
                  className="flex-1 basis-[130px] sm:basis-auto sm:flex-initial h-auto min-h-9 py-2 px-3 whitespace-normal text-center leading-tight text-xs bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100 font-bold gap-1.5 rounded-xl shadow-2xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Selo de Autenticidade (QR Code)</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="flex-1 basis-[110px] sm:basis-auto sm:flex-initial h-auto min-h-9 py-2 px-3 text-xs bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-bold gap-1.5 rounded-xl shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Imprimir</span>
              </Button>

              {!isReadOnlyDocument && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 basis-[120px] sm:basis-auto sm:flex-initial h-auto min-h-9 py-2 px-3 whitespace-normal text-center leading-tight text-xs bg-amber-50/70 border-amber-200 hover:bg-amber-100/70 text-amber-800 font-bold gap-1.5 rounded-xl shadow-2xs"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Editar Dados</span>
                </Button>
              )}

              <Button
                size="sm"
                onClick={() => {
                  const phoneClean = (phone || reservation?.guestPhone || "").replace(/\D/g, "")
                  const url = window.location.href
                  const msg = encodeURIComponent(
                    `Olá, ${fullName}! 🏨 Sua Ficha Digital de Hospedagem do Apt ${reservation?.flatNumber} está confirmada e assinada:\n${url}`
                  )
                  window.open(phoneClean ? `https://wa.me/55${phoneClean}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank")
                }}
                className="flex-1 basis-[130px] sm:basis-auto sm:flex-initial h-auto min-h-9 py-2 px-3 whitespace-normal text-center leading-tight text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 rounded-xl shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Compartilhar WhatsApp</span>
              </Button>
            </div>
          </div>

          {/* Multi-Guest Selector (se houver mais de 1 pessoa) */}
          {guestList.length > 1 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm space-y-2 print:hidden">
              <span className="text-[11px] uppercase font-bold text-slate-500 block tracking-wider">
                Hóspedes Cadastrados na Reserva ({guestList.length} Pessoas):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {guestList.map((g: any) => {
                  const isCurrent = selectedGuestIndex === g.index
                  const gNeedsReSign = Boolean(g.needsReSignature)
                  const gDone = !gNeedsReSign && Boolean(g.hasCompletedCheckin)
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
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between gap-2 border cursor-pointer min-w-0 ${
                        isCurrent
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : gNeedsReSign
                          ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                          : gDone
                          ? "bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="break-words leading-tight min-w-0">{g.name || `Hóspede ${g.index}`}</span>
                      {gNeedsReSign ? (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ml-1 ${
                          isCurrent ? "bg-amber-400 text-amber-950 font-black" : "bg-amber-100 text-amber-900 border border-amber-300"
                        }`}>
                          ⚠️ Re-assinar
                        </span>
                      ) : gDone ? (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ml-1 ${
                          isCurrent ? "bg-emerald-500/30 text-emerald-100" : "bg-emerald-100 text-emerald-800"
                        }`}>
                          ✓ Assinado
                        </span>
                      ) : (
                        <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ml-1 ${
                          isCurrent ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-600"
                        }`}>
                          Pendente
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {guestList.some((g: any) => Boolean(g.needsReSignature)) && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-1.5 print:hidden animate-in fade-in">
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Reserva Atualizada • Assinatura de Acompanhante Pendente</span>
                  </span>
                  <p className="text-xs text-amber-900 leading-snug">
                    Esta ficha já foi assinada. Para liberação na portaria, o(s) acompanhante(s) abaixo ainda precisa(m) assinar a declaração atualizada:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {guestList.filter((g: any) => Boolean(g.needsReSignature)).map((pg: any) => (
                      <Button
                        key={pg.index}
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedGuestIndex(pg.index)
                          setStep(1)
                          if (reservation) {
                            loadGuestData({ reservation, guests: guestList }, pg.index)
                          }
                        }}
                        className="w-full sm:w-auto max-w-full whitespace-normal h-auto min-h-9 py-2 px-3 text-left leading-snug bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">Assinar por {pg.name || `Hóspede ${pg.index}`}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {!guestList.some((g: any) => Boolean(g.needsReSignature)) && guestList.some((g: any) => !g.hasCompletedCheckin) && (
                <div className="p-3.5 rounded-xl bg-sky-50/90 border border-sky-200 space-y-1.5 print:hidden animate-in fade-in">
                  <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>O seu check-in já está concluído e assinado!</span>
                  </span>
                  <p className="text-xs text-sky-900 leading-snug">
                    Caso deseje preencher agora os dados do(s) acompanhante(s) pendente(s), selecione abaixo:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {guestList.filter((g: any) => !g.hasCompletedCheckin).map((pg: any) => (
                      <Button
                        key={pg.index}
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedGuestIndex(pg.index)
                          setStep(1)
                          if (reservation) {
                            loadGuestData({ reservation, guests: guestList }, pg.index)
                          }
                        }}
                        className="w-full sm:w-auto max-w-full whitespace-normal h-auto min-h-9 py-2 px-3 text-left leading-snug bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">Preencher Check-in de {pg.name || `Hóspede ${pg.index}`}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Visualizador Oficial do PDF da Ficha Assinada */}
          {targetViewUrl && (
            <Card className="bg-white border border-slate-200/80 text-slate-900 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
                    PDF
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
                      Ficha de Hospedagem <span className="whitespace-nowrap">(Check-in Digital)</span>
                    </h2>
                    <span className="text-[11px] text-emerald-600 font-bold uppercase tracking-wider block">
                      Documento Oficial Registrado • Studio Apt {reservation?.flatNumber}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    onClick={() => window.open(targetDownloadUrl, "_blank")}
                    className="flex-1 sm:flex-initial h-9 text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold gap-1.5 rounded-xl shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Baixar PDF</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(targetViewUrl, "_blank")}
                    className="flex-1 sm:flex-initial h-9 text-xs bg-white border-slate-200 hover:bg-slate-50 text-slate-700 font-bold gap-1.5 rounded-xl shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Nova Aba</span>
                  </Button>
                </div>
              </div>

              {/* Preview do PDF renderizado via PDF.js (iframe de PDF não funciona em navegadores mobile) */}
              <PdfPreview url={targetViewUrl} title="Ficha de Hospedagem (Check-in Digital)" />

              <div className="text-center pt-2 text-[11px] text-slate-400 border-t border-slate-100">
                {brandName} • Edifício Soho Residence Service • Centro, Campos dos Goytacazes - RJ
              </div>
            </Card>
          )}

          {/* Resumo Cadastral */}
          <details className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-8 shadow-sm space-y-6 text-slate-900 group" open={!targetViewUrl}>
            <summary className="font-bold text-slate-800 cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <span className="flex items-center gap-2 text-sm sm:text-base">
                <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Resumo dos Dados Cadastrais Digitados</span>
              </span>
              <span className="text-xs text-sky-600 font-bold bg-sky-50 px-2.5 py-1 rounded-lg">
                {targetViewUrl ? "Alternar Visualização" : "Dados Registrados"}
              </span>
            </summary>
            <div className="mt-4 space-y-6">
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

              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 gap-y-1">
                <span>Apartamento: <strong className="text-slate-900 font-bold">Studio Apt {reservation?.flatNumber}</strong></span>
                <span>Localizador: <strong className="text-sky-600 font-mono font-bold">{reservation?.code || code}</strong></span>
                {(guestCode || reservation?.guestCode) && (
                  <span>Cadastro CorpFlats: <strong className="text-emerald-700 font-mono font-bold">{guestCode || reservation?.guestCode}</strong></span>
                )}
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
                {(guestCode || reservation?.guestCode) && (
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Código do Hóspede</span>
                    <span className="font-bold text-sky-700 font-mono text-sm">{guestCode || reservation?.guestCode}</span>
                  </div>
                )}
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
                  <span className="font-medium text-slate-700">{toDisplayDate(birthDate) || "Não informada"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Gênero</span>
                  <span className="font-medium text-slate-700 capitalize">{gender || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">CEP</span>
                  <span className="font-semibold text-slate-800 font-mono">{cep ? formatCep(cep) : "Não informado"}</span>
                </div>
                <div className="sm:col-span-3 pt-2 border-t border-slate-200/60">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Endereço Residencial</span>
                  <span className="font-medium text-slate-800">
                    {(() => {
                      const cleanCity = String(city || "").replace(/\s*\/\s*[A-Za-z]{2}\s*$/, "").trim()
                      const cleanState = String(state || "RJ").trim().toUpperCase()
                      const formattedCep = cep ? formatCep(cep) : ""
                      if (!address) return `Campos dos Goytacazes - RJ${formattedCep ? ` • CEP ${formattedCep}` : ""}`
                      return `${address}${cleanCity ? ` • ${cleanCity} - ${cleanState}` : ""}${formattedCep ? ` • CEP ${formattedCep}` : ""}`
                    })()}
                  </span>
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
                        {vehicleColor ? `Cor: ${vehicleColor} • ` : ""}Estacionamento Rotativo no Soho (Gratuito)
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
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-sky-600 shrink-0" />
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
            </div>
          </details>
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
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-8 py-2.5 sm:py-3 shadow-2xs w-full max-w-full">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div 
            onClick={navigateToPortal}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0 flex-1"
          >
            {siteConfig?.branding?.logoImage ? (
              <img 
                src={siteConfig.branding.logoImage} 
                alt={brandName} 
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl shrink-0"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shadow-sm group-hover:bg-slate-800 transition-colors shrink-0">
                CF
              </div>
            )}
            <div className="min-w-0">
              <span className="font-bold text-sm sm:text-lg tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors block leading-none truncate">
                {brandName}
              </span>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5 leading-tight">
                {reservation?.flatNumber ? (
                  <>
                    <span className="font-mono whitespace-nowrap">Flat {reservation.flatNumber}</span> • <span className="whitespace-nowrap">Pré-Check-in Digital</span>
                  </>
                ) : (
                  "Pré-Check-in Digital"
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {reservation?.code && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={navigateToPortal}
                className="h-8 sm:h-9 px-2 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Portal do Hóspede</span>
              </Button>
            )}

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-colors shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative min-h-[160px] sm:min-h-[190px] flex items-center justify-center px-4 sm:px-8 pt-5 pb-10 sm:pt-7 sm:pb-12 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
            alt="Pré-Check-in CorpFlats"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/50 to-black/60" />
        </div>

        <div className="relative z-10 max-w-xl mx-auto space-y-1.5 text-white">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/75 backdrop-blur-md border border-white/25 text-[11px] font-semibold tracking-wide text-white/95 mb-1 shadow-xs max-w-full">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <span className="leading-snug">Ficha de Hospedagem (FNRH)</span>
          </div>
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold tracking-tight drop-shadow-md text-white">
            Check-in Digital
          </h1>
          <p className="text-xs sm:text-sm font-normal text-white/95 drop-shadow-sm tracking-normal">
            Confirme seus dados cadastrais e assine para liberação do acesso
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

            {/* Dados da Reserva (Somente Leitura) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Acomodação</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 block">Flat {reservation.flatNumber || reservation.flatId}</span>
                <span className="text-[9px] text-slate-400">Soho Residence</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Check-in</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 block">{reservation.checkinDate || "-"}</span>
                <span className="text-[9px] text-emerald-600 font-medium">a partir das {reservation.checkinTime || "14:00"}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Check-out</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 block">{reservation.checkoutDate || "-"}</span>
                <span className="text-[9px] text-amber-700 font-medium">até as {reservation.checkoutTime || "12:00"}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Hóspedes</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 block">{reservation.guestCount || reservation.adults || 1} Pessoa(s)</span>
                <span className="text-[9px] text-sky-600 font-medium">{reservation.channel || "Reserva Confirmada"}</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
              Confirme seus dados cadastrais obrigatórios pela legislação brasileira para agilizar a liberação das chaves e autorização na portaria do condomínio.
            </p>
          </Card>
        )}

        {/* Banner de Re-assinatura: Individualizado por Hóspede Selecionado */}
        {(() => {
          const currentG = guestList.find((g: any) => g.index === selectedGuestIndex) || guestList[selectedGuestIndex - 1]
          const isCurrentPendingReSign = currentG?.needsReSignature !== undefined
            ? Boolean(currentG.needsReSignature)
            : (Boolean(reservation?.needsReSignature) && !currentG?.hasCompletedCheckin)
          const otherPending = guestList.filter((g: any) => g.index !== selectedGuestIndex && Boolean(g.needsReSignature))

          if (isCurrentPendingReSign) {
            return (
              <div className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2.5 shadow-sm animate-in fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 rounded-2xl text-xs font-bold max-w-full">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="leading-snug break-words">Reserva Atualizada • Nova Assinatura Obrigatória para {currentG?.name || `Hóspede ${selectedGuestIndex}`}</span>
                  </div>
                  {step < 3 && (
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="text-xs font-bold text-amber-900 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Ir direto para assinatura (Passo 3)</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-bold text-amber-950">
                  {reservation?.reSignatureReason || "Sua reserva teve as datas ou acomodação alteradas. É obrigatório assinar a declaração atualizada para liberar o acesso ao condomínio."}
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  ⚡ <strong>Fluxo Expresso:</strong> Todos os seus dados cadastrais (Nome, CPF, Telefone, Endereço e Foto do Documento) foram preservados com segurança. Confira os novos dados do flat e período acima e assine ao final para confirmar sua nova Ficha de Hospedagem.
                </p>
              </div>
            )
          }

          if (currentG?.hasCompletedCheckin && !isCurrentPendingReSign && otherPending.length > 0) {
            return (
              <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 rounded-2xl space-y-2 shadow-sm animate-in fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold max-w-full">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="leading-snug break-words">Assinatura de {currentG?.name || `Hóspede ${selectedGuestIndex}`} Atualizada com Sucesso!</span>
                  </div>
                </div>
                <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                  A declaração deste hóspede já foi assinada e atualizada. Para concluir a autorização na portaria, preencha o check-in de:{" "}
                  <strong>{otherPending.map((g: any) => g.name || `Hóspede ${g.index}`).join(", ")}</strong>.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {otherPending.map((og: any) => (
                    <Button
                      key={og.index}
                      type="button"
                      size="sm"
                      onClick={() => {
                        setSelectedGuestIndex(og.index)
                        setStep(1)
                        if (reservation) {
                          loadGuestData({ reservation, guests: guestList }, og.index)
                        }
                      }}
                      className="w-full sm:w-auto max-w-full whitespace-normal h-auto min-h-9 py-2 px-3 text-left leading-snug bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold gap-1.5 rounded-xl shadow-xs cursor-pointer"
                    >
                      <PenTool className="w-3.5 h-3.5 shrink-0" />
                      <span className="break-words">Assinar por {og.name || `Hóspede ${og.index}`}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )
          }

          return null
        })()}

        {/* Alerta de Token Expirado (Link de 2 horas) com Botão de Renovação */}
        {tokenInfo && !tokenInfo.valid && (
          <div className="p-4 sm:p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl text-center space-y-2.5 shadow-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-bold">
              <Clock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Link Temporário de Assinatura Expirado</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-rose-950">
              {tokenInfo.message || "Sua sessão de assinatura expirou (validade máxima de 2 horas)."}
            </h3>
            <p className="text-xs text-rose-700 max-w-md mx-auto leading-relaxed">
              Por motivos de conformidade jurídica e segurança (MP 2.200-2/2001 e Lei 14.063/2020), o link expira após 2 horas. Fique tranquilo: você pode renovar sua sessão agora com 1 clique e manter todos os seus dados e fotos intactos!
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                onClick={() => ensureOrRefreshToken(true)}
                disabled={isRefreshingToken}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold gap-1.5 rounded-xl h-auto min-h-10 py-2 px-4 whitespace-normal shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshingToken ? 'animate-spin' : ''}`} />
                <span>{isRefreshingToken ? "Renovando Sessão..." : "🔄 Renovar Link Agora (+2 Horas)"}</span>
              </Button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs h-10"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Falar no WhatsApp</span>
              </a>
            </div>
          </div>
        )}

        {/* Multi-Guest Selector (se a reserva for para mais de 1 pessoa) */}
        {guestList.length > 1 && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-xs space-y-2">
            <span className="text-[11px] uppercase font-bold text-slate-500 block tracking-wider">
              Selecione o Hóspede para Preenchimento ({guestList.length} Pessoas):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {guestList.map((g: any) => {
                const isCurrent = selectedGuestIndex === g.index
                const gNeedsReSign = Boolean(g.needsReSignature)
                const gDone = !gNeedsReSign && Boolean(g.hasCompletedCheckin)
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
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between gap-2 border cursor-pointer min-w-0 ${
                      isCurrent
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : gNeedsReSign
                        ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                        : gDone
                        ? "bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="break-words leading-tight min-w-0">{g.name || `Hóspede ${g.index}`}</span>
                    {gNeedsReSign ? (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ml-1 ${
                        isCurrent ? "bg-amber-400 text-amber-950 font-black" : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}>
                        ⚠️ Re-assinar
                      </span>
                    ) : gDone ? (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ml-1 ${
                        isCurrent ? "bg-emerald-500/30 text-emerald-100" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        ✓ Assinado
                      </span>
                    ) : (
                      <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ml-1 ${
                        isCurrent ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-600"
                      }`}>
                        Pendente
                      </span>
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
              { num: 3, label: "Assinatura" }
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
                {idx < 2 && (
                  <div className={`w-12 sm:w-24 h-1 rounded-full -mt-4 ${step > s.num ? "bg-emerald-600" : "bg-slate-100"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <Card className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-7 shadow-xl">
          {/* ── Passo 1: Dados Pessoais & Endereço ────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>{isGovTriagemMode ? "1. Triagem Rápida da Portaria Soho & Garagem" : "1. Dados Cadastrais do Hóspede"}</span>
                </h3>
                {(guestCode || reservation?.guestCode) && (
                  <Badge className="bg-slate-100 text-slate-800 border-slate-200 text-[10px] font-mono font-bold">
                    {guestCode || reservation?.guestCode}
                  </Badge>
                )}
              </div>

              {isGovTriagemMode && (
                <div className="p-3.5 sm:p-4 bg-emerald-50/90 border border-emerald-300 rounded-2xl space-y-1.5 text-emerald-950 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Modo Check-in Oficial Gov.br Ativo (Fluxo Simplificado)</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Aqui você preenche <strong>apenas os dados operacionais para liberação na portaria 24h do Edifício Soho e da garagem</strong> (nome, CPF, veículo e foto do documento). Os dados de endereço e viagem serão validados diretamente com sua conta <strong>Gov.br</strong> no final.
                  </p>
                </div>
              )}

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
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <Label className="text-xs font-bold text-slate-700">Data de Nascimento *</Label>
                      <span className="text-[10px] text-slate-400 font-medium">Digite ou use o calendário</span>
                    </div>
                    <div className="relative flex items-center">
                      <Input 
                        type="text" 
                        inputMode="numeric"
                        placeholder="DD/MM/AAAA"
                        value={birthDateInput} 
                        onChange={handleBirthDateInputChange} 
                        maxLength={10}
                        required 
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-semibold rounded-xl h-11 pr-11 focus-visible:ring-sky-500 font-mono" 
                      />
                      <div className="absolute right-1 top-1 bottom-1 flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              datePickerRef.current?.showPicker?.()
                            } catch {
                              datePickerRef.current?.focus()
                            }
                          }}
                          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                          title="Abrir calendário"
                          aria-label="Abrir calendário"
                        >
                          <Calendar className="w-4 h-4 pointer-events-none text-sky-600" />
                          <input 
                            ref={datePickerRef}
                            type="date" 
                            value={birthDate || ""} 
                            onChange={handleNativeDateChange} 
                            max={new Date().toISOString().split("T")[0]}
                            min="1900-01-01"
                            tabIndex={-1}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                            title="Selecionar data no calendário"
                            aria-label="Selecionar data no calendário"
                          />
                        </button>
                      </div>
                    </div>
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
                          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                            <span className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              Autorização de cartório anexada com sucesso
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setMinorAuthDocPhoto(null)}
                              className="text-[11px] h-7 px-2.5 border-rose-300 text-rose-800 hover:bg-rose-100 font-bold rounded-lg shrink-0"
                            >
                              Trocar Foto
                            </Button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="cursor-pointer flex items-center justify-center gap-2 p-3 border-2 border-dashed border-rose-300 hover:border-rose-500 rounded-xl bg-rose-50/70 text-rose-900 text-xs font-bold transition-colors">
                              <Upload className="w-4 h-4 shrink-0" />
                              <span>📁 Escolher da Galeria ou PDF</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf,.pdf"
                                onChange={e => handleFileUpload(e, setMinorAuthDocPhoto, "auth")}
                                className="hidden"
                                disabled={compressing}
                              />
                            </label>
                            <label className="cursor-pointer flex items-center justify-center gap-2 p-3 border-2 border-dashed border-rose-300 hover:border-rose-500 rounded-xl bg-white hover:bg-rose-50/50 text-rose-800 text-xs font-bold transition-colors">
                              <Camera className="w-4 h-4 shrink-0" />
                              <span>📷 Tirar Foto Agora</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={e => handleFileUpload(e, setMinorAuthDocPhoto, "auth")}
                                className="hidden"
                                disabled={compressing}
                              />
                            </label>
                          </div>
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

                {/* Endereço Residencial com Auto-Preenchimento e Campos Estruturados */}
                {!isGovTriagemMode && (
                <div className="space-y-3 p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-sky-600" />
                      <span>Endereço Residencial *</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedGuestIndex > 1 && (
                        <button
                          type="button"
                          onClick={handleCopyTitularAddress}
                          className="text-[11px] text-sky-700 hover:text-sky-900 font-bold bg-white hover:bg-sky-50 border border-sky-300 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <Copy className="w-3 h-3 text-sky-600" />
                          Copiar endereço do titular
                        </button>
                      )}
                      {loadingCep && <span className="text-[10px] text-sky-600 animate-pulse font-bold">Buscando CEP...</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label className="text-xs font-bold text-slate-700">CEP</Label>
                      <Input 
                        value={cep} 
                        onChange={e => {
                          const v = formatCep(e.target.value)
                          setCep(v)
                          handleLookupPreCheckinCep(v)
                        }} 
                        onBlur={e => handleLookupPreCheckinCep(e.target.value)}
                        placeholder="00000-000" 
                        maxLength={9}
                        inputMode="numeric"
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-mono rounded-xl h-11 focus-visible:ring-sky-500" 
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label className="text-xs font-bold text-slate-700">Rua / Logradouro *</Label>
                      <Input 
                        value={street} 
                        onChange={e => {
                          setStreet(e.target.value)
                          syncAddress(e.target.value, streetNumber, complement, neighborhood)
                        }} 
                        placeholder="Ex: Av. Pelinca" 
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label className="text-xs font-bold text-slate-700">Número *</Label>
                      <Input 
                        ref={numberInputRef}
                        value={streetNumber} 
                        onChange={e => {
                          setStreetNumber(e.target.value)
                          syncAddress(street, e.target.value, complement, neighborhood)
                        }} 
                        placeholder="Ex: 100 ou S/N" 
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-bold rounded-xl h-11 focus-visible:ring-sky-500 font-mono" 
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label className="text-xs font-bold text-slate-700">Complemento</Label>
                      <Input 
                        value={complement} 
                        onChange={e => {
                          setComplement(e.target.value)
                          syncAddress(street, streetNumber, e.target.value, neighborhood)
                        }} 
                        placeholder="Ex: Apto 402, Bl. B" 
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label className="text-xs font-bold text-slate-700">Bairro</Label>
                      <Input 
                        value={neighborhood} 
                        onChange={e => {
                          setNeighborhood(e.target.value)
                          syncAddress(street, streetNumber, complement, e.target.value)
                        }} 
                        placeholder="Ex: Centro" 
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label className="text-xs font-bold text-slate-700">Cidade / Estado</Label>
                      <Input 
                        value={city} 
                        onChange={e => setCity(e.target.value)} 
                        placeholder="Ex: Campos / RJ" 
                        className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium rounded-xl h-11 focus-visible:ring-sky-500" 
                      />
                    </div>
                  </div>
                </div>
                )}

                {/* ── Seção Obrigatória MTur / Transporte & Chegada ── */}
                <div className="p-4 sm:p-5 bg-gradient-to-br from-sky-50/80 via-slate-50 to-indigo-50/50 border border-sky-200/90 rounded-2xl space-y-3.5 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>{isGovTriagemMode ? "Transporte & Previsão de Chegada (Garagem Soho) *" : "Informações da Estadia Atual (Exigência MTur - Lei 11.771/2008) *"}</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedGuestIndex > 1 && (
                        <button
                          type="button"
                          onClick={handleCopyTitularVehicle}
                          className="text-[11px] text-sky-700 hover:text-sky-900 font-bold bg-white hover:bg-sky-50 border border-sky-300 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs text-left"
                        >
                          <Car className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>Viajando no mesmo veículo do titular</span>
                        </button>
                      )}
                      <Badge className="bg-sky-100 text-sky-800 text-[10px] font-bold border-sky-200">Obrigatório</Badge>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {isGovTriagemMode
                      ? "Informe se você virá de veículo para cadastrarmos sua placa na portaria e garagem privativa do Edifício Soho:"
                      : "Por exigência do Ministério do Turismo, informe os dados específicos desta viagem para emissão da FNRH:"}
                  </p>

                  <div className={`grid grid-cols-1 ${isGovTriagemMode ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-3`}>
                    {!isGovTriagemMode && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Motivo da Viagem *</Label>
                      <Select value={travelReason} onValueChange={setTravelReason}>
                        <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs sm:text-sm rounded-xl h-11 focus:ring-sky-500">
                          <SelectValue placeholder="Selecione o motivo da viagem *" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900 rounded-xl">
                          <SelectItem value="Lazer / Férias">🏖️ Lazer / Férias</SelectItem>
                          <SelectItem value="Negócios / Trabalho">💼 Negócios / Trabalho</SelectItem>
                          <SelectItem value="Congresso / Feira">🏛️ Congresso / Feira</SelectItem>
                          <SelectItem value="Saúde">🏥 Saúde</SelectItem>
                          <SelectItem value="Estudos">📚 Estudos</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Meio de Transporte *</Label>
                      <Select value={transportMethod} onValueChange={setTransportMethod}>
                        <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs sm:text-sm rounded-xl h-11 focus:ring-sky-500">
                          <SelectValue placeholder="Selecione o meio de transporte *" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900 rounded-xl">
                          <SelectItem value="Carro próprio">🚗 Carro próprio</SelectItem>
                          <SelectItem value="Carro alugado">🚙 Carro alugado</SelectItem>
                          <SelectItem value="Avião">✈️ Avião</SelectItem>
                          <SelectItem value="Ônibus">🚌 Ônibus</SelectItem>
                          <SelectItem value="Aplicativo / Táxi">🚕 Aplicativo / Táxi</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Previsão de Chegada (ETA)</Label>
                      <Select value={estimatedArrivalTime} onValueChange={setEstimatedArrivalTime}>
                        <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs sm:text-sm rounded-xl h-11 focus:ring-sky-500">
                          <SelectValue placeholder="Horário previsto (opcional)" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900 rounded-xl">
                          <SelectItem value="14:00">🕑 14:00 (Horário padrão de check-in)</SelectItem>
                          <SelectItem value="15:00">🕒 15:00 às 16:00</SelectItem>
                          <SelectItem value="16:00">🕓 16:00 às 18:00</SelectItem>
                          <SelectItem value="18:00">🕕 18:00 às 20:00</SelectItem>
                          <SelectItem value="20:00">🕗 20:00 às 22:00</SelectItem>
                          <SelectItem value="22:00">🕙 Após 22:00 (Madrugada)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Procedência e Destino */}
                  {!isGovTriagemMode && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Última Procedência (De onde você veio?) *</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Input
                          value={originCity}
                          onChange={e => setOriginCity(e.target.value)}
                          placeholder="Cidade (ex: Rio de Janeiro)"
                          className="col-span-2 bg-white border-slate-200 text-xs sm:text-sm rounded-xl h-10"
                        />
                        <Input
                          value={originState}
                          onChange={e => setOriginState(e.target.value.toUpperCase())}
                          placeholder="UF"
                          maxLength={2}
                          className="bg-white border-slate-200 text-xs sm:text-sm font-bold uppercase rounded-xl h-10 text-center"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Próximo Destino (Para onde você vai?) *</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Input
                          value={destinationCity}
                          onChange={e => setDestinationCity(e.target.value)}
                          placeholder="Cidade (ex: Campos dos Goytacazes)"
                          className="col-span-2 bg-white border-slate-200 text-xs sm:text-sm rounded-xl h-10"
                        />
                        <Input
                          value={destinationState}
                          onChange={e => setDestinationState(e.target.value.toUpperCase())}
                          placeholder="UF"
                          maxLength={2}
                          className="bg-white border-slate-200 text-xs sm:text-sm font-bold uppercase rounded-xl h-10 text-center"
                        />
                      </div>
                    </div>
                  </div>
                  )}
                </div>

                {/* 🚗 Garagem & Veículo Soho */}
                {isCarTransport && (
                  <div className="p-4 bg-sky-50/70 border border-sky-200/80 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                        <Car className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Estacionamento Privativo • Edifício Soho Residence</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedGuestIndex > 1 && (
                          <button
                            type="button"
                            onClick={handleCopyTitularVehicle}
                            className="text-[10px] text-sky-700 hover:text-sky-900 font-bold bg-white hover:bg-sky-100/80 border border-sky-300 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                          >
                            <Copy className="w-3 h-3 text-sky-600 shrink-0" />
                            <span>Copiar veículo do titular</span>
                          </button>
                        )}
                        <Badge className="bg-sky-100 text-sky-800 text-[10px] font-bold border-sky-200">1 Vaga Inclusa</Badge>
                      </div>
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

                <Button 
                  onClick={async () => {
                    if (!fullName.trim() || !document.trim() || !phone.trim() || !email.trim()) {
                      alert("Por favor, preencha todos os campos obrigatórios: Nome Completo, CPF, Telefone e E-mail.")
                      return
                    }
                    const cleanDocDigits = document.replace(/\D/g, "")
                    if ((originCountry === "Brasil" || cleanDocDigits.length === 11) && !isValidBrazilianCpf(cleanDocDigits)) {
                      alert("O CPF informado é inválido. Por favor, verifique os 11 dígitos do seu CPF.")
                      return
                    }
                    const cleanPhoneDigits = phone.replace(/\D/g, "")
                    if (cleanPhoneDigits.length < 10) {
                      alert("Por favor, informe um telefone / WhatsApp válido com DDD.")
                      return
                    }
                    try {
                      const waRes = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(cleanPhoneDigits)}`)
                      const waData = await waRes.json()
                      if (waData && waData.checked && waData.exists === false) {
                        alert("O telefone informado não possui conta ativa no WhatsApp. Por favor, informe um número que tenha WhatsApp para receber o código e a senha da porta.")
                        return
                      }
                    } catch {}
                    if (!isGovTriagemMode && (!address.trim() && !street.trim())) {
                      alert("Por favor, preencha seu Endereço Residencial.")
                      return
                    }
                    if (!isGovTriagemMode && !streetNumber.trim() && !address.includes(",")) {
                      alert("Por favor, informe o Número do endereço residencial (ou S/N se não houver).")
                      numberInputRef.current?.focus()
                      return
                    }
                    if (!birthDate) {
                      alert("Por favor, informe uma data de nascimento válida (DD/MM/AAAA) ou selecione no calendário.")
                      return
                    }
                    if (!isGovTriagemMode && !travelReason) {
                      alert("Por favor, selecione o Motivo da Viagem (exigência legal do Ministério do Turismo).")
                      return
                    }
                    if (!transportMethod) {
                      alert("Por favor, selecione o Meio de Transporte utilizado.")
                      return
                    }
                    if (isCarTransport && !vehiclePlate.trim()) {
                      alert("Por favor, informe a Placa do Veículo para liberarmos sua entrada na garagem.")
                      return
                    }
                    if (!isGovTriagemMode && (!originCity.trim() || !originState.trim())) {
                      alert("Por favor, informe a Última Procedência (Cidade e UF de onde veio).")
                      return
                    }
                    if (!isGovTriagemMode && (!destinationCity.trim() || !destinationState.trim())) {
                      alert("Por favor, informe o Próximo Destino (Cidade e UF para onde irá).")
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
                    if (docPhoto) {
                      runAiDocInspection(docPhoto, "documento_hospede")
                    }
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm h-auto min-h-12 py-2.5 px-4 whitespace-normal leading-tight text-center rounded-xl mt-4 gap-2 shadow-md"
                >
                  <span>Avançar para Foto do Documento</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Passo 2: Foto do Documento ─────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>2. Foto do Documento (RG / CNH / Passaporte)</span>
                </h3>
                {docPhoto && isSavedDocFromProfile && (
                  <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px] py-0.5 px-2.5 shadow-none">
                    ✓ Recuperado do seu cadastro
                  </Badge>
                )}
              </div>

              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {docPhoto && isSavedDocFromProfile
                  ? "Seu documento enviado anteriormente já foi recuperado automaticamente do seu cadastro. Confira a validação pericial abaixo ou substitua se desejar."
                  : "Tire uma foto nítida ou anexe o PDF do seu documento oficial de identificação para validação pericial de titularidade e segurança na portaria."}
              </p>

              <div className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-2xl p-4 sm:p-8 text-center bg-slate-50/50 relative overflow-hidden transition-colors">
                {docPhoto ? (
                  <div className="space-y-3">
                    {isSavedDocFromProfile && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl sm:rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold leading-tight text-left sm:text-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Documento salvo em estadias anteriores carregado automaticamente</span>
                      </div>
                    )}

                    {(docPhoto.startsWith("data:application/pdf") || docPhoto.toLowerCase().includes(".pdf")) ? (
                      <div className="max-w-xs mx-auto p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center gap-3 text-left">
                        <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 truncate">Documento Oficial (PDF)</div>
                          <div className="text-[11px] text-emerald-700 font-medium">✓ Arquivo digital anexado</div>
                        </div>
                      </div>
                    ) : (
                      <img src={docPhoto} alt="Documento" className="max-h-52 mx-auto rounded-xl object-contain border border-slate-200 shadow-sm bg-white" />
                    )}

                    <div className="flex items-center justify-center gap-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setDocPhoto(null)
                          setIsSavedDocFromProfile(false)
                          setAiDocResult(null)
                        }}
                        className="border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-xl"
                      >
                        Trocar Documento
                      </Button>
                      {!aiInspectingDoc && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => runAiDocInspection(docPhoto, "documento_hospede")}
                          className="text-xs font-semibold text-sky-700 hover:bg-sky-50 rounded-xl gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Revalidar</span>
                        </Button>
                      )}
                    </div>

                    {/* Feedback e Análise por Inteligência Artificial (Robô Pericial) */}
                    {aiInspectingDoc && (
                      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-center gap-2 text-xs text-sky-800 animate-pulse">
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
                        <span className="font-semibold">Robô pericial CorpFlats conferindo titularidade (mesma pessoa), CPF, nascimento e cidade...</span>
                      </div>
                    )}

                    {aiDocResult && !aiInspectingDoc && (
                      <div className="space-y-2.5 text-left pt-1">
                        {aiDocResult.isOfficialDocument === false && (
                          <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-1 text-xs text-rose-900">
                            <div className="font-bold flex items-center gap-1.5 text-rose-800">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>Documento Oficial Não Identificado</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              O arquivo anexado não foi reconhecido como um documento oficial com foto (RG, CNH ou Passaporte). Por favor, anexe um documento válido.
                            </p>
                          </div>
                        )}

                        {aiDocResult.isLegible === false && (
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-xs text-rose-900">
                            <div className="font-bold flex items-center gap-1.5 text-rose-800">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>Atenção à Legibilidade</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              {aiDocResult.legibilityReason || "Documento com pouca nitidez ou dados cortados. Se preferir, envie outra foto bem iluminada ou o arquivo original em PDF."}
                            </p>
                          </div>
                        )}

                        {(aiDocResult.identityMatches === false ||
                          aiDocResult.nameMatches === false ||
                          aiDocResult.reservationNameMatches === false ||
                          aiDocResult.cpfMatches === false ||
                          aiDocResult.reservationCpfMatches === false) && (
                          <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-2 text-xs text-rose-950 shadow-2xs">
                            <div className="font-bold flex items-center gap-1.5 text-rose-800">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>⚠️ Alerta Pericial: Divergência de Titularidade (Pessoa Diferente)</span>
                            </div>
                            {Array.isArray(aiDocResult.mismatchReasons) && aiDocResult.mismatchReasons.length > 0 ? (
                              <ul className="list-disc pl-4 space-y-1 text-[11px] text-rose-900 font-medium">
                                {aiDocResult.mismatchReasons.map((reason, idx) => (
                                  <li key={idx}>{reason}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-rose-900 leading-relaxed">
                                Os dados identificados no documento ({aiDocResult.extractedName || "Nome divergente"}) não correspondem ao hóspede titular desta ficha ({aiDocResult.reservationName || fullName}).
                              </p>
                            )}
                            <p className="text-[11px] text-rose-800 font-semibold pt-0.5">
                              Por segurança, o documento anexado deve pertencer à mesma pessoa da reserva. Clique em "Trocar Documento" para anexar o documento correto ou volte ao Passo 1 para corrigir os dados digitados.
                            </p>
                          </div>
                        )}

                        {/* Checklist Completo do Robô Pericial */}
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
                              <span>Laudo do Robô Pericial CorpFlats</span>
                            </span>
                            {aiDocResult.documentType && aiDocResult.documentType !== "desconhecido" && (
                              <Badge variant="outline" className="text-[10px] uppercase font-bold border-slate-300 text-slate-700">
                                {aiDocResult.documentType}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                            {/* 1. Titularidade / Mesma Pessoa */}
                            <div className={`p-2 rounded-lg border ${
                              aiDocResult.nameMatches === false || aiDocResult.reservationNameMatches === false
                                ? "bg-rose-50/70 border-rose-200 text-rose-900"
                                : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                            }`}>
                              <div className="text-[10px] uppercase font-bold opacity-75">Titularidade / Mesma Pessoa</div>
                              <div className="font-bold text-[11px] mt-0.5 flex items-center gap-1">
                                {aiDocResult.nameMatches === false || aiDocResult.reservationNameMatches === false ? (
                                  <span>❌ Divergente ({aiDocResult.extractedName || "Outro titular"})</span>
                                ) : (
                                  <span>✓ {aiDocResult.extractedName || fullName || "Confirmada"}</span>
                                )}
                              </div>
                            </div>

                            {/* 2. CPF */}
                            <div className={`p-2 rounded-lg border ${
                              aiDocResult.cpfMatches === false || aiDocResult.reservationCpfMatches === false
                                ? "bg-rose-50/70 border-rose-200 text-rose-900"
                                : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                            }`}>
                              <div className="text-[10px] uppercase font-bold opacity-75">Conferência de CPF</div>
                              <div className="font-bold text-[11px] mt-0.5">
                                {aiDocResult.cpfMatches === false || aiDocResult.reservationCpfMatches === false
                                  ? `❌ Divergente (${aiDocResult.extractedCpf || "CPF diferente"})`
                                  : `✓ ${aiDocResult.extractedCpf || document || "Compatível"}`}
                              </div>
                            </div>

                            {/* 3. Data de Nascimento / Idade */}
                            <div className={`p-2 rounded-lg border ${
                              aiDocResult.birthDateMatches === false
                                ? "bg-amber-50 border-amber-200 text-amber-900"
                                : "bg-slate-50 border-slate-200 text-slate-800"
                            }`}>
                              <div className="text-[10px] uppercase font-bold opacity-75">Nascimento / Faixa Etária</div>
                              <div className="font-bold text-[11px] mt-0.5">
                                {aiDocResult.birthDateMatches === false
                                  ? `⚠️ Divergente (${aiDocResult.extractedBirthDate || "Verificar"})`
                                  : (aiDocResult.calculatedAge !== null && aiDocResult.calculatedAge !== undefined
                                      ? `${aiDocResult.isMinor ? "👶 Menor" : "✓ Maior"} (${aiDocResult.calculatedAge} anos)`
                                      : `✓ ${birthDateInput || "Validada"}`)}
                              </div>
                            </div>

                            {/* 4. Cidade / Origem */}
                            <div className={`p-2 rounded-lg border ${
                              aiDocResult.isCamposResident
                                ? "bg-purple-50 border-purple-200 text-purple-900"
                                : "bg-slate-50 border-slate-200 text-slate-800"
                            }`}>
                              <div className="text-[10px] uppercase font-bold opacity-75">Cidade / Naturalidade</div>
                              <div className="font-bold text-[11px] mt-0.5">
                                {aiDocResult.isCamposResident
                                  ? "📍 Campos dos Goytacazes/RJ"
                                  : `✓ ${aiDocResult.extractedCity ? `${aiDocResult.extractedCity}${aiDocResult.extractedState ? `/${aiDocResult.extractedState}` : ""}` : (city ? `${city}/${state}` : "Verificada")}`}
                              </div>
                            </div>
                          </div>
                        </div>

                        {aiDocResult.isCamposResident && (
                          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-purple-900 shadow-2xs">
                            <div className="flex items-center gap-2.5">
                              <span className="text-base shrink-0">📍</span>
                              <div>
                                <div className="font-bold">Residência / Documento de Campos dos Goytacazes/RJ</div>
                                <div className="text-[11px] text-purple-700">Origem local confirmada e sincronizada com seu cadastro.</div>
                              </div>
                            </div>
                            <Badge className="bg-purple-700 text-white font-bold text-[10px] shrink-0">Campos/RJ</Badge>
                          </div>
                        )}

                        {aiDocResult.isMinor && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
                            <span className="text-base shrink-0">👶</span>
                            <div>
                              <div className="font-bold">Hóspede Menor de 18 Anos</div>
                              <div className="text-[11px] text-amber-700">Lembre-se da autorização em cartório conforme o ECA Art. 82.</div>
                            </div>
                          </div>
                        )}

                        {aiDocResult.isLegible !== false &&
                          aiDocResult.isOfficialDocument !== false &&
                          aiDocResult.identityMatches !== false &&
                          aiDocResult.nameMatches !== false &&
                          aiDocResult.reservationNameMatches !== false &&
                          aiDocResult.cpfMatches !== false && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-medium">
                              {aiDocResult.summary || "Identidade, titularidade da reserva e documento oficial validados com sucesso pela Inteligência Artificial."}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                      {/* Opção 1: Galeria ou PDF (Sem capture para liberar seletor de arquivos/PDF e Galeria no celular) */}
                      <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/70 hover:bg-sky-100/70 transition-colors">
                        <div className="w-11 h-11 rounded-xl bg-white border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs">
                          {compressing ? <RefreshCw className="w-5 h-5 animate-spin text-sky-600" /> : <Upload className="w-5 h-5" />}
                        </div>
                        <span className="font-bold text-xs sm:text-sm text-slate-900">
                          📁 Escolher da Galeria ou PDF
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Anexar foto salva ou arquivo PDF
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf,.pdf"
                          onChange={e => handleFileUpload(e, setDocPhoto, "doc")}
                          className="hidden"
                          disabled={compressing}
                        />
                      </label>

                      {/* Opção 2: Tirar Foto com a Câmera */}
                      <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 transition-colors">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                          {compressing ? <RefreshCw className="w-5 h-5 animate-spin text-slate-700" /> : <Camera className="w-5 h-5" />}
                        </div>
                        <span className="font-bold text-xs sm:text-sm text-slate-900">
                          📷 Tirar Foto Agora
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Usar a câmera para fotografar
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={e => handleFileUpload(e, setDocPhoto, "doc")}
                          className="hidden"
                          disabled={compressing}
                        />
                      </label>
                    </div>
                    <span className="text-xs text-slate-400 block">
                      Formatos aceitos: Fotos da Galeria (JPG, PNG, WEBP), PDF Digital (CNH/RG Digital) ou Câmera
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep(1)} 
                  className="border-slate-200 text-slate-700 font-bold text-xs h-11 rounded-xl bg-white hover:bg-slate-50 w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4 mr-1 shrink-0" /> Voltar
                </Button>
                <Button 
                  onClick={async () => {
                    if (!docPhoto) {
                      alert("Por favor, anexe a foto ou PDF do seu documento oficial de identificação (RG, CNH ou Passaporte) para continuar.")
                      return
                    }
                    if (aiInspectingDoc) {
                      alert("Aguarde alguns instantes enquanto o robô pericial conclui a conferência do seu documento.")
                      return
                    }
                    if (aiDocResult?.isOfficialDocument === false) {
                      alert("O arquivo enviado não foi reconhecido como documento oficial de identificação com foto (RG, CNH ou Passaporte). Por favor, anexe um documento válido.")
                      return
                    }
                    if (aiDocResult?.isLegible === false) {
                      alert(aiDocResult.legibilityReason || "O documento anexado está ilegível. Por favor, envie outra foto mais nítida ou o PDF original.")
                      return
                    }
                    if (
                      aiDocResult?.identityMatches === false ||
                      aiDocResult?.nameMatches === false ||
                      aiDocResult?.reservationNameMatches === false ||
                      aiDocResult?.cpfMatches === false ||
                      aiDocResult?.reservationCpfMatches === false
                    ) {
                      const reasons = Array.isArray(aiDocResult?.mismatchReasons) && aiDocResult.mismatchReasons.length > 0
                        ? aiDocResult.mismatchReasons.join("\n• ")
                        : "O nome ou CPF constante no documento não corresponde ao titular desta reserva."
                      alert(`⚠️ Bloqueio Pericial de Titularidade:\n\n• ${reasons}\n\nO documento anexado deve pertencer à mesma pessoa titular da ficha. Anexe o documento correto ou volte ao Passo 1 para corrigir seus dados.`)
                      return
                    }
                    setStep(3)
                    await ensureOrRefreshToken()
                  }} 
                  disabled={isRefreshingToken || aiInspectingDoc}
                  className="w-full sm:w-auto sm:flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm h-auto min-h-11 py-2.5 px-4 whitespace-normal leading-tight text-center rounded-xl gap-2 shadow-md"
                >
                  <span>
                    {isRefreshingToken
                      ? "Preparando..."
                      : isGovTriagemMode
                      ? "Avançar para Aceite das Regras & Gov.br"
                      : "Avançar para Assinatura Eletrônica"}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Passo 3: Assinatura Digital & Validade Jurídica de 2 Horas ── */}
          {step === 3 && (
            <div className="space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>{isGovTriagemMode ? "3. Regras do Condomínio Soho & Prosseguir para o Gov.br" : "3. Assinatura Digital com Validade Jurídica"}</span>
                </h3>
              </div>

              {isGovTriagemMode ? (
                <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-sky-50 border-2 border-emerald-300 rounded-2xl space-y-2.5 shadow-xs">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs sm:text-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Assinatura Oficial via Gov.br (Sem Dupla Assinatura)</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Como o modo <strong>FNRH Digital Oficial (Gov.br)</strong> está ativo, você <strong>não precisa desenhar assinatura na tela nem aguardar código no WhatsApp</strong> nesta etapa.
                  </p>
                  <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                    Basta marcar abaixo a ciência das Regras do Edifício Soho Residence para liberarmos imediatamente sua portaria 24h e garagem, e você será direcionado para concluir a Ficha Nacional no portal <strong>fnrh.turismo.gov.br</strong>.
                  </p>
                </div>
              ) : (
                <>
              {/* CARD DE SESSÃO SEGURA & VALIDADE DE 2 HORAS */}
              {isTokenSessionExpired ? (
                <div className="p-4 sm:p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-bold">
                      <Clock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Sessão de Assinatura Expirada (2 Horas)</span>
                    </span>
                    <Badge variant="outline" className="bg-white border-rose-300 text-rose-700 text-[10px] font-bold">
                      Tempo Esgotado
                    </Badge>
                  </div>
                  <p className="text-xs text-rose-900 leading-relaxed">
                    Por exigência jurídica da <strong>MP nº 2.200-2/2001</strong> e <strong>Lei 14.063/2020</strong>, esta sessão de assinatura expirou após 2 horas para garantir que é você mesmo no seu dispositivo.
                  </p>
                  <div className="p-3 bg-white/90 rounded-xl border border-rose-200 text-xs text-slate-700 flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-800">
                      💡 <strong>Fique tranquilo!</strong> Seus dados cadastrais e o documento anexado continuam 100% salvos. Basta renovar por mais 2 horas abaixo:
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => ensureOrRefreshToken(true)}
                    disabled={isRefreshingToken}
                    className="w-full h-auto min-h-11 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl gap-2 shadow-md"
                  >
                    <RefreshCw className={`w-4 h-4 shrink-0 ${isRefreshingToken ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingToken ? "Gerando Novo Link..." : "🔄 Renovar Sessão / Gerar Mais 2 Horas"}</span>
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-emerald-50/50 border border-sky-200/90 rounded-2xl space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-sky-700" />
                      <span className="font-bold text-xs sm:text-sm text-slate-900">
                        Sessão de Assinatura Eletrônica Ativa
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-xs font-mono font-bold py-1 px-2.5 flex items-center gap-1.5 shadow-none ${
                        tokenSecondsRemaining !== null && tokenSecondsRemaining <= 900
                          ? "bg-amber-100 text-amber-900 border-amber-300 animate-pulse"
                          : "bg-emerald-100 text-emerald-800 border-emerald-300"
                      }`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Validade: {formatRemainingTime(tokenSecondsRemaining)}</span>
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Esta sessão possui <strong>validade máxima de 2 horas</strong> nos termos da <strong>MP nº 2.200-2/2001</strong> e <strong>Lei nº 14.063/2020</strong>. Seus metadados forenses de IP, dispositivo e carimbo de tempo serão vinculados ao hash criptográfico SHA-256 da FNRH.
                  </p>

                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-sky-200/60 text-xs">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-700 hover:text-sky-900 bg-white/80 hover:bg-white px-3 py-1.5 rounded-lg border border-sky-200 transition-colors shadow-2xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedLink ? "✓ Link Copiado!" : "Copiar Link para Celular"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => ensureOrRefreshToken(true)}
                      disabled={isRefreshingToken}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingToken ? 'animate-spin' : ''}`} />
                      <span>Reiniciar 2 Horas</span>
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Assine com o dedo ou mouse na área abaixo confirmando a exatidão dos seus dados:
              </p>

              {/* CANVAS DE ASSINATURA */}
              <div className="bg-white rounded-2xl p-2 border-2 border-slate-200 overflow-hidden relative touch-none shadow-inner">
                {isTokenSessionExpired && (
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs z-10 flex flex-col items-center justify-center text-center p-4 space-y-2">
                    <Clock className="w-6 h-6 text-amber-300" />
                    <span className="text-xs font-bold text-white max-w-xs">
                      Sessão de assinatura de 2 horas expirada.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => ensureOrRefreshToken(true)}
                      disabled={isRefreshingToken}
                      className="bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold rounded-xl h-8 px-3"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingToken ? 'animate-spin' : ''}`} />
                      <span>Renovar Sessão (+2h)</span>
                    </Button>
                  </div>
                )}

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
                  style={{ touchAction: "none" }}
                  className="w-full h-36 cursor-crosshair bg-white touch-none"
                />
                <button
                  type="button"
                  onClick={clearCanvas}
                  disabled={isTokenSessionExpired}
                  className="absolute bottom-2 right-2 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-30"
                >
                  Limpar Assinatura
                </button>
              </div>

              {/* 📱 Autenticação de Posse via WhatsApp (2FA) */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-sky-50/80 border border-emerald-300 rounded-2xl space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 block leading-tight">
                        Código de Segurança no WhatsApp (2FA)
                      </span>
                      <span className="text-[11px] text-slate-600 block mt-0.5">
                        {otpChannel === "whatsapp" 
                          ? `Enviado para o WhatsApp ${otpMaskedPhone || phone || ""}` 
                          : `Enviado para o e-mail ${otpMaskedEmail || email || ""}`}
                      </span>
                    </div>
                  </div>
                  {whatsappOtpInput.length === 6 ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold py-0.5 px-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Código Preenchido
                    </Badge>
                  ) : otpSent ? (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold py-0.5 px-2 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Aguardando Código
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-bold py-0.5 px-2">
                      Validação Pendente
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Para conferir validade jurídica à sua assinatura (Lei 14.063/2020), enviamos um código de 6 dígitos no seu WhatsApp. Digite-o abaixo:
                </p>

                {/* Mensagens de Sucesso ou Erro do OTP */}
                {otpSuccessMessage && (
                  <div className="text-xs font-semibold text-emerald-800 bg-emerald-100/90 border border-emerald-300 rounded-xl p-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{otpSuccessMessage}</span>
                  </div>
                )}

                {otpError && (
                  <div className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{otpError}</span>
                  </div>
                )}

                {/* Input de Código OTP de 6 Dígitos & Botões de Ação */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative w-full sm:w-60">
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={whatsappOtpInput}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 6)
                        setWhatsappOtpInput(val)
                        setOtpError(null)
                      }}
                      placeholder="000000"
                      className="text-center font-mono text-xl sm:text-2xl tracking-[0.4em] font-black h-12 bg-white border-2 border-emerald-300 focus:border-emerald-600 focus:ring-emerald-500 rounded-xl shadow-inner text-slate-900"
                    />
                    {whatsappOtpInput.length === 6 && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 absolute right-3 top-3.5" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText()
                          const digits = (text || "").replace(/\D/g, "").slice(0, 6)
                          if (digits) {
                            setWhatsappOtpInput(digits)
                            setOtpError(null)
                          } else {
                            setOtpError("Nenhum código numérico encontrado na área de transferência.")
                          }
                        } catch {
                          setOtpError("Toque e segure no campo 000000 e selecione 'Colar'.")
                        }
                      }}
                      className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 rounded-xl h-auto min-h-12 py-2 px-3.5 whitespace-normal leading-tight gap-1.5 flex-1 sm:flex-none shadow-2xs"
                    >
                      <Copy className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>📋 Colar</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={otpCooldown > 0 || otpLoading}
                      onClick={() => handleSendOtp("whatsapp", true)}
                      className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border-slate-200 rounded-xl h-auto min-h-12 py-2 px-3 whitespace-normal leading-tight gap-1.5 flex-1 sm:flex-none"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${otpLoading ? "animate-spin" : ""}`} />
                      <span>{otpCooldown > 0 ? `Reenviar (${otpCooldown}s)` : "Reenviar no WhatsApp"}</span>
                    </Button>
                  </div>
                </div>

                {/* Link de Contingência: Receber por E-mail */}
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1 border-t border-emerald-200/60 text-slate-500">
                  <span>Não recebeu o código no WhatsApp?</span>
                  <button
                    type="button"
                    onClick={() => handleSendOtp("email", true)}
                    disabled={otpLoading}
                    className="text-sky-700 hover:text-sky-900 font-bold hover:underline"
                  >
                    Receber código por E-mail →
                  </button>
                </div>
              </div>
              </>
              )}

              {/* 🔒 Card de Segurança da Informação & Conformidade LGPD */}
              <div className="p-4 sm:p-5 bg-slate-900 border border-sky-500/40 rounded-2xl text-slate-200 space-y-3 shadow-lg">
                <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                  <Lock className="w-5 h-5 text-sky-400 shrink-0" />
                  <span>Seus dados e documentos estão protegidos</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Suas informações são coletadas para cumprimento de obrigação legal regulatória (FNRH - Lei Geral do Turismo nº 11.771/2008 e Decreto nº 7.381/2010) e execução do contrato de hospedagem (Art. 7º, II e V da LGPD).
                </p>
                <div className="space-y-1.5 text-[11px] text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-sky-300">• Segurança:</span>
                    <span>O tráfego e o armazenamento são protegidos por criptografia de ponta a ponta.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-sky-300">• Uso restrito:</span>
                    <span>Acesso limitado exclusivamente à gestão da hospedagem e autoridades competentes conforme exigido em lei. Seus dados nunca são comercializados.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-sky-300">• Seus direitos:</span>
                    <span>Você pode revisar ou atualizar seus dados cadastrais a qualquer momento.</span>
                  </div>
                </div>
                <div 
                  className="text-[11px] text-sky-400 cursor-pointer hover:underline flex items-center gap-1 font-medium"
                  onClick={() => { setTermsModalTab("rules"); setTermsModalOpen(true); }}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>Acesse nossa Política de Privacidade para mais detalhes</span>
                </div>
              </div>

              {/* 📜 Checkboxes Regulatórios e LGPD */}
              <div className="space-y-2.5 p-4 bg-slate-50/90 rounded-2xl border border-slate-200">
                {/* Checkbox 1: Obrigatório */}
                <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                  legalDeclarationAccepted ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 ring-2 ring-emerald-500/20" : "bg-white border-slate-200 hover:border-slate-300"
                }`}>
                  <input 
                    type="checkbox" 
                    checked={legalDeclarationAccepted} 
                    onChange={e => {
                      setLegalDeclarationAccepted(e.target.checked)
                      setAcceptedHouseRules(e.target.checked)
                      setAcceptedContract(e.target.checked)
                    }}
                    required
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 shrink-0"
                  />
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-slate-900 block mb-0.5">
                      Declaração Obrigatória de Veracidade e LGPD *
                    </span>
                    <p className="text-slate-800 font-medium">
                      Declaro que as informações prestadas são verdadeiras e estou ciente dos termos de hospedagem e política de privacidade/LGPD.
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setTermsModalTab("rules"); setTermsModalOpen(true); }}
                        className="text-sky-600 hover:underline font-bold inline"
                      >
                        [Regras do Edifício]
                      </button>
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setTermsModalTab("contract"); setTermsModalOpen(true); }}
                        className="text-indigo-600 hover:underline font-bold inline"
                      >
                        [Termos de Hospedagem]
                      </button>
                    </div>
                  </div>
                </label>

                {/* Checkbox 2: Opcional (Opt-in Marketing) */}
                <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                  optInMarketing ? "bg-sky-50/80 border-sky-300 text-sky-950 ring-2 ring-sky-500/20" : "bg-white border-slate-200 hover:border-slate-300"
                }`}>
                  <input 
                    type="checkbox" 
                    checked={optInMarketing} 
                    onChange={e => setOptInMarketing(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 mt-0.5 shrink-0"
                  />
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-slate-900 block mb-0.5">
                      Comunicações e Benefícios Exclusivos (Opcional)
                    </span>
                    <p className="text-slate-600">
                      Aceito receber novidades, benefícios e comunicações sobre futuras estadias via WhatsApp ou E-mail.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep(2)} 
                  className="border-slate-200 text-slate-700 font-bold text-xs h-11 sm:h-12 rounded-xl bg-white hover:bg-slate-50 w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4 mr-1 shrink-0" /> Voltar
                </Button>
                <Button 
                  disabled={loading || !legalDeclarationAccepted || (!isGovTriagemMode && (!signatureData || isTokenSessionExpired || (otpSent && whatsappOtpInput.trim().length !== 6)))}
                  onClick={handleSubmit} 
                  className="w-full sm:w-auto sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm h-auto min-h-12 py-2.5 px-4 whitespace-normal leading-tight text-center rounded-xl gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {loading 
                      ? (isGovTriagemMode ? "Salvando Portaria e Abrindo Gov.br..." : "Gerando Ficha e Auditoria...")
                      : (!isGovTriagemMode && isTokenSessionExpired)
                      ? "Sessão Expirada - Renove Acima para Concluir" 
                      : isGovTriagemMode
                      ? "Confirmar Dados da Portaria e Prosseguir para o Gov.br (FNRH)"
                      : "Confirmar Check-in e Gerar Ficha"}
                  </span>
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
              <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0" />
              Regras da Casa & Termos Contratuais
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Consulte as regras de convivência do imóvel e as cláusulas contratuais da sua estadia na {brandName}.
            </DialogDescription>
          </DialogHeader>

          {/* Abas de Navegação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setTermsModalTab("rules")}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors leading-snug ${
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
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors leading-snug ${
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
              settings?.houseRules || "Regras de Convivência:\n• Check-in a partir das 14h / Check-out até 12h.\n• Silêncio após às 22h.\n• Proibido fumar dentro dos apartamentos e nas áreas comuns fechadas.\n• Utilização do estacionamento rotativo em vagas disponíveis."
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
