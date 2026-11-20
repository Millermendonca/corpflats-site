import React, { useId } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface MinibarInspectionsTabProps {
  reportsData: any | null;
}

export function MinibarInspectionsTab({ reportsData }: MinibarInspectionsTabProps) {
  const uid = useId();
  const captionId = `${uid}-inspections-caption`;

  const inspections: any[] = Array.isArray(reportsData?.productivitySummary?.inspections)
    ? reportsData.productivitySummary.inspections
    : [];

  return (
    <Card className="rounded-3xl border border-border overflow-hidden w-full min-w-0">
      <CardHeader className="p-4 sm:p-5 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-black text-foreground">
            Histórico de Passagens Diárias & Conferências nos Flats
          </CardTitle>
          <CardDescription className="text-xs">
            Registro completo de conferências diárias, pós-check-out, cortesias, NQ/NP e ajustes internos feitos pelas repositoras no período
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <Badge variant="outline" className="text-xs font-bold">
            {inspections.length} passagens
          </Badge>
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
            ✓ {reportsData?.productivitySummary?.totalConforme ?? 0} conformes
          </Badge>
          {(reportsData?.productivitySummary?.totalInternalAdjustments || 0) > 0 && (
            <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[10px] font-bold">
              🛠️ {reportsData.productivitySummary.totalInternalAdjustments} ajustes int.
            </Badge>
          )}
        </div>
      </CardHeader>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="w-full overflow-x-auto max-h-[600px] overflow-y-auto"
      >
        <table className="w-full min-w-[680px] text-xs text-left border-separate border-spacing-0">
          <caption id={captionId} className="sr-only">
            Histórico de passagens diárias e lançamentos das repositoras nos flats do período
          </caption>
          <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground font-bold">
            <tr>
              <th scope="col" className="p-3.5 border-b border-border">Data / Hora</th>
              <th scope="col" className="p-3.5 border-b border-border">Flat</th>
              <th scope="col" className="p-3.5 border-b border-border">Repositora</th>
              <th scope="col" className="p-3.5 border-b border-border">Resultado da Passagem</th>
              <th scope="col" className="p-3.5 border-b border-border">Itens Lançados / Repostos</th>
              <th scope="col" className="p-3.5 border-b border-border">Observações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inspections.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  Nenhuma passagem registrada no período selecionado.
                </td>
              </tr>
            ) : (
              inspections.map((insp: any) => {
                const launchedVal = Number(insp.discrepancyTotalAmount || 0);
                const courtesyWater =
                  Number(
                    insp.welcomeKitConsumption?.waterCups ??
                      insp.welcomeKitConsumption?.waterCupsConsumed
                  ) || 0;
                const courtesyPeanuts =
                  Number(
                    insp.welcomeKitConsumption?.mendoratoPeanuts ??
                      insp.welcomeKitConsumption?.peanutsConsumed
                  ) || 0;
                const hasCourtesy = courtesyWater > 0 || courtesyPeanuts > 0;
                const isInternalAdj =
                  insp.status === "ocorrencia_interna" ||
                  insp.unoccupiedLaunchMode === "internal_adjustment";
                const isLinkedLastRes = insp.unoccupiedLaunchMode === "link_last_reservation";

                const itemSummaryParts: string[] = [];
                for (const it of insp.restockedItems || []) {
                  itemSummaryParts.push(`${it.quantity}x ${it.productName || it.productId}`);
                }
                if (itemSummaryParts.length === 0 && Array.isArray(insp.internalAdjustmentItems)) {
                  for (const adj of insp.internalAdjustmentItems) {
                    itemSummaryParts.push(`${adj.quantity}x ${adj.productName || adj.productId} (Ajuste)`);
                  }
                }
                if (courtesyWater > 0) {
                  itemSummaryParts.push(`💧 ${courtesyWater}x Água (Cortesia)`);
                }
                if (courtesyPeanuts > 0) {
                  itemSummaryParts.push(`🥜 ${courtesyPeanuts}x Amendoim (Cortesia)`);
                }

                return (
                  <tr key={insp.id} className="hover:bg-muted/20">
                    <th scope="row" className="p-3.5 font-mono text-[11px] font-normal text-left bg-card sm:sticky sm:left-0 border-b border-border/60">
                      {insp.inspectedAt ? new Date(insp.inspectedAt).toLocaleString("pt-BR") : "-"}
                    </th>
                    <td className="p-3.5 border-b border-border/60">
                      <Badge variant="outline" className="font-bold">
                        Flat {insp.flatNumber}
                      </Badge>
                    </td>
                    <td className="p-3.5 font-bold text-foreground border-b border-border/60">
                      {insp.inspectorName || "Repositora Anserve"}
                    </td>
                    <td className="p-3.5 border-b border-border/60">
                      {insp.status === "nq" ? (
                        <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[10px]">
                          🚫 NQ — Hóspede Não Quis
                        </Badge>
                      ) : insp.status === "np" ? (
                        <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px]">
                          🔕 NP — Placa Não Perturbe
                        </Badge>
                      ) : insp.status === "ocorrencia_interna" ||
                        (isInternalAdj && itemSummaryParts.length > 0) ? (
                        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[10px]">
                          🛠️ Ocorrência / Ajuste Interno
                        </Badge>
                      ) : isLinkedLastRes ? (
                        <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 text-[10px]">
                          🔄 Correção Últ. Reserva {insp.reservationCode ? `(${insp.reservationCode})` : ""}{" "}
                          {launchedVal > 0 ? `• R$ ${launchedVal.toFixed(2)}` : ""}
                        </Badge>
                      ) : launchedVal > 0 ? (
                        <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">
                          Consumo Lançado (R$ {launchedVal.toFixed(2)}){hasCourtesy ? " + Cortesia" : ""}
                        </Badge>
                      ) : hasCourtesy ? (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                          🎁 Cortesia Consumida (R$ 0,00)
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                          ✓ Passagem Sem Consumo
                        </Badge>
                      )}
                    </td>
                    <td className="p-3.5 border-b border-border/60">
                      {itemSummaryParts.length > 0 ? itemSummaryParts.join(", ") : "Sem reposição"}
                    </td>
                    <td className="p-3.5 text-muted-foreground max-w-xs truncate border-b border-border/60" title={insp.notes || ""}>
                      {insp.notes || "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
