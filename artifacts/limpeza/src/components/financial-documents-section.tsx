import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  QrCode,
  Receipt,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface PublicNfseItem {
  id: number | string
  numeroNfse: string
  codigoVerificacao?: string
  chaveAcesso?: string
  dataEmissao?: string | null
  valorServico: number
  tomadorNome?: string
  tomadorCpfCnpj?: string
  flatNumber?: string
  guestName?: string
  reservationId?: number | null
  reservationCode?: string | null
  reservationCodes?: string[]
  packageCode?: string | null
  isConsolidated?: boolean
  status?: string
  pdfUrl: string
  danfseUrl: string
  xmlUrl: string
  linkPrefeitura?: string | null
}

export interface PublicBoletoLinkedInvoice {
  id: number | string
  numeroNfse: string
  valorServico: number
  pdfUrl: string
  danfseUrl: string
  xmlUrl: string
}

export interface PublicBoletoItem {
  id: number | string
  code: string
  nossoNumero?: string
  status: string
  displayStatus: "pago" | "vencido" | "vence_hoje" | "aberto" | string
  isOpen?: boolean
  isDueToday?: boolean
  isOverdue?: boolean
  isPaid?: boolean
  daysOverdue?: number
  amount: number
  paidAmount?: number
  paidAt?: string | null
  dueDate?: string | null
  issuedAt?: string | null
  finePct?: number
  interestPct?: number
  fineAmount?: number
  interestAmount?: number
  updatedTotalWithCharges?: number
  boletoKind?: string
  billingScope?: string
  payerName?: string
  payerDocument?: string
  guestName?: string
  companyName?: string | null
  agencyName?: string | null
  flatNumber?: string
  reservationId?: number | null
  reservationCode?: string | null
  packageId?: string | null
  linhaDigitavel?: string
  pixCopiaECola?: string
  pdfUrl: string
  copyPageUrl?: string
  linkedInvoice?: PublicBoletoLinkedInvoice | null
}

export interface PublicPreBoletoItem {
  id: string
  code: string
  isPreBoleto?: boolean
  status?: string
  displayStatus?: string
  amount: number
  accommodationAmount?: number
  consumptionAmount?: number
  dueDate?: string | null
  termDays?: number
  payerName?: string
  payerDocument?: string
  guestName?: string
  companyName?: string | null
  agencyName?: string | null
  flatNumber?: string
  reservationId?: number | null
  reservationCode?: string | null
  packageId?: string | null
  checkinDate?: string | null
  checkoutDate?: string | null
  linkedInvoice?: PublicBoletoLinkedInvoice | null
}

export function formatMoneyBr(val?: number | string | null): string {
  return Number(val || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatDateBrShort(dateStr?: string | null): string {
  if (!dateStr) return "—"
  const raw = String(dateStr).trim().slice(0, 10)
  const parts = raw.split("-")
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return raw
}

export function legacyCopyFallback(text: string): boolean {
  if (typeof document === "undefined") return false
  const previousFocus = document.activeElement as HTMLElement | null
  const field = document.createElement("textarea")
  field.value = text
  field.setAttribute("readonly", "")
  field.style.cssText = "position:fixed;inset-block-start:0;opacity:0;pointer-events:none"
  document.body.append(field)
  field.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    field.remove()
    previousFocus?.focus?.({ preventScroll: true })
  }
}

export async function copyTextReliably(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fallback below
  }
  return legacyCopyFallback(text)
}

export function getBoletoStatusBadgeMeta(displayStatus: string, daysOverdue = 0): {
  label: string
  className: string
  cardClassName: string
} {
  if (displayStatus === "pago") {
    return {
      label: "✓ Pago / Quitado",
      className: "bg-emerald-600 text-white border-emerald-600",
      cardClassName: "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900",
    }
  }
  if (displayStatus === "vencido") {
    return {
      label: daysOverdue > 0 ? `Em Atraso (${daysOverdue}d)` : "Em Atraso",
      className: "bg-rose-600 text-white border-rose-600",
      cardClassName: "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900",
    }
  }
  if (displayStatus === "vence_hoje") {
    return {
      label: "Vence Hoje",
      className: "bg-amber-600 text-white border-amber-600",
      cardClassName: "bg-amber-50/60 border-amber-300 dark:bg-amber-950/20 dark:border-amber-900",
    }
  }
  if (displayStatus === "aguardando_emissao") {
    return {
      label: "Aguardando Emissão",
      className: "bg-slate-600 text-white border-slate-600",
      cardClassName: "bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800",
    }
  }
  return {
    label: "Pendente / Em Aberto",
    className: "bg-indigo-600 text-white border-indigo-600",
    cardClassName: "bg-indigo-50/40 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900",
  }
}

