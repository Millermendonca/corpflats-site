import { memo, useState, useEffect, useRef, useMemo } from "react"
import { useLocation } from "wouter"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Calendar, Coffee, Building2, Sparkles, User, ShieldCheck, Check, ArrowRight, ArrowLeft,
  QrCode, CreditCard, Copy, ExternalLink, Clock, Car, Heart, AlertTriangle, MessageCircle,
  Lock, CheckCircle2, Shield, Flame, Zap, HelpCircle, PhoneCall, RefreshCw,
  MapPin, FileText, Home, Camera, X
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AddToCalendar } from "@/components/add-to-calendar"
import { calculateCancellationPolicy } from "@/lib/cancellation-helper"
import { RoomConfig } from "@/pages/booking-engine"
import { loginWithGooglePopup, updateAccountProfile, saveSessionLocally } from "@/lib/auth-client"
import { maskPhone, maskCpf } from "@/components/complete-profile-modal"
import { isPlausibleCpfOrPassport } from "@/lib/phone-mask"
import { compressImage } from "@/lib/image-compression"
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo"
import { useStableCallback } from "@/lib/render-freeze"

const FUNNEL_STEPS = [
  { step: 1, label: "1. Extras & Camas" },
  { step: 2, label: "2. Seus Dados" },
  { step: 3, label: "3. Pagamento" },
] as const

