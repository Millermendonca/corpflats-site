import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo";
import { formatPhoneForWhatsAppCheck, formatSmartPhone } from "@/lib/phone-mask";

interface LobbyGuestSlot {
  index: number;
  name: string;
  namePending: boolean;
  preCheckinCompleted: boolean;
}

interface LobbyReservationSummary {
  id: number | string;
  code: string;
  packageCode?: string | null;
  status: string;
  flatNumber?: string | null;
  checkinDate?: string;
  checkoutDate?: string;
  checkinTime?: string;
  checkoutTime?: string;
  guestCount: number;
  matchedGuestIndex: number;
  guestName: string;
  guestPending: boolean;
  companyOrAgencyName?: string | null;
  b2bLocatorRloc?: string | null;
  b2bReservationNumber?: string | null;
  guests: LobbyGuestSlot[];
}

function formatDateBr(dateStr?: string): string {
  if (!dateStr) return "—";
  const parts = String(dateStr).slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(dateStr);
}

function isPhoneLengthValid(rawPhone: string): boolean {
  const trimmed = String(rawPhone || "").trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  const isIntl = trimmed.startsWith("+") && !digits.startsWith("55");
  if (isIntl) return digits.length >= 8 && digits.length <= 15;
  const localDigits = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  return localDigits.length === 10 || localDigits.length === 11;
}

