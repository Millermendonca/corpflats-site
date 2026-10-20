import React, { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Send,
  RefreshCw,
  Phone,
  User,
  Building2,
  Users,
  FileText,
  ExternalLink,
  ShieldCheck,
  Edit3,
} from "lucide-react"
import {
  WhatsAppQuickMessage,
  renderQuickMessage,
  getReservationRecipients,
  isPureBillingQuickMessage,
  bindZapiClickOrHoldWaWeb,
  buildQuickMessageWaWebUrl,
} from "@/hooks/use-quick-messages"
import { useToast } from "@/hooks/use-toast"

interface QuickMessageConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quickMessage: WhatsAppQuickMessage | null
  resItem: any
  originUrl?: string
  onConfirm: (
    qm: WhatsAppQuickMessage,
    options: {
      overrideTarget?: "guest" | "requester" | "both" | "custom"
      customPhone?: string
      customName?: string
      customMessage?: string
    }
  ) => Promise<void>
}

export function QuickMessageConfirmDialog({
  open,
  onOpenChange,
  quickMessage,
  resItem,
  originUrl,
  onConfirm,
}: QuickMessageConfirmDialogProps) {
  const { toast } = useToast()
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("guest")
  const [isEditingText, setIsEditingText] = useState(false)
  const [editedMessage, setEditedMessage] = useState("")
  const [isSending, setIsSending] = useState(false)

  const recipients = useMemo(
    () => (resItem ? getReservationRecipients(resItem) : null),
    [resItem]
  )

  const companionOptions = useMemo(() => {
    if (!resItem || !Array.isArray(resItem.guests)) return []
    const guestClean = recipients?.guest?.cleanDigits || ""
    const reqClean = recipients?.requester?.cleanDigits || ""
    const list: { key: string; name: string; phone: string; cleanDigits: string }[] = []

    resItem.guests.forEach((g: any, idx: number) => {
      if (idx === 0) return
      const rawP = String(g?.phone || g?.whatsapp || "").trim()
      const digits = rawP.replace(/\D/g, "")
      if (!digits || digits.length < 8) return
      if (digits === guestClean || digits === reqClean) return
      list.push({
        key: `companion_${idx}`,
        name: String(g?.name || `Acompanhante ${idx + 1}`).trim(),
        phone: rawP,
        cleanDigits: digits,
      })
    })
    return list
  }, [resItem, recipients])

  const renderedPreview = useMemo(() => {
    if (!quickMessage || !resItem) return ""
    const targetType = selectedTargetKey === "requester" ? "requester" : "guest"
    return renderQuickMessage(quickMessage.message, resItem, originUrl, targetType)
  }, [quickMessage, resItem, originUrl, selectedTargetKey])

  useEffect(() => {
    if (open && quickMessage) {
      const isBillingRestricted = Boolean(
        isPureBillingQuickMessage(quickMessage) && recipients?.requester?.isDifferentFromGuest
      )
      const defaultTarget = isBillingRestricted ? "requester" : (quickMessage.recipientTarget || "guest")
      if (isBillingRestricted) {
        setSelectedTargetKey("requester")
      } else if (
        defaultTarget === "requester" &&
        (!recipients?.requester?.phone || !recipients?.requester?.isDifferentFromGuest)
      ) {
        setSelectedTargetKey("guest")
      } else if (
        defaultTarget === "both" &&
        (!recipients?.requester?.phone || !recipients?.requester?.isDifferentFromGuest)
      ) {
        setSelectedTargetKey("guest")
      } else {
        setSelectedTargetKey(defaultTarget)
      }
      setIsEditingText(false)
    }
  }, [open, quickMessage, recipients])

  useEffect(() => {
    if (!isEditingText) {
      setEditedMessage(renderedPreview)
    }
  }, [renderedPreview, isEditingText])

  if (!quickMessage || !resItem || !recipients) return null

  const isPureBillingWithDistinctRequester = Boolean(
    isPureBillingQuickMessage(quickMessage) && recipients.requester.isDifferentFromGuest
  )
  const hasDistinctRequester = Boolean(
    recipients.requester.isDifferentFromGuest && (recipients.requester.phone || isPureBillingWithDistinctRequester)
  )

  const selectedCompanion = companionOptions.find((c) => c.key === selectedTargetKey)

  const currentPhoneDisplay = (() => {
    if (selectedCompanion) {
      return `${selectedCompanion.name} (${selectedCompanion.phone})`
    }
    if (selectedTargetKey === "both") {
      return `${recipients.guest.firstName} (${recipients.guest.phone || "Sem nº"}) + ${recipients.requester.firstName} (${recipients.requester.phone})`
    }
    if (selectedTargetKey === "requester") {
      const allowFallback = !recipients.requester.isDifferentFromGuest || !recipients.requester.hasOwnContact
      return `${recipients.requester.name} (${recipients.requester.phone || (allowFallback ? recipients.guest.phone : "") || "Sem nº cadastrado"})`
    }
    return `${recipients.guest.name} (${recipients.guest.phone || "Sem nº cadastrado"})`
  })()

  const handleConfirmClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsSending(true)
    try {
      const customMsg =
        isEditingText && editedMessage.trim() && editedMessage.trim() !== renderedPreview.trim()
          ? editedMessage
          : undefined

      if (selectedCompanion) {
        await onConfirm(quickMessage, {
          overrideTarget: "custom",
          customPhone: selectedCompanion.phone,
          customName: selectedCompanion.name,
          customMessage: customMsg,
        })
      } else {
        const target = (
          ["guest", "requester", "both"].includes(selectedTargetKey)
            ? selectedTargetKey
            : "guest"
        ) as "guest" | "requester" | "both"
        await onConfirm(quickMessage, {
          overrideTarget: target,
          customMessage: customMsg,
        })
      }
      onOpenChange(false)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg p-0 overflow-hidden border-emerald-200 dark:border-emerald-900/80 shadow-2xl"
      >
        <DialogHeader className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl bg-white/15 p-1.5 rounded-xl leading-none">
              {quickMessage.icon || "💬"}
            </span>
            <div className="text-left">
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                <span>Confirmar Envio de Mensagem Rápida</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-emerald-100 mt-0.5">
                {quickMessage.title} • Reserva{" "}
                <strong className="text-white">
                  {resItem.code || `Flat ${resItem.flatNumber || ""}`}
                </strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Seleção de Destinatário Cadastrado */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Destinatário do Envio (API Z-API)</span>
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Envio direto liberado
              </span>
            </label>

            <div className="grid grid-cols-1 gap-1.5">
              {/* Hóspede Principal (oculto quando for cobrança e existir solicitante distinto) */}
              {!isPureBillingWithDistinctRequester && (
                <button
                  type="button"
                  onClick={() => setSelectedTargetKey("guest")}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedTargetKey === "guest"
                      ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-500"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold truncate">
                        Hóspede: {recipients.guest.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" />
                        {recipients.guest.phone || "Sem telefone cadastrado"}
                      </div>
                    </div>
                  </div>
                  {selectedTargetKey === "guest" && (
                    <Badge className="bg-emerald-600 text-white text-[10px]">Selecionado</Badge>
                  )}
                </button>
              )}

              {/* Solicitante / Empresa */}
              {hasDistinctRequester && (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedTargetKey("requester")}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedTargetKey === "requester"
                        ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-1 ring-amber-500"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-bold truncate">
                          Solicitante: {recipients.requester.name}
                          {recipients.requester.company ? ` (${recipients.requester.company})` : ""}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5" />
                          {recipients.requester.phone || "Sem telefone cadastrado"}
                        </div>
                      </div>
                    </div>
                    {selectedTargetKey === "requester" && (
                      <Badge className="bg-amber-600 text-white text-[10px]">Selecionado</Badge>
                    )}
                  </button>

                  {isPureBillingWithDistinctRequester ? (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-2.5 py-1.5">
                      🔒 Mensagens financeiras e de PIX são enviadas exclusivamente ao solicitante quando a reserva possui solicitante distinto do hóspede.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedTargetKey("both")}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedTargetKey === "both"
                          ? "border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 ring-1 ring-purple-500"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-4 h-4 text-purple-600 shrink-0" />
                        <div className="truncate">
                          <div className="text-xs font-bold truncate">
                            ✨ Enviar para Ambos (Hóspede + Solicitante)
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            {recipients.guest.phone} e {recipients.requester.phone}
                          </div>
                        </div>
                      </div>
                      {selectedTargetKey === "both" && (
                        <Badge className="bg-purple-600 text-white text-[10px]">Selecionado</Badge>
                      )}
                    </button>
                  )}
                </>
              )}

              {/* Acompanhantes com telefone cadastrado (ocultos em cobrança financeira) */}
              {!isPureBillingWithDistinctRequester && companionOptions.map((comp) => (
                <button
                  key={comp.key}
                  type="button"
                  onClick={() => setSelectedTargetKey(comp.key)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedTargetKey === comp.key
                      ? "border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 text-sky-950 dark:text-sky-200 ring-1 ring-sky-500"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-sky-600 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold truncate">
                        Acompanhante: {comp.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" />
                        {comp.phone}
                      </div>
                    </div>
                  </div>
                  {selectedTargetKey === comp.key && (
                    <Badge className="bg-sky-600 text-white text-[10px]">Selecionado</Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Prévia da Mensagem que será enviada */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mensagem que será enviada
              </span>
              <button
                type="button"
                onClick={() => setIsEditingText((v) => !v)}
                className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                {isEditingText ? "Ver prévia formatada" : "Editar texto antes de enviar"}
              </button>
            </div>

            {isEditingText ? (
              <textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 p-3 text-xs font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            ) : (
              <div className="rounded-2xl bg-[#efeae2] dark:bg-slate-900 p-3.5 border border-slate-200 dark:border-slate-800 shadow-inner">
                <div className="bg-[#d9fdd3] dark:bg-emerald-950/70 text-slate-900 dark:text-slate-100 rounded-xl rounded-tr-none p-3 shadow-xs space-y-2">
                  <div className="text-xs whitespace-pre-wrap leading-relaxed break-words">
                    {editedMessage || renderedPreview}
                  </div>

                  {quickMessage.footer && (
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-emerald-200/60 dark:border-emerald-800/50">
                      {quickMessage.footer}
                    </div>
                  )}

                  {Array.isArray(quickMessage.buttons) && quickMessage.buttons.length > 0 && (
                    <div className="pt-1.5 border-t border-emerald-200/70 dark:border-emerald-800/60 space-y-1">
                      {quickMessage.buttons.map((b, idx) => (
                        <div
                          key={b.id || idx}
                          className="w-full py-1.5 px-2.5 rounded-lg bg-white/90 dark:bg-slate-900/80 text-sky-700 dark:text-sky-300 font-bold text-[11px] flex items-center justify-center gap-1.5 border border-emerald-200/50 dark:border-slate-800"
                        >
                          <ExternalLink className="w-3 h-3 opacity-75" />
                          <span>{b.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(quickMessage.hasAttachment || quickMessage.documentUrl) && (
                    <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-[11px] font-semibold">
                      <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span className="truncate">
                        Anexo PDF: {quickMessage.documentName || "Manual_do_Hospede_CorpFlats.pdf"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-0.5 max-w-[220px]">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={currentPhoneDisplay}>
              Para: <strong className="text-slate-700 dark:text-slate-200">{currentPhoneDisplay}</strong>
            </div>
            <div className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
              ⚡ Clique: Z-API • Segure 2s: WhatsApp Web
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSending}
              onClick={(e) => {
                e.stopPropagation()
                onOpenChange(false)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSending}
              {...bindZapiClickOrHoldWaWeb({
                onClickZapi: handleConfirmClick,
                onHoldWaWeb: () => {
                  const customMsg =
                    isEditingText && editedMessage.trim() && editedMessage.trim() !== renderedPreview.trim()
                      ? editedMessage
                      : undefined
                  const opts = selectedCompanion
                    ? {
                        overrideTarget: "custom" as const,
                        customPhone: selectedCompanion.phone,
                        customName: selectedCompanion.name,
                        customMessage: customMsg,
                      }
                    : {
                        overrideTarget: (["guest", "requester", "both"].includes(selectedTargetKey)
                          ? selectedTargetKey
                          : "guest") as "guest" | "requester" | "both",
                        customMessage: customMsg,
                      }
                  const url = buildQuickMessageWaWebUrl(quickMessage, resItem, originUrl, opts)
                  if (typeof window !== "undefined") {
                    window.open(url, "_blank")
                  }
                  onOpenChange(false)
                },
                toast,
              })}
              title="Clique rápido: enviar via Z-API • Segure por 2 segundos: abrir no WhatsApp Web"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-sm cursor-pointer"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Confirmar e Enviar</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
