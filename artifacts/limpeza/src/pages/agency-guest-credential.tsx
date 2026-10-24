import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
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
  Camera,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  Loader2,
  Briefcase,
  Search,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export function isValidBrazilianCpf(rawCpf: string): boolean {
  const cpf = String(rawCpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10), 10)) return false;
  return true;
}

function formatCpfMask(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function formatPhoneMask(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 13);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
}

export default function AgencyGuestCredential() {
  const [location, setLocation] = useLocation();
  const [, paramsCred] = useRoute("/credenciamento/:code");
  const [, paramsCredHosp] = useRoute("/credenciamento-hospede/:code");
  const [, paramsIdent] = useRoute("/identificar-reserva/:code");
  const [, paramsCad] = useRoute("/cadastro-hospede/:code");

  const codeFromUrl =
    paramsCred?.code ||
    paramsCredHosp?.code ||
    paramsIdent?.code ||
    paramsCad?.code ||
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") || "" : "");

  const isGuestSelfIdentifyMode =
    location.startsWith("/identificar") ||
    location.startsWith("/cadastro-hospede") ||
    !codeFromUrl;

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
  const [docIsPdf, setDocIsPdf] = useState(false);
  const [notes, setNotes] = useState("");

  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [whatsappCheckedPhone, setWhatsappCheckedPhone] = useState("");

  const cleanDocDigits = guestDocument.replace(/\D/g, "");
  const cpfIsComplete = cleanDocDigits.length === 11;
  const cpfIsValid = cpfIsComplete && isValidBrazilianCpf(cleanDocDigits);

  const verifyWhatsAppNumber = async (rawPhone: string): Promise<boolean> => {
    const digits = String(rawPhone || "").replace(/\D/g, "");
    if (digits.length < 10) {
      setWhatsappStatus("idle");
      return false;
    }
    if (whatsappCheckedPhone === digits && (whatsappStatus === "valid" || whatsappStatus === "invalid")) {
      return whatsappStatus === "valid";
    }
    setWhatsappStatus("checking");
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(digits)}`);
      const data = await res.json();
      setWhatsappCheckedPhone(digits);
      if (data && data.checked && data.exists === false) {
        setWhatsappStatus("invalid");
        return false;
      }
      setWhatsappStatus("valid");
      return true;
    } catch {
      setWhatsappStatus("valid");
      return true;
    }
  };

  const fetchReservation = async (targetCode: string) => {
    const trimmed = String(targetCode || "").trim();
    if (!trimmed) {
      setErrorMsg("Digite o localizador ou número da sua reserva para continuar.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/pms/agency-guest-credential/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok || !data.reservation) {
        setErrorMsg(
          data.error ||
            "Reserva não localizada. Verifique o código localizador (ex: RLOC de 6 caracteres, número da reserva B2B ou código RES-...)."
        );
        setReservation(null);
      } else {
        const r = data.reservation;
        setReservation(r);
        setGuestName(r.guestName || "");
        setGuestDocument(r.guestDocument ? formatCpfMask(r.guestDocument) : "");
        setGuestPhone(r.guestPhone ? formatPhoneMask(r.guestPhone) : "");
        setGuestSecondaryPhone(r.guestSecondaryPhone ? formatPhoneMask(r.guestSecondaryPhone) : "");
        setGuestEmail(r.guestEmail || "");
        setWhatsappStatus("idle");
        setWhatsappCheckedPhone("");
        if (r.guestPhone && String(r.guestPhone).replace(/\D/g, "").length >= 10) {
          verifyWhatsAppNumber(r.guestPhone);
        }
      }
    } catch {
      setErrorMsg("Erro de conexão ao consultar a reserva. Tente novamente.");
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

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo selecionado excede 10 MB. Por favor, selecione uma foto ou PDF de até 10 MB.",
        variant: "destructive"
      });
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    setDocIsPdf(isPdf);
    setDocFileName(file.name || (isPdf ? "documento.pdf" : "documento.jpg"));

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        let base64 = reader.result;
        if (isPdf && base64.startsWith("data:application/octet-stream;base64,")) {
          base64 = base64.replace("data:application/octet-stream;base64,", "data:application/pdf;base64,");
        }
        setDocPhotoBase64(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation) return;

    const nameParts = guestName.trim().split(/\s+/).filter(Boolean);
    const cleanDoc = guestDocument.replace(/\D/g, "");
    const cleanPhone = guestPhone.replace(/\D/g, "");
    const cleanEmail = guestEmail.trim();

    if (nameParts.length < 2) {
      toast({
        title: "Nome Completo obrigatório",
        description: "Informe o nome completo (nome e sobrenome) do hóspede conforme o documento oficial.",
        variant: "destructive"
      });
      return;
    }
    if (!isValidBrazilianCpf(cleanDoc)) {
      toast({
        title: "CPF inválido",
        description: "O CPF informado não é válido. Verifique os 11 dígitos do CPF.",
        variant: "destructive"
      });
      return;
    }
    if (cleanPhone.length < 10) {
      toast({
        title: "Telefone / WhatsApp obrigatório",
        description: "Informe o telefone / WhatsApp com DDD para receber a confirmação e a senha do flat.",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const hasWa = await verifyWhatsAppNumber(cleanPhone);
      if (!hasWa) {
        toast({
          title: "Número sem WhatsApp ativo",
          description: "O telefone informado não possui conta ativa no WhatsApp. Informe um número que tenha WhatsApp.",
          variant: "destructive"
        });
        setSubmitting(false);
        return;
      }

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        toast({
          title: "E-mail válido obrigatório",
          description: "Informe um endereço de e-mail válido do hóspede.",
          variant: "destructive"
        });
        setSubmitting(false);
        return;
      }

      if (!docPhotoBase64 && !reservation.hasDocPhoto) {
        toast({
          title: "Documento de Identificação obrigatório",
          description: "Anexe uma foto da galeria, um arquivo PDF ou tire uma foto do documento (RG ou CNH).",
          variant: "destructive"
        });
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/pms/agency-guest-credential/${encodeURIComponent(reservation.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestDocument: cleanDoc,
          guestPhone: cleanPhone,
          guestSecondaryPhone: guestSecondaryPhone.replace(/\D/g, ""),
          guestEmail: cleanEmail,
          docPhotoBase64,
          notes: notes.trim(),
          sourceMode: isGuestSelfIdentifyMode ? "guest" : "agency"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.invalidWhatsApp) setWhatsappStatus("invalid");
        toast({
          title: "Atenção",
          description: data.error || "Não foi possível salvar os dados.",
          variant: "destructive"
        });
      } else {
        setCompleted(true);
        toast({
          title: isGuestSelfIdentifyMode ? "Reserva Identificada e Liberada!" : "Credenciamento Concluído!",
          description:
            "Os dados foram liberados na portaria 24h e as orientações de acesso foram enviadas para o WhatsApp informado."
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
                <ShieldCheck className="w-3.5 h-3.5" />{" "}
                {isGuestSelfIdentifyMode
                  ? "Identificação da Reserva • Acesso do Hóspede"
                  : "Portal de Credenciamento do Hóspede"}
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white mt-2">
                CorpFlats • Edifício Soho
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                {isGuestSelfIdentifyMode
                  ? "Localize sua reserva pelo código localizador e cadastre seus dados para receber as instruções no WhatsApp"
                  : "Credenciamento Antecipado e Liberação de Acesso do Hóspede na Portaria 24h"}
              </p>
            </div>
          </div>
        </div>

        {!reservation && !loading && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-lg">
            <div className="space-y-1">
              <Label className="text-sm font-bold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-teal-400" />
                Digite o Localizador da sua Reserva
              </Label>
              <p className="text-xs text-slate-400 leading-relaxed">
                Informe o <strong>Localizador (RLOC)</strong> constante no seu voucher (ex: <code className="text-teal-300">ZYIK2X</code>), o{" "}
                <strong>Número da Reserva B2B/Agência</strong> (ex: <code className="text-teal-300">25057926</code>) ou o{" "}
                <strong>Código CorpFlats</strong> (ex: <code className="text-teal-300">RES-605</code>):
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchReservation(lookupCode);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <Input
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                placeholder="Ex: ZYIK2X, 25057926 ou RES-605"
                autoFocus
                className="bg-slate-950 border-slate-700 text-white font-mono text-base h-11 uppercase tracking-wider"
              />
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-500 text-white font-bold h-11 px-6 shrink-0"
              >
                <Search className="w-4 h-4 mr-2" />
                Localizar Reserva
              </Button>
            </form>
            {errorMsg && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <span className="text-sm text-slate-300 font-medium">Localizando sua reserva...</span>
          </div>
        )}

        {reservation && !completed && (
          <>
            {/* Resumo da Reserva (Sem Valores Financeiros) */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    ✓ Reserva Localizada • Confirmada
                  </span>
                  <h2 className="text-lg font-bold text-white">
                    {reservation.b2bReservationNumber
                      ? `Reserva #${reservation.b2bReservationNumber}`
                      : `Reserva ${reservation.code}`}
                    {reservation.b2bLocatorRloc && reservation.b2bLocatorRloc !== reservation.b2bReservationNumber
                      ? ` • Localizador: ${reservation.b2bLocatorRloc}`
                      : ""}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Flat {reservation.flatNumber || "Definido"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReservation(null);
                      setLookupCode("");
                      setErrorMsg("");
                    }}
                    className="h-7 px-2.5 text-[11px] border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Trocar Localizador
                  </Button>
                </div>
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
                      {reservation.includeBreakfast ? "Café da Manhã Incluso (servido no flat)" : "Somente Hospedagem"}
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> Edifício Soho • R. Conselheiro Otaviano, 209 — Centro, Campos/RJ
                    </div>
                  </div>
                </div>
              </div>

              {/* Aviso Cordial Importante sobre a Portaria */}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-200 leading-relaxed">
                <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {isGuestSelfIdentifyMode
                    ? "Preencha seus dados abaixo para liberar sua entrada e receber as instruções no WhatsApp"
                    : "Por que este preenchimento antecipado é indispensável?"}
                </div>
                {isGuestSelfIdentifyMode ? (
                  <>
                    O <strong>CorpFlats (Edifício Soho)</strong> opera com liberação antecipada na recepção 24h. Assim que você preencher seu{" "}
                    <strong>Nome Completo, CPF, WhatsApp, E-mail e anexar seu Documento (foto da galeria, PDF ou câmera)</strong>, sua entrada estará liberada e enviaremos imediatamente para o seu{" "}
                    <strong>WhatsApp</strong> a confirmação da sua estadia e as instruções de acesso ao flat.
                  </>
                ) : (
                  <>
                    O <strong>CorpFlats (Edifício Soho)</strong> opera com controle eletrônico de acesso e liberação prévia na recepção/portaria 24h.{" "}
                    <strong>Não é possível realizar o cadastro presencialmente na hora da chegada no balcão</strong>, pois sem o registro prévio neste link a portaria não conseguirá localizar a reserva no sistema de acesso nem autorizar a entrada do hóspede. Assim que você concluir os dados obrigatórios abaixo, enviaremos automaticamente a confirmação da reserva e as instruções de acesso ao WhatsApp do hóspede (sem exibir tarifas ou valores financeiros).
                  </>
                )}
              </div>
            </div>

            {/* Formulário de Credenciamento / Identificação do Hóspede */}
            <form onSubmit={handleSubmit} className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-400" />
                  {isGuestSelfIdentifyMode
                    ? "Seus Dados para Liberação na Recepção"
                    : "Dados Obrigatórios do Hóspede para a Portaria"}
                </h3>
                <span className="text-[11px] text-amber-300 font-semibold">
                  * Todos os campos principais são obrigatórios
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

                {/* CPF com Validação Matemática de Dígitos Verificadores */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <Label className="text-xs text-slate-300">CPF do Hóspede *</Label>
                    {cpfIsComplete && (
                      <span
                        className={`text-[10px] font-bold ${
                          cpfIsValid ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {cpfIsValid ? "✓ CPF válido" : "❌ CPF inválido"}
                      </span>
                    )}
                  </div>
                  <Input
                    value={guestDocument}
                    onChange={(e) => setGuestDocument(formatCpfMask(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    maxLength={14}
                    required
                    className={`bg-slate-950 text-white ${
                      cpfIsComplete
                        ? cpfIsValid
                          ? "border-emerald-500/60"
                          : "border-rose-500/70"
                        : "border-slate-700"
                    }`}
                  />
                </div>

                {/* Telefone / WhatsApp com Verificação Real na Z-API */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <Label className="text-xs text-slate-300 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" /> Telefone / WhatsApp (com DDD) *
                    </Label>
                    {whatsappStatus === "checking" && (
                      <span className="text-[10px] text-sky-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Verificando WhatsApp...
                      </span>
                    )}
                    {whatsappStatus === "valid" && (
                      <span className="text-[10px] font-bold text-emerald-400">✓ WhatsApp ativo</span>
                    )}
                    {whatsappStatus === "invalid" && (
                      <span className="text-[10px] font-bold text-rose-400">❌ Sem WhatsApp ativo</span>
                    )}
                  </div>
                  <Input
                    value={guestPhone}
                    onChange={(e) => {
                      const formatted = formatPhoneMask(e.target.value);
                      setGuestPhone(formatted);
                      if (whatsappStatus !== "idle") setWhatsappStatus("idle");
                    }}
                    onBlur={() => {
                      if (guestPhone.replace(/\D/g, "").length >= 10) {
                        verifyWhatsAppNumber(guestPhone);
                      }
                    }}
                    placeholder="(22) 99999-9999"
                    inputMode="tel"
                    required
                    className={`bg-slate-950 text-white ${
                      whatsappStatus === "valid"
                        ? "border-emerald-500/60"
                        : whatsappStatus === "invalid"
                          ? "border-rose-500/70"
                          : "border-slate-700"
                    }`}
                  />
                </div>

                {/* E-mail Obrigatório */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-teal-400" /> E-mail do Hóspede *
                  </Label>
                  <Input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="hospede@empresa.com.br"
                    required
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Telefone Secundário (Opcional)</Label>
                  <Input
                    value={guestSecondaryPhone}
                    onChange={(e) => setGuestSecondaryPhone(formatPhoneMask(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                {/* Anexo do Documento: Galeria / PDF ou Câmera (Sem Inspeção de IA) */}
                <div className="sm:col-span-2 space-y-2.5 pt-1">
                  <Label className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    Documento de Identificação (RG, CNH ou Passaporte — Foto da Galeria, PDF ou Câmera) *
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Botão 1: Escolher da Galeria ou Enviar PDF (SEM capture para abrir Galeria e Arquivos/PDF no celular) */}
                    <label className="flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-teal-500/50 bg-teal-950/20 hover:bg-teal-950/40 p-3.5 cursor-pointer transition-colors text-center">
                      <Upload className="w-5 h-5 text-teal-400 shrink-0" />
                      <div className="text-left">
                        <div className="text-xs font-bold text-white">
                          📁 Escolher da Galeria ou PDF
                        </div>
                        <div className="text-[10px] text-slate-300">
                          Selecionar foto salva ou arquivo PDF
                        </div>
                      </div>
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>

                    {/* Botão 2: Tirar Foto com a Câmera */}
                    <label className="flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-700 hover:border-teal-500/50 bg-slate-950/70 hover:bg-slate-900 p-3.5 cursor-pointer transition-colors text-center">
                      <Camera className="w-5 h-5 text-sky-400 shrink-0" />
                      <div className="text-left">
                        <div className="text-xs font-bold text-white">
                          📷 Tirar Foto Agora
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Abrir a câmera do celular
                        </div>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Status / Preview do Arquivo Anexado */}
                  {(docFileName || reservation.hasDocPhoto) && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-emerald-300 truncate">
                            {docFileName
                              ? `Documento anexado: ${docFileName}`
                              : "Documento já registrado nesta reserva"}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {docIsPdf
                              ? "Arquivo PDF pronto para envio"
                              : "Imagem do documento pronta para envio"}
                          </div>
                        </div>
                      </div>
                      {docPhotoBase64 && !docIsPdf && docPhotoBase64.startsWith("data:image/") && (
                        <img
                          src={docPhotoBase64}
                          alt="Preview Documento"
                          className="w-14 h-10 object-cover rounded-lg border border-emerald-500/30 shrink-0"
                        />
                      )}
                    </div>
                  )}
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
                    Validando e Liberando Acesso na Recepção...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {isGuestSelfIdentifyMode
                      ? "Confirmar Meus Dados e Receber Instruções no WhatsApp"
                      : "Confirmar Credenciamento e Enviar Acesso ao Hóspede"}
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {completed && reservation && (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/40 p-8 text-center space-y-4 shadow-xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-extrabold text-white">
              {isGuestSelfIdentifyMode
                ? "Reserva Identificada e Liberada com Sucesso!"
                : "Credenciamento Concluído com Sucesso!"}
            </h2>
            <p className="text-sm text-slate-200 max-w-lg mx-auto leading-relaxed">
              Os dados de <strong>{guestName}</strong> para o <strong>Flat {reservation.flatNumber}</strong> já foram registrados para a recepção 24h do Edifício Soho e acabamos de enviar as instruções da estadia para o WhatsApp{" "}
              <strong>{guestPhone}</strong>.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {isGuestSelfIdentifyMode && reservation.code && (
                <Button
                  onClick={() => setLocation(`/minha-reserva/${encodeURIComponent(reservation.code)}`)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Acessar Meu Portal da Reserva
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setCompleted(false)}
                className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/60"
              >
                Revisar ou Atualizar Dados
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
