import React, { useState, useMemo } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageCircle,
  Link2,
  CalendarDays,
  FileText,
  MoreHorizontal,
  Coffee,
  IdCard,
  Car,
  Receipt,
  Copy,
  ExternalLink,
  Edit3,
  CreditCard,
  ShieldAlert,
  RotateCcw,
  LogIn,
  LogOut,
  Eye,
  Sparkles,
  Download,
  Printer,
  Send,
  X,
  Building2,
  AlertTriangle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WhatsAppQuickMessage } from "@/hooks/use-quick-messages";
import {
  UnifiedReservationRow,
  SortField,
  SortDirection,
  TableDensity,
  OptionalColumnKey,
  CHANNEL_BADGE_MAP,
  STATUS_BADGE_MAP,
  formatCurrencyBRL,
  formatDateBrShort,
  formatArrivalTimestamp,
  formatPaymentMethodLabel,
} from "./types";

interface ReservationsDataTableProps {
  rows: UnifiedReservationRow[];
  todayStr: string;
  nowMs: number;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  density: TableDensity;
  visibleColumns: OptionalColumnKey[];
  newArrivalUids: Set<string>;
  selectedUids: Set<string>;
  onToggleSelectRow: (uid: string) => void;
  onToggleSelectAllVisible: (uids: string[], select: boolean) => void;
  onClearSelection: () => void;
  onSelectRowDrawer: (row: UnifiedReservationRow) => void;
  onOpenFullEdit: (row: UnifiedReservationRow) => void;
  onReactivateExpired: (row: UnifiedReservationRow) => void;
  onResolveQuarantine: (row: UnifiedReservationRow) => void;
  onQuickCheckin: (row: UnifiedReservationRow) => Promise<void>;
  onQuickCheckout: (row: UnifiedReservationRow) => Promise<void>;
  onUndoCheckout: (row: UnifiedReservationRow) => Promise<void>;
  onLocateInMap: (row: UnifiedReservationRow) => void;
  onOpenInternalChat: (row: UnifiedReservationRow) => void;
  onOpenExternalWa: (row: UnifiedReservationRow) => void;
  onTriggerQuickMessage: (row: UnifiedReservationRow, qm: WhatsAppQuickMessage) => void;
  activeQuickMessages: WhatsAppQuickMessage[];
  onCopyPortalLink: (row: UnifiedReservationRow) => void;
  onCopyPreCheckinLink: (row: UnifiedReservationRow) => void;
  onCopyBreakfastLink: (row: UnifiedReservationRow) => void;
  onOpenPortalNewTab: (row: UnifiedReservationRow) => void;
  onCopySummaryText: (row: UnifiedReservationRow) => void;
  onCopyCode: (text: string, label?: string) => void;
  onOpenNfseHub: (row: UnifiedReservationRow) => void;
  onOpenPaymentsHub: (row: UnifiedReservationRow) => void;
  onOpenSecureCard: (row: UnifiedReservationRow) => void;
  onExportSelectedCsv: () => void;
  onPrintSelected: () => void;
  onBroadcastSelected: () => void;
  canBroadcast?: boolean;
}