const FunnelDialogHeader = memo(function FunnelDialogHeader({ currentStep }: { currentStep: number }) {
  return (
    <DialogHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 pr-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <CorpFlatsIcon className="w-8 h-8" />
          <div className="min-w-0">
            <DialogTitle className="text-sm sm:text-base font-bold text-[#0F3D4C] dark:text-slate-100 leading-none">
              <CorpFlatsWordmark className="text-sm sm:text-base text-[#0F3D4C] dark:text-slate-100" />
            </DialogTitle>
            <DialogDescription className="sr-only">
              Reserva de hospedagem CorpFlats Soho Residence
            </DialogDescription>
          </div>
        </div>
      </div>

      {currentStep < 4 && (
        <div className="pt-2.5">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {FUNNEL_STEPS.map((s) => (
              <div key={s.step} className="space-y-1">
                <div className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep === s.step 
                    ? "bg-[#0F3D4C]" 
                    : currentStep > s.step 
                    ? "bg-[#C5A059]" 
                    : "bg-slate-200 dark:bg-slate-800"
                }`} />
                <span className={`text-[10px] font-bold block truncate ${
                  currentStep === s.step 
                    ? "text-[#0F3D4C] dark:text-[#E5C98B]" 
                    : currentStep > s.step 
                    ? "text-[#091E26] dark:text-[#C5A059]" 
                    : "text-slate-400"
                }`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DialogHeader>
  )
})

const FunnelDocumentUploadCard = memo(function FunnelDocumentUploadCard({
  docFileBase64,
  docFileType,
  docFileName,
  aiInspectionResult,
  isInspectingDoc,
  docInspectionError,
  isOptional = false,
  onOpenFilePicker,
  onClearDocFile,
}: {
  docFileBase64: string
  docFileType: string
  docFileName: string
  aiInspectionResult: any
  isInspectingDoc: boolean
  docInspectionError: string | null
  isOptional?: boolean
  onOpenFilePicker: () => void
  onClearDocFile: () => void
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#0F3D4C] shrink-0" />
            <span>
              Documento Oficial com Foto (RG, CNH ou Passaporte)
              {!isOptional && <span aria-hidden="true"> *</span>}
            </span>
          </Label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isOptional
              ? "Opcional agora — poderá ser enviado depois pelo link seguro após a confirmação."
              : "Aceitamos PDF ou foto legível para liberação de portaria."}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`text-[9px] font-bold shrink-0 ${
            isOptional
              ? "border-amber-400/70 text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40"
              : "border-[#C5A059]/60 text-[#0F3D4C] dark:text-[#E5C98B]"
          }`}
        >
          {isOptional ? "Opcional agora" : "Obrigatório"}
        </Badge>
      </div>

      {!docFileBase64 ? (
        <div 
          onClick={onOpenFilePicker}
          className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#0F3D4C] cursor-pointer flex flex-col items-center justify-center gap-2 text-center transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/30 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              Fotografar ou Selecionar Documento
            </span>
            <span className="text-[11px] text-slate-500">
              CNH Digital, RG ou Passaporte (PDF ou Imagem)
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {docFileType === "pdf" ? (
                <div className="w-10 h-10 rounded-lg bg-[#0F3D4C]/10 flex items-center justify-center text-[#0F3D4C] font-bold shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100">
                  <img src={docFileBase64} alt="Prévia" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                  {docFileName || "documento_oficial"}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Badge className="bg-[#0F3D4C] text-white text-[9px] py-0 px-1.5 font-bold">
                    ✓ Anexado ({docFileType.toUpperCase()})
                  </Badge>
                  {aiInspectionResult?.isLegible && (
                    <Badge variant="outline" className="border-[#C5A059]/50 text-[#0F3D4C] text-[9px] py-0 px-1.5 font-bold">
                      ✓ Validado
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenFilePicker}
                className="text-xs h-8 px-2.5 rounded-lg"
              >
                Trocar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onClearDocFile}
                className="text-xs h-8 px-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {isInspectingDoc && (
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-[#0F3D4C] shrink-0" />
              <span>Verificando legibilidade do documento...</span>
            </div>
          )}

          {docInspectionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Documento Não Aceito</span>
                <p>{docInspectionError}</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={onOpenFilePicker}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] h-7 px-2.5 mt-1 rounded-lg"
                >
                  Enviar Outra Foto Mais Nítida
                </Button>
              </div>
            </div>
          )}

          {!isInspectingDoc && !docInspectionError && aiInspectionResult && (aiInspectionResult.nameMatches === false || aiInspectionResult.cpfMatches === false) && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Atenção: Conferência de Titularidade</span>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {aiInspectionResult.nameMatches === false 
                    ? "O nome extraído do documento parece divergir do titular informado." 
                    : "O CPF constante no documento parece divergir do informado."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
})

function formatBrl(val: number): string {
  const num = Math.round(Number(val || 0) * 100) / 100
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

const FunnelStaySummaryCard = memo(function FunnelStaySummaryCard({
  checkin,
  checkout,
  nights,
  ratePlan,
  selectedDailyRate,
  otaSelectedDailyRate,
  onToggleRatePlan,
}: {
  checkin: string
  checkout: string
  nights: number
  ratePlan: "with_breakfast" | "room_only"
  selectedDailyRate: number
  otaSelectedDailyRate?: number
  onToggleRatePlan: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 sm:p-4 space-y-3 shadow-2xs">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[#0F3D4C]" />
          <span>Resumo da Hospedagem</span>
        </span>
        <Badge variant="secondary" className="bg-[#0F3D4C]/10 text-[#0F3D4C] border border-[#C5A059]/30 font-bold text-[11px] px-2.5 py-0.5 rounded-lg">
          {nights} {nights === 1 ? "diária" : "diárias"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3 shadow-2xs">
          <div className="w-9 h-9 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Check-in
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 block truncate">
              {formatDisplayDate(checkin)}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3 shadow-2xs">
          <div className="w-9 h-9 rounded-xl bg-[#0F3D4C]/8 text-[#0F3D4C] border border-[#C5A059]/25 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Check-out
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 block truncate">
              {formatDisplayDate(checkout)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40 flex items-center justify-center shrink-0 font-bold">
            {ratePlan === "with_breakfast" ? <Coffee className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Tarifa Selecionada
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100">
                {ratePlan === "with_breakfast" ? "Com Café da Manhã" : "Somente Hospedagem (Sem Café)"}
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span>•</span>
                {otaSelectedDailyRate && otaSelectedDailyRate > selectedDailyRate && (
                  <span className="text-[11px] text-slate-400 line-through" title="Valor no Booking e Airbnb">
                    R$ {formatBrl(otaSelectedDailyRate)}
                  </span>
                )}
                <span className="text-slate-800 dark:text-slate-200 font-bold">
                  R$ {formatBrl(selectedDailyRate)}/noite no PIX
                </span>
              </span>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleRatePlan}
          className="h-8 px-3 text-xs font-bold rounded-xl border-slate-200 dark:border-slate-700 text-[#0F3D4C] dark:text-[#E5C98B] hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 self-start sm:self-auto gap-1.5 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#0F3D4C]" />
          <span>Trocar para {ratePlan === "with_breakfast" ? "Sem Café" : "Com Café"}</span>
        </Button>
      </div>
    </div>
  )
})

const FunnelRoomConfigList = memo(function FunnelRoomConfigList({
  rooms,
  ratePlan,
  occupancySecondGuestDiff,
  twinFeeUnit,
  otaTwinFeeUnit,
  extraBedFeeUnit,
  otaExtraBedFeeUnit,
  addRoom,
  removeRoom,
  updateRoom,
}: {
  rooms: RoomConfig[]
  ratePlan: "with_breakfast" | "room_only"
  occupancySecondGuestDiff: number
  twinFeeUnit: number
  otaTwinFeeUnit?: number
  extraBedFeeUnit: number
  otaExtraBedFeeUnit?: number
  addRoom: () => void
  removeRoom: (id: number) => void
  updateRoom: (id: number, field: "bedType" | "adults", value: any) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
          Configuração dos Flats ({rooms.length}):
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRoom}
          className="text-[11px] font-bold h-7 px-2.5 rounded-lg text-[#0F3D4C] border-slate-300 hover:bg-slate-100"
        >
          + Adicionar Flat
        </Button>
      </div>

      <div className="space-y-2">
        {rooms.map((r, idx) => (
          <div key={r.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-900 dark:text-slate-100">Flat Studio #{idx + 1}</span>
              {rooms.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRoom(r.id)}
                  className="text-slate-500 hover:text-rose-600 hover:underline text-[10px]"
                >
                  Remover
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold">Configuração de Cama:</Label>
                <select
                  value={r.bedType}
                  onChange={e => updateRoom(r.id, "bedType", e.target.value as any)}
                  className="w-full h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value="queen">1 Cama Queen Casal</option>
                  <option value="twin">2 Camas Solteiro (+R$ {formatBrl(twinFeeUnit)})</option>
                </select>
                {r.bedType === "twin" && otaTwinFeeUnit && otaTwinFeeUnit > twinFeeUnit && (
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Nas plataformas: <span className="line-through text-slate-400">R$ {formatBrl(otaTwinFeeUnit)}</span> • Direto: R$ {formatBrl(twinFeeUnit)}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold">Hóspedes:</Label>
                <select
                  value={r.adults}
                  onChange={e => updateRoom(r.id, "adults", Number(e.target.value))}
                  className="w-full h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  <option value="1">1 Hóspede</option>
                  <option value="2">
                    {ratePlan === "with_breakfast" && occupancySecondGuestDiff > 0
                      ? `2 Hóspedes (+R$ ${formatBrl(occupancySecondGuestDiff)}/noite)`
                      : "2 Hóspedes"}
                  </option>
                  <option value="3">
                    {ratePlan === "with_breakfast" && occupancySecondGuestDiff > 0
                      ? `3 Hósp. (+R$ ${formatBrl(occupancySecondGuestDiff * 2)}/noite + Colchonete R$ ${formatBrl(extraBedFeeUnit)})`
                      : `3 Hósp. (Colchonete +R$ ${formatBrl(extraBedFeeUnit)})`}
                  </option>
                </select>
                {r.adults === 3 && otaExtraBedFeeUnit && otaExtraBedFeeUnit > extraBedFeeUnit && (
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Colchonete nas plataformas: <span className="line-through text-slate-400">R$ {formatBrl(otaExtraBedFeeUnit)}</span> • Direto: R$ {formatBrl(extraBedFeeUnit)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

const FunnelPriceBreakdownCard = memo(function FunnelPriceBreakdownCard({
  nights,
  flatsCount,
  ratePlan,
  subtotal,
  cleaningFee,
  otaCleaningFee,
  extraBedFee,
  otaExtraBedFee,
  lateCheckout,
  lateCheckoutTime,
  lateCheckoutFee,
  otaLateCheckoutFee,
  petFee,
  otaPetFee,
  twinFee,
  otaTwinFee,
  paymentMethod,
  pixDiscountAmount,
  totalAmount,
  otaReferenceTotal,
  otaSavingsAmount,
  policyType,
  policyExplanation,
}: {
  nights: number
  flatsCount: number
  ratePlan: "with_breakfast" | "room_only"
  subtotal: number
  cleaningFee: number
  otaCleaningFee?: number
  extraBedFee: number
  otaExtraBedFee?: number
  lateCheckout: boolean
  lateCheckoutTime: string
  lateCheckoutFee: number
  otaLateCheckoutFee?: number
  petFee: number
  otaPetFee?: number
  twinFee: number
  otaTwinFee?: number
  paymentMethod: "pix" | "card"
  pixDiscountAmount: number
  totalAmount: number
  otaReferenceTotal?: number
  otaSavingsAmount?: number
  policyType: string
  policyExplanation: string
}) {
  return (
    <>
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
        <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
          <span>Diárias ({nights} {nights === 1 ? "noite" : "noites"} • {flatsCount} {flatsCount === 1 ? "flat" : "flats"} • {ratePlan === "with_breakfast" ? "Com Café" : "Sem Café"}):</span>
          <span className="shrink-0">R$ {formatBrl(subtotal)}</span>
        </div>

        {cleaningFee > 0 && (
          <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
            <span>Taxa de Limpeza:</span>
            <span className="shrink-0">
              {otaCleaningFee && otaCleaningFee > cleaningFee && (
                <span className="line-through text-slate-400 mr-1.5" title="Valor no Booking e Airbnb">
                  R$ {formatBrl(otaCleaningFee)}
                </span>
              )}
              + R$ {formatBrl(cleaningFee)}
            </span>
          </div>
        )}

        {extraBedFee > 0 && (
          <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
            <span>Colchonete Extra (3º Hóspede):</span>
            <span className="shrink-0">
              {otaExtraBedFee && otaExtraBedFee > extraBedFee && (
                <span className="line-through text-slate-400 mr-1.5" title="Valor no Booking e Airbnb">
                  R$ {formatBrl(otaExtraBedFee)}
                </span>
              )}
              + R$ {formatBrl(extraBedFee)}
            </span>
          </div>
        )}

        {lateCheckout && (
          <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
            <span>Late Check-out no Domingo (até {lateCheckoutTime}):</span>
            {lateCheckoutFee === 0 ? (
              <span className="text-[#0F3D4C] font-semibold shrink-0">Cortesia (R$ 0)</span>
            ) : (
              <span className="shrink-0">
                {otaLateCheckoutFee && otaLateCheckoutFee > lateCheckoutFee && (
                  <span className="line-through text-slate-400 mr-1.5" title="Valor no Booking e Airbnb">
                    R$ {formatBrl(otaLateCheckoutFee)}
                  </span>
                )}
                + R$ {formatBrl(lateCheckoutFee)}
              </span>
            )}
          </div>
        )}

        {petFee > 0 && (
          <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
            <span>Taxa de Higienização Pet:</span>
            <span className="shrink-0">
              {otaPetFee && otaPetFee > petFee && (
                <span className="line-through text-slate-400 mr-1.5" title="Valor no Booking e Airbnb">
                  R$ {formatBrl(otaPetFee)}
                </span>
              )}
              + R$ {formatBrl(petFee)}
            </span>
          </div>
        )}

        {twinFee > 0 && (
          <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
            <span>Configuração 2 Camas Solteiro:</span>
            <span className="shrink-0">
              {otaTwinFee && otaTwinFee > twinFee && (
                <span className="line-through text-slate-400 mr-1.5" title="Valor no Booking e Airbnb">
                  R$ {formatBrl(otaTwinFee)}
                </span>
              )}
              + R$ {formatBrl(twinFee)}
            </span>
          </div>
        )}

        {paymentMethod === "pix" && pixDiscountAmount > 0 && (
          <div className="flex justify-between gap-2 text-[#0F3D4C] dark:text-[#E5C98B] font-semibold pt-1 border-t border-slate-200 dark:border-slate-700">
            <span>Desconto no PIX:</span>
            <span className="shrink-0">- R$ {formatBrl(pixDiscountAmount)}</span>
          </div>
        )}

        {otaReferenceTotal && otaSavingsAmount && otaSavingsAmount > 0 && (
          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1">
            <div className="flex justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Mesma estadia no Booking / Airbnb (c/ taxas):</span>
              <span className="line-through shrink-0">R$ {formatBrl(otaReferenceTotal)}</span>
            </div>
            <div className="flex justify-between gap-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <span>Economia reservando direto no site:</span>
              <span className="shrink-0">- R$ {formatBrl(otaSavingsAmount)}</span>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
          <span>Valor Final a Pagar:</span>
          <span className="text-[#091E26] dark:text-[#E5C98B] text-xl shrink-0">
            R$ {formatBrl(totalAmount)}
          </span>
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold text-slate-800 dark:text-slate-200">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" />
            <span>Política de Cancelamento: {policyType === "flexivel" ? "Flexível" : "Padrão"}</span>
          </span>
        </div>
        <p>{policyExplanation}</p>
      </div>
    </>
  )
})

const FunnelMinorNoticeDialog = memo(function FunnelMinorNoticeDialog({
  open,
  onOpenChange,
  onAcknowledge,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAcknowledge: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-3xl z-[100]">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 text-2xl mb-2">
            👶
          </div>
          <DialogTitle className="text-base font-black text-slate-900 dark:text-slate-100">
            Atenção: Hospedagem de Menores de Idade
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
            Legislação Federal - Estatuto da Criança e do Adolescente (ECA - Art. 82)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed py-2">
          <p>
            Identificamos que o hóspede possui <strong>menos de 18 anos</strong>.
          </p>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-2">
            <p className="font-bold text-amber-900 dark:text-amber-200">
              Conforme o Artigo 82 da Lei Federal nº 8.069/1990:
            </p>
            <ul className="list-disc pl-4 space-y-1.5 text-amber-800 dark:text-amber-300 text-[11px]">
              <li>
                A hospedagem só é permitida caso o menor esteja acompanhado dos pais ou de um responsável maior expressamente autorizado;
              </li>
              <li>
                Caso desacompanhado dos pais, é <strong>estritamente obrigatória</strong> a apresentação na recepção da <strong>autorização formal por escrito assinada pelos pais com firma reconhecida em cartório</strong>.
              </li>
            </ul>
          </div>
          <p className="text-[11px] text-slate-500">
            Nossa equipe no Edifício Soho realizará a conferência desta documentação no momento da entrega das chaves.
          </p>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <Button
            type="button"
            onClick={onAcknowledge}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white font-bold text-xs h-auto min-h-10 py-2.5 px-4 rounded-xl whitespace-normal leading-snug text-center"
          >
            Estou Ciente e Apresentarei a Autorização com Firma Reconhecida
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const parts = dateStr.split("-").map(Number)
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
      const rawWeek = format(d, "EEE", { locale: ptBR })
      const cleanWeek = rawWeek.replace(".", "").trim()
      const capitalizedWeek = cleanWeek.charAt(0).toUpperCase() + cleanWeek.slice(1)
      const day = format(d, "dd")
      const rawMonth = format(d, "MMMM", { locale: ptBR })
      const capitalizedMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)
      return `${capitalizedWeek}, ${day} ${capitalizedMonth}`
    }
  } catch {}
  return dateStr
}

export interface BookingFunnelModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkin: string
  checkout: string
  nights: number
  rooms: RoomConfig[]
  ratePlan: "with_breakfast" | "room_only"
  setRatePlan: (plan: "with_breakfast" | "room_only") => void
  updateRoom: (id: number, field: "bedType" | "adults", value: any) => void
  addRoom: () => void
  removeRoom: (id: number) => void
  siteConfig: any
  guestAccount: any
  onOpenAuthModal: () => void
  onSuccessBooking?: (reservation: any) => void
  availabilityData?: any
}

export function BookingFunnelModal({
  open,
  onOpenChange,
  checkin,
  checkout,
  nights,
  rooms,
  ratePlan,
  setRatePlan,
  updateRoom,
  addRoom,
  removeRoom,
  siteConfig,
  guestAccount,
  onOpenAuthModal,
  onSuccessBooking,
  availabilityData
}: BookingFunnelModalProps) {
  const [, setLocation] = useLocation()
  // Funnel Stepper (1 to 4: 1. Extras, 2. Seus Dados, 3. Pagamento, 4. Conclusão)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)

  // Session ID única para telemetria e recuperação de carrinho
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      const existing = sessionStorage.getItem("corpflats_funnel_session")
      if (existing) return existing
      const newId = `funnel_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      sessionStorage.setItem("corpflats_funnel_session", newId)
      return newId
    }
    return `funnel_${Date.now()}`
  })

  // Helper para carregar perfil em cache local
  const getCachedProfile = () => {
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem("corpflats_guest_profile")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  // Solicitante vs Hóspede (quando quem reserva não é o próprio hóspede)
  const [requesterType, setRequesterType] = useState<"guest" | "other_person">("guest")
  const [requesterName, setRequesterName] = useState(() => guestAccount?.name || getCachedProfile()?.name || "")
  const [requesterPhone, setRequesterPhone] = useState(() => maskPhone(guestAccount?.phone || getCachedProfile()?.phone || ""))
  const [requesterEmail, setRequesterEmail] = useState(() => guestAccount?.email || getCachedProfile()?.email || (typeof window !== "undefined" ? localStorage.getItem("corpflats_guest_email") || "" : ""))
  const [requesterDocument, setRequesterDocument] = useState(() => maskCpf(guestAccount?.document || getCachedProfile()?.document || ""))
  const isSeparateRequester = requesterType !== "guest"

  // Guest Details com inicialização a partir de guestAccount ou cache local
  const [guestName, setGuestName] = useState(() => guestAccount?.name || getCachedProfile()?.name || "")
  const [guestPhone, setGuestPhone] = useState(() => maskPhone(guestAccount?.phone || getCachedProfile()?.phone || ""))
  const [guestEmail, setGuestEmail] = useState(() => guestAccount?.email || getCachedProfile()?.email || (typeof window !== "undefined" ? localStorage.getItem("corpflats_guest_email") || "" : ""))
  const [guestDocument, setGuestDocument] = useState(() => maskCpf(guestAccount?.document || getCachedProfile()?.document || ""))
  const [guestAddress, setGuestAddress] = useState(() => guestAccount?.address || getCachedProfile()?.address || "")
  const [guestCity, setGuestCity] = useState(() => guestAccount?.city || getCachedProfile()?.city || "")
  const [guestState, setGuestState] = useState(() => guestAccount?.state || getCachedProfile()?.state || "RJ")
  const [guestCep, setGuestCep] = useState(() => guestAccount?.cep || getCachedProfile()?.cep || "")
  const [loadingFunnelCep, setLoadingFunnelCep] = useState(false)
  const [isSavingPostRegistration, setIsSavingPostRegistration] = useState(false)
  const [postRegistrationSaved, setPostRegistrationSaved] = useState(false)

  const handleSelectRequesterMode = (nextMode: "guest" | "other_person") => {
    if (nextMode === requesterType) return
    const acc = guestAccount || getCachedProfile()
    if (nextMode === "other_person") {
      if (!requesterName.trim() && guestName.trim()) setRequesterName(guestName)
      if (!requesterPhone.trim() && guestPhone.trim()) setRequesterPhone(guestPhone)
      if (!requesterEmail.trim() && guestEmail.trim()) setRequesterEmail(guestEmail)
      if (!requesterDocument.trim() && guestDocument.trim()) setRequesterDocument(guestDocument)
      // Se os campos de hóspede continham os próprios dados do solicitante logado/em cache, limpa-os para não enviar o solicitante como hóspede
      const isSelfPrefilled = Boolean(
        (acc?.name && guestName.trim() === String(acc.name).trim()) ||
        (acc?.email && guestEmail.trim().toLowerCase() === String(acc.email).trim().toLowerCase()) ||
        (guestName.trim() && guestName.trim() === (requesterName.trim() || guestName.trim()))
      )
      if (isSelfPrefilled) {
        setGuestName("")
        setGuestPhone("")
        setGuestEmail("")
        setGuestDocument("")
        setGuestAddress("")
        setGuestCity("")
        setGuestCep("")
      }
      if (docFileName === "documento_salvo_no_cadastro") {
        setDocFileBase64("")
        setDocFileName("")
        setAiInspectionResult(null)
        setDocInspectionError(null)
      }
    } else {
      if (!guestName.trim() && (acc?.name || requesterName.trim())) setGuestName(acc?.name || requesterName)
      if (!guestPhone.trim() && (acc?.phone || requesterPhone.trim())) setGuestPhone(maskPhone(acc?.phone || requesterPhone))
      if (!guestEmail.trim() && (acc?.email || requesterEmail.trim())) setGuestEmail(acc?.email || requesterEmail)
      if (!guestDocument.trim() && (acc?.document || requesterDocument.trim())) setGuestDocument(maskCpf(acc?.document || requesterDocument))
      if (!docFileBase64 && acc?.docPhotoUrl) {
        setDocFileBase64(acc.docPhotoUrl)
        setDocFileName("documento_salvo_no_cadastro")
        setDocFileType(acc.docPhotoUrl.startsWith("data:application/pdf") || acc.docPhotoUrl.toLowerCase().includes(".pdf") ? "pdf" : "image")
      }
    }
    setRequesterType(nextMode)
  }

  // Anexo de Documento Oficial Obrigatório & Inspeção de IA (pré-carregado se já salvo anteriormente)
  const [docFileBase64, setDocFileBase64] = useState<string>(() => guestAccount?.docPhotoUrl || getCachedProfile()?.docPhotoUrl || "")
  const [docFileName, setDocFileName] = useState<string>(() => (guestAccount?.docPhotoUrl || getCachedProfile()?.docPhotoUrl) ? "documento_salvo_no_cadastro" : "")
  const [docFileType, setDocFileType] = useState<"pdf" | "image">(() => {
    const saved = guestAccount?.docPhotoUrl || getCachedProfile()?.docPhotoUrl || ""
    return saved.startsWith("data:application/pdf") || saved.toLowerCase().includes(".pdf") ? "pdf" : "image"
  })
  const [isInspectingDoc, setIsInspectingDoc] = useState(false)
  const [aiInspectionResult, setAiInspectionResult] = useState<any | null>(null)
  const [docInspectionError, setDocInspectionError] = useState<string | null>(null)
  const [showMinorNoticeModal, setShowMinorNoticeModal] = useState(false)
  const [minorNoticeAcknowledged, setMinorNoticeAcknowledged] = useState(false)
  const docFileInputRef = useRef<HTMLInputElement>(null)

  const handleDocFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setDocFileName(file.name)
    setDocInspectionError(null)

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    setDocFileType(isPdf ? "pdf" : "image")

    try {
      let base64String = ""
      if (isPdf) {
        base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      } else {
        const compressed = await compressImage(file, {
          maxWidth: 1400,
          maxHeight: 1400,
          quality: 0.82,
          preferredFormat: "image/webp"
        })
        base64String = compressed.base64
      }

      setDocFileBase64(base64String)

      // Dispara imediatamente inspeção preliminar de IA
      setIsInspectingDoc(true)
      try {
        const res = await fetch("/api/ai/inspect-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64String,
            fileName: file.name,
            providedName: guestName,
            providedCpf: guestDocument,
            reservationName: guestName,
            reservationCpf: guestDocument,
            providedCity: guestCity,
            providedAddress: guestAddress
          })
        })
        if (res.ok) {
          const data = await res.json()
          setAiInspectionResult(data)
          const officialDocName = (data.canonicalGuestName || data.extractedName || "").trim()
          if (officialDocName && data.identityMatches !== false && data.nameMatches !== false && data.reservationNameMatches !== false) {
            if (data.nameAutoCorrected || !guestName.trim() || guestName.trim().split(/\s+/).length < officialDocName.split(/\s+/).length) {
              setGuestName(officialDocName)
            }
          }
          if (data.isOfficialDocument === false) {
            setDocInspectionError("O arquivo enviado não foi identificado como um documento oficial de identificação com foto (RG, CNH, Passaporte). Por favor, anexe seu documento oficial.")
          } else if (data.isLegible === false) {
            setDocInspectionError(data.legibilityReason || "Documento ilegível. Por favor, tire outra foto mais nítida ou anexe o PDF oficial.")
          } else if (data.isMinor) {
            setShowMinorNoticeModal(true)
          }
        }
      } catch (err: any) {
        console.warn("Falha na chamada da IA de documentos:", err)
      } finally {
        setIsInspectingDoc(false)
      }
    } catch (err: any) {
      alert("Erro ao processar arquivo: " + err.message)
    }
  }

  // PJ Corporate Billing
  const [isWorkTrip, setIsWorkTrip] = useState(false)
  const [companyCnpj, setCompanyCnpj] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")

  // Veículo
  const [hasVehicle, setHasVehicle] = useState(false)
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [vehicleModel, setVehicleModel] = useState("")

  // Upsells & Extras
  const earlyCheckin = false // Early check-in nunca oferecido conforme regra de negócio
  const [lateCheckout, setLateCheckout] = useState(false)
  const [lateCheckoutTime, setLateCheckoutTime] = useState("18:00")
  const [bringingPet, setBringingPet] = useState(false)
  const [petCount, setPetCount] = useState(1)
  const [petRulesAccepted, setPetRulesAccepted] = useState(false)

  // Valida se o check-out ocorre no Domingo (0 = Domingo)
  const isSundayCheckout = useMemo(() => {
    if (!checkout) return false
    const parts = checkout.split("-").map(Number)
    if (parts.length !== 3) return false
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
    return d.getDay() === 0
  }, [checkout])

  // Se a data de checkout mudar para outro dia que não é domingo, desativa o late check-out
  useEffect(() => {
    if (!isSundayCheckout && lateCheckout) {
      setLateCheckout(false)
      setLateCheckoutTime("18:00")
    }
  }, [isSundayCheckout, lateCheckout])

  // Payment Selection
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix")
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmedReservation, setConfirmedReservation] = useState<any | null>(null)
  const [pixData, setPixData] = useState<any | null>(null)
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [pixKeyCopied, setPixKeyCopied] = useState(false)
  const [isPixPaid, setIsPixPaid] = useState(false)

  // Polling para checar status do pagamento PIX automaticamente na etapa 4 (Concluído)
  useEffect(() => {
    if (currentStep !== 4 || paymentMethod !== "pix" || !confirmedReservation || isPixPaid) return;
    const resCode = confirmedReservation.code || confirmedReservation.reservationCode;
    if (!resCode) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pms/reservations/${encodeURIComponent(resCode)}/payment-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.paid || data.paymentStatus === "pago_total" || data.paymentStatus === "pago") {
            setIsPixPaid(true);
            clearInterval(interval);
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [currentStep, paymentMethod, confirmedReservation, isPixPaid]);

  const handleResetAndNewBooking = () => {
    setCurrentStep(1);
    setConfirmedReservation(null);
    setPixData(null);
    setIsPixPaid(false);
    setMpInitPoint(null);
    setPixCopied(false);
    setPixKeyCopied(false);
  };

  const handleCloseModal = () => {
    const resCode = confirmedReservation?.code || confirmedReservation?.id;
    onOpenChange(false);
    if (currentStep === 4) {
      setTimeout(() => {
        handleResetAndNewBooking();
        if (resCode) {
          setLocation(`/minha-reserva/${resCode}`);
        }
      }, 150);
    }
  };

  // Se o modal for reaberto e estava na etapa 4 (concluída), reinicia na etapa 1 para uma nova reserva
  useEffect(() => {
    if (open && currentStep === 4 && isPixPaid) {
      handleResetAndNewBooking();
    }
  }, [open]);

  // Exit-Intent Modal
  const [showExitIntent, setShowExitIntent] = useState(false)
  const exitIntentTriggeredRef = useRef(false)

  // Auto-fill from guestAccount if logged in or when modal opens
  useEffect(() => {
    const acc = guestAccount || getCachedProfile()
    if (acc) {
      if (acc.name && !requesterName) setRequesterName(acc.name)
      if (acc.phone && !requesterPhone) setRequesterPhone(maskPhone(acc.phone))
      if (acc.email && !requesterEmail) setRequesterEmail(acc.email)
      if (acc.document && !requesterDocument) setRequesterDocument(maskCpf(acc.document))
      if (!isSeparateRequester) {
        if (acc.name && (!guestName || guestName !== acc.name)) setGuestName(acc.name)
        if (acc.phone) setGuestPhone(maskPhone(acc.phone))
        if (acc.email && (!guestEmail || guestEmail !== acc.email)) setGuestEmail(acc.email)
        if (acc.document) setGuestDocument(maskCpf(acc.document))
        if (acc.address && (!guestAddress || guestAddress !== acc.address)) setGuestAddress(acc.address)
        if (acc.city && (!guestCity || guestCity !== acc.city)) setGuestCity(acc.city)
        if (acc.state && (!guestState || guestState !== acc.state)) setGuestState(acc.state)
        if (acc.cep && (!guestCep || guestCep !== acc.cep)) setGuestCep(acc.cep)
        if (acc.docPhotoUrl && !docFileBase64) {
          setDocFileBase64(acc.docPhotoUrl)
          setDocFileName("documento_salvo_no_cadastro")
          setDocFileType(acc.docPhotoUrl.startsWith("data:application/pdf") || acc.docPhotoUrl.toLowerCase().includes(".pdf") ? "pdf" : "image")
        }
      }
      if (acc.vehicle?.plate) {
        setHasVehicle(true)
        setVehiclePlate(acc.vehicle.plate)
        setVehicleModel(acc.vehicle.model || "")
      }
      if (acc.companyData?.cnpj) {
        setIsWorkTrip(true)
        setCompanyCnpj(acc.companyData.cnpj)
        setCompanyName(acc.companyData.companyName || "")
      }
    }
  }, [guestAccount, open])

  // Login direto com o Google de dentro da etapa 3 do funil
  const handleGoogleLoginInFunnel = async () => {
    try {
      await loginWithGooglePopup((user) => {
        if (user.name) setGuestName(user.name)
        if (user.email) setGuestEmail(user.email)
        if (user.phone) setGuestPhone(maskPhone(user.phone))
        if (user.document) setGuestDocument(maskCpf(user.document))
        if (user.address) setGuestAddress(user.address)
        if (user.city) setGuestCity(user.city)
        if (user.state) setGuestState(user.state)
        if (user.cep) setGuestCep(user.cep)
        if (user.docPhotoUrl) {
          setDocFileBase64(user.docPhotoUrl)
          setDocFileName("documento_salvo_no_cadastro")
          setDocFileType(user.docPhotoUrl.startsWith("data:application/pdf") || user.docPhotoUrl.toLowerCase().includes(".pdf") ? "pdf" : "image")
        }
        if (user.vehicle?.plate) {
          setHasVehicle(true)
          setVehiclePlate(user.vehicle.plate)
          setVehicleModel(user.vehicle.model || "")
        }
      })
    } catch {}
  }

  // Consulta e Estado de Disponibilidade Real
  const [internalAvailability, setInternalAvailability] = useState<any>(availabilityData || null)

  useEffect(() => {
    if (availabilityData) {
      setInternalAvailability(availabilityData)
    } else if (open && checkin && checkout) {
      fetch(`/api/reservations/availability?checkin=${checkin}&checkout=${checkout}`)
        .then(res => res.json())
        .then(data => setInternalAvailability(data))
        .catch(() => {})
    }
  }, [availabilityData, open, checkin, checkout])

  const activeAvailability = availabilityData || internalAvailability
  const minAvailable = typeof activeAvailability?.minAvailableOnAnyDate === "number"
    ? activeAvailability.minAvailableOnAnyDate
    : (typeof activeAvailability?.totalAvailableFlats === "number" ? activeAvailability.totalAvailableFlats : null)

  // Mostrar essa mensagem somente quando tiver 5 flats ou menos disponíveis para uma ou mais datas solicitadas
  const showUrgencyBanner = Boolean(
    activeAvailability?.hasLowAvailability ?? (minAvailable !== null ? minAvailable <= 5 : false)
  )

  // Pricing & Calculations (Sincronizados com SEBRAE / Calendário / Preços)
  const flatsCount = rooms.length
  const dynPricing = activeAvailability?.dynamicPricing
  const breakfastSurchargePerGuest = Number(
    dynPricing?.breakfastSurchargePerGuest ??
    siteConfig?.pricing?.breakfastSurchargePerGuest ??
    20
  )
  const cardMarkupPercent = Number(
    dynPricing?.cardMarkupPercent ??
    siteConfig?.pricing?.cardMarkupPercent ??
    siteConfig?.pricing?.pixDiscountPercent ??
    5
  )
  const fallbackBaseSemCafe = Number(
    dynPricing?.avgRoomOnlyRate ??
    siteConfig?.ratePlans?.room_only?.dailyRate ??
    216.49
  )
  const perNightBaseSemCafe: number[] =
    Array.isArray(dynPricing?.discountedSemCafeRates) && dynPricing.discountedSemCafeRates.length === nights
      ? dynPricing.discountedSemCafeRates.map((d: any) => Number(d.rate) || fallbackBaseSemCafe)
      : Array.from({ length: nights }, () => fallbackBaseSemCafe)

  const roomOnlyPixSubtotal = Math.round(
    perNightBaseSemCafe.reduce((acc, r) => acc + r * flatsCount, 0) * 100
  ) / 100
  const withBreakfastPixSubtotal = Math.round(
    perNightBaseSemCafe.reduce(
      (acc, r) =>
        acc +
        rooms.reduce(
          (s, rm) => s + Math.round((r + Math.min(3, Math.max(1, Number(rm.adults) || 1)) * breakfastSurchargePerGuest) * 100) / 100,
          0
        ),
      0
    ) * 100
  ) / 100

  const roomOnlyAvgRate = Math.round((roomOnlyPixSubtotal / (nights * flatsCount)) * 100) / 100
  const withBreakfastAvgRate = Math.round((withBreakfastPixSubtotal / (nights * flatsCount)) * 100) / 100

  const rawWithBreakfast = siteConfig?.ratePlans?.with_breakfast || {}
  const withBreakfastConfig = {
    dailyRate: withBreakfastAvgRate,
    cleaningFeeType: "per_stay",
    description: "Diária com Café da Manhã servido exclusivamente no flat",
    ...rawWithBreakfast,
    cleaningFeeEnabled: Boolean(rawWithBreakfast.cleaningFeeEnabled),
    cleaningFeeAmount: Number(rawWithBreakfast.cleaningFeeAmount ?? 0)
  }
  withBreakfastConfig.dailyRate = withBreakfastAvgRate

  const rawRoomOnly = siteConfig?.ratePlans?.room_only || {}
  const roomOnlyConfig = {
    dailyRate: roomOnlyAvgRate,
    cleaningFeeType: "per_stay",
    description: "Hospedagem em flat completo sem café da manhã",
    ...rawRoomOnly,
    cleaningFeeEnabled: rawRoomOnly.cleaningFeeEnabled !== false,
    cleaningFeeAmount: Number(rawRoomOnly.cleaningFeeAmount ?? 70)
  }
  roomOnlyConfig.dailyRate = roomOnlyAvgRate

  const currentPlan = ratePlan === "with_breakfast" ? withBreakfastConfig : roomOnlyConfig
  const selectedDailyRate = ratePlan === "with_breakfast" ? withBreakfastAvgRate : roomOnlyAvgRate
  const pixAccommodationSubtotal = ratePlan === "with_breakfast" ? withBreakfastPixSubtotal : roomOnlyPixSubtotal

  const discountPercent = 0
  const discountAmount = 0

  // Taxa de Limpeza (apenas no plano Sem Café por padrão; zero menção no plano Com Café)
  const cleaningFeePerFlat = currentPlan.cleaningFeeEnabled
    ? (currentPlan.cleaningFeeType === "per_night" ? (Number(currentPlan.cleaningFeeAmount) || 0) * nights : (Number(currentPlan.cleaningFeeAmount) || 0))
    : 0
  const cleaningFee = Math.round(cleaningFeePerFlat * flatsCount * 100) / 100

  // Taxa de Camas Solteiro (Twin)
  const twinCount = useMemo(() => rooms.filter(r => r.bedType === "twin").length, [rooms])
  const twinFeeUnit = siteConfig?.bedConfig?.twinFeeAmount ?? 30
  const twinFee = twinCount * (siteConfig?.bedConfig?.twinFeeType === "per_night" ? twinFeeUnit * nights : twinFeeUnit)

  // Taxa de Colchonete Extra
  const extraBedCount = useMemo(() => rooms.filter(r => r.adults === 3).length, [rooms])
  const extraBedFeeUnit = siteConfig?.extraBedConfig?.feeAmount ?? 60
  const extraBedFee = extraBedCount * (siteConfig?.extraBedConfig?.feeType === "per_night" ? extraBedFeeUnit * nights : extraBedFeeUnit)

  // Taxa Pet
  const petFeePerUnit = siteConfig?.petPolicy?.feeAmount ?? 80
  const petFee = bringingPet
    ? (siteConfig?.petPolicy?.feeType === "per_night" ? petFeePerUnit * nights * petCount : petFeePerUnit * petCount)
    : 0

  // Upsell Domingo: Late Check-out com Tarifação Dinâmica por Horário
  const lateCheckoutTier = useMemo(() => {
    if (!isSundayCheckout || !lateCheckout) {
      return { feePerFlat: 0, feeTotal: 0, isFree: false, isDailyRate: false }
    }
    const [hStr, mStr] = (lateCheckoutTime || "18:00").split(":")
    const hours = (parseInt(hStr, 10) || 0) + ((parseInt(mStr || "0", 10) || 0) / 60)

    if (hours <= 13.0) {
      return {
        feePerFlat: 0,
        feeTotal: 0,
        isFree: true,
        isDailyRate: false
      }
    } else if (hours <= 18.0) {
      return {
        feePerFlat: 50,
        feeTotal: 50 * flatsCount,
        isFree: false,
        isDailyRate: false
      }
    } else {
      return {
        feePerFlat: selectedDailyRate,
        feeTotal: Math.round(selectedDailyRate * flatsCount * 100) / 100,
        isFree: false,
        isDailyRate: true
      }
    }
  }, [isSundayCheckout, lateCheckout, lateCheckoutTime, selectedDailyRate, flatsCount])

  const earlyCheckinFee = 0
  const lateCheckoutFee = lateCheckoutTier.feeTotal
  const extrasTotal = Math.round((cleaningFee + twinFee + extraBedFee + petFee + earlyCheckinFee + lateCheckoutFee) * 100) / 100

  // Preço Normal Canônico = Valor Final no PIX (100% integral)
  const pixTotalAmount = Math.round((pixAccommodationSubtotal + extrasTotal) * 100) / 100

  // Preço no Cartão = Incremento silencioso embutido (ex: +5%) exibido como preço padrão
  const baseTotalAmount = Math.round(pixTotalAmount * (1 + cardMarkupPercent / 100) * 100) / 100
  const pixDiscountPercent = cardMarkupPercent
  const pixDiscountAmount = Math.round((baseTotalAmount - pixTotalAmount) * 100) / 100
  const subtotal = Math.round((baseTotalAmount - extrasTotal) * 100) / 100

  // Valor Ativo
  const totalAmount = paymentMethod === "pix" ? pixTotalAmount : baseTotalAmount
  const currentTotalDiscount = paymentMethod === "pix" ? pixDiscountAmount : 0

  // Referência comparativa contra plataformas (Booking / Airbnb = Preço Base + Comissão da Plataforma em diárias e taxas)
  const otaReferenceMarkupPercent = Number(
    dynPricing?.otaComparison?.referenceMarkupPercent ??
    siteConfig?.pricing?.otaComparison?.referenceMarkupPercent ??
    15
  )
  const otaFactor = 1 + Math.max(0, otaReferenceMarkupPercent) / 100
  const otaSelectedDailyRate = Math.round(selectedDailyRate * otaFactor * 100) / 100
  const otaCleaningFee = Math.round(cleaningFee * otaFactor * 100) / 100
  const otaTwinFeeUnit = Math.round(twinFeeUnit * otaFactor * 100) / 100
  const otaTwinFee = Math.round(twinFee * otaFactor * 100) / 100
  const otaExtraBedFeeUnit = Math.round(extraBedFeeUnit * otaFactor * 100) / 100
  const otaExtraBedFee = Math.round(extraBedFee * otaFactor * 100) / 100
  const otaPetFeePerUnit = Math.round(petFeePerUnit * otaFactor * 100) / 100
  const otaPetFee = Math.round(petFee * otaFactor * 100) / 100
  const otaLateCheckoutFee = Math.round(lateCheckoutFee * otaFactor * 100) / 100
  const otaReferenceTotal = Math.round(pixTotalAmount * otaFactor * 100) / 100
  const otaSavingsAmount = Math.max(0, Math.round((otaReferenceTotal - totalAmount) * 100) / 100)

  // Política de Cancelamento (memoizada para evitar instanciar Date e recalcular a cada tecla)
  const cancellationPolicy = useMemo(
    () => calculateCancellationPolicy(new Date(), checkin, totalAmount),
    [checkin, totalAmount]
  )

  const totalGuestsCount = useMemo(
    () => rooms.reduce((acc, r) => acc + (Number(r.adults) || 2), 0),
    [rooms]
  )

  const handleToggleRatePlan = useStableCallback(() => {
    setRatePlan(ratePlan === "with_breakfast" ? "room_only" : "with_breakfast")
  })

  const stableAddRoom = useStableCallback(addRoom)
  const stableRemoveRoom = useStableCallback(removeRoom)
  const stableUpdateRoom = useStableCallback(updateRoom)

  const handleAcknowledgeMinorNotice = useStableCallback(() => {
    setMinorNoticeAcknowledged(true)
    setShowMinorNoticeModal(false)
  })

  const handleOpenDocPicker = useStableCallback(() => {
    docFileInputRef.current?.click()
  })

  const handleClearDocFile = useStableCallback(() => {
    setDocFileBase64("")
    setDocFileName("")
    setAiInspectionResult(null)
    setDocInspectionError(null)
  })

  // Telemetria do Funil
  const sendFunnelTelemetry = async (stepNum: number, stepNameStr: string, customStatus?: string) => {
    try {
      await fetch("/api/funnel/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          step: stepNum,
          stepName: stepNameStr,
          guestName: guestName.trim() || requesterName.trim(),
          guestPhone: guestPhone.trim() || requesterPhone.trim(),
          guestEmail: guestEmail.trim() || requesterEmail.trim(),
          guestDocument: guestDocument.trim() || requesterDocument.trim(),
          requesterType,
          checkinDate: checkin,
          checkoutDate: checkout,
          flatsCount,
          ratePlan,
          rooms,
          extras: {
            earlyCheckin: false,
            lateCheckout,
            lateCheckoutTime: lateCheckout ? lateCheckoutTime : null,
            earlyCheckinFee: 0,
            lateCheckoutFee,
            hasPet: bringingPet,
            petCount,
            twinCount,
            extraBedCount
          },
          paymentMethod,
          totalAmount,
          subtotal,
          discountAmount: currentTotalDiscount,
          status: customStatus || (stepNum === 5 ? "concluido" : (stepNum >= 3 ? "em_andamento" : "pesquisando"))
        })
      })
    } catch {
      // Ignora falhas silenciosas de telemetria
    }
  }

  // Dispara telemetria ao abrir ou avançar etapas (mantendo compatibilidade com métricas analíticas)
  useEffect(() => {
    if (open) {
      const telemetryMap: Record<number, { num: number; name: string }> = {
        1: { num: 2, name: "personalizacao_extras" },
        2: { num: 3, name: "identificacao_lead" },
        3: { num: 4, name: "checkout_pagamento" },
        4: { num: 5, name: "reserva_confirmada" }
      }
      const item = telemetryMap[currentStep] || { num: 2, name: "personalizacao_extras" }
      sendFunnelTelemetry(item.num, item.name)
    }
  }, [open, currentStep])

  // Exit-Intent Listener (apenas se já estiver em etapa de extras, dados ou checkout)
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (open && currentStep >= 1 && currentStep <= 3 && !exitIntentTriggeredRef.current && e.clientY <= 10) {
        exitIntentTriggeredRef.current = true
        setShowExitIntent(true)
      }
    }
    window.addEventListener("mouseleave", handleMouseLeave)
    return () => window.removeEventListener("mouseleave", handleMouseLeave)
  }, [open, currentStep])

  // Avançar Etapa com Validações
  const handleNextStep = () => {
    if (currentStep === 1) {
      if (bringingPet && !petRulesAccepted) {
        alert("Por favor, aceite as regras para animais de estimação para prosseguir.")
        return
      }
      setCurrentStep(2)
    } else if (currentStep === 2) {
      if (isSeparateRequester) {
        if (!requesterName.trim()) {
          alert("Por favor, informe o nome do solicitante ou responsável pela reserva.")
          return
        }
        const cleanReqPhone = requesterPhone.replace(/\D/g, "")
        const isIntlReqPhone = requesterPhone.trim().startsWith("+") && !cleanReqPhone.startsWith("55")
        if (!requesterPhone.trim() || cleanReqPhone.length < (isIntlReqPhone ? 8 : 10)) {
          alert("Por favor, informe um WhatsApp/telefone válido do solicitante com DDD (ou DDI internacional com +).")
          return
        }
        if (!requesterEmail.trim() || !requesterEmail.includes("@") || !requesterEmail.includes(".")) {
          alert("Por favor, informe um e-mail válido do solicitante para envio do voucher e do link de cadastro do hóspede.")
          return
        }
        const rawOptionalGuestDoc = guestDocument.trim()
        if (rawOptionalGuestDoc && !isPlausibleCpfOrPassport(rawOptionalGuestDoc)) {
          alert("O CPF ou Passaporte do hóspede informado parece inválido. Corrija-o ou deixe em branco para preencher posteriormente pelo link.")
          return
        }
        if (docFileBase64) {
          if (isInspectingDoc) {
            alert("Aguarde a análise do documento oficial por Inteligência Artificial...")
            return
          }
          if (aiInspectionResult && aiInspectionResult.isOfficialDocument === false) {
            alert("O arquivo anexado não foi reconhecido como documento oficial de identificação com foto. Remova o anexo para enviar depois via link ou anexe um RG, CNH ou Passaporte.")
            return
          }
          if (aiInspectionResult && aiInspectionResult.isLegible === false) {
            alert(`O documento anexado não pôde ser aceito: ${aiInspectionResult.legibilityReason || "Documento ilegível"}. Remova o anexo para enviar depois via link ou envie uma foto nítida.`)
            return
          }
          if (aiInspectionResult?.isMinor && !minorNoticeAcknowledged) {
            setShowMinorNoticeModal(true)
            return
          }
        }
        sendFunnelTelemetry(3, "identificacao_lead", "em_andamento")
        setCurrentStep(3)
        return
      }

      if (!guestName.trim()) {
        alert("Por favor, informe seu nome completo.")
        return
      }
      const cleanFunnelPhone = guestPhone.replace(/\D/g, "")
      const isIntlFunnelPhone = guestPhone.trim().startsWith("+") && !cleanFunnelPhone.startsWith("55")
      if (!guestPhone.trim() || cleanFunnelPhone.length < (isIntlFunnelPhone ? 8 : 10)) {
        alert("Por favor, informe um WhatsApp válido com DDD (ou DDI internacional com +).")
        return
      }
      if (!guestEmail.trim() || !guestEmail.includes("@") || !guestEmail.includes(".")) {
        alert("Por favor, informe um e-mail válido para envio do voucher.")
        return
      }
      const rawFunnelDoc = guestDocument.trim()
      const isFunnelDocValid = isPlausibleCpfOrPassport(rawFunnelDoc)
      if (!rawFunnelDoc || !isFunnelDocValid) {
        alert("Por favor, informe um CPF válido (11 dígitos) ou número de Passaporte válido para registro da reserva.")
        return
      }
      if (!docFileBase64) {
        alert("O anexo do documento oficial com foto (RG, CNH, Passaporte em PDF ou Imagem) é obrigatório para finalizar a reserva.")
        return
      }
      if (isInspectingDoc) {
        alert("Aguarde a análise do documento oficial por Inteligência Artificial...")
        return
      }
      if (aiInspectionResult && aiInspectionResult.isOfficialDocument === false) {
        alert("O arquivo anexado não foi reconhecido como documento oficial de identificação com foto. Por favor, envie foto ou PDF de um documento oficial (RG, CNH ou Passaporte).")
        return
      }
      if (aiInspectionResult && aiInspectionResult.isLegible === false) {
        alert(`O documento anexado não pôde ser aceito: ${aiInspectionResult.legibilityReason || "Documento ilegível"}. Por favor, anexe uma foto mais nítida ou o PDF original.`)
        return
      }
      if (
        aiInspectionResult &&
        (aiInspectionResult.identityMatches === false ||
          aiInspectionResult.nameMatches === false ||
          aiInspectionResult.cpfMatches === false)
      ) {
        const reasons = Array.isArray(aiInspectionResult.mismatchReasons) && aiInspectionResult.mismatchReasons.length > 0
          ? aiInspectionResult.mismatchReasons.join("\n• ")
          : "Os dados do documento anexado (Nome ou CPF) não conferem com o titular da reserva."
        alert(`⚠️ Divergência Pericial de Titularidade:\n\n• ${reasons}\n\nPor favor, anexe o documento pertencente à mesma pessoa titular da reserva ou corrija os dados informados.`)
        return
      }
      if (aiInspectionResult?.isMinor && !minorNoticeAcknowledged) {
        setShowMinorNoticeModal(true)
        return
      }

      const resolvedFunnelDocType = /[a-zA-Z]/.test(rawFunnelDoc) ? "Passaporte" : "CPF"

      // Sincroniza dados (incluindo documento anexado) com o cache local e conta no servidor para nunca mais pedir novamente
      try {
        const currentProf = getCachedProfile() || {}
        saveSessionLocally({
          ...currentProf,
          id: currentProf.id || guestAccount?.id || guestEmail.trim(),
          name: guestName.trim(),
          email: guestEmail.trim(),
          phone: guestPhone.trim(),
          docType: resolvedFunnelDocType,
          document: guestDocument.trim(),
          address: guestAddress.trim(),
          city: guestCity.trim(),
          state: guestState.trim(),
          cep: guestCep.trim(),
          docPhotoUrl: docFileBase64 || currentProf.docPhotoUrl || null
        })
      } catch {}

      if (cleanFunnelPhone.length >= (isIntlFunnelPhone ? 8 : 10) || isFunnelDocValid) {
        updateAccountProfile({
          name: guestName.trim(),
          phone: guestPhone.trim(),
          docType: resolvedFunnelDocType,
          document: guestDocument.trim(),
          address: guestAddress.trim(),
          city: guestCity.trim(),
          state: guestState.trim(),
          cep: guestCep.trim(),
          docPhotoUrl: docFileBase64 || undefined,
          ...(hasVehicle && vehiclePlate
            ? {
                vehicle: {
                  ...(guestAccount?.vehicle || {}),
                  plate: vehiclePlate.toUpperCase().trim(),
                  model: vehicleModel.trim()
                }
              }
            : {}),
          ...(isWorkTrip && companyCnpj
            ? {
                companyData: {
                  ...(guestAccount?.companyData || {}),
                  cnpj: companyCnpj.trim(),
                  companyName: companyName.trim(),
                  ...(companyEmail.trim() ? { companyEmail: companyEmail.trim() } : {}),
                  ...(companyPhone.trim() ? { companyPhone: companyPhone.trim() } : {})
                }
              }
            : {})
        }).then(res => {
          if (res?.success && res.user) {
            saveSessionLocally(res.user)
          }
        }).catch(() => {})
      }

      // Registra o lead imediatamente no backend como carrinho ativo
      sendFunnelTelemetry(3, "identificacao_lead", "em_andamento")
      setCurrentStep(3)
    }
  }

  // Finalizar Reserva no Passo 4
  const handleConfirmReservation = async () => {
    setIsProcessing(true)
    try {
      const resolvedRequesterType = isSeparateRequester
        ? (isWorkTrip && companyName.trim() ? "company" : "other_person")
        : "guest"

      const payload = {
        sessionId,
        requesterType: resolvedRequesterType,
        ...(isSeparateRequester
          ? {
              requesterName: requesterName.trim(),
              requesterPhone: requesterPhone.trim(),
              requesterEmail: requesterEmail.trim(),
              requesterDocument: requesterDocument.trim(),
              requesterInfo: {
                type: resolvedRequesterType,
                name: requesterName.trim(),
                phone: requesterPhone.trim(),
                whatsapp: requesterPhone.trim(),
                email: requesterEmail.trim(),
                document: requesterDocument.trim()
              }
            }
          : {}),
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim(),
        guestDocument: guestDocument.trim(),
        guestDocType: /[a-zA-Z]/.test(guestDocument.trim()) ? "Passaporte" : "CPF",
        guestAddress: guestAddress.trim(),
        guestCity: guestCity.trim(),
        guestState: guestState.trim(),
        guestCep: guestCep.trim(),
        guestDocumentFile: docFileBase64 || "",
        docPhotoBase64: docFileBase64 || "",
        hasMinor: Boolean(aiInspectionResult?.isMinor),
        minorAge: aiInspectionResult?.calculatedAge || null,
        isCamposResident: Boolean(aiInspectionResult?.isCamposResident),
        riskAttentionAlert: Boolean(aiInspectionResult?.isCamposResident),
        riskAttentionReason: aiInspectionResult?.isCamposResident ? "Radar Operacional: Hóspede com documento ou endereço de Campos dos Goytacazes/RJ" : "",
        checkinDate: checkin,
        checkoutDate: checkout,
        numGuests: totalGuestsCount,
        flatsCount: rooms.length,
        rooms,
        ratePlan,
        includeBreakfast: ratePlan === "with_breakfast",
        bedType: rooms.some(r => r.bedType === "twin") ? "twin" : "queen",
        twinBeds: rooms.some(r => r.bedType === "twin"),
        twinFee,
        extraBedFee,
        dailyRate: selectedDailyRate,
        cleaningFee,
        earlyCheckin: false,
        lateCheckout,
        lateCheckoutTime: lateCheckout ? lateCheckoutTime : null,
        earlyCheckinFee: 0,
        lateCheckoutFee,
        hasPet: bringingPet,
        petCount: bringingPet ? petCount : 0,
        petFee,
        paymentMethod,
        totalAmount,
        pixTotalAmount,
        cardTotalAmount: baseTotalAmount,
        baseTotalAmount,
        pixDiscountPercent,
        pixDiscountAmount: paymentMethod === "pix" ? pixDiscountAmount : 0,
        discountAmount: currentTotalDiscount,
        isWorkTrip,
        companyData: isWorkTrip
          ? {
              ...(guestAccount?.companyData || {}),
              cnpj: companyCnpj,
              companyName,
              companyEmail: companyEmail || (isSeparateRequester ? requesterEmail.trim() : "") || guestAccount?.companyData?.companyEmail || "",
              companyPhone: companyPhone || (isSeparateRequester ? requesterPhone.trim() : "") || guestAccount?.companyData?.companyPhone || ""
            }
          : null,
        vehicle: hasVehicle
          ? {
              ...(guestAccount?.vehicle || {}),
              plate: vehiclePlate,
              model: vehicleModel
            }
          : null
      }

      const res = await fetch("/api/reservations/direct-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (res.ok && data.reservation) {
        setConfirmedReservation(data.reservation)
        if (paymentMethod === "pix" && data.pixData) {
          setPixData(data.pixData)
        }
        if (data.initPoint) {
          setMpInitPoint(data.initPoint)
        }
        sendFunnelTelemetry(5, "reserva_confirmada", "concluido")
        setCurrentStep(4)
        if (onSuccessBooking) onSuccessBooking(data.reservation)
      } else {
        alert(data.error || "Erro ao processar sua reserva.")
      }
    } catch {
      alert("Erro ao conectar ao servidor. Tente novamente.")
    } finally {
      setIsProcessing(false)
    }
  }

  // Complementação cadastral pós-pagamento na Etapa 4
  const handleSavePostPaymentRegistration = async () => {
    if (!guestAddress.trim()) {
      alert("Por favor, informe seu endereço residencial completo.")
      return
    }
    setIsSavingPostRegistration(true)
    try {
      const resCode = confirmedReservation?.code || confirmedReservation?.reservationCode || confirmedReservation?.id
      if (resCode) {
        await fetch(`/api/pms/reservations/${encodeURIComponent(resCode)}/guest-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: guestName.trim(),
            phone: guestPhone.trim(),
            email: guestEmail.trim(),
            document: guestDocument.trim(),
            address: guestAddress.trim(),
            city: guestCity.trim(),
            state: guestState.trim(),
            cep: guestCep.trim()
          })
        })
      }

      await updateAccountProfile({
        name: guestName.trim(),
        phone: guestPhone.trim(),
        document: guestDocument.trim(),
        address: guestAddress.trim(),
        city: guestCity.trim(),
        state: guestState.trim(),
        cep: guestCep.trim()
      })

      setPostRegistrationSaved(true)
      if (confirmedReservation) {
        confirmedReservation.guestAddress = guestAddress.trim()
        confirmedReservation.guestCity = guestCity.trim()
        confirmedReservation.guestState = guestState.trim()
        confirmedReservation.guestCep = guestCep.trim()
      }
    } catch {
      alert("Erro ao salvar dados cadastrais no servidor. Seus dados básicos continuam válidos.")
    } finally {
      setIsSavingPostRegistration(false)
    }
  }

  const whatsappNumber = siteConfig?.branding?.whatsapp || "5522997124021"
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    `Olá! Estou concluindo minha reserva no site da CorpFlats para os dias ${checkin} a ${checkout} e gostaria de tirar uma dúvida.`
  )}`

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleCloseModal();
      else onOpenChange(true);
    }}>
      <DialogContent className="sm:max-w-2xl max-w-[96vw] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <FunnelDialogHeader currentStep={currentStep} />

        {/* ── ETAPA 1: PERSONALIZAÇÃO & EXTRAS ────────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Banner de Urgência & Prova Social (Apenas quando restar 5 flats ou menos para uma ou mais datas solicitadas) */}
            {showUrgencyBanner && (
              <div className="p-3 bg-[#0F3D4C]/[0.05] border border-[#C5A059]/40 rounded-2xl flex items-center justify-between text-xs shadow-2xs">
                <div className="flex items-center gap-2 text-[#091E26] dark:text-slate-200 font-semibold">
                  <Flame className="w-4 h-4 text-[#C5A059] shrink-0" />
                  <span>
                    Alta procura para essas datas! {minAvailable === 1 ? "Resta apenas 1 unidade" : "Restam poucas unidades"} no Soho Residence.
                  </span>
                </div>
                <Badge className="bg-[#091E26] text-[#E5C98B] border border-[#C5A059]/40 font-bold text-[10px] shrink-0">
                  Desconto no PIX
                </Badge>
              </div>
            )}

            {/* ── Card Resumo da Hospedagem: Datas & Tarifa ── */}
            <FunnelStaySummaryCard
              checkin={checkin}
              checkout={checkout}
              nights={nights}
              ratePlan={ratePlan}
              selectedDailyRate={selectedDailyRate}
              otaSelectedDailyRate={otaSelectedDailyRate}
              onToggleRatePlan={handleToggleRatePlan}
            />

            {/* Configuração de Camas & Lotação por Flat */}
            <FunnelRoomConfigList
              rooms={rooms}
              ratePlan={ratePlan}
              occupancySecondGuestDiff={breakfastSurchargePerGuest}
              twinFeeUnit={twinFeeUnit}
              otaTwinFeeUnit={otaTwinFeeUnit}
              extraBedFeeUnit={extraBedFeeUnit}
              otaExtraBedFeeUnit={otaExtraBedFeeUnit}
              addRoom={stableAddRoom}
              removeRoom={stableRemoveRoom}
              updateRoom={stableUpdateRoom}
            />

            {/* Up-sell Exclusivo de Domingo: Late Check-out com Tarifação Inteligente */}
            {isSundayCheckout && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Adicional de Domingo:</span>
                </Label>

                <div className="grid grid-cols-1 gap-2.5">
                  {/* Late Check-out Especial no Domingo */}
                  <div
                    onClick={() => {
                      if (!lateCheckout) {
                        setLateCheckout(true)
                      }
                    }}
                    className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                      lateCheckout
                        ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.04] text-slate-900 dark:text-slate-100 ring-2 ring-[#C5A059]/30 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-pointer hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={lateCheckout}
                        onChange={(e) => {
                          e.stopPropagation()
                          setLateCheckout(!lateCheckout)
                        }}
                        className="mt-1 rounded text-[#0F3D4C] accent-[#0F3D4C] focus:ring-[#0F3D4C] cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className="font-bold text-xs flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                            <Clock className="w-3.5 h-3.5 text-[#0F3D4C]" />
                            <span>Late Check-out no Domingo</span>
                          </span>
                          <Badge className="bg-[#091E26] text-[#E5C98B] border border-[#C5A059]/40 text-[10px] px-2 py-0.5">
                            {lateCheckout
                              ? (lateCheckoutTier.isFree
                                  ? "Cortesia (R$ 0)"
                                  : (lateCheckoutTier.isDailyRate
                                      ? `+ R$ ${lateCheckoutFee} (1 diária)`
                                      : `+ R$ ${lateCheckoutFee}`))
                              : "+ R$ 50"
                            }
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          {lateCheckout
                            ? "Escolha abaixo o horário que deseja desocupar o flat:"
                            : "Estenda sua saída no domingo além das 12h."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Sub-painel com horário pretendido de saída revelado ao selecionar */}
                    {lateCheckout && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="pt-2 border-t border-slate-200/80 dark:border-slate-700 space-y-2.5 animate-in fade-in-50 duration-200"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <Label className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            Horário de saída:
                          </Label>

                          <div className="flex items-center gap-2">
                            <select
                              value={lateCheckoutTime}
                              onChange={(e) => setLateCheckoutTime(e.target.value)}
                              className="h-8 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-0 text-slate-800 dark:text-slate-100 shadow-xs focus:ring-1 focus:ring-[#0F3D4C] outline-none"
                            >
                              <optgroup label="Cortesia CorpFlats (Gratuito)">
                                <option value="12:30">Até 12:30 — Cortesia (R$ 0)</option>
                                <option value="13:00">Até 13:00 — Cortesia (R$ 0)</option>
                              </optgroup>
                              <optgroup label="Saída até 18:00 (R$ 50 por flat)">
                                <option value="14:00">Até 14:00 — + R$ 50</option>
                                <option value="15:00">Até 15:00 — + R$ 50</option>
                                <option value="16:00">Até 16:00 — + R$ 50</option>
                                <option value="17:00">Até 17:00 — + R$ 50</option>
                                <option value="18:00">Até 18:00 — + R$ 50 (Recomendado)</option>
                              </optgroup>
                              <optgroup label="Após 18:00 (+ 1 diária)">
                                <option value="19:00">Até 19:00 — +1 diária (R$ {selectedDailyRate})</option>
                                <option value="20:00">Até 20:00 — +1 diária (R$ {selectedDailyRate})</option>
                                <option value="21:00">Até 21:00 — +1 diária (R$ {selectedDailyRate})</option>
                                <option value="22:00">Até 22:00 — +1 diária (R$ {selectedDailyRate})</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Módulo Pet Friendly */}
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Heart className="w-4 h-4 text-[#0F3D4C] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Vai viajar com animal de estimação?</span>
                    <span className="text-[10px] text-slate-500">
                      Taxa de higienização:{" "}
                      {otaPetFeePerUnit > petFeePerUnit && (
                        <span className="line-through text-slate-400 mr-1" title="Valor no Booking e Airbnb">
                          R$ {formatBrl(otaPetFeePerUnit)}
                        </span>
                      )}
                      <strong className="text-slate-700 dark:text-slate-300">R$ {formatBrl(petFeePerUnit)}/pet</strong> ({siteConfig?.petPolicy?.feeType === "per_night" ? "por diária" : "por estadia"})
                    </span>
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={bringingPet ? "default" : "outline"}
                    onClick={() => setBringingPet(true)}
                    className={`h-7 text-xs font-bold rounded-xl px-3 ${bringingPet ? "bg-[#0F3D4C] hover:bg-[#091E26] text-white" : ""}`}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!bringingPet ? "default" : "outline"}
                    onClick={() => { setBringingPet(false); setPetRulesAccepted(false); }}
                    className={`h-7 text-xs font-bold rounded-xl px-3 ${!bringingPet ? "bg-[#0F3D4C] hover:bg-[#091E26] text-white" : ""}`}
                  >
                    Não
                  </Button>
                </div>
              </div>

              {bringingPet && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-700 dark:text-slate-200 font-bold block">
                        Quantidade de Cães (Pequeno Porte):
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {siteConfig?.petPolicy?.allowedSpecies || "Cães de pequeno porte (até 10kg)"}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2].map(n => (
                        <Button
                          key={n}
                          type="button"
                          size="sm"
                          variant={petCount === n ? "default" : "outline"}
                          onClick={() => setPetCount(n)}
                          className={`h-6 w-7 text-xs font-bold rounded-lg ${petCount === n ? "bg-[#0F3D4C] hover:bg-[#091E26] text-white" : ""}`}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Regulamento Pet */}
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed shadow-2xs">
                    <div className="font-bold flex items-center gap-1.5 text-xs text-slate-900 dark:text-slate-100">
                      <span>Regulamento de Hospedagem Pet (Edifício Soho)</span>
                    </div>
                    <div className="whitespace-pre-line text-[10.5px] leading-relaxed text-slate-600 dark:text-slate-400 max-h-40 overflow-y-auto pr-1">
                      {siteConfig?.petPolicy?.rules || `• Exclusivo para cães de pequeno porte (até 10 kg).
• Nas áreas comuns, transporte obrigatório no colo ou bolsa/caixa.
• Uso exclusivo do elevador de serviço ao transitar com o pet.
• Proibido deixar o animal sozinho no flat por longos períodos.
• O titular responde por eventuais danos ao enxoval ou mobiliário.`}
                    </div>
                  </div>

                  <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={petRulesAccepted}
                      onChange={e => setPetRulesAccepted(e.target.checked)}
                      className="rounded text-[#0F3D4C] accent-[#0F3D4C] mt-0.5"
                    />
                    <span>
                      Li e concordo com as regras de convivência pet e taxa de higienização (+ R$ {petFee}).
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Navegação */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleCloseModal}
                className="text-xs font-bold rounded-xl h-10 px-4 w-full sm:w-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1 shrink-0" />
                Voltar ao site
              </Button>

              <Button
                onClick={handleNextStep}
                className="bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-black text-xs h-auto min-h-10 py-2.5 px-6 rounded-xl shadow-md gap-1.5 w-full sm:w-auto whitespace-normal leading-tight text-center"
              >
                <span>Avançar para Seus Dados</span>
                <ArrowRight className="w-4 h-4 shrink-0 text-[#E5C98B]" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 2: IDENTIFICAÇÃO & CAPTURA DE LEAD ────────────────────── */}
        {currentStep === 2 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Banner de Identificação / Login */}
            {guestAccount || guestEmail ? (
              <div className="p-3 bg-[#0F3D4C]/[0.05] border border-[#C5A059]/40 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40 flex items-center justify-center font-bold shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                      <span>Conectado como {guestAccount?.name || guestName || "Hóspede"}</span>
                      <Badge className="bg-[#0F3D4C] text-white text-[9px] py-0 px-1.5 font-bold shrink-0">
                        ✓ Verificado
                      </Badge>
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 break-all block">
                      {guestAccount?.email || guestEmail}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#0F3D4C] shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">Já possui cadastro?</span>
                    <span className="text-[11px] text-slate-500">Conecte sua conta para preencher seus dados automaticamente.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleGoogleLoginInFunnel}
                    className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs h-7 px-2.5 rounded-xl border-slate-300 shadow-xs flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"/>
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
                    </svg>
                    <span>Google</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onOpenAuthModal}
                    className="bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs h-7 px-3 rounded-xl shrink-0"
                  >
                    Entrar
                  </Button>
                </div>
              </div>
            )}

            {/* Seletor Semântico: Para quem é a hospedagem? */}
            <fieldset className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
              <legend className="text-xs font-bold text-slate-900 dark:text-slate-100 px-1">
                Para quem é a hospedagem?
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  htmlFor="funnel-req-guest"
                  className={`p-2.5 rounded-xl border-2 cursor-pointer flex items-start gap-2.5 transition-all text-left ${
                    !isSeparateRequester
                      ? "border-[#0F3D4C] bg-white dark:bg-slate-900 ring-1 ring-[#C5A059]/30 shadow-2xs"
                      : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 hover:border-slate-300"
                  }`}
                >
                  <input
                    id="funnel-req-guest"
                    type="radio"
                    name="requesterType"
                    value="guest"
                    checked={!isSeparateRequester}
                    onChange={() => handleSelectRequesterMode("guest")}
                    className="mt-0.5 accent-[#0F3D4C] shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      Para mim (Sou o Hóspede)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-snug">
                      Vou me hospedar pessoalmente.
                    </span>
                  </span>
                </label>

                <label
                  htmlFor="funnel-req-other"
                  className={`p-2.5 rounded-xl border-2 cursor-pointer flex items-start gap-2.5 transition-all text-left ${
                    isSeparateRequester
                      ? "border-[#0F3D4C] bg-white dark:bg-slate-900 ring-1 ring-[#C5A059]/30 shadow-2xs"
                      : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 hover:border-slate-300"
                  }`}
                >
                  <input
                    id="funnel-req-other"
                    type="radio"
                    name="requesterType"
                    value="other_person"
                    checked={isSeparateRequester}
                    onChange={() => handleSelectRequesterMode("other_person")}
                    className="mt-0.5 accent-[#0F3D4C] shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                      Para outra pessoa / Empresa
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-snug">
                      Sou solicitante; posso preencher o hóspede depois via link.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Bloco do Solicitante (quando quem reserva não é o próprio hóspede) */}
            {isSeparateRequester && (
              <div className="p-3.5 rounded-2xl border border-[#0F3D4C]/30 bg-[#0F3D4C]/[0.04] dark:bg-slate-800/60 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#0F3D4C] dark:text-[#E5C98B] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Dados do Solicitante / Responsável pela Reserva</span>
                  </span>
                  <Badge variant="outline" className="text-[9px] font-bold border-[#C5A059]/60 text-[#0F3D4C] dark:text-[#E5C98B]">
                    Obrigatório
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="funnel-requester-name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Nome do Solicitante ou Empresa <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="funnel-requester-name"
                      name="requesterName"
                      autoComplete="name"
                      required
                      value={requesterName}
                      onChange={e => setRequesterName(e.target.value)}
                      placeholder="Ex: Maria Oliveira / RH Empresa"
                      className="text-xs h-9 rounded-xl bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="funnel-requester-phone" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      WhatsApp / Telefone com DDD <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="funnel-requester-phone"
                      name="requesterPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      value={requesterPhone}
                      onChange={e => setRequesterPhone(maskPhone(e.target.value))}
                      placeholder="(22) 99999-9999"
                      className="text-xs h-9 rounded-xl bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="funnel-requester-email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      E-mail do Solicitante <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="funnel-requester-email"
                      name="requesterEmail"
                      type="email"
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={requesterEmail}
                      onChange={e => setRequesterEmail(e.target.value)}
                      placeholder="solicitante@empresa.com.br"
                      className="text-xs h-9 rounded-xl bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="funnel-requester-doc" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      CPF ou CNPJ do Solicitante (Opcional)
                    </Label>
                    <Input
                      id="funnel-requester-doc"
                      name="requesterDocument"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={requesterDocument}
                      onChange={e => setRequesterDocument(maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className="text-xs h-9 rounded-xl bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
                  Assim que a reserva for confirmada, enviaremos no seu <strong>E-mail</strong> e <strong>WhatsApp</strong> o link exclusivo para cadastrar ou encaminhar ao hóspede antes do check-in.
                </p>
              </div>
            )}

            {/* Formulário Principal de Dados do Hóspede */}
            <div className="space-y-2.5">
              {isSeparateRequester && (
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" />
                    <span>Dados do Hóspede</span>
                  </span>
                  <Badge variant="secondary" className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
                    Opcional agora — pode preencher depois pelo link
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="funnel-guest-name" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isSeparateRequester ? "Nome Completo do Hóspede (Opcional)" : <>Nome Completo <span aria-hidden="true">*</span></>}
                  </Label>
                  <Input
                    id="funnel-guest-name"
                    name="guestName"
                    autoComplete={isSeparateRequester ? "off" : "name"}
                    required={!isSeparateRequester}
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder={isSeparateRequester ? "Preencher agora ou deixar para o link" : "Ex: Carlos Eduardo Silveira"}
                    className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="funnel-guest-phone" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isSeparateRequester ? "WhatsApp do Hóspede (Opcional)" : <>WhatsApp / Celular com DDD <span aria-hidden="true">*</span></>}
                  </Label>
                  <Input
                    id="funnel-guest-phone"
                    name="guestPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete={isSeparateRequester ? "off" : "tel"}
                    required={!isSeparateRequester}
                    value={guestPhone}
                    onChange={e => setGuestPhone(maskPhone(e.target.value))}
                    placeholder="(22) 99999-9999"
                    className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="funnel-guest-email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isSeparateRequester ? "E-mail do Hóspede (Opcional)" : <>E-mail <span aria-hidden="true">*</span></>}
                  </Label>
                  <Input
                    id="funnel-guest-email"
                    name="guestEmail"
                    type="email"
                    autoComplete={isSeparateRequester ? "off" : "email"}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required={!isSeparateRequester}
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="funnel-guest-doc" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isSeparateRequester ? "CPF ou Passaporte do Hóspede (Opcional)" : <>CPF ou Passaporte <span aria-hidden="true">*</span></>}
                  </Label>
                  <Input
                    id="funnel-guest-doc"
                    name="guestDocument"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required={!isSeparateRequester}
                    value={guestDocument}
                    onChange={e => setGuestDocument(maskCpf(e.target.value))}
                    placeholder="000.000.000-00 ou Passaporte"
                    className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="funnel-guest-cep" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>CEP Residencial (Opcional)</span>
                    {loadingFunnelCep && <span className="text-[10px] text-[#0F3D4C] font-normal">Buscando...</span>}
                  </Label>
                  <Input
                    id="funnel-guest-cep"
                    name="guestCep"
                    inputMode="numeric"
                    autoComplete={isSeparateRequester ? "off" : "postal-code"}
                    value={guestCep}
                    onChange={async e => {
                      const val = e.target.value.replace(/\D/g, "");
                      setGuestCep(val);
                      if (val.length === 8) {
                        setLoadingFunnelCep(true);
                        try {
                          const res = await fetch(`/api/lookup-cep/${val}`);
                          if (res.ok) {
                            const data = await res.json();
                            if (data.logradouro) setGuestAddress(`${data.logradouro}, ${data.bairro || ''}`.trim());
                            if (data.cidade) setGuestCity(data.cidade);
                            if (data.uf) setGuestState(data.uf);
                          }
                        } catch {}
                        finally {
                          setLoadingFunnelCep(false);
                        }
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                    className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="funnel-guest-address" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Endereço Residencial (Opcional)
                  </Label>
                  <Input
                    id="funnel-guest-address"
                    name="guestAddress"
                    autoComplete={isSeparateRequester ? "off" : "street-address"}
                    value={guestAddress}
                    onChange={e => setGuestAddress(e.target.value)}
                    placeholder="Rua, número, bairro e cidade"
                    className="text-xs h-9 rounded-xl bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Anexo de Documento Oficial com Foto (Obrigatório para o próprio hóspede; Opcional para solicitante terceiro) */}
            <div className="p-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
              <input
                ref={docFileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/jpg"
                onChange={handleDocFileSelect}
                className="hidden"
              />
              <FunnelDocumentUploadCard
                docFileBase64={docFileBase64}
                docFileType={docFileType}
                docFileName={docFileName}
                aiInspectionResult={aiInspectionResult}
                isInspectingDoc={isInspectingDoc}
                docInspectionError={docInspectionError}
                isOptional={isSeparateRequester}
                onOpenFilePicker={handleOpenDocPicker}
                onClearDocFile={handleClearDocFile}
              />
            </div>

            {/* Veículo & Portaria */}
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" />
                  <span>Vai utilizar a Garagem Coberta? (Inclusa)</span>
                </span>
                <input
                  type="checkbox"
                  checked={hasVehicle}
                  onChange={e => setHasVehicle(e.target.checked)}
                  className="rounded text-[#0F3D4C] accent-[#0F3D4C] shrink-0"
                />
              </div>

              {hasVehicle && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 animate-in fade-in">
                  <Input
                    value={vehiclePlate}
                    onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="Placa do Carro"
                    className="text-xs h-8 rounded-xl uppercase font-mono"
                  />
                  <Input
                    value={vehicleModel}
                    onChange={e => setVehicleModel(e.target.value)}
                    placeholder="Modelo (Ex: Corolla)"
                    className="text-xs h-8 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Viagem a Trabalho / Faturamento PJ */}
            <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#0F3D4C] shrink-0" />
                  <span>Viagem Corporativa / Nota Fiscal PJ</span>
                </span>
                <input
                  type="checkbox"
                  checked={isWorkTrip}
                  onChange={e => setIsWorkTrip(e.target.checked)}
                  className="rounded text-[#0F3D4C] accent-[#0F3D4C] shrink-0"
                />
              </div>

              {isWorkTrip && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 animate-in fade-in">
                  <Input
                    value={companyCnpj}
                    onChange={e => setCompanyCnpj(e.target.value)}
                    placeholder="CNPJ da Empresa"
                    className="text-xs h-8 rounded-xl font-mono"
                  />
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Razão Social"
                    className="text-xs h-8 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Navegação */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="text-xs font-bold rounded-xl h-10 px-4 w-full sm:w-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1 shrink-0" />
                Voltar
              </Button>

              <Button
                onClick={handleNextStep}
                className="bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-black text-xs h-auto min-h-10 py-2.5 px-6 rounded-xl shadow-md gap-1.5 w-full sm:w-auto whitespace-normal leading-tight text-center"
              >
                <span>Avançar para Pagamento</span>
                <ArrowRight className="w-4 h-4 shrink-0 text-[#E5C98B]" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 3: CHECKOUT & PAGAMENTO TRANSPARENTE ───────────────────── */}
        {currentStep === 3 && (
          <div className="space-y-4 py-2 animate-in fade-in">
            {/* Comparador de Formas de Pagamento */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Forma de Pagamento:
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opção 1: PIX Instantâneo */}
                <div
                  onClick={() => setPaymentMethod("pix")}
                  className={`p-3.5 rounded-2xl border-2 text-left relative cursor-pointer transition-all ${
                    paymentMethod === "pix"
                      ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] ring-2 ring-[#C5A059]/35 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      paymentMethod === "pix"
                        ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs block text-slate-900 dark:text-slate-100">PIX Instantâneo</span>
                      <span className="text-[#091E26] dark:text-slate-100 font-black text-base">
                        R$ {formatBrl(pixTotalAmount)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-medium mt-1.5">
                    Economia de R$ {formatBrl(pixDiscountAmount)} no PIX • Liberação na hora
                  </p>
                </div>

                {/* Opção 2: Cartão de Crédito Mercado Pago */}
                <div
                  onClick={() => setPaymentMethod("card")}
                  className={`p-3.5 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                    paymentMethod === "card"
                      ? "border-[#0F3D4C] bg-[#0F3D4C]/[0.05] ring-2 ring-[#C5A059]/35 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      paymentMethod === "card"
                        ? "bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs block text-slate-900 dark:text-slate-100">Cartão de Crédito</span>
                      <span className="text-[#091E26] dark:text-slate-100 font-black text-base">
                        R$ {formatBrl(baseTotalAmount)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-slate-500 font-medium mt-1.5">
                    Checkout Seguro Mercado Pago
                  </p>
                </div>
              </div>
            </div>

            {/* Resumo Financeiro Consolidado & Política de Cancelamento */}
            <FunnelPriceBreakdownCard
              nights={nights}
              flatsCount={flatsCount}
              ratePlan={ratePlan}
              subtotal={subtotal}
              cleaningFee={cleaningFee}
              otaCleaningFee={otaCleaningFee}
              extraBedFee={extraBedFee}
              otaExtraBedFee={otaExtraBedFee}
              lateCheckout={lateCheckout}
              lateCheckoutTime={lateCheckoutTime}
              lateCheckoutFee={lateCheckoutFee}
              otaLateCheckoutFee={otaLateCheckoutFee}
              petFee={petFee}
              otaPetFee={otaPetFee}
              twinFee={twinFee}
              otaTwinFee={otaTwinFee}
              paymentMethod={paymentMethod}
              pixDiscountAmount={pixDiscountAmount}
              totalAmount={totalAmount}
              otaReferenceTotal={otaReferenceTotal}
              otaSavingsAmount={otaSavingsAmount}
              policyType={cancellationPolicy.policyType}
              policyExplanation={cancellationPolicy.explanation}
            />

            {/* Navegação & Botão de Confirmação */}
            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(2)}
                className="text-xs font-bold rounded-xl h-10 px-4 w-full sm:w-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1 shrink-0" />
                Voltar
              </Button>

              <Button
                onClick={handleConfirmReservation}
                disabled={isProcessing}
                className="bg-gradient-to-r from-[#091E26] via-[#0F3D4C] to-[#091E26] hover:brightness-110 text-white border border-[#C5A059]/50 font-black text-xs h-auto min-h-11 py-2.5 px-6 rounded-xl shadow-md shadow-[#091E26]/20 gap-2 w-full sm:w-auto whitespace-normal leading-tight text-center"
              >
                <Lock className="w-4 h-4 shrink-0 text-[#E5C98B]" />
                <span>
                  {isProcessing ? "Confirmando..." : (paymentMethod === "pix" ? `Pagar com PIX: R$ ${formatBrl(totalAmount)}` : `Pagar com Cartão: R$ ${formatBrl(totalAmount)}`)}
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 4: VOUCHER DIGITAL & PÓS-VENDA ─────────────────────────── */}
        {currentStep === 4 && confirmedReservation && (
          <div className="space-y-4 py-2 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-[#091E26] text-[#C5A059] border border-[#C5A059]/40 flex items-center justify-center mx-auto shadow-xs">
              {paymentMethod === "pix" && !isPixPaid ? (
                <Clock className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
                {paymentMethod === "pix" && !isPixPaid 
                  ? "Conclua o Pagamento PIX" 
                  : "Reserva Confirmada!"}
              </h3>
              <p className="text-xs text-slate-500">
                {paymentMethod === "pix" && !isPixPaid ? (
                  <>Escaneie o QR Code ou copie o código abaixo para confirmação imediata.</>
                ) : (
                  <>Seu voucher foi enviado para <strong className="break-all">{isSeparateRequester ? requesterEmail : guestEmail}</strong>.</>
                )}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Código da Reserva:</span>
                <span className="font-mono font-black text-[#0F3D4C] dark:text-[#E5C98B] text-sm text-right">
                  {confirmedReservation.code || confirmedReservation.reservationCode}
                </span>
              </div>
              {isSeparateRequester && requesterName.trim() && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500 shrink-0">Solicitante:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-right break-words">{requesterName.trim()}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Hóspede:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-right break-words">
                  {guestName.trim() || "A Definir (link enviado ao solicitante)"}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Período:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-right">{formatDisplayDate(checkin)} a {formatDisplayDate(checkout)} ({nights} {nights === 1 ? "noite" : "noites"})</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Acomodação:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-right">Flat {confirmedReservation.flatNumber}</span>
              </div>
              <div className="flex flex-wrap justify-between items-center gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">Status:</span>
                {!isPixPaid ? (
                  <Badge className="bg-[#C5A059]/20 text-[#091E26] dark:text-[#E5C98B] border border-[#C5A059]/50 font-bold text-[10px]">
                    Aguardando Pagamento
                  </Badge>
                ) : (
                  <Badge className="bg-[#0F3D4C] text-white font-bold text-[10px]">
                    ✓ Confirmada & Paga
                  </Badge>
                )}
              </div>
            </div>

            {isSeparateRequester && (!guestName.trim() || !docFileBase64 || confirmedReservation.guestPending) && (
              <div className="p-3.5 rounded-2xl border border-[#C5A059]/50 bg-[#0F3D4C]/[0.05] dark:bg-slate-800/60 text-left text-xs text-slate-700 dark:text-slate-200 space-y-1">
                <span className="font-bold text-[#0F3D4C] dark:text-[#E5C98B] block">
                  📋 Cadastro Posterior do Hóspede
                </span>
                <p className="text-[11px] leading-relaxed">
                  Assim que o pagamento for confirmado, enviaremos automaticamente para seu <strong>WhatsApp</strong> e <strong>E-mail</strong> o link seguro de credenciamento para preencher (ou encaminhar ao hóspede) os dados e o documento oficial antes do check-in.
                </p>
              </div>
            )}

            {/* Se Pagamento foi PIX */}
            {paymentMethod === "pix" && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                {isPixPaid ? (
                  <div className="py-3 text-center space-y-1.5">
                    <div className="w-10 h-10 bg-[#0F3D4C] text-[#E5C98B] rounded-full flex items-center justify-center mx-auto shadow-xs">
                      <Check className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      Pagamento PIX Confirmado!
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Sua reserva está 100% quitada e garantida.
                    </p>
                  </div>
                ) : (
                  <>
                    {pixData?.pixCopiaECola && (
                      <>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 inline-block shadow-2xs mx-auto">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(pixData.pixCopiaECola)}`}
                            alt="QR Code PIX"
                            className="w-36 h-36 mx-auto rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5 text-left">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                            Código PIX Copia e Cola
                          </span>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={pixData.pixCopiaECola}
                              className="text-[11px] font-mono bg-white dark:bg-slate-900 h-9 min-w-0"
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(pixData.pixCopiaECola)
                                setPixCopied(true)
                                setTimeout(() => setPixCopied(false), 3000)
                              }}
                              className="bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-xs h-9 px-3.5 rounded-xl shrink-0"
                            >
                              {pixCopied ? <Check className="w-3.5 h-3.5 mr-1 text-[#E5C98B]" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                              <span>{pixCopied ? "Copiado!" : "Copiar"}</span>
                            </Button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Chave Pix Direta CNPJ como alternativa */}
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-500 font-semibold block">Chave PIX (CNPJ Banco Inter):</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-xs">47.964.813/0001-65</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText("47964813000165")
                          setPixKeyCopied(true)
                          setTimeout(() => setPixKeyCopied(false), 3000)
                        }}
                        className="h-8 text-xs font-semibold border-slate-200 text-[#0F3D4C] hover:bg-slate-100 rounded-xl px-3 shrink-0"
                      >
                        {pixKeyCopied ? <Check className="w-3.5 h-3.5 mr-1 text-[#0F3D4C]" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                        <span>{pixKeyCopied ? "Copiado!" : "Copiar CNPJ"}</span>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Se Pagamento foi Cartão */}
            {paymentMethod === "card" && mpInitPoint && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5">
                <p className="text-xs text-slate-700 dark:text-slate-200 font-bold">
                  Prossiga para finalizar o pagamento no ambiente seguro do Mercado Pago:
                </p>
                <Button
                  onClick={() => window.open(mpInitPoint, "_blank")}
                  className="w-full bg-[#0F3D4C] hover:bg-[#091E26] text-white border border-[#C5A059]/40 font-black text-xs h-auto min-h-10 py-2.5 rounded-xl shadow-md gap-2 whitespace-normal leading-tight text-center"
                >
                  <CreditCard className="w-4 h-4 shrink-0 text-[#E5C98B]" />
                  <span>Pagar com Cartão no Mercado Pago</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </Button>
              </div>
            )}

            {/* Ações Pós-Venda: Calendário & Portal da Reserva */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <AddToCalendar
                variant="compact"
                reservation={{
                  id: confirmedReservation.id,
                  reservationCode: confirmedReservation.code || confirmedReservation.reservationCode,
                  guestName: guestName.trim() || requesterName.trim() || "Hóspede CorpFlats",
                  flatNumber: confirmedReservation.flatNumber,
                  checkinDate: checkin,
                  checkoutDate: checkout,
                  numGuests: totalGuestsCount
                }}
              />

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#0F3D4C]" />
                <span>WhatsApp</span>
              </a>
            </div>

            <div className="pt-1">
              <Button
                onClick={() => {
                  const resCode = confirmedReservation?.code || confirmedReservation?.id;
                  onOpenChange(false);
                  if (resCode) {
                    setLocation(`/minha-reserva/${resCode}`);
                  }
                }}
                className="w-full bg-gradient-to-r from-[#091E26] via-[#0F3D4C] to-[#091E26] hover:brightness-110 text-white border border-[#C5A059]/50 text-xs font-bold rounded-xl h-11 gap-2 shadow-md"
              >
                <span>Concluir e Acessar Minha Reserva</span>
                <ArrowRight className="w-4 h-4 text-[#E5C98B]" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Modal Suave de Retenção de Saída (Exit-Intent) ──────────────── */}
        {showExitIntent && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-3 shadow-2xl animate-in zoom-in-95">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>

              <h4 className="font-black text-slate-900 dark:text-slate-100 text-base">
                Ficou com alguma dúvida sobre a estadia?
              </h4>

              <p className="text-xs text-slate-500 leading-relaxed">
                Nossa equipe de atendimento está online no WhatsApp para tirar dúvidas sobre o flat ou aplicar condições especiais para seu período.
              </p>

              <div className="space-y-2 pt-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowExitIntent(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-10 rounded-xl flex items-center justify-center gap-2 shadow-md"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Falar com Atendente no WhatsApp</span>
                </a>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExitIntent(false)}
                  className="w-full text-xs text-slate-500 font-bold"
                >
                  Continuar no Funil de Reservas
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Modal Informativo: Menor de Idade (ECA Art. 82) */}
    <FunnelMinorNoticeDialog
      open={showMinorNoticeModal}
      onOpenChange={setShowMinorNoticeModal}
      onAcknowledge={handleAcknowledgeMinorNotice}
    />
    </>
  )
}
