import { useState, useEffect, useRef } from "react"
import { useRoute, useLocation } from "wouter"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  Building2, User, Phone, Mail, Camera, FileText, CheckCircle2, 
  MapPin, ShieldCheck, ArrowRight, ArrowLeft, PenTool, Sparkles, AlertCircle, Zap, Car,
  Printer, Edit3, Share2, Eye, ZoomIn, Download, ExternalLink, MessageCircle, Clock, Calendar, Check, Ban, Lock, Award, KeyRound
} from "lucide-react"
import { compressImage } from "@/lib/image-compression"

export default function GuestPreCheckin() {
  const [, params] = useRoute("/pre-checkin/:code")
  const code = params?.code || ""

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [docCompressStats, setDocCompressStats] = useState<string | null>(null)
  const [selfieCompressStats, setSelfieCompressStats] = useState<string | null>(null)

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

  // Veículo para Garagem
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleColor, setVehicleColor] = useState("")

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

    const gName = currentG?.name || (gIdx === 1 ? (res.guestName || guest.name) : "")
    const gPhone = currentG?.phone || (gIdx === 1 ? (res.guestPhone || guest.phone) : "")
    const gEmail = currentG?.email || (gIdx === 1 ? (res.guestEmail || guest.email) : "")
    const gDoc = currentG?.cpf || (gIdx === 1 ? (res.guestDocument || guest.document) : "")

    setFullName(gName && !gName.startsWith("Hóspede") ? gName : (gIdx === 1 ? (gName || "") : ""))
    setPhone(gPhone || "")
    setEmail(gEmail || "")
    setDocument(gDoc || "")

    if (guest.birthDate) setBirthDate(guest.birthDate)
    if (guest.gender) setGender(guest.gender)
    if (guest.address) setAddress(guest.address)
    if (guest.city) setCity(guest.city)
    if (guest.state) setState(guest.state)

    const v = res.vehicle || guest.vehicle
    if (v && v.plate) {
      setVehiclePlate(v.plate)
      setVehicleModel(v.model || "")
      setVehicleBrand(v.brand || "")
      setVehicleColor(v.color || "")
      setTransportMethod("carro")
    }

    const selfie = res.selfieUrl || guest.photoUrl || null
    const doc = res.docPhotoUrl || guest.docPhotoUrl || null
    const sig = res.signatureUrl || guest.signatureUrl || null

    if (selfie) setSelfiePhoto(selfie)
    if (doc) setDocPhoto(doc)
    if (sig) setSignatureData(sig)

    const fnhrDone = Boolean(
      res.fnhrCompleted || 
      currentG?.hasCompletedCheckin || 
      guest.fnhrCompleted || 
      (selfie && sig)
    )

    if (currentG?.checkinCompletedAt || res.updatedAt) {
      setCompletedTimestamp(currentG?.checkinCompletedAt || res.updatedAt)
    }

    setIsCompleted(fnhrDone)
    setIsEditing(!fnhrDone)
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
  }, [code, selectedGuestIndex])

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
    type: "doc" | "selfie"
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCompressing(true)
    try {
      // Compresses 5-8MB high-res photos into ~80-120KB WebP (97% reduction)
      const result = await compressImage(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.8,
        preferredFormat: "image/webp"
      })

      setter(result.base64)
      const origKb = Math.round(result.originalSizeBytes / 1024)
      const compKb = Math.round(result.compressedSizeBytes / 1024)
      const statText = `⚡ Otimizada: de ${origKb}KB para ${compKb}KB (${result.savedPercentage}% de economia)`

      if (type === "doc") setDocCompressStats(statText)
      if (type === "selfie") setSelfieCompressStats(statText)
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
          signatureBase64: signatureData
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
  // MODO 1: FICHA DIGITAL DE HOSPEDAGEM (FNHR) FECHADA, ASSINADA & CERTIFICADA
  // ══════════════════════════════════════════════════════════════════════════════
  if (isCompleted && !isEditing) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6 font-sans">
        <div className="max-w-3xl w-full mx-auto space-y-4">
          {/* Barra Superior / Ações */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs">
                CF
              </div>
              <div>
                <span className="font-bold text-xs text-white block leading-tight">Ficha Digital de Hospedagem (FNHR)</span>
                <span className="text-[10px] text-slate-400">Reserva #{reservation?.code || code} • Apt {reservation?.flatNumber}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-8 text-xs bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 font-bold gap-1.5 rounded-xl shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Imprimir / PDF</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-8 text-xs bg-slate-800 border-slate-700 hover:bg-slate-700 text-amber-300 font-bold gap-1.5 rounded-xl shadow-xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Ficha</span>
              </Button>

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
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 rounded-xl shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>
            </div>
          </div>

          {/* Seletor de Hóspedes da Reserva (Se mais de 1 pessoa) */}
          {guestList.length > 1 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 space-y-1.5 shadow-md">
              <span className="text-[10px] uppercase font-bold text-slate-400 block px-1 tracking-wider">
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
                          ? "bg-primary text-primary-foreground border-primary shadow-md"
                          : g.hasCompletedCheckin
                          ? "bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-950"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      <span className="truncate">{g.name || `Hóspede ${g.index}`}</span>
                      {g.hasCompletedCheckin ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                      ) : (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0 ml-1">Pendente</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Documento Oficial da FNHR */}
          <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6">
            {/* Cabeçalho do Documento */}
            <div className="border-b border-slate-800 pb-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shadow-md shrink-0">
                    CF
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
                      Ficha Nacional de Registro de Hóspedes (FNHR)
                    </h1>
                    <span className="text-[11px] text-amber-400 font-bold uppercase tracking-wider block">
                      CorpFlats • Soho Residence Service
                    </span>
                  </div>
                </div>

                <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-xs font-bold py-1 px-3 flex items-center gap-1.5 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Check-in Digital Concluído</span>
                </Badge>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Apartamento: <strong className="text-white">Studio Apt {reservation?.flatNumber}</strong></span>
                <span>Código da Reserva: <strong className="text-amber-400 font-mono">{reservation?.code || code}</strong></span>
                {completedTimestamp && (
                  <span>Data do Registro: <strong className="text-slate-200">{new Date(completedTimestamp).toLocaleString("pt-BR")}</strong></span>
                )}
              </div>
            </div>

            {/* 1. Dados Pessoais do Hóspede */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-primary" />
                <span>1. Dados de Identificação do Hóspede</span>
              </div>
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Nome Completo</span>
                  <span className="font-bold text-white text-sm">{fullName || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">CPF / Documento</span>
                  <span className="font-medium text-slate-200 font-mono">{document || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">WhatsApp / Telefone</span>
                  <span className="font-medium text-slate-200">{phone || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">E-mail</span>
                  <span className="font-medium text-slate-200 truncate block">{email || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Data de Nascimento</span>
                  <span className="font-medium text-slate-200">{birthDate || "Não informada"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Gênero</span>
                  <span className="font-medium text-slate-200 capitalize">{gender || "Não informado"}</span>
                </div>
                <div className="sm:col-span-3 pt-2 border-t border-slate-900">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Endereço Residencial</span>
                  <span className="font-medium text-slate-300">{address ? `${address} • ${city} - ${state}` : "Campos dos Goytacazes - RJ"}</span>
                </div>
              </div>
            </div>

            {/* 2. Dados da Estadia & Acomodação */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>2. Dados da Hospedagem & Período</span>
              </div>
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Data de Check-in</span>
                  <span className="font-bold text-slate-200">{reservation?.checkinDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Data de Check-out</span>
                  <span className="font-bold text-slate-200">{reservation?.checkoutDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Canal de Origem</span>
                  <span className="font-bold text-amber-400 capitalize">{reservation?.channel || "Site Oficial"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Motivo da Viagem</span>
                  <span className="font-medium text-slate-200 capitalize">{travelReason || "Lazer / Turismo"}</span>
                </div>
              </div>
            </div>

            {/* 3. Veículo & Garagem Soho (se cadastrado) */}
            {vehiclePlate && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Car className="w-3.5 h-3.5 text-blue-400" />
                  <span>3. Veículo Cadastrado para Garagem</span>
                </div>
                <div className="p-3.5 bg-blue-950/30 rounded-2xl border border-blue-900/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-slate-950 border-2 border-blue-500/80 rounded-lg text-center font-mono">
                      <span className="text-[8px] block text-blue-400 font-bold uppercase leading-none">BRASIL</span>
                      <span className="text-sm font-black text-white tracking-widest leading-none">{vehiclePlate}</span>
                    </div>
                    <div>
                      <span className="font-bold text-white block">{vehicleBrand} {vehicleModel}</span>
                      <span className="text-[11px] text-blue-300">
                        {vehicleColor ? `Cor: ${vehicleColor} • ` : ""}1 Vaga Rotativa Inclusa no Soho
                      </span>
                    </div>
                  </div>
                  <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                    ✓ Garagem Autorizada
                  </Badge>
                </div>
              </div>
            )}

            {/* 4. Documentos & Biometria Anexados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-primary" />
                  <span>4. Documentação & Biometria Facial</span>
                </div>
                <span className="text-[10px] text-slate-500 font-normal lowercase">Toque na foto para ampliar</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Selfie do Hóspede */}
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Selfie do Hóspede</span>
                    {selfiePhoto && (
                      <span className="text-[9px] text-primary font-bold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Ampliar
                      </span>
                    )}
                  </div>
                  <div
                    onClick={() => {
                      if (selfiePhoto) setZoomedPhoto({ url: selfiePhoto, title: `Selfie - ${fullName}` })
                    }}
                    className={`h-40 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                      selfiePhoto ? "cursor-pointer hover:border-primary/60" : ""
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
                      <span className="text-xs text-slate-500">Selfie não anexada</span>
                    )}
                  </div>
                </div>

                {/* Foto do Documento */}
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Foto do Documento (RG / CNH)</span>
                    {docPhoto && (
                      <span className="text-[9px] text-primary font-bold flex items-center gap-0.5">
                        <ZoomIn className="w-3 h-3" /> Ampliar
                      </span>
                    )}
                  </div>
                  <div
                    onClick={() => {
                      if (docPhoto) setZoomedPhoto({ url: docPhoto, title: `Documento de Identidade - ${fullName}` })
                    }}
                    className={`h-40 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group ${
                      docPhoto ? "cursor-pointer hover:border-primary/60" : ""
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
                      <span className="text-xs text-slate-500">Documento não anexado</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Assinatura Digital & Termo de Aceite */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <PenTool className="w-3.5 h-3.5 text-primary" />
                <span>5. Assinatura Digital & Termos Aceitos</span>
              </div>
              <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3">
                {signatureData ? (
                  <div 
                    onClick={() => setZoomedPhoto({ url: signatureData, title: `Assinatura Digital - ${fullName}` })}
                    className="bg-white rounded-xl p-2 h-28 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
                  >
                    <img src={signatureData} alt="Assinatura Digital" className="max-h-full object-contain" />
                    <div className="absolute top-1.5 right-2 text-[9px] bg-slate-900/80 text-slate-200 px-1.5 py-0.5 rounded font-bold">
                      Assinado Eletronicamente
                    </div>
                  </div>
                ) : (
                  <div className="h-20 bg-slate-900 rounded-xl flex items-center justify-center text-slate-500 text-xs">
                    Assinatura não registrada
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Regras do Imóvel & Conveniência Aceitas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Contrato de Locação por Temporada Aceito</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Ban className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Flats 100% Não Fumantes (Ciente da Multa)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                    <span>Dados protegidos conforme LGPD (Lei 13.709)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé da Ficha com Carimbo */}
            <div className="text-center pt-2 text-[11px] text-slate-500">
              CorpFlats Gestão de Flats & Hospedagem • Edifício Soho Residence • Campos dos Goytacazes - RJ
            </div>
          </Card>
        </div>

        {/* Modal: Visualizador Ampliado de Fotos (Zoom / Lightbox) */}
        <Dialog open={Boolean(zoomedPhoto)} onOpenChange={(open) => !open && setZoomedPhoto(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[92vh] p-4 bg-slate-950/95 border-slate-800 text-white flex flex-col justify-between">
            <DialogHeader className="pb-2 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-200">
                  <Eye className="w-4 h-4 text-primary" />
                  <span>{zoomedPhoto?.title || "Visualização da Foto"}</span>
                </DialogTitle>
              </div>
            </DialogHeader>

            {zoomedPhoto?.url && (
              <div className="flex-1 flex items-center justify-center p-2 min-h-[300px] max-h-[65vh] overflow-hidden">
                <img 
                  src={zoomedPhoto.url} 
                  alt="Foto Ampliada" 
                  className="max-w-full max-h-[62vh] object-contain rounded-xl shadow-2xl border border-slate-800" 
                />
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between flex-row pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (zoomedPhoto?.url) window.open(zoomedPhoto.url, "_blank")
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 font-bold gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir Original</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setZoomedPhoto(null)}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white font-bold"
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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-4 sm:p-6 font-sans">
      <div className="max-w-lg w-full mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CorpFlats • Check-in Digital & FNHR</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">CorpFlats • Pré-Checkin Digital</h1>
          <p className="text-xs text-slate-400">
            {reservation ? `Apartamento ${reservation.flatNumber} • Entrada em ${reservation.checkinDate}` : "Agilize sua chegada aos flats da CorpFlats em menos de 2 minutos."}
          </p>
        </div>

        {/* Botão de Cancelar Edição se já estava concluído */}
        {isCompleted && isEditing && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="text-xs border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            >
              ✕ Cancelar Edição e Voltar à Ficha Concluída
            </Button>
          </div>
        )}

        {/* Multi-Guest Tab Selector (se a reserva for para mais de 1 pessoa) */}
        {guestList.length > 1 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 space-y-1.5 shadow-lg">
            <span className="text-[10px] uppercase font-black text-slate-400 block px-1 tracking-wider">
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
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border ${
                      isCurrent
                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                        : g.hasCompletedCheckin
                        ? "bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-950"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <span className="truncate">{g.name || `Hóspede ${g.index}`}</span>
                    {g.hasCompletedCheckin ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                    ) : (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0 ml-1">Pendente</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step Progress Bar */}
        <div className="flex items-center justify-between px-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                step === i ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : step > i ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-500"
              }`}>
                {step > i ? "✓" : i}
              </div>
              {i < 4 && <div className={`w-10 sm:w-16 h-1 rounded-full ${step > i ? "bg-emerald-600" : "bg-slate-800"}`} />}
            </div>
          ))}
        </div>

        {/* Form Container */}
        <Card className="bg-slate-900 border-slate-800 text-white rounded-3xl p-5 shadow-xl">
          {/* Step 1: Personal info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  1. Dados Pessoais & Ficha FNHR
                </h3>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-200">Nome Completo *</Label>
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Seu nome completo" className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-200">CPF ou Passaporte *</Label>
                    <Input value={document} onChange={e => setDocument(e.target.value)} required placeholder="000.000.000-00" className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-200">Data de Nascimento *</Label>
                    <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 [color-scheme:dark] text-xs font-bold" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-200">WhatsApp / Celular</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(21) 99999-9999" className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-200">Gênero</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white">
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                        <SelectItem value="outro">Outro / Prefere não informar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* CEP com Auto-Preenchimento */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-200">CEP</Label>
                      {loadingCep && <span className="text-[10px] text-primary animate-pulse">Buscando...</span>}
                    </div>
                    <Input 
                      value={cep} 
                      onChange={e => {
                        setCep(e.target.value)
                        handleLookupPreCheckinCep(e.target.value)
                      }} 
                      onBlur={e => handleLookupPreCheckinCep(e.target.value)}
                      placeholder="00000-000" 
                      className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-mono" 
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold text-slate-200">Endereço Residencial (Rua, Nº, Bairro)</Label>
                    <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Ex: Av. Paulista, 1000" className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-200">Cidade / Estado</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: São Paulo / SP" className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 text-xs font-medium" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-200">Meio de Transporte</Label>
                    <Select value={transportMethod} onValueChange={setTransportMethod}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white">
                        <SelectItem value="carro">🚗 Automóvel Próprio / Alugado (Garagem)</SelectItem>
                        <SelectItem value="aviao">✈️ Avião</SelectItem>
                        <SelectItem value="onibus">🚌 Ônibus</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 🚗 Campos do Veículo para Liberação da Garagem no Soho */}
                {transportMethod === "carro" && (
                  <div className="p-3.5 bg-blue-950/20 border border-blue-900/50 rounded-2xl space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5" />
                        Estacionamento Gratuito • Edifício Soho Residence
                      </span>
                      <Badge className="bg-blue-950 text-blue-400 text-[9px] font-bold">1 Vaga Inclusa</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300 font-bold">Placa do Veículo</Label>
                        <Input 
                          value={vehiclePlate} 
                          onChange={e => setVehiclePlate(e.target.value.toUpperCase())} 
                          placeholder="ABC1D23" 
                          className="bg-slate-950 border-slate-700 text-white text-xs font-mono font-bold uppercase" 
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Modelo do Carro</Label>
                        <Input 
                          value={vehicleModel} 
                          onChange={e => setVehicleModel(e.target.value)} 
                          placeholder="Ex: Corolla, Civic, Onix" 
                          className="bg-slate-950 border-slate-700 text-white text-xs" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Marca</Label>
                        <Input 
                          value={vehicleBrand} 
                          onChange={e => setVehicleBrand(e.target.value)} 
                          placeholder="Ex: Toyota, Honda" 
                          className="bg-slate-950 border-slate-700 text-white text-xs" 
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-300">Cor</Label>
                        <Input 
                          value={vehicleColor} 
                          onChange={e => setVehicleColor(e.target.value)} 
                          placeholder="Ex: Prata, Preto" 
                          className="bg-slate-950 border-slate-700 text-white text-xs" 
                        />
                      </div>
                    </div>

                    <span className="text-[10px] text-blue-300/80 block leading-tight">
                      Sua placa será cadastrada automaticamente no sistema da portaria para entrada na garagem.
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
                  setStep(2)
                }}
                className="w-full bg-primary text-primary-foreground font-bold text-xs h-11 rounded-xl mt-4 gap-2"
              >
                <span>Avançar para Foto do Documento</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Document Photo */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  2. Foto do Documento (RG / CNH / Passaporte)
                </h3>
              </div>

              <p className="text-xs text-slate-400">
                Tire uma foto nítida do seu documento com foto para liberação na portaria.
              </p>

              <div className="border-2 border-dashed border-slate-700 hover:border-primary rounded-2xl p-6 text-center bg-slate-950/60 relative overflow-hidden">
                {docPhoto ? (
                  <div className="space-y-3">
                    <img src={docPhoto} alt="Documento" className="max-h-48 mx-auto rounded-xl object-contain border border-slate-800" />
                    {docCompressStats && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[11px] font-bold text-emerald-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{docCompressStats}</span>
                      </div>
                    )}
                    <div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { setDocPhoto(null); setDocCompressStats(null); }}
                        className="border-slate-700 text-xs font-bold text-slate-300"
                      >
                        Trocar Foto
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-primary">
                      {compressing ? <Sparkles className="w-6 h-6 animate-spin text-primary" /> : <Camera className="w-6 h-6" />}
                    </div>
                    <span className="font-bold text-xs text-slate-200">
                      {compressing ? "Otimizando imagem..." : "Tirar Foto ou Enviar Arquivo"}
                    </span>
                    <span className="text-[10px] text-slate-500">Compressão automática WebP ultrarrápida</span>
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

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="border-slate-800 text-slate-300 font-bold text-xs h-11 rounded-xl">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => setStep(3)} className="flex-1 bg-primary text-primary-foreground font-bold text-xs h-11 rounded-xl gap-2">
                  <span>Avançar para Selfie</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Selfie */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  3. Selfie do Hóspede
                </h3>
              </div>

              <p className="text-xs text-slate-400">
                Uma foto rápida do seu rosto para identificação visual segura na portaria.
              </p>

              <div className="border-2 border-dashed border-slate-700 hover:border-primary rounded-2xl p-6 text-center bg-slate-950/60 relative overflow-hidden">
                {selfiePhoto ? (
                  <div className="space-y-3">
                    <img src={selfiePhoto} alt="Selfie" className="w-36 h-36 rounded-full mx-auto object-cover border-2 border-primary" />
                    {selfieCompressStats && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[11px] font-bold text-emerald-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{selfieCompressStats}</span>
                      </div>
                    )}
                    <div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { setSelfiePhoto(null); setSelfieCompressStats(null); }}
                        className="border-slate-700 text-xs font-bold text-slate-300"
                      >
                        Tirar Outra Selfie
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-primary">
                      {compressing ? <Sparkles className="w-6 h-6 animate-spin text-primary" /> : <Camera className="w-6 h-6" />}
                    </div>
                    <span className="font-bold text-xs text-slate-200">
                      {compressing ? "Otimizando selfie..." : "Abrir Câmera Frontal"}
                    </span>
                    <span className="text-[10px] text-slate-500">Tire uma selfie nítida</span>
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

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="border-slate-800 text-slate-300 font-bold text-xs h-11 rounded-xl">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => setStep(4)} className="flex-1 bg-primary text-primary-foreground font-bold text-xs h-11 rounded-xl gap-2">
                  <span>Avançar para Assinatura</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Digital Signature */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-primary" />
                  4. Assinatura Digital do Hóspede
                </h3>
              </div>

              <p className="text-xs text-slate-400">
                Assine com o dedo no quadro branco abaixo confirmando os dados da FNHR.
              </p>

              <div className="bg-white rounded-2xl p-2 border overflow-hidden relative touch-none">
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
                  className="absolute bottom-2 right-2 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1 rounded-md"
                >
                  Limpar Assinatura
                </button>
              </div>

              {/* 📜 Aceite Obrigatório dos Termos */}
              <div className="space-y-2.5 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
                <span className="font-bold text-white text-xs block text-amber-400">
                  Aceite Obrigatório dos Termos de Hospedagem *
                </span>

                <label className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                  acceptedHouseRules ? "bg-emerald-950/30 border-emerald-800/80" : "bg-slate-900/90 border-slate-700 hover:border-slate-600"
                }`}>
                  <input 
                    type="checkbox" 
                    checked={acceptedHouseRules} 
                    onChange={e => setAcceptedHouseRules(e.target.checked)}
                    required
                    className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500 mt-0.5 shrink-0"
                  />
                  <div className="text-xs text-slate-200">
                    <span className="font-bold">1. Regras do Imóvel e Conveniência</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Concordo com horários (14h/12h), 100% não fumantes, vagas rotativas e normas do Edifício Soho.{" "}
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setTermsModalTab("rules"); setTermsModalOpen(true); }}
                        className="text-amber-400 hover:underline font-bold inline"
                      >
                        [Ler Regras]
                      </button>
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                  acceptedContract ? "bg-emerald-950/30 border-emerald-800/80" : "bg-slate-900/90 border-slate-700 hover:border-slate-600"
                }`}>
                  <input 
                    type="checkbox" 
                    checked={acceptedContract} 
                    onChange={e => setAcceptedContract(e.target.checked)}
                    required
                    className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500 mt-0.5 shrink-0"
                  />
                  <div className="text-xs text-slate-200">
                    <span className="font-bold">2. Termos e Condições Contratuais</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Aceito as cláusulas de locação por temporada autônoma, responsabilidade e políticas de estadia.{" "}
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setTermsModalTab("contract"); setTermsModalOpen(true); }}
                        className="text-indigo-400 hover:underline font-bold inline"
                      >
                        [Ler Contrato]
                      </button>
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(3)} className="border-slate-800 text-slate-300 font-bold text-xs h-11 rounded-xl">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button 
                  disabled={loading || !acceptedHouseRules || !acceptedContract}
                  onClick={handleSubmit} 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs h-11 rounded-xl gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Registrando..." : "Concluir Pré-Checkin"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Modal: Regras da Casa & Termos Contratuais (Com Abas) */}
      <Dialog open={termsModalOpen} onOpenChange={setTermsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Regras da Casa & Termos Contratuais CorpFlats
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Consulte as regras de convivência do imóvel e as cláusulas contratuais da sua locação por temporada.
            </DialogDescription>
          </DialogHeader>

          {/* Abas de Navegação */}
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setTermsModalTab("rules")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                termsModalTab === "rules"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              🏡 1. Regras do Imóvel e Conveniência
            </button>
            <button
              type="button"
              onClick={() => setTermsModalTab("contract")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                termsModalTab === "contract"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              📜 2. Termos e Condições Contratuais
            </button>
          </div>

          <div className="py-3 text-xs leading-relaxed text-slate-300 whitespace-pre-line bg-slate-950 p-4 rounded-2xl border border-slate-800 font-sans max-h-96 overflow-y-auto">
            {termsModalTab === "rules" ? (
              settings?.houseRules || "Carregando regras da casa..."
            ) : (
              settings?.contractTerms || "Carregando contrato de locação..."
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button 
              type="button" 
              onClick={() => {
                setAcceptedHouseRules(true)
                setAcceptedContract(true)
                setTermsModalOpen(false)
              }} 
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
            >
              ✓ Li e Aceito Ambos os Termos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
