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
  ExternalLink,
  Copy,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo";
import { formatSmartPhone, formatPassport, formatPhoneForWhatsAppCheck } from "@/lib/phone-mask";

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
  return formatSmartPhone(value);
}

interface BatchDraftItem {
  reservation: any;
  guestCount: number;
  requesterIsGuest1: boolean;
  guestName: string;
  docType: "cpf" | "passport";
  guestDocument: string;
  guestPhone: string;
  guestEmail: string;
  guest2InformLater: boolean;
  guest2Name: string;
  guest2Document: string;
  guest2Phone: string;
  guest2Email: string;
  guest3InformLater: boolean;
  guest3Name: string;
  guest3Document: string;
  guest3Phone: string;
  guest3Email: string;
  whatsappStatus: "idle" | "checking" | "valid" | "invalid";
  guest2WhatsappStatus: "idle" | "checking" | "valid" | "invalid";
  guest3WhatsappStatus: "idle" | "checking" | "valid" | "invalid";
  saving: boolean;
  saved: boolean;
  guest1SavedPartial: boolean;
}

export default function AgencyGuestCredential() {
  const [location, setLocation] = useLocation();
  const [, paramsCred] = useRoute("/credenciamento/:code");
  const [, paramsCredHosp] = useRoute("/credenciamento-hospede/:code");
  const [, paramsIdent] = useRoute("/identificar-reserva/:code");
  const [, paramsCad] = useRoute("/cadastro-hospede/:code");

  const batchCodesParam =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("codes") || "").trim()
      : "";
  const parsedBatchCodes = batchCodesParam
    ? batchCodesParam
        .split(/[,;|]+/)
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  const codeFromUrl =
    paramsCred?.code ||
    paramsCredHosp?.code ||
    paramsIdent?.code ||
    paramsCad?.code ||
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") || "" : "");

  const isPkgUrlCode = /^PKG-[A-Z0-9]{4,12}$/i.test(String(codeFromUrl || "").trim());
  const isBatchMode = parsedBatchCodes.length >= 2 || isPkgUrlCode;

  const isGuestSelfIdentifyMode =
    !isBatchMode &&
    (location.startsWith("/identificar") ||
      location.startsWith("/cadastro-hospede") ||
      !codeFromUrl);

  const { toast } = useToast();

  const [lookupCode, setLookupCode] = useState(codeFromUrl);
  const [loading, setLoading] = useState(Boolean(codeFromUrl || isBatchMode));
  const [submitting, setSubmitting] = useState(false);
  const [reservation, setReservation] = useState<any>(null);
  const [batchItems, setBatchItems] = useState<BatchDraftItem[]>([]);
  const [submittingBatchAll, setSubmittingBatchAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [completed, setCompleted] = useState(false);

  const [guestCountSingle, setGuestCountSingle] = useState<number>(1);
  const [requesterIsGuest1Single, setRequesterIsGuest1Single] = useState<boolean>(false);
  const [guestName, setGuestName] = useState("");
  const [docType, setDocType] = useState<"cpf" | "passport">("cpf");
  const [guestDocument, setGuestDocument] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestSecondaryPhone, setGuestSecondaryPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guest2InformLater, setGuest2InformLater] = useState<boolean>(false);
  const [guest2Name, setGuest2Name] = useState("");
  const [guest2Document, setGuest2Document] = useState("");
  const [guest2Phone, setGuest2Phone] = useState("");
  const [guest2Email, setGuest2Email] = useState("");
  const [guest3InformLater, setGuest3InformLater] = useState<boolean>(false);
  const [guest3Name, setGuest3Name] = useState("");
  const [guest3Document, setGuest3Document] = useState("");
  const [guest3Phone, setGuest3Phone] = useState("");
  const [guest3Email, setGuest3Email] = useState("");
  const [docPhotoBase64, setDocPhotoBase64] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState("");
  const [docIsPdf, setDocIsPdf] = useState(false);
  const [notes, setNotes] = useState("");

  const [whatsappStatus, setWhatsappStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [whatsappCheckedPhone, setWhatsappCheckedPhone] = useState("");
  const [guest2WhatsappStatus, setGuest2WhatsappStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [guest2WhatsappCheckedPhone, setGuest2WhatsappCheckedPhone] = useState("");
  const [guest3WhatsappStatus, setGuest3WhatsappStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [guest3WhatsappCheckedPhone, setGuest3WhatsappCheckedPhone] = useState("");

  const cleanDocDigits = guestDocument.replace(/\D/g, "");
  const cpfIsComplete = docType === "cpf" && cleanDocDigits.length === 11;
  const cpfIsValid = cpfIsComplete && isValidBrazilianCpf(cleanDocDigits);
  const cleanPassportAlnum = guestDocument.replace(/[^A-Za-z0-9]/g, "");
  const passportIsComplete = docType === "passport" && cleanPassportAlnum.length >= 5;

  const extractGuestDocFromRequester = (rawReqDoc?: string): { docType: "cpf" | "passport"; formatted: string } | null => {
    const raw = String(rawReqDoc || "").trim();
    if (!raw) return null;
    if (/[a-zA-Z]/.test(raw)) {
      return { docType: "passport", formatted: formatPassport(raw) };
    }
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11) {
      return { docType: "cpf", formatted: formatCpfMask(digits) };
    }
    return null;
  };

  const mapReservationToBatchDraft = (r: any): BatchDraftItem => {
    const loadedDoc = String(r.guestDocument || "");
    const isLoadedPassport =
      String(r.guestDocType || "").toLowerCase().includes("pass") ||
      /[a-zA-Z]/.test(loadedDoc);
    const gCount = Math.max(1, Number(r.guestCount) || 1);
    const g2 = r.guest2 || (Array.isArray(r.guests) ? r.guests[1] : null) || {};
    const g3 = r.guest3 || (Array.isArray(r.guests) ? r.guests[2] : null) || {};
    const g2Missing = gCount >= 2 && (Boolean(r.guest2InformLater || g2.informLater) || !String(g2.name || "").trim());
    const g3Missing = gCount >= 3 && (Boolean(r.guest3InformLater || g3.informLater) || !String(g3.name || "").trim());
    const hasGuest1Saved = Boolean(
      !r.guestPending &&
      !r.informGuestsLater &&
      String(r.guestName || "").trim().length >= 3 &&
      String(r.guestPhone || "").replace(/\D/g, "").length >= 8
    );
    const isFullySaved = Boolean(
      !g2Missing &&
      !g3Missing &&
      (r.isCredentialComplete || (r.credentialCompletedAt && hasGuest1Saved))
    );
    const isPartialGuest1Only = !isFullySaved && hasGuest1Saved && (g2Missing || g3Missing);

    return {
      reservation: r,
      guestCount: gCount,
      requesterIsGuest1: Boolean(r.requesterIsGuest1),
      guestName: r.guestName || "",
      docType: isLoadedPassport ? "passport" : "cpf",
      guestDocument: loadedDoc
        ? isLoadedPassport
          ? formatPassport(loadedDoc)
          : formatCpfMask(loadedDoc)
        : "",
      guestPhone: r.guestPhone ? formatPhoneMask(r.guestPhone) : "",
      guestEmail: r.guestEmail || "",
      guest2InformLater: Boolean((r.guest2InformLater || g2.informLater) && !g2.name),
      guest2Name: g2.name || "",
      guest2Document: (g2.document || g2.cpf) ? formatCpfMask(g2.document || g2.cpf) : "",
      guest2Phone: g2.phone ? formatPhoneMask(g2.phone) : "",
      guest2Email: g2.email || "",
      guest3InformLater: Boolean((r.guest3InformLater || g3.informLater) && !g3.name),
      guest3Name: g3.name || "",
      guest3Document: (g3.document || g3.cpf) ? formatCpfMask(g3.document || g3.cpf) : "",
      guest3Phone: g3.phone ? formatPhoneMask(g3.phone) : "",
      guest3Email: g3.email || "",
      whatsappStatus: isFullySaved || isPartialGuest1Only ? "valid" : "idle",
      guest2WhatsappStatus: isFullySaved && gCount >= 2 ? "valid" : "idle",
      guest3WhatsappStatus: isFullySaved && gCount >= 3 ? "valid" : "idle",
      saving: false,
      saved: isFullySaved,
      guest1SavedPartial: isPartialGuest1Only
    };
  };

  const verifyWhatsAppNumber = async (rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      setWhatsappStatus("idle");
      return false;
    }
    if (whatsappCheckedPhone === queryPhone && (whatsappStatus === "valid" || whatsappStatus === "invalid")) {
      return whatsappStatus === "valid";
    }
    setWhatsappStatus("checking");
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json();
      setWhatsappCheckedPhone(queryPhone);
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

  const verifyGuest2WhatsAppNumber = async (rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      setGuest2WhatsappStatus("idle");
      return false;
    }
    if (guest2WhatsappCheckedPhone === queryPhone && (guest2WhatsappStatus === "valid" || guest2WhatsappStatus === "invalid")) {
      return guest2WhatsappStatus === "valid";
    }
    setGuest2WhatsappStatus("checking");
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json();
      setGuest2WhatsappCheckedPhone(queryPhone);
      if (data && data.checked && data.exists === false) {
        setGuest2WhatsappStatus("invalid");
        return false;
      }
      setGuest2WhatsappStatus("valid");
      return true;
    } catch {
      setGuest2WhatsappStatus("valid");
      return true;
    }
  };

  const verifyGuest3WhatsAppNumber = async (rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      setGuest3WhatsappStatus("idle");
      return false;
    }
    if (guest3WhatsappCheckedPhone === queryPhone && (guest3WhatsappStatus === "valid" || guest3WhatsappStatus === "invalid")) {
      return guest3WhatsappStatus === "valid";
    }
    setGuest3WhatsappStatus("checking");
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json();
      setGuest3WhatsappCheckedPhone(queryPhone);
      if (data && data.checked && data.exists === false) {
        setGuest3WhatsappStatus("invalid");
        return false;
      }
      setGuest3WhatsappStatus("valid");
      return true;
    } catch {
      setGuest3WhatsappStatus("valid");
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
            "Reserva não localizada. Verifique o código localizador (ex: PKG-..., RLOC de 6 caracteres, número da reserva B2B ou código RES-...)."
        );
        setReservation(null);
      } else if (data.isPackageBatch && Array.isArray(data.reservations) && data.reservations.length > 0) {
        setBatchItems(data.reservations.map(mapReservationToBatchDraft));
        setReservation(null);
      } else {
        const r = data.reservation;
        setReservation(r);
        setGuestCountSingle(Math.max(1, Number(r.guestCount) || 1));
        setRequesterIsGuest1Single(Boolean(r.requesterIsGuest1));
        setGuestName(r.guestName || "");
        const loadedDoc = String(r.guestDocument || "");
        const isLoadedPassport =
          String(r.guestDocType || "").toLowerCase().includes("pass") ||
          /[a-zA-Z]/.test(loadedDoc);
        setDocType(isLoadedPassport ? "passport" : "cpf");
        setGuestDocument(
          loadedDoc
            ? isLoadedPassport
              ? formatPassport(loadedDoc)
              : formatCpfMask(loadedDoc)
            : ""
        );
        setGuestPhone(r.guestPhone ? formatPhoneMask(r.guestPhone) : "");
        setGuestSecondaryPhone(r.guestSecondaryPhone ? formatPhoneMask(r.guestSecondaryPhone) : "");
        setGuestEmail(r.guestEmail || "");
        const g2 = r.guest2 || (Array.isArray(r.guests) ? r.guests[1] : null) || {};
        setGuest2InformLater(Boolean((r.guest2InformLater || g2.informLater) && !g2.name));
        setGuest2Name(g2.name || "");
        setGuest2Document((g2.document || g2.cpf) ? formatCpfMask(g2.document || g2.cpf) : "");
        setGuest2Phone(g2.phone ? formatPhoneMask(g2.phone) : "");
        setGuest2Email(g2.email || "");
        const g3 = r.guest3 || (Array.isArray(r.guests) ? r.guests[2] : null) || {};
        setGuest3InformLater(Boolean((r.guest3InformLater || g3.informLater) && !g3.name));
        setGuest3Name(g3.name || "");
        setGuest3Document((g3.document || g3.cpf) ? formatCpfMask(g3.document || g3.cpf) : "");
        setGuest3Phone(g3.phone ? formatPhoneMask(g3.phone) : "");
        setGuest3Email(g3.email || "");
        setWhatsappStatus("idle");
        setWhatsappCheckedPhone("");
        setGuest2WhatsappStatus("idle");
        setGuest2WhatsappCheckedPhone("");
        setGuest3WhatsappStatus("idle");
        setGuest3WhatsappCheckedPhone("");
        if (r.guestPhone && String(r.guestPhone).replace(/\D/g, "").length >= 8) {
          verifyWhatsAppNumber(r.guestPhone);
        }
      }
    } catch {
      setErrorMsg("Erro de conexão ao consultar a reserva. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchReservations = async (codes: string[]) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/pms/agency-guest-credential-batch?codes=${encodeURIComponent(codes.join(","))}`
      );
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.reservations) || data.reservations.length === 0) {
        setErrorMsg(data.error || "Não foi possível carregar as reservas do lote.");
        setBatchItems([]);
      } else {
        setBatchItems(data.reservations.map(mapReservationToBatchDraft));
      }
    } catch {
      setErrorMsg("Erro de conexão ao carregar o lote de reservas. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const updateBatchItem = (idx: number, patch: Partial<BatchDraftItem>) => {
    setBatchItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const toggleBatchRequesterIsGuest1 = (idx: number, checked: boolean) => {
    const item = batchItems[idx];
    if (!item) return;
    const r = item.reservation || {};
    if (checked) {
      const parsedReqDoc = extractGuestDocFromRequester(r.requesterDocument);
      const nextPhone = r.requesterPhone ? formatPhoneMask(r.requesterPhone) : item.guestPhone;
      updateBatchItem(idx, {
        requesterIsGuest1: true,
        guestName: r.requesterName || item.guestName,
        guestPhone: nextPhone,
        guestEmail: r.requesterEmail || item.guestEmail,
        ...(parsedReqDoc ? { docType: parsedReqDoc.docType, guestDocument: parsedReqDoc.formatted } : {}),
        whatsappStatus: "idle",
        saved: false,
        guest1SavedPartial: false
      });
      if (nextPhone.replace(/\D/g, "").length >= 8) {
        checkBatchItemWhatsApp(idx, nextPhone);
      }
    } else {
      const matchesRequester =
        r.requesterName && item.guestName.trim().toLowerCase() === String(r.requesterName).trim().toLowerCase();
      updateBatchItem(idx, {
        requesterIsGuest1: false,
        ...(matchesRequester
          ? { guestName: "", guestPhone: "", guestEmail: "", guestDocument: "", whatsappStatus: "idle" as const }
          : {}),
        saved: false,
        guest1SavedPartial: false
      });
    }
  };

  const toggleSingleRequesterIsGuest1 = (checked: boolean) => {
    setRequesterIsGuest1Single(checked);
    if (!reservation) return;
    if (checked) {
      if (reservation.requesterName) setGuestName(reservation.requesterName);
      if (reservation.requesterPhone) {
        const masked = formatPhoneMask(reservation.requesterPhone);
        setGuestPhone(masked);
        setWhatsappStatus("idle");
        if (masked.replace(/\D/g, "").length >= 8) {
          verifyWhatsAppNumber(masked);
        }
      }
      if (reservation.requesterEmail) setGuestEmail(reservation.requesterEmail);
      const parsedDoc = extractGuestDocFromRequester(reservation.requesterDocument);
      if (parsedDoc) {
        setDocType(parsedDoc.docType);
        setGuestDocument(parsedDoc.formatted);
      }
    } else if (
      reservation.requesterName &&
      guestName.trim().toLowerCase() === String(reservation.requesterName).trim().toLowerCase()
    ) {
      setGuestName("");
      setGuestPhone("");
      setGuestEmail("");
      setGuestDocument("");
      setWhatsappStatus("idle");
    }
  };

  const checkBatchItemWhatsApp = async (idx: number, rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      updateBatchItem(idx, { whatsappStatus: "idle" });
      return false;
    }
    updateBatchItem(idx, { whatsappStatus: "checking" });
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json();
      if (data && data.checked && data.exists === false) {
        updateBatchItem(idx, { whatsappStatus: "invalid" });
        return false;
      }
      updateBatchItem(idx, { whatsappStatus: "valid" });
      return true;
    } catch {
      updateBatchItem(idx, { whatsappStatus: "valid" });
      return true;
    }
  };

  const checkBatchGuest2WhatsApp = async (idx: number, rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      updateBatchItem(idx, { guest2WhatsappStatus: "idle" });
      return false;
    }
    updateBatchItem(idx, { guest2WhatsappStatus: "checking" });
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json();
      if (data && data.checked && data.exists === false) {
        updateBatchItem(idx, { guest2WhatsappStatus: "invalid" });
        return false;
      }
      updateBatchItem(idx, { guest2WhatsappStatus: "valid" });
      return true;
    } catch {
      updateBatchItem(idx, { guest2WhatsappStatus: "valid" });
      return true;
    }
  };

  const checkBatchGuest3WhatsApp = async (idx: number, rawPhone: string): Promise<boolean> => {
    const queryPhone = formatPhoneForWhatsAppCheck(rawPhone);
    if (!queryPhone) {
      updateBatchItem(idx, { guest3WhatsappStatus: "idle" });
      return false;
    }
    updateBatchItem(idx, { guest3WhatsappStatus: "checking" });
    try {
      const res = await fetch(`/api/whatsapp/phone-exists/${encodeURIComponent(queryPhone)}`);
      const data = await res.json();
      if (data && data.checked && data.exists === false) {
        updateBatchItem(idx, { guest3WhatsappStatus: "invalid" });
        return false;
      }
      updateBatchItem(idx, { guest3WhatsappStatus: "valid" });
      return true;
    } catch {
      updateBatchItem(idx, { guest3WhatsappStatus: "valid" });
      return true;
    }
  };

  const saveSingleBatchCard = async (idx: number, silentSuccess = false): Promise<boolean> => {
    const item = batchItems[idx];
    if (!item) return false;
    const refLabel = item.reservation.b2bReservationNumber
      ? `#${item.reservation.b2bReservationNumber}`
      : item.reservation.code;
    const nameParts = item.guestName.trim().split(/\s+/).filter(Boolean);
    const trimmedPhone = item.guestPhone.trim();
    const cleanPhoneDigits = trimmedPhone.replace(/\D/g, "");
    const isIntlPhone = trimmedPhone.startsWith("+") && !cleanPhoneDigits.startsWith("55");
    const finalPhonePayload = isIntlPhone ? `+${cleanPhoneDigits}` : cleanPhoneDigits;
    const hasDocInput = item.guestDocument.trim().length > 0;
    const cleanDoc = item.guestDocument.replace(/\D/g, "");
    const normalizedPassport = formatPassport(item.guestDocument);
    const cleanEmail = item.guestEmail.trim();

    if (nameParts.length < 2) {
      toast({
        title: `Nome incompleto (${refLabel})`,
        description: "Informe o nome e sobrenome do Hóspede 1.",
        variant: "destructive"
      });
      return false;
    }
    if (cleanPhoneDigits.length < (isIntlPhone ? 8 : 10)) {
      toast({
        title: `WhatsApp obrigatório (${refLabel})`,
        description: "Informe o telefone / WhatsApp do Hóspede 1 com DDD.",
        variant: "destructive"
      });
      return false;
    }
    if (hasDocInput) {
      if (item.docType === "passport" && normalizedPassport.replace(/[^A-Z0-9]/g, "").length < 5) {
        toast({
          title: `Passaporte inválido (${refLabel})`,
          description: "Corrija o passaporte ou deixe em branco.",
          variant: "destructive"
        });
        return false;
      }
      if (item.docType === "cpf" && !isValidBrazilianCpf(cleanDoc)) {
        toast({
          title: `CPF inválido (${refLabel})`,
          description: "Corrija os 11 dígitos do CPF ou deixe em branco.",
          variant: "destructive"
        });
        return false;
      }
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast({
        title: `E-mail inválido (${refLabel})`,
        description: "Corrija o e-mail ou deixe em branco.",
        variant: "destructive"
      });
      return false;
    }

    let finalGuest2PhonePayload = "";
    if (item.guestCount >= 2 && !item.guest2InformLater) {
      const g2Parts = item.guest2Name.trim().split(/\s+/).filter(Boolean);
      if (g2Parts.length < 2) {
        toast({
          title: `Nome do Hóspede 2 obrigatório (${refLabel})`,
          description: "Informe nome e sobrenome do Hóspede 2, ou marque 'Informar Hóspede 2 depois'.",
          variant: "destructive"
        });
        return false;
      }
      const trimmedG2Phone = item.guest2Phone.trim();
      const cleanG2Digits = trimmedG2Phone.replace(/\D/g, "");
      const isIntlG2 = trimmedG2Phone.startsWith("+") && !cleanG2Digits.startsWith("55");
      if (cleanG2Digits.length < (isIntlG2 ? 8 : 10)) {
        toast({
          title: `WhatsApp do Hóspede 2 obrigatório (${refLabel})`,
          description: "Informe um WhatsApp válido com DDD para o Hóspede 2, ou marque 'Informar Hóspede 2 depois'.",
          variant: "destructive"
        });
        return false;
      }
      finalGuest2PhonePayload = isIntlG2 ? `+${cleanG2Digits}` : cleanG2Digits;
      const g2DocDigits = item.guest2Document.replace(/\D/g, "");
      if (g2DocDigits.length > 0 && !isValidBrazilianCpf(g2DocDigits)) {
        toast({
          title: `CPF do Hóspede 2 inválido (${refLabel})`,
          description: "Corrija os 11 dígitos do CPF do Hóspede 2 ou deixe em branco.",
          variant: "destructive"
        });
        return false;
      }
    }

    let finalGuest3PhonePayload = "";
    if (item.guestCount >= 3 && !item.guest3InformLater) {
      const g3Parts = item.guest3Name.trim().split(/\s+/).filter(Boolean);
      if (g3Parts.length < 2) {
        toast({
          title: `Nome do Hóspede 3 obrigatório (${refLabel})`,
          description: "Informe nome e sobrenome do Hóspede 3, ou marque 'Informar Hóspede 3 depois'.",
          variant: "destructive"
        });
        return false;
      }
      const trimmedG3Phone = item.guest3Phone.trim();
      const cleanG3Digits = trimmedG3Phone.replace(/\D/g, "");
      const isIntlG3 = trimmedG3Phone.startsWith("+") && !cleanG3Digits.startsWith("55");
      if (cleanG3Digits.length < (isIntlG3 ? 8 : 10)) {
        toast({
          title: `WhatsApp do Hóspede 3 obrigatório (${refLabel})`,
          description: "Informe um WhatsApp válido com DDD para o Hóspede 3, ou marque 'Informar Hóspede 3 depois'.",
          variant: "destructive"
        });
        return false;
      }
      finalGuest3PhonePayload = isIntlG3 ? `+${cleanG3Digits}` : cleanG3Digits;
      const g3DocDigits = item.guest3Document.replace(/\D/g, "");
      if (g3DocDigits.length > 0 && !isValidBrazilianCpf(g3DocDigits)) {
        toast({
          title: `CPF do Hóspede 3 inválido (${refLabel})`,
          description: "Corrija os 11 dígitos do CPF do Hóspede 3 ou deixe em branco.",
          variant: "destructive"
        });
        return false;
      }
    }

    updateBatchItem(idx, { saving: true });
    try {
      const hasWa = await checkBatchItemWhatsApp(idx, finalPhonePayload);
      if (!hasWa) {
        toast({
          title: `Sem WhatsApp ativo (${refLabel})`,
          description: "O telefone do Hóspede 1 não possui conta ativa no WhatsApp.",
          variant: "destructive"
        });
        updateBatchItem(idx, { saving: false });
        return false;
      }

      if (item.guestCount >= 2 && !item.guest2InformLater && finalGuest2PhonePayload) {
        const hasWaG2 = await checkBatchGuest2WhatsApp(idx, finalGuest2PhonePayload);
        if (!hasWaG2) {
          toast({
            title: `Hóspede 2 sem WhatsApp ativo (${refLabel})`,
            description: "O telefone informado para o Hóspede 2 não possui conta ativa no WhatsApp.",
            variant: "destructive"
          });
          updateBatchItem(idx, { saving: false });
          return false;
        }
      }

      if (item.guestCount >= 3 && !item.guest3InformLater && finalGuest3PhonePayload) {
        const hasWaG3 = await checkBatchGuest3WhatsApp(idx, finalGuest3PhonePayload);
        if (!hasWaG3) {
          toast({
            title: `Hóspede 3 sem WhatsApp ativo (${refLabel})`,
            description: "O telefone informado para o Hóspede 3 não possui conta ativa no WhatsApp.",
            variant: "destructive"
          });
          updateBatchItem(idx, { saving: false });
          return false;
        }
      }

      const isFlat1EligibleForRequester =
        idx === 0 && (!item.reservation.packageIndex || Number(item.reservation.packageIndex) === 1);

      const g3Active = item.guestCount >= 3 && !item.guest3InformLater && Boolean(item.guest3Name.trim());
      const g3DocClean = item.guest3Document.replace(/\D/g, "");

      const res = await fetch(
        `/api/pms/agency-guest-credential/${encodeURIComponent(item.reservation.code)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestCount: item.guestCount,
            ...(isFlat1EligibleForRequester ? { requesterIsGuest1: Boolean(item.requesterIsGuest1) } : {}),
            guestName: item.guestName.trim(),
            guestDocument: hasDocInput ? (item.docType === "passport" ? normalizedPassport : cleanDoc) : "",
            docType: hasDocInput ? (item.docType === "passport" ? "Passaporte" : "CPF") : "",
            guestPhone: finalPhonePayload,
            guestEmail: cleanEmail,
            guest2InformLater: item.guestCount >= 2 ? item.guest2InformLater : false,
            guest2: item.guestCount >= 2 && !item.guest2InformLater && item.guest2Name.trim()
              ? {
                  name: item.guest2Name.trim(),
                  document: item.guest2Document.replace(/\D/g, ""),
                  phone: finalGuest2PhonePayload,
                  email: item.guest2Email.trim()
                }
              : null,
            guest3InformLater: item.guestCount >= 3 ? item.guest3InformLater : false,
            guest3: g3Active
              ? {
                  name: item.guest3Name.trim(),
                  document: g3DocClean,
                  phone: finalGuest3PhonePayload,
                  email: item.guest3Email.trim()
                }
              : null,
            guest3Name: g3Active ? item.guest3Name.trim() : "",
            guest3Document: g3Active ? g3DocClean : "",
            guest3Phone: g3Active ? finalGuest3PhonePayload : "",
            guest3Email: g3Active ? item.guest3Email.trim() : "",
            sourceMode: "agency"
          })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.invalidWhatsApp) updateBatchItem(idx, { whatsappStatus: "invalid" });
        toast({
          title: `Atenção (${refLabel})`,
          description: data.error || "Não foi possível salvar esta reserva.",
          variant: "destructive"
        });
        updateBatchItem(idx, { saving: false });
        return false;
      }

      const missingGuest2AfterSave = item.guestCount >= 2 && item.guest2InformLater;
      const missingGuest3AfterSave = item.guestCount >= 3 && item.guest3InformLater;
      const hasMissingCompanion = missingGuest2AfterSave || missingGuest3AfterSave;
      updateBatchItem(idx, {
        saving: false,
        saved: !hasMissingCompanion,
        guest1SavedPartial: hasMissingCompanion,
        whatsappStatus: "valid",
        ...(item.guestCount >= 2 && !item.guest2InformLater ? { guest2WhatsappStatus: "valid" as const } : {}),
        ...(item.guestCount >= 3 && !item.guest3InformLater ? { guest3WhatsappStatus: "valid" as const } : {})
      });
      if (!silentSuccess) {
        toast({
          title: hasMissingCompanion
            ? `Hóspede 1 salvo (${refLabel}) • Falta Acompanhante`
            : `Reserva ${refLabel} credenciada!`,
          description: hasMissingCompanion
            ? "Os dados informados foram salvos. Lembre-se de cadastrar os demais hóspedes neste mesmo link antes do check-in."
            : "Lembretes encerrados para esta reserva e Pré-Check-in enviado ao WhatsApp do(s) hóspede(s)."
        });
      }
      return true;
    } catch {
      updateBatchItem(idx, { saving: false });
      toast({
        title: `Erro de conexão (${refLabel})`,
        description: "Tente novamente em instantes.",
        variant: "destructive"
      });
      return false;
    }
  };

  const handleSaveAllFilledBatch = async () => {
    const candidateIndices = batchItems
      .map((it, idx) => ({ it, idx }))
      .filter(
        ({ it }) =>
          !it.saved &&
          (!it.guest1SavedPartial || !it.guest2InformLater || !it.guest3InformLater) &&
          it.guestName.trim().length > 0 &&
          it.guestPhone.replace(/\D/g, "").length >= 8
      )
      .map(({ idx }) => idx);

    if (candidateIndices.length === 0) {
      toast({
        title: "Nenhuma reserva pendente preenchida",
        description: "Preencha Nome Completo e WhatsApp em pelo menos uma reserva pendente para confirmar.",
        variant: "destructive"
      });
      return;
    }

    setSubmittingBatchAll(true);
    let savedCount = 0;
    try {
      for (const idx of candidateIndices) {
        const ok = await saveSingleBatchCard(idx, true);
        if (ok) savedCount++;
      }
      if (savedCount > 0) {
        toast({
          title: `${savedCount} ${savedCount === 1 ? "reserva salva" : "reservas salvas"} com sucesso!`,
          description: "Os hóspedes cadastrados já receberam a confirmação e o link de Pré-Check-in no WhatsApp."
        });
      }
    } finally {
      setSubmittingBatchAll(false);
    }
  };

  useEffect(() => {
    if (parsedBatchCodes.length >= 2) {
      fetchBatchReservations(parsedBatchCodes);
    } else if (isPkgUrlCode && codeFromUrl) {
      fetchBatchReservations([codeFromUrl]);
    } else if (codeFromUrl) {
      fetchReservation(codeFromUrl);
    }
  }, [codeFromUrl, batchCodesParam]);

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
    const normalizedPassport = formatPassport(guestDocument);
    const trimmedPhone = guestPhone.trim();
    const cleanPhoneDigits = trimmedPhone.replace(/\D/g, "");
    const isIntlPhone = trimmedPhone.startsWith("+") && !cleanPhoneDigits.startsWith("55");
    const finalPhonePayload = isIntlPhone ? `+${cleanPhoneDigits}` : cleanPhoneDigits;
    const trimmedSecPhone = guestSecondaryPhone.trim();
    const cleanSecDigits = trimmedSecPhone.replace(/\D/g, "");
    const isIntlSec = trimmedSecPhone.startsWith("+") && !cleanSecDigits.startsWith("55");
    const finalSecPhonePayload = cleanSecDigits ? (isIntlSec ? `+${cleanSecDigits}` : cleanSecDigits) : "";
    const cleanEmail = guestEmail.trim();

    if (nameParts.length < 2) {
      toast({
        title: "Nome Completo obrigatório",
        description: "Informe o nome completo (nome e sobrenome) do hóspede conforme o documento oficial.",
        variant: "destructive"
      });
      return;
    }
    const hasDocInput = guestDocument.trim().length > 0;
    if (hasDocInput) {
      if (docType === "passport") {
        if (normalizedPassport.replace(/[^A-Z0-9]/g, "").length < 5) {
          toast({
            title: "Passaporte inválido",
            description: "Informe um número de Passaporte válido (mínimo de 5 caracteres) ou deixe em branco.",
            variant: "destructive"
          });
          return;
        }
      } else if (!isValidBrazilianCpf(cleanDoc)) {
        toast({
          title: "CPF inválido",
          description: "O CPF informado não é válido. Verifique os 11 dígitos ou deixe em branco para o próprio hóspede preencher no Pré-Check-in.",
          variant: "destructive"
        });
        return;
      }
    }
    if (cleanPhoneDigits.length < (isIntlPhone ? 8 : 10)) {
      toast({
        title: "Telefone / WhatsApp obrigatório",
        description: "Informe o telefone / WhatsApp com DDD (ou DDI internacional com +) para receber a confirmação e o Pré-Check-in.",
        variant: "destructive"
      });
      return;
    }

    let finalSingleG2PhonePayload = "";
    if (guestCountSingle >= 2 && !guest2InformLater) {
      const g2Parts = guest2Name.trim().split(/\s+/).filter(Boolean);
      if (g2Parts.length < 2) {
        toast({
          title: "Nome Completo do Hóspede 2 obrigatório",
          description: "Informe o nome e sobrenome do Hóspede 2, ou marque 'Informar Hóspede 2 depois'.",
          variant: "destructive"
        });
        return;
      }
      const trimmedG2Phone = guest2Phone.trim();
      const cleanG2Digits = trimmedG2Phone.replace(/\D/g, "");
      const isIntlG2 = trimmedG2Phone.startsWith("+") && !cleanG2Digits.startsWith("55");
      if (cleanG2Digits.length < (isIntlG2 ? 8 : 10)) {
        toast({
          title: "WhatsApp do Hóspede 2 obrigatório",
          description: "Informe um WhatsApp válido com DDD para o Hóspede 2, ou marque 'Informar Hóspede 2 depois'.",
          variant: "destructive"
        });
        return;
      }
      finalSingleG2PhonePayload = isIntlG2 ? `+${cleanG2Digits}` : cleanG2Digits;
      const g2DocDigits = guest2Document.replace(/\D/g, "");
      if (g2DocDigits.length > 0 && !isValidBrazilianCpf(g2DocDigits)) {
        toast({
          title: "CPF do Hóspede 2 inválido",
          description: "Corrija os 11 dígitos do CPF do Hóspede 2 ou deixe em branco.",
          variant: "destructive"
        });
        return;
      }
    }

    let finalSingleG3PhonePayload = "";
    if (guestCountSingle >= 3 && !guest3InformLater) {
      const g3Parts = guest3Name.trim().split(/\s+/).filter(Boolean);
      if (g3Parts.length < 2) {
        toast({
          title: "Nome Completo do Hóspede 3 obrigatório",
          description: "Informe o nome e sobrenome do Hóspede 3, ou marque 'Informar Hóspede 3 depois'.",
          variant: "destructive"
        });
        return;
      }
      const trimmedG3Phone = guest3Phone.trim();
      const cleanG3Digits = trimmedG3Phone.replace(/\D/g, "");
      const isIntlG3 = trimmedG3Phone.startsWith("+") && !cleanG3Digits.startsWith("55");
      if (cleanG3Digits.length < (isIntlG3 ? 8 : 10)) {
        toast({
          title: "WhatsApp do Hóspede 3 obrigatório",
          description: "Informe um WhatsApp válido com DDD para o Hóspede 3, ou marque 'Informar Hóspede 3 depois'.",
          variant: "destructive"
        });
        return;
      }
      finalSingleG3PhonePayload = isIntlG3 ? `+${cleanG3Digits}` : cleanG3Digits;
      const g3DocDigits = guest3Document.replace(/\D/g, "");
      if (g3DocDigits.length > 0 && !isValidBrazilianCpf(g3DocDigits)) {
        toast({
          title: "CPF do Hóspede 3 inválido",
          description: "Corrija os 11 dígitos do CPF do Hóspede 3 ou deixe em branco.",
          variant: "destructive"
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const hasWa = await verifyWhatsAppNumber(finalPhonePayload);
      if (!hasWa) {
        toast({
          title: "Número sem WhatsApp ativo",
          description: "O telefone informado não possui conta ativa no WhatsApp. Informe um número que tenha WhatsApp.",
          variant: "destructive"
        });
        setSubmitting(false);
        return;
      }

      if (guestCountSingle >= 2 && !guest2InformLater && finalSingleG2PhonePayload) {
        const hasWaG2 = await verifyGuest2WhatsAppNumber(finalSingleG2PhonePayload);
        if (!hasWaG2) {
          toast({
            title: "Hóspede 2 sem WhatsApp ativo",
            description: "O telefone informado para o Hóspede 2 não possui conta ativa no WhatsApp.",
            variant: "destructive"
          });
          setSubmitting(false);
          return;
        }
      }

      if (guestCountSingle >= 3 && !guest3InformLater && finalSingleG3PhonePayload) {
        const hasWaG3 = await verifyGuest3WhatsAppNumber(finalSingleG3PhonePayload);
        if (!hasWaG3) {
          toast({
            title: "Hóspede 3 sem WhatsApp ativo",
            description: "O telefone informado para o Hóspede 3 não possui conta ativa no WhatsApp.",
            variant: "destructive"
          });
          setSubmitting(false);
          return;
        }
      }

      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        toast({
          title: "E-mail inválido",
          description: "Informe um endereço de e-mail válido ou deixe o campo em branco.",
          variant: "destructive"
        });
        setSubmitting(false);
        return;
      }

      const isSingleFlat1Eligible = !reservation.packageIndex || Number(reservation.packageIndex) === 1;
      const g3SingleActive = guestCountSingle >= 3 && !guest3InformLater && Boolean(guest3Name.trim());
      const g3SingleDocClean = guest3Document.replace(/\D/g, "");

      const res = await fetch(`/api/pms/agency-guest-credential/${encodeURIComponent(reservation.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestCount: guestCountSingle,
          ...(isSingleFlat1Eligible && reservation.requesterName
            ? { requesterIsGuest1: Boolean(requesterIsGuest1Single) }
            : {}),
          guestName: guestName.trim(),
          guestDocument: hasDocInput ? (docType === "passport" ? normalizedPassport : cleanDoc) : "",
          docType: hasDocInput ? (docType === "passport" ? "Passaporte" : "CPF") : "",
          guestPhone: finalPhonePayload,
          guestSecondaryPhone: finalSecPhonePayload,
          guestEmail: cleanEmail,
          guest2InformLater: guestCountSingle >= 2 ? guest2InformLater : false,
          guest2: guestCountSingle >= 2 && !guest2InformLater && guest2Name.trim()
            ? {
                name: guest2Name.trim(),
                document: guest2Document.replace(/\D/g, ""),
                phone: finalSingleG2PhonePayload,
                email: guest2Email.trim()
              }
            : null,
          guest3InformLater: guestCountSingle >= 3 ? guest3InformLater : false,
          guest3: g3SingleActive
            ? {
                name: guest3Name.trim(),
                document: g3SingleDocClean,
                phone: finalSingleG3PhonePayload,
                email: guest3Email.trim()
              }
            : null,
          guest3Name: g3SingleActive ? guest3Name.trim() : "",
          guest3Document: g3SingleActive ? g3SingleDocClean : "",
          guest3Phone: g3SingleActive ? finalSingleG3PhonePayload : "",
          guest3Email: g3SingleActive ? guest3Email.trim() : "",
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
        const missingG2Single = guestCountSingle >= 2 && guest2InformLater;
        const missingG3Single = guestCountSingle >= 3 && guest3InformLater;
        const missingCompanionSingle = missingG2Single || missingG3Single;
        setCompleted(true);
        toast({
          title: missingCompanionSingle
            ? "Hóspede 1 salvo • Falta Acompanhante"
            : (isGuestSelfIdentifyMode ? "Reserva Identificada e Liberada!" : "Credenciamento Concluído!"),
          description: missingCompanionSingle
            ? "Os dados informados foram registrados e enviados ao WhatsApp. Falta informar o(s) acompanhante(s) antes do check-in."
            : "Os dados foram liberados na portaria 24h e as orientações de acesso foram enviadas para o WhatsApp informado."
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
        <div className="rounded-2xl bg-gradient-to-br from-[#091E26] via-[#0F3D4C] to-[#091E26] border border-[#C5A059]/40 p-6 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#E5C98B] bg-[#C5A059]/15 border border-[#C5A059]/35 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />{" "}
                {isGuestSelfIdentifyMode
                  ? "Identificação da Reserva • Acesso do Hóspede"
                  : "Portal de Credenciamento do Hóspede"}
              </span>
              <div className="flex items-center gap-3 mt-3">
                <CorpFlatsIcon className="w-10 h-10" />
                <div>
                  <CorpFlatsWordmark className="text-xl text-white block leading-none" />
                  <span className="text-xs text-[#E5C98B] font-semibold">Edifício Soho Residence</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 mt-2">
                {isGuestSelfIdentifyMode
                  ? "Localize sua reserva pelo código localizador e cadastre seus dados para receber as instruções no WhatsApp"
                  : "Credenciamento Antecipado e Liberação de Acesso do Hóspede na Portaria 24h"}
              </p>
            </div>
          </div>
        </div>

        {!isBatchMode && batchItems.length === 0 && !reservation && !loading && (
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

        {isBatchMode && !loading && errorMsg && batchItems.length === 0 && (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {(isBatchMode || batchItems.length > 0) && !loading && batchItems.length > 0 && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    <Layers className="w-3.5 h-3.5" />{" "}
                    {batchItems[0]?.reservation?.packageCode
                      ? `Pacote Multi-Flat ${batchItems[0].reservation.packageCode} • Link Único de Hóspedes`
                      : "Credenciamento em Lote • Mesma Agência"}
                  </span>
                  <h2 className="text-lg font-bold text-white mt-0.5">
                    {batchItems[0]?.reservation?.requesterName || batchItems[0]?.reservation?.agencyName || "Reservas Vinculadas"} ({batchItems.length} flats)
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {batchItems.filter((i) => i.saved).length} de {batchItems.length} concluídas
                  </span>
                  {batchItems.some((i) => i.guest1SavedPartial) && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35">
                      {batchItems.filter((i) => i.guest1SavedPartial).length} aguardando acompanhante(s)
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Preencha o <strong>Hóspede 1</strong> e, quando o flat for para 2 ou 3 pessoas, os respectivos <strong>Hóspedes 2 e 3</strong> conforme a ocupação de cada apartamento. Cada hóspede receberá no WhatsApp apenas as instruções de acesso do seu próprio flat (sem nenhum valor financeiro).
              </p>
            </div>

            {batchItems.map((item, idx) => {
              const r = item.reservation;
              const refTitle = r.b2bReservationNumber ? `Reserva #${r.b2bReservationNumber}` : `Reserva ${r.code}`;
              const indivUrl =
                typeof window !== "undefined"
                  ? `${window.location.origin}/credenciamento/${encodeURIComponent(r.code)}`
                  : `/credenciamento/${encodeURIComponent(r.code)}`;
              const showRequesterShortcut =
                idx === 0 &&
                (!r.packageIndex || Number(r.packageIndex) === 1) &&
                Boolean(r.packageCode || r.requesterName);
              const missingG2 = item.guestCount >= 2 && item.guest2InformLater;
              const missingG3 = item.guestCount >= 3 && item.guest3InformLater;
              const hasPendingComp = missingG2 || missingG3;

              return (
                <div
                  key={r.code || idx}
                  className={`rounded-2xl bg-slate-900 border p-5 space-y-4 transition-colors ${
                    item.saved && !hasPendingComp
                      ? "border-emerald-500/45"
                      : item.guest1SavedPartial || (item.saved && hasPendingComp)
                        ? "border-amber-500/45"
                        : "border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {idx + 1}. {refTitle}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-teal-300 border border-slate-700">
                          Flat {r.flatNumber || "Definido"}
                        </span>
                        {item.saved && !hasPendingComp && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> ✓ Credenciada
                          </span>
                        )}
                        {(item.guest1SavedPartial || (item.saved && hasPendingComp)) && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            ⏳ Hóspede 1 salvo • Falta{" "}
                            {[missingG2 ? "Hóspede 2" : "", missingG3 ? "Hóspede 3" : ""].filter(Boolean).join(" e ")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Período: <strong className="text-slate-200">{formatDateBr(r.checkinDate)}</strong> a{" "}
                        <strong className="text-slate-200">{formatDateBr(r.checkoutDate)}</strong>
                        {r.companyName ? ` • ${r.companyName}` : ""}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(indivUrl);
                        toast({
                          title: "Link individual copiado!",
                          description: `Você pode encaminhar este link diretamente ao hóspede da ${refTitle} (sem exibição de valores).`
                        });
                      }}
                      className="h-7 px-2.5 text-[11px] border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copiar Link Individual
                    </Button>
                  </div>

                  {showRequesterShortcut && (
                    <label className="flex items-center justify-between gap-2.5 rounded-xl bg-teal-950/35 border border-teal-500/35 px-3.5 py-2.5 cursor-pointer hover:bg-teal-950/50 transition-colors">
                      <span className="flex items-center gap-2 text-xs font-bold text-teal-200">
                        <input
                          type="checkbox"
                          checked={Boolean(item.requesterIsGuest1)}
                          onChange={(e) => toggleBatchRequesterIsGuest1(idx, e.target.checked)}
                          className="w-4 h-4 rounded accent-teal-500 shrink-0"
                        />
                        <span>O próprio Solicitante ficará neste flat</span>
                      </span>
                      {r.requesterName && (
                        <span className="text-[11px] text-teal-300/90 font-medium truncate">
                          {r.requesterName}
                        </span>
                      )}
                    </label>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Nome Completo do Hóspede 1 *</Label>
                      <Input
                        value={item.guestName}
                        onChange={(e) =>
                          updateBatchItem(idx, {
                            guestName: e.target.value,
                            saved: false,
                            guest1SavedPartial: false
                          })
                        }
                        placeholder="Nome e sobrenome"
                        className="bg-slate-950 border-slate-700 text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <Label className="text-xs text-slate-300 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-400" /> Telefone / WhatsApp (com DDD) *
                        </Label>
                        {item.whatsappStatus === "checking" && (
                          <span className="text-[10px] text-sky-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
                          </span>
                        )}
                        {item.whatsappStatus === "valid" && (
                          <span className="text-[10px] font-bold text-emerald-400">✓ WhatsApp ativo</span>
                        )}
                        {item.whatsappStatus === "invalid" && (
                          <span className="text-[10px] font-bold text-rose-400">❌ Sem WhatsApp</span>
                        )}
                      </div>
                      <Input
                        type="tel"
                        value={item.guestPhone}
                        onChange={(e) =>
                          updateBatchItem(idx, {
                            guestPhone: formatPhoneMask(e.target.value),
                            whatsappStatus: "idle",
                            saved: false,
                            guest1SavedPartial: false
                          })
                        }
                        onBlur={() => {
                          if (item.guestPhone.replace(/\D/g, "").length >= 8) {
                            checkBatchItemWhatsApp(idx, item.guestPhone);
                          }
                        }}
                        placeholder="(22) 99999-9999"
                        inputMode="tel"
                        className={`bg-slate-950 text-white ${
                          item.whatsappStatus === "valid"
                            ? "border-emerald-500/60"
                            : item.whatsappStatus === "invalid"
                              ? "border-rose-500/70"
                              : "border-slate-700"
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">CPF ou Passaporte (Opcional)</Label>
                      <Input
                        value={item.guestDocument}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (/[a-zA-Z]/.test(raw)) {
                            updateBatchItem(idx, {
                              docType: "passport",
                              guestDocument: formatPassport(raw),
                              saved: false,
                              guest1SavedPartial: false
                            });
                          } else {
                            updateBatchItem(idx, {
                              docType: "cpf",
                              guestDocument: formatCpfMask(raw),
                              saved: false,
                              guest1SavedPartial: false
                            });
                          }
                        }}
                        placeholder="000.000.000-00 (opcional)"
                        className="bg-slate-950 border-slate-700 text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">E-mail do Hóspede 1 (Opcional)</Label>
                      <Input
                        type="email"
                        value={item.guestEmail}
                        onChange={(e) =>
                          updateBatchItem(idx, {
                            guestEmail: e.target.value,
                            saved: false,
                            guest1SavedPartial: false
                          })
                        }
                        placeholder="hospede@empresa.com.br (opcional)"
                        className="bg-slate-950 border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  {/* Ocupação do Flat (conforme contratado na reserva) + Hóspede 2 e 3 */}
                  <fieldset className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                    <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-teal-400">
                      Ocupação Contratada deste Flat & Acompanhantes
                    </legend>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      {r.packageCode || r.isPackageReservation ? (
                        <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-teal-300">
                          Ocupação contratada: {item.guestCount >= 2 ? `${item.guestCount} Hóspedes` : "1 Hóspede"}
                        </span>
                      ) : (
                        <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => updateBatchItem(idx, { guestCount: 1, saved: false, guest1SavedPartial: false })}
                            className={`px-3 py-1 rounded-md font-bold transition-colors ${
                              item.guestCount === 1 ? "bg-teal-600 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            1 Hóspede
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBatchItem(idx, { guestCount: 2, saved: false, guest1SavedPartial: false })}
                            className={`px-3 py-1 rounded-md font-bold transition-colors ${
                              item.guestCount === 2 ? "bg-teal-600 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            2 Hóspedes
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBatchItem(idx, { guestCount: 3, saved: false, guest1SavedPartial: false })}
                            className={`px-3 py-1 rounded-md font-bold transition-colors ${
                              item.guestCount >= 3 ? "bg-teal-600 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            3 Hóspedes
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.guestCount >= 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateBatchItem(idx, {
                                guest2InformLater: !item.guest2InformLater,
                                saved: false
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              item.guest2InformLater
                                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                                : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                            }`}
                          >
                            {item.guest2InformLater ? "⏳ Hóspede 2 marcado p/ informar depois" : "Informar Hóspede 2 depois"}
                          </button>
                        )}
                        {item.guestCount >= 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateBatchItem(idx, {
                                guest3InformLater: !item.guest3InformLater,
                                saved: false
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              item.guest3InformLater
                                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                                : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                            }`}
                          >
                            {item.guest3InformLater ? "⏳ Hóspede 3 marcado p/ informar depois" : "Informar Hóspede 3 depois"}
                          </button>
                        )}
                      </div>
                    </div>

                    {item.guestCount >= 2 && !item.guest2InformLater && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-300">Nome Completo do Hóspede 2 *</Label>
                          <Input
                            value={item.guest2Name}
                            onChange={(e) => updateBatchItem(idx, { guest2Name: e.target.value, saved: false })}
                            placeholder="Nome e sobrenome do 2º hóspede"
                            className="bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <Label className="text-xs text-slate-300">WhatsApp do Hóspede 2 *</Label>
                            {item.guest2WhatsappStatus === "checking" && (
                              <span className="text-[10px] text-sky-400 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                              </span>
                            )}
                            {item.guest2WhatsappStatus === "valid" && (
                              <span className="text-[10px] font-bold text-emerald-400">✓ Ativo</span>
                            )}
                            {item.guest2WhatsappStatus === "invalid" && (
                              <span className="text-[10px] font-bold text-rose-400">❌ Sem Whats</span>
                            )}
                          </div>
                          <Input
                            type="tel"
                            inputMode="tel"
                            value={item.guest2Phone}
                            onChange={(e) =>
                              updateBatchItem(idx, {
                                guest2Phone: formatPhoneMask(e.target.value),
                                guest2WhatsappStatus: "idle",
                                saved: false
                              })
                            }
                            onBlur={() => {
                              if (item.guest2Phone.replace(/\D/g, "").length >= 8) {
                                checkBatchGuest2WhatsApp(idx, item.guest2Phone);
                              }
                            }}
                            placeholder="(22) 99999-9999"
                            className={`bg-slate-950 text-white ${
                              item.guest2WhatsappStatus === "valid"
                                ? "border-emerald-500/60"
                                : item.guest2WhatsappStatus === "invalid"
                                  ? "border-rose-500/70"
                                  : "border-slate-700"
                            }`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-400">CPF do Hóspede 2 (Opcional)</Label>
                          <Input
                            value={item.guest2Document}
                            onChange={(e) => updateBatchItem(idx, { guest2Document: formatCpfMask(e.target.value), saved: false })}
                            placeholder="000.000.000-00"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            className="bg-slate-950 border-slate-700 text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-400">E-mail do Hóspede 2 (Opcional)</Label>
                          <Input
                            type="email"
                            value={item.guest2Email}
                            onChange={(e) => updateBatchItem(idx, { guest2Email: e.target.value, saved: false })}
                            placeholder="hospede2@empresa.com.br"
                            className="bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                      </div>
                    )}

                    {item.guestCount >= 3 && !item.guest3InformLater && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-300">Nome Completo do Hóspede 3 *</Label>
                          <Input
                            value={item.guest3Name}
                            onChange={(e) => updateBatchItem(idx, { guest3Name: e.target.value, saved: false })}
                            placeholder="Nome e sobrenome do 3º hóspede"
                            className="bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <Label className="text-xs text-slate-300">WhatsApp do Hóspede 3 *</Label>
                            {item.guest3WhatsappStatus === "checking" && (
                              <span className="text-[10px] text-sky-400 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                              </span>
                            )}
                            {item.guest3WhatsappStatus === "valid" && (
                              <span className="text-[10px] font-bold text-emerald-400">✓ Ativo</span>
                            )}
                            {item.guest3WhatsappStatus === "invalid" && (
                              <span className="text-[10px] font-bold text-rose-400">❌ Sem Whats</span>
                            )}
                          </div>
                          <Input
                            type="tel"
                            inputMode="tel"
                            value={item.guest3Phone}
                            onChange={(e) =>
                              updateBatchItem(idx, {
                                guest3Phone: formatPhoneMask(e.target.value),
                                guest3WhatsappStatus: "idle",
                                saved: false
                              })
                            }
                            onBlur={() => {
                              if (item.guest3Phone.replace(/\D/g, "").length >= 8) {
                                checkBatchGuest3WhatsApp(idx, item.guest3Phone);
                              }
                            }}
                            placeholder="(22) 99999-9999"
                            className={`bg-slate-950 text-white ${
                              item.guest3WhatsappStatus === "valid"
                                ? "border-emerald-500/60"
                                : item.guest3WhatsappStatus === "invalid"
                                  ? "border-rose-500/70"
                                  : "border-slate-700"
                            }`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-400">CPF do Hóspede 3 (Opcional)</Label>
                          <Input
                            value={item.guest3Document}
                            onChange={(e) => updateBatchItem(idx, { guest3Document: formatCpfMask(e.target.value), saved: false })}
                            placeholder="000.000.000-00"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            className="bg-slate-950 border-slate-700 text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-400">E-mail do Hóspede 3 (Opcional)</Label>
                          <Input
                            type="email"
                            value={item.guest3Email}
                            onChange={(e) => updateBatchItem(idx, { guest3Email: e.target.value, saved: false })}
                            placeholder="hospede3@empresa.com.br"
                            className="bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                      </div>
                    )}
                  </fieldset>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={item.saving}
                      onClick={() => saveSingleBatchCard(idx)}
                      className={
                        item.saved
                          ? "bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
                          : item.guest1SavedPartial
                            ? "bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                            : "bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                      }
                    >
                      {item.saving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Salvando...
                        </>
                      ) : item.saved ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Atualizar Dados desta Reserva
                        </>
                      ) : item.guest1SavedPartial && !hasPendingComp ? (
                        "Salvar Acompanhantes e Concluir Flat"
                      ) : item.guest1SavedPartial ? (
                        "Atualizar Hóspede 1 (Falta Acompanhante)"
                      ) : (
                        "Salvar Apenas Esta Reserva"
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}

            {batchItems.some((i) => !i.saved) && (
              <Button
                type="button"
                disabled={submittingBatchAll}
                onClick={handleSaveAllFilledBatch}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-6 text-sm shadow-xl"
              >
                {submittingBatchAll ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Validando e Liberando Todas as Reservas Preenchidas...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar Todas as Reservas Preenchidas Agora
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {!isBatchMode && reservation && !completed && (
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
                    <strong>Nome Completo e WhatsApp</strong>, enviaremos imediatamente para o seu{" "}
                    <strong>WhatsApp</strong> a confirmação da estadia, o link rápido de Pré-Check-in e as instruções de acesso ao flat.
                  </>
                ) : (
                  <>
                    O <strong>CorpFlats (Edifício Soho)</strong> opera com controle eletrônico de acesso e liberação prévia na recepção/portaria 24h.{" "}
                    Basta informar o <strong>Nome Completo e o WhatsApp do hóspede</strong> abaixo (CPF e E-mail são opcionais) para encerrarmos os lembretes e enviarmos automaticamente ao WhatsApp do hóspede a confirmação da reserva e o link de Pré-Check-in Digital (sem exibir tarifas ou valores financeiros).
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
                    : "Dados do Hóspede para a Portaria"}
                </h3>
                <span className="text-[11px] text-amber-300 font-semibold">
                  * Somente Nome Completo e WhatsApp são obrigatórios
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Boolean(reservation.requesterName) &&
                  (!reservation.packageIndex || Number(reservation.packageIndex) === 1) && (
                    <label className="sm:col-span-2 flex items-center justify-between gap-2.5 rounded-xl bg-teal-950/35 border border-teal-500/35 px-3.5 py-2.5 cursor-pointer hover:bg-teal-950/50 transition-colors">
                      <span className="flex items-center gap-2 text-xs font-bold text-teal-200">
                        <input
                          type="checkbox"
                          checked={Boolean(requesterIsGuest1Single)}
                          onChange={(e) => toggleSingleRequesterIsGuest1(e.target.checked)}
                          className="w-4 h-4 rounded accent-teal-500 shrink-0"
                        />
                        <span>O próprio Solicitante ficará neste flat</span>
                      </span>
                      <span className="text-[11px] text-teal-300/90 font-medium truncate">
                        {reservation.requesterName}
                      </span>
                    </label>
                  )}

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
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => {
                      const formatted = formatPhoneMask(e.target.value);
                      setGuestPhone(formatted);
                      if (whatsappStatus !== "idle") setWhatsappStatus("idle");
                    }}
                    onBlur={() => {
                      if (guestPhone.replace(/\D/g, "").length >= 8) {
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

                {/* CPF ou Passaporte Estrangeiro (Opcional) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-slate-300">
                        {docType === "passport" ? "Passaporte (Opcional)" : "CPF ou Passaporte (Opcional)"}
                      </Label>
                      <div className="inline-flex rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setDocType("cpf");
                            setGuestDocument(formatCpfMask(guestDocument));
                          }}
                          className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                            docType === "cpf"
                              ? "bg-teal-600 text-white"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          CPF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDocType("passport");
                            setGuestDocument(formatPassport(guestDocument));
                          }}
                          className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                            docType === "passport"
                              ? "bg-teal-600 text-white"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Passaporte
                        </button>
                      </div>
                    </div>
                    {docType === "cpf" && cpfIsComplete && (
                      <span
                        className={`text-[10px] font-bold ${
                          cpfIsValid ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {cpfIsValid ? "✓ CPF válido" : "❌ CPF inválido"}
                      </span>
                    )}
                    {docType === "passport" && guestDocument.trim().length > 0 && (
                      <span
                        className={`text-[10px] font-bold ${
                          passportIsComplete ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {passportIsComplete ? "✓ Passaporte válido" : "Mín. 5 caracteres"}
                      </span>
                    )}
                  </div>
                  <Input
                    value={guestDocument}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (docType === "cpf" && /[a-zA-Z]/.test(raw)) {
                        setDocType("passport");
                        setGuestDocument(formatPassport(raw));
                      } else if (docType === "passport") {
                        setGuestDocument(formatPassport(raw));
                      } else {
                        setGuestDocument(formatCpfMask(raw));
                      }
                    }}
                    placeholder={docType === "passport" ? "Ex: AB123456 (opcional)" : "000.000.000-00 (opcional)"}
                    inputMode="text"
                    maxLength={20}
                    className={`bg-slate-950 text-white font-mono ${
                      docType === "passport"
                        ? passportIsComplete
                          ? "border-emerald-500/60"
                          : "border-slate-700"
                        : cpfIsComplete
                          ? cpfIsValid
                            ? "border-emerald-500/60"
                            : "border-rose-500/70"
                          : "border-slate-700"
                    }`}
                  />
                </div>

                {/* E-mail Opcional */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-teal-400" /> E-mail do Hóspede (Opcional)
                  </Label>
                  <Input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="hospede@empresa.com.br (opcional)"
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Telefone Secundário (Opcional)</Label>
                  <Input
                    type="tel"
                    value={guestSecondaryPhone}
                    onChange={(e) => setGuestSecondaryPhone(formatPhoneMask(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                {/* Hóspedes 2 e 3 quando flat tiver 2 ou 3 pessoas */}
                <fieldset className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                  <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    Ocupação Contratada do Flat & Acompanhantes
                  </legend>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {reservation.packageCode || reservation.isPackageReservation ? (
                      <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-teal-300">
                        Ocupação contratada: {guestCountSingle >= 2 ? `${guestCountSingle} Hóspedes` : "1 Hóspede"}
                      </span>
                    ) : (
                      <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setGuestCountSingle(1)}
                          className={`px-3 py-1 rounded-md font-bold transition-colors ${
                            guestCountSingle === 1 ? "bg-teal-600 text-white" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          1 Hóspede
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuestCountSingle(2)}
                          className={`px-3 py-1 rounded-md font-bold transition-colors ${
                            guestCountSingle === 2 ? "bg-teal-600 text-white" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          2 Hóspedes
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuestCountSingle(3)}
                          className={`px-3 py-1 rounded-md font-bold transition-colors ${
                            guestCountSingle >= 3 ? "bg-teal-600 text-white" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          3 Hóspedes
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {guestCountSingle >= 2 && (
                        <button
                          type="button"
                          onClick={() => setGuest2InformLater(!guest2InformLater)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            guest2InformLater
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                              : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {guest2InformLater ? "⏳ Hóspede 2 será informado depois" : "Informar Hóspede 2 depois"}
                        </button>
                      )}
                      {guestCountSingle >= 3 && (
                        <button
                          type="button"
                          onClick={() => setGuest3InformLater(!guest3InformLater)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                            guest3InformLater
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                              : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {guest3InformLater ? "⏳ Hóspede 3 será informado depois" : "Informar Hóspede 3 depois"}
                        </button>
                      )}
                    </div>
                  </div>
                  {guestCountSingle >= 2 && !guest2InformLater && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-300">Nome Completo do Hóspede 2 *</Label>
                        <Input
                          value={guest2Name}
                          onChange={(e) => setGuest2Name(e.target.value)}
                          placeholder="Nome e sobrenome"
                          className="bg-slate-950 border-slate-700 text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <Label className="text-xs text-slate-300">WhatsApp do Hóspede 2 *</Label>
                          {guest2WhatsappStatus === "checking" && (
                            <span className="text-[10px] text-sky-400 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </span>
                          )}
                          {guest2WhatsappStatus === "valid" && (
                            <span className="text-[10px] font-bold text-emerald-400">✓ Ativo</span>
                          )}
                          {guest2WhatsappStatus === "invalid" && (
                            <span className="text-[10px] font-bold text-rose-400">❌ Sem Whats</span>
                          )}
                        </div>
                        <Input
                          type="tel"
                          inputMode="tel"
                          value={guest2Phone}
                          onChange={(e) => {
                            setGuest2Phone(formatPhoneMask(e.target.value));
                            if (guest2WhatsappStatus !== "idle") setGuest2WhatsappStatus("idle");
                          }}
                          onBlur={() => {
                            if (guest2Phone.replace(/\D/g, "").length >= 8) {
                              verifyGuest2WhatsAppNumber(guest2Phone);
                            }
                          }}
                          placeholder="(22) 99999-9999"
                          className={`bg-slate-950 text-white ${
                            guest2WhatsappStatus === "valid"
                              ? "border-emerald-500/60"
                              : guest2WhatsappStatus === "invalid"
                                ? "border-rose-500/70"
                                : "border-slate-700"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">CPF do Hóspede 2 (Opcional)</Label>
                        <Input
                          value={guest2Document}
                          onChange={(e) => setGuest2Document(formatCpfMask(e.target.value))}
                          placeholder="000.000.000-00"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="bg-slate-950 border-slate-700 text-white font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">E-mail do Hóspede 2 (Opcional)</Label>
                        <Input
                          type="email"
                          value={guest2Email}
                          onChange={(e) => setGuest2Email(e.target.value)}
                          placeholder="hospede2@empresa.com.br"
                          className="bg-slate-950 border-slate-700 text-white"
                        />
                      </div>
                    </div>
                  )}
                  {guestCountSingle >= 3 && !guest3InformLater && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-300">Nome Completo do Hóspede 3 *</Label>
                        <Input
                          value={guest3Name}
                          onChange={(e) => setGuest3Name(e.target.value)}
                          placeholder="Nome e sobrenome"
                          className="bg-slate-950 border-slate-700 text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <Label className="text-xs text-slate-300">WhatsApp do Hóspede 3 *</Label>
                          {guest3WhatsappStatus === "checking" && (
                            <span className="text-[10px] text-sky-400 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </span>
                          )}
                          {guest3WhatsappStatus === "valid" && (
                            <span className="text-[10px] font-bold text-emerald-400">✓ Ativo</span>
                          )}
                          {guest3WhatsappStatus === "invalid" && (
                            <span className="text-[10px] font-bold text-rose-400">❌ Sem Whats</span>
                          )}
                        </div>
                        <Input
                          type="tel"
                          inputMode="tel"
                          value={guest3Phone}
                          onChange={(e) => {
                            setGuest3Phone(formatPhoneMask(e.target.value));
                            if (guest3WhatsappStatus !== "idle") setGuest3WhatsappStatus("idle");
                          }}
                          onBlur={() => {
                            if (guest3Phone.replace(/\D/g, "").length >= 8) {
                              verifyGuest3WhatsAppNumber(guest3Phone);
                            }
                          }}
                          placeholder="(22) 99999-9999"
                          className={`bg-slate-950 text-white ${
                            guest3WhatsappStatus === "valid"
                              ? "border-emerald-500/60"
                              : guest3WhatsappStatus === "invalid"
                                ? "border-rose-500/70"
                                : "border-slate-700"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">CPF do Hóspede 3 (Opcional)</Label>
                        <Input
                          value={guest3Document}
                          onChange={(e) => setGuest3Document(formatCpfMask(e.target.value))}
                          placeholder="000.000.000-00"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="bg-slate-950 border-slate-700 text-white font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">E-mail do Hóspede 3 (Opcional)</Label>
                        <Input
                          type="email"
                          value={guest3Email}
                          onChange={(e) => setGuest3Email(e.target.value)}
                          placeholder="hospede3@empresa.com.br"
                          className="bg-slate-950 border-slate-700 text-white"
                        />
                      </div>
                    </div>
                  )}
                </fieldset>

                {/* Anexo do Documento: Galeria / PDF ou Câmera (Opcional) */}
                <div className="sm:col-span-2 space-y-2.5 pt-1">
                  <Label className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    Documento de Identificação (RG, CNH ou Passaporte — Opcional)
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

        {completed && reservation && (() => {
          const pendingG2 = guestCountSingle >= 2 && guest2InformLater;
          const pendingG3 = guestCountSingle >= 3 && guest3InformLater;
          const hasPendingAny = pendingG2 || pendingG3;
          const pendingLabel = [pendingG2 ? "Hóspede 2" : "", pendingG3 ? "Hóspede 3" : ""].filter(Boolean).join(" e ");
          return (
          <div
            className={`rounded-2xl border p-8 text-center space-y-4 shadow-xl ${
              hasPendingAny
                ? "bg-amber-950/35 border-amber-500/45"
                : "bg-emerald-950/40 border-emerald-500/40"
            }`}
          >
            <CheckCircle2
              className={`w-12 h-12 mx-auto ${
                hasPendingAny ? "text-amber-400" : "text-emerald-400"
              }`}
            />
            {hasPendingAny && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                ⏳ Hóspede 1 salvo • Falta {pendingLabel}
              </span>
            )}
            <h2 className="text-xl font-extrabold text-white">
              {hasPendingAny
                ? `Hóspede 1 Salvo • Falta Informar ${pendingLabel}`
                : isGuestSelfIdentifyMode
                  ? "Reserva Identificada e Liberada com Sucesso!"
                  : "Credenciamento Concluído com Sucesso!"}
            </h2>
            <p className="text-sm text-slate-200 max-w-lg mx-auto leading-relaxed">
              Os dados de <strong>{guestName}</strong> para o <strong>Flat {reservation.flatNumber}</strong> já foram registrados para a recepção 24h do Edifício Soho e acabamos de enviar as instruções da estadia para o WhatsApp{" "}
              <strong>{guestPhone}</strong>.
              {hasPendingAny && (
                <> Lembre-se de retornar a este link antes do check-in para cadastrar os dados de <strong>{pendingLabel}</strong>.</>
              )}
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
          );
        })()}
      </div>
    </div>
  );
}
