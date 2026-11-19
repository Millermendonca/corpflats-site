import React, { useState, useEffect, useMemo, useRef, useId, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  History,
  Mail,
  MessageSquare,
  PauseCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Tag,
  User,
  Wallet
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

export interface CollectionsSettings {
  dailyPaymentRemindersEnabled: boolean;
  dailyPaymentReminderHour: number;
  dailyPaymentReminderLookbackDays: number;
  dailyPaymentReminderMaxDays: number;
  dailyPaymentReminderNotifyManagerOnDay7: boolean;
  notificationManagerWhatsApp?: string;
}

export interface CollectionsSummary {
  pendingTargetsCount: number;
  pendingTotalAmount: number;
  pausedCount: number;
  day7EscalatedCount: number;
  suspiciousPaidOrdersCount: number;
}

export interface PendingCollectionHistoryEntry {
  sentAt?: string;
  date?: string;
  step?: number;
  channel?: string;
  channels?: string[];
  whatsappSent?: boolean;
  emailSent?: boolean;
  formalNotice?: boolean;
  note?: string;
}

export interface PendingCollectionTarget {
  targetKey: string;
  reservationId: string | number;
  reservationCode: string;
  flatNumber: string;
  guestIndex: number;
  guestId?: string | number | null;
  guestName: string;
  guestRole?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestDocument?: string;
  splitMode?: string;
  pendingAmount: number;
  totalReservationPending?: number;
  items?: Array<{
    productId?: string;
    productName?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
  itemsSummary?: string;
  referenceDateYmd?: string;
  referenceDateBr?: string;
  daysSinceReference?: number;
  reminderCount: number;
  maxDays: number;
  nextStep?: number;
  lastSentDate?: string | null;
  lastSentAt?: string | null;
  formalNoticeSentAt?: string | null;
  paused: boolean;
  pausedAt?: string | null;
  pausedReason?: string | null;
  crmTagged: boolean;
  paymentUrl?: string;
  pendingOrderId?: string | null;
  history?: PendingCollectionHistoryEntry[];
}

export interface PaidCollectionOrder {
  id: string;
  flatNumber: string;
  reservationCode: string;
  guestName: string;
  guestIndex?: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  paidAt?: string | null;
  pixTxId?: string | null;
  pixEndToEndId?: string | null;
  manualPaymentConfirmed?: boolean;
  hasInvoice?: boolean;
  invoiceStatus?: string | null;
  itemsSummary?: string;
  verificationStatus:
    | "verified_e2e"
    | "verified_card"
    | "manual_confirmed"
    | "unverified_synthetic_e2e"
    | "pending"
    | string;
  verificationWarning?: string | null;
}

export interface MinibarAuditReport {
  ranAt?: string;
  triggeredBy?: string;
  lookbackDays?: number;
  scannedCount?: number;
  reopenedCount?: number;
  verifiedBackfilledCount?: number;
  backfilledCount?: number;
  flaggedWithInvoiceCount?: number;
  skippedOnNetworkErrorCount?: number;
  reopenedOrders?: Array<{
    id: string;
    flatNumber?: string;
    reservationCode?: string;
    guestName?: string;
    totalAmount?: number;
  }>;
  message?: string;
}

export interface MinibarCollectionsPanelProps {
  onDataChanged?: () => void;
  onOverviewLoaded?: (summary: CollectionsSummary) => void;
}

type ManualPaymentMethod =
  | "pix_avulso"
  | "cartao_maquininha"
  | "dinheiro"
  | "transferencia"
  | "cortesia_admin";

const MANUAL_PAYMENT_OPTIONS: Array<{
  value: ManualPaymentMethod;
  label: string;
  hint: string;
}> = [
  {
    value: "pix_avulso",
    label: "PIX Avulso",
    hint: "Transferência PIX feita fora do link automático"
  },
  {
    value: "cartao_maquininha",
    label: "Cartão (Maquininha)",
    hint: "Passado na maquininha presencial ou link externo"
  },
  {
    value: "dinheiro",
    label: "Dinheiro",
    hint: "Recebido em espécie na recepção"
  },
  {
    value: "transferencia",
    label: "Transferência Bancária",
    hint: "TED / DOC / depósito identificado em conta"
  },
  {
    value: "cortesia_admin",
    label: "Cortesia / Abono Admin",
    hint: "Isenção autorizada pela gerência"
  }
];

function formatBRL(value: number | undefined | null): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDateTimeBr(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPaymentMethodLabel(method?: string): string {
  switch (method) {
    case "pix":
      return "PIX";
    case "credit_card":
      return "Cartão";
    case "pix_avulso":
      return "PIX Avulso";
    case "cartao_maquininha":
      return "Cartão Maquininha";
    case "dinheiro":
      return "Dinheiro";
    case "transferencia":
      return "Transferência";
    case "cortesia_admin":
      return "Cortesia Admin";
    default:
      return method || "Frigobar";
  }
}

function formatSplitModeLabel(splitMode?: string): string | null {
  if (!splitMode || splitMode === "titular") return null;
  if (splitMode === "half_and_half") return "Divisão 50/50";
  if (splitMode === "by_item") return "Divisão por Item";
  return splitMode;
}

function buildAbsolutePaymentUrl(paymentUrl?: string, reservationCode?: string, guestIndex?: number): string {
  if (paymentUrl) {
    if (/^https?:\/\//i.test(paymentUrl)) return paymentUrl;
    if (typeof window !== "undefined") {
      return `${window.location.origin}${paymentUrl.startsWith("/") ? "" : "/"}${paymentUrl}`;
    }
    return paymentUrl;
  }
  const path = `/minha-reserva/${encodeURIComponent(reservationCode || "")}/frigobar${
    guestIndex && guestIndex > 1 ? `?guestIndex=${guestIndex}` : ""
  }`;
  return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
}

function renderVerificationBadge(order: PaidCollectionOrder) {
  const status = order.verificationStatus;
  if (status === "verified_e2e") {
    return (
      <div className="space-y-0.5">
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] gap-1">
          <ShieldCheck className="w-3 h-3 shrink-0" />
          <span>✓ E2E Verificado</span>
        </Badge>
        {order.pixEndToEndId && (
          <div
            className="text-[10px] font-mono text-muted-foreground max-w-[160px] truncate"
            title={order.pixEndToEndId}
          >
            {order.pixEndToEndId}
          </div>
        )}
      </div>
    );
  }
  if (status === "verified_card") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] gap-1">
        <CreditCard className="w-3 h-3 shrink-0" />
        <span>✓ Cartão Verificado</span>
      </Badge>
    );
  }
  if (status === "manual_confirmed" || order.manualPaymentConfirmed) {
    return (
      <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[10px] gap-1">
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span>✓ Baixa Manual</span>
      </Badge>
    );
  }
  if (status === "unverified_synthetic_e2e") {
    return (
      <div className="space-y-0.5">
        <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40 text-[10px] gap-1 font-bold">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>⚠ Sem E2E Real</span>
        </Badge>
        {order.verificationWarning && (
          <div className="text-[10px] text-amber-700 dark:text-amber-300 max-w-[200px] leading-tight">
            {order.verificationWarning}
          </div>
        )}
      </div>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1">
      <Clock className="w-3 h-3 shrink-0" />
      <span>{order.paymentStatus === "pago" ? "Pago" : "Pendente"}</span>
    </Badge>
  );
}

export function MinibarCollectionsPanel({
  onDataChanged,
  onOverviewLoaded
}: MinibarCollectionsPanelProps) {
  const { toast } = useToast();
  const uid = useId();

  // Core overview state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>("");

  const [summary, setSummary] = useState<CollectionsSummary>({
    pendingTargetsCount: 0,
    pendingTotalAmount: 0,
    pausedCount: 0,
    day7EscalatedCount: 0,
    suspiciousPaidOrdersCount: 0
  });
  const [pendingTargets, setPendingTargets] = useState<PendingCollectionTarget[]>([]);
  const [suspiciousPaidOrders, setSuspiciousPaidOrders] = useState<PaidCollectionOrder[]>([]);
  const [recentPaidOrders, setRecentPaidOrders] = useState<PaidCollectionOrder[]>([]);
  const [lastAuditReport, setLastAuditReport] = useState<MinibarAuditReport | null>(null);

  // Settings form state
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState("10");
  const [lookbackDays, setLookbackDays] = useState("15");
  const [maxDays, setMaxDays] = useState("7");
  const [notifyManagerOnDay7, setNotifyManagerOnDay7] = useState(true);
  const [managerWhatsApp, setManagerWhatsApp] = useState("");
  const [settingsErrors, setSettingsErrors] = useState<{
    hour?: string;
    lookback?: string;
    maxDays?: string;
  }>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);

  const hourInputRef = useRef<HTMLInputElement>(null);
  const lookbackInputRef = useRef<HTMLInputElement>(null);
  const maxDaysInputRef = useRef<HTMLInputElement>(null);

  // Filters & search
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingStatusFilter, setPendingStatusFilter] = useState<
    "todos" | "ativos" | "pausados" | "dia7" | "crm"
  >("todos");
  const [recentPaidSearch, setRecentPaidSearch] = useState("");
  const [recentPaidFilter, setRecentPaidFilter] = useState<
    "todos" | "unverified" | "verified" | "manual"
  >("todos");

  // Per-row action states
  const [sendingTargetKey, setSendingTargetKey] = useState<string | null>(null);
  const [togglingPauseKey, setTogglingPauseKey] = useState<string | null>(null);
  const [copiedTargetKey, setCopiedTargetKey] = useState<string | null>(null);
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);

  // Pause dialog state
  const [pauseModalTarget, setPauseModalTarget] = useState<PendingCollectionTarget | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [submittingPause, setSubmittingPause] = useState(false);

  // Manual settle dialog state (works for both pending targets and suspicious paid orders)
  const [manualSettleContext, setManualSettleContext] = useState<{
    reservationCode: string;
    flatNumber: string;
    guestName: string;
    guestIndex: number;
    orderId?: string | null;
    defaultAmount: number;
    mode: "pending_target" | "confirm_suspicious";
  } | null>(null);
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>("pix_avulso");
  const [manualAmount, setManualAmount] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualAmountError, setManualAmountError] = useState<string | null>(null);
  const [submittingManualSettle, setSubmittingManualSettle] = useState(false);
  const manualAmountInputRef = useRef<HTMLInputElement>(null);

  // Reopen order dialog state
  const [reopenModalOrder, setReopenModalOrder] = useState<PaidCollectionOrder | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonError, setReopenReasonError] = useState<string | null>(null);
  const [submittingReopen, setSubmittingReopen] = useState(false);
  const reopenReasonRef = useRef<HTMLTextAreaElement>(null);

  const onOverviewLoadedRef = useRef(onOverviewLoaded);
  onOverviewLoadedRef.current = onOverviewLoaded;

  const fetchOverview = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/minibar/collections/overview", {
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Erro ao carregar painel de cobranças (HTTP ${res.status}).`);
      }

      if (data.settings) {
        setRemindersEnabled(Boolean(data.settings.dailyPaymentRemindersEnabled ?? true));
        setReminderHour(String(data.settings.dailyPaymentReminderHour ?? 10));
        setLookbackDays(String(data.settings.dailyPaymentReminderLookbackDays ?? 15));
        setMaxDays(String(data.settings.dailyPaymentReminderMaxDays ?? 7));
        setNotifyManagerOnDay7(Boolean(data.settings.dailyPaymentReminderNotifyManagerOnDay7 ?? true));
        setManagerWhatsApp(String(data.settings.notificationManagerWhatsApp || ""));
      }

      const nextSummary: CollectionsSummary = {
        pendingTargetsCount: Number(data.summary?.pendingTargetsCount ?? (data.pendingTargets?.length || 0)),
        pendingTotalAmount: Number(data.summary?.pendingTotalAmount ?? 0),
        pausedCount: Number(data.summary?.pausedCount ?? 0),
        day7EscalatedCount: Number(data.summary?.day7EscalatedCount ?? 0),
        suspiciousPaidOrdersCount: Number(
          data.summary?.suspiciousPaidOrdersCount ?? (data.suspiciousPaidOrders?.length || 0)
        )
      };

      setSummary(nextSummary);
      setPendingTargets(Array.isArray(data.pendingTargets) ? data.pendingTargets : []);
      setSuspiciousPaidOrders(Array.isArray(data.suspiciousPaidOrders) ? data.suspiciousPaidOrders : []);
      setRecentPaidOrders(Array.isArray(data.recentPaidOrders) ? data.recentPaidOrders : []);
      setLastAuditReport(data.lastAuditReport || null);
      onOverviewLoadedRef.current?.(nextSummary);
    } catch (err: any) {
      setLoadError(err?.message || "Falha ao carregar dados de cobranças do frigobar.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);
  }, [fetchOverview]);

  // Save settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedHour = Number(reminderHour);
    const parsedLookback = Number(lookbackDays);
    const parsedMaxDays = Number(maxDays);

    const nextErrors: { hour?: string; lookback?: string; maxDays?: string } = {};
    if (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23) {
      nextErrors.hour = "Informe uma hora inteira entre 0 e 23.";
    }
    if (!Number.isInteger(parsedLookback) || parsedLookback < 1 || parsedLookback > 90) {
      nextErrors.lookback = "Informe uma janela entre 1 e 90 dias.";
    }
    if (!Number.isInteger(parsedMaxDays) || parsedMaxDays < 1 || parsedMaxDays > 30) {
      nextErrors.maxDays = "Informe entre 1 e 30 dias para a régua de avisos.";
    }

    setSettingsErrors(nextErrors);
    if (nextErrors.hour) {
      hourInputRef.current?.focus();
      return;
    }
    if (nextErrors.lookback) {
      lookbackInputRef.current?.focus();
      return;
    }
    if (nextErrors.maxDays) {
      maxDaysInputRef.current?.focus();
      return;
    }

    setSavingSettings(true);
    try {
      const res = await fetch("/api/minibar/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dailyPaymentRemindersEnabled: remindersEnabled,
          dailyPaymentReminderHour: parsedHour,
          dailyPaymentReminderLookbackDays: parsedLookback,
          dailyPaymentReminderMaxDays: parsedMaxDays,
          dailyPaymentReminderNotifyManagerOnDay7: notifyManagerOnDay7
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível salvar as configurações.");
      }

      setStatusAnnouncement("Configurações dos avisos diários salvas com sucesso.");
      toast({
        title: "Configurações salvas!",
        description: remindersEnabled
          ? `Avisos diários ativos às ${String(parsedHour).padStart(2, "0")}:00 (janela de ${parsedLookback}d, régua até Dia ${parsedMaxDays}).`
          : "Os envios automáticos diários foram desativados."
      });
      await fetchOverview(false);
      onDataChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao salvar configurações",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // On-demand Banco Inter audit
  const handleRunAudit = async () => {
    setRunningAudit(true);
    try {
      const parsedLookback = Math.max(1, Math.min(90, Number(lookbackDays) || 15));
      const res = await fetch("/api/minibar/collections/audit-false-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lookbackDays: parsedLookback })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível concluir a auditoria no Banco Inter.");
      }

      const report: MinibarAuditReport = data.report || data;
      setLastAuditReport(report);

      const scanned = Number(report.scannedCount ?? 0);
      const reopened = Number(report.reopenedCount ?? 0);
      const backfilled = Number(report.verifiedBackfilledCount ?? report.backfilledCount ?? 0);
      const flaggedNf = Number(report.flaggedWithInvoiceCount ?? 0);
      const skippedNet = Number(report.skippedOnNetworkErrorCount ?? 0);

      const summaryText =
        `Auditoria concluída: ${scanned} analisado(s), ${reopened} reaberto(s), ` +
        `${backfilled} E2E confirmado(s)${flaggedNf > 0 ? `, ${flaggedNf} c/ NF sinalizado(s)` : ""}` +
        `${skippedNet > 0 ? `, ${skippedNet} ignorado(s) por falha de rede` : ""}.`;

      setStatusAnnouncement(summaryText);
      toast({
        title: reopened > 0 ? "Auditoria concluída com reaberturas" : "Auditoria PIX concluída",
        description: summaryText
      });

      await fetchOverview(false);
      onDataChanged?.();
    } catch (err: any) {
      toast({
        title: "Falha na auditoria do Banco Inter",
        description: err?.message || "Verifique a conexão com o Banco Inter e tente novamente.",
        variant: "destructive"
      });
    } finally {
      setRunningAudit(false);
    }
  };

  // Send reminder now (with live pre-check handling)
  const handleSendNow = async (target: PendingCollectionTarget) => {
    setSendingTargetKey(target.targetKey);
    try {
      const res = await fetch("/api/minibar/collections/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reservationCode: target.reservationCode,
          guestIndex: target.guestIndex
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível disparar a cobrança agora.");
      }

      const settledOnPrecheck = Boolean(
        data.alreadyPaid ||
          data.settled ||
          data.settledOnPrecheck ||
          data.skippedReason === "already_paid" ||
          data.result?.settledOnPrecheck ||
          data.result?.alreadyPaid
      );

      if (settledOnPrecheck) {
        const msg =
          data.message ||
          `Pagamento já confirmado no banco para ${target.guestName} (Flat ${target.flatNumber})! O saldo foi baixado automaticamente e nenhum aviso foi enviado.`;
        setStatusAnnouncement(msg);
        toast({
          title: "Pagamento já estava confirmado no banco!",
          description: msg
        });
      } else {
        const step = data.stepNumber ?? data.step ?? data.result?.stepNumber ?? target.nextStep ?? target.reminderCount + 1;
        const maxD = target.maxDays || Number(maxDays) || 7;
        const channels: string[] = [];
        if (data.whatsappSent ?? data.result?.whatsappSent ?? true) channels.push("WhatsApp");
        if (data.emailSent ?? data.result?.emailSent) channels.push("E-mail");
        const msg =
          data.message ||
          `Aviso Dia ${step}/${maxD} enviado para ${target.guestName} (Flat ${target.flatNumber})${
            channels.length ? ` via ${channels.join(" + ")}` : ""
          }.`;
        setStatusAnnouncement(msg);
        toast({
          title: step >= maxD ? "Aviso Formal (D+7) disparado!" : "Cobrança enviada!",
          description: msg
        });
      }

      await fetchOverview(false);
      onDataChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao enviar cobrança",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setSendingTargetKey(null);
    }
  };

  // Pause / Resume reminders
  const handleTogglePauseDirect = async (
    target: PendingCollectionTarget,
    paused: boolean,
    reason = ""
  ) => {
    setTogglingPauseKey(target.targetKey);
    try {
      const res = await fetch("/api/minibar/collections/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reservationCode: target.reservationCode,
          guestIndex: target.guestIndex,
          paused,
          reason: reason.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível atualizar a pausa dos avisos.");
      }

      const msg = paused
        ? `Avisos diários pausados para ${target.guestName} (Flat ${target.flatNumber}).`
        : `Avisos diários retomados para ${target.guestName} (Flat ${target.flatNumber}).`;
      setStatusAnnouncement(msg);
      toast({
        title: paused ? "Avisos pausados" : "Avisos retomados",
        description: msg
      });
      setPauseModalTarget(null);
      setPauseReason("");
      await fetchOverview(false);
      onDataChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar pausa",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setTogglingPauseKey(null);
    }
  };

  const handleConfirmPauseModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseModalTarget) return;
    setSubmittingPause(true);
    try {
      await handleTogglePauseDirect(pauseModalTarget, true, pauseReason);
    } finally {
      setSubmittingPause(false);
    }
  };

  // Copy payment link
  const handleCopyPaymentLink = async (target: PendingCollectionTarget) => {
    const url = buildAbsolutePaymentUrl(target.paymentUrl, target.reservationCode, target.guestIndex);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTargetKey(target.targetKey);
      setStatusAnnouncement(`Link de pagamento copiado para ${target.guestName}.`);
      toast({
        title: "Link copiado!",
        description: `Link de pagamento do Flat ${target.flatNumber} (${target.guestName}) pronto para colar.`
      });
      setTimeout(() => {
        setCopiedTargetKey((prev) => (prev === target.targetKey ? null : prev));
      }, 2500);
    } catch {
      toast({
        title: "Não foi possível copiar automaticamente",
        description: url,
        variant: "destructive"
      });
    }
  };

  // Manual settle modal
  const openManualSettleForTarget = (target: PendingCollectionTarget) => {
    setManualSettleContext({
      reservationCode: target.reservationCode,
      flatNumber: target.flatNumber,
      guestName: target.guestName,
      guestIndex: target.guestIndex,
      orderId: target.pendingOrderId || undefined,
      defaultAmount: Number(target.pendingAmount || 0),
      mode: "pending_target"
    });
    setManualMethod("pix_avulso");
    setManualAmount(Number(target.pendingAmount || 0).toFixed(2));
    setManualNotes("");
    setManualAmountError(null);
  };

  const openManualSettleForSuspiciousOrder = (order: PaidCollectionOrder) => {
    setManualSettleContext({
      reservationCode: order.reservationCode,
      flatNumber: order.flatNumber,
      guestName: order.guestName,
      guestIndex: Number(order.guestIndex || 1),
      orderId: order.id,
      defaultAmount: Number(order.totalAmount || 0),
      mode: "confirm_suspicious"
    });
    setManualMethod("pix_avulso");
    setManualAmount(Number(order.totalAmount || 0).toFixed(2));
    setManualNotes("Pagamento conferido manualmente no extrato pela gerência.");
    setManualAmountError(null);
  };

  const handleConfirmManualSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSettleContext) return;

    const parsedAmount = Number(String(manualAmount).replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0 || (manualMethod !== "cortesia_admin" && parsedAmount <= 0)) {
      setManualAmountError(
        manualMethod === "cortesia_admin"
          ? "Informe um valor numérico válido (0 ou maior)."
          : "Informe um valor maior que R$ 0,00."
      );
      manualAmountInputRef.current?.focus();
      return;
    }

    setManualAmountError(null);
    setSubmittingManualSettle(true);
    try {
      const res = await fetch("/api/minibar/collections/manual-settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reservationCode: manualSettleContext.reservationCode,
          guestIndex: manualSettleContext.guestIndex,
          orderId: manualSettleContext.orderId || undefined,
          paymentMethod: manualMethod,
          amount: parsedAmount,
          notes: manualNotes.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível registrar a baixa manual.");
      }

      const msg =
        manualSettleContext.mode === "confirm_suspicious"
          ? `Pedido ${manualSettleContext.orderId} confirmado manualmente (${formatPaymentMethodLabel(manualMethod)}).`
          : `Baixa manual de ${formatBRL(parsedAmount)} registrada para ${manualSettleContext.guestName} (Flat ${manualSettleContext.flatNumber}).`;
      setStatusAnnouncement(msg);
      toast({
        title: "Baixa manual registrada!",
        description: msg
      });
      setManualSettleContext(null);
      await fetchOverview(false);
      onDataChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao registrar baixa manual",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setSubmittingManualSettle(false);
    }
  };

  // Reopen paid order modal
  const openReopenModal = (order: PaidCollectionOrder) => {
    setReopenModalOrder(order);
    setReopenReason(
      order.verificationStatus === "unverified_synthetic_e2e"
        ? "Pedido marcado como pago sem endToEndId real do Banco Central — reaberto para cobrança."
        : ""
    );
    setReopenReasonError(null);
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenModalOrder) return;

    const trimmedReason = reopenReason.trim();
    if (trimmedReason.length < 3) {
      setReopenReasonError("Informe o motivo da reabertura (mínimo de 3 caracteres) para registro em auditoria.");
      reopenReasonRef.current?.focus();
      return;
    }

    setReopenReasonError(null);
    setSubmittingReopen(true);
    try {
      const res = await fetch(`/api/minibar/orders/${encodeURIComponent(reopenModalOrder.id)}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: trimmedReason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível reabrir o pedido.");
      }

      const msg =
        data.message ||
        `Pedido ${reopenModalOrder.id} (Flat ${reopenModalOrder.flatNumber}) reaberto como pendente. O saldo foi restaurado para cobrança.`;
      setStatusAnnouncement(msg);
      toast({
        title: "Pedido reaberto como pendente!",
        description: msg
      });
      setReopenModalOrder(null);
      setReopenReason("");
      await fetchOverview(false);
      onDataChanged?.();
    } catch (err: any) {
      toast({
        title: "Erro ao reabrir pedido",
        description: err?.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setSubmittingReopen(false);
    }
  };

  // Filtered lists
  const filteredPendingTargets = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    return pendingTargets.filter((t) => {
      if (pendingStatusFilter === "ativos" && t.paused) return false;
      if (pendingStatusFilter === "pausados" && !t.paused) return false;
      if (pendingStatusFilter === "dia7" && !(t.reminderCount >= t.maxDays || Boolean(t.formalNoticeSentAt))) {
        return false;
      }
      if (pendingStatusFilter === "crm" && !t.crmTagged) return false;
      if (!q) return true;
      return (
        String(t.flatNumber || "").toLowerCase().includes(q) ||
        String(t.guestName || "").toLowerCase().includes(q) ||
        String(t.reservationCode || "").toLowerCase().includes(q) ||
        String(t.itemsSummary || "").toLowerCase().includes(q)
      );
    });
  }, [pendingTargets, pendingSearch, pendingStatusFilter]);

  const filteredRecentPaidOrders = useMemo(() => {
    const q = recentPaidSearch.trim().toLowerCase();
    return recentPaidOrders.filter((o) => {
      if (recentPaidFilter === "unverified" && o.verificationStatus !== "unverified_synthetic_e2e") return false;
      if (
        recentPaidFilter === "verified" &&
        o.verificationStatus !== "verified_e2e" &&
        o.verificationStatus !== "verified_card"
      ) {
        return false;
      }
      if (recentPaidFilter === "manual" && o.verificationStatus !== "manual_confirmed" && !o.manualPaymentConfirmed) {
        return false;
      }
      if (!q) return true;
      return (
        String(o.id || "").toLowerCase().includes(q) ||
        String(o.flatNumber || "").toLowerCase().includes(q) ||
        String(o.guestName || "").toLowerCase().includes(q) ||
        String(o.reservationCode || "").toLowerCase().includes(q) ||
        String(o.itemsSummary || "").toLowerCase().includes(q)
      );
    });
  }, [recentPaidOrders, recentPaidSearch, recentPaidFilter]);

  const parsedManualAmountDisplay = useMemo(() => {
    const v = Number(String(manualAmount).replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? formatBRL(v) : "R$ 0,00";
  }, [manualAmount]);

  const settingsHeadingId = `${uid}-settings-heading`;
  const suspiciousCaptionId = `${uid}-suspicious-caption`;
  const recentPaidCaptionId = `${uid}-recent-paid-caption`;
  const switchEnabledId = `${uid}-reminders-enabled`;
  const hourId = `${uid}-reminder-hour`;
  const hourHelpId = `${uid}-reminder-hour-help`;
  const lookbackId = `${uid}-lookback-days`;
  const lookbackHelpId = `${uid}-lookback-days-help`;
  const maxDaysId = `${uid}-max-days`;
  const maxDaysHelpId = `${uid}-max-days-help`;
  const notifyManagerId = `${uid}-notify-manager`;
  const pendingSearchId = `${uid}-pending-search`;
  const recentSearchId = `${uid}-recent-search`;
  const manualAmountId = `${uid}-manual-amount`;
  const manualAmountErrId = `${uid}-manual-amount-err`;
  const manualNotesId = `${uid}-manual-notes`;
  const reopenReasonId = `${uid}-reopen-reason`;
  const reopenReasonErrId = `${uid}-reopen-reason-err`;
  const pauseReasonId = `${uid}-pause-reason`;

  if (loading) {
    return (
      <Card className="rounded-3xl border border-border p-8 text-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
        <p className="text-xs font-semibold text-muted-foreground">
          Carregando cobranças pós-check-out e auditoria PIX do frigobar...
        </p>
      </Card>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Live region for assistive technology AJAX feedback */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>

      {/* Cabeçalho do Módulo */}
      <div className="bg-card border border-border p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm sm:text-base font-black text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Cobranças Pós-Check-out, Avisos Diários (D+1 a D+7) & Integridade PIX</span>
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Régua automática por cota de hóspede (WhatsApp Sofia + E-mail) com pré-checagem ao vivo no Banco Inter e
            proteção contra baixas sem código E2E real do Banco Central.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchOverview(true)}
          disabled={refreshing}
          className="rounded-xl text-xs font-bold h-9 gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span>Atualizar Painel</span>
        </Button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fetchOverview(true)}
            className="rounded-xl text-xs h-8 shrink-0"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* SEÇÃO A: CONFIGURAÇÃO DOS AVISOS DIÁRIOS (D+1 A D+7) & AUDITORIA INTER */}
      <Card className="rounded-3xl border border-border overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-border bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle id={settingsHeadingId} className="text-sm font-black flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>A. Configuração dos Avisos Diários (D+1 a D+7)</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Lembretes cordiais nos dias 1–3, aviso objetivo nos dias 4–6 e notificação formal CDC + tag CRM no último
                dia.
              </CardDescription>
            </div>
            <Badge
              className={
                remindersEnabled
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold gap-1 self-start sm:self-center"
                  : "bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30 text-[11px] font-bold gap-1 self-start sm:self-center"
              }
            >
              {remindersEnabled ? (
                <>
                  <Bell className="w-3 h-3" />
                  <span>Automação Ativa</span>
                </>
              ) : (
                <>
                  <BellOff className="w-3 h-3" />
                  <span>Automação Pausada</span>
                </>
              )}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-4">
          <form aria-labelledby={settingsHeadingId} onSubmit={handleSaveSettings} noValidate className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Toggle Global */}
              <div className="p-3.5 rounded-2xl border border-border bg-muted/20 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor={switchEnabledId} className="text-xs font-bold cursor-pointer block">
                    Avisos Diários
                  </Label>
                  <span className="text-[11px] text-muted-foreground block">
                    {remindersEnabled ? "Ligado (envio automático)" : "Desligado (somente manual)"}
                  </span>
                </div>
                <Switch
                  id={switchEnabledId}
                  checked={remindersEnabled}
                  onCheckedChange={setRemindersEnabled}
                />
              </div>

              {/* Horário */}
              <div className="space-y-1.5">
                <Label htmlFor={hourId} className="text-xs font-bold">
                  Horário de Envio (0–23h)
                </Label>
                <Input
                  ref={hourInputRef}
                  id={hourId}
                  name="dailyPaymentReminderHour"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={23}
                  value={reminderHour}
                  onChange={(e) => {
                    setReminderHour(e.target.value);
                    if (settingsErrors.hour) setSettingsErrors((prev) => ({ ...prev, hour: undefined }));
                  }}
                  aria-invalid={Boolean(settingsErrors.hour)}
                  aria-describedby={hourHelpId}
                  className="h-9 rounded-xl text-xs font-bold"
                />
                <p
                  id={hourHelpId}
                  className={`text-[10px] ${
                    settingsErrors.hour ? "text-rose-600 font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {settingsErrors.hour || `Horário de Brasília (padrão: 10h)`}
                </p>
              </div>

              {/* Janela de Dias */}
              <div className="space-y-1.5">
                <Label htmlFor={lookbackId} className="text-xs font-bold">
                  Janela de Pendências (dias)
                </Label>
                <Input
                  ref={lookbackInputRef}
                  id={lookbackId}
                  name="dailyPaymentReminderLookbackDays"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  value={lookbackDays}
                  onChange={(e) => {
                    setLookbackDays(e.target.value);
                    if (settingsErrors.lookback) setSettingsErrors((prev) => ({ ...prev, lookback: undefined }));
                  }}
                  aria-invalid={Boolean(settingsErrors.lookback)}
                  aria-describedby={lookbackHelpId}
                  className="h-9 rounded-xl text-xs font-bold"
                />
                <p
                  id={lookbackHelpId}
                  className={`text-[10px] ${
                    settingsErrors.lookback ? "text-rose-600 font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {settingsErrors.lookback || "Retroativo a partir da conferência (padrão: 15)"}
                </p>
              </div>

              {/* Máximo de Dias */}
              <div className="space-y-1.5">
                <Label htmlFor={maxDaysId} className="text-xs font-bold">
                  Duração da Régua (dias)
                </Label>
                <Input
                  ref={maxDaysInputRef}
                  id={maxDaysId}
                  name="dailyPaymentReminderMaxDays"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={maxDays}
                  onChange={(e) => {
                    setMaxDays(e.target.value);
                    if (settingsErrors.maxDays) setSettingsErrors((prev) => ({ ...prev, maxDays: undefined }));
                  }}
                  aria-invalid={Boolean(settingsErrors.maxDays)}
                  aria-describedby={maxDaysHelpId}
                  className="h-9 rounded-xl text-xs font-bold"
                />
                <p
                  id={maxDaysHelpId}
                  className={`text-[10px] ${
                    settingsErrors.maxDays ? "text-rose-600 font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {settingsErrors.maxDays || "D+1 até D+N • Aviso Formal no último dia (padrão: 7)"}
                </p>
              </div>

              {/* Alerta Gestor no D+7 */}
              <div className="p-3.5 rounded-2xl border border-border bg-muted/20 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor={notifyManagerId} className="text-xs font-bold cursor-pointer block">
                    Alertar Gestor no D+{Number(maxDays) || 7}
                  </Label>
                  <span className="text-[10px] text-muted-foreground block truncate" title={managerWhatsApp || ""}>
                    {managerWhatsApp ? `WhatsApp: ${managerWhatsApp}` : "Usa WhatsApp da gerência"}
                  </span>
                </div>
                <Switch
                  id={notifyManagerId}
                  checked={notifyManagerOnDay7}
                  onCheckedChange={setNotifyManagerOnDay7}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingSettings}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5"
                >
                  {savingSettings ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{savingSettings ? "Salvando..." : "Salvar Configurações"}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRunAudit}
                  disabled={runningAudit}
                  className="rounded-xl text-xs font-bold h-9 gap-1.5 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10"
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${runningAudit ? "animate-spin" : ""}`} />
                  <span>{runningAudit ? "Auditando no Banco Inter..." : "Auditar PIX no Banco Inter"}</span>
                </Button>
              </div>

              <span className="text-[11px] text-muted-foreground">
                Pendências antigas sempre iniciam no <strong>Dia 1</strong> (nunca pulam direto para o aviso formal).
              </span>
            </div>
          </form>

          {/* Resultado da Última Auditoria */}
          {lastAuditReport && (
            <div
              role="status"
              aria-live="polite"
              className="p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Última Auditoria PIX (Banco Inter)</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatDateTimeBr(lastAuditReport.ranAt)}
                  {lastAuditReport.triggeredBy ? ` • origem: ${lastAuditReport.triggeredBy}` : ""}
                  {lastAuditReport.lookbackDays ? ` • janela: ${lastAuditReport.lookbackDays}d` : ""}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="font-semibold">
                  Analisados: {Number(lastAuditReport.scannedCount ?? 0)}
                </Badge>
                <Badge
                  className={
                    Number(lastAuditReport.reopenedCount ?? 0) > 0
                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 font-bold"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold"
                  }
                >
                  Reabertos: {Number(lastAuditReport.reopenedCount ?? 0)}
                </Badge>
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold">
                  E2E Confirmados: {Number(lastAuditReport.verifiedBackfilledCount ?? lastAuditReport.backfilledCount ?? 0)}
                </Badge>
                {Number(lastAuditReport.flaggedWithInvoiceCount ?? 0) > 0 && (
                  <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-semibold">
                    Com NF p/ Revisão: {Number(lastAuditReport.flaggedWithInvoiceCount)}
                  </Badge>
                )}
                {Number(lastAuditReport.skippedOnNetworkErrorCount ?? 0) > 0 && (
                  <Badge variant="secondary" className="font-semibold">
                    Ignorados (erro rede): {Number(lastAuditReport.skippedOnNetworkErrorCount)}
                  </Badge>
                )}
              </div>

              {lastAuditReport.message && (
                <p className="text-[11px] text-muted-foreground">{lastAuditReport.message}</p>
              )}

              {Array.isArray(lastAuditReport.reopenedOrders) && lastAuditReport.reopenedOrders.length > 0 && (
                <div className="text-[11px] text-amber-800 dark:text-amber-300">
                  <strong>Pedidos reabertos:</strong>{" "}
                  {lastAuditReport.reopenedOrders
                    .map(
                      (o) =>
                        `${o.id}${o.flatNumber ? ` (Flat ${o.flatNumber})` : ""}${
                          o.totalAmount ? ` ${formatBRL(o.totalAmount)}` : ""
                        }`
                    )
                    .join(" • ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEÇÃO B: ALERTA DE INTEGRIDADE (PEDIDOS PAGOS SEM E2E REAL) */}
      {suspiciousPaidOrders.length > 0 && (
        <Card className="rounded-3xl border-2 border-amber-500/50 bg-amber-500/5 overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b border-amber-500/30 bg-amber-500/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-black text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>B. Alerta de Integridade — Pagamentos PIX sem E2E Real do Banco Central</span>
                  <Badge className="bg-rose-600 text-white text-[10px] font-black">
                    {suspiciousPaidOrders.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  Estes pedidos constam como pagos mas possuem código E2E sintético/ausente. Verifique o extrato do Banco
                  Inter e escolha <strong>Reabrir como Pendente</strong> (para retomar a cobrança) ou{" "}
                  <strong>Confirmar Manualmente</strong> se o dinheiro entrou em conta.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={suspiciousCaptionId}
            className="w-full overflow-x-auto max-h-[420px] overflow-y-auto"
          >
            <table className="w-full min-w-[780px] text-xs text-left border-separate border-spacing-0">
              <caption id={suspiciousCaptionId} className="sr-only">
                Lista de pedidos pagos sem código E2E real do Banco Central que requerem revisão administrativa
              </caption>
              <thead className="sticky top-0 z-10 bg-amber-100/95 dark:bg-amber-950/95 text-amber-950 dark:text-amber-100 font-bold">
                <tr>
                  <th scope="col" className="p-3.5 border-b border-amber-500/30">Pedido / Data</th>
                  <th scope="col" className="p-3.5 border-b border-amber-500/30">Flat / Hóspede</th>
                  <th scope="col" className="p-3.5 border-b border-amber-500/30">Itens</th>
                  <th scope="col" className="p-3.5 border-b border-amber-500/30">Diagnóstico E2E</th>
                  <th scope="col" className="p-3.5 border-b border-amber-500/30 text-right">Valor</th>
                  <th scope="col" className="p-3.5 border-b border-amber-500/30 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-500/20 bg-card/80">
                {suspiciousPaidOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-amber-500/10">
                    <th
                      scope="row"
                      className="p-3.5 font-normal text-left sm:sticky sm:left-0 bg-card/95 border-b border-amber-500/15"
                    >
                      <div className="font-mono font-bold text-foreground">{ord.id}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDateTimeBr(ord.paidAt)}</div>
                      {ord.hasInvoice && (
                        <Badge className="mt-1 bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] gap-1">
                          <FileText className="w-2.5 h-2.5" />
                          <span>NF Anexada</span>
                        </Badge>
                      )}
                    </th>
                    <td className="p-3.5 border-b border-amber-500/15">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="font-bold text-[10px]">
                          Flat {ord.flatNumber}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{ord.reservationCode}</span>
                      </div>
                      <div className="font-bold text-foreground mt-0.5">{ord.guestName}</div>
                    </td>
                    <td className="p-3.5 max-w-[200px] truncate border-b border-amber-500/15" title={ord.itemsSummary || ""}>
                      {ord.itemsSummary || "-"}
                    </td>
                    <td className="p-3.5 border-b border-amber-500/15">
                      {renderVerificationBadge(ord)}
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        E2E: {ord.pixEndToEndId || "ausente"}
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-foreground border-b border-amber-500/15">
                      {formatBRL(ord.totalAmount)}
                    </td>
                    <td className="p-3.5 text-right border-b border-amber-500/15">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openManualSettleForSuspiciousOrder(ord)}
                          className="h-8 rounded-xl text-[11px] font-bold gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirmar Manualmente</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openReopenModal(ord)}
                          className="h-8 rounded-xl text-[11px] font-bold gap-1 bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reabrir como Pendente</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* SEÇÃO C: COBRANÇAS PENDENTES PÓS-CHECK-OUT (POR HÓSPEDE / COTA) */}
      <div className="space-y-4">
        {/* KPIs de Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1">
            <span className="text-[11px] text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>Total Pendente Pós-Check-out</span>
            </span>
            <div className="text-xl font-black text-amber-700 dark:text-amber-300">
              {formatBRL(summary.pendingTotalAmount)}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Soma das cotas em aberto na janela configurada
            </span>
          </Card>

          <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
            <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Cobranças Pendentes</span>
            </span>
            <div className="text-xl font-black text-foreground">{summary.pendingTargetsCount}</div>
            <span className="text-[10px] text-muted-foreground block">Hóspedes / cotas com saldo em aberto</span>
          </Card>

          <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
            <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
              <PauseCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Avisos Pausados</span>
            </span>
            <div className="text-xl font-black text-foreground">{summary.pausedCount}</div>
            <span className="text-[10px] text-muted-foreground block">Excluídos do disparo automático</span>
          </Card>

          <Card
            className={`rounded-3xl border p-4 space-y-1 ${
              summary.day7EscalatedCount > 0
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-border bg-card"
            }`}
          >
            <span
              className={`text-[11px] font-bold flex items-center gap-1.5 ${
                summary.day7EscalatedCount > 0 ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Escalados D+{Number(maxDays) || 7}</span>
            </span>
            <div
              className={`text-xl font-black ${
                summary.day7EscalatedCount > 0 ? "text-rose-700 dark:text-rose-300" : "text-foreground"
              }`}
            >
              {summary.day7EscalatedCount}
            </div>
            <span className="text-[10px] text-muted-foreground block">Aviso formal + tag CRM aplicada</span>
          </Card>
        </div>

        {/* Lista de Pendências */}
        <Card className="rounded-3xl border border-border overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b border-border bg-card space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <Send className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>C. Cobranças Pendentes Pós-Check-out (por Hóspede / Cota)</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {filteredPendingTargets.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Cada cartão representa uma cota individual em aberto. Hóspedes que já pagaram sua parte não aparecem
                  aqui.
                </CardDescription>
              </div>
            </div>

            <search className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-md">
                <Label htmlFor={pendingSearchId} className="sr-only">
                  Buscar cobranças pendentes por flat, hóspede ou reserva
                </Label>
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  id={pendingSearchId}
                  type="search"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Buscar por flat, hóspede, código da reserva ou item..."
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                  className="pl-8 h-9 rounded-xl text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar cobranças pendentes">
                {(
                  [
                    { id: "todos", label: `Todos (${pendingTargets.length})` },
                    { id: "ativos", label: "Ativos" },
                    { id: "pausados", label: `Pausados (${summary.pausedCount})` },
                    { id: "dia7", label: `Dia 7 / Formal (${summary.day7EscalatedCount})` },
                    { id: "crm", label: "Com Tag CRM" }
                  ] as const
                ).map((pill) => (
                  <Button
                    key={pill.id}
                    type="button"
                    size="sm"
                    variant={pendingStatusFilter === pill.id ? "default" : "outline"}
                    aria-pressed={pendingStatusFilter === pill.id}
                    onClick={() => setPendingStatusFilter(pill.id)}
                    className="h-8 rounded-xl text-[11px] font-bold px-2.5"
                  >
                    {pill.label}
                  </Button>
                ))}
              </div>
            </search>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {filteredPendingTargets.length === 0 ? (
              <div className="p-8 text-center space-y-2 rounded-2xl border border-dashed border-border bg-muted/20">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-bold text-foreground">
                  {pendingTargets.length === 0
                    ? "Nenhuma cobrança de frigobar pendente pós-check-out!"
                    : "Nenhuma pendência encontrada para o filtro aplicado."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pendingTargets.length === 0
                    ? "Todos os consumos conferidos dentro da janela estão quitados."
                    : "Limpe a busca ou altere o filtro acima para visualizar outras cotas."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPendingTargets.map((target) => {
                  const targetMaxDays = Number(target.maxDays || maxDays || 7);
                  const isDay7Formal = target.reminderCount >= targetMaxDays || Boolean(target.formalNoticeSentAt);
                  const isMidStage = !isDay7Formal && target.reminderCount >= 4;
                  const splitLabel = formatSplitModeLabel(target.splitMode);
                  const isSending = sendingTargetKey === target.targetKey;
                  const isTogglingPause = togglingPauseKey === target.targetKey;
                  const isCopied = copiedTargetKey === target.targetKey;
                  const isHistoryOpen = expandedHistoryKey === target.targetKey;
                  const historyList = Array.isArray(target.history) ? target.history : [];
                  const itemsText =
                    target.itemsSummary ||
                    (Array.isArray(target.items) && target.items.length > 0
                      ? target.items
                          .map((it) => `${it.quantity ?? 1}x ${it.productName || it.name || "Item"}`)
                          .join(", ")
                      : "Consumo de frigobar");

                  return (
                    <article
                      key={target.targetKey}
                      className={`rounded-2xl border p-4 transition-colors space-y-3 ${
                        isDay7Formal
                          ? "border-rose-500/40 bg-rose-500/5"
                          : target.paused
                          ? "border-border bg-muted/30"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        {/* Identificação + Status */}
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-black text-xs px-2.5 py-0.5">
                              Flat {target.flatNumber}
                            </Badge>
                            <span className="font-mono text-xs font-bold text-primary">
                              {target.reservationCode}
                            </span>

                            {/* Badge Dia X/7 */}
                            {isDay7Formal ? (
                              <Badge className="bg-rose-600 text-white border-rose-700 text-[10px] font-black gap-1">
                                <ShieldAlert className="w-3 h-3 shrink-0" />
                                <span>
                                  Dia {target.reminderCount}/{targetMaxDays} • Aviso Formal
                                </span>
                              </Badge>
                            ) : isMidStage ? (
                              <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40 text-[10px] font-bold gap-1">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>
                                  Dia {target.reminderCount}/{targetMaxDays}
                                </span>
                              </Badge>
                            ) : (
                              <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[10px] font-bold gap-1">
                                <Bell className="w-3 h-3 shrink-0" />
                                <span>
                                  Dia {target.reminderCount}/{targetMaxDays}
                                </span>
                              </Badge>
                            )}

                            {/* Badge Tag CRM */}
                            {target.crmTagged && (
                              <Badge className="bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/40 text-[10px] font-bold gap-1">
                                <Tag className="w-3 h-3 shrink-0" />
                                <span>Tag CRM: Pendência Frigobar</span>
                              </Badge>
                            )}

                            {/* Badge Pausado */}
                            {target.paused && (
                              <Badge className="bg-slate-500/20 text-slate-700 dark:text-slate-200 border border-slate-500/40 text-[10px] font-bold gap-1">
                                <PauseCircle className="w-3 h-3 shrink-0" />
                                <span>Pausado</span>
                              </Badge>
                            )}

                            {splitLabel && (
                              <Badge variant="secondary" className="text-[10px] font-semibold">
                                {splitLabel} • Cota #{target.guestIndex}
                              </Badge>
                            )}
                          </div>

                          {/* Hóspede & Contatos */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className="font-bold text-foreground flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span>{target.guestName}</span>
                              {target.guestRole && (
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  ({target.guestRole})
                                </span>
                              )}
                            </span>

                            {target.guestPhone && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span>{target.guestPhone}</span>
                              </span>
                            )}

                            {target.guestEmail && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span>{target.guestEmail}</span>
                              </span>
                            )}
                          </div>

                          {/* Itens + Conferência + Último envio */}
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p className="text-foreground/90">
                              <strong className="font-semibold text-muted-foreground">Itens:</strong> {itemsText}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                              <span>
                                <strong>Conferência:</strong> {target.referenceDateBr || target.referenceDateYmd || "-"}
                                {typeof target.daysSinceReference === "number"
                                  ? ` (${target.daysSinceReference}d atrás)`
                                  : ""}
                              </span>
                              <span>
                                <strong>Último aviso:</strong>{" "}
                                {target.lastSentAt ? formatDateTimeBr(target.lastSentAt) : "Nenhum enviado ainda"}
                              </span>
                              {target.paused && target.pausedReason && (
                                <span className="text-amber-700 dark:text-amber-300">
                                  <strong>Motivo pausa:</strong> {target.pausedReason}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Valor Pendente */}
                        <div className="flex lg:flex-col items-baseline lg:items-end justify-between gap-1 shrink-0 pt-1 lg:pt-0 border-t lg:border-t-0 border-border">
                          <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                            Valor Pendente
                          </span>
                          <div className="text-lg sm:text-xl font-black font-mono text-amber-700 dark:text-amber-300">
                            {formatBRL(target.pendingAmount)}
                          </div>
                          {typeof target.totalReservationPending === "number" &&
                            target.totalReservationPending > target.pendingAmount + 0.01 && (
                              <span className="text-[10px] text-muted-foreground">
                                Total reserva: {formatBRL(target.totalReservationPending)}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/70">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSendNow(target)}
                            disabled={isSending}
                            className="h-8 rounded-xl text-xs font-bold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            {isSending ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>{isSending ? "Verificando e enviando..." : "Cobrar Agora"}</span>
                          </Button>

                          {target.paused ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isTogglingPause}
                              onClick={() => handleTogglePauseDirect(target, false, "")}
                              className="h-8 rounded-xl text-xs font-bold gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              <span>Retomar Avisos</span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isTogglingPause}
                              onClick={() => {
                                setPauseModalTarget(target);
                                setPauseReason("");
                              }}
                              className="h-8 rounded-xl text-xs font-bold gap-1.5"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>Pausar</span>
                            </Button>
                          )}

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openManualSettleForTarget(target)}
                            className="h-8 rounded-xl text-xs font-bold gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Baixa Manual</span>
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyPaymentLink(target)}
                            className="h-8 rounded-xl text-xs font-bold gap-1.5"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Link Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copiar Link</span>
                              </>
                            )}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.open(
                                buildAbsolutePaymentUrl(target.paymentUrl, target.reservationCode, target.guestIndex),
                                "_blank"
                              )
                            }
                            title="Abrir página de pagamento do hóspede em nova aba"
                            className="h-8 rounded-xl text-xs font-bold gap-1 text-muted-foreground"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="sr-only sm:not-sr-only">Abrir</span>
                          </Button>
                        </div>

                        {historyList.length > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-expanded={isHistoryOpen}
                            onClick={() => setExpandedHistoryKey(isHistoryOpen ? null : target.targetKey)}
                            className="h-8 rounded-xl text-[11px] font-bold gap-1 text-muted-foreground"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Histórico ({historyList.length})</span>
                          </Button>
                        )}
                      </div>

                      {/* Histórico de Envios */}
                      {isHistoryOpen && historyList.length > 0 && (
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/70 space-y-1.5 text-[11px]">
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-primary" />
                            <span>Histórico de Avisos Disparados</span>
                          </div>
                          <ul className="space-y-1">
                            {historyList.map((entry, idx) => (
                              <li
                                key={`${target.targetKey}-h-${idx}`}
                                className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground border-b last:border-b-0 border-border/40 pb-1 last:pb-0"
                              >
                                <span className="font-semibold text-foreground">
                                  Dia {entry.step ?? idx + 1}
                                  {entry.formalNotice ? " (Aviso Formal CDC)" : ""}
                                </span>
                                <span>
                                  {[
                                    entry.whatsappSent ? "WhatsApp" : null,
                                    entry.emailSent ? "E-mail" : null,
                                    entry.channel || null
                                  ]
                                    .filter(Boolean)
                                    .join(" + ") || "Disparado"}
                                </span>
                                <span className="font-mono">{formatDateTimeBr(entry.sentAt || entry.date)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO D: PEDIDOS PAGOS RECENTES (REABERTURA MANUAL & AUDITORIA E2E) */}
      <Card className="rounded-3xl border border-border overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-border bg-card space-y-3">
          <div>
            <CardTitle className="text-sm font-black flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>D. Pedidos Pagos Recentes (Verificação E2E & Reabertura Manual)</span>
              <Badge variant="secondary" className="text-[10px]">
                {filteredRecentPaidOrders.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Acompanhe o selo de verificação bancária de cada pagamento e reabra manualmente caso identifique alguma
              divergência.
            </CardDescription>
          </div>

          <search className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Label htmlFor={recentSearchId} className="sr-only">
                Buscar pedidos pagos recentes por ID, flat, hóspede ou reserva
              </Label>
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                id={recentSearchId}
                type="search"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Buscar por pedido, flat, hóspede ou reserva..."
                value={recentPaidSearch}
                onChange={(e) => setRecentPaidSearch(e.target.value)}
                className="pl-8 h-9 rounded-xl text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar pedidos pagos por verificação">
              {(
                [
                  { id: "todos", label: "Todos" },
                  { id: "unverified", label: "⚠ Sem E2E Real" },
                  { id: "verified", label: "✓ Verificados" },
                  { id: "manual", label: "Baixa Manual" }
                ] as const
              ).map((pill) => (
                <Button
                  key={pill.id}
                  type="button"
                  size="sm"
                  variant={recentPaidFilter === pill.id ? "default" : "outline"}
                  aria-pressed={recentPaidFilter === pill.id}
                  onClick={() => setRecentPaidFilter(pill.id)}
                  className="h-8 rounded-xl text-[11px] font-bold px-2.5"
                >
                  {pill.label}
                </Button>
              ))}
            </div>
          </search>
        </CardHeader>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={recentPaidCaptionId}
          className="w-full overflow-x-auto max-h-[540px] overflow-y-auto"
        >
          <table className="w-full min-w-[820px] text-xs text-left border-separate border-spacing-0">
            <caption id={recentPaidCaptionId} className="sr-only">
              Pedidos de frigobar pagos recentemente com status de verificação E2E e ação de reabertura manual
            </caption>
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-muted-foreground font-bold">
              <tr>
                <th scope="col" className="p-3.5 border-b border-border">Pedido / Pago em</th>
                <th scope="col" className="p-3.5 border-b border-border">Flat / Hóspede</th>
                <th scope="col" className="p-3.5 border-b border-border">Itens</th>
                <th scope="col" className="p-3.5 border-b border-border">Verificação</th>
                <th scope="col" className="p-3.5 border-b border-border">Método / NF</th>
                <th scope="col" className="p-3.5 border-b border-border text-right">Valor</th>
                <th scope="col" className="p-3.5 border-b border-border text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRecentPaidOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Nenhum pedido pago recente encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredRecentPaidOrders.map((ord) => (
                  <tr
                    key={ord.id}
                    className={
                      ord.verificationStatus === "unverified_synthetic_e2e"
                        ? "bg-amber-500/5 hover:bg-amber-500/10"
                        : "hover:bg-muted/20"
                    }
                  >
                    <th
                      scope="row"
                      className="p-3.5 font-normal text-left sm:sticky sm:left-0 bg-card border-b border-border/60"
                    >
                      <div className="font-mono font-bold text-primary">{ord.id}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDateTimeBr(ord.paidAt)}</div>
                    </th>
                    <td className="p-3.5 border-b border-border/60">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="font-bold text-[10px]">
                          Flat {ord.flatNumber}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{ord.reservationCode}</span>
                      </div>
                      <div className="font-bold text-foreground mt-0.5">{ord.guestName}</div>
                    </td>
                    <td className="p-3.5 max-w-[200px] truncate border-b border-border/60" title={ord.itemsSummary || ""}>
                      {ord.itemsSummary || "-"}
                    </td>
                    <td className="p-3.5 border-b border-border/60">{renderVerificationBadge(ord)}</td>
                    <td className="p-3.5 border-b border-border/60">
                      <div className="font-semibold text-foreground">{formatPaymentMethodLabel(ord.paymentMethod)}</div>
                      {ord.hasInvoice || ord.invoiceStatus === "anexada" ? (
                        <span className="text-[10px] text-sky-700 dark:text-sky-300 font-semibold">NF Emitida</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Sem NF anexada</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-foreground border-b border-border/60">
                      {formatBRL(ord.totalAmount)}
                    </td>
                    <td className="p-3.5 text-right border-b border-border/60">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openReopenModal(ord)}
                        className="h-8 rounded-xl text-[11px] font-bold gap-1 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reabrir como Pendente</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* DIALOG 1: PAUSAR AVISOS */}
      <Dialog open={Boolean(pauseModalTarget)} onOpenChange={(open) => !open && setPauseModalTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6 overscroll-contain">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <PauseCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Pausar Avisos Diários</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pauseModalTarget
                ? `Interrompe temporariamente os disparos automáticos para ${pauseModalTarget.guestName} (Flat ${pauseModalTarget.flatNumber} • ${pauseModalTarget.reservationCode}).`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmPauseModal} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor={pauseReasonId} className="text-xs font-bold">
                Motivo da Pausa (opcional)
              </Label>
              <Textarea
                id={pauseReasonId}
                autoFocus
                rows={3}
                placeholder="Ex.: Hóspede informou que fará o pagamento na sexta-feira / em análise pela recepção..."
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPauseModalTarget(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submittingPause}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>{submittingPause ? "Pausando..." : "Confirmar Pausa"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: BAIXA MANUAL / CONFIRMAÇÃO MANUAL */}
      <Dialog open={Boolean(manualSettleContext)} onOpenChange={(open) => !open && setManualSettleContext(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6 overscroll-contain">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                {manualSettleContext?.mode === "confirm_suspicious"
                  ? "Confirmar Pagamento Manualmente"
                  : "Registrar Baixa Manual de Frigobar"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {manualSettleContext
                ? `Flat ${manualSettleContext.flatNumber} • ${manualSettleContext.reservationCode} • ${manualSettleContext.guestName}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmManualSettle} noValidate className="space-y-4 pt-1">
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-foreground mb-1.5">
                Forma de Recebimento <span aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MANUAL_PAYMENT_OPTIONS.map((opt) => {
                  const optId = `${uid}-method-${opt.value}`;
                  const checked = manualMethod === opt.value;
                  return (
                    <label
                      key={opt.value}
                      htmlFor={optId}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        checked
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <input
                        id={optId}
                        type="radio"
                        name="manualPaymentMethod"
                        value={opt.value}
                        checked={checked}
                        onChange={() => setManualMethod(opt.value)}
                        className="mt-0.5 accent-emerald-600"
                      />
                      <span className="space-y-0.5">
                        <span className="text-xs font-bold text-foreground block leading-tight">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground block leading-tight">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor={manualAmountId} className="text-xs font-bold">
                Valor Recebido (R$) <span aria-hidden="true">*</span>
              </Label>
              <Input
                ref={manualAmountInputRef}
                id={manualAmountId}
                name="manualAmount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={manualAmount}
                onChange={(e) => {
                  setManualAmount(e.target.value);
                  if (manualAmountError) setManualAmountError(null);
                }}
                aria-invalid={Boolean(manualAmountError)}
                aria-describedby={manualAmountError ? manualAmountErrId : undefined}
                className="h-10 rounded-xl text-xs font-mono font-bold"
              />
              {manualAmountError && (
                <p id={manualAmountErrId} role="alert" className="text-[11px] text-rose-600 font-semibold">
                  {manualAmountError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={manualNotesId} className="text-xs font-bold">
                Observação / Comprovante (auditoria)
              </Label>
              <Textarea
                id={manualNotesId}
                name="manualNotes"
                rows={3}
                placeholder="Ex.: Comprovante PIX recebido no WhatsApp da recepção em 19/11 às 14h20..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setManualSettleContext(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submittingManualSettle}
                className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {submittingManualSettle
                    ? "Registrando..."
                    : `Confirmar Baixa (${parsedManualAmountDisplay})`}
                </span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: REABRIR PEDIDO COMO PENDENTE (CONFIRMAÇÃO DESTRUTIVA) */}
      <Dialog open={Boolean(reopenModalOrder)} onOpenChange={(open) => !open && setReopenModalOrder(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6 overscroll-contain">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <RotateCcw className="w-5 h-5 shrink-0" />
              <span>Reabrir Pedido como Pendente?</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação reverte o status de pagamento para <strong>pendente</strong>, restaura o saldo nos lançamentos e
              inspeções do flat e libera a cobrança ao hóspede a partir do Dia 1.
            </DialogDescription>
          </DialogHeader>

          {reopenModalOrder && (
            <form onSubmit={handleConfirmReopen} noValidate className="space-y-4 pt-1">
              <div className="p-3 rounded-2xl bg-muted/50 border border-border text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-primary">{reopenModalOrder.id}</span>
                  <span className="font-mono font-black text-foreground">
                    {formatBRL(reopenModalOrder.totalAmount)}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Flat <strong>{reopenModalOrder.flatNumber}</strong> • {reopenModalOrder.reservationCode} •{" "}
                  <strong>{reopenModalOrder.guestName}</strong>
                </div>
                {reopenModalOrder.hasInvoice && (
                  <div className="mt-2 p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-[11px] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Atenção:</strong> este pedido possui Nota Fiscal anexada. Confirme se o pagamento
                      realmente não entrou antes de reabrir.
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={reopenReasonId} className="text-xs font-bold">
                  Motivo da Reabertura <span aria-hidden="true">*</span>
                </Label>
                <Textarea
                  ref={reopenReasonRef}
                  id={reopenReasonId}
                  name="reopenReason"
                  required
                  rows={3}
                  placeholder="Descreva o motivo (ex.: conferido no extrato do Banco Inter e PIX não consta como pago)..."
                  value={reopenReason}
                  onChange={(e) => {
                    setReopenReason(e.target.value);
                    if (reopenReasonError) setReopenReasonError(null);
                  }}
                  aria-invalid={Boolean(reopenReasonError)}
                  aria-describedby={reopenReasonError ? reopenReasonErrId : undefined}
                  className="rounded-xl text-xs"
                />
                {reopenReasonError && (
                  <p id={reopenReasonErrId} role="alert" className="text-[11px] text-rose-600 font-semibold">
                    {reopenReasonError}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  autoFocus
                  variant="outline"
                  onClick={() => setReopenModalOrder(null)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submittingReopen}
                  className="rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{submittingReopen ? "Reabrindo..." : "Confirmar Reabertura"}</span>
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
