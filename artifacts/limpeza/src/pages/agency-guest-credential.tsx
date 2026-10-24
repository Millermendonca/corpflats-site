import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import {
  ShieldCheck,
  User,
  FileText,
  Phone,
  Mail,
  Building2,
  Calendar,
  MapPin,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  Loader2,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function AgencyGuestCredential() {
  const [, params] = useRoute("/credenciamento/:code");
  const codeFromUrl = params?.code || new URLSearchParams(window.location.search).get("code") || "";
  const { toast } = useToast();

  const [lookupCode, setLookupCode] = useState(codeFromUrl);
  const [loading, setLoading] = useState(Boolean(codeFromUrl));
  const [submitting, setSubmitting] = useState(false);
  const [reservation, setReservation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [completed, setCompleted] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [guestDocument, setGuestDocument] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestSecondaryPhone, setGuestSecondaryPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [docPhotoBase64, setDocPhotoBase64] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState("");
  const [notes, setNotes] = useState("");

  const fetchReservation = async (targetCode: string) => {
    if (!targetCode.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/pms/agency-guest-credential/${encodeURIComponent(targetCode.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.reservation) {
        setErrorMsg(data.error || "Reserva não localizada. Verifique o código informado.");
        setReservation(null);
      } else {
        const r = data.reservation;
        setReservation(r);
        setGuestName(r.guestName || "");
        setGuestDocument(r.guestDocument || "");
        setGuestPhone(r.guestPhone || "");
        setGuestSecondaryPhone(r.guestSecondaryPhone || "");
        setGuestEmail(r.guestEmail || "");
      }
    } catch {
      setErrorMsg("Erro de conexão ao consultar a reserva.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (codeFromUrl) {
      fetchReservation(codeFromUrl);
    }
  }, [codeFromUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDocPhotoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation) return;

    const nameParts = guestName.trim().split(/\s+/).filter(Boolean);
    const cleanDoc = guestDocument.replace(/\D/g, "");
    const rawDoc = guestDocument.trim().replace(/[^0-9A-Za-z]/g, "");
    const cleanPhone = guestPhone.replace(/\D/g, "");

    if (nameParts.length < 2) {
      toast({
        title: "Nome Completo obrigatório",
        description: "Informe o nome completo (nome e sobrenome) do hóspede conforme o documento oficial.",
        variant: "destructive"
      });
      return;
    }
    if (cleanDoc.length < 11 && rawDoc.length < 6) {
      toast({
        title: "CPF obrigatório",
        description: "Informe o CPF completo (11 dígitos) do hóspede para liberação na portaria.",
        variant: "destructive"
      });
      return;
    }
    if (cleanPhone.length < 10) {
      toast({
        title: "Telefone / WhatsApp obrigatório",
        description: "Informe o telefone / WhatsApp do hóspede com DDD para o envio da confirmação e instruções da estadia.",
        variant: "destructive"
      });
      return;
    }
    if (!docPhotoBase64 && !reservation.hasDocPhoto) {
      toast({
        title: "Documento de Identificação obrigatório",
        description: "Anexe a foto ou PDF do documento oficial com foto (RG, CNH ou Passaporte) do hóspede para liberação na recepção.",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/pms/agency-guest-credential/${encodeURIComponent(reservation.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestDocument: cleanDoc,
          guestPhone: cleanPhone,
          guestSecondaryPhone: guestSecondaryPhone.replace(/\D/g, ""),
          guestEmail: guestEmail.trim(),
          docPhotoBase64,
          notes: notes.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Atenção", description: data.error || "Não foi possível salvar os dados.", variant: "destructive" });
      } else {
        setCompleted(true);
        toast({
          title: "Credenciamento Concluído!",
          description: "Os dados do hóspede foram liberados na portaria 24h e as orientações de acesso foram enviadas via WhatsApp."
        });
      }
    } catch {
      toast({ title: "Erro de conexão", description: "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateBr = (d?: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return day && m && y ? `${day}/${m}/${y}` : d;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header Institucional CorpFlats */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/60 border border-teal-500/30 p-6 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" /> Portal de Credenciamento do Hóspede
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white mt-2">
                CorpFlats • Edifício Soho
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Credenciamento Antecipado e Liberação de Acesso do Hóspede na Portaria 24h
              </p>
            </div>
          </div>
        </div>

        {!reservation && !loading && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <Label className="text-sm font-semibold text-slate-200">
              Localizar Reserva (Código da Reserva, Nº B2B ou RLOC)
            </Label>
            <div className="flex gap-2">
              <Input
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                placeholder="Ex: RES-101 ou B2B-25055349 ou RLOC"
                className="bg-slate-950 border-slate-700 text-white"
              />
              <Button onClick={() => fetchReservation(lookupCode)} className="bg-teal-600 hover:bg-teal-500 text-white font-bold">
                Localizar
              </Button>
            </div>
            {errorMsg && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <span className="text-sm text-slate-300 font-medium">Carregando dados da reserva...</span>
          </div>
        )}

        {reservation && !completed && (
          <>
            {/* Resumo da Reserva (Sem Valores Financeiros) */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    Reserva Confirmada • Sem Exibição Tarifária
                  </span>
                  <h2 className="text-lg font-bold text-white">
                    {reservation.b2bReservationNumber
                      ? `Reserva B2B #${reservation.b2bReservationNumber}`
                      : `Reserva ${reservation.code}`}
                    {reservation.b2bLocatorRloc ? ` (RLOC: ${reservation.b2bLocatorRloc})` : ""}
                  </h2>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Flat {reservation.flatNumber || "Definido"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {reservation.agencyName && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5">
                    <Briefcase className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-slate-400 font-medium">Agência Solicitante</div>
                      <div className="text-white font-semibold">{reservation.agencyName}</div>
                      {reservation.agencyPosUnit && (
                        <div className="text-slate-400 text-[11px]">{reservation.agencyPosUnit}</div>
                      )}
                    </div>
                  </div>
                )}
                {reservation.companyName && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-slate-400 font-medium">Empresa Corporativa</div>
                      <div className="text-white font-semibold">{reservation.companyName}</div>
                    </div>
                  </div>
                )}
                {reservation.requesterName && !reservation.agencyName && !reservation.companyName && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5">
                    <User className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-slate-400 font-medium">Solicitante da Reserva</div>
                      <div className="text-white font-semibold">{reservation.requesterName}</div>
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-400 font-medium">Período de Hospedagem</div>
                    <div className="text-white font-semibold">
                      Check-in: {formatDateBr(reservation.checkinDate)} às {reservation.checkinTime || "14:00"}
                    </div>
                    <div className="text-slate-300">
                      Check-out: {formatDateBr(reservation.checkoutDate)} até {reservation.checkoutTime || "12:00"}
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5">
                  <Coffee className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-400 font-medium">Regime & Endereço</div>
                    <div className="text-white font-semibold">
                      {reservation.includeBreakfast ? "Café da Manhã Incluso" : "Somente Hospedagem"}
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> R. Conselheiro Otaviano, 209 — Centro, Campos/RJ
                    </div>
                  </div>
                </div>
              </div>

              {/* Aviso Cordial Importante sobre a Portaria */}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-200 leading-relaxed">
                <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Por que este preenchimento antecipado é indispensável?
                </div>
                O <strong>CorpFlats (Edifício Soho)</strong> opera com controle eletrônico de acesso e liberação prévia na recepção/portaria 24h.{" "}
                <strong>Não é possível realizar o cadastro presencialmente na hora da chegada no balcão</strong>, pois sem o registro prévio neste link a portaria não conseguirá localizar a reserva no sistema de acesso nem autorizar a entrada do hóspede. Assim que você concluir os dados obrigatórios abaixo, enviaremos automaticamente a confirmação da reserva e as instruções de acesso ao WhatsApp do hóspede (sem exibir tarifas ou valores financeiros).
              </div>
            </div>

            {/* Formulário de Credenciamento do Hóspede */}
            <form onSubmit={handleSubmit} className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-400" />
                  Dados Obrigatórios do Hóspede para a Portaria
                </h3>
                <span className="text-[11px] text-amber-300 font-semibold">
                  * Campos obrigatórios para liberação
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-slate-300">Nome Completo do Hóspede (Nome e Sobrenome) *</Label>
                  <Input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nome completo conforme documento oficial"
                    required
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">CPF do Hóspede *</Label>
                  <Input
                    value={guestDocument}
                    onChange={(e) => setGuestDocument(e.target.value)}
                    placeholder="000.000.000-00"
                    required
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" /> Telefone / WhatsApp do Hóspede (com DDD) *
                  </Label>
                  <Input
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="(22) 99999-9999"
                    required
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Telefone Secundário (Opcional)</Label>
                  <Input
                    value={guestSecondaryPhone}
                    onChange={(e) => setGuestSecondaryPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-teal-400" /> E-mail do Hóspede (Opcional)
                  </Label>
                  <Input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="hospede@empresa.com.br"
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    Documento Oficial de Identificação com Foto (RG, CNH ou Passaporte — Imagem ou PDF) *
                  </Label>
                  <label
                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${
                      docFileName || reservation.hasDocPhoto
                        ? "border-emerald-500/60 bg-emerald-950/20"
                        : "border-slate-700 hover:border-teal-500/60 bg-slate-950/60"
                    }`}
                  >
                    <Upload className={`w-6 h-6 mb-1.5 ${docFileName || reservation.hasDocPhoto ? "text-emerald-400" : "text-teal-400"}`} />
                    <span className="text-xs font-semibold text-slate-200">
                      {docFileName
                        ? `Arquivo anexado: ${docFileName}`
                        : reservation.hasDocPhoto
                          ? "Documento já anexado • Clique caso deseje substituir"
                          : "Clique para anexar foto ou PDF do RG / CNH do hóspede (Obrigatório *)"}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      Formatos aceitos: JPG, PNG, WEBP ou PDF
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-slate-300">Observações para a Recepção / Portaria (Opcional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Horário previsto de chegada, placa do veículo para garagem..."
                    rows={2}
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-6 text-sm shadow-lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando e Liberando Acesso na Portaria...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar Credenciamento e Enviar Acesso ao Hóspede
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {completed && reservation && (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/40 p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-extrabold text-white">
              Credenciamento Concluído com Sucesso!
            </h2>
            <p className="text-sm text-slate-200 max-w-lg mx-auto leading-relaxed">
              Os dados do(a) hóspede <strong>{guestName}</strong> para o <strong>Flat {reservation.flatNumber}</strong> já foram transmitidos para a portaria 24h do Edifício Soho e as instruções operacionais da estadia foram disparadas para o WhatsApp informado (com total sigilo tarifário).
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => setCompleted(false)}
                className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/60"
              >
                Revisar ou Atualizar Dados do Hóspede
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
