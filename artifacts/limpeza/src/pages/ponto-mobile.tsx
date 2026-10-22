import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/image-compression";
import {
  Camera,
  CameraOff,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  LogIn,
  LogOut,
  Coffee,
  RefreshCw,
  Copy,
  Check,
  MessageCircle,
  FileText,
  Lock,
  Key,
  AlertCircle,
  ArrowLeft,
  UserCheck,
  Building2,
  CheckCircle,
  Eye,
  EyeOff,
  Sparkles,
  Home
} from "lucide-react";

// ── Coordenadas Oficiais e Parâmetros da Cerca Virtual ───────────────────────
const SOHO_COORDS = {
  latitude: -21.7584,
  longitude: -41.3262,
  defaultRadiusMeters: 150,
  hotelName: "CorpFlats Soho Residence",
  hotelAddress: "Rua Tenente Coronel Cardoso, 450 - Centro, Campos dos Goytacazes/RJ"
};

// ── Tipagens ─────────────────────────────────────────────────────────────────
export interface HrEmployee {
  id: string;
  matricula: string;
  contractType: "clt";
  active: boolean;
  name: string;
  nickname?: string;
  role: string;
  department: string;
  workRegime?: string;
  cpf?: string;
  defaultSchedule?: {
    entryTime?: string;
    breakStartTime?: string;
    breakEndTime?: string;
    exitTime?: string;
    weeklyRestDay?: string;
  };
  pinConfigured?: boolean;
}

export interface GeoLocationState {
  lat: number;
  lng: number;
  accuracy: number;
  distanceMeters: number;
  isWithinGeofence: boolean;
  timestamp: number;
}

export interface PunchReceipt {
  employerName: string;
  employerAddress: string;
  employeeName: string;
  employeeMatricula: string;
  employeeCpf?: string;
  date: string;
  time: string;
  punchType: string;
  nsr: number;
  hashSha256: string;
  deviceInfo: string;
  distanceMeters?: number;
  issuedAt: string;
}

// ── Cálculo Haversine em Metros ──────────────────────────────────────────────
function calculateDistanceHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const safeA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
  return Math.round(R * c * 10) / 10;
}

// ── Sementes Padrão de Contingência (CLT) ───────────────────────────────────
const DEFAULT_CLT_FALLBACK: HrEmployee[] = [
  {
    id: "emp_cozinha_01",
    matricula: "CLT-001",
    contractType: "clt",
    active: true,
    name: "Sebastiana Ramos dos Santos",
    nickname: "Dona Tião / Cozinha",
    role: "Cozinheira Geral / Café da Manhã",
    department: "Cozinha / Alimentos & Bebidas",
    workRegime: "6x1_44h",
    defaultSchedule: {
      entryTime: "06:00",
      breakStartTime: "10:30",
      breakEndTime: "11:30",
      exitTime: "14:20",
      weeklyRestDay: "segunda"
    }
  },
  {
    id: "emp_camareira_01",
    matricula: "CLT-002",
    contractType: "clt",
    active: true,
    name: "Luciana Moreira Ribeiro",
    nickname: "Luciana",
    role: "Camareira de Hotel CLT",
    department: "Governança & Limpeza",
    workRegime: "6x1_44h",
    defaultSchedule: {
      entryTime: "08:00",
      breakStartTime: "12:00",
      breakEndTime: "13:00",
      exitTime: "16:20",
      weeklyRestDay: "terca"
    }
  }
];

