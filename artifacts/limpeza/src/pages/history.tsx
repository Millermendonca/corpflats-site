import { useState } from "react"
import { useListCleaningHistory, CleaningHistoryEntry, useGetMe } from "@workspace/api-client-react"
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Shell } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const statusLabels: Record<string, { label: string, bg: string }> = {
  dirty: { label: "Sujo", bg: "bg-destructive/10 text-destructive" },
  will_clean: { label: "Vou Limpar", bg: "bg-blue-500/10 text-blue-700" },
  cleaning_now: { label: "Limpando", bg: "bg-amber-500/10 text-amber-700" },
  pending_issue: { label: "Pendência", bg: "bg-orange-500/10 text-orange-700" },
  clean: { label: "Limpo", bg: "bg-emerald-500/10 text-emerald-700" },
}

export default function History() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))

  const { data: user } = useGetMe()

  const { data: history, isLoading } = useListCleaningHistory({
    startDate,
    endDate
  })

  return (
    <Shell>
      <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Histórico de Limpezas</h1>
          <p className="text-muted-foreground">Registro de atividades realizadas</p>
        </div>

        <Card className="mb-8 shadow-sm">
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 w-full md:w-auto flex-1">
              <Label htmlFor="start">Data Inicial</Label>
              <Input 
                id="start" 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
              />
            </div>
            <div className="space-y-2 w-full md:w-auto flex-1">
              <Label htmlFor="end">Data Final</Label>
              <Input 
                id="end" 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : history && history.length > 0 ? (
          <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data/Hora</th>
                    <th className="px-4 py-3 font-medium">Flat</th>
                    <th className="px-4 py-3 font-medium">Status Final</th>
                    {user?.role === "admin" && (
                      <th className="px-4 py-3 font-medium">Camareira</th>
                    )}
                    <th className="px-4 py-3 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((entry: CleaningHistoryEntry) => {
                    const dt = entry.completedAt ? parseISO(entry.completedAt) : parseISO(entry.createdAt!)
                    const conf = statusLabels[entry.status] || { label: entry.status, bg: "bg-muted" }
                    return (
                      <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {format(dt, "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          Apt {entry.flatNumber}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`font-medium border-0 ${conf.bg}`}>
                            {conf.label}
                          </Badge>
                        </td>
                        {user?.role === "admin" && (
                          <td className="px-4 py-3 capitalize">
                            {entry.assignedUsername || "-"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={entry.pendingObservation || ""}>
                          {entry.pendingObservation || "-"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-card border rounded-xl border-dashed">
            <div className="text-muted-foreground">Nenhum registro encontrado no período.</div>
          </div>
        )}
      </div>
    </Shell>
  )
}