interface FinancialDocumentsSectionProps {
  boletos?: PublicBoletoItem[]
  preBoletos?: PublicPreBoletoItem[]
  nfseInvoices?: PublicNfseItem[]
  compact?: boolean
  title?: string
}

export function FinancialDocumentsSection({
  boletos = [],
  preBoletos = [],
  nfseInvoices = [],
  compact = false,
  title = "Documentos Fiscais & Boletos",
}: FinancialDocumentsSectionProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState("")
  const lastLiveMsgRef = useRef("")
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const totalCount = boletos.length + preBoletos.length + nfseInvoices.length
  if (totalCount === 0) return null

  const triggerCopy = async (key: string, value: string, label: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    const ok = await copyTextReliably(value)
    setCopiedKey(ok ? key : null)
    setFailedKey(ok ? null : key)
    let msg = ok ? `${label} copiado` : `Falha ao copiar ${label}`
    if (msg === lastLiveMsgRef.current) msg += "\u00A0"
    lastLiveMsgRef.current = msg
    setLiveStatus(msg)
    timerRef.current = window.setTimeout(() => {
      setCopiedKey(null)
      setFailedKey(null)
      setLiveStatus("")
    }, 2400)
  }

  return (
    <div className={compact ? "space-y-2.5 pt-2" : "space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800"}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#0F3D4C] dark:text-sky-400 shrink-0" />
          <h3 className={compact ? "text-xs font-black text-slate-900 dark:text-slate-100" : "text-sm font-black text-slate-900 dark:text-slate-100"}>
            {title}
          </h3>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {liveStatus}
        </span>
      </div>

      {/* Boletos Emitidos */}
      {boletos.length > 0 && (
        <div className="space-y-2">
          {boletos.map((b) => {
            const meta = getBoletoStatusBadgeMeta(b.displayStatus, b.daysOverdue)
            const cleanLinha = String(b.linhaDigitavel || "").replace(/\D/g, "")
            const copyLinha = cleanLinha.length >= 44 && cleanLinha.length <= 48 ? cleanLinha : (b.linhaDigitavel || "")
            const scopeLabel =
              b.billingScope === "accommodation_only"
                ? "Hospedagem"
                : b.billingScope === "consumption_only"
                  ? "Consumo / Extras"
                  : "Faturamento Unificado"

            return (
              <div
                key={`bol_${b.id || b.code}`}
                className={`p-3.5 rounded-2xl border space-y-2.5 ${meta.cardClassName}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-400 shrink-0" />
                      <span className="font-black text-xs text-slate-900 dark:text-slate-100">
                        Boleto #{b.code}
                      </span>
                      <Badge className={`text-[10px] font-bold px-2 py-0.5 border ${meta.className}`}>
                        {meta.label}
                      </Badge>
                      <span className="text-[10px] font-semibold text-slate-500">• {scopeLabel}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span>
                        Vencimento: <strong className="text-slate-900 dark:text-slate-200">{formatDateBrShort(b.dueDate)}</strong>
                      </span>
                      {b.payerName && <span>Pagador: {b.payerName}</span>}
                      {b.isPaid && b.paidAt && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          Quitado em {formatDateBrShort(b.paidAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                      R$ {formatMoneyBr(b.isPaid ? (b.paidAmount || b.amount) : b.amount)}
                    </div>
                    {b.isOverdue && b.updatedTotalWithCharges && b.updatedTotalWithCharges > b.amount && (
                      <div className="text-[10.5px] font-bold text-rose-700 dark:text-rose-400 flex items-center justify-end gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Atualizado c/ encargos: R$ {formatMoneyBr(b.updatedTotalWithCharges)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <a
                    href={b.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>{b.isPaid ? "Baixar PDF do Boleto" : "Baixar Boleto (PDF)"}</span>
                  </a>

                  {!b.isPaid && copyLinha && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => triggerCopy(`linha_${b.id}`, copyLinha, "Linha digitável")}
                      className="min-h-8 h-auto py-1.5 px-3 rounded-xl text-[11px] font-bold gap-1.5 bg-white dark:bg-slate-900"
                    >
                      {copiedKey === `linha_${b.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {copiedKey === `linha_${b.id}`
                          ? "Linha Copiada!"
                          : failedKey === `linha_${b.id}`
                            ? "Falha ao copiar"
                            : "Copiar Linha Digitável"}
                      </span>
                    </Button>
                  )}

                  {!b.isPaid && b.pixCopiaECola && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => triggerCopy(`pix_${b.id}`, b.pixCopiaECola || "", "Código PIX")}
                      className="min-h-8 h-auto py-1.5 px-3 rounded-xl text-[11px] font-bold gap-1.5 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                    >
                      {copiedKey === `pix_${b.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <QrCode className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {copiedKey === `pix_${b.id}`
                          ? "PIX Copiado!"
                          : failedKey === `pix_${b.id}`
                            ? "Falha ao copiar"
                            : "Copiar PIX do Boleto"}
                      </span>
                    </Button>
                  )}

                  {!b.isPaid && b.copyPageUrl && (
                    <a
                      href={b.copyPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-2.5 min-h-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-700 dark:text-slate-200 font-bold text-[11px]"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span>Pagar / QR</span>
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pré-Boletos (Aguardando Emissão) */}
      {preBoletos.length > 0 && (
        <div className="space-y-2">
          {preBoletos.map((pre) => {
            const meta = getBoletoStatusBadgeMeta("aguardando_emissao")
            return (
              <div
                key={`pre_${pre.id || pre.code}`}
                className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2.5 ${meta.cardClassName}`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      Boleto Faturado Programado
                    </span>
                    <Badge className={`text-[10px] font-bold px-2 py-0.5 border ${meta.className}`}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Vencimento previsto: <strong>{formatDateBrShort(pre.dueDate)}</strong>
                    {pre.payerName ? ` • Pagador: ${pre.payerName}` : ""}
                    {" • O PDF e a linha digitável ficarão disponíveis automaticamente assim que o boleto for emitido."}
                  </p>
                </div>
                <div className="font-mono font-black text-sm text-slate-800 dark:text-slate-200 shrink-0">
                  R$ {formatMoneyBr(pre.amount)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Notas Fiscais Emitidas (NFS-e) */}
      {nfseInvoices.length > 0 && (
        <div className="space-y-2">
          {nfseInvoices.map((inv) => (
            <div
              key={`nfse_${inv.id || inv.numeroNfse}`}
              className="p-3.5 rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-black text-xs text-slate-900 dark:text-slate-100">
                    NFS-e Nº {inv.numeroNfse}
                  </span>
                  <Badge className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5">
                    Emitida / Autorizada
                  </Badge>
                  {inv.isConsolidated && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      Consolidada
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <span>Emissão: <strong>{formatDateBrShort(inv.dataEmissao)}</strong></span>
                  <span>Valor: <strong className="font-mono text-slate-900 dark:text-slate-100">R$ {formatMoneyBr(inv.valorServico)}</strong></span>
                  {inv.tomadorNome && <span className="truncate max-w-[260px]">Tomador: {inv.tomadorNome}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <a
                  href={inv.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl bg-[#0F3D4C] hover:bg-[#091E26] text-white font-bold text-[11px] transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>Baixar PDF (DANFSe)</span>
                </a>
                <a
                  href={inv.xmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 min-h-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-800 dark:text-slate-200 font-bold text-[11px] transition-colors"
                >
                  <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                  <span>XML</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
