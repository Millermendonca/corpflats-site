import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, Fragment, memo } from "react"
import { useLocation } from "wouter"
import { useGetMe, useGetSettings } from "@workspace/api-client-react"
import { getCheckinUrl } from "@/lib/checkin-url"
import { FrozenSlot } from "@/lib/render-freeze"
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
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "@/components/ui/popover"
import { 
  CalendarDays, Plus, Wand2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, 
  Calendar as CalendarIcon, User, Users, Phone, Mail, ShieldAlert, CheckCircle2,
  Clock, DollarSign, BedDouble, AlertTriangle, Lock, Trash2, Edit3, MessageCircle, KeyRound, Sparkles, FileText, Tag, Coffee, Building2, Wind, Zap, Bed, Check, RotateCcw, AlertCircle, RefreshCw, SlidersHorizontal, Copy,
  LogIn, LogOut, TrendingUp, Send, ChevronDown, ChevronUp, History, ArrowRight, CreditCard, ExternalLink, QrCode, Link2, DoorOpen, Car,
  Download, Upload, FileSpreadsheet, Wrench, Camera, Refrigerator, Bell, Gift
} from "lucide-react"
import { compressImage } from "@/lib/image-compression"
import { useToast } from "@/hooks/use-toast"
import { 
  format, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, isToday, isYesterday, parseISO, differenceInDays, differenceInCalendarDays,
  addMonths, subMonths, addYears, subYears, getDay
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

function normalizeCalendarChannel(raw?: string | null): string {
  const lower = String(raw || "").trim().toLowerCase()
  if (!lower) return "whatsapp"
  if (lower === "site" || lower === "site_direto" || lower === "site_proprio" || lower === "website" || lower === "motor") return "site"
  if (lower === "direta" || lower === "direct" || lower === "whats" || lower === "zapi") return "whatsapp"
  return lower
}

const CHANNEL_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  site: { label: "Site Próprio", bg: "bg-orange-600", text: "text-white", border: "border-orange-700" },
  site_direto: { label: "Site Próprio", bg: "bg-orange-600", text: "text-white", border: "border-orange-700" },
  site_proprio: { label: "Site Próprio", bg: "bg-orange-600", text: "text-white", border: "border-orange-700" },
  whatsapp: { label: "WhatsApp", bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700" },
  direta: { label: "WhatsApp", bg: "bg-emerald-600", text: "text-white", border: "border-emerald-700" },
  booking: { label: "Booking", bg: "bg-sky-700", text: "text-white", border: "border-sky-800" },
  airbnb: { label: "Airbnb", bg: "bg-rose-600", text: "text-white", border: "border-rose-700" },
  b2b: { label: "B2B Reservas", bg: "bg-violet-600", text: "text-white", border: "border-violet-700" },
}

import { AccessDenied } from "@/components/access-denied"
import { PdfViewerDialog } from "@/components/pdf-preview"
import { FLAT_AMENITIES_CATALOG, AMENITY_CATEGORIES, renderAmenityIcon, getFlatActiveAmenities, FlatAmenityDefinition } from "@/lib/flat-amenities"
import { ReservationHoverCard } from "@/components/reservation-hover-card"
import { QuickMessageConfirmDialog } from "@/components/quick-message-confirm-dialog"
import { useQuickMessages, renderQuickMessage, WhatsAppQuickMessage, getReservationRecipients, sendDirectZapiWithFallback, bindZapiClickOrHoldWaWeb, buildQuickMessageWaWebUrl, buildDirectWaWebUrl, cleanWhatsAppPhone, formatReservationChannelLabel, resolveReservationGuestCount } from "@/hooks/use-quick-messages"
import { PaymentMethodsModal, PaymentMethod } from "@/components/payment-methods-modal"
import { formatSmartPhone, formatPhoneForWhatsAppCheck } from "@/lib/phone-mask"

const DEFAULT_CLIENT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: "booking", name: "Booking.com", gatewayFeeRate: 0, commissionRate: 0, active: true, isSystem: true },
  { id: "airbnb", name: "Airbnb", gatewayFeeRate: 0, commissionRate: 0, active: true, isSystem: true },
  { id: "vcn_b2b", name: "Cartão Virtual B2B (VCN)", gatewayFeeRate: 3.49, commissionRate: 0, active: true, isSystem: true },
  { id: "faturado_b2b", name: "Faturado B2B", gatewayFeeRate: 0, commissionRate: 0, active: true, isSystem: true },
  { id: "boleto_faturado", name: "Boleto Faturado (Inter)", gatewayFeeRate: 0, commissionRate: 0, active: true, isSystem: true },
  { id: "pix", name: "PIX", gatewayFeeRate: 0, commissionRate: 0, active: true, isSystem: true },
  { id: "cartao_credito", name: "Cartão de Crédito", gatewayFeeRate: 3.99, commissionRate: 0, active: true, isSystem: true },
  { id: "dinheiro", name: "Dinheiro", gatewayFeeRate: 0, commissionRate: 0, active: true, isSystem: true },
  { id: "mercadopago", name: "Mercado Pago", gatewayFeeRate: 3.99, commissionRate: 0, active: true, isSystem: false }
]

function formatBrazilPhone(value: string): string {
  return formatSmartPhone(value)
}

function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback(((...args: any[]) => ref.current(...args)) as T, [])
}

const MemoizedSlot = memo(function MemoizedSlot({ node }: { node: React.ReactNode }) {
  return <>{node}</>
})

const MemoCrmGuestSelect = memo(function MemoCrmGuestSelect({
  value,
  onValueChange,
  guests,
  placeholder,
  manualLabel,
  triggerClassName = "text-xs h-8",
  contentClassName = "max-h-64",
  compact = false,
}: {
  value: string
  onValueChange: (val: string) => void
  guests: any[]
  placeholder: string
  manualLabel: string
  triggerClassName?: string
  contentClassName?: string
  compact?: boolean
}) {
  const items = useMemo(
    () =>
      guests.map((g: any) =>
        compact ? (
          <SelectItem key={g.id} value={String(g.id)} className="text-xs">
            {g.name || g.fullName}
            {g.phone ? ` • ${g.phone}` : ""}
          </SelectItem>
        ) : (
          <SelectItem key={g.id} value={String(g.id)}>
            <span className="font-semibold">{g.name || g.fullName}</span>
            {g.documentNumber || g.document ? ` • CPF: ${g.documentNumber || g.document}` : ""}
            {g.phone ? ` • Tel: ${g.phone}` : ""}
            {g.companyName ? ` • (${g.companyName})` : ""}
          </SelectItem>
        )
      ),
    [guests, compact]
  )
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        <SelectItem value="manual" className={compact ? "text-primary font-bold text-xs" : "text-primary font-bold"}>
          {manualLabel}
        </SelectItem>
        {items}
      </SelectContent>
    </Select>
  )
})

const MemoCompanySelect = memo(function MemoCompanySelect({
  value,
  onValueChange,
  companies,
  placeholder,
  newLabel,
  newItemClassName = "text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer bg-indigo-50/60 dark:bg-indigo-950/40",
  skipInformadoCnpj = false,
}: {
  value: string
  onValueChange: (val: string) => void
  companies: any[]
  placeholder: string
  newLabel: string
  newItemClassName?: string
  skipInformadoCnpj?: boolean
}) {
  const items = useMemo(
    () =>
      companies.map((c: any) => (
        <SelectItem key={c.id} value={String(c.id)}>
          <span className="font-semibold">{c.tradeName || c.corporateName}</span>
          {c.cnpj && (!skipInformadoCnpj || !String(c.cnpj).includes("Informado")) ? ` • CNPJ: ${c.cnpj}` : ""}
        </SelectItem>
      )),
    [companies, skipInformadoCnpj]
  )
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="text-xs h-8">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        <SelectItem value="__NEW_COMPANY__" className={newItemClassName}>
          {newLabel}
        </SelectItem>
        {items}
      </SelectContent>
    </Select>
  )
})

const MemoAgencySelect = memo(function MemoAgencySelect({
  value,
  onValueChange,
  agencies,
}: {
  value: string
  onValueChange: (val: string) => void
  agencies: any[]
}) {
  const items = useMemo(
    () =>
      agencies.map((ag: any) => (
        <SelectItem key={ag.id} value={String(ag.id)}>
          <span className="font-semibold">{ag.tradeName || ag.corporateName}</span>
          {ag.cnpj ? ` • CNPJ: ${ag.cnpj}` : ""}
          {ag.defaultRatePolicy ? ` • [${ag.defaultRatePolicy}]` : ""}
        </SelectItem>
      )),
    [agencies]
  )
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Selecione a Agência B2B cadastrada..." />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        <SelectItem value="__NEW_AGENCY__" className="text-purple-600 font-bold">
          ➕ Cadastrar Nova Agência B2B...
        </SelectItem>
        {items}
      </SelectContent>
    </Select>
  )
})

const MemoBlockFlatSelect = memo(function MemoBlockFlatSelect({
  value,
  onValueChange,
  flats,
}: {
  value: string
  onValueChange: (val: string) => void
  flats: Array<{ id: number | string; number: string }>
}) {
  const items = useMemo(
    () =>
      flats.map((f) => (
        <SelectItem key={f.id} value={String(f.id)}>
          Apt {f.number}
        </SelectItem>
      )),
    [flats]
  )
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="text-xs">
        <SelectValue placeholder="Selecione o Quarto" />
      </SelectTrigger>
      <SelectContent>{items}</SelectContent>
    </Select>
  )
})

export interface DailyRateItem {
  date: string;
  rate: number;
  channel: string;
  notes?: string;
}

export interface ReservationChargeItem {
  id: string;
  type: "cleaning" | "pet" | "extra_bed" | "breakfast" | "garage" | "damage" | "discount" | "other";
  title: string;
  amount: number;
  notes?: string;
}

export interface ReservationPaymentItem {
  id: string;
  amount: number;
  method: string;
  category?: string; // "quitacao" | "sinal" | "diarias" | "taxa_limpeza" | "consumo" | "outro"
  date: string;
  notes?: string;
}

export function buildReservationDailyRates(
  checkinStr: string,
  checkoutStr: string,
  defaultRate: number,
  defaultChannel: string,
  existingRates: DailyRateItem[] = []
): DailyRateItem[] {
  if (!checkinStr || !checkoutStr) return [];
  try {
    const d1 = parseISO(checkinStr);
    const d2 = parseISO(checkoutStr);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return [];
    const diff = differenceInDays(d2, d1);
    const nights = Math.max(1, isNaN(diff) ? 1 : diff);
    const existingMap = new Map<string, DailyRateItem>();
    if (Array.isArray(existingRates)) {
      existingRates.forEach(r => {
        if (r && r.date) existingMap.set(r.date, r);
      });
    }

    // Se nenhuma data coincide com o mapa prévio, mas a quantidade de diárias é exatamente a mesma,
    // significa que a reserva inteira foi deslocada no calendário.
    // Preservamos a sequência relativa das diárias (ex: 3 Airbnb + 2 WhatsApp) sem resetar canais!
    const matchingCount = Array.isArray(existingRates)
      ? existingRates.filter(r => r && r.date && existingMap.has(r.date) && r.date >= checkinStr && r.date < checkoutStr).length
      : 0;
    if (matchingCount === 0 && Array.isArray(existingRates) && existingRates.length === nights) {
      return existingRates.map((exist, i) => {
        const rawRate = exist.rate !== undefined && exist.rate !== null ? Number(exist.rate) : Number((exist as any).amount);
        return {
          date: format(addDays(d1, i), "yyyy-MM-dd"),
          rate: !isNaN(rawRate) && rawRate >= 0 ? rawRate : defaultRate,
          channel: normalizeCalendarChannel(exist.channel || defaultChannel),
          notes: exist.notes
        };
      });
    }

    const result: DailyRateItem[] = [];
    for (let i = 0; i < nights; i++) {
      const dateStr = format(addDays(d1, i), "yyyy-MM-dd");
      const exist = existingMap.get(dateStr);
      if (exist) {
        const rawRate = exist.rate !== undefined && exist.rate !== null ? Number(exist.rate) : Number((exist as any).amount);
        result.push({
          date: dateStr,
          rate: !isNaN(rawRate) && rawRate >= 0 ? rawRate : defaultRate,
          channel: normalizeCalendarChannel(exist.channel || defaultChannel),
          notes: exist.notes
        });
      } else {
        const prev = result.length > 0 ? result[result.length - 1] : null;
        result.push({
          date: dateStr,
          rate: prev && Number(prev.rate) >= 0 ? Number(prev.rate) : defaultRate,
          channel: normalizeCalendarChannel(prev && prev.channel ? prev.channel : defaultChannel)
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function areGuestNamesCompatibleUI(nameA?: string | null, nameB?: string | null): boolean {
  const isSystemName = (str?: string | null) => {
    const s = String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!s) return false;
    return /^(ordem\s+de\s+servico\b|os\s*[-#]?\s*\d+|manutencao\b|governanca\b|camareira\b|recepcao\b|administracao\b|corp\s*flats\b|atendimento\b|suporte\b|sistema\b|bot\b|ia\b|notificacao\b|alerta\b|teste\s+os\b)/i.test(s);
  };
  if (isSystemName(nameA) || isSystemName(nameB)) return false;
  const isPlaceholder = (str?: string | null) => {
    const s = String(str || "").trim();
    if (!s || s.length < 2) return true;
    return /^(h[óo]spede(\s*\d+|\s+a\s+definir|\s+titular|\s+b2b|\s+whatsapp)?|a\s+definir.*|visitante|cliente|sem\s+nome|null|undefined)$/i.test(s);
  };
  if (isPlaceholder(nameA) || isPlaceholder(nameB)) return true;
  const norm = (str?: string | null) =>
    String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(nameA);
  const b = norm(nameB);
  if (!a || !b) return true;
  if (a === b) return true;
  const stopWords = new Set(["de", "da", "do", "das", "dos", "del", "di", "du", "e", "jr", "junior", "filho", "filha", "neto", "neta", "sobrinho", "sobrinha", "segundo", "terceiro", "ii", "iii", "iv", "sr", "sra", "srta", "dr", "dra", "prof", "eng"]);
  const tokensA = a.split(" ").filter(t => t.length > 1 && !stopWords.has(t));
  const tokensB = b.split(" ").filter(t => t.length > 1 && !stopWords.has(t));
  if (tokensA.length === 0 || tokensB.length === 0) return true;
  const compatTokensMatch = (ta: string, tb: string) => {
    if (ta === tb) return true;
    if (ta.length >= 3 && tb.length >= 3 && ta.replace(/l/g, "i") === tb.replace(/l/g, "i")) return true;
    return false;
  };
  const firstA = tokensA[0];
  const firstB = tokensB[0];
  if (tokensA.length === 1 && tokensB.length === 1) return compatTokensMatch(firstA, firstB);
  if (tokensA.length === 1 || tokensB.length === 1) {
    return tokensA.length === 1
      ? tokensB.some(t => compatTokensMatch(firstA, t))
      : tokensA.some(t => compatTokensMatch(firstB, t));
  }
  const allAInB = tokensA.every(ta => tokensB.some(tb => compatTokensMatch(ta, tb)));
  const allBInA = tokensB.every(tb => tokensA.some(ta => compatTokensMatch(tb, ta)));
  if (allAInB || allBInA) return true;
  if (compatTokensMatch(firstA, firstB)) {
    return tokensB.slice(1).some(tb => tokensA.slice(1).some(ta => compatTokensMatch(ta, tb)));
  }
  if (tokensA.length >= 3 && compatTokensMatch(tokensA[1], firstB)) {
    return tokensB.slice(1).some(tb => tokensA.slice(2).some(ta => compatTokensMatch(ta, tb)));
  }
  if (tokensB.length >= 3 && compatTokensMatch(tokensB[1], firstA)) {
    return tokensA.slice(1).some(ta => tokensB.slice(2).some(tb => compatTokensMatch(ta, tb)));
  }
  return false;
}

// Helper exportado para validação e parsing seguro de datas com limitação de ano (2000-2100)
export function safeParseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string" || dateStr.length < 10) return null;
  const d = parseISO(dateStr);
  if (isNaN(d.getTime())) return null;
  const yr = d.getFullYear();
  if (yr < 2000 || yr > 2100) return null;
  return d;
}

export default function PmsCalendar(props?: { modalOnly?: boolean; autoOpenNewRes?: boolean; [key: string]: any }) {
  const modalOnly = Boolean(props?.modalOnly)
  const autoOpenNewRes = Boolean(props?.autoOpenNewRes)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { data: settings } = useGetSettings()
  const isAdmin = user?.role === "admin" || user?.role === "dev"

  const [currentDate, setCurrentDate] = useState(new Date())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<{ flats: any[]; reservations: any[]; blocks: any[]; guests?: any[]; expiredPreReservations?: any[] }>({
    flats: [],
    reservations: [],
    blocks: [],
    guests: [],
    expiredPreReservations: []
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

  // Export CSV States
  const [csvExportModalOpen, setCsvExportModalOpen] = useState(false)
  const [exportPreset, setExportPreset] = useState<"all" | "this_month" | "next_month" | "next_90" | "custom">("all")
  const [exportStartDate, setExportStartDate] = useState("")
  const [exportEndDate, setExportEndDate] = useState("")
  const [exportStatus, setExportStatus] = useState("all")
  const [exportChannel, setExportChannel] = useState("all")
  const [exportFlat, setExportFlat] = useState("all")

  // Import CSV States
  const [csvImportModalOpen, setCsvImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<"upsert" | "insert_only">("upsert")
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState<any | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mensagens Rápidas (Manuais) do WhatsApp
  const { activeQuickMessages, dispatchQuickMessage } = useQuickMessages()
  const [hoveredModalQuickMsg, setHoveredModalQuickMsg] = useState<WhatsAppQuickMessage | null>(null)
  const [confirmingModalQuickMsg, setConfirmingModalQuickMsg] = useState<{ qm: WhatsAppQuickMessage; effectiveRes: any } | null>(null)
  const [modalSendingMsgId, setModalSendingMsgId] = useState<string | null>(null)

  // Form fields
  const [formFlatId, setFormFlatId] = useState("")
  const isFlatManuallyChangedRef = useRef(false)
  const [formIsFlatLocked, setFormIsFlatLocked] = useState(false)
  const [formFlatLockReason, setFormFlatLockReason] = useState("")
  const [formGuestName, setFormGuestName] = useState("")
  const [formGuestPhone, setFormGuestPhone] = useState("")
  const [phoneVerification, setPhoneVerification] = useState<{
    phone: string;
    checking: boolean;
    exists?: boolean;
    checked?: boolean;
    canonicalPhone?: string;
  } | null>(null);

  const verifyGuestPhoneWhatsApp = async (phoneToVerify: string) => {
    const queryPhone = formatPhoneForWhatsAppCheck(phoneToVerify);
    if (!queryPhone) {
      setPhoneVerification(null);
      return null;
    }
    const cacheKey = cleanWhatsAppPhone(queryPhone);
    if (phoneVerification && phoneVerification.phone === cacheKey && !phoneVerification.checking) {
      return phoneVerification;
    }
    setPhoneVerification({ phone: cacheKey, checking: true });
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      if (res.ok) {
        const data = await res.json();
        const verResult = {
          phone: cacheKey,
          checking: false,
          exists: data.exists !== false,
          checked: Boolean(data.checked),
          canonicalPhone: data.phone
        };
        setPhoneVerification(verResult);
        return verResult;
      }
    } catch (e: any) {
      console.warn("Erro ao validar telefone:", e);
    }
    const fallbackResult = { phone: cacheKey, checking: false, exists: true, checked: false };
    setPhoneVerification(fallbackResult);
    return fallbackResult;
  };

  const isResCamposResident = (r: any, g?: any) => {
    if (!r) return false;
    if (r.isCamposResident === false) return false;
    if (r.isCamposResident === true) return true;
    const isCamposCityName = (s?: string) => {
      if (!s) return false;
      const l = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\/\s*[a-z]{2}\s*$/, "").trim();
      if (!l) return false;
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
      ) {
        return false;
      }
      return (
        l.includes("goytacazes") ||
        l.includes("goitacazes") ||
        l === "campos" ||
        l === "campos rj" ||
        l === "campos-rj" ||
        /^campos\s*[-/,]\s*rj$/.test(l) ||
        l.startsWith("campos dos goytacazes") ||
        l.startsWith("campos dos goitacazes")
      );
    };
    const isCamposAddrStr = (s?: string) => {
      if (!s) return false;
      const l = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (/^(av\.?\s*pelinca|avenida\s*pelinca)(\s*,\s*100)?(\s*-\s*pelinca)?$/i.test(l)) return false;
      return l.includes("goytacazes") || l.includes("goitacazes") || /campos\s*[-/,]\s*rj/.test(l);
    };
    const isCamposCepStr = (cepVal?: string, addrVal?: string) => {
      const cleanCep = String(cepVal || "").replace(/\D/g, "");
      if (cleanCep.length < 5) return false;
      if (cleanCep === "28035000" && (!addrVal || /pelinca/i.test(addrVal))) return false;
      return cleanCep.startsWith("280") || cleanCep.startsWith("281");
    };

    const allowGuestFallback = r.isCamposResident !== false && g?.isCamposResident !== false;
    if (allowGuestFallback && g?.isCamposResident === true) return true;

    const guestHasVerifiedOriginOrAddr = Boolean(
      g?.fnhrCompleted ||
      g?.originCity ||
      isCamposCepStr(g?.cep, g?.address || g?.street) ||
      (g?.address && !/^(av\.?\s*pelinca|avenida\s*pelinca)(\s*,\s*100)?(\s*-\s*pelinca)?$/i.test(String(g.address).trim())) ||
      (g?.street && !/^(av\.?\s*pelinca|avenida\s*pelinca)(\s*,\s*100)?(\s*-\s*pelinca)?$/i.test(String(g.street).trim()))
    );

    const primaryCity = String(
      r.guestCity || r.city || r.originCity || (allowGuestFallback && guestHasVerifiedOriginOrAddr ? (g?.city || g?.originCity) : "") || ""
    ).trim();
    if (primaryCity && !isCamposCityName(primaryCity) && !isCamposCityName(r.originCity)) {
      return false;
    }

    if (isCamposCityName(r.originCity) || isCamposCityName(r.guestCity) || isCamposCityName(r.city) || isCamposAddrStr(r.guestAddress)) return true;
    if (allowGuestFallback && guestHasVerifiedOriginOrAddr && (isCamposCityName(g?.city) || isCamposCityName(g?.originCity) || isCamposAddrStr(g?.address))) return true;
    if (r.riskAttentionReason && isCamposCityName(r.riskAttentionReason)) return true;
    if (Array.isArray(r.guests) && r.guests.some((guest: any) =>
      guest?.isCamposResident !== false && (
        guest?.isCamposResident === true ||
        isCamposCityName(guest?.originCity) ||
        isCamposAddrStr(guest?.address) ||
        (guest?.hasCompletedCheckin && isCamposCityName(guest?.city))
      )
    )) {
      return true;
    }
    if (isCamposCepStr(r.guestCep || r.cep, r.guestAddress || r.address)) return true;
    if (allowGuestFallback && isCamposCepStr(g?.cep, g?.address || g?.street)) return true;
    return false;
  };

  const [formGuestEmail, setFormGuestEmail] = useState("")
  const [formCheckin, setFormCheckin] = useState(format(new Date(), "yyyy-MM-dd"))
  const [formCheckout, setFormCheckout] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"))
  const [formCheckinTime, setFormCheckinTime] = useState("14:00")
  const [formCheckoutTime, setFormCheckoutTime] = useState("12:00")
  const [defaultCheckinTime, setDefaultCheckinTime] = useState("14:00")
  const [defaultCheckoutTime, setDefaultCheckoutTime] = useState("12:00")
  const [formChannel, setFormChannel] = useState("whatsapp")

  // Range Picker Popover State (Check-in e Check-out unificados)
  const [rangePickerOpen, setRangePickerOpen] = useState(false)
  const [pickerRangeStart, setPickerRangeStart] = useState<string | null>(null)
  const [pickerHoverDate, setPickerHoverDate] = useState<string | null>(null)
  const [pickerMonth, setPickerMonth] = useState<Date>(() => new Date())
  const [formPaymentMethod, setFormPaymentMethod] = useState("pix")
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_CLIENT_PAYMENT_METHODS)
  const [paymentConfigModalOpen, setPaymentConfigModalOpen] = useState(false)
  const [initialNewPaymentMethodName, setInitialNewPaymentMethodName] = useState("")

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch("/api/finance/payment-methods", { credentials: "include" })
      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json) && json.length > 0) {
          setPaymentMethods(json)
        }
      }
    } catch (e) {
      console.error("Erro ao carregar formas de pagamento:", e)
    }
  }

  const [formDailyRate, setFormDailyRate] = useState("250")
  const [formDailyRates, setFormDailyRates] = useState<DailyRateItem[]>([])
  const [formCharges, setFormCharges] = useState<ReservationChargeItem[]>([])
  const [packageTotalInput, setPackageTotalInput] = useState("")
  const [formPayments, setFormPayments] = useState<ReservationPaymentItem[]>([])
  const [formTotalAmount, setFormTotalAmount] = useState("")
  const [formPaidAmount, setFormPaidAmount] = useState("0")
  const [formPaymentStatus, setFormPaymentStatus] = useState("pendente")
  const [formStatus, setFormStatus] = useState<"confirmada" | "pre_reserva">("pre_reserva")
  // ── Validade / Duração da Pré-Reserva & Reativação ──
  const [formHoldPreset, setFormHoldPreset] = useState<"10m" | "30m" | "2h" | "until_2359" | "custom">("2h")
  const [formHoldCustomMode, setFormHoldCustomMode] = useState<"duration" | "datetime">("duration")
  const [formHoldCustomValue, setFormHoldCustomValue] = useState("45")
  const [formHoldCustomUnit, setFormHoldCustomUnit] = useState<"minutes" | "hours">("minutes")
  const [formHoldCustomDateTime, setFormHoldCustomDateTime] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd'T'12:00"))
  const [formHoldManuallyChosen, setFormHoldManuallyChosen] = useState(false)
  const [formSendExpirationReminder, setFormSendExpirationReminder] = useState(true)
  const [isReactivatingRes, setIsReactivatingRes] = useState(false)
  const [maintModalFlat, setMaintModalFlat] = useState<any | null>(null)
  const [maintActionBusyId, setMaintActionBusyId] = useState<number | null>(null)
  const [undoingEarlyCheckoutId, setUndoingEarlyCheckoutId] = useState<number | string | null>(null)
  const [clearingFalseEarlyCheckoutId, setClearingFalseEarlyCheckoutId] = useState<number | string | null>(null)

  const handleToggleMaintenanceBlocker = async (issue: any) => {
    setMaintActionBusyId(issue.id)
    try {
      const nextBlocker = !issue.isRentalBlocker
      const res = await fetch(`/api/observations/${issue.id}/triage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          isRentalBlocker: nextBlocker,
          sendWhatsAppToHandyman: false,
        }),
      })
      if (res.ok) {
        toast({
          title: nextBlocker ? "🚫 Marcado como Impeditivo (Flat Bloqueado)" : "🟢 Marcado como Não Impeditivo (Flat Livre)",
          description: `O mapa de ocupação foi atualizado para o Apt ${issue.flatNumber}.`,
        })
        await fetchData(false)
        setMaintModalFlat((prev: any) =>
          prev
            ? {
                ...prev,
                openMaintenanceIssues: (prev.openMaintenanceIssues || []).map((it: any) =>
                  it.id === issue.id ? { ...it, isRentalBlocker: nextBlocker } : it
                ),
              }
            : null
        )
      }
    } finally {
      setMaintActionBusyId(null)
    }
  }

  const handleQuickResolveMaintenance = async (issue: any) => {
    setMaintActionBusyId(issue.id)
    try {
      const res = await fetch(`/api/observations/${issue.id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolvedNote: "Concluído diretamente pelo Mapa de Reservas" }),
      })
      if (res.ok) {
        toast({
          title: "✅ Manutenção Concluída!",
          description: `Avaria do Apt ${issue.flatNumber} resolvida e bloqueio removido.`,
        })
        await fetchData(false)
        setMaintModalFlat((prev: any) => {
          if (!prev) return null
          const remaining = (prev.openMaintenanceIssues || []).filter((it: any) => it.id !== issue.id)
          return remaining.length > 0 ? { ...prev, openMaintenanceIssues: remaining } : null
        })
      }
    } finally {
      setMaintActionBusyId(null)
    }
  }
  const [reactivationFlatSwitchedInfo, setReactivationFlatSwitchedInfo] = useState<string | null>(null)
  const [expiredModalOpen, setExpiredModalOpen] = useState(false)
  const [formExtensionHoldMode, setFormExtensionHoldMode] = useState<"pre_reserva" | "confirmada_sem_prazo">("pre_reserva")
  const [isReactivatingExt, setIsReactivatingExt] = useState(false)
  const [cancellingPendingExt, setCancellingPendingExt] = useState(false)

  const getDefaultHoldPresetForCheckin = (cinStr: string): "2h" | "until_2359" => {
    const todayS = format(new Date(), "yyyy-MM-dd")
    return cinStr && cinStr > todayS ? "until_2359" : "2h"
  }

  const getDefaultHoldPresetForExtension = (extStartStr: string): "30m" | "2h" | "until_2359" => {
    const now = new Date()
    const todayS = format(now, "yyyy-MM-dd")
    if (extStartStr && extStartStr > todayS) return "until_2359"
    return now.getHours() >= 10 ? "30m" : "2h"
  }

  const computeHoldExpirationInfoForPreset = (preset: "10m" | "30m" | "2h" | "until_2359") => {
    const now = new Date()
    const nowMs = now.getTime()
    if (preset === "10m") {
      const exp = new Date(nowMs + 10 * 60 * 1000)
      return { holdPreset: "10m" as const, holdDurationMinutes: 10, holdDurationLabel: "10 minutos", expiresAt: exp.toISOString(), formattedTime: format(exp, "HH:mm") }
    }
    if (preset === "30m") {
      const exp = new Date(nowMs + 30 * 60 * 1000)
      return { holdPreset: "30m" as const, holdDurationMinutes: 30, holdDurationLabel: "30 minutos", expiresAt: exp.toISOString(), formattedTime: format(exp, "HH:mm") }
    }
    if (preset === "until_2359") {
      const endOfToday = new Date(now)
      endOfToday.setHours(23, 59, 59, 999)
      if (endOfToday.getTime() <= nowMs + 5 * 60 * 1000) {
        const exp = new Date(nowMs + 30 * 60 * 1000)
        return { holdPreset: "30m" as const, holdDurationMinutes: 30, holdDurationLabel: "30 minutos", expiresAt: exp.toISOString(), formattedTime: format(exp, "HH:mm") }
      }
      const mins = Math.max(1, Math.round((endOfToday.getTime() - nowMs) / 60000))
      return { holdPreset: "until_2359" as const, holdDurationMinutes: mins, holdDurationLabel: "até 23:59 de hoje", expiresAt: endOfToday.toISOString(), formattedTime: "23:59" }
    }
    const exp = new Date(nowMs + 120 * 60 * 1000)
    return { holdPreset: "2h" as const, holdDurationMinutes: 120, holdDurationLabel: "2 horas", expiresAt: exp.toISOString(), formattedTime: format(exp, "HH:mm") }
  }

  useEffect(() => {
    if (!formHoldManuallyChosen) {
      if (selectedRes && formStatus !== "pre_reserva") {
        const baseCout = selectedRes.pendingStayExtension?.isPreReservationHold
          ? (selectedRes.pendingStayExtension.oldCheckoutDate || selectedRes.checkoutDate)
          : selectedRes.checkoutDate
        const baseCin = selectedRes.pendingStayExtension?.isPreReservationHold
          ? (selectedRes.pendingStayExtension.oldCheckinDate || selectedRes.checkinDate)
          : selectedRes.checkinDate
        const extStart = formCheckin < baseCin ? formCheckin : baseCout
        if (formCheckout > baseCout || formCheckin < baseCin) {
          setFormHoldPreset(getDefaultHoldPresetForExtension(extStart))
          return
        }
      }
      setFormHoldPreset(getDefaultHoldPresetForCheckin(formCheckin))
    }
  }, [formCheckin, formCheckout, formHoldManuallyChosen, selectedRes?.id, formStatus])

  const computeHoldExpirationInfo = () => {
    const now = new Date()
    const nowMs = now.getTime()
    let expiresAtMs = nowMs + 120 * 60 * 1000
    let holdDurationMinutes = 120
    let holdDurationLabel = "2 horas"

    if (formHoldPreset === "10m") {
      holdDurationMinutes = 10
      expiresAtMs = nowMs + 10 * 60 * 1000
      holdDurationLabel = "10 minutos"
    } else if (formHoldPreset === "30m") {
      holdDurationMinutes = 30
      expiresAtMs = nowMs + 30 * 60 * 1000
      holdDurationLabel = "30 minutos"
    } else if (formHoldPreset === "2h") {
      holdDurationMinutes = 120
      expiresAtMs = nowMs + 120 * 60 * 1000
      holdDurationLabel = "2 horas"
    } else if (formHoldPreset === "until_2359") {
      const endOfToday = new Date(now)
      endOfToday.setHours(23, 59, 59, 999)
      if (endOfToday.getTime() <= nowMs + 5 * 60 * 1000) {
        expiresAtMs = nowMs + 30 * 60 * 1000
        holdDurationMinutes = 30
        holdDurationLabel = "30 minutos"
      } else {
        expiresAtMs = endOfToday.getTime()
        holdDurationMinutes = Math.max(1, Math.round((expiresAtMs - nowMs) / 60000))
        holdDurationLabel = "até 23:59 de hoje"
      }
    } else if (formHoldPreset === "custom") {
      if (formHoldCustomMode === "datetime" && formHoldCustomDateTime) {
        const parsed = new Date(formHoldCustomDateTime)
        if (!isNaN(parsed.getTime()) && parsed.getTime() > nowMs + 60 * 1000) {
          expiresAtMs = parsed.getTime()
          holdDurationMinutes = Math.max(1, Math.round((expiresAtMs - nowMs) / 60000))
          holdDurationLabel = `até ${format(parsed, "dd/MM 'às' HH:mm")}`
        } else {
          expiresAtMs = nowMs + 60 * 60 * 1000
          holdDurationMinutes = 60
          holdDurationLabel = "1 hora"
        }
      } else {
        const numVal = Math.max(1, Number(formHoldCustomValue) || 30)
        if (formHoldCustomUnit === "hours") {
          holdDurationMinutes = Math.round(numVal * 60)
          holdDurationLabel = numVal === 1 ? "1 hora" : `${numVal} horas`
        } else {
          holdDurationMinutes = Math.round(numVal)
          holdDurationLabel = `${holdDurationMinutes} minutos`
        }
        expiresAtMs = nowMs + holdDurationMinutes * 60 * 1000
      }
    }

    const expDate = new Date(expiresAtMs)
    const isExpToday = isSameDay(expDate, now)
    const formattedDeadline = isExpToday
      ? `Hoje (${format(expDate, "dd/MM")}) às ${format(expDate, "HH:mm")}`
      : format(expDate, "dd/MM/yyyy 'às' HH:mm")

    // Cálculo adaptativo do Lembrete Antes de Expirar:
    // - <= 15 min (ex: 10 min): sem lembrete intermediário
    // - 16 a 60 min (ex: 30 min): faltando 10 min
    // - 61 a 240 min (ex: 2h): faltando 30 min
    // - > 240 min (ex: Até 23:59): faltando 2 horas (120 min)
    let reminderLeadMinutes = 0
    let reminderLeadLabel = ""
    let reminderAt: string | null = null
    let reminderFormattedTime = ""

    if (holdDurationMinutes > 15) {
      if (holdDurationMinutes <= 60) {
        reminderLeadMinutes = 10
        reminderLeadLabel = "10 min"
      } else if (holdDurationMinutes <= 240) {
        reminderLeadMinutes = 30
        reminderLeadLabel = "30 min"
      } else {
        reminderLeadMinutes = 120
        reminderLeadLabel = "2 horas"
      }
      const remMs = expiresAtMs - reminderLeadMinutes * 60 * 1000
      if (remMs > nowMs + 60 * 1000) {
        const remDate = new Date(remMs)
        reminderAt = remDate.toISOString()
        reminderFormattedTime = isSameDay(remDate, now)
          ? `hoje às ${format(remDate, "HH:mm")}`
          : format(remDate, "dd/MM 'às' HH:mm")
      }
    }

    return {
      expiresAt: expDate.toISOString(),
      holdPreset: formHoldPreset,
      holdDurationMinutes,
      holdDurationLabel,
      formattedDeadline,
      sendExpirationReminder: formSendExpirationReminder && reminderLeadMinutes > 0,
      reminderLeadMinutes,
      reminderLeadLabel,
      reminderAt: formSendExpirationReminder ? reminderAt : null,
      reminderFormattedTime
    }
  }
  const [formNotes, setFormNotes] = useState("")
  const [formEarlyCheckin, setFormEarlyCheckin] = useState(false)
  const [formReceptionNotes, setFormReceptionNotes] = useState("")
  const [formVehiclePlate, setFormVehiclePlate] = useState("")
  const [formVehicleModel, setFormVehicleModel] = useState("")
  const [formVehicleBrand, setFormVehicleBrand] = useState("")
  const [formVehicleColor, setFormVehicleColor] = useState("")
  const [formAutoInvoice, setFormAutoInvoice] = useState(false)
  const [formPrefersHighFloor, setFormPrefersHighFloor] = useState(false)
  const [formTwinBeds, setFormTwinBeds] = useState(false)
  const [formExtraMattress, setFormExtraMattress] = useState(false)
  const [formIncludeBreakfast, setFormIncludeBreakfast] = useState(false)
  const [formSpecialRequests, setFormSpecialRequests] = useState("")

  // Documento Oficial e Alertas Operacionais
  const [formDocPhotoUrl, setFormDocPhotoUrl] = useState("")
  const [docPdfViewerOpen, setDocPdfViewerOpen] = useState(false)
  const [formDocFileName, setFormDocFileName] = useState("")
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [formHasMinor, setFormHasMinor] = useState(false)
  const [formIsCamposResident, setFormIsCamposResident] = useState(false)
  const pmsDocInputRef = useRef<HTMLInputElement>(null)

  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingDoc(true)
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      let base64String = ""
      if (isPdf) {
        base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      } else {
        const compressed = await compressImage(file, {
          maxWidth: 1400,
          maxHeight: 1400,
          quality: 0.82,
          preferredFormat: "image/webp"
        })
        base64String = compressed.base64
      }

      setFormDocPhotoUrl(base64String)
      setFormDocFileName(file.name)

      try {
        const aiRes = await fetch("/api/ai/inspect-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentFile: base64String,
            declaredName: formGuestName,
            declaredCpf: formGuest1Cpf
          })
        })
        if (aiRes.ok) {
          const aiData = await aiRes.json()
          if (aiData.isMinor) {
            setFormHasMinor(true)
            toast({
              title: "👶 Alerta: Menor de Idade",
              description: `A IA detectou idade ${aiData.calculatedAge ? `${aiData.calculatedAge} anos` : (aiData.extractedAge || "menor de 18 anos")}. Exija autorização em cartório conforme ECA Art. 82.`,
              variant: "destructive"
            })
          }
          if (aiData.isCamposResident) {
            setFormIsCamposResident(true)
            toast({
              title: "📍 Alerta: Morador de Campos/RJ",
              description: "Hóspede de Campos dos Goytacazes/RJ incluído no radar operacional da recepção."
            })
          } else if (aiData.isCamposResident === false) {
            setFormIsCamposResident(false)
          }
        }
      } catch (aiErr) {
        console.warn("AI inspect doc error:", aiErr)
      }

      toast({
        title: "Documento Carregado",
        description: `${file.name} anexado com sucesso.`
      })
    } catch (err: any) {
      toast({
        title: "Erro ao processar documento",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setUploadingDoc(false)
    }
  }

  // Modal Tabs, Audit Logs & Communications State
  const [resModalTab, setResModalTab] = useState<"reservation" | "payments" | "audit" | "communications" | "links" | "details">("reservation")
  const [commSubTab, setCommSubTab] = useState<"whatsapp" | "email">("whatsapp")
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [communications, setCommunications] = useState<any[]>([])
  const [scheduledEmails, setScheduledEmails] = useState<any[]>([])
  const [whatsappQueue, setWhatsappQueue] = useState<any[]>([])
  const [whatsappHistory, setWhatsappHistory] = useState<any[]>([])
  const [loadingComms, setLoadingComms] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [dispatchingActionId, setDispatchingActionId] = useState<string | null>(null)
  const [expandedCommId, setExpandedCommId] = useState<string | null>(null)
  const [manualRecipient, setManualRecipient] = useState("")
  const [manualSubject, setManualSubject] = useState("")
  const [manualBody, setManualBody] = useState("")
  const [resendingCommId, setResendingCommId] = useState<string | null>(null)
  const [portariaEmail, setPortariaEmail] = useState("soho@promenade.com.br")
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
        if (Array.isArray(json)) {
          setCommunications(json)
        } else if (json) {
          setCommunications(Array.isArray(json.emails) ? json.emails : [])
          setScheduledEmails(Array.isArray(json.emailsScheduled) ? json.emailsScheduled : [])
          setWhatsappQueue(Array.isArray(json.whatsappQueue) ? json.whatsappQueue : [])
          setWhatsappHistory(Array.isArray(json.whatsappHistory) ? json.whatsappHistory : [])
        }
      }
    } catch (e) {
      console.error("Erro ao buscar comunicações:", e)
    } finally {
      setLoadingComms(false)
    }
  }

  const handleSendWhatsAppNow = async (queueId: string) => {
    setDispatchingActionId(queueId)
    try {
      const res = await fetch(`/api/whatsapp/queue/${queueId}/send-now`, { method: "POST" })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "⚡ WhatsApp Enviado Agora!",
          description: "Mensagem agendada foi antecipada e entregue com sucesso via Z-API."
        })
        if (selectedRes) fetchCommunications(selectedRes.code || selectedRes.id)
      } else {
        toast({
          title: "Falha ao disparar",
          description: data.error || "Não foi possível antecipar o disparo no WhatsApp.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de disparo", description: err.message, variant: "destructive" })
    } finally {
      setDispatchingActionId(null)
    }
  }

  const handleCancelWhatsApp = async (queueId: string) => {
    if (!confirm("Deseja cancelar esta mensagem agendada de WhatsApp?")) return
    try {
      const res = await fetch(`/api/whatsapp/queue/${queueId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Agendamento Cancelado", description: "A mensagem não será enviada." })
        if (selectedRes) fetchCommunications(selectedRes.code || selectedRes.id)
      }
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" })
    }
  }

  const handleSendEmailNow = async (queueId: string) => {
    setDispatchingActionId(queueId)
    try {
      const res = await fetch(`/api/emails/queue/${queueId}/send-now`, { method: "POST" })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "⚡ E-mail Enviado Agora!",
          description: "E-mail agendado foi antecipado e entregue com sucesso via SMTP."
        })
        if (selectedRes) fetchCommunications(selectedRes.code || selectedRes.id)
      } else {
        toast({
          title: "Falha ao disparar",
          description: data.error || "Não foi possível antecipar o disparo de e-mail.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de disparo", description: err.message, variant: "destructive" })
    } finally {
      setDispatchingActionId(null)
    }
  }

  const handleCancelEmail = async (queueId: string) => {
    if (!confirm("Deseja cancelar este agendamento de e-mail?")) return
    try {
      const res = await fetch(`/api/emails/queue/${queueId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Agendamento Cancelado", description: "O e-mail não será enviado." })
        if (selectedRes) fetchCommunications(selectedRes.code || selectedRes.id)
      }
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" })
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

  // ── CSV Export & Import Handlers ──
  const handleExportCsv = () => {
    try {
      const params = new URLSearchParams()
      if (exportPreset === "this_month") {
        params.set("startDate", format(startOfMonth(new Date()), "yyyy-MM-dd"))
        params.set("endDate", format(endOfMonth(new Date()), "yyyy-MM-dd"))
      } else if (exportPreset === "next_month") {
        const nextMonthDate = addDays(endOfMonth(new Date()), 1)
        params.set("startDate", format(startOfMonth(nextMonthDate), "yyyy-MM-dd"))
        params.set("endDate", format(endOfMonth(nextMonthDate), "yyyy-MM-dd"))
      } else if (exportPreset === "next_90") {
        params.set("startDate", format(new Date(), "yyyy-MM-dd"))
        params.set("endDate", format(addDays(new Date(), 90), "yyyy-MM-dd"))
      } else if (exportPreset === "custom") {
        if (exportStartDate) params.set("startDate", exportStartDate)
        if (exportEndDate) params.set("endDate", exportEndDate)
      }
      if (exportStatus && exportStatus !== "all") params.set("status", exportStatus)
      if (exportChannel && exportChannel !== "all") params.set("channel", exportChannel)
      if (exportFlat && exportFlat !== "all") params.set("flatNumber", exportFlat)

      const downloadUrl = `/api/pms/reservations/export-csv?${params.toString()}`
      const link = document.createElement("a")
      link.href = downloadUrl
      link.setAttribute("download", `reservas_corpflats_${format(new Date(), "yyyy-MM-dd")}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setCsvExportModalOpen(false)
      toast({
        title: "Exportação Concluída",
        description: "O arquivo CSV com as reservas foi gerado com sucesso.",
      })
    } catch (e: any) {
      toast({
        title: "Erro ao Exportar",
        description: e.message || "Não foi possível gerar o arquivo CSV.",
        variant: "destructive"
      })
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setIsPreviewing(true)
    setPreviewResult(null)

    try {
      const text = await file.text()
      const res = await fetch("/api/pms/reservations/preview-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent: text }),
        credentials: "include"
      })
      const json = await res.json()
      if (res.ok) {
        setPreviewResult(json)
      } else {
        toast({
          title: "Erro ao processar CSV",
          description: json.error || "Formato de arquivo inválido.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro ao ler arquivo",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!previewResult || !previewResult.preview || previewResult.preview.length === 0) return
    const validItems = previewResult.preview.filter((p: any) => p.status !== "error")
    if (validItems.length === 0) {
      toast({
        title: "Nenhuma reserva válida para importar",
        description: "Corrija os erros apontados na tabela de pré-visualização.",
        variant: "destructive"
      })
      return
    }

    setIsImporting(true)
    try {
      const res = await fetch("/api/pms/reservations/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservations: validItems,
          mode: importMode
        }),
        credentials: "include"
      })
      const data = await res.json()
      if (res.ok) {
        toast({
          title: "✓ Importação Realizada com Sucesso!",
          description: data.message || "As reservas foram importadas e o mapa foi atualizado.",
        })
        setCsvImportModalOpen(false)
        setImportFile(null)
        setPreviewResult(null)
        fetchData(true)
      } else {
        toast({
          title: "Erro ao importar",
          description: data.error || "Ocorreu uma falha ao gravar as reservas.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsImporting(false)
    }
  }

  const fairShareReqIdRef = useRef(0)

  const fetchFairShare = async (cin: string, cout: string, excludeId: any = null) => {
    if (!cin || !cout) return
    let normCin = cin
    let normCout = cout
    if (normCin >= normCout) {
      const d = safeParseDate(normCin)
      if (d) normCout = format(addDays(d, 1), "yyyy-MM-dd")
    }
    const reqId = ++fairShareReqIdRef.current
    setLoadingFairShare(true)
    try {
      const url = `/api/pms/fair-share-flat?checkin=${normCin}&checkout=${normCout}${excludeId ? `&excludeResId=${excludeId}` : ''}&_t=${Date.now()}`
      const res = await fetch(url, { credentials: "include", cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        if (reqId === fairShareReqIdRef.current) {
          setFairShareResult({ ...json, _checkin: normCin, _checkout: normCout })
        }
        return json
      }
    } catch {} finally {
      if (reqId === fairShareReqIdRef.current) {
        setLoadingFairShare(false)
      }
    }
  }

  useEffect(() => {
    setRawBoletoInputs({})
  }, [resModalOpen, selectedRes?.id])

  useEffect(() => {
    if (resModalOpen) {
      fetchCrmGuests()
      fetchCompanies()
      fetchAgencies()
    }
    if (resModalOpen && formCheckin && formCheckout) {
      fetchFairShare(formCheckin, formCheckout, selectedRes?.id).then((result) => {
        // Auto-select Flat da Vez on new reservation (and when dates change) unless user manually picked a flat
        if (!selectedRes && result?.bestFlatId && !isFlatManuallyChangedRef.current) {
          setFormFlatId(String(result.bestFlatId))
        }
      })
    }
  }, [resModalOpen, formCheckin, formCheckout, selectedRes?.id])

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
    if (modalOnly) return;
    fetch("/api/pms/amenities/essential-tags")
      .then(r => r.json())
      .then(d => {
        if (d.essentialTagIds && Array.isArray(d.essentialTagIds)) {
          setEssentialTagIds(d.essentialTagIds);
          localStorage.setItem("gfm_essential_tags", JSON.stringify(d.essentialTagIds));
        }
      })
      .catch(() => {});
  }, [modalOnly]);

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

  // Active Service Order Block Conflict in Reservation Modal
  const activeServiceBlockConflict = useMemo(() => {
    if (!formFlatId || !formCheckin || !formCheckout) return null;
    return (data.blocks || []).find(b => {
      const isService = Boolean(b.isServiceBlock || b.reason === "service_order");
      if (!isService) return false;
      const sameFlat = Number(b.flatId) === Number(formFlatId) || String(b.flatNumber) === String(formFlatId);
      if (!sameFlat) return false;
      return b.startDate <= formCheckout && b.endDate >= formCheckin;
    });
  }, [formFlatId, formCheckin, formCheckout, data.blocks]);


  // Multi-Guest & Corporate Requester State
  const [formGuestCount, setFormGuestCount] = useState<"1" | "2" | "3">("1")
  const [formRequesterType, setFormRequesterType] = useState<"guest" | "other_person" | "company" | "agency_b2b">("guest")
  const [formRequesterName, setFormRequesterName] = useState("")
  const [formRequesterPhone, setFormRequesterPhone] = useState("")
  const [formRequesterEmail, setFormRequesterEmail] = useState("")
  const [formRequesterCpf, setFormRequesterCpf] = useState("")
  const [formCompanyId, setFormCompanyId] = useState("")
  const [formCompanyName, setFormCompanyName] = useState("")
  const [formCostCenter, setFormCostCenter] = useState("")
  const [companies, setCompanies] = useState<any[]>([])
  const [agencies, setAgencies] = useState<any[]>([])
  const [crmGuests, setCrmGuests] = useState<any[]>([])
  const [formGuestId, setFormGuestId] = useState("")
  const [guestSearchFilter, setGuestSearchFilter] = useState("")
  const [showGuestSuggestions, setShowGuestSuggestions] = useState(false)
  const guestSuggestionsRef = useRef<HTMLDivElement>(null)

  // 4-Point B2B Reservation States (Agência + Empresa + Voucher B2B + Tomador NF)
  const [formAgencyId, setFormAgencyId] = useState("")
  const [formAgencyName, setFormAgencyName] = useState("")
  const [formAgencyCnpj, setFormAgencyCnpj] = useState("")
  const [formAgencyPosUnit, setFormAgencyPosUnit] = useState("")
  const [formAgencyAgentName, setFormAgencyAgentName] = useState("")
  const [formAgencyAgentEmail, setFormAgencyAgentEmail] = useState("")
  const [formAgencyAgentPhone, setFormAgencyAgentPhone] = useState("")
  const [formB2bReservationNumber, setFormB2bReservationNumber] = useState("")
  const [formB2bLocatorRloc, setFormB2bLocatorRloc] = useState("")
  const [formB2bOriginType, setFormB2bOriginType] = useState<"BOOKING_WS" | "OTA_WS">("BOOKING_WS")
  const [formB2bRatePolicy, setFormB2bRatePolicy] = useState<"COMISSIONADA" | "NET">("COMISSIONADA")
  const [formB2bCommissionPct, setFormB2bCommissionPct] = useState<number | string>(12)
  const [formB2bPaymentType, setFormB2bPaymentType] = useState<"VIRTUAL_CARD" | "FATURADO">("VIRTUAL_CARD")
  const [formB2bCardBrand, setFormB2bCardBrand] = useState("Mastercard")
  const [formB2bCardMasked, setFormB2bCardMasked] = useState("")
  const [formB2bVcnToken, setFormB2bVcnToken] = useState("")
  const [formB2bConciliationUrl, setFormB2bConciliationUrl] = useState("https://conciliacao.b2breservas.com.br")
  const [formB2bAuthorizedExpenses, setFormB2bAuthorizedExpenses] = useState("SOMENTE DIÁRIAS COM IMPOSTOS")
  const [formInvoiceRecipientType, setFormInvoiceRecipientType] = useState<"company" | "agency" | "guest" | "requester">("guest")
  const [formNfDeliveryEmails, setFormNfDeliveryEmails] = useState("")
  const [formNfHideFromGuest, setFormNfHideFromGuest] = useState(false)
  const [formInvoicingInstructions, setFormInvoicingInstructions] = useState("")
  const [formVoucherUrl, setFormVoucherUrl] = useState("")
  const [showVoucherParser, setShowVoucherParser] = useState(false)
  const [voucherTextToParse, setVoucherTextToParse] = useState("")
  const [voucherFilePayload, setVoucherFilePayload] = useState<{ fileBase64: string; fileName: string; mimeType: string } | null>(null)
  const [parsingVoucher, setParsingVoucher] = useState(false)
  const [sendingB2bCredentialEmail, setSendingB2bCredentialEmail] = useState(false)

  // Faturamento a Prazo / Boleto Banco Inter States
  const [formIsFaturadoBoleto, setFormIsFaturadoBoleto] = useState(false)
  const [formBoletoTermDays, setFormBoletoTermDays] = useState<number>(15)
  const [rawBoletoInputs, setRawBoletoInputs] = useState<Record<string, string>>({})
  const [formBoletoCustomDueDate, setFormBoletoCustomDueDate] = useState("")
  const [formBoletoConsumptionMode, setFormBoletoConsumptionMode] = useState<"single_boleto" | "separate_boletos">("single_boleto")
  const [formBoletoPayerType, setFormBoletoPayerType] = useState<"company" | "agency" | "requester" | "financial_responsible" | "guest">("company")
  const [formConsumptionSamePayerAndDue, setFormConsumptionSamePayerAndDue] = useState(true)
  const [formConsumptionPayerType, setFormConsumptionPayerType] = useState<"guest" | "company" | "agency" | "requester" | "financial_responsible">("guest")
  const [formConsumptionTermDays, setFormConsumptionTermDays] = useState<number>(15)
  const [formConsumptionCustomDueDate, setFormConsumptionCustomDueDate] = useState("")
  const [formBoletoFinePct, setFormBoletoFinePct] = useState<number>(2)
  const [formBoletoInterestPct, setFormBoletoInterestPct] = useState<number>(1)
  const [formAutoEmitBoletoOnCheckout, setFormAutoEmitBoletoOnCheckout] = useState(true)
  const [formAutoReminderEnabled, setFormAutoReminderEnabled] = useState(true)
  const [formFinRespName, setFormFinRespName] = useState("")
  const [formFinRespEmail, setFormFinRespEmail] = useState("")
  const [formFinRespPhone, setFormFinRespPhone] = useState("")
  const [formFinRespDoc, setFormFinRespDoc] = useState("")
  const [formRecGuest, setFormRecGuest] = useState(false)
  const [formRecRequester, setFormRecRequester] = useState(true)
  const [formRecCompany, setFormRecCompany] = useState(true)
  const [formRecFinResp, setFormRecFinResp] = useState(true)
  const [formRecSendEmail, setFormRecSendEmail] = useState(true)
  const [formRecSendWhatsapp, setFormRecSendWhatsapp] = useState(true)
  const [emittingResBoleto, setEmittingResBoleto] = useState(false)

  // Quick Inline Agency Creation State
  const [newAgencyInlineOpen, setNewAgencyInlineOpen] = useState(false)
  const [newAgencyName, setNewAgencyName] = useState("")
  const [newAgencyCnpj, setNewAgencyCnpj] = useState("")
  const [newAgencyEmail, setNewAgencyEmail] = useState("")
  const [newAgencyPhone, setNewAgencyPhone] = useState("")
  const [savingNewAgency, setSavingNewAgency] = useState(false)

  // Third-Party Requester CRM States
  const [formRequesterId, setFormRequesterId] = useState("")
  const [requesterSearchFilter, setRequesterSearchFilter] = useState("")
  const [showRequesterSuggestions, setShowRequesterSuggestions] = useState(false)
  const requesterSuggestionsRef = useRef<HTMLDivElement>(null)

  // Quick Company Creation Modal States
  const [newCompanyModalOpen, setNewCompanyModalOpen] = useState(false)
  const [newCompCorporateName, setNewCompCorporateName] = useState("")
  const [newCompTradeName, setNewCompTradeName] = useState("")
  const [newCompCnpj, setNewCompCnpj] = useState("")
  const [newCompFinancialEmail, setNewCompFinancialEmail] = useState("")
  const [newCompPhone, setNewCompPhone] = useState("")
  const [newCompContactPerson, setNewCompContactPerson] = useState("")
  const [newCompBillingTerms, setNewCompBillingTerms] = useState("30 dias")
  const [newCompNotes, setNewCompNotes] = useState("")
  const [savingNewCompany, setSavingNewCompany] = useState(false)
  const [loadingNewCompanyCnpj, setLoadingNewCompanyCnpj] = useState(false)

  // Guests individual fields
  const [formGuest1Cpf, setFormGuest1Cpf] = useState("")
  const [formGuest2Id, setFormGuest2Id] = useState("")
  const [guest2SearchFilter, setGuest2SearchFilter] = useState("")
  const [showGuest2Suggestions, setShowGuest2Suggestions] = useState(false)
  const guest2SuggestionsRef = useRef<HTMLDivElement>(null)
  const [formGuest2Name, setFormGuest2Name] = useState("")
  const [formGuest2Cpf, setFormGuest2Cpf] = useState("")
  const [formGuest2Phone, setFormGuest2Phone] = useState("")
  const [formGuest2Email, setFormGuest2Email] = useState("")
  const [formGuest3Id, setFormGuest3Id] = useState("")
  const [guest3SearchFilter, setGuest3SearchFilter] = useState("")
  const [showGuest3Suggestions, setShowGuest3Suggestions] = useState(false)
  const guest3SuggestionsRef = useRef<HTMLDivElement>(null)
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
    initialGrabDayOffset: number;
    currentFlatId: number;
    currentFlatNumber: string;
    currentCheckin: string;
    currentCheckout: string;
  }

  const [resDragState, setResDragState] = useState<ResDragState | null>(null);
  const resDragStateRef = useRef<ResDragState | null>(null);
  resDragStateRef.current = resDragState;

  // Diálogo de confirmação seguro antes de aplicar movimentação ou redimensionamento
  const [dragConfirmData, setDragConfirmData] = useState<{
    isOpen: boolean;
    res: any;
    mode: "move" | "resize-left" | "resize-right";
    originFlatNumber: string;
    targetFlatNumber: string;
    originCheckin: string;
    targetCheckin: string;
    originCheckout: string;
    targetCheckout: string;
    originNights: number;
    targetNights: number;
    originTotal: number;
    targetTotal: number;
    payload: any;
    optimisticReservation: any;
    isUnpaidDirectExtension?: boolean;
    addedNightsCount?: number;
    extraPendingAmount?: number;
    firstAddedDate?: string;
    extensionHoldMode?: "pre_reserva" | "confirmada_sem_prazo";
    extensionHoldPreset?: "10m" | "30m" | "2h" | "until_2359";
  } | null>(null);

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

    // Calcula em qual dia da estadia o usuário clicou (offset de arraste relativo)
    let initialGrabDayOffset = 0;
    if (mode === "move") {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      let clickedDayStr: string | null = cell ? cell.getAttribute("data-day-str") : null;
      if (!clickedDayStr && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const cRect = container.getBoundingClientRect();
        const timelineX = e.clientX - cRect.left + container.scrollLeft;
        for (let i = 0; i < daysInView.length; i++) {
          const dStr = format(daysInView[i], "yyyy-MM-dd");
          const layout = dayLayoutMap[dStr];
          if (layout && timelineX >= layout.left && timelineX < layout.left + layout.width) {
            clickedDayStr = dStr;
            break;
          }
        }
      }
      if (clickedDayStr) {
        try {
          const checkinD = parseISO(resItem.checkinDate);
          const clickedD = parseISO(clickedDayStr);
          const rawOffset = differenceInCalendarDays(clickedD, checkinD);
          initialGrabDayOffset = Math.max(0, Math.min(nights - 1, isNaN(rawOffset) ? 0 : rawOffset));
        } catch (_) {
          initialGrabDayOffset = 0;
        }
      }
    }

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
      initialGrabDayOffset,
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

      // Limiar rigoroso para evitar que micro-tremores de clique (4-12px) virem arraste involuntário
      const moveThreshold = current.pointerType === "touch" ? 18 : 12;
      if (!current.hasMoved) {
        if (dx > moveThreshold || dy > moveThreshold) {
          current.hasMoved = true;
        } else {
          return;
        }
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
          const grabOffset = prev.initialGrabDayOffset || 0;
          newCheckin = format(subDays(parseISO(target.dayStr), grabOffset), "yyyy-MM-dd");
          newCheckout = format(addDays(parseISO(newCheckin), prev.nightsCount), "yyyy-MM-dd");
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

      // Se não houve movimento deliberado (foi apenas um clique):
      if (!current.hasMoved) {
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

      const serviceBlockConflict = data.blocks.find(b => {
        const isService = Boolean(b.isServiceBlock || b.reason === "service_order");
        if (!isService) return false;
        const sameFlat = b.flatId === current.currentFlatId || String(b.flatNumber) === String(current.currentFlatNumber);
        return sameFlat && b.startDate <= current.currentCheckout && b.endDate >= current.currentCheckin;
      });

      const hasHardBlockConflict = data.blocks.some(b => {
        const isService = Boolean(b.isServiceBlock || b.reason === "service_order");
        if (isService) return false;
        const sameFlat = b.flatId === current.currentFlatId || String(b.flatNumber) === String(current.currentFlatNumber);
        if (!sameFlat) return false;
        return b.startDate <= current.currentCheckout && b.endDate >= current.currentCheckin;
      });

      if (hasConflict || hasHardBlockConflict) {
        alert(`Não foi possível alterar a reserva: o Apt ${current.currentFlatNumber} já possui ocupação ou bloqueio no período (${format(parseISO(current.currentCheckin), "dd/MM")} a ${format(parseISO(current.currentCheckout), "dd/MM")}).`);
        setResDragState(null);
        return;
      }

      if (serviceBlockConflict) {
        const servTitle = serviceBlockConflict.serviceTitle || serviceBlockConflict.title || "Serviço Externo";
        const workerTxt = serviceBlockConflict.workerName ? ` (Prestador: ${serviceBlockConflict.workerName})` : "";
        const proceed = confirm(
          `⚠️ AVISO DE CONFLITO COM SERVIÇO EXTERNO\n\n` +
          `O Apt ${current.currentFlatNumber} possui o serviço "${servTitle}" agendado/em andamento neste período${workerTxt}.\n\n` +
          `A reserva pode ser movida, mas o flat pode estar indisponível.\n\n` +
          `Deseja prosseguir e mover a reserva sobrescrevendo este bloqueio?`
        );
        if (!proceed) {
          setResDragState(null);
          return;
        }
      }

      const originNights = differenceInDays(parseISO(current.originCheckout), parseISO(current.originCheckin)) || 1;
      const targetNights = differenceInDays(parseISO(current.currentCheckout), parseISO(current.currentCheckin)) || 1;

      const existingChargesList = Array.isArray(current.res.charges) ? current.res.charges : [];
      const oldRatesSum = Array.isArray(current.res.dailyRates) && current.res.dailyRates.length > 0
        ? current.res.dailyRates.reduce((acc: number, d: any) => acc + (Number(d.rate ?? d.amount) || 0), 0)
        : 0;
      const explicitFeesSum =
        (Number(current.res.cleaningFee) || 0) +
        (Number(current.res.petFee) || 0) +
        (Number(current.res.extraBedFee) || 0) +
        (Number(current.res.twinFee) || 0) +
        (Number(current.res.earlyCheckinFee) || 0) +
        (Number(current.res.lateCheckoutFee) || 0);
      const existingChargesSum = existingChargesList.length > 0
        ? existingChargesList.reduce((acc: number, c: any) => acc + (Number(c.amount) || 0), 0)
        : (explicitFeesSum > 0
            ? explicitFeesSum
            : (oldRatesSum > 0 && Number(current.res.totalAmount) > oldRatesSum + 0.05 && !current.res.earlyCheckout
                ? Math.round((Number(current.res.totalAmount) - oldRatesSum) * 100) / 100
                : 0));

      let updatedDailyRates: any = undefined;
      if (Array.isArray(current.res.dailyRates) && current.res.dailyRates.length > 0) {
        const avgExistingRate = Math.round((oldRatesSum / current.res.dailyRates.length) * 100) / 100;
        const defaultDragRate = avgExistingRate > 0 ? avgExistingRate : (Number(current.res.dailyRate) || 250);
        if (current.mode === "move" && originNights === targetNights && current.res.dailyRates.length === targetNights) {
          const d1 = parseISO(current.currentCheckin);
          updatedDailyRates = current.res.dailyRates.map((d: any, idx: number) => {
            const rawR = d.rate !== undefined && d.rate !== null ? Number(d.rate) : Number(d.amount);
            return {
              date: format(addDays(d1, idx), "yyyy-MM-dd"),
              rate: !isNaN(rawR) && rawR >= 0 ? rawR : defaultDragRate,
              channel: d.channel || current.res.channel || "whatsapp",
              notes: d.notes
            };
          });
        } else {
          const resChanLow = String(current.res.channel || "").toLowerCase();
          const dragFallbackChan =
            targetNights > originNights && (resChanLow.includes("booking") || resChanLow.includes("airbnb"))
              ? "whatsapp"
              : (current.res.channel || "whatsapp");
          updatedDailyRates = buildReservationDailyRates(
            current.currentCheckin,
            current.currentCheckout,
            defaultDragRate,
            dragFallbackChan,
            current.res.dailyRates
          );
        }
      } else if (originNights !== targetNights) {
        const netTotalForDaily = Math.max(0, (Number(current.res.totalAmount) || 0) - existingChargesSum);
        const inferredRate = Number(current.res.dailyRate) > 0
          ? Number(current.res.dailyRate)
          : (originNights > 0 && netTotalForDaily > 0
            ? Math.round((netTotalForDaily / originNights) * 100) / 100
            : 250);
        const resChanLow = String(current.res.channel || "").toLowerCase();
        const isOriginOta = resChanLow.includes("booking") || resChanLow.includes("airbnb");
        const synthOriginRates = isOriginOta && targetNights > originNights
          ? buildReservationDailyRates(
              current.originCheckin,
              current.originCheckout,
              inferredRate,
              current.res.channel || "whatsapp",
              []
            )
          : [];
        updatedDailyRates = buildReservationDailyRates(
          current.currentCheckin,
          current.currentCheckout,
          inferredRate,
          isOriginOta && targetNights > originNights ? "whatsapp" : (current.res.channel || "whatsapp"),
          synthOriginRates
        );
      }

      const calculatedTotal = updatedDailyRates
        ? Math.round((updatedDailyRates.reduce((acc: number, d: any) => acc + (Number(d.rate) || 0), 0) + existingChargesSum) * 100) / 100
        : (Number(current.res.totalAmount) || 0);

      const payload: any = {
        flatId: current.currentFlatId,
        checkinDate: current.currentCheckin,
        checkoutDate: current.currentCheckout,
        checkinTime: current.res.checkinTime || defaultCheckinTime || "14:00",
        checkoutTime: current.res.checkoutTime || defaultCheckoutTime || "12:00",
        source: current.mode === "move" ? "PMS Calendário (Arrastar & Soltar)" : "PMS Calendário (Ajuste de Diárias)"
      };

      if (updatedDailyRates) {
        payload.dailyRates = updatedDailyRates;
        payload.totalAmount = calculatedTotal;
      }

      const dragResChanLower = String(current.res.channel || "").toLowerCase();
      const isDragResB2bOrFat = Boolean(
        dragResChanLower.includes("b2b") ||
        current.res.b2bReservationNumber ||
        current.res.isFaturadoBoleto ||
        current.res.paymentMethod === "boleto" ||
        current.res.paymentMethod === "boleto_faturado" ||
        current.res.paymentMethod === "faturado_pj" ||
        current.res.paymentMethod === "faturado_b2b" ||
        current.res.b2bPaymentType === "FATURADO"
      );
      const isDragOriginOta = dragResChanLower.includes("booking") || dragResChanLower.includes("airbnb");
      const originEffectivePaid = (current.res.paymentStatus === "pago_total" || current.res.paymentStatus === "pago" || isDragOriginOta)
        ? Math.max(Number(current.res.paidAmount) || 0, Number(current.res.totalAmount) || 0)
        : (Number(current.res.paidAmount) || 0);
      const extraPendingDragAmt = Math.max(0, Math.round((calculatedTotal - originEffectivePaid) * 100) / 100);
      const isUnpaidDirectExtension = Boolean(
        current.mode !== "move" &&
        targetNights > originNights &&
        current.res.status !== "pre_reserva" &&
        !isDragResB2bOrFat &&
        extraPendingDragAmt > 0.01
      );
      const firstAddedDragDate = current.currentCheckin < current.originCheckin
        ? current.currentCheckin
        : current.originCheckout;
      const defaultDragExtPreset = getDefaultHoldPresetForExtension(firstAddedDragDate);

      const optimisticReservation = {
        ...current.res,
        flatId: current.currentFlatId,
        flatNumber: current.currentFlatNumber,
        checkinDate: current.currentCheckin,
        checkoutDate: current.currentCheckout,
        checkinTime: current.res.checkinTime || defaultCheckinTime || "14:00",
        checkoutTime: current.res.checkoutTime || defaultCheckoutTime || "12:00",
        ...(updatedDailyRates ? {
          dailyRates: updatedDailyRates,
          totalAmount: calculatedTotal
        } : {})
      };

      // Abre diálogo de confirmação seguro antes de aplicar a alteração
      setDragConfirmData({
        isOpen: true,
        res: current.res,
        mode: current.mode,
        originFlatNumber: current.originFlatNumber,
        targetFlatNumber: current.currentFlatNumber,
        originCheckin: current.originCheckin,
        targetCheckin: current.currentCheckin,
        originCheckout: current.originCheckout,
        targetCheckout: current.currentCheckout,
        originNights,
        targetNights,
        originTotal: Number(current.res.totalAmount) || 0,
        targetTotal: calculatedTotal,
        payload,
        optimisticReservation,
        isUnpaidDirectExtension,
        addedNightsCount: Math.max(0, targetNights - originNights),
        extraPendingAmount: extraPendingDragAmt,
        firstAddedDate: firstAddedDragDate,
        extensionHoldMode: "pre_reserva",
        extensionHoldPreset: defaultDragExtPreset
      });

      setResDragState(null);
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

  // ── MOTOR GANTT PARA BLOQUEIOS: REDIMENSIONAR E MOVER BLOQUEIOS DE FLAT ──
  interface BlockDragState {
    block: any;
    originFlatId: number;
    originFlatNumber: string;
    originStartDate: string;
    originEndDate: string;
    daysCount: number;
    mode: "move" | "resize-left" | "resize-right";
    startPointerX: number;
    startPointerY: number;
    pointerType: "mouse" | "touch" | "pen";
    hasMoved: boolean;
    isLongPressReady?: boolean;
    initialGrabDayOffset: number;
    currentFlatId: number;
    currentFlatNumber: string;
    currentStartDate: string;
    currentEndDate: string;
  }

  const [blockDragState, setBlockDragState] = useState<BlockDragState | null>(null);
  const blockDragStateRef = useRef<BlockDragState | null>(null);
  blockDragStateRef.current = blockDragState;
  const [longPressActiveBlockId, setLongPressActiveBlockId] = useState<number | string | null>(null);
  const blockLongPressTimerRef = useRef<any>(null);

  const handleStartBlockDrag = (
    blockItem: any,
    flat: any,
    mode: "move" | "resize-left" | "resize-right",
    e: React.PointerEvent | React.MouseEvent
  ) => {
    if ((e as React.MouseEvent).button !== undefined && (e as React.MouseEvent).button !== 0) return;

    if (blockLongPressTimerRef.current) {
      clearTimeout(blockLongPressTimerRef.current);
      blockLongPressTimerRef.current = null;
    }

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

    if (!isTouch) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }

    const daysCount = Math.max(1, (differenceInDays(parseISO(blockItem.endDate), parseISO(blockItem.startDate)) || 0) + 1);
    const isResize = mode === "resize-left" || mode === "resize-right";

    let initialGrabDayOffset = 0;
    if (mode === "move") {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      let clickedDayStr: string | null = cell ? cell.getAttribute("data-day-str") : null;
      if (!clickedDayStr && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const cRect = container.getBoundingClientRect();
        const timelineX = e.clientX - cRect.left + container.scrollLeft;
        for (let i = 0; i < daysInView.length; i++) {
          const dStr = format(daysInView[i], "yyyy-MM-dd");
          const layout = dayLayoutMap[dStr];
          if (layout && timelineX >= layout.left && timelineX < layout.left + layout.width) {
            clickedDayStr = dStr;
            break;
          }
        }
      }
      if (clickedDayStr) {
        try {
          const startD = parseISO(blockItem.startDate);
          const clickedD = parseISO(clickedDayStr);
          const rawOffset = differenceInCalendarDays(clickedD, startD);
          initialGrabDayOffset = Math.max(0, Math.min(daysCount - 1, isNaN(rawOffset) ? 0 : rawOffset));
        } catch (_) {
          initialGrabDayOffset = 0;
        }
      }
    }

    const initialState: BlockDragState = {
      block: blockItem,
      originFlatId: flat.id,
      originFlatNumber: flat.number,
      originStartDate: blockItem.startDate,
      originEndDate: blockItem.endDate,
      daysCount,
      mode,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      pointerType,
      hasMoved: false,
      isLongPressReady: !isTouch || isResize,
      initialGrabDayOffset,
      currentFlatId: flat.id,
      currentFlatNumber: flat.number,
      currentStartDate: blockItem.startDate,
      currentEndDate: blockItem.endDate
    };

    setBlockDragState(initialState);
    blockDragStateRef.current = initialState;

    if (isResize) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "hidden";
        scrollContainerRef.current.style.touchAction = "none";
      }
      setLongPressActiveBlockId(blockItem.id);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(35);
        } catch (_) {}
      }
    } else if (isTouch) {
      blockLongPressTimerRef.current = setTimeout(() => {
        if (blockDragStateRef.current) {
          blockDragStateRef.current.isLongPressReady = true;
          blockDragStateRef.current.mode = "move";
        }
        if (scrollContainerRef.current) {
          scrollContainerRef.current.style.overflowX = "hidden";
          scrollContainerRef.current.style.touchAction = "none";
        }
        setLongPressActiveBlockId(blockItem.id);
        setBlockDragState(prev => {
          if (!prev || prev.block.id !== blockItem.id) return prev;
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
    if (!blockDragState) return;

    const resolveBlockTargetFromCoords = (clientX: number, clientY: number): { flatId: number; flatNum: string; dayStr: string } | null => {
      const current = blockDragStateRef.current;
      if (!current) return null;

      let foundFlatId: number | null = null;
      let foundDayStr: string | null = null;

      const cell = getCellFromPoint(clientX, clientY);
      if (cell) {
        const fId = Number(cell.getAttribute("data-flat-id"));
        const dStr = cell.getAttribute("data-day-str");
        if (fId && dStr) {
          foundFlatId = fId;
          foundDayStr = dStr;
        }
      }

      if ((!foundFlatId || !foundDayStr) && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const cRect = container.getBoundingClientRect();

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
      const finalDayStr = foundDayStr || current.currentStartDate;
      const targetFlat = data.flats.find(f => f.id === finalFlatId);
      const targetFlatNum = targetFlat?.number || String(finalFlatId);

      return { flatId: finalFlatId, flatNum: targetFlatNum, dayStr: finalDayStr };
    };

    const processBlockDragMove = (clientX: number, clientY: number) => {
      const current = blockDragStateRef.current;
      if (!current) return;

      const dx = Math.abs(clientX - current.startPointerX);
      const dy = Math.abs(clientY - current.startPointerY);

      if (current.pointerType === "touch" && !current.isLongPressReady) {
        if (dx > 25 || dy > 25) {
          if (blockLongPressTimerRef.current) {
            clearTimeout(blockLongPressTimerRef.current);
            blockLongPressTimerRef.current = null;
          }
          if (scrollContainerRef.current) {
            scrollContainerRef.current.style.overflowX = "";
            scrollContainerRef.current.style.touchAction = "";
          }
          setLongPressActiveBlockId(null);
          setBlockDragState(null);
        }
        return;
      }

      const moveThreshold = current.pointerType === "touch" ? 18 : 10;
      if (!current.hasMoved) {
        if (dx > moveThreshold || dy > moveThreshold) {
          current.hasMoved = true;
        } else {
          return;
        }
      }

      if (scrollContainerRef.current) {
        const edgeZone = 60;
        if (clientX > window.innerWidth - edgeZone) {
          scrollContainerRef.current.scrollLeft += 12;
        } else if (clientX < edgeZone + 50) {
          scrollContainerRef.current.scrollLeft -= 12;
        }
      }

      const target = resolveBlockTargetFromCoords(clientX, clientY);
      if (!target) return;

      setBlockDragState(prev => {
        if (!prev) return null;
        let newStartDate = prev.currentStartDate;
        let newEndDate = prev.currentEndDate;

        if (prev.mode === "move") {
          const grabOffset = prev.initialGrabDayOffset || 0;
          newStartDate = format(subDays(parseISO(target.dayStr), grabOffset), "yyyy-MM-dd");
          newEndDate = format(addDays(parseISO(newStartDate), Math.max(0, prev.daysCount - 1)), "yyyy-MM-dd");
        } else if (prev.mode === "resize-left") {
          newStartDate = target.dayStr <= prev.originEndDate ? target.dayStr : prev.originEndDate;
          newEndDate = prev.originEndDate;
        } else if (prev.mode === "resize-right") {
          newStartDate = prev.originStartDate;
          newEndDate = target.dayStr >= prev.originStartDate ? target.dayStr : prev.originStartDate;
        }

        const actualFlatId = prev.mode === "move" ? target.flatId : prev.originFlatId;
        const actualFlatNum = prev.mode === "move" ? target.flatNum : prev.originFlatNumber;

        const updated: BlockDragState = {
          ...prev,
          hasMoved: true,
          currentFlatId: actualFlatId,
          currentFlatNumber: actualFlatNum,
          currentStartDate: newStartDate,
          currentEndDate: newEndDate
        };
        blockDragStateRef.current = updated;
        return updated;
      });
    };

    const finishBlockDrag = async () => {
      if (blockLongPressTimerRef.current) {
        clearTimeout(blockLongPressTimerRef.current);
        blockLongPressTimerRef.current = null;
      }
      setLongPressActiveBlockId(null);

      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }

      const current = blockDragStateRef.current;
      if (!current) return;

      if (!current.hasMoved) {
        if (current.isLongPressReady && current.pointerType === "touch" && current.mode === "move") {
          setBlockDragState(null);
          return;
        }
        const originFlat = data.flats.find(f => f.id === current.originFlatId) || { id: current.originFlatId, number: current.originFlatNumber };
        handleOpenBlockDetails(current.block, originFlat);
        setBlockDragState(null);
        return;
      }

      if (current.pointerType === "touch" && current.mode === "move" && !current.isLongPressReady) {
        setBlockDragState(null);
        return;
      }

      const changed = (
        current.currentFlatId !== current.originFlatId ||
        current.currentStartDate !== current.originStartDate ||
        current.currentEndDate !== current.originEndDate
      );

      if (!changed) {
        setBlockDragState(null);
        return;
      }

      // Verifica se há reserva ativa no período para alertar/confirmar
      const overlappingRes = data.reservations.find(r => {
        if (r.status === "cancelada") return false;
        const sameFlat = r.flatId === current.currentFlatId || String(r.flatNumber) === String(current.currentFlatNumber);
        if (!sameFlat) return false;
        return r.checkinDate <= current.currentEndDate && r.checkoutDate > current.currentStartDate;
      });

      if (overlappingRes) {
        const proceed = window.confirm(
          `⚠️ Atenção: O Apt ${current.currentFlatNumber} possui a reserva de "${overlappingRes.guestName}" (${format(parseISO(overlappingRes.checkinDate), "dd/MM")} a ${format(parseISO(overlappingRes.checkoutDate), "dd/MM")}) neste período.\n\nDeseja aplicar o bloqueio neste período mesmo assim?`
        );
        if (!proceed) {
          setBlockDragState(null);
          return;
        }
      }

      const targetDays = Math.max(1, (differenceInDays(parseISO(current.currentEndDate), parseISO(current.currentStartDate)) || 0) + 1);
      const optimisticBlock = {
        ...current.block,
        flatId: current.currentFlatId,
        flatNumber: current.currentFlatNumber,
        startDate: current.currentStartDate,
        endDate: current.currentEndDate
      };

      setBlockDragState(null);

      try {
        setData(prev => ({
          ...prev,
          blocks: prev.blocks.map(b => String(b.id) === String(current.block.id) ? optimisticBlock : b)
        }));

        const resp = await fetch(`/api/pms/blocks/${encodeURIComponent(String(current.block.id))}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flatId: current.currentFlatId,
            startDate: current.currentStartDate,
            endDate: current.currentEndDate,
            reason: current.block.reason,
            notes: current.block.notes
          }),
          credentials: "include"
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Falha ao atualizar bloqueio.");
        }

        toast({
          title: "Bloqueio atualizado!",
          description: `Apt ${current.currentFlatNumber}: ${format(parseISO(current.currentStartDate), "dd/MM")} até ${format(parseISO(current.currentEndDate), "dd/MM")} (${targetDays} ${targetDays === 1 ? "dia" : "dias"}).`
        });

        fetchData(false);
        notifyCalendarUpdated();
      } catch (err: any) {
        console.error("Erro ao atualizar bloqueio:", err);
        toast({
          title: "Erro ao atualizar bloqueio",
          description: err.message || "Não foi possível salvar a alteração do bloqueio.",
          variant: "destructive"
        });
        fetchData(false);
      }
    };

    const onPointerMove = (e: MouseEvent | PointerEvent) => {
      if ((e as any).pointerType === "touch") return;
      const current = blockDragStateRef.current;
      if (!current) return;
      if (e.cancelable) e.preventDefault();
      processBlockDragMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      const current = blockDragStateRef.current;
      if (!current) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (current.isLongPressReady || current.hasMoved) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
      processBlockDragMove(touch.clientX, touch.clientY);
    };

    const onPointerUp = (e: MouseEvent | PointerEvent) => {
      if ((e as any).pointerType === "touch") return;
      finishBlockDrag();
    };

    const onTouchEnd = () => {
      finishBlockDrag();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if ((e as any).pointerType === "touch") return;
      const current = blockDragStateRef.current;
      if (current && (current.isLongPressReady || current.hasMoved)) return;
      if (blockLongPressTimerRef.current) {
        clearTimeout(blockLongPressTimerRef.current);
        blockLongPressTimerRef.current = null;
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }
      setLongPressActiveBlockId(null);
      setBlockDragState(null);
    };

    const onTouchCancel = () => {
      const current = blockDragStateRef.current;
      if (current && (current.isLongPressReady || current.hasMoved)) return;
      if (blockLongPressTimerRef.current) {
        clearTimeout(blockLongPressTimerRef.current);
        blockLongPressTimerRef.current = null;
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflowX = "";
        scrollContainerRef.current.style.touchAction = "";
      }
      setLongPressActiveBlockId(null);
      setBlockDragState(null);
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
      if (blockLongPressTimerRef.current) {
        clearTimeout(blockLongPressTimerRef.current);
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
  }, [blockDragState, data]);

  // Block Details, Editing and Removal State
  const [selectedBlockForDetails, setSelectedBlockForDetails] = useState<any>(null)
  const [blockDetailsModalOpen, setBlockDetailsModalOpen] = useState(false)
  const [deletingBlock, setDeletingBlock] = useState(false)
  const [savingBlockEdit, setSavingBlockEdit] = useState(false)
  const [editBlockStart, setEditBlockStart] = useState("")
  const [editBlockEnd, setEditBlockEnd] = useState("")
  const [editBlockReason, setEditBlockReason] = useState("manutencao")
  const [editBlockNotes, setEditBlockNotes] = useState("")

  const handleOpenBlockDetails = (blockItem: any, flat: any) => {
    setSelectedBlockForDetails({ ...blockItem, flatNumber: flat.number, flatId: flat.id })
    setEditBlockStart(blockItem.startDate || "")
    setEditBlockEnd(blockItem.endDate || "")
    setEditBlockReason(blockItem.reason || "manutencao")
    setEditBlockNotes(blockItem.notes || "")
    setBlockDetailsModalOpen(true)
  }

  const handleSaveBlockDetailsEdit = async () => {
    if (!selectedBlockForDetails || !editBlockStart || !editBlockEnd) return
    setSavingBlockEdit(true)
    try {
      const normalizedStart = editBlockStart <= editBlockEnd ? editBlockStart : editBlockEnd
      const normalizedEnd = editBlockStart <= editBlockEnd ? editBlockEnd : editBlockStart
      const res = await fetch(`/api/pms/blocks/${encodeURIComponent(String(selectedBlockForDetails.id))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatId: selectedBlockForDetails.flatId,
          startDate: normalizedStart,
          endDate: normalizedEnd,
          reason: editBlockReason,
          notes: editBlockNotes
        }),
        credentials: "include"
      })
      if (res.ok) {
        toast({
          title: "Bloqueio atualizado!",
          description: `Apt ${selectedBlockForDetails.flatNumber}: ${format(parseISO(normalizedStart), "dd/MM")} até ${format(parseISO(normalizedEnd), "dd/MM")}.`
        })
        setBlockDetailsModalOpen(false)
        setSelectedBlockForDetails(null)
        fetchData(false)
        notifyCalendarUpdated()
      }
    } catch (e) {
      console.error("Erro ao atualizar bloqueio:", e)
    } finally {
      setSavingBlockEdit(false)
    }
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


  // Timeline Contínua Multi-Mês com Rolagem Infinita (desativada quando modalOnly para evitar overhead pesado)
  const [timelineStart, setTimelineStart] = useState<Date>(() =>
    modalOnly ? new Date() : startOfMonth(subMonths(new Date(), 4))
  )
  const [timelineEnd, setTimelineEnd] = useState<Date>(() =>
    modalOnly ? new Date() : endOfMonth(addMonths(new Date(), 6))
  )
  const timelineBoundsRef = useRef<{ start: Date; end: Date }>({
    start: timelineStart,
    end: timelineEnd
  })
  timelineBoundsRef.current = { start: timelineStart, end: timelineEnd }

  const pendingScrollLeftDeltaRef = useRef<number>(0)
  const pendingTargetScrollRef = useRef<{ dateStr: string; behavior: "auto" | "smooth" } | null>(null)
  const isProgrammaticScrollRef = useRef<boolean>(false)
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isExpandingEdgeRef = useRef<boolean>(false)
  const hasInitialScrolledRef = useRef<boolean>(false)
  const [monthPickerOpen, setMonthPickerOpen] = useState<boolean>(false)
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear())
  const [todayPulseActive, setTodayPulseActive] = useState<boolean>(false)

  const daysInView = useMemo(() => {
    if (modalOnly) return []
    return eachDayOfInterval({ start: timelineStart, end: timelineEnd })
  }, [modalOnly, timelineStart, timelineEnd])

  // Configuração de larguras das colunas da agenda
  const EXPANDED_COL_WIDTH = 100 // Coluna de 100px no dia atual e dia anterior
  const NORMAL_COL_WIDTH = 48    // Largura padrão dos demais dias
  const FLAT_COL_WIDTH = 145     // Largura da coluna fixa de apartamentos

  const getDayColWidth = (day: Date) => (isToday(day) || isYesterday(day) ? EXPANDED_COL_WIDTH : NORMAL_COL_WIDTH)
  const gridTemplateColumns = useMemo(() => {
    if (modalOnly || daysInView.length === 0) return ""
    return `${FLAT_COL_WIDTH}px ${daysInView.map(day => `${getDayColWidth(day)}px`).join(" ")}`
  }, [modalOnly, daysInView])
  const totalGridMinWidth = useMemo(() => {
    if (modalOnly || daysInView.length === 0) return 0
    return FLAT_COL_WIDTH + daysInView.reduce((acc, day) => acc + getDayColWidth(day), 0)
  }, [modalOnly, daysInView])

  const timelineStartStr = modalOnly || daysInView.length === 0 ? "" : format(daysInView[0], "yyyy-MM-dd")
  const timelineEndStr = modalOnly || daysInView.length === 0 ? "" : format(daysInView[daysInView.length - 1], "yyyy-MM-dd")

  // Mapa cumulativo de posições horizontais (left e width) de cada dia na linha
  const dayLayoutMap = useMemo(() => {
    if (modalOnly || daysInView.length === 0) return {}
    const map: Record<string, { left: number; width: number; idx: number }> = {}
    let currentLeft = FLAT_COL_WIDTH
    daysInView.forEach((day, idx) => {
      const dayStr = format(day, "yyyy-MM-dd")
      const width = getDayColWidth(day)
      map[dayStr] = { left: currentLeft, width, idx }
      currentLeft += width
    })
    return map
  }, [modalOnly, daysInView])

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

  const fetchAgencies = async () => {
    try {
      const res = await fetch("/api/agencies", { credentials: "include" })
      const json = await res.json()
      if (Array.isArray(json)) setAgencies(json)
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
  const pendingFetchRef = useRef(false);
  const lastAuxFetchRef = useRef(0);

  const fetchData = async (showLoading = false) => {
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    isFetchingRef.current = true;
    if (showLoading) setLoading(true);
    else setIsSyncing(true);

    try {
      const activeStart = timelineBoundsRef.current.start;
      const activeEnd = timelineBoundsRef.current.end;
      const startStr = format(subDays(activeStart, 5), "yyyy-MM-dd");
      const endStr = format(addDays(activeEnd, 5), "yyyy-MM-dd");
      const res = await fetch(`/api/pms/calendar?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`, { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (Array.isArray(json.agencies)) setAgencies(json.agencies);
        if (Array.isArray(json.companies)) setCompanies(json.companies);
        if (json.settings?.checkinTime) setDefaultCheckinTime(json.settings.checkinTime);
        if (json.settings?.checkoutTime) setDefaultCheckoutTime(json.settings.checkoutTime);
      }

      // Atualiza pedidos de café da manhã e dados auxiliares a cada 30s ou no carregamento inicial
      const now = Date.now();
      if (showLoading || now - lastAuxFetchRef.current > 30000) {
        lastAuxFetchRef.current = now;
        fetchCompanies();
        fetchAgencies();
        fetchCrmGuests();
        fetchPaymentMethods();

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

          // Prefetch Quarto da Vez (sugestão de equilíbrio) para hoje apenas se nenhum modal estiver aberto
          if (!isAnyModalOpenRef.current) {
            fetchFairShare(todayStr, tomorrowStr);
          }
        } catch {}
      }
    } catch (err) {
      console.error("Erro ao sincronizar dados do calendário:", err);
    } finally {
      if (showLoading) setLoading(false);
      else setIsSyncing(false);
      isFetchingRef.current = false;
      if (pendingFetchRef.current) {
        pendingFetchRef.current = false;
        fetchData(false);
      }
    }
  };

  useEffect(() => {
    if (modalOnly) {
      if (autoOpenNewRes) {
        handleOpenNewResRef.current();
        fetchData(false);
      } else if (resModalOpen) {
        fetchData(false);
      }
      return;
    }
    fetchData(true);
  }, [modalOnly, autoOpenNewRes]);

  useEffect(() => {
    if (modalOnly || loading) return;
    fetchData(false);
  }, [timelineStart, timelineEnd, modalOnly]);

  const handleConfirmDragMove = async () => {
    if (!dragConfirmData) return;
    const { res, payload: rawPayload, optimisticReservation: rawOptimistic, isUnpaidDirectExtension, extensionHoldMode, extensionHoldPreset } = dragConfirmData;
    const chosenMode = extensionHoldMode || "pre_reserva";
    const presetCalc = isUnpaidDirectExtension && chosenMode === "pre_reserva"
      ? computeHoldExpirationInfoForPreset(extensionHoldPreset || "30m")
      : null;
    const payload = isUnpaidDirectExtension
      ? {
          ...rawPayload,
          extensionHoldMode: chosenMode,
          ...(presetCalc
            ? {
                holdPreset: presetCalc.holdPreset,
                holdDurationMinutes: presetCalc.holdDurationMinutes,
                holdDurationLabel: presetCalc.holdDurationLabel,
                expiresAt: presetCalc.expiresAt,
                sendExpirationReminder: true
              }
            : {})
        }
      : rawPayload;
    const optimisticReservation = presetCalc
      ? {
          ...rawOptimistic,
          pendingStayExtension: {
            ...(rawOptimistic.pendingStayExtension || {}),
            isPreReservationHold: true,
            status: "pending_payment",
            amount: dragConfirmData.extraPendingAmount || 0,
            extraNights: dragConfirmData.addedNightsCount || 1,
            oldCheckinDate: dragConfirmData.originCheckin,
            oldCheckoutDate: dragConfirmData.originCheckout,
            newCheckoutDate: dragConfirmData.targetCheckout,
            expiresAt: presetCalc.expiresAt,
            holdPreset: presetCalc.holdPreset,
            holdDurationMinutes: presetCalc.holdDurationMinutes,
            holdDurationLabel: presetCalc.holdDurationLabel
          }
        }
      : rawOptimistic;
    setDragConfirmData(null);

    try {
      // Atualização otimista imediata na interface
      setData(prev => ({
        ...prev,
        reservations: prev.reservations.map(r => r.id === res.id ? optimisticReservation : r)
      }));

      toast({
        title: "Atualizando reserva...",
        description: `Salvando alterações para ${res.guestName}...`
      });

      let resp = await fetch(`/api/pms/reservations/${res.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      if (resp.status === 409) {
        const errJson = await resp.json().catch(() => ({}));
        const shouldForce = window.confirm(
          `${errJson.error || "Conflito de Overbooking detectado neste flat!"}\n\nDeseja FORÇAR o encaixe (Overbooking) neste flat e notificar a gestão imediatamente?`
        );
        if (!shouldForce) {
          fetchData(false);
          return;
        }
        resp = await fetch(`/api/pms/reservations/${res.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, forceOverbooking: true }),
          credentials: "include"
        });
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao salvar reserva.");
      }

      toast({
        title: "Reserva atualizada com sucesso!",
        description: `${res.guestName}: Flat ${optimisticReservation.flatNumber} (${format(parseISO(optimisticReservation.checkinDate), "dd/MM")} a ${format(parseISO(optimisticReservation.checkoutDate), "dd/MM")}).`
      });

      fetchData(false);
      notifyCalendarUpdated();
    } catch (err: any) {
      console.error("Erro ao salvar alteração de arraste da reserva:", err);
      toast({
        title: "Erro ao atualizar reserva",
        description: err.message || "Não foi possível salvar a alteração.",
        variant: "destructive"
      });
      fetchData(false);
    }
  };

  const handleCancelDragMove = () => {
    setDragConfirmData(null);
  };

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

  // Compensação síncrona de scrollLeft ao expandir meses para trás (esquerda) sem pulo visual
  useLayoutEffect(() => {
    if (pendingScrollLeftDeltaRef.current !== 0 && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const delta = pendingScrollLeftDeltaRef.current
      pendingScrollLeftDeltaRef.current = 0
      const prevBehavior = container.style.scrollBehavior
      container.style.scrollBehavior = "auto"
      container.scrollLeft += delta
      container.style.scrollBehavior = prevBehavior
    }
    isExpandingEdgeRef.current = false
  }, [timelineStart, timelineEnd])

  // Executa rolagem pendente assim que um mês recém-expandido entra no dayLayoutMap
  useLayoutEffect(() => {
    const pending = pendingTargetScrollRef.current
    if (!pending || !scrollContainerRef.current) return
    const layout = dayLayoutMap[pending.dateStr]
    if (layout) {
      pendingTargetScrollRef.current = null
      pendingScrollLeftDeltaRef.current = 0
      const leftPos = Math.max(0, layout.left - FLAT_COL_WIDTH)
      const container = scrollContainerRef.current
      if (pending.behavior === "auto") {
        const prevBehavior = container.style.scrollBehavior
        container.style.scrollBehavior = "auto"
        container.scrollLeft = leftPos
        container.style.scrollBehavior = prevBehavior
      } else {
        container.scrollTo({ left: leftPos, behavior: "smooth" })
      }
    }
  }, [dayLayoutMap])

  const markProgrammaticScroll = useCallback((durationMs = 650) => {
    isProgrammaticScrollRef.current = true
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current)
    }
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, durationMs)
  }, [])

  const scrollToDate = useCallback((targetDate: Date, behavior: "auto" | "smooth" = "smooth") => {
    const targetDateStr = format(targetDate, "yyyy-MM-dd")
    const minRequiredStart = startOfMonth(subMonths(targetDate, 1))
    const minRequiredEnd = endOfMonth(addMonths(targetDate, 2))
    const curStart = timelineBoundsRef.current.start
    const curEnd = timelineBoundsRef.current.end

    let needsExpansion = false
    if (minRequiredStart < curStart) {
      const nextStart = startOfMonth(subMonths(targetDate, 2))
      timelineBoundsRef.current.start = nextStart
      setTimelineStart(nextStart)
      needsExpansion = true
    }
    if (minRequiredEnd > curEnd) {
      const nextEnd = endOfMonth(addMonths(targetDate, 3))
      timelineBoundsRef.current.end = nextEnd
      setTimelineEnd(nextEnd)
      needsExpansion = true
    }

    markProgrammaticScroll(behavior === "smooth" ? 700 : 150)

    if (needsExpansion || !dayLayoutMap[targetDateStr]) {
      pendingTargetScrollRef.current = { dateStr: targetDateStr, behavior }
      return
    }

    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const layout = dayLayoutMap[targetDateStr]
      const leftPos = Math.max(0, layout.left - FLAT_COL_WIDTH)
      if (behavior === "auto") {
        const prevBehavior = container.style.scrollBehavior
        container.style.scrollBehavior = "auto"
        container.scrollLeft = leftPos
        container.style.scrollBehavior = prevBehavior
      } else {
        container.scrollTo({ left: leftPos, behavior: "smooth" })
      }
    }
  }, [dayLayoutMap, markProgrammaticScroll])

  const scrollToToday = useCallback((behavior: "auto" | "smooth" = "smooth") => {
    const now = new Date()
    setCurrentDate(now)
    setPickerYear(now.getFullYear())
    setMonthPickerOpen(false)
    // Posiciona Ontem e Hoje logo à esquerda da grade (ao lado da coluna Apartamento)
    const targetDate = subDays(now, 1)
    scrollToDate(targetDate, behavior)
    if (behavior === "smooth") {
      setTodayPulseActive(true)
      setTimeout(() => setTodayPulseActive(false), 1600)
    }
  }, [scrollToDate])

  const navigateToMonth = useCallback((monthDate: Date) => {
    const firstDay = startOfMonth(monthDate)
    setCurrentDate(firstDay)
    setPickerYear(firstDay.getFullYear())
    setMonthPickerOpen(false)
    scrollToDate(firstDay, "smooth")
  }, [scrollToDate])

  const handlePrevMonth = useCallback(() => {
    setCurrentDate(prev => {
      const target = startOfMonth(subMonths(prev, 1))
      setPickerYear(target.getFullYear())
      setMonthPickerOpen(false)
      scrollToDate(target, "smooth")
      return target
    })
  }, [scrollToDate])

  const handleNextMonth = useCallback(() => {
    setCurrentDate(prev => {
      const target = startOfMonth(addMonths(prev, 1))
      setPickerYear(target.getFullYear())
      setMonthPickerOpen(false)
      scrollToDate(target, "smooth")
      return target
    })
  }, [scrollToDate])

  const handleTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    if (!container || daysInView.length === 0) return

    const scrollLeft = container.scrollLeft
    const clientWidth = container.clientWidth
    const scrollWidth = container.scrollWidth

    // 1. Atualiza o Mês/Ano exibido no seletor superior conforme o usuário rola manualmente
    if (!isProgrammaticScrollRef.current) {
      const probeX = scrollLeft + FLAT_COL_WIDTH + 24
      let accumX = FLAT_COL_WIDTH
      for (let i = 0; i < daysInView.length; i++) {
        const d = daysInView[i]
        const w = getDayColWidth(d)
        if (probeX >= accumX && probeX < accumX + w) {
          setCurrentDate(prev => {
            if (prev.getMonth() === d.getMonth() && prev.getFullYear() === d.getFullYear()) {
              return prev
            }
            return startOfMonth(d)
          })
          break
        }
        accumX += w
      }
    }

    // 2. Expansão infinita automática nas bordas (esquerda = passado, direita = futuro)
    if (isExpandingEdgeRef.current || resDragStateRef.current || blockDragStateRef.current) return

    if (scrollLeft < 320) {
      isExpandingEdgeRef.current = true
      const curStart = timelineBoundsRef.current.start
      const nextStart = startOfMonth(subMonths(curStart, 2))
      if (nextStart < curStart) {
        const addedDays = eachDayOfInterval({ start: nextStart, end: subDays(curStart, 1) })
        const addedWidthPx = addedDays.reduce((acc, d) => acc + getDayColWidth(d), 0)
        pendingScrollLeftDeltaRef.current += addedWidthPx
        timelineBoundsRef.current.start = nextStart
        setTimelineStart(nextStart)
      } else {
        isExpandingEdgeRef.current = false
      }
    } else if (scrollWidth - (scrollLeft + clientWidth) < 420) {
      isExpandingEdgeRef.current = true
      const curEnd = timelineBoundsRef.current.end
      const nextEnd = endOfMonth(addMonths(curEnd, 2))
      if (nextEnd > curEnd) {
        timelineBoundsRef.current.end = nextEnd
        setTimelineEnd(nextEnd)
      } else {
        isExpandingEdgeRef.current = false
      }
    }
  }, [daysInView])

  useEffect(() => {
    if (!loading && data.flats.length > 0 && !hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true
      requestAnimationFrame(() => {
        scrollToToday("auto")
      })
      setTimeout(() => {
        scrollToToday("auto")
      }, 100)
    }
  }, [loading, data.flats.length, scrollToToday])


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
    essentialConfigModalOpen ||
    expiredModalOpen
  )

  // Sincronização em tempo real entre múltiplos dispositivos (PC, Tablet, Celular)
  // Desativado completamente se modalOnly. Polling reduzido de 4s para 12s e pausado quando a aba estiver oculta.
  useEffect(() => {
    if (modalOnly) return;
    const doSilentSync = () => {
      // Se a aba estiver oculta/minimizada, não executa o poll para economizar recursos
      if (typeof document !== "undefined" && document.hidden) return;
      // Não atualiza se o usuário estiver ativamente arrastando/redimensionando reserva ou bloqueio
      if (resDragStateRef.current || blockDragStateRef.current) return;
      // Não atualiza se estiver selecionando período com arrasto
      if (isDraggingRef.current) return;
      // Não atualiza se algum modal de formulário/edição estiver aberto
      if (isAnyModalOpenRef.current) return;

      fetchData(false);
    };

    let pollIntervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
      // Reduz frequência de polling de 4s para 12s (intervalo de 10s–15s)
      pollIntervalId = setInterval(doSilentSync, 12000);
    };

    const stopPolling = () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };

    // Inicia polling caso a aba esteja visível
    if (typeof document === "undefined" || !document.hidden) {
      startPolling();
    }

    // 2. Pausa o polling quando a aba estiver oculta e retoma/sincroniza imediatamente ao focar
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.hidden) {
        stopPolling();
      } else {
        doSilentSync();
        startPolling();
      }
    };
    const handleFocus = () => {
      doSilentSync();
      startPolling();
    };
    const handlePageShow = () => {
      doSilentSync();
      startPolling();
    };

    // 3. Sincronização instantânea entre abas no mesmo computador via StorageEvent e eventos internos
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pms_calendar_sync_trigger") {
        doSilentSync();
      }
    };
    const handleCalendarUpdated = () => {
      doSilentSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("pms_calendar_updated", handleCalendarUpdated);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("pms_calendar_updated", handleCalendarUpdated);
    };
  }, [modalOnly]);

  const handleOpenNewResRange = (defaultFlatId: number, startDate: Date, endDate: Date, initialChannel: string = "whatsapp") => {
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
    setFormRequesterType(initialChannel === "b2b" ? "agency_b2b" : "guest")
    setFormRequesterName("")
    setFormRequesterPhone("")
    setFormRequesterEmail("")
    setFormRequesterCpf("")
    setFormRequesterId("")
    setRequesterSearchFilter("")
    setShowRequesterSuggestions(false)
    setFormCompanyId("")
    setFormCompanyName("")
    setFormAgencyId("")
    setFormAgencyName("")
    setFormAgencyCnpj("")
    setFormAgencyPosUnit("")
    setFormAgencyAgentName("")
    setFormAgencyAgentEmail("")
    setFormAgencyAgentPhone("")
    setFormCostCenter("")
    setFormB2bReservationNumber("")
    setFormB2bLocatorRloc("")
    setFormB2bOriginType("BOOKING_WS")
    setFormB2bRatePolicy("COMISSIONADA")
    setFormB2bCommissionPct("12")
    setFormB2bPaymentType("VIRTUAL_CARD")
    setFormB2bCardBrand("MASTERCARD")
    setFormB2bCardMasked("")
    setFormB2bVcnToken("")
    setFormB2bConciliationUrl("https://conciliacao.b2breservas.com.br")
    setFormB2bAuthorizedExpenses("Apenas Diárias")
    setFormInvoiceRecipientType(initialChannel === "b2b" ? "agency" : "guest")
    setFormNfDeliveryEmails("")
    setFormNfHideFromGuest(initialChannel === "b2b")
    setFormInvoicingInstructions("")
    setFormVoucherUrl("")
    setShowVoucherParser(false)
    setVoucherTextToParse("")
    setNewAgencyInlineOpen(false)
    setFormGuestId("")
    setGuestSearchFilter("")
    setFormGuestName("")
    setFormGuest1Cpf("")
    setFormGuestPhone("")
    setFormGuestEmail("")
    setFormGuest2Id("")
    setGuest2SearchFilter("")
    setShowGuest2Suggestions(false)
    setFormGuest2Name("")
    setFormGuest2Cpf("")
    setFormGuest2Phone("")
    setFormGuest2Email("")
    setFormGuest3Id("")
    setGuest3SearchFilter("")
    setShowGuest3Suggestions(false)
    setFormGuest3Name("")
    setFormGuest3Cpf("")
    setFormGuest3Phone("")
    setFormGuest3Email("")
    const isBooking = initialChannel === "booking"
    const isAirbnb = initialChannel === "airbnb"
    const isB2b = initialChannel === "b2b"
    const isOtaChannel = isBooking || isAirbnb
    setFormChannel(initialChannel)
    setFormPaymentMethod(isBooking ? "booking" : (isAirbnb ? "airbnb" : (isB2b ? "vcn_b2b" : "pix")))
    const rangeNights = Math.max(1, differenceInDays(parseISO(cout), parseISO(cin))) || 1
    const baseDailyRate = 250
    setFormDailyRate(String(baseDailyRate))
    const initialRates = buildReservationDailyRates(cin, cout, baseDailyRate, initialChannel)
    setFormDailyRates(initialRates)
    const initialCharges: ReservationChargeItem[] = isOtaChannel
      ? [{
          id: `charge_${Date.now()}_clean`,
          type: "cleaning",
          title: "Taxa de Limpeza",
          amount: 50,
          notes: ""
        }]
      : []
    setFormCharges(initialCharges)
    const subNights = initialRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
    const subCharges = initialCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
    const initialTotal = subNights + subCharges
    setFormTotalAmount(String(initialTotal))
    if (isB2b) {
      setFormPaidAmount("0")
      setFormPayments([])
      setFormPaymentStatus("pendente")
    } else {
      setFormPaidAmount(String(initialTotal)) // Pré-preenchido com o mesmo total composto!
      setFormPayments([
        {
          id: `pay_${Date.now()}`,
          amount: initialTotal,
          method: isBooking ? "booking" : (isAirbnb ? "airbnb" : "pix"),
          category: "quitacao",
          date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          notes: isBooking ? "Pagamento integral Booking.com" : (isAirbnb ? "Pagamento integral Airbnb" : "Pagamento integral")
        }
      ])
      setFormPaymentStatus("pago_total")
    }
    setFormStatus("confirmada")
    setIsReactivatingRes(false)
    setReactivationFlatSwitchedInfo(null)
    setFormHoldManuallyChosen(false)
    setFormSendExpirationReminder(true)
    setFormHoldPreset(getDefaultHoldPresetForCheckin(cin))
    setFormHoldCustomMode("duration")
    setFormHoldCustomValue("45")
    setFormHoldCustomUnit("minutes")
    setFormHoldCustomDateTime(format(addDays(new Date(), 1), "yyyy-MM-dd'T'12:00"))
    setPackageTotalInput(String(initialTotal))
    setShowGuestSuggestions(false)
    setFormNotes("")
    setFormEarlyCheckin(false)
    setFormReceptionNotes("")
    setFormVehiclePlate("")
    setFormVehicleModel("")
    setFormVehicleBrand("")
    setFormVehicleColor("")
    setFormAutoInvoice(false)
    setFormPrefersHighFloor(false)
    setFormTwinBeds(false)
    setFormExtraMattress(false)
    setFormIncludeBreakfast(false)
    setFormSpecialRequests("")
    setFormIsMonthlyGuest(false)
    setFormDocPhotoUrl("")
    setFormDocFileName("")
    setFormHasMinor(false)
    setFormIsCamposResident(false)
    setFormIsFlatLocked(false)
    setFormFlatLockReason("")
    setFormForceReplace(false)
    setMobileRangeStart(null)
    setRangePickerOpen(false)
    setPickerRangeStart(null)
    setPickerHoverDate(null)
    setPickerMonth(d1)
    setResModalTab("reservation")
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

  const handleOpenNewRes = (defaultFlatId?: number, defaultDate?: Date, initialChannel: string = "whatsapp") => {
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
      const isResultForTargetDates = fairShareResult && fairShareResult._checkin === cin && fairShareResult._checkout === cout
      const suggestedStat = isResultForTargetDates
        ? fairShareResult?.allStats?.find((s: any) => Number(s.flat?.id) === Number(fairShareResult?.bestFlatId))
        : null
      if (suggestedStat?.isAvailable && fairShareResult?.bestFlatId) {
        setFormFlatId(String(fairShareResult.bestFlatId))
      } else if (fairShareResult?.bestFlatId) {
        setFormFlatId(String(fairShareResult.bestFlatId))
      } else {
        const availFlat = data.flats.find((fl: any) => {
          const hasResConf = (data.reservations || []).some((r: any) => {
            if (Number(r.flatId) !== Number(fl.id) && String(r.flatNumber) !== String(fl.number)) return false
            const st = String(r.status || "").toLowerCase()
            if (["cancelada", "cancelled", "no_show", "expirada"].includes(st)) return false
            if ((r.checkoutDone || r.earlyCheckout || ["completed", "checked_out", "finalizada", "concluida", "checkout"].includes(st)) && r.checkoutDate <= cin) return false
            return r.checkinDate < cout && r.checkoutDate > cin
          })
          const hasBlkConf = (data.blocks || []).some((b: any) => {
            if (Number(b.flatId) !== Number(fl.id) && String(b.flatNumber) !== String(fl.number)) return false
            return b.startDate < cout && b.endDate >= cin
          })
          return !hasResConf && !hasBlkConf
        })
        const fallbackFlatId = availFlat?.id || data.flats[0]?.id || ""
        setFormFlatId(fallbackFlatId ? String(fallbackFlatId) : "")
      }
    }
    setFormCheckinTime(defaultCheckinTime || "14:00")
    setFormCheckoutTime(defaultCheckoutTime || "12:00")
    setFormGuestCount("1")
    setFormRequesterType(initialChannel === "b2b" ? "agency_b2b" : "guest")
    setFormRequesterName("")
    setFormRequesterPhone("")
    setFormRequesterEmail("")
    setFormRequesterCpf("")
    setFormRequesterId("")
    setRequesterSearchFilter("")
    setShowRequesterSuggestions(false)
    setFormCompanyId("")
    setFormCompanyName("")
    setFormAgencyId("")
    setFormAgencyName("")
    setFormAgencyCnpj("")
    setFormAgencyPosUnit("")
    setFormAgencyAgentName("")
    setFormAgencyAgentEmail("")
    setFormAgencyAgentPhone("")
    setFormCostCenter("")
    setFormB2bReservationNumber("")
    setFormB2bLocatorRloc("")
    setFormB2bOriginType("BOOKING_WS")
    setFormB2bRatePolicy("COMISSIONADA")
    setFormB2bCommissionPct("12")
    setFormB2bPaymentType("VIRTUAL_CARD")
    setFormB2bCardBrand("MASTERCARD")
    setFormB2bCardMasked("")
    setFormB2bVcnToken("")
    setFormB2bConciliationUrl("https://conciliacao.b2breservas.com.br")
    setFormB2bAuthorizedExpenses("Apenas Diárias")
    setFormInvoiceRecipientType(initialChannel === "b2b" ? "agency" : "guest")
    setFormNfDeliveryEmails("")
    setFormNfHideFromGuest(initialChannel === "b2b")
    setFormInvoicingInstructions("")
    setFormVoucherUrl("")
    setShowVoucherParser(false)
    setVoucherTextToParse("")
    setNewAgencyInlineOpen(false)
    setFormGuestId("")
    setGuestSearchFilter("")
    setFormGuestName("")
    setFormGuest1Cpf("")
    setFormGuestPhone("")
    setFormGuestEmail("")
    setFormGuest2Id("")
    setGuest2SearchFilter("")
    setShowGuest2Suggestions(false)
    setFormGuest2Name("")
    setFormGuest2Cpf("")
    setFormGuest2Phone("")
    setFormGuest2Email("")
    setFormGuest3Id("")
    setGuest3SearchFilter("")
    setShowGuest3Suggestions(false)
    setFormGuest3Name("")
    setFormGuest3Cpf("")
    setFormGuest3Phone("")
    setFormGuest3Email("")
    const isBooking = initialChannel === "booking"
    const isAirbnb = initialChannel === "airbnb"
    const isB2b = initialChannel === "b2b"
    const isOtaChannel = isBooking || isAirbnb
    setFormChannel(initialChannel)
    setFormPaymentMethod(isBooking ? "booking" : (isAirbnb ? "airbnb" : (isB2b ? "vcn_b2b" : "pix")))
    const initialNights = 1
    const baseDailyRate = 250
    setFormDailyRate(String(baseDailyRate))
    const initialRates = buildReservationDailyRates(cin, cout, baseDailyRate, initialChannel)
    setFormDailyRates(initialRates)
    const initialCharges: ReservationChargeItem[] = isOtaChannel
      ? [{
          id: `charge_${Date.now()}_clean`,
          type: "cleaning",
          title: "Taxa de Limpeza",
          amount: 50,
          notes: ""
        }]
      : []
    setFormCharges(initialCharges)
    const subNights = initialRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
    const subCharges = initialCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
    const initialTotal = subNights + subCharges
    setFormTotalAmount(String(initialTotal))
    if (isB2b) {
      setFormPaidAmount("0")
      setFormPayments([])
      setFormPaymentStatus("pendente")
    } else {
      setFormPaidAmount(String(initialTotal)) // Pré-preenchido com o mesmo total composto!
      setFormPayments([
        {
          id: `pay_${Date.now()}`,
          amount: initialTotal,
          method: isBooking ? "booking" : (isAirbnb ? "airbnb" : "pix"),
          category: "quitacao",
          date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          notes: isBooking ? "Pagamento integral Booking.com" : (isAirbnb ? "Pagamento integral Airbnb" : "Pagamento integral")
        }
      ])
      setFormPaymentStatus("pago_total")
    }
    setFormStatus("confirmada")
    setIsReactivatingRes(false)
    setReactivationFlatSwitchedInfo(null)
    setFormHoldManuallyChosen(false)
    setFormSendExpirationReminder(true)
    setFormHoldPreset(getDefaultHoldPresetForCheckin(cin))
    setFormHoldCustomMode("duration")
    setFormHoldCustomValue("45")
    setFormHoldCustomUnit("minutes")
    setFormHoldCustomDateTime(format(addDays(new Date(), 1), "yyyy-MM-dd'T'12:00"))
    setPackageTotalInput(String(initialTotal))
    setShowGuestSuggestions(false)
    setFormNotes("")
    setFormEarlyCheckin(false)
    setFormReceptionNotes("")
    setFormVehiclePlate("")
    setFormVehicleModel("")
    setFormVehicleBrand("")
    setFormVehicleColor("")
    setFormAutoInvoice(false)
    setFormPrefersHighFloor(false)
    setFormTwinBeds(false)
    setFormExtraMattress(false)
    setFormIncludeBreakfast(false)
    setFormSpecialRequests("")
    setFormIsMonthlyGuest(false)
    setFormDocPhotoUrl("")
    setFormDocFileName("")
    setFormHasMinor(false)
    setFormIsCamposResident(false)
    setFormIsFlatLocked(false)
    setFormFlatLockReason("")
    setFormForceReplace(false)
    setFormIsFaturadoBoleto(false)
    setFormBoletoTermDays(15)
    setFormBoletoCustomDueDate("")
    setFormBoletoConsumptionMode("single_boleto")
    setFormBoletoPayerType("company")
    setFormConsumptionSamePayerAndDue(true)
    setFormConsumptionPayerType("guest")
    setFormConsumptionTermDays(15)
    setFormConsumptionCustomDueDate("")
    setFormBoletoFinePct(2)
    setFormBoletoInterestPct(1)
    setFormAutoEmitBoletoOnCheckout(true)
    setFormAutoReminderEnabled(true)
    setFormFinRespName("")
    setFormFinRespEmail("")
    setFormFinRespPhone("")
    setFormFinRespDoc("")
    setFormRecGuest(false)
    setFormRecRequester(true)
    setFormRecCompany(true)
    setFormRecFinResp(true)
    setFormRecSendEmail(true)
    setFormRecSendWhatsapp(true)
    setPhoneVerification(null)
    setAuditLogs([])
    setCommunications([])
    setRangePickerOpen(false)
    setPickerRangeStart(null)
    setPickerHoverDate(null)
    setPickerMonth(defaultDate || new Date())
    setResModalTab("reservation")
    setResModalOpen(true)
  }

  const handleOpenNewResRef = useRef(handleOpenNewRes)
  handleOpenNewResRef.current = handleOpenNewRes

  useEffect(() => {
    const handleGlobalOpenNewRes = () => {
      if (modalOnly) {
        fetchData(false)
      }
      handleOpenNewResRef.current()
    }
    window.addEventListener("open-new-reservation-modal", handleGlobalOpenNewRes)
    return () => window.removeEventListener("open-new-reservation-modal", handleGlobalOpenNewRes)
  }, [modalOnly])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("gfm-res-modal-state", { detail: { open: resModalOpen } }))
  }, [resModalOpen])

  useEffect(() => {
    if (resModalOpen && !selectedRes && !formFlatId && data.flats.length > 0) {
      const cin = formCheckin || format(new Date(), "yyyy-MM-dd")
      const cout = formCheckout || format(addDays(new Date(), 1), "yyyy-MM-dd")
      const availFlat = data.flats.find((fl: any) => {
        const hasResConf = (data.reservations || []).some((r: any) => {
          if (Number(r.flatId) !== Number(fl.id) && String(r.flatNumber) !== String(fl.number)) return false
          const st = String(r.status || "").toLowerCase()
          if (["cancelada", "cancelled", "no_show", "expirada"].includes(st)) return false
          if ((r.checkoutDone || r.earlyCheckout || ["completed", "checked_out", "finalizada", "concluida", "checkout"].includes(st)) && r.checkoutDate <= cin) return false
          return r.checkinDate < cout && r.checkoutDate > cin
        })
        const hasBlkConf = (data.blocks || []).some((b: any) => {
          if (Number(b.flatId) !== Number(fl.id) && String(b.flatNumber) !== String(fl.number)) return false
          return b.startDate < cout && b.endDate >= cin
        })
        return !hasResConf && !hasBlkConf
      })
      const fallbackFlatId = fairShareResult?.bestFlatId || availFlat?.id || data.flats[0]?.id || ""
      if (fallbackFlatId) setFormFlatId(String(fallbackFlatId))
    }
  }, [resModalOpen, selectedRes, formFlatId, data.flats, data.reservations, data.blocks, fairShareResult, formCheckin, formCheckout])

  const handleOpenEditRes = (resItem: any) => {
    setSelectedRes(resItem)
    setPhoneVerification(null)
    setFormForceReplace(false)
    isFlatManuallyChangedRef.current = true
    setFormFlatId(String(resItem.flatId))
    setFormCheckin(resItem.checkinDate)
    setFormCheckout(resItem.checkoutDate)
    setFormCheckinTime(resItem.checkinTime || defaultCheckinTime || "14:00")
    setFormCheckoutTime(resItem.checkoutTime || defaultCheckoutTime || "12:00")
    setFormGuestCount(String(resItem.guestCount || resItem.adults || (resItem.guests?.length || 1)) as any)
    const isB2bRes = resItem.channel === "b2b" || Boolean(resItem.agencyId || resItem.agencyName || resItem.b2bReservationNumber || resItem.requesterType === "agency_b2b" || resItem.requesterType === "agency")
    const resolvedReqType = isB2bRes
      ? "agency_b2b"
      : ((resItem.requesterType as any) || (resItem.companyId || resItem.companyName ? "company" : (resItem.requesterInfo?.name ? "other_person" : "guest")))
    setFormRequesterType(resolvedReqType)
    setFormRequesterId(resItem.requesterInfo?.guestId ? String(resItem.requesterInfo.guestId) : (resItem.requesterInfo?.name ? "manual" : ""))
    setRequesterSearchFilter("")
    setShowRequesterSuggestions(false)
    setFormRequesterName(resItem.requesterInfo?.name || "")
    setFormRequesterPhone(resItem.requesterInfo?.phone || "")
    setFormRequesterEmail(resItem.requesterInfo?.email || "")
    setFormRequesterCpf(resItem.requesterInfo?.cpf || "")
    const cleanResCompCnpj = String(resItem.companyCnpj || "").replace(/\D/g, "")
    const matchedCompany = resItem.companyId
      ? companies.find((c: any) => String(c.id) === String(resItem.companyId))
      : companies.find((c: any) =>
          (cleanResCompCnpj && cleanResCompCnpj.length === 14 && String(c.cnpj || "").replace(/\D/g, "") === cleanResCompCnpj) ||
          (resItem.companyName && (
            String(c.corporateName || "").trim().toLowerCase() === String(resItem.companyName).trim().toLowerCase() ||
            String(c.tradeName || "").trim().toLowerCase() === String(resItem.companyName).trim().toLowerCase()
          ))
        )
    setFormCompanyId(resItem.companyId ? String(resItem.companyId) : (matchedCompany ? String(matchedCompany.id) : ""))
    setFormCompanyName(resItem.companyName || matchedCompany?.tradeName || matchedCompany?.corporateName || "")

    const cleanResAgCnpj = String(resItem.agencyCnpj || "").replace(/\D/g, "")
    const rawResAgName = String(resItem.agencyTradeName || resItem.agencyName || "").trim().toLowerCase()
    const matchedAgency = resItem.agencyId
      ? agencies.find((a: any) => String(a.id) === String(resItem.agencyId))
      : agencies.find((a: any) =>
          (cleanResAgCnpj && cleanResAgCnpj.length === 14 && String(a.cnpj || "").replace(/\D/g, "") === cleanResAgCnpj) ||
          (rawResAgName && (
            String(a.tradeName || "").trim().toLowerCase() === rawResAgName ||
            String(a.corporateName || "").trim().toLowerCase() === rawResAgName
          ))
        )
    const isPureBillingUi = (em: string) => {
      const c = String(em || "").trim().toLowerCase()
      if (!c.includes("@")) return false
      if (c.endsWith("@b2breservas.com.br")) return true
      return /^(?:conciliacao|faturamento|faturamentodpr|nf|nfe|nfse|notafiscal|notas?fiscais|nfebimbo[a-z0-9_.-]*|fiscal|financeiro|contasapagar|cobranca|envionf|envionotas|recebimentonf)(?:$|[._\-0-9])/i.test(c.split("@")[0] || "")
    }
    const safeLoadedAgEmail = matchedAgency?.email && !isPureBillingUi(matchedAgency.email) ? matchedAgency.email : ""
    setFormAgencyId(resItem.agencyId ? String(resItem.agencyId) : (matchedAgency ? String(matchedAgency.id) : ""))
    setFormAgencyName(resItem.agencyTradeName || resItem.agencyName || matchedAgency?.tradeName || matchedAgency?.corporateName || "")
    setFormAgencyCnpj(resItem.agencyCnpj || matchedAgency?.cnpj || "")
    setFormAgencyPosUnit(resItem.agencyPosUnit || matchedAgency?.posUnits?.[0]?.name || matchedAgency?.posUnits?.[0] || "")
    setFormAgencyAgentName(resItem.agencyAgentName || matchedAgency?.agents?.[0]?.name || "")
    setFormAgencyAgentEmail(resItem.agencyAgentEmail || resItem.requesterInfo?.email || safeLoadedAgEmail || "")
    setFormAgencyAgentPhone(resItem.agencyAgentPhone || matchedAgency?.phone || "")
    setFormCostCenter(resItem.costCenter || matchedCompany?.defaultCostCenter || "")
    setFormB2bReservationNumber(resItem.b2bReservationNumber || resItem.externalReservationNumber || "")
    setFormB2bLocatorRloc(resItem.b2bLocatorRloc || "")
    setFormB2bOriginType(resItem.b2bOriginType === "OTA_WS" ? "OTA_WS" : "BOOKING_WS")
    setFormB2bRatePolicy(resItem.b2bRatePolicy === "NET" ? "NET" : "COMISSIONADA")
    setFormB2bCommissionPct(resItem.b2bCommissionPct !== undefined && resItem.b2bCommissionPct !== null ? String(resItem.b2bCommissionPct) : (resItem.b2bRatePolicy === "NET" ? "0" : "12"))
    setFormB2bPaymentType(resItem.b2bPaymentType === "FATURADO" ? "FATURADO" : "VIRTUAL_CARD")
    setFormB2bCardBrand(resItem.b2bCardBrand || "MASTERCARD")
    setFormB2bCardMasked(resItem.b2bCardMasked || "")
    setFormB2bVcnToken(resItem.b2bVcnToken || "")
    setFormB2bConciliationUrl(resItem.b2bConciliationUrl || "https://conciliacao.b2breservas.com.br")
    setFormB2bAuthorizedExpenses(resItem.b2bAuthorizedExpenses || "Apenas Diárias")
    setFormInvoiceRecipientType(
      resItem.invoiceRecipientType === "company" ||
      resItem.invoiceRecipientType === "guest" ||
      resItem.invoiceRecipientType === "agency" ||
      resItem.invoiceRecipientType === "requester"
        ? resItem.invoiceRecipientType
        : (isB2bRes
            ? (resItem.b2bRatePolicy === "NET" && resItem.companyId ? "company" : "agency")
            : (resItem.requesterType === "company" && resItem.companyId ? "company" : "guest"))
    )
    setFormNfDeliveryEmails(
      Array.isArray(resItem.nfDeliveryEmails)
        ? resItem.nfDeliveryEmails.join(", ")
        : (resItem.nfDeliveryEmails || "")
    )
    setFormNfHideFromGuest(resItem.nfHideFromGuest !== undefined ? Boolean(resItem.nfHideFromGuest) : isB2bRes)
    setFormInvoicingInstructions(resItem.invoicingInstructions || "")
    setFormVoucherUrl(resItem.voucherUrl || resItem.b2bVoucherUrl || "")
    setShowVoucherParser(false)
    setVoucherTextToParse("")
    setVoucherFilePayload(null)
    setNewAgencyInlineOpen(false)
    setGuestSearchFilter("")

    const g1 = resItem.guests?.[0]
    const rawLoadedG1Name = (g1?.name || resItem.guestName || "").trim()
    const isPendingLoadedG1 = Boolean(
      (resItem as any).guestPending ||
      /^(h[óo]spede(\s*\d+|\s+a\s+definir|\s+titular|\s+b2b)?|a\s+definir.*)$/i.test(rawLoadedG1Name)
    )
    const rawLoadedG1Id = resItem.guestId || g1?.guestId
    const linkedG1Crm = rawLoadedG1Id ? crmGuests.find(cg => String(cg.id) === String(rawLoadedG1Id)) : null
    const isLinkedG1Compatible = !linkedG1Crm || areGuestNamesCompatibleUI(rawLoadedG1Name, linkedG1Crm.name || linkedG1Crm.fullName)
    setFormGuestId(rawLoadedG1Id && isLinkedG1Compatible ? String(rawLoadedG1Id) : "")
    setFormGuestName(isPendingLoadedG1 ? "" : rawLoadedG1Name)
    setFormGuest1Cpf(g1?.cpf || resItem.guestDocument || "")
    setFormGuestPhone(g1?.phone || resItem.guestPhone || "")
    setFormGuestEmail(g1?.email || resItem.guestEmail || "")

    const g2 = resItem.guests?.[1]
    const g2Name = g2?.name && !g2.name.startsWith("Hóspede") ? g2.name : ""
    const matchedG2 = g2?.guestId
      ? crmGuests.find(cg => String(cg.id) === String(g2.guestId))
      : (g2Name ? crmGuests.find(cg => (g2?.cpf && (cg.documentNumber || cg.document) === g2.cpf) || (cg.name || cg.fullName || "").toLowerCase() === g2Name.toLowerCase()) : null)
    setFormGuest2Id(matchedG2 ? String(matchedG2.id) : (g2?.guestId ? String(g2.guestId) : (g2Name ? "manual" : "")))
    setGuest2SearchFilter("")
    setShowGuest2Suggestions(false)
    setFormGuest2Name(g2Name)
    setFormGuest2Cpf(g2?.cpf || "")
    setFormGuest2Phone(g2?.phone || "")
    setFormGuest2Email(g2?.email || "")

    const g3 = resItem.guests?.[2]
    const g3Name = g3?.name && !g3.name.startsWith("Hóspede") ? g3.name : ""
    const matchedG3 = g3?.guestId
      ? crmGuests.find(cg => String(cg.id) === String(g3.guestId))
      : (g3Name ? crmGuests.find(cg => (g3?.cpf && (cg.documentNumber || cg.document) === g3.cpf) || (cg.name || cg.fullName || "").toLowerCase() === g3Name.toLowerCase()) : null)
    setFormGuest3Id(matchedG3 ? String(matchedG3.id) : (g3?.guestId ? String(g3.guestId) : (g3Name ? "manual" : "")))
    setGuest3SearchFilter("")
    setShowGuest3Suggestions(false)
    setFormGuest3Name(g3Name)
    setFormGuest3Cpf(g3?.cpf || "")
    setFormGuest3Phone(g3?.phone || "")
    setFormGuest3Email(g3?.email || "")

    const chan = normalizeCalendarChannel(resItem.channel)
    const isOtaRes = (chan === "booking" || chan === "airbnb")
    const rawResPmLower = String(resItem.paymentMethod || "").trim().toLowerCase()
    const isFatResEarly = Boolean(
      resItem.isFaturadoBoleto ||
      rawResPmLower === "boleto" ||
      rawResPmLower === "boleto_faturado" ||
      rawResPmLower === "faturado_boleto" ||
      rawResPmLower === "faturado_pj" ||
      rawResPmLower === "faturado_b2b" ||
      resItem.b2bPaymentType === "FATURADO"
    )
    const hasNonSyntheticFaturadoPay = isFatResEarly && Array.isArray(resItem.payments) && resItem.payments.some((p: any) =>
      p && Number(p.amount) > 0 && (
        p.endToEndId ||
        p.mpPaymentId ||
        String(p.id || "").startsWith("pay_bol_") ||
        !/^(pagamento integral|pagamento inicial|complemento de quita[cç][aã]o)$/i.test(String(p.notes || "").trim())
      )
    )
    const isGatewayPaid = Boolean(resItem.pixEndToEndId || resItem.mpPaymentId || (!isFatResEarly && resItem.paidAt));
    // Regra: Pré-Reserva (canal direto) sem comprovação real de PIX/cartão nunca é considerada paga,
    // e Reserva de Boleto Faturado sem boleto liquidado/comprovante real permanece Pendente (a faturar)
    const isUnpaidPreReserva = (resItem.status === "pre_reserva" && !isOtaRes && !isGatewayPaid) ||
      (isFatResEarly && !isGatewayPaid && !hasNonSyntheticFaturadoPay);
    const hasOtaPartialExtension = isOtaRes && (
      resItem.paymentStatus === "sinal_pago" ||
      resItem.paymentStatus === "parcial" ||
      (Array.isArray(resItem.dailyRates) && resItem.dailyRates.some((d: any) => d.channel && d.channel !== "booking" && d.channel !== "airbnb" && d.channel !== "b2b") && Number(resItem.paidAmount || 0) > 0 && Number(resItem.paidAmount || 0) < Number(resItem.totalAmount) - 0.01)
    );
    const hasPendingBalance = hasOtaPartialExtension || (!isOtaRes && Number(resItem.totalAmount) > 0 && Number(resItem.paidAmount || 0) < Number(resItem.totalAmount) && resItem.paymentStatus !== "pago_total" && resItem.paymentStatus !== "pago");
    const isResCurrentlyPaid = !isUnpaidPreReserva && !hasPendingBalance && (
      isOtaRes || 
      isGatewayPaid || 
      resItem.paymentStatus === "pago_total" || 
      resItem.paymentStatus === "pago" || 
      (Number(resItem.paidAmount) >= Number(resItem.totalAmount) && Number(resItem.totalAmount) > 0));
    const nights = differenceInDays(parseISO(resItem.checkoutDate), parseISO(resItem.checkinDate)) || 1;

    setFormChannel(chan);
    let resolvedMethod = rawResPmLower === "boleto_faturado" || rawResPmLower === "faturado_boleto"
      ? "boleto_faturado"
      : resItem.paymentMethod;
    if (isFatResEarly && (!resolvedMethod || resolvedMethod === "pix")) {
      resolvedMethod = chan === "b2b" ? "faturado_b2b" : "boleto_faturado";
    } else if (!resolvedMethod) {
      if (chan === "booking") resolvedMethod = "booking";
      else if (chan === "airbnb") resolvedMethod = "airbnb";
      else if (chan === "b2b") resolvedMethod = resItem.b2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b";
      else if (resItem.mpPaymentId && !resItem.pixEndToEndId) resolvedMethod = "cartao_credito";
      else if (resItem.pixTxId || resItem.pixEndToEndId || chan === "site") resolvedMethod = "pix";
      else if (resItem.mpPaymentId) resolvedMethod = "cartao_credito";
      else resolvedMethod = "pix";
    }
    setFormPaymentMethod(resolvedMethod);

    // Carregando e reconciliando taxas e cobranças adicionais (charges + cleaningFee/petFee/extraBedFee/twinFee)
    const loadedCharges: ReservationChargeItem[] = Array.isArray(resItem.charges) ? resItem.charges.map((c: any) => ({
      id: c.id || `charge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: c.type || "other",
      title: c.title || "Taxa / Adicional",
      amount: Number(c.amount) || 0,
      notes: c.notes || ""
    })) : [];
    if (!loadedCharges.some(c => c.type === "cleaning") && Number(resItem.cleaningFee) > 0) {
      loadedCharges.push({
        id: `charge_cleaning_${resItem.id || Date.now()}`,
        type: "cleaning",
        title: "Taxa de Limpeza",
        amount: Number(resItem.cleaningFee),
        notes: ""
      });
    }
    if (!loadedCharges.some(c => c.type === "pet") && Number(resItem.petFee) > 0) {
      loadedCharges.push({
        id: `charge_pet_${resItem.id || Date.now()}`,
        type: "pet",
        title: "Taxa Pet",
        amount: Number(resItem.petFee),
        notes: ""
      });
    }
    if (!loadedCharges.some(c => c.type === "extra_bed") && Number(resItem.extraBedFee) > 0) {
      loadedCharges.push({
        id: `charge_extrabed_${resItem.id || Date.now()}`,
        type: "extra_bed",
        title: "Cama Extra",
        amount: Number(resItem.extraBedFee),
        notes: ""
      });
    }
    if (!loadedCharges.some(c => c.title?.toLowerCase().includes("twin") || c.title?.toLowerCase().includes("solteiro")) && Number(resItem.twinFee) > 0) {
      loadedCharges.push({
        id: `charge_twin_${resItem.id || Date.now()}`,
        type: "other",
        title: "Taxa Camas Solteiro (Twin)",
        amount: Number(resItem.twinFee),
        notes: ""
      });
    }

    const existingValidRates = Array.isArray(resItem.dailyRates)
      ? resItem.dailyRates.map((d: any) => Number(d.rate ?? d.amount)).filter((n: number) => !isNaN(n) && n > 0)
      : [];
    const avgFromExistingRates = existingValidRates.length > 0
      ? Math.round((existingValidRates.reduce((a: number, b: number) => a + b, 0) / existingValidRates.length) * 100) / 100
      : 0;
    const initialChargesSum = loadedCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    const baseDailyRate = avgFromExistingRates > 0
      ? avgFromExistingRates
      : (Number(resItem.dailyRate || 0) || (nights > 0 && Number(resItem.totalAmount) > 0 ? Math.round(Math.max(0, Number(resItem.totalAmount) - initialChargesSum) / nights) : 250));
    setFormDailyRate(String(baseDailyRate));
    const loadedDailyRates = buildReservationDailyRates(
      resItem.checkinDate,
      resItem.checkoutDate,
      baseDailyRate,
      chan,
      Array.isArray(resItem.dailyRates) ? resItem.dailyRates : []
    );
    setFormDailyRates(loadedDailyRates);
    const calcFromRates = loadedDailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0);

    // Se a reserva possuía totalAmount maior que a soma das diárias sem item em charges (ex: taxa de limpeza embutida na criação),
    // preserva a diferença como Taxa de Limpeza para não ser perdida ao editar datas/diárias
    if (loadedCharges.length === 0 && calcFromRates > 0 && Number(resItem.totalAmount) > calcFromRates + 0.05 && !resItem.earlyCheckout) {
      const diffFee = Math.round((Number(resItem.totalAmount) - calcFromRates) * 100) / 100;
      loadedCharges.push({
        id: `charge_cleaning_${resItem.id || Date.now()}`,
        type: "cleaning",
        title: "Taxa de Limpeza",
        amount: diffFee,
        notes: ""
      });
    }

    const finalChargesSum = loadedCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    const compositeFromRatesAndCharges = calcFromRates > 0
      ? Math.round((calcFromRates + finalChargesSum) * 100) / 100
      : 0;
    const rawResTotal = Number(resItem.totalAmount) || 0;
    // Se houver taxas (ex: taxa de limpeza) e o total salvo estava apenas com a soma das diárias, corrige para o total composto
    const totCalculated = (!resItem.earlyCheckout && finalChargesSum > 0 && calcFromRates > 0 && Math.abs(rawResTotal - calcFromRates) < 0.05)
      ? compositeFromRatesAndCharges
      : (rawResTotal > 0 ? rawResTotal : (compositeFromRatesAndCharges > 0 ? compositeFromRatesAndCharges : (baseDailyRate * nights + finalChargesSum)));
    setFormTotalAmount(totCalculated > 0 ? String(totCalculated) : "");

    // 2. Real Paid Amount: se quitada ou comprovante existe, garante o valor total
    const rawPaid = isUnpaidPreReserva ? 0 : (Number(resItem.paidAmount) || 0);
    const effectivePaid = isResCurrentlyPaid
      ? (rawPaid > 0 ? rawPaid : totCalculated)
      : rawPaid;
    setFormPaidAmount(String(effectivePaid));

    // 3. Pagamentos individuais carregados e reconciliados
    let loadedPayments: ReservationPaymentItem[] = [];
    if (!isUnpaidPreReserva && Array.isArray(resItem.payments) && resItem.payments.length > 0) {
      loadedPayments = resItem.payments.map((p: any, idx: number) => ({
        id: p.id || `pay_${resItem.id}_${idx}`,
        amount: Number(p.amount) || 0,
        method: p.method || resolvedMethod,
        date: p.date ? (p.date.includes("T") ? p.date.substring(0, 16) : p.date) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        notes: p.notes || ""
      }));
    }

    const sumLoadedPayments = loadedPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    if (isResCurrentlyPaid || effectivePaid > 0) {
      if (loadedPayments.length === 0 || sumLoadedPayments === 0) {
        loadedPayments = [{
          id: `pay_${resItem.id}_reconciled`,
          amount: effectivePaid,
          method: resItem.pixEndToEndId ? "pix" : (resItem.mpPaymentId ? "cartao_credito" : resolvedMethod),
          date: resItem.paidAt ? (resItem.paidAt.includes("T") ? resItem.paidAt.substring(0, 16) : resItem.paidAt) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          notes: isGatewayPaid ? "Pagamento liquidado via Gateway" : "Pagamento integral"
        }];
      } else if (sumLoadedPayments < effectivePaid) {
        loadedPayments.push({
          id: `pay_${resItem.id}_diff`,
          amount: effectivePaid - sumLoadedPayments,
          method: resItem.pixEndToEndId ? "pix" : resolvedMethod,
          date: resItem.paidAt ? (resItem.paidAt.includes("T") ? resItem.paidAt.substring(0, 16) : resItem.paidAt) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          notes: "Complemento de quitação"
        });
      }
    }
    setFormPayments(loadedPayments);
    setFormCharges(loadedCharges);
    setPackageTotalInput(totCalculated > 0 ? String(totCalculated) : "");

    setFormPaymentStatus(isResCurrentlyPaid ? "pago_total" : (isUnpaidPreReserva ? "pendente" : (resItem.paymentStatus || "pendente")))
    const isExpiredRes = resItem.status === "expirada"
    const isPreOrExpiredStatus = resItem.status === "pre_reserva" || isExpiredRes
    setFormStatus((isPreOrExpiredStatus && !isResCurrentlyPaid && !isB2bRes && !isFatResEarly) ? "pre_reserva" : "confirmada")
    setIsReactivatingRes(isExpiredRes)
    setIsReactivatingExt(false)
    setReactivationFlatSwitchedInfo(null)
    const activePendingExt = resItem.pendingStayExtension?.status === "pending_payment" ? resItem.pendingStayExtension : null
    if (activePendingExt) {
      setFormExtensionHoldMode(activePendingExt.isPreReservationHold ? "pre_reserva" : "confirmada_sem_prazo")
    } else {
      setFormExtensionHoldMode("pre_reserva")
    }
    setFormSendExpirationReminder(
      isExpiredRes
        ? true
        : (activePendingExt?.sendExpirationReminder !== undefined
            ? activePendingExt.sendExpirationReminder !== false
            : resItem.sendExpirationReminder !== false)
    )
    const resolvedPresetOnOpen = activePendingExt?.holdPreset && ["10m", "30m", "2h", "until_2359", "custom"].includes(activePendingExt.holdPreset)
      ? activePendingExt.holdPreset
      : (resItem.holdPreset && ["10m", "30m", "2h", "until_2359", "custom"].includes(resItem.holdPreset) && !isExpiredRes
          ? resItem.holdPreset
          : null)
    if (resolvedPresetOnOpen) {
      setFormHoldPreset(resolvedPresetOnOpen)
      setFormHoldManuallyChosen(true)
    } else {
      setFormHoldPreset(getDefaultHoldPresetForCheckin(resItem.checkinDate))
      setFormHoldManuallyChosen(false)
    }
    const resolvedExpiresAtOnOpen = activePendingExt?.expiresAt || (!isExpiredRes ? resItem.expiresAt : null)
    if (resolvedExpiresAtOnOpen) {
      try {
        setFormHoldCustomDateTime(format(new Date(resolvedExpiresAtOnOpen), "yyyy-MM-dd'T'HH:mm"))
      } catch {}
    } else {
      setFormHoldCustomDateTime(format(addDays(new Date(), 1), "yyyy-MM-dd'T'12:00"))
    }
    setFormNotes(resItem.notes || "")
    const resCleanDoc = String(resItem.guestDocument || "").replace(/\D/g, "")
    const resCleanPhone = String(resItem.guestPhone || "").replace(/\D/g, "")
    const matchedGuest = crmGuests.find(g => {
      const gName = g.name || g.fullName || ""
      if (!areGuestNamesCompatibleUI(gName, resItem.guestName)) return false
      const gDoc = String(g.documentNumber || g.document || "").replace(/\D/g, "")
      const gPhone = String(g.phone || "").replace(/\D/g, "")
      return (resItem.guestId && String(g.id) === String(resItem.guestId)) ||
        (gDoc.length >= 8 && resCleanDoc.length >= 8 && gDoc === resCleanDoc) ||
        (gPhone.length >= 8 && resCleanPhone.length >= 8 && gPhone === resCleanPhone) ||
        (g.name && resItem.guestName && g.name.toLowerCase().trim() === resItem.guestName.toLowerCase().trim()) ||
        (g.fullName && resItem.guestName && g.fullName.toLowerCase().trim() === resItem.guestName.toLowerCase().trim())
    })

    setFormEarlyCheckin(Boolean(resItem.earlyCheckinAuthorized))
    setFormReceptionNotes(resItem.receptionNotes || "")
    setFormVehiclePlate(resItem.vehicle?.plate || "")
    setFormVehicleModel(resItem.vehicle?.model || "")
    setFormVehicleBrand(resItem.vehicle?.brand || "")
    setFormVehicleColor(resItem.vehicle?.color || "")
    setFormAutoInvoice(Boolean(resItem.autoEmitInvoice || matchedGuest?.autoEmitInvoice))
    setFormPrefersHighFloor(Boolean(resItem.prefersHighFloor))
    setFormTwinBeds(Boolean(resItem.twinBeds))
    setFormExtraMattress(Boolean(resItem.extraMattress))
    setFormIncludeBreakfast(Boolean(resItem.includeBreakfast || resItem.hasBreakfast))
    setFormSpecialRequests(resItem.specialRequests || resItem.notes || "")
    setFormIsMonthlyGuest(Boolean(resItem.isMonthlyGuest || resItem.clientType === "mensalista" || matchedGuest?.isMonthlyGuest || matchedGuest?.clientType === "mensalista"))
    const docUrl = resItem.docPhotoUrl || resItem.documentPhotoUrl || resItem.docPhotoPath || matchedGuest?.docPhotoUrl || ""
    setFormDocPhotoUrl(docUrl)
    setFormDocFileName(docUrl ? "documento_anexado" : "")
    setFormHasMinor(Boolean(resItem.hasMinor))
    const isCamposRes = isResCamposResident(resItem, matchedGuest)
    setFormIsCamposResident(isCamposRes)
    setFormIsFlatLocked(Boolean(resItem.isFlatLocked || resItem.flatLocked))
    setFormFlatLockReason(resItem.flatLockReason || "")
    const crmEntity = matchedAgency || matchedCompany || matchedGuest || {}
    const isFatRes = Boolean(
      resItem.isFaturadoBoleto ||
      resItem.paymentMethod === "boleto" ||
      resItem.paymentMethod === "boleto_faturado" ||
      resItem.paymentMethod === "faturado_pj" ||
      resItem.paymentMethod === "faturado_b2b" ||
      resItem.b2bPaymentType === "FATURADO"
    )
    setFormIsFaturadoBoleto(isFatRes)
    setFormBoletoTermDays(Number(resItem.boletoTermDays || crmEntity.defaultBoletoTermDays || 15))
    setFormBoletoCustomDueDate(resItem.boletoCustomDueDate || "")
    setFormBoletoConsumptionMode(
      resItem.boletoConsumptionMode === "separate_boletos" ||
      resItem.boletoConsumptionMode === "separate" ||
      crmEntity.defaultBoletoConsumptionMode === "separate_boletos" ||
      crmEntity.defaultBoletoConsumptionMode === "separate"
        ? "separate_boletos"
        : "single_boleto"
    )
    setFormBoletoPayerType(
      (resItem.boletoPayerType as any) ||
      (matchedAgency ? "agency" : (matchedCompany ? "company" : (resItem.requesterInfo?.name ? "requester" : "guest")))
    )
    setFormConsumptionSamePayerAndDue(resItem.consumptionSamePayerAndDue !== false)
    setFormConsumptionPayerType((resItem.consumptionPayerType as any) || "guest")
    setFormConsumptionTermDays(Number(resItem.consumptionTermDays || resItem.boletoTermDays || crmEntity.defaultBoletoTermDays || 15))
    setFormConsumptionCustomDueDate(resItem.consumptionCustomDueDate || "")
    setFormBoletoFinePct(resItem.boletoFinePct !== undefined ? Number(resItem.boletoFinePct) : Number(crmEntity.defaultBoletoFinePct ?? 2))
    setFormBoletoInterestPct(resItem.boletoInterestPct !== undefined ? Number(resItem.boletoInterestPct) : Number(crmEntity.defaultBoletoInterestPct ?? 1))
    setFormAutoEmitBoletoOnCheckout(resItem.autoEmitBoletoOnCheckout !== false)
    setFormAutoReminderEnabled(resItem.autoReminderEnabled !== false)
    const finResp = resItem.financialResponsible || crmEntity.financialResponsible || {}
    setFormFinRespName(finResp.name || "")
    setFormFinRespEmail(finResp.email || "")
    setFormFinRespPhone(finResp.phone || finResp.whatsapp || "")
    setFormFinRespDoc(finResp.document || "")
    const billRec = resItem.billingRecipients || crmEntity.defaultBillingRecipients || {}
    setFormRecGuest(Boolean(billRec.guest ?? (!matchedCompany && !matchedAgency)))
    setFormRecRequester(Boolean(billRec.requester ?? true))
    setFormRecCompany(Boolean(billRec.company ?? Boolean(matchedCompany || matchedAgency)))
    setFormRecFinResp(Boolean(billRec.financialResponsible ?? true))
    setFormRecSendEmail(billRec.sendEmail !== false)
    setFormRecSendWhatsapp(billRec.sendWhatsapp !== false)
    setResModalTab("reservation")
    setAuditLogs(Array.isArray(resItem.auditLogs) ? resItem.auditLogs : [])
    fetchAuditLogs(resItem.code || resItem.id)
    fetchCommunications(resItem.code || resItem.id)
    const flatItem = data.flats.find(f => f.id === resItem.flatId || String(f.number) === String(resItem.flatNumber))
    const pEmail = flatItem?.receptionEmail || "soho@promenade.com.br"
    setPortariaEmail(pEmail)
    setManualRecipient(resItem.guestEmail || pEmail)
    setManualSubject(`[CorpFlats] Flat ${resItem.flatNumber} - ${resItem.guestName}`)
    setManualBody("")
    setRangePickerOpen(false)
    setPickerRangeStart(null)
    setPickerHoverDate(null)
    setPickerMonth(safeParseDate(resItem.checkinDate) || new Date())
    setResModalOpen(true)
  }

  const handleCancelPendingExtension = async () => {
    if (!selectedRes?.id || cancellingPendingExt) return
    setCancellingPendingExt(true)
    try {
      const resp = await fetch(`/api/pms/reservations/${selectedRes.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cancelPendingExtension: true })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || "Falha ao reverter diária extra pendente.")
      }
      toast({
        title: "↩️ Diária(s) extra(s) pendente(s) revertida(s)!",
        description: `A reserva ${selectedRes.code} voltou ao período original confirmado e quitado.`
      })
      setResModalOpen(false)
      await fetchData(false)
      notifyCalendarUpdated()
    } catch (err: any) {
      toast({
        title: "Erro ao reverter diária pendente",
        description: err.message || "Tente novamente.",
        variant: "destructive"
      })
    } finally {
      setCancellingPendingExt(false)
    }
  }

  const handleReactivateExpiredRes = (resItem: any) => {
    setExpiredModalOpen(false)

    if (resItem.isExpiredExtension) {
      const parentId = resItem.parentReservationId || resItem.id
      const liveParent = (data.reservations || []).find(
        (r: any) => String(r.id) === String(parentId) || (resItem.code && r.code === resItem.code)
      ) || resItem
      handleOpenEditRes(liveParent)

      const origCin = liveParent.checkinDate
      const origCout = liveParent.checkoutDate
      const targetCin = resItem.attemptedCheckinDate || origCin
      const targetCout = resItem.attemptedCheckoutDate || resItem.extensionEndDate || origCout
      const baseRates = Array.isArray(liveParent.dailyRates) && liveParent.dailyRates.length > 0
        ? liveParent.dailyRates
        : buildReservationDailyRates(origCin, origCout, Number(liveParent.dailyRate) || 250, liveParent.channel || "whatsapp", [])
      const fallbackRate = Number(resItem.addedDailyRates?.[0]?.rate) || Number(baseRates[baseRates.length - 1]?.rate) || Number(liveParent.dailyRate) || 250
      const mergedSeeds = [
        ...baseRates,
        ...(Array.isArray(resItem.addedDailyRates) ? resItem.addedDailyRates : [])
      ]
      const rebuiltRates = buildReservationDailyRates(
        targetCin,
        targetCout,
        fallbackRate,
        "whatsapp",
        mergedSeeds
      )
      setFormCheckin(targetCin)
      setFormCheckout(targetCout)
      setFormDailyRates(rebuiltRates)
      setFormStatus("confirmada")
      syncCompositeTotalAndPaid(rebuiltRates, liveParent.charges || [], liveParent.channel || "whatsapp")
      setIsReactivatingRes(false)
      setIsReactivatingExt(true)
      setFormExtensionHoldMode("pre_reserva")
      setFormHoldManuallyChosen(false)
      setFormSendExpirationReminder(true)
      const extStart = resItem.extensionStartDate || origCout
      setFormHoldPreset(getDefaultHoldPresetForExtension(extStart))
      if (resItem.isOriginalFlatAvailable === false) {
        setReactivationFlatSwitchedInfo(`Atenção: O Flat ${liveParent.flatNumber} já recebeu outra ocupação no período adicional (${extStart.split("-").reverse().join("/")} a ${targetCout.split("-").reverse().join("/")}). Verifique remanejamento antes de salvar.`)
      } else {
        setReactivationFlatSwitchedInfo(null)
      }
      return
    }

    handleOpenEditRes(resItem)
    setFormStatus("pre_reserva")
    setFormPayments([])
    setFormPaidAmount("0")
    setFormPaymentStatus("pendente")
    setIsReactivatingRes(true)
    setIsReactivatingExt(false)
    setFormHoldManuallyChosen(false)
    setFormSendExpirationReminder(true)
    setFormHoldPreset(getDefaultHoldPresetForCheckin(resItem.checkinDate))

    const cin = resItem.checkinDate
    const cout = resItem.checkoutDate
    const origFlatId = Number(resItem.flatId)
    const origFlatNum = String(resItem.flatNumber || "")

    const isFlatFree = (fl: any) => {
      const hasResConf = (data.reservations || []).some((r: any) => {
        if (String(r.id) === String(resItem.id) || (resItem.code && r.code === resItem.code)) return false
        if (Number(r.flatId) !== Number(fl.id) && String(r.flatNumber) !== String(fl.number)) return false
        const st = String(r.status || "").toLowerCase()
        if (["cancelada", "cancelled", "no_show", "expirada"].includes(st)) return false
        if ((r.checkoutDone || r.earlyCheckout || ["completed", "checked_out", "finalizada", "concluida", "checkout"].includes(st)) && r.checkoutDate <= cin) return false
        return r.checkinDate < cout && r.checkoutDate > cin
      })
      const hasBlkConf = (data.blocks || []).some((b: any) => {
        if (Number(b.flatId) !== Number(fl.id) && String(b.flatNumber) !== String(fl.number)) return false
        return b.startDate < cout && b.endDate >= cin
      })
      return !hasResConf && !hasBlkConf
    }

    const origFlatObj = data.flats.find((f: any) => Number(f.id) === origFlatId || String(f.number) === origFlatNum)
    const origAvailable = resItem.isOriginalFlatAvailable !== undefined
      ? Boolean(resItem.isOriginalFlatAvailable)
      : (origFlatObj ? isFlatFree(origFlatObj) : true)

    if (!origAvailable) {
      const altFlat = data.flats.find((f: any) => isFlatFree(f))
      if (altFlat) {
        setFormFlatId(String(altFlat.id))
        setReactivationFlatSwitchedInfo(`O Flat original (${origFlatNum || origFlatId}) já foi ocupado neste período. Sugerimos automaticamente o Flat ${altFlat.number} que está livre!`)
      } else {
        setReactivationFlatSwitchedInfo(`Atenção: O Flat ${origFlatNum || origFlatId} possui outra ocupação neste período e não há outros flats livres na mesma data.`)
      }
    } else {
      setReactivationFlatSwitchedInfo(null)
    }
  }

  const handledUrlCodeRef = useRef<string | null>(null)
  useEffect(() => {
    if (modalOnly || typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    const reactivateCode = sp.get("reactivateCode") || sp.get("reactivate")
    const targetCode = reactivateCode || sp.get("code") || sp.get("reservation")
    if (!targetCode) return
    if (handledUrlCodeRef.current === `${reactivateCode ? "R:" : "C:"}${targetCode}`) return
    if (loading && data.reservations.length === 0 && (data.expiredPreReservations || []).length === 0) return

    const norm = targetCode.trim().toUpperCase()
    const matchInExpired = (data.expiredPreReservations || []).find(
      (r: any) => String(r.code || "").toUpperCase() === norm || String(r.id) === targetCode.trim()
    )
    const matchInActive = (data.reservations || []).find(
      (r: any) => String(r.code || "").toUpperCase() === norm || String(r.id) === targetCode.trim()
    )
    const found = matchInExpired || matchInActive
    if (found) {
      handledUrlCodeRef.current = `${reactivateCode ? "R:" : "C:"}${targetCode}`
      if (reactivateCode || found.status === "expirada") {
        handleReactivateExpiredRes(found)
      } else {
        handleOpenEditRes(found)
      }
      try {
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, "", cleanUrl)
      } catch {}
    }
  }, [modalOnly, loading, data.reservations, data.expiredPreReservations])

  const handleSelectGuest = (val: string) => {
    const prevGuestId = formGuestId
    setFormGuestId(val)
    if (!val || val === "manual") {
      if (prevGuestId && prevGuestId !== "manual") {
        setFormGuestName("")
        setFormGuest1Cpf("")
        setFormGuestPhone("")
        setFormGuestEmail("")
        setFormDocPhotoUrl("")
        setFormDocFileName("")
        setFormIsCamposResident(false)
      }
      return
    }
    const g = crmGuests.find(guest => String(guest.id) === val)
    if (g) {
      const isSameGuest =
        String(prevGuestId) === String(g.id) ||
        (selectedRes?.guestId && String(selectedRes.guestId) === String(g.id) && areGuestNamesCompatibleUI(selectedRes?.guestName, g.name || g.fullName)) ||
        (selectedRes?.guestName && (g.name || g.fullName || "").trim().toLowerCase() === selectedRes.guestName.trim().toLowerCase())
      const crmCpf = (g.documentNumber || g.document || "").trim()
      const crmPhone = (g.phone || "").trim()
      const crmEmail = (g.email || "").trim()
      setFormGuestName(g.name || g.fullName || "")
      setFormGuest1Cpf(prev => isSameGuest ? (prev.trim() || crmCpf) : crmCpf)
      setFormGuestPhone(prev => isSameGuest ? (prev.trim() || crmPhone) : crmPhone)
      setFormGuestEmail(prev => isSameGuest ? (prev.trim() || crmEmail) : crmEmail)

      if (g.floorPreference === "alto" || g.prefersHighFloor) {
        setFormPrefersHighFloor(true)
      }
      if (g.bedType === "2 Solteiro" || g.twinBeds) {
        setFormTwinBeds(true)
      }
      if (g.isMonthlyGuest || g.clientType === "mensalista") {
        setFormIsMonthlyGuest(true)
      } else if (!isSameGuest) {
        setFormIsMonthlyGuest(false)
      }
      if (g.autoEmitInvoice) {
        setFormAutoInvoice(true)
      } else if (!isSameGuest) {
        setFormAutoInvoice(false)
      }
      if (g.companyId && !formCompanyId) {
        setFormCompanyId(String(g.companyId))
        const comp = companies.find(c => c.id === Number(g.companyId))
        if (comp) setFormCompanyName(comp.tradeName || comp.corporateName)
      }
      if (formChannel !== "b2b" && formRequesterType !== "agency_b2b") {
        if (g.preferredInvoiceRecipient === "company" && (g.companyId || formCompanyId)) {
          setFormInvoiceRecipientType("company")
        } else if (g.preferredInvoiceRecipient === "guest") {
          setFormInvoiceRecipientType("guest")
        } else if (!isSameGuest && formRequesterType !== "company") {
          setFormInvoiceRecipientType("guest")
        }
      }
      if (g.defaultBoletoTermDays) setFormBoletoTermDays(Number(g.defaultBoletoTermDays))
      if (g.defaultBoletoConsumptionMode === "separate_boletos" || g.defaultBoletoConsumptionMode === "separate") {
        setFormBoletoConsumptionMode("separate_boletos")
      }
      if (g.financialResponsible?.name && !formFinRespName) {
        setFormFinRespName(g.financialResponsible.name || "")
        setFormFinRespEmail(g.financialResponsible.email || "")
        setFormFinRespPhone(g.financialResponsible.phone || g.financialResponsible.whatsapp || "")
        setFormFinRespDoc(g.financialResponsible.document || "")
      }
      if (g.defaultBillingRecipients) {
        setFormRecGuest(Boolean(g.defaultBillingRecipients.guest ?? true))
        setFormRecRequester(Boolean(g.defaultBillingRecipients.requester ?? true))
        setFormRecCompany(Boolean(g.defaultBillingRecipients.company ?? false))
        setFormRecFinResp(Boolean(g.defaultBillingRecipients.financialResponsible ?? true))
        setFormRecSendEmail(g.defaultBillingRecipients.sendEmail !== false)
        setFormRecSendWhatsapp(g.defaultBillingRecipients.sendWhatsapp !== false)
      }
      if (g.docPhotoUrl && (!formDocPhotoUrl || !isSameGuest)) {
        setFormDocPhotoUrl(g.docPhotoUrl)
        setFormDocFileName("documento_crm")
      } else if (!isSameGuest && !g.docPhotoUrl) {
        setFormDocPhotoUrl("")
        setFormDocFileName("")
      }
      setFormIsCamposResident(isResCamposResident({ isCamposResident: g.isCamposResident }, g))
      toast({
        title: "Hóspede Selecionado do CRM",
        description: `${g.name || g.fullName} carregado com sucesso.`
      })
    }
  }

  const indexedCrmGuests = useMemo(
    () =>
      crmGuests.map(g => ({
        raw: g,
        nameLower: String(g.name || g.fullName || "").toLowerCase(),
        docDigits: String(g.documentNumber || g.document || "").replace(/\D/g, ""),
        phoneDigits: String(g.phone || "").replace(/\D/g, ""),
        compLower: String(g.companyName || "").toLowerCase(),
      })),
    [crmGuests]
  )

  const searchIndexedCrm = useCallback(
    (rawQuery: string, includeCompany: boolean, limit?: number) => {
      const q = (rawQuery || "").toLowerCase().trim()
      if (!q) return []
      const cleanQ = q.replace(/\D/g, "")
      const out: any[] = []
      for (let i = 0; i < indexedCrmGuests.length; i++) {
        const item = indexedCrmGuests[i]
        if (
          item.nameLower.includes(q) ||
          (cleanQ && item.docDigits.includes(cleanQ)) ||
          (cleanQ && item.phoneDigits.includes(cleanQ)) ||
          (includeCompany && item.compLower.includes(q))
        ) {
          out.push(item.raw)
          if (limit && out.length >= limit) break
        }
      }
      return out
    },
    [indexedCrmGuests]
  )

  const filteredGuests = useMemo(() => {
    if (!guestSearchFilter.trim()) return crmGuests
    return searchIndexedCrm(guestSearchFilter, false)
  }, [crmGuests, guestSearchFilter, searchIndexedCrm])

  // Live real-time filtered matches as the user types guest name
  const liveGuestMatches = useMemo(
    () => searchIndexedCrm(formGuestName, true, 8),
    [formGuestName, searchIndexedCrm]
  )

  // Close live guest suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (guestSuggestionsRef.current && !guestSuggestionsRef.current.contains(event.target as Node)) {
        setShowGuestSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Handlers e Memos para Solicitante Terceiro (CRM)
  const handleSelectRequester = (val: string) => {
    setFormRequesterId(val)
    if (!val || val === "manual") {
      return
    }
    const g = crmGuests.find(guest => String(guest.id) === val)
    if (g) {
      setFormRequesterName(g.name || g.fullName || "")
      setFormRequesterCpf(g.documentNumber || g.document || "")
      setFormRequesterPhone(g.phone || "")
      setFormRequesterEmail(g.email || "")
      toast({
        title: "Solicitante Selecionado do CRM",
        description: `${g.name || g.fullName} carregado com sucesso.`
      })
    }
  }

  const filteredRequesters = useMemo(
    () => searchIndexedCrm(requesterSearchFilter, false),
    [requesterSearchFilter, searchIndexedCrm]
  )

  const liveRequesterMatches = useMemo(
    () => searchIndexedCrm(formRequesterName, true, 8),
    [formRequesterName, searchIndexedCrm]
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (requesterSuggestionsRef.current && !requesterSuggestionsRef.current.contains(event.target as Node)) {
        setShowRequesterSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSaveRequesterToCrm = async () => {
    const nameToSave = formRequesterName.trim()
    if (!nameToSave) {
      toast({
        title: "Nome Obrigatório",
        description: "Preencha o nome do solicitante para cadastrá-lo no CRM.",
        variant: "destructive"
      })
      return
    }
    try {
      const res = await fetch("/api/pms/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: nameToSave,
          fullName: nameToSave,
          phone: formRequesterPhone.trim(),
          email: formRequesterEmail.trim(),
          document: formRequesterCpf.trim(),
          documentNumber: formRequesterCpf.trim(),
          tags: ["solicitante_terceiro"],
          notes: "Cadastrado como solicitante da reserva via CRM"
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao cadastrar cliente no CRM.")
      }
      const newGuest = await res.json()
      setCrmGuests(prev => [newGuest, ...prev.filter(g => g.id !== newGuest.id)])
      setFormRequesterId(String(newGuest.id))
      toast({
        title: "Cliente Cadastrado no CRM!",
        description: `${newGuest.name || newGuest.fullName} foi registrado com sucesso.`
      })
    } catch (e: any) {
      toast({
        title: "Erro ao Cadastrar",
        description: e.message || "Não foi possível cadastrar o solicitante no CRM.",
        variant: "destructive"
      })
    }
  }

  // Handlers e Memos para Hóspede 2 e Hóspede 3 (CRM)
  const handleSelectGuest2 = (val: string) => {
    setFormGuest2Id(val)
    if (!val || val === "manual") {
      return
    }
    const g = crmGuests.find(guest => String(guest.id) === val)
    if (g) {
      setFormGuest2Name(g.name || g.fullName || "")
      setFormGuest2Cpf(g.documentNumber || g.document || "")
      setFormGuest2Phone(g.phone || "")
      setFormGuest2Email(g.email || "")
      toast({
        title: "2º Hóspede Selecionado do CRM",
        description: `${g.name || g.fullName} carregado com sucesso.`
      })
    }
  }

  const handleSelectGuest3 = (val: string) => {
    setFormGuest3Id(val)
    if (!val || val === "manual") {
      return
    }
    const g = crmGuests.find(guest => String(guest.id) === val)
    if (g) {
      setFormGuest3Name(g.name || g.fullName || "")
      setFormGuest3Cpf(g.documentNumber || g.document || "")
      setFormGuest3Phone(g.phone || "")
      setFormGuest3Email(g.email || "")
      toast({
        title: "3º Hóspede Selecionado do CRM",
        description: `${g.name || g.fullName} carregado com sucesso.`
      })
    }
  }

  const filteredGuests2 = useMemo(
    () => searchIndexedCrm(guest2SearchFilter, false),
    [guest2SearchFilter, searchIndexedCrm]
  )

  const filteredGuests3 = useMemo(
    () => searchIndexedCrm(guest3SearchFilter, false),
    [guest3SearchFilter, searchIndexedCrm]
  )

  const liveGuest2Matches = useMemo(
    () => searchIndexedCrm(formGuest2Name, true, 8),
    [formGuest2Name, searchIndexedCrm]
  )

  const liveGuest3Matches = useMemo(
    () => searchIndexedCrm(formGuest3Name, true, 8),
    [formGuest3Name, searchIndexedCrm]
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (guest2SuggestionsRef.current && !guest2SuggestionsRef.current.contains(event.target as Node)) {
        setShowGuest2Suggestions(false)
      }
      if (guest3SuggestionsRef.current && !guest3SuggestionsRef.current.contains(event.target as Node)) {
        setShowGuest3Suggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSaveAdditionalGuestToCrm = async (guestNumber: 2 | 3) => {
    const isG2 = guestNumber === 2
    const nameToSave = (isG2 ? formGuest2Name : formGuest3Name).trim()
    const phoneToSave = (isG2 ? formGuest2Phone : formGuest3Phone).trim()
    const emailToSave = (isG2 ? formGuest2Email : formGuest3Email).trim()
    const cpfToSave = (isG2 ? formGuest2Cpf : formGuest3Cpf).trim()

    if (!nameToSave) {
      toast({
        title: "Nome Obrigatório",
        description: `Preencha o nome do ${guestNumber}º hóspede para cadastrá-lo no CRM.`,
        variant: "destructive"
      })
      return
    }
    try {
      const res = await fetch("/api/pms/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: nameToSave,
          fullName: nameToSave,
          phone: phoneToSave,
          email: emailToSave,
          document: cpfToSave,
          documentNumber: cpfToSave,
          notes: `Cadastrado como ${guestNumber}º hóspede (acompanhante) via CRM`
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao cadastrar hóspede no CRM.")
      }
      const newGuest = await res.json()
      setCrmGuests(prev => [newGuest, ...prev.filter(g => g.id !== newGuest.id)])
      if (isG2) {
        setFormGuest2Id(String(newGuest.id))
      } else {
        setFormGuest3Id(String(newGuest.id))
      }
      toast({
        title: "Hóspede Cadastrado no CRM!",
        description: `${newGuest.name || newGuest.fullName} foi registrado com sucesso.`
      })
    } catch (e: any) {
      toast({
        title: "Erro ao Cadastrar",
        description: e.message || "Não foi possível cadastrar o hóspede no CRM.",
        variant: "destructive"
      })
    }
  }

  // Handlers para Cadastro Rápido de Empresa Parceira
  const [newCompAddressData, setNewCompAddressData] = useState<Record<string, string>>({})

  const handleOpenNewCompanyModal = () => {
    setNewCompCorporateName("")
    setNewCompTradeName("")
    setNewCompCnpj("")
    setNewCompFinancialEmail("")
    setNewCompPhone("")
    setNewCompContactPerson("")
    setNewCompBillingTerms("30 dias")
    setNewCompNotes("")
    setNewCompAddressData({})
    setNewCompanyModalOpen(true)
  }

  const handleLookupNewCompanyCnpj = async (rawCnpj: string) => {
    const clean = rawCnpj.replace(/\D/g, "")
    if (clean.length === 14) {
      setLoadingNewCompanyCnpj(true)
      try {
        const res = await fetch(`/api/invoices/lookup-cnpj/${clean}`, { credentials: "include" })
        if (res.ok) {
          const resData = await res.json()
          if (resData.razaoSocial || resData.razao_social) setNewCompCorporateName(resData.razaoSocial || resData.razao_social)
          if (resData.nomeFantasia || resData.nome_fantasia) setNewCompTradeName(resData.nomeFantasia || resData.nome_fantasia)
          if (resData.email) setNewCompFinancialEmail(resData.email)
          if (resData.telefone || resData.ddd_telefone_1) setNewCompPhone(resData.telefone || resData.ddd_telefone_1)
          setNewCompAddressData({
            address: resData.logradouro || resData.endereco || "",
            number: resData.numero || "S/N",
            complement: resData.complemento || "",
            neighborhood: resData.bairro || "",
            cep: resData.cep || "",
            city: resData.cidade || resData.municipio || "",
            state: resData.uf || "RJ",
            ibgeCode: resData.codigoMunicipio || resData.ibge || resData.ibgeCode || ""
          })
          toast({
            title: "Dados da Empresa Localizados!",
            description: `${resData.razaoSocial || resData.razao_social || resData.nomeFantasia} carregada da Receita Federal.`
          })
        }
      } catch {}
      setLoadingNewCompanyCnpj(false)
    }
  }

  const handleSaveNewCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCompCorporateName.trim()) {
      toast({ title: "Razão Social Obrigatória", description: "Informe o nome ou razão social da empresa.", variant: "destructive" })
      return
    }

    setSavingNewCompany(true)
    try {
      const payload = {
        corporateName: newCompCorporateName.trim(),
        tradeName: (newCompTradeName || newCompCorporateName).trim(),
        cnpj: newCompCnpj.trim() || "Isento / Não informado",
        financialEmail: newCompFinancialEmail.trim(),
        phone: newCompPhone.trim(),
        contactPerson: newCompContactPerson.trim(),
        billingTerms: newCompBillingTerms.trim(),
        notes: newCompNotes.trim(),
        ...newCompAddressData
      }

      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      })

      if (res.ok) {
        const createdComp = await res.json()
        setCompanies(prev => [...prev.filter(c => c.id !== createdComp.id), createdComp])
        fetchCompanies()
        setFormCompanyId(String(createdComp.id))
        setFormCompanyName(createdComp.tradeName || createdComp.corporateName)
        if (formRequesterType !== "agency_b2b" && formChannel !== "b2b") {
          setFormRequesterType("company")
        }
        setNewCompanyModalOpen(false)
        toast({
          title: "Empresa Cadastrada com Sucesso!",
          description: `${createdComp.tradeName || createdComp.corporateName} foi cadastrada e vinculada a esta reserva.`
        })
      } else {
        const errJson = await res.json()
        toast({ title: "Erro ao cadastrar empresa", description: errJson.error || "Verifique os dados.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de comunicação", description: err.message, variant: "destructive" })
    } finally {
      setSavingNewCompany(false)
    }
  }

  const handleSelectAgency = (val: string) => {
    if (val === "__NEW_AGENCY__") {
      setNewAgencyInlineOpen(true)
      return
    }
    setFormAgencyId(val)
    const ag = agencies.find((a: any) => String(a.id) === val)
    if (ag) {
      setFormAgencyName(ag.tradeName || ag.corporateName || "")
      setFormAgencyCnpj(ag.cnpj || "")
      if (ag.defaultRatePolicy) {
        setFormB2bRatePolicy(ag.defaultRatePolicy === "NET" ? "NET" : "COMISSIONADA")
        setFormB2bCommissionPct(ag.defaultRatePolicy === "NET" ? "0" : String(ag.defaultCommissionPct ?? 12))
      }
      if (ag.defaultInvoiceRecipient) {
        setFormInvoiceRecipientType(ag.defaultInvoiceRecipient)
      }
      const firstPos = Array.isArray(ag.posUnits) && ag.posUnits[0] ? (ag.posUnits[0]?.name || ag.posUnits[0]) : ""
      if (firstPos && !formAgencyPosUnit) setFormAgencyPosUnit(firstPos)
      const isBillingEmailLocal = (em: string) => {
        const c = String(em || "").trim().toLowerCase()
        if (!c.includes("@")) return false
        if (c.endsWith("@b2breservas.com.br")) return true
        return /^(?:conciliacao|faturamento|faturamentodpr|nf|nfe|nfse|notafiscal|notas?fiscais|nfebimbo[a-z0-9_.-]*|fiscal|financeiro|contasapagar|cobranca|envionf|envionotas|recebimentonf)(?:$|[._\-0-9])/i.test(c.split("@")[0] || "")
      }
      const firstAgent = Array.isArray(ag.agents) && ag.agents[0] ? ag.agents[0] : null
      const safeFirstAgentEmail = firstAgent?.email && !isBillingEmailLocal(firstAgent.email) ? firstAgent.email : ""
      const safeAgOpEmail = ag.email && !isBillingEmailLocal(ag.email) ? ag.email : ""
      if (firstAgent) {
        if (!formAgencyAgentName) setFormAgencyAgentName(firstAgent.name || "")
        if (!formAgencyAgentEmail && (safeFirstAgentEmail || safeAgOpEmail)) {
          setFormAgencyAgentEmail(safeFirstAgentEmail || safeAgOpEmail)
        }
        if (!formAgencyAgentPhone) setFormAgencyAgentPhone(firstAgent.phone || ag.phone || "")
      } else {
        if (!formAgencyAgentEmail && safeAgOpEmail) setFormAgencyAgentEmail(safeAgOpEmail)
        if (!formAgencyAgentPhone && ag.phone) setFormAgencyAgentPhone(ag.phone)
      }
      if (!formNfDeliveryEmails.trim() && ag.financialEmail) {
        setFormNfDeliveryEmails(ag.financialEmail)
      }
      setFormNfHideFromGuest(true)
    }
  }

  const handleSaveNewAgencyInline = async () => {
    if (!newAgencyName.trim()) {
      toast({ title: "Nome da Agência Obrigatório", description: "Informe o nome ou razão social da agência B2B.", variant: "destructive" })
      return
    }
    setSavingNewAgency(true)
    try {
      const resp = await fetch("/api/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          corporateName: newAgencyName.trim().toUpperCase(),
          tradeName: newAgencyName.trim(),
          cnpj: newAgencyCnpj.trim(),
          email: newAgencyEmail.trim(),
          financialEmail: "",
          phone: newAgencyPhone.trim(),
          defaultRatePolicy: formB2bRatePolicy,
          defaultCommissionPct: Number(formB2bCommissionPct) || 0,
          defaultInvoiceRecipient: formInvoiceRecipientType
        })
      })
      if (resp.ok) {
        const createdAg = await resp.json()
        setAgencies(prev => [...prev.filter(a => a.id !== createdAg.id), createdAg])
        fetchAgencies()
        setFormAgencyId(String(createdAg.id))
        setFormAgencyName(createdAg.tradeName || createdAg.corporateName)
        setFormAgencyCnpj(createdAg.cnpj || "")
        setNewAgencyInlineOpen(false)
        setNewAgencyName("")
        setNewAgencyCnpj("")
        setNewAgencyEmail("")
        setNewAgencyPhone("")
        toast({ title: "Agência B2B Cadastrada!", description: `${createdAg.tradeName || createdAg.corporateName} vinculada à reserva.` })
      } else {
        const err = await resp.json().catch(() => ({}))
        toast({ title: "Erro ao cadastrar agência", description: err.error || "Tente novamente.", variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "Erro de conexão", description: e.message, variant: "destructive" })
    } finally {
      setSavingNewAgency(false)
    }
  }

  const handleParseVoucherText = async () => {
    if (!voucherTextToParse.trim() && !voucherFilePayload) {
      toast({ title: "Voucher vazio", description: "Anexe o PDF/Imagem completo do voucher ou cole o texto do e-mail da B2B Reservas.", variant: "destructive" })
      return
    }
    setParsingVoucher(true)
    try {
      const resp = await fetch("/api/pms/b2b/parse-voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: voucherTextToParse,
          fileBase64: voucherFilePayload?.fileBase64 || "",
          mimeType: voucherFilePayload?.mimeType || "",
          autoLinkCrm: true
        })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.parsed) {
        toast({ title: "Não foi possível extrair dados", description: json.error || "Verifique o arquivo ou texto informado.", variant: "destructive" })
        return
      }
      const p = json.parsed
      setFormChannel("b2b")
      setFormRequesterType("agency_b2b")
      if (p.b2bReservationNumber) setFormB2bReservationNumber(p.b2bReservationNumber)
      if (p.b2bLocatorRloc) setFormB2bLocatorRloc(p.b2bLocatorRloc)
      if (p.b2bOriginType) setFormB2bOriginType(p.b2bOriginType === "OTA_WS" ? "OTA_WS" : "BOOKING_WS")
      if (p.checkinDate) setFormCheckin(p.checkinDate)
      if (p.checkoutDate) setFormCheckout(p.checkoutDate)
      if (p.guestName) setFormGuestName(p.guestName)
      if (p.agencyName) {
        setFormAgencyName(p.agencyName)
        if (json.agencyId) {
          setFormAgencyId(String(json.agencyId))
          fetchAgencies()
        } else {
          const cleanAgCnpj = String(p.agencyCnpj || "").replace(/\D/g, "")
          const matchedAg = agencies.find((a: any) =>
            (cleanAgCnpj && String(a.cnpj || "").replace(/\D/g, "") === cleanAgCnpj) ||
            (a.tradeName || "").toLowerCase().includes(p.agencyName.toLowerCase()) ||
            (a.corporateName || "").toLowerCase().includes(p.agencyName.toLowerCase())
          )
          if (matchedAg) setFormAgencyId(String(matchedAg.id))
        }
      }
      if (p.agencyCnpj) setFormAgencyCnpj(p.agencyCnpj)
      if (p.agencyPosUnit) setFormAgencyPosUnit(p.agencyPosUnit)
      if (p.agencyAgentName) setFormAgencyAgentName(p.agencyAgentName)
      setFormAgencyAgentEmail(p.agencyAgentEmail || "")
      if (p.agencyAgentPhone) setFormAgencyAgentPhone(p.agencyAgentPhone)
      if (p.companyName) {
        setFormCompanyName(p.companyName)
        if (json.companyId) {
          setFormCompanyId(String(json.companyId))
          fetchCompanies()
        } else {
          const cleanCompCnpj = String(p.companyCnpj || "").replace(/\D/g, "")
          const matchedComp = companies.find((c: any) =>
            (cleanCompCnpj && String(c.cnpj || "").replace(/\D/g, "") === cleanCompCnpj) ||
            (c.tradeName || "").toLowerCase().includes(p.companyName.toLowerCase()) ||
            (c.corporateName || "").toLowerCase().includes(p.companyName.toLowerCase())
          )
          if (matchedComp) setFormCompanyId(String(matchedComp.id))
        }
      }
      if (p.costCenter) setFormCostCenter(p.costCenter)
      if (p.hasBreakfast !== undefined) setFormIncludeBreakfast(Boolean(p.hasBreakfast))
      if (p.b2bRatePolicy) setFormB2bRatePolicy(p.b2bRatePolicy === "NET" ? "NET" : "COMISSIONADA")
      if (p.b2bCommissionPct !== undefined) setFormB2bCommissionPct(String(p.b2bCommissionPct))
      if (p.b2bPaymentType) setFormB2bPaymentType(p.b2bPaymentType === "FATURADO" ? "FATURADO" : "VIRTUAL_CARD")
      if (p.b2bCardBrand) setFormB2bCardBrand(p.b2bCardBrand)
      if (p.b2bCardMasked) setFormB2bCardMasked(p.b2bCardMasked)
      if (p.b2bVcnToken) setFormB2bVcnToken(p.b2bVcnToken)
      if (p.b2bConciliationUrl) setFormB2bConciliationUrl(p.b2bConciliationUrl)
      if (p.b2bAuthorizedExpenses) setFormB2bAuthorizedExpenses(p.b2bAuthorizedExpenses)
      if (p.invoicingInstructions) setFormInvoicingInstructions(p.invoicingInstructions)
      if (p.voucherUrl || p.b2bVoucherUrl) setFormVoucherUrl(p.voucherUrl || p.b2bVoucherUrl)
      if (p.invoiceRecipientType) setFormInvoiceRecipientType(p.invoiceRecipientType)
      setFormNfDeliveryEmails(Array.isArray(p.nfDeliveryEmails) ? p.nfDeliveryEmails.join(", ") : "")
      setFormNfHideFromGuest(Boolean(p.nfHideFromGuest))
      if (p.dailyRate || p.totalAmount) {
        const cin = p.checkinDate || formCheckin
        const cout = p.checkoutDate || formCheckout
        const rate = Number(p.dailyRate) || Number(p.totalAmount) || 250
        setFormDailyRate(String(rate))
        const builtRates = buildReservationDailyRates(cin, cout, rate, "b2b")
        setFormDailyRates(builtRates)
        const tot = Number(p.totalAmount) || builtRates.reduce((s, d) => s + Number(d.rate || 0), 0)
        setFormTotalAmount(String(tot))
        setPackageTotalInput(String(tot))
      }
      setVoucherFilePayload(null)
      setShowVoucherParser(false)
      toast({
        title: "Voucher B2B Interpretado!",
        description: `Reserva ${p.b2bReservationNumber || ""} (${p.guestName || "Hóspede"}) preenchida automaticamente.`
      })
    } catch (e: any) {
      toast({ title: "Erro ao ler voucher", description: e.message, variant: "destructive" })
    } finally {
      setParsingVoucher(false)
    }
  }

  const handleSendB2bCredentialEmail = async () => {
    if (!selectedRes?.id) return
    setSendingB2bCredentialEmail(true)
    try {
      const resp = await fetch(`/api/pms/reservations/${selectedRes.id}/send-b2b-credential-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          toEmail: formAgencyAgentEmail || selectedRes.agencyAgentEmail || ""
        })
      })
      const json = await resp.json().catch(() => ({}))
      if (resp.ok && (json.ok || json.success)) {
        toast({
          title: "E-mail Cordial Enviado à Agência!",
          description: `Solicitação de credenciamento enviada para ${json.sentTo || json.recipient || formAgencyAgentEmail}.`
        })
        fetchCommunications(selectedRes.code || selectedRes.id)
      } else {
        toast({
          title: "Falha ao enviar e-mail",
          description: json.error || "Verifique o e-mail do agente B2B.",
          variant: "destructive"
        })
      }
    } catch (e: any) {
      toast({ title: "Erro de conexão", description: e.message, variant: "destructive" })
    } finally {
      setSendingB2bCredentialEmail(false)
    }
  }

  const formatCentsMaskValue = (val: number | string | undefined | null, allowNegative = false): string => {
    if (val === "" || val === undefined || val === null) return "";
    const num = Number(val);
    if (isNaN(num) || num === 0) return "";
    const isNeg = allowNegative && num < 0;
    const cents = Math.round(Math.abs(num) * 100);
    if (cents === 0) return "";
    const formatted = (cents / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return isNeg ? `-${formatted}` : formatted;
  };

  const parseCentsMaskInput = (raw: string, allowNegative = false): number => {
    const isNeg = allowNegative && raw.trim().startsWith("-");
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    const cents = parseInt(digits, 10);
    if (isNaN(cents) || cents === 0) return 0;
    const val = Number((cents / 100).toFixed(2));
    return isNeg ? -val : val;
  };

  const keepCurrencyCursorAtEnd = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    requestAnimationFrame(() => {
      try {
        if (target.selectionStart === target.selectionEnd) {
          const len = target.value.length;
          target.setSelectionRange(len, len);
        }
      } catch {}
    });
  };

  const calculateTotal = () => {
    let nightsSubtotal = 0;
    if (formDailyRates && formDailyRates.length > 0) {
      nightsSubtotal = formDailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0);
    } else {
      try {
        const d1 = parseISO(formCheckin);
        const d2 = parseISO(formCheckout);
        const nights = Math.max(1, differenceInDays(d2, d1));
        nightsSubtotal = nights * (Number(formDailyRate) || 0);
      } catch {
        nightsSubtotal = 0;
      }
    }
    const chargesSubtotal = formCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    return Number(Math.max(0, nightsSubtotal + chargesSubtotal).toFixed(2));
  }

  // ── Helpers de Gerenciamento de Diárias & Pagamentos ──────────────
  // Sincroniza o Total Composto (diárias + taxas) e pré-preenche sempre o Valor Pago com o mesmo total composto
  const syncCompositeTotalAndPaid = (
    newDailyRates: DailyRateItem[] = formDailyRates,
    newCharges: ReservationChargeItem[] = formCharges,
    targetChannel: string = formChannel,
    targetMethod?: string
  ) => {
    const subNights = newDailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0);
    const subCharges = newCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    const newTot = Number(Math.max(0, subNights + subCharges).toFixed(2));
    setFormTotalAmount(String(newTot));
    setPackageTotalInput(newTot > 0 ? String(newTot) : "");
    if (newDailyRates.length > 0 && subNights > 0) {
      setFormDailyRate(String(Math.round((subNights / newDailyRates.length) * 100) / 100));
    }

    const isBooking = targetChannel === "booking";
    const isB2b = targetChannel === "b2b";
    const resolvedMethod = targetMethod || (isBooking ? "booking" : (targetChannel === "airbnb" ? "airbnb" : (isB2b ? (formB2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b") : formPaymentMethod)));
    const rmLower = String(resolvedMethod || "").toLowerCase();
    const isFaturadoSync = Boolean(
      formIsFaturadoBoleto ||
      rmLower === "boleto_faturado" ||
      rmLower === "faturado_boleto" ||
      rmLower === "boleto" ||
      rmLower === "faturado_pj" ||
      rmLower === "faturado_b2b"
    );

    if (isBooking) {
      setFormPaymentMethod("booking");
      setFormPaymentStatus("pago_total");
    } else if (targetChannel === "airbnb") {
      setFormPaymentMethod("airbnb");
      setFormPaymentStatus("pago_total");
    } else if (isB2b || isFaturadoSync) {
      setFormPaymentMethod(isFaturadoSync && !isB2b ? "boleto_faturado" : resolvedMethod);
      const nonSyntheticPays = formPayments.filter(p =>
        p && !(isFaturadoSync && /^(pagamento integral|pagamento inicial)$/i.test(String(p.notes || "").trim()))
      );
      if (nonSyntheticPays.length === 0) {
        if (formPayments.length > 0) setFormPayments([]);
        setFormPaidAmount("0");
        setFormPaymentStatus("pendente");
        return newTot;
      }
    }

    // Pré-Reserva (canal direto) nunca tem valor pago: atualiza apenas o total
    if (formStatus === "pre_reserva" && !isBooking && targetChannel !== "airbnb") {
      setFormPaidAmount("0");
      setFormPayments([]);
      setFormPaymentStatus("pendente");
      return newTot;
    }

    // Ao editar uma reserva existente (selectedRes !== null), preserva o valor efetivamente recebido
    // para diárias diretas (WhatsApp/Site/Balcão/Empresa) gerando saldo pendente, mas soma automaticamente
    // como pagas novas diárias lançadas com canal Airbnb ou Booking.com.
    const isOtaTarget = isBooking || targetChannel === "airbnb";
    const origDates = new Set<string>();
    if (selectedRes) {
      if (Array.isArray(selectedRes.dailyRates) && selectedRes.dailyRates.length > 0) {
        selectedRes.dailyRates.forEach((od: any) => { if (od?.date) origDates.add(String(od.date)); });
      } else if (selectedRes.checkinDate && selectedRes.checkoutDate) {
        const d1 = new Date(selectedRes.checkinDate + "T12:00:00");
        const d2 = new Date(selectedRes.checkoutDate + "T12:00:00");
        const n = Math.max(1, differenceInDays(d2, d1));
        for (let i = 0; i < n; i++) {
          origDates.add(format(addDays(d1, i), "yyyy-MM-dd"));
        }
      }
    }
    const addedRates = selectedRes ? newDailyRates.filter(d => d.date && !origDates.has(d.date)) : [];
    const addedOtaRates = addedRates.filter(d => d.channel === "booking" || d.channel === "airbnb");
    const addedOtaSum = Number(addedOtaRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0).toFixed(2));
    const hasAnyDirectNight = newDailyRates.some(d => d.channel && d.channel !== "booking" && d.channel !== "airbnb" && d.channel !== "b2b");

    const hasOtaDirectExtension = isOtaTarget && Boolean(
      selectedRes && (
        hasAnyDirectNight ||
        ((selectedRes.paymentStatus === "sinal_pago" || selectedRes.paymentStatus === "parcial") && hasAnyDirectNight)
      )
    );
    if (selectedRes && ((!isOtaTarget && !isB2b) || hasOtaDirectExtension)) {
      const manualPayments = formPayments.filter(p => p.id !== "pay_auto_ota_ext");
      const manualPaidSum = manualPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const currentPaidSum = Number((manualPaidSum + addedOtaSum).toFixed(2));
      if (addedOtaSum > 0) {
        const otaExtMethod = addedOtaRates.some(d => d.channel === "booking") ? "booking" : "airbnb";
        const otaExtLabel = otaExtMethod === "booking" ? "Booking.com" : "Airbnb";
        setFormPayments([
          ...manualPayments,
          {
            id: "pay_auto_ota_ext",
            amount: addedOtaSum,
            method: otaExtMethod,
            category: "adicional",
            date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
            notes: `Diária adicional ${otaExtLabel} (Quitada)`
          }
        ]);
      } else if (formPayments.some(p => p.id === "pay_auto_ota_ext")) {
        setFormPayments(manualPayments);
      }
      setFormPaidAmount(String(currentPaidSum));
      if (currentPaidSum >= newTot && newTot > 0) {
        setFormPaymentStatus("pago_total");
      } else if (currentPaidSum > 0) {
        setFormPaymentStatus("sinal_pago");
      } else {
        setFormPaymentStatus("pendente");
      }
      return newTot;
    }

    // Para novas reservas já marcadas como confirmadas (ou OTAs sem diária extra direta), pré-preenche o valor pago com o total composto
    setFormPaidAmount(String(newTot));

    setFormPayments(prev => {
      if (prev.length <= 1) {
        return [{
          id: prev[0]?.id || `pay_${Date.now()}`,
          amount: newTot,
          method: resolvedMethod || (isBooking ? "booking" : "pix"),
          category: prev[0]?.category || "quitacao",
          date: prev[0]?.date || format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          notes: prev[0]?.notes || (isBooking ? "Pagamento integral Booking.com" : (targetChannel === "airbnb" ? "Pagamento integral Airbnb" : "Pagamento integral"))
        }];
      }
      return prev;
    });

    return newTot;
  };

  // Sincronização centralizada de datas (via digitação manual ou calendário único)
  const handleDatesChange = (newCin: string, newCout: string) => {
    setFormCheckin(newCin);
    setFormCheckout(newCout);
    const dCin = safeParseDate(newCin);
    const dCout = safeParseDate(newCout);
    if (dCin && dCout && dCin < dCout) {
      const updated = buildReservationDailyRates(newCin, newCout, Number(formDailyRate) || 250, formChannel, formDailyRates);
      setFormDailyRates(updated);
      syncCompositeTotalAndPaid(updated, formCharges, formChannel);
    }
  };

  const handleCheckinChange = (val: string) => {
    setFormCheckin(val);
    const dCin = safeParseDate(val);
    let targetCout = formCheckout;
    let dCout = safeParseDate(targetCout);
    if (dCin && (!dCout || dCin >= dCout)) {
      const nextDay = addDays(dCin, 1);
      targetCout = format(nextDay, "yyyy-MM-dd");
      dCout = nextDay;
      setFormCheckout(targetCout);
    }
    if (dCin && dCout && dCin < dCout) {
      const updated = buildReservationDailyRates(val, targetCout, Number(formDailyRate) || 250, formChannel, formDailyRates);
      setFormDailyRates(updated);
      syncCompositeTotalAndPaid(updated, formCharges, formChannel);
    }
  };

  const handleCheckoutChange = (val: string) => {
    setFormCheckout(val);
    const dCin = safeParseDate(formCheckin);
    const dCout = safeParseDate(val);
    if (dCin && dCout && dCin < dCout) {
      const updated = buildReservationDailyRates(formCheckin, val, Number(formDailyRate) || 250, formChannel, formDailyRates);
      setFormDailyRates(updated);
      syncCompositeTotalAndPaid(updated, formCharges, formChannel);
    }
  };

  // ── Funções de Gestão de Taxas, Adicionais & Rateio Inteligente ──
  const handleAddCharge = (type: ReservationChargeItem["type"], defaultTitle: string, defaultAmount: number) => {
    const amt = (type === "cleaning" && defaultAmount === 80) ? 50 : defaultAmount;
    const newCharge: ReservationChargeItem = {
      id: `charge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      title: defaultTitle,
      amount: amt,
      notes: ""
    };
    const updated = [...formCharges, newCharge];
    setFormCharges(updated);
    syncCompositeTotalAndPaid(formDailyRates, updated, formChannel);
    toast({
      title: "Taxa Adicionada",
      description: `${defaultTitle} (R$ ${amt > 0 ? amt.toFixed(2) : `-${Math.abs(amt).toFixed(2)}`}) incluída no custo da estadia.`
    });
  };

  const handleRemoveCharge = (chargeId: string) => {
    const updated = formCharges.filter(c => c.id !== chargeId);
    setFormCharges(updated);
    syncCompositeTotalAndPaid(formDailyRates, updated, formChannel);
  };

  const handleUpdateCharge = (chargeId: string, field: keyof ReservationChargeItem, value: any) => {
    const updated = formCharges.map(c => {
      if (c.id === chargeId) {
        return { ...c, [field]: value };
      }
      return c;
    });
    setFormCharges(updated);
    syncCompositeTotalAndPaid(formDailyRates, updated, formChannel);
  };

  const handleDistributeTotalToNights = (targetTotal: number) => {
    if (targetTotal <= 0) {
      toast({
        title: "Valor Inválido",
        description: "Informe um valor total maior que zero para ratear.",
        variant: "destructive"
      });
      return;
    }
    const nightsCount = formDailyRates.length || 1;
    const totalCharges = formCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
    const amountForNights = Math.max(0, targetTotal - totalCharges);

    const baseNightRate = Math.floor((amountForNights / nightsCount) * 100) / 100;
    const remainder = Number((amountForNights - (baseNightRate * nightsCount)).toFixed(2));

    const updatedDailyRates = formDailyRates.map((item, idx) => {
      const rate = idx === formDailyRates.length - 1 ? Number((baseNightRate + remainder).toFixed(2)) : baseNightRate;
      return { ...item, rate };
    });

    setFormDailyRates(updatedDailyRates);
    syncCompositeTotalAndPaid(updatedDailyRates, formCharges, formChannel);
    toast({
      title: "Rateio Realizado com Sucesso!",
      description: `R$ ${targetTotal.toFixed(2)} distribuído em ${nightsCount} diária(s)${totalCharges > 0 ? ` (descontando R$ ${totalCharges.toFixed(2)} de taxas/adicionais)` : ""}.`
    });
  };

  // ── Regra oficial de Status x Pagamento (canais diretos) ──
  // Pré-Reserva = nenhum valor pago. Confirmada = quitada por padrão (mantém sinal já lançado).
  const handleSelectPreReserva = () => {
    const isOta = formChannel === "booking" || formChannel === "airbnb"
    if (isOta) {
      toast({
        title: "Reserva de OTA",
        description: "Reservas Booking/Airbnb são sempre confirmadas e pagas pela plataforma."
      })
      return
    }
    const hasManualPayments = Boolean(selectedRes) && formPayments.some(p => Number(p.amount) > 0)
    if (hasManualPayments && !confirm("Pré-reserva não pode ter valor pago.\n\nOs pagamentos lançados nesta reserva serão removidos. Deseja continuar?")) {
      return
    }
    setFormStatus("pre_reserva")
    setFormPayments([])
    setFormPaidAmount("0")
    setFormPaymentStatus("pendente")
    if (!formHoldManuallyChosen) {
      setFormHoldPreset(getDefaultHoldPresetForCheckin(formCheckin))
    }
  }

  const handleSelectConfirmada = () => {
    setFormStatus("confirmada")
    const pmLower = String(formPaymentMethod || "").toLowerCase()
    const isFaturadoMode = Boolean(
      formIsFaturadoBoleto ||
      formChannel === "b2b" ||
      pmLower === "boleto_faturado" ||
      pmLower === "faturado_boleto" ||
      pmLower === "boleto" ||
      pmLower === "faturado_pj" ||
      pmLower === "faturado_b2b"
    )
    if (isFaturadoMode) {
      // Reserva faturada no boleto / B2B pode ser confirmada sem pagamento antecipado (permanece a faturar / pendente)
      return
    }
    const curPaid = formPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    if (curPaid > 0) return // mantém sinal/quitação já lançados
    const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal()
    if (curTot <= 0) return
    const isBooking = formChannel === "booking"
    const isAirbnb = formChannel === "airbnb"
    setFormPayments([{
      id: `pay_${Date.now()}`,
      amount: curTot,
      method: isBooking ? "booking" : (isAirbnb ? "airbnb" : (formPaymentMethod || "pix")),
      category: "quitacao",
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      notes: isBooking ? "Pagamento integral Booking.com" : (isAirbnb ? "Pagamento integral Airbnb" : "Pagamento integral")
    }])
    setFormPaidAmount(String(curTot))
    setFormPaymentStatus("pago_total")
  }

  const handleAddPayment = (customAmount?: number, customMethod?: string, customNotes?: string) => {
    const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal()
    const curPaid = formPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    const remaining = Math.max(0, curTot - curPaid)
    const amt = customAmount !== undefined ? customAmount : (remaining > 0 ? remaining : (Number(formDailyRate) || 250))
    const newPay: ReservationPaymentItem = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      amount: amt,
      method: customMethod || formPaymentMethod || "pix",
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      notes: customNotes || (remaining > 0 && amt === remaining ? "Quitação de saldo" : "")
    }
    const updated = [...formPayments, newPay]
    setFormPayments(updated)
    const newPaidSum = updated.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    setFormPaidAmount(String(newPaidSum))
    if (newPaidSum >= curTot && curTot > 0) {
      setFormPaymentStatus("pago_total")
    } else if (newPaidSum > 0) {
      setFormPaymentStatus("sinal_pago")
    } else {
      setFormPaymentStatus("pendente")
    }
    // Regra: qualquer valor pago (sinal ou quitação) confirma a reserva
    if (newPaidSum > 0) setFormStatus("confirmada")
  }

  const handleRemovePayment = (payId: string) => {
    const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal()
    const updated = formPayments.filter(p => p.id !== payId)
    setFormPayments(updated)
    const newPaidSum = updated.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    setFormPaidAmount(String(newPaidSum))
    if (newPaidSum >= curTot && curTot > 0) {
      setFormPaymentStatus("pago_total")
    } else if (newPaidSum > 0) {
      setFormPaymentStatus("sinal_pago")
    } else {
      setFormPaymentStatus("pendente")
    }
    // Regra: qualquer valor pago (sinal ou quitação) confirma a reserva
    if (newPaidSum > 0) setFormStatus("confirmada")
  }

  const handleUpdatePayment = (payId: string, field: keyof ReservationPaymentItem, value: any) => {
    const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal()
    const updated = formPayments.map(p => {
      if (p.id === payId) {
        return { ...p, [field]: value }
      }
      return p
    })
    setFormPayments(updated)
    const newPaidSum = updated.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
    setFormPaidAmount(String(newPaidSum))
    if (newPaidSum >= curTot && curTot > 0) {
      setFormPaymentStatus("pago_total")
    } else if (newPaidSum > 0) {
      setFormPaymentStatus("sinal_pago")
    } else {
      setFormPaymentStatus("pendente")
    }
    // Regra: qualquer valor pago (sinal ou quitação) confirma a reserva
    if (newPaidSum > 0) setFormStatus("confirmada")
  }

  const handleAddExtraNight = () => {
    try {
      const currentRates = formDailyRates.length > 0 
        ? formDailyRates 
        : buildReservationDailyRates(formCheckin, formCheckout, Number(formDailyRate) || 250, formChannel)
      const lastNight = currentRates[currentRates.length - 1]
      const nextDateStr = lastNight 
        ? format(addDays(parseISO(lastNight.date), 1), "yyyy-MM-dd")
        : (formCheckout || format(new Date(), "yyyy-MM-dd"))
      const newCheckoutStr = format(addDays(parseISO(nextDateStr), 1), "yyyy-MM-dd")
      
      const defaultExtraChannel = (selectedRes && (formChannel === "booking" || formChannel === "airbnb"))
        ? "whatsapp"
        : (lastNight ? lastNight.channel : formChannel)
      const newNightItem: DailyRateItem = {
        date: nextDateStr,
        rate: lastNight ? Number(lastNight.rate) : (Number(formDailyRate) || 250),
        channel: defaultExtraChannel,
        notes: "Diária extra"
      }
      const updatedRates = [...currentRates, newNightItem]
      setFormDailyRates(updatedRates)
      setFormCheckout(newCheckoutStr)
      syncCompositeTotalAndPaid(updatedRates, formCharges, formChannel)
      toast({ title: "Diária Adicionada", description: `Nova diária em ${format(parseISO(nextDateStr), "dd/MM")}. Check-out ajustado para ${format(parseISO(newCheckoutStr), "dd/MM")}.` })
    } catch (e: any) {
      console.error(e)
    }
  }

  const handleRemoveLastNight = () => {
    if (formDailyRates.length <= 1) {
      toast({ title: "Atenção", description: "A reserva precisa ter no mínimo 1 diária.", variant: "destructive" })
      return
    }
    const updatedRates = formDailyRates.slice(0, -1)
    const lastRemaining = updatedRates[updatedRates.length - 1]
    const newCheckoutStr = format(addDays(parseISO(lastRemaining.date), 1), "yyyy-MM-dd")
    setFormDailyRates(updatedRates)
    setFormCheckout(newCheckoutStr)
    syncCompositeTotalAndPaid(updatedRates, formCharges, formChannel)
    toast({ title: "Diária Removida", description: `Check-out ajustado para ${format(parseISO(newCheckoutStr), "dd/MM")}.` })
  }

  const handleSaveRes = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formFlatId) {
      toast({
        title: "Apartamento obrigatório",
        description: "Por favor, selecione o apartamento (Flat) da reserva.",
        variant: "destructive"
      })
      return
    }
    const hasSeparateRequester = formRequesterType !== "guest" || formChannel === "b2b"
    if (!formGuestName.trim() && !hasSeparateRequester) {
      toast({
        title: "Nome do Hóspede obrigatório",
        description: "Por favor, preencha o nome do hóspede titular (ou selecione um Solicitante para preencher depois via link).",
        variant: "destructive"
      })
      return
    }
    if (!formGuestName.trim() && hasSeparateRequester) {
      if (formRequesterType === "other_person" && !formRequesterName.trim()) {
        toast({
          title: "Solicitante obrigatório",
          description: "Informe o nome do Solicitante (ou preencha o nome do hóspede).",
          variant: "destructive"
        })
        return
      }
      if (formRequesterType === "company" && !formCompanyId && !formCompanyName.trim()) {
        toast({
          title: "Empresa obrigatória",
          description: "Selecione a Empresa Solicitante (ou preencha o nome do hóspede).",
          variant: "destructive"
        })
        return
      }
      if ((formRequesterType === "agency_b2b" || formChannel === "b2b") && !formAgencyId && !formAgencyName.trim() && !formCompanyId && !formCompanyName.trim()) {
        toast({
          title: "Agência / Empresa B2B obrigatória",
          description: "Selecione a Agência ou Empresa B2B (ou preencha o nome do hóspede).",
          variant: "destructive"
        })
        return
      }
    }
    if (!formCheckin || !formCheckout) {
      toast({
        title: "Datas obrigatórias",
        description: "Por favor, preencha as datas de check-in e check-out.",
        variant: "destructive"
      })
      return
    }
    if (formCheckout <= formCheckin) {
      toast({
        title: "Período inválido",
        description: "A data de check-out deve ser posterior à data de check-in.",
        variant: "destructive"
      })
      return
    }

    if (activeServiceBlockConflict) {
      const flatObj = data.flats.find(f => String(f.id) === String(formFlatId));
      const flatNum = flatObj?.number || formFlatId;
      const servTitle = activeServiceBlockConflict.serviceTitle || activeServiceBlockConflict.title || "Serviço Externo";
      const workerTxt = activeServiceBlockConflict.workerName ? ` (Prestador: ${activeServiceBlockConflict.workerName})` : "";
      const proceed = confirm(
        `⚠️ AVISO DE CONFLITO COM SERVIÇO EXTERNO\n\n` +
        `Este apartamento (Apt ${flatNum}) possui serviço externo agendado/em andamento neste período: ${servTitle}${workerTxt}.\n\n` +
        `A reserva pode ser criada, mas o flat pode estar indisponível.\n\n` +
        `Deseja prosseguir e salvar a reserva mesmo assim?`
      );
      if (!proceed) {
        return;
      }
    }

    if (formGuestPhone.trim().replace(/\D/g, "").length >= 10) {
      const cleanDigits = cleanWhatsAppPhone(formGuestPhone);
      let ver = phoneVerification && phoneVerification.phone === cleanDigits && phoneVerification.checked !== undefined ? phoneVerification : null;
      if (!ver) {
        setSavingRes(true);
        ver = await verifyGuestPhoneWhatsApp(formGuestPhone);
        setSavingRes(false);
      }
      if (ver && ver.checked && ver.exists === false) {
        const proceed = confirm(
          `⚠️ Atenção: O telefone informado (${formGuestPhone}) NÃO possui conta ativa no WhatsApp (possível erro de digitação no DDD ou no 9º dígito).\n\nDeseja salvar a reserva mesmo assim?`
        );
        if (!proceed) {
          return;
        }
      }
    }

    setSavingRes(true)
    try {
      const calcTot = calculateTotal()
      const nightsSubInSave = formDailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)
      const chargesSubInSave = formCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
      const rawFormTot = Number(formTotalAmount) || 0
      const totalAmount = (!selectedRes?.earlyCheckout && chargesSubInSave !== 0 && Math.abs(rawFormTot - nightsSubInSave) < 0.05)
        ? calcTot
        : (rawFormTot > 0 ? rawFormTot : calcTot)
      const isOta = formChannel === "booking" || formChannel === "airbnb"
      const isB2b = formChannel === "b2b" || formRequesterType === "agency_b2b"
      const cleanedFormPayments = formIsFaturadoBoleto && !selectedRes?.pixEndToEndId && !selectedRes?.mpPaymentId
        ? formPayments.filter(p =>
            p && (
              String(p.id || "").startsWith("pay_bol_") ||
              !/^(pagamento integral|pagamento inicial|complemento de quita[cç][aã]o)$/i.test(String(p.notes || "").trim())
            )
          )
        : formPayments
      const sumPaidFromList = cleanedFormPayments.length > 0
        ? cleanedFormPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
        : (formIsFaturadoBoleto ? 0 : (Number(formPaidAmount) || 0))
      let resolvedPaidAmount = sumPaidFromList
      let resolvedMethod = formIsFaturadoBoleto ? "boleto_faturado" : formPaymentMethod
      let normalizedPayments = cleanedFormPayments
      let resolvedPaymentStatus = "pendente"

      const hasOtaPartialExtensionInForm = isOta && Boolean(
        sumPaidFromList > 0 && sumPaidFromList < totalAmount - 0.01 && (
          formPaymentStatus === "sinal_pago" ||
          formPaymentStatus === "parcial" ||
          formDailyRates.some(d => d.channel && d.channel !== "booking" && d.channel !== "airbnb" && d.channel !== "b2b")
        )
      )

      if ((formChannel === "booking" || formChannel === "airbnb") && !hasOtaPartialExtensionInForm) {
        resolvedPaymentStatus = "pago_total"
        resolvedPaidAmount = totalAmount
        resolvedMethod = formChannel
        const otaLabel = formChannel === "booking" ? "Booking.com" : "Airbnb"
        if (!normalizedPayments || normalizedPayments.length === 0) {
          normalizedPayments = [{
            id: `pay_${Date.now()}`,
            amount: totalAmount,
            method: formChannel,
            category: "quitacao",
            date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
            notes: `Pagamento integral ${otaLabel}`
          }]
        } else if (normalizedPayments.length === 1) {
          normalizedPayments = [{
            ...normalizedPayments[0],
            amount: totalAmount,
            method: formChannel,
            category: "quitacao",
            notes: normalizedPayments[0].notes || `Pagamento integral ${otaLabel}`
          }]
        }
      } else if (resolvedPaidAmount >= totalAmount && totalAmount > 0) {
        resolvedPaymentStatus = "pago_total"
      } else if (resolvedPaidAmount > 0) {
        resolvedPaymentStatus = "sinal_pago"
      } else {
        resolvedPaymentStatus = "pendente"
      }

      // Regra oficial Pré-Reserva x Confirmada (canais diretos):
      // - Pré-Reserva: nenhum valor pago (pagamentos zerados, status pendente)
      // - Qualquer valor pago > 0 ou Reserva B2B: reserva é Confirmada
      let statusToSave: string = formStatus
      if (selectedRes && formStatus === "confirmada") {
        const prevStLower = String(selectedRes.status || "").toLowerCase()
        const isStillCheckedOut = Boolean(selectedRes.earlyCheckout || selectedRes.checkoutDone) &&
          (!formCheckout || !selectedRes.checkoutDate || formCheckout <= selectedRes.checkoutDate)
        if ((prevStLower === "completed" || prevStLower === "checked_out") && isStillCheckedOut) {
          statusToSave = selectedRes.status
        } else if (prevStLower === "in_house" || prevStLower === "hospedado" || prevStLower === "checkin") {
          statusToSave = selectedRes.status
        }
      }
      if (!isOta) {
        if (isB2b) {
          if (statusToSave === "pre_reserva") statusToSave = "confirmada"
        } else if (formStatus === "pre_reserva") {
          normalizedPayments = []
          resolvedPaidAmount = 0
          resolvedPaymentStatus = "pendente"
        } else if (resolvedPaidAmount > 0 && statusToSave === "pre_reserva") {
          statusToSave = "confirmada"
        }
      }

      const numG = Number(formGuestCount) || 1
      const rawCandidateGuest1Id =
        formGuestId && formGuestId !== "manual"
          ? Number(formGuestId)
          : (!formGuestId && selectedRes && areGuestNamesCompatibleUI(formGuestName, selectedRes.guestName)
              ? (selectedRes.guests?.[0]?.guestId || selectedRes.guestId || null)
              : null)
      const linkedCrmGuest1 = rawCandidateGuest1Id
        ? crmGuests.find(cg => Number(cg.id) === Number(rawCandidateGuest1Id))
        : null
      const resolvedGuest1Id =
        rawCandidateGuest1Id && (!linkedCrmGuest1 || areGuestNamesCompatibleUI(formGuestName, linkedCrmGuest1.name || linkedCrmGuest1.fullName))
          ? rawCandidateGuest1Id
          : null

      const guestsPayload: any[] = [
        {
          index: 1,
          guestId: resolvedGuest1Id,
          name: formGuestName.trim(),
          cpf: formGuest1Cpf.trim(),
          phone: formGuestPhone.trim(),
          email: formGuestEmail.trim()
        }
      ]
      if (numG >= 2) {
        const resolvedGuest2Id =
          formGuest2Id && formGuest2Id !== "manual"
            ? Number(formGuest2Id)
            : (!formGuest2Id && selectedRes?.guests?.[1]?.guestId && areGuestNamesCompatibleUI(formGuest2Name, selectedRes?.guests?.[1]?.name)
                ? Number(selectedRes.guests[1].guestId)
                : null)
        guestsPayload.push({
          index: 2,
          guestId: resolvedGuest2Id,
          name: formGuest2Name.trim() || "Hóspede 2",
          cpf: formGuest2Cpf.trim(),
          phone: formGuest2Phone.trim(),
          email: formGuest2Email.trim()
        })
      }
      if (numG === 3) {
        const resolvedGuest3Id =
          formGuest3Id && formGuest3Id !== "manual"
            ? Number(formGuest3Id)
            : (!formGuest3Id && selectedRes?.guests?.[2]?.guestId && areGuestNamesCompatibleUI(formGuest3Name, selectedRes?.guests?.[2]?.name)
                ? Number(selectedRes.guests[2].guestId)
                : null)
        guestsPayload.push({
          index: 3,
          guestId: resolvedGuest3Id,
          name: formGuest3Name.trim() || "Hóspede 3",
          cpf: formGuest3Cpf.trim(),
          phone: formGuest3Phone.trim(),
          email: formGuest3Email.trim()
        })
      }

      const selectedComp = companies.find(c => String(c.id) === formCompanyId)
      const selectedAg = agencies.find((a: any) => String(a.id) === formAgencyId)
      const resolvedReqType = formRequesterType || (isB2b ? "agency_b2b" : (formCompanyId || formCompanyName ? "company" : "guest"))
      const resolvedCompName = (
        selectedRes && String(selectedRes.companyId || "") === String(formCompanyId || "") && selectedRes.companyName
          ? selectedRes.companyName
          : (selectedComp ? (selectedComp.tradeName || selectedComp.corporateName) : formCompanyName)
      ) || ""
      const resolvedAgName = (selectedAg ? (selectedAg.tradeName || selectedAg.corporateName) : formAgencyName) || ""
      const resolvedAgCnpj = (selectedAg ? selectedAg.cnpj : formAgencyCnpj) || ""
      const commPct = formB2bRatePolicy === "NET" ? 0 : (Number(formB2bCommissionPct) || 0)
      const commAmt = Number(((totalAmount * commPct) / 100).toFixed(2))
      const netAmt = Number((totalAmount - commAmt).toFixed(2))
      const resolvedRequesterGuestId =
        formRequesterId && formRequesterId !== "manual"
          ? Number(formRequesterId)
          : (!formRequesterId && selectedRes?.requesterInfo?.guestId && areGuestNamesCompatibleUI(formRequesterName, selectedRes?.requesterInfo?.name)
              ? Number(selectedRes.requesterInfo.guestId)
              : null)

      const holdInfoForSave = statusToSave === "pre_reserva" ? computeHoldExpirationInfo() : null
      const baseExtCinForSave = selectedRes
        ? (selectedRes.pendingStayExtension?.isPreReservationHold
            ? (selectedRes.pendingStayExtension.oldCheckinDate || selectedRes.checkinDate)
            : selectedRes.checkinDate)
        : ""
      const baseExtCoutForSave = selectedRes
        ? (selectedRes.pendingStayExtension?.isPreReservationHold
            ? (selectedRes.pendingStayExtension.oldCheckoutDate || selectedRes.checkoutDate)
            : selectedRes.checkoutDate)
        : ""
      const hasAddedDirectNightForSave = Boolean(
        selectedRes &&
        statusToSave !== "pre_reserva" &&
        !formIsFaturadoBoleto &&
        !isB2b &&
        resolvedPaidAmount < totalAmount - 0.01 &&
        formDailyRates.some(d => {
          const ch = String(d.channel || "").toLowerCase()
          const isPaidOtaOrB2bChan = ch.includes("booking") || ch.includes("airbnb") || ch.includes("b2b")
          return !isPaidOtaOrB2bChan && (d.date < baseExtCinForSave || d.date >= baseExtCoutForSave)
        })
      )
      const extHoldInfoForSave =
        hasAddedDirectNightForSave && formExtensionHoldMode === "pre_reserva"
          ? computeHoldExpirationInfo()
          : null
      const isReactivatingNow = Boolean(isReactivatingRes || selectedRes?.status === "expirada")
      const hasCompanyLink = Boolean(resolvedReqType === "company" || formInvoiceRecipientType === "company" || isB2b)
      const resolvedInvRecType: "company" | "agency" | "guest" | "requester" = isB2b
        ? formInvoiceRecipientType
        : (formInvoiceRecipientType === "agency"
            ? (resolvedReqType === "company" ? "company" : "guest")
            : (formInvoiceRecipientType === "requester" && resolvedReqType !== "other_person"
                ? "guest"
                : formInvoiceRecipientType))

      const payload: any = {
        flatId: Number(formFlatId),
        guestId: resolvedGuest1Id,
        guestName: formGuestName.trim(),
        guestPhone: formGuestPhone.trim(),
        guestEmail: formGuestEmail.trim(),
        guestDocument: formGuest1Cpf.trim(),
        guestCount: numG,
        guests: guestsPayload,
        requesterType: resolvedReqType,
        requesterInfo: (resolvedReqType === "other_person" || resolvedReqType === "company") ? {
          guestId: resolvedRequesterGuestId,
          name: formRequesterName.trim() || (resolvedReqType === "company" ? (selectedComp?.contactPerson || resolvedCompName) : ""),
          cpf: formRequesterCpf.trim(),
          phone: formRequesterPhone.trim() || (resolvedReqType === "company" ? (selectedComp?.phone || (selectedComp as any)?.telefone || "") : ""),
          email: formRequesterEmail.trim() || (resolvedReqType === "company" ? ((selectedComp as any)?.email || selectedComp?.financialEmail || (selectedComp as any)?.emailFinanceiro || "") : "")
        } : (isB2b ? {
          name: formAgencyAgentName.trim() || resolvedAgName,
          phone: formAgencyAgentPhone.trim(),
          email: formAgencyAgentEmail.trim()
        } : null),
        companyId: hasCompanyLink && formCompanyId ? Number(formCompanyId) : null,
        companyName: hasCompanyLink ? resolvedCompName : "",
        companyCnpj: hasCompanyLink && selectedComp?.cnpj ? selectedComp.cnpj : undefined,
        costCenter: formCostCenter.trim() || undefined,
        agencyId: isB2b && formAgencyId ? Number(formAgencyId) : (selectedRes?.agencyId || null),
        agencyName: isB2b ? (selectedAg?.corporateName || resolvedAgName) : undefined,
        agencyCorporateName: isB2b ? (selectedAg?.corporateName || resolvedAgName) : undefined,
        agencyTradeName: isB2b ? resolvedAgName : undefined,
        agencyCnpj: isB2b ? resolvedAgCnpj : undefined,
        agencyPosUnit: isB2b ? formAgencyPosUnit.trim() : undefined,
        agencyAgentName: isB2b ? formAgencyAgentName.trim() : undefined,
        agencyAgentEmail: isB2b ? formAgencyAgentEmail.trim() : undefined,
        agencyAgentPhone: isB2b ? formAgencyAgentPhone.trim() : undefined,
        b2bReservationNumber: isB2b ? formB2bReservationNumber.trim() : undefined,
        externalReservationNumber: isB2b && formB2bReservationNumber.trim() ? formB2bReservationNumber.trim() : undefined,
        b2bLocatorRloc: isB2b ? formB2bLocatorRloc.trim().toUpperCase() : undefined,
        b2bOriginType: isB2b ? formB2bOriginType : undefined,
        b2bRatePolicy: isB2b ? formB2bRatePolicy : undefined,
        b2bCommissionPct: isB2b ? commPct : undefined,
        b2bCommissionAmount: isB2b ? commAmt : undefined,
        b2bNetAmount: isB2b ? netAmt : undefined,
        b2bNetRate: isB2b ? (formDailyRates.length > 0 ? Number((netAmt / formDailyRates.length).toFixed(2)) : netAmt) : undefined,
        b2bPaymentType: isB2b ? formB2bPaymentType : undefined,
        b2bCardBrand: isB2b ? formB2bCardBrand.trim() : undefined,
        b2bCardMasked: isB2b ? formB2bCardMasked.trim() : undefined,
        b2bVcnToken: isB2b ? formB2bVcnToken.trim() : undefined,
        b2bConciliationUrl: isB2b ? formB2bConciliationUrl.trim() : undefined,
        b2bAuthorizedExpenses: isB2b ? formB2bAuthorizedExpenses.trim() : undefined,
        invoicingInstructions: isB2b ? formInvoicingInstructions.trim() : undefined,
        voucherUrl: isB2b ? formVoucherUrl.trim() : undefined,
        b2bVoucherUrl: isB2b ? formVoucherUrl.trim() : undefined,
        invoiceRecipientType: resolvedInvRecType,
        nfRecipientType: resolvedInvRecType,
        nfDeliveryEmails: (isB2b || formNfDeliveryEmails.trim())
          ? formNfDeliveryEmails.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
          : undefined,
        nfHideFromGuest: (isB2b || resolvedReqType === "company" || resolvedInvRecType === "company") ? Boolean(formNfHideFromGuest) : false,
        checkinDate: formCheckin,
        checkoutDate: formCheckout,
        checkinTime: formCheckinTime || defaultCheckinTime || "14:00",
        checkoutTime: formCheckoutTime || defaultCheckoutTime || "12:00",
        status: formIsFaturadoBoleto && statusToSave === "pre_reserva" ? "confirmada" : statusToSave,
        ...(holdInfoForSave && !formIsFaturadoBoleto ? {
          holdPreset: holdInfoForSave.holdPreset,
          holdDurationMinutes: holdInfoForSave.holdDurationMinutes,
          holdDurationLabel: holdInfoForSave.holdDurationLabel,
          expiresAt: holdInfoForSave.expiresAt,
          sendExpirationReminder: holdInfoForSave.sendExpirationReminder
        } : {}),
        ...(hasAddedDirectNightForSave ? {
          extensionHoldMode: formExtensionHoldMode,
          ...(extHoldInfoForSave ? {
            holdPreset: extHoldInfoForSave.holdPreset,
            holdDurationMinutes: extHoldInfoForSave.holdDurationMinutes,
            holdDurationLabel: extHoldInfoForSave.holdDurationLabel,
            expiresAt: extHoldInfoForSave.expiresAt,
            sendExpirationReminder: extHoldInfoForSave.sendExpirationReminder
          } : {})
        } : (selectedRes?.pendingStayExtension?.status === "pending_payment" ? {
          extensionHoldMode: formExtensionHoldMode
        } : {})),
        ...(isReactivatingExt ? { reactivateExpiredExtension: true } : {}),
        ...(isReactivatingNow ? { reactivatePreReservation: true } : {}),
        channel: isB2b ? "b2b" : (formChannel || (formDailyRates.length > 0 && formDailyRates[0].channel) || "whatsapp"),
        paymentMethod: formIsFaturadoBoleto ? "boleto_faturado" : resolvedMethod,
        isFaturadoBoleto: Boolean(formIsFaturadoBoleto),
        boletoTermDays: Number(formBoletoTermDays) || 15,
        boletoCustomDueDate: formBoletoCustomDueDate || undefined,
        boletoConsumptionMode: formBoletoConsumptionMode,
        boletoPayerType: formBoletoPayerType,
        consumptionSamePayerAndDue: Boolean(formConsumptionSamePayerAndDue),
        consumptionPayerType: formConsumptionSamePayerAndDue ? formBoletoPayerType : formConsumptionPayerType,
        consumptionTermDays: formConsumptionSamePayerAndDue ? (Number(formBoletoTermDays) || 15) : (Number(formConsumptionTermDays) || 15),
        consumptionCustomDueDate: formConsumptionSamePayerAndDue ? (formBoletoCustomDueDate || undefined) : (formConsumptionCustomDueDate || undefined),
        boletoFinePct: Number(formBoletoFinePct ?? 2),
        boletoInterestPct: Number(formBoletoInterestPct ?? 1),
        autoEmitBoletoOnCheckout: Boolean(formAutoEmitBoletoOnCheckout),
        autoReminderEnabled: Boolean(formAutoReminderEnabled),
        financialResponsible: {
          name: formFinRespName.trim(),
          email: formFinRespEmail.trim(),
          phone: formFinRespPhone.trim(),
          whatsapp: formFinRespPhone.trim(),
          document: formFinRespDoc.trim()
        },
        billingRecipients: {
          guest: Boolean(formRecGuest),
          requester: Boolean(formRecRequester),
          company: Boolean(formRecCompany),
          financialResponsible: Boolean(formRecFinResp),
          sendEmail: Boolean(formRecSendEmail),
          sendWhatsapp: Boolean(formRecSendWhatsapp)
        },
        dailyRate: formDailyRates.length > 0 
          ? Math.round((nightsSubInSave / formDailyRates.length) * 100) / 100
          : (Number(formDailyRate) || 0),
        dailyRates: formDailyRates,
        charges: formCharges,
        cleaningFee: formCharges
          .filter(c => c.type === "cleaning")
          .reduce((acc, c) => acc + (Number(c.amount) || 0), 0),
        payments: normalizedPayments,
        totalAmount,
        paidAmount: resolvedPaidAmount,
        paymentStatus: resolvedPaymentStatus,
        notes: formNotes.trim() || formSpecialRequests.trim() || "",
        earlyCheckinAuthorized: formEarlyCheckin,
        receptionNotes: formReceptionNotes,
        autoEmitInvoice: formIsFaturadoBoleto ? true : formAutoInvoice,
        prefersHighFloor: formPrefersHighFloor,
        twinBeds: formTwinBeds,
        extraMattress: formExtraMattress,
        includeBreakfast: formIncludeBreakfast,
        specialRequests: formSpecialRequests.trim() || formNotes.trim() || "",
        isMonthlyGuest: Boolean(formIsMonthlyGuest),
        clientType: formIsMonthlyGuest
          ? "mensalista"
          : ((isB2b || resolvedReqType === "company" || formIsFaturadoBoleto || selectedRes?.clientType === "corporativo") ? "corporativo" : "avulso"),
        source: selectedRes ? "PMS Calendário (Edição Manual)" : "PMS Calendário (Nova Reserva)",
        docPhotoUrl: formDocPhotoUrl || undefined,
        hasMinor: formHasMinor,
        isCamposResident: formIsCamposResident,
        isFlatLocked: formIsFlatLocked,
        flatLocked: formIsFlatLocked,
        flatLockReason: formIsFlatLocked ? formFlatLockReason.trim() : "",
        forceOverbooking: Boolean(formForceReplace),
        vehicle: formVehiclePlate.trim() ? {
          plate: formVehiclePlate.trim().toUpperCase(),
          brand: formVehicleBrand.trim(),
          model: formVehicleModel.trim(),
          color: formVehicleColor.trim()
        } : null
      }

      const sendSaveRequest = async (bodyPayload: any) => {
        if (selectedRes) {
          return fetch(`/api/pms/reservations/${selectedRes.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
            credentials: "include"
          })
        }
        return fetch("/api/pms/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          credentials: "include"
        })
      }

      let resp: Response = await sendSaveRequest(payload)

      if (resp.status === 409) {
        const errJson = await resp.json().catch(() => ({}))
        const shouldForce = window.confirm(
          `${errJson.error || "Este flat já possui outra reserva ativa neste período!"}\n\nDeseja FORÇAR o encaixe (Overbooking) neste flat e notificar a gestão imediatamente?`
        )
        if (!shouldForce) {
          toast({
            title: "Operação cancelada",
            description: "Selecione outro flat disponível (Quarto da Vez) ou ative a opção de forçar encaixe.",
            variant: "destructive"
          })
          return
        }
        setFormForceReplace(true)
        resp = await sendSaveRequest({ ...payload, forceOverbooking: true })
      }

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        toast({
          title: "Não foi possível salvar a reserva",
          description: errJson.error || `Erro no servidor (Código ${resp.status}). Tente novamente.`,
          variant: "destructive"
        })
        return
      }

      const savedRes = await resp.json().catch(() => null)
      if (savedRes && savedRes.id) {
        setData(prev => ({
          ...prev,
          reservations: prev.reservations.map(r => r.id === savedRes.id ? { ...r, ...savedRes } : r)
        }))
        setSelectedRes(savedRes)
      }

      toast({
        title: selectedRes ? "Reserva Atualizada" : "Reserva Criada com Sucesso",
        description: `${payload.guestName} • Flat ${data.flats.find(f => f.id === Number(formFlatId))?.number || formFlatId}`
      })
      setResModalOpen(false)
      fetchData()
      notifyCalendarUpdated()
    } catch (err: any) {
      console.error("[PMS Calendar] Erro ao salvar reserva:", err)
      toast({
        title: "Erro de Conexão",
        description: err?.message || "Não foi possível comunicar com o servidor. Verifique sua conexão.",
        variant: "destructive"
      })
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

  const handleUndoEarlyCheckout = async (targetRes: any, options?: { closeModal?: boolean }) => {
    if (!targetRes?.id) return
    setUndoingEarlyCheckoutId(targetRes.id)
    try {
      const resp = await fetch(`/api/pms/reservations/${targetRes.id}/undo-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json.error || "Falha ao desfazer check-out antecipado.")
      const restored = json.reservation
      if (restored && selectedRes && String(selectedRes.id) === String(targetRes.id)) {
        setSelectedRes(restored)
        setFormCheckout(restored.checkoutDate)
        setFormNotes(restored.notes || "")
        setFormSpecialRequests(restored.specialRequests || restored.notes || "")
        setFormStatus("confirmada")
        const unitRate = Number(formDailyRate) || Number(restored.dailyRate) || 250
        const rebuiltRates = buildReservationDailyRates(
          restored.checkinDate,
          restored.checkoutDate,
          unitRate,
          restored.channel || formChannel || "whatsapp",
          Array.isArray(restored.dailyRates) ? restored.dailyRates : formDailyRates
        )
        setFormDailyRates(rebuiltRates)
      }
      const hasConflicts = Array.isArray(json.conflicts) && json.conflicts.length > 0
      const restoredBr = restored?.checkoutDate ? format(parseISO(restored.checkoutDate), "dd/MM/yyyy") : ""
      toast({
        title: "Check-out antecipado desfeito! ↩️",
        description: hasConflicts
          ? `Saída restaurada${restoredBr ? ` para ${restoredBr}` : ""}. ⚠️ Há outra reserva nas datas restauradas do Flat ${targetRes.flatNumber} — confira no mapa.`
          : `Saída do Flat ${targetRes.flatNumber} restaurada${restoredBr ? ` para ${restoredBr}` : ""} e cafés futuros reativados.`
      })
      setMobileCardResId(null)
      await fetchData(false)
      notifyCalendarUpdated()
      if (options?.closeModal !== false) {
        setResModalOpen(false)
      }
    } catch (err: any) {
      toast({
        title: "Erro ao desfazer check-out",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      })
    } finally {
      setUndoingEarlyCheckoutId(null)
    }
  }

  const handleClearFalseEarlyCheckout = async (targetRes: any, options?: { closeModal?: boolean }) => {
    if (!targetRes?.id) return
    setClearingFalseEarlyCheckoutId(targetRes.id)
    try {
      const resp = await fetch(`/api/pms/reservations/${targetRes.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clearFalseEarlyCheckout: true, source: "PMS Calendário" })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json.error || "Falha ao converter para check-out normal.")
      if (selectedRes && String(selectedRes.id) === String(targetRes.id)) {
        setSelectedRes(json)
        setFormCheckout(json.checkoutDate || selectedRes.checkoutDate)
        setFormNotes(json.notes || "")
        setFormSpecialRequests(json.specialRequests || json.notes || "")
      }
      toast({
        title: "Convertido para Check-out Normal! ✓",
        description: `O aviso de check-out antecipado foi removido do Flat ${targetRes.flatNumber} mantendo o check-out realizado em ${format(parseISO(json.checkoutDate || targetRes.checkoutDate), "dd/MM/yyyy")}.`
      })
      await fetchData(false)
      notifyCalendarUpdated()
      if (options?.closeModal) {
        setResModalOpen(false)
      }
    } catch (err: any) {
      toast({
        title: "Erro ao remover check-out antecipado",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      })
    } finally {
      setClearingFalseEarlyCheckoutId(null)
    }
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

  const {
    occupiedNightsMtd,
    totalCapacityMtd,
    mtdOccupancyRate,
    occupiedFlatIdsToday,
    blockedFlatIdsToday,
    freeFlatsTodayCount,
    checkinsToday,
    checkinsTodayCount,
    incomingGuestsTodayCount,
    checkoutsToday,
    checkoutsTodayCount,
    checkedOutTodayDoneCount,
    stayoversToday,
    stayoversTodayCount,
  } = useMemo(() => {
    if (modalOnly) {
      return {
        occupiedNightsMtd: 0,
        totalCapacityMtd: 0,
        mtdOccupancyRate: 0,
        occupiedFlatIdsToday: new Set<string>(),
        blockedFlatIdsToday: new Set<string>(),
        freeFlatsTodayCount: 0,
        checkinsToday: [] as typeof data.reservations,
        checkinsTodayCount: 0,
        incomingGuestsTodayCount: 0,
        checkoutsToday: [] as typeof data.reservations,
        checkoutsTodayCount: 0,
        checkedOutTodayDoneCount: 0,
        stayoversToday: [] as typeof data.reservations,
        stayoversTodayCount: 0,
      }
    }

    const parsedToday = parseISO(todayStr)
    const monthStartDate = startOfMonth(parsedToday)
    const monthDaysElapsed = eachDayOfInterval({ start: monthStartDate, end: parsedToday })
    const activeReservations = data.reservations.filter(r => r.status !== "cancelada")

    let occNightsMtd = 0
    monthDaysElapsed.forEach(day => {
      const dStr = format(day, "yyyy-MM-dd")
      let occupiedOnDay = 0
      for (let i = 0; i < activeReservations.length; i++) {
        const r = activeReservations[i]
        if (r.checkinDate <= dStr && r.checkoutDate > dStr) occupiedOnDay++
      }
      occNightsMtd += occupiedOnDay
    })
    const capMtd = data.flats.length * monthDaysElapsed.length
    const computedMtdOccupancyRate =
      capMtd > 0 ? Math.round((occNightsMtd / capMtd) * 100) : 0

    const occSet = new Set<string>()
    const checkins: typeof data.reservations = []
    const checkouts: typeof data.reservations = []
    const stayovers: typeof data.reservations = []

    for (let i = 0; i < activeReservations.length; i++) {
      const r = activeReservations[i]
      if (r.checkinDate <= todayStr && r.checkoutDate > todayStr) {
        occSet.add(String(r.flatId))
      }
      if (r.checkinDate === todayStr) {
        checkins.push(r)
      }
      if (r.checkoutDate === todayStr) {
        checkouts.push(r)
      }
      if (r.checkinDate < todayStr && r.checkoutDate > todayStr) {
        stayovers.push(r)
      }
    }

    const blkSet = new Set<string>()
    for (let i = 0; i < data.blocks.length; i++) {
      const b = data.blocks[i]
      if (b.startDate <= todayStr && b.endDate >= todayStr) {
        blkSet.add(String(b.flatId))
      }
    }

    const freeCount = data.flats.filter(
      f => !occSet.has(String(f.id)) && !blkSet.has(String(f.id))
    ).length

    const incomingGuests = checkins.reduce((acc, r) => {
      const count =
        Number(r.guestCount) ||
        (Array.isArray(r.guests) && r.guests.length > 0 ? r.guests.length : 1)
      return acc + count
    }, 0)

    const checkedOutDone = checkouts.filter(r =>
      Boolean(
        (r as any).isCheckedOutToday ||
          (r as any).checkoutDone ||
          r.status === "completed" ||
          r.status === "checked_out" ||
          (r as any).actualCheckoutAt
      )
    ).length

    return {
      occupiedNightsMtd: occNightsMtd,
      totalCapacityMtd: capMtd,
      mtdOccupancyRate: computedMtdOccupancyRate,
      occupiedFlatIdsToday: occSet,
      blockedFlatIdsToday: blkSet,
      freeFlatsTodayCount: freeCount,
      checkinsToday: checkins,
      checkinsTodayCount: checkins.length,
      incomingGuestsTodayCount: incomingGuests,
      checkoutsToday: checkouts,
      checkoutsTodayCount: checkouts.length,
      checkedOutTodayDoneCount: checkedOutDone,
      stayoversToday: stayovers,
      stayoversTodayCount: stayovers.length,
    }
  }, [modalOnly, data.reservations, data.flats, data.blocks, todayStr])

  const isFlatOccupiedToday = (flatId: number | string) => occupiedFlatIdsToday.has(String(flatId))
  const isFlatBlockedToday = (flatId: number | string) => blockedFlatIdsToday.has(String(flatId))

  // 7. Pedidos com Café da Manhã (Hoje e Amanhã)
  const reservationsTodayWithBf = useMemo(() => {
    if (modalOnly) return []
    return data.reservations.filter(r => 
      r.status !== "cancelada" && 
      r.checkinDate <= todayStr && 
      r.checkoutDate >= todayStr && 
      Boolean(r.includeBreakfast || r.hasBreakfast)
    )
  }, [modalOnly, data.reservations, todayStr])
  const todayReservationsWithBfCount = reservationsTodayWithBf.length
  const todayBreakfastOrdersCount = breakfastStats !== null ? breakfastStats.todayOrders : 0

  const reservationsTomorrowWithBf = useMemo(() => {
    if (modalOnly) return []
    return data.reservations.filter(r => 
      r.status !== "cancelada" && 
      r.checkinDate <= tomorrowStr && 
      r.checkoutDate >= tomorrowStr && 
      Boolean(r.includeBreakfast || r.hasBreakfast)
    )
  }, [modalOnly, data.reservations, tomorrowStr])
  const tomorrowReservationsWithBfCount = reservationsTomorrowWithBf.length
  const tomorrowBreakfastOrdersCount = breakfastStats !== null ? breakfastStats.tomorrowOrders : 0

  // Regra das 09:00 para o Café da Manhã: até 08:59 foca em HOJE; a partir das 09:00 foca em AMANHÃ
  const brasiliaHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()))
  const isAfter9Am = brasiliaHour >= 9

  // Contagem e filtro de quartos sujos vs. limpos (desativados quando modalOnly)
  const dirtyFlatsCount = useMemo(() => {
    if (modalOnly) return 0
    return data.flats.filter(f => (f as any).cleaningStatus === "dirty" || (f as any).cleaningStatus === "cleaning_now").length
  }, [modalOnly, data.flats])

  const cleanFlatsCount = useMemo(() => {
    if (modalOnly) return 0
    return data.flats.filter(f => (f as any).cleaningStatus === "clean" || !(f as any).cleaningStatus).length
  }, [modalOnly, data.flats])

  // Contagem de reservas com menores de idade e com alerta de atenção (< 30a locais)
  const minorReservationsCount = useMemo(() => {
    if (modalOnly) return 0
    return data.reservations.filter(r => r.status !== "cancelada" && r.hasMinor).length
  }, [modalOnly, data.reservations])

  const riskAttentionCount = useMemo(() => {
    if (modalOnly) return 0
    return data.reservations.filter(r => {
      if (r.status === "cancelada") return false
      const matched = data.guests.find(g => g.id === r.guestId)
      return isResCamposResident(r, matched)
    }).length
  }, [modalOnly, data.reservations, data.guests])

  const displayedFlats = useMemo(() => {
    if (modalOnly) return []
    return data.flats.filter(f => {
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
          isResCamposResident(r, data.guests.find(g => g.id === r.guestId))
        )
        if (!hasRiskInFlat) return false
      }

      return true
    })
  }, [modalOnly, data.flats, data.reservations, data.guests, cleaningFilter, specialFilter])

  const dataGuestLookup = useMemo(() => {
    const byId = new Map<any, any>()
    const byDoc = new Map<string, any>()
    const byPhone = new Map<string, any>()
    const byName = new Map<string, any>()
    for (const g of data.guests || []) {
      if (!g) continue
      if (g.id != null) byId.set(g.id, g)
      const gDoc = String(g.document || g.documentNumber || "").replace(/\D/g, "")
      if (gDoc.length >= 8 && !byDoc.has(gDoc)) byDoc.set(gDoc, g)
      const gPhone = String(g.phone || "").replace(/\D/g, "")
      if (gPhone.length >= 8 && !byPhone.has(gPhone)) byPhone.set(gPhone, g)
      const n1 = String(g.name || "").toLowerCase().trim()
      if (n1 && !byName.has(n1)) byName.set(n1, g)
      const n2 = String(g.fullName || "").toLowerCase().trim()
      if (n2 && !byName.has(n2)) byName.set(n2, g)
    }
    return { byId, byDoc, byPhone, byName }
  }, [data.guests])

  const findMatchedGuest = useCallback(
    (resItem: any) => {
      if (!resItem) return undefined
      if (resItem.guestId != null) {
        const byIdHit = dataGuestLookup.byId.get(resItem.guestId)
        if (byIdHit) return byIdHit
      }
      const cleanDoc = String(resItem.guestDocument || "").replace(/\D/g, "")
      if (cleanDoc.length >= 8) {
        const byDocHit = dataGuestLookup.byDoc.get(cleanDoc)
        if (byDocHit) return byDocHit
      }
      const cleanPhone = String(resItem.guestPhone || "").replace(/\D/g, "")
      if (cleanPhone.length >= 8) {
        const byPhoneHit = dataGuestLookup.byPhone.get(cleanPhone)
        if (byPhoneHit) return byPhoneHit
      }
      const lowerName = String(resItem.guestName || "").toLowerCase().trim()
      if (lowerName) {
        return dataGuestLookup.byName.get(lowerName)
      }
      return undefined
    },
    [dataGuestLookup]
  )

  const stableSelectGuest = useStableCallback(handleSelectGuest)
  const stableSelectRequester = useStableCallback(handleSelectRequester)
  const stableSelectGuest2 = useStableCallback(handleSelectGuest2)
  const stableSelectGuest3 = useStableCallback(handleSelectGuest3)
  const stableSelectAgency = useStableCallback(handleSelectAgency)

  const stableSelectCompanySimple = useStableCallback((val: string) => {
    if (val === "__NEW_COMPANY__") {
      handleOpenNewCompanyModal()
      return
    }
    setFormCompanyId(val)
    const c = companies.find(comp => String(comp.id) === val) as any
    if (c) {
      setFormCompanyName(c.tradeName || c.corporateName)
    }
  })

  const stableSelectCompanyCorporate = useStableCallback((val: string) => {
    if (val === "__NEW_COMPANY__") {
      handleOpenNewCompanyModal()
      return
    }
    setFormCompanyId(val)
    const c = companies.find(comp => String(comp.id) === val) as any
    if (c) {
      setFormCompanyName(c.tradeName || c.corporateName)
      if (!formRequesterName.trim() && (c.contactPerson || c.tradeName || c.corporateName)) {
        setFormRequesterName(c.contactPerson || c.tradeName || c.corporateName)
      }
      if (!formRequesterPhone.trim() && (c.phone || c.telefone)) {
        setFormRequesterPhone(c.phone || c.telefone)
      }
      if (!formRequesterEmail.trim() && (c.email || c.financialEmail || c.emailFinanceiro)) {
        setFormRequesterEmail(c.email || c.financialEmail || c.emailFinanceiro)
      }
      setFormIsFaturadoBoleto(true)
      setFormPaymentMethod("boleto_faturado")
      setFormAutoInvoice(true)
      const nonAutoCompanyPays = formPayments.filter(p =>
        p && (String(p.id || "").startsWith("pay_bol_") || !/^(pagamento integral|pagamento inicial)$/i.test(String(p.notes || "").trim()))
      )
      if (nonAutoCompanyPays.length === 0) {
        setFormPayments([])
        setFormPaidAmount("0")
        setFormPaymentStatus("pendente")
      }
      setFormBoletoPayerType("company")
      if (c.defaultBoletoTermDays || c.billingTerms) {
        const parsedDays = Number(c.defaultBoletoTermDays) || parseInt(String(c.billingTerms || "").replace(/\D/g, ""), 10) || 15
        setFormBoletoTermDays(parsedDays)
      }
      if (c.defaultBoletoConsumptionMode) {
        setFormBoletoConsumptionMode(
          c.defaultBoletoConsumptionMode === "separate_boletos" || c.defaultBoletoConsumptionMode === "separate"
            ? "separate_boletos"
            : "single_boleto"
        )
      }
      if (c.financialResponsible?.name) {
        setFormFinRespName(c.financialResponsible.name || "")
        setFormFinRespEmail(c.financialResponsible.email || "")
        setFormFinRespPhone(c.financialResponsible.phone || c.financialResponsible.whatsapp || "")
        setFormFinRespDoc(c.financialResponsible.document || "")
      }
      if (c.defaultBillingRecipients) {
        setFormRecGuest(Boolean(c.defaultBillingRecipients.guest ?? false))
        setFormRecRequester(Boolean(c.defaultBillingRecipients.requester ?? true))
        setFormRecCompany(Boolean(c.defaultBillingRecipients.company ?? true))
        setFormRecFinResp(Boolean(c.defaultBillingRecipients.financialResponsible ?? true))
        setFormRecSendEmail(c.defaultBillingRecipients.sendEmail !== false)
        setFormRecSendWhatsapp(c.defaultBillingRecipients.sendWhatsapp !== false)
      } else {
        setFormRecCompany(true)
        setFormRecRequester(true)
        setFormRecFinResp(true)
      }
    }
  })

  const stableSelectFlat = useStableCallback((val: string) => {
    isFlatManuallyChangedRef.current = true
    setFormFlatId(val)
    setFormForceReplace(false)
  })

  const stableSelectChannel = useStableCallback((val: string) => {
    setFormChannel(val)
    const allSame = formDailyRates.length <= 1 || formDailyRates.every(d => (d.channel || "whatsapp") === formChannel)
    const updatedDailyRates = allSame
      ? formDailyRates.map(d => ({ ...d, channel: val }))
      : formDailyRates
    setFormDailyRates(updatedDailyRates)

    if (val === "b2b") {
      setFormRequesterType("agency_b2b")
      setFormPaymentMethod(formB2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b")
      setFormStatus("confirmada")
      syncCompositeTotalAndPaid(updatedDailyRates, formCharges, val, formB2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b")
    } else if (val === "booking" || val === "airbnb") {
      const updatedCharges = [...formCharges]
      const cleanIdx = updatedCharges.findIndex(c => c.type === "cleaning")
      if (cleanIdx === -1) {
        updatedCharges.push({
          id: `charge_${Date.now()}_clean`,
          type: "cleaning",
          title: "Taxa de Limpeza",
          amount: 50,
          notes: ""
        })
      } else if (updatedCharges[cleanIdx].amount === 80) {
        updatedCharges[cleanIdx] = { ...updatedCharges[cleanIdx], amount: 50 }
      }
      setFormCharges(updatedCharges)
      syncCompositeTotalAndPaid(updatedDailyRates, updatedCharges, val, val)
    } else if (val === "site") {
      setFormPaymentMethod("pix")
      syncCompositeTotalAndPaid(updatedDailyRates, formCharges, val, "pix")
    } else {
      syncCompositeTotalAndPaid(updatedDailyRates, formCharges, val)
    }
  })

  const flatSelectOptions = useMemo(() => {
    const todayIso = format(new Date(), "yyyy-MM-dd")
    const isFutureCheckin = formCheckin > todayIso
    return data.flats.map(f => {
      const flatStat = fairShareResult?.allStats?.find(
        (s: any) => Number(s.flat?.id) === Number(f.id) || String(s.flat?.number) === String(f.number)
      )
      const localResConflict = (data.reservations || []).find((r: any) => {
        if (selectedRes && String(r.id) === String(selectedRes.id)) return false
        if (Number(r.flatId) !== Number(f.id) && String(r.flatNumber) !== String(f.number)) return false
        const st = String(r.status || "").toLowerCase()
        if (["cancelada", "cancelled", "no_show", "expirada"].includes(st)) return false
        if ((r.checkoutDone || r.earlyCheckout || ["completed", "checked_out", "finalizada", "concluida", "checkout"].includes(st)) && r.checkoutDate <= formCheckin) return false
        return r.checkinDate < formCheckout && r.checkoutDate > formCheckin
      })
      const localBlockConflict = (data.blocks || []).find((b: any) => {
        if (Number(b.flatId) !== Number(f.id) && String(b.flatNumber) !== String(f.number)) return false
        return b.startDate < formCheckout && b.endDate >= formCheckin
      })
      const localSameDayCheckout = (data.reservations || []).some((r: any) => {
        if (selectedRes && String(r.id) === String(selectedRes.id)) return false
        if (Number(r.flatId) !== Number(f.id) && String(r.flatNumber) !== String(f.number)) return false
        if (r.checkoutDate !== formCheckin) return false
        const st = String(r.status || "").toLowerCase()
        if (["cancelada", "cancelled", "no_show", "expirada", "completed", "checked_out", "finalizada", "concluida", "checkout"].includes(st)) return false
        if (r.checkoutDone || r.earlyCheckout || r.actualCheckoutAt) return false
        return true
      })

      const isBest = Number(fairShareResult?.bestFlatId) === Number(f.id)
      const isAvail = flatStat ? Boolean(flatStat.isAvailable) : (!localResConflict && !localBlockConflict)
      const conflictList = (flatStat?.conflicts || []).filter((c: any) => !selectedRes || String(c.id) !== String(selectedRes.id))
      const conflictName = conflictList[0]?.guestName || localResConflict?.guestName
      const blockItem = flatStat?.blocks?.[0] || localBlockConflict
      const isServiceOrMaintBlock = Boolean(
        blockItem?.isServiceBlock ||
        blockItem?.reason === "service_order" ||
        flatStat?.hasServiceOrderConflict
      )
      const isBlockedOnly =
        !isAvail &&
        !conflictName &&
        Boolean(blockItem || flatStat?.hasServiceOrderConflict || flatStat?.isFlatBlockedStatus)
      const hasSameDayTurnover = flatStat ? Boolean(flatStat.hasCheckoutOnCheckinDay) : localSameDayCheckout
      const hasCompletedSameDayCheckout = !isFutureCheckin && Boolean(flatStat?.hasCompletedSameDayCheckout)
      const cleaningStatus = isFutureCheckin ? "clean" : (flatStat?.cleaningStatus || (f as any).cleaningStatus || "clean")
      const isDirty = !isFutureCheckin && (cleaningStatus === "dirty" || Boolean(flatStat?.isDirty))
      const isCleaningNow = !isFutureCheckin && (cleaningStatus === "cleaning_now" || Boolean(flatStat?.isCleaningNow))
      const daysCount = flatStat?.monthOccupiedDays || 0

      let stateBadgeText = `🟢 Vago & Limpo (${daysCount}d)`
      let stateBadgeClass = "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
      let bestSuffix = "Vago & Limpo"

      if (hasSameDayTurnover) {
        stateBadgeText = `🔄 Saída no Dia • Ocupado (${daysCount}d)`
        stateBadgeClass = "text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30"
        bestSuffix = "Saída no Dia"
      } else if (isDirty) {
        stateBadgeText = `🧹 Vago & Sujo${hasCompletedSameDayCheckout ? " • Saiu Hoje" : ""} (${daysCount}d)`
        stateBadgeClass = "text-orange-700 dark:text-orange-300 bg-orange-500/15 border border-orange-500/30"
        bestSuffix = "Vago & Sujo"
      } else if (isCleaningNow) {
        stateBadgeText = `🧽 Vago • Em Limpeza (${daysCount}d)`
        stateBadgeClass = "text-sky-700 dark:text-sky-300 bg-sky-500/15 border border-sky-500/30"
        bestSuffix = "Em Limpeza"
      }

      return (
        <SelectItem key={f.id} value={String(f.id)}>
          <div className="flex items-center justify-between gap-2 w-full py-0.5">
            <span className="font-bold">Apt {f.number}</span>
            {isBest && isAvail && (
              <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                ✨ Quarto da Vez ({bestSuffix} • {daysCount}d)
              </span>
            )}
            {!isAvail && (
              <span className="text-[9px] bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded">
                {isBlockedOnly
                  ? `🔒 Bloqueado (${isServiceOrMaintBlock ? "OS" : "Manutenção"})`
                  : `⚠️ Ocupado ${conflictName ? `(${conflictName})` : ""}`}
              </span>
            )}
            {isAvail && !isBest && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${stateBadgeClass}`}>
                {stateBadgeText}
              </span>
            )}
          </div>
        </SelectItem>
      )
    })
  }, [data.flats, data.reservations, data.blocks, fairShareResult, selectedRes, formCheckin, formCheckout])

  const frozenBgRef = useRef<{ node: React.ReactNode; dataRef: any; isSyncing: boolean } | null>(null)
  const isModalOverlayActive =
    resModalOpen ||
    newCompanyModalOpen ||
    blockModalOpen ||
    blockDetailsModalOpen ||
    flatTagsModalOpen ||
    essentialConfigModalOpen ||
    csvExportModalOpen ||
    csvImportModalOpen ||
    expiredModalOpen ||
    Boolean(maintModalFlat)

  if (!loadingUser && user?.role !== "admin" && user?.role !== "dev") {
    if (modalOnly) return null
    return <AccessDenied moduleName="o Livro de Reservas & Mapa de Ocupação" />
  }

  const MaybeShell = modalOnly ? Fragment : Shell

  return (
    <MaybeShell>
      <div className={modalOnly ? "" : "p-4 sm:p-6 space-y-6 max-w-[100vw] overflow-x-hidden"}>
        {!modalOnly && (
          <MemoizedSlot
            node={(() => {
              if (
                isModalOverlayActive &&
                frozenBgRef.current &&
                frozenBgRef.current.dataRef === data &&
                frozenBgRef.current.isSyncing === isSyncing
              ) {
                return frozenBgRef.current.node
              }
              const nextBgNode = (
                <>
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
              title="Sincronizar dados agora (sincronização automática em tempo real a cada 12s)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline font-medium">
                {isSyncing ? "Sincronizando..." : "Ao vivo"}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </Button>
            <Button 
              onClick={() => setCsvExportModalOpen(true)} 
              variant="outline" 
              size="sm" 
              className="font-semibold text-xs gap-1.5 shadow-2xs h-8 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Exportar reservas em planilha CSV com filtros de período"
            >
              <Download className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden md:inline">Exportar CSV</span>
            </Button>
            <Button 
              onClick={() => {
                setImportFile(null)
                setPreviewResult(null)
                setCsvImportModalOpen(true)
              }} 
              variant="outline" 
              size="sm" 
              className="font-semibold text-xs gap-1.5 shadow-2xs h-8 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Importar planilha CSV de reservas para preencher o mapa"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Importar CSV</span>
            </Button>
            <Button
              onClick={() => setExpiredModalOpen(true)}
              variant="outline"
              size="sm"
              className={`font-semibold text-xs gap-1.5 shadow-2xs h-8 ${
                (data.expiredPreReservations || []).length > 0
                  ? "border-amber-400/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80"
                  : "text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800"
              }`}
              title="Ver pré-reservas que expiraram sem pagamento e reativá-las com 1 clique"
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Expiradas</span>
              {(data.expiredPreReservations || []).length > 0 && (
                <Badge className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0 h-4 rounded-full">
                  {(data.expiredPreReservations || []).length}
                </Badge>
              )}
            </Button>
            <Button onClick={() => setBlockModalOpen(true)} variant="outline" size="sm" className="font-semibold text-xs gap-1.5 shadow-2xs h-8">
              <Lock className="w-3.5 h-3.5" />
              <span>Bloquear Quarto</span>
            </Button>
            <Button onClick={() => handleOpenNewRes()} size="sm" className="font-semibold text-xs gap-1.5 shadow-2xs h-8">
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
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{checkoutsTodayCount}</span>
                {checkoutsTodayCount > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    ✓ {checkedOutTodayDoneCount} {checkedOutTodayDoneCount === 1 ? 'saiu' : 'saíram'}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {checkoutsTodayCount === 0
                  ? '0 saídas hoje'
                  : `${checkedOutTodayDoneCount} de ${checkoutsTodayCount} já fizeram check-out`}
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
        <Card className="rounded-xl border shadow-2xs overflow-hidden min-w-0 max-w-full">
          <div className="p-3 bg-muted/20 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Seletor de Mês Anterior / Mês e Ano Atual / Próximo Mês */}
              <div className="flex items-center gap-0.5 bg-background border rounded-lg p-0.5 shadow-2xs">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handlePrevMonth}
                  className="h-7 w-7 p-0 hover:bg-muted text-foreground"
                  title="Voltar para o mês anterior (posiciona no dia 1º)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <Popover
                  open={monthPickerOpen}
                  onOpenChange={(open) => {
                    setMonthPickerOpen(open)
                    if (open) setPickerYear(currentDate.getFullYear())
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-7 px-2.5 rounded-md text-xs font-black capitalize text-slate-900 dark:text-slate-100 hover:bg-muted transition-colors flex items-center gap-1 min-w-[138px] justify-center select-none"
                      title="Clique para escolher qualquer mês ou ano rapidamente"
                    >
                      <span>{format(currentDate, "MMMM yyyy", { locale: ptBR })}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b pb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPickerYear(y => y - 1)}
                          className="h-7 w-7 p-0"
                          title="Ano anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-xs font-black text-foreground">
                          {pickerYear}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPickerYear(y => y + 1)}
                          className="h-7 w-7 p-0"
                          title="Próximo ano"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {Array.from({ length: 12 }).map((_, mIdx) => {
                          const candidateDate = new Date(pickerYear, mIdx, 1)
                          const isSelectedMonth =
                            currentDate.getMonth() === mIdx &&
                            currentDate.getFullYear() === pickerYear
                          const now = new Date()
                          const isCurrentRealMonth =
                            now.getMonth() === mIdx &&
                            now.getFullYear() === pickerYear

                          return (
                            <button
                              key={mIdx}
                              type="button"
                              onClick={() => navigateToMonth(candidateDate)}
                              className={`py-1.5 px-2 rounded-md text-xs font-bold capitalize transition-all ${
                                isSelectedMonth
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : isCurrentRealMonth
                                  ? "border border-primary/50 text-primary bg-primary/5 hover:bg-primary/10"
                                  : "hover:bg-muted text-foreground"
                              }`}
                            >
                              {format(candidateDate, "MMM", { locale: ptBR }).replace(".", "")}
                            </button>
                          )
                        })}
                      </div>

                      <div className="pt-1 border-t flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => scrollToToday("smooth")}
                          className="w-full h-7 text-[11px] font-bold text-primary hover:bg-primary/10 gap-1"
                        >
                          <CalendarIcon className="w-3 h-3" />
                          <span>Ir para Hoje ({format(new Date(), "dd/MM/yyyy")})</span>
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleNextMonth}
                  className="h-7 w-7 p-0 hover:bg-muted text-foreground"
                  title="Avançar para o próximo mês (posiciona no dia 1º)"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Botão Ir para Hoje */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => scrollToToday("smooth")}
                className="h-8 text-xs font-bold px-3 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 border-primary shadow-2xs"
                title="Voltar imediatamente para a coluna de Hoje"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Ir para Hoje</span>
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
                      ? "bg-purple-700 text-white shadow-xs" 
                      : "text-purple-700 dark:text-purple-300 hover:bg-purple-500/10"
                  }`}
                  title="Filtrar reservas com radar operacional (Campos dos Goytacazes / Atenção local)"
                >
                  <span className="text-xs">📍</span>
                  <span>Radar Campos ({riskAttentionCount})</span>
                </button>
              </div>
            </div>

            {/* Channels & Cleaning Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              {/* Legenda de Limpeza e Check-out */}
              <div className="flex items-center gap-2 pr-2 border-r">
                <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Limpo
                </span>
                <span className="flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Sujo
                </span>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-black text-[10px]"
                  title="Indica nas reservas de hoje que o hóspede já fez check-out / desocupou o apartamento"
                >
                  ✓ Saiu (Check-out feito)
                </span>
              </div>

              {/* Legenda de Canais */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600" /> Site
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
            onScroll={handleTimelineScroll}
            className={`w-full max-w-full overflow-x-auto select-none ${
              (resDragState && (resDragState.hasMoved || resDragState.isLongPressReady)) ||
              (blockDragState && (blockDragState.hasMoved || blockDragState.isLongPressReady))
                ? 'overflow-x-hidden touch-none'
                : ''
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
                <div className="px-3 py-2.5 text-left border-r-2 border-r-border/80 bg-slate-100 dark:bg-slate-900 sticky left-0 z-30 font-black text-xs text-foreground shadow-[2px_0_6px_-2px_rgba(0,0,0,0.1)] select-none flex items-center">
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
                        className={`p-1 border-r relative flex flex-col items-center justify-center bg-primary/20 text-primary font-black shadow-inner transition-all ${
                          todayPulseActive
                            ? "ring-2 ring-primary bg-primary/30 scale-[1.02] z-10"
                            : "ring-1 ring-primary/40"
                        }`}
                      >
                        {isFirstOfMonth && (
                          <span className="absolute top-0.5 left-1 text-[8px] font-black uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0.2 rounded-md shadow-xs">
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
                          <span className="absolute top-0.5 left-1 text-[8px] font-black uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0.2 rounded-md shadow-xs">
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
                        isFirstOfMonth ? 'border-l-2 border-l-primary bg-primary/5 pt-3.5' : ''
                      } ${
                        isWeekend ? 'bg-muted/60 text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {isFirstOfMonth && (
                        <span className="absolute top-0.5 left-1 text-[8px] leading-tight font-black uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0.2 rounded shadow-xs">
                          {format(day, "MMM", { locale: ptBR }).replace(".", "")}
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
                            {Array.isArray((flat as any).openMaintenanceIssues) && (flat as any).openMaintenanceIssues.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMaintModalFlat(flat)
                                }}
                                title={
                                  ((flat as any).openMaintenanceIssues as any[])
                                    .map((m: any) => `${m.isRentalBlocker ? "🚫 IMPEDITIVO" : "🔧 Manutenção"}: ${m.text} (${m.quoteStatus === "submitted" ? `Orçamento R$ ${m.quoteAmount}` : m.workflowStage})`)
                                    .join("\n") + "\n\nClique para gerenciar ou dar baixa"
                                }
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8.5px] font-black shadow-2xs transition-transform hover:scale-110 cursor-pointer ${
                                  (flat as any).hasImpeditiveMaintenance
                                    ? "bg-rose-600 text-white ring-1 ring-rose-300 animate-pulse"
                                    : "bg-amber-500 text-white"
                                }`}
                              >
                                <span>{(flat as any).hasImpeditiveMaintenance ? "🚫🔧" : "🔧"}</span>
                                <span>{(flat as any).openMaintenanceIssues.length}</span>
                              </button>
                            )}
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
                        const cellBlock = flatBlocks.find(b => b.startDate && b.endDate && dayStr >= b.startDate && dayStr <= b.endDate);

                        return (
                          <div 
                            key={dayStr}
                            style={{ gridColumn: `${dIdx + 2} / span 1`, gridRow: "1 / 2" }}
                            data-calendar-cell="true"
                            data-flat-id={flat.id}
                            data-day-str={dayStr}
                            onMouseDown={(e) => handleStartDrag(flat.id, day, false, e)}
                            onMouseEnter={() => handleDragOver(flat.id, day)}
                            onClick={() => handleCellClick(flat, day, null, cellBlock || null)}
                            className={`h-full border-r relative flex items-center justify-center cursor-pointer transition-all select-none z-0 ${
                              isMobileStart
                                ? 'bg-emerald-500/25 dark:bg-emerald-500/35 border-emerald-500 z-10'
                                : inDragRange
                                ? 'bg-indigo-500/25 dark:bg-indigo-500/35 border-indigo-400 z-10'
                                : today ? 'bg-primary/[0.07] border-r-primary/20'
                                : yesterday ? 'bg-slate-500/[0.04] dark:bg-slate-400/[0.04]'
                                : ''
                            } hover:bg-primary/10 group/cell`}
                            title={cellBlock ? `Apartamento bloqueado em ${format(day, "dd/MM/yyyy")}` : `Toque para iniciar reserva no Apt ${flat.number} em ${format(day, "dd/MM/yyyy")}`}
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
                            {!isMobileStart && !inDragRange && !cellBlock && today && (
                              <span className="opacity-0 group-hover/cell:opacity-80 text-[10px] text-primary font-bold flex items-center gap-1 transition-opacity">
                                <Plus className="w-3 h-3" /> Disponível
                              </span>
                            )}
                            {!isMobileStart && !inDragRange && !cellBlock && yesterday && (
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
                        const isEarlyCheckout = Boolean(resItem.earlyCheckout);
                        const hasGhostExtension = Boolean(
                          isEarlyCheckout &&
                          resItem.originalCheckoutDate &&
                          resItem.originalCheckoutDate > resItem.checkoutDate
                        );
                        const pos = getReservationPosition(resItem.checkinDate, resItem.checkoutDate, resItem.checkinTime, resItem.checkoutTime);
                        const ghostPos = hasGhostExtension
                          ? getReservationPosition(
                              resItem.checkoutDate,
                              resItem.originalCheckoutDate,
                              resItem.checkoutTime || defaultCheckoutTime || "12:00",
                              resItem.checkoutTime || defaultCheckoutTime || "12:00"
                            )
                          : null;
                        if (!pos && !ghostPos) return null;

                        const hasOverlappingNewBooking = hasGhostExtension && flatReservations.some((other: any) =>
                          other.id !== resItem.id &&
                          other.checkinDate < resItem.originalCheckoutDate &&
                          other.checkoutDate > resItem.checkoutDate
                        );

                        const overlappingGroup = !isEarlyCheckout
                          ? flatReservations
                              .filter((other: any) =>
                                !other.earlyCheckout &&
                                other.checkinDate < resItem.checkoutDate &&
                                other.checkoutDate > resItem.checkinDate
                              )
                              .sort((a: any, b: any) => Number(a.id) - Number(b.id))
                          : [];
                        const hasActiveOverlap = overlappingGroup.length > 1 || Boolean(resItem.isOverbooking);
                        const overlapIndex = overlappingGroup.length > 1
                          ? Math.max(0, overlappingGroup.findIndex((o: any) => o.id === resItem.id))
                          : 0;

                        const normalizedResChannel = normalizeCalendarChannel(resItem.channel);
                        const channelCfg = CHANNEL_CONFIG[normalizedResChannel] || CHANNEL_CONFIG.direta;
                        const nightsCount = differenceInDays(parseISO(resItem.checkoutDate), parseISO(resItem.checkinDate)) || 1;
                        
                        // Cálculo e formatação do Valor Total da Reserva
                        const resTotal = Number(resItem.totalAmount) > 0 
                          ? Number(resItem.totalAmount) 
                          : (Number(resItem.dailyRate || 0) * nightsCount);
                        const formattedTotal = resTotal > 0 
                          ? `R$ ${resTotal.toLocaleString("pt-BR", { minimumFractionDigits: resTotal % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}` 
                          : null;

                        // Verificação dinâmica de Mensalista (por reserva ou por cadastro no CRM - O(1) via índice)
                        const matchedGuest = findMatchedGuest(resItem);

                        const isMensalista = Boolean(
                          resItem.isMonthlyGuest || 
                          resItem.clientType === "mensalista" ||
                          matchedGuest?.isMonthlyGuest ||
                          matchedGuest?.clientType === "mensalista"
                        );

                        const cinTime = resItem.checkinTime || defaultCheckinTime || "14:00";
                        const coutTime = resItem.checkoutTime || defaultCheckoutTime || "12:00";

                        const isCamposCard = isResCamposResident(resItem, matchedGuest);

                        const isLongPressActive = longPressActiveResId === resItem.id;
                        const isSingleNight = nightsCount <= 1;

                        const isMultiChannel = Array.isArray(resItem.dailyRates) && 
                          new Set(resItem.dailyRates.map((d: any) => normalizeCalendarChannel(d.channel || resItem.channel))).size > 1;
                        const uniqueChannels = isMultiChannel 
                          ? Array.from(new Set(resItem.dailyRates.map((d: any) => normalizeCalendarChannel(d.channel || resItem.channel)))) 
                          : [];

                        const isCheckingOutToday = resItem.checkoutDate === todayStr;
                        const isCheckedOutToday = Boolean(
                          resItem.isCheckedOutToday ||
                          (isCheckingOutToday && (
                            resItem.checkoutDone ||
                            resItem.status === "completed" ||
                            resItem.status === "checked_out" ||
                            resItem.actualCheckoutAt
                          ))
                        );

                        return (
                          <div key={`res-${resItem.id}`} className="contents">
                            {pos && (
                              <ReservationHoverCard
                                resItem={resItem}
                                flat={flat}
                                isBeingDragged={Boolean(resDragState && (resDragState.hasMoved || resDragState.isLongPressReady))}
                                onOpenDetails={handleOpenEditRes}
                                onUndoEarlyCheckout={(r) => handleUndoEarlyCheckout(r, { closeModal: false })}
                                channelCfg={channelCfg}
                                isMensalista={isMensalista}
                                isOpenMobile={mobileCardResId === resItem.id}
                                onCloseMobile={() => setMobileCardResId(null)}
                              >
                                <div
                                  data-reservation-id={resItem.id}
                                  data-checked-out-today={isCheckedOutToday ? "true" : undefined}
                                  data-early-checkout={isEarlyCheckout ? "true" : undefined}
                                  data-overbooking-overlap={hasActiveOverlap ? "true" : undefined}
                                  style={{ 
                                    position: "absolute",
                                    left: `${pos.left}px`,
                                    width: `${pos.width}px`,
                                    top: overlappingGroup.length > 1 ? (overlapIndex === 0 ? "2px" : "22px") : "7px",
                                    height: overlappingGroup.length > 1 ? "23px" : "34px",
                                    touchAction: isLongPressActive ? "none" : undefined
                                  }}
                                  onPointerDown={(e) => handleStartResDrag(resItem, flat, "move", e)}
                                  className={`rounded-xl select-none relative ${
                                    isMensalista 
                                      ? 'bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-800 text-white border-2 border-purple-300 shadow-md ring-2 ring-purple-500/80' 
                                      : isMultiChannel
                                      ? 'bg-slate-900 text-white border-2 border-indigo-400/80 shadow-md ring-1 ring-indigo-500/50'
                                      : `${channelCfg?.bg} ${channelCfg?.text} border ${channelCfg?.border} shadow-xs`
                                  } ${
                                    resItem.status === 'pre_reserva'
                                      ? 'border-dashed border-2 border-amber-400 ring-1 ring-amber-300/80'
                                      : ''
                                  } ${
                                    hasActiveOverlap
                                      ? 'opacity-85 backdrop-blur-[1px] ring-2 ring-rose-500 border-2 border-rose-400 z-20 hover:z-40 hover:opacity-100'
                                      : isEarlyCheckout
                                      ? 'ring-2 ring-amber-400 border-amber-300'
                                      : isCheckedOutToday
                                      ? 'ring-2 ring-emerald-400 border-emerald-300'
                                      : resItem.hasMinor 
                                      ? 'border-2 border-rose-500 ring-2 ring-rose-400 animate-pulse' 
                                      : (resItem.isCamposResident || isCamposCard)
                                      ? 'border-2 border-purple-500 ring-1 ring-purple-400'
                                      : resItem.riskAttentionAlert
                                      ? 'border-2 border-amber-400 ring-1 ring-amber-300'
                                      : ''
                                  } flex items-center px-2 text-[11px] font-bold overflow-hidden z-10 cursor-grab active:cursor-grabbing hover:brightness-110 hover:shadow-md transition-all ${
                                    isBeingDragged && (resDragState?.hasMoved || resDragState?.isLongPressReady) ? 'opacity-30 border-dashed scale-95' : ''
                                  } ${
                                    isLongPressActive ? 'ring-4 ring-indigo-400 ring-offset-2 scale-[1.04] shadow-2xl z-40 animate-pulse brightness-125' : ''
                                  }`}
                                  title={`${hasActiveOverlap ? "🚨 CONFLITO DE OVERBOOKING NO FLAT • " : ""}${isEarlyCheckout ? `⚡ CHECK-OUT ANTECIPADO${resItem.earlyCheckoutTime ? ` ÀS ${resItem.earlyCheckoutTime}` : ""}${resItem.earlyCheckoutReportedBy ? ` (${resItem.earlyCheckoutReportedBy})` : ""} • ` : isCheckedOutToday ? `✓ CHECK-OUT REALIZADO${resItem.actualCheckoutTime ? ` ÀS ${resItem.actualCheckoutTime}` : ""} • ` : ""}${resItem.guestName}${formattedTotal ? ` • ${formattedTotal}` : ""} (${isMultiChannel ? "Multi-Canal: " + uniqueChannels.join("/") : (channelCfg?.label || resItem.channel)}) • Entrada: ${resItem.checkinDate} às ${cinTime} | Saída: ${resItem.checkoutDate} às ${coutTime}${resItem.originalCheckoutDate ? ` (Previsto originalmente até ${resItem.originalCheckoutDate})` : ""} • Toque para ver detalhes ou segure para mover`}
                                >
                                  {/* Background Segmentado por Diária para Reservas Multi-Canal */}
                                  {isMultiChannel && (
                                    <div className="absolute inset-0 flex pointer-events-none overflow-hidden rounded-xl z-0">
                                      {resItem.dailyRates.map((d: any, dIdx: number) => {
                                        const dChan = normalizeCalendarChannel(d.channel || resItem.channel);
                                        const cfg = CHANNEL_CONFIG[dChan] || CHANNEL_CONFIG.direta;
                                        return (
                                          <div 
                                            key={dIdx} 
                                            className={`flex-1 h-full ${cfg.bg} opacity-90 border-r border-white/30 last:border-r-0`}
                                            title={`${d.date}: ${cfg.label} (R$ ${d.rate})`}
                                          />
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Overlay Segmentado para Diária(s) Extra(s) em Pré-Reserva (Aguardando Pagamento) */}
                                  {resItem.status !== 'pre_reserva' &&
                                    resItem.pendingStayExtension?.isPreReservationHold &&
                                    resItem.pendingStayExtension?.status === 'pending_payment' && (() => {
                                      const ext = resItem.pendingStayExtension;
                                      const addedSet = new Set<string>(
                                        Array.isArray(ext.addedDates) && ext.addedDates.length > 0
                                          ? ext.addedDates
                                          : []
                                      );
                                      const nTotal = Math.max(1, Number(nightsCount) || 1);
                                      const startDt = safeParseDate(resItem.checkinDate);
                                      if (!startDt) return null;
                                      return (
                                        <div className="absolute inset-0 flex pointer-events-none overflow-hidden rounded-xl z-[5]">
                                          {Array.from({ length: nTotal }).map((_, idx) => {
                                            const nightStr = format(addDays(startDt, idx), "yyyy-MM-dd");
                                            const isHoldNight = addedSet.size > 0
                                              ? addedSet.has(nightStr)
                                              : Boolean(ext.oldCheckoutDate && nightStr >= ext.oldCheckoutDate);
                                            if (!isHoldNight) {
                                              return <div key={idx} className="flex-1 h-full" />;
                                            }
                                            return (
                                              <div
                                                key={idx}
                                                className="flex-1 h-full border-2 border-dashed border-amber-300 bg-amber-400/35"
                                                style={{
                                                  backgroundImage:
                                                    "repeating-linear-gradient(135deg, rgba(251,191,36,0.42) 0px, rgba(251,191,36,0.42) 6px, rgba(15,23,42,0.28) 6px, rgba(15,23,42,0.28) 12px)"
                                                }}
                                              />
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}

                                  {/* Handle Esquerdo: Redimensionar Início (Check-in) */}
                                  <div
                                    style={{ touchAction: "none" }}
                                    className={`absolute left-0 top-0 bottom-0 ${
                                      isSingleNight ? 'w-2 max-w-[10%]' : 'w-3 max-w-[16%]'
                                    } sm:w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20 flex items-center justify-center transition-colors group/resize-l touch-none select-none`}
                                    onPointerDown={(e) => handleStartResDrag(resItem, flat, "resize-left", e)}
                                    onPointerEnter={(e) => e.stopPropagation()}
                                    title="Arraste para alterar a data de Check-in"
                                  >
                                    <div className="w-1 sm:w-0.5 h-4 sm:h-3.5 bg-white/70 rounded-full group-hover/resize-l:bg-white pointer-events-none shadow-xs" />
                                  </div>

                                  {/* Conteúdo Central com Nome, Valor e Diárias Contínuos */}
                                  <div className="relative z-10 flex items-center gap-1.5 min-w-0 w-full overflow-hidden whitespace-nowrap px-1 pointer-events-none select-none">
                                    {isEarlyCheckout ? (
                                      <span
                                        data-early-checkout-badge="true"
                                        title={`Check-out antecipado${resItem.earlyCheckoutTime ? ` às ${resItem.earlyCheckoutTime}` : ""}${resItem.earlyCheckoutReportedBy ? ` • Informado por ${resItem.earlyCheckoutReportedBy}` : ""}`}
                                        className="shrink-0 text-[9.5px] px-1.5 py-0.2 bg-amber-300 text-slate-950 border border-amber-500 font-black rounded shadow-xs flex items-center gap-0.5"
                                      >
                                        ⚡ Saiu Antecipado{resItem.earlyCheckoutTime ? ` ${resItem.earlyCheckoutTime}` : ""}
                                      </span>
                                    ) : isCheckedOutToday && (
                                      <span
                                        data-checkout-done-badge="true"
                                        title={`Check-out já realizado hoje${resItem.actualCheckoutTime ? ` às ${resItem.actualCheckoutTime}` : ""} (Quarto desocupado)`}
                                        className="shrink-0 text-[9.5px] px-1.5 py-0.2 bg-white text-emerald-900 border border-emerald-300 font-black rounded shadow-xs flex items-center gap-0.5"
                                      >
                                        ✓ Saiu{resItem.actualCheckoutTime ? ` ${resItem.actualCheckoutTime}` : ""}
                                      </span>
                                    )}
                                    {resItem.status === 'pre_reserva' && (
                                      <span
                                        title={`Pré-Reserva (Aguardando Pagamento)${resItem.expiresAt ? ` • Válida até ${format(new Date(resItem.expiresAt), "dd/MM HH:mm")}` : ""}`}
                                        className="shrink-0 text-[9px] px-1 py-0.2 bg-amber-400 text-slate-950 font-black rounded shadow-xs flex items-center gap-0.5"
                                      >
                                        ⏳ Pré-Reserva{resItem.expiresAt ? (() => {
                                          try {
                                            return ` • até ${format(new Date(resItem.expiresAt), "HH:mm")}`
                                          } catch {
                                            return ""
                                          }
                                        })() : ""}
                                      </span>
                                    )}
                                    {resItem.status !== 'pre_reserva' &&
                                      resItem.pendingStayExtension?.isPreReservationHold &&
                                      resItem.pendingStayExtension?.status === 'pending_payment' && (
                                        <span
                                          data-extension-hold-badge="true"
                                          title={`Diária(s) extra(s) em Pré-Reserva aguardando pagamento${resItem.pendingStayExtension.expiresAt ? ` • Vence às ${format(new Date(resItem.pendingStayExtension.expiresAt), "dd/MM HH:mm")}` : ""} (Reserva principal segue confirmada)`}
                                          className="shrink-0 text-[9px] px-1.5 py-0.2 bg-amber-400 text-slate-950 border border-amber-200 font-black rounded shadow-xs flex items-center gap-0.5"
                                        >
                                          ⏳ +{resItem.pendingStayExtension.extraNights || 1} diária{resItem.pendingStayExtension.expiresAt ? (() => {
                                            try {
                                              return ` • até ${format(new Date(resItem.pendingStayExtension.expiresAt), "HH:mm")}`
                                            } catch {
                                              return ""
                                            }
                                          })() : ""}
                                        </span>
                                      )}
                                    {(resItem.isFlatLocked || resItem.flatLocked) && (
                                      <span title={`Quarto Preferencial / Bloqueado${resItem.flatLockReason ? `: ${resItem.flatLockReason}` : ""}`} className="shrink-0 text-[9px] px-1.5 py-0.2 bg-amber-400 text-slate-950 font-black rounded shadow-xs flex items-center gap-0.5">
                                        🔒 Fixo
                                      </span>
                                    )}
                                    {isMultiChannel && (
                                      <span title="Reserva com múltiplos canais de diárias" className="shrink-0 text-[8.5px] px-1 py-0.2 bg-black/60 backdrop-blur-xs text-white font-black rounded shadow-xs border border-white/40 flex items-center gap-0.5">
                                        🔀 Multi
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
                                    {resItem.riskAttentionAlert && !resItem.hasMinor && !(resItem.isCamposResident || isCamposCard) && (
                                      <span title={resItem.riskAttentionReason || "Atenção: Hóspede jovem < 30 anos (Campos dos Goytacazes)"} className="shrink-0 text-xs px-1 py-0.2 bg-amber-400 text-slate-950 rounded font-black shadow-xs">
                                        ⚠️ &lt;30a
                                      </span>
                                    )}
                                    {(resItem.isCamposResident || isCamposCard) && (
                                      <span title="Radar Operacional: Hóspede com documento ou endereço de Campos dos Goytacazes/RJ" className="shrink-0 text-[10px] px-1.5 py-0.2 bg-purple-700 text-white rounded font-black shadow-xs flex items-center gap-0.5">
                                        📍 Campos/RJ
                                      </span>
                                    )}
                                    <span className="truncate font-black text-white text-[11px] min-w-0 drop-shadow-xs">
                                      {resItem.guestName}
                                      {formattedTotal ? ` • ${formattedTotal}` : ""}
                                      {` • ${nightsCount} ${nightsCount === 1 ? 'diária' : 'diárias'}`}
                                    </span>
                                    {isCheckedOutToday && !isEarlyCheckout && nightsCount > 1 && pos.width >= 150 && (
                                      <span
                                        title={`Check-out concluído hoje${resItem.actualCheckoutTime ? ` às ${resItem.actualCheckoutTime}` : ""}`}
                                        className="ml-auto shrink-0 text-[9px] px-1.5 py-0.2 bg-emerald-400 text-slate-950 font-black rounded shadow-xs border border-white/80 flex items-center gap-0.5"
                                      >
                                        ✓ Check-out
                                      </span>
                                    )}
                                  </div>

                                  {/* Handle Direito: Redimensionar Fim (Check-out) */}
                                  <div
                                    style={{ touchAction: "none" }}
                                    className={`absolute right-0 top-0 bottom-0 ${
                                      isSingleNight ? 'w-2 max-w-[10%]' : 'w-3 max-w-[16%]'
                                    } sm:w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20 flex items-center justify-center transition-colors group/resize-r touch-none select-none`}
                                    onPointerDown={(e) => handleStartResDrag(resItem, flat, "resize-right", e)}
                                    onPointerEnter={(e) => e.stopPropagation()}
                                    title="Arraste para alterar a data de Check-out"
                                  >
                                    <div className="w-1 sm:w-0.5 h-4 sm:h-3.5 bg-white/70 rounded-full group-hover/resize-r:bg-white pointer-events-none shadow-xs" />
                                  </div>
                                </div>
                              </ReservationHoverCard>
                            )}

                            {/* Extensão Fantasma (Ghost Bar) para Dias Liberados por Check-out Antecipado */}
                            {ghostPos && ghostPos.width > 8 && (
                              <div
                                data-early-checkout-ghost-id={resItem.id}
                                style={{
                                  position: "absolute",
                                  left: `${ghostPos.left}px`,
                                  width: `${ghostPos.width}px`,
                                  top: hasOverlappingNewBooking ? "0px" : "7px",
                                  height: hasOverlappingNewBooking ? "13px" : "34px",
                                }}
                                className={`pointer-events-none select-none overflow-hidden flex items-center justify-between gap-1.5 px-1.5 transition-all ${
                                  hasOverlappingNewBooking
                                    ? "rounded-md border border-dashed border-amber-500/80 bg-amber-500/20 text-amber-950 dark:text-amber-200 z-20 text-[8.5px] font-extrabold opacity-90"
                                    : "rounded-xl border-2 border-dashed border-amber-500/80 dark:border-amber-400/80 bg-amber-500/15 dark:bg-amber-500/20 text-amber-950 dark:text-amber-100 z-10 text-[10px] font-bold opacity-80"
                                }`}
                              >
                                <span
                                  onPointerDown={!pos ? (e) => e.stopPropagation() : undefined}
                                  onMouseDown={!pos ? (e) => e.stopPropagation() : undefined}
                                  onClick={!pos ? (e) => {
                                    e.stopPropagation()
                                    handleOpenEditRes(resItem)
                                  } : undefined}
                                  className={`truncate flex items-center gap-1 min-w-0 ${!pos ? "pointer-events-auto cursor-pointer hover:underline" : ""}`}
                                  title={!pos ? `Abrir detalhes da reserva de ${resItem.guestName}` : undefined}
                                >
                                  <span>⚡</span>
                                  <span className="truncate">
                                    {hasOverlappingNewBooking
                                      ? `Antecipado: ${resItem.guestName} (previsto até ${format(parseISO(resItem.originalCheckoutDate), "dd/MM")})`
                                      : `Check-out antecipado • ${resItem.guestName} (liberado p/ nova reserva até ${format(parseISO(resItem.originalCheckoutDate), "dd/MM")})`}
                                  </span>
                                </span>
                                {!hasOverlappingNewBooking && ghostPos.width >= 56 && (
                                  <button
                                    type="button"
                                    disabled={undoingEarlyCheckoutId === resItem.id}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleUndoEarlyCheckout(resItem, { closeModal: false })
                                    }}
                                    className="pointer-events-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 border border-amber-500 text-amber-950 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/70 text-[9.5px] font-black shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                                    title={`Desfazer check-out antecipado de ${resItem.guestName} e restaurar saída original (${format(parseISO(resItem.originalCheckoutDate), "dd/MM")})`}
                                  >
                                    <RotateCcw className={`w-2.5 h-2.5 ${undoingEarlyCheckoutId === resItem.id ? "animate-spin" : ""}`} />
                                    <span>{undoingEarlyCheckoutId === resItem.id ? "..." : "Desfazer"}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
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

                      {/* Unified Multi-Day Room Block Bars (Redimensionável, Arrastável e Clicável) */}
                      {flatBlocks.map(blockItem => {
                        const bPos = getBlockPosition(blockItem.startDate, blockItem.endDate);
                        if (!bPos) return null;

                        const isService = Boolean(blockItem.isServiceBlock || blockItem.reason === "service_order");
                        const serviceTitle = blockItem.serviceTitle || blockItem.title?.replace(/^🔧\s*/, "") || "Serviço Externo";
                        const blockDaysCount = Math.max(1, (differenceInDays(parseISO(blockItem.endDate), parseISO(blockItem.startDate)) || 0) + 1);
                        const isSingleDayBlock = blockDaysCount <= 1;
                        const isBlockBeingDragged = String(blockDragState?.block?.id) === String(blockItem.id);
                        const isBlockLongPressActive = String(longPressActiveBlockId) === String(blockItem.id);

                        return (
                          <div
                            key={`block-${blockItem.id}`}
                            data-block-id={blockItem.id}
                            style={{ 
                              position: "absolute",
                              left: `${bPos.left}px`,
                              width: `${bPos.width}px`,
                              top: "7px",
                              height: "34px",
                              touchAction: isBlockLongPressActive ? "none" : undefined
                            }}
                            onPointerDown={(e) => handleStartBlockDrag(blockItem, flat, "move", e)}
                            className={cn(
                              "rounded-xl select-none relative flex items-center justify-between px-3 text-[10.5px] font-bold shadow-xs z-10 cursor-grab active:cursor-grabbing overflow-hidden border transition-all hover:brightness-110 hover:shadow-md group",
                              isService
                                ? "bg-amber-950/95 hover:bg-amber-900 text-amber-100 border-amber-500/80 shadow-amber-900/30"
                                : "bg-slate-900/90 hover:bg-slate-800 text-white border-slate-700 hover:border-amber-400/60",
                              isBlockBeingDragged && (blockDragState?.hasMoved || blockDragState?.isLongPressReady)
                                ? "opacity-30 border-dashed scale-95"
                                : "",
                              isBlockLongPressActive
                                ? "ring-4 ring-amber-400 ring-offset-2 scale-[1.04] shadow-2xl z-40 animate-pulse brightness-125"
                                : ""
                            )}
                            title={isService 
                              ? `🔧 Serviço: ${serviceTitle}${blockItem.workerName ? ` • Prestador: ${blockItem.workerName}` : ''} • Período: ${blockItem.startDate} a ${blockItem.endDate} (${blockDaysCount}d) • Arraste as bordas para redimensionar ou clique para detalhes`
                              : `Bloqueio: ${blockItem.reason === 'manutencao' ? 'Manutenção' : 'Bloqueio'} (${blockItem.startDate} a ${blockItem.endDate} • ${blockDaysCount}d) • Arraste as bordas para aumentar/diminuir ou clique para detalhes`}
                          >
                            {/* Handle Esquerdo: Redimensionar Início do Bloqueio */}
                            <div
                              data-block-resize-handle="left"
                              style={{ touchAction: "none" }}
                              className={`absolute left-0 top-0 bottom-0 ${
                                isSingleDayBlock ? "w-2.5 max-w-[18%]" : "w-3 max-w-[16%]"
                              } sm:w-2.5 cursor-ew-resize hover:bg-amber-400/35 active:bg-amber-400/55 z-20 flex items-center justify-center transition-colors group/bresize-l touch-none select-none`}
                              onPointerDown={(e) => handleStartBlockDrag(blockItem, flat, "resize-left", e)}
                              onClick={(e) => e.stopPropagation()}
                              onPointerEnter={(e) => e.stopPropagation()}
                              title="Arraste para alterar a data de início do bloqueio"
                            >
                              <div className="w-1 sm:w-0.5 h-4 sm:h-3.5 bg-white/70 rounded-full group-hover/bresize-l:bg-amber-300 pointer-events-none shadow-xs" />
                            </div>

                            <div className="relative z-10 flex items-center gap-1.5 min-w-0 truncate pointer-events-none select-none">
                              {isService ? (
                                <>
                                  <Wrench className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
                                  <span className="truncate font-black text-amber-200">
                                    🔧 {serviceTitle}
                                    {blockItem.workerName && (
                                      <span className="opacity-85 font-normal ml-1">({blockItem.workerName})</span>
                                    )}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                  <span className="truncate">
                                    {blockItem.reason === "manutencao" ? "🛠️ Manutenção" : "🔑 Bloqueio"} {blockItem.notes ? `• ${blockItem.notes}` : ""} ({blockDaysCount}d)
                                  </span>
                                </>
                              )}
                            </div>

                            {!isService && bPos.width >= 72 && (
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBlock(blockItem.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-600 rounded-lg text-white transition-all shrink-0 ml-1.5 mr-1.5 relative z-10"
                                title="Remover Bloqueio"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}

                            {/* Handle Direito: Redimensionar Fim do Bloqueio */}
                            <div
                              data-block-resize-handle="right"
                              style={{ touchAction: "none" }}
                              className={`absolute right-0 top-0 bottom-0 ${
                                isSingleDayBlock ? "w-2.5 max-w-[18%]" : "w-3 max-w-[16%]"
                              } sm:w-2.5 cursor-ew-resize hover:bg-amber-400/35 active:bg-amber-400/55 z-20 flex items-center justify-center transition-colors group/bresize-r touch-none select-none`}
                              onPointerDown={(e) => handleStartBlockDrag(blockItem, flat, "resize-right", e)}
                              onClick={(e) => e.stopPropagation()}
                              onPointerEnter={(e) => e.stopPropagation()}
                              title="Arraste para alterar a data de fim do bloqueio"
                            >
                              <div className="w-1 sm:w-0.5 h-4 sm:h-3.5 bg-white/70 rounded-full group-hover/bresize-r:bg-amber-300 pointer-events-none shadow-xs" />
                            </div>
                          </div>
                        );
                      })}

                      {/* Ghost Preview Bar ao Arrastar / Redimensionar Bloqueio */}
                      {blockDragState && (blockDragState.hasMoved || blockDragState.isLongPressReady) && flat.id === blockDragState.currentFlatId && (() => {
                        const bGhostPos = getBlockPosition(
                          blockDragState.currentStartDate,
                          blockDragState.currentEndDate
                        );
                        if (!bGhostPos) return null;
                        const bGhostDays = Math.max(1, (differenceInDays(parseISO(blockDragState.currentEndDate), parseISO(blockDragState.currentStartDate)) || 0) + 1);

                        return (
                          <div
                            style={{
                              position: "absolute",
                              left: `${bGhostPos.left}px`,
                              width: `${bGhostPos.width}px`,
                              top: "7px",
                              height: "34px"
                            }}
                            className="rounded-xl bg-slate-800/95 text-amber-300 border-2 border-dashed border-amber-400 shadow-2xl flex items-center px-3 text-[11px] font-black z-30 pointer-events-none animate-pulse"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                              <span className="truncate">
                                Apt {blockDragState.currentFlatNumber} • Bloqueio ({format(parseISO(blockDragState.currentStartDate), "dd/MM")} a {format(parseISO(blockDragState.currentEndDate), "dd/MM")} - {bGhostDays} {bGhostDays === 1 ? "dia" : "dias"})
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        
        {/* Banner Flutuante de Ajuda ao Mover / Redimensionar Bloqueio */}
        {blockDragState && (blockDragState.hasMoved || blockDragState.isLongPressReady) && (() => {
          const bDays = Math.max(1, (differenceInDays(parseISO(blockDragState.currentEndDate), parseISO(blockDragState.currentStartDate)) || 0) + 1);
          return (
            <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-6 z-50 bg-slate-950/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs border border-amber-500 animate-in slide-in-from-top duration-150">
              <div className="w-7 h-7 rounded-xl bg-amber-600 flex items-center justify-center font-black shrink-0">
                {blockDragState.mode === "move" ? "↔️" : "↔"}
              </div>
              <div>
                <div className="font-black text-amber-300">
                  {blockDragState.mode === "move"
                    ? (blockDragState.hasMoved ? "Movendo Bloqueio:" : "Bloqueio pronto para mover:")
                    : "Redimensionando Bloqueio:"}
                </div>
                <div className="font-semibold text-[11px]">
                  Apt {blockDragState.currentFlatNumber} • {format(parseISO(blockDragState.currentStartDate), "dd/MM")} até {format(parseISO(blockDragState.currentEndDate), "dd/MM")} ({bDays} {bDays === 1 ? "dia" : "dias"})
                  {!blockDragState.hasMoved && blockDragState.mode === "move" && (
                    <span className="block text-[10px] text-amber-200/80 font-normal">👉 Arraste até o apartamento ou período desejado</span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

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
                </>
              )
              frozenBgRef.current = { node: nextBgNode, dataRef: data, isSyncing }
              return nextBgNode
            })()}
          />
        )}

        {/* Modal de Confirmação Segura de Arraste / Redimensionamento */}
        {!modalOnly && (
        <Dialog open={!!dragConfirmData?.isOpen} onOpenChange={(open) => { if (!open) handleCancelDragMove(); }}>
          <DialogContent className="w-full max-w-[95vw] sm:max-w-md p-4 sm:p-6">
            <DialogHeader>
              <div className="flex items-center gap-2 text-indigo-600 mb-1">
                <CalendarDays className="w-5 h-5 text-indigo-600 shrink-0" />
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                  {dragConfirmData?.mode === "move" 
                    ? "Confirmar Mudança de Reserva?" 
                    : "Confirmar Alteração de Período?"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500">
                Verifique os novos dados antes de aplicar a alteração no calendário do hotel.
              </DialogDescription>
            </DialogHeader>

            {dragConfirmData && (
              <div className="space-y-3 py-2 text-sm">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Hóspede:</span>
                    <span className="font-bold text-slate-900 text-sm">{dragConfirmData.res?.guestName}</span>
                  </div>

                  {dragConfirmData.originFlatNumber !== dragConfirmData.targetFlatNumber && (
                    <div className="flex items-center justify-between text-xs border-t border-slate-200/80 pt-2">
                      <span className="text-slate-500">Apartamento:</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-rose-600">Apt {dragConfirmData.originFlatNumber}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-emerald-700">Apt {dragConfirmData.targetFlatNumber}</span>
                      </div>
                    </div>
                  )}

                  {Boolean(dragConfirmData.res?.isFlatLocked || dragConfirmData.res?.flatLocked) && dragConfirmData.originFlatNumber !== dragConfirmData.targetFlatNumber && (
                    <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Aviso: Reserva com Flat Bloqueado / Fixo!</span>
                        <span className="text-[11px] leading-tight text-amber-800 dark:text-amber-300">
                          Este hóspede possui preferência de quarto fixada no PMS{dragConfirmData.res?.flatLockReason ? ` (${dragConfirmData.res.flatLockReason})` : ""}. Como administrador você pode alterar, mas a Sofia AI não poderá mover este quarto.
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs border-t border-slate-200/80 pt-2">
                    <span className="text-slate-500">Período:</span>
                    <div className="flex items-center gap-1.5 font-semibold text-right">
                      <span className="text-slate-600">
                        {format(parseISO(dragConfirmData.originCheckin), "dd/MM")} - {format(parseISO(dragConfirmData.originCheckout), "dd/MM")}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 inline" />
                      <span className="text-indigo-700 font-bold">
                        {format(parseISO(dragConfirmData.targetCheckin), "dd/MM")} - {format(parseISO(dragConfirmData.targetCheckout), "dd/MM")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-slate-200/80 pt-2">
                    <span className="text-slate-500">Diárias:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600">{dragConfirmData.originNights} {dragConfirmData.originNights === 1 ? 'diária' : 'diárias'}</span>
                      {dragConfirmData.originNights !== dragConfirmData.targetNights && (
                        <>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-bold text-indigo-700">{dragConfirmData.targetNights} {dragConfirmData.targetNights === 1 ? 'diária' : 'diárias'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {dragConfirmData.originTotal !== dragConfirmData.targetTotal && (
                    <div className="flex items-center justify-between text-xs border-t border-slate-200/80 pt-2">
                      <span className="text-slate-500">Valor Total:</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-slate-500 line-through">R$ {dragConfirmData.originTotal.toFixed(2)}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-emerald-700">R$ {dragConfirmData.targetTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {dragConfirmData.isUnpaidDirectExtension && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-300/80 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-black text-amber-900 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          +{dragConfirmData.addedNightsCount || 1} diária(s) extra(s) pendente(s) (R$ {Number(dragConfirmData.extraPendingAmount || 0).toFixed(2)})
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setDragConfirmData(prev => prev ? { ...prev, extensionHoldMode: "pre_reserva" } : prev)
                          }
                          className={`p-2 rounded-lg border text-left text-[11px] font-bold transition-all cursor-pointer ${
                            (dragConfirmData.extensionHoldMode || "pre_reserva") === "pre_reserva"
                              ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs"
                              : "bg-white border-slate-200 text-slate-700 hover:border-amber-400"
                          }`}
                        >
                          ⏳ Pré-Reserva Extra
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDragConfirmData(prev => prev ? { ...prev, extensionHoldMode: "confirmada_sem_prazo" } : prev)
                          }
                          className={`p-2 rounded-lg border text-left text-[11px] font-bold transition-all cursor-pointer ${
                            dragConfirmData.extensionHoldMode === "confirmada_sem_prazo"
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                              : "bg-white border-slate-200 text-slate-700 hover:border-emerald-400"
                          }`}
                        >
                          ✅ Confirmar sem prazo
                        </button>
                      </div>

                      {(dragConfirmData.extensionHoldMode || "pre_reserva") === "pre_reserva" && (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {([
                              { id: "10m", label: "⏱️ 10m" },
                              { id: "30m", label: "⏱️ 30m" },
                              { id: "2h", label: "⏳ 2h" },
                              { id: "until_2359", label: "🌙 Até 23:59" }
                            ] as const).map(opt => {
                              const active = (dragConfirmData.extensionHoldPreset || "30m") === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    setDragConfirmData(prev => prev ? { ...prev, extensionHoldPreset: opt.id } : prev)
                                  }
                                  className={`px-2 py-1 rounded-md text-[10.5px] font-bold border transition-all cursor-pointer ${
                                    active
                                      ? "bg-amber-600 text-white border-amber-700"
                                      : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-amber-800 leading-snug">
                            Se não houver pagamento no prazo, apenas a(s) diária(s) extra(s) expira(m) e a reserva original segue confirmada.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCancelDragMove}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleConfirmDragMove}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Confirmar Alteração
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}

        {/* Modal: New / Edit Reservation */}
        <Dialog open={resModalOpen} onOpenChange={setResModalOpen}>
          <DialogContent className="w-full max-w-[100vw] sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3.5 sm:p-6">
            <FrozenSlot
              freeze={newCompanyModalOpen}
              deps={[companies, formCompanyId, formCompanyName, formRequesterType, selectedRes?.id]}
              render={() => (
                <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-6 sm:pr-0">
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0">
                  <CalendarDays className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">{selectedRes ? `Editar Reserva: ${selectedRes.code}` : "Nova Reserva"}</span>
                </DialogTitle>
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedRes && (
                    <Badge variant="outline" className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300 border-amber-300 shrink-0">
                      Flat {selectedRes.flatNumber}
                    </Badge>
                  )}
                  {formIsCamposResident && (
                    <Badge className="text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shrink-0 gap-1 shadow-xs">
                      📍 Campos/RJ
                    </Badge>
                  )}
                  {(selectedRes?.isSmoker || selectedRes?.smokerGuestAlert) && (
                    <Badge className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0 gap-1 shadow-xs">
                      🚬 Hóspede Fumante
                    </Badge>
                  )}
                </div>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {selectedRes 
                  ? "Gerencie os dados da estadia, consulte o histórico de e-mails transacionais ou envie novas mensagens." 
                  : "Preencha os dados do hóspede, datas da estadia e valores."}
              </DialogDescription>
            </DialogHeader>

            <Tabs 
              value={resModalTab === "details" ? "reservation" : resModalTab} 
              onValueChange={(v: any) => setResModalTab(v)} 
              className="w-full mt-1 mb-2"
            >
              <TabsList className={`w-full p-1 bg-muted/60 rounded-xl grid ${selectedRes ? "grid-cols-5" : "grid-cols-2"} gap-1 h-auto`}>
                <TabsTrigger
                  value="reservation"
                  className="text-[10.5px] sm:text-xs font-semibold py-1.5 sm:py-2 px-1 gap-0.5 sm:gap-1 rounded-lg flex flex-col sm:flex-row items-center justify-center truncate data-[state=active]:shadow-xs"
                >
                  <CalendarDays className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <span className="truncate">Reserva</span>
                </TabsTrigger>
                
                <TabsTrigger
                  value="payments"
                  className="text-[10.5px] sm:text-xs font-semibold py-1.5 sm:py-2 px-1 gap-0.5 sm:gap-1 rounded-lg flex flex-col sm:flex-row items-center justify-center truncate data-[state=active]:shadow-xs"
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Pagamento</span>
                </TabsTrigger>

                {selectedRes && (
                  <>
                    <TabsTrigger
                      value="communications"
                      className="text-[10.5px] sm:text-xs font-semibold py-1.5 sm:py-2 px-1 gap-0.5 sm:gap-1 rounded-lg flex flex-col sm:flex-row items-center justify-center truncate data-[state=active]:shadow-xs"
                    >
                      <div className="flex items-center gap-0.5">
                        <MessageCircle className="w-3.5 h-3.5 shrink-0 text-sky-500" />
                        {(communications.length + scheduledEmails.length + whatsappQueue.length + whatsappHistory.length) > 0 && (
                          <span className="text-[9px] px-1 py-0 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold shrink-0 sm:hidden">
                            {communications.length + scheduledEmails.length + whatsappQueue.length + whatsappHistory.length}
                          </span>
                        )}
                      </div>
                      <span className="truncate">Mensagens</span>
                      {(communications.length + scheduledEmails.length + whatsappQueue.length + whatsappHistory.length) > 0 && (
                        <span className="hidden sm:inline-flex text-[10px] px-1.5 py-0.2 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold shrink-0 ml-0.5">
                          {communications.length + scheduledEmails.length + whatsappQueue.length + whatsappHistory.length}
                        </span>
                      )}
                    </TabsTrigger>

                    <TabsTrigger
                      value="audit"
                      className="text-[10.5px] sm:text-xs font-semibold py-1.5 sm:py-2 px-1 gap-0.5 sm:gap-1 rounded-lg flex flex-col sm:flex-row items-center justify-center truncate data-[state=active]:shadow-xs"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                      <span className="truncate">Histórico</span>
                    </TabsTrigger>

                    <TabsTrigger
                      value="links"
                      className="text-[10.5px] sm:text-xs font-semibold py-1.5 sm:py-2 px-1 gap-0.5 sm:gap-1 rounded-lg flex flex-col sm:flex-row items-center justify-center truncate data-[state=active]:shadow-xs"
                    >
                      <Link2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                      <span className="truncate">Links</span>
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </Tabs>

            {(resModalTab === "reservation" || resModalTab === "details" || resModalTab === "payments") && (
              <form noValidate onSubmit={handleSaveRes}>
                {(resModalTab === "reservation" || resModalTab === "details") && (

              <div className="py-2.5 space-y-3">
                {/* Banner de Alerta para Equipe: Hóspede com apontamento de Fumante */}
                {(selectedRes?.isSmoker || selectedRes?.smokerGuestAlert) && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 text-base">
                        🚬
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-rose-950 dark:text-rose-100 flex items-center gap-1.5">
                          <span>Alerta da Equipe: Hóspede Fumante</span>
                          <Badge className="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0">Atenção</Badge>
                        </div>
                        <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5 leading-snug">
                          {selectedRes.smokingAlert || "Este hóspede possui histórico de fumo no quarto registrado pela governança em estadia anterior."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Banner de Radar Operacional: Hóspede de Campos dos Goytacazes/RJ */}
                {formIsCamposResident && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border-2 border-purple-300 dark:border-purple-800 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 text-base">
                        📍
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-purple-950 dark:text-purple-100 flex items-center gap-1.5">
                          <span>Radar Operacional: Hóspede de Campos dos Goytacazes/RJ</span>
                        </div>
                        <div className="text-[11px] text-purple-700/90 dark:text-purple-300/90 truncate">
                          {selectedRes?.riskAttentionReason || "Identificado morador/origem de Campos dos Goytacazes pelo documento ou formulário de pré-checkin."}
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-purple-700 text-white font-bold text-[10px] shrink-0">
                      Atenção Operacional
                    </Badge>
                  </div>
                )}
                {/* Banner de Acesso Rápido aos Links da Reserva */}
                {selectedRes && (
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between gap-2.5 text-xs shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Link2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate">Central de Links da Reserva</div>
                        <div className="text-[11px] text-muted-foreground truncate">Portal Minha Reserva, Café, Pré Check-in e Check-out</div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResModalTab("links")}
                      className="h-7 px-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40 shrink-0 rounded-xl"
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1" />
                      <span>Ver todos</span>
                      <span className="hidden sm:inline ml-0.5">➔</span>
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

                {/* Banner de Aviso de Conflito com Serviço Externo */}
                {activeServiceBlockConflict && (
                  <div className="p-3.5 bg-amber-500/15 dark:bg-amber-950/40 border-2 border-amber-500/70 rounded-2xl flex items-start gap-3 text-xs text-amber-950 dark:text-amber-200 shadow-2xs">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-black text-sm flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                        <span>Aviso de Serviço Externo</span>
                      </div>
                      <p className="text-[11.5px] leading-relaxed font-medium">
                        ⚠️ Atenção: Este apartamento possui serviço externo agendado/em andamento neste período: <strong>{activeServiceBlockConflict.serviceTitle || activeServiceBlockConflict.title || "Serviço Externo"}</strong>{activeServiceBlockConflict.workerName ? ` (Prestador: ${activeServiceBlockConflict.workerName})` : ""}. A reserva pode ser criada, mas o flat pode estar indisponível.
                      </p>
                      <p className="text-[10.5px] text-amber-800 dark:text-amber-400 italic">
                        ℹ️ Este bloqueio é visual. Administradores podem salvar a reserva normalmente para sobrescrever o período após confirmação.
                      </p>
                    </div>
                  </div>
                )}

                {selectedRes && (selectedRes.isFlatLocked || selectedRes.flatLocked) && (
                  String(formFlatId) !== String(selectedRes.flatId) ? (
                    <div className="p-3 bg-amber-500/15 border-2 border-amber-500/50 rounded-xl text-amber-950 dark:text-amber-200 text-xs flex items-start gap-2.5 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-[12px] text-amber-900 dark:text-amber-300">
                          Aviso: Alterando Quarto Preferencial / Bloqueado!
                        </p>
                        <p className="text-[11px] leading-tight text-amber-800 dark:text-amber-300/90">
                          Esta reserva possui trava de quarto preferencial{selectedRes.flatLockReason ? ` (${selectedRes.flatLockReason})` : ""}. A Sofia AI está proibida de alterar este quarto. Como administrador, você pode prosseguir com a alteração manual e essa mudança será registrada em auditoria.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="font-semibold text-[11.5px]">
                          Quarto Preferencial Ativo{selectedRes.flatLockReason ? `: "${selectedRes.flatLockReason}"` : ""}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/30 text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                        Não Trocar
                      </span>
                    </div>
                  )
                )}

                                {/* 1º Bloco: Datas e Horários de Entrada (Check-in) e Saída (Check-out) com Calendário Range Picker Unificado */}
                <Popover 
                  open={rangePickerOpen} 
                  onOpenChange={(open) => {
                    setRangePickerOpen(open);
                    if (!open) {
                      setPickerRangeStart(null);
                      setPickerHoverDate(null);
                    }
                  }}
                >
                  <PopoverAnchor asChild>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 items-start">
                      {/* Entrada / Check-in */}
                      <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-border/70 min-w-0">
                        <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                            Entrada (Check-in)
                          </span>
                          <span className="text-[10px] text-muted-foreground font-normal">Padrão: {defaultCheckinTime}</span>
                        </Label>
                        <div className="grid grid-cols-5 gap-2 items-center">
                          <div className="col-span-3 min-w-0">
                            <Label className="text-[10px] text-muted-foreground block mb-0.5">Data</Label>
                            <div className="relative flex items-center">
                              <Input 
                                type="date" 
                                value={formCheckin} 
                                onChange={e => handleCheckinChange(e.target.value)} 
                                min="2020-01-01"
                                max="2099-12-31"
                                required 
                                className="text-xs h-9 w-full min-w-0 pr-8 pl-2 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-7"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setPickerRangeStart(null);
                                  setPickerHoverDate(null);
                                  setPickerMonth(safeParseDate(formCheckin) || new Date());
                                  setRangePickerOpen(true);
                                }}
                                className="absolute right-1.5 z-10 p-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer rounded pointer-events-auto"
                                title="Abrir calendário de período (Range Picker)"
                              >
                                <CalendarIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <Label className="text-[10px] text-muted-foreground block mb-0.5">Horário</Label>
                            <Input 
                              type="time" 
                              value={formCheckinTime} 
                              onChange={e => setFormCheckinTime(e.target.value)} 
                              required 
                              className="text-xs h-9 font-medium w-full min-w-0 px-2"
                              title="Horário previsto para início do Check-in"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Saída / Check-out */}
                      <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-border/70 min-w-0">
                        <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <LogOut className="w-3.5 h-3.5 text-rose-600" />
                            Saída (Check-out)
                          </span>
                          <span className="text-[10px] text-muted-foreground font-normal">Padrão: {defaultCheckoutTime}</span>
                        </Label>
                        <div className="grid grid-cols-5 gap-2 items-center">
                          <div className="col-span-3 min-w-0">
                            <Label className="text-[10px] text-muted-foreground block mb-0.5">Data</Label>
                            <div className="relative flex items-center">
                              <Input 
                                type="date" 
                                value={formCheckout} 
                                onChange={e => handleCheckoutChange(e.target.value)} 
                                min="2020-01-01"
                                max="2099-12-31"
                                required 
                                className="text-xs h-9 w-full min-w-0 pr-8 pl-2 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-7"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setPickerRangeStart(null);
                                  setPickerHoverDate(null);
                                  setPickerMonth(safeParseDate(formCheckin) || safeParseDate(formCheckout) || new Date());
                                  setRangePickerOpen(true);
                                }}
                                className="absolute right-1.5 z-10 p-1 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors cursor-pointer rounded pointer-events-auto"
                                title="Abrir calendário de período (Range Picker)"
                              >
                                <CalendarIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <Label className="text-[10px] text-muted-foreground block mb-0.5">Horário</Label>
                            <Input 
                              type="time" 
                              value={formCheckoutTime} 
                              onChange={e => setFormCheckoutTime(e.target.value)} 
                              required 
                              className="text-xs h-9 font-medium w-full min-w-0 px-2"
                              title="Horário limite para conclusão do Check-out"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Aviso visual inline quando Check-out <= Check-in ao digitar */}
                      {formCheckin && formCheckout && formCheckout <= formCheckin && (
                        <div className="col-span-1 sm:col-span-2 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold animate-in fade-in">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>A data de saída (check-out) deve ser posterior à data de entrada (check-in).</span>
                        </div>
                      )}
                    </div>
                  </PopoverAnchor>

                  <PopoverContent 
                    align="center" 
                    side="bottom" 
                    sideOffset={8}
                    className="z-[70] w-[310px] sm:w-[330px] max-w-[calc(100vw-2rem)] p-3 bg-popover border border-border shadow-2xl rounded-2xl animate-in fade-in-0 zoom-in-95"
                  >
                    {rangePickerOpen && (() => {
                      const safeMonth = !pickerMonth || isNaN(pickerMonth.getTime()) ? new Date() : pickerMonth;
                      return (
                        <>
                          {/* Cabeçalho do Range Picker com navegação de mês e ano */}
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setPickerMonth(prev => subYears(prev, 1))}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Ano anterior (-1 ano)"
                              >
                                <ChevronsLeft className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setPickerMonth(prev => subMonths(prev, 1))}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Mês anterior"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold capitalize text-foreground select-none">
                                {format(safeMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPickerMonth(new Date())}
                                className="text-[10px] text-primary hover:underline font-semibold cursor-pointer px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted"
                                title="Ir para o mês atual"
                              >
                                Hoje
                              </button>
                            </div>

                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setPickerMonth(prev => addMonths(prev, 1))}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Próximo mês"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setPickerMonth(prev => addYears(prev, 1))}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Próximo ano (+1 ano)"
                              >
                                <ChevronsRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Guia de Seleção */}
                          <div className="text-[11px] font-semibold py-1 px-2 mb-2 rounded-lg text-center bg-muted/60 text-muted-foreground flex items-center justify-between">
                            <span>
                              {!pickerRangeStart ? (
                                "1º clique / toque: Selecione a Entrada"
                              ) : (
                                <>
                                  Entrada: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{(() => {
                                    const pStart = safeParseDate(pickerRangeStart);
                                    return pStart ? format(pStart, "dd/MM") : pickerRangeStart;
                                  })()}</strong> ➔ 2º clique / toque: Saída
                                </>
                              )}
                            </span>
                            {pickerRangeStart && (
                              <button
                                type="button"
                                onClick={() => { setPickerRangeStart(null); setPickerHoverDate(null); }}
                                className="text-[10px] text-rose-500 hover:underline font-bold cursor-pointer"
                              >
                                Limpar
                              </button>
                            )}
                          </div>

                          {/* Dias da Semana */}
                          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground mb-1">
                            {["D", "S", "T", "Q", "Q", "S", "S"].map((dia, idx) => (
                              <div key={idx} className="h-5 flex items-center justify-center">
                                {dia}
                              </div>
                            ))}
                          </div>

                          {/* Grid dos Dias do Mês */}
                          {(() => {
                            const mStart = startOfMonth(safeMonth);
                            const mEnd = endOfMonth(safeMonth);
                            const days = eachDayOfInterval({ start: mStart, end: mEnd });
                            const startDay = getDay(mStart);

                            const validCin = safeParseDate(formCheckin);
                            const validCout = safeParseDate(formCheckout);
                            const hasValidPreExistingRange = Boolean(validCin && validCout && formCheckin < formCheckout);

                            const effectiveStart = pickerRangeStart || (hasValidPreExistingRange ? formCheckin : null);
                            const effectiveEnd = pickerRangeStart
                              ? (pickerHoverDate && pickerHoverDate > pickerRangeStart ? pickerHoverDate : null)
                              : (hasValidPreExistingRange ? formCheckout : null);

                            return (
                              <div 
                                className="grid grid-cols-7 gap-1"
                                onMouseLeave={() => setPickerHoverDate(null)}
                              >
                                {Array.from({ length: startDay }).map((_, idx) => (
                                  <div key={`blank-${idx}`} className="h-7 w-full" />
                                ))}

                                {days.map(d => {
                                  const dStr = format(d, "yyyy-MM-dd");
                                  const isStart = Boolean(effectiveStart && dStr === effectiveStart);
                                  const isEnd = Boolean(effectiveEnd && dStr === effectiveEnd);
                                  const isBetween = Boolean(effectiveStart && effectiveEnd && effectiveStart < effectiveEnd && dStr > effectiveStart && dStr < effectiveEnd);
                                  const isTodayDate = isToday(d);

                                  return (
                                    <button
                                      key={dStr}
                                      type="button"
                                      title={format(d, "dd/MM/yyyy")}
                                      aria-label={format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                      onClick={() => {
                                        if (!pickerRangeStart) {
                                          setPickerRangeStart(dStr);
                                          setPickerHoverDate(null);
                                        } else {
                                          if (dStr <= pickerRangeStart) {
                                            setPickerRangeStart(dStr);
                                            setPickerHoverDate(null);
                                          } else {
                                            handleDatesChange(pickerRangeStart, dStr);
                                            setPickerRangeStart(null);
                                            setPickerHoverDate(null);
                                            setRangePickerOpen(false);
                                          }
                                        }
                                      }}
                                      onMouseEnter={() => {
                                        if (pickerRangeStart) {
                                          setPickerHoverDate(dStr);
                                        }
                                      }}
                                      className={cn(
                                        "h-7 w-full text-[11px] font-semibold rounded-md flex items-center justify-center transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                                        isStart && "bg-emerald-600 text-white font-bold shadow-xs",
                                        isEnd && "bg-rose-600 text-white font-bold shadow-xs",
                                        isBetween && "bg-emerald-500/20 text-emerald-950 dark:text-emerald-100 rounded-none",
                                        !isStart && !isEnd && !isBetween && "hover:bg-muted text-foreground",
                                        isTodayDate && !isStart && !isEnd && "border border-primary font-bold"
                                      )}
                                    >
                                      {format(d, "d")}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}

                    {/* Rodapé com Resumo de Diárias e Botão Fechar */}
                    <div className="pt-2 mt-2 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-muted-foreground">
                        {(() => {
                          if (pickerRangeStart) {
                            if (pickerHoverDate && pickerHoverDate > pickerRangeStart) {
                              const dStart = safeParseDate(pickerRangeStart);
                              const dHover = safeParseDate(pickerHoverDate);
                              if (dStart && dHover) {
                                const nights = differenceInCalendarDays(dHover, dStart);
                                return (
                                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                                    <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{nights}</strong>{" "}
                                    {nights === 1 ? "diária" : "diárias"} (selecionando)
                                  </span>
                                );
                              }
                            }
                            return "Selecione a data de saída";
                          }

                          const validCin = safeParseDate(formCheckin);
                          const validCout = safeParseDate(formCheckout);
                          if (validCin && validCout && formCheckin < formCheckout) {
                            const nights = differenceInCalendarDays(validCout, validCin);
                            return (
                              <>
                                <strong className="text-foreground font-bold">{nights}</strong>{" "}
                                {nights === 1 ? "diária" : "diárias"}
                              </>
                            );
                          }
                          return "Selecione entrada e saída";
                        })()}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPickerRangeStart(null);
                          setPickerHoverDate(null);
                          setRangePickerOpen(false);
                        }}
                        className="h-6 px-2 text-[11px] font-semibold cursor-pointer"
                      >
                        Fechar
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 items-start">
                  <div className="space-y-1.5 min-w-0">
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
                      onValueChange={stableSelectFlat}
                    >
                      <SelectTrigger className="text-xs font-bold h-9 w-full min-w-0">
                        <SelectValue placeholder={loadingFairShare ? "✨ Buscando quarto sugerido..." : "Selecione o Flat"}>
                          {(() => {
                            if (!formFlatId) {
                              return loadingFairShare ? "✨ Selecionando quarto sugerido..." : "Selecione o Flat";
                            }
                            const todayIso = format(new Date(), "yyyy-MM-dd");
                            const isFutureCheckin = formCheckin > todayIso;
                            const selFlat = data.flats.find(f => String(f.id) === String(formFlatId));
                            const selStat = fairShareResult?.allStats?.find(
                              (s: any) => Number(s.flat?.id) === Number(formFlatId) || (selFlat && String(s.flat?.number) === String(selFlat.number))
                            );
                            const cleanSt = isFutureCheckin ? "clean" : (selStat?.cleaningStatus || (selFlat as any)?.cleaningStatus || "clean");
                            const isDirty = !isFutureCheckin && (cleanSt === "dirty" || Boolean(selStat?.isDirty));
                            const isCleaningNow = !isFutureCheckin && (cleanSt === "cleaning_now" || Boolean(selStat?.isCleaningNow));
                            const hasSameDay = Boolean(selStat?.hasCheckoutOnCheckinDay);
                            const isAvail = selStat ? Boolean(selStat.isAvailable) : true;
                            const isBest = !selectedRes && String(formFlatId) === String(fairShareResult?.bestFlatId);
                            let statusShort = "🟢 Vago & Limpo";
                            if (!isAvail) {
                              const hasResC = (selStat?.conflicts || []).some((c: any) => !selectedRes || String(c.id) !== String(selectedRes.id));
                              statusShort = hasResC ? "⚠️ Ocupado" : "🔒 Bloqueado";
                            } else if (hasSameDay) {
                              statusShort = "🔄 Saída no Dia";
                            } else if (isDirty) {
                              statusShort = "🧹 Vago & Sujo";
                            } else if (isCleaningNow) {
                              statusShort = "🧽 Em Limpeza";
                            }
                            return `Apt ${selFlat?.number || formFlatId} • ${statusShort}${isBest ? " ✨" : ""}`;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {flatSelectOptions}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs font-semibold block leading-none h-4 flex items-center">Canal de Origem</Label>
                    <Select 
                      value={formChannel} 
                      onValueChange={stableSelectChannel}
                    >
                      <SelectTrigger className="text-xs h-9 w-full min-w-0">
                        <SelectValue placeholder="Canal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="site">🟠 Site Próprio / Motor de Reservas</SelectItem>
                        <SelectItem value="whatsapp">🟢 WhatsApp / Reserva Direta</SelectItem>
                        <SelectItem value="booking">🔵 Booking.com</SelectItem>
                        <SelectItem value="airbnb">🔴 Airbnb</SelectItem>
                        <SelectItem value="b2b">🟣 B2B Reservas / Agência Corporativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Banner sutil do Quarto da Vez apenas na criação de Nova Reserva */}
                {!selectedRes && fairShareResult?.bestFlatNumber && (() => {
                  const todayIso = format(new Date(), "yyyy-MM-dd");
                  const isFutureCheckin = formCheckin > todayIso;
                  const bestStat = fairShareResult?.allStats?.find(
                    (s: any) => Number(s.flat?.id) === Number(fairShareResult.bestFlatId) || String(s.flat?.number) === String(fairShareResult.bestFlatNumber)
                  );
                  const bestStatusLabel = bestStat?.hasCheckoutOnCheckinDay
                    ? "🔄 Saída no Dia"
                    : !isFutureCheckin && (bestStat?.isDirty || bestStat?.cleaningStatus === "dirty")
                    ? "🧹 Vago & Sujo"
                    : !isFutureCheckin && (bestStat?.isCleaningNow || bestStat?.cleaningStatus === "cleaning_now")
                    ? "🧽 Em Limpeza"
                    : "🟢 Vago & Limpo";
                  return (
                    <div className="text-[11px] text-amber-800 dark:text-amber-200 font-medium flex items-center justify-between bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg animate-in fade-in">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          Sugestão da vez para equilíbrio: <strong className="font-bold">Apt {fairShareResult.bestFlatNumber}</strong>{" "}
                          <span className="text-[10px] opacity-90">({bestStatusLabel})</span>
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
                  );
                })()}

                {/* Alerta Operacional: Quarto Vago & Sujo ou Saída no Dia Selecionado */}
                {(() => {
                  const todayIso = format(new Date(), "yyyy-MM-dd");
                  const isFutureCheckin = formCheckin > todayIso;
                  const selFlat = data.flats.find(f => String(f.id) === String(formFlatId));
                  const selectedStat = fairShareResult?.allStats?.find(
                    (s: any) => String(s.flat?.id) === String(formFlatId) || (selFlat && String(s.flat?.number) === String(selFlat.number))
                  );
                  const isAvail = selectedStat ? Boolean(selectedStat.isAvailable) : true;
                  if (!isAvail) return null;
                  const cleanSt = isFutureCheckin ? "clean" : (selectedStat?.cleaningStatus || (selFlat as any)?.cleaningStatus || "clean");
                  const isDirty = !isFutureCheckin && (cleanSt === "dirty" || Boolean(selectedStat?.isDirty));
                  const hasSameDay = Boolean(selectedStat?.hasCheckoutOnCheckinDay);
                  if (!isDirty && !hasSameDay) return null;

                  const isSelectedTheBestFlat = Boolean(
                    fairShareResult?.bestFlatId && String(fairShareResult.bestFlatId) === String(formFlatId)
                  );
                  const nextCleanStat = (fairShareResult?.allStats || [])
                    .filter((s: any) =>
                      s?.isAvailable &&
                      String(s.flat?.id) !== String(formFlatId) &&
                      !s.isDirty &&
                      s.cleaningStatus !== "dirty" &&
                      !s.hasCheckoutOnCheckinDay
                    )
                    .sort((a: any, b: any) => {
                      if ((a.monthOccupiedDays || 0) !== (b.monthOccupiedDays || 0)) {
                        return (a.monthOccupiedDays || 0) - (b.monthOccupiedDays || 0);
                      }
                      return (b.daysSinceLastCheckout || 0) - (a.daysSinceLastCheckout || 0);
                    })[0];

                  return (
                    <div className="p-2.5 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-700/60 rounded-xl flex items-center justify-between gap-2 text-xs animate-in fade-in">
                      <div className="flex items-start gap-2 text-orange-900 dark:text-orange-200">
                        <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          {hasSameDay ? (
                            <span className="font-bold block">
                              🔄 Atenção: Apt {selFlat?.number || formFlatId} {isSelectedTheBestFlat ? `é o Quarto da Vez (${selectedStat?.monthOccupiedDays || 0}d), mas ` : ""}possui saída prevista no dia (hóspede anterior ainda no flat).
                            </span>
                          ) : (
                            <span className="font-bold block">
                              🧹 Atenção: Apt {selFlat?.number || formFlatId} {isSelectedTheBestFlat ? `é o Quarto da Vez (${selectedStat?.monthOccupiedDays || 0}d ocupados), porém ` : ""}consta como VAGO & SUJO na Governança.
                            </span>
                          )}
                          <span className="text-[11px] text-orange-800/90 dark:text-orange-300/90 block">
                            {hasSameDay
                              ? "Mantenha para equilíbrio de ocupação (confirmando o check-out/limpeza) ou escolha outro apartamento."
                              : "Mantenha para equilibrar a ocupação (acionando a Governança) ou troque para o próximo quarto já limpo se for entrada imediata."}
                          </span>
                        </div>
                      </div>
                      {nextCleanStat?.flat?.id && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            isFlatManuallyChangedRef.current = true;
                            setFormFlatId(String(nextCleanStat.flat.id));
                            setFormForceReplace(false);
                          }}
                          className="h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-0 shrink-0 px-2.5"
                        >
                          Usar próximo limpo (Apt {nextCleanStat.flat.number})
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {/* Alerta de Quarto Ocupado & Trava Anti-Overbooking */}
                {(() => {
                  const selectedStat = fairShareResult?.allStats?.find((s: any) => String(s.flat?.id) === String(formFlatId));
                  if (!selectedStat || selectedStat.isAvailable) return null;
                  const conflictsList = (selectedStat.conflicts || []).filter((c: any) => !selectedRes || String(c.id) !== String(selectedRes.id));
                  if (conflictsList.length === 0 && selectedStat.blocks?.length === 0) return null;
                  const conflict = conflictsList[0];

                  return (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700/60 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">🚨 Conflito de Ocupação: Apt {selectedStat.flat?.number} já possui reserva neste período!</span>
                          {conflict && (
                            <span className="text-[11px] text-rose-700 dark:text-rose-300/90 block">
                              Hóspede em conflito: <strong>{conflict?.guestName || "Outro Hóspede"}</strong> ({conflict?.checkinDate} a {conflict?.checkoutDate})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-rose-200 dark:border-rose-800/60 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                          Forçar encaixe mesmo com conflito (Overbooking — notifica Gestão imediatamente)
                        </div>
                        <Switch checked={formForceReplace} onCheckedChange={setFormForceReplace} />
                      </div>
                    </div>
                  );
                })()}

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

                {/* 2. Tipo de Solicitante da Reserva (Próprio Hóspede, Terceiro, Empresa ou Agência B2B 4-Pontas) */}
                <div className="p-3 bg-slate-100/80 dark:bg-slate-900/80 border rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      Quem está solicitando a reserva?
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFormChannel("b2b")
                        setFormRequesterType("agency_b2b")
                        setShowVoucherParser(!showVoucherParser)
                      }}
                      className="h-7 px-2.5 text-[10.5px] font-bold bg-purple-600/10 hover:bg-purple-600/20 text-purple-700 dark:text-purple-300 border-purple-400/50 gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      {showVoucherParser ? "Fechar Leitor B2B" : "✨ Colar Voucher / E-mail B2B"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormRequesterType("guest")
                        if (formInvoiceRecipientType === "requester" || formInvoiceRecipientType === "agency") {
                          setFormInvoiceRecipientType(formCompanyId ? "company" : "guest")
                        }
                      }}
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
                      onClick={() => {
                        setFormRequesterType("other_person")
                        if (formInvoiceRecipientType === "agency") {
                          setFormInvoiceRecipientType("guest")
                        }
                      }}
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
                      onClick={() => {
                        setFormRequesterType("company")
                        if (!selectedRes) {
                          setFormInvoiceRecipientType("company")
                        }
                      }}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "company"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-primary/50"
                      }`}
                    >
                      <span>🏢 Empresa (PJ Direto)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormRequesterType("agency_b2b")
                        setFormChannel("b2b")
                        setFormPaymentMethod(formB2bPaymentType === "FATURADO" ? "faturado_b2b" : "vcn_b2b")
                        setFormStatus("confirmada")
                        if (!selectedRes) {
                          setFormInvoiceRecipientType("agency")
                          setFormNfHideFromGuest(true)
                        }
                      }}
                      className={`p-2 rounded-xl border text-[11px] font-bold text-left transition-all ${
                        formRequesterType === "agency_b2b" || formChannel === "b2b"
                          ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                          : "bg-background border-border text-purple-700 dark:text-purple-300 hover:border-purple-500/50"
                      }`}
                    >
                      <span>🟣 Agência B2B (4-Pontas)</span>
                    </button>
                  </div>

                  {/* Leitor Inteligente de Voucher B2B */}
                  {showVoucherParser && (
                    <div className="p-3 bg-purple-950/90 text-white border border-purple-500/40 rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          Leitor Inteligente Multimodal de Voucher B2B (PDF Multipágina, Imagem ou Texto)
                        </span>
                        <Badge className="bg-purple-600 text-white text-[9px]">LEITURA 100% INTEGRAL • BOOKING_WS & OTA_WS</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap p-2 rounded-lg bg-slate-900/80 border border-purple-500/30">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-200 hover:text-white">
                          <input
                            type="file"
                            accept=".pdf,application/pdf,image/*"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const reader = new FileReader()
                              reader.onload = () => {
                                const resStr = String(reader.result || "")
                                const base64Part = resStr.includes(",") ? resStr.split(",")[1] : resStr
                                setVoucherFilePayload({
                                  fileBase64: base64Part,
                                  fileName: file.name,
                                  mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg")
                                })
                              }
                              reader.readAsDataURL(file)
                              e.target.value = ""
                            }}
                          />
                          <span className="px-2 py-1 rounded-md bg-purple-600/40 border border-purple-400/40">
                            📎 Anexar PDF Completo ou Print do Voucher
                          </span>
                        </label>
                        {voucherFilePayload ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-medium">
                            <span className="truncate max-w-[220px]">✅ {voucherFilePayload.fileName}</span>
                            <button
                              type="button"
                              onClick={() => setVoucherFilePayload(null)}
                              className="text-rose-300 hover:text-rose-200 text-[10px] underline"
                            >
                              remover
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10.5px] text-purple-300/80">
                            Lê todas as páginas do PDF (Solicitante, VCN, CNPJ, Endereço e E-mail exclusivo de NF)
                          </span>
                        )}
                      </div>
                      <Textarea
                        value={voucherTextToParse}
                        onChange={e => setVoucherTextToParse(e.target.value)}
                        rows={4}
                        placeholder="Ou cole aqui o corpo completo do e-mail / texto do PDF / link do voucher da B2B Reservas..."
                        className="text-xs bg-slate-900/90 border-purple-500/40 text-slate-100 placeholder:text-slate-400"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setVoucherFilePayload(null)
                            setShowVoucherParser(false)
                          }}
                          className="h-7 text-xs text-purple-200 hover:text-white"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={parsingVoucher}
                          onClick={handleParseVoucherText}
                          className="h-7 text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white"
                        >
                          {parsingVoucher ? "Lendo documento completo..." : "⚡ Extrair e Preencher Reserva 4-Pontas"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Detalhes da Reserva Corporativa 4-Pontas (B2B + Agência + Empresa + Hóspede) */}
                  {(formRequesterType === "agency_b2b" || formChannel === "b2b") && (
                    <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-300 dark:border-purple-800/70 rounded-xl space-y-3 mt-2 animate-in fade-in">
                      <div className="flex items-center justify-between gap-2 flex-wrap border-b border-purple-200 dark:border-purple-800/60 pb-2">
                        <div>
                          <span className="text-xs font-black text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                            🟣 Arquitetura Corporativa 4-Pontas (B2B + Agência + Empresa + Hóspede)
                          </span>
                          <span className="text-[10.5px] text-purple-700/80 dark:text-purple-300/80 block">
                            Pré-check-in digital e liberação na recepção 24h imediatos • Valores ocultos do hóspede por padrão
                          </span>
                        </div>

                        {selectedRes && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button
                              type="button"
                              size="sm"
                              disabled={sendingB2bCredentialEmail}
                              onClick={handleSendB2bCredentialEmail}
                              className="h-7 px-2.5 text-[10.5px] font-bold bg-purple-600 hover:bg-purple-700 text-white gap-1 shadow-2xs"
                              title="Envia e-mail cordial para o agente da agência com link seguro para informar WhatsApp e CPF do hóspede"
                            >
                              <Mail className="w-3 h-3" />
                              {sendingB2bCredentialEmail ? "Enviando..." : "📧 Solicitar Contato à Agência"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const code = selectedRes.code || selectedRes.b2bReservationNumber || selectedRes.id
                                const url = `${window.location.origin}/credenciamento/${encodeURIComponent(String(code))}`
                                navigator.clipboard.writeText(url)
                                toast({ title: "Link de Credenciamento Copiado!", description: url })
                              }}
                              className="h-7 px-2 text-[10.5px] font-bold border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200 gap-1"
                            >
                              <Copy className="w-3 h-3" /> Link Agência
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const url = `${window.location.origin}/identificar-reserva`
                                navigator.clipboard.writeText(url)
                                toast({
                                  title: "Link Estático do Hóspede Copiado!",
                                  description: `${url} — O hóspede digita o localizador para se identificar.`
                                })
                              }}
                              className="h-7 px-2 text-[10.5px] font-bold border-teal-400 dark:border-teal-700 text-teal-800 dark:text-teal-200 gap-1"
                              title="Copia o link estático (/identificar-reserva) para o próprio hóspede localizar a reserva pelo RLOC/código e preencher seus dados"
                            >
                              <Copy className="w-3 h-3" /> Link Hóspede (Localizador)
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Ponta 1: Canal B2B & Identificadores */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase text-purple-900 dark:text-purple-200">Nº Reserva B2B</Label>
                          <Input
                            value={formB2bReservationNumber}
                            onChange={e => setFormB2bReservationNumber(e.target.value)}
                            placeholder="Ex: 25055349"
                            className="h-8 text-xs font-mono bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase text-purple-900 dark:text-purple-200">Localizador / RLOC</Label>
                          <Input
                            value={formB2bLocatorRloc}
                            onChange={e => setFormB2bLocatorRloc(e.target.value.toUpperCase())}
                            placeholder="Ex:JXNVWR"
                            className="h-8 text-xs font-mono uppercase bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase text-purple-900 dark:text-purple-200">Origem do Voucher</Label>
                          <Select value={formB2bOriginType} onValueChange={(v: any) => setFormB2bOriginType(v)}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BOOKING_WS">BOOKING_WS (Agência Direta)</SelectItem>
                              <SelectItem value="OTA_WS">OTA_WS (Consolidador / Trend)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Ponta 2: Agência de Viagens Corporativa */}
                      <div className="p-2.5 bg-background border border-purple-200 dark:border-purple-800/60 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black text-purple-700 dark:text-purple-300">
                            Ponta 2 • Agência de Viagens (Solicitante)
                          </span>
                          <button
                            type="button"
                            onClick={() => setNewAgencyInlineOpen(!newAgencyInlineOpen)}
                            className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> {newAgencyInlineOpen ? "Fechar Cadastro" : "Nova Agência B2B"}
                          </button>
                        </div>

                        {newAgencyInlineOpen && (
                          <div className="p-2.5 bg-purple-50/70 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 rounded-lg space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Input
                                value={newAgencyName}
                                onChange={e => setNewAgencyName(e.target.value)}
                                placeholder="Nome / Razão Social da Agência *"
                                className="h-7 text-xs bg-background"
                              />
                              <Input
                                value={newAgencyCnpj}
                                onChange={e => setNewAgencyCnpj(e.target.value)}
                                placeholder="CNPJ da Agência"
                                className="h-7 text-xs font-mono bg-background"
                              />
                              <Input
                                value={newAgencyEmail}
                                onChange={e => setNewAgencyEmail(e.target.value)}
                                placeholder="E-mail da Agência"
                                className="h-7 text-xs bg-background"
                              />
                              <Input
                                type="tel"
                                inputMode="tel"
                                value={newAgencyPhone}
                                onChange={e => setNewAgencyPhone(formatBrazilPhone(e.target.value))}
                                placeholder="Telefone da Agência"
                                className="h-7 text-xs bg-background"
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingNewAgency}
                                onClick={handleSaveNewAgencyInline}
                                className="h-7 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                {savingNewAgency ? "Salvando..." : "Salvar e Vincular Agência"}
                              </Button>
                            </div>
                          </div>
                        )}

                        <MemoAgencySelect
                          value={formAgencyId}
                          onValueChange={stableSelectAgency}
                          agencies={agencies}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            value={formAgencyPosUnit}
                            onChange={e => setFormAgencyPosUnit(e.target.value)}
                            placeholder="Unidade / POS (Ex: OPUS VIAGENS - MATRIZ)"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={formAgencyCnpj}
                            onChange={e => setFormAgencyCnpj(e.target.value)}
                            placeholder="CNPJ da Agência"
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Input
                            value={formAgencyAgentName}
                            onChange={e => setFormAgencyAgentName(e.target.value)}
                            placeholder="Agente Emissor (Ex: Rosana)"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={formAgencyAgentEmail}
                            onChange={e => setFormAgencyAgentEmail(e.target.value)}
                            placeholder="E-mail do Agente"
                            className="h-8 text-xs"
                          />
                          <Input
                            type="tel"
                            inputMode="tel"
                            value={formAgencyAgentPhone}
                            onChange={e => setFormAgencyAgentPhone(formatBrazilPhone(e.target.value))}
                            placeholder="Telefone da Agência"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Ponta 3: Empresa Contratante (Cliente Corporativo) */}
                      <div className="p-2.5 bg-background border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black text-indigo-700 dark:text-indigo-300">
                            Ponta 3 • Empresa Contratante (Empregador do Hóspede)
                          </span>
                          <button
                            type="button"
                            onClick={handleOpenNewCompanyModal}
                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Cadastrar Empresa
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <MemoCompanySelect
                            value={formCompanyId}
                            onValueChange={stableSelectCompanySimple}
                            companies={companies}
                            placeholder="Selecione a Empresa Cliente..."
                            newLabel="➕ Cadastrar Nova Empresa..."
                            newItemClassName="text-indigo-600 font-bold"
                            skipInformadoCnpj
                          />

                          <Input
                            value={formCostCenter}
                            onChange={e => setFormCostCenter(e.target.value)}
                            placeholder="Centro de Custo / Projeto / Ordem"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Política Tarifária, Cartão Virtual VCN & Tomador da NFS-e */}
                      <div className="p-2.5 bg-background border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2.5">
                        <span className="text-[10px] uppercase font-black text-emerald-700 dark:text-emerald-300 block">
                          Política Tarifária, Cartão Virtual (VCN) & Tomador da NFS-e
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">Política de Tarifa</Label>
                            <Select
                              value={formB2bRatePolicy}
                              onValueChange={(v: "NET" | "COMISSIONADA") => {
                                setFormB2bRatePolicy(v)
                                if (v === "NET") {
                                  setFormB2bCommissionPct("0")
                                } else if (Number(formB2bCommissionPct) === 0) {
                                  setFormB2bCommissionPct("12")
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="COMISSIONADA">COMISSIONADA (Com Comissão)</SelectItem>
                                <SelectItem value="NET">NET (Tarifa Líquida 0%)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">Comissão Agência (%)</Label>
                            <Input
                              type="number"
                              value={formB2bRatePolicy === "NET" ? "0" : formB2bCommissionPct}
                              disabled={formB2bRatePolicy === "NET"}
                              onChange={e => setFormB2bCommissionPct(e.target.value)}
                              onBlur={() => {
                                if (String(formB2bCommissionPct).trim() === "") {
                                  setFormB2bCommissionPct("0")
                                }
                              }}
                              className="h-8 text-xs font-bold"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">Pagamento B2B</Label>
                            <Select
                              value={formB2bPaymentType}
                              onValueChange={(v: "VIRTUAL_CARD" | "FATURADO") => {
                                setFormB2bPaymentType(v)
                                setFormPaymentMethod(v === "FATURADO" ? "faturado_b2b" : "vcn_b2b")
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="VIRTUAL_CARD">💳 Cartão Virtual (VCN)</SelectItem>
                                <SelectItem value="FATURADO">🏢 Faturado B2B / Boleto</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {formB2bPaymentType === "VIRTUAL_CARD" && (
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <Input
                              value={formB2bCardBrand}
                              onChange={e => setFormB2bCardBrand(e.target.value)}
                              placeholder="Bandeira (MASTERCARD / VISA)"
                              className="h-8 text-xs"
                            />
                            <Input
                              value={formB2bCardMasked}
                              onChange={e => setFormB2bCardMasked(e.target.value)}
                              placeholder="Cartão Mascarado (553636******8926)"
                              className="h-8 text-xs font-mono"
                            />
                            <Input
                              value={formB2bVcnToken}
                              onChange={e => setFormB2bVcnToken(e.target.value)}
                              placeholder="Token VCN (Ex: Q3DQSN1)"
                              className="h-8 text-xs font-mono"
                            />
                            <Input
                              value={formB2bAuthorizedExpenses}
                              onChange={e => setFormB2bAuthorizedExpenses(e.target.value)}
                              placeholder="Despesas Autorizadas (Apenas Diárias)"
                              className="h-8 text-xs"
                            />
                          </div>
                        )}

                        {/* Resumo Líquido x Comissão */}
                        {(() => {
                          const gross = Number(formTotalAmount) || calculateTotal()
                          const pct = formB2bRatePolicy === "NET" ? 0 : (Number(formB2bCommissionPct) || 0)
                          const comm = Number(((gross * pct) / 100).toFixed(2))
                          const net = Number((gross - comm).toFixed(2))
                          return (
                            <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-[11px] flex-wrap gap-2">
                              <span>Bruto Voucher: <strong>R$ {gross.toFixed(2)}</strong></span>
                              <span>Comissão ({pct}%): <strong className="text-amber-700 dark:text-amber-400">R$ {comm.toFixed(2)}</strong></span>
                              <span>Líquido Hotel (NET): <strong className="text-emerald-700 dark:text-emerald-400">R$ {net.toFixed(2)}</strong></span>
                            </div>
                          )
                        })()}

                        {/* 3 Opções de Tomador da NFS-e */}
                        <div className="space-y-1.5 pt-1 border-t border-border/50">
                          <Label className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300 block">
                            Tomador Padrão da NFS-e (Editável na Emissão Fiscal)
                          </Label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setFormInvoiceRecipientType("agency")}
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                                formInvoiceRecipientType === "agency"
                                  ? "bg-purple-600 text-white border-purple-600"
                                  : "bg-background border-border text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              🟣 Agência PJ
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormInvoiceRecipientType("company")}
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                                formInvoiceRecipientType === "company"
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-background border-border text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              🏢 Empresa PJ
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormInvoiceRecipientType("guest")}
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                                formInvoiceRecipientType === "guest"
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-background border-border text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              👤 Hóspede PF
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center pt-1">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">E-mails p/ Envio da NFS-e & Conciliação</Label>
                            <Input
                              value={formNfDeliveryEmails}
                              onChange={e => setFormNfDeliveryEmails(e.target.value)}
                              placeholder="conciliacao@b2breservas.com.br, agente@agencia.com.br"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-border mt-3 sm:mt-4">
                            <div>
                              <span className="text-[11px] font-bold block">Sigilo Tarifário p/ Hóspede</span>
                              <span className="text-[9.5px] text-muted-foreground block">Ocultar diárias no Portal/WhatsApp e não enviar NFS-e ao hóspede</span>
                            </div>
                            <Switch checked={formNfHideFromGuest} onCheckedChange={setFormNfHideFromGuest} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">Instruções de Faturamento / Observações do Voucher</Label>
                            <Input
                              value={formInvoicingInstructions}
                              onChange={e => setFormInvoicingInstructions(e.target.value)}
                              placeholder="Ex: Emitir NFS-e pelo valor bruto com comissão 12%..."
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">Link do Voucher Original (e-HTL / B2B Reservas)</Label>
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={formVoucherUrl}
                                onChange={e => setFormVoucherUrl(e.target.value)}
                                placeholder="https://www.e-htl.com.br/voucher/..."
                                className="h-8 text-xs font-mono flex-1"
                              />
                              {formVoucherUrl && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(formVoucherUrl, "_blank", "noopener,noreferrer")}
                                  className="h-8 px-2 text-[10px] font-bold shrink-0"
                                >
                                  Abrir
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detalhes do Solicitante Próprio Hóspede */}
                  {formRequesterType === "guest" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-primary block">
                          Buscar Hóspede Cadastrado (CRM 360°)
                        </span>
                        {formGuestId && formGuestId !== "manual" && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormGuestId("manual")
                              setFormGuestName("")
                              setFormGuest1Cpf("")
                              setFormGuestPhone("")
                              setFormGuestEmail("")
                              setFormDocPhotoUrl("")
                              setFormDocFileName("")
                              setFormIsCamposResident(false)
                              setFormIsMonthlyGuest(false)
                              setFormAutoInvoice(false)
                            }}
                            className="text-[10px] text-muted-foreground hover:text-rose-600 underline font-semibold transition-colors cursor-pointer"
                          >
                            Desvincular / Novo Hóspede
                          </button>
                        )}
                      </div>

                      {/* Dropdown com filtro em tempo real ao digitar */}
                      <div className="relative">
                        <Input
                          value={guestSearchFilter}
                          onChange={e => setGuestSearchFilter(e.target.value)}
                          placeholder="🔍 Digite para filtrar no CRM por nome, CPF ou WhatsApp..."
                          className="text-xs h-8 bg-muted/40"
                        />
                        {guestSearchFilter.trim() && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95">
                            <div className="px-2.5 py-1 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                              <span>Resultados no CRM ({filteredGuests.length})</span>
                              <span className="text-[9px]">Clique para selecionar</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (formGuestId && formGuestId !== "manual") {
                                  setFormGuest1Cpf("")
                                  setFormGuestPhone("")
                                  setFormGuestEmail("")
                                  setFormDocPhotoUrl("")
                                  setFormDocFileName("")
                                  setFormIsCamposResident(false)
                                }
                                setFormGuestId("manual")
                                setFormGuestName(guestSearchFilter)
                                setGuestSearchFilter("")
                              }}
                              className="w-full text-left p-2 hover:bg-primary/10 text-primary font-bold text-xs flex items-center gap-2 border-b cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>➕ Cadastrar "{guestSearchFilter}" como Novo Hóspede</span>
                            </button>

                            {filteredGuests.length > 0 ? (
                              <div className="divide-y divide-border/40">
                                {filteredGuests.slice(0, 10).map((g: any) => (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => {
                                      handleSelectGuest(String(g.id))
                                      setGuestSearchFilter("")
                                    }}
                                    className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                      <User className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-foreground truncate">
                                        {g.name || g.fullName}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                        {g.documentNumber || g.document ? (
                                          <span>CPF: {g.documentNumber || g.document}</span>
                                        ) : null}
                                        {g.phone ? (
                                          <span>• Tel: {g.phone}</span>
                                        ) : null}
                                        {g.companyName ? (
                                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="p-3 text-center text-xs text-muted-foreground">
                                Nenhum hóspede localizado com esse termo.
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Lista Suspensa Select tradicional com opção de Novo Hóspede */}
                      <MemoCrmGuestSelect
                        value={formGuestId}
                        onValueChange={stableSelectGuest}
                        guests={crmGuests}
                        placeholder="Ou selecione um Hóspede Cadastrado..."
                        manualLabel="➕ Novo Hóspede (Digitar manualmente)"
                      />
                      {formGuestId && formGuestId !== "manual" && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Hóspede vinculado do CRM ({formGuestName}). Dados preenchidos abaixo.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detalhes do Solicitante Terceiro */}
                  {formRequesterType === "other_person" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-primary block">
                          Buscar Solicitante Cadastrado (CRM 360°)
                        </span>
                        {formRequesterId && formRequesterId !== "manual" && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormRequesterId("manual")
                              setFormRequesterName("")
                              setFormRequesterCpf("")
                              setFormRequesterPhone("")
                              setFormRequesterEmail("")
                            }}
                            className="text-[10px] text-muted-foreground hover:text-rose-600 underline font-semibold transition-colors cursor-pointer"
                          >
                            Desvincular / Novo Solicitante
                          </button>
                        )}
                      </div>

                      {/* Dropdown com filtro em tempo real ao digitar solicitante */}
                      <div className="relative">
                        <Input
                          value={requesterSearchFilter}
                          onChange={e => setRequesterSearchFilter(e.target.value)}
                          placeholder="🔍 Digite para filtrar no CRM por nome, CPF ou WhatsApp do solicitante..."
                          className="text-xs h-8 bg-muted/40"
                        />
                        {requesterSearchFilter.trim() && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95">
                            <div className="px-2.5 py-1 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                              <span>Resultados no CRM ({filteredRequesters.length})</span>
                              <span className="text-[9px]">Clique para selecionar</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setFormRequesterId("manual")
                                setFormRequesterName(requesterSearchFilter)
                                setRequesterSearchFilter("")
                              }}
                              className="w-full text-left p-2 hover:bg-primary/10 text-primary font-bold text-xs flex items-center gap-2 border-b cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>➕ Cadastrar "{requesterSearchFilter}" como Novo Solicitante</span>
                            </button>

                            {filteredRequesters.length > 0 ? (
                              <div className="divide-y divide-border/40">
                                {filteredRequesters.slice(0, 10).map((g: any) => (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => {
                                      handleSelectRequester(String(g.id))
                                      setRequesterSearchFilter("")
                                    }}
                                    className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                      <User className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-foreground truncate">
                                        {g.name || g.fullName}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                        {g.documentNumber || g.document ? (
                                          <span>CPF: {g.documentNumber || g.document}</span>
                                        ) : null}
                                        {g.phone ? (
                                          <span>• Tel: {g.phone}</span>
                                        ) : null}
                                        {g.companyName ? (
                                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="p-3 text-center text-xs text-muted-foreground">
                                Nenhum cliente localizado com esse termo.
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Select tradicional do Solicitante */}
                      <MemoCrmGuestSelect
                        value={formRequesterId}
                        onValueChange={stableSelectRequester}
                        guests={crmGuests}
                        placeholder="Ou selecione um Solicitante Cadastrado..."
                        manualLabel="➕ Novo Solicitante (Digitar manualmente)"
                      />
                      {formRequesterId && formRequesterId !== "manual" && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Solicitante vinculado do CRM ({formRequesterName}).
                        </div>
                      )}

                      {/* Campos do Solicitante (Nome, CPF, WhatsApp, E-mail) */}
                      <div className="pt-2 border-t border-border/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black text-slate-700 dark:text-slate-300 block">
                            Dados do Solicitante (Contato & Faturamento)
                          </span>
                          {formRequesterName.trim() && (!formRequesterId || formRequesterId === "manual") && (
                            <button
                              type="button"
                              onClick={handleSaveRequesterToCrm}
                              className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Cadastrar no CRM agora
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative" ref={requesterSuggestionsRef}>
                            <Input
                              value={formRequesterName}
                              onChange={e => {
                                setFormRequesterName(e.target.value)
                                setShowRequesterSuggestions(true)
                              }}
                              onFocus={() => {
                                if (formRequesterName.trim().length > 0) setShowRequesterSuggestions(true)
                              }}
                              placeholder="Nome do Solicitante *"
                              className="text-xs h-8"
                            />
                            {/* Floating live matches para Solicitante */}
                            {showRequesterSuggestions && formRequesterName.trim().length > 0 && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in zoom-in-95">
                                <div className="px-2.5 py-1.5 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                                  <span>Clientes no CRM ({liveRequesterMatches.length})</span>
                                  <span className="text-[9px]">Clique para preencher</span>
                                </div>
                                {liveRequesterMatches.length > 0 ? (
                                  <div className="divide-y divide-border/40">
                                    {liveRequesterMatches.map((g: any) => (
                                      <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => {
                                          handleSelectRequester(String(g.id))
                                          setShowRequesterSuggestions(false)
                                        }}
                                        className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                      >
                                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                          <User className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-bold text-foreground truncate">
                                            {g.name || g.fullName}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                            {g.documentNumber || g.document ? <span>CPF: {g.documentNumber || g.document}</span> : null}
                                            {g.phone ? <span>• Tel: {g.phone}</span> : null}
                                            {g.companyName ? <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span> : null}
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="p-3 text-center text-[11px] text-muted-foreground">
                                    Nenhum cliente localizado no CRM com este nome.
                                  </div>
                                )}
                                <div className="p-1.5 bg-muted/30 border-t border-border">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormRequesterId("manual")
                                      setShowRequesterSuggestions(false)
                                      toast({
                                        title: "Novo Solicitante",
                                        description: `Preencha os dados de '${formRequesterName}' para registrá-lo.`
                                      })
                                    }}
                                    className="w-full py-1.5 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1.5 justify-center transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Cadastrar como Novo Solicitante: "{formRequesterName}"</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                          <Input
                            value={formRequesterCpf}
                            onChange={e => setFormRequesterCpf(e.target.value)}
                            placeholder="CPF / Documento"
                            className="text-xs h-8"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="tel"
                            inputMode="tel"
                            value={formRequesterPhone}
                            onChange={e => setFormRequesterPhone(formatBrazilPhone(e.target.value))}
                            placeholder="WhatsApp / Celular"
                            className="text-xs h-8"
                          />
                          <Input
                            value={formRequesterEmail}
                            onChange={e => setFormRequesterEmail(e.target.value)}
                            placeholder="E-mail"
                            type="email"
                            className="text-xs h-8"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detalhes do Solicitante Empresa */}
                  {formRequesterType === "company" && (
                    <div className="p-2.5 bg-background border border-primary/20 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-primary block">Selecione a Empresa Cadastrada</span>
                        <button
                          type="button"
                          onClick={handleOpenNewCompanyModal}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Cadastrar Empresa
                        </button>
                      </div>

                      <MemoCompanySelect
                        value={formCompanyId}
                        onValueChange={stableSelectCompanyCorporate}
                        companies={companies}
                        placeholder="Selecione a Empresa Parceira..."
                        newLabel="➕ Cadastrar Nova Empresa Parceira..."
                      />

                      {formCompanyId && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Empresa vinculada para faturamento corporativo ({formCompanyName}).
                        </div>
                      )}

                      <div className="pt-2 border-t border-border/40 space-y-1.5">
                        <span className="text-[10px] uppercase font-black text-slate-700 dark:text-slate-300 block">
                          Contato Solicitante da Empresa (Receberá o Link de Credenciamento do Hóspede)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Input
                            value={formRequesterName}
                            onChange={e => setFormRequesterName(e.target.value)}
                            placeholder="Nome do Solicitante na Empresa"
                            className="text-xs h-8"
                          />
                          <Input
                            type="tel"
                            inputMode="tel"
                            value={formRequesterPhone}
                            onChange={e => setFormRequesterPhone(formatBrazilPhone(e.target.value))}
                            placeholder="WhatsApp (Ex: 22999999999)"
                            className="text-xs h-8"
                          />
                          <Input
                            type="email"
                            value={formRequesterEmail}
                            onChange={e => setFormRequesterEmail(e.target.value)}
                            placeholder="E-mail do Solicitante"
                            className="text-xs h-8"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Dados dos Hóspedes Autorizados (1, 2 e 3) */}
                <div className="space-y-3">
                  {/* Hóspede 1 (Principal) */}
                  <div className="p-3 bg-muted/30 border rounded-xl space-y-2.5">
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-primary" />
                        <span>Hóspede 1 (Titular)</span>
                        {formRequesterType !== "guest" && !formGuestName.trim() && (
                          <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
                            Opcional agora — Solicitante receberá link de preenchimento
                          </Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {formRequesterType !== "guest" && (
                          <div className="w-44 sm:w-56">
                            <MemoCrmGuestSelect
                              value={formGuestId}
                              onValueChange={stableSelectGuest}
                              guests={crmGuests}
                              placeholder="Puxar do CRM..."
                              manualLabel="Digitar manualmente"
                              triggerClassName="text-[10px] h-6 px-2"
                              contentClassName="max-h-60"
                              compact
                            />
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const url = `${window.location.origin}/identificar-reserva`
                            navigator.clipboard.writeText(url)
                            toast({
                              title: "Link Estático (/identificar-reserva) Copiado!",
                              description: `${url} — Envie ao hóspede para ele digitar o localizador e preencher os dados.`
                            })
                          }}
                          className="h-6 px-2 text-[10px] font-bold border-teal-400/70 text-teal-700 dark:text-teal-300 gap-1"
                          title="Copia o link estático (/identificar-reserva) para o hóspede digitar o localizador e preencher nome, CPF, WhatsApp, e-mail e documento"
                        >
                          <Copy className="w-2.5 h-2.5" /> Link Identificar Reserva
                        </Button>
                        <Badge variant="outline" className="text-[9px] shrink-0">Check-in Principal</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative" ref={guestSuggestionsRef}>
                        <Input 
                          value={formGuestName} 
                          onChange={e => {
                            setFormGuestName(e.target.value)
                            setShowGuestSuggestions(true)
                          }} 
                          onFocus={() => {
                            if (formGuestName.trim().length > 0) setShowGuestSuggestions(true)
                          }}
                          placeholder={formRequesterType !== "guest" ? "Nome Completo (Opcional agora)" : "Nome Completo *"} 
                          required={formRequesterType === "guest"} 
                          className="text-xs h-8" 
                        />

                        {/* Floating live matches dropdown when typing guest name */}
                        {showGuestSuggestions && formGuestName.trim().length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in zoom-in-95">
                            <div className="px-2.5 py-1.5 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                              <span>Hóspedes no CRM ({liveGuestMatches.length})</span>
                              <span className="text-[9px]">Clique para preencher</span>
                            </div>

                            {liveGuestMatches.length > 0 ? (
                              <div className="divide-y divide-border/40">
                                {liveGuestMatches.map((g: any) => (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => {
                                      handleSelectGuest(String(g.id))
                                      setShowGuestSuggestions(false)
                                    }}
                                    className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                      <User className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-foreground truncate">
                                        {g.name || g.fullName}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                        {g.documentNumber || g.document ? (
                                          <span>CPF: {g.documentNumber || g.document}</span>
                                        ) : null}
                                        {g.phone ? (
                                          <span>• Tel: {g.phone}</span>
                                        ) : null}
                                        {g.companyName ? (
                                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="p-3 text-center text-[11px] text-muted-foreground">
                                Nenhum hóspede localizado no CRM com este nome.
                              </div>
                            )}

                            {/* Ação para registrar como Novo Hóspede */}
                            <div className="p-1.5 bg-muted/30 border-t border-border">
                              <button
                                type="button"
                                onClick={() => {
                                  if (formGuestId && formGuestId !== "manual") {
                                    setFormDocPhotoUrl("")
                                    setFormDocFileName("")
                                    setFormIsCamposResident(false)
                                  }
                                  setFormGuestId("manual")
                                  setShowGuestSuggestions(false)
                                  toast({
                                    title: "Novo Hóspede",
                                    description: `Preencha os dados de '${formGuestName}' para registrá-lo.`
                                  })
                                }}
                                className="w-full py-1.5 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1.5 justify-center transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Cadastrar como Novo Hóspede: "{formGuestName}"</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <Input
                        value={formGuest1Cpf}
                        onChange={e => setFormGuest1Cpf(e.target.value)}
                        placeholder={formRequesterType !== "guest" ? "CPF / Documento (Opcional agora)" : "CPF / Documento"}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="relative">
                          <Input 
                            type="tel"
                            inputMode="tel"
                            value={formGuestPhone} 
                            onChange={e => {
                              const formatted = formatBrazilPhone(e.target.value)
                              setFormGuestPhone(formatted)
                              if (phoneVerification && phoneVerification.phone !== formatted.replace(/\D/g, "")) {
                                setPhoneVerification(null)
                              }
                            }} 
                            onBlur={() => {
                              const trimmed = formGuestPhone.trim()
                              const digitsLen = trimmed.replace(/\D/g, "").length
                              if (digitsLen >= 10 || (trimmed.startsWith("+") && digitsLen >= 8)) {
                                verifyGuestPhoneWhatsApp(formGuestPhone)
                              }
                            }}
                            placeholder={formRequesterType !== "guest" ? "WhatsApp do Hóspede (Opcional agora)" : "WhatsApp / Celular"} 
                            className={`text-xs h-8 ${phoneVerification && phoneVerification.checked && phoneVerification.exists === false ? "border-amber-500 bg-amber-500/5 focus-visible:ring-amber-500" : (phoneVerification && phoneVerification.checked && phoneVerification.exists ? "border-emerald-500/80 bg-emerald-500/5" : "")}`} 
                          />
                          {phoneVerification?.checking && (
                            <span className="absolute right-2 top-2 text-[10px] text-muted-foreground flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5 animate-spin text-muted-foreground" />
                            </span>
                          )}
                        </div>
                        {phoneVerification && phoneVerification.checked && phoneVerification.exists === false && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1 animate-in fade-in leading-tight">
                            <span>⚠️</span>
                            <span>Número sem WhatsApp ativo (verifique digitação).</span>
                          </div>
                        )}
                        {phoneVerification && phoneVerification.checked && phoneVerification.exists === true && (
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1 animate-in fade-in leading-tight">
                            <span>✓</span>
                            <span>WhatsApp verificado e ativo.</span>
                          </div>
                        )}
                      </div>
                      <Input
                        type="email"
                        value={formGuestEmail}
                        onChange={e => setFormGuestEmail(e.target.value)}
                        placeholder={formRequesterType !== "guest" ? "E-mail do Hóspede (Opcional agora)" : "E-mail"}
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  {/* Documento com Foto do Hóspede Oficial (Foto / PDF) */}
                  <div className="p-3 bg-muted/40 border border-border/80 rounded-xl space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span>
                          Documento com Foto (RG, CNH, Passaporte - Foto ou PDF)
                          {formRequesterType !== "guest" ? " — Opcional agora" : ""}
                        </span>
                      </Label>
                      <div className="flex items-center gap-1.5">
                        {formHasMinor && (
                          <Badge className="text-[10px] bg-rose-600 text-white font-black hover:bg-rose-700">
                            👶 Menor de Idade
                          </Badge>
                        )}
                        {formIsCamposResident && (
                          <Badge className="text-[10px] bg-purple-700 text-white font-black hover:bg-purple-800">
                            📍 Campos/RJ
                          </Badge>
                        )}
                      </div>
                    </div>

                    <input
                      ref={pmsDocInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleDocSelect}
                      className="hidden"
                    />

                    {!formDocPhotoUrl ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingDoc}
                          onClick={() => pmsDocInputRef.current?.click()}
                          className="w-full text-xs h-8 rounded-xl font-bold flex items-center justify-center gap-1.5 border-dashed border-primary/40 hover:bg-primary/5"
                        >
                          <Camera className="w-3.5 h-3.5 text-primary" />
                          <span>{uploadingDoc ? "Processando e Analisando..." : "Anexar Foto ou PDF do Documento"}</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-2 bg-background border border-border rounded-xl text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {formDocPhotoUrl.startsWith("data:application/pdf") || formDocPhotoUrl.toLowerCase().endsWith(".pdf") ? (
                            <div className="w-8 h-8 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-rose-600" />
                            </div>
                          ) : (
                            <img
                              src={formDocPhotoUrl}
                              alt="Documento Hóspede"
                              className="w-8 h-8 object-cover rounded border border-border shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex flex-col">
                            <span className="truncate text-[11px] font-bold text-foreground">
                              {formDocFileName || (formDocPhotoUrl.includes(".pdf") ? "documento_oficial.pdf" : "documento_oficial.jpg")}
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 inline" /> Anexado (enviado à recepção por e-mail)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (formDocPhotoUrl.startsWith("data:application/pdf") || formDocPhotoUrl.toLowerCase().includes(".pdf") || formDocFileName.toLowerCase().endsWith(".pdf")) {
                                setDocPdfViewerOpen(true)
                              } else {
                                window.open(formDocPhotoUrl, "_blank")
                              }
                            }}
                            className="text-[10px] h-6 px-1.5"
                          >
                            <ExternalLink className="w-3 h-3 mr-0.5" /> Ver
                          </Button>
                          {docPdfViewerOpen && (
                            <PdfViewerDialog
                              open={docPdfViewerOpen}
                              onOpenChange={setDocPdfViewerOpen}
                              url={formDocPhotoUrl}
                              title={formDocFileName || "Documento do Hóspede"}
                            />
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => pmsDocInputRef.current?.click()}
                            className="text-[10px] h-6 px-1.5"
                          >
                            Trocar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setFormDocPhotoUrl("")
                              setFormDocFileName("")
                            }}
                            className="text-[10px] h-6 px-1 text-rose-500 hover:text-rose-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Toggles manuais para Menor de Idade e Residente de Campos/RJ */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-border/50 text-[11px]">
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-muted-foreground select-none">
                        <input
                          type="checkbox"
                          checked={formHasMinor}
                          onChange={(e) => setFormHasMinor(e.target.checked)}
                          className="rounded border-border text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                        />
                        <span>👶 Menor de Idade (ECA Art. 82)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-muted-foreground select-none">
                        <input
                          type="checkbox"
                          checked={formIsCamposResident}
                          onChange={(e) => setFormIsCamposResident(e.target.checked)}
                          className="rounded border-border text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                        />
                        <span>📍 Morador de Campos/RJ (Radar)</span>
                      </label>
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
                        <div className="flex items-center gap-2">
                          {formGuest2Name.trim() && (!formGuest2Id || formGuest2Id === "manual") && (
                            <button
                              type="button"
                              onClick={() => handleSaveAdditionalGuestToCrm(2)}
                              className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Cadastrar no CRM agora
                            </button>
                          )}
                          <Badge variant="outline" className="text-[9px]">Acompanhante</Badge>
                        </div>
                      </div>

                      {/* Busca CRM para Hóspede 2 */}
                      <div className="p-2 bg-background border border-indigo-500/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black text-indigo-600 dark:text-indigo-400 block">
                            Buscar 2º Hóspede Cadastrado (CRM 360°)
                          </span>
                          {formGuest2Id && formGuest2Id !== "manual" && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormGuest2Id("manual")
                                setFormGuest2Name("")
                                setFormGuest2Cpf("")
                                setFormGuest2Phone("")
                                setFormGuest2Email("")
                              }}
                              className="text-[10px] text-muted-foreground hover:text-rose-600 underline font-semibold transition-colors cursor-pointer"
                            >
                              Desvincular / Novo Hóspede
                            </button>
                          )}
                        </div>

                        <div className="relative">
                          <Input
                            value={guest2SearchFilter}
                            onChange={e => setGuest2SearchFilter(e.target.value)}
                            placeholder="🔍 Digite para filtrar no CRM por nome, CPF ou WhatsApp..."
                            className="text-xs h-8 bg-muted/40"
                          />
                          {guest2SearchFilter.trim() && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95">
                              <div className="px-2.5 py-1 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                                <span>Resultados no CRM ({filteredGuests2.length})</span>
                                <span className="text-[9px]">Clique para selecionar</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setFormGuest2Id("manual")
                                  setFormGuest2Name(guest2SearchFilter)
                                  setGuest2SearchFilter("")
                                }}
                                className="w-full text-left p-2 hover:bg-primary/10 text-primary font-bold text-xs flex items-center gap-2 border-b cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>➕ Cadastrar "{guest2SearchFilter}" como Novo Hóspede</span>
                              </button>

                              {filteredGuests2.length > 0 ? (
                                <div className="divide-y divide-border/40">
                                  {filteredGuests2.slice(0, 10).map((g: any) => (
                                    <button
                                      key={g.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectGuest2(String(g.id))
                                        setGuest2SearchFilter("")
                                      }}
                                      className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        <User className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-foreground truncate">
                                          {g.name || g.fullName}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                          {g.documentNumber || g.document ? (
                                            <span>CPF: {g.documentNumber || g.document}</span>
                                          ) : null}
                                          {g.phone ? (
                                            <span>• Tel: {g.phone}</span>
                                          ) : null}
                                          {g.companyName ? (
                                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span>
                                          ) : null}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 text-center text-xs text-muted-foreground">
                                  Nenhum hóspede localizado com esse termo.
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <MemoCrmGuestSelect
                          value={formGuest2Id}
                          onValueChange={stableSelectGuest2}
                          guests={crmGuests}
                          placeholder="Ou selecione um Hóspede Cadastrado..."
                          manualLabel="➕ Novo Hóspede (Digitar manualmente)"
                        />

                        {formGuest2Id && formGuest2Id !== "manual" && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 2º Hóspede vinculado do CRM ({formGuest2Name}).
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative" ref={guest2SuggestionsRef}>
                          <Input
                            value={formGuest2Name}
                            onChange={e => {
                              setFormGuest2Name(e.target.value)
                              setShowGuest2Suggestions(true)
                            }}
                            onFocus={() => {
                              if (formGuest2Name.trim().length > 0) setShowGuest2Suggestions(true)
                            }}
                            placeholder="Nome do 2º Hóspede"
                            className="text-xs h-8"
                          />
                          {showGuest2Suggestions && formGuest2Name.trim().length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in zoom-in-95">
                              <div className="px-2.5 py-1.5 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                                <span>Hóspedes no CRM ({liveGuest2Matches.length})</span>
                                <span className="text-[9px]">Clique para preencher</span>
                              </div>
                              {liveGuest2Matches.length > 0 ? (
                                <div className="divide-y divide-border/40">
                                  {liveGuest2Matches.map((g: any) => (
                                    <button
                                      key={g.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectGuest2(String(g.id))
                                        setShowGuest2Suggestions(false)
                                      }}
                                      className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        <User className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-foreground truncate">
                                          {g.name || g.fullName}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                          {g.documentNumber || g.document ? <span>CPF: {g.documentNumber || g.document}</span> : null}
                                          {g.phone ? <span>• Tel: {g.phone}</span> : null}
                                          {g.companyName ? <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span> : null}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 text-center text-[11px] text-muted-foreground">
                                  Nenhum hóspede localizado no CRM com este nome.
                                </div>
                              )}
                              <div className="p-1.5 bg-muted/30 border-t border-border">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormGuest2Id("manual")
                                    setShowGuest2Suggestions(false)
                                    toast({
                                      title: "Novo Hóspede",
                                      description: `Preencha os dados de '${formGuest2Name}' para registrá-lo.`
                                    })
                                  }}
                                  className="w-full py-1.5 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1.5 justify-center transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Cadastrar como Novo Hóspede: "{formGuest2Name}"</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <Input value={formGuest2Cpf} onChange={e => setFormGuest2Cpf(e.target.value)} placeholder="CPF do 2º Hóspede" className="text-xs h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="tel" inputMode="tel" value={formGuest2Phone} onChange={e => setFormGuest2Phone(formatBrazilPhone(e.target.value))} placeholder="WhatsApp do 2º Hóspede" className="text-xs h-8" />
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
                        <div className="flex items-center gap-2">
                          {formGuest3Name.trim() && (!formGuest3Id || formGuest3Id === "manual") && (
                            <button
                              type="button"
                              onClick={() => handleSaveAdditionalGuestToCrm(3)}
                              className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Cadastrar no CRM agora
                            </button>
                          )}
                          <Badge variant="outline" className="text-[9px]">Acompanhante Extra</Badge>
                        </div>
                      </div>

                      {/* Busca CRM para Hóspede 3 */}
                      <div className="p-2 bg-background border border-purple-500/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black text-purple-600 dark:text-purple-400 block">
                            Buscar 3º Hóspede Cadastrado (CRM 360°)
                          </span>
                          {formGuest3Id && formGuest3Id !== "manual" && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormGuest3Id("manual")
                                setFormGuest3Name("")
                                setFormGuest3Cpf("")
                                setFormGuest3Phone("")
                                setFormGuest3Email("")
                              }}
                              className="text-[10px] text-muted-foreground hover:text-rose-600 underline font-semibold transition-colors cursor-pointer"
                            >
                              Desvincular / Novo Hóspede
                            </button>
                          )}
                        </div>

                        <div className="relative">
                          <Input
                            value={guest3SearchFilter}
                            onChange={e => setGuest3SearchFilter(e.target.value)}
                            placeholder="🔍 Digite para filtrar no CRM por nome, CPF ou WhatsApp..."
                            className="text-xs h-8 bg-muted/40"
                          />
                          {guest3SearchFilter.trim() && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95">
                              <div className="px-2.5 py-1 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                                <span>Resultados no CRM ({filteredGuests3.length})</span>
                                <span className="text-[9px]">Clique para selecionar</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setFormGuest3Id("manual")
                                  setFormGuest3Name(guest3SearchFilter)
                                  setGuest3SearchFilter("")
                                }}
                                className="w-full text-left p-2 hover:bg-primary/10 text-primary font-bold text-xs flex items-center gap-2 border-b cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>➕ Cadastrar "{guest3SearchFilter}" como Novo Hóspede</span>
                              </button>

                              {filteredGuests3.length > 0 ? (
                                <div className="divide-y divide-border/40">
                                  {filteredGuests3.slice(0, 10).map((g: any) => (
                                    <button
                                      key={g.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectGuest3(String(g.id))
                                        setGuest3SearchFilter("")
                                      }}
                                      className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        <User className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-foreground truncate">
                                          {g.name || g.fullName}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                          {g.documentNumber || g.document ? (
                                            <span>CPF: {g.documentNumber || g.document}</span>
                                          ) : null}
                                          {g.phone ? (
                                            <span>• Tel: {g.phone}</span>
                                          ) : null}
                                          {g.companyName ? (
                                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span>
                                          ) : null}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 text-center text-xs text-muted-foreground">
                                  Nenhum hóspede localizado com esse termo.
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <MemoCrmGuestSelect
                          value={formGuest3Id}
                          onValueChange={stableSelectGuest3}
                          guests={crmGuests}
                          placeholder="Ou selecione um Hóspede Cadastrado..."
                          manualLabel="➕ Novo Hóspede (Digitar manualmente)"
                        />

                        {formGuest3Id && formGuest3Id !== "manual" && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 3º Hóspede vinculado do CRM ({formGuest3Name}).
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative" ref={guest3SuggestionsRef}>
                          <Input
                            value={formGuest3Name}
                            onChange={e => {
                              setFormGuest3Name(e.target.value)
                              setShowGuest3Suggestions(true)
                            }}
                            onFocus={() => {
                              if (formGuest3Name.trim().length > 0) setShowGuest3Suggestions(true)
                            }}
                            placeholder="Nome do 3º Hóspede"
                            className="text-xs h-8"
                          />
                          {showGuest3Suggestions && formGuest3Name.trim().length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in zoom-in-95">
                              <div className="px-2.5 py-1.5 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                                <span>Hóspedes no CRM ({liveGuest3Matches.length})</span>
                                <span className="text-[9px]">Clique para preencher</span>
                              </div>
                              {liveGuest3Matches.length > 0 ? (
                                <div className="divide-y divide-border/40">
                                  {liveGuest3Matches.map((g: any) => (
                                    <button
                                      key={g.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectGuest3(String(g.id))
                                        setShowGuest3Suggestions(false)
                                      }}
                                      className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        <User className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-foreground truncate">
                                          {g.name || g.fullName}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                          {g.documentNumber || g.document ? <span>CPF: {g.documentNumber || g.document}</span> : null}
                                          {g.phone ? <span>• Tel: {g.phone}</span> : null}
                                          {g.companyName ? <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {g.companyName}</span> : null}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 text-center text-[11px] text-muted-foreground">
                                  Nenhum hóspede localizado no CRM com este nome.
                                </div>
                              )}
                              <div className="p-1.5 bg-muted/30 border-t border-border">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormGuest3Id("manual")
                                    setShowGuest3Suggestions(false)
                                    toast({
                                      title: "Novo Hóspede",
                                      description: `Preencha os dados de '${formGuest3Name}' para registrá-lo.`
                                    })
                                  }}
                                  className="w-full py-1.5 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1.5 justify-center transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Cadastrar como Novo Hóspede: "{formGuest3Name}"</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <Input value={formGuest3Cpf} onChange={e => setFormGuest3Cpf(e.target.value)} placeholder="CPF do 3º Hóspede" className="text-xs h-8" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="tel" inputMode="tel" value={formGuest3Phone} onChange={e => setFormGuest3Phone(formatBrazilPhone(e.target.value))} placeholder="WhatsApp do 3º Hóspede" className="text-xs h-8" />
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
                      onClick={handleSelectPreReserva}
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
                      onClick={handleSelectConfirmada}
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

                  {/* Banner de Modo de Reativação de Pré-Reserva Expirada */}
                  {(isReactivatingRes || selectedRes?.status === "expirada") && (
                    <div className="mt-3 p-3 rounded-xl bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700 text-xs text-indigo-950 dark:text-indigo-200 space-y-1.5 animate-in fade-in">
                      <div className="flex items-center gap-1.5 font-black text-indigo-900 dark:text-indigo-100">
                        <RotateCcw className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>🔄 Reativando Pré-Reserva Expirada ({selectedRes?.code})</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-indigo-800 dark:text-indigo-300">
                        Todos os dados do hóspede e valores já foram preenchidos. Escolha o novo tempo de validade abaixo (ou marque como <strong>Confirmada</strong>) e clique em <strong>Salvar</strong> para reativar no calendário e reenviar os dados e o link de pagamento no WhatsApp.
                      </p>
                      {reactivationFlatSwitchedInfo && (
                        <div className="p-2 rounded-lg bg-amber-100/90 dark:bg-amber-950/60 border border-amber-400 text-amber-950 dark:text-amber-200 font-bold text-[11px] flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{reactivationFlatSwitchedInfo}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seletor de Tempo de Validade da Pré-Reserva */}
                  {formStatus === "pre_reserva" && (() => {
                    const holdPreview = computeHoldExpirationInfo()
                    const isCheckinToday = formCheckin === todayStr
                    const presetOptions: { id: "10m" | "30m" | "2h" | "until_2359" | "custom"; label: string; badge?: string }[] = [
                      { id: "10m", label: "⏱️ 10 min" },
                      { id: "30m", label: "⏱️ 30 min" },
                      { id: "2h", label: "⏳ 2h", badge: isCheckinToday ? "Padrão Hoje" : undefined },
                      { id: "until_2359", label: "🌙 Até 23:59 de hoje", badge: !isCheckinToday ? "Padrão" : undefined },
                      { id: "custom", label: "⚙️ Outro tempo" }
                    ]
                    return (
                      <div className="mt-3 pt-3 border-t border-amber-300/60 dark:border-amber-800/60 space-y-2.5 animate-in fade-in">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            Tempo de Validade da Pré-Reserva
                          </span>
                          <span className="text-[10.5px] font-semibold text-amber-800 dark:text-amber-400">
                            Expira e sai do calendário automaticamente se não pagar
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {presetOptions.map(opt => {
                            const active = formHoldPreset === opt.id
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setFormHoldPreset(opt.id)
                                  setFormHoldManuallyChosen(true)
                                }}
                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  active
                                    ? "bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/40"
                                    : "bg-background/90 border-amber-300/80 dark:border-amber-800 text-slate-800 dark:text-slate-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/40"
                                }`}
                              >
                                <span>{opt.label}</span>
                                {opt.badge && (
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                                    active ? "bg-white/25 text-white" : "bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200"
                                  }`}>
                                    {opt.badge}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        {formHoldPreset === "custom" && (
                          <div className="p-2.5 rounded-xl bg-background/95 border border-amber-300 dark:border-amber-800 space-y-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setFormHoldCustomMode("duration")}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  formHoldCustomMode === "duration"
                                    ? "bg-amber-600 text-white"
                                    : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                Por Duração (Minutos / Horas)
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormHoldCustomMode("datetime")}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  formHoldCustomMode === "datetime"
                                    ? "bg-amber-600 text-white"
                                    : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                Data e Hora Exata
                              </button>
                            </div>

                            {formHoldCustomMode === "duration" ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="1"
                                    max="10080"
                                    value={formHoldCustomValue}
                                    onChange={e => setFormHoldCustomValue(e.target.value)}
                                    className="h-8 w-24 text-xs font-bold"
                                    placeholder="Ex: 45"
                                  />
                                  <select
                                    value={formHoldCustomUnit}
                                    onChange={e => setFormHoldCustomUnit(e.target.value as "minutes" | "hours")}
                                    className="h-8 px-2.5 rounded-md border border-input bg-background text-xs font-bold"
                                  >
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                  </select>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {[
                                    { label: "15 min", val: "15", unit: "minutes" as const },
                                    { label: "45 min", val: "45", unit: "minutes" as const },
                                    { label: "1h", val: "1", unit: "hours" as const },
                                    { label: "4h", val: "4", unit: "hours" as const },
                                    { label: "6h", val: "6", unit: "hours" as const },
                                    { label: "12h", val: "12", unit: "hours" as const },
                                    { label: "24h", val: "24", unit: "hours" as const },
                                  ].map(ch => (
                                    <button
                                      key={ch.label}
                                      type="button"
                                      onClick={() => {
                                        setFormHoldCustomValue(ch.val)
                                        setFormHoldCustomUnit(ch.unit)
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-amber-100/70 dark:bg-amber-950/60 hover:bg-amber-200 text-amber-900 dark:text-amber-300 text-[10px] font-bold border border-amber-300/60"
                                    >
                                      {ch.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Label className="text-[11px] font-bold">Escolha o dia e horário limite:</Label>
                                <Input
                                  type="datetime-local"
                                  value={formHoldCustomDateTime}
                                  onChange={e => setFormHoldCustomDateTime(e.target.value)}
                                  className="h-8 text-xs font-mono"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-950 dark:text-amber-200 space-y-2">
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div>
                                <strong>Validade definida:</strong> até <strong>{holdPreview.formattedDeadline}</strong> ({holdPreview.holdDurationLabel}).
                              </div>
                              <div className="text-[10.5px] text-amber-800 dark:text-amber-300/90">
                                A mensagem enviada ao WhatsApp do hóspede informará esse prazo com clareza. Se não houver pagamento até o vencimento, a pré-reserva sai do calendário e o cliente é avisado no WhatsApp.
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-amber-300/60 dark:border-amber-800/60 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 text-[10.5px]">
                              <Bell className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                              {holdPreview.reminderLeadMinutes <= 0 ? (
                                <span className="text-amber-800 dark:text-amber-300">
                                  <strong>Lembrete intermediário:</strong> Não enviado em pré-reservas de 10 min (para evitar excesso de mensagens).
                                </span>
                              ) : formSendExpirationReminder ? (
                                <span className="text-amber-950 dark:text-amber-100">
                                  <strong>Lembrete no WhatsApp:</strong> será enviado faltando <strong>{holdPreview.reminderLeadLabel}</strong>{holdPreview.reminderFormattedTime ? ` (${holdPreview.reminderFormattedTime})` : ""} com Link + PIX Copia e Cola.
                                </span>
                              ) : (
                                <span className="text-muted-foreground line-through">
                                  Lembrete antes de expirar desativado para esta pré-reserva
                                </span>
                              )}
                            </div>

                            {holdPreview.reminderLeadMinutes > 0 && (
                              <button
                                type="button"
                                onClick={() => setFormSendExpirationReminder(prev => !prev)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                                  formSendExpirationReminder
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                    : "bg-background text-muted-foreground border-border hover:text-foreground"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${formSendExpirationReminder ? "bg-white" : "bg-slate-400"}`} />
                                {formSendExpirationReminder ? "Lembrete Ativo" : "Lembrete Desativado"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Painel Dedicado: Pré-Reserva da Diária Extra (Quando diária adicional está com saldo pendente em reserva já confirmada) */}
                {selectedRes && formStatus !== "pre_reserva" && !formIsFaturadoBoleto && formChannel !== "b2b" && (() => {
                  const baseCin = selectedRes.pendingStayExtension?.isPreReservationHold
                    ? (selectedRes.pendingStayExtension.oldCheckinDate || selectedRes.checkinDate)
                    : selectedRes.checkinDate
                  const baseCout = selectedRes.pendingStayExtension?.isPreReservationHold
                    ? (selectedRes.pendingStayExtension.oldCheckoutDate || selectedRes.checkoutDate)
                    : selectedRes.checkoutDate
                  const addedDirectRates = formDailyRates.filter(d => {
                    const ch = String(d.channel || "").toLowerCase()
                    const isPaidOtaOrB2bChan = ch.includes("booking") || ch.includes("airbnb") || ch.includes("b2b")
                    return !isPaidOtaOrB2bChan && (d.date < baseCin || d.date >= baseCout)
                  })
                  const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal()
                  const sumPay = formPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
                  const isPaidFullNow = formPaymentStatus === "pago_total" || formPaymentStatus === "pago"
                  const curPaid = isPaidFullNow ? Math.max(curTot, sumPay || Number(formPaidAmount) || 0) : (sumPay > 0 ? sumPay : (Number(formPaidAmount) || 0))
                  const pendingExtBalance = Math.max(0, Math.round((curTot - curPaid) * 100) / 100)
                  const hasActiveServerPendingExt = selectedRes.pendingStayExtension?.status === "pending_payment"

                  if ((addedDirectRates.length === 0 || pendingExtBalance <= 0.01 || isPaidFullNow) && !hasActiveServerPendingExt) {
                    return null
                  }

                  const holdPreview = computeHoldExpirationInfo()
                  const firstAddedStr = addedDirectRates[0]?.date || baseCout
                  const defaultExtPreset = getDefaultHoldPresetForExtension(firstAddedStr)
                  const extPresetOptions: { id: "10m" | "30m" | "2h" | "until_2359" | "custom"; label: string; badge?: string }[] = [
                    { id: "10m", label: "⏱️ 10 min" },
                    { id: "30m", label: "⏱️ 30 min", badge: defaultExtPreset === "30m" ? "Padrão" : undefined },
                    { id: "2h", label: "⏳ 2h", badge: defaultExtPreset === "2h" ? "Padrão" : undefined },
                    { id: "until_2359", label: "🌙 Até 23:59 de hoje", badge: defaultExtPreset === "until_2359" ? "Padrão" : undefined },
                    { id: "custom", label: "⚙️ Outro tempo" }
                  ]

                  return (
                    <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/35 border-2 border-dashed border-amber-400 dark:border-amber-700 space-y-3 shadow-2xs animate-in fade-in">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-black text-amber-950 dark:text-amber-100">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              ⏳ Modo da(s) +{Math.max(1, addedDirectRates.length || selectedRes.pendingStayExtension?.extraNights || 1)} Diária(s) Extra(s) sem Pagamento (R$ {pendingExtBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-900/90 dark:text-amber-300 leading-snug">
                            A reserva original (<strong>{baseCin?.split("-").reverse().join("/")}</strong> a <strong>{baseCout?.split("-").reverse().join("/")}</strong>) permanece 100% confirmada e quitada. Apenas o período adicional entra aguardando pagamento.
                          </p>
                        </div>

                        {hasActiveServerPendingExt && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={cancellingPendingExt}
                            onClick={handleCancelPendingExtension}
                            className="h-7 px-2.5 rounded-lg border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-[10.5px] gap-1 shrink-0 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{cancellingPendingExt ? "Revertendo..." : "↩️ Cancelar apenas diária(s) pendente(s)"}</span>
                          </Button>
                        )}
                      </div>

                      {isReactivatingExt && (
                        <div className="p-2.5 rounded-xl bg-indigo-50/95 dark:bg-indigo-950/50 border border-indigo-300 dark:border-indigo-700 text-[11px] text-indigo-950 dark:text-indigo-200 space-y-1">
                          <div className="font-black flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>🔄 Reativando Diária Extra Expirada ({selectedRes.code})</span>
                          </div>
                          <p className="text-[10.5px] text-indigo-800 dark:text-indigo-300">
                            Escolha o novo prazo de validade abaixo e clique em <strong>Salvar</strong> para reenviar a cobrança PIX/Cartão no WhatsApp.
                          </p>
                          {reactivationFlatSwitchedInfo && (
                            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950/70 border border-amber-400 text-amber-950 dark:text-amber-200 font-bold">
                              {reactivationFlatSwitchedInfo}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormExtensionHoldMode("pre_reserva")}
                          className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between cursor-pointer ${
                            formExtensionHoldMode === "pre_reserva"
                              ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs"
                              : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-amber-400"
                          }`}
                        >
                          <span>⏳ Pré-Reserva da Diária Extra (Com Prazo)</span>
                          {formExtensionHoldMode === "pre_reserva" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormExtensionHoldMode("confirmada_sem_prazo")}
                          className={`p-2.5 rounded-xl border text-left transition-all text-xs font-bold flex items-center justify-between cursor-pointer ${
                            formExtensionHoldMode === "confirmada_sem_prazo"
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                              : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-emerald-400"
                          }`}
                        >
                          <span>✅ Confirmar Sem Prazo (Hóspede de Confiança)</span>
                          {formExtensionHoldMode === "confirmada_sem_prazo" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      </div>

                      {formExtensionHoldMode === "pre_reserva" && (
                        <div className="pt-2 border-t border-amber-300/60 dark:border-amber-800/60 space-y-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {extPresetOptions.map(opt => {
                              const active = formHoldPreset === opt.id
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    setFormHoldPreset(opt.id)
                                    setFormHoldManuallyChosen(true)
                                  }}
                                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    active
                                      ? "bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/40"
                                      : "bg-background/90 border-amber-300/80 dark:border-amber-800 text-slate-800 dark:text-slate-200 hover:bg-amber-100/60"
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {opt.badge && (
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                                      active ? "bg-white/25 text-white" : "bg-amber-200/80 text-amber-900"
                                    }`}>
                                      {opt.badge}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>

                          {formHoldPreset === "custom" && (
                            <div className="p-2.5 rounded-xl bg-background/95 border border-amber-300 dark:border-amber-800 space-y-2.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setFormHoldCustomMode("duration")}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                    formHoldCustomMode === "duration"
                                      ? "bg-amber-600 text-white"
                                      : "bg-muted text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Por Duração (Minutos / Horas)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormHoldCustomMode("datetime")}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                    formHoldCustomMode === "datetime"
                                      ? "bg-amber-600 text-white"
                                      : "bg-muted text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Data e Hora Exata
                                </button>
                              </div>

                              {formHoldCustomMode === "duration" ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="1"
                                    max="10080"
                                    value={formHoldCustomValue}
                                    onChange={e => setFormHoldCustomValue(e.target.value)}
                                    className="h-8 w-24 text-xs font-bold"
                                  />
                                  <select
                                    value={formHoldCustomUnit}
                                    onChange={e => setFormHoldCustomUnit(e.target.value as "minutes" | "hours")}
                                    className="h-8 px-2.5 rounded-md border border-input bg-background text-xs font-bold"
                                  >
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                  </select>
                                </div>
                              ) : (
                                <Input
                                  type="datetime-local"
                                  value={formHoldCustomDateTime}
                                  onChange={e => setFormHoldCustomDateTime(e.target.value)}
                                  className="h-8 text-xs font-mono"
                                />
                              )}
                            </div>
                          )}

                          <div className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-950 dark:text-amber-200 space-y-2">
                            <div className="flex items-start gap-2">
                              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <div>
                                  <strong>Validade da Diária Extra:</strong> até <strong>{holdPreview.formattedDeadline}</strong> ({holdPreview.holdDurationLabel}).
                                </div>
                                <div className="text-[10.5px] text-amber-800 dark:text-amber-300/90">
                                  Se não pagar no prazo, apenas a(s) diária(s) extra(s) expira(m) automaticamente e o hóspede é avisado de que sua reserva original segue confirmada.
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-amber-300/60 dark:border-amber-800/60 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 text-[10.5px]">
                                <Bell className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                {holdPreview.reminderLeadMinutes <= 0 ? (
                                  <span className="text-amber-800 dark:text-amber-300">
                                    <strong>Lembrete intermediário:</strong> Não enviado em prazos de 10 min.
                                  </span>
                                ) : formSendExpirationReminder ? (
                                  <span className="text-amber-950 dark:text-amber-100">
                                    <strong>Lembrete no WhatsApp:</strong> faltando <strong>{holdPreview.reminderLeadLabel}</strong>{holdPreview.reminderFormattedTime ? ` (${holdPreview.reminderFormattedTime})` : ""} com PIX + Link.
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground line-through">
                                    Lembrete antes de expirar desativado
                                  </span>
                                )}
                              </div>

                              {holdPreview.reminderLeadMinutes > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setFormSendExpirationReminder(prev => !prev)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                                    formSendExpirationReminder
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                      : "bg-background text-muted-foreground border-border hover:text-foreground"
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${formSendExpirationReminder ? "bg-white" : "bg-slate-400"}`} />
                                  {formSendExpirationReminder ? "Lembrete Ativo" : "Lembrete Desativado"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Resumo Financeiro & Atalho para a Aba de Pagamentos */}
                <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-foreground">Resumo Financeiro da Hospedagem</span>
                      {(() => {
                        const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                        const isResPaid = formPaymentStatus === "pago_total" || formPaymentStatus === "pago";
                        const sumPay = formPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
                        const curPaid = isResPaid ? Math.max(curTot, sumPay || Number(formPaidAmount) || 0) : (sumPay > 0 ? sumPay : (Number(formPaidAmount) || 0));
                        const remaining = Math.max(0, curTot - curPaid);
                        if (isResPaid || (remaining === 0 && curTot > 0)) {
                          return <Badge className="bg-emerald-600 text-white font-bold text-[10px]">✓ Quitado</Badge>;
                        } else if (curPaid > 0) {
                          return <Badge className="bg-amber-600 text-white font-bold text-[10px]">⚡ Sinal Pago</Badge>;
                        }
                        return <Badge className="bg-rose-500 text-white font-bold text-[10px]">⏳ Pagamento Pendente</Badge>;
                      })()}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {(() => {
                        const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                        const isResPaid = formPaymentStatus === "pago_total" || formPaymentStatus === "pago";
                        const sumPay = formPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
                        const curPaid = isResPaid ? Math.max(curTot, sumPay || Number(formPaidAmount) || 0) : (sumPay > 0 ? sumPay : (Number(formPaidAmount) || 0));
                        return (
                          <>
                            <span>Total: <strong className="text-foreground font-bold">R$ {curTot.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                            <span>•</span>
                            <span>Pago: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">R$ {curPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                            <span>•</span>
                            <span>{formDailyRates.length} {formDailyRates.length === 1 ? "diária" : "diárias"} configuradas</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResModalTab("payments")}
                    className="h-8 px-3 text-xs font-bold border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <span>Gerenciar Pagamentos & Diárias</span>
                    <span className="font-bold">➔</span>
                  </Button>
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
                          {...bindZapiClickOrHoldWaWeb({
                            onClickZapi: async () => {
                              const resCode = selectedRes?.code || selectedRes?.reservationCode || selectedRes?.id || selectedRes?.breakfastToken || formGuestName || 'reserva'
                              const url = `${window.location.origin}/cafe/${encodeURIComponent(String(resCode))}`
                              const phone = (formGuestPhone || selectedRes?.guestPhone || "").replace(/\D/g, "")
                              const guestName = formGuestName || selectedRes?.guestName || "Hóspede"
                              const flatNum = formFlatId ? ((data.flats || []).find((f: any) => f.id === Number(formFlatId))?.number || formFlatId) : (selectedRes?.flatNumber || "seu flat")
                              const msg = `Olá ${guestName}! Aqui é da equipe da CorpFlats. Segue o seu link exclusivo para montar e agendar o seu café da manhã no Flat ${flatNum}: ${url}`
                              await sendDirectZapiWithFallback({
                                phone,
                                message: msg,
                                recipientName: guestName,
                                reservationCode: String(resCode),
                                flatNumber: String(flatNum),
                                triggerEvent: "breakfast_link_manual",
                                label: "Link do Café da Manhã",
                                toast
                              })
                            },
                            getWaUrl: () => {
                              const resCode = selectedRes?.code || selectedRes?.reservationCode || selectedRes?.id || selectedRes?.breakfastToken || formGuestName || 'reserva'
                              const url = `${window.location.origin}/cafe/${encodeURIComponent(String(resCode))}`
                              const phone = formGuestPhone || selectedRes?.guestPhone || ""
                              const guestName = formGuestName || selectedRes?.guestName || "Hóspede"
                              const flatNum = formFlatId ? ((data.flats || []).find((f: any) => f.id === Number(formFlatId))?.number || formFlatId) : (selectedRes?.flatNumber || "seu flat")
                              const msg = `Olá ${guestName}! Aqui é da equipe da CorpFlats. Segue o seu link exclusivo para montar e agendar o seu café da manhã no Flat ${flatNum}: ${url}`
                              return buildDirectWaWebUrl(phone, msg)
                            },
                            toast
                          })}
                          title="Clique rápido: enviar via Z-API • Segure por 2 segundos: abrir no WhatsApp Web"
                          className="w-full h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Enviar WhatsApp (Z-API)
                        </Button>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const resCode = selectedRes?.code || selectedRes?.reservationCode || selectedRes?.id || selectedRes?.breakfastToken || formGuestName || 'reserva'
                              const url = `${window.location.origin}/cafe/${encodeURIComponent(String(resCode))}`
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
                              const resCode = selectedRes?.code || selectedRes?.reservationCode || selectedRes?.id || selectedRes?.breakfastToken || formGuestName || 'reserva'
                              const url = `/cafe/${encodeURIComponent(String(resCode))}`
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

                {/* Seção Própria: Frigobar & Notas Fiscais da Reserva */}
                {selectedRes && (
                  <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Refrigerator className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                            Frigobar & Notas Fiscais da Reserva
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Extrato de consumo, pagamentos e Notas Fiscais anexadas
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const resCode = selectedRes?.code || selectedRes?.reservationCode || `RES-${selectedRes?.id}`
                            const url = `${window.location.origin}/minha-reserva/${encodeURIComponent(String(resCode))}/frigobar`
                            navigator.clipboard.writeText(url)
                            toast({ title: "Link copiado!", description: "Link do frigobar da reserva copiado para a área de transferência." })
                          }}
                          className="h-7 px-2.5 text-[11px] font-bold gap-1 bg-background hover:bg-muted border-border"
                        >
                          <Copy className="w-3 h-3" /> Link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const resCode = selectedRes?.code || selectedRes?.reservationCode || `RES-${selectedRes?.id}`
                            window.open(`/minha-reserva/${encodeURIComponent(String(resCode))}/frigobar`, "_blank")
                          }}
                          className="h-7 px-2.5 text-[11px] font-bold gap-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                        >
                          <span>Abrir Frigobar ↗</span>
                        </Button>
                      </div>
                    </div>

                    {/* Sub-bloco Segregado de Cortesias Consumidas (R$ 0,00) */}
                    {(() => {
                      const liveRes = (data?.reservations || []).find((r: any) => Number(r.id) === Number(selectedRes.id)) || selectedRes
                      const welcomeKit = (liveRes as any)?.welcomeKitConsumption
                      const courtesyWater = Number(welcomeKit?.waterCups ?? welcomeKit?.waterCupsConsumed) || 0
                      const courtesyPeanuts = Number(welcomeKit?.mendoratoPeanuts ?? welcomeKit?.peanutsConsumed) || 0
                      if (courtesyWater <= 0 && courtesyPeanuts <= 0) return null
                      return (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                              <Gift className="w-3.5 h-3.5" />
                              <span>Kit de Boas-Vindas Consumido (Cortesia)</span>
                            </span>
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                              R$ 0,00
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {[
                              courtesyWater > 0 ? `${courtesyWater}x Copo d'Água 200ml` : null,
                              courtesyPeanuts > 0 ? `${courtesyPeanuts}x Amendoim Mendorato 27g` : null
                            ].filter(Boolean).join(" • ")}
                          </p>
                        </div>
                      )
                    })()}

                    {(() => {
                      const liveRes = (data?.reservations || []).find((r: any) => Number(r.id) === Number(selectedRes.id))
                      const rawOrders = Array.isArray((liveRes as any)?.minibarOrders)
                        ? (liveRes as any).minibarOrders
                        : Array.isArray((selectedRes as any).minibarOrders)
                          ? (selectedRes as any).minibarOrders
                          : []
                      const visibleOrders = rawOrders.filter((o: any) => o && o.paymentStatus !== "cancelado")
                      if (visibleOrders.length === 0) return null
                      return (
                        <div className="pt-2 border-t border-cyan-500/20 space-y-1.5">
                          {visibleOrders.map((ord: any) => {
                              const invUrl = ord.invoice?.invoiceFileUrl || ord.invoice?.fileUrl || ord.invoiceFileUrl || ""
                              const invName = ord.invoice?.invoiceFileName || ord.invoiceFileName || "Nota_Fiscal_Frigobar.pdf"
                              const invNum = ord.invoice?.invoiceNumber || ord.invoiceNumber || ""
                              const isOrdPaid =
                                ord.paymentStatus === "pago" ||
                                ord.paymentStatus === "lancamento_quitado" ||
                                Boolean(invUrl)
                              return (
                                <div
                                  key={ord.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-background/90 border border-border text-xs"
                                >
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-900 dark:text-slate-100">
                                        {ord.guestName || selectedRes.guestName || "Hóspede"}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className={
                                          isOrdPaid
                                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]"
                                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]"
                                        }
                                      >
                                        {isOrdPaid ? "✓ Pago" : "Pendente"} • R${" "}
                                        {Number(ord.totalAmount || 0)
                                          .toFixed(2)
                                          .replace(".", ",")}
                                      </Badge>
                                      {invNum && (
                                        <Badge
                                          variant="outline"
                                          className="bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 text-[10px]"
                                        >
                                          NF #{invNum}
                                        </Badge>
                                      )}
                                    </div>
                                    {Array.isArray(ord.items) && ord.items.length > 0 && (
                                      <p className="text-[11px] text-muted-foreground">
                                        {ord.items
                                          .map((it: any) => `${it.quantity}x ${it.productName || it.name}`)
                                          .join(", ")}
                                      </p>
                                    )}
                                  </div>

                                  {invUrl ? (
                                    <a
                                      href={invUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={invName}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-[11px] shadow-2xs transition-all shrink-0"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>Baixar Nota Fiscal</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : isOrdPaid ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-muted-foreground border-border shrink-0"
                                    >
                                      NF em emissão
                                    </Badge>
                                  ) : null}
                                </div>
                              )
                            })}
                        </div>
                      )
                    })()}
                  </div>
                )}

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
                      <span>🛏️ {formTwinBeds ? "2 Camas Solteiro" : "1 Cama Casal"}</span>
                      {formTwinBeds ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="text-[10px] text-muted-foreground font-semibold">Padrão</span>}
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
                      Nota / Recado para a Camareira (Exibida no Card de Limpeza no Check-in)
                    </Label>
                    <Input 
                      value={formSpecialRequests}
                      onChange={e => setFormSpecialRequests(e.target.value)}
                      placeholder="Ex: Montar berço, kit bebê, toalhas extras, atenção especial ao ar-condicionado..."
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Bloqueio de Flat / Quarto Preferencial */}
                <div className="p-3 bg-slate-50/80 dark:bg-slate-900/50 border border-border/70 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                          Bloquear Flat (Quarto Preferencial / Não Trocar)
                        </span>
                        <span className="text-[11px] text-muted-foreground block leading-tight">
                          Impede a Sofia AI de trocar ou remanejar o quarto deste hóspede. Evita alocação de novos hóspedes neste flat.
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={formIsFlatLocked} 
                      onCheckedChange={setFormIsFlatLocked} 
                    />
                  </div>

                  {formIsFlatLocked && (
                    <div className="pt-2 border-t border-border/60 animate-in fade-in space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Motivo / Justificativa do Quarto Fixo (Opcional)
                      </Label>
                      <Input
                        value={formFlatLockReason}
                        onChange={e => setFormFlatLockReason(e.target.value)}
                        placeholder="Ex: Hóspede pediu cama casal + ar split; hóspede idoso pediu andar baixo..."
                        className="text-xs h-8"
                      />
                    </div>
                  )}
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

                {/* Bloco Fiscal: Tomador da NFS-e (Independente do Solicitante) + Auto-Emissão no Check-out */}
                <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2.5">
                  {formChannel !== "b2b" && formRequesterType !== "agency_b2b" && (
                    <div className="space-y-2 pb-2.5 border-b border-emerald-200/70 dark:border-emerald-800/50">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-black uppercase tracking-wide text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Para quem emitir a Nota Fiscal (Tomador NFS-e)?</span>
                        </span>
                        <Badge variant="outline" className="text-[9.5px] bg-background/80 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300">
                          Independente do Solicitante • Hóspede sempre sai na descrição
                        </Badge>
                      </div>

                      <div className={`grid gap-1.5 ${(formRequesterType === "other_person" || formInvoiceRecipientType === "requester") ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
                        <button
                          type="button"
                          onClick={() => setFormInvoiceRecipientType("guest")}
                          className={`py-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition-all text-left ${
                            formInvoiceRecipientType === "guest"
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-emerald-500/60"
                          }`}
                        >
                          👤 Hóspede Titular (PF)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormInvoiceRecipientType("company")}
                          className={`py-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition-all text-left ${
                            formInvoiceRecipientType === "company"
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                              : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-indigo-500/60"
                          }`}
                        >
                          🏢 Empresa (CNPJ / PJ)
                        </button>
                        {(formRequesterType === "other_person" || formInvoiceRecipientType === "requester") && (
                          <button
                            type="button"
                            onClick={() => setFormInvoiceRecipientType("requester")}
                            className={`py-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition-all text-left ${
                              formInvoiceRecipientType === "requester"
                                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                : "bg-background border-border text-slate-700 dark:text-slate-300 hover:border-amber-500/60"
                            }`}
                          >
                            👥 Solicitante / Terceiro (PF)
                          </button>
                        )}
                      </div>

                      {formInvoiceRecipientType === "company" && formRequesterType !== "company" && (
                        <div className="p-2.5 bg-background border border-indigo-300/60 dark:border-indigo-800/60 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-black text-indigo-700 dark:text-indigo-300">
                              Empresa Tomadora da Nota Fiscal (PJ)
                            </span>
                            <button
                              type="button"
                              onClick={handleOpenNewCompanyModal}
                              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Cadastrar Empresa
                            </button>
                          </div>
                          <MemoCompanySelect
                            value={formCompanyId}
                            onValueChange={stableSelectCompanySimple}
                            companies={companies}
                            placeholder="Selecione a Empresa para emissão da NFS-e..."
                            newLabel="➕ Cadastrar Nova Empresa..."
                          />
                        </div>
                      )}

                      {(formInvoiceRecipientType === "company" || formRequesterType === "company") && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/60">
                          <div>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100 block">Sigilo Tarifário p/ Hóspede</span>
                            <span className="text-[10px] text-muted-foreground block">Se ativo, oculta tarifa do hóspede e envia a NFS-e somente para a empresa</span>
                          </div>
                          <Switch checked={formNfHideFromGuest} onCheckedChange={setFormNfHideFromGuest} />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Auto-Emitir Nota Fiscal (NFS-e) no Check-out</span>
                        <span className="text-[11px] text-muted-foreground">Emite na SEFIN Nacional e envia o PDF oficial no WhatsApp no check-out (Padrão: OFF)</span>
                      </div>
                    </div>
                    <Switch checked={formAutoInvoice} onCheckedChange={setFormAutoInvoice} />
                  </div>
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

                {/* Banner de Check-out Antecipado & Ações Rápidas */}
                {selectedRes && (
                  selectedRes.earlyCheckout ? (
                    <div className="p-3.5 rounded-2xl border-2 border-amber-400/90 dark:border-amber-600/80 bg-amber-50/90 dark:bg-amber-950/40 space-y-2 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span className="text-xs font-black text-amber-950 dark:text-amber-100 uppercase tracking-wide">
                            ⚡ Check-out Antecipado Registrado
                          </span>
                        </div>
                        <Badge className="bg-amber-500 text-slate-950 font-black text-[10px]">
                          Datas Liberadas p/ Novas Reservas
                        </Badge>
                      </div>
                      <div className="text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5 leading-relaxed">
                        <p>
                          <strong>Informado por:</strong>{" "}
                          {selectedRes.earlyCheckoutReportedBy || selectedRes.checkoutReportedBy || "Portaria / Governança / Recepção"}
                        </p>
                        <p>
                          <strong>Saída realizada em:</strong>{" "}
                          {format(parseISO(selectedRes.earlyCheckoutDate || selectedRes.checkoutDate), "dd/MM/yyyy")}
                          {selectedRes.earlyCheckoutTime ? ` às ${selectedRes.earlyCheckoutTime}` : ""}
                          {selectedRes.originalCheckoutDate && (
                            <>
                              {" "}• <strong>Saída original prevista:</strong>{" "}
                              {format(parseISO(selectedRes.originalCheckoutDate), "dd/MM/yyyy")}
                            </>
                          )}
                        </p>
                        <p className="text-[10.5px] text-amber-800/90 dark:text-amber-300/90">
                          O valor integral contratado foi preservado, os pedidos futuros de café foram suspensos e os dias restantes ficaram abertos no calendário (com rastro tracejado).
                        </p>
                      </div>
                      <div className="pt-1 flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={clearingFalseEarlyCheckoutId === selectedRes.id || undoingEarlyCheckoutId === selectedRes.id}
                          onClick={() => handleClearFalseEarlyCheckout(selectedRes, { closeModal: false })}
                          title="Mantém o check-out realizado na data atual, mas remove o status de Check-out Antecipado (útil quando uma diária extra expirou ou foi excluída)"
                          className="h-7 text-xs font-bold gap-1.5 bg-white dark:bg-slate-900 border-emerald-400 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/40"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{clearingFalseEarlyCheckoutId === selectedRes.id ? "Ajustando..." : "Não foi antecipado (Check-out Normal)"}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={undoingEarlyCheckoutId === selectedRes.id || clearingFalseEarlyCheckoutId === selectedRes.id}
                          onClick={() => handleUndoEarlyCheckout(selectedRes, { closeModal: true })}
                          className="h-7 text-xs font-bold gap-1.5 bg-white dark:bg-slate-900 border-amber-400 text-amber-950 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                        >
                          <RotateCcw className={`w-3 h-3 ${undoingEarlyCheckoutId === selectedRes.id ? "animate-spin" : ""}`} />
                          <span>{undoingEarlyCheckoutId === selectedRes.id ? "Restaurando..." : "Desfazer Check-out Antecipado"}</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    selectedRes.checkinDate <= todayStr &&
                    selectedRes.checkoutDate > todayStr && (
                      <div className="p-3 rounded-2xl border border-amber-300/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                            <DoorOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Hóspede saiu antes da data prevista?</span>
                          </div>
                          <p className="text-[10.5px] text-muted-foreground">
                            Libera o calendário a partir de hoje mantendo a reserva visível em tracejado, preserva o valor pago e suspende os cafés futuros.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const resp = await fetch(`/api/pms/reservations/${selectedRes.id}/checkout`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ source: "reception_pms" }),
                                credentials: "include"
                              });
                              const json = await resp.json().catch(() => ({}));
                              if (!resp.ok) throw new Error(json.error || "Falha ao registrar check-out antecipado.");
                              toast({
                                title: "Check-out antecipado registrado! ⚡",
                                description: `Datas restantes do Flat ${selectedRes.flatNumber} liberadas no calendário e cafés futuros suspensos.`
                              });
                              await fetchData(false);
                              notifyCalendarUpdated();
                              setResModalOpen(false);
                            } catch (err: any) {
                              toast({
                                title: "Erro ao registrar check-out antecipado",
                                description: err.message || "Tente novamente.",
                                variant: "destructive"
                              });
                            }
                          }}
                          className="h-8 text-xs font-bold gap-1.5 shrink-0 border-amber-400 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                          <span>Registrar Check-out Antecipado Hoje</span>
                        </Button>
                      </div>
                    )
                  )
                )}

                {/* Observações Gerais da Reserva */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Observações Gerais da Reserva</Label>
                  <Textarea 
                    value={formNotes} 
                    onChange={e => setFormNotes(e.target.value)} 
                    placeholder="Ex: Cama de casal, chegada de madrugada, berço..." 
                    className="text-xs h-16 resize-none"
                  />
                </div>

                {selectedRes && (
                  <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-2 relative">
                    {/* Janelinha Flutuante de Prévia no Modal (Ao passar o cursor sobre qualquer atalho) */}
                    {hoveredModalQuickMsg && (() => {
                      const modalRecipients = getReservationRecipients(selectedRes);
                      const target = hoveredModalQuickMsg.recipientTarget || "guest";
                      const isTargetRequester = target === "requester";
                      return (
                        <div className="absolute left-2 right-2 bottom-[calc(100%+8px)] z-50 p-3 rounded-2xl bg-slate-950/98 dark:bg-black/98 text-white border border-slate-700 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 pointer-events-none text-left">
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-2">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                              <span className="text-sm">{hoveredModalQuickMsg.icon}</span>
                              <span className="truncate max-w-[200px]">{hoveredModalQuickMsg.title}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {target === "both" ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                                  ✨ Ambos
                                </span>
                              ) : target === "requester" ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                  👥 Solicitante
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                                  👤 Hóspede
                                </span>
                              )}
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                Manual
                              </span>
                            </div>
                          </div>
                          <div className="text-[11px] leading-relaxed text-slate-200 font-normal whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
                            {renderQuickMessage(
                              hoveredModalQuickMsg.message, 
                              selectedRes, 
                              typeof window !== "undefined" ? window.location.origin : undefined,
                              isTargetRequester ? "requester" : "guest"
                            )}
                          </div>
                          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9.5px] text-slate-400">
                            <span className="font-mono truncate max-w-[260px]">
                              {target === "requester" ? (
                                <>
                                  <strong className="text-amber-400">Destino: 👥 Solicitante</strong>
                                  <span className="text-slate-300 ml-1">({modalRecipients.requester.name})</span>
                                </>
                              ) : target === "both" ? (
                                <>
                                  <strong className="text-purple-400">Destino: ✨ Ambos</strong>
                                  <span className="text-slate-300 ml-1">({modalRecipients.guest.firstName} + {modalRecipients.requester.firstName})</span>
                                </>
                              ) : (
                                <>
                                  <strong className="text-sky-400">Destino: 👤 Hóspede</strong>
                                  <span className="text-slate-300 ml-1">({modalRecipients.guest.name})</span>
                                </>
                              )}
                            </span>
                            <span className="text-emerald-400 font-bold shrink-0">⚡ Clique: Z-API • Segure 2s: WhatsApp Web</span>
                          </div>
                          <div className="absolute top-full left-12 w-2.5 h-2.5 -mt-1 bg-slate-950 dark:bg-black border-r border-b border-slate-700 rotate-45" />
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Disparar WhatsApp (Clique: Z-API • Segure 2s: Web)
                      </span>
                      <div className="flex items-center gap-2">
                        {(formGuestPhone || selectedRes.guestPhone) && (
                          <a
                            href={`https://wa.me/${cleanWhatsAppPhone(formGuestPhone || selectedRes.guestPhone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400 font-mono hover:underline flex items-center gap-0.5"
                            title="Abrir WhatsApp Web manualmente para este número"
                          >
                            <span>Destino: {formGuestPhone || selectedRes.guestPhone}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
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
                        const target = qm.recipientTarget || "guest";
                        const buildEffectiveRes = () => {
                          const liveTot = calculateTotal() || Number(formTotalAmount) || Number(selectedRes?.totalAmount) || 0;
                          const livePaid = formPayments.length > 0
                            ? formPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
                            : (Number(formPaidAmount) || Number(selectedRes?.paidAmount) || 0);
                          return {
                            ...selectedRes,
                            flatId: formFlatId ? Number(formFlatId) : selectedRes?.flatId,
                            flatNumber: formFlatId ? ((data.flats || []).find((f: any) => f.id === Number(formFlatId))?.number || selectedRes?.flatNumber) : selectedRes?.flatNumber,
                            guestName: formGuestName.trim() || selectedRes?.guestName,
                            guestPhone: formGuestPhone.trim() || selectedRes?.guestPhone,
                            guestEmail: formGuestEmail.trim() || selectedRes?.guestEmail,
                            guests: (() => { const base = Array.isArray(selectedRes?.guests) ? [...selectedRes.guests] : []; const gList: any[] = [{ ...(base[0] || {}), index: 1, name: formGuestName.trim() || base[0]?.name || selectedRes?.guestName || 'Hóspede', phone: formGuestPhone.trim() || base[0]?.phone || selectedRes?.guestPhone || '', email: formGuestEmail.trim() || base[0]?.email || selectedRes?.guestEmail || '' }]; if ((Number(formGuestCount) || 1) >= 2 || formGuest2Name.trim() || formGuest2Phone.trim() || base[1]) { gList.push({ ...(base[1] || {}), index: 2, name: formGuest2Name.trim() || base[1]?.name || 'Hóspede 2', phone: formGuest2Phone.trim() || base[1]?.phone || base[1]?.whatsapp || '', email: formGuest2Email.trim() || base[1]?.email || '' }); } if ((Number(formGuestCount) || 1) >= 3 || formGuest3Name.trim() || formGuest3Phone.trim() || base[2]) { gList.push({ ...(base[2] || {}), index: 3, name: formGuest3Name.trim() || base[2]?.name || 'Hóspede 3', phone: formGuest3Phone.trim() || base[2]?.phone || base[2]?.whatsapp || '', email: formGuest3Email.trim() || base[2]?.email || '' }); } return gList; })(),
                            checkinDate: formCheckin || selectedRes?.checkinDate,
                            checkoutDate: formCheckout || selectedRes?.checkoutDate,
                            checkinTime: formCheckinTime || selectedRes?.checkinTime,
                            checkoutTime: formCheckoutTime || selectedRes?.checkoutTime,
                            includeBreakfast: formIncludeBreakfast,
                            hasBreakfast: formIncludeBreakfast,
                            totalAmount: liveTot > 0 ? liveTot : selectedRes?.totalAmount,
                            paidAmount: livePaid,
                            dailyRates: formDailyRates.length > 0 ? formDailyRates : selectedRes?.dailyRates,
                            charges: formCharges,
                            cleaningFee: formCharges
                              .filter(c => c.type === "cleaning")
                              .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
                          };
                        };
                        return (
                          <Button
                            key={qm.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSending}
                            onMouseEnter={() => setHoveredModalQuickMsg(qm)}
                            onMouseLeave={() => setHoveredModalQuickMsg(null)}
                            title={
                              target === "both" 
                                ? `${qm.title} (Envia para Hóspede e Solicitante • Clique: Z-API | Segure 2s: WhatsApp Web)` 
                                : target === "requester" 
                                  ? `${qm.title} (Envia para o Solicitante • Clique: Z-API | Segure 2s: WhatsApp Web)` 
                                  : `${qm.title} (Envia para o Hóspede • Clique: Z-API | Segure 2s: WhatsApp Web)`
                            }
                            {...bindZapiClickOrHoldWaWeb({
                              onClickZapi: () => {
                                setHoveredModalQuickMsg(null);
                                const effectiveRes = buildEffectiveRes();
                                setConfirmingModalQuickMsg({ qm, effectiveRes });
                              },
                              getWaUrl: () => {
                                setHoveredModalQuickMsg(null);
                                const effectiveRes = buildEffectiveRes();
                                return buildQuickMessageWaWebUrl(qm, effectiveRes);
                              },
                              toast
                            })}
                            className="h-7 text-[11px] bg-white dark:bg-neutral-800 border-emerald-300 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                          >
                            {isSending ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                            ) : (
                              <span>{qm.icon || "💬"}</span>
                            )}
                            <span>{qm.title}</span>
                            {target === "both" && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-300 dark:border-purple-800 leading-tight" title="Hóspede + Solicitante">
                                ✨ Ambos
                              </span>
                            )}
                            {target === "requester" && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800 leading-tight" title="Só Solicitante">
                                👥 Solicitante
                              </span>
                            )}
                          </Button>
                        );
                      })}
                    </div>

                    <QuickMessageConfirmDialog
                      open={Boolean(confirmingModalQuickMsg)}
                      onOpenChange={(open) => {
                        if (!open) setConfirmingModalQuickMsg(null);
                      }}
                      quickMessage={confirmingModalQuickMsg?.qm || null}
                      resItem={confirmingModalQuickMsg?.effectiveRes || selectedRes}
                      onConfirm={async (qm, options) => {
                        setModalSendingMsgId(qm.id);
                        try {
                          await dispatchQuickMessage(
                            qm,
                            confirmingModalQuickMsg?.effectiveRes || selectedRes,
                            undefined,
                            options
                          );
                        } finally {
                          setModalSendingMsgId(null);
                        }
                      }}
                    />
                  </div>
                )}

                {/* Veículo & Garagem (Disparo automático p/ garagem e portaria) */}
                <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Veículo & Garagem (Disparo Automático)</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300">
                      Notifica PFB Estacionamento
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Placa</Label>
                      <Input
                        value={formVehiclePlate}
                        onChange={e => setFormVehiclePlate(e.target.value.toUpperCase())}
                        placeholder="ABC-1234"
                        className="text-xs font-mono uppercase bg-white dark:bg-slate-900"
                        maxLength={8}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Marca</Label>
                      <Input
                        value={formVehicleBrand}
                        onChange={e => setFormVehicleBrand(e.target.value)}
                        placeholder="Ex: Toyota"
                        className="text-xs bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Modelo</Label>
                      <Input
                        value={formVehicleModel}
                        onChange={e => setFormVehicleModel(e.target.value)}
                        placeholder="Ex: Corolla"
                        className="text-xs bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Cor</Label>
                      <Input
                        value={formVehicleColor}
                        onChange={e => setFormVehicleColor(e.target.value)}
                        placeholder="Ex: Preto"
                        className="text-xs bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                    Ao cadastrar ou alterar a placa, o sistema envia e-mail com flat, dados da reserva e do veículo diretamente para a garagem (<span className="font-semibold">promenadesoho@pfbestacionamentos.com.br</span>).
                  </p>
                </div>
              </div>
              )}

              {/* ABA: Pagamento & Diárias */}
              {resModalTab === "payments" && (
                <div className="py-2 space-y-3.5">
                  {/* 1. Cockpit Financeiro: Barra de Indicadores Unificada */}
                  {(() => {
                    const curTot = Number(formTotalAmount) > 0 ? Number(formTotalAmount) : calculateTotal();
                    const isResPaid = formPaymentStatus === "pago_total" || formPaymentStatus === "pago";
                    const sumPay = formPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const curPaid = isResPaid ? Math.max(curTot, sumPay || Number(formPaidAmount) || 0) : (sumPay > 0 ? sumPay : (Number(formPaidAmount) || 0));
                    const remaining = isResPaid ? 0 : Math.max(0, curTot - curPaid);
                    const isPaid = isResPaid || (curTot > 0 && remaining === 0);

                    const subtotalNights = formDailyRates.reduce((s, d) => s + (Number(d.rate) || 0), 0);
                    const subtotalCharges = formCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);

                    return (
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
                        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Total da Estadia</span>
                            <span className="text-lg sm:text-xl font-black text-foreground">
                              R$ {curTot.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                              {formDailyRates.length} {formDailyRates.length === 1 ? "diária" : "diárias"}
                              {formCharges.length > 0 && ` + ${formCharges.length} item(ns)`}
                            </span>
                          </div>

                          <div className="h-8 w-[1px] bg-border hidden sm:block" />

                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Total Recebido</span>
                            <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">
                              R$ {curPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-emerald-600/80 block font-medium">
                              {formPayments.length} lançamento(s)
                            </span>
                          </div>

                          <div className="h-8 w-[1px] bg-border hidden sm:block" />

                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Saldo a Pagar</span>
                            <span className={`text-lg sm:text-xl font-black ${remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {remaining > 0 ? `R$ ${remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00"}
                            </span>
                            <span className="text-[10px] text-muted-foreground block font-medium">
                              {remaining > 0 ? "Pendente" : "✓ 100% Quitado"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {isPaid ? (
                            <Badge className="bg-emerald-600 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Pago Integralmente</span>
                            </Badge>
                          ) : curPaid > 0 ? (
                            <Badge className="bg-amber-600 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-xs">
                              <span>⚡ Sinal Pago</span>
                            </Badge>
                          ) : formIsFaturadoBoleto ? (
                            <Badge className="bg-amber-600 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-xs">
                              <span>🏦 A Faturar (Boleto a Prazo)</span>
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-xs">
                              <span>⏳ Pagamento Pendente</span>
                            </Badge>
                          )}

                          {remaining > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                const newPay: ReservationPaymentItem = {
                                  id: `pay_${Date.now()}`,
                                  amount: remaining,
                                  method: formPaymentMethod || "pix",
                                  category: "quitacao",
                                  date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                                  notes: "Quitação de saldo"
                                };
                                const updated = [...formPayments, newPay];
                                setFormPayments(updated);
                                setFormPaidAmount(String(curTot));
                                setFormPaymentStatus("pago_total");
                                setFormStatus("confirmada");
                                toast({ title: "Quitação Lançada", description: `Lançamento de R$ ${remaining.toFixed(2)} registrado.` });
                              }}
                              className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 shadow-xs cursor-pointer"
                            >
                              Quitar Saldo
                            </Button>
                          )}

                          {remaining > 0 && curPaid === 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const half = Math.round(curTot / 2);
                                const newPay: ReservationPaymentItem = {
                                  id: `pay_${Date.now()}`,
                                  amount: half,
                                  method: formPaymentMethod || "pix",
                                  category: "sinal",
                                  date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                                  notes: "Sinal 50%"
                                };
                                setFormPayments([newPay]);
                                setFormPaidAmount(String(half));
                                setFormPaymentStatus("sinal_pago");
                                setFormStatus("confirmada");
                                toast({ title: "Sinal de 50% Lançado", description: `Lançamento de R$ ${half.toFixed(2)} registrado.` });
                              }}
                              className="h-7 text-xs font-semibold text-amber-700 dark:text-amber-300 border-amber-300 px-2 cursor-pointer"
                            >
                              Sinal 50%
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 1.5 Faturamento a Prazo • Boleto Banco Inter + NFS-e Automática no Check-out */}
                  <div className={`p-3.5 rounded-2xl border transition-all space-y-3 text-xs ${
                    formIsFaturadoBoleto
                      ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-400/70 dark:border-amber-700/70 shadow-sm"
                      : "bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800"
                  }`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          formIsFaturadoBoleto
                            ? "bg-amber-500 text-white"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}>
                          🏦
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-foreground text-xs sm:text-sm">
                              Faturamento a Prazo • Boleto Banco Inter & NFS-e no Check-out
                            </span>
                            {formIsFaturadoBoleto && (
                              <Badge className="bg-amber-600 text-white text-[9px] px-1.5 py-0 font-bold">
                                ✓ Faturado Ativo ({formBoletoCustomDueDate ? `Venc: ${formBoletoCustomDueDate}` : `${formBoletoTermDays} dias`})
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground block">
                            Emite NFS-e (somente hospedagem) + Boleto(s) com QR Code PIX no check-out e envia por E-mail e WhatsApp para os destinatários marcados
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={formIsFaturadoBoleto ? "default" : "outline"}
                          onClick={() => {
                            const nextVal = !formIsFaturadoBoleto;
                            setFormIsFaturadoBoleto(nextVal);
                            if (nextVal) {
                              setFormPaymentMethod("boleto_faturado");
                              setFormAutoInvoice(true);
                              if (formStatus === "pre_reserva") setFormStatus("confirmada");
                              const realPays = formPayments.filter(p =>
                                p && (String(p.id || "").startsWith("pay_bol_") || !/^(pagamento integral|pagamento inicial|complemento de quita[cç][aã]o)$/i.test(String(p.notes || "").trim()))
                              );
                              if (realPays.length === 0) {
                                setFormPayments([]);
                                setFormPaidAmount("0");
                                setFormPaymentStatus("pendente");
                              } else if (realPays.length !== formPayments.length) {
                                const realSum = realPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                                setFormPayments(realPays);
                                setFormPaidAmount(String(realSum));
                                setFormPaymentStatus(realSum > 0 ? "sinal_pago" : "pendente");
                              }
                            }
                          }}
                          className={`h-8 px-3 text-xs font-bold rounded-xl cursor-pointer ${
                            formIsFaturadoBoleto
                              ? "bg-amber-600 hover:bg-amber-700 text-white"
                              : "border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                          }`}
                        >
                          {formIsFaturadoBoleto ? "✓ Reserva Faturada (Boleto a Prazo)" : "Ativar Boleto Faturado a Prazo"}
                        </Button>
                      </div>
                    </div>

                    {formIsFaturadoBoleto && (
                      <div className="space-y-3 pt-2 border-t border-amber-300/50 dark:border-amber-800/50">
                        {/* Linha 1: Composição (1 Boleto vs 2 Boletos), Pagador Principal e Prazo */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-foreground">
                              Composição do Boleto (Hospedagem vs Consumo)
                            </Label>
                            <select
                              value={formBoletoConsumptionMode}
                              onChange={e => setFormBoletoConsumptionMode(e.target.value as any)}
                              className="w-full h-8 rounded-xl border border-border bg-background px-2.5 text-xs font-bold"
                            >
                              <option value="single_boleto">1 Boleto Unificado (Hospedagem + Consumo)</option>
                              <option value="separate_boletos">2 Boletos Separados (1 Hospedagem + 1 Consumo)</option>
                            </select>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block">
                              📌 Na NFS-e entra sempre apenas Hospedagem (Consumo é emitido pela Anserve)
                            </span>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-foreground">
                              Pagador (Sacado) do Boleto Principal
                            </Label>
                            <select
                              value={formBoletoPayerType}
                              onChange={e => setFormBoletoPayerType(e.target.value as any)}
                              className="w-full h-8 rounded-xl border border-border bg-background px-2.5 text-xs font-bold"
                            >
                              <option value="company">🏢 Empresa Parceira (PJ)</option>
                              <option value="agency">🟣 Agência B2B (PJ)</option>
                              <option value="requester">👤 Solicitante da Reserva</option>
                              <option value="financial_responsible">💼 Responsável Financeiro</option>
                              <option value="guest">🛏️ Hóspede Titular (PF)</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-foreground">
                              Prazo (Dias após Check-out) ou Data Fixa
                            </Label>
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-1">
                                {[7, 15, 28, 30].map(d => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => {
                                      setFormBoletoTermDays(d);
                                      setRawBoletoInputs(prev => { const n = { ...prev }; delete n.boletoTermDays; return n });
                                      setFormBoletoCustomDueDate("");
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                                      !formBoletoCustomDueDate && Number(formBoletoTermDays) === d
                                        ? "bg-amber-600 text-white border-amber-600"
                                        : "bg-background text-muted-foreground border-border hover:border-amber-500"
                                    }`}
                                  >
                                    {d}d
                                  </button>
                                ))}
                              </div>
                              <Input
                                type="number"
                                min={1}
                                max={180}
                                value={rawBoletoInputs.boletoTermDays ?? formBoletoTermDays}
                                onChange={e => {
                                  const raw = e.target.value;
                                  setRawBoletoInputs(prev => ({ ...prev, boletoTermDays: raw }));
                                  setFormBoletoCustomDueDate("");
                                  if (raw.trim() === "") return;
                                  const parsed = Number(raw);
                                  if (!Number.isNaN(parsed) && parsed >= 1) {
                                    setFormBoletoTermDays(Math.min(180, Math.round(parsed)));
                                  }
                                }}
                                onBlur={() => {
                                  const raw = rawBoletoInputs.boletoTermDays;
                                  if (raw !== undefined) {
                                    const parsed = raw.trim() === "" ? 15 : Number(raw);
                                    const clamped = Number.isNaN(parsed) || parsed < 1 ? 15 : Math.min(180, Math.round(parsed));
                                    setFormBoletoTermDays(clamped);
                                    setRawBoletoInputs(prev => { const n = { ...prev }; delete n.boletoTermDays; return n });
                                  }
                                }}
                                className="h-8 w-14 text-xs font-mono text-center px-1 bg-background"
                                title="Prazo em dias após o check-out"
                              />
                              <Input
                                type="date"
                                value={formBoletoCustomDueDate}
                                onChange={e => setFormBoletoCustomDueDate(e.target.value)}
                                className="h-8 flex-1 text-[11px] px-2 bg-background"
                                title="Ou escolha uma data de vencimento fixa"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Linha 1.B: Regra quando forem 2 Boletos Separados */}
                        {formBoletoConsumptionMode === "separate_boletos" && (
                          <div className="p-2.5 rounded-xl bg-background/90 border border-amber-300/70 dark:border-amber-800 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="font-bold text-amber-800 dark:text-amber-300 text-[11px]">
                                🥤 Configuração do 2º Boleto (Consumo Frigobar / Extras)
                              </span>
                              <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formConsumptionSamePayerAndDue}
                                  onChange={e => setFormConsumptionSamePayerAndDue(e.target.checked)}
                                  className="rounded"
                                />
                                <span>Usar mesmo pagador e mesmo prazo do boleto de hospedagem</span>
                              </label>
                            </div>

                            {!formConsumptionSamePayerAndDue && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                <div className="space-y-1">
                                  <Label className="text-[10px] font-bold">Pagador do Boleto de Consumo</Label>
                                  <select
                                    value={formConsumptionPayerType}
                                    onChange={e => setFormConsumptionPayerType(e.target.value as any)}
                                    className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold"
                                  >
                                    <option value="guest">🛏️ Hóspede Titular (PF)</option>
                                    <option value="company">🏢 Empresa Parceira (PJ)</option>
                                    <option value="agency">🟣 Agência B2B (PJ)</option>
                                    <option value="requester">👤 Solicitante da Reserva</option>
                                    <option value="financial_responsible">💼 Responsável Financeiro</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] font-bold">Prazo Consumo (Dias após Check-out)</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={180}
                                    value={rawBoletoInputs.consumptionTermDays ?? formConsumptionTermDays}
                                    onChange={e => {
                                      const raw = e.target.value;
                                      setRawBoletoInputs(prev => ({ ...prev, consumptionTermDays: raw }));
                                      if (raw.trim() === "") return;
                                      const parsed = Number(raw);
                                      if (!Number.isNaN(parsed) && parsed >= 1) {
                                        setFormConsumptionTermDays(Math.min(180, Math.round(parsed)));
                                      }
                                    }}
                                    onBlur={() => {
                                      const raw = rawBoletoInputs.consumptionTermDays;
                                      if (raw !== undefined) {
                                        const parsed = raw.trim() === "" ? 15 : Number(raw);
                                        const clamped = Number.isNaN(parsed) || parsed < 1 ? 15 : Math.min(180, Math.round(parsed));
                                        setFormConsumptionTermDays(clamped);
                                        setRawBoletoInputs(prev => { const n = { ...prev }; delete n.consumptionTermDays; return n });
                                      }
                                    }}
                                    className="h-8 text-xs font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] font-bold">Ou Vencimento Fixo (Consumo)</Label>
                                  <Input
                                    type="date"
                                    value={formConsumptionCustomDueDate}
                                    onChange={e => setFormConsumptionCustomDueDate(e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Linha 2: Responsável Financeiro (Quando não for o hóspede nem o solicitante) */}
                        <div className="p-2.5 rounded-xl bg-background/90 border border-border space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-bold text-foreground text-[11px] flex items-center gap-1.5">
                              <span>💼 Responsável Financeiro (Setor Financeiro / Contas a Pagar)</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Opcional — Pré-preenchido do perfil do cliente/empresa no CRM
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <Input
                              value={formFinRespName}
                              onChange={e => setFormFinRespName(e.target.value)}
                              placeholder="Nome do Resp. Financeiro"
                              className="h-8 text-xs"
                            />
                            <Input
                              type="email"
                              value={formFinRespEmail}
                              onChange={e => setFormFinRespEmail(e.target.value)}
                              placeholder="E-mail para Notas e Boletos"
                              className="h-8 text-xs"
                            />
                            <Input
                              type="tel"
                              inputMode="tel"
                              value={formFinRespPhone}
                              onChange={e => setFormFinRespPhone(formatBrazilPhone(e.target.value))}
                              placeholder="WhatsApp (DDD + Número)"
                              className="h-8 text-xs"
                            />
                            <Input
                              value={formFinRespDoc}
                              onChange={e => setFormFinRespDoc(e.target.value)}
                              placeholder="CPF/CNPJ (Opcional)"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        </div>

                        {/* Linha 3: Matriz de Destinatários (Quem recebe Nota Fiscal + Boleto) & Encargos */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          <div className="sm:col-span-8 p-2.5 rounded-xl bg-background/90 border border-border space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="font-bold text-foreground text-[11px]">
                                📬 Para quem enviar a NFS-e + Boleto PDF + Linha Digitável/PIX?
                              </span>
                              <div className="flex items-center gap-3 text-[11px]">
                                <label className="flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={formRecSendEmail}
                                    onChange={e => setFormRecSendEmail(e.target.checked)}
                                    className="rounded"
                                  />
                                  <span>📧 E-mail (Anexos PDF)</span>
                                </label>
                                <label className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={formRecSendWhatsapp}
                                    onChange={e => setFormRecSendWhatsapp(e.target.checked)}
                                    className="rounded"
                                  />
                                  <span>📲 WhatsApp (Z-API)</span>
                                </label>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                              <label className={`p-2 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                                formRecGuest ? "bg-primary/10 border-primary font-bold text-foreground" : "bg-muted/20 border-border text-muted-foreground"
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={formRecGuest}
                                  onChange={e => setFormRecGuest(e.target.checked)}
                                  className="rounded"
                                />
                                <span>🛏️ Hóspede Final</span>
                              </label>

                              <label className={`p-2 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                                formRecRequester ? "bg-primary/10 border-primary font-bold text-foreground" : "bg-muted/20 border-border text-muted-foreground"
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={formRecRequester}
                                  onChange={e => setFormRecRequester(e.target.checked)}
                                  className="rounded"
                                />
                                <span>👤 Solicitante</span>
                              </label>

                              <label className={`p-2 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                                formRecCompany ? "bg-primary/10 border-primary font-bold text-foreground" : "bg-muted/20 border-border text-muted-foreground"
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={formRecCompany}
                                  onChange={e => setFormRecCompany(e.target.checked)}
                                  className="rounded"
                                />
                                <span>🏢 Empresa / Agência</span>
                              </label>

                              <label className={`p-2 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                                formRecFinResp ? "bg-primary/10 border-primary font-bold text-foreground" : "bg-muted/20 border-border text-muted-foreground"
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={formRecFinResp}
                                  onChange={e => setFormRecFinResp(e.target.checked)}
                                  className="rounded"
                                />
                                <span>💼 Resp. Financeiro</span>
                              </label>
                            </div>
                          </div>

                          <div className="sm:col-span-4 p-2.5 rounded-xl bg-background/90 border border-border space-y-2">
                            <span className="font-bold text-foreground text-[11px] block">
                              ⚙️ Multa, Juros & Automação
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Multa Atraso (%)</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={rawBoletoInputs.finePct ?? formBoletoFinePct}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    setRawBoletoInputs(prev => ({ ...prev, finePct: raw }));
                                    if (raw.trim() === "") {
                                      setFormBoletoFinePct(0);
                                      return;
                                    }
                                    const parsed = Number(raw);
                                    if (!Number.isNaN(parsed)) {
                                      setFormBoletoFinePct(Math.max(0, parsed));
                                    }
                                  }}
                                  onBlur={() => {
                                    const raw = rawBoletoInputs.finePct;
                                    if (raw !== undefined) {
                                      const parsed = raw.trim() === "" ? 0 : Number(raw);
                                      setFormBoletoFinePct(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
                                      setRawBoletoInputs(prev => { const n = { ...prev }; delete n.finePct; return n });
                                    }
                                  }}
                                  className="h-7 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Juros a.m. (%)</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={rawBoletoInputs.interestPct ?? formBoletoInterestPct}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    setRawBoletoInputs(prev => ({ ...prev, interestPct: raw }));
                                    if (raw.trim() === "") {
                                      setFormBoletoInterestPct(0);
                                      return;
                                    }
                                    const parsed = Number(raw);
                                    if (!Number.isNaN(parsed)) {
                                      setFormBoletoInterestPct(Math.max(0, parsed));
                                    }
                                  }}
                                  onBlur={() => {
                                    const raw = rawBoletoInputs.interestPct;
                                    if (raw !== undefined) {
                                      const parsed = raw.trim() === "" ? 0 : Number(raw);
                                      setFormBoletoInterestPct(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
                                      setRawBoletoInputs(prev => { const n = { ...prev }; delete n.interestPct; return n });
                                    }
                                  }}
                                  className="h-7 text-xs font-mono"
                                />
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 pt-0.5 text-[10.5px]">
                              <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                                <input
                                  type="checkbox"
                                  checked={formAutoEmitBoletoOnCheckout}
                                  onChange={e => setFormAutoEmitBoletoOnCheckout(e.target.checked)}
                                  className="rounded"
                                />
                                <span>Emitir e enviar automático no Check-out</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                                <input
                                  type="checkbox"
                                  checked={formAutoReminderEnabled}
                                  onChange={e => setFormAutoReminderEnabled(e.target.checked)}
                                  className="rounded"
                                />
                                <span>Lembrete no dia do vencimento e atraso</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Linha 4: Ação Manual para Emitir/Antecipar Boleto + NFS-e quando editando reserva */}
                        {selectedRes && (
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                            <div className="text-[11px] text-muted-foreground">
                              {Array.isArray(selectedRes.boletoIds) && selectedRes.boletoIds.length > 0 ? (
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                  ✓ {selectedRes.boletoIds.length} boleto(s) já vinculado(s) a esta reserva ({selectedRes.boletoIds.join(", ")})
                                </span>
                              ) : (
                                <span>Deseja antecipar o faturamento antes do check-out? Emita com 1 clique:</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {Array.isArray(selectedRes.boletoIds) && selectedRes.boletoIds.map((bId: string) => (
                                <Button
                                  key={bId}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(`/api/boletos/${bId}/pdf`, "_blank")}
                                  className="h-7 px-2.5 text-[11px] font-bold border-amber-500/50 text-amber-700 dark:text-amber-300"
                                >
                                  📄 PDF {bId}
                                </Button>
                              ))}
                              <Button
                                type="button"
                                size="sm"
                                disabled={emittingResBoleto}
                                onClick={async () => {
                                  setEmittingResBoleto(true);
                                  try {
                                    // Primeiro atualiza a reserva com as configurações atuais de faturamento
                                    await fetch(`/api/pms/reservations/${selectedRes.id}`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      credentials: "include",
                                      body: JSON.stringify({
                                        isFaturadoBoleto: true,
                                        paymentMethod: "boleto_faturado",
                                        boletoTermDays: Number(formBoletoTermDays) || 15,
                                        boletoCustomDueDate: formBoletoCustomDueDate || undefined,
                                        boletoConsumptionMode: formBoletoConsumptionMode,
                                        boletoPayerType: formBoletoPayerType,
                                        consumptionSamePayerAndDue: formConsumptionSamePayerAndDue,
                                        consumptionPayerType: formConsumptionSamePayerAndDue ? formBoletoPayerType : formConsumptionPayerType,
                                        consumptionTermDays: formConsumptionSamePayerAndDue ? (Number(formBoletoTermDays) || 15) : (Number(formConsumptionTermDays) || 15),
                                        consumptionCustomDueDate: formConsumptionSamePayerAndDue ? (formBoletoCustomDueDate || undefined) : (formConsumptionCustomDueDate || undefined),
                                        boletoFinePct: Number(formBoletoFinePct ?? 2),
                                        boletoInterestPct: Number(formBoletoInterestPct ?? 1),
                                        autoEmitBoletoOnCheckout: formAutoEmitBoletoOnCheckout,
                                        autoReminderEnabled: formAutoReminderEnabled,
                                        financialResponsible: {
                                          name: formFinRespName.trim(),
                                          email: formFinRespEmail.trim(),
                                          phone: formFinRespPhone.trim(),
                                          whatsapp: formFinRespPhone.trim(),
                                          document: formFinRespDoc.trim()
                                        },
                                        billingRecipients: {
                                          guest: formRecGuest,
                                          requester: formRecRequester,
                                          company: formRecCompany,
                                          financialResponsible: formRecFinResp,
                                          sendEmail: formRecSendEmail,
                                          sendWhatsapp: formRecSendWhatsapp
                                        }
                                      })
                                    });
                                    const res = await fetch("/api/boletos/emit", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      credentials: "include",
                                      body: JSON.stringify({
                                        reservationId: selectedRes.id,
                                        mode: formBoletoConsumptionMode,
                                        emitNfse: true,
                                        sendNotifications: true
                                      })
                                    });
                                    const json = await res.json();
                                    if (res.ok && json.success) {
                                      toast({
                                        title: "🏦 Boleto(s) Inter & NFS-e Emitidos!",
                                        description: `${(json.boletos || []).length} boleto(s) gerado(s) e enviados aos destinatários marcados.`
                                      });
                                      fetchData(false);
                                      if (json.boletos?.[0]?.id) {
                                        window.open(`/api/boletos/${json.boletos[0].id}/pdf`, "_blank");
                                      }
                                    } else {
                                      toast({
                                        title: "Erro ao emitir boleto",
                                        description: json.error || "Verifique os dados da reserva.",
                                        variant: "destructive"
                                      });
                                    }
                                  } catch (err: any) {
                                    toast({
                                      title: "Erro de conexão",
                                      description: err.message,
                                      variant: "destructive"
                                    });
                                  } finally {
                                    setEmittingResBoleto(false);
                                  }
                                }}
                                className="h-7 px-3 text-[11px] font-black bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer"
                              >
                                {emittingResBoleto ? "Emitindo..." : "⚡ Emitir / Antecipar NFS-e + Boleto Agora"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. Banner de Conciliação Bancária Oficial (se houver dados de PIX Inter ou Mercado Pago) */}
                  {selectedRes && (selectedRes.pixTxId || selectedRes.pixEndToEndId || selectedRes.mpPaymentId || selectedRes.paidAt) && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{selectedRes.mpPaymentId || String(selectedRes.paymentMethod || "").toLowerCase().includes("cartao") ? "💳" : "⚡"}</span>
                          <div>
                            <span className="font-bold text-emerald-800 dark:text-emerald-300">
                              {selectedRes.pixEndToEndId ? "PIX Confirmado pelo Banco Central (Inter)" : (selectedRes.mpPaymentId ? "Cartão Liquidado Mercado Pago" : (String(selectedRes.paymentMethod || "").toLowerCase().includes("cartao") ? "Cartão de Crédito Liquidado" : "Pagamento Liquidado via Gateway"))}
                            </span>
                            {selectedRes.paidAt && (
                              <span className="text-muted-foreground block text-[11px]">
                                Confirmado em {format(parseISO(selectedRes.paidAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const link = `https://corpflats.com.br/minha-reserva/${selectedRes.code || selectedRes.id}`;
                              navigator.clipboard.writeText(link);
                              toast({ title: "Link Copiado!", description: "Link do hóspede copiado para a área de transferência." });
                            }}
                            className="h-7 px-2 text-[11px] bg-white dark:bg-slate-900 border-slate-300 cursor-pointer"
                          >
                            <Copy className="w-3 h-3 mr-1" /> Copiar Link
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/pms/reservations/${selectedRes.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ paymentStatus: "pendente", paidAmount: 0, payments: [] })
                                });
                                if (res.ok) {
                                  setFormPaymentStatus("pendente");
                                  setFormPaidAmount("0");
                                  setFormPayments([]);
                                  fetchData();
                                  toast({ title: "Status Alterado", description: "Reserva marcada como pendente." });
                                }
                              } catch (e: any) {
                                toast({ title: "Erro", description: e.message, variant: "destructive" });
                              }
                            }}
                            className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950 cursor-pointer"
                          >
                            Desmarcar Pago
                          </Button>
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-emerald-200 dark:border-emerald-800/80 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] font-mono text-slate-600 dark:text-slate-300">
                        {selectedRes.pixTxId && !selectedRes.mpPaymentId && !String(selectedRes.paymentMethod || "").toLowerCase().includes("cartao") && <span>TxId: <strong className="text-foreground">{selectedRes.pixTxId}</strong></span>}
                        {selectedRes.pixEndToEndId && <span>E2E: <strong className="text-emerald-700 dark:text-emerald-300">{selectedRes.pixEndToEndId}</strong></span>}
                        {selectedRes.mpPaymentId && <span>MP ID: <strong className="text-foreground">{selectedRes.mpPaymentId}</strong></span>}
                      </div>
                    </div>
                  )}

                  {/* 3. Composição de Valores da Hospedagem (Diárias, Taxas, Adicionais e Rateio Rápido) */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-2xs">
                    {/* Barra de Rateio Rápido do Pacote Total */}
                    <div className="p-2.5 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                          <Wand2 className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground block">Definir Pacote Total & Ratear</span>
                          <span className="text-[10.5px] text-muted-foreground block">
                            Digite o valor total negociado para dividir automaticamente entre as diárias
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                        <div className="relative flex-1 sm:w-32">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">R$</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0,00"
                            value={formatCentsMaskValue(packageTotalInput)}
                            onFocus={keepCurrencyCursorAtEnd}
                            onClick={keepCurrencyCursorAtEnd}
                            onChange={e => {
                              const val = parseCentsMaskInput(e.target.value);
                              setPackageTotalInput(val > 0 ? String(val) : "");
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const val = Number(packageTotalInput);
                                if (val > 0) handleDistributeTotalToNights(val);
                              }
                            }}
                            className="h-7 pl-7 pr-2 text-xs font-bold text-right bg-background text-foreground"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const val = Number(packageTotalInput);
                            if (val > 0) handleDistributeTotalToNights(val);
                            else toast({ title: "Informe o valor", description: "Digite o valor total para ratear entre as diárias.", variant: "destructive" });
                          }}
                          className="h-7 px-2.5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Ratear Diárias</span>
                        </Button>
                      </div>
                    </div>

                    {/* Subseção A: Diárias da Hospedagem */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-xs font-bold text-foreground">Diárias da Hospedagem ({formDailyRates.length})</span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddExtraNight}
                            className="h-7 px-2 text-xs font-bold text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> Diária Extra
                          </Button>

                              {formDailyRates.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (formDailyRates.length > 0) {
                                  const firstRate = Number(formDailyRates[0].rate) || 250;
                                  const firstChan = formDailyRates[0].channel || formChannel;
                                  const nextRates = formDailyRates.map(d => ({ ...d, rate: firstRate, channel: firstChan }));
                                  setFormDailyRates(nextRates);
                                  syncCompositeTotalAndPaid(nextRates, formCharges, formChannel);
                                  toast({ title: "Diárias Equalizadas", description: `Todas as diárias ajustadas para R$ ${firstRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` });
                                }
                              }}
                              className="h-7 px-2 text-[10.5px] text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Igualar o valor de todas as diárias com a 1ª"
                            >
                              Igualar Valores
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {formDailyRates.map((d, idx) => {
                          let formattedDate = d.date;
                          try {
                            formattedDate = format(parseISO(d.date), "dd/MM/yyyy (EEE)", { locale: ptBR });
                          } catch {}

                          const handleDeleteNight = () => {
                            const updatedRates = formDailyRates.filter((_, i) => i !== idx);
                            if (updatedRates.length > 0) {
                              const firstDate = updatedRates[0].date;
                              const lastDate = updatedRates[updatedRates.length - 1].date;
                              const newCheckout = format(addDays(parseISO(lastDate), 1), "yyyy-MM-dd");
                              setFormDailyRates(updatedRates);
                              setFormCheckin(firstDate);
                              setFormCheckout(newCheckout);
                              syncCompositeTotalAndPaid(updatedRates, formCharges, formChannel);
                            }
                          };

                          return (
                            <div 
                              key={d.date || idx}
                              className="p-2.5 bg-background border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center justify-between sm:justify-start gap-1.5 shrink-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <span className="font-semibold text-foreground text-xs whitespace-nowrap">
                                    {formattedDate}
                                  </span>
                                </div>

                                {formDailyRates.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleDeleteNight}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600 shrink-0 cursor-pointer sm:hidden"
                                    title="Excluir diária"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>

                              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:justify-end">
                                <div className="flex-1 sm:flex-initial sm:w-44 min-w-0">
                                  <Select
                                    value={d.channel || formChannel || "whatsapp"}
                                    onValueChange={(val) => {
                                      setFormDailyRates(prev => {
                                        const nextRates = prev.map((item, i) => i === idx ? { ...item, channel: val } : item);
                                        syncCompositeTotalAndPaid(nextRates, formCharges, formChannel);
                                        return nextRates;
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 sm:h-7 text-xs font-medium w-full">
                                      <SelectValue placeholder="Canal" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="whatsapp">🟢 WhatsApp / Direta</SelectItem>
                                      <SelectItem value="booking">🔵 Booking.com</SelectItem>
                                      <SelectItem value="airbnb">🔴 Airbnb</SelectItem>
                                      <SelectItem value="b2b">🟣 B2B Reservas / Agência</SelectItem>
                                      <SelectItem value="site">🟠 Site Próprio</SelectItem>
                                      <SelectItem value="balcao">🏨 Balcão</SelectItem>
                                      <SelectItem value="empresa">🏢 Empresa (PJ)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="w-28 relative shrink-0">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">
                                    R$
                                  </span>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0,00"
                                    value={formatCentsMaskValue(d.rate)}
                                    onFocus={keepCurrencyCursorAtEnd}
                                    onClick={keepCurrencyCursorAtEnd}
                                    onChange={(e) => {
                                      const val = parseCentsMaskInput(e.target.value);
                                      setFormDailyRates(prev => {
                                        const nextRates = prev.map((item, i) => i === idx ? { ...item, rate: val } : item);
                                        syncCompositeTotalAndPaid(nextRates, formCharges, formChannel);
                                        return nextRates;
                                      });
                                    }}
                                    className="h-8 sm:h-7 pl-7 pr-2 text-xs font-bold text-right w-full"
                                  />
                                </div>

                                {formDailyRates.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleDeleteNight}
                                    className="hidden sm:inline-flex h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 shrink-0 cursor-pointer"
                                    title="Excluir diária"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Subseção B: Taxas, Adicionais & Descontos */}
                    <div className="space-y-2 pt-2 border-t border-border/70">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-xs font-bold text-foreground">Taxas, Serviços Adicionais & Descontos ({formCharges.length})</span>
                        </div>

                        {/* Botões de Atalho Rápido para Itens Comuns */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("cleaning", "Taxa de Limpeza", 50)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            🧹 + Limpeza
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("pet", "Taxa Pet", 50)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            🐾 + Pet
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("extra_bed", "Cama Extra", 70)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            🛏️ + Cama Extra
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("breakfast", "Café da Manhã Avulso", 35)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            ☕ + Café
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("garage", "Garagem Adicional", 30)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            🚗 + Garagem
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("discount", "Desconto Negociado", -50)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            🏷️ - Desconto
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCharge("other", "Adicional", 50)}
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
                          >
                            <Plus className="w-3 h-3 mr-0.5" /> Outro
                          </Button>
                        </div>
                      </div>

                      {formCharges.length === 0 ? (
                        <div className="p-2.5 rounded-xl border border-dashed text-center text-[11px] text-muted-foreground bg-background/50">
                          Nenhuma taxa ou adicional configurado. Clique nos botões acima caso queira incluir Taxa de Limpeza, Pet, Cama Extra, Desconto, etc.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {formCharges.map((charge, cIdx) => (
                            <div
                              key={charge.id || cIdx}
                              className="p-2.5 bg-background border border-border rounded-xl grid grid-cols-12 gap-2 items-center text-xs"
                            >
                              <div className="col-span-6 sm:col-span-4 sm:order-1 min-w-0">
                                <Select
                                  value={charge.type}
                                  onValueChange={(val: any) => handleUpdateCharge(charge.id, "type", val)}
                                >
                                  <SelectTrigger className="h-8 sm:h-7 text-xs font-medium w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cleaning">🧹 Limpeza</SelectItem>
                                    <SelectItem value="pet">🐾 Pet</SelectItem>
                                    <SelectItem value="extra_bed">🛏️ Cama Extra</SelectItem>
                                    <SelectItem value="breakfast">☕ Café Extra</SelectItem>
                                    <SelectItem value="garage">🚗 Garagem</SelectItem>
                                    <SelectItem value="damage">🛠️ Consumo / Dano</SelectItem>
                                    <SelectItem value="discount">🏷️ Desconto</SelectItem>
                                    <SelectItem value="other">📦 Outro</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="col-span-6 sm:col-span-4 sm:order-3 flex items-center gap-1.5 min-w-0">
                                <div className="relative flex-1 min-w-0">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">
                                    R$
                                  </span>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0,00"
                                    value={formatCentsMaskValue(charge.amount, true)}
                                    onFocus={keepCurrencyCursorAtEnd}
                                    onClick={keepCurrencyCursorAtEnd}
                                    onChange={e => {
                                      const rawVal = parseCentsMaskInput(e.target.value, true);
                                      const finalVal = charge.type === "discount" ? -Math.abs(rawVal) : rawVal;
                                      handleUpdateCharge(charge.id, "amount", finalVal);
                                    }}
                                    className={`h-8 sm:h-7 pl-7 pr-2 text-xs font-bold text-right w-full ${charge.amount < 0 ? "text-rose-600 dark:text-rose-400 font-black" : "text-foreground"}`}
                                  />
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveCharge(charge.id)}
                                  className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-muted-foreground hover:text-rose-600 shrink-0 cursor-pointer"
                                  title="Remover item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>

                              <div className="col-span-12 sm:col-span-4 sm:order-2 min-w-0">
                                <Input
                                  type="text"
                                  placeholder="Descrição do item..."
                                  value={charge.title}
                                  onChange={e => handleUpdateCharge(charge.id, "title", e.target.value)}
                                  className="h-8 sm:h-7 text-xs font-medium w-full"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Resumo da Composição */}
                    {(() => {
                      const subtotalNights = formDailyRates.reduce((s, d) => s + (Number(d.rate) || 0), 0);
                      const subtotalCharges = formCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
                      const totalCalculated = Math.max(0, subtotalNights + subtotalCharges);
                      return (
                        <div className="pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-muted-foreground px-1 border-t border-border/60">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>Diárias ({formDailyRates.length}): <strong className="text-foreground">R$ {subtotalNights.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                            {subtotalCharges !== 0 && (
                              <>
                                <span>•</span>
                                <span>Taxas & Adicionais: <strong className={subtotalCharges > 0 ? "text-foreground" : "text-rose-600"}>R$ {subtotalCharges.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                              </>
                            )}
                          </div>
                          <span className="font-bold text-foreground text-xs shrink-0">
                            Total Composto: <strong className="text-primary font-black">R$ {totalCalculated.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 4. Registros de Pagamento (Quem pagou, Como pagou, Quanto pagou e Para quê) */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold text-foreground">Pagamentos Recebidos ({formPayments.length})</span>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddPayment()}
                        className="h-7 px-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 border-emerald-400/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Novo Pagamento
                      </Button>
                    </div>

                    {formPayments.length === 0 ? (
                      <div className="p-3 rounded-xl border border-dashed text-center text-xs text-muted-foreground bg-background/50">
                        Nenhum pagamento registrado nesta reserva. Clique em "+ Novo Pagamento" ou utilize o botão "Quitar Saldo" no topo.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {formPayments.map((pay, pIdx) => (
                          <div
                            key={pay.id || pIdx}
                            className="p-2.5 bg-background border border-border rounded-xl grid grid-cols-12 gap-2 items-center text-xs"
                          >
                            {/* # + Forma de Pagamento */}
                            <div className="col-span-7 sm:col-span-5 sm:order-1 flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0">
                                #{pIdx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <Select
                                  value={pay.method || "pix"}
                                  onValueChange={(val) => handleUpdatePayment(pay.id, "method", val)}
                                >
                                  <SelectTrigger className="h-8 sm:h-7 text-xs font-medium w-full">
                                    <SelectValue placeholder="Forma" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pix">⚡ PIX</SelectItem>
                                    <SelectItem value="credit_card">💳 Cartão Crédito</SelectItem>
                                    <SelectItem value="debit_card">💳 Cartão Débito</SelectItem>
                                    <SelectItem value="vcn_b2b">🟣 Cartão Virtual B2B (VCN)</SelectItem>
                                    <SelectItem value="faturado_b2b">🟣 Faturado B2B / Agência</SelectItem>
                                    <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                                    <SelectItem value="booking">🌐 Booking.com</SelectItem>
                                    <SelectItem value="airbnb">🔴 Airbnb</SelectItem>
                                    <SelectItem value="ted">🏦 Transferência</SelectItem>
                                    <SelectItem value="faturado_pj">🏢 Faturado (PJ)</SelectItem>
                                    <SelectItem value="outro">💰 Outro</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Valor Pago */}
                            <div className="col-span-5 sm:col-span-3 sm:order-3 relative min-w-0">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 pointer-events-none">
                                R$
                              </span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                placeholder="0,00"
                                value={formatCentsMaskValue(pay.amount)}
                                onFocus={keepCurrencyCursorAtEnd}
                                onClick={keepCurrencyCursorAtEnd}
                                onChange={(e) => handleUpdatePayment(pay.id, "amount", parseCentsMaskInput(e.target.value))}
                                className="h-8 sm:h-7 pl-7 pr-2 text-xs font-bold text-right text-emerald-700 dark:text-emerald-400 w-full"
                              />
                            </div>

                            {/* Categoria / Destinação do Pagamento */}
                            <div className="col-span-6 sm:col-span-4 sm:order-2 min-w-0">
                              <Select
                                value={pay.category || "quitacao"}
                                onValueChange={(val) => handleUpdatePayment(pay.id, "category", val)}
                              >
                                <SelectTrigger className="h-8 sm:h-7 text-xs font-medium w-full">
                                  <SelectValue placeholder="Destinação" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="quitacao">✓ Quitação Total</SelectItem>
                                  <SelectItem value="sinal">⚡ Sinal 50%</SelectItem>
                                  <SelectItem value="diarias">📅 Diárias</SelectItem>
                                  <SelectItem value="taxa_limpeza">🧹 Taxa Limpeza</SelectItem>
                                  <SelectItem value="consumo">☕ Consumo / Extras</SelectItem>
                                  <SelectItem value="outro">🏷️ Outro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Data e Hora */}
                            <div className="col-span-6 sm:col-span-4 sm:order-4 min-w-0">
                              <Input
                                type="datetime-local"
                                value={pay.date ? (pay.date.includes("T") ? pay.date.substring(0, 16) : pay.date) : ""}
                                onChange={(e) => handleUpdatePayment(pay.id, "date", e.target.value)}
                                className="h-8 sm:h-7 text-[11px] px-2 w-full"
                              />
                            </div>

                            {/* Observação rápida + Excluir */}
                            <div className="col-span-12 sm:col-span-8 sm:order-5 flex items-center gap-1.5 min-w-0">
                              <Input
                                type="text"
                                placeholder="Obs opcional..."
                                value={pay.notes || ""}
                                onChange={(e) => handleUpdatePayment(pay.id, "notes", e.target.value)}
                                className="h-8 sm:h-7 text-xs flex-1 min-w-0"
                              />

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemovePayment(pay.id)}
                                className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-muted-foreground hover:text-rose-600 shrink-0 cursor-pointer"
                                title="Excluir pagamento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 justify-between">
                {selectedRes ? (
                  <Button type="button" variant="destructive" size="sm" onClick={handleDeleteRes} className="font-semibold text-xs gap-1">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancelar Reserva</span>
                  </Button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setResModalOpen(false)} className="font-semibold text-xs">
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={savingRes} className="font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px] shadow-sm">
                    {savingRes ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                    {selectedRes ? "Salvar Alterações" : "Criar Reserva"}
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
                        const isEarlyCheckoutLog = log.action === "early_checkout";
                        const isUndoEarlyCheckoutLog = log.action === "undo_early_checkout";
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
                        } else if (isEarlyCheckoutLog) {
                          badgeBg = "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-400 dark:border-amber-700";
                          actionLabel = "⚡ Check-out Antecipado";
                          dotColor = "bg-amber-500";
                          IconComp = Zap;
                        } else if (isUndoEarlyCheckoutLog) {
                          badgeBg = "bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700";
                          actionLabel = "↩️ Check-out Antecipado Desfeito";
                          dotColor = "bg-slate-500";
                          IconComp = RotateCcw;
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
                    onClick={() => setResModalTab("reservation")}
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

            {/* TAB: Comunicações & Mensagens (WhatsApp & E-mail) */}
            {selectedRes && resModalTab === "communications" && (() => {
              const pendingWa = (whatsappQueue || []).filter(q => q.status === "scheduled" || q.status === "pending");
              const sentWa = [
                ...(whatsappQueue || []).filter(q => q.status === "sent"),
                ...(whatsappHistory || [])
              ].sort((a, b) => new Date(b.sentAt || b.createdAt || 0).getTime() - new Date(a.sentAt || a.createdAt || 0).getTime());

              const pendingEm = (scheduledEmails || []).filter(q => q.status === "pending");

              return (
                <div className="space-y-4 pt-1">
                  {/* Sub-abas: WhatsApp vs E-mail */}
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setCommSubTab("whatsapp")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          commSubTab === "whatsapp"
                            ? "bg-white dark:bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>WhatsApp</span>
                        {pendingWa.length > 0 && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold">
                            {pendingWa.length}
                          </Badge>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommSubTab("email")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          commSubTab === "email"
                            ? "bg-white dark:bg-card text-amber-600 dark:text-amber-400 shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5 text-amber-500" />
                        <span>E-mail</span>
                        {pendingEm.length > 0 && (
                          <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold">
                            {pendingEm.length}
                          </Badge>
                        )}
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loadingComms}
                      onClick={() => fetchCommunications(selectedRes?.code || selectedRes?.id)}
                      className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingComms ? "animate-spin" : ""}`} />
                      <span>Atualizar</span>
                    </Button>
                  </div>

                  {/* CARD B2B: ENVIO PARA A AGÊNCIA COM MENSAGEM + LINK DE CREDENCIAMENTO DO HÓSPEDE */}
                  {selectedRes && (selectedRes.channel === "b2b" || formChannel === "b2b" || Boolean(selectedRes.b2bReservationNumber)) && (
                    <div className="p-3.5 rounded-2xl border-2 border-purple-300 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/25 space-y-2.5 mb-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-purple-900 dark:text-purple-200">
                              🟣 Envio para a Agência • Mensagem e Link para Preencher Dados do Hóspede
                            </span>
                            {selectedRes.b2bCredentialCompletedAt || (selectedRes.guestPhone && selectedRes.guestDocument) ? (
                              <Badge className="bg-emerald-600 text-white text-[9.5px] h-4 px-1.5 font-bold">
                                ✅ Dados do Hóspede Preenchidos
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500 text-white text-[9.5px] h-4 px-1.5 font-bold">
                                ⏳ Aguardando Agência Preencher Link
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80">
                            Agência: <strong>{selectedRes.agencyTradeName || selectedRes.agencyName || formAgencyName || "Agência B2B"}</strong>
                            {(selectedRes.agencyAgentEmail || formAgencyAgentEmail) ? ` • E-mail: ${selectedRes.agencyAgentEmail || formAgencyAgentEmail}` : ""}
                            {(selectedRes.agencyAgentPhone || formAgencyAgentPhone) ? ` • Tel: ${selectedRes.agencyAgentPhone || formAgencyAgentPhone}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            disabled={sendingB2bCredentialEmail}
                            onClick={handleSendB2bCredentialEmail}
                            className="h-7 px-2.5 text-[10.5px] font-bold bg-purple-600 hover:bg-purple-700 text-white gap-1"
                          >
                            <Mail className="w-3 h-3" />
                            {sendingB2bCredentialEmail ? "Enviando..." : "📧 Reenviar E-mail p/ Agência"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const code = selectedRes.code || selectedRes.b2bReservationNumber || selectedRes.id;
                              const url = `${window.location.origin}/credenciamento/${encodeURIComponent(String(code))}`;
                              const agName = selectedRes.requesterInfo?.name || selectedRes.requesterName || selectedRes.agencyTradeName || selectedRes.agencyName || formAgencyName || "Solicitante";
                              const b2bNum = selectedRes.b2bReservationNumber || formB2bReservationNumber || code;
                              const checkinBr = selectedRes.checkinDate ? String(selectedRes.checkinDate).substring(0, 10).split("-").reverse().join("/") : "";
                              const checkoutBr = selectedRes.checkoutDate ? String(selectedRes.checkoutDate).substring(0, 10).split("-").reverse().join("/") : "";
                              const guestsNum = resolveReservationGuestCount(selectedRes);
                              const channelLbl = formatReservationChannelLabel(selectedRes);
                              const msg = `Olá, *${agName}*! Tudo bem? 👋\n\nConfirmamos com muita satisfação a reserva *#${b2bNum}* para o(a) hóspede *${selectedRes.guestName}* no *Edifício Soho Residence Service* (*Flat ${selectedRes.flatNumber}*).\n\n📋 *Resumo da Reserva:*\n• Código: *#${b2bNum}*\n• Acomodação: *Flat ${selectedRes.flatNumber}*\n• Período: *${checkinBr} a ${checkoutBr}*\n• Total de Hóspedes: *${guestsNum}*\n• Canal da Reserva: *${channelLbl}*\n\n⚠️ *Importante — Dados do Hóspede para Liberação na Recepção:*\nComo ainda não temos o contato direto do hóspede na reserva, pedimos que preencha antecipadamente os dados dele(a) (*Nome Completo, CPF, WhatsApp e E-mail*) pelo nosso link seguro para gerarmos a liberação na recepção e enviarmos as instruções de acesso:\n\n👉 ${url}\n\nRessaltamos gentilmente que *não é possível informar esses dados apenas na hora no balcão*, pois sem o cadastro prévio pelo link a recepção não conseguirá localizar a reserva nem liberar a entrada.`;
                              const rawPhone = String(selectedRes.requesterInfo?.phone || selectedRes.requesterPhone || selectedRes.agencyAgentPhone || formAgencyAgentPhone || "");
                              const parts = rawPhone.split(/[\/;|,]+/).map(s => s.trim()).filter(Boolean);
                              const mobile = parts.find(p => p.replace(/\D/g, "").replace(/^55/, "").length === 11) || parts[0] || "";
                              const cleanDigits = mobile.replace(/\D/g, "");
                              const waPhone = cleanDigits ? (cleanDigits.startsWith("55") ? cleanDigits : `55${cleanDigits}`) : "";
                              const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                              window.open(waUrl, "_blank", "noopener,noreferrer");
                            }}
                            className="h-7 px-2.5 text-[10.5px] font-bold border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 gap-1"
                          >
                            <MessageCircle className="w-3 h-3" />
                            WhatsApp Agência
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const code = selectedRes.code || selectedRes.b2bReservationNumber || selectedRes.id;
                              const url = `${window.location.origin}/credenciamento/${encodeURIComponent(String(code))}`;
                              const agName = selectedRes.requesterInfo?.name || selectedRes.requesterName || selectedRes.agencyTradeName || selectedRes.agencyName || formAgencyName || "Solicitante";
                              const b2bNum = selectedRes.b2bReservationNumber || formB2bReservationNumber || code;
                              const checkinBr = selectedRes.checkinDate ? String(selectedRes.checkinDate).substring(0, 10).split("-").reverse().join("/") : "";
                              const checkoutBr = selectedRes.checkoutDate ? String(selectedRes.checkoutDate).substring(0, 10).split("-").reverse().join("/") : "";
                              const guestsNum = resolveReservationGuestCount(selectedRes);
                              const channelLbl = formatReservationChannelLabel(selectedRes);
                              const msg = `Olá, *${agName}*! Tudo bem? 👋\n\nConfirmamos com muita satisfação a reserva *#${b2bNum}* para o(a) hóspede *${selectedRes.guestName}* no *Edifício Soho Residence Service* (*Flat ${selectedRes.flatNumber}*).\n\n📋 *Resumo da Reserva:*\n• Código: *#${b2bNum}*\n• Acomodação: *Flat ${selectedRes.flatNumber}*\n• Período: *${checkinBr} a ${checkoutBr}*\n• Total de Hóspedes: *${guestsNum}*\n• Canal da Reserva: *${channelLbl}*\n\n⚠️ *Importante — Dados do Hóspede para Liberação na Recepção:*\nComo ainda não temos o contato direto do hóspede na reserva, pedimos que preencha antecipadamente os dados dele(a) (*Nome Completo, CPF, WhatsApp e E-mail*) pelo nosso link seguro para gerarmos a liberação na recepção e enviarmos as instruções de acesso:\n\n👉 ${url}\n\nRessaltamos gentilmente que *não é possível informar esses dados apenas na hora no balcão*, pois sem o cadastro prévio pelo link a recepção não conseguirá localizar a reserva nem liberar a entrada.`;
                              navigator.clipboard.writeText(msg);
                              toast({ title: "Mensagem + Link Copiados!", description: url });
                            }}
                            className="h-7 px-2.5 text-[10.5px] font-bold border-purple-300 text-purple-800 dark:text-purple-200 gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copiar Msg + Link
                          </Button>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-background/90 border border-purple-200 dark:border-purple-800/60 text-[11px] text-muted-foreground space-y-1.5">
                        <div className="font-semibold text-foreground flex items-center justify-between gap-2 flex-wrap">
                          <span>Mensagem & Link enviados para a Agência ({selectedRes.b2bCredentialEmailRecipient || selectedRes.agencyAgentEmail || "E-mail da Agência"}):</span>
                          <a
                            href={`/credenciamento/${encodeURIComponent(String(selectedRes.code || selectedRes.id))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-700 dark:text-purple-300 underline font-mono text-[10.5px]"
                          >
                            Abrir Link de Credenciamento ↗
                          </a>
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed font-sans text-[11px] text-foreground/90 bg-muted/30 p-2 rounded-lg border">
{`Olá, ${selectedRes.requesterInfo?.name || selectedRes.requesterName || selectedRes.agencyTradeName || selectedRes.agencyName || "Solicitante"}! Tudo bem? 👋
Confirmamos com muita satisfação a reserva #${selectedRes.b2bReservationNumber || selectedRes.code} para o(a) hóspede ${selectedRes.guestName} no Edifício Soho Residence Service (Flat ${selectedRes.flatNumber}).

📋 Resumo da Reserva:
• Código: #${selectedRes.b2bReservationNumber || selectedRes.code}
• Acomodação: Flat ${selectedRes.flatNumber}
• Período: ${selectedRes.checkinDate ? String(selectedRes.checkinDate).substring(0, 10).split("-").reverse().join("/") : ""} a ${selectedRes.checkoutDate ? String(selectedRes.checkoutDate).substring(0, 10).split("-").reverse().join("/") : ""}
• Total de Hóspedes: ${resolveReservationGuestCount(selectedRes)}
• Canal da Reserva: ${formatReservationChannelLabel(selectedRes)}

⚠️ IMPORTANTE — LIBERAÇÃO ANTECIPADA NA RECEPÇÃO:
Como ainda não temos o contato direto do hóspede na reserva, pedimos que preencha antecipadamente os dados dele(a) (Nome Completo, CPF, WhatsApp e E-mail) pelo nosso link seguro para gerarmos a liberação na recepção e enviarmos as instruções de acesso:
👉 ${window.location.origin}/credenciamento/${encodeURIComponent(String(selectedRes.code || selectedRes.id))}

Ressaltamos gentilmente que esses dados não podem ser informados apenas na hora no balcão, pois sem o credenciamento prévio pelo link a recepção não conseguirá localizar a reserva nem autorizar a entrada.`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-ABA: WHATSAPP */}
                  {commSubTab === "whatsapp" && (
                    <div className="space-y-4">
                      {/* 1. Mensagens Agendadas de WhatsApp */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-emerald-600" />
                            <span>Mensagens Programadas ({pendingWa.length})</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground">Disparo automático via Z-API</span>
                        </div>

                        {pendingWa.length === 0 ? (
                          <div className="p-4 rounded-xl bg-muted/20 border border-dashed text-center text-xs text-muted-foreground space-y-1">
                            <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-500/70 mb-1" />
                            <p className="font-semibold text-foreground">
                              {selectedRes?.status === "pre_reserva"
                                ? "Aguardando confirmação da Pré-Reserva para agendar a régua de estadia"
                                : "Nenhuma mensagem pendente de WhatsApp"}
                            </p>
                            <p className="text-[11px]">
                              {selectedRes?.status === "pre_reserva"
                                ? "As mensagens programadas da estadia (Pré-Check-in, Instruções de Chegada, Check-out e Avaliação) serão agendadas automaticamente assim que o pagamento for confirmado."
                                : "Todas as mensagens programadas para esta reserva já foram enviadas ou a régua foi finalizada."}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                            {pendingWa.map((q: any) => (
                              <div
                                key={q.id}
                                className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-foreground text-xs">
                                        {q.title || q.triggerEvent || "Mensagem Programada"}
                                      </span>
                                      <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 h-4 font-bold text-emerald-700 dark:text-emerald-300 border-emerald-300 gap-1 bg-emerald-100/50 dark:bg-emerald-900/30">
                                        <Clock className="w-2.5 h-2.5" />
                                        Agendado: {q.scheduledFor ? format(parseISO(q.scheduledFor), "dd/MM 'às' HH:mm", { locale: ptBR }) : "Em breve"}
                                      </Badge>
                                      {q.documentName && (
                                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium gap-1">
                                          📎 {q.documentName}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                                      Para: <strong className="text-foreground">{q.recipientName || q.guestName || "Hóspede"}</strong> ({q.guestPhone})
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={dispatchingActionId === q.id}
                                      {...bindZapiClickOrHoldWaWeb({
                                        onClickZapi: () => handleSendWhatsAppNow(q.id),
                                        getWaUrl: () => buildDirectWaWebUrl(q.guestPhone || selectedRes?.guestPhone, q.renderedMessage || q.message || ""),
                                        toast
                                      })}
                                      title="Clique rápido: enviar via Z-API • Segure por 2 segundos: abrir no WhatsApp Web"
                                      className="h-7 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs"
                                    >
                                      {dispatchingActionId === q.id ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Zap className="w-3 h-3" />
                                      )}
                                      <span>Enviar Agora</span>
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleCancelWhatsApp(q.id)}
                                      className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                                      title="Cancelar agendamento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="p-2 rounded-lg bg-background/80 border text-[11px] text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed font-sans">
                                  {q.renderedMessage || q.message}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 2. Histórico de Mensagens Enviadas de WhatsApp */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Histórico de Mensagens Enviadas ({sentWa.length})</span>
                          </span>
                        </div>

                        {sentWa.length === 0 ? (
                          <div className="p-4 rounded-xl bg-muted/15 border border-dashed text-center text-xs text-muted-foreground">
                            Nenhuma mensagem de WhatsApp enviada ainda para esta reserva.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                            {sentWa.map((h: any, idx: number) => {
                              const isFailed = h.status === "failed";
                              return (
                                <div
                                  key={h.id || `hist_${idx}`}
                                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                                    isFailed 
                                      ? "bg-rose-50/40 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40"
                                      : "bg-card border-border hover:border-border/80"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-foreground">
                                        {h.title || h.triggerEvent || "WhatsApp Entregue"}
                                      </span>
                                      {isFailed ? (
                                        <Badge variant="destructive" className="text-[9.5px] px-1.5 py-0 h-4 font-bold gap-1">
                                          <AlertCircle className="w-2.5 h-2.5" /> Falha
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9.5px] px-1.5 py-0 h-4 font-bold gap-1">
                                          <CheckCircle2 className="w-2.5 h-2.5" /> Enviado
                                        </Badge>
                                      )}
                                      {h.documentName && (
                                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium gap-1">
                                          📎 {h.documentName}
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                      {h.sentAt ? format(parseISO(h.sentAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ""}
                                    </span>
                                  </div>

                                  <div className="text-[10.5px] text-muted-foreground">
                                    Destinatário: <strong className="text-foreground">{h.guestPhone || selectedRes?.guestPhone}</strong>
                                    {h.method && ` • Método: ${h.method}`}
                                  </div>

                                  {isFailed && h.error && (
                                    <p className="text-[10.5px] text-rose-600 font-medium">
                                      Erro: {h.error}
                                    </p>
                                  )}

                                  <div className="p-2 rounded-lg bg-muted/30 border text-[11px] text-muted-foreground whitespace-pre-wrap max-h-20 overflow-y-auto font-sans">
                                    {h.message || h.renderedMessage}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SUB-ABA: E-MAIL */}
                  {commSubTab === "email" && (
                    <div className="space-y-4">
                      {/* 1. E-mails Agendados (Programados) */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span>E-mails Programados ({pendingEm.length})</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground">Disparo automático via SMTP</span>
                        </div>

                        {pendingEm.length === 0 ? (
                          <div className="p-4 rounded-xl bg-muted/20 border border-dashed text-center text-xs text-muted-foreground space-y-1">
                            <CheckCircle2 className="w-5 h-5 mx-auto text-amber-500/70 mb-1" />
                            <p className="font-semibold text-foreground">Nenhum e-mail agendado pendente</p>
                            <p className="text-[11px]">As mensagens de boas-vindas e check-out já foram enviadas ou não há agendamentos futuros.</p>
                          </div>
                        ) : (
                          <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                            {pendingEm.map((q: any) => (
                              <div
                                key={q.id}
                                className="p-3 rounded-xl border border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/20 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-foreground text-xs">
                                        {q.subject}
                                      </span>
                                      <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 h-4 font-bold text-amber-700 dark:text-amber-300 border-amber-300 gap-1 bg-amber-100/50 dark:bg-amber-900/30">
                                        <Clock className="w-2.5 h-2.5" />
                                        Agendado: {q.scheduledFor ? format(parseISO(q.scheduledFor), "dd/MM 'às' HH:mm", { locale: ptBR }) : "Em breve"}
                                      </Badge>
                                    </div>
                                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                                      Para: <strong className="text-foreground">{q.recipient}</strong>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={dispatchingActionId === q.id}
                                      onClick={() => handleSendEmailNow(q.id)}
                                      className="h-7 text-xs font-bold gap-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-xs"
                                    >
                                      {dispatchingActionId === q.id ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Zap className="w-3 h-3" />
                                      )}
                                      <span>Enviar Agora</span>
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleCancelEmail(q.id)}
                                      className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                                      title="Cancelar agendamento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="p-2 rounded-lg bg-background/80 border text-[11px] text-muted-foreground whitespace-pre-wrap max-h-20 overflow-y-auto leading-relaxed">
                                  {q.bodyText || q.subject}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 2. Painel de Envio Manual Rápido */}
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
                                {(selectedRes?.agencyAgentEmail || formAgencyAgentEmail) && (
                                  <button
                                    type="button"
                                    onClick={() => setManualRecipient(selectedRes?.agencyAgentEmail || formAgencyAgentEmail)}
                                    className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 hover:bg-purple-200 font-bold transition-colors"
                                  >
                                    🟣 Agência B2B ({selectedRes?.agencyAgentEmail || formAgencyAgentEmail})
                                  </button>
                                )}
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

                      {/* 3. Linha do Tempo (Histórico de E-mails Enviados) */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Mail className="w-4 h-4 text-primary" />
                            <span>Histórico de E-mails Enviados ({communications.length})</span>
                          </span>
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
                    </div>
                  )}

                  <DialogFooter className="pt-2 border-t border-border flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => setResModalOpen(false)} className="rounded-xl text-xs font-bold">
                      Fechar
                    </Button>
                  </DialogFooter>
                </div>
              );
            })()}

            {selectedRes && resModalTab === "links" && (() => {
              const origin = typeof window !== "undefined" ? window.location.origin : "https://corpflats.com.br"
              const resCode = selectedRes.code || selectedRes.id
              const guestName = selectedRes.guestName || "Hóspede"
              const flatNum = selectedRes.flatNumber || ""
              const guestPhone = (selectedRes.guestPhone || "").replace(/\D/g, "")
              const waPhone = cleanWhatsAppPhone(selectedRes.guestPhone || "")

              const checkinUrl = getCheckinUrl(selectedRes, 1, origin, settings)

              const linksList = [
                {
                  id: "portal",
                  title: "Minha Reserva (Portal do Hóspede)",
                  url: `${origin}/minha-reserva/${resCode}`,
                  desc: "Acesso completo à reserva: instruções de recepção 24h (cartão NFC), Wi-Fi, regras, pedidos de café e serviços.",
                  icon: User,
                  badge: "Completo",
                  badgeColor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300",
                  iconColor: "text-sky-600 bg-sky-100 dark:bg-sky-950/60 dark:text-sky-400",
                },
                {
                  id: "precheckin",
                  title: "Pré Check-in Digital",
                  url: checkinUrl,
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
                  url: `https://share.google/LHu3541d5lhkdvbL2`,
                  desc: "Ponto exato e rotas de GPS até a portaria do condomínio.",
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
                const guestsNum = resolveReservationGuestCount(selectedRes)
                const channelLbl = formatReservationChannelLabel(selectedRes)
                const checkinBr = selectedRes.checkinDate ? String(selectedRes.checkinDate).substring(0, 10).split("-").reverse().join("/") : ""
                const checkoutBr = selectedRes.checkoutDate ? String(selectedRes.checkoutDate).substring(0, 10).split("-").reverse().join("/") : ""
                const periodLine = checkinBr && checkoutBr ? `📅 *Período:* ${checkinBr} a ${checkoutBr}\n` : ""
                const text = `🏨 *CorpFlats - Resumo & Links da sua Estadia*\n🔑 *Reserva:* #${resCode}${flatNum ? ` (Flat ${flatNum})` : ""}\n👤 *Hóspede:* ${guestName}\n${periodLine}👥 *Total de Hóspedes:* ${guestsNum}\n📌 *Canal da Reserva:* ${channelLbl}\n\n` +
                  `🌐 *Portal Minha Reserva:*\n${origin}/minha-reserva/${resCode}\n\n` +
                  `📝 *Pré Check-in Digital:*\n${checkinUrl}\n\n` +
                  `☕ *Cardápio de Café da Manhã:*\n${origin}/cafe/${resCode}\n\n` +
                  `🚪 *Check-out Expresso:*\n${origin}/checkout/${resCode}\n\n` +
                  `📍 *Localização no Google Maps:*\nhttps://share.google/LHu3541d5lhkdvbL2`

                navigator.clipboard.writeText(text)
                setCopiedLinkKey("all")
                toast({
                  title: "Todos os links copiados! 📋",
                  description: "Mensagem formatada com todos os links pronta para enviar pelo WhatsApp ou E-mail."
                })
                setTimeout(() => setCopiedLinkKey(null), 2500)
              }

              const handleSendWa = async (url: string, title: string) => {
                if (!waPhone) return
                const msg = `Olá ${guestName}, aqui está o link de ${title} para sua estadia no Flat ${flatNum} (Reserva #${resCode}):\n\n${url}`
                await sendDirectZapiWithFallback({
                  phone: waPhone,
                  message: msg,
                  recipientName: guestName,
                  reservationCode: String(resCode),
                  flatNumber: String(flatNum),
                  triggerEvent: "stay_link_manual",
                  label: `Link de ${title}`,
                  toast
                })
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
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.iconColor}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-foreground">{item.title}</span>
                                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 font-bold ${item.badgeColor}`}>
                                    {item.badge}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 sm:line-clamp-1 mt-0.5">
                                  {item.desc}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-1.5 shrink-0">
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
                                  {...bindZapiClickOrHoldWaWeb({
                                    onClickZapi: () => handleSendWa(item.url, item.title),
                                    getWaUrl: () => {
                                      const msg = `Olá ${guestName}, aqui está o link de ${item.title} para sua estadia no Flat ${flatNum} (Reserva #${resCode}):\n\n${item.url}`
                                      return buildDirectWaWebUrl(waPhone, msg)
                                    },
                                    toast
                                  })}
                                  className="h-7 w-7 p-0 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600"
                                  title="Clique: enviar pelo WhatsApp (Z-API) • Segure 2s: abrir no WhatsApp Web"
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
                      onClick={() => setResModalTab("reservation")}
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
                </>
              )}
            />
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



        
        {/* ── MODAL: DETALHES, EDIÇÃO E REMOÇÃO DE BLOQUEIO DE QUARTO ── */}
        <Dialog open={blockDetailsModalOpen} onOpenChange={setBlockDetailsModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-black">
                {selectedBlockForDetails?.isServiceBlock || selectedBlockForDetails?.reason === "service_order" ? (
                  <>
                    <Wrench className="w-5 h-5 text-amber-500 animate-pulse" />
                    <span>Ordem de Serviço - Apt {selectedBlockForDetails?.flatNumber}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5 text-amber-500" />
                    <span>Bloqueio de Quarto - Apt {selectedBlockForDetails?.flatNumber}</span>
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedBlockForDetails?.isServiceBlock || selectedBlockForDetails?.reason === "service_order"
                  ? "Informações do serviço externo em andamento bloqueando o quarto."
                  : "Edite o período, motivo ou remova o bloqueio do apartamento. Você também pode puxar as bordas do bloqueio diretamente no mapa."}
              </DialogDescription>
            </DialogHeader>

            {selectedBlockForDetails && (
              <div className="space-y-4 py-2 text-xs">
                <div className="p-3.5 bg-muted/40 border border-border rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">Apartamento:</span>
                    <span className="font-black text-foreground text-sm">Apt {selectedBlockForDetails.flatNumber}</span>
                  </div>

                  {(selectedBlockForDetails.serviceTitle || selectedBlockForDetails.isServiceBlock) && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold">Serviço:</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {selectedBlockForDetails.serviceTitle || selectedBlockForDetails.title || "Serviço Externo"}
                      </span>
                    </div>
                  )}
                  {selectedBlockForDetails.workerName && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold">Prestador:</span>
                      <span className="font-bold text-foreground">
                        {selectedBlockForDetails.workerName}
                      </span>
                    </div>
                  )}
                  {(selectedBlockForDetails.isServiceBlock || selectedBlockForDetails.reason === "service_order") && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold">Status da Execução:</span>
                      <span className="font-black text-amber-600 dark:text-amber-400">
                        ⏳ Em andamento (não finalizado)
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-muted-foreground">Início do Bloqueio</Label>
                      <Input
                        type="date"
                        value={editBlockStart}
                        onChange={(e) => setEditBlockStart(e.target.value)}
                        className="h-8 text-xs rounded-xl bg-card"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-muted-foreground">Fim do Bloqueio</Label>
                      <Input
                        type="date"
                        value={editBlockEnd}
                        onChange={(e) => setEditBlockEnd(e.target.value)}
                        className="h-8 text-xs rounded-xl bg-card"
                      />
                    </div>
                  </div>

                  {!(selectedBlockForDetails.isServiceBlock || selectedBlockForDetails.reason === "service_order") && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-muted-foreground">Motivo</Label>
                        <Select value={editBlockReason} onValueChange={setEditBlockReason}>
                          <SelectTrigger className="h-8 text-xs rounded-xl bg-card">
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
                        <Label className="text-[11px] font-bold text-muted-foreground">Observações</Label>
                        <Input
                          value={editBlockNotes}
                          onChange={(e) => setEditBlockNotes(e.target.value)}
                          placeholder="Ex: Ar condicionado em reparo..."
                          className="h-8 text-xs rounded-xl bg-card"
                        />
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter className="gap-2 pt-2 flex items-center justify-between sm:justify-between">
                  {selectedBlockForDetails.isServiceBlock || selectedBlockForDetails.reason === "service_order" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setBlockDetailsModalOpen(false);
                        setLocation("/servicos");
                      }}
                      className="rounded-xl h-9 text-xs font-black gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      Ver em Serviços
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deletingBlock || savingBlockEdit}
                      onClick={() => handleDeleteBlock(selectedBlockForDetails.id)}
                      className="rounded-xl h-9 text-xs font-black gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingBlock ? "Removendo..." : "Remover Bloqueio"}
                    </Button>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBlockDetailsModalOpen(false)}
                      className="rounded-xl h-9 text-xs font-bold"
                    >
                      Fechar
                    </Button>
                    <Button
                      type="button"
                      disabled={savingBlockEdit || !editBlockStart || !editBlockEnd}
                      onClick={handleSaveBlockDetailsEdit}
                      className="rounded-xl h-9 text-xs font-black gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {savingBlockEdit ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Cadastro Rápido de Nova Empresa Parceira */}
        <Dialog open={newCompanyModalOpen} onOpenChange={setNewCompanyModalOpen}>
          <DialogContent className="sm:max-w-md bg-card border border-border rounded-3xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <span>Nova Empresa Parceira (PJ / Faturamento)</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastre a empresa corporativa e vincule diretamente a esta reserva.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveNewCompany} className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <Label className="font-bold flex items-center justify-between">
                  <span>CNPJ (Opcional)</span>
                  {loadingNewCompanyCnpj && (
                    <span className="text-[10px] text-indigo-600 flex items-center gap-1 font-normal">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Buscando na Receita Federal...
                    </span>
                  )}
                </Label>
                <Input 
                  value={newCompCnpj} 
                  onChange={e => {
                    setNewCompCnpj(e.target.value)
                    handleLookupNewCompanyCnpj(e.target.value)
                  }} 
                  placeholder="00.000.000/0000-00 (Opcional)"
                  className="h-8 text-xs rounded-xl font-mono" 
                />
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Razão Social / Nome da Empresa *</Label>
                <Input 
                  value={newCompCorporateName} 
                  onChange={e => setNewCompCorporateName(e.target.value)} 
                  required 
                  placeholder="Ex: Petrobras Transporte S.A."
                  className="h-8 text-xs rounded-xl" 
                />
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Nome Fantasia (Opcional)</Label>
                <Input 
                  value={newCompTradeName} 
                  onChange={e => setNewCompTradeName(e.target.value)} 
                  placeholder="Ex: Transpetro"
                  className="h-8 text-xs rounded-xl" 
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold">E-mail Financeiro</Label>
                  <Input 
                    type="email"
                    value={newCompFinancialEmail} 
                    onChange={e => setNewCompFinancialEmail(e.target.value)} 
                    placeholder="financeiro@empresa.com"
                    className="h-8 text-xs rounded-xl" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">Telefone / WhatsApp</Label>
                  <Input 
                    type="tel"
                    inputMode="tel"
                    value={newCompPhone} 
                    onChange={e => setNewCompPhone(formatBrazilPhone(e.target.value))} 
                    placeholder="(22) 99999-9999"
                    className="h-8 text-xs rounded-xl" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold">Responsável / Contato</Label>
                  <Input 
                    value={newCompContactPerson} 
                    onChange={e => setNewCompContactPerson(e.target.value)} 
                    placeholder="Ex: Roberto Silva"
                    className="h-8 text-xs rounded-xl" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold">Condição de Faturamento</Label>
                  <Input 
                    value={newCompBillingTerms} 
                    onChange={e => setNewCompBillingTerms(e.target.value)} 
                    placeholder="Ex: 30 dias"
                    className="h-8 text-xs rounded-xl" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold">Observações (Opcional)</Label>
                <Input 
                  value={newCompNotes} 
                  onChange={e => setNewCompNotes(e.target.value)} 
                  placeholder="Ex: Centro de Custo, regras de faturamento..."
                  className="h-8 text-xs rounded-xl" 
                />
              </div>

              <DialogFooter className="gap-2 pt-3 border-t border-border">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setNewCompanyModalOpen(false)} 
                  className="rounded-xl h-8 text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingNewCompany} 
                  className="rounded-xl h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                >
                  {savingNewCompany ? "Salvando..." : "Salvar e Vincular à Reserva"}
                </Button>
              </DialogFooter>
            </form>
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
                  <MemoBlockFlatSelect
                    value={blockFlatId}
                    onValueChange={setBlockFlatId}
                    flats={data.flats}
                  />
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

        {/* Modal de Configuração de Formas de Pagamento, Taxas & Comissões */}
        <PaymentMethodsModal
          open={paymentConfigModalOpen}
          onOpenChange={setPaymentConfigModalOpen}
          onSaved={(updated) => setPaymentMethods(updated)}
          onSelectMethod={(newMethodId) => setFormPaymentMethod(newMethodId)}
          initialNewName={initialNewPaymentMethodName}
        />

        {/* ══════════════════════════════════════════════════════════════════
            MODAL DE EXPORTAÇÃO DE RESERVAS EM CSV
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={csvExportModalOpen} onOpenChange={setCsvExportModalOpen}>
          <DialogContent className="sm:max-w-lg bg-card border border-border rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                <FileSpreadsheet className="w-5 h-5 text-sky-600" />
                <span>Exportar Reservas em Planilha CSV</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Gere um arquivo CSV completo com todas as informações de reservas, hóspedes, valores e estadias para backup ou conferência.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-4 text-xs">
              {/* Seleção do Período */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">Período de Exportação</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={exportPreset === "all" ? "default" : "outline"}
                    size="sm"
                    className="text-xs font-bold h-8 rounded-xl"
                    onClick={() => setExportPreset("all")}
                  >
                    Todo o Histórico
                  </Button>
                  <Button
                    type="button"
                    variant={exportPreset === "this_month" ? "default" : "outline"}
                    size="sm"
                    className="text-xs font-bold h-8 rounded-xl"
                    onClick={() => setExportPreset("this_month")}
                  >
                    Mês Atual
                  </Button>
                  <Button
                    type="button"
                    variant={exportPreset === "next_month" ? "default" : "outline"}
                    size="sm"
                    className="text-xs font-bold h-8 rounded-xl"
                    onClick={() => setExportPreset("next_month")}
                  >
                    Próximo Mês
                  </Button>
                  <Button
                    type="button"
                    variant={exportPreset === "next_90" ? "default" : "outline"}
                    size="sm"
                    className="text-xs font-bold h-8 rounded-xl"
                    onClick={() => setExportPreset("next_90")}
                  >
                    Próximos 90 Dias
                  </Button>
                  <Button
                    type="button"
                    variant={exportPreset === "custom" ? "default" : "outline"}
                    size="sm"
                    className="text-xs font-bold h-8 rounded-xl col-span-2 sm:col-span-2"
                    onClick={() => setExportPreset("custom")}
                  >
                    Período Personalizado
                  </Button>
                </div>
              </div>

              {/* Datas personalizadas */}
              {exportPreset === "custom" && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-2xl border border-border">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Data Inicial</Label>
                    <Input
                      type="date"
                      value={exportStartDate}
                      onChange={e => setExportStartDate(e.target.value)}
                      className="text-xs rounded-xl h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Data Final</Label>
                    <Input
                      type="date"
                      value={exportEndDate}
                      onChange={e => setExportEndDate(e.target.value)}
                      className="text-xs rounded-xl h-8"
                    />
                  </div>
                </div>
              )}

              {/* Filtros Adicionais */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Canal de Origem</Label>
                  <Select value={exportChannel} onValueChange={setExportChannel}>
                    <SelectTrigger className="text-xs h-8 rounded-xl">
                      <SelectValue placeholder="Todos os Canais" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Canais</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp / Direta</SelectItem>
                      <SelectItem value="airbnb">Airbnb</SelectItem>
                      <SelectItem value="booking">Booking.com</SelectItem>
                      <SelectItem value="b2b">B2B Reservas / Agência</SelectItem>
                      <SelectItem value="site">Site Próprio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Status da Reserva</Label>
                  <Select value={exportStatus} onValueChange={setExportStatus}>
                    <SelectTrigger className="text-xs h-8 rounded-xl">
                      <SelectValue placeholder="Todos os Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      <SelectItem value="confirmada">Confirmadas</SelectItem>
                      <SelectItem value="pre_reserva">Pré-Reservas</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Card Resumo do Layout */}
              <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-2xl border border-sky-200 dark:border-sky-800/60 text-[11px] text-sky-900 dark:text-sky-200 space-y-1">
                <span className="font-bold block">✓ Compatibilidade Total com Planilhas & Importação:</span>
                <p className="text-[10.5px] leading-relaxed text-sky-800 dark:text-sky-300">
                  O arquivo gerado inclui 27 colunas com todos os dados cadastrais (Código, Flat, Hóspede, CPF, Telefone, Check-in, Check-out, Diária, Valor Total, Status, Forma de Pagamento, Camas, Observações e Notas).
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setCsvExportModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleExportCsv}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Planilha CSV</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════
            MODAL DE IMPORTAÇÃO DE RESERVAS VIA CSV (PREENCHER MAPA)
           ══════════════════════════════════════════════════════════════════ */}
        <Dialog open={csvImportModalOpen} onOpenChange={setCsvImportModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-4xl bg-card border border-border rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                <Upload className="w-5 h-5 text-emerald-600" />
                <span>Importar Reservas via CSV (Preencher Mapa)</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Carregue uma planilha CSV para restaurar ou preencher as reservas do mapa. O sistema analisa automaticamente cada linha, valida apartamentos e identifica reservas existentes.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-4 text-xs">
              {/* Input File / Dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {!importFile ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 border-2 border-dashed border-emerald-300 dark:border-emerald-800 rounded-3xl bg-emerald-50/50 dark:bg-emerald-950/20 text-center cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors space-y-2"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 mx-auto flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                      Clique para selecionar o arquivo CSV de reservas
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Formatos aceitos: CSV exportado pelo sistema ou planilhas do Excel com cabeçalhos de reservas.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-muted/40 rounded-2xl border border-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-xs text-foreground block truncate">{importFile.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{(importFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportFile(null)
                      setPreviewResult(null)
                    }}
                    className="text-xs h-7 rounded-xl"
                  >
                    Trocar Arquivo
                  </Button>
                </div>
              )}

              {/* Loading State durante parsing */}
              {isPreviewing && (
                <div className="py-8 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                  <span className="text-xs font-semibold text-muted-foreground block">
                    Lendo arquivo e validando integridade das reservas com os apartamentos...
                  </span>
                </div>
              )}

              {/* Resultados do Preview */}
              {previewResult && (
                <div className="space-y-3.5 animate-in fade-in">
                  {/* Cards de Resumo */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 bg-muted/40 rounded-2xl border border-border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase block">Total Lidas</span>
                      <span className="text-xl font-black text-foreground">{previewResult.totalRows}</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase block">Novas Reservas</span>
                      <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{previewResult.newCount}</span>
                    </div>
                    <div className="p-2.5 bg-sky-50 dark:bg-sky-950/40 rounded-2xl border border-sky-200 dark:border-sky-800">
                      <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase block">Atualizações</span>
                      <span className="text-xl font-black text-sky-600 dark:text-sky-400">{previewResult.updateCount}</span>
                    </div>
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800">
                      <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase block">Erros / Inválidas</span>
                      <span className="text-xl font-black text-rose-600 dark:text-rose-400">{previewResult.errorCount}</span>
                    </div>
                  </div>

                  {/* Modo de Importação */}
                  <div className="p-3 bg-muted/30 rounded-2xl border border-border space-y-2">
                    <Label className="text-xs font-bold text-foreground">Como deseja aplicar ao mapa de reservas?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div 
                        onClick={() => setImportMode("upsert")}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          importMode === "upsert" 
                            ? "bg-primary/10 border-primary text-primary font-bold shadow-xs" 
                            : "bg-card border-border/70 text-muted-foreground hover:border-border"
                        }`}
                      >
                        <span className="block text-foreground font-bold">1. Mesclar / Atualizar (Recomendado)</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          Atualiza reservas já existentes (pelo código ou quarto+data) e adiciona as novas.
                        </span>
                      </div>
                      <div 
                        onClick={() => setImportMode("insert_only")}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          importMode === "insert_only" 
                            ? "bg-primary/10 border-primary text-primary font-bold shadow-xs" 
                            : "bg-card border-border/70 text-muted-foreground hover:border-border"
                        }`}
                      >
                        <span className="block text-foreground font-bold">2. Inserir apenas novas</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          Pula as reservas que já constarem no sistema e adiciona apenas as que faltam.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tabela de Preview com Scroll */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200">Pré-visualização das Linhas ({previewResult.preview.length})</span>
                      {previewResult.conflictCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-bold text-[11px] flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> {previewResult.conflictCount} aviso(s) de sobreposição
                        </span>
                      )}
                    </div>

                    <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-2xl border border-border bg-card">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-muted/70 text-muted-foreground font-semibold sticky top-0 backdrop-blur-md">
                          <tr>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5">Flat</th>
                            <th className="p-2.5">Hóspede</th>
                            <th className="p-2.5">Período</th>
                            <th className="p-2.5">Canal</th>
                            <th className="p-2.5 text-right">Valor Total</th>
                            <th className="p-2.5">Avisos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {previewResult.preview.map((item: any, idx: number) => (
                            <tr key={idx} className={item.status === "error" ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}>
                              <td className="p-2.5">
                                {item.status === "new" && (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[10px]">
                                    Nova
                                  </Badge>
                                )}
                                {item.status === "update" && (
                                  <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-300 text-[10px]">
                                    Atualização
                                  </Badge>
                                )}
                                {item.status === "error" && (
                                  <Badge variant="destructive" className="text-[10px]">
                                    Erro
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5 font-bold font-mono">
                                Flat {item.flatNumber || "?"}
                              </td>
                              <td className="p-2.5 font-bold max-w-[140px] truncate" title={item.guestName}>
                                {item.guestName}
                              </td>
                              <td className="p-2.5 font-mono text-[10px]">
                                {item.checkinDate} → {item.checkoutDate} ({item.nights}d)
                              </td>
                              <td className="p-2.5 capitalize">{item.channel}</td>
                              <td className="p-2.5 text-right font-black font-mono text-emerald-600">
                                R$ {Number(item.totalAmount || 0).toFixed(2)}
                              </td>
                              <td className="p-2.5 text-[10px]">
                                {item.errors?.length > 0 ? (
                                  <span className="text-rose-600 font-bold">{item.errors.join(", ")}</span>
                                ) : item.warnings?.length > 0 ? (
                                  <span className="text-amber-600 font-medium">{item.warnings.join(", ")}</span>
                                ) : (
                                  <span className="text-emerald-600 font-bold">✓ Válida</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setCsvImportModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!previewResult || previewResult.validCount === 0 || isImporting}
                onClick={handleConfirmImport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-1.5 shadow-sm"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importando e Sincronizando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmar Importação de {previewResult ? previewResult.validCount : 0} Reservas</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── MODAL DE PRÉ-RESERVAS EXPIRADAS (REATIVAÇÃO COM 1 CLIQUE) ── */}
        <Dialog open={expiredModalOpen} onOpenChange={setExpiredModalOpen}>
          <DialogContent className="sm:max-w-2xl bg-card border border-border rounded-3xl max-h-[85vh] overflow-y-auto p-5 sm:p-6">
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="text-lg font-black flex items-center gap-2 text-foreground">
                <Clock className="w-5 h-5 text-amber-600" />
                <span>⏳ Pré-Reservas Expiradas ({(data.expiredPreReservations || []).length})</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Pré-reservas cujo prazo de pagamento venceu e saíram do calendário. Clique em <strong>Reativar</strong> para abrir todos os dados já preenchidos sem precisar digitar tudo de novo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2.5 py-2">
              {(!data.expiredPreReservations || data.expiredPreReservations.length === 0) ? (
                <div className="p-8 text-center bg-muted/20 rounded-2xl border border-border/60 space-y-2">
                  <Clock className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                  <p className="text-xs font-bold text-foreground">Nenhuma pré-reserva expirada no momento</p>
                  <p className="text-[11px] text-muted-foreground">
                    Quando uma pré-reserva vencer o tempo limite sem pagamento, ela aparecerá aqui para fácil reativação caso o hóspede retorne o contato.
                  </p>
                </div>
              ) : (
                data.expiredPreReservations.map((expRes: any) => {
                  const isOrigFree = expRes.isOriginalFlatAvailable !== false
                  const isExpExt = Boolean(expRes.isExpiredExtension)
                  const dispCheckin = isExpExt ? (expRes.extensionStartDate || expRes.checkinDate) : expRes.checkinDate
                  const dispCheckout = isExpExt ? (expRes.extensionEndDate || expRes.attemptedCheckoutDate || expRes.checkoutDate) : expRes.checkoutDate
                  const dispAmount = isExpExt ? Number(expRes.extraAmount || 0) : Number(expRes.totalAmount || 0)
                  return (
                    <div
                      key={expRes.id || expRes.code}
                      className="p-3.5 rounded-2xl bg-muted/30 hover:bg-muted/50 border border-border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-foreground truncate">
                            {expRes.guestName || "Hóspede"}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px] font-bold">
                            {expRes.code}
                          </Badge>
                          {isExpExt && (
                            <Badge className="bg-amber-500 text-slate-950 text-[10px] font-black">
                              ➕ Diária Extra Expirada
                            </Badge>
                          )}
                          <Badge className={isOrigFree ? "bg-emerald-600 text-white text-[10px] font-bold" : "bg-amber-600 text-white text-[10px] font-bold"}>
                            {isOrigFree
                              ? (isExpExt ? `✓ Flat ${expRes.flatNumber} Livre no Extra` : `✓ Flat ${expRes.flatNumber} Livre`)
                              : `⚠️ Flat ${expRes.flatNumber} Ocupado`}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            📅 {isExpExt ? "Extra: " : ""}<strong>{dispCheckin?.split("-").reverse().join("/")}</strong> a <strong>{dispCheckout?.split("-").reverse().join("/")}</strong>
                            {isExpExt ? ` (+${expRes.extraNights || 1} diária)` : ""}
                          </span>
                          <span>
                            💰 <strong>R$ {dispAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                          </span>
                          {expRes.guestPhone && (
                            <span>📱 {expRes.guestPhone}</span>
                          )}
                        </div>

                        {isExpExt && (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            ✅ Reserva principal ({expRes.checkinDate?.split("-").reverse().join("/")} a {expRes.checkoutDate?.split("-").reverse().join("/")}) segue 100% confirmada
                          </div>
                        )}

                        <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5 flex-wrap">
                          <span>
                            ⏳ Expirou em:{" "}
                            <strong>
                              {expRes.expiredAt
                                ? format(new Date(expRes.expiredAt), "dd/MM/yyyy 'às' HH:mm")
                                : (expRes.expiresAt ? format(new Date(expRes.expiresAt), "dd/MM/yyyy 'às' HH:mm") : "—")}
                            </strong>
                          </span>
                          {expRes.holdDurationLabel && (
                            <span>• Prazo original: {expRes.holdDurationLabel}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleReactivateExpiredRes(expRes)}
                          className="h-9 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 shadow-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isExpExt ? "🔄 Reativar Diária Extra" : "🔄 Reativar Pré-Reserva"}</span>
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <DialogFooter className="pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setExpiredModalOpen(false)} className="rounded-xl text-xs font-bold">
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── MODAL DE MANUTENÇÕES EM ABERTO DO APARTAMENTO (CLIQUE NO ÍCONE 🔧 DO MAPA) ── */}
        <Dialog open={Boolean(maintModalFlat)} onOpenChange={(open) => { if (!open) setMaintModalFlat(null) }}>
          <DialogContent className="sm:max-w-xl bg-card border border-border rounded-3xl max-h-[85vh] overflow-y-auto p-5">
            {maintModalFlat && (
              <>
                <DialogHeader className="border-b border-border pb-3">
                  <DialogTitle className="text-base sm:text-lg font-black flex items-center gap-2 text-foreground">
                    <Wrench className="w-5 h-5 text-amber-500" />
                    <span>Manutenções em Aberto — Apt {maintModalFlat.number}</span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Problemas relatados neste apartamento. Você pode alternar se o defeito bloqueia o flat, dar baixa rápida ou abrir a triagem completa do Faz-Tudo.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2 text-xs">
                  {((maintModalFlat.openMaintenanceIssues || []) as any[]).map((issue: any) => (
                    <div
                      key={issue.id}
                      className={`p-3.5 rounded-2xl border space-y-2.5 ${
                        issue.isRentalBlocker
                          ? "bg-rose-500/5 border-rose-500/40"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={issue.isRentalBlocker ? "bg-rose-600 text-white text-[10px]" : "bg-emerald-600 text-white text-[10px]"}>
                            {issue.isRentalBlocker ? "🚫 Impeditivo (Bloqueando Flat)" : "🟢 Não Impeditivo (Flat Livre)"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-bold uppercase">
                            {issue.specialty || "geral"}
                          </Badge>
                          {issue.quoteAmount !== null && issue.quoteAmount !== undefined && (
                            <Badge variant="outline" className="text-[10px] font-black border-amber-500/40 text-amber-700 dark:text-amber-300">
                              💰 R$ {Number(issue.quoteAmount).toFixed(2)} ({issue.quoteStatus === "approved" ? "Aprovado" : "Aguardando aprovação"})
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">#{issue.id}</span>
                      </div>

                      <p className="text-xs sm:text-sm font-semibold text-foreground bg-background p-2.5 rounded-xl border border-border/60">
                        {issue.text}
                      </p>

                      {Array.isArray(issue.photos) && issue.photos.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto">
                          {issue.photos.map((url: string, idx: number) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt="Foto" className="w-16 h-16 rounded-xl object-cover border" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
                        <span className="text-[11px] text-muted-foreground">
                          Prestador: <strong>{issue.assignedTo === "handyman" ? (issue.handymanName || "Faz-Tudo") : "Interno / A definir"}</strong>
                        </span>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={maintActionBusyId === issue.id}
                            onClick={() => handleToggleMaintenanceBlocker(issue)}
                            className="h-8 px-2.5 rounded-xl text-[11px] font-bold"
                          >
                            {issue.isRentalBlocker ? "🟢 Tornar Não Impeditivo" : "🚫 Tornar Impeditivo (Bloquear)"}
                          </Button>

                          <a href={`/observations?ticket=${issue.id}`}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 rounded-xl text-[11px] font-bold border-amber-500/40 text-amber-700 dark:text-amber-300"
                            >
                              ⚙️ Triagem / Faz-Tudo
                            </Button>
                          </a>

                          <Button
                            type="button"
                            size="sm"
                            disabled={maintActionBusyId === issue.id}
                            onClick={() => handleQuickResolveMaintenance(issue)}
                            className="h-8 px-2.5 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            ✓ Dar Baixa
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <DialogFooter className="pt-2 border-t border-border">
                  <Button type="button" variant="outline" size="sm" onClick={() => setMaintModalFlat(null)} className="rounded-xl text-xs font-bold">
                    Fechar
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MaybeShell>
  )
}
