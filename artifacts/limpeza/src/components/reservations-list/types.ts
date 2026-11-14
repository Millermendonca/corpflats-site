export type QuickTabKey =
  | "all"
  | "arrivals_today"
  | "in_house"
  | "departures_today"
  | "pre_reservations"
  | "quarantine"
  | "cancelled_expired";

export type SortField =
  | "receivedAt"
  | "checkinDate"
  | "checkoutDate"
  | "flatNumber"
  | "guestName"
  | "totalAmount"
  | "netAmount"
  | "adr"
  | "balanceDue"
  | "status";

export type SortDirection = "asc" | "desc";

export type TableDensity = "comfortable" | "compact";

export type OptionalColumnKey =
  | "netAmount"
  | "adr"
  | "company"
  | "guestDoc"
  | "paymentMethod"
  | "createdBy";

export type DateFilterTarget = "receivedAt" | "checkinDate" | "checkoutDate";

export interface ReservationListFilters {
  tab: QuickTabKey;
  search: string;
  channel: string; // "all" | "site" | "whatsapp" | "booking" | "airbnb" | "b2b"
  flatNumber: string; // "all" | "605" | ...
  financial: string; // "all" | "has_balance" | "paid" | "cobrar_hotel" | "faturado_pj"
  dateTarget: DateFilterTarget;
  datePreset: "all" | "today" | "last_7d" | "this_month" | "next_30d" | "custom";
  startDate: string;
  endDate: string;
  onlyWithBreakfast: boolean;
  onlyPendingFnrh: boolean;
  onlyPendingNfse: boolean;
  onlyCorporate: boolean;
}

export interface SavedFilterView {
  id: string;
  name: string;
  isSystem?: boolean;
  filters: Partial<ReservationListFilters>;
}

export interface FlatSummaryItem {
  id: number;
  number: string;
  name: string;
  floor?: number | null;
  cleaningStatus: "clean" | "dirty" | "cleaning_now" | string;
}

export interface UnifiedReservationRow {
  uid: string;
  sourceType: "pms" | "quarantine";
  id: number | string;
  numericSortTie?: number;
  code: string;
  externalOrderId?: string | null;
  receivedAtIso: string;
  receivedAtMs: number;
  createdByName: string;
  channel: "site" | "whatsapp" | "booking" | "airbnb" | "b2b" | string;
  rawChannel: string;
  guestId?: number | string | null;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestDocument: string;
  adults: number;
  children: number;
  guestCount: number;
  companionsCount: number;
  companyId?: number | string | null;
  companyName: string;
  agencyName: string;
  isCorporateOrB2b: boolean;
  isMonthlyGuest: boolean;
  flatId?: number | null;
  flatNumber?: string | null;
  checkinDate: string;
  checkoutDate: string;
  checkinTime: string;
  checkoutTime: string;
  nights: number;
  totalAmount: number;
  adr: number;
  paidAmount: number;
  balanceDue: number;
  commissionAmount: number;
  netAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  paymentCollect: "Channel" | "Property" | string;
  financialBadge: "pago" | "pago_ota" | "parcial" | "pendente" | "cobrar_hotel" | "faturado_pj" | string;
  status: string;
  canonicalStatus:
    | "confirmada"
    | "pre_reserva"
    | "hospedado"
    | "checked_out"
    | "quarantine"
    | "expirada"
    | "cancelada"
    | string;
  isCheckedIn: boolean;
  checkoutDone: boolean;
  earlyCheckout: boolean;
  earlyCheckinAuthorized: boolean;
  expiresAt?: string | null;
  includeBreakfast: boolean;
  fnrhCompleted: boolean;
  hasDocPhoto: boolean;
  vehiclePlate: string;
  vehicleModel: string;
  vehicleSummary: string;
  invoiceIssued: boolean;
  invoiceNumber?: string | number | null;
  autoEmitInvoice: boolean;
  cleaningStatusToday: "clean" | "dirty" | "cleaning_now" | string;
  hasCardVault: boolean;
  cardLast4?: string;
  cardBrand?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  hasMinor: boolean;
  riskAttentionAlert: boolean;
  riskAttentionReason: string;
  twinBeds: boolean;
  extraMattress: boolean;
  notes: string;
  receptionNotes: string;
  specialRequests: string;
  quarantineReason?: string | null;
  quarantineDiagnostic?: string | null;
  rawReservation?: any;
  rawQuarantineItem?: any;
}

export const DEFAULT_RESERVATION_FILTERS: ReservationListFilters = {
  tab: "all",
  search: "",
  channel: "all",
  flatNumber: "all",
  financial: "all",
  dateTarget: "receivedAt",
  datePreset: "all",
  startDate: "",
  endDate: "",
  onlyWithBreakfast: false,
  onlyPendingFnrh: false,
  onlyPendingNfse: false,
  onlyCorporate: false,
};

