import { useState } from "react"
import { Check, Copy, ExternalLink, Link2, Loader2, Mail, MessageCircle, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { copyTextReliably } from "@/components/financial-documents-section"

interface AdminFinancialHubLinkActionsProps {
  kind: "company" | "agency" | "guest" | "requester"
  companyId?: number | null
  agencyId?: number | null
  guestId?: number | null
  label?: string
  email?: string
  phone?: string
  document?: string
  compact?: boolean
}

export function AdminFinancialHubLinkActions({
  kind,
  companyId,
  agencyId,
  guestId,
  label,
  email,
  phone,
  document,
  compact = false,
}: AdminFinancialHubLinkActionsProps) {
  const { toast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [loadingLink, setLoadingLink] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [hubUrl, setHubUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [targetPhone, setTargetPhone] = useState(phone || "")
  const [targetEmail, setTargetEmail] = useState(email || "")

  const buildPayload = (extra: Record<string, any> = {}) => ({
    kind,
    companyId: companyId || undefined,
    agencyId: agencyId || undefined,
    guestId: guestId || undefined,
    label: label || undefined,
    email: email || undefined,
    phone: phone || undefined,
    document: document || undefined,
    ...extra,
  })

  const fetchOrGenerateLink = async (regenerate = false): Promise<string> => {
    const res = await fetch("/api/admin/financial-hub-link", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload({ regenerate })),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.url) {
      throw new Error(json.error || "Não foi possível gerar o link do Painel Financeiro.")
    }
    setHubUrl(json.url)
    return json.url
  }

  const handleQuickCopy = async () => {
    setLoadingLink(true)
    try {
      const url = hubUrl || (await fetchOrGenerateLink(false))
      const ok = await copyTextReliably(url)
      if (ok) {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2200)
        toast({
          title: "Link do Painel Financeiro copiado!",
          description: "O cliente pode acessar todos os boletos e notas fiscais por este link exclusivo.",
        })
      } else {
        setModalOpen(true)
      }
    } catch (err: any) {
      toast({
        title: "Erro ao gerar link",
        description: err?.message || "Verifique os dados cadastrais.",
        variant: "destructive",
      })
    } finally {
      setLoadingLink(false)
    }
  }

  const handleOpenModal = async () => {
    setTargetPhone(phone || "")
    setTargetEmail(email || "")
    setConfirmRegenerate(false)
    setModalOpen(true)
    setLoadingLink(true)
    try {
      await fetchOrGenerateLink(false)
    } catch (err: any) {
      toast({
        title: "Erro ao carregar link",
        description: err?.message || "Não foi possível obter o link.",
        variant: "destructive",
      })
    } finally {
      setLoadingLink(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const newUrl = await fetchOrGenerateLink(true)
      setConfirmRegenerate(false)
      await copyTextReliably(newUrl)
      toast({
        title: "Link anterior revogado e novo link gerado!",
        description: "O novo link já foi copiado para a área de transferência.",
      })
    } catch (err: any) {
      toast({
        title: "Erro ao regenerar",
        description: err?.message || "Falha ao revogar link.",
        variant: "destructive",
      })
    } finally {
      setRegenerating(false)
    }
  }

  const handleSend = async (channels: { whatsapp: boolean; email: boolean }) => {
    setSending(true)
    try {
      const res = await fetch("/api/admin/financial-hub-link/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            targetPhone: targetPhone.trim(),
            targetEmail: targetEmail.trim(),
            sendWhatsapp: channels.whatsapp,
            sendEmail: channels.email,
          })
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Falha no disparo do link.")
      if (json.url) setHubUrl(json.url)
      toast({
        title: "Link do Painel Financeiro enviado!",
        description: [
          json.whatsappSent ? "WhatsApp enviado" : null,
          json.emailSent ? "E-mail enviado" : null,
        ]
          .filter(Boolean)
          .join(" • ") || "Link gerado com sucesso.",
      })
    } catch (err: any) {
      toast({
        title: "Erro ao enviar link",
        description: err?.message || "Não foi possível enviar.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="inline-flex items-center gap-1 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleQuickCopy}
          disabled={loadingLink}
          className={
            compact
              ? "h-7 px-2 text-[10px] font-bold rounded-lg gap-1 text-[#0F3D4C] dark:text-sky-300 border-sky-300 dark:border-sky-800"
              : "h-8 px-3 text-xs font-bold rounded-xl gap-1.5 text-[#0F3D4C] dark:text-sky-300 border-sky-300 dark:border-sky-800"
          }
          title="Copiar link exclusivo do Painel Financeiro (Boletos e Notas)"
        >
          {loadingLink ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : copied ? (
            <Check className="w-3 h-3 text-emerald-600" />
          ) : (
            <Link2 className="w-3 h-3" />
          )}
          <span>{copied ? "Copiado!" : compact ? "Painel Fin." : "Copiar Link Financeiro"}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpenModal}
          className={
            compact
              ? "h-7 px-2 text-[10px] font-bold rounded-lg gap-1"
              : "h-8 px-2.5 text-xs font-bold rounded-xl gap-1"
          }
          title="Enviar por WhatsApp/E-mail ou revogar link do Painel Financeiro"
        >
          <Send className="w-3 h-3" />
          {!compact && <span>Enviar / Gerenciar</span>}
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6 bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-600" />
              <span>Link do Painel Financeiro • {label || "Cliente"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Link exclusivo sem senha com acesso a todos os boletos (status Pago, Vence Hoje, Pendente, Em Atraso, Aguardando Emissão), notas fiscais (NFS-e) e reservas vinculadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">URL Exclusiva (Permanente e Revogável)</Label>
              <div className="flex gap-1.5">
                <Input
                  readOnly
                  value={loadingLink ? "Gerando link..." : hubUrl}
                  className="font-mono text-[11px] h-9 rounded-xl"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!hubUrl) return
                    const ok = await copyTextReliably(hubUrl)
                    if (ok) {
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 2000)
                      toast({ title: "Link copiado!" })
                    }
                  }}
                  className="h-9 px-3 rounded-xl shrink-0"
                  aria-label="Copiar URL do painel financeiro"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
                {hubUrl && (
                  <a
                    href={hubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-9 px-3 rounded-xl border border-border hover:bg-muted shrink-0"
                    aria-label="Abrir painel financeiro em nova aba"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">WhatsApp de Envio</Label>
                <Input
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="(22) 99999-9999"
                  className="h-9 text-xs rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">E-mail de Envio</Label>
                <Input
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="financeiro@empresa.com"
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={sending || !targetPhone.trim()}
                onClick={() => handleSend({ whatsapp: true, email: false })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Enviar WhatsApp</span>
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={sending || !targetEmail.trim()}
                onClick={() => handleSend({ whatsapp: false, email: true })}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Enviar E-mail</span>
              </Button>
              {targetPhone.trim() && targetEmail.trim() && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() => handleSend({ whatsapp: true, email: true })}
                  className="font-bold text-xs rounded-xl gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar nos 2</span>
                </Button>
              )}
            </div>

            <div className="pt-3 border-t border-border">
              {!confirmRegenerate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRegenerate(true)}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[11px] font-bold gap-1.5 px-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Revogar link atual e gerar um novo</span>
                </Button>
              ) : (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-2">
                  <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                    O link anterior deixará de funcionar imediatamente (ideal caso alguém tenha saído da empresa). Deseja confirmar?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={regenerating}
                      onClick={handleRegenerate}
                      className="h-8 text-[11px] font-bold rounded-xl"
                    >
                      {regenerating ? "Regenerando..." : "Sim, revogar e gerar novo"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRegenerate(false)}
                      className="h-8 text-[11px] font-bold rounded-xl"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="rounded-xl text-xs font-bold">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
