import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Calendar, Download, ExternalLink, Check, Sparkles, 
  ChevronDown, Globe, Smartphone, Clock
} from "lucide-react"
import { 
  ReservationCalendarData, downloadIcsFile, 
  getGoogleCalendarUrl, getOutlookCalendarUrl, getYahooCalendarUrl 
} from "@/lib/calendar-helper"
import { useToast } from "@/hooks/use-toast"

interface AddToCalendarProps {
  reservation: ReservationCalendarData
  variant?: "card" | "buttons" | "compact"
  className?: string
}

export function AddToCalendar({ reservation, variant = "card", className = "" }: AddToCalendarProps) {
  const { toast } = useToast()
  const [downloaded, setDownloaded] = useState(false)

  const handleDownloadIcs = () => {
    downloadIcsFile(reservation)
    setDownloaded(true)
    toast({
      title: "Arquivo de Calendário (.ics) Baixado! 📅",
      description: "Abra o arquivo para adicionar automaticamente ao Apple Calendar, Outlook ou celular."
    })
    setTimeout(() => setDownloaded(false), 3000)
  }

  const handleOpenGoogle = () => {
    const url = getGoogleCalendarUrl(reservation)
    window.open(url, "_blank")
  }

  const handleOpenOutlook = () => {
    const url = getOutlookCalendarUrl(reservation)
    window.open(url, "_blank")
  }

  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <Button
          size="sm"
          onClick={handleOpenGoogle}
          className="bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 text-xs font-bold gap-1.5 h-8 rounded-xl shadow-2xs"
        >
          <Calendar className="w-3.5 h-3.5 text-sky-600" />
          <span>Google Agenda</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadIcs}
          className="text-xs font-bold gap-1.5 h-8 rounded-xl border-slate-200"
        >
          {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Download className="w-3.5 h-3.5 text-slate-600" />}
          <span>{downloaded ? "Baixado!" : "Baixar .ics"}</span>
        </Button>
      </div>
    )
  }

  return (
    <Card className={`rounded-3xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden ${className}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-black text-sm text-slate-900 dark:text-slate-100">
                  Sincronizar com seu Calendário
                </h4>
                <Badge className="bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                  Check-in 14:00
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adicione as datas, horários e senha do Flat {reservation.flatNumber} à sua agenda pessoal.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* Google Agenda */}
          <Button
            onClick={handleOpenGoogle}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10 rounded-2xl shadow-xs flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4 text-sky-400" />
            <span>Google Agenda</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-auto sm:ml-0" />
          </Button>

          {/* Outlook / Office 365 */}
          <Button
            variant="outline"
            onClick={handleOpenOutlook}
            className="w-full font-bold text-xs h-10 rounded-2xl border-slate-200 hover:bg-slate-50 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Outlook / Office 365</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-auto sm:ml-0" />
          </Button>

          {/* Baixar .ICS (Apple Calendar / Android) */}
          <Button
            variant="outline"
            onClick={handleDownloadIcs}
            className="w-full font-bold text-xs h-10 rounded-2xl border-slate-200 hover:bg-slate-50 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2"
          >
            {downloaded ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Arquivo Baixado!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-sky-600" />
                <span>Apple / Arquivo .ICS</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
