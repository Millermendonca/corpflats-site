import React, { useId, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Percent,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Table as TableIcon
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type MinibarDelinquencyPeriod = "30d" | "90d" | "month" | "all";

export interface MinibarAgingBucket {
  key: "d1_3" | "d4_7" | "d8_15" | "over_15" | string;
  label: string;
  subLabel: string;
  count: number;
  amount: number;
}

export interface MinibarMonthlyEvolutionPoint {
  month: string;
  label: string;
  consumedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  delinquencyRatePct: number;
  reservationsCount: number;
  delinquentCount: number;
}

export interface MinibarDelinquencyStatsData {
  period: MinibarDelinquencyPeriod;
  periodLabel: string;
  monthsWindow: number;
  totalReservationsWithConsumption: number;
  delinquentReservationsCount: number;
  delinquentSharesCount: number;
  delinquencyRateByReservationPct: number;
  totalConsumedAmount: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
  delinquencyRateByValuePct: number;
  paidWithoutReminderCount: number;
  paidWithoutReminderAmount: number;
  spontaneousPaidAmount: number;
  remindedTotalCount: number;
  recoveredAfterReminderCount: number;
  recoveredAfterReminderAmount: number;
  recoveredPaidAmount: number;
  recoveryRatePct: number;
  chronicOverdueCount: number;
  chronicOverdueAmount: number;
  agingBuckets: MinibarAgingBucket[];
  monthlyEvolution: MinibarMonthlyEvolutionPoint[];
}

export interface MinibarDelinquencyStatsProps {
  stats: MinibarDelinquencyStatsData | null;
  period: MinibarDelinquencyPeriod;
  loading?: boolean;
  onPeriodChange: (nextPeriod: MinibarDelinquencyPeriod) => void;
}

const PERIOD_OPTIONS: Array<{ id: MinibarDelinquencyPeriod; label: string }> = [
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "month", label: "Mês atual" },
  { id: "all", label: "Todo histórico" }
];

function formatBRL(value: number | undefined | null): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatPct(value: number | undefined | null): string {
  return `${Number(value || 0).toFixed(1).replace(".", ",")}%`;
}

function getRateSeverityClasses(ratePct: number): {
  card: string;
  valueText: string;
  badge: string;
  statusLabel: string;
} {
  if (ratePct <= 5) {
    return {
      card: "border-emerald-500/30 bg-emerald-500/5",
      valueText: "text-emerald-700 dark:text-emerald-300",
      badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      statusLabel: "Saudável"
    };
  }
  if (ratePct <= 15) {
    return {
      card: "border-amber-500/40 bg-amber-500/5",
      valueText: "text-amber-700 dark:text-amber-300",
      badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40",
      statusLabel: "Atenção"
    };
  }
  return {
    card: "border-rose-500/40 bg-rose-500/5",
    valueText: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40",
    statusLabel: "Crítico"
  };
}

function getAgingBarStyle(key: string): { bar: string; badge: string } {
  switch (key) {
    case "d1_3":
      return {
        bar: "bg-sky-500",
        badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
      };
    case "d4_7":
      return {
        bar: "bg-amber-500",
        badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40"
      };
    case "d8_15":
      return {
        bar: "bg-orange-600",
        badge: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/40"
      };
    case "over_15":
    default:
      return {
        bar: "bg-rose-600",
        badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40"
      };
  }
}

