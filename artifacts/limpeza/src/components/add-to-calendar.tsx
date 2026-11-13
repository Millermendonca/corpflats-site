import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Calendar, Download, ExternalLink, Check
} from "lucide-react"
import { 
  ReservationCalendarData, downloadIcsFile, 
  getGoogleCalendarUrl, getOutlookCalendarUrl 
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
      title: "Arquivo de Calendário (.ics) Baixado",
      description: "Abra o arquivo para adicionar ao Apple Calendar, Outlook ou celular."
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
          <Calendar className="w-3.5 h-3.5 text-[#0F3D4C]" />
          <span>Google Agenda</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadIcs}
          className="text-xs font-bold gap-1.5 h-8 rounded-xl border-slate-200 text-slate-700"
        >
          {downloaded ? <Check className="w-3.5 h-3.5 text-[#0F3D4C]" /> : <Download className="w-3.5 h-3.5 text-[#0F3D4C]" />}
          <span>{downloaded ? "Baixado!" : "Baixar .ics"}</span>
        </Button>
      </div>
    )
  }

  return (
    <Card className={`rounded-3xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden ${className}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/30 flex items-center justify-center font-bold shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h4 className="font-black text-sm text-slate-900 dark:text-slate-100">
                  Sincronizar com seu Calendário
                </h4>
                <Badge className="bg-[#0F3D4C]/10 text-[#0F3D4C] border border-[#C5A059]/30 text-[10px] font-bold shrink-0">
                  Check-in 14:00
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adicione as datas da sua estada no Flat {reservation.flatNumber} à sua agenda pessoal.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <Button
            onClick={handleOpenGoogle}
            className="w-full bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-bold text-xs h-10 rounded-2xl shadow-xs flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4 text-[#E5C98B]" />
            <span>Google Agenda</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-auto sm:ml-0" />
          </Button>

          <Button
            variant="outline"
            onClick={handleOpenOutlook}
            className="w-full font-bold text-xs h-10 rounded-2xl border-slate-200 hover:bg-slate-50 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4 text-[#0F3D4C]" />
            <span>Outlook / Office 365</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-auto sm:ml-0" />
          </Button>

          <Button
            variant="outline"
            onClick={handleDownloadIcs}
            className="w-full font-bold text-xs h-10 rounded-2xl border-slate-200 hover:bg-slate-50 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2"
          >
            {downloaded ? (
              <>
                <Check className="w-4 h-4 text-[#0F3D4C]" />
                <span>Arquivo Baixado!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-[#0F3D4C]" />
                <span>Apple / Arquivo .ICS</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
