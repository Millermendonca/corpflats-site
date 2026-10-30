import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Refrigerator,
  Package,
  Plus,
  Minus,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  QrCode,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Building2,
  Lock,
  Coffee,
  CheckCircle,
  ExternalLink,
  Receipt,
  FileText,
  Mail,
  Home,
  AlertCircle,
  Clock,
  Users,
  UserCheck,
  UserPlus,
  Phone,
  Edit3,
  Calendar,
  LogOut,
  ChevronDown,
  ChevronUp
} from "lucide-react";

export interface MinibarProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  imageUrl?: string;
  isCourtesy?: boolean;
  courtesyLimit?: number;
  extraPaidProductId?: string;
  defaultQuantity?: number;
  sortOrder?: number;
}

export interface MinibarOrderItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  isCourtesy?: boolean;
}

export interface PendingLaunchedItem {
  itemKey: string;
  orderId: string;
  launchDateYmd: string;
  launchDateBr: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isCourtesy?: boolean;
}

export interface DailyLaunchGroup {
  dateYmd: string;
  dateBr: string;
  items: {
    itemKey?: string;
    orderId: string;
    launchDateYmd: string;
    launchDateBr: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isCourtesy?: boolean;
    paymentStatus: string;
    launchedByName?: string;
  }[];
  totalDayAmount: number;
  pendingDayAmount: number;
}

export interface FlatGuestSlot {
  index: number;
  guestId?: number | string | null;
  name: string;
  firstName: string;
  phone: string;
  email: string;
  cpf: string;
  role: string;
}

export interface MinibarReservation {
  guestName: string;
  firstName: string;
  phone?: string;
  email?: string;
  document?: string;
  reservationCode: string;
  reservationId?: number | string;
  flatNumber: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  numGuests?: number;
  matchedGuestIndex?: number;
  matchedGuestRole?: string;
}

export type InvoicePreference = "detailed" | "water" | "minibar_consumption";
export type PartialPaymentMode = "items" | "equal_split" | "custom_amount";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value) || 0);
}

function formatDocMask(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    return digits
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
}