export const ReservationsDataTable: React.FC<ReservationsDataTableProps> = ({
  rows,
  todayStr,
  nowMs,
  sortField,
  sortDirection,
  onSortChange,
  density,
  visibleColumns,
  newArrivalUids,
  selectedUids,
  onToggleSelectRow,
  onToggleSelectAllVisible,
  onClearSelection,
  onSelectRowDrawer,
  onOpenFullEdit,
  onReactivateExpired,
  onResolveQuarantine,
  onQuickCheckin,
  onQuickCheckout,
  onUndoCheckout,
  onLocateInMap,
  onOpenInternalChat,
  onOpenExternalWa,
  onTriggerQuickMessage,
  activeQuickMessages,
  onCopyPortalLink,
  onCopyPreCheckinLink,
  onCopyBreakfastLink,
  onOpenPortalNewTab,
  onCopySummaryText,
  onCopyCode,
  onOpenNfseHub,
  onOpenPaymentsHub,
  onOpenSecureCard,
  onExportSelectedCsv,
  onPrintSelected,
  onBroadcastSelected,
  canBroadcast = true,
}) => {
  const [pageSize, setPageSize] = useState<number>(100);
  const [page, setPage] = useState<number>(1);
  const [busyActionUid, setBusyActionUid] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  const visibleUids = useMemo(() => visibleRows.map((r) => r.uid), [visibleRows]);
  const allVisibleSelected =
    visibleUids.length > 0 && visibleUids.every((u) => selectedUids.has(u));

  const selectedSummary = useMemo(() => {
    if (selectedUids.size === 0) return { count: 0, nights: 0, gross: 0 };
    let nights = 0;
    let gross = 0;
    for (const r of rows) {
      if (selectedUids.has(r.uid)) {
        nights += Number(r.nights) || 0;
        gross += Number(r.totalAmount) || 0;
      }
    }
    return { count: selectedUids.size, nights, gross };
  }, [rows, selectedUids]);

  const showCol = (k: OptionalColumnKey) => visibleColumns.includes(k);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-90" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary" />
    );
  };

  const getAriaSort = (field: SortField): "none" | "ascending" | "descending" => {
    if (sortField !== field) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  const renderFinancialBadge = (row: UnifiedReservationRow) => {
    if (row.canonicalStatus === "cancelada" || row.canonicalStatus === "expirada") {
      return (
        <span className="text-[10px] text-muted-foreground font-medium">
          Sem cobrança ativa
        </span>
      );
    }
    switch (row.financialBadge) {
      case "pago_ota":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            ✓ Pago via OTA
          </span>
        );
      case "pago":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            ✓ Quitado
          </span>
        );
      case "faturado_pj":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">
            🏢 Faturado ({formatCurrencyBRL(row.balanceDue)})
          </span>
        );
      case "cobrar_hotel":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-400">
            🏨 Cobrar {formatCurrencyBRL(row.balanceDue)}
          </span>
        );
      case "parcial":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-400">
            ⏳ Falta {formatCurrencyBRL(row.balanceDue)}
          </span>
        );
      default:
        return row.balanceDue > 0.01 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-600 dark:text-rose-400">
            ⏳ Pendente {formatCurrencyBRL(row.balanceDue)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            ✓ Quitado
          </span>
        );
    }
  };

  const renderContextualQuickButton = (row: UnifiedReservationRow) => {
    const isBusy = busyActionUid === row.uid;

    if (row.sourceType === "quarantine" || row.canonicalStatus === "quarantine") {
      return (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onResolveQuarantine(row);
          }}
          className="h-7 px-2 text-[11px] font-extrabold bg-rose-600 hover:bg-rose-700 text-white rounded-lg gap-1 shadow-2xs"
          title="Resolver conflito e alocar Flat para esta reserva OTA"
        >
          <ShieldAlert className="w-3 h-3" />
          <span>Alocar Flat</span>
        </Button>
      );
    }

    if (row.canonicalStatus === "expirada") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onReactivateExpired(row);
          }}
          className="h-7 px-2 text-[11px] font-bold border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg gap-1"
          title="Reativar pré-reserva expirada com 1 clique"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reativar</span>
        </Button>
      );
    }

    if (
      row.canonicalStatus === "pre_reserva" ||
      (row.balanceDue > 0.01 &&
        row.canonicalStatus !== "cancelada" &&
        row.financialBadge !== "faturado_pj")
    ) {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onCopyPortalLink(row);
          }}
          className="h-7 px-2 text-[11px] font-bold border-amber-400/90 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100/80 rounded-lg gap-1"
          title="Copiar link de pagamento PIX/Cartão do Portal Minha Reserva"
        >
          <CreditCard className="w-3 h-3" />
          <span>PIX / Cobrar</span>
        </Button>
      );
    }

    if (
      row.checkinDate === todayStr &&
      !row.isCheckedIn &&
      row.canonicalStatus === "confirmada"
    ) {
      return (
        <Button
          size="sm"
          disabled={isBusy}
          onClick={async (e) => {
            e.stopPropagation();
            setBusyActionUid(row.uid);
            try {
              await onQuickCheckin(row);
            } finally {
              setBusyActionUid(null);
            }
          }}
          className="h-7 px-2 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1"
          title="Confirmar entrada / Check-in presencial do hóspede"
        >
          <LogIn className="w-3 h-3" />
          <span>{isBusy ? "..." : "Check-in"}</span>
        </Button>
      );
    }

    if (
      row.canonicalStatus === "hospedado" &&
      row.checkoutDate <= todayStr &&
      !row.checkoutDone
    ) {
      return (
        <Button
          size="sm"
          disabled={isBusy}
          onClick={async (e) => {
            e.stopPropagation();
            setBusyActionUid(row.uid);
            try {
              await onQuickCheckout(row);
            } finally {
              setBusyActionUid(null);
            }
          }}
          className="h-7 px-2 text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg gap-1"
          title="Registrar saída / Check-out e liberar apartamento para governança"
        >
          <LogOut className="w-3 h-3" />
          <span>{isBusy ? "..." : "Check-out"}</span>
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onSelectRowDrawer(row);
        }}
        className="h-7 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-lg gap-1"
        title="Abrir Gaveta Lateral 360° da reserva"
      >
        <Eye className="w-3 h-3" />
        <span>Ver 360°</span>
      </Button>
    );
  };

  return (
    <div className="space-y-3 relative">
      {/* CSS Reativo de Densidade (design-token-reactivity com :where() zero-specificity) + Responsive Table */}
      <style>{`
        .gfm-res-table-region {
          container-type: inline-size;
        }
        :where([data-density="comfortable"]) .gfm-res-cell {
          padding-block: 0.65rem;
          padding-inline: 0.75rem;
        }
        :where([data-density="compact"]) .gfm-res-cell {
          padding-block: 0.35rem;
          padding-inline: 0.6rem;
          font-size: 11.5px;
        }
        .gfm-horizontal-fade-scroller {
          scrollbar-width: thin;
        }
      `}</style>

      <div
        role="region"
        aria-label="Tabela Central de Reservas por Ordem de Chegada"
        tabIndex={0}
        data-density={density}
        className="gfm-res-table-region rounded-2xl border border-border/80 bg-card shadow-xs overflow-x-auto max-h-[74vh] overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <tr className="text-[11px] font-black uppercase tracking-wider text-muted-foreground select-none">
              <th scope="col" className="w-9 px-3 py-2.5 text-center">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) =>
                    onToggleSelectAllVisible(visibleUids, Boolean(checked))
                  }
                  aria-label="Selecionar todas as reservas visíveis"
                />
              </th>

              <th scope="col" aria-sort={getAriaSort("receivedAt")} className="px-3 py-2.5 min-w-[148px]">
                <button
                  type="button"
                  onClick={() => onSortChange("receivedAt")}
                  className="inline-flex items-center gap-1 hover:text-foreground group cursor-pointer"
                  title="Ordenar pela data/hora em que a reserva caiu no sistema"
                >
                  <span>Chegada / Código</span>
                  {renderSortIcon("receivedAt")}
                </button>
              </th>

              <th scope="col" className="px-2.5 py-2.5 min-w-[105px]">
                Canal
              </th>

              <th scope="col" aria-sort={getAriaSort("guestName")} className="px-3 py-2.5 min-w-[190px]">
                <button
                  type="button"
                  onClick={() => onSortChange("guestName")}
                  className="inline-flex items-center gap-1 hover:text-foreground group cursor-pointer"
                >
                  <span>Hóspede</span>
                  {renderSortIcon("guestName")}
                </button>
              </th>

              {showCol("company") && (
                <th scope="col" className="px-3 py-2.5 min-w-[140px]">
                  Empresa / Agência
                </th>
              )}

              {showCol("guestDoc") && (
                <th scope="col" className="px-3 py-2.5 min-w-[125px]">
                  CPF / Doc
                </th>
              )}

              <th scope="col" aria-sort={getAriaSort("flatNumber")} className="px-2.5 py-2.5 min-w-[92px]">
                <button
                  type="button"
                  onClick={() => onSortChange("flatNumber")}
                  className="inline-flex items-center gap-1 hover:text-foreground group cursor-pointer"
                >
                  <span>Flat</span>
                  {renderSortIcon("flatNumber")}
                </button>
              </th>

              <th scope="col" aria-sort={getAriaSort("checkinDate")} className="px-3 py-2.5 min-w-[168px]">
                <button
                  type="button"
                  onClick={() => onSortChange("checkinDate")}
                  className="inline-flex items-center gap-1 hover:text-foreground group cursor-pointer"
                  title="Ordenar por data de Check-in"
                >
                  <span>Check-in → Saída</span>
                  {renderSortIcon("checkinDate")}
                </button>
              </th>

              <th scope="col" className="px-2.5 py-2.5 min-w-[104px] text-center">
                Operação
              </th>

              <th scope="col" aria-sort={getAriaSort("totalAmount")} className="px-3 py-2.5 min-w-[138px] text-right">
                <button
                  type="button"
                  onClick={() => onSortChange("totalAmount")}
                  className="inline-flex items-center justify-end gap-1 hover:text-foreground group cursor-pointer ml-auto"
                >
                  <span>Financeiro</span>
                  {renderSortIcon("totalAmount")}
                </button>
              </th>

              {showCol("netAmount") && (
                <th scope="col" aria-sort={getAriaSort("netAmount")} className="px-3 py-2.5 min-w-[115px] text-right">
                  <button
                    type="button"
                    onClick={() => onSortChange("netAmount")}
                    className="inline-flex items-center justify-end gap-1 hover:text-foreground group cursor-pointer ml-auto"
                  >
                    <span>Líquido Est.</span>
                    {renderSortIcon("netAmount")}
                  </button>
                </th>
              )}

              {showCol("adr") && (
                <th scope="col" aria-sort={getAriaSort("adr")} className="px-3 py-2.5 min-w-[105px] text-right">
                  <button
                    type="button"
                    onClick={() => onSortChange("adr")}
                    className="inline-flex items-center justify-end gap-1 hover:text-foreground group cursor-pointer ml-auto"
                  >
                    <span>ADR</span>
                    {renderSortIcon("adr")}
                  </button>
                </th>
              )}

              {showCol("paymentMethod") && (
                <th scope="col" className="px-3 py-2.5 min-w-[120px]">
                  Pagamento
                </th>
              )}

              {showCol("createdBy") && (
                <th scope="col" className="px-3 py-2.5 min-w-[130px]">
                  Origem / Autor
                </th>
              )}

              <th scope="col" aria-sort={getAriaSort("status")} className="px-2.5 py-2.5 min-w-[126px]">
                <button
                  type="button"
                  onClick={() => onSortChange("status")}
                  className="inline-flex items-center gap-1 hover:text-foreground group cursor-pointer"
                >
                  <span>Status</span>
                  {renderSortIcon("status")}
                </button>
              </th>

              <th scope="col" className="px-3 py-2.5 min-w-[235px] text-right">
                Ações Rápidas
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60 text-xs">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-16 text-center text-muted-foreground">
                  Nenhuma reserva encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const arrival = formatArrivalTimestamp(row.receivedAtIso, nowMs);
                const isLiveNew = newArrivalUids.has(row.uid) || arrival.isRecent;
                const isSelected = selectedUids.has(row.uid);
                const chanMeta = CHANNEL_BADGE_MAP[row.channel] || {
                  label: row.rawChannel || "Direto",
                  shortLabel: row.rawChannel || "Direto",
                  className: "bg-slate-700 text-white border-slate-800",
                  dotClass: "bg-slate-600",
                };
                const stMeta =
                  STATUS_BADGE_MAP[row.canonicalStatus] || STATUS_BADGE_MAP.confirmada;

                const isCancelledOrExpired =
                  row.canonicalStatus === "cancelada" ||
                  row.canonicalStatus === "expirada";

                const isArrivingToday =
                  row.checkinDate === todayStr && !isCancelledOrExpired;
                const isDepartingToday =
                  row.checkoutDate === todayStr && !isCancelledOrExpired;

                return (
                  <tr
                    key={row.uid}
                    onClick={() => onSelectRowDrawer(row)}
                    className={`transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-primary/8 hover:bg-primary/12"
                        : row.canonicalStatus === "quarantine"
                          ? "bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          : isLiveNew
                            ? "bg-emerald-50/40 dark:bg-emerald-950/15 hover:bg-muted/50"
                            : isCancelledOrExpired
                              ? "opacity-70 hover:opacity-100 hover:bg-muted/40"
                              : "hover:bg-muted/45"
                    }`}
                  >
                    {/* Checkbox */}
                    <td
                      className="gfm-res-cell text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelectRow(row.uid)}
                        aria-label={`Selecionar reserva ${row.code}`}
                      />
                    </td>

                    {/* 1. Chegada no Sistema + Código */}
                    <td className="gfm-res-cell whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground">
                          {arrival.relative}
                        </span>
                        {isLiveNew && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-600 text-white animate-pulse">
                            <Sparkles className="w-2.5 h-2.5" />
                            NOVA
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <span>{arrival.exact}</span>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyCode(
                              row.externalOrderId || row.code,
                              row.externalOrderId ? "Pedido OTA" : "Código da Reserva"
                            );
                          }}
                          className="font-mono font-bold text-foreground/85 hover:text-primary inline-flex items-center gap-0.5 cursor-pointer"
                          title="Clique para copiar o código"
                        >
                          <span>{row.code}</span>
                          <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70" />
                        </button>
                      </div>
                    </td>

                    {/* 2. Canal */}
                    <td className="gfm-res-cell whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border shadow-2xs ${chanMeta.className}`}
                      >
                        {chanMeta.label}
                      </span>
                      {row.externalOrderId && row.externalOrderId !== row.code && (
                        <div
                          className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate max-w-[110px]"
                          title={`ID Canal: ${row.externalOrderId}`}
                        >
                          #{row.externalOrderId}
                        </div>
                      )}
                    </td>

                    {/* 3. Hóspede & Alertas */}
                    <td className="gfm-res-cell max-w-[230px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground truncate">
                          {row.guestName}
                        </span>
                        {row.isMonthlyGuest && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-indigo-400 text-indigo-600 shrink-0">
                            Mensalista
                          </Badge>
                        )}
                        {row.riskAttentionAlert && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent className="text-xs max-w-xs">
                              {row.riskAttentionReason || "Atenção operacional nesta reserva"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 truncate">
                        <span className="inline-flex items-center gap-0.5 shrink-0">
                          <Users className="w-2.5 h-2.5" />
                          {row.guestCount}
                        </span>
                        {row.guestPhone && (
                          <>
                            <span>•</span>
                            <span className="truncate">{row.guestPhone}</span>
                          </>
                        )}
                        {!showCol("company") && row.companyName && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-violet-600 dark:text-violet-400 truncate">
                              {row.companyName}
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Coluna Extra: Empresa / Agência */}
                    {showCol("company") && (
                      <td className="gfm-res-cell max-w-[160px] truncate">
                        {row.companyName || row.agencyName ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300 truncate">
                            <Building2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">{row.companyName || row.agencyName}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}

                    {/* Coluna Extra: CPF / Doc */}
                    {showCol("guestDoc") && (
                      <td className="gfm-res-cell font-mono text-[11px] whitespace-nowrap">
                        {row.guestDocument || <span className="text-muted-foreground">—</span>}
                      </td>
                    )}

                    {/* 4. Flat */}
                    <td className="gfm-res-cell whitespace-nowrap">
                      {row.flatNumber ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted/80 border border-border font-black text-foreground">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              row.cleaningStatusToday === "dirty"
                                ? "bg-rose-500"
                                : row.cleaningStatusToday === "cleaning_now"
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-emerald-500"
                            }`}
                            title={
                              row.cleaningStatusToday === "dirty"
                                ? "Flat Sujo hoje"
                                : row.cleaningStatusToday === "cleaning_now"
                                  ? "Em limpeza agora"
                                  : "Flat Limpo"
                            }
                          />
                          <span>{row.flatNumber}</span>
                        </div>
                      ) : (
                        <Badge className="bg-rose-600 text-white text-[10px] font-bold">
                          Sem Flat
                        </Badge>
                      )}
                    </td>

                    {/* 5. Estadia (Check-in -> Check-out + Noites) */}
                    <td className="gfm-res-cell whitespace-nowrap">
                      <div className="flex items-center gap-1 font-bold text-foreground">
                        <span
                          className={
                            isArrivingToday
                              ? "text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500/60"
                              : ""
                          }
                        >
                          {formatDateBrShort(row.checkinDate)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span
                          className={
                            isDepartingToday
                              ? "text-sky-600 dark:text-sky-400 underline decoration-sky-500/60"
                              : ""
                          }
                        >
                          {formatDateBrShort(row.checkoutDate)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <span>
                          {row.nights} {row.nights === 1 ? "noite" : "noites"}
                        </span>
                        {isArrivingToday && (
                          <span className="px-1 py-0 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                            Entra hoje
                          </span>
                        )}
                        {isDepartingToday && (
                          <span className="px-1 py-0 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold">
                            Sai hoje
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 6. Micro-Ícones Operacionais [☕ 🪪 🚗 🧾] */}
                    <td className="gfm-res-cell whitespace-nowrap text-center">
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center border ${
                                row.includeBreakfast
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/50"
                                  : "bg-muted/30 text-muted-foreground/35 border-transparent"
                              }`}
                            >
                              <Coffee className="w-3.5 h-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {row.includeBreakfast ? "☕ Café da manhã incluso" : "Sem café da manhã"}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center border ${
                                row.fnrhCompleted
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/50"
                                  : "bg-muted/40 text-muted-foreground/50 border-border/50"
                              }`}
                            >
                              <IdCard className="w-3.5 h-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {row.fnrhCompleted
                              ? "🪪 Pré-Check-in / FNRH preenchido"
                              : "Pré-Check-in / FNRH pendente"}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center border ${
                                row.vehiclePlate
                                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400/50"
                                  : "bg-muted/30 text-muted-foreground/35 border-transparent"
                              }`}
                            >
                              <Car className="w-3.5 h-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {row.vehiclePlate
                              ? `🚗 Veículo: ${row.vehicleSummary || row.vehiclePlate}`
                              : "Sem veículo cadastrado"}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`w-6 h-6 rounded-md inline-flex items-center justify-center border ${
                                row.invoiceIssued
                                  ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-400/50"
                                  : row.autoEmitInvoice
                                    ? "bg-violet-500/10 text-violet-600 border-violet-300/50"
                                    : "bg-muted/30 text-muted-foreground/35 border-transparent"
                              }`}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {row.invoiceIssued
                              ? `🧾 NFS-e emitida (#${row.invoiceNumber || "OK"})`
                              : row.autoEmitInvoice
                                ? "🧾 Emissão automática de NFS-e ativada"
                                : "NFS-e ainda não emitida"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </td>

                    {/* 7. Financeiro (Total Bruto + Saldo) */}
                    <td className="gfm-res-cell whitespace-nowrap text-right">
                      <div className="font-black text-foreground">
                        {formatCurrencyBRL(row.totalAmount)}
                      </div>
                      <div className="mt-0.5">{renderFinancialBadge(row)}</div>
                    </td>

                    {/* Coluna Extra: Líquido Estimado */}
                    {showCol("netAmount") && (
                      <td className="gfm-res-cell whitespace-nowrap text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {formatCurrencyBRL(row.netAmount)}
                      </td>
                    )}

                    {/* Coluna Extra: ADR */}
                    {showCol("adr") && (
                      <td className="gfm-res-cell whitespace-nowrap text-right font-semibold text-muted-foreground">
                        {formatCurrencyBRL(row.adr)}
                      </td>
                    )}

                    {/* Coluna Extra: Forma de Pagto */}
                    {showCol("paymentMethod") && (
                      <td className="gfm-res-cell whitespace-nowrap text-[11px]">
                        {formatPaymentMethodLabel(row.paymentMethod)}
                      </td>
                    )}

                    {/* Coluna Extra: Criado Por */}
                    {showCol("createdBy") && (
                      <td className="gfm-res-cell max-w-[140px] truncate text-[11px] text-muted-foreground">
                        {row.createdByName}
                      </td>
                    )}

                    {/* 8. Status */}
                    <td className="gfm-res-cell whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${stMeta.className}`}
                      >
                        {stMeta.label}
                      </span>
                      {row.quarantineReason && (
                        <div
                          className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5 truncate max-w-[135px]"
                          title={row.quarantineDiagnostic || row.quarantineReason}
                        >
                          {row.quarantineReason}
                        </div>
                      )}
                    </td>

                    {/* 9. Mini Botões de Ação Rápida na Linha */}
                    <td
                      className="gfm-res-cell whitespace-nowrap text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        {/* ⚡ Botão Dinâmico Contextual */}
                        {renderContextualQuickButton(row)}

                        {/* 💬 WhatsApp Rápido + Mensagens Z-API */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-emerald-600 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              title="WhatsApp Rápido (Chat interno ou Mensagens Rápidas Z-API)"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel className="text-[11px]">
                              💬 Comunicação WhatsApp
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => onOpenInternalChat(row)}
                              className="text-xs font-semibold gap-2 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                              Abrir no WhatsApp Web Interno
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onOpenExternalWa(row)}
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                              Abrir no WhatsApp Externo (wa.me)
                            </DropdownMenuItem>

                            {row.sourceType === "pms" && activeQuickMessages.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Disparo Rápido Z-API
                                </DropdownMenuLabel>
                                <div className="max-h-52 overflow-y-auto">
                                  {activeQuickMessages.map((qm) => (
                                    <DropdownMenuItem
                                      key={qm.id}
                                      onClick={() => onTriggerQuickMessage(row, qm)}
                                      className="text-xs gap-2 cursor-pointer"
                                    >
                                      <span>{qm.icon || "⚡"}</span>
                                      <span className="truncate">{qm.title}</span>
                                    </DropdownMenuItem>
                                  ))}
                                </div>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* 🔗 Copiar Links do Hóspede */}
                        {row.sourceType === "pms" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-lg"
                                title="Copiar links do Portal do Hóspede / Pré-Check-in / FNRH"
                              >
                                <Link2 className="w-3.5 h-3.5 text-sky-600" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              <DropdownMenuLabel className="text-[11px]">
                                🔗 Links do Hóspede ({row.code})
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => onCopyPortalLink(row)}
                                className="text-xs font-semibold gap-2 cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5 text-primary" />
                                Copiar Portal Minha Reserva
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onCopyPreCheckinLink(row)}
                                className="text-xs gap-2 cursor-pointer"
                              >
                                <IdCard className="w-3.5 h-3.5 text-emerald-600" />
                                Copiar Link Pré-Check-in / FNRH
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onCopyBreakfastLink(row)}
                                className="text-xs gap-2 cursor-pointer"
                              >
                                <Coffee className="w-3.5 h-3.5 text-amber-600" />
                                Copiar Link Café da Manhã
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => onOpenPortalNewTab(row)}
                                className="text-xs gap-2 cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Abrir Portal em Nova Guia
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {/* 📅 Localizar no Mapa */}
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => onLocateInMap(row)}
                          className="h-7 w-7 rounded-lg"
                          title="Localizar reserva no Mapa de Ocupação (Calendário PMS)"
                        >
                          <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                        </Button>

                        {/* 🧾 Nota Fiscal / Financeiro Rápido */}
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            row.hasCardVault
                              ? onOpenSecureCard(row)
                              : onOpenNfseHub(row)
                          }
                          className="h-7 w-7 rounded-lg"
                          title={
                            row.hasCardVault
                              ? "Ver Cartão Virtual OTA (Cofre Seguro)"
                              : "Abrir Hub de Nota Fiscal (NFS-e) / Financeiro"
                          }
                        >
                          {row.hasCardVault ? (
                            <CreditCard className="w-3.5 h-3.5 text-violet-600" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-amber-600" />
                          )}
                        </Button>

                        {/* ⋯ Menu Mais Ações ("e mais") */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg"
                              title="Mais ações rápidas da reserva"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem
                              onClick={() => onSelectRowDrawer(row)}
                              className="text-xs font-semibold gap-2 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-primary" />
                              Abrir Gaveta 360°
                            </DropdownMenuItem>

                            {row.sourceType === "pms" && (
                              <DropdownMenuItem
                                onClick={() => onOpenFullEdit(row)}
                                className="text-xs font-semibold gap-2 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                                Edição Completa no PMS
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                              onClick={() => onCopySummaryText(row)}
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copiar Resumo p/ WhatsApp
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() =>
                                onCopyCode(
                                  row.externalOrderId || row.code,
                                  "Identificador"
                                )
                              }
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copiar Código ({row.externalOrderId || row.code})
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => onOpenNfseHub(row)}
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-600" />
                              Hub de Notas Fiscais (NFS-e)
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => onOpenPaymentsHub(row)}
                              className="text-xs gap-2 cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                              Pagamentos, PIX & Boletos
                            </DropdownMenuItem>

                            {row.hasCardVault && (
                              <DropdownMenuItem
                                onClick={() => onOpenSecureCard(row)}
                                className="text-xs font-semibold text-violet-700 dark:text-violet-300 gap-2 cursor-pointer"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Revelar Cartão Virtual (Cofre OTA)
                              </DropdownMenuItem>
                            )}

                            {row.sourceType === "pms" && row.checkoutDone && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => onUndoCheckout(row)}
                                  className="text-xs text-amber-700 dark:text-amber-300 gap-2 cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Desfazer Check-out
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação & Controle de Linhas por Página */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Exibindo{" "}
            <strong className="text-foreground">
              {rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, rows.length)}
            </strong>{" "}
            de <strong className="text-foreground">{rows.length}</strong> reservas
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-7 w-28 text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50" className="text-xs">50 / pág</SelectItem>
              <SelectItem value="100" className="text-xs">100 / pág</SelectItem>
              <SelectItem value="250" className="text-xs">250 / pág</SelectItem>
              <SelectItem value="1000" className="text-xs">1000 / pág</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2.5 text-xs rounded-lg"
            >
              Anterior
            </Button>
            <span className="px-2 font-semibold text-foreground">
              Página {safePage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2.5 text-xs rounded-lg"
            >
              Próxima
            </Button>
          </div>
        )}
      </div>

      {/* Barra Flutuante de Ações em Massa (Estilo Cloudbeds) */}
      {selectedSummary.count > 0 && (
        <div className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 flex flex-wrap items-center gap-3 max-w-[95vw]">
          <div className="flex items-center gap-2 text-xs pr-2 border-r border-slate-700">
            <Badge className="bg-primary text-primary-foreground font-black">
              {selectedSummary.count}
            </Badge>
            <span className="font-bold">selecionada(s)</span>
            <span className="hidden sm:inline text-slate-300">
              • {selectedSummary.nights} noites • {formatCurrencyBRL(selectedSummary.gross)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={onExportSelectedCsv}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onPrintSelected}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir Relação</span>
            </Button>
            {canBroadcast && (
              <Button
                size="sm"
                onClick={onBroadcastSelected}
                className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Disparo WhatsApp</span>
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={onClearSelection}
              className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700 rounded-xl"
              title="Limpar seleção"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
