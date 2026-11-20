import React, { useId } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  DollarSign,
  Download,
  FileText,
  Gift,
  RotateCcw,
  Search,
  Trash2
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export interface MinibarSalesTabProps {
  reportsData: any | null;
  settlement: any | null;
  peanutStock?: any | null;
  pendingInvoicesCount: number;
  canManageAdminActions: boolean;
  sohoFlats: string[];
  salesSearch: string;
  onSalesSearchChange: (value: string) => void;
  salesFlatFilter: string;
  onSalesFlatFilterChange: (value: string) => void;
  salesStatusFilter: string;
  onSalesStatusFilterChange: (value: string) => void;
  filteredReportOrders: any[];
  onNavigateInvoices: () => void;
  onOpenPeanutStock?: () => void;
  onExportProductsCsv: () => void;
  onExportSalesCsv: () => void;
  onReopenSalesOrder: (order: any) => void;
  onDeleteOrder: (order: any) => void;
}

export function MinibarSalesTab({
  reportsData,
  settlement,
  peanutStock,
  pendingInvoicesCount,
  canManageAdminActions,
  sohoFlats,
  salesSearch,
  onSalesSearchChange,
  salesFlatFilter,
  onSalesFlatFilterChange,
  salesStatusFilter,
  onSalesStatusFilterChange,
  filteredReportOrders,
  onNavigateInvoices,
  onOpenPeanutStock,
  onExportProductsCsv,
  onExportSalesCsv,
  onReopenSalesOrder,
  onDeleteOrder
}: MinibarSalesTabProps) {
  const uid = useId();
  const searchInputId = `${uid}-sales-search`;
  const flatSelectId = `${uid}-sales-flat`;
  const statusSelectId = `${uid}-sales-status`;
  const productsTableCaptionId = `${uid}-products-caption`;
  const salesTableCaptionId = `${uid}-sales-caption`;

  const courtesyWaterCost = Number(
    settlement?.courtesyWaterTotalCost ??
      settlement?.courtesySummary?.courtesyWaterTotalCost ??
      settlement?.courtesyRestockCost ??
      0
  );
  const courtesyWaterUnits = Number(
    settlement?.courtesyWaterCupsTotal ??
      settlement?.courtesySummary?.totalCourtesyWaterCups ??
      0
  );
  const courtesyWaterUnitCost = Number(
    settlement?.courtesyWaterUnitCost ??
      settlement?.courtesySummary?.courtesyWaterUnitCost ??
      reportsData?.courtesySummary?.courtesyWaterUnitCost ??
      2
  );
  const courtesyPeanutsUnits =
    Number(
      settlement?.courtesyMendoratoPeanutsTotal ??
        settlement?.courtesySummary?.totalCourtesyMendoratoPeanuts ??
        0
    ) + Number(settlement?.courtesySummary?.internalCourtesyMendoratoPeanuts || 0);

  const peanutBalanceData = peanutStock || reportsData?.peanutStock;

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Resumo Executivo de Vendas + Repasse Líquido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full min-w-0">
        <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
          <span className="text-[11px] text-muted-foreground font-semibold">Vendas Pagas no Período</span>
          <div className="text-xl font-black text-emerald-600">
            R$ {Number(reportsData?.salesSummary?.totalPaidRevenue ?? settlement?.totalOrdersAmount ?? 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {reportsData?.salesSummary?.totalOrdersPaid ?? settlement?.ordersCount ?? 0} pagamentos concluídos •{" "}
            {reportsData?.salesSummary?.totalUnitsSold ?? 0} itens vendidos
          </span>
        </Card>

        <Card className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1 shadow-xs">
          <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wide">
            Líquido a Repassar (Anserve)
          </span>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
            R$ {Number(settlement?.netPayableToAnserve || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 block">
            Taxas (-R$ {Number(settlement?.totalFees || 0).toFixed(2)}) • Águas Anserve (+R${" "}
            {Number(settlement?.totalCourtesyReimbursement ?? courtesyWaterCost).toFixed(2)})
          </span>
        </Card>

        <Card className="rounded-3xl border border-border bg-card p-4 space-y-1">
          <span className="text-[11px] text-muted-foreground font-semibold">Lançamentos Aguardando Pagamento</span>
          <div className="text-xl font-black text-amber-600">
            R$ {Number(reportsData?.salesSummary?.totalPendingRevenue || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {reportsData?.salesSummary?.totalOrdersPending || 0}{" "}
            {(reportsData?.salesSummary?.totalOrdersPending || 0) === 1
              ? "cobrança com saldo a quitar"
              : "cobranças com saldo a quitar"}
          </span>
        </Card>

        <button
          type="button"
          onClick={onNavigateInvoices}
          className="text-left rounded-3xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 transition-all p-4 space-y-1 focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-bold">
              Notas Fiscais Pendentes
            </span>
            <ArrowUpRight className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
            {pendingInvoicesCount} {pendingInvoicesCount === 1 ? "pedido pago" : "pedidos pagos"}
          </div>
          <span className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80 font-semibold block">
            Abrir Central de Notas Fiscais →
          </span>
        </button>
      </div>

      {/* Demonstrativo do Extrato de Repasse (CorpFlats <-> Anserve) */}
      {settlement && (
        <Card className="rounded-3xl border border-border bg-muted/20 p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Fechamento Financeiro de Repasse (CorpFlats ↔ Anserve)</span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Cálculo automático: Total Pago − Taxas Gateway (Cartão / PIX) − Comissão CorpFlats + Reembolso de Águas Cortesia Anserve
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-card border border-border">
              <span className="text-[10px] text-muted-foreground block">1. Vendas Brutas Pagas</span>
              <strong className="text-sm font-black text-foreground font-mono">
                R$ {Number(settlement.totalOrdersAmount || 0).toFixed(2)}
              </strong>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                PIX: R$ {Number(reportsData?.salesSummary?.byPaymentMethod?.pix ?? settlement.pixOrdersAmount ?? 0).toFixed(2)} • Cartão: R${" "}
                {Number(reportsData?.salesSummary?.byPaymentMethod?.credit_card ?? settlement.cardOrdersAmount ?? 0).toFixed(2)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-card border border-border">
              <span className="text-[10px] text-muted-foreground block">2. Taxas Cartão / PIX</span>
              <strong className="text-sm font-black text-rose-600 font-mono">
                - R$ {Number(settlement.totalFees || (settlement.cardFees || 0) + (settlement.pixFees || 0) || 0).toFixed(2)}
              </strong>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Mercado Pago & PIX Inter</span>
            </div>

            <div className="p-3 rounded-2xl bg-card border border-border">
              <span className="text-[10px] text-muted-foreground block">3. Comissão CorpFlats</span>
              <strong className="text-sm font-black text-amber-600 font-mono">
                - R$ {Number(settlement.commissionCorpFlats || 0).toFixed(2)}
              </strong>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Retenção acordada</span>
            </div>

            <div className="p-3 rounded-2xl bg-card border border-border">
              <span className="text-[10px] text-muted-foreground block">4. Reembolso Água Cortesia</span>
              <strong className="text-sm font-black text-sky-600 font-mono">
                + R$ {courtesyWaterCost.toFixed(2)}
              </strong>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {courtesyWaterUnits} copos × R$ {courtesyWaterUnitCost.toFixed(2)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 col-span-2 lg:col-span-1">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold block">
                5. Saldo Líquido Anserve
              </span>
              <strong className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono">
                R$ {Number(settlement.netPayableToAnserve || 0).toFixed(2)}
              </strong>
              <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 block mt-0.5">
                Valor final a transferir
              </span>
            </div>
          </div>

          {/* Apuração Detalhada de Fornecimento do Kit de Boas-Vindas */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-500/10 via-amber-500/10 to-transparent border border-sky-500/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="text-xs font-black text-foreground">
                  Apuração do Kit de Boas-Vindas (Fornecimento & Repasse)
                </span>
              </div>
              <Badge variant="outline" className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] font-bold">
                Reembolso Anserve: R$ {courtesyWaterCost.toFixed(2)}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-foreground block">💧 Copos d'Água Mineral 200ml</span>
                  <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold block">
                    Estoque Anserve • Repasse a Custo: R$ {courtesyWaterUnitCost.toFixed(2)} / un.
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-foreground block">{courtesyWaterUnits} consumidos</span>
                  <strong className="text-xs font-mono font-black text-sky-600">
                    + R$ {courtesyWaterCost.toFixed(2)}
                  </strong>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-foreground block">🥜 Amendoim Mendorato 27g</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">
                    Fornecimento Próprio CorpFlats • Sem Repasse (R$ 0,00)
                  </span>
                  {canManageAdminActions && peanutBalanceData?.hasStockConfigured && (
                    <span className="text-[10px] text-muted-foreground font-semibold block mt-0.5">
                      Saldo Estoque Hotel:{" "}
                      <strong className={peanutBalanceData.lowStockAlert ? "text-rose-600" : "text-foreground"}>
                        {peanutBalanceData.currentBalance} un.
                      </strong>
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <span className="text-xs font-bold text-foreground block">
                    {courtesyPeanutsUnits} saídas
                  </span>
                  <strong className="text-[11px] font-mono font-bold text-muted-foreground block">
                    R$ 0,00 (Isento)
                  </strong>
                  {canManageAdminActions && onOpenPeanutStock && (
                    <button
                      type="button"
                      onClick={onOpenPeanutStock}
                      className="text-[10px] font-bold text-amber-600 hover:underline inline-flex items-center gap-0.5"
                    >
                      Gerenciar Estoque →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Barra de Filtros & Exportação CSV */}
      <Card className="rounded-3xl border border-border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full min-w-0">
        <search className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <div className="relative w-full sm:w-64">
            <Label htmlFor={searchInputId} className="sr-only">
              Filtrar vendas por pedido, flat, hóspede ou item
            </Label>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id={searchInputId}
              type="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Filtrar pedido, flat, hóspede, item..."
              value={salesSearch}
              onChange={(e) => onSalesSearchChange(e.target.value)}
              className="h-9 pl-9 text-xs rounded-xl"
            />
          </div>

          <Label htmlFor={flatSelectId} className="sr-only">
            Filtrar por flat
          </Label>
          <select
            id={flatSelectId}
            value={salesFlatFilter}
            onChange={(e) => onSalesFlatFilterChange(e.target.value)}
            className="h-9 text-xs rounded-xl border border-input bg-background px-2.5 font-bold flex-1 sm:flex-initial"
          >
            <option value="todos">Todos os Flats</option>
            {sohoFlats.map((f) => (
              <option key={f} value={f}>
                Flat {f}
              </option>
            ))}
          </select>

          <Label htmlFor={statusSelectId} className="sr-only">
            Filtrar por status de pagamento
          </Label>
          <select
            id={statusSelectId}
            value={salesStatusFilter}
            onChange={(e) => onSalesStatusFilterChange(e.target.value)}
            className="h-9 text-xs rounded-xl border border-input bg-background px-2.5 font-bold flex-1 sm:flex-initial"
          >
            <option value="todos">Todos os Status</option>
            <option value="pago">Somente Pagos</option>
            <option value="pendente">Somente Aguardando Pagamento</option>
          </select>
        </search>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onExportProductsCsv}
            className="rounded-xl text-xs font-bold h-9 gap-1.5 w-full sm:w-auto"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Exportar Produtos (CSV)</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onExportSalesCsv}
            className="rounded-xl text-xs font-bold h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Vendas (CSV)</span>
          </Button>
        </div>
      </Card>

      {/* Saída por Produto & Cortesias no Período */}
      {((Array.isArray(reportsData?.salesSummary?.byProduct) &&
        reportsData.salesSummary.byProduct.length > 0) ||
        (Array.isArray(reportsData?.courtesyReportItems) &&
          reportsData.courtesyReportItems.some((c: any) => Number(c?.unitsConsumed || 0) > 0))) && (
        <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
          <CardHeader className="p-4 border-b border-border bg-muted/20">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Resumo de Saída por Produto & Cortesias (Período Selecionado)
            </CardTitle>
          </CardHeader>

          {Array.isArray(reportsData?.salesSummary?.byProduct) &&
            reportsData.salesSummary.byProduct.length > 0 && (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={productsTableCaptionId}
                className="w-full overflow-x-auto max-h-[380px] overflow-y-auto"
              >
                <table className="w-full min-w-[540px] text-xs text-left border-separate border-spacing-0">
                  <caption id={productsTableCaptionId} className="sr-only">
                    Resumo de quantidade vendida, receita e custo por produto de frigobar no período
                  </caption>
                  <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground font-bold">
                    <tr>
                      <th scope="col" className="p-3 border-b border-border">Produto</th>
                      <th scope="col" className="p-3 border-b border-border">Categoria</th>
                      <th scope="col" className="p-3 border-b border-border text-center">Qtd. Vendida</th>
                      <th scope="col" className="p-3 border-b border-border text-right">Preço Venda</th>
                      <th scope="col" className="p-3 border-b border-border text-right">Total Vendido</th>
                      <th scope="col" className="p-3 border-b border-border text-right">Custo / Repasse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reportsData.salesSummary.byProduct.map((p: any) => (
                      <tr key={p.productId} className="hover:bg-muted/20">
                        <th scope="row" className="p-3 font-bold text-foreground text-left bg-card sm:sticky sm:left-0 border-b border-border/60">
                          {p.productName}
                        </th>
                        <td className="p-3 text-muted-foreground border-b border-border/60">{p.category}</td>
                        <td className="p-3 text-center font-mono font-bold border-b border-border/60">{p.unitsSold} un.</td>
                        <td className="p-3 text-right font-mono border-b border-border/60">R$ {Number(p.unitPrice).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono font-black text-emerald-600 border-b border-border/60">
                          R$ {Number(p.totalRevenue).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-sky-600 border-b border-border/60">
                          R$ {Number(p.totalCost || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {Array.isArray(reportsData?.courtesyReportItems) &&
            reportsData.courtesyReportItems.some((c: any) => Number(c?.unitsConsumed || 0) > 0) && (
              <div className="p-4 border-t border-border bg-muted/10 space-y-2.5">
                <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Saída de Cortesias & Controle de Estoque no Período
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  {reportsData.courtesyReportItems.map((c: any) => {
                    const isHotelOwn = c.supplier === "hotel_proprio";
                    return (
                      <div
                        key={c.productId}
                        className="p-3 rounded-2xl bg-card border border-border flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-foreground block truncate">
                            {isHotelOwn ? "🥜 " : "💧 "}
                            {c.productName}
                          </span>
                          <span
                            className={`text-[10px] font-semibold block ${
                              isHotelOwn
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-sky-600 dark:text-sky-400"
                            }`}
                          >
                            {c.supplierLabel}
                            {!isHotelOwn &&
                              ` • Custo R$ ${Number(c.reimbursementUnitCost || 0).toFixed(2)}/un.`}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-foreground block">
                            {Number(c.unitsConsumed || 0)} un.
                          </span>
                          {isHotelOwn ? (
                            <span className="text-[10px] font-mono font-bold text-muted-foreground">
                              R$ 0,00 (Sem Repasse)
                            </span>
                          ) : (
                            <strong className="text-[11px] font-mono font-black text-sky-600">
                              + R$ {Number(c.totalReimbursementToAnserve || 0).toFixed(2)}
                            </strong>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
        </Card>
      )}

      {/* Listagem Detalhada de Vendas & Consumos */}
      <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
        <CardHeader className="p-4 border-b border-border bg-card flex flex-row items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-black text-foreground">
              Listagem Detalhada de Vendas & Consumos
            </CardTitle>
            <CardDescription className="text-xs">
              Histórico de consumos lançados e pagamentos recebidos por flat no período selecionado
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-bold shrink-0">
            {filteredReportOrders.length} registros
          </Badge>
        </CardHeader>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={salesTableCaptionId}
          className="w-full overflow-x-auto max-h-[560px] overflow-y-auto"
        >
          <table className="w-full min-w-[740px] text-xs text-left border-separate border-spacing-0">
            <caption id={salesTableCaptionId} className="sr-only">
              Listagem detalhada de pedidos e consumos de frigobar com status de pagamento e nota fiscal
            </caption>
            <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground font-bold">
              <tr>
                <th scope="col" className="p-3.5 border-b border-border">Pedido / Data</th>
                <th scope="col" className="p-3.5 border-b border-border">Flat</th>
                <th scope="col" className="p-3.5 border-b border-border">Hóspede</th>
                <th scope="col" className="p-3.5 border-b border-border">Itens Consumidos</th>
                <th scope="col" className="p-3.5 border-b border-border">Pagamento</th>
                <th scope="col" className="p-3.5 border-b border-border">Nota Fiscal</th>
                <th scope="col" className="p-3.5 border-b border-border text-right">Valor</th>
                {canManageAdminActions && (
                  <th scope="col" className="p-3.5 border-b border-border text-center w-24">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredReportOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManageAdminActions ? 8 : 7}
                    className="p-8 text-center text-muted-foreground"
                  >
                    Nenhuma venda encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredReportOrders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-muted/20">
                    <th scope="row" className="p-3.5 font-normal text-left bg-card sm:sticky sm:left-0 border-b border-border/60">
                      <div className="font-mono font-bold text-primary">{o.id}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {o.date ? new Date(o.date).toLocaleString("pt-BR") : "-"}
                      </div>
                    </th>
                    <td className="p-3.5 border-b border-border/60">
                      <Badge variant="outline" className="font-bold">
                        Flat {o.flatNumber}
                      </Badge>
                    </td>
                    <td className="p-3.5 border-b border-border/60">
                      <div className="font-bold text-foreground">{o.guestName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {o.reservationCode}
                      </div>
                    </td>
                    <td className="p-3.5 max-w-xs truncate border-b border-border/60" title={o.itemsSummary}>
                      {o.itemsSummary}
                    </td>
                    <td className="p-3.5 border-b border-border/60">
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          className={
                            o.paymentStatus === "pago"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]"
                              : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[10px]"
                          }
                        >
                          {o.paymentStatus === "pago" ? "✓ Pago" : "Aguardando"} (
                          {o.paymentMethod === "pix"
                            ? "PIX"
                            : o.paymentMethod === "credit_card"
                            ? "Cartão"
                            : "Pós-Checkout"}
                          )
                        </Badge>
                        {o.paymentStatus === "pago" &&
                          o.paymentVerificationStatus === "unverified_synthetic_e2e" && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300"
                              title="Pedido pago sem endToEndId real do Banco Central — confira no extrato Inter ou reabra como pendente"
                            >
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>Sem E2E real</span>
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="p-3.5 border-b border-border/60">
                      {o.invoiceStatus === "anexada" ? (
                        <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">
                          Emitida {o.invoiceNumber ? `#${o.invoiceNumber}` : ""}
                        </Badge>
                      ) : o.paymentStatus === "pago" ? (
                        <button
                          type="button"
                          onClick={onNavigateInvoices}
                          className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Emitir NF →</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Após pagamento</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-foreground border-b border-border/60">
                      R$ {Number(o.totalAmount || 0).toFixed(2)}
                    </td>
                    {canManageAdminActions && (
                      <td className="p-3.5 text-center border-b border-border/60">
                        <div className="inline-flex items-center justify-center gap-1">
                          {o.paymentStatus === "pago" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => onReopenSalesOrder(o)}
                              title="Reabrir como Pendente (apenas Admin)"
                              aria-label={`Reabrir pedido ${o.id} como pendente`}
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-amber-700 hover:bg-amber-500/15"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onDeleteOrder(o)}
                            title="Excluir pedido do histórico (apenas Admin)"
                            aria-label={`Excluir pedido ${o.id}`}
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