export const SYSTEM_SAVED_VIEWS: SavedFilterView[] = [
  {
    id: "sys_pending_pix",
    name: "💰 Saldo / PIX Pendente",
    isSystem: true,
    filters: { tab: "all", financial: "has_balance" },
  },
  {
    id: "sys_ota_hotel_collect",
    name: "🏨 OTAs Cobrar no Hotel",
    isSystem: true,
    filters: { tab: "all", financial: "cobrar_hotel" },
  },
  {
    id: "sys_corporate_b2b",
    name: "🏢 B2B & Empresas",
    isSystem: true,
    filters: { tab: "all", onlyCorporate: true },
  },
  {
    id: "sys_missing_fnrh",
    name: "🪪 Sem Pré-Check-in / FNRH",
    isSystem: true,
    filters: { tab: "all", onlyPendingFnrh: true },
  },
  {
    id: "sys_missing_nfse",
    name: "🧾 Sem NFS-e Emitida",
    isSystem: true,
    filters: { tab: "all", onlyPendingNfse: true },
  },
];

export const OPTIONAL_COLUMNS_META: { key: OptionalColumnKey; label: string; description: string }[] = [
  { key: "netAmount", label: "Valor Líquido (s/ Comissão)", description: "Receita estimada descontando comissão OTA ou taxa" },
  { key: "adr", label: "Diária Média (ADR)", description: "Valor médio por noite da reserva" },
  { key: "company", label: "Empresa / Agência", description: "Coluna dedicada para razão social, B2B ou agência" },
  { key: "guestDoc", label: "CPF / Documento", description: "Documento do titular da reserva" },
  { key: "paymentMethod", label: "Forma de Pagamento", description: "PIX, Cartão, Boleto Faturado, VCN ou OTA" },
  { key: "createdBy", label: "Origem / Criado Por", description: "Usuário, motor ou integração que registrou a reserva" },
];

export const CHANNEL_BADGE_MAP: Record<
  string,
  { label: string; shortLabel: string; className: string; dotClass: string }
> = {
  booking: {
    label: "Booking.com",
    shortLabel: "Booking",
    className: "bg-[#003580] text-white border-[#00265c]",
    dotClass: "bg-[#003580]",
  },
  airbnb: {
    label: "Airbnb",
    shortLabel: "Airbnb",
    className: "bg-[#FF385C] text-white border-[#e02749]",
    dotClass: "bg-[#FF385C]",
  },
  site: {
    label: "Site Próprio",
    shortLabel: "Site",
    className: "bg-orange-600 text-white border-orange-700",
    dotClass: "bg-orange-600",
  },
  whatsapp: {
    label: "WhatsApp",
    shortLabel: "WhatsApp",
    className: "bg-emerald-600 text-white border-emerald-700",
    dotClass: "bg-emerald-600",
  },
  b2b: {
    label: "B2B / Agência",
    shortLabel: "B2B",
    className: "bg-violet-600 text-white border-violet-700",
    dotClass: "bg-violet-600",
  },
};

export const STATUS_BADGE_MAP: Record<string, { label: string; className: string }> = {
  confirmada: {
    label: "Confirmada",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  },
  pre_reserva: {
    label: "⏳ Pré-Reserva",
    className:
      "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700",
  },
  hospedado: {
    label: "Hospedado (In)",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
  },
  checked_out: {
    label: "✓ Check-out",
    className:
      "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700",
  },
  quarantine: {
    label: "⚠️ Quarentena OTA",
    className: "bg-rose-600 text-white border-rose-700 shadow-2xs",
  },
  expirada: {
    label: "Expirada",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  },
  cancelada: {
    label: "Cancelada",
    className:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 line-through decoration-rose-400/60",
  },
};

export function formatCurrencyBRL(val: number | null | undefined): string {
  const num = Number(val) || 0;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateBrShort(isoDate?: string | null): string {
  if (!isoDate || isoDate.length < 10) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y.slice(2)}`;
}

export function formatDateBrFull(isoDate?: string | null): string {
  if (!isoDate || isoDate.length < 10) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function formatArrivalTimestamp(isoStr?: string | null, nowMs: number = Date.now()): {
  relative: string;
  exact: string;
  isRecent: boolean;
} {
  if (!isoStr) return { relative: "—", exact: "—", isRecent: false };
  const d = new Date(isoStr);
  const ms = d.getTime();
  if (isNaN(ms)) return { relative: "—", exact: "—", isRecent: false };

  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const exact = `${dd}/${mm}/${yy} ${hh}:${min}`;

  if (diffSec < 60) return { relative: "agora mesmo", exact, isRecent: true };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { relative: `há ${diffMin} min`, exact, isRecent: diffMin <= 20 };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { relative: `há ${diffHr}h`, exact, isRecent: false };
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return { relative: "ontem", exact, isRecent: false };
  if (diffDays < 30) return { relative: `há ${diffDays}d`, exact, isRecent: false };
  return { relative: `${dd}/${mm}/${yy}`, exact, isRecent: false };
}

export function formatPaymentMethodLabel(raw?: string | null): string {
  const low = String(raw || "").toLowerCase();
  if (!low) return "—";
  if (low === "pix") return "PIX";
  if (low === "cartao_credito" || low === "credit_card") return "Cartão de Crédito";
  if (low === "mercadopago") return "Mercado Pago";
  if (low === "boleto_faturado") return "Boleto Faturado";
  if (low === "faturado_b2b") return "Faturado PJ / B2B";
  if (low === "vcn_b2b" || low === "virtual_card") return "Cartão Virtual (VCN)";
  if (low === "booking") return "Booking.com";
  if (low === "airbnb") return "Airbnb";
  if (low === "dinheiro") return "Dinheiro";
  return raw || "—";
}
