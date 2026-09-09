import { useState, useEffect, useRef, useMemo } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  CalendarDays, Plus, ChevronLeft, ChevronRight, Search, 
  Calendar as CalendarIcon, User, Users, Phone, Mail, ShieldAlert, CheckCircle2,
  Clock, DollarSign, BedDouble, AlertTriangle, Lock, Trash2, Edit3, MessageCircle, KeyRound, Sparkles, FileText, Tag, Coffee, Building2, Wind, Zap, Bed, Check, RotateCcw, AlertCircle, RefreshCw, SlidersHorizontal, Copy,
  LogIn, LogOut, TrendingUp, Send, ChevronDown, ChevronUp, History, ArrowRight, CreditCard, ExternalLink, QrCode, Link2, DoorOpen
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { 
  format, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, isToday, isYesterday, parseISO, differenceInDays 
} from "date-fns"
import { ptBR } from "date-fns/locale"

const CHANNEL_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  site: { label: "Site Próprio", bg: "bg-indigo-600", text: "text-white", border: "border-indigo-700" },
  whatsapp: { label: "WhatsApp", bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700" },
  direta: { label: "WhatsApp", bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700" },
  booking: { label: "Booking", bg: "bg-sky-700", text: "text-white", border: "border-sky-800" },
  airbnb: { label: "Airbnb", bg: "bg-rose-600", text: "text-white", border: "border-rose-700" },
}

import { AccessDenied } from "@/components/access-denied"
import { FLAT_AMENITIES_CATALOG, AMENITY_CATEGORIES, renderAmenityIcon, getFlatActiveAmenities, FlatAmenityDefinition } from "@/lib/flat-amenities"
import { ReservationHoverCard } from "@/components/reservation-hover-card"
import { useQuickMessages, renderQuickMessage, WhatsAppQuickMessage } from "@/hooks/use-quick-messages"




export default function PmsCalendar() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const { data: user, isLoading: loadingUser } = useGetMe()

  const [currentDate, setCurrentDate] = useState(new Date())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<{ flats: any[]; reservations: any[]; blocks: any[]; guests?: any[] }>({
    flats: [],
    reservations: [],
    blocks: [],
    guests: []
  })
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [cleaningFilter, setCleaningFilter] = useState<"all" | "dirty" | "clean">("all")
  const [specialFilter, setSpecialFilter] = useState<"all" | "minors" | "risk">("all")
  const [breakfastStats, setBreakfastStats] = useState<{
    todayOrders: number;
    todayGuests: number;
    tomorrowOrders: number;
    tomorrowGuests: number;
  } | null>(null)

  // Modal States
  const [resModalOpen, setResModalOpen] = useState(false)
  const [selectedRes, setSelectedRes] = useState<any | null>(null)
  const [savingRes, setSavingRes] = useState(false)
  const [mobileCardResId, setMobileCardResId] = useState<number | string | null>(null)

  // Mensagens Rápidas (Manuais) do WhatsApp
  const { activeQuickMessages, dispatchQuickMessage } = useQuickMessages()
  const [hoveredModalQuickMsg, setHoveredModalQuickMsg] = useState<WhatsAppQuickMessage | null>(null)
  const [modalSendingMsgId, setModalSendingMsgId] = useState<string | null>(null)

  // Form fields
  const [formFlatId, setFormFlatId] = useState("")
  const isFlatManuallyChangedRef = useRef(false)
  const [formGuestName, setFormGuestName] = useState("")
  const [formGuestPhone, setFormGuestPhone] = useState("")
  const [formGuestEmail, setFormGuestEmail] = useState("")
  const [formCheckin, setFormCheckin] = useState(format(new Date(), "yyyy-MM-dd"))
  const [formCheckout, setFormCheckout] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"))
  const [formCheckinTime, setFormCheckinTime] = useState("14:00")
  const [formCheckoutTime, setFormCheckoutTime] = useState("12:00")
  const [defaultCheckinTime, setDefaultCheckinTime] = useState("14:00")
  const [defaultCheckoutTime, setDefaultCheckoutTime] = useState("12:00")
  const [formChannel, setFormChannel] = useState("whatsapp")
  const [formDailyRate, setFormDailyRate] = useState("250")
  const [formTotalAmount, setFormTotalAmount] = useState("")
  const [formPaidAmount, setFormPaidAmount] = useState("0")
  const [formPaymentStatus, setFormPaymentStatus] = useState("pendente")
  const [formStatus, setFormStatus] = useState<"confirmada" | "pre_reserva">("pre_reserva")
  const [formNotes, setFormNotes] = useState("")
  const [formEarlyCheckin, setFormEarlyCheckin] = useState(false)
  const [formReceptionNotes, setFormReceptionNotes] = useState("")
  const [formAutoInvoice, setFormAutoInvoice] = useState(false)
  const [formPrefersHighFloor, setFormPrefersHighFloor] = useState(false)
  const [formTwinBeds, setFormTwinBeds] = useState(false)
  const [formExtraMattress, setFormExtraMattress] = useState(false)
  const [formIncludeBreakfast, setFormIncludeBreakfast] = useState(false)
  const [formSpecialRequests, setFormSpecialRequests] = useState("")

  // Modal Tabs, Audit Logs & Communications State
  const [resModalTab, setResModalTab] = useState<"details" | "audit" | "communications" | "links">("details")
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [communications, setCommunications] = useState<any[]>([])
  const [loadingComms, setLoadingComms] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [expandedCommId, setExpandedCommId] = useState<string | null>(null)
  const [manualRecipient, setManualRecipient] = useState("")
  const [manualSubject, setManualSubject] = useState("")
  const [manualBody, setManualBody] = useState("")
  const [resendingCommId, setResendingCommId] = useState<string | null>(null)
  const [portariaEmail, setPortariaEmail] = useState("portaria.soho@corpflats.com.br")
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null)

  const fetchAuditLogs = async (resIdOrCode: string | number) => {
    if (!resIdOrCode) return
    setLoadingAudit(true)
    try {
      const res = await fetch(`/api/pms/reservations/${resIdOrCode}/audit-logs`, { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json.auditLogs)) {
          setAuditLogs(json.auditLogs)
        }
      }
    } catch (e) {
      console.error("Erro ao buscar logs de auditoria:", e)
    } finally {
      setLoadingAudit(false)
    }
  }

  const fetchCommunications = async (resIdOrCode: string | number) => {
    if (!resIdOrCode) return
    setLoadingComms(true)
    try {
      const res = await fetch(`/api/pms/reservations/${resIdOrCode}/communications`, { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        setCommunications(Array.isArray(json) ? json : [])
      }
    } catch (e) {
      console.error("Erro ao buscar comunicações:", e)
    } finally {
      setLoadingComms(false)
    }
  }

  const handleSendManualEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRes || !manualRecipient.trim() || !manualSubject.trim() || !manualBody.trim()) return
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/pms/reservations/${selectedRes.code || selectedRes.id}/communications/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: manualRecipient.trim(),
          subject: manualSubject.trim(),
          body: manualBody.trim()
        }),
        credentials: "include"
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast({ title: "✓ E-mail enviado!", description: `Mensagem disparada para ${manualRecipient.trim()}` })
        setManualBody("")
        fetchCommunications(selectedRes.code || selectedRes.id)
      } else {
        toast({ title: "Falha ao enviar", description: json.error || "Verifique as configurações SMTP.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setSendingEmail(false)
    }
  }

  const handleResendEmail = async (commId: string) => {
    setResendingCommId(commId)
    try {
      const res = await fetch(`/api/pms/reservations/communications/${commId}/resend`, {
        method: "POST",
        credentials: "include"
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast({ title: "✓ Reenvio solicitado!", description: json.message })
        if (selectedRes) fetchCommunications(selectedRes.code || selectedRes.id)
      } else {
        toast({ title: "Falha no reenvio", description: json.error || "O servidor não conseguiu reenviar.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" })
    } finally {
      setResendingCommId(null)
    }
  }

  const fetchFairShare = async (cin: string, cout: string, excludeId: any = null) => {
    if (!cin || !cout) return
    setLoadingFairShare(true)
    try {
      const url = `/api/pms/fair-share-flat?checkin=${cin}&checkout=${cout}${excludeId ? `&excludeResId=${excludeId}` : ''}`
      const res = await fetch(url, { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        setFairShareResult(json)
        return json
      }
    } catch {} finally {
      setLoadingFairShare(false)
    }
  }

  useEffect(() => {
    if (resModalOpen) {
      fetchCrmGuests()
      fetchCompanies()
    }
    if (resModalOpen && formCheckin && formCheckout) {
      fetchFairShare(formCheckin, formCheckout, selectedRes?.id).then((result) => {
        if (!selectedRes && result?.bestFlatId && !isFlatManuallyChangedRef.current) {
          setFormFlatId(String(result.bestFlatId))
        }
      })
    }
  }, [resModalOpen, formCheckin, formCheckout])

  // Flat Tags Modal State
  const [flatTagsModalOpen, setFlatTagsModalOpen] = useState(false)
  const [selectedFlatForTags, setSelectedFlatForTags] = useState<any | null>(null)
  const [flatTags, setFlatTags] = useState<string[]>([])
  const [flatAirType, setFlatAirType] = useState("split")
  const [flatBedType, setFlatBedType] = useState("casal")
  const [flatHasMicrowave, setFlatHasMicrowave] = useState(true)
  const [flatCustomTagInput, setFlatCustomTagInput] = useState("")
  const [customEmojiSelected, setCustomEmojiSelected] = useState("🏷️")

  // Amenities Catalog & Modal Filter State
  const [amenitySearch, setAmenitySearch] = useState("")
  const [amenityCategoryFilter, setAmenityCategoryFilter] = useState("all")
  const [showFullCatalog, setShowFullCatalog] = useState(false)

  // Essential Tags Drag & Drop Management
  const [essentialTagIds, setEssentialTagIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("gfm_essential_tags");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      "cama_casal", "2_camas_solteiro", "ar_split", "ar_janela", "microondas",
      "frigobar", "cafeteira", "cozinha_completa", "wifi_alta_velocidade",
      "home_office", "smart_tv", "fechadura_digital", "garagem_coberta",
      "elevador", "portaria_24h", "piscina", "academia", "aceita_pet",
      "proibido_fumar", "foco_corporativo", "longa_estadia", "reformado"
    ];
  });
  const [essentialConfigModalOpen, setEssentialConfigModalOpen] = useState(false);
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);

  // Carrega tags essenciais do servidor se disponíveis
  useEffect(() => {
    fetch("/api/pms/amenities/essential-tags")
      .then(r => r.json())
      .then(d => {
        if (d.essentialTagIds && Array.isArray(d.essentialTagIds)) {
          setEssentialTagIds(d.essentialTagIds);
          localStorage.setItem("gfm_essential_tags", JSON.stringify(d.essentialTagIds));
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveEssentialTags = async (newIds: string[]) => {
    setEssentialTagIds(newIds);
    localStorage.setItem("gfm_essential_tags", JSON.stringify(newIds));
    try {
      await fetch("/api/pms/amenities/essential-tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ essentialTagIds: newIds })
      });
    } catch (e) {}
  };


  const [savingFlatTags, setSavingFlatTags] = useState(false)

  // Fair-Share & Conflito State
  const [fairShareResult, setFairShareResult] = useState<any | null>(null)
  const [loadingFairShare, setLoadingFairShare] = useState(false)
  const [formForceReplace, setFormForceReplace] = useState(false)
  const [formIsMonthlyGuest, setFormIsMonthlyGuest] = useState(false)


  // Multi-Guest & Corporate Requester State
  const [formGuestCount, setFormGuestCount] = useState<"1" | "2" | "3">("1")
  const [formRequesterType, setFormRequesterType] = useState<"guest" | "other_person" | "company">("guest")
  const [formRequesterName, setFormRequesterName] = useState("")
  const [formRequesterPhone, setFormRequesterPhone] = useState("")
  const [formRequesterEmail, setFormRequesterEmail] = useState("")
  const [formRequesterCpf, setFormRequesterCpf] = useState("")
  const [formCompanyId, setFormCompanyId] = useState("")
  const [formCompanyName, setFormCompanyName] = useState("")
  const [companies, setCompanies] = useState<any[]>([])
  const [crmGuests, setCrmGuests] = useState<any[]>([])
  const [formGuestId, setFormGuestId] = useState("")
  const [guestSearchFilter, setGuestSearchFilter] = useState("")

  // Guests individual fields
  const [formGuest1Cpf, setFormGuest1Cpf] = useState("")
  const [formGuest2Name, setFormGuest2Name] = useState("")
  const [formGuest2Cpf, setFormGuest2Cpf] = useState("")
  const [formGuest2Phone, setFormGuest2Phone] = useState("")
  const [formGuest2Email, setFormGuest2Email] = useState("")
  const [formGuest3Name, setFormGuest3Name] = useState("")
  const [formGuest3Cpf, setFormGuest3Cpf] = useState("")
  const [formGuest3Phone, setFormGuest3Phone] = useState("")
  const [formGuest3Email, setFormGuest3Email] = useState("")

  // Block Modal
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockFlatId, setBlockFlatId] = useState("")
  const [blockStart, setBlockStart] = useState(format(new Date(), "yyyy-MM-dd"))
  const [blockEnd, setBlockEnd] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"))
  const [blockReason, setBlockReason] = useState("manutencao")
  const [blockNotes, setBlockNotes] = useState("")


  // ── MOTOR GANTT: ARRASTAR, MOVER ENTRE QUARTOS E REDIMENSIONAR ESTADIAS ──
  interface ResDragState {
    res: any;
    originFlatId: number;
    originFlatNumber: string;
    originCheckin: string;
    originCheckout: string;
    nightsCount: number;
    mode: "move" | "resize-left" | "resize-right";
    startPointerX: number;
    startPointerY: number;
    pointerType: "mouse" | "touch" | "pen";
    hasMoved: boolean;
    isLongPressReady?: boolean;
    currentFlatId: number;
    currentFlatNumber: string;
    currentCheckin: string;
    currentCheckout: string;
  }

  const [resDragState, setResDragState] = useState<ResDragState | null>(null);
  const resDragStateRef = useRef<ResDragState | null>(null);
  resDragStateRef.current = resDragState;

  const [longPressActiveResId, setLongPressActiveResId] = useState<number | string | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const lastToggleCardTimeRef = useRef<number>(0);

  // Helper robusto para encontrar a célula do calendário sob coordenadas (x, y) mesmo com overlays
  const getCellFromPoint = (x: number, y: number): HTMLElement | null => {
    if (typeof document.elementsFromPoint === "function") {
      const elements = document.elementsFromPoint(x, y);
      for (const el of elements) {
        const cell = el.closest?.("[data-calendar-cell='true']") as HTMLElement;
        if (cell) return cell;
      }
    }
    const el = document.elementFromPoint(x, y);
    return (el?.closest?.("[data-calendar-cell='true']") as HTMLElement) || null;
  };

  const handleStartResDrag = (
    resItem: any, 
    flat: any, 
    mode: "move" | "resize-left" | "resize-right", 
    e: React.PointerEvent | React.MouseEvent
  ) => {
    if ((e as React.MouseEvent).button !== undefined && (e as React.MouseEvent).button !== 0) return;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Ignora eventos de mouse sintéticos que o navegador emite logo após toque em tela touch
    if (e.type === "mousedown" && Date.now() - lastTouchTimeRef.current < 600) {
      return;
    }

    const isTouchEvt = (e as any).pointerType === "touch" || (e as any).pointerType === "pen" || e.type.startsWith("touch");
    if (isTouchEvt) {
      lastTouchTimeRef.current = Date.now();
    }

    e.stopPropagation();

    const pointerType = (e as any).pointerType || 
      ((typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 1024)) ? "touch" : "mouse");

    const isTouch = pointerType === "touch";

    // No desktop (mouse): inicia arraste imediatamente
    if (!isTouch) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }

    const nights = differenceInDays(parseISO(resItem.checkoutDate), parseISO(resItem.checkinDate)) || 1;
    const isResize = mode === "resize-left" || mode === "resize-right";

    const initialDragState: ResDragState = {
      res: resItem,
      originFlatId: flat.id,
      originFlatNumber: flat.number,
      originCheckin: resItem.checkinDate,
      originCheckout: resItem.checkoutDate,
      nightsCount: nights,
      mode,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      pointerType,
      hasMoved: false,
      isLongPressReady: !isTouch || isResize, // Na borda (esticar/encolher) ou mouse: pronto IMEDIATAMENTE!
      currentFlatId: flat.id,
      currentFlatNumber: flat.number,
      currentCheckin: resItem.checkinDate,
      currentCheckout: resItem.checkoutDate
    };

    setResDragState(initialDragState);
    resDragStateRef.current = initialDragState;

    if (isResize) {
      // Borda das pontas: ativa imediatamente ao tocar/clicar sem precisar esperar
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "hidden";
        scrollContainerRef.current.style.touchAction = "none";
      }
      setLongPressActiveResId(resItem.id);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(35);
        } catch (_) {}
      }
    } else if (isTouch) {
      // Mover reserva no celular: 2 segundos (2000ms) de pressão estática antes de armar o arraste
      longPressTimerRef.current = setTimeout(() => {
        if (resDragStateRef.current) {
          resDragStateRef.current.isLongPressReady = true;
          resDragStateRef.current.mode = "move";
        }

        // Trava imediatamente o container contra scroll horizontal nativo
        if (scrollContainerRef.current) {
          scrollContainerRef.current.style.overflowX = "hidden";
          scrollContainerRef.current.style.touchAction = "none";
        }

        setLongPressActiveResId(resItem.id);
        setResDragState(prev => {
          if (!prev || prev.res.id !== resItem.id) return prev;
          return { ...prev, mode: "move", isLongPressReady: true };
        });

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate([60, 50, 80]);
          } catch (_) {}
        }
      }, 2000);
    }
  };

  useEffect(() => {
    if (!resDragState) return;

    // Resolução de célula / apartamento / data com DOM + fallback geométrico contínuo
    const resolveTargetFromCoords = (clientX: number, clientY: number): { flatId: number; flatNum: string; dayStr: string } | null => {
      const current = resDragStateRef.current;
      if (!current) return null;

      let foundFlatId: number | null = null;
      let foundDayStr: string | null = null;

      // 1. Tenta identificar via célula do DOM
      const cell = getCellFromPoint(clientX, clientY);
      if (cell) {
        const fId = Number(cell.getAttribute("data-flat-id"));
        const dStr = cell.getAttribute("data-day-str");
        if (fId && dStr) {
          foundFlatId = fId;
          foundDayStr = dStr;
        }
      }

      // 2. Fallback geométrico de alta precisão (à prova de falhas)
      if ((!foundFlatId || !foundDayStr) && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const cRect = container.getBoundingClientRect();

        // 2a. Resolução horizontal do dia
        if (!foundDayStr) {
          const scrollLeft = container.scrollLeft;
          const timelineX = clientX - cRect.left + scrollLeft;
          for (let i = 0; i < daysInView.length; i++) {
            const dStr = format(daysInView[i], "yyyy-MM-dd");
            const layout = dayLayoutMap[dStr];
            if (layout && timelineX >= layout.left && timelineX < layout.left + layout.width) {
              foundDayStr = dStr;
              break;
            }
          }
          if (!foundDayStr) {
            if (timelineX < FLAT_COL_WIDTH) {
              foundDayStr = format(daysInView[0], "yyyy-MM-dd");
            } else {
              foundDayStr = format(daysInView[daysInView.length - 1], "yyyy-MM-dd");
            }
          }
        }

        // 2b. Resolução vertical do apartamento
        if (!foundFlatId) {
          if (current.mode !== "move") {
            foundFlatId = current.originFlatId;
          } else {
            const rows = container.querySelectorAll<HTMLElement>("[data-flat-row-id]");
            for (let i = 0; i < rows.length; i++) {
              const rRect = rows[i].getBoundingClientRect();
              if (clientY >= rRect.top && clientY <= rRect.bottom) {
                const rId = Number(rows[i].getAttribute("data-flat-row-id"));
                if (rId) {
                  foundFlatId = rId;
                  break;
                }
              }
            }
          }
        }
      }

      const finalFlatId = (current.mode === "move" ? foundFlatId : current.originFlatId) || current.currentFlatId;
      const finalDayStr = foundDayStr || current.currentCheckin;
      const targetFlat = data.flats.find(f => f.id === finalFlatId);
      const targetFlatNum = targetFlat?.number || String(finalFlatId);

      return { flatId: finalFlatId, flatNum: targetFlatNum, dayStr: finalDayStr };
    };

    // Função unificada para processar o movimento do arraste (mouse ou touch)
    const processDragMove = (clientX: number, clientY: number) => {
      const current = resDragStateRef.current;
      if (!current) return;

      const dx = Math.abs(clientX - current.startPointerX);
      const dy = Math.abs(clientY - current.startPointerY);

      // Se for touch no celular e ainda estiver aguardando o timer de 2 segundos (modo mover):
      if (current.pointerType === "touch" && !current.isLongPressReady) {
        // Se o dedo se mover mais de 25px antes dos 2 segundos, o usuário está rolando a página normalmente
        if (dx > 25 || dy > 25) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          if (scrollContainerRef.current) {
            scrollContainerRef.current.style.overflowX = "";
            scrollContainerRef.current.style.touchAction = "";
          }
          setLongPressActiveResId(null);
          setResDragState(null);
        }
        return;
      }

      // Já ativou o modo (borda imediata, long press 2s pronto ou desktop):
      if (!current.hasMoved && (dx > 4 || dy > 4)) {
        current.hasMoved = true;
      }

      // Auto-scroll horizontal suave SOMENTE se o dedo chegar bem perto dos extremos da tela
      if (scrollContainerRef.current) {
        const edgeZone = 60; // 60px da borda da tela
        if (clientX > window.innerWidth - edgeZone) {
          scrollContainerRef.current.scrollLeft += 12;
        } else if (clientX < edgeZone + 50) {
          scrollContainerRef.current.scrollLeft -= 12;
        }
      }

      const target = resolveTargetFromCoords(clientX, clientY);
      if (!target) return;

      setResDragState(prev => {
        if (!prev) return null;
        let newCheckin = prev.currentCheckin;
        let newCheckout = prev.currentCheckout;

        if (prev.mode === "move") {
          newCheckin = target.dayStr;
          newCheckout = format(addDays(parseISO(target.dayStr), prev.nightsCount), "yyyy-MM-dd");
        } else if (prev.mode === "resize-left") {
          if (target.dayStr < prev.originCheckout) {
            newCheckin = target.dayStr;
            newCheckout = prev.originCheckout;
          }
        } else if (prev.mode === "resize-right") {
          if (target.dayStr > prev.originCheckin) {
            newCheckin = prev.originCheckin;
            newCheckout = target.dayStr;
          }
        }

        const actualFlatId = prev.mode === "move" ? target.flatId : prev.originFlatId;
        const actualFlatNum = prev.mode === "move" ? target.flatNum : prev.originFlatNumber;

        const updated: ResDragState = {
          ...prev,
          hasMoved: true,
          currentFlatId: actualFlatId,
          currentFlatNumber: actualFlatNum,
          currentCheckin: newCheckin,
          currentCheckout: newCheckout
        };
        resDragStateRef.current = updated;
        return updated;
      });
    };

    const finishResDrag = async () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setLongPressActiveResId(null);

      // Destrava o container de scroll
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }

      const current = resDragStateRef.current;
      if (!current) return;

      // Se não houve movimento:
      if (!current.hasMoved) {
        if (current.mode === "move") {
          // Se estava em long-press pronto e soltou sem mover, encerra sem abrir modal/card
          if (current.isLongPressReady && current.pointerType === "touch") {
            setResDragState(null);
            return;
          }

          const isTouch = 
            current.pointerType === "touch" || 
            Date.now() - lastTouchTimeRef.current < 600 ||
            (typeof window !== "undefined" && (
              window.matchMedia("(pointer: coarse)").matches || 
              window.innerWidth < 1024
            ));

          if (isTouch) {
            // Toque rápido no celular: abre/fecha o card flutuante de ações rápidas
            const now = Date.now();
            if (now - lastToggleCardTimeRef.current > 400) {
              lastToggleCardTimeRef.current = now;
              setMobileCardResId(prev => (prev === current.res.id ? null : current.res.id));
            }
          } else {
            // Clique no desktop (mouse): abre o modal completo de edição
            handleOpenEditRes(current.res);
          }
        }
        setResDragState(null);
        return;
      }

      // Se for touch e mode 'move' mas NÃO completou long-press: ignora
      if (current.pointerType === "touch" && current.mode === "move" && !current.isLongPressReady) {
        setResDragState(null);
        return;
      }

      const changed = (
        current.currentFlatId !== current.originFlatId ||
        current.currentCheckin !== current.originCheckin ||
        current.currentCheckout !== current.originCheckout
      );

      if (!changed) {
        setResDragState(null);
        return;
      }

      // Validação de Conflitos
      const hasConflict = data.reservations.some(r => {
        if (r.id === current.res.id || r.status === "cancelada") return false;
        const sameFlat = r.flatId === current.currentFlatId || String(r.flatNumber) === String(current.currentFlatNumber);
        if (!sameFlat) return false;
        return r.checkinDate < current.currentCheckout && r.checkoutDate > current.currentCheckin;
      });

      const hasBlockConflict = data.blocks.some(b => {
        const sameFlat = b.flatId === current.currentFlatId || String(b.flatNumber) === String(current.currentFlatNumber);
        if (!sameFlat) return false;
        return b.startDate <= current.currentCheckout && b.endDate >= current.currentCheckin;
      });

      if (hasConflict || hasBlockConflict) {
        alert(`Não foi possível alterar a reserva: o Apt ${current.currentFlatNumber} já possui ocupação ou bloqueio no período (${format(parseISO(current.currentCheckin), "dd/MM")} a ${format(parseISO(current.currentCheckout), "dd/MM")}).`);
        setResDragState(null);
        return;
      }

      try {
        const payload = {
          flatId: current.currentFlatId,
          checkinDate: current.currentCheckin,
          checkoutDate: current.currentCheckout,
          checkinTime: current.res.checkinTime || defaultCheckinTime || "14:00",
          checkoutTime: current.res.checkoutTime || defaultCheckoutTime || "12:00",
          source: current.mode === "move" ? "PMS Calendário (Arrastar & Soltar)" : "PMS Calendário (Ajuste de Diárias)"
        };

        // Otimista
        setData(prev => ({
          ...prev,
          reservations: prev.reservations.map(r => {
            if (r.id === current.res.id) {
              return {
                ...r,
                flatId: current.currentFlatId,
                flatNumber: current.currentFlatNumber,
                checkinDate: current.currentCheckin,
                checkoutDate: current.currentCheckout,
                checkinTime: current.res.checkinTime || defaultCheckinTime || "14:00",
                checkoutTime: current.res.checkoutTime || defaultCheckoutTime || "12:00"
              };
            }
            return r;
          })
        }));

        await fetch(`/api/pms/reservations/${current.res.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        });

        // Atualização silenciosa em background sem tela de carregamento nem reset de scroll
        fetchData(false);
        notifyCalendarUpdated();
      } catch (e) {
        console.error("Erro ao salvar nova posição da reserva:", e);
        fetchData(false);
      } finally {
        setResDragState(null);
      }
    };

    const onPointerMove = (e: MouseEvent | PointerEvent) => {
      // Ignora eventos de toque no pointermove para evitar conflitos com onTouchMove
      if ((e as any).pointerType === "touch") return;

      const current = resDragStateRef.current;
      if (!current) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      processDragMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      const current = resDragStateRef.current;
      if (!current) return;

      const touch = e.touches[0];
      if (!touch) return;

      // Se o long-press já ativou OU se já houve movimento:
      // Bloqueia 100% o scroll nativo da página e do container!
      if (current.isLongPressReady || current.hasMoved) {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation();
      }

      processDragMove(touch.clientX, touch.clientY);
    };

    const onPointerUp = (e: MouseEvent | PointerEvent) => {
      if ((e as any).pointerType === "touch") return;
      finishResDrag();
    };

    const onTouchEnd = () => {
      finishResDrag();
    };

    const onPointerCancel = (e: PointerEvent) => {
      // Ignora pointercancel em telas touch pois o fluxo de toque é gerenciado por touchmove/touchend/touchcancel
      if ((e as any).pointerType === "touch") return;

      const current = resDragStateRef.current;
      if (current && (current.isLongPressReady || current.hasMoved)) {
        return;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }
      setLongPressActiveResId(null);
      setResDragState(null);
    };

    const onTouchCancel = () => {
      const current = resDragStateRef.current;
      // Se já ativou o modo de arraste ou já moveu, não cancela no touchcancel
      if (current && (current.isLongPressReady || current.hasMoved)) {
        return;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }
      setLongPressActiveResId(null);
      setResDragState(null);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchCancel);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);

    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
    };
  }, [resDragState, data]);

  // Block Details and Removal State
  const [selectedBlockForDetails, setSelectedBlockForDetails] = useState<any>(null)
  const [blockDetailsModalOpen, setBlockDetailsModalOpen] = useState(false)
  const [deletingBlock, setDeletingBlock] = useState(false)

  const handleOpenBlockDetails = (blockItem: any, flat: any) => {
    setSelectedBlockForDetails({ ...blockItem, flatNumber: flat.number, flatId: flat.id })
    setBlockDetailsModalOpen(true)
  }

  const handleDeleteBlock = async (blockId: number) => {
    if (!confirm("Tem certeza que deseja remover este bloqueio e liberar o quarto para reservas?")) return
    setDeletingBlock(true)
    try {
      const res = await fetch(`/api/pms/blocks/${blockId}`, {
        method: "DELETE",
        credentials: "include"
      })
      if (res.ok) {
        setBlockDetailsModalOpen(false)
        setSelectedBlockForDetails(null)
        fetchData()
        notifyCalendarUpdated()
      }
    } catch (e) {
      console.error("Erro ao remover bloqueio:", e)
    } finally {
      setDeletingBlock(false)
    }
  }


  // Timeline Contínua Multi-Mês (sem quebra de mês a mês)
  // Permite rolar continuamente para frente e para trás
  const timelineStart = subDays(new Date(), 30)
  const timelineEnd = addDays(new Date(), 90)
  const daysInView = eachDayOfInterval({ start: timelineStart, end: timelineEnd })

  // Configuração de larguras das colunas da agenda
  const EXPANDED_COL_WIDTH = 100 // Coluna de 100px no dia atual e dia anterior
  const NORMAL_COL_WIDTH = 48    // Largura padrão dos demais dias
  const FLAT_COL_WIDTH = 145     // Largura da coluna fixa de apartamentos

  const getDayColWidth = (day: Date) => (isToday(day) || isYesterday(day) ? EXPANDED_COL_WIDTH : NORMAL_COL_WIDTH)
  const gridTemplateColumns = `${FLAT_COL_WIDTH}px ${daysInView.map(day => `${getDayColWidth(day)}px`).join(" ")}`
  const totalGridMinWidth = FLAT_COL_WIDTH + daysInView.reduce((acc, day) => acc + getDayColWidth(day), 0)

  const timelineStartStr = format(daysInView[0], "yyyy-MM-dd")
  const timelineEndStr = format(daysInView[daysInView.length - 1], "yyyy-MM-dd")

  // Mapa cumulativo de posições horizontais (left e width) de cada dia na linha
  const dayLayoutMap = useMemo(() => {
    const map: Record<string, { left: number; width: number; idx: number }> = {}
    let currentLeft = FLAT_COL_WIDTH
    daysInView.forEach((day, idx) => {
      const dayStr = format(day, "yyyy-MM-dd")
      const width = getDayColWidth(day)
      map[dayStr] = { left: currentLeft, width, idx }
      currentLeft += width
    })
    return map
  }, [daysInView])

  const parseTimeToFraction = (timeStr?: string, defaultTime = "12:00") => {
    const cleanTime = (timeStr && timeStr.includes(":") ? timeStr : defaultTime).trim()
    const [hStr, mStr] = cleanTime.split(":")
    const h = Number(hStr) || 0
    const m = Number(mStr) || 0
    return Math.min(Math.max((h + m / 60) / 24, 0), 1)
  }

  const getReservationPosition = (
    checkinDate: string,
    checkoutDate: string,
    checkinTimeStr?: string,
    checkoutTimeStr?: string
  ) => {
    if (!checkinDate || !checkoutDate) return null
    if (checkoutDate < timelineStartStr || checkinDate > timelineEndStr) return null

    const cinTime = checkinTimeStr || defaultCheckinTime || "14:00"
    const coutTime = checkoutTimeStr || defaultCheckoutTime || "12:00"

    const cinFraction = parseTimeToFraction(cinTime, "14:00")
    const coutFraction = parseTimeToFraction(coutTime, "12:00")

    let startX: number
    if (checkinDate < timelineStartStr) {
      startX = FLAT_COL_WIDTH
    } else {
      const dayLayout = dayLayoutMap[checkinDate]
      if (!dayLayout) return null
      startX = dayLayout.left + cinFraction * dayLayout.width
    }

    let endX: number
    if (checkoutDate > timelineEndStr) {
      endX = totalGridMinWidth
    } else {
      const dayLayout = dayLayoutMap[checkoutDate]
      if (!dayLayout) return null
      endX = dayLayout.left + coutFraction * dayLayout.width
    }

    if (endX <= startX) {
      endX = startX + 24
    }

    const visualLeft = Math.round(startX) + 1
    const rawWidth = Math.round(endX) - visualLeft - 1
    const visualWidth = Math.max(rawWidth, 14)

    return { left: visualLeft, width: visualWidth }
  }

  const getBlockPosition = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return null
    if (endDate < timelineStartStr || startDate > timelineEndStr) return null

    let startX: number
    if (startDate < timelineStartStr) {
      startX = FLAT_COL_WIDTH
    } else {
      const dayLayout = dayLayoutMap[startDate]
      if (!dayLayout) return null
      startX = dayLayout.left
    }

    let endX: number
    if (endDate > timelineEndStr) {
      endX = totalGridMinWidth
    } else {
      const dayLayout = dayLayoutMap[endDate]
      if (!dayLayout) return null
      endX = dayLayout.left + dayLayout.width
    }

    if (endX <= startX) {
      endX = startX + 24
    }

    const visualLeft = Math.round(startX) + 1
    const rawWidth = Math.round(endX) - visualLeft - 1
    const visualWidth = Math.max(rawWidth, 14)

    return { left: visualLeft, width: visualWidth }
  }

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/companies", { credentials: "include" })
      const json = await res.json()
      if (Array.isArray(json)) setCompanies(json)
    } catch {}
  }

  const fetchCrmGuests = async () => {
    try {
      const res = await fetch("/api/pms/guests", { credentials: "include" })
      const json = await res.json()
      if (Array.isArray(json)) setCrmGuests(json)
    } catch {}
  }

  const notifyCalendarUpdated = () => {
    try {
      localStorage.setItem("pms_calendar_sync_trigger", Date.now().toString());
    } catch {}
  };

  const isFetchingRef = useRef(false);
  const lastAuxFetchRef = useRef(0);

  const fetchData = async (showLoading = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showLoading) setLoading(true);
    else setIsSyncing(true);

    try {
      const startStr = format(subDays(timelineStart, 5), "yyyy-MM-dd");
      const endStr = format(addDays(timelineEnd, 5), "yyyy-MM-dd");
      const res = await fetch(`/api/pms/calendar?startDate=${startStr}&endDate=${endStr}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.settings?.checkinTime) setDefaultCheckinTime(json.settings.checkinTime);
        if (json.settings?.checkoutTime) setDefaultCheckoutTime(json.settings.checkoutTime);
      }

      // Atualiza pedidos de café da manhã e dados auxiliares a cada 30s ou no carregamento inicial
      const now = Date.now();
      if (showLoading || now - lastAuxFetchRef.current > 30000) {
        lastAuxFetchRef.current = now;
        fetchCompanies();
        fetchCrmGuests();

        try {
          const todayStr = format(new Date(), "yyyy-MM-dd");
          const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");
          const [bfTodayRes, bfTomRes] = await Promise.all([
            fetch(`/api/breakfast/orders?date=${todayStr}`, { credentials: "include" }),
            fetch(`/api/breakfast/orders?date=${tomorrowStr}`, { credentials: "include" })
          ]);
          const bfTodayJson = bfTodayRes.ok ? await bfTodayRes.json() : null;
          const bfTomJson = bfTomRes.ok ? await bfTomRes.json() : null;
          setBreakfastStats({
            todayOrders: bfTodayJson?.totalOrders ?? 0,
            todayGuests: bfTodayJson?.totalGuests ?? 0,
            tomorrowOrders: bfTomJson?.totalOrders ?? 0,
            tomorrowGuests: bfTomJson?.totalGuests ?? 0,
          });

          // Prefetch Quarto da Vez (sugestão de equilíbrio) para hoje
          fetchFairShare(todayStr, tomorrowStr);
        } catch {}
      }
    } catch (err) {
      console.error("Erro ao sincronizar dados do calendário:", err);
    } finally {
      if (showLoading) setLoading(false);
      else setIsSyncing(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  // Auto-scroll inicial para posicionar o dia de hoje na 3ª ou 4ª coluna à esquerda

  const handleOpenFlatTagsModal = (flat: any) => {
    setSelectedFlatForTags(flat)
    setFlatTags(Array.isArray(flat.tags) ? [...flat.tags] : [])
    setFlatAirType(flat.airConditionerType || (flat.tags?.includes("Ar Janela") ? "janela" : "split"))
    setFlatBedType(flat.bedType || (flat.tags?.includes("2 Camas Solteiro") ? "solteiro_duplo" : "casal"))
    setFlatHasMicrowave(flat.hasMicrowave !== undefined ? flat.hasMicrowave : (flat.tags?.includes("Micro-ondas") ?? true))
    setFlatCustomTagInput("")
    setFlatTagsModalOpen(true)
  }

  const handleAddCustomTag = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = flatCustomTagInput.trim()
    if (trimmed && !flatTags.includes(trimmed)) {
      setFlatTags(prev => [...prev, trimmed])
      setFlatCustomTagInput("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setFlatTags(prev => prev.filter(t => t !== tagToRemove))
  }

  const handleTogglePresetTag = (tag: string) => {
    if (flatTags.includes(tag)) {
      handleRemoveTag(tag)
    } else {
      setFlatTags(prev => [...prev, tag])
    }
  }

  const handleSaveFlatTags = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFlatForTags) return
    setSavingFlatTags(true)

    // Sincroniza presets com as tags
    const finalTags = [...flatTags]
    if (flatAirType === "split" && !finalTags.includes("Split")) finalTags.push("Split")
    if (flatAirType === "janela" && !finalTags.includes("Ar Janela")) finalTags.push("Ar Janela")
    if (flatAirType === "split") {
      const idx = finalTags.indexOf("Ar Janela"); if (idx > -1) finalTags.splice(idx, 1)
    }
    if (flatAirType === "janela") {
      const idx = finalTags.indexOf("Split"); if (idx > -1) finalTags.splice(idx, 1)
    }

    if (flatBedType === "solteiro_duplo" && !finalTags.includes("2 Solteiro")) finalTags.push("2 Solteiro")
    if (flatBedType === "casal" && !finalTags.includes("Casal")) finalTags.push("Casal")
    if (flatBedType === "casal") {
      const idx = finalTags.indexOf("2 Solteiro"); if (idx > -1) finalTags.splice(idx, 1)
    }
    if (flatBedType === "solteiro_duplo") {
      const idx = finalTags.indexOf("Casal"); if (idx > -1) finalTags.splice(idx, 1)
    }

    if (flatHasMicrowave && !finalTags.includes("Micro-ondas")) finalTags.push("Micro-ondas")
    if (!flatHasMicrowave) {
      const idx = finalTags.indexOf("Micro-ondas"); if (idx > -1) finalTags.splice(idx, 1)
    }

    try {
      const res = await fetch(`/api/flats/${selectedFlatForTags.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tags: Array.from(new Set(finalTags)),
          airConditionerType: flatAirType,
          bedType: flatBedType,
          hasMicrowave: flatHasMicrowave
        })
      })
      if (res.ok) {
        setFlatTagsModalOpen(false)
        fetchData()
        notifyCalendarUpdated()
      }
    } finally {
      setSavingFlatTags(false)
    }
  }

  const scrollToToday = (behavior: "auto" | "smooth" = "smooth") => {
    if (scrollContainerRef.current) {
      // Posiciona exatamente 2 dias antes de hoje na visão inicial
      const targetDateStr = format(subDays(new Date(), 2), "yyyy-MM-dd")
      const targetEl = scrollContainerRef.current.querySelector(`[data-header-day="${targetDateStr}"]`) as HTMLElement
      if (targetEl) {
        const leftPos = Math.max(0, targetEl.offsetLeft - 145)
        scrollContainerRef.current.scrollTo({ left: leftPos, behavior })
      }
    }
  }

  useEffect(() => {
    if (!loading && data.flats.length > 0) {
      setTimeout(() => {
        scrollToToday("auto")
      }, 100)
    }
  }, [loading])


  // Drag-to-Select State
  // Drag & Tap-to-Select State (Desktop & Mobile Touch)
  const [isDragging, setIsDragging] = useState(false)
  const [dragFlatId, setDragFlatId] = useState<number | null>(null)
  const [dragStartDay, setDragStartDay] = useState<Date | null>(null)
  const [dragHoverDay, setDragHoverDay] = useState<Date | null>(null)
  const [mobileRangeStart, setMobileRangeStart] = useState<{ flatId: number; day: Date; flatNumber: string } | null>(null)

  const isDraggingRef = useRef(false)
  isDraggingRef.current = isDragging

  const isAnyModalOpenRef = useRef(false)
  isAnyModalOpenRef.current = Boolean(
    resModalOpen || 
    blockModalOpen || 
    flatTagsModalOpen || 
    blockDetailsModalOpen || 
    essentialConfigModalOpen
  )

  // Sincronização em tempo real entre múltiplos dispositivos (PC, Tablet, Celular)
  useEffect(() => {
    const doSilentSync = () => {
      // Se a aba estiver oculta/minimizada, não executa o poll para economizar recursos
      if (typeof document !== "undefined" && document.hidden) return;
      // Não atualiza se o usuário estiver ativamente arrastando/redimensionando reserva
      if (resDragStateRef.current) return;
      // Não atualiza se estiver selecionando período com arrasto
      if (isDraggingRef.current) return;
      // Não atualiza se algum modal de formulário/edição estiver aberto
      if (isAnyModalOpenRef.current) return;

      fetchData(false);
    };

    // 1. Polling a cada 4 segundos para sincronização contínua automática
    const intervalId = setInterval(doSilentSync, 4000);

    // 2. Sincronização imediata ao desbloquear o aparelho, trocar de aba ou focar a janela
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        doSilentSync();
      }
    };
    const handleFocus = () => {
      doSilentSync();
    };
    const handlePageShow = () => {
      doSilentSync();
    };

    // 3. Sincronização instantânea entre abas no mesmo computador via StorageEvent
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pms_calendar_sync_trigger") {
        doSilentSync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const handleOpenNewResRange = (defaultFlatId: number, startDate: Date, endDate: Date) => {
    const d1 = startDate <= endDate ? startDate : endDate
    const d2 = startDate <= endDate ? endDate : startDate
    setSelectedRes(null)
    isFlatManuallyChangedRef.current = true
    setFormFlatId(String(defaultFlatId))
    const cin = format(d1, "yyyy-MM-dd")
    const cout = isSameDay(d1, d2) 
      ? format(addDays(d1, 1), "yyyy-MM-dd") 
      : format(d2, "yyyy-MM-dd")
    setFormCheckin(cin)
    setFormCheckout(cout)
    setFormCheckinTime(defaultCheckinTime || "14:00")
    setFormCheckoutTime(defaultCheckoutTime || "12:00")
    setFormGuestCount("1")
    setFormRequesterType("guest")
    setFormRequesterName("")
    setFormRequesterPhone("")
    setFormRequesterEmail("")
    setFormRequesterCpf("")
    setFormCompanyId("")
    setFormCompanyName("")
    setFormGuestId("")
    setGuestSearchFilter("")
    setFormGuestName("")
    setFormGuest1Cpf("")
    setFormGuestPhone("")
    setFormGuestEmail("")
    setFormGuest2Name("")
    setFormGuest2Cpf("")
    setFormGuest2Phone("")
    setFormGuest2Email("")
    setFormGuest3Name("")
    setFormGuest3Cpf("")
    setFormGuest3Phone("")
    setFormGuest3Email("")
    setFormChannel("whatsapp")
    setFormDailyRate("250")
    setFormTotalAmount("")
    setFormPaidAmount("0")
    setFormPaymentStatus("pendente")
    setFormStatus("pre_reserva")
    setFormNotes("")
    setFormEarlyCheckin(false)
    setFormReceptionNotes("")
    setFormAutoInvoice(false)
    setFormPrefersHighFloor(false)
    setFormTwinBeds(false)
    setFormExtraMattress(false)
    setFormIncludeBreakfast(false)
    setFormSpecialRequests("")
    setFormIsMonthlyGuest(false)
    setMobileRangeStart(null)
    setResModalOpen(true)
  }

  // Desktop Mouse Drag (apenas para ponteiro de precisão / mouse)
  const handleStartDrag = (flatId: number, day: Date, hasItem: boolean, e: React.MouseEvent) => {
    if (e.button !== 0 || hasItem) return
    // Previne que toques em telas touch (celulares/tablets) ativem drag de mouse
    if (typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches) return
    setIsDragging(true)
    setDragFlatId(flatId)
    setDragStartDay(day)
    setDragHoverDay(day)
  }

  const handleDragOver = (flatId: number, day: Date) => {
    if (isDragging && dragFlatId === flatId) {
      setDragHoverDay(day)
    }
  }

  const handleFinishDrag = () => {
    if (isDragging && dragFlatId !== null && dragStartDay && dragHoverDay) {
      if (!isSameDay(dragStartDay, dragHoverDay)) {
        handleOpenNewResRange(dragFlatId, dragStartDay, dragHoverDay)
      }
    }
    setIsDragging(false)
    setDragFlatId(null)
    setDragStartDay(null)
    setDragHoverDay(null)
  }

  // Cell Click / Tap Handler (Seleção Inteligente de 2 Toques no Celular)
  const handleCellClick = (flat: any, day: Date, resItem: any, blockItem: any) => {
    // Se houve drag de mouse no desktop de vários dias, ignora o click final
    if (isDragging && dragStartDay && dragHoverDay && !isSameDay(dragStartDay, dragHoverDay)) {
      return
    }

    if (resItem) {
      setMobileRangeStart(null)
      handleOpenEditRes(resItem)
      return
    }
    if (blockItem) {
      setMobileRangeStart(null)
      return
    }

    // Se já havia um 1º toque marcado:
    if (mobileRangeStart) {
      const startDay = mobileRangeStart.day
      const endDay = day
      const targetFlatId = flat.id
      // 2º Toque: abre o período entre a data inicial e a data clicada
      handleOpenNewResRange(targetFlatId, startDay, endDay)
      setMobileRangeStart(null)
    } else {
      // 1º Toque: Marca início do período
      setMobileRangeStart({ flatId: flat.id, day, flatNumber: flat.number })
    }
  }

  const isCellInDragRange = (flatId: number, day: Date) => {
    // 1. Dragging ativo (mouse ou touch)
    if (isDragging && dragFlatId === flatId && dragStartDay && dragHoverDay) {
      const min = dragStartDay <= dragHoverDay ? dragStartDay : dragHoverDay
      const max = dragStartDay <= dragHoverDay ? dragHoverDay : dragStartDay
      return day >= min && day <= max
    }
    // 2. Mobile 1º toque selecionado
    if (mobileRangeStart && mobileRangeStart.flatId === flatId && isSameDay(mobileRangeStart.day, day)) {
      return true
    }
    return false
  }

  const handleOpenNewRes = (defaultFlatId?: number, defaultDate?: Date) => {
    setMobileRangeStart(null)
    setSelectedRes(null)
    const cin = defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
    const cout = defaultDate ? format(addDays(defaultDate, 1), "yyyy-MM-dd") : format(addDays(new Date(), 1), "yyyy-MM-dd")
    setFormCheckin(cin)
    setFormCheckout(cout)

    if (defaultFlatId) {
      isFlatManuallyChangedRef.current = true
      setFormFlatId(String(defaultFlatId))
    } else {
      isFlatManuallyChangedRef.current = false
      const suggestedId = fairShareResult?.bestFlatId
      setFormFlatId(suggestedId ? String(suggestedId) : (data.flats[0]?.id ? String(data.flats[0].id) : ""))
    }
    setFormCheckinTime(defaultCheckinTime || "14:00")
    setFormCheckoutTime(defaultCheckoutTime || "12:00")
    setFormGuestCount("1")
    setFormRequesterType("guest")
    setFormRequesterName("")
    setFormRequesterPhone("")
    setFormRequesterEmail("")
    setFormRequesterCpf("")
    setFormCompanyId("")
    setFormCompanyName("")
    setFormGuestId("")
    setGuestSearchFilter("")
    setFormGuestName("")
    setFormGuest1Cpf("")
    setFormGuestPhone("")
    setFormGuestEmail("")
    setFormGuest2Name("")
    setFormGuest2Cpf("")
    setFormGuest2Phone("")
    setFormGuest2Email("")
    setFormGuest3Name("")
    setFormGuest3Cpf("")
    setFormGuest3Phone("")
    setFormGuest3Email("")
    setFormChannel("whatsapp")
    setFormDailyRate("250")
    setFormTotalAmount("")
    setFormPaidAmount("0")
    setFormPaymentStatus("pendente")
    setFormStatus("pre_reserva")
    setFormNotes("")
    setFormEarlyCheckin(false)
    setFormReceptionNotes("")
    setFormAutoInvoice(false)
    setFormPrefersHighFloor(false)
    setFormTwinBeds(false)
    setFormExtraMattress(false)
    setFormIncludeBreakfast(false)
    setFormSpecialRequests("")
    setFormIsMonthlyGuest(false)
    setAuditLogs([])
    setCommunications([])
    setResModalOpen(true)
  }

  const handleOpenEditRes = (resItem: any) => {
    setSelectedRes(resItem)
    isFlatManuallyChangedRef.current = true
    setFormFlatId(String(resItem.flatId))
    setFormCheckin(resItem.checkinDate)
    setFormCheckout(resItem.checkoutDate)
    setFormCheckinTime(resItem.checkinTime || defaultCheckinTime || "14:00")
    setFormCheckoutTime(resItem.checkoutTime || defaultCheckoutTime || "12:00")
    setFormGuestCount(String(resItem.guestCount || resItem.adults || (resItem.guests?.length || 1)) as any)
    setFormRequesterType(resItem.requesterType || "guest")
    setFormRequesterName(resItem.requesterInfo?.name || "")
    setFormRequesterPhone(resItem.requesterInfo?.phone || "")
    setFormRequesterEmail(resItem.requesterInfo?.email || "")
    setFormRequesterCpf(resItem.requesterInfo?.cpf || "")
    setFormCompanyId(resItem.companyId ? String(resItem.companyId) : "")
    setFormCompanyName(resItem.companyName || "")
    setFormGuestId(resItem.guestId ? String(resItem.guestId) : "")
    setGuestSearchFilter("")

    const g1 = resItem.guests?.[0]
    setFormGuestName(g1?.name || resItem.guestName || "")
    setFormGuest1Cpf(g1?.cpf || resItem.guestDocument || "")
    setFormGuestPhone(g1?.phone || resItem.guestPhone || "")
    setFormGuestEmail(g1?.email || resItem.guestEmail || "")

    const g2 = resItem.guests?.[1]
    setFormGuest2Name(g2?.name && !g2.name.startsWith("Hóspede") ? g2.name : "")
    setFormGuest2Cpf(g2?.cpf || "")
    setFormGuest2Phone(g2?.phone || "")
    setFormGuest2Email(g2?.email || "")

    const g3 = resItem.guests?.[2]
    setFormGuest3Name(g3?.name && !g3.name.startsWith("Hóspede") ? g3.name : "")
    setFormGuest3Cpf(g3?.cpf || "")
    setFormGuest3Phone(g3?.phone || "")
    setFormGuest3Email(g3?.email || "")

    const chan = resItem.channel || "whatsapp"
    const isOtaRes = (chan === "booking" || chan === "airbnb")
    const isResCurrentlyPaid = isOtaRes || resItem.paymentStatus === "pago_total" || resItem.paymentStatus === "pago" || (Number(resItem.paidAmount) >= Number(resItem.totalAmount) && Number(resItem.totalAmount) > 0)
    const nights = differenceInDays(parseISO(resItem.checkoutDate), parseISO(resItem.checkinDate)) || 1
    const totCalculated = Number(resItem.totalAmount) > 0 ? resItem.totalAmount : (Number(resItem.dailyRate || 0) * nights)

    setFormChannel(chan)
    setFormDailyRate(String(resItem.dailyRate || 0))
    setFormTotalAmount(totCalculated > 0 ? String(totCalculated) : "")
    setFormPaidAmount(String(resItem.paidAmount !== undefined ? resItem.paidAmount : (isResCurrentlyPaid ? totCalculated : 0)))
    setFormPaymentStatus(isResCurrentlyPaid ? "pago_total" : (resItem.paymentStatus || "pendente"))
    setFormStatus((resItem.status === "confirmada" || isResCurrentlyPaid) ? "confirmada" : (resItem.status || "pre_reserva"))
    setFormNotes(resItem.notes || "")
    const matchedGuest = crmGuests.find(g => 
      (resItem.guestId && String(g.id) === String(resItem.guestId)) ||
      (g.documentNumber && resItem.guestDocument && g.documentNumber.replace(/\D/g, '') === resItem.guestDocument.replace(/\D/g, '')) ||
      (g.phone && resItem.guestPhone && g.phone.replace(/\D/g, '') === resItem.guestPhone.replace(/\D/g, '')) ||
      (g.name && resItem.guestName && g.name.toLowerCase().trim() === resItem.guestName.toLowerCase().trim()) ||
      (g.fullName && resItem.guestName && g.fullName.toLowerCase().trim() === resItem.guestName.toLowerCase().trim())
    )

    setFormEarlyCheckin(Boolean(resItem.earlyCheckinAuthorized))
    setFormReceptionNotes(resItem.receptionNotes || "")
    setFormAutoInvoice(Boolean(resItem.autoEmitInvoice || matchedGuest?.autoEmitInvoice))
    setFormPrefersHighFloor(Boolean(resItem.prefersHighFloor))
    setFormTwinBeds(Boolean(resItem.twinBeds))
    setFormExtraMattress(Boolean(resItem.extraMattress))
    setFormIncludeBreakfast(Boolean(resItem.includeBreakfast || resItem.hasBreakfast))
    setFormSpecialRequests(resItem.specialRequests || "")
    setFormIsMonthlyGuest(Boolean(resItem.isMonthlyGuest || resItem.clientType === "mensalista" || matchedGuest?.isMonthlyGuest || matchedGuest?.clientType === "mensalista"))
    setResModalTab("details")
    setAuditLogs(Array.isArray(resItem.auditLogs) ? resItem.auditLogs : [])
    fetchAuditLogs(resItem.code || resItem.id)
    fetchCommunications(resItem.code || resItem.id)
    const flatItem = data.flats.find(f => f.id === resItem.flatId || String(f.number) === String(resItem.flatNumber))
    const pEmail = flatItem?.receptionEmail || "portaria.soho@corpflats.com.br"
    setPortariaEmail(pEmail)
    setManualRecipient(resItem.guestEmail || pEmail)
    setManualSubject(`[CorpFlats] Flat ${resItem.flatNumber} - ${resItem.guestName}`)
    setManualBody("")
    setResModalOpen(true)
  }

  const handleSelectGuest = (val: string) => {
    setFormGuestId(val)
    if (!val || val === "manual") {
      return
    }
    const g = crmGuests.find(guest => String(guest.id) === val)
    if (g) {
      setFormGuestName(g.name || g.fullName || "")
      setFormGuest1Cpf(g.documentNumber || g.document || "")
      setFormGuestPhone(g.phone || "")
      setFormGuestEmail(g.email || "")

      if (g.floorPreference === "alto" || g.prefersHighFloor) {
        setFormPrefersHighFloor(true)
      }
      if (g.bedType === "2 Solteiro" || g.twinBeds) {
        setFormTwinBeds(true)
      }
      if (g.isMonthlyGuest || g.clientType === "mensalista") {
        setFormIsMonthlyGuest(true)
      }
      if (g.autoEmitInvoice) {
        setFormAutoInvoice(true)
      }
      if (g.companyId && !formCompanyId) {
        setFormCompanyId(String(g.companyId))
        const comp = companies.find(c => c.id === Number(g.companyId))
        if (comp) setFormCompanyName(comp.tradeName || comp.corporateName)
      }
      toast({
        title: "Hóspede Selecionado do CRM",
        description: `${g.name || g.fullName} carregado com sucesso.`
      })
    }
  }

  const filteredGuests = crmGuests.filter(g => {
    if (!guestSearchFilter.trim()) return true
    const q = guestSearchFilter.toLowerCase().trim()
    const name = (g.name || g.fullName || "").toLowerCase()
    const doc = (g.documentNumber || g.document || "").replace(/\D/g, "")
    const phone = (g.phone || "").replace(/\D/g, "")
    const cleanQ = q.replace(/\D/g, "")
    return name.includes(q) || (cleanQ && doc.includes(cleanQ)) || (cleanQ && phone.includes(cleanQ))
  })

  const calculateTotal = () => {
    try {
      const d1 = parseISO(formCheckin)
      const d2 = parseISO(formCheckout)
      const nights = Math.max(1, differenceInDays(d2, d1))
      return nights * (Number(formDailyRate) || 0)
    } catch {
      return 0
    }
  }

  const handleSaveRes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formFlatId || !formGuestName.trim() || !formCheckin || !formCheckout) return

    setSavingRes(true)
    try {
      const calcTot = calculateTotal()
      const totalAmount = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calcTot
      const isOta = formChannel === "booking" || formChannel === "airbnb"
      let resolvedPaidAmount = Number(formPaidAmount) || 0
      let resolvedPaymentStatus = formPaymentStatus
      if (isOta) {
        resolvedPaymentStatus = "pago_total"
        resolvedPaidAmount = totalAmount
      } else if (resolvedPaymentStatus === "pago_total" && resolvedPaidAmount === 0 && totalAmount > 0) {
        resolvedPaidAmount = totalAmount
      } else if (resolvedPaidAmount >= totalAmount && totalAmount > 0) {
        resolvedPaymentStatus = "pago_total"
      } else if (resolvedPaidAmount > 0 && resolvedPaidAmount < totalAmount && resolvedPaymentStatus === "pendente") {
        resolvedPaymentStatus = "sinal_pago"
      }

      const numG = Number(formGuestCount) || 1
      const guestsPayload = [
        { index: 1, name: formGuestName.trim(), cpf: formGuest1Cpf.trim(), phone: formGuestPhone.trim(), email: formGuestEmail.trim() }
      ]
      if (numG >= 2) {
        guestsPayload.push({
          index: 2,
          name: formGuest2Name.trim() || "Hóspede 2",
          cpf: formGuest2Cpf.trim(),
          phone: formGuest2Phone.trim(),
          email: formGuest2Email.trim()
        })
      }
      if (numG === 3) {
        guestsPayload.push({
          index: 3,
          name: formGuest3Name.trim() || "Hóspede 3",
          cpf: formGuest3Cpf.trim(),
          phone: formGuest3Phone.trim(),
          email: formGuest3Email.trim()
        })
      }

      const selectedComp = companies.find(c => String(c.id) === formCompanyId)

      const payload = {
        flatId: Number(formFlatId),
        guestId: formGuestId && formGuestId !== "manual" ? Number(formGuestId) : (selectedRes?.guestId || null),
        guestName: formGuestName.trim(),
        guestPhone: formGuestPhone.trim(),
        guestEmail: formGuestEmail.trim(),
        guestDocument: formGuest1Cpf.trim(),
        guestCount: numG,
        guests: guestsPayload,
        requesterType: formRequesterType,
        requesterInfo: formRequesterType === "other_person" ? {
          name: formRequesterName.trim(),
          cpf: formRequesterCpf.trim(),
          phone: formRequesterPhone.trim(),
          email: formRequesterEmail.trim()
        } : null,
        companyId: formRequesterType === "company" && formCompanyId ? Number(formCompanyId) : null,
        companyName: formRequesterType === "company" ? (selectedComp ? selectedComp.tradeName || selectedComp.corporateName : formCompanyName) : "",
        checkinDate: formCheckin,
        checkoutDate: formCheckout,
        checkinTime: formCheckinTime || defaultCheckinTime || "14:00",
        checkoutTime: formCheckoutTime || defaultCheckoutTime || "12:00",
        status: formStatus,
        channel: formChannel,
        dailyRate: Number(formDailyRate) || 0,
        totalAmount,
        paidAmount: resolvedPaidAmount,
        paymentStatus: resolvedPaymentStatus,
        notes: formNotes,
        earlyCheckinAuthorized: formEarlyCheckin,
        receptionNotes: formReceptionNotes,
        autoEmitInvoice: formAutoInvoice,
        prefersHighFloor: formPrefersHighFloor,
        twinBeds: formTwinBeds,
        extraMattress: formExtraMattress,
        includeBreakfast: formIncludeBreakfast,
        specialRequests: formSpecialRequests,
        isMonthlyGuest: Boolean(formIsMonthlyGuest),
        clientType: formIsMonthlyGuest ? "mensalista" : "avulso",
        source: selectedRes ? "PMS Calendário (Edição Manual)" : "PMS Calendário (Nova Reserva)"
      }

      if (selectedRes) {
        await fetch(`/api/pms/reservations/${selectedRes.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      } else {
        await fetch("/api/pms/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        })
      }
      setResModalOpen(false)
      fetchData()
      notifyCalendarUpdated()
    } finally {
      setSavingRes(false)
    }
  }

  const handleDeleteRes = async () => {
    if (!selectedRes) return
    if (!confirm("Tem certeza que deseja cancelar esta reserva?")) return
    try {
      await fetch(`/api/pms/reservations/${selectedRes.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "PMS Calendário (Cancelamento Manual)" }),
        credentials: "include"
      })
      setResModalOpen(false)
      fetchData()
      notifyCalendarUpdated()
    } catch {}
  }

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blockFlatId || !blockStart || !blockEnd) return
    try {
      await fetch("/api/pms/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: Number(blockFlatId),
          startDate: blockStart,
          endDate: blockEnd,
          reason: blockReason,
          notes: blockNotes
        }),
        credentials: "include"
      })
      setBlockModalOpen(false)
      fetchData()
      notifyCalendarUpdated()
    } catch {}
  }

  // ── Métricas Operacionais e Resumos do Dia / Mês ──
  const todayDate = new Date()
  const todayStr = format(todayDate, "yyyy-MM-dd")
  const tomorrowDate = addDays(todayDate, 1)
  const tomorrowStr = format(tomorrowDate, "yyyy-MM-dd")

  // 1. Ocupação do Mês (apenas até o dia atual / Month-to-date)
  const monthStartDate = startOfMonth(todayDate)
  const monthDaysElapsed = eachDayOfInterval({ start: monthStartDate, end: todayDate })
  let occupiedNightsMtd = 0
  monthDaysElapsed.forEach(day => {
    const dStr = format(day, "yyyy-MM-dd")
    const occupiedOnDay = data.reservations.filter(r => 
      r.status !== "cancelada" && r.checkinDate <= dStr && r.checkoutDate > dStr
    ).length
    occupiedNightsMtd += occupiedOnDay
  })
  const totalCapacityMtd = data.flats.length * monthDaysElapsed.length
  const mtdOccupancyRate = totalCapacityMtd > 0 ? Math.round((occupiedNightsMtd / totalCapacityMtd) * 100) : 0

  // 2. Quartos Livres no Dia (sem reserva dormindo hoje e sem bloqueio ativo)
  const isFlatOccupiedToday = (flatId: number | string) => {
    return data.reservations.some(r => 
      r.status !== "cancelada" &&
      String(r.flatId) === String(flatId) &&
      r.checkinDate <= todayStr &&
      r.checkoutDate > todayStr
    )
  }
  const isFlatBlockedToday = (flatId: number | string) => {
    return data.blocks.some(b => 
      String(b.flatId) === String(flatId) &&
      b.startDate <= todayStr &&
      b.endDate >= todayStr
    )
  }
  const freeFlatsTodayCount = data.flats.filter(f => !isFlatOccupiedToday(f.id) && !isFlatBlockedToday(f.id)).length

  // 3. Check-ins no Dia
  const checkinsToday = data.reservations.filter(r => 
    r.status !== "cancelada" && r.checkinDate === todayStr
  )
  const checkinsTodayCount = checkinsToday.length

  // 4. Pessoas Entrando no Dia
  const incomingGuestsTodayCount = checkinsToday.reduce((acc, r) => {
    const count = Number(r.guestCount) || (Array.isArray(r.guests) && r.guests.length > 0 ? r.guests.length : 1)
    return acc + count
  }, 0)

  // 5. Check-outs no Dia
  const checkoutsToday = data.reservations.filter(r => 
    r.status !== "cancelada" && r.checkoutDate === todayStr
  )
  const checkoutsTodayCount = checkoutsToday.length

  // 6. Stayovers no Dia (entraram antes de hoje e saem após hoje)
  const stayoversToday = data.reservations.filter(r => 
    r.status !== "cancelada" && r.checkinDate < todayStr && r.checkoutDate > todayStr
  )
  const stayoversTodayCount = stayoversToday.length

  // 7. Pedidos com Café da Manhã (Hoje e Amanhã)
  const reservationsTodayWithBf = data.reservations.filter(r => 
    r.status !== "cancelada" && 
    r.checkinDate <= todayStr && 
    r.checkoutDate >= todayStr && 
    Boolean(r.includeBreakfast || r.hasBreakfast)
  )
  const todayReservationsWithBfCount = reservationsTodayWithBf.length
  const todayBreakfastOrdersCount = breakfastStats !== null ? breakfastStats.todayOrders : 0

  const reservationsTomorrowWithBf = data.reservations.filter(r => 
    r.status !== "cancelada" && 
    r.checkinDate <= tomorrowStr && 
    r.checkoutDate >= tomorrowStr && 
    Boolean(r.includeBreakfast || r.hasBreakfast)
  )
  const tomorrowReservationsWithBfCount = reservationsTomorrowWithBf.length
  const tomorrowBreakfastOrdersCount = breakfastStats !== null ? breakfastStats.tomorrowOrders : 0

  // Regra das 09:00 para o Café da Manhã: até 08:59 foca em HOJE; a partir das 09:00 foca em AMANHÃ
  const brasiliaHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()))
  const isAfter9Am = brasiliaHour >= 9

  // Contagem e filtro de quartos sujos vs. limpos
  const dirtyFlatsCount = data.flats.filter(f => (f as any).cleaningStatus === "dirty" || (f as any).cleaningStatus === "cleaning_now").length
  const cleanFlatsCount = data.flats.filter(f => (f as any).cleaningStatus === "clean" || !(f as any).cleaningStatus).length

  // Contagem de reservas com menores de idade e com alerta de atenção (< 30a locais)
  const minorReservationsCount = useMemo(() => {
    return data.reservations.filter(r => r.status !== "cancelada" && r.hasMinor).length
  }, [data.reservations])

  const riskAttentionCount = useMemo(() => {
    return data.reservations.filter(r => r.status !== "cancelada" && r.riskAttentionAlert).length
  }, [data.reservations])

  const displayedFlats = data.flats.filter(f => {
    if (cleaningFilter === "dirty") {
      if (!((f as any).cleaningStatus === "dirty" || (f as any).cleaningStatus === "cleaning_now")) return false
    } else if (cleaningFilter === "clean") {
      if (!((f as any).cleaningStatus === "clean" || !(f as any).cleaningStatus)) return false
    }

    if (specialFilter === "minors") {
      const hasMinorInFlat = data.reservations.some(r => 
        (r.flatId === f.id || String(r.flatNumber) === String(f.number)) &&
        r.status !== "cancelada" &&
        r.hasMinor
      )
      if (!hasMinorInFlat) return false
    } else if (specialFilter === "risk") {
      const hasRiskInFlat = data.reservations.some(r => 
        (r.flatId === f.id || String(r.flatNumber) === String(f.number)) &&
        r.status !== "cancelada" &&
        r.riskAttentionAlert
      )
      if (!hasRiskInFlat) return false
    }

    return true
  })

  if (!loadingUser && user?.role !== "admin") {
    return <AccessDenied moduleName="o Livro de Reservas & Mapa de Ocupação" />
  }

  return (
    <Shell>
      <div className="p-4 sm:p-6 space-y-6 max-w-[100vw] overflow-x-hidden">
        {/* Header Title & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-primary" />
              Livro de Reservas & Mapa de Ocupação
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Grade interativa de reservas, diárias e bloqueios em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              onClick={() => fetchData(false)} 
              variant="outline" 
              size="sm" 
              className="font-semibold text-xs gap-1.5 shadow-2xs h-8 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Sincronizar dados agora (sincronização automática em tempo real a cada 4s)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline font-medium">
                {isSyncing ? "Sincronizando..." : "Ao vivo"}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </Button>
            <Button onClick={() => setBlockModalOpen(true)} variant="outline" size="sm" className="font-semibold text-xs gap-1.5 shadow-2xs">
              <Lock className="w-3.5 h-3.5" />
              <span>Bloquear Quarto</span>
            </Button>
            <Button onClick={() => handleOpenNewRes()} size="sm" className="font-semibold text-xs gap-1.5 shadow-2xs">
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Reserva</span>
            </Button>
          </div>
        </div>

        {/* Stats Row - 7 Cards Operacionais */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {/* Card 1: Ocupação do Mês (apenas até o dia atual) */}
          <Card className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-primary/40 transition-colors bg-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ocupação do Mês</span>
              <Building2 className="w-4 h-4 text-primary shrink-0" />
            </div>
            <div className="mt-1.5">
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{mtdOccupancyRate}%</div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate" title={`Até hoje (${occupiedNightsMtd}/${totalCapacityMtd} diárias no mês)`}>
                Até hoje ({occupiedNightsMtd}/{totalCapacityMtd} d.)
              </div>
            </div>
          </Card>

          {/* Card 2: Quartos Livres no Dia */}
          <Card className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-emerald-500/40 transition-colors bg-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Quartos Livres</span>
              <BedDouble className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="mt-1.5">
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{freeFlatsTodayCount}</div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate" title={`${freeFlatsTodayCount} de ${data.flats.length} flats livres hoje`}>
                de {data.flats.length} flats hoje
              </div>
            </div>
          </Card>

          {/* Card 3: Check-ins no Dia */}
          <Card className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-emerald-500/40 transition-colors bg-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Check-ins</span>
              <LogIn className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="mt-1.5">
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{checkinsTodayCount}</div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {checkinsTodayCount === 1 ? '1 quarto chegando' : `${checkinsTodayCount} quartos chegando`}
              </div>
            </div>
          </Card>

          {/* Card 4: Pessoas Entrando no Dia */}
          <Card className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-indigo-500/40 transition-colors bg-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Pessoas Entrando</span>
              <Users className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
            <div className="mt-1.5">
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{incomingGuestsTodayCount}</div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {incomingGuestsTodayCount === 1 ? '1 pessoa prevista' : `${incomingGuestsTodayCount} pessoas previstas`}
              </div>
            </div>
          </Card>

          {/* Card 5: Check-outs no Dia */}
          <Card className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-rose-500/40 transition-colors bg-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Check-outs</span>
              <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
            </div>
            <div className="mt-1.5">
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{checkoutsTodayCount}</div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {checkoutsTodayCount === 1 ? '1 saída hoje' : `${checkoutsTodayCount} saídas hoje`}
              </div>
            </div>
          </Card>

          {/* Card 6: Stayovers no Dia */}
          <Card className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-sky-500/40 transition-colors bg-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Stayovers</span>
              <RotateCcw className="w-4 h-4 text-sky-600 shrink-0" />
            </div>
            <div className="mt-1.5">
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{stayoversTodayCount}</div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {stayoversTodayCount === 1 ? '1 estadia contínua' : `${stayoversTodayCount} estadias contínuas`}
              </div>
            </div>
          </Card>

          {/* Card 7: Pedidos de Café da Manhã (Regra das 09h: até 08:59 foca em HOJE; a partir das 09:00 foca em AMANHÃ) */}
          <Card 
            onClick={() => setLocation("/pedidos-cafe")}
            className="rounded-xl border shadow-2xs p-3 flex flex-col justify-between hover:border-amber-500/60 hover:shadow-xs transition-all bg-card cursor-pointer group"
            title={`Clique para gerenciar pedidos • Regra das 09h: ${isAfter9Am ? 'Exibindo foco em AMANHÃ (após as 09:00)' : 'Exibindo foco em HOJE (até as 08:59)'}`}
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-amber-600 transition-colors">
                  {isAfter9Am ? "Café Amanhã" : "Café Hoje"}
                </span>
                {isAfter9Am ? (
                  <span className="text-[8.5px] font-black bg-amber-500 text-white px-1.5 py-0.2 rounded uppercase tracking-wider shadow-2xs">
                    AMANHÃ
                  </span>
                ) : (
                  <span className="text-[8.5px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded uppercase tracking-wider shadow-2xs">
                    HOJE
                  </span>
                )}
              </div>
              <Coffee className="w-4 h-4 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {isAfter9Am 
                    ? `${tomorrowBreakfastOrdersCount}/${tomorrowReservationsWithBfCount}` 
                    : `${todayBreakfastOrdersCount}/${todayReservationsWithBfCount}`}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isAfter9Am ? "p/ amanhã" : "p/ hoje"}
                </span>
              </div>
              <div className="text-[10.5px] font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                {isAfter9Am 
                  ? `${tomorrowBreakfastOrdersCount} de ${tomorrowReservationsWithBfCount} c/ café amanhã` 
                  : `${todayBreakfastOrdersCount} de ${todayReservationsWithBfCount} c/ café hoje`}
              </div>
              <div className="text-[9.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {isAfter9Am 
                  ? `Hoje foi: ${todayBreakfastOrdersCount}/${todayReservationsWithBfCount} pedidos` 
                  : `Amanhã: ${tomorrowBreakfastOrdersCount}/${tomorrowReservationsWithBfCount} pedidos`}
              </div>
            </div>
          </Card>
        </div>

        {/* Navigation & Controls */}
        <Card className="rounded-xl border shadow-2xs">
          <div className="p-3 bg-muted/20 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentDate(subDays(startOfMonth(currentDate), 1))}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => scrollToToday("smooth")}
                className="h-8 text-xs font-bold px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Ir para Hoje</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentDate(addDays(endOfMonth(currentDate), 1))}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              {/* Filtro Rápido de Status de Limpeza */}
              <div className="flex items-center gap-0.5 bg-background border rounded-lg p-0.5 ml-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setCleaningFilter("all")}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                    cleaningFilter === "all" 
                      ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Exibir todos os apartamentos"
                >
                  Todos ({data.flats.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCleaningFilter("dirty")}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                    cleaningFilter === "dirty" 
                      ? "bg-rose-600 text-white shadow-xs" 
                      : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  }`}
                  title="Filtrar apenas quartos sujos / aguardando limpeza"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Sujos ({dirtyFlatsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCleaningFilter("clean")}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                    cleaningFilter === "clean" 
                      ? "bg-emerald-600 text-white shadow-xs" 
                      : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                  title="Filtrar apenas quartos limpos"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Limpos ({cleanFlatsCount})
                </button>
              </div>

              {/* Filtro Rápido de Menores e Alertas de Atenção */}
              <div className="flex items-center gap-0.5 bg-background border rounded-lg p-0.5 ml-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSpecialFilter(prev => prev === "minors" ? "all" : "minors")}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                    specialFilter === "minors" 
                      ? "bg-rose-600 text-white shadow-xs" 
                      : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  }`}
                  title="Filtrar apartamentos com menores de idade (ECA Art. 82)"
                >
                  <span>👶 Menores ({minorReservationsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSpecialFilter(prev => prev === "risk" ? "all" : "risk")}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                    specialFilter === "risk" 
                      ? "bg-amber-500 text-slate-950 shadow-xs" 
                      : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  }`}
                  title="Filtrar reservas com alerta de atenção (< 30a de Campos dos Goytacazes)"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span>Locais &lt;30a ({riskAttentionCount})</span>
                </button>
              </div>
            </div>

            {/* Channels & Cleaning Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              {/* Legenda de Limpeza */}
              <div className="flex items-center gap-2 pr-2 border-r">
                <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Limpo
                </span>
                <span className="flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Sujo
                </span>
              </div>

              {/* Legenda de Canais */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Site
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> WhatsApp
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-700" /> Booking
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" /> Airbnb
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-700" /> Bloqueio
                </span>
              </div>
            </div>
          </div>

          {/* Timeline Grid Table */}
          <div 
            ref={scrollContainerRef}
            className={`overflow-x-auto select-none ${
              resDragState && (resDragState.hasMoved || resDragState.isLongPressReady)
                ? 'overflow-x-hidden touch-none'
                : 'scroll-smooth'
            }`}
            onMouseUp={handleFinishDrag}
            onMouseLeave={() => { if (isDragging) handleFinishDrag(); }}
          >
            <div style={{ minWidth: `${totalGridMinWidth}px` }}>
              {/* Header Days Row */}
              <div 
                style={{ gridTemplateColumns }}
                className="grid border-b bg-muted/40 text-center font-bold text-xs sticky top-0 z-20 shadow-2xs"
              >
                <div className="px-3 py-2.5 text-left border-r-2 border-r-border/80 bg-slate-100 dark:bg-slate-900 sticky left-0 z-30 font-black text-xs text-foreground shadow-[2px_0_6px_-2px_rgba(0,0,0,0.1)] select-none">
                  Apartamento
                </div>
                {daysInView.map((day) => {
                  const today = isToday(day)
                  const yesterday = isYesterday(day)
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isFirstOfMonth = day.getDate() === 1
                  const dayStr = format(day, "yyyy-MM-dd")

                  if (today) {
                    return (
                      <div 
                        key={day.toISOString()} 
                        data-header-day={dayStr}
                        className="p-1 border-r relative flex flex-col items-center justify-center bg-primary/20 text-primary font-black shadow-inner ring-1 ring-primary/40"
                      >
                        {isFirstOfMonth && (
                          <span className="absolute -top-2.5 left-1 text-[8px] font-black uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0.2 rounded-md shadow-xs">
                            {format(day, "MMM", { locale: ptBR })}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="bg-primary text-primary-foreground text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md shadow-xs">
                            HOJE
                          </span>
                          <span className="text-[9px] uppercase font-bold text-primary">
                            {format(day, "EEE", { locale: ptBR })}
                          </span>
                        </div>
                        <span className="text-xs font-black text-primary mt-0.5">
                          {format(day, "d")}
                        </span>
                      </div>
                    )
                  }

                  if (yesterday) {
                    return (
                      <div 
                        key={day.toISOString()} 
                        data-header-day={dayStr}
                        className="p-1 border-r relative flex flex-col items-center justify-center bg-slate-200/60 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 font-bold border-l border-border/60 shadow-2xs"
                      >
                        {isFirstOfMonth && (
                          <span className="absolute -top-2.5 left-1 text-[8px] font-black uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0.2 rounded-md shadow-xs">
                            {format(day, "MMM", { locale: ptBR })}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="bg-slate-700 dark:bg-slate-300 text-white dark:text-slate-900 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md shadow-xs">
                            ONTEM
                          </span>
                          <span className="text-[9px] uppercase font-bold text-slate-700 dark:text-slate-300">
                            {format(day, "EEE", { locale: ptBR })}
                          </span>
                        </div>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5">
                          {format(day, "d")}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div 
                      key={day.toISOString()} 
                      data-header-day={dayStr}
                      className={`p-1 border-r relative flex flex-col items-center justify-center ${
                        isFirstOfMonth ? 'border-l-2 border-l-primary bg-primary/5' : ''
                      } ${
                        isWeekend ? 'bg-muted/60 text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {isFirstOfMonth && (
                        <span className="absolute -top-2.5 left-1 text-[9px] font-black uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.2 rounded-md shadow-xs">
                          {format(day, "MMM", { locale: ptBR })}
                        </span>
                      )}
                      <span className="text-[9px] uppercase font-bold">{format(day, "EEE", { locale: ptBR })}</span>
                      <span className="text-xs font-black">
                        {format(day, "d")}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Rows: Flats */}
              {loading ? (
                <div className="text-center py-16 text-xs text-muted-foreground">Carregando mapa de ocupação...</div>
              ) : data.flats.length === 0 ? (
                <div className="text-center py-16 text-xs text-muted-foreground">Nenhum apartamento cadastrado.</div>
              ) : (
                displayedFlats.map((flat) => {
                  const activeAmenities = getFlatActiveAmenities(flat);
                  const flatReservations = data.reservations.filter(r => (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)));
                  const flatBlocks = data.blocks.filter(b => (b.flatId === flat.id || String(b.flatNumber) === String(flat.number)));
                  const cleaningStatus = (flat as any).cleaningStatus || "clean";
                  const isDirty = cleaningStatus === "dirty";
                  const isCleaningNow = cleaningStatus === "cleaning_now";

                  return (
                    <div 
                      key={flat.id} 
                      data-flat-row-id={flat.id}
                      style={{ 
                        gridTemplateColumns,
                        gridTemplateRows: "48px"
                      }}
                      className="grid border-b hover:bg-muted/10 transition-colors h-12 items-center relative"
                    >
                      {/* Flat Number Header with 100% Solid Opaque Background */}
                      <div 
                        style={{ gridColumn: "1 / 2", gridRow: "1 / 2" }}
                        onClick={() => handleOpenFlatTagsModal(flat)}
                        className={`px-3 py-1 font-bold text-xs border-r-2 border-r-border/70 text-foreground flex flex-col justify-center h-full bg-white dark:bg-slate-900 sticky left-0 z-20 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors group select-none border-l-[3.5px] ${
                          isDirty 
                            ? "border-l-rose-500" 
                            : isCleaningNow
                              ? "border-l-amber-500"
                              : "border-l-emerald-500"
                        }`}
                        title={`Apt ${flat.number} • Status: ${isDirty ? "Sujo / Aguardando Limpeza" : isCleaningNow ? "Em Limpeza Agora" : "Limpo & Pronto"}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {/* Status Indicator Dot */}
                            {isDirty ? (
                              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 ring-2 ring-rose-200 dark:ring-rose-900 animate-pulse" title="Sujo" />
                            ) : isCleaningNow ? (
                              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 ring-2 ring-amber-200 dark:ring-amber-900 animate-pulse" title="Limpando" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Limpo" />
                            )}
                            <span className="font-black text-slate-900 dark:text-slate-100 text-xs tracking-tight whitespace-nowrap">
                              Apt {flat.number}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            {isDirty ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8.5px] font-black bg-rose-500 text-white shadow-2xs">
                                Sujo
                              </span>
                            ) : isCleaningNow ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8.5px] font-black bg-amber-500 text-white shadow-2xs animate-pulse">
                                Limpando
                              </span>
                            ) : (
                              <Tag className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                            )}
                          </div>
                        </div>

                        {/* Ícones Vetoriais Lucide Compactos & Elegantes */}
                        <div className="flex items-center gap-1 mt-1 overflow-hidden">
                          {activeAmenities.slice(0, 4).map((amenity, aIdx) => (
                            <span 
                              key={aIdx} 
                              title={`${amenity.label} (${amenity.categoryLabel})`}
                              className={`p-0.5 px-1 rounded bg-slate-100 dark:bg-slate-800 border border-border/40 ${amenity.colorClass || 'text-slate-700 dark:text-slate-300'} hover:scale-125 hover:z-30 transition-transform cursor-help flex items-center justify-center`}
                            >
                              {renderAmenityIcon(amenity.iconName, "w-2.5 h-2.5")}
                            </span>
                          ))}
                          {activeAmenities.length > 4 && (
                            <span className="text-[8px] text-muted-foreground font-black leading-none bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">
                              +{activeAmenities.length - 4}
                            </span>
                          )}
                          {activeAmenities.length === 0 && (
                            <span className="text-[8px] text-primary/70 font-semibold group-hover:text-primary transition-colors">
                              + tags
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Background Day Cells (Para seleção e criação de reserva) */}
                      {daysInView.map((day, dIdx) => {
                        const dayStr = format(day, "yyyy-MM-dd");
                        const isMobileStart = mobileRangeStart && mobileRangeStart.flatId === flat.id && isSameDay(mobileRangeStart.day, day);
                        const inDragRange = isCellInDragRange(flat.id, day);
                        const today = isToday(day);
                        const yesterday = isYesterday(day);

                        return (
                          <div 
                            key={dayStr}
                            style={{ gridColumn: `${dIdx + 2} / span 1`, gridRow: "1 / 2" }}
                            data-calendar-cell="true"
                            data-flat-id={flat.id}
                            data-day-str={dayStr}
                            onMouseDown={(e) => handleStartDrag(flat.id, day, false, e)}
                            onMouseEnter={() => handleDragOver(flat.id, day)}
                            onClick={() => handleCellClick(flat, day, null, null)}
                            className={`h-full border-r relative flex items-center justify-center cursor-pointer transition-all select-none z-0 ${
                              isMobileStart
                                ? 'bg-emerald-500/25 dark:bg-emerald-500/35 border-emerald-500 z-10'
                                : inDragRange
                                ? 'bg-indigo-500/25 dark:bg-indigo-500/35 border-indigo-400 z-10'
                                : today ? 'bg-primary/[0.07] border-r-primary/20'
                                : yesterday ? 'bg-slate-500/[0.04] dark:bg-slate-400/[0.04]'
                                : ''
                            } hover:bg-primary/10 group/cell`}
                            title={`Toque para iniciar reserva no Apt ${flat.number} em ${format(day, "dd/MM/yyyy")}`}
                          >
                            {isMobileStart && (
                              <div className="w-full h-8 mx-0.5 rounded-md bg-emerald-600 text-white flex flex-col items-center justify-center text-[9px] font-black shadow-xs ring-2 ring-emerald-400">
                                <span>Check-in</span>
                              </div>
                            )}
                            {!isMobileStart && inDragRange && (
                              <div className="w-full h-8 mx-0.5 rounded-md bg-indigo-600/90 text-white flex items-center justify-center text-[10px] font-black shadow-xs ring-1 ring-indigo-400">
                                ✨
                              </div>
                            )}
                            {!isMobileStart && !inDragRange && today && (
                              <span className="opacity-0 group-hover/cell:opacity-80 text-[10px] text-primary font-bold flex items-center gap-1 transition-opacity">
                                <Plus className="w-3 h-3" /> Disponível
                              </span>
                            )}
                            {!isMobileStart && !inDragRange && yesterday && (
                              <span className="opacity-0 group-hover/cell:opacity-80 text-[10px] text-muted-foreground font-semibold flex items-center gap-1 transition-opacity">
                                Ontem
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Unified Multi-Day Reservation Continuous Bars (Arrastável & Redimensionável) */}
                      {flatReservations.map(resItem => {
                        const isBeingDragged = resDragState?.res.id === resItem.id;
                        const pos = getReservationPosition(resItem.checkinDate, resItem.checkoutDate, resItem.checkinTime, resItem.checkoutTime);
                        if (!pos) return null;

                        const channelCfg = CHANNEL_CONFIG[resItem.channel] || CHANNEL_CONFIG.direta;
                        const nightsCount = differenceInDays(parseISO(resItem.checkoutDate), parseISO(resItem.checkinDate)) || 1;
                        
                        // Cálculo e formatação do Valor Total da Reserva
                        const resTotal = Number(resItem.totalAmount) > 0 
                          ? Number(resItem.totalAmount) 
                          : (Number(resItem.dailyRate || 0) * nightsCount);
                        const formattedTotal = resTotal > 0 
                          ? `R$ ${resTotal.toLocaleString("pt-BR", { minimumFractionDigits: resTotal % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}` 
                          : null;

                        // Verificação dinâmica de Mensalista (por reserva ou por cadastro no CRM)
                        const matchedGuest = (data.guests || []).find((g: any) => 
                          (g.id && g.id === resItem.guestId) ||
                          (g.document && resItem.guestDocument && g.document.replace(/\D/g, '') === resItem.guestDocument.replace(/\D/g, '')) ||
                          (g.phone && resItem.guestPhone && g.phone.replace(/\D/g, '') === resItem.guestPhone.replace(/\D/g, '')) ||
                          (g.name && resItem.guestName && g.name.toLowerCase().trim() === resItem.guestName.toLowerCase().trim()) ||
                          (g.fullName && resItem.guestName && g.fullName.toLowerCase().trim() === resItem.guestName.toLowerCase().trim())
                        );

                        const isMensalista = Boolean(
                          resItem.isMonthlyGuest || 
                          resItem.clientType === "mensalista" ||
                          matchedGuest?.isMonthlyGuest ||
                          matchedGuest?.clientType === "mensalista"
                        );

                        const cinTime = resItem.checkinTime || defaultCheckinTime || "14:00";
                        const coutTime = resItem.checkoutTime || defaultCheckoutTime || "12:00";

                        const isLongPressActive = longPressActiveResId === resItem.id;
                        const isSingleNight = nightsCount <= 1;

                        return (
                          <ReservationHoverCard
                            key={`res-${resItem.id}`}
                            resItem={resItem}
                            flat={flat}
                            isBeingDragged={Boolean(resDragState && (resDragState.hasMoved || resDragState.isLongPressReady))}
                            onOpenDetails={handleOpenEditRes}
                            channelCfg={channelCfg}
                            isMensalista={isMensalista}
                            isOpenMobile={mobileCardResId === resItem.id}
                            onCloseMobile={() => setMobileCardResId(null)}
                          >
                            <div
                              data-reservation-id={resItem.id}
                              style={{ 
                                position: "absolute",
                                left: `${pos.left}px`,
                                width: `${pos.width}px`,
                                top: "7px",
                                height: "34px",
                                touchAction: isLongPressActive ? "none" : undefined
                              }}
                              onPointerDown={(e) => handleStartResDrag(resItem, flat, "move", e)}
                              className={`rounded-xl select-none ${
                                isMensalista 
                                  ? 'bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-800 text-white border-2 border-purple-300 shadow-md ring-2 ring-purple-500/80' 
                                  : `${channelCfg?.bg} ${channelCfg?.text} border ${channelCfg?.border} shadow-xs`
                              } ${
                                resItem.status === 'pre_reserva'
                                  ? 'border-dashed border-2 border-amber-400 ring-1 ring-amber-300/80'
                                  : ''
                              } ${
                                resItem.hasMinor 
                                  ? 'border-2 border-rose-500 ring-2 ring-rose-400 animate-pulse' 
                                  : resItem.riskAttentionAlert
                                  ? 'border-2 border-amber-400 ring-1 ring-amber-300'
                                  : ''
                              } flex items-center px-2 text-[11px] font-bold overflow-hidden z-10 cursor-grab active:cursor-grabbing hover:brightness-110 hover:shadow-md transition-all ${
                                isBeingDragged && (resDragState?.hasMoved || resDragState?.isLongPressReady) ? 'opacity-30 border-dashed scale-95' : ''
                              } ${
                                isLongPressActive ? 'ring-4 ring-indigo-400 ring-offset-2 scale-[1.04] shadow-2xl z-40 animate-pulse brightness-125' : ''
                              }`}
                              title={`${resItem.guestName}${formattedTotal ? ` • ${formattedTotal}` : ""} (${channelCfg?.label || resItem.channel}) • Entrada: ${resItem.checkinDate} às ${cinTime} | Saída: ${resItem.checkoutDate} às ${coutTime} • Toque para ver detalhes ou segure para mover`}
                            >
                              {/* Handle Esquerdo: Redimensionar Início (Check-in) */}
                              <div
                                style={{ touchAction: "none" }}
                                className={`absolute left-0 top-0 bottom-0 ${
                                  isSingleNight ? 'w-3 max-w-[15%]' : 'w-5 max-w-[28%]'
                                } sm:w-3.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20 flex items-center justify-center transition-colors group/resize-l touch-none select-none`}
                                onPointerDown={(e) => handleStartResDrag(resItem, flat, "resize-left", e)}
                                onPointerEnter={(e) => e.stopPropagation()}
                                title="Arraste para alterar a data de Check-in"
                              >
                                <div className="w-1 sm:w-0.5 h-4 sm:h-3.5 bg-white/70 rounded-full group-hover/resize-l:bg-white pointer-events-none shadow-xs" />
                              </div>

                              {/* Conteúdo Central com Nome, Valor e Diárias Contínuos */}
                              <div className="flex items-center gap-1.5 min-w-0 w-full overflow-hidden whitespace-nowrap px-1 pointer-events-none select-none">
                                {resItem.status === 'pre_reserva' && (
                                  <span title="Pré-Reserva (Aguardando Pagamento / Confirmação)" className="shrink-0 text-[9px] px-1 py-0.2 bg-amber-400 text-slate-950 font-black rounded shadow-xs flex items-center gap-0.5">
                                    ⏳ Pré-Reserva
                                  </span>
                                )}
                                {resItem.includeBreakfast && (
                                  <span title="Café da Manhã Incluso" className="shrink-0 text-xs">☕</span>
                                )}
                                {isMensalista && (
                                  <span title="Cliente Mensalista / Contrato Long Stay" className="shrink-0 text-[8.5px] uppercase font-black px-1.5 py-0.2 bg-amber-400 text-slate-950 rounded shadow-xs tracking-wider">
                                    👑 Mensalista
                                  </span>
                                )}
                                {resItem.hasMinor && (
                                  <span title="Hóspede Menor de Idade Registrado (ECA Art. 82)" className="shrink-0 text-xs px-1 py-0.2 bg-rose-600 text-white rounded font-black shadow-xs">
                                    👶 Menor
                                  </span>
                                )}
                                {resItem.riskAttentionAlert && !resItem.hasMinor && (
                                  <span title={resItem.riskAttentionReason || "Atenção: Hóspede jovem < 30 anos (Campos dos Goytacazes)"} className="shrink-0 text-xs px-1 py-0.2 bg-amber-400 text-slate-950 rounded font-black shadow-xs">
                                    ⚠️ &lt;30a
                                  </span>
                                )}
                                <span className="truncate font-black text-white text-[11px] min-w-0">
                                  {resItem.guestName}
                                  {formattedTotal ? ` • ${formattedTotal}` : ""}
                                  {` • ${nightsCount} ${nightsCount === 1 ? 'diária' : 'diárias'}`}
                                </span>
                              </div>

                              {/* Handle Direito: Redimensionar Fim (Check-out) */}
                              <div
                                style={{ touchAction: "none" }}
                                className={`absolute right-0 top-0 bottom-0 ${
                                  isSingleNight ? 'w-3 max-w-[15%]' : 'w-5 max-w-[28%]'
                                } sm:w-3.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20 flex items-center justify-center transition-colors group/resize-r touch-none select-none`}
                                onPointerDown={(e) => handleStartResDrag(resItem, flat, "resize-right", e)}
                                onPointerEnter={(e) => e.stopPropagation()}
                                title="Arraste para alterar a data de Check-out"
                              >
                                <div className="w-1 sm:w-0.5 h-4 sm:h-3.5 bg-white/70 rounded-full group-hover/resize-r:bg-white pointer-events-none shadow-xs" />
                              </div>
                            </div>
                          </ReservationHoverCard>
                        );
                      })}

                      {/* Ghost Preview Bar ao Arrastar / Mover / Redimensionar */}
                      {resDragState && (resDragState.hasMoved || resDragState.isLongPressReady) && flat.id === resDragState.currentFlatId && (() => {
                        const gPos = getReservationPosition(
                          resDragState.currentCheckin, 
                          resDragState.currentCheckout, 
                          resDragState.res?.checkinTime, 
                          resDragState.res?.checkoutTime
                        );
                        if (!gPos) return null;
                        const gNights = differenceInDays(parseISO(resDragState.currentCheckout), parseISO(resDragState.currentCheckin)) || 1;

                        return (
                          <div
                            style={{ 
                              position: "absolute",
                              left: `${gPos.left}px`,
                              width: `${gPos.width}px`,
                              top: "7px",
                              height: "34px"
                            }}
                            className="rounded-xl bg-indigo-600/90 text-white border-2 border-dashed border-white shadow-2xl flex items-center px-3 text-[11px] font-black z-30 pointer-events-none animate-pulse"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span>🚀</span>
                              <span className="truncate">
                                Apt {resDragState.currentFlatNumber} • {resDragState.res.guestName} ({format(parseISO(resDragState.currentCheckin), "dd/MM")} a {format(parseISO(resDragState.currentCheckout), "dd/MM")} - {gNights}d)
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Unified Multi-Day Room Block Bars (Clicável com opção de remoção) */}
                      {flatBlocks.map(blockItem => {
                        const bPos = getBlockPosition(blockItem.startDate, blockItem.endDate);
                        if (!bPos) return null;

                        return (
                          <div
                            key={`block-${blockItem.id}`}
                            style={{ 
                              position: "absolute",
                              left: `${bPos.left}px`,
                              width: `${bPos.width}px`,
                              top: "7px",
                              height: "34px"
                            }}
                            onClick={(e) => { e.stopPropagation(); handleOpenBlockDetails(blockItem, flat); }}
                            className="rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white flex items-center justify-between px-2.5 text-[10.5px] font-bold shadow-xs z-10 cursor-pointer overflow-hidden border border-slate-700 hover:border-amber-400/60 transition-all hover:scale-[1.01] active:scale-[0.99] group"
                            title={`Bloqueio: ${blockItem.reason === 'manutencao' ? 'Manutenção' : 'Bloqueio'} • Clique para ver detalhes ou remover bloqueio`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                              <span className="truncate">
                                {blockItem.reason === "manutencao" ? "🛠️ Manutenção" : "🔑 Bloqueio"} {blockItem.notes ? `• ${blockItem.notes}` : ""}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBlock(blockItem.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-600 rounded-lg text-white transition-all shrink-0 ml-1.5"
                              title="Remover Bloqueio"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        
        {/* Banner Flutuante de Ajuda ao Mover / Redimensionar Reserva */}
        {resDragState && (resDragState.hasMoved || resDragState.isLongPressReady) && (
          <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-6 z-50 bg-slate-950/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs border border-indigo-500 animate-in slide-in-from-top duration-150">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center font-black shrink-0">
              {resDragState.mode === "move" ? "↔️" : "↔"}
            </div>
            <div>
              <div className="font-black text-indigo-300">
                {resDragState.mode === "move" 
                  ? (resDragState.hasMoved ? "Movendo Reserva:" : "Reserva pronta para mover:")
                  : "Alterando Duração:"}
              </div>
              <div className="font-semibold text-[11px]">
                Apt {resDragState.currentFlatNumber} • {format(parseISO(resDragState.currentCheckin), "dd/MM")} até {format(parseISO(resDragState.currentCheckout), "dd/MM")} ({differenceInDays(parseISO(resDragState.currentCheckout), parseISO(resDragState.currentCheckin))} noites)
                {!resDragState.hasMoved && resDragState.mode === "move" && (
                  <span className="block text-[10px] text-indigo-200/80 font-normal">👉 Arraste o dedo até o apartamento ou data desejada</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile 2-Tap Selection Floating Banner (Topo não-obstrutivo) */}
        {mobileRangeStart && !isDragging && (
          <div className="fixed top-4 inset-x-3 sm:top-5 sm:inset-x-auto sm:right-6 z-50 bg-slate-950/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-xs border border-emerald-500/80 animate-in slide-in-from-top duration-200 max-w-md mx-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 text-white font-bold text-xs">
                1º
              </div>
              <div className="min-w-0">
                <span className="block font-black text-emerald-400 text-xs truncate">
                  Apt {mobileRangeStart.flatNumber} • Check-in: {format(mobileRangeStart.day, "dd/MM/yyyy")}
                </span>
                <span className="block text-[10px] text-slate-300 font-medium truncate">
                  👉 Toque no dia de saída para abrir a reserva
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button 
                type="button" 
                size="sm" 
                onClick={() => {
                  handleOpenNewRes(mobileRangeStart.flatId, mobileRangeStart.day)
                  setMobileRangeStart(null)
                }}
                className="h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 rounded-lg shadow-xs"
              >
                1 Diária
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={() => setMobileRangeStart(null)}
                className="h-7 text-xs font-bold text-slate-400 hover:text-white px-2 rounded-lg"
              >
                ✕
              </Button>
            </div>
          </div>
        )}

        {/* Floating Indicator during Drag */}
        {isDragging && dragStartDay && dragHoverDay && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold ring-2 ring-indigo-500 animate-bounce">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div>
              <span>
                Apt {data.flats.find(f => f.id === dragFlatId)?.number}: {format(dragStartDay <= dragHoverDay ? dragStartDay : dragHoverDay, "dd/MM")} até {format(addDays(dragStartDay <= dragHoverDay ? dragHoverDay : dragStartDay, 1), "dd/MM")} ({Math.max(1, differenceInDays(dragStartDay <= dragHoverDay ? dragHoverDay : dragStartDay, dragStartDay <= dragHoverDay ? dragStartDay : dragHoverDay) + 1)} diárias)
              </span>
              <span className="block text-[10px] font-normal opacity-80">Solte para abrir a reserva</span>
            </div>
          </div>
        )}

        {/* Modal: New / Edit Reservation */}
        <Dialog open={resModalOpen} onOpenChange={setResModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary shrink-0" />
                  <span>{selectedRes ? `Editar Reserva: ${selectedRes.code}` : "Nova Reserva"}</span>
                </DialogTitle>
                {selectedRes && (
                  <Badge variant="outline" className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300 border-amber-300 shrink-0">
                    Flat {selectedRes.flatNumber}
                  </Badge>
                )}
              </div>
              <DialogDescription>
                {selectedRes 
                  ? "Gerencie os dados da estadia, consulte o histórico de e-mails transacionais ou envie novas mensagens." 
                  : "Preencha os dados do hóspede, datas da estadia e valores."}
              </DialogDescription>
            </DialogHeader>

            {selectedRes && (
              <Tabs value={resModalTab} onValueChange={(v: any) => setResModalTab(v)} className="w-full mt-1 mb-2">
                <TabsList className="flex w-full items-center overflow-x-auto p-1 bg-muted/60 rounded-xl sm:grid sm:grid-cols-4 gap-1 h-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsTrigger
                    value="details"
                    className="flex-1 shrink-0 text-xs font-bold gap-1.5 rounded-lg py-2 px-2.5 sm:px-3 whitespace-nowrap data-[state=active]:shadow-xs"
                  >
                    <CalendarDays className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <span><span className="hidden sm:inline">Dados da </span>Reserva</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="audit"
                    className="flex-1 shrink-0 text-xs font-bold gap-1.5 rounded-lg py-2 px-2.5 sm:px-3 whitespace-nowrap data-[state=active]:shadow-xs relative"
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                    <span>Histórico<span className="hidden sm:inline"> & Logs</span></span>
                    {auditLogs.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-bold ml-0.5 bg-blue-500/15 text-blue-700 dark:text-blue-300 shrink-0">
                        {auditLogs.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="communications"
                    className="flex-1 shrink-0 text-xs font-bold gap-1.5 rounded-lg py-2 px-2.5 sm:px-3 whitespace-nowrap data-[state=active]:shadow-xs relative"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    <span>Comunicações</span>
                    {communications.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-bold ml-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                        {communications.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="links"
                    className="flex-1 shrink-0 text-xs font-bold gap-1.5 rounded-lg py-2 px-2.5 sm:px-3 whitespace-nowrap data-[state=active]:shadow-xs relative"
                  >
                    <Link2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span>Links Úteis</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {(!selectedRes || resModalTab === "details") && (
              <form onSubmit={handleSaveRes}>

              <div className="py-3 space-y-3.5">
                {/* Banner de Acesso Rápido aos Links da Reserva */}
                {selectedRes && (
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Link2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">Central de Links da Reserva</div>
                        <div className="text-[11px] text-muted-foreground">Portal Minha Reserva, Café, Pré Check-in e Check-out Expresso</div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResModalTab("links")}
                      className="h-7 px-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40 shrink-0 rounded-xl"
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1" />
                      Ver todos ➔
                    </Button>
                  </div>
                )}

                {/* Banner de Auditoria e Registro */}
                {selectedRes && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Registro & Auditoria da Reserva</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setResModalTab("audit")}
                        className="h-6 px-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-100/50 dark:hover:bg-blue-950/50"
                      >
                        Ver histórico completo ({auditLogs.length}) ➔
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70">
                      <div className="space-y-0.5">
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>Criada em:</span>
                          <strong className="text-foreground font-semibold">
                            {selectedRes.createdAt 
                              ? format(parseISO(selectedRes.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                              : "Data não registrada"}
                          </strong>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>Por:</span>
                          <strong className="text-slate-700 dark:text-slate-300 font-medium">
                            {selectedRes.createdBy?.userName || selectedRes.createdBy?.name || (selectedRes.channel === "site" || selectedRes.channel === "site_direto" ? selectedRes.guestName || "Hóspede (Site)" : "Recepção / PMS")}
                          </strong>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                            {selectedRes.createdBy?.source || CHANNEL_CONFIG[selectedRes.channel]?.label || selectedRes.channel || "PMS Calendário"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>Última modificação:</span>
                          <strong className="text-foreground font-semibold">
                            {auditLogs.length > 0 && auditLogs[0]?.action !== "created"
                              ? format(parseISO(auditLogs[0]?.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                              : (selectedRes.updatedAt && selectedRes.updatedAt !== selectedRes.createdAt
                                  ? format(parseISO(selectedRes.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                  : "Sem alterações")}
                          </strong>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          {auditLogs.length > 0 && auditLogs[0]?.action !== "created" ? (
                            <>
                              <span>Por:</span>
                              <strong className="text-slate-700 dark:text-slate-300 font-medium">{auditLogs[0]?.actor?.name || "Administrador"}</strong>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                                {auditLogs[0]?.source || "PMS"}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Nenhuma alteração pós-criação</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold block leading-none h-4 flex items-center">Apartamento</Label>
                      {!selectedRes && fairShareResult?.bestFlatId && String(formFlatId) === String(fairShareResult.bestFlatId) && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                          ✨ Sugerido da vez
                        </span>
                      )}
                    </div>
                    <Select 
                      value={formFlatId} 
                      onValueChange={(val) => { 
                        isFlatManuallyChangedRef.current = true;
                        setFormFlatId(val); 
                        setFormForceReplace(false); 
                      }}
                    >
                      <SelectTrigger className="text-xs font-bold h-9">
                        <SelectValue placeholder={loadingFairShare ? "✨ Buscando quarto sugerido..." : "Selecione o Flat"}>
                          {formFlatId 
                            ? `Apt ${data.flats.find(f => String(f.id) === String(formFlatId))?.number || formFlatId}${!selectedRes && String(formFlatId) === String(fairShareResult?.bestFlatId) ? " ✨ (Sugerido)" : ""}` 
                            : (loadingFairShare ? "✨ Selecionando quarto sugerido..." : "Selecione o Flat")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {data.flats.map(f => {
                          const flatStat = fairShareResult?.allStats?.find((s: any) => s.flat?.id === f.id);
                          const isBest = fairShareResult?.bestFlatId === f.id;
                          const isAvail = flatStat ? flatStat.isAvailable : true;
                          const conflictName = flatStat?.conflicts?.[0]?.guestName;

                          return (
                            <SelectItem key={f.id} value={String(f.id)}>
                              <div className="flex items-center justify-between gap-2 w-full py-0.5">
                                <span className="font-bold">Apt {f.number}</span>
                                {isBest && (
                                  <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    ✨ Quarto da Vez (Sugerido)
                                  </span>
                                )}
                                {!isAvail && (
                                  <span className="text-[9px] bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded">
                                    ⚠️ Ocupado {conflictName ? `(${conflictName})` : ''}
                                  </span>
                                )}
                                {isAvail && !isBest && (
                                  <span className="text-[9px] text-muted-foreground font-medium">
                                    Livre ({flatStat?.monthOccupiedDays || 0}d)
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold block leading-none h-4 flex items-center">Canal de Origem</Label>
                    <Select 
                      value={formChannel} 
                      onValueChange={val => {
                        setFormChannel(val);
                        if (val === "booking" || val === "airbnb") {
                          setFormPaymentStatus("pago_total");
                          const tot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                          if (tot > 0) setFormPaidAmount(String(tot));
                        }
                      }}
                    >
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Canal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="site">🌐 Site Próprio / Motor de Reservas</SelectItem>
                        <SelectItem value="whatsapp">💬 WhatsApp / Reserva Direta</SelectItem>
                        <SelectItem value="booking">🔵 Booking.com</SelectItem>
                        <SelectItem value="airbnb">🔴 Airbnb</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Banner sutil do Quarto da Vez apenas na criação de Nova Reserva */}
                {!selectedRes && fairShareResult?.bestFlatNumber && (
                  <div className="text-[11px] text-amber-800 dark:text-amber-200 font-medium flex items-center justify-between bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg animate-in fade-in">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>
                        Sugestão da vez para equilíbrio: <strong className="font-bold">Apt {fairShareResult.bestFlatNumber}</strong>
                        {String(formFlatId) === String(fairShareResult.bestFlatId) && (
                          <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">✓ Selecionado</span>
                        )}
                      </span>
                    </div>
                    {String(formFlatId) !== String(fairShareResult.bestFlatId) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          isFlatManuallyChangedRef.current = false;
                          setFormFlatId(String(fairShareResult.bestFlatId));
                          setFormForceReplace(false);
                        }}
                        className="h-6 text-[10px] font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 px-2 py-0 border border-amber-500/30 rounded"
                      >
                        Usar Apt {fairShareResult.bestFlatNumber}
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  {/* Entrada / Check-in */}
                  <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-border/70">
                    <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                        Entrada (Check-in)
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">Padrão: {defaultCheckinTime}</span>
                    </Label>
                    <div className="grid grid-cols-5 gap-2 items-center">
                      <div className="col-span-3">
                        <Label className="text-[10px] text-muted-foreground block mb-0.5">Data</Label>
                        <Input 
                          type="date" 
                          value={formCheckin} 
                          onChange={e => setFormCheckin(e.target.value)} 
                          required 
                          className="text-xs h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-muted-foreground block mb-0.5">Horário</Label>
                        <Input 
                          type="time" 
                          value={formCheckinTime} 
                          onChange={e => setFormCheckinTime(e.target.value)} 
                          required 
                          className="text-xs h-9 font-medium"
                          title="Horário previsto para início do Check-in"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Saída / Check-out */}
                  <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-border/70">
                    <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <LogOut className="w-3.5 h-3.5 text-rose-600" />
                        Saída (Check-out)
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">Padrão: {defaultCheckoutTime}</span>
                    </Label>
                    <div className="grid grid-cols-5 gap-2 items-center">
                      <div className="col-span-3">
                        <Label className="text-[10px] text-muted-foreground block mb-0.5">Data</Label>
                        <Input 
                          type="date" 
                          value={formCheckout} 
                          onChange={e => setFormCheckout(e.target.value)} 
                          required 
                          className="text-xs h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-muted-foreground block mb-0.5">Horário</Label>
                        <Input 
                          type="time" 
                          value={formCheckoutTime} 
                          onChange={e => setFormCheckoutTime(e.target.value)} 
                          required 
                          className="text-xs h-9 font-medium"
                          title="Horário limite para conclusão do Check-out"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Early Check-in Switch */}
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Autorizar Early Check-in</span>
                      <span className="text-[11px] text-muted-foreground">Permite liberação na portaria antes das 13:00</span>
                    </div>
                  </div>
                  <Switch checked={formEarlyCheckin} onCheckedChange={setFormEarlyCheckin} />
                </div>


                {/* Alerta de Quarto Ocupado & Substituição com Transferência Automática */}
                {(() => {
                  const selectedStat = fairShareResult?.allStats?.find((s: any) => String(s.flat?.id) === String(formFlatId));
                  if (!selectedStat || selectedStat.isAvailable || selectedRes) return null;
                  const conflict = selectedStat.conflicts?.[0];

                  return (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">Apt {selectedStat.flat?.number} já possui reserva no período!</span>
                          <span className="text-[11px] text-amber-700 dark:text-amber-300/90 block">
                            Hóspede atual: <strong>{conflict?.guestName || "Outro Hóspede"}</strong> ({conflict?.checkinDate} a {conflict?.checkoutDate})
                          </span>
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-amber-200 dark:border-amber-800/60 flex items-center justify-between">
                        <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                          Substituir e transferir <strong>{conflict?.guestName || "hóspede"}</strong> para o próximo Quarto da Vez
                        </div>
                        <Switch checked={formForceReplace} onCheckedChange={setFormForceReplace} />
                      </div>
                    </div>
                  );
                })()}

                {/* Switch: Mensalista / Contrato */}
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Cliente Mensalista / Contrato Long Stay</span>
                      <span className="text-[11px] text-muted-foreground">Exibe destaque visual exclusivo no Livro de Reservas</span>
                    </div>
                  </div>
                  <Switch checked={formIsMonthlyGuest} onCheckedChange={setFormIsMonthlyGuest} />
                </div>

                {/* Auto NFS-e Switch */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Auto-Emitir Nota Fiscal (NFS-e) no Check-out</span>
                      <span className="text-[11px] text-muted-foreground">Emite e envia NFS-e no WhatsApp deste cliente no check-out (Padrão: OFF)</span>
                    </div>
                  </div>
                  <Switch checked={formAutoInvoice} onCheckedChange={setFormAutoInvoice} />
                </div>

                {/* Special Reception Notice */}
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Aviso / Nota Especial para a Portaria & Recepção</span>
                  </Label>
                  <Input 
                    value={formReceptionNotes} 
                    onChange={e => setFormReceptionNotes(e.target.value)} 
                    placeholder="Ex: Entregar chave extra, vaga de garagem G2-14 liberada..." 
                    className="text-xs border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30"
                  />
                </div>

                {/* Configuração do Quarto para a Governança / Camareiras */}
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <BedDouble className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Preparação do Quarto para as Camareiras</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border-amber-300">
                      Exibido no Card da Governança
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* 2 Camas de solteiro */}
                    <button
                      type="button"
                      onClick={() => setFormTwinBeds(!formTwinBeds)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formTwinBeds 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" 
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                      }`}
                    >
                      <span>🛏️ 2 Camas Solteiro</span>
                      {formTwinBeds && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    {/* Colchão extra */}
                    <button
                      type="button"
                      onClick={() => setFormExtraMattress(!formExtraMattress)}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formExtraMattress 
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs" 
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-purple-400"
                      }`}
                    >
                      <span>➕ Colchão Extra</span>
                      {formExtraMattress && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Observação / Pedido Especial para o Quarto (Ex: Decoração de Casal, Kit Bebê...)
                    </Label>
                    <Input 
                      value={formSpecialRequests}
                      onChange={e => setFormSpecialRequests(e.target.value)}
                      placeholder="Ex: Decoração de casal, montar berço desmontável, travesseiro extra..."
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Seção Própria: Serviço de Café da Manhã */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                          Café da Manhã Incluso na Diária
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Habilita link de cardápio e agendamento de café para este hóspede
                        </span>
                      </div>
                    </div>
                    <Switch checked={formIncludeBreakfast} onCheckedChange={setFormIncludeBreakfast} />
                  </div>

                  {formIncludeBreakfast && (
                    <div className="pt-2 border-t border-amber-500/20 space-y-2 animate-in fade-in">
                      <div className="text-[11px] text-muted-foreground">
                        Link exclusivo para escolha de itens e horários pelo hóspede:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const resCode = selectedRes?.code || selectedRes?.breakfastToken || formGuestName || 'reserva'
                            const url = `${window.location.origin}/cafe?res=${resCode}`
                            const phone = (formGuestPhone || selectedRes?.guestPhone || "").replace(/\D/g, "")
                            const guestName = formGuestName || selectedRes?.guestName || "Hóspede"
                            const flatNum = formFlatId ? ((data.flats || []).find((f: any) => f.id === Number(formFlatId))?.number || formFlatId) : (selectedRes?.flatNumber || "seu flat")
                            const msg = encodeURIComponent(`Olá ${guestName}! Aqui é da equipe da CorpFlats. Segue o seu link exclusivo para montar e agendar o seu café da manhã no Flat ${flatNum}: ${url}`)
                            window.open(`https://wa.me/${phone}?text=${msg}`, "_blank")
                          }}
                          className="w-full h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Enviar WhatsApp
                        </Button>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const resCode = selectedRes?.code || selectedRes?.breakfastToken || formGuestName || 'reserva'
                              const url = `${window.location.origin}/cafe?res=${resCode}`
                              navigator.clipboard.writeText(url)
                              toast({ title: "Link copiado!", description: "Link do café da manhã copiado para a área de transferência." })
                            }}
                            className="flex-1 h-8 text-xs font-bold gap-1.5 bg-background hover:bg-muted border-border"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copiar Link
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const resCode = selectedRes?.code || selectedRes?.breakfastToken || formGuestName || 'reserva'
                              const url = `/cafe?res=${resCode}`
                              window.open(url, "_blank")
                            }}
                            className="h-8 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground"
                            title="Abrir página de pedidos"
                          >
                            Abrir ↗
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 1. Quantidade de Hóspedes Autorizados (1, 2 ou 3) */}
                <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Quantidade de Hóspedes na Reserva</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200">
                      Capacidade Máxima: 3 Pessoas
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["1", "2", "3"] as const).map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormGuestCount(num)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          formGuestCount === num
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>{num} {num === "1" ? "Hóspede" : "Hóspedes"}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Tipo de Solicitante da Reserva (Próprio Hóspede, Terceiro ou Empresa) */}
                <div className="p-3 bg-slate-100/80 dark:bg-slate-900/80 border rounded-xl space-y-2.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                    Quem está solicitando a reserva?
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormRequesterType("guest")}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "guest"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>👤 Próprio Hóspede</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRequesterType("other_person")}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "other_person"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>👥 Outra Pessoa (Terceiro)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRequesterType("company")}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "company"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>🏢 Empresa (PJ / Faturamento)</span>
                    </button>
                  </div>

                  {/* Detalhes do Solicitante Próprio Hóspede */}
                  {formRequesterType === "guest" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-primary block">
                          Selecione o Hóspede Cadastrado (CRM 360°)
                        </span>
                        {formGuestId && formGuestId !== "manual" && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormGuestId("")
                              setFormGuestName("")
                              setFormGuest1Cpf("")
                              setFormGuestPhone("")
                              setFormGuestEmail("")
                            }}
                            className="text-[10px] text-muted-foreground hover:text-rose-600 underline font-semibold transition-colors"
                          >
                            Limpar seleção
                          </button>
                        )}
                      </div>

                      {crmGuests.length > 5 && (
                        <div className="relative">
                          <Input
                            value={guestSearchFilter}
                            onChange={e => setGuestSearchFilter(e.target.value)}
                            placeholder="🔍 Filtrar por nome, CPF ou WhatsApp..."
                            className="text-xs h-7 mb-1 bg-muted/40"
                          />
                        </div>
                      )}

                      <Select value={formGuestId} onValueChange={handleSelectGuest}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Selecione um Hóspede Cadastrado no CRM..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="manual" className="text-primary font-bold">
                            ➕ Novo Hóspede (Digitar manualmente)
                          </SelectItem>
                          {filteredGuests.map((g: any) => (
                            <SelectItem key={g.id} value={String(g.id)}>
                              <span className="font-semibold">{g.name || g.fullName}</span>
                              {g.documentNumber || g.document ? ` • CPF: ${g.documentNumber || g.document}` : ""}
                              {g.phone ? ` • Tel: ${g.phone}` : ""}
                              {g.companyName ? ` • (${g.companyName})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formGuestId && formGuestId !== "manual" && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Hóspede carregado do CRM. Dados preenchidos abaixo.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detalhes do Solicitante Terceiro */}
                  {formRequesterType === "other_person" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <span className="text-[10px] uppercase font-black text-primary block">Dados do Solicitante (Contato)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formRequesterName} onChange={e => setFormRequesterName(e.target.value)} placeholder="Nome do Solicitante" className="text-xs h-8" />
                        <Input value={formRequesterPhone} onChange={e => setFormRequesterPhone(e.target.value)} placeholder="WhatsApp do Solicitante" className="text-xs h-8" />
                      </div>
                    </div>
                  )}

                  {/* Detalhes do Solicitante Empresa */}
                  {formRequesterType === "company" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <span className="text-[10px] uppercase font-black text-primary block">Selecione a Empresa Cadastrada</span>
                      <Select value={formCompanyId} onValueChange={(val) => {
                        setFormCompanyId(val)
                        const c = companies.find(comp => String(comp.id) === val)
                        if (c) setFormCompanyName(c.tradeName || c.corporateName)
                      }}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Selecione a Empresa Parceira..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.tradeName || c.corporateName} • CNPJ: {c.cnpj}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* 3. Dados dos Hóspedes Autorizados (1, 2 e 3) */}
                <div className="space-y-3">
                  {/* Hóspede 1 (Principal) */}
                  <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5">
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-primary" />
                        <span>Hóspede 1 (Titular)</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {formRequesterType !== "guest" && (
                          <div className="w-56">
                            <Select value={formGuestId} onValueChange={handleSelectGuest}>
                              <SelectTrigger className="text-[10px] h-6 px-2">
                                <SelectValue placeholder="Puxar do CRM..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                <SelectItem value="manual" className="text-primary font-bold text-xs">
                                  Digitar manualmente
                                </SelectItem>
                                {crmGuests.map((g: any) => (
                                  <SelectItem key={g.id} value={String(g.id)} className="text-xs">
                                    {g.name || g.fullName}
                                    {g.phone ? ` • ${g.phone}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <Badge variant="outline" className="text-[9px]">Check-in Principal</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={formGuestName} onChange={e => setFormGuestName(e.target.value)} placeholder="Nome Completo *" required className="text-xs h-8" />
                      <Input value={formGuest1Cpf} onChange={e => setFormGuest1Cpf(e.target.value)} placeholder="CPF / Documento" className="text-xs h-8" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={formGuestPhone} onChange={e => setFormGuestPhone(e.target.value)} placeholder="WhatsApp / Celular" className="text-xs h-8" />
                      <Input type="email" value={formGuestEmail} onChange={e => setFormGuestEmail(e.target.value)} placeholder="E-mail" className="text-xs h-8" />
                    </div>
                  </div>

                  {/* Hóspede 2 */}
                  {Number(formGuestCount) >= 2 && (
                    <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Hóspede 2 (Autorizado)</span>
                        </span>
                        <Badge variant="outline" className="text-[9px]">Acompanhante</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest2Name} onChange={e => setFormGuest2Name(e.target.value)} placeholder="Nome do 2º Hóspede" className="text-xs h-8" />
                        <Input value={formGuest2Cpf} onChange={e => setFormGuest2Cpf(e.target.value)} placeholder="CPF do 2º Hóspede" className="text-xs h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest2Phone} onChange={e => setFormGuest2Phone(e.target.value)} placeholder="WhatsApp do 2º Hóspede" className="text-xs h-8" />
                        <Input type="email" value={formGuest2Email} onChange={e => setFormGuest2Email(e.target.value)} placeholder="E-mail" className="text-xs h-8" />
                      </div>
                    </div>
                  )}

                  {/* Hóspede 3 */}
                  {Number(formGuestCount) === 3 && (
                    <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-purple-600" />
                          <span>Hóspede 3 (Autorizado)</span>
                        </span>
                        <Badge variant="outline" className="text-[9px]">Acompanhante Extra</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest3Name} onChange={e => setFormGuest3Name(e.target.value)} placeholder="Nome do 3º Hóspede" className="text-xs h-8" />
                        <Input value={formGuest3Cpf} onChange={e => setFormGuest3Cpf(e.target.value)} placeholder="CPF do 3º Hóspede" className="text-xs h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={formGuest3Phone} onChange={e => setFormGuest3Phone(e.target.value)} placeholder="WhatsApp do 3º Hóspede" className="text-xs h-8" />
                        <Input type="email" value={formGuest3Email} onChange={e => setFormGuest3Email(e.target.value)} placeholder="E-mail" className="text-xs h-8" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Status & Confirmação da Reserva (Regra Oficial: só confirmada se marcada aqui) */}
                <div className={`p-3.5 rounded-2xl border transition-all ${
                  formStatus === "confirmada" 
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/60" 
                    : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {formStatus === "confirmada" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      )}
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Status & Confirmação da Reserva
                      </span>
                    </div>
                    <Badge className={formStatus === "confirmada" ? "bg-emerald-600 text-white font-bold text-[10px]" : "bg-amber-500 text-white font-bold text-[10px]"}>
                      {formStatus === "confirmada" ? "✅ Confirmada" : "⏳ Pré-Reserva"}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground mb-2.5">
                    A reserva <strong>só é confirmada de fato</strong> se marcada como <strong>Confirmada</strong> abaixo. Pode ser confirmada mesmo sem pagamento integral (ex: faturado corporativo, pagamento no balcão no check-in, hóspede VIP).
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormStatus("pre_reserva")}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formStatus === "pre_reserva"
                          ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-amber-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>⏳ Pré-Reserva</span>
                      </div>
                      {formStatus === "pre_reserva" && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormStatus("confirmada")}
                      className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between ${
                        formStatus === "confirmada"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-emerald-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>✅ Confirmada</span>
                      </div>
                      {formStatus === "confirmada" && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Financial values & Payment Status */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Valores & Pagamento da Reserva</span>
                    </span>
                    {(formChannel === "booking" || formChannel === "airbnb") && (
                      <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-800 border-sky-300">
                        Canal OTA • Pago Automaticamente
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {/* Valor da Diária */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Valor da Diária (R$)</Label>
                      <Input 
                        type="number" 
                        value={formDailyRate} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormDailyRate(val);
                          try {
                            const d1 = parseISO(formCheckin);
                            const d2 = parseISO(formCheckout);
                            const nights = Math.max(1, differenceInDays(d2, d1));
                            if (val !== "") {
                              const newTot = nights * (Number(val) || 0);
                              setFormTotalAmount(String(newTot));
                              if (formPaymentStatus === "pago_total" || formChannel === "booking" || formChannel === "airbnb") {
                                setFormPaidAmount(String(newTot));
                              }
                            }
                          } catch {}
                        }} 
                        placeholder="Ex: 250"
                        className="text-xs font-semibold"
                      />
                    </div>

                    {/* Valor Total da Reserva */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Valor Total (R$)</Label>
                      <Input 
                        type="number"
                        value={formTotalAmount !== "" ? formTotalAmount : (calculateTotal() > 0 ? String(calculateTotal()) : "")}
                        onChange={e => {
                          const val = e.target.value;
                          setFormTotalAmount(val);
                          if (formPaymentStatus === "pago_total" || formChannel === "booking" || formChannel === "airbnb") {
                            setFormPaidAmount(val);
                          }
                          try {
                            const d1 = parseISO(formCheckin);
                            const d2 = parseISO(formCheckout);
                            const nights = Math.max(1, differenceInDays(d2, d1));
                            if (val !== "" && nights > 0) {
                              setFormDailyRate(String(Math.round((Number(val) || 0) / nights)));
                            }
                          } catch {}
                        }}
                        placeholder="Ex: 500"
                        className="text-xs font-bold text-emerald-700 dark:text-emerald-300"
                      />
                    </div>

                    {/* Quanto foi pago (R$) */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold flex items-center justify-between">
                        <span>Quanto foi pago (R$)</span>
                        {Number(formPaidAmount) > 0 && (
                          <span className="text-[10px] text-emerald-600 font-bold">
                            {Math.round((Number(formPaidAmount) / (Number(formTotalAmount) || calculateTotal() || 1)) * 100)}%
                          </span>
                        )}
                      </Label>
                      <Input 
                        type="number" 
                        value={formPaidAmount} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormPaidAmount(val);
                          const numVal = Number(val) || 0;
                          const currentTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                          if (numVal <= 0) {
                            setFormPaymentStatus("pendente");
                          } else if (numVal >= currentTot && currentTot > 0) {
                            setFormPaymentStatus("pago_total");
                          } else {
                            setFormPaymentStatus("sinal_pago");
                          }
                        }} 
                        placeholder="Ex: 0 ou 250"
                        className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20"
                      />
                    </div>

                    {/* Status de Pagamento */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Status Pagamento</Label>
                      <Select 
                        value={formPaymentStatus} 
                        onValueChange={val => {
                          setFormPaymentStatus(val);
                          const currentTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                          if (val === "pago_total") {
                            setFormPaidAmount(String(currentTot));
                          } else if (val === "pendente") {
                            setFormPaidAmount("0");
                          } else if (val === "sinal_pago") {
                            setFormPaidAmount(String(Math.round(currentTot / 2)));
                          }
                        }}
                      >
                        <SelectTrigger className={`text-xs font-bold ${
                          formPaymentStatus === "pago_total" 
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300" 
                            : formPaymentStatus === "sinal_pago"
                            ? "bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300"
                            : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300"
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pago_total">✅ Pago (100% Quitado)</SelectItem>
                          <SelectItem value="sinal_pago">⚡ Sinal Pago (Parcial)</SelectItem>
                          <SelectItem value="pendente">⏳ Aguardando Pagamento (R$ 0)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Atalhos Rápidos de Valor Pago & Saldo Restante */}
                  {(() => {
                    const currentTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                    const currentPaid = Number(formPaidAmount) || 0;
                    const remaining = Math.max(0, currentTot - currentPaid);

                    return (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground font-medium">Preencher rápido:</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFormPaidAmount("0");
                              setFormPaymentStatus("pendente");
                            }}
                            className="h-6 px-2 text-[10px] font-bold cursor-pointer"
                          >
                            R$ 0 (Nada)
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const half = Math.round(currentTot / 2);
                              setFormPaidAmount(String(half));
                              setFormPaymentStatus("sinal_pago");
                            }}
                            className="h-6 px-2 text-[10px] font-bold cursor-pointer"
                          >
                            50% (Sinal)
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFormPaidAmount(String(currentTot));
                              setFormPaymentStatus("pago_total");
                            }}
                            className="h-6 px-2 text-[10px] font-bold cursor-pointer"
                          >
                            100% (Total)
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Quanto falta pagar:</span>
                          <Badge className={remaining > 0 ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 font-bold" : "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 font-bold"}>
                            {remaining > 0 ? `R$ ${remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Quitado (R$ 0,00)"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações Gerais da Reserva</Label>
                  <Textarea 
                    value={formNotes} 
                    onChange={e => setFormNotes(e.target.value)} 
                    placeholder="Ex: Cama de casal, chegada de madrugada, berço..." 
                    className="text-xs h-16 resize-none"
                  />
                </div>

                {/* 💳 Detalhes Oficiais de Pagamento & Rastreamento Bancário */}
                {selectedRes && (() => {
                  const chanLower = String(formChannel || selectedRes.channel || "").toLowerCase();
                  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
                  const currentTotal = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                  const isResPaid = isOta || formPaymentStatus === "pago_total" || formPaymentStatus === "pago" || (Number(formPaidAmount) >= currentTotal && currentTotal > 0);
                  const realPaid = isResPaid ? currentTotal : (Number(formPaidAmount) || 0);
                  const realPending = Math.max(0, currentTotal - realPaid);

                  return (
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          💳 <span>Comprovante & Rastreamento Bancário</span>
                        </span>
                        <Badge className={isResPaid ? "bg-emerald-600 text-white font-bold text-[10px]" : "bg-amber-600 text-white font-bold text-[10px]"}>
                          {isResPaid 
                            ? (isOta ? (chanLower.includes("booking") ? "✓ Pago (Booking)" : "✓ Pago (Airbnb)") : "✓ Pago Integralmente") 
                            : (formPaymentStatus === "sinal_pago" ? "⚡ Sinal Pago (50%)" : (selectedRes.paymentStatus === "aguardando_pix" ? "⚡ Aguardando PIX" : "⏳ Aguardando Pagamento"))}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block font-medium">Forma de Pagamento:</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {isOta 
                              ? (chanLower.includes("booking") ? "🌐 Booking.com" : "🔴 Airbnb")
                              : (selectedRes.pixTxId || selectedRes.paymentMethod === "pix" 
                                  ? "⚡ PIX Instantâneo (Banco Inter)" 
                                  : (selectedRes.mpPaymentId || selectedRes.paymentMethod === "cartao_credito" 
                                      ? "💳 Cartão de Crédito (Mercado Pago)" 
                                      : (selectedRes.channel === "whatsapp" ? "💬 WhatsApp / CorpFlats" : "Reserva Manual / Direta")))}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted-foreground block font-medium">Valor Recebido:</span>
                          <span className={`font-bold ${isResPaid ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}`}>
                            R$ {realPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {!isResPaid && (
                          <div>
                            <span className="text-muted-foreground block font-medium">Saldo a Pagar:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              R$ {realPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação Rápida Financeira */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5 items-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] bg-white dark:bg-neutral-800 border-slate-300 text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center gap-1"
                          onClick={() => {
                            const link = `https://corpflats.onrender.com/minha-reserva/${selectedRes.code || selectedRes.id}`;
                            navigator.clipboard.writeText(link);
                            toast({ title: "Link Copiado!", description: "Link da reserva e pagamento copiado para a área de transferência." });
                          }}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copiar Link do Hóspede</span>
                        </Button>

                        {!isResPaid && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 flex items-center gap-1 font-bold"
                              onClick={async () => {
                                try {
                                  const currentTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                                  const tot = currentTot > 0 ? currentTot : (Number(selectedRes.totalAmount) > 0 ? Number(selectedRes.totalAmount) : 0);
                                  const res = await fetch(`/api/pms/reservations/${selectedRes.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      paymentStatus: "pago_total",
                                      paidAmount: tot,
                                      totalAmount: tot,
                                      dailyRate: Number(formDailyRate) || undefined
                                    })
                                  });
                                  const d = await res.json();
                                  if (res.ok) {
                                    toast({ title: "✅ Marcado como Pago!", description: `Reserva ${selectedRes.code} marcada como paga!` });
                                    setSelectedRes((prev: any) => prev ? { ...prev, paymentStatus: "pago_total", paidAmount: tot, totalAmount: tot } : null);
                                    setFormPaymentStatus("pago_total");
                                    setFormPaidAmount(String(tot));
                                    fetchData();
                                  } else {
                                    toast({ title: "Atenção", description: d.error || "Erro ao atualizar pagamento", variant: "destructive" });
                                  }
                                } catch (e: any) {
                                  toast({ title: "Erro", description: e.message, variant: "destructive" });
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Marcar como Pago</span>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] bg-white dark:bg-neutral-800 border-sky-300 text-sky-700 dark:text-sky-300 hover:bg-sky-50 flex items-center gap-1"
                              onClick={async () => {
                                try {
                                  const newMethod = (selectedRes.paymentMethod === "pix" || selectedRes.pixTxId) ? "card" : "pix";
                                  const res = await fetch(`/api/pms/reservations/${selectedRes.code || selectedRes.id}/change-payment-method`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ method: newMethod })
                                  });
                                  const d = await res.json();
                                  if (d.success) {
                                    setSelectedRes(d.reservation);
                                    fetchData();
                                    toast({ title: "Forma alterada!", description: `Forma alterada para ${d.paymentMethod === "pix" ? "PIX Banco Inter" : "Cartão de Crédito Mercado Pago"}.` });
                                  } else {
                                    toast({ title: "Atenção", description: d.message || d.error, variant: "destructive" });
                                  }
                                } catch (e: any) {
                                  toast({ title: "Erro", description: e.message, variant: "destructive" });
                                }
                              }}
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Mudar para {(selectedRes.paymentMethod === "pix" || selectedRes.pixTxId) ? "Cartão (MP)" : "PIX (Inter)"}</span>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] bg-white dark:bg-neutral-800 border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 flex items-center gap-1"
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/pms/reservations/${selectedRes.code || selectedRes.id}/payment-status`);
                                  const d = await res.json();
                                  if (d.paid) {
                                    toast({ title: "🎉 Pagamento Confirmado!", description: `Reserva liquidada com sucesso! R$ ${Number(d.paidAmount).toFixed(2)}` });
                                    fetchData();
                                    setSelectedRes((prev: any) => prev ? { ...prev, paymentStatus: "pago_total", paidAmount: d.paidAmount } : null);
                                  } else {
                                    toast({ title: "Aguardando Pagamento", description: `Nenhum pagamento liquidado até o momento para ${selectedRes.code}.` });
                                  }
                                } catch (e: any) {
                                  toast({ title: "Erro ao consultar", description: e.message, variant: "destructive" });
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Verificar Status Agora</span>
                            </Button>
                          </>
                        )}

                        {isResPaid && !isOta && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] bg-white dark:bg-neutral-800 border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 flex items-center gap-1"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/pms/reservations/${selectedRes.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    paymentStatus: "pendente",
                                    paidAmount: 0
                                  })
                                });
                                const d = await res.json();
                                if (res.ok) {
                                  toast({ title: "Status Atualizado", description: `Reserva ${selectedRes.code} definida como pendente.` });
                                  setSelectedRes((prev: any) => prev ? { ...prev, paymentStatus: "pendente", paidAmount: 0 } : null);
                                  setFormPaymentStatus("pendente");
                                  setFormPaidAmount("0");
                                  fetchData();
                                } else {
                                  toast({ title: "Atenção", description: d.error || "Erro ao atualizar status", variant: "destructive" });
                                }
                              } catch (e: any) {
                                toast({ title: "Erro", description: e.message, variant: "destructive" });
                              }
                            }}
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Desmarcar Pago (Tornar Pendente)</span>
                          </Button>
                        )}
                      </div>

                      {selectedRes.paidAt && (
                        <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                          <span className="text-muted-foreground font-medium">Data e Hora da Liquidação:</span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {format(parseISO(selectedRes.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                          </span>
                        </div>
                      )}

                      {selectedRes.pixEndToEndId && (
                        <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-0.5">
                          <span className="text-muted-foreground font-medium">End-to-End ID (Banco Central):</span>
                          <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-bold break-all select-all">
                            {selectedRes.pixEndToEndId}
                          </span>
                        </div>
                      )}

                      {selectedRes.pixTxId && (
                        <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-0.5">
                          <span className="text-muted-foreground font-medium">TxId da Cobrança (Banco Inter):</span>
                          <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all select-all">
                            {selectedRes.pixTxId}
                          </span>
                        </div>
                      )}

                      {selectedRes.mpPaymentId && (
                        <div className="text-[11px] pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                          <span className="text-muted-foreground font-medium">ID Pagamento Mercado Pago:</span>
                          <span className="font-mono text-[10px] text-sky-700 dark:text-sky-300 font-bold">
                            {selectedRes.mpPaymentId}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {selectedRes && (
                  <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-2 relative">
                    {/* Janelinha Flutuante de Prévia no Modal (Ao passar o cursor sobre qualquer atalho) */}
                    {hoveredModalQuickMsg && (
                      <div className="absolute left-2 right-2 bottom-[calc(100%+8px)] z-50 p-3 rounded-2xl bg-slate-950/98 dark:bg-black/98 text-white border border-slate-700 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 pointer-events-none text-left">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                            <span className="text-sm">{hoveredModalQuickMsg.icon}</span>
                            <span>{hoveredModalQuickMsg.title}</span>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            WhatsApp Manual
                          </span>
                        </div>
                        <div className="text-[11px] leading-relaxed text-slate-200 font-normal whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
                          {renderQuickMessage(hoveredModalQuickMsg.message, selectedRes)}
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9.5px] text-slate-400">
                          <span className="font-mono">Destino: {selectedRes.guestPhone || "Sem telefone"}</span>
                          <span className="text-emerald-400 font-bold">⚡ Clique no botão para disparar</span>
                        </div>
                        <div className="absolute top-full left-12 w-2.5 h-2.5 -mt-1 bg-slate-950 dark:bg-black border-r border-b border-slate-700 rotate-45" />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Disparar WhatsApp (Z-API com Botões)
                      </span>
                      <div className="flex items-center gap-2">
                        {selectedRes.guestPhone && (
                          <span className="text-[10px] text-muted-foreground font-mono">Destino: {selectedRes.guestPhone}</span>
                        )}
                        <a 
                          href="/whatsapp?tab=quick_messages" 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-0.5"
                          title="Gerenciar modelos e ativar/desativar mensagens"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>Gerenciar</span>
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {activeQuickMessages.map(qm => {
                        const isSending = modalSendingMsgId === qm.id;
                        return (
                          <Button
                            key={qm.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSending}
                            onMouseEnter={() => setHoveredModalQuickMsg(qm)}
                            onMouseLeave={() => setHoveredModalQuickMsg(null)}
                            onClick={async () => {
                              setModalSendingMsgId(qm.id);
                              try {
                                await dispatchQuickMessage(qm, selectedRes);
                              } finally {
                                setModalSendingMsgId(null);
                              }
                            }}
                            className="h-7 text-[11px] bg-white dark:bg-neutral-800 border-emerald-300 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                          >
                            {isSending ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                            ) : (
                              <span>{qm.icon || "💬"}</span>
                            )}
                            <span>{qm.title}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 justify-between">
                {selectedRes ? (
                  <Button type="button" variant="destructive" size="sm" onClick={handleDeleteRes} className="font-semibold text-xs gap-1">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancelar Reserva</span>
                  </Button>
                ) : <div />}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setResModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={savingRes} className="font-semibold text-xs">
                    {savingRes ? "Salvando..." : (selectedRes ? "Salvar Alterações" : "Criar Reserva")}
                  </Button>
                </div>
              </DialogFooter>
            </form>
            )}

            {/* TAB: Histórico & Logs */}
            {selectedRes && resModalTab === "audit" && (
              <div className="space-y-4 pt-1">
                {/* Header do Histórico */}
                <div className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <History className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                        Linha do Tempo e Histórico de Alterações
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Auditoria detalhada: criação, edições manuais, arrastes no calendário e cancelamentos
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchAuditLogs(selectedRes.code || selectedRes.id)}
                    disabled={loadingAudit}
                    className="h-7 text-xs font-semibold gap-1.5 rounded-lg border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 shrink-0"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingAudit ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </Button>
                </div>

                {/* Resumo da Criação */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl border bg-card/60 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Criada Em
                    </span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedRes.createdAt 
                        ? format(parseISO(selectedRes.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : "—"}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Por: <strong className="text-slate-700 dark:text-slate-300 font-medium">{selectedRes.createdBy?.userName || selectedRes.createdBy?.name || "PMS / Recepção"}</strong>
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl border bg-card/60 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Canal / Origem
                    </span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${CHANNEL_CONFIG[selectedRes.channel]?.bg || "bg-primary"}`} />
                      <span>{selectedRes.createdBy?.source || CHANNEL_CONFIG[selectedRes.channel]?.label || selectedRes.channel || "PMS Calendário"}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Acomodação: Flat {selectedRes.flatNumber}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl border bg-card/60 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Total de Registros
                    </span>
                    <div className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                      {auditLogs.length} {auditLogs.length === 1 ? 'evento' : 'eventos'}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Rastreabilidade integral
                    </span>
                  </div>
                </div>

                {/* Linha do Tempo */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Registro Cronológico</span>
                  </span>

                  {loadingAudit && auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground border rounded-2xl bg-muted/20">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-blue-500" />
                      <span>Carregando histórico de auditoria...</span>
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground border rounded-2xl bg-muted/10">
                      Nenhum registro de auditoria encontrado para esta reserva.
                    </div>
                  ) : (
                    <div className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800 space-y-4 my-2 ml-2">
                      {auditLogs.map((log: any, index: number) => {
                        const isCreation = log.action === "created";
                        const isFlatTransfer = log.action === "flat_changed";
                        const isDates = log.action === "dates_changed";
                        const isCancel = log.action === "cancelled";
                        const isCheckin = log.action === "checkin";
                        const isCheckout = log.action === "checkout";
                        const isEarly = log.action === "early_checkin";
                        const isPortal = log.action === "portal_modify";

                        let badgeBg = "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800";
                        let actionLabel = "Modificação";
                        let dotColor = "bg-blue-500";
                        let IconComp = Edit3;

                        if (isCreation) {
                          badgeBg = "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800";
                          actionLabel = "Reserva Criada";
                          dotColor = "bg-emerald-500";
                          IconComp = CheckCircle2;
                        } else if (isFlatTransfer) {
                          badgeBg = "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800";
                          actionLabel = "Troca de Apartamento";
                          dotColor = "bg-purple-500";
                          IconComp = Building2;
                        } else if (isDates) {
                          badgeBg = "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800";
                          actionLabel = "Remarcação de Datas";
                          dotColor = "bg-amber-500";
                          IconComp = CalendarIcon;
                        } else if (isCancel) {
                          badgeBg = "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800";
                          actionLabel = "Reserva Cancelada";
                          dotColor = "bg-rose-500";
                          IconComp = AlertTriangle;
                        } else if (isCheckin) {
                          badgeBg = "bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800";
                          actionLabel = "Check-in Realizado";
                          dotColor = "bg-teal-500";
                          IconComp = LogIn;
                        } else if (isCheckout) {
                          badgeBg = "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800";
                          actionLabel = "Check-out Finalizado";
                          dotColor = "bg-indigo-500";
                          IconComp = LogOut;
                        } else if (isEarly) {
                          badgeBg = "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800";
                          actionLabel = "Early Check-in";
                          dotColor = "bg-sky-500";
                          IconComp = Sparkles;
                        } else if (isPortal) {
                          badgeBg = "bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-800";
                          actionLabel = "Portal do Hóspede";
                          dotColor = "bg-violet-500";
                          IconComp = User;
                        }

                        return (
                          <div key={log.id || index} className="relative">
                            {/* Ponto na timeline */}
                            <div className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full ${dotColor} ring-4 ring-background flex items-center justify-center`} />

                            <div className="p-3 rounded-2xl border bg-card/80 backdrop-blur-xs shadow-2xs space-y-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 border flex items-center gap-1 ${badgeBg}`}>
                                    <IconComp className="w-3 h-3" />
                                    <span>{actionLabel}</span>
                                  </Badge>

                                  <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                    {log.timestamp 
                                      ? format(parseISO(log.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                      : "Data não registrada"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 flex-wrap">
                                  <Badge variant="secondary" className="text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5">
                                    Por: <strong className="ml-1 text-foreground">{log.actor?.name || "Sistema"}</strong>
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] font-medium text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 px-2 py-0.5">
                                    {log.source || "PMS"}
                                  </Badge>
                                </div>
                              </div>

                              {log.description && (
                                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                  {log.description}
                                </p>
                              )}

                              {Array.isArray(log.changes) && log.changes.length > 0 && (
                                <div className="pt-2 border-t border-border/60 space-y-1.5">
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
                                    Alterações Registradas:
                                  </span>
                                  <div className="grid grid-cols-1 gap-1">
                                    {log.changes.map((ch: any, cIdx: number) => (
                                      <div key={cIdx} className="flex flex-wrap items-center justify-between gap-1 p-1.5 rounded-lg bg-muted/40 text-xs">
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                          {ch.label || ch.field}:
                                        </span>
                                        {ch.oldValue !== null && ch.oldValue !== undefined ? (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through text-[11px] font-medium border border-rose-200 dark:border-rose-900/50">
                                              {String(ch.oldValue)}
                                            </span>
                                            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] border border-emerald-300 dark:border-emerald-800">
                                              {String(ch.newValue)}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold text-[11px] border border-blue-200 dark:border-blue-900/50">
                                            {String(ch.newValue)}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-3 border-t border-border flex justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResModalTab("details")}
                    className="text-xs font-semibold"
                  >
                    ← Voltar para Dados da Reserva
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setResModalOpen(false)}
                    className="text-xs font-bold"
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </div>
            )}

            {/* TAB: Comunicações & E-mails */}
            {selectedRes && resModalTab === "communications" && (
              <div className="space-y-4 pt-1">
                {/* 1. Painel de Envio Manual Rápido */}
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-amber-500" />
                      <span>Redigir e Enviar E-mail Manual</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Disparo via Zoho SMTP</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-bold text-muted-foreground">Destinatário</Label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManualRecipient(portariaEmail)}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-200 font-bold transition-colors"
                          >
                            🏢 Portaria ({portariaEmail})
                          </button>
                          {selectedRes?.guestEmail && (
                            <button
                              type="button"
                              onClick={() => setManualRecipient(selectedRes.guestEmail)}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 hover:bg-sky-200 font-bold transition-colors"
                            >
                              👤 Hóspede ({selectedRes.guestEmail})
                            </button>
                          )}
                        </div>
                      </div>
                      <Input
                        type="email"
                        value={manualRecipient}
                        onChange={e => setManualRecipient(e.target.value)}
                        placeholder="ex: portaria@condominio.com ou hospede@email.com"
                        className="text-xs h-8.5 rounded-xl font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-muted-foreground">Assunto</Label>
                      <Input
                        value={manualSubject}
                        onChange={e => setManualSubject(e.target.value)}
                        placeholder="Assunto do e-mail"
                        className="text-xs h-8.5 rounded-xl font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-bold text-muted-foreground">Mensagem</Label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setManualBody(`Prezada Portaria / Recepção,\n\nSolicitamos liberação de entrada antecipada (Early Check-in) para o Flat ${selectedRes?.flatNumber}, referente ao hóspede titular ${selectedRes?.guestName}.\n\nAtenciosamente,\nEquipe CorpFlats`)}
                            className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
                          >
                            + Modelo Early Check-in
                          </button>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <button
                            type="button"
                            onClick={() => setManualBody(`Prezado(a) ${selectedRes?.guestName},\n\nConfirmamos o recebimento de suas informações. Seguem orientações adicionais para a sua estadia no Flat ${selectedRes?.flatNumber}.\n\nEstamos à disposição para qualquer suporte!\nEquipe CorpFlats`)}
                            className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline font-medium"
                          >
                            + Mensagem Hóspede
                          </button>
                        </div>
                      </div>
                      <Textarea
                        value={manualBody}
                        onChange={e => setManualBody(e.target.value)}
                        placeholder="Escreva a mensagem para o destinatário..."
                        rows={3}
                        className="text-xs rounded-xl"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={sendingEmail || !manualRecipient || !manualSubject || !manualBody}
                        onClick={handleSendManualEmail}
                        className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-xs"
                      >
                        {sendingEmail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>{sendingEmail ? "Disparando..." : "Enviar E-mail Agora"}</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 2. Linha do Tempo (Timeline de Mensagens) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-primary" />
                      <span>Histórico de Comunicações ({communications.length})</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loadingComms}
                      onClick={() => fetchCommunications(selectedRes?.code || selectedRes?.id)}
                      className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingComms ? 'animate-spin' : ''}`} />
                      <span>Atualizar</span>
                    </Button>
                  </div>

                  {loadingComms ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      Carregando histórico de comunicações...
                    </div>
                  ) : communications.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl bg-muted/30 border border-dashed border-border text-xs text-muted-foreground space-y-1">
                      <Mail className="w-6 h-6 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="font-bold">Nenhum e-mail registrado nesta reserva</p>
                      <p className="text-[11px]">Os e-mails de check-in, alteração ou manuais aparecerão aqui automaticamente.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {communications.map((c: any) => {
                        const isExpanded = expandedCommId === c.id
                        const isFailed = c.status === "failed"
                        const isSent = c.status === "sent"
                        const isPending = c.status === "pending"

                        return (
                          <div
                            key={c.id}
                            className={`rounded-2xl border transition-all text-xs overflow-hidden ${
                              isFailed 
                                ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60" 
                                : isSent
                                ? "bg-card border-border hover:border-border/80"
                                : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
                            }`}
                          >
                            {/* Header do Card de Comunicação */}
                            <div
                              onClick={() => setExpandedCommId(isExpanded ? null : c.id)}
                              className="p-3 flex items-start justify-between gap-2 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  isFailed 
                                    ? "bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-400" 
                                    : isSent
                                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400"
                                    : "bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-400"
                                }`}>
                                  {isFailed ? <AlertCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-foreground text-xs truncate max-w-[280px]">
                                      {c.subject}
                                    </span>
                                    {isSent && (
                                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold gap-1">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> Enviado
                                      </Badge>
                                    )}
                                    {isFailed && (
                                      <Badge variant="destructive" className="text-[9.5px] px-1.5 py-0 h-4 font-bold gap-1">
                                        <AlertCircle className="w-2.5 h-2.5" /> Falha
                                      </Badge>
                                    )}
                                    {isPending && (
                                      <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 h-4 font-bold gap-1 text-amber-600 border-amber-300">
                                        <Clock className="w-2.5 h-2.5" /> Pendente
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground mt-0.5">
                                    <span>Para: <strong className="text-foreground">{c.recipient}</strong></span>
                                    <span>•</span>
                                    <span>{c.created_at ? format(parseISO(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ""}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isFailed && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={resendingCommId === c.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResendEmail(c.id);
                                    }}
                                    className="h-6 px-2 text-[10.5px] font-bold text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 hover:bg-rose-100 gap-1 rounded-lg"
                                  >
                                    <RotateCcw className={`w-3 h-3 ${resendingCommId === c.id ? 'animate-spin' : ''}`} />
                                    <span>{resendingCommId === c.id ? "Reenviando..." : "Reenviar"}</span>
                                  </Button>
                                )}

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </Button>
                              </div>
                            </div>

                            {/* Erro de Disparo */}
                            {isFailed && c.metadata?.error && (
                              <div className="px-3 pb-2 text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Erro: {c.metadata.error}</span>
                              </div>
                            )}

                            {/* Conteúdo Expandido do E-mail */}
                            {isExpanded && (
                              <div className="p-3 border-t border-border/80 bg-muted/20 space-y-2">
                                <div className="text-[10.5px] text-muted-foreground font-semibold flex items-center justify-between">
                                  <span>Conteúdo da Mensagem:</span>
                                  {c.metadata?.messageId && (
                                    <span className="font-mono text-[9px] text-muted-foreground truncate max-w-[200px]" title={c.metadata.messageId}>
                                      ID: {c.metadata.messageId}
                                    </span>
                                  )}
                                </div>

                                {c.body?.includes("<html") || c.body?.includes("<table") || c.body?.includes("<div") ? (
                                  <div className="bg-white text-slate-900 rounded-xl p-3 border border-border/80 max-h-[340px] overflow-y-auto text-xs shadow-inner">
                                    <div dangerouslySetInnerHTML={{ __html: c.body }} />
                                  </div>
                                ) : (
                                  <div className="bg-background rounded-xl p-3 border border-border max-h-[220px] overflow-y-auto font-mono text-xs whitespace-pre-wrap text-foreground">
                                    {c.body}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-2 border-t border-border flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setResModalOpen(false)} className="rounded-xl text-xs font-bold">
                    Fechar
                  </Button>
                </DialogFooter>
              </div>
            )}

            {selectedRes && resModalTab === "links" && (() => {
              const origin = typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com"
              const resCode = selectedRes.code || selectedRes.id
              const guestName = selectedRes.guestName || "Hóspede"
              const flatNum = selectedRes.flatNumber || ""
              const guestPhone = (selectedRes.guestPhone || "").replace(/\D/g, "")
              const waPhone = guestPhone.length >= 10 ? (guestPhone.startsWith("55") ? guestPhone : `55${guestPhone}`) : ""

              const linksList = [
                {
                  id: "portal",
                  title: "Minha Reserva (Portal do Hóspede)",
                  url: `${origin}/minha-reserva/${resCode}`,
                  desc: "Acesso completo à reserva: senhas da fechadura eletrônica, Wi-Fi, regras, pedidos de café e serviços.",
                  icon: User,
                  badge: "Completo",
                  badgeColor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300",
                  iconColor: "text-sky-600 bg-sky-100 dark:bg-sky-950/60 dark:text-sky-400",
                },
                {
                  id: "precheckin",
                  title: "Pré Check-in Digital",
                  url: `${origin}/pre-checkin/${resCode}`,
                  desc: "Formulário para o hóspede preencher os dados dos acompanhantes, fotos de documentos e assinatura antecipada.",
                  icon: FileText,
                  badge: "Entrada Ágil",
                  badgeColor: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-300",
                  iconColor: "text-indigo-600 bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-400",
                },
                {
                  id: "cafe",
                  title: "Cardápio & Pedido de Café da Manhã",
                  url: `${origin}/cafe/${resCode}`,
                  desc: "Link direto para o hóspede escolher os itens de café da manhã e agendar horário de entrega no flat.",
                  icon: Coffee,
                  badge: "Alimentação",
                  badgeColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300",
                  iconColor: "text-amber-600 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-400",
                },
                {
                  id: "checkout",
                  title: "Check-out Expresso",
                  url: `${origin}/checkout/${resCode}`,
                  desc: "Link personalizado de saída expressa com 1 clique (sem necessidade de digitar flat, cancela café se antes do horário).",
                  icon: DoorOpen,
                  badge: "Saída Expressa",
                  badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300",
                  iconColor: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400",
                },
                {
                  id: "pagamento",
                  title: "Pagamento & Extrato da Reserva",
                  url: `${origin}/minha-reserva/${resCode}#pagamento`,
                  desc: "Acesso direto à área de pagamento via Pix / Cartão e consulta de pendências financeiras.",
                  icon: CreditCard,
                  badge: "Financeiro",
                  badgeColor: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300",
                  iconColor: "text-purple-600 bg-purple-100 dark:bg-purple-950/60 dark:text-purple-400",
                },
                {
                  id: "maps",
                  title: "Localização no Google Maps",
                  url: `https://www.google.com/maps/search/?api=1&query=SOHO+Promenade+Brasilia`,
                  desc: "Ponto exato e rotas de GPS até a portaria do condomínio Soho Promenade.",
                  icon: Tag,
                  badge: "Como Chegar",
                  badgeColor: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300",
                  iconColor: "text-rose-600 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-400",
                },
              ]

              const handleCopySingle = (id: string, url: string, title: string) => {
                navigator.clipboard.writeText(url)
                setCopiedLinkKey(id)
                toast({
                  title: "Link Copiado! 📋",
                  description: `${title} copiado com sucesso.`
                })
                setTimeout(() => setCopiedLinkKey(null), 2000)
              }

              const handleCopyAllFormatted = () => {
                const text = `🏨 *CorpFlats - Links da sua Estadia*\n🔑 *Reserva:* #${resCode}${flatNum ? ` (Flat ${flatNum})` : ""}\n👤 *Hóspede:* ${guestName}\n\n` +
                  `🌐 *Portal Minha Reserva:*\n${origin}/minha-reserva/${resCode}\n\n` +
                  `📝 *Pré Check-in Digital:*\n${origin}/pre-checkin/${resCode}\n\n` +
                  `☕ *Cardápio de Café da Manhã:*\n${origin}/cafe/${resCode}\n\n` +
                  `🚪 *Check-out Expresso:*\n${origin}/checkout/${resCode}\n\n` +
                  `📍 *Localização no Google Maps:*\nhttps://www.google.com/maps/search/?api=1&query=SOHO+Promenade+Brasilia`

                navigator.clipboard.writeText(text)
                setCopiedLinkKey("all")
                toast({
                  title: "Todos os links copiados! 📋",
                  description: "Mensagem formatada com todos os links pronta para enviar pelo WhatsApp ou E-mail."
                })
                setTimeout(() => setCopiedLinkKey(null), 2500)
              }

              const handleSendWa = (url: string, title: string) => {
                if (!waPhone) return
                const msg = `Olá ${guestName}, aqui está o link de ${title} para sua estadia no Flat ${flatNum} (Reserva #${resCode}):\n\n${url}`
                window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, "_blank")
              }

              return (
                <div className="py-2 space-y-4">
                  {/* Top Banner / Actions */}
                  <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-sky-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 font-bold text-[11px]">
                          Reserva #{resCode}
                        </Badge>
                        {flatNum && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 font-bold text-[11px]">
                            Flat {flatNum}
                          </Badge>
                        )}
                        <span className="text-xs font-semibold text-foreground/80 truncate max-w-[200px]">
                          {guestName}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Acesse, confira ou copie qualquer link exclusivo desta reserva para enviar ao hóspede.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCopyAllFormatted}
                        className="h-8 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5"
                      >
                        {copiedLinkKey === "all" ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Todos os Links</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Links List */}
                  <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                    {linksList.map((item) => {
                      const Icon = item.icon
                      const isCopied = copiedLinkKey === item.id
                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-card border border-border/80 hover:border-border rounded-2xl transition-all space-y-2.5 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.iconColor}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-foreground">{item.title}</span>
                                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 font-bold ${item.badgeColor}`}>
                                    {item.badge}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                  {item.desc}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-lg border border-border/80 bg-background hover:bg-muted text-foreground text-[11px] font-bold transition-colors shadow-2xs"
                                title="Abrir e conferir em nova aba"
                              >
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                <span>Abrir ↗</span>
                              </a>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopySingle(item.id, item.url, item.title)}
                                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all shadow-2xs ${
                                  isCopied
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : "hover:bg-muted"
                                }`}
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 mr-1" />
                                    <span>Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-muted-foreground mr-1" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </Button>

                              {waPhone && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendWa(item.url, item.title)}
                                  className="h-7 w-7 p-0 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600"
                                  title="Enviar este link pelo WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Link URL box */}
                          <div className="flex items-center gap-2 bg-muted/50 dark:bg-muted/20 border border-border/50 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground overflow-hidden">
                            <span className="truncate select-all text-foreground/80">{item.url}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Footer */}
                  <DialogFooter className="pt-2 border-t border-border flex items-center justify-between sm:justify-between w-full">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setResModalTab("details")}
                      className="rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground"
                    >
                      ← Voltar aos Dados da Reserva
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResModalOpen(false)}
                      className="rounded-xl text-xs font-bold"
                    >
                      Fechar
                    </Button>
                  </DialogFooter>
                </div>
              )
            })()}
          </DialogContent>
        </Dialog>


        
        
        
        {/* ── MODAL DRAG & DROP: CONFIGURAÇÃO DE TAGS ESSENCIAIS DO HOTEL ── */}
        <Dialog open={essentialConfigModalOpen} onOpenChange={setEssentialConfigModalOpen}>
          <DialogContent className="sm:max-w-3xl bg-card border border-border rounded-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="p-5 pb-3 border-b border-border shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base font-black">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Personalizar Tags Essenciais (Arrastar e Soltar)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Arraste ou clique nas tags para definir quais comodidades aparecem no <strong>Modo Essencial</strong> da sua propriedade.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Coluna 1: Tags Essenciais Ativas (Drop Zone) */}
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || draggedTagId;
                  if (id && !essentialTagIds.includes(id)) {
                    handleSaveEssentialTags([...essentialTagIds, id]);
                  }
                  setDraggedTagId(null);
                }}
                className="bg-primary/5 border-2 border-dashed border-primary/40 rounded-2xl p-4 flex flex-col min-h-[380px]"
              >
                <div className="flex items-center justify-between pb-3 border-b border-primary/20 mb-3">
                  <span className="font-black text-xs text-primary flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Tags Essenciais Ativas ({essentialTagIds.length})
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">Solte aqui para ativar</span>
                </div>

                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[320px] pr-1">
                  {essentialTagIds.map(id => {
                    const item = FLAT_AMENITIES_CATALOG.find(a => a.id === id);
                    if (!item) return null;

                    return (
                      <div
                        key={id}
                        draggable={true}
                        onDragStart={(e) => {
                          setDraggedTagId(id);
                          e.dataTransfer.setData("text/plain", id);
                        }}
                        className="p-2 bg-card border border-primary/30 rounded-xl flex items-center justify-between shadow-2xs hover:border-primary cursor-grab active:cursor-grabbing transition-all group"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={`p-1 rounded-md shrink-0 ${item.colorClass || 'text-primary bg-muted'}`}>
                            {renderAmenityIcon(item.iconName, "w-3.5 h-3.5")}
                          </span>
                          <div className="truncate">
                            <div className="font-bold text-[11px] truncate text-foreground">{item.label}</div>
                            <div className="text-[9px] text-muted-foreground">{item.categoryLabel}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            handleSaveEssentialTags(essentialTagIds.filter(t => t !== id));
                          }}
                          className="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white flex items-center justify-center font-black transition-colors shrink-0"
                          title="Remover das tags essenciais"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {essentialTagIds.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      Nenhuma tag essencial. Arraste tags da direita para cá.
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna 2: Catálogo Geral Disponível (Drop Zone) */}
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || draggedTagId;
                  if (id && essentialTagIds.includes(id)) {
                    handleSaveEssentialTags(essentialTagIds.filter(t => t !== id));
                  }
                  setDraggedTagId(null);
                }}
                className="bg-muted/30 border-2 border-dashed border-border rounded-2xl p-4 flex flex-col min-h-[380px]"
              >
                <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                  <span className="font-black text-xs text-foreground flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    Catálogo Geral ({FLAT_AMENITIES_CATALOG.length - essentialTagIds.length})
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">Arraste para a esquerda</span>
                </div>

                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[320px] pr-1">
                  {FLAT_AMENITIES_CATALOG.filter(a => !essentialTagIds.includes(a.id)).map(item => (
                    <div
                      key={item.id}
                      draggable={true}
                      onDragStart={(e) => {
                        setDraggedTagId(item.id);
                        e.dataTransfer.setData("text/plain", item.id);
                      }}
                      className="p-2 bg-card border border-border rounded-xl flex items-center justify-between shadow-2xs hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`p-1 rounded-md shrink-0 ${item.colorClass || 'text-muted-foreground bg-muted'}`}>
                          {renderAmenityIcon(item.iconName, "w-3.5 h-3.5")}
                        </span>
                        <div className="truncate">
                          <div className="font-bold text-[11px] truncate text-foreground">{item.label}</div>
                          <div className="text-[9px] text-muted-foreground">{item.categoryLabel}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          handleSaveEssentialTags([...essentialTagIds, item.id]);
                        }}
                        className="w-6 h-6 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center font-bold text-xs transition-colors shrink-0"
                        title="Adicionar aos essenciais"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-border bg-card flex items-center justify-between sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const defaults = [
                    "cama_casal", "2_camas_solteiro", "ar_split", "ar_janela", "microondas",
                    "frigobar", "cafeteira", "cozinha_completa", "wifi_alta_velocidade",
                    "home_office", "smart_tv", "fechadura_digital", "garagem_coberta",
                    "elevador", "portaria_24h", "piscina", "academia", "aceita_pet",
                    "proibido_fumar", "foco_corporativo", "longa_estadia", "reformado"
                  ];
                  handleSaveEssentialTags(defaults);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Restaurar Padrões
              </Button>

              <Button
                type="button"
                onClick={() => setEssentialConfigModalOpen(false)}
                className="rounded-xl h-9 text-xs font-black bg-primary text-primary-foreground px-5"
              >
                Concluir Configuração
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── MODAL: CATÁLOGO COMPLETO DE PARTICULARIDADES & TAGS (76 OPÇÕES) ── */}
        <Dialog open={flatTagsModalOpen} onOpenChange={setFlatTagsModalOpen}>
          <DialogContent className="sm:max-w-2xl bg-card border border-border rounded-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="p-5 pb-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-base font-black">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Características & Tags do Apt {selectedFlatForTags?.number}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Catálogo amplo de comodidades, infraestrutura, climatização e regras.
                  </DialogDescription>
                </div>

                {/* Opção de Esconder/Mostrar Opções Não Utilizadas */}
                <div className="flex items-center gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setEssentialConfigModalOpen(true)}
                    className="h-8 text-[10.5px] font-bold rounded-xl gap-1.5 px-2.5 border-primary/30 text-primary hover:bg-primary/10"
                    title="Arrastar e escolher quais tags aparecem no Modo Essencial"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Configurar Essenciais</span>
                  </Button>

                  <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-2xl border border-border">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      {showFullCatalog ? "Ver Todas (76)" : "Modo Essencial"}
                    </span>
                    <Switch 
                      checked={showFullCatalog} 
                      onCheckedChange={setShowFullCatalog}
                      title="Alternar entre o catálogo essencial ou exibir todas as 76 tags cadastradas"
                    />
                  </div>
                </div>
              </div>

              {/* Filtros e Busca de Tags */}
              <div className="pt-3 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input 
                    value={amenitySearch}
                    onChange={e => setAmenitySearch(e.target.value)}
                    placeholder="Buscar comodidade (ex: Ar Split, Casal, Micro-ondas, Pet, Wi-Fi, Garagem, Vista...)"
                    className="h-8.5 pl-8 text-xs rounded-xl"
                  />
                </div>

                {/* Abas de Categorias */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10.5px]">
                  {AMENITY_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setAmenityCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                        amenityCategoryFilter === cat.id 
                          ? 'bg-primary text-primary-foreground shadow-xs' 
                          : 'bg-muted/40 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </DialogHeader>

            {/* Conteúdo com Rolagem do Catálogo */}
            <form onSubmit={handleSaveFlatTags} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Categorias Filtradas */}
              {AMENITY_CATEGORIES.filter(c => c.id !== "all").map(cat => {
                if (amenityCategoryFilter !== "all" && amenityCategoryFilter !== cat.id) return null;

                const categoryItems = FLAT_AMENITIES_CATALOG.filter(item => {
                  if (item.category !== cat.id) return false;
                  if (amenitySearch.trim()) {
                    return item.label.toLowerCase().includes(amenitySearch.toLowerCase());
                  }
                  if (!showFullCatalog && !essentialTagIds.includes(item.id) && !flatTags.some(t => t.toLowerCase() === item.label.toLowerCase() || t.toLowerCase() === item.id)) {
                    return false;
                  }
                  return true;
                });

                if (categoryItems.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-2">
                    <div className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <span>{cat.label}</span>
                      <span className="text-[10px] opacity-60">({categoryItems.length})</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {categoryItems.map(item => {
                        const active = flatTags.some(t => 
                          t.toLowerCase() === item.label.toLowerCase() || 
                          t.toLowerCase() === item.id ||
                          (item.id === "ar_split" && flatAirType === "split") ||
                          (item.id === "ar_janela" && flatAirType === "janela") ||
                          (item.id === "cama_casal" && flatBedType === "casal") ||
                          (item.id === "2_camas_solteiro" && flatBedType === "solteiro_duplo") ||
                          (item.id === "microondas" && flatHasMicrowave)
                        );

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.id === "ar_split") setFlatAirType("split");
                              if (item.id === "ar_janela") setFlatAirType("janela");
                              if (item.id === "cama_casal") setFlatBedType("casal");
                              if (item.id === "2_camas_solteiro") setFlatBedType("solteiro_duplo");
                              if (item.id === "microondas") setFlatHasMicrowave(!flatHasMicrowave);
                              handleTogglePresetTag(item.label);
                            }}
                            className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                              active
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                                : 'bg-card border-border hover:border-primary/50 text-slate-700 dark:text-slate-300 font-medium'
                            }`}
                          >
                            <span className={`p-1 rounded-lg shrink-0 ${active ? 'bg-white/20 text-white' : (item.colorClass || 'text-primary bg-muted')}`}>
                              {renderAmenityIcon(item.iconName, "w-3.5 h-3.5")}
                            </span>
                            <span className="truncate text-[11px]">{item.label}</span>
                            {active && <span className="ml-auto text-[10px] font-black">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Criar Tag Personalizada Livre */}
              <div className="p-3.5 bg-muted/30 border border-border rounded-2xl space-y-2">
                <Label className="font-bold text-xs text-foreground block">Adicionar Tag / Comodidade Personalizada</Label>
                <div className="flex gap-2">
                  <Input
                    value={flatCustomTagInput}
                    onChange={e => setFlatCustomTagInput(e.target.value)}
                    placeholder="Digite uma comodidade exclusiva (ex: Cafeteira Nespresso, Mesa Escritório...)"
                    className="h-9 text-xs rounded-xl"
                    onKeyDown={e => { 
                      if (e.key === "Enter") { 
                        e.preventDefault(); 
                        handleAddCustomTag();
                      } 
                    }}
                  />
                  <Button 
                    type="button" 
                    onClick={() => handleAddCustomTag()} 
                    className="h-9 text-xs font-bold rounded-xl px-4"
                  >
                    + Adicionar
                  </Button>
                </div>
              </div>

              {/* Tags Ativas no Quarto */}
              {flatTags.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <Label className="text-[11px] font-bold text-muted-foreground">
                    Tags Ativas no Apt {selectedFlatForTags?.number} ({flatTags.length}):
                  </Label>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-muted/20 border border-border rounded-2xl">
                    {flatTags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1.5 text-[11px] bg-primary/10 text-primary font-bold px-2.5 py-1 rounded-xl border border-primary/20">
                        <span>{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-rose-500 font-black ml-0.5">✕</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 pt-3 border-t border-border sticky bottom-0 bg-card">
                <Button type="submit" disabled={savingFlatTags} className="rounded-xl h-10 text-xs font-black bg-primary hover:bg-primary/90 text-primary-foreground">
                  {savingFlatTags ? "Salvando..." : "Salvar Características do Quarto"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setFlatTagsModalOpen(false)} className="rounded-xl h-10 text-xs font-bold">
                  Cancelar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>



        
        {/* ── MODAL: DETALHES E REMOÇÃO DE BLOQUEIO DE QUARTO ── */}
        <Dialog open={blockDetailsModalOpen} onOpenChange={setBlockDetailsModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-black">
                <Lock className="w-5 h-5 text-amber-500" />
                Bloqueio de Quarto - Apt {selectedBlockForDetails?.flatNumber}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informações do período bloqueado no mapa de reservas.
              </DialogDescription>
            </DialogHeader>

            {selectedBlockForDetails && (
              <div className="space-y-4 py-2 text-xs">
                <div className="p-3.5 bg-muted/40 border border-border rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">Apartamento:</span>
                    <span className="font-black text-foreground text-sm">Apt {selectedBlockForDetails.flatNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">Motivo:</span>
                    <span className="font-bold text-foreground capitalize">
                      {selectedBlockForDetails.reason === "manutencao" ? "🛠️ Manutenção / Reparo" : "🔑 Bloqueio Operacional"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">Período Bloqueado:</span>
                    <span className="font-bold text-foreground">
                      {selectedBlockForDetails.startDate} até {selectedBlockForDetails.endDate}
                    </span>
                  </div>
                  {selectedBlockForDetails.notes && (
                    <div className="pt-2 border-t border-border">
                      <span className="text-muted-foreground font-semibold block mb-0.5">Observações:</span>
                      <p className="font-medium text-foreground bg-card p-2 rounded-xl border border-border">
                        {selectedBlockForDetails.notes}
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 pt-2 flex items-center justify-between sm:justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deletingBlock}
                    onClick={() => handleDeleteBlock(selectedBlockForDetails.id)}
                    className="rounded-xl h-9 text-xs font-black gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deletingBlock ? "Removendo..." : "Remover Bloqueio"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBlockDetailsModalOpen(false)}
                    className="rounded-xl h-9 text-xs font-bold"
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Room Block */}
        <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
          <DialogContent className="sm:max-w-sm">
            <form onSubmit={handleSaveBlock}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-slate-800" />
                  Bloquear Apartamento
                </DialogTitle>
                <DialogDescription>
                  Bloqueie o quarto para manutenção ou uso do proprietário.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Apartamento</Label>
                  <Select value={blockFlatId} onValueChange={setBlockFlatId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Selecione o Quarto" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.flats.map(f => (
                        <SelectItem key={f.id} value={String(f.id)}>Apt {f.number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Início</Label>
                    <Input type="date" value={blockStart} onChange={e => setBlockStart(e.target.value)} required className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Fim</Label>
                    <Input type="date" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} required className="text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Motivo do Bloqueio</Label>
                  <Select value={blockReason} onValueChange={setBlockReason}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manutencao">🛠️ Manutenção / Pintura</SelectItem>
                      <SelectItem value="proprietario">🔑 Uso do Proprietário</SelectItem>
                      <SelectItem value="outro">Outro Motivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Input value={blockNotes} onChange={e => setBlockNotes(e.target.value)} placeholder="Ex: Ar condicionado em reparo..." className="text-xs" />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setBlockModalOpen(false)}>Cancelar</Button>
                <Button type="submit" size="sm" className="font-semibold text-xs">Bloquear Quarto</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  )
}
