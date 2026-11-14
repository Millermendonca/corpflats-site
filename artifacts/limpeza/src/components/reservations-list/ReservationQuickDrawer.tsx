import React, { useState, useEffect } from "react";
import {
  ChevronUp,
  ChevronDown,
  Edit3,
  MessageCircle,
  Copy,
  ExternalLink,
  CalendarDays,
  Building2,
  User,
  Phone,
  Mail,
  IdCard,
  Coffee,
  Car,
  Receipt,
  CreditCard,
  LogIn,
  LogOut,
  RotateCcw,
  History,
  Send,
  RefreshCw,
  Clock,
  BedDouble,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhatsAppQuickMessage } from "@/hooks/use-quick-messages";
import { useToast } from "@/hooks/use-toast";
import {
  UnifiedReservationRow,
  CHANNEL_BADGE_MAP,
  STATUS_BADGE_MAP,
  formatCurrencyBRL,
  formatDateBrFull,
  formatArrivalTimestamp,
  formatPaymentMethodLabel,
} from "./types";

interface ReservationQuickDrawerProps {
  row: UnifiedReservationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayStr: string;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onOpenFullEdit: (row: UnifiedReservationRow) => void;
  onReactivateExpired: (row: UnifiedReservationRow) => void;
  onQuickCheckin: (row: UnifiedReservationRow) => Promise<void>;
  onQuickCheckout: (row: UnifiedReservationRow) => Promise<void>;
  onUndoCheckout: (row: UnifiedReservationRow) => Promise<void>;
  onLocateInMap: (row: UnifiedReservationRow) => void;
  onOpenInternalChat: (row: UnifiedReservationRow) => void;
  onTriggerQuickMessage: (row: UnifiedReservationRow, qm: WhatsAppQuickMessage) => void;
  activeQuickMessages: WhatsAppQuickMessage[];
  onCopyPortalLink: (row: UnifiedReservationRow) => void;
  onCopyPreCheckinLink: (row: UnifiedReservationRow) => void;
  onOpenPortalNewTab: (row: UnifiedReservationRow) => void;
  onOpenNfseHub: (row: UnifiedReservationRow) => void;
  onOpenPaymentsHub: (row: UnifiedReservationRow) => void;
  onOpenSecureCard: (row: UnifiedReservationRow) => void;
}