export default function GuestMinibar() {
  const [, setLocation] = useLocation();

  // Rotas por QR Code no Flat
  const [, paramsFlatDirect] = useRoute("/frigobar/flat/:flatNumber");
  const [, paramsFlatShort] = useRoute("/frigobar/:flatNumber");
  const [, paramsMinibarFlatDirect] = useRoute("/minibar/flat/:flatNumber");
  const [, paramsMinibarFlatShort] = useRoute("/minibar/:flatNumber");

  // Rotas Diretas pela Reserva
  const [, paramsResCodeFrigobar] = useRoute("/minha-reserva/:code/frigobar");
  const [, paramsResCodeMinibar] = useRoute("/minha-reserva/:code/minibar");
  const [, paramsPortalFrigobar] = useRoute("/portal-hospede/:code/frigobar");
  const [, paramsGuestFrigobar] = useRoute("/guest-portal/:code/frigobar");

  // Identificação dos Parâmetros
  const flatFromUrl =
    paramsFlatDirect?.flatNumber ||
    paramsFlatShort?.flatNumber ||
    paramsMinibarFlatDirect?.flatNumber ||
    paramsMinibarFlatShort?.flatNumber ||
    "";

  const codeFromUrl =
    paramsResCodeFrigobar?.code ||
    paramsResCodeMinibar?.code ||
    paramsPortalFrigobar?.code ||
    paramsGuestFrigobar?.code ||
    "";

  // Estados de Etapa
  const [step, setStep] = useState<"loading" | "otp_gate" | "manual_lookup" | "catalog" | "checkout" | "payment" | "success">("loading");

  // Contexto da Reserva e Extrato de Lançamentos Diários
  const [reservation, setReservation] = useState<MinibarReservation | null>(null);
  const [catalog, setCatalog] = useState<MinibarProduct[]>([]);
  const [defaultStock, setDefaultStock] = useState<Record<string, number>>({});
  const [paidItems, setPaidItems] = useState<MinibarOrderItem[]>([]);
  const [paidOrdersHistory, setPaidOrdersHistory] = useState<any[]>([]);
  const [courtesyConsumed, setCourtesyConsumed] = useState(false);

  // Novo Modo Operacional: Extrato Diário Lançado pela Repositora + Trava de Pagamento Pré-Checkout
  const [isCheckedOut, setIsCheckedOut] = useState<boolean>(false);
  const [checkoutTime, setCheckoutTime] = useState<string>("");
  const [dailyLaunches, setDailyLaunches] = useState<DailyLaunchGroup[]>([]);
  const [pendingLaunchedItems, setPendingLaunchedItems] = useState<PendingLaunchedItem[]>([]);
  const [pendingBalance, setPendingBalance] = useState<number>(0);
  const [totalLaunchedAmount, setTotalLaunchedAmount] = useState<number>(0);
  const [totalPaidAmount, setTotalPaidAmount] = useState<number>(0);
  const [confirmingCheckout, setConfirmingCheckout] = useState<boolean>(false);
  const [checkoutBannerSuccess, setCheckoutBannerSuccess] = useState<string | null>(null);
  const [showReferenceCatalog, setShowReferenceCatalog] = useState<boolean>(true);
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>("todos");

  // Pagamento Parcial / Individual (3 Modos)
  const [partialMode, setPartialMode] = useState<PartialPaymentMode>("items");
  const [selectedLaunchQtyMap, setSelectedLaunchQtyMap] = useState<Record<string, number>>({});
  const [splitParts, setSplitParts] = useState<number>(2);
  const [customPartialInput, setCustomPartialInput] = useState<string>("");

  // Múltiplos Hóspedes no mesmo Flat (Consumo e Nota Separados)
  const [reservationGuests, setReservationGuests] = useState<FlatGuestSlot[]>([]);
  const [selectedGuestIndex, setSelectedGuestIndex] = useState<number>(1);
  const [showAddCompanionModal, setShowAddCompanionModal] = useState(false);
  const [companionForm, setCompanionForm] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: ""
  });

  // Estados do Portão OTP (4 Dígitos)
  const [otpValue, setOtpValue] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Busca Manual (quando entra em /frigobar sem flat e sem code)
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  // Formulário Fiscal & Contato Automático (WhatsApp + E-mail já cadastrados)
  const [invoicePreference, setInvoicePreference] = useState<InvoicePreference>("detailed");
  const [docChoice, setDocChoice] = useState<"cadastrado" | "personalizado">("cadastrado");
  const [customDocument, setCustomDocument] = useState("");
  const [customCompanyName, setCustomCompanyName] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoicePhone, setInvoicePhone] = useState("");
  const [isEditingContact, setIsEditingContact] = useState(false);

  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pendente" | "pago" | "falha">("pendente");

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Hóspede consumidor ativo selecionado
  const activeConsumerGuest = useMemo<FlatGuestSlot>(() => {
    const found = reservationGuests.find((g) => g.index === selectedGuestIndex);
    if (found) return found;
    return {
      index: 1,
      guestId: null,
      name: reservation?.guestName || "Hóspede",
      firstName: reservation?.firstName || "Hóspede",
      phone: reservation?.phone || "",
      email: reservation?.email || "",
      cpf: reservation?.document || "",
      role: "1º Hóspede (Titular)"
    };
  }, [reservationGuests, selectedGuestIndex, reservation]);

  // Troca de hóspede consumidor no flat (atualiza CPF, WhatsApp e E-mail automaticamente)
  const handleSelectConsumerGuest = (guestSlot: FlatGuestSlot) => {
    setSelectedGuestIndex(guestSlot.index);
    setInvoiceEmail(guestSlot.email || "");
    setInvoicePhone(guestSlot.phone || "");
    if (guestSlot.cpf) {
      setCustomDocument(formatDocMask(guestSlot.cpf));
      setDocChoice("cadastrado");
    } else {
      setCustomDocument("");
      setDocChoice("personalizado");
    }
    setReservation((prev) =>
      prev
        ? {
            ...prev,
            guestName: guestSlot.name,
            firstName: guestSlot.firstName || guestSlot.name.split(" ")[0] || "Hóspede",
            phone: guestSlot.phone,
            email: guestSlot.email,
            document: guestSlot.cpf,
            matchedGuestIndex: guestSlot.index,
            matchedGuestRole: guestSlot.role
          }
        : prev
    );
  };

  // Adicionar/identificar 2º ou 3º hóspede para pagar separado
  const handleConfirmCompanionGuest = () => {
    const cleanName = companionForm.name.trim();
    if (!cleanName) return;
    const nextIdx = Math.max(...reservationGuests.map((g) => g.index), 1) + 1;
    const newSlot: FlatGuestSlot = {
      index: nextIdx,
      guestId: null,
      name: cleanName,
      firstName: cleanName.split(" ")[0] || cleanName,
      phone: companionForm.phone.trim(),
      email: companionForm.email.trim(),
      cpf: companionForm.cpf.replace(/\D/g, ""),
      role: `${nextIdx}º Hóspede (Acompanhante)`
    };
    setReservationGuests((prev) => [...prev, newSlot]);
    handleSelectConsumerGuest(newSlot);
    setShowAddCompanionModal(false);
    setCompanionForm({ name: "", phone: "", email: "", cpf: "" });
  };

  const applyStatementData = (data: any) => {
    setIsCheckedOut(Boolean(data.isCheckedOut));
    setCheckoutTime(data.checkoutTime || "");
    const launches: DailyLaunchGroup[] = Array.isArray(data.dailyLaunches) ? data.dailyLaunches : [];
    const pendingList: PendingLaunchedItem[] = Array.isArray(data.pendingLaunchedItems) ? data.pendingLaunchedItems : [];
    setDailyLaunches(launches);
    setPendingLaunchedItems(pendingList);
    setPendingBalance(Number(data.pendingBalance) || 0);
    setTotalLaunchedAmount(Number(data.totalLaunchedAmount) || 0);
    setTotalPaidAmount(Number(data.totalPaidAmount) || 0);

    // Por padrão, seleciona todos os itens pendentes para pagamento rápido (ou o hóspede pode desmarcar/ajustar)
    const initialMap: Record<string, number> = {};
    for (const item of pendingList) {
      initialMap[item.itemKey] = item.quantity;
    }
    setSelectedLaunchQtyMap(initialMap);
  };

  const applyContextResponse = (data: any, fallbackCodeOrFlat: string) => {
    const guestsList: FlatGuestSlot[] = Array.isArray(data.reservationGuests) && data.reservationGuests.length > 0
      ? data.reservationGuests
      : [
          {
            index: 1,
            guestId: data.guestId || null,
            name: data.guestName || "Hóspede",
            firstName: data.firstName || data.guestName?.split(" ")[0] || "Hóspede",
            phone: data.phone || "",
            email: data.email || "",
            cpf: data.document || "",
            role: "1º Hóspede (Titular)"
          }
        ];

    const matchedIdx = Number(data.matchedGuestIndex) || 1;
    const matchedSlot = guestsList.find((g) => g.index === matchedIdx) || guestsList[0];

    setReservationGuests(guestsList);
    setSelectedGuestIndex(matchedSlot.index);

    setReservation({
      guestName: matchedSlot.name || data.guestName,
      firstName: matchedSlot.firstName || data.firstName || data.guestName?.split(" ")[0] || "Hóspede",
      phone: matchedSlot.phone || data.phone || "",
      email: matchedSlot.email || data.email || "",
      document: matchedSlot.cpf || data.document || "",
      reservationCode: data.reservationCode || fallbackCodeOrFlat,
      reservationId: data.reservationId,
      flatNumber: String(data.flatNumber || ""),
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      status: data.status,
      numGuests: Number(data.numGuests) || guestsList.length || 1,
      matchedGuestIndex: matchedSlot.index,
      matchedGuestRole: matchedSlot.role
    });

    setCatalog(data.catalog || []);
    setDefaultStock(data.defaultStock || {});
    setPaidItems(data.paidItems || []);
    setPaidOrdersHistory(data.paidOrdersHistory || []);
    setCourtesyConsumed(Boolean(data.courtesyConsumed));

    applyStatementData(data);

    const resolvedEmail = matchedSlot.email || data.email || "";
    const resolvedPhone = matchedSlot.phone || data.phone || "";
    setInvoiceEmail(resolvedEmail);
    setInvoicePhone(resolvedPhone);
    setIsEditingContact(!resolvedEmail && !resolvedPhone);

    const resolvedDoc = matchedSlot.cpf || data.document || "";
    if (resolvedDoc) {
      setCustomDocument(formatDocMask(resolvedDoc));
      setDocChoice("cadastrado");
    } else {
      setDocChoice("personalizado");
    }
  };

  // Carrega contexto direto por código de reserva
  const loadContextByReservationCode = async (code: string) => {
    setStep("loading");
    setOtpError(null);
    try {
      const res = await fetch(`/api/minibar/reservation-context/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        applyContextResponse(data, code);
        setStep("catalog");
      } else {
        setOtpError(data.error || "Reserva não encontrada ou encerrada.");
        setStep("manual_lookup");
      }
    } catch {
      setOtpError("Erro de comunicação ao carregar os dados da reserva.");
      setStep("manual_lookup");
    }
  };

  // Carrega contexto por flat e 4 dígitos (OTP)
  const verifyFlatContextWithDigits = async (flatNum: string, digits: string) => {
    if (digits.length !== 4) return;
    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch("/api/minibar/flat-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum,
          last4Digits: digits
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        applyContextResponse(data, data.reservationCode || flatNum);

        try {
          sessionStorage.setItem(
            `gfm_minibar_auth_${flatNum}`,
            JSON.stringify({
              flatNumber: flatNum,
              reservationCode: data.reservationCode,
              last4Digits: digits,
              matchedGuestIndex: data.matchedGuestIndex || 1,
              authAt: Date.now()
            })
          );
        } catch (_) {}

        setStep("catalog");
      } else {
        if (res.status === 401) {
          setOtpError(data.error || "Os 4 dígitos não coincidem com o celular ou documento de nenhum hóspede cadastrado no flat.");
        } else if (res.status === 404) {
          setOtpError(data.error || `Nenhuma reserva ativa ou recente encontrada para o Flat ${flatNum}.`);
        } else {
          setOtpError(data.error || "Erro ao validar contexto do flat.");
        }
      }
    } catch {
      setOtpError("Falha na conexão ao validar os dígitos. Verifique sua internet.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Recarrega extrato silenciosamente após pagamento
  const refreshCurrentContextSilently = async () => {
    const code = reservation?.reservationCode || codeFromUrl;
    if (!code) return;
    try {
      const res = await fetch(`/api/minibar/reservation-context/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        applyContextResponse(data, code);
      }
    } catch (_) {}
  };

  // Inicialização Baseada na URL
  useEffect(() => {
    if (codeFromUrl) {
      loadContextByReservationCode(codeFromUrl);
    } else if (flatFromUrl) {
      let cachedAuth: any = null;
      try {
        const stored = sessionStorage.getItem(`gfm_minibar_auth_${flatFromUrl}`);
        if (stored) {
          cachedAuth = JSON.parse(stored);
        }
      } catch (_) {}

      if (cachedAuth?.last4Digits) {
        verifyFlatContextWithDigits(flatFromUrl, cachedAuth.last4Digits);
      } else if (cachedAuth?.reservationCode) {
        loadContextByReservationCode(cachedAuth.reservationCode);
      } else {
        setStep("otp_gate");
      }
    } else {
      setStep("manual_lookup");
    }
  }, [codeFromUrl, flatFromUrl]);

  // Leitura de ordem pendente (?ord=) ou retorno de pagamento Mercado Pago (?payment=success&orderId=)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const ord = searchParams.get("ord");
    const paymentParam = searchParams.get("payment");
    const returnedOrderId = searchParams.get("orderId") || ord;

    if (paymentParam === "success" && returnedOrderId) {
      fetch(`/api/minibar/orders/${encodeURIComponent(returnedOrderId)}/status`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.success && data.order) {
            setActiveOrder({
              orderId: data.order.id,
              totalAmount: data.order.totalAmount,
              paymentStatus: data.status
            });
            if (data.status === "pago" || data.status === "paid") {
              setPaymentStatus("pago");
              setStep("success");
              refreshCurrentContextSilently();
            }
          }
        })
        .catch(() => {});
    } else if (ord) {
      fetch(`/api/minibar/orders/${encodeURIComponent(ord)}/status`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.success && data.order) {
            if (!codeFromUrl && data.order.reservationCode) {
              loadContextByReservationCode(data.order.reservationCode);
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Limpeza de timers ao desmontar componente
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Polling de Pagamento (dá baixa automática no saldo pendente do extrato)
  const startPaymentPolling = (orderId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/minibar/orders/${encodeURIComponent(orderId)}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && (data.status === "pago" || data.status === "paid")) {
          setPaymentStatus("pago");
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          await refreshCurrentContextSilently();
          setStep("success");
        }
      } catch (_) {}
    }, 2500);
  };

  // Botão Canônico: "Se você já efetuou o check-out, clique aqui para informar"
  const handleConfirmGuestCheckout = async () => {
    if (confirmingCheckout) return;
    setConfirmingCheckout(true);
    setOrderError(null);
    setCheckoutBannerSuccess(null);

    try {
      const res = await fetch("/api/public/minibar/confirm-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: reservation?.flatNumber || flatFromUrl,
          reservationCode: reservation?.reservationCode || codeFromUrl,
          guestName: activeConsumerGuest.name
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsCheckedOut(true);
        setCheckoutTime(data.checkoutTime || "");
        if (data.statement) {
          applyStatementData(data.statement);
        }
        setCheckoutBannerSuccess(
          data.message || "Check-out confirmado com sucesso! O pagamento do frigobar já está liberado."
        );
      } else {
        setOrderError(data.error || "Não foi possível registrar o check-out agora.");
      }
    } catch {
      setOrderError("Erro de conexão ao informar o check-out. Tente novamente.");
    } finally {
      setConfirmingCheckout(false);
    }
  };

  // Controle de seleção de itens lançados para pagamento parcial por item
  const handleUpdateSelectedLaunchedItemQty = (item: PendingLaunchedItem, delta: number) => {
    setSelectedLaunchQtyMap((prev) => {
      const current = prev[item.itemKey] || 0;
      const next = Math.max(0, Math.min(item.quantity, current + delta));
      const copy = { ...prev };
      if (next === 0) {
        delete copy[item.itemKey];
      } else {
        copy[item.itemKey] = next;
      }
      return copy;
    });
  };

  const handleToggleLaunchedItemCheck = (item: PendingLaunchedItem) => {
    setSelectedLaunchQtyMap((prev) => {
      const current = prev[item.itemKey] || 0;
      const copy = { ...prev };
      if (current > 0) {
        delete copy[item.itemKey];
      } else {
        copy[item.itemKey] = item.quantity;
      }
      return copy;
    });
  };

  // Cálculo do valor e itens a pagar de acordo com o modo de pagamento parcial escolhido
  const paymentSelectionSummary = useMemo(() => {
    if (pendingBalance <= 0) {
      return {
        amountToPay: 0,
        itemsCount: 0,
        summaryLines: [] as { label: string; sublabel: string; subtotal: number }[],
        selectedLaunchItemsPayload: [] as any[]
      };
    }

    if (partialMode === "equal_split") {
      const parts = Math.max(2, Math.min(10, Number(splitParts) || 2));
      const splitVal = Number((pendingBalance / parts).toFixed(2));
      return {
        amountToPay: splitVal,
        itemsCount: 1,
        summaryLines: [
          {
            label: `Cota Parcial (1/${parts} do Consumo de Frigobar)`,
            sublabel: `Divisão igualitária de ${formatBRL(pendingBalance)} entre ${parts} hóspedes`,
            subtotal: splitVal
          }
        ],
        selectedLaunchItemsPayload: []
      };
    }

    if (partialMode === "custom_amount") {
      const normalized = Number(String(customPartialInput).replace(/\./g, "").replace(",", "."));
      const validVal =
        Number.isFinite(normalized) && normalized > 0
          ? Math.min(pendingBalance, Number(normalized.toFixed(2)))
          : 0;
      return {
        amountToPay: validVal,
        itemsCount: validVal > 0 ? 1 : 0,
        summaryLines:
          validVal > 0
            ? [
                {
                  label: `Pagamento Parcial de Frigobar (${activeConsumerGuest.firstName})`,
                  sublabel: `Abatimento parcial sobre o saldo de ${formatBRL(pendingBalance)}`,
                  subtotal: validVal
                }
              ]
            : [],
        selectedLaunchItemsPayload: []
      };
    }

    // Modo padrão: "items" (Pagar Tudo ou Selecionar Meus Itens Lançados)
    let sum = 0;
    let count = 0;
    const lines: { label: string; sublabel: string; subtotal: number }[] = [];
    const payload: any[] = [];

    for (const item of pendingLaunchedItems) {
      const selQty = selectedLaunchQtyMap[item.itemKey] || 0;
      if (selQty <= 0) continue;
      const lineTotal = Number((selQty * item.unitPrice).toFixed(2));
      sum += lineTotal;
      count += selQty;
      lines.push({
        label: `${selQty}x ${item.productName}`,
        sublabel: `Lançado em ${item.launchDateBr} • ${formatBRL(item.unitPrice)} un.`,
        subtotal: lineTotal
      });
      payload.push({
        itemKey: item.itemKey,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.productName,
        quantity: selQty,
        unitPrice: item.unitPrice,
        launchDateYmd: item.launchDateYmd,
        launchDateBr: item.launchDateBr
      });
    }

    return {
      amountToPay: Math.min(pendingBalance, Number(sum.toFixed(2))),
      itemsCount: count,
      summaryLines: lines,
      selectedLaunchItemsPayload: payload
    };
  }, [partialMode, pendingBalance, splitParts, customPartialInput, pendingLaunchedItems, selectedLaunchQtyMap, activeConsumerGuest.firstName]);

  // Submissão do Pagamento no Checkout
  const handleCheckoutSubmit = async () => {
    if (!isCheckedOut) {
      setOrderError("O pagamento fica disponível somente após efetuar o check-out.");
      return;
    }

    if (paymentSelectionSummary.amountToPay <= 0) {
      setOrderError("Selecione ao menos um item lançado ou informe um valor parcial válido para pagar.");
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    const docToSend =
      docChoice === "cadastrado"
        ? (activeConsumerGuest.cpf || reservation?.document || "").replace(/\D/g, "")
        : customDocument.replace(/\D/g, "");

    const emailToSend = (invoiceEmail || activeConsumerGuest.email || reservation?.email || "").trim();
    const phoneToSend = (invoicePhone || activeConsumerGuest.phone || reservation?.phone || "").trim();

    const isPayingAllItems =
      partialMode === "items" &&
      Math.abs(paymentSelectionSummary.amountToPay - pendingBalance) < 0.02;

    const orderPayload = {
      reservationCode: reservation?.reservationCode || codeFromUrl,
      flatNumber: reservation?.flatNumber || flatFromUrl,
      requireCheckout: true,
      partialMode: isPayingAllItems ? "full" : partialMode,
      selectedLaunchItems: paymentSelectionSummary.selectedLaunchItemsPayload,
      splitParts: partialMode === "equal_split" ? splitParts : undefined,
      customAmount: partialMode === "custom_amount" ? paymentSelectionSummary.amountToPay : undefined,
      paymentMethod,
      invoicePreference,
      document: docToSend,
      documentType: docToSend.length === 14 ? "cnpj" : "cpf",
      email: emailToSend,
      phone: phoneToSend,
      companyName: customCompanyName.trim(),
      consumerGuest: {
        index: activeConsumerGuest.index,
        guestId: activeConsumerGuest.guestId || null,
        name: activeConsumerGuest.name,
        phone: phoneToSend,
        email: emailToSend,
        document: docToSend
      }
    };

    try {
      const res = await fetch("/api/minibar/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderError(data.error || "Falha ao registrar pagamento de frigobar.");
        setIsSubmittingOrder(false);
        return;
      }

      setActiveOrder(data);

      if (data.isCourtesyOnly || data.totalAmount === 0 || data.paymentStatus === "pago") {
        setPaymentStatus("pago");
        await refreshCurrentContextSilently();
        setStep("success");
        setIsSubmittingOrder(false);
        return;
      }

      if (paymentMethod === "credit_card") {
        setPaymentStatus("pendente");
        setStep("payment");
        startPaymentPolling(data.orderId);
        if (data.initPoint) {
          window.open(data.initPoint, "_blank");
        }
      } else {
        setPaymentStatus("pendente");
        setStep("payment");
        startPaymentPolling(data.orderId);
      }
    } catch {
      setOrderError("Erro de comunicação ao processar pagamento. Tente novamente.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Copiar código PIX
  const handleCopyPix = () => {
    const pixCode = activeOrder?.pixCopiaECola || activeOrder?.pixQrCode;
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode).then(() => {
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. TELA: LOADING INICIAL
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-3xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center mb-4 text-cyan-400 shadow-xl shadow-cyan-950/50 animate-pulse">
          <Refrigerator className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white mb-2">Extrato do Frigobar</h1>
        <p className="text-xs text-slate-400 text-center max-w-xs mb-6">
          Carregando os lançamentos diários do seu flat...
        </p>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Autenticando...</span>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. TELA: PORTÃO OTP DE 4 DÍGITOS (Acesso por QR Code no Flat)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "otp_gate") {
    const flatDisplay = flatFromUrl || "do Flat";

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900/95 border-slate-800 shadow-2xl rounded-3xl backdrop-blur-xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-cyan-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
              <Refrigerator className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 text-xs font-bold mt-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>CorpFlats Soho Residence</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight pt-1">
              Frigobar Flat {flatDisplay}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed px-2">
              Digite os <strong>4 últimos dígitos do seu celular ou CPF</strong> para consultar o extrato diário do frigobar e realizar seu pagamento individual após o check-out.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex flex-col items-center justify-center space-y-3">
              <Label className="text-xs text-slate-300 font-semibold tracking-wide uppercase">
                4 Últimos Dígitos do Seu Celular ou CPF
              </Label>
              <InputOTP
                maxLength={4}
                value={otpValue}
                onChange={(val) => {
                  setOtpValue(val);
                  setOtpError(null);
                  if (val.length === 4) {
                    verifyFlatContextWithDigits(flatFromUrl, val);
                  }
                }}
                disabled={otpLoading}
                containerClassName="justify-center"
              >
                <InputOTPGroup className="gap-2.5">
                  <InputOTPSlot index={0} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                  <InputOTPSlot index={1} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                  <InputOTPSlot index={2} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                  <InputOTPSlot index={3} className="w-12 h-14 text-xl font-black bg-slate-800/90 border-slate-700 text-cyan-400 rounded-xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {otpError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{otpError}</span>
              </div>
            )}

            <Button
              onClick={() => verifyFlatContextWithDigits(flatFromUrl, otpValue)}
              disabled={otpValue.length !== 4 || otpLoading}
              className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-bold rounded-2xl shadow-lg shadow-cyan-600/20 text-sm transition-all flex items-center justify-center gap-2"
            >
              {otpLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Identificando Hóspede...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Ver Extrato do Frigobar</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>

          <div className="border-t border-slate-800/80 pt-4 text-center">
            <button
              onClick={() => setStep("manual_lookup")}
              className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>Não é o Flat {flatDisplay}? Digitar outro código de reserva</span>
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TELA: BUSCA MANUAL (Se entrou em /frigobar sem parâmetros de flat ou código)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "manual_lookup") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900/95 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto">
              <Refrigerator className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-white">Localizar Frigobar</h1>
            <p className="text-xs text-slate-400">
              Digite o número do seu Flat (ex: 204) ou o código da sua reserva (ex: RES-605) para acessar seu extrato de consumo.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300 font-semibold">Número do Flat ou Código da Reserva</Label>
              <Input
                placeholder="Ex: 204 ou RES-605"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="h-12 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl"
              />
            </div>

            {manualError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{manualError}</span>
              </div>
            )}

            <Button
              onClick={() => {
                const val = manualInput.trim();
                if (!val) {
                  setManualError("Por favor, digite o número do flat ou o código.");
                  return;
                }
                if (val.toUpperCase().startsWith("RES-") || val.length >= 6) {
                  loadContextByReservationCode(val);
                } else {
                  setLocation(`/frigobar/flat/${val}`);
                }
              }}
              className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl"
            >
              <span>Acessar Extrato do Frigobar</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TELA PRINCIPAL: EXTRATO DE CONSUMO POR DIA + PAGAMENTO APÓS CHECK-OUT
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "catalog") {
    const canPayNow = isCheckedOut && pendingBalance > 0 && paymentSelectionSummary.amountToPay > 0;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-36">
        {/* Topo / Header Mobile */}
        <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                <Refrigerator className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-sm sm:text-base font-black text-white leading-tight">
                    Frigobar Flat {reservation?.flatNumber}
                  </h1>
                  <Badge
                    variant="outline"
                    className={
                      isCheckedOut
                        ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/80 text-[10px] font-bold"
                        : "bg-cyan-950/60 text-cyan-300 border-cyan-800/80 text-[10px] font-bold"
                    }
                  >
                    {isCheckedOut ? `✓ Check-out ${checkoutTime ? `às ${checkoutTime}` : "Realizado"}` : activeConsumerGuest.role}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 truncate">
                  Hóspede: <strong className="text-white">{activeConsumerGuest.name}</strong> 👋
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {flatFromUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOtpValue("");
                    setStep("otp_gate");
                  }}
                  title="Trocar hóspede pelos 4 dígitos do telefone"
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 rounded-xl h-8 px-2 bg-cyan-950/40 border border-cyan-800/50"
                >
                  <Users className="w-3.5 h-3.5 mr-1" />
                  <span>Trocar</span>
                </Button>
              )}
              {reservation?.reservationCode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation(`/minha-reserva/${reservation.reservationCode}`)}
                  className="text-xs text-slate-400 hover:text-white rounded-xl h-8 px-2"
                >
                  <Home className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
          {/* ── Seletor de Hóspede do Flat (2+ Hóspedes: Pagamento e NF Separados) ── */}
          <Card className="bg-slate-900/90 border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Quem vai pagar / emitir a Nota Fiscal? (Individual ou dividido)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCompanionModal((v) => !v)}
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Outro hóspede</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {reservationGuests.map((g) => {
                const isSelected = g.index === selectedGuestIndex;
                return (
                  <button
                    key={g.index}
                    type="button"
                    onClick={() => handleSelectConsumerGuest(g)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                      isSelected
                        ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                        : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <div className="text-left">
                      <span className="block leading-tight">{g.name}</span>
                      <span className={`text-[10px] block font-medium ${isSelected ? "text-slate-900" : "text-slate-400"}`}>
                        {g.index === 1 ? "1º Hóspede" : `${g.index}º Hóspede`}
                        {g.phone ? ` • final ${g.phone.replace(/\D/g, "").slice(-4)}` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {showAddCompanionModal && (
              <div className="p-3.5 bg-slate-950/90 border border-cyan-500/40 rounded-xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300">
                    Identificar 2º Hóspede / Acompanhante (para pagar e receber NF separado)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCompanionModal(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Fechar
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Input
                    placeholder="Seu Nome Completo *"
                    value={companionForm.name}
                    onChange={(e) => setCompanionForm((p) => ({ ...p, name: e.target.value }))}
                    className="h-10 bg-slate-900 border-slate-700 text-xs text-white rounded-xl"
                  />
                  <Input
                    placeholder="Seu WhatsApp (com DDD)"
                    value={companionForm.phone}
                    onChange={(e) => setCompanionForm((p) => ({ ...p, phone: e.target.value }))}
                    className="h-10 bg-slate-900 border-slate-700 text-xs text-white rounded-xl"
                  />
                  <Input
                    type="email"
                    placeholder="Seu E-mail (para Nota Fiscal)"
                    value={companionForm.email}
                    onChange={(e) => setCompanionForm((p) => ({ ...p, email: e.target.value }))}
                    className="h-10 bg-slate-900 border-slate-700 text-xs text-white rounded-xl"
                  />
                  <Input
                    placeholder="Seu CPF ou CNPJ"
                    value={companionForm.cpf}
                    onChange={(e) => setCompanionForm((p) => ({ ...p, cpf: formatDocMask(e.target.value) }))}
                    className="h-10 bg-slate-900 border-slate-700 text-xs text-white rounded-xl"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleConfirmCompanionGuest}
                  disabled={!companionForm.name.trim()}
                  className="w-full h-10 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Confirmar e Pagar no Meu Nome
                </Button>
              </div>
            )}
          </Card>

          {/* ── Aviso de Como Funciona o Novo Modo Operacional + Desacoplamento Financeiro ── */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed space-y-1">
              <p className="font-bold text-amber-300">Como funciona o Frigobar:</p>
              <p>
                Nossa equipe de reposição passa diariamente no flat e lança os itens consumidos no seu extrato abaixo. <strong>O pagamento é liberado após o check-out</strong> e não pode ser faturado junto com a diária de hospedagem.
              </p>
            </div>
          </div>

          {checkoutBannerSuccess && (
            <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{checkoutBannerSuccess}</span>
            </div>
          )}

          {orderError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{orderError}</span>
            </div>
          )}

          {/* ── Card de Status de Check-out e Trava de Pagamento Pré-Checkout ── */}
          {!isCheckedOut ? (
            <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border-2 border-amber-500/40 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm sm:text-base font-black text-amber-300">
                    Pagamento disponível após efetuar o check-out
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Durante a estadia você pode acompanhar abaixo todos os itens lançados diariamente pela repositora. Ao encerrar sua estadia, informe seu check-out para liberar o pagamento imediato via PIX ou Cartão.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleConfirmGuestCheckout}
                disabled={confirmingCheckout}
                className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 transition-all"
              >
                {confirmingCheckout ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Registrando Check-out...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>Se você já efetuou o check-out, clique aqui para informar</span>
                  </>
                )}
              </Button>
            </Card>
          ) : (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-emerald-300">
                    Check-out Confirmado {checkoutTime ? `às ${checkoutTime}` : ""} — Pagamento Liberado!
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Você pode quitar o saldo total ou pagar apenas a sua parte individual abaixo.
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white text-[10px] shrink-0">Liberado</Badge>
            </div>
          )}

          {/* ── Resumo Financeiro da Estadia ── */}
          <div className="grid grid-cols-3 gap-2.5">
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Lançado</span>
              <strong className="text-sm sm:text-base font-black text-white mt-0.5 block">
                {formatBRL(totalLaunchedAmount)}
              </strong>
            </Card>
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-emerald-400 uppercase block">Já Pago</span>
              <strong className="text-sm sm:text-base font-black text-emerald-400 mt-0.5 block">
                {formatBRL(totalPaidAmount)}
              </strong>
            </Card>
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-amber-400 uppercase block">Saldo Pendente</span>
              <strong className="text-sm sm:text-base font-black text-amber-300 mt-0.5 block">
                {formatBRL(pendingBalance)}
              </strong>
            </Card>
          </div>

          {/* ── Cardápio Digital Bonitinho do Frigobar (Aberto por Padrão para Consulta a Qualquer Momento) ── */}
          <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <button
              type="button"
              onClick={() => setShowReferenceCatalog((v) => !v)}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-800/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-black text-white">
                      Cardápio Digital do Frigobar
                    </h2>
                    <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px]">
                      {catalog.length} itens no flat
                    </Badge>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Consulte a qualquer momento os produtos disponíveis, quantidades padrão e valores
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 shrink-0">
                <span className="hidden sm:inline">{showReferenceCatalog ? "Recolher" : "Ver Cardápio"}</span>
                {showReferenceCatalog ? (
                  <ChevronUp className="w-4 h-4 text-cyan-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-cyan-400" />
                )}
              </div>
            </button>

            {showReferenceCatalog && (
              <div className="p-4 sm:p-5 pt-0 border-t border-slate-800/80 space-y-4">
                {/* Pílulas de Filtro de Categoria do Cardápio */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-3 no-scrollbar">
                  {[
                    { id: "todos", label: "✨ Todos" },
                    { id: "bebidas", label: "💧 Águas & Bebidas" },
                    { id: "cervejas", label: "🍺 Cervejas" },
                    { id: "snacks", label: "🍫 Snacks & Doces" },
                    { id: "cortesias", label: "☕ Cafés & Cortesias" }
                  ].map((cat) => {
                    const active = menuCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setMenuCategoryFilter(cat.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all ${
                          active
                            ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20"
                            : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Grade Visual do Cardápio */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catalog
                    .filter((prod) => {
                      if (menuCategoryFilter === "todos") return true;
                      const cat = String(prod.category || "").toLowerCase();
                      const name = String(prod.name || "").toLowerCase();
                      if (menuCategoryFilter === "cortesias") {
                        return Boolean(prod.isCourtesy) || cat.includes("cafe") || name.includes("cápsula") || name.includes("capsula");
                      }
                      if (menuCategoryFilter === "cervejas") {
                        return cat.includes("cerveja") || cat.includes("alcool") || name.includes("heineken") || name.includes("stella") || name.includes("corona") || name.includes("cerveja");
                      }
                      if (menuCategoryFilter === "snacks") {
                        return cat.includes("snack") || cat.includes("doce") || cat.includes("comida") || cat.includes("bomboniere") || name.includes("chocolate") || name.includes("batata") || name.includes("castanha") || name.includes("amendoim") || name.includes("kitkat") || name.includes("pringles");
                      }
                      if (menuCategoryFilter === "bebidas") {
                        return (
                          !prod.isCourtesy &&
                          !cat.includes("cerveja") &&
                          !cat.includes("snack") &&
                          !cat.includes("cafe") &&
                          (cat.includes("agua") || cat.includes("bebida") || cat.includes("refrigerante") || cat.includes("suco") || cat.includes("energetico") || true)
                        );
                      }
                      return true;
                    })
                    .map((prod) => {
                      const nominalStandard = defaultStock[prod.id] ?? prod.defaultQuantity ?? 0;
                      const isCourtesyItem = Boolean(prod.isCourtesy);
                      const isCourtesyFree = Boolean(prod.isCourtesy && !courtesyConsumed);
                      return (
                        <div
                          key={prod.id}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                            isCourtesyItem
                              ? "bg-gradient-to-br from-emerald-950/30 via-slate-950/90 to-slate-950/90 border-emerald-500/30 hover:border-emerald-500/50"
                              : "bg-slate-950/85 border-slate-800/90 hover:border-cyan-500/40"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden shadow-inner ${
                                isCourtesyItem
                                  ? "bg-emerald-950/60 border-emerald-700/50"
                                  : "bg-slate-900 border-slate-700/80"
                              }`}
                            >
                              {prod.imageUrl ? (
                                <img
                                  src={prod.imageUrl}
                                  alt={prod.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : prod.category === "cafe" || prod.category === "cafe_capsulas" || isCourtesyItem ? (
                                <Coffee className="w-6 h-6 text-amber-400" />
                              ) : (
                                <Refrigerator className="w-6 h-6 text-cyan-400" />
                              )}
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-black text-white leading-tight">
                                  {prod.name}
                                </span>
                                {isCourtesyItem && (
                                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                                    🎁 Cortesia
                                  </Badge>
                                )}
                              </div>
                              {prod.description && (
                                <p className="text-[11px] text-slate-400 line-clamp-1">
                                  {prod.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                                  Padrão no flat: <strong className="text-white ml-1">{nominalStandard} un.</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isCourtesyFree ? (
                              <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-center">
                                <span className="text-[10px] font-bold text-emerald-300 block uppercase">
                                  1ª un. Grátis
                                </span>
                                <strong className="text-xs font-black text-emerald-400">
                                  R$ 0,00
                                </strong>
                              </div>
                            ) : (
                              <div className="px-2.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-right">
                                <span className="text-[9px] font-bold text-slate-400 block uppercase">
                                  Valor un.
                                </span>
                                <strong className="text-sm font-black text-cyan-400 font-mono">
                                  {formatBRL(prod.price)}
                                </strong>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>

          {/* ── Extrato de Consumo Lançado por Dia (Apenas Data DD/MM/AAAA, sem hora) ── */}
          <Card className="bg-slate-900 border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-black text-white">
                  Extrato de Consumo por Dia
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshCurrentContextSilently}
                className="h-7 px-2 text-[11px] text-cyan-400 hover:text-cyan-300 rounded-lg"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                <span>Atualizar</span>
              </Button>
            </div>

            {dailyLaunches.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-2">
                <Refrigerator className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-300">
                  Nenhum consumo lançado até o momento nesta estadia.
                </p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Quando a repositora registrar os itens consumidos na passagem diária pelo flat, eles aparecerão aqui separados pelo dia do lançamento.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {dailyLaunches.map((group) => (
                  <div
                    key={group.dateYmd}
                    className="rounded-2xl bg-slate-950/80 border border-slate-800 overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="bg-cyan-950/70 text-cyan-300 border-cyan-800 text-[11px] font-bold"
                        >
                          📅 Dia {group.dateBr}
                        </Badge>
                      </div>
                      <span className="text-xs font-black text-slate-200">
                        {formatBRL(group.totalDayAmount)}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/60 px-3.5 py-1">
                      {group.items.map((item, idx) => {
                        const isPaid = item.paymentStatus === "pago";
                        return (
                          <div
                            key={`${item.orderId}-${item.productId}-${idx}`}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-white">
                                  {item.quantity}x {item.productName}
                                </span>
                                {item.isCourtesy ? (
                                  <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px]">
                                    Cortesia
                                  </Badge>
                                ) : isPaid ? (
                                  <Badge className="bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 text-[9px]">
                                    ✓ Pago
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px]">
                                    A pagar
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block">
                                Lançado em {item.launchDateBr} • {item.isCourtesy ? "Gratuito" : `${formatBRL(item.unitPrice)} un.`}
                              </span>
                            </div>

                            <strong className={isPaid ? "text-emerald-400 font-mono" : "text-cyan-400 font-mono"}>
                              {item.isCourtesy ? "R$ 0,00" : formatBRL(item.totalPrice)}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Opções de Pagamento Total ou Parcial / Individual (Quando há Saldo Pendente) ── */}
          {pendingBalance > 0 && (
            <Card className="bg-slate-900 border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-cyan-400" />
                  <span>Como deseja pagar sua conta? (Total ou Parcial)</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Se houver mais de um hóspede no flat, cada pessoa pode selecionar seus próprios itens, dividir igualmente ou digitar o valor que deseja pagar agora:
                </p>
              </div>

              {/* Abas dos 3 Modos de Pagamento Parcial */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPartialMode("items")}
                  className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                    partialMode === "items"
                      ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  Por Itens / Tudo
                </button>
                <button
                  type="button"
                  onClick={() => setPartialMode("equal_split")}
                  className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                    partialMode === "equal_split"
                      ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  Dividir Partes Iguais
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPartialMode("custom_amount");
                    if (!customPartialInput) {
                      setCustomPartialInput((pendingBalance / 2).toFixed(2).replace(".", ","));
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                    partialMode === "custom_amount"
                      ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  Digitar Valor (R$)
                </button>
              </div>

              {/* Modo 1: Selecionar itens específicos lançados (ou pagar tudo) */}
              {partialMode === "items" && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Marque ou ajuste a quantidade dos itens que você consumiu:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allMap: Record<string, number> = {};
                        for (const it of pendingLaunchedItems) {
                          allMap[it.itemKey] = it.quantity;
                        }
                        setSelectedLaunchQtyMap(allMap);
                      }}
                      className="text-cyan-400 hover:underline font-bold"
                    >
                      Selecionar todos
                    </button>
                  </div>

                  <div className="space-y-2">
                    {pendingLaunchedItems.map((item) => {
                      const selQty = selectedLaunchQtyMap[item.itemKey] || 0;
                      const isSelected = selQty > 0;
                      return (
                        <div
                          key={item.itemKey}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                            isSelected
                              ? "bg-slate-950/90 border-cyan-500/60"
                              : "bg-slate-950/40 border-slate-800 opacity-70"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleLaunchedItemCheck(item)}
                            className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-cyan-500 border-cyan-400 text-slate-950"
                                  : "border-slate-600 bg-slate-900"
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white block truncate">
                                {item.productName}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                Dia {item.launchDateBr} • {formatBRL(item.unitPrice)} un. (Total lançado: {item.quantity}x)
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleUpdateSelectedLaunchedItemQty(item, -1)}
                              disabled={selQty <= 0}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white flex items-center justify-center border border-slate-700"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center text-xs font-black text-cyan-400">
                              {selQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateSelectedLaunchedItemQty(item, 1)}
                              disabled={selQty >= item.quantity}
                              className="w-7 h-7 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modo 2: Dividir em partes iguais */}
              {partialMode === "equal_split" && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <Label className="text-xs text-slate-300 font-bold block">
                    Dividir o saldo pendente ({formatBRL(pendingBalance)}) igualmente entre quantas pessoas?
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSplitParts(n)}
                        className={`py-2.5 rounded-xl font-black text-xs border transition-all ${
                          splitParts === n
                            ? "bg-cyan-600 text-slate-950 border-cyan-400"
                            : "bg-slate-900 text-slate-300 border-slate-700"
                        }`}
                      >
                        ÷ {n} pessoas
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Sua parte individual (1/{splitParts}):</span>
                    <strong className="text-base font-black text-cyan-400">
                      {formatBRL(paymentSelectionSummary.amountToPay)}
                    </strong>
                  </div>
                </div>
              )}

              {/* Modo 3: Digitar valor parcial customizado */}
              {partialMode === "custom_amount" && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <Label className="text-xs text-slate-300 font-bold block">
                    Digite o valor parcial que deseja pagar agora (até {formatBRL(pendingBalance)}):
                  </Label>
                  <Input
                    placeholder="Ex: 25,00"
                    value={customPartialInput}
                    onChange={(e) => setCustomPartialInput(e.target.value)}
                    className="h-11 bg-slate-900 border-slate-700 text-white font-bold text-sm rounded-xl"
                  />
                  <p className="text-[11px] text-slate-400">
                    O valor pago será abatido imediatamente do saldo pendente do flat, e o restante ficará disponível para os demais hóspedes.
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* ── Histórico de Pagamentos já Realizados na Estadia ── */}
          {paidOrdersHistory.length > 0 && (
            <Card className="bg-slate-900/60 border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">
                    Pagamentos realizados nesta estadia
                  </span>
                </div>
                <Badge variant="outline" className="bg-emerald-950/60 text-emerald-300 border-emerald-800 text-[10px]">
                  ✓ Quitado
                </Badge>
              </div>
              <div className="space-y-1.5">
                {paidOrdersHistory.map((ord: any) => (
                  <div key={ord.id} className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="block">
                        Pago por <strong className="text-white">{ord.guestName}</strong> ({formatBRL(ord.totalAmount)})
                      </span>
                      {ord.paidAt && (
                        <span className="text-[10px] text-slate-500">
                          Pedido #{ord.id}
                        </span>
                      )}
                    </div>
                    {ord.invoiceFileUrl ? (
                      <a
                        href={ord.invoiceFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline font-bold text-xs"
                      >
                        Baixar NF
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">NF em emissão</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </main>

        {/* ── Barra Fixa Inferior (Bloqueada antes do Check-out / Liberada após Check-out) ── */}
        <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-4 z-40 shadow-2xl">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">
                {!isCheckedOut
                  ? "🔒 Pagamento após o check-out"
                  : pendingBalance <= 0
                  ? "Tudo quitado nesta estadia"
                  : `Valor selecionado (${activeConsumerGuest.firstName})`}
              </span>
              <div className="text-lg sm:text-xl font-black text-cyan-400">
                {formatBRL(pendingBalance > 0 ? paymentSelectionSummary.amountToPay : 0)}
              </div>
            </div>

            {!isCheckedOut ? (
              <Button
                type="button"
                disabled
                className="h-12 px-4 sm:px-5 rounded-2xl font-bold text-xs bg-slate-800 text-amber-300/90 border border-amber-500/30 cursor-not-allowed flex items-center gap-2 opacity-95"
              >
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Disponível após Check-out</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setStep("checkout")}
                disabled={!canPayNow}
                className={`h-12 px-6 rounded-2xl font-bold text-xs sm:text-sm shadow-xl flex items-center gap-2 transition-all ${
                  canPayNow
                    ? "bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-cyan-600/30 active:scale-[0.98]"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                <span>Pagar Agora</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. TELA: CHECKOUT & DADOS FISCAIS
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "checkout") {
    const activePhoneDisplay = invoicePhone || activeConsumerGuest.phone || reservation?.phone || "";
    const activeEmailDisplay = invoiceEmail || activeConsumerGuest.email || reservation?.email || "";
    const checkoutAmount = paymentSelectionSummary.amountToPay;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
        <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("catalog")}
              className="text-xs text-slate-400 hover:text-white rounded-xl h-9 px-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span>Voltar ao Extrato</span>
            </Button>
            <span className="text-xs font-bold text-slate-300">
              Pagamento • {activeConsumerGuest.firstName}
            </span>
          </div>
        </header>

        <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
          {/* Resumo do Pagamento */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-cyan-400" />
                <span>Resumo do Pagamento — Flat {reservation?.flatNumber}</span>
              </h2>
              <Badge variant="outline" className="bg-cyan-950/60 text-cyan-300 border-cyan-800 text-[10px]">
                {activeConsumerGuest.name}
              </Badge>
            </div>

            <div className="divide-y divide-slate-800 text-xs">
              {paymentSelectionSummary.summaryLines.map((line, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-200">{line.label}</span>
                    <span className="text-[11px] text-slate-400 block">{line.sublabel}</span>
                  </div>
                  <strong className="text-cyan-400 text-sm">
                    {formatBRL(line.subtotal)}
                  </strong>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm">
              <span className="font-bold text-slate-300">Total a Pagar Agora</span>
              <span className="text-lg font-black text-cyan-400">{formatBRL(checkoutAmount)}</span>
            </div>
          </Card>

          {/* Opções de Emissão de Nota Fiscal (Mandatório F17) */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Preferência de Descrição na Nota Fiscal</span>
              </h2>
              <p className="text-xs text-slate-400">
                Selecione como os itens devem constar na sua Nota Fiscal:
              </p>
            </div>

            <RadioGroup
              value={invoicePreference}
              onValueChange={(val) => setInvoicePreference(val as InvoicePreference)}
              className="space-y-2.5"
            >
              <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                invoicePreference === "detailed"
                  ? "bg-cyan-950/40 border-cyan-500/60 text-white"
                  : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/70"
              }`}>
                <RadioGroupItem value="detailed" id="opt-detailed" className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block">1. Discriminar todos os itens consumidos</span>
                  <span className="text-[11px] text-slate-400 block">
                    Lista detalhada de cada item consumido.
                  </span>
                </div>
              </label>

              <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                invoicePreference === "water"
                  ? "bg-cyan-950/40 border-cyan-500/60 text-white"
                  : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/70"
              }`}>
                <RadioGroupItem value="water" id="opt-water" className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block">2. Lançar tudo como "Água"</span>
                  <span className="text-[11px] text-slate-400 block">
                    Ideal para reembolso corporativo com restrição de itens.
                  </span>
                </div>
              </label>

              <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                invoicePreference === "minibar_consumption"
                  ? "bg-cyan-950/40 border-cyan-500/60 text-white"
                  : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/70"
              }`}>
                <RadioGroupItem value="minibar_consumption" id="opt-minibar" className="mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block">3. Lançar tudo como "Consumo de Frigobar"</span>
                  <span className="text-[11px] text-slate-400 block">
                    Descrição consolidada padrão de conveniência.
                  </span>
                </div>
              </label>
            </RadioGroup>
          </Card>

          {/* Dados Fiscais: Documento (CPF / CNPJ) e Envio Automático para WhatsApp + E-mail Cadastrados */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Documento & Envio Automático da Nota Fiscal</span>
            </h2>

            <div className="space-y-3">
              {activeConsumerGuest.cpf && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDocChoice("cadastrado")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      docChoice === "cadastrado"
                        ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Meu CPF ({formatDocMask(activeConsumerGuest.cpf)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocChoice("personalizado")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      docChoice === "personalizado"
                        ? "bg-cyan-950/60 border-cyan-500 text-cyan-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Outro CPF ou CNPJ
                  </button>
                </div>
              )}

              {(docChoice === "personalizado" || !activeConsumerGuest.cpf) && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-300 font-semibold">CPF ou CNPJ na Nota</Label>
                    <Input
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      value={customDocument}
                      onChange={(e) => setCustomDocument(formatDocMask(e.target.value))}
                      className="h-11 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                    />
                  </div>

                  {customDocument.replace(/\D/g, "").length === 14 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300 font-semibold">Razão Social (Opcional)</Label>
                      <Input
                        placeholder="Nome da empresa no CNPJ"
                        value={customCompanyName}
                        onChange={(e) => setCustomCompanyName(e.target.value)}
                        className="h-11 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Envio Automático para seu Cadastro</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingContact((v) => !v)}
                    className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingContact ? "Ocultar edição" : "Alterar contato"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 block">WhatsApp da NF:</span>
                      <strong className="text-slate-200 truncate block">
                        {activePhoneDisplay || "Não cadastrado"}
                      </strong>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 block">E-mail da NF:</span>
                      <strong className="text-slate-200 truncate block">
                        {activeEmailDisplay || "Apenas via WhatsApp"}
                      </strong>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400">
                  Assim que a Nota Fiscal for emitida, nosso sistema envia automaticamente para o seu <strong>WhatsApp</strong> e <strong>E-mail</strong> cadastrados com monitoramento de entrega.
                </p>

                {isEditingContact && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300 font-semibold">WhatsApp para Recebimento</Label>
                      <Input
                        placeholder="(11) 99999-9999"
                        value={invoicePhone}
                        onChange={(e) => setInvoicePhone(e.target.value)}
                        className="h-10 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-300 font-semibold">E-mail para Recebimento</Label>
                      <Input
                        type="email"
                        placeholder="seuemail@exemplo.com"
                        value={invoiceEmail}
                        onChange={(e) => setInvoiceEmail(e.target.value)}
                        className="h-10 bg-slate-800 border-slate-700 text-white rounded-xl text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Seleção do Meio de Pagamento */}
          {checkoutAmount > 0 && (
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cyan-400" />
                <span>Forma de Pagamento</span>
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pix")}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "pix"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  <QrCode className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold">PIX (Banco Inter)</span>
                  <span className="text-[10px] text-emerald-400 font-medium">Confirmação Imediata</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("credit_card")}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === "credit_card"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-bold">Cartão de Crédito</span>
                  <span className="text-[10px] text-slate-400 font-medium">Consumo de Frigobar</span>
                </button>
              </div>
            </Card>
          )}

          {orderError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{orderError}</span>
            </div>
          )}

          {/* Botão de Finalização */}
          <Button
            onClick={handleCheckoutSubmit}
            disabled={isSubmittingOrder}
            className="w-full h-14 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-2xl text-sm shadow-xl shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            {isSubmittingOrder ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Processando Pagamento...</span>
              </>
            ) : paymentMethod === "pix" ? (
              <>
                <QrCode className="w-5 h-5" />
                <span>Gerar QR Code PIX ({formatBRL(checkoutAmount)})</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                <span>Pagar com Cartão ({formatBRL(checkoutAmount)})</span>
              </>
            )}
          </Button>
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. TELA: MODAL & FLUXO DE PAGAMENTO (PIX & CARTÃO)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "payment") {
    const pixCode = activeOrder?.pixCopiaECola || activeOrder?.pixQrCode || "";
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(pixCode)}`;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 pb-12">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-7 space-y-5 text-center">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" />
              <span>Aguardando Pagamento</span>
            </div>
            <h1 className="text-xl font-black text-white pt-1">
              Total: {formatBRL(activeOrder?.totalAmount || paymentSelectionSummary.amountToPay)}
            </h1>
            <p className="text-xs text-slate-400">
              Consumo de Frigobar — Flat {reservation?.flatNumber} ({activeConsumerGuest.name})
            </p>
          </div>

          {paymentMethod === "pix" ? (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-2xl w-56 h-56 mx-auto shadow-inner flex items-center justify-center">
                <img
                  src={qrImageUrl}
                  alt="QR Code PIX Banco Inter"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleCopyPix}
                  className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
                >
                  {copiedPix ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-950" />
                      <span>Código PIX Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Código PIX (Copia e Cola)</span>
                    </>
                  )}
                </Button>

                <p className="text-[11px] text-slate-400">
                  Abra o aplicativo do seu banco e escolha a opção <strong>PIX Copia e Cola</strong>.
                </p>
              </div>

              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-center gap-2 text-xs text-cyan-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Aguardando confirmação bancária em tempo real...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-6 bg-slate-800/60 rounded-2xl border border-slate-700 text-center space-y-3">
                <CreditCard className="w-10 h-10 text-indigo-400 mx-auto" />
                <p className="text-xs text-slate-300">
                  Ambiente seguro do Mercado Pago (<strong>Consumo de Frigobar - Flat {reservation?.flatNumber}</strong>).
                </p>
                {activeOrder?.initPoint && (
                  <Button
                    onClick={() => window.open(activeOrder.initPoint, "_blank")}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                  >
                    <span>Abrir Pagamento Cartão (Mercado Pago)</span>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-center gap-2 text-xs text-indigo-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Aguardando aprovação do cartão...</span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
                setStep("catalog");
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar e Voltar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. TELA: CONFIRMAÇÃO & SUCESSO
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Pagamento Confirmado! 🎉
            </h1>
            <p className="text-xs text-slate-300">
              O pagamento referente ao Flat {reservation?.flatNumber} ({activeConsumerGuest.name}) foi confirmado e baixado automaticamente no extrato!
            </p>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80 text-left text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span>Pedido:</span>
              <strong className="text-slate-200">{activeOrder?.orderId || "ORD-MB-SUCESSO"}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Hóspede:</span>
              <strong className="text-slate-200">{activeConsumerGuest.name}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Valor Pago:</span>
              <strong className="text-emerald-400">
                {formatBRL(activeOrder?.totalAmount || paymentSelectionSummary.amountToPay)}
              </strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Nota Fiscal:</span>
              <strong className="text-slate-200">
                {invoicePreference === "water"
                  ? "Lançado como 'Água'"
                  : invoicePreference === "minibar_consumption"
                  ? "Consumo de Frigobar"
                  : "Itens Discriminados"}
              </strong>
            </div>
            {(invoicePhone || activeConsumerGuest.phone) && (
              <div className="flex items-center justify-between text-slate-400">
                <span>WhatsApp da NF:</span>
                <strong className="text-emerald-400 truncate max-w-[180px]">
                  {invoicePhone || activeConsumerGuest.phone}
                </strong>
              </div>
            )}
            {(invoiceEmail || activeConsumerGuest.email) && (
              <div className="flex items-center justify-between text-slate-400">
                <span>E-mail da NF:</span>
                <strong className="text-cyan-400 truncate max-w-[180px]">
                  {invoiceEmail || activeConsumerGuest.email}
                </strong>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 leading-relaxed space-y-1">
            <p>
              Sua Nota Fiscal será enviada automaticamente para o seu <strong>WhatsApp</strong> e <strong>E-mail</strong> cadastrados assim que emitida pela Anserve, além de ficar disponível na sua Área do Hóspede.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Button
              onClick={async () => {
                await refreshCurrentContextSilently();
                setStep("catalog");
              }}
              className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-2xl text-xs sm:text-sm"
            >
              <span>Voltar ao Extrato do Frigobar</span>
            </Button>
            {reservation?.reservationCode && (
              <Button
                variant="ghost"
                onClick={() => setLocation(`/minha-reserva/${reservation.reservationCode}`)}
                className="w-full h-10 text-slate-400 hover:text-white rounded-xl text-xs"
              >
                <span>Voltar à Minha Reserva</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