function MonthlyTooltip({ active, payload, label }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload as MinibarMonthlyEvolutionPoint | undefined;
  if (!row) return null;

  return (
    <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm p-3 shadow-lg text-xs space-y-1.5 min-w-[200px]">
      <div className="font-black text-foreground flex items-center justify-between gap-3 border-b border-border pb-1">
        <span>{label}</span>
        <Badge
          variant="outline"
          className={`text-[10px] font-bold ${
            row.delinquencyRatePct > 15
              ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
              : row.delinquencyRatePct > 5
              ? "border-amber-500/40 text-amber-800 dark:text-amber-300"
              : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          Inadimpl.: {formatPct(row.delinquencyRatePct)}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Total consumido:</span>
        <strong className="font-mono text-foreground">{formatBRL(row.consumedAmount)}</strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-emerald-700 dark:text-emerald-300 font-medium">Recebido:</span>
        <strong className="font-mono text-emerald-700 dark:text-emerald-300">{formatBRL(row.paidAmount)}</strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-rose-700 dark:text-rose-300 font-medium">Em aberto:</span>
        <strong className="font-mono text-rose-700 dark:text-rose-300">{formatBRL(row.pendingAmount)}</strong>
      </div>
      <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
        {row.delinquentCount} de {row.reservationsCount} reserva(s) com saldo em aberto
      </div>
    </div>
  );
}

export function MinibarDelinquencyStats({
  stats,
  period,
  loading = false,
  onPeriodChange
}: MinibarDelinquencyStatsProps) {
  const uid = useId();
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);

  const monthlyTableCaptionId = `${uid}-monthly-caption`;

  const valueRate = Number(stats?.delinquencyRateByValuePct || 0);
  const resRate = Number(stats?.delinquencyRateByReservationPct || 0);
  const recoveryRate = Number(stats?.recoveryRatePct || 0);
  const totalConsumed = Number(stats?.totalConsumedAmount || 0);
  const spontaneousPaid = Number(stats?.spontaneousPaidAmount ?? stats?.paidWithoutReminderAmount ?? 0);
  const recoveredPaid = Number(stats?.recoveredPaidAmount ?? stats?.recoveredAfterReminderAmount ?? 0);
  const totalPending = Number(stats?.totalPendingAmount || 0);

  const severity = getRateSeverityClasses(valueRate);

  const spontaneousPct = totalConsumed > 0 ? Math.min(100, (spontaneousPaid / totalConsumed) * 100) : 0;
  const recoveredPct = totalConsumed > 0 ? Math.min(100 - spontaneousPct, (recoveredPaid / totalConsumed) * 100) : 0;
  const pendingPct = totalConsumed > 0 ? Math.max(0, 100 - spontaneousPct - recoveredPct) : 0;

  const agingBuckets = stats?.agingBuckets || [
    { key: "d1_3", label: "0–3 dias", subLabel: "Lembrete cordial", count: 0, amount: 0 },
    { key: "d4_7", label: "4–7 dias", subLabel: "Cobrança objetiva", count: 0, amount: 0 },
    { key: "d8_15", label: "8–15 dias", subLabel: "Pós-D+7 / Formal", count: 0, amount: 0 },
    { key: "over_15", label: "+15 dias", subLabel: "Crônico (fora da régua)", count: 0, amount: 0 }
  ];

  const maxAgingAmount = Math.max(
    1,
    ...agingBuckets.map((b) => Number(b.amount || 0))
  );

  const monthlyData = stats?.monthlyEvolution || [];
  const hasAnyMonthlyActivity = monthlyData.some((m) => m.consumedAmount > 0);

  return (
    <Card className="rounded-3xl border border-border overflow-hidden">
      <CardHeader className="p-4 sm:p-5 border-b border-border bg-muted/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-sm sm:text-base font-black text-foreground flex items-center gap-2 flex-wrap">
              <BarChart3 className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Estatísticas de Inadimplência (Pós-Check-out)</span>
              {stats && (
                <Badge className={`text-[10px] font-bold border ${severity.badge}`}>
                  {severity.statusLabel} • {stats.periodLabel}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Mede reservas com check-out conferido e consumo pago de frigobar (itens de cortesia não entram no cálculo).
            </CardDescription>
          </div>

          <div
            role="group"
            aria-label="Selecionar período das estatísticas de inadimplência"
            className="flex flex-wrap items-center gap-1.5 shrink-0"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.id;
              return (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  disabled={loading}
                  onClick={() => onPeriodChange(opt.id)}
                  className="h-8 rounded-xl text-[11px] font-bold px-3"
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className={`p-4 sm:p-5 space-y-5 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        {/* 4 KPIs Executivos de Inadimplência */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {/* KPI 1: Taxa de Inadimplência (Valor) */}
          <div className={`rounded-2xl border p-4 space-y-1.5 ${severity.card}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 shrink-0" />
                <span>Inadimplência (Valor)</span>
              </span>
              {valueRate <= 5 ? (
                <TrendingDown className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <TrendingUp className="w-4 h-4 text-rose-600 shrink-0" />
              )}
            </div>
            <div className={`text-2xl font-black font-mono ${severity.valueText}`}>
              {formatPct(valueRate)}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <strong className="text-foreground font-mono">{formatBRL(totalPending)}</strong> em aberto de{" "}
              <span className="font-mono">{formatBRL(totalConsumed)}</span> consumidos
            </p>
          </div>

          {/* KPI 2: Taxa de Inadimplência (Reservas) */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Inadimplência (Reservas)</span>
            </span>
            <div className="text-2xl font-black font-mono text-foreground">
              {formatPct(resRate)}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <strong className="text-foreground">{stats?.delinquentReservationsCount ?? 0}</strong> de{" "}
              <strong>{stats?.totalReservationsWithConsumption ?? 0}</strong> reservas com consumo (
              {stats?.delinquentSharesCount ?? 0} cota{(stats?.delinquentSharesCount ?? 0) === 1 ? "" : "s"})
            </p>
          </div>

          {/* KPI 3: Taxa de Recuperação da Régua */}
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-1.5">
            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Recuperação Pós-Aviso</span>
            </span>
            <div className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300">
              {stats && stats.remindedTotalCount > 0 ? formatPct(recoveryRate) : "—"}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {stats && stats.remindedTotalCount > 0 ? (
                <>
                  <strong className="text-foreground">{stats.recoveredAfterReminderCount}</strong> de{" "}
                  <strong>{stats.remindedTotalCount}</strong> cobrados quitados (
                  <strong className="font-mono text-emerald-700 dark:text-emerald-300">
                    {formatBRL(stats.recoveredAfterReminderAmount)}
                  </strong>
                  )
                </>
              ) : (
                "Nenhum consumo entrou na régua D+1..D+7 no período"
              )}
            </p>
          </div>

          {/* KPI 4: Inadimplência Crônica (+15 dias) */}
          <div
            className={`rounded-2xl border p-4 space-y-1.5 ${
              (stats?.chronicOverdueCount || 0) > 0
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-border bg-card"
            }`}
          >
            <span
              className={`text-[11px] font-bold flex items-center gap-1.5 ${
                (stats?.chronicOverdueCount || 0) > 0
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-muted-foreground"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Crônicos (+15 dias)</span>
            </span>
            <div
              className={`text-2xl font-black font-mono ${
                (stats?.chronicOverdueCount || 0) > 0
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-foreground"
              }`}
            >
              {formatBRL(stats?.chronicOverdueAmount || 0)}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <strong className="text-foreground">{stats?.chronicOverdueCount ?? 0}</strong> pendência(s) acima de 15d
              (fora da régua diária)
            </p>
          </div>
        </div>

        {/* Barra Visual de Composição Financeira: Espontâneo vs. Recuperado vs. Em Aberto */}
        <div className="rounded-2xl border border-border bg-muted/20 p-3.5 sm:p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-black text-foreground">
              Composição do Consumo Pós-Check-out ({stats?.periodLabel || "Últimos 30 dias"})
            </span>
            <span className="font-mono font-bold text-foreground">
              Total: {formatBRL(totalConsumed)}
            </span>
          </div>

          <div
            role="img"
            aria-label={`Composição financeira: ${formatPct(spontaneousPct)} pago sem cobrança, ${formatPct(
              recoveredPct
            )} recuperado após aviso e ${formatPct(pendingPct)} em aberto.`}
            className="h-3.5 w-full rounded-full overflow-hidden bg-muted flex border border-border/60"
          >
            {spontaneousPct > 0 && (
              <div
                style={{ width: `${spontaneousPct}%` }}
                className="bg-emerald-500 transition-all duration-300"
                title={`Pago espontaneamente: ${formatBRL(spontaneousPaid)} (${formatPct(spontaneousPct)})`}
              />
            )}
            {recoveredPct > 0 && (
              <div
                style={{ width: `${recoveredPct}%` }}
                className="bg-sky-500 transition-all duration-300"
                title={`Recuperado pela régua: ${formatBRL(recoveredPaid)} (${formatPct(recoveredPct)})`}
              />
            )}
            {pendingPct > 0 && (
              <div
                style={{ width: `${pendingPct}%` }}
                className="bg-rose-500 transition-all duration-300"
                title={`Em aberto (inadimplente): ${formatBRL(totalPending)} (${formatPct(pendingPct)})`}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Pago sem cobrança ({stats?.paidWithoutReminderCount ?? 0}):</span>
              </span>
              <strong className="font-mono text-foreground">{formatBRL(spontaneousPaid)}</strong>
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
                <span>Recuperado pela régua:</span>
              </span>
              <strong className="font-mono text-foreground">{formatBRL(recoveredPaid)}</strong>
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <span>Em aberto (inadimplente):</span>
              </span>
              <strong className="font-mono text-rose-700 dark:text-rose-300">{formatBRL(totalPending)}</strong>
            </div>
          </div>
        </div>

        {/* Grade Analítica: Faixas de Atraso (Aging) + Evolução Mensal */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Esquerda (5 cols): Faixas de Atraso (Aging) */}
          <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Faixas de Atraso (Aging)</span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Distribuição do saldo em aberto por tempo desde o check-out
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] font-bold shrink-0">
                {formatBRL(totalPending)}
              </Badge>
            </div>

            <div className="space-y-3">
              {agingBuckets.map((bucket) => {
                const style = getAgingBarStyle(bucket.key);
                const widthPct =
                  totalPending > 0 && bucket.amount > 0
                    ? Math.max(4, (bucket.amount / maxAgingAmount) * 100)
                    : 0;
                const shareOfPendingPct =
                  totalPending > 0 ? (bucket.amount / totalPending) * 100 : 0;

                return (
                  <div key={bucket.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge className={`text-[10px] font-bold border shrink-0 ${style.badge}`}>
                          {bucket.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {bucket.subLabel}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <strong className="font-mono text-foreground">{formatBRL(bucket.amount)}</strong>
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          ({bucket.count} {bucket.count === 1 ? "cota" : "cotas"}
                          {totalPending > 0 ? ` • ${formatPct(shareOfPendingPct)}` : ""})
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        style={{ width: `${widthPct}%` }}
                        className={`h-full rounded-full transition-all duration-300 ${style.bar}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direita (7 cols): Evolução Mensal */}
          <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Evolução Mensal (Últimos {stats?.monthsWindow || 6} meses)
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Comparativo mensal de valores recebidos vs. saldo em aberto pós-check-out
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={showMonthlyTable}
                onClick={() => setShowMonthlyTable((v) => !v)}
                className="h-7 rounded-xl text-[11px] font-bold gap-1.5 px-2.5"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>{showMonthlyTable ? "Ver Gráfico" : "Ver Tabela"}</span>
              </Button>
            </div>

            {!hasAnyMonthlyActivity ? (
              <div className="h-52 rounded-2xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center text-center p-4 gap-1.5">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                <p className="text-xs font-bold text-foreground">
                  Nenhum consumo pós-check-out registrado nos últimos {stats?.monthsWindow || 6} meses.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Assim que houver lançamentos conferidos no check-out, a curva mensal aparecerá aqui.
                </p>
              </div>
            ) : showMonthlyTable ? (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={monthlyTableCaptionId}
                className="w-full overflow-x-auto max-h-60 overflow-y-auto rounded-xl border border-border"
              >
                <table className="w-full min-w-[480px] text-xs text-left border-separate border-spacing-0">
                  <caption id={monthlyTableCaptionId} className="sr-only">
                    Evolução mensal da inadimplência de frigobar com valores consumidos, recebidos, em aberto e taxa percentual
                  </caption>
                  <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground font-bold">
                    <tr>
                      <th scope="col" className="p-2.5 border-b border-border">Mês</th>
                      <th scope="col" className="p-2.5 border-b border-border text-right">Consumido</th>
                      <th scope="col" className="p-2.5 border-b border-border text-right">Recebido</th>
                      <th scope="col" className="p-2.5 border-b border-border text-right">Em Aberto</th>
                      <th scope="col" className="p-2.5 border-b border-border text-right">% Inadimpl.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {monthlyData.map((row) => (
                      <tr key={row.month} className="hover:bg-muted/20">
                        <th scope="row" className="p-2.5 font-bold text-foreground bg-card sm:sticky sm:left-0">
                          {row.label}
                        </th>
                        <td className="p-2.5 text-right font-mono">{formatBRL(row.consumedAmount)}</td>
                        <td className="p-2.5 text-right font-mono text-emerald-700 dark:text-emerald-300">
                          {formatBRL(row.paidAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-rose-700 dark:text-rose-300">
                          {formatBRL(row.pendingAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">
                          {formatPct(row.delinquencyRatePct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v}`}
                    />
                    <Tooltip content={<MonthlyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="paidAmount"
                      name="Recebido"
                      stackId="a"
                      fill="#10b981"
                      radius={[0, 0, 4, 4]}
                    />
                    <Bar
                      dataKey="pendingAmount"
                      name="Em Aberto"
                      stackId="a"
                      fill="#e11d48"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