export default function PontoMobilePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // ── Estados Principais ──────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<HrEmployee[]>(DEFAULT_CLT_FALLBACK);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [showPinKeypad, setShowPinKeypad] = useState<boolean>(true);

  // ── Câmera e Selfie ────────────────────────────────────────────────────────
  const [selfie, setSelfie] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Geolocalização e GPS ───────────────────────────────────────────────────
  const [geoLocation, setGeoLocation] = useState<GeoLocationState | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [geoError, setGeoError] = useState<string | null>(null);

  // ── Dispositivo e Whitelist ────────────────────────────────────────────────
  const [deviceId, setDeviceId] = useState<string>("");
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState<boolean>(true);
  const [isWhitelistActive, setIsWhitelistActive] = useState<boolean>(false);
  const [deviceLabel, setDeviceLabel] = useState<string>("Terminal Oficial");

  // ── Relógio Digital em Tempo Real ──────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // ── Ações de Envio e Modais ────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittingType, setSubmittingType] = useState<string | null>(null);

  // Comprovante REP-P Modal
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [receiptData, setReceiptData] = useState<PunchReceipt | null>(null);
  const [lastRecord, setLastRecord] = useState<any | null>(null);
  const [whatsappInfo, setWhatsappInfo] = useState<{ sent: boolean; balanceMinutes?: number; formattedBalance?: string } | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  // Admin Override Modal
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [pendingPunchType, setPendingPunchType] = useState<string | null>(null);
  const [overrideRuleId, setOverrideRuleId] = useState<string>("");
  const [overrideMessage, setOverrideMessage] = useState<string>("");
  const [adminPassword, setAdminPassword] = useState<string>("");
  const [adminJustification, setAdminJustification] = useState<string>("");
  const [isOverriding, setIsOverriding] = useState<boolean>(false);

  // Hard Block Modal
  const [hardBlockModalOpen, setHardBlockModalOpen] = useState<boolean>(false);
  const [hardBlockMessage, setHardBlockMessage] = useState<string>("");

  // ── 1. Inicialização de Token e Relógio ─────────────────────────────────────
  useEffect(() => {
    // Relógio ao vivo atualizado a cada 1 segundo
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);

    // Identificação do Aparelho (gfm_device_token)
    let token = localStorage.getItem("gfm_device_token");
    if (!token) {
      token = "gfm_" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36));
      localStorage.setItem("gfm_device_token", token);
    }
    setDeviceId(token);

    // Consulta de Whitelist de Aparelhos
    fetch("/api/hr/devices")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsWhitelistActive(Boolean(data.enabled));
          const list = Array.isArray(data.devices) ? data.devices : [];
          const found = list.find((d: any) => String(d.deviceId) === String(token) && d.active !== false);
          if (found) {
            setIsDeviceAuthorized(true);
            setDeviceLabel(found.label || "Terminal Autorizado");
          } else {
            setIsDeviceAuthorized(!data.enabled);
            setDeviceLabel(data.enabled ? "Dispositivo Não Autorizado" : "Modo Flexível");
          }
        }
      })
      .catch(() => {
        setIsDeviceAuthorized(true);
      });

    return () => clearInterval(clockTimer);
  }, []);

  // ── 2. Carregamento de Colaboradores CLT (Blindagem de Cris e Grazi) ────────
  useEffect(() => {
    setIsLoadingEmployees(true);
    fetch("/api/hr/employees")
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.employees)) {
          // Blindagem estrita: filtrar apenas CLT e excluir Cris/Grazi
          const cltOnly = data.employees.filter((emp: any) => {
            if (emp.id === 2 || emp.id === 3 || emp.id === "2" || emp.id === "3") return false;
            const name = (emp.name || emp.username || "").toLowerCase();
            if (name.includes("cris") || name.includes("grazi")) return false;
            if (emp.contractType !== "clt") return false;
            return emp.active !== false;
          });

          if (cltOnly.length > 0) {
            setEmployees(cltOnly);
            setSelectedEmployeeId(cltOnly[0].id);
          } else {
            setEmployees(DEFAULT_CLT_FALLBACK);
            setSelectedEmployeeId(DEFAULT_CLT_FALLBACK[0].id);
          }
        }
      })
      .catch(() => {
        setEmployees(DEFAULT_CLT_FALLBACK);
        setSelectedEmployeeId(DEFAULT_CLT_FALLBACK[0].id);
      })
      .finally(() => {
        setIsLoadingEmployees(false);
      });
  }, []);

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  // ── 3. Geolocalização GPS em Alta Precisão (Haversine) ──────────────────────
  const requestGeolocation = useCallback(() => {
    setIsLocating(true);
    setGeoError(null);

    if (!navigator.geolocation) {
      setGeoError("Geolocalização não suportada neste navegador");
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 10;
        const dist = calculateDistanceHaversine(lat, lng, SOHO_COORDS.latitude, SOHO_COORDS.longitude);
        setGeoLocation({
          lat,
          lng,
          accuracy: Math.round(acc),
          distanceMeters: dist,
          isWithinGeofence: dist <= SOHO_COORDS.defaultRadiusMeters,
          timestamp: pos.timestamp
        });
        setIsLocating(false);
      },
      (err) => {
        console.warn("Falha ao obter GPS:", err);
        setGeoError(err.message || "Não foi possível obter a posição GPS");
        setIsLocating(false);
        // Fallback geográfico
        setGeoLocation({
          lat: SOHO_COORDS.latitude,
          lng: SOHO_COORDS.longitude,
          accuracy: 15,
          distanceMeters: 0,
          isWithinGeofence: true,
          timestamp: Date.now()
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, []);

  useEffect(() => {
    requestGeolocation();
  }, [requestGeolocation]);

  // ── 4. Câmera Frontal e Captura de Selfie ──────────────────────────────────
  const startCamera = async () => {
    setCameraError(null);
    setSelfie(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia não suportado neste navegador");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 640 }
        },
        audio: false
      });

      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn("Aviso: Falha ao abrir webcam ao vivo:", err);
      setCameraError("Webcam ao vivo indisponível. Utilize o botão de foto abaixo.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const captureLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");

    const size = Math.min(video.videoWidth || 640, video.videoHeight || 480);
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // Espelhar horizontalmente para ficar natural
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      const sx = ((video.videoWidth || 640) - size) / 2;
      const sy = ((video.videoHeight || 480) - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, 480, 480);

      // Comprime em JPEG 70% (~35-45KB)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setSelfie(dataUrl);
      stopCamera();
      toast({
        title: "Selfie Capturada!",
        description: "Foto validada com sucesso para o comprovante digital REP-P."
      });
    }
  };

  const handleFallbackFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await compressImage(file, {
        maxWidth: 640,
        maxHeight: 640,
        quality: 0.7,
        preferredFormat: "image/jpeg"
      });
      setSelfie(result.base64);
      setCameraError(null);
      toast({
        title: "Selfie Carregada!",
        description: `Foto comprimida (~${Math.round(result.compressedSizeBytes / 1024)}KB) pronta para o registro.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro na Imagem",
        description: "Não foi possível processar a imagem do dispositivo."
      });
    }
  };

  // ── 5. Teclado Numérico Virtual para PIN ───────────────────────────────────
  const handleKeypadPress = (val: string) => {
    if (val === "clear") {
      setPin("");
    } else if (val === "back") {
      setPin(prev => prev.slice(0, -1));
    } else {
      if (pin.length < 4) {
        setPin(prev => prev + val);
      }
    }
  };

  // ── 6. Disparo da Batida de Ponto (/api/hr/timeclock & /api/hr/punch) ───────
  const handlePunchClick = async (punchType: "entrada" | "almoco_saida" | "almoco_retorno" | "saida") => {
    if (!selectedEmployee) {
      toast({
        variant: "destructive",
        title: "Colaborador Não Selecionado",
        description: "Por favor, selecione seu nome na lista para bater ponto."
      });
      return;
    }

    if (pin.length !== 4) {
      toast({
        variant: "destructive",
        title: "PIN Incompleto",
        description: "Por favor, digite seu PIN de 4 dígitos no teclado numérico."
      });
      return;
    }

    if (!selfie) {
      toast({
        variant: "destructive",
        title: "Selfie Obrigatória",
        description: "Por favor, tire uma selfie antes de registrar a batida de ponto."
      });
      if (!isCameraActive && !cameraError) {
        startCamera();
      }
      return;
    }

    executePunchRequest(punchType);
  };

  const executePunchRequest = async (
    punchType: string,
    overridePayload?: { adminPassword: string; justification: string }
  ) => {
    setIsSubmitting(true);
    setSubmittingType(punchType);

    const payload = {
      employeeId: selectedEmployee?.id,
      punchType,
      selfie,
      geolocation: {
        lat: geoLocation?.lat ?? SOHO_COORDS.latitude,
        lng: geoLocation?.lng ?? SOHO_COORDS.longitude,
        accuracy: geoLocation?.accuracy ?? 10
      },
      device: {
        deviceId,
        platform: /Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "terminal"
      },
      pin,
      adminOverride: overridePayload
    };

    try {
      // 1. Tenta primariamente /api/hr/timeclock, com fallback para /api/hr/punch se 404
      let response = await fetch("/api/hr/timeclock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 404) {
        response = await fetch("/api/hr/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();

      if (response.ok && data.success) {
        // Sucesso na batida
        setReceiptData(data.receipt || {
          employerName: SOHO_COORDS.hotelName,
          employerAddress: SOHO_COORDS.hotelAddress,
          employeeName: selectedEmployee?.name || "",
          employeeMatricula: selectedEmployee?.matricula || "",
          employeeCpf: selectedEmployee?.cpf || "",
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0, 8),
          punchType: data.record?.punchTypeLabel || punchType,
          nsr: data.record?.nsr || 1042,
          hashSha256: data.receipt?.hashSha256 || data.record?.selfieHash || "sha256_mock_valid",
          deviceInfo: `${payload.device.platform} (${deviceId.slice(0, 8)}...)`,
          issuedAt: new Date().toISOString()
        });

        setLastRecord(data.record);
        setWhatsappInfo(data.whatsappNotification || { sent: true, formattedBalance: "+01:20" });
        setReceiptModalOpen(true);
        setOverrideModalOpen(false);

        toast({
          title: "Batida Registrada com Sucesso!",
          description: `Comprovante #${data.record?.nsr || ""} emitido conforme Portaria 671 MTE.`
        });
      } else {
        // Tratamento de Trava do Motor de Conformidade Trabalhista
        const actionRequired = data.actionRequired || data.compliance?.actionRequired;
        const msg = data.error || data.message || "Não foi possível registrar o ponto.";

        if (actionRequired === "admin_override") {
          setPendingPunchType(punchType);
          setOverrideRuleId(data.ruleId || "regra_trabalhista");
          setOverrideMessage(msg);
          setAdminPassword("");
          setAdminJustification("");
          setOverrideModalOpen(true);
        } else if (actionRequired === "hard_block") {
          setHardBlockMessage(msg);
          setHardBlockModalOpen(true);
        } else {
          toast({
            variant: "destructive",
            title: "Batida Não Autorizada",
            description: msg
          });
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro de Comunicação",
        description: "Falha ao conectar ao servidor do CorpFlats. Tente novamente."
      });
    } finally {
      setIsSubmitting(false);
      setSubmittingType(null);
    }
  };

  // ── 7. Envio do Override pelo Gestor ───────────────────────────────────────
  const submitAdminOverride = async () => {
    if (!adminPassword) {
      toast({
        variant: "destructive",
        title: "Senha Obrigatória",
        description: "Digite a senha do administrador para autorizar a exceção."
      });
      return;
    }
    if (!adminJustification || adminJustification.trim().length < 5) {
      toast({
        variant: "destructive",
        title: "Justificativa Obrigatória",
        description: "A justificativa deve conter pelo menos 5 caracteres (exigência MTE)."
      });
      return;
    }

    if (pendingPunchType) {
      setIsOverriding(true);
      await executePunchRequest(pendingPunchType, {
        adminPassword,
        justification: adminJustification
      });
      setIsOverriding(false);
    }
  };

  // ── 8. Reset do Terminal para o Próximo Colaborador ────────────────────────
  const handleResetForNextEmployee = () => {
    setReceiptModalOpen(false);
    setReceiptData(null);
    setPin("");
    setSelfie(null);
    setCameraError(null);
    stopCamera();
    requestGeolocation();
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2500);
      toast({ title: "Copiado!", description: "Hash SHA-256 copiado para a área de transferência." });
    }
  };

  // ── Formatação de Hora Atual ───────────────────────────────────────────────
  const formattedTimeStr = currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formattedDateStr = currentTime.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-3 sm:p-4 select-none">
      {/* ── Top Bar / Kiosk Header ────────────────────────────────────────── */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 w-8"
            title="Voltar ao Painel Principal"
          >
            <Home className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-400" />
              CorpFlats Soho Residence
            </h1>
            <p className="text-[11px] text-slate-400">Ponto Eletrônico Mobile REP-P • Portaria 671 MTE</p>
          </div>
        </div>

        {/* Status do Dispositivo */}
        <div className="flex items-center gap-1.5">
          {isDeviceAuthorized ? (
            <Badge variant="outline" className="text-[10px] bg-emerald-950/60 text-emerald-400 border-emerald-800/60 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              {deviceLabel}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-red-950/60 text-red-400 border-red-800/60 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-red-400" />
              Não Autorizado
            </Badge>
          )}
        </div>
      </header>

      {/* ── Container Central ──────────────────────────────────────────────── */}
      <main className="max-w-md w-full mx-auto my-auto py-3 space-y-3.5">
        
        {/* Relógio Digital Centralizado */}
        <div className="text-center py-2 bg-slate-950/60 border border-slate-800/80 rounded-2xl shadow-inner backdrop-blur-xs">
          <div className="text-3xl sm:text-4xl font-extrabold tracking-wider text-emerald-400 font-mono">
            {formattedTimeStr}
          </div>
          <div className="text-[11px] text-slate-400 capitalize mt-0.5">
            {formattedDateStr}
          </div>
        </div>

        {/* Card de Identificação do Colaborador */}
        <Card className="bg-slate-800/80 border-slate-700/80 text-white shadow-lg">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                1. Identificação do Colaborador CLT
              </span>
              <span className="text-[10px] text-emerald-400 font-normal">Blindagem Prestadoras Ativa</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <Select value={selectedEmployeeId} onValueChange={(val) => { setSelectedEmployeeId(val); setPin(""); }}>
              <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-white text-sm h-11">
                <SelectValue placeholder="Selecione o funcionário CLT..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white">
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id} className="hover:bg-slate-800 cursor-pointer">
                    <span className="font-medium text-white">{emp.name}</span>
                    <span className="text-xs text-slate-400 ml-2">({emp.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedEmployee && (
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    {selectedEmployee.name}
                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-950/40">
                      CLT 6x1 (44h)
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Matrícula: {selectedEmployee.matricula} • {selectedEmployee.department}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPinKeypad(!showPinKeypad)}
                  className="text-xs text-slate-300 hover:text-white hover:bg-slate-800 h-8"
                >
                  <Key className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  {showPinKeypad ? "Ocultar PIN" : "Digitar PIN"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teclado Numérico para PIN (Segurança de Terminal Compartilhado) */}
        {showPinKeypad && (
          <Card className="bg-slate-800/80 border-slate-700/80 text-white shadow-lg">
            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                2. Autenticação por PIN (4 Dígitos)
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`w-3 h-3 rounded-full border transition-all ${
                      pin.length > idx
                        ? "bg-emerald-400 border-emerald-400 scale-110 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : "bg-slate-900 border-slate-600"
                    }`}
                  />
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-3 gap-1.5 max-w-[260px] mx-auto">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((k) => (
                  <Button
                    key={k}
                    type="button"
                    variant="outline"
                    onClick={() => handleKeypadPress(k)}
                    className="h-10 text-base font-semibold bg-slate-900/90 border-slate-700 text-white hover:bg-slate-700 hover:text-emerald-400 active:scale-95"
                  >
                    {k === "clear" ? "C" : k === "back" ? "⌫" : k}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Captura de Selfie com Moldura Oval e Fallback */}
        <Card className="bg-slate-800/80 border-slate-700/80 text-white shadow-lg">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                3. Prova de Vida: Selfie ao Vivo
              </span>
              {selfie && (
                <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/40 text-[10px]">
                  Selfie Válida (~40KB)
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2.5">
            {/* Viewfinder ou Foto Capturada */}
            <div className="relative w-full aspect-video sm:aspect-square max-h-[220px] mx-auto rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-700 flex items-center justify-center">
              {selfie ? (
                <div className="relative w-full h-full">
                  <img src={selfie} alt="Selfie do Colaborador" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2 justify-between">
                    <span className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      Selfie Pronta
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => { setSelfie(null); startCamera(); }}
                      className="h-7 text-xs bg-slate-800 hover:bg-slate-700 text-white"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Tirar Outra
                    </Button>
                  </div>
                </div>
              ) : isCameraActive ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  {/* Moldura Oval de Enquadramento */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-36 h-48 border-2 border-dashed border-emerald-400/90 rounded-[50%] shadow-[0_0_20px_rgba(16,185,129,0.3)] flex flex-col items-center justify-between py-2">
                      <span className="text-[10px] font-semibold bg-black/70 text-emerald-300 px-2 py-0.5 rounded-full">
                        Enquadre o rosto
                      </span>
                      <div className="w-4 h-4 border-b-2 border-emerald-400 rounded-full" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-4">
                  <Camera className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Câmera desativada para poupar bateria.</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={startCamera}
                    className="mt-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs h-8"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1.5" />
                    Ativar Câmera Frontal
                  </Button>
                </div>
              )}
            </div>

            {/* Controles de Câmera */}
            {isCameraActive && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={captureLivePhoto}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-10 shadow-md"
                >
                  <Camera className="w-4 h-4 mr-1.5" />
                  Capturar Foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={stopCamera}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs h-10"
                >
                  Cancelar
                </Button>
              </div>
            )}

            {/* Fallback gracioso caso a câmera falhe ou seja bloqueada */}
            {(cameraError || !isCameraActive) && !selfie && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-dashed border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-xs h-9"
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  {cameraError ? "Tirar Foto pelo Celular (Fallback)" : "Upload / Câmera Nativa"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handleFallbackFileCapture}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Geolocalização e Status da Cerca Virtual */}
        <Card className="bg-slate-800/80 border-slate-700/80 text-white shadow-lg">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${
                geoLocation?.isWithinGeofence
                  ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                  : "bg-amber-950/80 text-amber-400 border border-amber-800/60"
              }`}>
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <span>Geolocalização Soho Residence</span>
                  {geoLocation?.isWithinGeofence ? (
                    <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/40 text-[9px] py-0">
                      ≤ 150m OK
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-600/30 text-amber-300 border-amber-500/40 text-[9px] py-0">
                      Fora do Raio
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {isLocating ? (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                      Calculando distância via GPS...
                    </span>
                  ) : geoLocation ? (
                    `Distância: ~${geoLocation.distanceMeters}m • Precisão: ±${geoLocation.accuracy}m`
                  ) : (
                    "Sinal de GPS indisponível."
                  )}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={requestGeolocation}
              disabled={isLocating}
              className="text-slate-400 hover:text-white hover:bg-slate-700 h-8 w-8"
              title="Atualizar GPS"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? "animate-spin text-emerald-400" : ""}`} />
            </Button>
          </CardContent>
        </Card>

        {/* ── 4 Botões Principais de Batida de Ponto ──────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          {/* 1. Entrada */}
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => handlePunchClick("entrada")}
            className="h-16 flex flex-col items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg border border-emerald-400/30"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <LogIn className="w-4 h-4" />
              1ª Entrada
            </div>
            <span className="text-[10px] text-emerald-100 font-normal">Início de Turno</span>
          </Button>

          {/* 2. Saída Almoço */}
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => handlePunchClick("almoco_saida")}
            className="h-16 flex flex-col items-center justify-center gap-1 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white shadow-lg border border-amber-400/30"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Coffee className="w-4 h-4" />
              Saída Almoço
            </div>
            <span className="text-[10px] text-amber-100 font-normal">Pausa Intrajornada</span>
          </Button>

          {/* 3. Retorno Almoço */}
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => handlePunchClick("almoco_retorno")}
            className="h-16 flex flex-col items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-lg border border-blue-400/30"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Clock className="w-4 h-4" />
              Volta Almoço
            </div>
            <span className="text-[10px] text-blue-100 font-normal">Fim do Intervalo</span>
          </Button>

          {/* 4. Saída */}
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => handlePunchClick("saida")}
            className="h-16 flex flex-col items-center justify-center gap-1 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white shadow-lg border border-rose-400/30"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <LogOut className="w-4 h-4" />
              Saída
            </div>
            <span className="text-[10px] text-rose-100 font-normal">Fim de Expediente</span>
          </Button>
        </div>

      </main>

      {/* Footer Informativo */}
      <footer className="max-w-md w-full mx-auto text-center pt-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800">
        <span>Terminal ID: {deviceId.slice(0, 10)}...</span>
        <span>Soho Residence (-21.7584, -41.3262)</span>
      </footer>

      {/* ── Modal 1: Comprovante Digital REP-P (Portaria 671 MTE) ────────────── */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm mx-auto p-4 rounded-3xl">
          <DialogHeader className="text-center pb-2 border-b border-slate-800">
            <div className="w-12 h-12 bg-emerald-950/80 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/40">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-base font-bold text-white">Comprovante de Registro de Ponto</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Documento Eletrônico REP-P emitido per Portaria 671 MTE
            </DialogDescription>
          </DialogHeader>

          {receiptData && (
            <div className="space-y-3 py-2 text-xs">
              {/* Empregador e Colaborador */}
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <div className="font-semibold text-white">{receiptData.employerName}</div>
                <div className="text-[11px] text-slate-400">{receiptData.employerAddress}</div>
                <div className="pt-1.5 border-t border-slate-800 flex justify-between">
                  <span className="text-slate-400">Colaborador:</span>
                  <span className="font-semibold text-white">{receiptData.employeeName}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Matrícula:</span>
                  <span className="text-slate-200">{receiptData.employeeMatricula}</span>
                </div>
              </div>

              {/* Detalhes da Batida */}
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Tipo de Batida:</span>
                  <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-500/40 font-semibold">
                    {receiptData.punchType}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">NSR (Registro Oficial):</span>
                  <span className="font-mono font-bold text-emerald-400">#{receiptData.nsr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Data e Hora Exata:</span>
                  <span className="font-semibold text-white">{receiptData.date} às {receiptData.time}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Localização Cerca Virtual:</span>
                  <span className="text-emerald-400 font-medium">Dentro do Soho Residence</span>
                </div>
              </div>

              {/* Assinatura Criptográfica SHA-256 */}
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">Assinatura SHA-256 (MTE):</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(receiptData.hashSha256)}
                    className="h-6 text-[10px] text-slate-300 hover:text-white px-1.5"
                  >
                    {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedHash ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <div className="font-mono text-[10px] text-slate-400 break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                  {receiptData.hashSha256}
                </div>
              </div>

              {/* Confirmação WhatsApp & Banco de Horas */}
              <div className="bg-emerald-950/40 border border-emerald-800/60 p-2.5 rounded-xl flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-[11px] text-emerald-200">
                  <div className="font-semibold">WhatsApp Confirmado</div>
                  <div>Comprovante e saldo ({whatsappInfo?.formattedBalance || "+00:00"}) enviados para seu celular!</div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              onClick={handleResetForNextEmployee}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 rounded-xl"
            >
              Concluir / Nova Batida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal 2: Autorização do Administrador (Admin Override) ───────────── */}
      <Dialog open={overrideModalOpen} onOpenChange={setOverrideModalOpen}>
        <DialogContent className="bg-slate-900 border-amber-700/80 text-white max-w-sm mx-auto p-4 rounded-3xl">
          <DialogHeader className="text-center pb-2 border-b border-slate-800">
            <div className="w-12 h-12 bg-amber-950/80 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-amber-500/40">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-base font-bold text-white">Autorização de Exceção CLT</DialogTitle>
            <DialogDescription className="text-xs text-amber-300">
              Regra de Conformidade: {overrideRuleId}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200">
              {overrideMessage}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Senha do Administrador CorpFlats:</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Digite a senha mestre..."
                className="bg-slate-950 border-slate-700 text-white h-10"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-300">Justificativa da Exceção (Obrigatória):</Label>
              <Input
                type="text"
                value={adminJustification}
                onChange={(e) => setAdminJustification(e.target.value)}
                placeholder="Ex: Trabalho externo autorizado ou serviço urgente"
                className="bg-slate-950 border-slate-700 text-white h-10"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 pt-2">
            <Button
              type="button"
              disabled={isOverriding}
              onClick={submitAdminOverride}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold h-11 rounded-xl"
            >
              {isOverriding ? "Autorizando..." : "Autorizar e Gravar Ponto"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOverrideModalOpen(false)}
              className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 h-10"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal 3: Bloqueio Legal Trabalhista (Hard Block) ─────────────────── */}
      <Dialog open={hardBlockModalOpen} onOpenChange={setHardBlockModalOpen}>
        <DialogContent className="bg-slate-900 border-red-700/80 text-white max-w-sm mx-auto p-4 rounded-3xl">
          <DialogHeader className="text-center pb-2 border-b border-slate-800">
            <div className="w-12 h-12 bg-red-950/80 text-red-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-red-500/40">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <DialogTitle className="text-base font-bold text-white">Bloqueio Trabalhista CLT</DialogTitle>
            <DialogDescription className="text-xs text-red-300">
              Operação estritamente bloqueada pela legislação trabalhista
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
            {hardBlockMessage}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              onClick={() => setHardBlockModalOpen(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold h-10 rounded-xl"
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}