export default function GuestLobbyCheckin() {
  const [, setLocation] = useLocation();
  const [, paramsChegada] = useRoute("/chegada/:code");
  const [, paramsLocalizar] = useRoute("/localizar-reserva/:code");
  const [, paramsPortaria] = useRoute("/checkin-portaria/:code");
  const [, paramsMeuCheckin] = useRoute("/meu-checkin/:code");

  const initialCode = useMemo(() => {
    const routeParam =
      paramsChegada?.code ||
      paramsLocalizar?.code ||
      paramsPortaria?.code ||
      paramsMeuCheckin?.code ||
      "";
    if (routeParam) return routeParam.trim();
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("code") || sp.get("q") || sp.get("reserva") || "").trim();
    }
    return "";
  }, [
    paramsChegada?.code,
    paramsLocalizar?.code,
    paramsPortaria?.code,
    paramsMeuCheckin?.code,
  ]);

  // Etapa 1: Localização da Reserva
  const [lookupInput, setLookupInput] = useState(initialCode);
  const [lookupTouched, setLookupTouched] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [loadingLookup, setLoadingLookup] = useState(Boolean(initialCode));
  const [candidates, setCandidates] = useState<LobbyReservationSummary[]>([]);
  const [reservation, setReservation] = useState<LobbyReservationSummary | null>(null);

  // Etapa 2: Captura e Validação do WhatsApp + Disparo da Régua
  const [selectedGuestIndex, setSelectedGuestIndex] = useState<number>(1);
  const [phone, setPhone] = useState("");
  const [phoneInteracted, setPhoneInteracted] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [waCheckState, setWaCheckState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [waCheckedQuery, setWaCheckedQuery] = useState("");

  const [guestNameInput, setGuestNameInput] = useState("");
  const [nameInteracted, setNameInteracted] = useState(false);
  const [nameError, setNameError] = useState("");

  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirectingNotice, setRedirectingNotice] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const lookupInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSlot = useMemo<LobbyGuestSlot | null>(() => {
    if (!reservation) return null;
    return (
      reservation.guests.find((g) => g.index === selectedGuestIndex) ||
      reservation.guests[0] ||
      null
    );
  }, [reservation, selectedGuestIndex]);

  const needsGuestNameInput = Boolean(selectedSlot?.namePending);

  const announcePolite = (msg: string) => {
    setLiveAnnouncement("");
    window.setTimeout(() => {
      setLiveAnnouncement(msg);
    }, 150);
  };

  const applySelectedReservation = (resData: LobbyReservationSummary) => {
    setReservation(resData);
    setCandidates([]);
    const initialIdx = resData.matchedGuestIndex || 1;
    setSelectedGuestIndex(initialIdx);
    setPhone("");
    setPhoneInteracted(false);
    setPhoneError("");
    setWaCheckState("idle");
    setWaCheckedQuery("");
    setGuestNameInput("");
    setNameInteracted(false);
    setNameError("");
    setSubmitError("");
    window.setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 80);
  };

  const performLookup = async (rawQuery: string) => {
    const trimmed = String(rawQuery || "").trim();
    if (!trimmed || trimmed.length < 2) {
      const msg = "Informe o código localizador do seu voucher, CPF ou nome completo.";
      setLookupTouched(true);
      setLookupError(msg);
      announcePolite(msg);
      lookupInputRef.current?.focus();
      return;
    }

    setLoadingLookup(true);
    setLookupError("");
    setCandidates([]);
    setReservation(null);

    try {
      const res = await fetch(`/api/pms/guest-lobby-lookup/${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errText =
          data.error ||
          "Reserva não localizada. Verifique o código localizador do voucher, CPF ou seu nome completo.";
        setLookupTouched(true);
        setLookupError(errText);
        announcePolite(errText);
        return;
      }

      if (data.isMultipleMatches && Array.isArray(data.candidates) && data.candidates.length > 1) {
        setCandidates(data.candidates);
        return;
      }

      if (data.reservation) {
        applySelectedReservation(data.reservation);
      } else {
        const errText = "Não foi possível carregar os dados desta reserva.";
        setLookupTouched(true);
        setLookupError(errText);
        announcePolite(errText);
      }
    } catch {
      const errText = "Falha de conexão ao localizar sua reserva. Tente novamente em instantes.";
      setLookupTouched(true);
      setLookupError(errText);
      announcePolite(errText);
    } finally {
      setLoadingLookup(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      void performLookup(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const verifyWhatsAppAccount = async (rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      setWaCheckState("idle");
      return false;
    }
    if (waCheckedQuery === queryPhone && (waCheckState === "valid" || waCheckState === "invalid")) {
      return waCheckState === "valid";
    }
    setWaCheckState("checking");
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json().catch(() => ({}));
      setWaCheckedQuery(queryPhone);
      if (data && data.checked && data.exists === false) {
        setWaCheckState("invalid");
        const msg =
          "Este número não possui conta ativa no WhatsApp. Confira o DDD e os dígitos informados.";
        setPhoneError(msg);
        announcePolite(msg);
        return false;
      }
      setWaCheckState("valid");
      return true;
    } catch {
      setWaCheckState("valid");
      return true;
    }
  };

  const handlePhoneBlur = async () => {
    if (!phone.trim()) return;
    setPhoneInteracted(true);
    if (!isPhoneLengthValid(phone)) {
      const msg = "Informe seu WhatsApp completo com DDD (ex: 22 99999-9999).";
      setPhoneError(msg);
      setWaCheckState("idle");
      announcePolite(msg);
      return;
    }
    setPhoneError("");
    await verifyWhatsAppAccount(phone);
  };

  const handleNameBlur = () => {
    if (!needsGuestNameInput || !guestNameInput.trim()) return;
    setNameInteracted(true);
    if (guestNameInput.trim().split(/\s+/).filter(Boolean).length < 2) {
      const msg = "Informe seu nome e sobrenome completos.";
      setNameError(msg);
      announcePolite(msg);
    } else {
      setNameError("");
    }
  };

  const handleConfirmPhoneAndProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation || submitting) return;

    setSubmitError("");
    setPhoneInteracted(true);

    if (!isPhoneLengthValid(phone)) {
      const msg = "Informe seu WhatsApp completo com DDD (ex: 22 99999-9999).";
      setPhoneError(msg);
      announcePolite(msg);
      phoneInputRef.current?.focus();
      return;
    }

    if (needsGuestNameInput) {
      setNameInteracted(true);
      if (guestNameInput.trim().split(/\s+/).filter(Boolean).length < 2) {
        const msg = "Informe seu nome e sobrenome para identificarmos sua reserva.";
        setNameError(msg);
        announcePolite(msg);
        nameInputRef.current?.focus();
        return;
      }
    }

    setSubmitting(true);
    try {
      const isWaActive = await verifyWhatsAppAccount(phone);
      if (!isWaActive) {
        setPhoneInteracted(true);
        phoneInputRef.current?.focus();
        setSubmitting(false);
        return;
      }

      const res = await fetch(
        `/api/pms/guest-lobby-phone/${encodeURIComponent(reservation.code)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservationId: reservation.id,
            guestIndex: selectedGuestIndex,
            phone: phone.trim(),
            ...(needsGuestNameInput ? { guestName: guestNameInput.trim() } : {}),
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const errMsg =
          data.error ||
          "Não foi possível validar seu WhatsApp. Confira o número informado e tente novamente.";
        if (data.invalidWhatsApp || data.invalidPhoneFormat || data.requesterPhoneConflict || data.duplicateCompanionPhone) {
          setPhoneError(errMsg);
          announcePolite(errMsg);
          phoneInputRef.current?.focus();
        } else if (data.missingGuestName) {
          setNameError(errMsg);
          announcePolite(errMsg);
          nameInputRef.current?.focus();
        } else {
          setSubmitError(errMsg);
          announcePolite(errMsg);
        }
        setSubmitting(false);
        return;
      }

      setRedirectingNotice(true);
      const targetUrl =
        data.redirectUrl ||
        (selectedGuestIndex > 1
          ? `/pre-checkin/${encodeURIComponent(reservation.code)}?guest=${selectedGuestIndex}`
          : `/pre-checkin/${encodeURIComponent(reservation.code)}`);

      window.setTimeout(() => {
        setLocation(targetUrl);
      }, 350);
    } catch {
      const msg = "Falha de conexão ao salvar seu WhatsApp. Tente novamente.";
      setSubmitError(msg);
      announcePolite(msg);
      setSubmitting(false);
    }
  };

  const resetToSearch = () => {
    setReservation(null);
    setCandidates([]);
    setSubmitError("");
    setPhoneError("");
    setNameError("");
    window.setTimeout(() => {
      lookupInputRef.current?.focus();
    }, 60);
  };

  const isStep2 = Boolean(reservation);
  const lookupDescribedBy = lookupTouched && lookupError
    ? "lobby-locator-hint lobby-locator-error"
    : "lobby-locator-hint";
  const phoneDescribedBy = phoneInteracted && phoneError
    ? "lobby-whatsapp-hint lobby-whatsapp-error"
    : "lobby-whatsapp-hint";
  const nameDescribedBy = nameInteracted && nameError
    ? "lobby-name-hint lobby-name-error"
    : "lobby-name-hint";

  const displayedGuestName = useMemo(() => {
    if (!reservation) return "";
    if (selectedSlot && !selectedSlot.namePending && selectedSlot.name) {
      return selectedSlot.name;
    }
    if (!reservation.guestPending && reservation.guestName) {
      return reservation.guestName;
    }
    return "A confirmar no cadastro";
  }, [reservation, selectedSlot]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 sm:py-10 px-4 flex flex-col items-center">
      {/* Região educada única para leitores de tela */}
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      <div className="w-full max-w-xl space-y-5">
        {/* Cabeçalho Institucional CorpFlats Soho Residence */}
        <header className="rounded-2xl bg-gradient-to-br from-[#091E26] via-[#0F3D4C] to-[#091E26] border border-[#C5A059]/40 p-5 sm:p-6 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#E5C98B] bg-[#C5A059]/15 border border-[#C5A059]/35 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Autoatendimento Portaria 24h
              </span>
              <div className="flex items-center gap-3 mt-3">
                <CorpFlatsIcon className="w-10 h-10 shrink-0" />
                <div>
                  <CorpFlatsWordmark className="text-xl text-white block leading-none" />
                  <span className="text-xs text-[#E5C98B] font-semibold">
                    Edifício Soho Residence
                  </span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-200/90 mt-2.5 leading-relaxed">
                Localize sua reserva, receba todas as informações no seu WhatsApp na hora e inicie seu check-in digital.
              </p>
            </div>
          </div>

          {/* Indicador de progresso acessível */}
          <nav aria-label="Etapas do atendimento" className="mt-4 pt-3.5 border-t border-white/10">
            <ol className="grid grid-cols-2 gap-2 text-xs">
              <li
                aria-current={!isStep2 ? "step" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 font-semibold border ${
                  !isStep2
                    ? "bg-white/15 border-[#E5C98B]/60 text-white"
                    : "bg-emerald-500/15 border-emerald-400/35 text-emerald-200"
                }`}
              >
                {isStep2 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-[#C5A059] text-slate-950 font-black flex items-center justify-center text-[11px] shrink-0">
                    1
                  </span>
                )}
                <span className="truncate">Localizar Reserva</span>
              </li>
              <li
                aria-current={isStep2 ? "step" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 font-semibold border ${
                  isStep2
                    ? "bg-white/15 border-[#E5C98B]/60 text-white"
                    : "bg-slate-950/35 border-white/10 text-slate-400"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full font-black flex items-center justify-center text-[11px] shrink-0 ${
                    isStep2 ? "bg-[#C5A059] text-slate-950" : "bg-white/10 text-slate-400"
                  }`}
                >
                  2
                </span>
                <span className="truncate">WhatsApp & Check-in</span>
              </li>
            </ol>
          </nav>
        </header>

        {/* ETAPA 1: BUSCAR A RESERVA */}
        {!reservation && candidates.length === 0 && (
          <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-lg">
            {loadingLookup ? (
              <div
                role="status"
                className="py-10 flex flex-col items-center justify-center gap-3 text-center"
              >
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin" aria-hidden="true" />
                <span className="text-sm text-slate-200 font-medium">
                  Localizando os dados da sua reserva...
                </span>
              </div>
            ) : (
              createElement(
                "search",
                { className: "w-full" },
                <form
                  aria-labelledby="lobby-search-heading"
                  action="/chegada"
                  method="GET"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void performLookup(lookupInput);
                  }}
                  className="space-y-4"
                  noValidate
                >
                  <div className="space-y-1.5">
                    <Label
                      id="lobby-search-heading"
                      htmlFor="lobby-locator"
                      className="text-sm sm:text-base font-bold text-white flex items-center gap-2"
                    >
                      <Search className="w-4 h-4 text-teal-400 shrink-0" aria-hidden="true" />
                      Localize sua Reserva
                    </Label>
                    <p
                      id="lobby-locator-hint"
                      className="text-xs text-slate-300 leading-relaxed"
                    >
                      Digite o <strong>código localizador</strong> do seu voucher (ex:{" "}
                      <code className="text-teal-300">ZYIK2X</code> ou{" "}
                      <code className="text-teal-300">25057926</code>), o código{" "}
                      <code className="text-teal-300">RES-...</code>, seu <strong>CPF</strong> ou seu{" "}
                      <strong>Nome e Sobrenome</strong>:
                    </p>
                    <Input
                      ref={lookupInputRef}
                      id="lobby-locator"
                      name="code"
                      type="text"
                      value={lookupInput}
                      onChange={(e) => {
                        setLookupInput(e.target.value);
                        if (lookupError) setLookupError("");
                      }}
                      onBlur={() => {
                        if (lookupInput.trim() && lookupInput.trim().length < 2) {
                          setLookupTouched(true);
                          setLookupError("Digite pelo menos 2 caracteres para buscar.");
                        }
                      }}
                      placeholder="Localizador, código, CPF ou nome completo"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint="search"
                      autoFocus
                      required
                      aria-invalid={lookupTouched && Boolean(lookupError) ? "true" : "false"}
                      aria-describedby={lookupDescribedBy}
                      className="bg-slate-950 border-slate-700 text-white text-base min-h-12 px-4 rounded-xl focus-visible:ring-teal-500"
                    />
                    {lookupTouched && lookupError && (
                      <div
                        id="lobby-locator-error"
                        className="rounded-xl bg-rose-500/10 border border-rose-500/35 p-3 text-xs text-rose-200 flex items-start gap-2 mt-2"
                      >
                        <AlertTriangle
                          className="w-4 h-4 shrink-0 text-rose-400 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>Erro: {lookupError}</span>
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={loadingLookup}
                    className="w-full min-h-12 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base rounded-xl shadow-md gap-2"
                  >
                    <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Localizar Minha Reserva</span>
                  </Button>
                </form>
              )
            )}
          </section>
        )}

        {/* SELEÇÃO DE ACOMODAÇÃO QUANDO HÁ MÚLTIPLOS FLATS NO PACOTE / LOCALIZADOR */}
        {!reservation && candidates.length > 1 && (
          <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white">
                  Selecione a sua acomodação
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Encontramos mais de um apartamento vinculado a esta reserva. Toque no seu:
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={resetToSearch}
                className="text-xs text-slate-300 hover:text-white min-h-10 px-3"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Voltar
              </Button>
            </div>

            <div className="space-y-2.5">
              {candidates.map((cand) => (
                <button
                  key={`${cand.id}-${cand.code}`}
                  type="button"
                  onClick={() => applySelectedReservation(cand)}
                  className="w-full text-left rounded-xl bg-slate-950 hover:bg-slate-950/80 border border-slate-800 hover:border-teal-500/60 p-4 transition-colors flex items-center justify-between gap-3 min-h-16"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        {cand.flatNumber ? `Flat ${cand.flatNumber}` : cand.code}
                      </span>
                      <span className="text-[11px] font-mono text-teal-300 bg-teal-500/10 border border-teal-500/25 px-2 py-0.5 rounded-md">
                        {cand.code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">
                      Hóspede:{" "}
                      <strong>
                        {cand.guestPending || !cand.guestName
                          ? "A identificar"
                          : cand.guestName}
                      </strong>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateBr(cand.checkinDate)} até {formatDateBr(cand.checkoutDate)}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-teal-400 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ETAPA 2: RESUMO DA RESERVA + TELEFONE WHATSAPP EM PRIMEIRO LUGAR */}
        {reservation && (
          <section className="space-y-4">
            {/* Card com os dados da reserva localizada */}
            <div className="rounded-2xl bg-slate-900 border border-emerald-500/35 p-5 sm:p-6 space-y-4 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    Reserva Localizada
                  </span>
                  <span className="text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                    {reservation.code}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetToSearch}
                  disabled={submitting || redirectingNotice}
                  className="text-xs text-slate-300 hover:text-white h-8 px-2.5 shrink-0"
                >
                  Trocar reserva
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="sm:col-span-2 rounded-xl bg-slate-950/80 border border-slate-800/90 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
                    <User className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                      Hóspede da Reserva
                    </span>
                    <strong className="text-sm sm:text-base text-white font-bold block truncate">
                      {displayedGuestName}
                    </strong>
                    {reservation.companyOrAgencyName && (
                      <span className="text-[11px] text-slate-400 block truncate">
                        {reservation.companyOrAgencyName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-950/80 border border-slate-800/90 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-300 shrink-0">
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                      Check-in
                    </span>
                    <strong className="text-sm text-white font-bold block">
                      {formatDateBr(reservation.checkinDate)}
                    </strong>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />a partir das{" "}
                      {reservation.checkinTime || "14:00"}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-950/80 border border-slate-800/90 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                      Check-out
                    </span>
                    <strong className="text-sm text-white font-bold block">
                      {formatDateBr(reservation.checkoutDate)}
                    </strong>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      até {reservation.checkoutTime || "12:00"}
                    </span>
                  </div>
                </div>

                {reservation.flatNumber && (
                  <div className="sm:col-span-2 rounded-xl bg-slate-950/80 border border-slate-800/90 px-3.5 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-2 font-medium">
                      <Building2 className="w-4 h-4 text-[#E5C98B]" aria-hidden="true" />
                      Acomodação: <strong className="text-white">Flat {reservation.flatNumber}</strong>
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      {reservation.guestCount}{" "}
                      {reservation.guestCount === 1 ? "hóspede" : "hóspedes"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Formulário focado no Telefone / WhatsApp */}
            <form
              aria-labelledby="lobby-phone-heading"
              action={`/api/pms/guest-lobby-phone/${encodeURIComponent(reservation.code)}`}
              method="POST"
              onSubmit={handleConfirmPhoneAndProceed}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-5 shadow-lg"
              noValidate
            >
              <div className="space-y-1">
                <h2
                  id="lobby-phone-heading"
                  className="text-base sm:text-lg font-bold text-white flex items-center gap-2"
                >
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  Informe seu WhatsApp para receber o acesso
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Enviaremos agora mesmo as instruções da estadia, Wi-Fi e guia do flat no seu WhatsApp e abriremos sua ficha de check-in em seguida.
                </p>
              </div>

              {/* Se a reserva tiver 2 ou 3 hóspedes, permite escolher qual hóspede está preenchendo */}
              {reservation.guestCount >= 2 && (
                <fieldset className="space-y-2">
                  <legend className="text-xs font-bold text-slate-200 mb-1.5">
                    Qual hóspede está realizando o atendimento?
                  </legend>
                  <div className="grid grid-cols-1 gap-2">
                    {reservation.guests.map((slot) => {
                      const radioId = `lobby-guest-slot-${slot.index}`;
                      const checked = selectedGuestIndex === slot.index;
                      return (
                        <div
                          key={slot.index}
                          className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                            checked
                              ? "bg-teal-500/10 border-teal-500/50 text-white"
                              : "bg-slate-950 border-slate-800 text-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            id={radioId}
                            name="guestIndex"
                            value={slot.index}
                            checked={checked}
                            onChange={() => {
                              setSelectedGuestIndex(slot.index);
                              setPhoneError("");
                              setNameError("");
                              setSubmitError("");
                            }}
                            className="w-4 h-4 accent-teal-500 shrink-0"
                          />
                          <label
                            htmlFor={radioId}
                            className="text-xs sm:text-sm font-semibold cursor-pointer flex-1"
                          >
                            {slot.index}º Hóspede:{" "}
                            <span className="font-bold text-white">
                              {slot.namePending || !slot.name
                                ? "A identificar"
                                : slot.name}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {/* PRIMEIRO CAMPO OBRIGATÓRIO: TELEFONE / WHATSAPP */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="lobby-whatsapp"
                  className="text-sm font-bold text-white block"
                >
                  Seu WhatsApp com DDD <span aria-hidden="true" className="text-emerald-400">*</span>
                </Label>
                <span
                  id="lobby-whatsapp-hint"
                  className="text-xs text-slate-400 block"
                >
                  Formato: (22) 99999-9999 — se for número internacional, inicie com + e código do país.
                </span>
                <Input
                  ref={phoneInputRef}
                  id="lobby-whatsapp"
                  name="whatsapp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint={needsGuestNameInput ? "next" : "done"}
                  required
                  value={phone}
                  onChange={(e) => {
                    const formatted = formatSmartPhone(e.target.value);
                    setPhone(formatted);
                    if (phoneError) setPhoneError("");
                    if (submitError) setSubmitError("");
                    if (waCheckState !== "idle") setWaCheckState("idle");
                  }}
                  onBlur={() => {
                    void handlePhoneBlur();
                  }}
                  placeholder="(22) 99999-9999"
                  aria-invalid={phoneInteracted && Boolean(phoneError) ? "true" : "false"}
                  aria-describedby={phoneDescribedBy}
                  className={`bg-slate-950 text-white text-base min-h-12 px-4 rounded-xl font-medium tracking-wide ${
                    phoneInteracted && phoneError
                      ? "border-rose-500 focus-visible:ring-rose-500"
                      : waCheckState === "valid"
                        ? "border-emerald-500/70 focus-visible:ring-emerald-500"
                        : "border-slate-700 focus-visible:ring-teal-500"
                  }`}
                />

                {waCheckState === "checking" && !phoneError && (
                  <p role="status" className="text-xs text-sky-300 flex items-center gap-1.5 pt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                    <span>Validando conta no WhatsApp...</span>
                  </p>
                )}

                {waCheckState === "valid" && !phoneError && (
                  <p role="status" className="text-xs text-emerald-300 flex items-center gap-1.5 pt-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>WhatsApp validado com sucesso!</span>
                  </p>
                )}

                {phoneInteracted && phoneError && (
                  <div
                    id="lobby-whatsapp-error"
                    className="rounded-xl bg-rose-500/10 border border-rose-500/35 p-3 text-xs text-rose-200 flex items-start gap-2 mt-1.5"
                  >
                    <AlertTriangle
                      className="w-4 h-4 shrink-0 text-rose-400 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>Erro: {phoneError}</span>
                  </div>
                )}
              </div>

              {/* Exibido apenas se a reserva veio da agência sem o nome deste hóspede */}
              {needsGuestNameInput && (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="lobby-guest-name"
                    className="text-sm font-bold text-white block"
                  >
                    Seu Nome e Sobrenome <span aria-hidden="true" className="text-emerald-400">*</span>
                  </Label>
                  <span
                    id="lobby-name-hint"
                    className="text-xs text-slate-400 block"
                  >
                    Esta reserva ainda não possui o nome deste hóspede cadastrado. Informe conforme seu documento.
                  </span>
                  <Input
                    ref={nameInputRef}
                    id="lobby-guest-name"
                    name="guestName"
                    type="text"
                    autoComplete="name"
                    enterKeyHint="done"
                    required
                    value={guestNameInput}
                    onChange={(e) => {
                      setGuestNameInput(e.target.value);
                      if (nameError) setNameError("");
                      if (submitError) setSubmitError("");
                    }}
                    onBlur={handleNameBlur}
                    placeholder="Ex: João da Silva"
                    aria-invalid={nameInteracted && Boolean(nameError) ? "true" : "false"}
                    aria-describedby={nameDescribedBy}
                    className="bg-slate-950 border-slate-700 text-white text-base min-h-12 px-4 rounded-xl focus-visible:ring-teal-500"
                  />
                  {nameInteracted && nameError && (
                    <div
                      id="lobby-name-error"
                      className="rounded-xl bg-rose-500/10 border border-rose-500/35 p-3 text-xs text-rose-200 flex items-start gap-2 mt-1.5"
                    >
                      <AlertTriangle
                        className="w-4 h-4 shrink-0 text-rose-400 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>Erro: {nameError}</span>
                    </div>
                  )}
                </div>
              )}

              {submitError && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-500/10 border border-rose-500/35 p-3.5 text-xs text-rose-200 flex items-start gap-2"
                >
                  <AlertTriangle
                    className="w-4 h-4 shrink-0 text-rose-400 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>Erro: {submitError}</span>
                </div>
              )}

              {redirectingNotice && (
                <div
                  role="status"
                  className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 p-3.5 text-xs sm:text-sm text-emerald-200 flex items-center gap-2.5 font-medium"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>
                    WhatsApp confirmado! Já estamos enviando as informações da sua estadia e abrindo sua ficha de check-in...
                  </span>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || redirectingNotice}
                className="w-full min-h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg gap-2"
              >
                {submitting || redirectingNotice ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                    <span>
                      {redirectingNotice
                        ? "Abrindo ficha de check-in..."
                        : "Validando e enviando no WhatsApp..."}
                    </span>
                  </>
                ) : (
                  <>
                    <span>Confirmar WhatsApp e Iniciar Check-in</span>
                    <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>
          </section>
        )}

        {/* Rodapé de ajuda rápida */}
        <footer className="pt-1 flex items-center justify-center">
          <a
            href="https://wa.me/5522997124021?text=Ol%C3%A1!%20Estou%20na%20portaria%20do%20Edif%C3%ADcio%20Soho%20e%20preciso%20de%20ajuda%20com%20minha%20reserva."
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-300 transition-colors py-2 px-3"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>Precisa de ajuda? Falar com a Administração no WhatsApp</span>
          </a>
        </footer>
      </div>
    </div>
  );
}