export const ReservationQuickDrawer: React.FC<ReservationQuickDrawerProps> = ({
  row,
  open,
  onOpenChange,
  todayStr,
  hasPrev,
  hasNext,
  onNavigatePrev,
  onNavigateNext,
  onOpenFullEdit,
  onReactivateExpired,
  onQuickCheckin,
  onQuickCheckout,
  onUndoCheckout,
  onLocateInMap,
  onOpenInternalChat,
  onTriggerQuickMessage,
  activeQuickMessages,
  onCopyPortalLink,
  onCopyPreCheckinLink,
  onOpenPortalNewTab,
  onOpenNfseHub,
  onOpenPaymentsHub,
  onOpenSecureCard,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "financial" | "history">("overview");
  const [auditData, setAuditData] = useState<any | null>(null);
  const [commsList, setCommsList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resendingCommId, setResendingCommId] = useState<string | number | null>(null);
  const [busyOp, setBusyOp] = useState(false);

  useEffect(() => {
    if (!open) {
      setActiveTab("overview");
    }
  }, [open]);

  // Navegação rápida pelo teclado (Alt + Setas ↑/↓) estilo Mews / Cloudbeds
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowUp" && hasPrev) {
        e.preventDefault();
        onNavigatePrev();
      } else if (e.altKey && e.key === "ArrowDown" && hasNext) {
        e.preventDefault();
        onNavigateNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, hasPrev, hasNext, onNavigatePrev, onNavigateNext]);

  // Carrega Comunicações e Logs sob demanda quando a aba Histórico é aberta
  useEffect(() => {
    if (!open || !row || row.sourceType !== "pms" || activeTab !== "history") return;
    let cancelled = false;
    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const refCode = encodeURIComponent(row.code || String(row.id));
        const [auditRes, commRes] = await Promise.all([
          fetch(`/api/pms/reservations/${refCode}/audit-logs`, { credentials: "include" }),
          fetch(`/api/pms/reservations/${refCode}/communications`, { credentials: "include" }),
        ]);
        if (!cancelled) {
          if (auditRes.ok) {
            setAuditData(await auditRes.json());
          }
          if (commRes.ok) {
            const cj = await commRes.json();
            setCommsList(Array.isArray(cj) ? cj : cj?.communications || cj?.items || []);
          }
        }
      } catch {
        // Silent fallback
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [open, row?.uid, activeTab]);

  if (!row) return null;

  const chanMeta = CHANNEL_BADGE_MAP[row.channel] || {
    label: row.rawChannel || "Direto",
    shortLabel: row.rawChannel || "Direto",
    className: "bg-slate-700 text-white border-slate-800",
    dotClass: "bg-slate-600",
  };
  const stMeta = STATUS_BADGE_MAP[row.canonicalStatus] || STATUS_BADGE_MAP.confirmada;
  const arrival = formatArrivalTimestamp(row.receivedAtIso);

  const handleResendComm = async (commId: string | number) => {
    setResendingCommId(commId);
    try {
      const res = await fetch(`/api/pms/reservations/communications/${commId}/resend`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Comunicação reenviada com sucesso!" });
      } else {
        toast({ title: "Não foi possível reenviar", variant: "destructive" });
      }
    } finally {
      setResendingCommId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col">
        {/* Cabeçalho Fixo com Navegação ↑/↓ e Edição Completa */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xs border-b px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pr-7">
            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!hasPrev}
                  onClick={onNavigatePrev}
                  className="h-6 w-6 rounded-md"
                  title="Reserva anterior na lista (Alt + ↑)"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!hasNext}
                  onClick={onNavigateNext}
                  className="h-6 w-6 rounded-md"
                  title="Próxima reserva na lista (Alt + ↓)"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </div>

              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${chanMeta.className}`}>
                {chanMeta.label}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${stMeta.className}`}>
                {stMeta.label}
              </span>
            </div>

            {row.sourceType === "pms" && (
              <Button
                size="sm"
                onClick={() => onOpenFullEdit(row)}
                className="h-8 px-3 text-xs font-bold gap-1.5 rounded-xl shadow-xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edição Completa
              </Button>
            )}
          </div>

          <SheetHeader className="text-left space-y-0.5">
            <SheetTitle className="text-lg font-black text-foreground flex items-center gap-2 flex-wrap">
              <span>{row.guestName}</span>
              {row.flatNumber && (
                <Badge variant="outline" className="text-xs font-black">
                  Flat {row.flatNumber}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription className="text-xs flex flex-wrap items-center gap-1.5">
              <span className="font-mono font-semibold text-foreground">{row.code}</span>
              {row.externalOrderId && row.externalOrderId !== row.code && (
                <span>• Pedido OTA #{row.externalOrderId}</span>
              )}
              <span>• Recebida {arrival.relative} ({arrival.exact})</span>
            </SheetDescription>
          </SheetHeader>

          {/* Barra Rápida de Ações Principais */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenInternalChat(row)}
              className="h-7 text-xs font-bold gap-1 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 rounded-lg"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Chat WhatsApp
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopyPortalLink(row)}
              className="h-7 text-xs font-semibold gap-1 rounded-lg"
            >
              <Copy className="w-3 h-3 text-primary" />
              Portal Hóspede
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopyPreCheckinLink(row)}
              className="h-7 text-xs font-semibold gap-1 rounded-lg"
            >
              <IdCard className="w-3 h-3 text-emerald-600" />
              Link FNRH
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onLocateInMap(row)}
              className="h-7 text-xs font-semibold gap-1 rounded-lg"
            >
              <CalendarDays className="w-3 h-3 text-indigo-600" />
              Ver no Mapa
            </Button>

            {row.canonicalStatus === "expirada" && (
              <Button
                size="sm"
                onClick={() => onReactivateExpired(row)}
                className="h-7 text-xs font-bold gap-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
              >
                <RotateCcw className="w-3 h-3" />
                Reativar
              </Button>
            )}

            {row.checkinDate === todayStr && !row.isCheckedIn && row.canonicalStatus === "confirmada" && (
              <Button
                size="sm"
                disabled={busyOp}
                onClick={async () => {
                  setBusyOp(true);
                  try {
                    await onQuickCheckin(row);
                  } finally {
                    setBusyOp(false);
                  }
                }}
                className="h-7 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
              >
                <LogIn className="w-3 h-3" />
                Fazer Check-in
              </Button>
            )}

            {row.canonicalStatus === "hospedado" && !row.checkoutDone && (
              <Button
                size="sm"
                disabled={busyOp}
                onClick={async () => {
                  setBusyOp(true);
                  try {
                    await onQuickCheckout(row);
                  } finally {
                    setBusyOp(false);
                  }
                }}
                className="h-7 text-xs font-bold gap-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg"
              >
                <LogOut className="w-3 h-3" />
                Fazer Check-out
              </Button>
            )}

            {row.checkoutDone && (
              <Button
                variant="outline"
                size="sm"
                disabled={busyOp}
                onClick={async () => {
                  setBusyOp(true);
                  try {
                    await onUndoCheckout(row);
                  } finally {
                    setBusyOp(false);
                  }
                }}
                className="h-7 text-xs font-semibold gap-1 rounded-lg"
              >
                <RotateCcw className="w-3 h-3" />
                Desfazer Saída
              </Button>
            )}
          </div>
        </div>

        {/* Conteúdo em Abas */}
        <div className="p-5 flex-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid grid-cols-3 w-full rounded-xl">
              <TabsTrigger value="overview" className="text-xs font-bold">
                Resumo & Operação
              </TabsTrigger>
              <TabsTrigger value="financial" className="text-xs font-bold">
                Financeiro & NF
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs font-bold">
                Histórico & Logs
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: RESUMO & OPERAÇÃO */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Card Estadia */}
              <div className="rounded-2xl border p-3.5 bg-muted/20 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Check-in ({row.checkinTime})
                  </span>
                  <span className="font-black text-sm text-foreground">
                    {formatDateBrFull(row.checkinDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Check-out ({row.checkoutTime})
                  </span>
                  <span className="font-black text-sm text-foreground">
                    {formatDateBrFull(row.checkoutDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Duração & Hóspedes
                  </span>
                  <span className="font-black text-sm text-foreground">
                    {row.nights} noite(s) • {row.guestCount} pax
                  </span>
                </div>
              </div>

              {/* Dados do Titular & Empresa */}
              <div className="rounded-2xl border p-3.5 space-y-2 text-xs">
                <div className="font-black uppercase tracking-wider text-[10px] text-muted-foreground">
                  Titular & Vínculo Corporativo
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-semibold">{row.guestName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{row.guestPhone || "Sem telefone"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{row.guestEmail || "Sem e-mail"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IdCard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono">{row.guestDocument || "CPF não informado"}</span>
                  </div>
                </div>
                {(row.companyName || row.agencyName) && (
                  <div className="pt-2 border-t flex items-center gap-2 text-violet-700 dark:text-violet-300 font-bold">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{row.companyName || row.agencyName}</span>
                  </div>
                )}
              </div>

              {/* Checklist Operacional */}
              <div className="rounded-2xl border p-3.5 space-y-2.5 text-xs">
                <div className="font-black uppercase tracking-wider text-[10px] text-muted-foreground">
                  Checklist Operacional da Estadia
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl border bg-background flex items-center gap-2">
                    <Coffee className={`w-4 h-4 ${row.includeBreakfast ? "text-amber-600" : "text-muted-foreground/40"}`} />
                    <div>
                      <div className="font-bold">{row.includeBreakfast ? "Com Café Incluso" : "Sem Café"}</div>
                      <div className="text-[10px] text-muted-foreground">Regime alimentar</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl border bg-background flex items-center gap-2">
                    <IdCard className={`w-4 h-4 ${row.fnrhCompleted ? "text-emerald-600" : "text-amber-600"}`} />
                    <div>
                      <div className="font-bold">{row.fnrhCompleted ? "FNRH Concluída" : "FNRH Pendente"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.hasDocPhoto ? "Doc anexado" : "Sem foto de doc"}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl border bg-background flex items-center gap-2">
                    <Car className={`w-4 h-4 ${row.vehiclePlate ? "text-sky-600" : "text-muted-foreground/40"}`} />
                    <div>
                      <div className="font-bold">{row.vehiclePlate || "Sem Veículo"}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {row.vehicleModel || "Garagem"}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl border bg-background flex items-center gap-2">
                    <BedDouble className="w-4 h-4 text-indigo-600" />
                    <div>
                      <div className="font-bold">
                        {row.twinBeds ? "2 Camas Solteiro" : "Cama Casal Padrão"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.extraMattress ? "+ Colchão Extra" : "Sem colchão extra"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observações & Pedidos Especiais */}
              {(row.notes || row.receptionNotes || row.specialRequests) && (
                <div className="rounded-2xl border p-3.5 bg-amber-50/40 dark:bg-amber-950/20 space-y-1.5 text-xs">
                  <div className="font-black uppercase tracking-wider text-[10px] text-amber-800 dark:text-amber-300">
                    Observações & Pedidos Especiais
                  </div>
                  {row.specialRequests && <p><strong>Pedido do Hóspede:</strong> {row.specialRequests}</p>}
                  {row.receptionNotes && <p><strong>Nota de Portaria:</strong> {row.receptionNotes}</p>}
                  {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
                </div>
              )}

              {/* Disparo Rápido Z-API direto da Gaveta */}
              {row.sourceType === "pms" && activeQuickMessages.length > 0 && (
                <div className="rounded-2xl border p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase tracking-wider text-[10px] text-muted-foreground">
                      Disparar Mensagem Rápida WhatsApp (Z-API)
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => onOpenPortalNewTab(row)}
                      className="h-auto p-0 text-[11px] gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Abrir Portal do Hóspede
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeQuickMessages.slice(0, 8).map((qm) => (
                      <Button
                        key={qm.id}
                        variant="outline"
                        size="sm"
                        onClick={() => onTriggerQuickMessage(row, qm)}
                        className="h-7 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
                      >
                        <span>{qm.icon || "⚡"}</span>
                        <span>{qm.title}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ABA 2: FINANCEIRO & FISCAL */}
            <TabsContent value="financial" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-2xl border p-3 bg-muted/20">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Valor Bruto Total</div>
                  <div className="text-lg font-black text-foreground mt-0.5">
                    {formatCurrencyBRL(row.totalAmount)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    ADR: {formatCurrencyBRL(row.adr)} / noite
                  </div>
                </div>

                <div className="rounded-2xl border p-3 bg-emerald-500/5 border-emerald-500/20">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Valor Quitado</div>
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatCurrencyBRL(row.paidAmount)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Método: {formatPaymentMethodLabel(row.paymentMethod)}
                  </div>
                </div>

                <div className="rounded-2xl border p-3">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Saldo a Receber</div>
                  <div
                    className={`text-lg font-black mt-0.5 ${
                      row.balanceDue > 0.01 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrencyBRL(row.balanceDue)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Cobrança: {row.paymentCollect === "Channel" ? "Pelo Canal (OTA)" : "Direto no Hotel"}
                  </div>
                </div>

                <div className="rounded-2xl border p-3">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Líquido Estimado</div>
                  <div className="text-lg font-black text-foreground mt-0.5">
                    {formatCurrencyBRL(row.netAmount)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Taxa/Comissão est.: {formatCurrencyBRL(row.commissionAmount)}
                  </div>
                </div>
              </div>

              {row.hasCardVault && (
                <div className="rounded-2xl border border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/25 p-3.5 flex items-center justify-between gap-3">
                  <div className="text-xs">
                    <div className="font-bold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      Cartão Virtual / Garantia OTA Disponível
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.cardBrand || "Cartão"} final {row.cardLast4 || "****"}
                      {row.cardExpMonth && row.cardExpYear ? ` • Val. ${row.cardExpMonth}/${row.cardExpYear}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onOpenSecureCard(row)}
                    className="h-8 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl shrink-0"
                  >
                    Revelar Cartão
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenNfseHub(row)}
                  className="h-9 text-xs font-bold gap-1.5 rounded-xl flex-1"
                >
                  <Receipt className="w-4 h-4 text-amber-600" />
                  {row.invoiceIssued
                    ? `Ver NFS-e Emitida (#${row.invoiceNumber || "OK"})`
                    : "Emitir Nota Fiscal (NFS-e)"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenPaymentsHub(row)}
                  className="h-9 text-xs font-bold gap-1.5 rounded-xl flex-1"
                >
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  Central de Pagamentos & PIX
                </Button>
              </div>
            </TabsContent>

            {/* ABA 3: COMUNICAÇÕES & AUDITORIA */}
            <TabsContent value="history" className="space-y-4 mt-4">
              {loadingHistory ? (
                <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Carregando histórico de comunicações e auditoria...
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border p-3.5 space-y-2 text-xs">
                    <div className="font-black uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      Mensagens & E-mails Enviados ({commsList.length})
                    </div>
                    {commsList.length === 0 ? (
                      <p className="text-muted-foreground text-[11px]">
                        Nenhum disparo automático registrado ainda para esta reserva.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {commsList.slice(0, 12).map((c: any) => (
                          <div
                            key={c.id}
                            className="p-2 rounded-xl border bg-muted/20 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate">
                                {c.title || c.templateName || c.event || "Comunicação"}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {c.channel || "WhatsApp"} • {c.sentAt || c.createdAt || ""}
                              </div>
                            </div>
                            {c.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={resendingCommId === c.id}
                                onClick={() => handleResendComm(c.id)}
                                className="h-7 px-2 text-[11px] shrink-0"
                              >
                                Reenviar
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border p-3.5 space-y-2 text-xs">
                    <div className="font-black uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />
                      Trilha de Auditoria
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pb-1">
                      <Clock className="w-3 h-3" />
                      <span>Origem: <strong>{row.createdByName}</strong> em {arrival.exact}</span>
                    </div>
                    {Array.isArray(auditData?.auditLogs) && auditData.auditLogs.length > 0 ? (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {[...auditData.auditLogs].reverse().slice(0, 15).map((log: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-xl border bg-background text-[11px]">
                            <div className="font-semibold text-foreground">
                              {log.description || log.action}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {log.actor?.name || "Sistema"} • {log.timestamp ? new Date(log.timestamp).toLocaleString("pt-BR") : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-[11px]">Sem eventos adicionais na auditoria.</p>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};
