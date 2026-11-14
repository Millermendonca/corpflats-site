import React, { useMemo } from "react";
import {
  ClipboardList,
  Moon,
  DollarSign,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { UnifiedReservationRow, formatCurrencyBRL } from "./types";

interface ReservationsKpiStripProps {
  rows: UnifiedReservationRow[];
  todayStr: string;
  activeFinancialFilter: string;
  onTogglePendingBalanceFilter: () => void;
}

export const ReservationsKpiStrip: React.FC<ReservationsKpiStripProps> = ({
  rows,
  todayStr,
  activeFinancialFilter,
  onTogglePendingBalanceFilter,
}) => {
  const stats = useMemo(() => {
    let activeCount = 0;
    let cancelledOrExpiredCount = 0;
    let arrivedTodaySystemCount = 0;
    let totalNights = 0;
    let grossAmount = 0;
    let paidAmount = 0;
    let netAmount = 0;
    let balanceDue = 0;
    let pendingCount = 0;

    for (const r of rows) {
      const recDate = r.receivedAtIso ? r.receivedAtIso.slice(0, 10) : "";
      if (recDate === todayStr) arrivedTodaySystemCount++;

      if (r.canonicalStatus === "cancelada" || r.canonicalStatus === "expirada") {
        cancelledOrExpiredCount++;
        continue;
      }

      activeCount++;
      totalNights += Number(r.nights) || 0;
      grossAmount += Number(r.totalAmount) || 0;
      paidAmount += Number(r.paidAmount) || 0;
      netAmount += Number(r.netAmount) || 0;
      if ((Number(r.balanceDue) || 0) > 0.01) {
        balanceDue += Number(r.balanceDue) || 0;
        pendingCount++;
      }
    }

    const avgAdr = totalNights > 0 ? grossAmount / totalNights : 0;

    return {
      totalRows: rows.length,
      activeCount,
      cancelledOrExpiredCount,
      arrivedTodaySystemCount,
      totalNights,
      avgAdr,
      grossAmount,
      paidAmount,
      netAmount,
      balanceDue,
      pendingCount,
    };
  }, [rows, todayStr]);

  const isBalanceFilterActive = activeFinancialFilter === "has_balance";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* 1. Total de Reservas no Filtro */}
      <Card className="p-3.5 rounded-2xl border border-border/80 bg-card shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Reservas no Filtro
          </span>
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ClipboardList className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5">
          <div className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
            {stats.totalRows}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <strong className="text-emerald-600 dark:text-emerald-400">{stats.activeCount}</strong> válidas
            {stats.arrivedTodaySystemCount > 0 ? ` • +${stats.arrivedTodaySystemCount} hoje` : ""}
            {stats.cancelledOrExpiredCount > 0 ? ` • ${stats.cancelledOrExpiredCount} canc/exp` : ""}
          </p>
        </div>
      </Card>

      {/* 2. Noites Vendidas & ADR */}
      <Card className="p-3.5 rounded-2xl border border-border/80 bg-card shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Diárias / Noites
          </span>
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Moon className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5">
          <div className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
            {stats.totalNights} <span className="text-xs font-semibold text-muted-foreground">noites</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            ADR médio: <strong className="text-foreground">{formatCurrencyBRL(stats.avgAdr)}</strong>
          </p>
        </div>
      </Card>

      {/* 3. Receita Bruta */}
      <Card className="p-3.5 rounded-2xl border border-border/80 bg-card shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Receita Bruta
          </span>
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5">
          <div className="text-lg sm:text-xl font-black text-foreground tracking-tight truncate">
            {formatCurrencyBRL(stats.grossAmount)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Líquido est.: <strong className="text-foreground">{formatCurrencyBRL(stats.netAmount)}</strong>
          </p>
        </div>
      </Card>

      {/* 4. Valor Recebido / Garantido */}
      <Card className="p-3.5 rounded-2xl border border-border/80 bg-card shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Pago / Garantido
          </span>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5">
          <div className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight truncate">
            {formatCurrencyBRL(stats.paidAmount)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Quitado ou garantido via OTA
          </p>
        </div>
      </Card>

      {/* 5. Saldo a Receber (1-click filter) */}
      <Card
        onClick={onTogglePendingBalanceFilter}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTogglePendingBalanceFilter();
          }
        }}
        title="Clique para filtrar rapidamente apenas as reservas com saldo a receber"
        className={`p-3.5 rounded-2xl border shadow-2xs flex flex-col justify-between cursor-pointer transition-all select-none col-span-2 sm:col-span-1 ${
          isBalanceFilterActive
            ? "border-amber-500 ring-2 ring-amber-500/30 bg-amber-50/60 dark:bg-amber-950/30"
            : stats.balanceDue > 0
              ? "border-amber-300/70 dark:border-amber-800/70 hover:border-amber-500 bg-card"
              : "border-border/80 hover:border-primary/40 bg-card"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Saldo a Receber
          </span>
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5">
          <div
            className={`text-lg sm:text-xl font-black tracking-tight truncate ${
              stats.balanceDue > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {formatCurrencyBRL(stats.balanceDue)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {stats.pendingCount > 0
              ? `${stats.pendingCount} reserva(s) pendente(s) • Clique p/ filtrar`
              : "Nenhum saldo aberto no filtro"}
          </p>
        </div>
      </Card>
    </div>
  );
};
