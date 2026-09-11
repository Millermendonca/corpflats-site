import { useState, useEffect } from "react"
import { useRoute } from "wouter"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ShieldCheck, FileText, CheckCircle2, AlertTriangle, 
  ExternalLink, Download, Lock, Calendar, Smartphone, 
  Globe, Hash, User, Building2, Copy, Check
} from "lucide-react"

export default function VerifyFnrh() {
  const [, params] = useRoute("/verificar-ficha/:uuid")
  const uuid = params?.uuid || ""

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)

  useEffect(() => {
    if (!uuid) {
      setError("Identificador do documento não fornecido.")
      setLoading(false)
      return
    }

    fetch(`/api/public/verify-fnrh/${uuid}`)
      .then(async (r) => {
        const json = await r.json()
        if (r.ok && json.isValid) {
          setData(json)
        } else {
          setError(json.error || "Documento não localizado ou inválido.")
        }
      })
      .catch(() => {
        setError("Erro ao consultar serviço de autenticidade do documento.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [uuid])

  const copySha256 = () => {
    if (data?.document?.sha256Hash) {
      navigator.clipboard.writeText(data.document.sha256Hash)
      setCopiedHash(true)
      setTimeout(() => setCopiedHash(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/90 text-slate-900 py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* Top Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 border border-sky-200 rounded-full text-sky-700 text-xs font-bold shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
            <span>Portal de Autenticidade Digital Oficial</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center justify-center gap-2">
            <span className="bg-slate-900 text-white px-2 py-0.5 rounded-lg text-lg">CF</span>
            <span>CorpFlats Hospedagem</span>
          </h1>
          <p className="text-xs text-slate-500">
            Validação de Assinatura Eletrônica e Integridade de Ficha FNRH
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <Card className="p-8 text-center bg-white border border-slate-200 shadow-md rounded-2xl">
            <div className="animate-spin w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">Verificando autenticidade forense na base de dados...</p>
          </Card>
        )}

        {/* Error / Invalid State */}
        {!loading && error && (
          <Card className="p-6 sm:p-8 bg-rose-50/80 border border-rose-200 shadow-md rounded-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-rose-900">Documento Não Verificado</h2>
              <p className="text-xs sm:text-sm text-rose-700 leading-relaxed">
                {error}
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Se você acredita que isso é um equívoco, contate a recepção pelo WhatsApp oficial (22) 99712-4021.
            </p>
          </Card>
        )}

        {/* Valid Certificate Card */}
        {!loading && data && data.isValid && (
          <Card className="bg-white border border-slate-200/90 shadow-xl rounded-3xl overflow-hidden">
            {/* Certificate Header Banner */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 shadow-inner">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold tracking-wide uppercase mb-0.5">
                  <Lock className="w-3 h-3" /> Documento Autêntico e Íntegro
                </div>
                <h2 className="text-base font-bold">Assinatura Eletrônica Válida</h2>
                <p className="text-[11px] text-emerald-100 opacity-90">
                  Cadeia de custódia e trilha forense confirmadas
                </p>
              </div>
            </div>

            {/* Content Details */}
            <div className="p-5 sm:p-6 space-y-5">
              {/* Informações Principais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block">Hóspede Signatário</span>
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <User className="w-4 h-4 text-sky-600" />
                    {data.document.guestName}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block">CPF do Hóspede</span>
                  <span className="text-xs font-mono font-bold text-slate-800 mt-0.5 block">
                    {data.document.guestCpfMasked || "Protegido por LGPD"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block">Reserva</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                    {data.document.reservationCode}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block">Horário da Assinatura</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {data.document.signedAtBrasilia}
                  </span>
                </div>
              </div>

              {/* Metadados Forenses do Dispositivo */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                  <span>Trilha de Auditoria Forense</span>
                </h3>

                <div className="text-[11px] space-y-1.5 text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Endereço IP:</span>
                    <span className="font-mono font-bold text-slate-800">{data.document.signerIp || "Registrado"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Dispositivo / User-Agent:</span>
                    <span className="font-mono text-[10px] text-slate-700 truncate max-w-[240px]" title={data.document.signerUserAgent}>
                      {data.document.signerUserAgent || "Navegador Web do Hóspede"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">ID Único (UUID v4):</span>
                    <span className="font-mono text-[10px] text-slate-700 truncate max-w-[240px]">
                      {data.document.documentUuid}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hash SHA-256 */}
              <div className="space-y-1.5 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Hash Criptográfico de Integridade (SHA-256)</span>
                  </span>
                  <button 
                    onClick={copySha256}
                    className="text-[11px] text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1 hover:underline"
                  >
                    {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedHash ? "Copiado!" : "Copiar Hash"}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-900 rounded-xl text-emerald-400 font-mono text-[10px] break-all select-all shadow-inner leading-relaxed">
                  {data.document.sha256Hash}
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Este hash comprova matematicamente que o documento arquivado não sofreu qualquer alteração pós-assinatura.
                </p>
              </div>

              {/* Base Legal */}
              <div className="p-3 bg-sky-50/70 border border-sky-200/70 rounded-xl text-[11px] text-sky-900 leading-relaxed">
                <span className="font-bold block mb-0.5">Amparo Legal e Validade Jurídica:</span>
                {data.legalFramework}
              </div>

              {/* Ação: Visualizar PDF */}
              {data.document.fileUrl && (
                <div className="pt-2">
                  <Button 
                    onClick={() => window.open(data.document.fileUrl, "_blank")}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm h-11 rounded-xl gap-2 shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Visualizar / Baixar PDF Oficial Assinado</span>
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        <div className="text-center text-[11px] text-slate-400">
          CorpFlats Hospedagem  •  Sistema de Gestão Hoteleira e Check-in Digital Blindado
        </div>

      </div>
    </div>
  )
}
