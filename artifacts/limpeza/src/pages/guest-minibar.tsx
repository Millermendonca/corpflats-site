import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { CorpFlatsIcon, CorpFlatsWordmark } from "@/components/brand-logo";
import {
  Refrigerator,
  Plus,
  Minus,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  QrCode,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Lock,
  Coffee,
  CheckCircle,
  ExternalLink,
  Receipt,
  FileText,
  Home,
  AlertCircle,
  Clock,
  Users,
  UserCheck,
  UserPlus,
  Edit3,
  ChevronDown,
  ChevronUp,
  Gift
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
  remainingQuantity?: number;
  unitPrice: number;
  totalPrice: number;
  remainingTotalPrice?: number;
  isCourtesy?: boolean;
  allocation?: {
    allocations: Record<number, number>;
    unassignedQty: number;
    isExplicitlyMarked?: boolean;
  };
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
    remainingQuantity?: number;
    unitPrice: number;
    totalPrice: number;
    remainingTotalPrice?: number;
    isCourtesy?: boolean;
    paymentStatus: string;
    launchedByName?: string;
    allocation?: {
      allocations: Record<number, number>;
      unassignedQty: number;
      isExplicitlyMarked?: boolean;
    };
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
  document?: string;
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
export type SplitMode = "titular" | "half_and_half" | "by_item";
export type PartialPaymentMode = "configured_split" | "items" | "equal_split" | "custom_amount";

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

function isGuestPlaceholderName(name?: string): boolean {
  const trimmed = (name || "").trim();
  return !trimmed || /^h[óo]spede\s*\d*/i.test(trimmed) || /^\d+º\s*h[óo]spede/i.test(trimmed);
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
  const [, setIsCheckedOut] = useState<boolean>(false);
  const [hasFinalCheckoutInspection, setHasFinalCheckoutInspection] = useState<boolean>(false);
  const [, setCheckoutTime] = useState<string>("");
  const [dailyLaunches, setDailyLaunches] = useState<DailyLaunchGroup[]>([]);
  const [consumedCourtesyItems, setConsumedCourtesyItems] = useState<any[]>([]);
  const [pendingLaunchedItems, setPendingLaunchedItems] = useState<PendingLaunchedItem[]>([]);
  const [pendingBalance, setPendingBalance] = useState<number>(0);
  const [totalLaunchedAmount, setTotalLaunchedAmount] = useState<number>(0);
  const [, setTotalPaidAmount] = useState<number>(0);
  // Cardápio Digital recolhido por padrão e posicionado abaixo do extrato
  const [showReferenceCatalog, setShowReferenceCatalog] = useState<boolean>(false);
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>("todos");

  // Persistência em Tempo Real da Divisão e Atribuição de Consumo
  const [splitMode, setSplitMode] = useState<SplitMode>("titular");
  const [itemAssignments, setItemAssignments] = useState<Record<string, Record<number, number>>>({});
  const [splitBreakdown, setSplitBreakdown] = useState<any | null>(null);
  const [, setIsSavingSplit] = useState<boolean>(false);
  const [, setSplitSavedPulse] = useState<boolean>(false);
  const [expandedUnitItemKey, setExpandedUnitItemKey] = useState<string | null>(null);

  // Pagamento Parcial / Individual
  const [partialMode, setPartialMode] = useState<PartialPaymentMode>("configured_split");
  const [selectedLaunchQtyMap, setSelectedLaunchQtyMap] = useState<Record<string, number>>({});
  const [splitParts] = useState<number>(2);
  const [customPartialInput] = useState<string>("");

  // Hóspedes do Flat (puxados automaticamente da reserva/FNRH + edição/adição inline na divisão)
  const [reservationGuests, setReservationGuests] = useState<FlatGuestSlot[]>([]);
  const [selectedGuestIndex, setSelectedGuestIndex] = useState<number>(1);
  const [editingGuestIndex, setEditingGuestIndex] = useState<number | null>(null);
  const [isAddingNewGuest, setIsAddingNewGuest] = useState<boolean>(false);
  const [guestEditForm, setGuestEditForm] = useState({
    index: 2,
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
  const [, setPaymentStatus] = useState<"pendente" | "pago" | "falha">("pendente");

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cota configurada para o hóspede selecionado de acordo com a divisão salva na reserva
  const activeGuestConfiguredShare = useMemo(() => {
    const shares: any[] = Array.isArray(splitBreakdown?.shares) ? splitBreakdown.shares : [];
    if (splitMode === "titular") {
      return shares.find((s) => Number(s.guestIndex) === 1) || shares[0] || null;
    }
    const found = shares.find((s) => Number(s.guestIndex) === Number(selectedGuestIndex));
    if (found && Number(found.amount || 0) > 0) return found;
    const firstPending = shares.find((s) => Number(s.amount || 0) > 0);
    if (firstPending) return firstPending;
    return found || shares[0] || null;
  }, [splitBreakdown, selectedGuestIndex, splitMode]);

  // Hóspede consumidor ativo selecionado (para pagamento / emissão da NF)
  const activeConsumerGuest = useMemo<FlatGuestSlot>(() => {
    const targetIdx =
      splitMode === "titular"
        ? 1
        : Number(activeGuestConfiguredShare?.guestIndex) || selectedGuestIndex || 1;
    const found =
      reservationGuests.find((g) => g.index === targetIdx) ||
      reservationGuests.find((g) => g.index === selectedGuestIndex) ||
      reservationGuests[0];
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
  }, [reservationGuests, selectedGuestIndex, splitMode, activeGuestConfiguredShare, reservation]);

  // Troca de hóspede consumidor no flat (atualiza CPF, WhatsApp e E-mail automaticamente)
  const handleSelectConsumerGuest = (guestSlot: FlatGuestSlot) => {
    setSelectedGuestIndex(guestSlot.index);
    setIsEditingContact(false);
    const gDoc = (guestSlot.cpf || guestSlot.document || "").replace(/\D/g, "");
    setInvoiceEmail(guestSlot.email || "");
    setInvoicePhone(guestSlot.phone || "");
    if (gDoc.length >= 11) {
      setCustomDocument(formatDocMask(gDoc));
      setDocChoice("cadastrado");
    } else {
      setCustomDocument(gDoc ? formatDocMask(gDoc) : "");
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
            document: gDoc,
            matchedGuestIndex: guestSlot.index,
            matchedGuestRole: guestSlot.role
          }
        : prev
    );
  };

  const applyStatementData = (data: any) => {
    setIsCheckedOut(Boolean(data.isCheckedOut));
    setHasFinalCheckoutInspection(Boolean(data.hasFinalCheckoutInspection));
    setCheckoutTime(data.checkoutTime || "");
    const launches: DailyLaunchGroup[] = Array.isArray(data.dailyLaunches) ? data.dailyLaunches : [];
    const pendingList: PendingLaunchedItem[] = Array.isArray(data.pendingLaunchedItems) ? data.pendingLaunchedItems : [];
    const courtesyList: any[] = Array.isArray(data.consumedCourtesyItems) ? data.consumedCourtesyItems : [];
    setDailyLaunches(launches);
    setPendingLaunchedItems(pendingList);
    setConsumedCourtesyItems(courtesyList);
    setPendingBalance(Number(data.pendingBalance) || 0);
    setTotalLaunchedAmount(Number(data.totalLaunchedAmount) || 0);
    setTotalPaidAmount(Number(data.totalPaidAmount) || 0);

    if (data.splitConfig) {
      const m = data.splitConfig.mode;
      if (m === "half_and_half" || m === "by_item" || m === "titular") {
        setSplitMode(m);
      }
      if (data.splitConfig.itemAssignments && typeof data.splitConfig.itemAssignments === "object") {
        setItemAssignments(data.splitConfig.itemAssignments);
      }
    }
    if (data.splitBreakdown) {
      setSplitBreakdown(data.splitBreakdown);
      const m = data.splitBreakdown.mode;
      if (m === "half_and_half" || m === "by_item" || m === "titular") {
        setSplitMode(m);
      }
    }

    const initialMap: Record<string, number> = {};
    for (const item of pendingList) {
      initialMap[item.itemKey] = item.remainingQuantity ?? item.quantity;
    }
    setSelectedLaunchQtyMap(initialMap);
  };

  const applyContextResponse = (data: any, fallbackCodeOrFlat: string) => {
    const guestsList: FlatGuestSlot[] = Array.isArray(data.reservationGuests) && data.reservationGuests.length > 0
      ? data.reservationGuests.map((g: any) => ({
          ...g,
          cpf: g.cpf || g.document || ""
        }))
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

    // Verifica se a URL veio com ?guestIndex=N (link individual de WhatsApp pós-vistoria)
    let urlGuestIndex = 0;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      urlGuestIndex = Number(sp.get("guestIndex") || 0);
    }

    const incomingMode = data.splitBreakdown?.mode || data.splitConfig?.mode || "titular";
    let matchedIdx =
      incomingMode === "titular"
        ? 1
        : urlGuestIndex > 0
        ? urlGuestIndex
        : Number(data.matchedGuestIndex) || 1;
    // Se a cota do hóspede atual já foi paga (R$ 0,00) enquanto outro hóspede ainda tem saldo pendente, pré-seleciona o hóspede com saldo pendente
    const incomingShares: any[] = Array.isArray(data.splitBreakdown?.shares) ? data.splitBreakdown.shares : [];
    if (incomingShares.length > 1) {
      const curShare = incomingShares.find((s) => Number(s.guestIndex) === matchedIdx);
      const pendingGuestShare = incomingShares.find((s) => Number(s.amount || 0) > 0);
      if (curShare && Number(curShare.amount || 0) <= 0 && pendingGuestShare) {
        matchedIdx = Number(pendingGuestShare.guestIndex) || matchedIdx;
      }
    }

    const matchedSlot = guestsList.find((g) => g.index === matchedIdx) || guestsList[0];

    setReservationGuests(guestsList);
    setSelectedGuestIndex(matchedSlot.index);

    setReservation({
      guestName: matchedSlot.name || data.guestName,
      firstName: matchedSlot.firstName || data.firstName || data.guestName?.split(" ")[0] || "Hóspede",
      phone: matchedSlot.phone || data.phone || "",
      email: matchedSlot.email || data.email || "",
      document: matchedSlot.cpf || matchedSlot.document || data.document || "",
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
    setIsEditingContact(false);

    const resolvedDoc = (matchedSlot.cpf || matchedSlot.document || data.document || "").replace(/\D/g, "");
    if (resolvedDoc.length >= 11) {
      setCustomDocument(formatDocMask(resolvedDoc));
      setDocChoice("cadastrado");
    } else {
      setCustomDocument(resolvedDoc ? formatDocMask(resolvedDoc) : "");
      setDocChoice("personalizado");
    }
  };

  // Persistência em tempo real da divisão / atribuição de itens / dados de hóspedes na reserva
  const saveSplitConfigRealtime = async (payload: {
    mode?: SplitMode;
    itemAssignments?: Record<string, any>;
    itemUpdate?: { itemKey: string; allocations: Record<number, number> | null };
    guestUpdate?: { index: number; name: string; phone: string; email: string; cpf: string };
  }) => {
    const resCode = reservation?.reservationCode || codeFromUrl;
    const flatNum = reservation?.flatNumber || flatFromUrl;
    if (!resCode && !flatNum) return;

    setIsSavingSplit(true);
    try {
      const res = await fetch("/api/minibar/split-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: resCode,
          flatNumber: flatNum,
          ...payload
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.reservationGuests)) {
          const updatedGuests = data.reservationGuests.map((g: any) => ({
            ...g,
            cpf: g.cpf || g.document || ""
          }));
          setReservationGuests(updatedGuests);
          const targetIdx = payload.mode === "titular" ? 1 : selectedGuestIndex;
          const curSlot = updatedGuests.find((g: FlatGuestSlot) => g.index === targetIdx) || updatedGuests[0];
          if (curSlot) {
            handleSelectConsumerGuest(curSlot);
          }
        }
        if (data.statement) {
          applyStatementData(data.statement);
        } else {
          if (data.splitConfig) {
            setSplitMode(data.splitConfig.mode);
            setItemAssignments(data.splitConfig.itemAssignments || {});
          }
          if (data.splitBreakdown) {
            setSplitBreakdown(data.splitBreakdown);
          }
        }
        setSplitSavedPulse(true);
        setTimeout(() => setSplitSavedPulse(false), 2500);
      }
    } catch (_) {
    } finally {
      setIsSavingSplit(false);
    }
  };

  // Alterar modo rápido de divisão ("titular" | "half_and_half" | "by_item")
  const handleSelectSplitMode = async (newMode: SplitMode) => {
    setSplitMode(newMode);
    setPartialMode("configured_split");
    setEditingGuestIndex(null);
    setIsAddingNewGuest(false);
    if (newMode === "titular") {
      const titularSlot = reservationGuests.find((g) => g.index === 1) || reservationGuests[0];
      if (titularSlot) {
        handleSelectConsumerGuest(titularSlot);
      } else {
        setSelectedGuestIndex(1);
      }
    }
    // Se escolheu dividir meio a meio ou marcar por item e só há 1 hóspede listado, garante pelo menos o 2º slot visível
    if ((newMode === "half_and_half" || newMode === "by_item") && reservationGuests.length < 2) {
      const defaultSecondGuest = {
        index: 2,
        name: "2º Hóspede",
        phone: "",
        email: "",
        cpf: ""
      };
      await saveSplitConfigRealtime({ mode: newMode, guestUpdate: defaultSecondGuest });
      return;
    }
    await saveSplitConfigRealtime({ mode: newMode });
  };

  // Atribuir item inteiro rapidamente para um hóspede específico (no modo "by_item")
  const handleQuickAssignItemToGuest = async (itemKey: string, totalQty: number, guestIndex: number) => {
    const newAlloc: Record<number, number> = {};
    for (const g of reservationGuests) {
      newAlloc[g.index] = g.index === guestIndex ? totalQty : 0;
    }
    if (newAlloc[guestIndex] === undefined) {
      newAlloc[guestIndex] = totalQty;
    }
    setItemAssignments((prev) => ({
      ...prev,
      [itemKey]: newAlloc
    }));
    if (splitMode !== "by_item") {
      setSplitMode("by_item");
    }
    await saveSplitConfigRealtime({
      mode: "by_item",
      itemUpdate: { itemKey, allocations: newAlloc }
    });
  };

  // Dividir rapidamente as unidades de um item entre os hóspedes do flat e abrir/fechar os steppers
  const handleQuickDivideItemUnits = async (
    itemKey: string,
    totalQty: number,
    fallbackAlloc?: Record<number, number>
  ) => {
    if (expandedUnitItemKey === itemKey) {
      setExpandedUnitItemKey(null);
      return;
    }
    setExpandedUnitItemKey(itemKey);

    const existing = itemAssignments[itemKey] || fallbackAlloc || {};
    const guestsWithUnits = Object.values(existing).filter((v) => Number(v) > 0).length;
    if (guestsWithUnits >= 2) {
      return;
    }

    const guestsToSplit =
      reservationGuests.length >= 2
        ? reservationGuests
        : [
            reservationGuests[0] || { index: 1 },
            { index: 2 }
          ];
    const n = guestsToSplit.length;
    const baseQty = Math.floor(totalQty / n);
    let remainder = totalQty - baseQty * n;
    const newAlloc: Record<number, number> = {};
    for (const g of guestsToSplit) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      newAlloc[g.index] = baseQty + extra;
    }

    setItemAssignments((prev) => ({
      ...prev,
      [itemKey]: newAlloc
    }));
    if (splitMode !== "by_item") {
      setSplitMode("by_item");
    }
    await saveSplitConfigRealtime({
      mode: "by_item",
      itemUpdate: { itemKey, allocations: newAlloc }
    });
  };

  // Dividir unidades de um item igualmente (quando quantity > 1) ou ajustar +-1 unidade para um hóspede
  const handleAdjustItemUnitForGuest = async (
    itemKey: string,
    totalQty: number,
    guestIndex: number,
    delta: number,
    fallbackAlloc?: Record<number, number>
  ) => {
    const rawCurrent = itemAssignments[itemKey] || fallbackAlloc || { 1: totalQty };
    const updatedAlloc: Record<number, number> = {};
    for (const g of reservationGuests) {
      updatedAlloc[g.index] = Number(rawCurrent[g.index] || 0);
    }
    const curVal = Number(updatedAlloc[guestIndex] || 0);
    const nextVal = Math.max(0, Math.min(totalQty, curVal + delta));
    if (nextVal === curVal) return;

    updatedAlloc[guestIndex] = nextVal;

    const totalNow = Object.values(updatedAlloc).reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (delta > 0 && totalNow > totalQty) {
      // Transfere 1 unidade de outro hóspede que possua unidades alocadas
      let excess = totalNow - totalQty;
      const otherGuests = reservationGuests
        .map((g) => g.index)
        .filter((idx) => idx !== guestIndex)
        .sort((a, b) => (updatedAlloc[b] || 0) - (updatedAlloc[a] || 0));
      for (const oIdx of otherGuests) {
        if (excess <= 0) break;
        const avail = updatedAlloc[oIdx] || 0;
        if (avail > 0) {
          const deduct = Math.min(avail, excess);
          updatedAlloc[oIdx] = avail - deduct;
          excess -= deduct;
        }
      }
    } else if (delta < 0 && totalNow < totalQty && reservationGuests.length >= 2) {
      // Transfere a unidade liberada para o outro hóspede (ex: se tirou do 1º, passa para o 2º; se tirou do 2º, volta para o 1º)
      const recipientGuest =
        reservationGuests.find((g) => g.index !== guestIndex)?.index || 1;
      updatedAlloc[recipientGuest] = (updatedAlloc[recipientGuest] || 0) + (totalQty - totalNow);
    }

    setItemAssignments((prev) => ({
      ...prev,
      [itemKey]: updatedAlloc
    }));

    await saveSplitConfigRealtime({
      mode: "by_item",
      itemUpdate: { itemKey, allocations: updatedAlloc }
    });
  };

  // Abrir formulário inline para completar/editar dados de um hóspede ou adicionar novo hóspede
  const handleStartEditGuest = (guestSlot?: FlatGuestSlot) => {
    if (guestSlot) {
      setIsAddingNewGuest(false);
      setEditingGuestIndex(guestSlot.index);
      setGuestEditForm({
        index: guestSlot.index,
        name: isGuestPlaceholderName(guestSlot.name) ? "" : guestSlot.name,
        phone: guestSlot.phone || "",
        email: guestSlot.email || "",
        cpf: formatDocMask(guestSlot.cpf || guestSlot.document || "")
      });
    } else {
      const nextIdx = Math.max(...reservationGuests.map((g) => g.index), 1) + 1;
      setIsAddingNewGuest(true);
      setEditingGuestIndex(nextIdx);
      setGuestEditForm({
        index: nextIdx,
        name: "",
        phone: "",
        email: "",
        cpf: ""
      });
    }
  };

  const handleSaveGuestInline = async () => {
    const cleanName = guestEditForm.name.trim() || `${guestEditForm.index}º Hóspede`;
    await saveSplitConfigRealtime({
      guestUpdate: {
        index: guestEditForm.index,
        name: cleanName,
        phone: guestEditForm.phone.trim(),
        email: guestEditForm.email.trim(),
        cpf: guestEditForm.cpf.replace(/\D/g, "")
      }
    });
    setEditingGuestIndex(null);
    setIsAddingNewGuest(false);
  };

  // Carrega contexto direto por código de reserva
  const loadContextByReservationCode = async (code: string) => {
    setStep("loading");
    setOtpError(null);
    try {
      let querySuffix = "";
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        const gi = sp.get("guestIndex");
        if (gi) querySuffix = `?guestIndex=${encodeURIComponent(gi)}`;
      }
      const res = await fetch(`/api/minibar/reservation-context/${encodeURIComponent(code)}${querySuffix}`);
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

  // Carrega contexto direto por número do flat (sem exigir 4 dígitos de CPF/celular)
  const loadContextByFlatNumber = async (flatNum: string) => {
    setStep("loading");
    setOtpError(null);
    setManualError(null);
    try {
      const res = await fetch("/api/minibar/flat-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flatNum
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        applyContextResponse(data, data.reservationCode || flatNum);
        setStep("catalog");
      } else {
        setManualError(data.error || `Nenhuma reserva ativa ou recente encontrada para o Flat ${flatNum}.`);
        setStep("manual_lookup");
      }
    } catch {
      setManualError("Erro de comunicação ao carregar o extrato do flat.");
      setStep("manual_lookup");
    }
  };

  // Carrega contexto por flat e 4 dígitos (mantido apenas por compatibilidade reversa)
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
        setStep("catalog");
      } else {
        setOtpError(data.error || "Erro ao validar contexto do flat.");
      }
    } catch {
      setOtpError("Falha na conexão ao validar os dígitos. Verifique sua internet.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Recarrega extrato silenciosamente
  const refreshCurrentContextSilently = async () => {
    const code = reservation?.reservationCode || codeFromUrl;
    if (code) {
      try {
        const res = await fetch(
          `/api/minibar/reservation-context/${encodeURIComponent(code)}?guestIndex=${encodeURIComponent(
            String(selectedGuestIndex || 1)
          )}`
        );
        const data = await res.json();
        if (res.ok && data.success) {
          applyContextResponse(data, code);
        }
      } catch (_) {}
      return;
    }
    const flatNum = reservation?.flatNumber || flatFromUrl;
    if (flatNum) {
      try {
        const res = await fetch("/api/minibar/flat-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flatNumber: flatNum })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          applyContextResponse(data, data.reservationCode || flatNum);
        }
      } catch (_) {}
    }
  };

  // Inicialização Baseada na URL (acesso direto por código da reserva ou número do flat, sem OTP)
  useEffect(() => {
    if (codeFromUrl) {
      loadContextByReservationCode(codeFromUrl);
    } else if (flatFromUrl) {
      loadContextByFlatNumber(flatFromUrl);
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

  // Cálculo do valor e itens a pagar de acordo com a divisão configurada na reserva
  const paymentSelectionSummary = useMemo(() => {
    if (pendingBalance <= 0) {
      return {
        amountToPay: 0,
        itemsCount: 0,
        summaryLines: [] as { label: string; sublabel: string; subtotal: number }[],
        selectedLaunchItemsPayload: [] as any[]
      };
    }

    if (partialMode === "configured_split" && activeGuestConfiguredShare) {
      const shareAmt = Number(activeGuestConfiguredShare.amount || 0);
      const shareItems: any[] = Array.isArray(activeGuestConfiguredShare.items)
        ? activeGuestConfiguredShare.items
        : [];
      const lines = shareItems.map((it: any) => ({
        label: `${it.quantity}x ${it.productName}`,
        sublabel: it.launchDateBr
          ? `Consumo em ${it.launchDateBr} • ${formatBRL(it.unitPrice)} un.`
          : `Divisão configurada (${activeGuestConfiguredShare.guestName})`,
        subtotal: Number(it.totalPrice || 0)
      }));

      return {
        amountToPay: shareAmt,
        itemsCount: shareItems.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0),
        summaryLines:
          lines.length > 0
            ? lines
            : shareAmt > 0
            ? [
                {
                  label: `Cota de Frigobar — ${activeGuestConfiguredShare.guestName}`,
                  sublabel:
                    splitMode === "half_and_half"
                      ? "Divisão Meio a Meio (50/50)"
                      : splitMode === "by_item"
                      ? "Itens atribuídos no extrato"
                      : "100% Titular (Padrão)",
                  subtotal: shareAmt
                }
              ]
            : [],
        selectedLaunchItemsPayload: Array.isArray(activeGuestConfiguredShare.selectedLaunchItems)
          ? activeGuestConfiguredShare.selectedLaunchItems
          : []
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

    // Modo manual: "items"
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
        launchOrderId: item.orderId,
        productId: item.productId,
        productName: item.productName,
        quantity: selQty,
        unitPrice: item.unitPrice,
        launchDate: item.launchDateYmd,
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
  }, [
    partialMode,
    activeGuestConfiguredShare,
    splitMode,
    pendingBalance,
    splitParts,
    customPartialInput,
    pendingLaunchedItems,
    selectedLaunchQtyMap,
    activeConsumerGuest.firstName
  ]);

  // Iniciar pagamento direto da parte de um hóspede específico no card de divisão
  const handleStartPayGuestShare = (guestIndex: number) => {
    const slot = reservationGuests.find((g) => g.index === guestIndex);
    if (slot) {
      handleSelectConsumerGuest(slot);
    } else {
      setSelectedGuestIndex(guestIndex);
    }
    setPartialMode("configured_split");
    setOrderError(null);
    setStep("checkout");
  };

  // Submissão do Pagamento no Checkout
  const handleCheckoutSubmit = async () => {
    if (!hasFinalCheckoutInspection) {
      setOrderError("O pagamento fica disponível somente após a conferência de consumo pós check-out.");
      return;
    }

    if (paymentSelectionSummary.amountToPay <= 0) {
      setOrderError("Selecione ao menos um item lançado ou uma cota com saldo maior que R$ 0,00 para pagar.");
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    const docToSend =
      docChoice === "cadastrado"
        ? (activeConsumerGuest.cpf || activeConsumerGuest.document || reservation?.document || "").replace(/\D/g, "")
        : customDocument.replace(/\D/g, "");

    const emailToSend = (invoiceEmail || activeConsumerGuest.email || reservation?.email || "").trim();
    const phoneToSend = (invoicePhone || activeConsumerGuest.phone || reservation?.phone || "").trim();

    let urlOrdId: string | undefined = undefined;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const ordFromQuery = sp.get("ord");
      if (
        ordFromQuery &&
        ordFromQuery.startsWith("ORD-MB-SPLIT-") &&
        ordFromQuery.endsWith(`-G${activeConsumerGuest.index}`)
      ) {
        urlOrdId = ordFromQuery;
      }
    }
    if (!urlOrdId && partialMode === "configured_split" && activeGuestConfiguredShare?.pendingOrderId) {
      urlOrdId = String(activeGuestConfiguredShare.pendingOrderId);
    }

    const isPayingAllItems =
      (partialMode === "items" || (partialMode === "configured_split" && splitMode === "titular")) &&
      Math.abs(paymentSelectionSummary.amountToPay - pendingBalance) < 0.02;

    const orderPayload = {
      orderId: urlOrdId,
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
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <CorpFlatsIcon className="w-11 h-11" />
              <div className="text-left">
                <CorpFlatsWordmark className="text-base text-white block leading-none" />
                <span className="text-[10px] text-[#E5C98B] font-semibold">Soho Residence</span>
              </div>
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
                  loadContextByFlatNumber(val);
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
  // 4. TELA PRINCIPAL: EXTRATO DE CONSUMO POR DIA + PAGAMENTO APÓS CONFERÊNCIA PÓS CHECK-OUT
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "catalog") {
    const isPaymentReleased = Boolean(hasFinalCheckoutInspection);
    const canPayNow = isPaymentReleased && pendingBalance > 0 && paymentSelectionSummary.amountToPay > 0;
    const sharesList: any[] = Array.isArray(splitBreakdown?.shares) ? splitBreakdown.shares : [];

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-36">
        {/* Topo / Header Mobile Enxuto */}
        <header className="sticky top-0 z-30 bg-[#091E26]/95 backdrop-blur-md border-b border-[#C5A059]/30 px-4 py-3 sm:px-6">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CorpFlatsIcon className="w-9 h-9" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-sm sm:text-base font-black text-white leading-tight">
                    Frigobar Flat {reservation?.flatNumber}
                  </h1>
                  <Badge
                    variant="outline"
                    className={
                      isPaymentReleased
                        ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/80 text-[10px] font-bold"
                        : "bg-cyan-950/60 text-cyan-300 border-cyan-800/80 text-[10px] font-bold"
                    }
                  >
                    {isPaymentReleased
                      ? "✓ Conferência Finalizada"
                      : `Reserva ${reservation?.reservationCode || ""}`}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {reservationGuests[0]?.name || reservation?.guestName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowReferenceCatalog(true);
                  setTimeout(() => {
                    document
                      .getElementById("minibar-catalog-section")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
                className="text-[11px] font-bold text-cyan-300 border-cyan-800/70 bg-cyan-950/40 hover:bg-cyan-900/50 rounded-xl h-8 px-2.5"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                <span>Ver Cardápio</span>
              </Button>
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
          {orderError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{orderError}</span>
            </div>
          )}

          {/* ── 1. Resumo Único do Consumo do Quarto + Status de Pagamento ── */}
          <Card className="bg-slate-900 border-slate-800 rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-4 shadow-lg">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                Total Consumido no Quarto
              </span>
              <strong className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono block">
                {formatBRL(totalLaunchedAmount)}
              </strong>
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                {isPaymentReleased ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300 font-semibold">
                      Conferência pós check-out concluída • Pagamento liberado
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      Liberado para pagamento após a conferência pós check-out
                    </span>
                  </>
                )}
              </span>
            </div>
          </Card>

          {/* ── 2. Extrato de Consumo por Dia & Divisão ── */}
          <Card className="bg-slate-900 border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-cyan-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-black text-white">
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

            {/* ── Seletor Rápido de Divisão (Exibido apenas quando há saldo pendente > R$ 0,00) ── */}
            {pendingBalance > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Como dividir a conta?</span>
                </span>

                <div className="grid grid-cols-3 gap-2">
                  {/* 100% Titular (Padrão) */}
                  <button
                    type="button"
                    onClick={() => handleSelectSplitMode("titular")}
                    className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                      splitMode === "titular"
                        ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    100% Titular
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSplitMode("half_and_half")}
                    className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                      splitMode === "half_and_half"
                        ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    Dividir Meio a Meio
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSplitMode("by_item")}
                    className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                      splitMode === "by_item"
                        ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    Marcar por Item
                  </button>
                </div>
              </div>
            )}

            {/* ── Sub-bloco Segregado: Cortesias Consumidas do Kit de Boas-Vindas (R$ 0,00) ── */}
            {consumedCourtesyItems.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/25 p-3.5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-500/15 pb-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-black text-white">
                      Kit de Boas-Vindas
                    </span>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                    Cortesia
                  </Badge>
                </div>

                <div className="divide-y divide-emerald-500/10">
                  {consumedCourtesyItems.map((cItem: any) => (
                    <div key={cItem.productId} className="py-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-bold text-white">
                          {cItem.quantity}x {cItem.productName}
                        </span>
                      </div>
                      <strong className="text-emerald-400 font-mono font-black text-xs">
                        R$ 0,00
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Extrato Agrupado por Dia com Preço Unitário e Subtotal Visíveis ── */}
            {dailyLaunches.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center">
                <p className="text-xs font-medium text-slate-400">
                  Nenhum consumo lançado até o momento.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {dailyLaunches.map((group) => (
                  <div
                    key={group.date}
                    className="rounded-2xl bg-slate-950/80 border border-slate-800 overflow-hidden"
                  >
                    <div className="px-3.5 py-2 bg-slate-900/70 border-b border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">
                        📅 Dia {group.dateBr}
                      </span>
                      <span className="font-bold text-cyan-300 font-mono">
                        Subtotal: {formatBRL(group.totalDayAmount)}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/60 px-3.5">
                      {group.items.map((item, idx) => {
                        const isPaid = item.paymentStatus === "pago";
                        const itemKey =
                          item.itemKey || `${item.orderId}_${item.productId}_${idx}`;
                        const remQty = item.remainingQuantity ?? item.quantity;
                        const canAssignItem =
                          pendingBalance > 0 &&
                          splitMode === "by_item" &&
                          !item.isCourtesy &&
                          !isPaid &&
                          remQty > 0;
                        const currentAlloc =
                          itemAssignments[itemKey] || item.allocation?.allocations || {};
                        const isExplicitlyMarked =
                          Boolean(itemAssignments[itemKey]) ||
                          Boolean(item.allocation?.isExplicitlyMarked);
                        const isExpandedUnits = expandedUnitItemKey === itemKey;

                        return (
                          <div key={itemKey} className="py-2.5 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-bold text-white block truncate">
                                  {item.quantity}x {item.productName}
                                </span>
                                <span className="text-[11px] text-slate-400 block">
                                  {item.isCourtesy
                                    ? "Gratuito (Cortesia)"
                                    : `${formatBRL(item.unitPrice)} un.`}
                                </span>
                              </div>

                              <strong
                                className={
                                  item.isCourtesy || isPaid
                                    ? "text-emerald-400 font-mono shrink-0"
                                    : "text-cyan-400 font-mono shrink-0"
                                }
                              >
                                {item.isCourtesy ? "Cortesia" : formatBRL(item.totalPrice)}
                              </strong>
                            </div>

                            {/* Controles rápidos de atribuição apenas no modo "Marcar por Item" */}
                            {canAssignItem && (
                              <div className="pt-1 flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {reservationGuests.map((g) => {
                                    const gQty = Number(currentAlloc[g.index] || 0);
                                    const isFullAssignedToG =
                                      isExplicitlyMarked && gQty === remQty && remQty > 0;
                                    const isPartialAssignedToG = gQty > 0 && gQty < remQty;
                                    const isDefaultFallbackToG =
                                      !isExplicitlyMarked && g.index === 1;
                                    return (
                                      <button
                                        key={g.index}
                                        type="button"
                                        onClick={() =>
                                          handleQuickAssignItemToGuest(itemKey, remQty, g.index)
                                        }
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 ${
                                          isFullAssignedToG
                                            ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm"
                                            : isPartialAssignedToG
                                            ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/60"
                                            : isDefaultFallbackToG
                                            ? "bg-slate-900 text-amber-300 border-amber-500/40 hover:border-cyan-400"
                                            : "bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600"
                                        }`}
                                      >
                                        <UserCheck className="w-3 h-3 shrink-0" />
                                        <span>
                                          {g.firstName || g.name.split(" ")[0]}
                                          {gQty > 0 && remQty > 1 ? ` (${gQty}x)` : ""}
                                        </span>
                                      </button>
                                    );
                                  })}

                                  {remQty > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickDivideItemUnits(itemKey, remQty, currentAlloc)
                                      }
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                        isExpandedUnits
                                          ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                                          : "bg-slate-900 text-cyan-400 border-slate-700 hover:border-cyan-500/50"
                                      }`}
                                    >
                                      ÷ Dividir {remQty} un.
                                    </button>
                                  )}
                                </div>

                                {remQty > 1 && isExpandedUnits && (
                                  <div className="p-2.5 rounded-xl bg-slate-900/95 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {reservationGuests.map((g) => {
                                      const gQty = Number(currentAlloc[g.index] || 0);
                                      return (
                                        <div
                                          key={g.index}
                                          className="flex items-center justify-between bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800"
                                        >
                                          <span className="text-[11px] font-bold text-slate-200 truncate">
                                            {g.firstName || g.name}
                                          </span>
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleAdjustItemUnitForGuest(
                                                  itemKey,
                                                  remQty,
                                                  g.index,
                                                  -1,
                                                  currentAlloc
                                                )
                                              }
                                              disabled={gQty <= 0}
                                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white flex items-center justify-center"
                                            >
                                              <Minus className="w-3 h-3" />
                                            </button>
                                            <span className="w-5 text-center text-xs font-black text-cyan-400">
                                              {gQty}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleAdjustItemUnitForGuest(
                                                  itemKey,
                                                  remQty,
                                                  g.index,
                                                  1,
                                                  currentAlloc
                                                )
                                              }
                                              disabled={gQty >= remQty}
                                              className="w-6 h-6 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold flex items-center justify-center"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Hóspedes do Flat — Cobrança e Nota Fiscal por Consumidor (Visível apenas nos modos de divisão com saldo pendente) ── */}
            {pendingBalance > 0 && splitMode !== "titular" && (
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-200">
                    Divisão por Hóspede
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStartEditGuest(undefined)}
                    className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-950/40 border border-cyan-800/50 shrink-0"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>+ Adicionar Hóspede</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {reservationGuests.map((g) => {
                    const share = sharesList.find((s) => Number(s.guestIndex) === Number(g.index));
                    const guestAmount = Number(
                      share?.amount ?? (g.index === 1 && splitMode === "titular" ? pendingBalance : 0)
                    );
                    const guestPaidAmount = Number(share?.paidAmount || 0);
                    const isSharePaid = Boolean(share?.isSharePaid) || (guestPaidAmount > 0 && guestAmount <= 0);
                    const cleanDoc = (g.cpf || g.document || "").replace(/\D/g, "");
                    const cleanPhone = (g.phone || "").replace(/\D/g, "");
                    const isPlaceholderName = isGuestPlaceholderName(g.name);
                    const missingAnyFiscal =
                      isPlaceholderName || cleanPhone.length < 10 || cleanDoc.length < 11;
                    const isEditingThis = editingGuestIndex === g.index && !isAddingNewGuest;

                    return (
                      <div
                        key={g.index}
                        className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {g.name}
                            </span>
                            {isSharePaid && (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                                ✓ Pago
                              </Badge>
                            )}
                            {missingAnyFiscal ? (
                              <button
                                type="button"
                                onClick={() =>
                                  isEditingThis ? setEditingGuestIndex(null) : handleStartEditGuest(g)
                                }
                                className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold hover:bg-amber-500/25 transition-all"
                              >
                                {isEditingThis ? "Fechar" : "Preencher dados"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  isEditingThis ? setEditingGuestIndex(null) : handleStartEditGuest(g)
                                }
                                title="Editar dados do hóspede"
                                className="text-slate-500 hover:text-cyan-400 p-1 rounded-md transition-colors"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <strong
                              className={`text-sm font-black font-mono ${
                                guestAmount > 0
                                  ? "text-cyan-400"
                                  : isSharePaid
                                  ? "text-emerald-400"
                                  : "text-slate-500"
                              }`}
                            >
                              {isSharePaid && guestAmount <= 0 ? "R$ 0,00" : formatBRL(guestAmount)}
                            </strong>

                            {isPaymentReleased && guestAmount > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleStartPayGuestShare(g.index)}
                                className="h-7 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-[11px] rounded-xl"
                              >
                                Pagar
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Formulário Inline exibido apenas quando precisa preencher dados ou clicou em editar */}
                        {isEditingThis && (
                          <div className="p-3 bg-slate-900 border border-cyan-500/40 rounded-xl space-y-2.5 mt-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Input
                                placeholder="Nome Completo *"
                                value={guestEditForm.name}
                                onChange={(e) =>
                                  setGuestEditForm((p) => ({ ...p, name: e.target.value }))
                                }
                                className="h-9 bg-slate-950 border-slate-700 text-xs text-white rounded-lg"
                              />
                              <Input
                                placeholder="WhatsApp com DDD"
                                value={guestEditForm.phone}
                                onChange={(e) =>
                                  setGuestEditForm((p) => ({ ...p, phone: e.target.value }))
                                }
                                className="h-9 bg-slate-950 border-slate-700 text-xs text-white rounded-lg"
                              />
                              <Input
                                placeholder="CPF ou CNPJ"
                                value={guestEditForm.cpf}
                                onChange={(e) =>
                                  setGuestEditForm((p) => ({
                                    ...p,
                                    cpf: formatDocMask(e.target.value)
                                  }))
                                }
                                className="h-9 bg-slate-950 border-slate-700 text-xs text-white rounded-lg"
                              />
                              <Input
                                type="email"
                                placeholder="E-mail (opcional)"
                                value={guestEditForm.email}
                                onChange={(e) =>
                                  setGuestEditForm((p) => ({ ...p, email: e.target.value }))
                                }
                                className="h-9 bg-slate-950 border-slate-700 text-xs text-white rounded-lg"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingGuestIndex(null)}
                                className="h-8 text-xs text-slate-400"
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={handleSaveGuestInline}
                                className="h-8 px-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg"
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Formulário para Adicionar Novo Hóspede ao Flat */}
                  {isAddingNewGuest && editingGuestIndex !== null && (
                    <div className="p-3 bg-slate-950 border border-cyan-500/40 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-300">
                          Novo Hóspede ({guestEditForm.index}º)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingNewGuest(false);
                            setEditingGuestIndex(null);
                          }}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Fechar
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Nome Completo *"
                          value={guestEditForm.name}
                          onChange={(e) =>
                            setGuestEditForm((p) => ({ ...p, name: e.target.value }))
                          }
                          className="h-9 bg-slate-900 border-slate-700 text-xs text-white rounded-lg"
                        />
                        <Input
                          placeholder="WhatsApp com DDD"
                          value={guestEditForm.phone}
                          onChange={(e) =>
                            setGuestEditForm((p) => ({ ...p, phone: e.target.value }))
                          }
                          className="h-9 bg-slate-900 border-slate-700 text-xs text-white rounded-lg"
                        />
                        <Input
                          placeholder="CPF ou CNPJ"
                          value={guestEditForm.cpf}
                          onChange={(e) =>
                            setGuestEditForm((p) => ({
                              ...p,
                              cpf: formatDocMask(e.target.value)
                            }))
                          }
                          className="h-9 bg-slate-900 border-slate-700 text-xs text-white rounded-lg"
                        />
                        <Input
                          type="email"
                          placeholder="E-mail (opcional)"
                          value={guestEditForm.email}
                          onChange={(e) =>
                            setGuestEditForm((p) => ({ ...p, email: e.target.value }))
                          }
                          className="h-9 bg-slate-900 border-slate-700 text-xs text-white rounded-lg"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleSaveGuestInline}
                        disabled={!guestEditForm.name.trim()}
                        className="w-full h-9 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl"
                      >
                        Salvar Hóspede
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* ── 4. Pagamentos Realizados & Notas Fiscais do Frigobar ── */}
          {paidOrdersHistory.length > 0 && (
            <Card className="bg-slate-900/80 border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs sm:text-sm font-black text-white">
                    Pagamentos & Notas Fiscais do Frigobar
                  </span>
                </div>
                <Badge variant="outline" className="bg-emerald-950/60 text-emerald-300 border-emerald-800 text-[10px]">
                  ✓ Quitado
                </Badge>
              </div>
              <div className="space-y-2">
                {paidOrdersHistory.map((ord: any) => {
                  const invoiceUrl = ord.invoice?.invoiceFileUrl || ord.invoice?.fileUrl || ord.invoiceFileUrl || "";
                  const invoiceName =
                    ord.invoice?.invoiceFileName || ord.invoiceFileName || "Nota_Fiscal_Frigobar.pdf";
                  const invoiceNum = ord.invoice?.invoiceNumber || ord.invoiceNumber || "";
                  return (
                    <div
                      key={ord.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>
                            Pago por <strong className="text-white">{ord.guestName}</strong>
                          </span>
                          <span className="text-emerald-400 font-black">
                            ({formatBRL(ord.totalAmount)})
                          </span>
                          {invoiceNum && (
                            <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px]">
                              NF #{invoiceNum}
                            </Badge>
                          )}
                        </div>
                        {Array.isArray(ord.items) && ord.items.length > 0 && (
                          <p className="text-[11px] text-slate-400">
                            {ord.items
                              .map((it: any) => `${it.quantity}x ${it.productName || it.name}`)
                              .join(", ")}
                          </p>
                        )}
                      </div>

                      {invoiceUrl ? (
                        <a
                          href={invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          download={invoiceName}
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-md shadow-cyan-500/20 transition-all shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Baixar Nota Fiscal</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-950/40 text-amber-300 border-amber-800/60 text-[10px] self-start sm:self-center shrink-0"
                        >
                          NF em emissão
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── 5. Cardápio Digital do Frigobar (Recolhido por Padrão e Posicionado Abaixo do Extrato) ── */}
          <Card id="minibar-catalog-section" className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border-slate-800 rounded-3xl overflow-hidden shadow-xl">
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
                      {catalog.length} itens
                    </Badge>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Consultar produtos e tabela de preços
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 shrink-0">
                <span className="hidden sm:inline">{showReferenceCatalog ? "Recolher" : "Abrir"}</span>
                {showReferenceCatalog ? (
                  <ChevronUp className="w-4 h-4 text-cyan-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-cyan-400" />
                )}
              </div>
            </button>

            {showReferenceCatalog && (
              <div className="p-4 sm:p-5 pt-0 border-t border-slate-800/80 space-y-4">
                {/* ── Kit de Boas-Vindas ── */}
                <div className="mt-3 p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/40 shadow-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                        <Gift className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h3 className="text-sm sm:text-base font-black text-white">
                        Kit de Boas-Vindas
                      </h3>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                      Cortesia
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Copo d'Água Mineral 200ml */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/25 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden p-1">
                          <img
                            src="/images/frigobar/agua_mineral_copo.png"
                            alt="Copo d'Água Mineral"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="font-black text-white text-xs block truncate">
                            Copo d'Água Mineral 200ml
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            2 unidades
                          </span>
                        </div>
                      </div>
                      <strong className="text-emerald-400 font-mono text-sm font-black shrink-0">
                        R$ 0,00
                      </strong>
                    </div>

                    {/* Amendoim Mendorato 27g */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/25 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden p-1">
                          <img
                            src="/images/frigobar/amendoim_mendorato.png"
                            alt="Amendoim Mendorato 27g"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="font-black text-white text-xs block truncate">
                            Amendoim Mendorato 27g
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            2 unidades
                          </span>
                        </div>
                      </div>
                      <strong className="text-emerald-400 font-mono text-sm font-black shrink-0">
                        R$ 0,00
                      </strong>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Disponível apenas na chegada, sem reposição durante a estadia.
                  </p>
                </div>

                {/* Separador nítido para os produtos pagos */}
                <div className="pt-2 pb-1 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <Refrigerator className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Produtos Pagos do Frigobar (Tabela de Preços)
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
                  {[
                    { id: "todos", label: "✨ Todos" },
                    { id: "bebidas", label: "💧 Bebidas" },
                    { id: "snacks", label: "🍫 Petiscos & Snacks" },
                    { id: "cervejas", label: "🍺 Cervejas & Alcoólicos" },
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catalog
                    .filter((prod) => {
                      const isCourtesyKit = prod.isCourtesy || prod.category === "Kit de Boas-Vindas";
                      if (menuCategoryFilter === "todos") {
                        // Na lista de todos os produtos pagos, as cortesias ficam segregadas no card de boas-vindas
                        return !isCourtesyKit;
                      }
                      const cat = String(prod.category || "").toLowerCase();
                      const name = String(prod.name || "").toLowerCase();
                      if (menuCategoryFilter === "cortesias") {
                        return Boolean(prod.isCourtesy) || cat.includes("cafe") || name.includes("cápsula") || name.includes("capsula");
                      }
                      if (menuCategoryFilter === "cervejas") {
                        return cat.includes("cerveja") || cat.includes("alcool") || name.includes("heineken") || name.includes("stella") || name.includes("corona") || name.includes("cerveja") || name.includes("smirnoff");
                      }
                      if (menuCategoryFilter === "snacks") {
                        if (isCourtesyKit) return false;
                        return (
                          cat.includes("petisco") ||
                          cat.includes("snack") ||
                          cat.includes("doce") ||
                          cat.includes("comida") ||
                          cat.includes("bomboniere") ||
                          name.includes("cereal") ||
                          name.includes("batata") ||
                          name.includes("biscoito") ||
                          name.includes("castanha") ||
                          name.includes("chiclete") ||
                          name.includes("chocolate") ||
                          name.includes("kinder") ||
                          name.includes("kitkat") ||
                          name.includes("snickers") ||
                          name.includes("cookies") ||
                          name.includes("amendoim")
                        );
                      }
                      if (menuCategoryFilter === "bebidas") {
                        return (
                          !isCourtesyKit &&
                          !cat.includes("petisco") &&
                          !cat.includes("snack") &&
                          !cat.includes("cafe") &&
                          (cat.includes("bebida") || cat.includes("cerveja") || cat.includes("agua") || cat.includes("suco") || cat.includes("energetico") || cat.includes("refrigerante"))
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
                              className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden shadow-inner ${
                                isCourtesyItem
                                  ? "bg-emerald-950/60 border-emerald-700/50"
                                  : "bg-white border-slate-700/50"
                              }`}
                            >
                              {prod.imageUrl ? (
                                <img
                                  src={prod.imageUrl}
                                  alt={prod.name}
                                  className="w-full h-full object-contain p-0.5"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : prod.category === "cafe" || prod.category === "cafe_capsulas" || isCourtesyItem ? (
                                <Coffee className="w-5 h-5 text-amber-400" />
                              ) : (
                                <Refrigerator className="w-5 h-5 text-cyan-400" />
                              )}
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-black text-white leading-tight">
                                  {prod.name}
                                </span>
                                {isCourtesyItem && (
                                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                                    Cortesia
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block">
                                Padrão: {nominalStandard} un.
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isCourtesyFree ? (
                              <strong className="text-xs font-black text-emerald-400">
                                Cortesia
                              </strong>
                            ) : (
                              <strong className="text-sm font-black text-cyan-400 font-mono">
                                {formatBRL(prod.price)}
                              </strong>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>
        </main>

        {/* ── Barra Fixa Inferior (Bloqueada antes da Conferência Pós Check-out / Liberada após Conferência) ── */}
        <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-4 z-40 shadow-2xl">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">
                {!isPaymentReleased
                  ? "🔒 Pagamento após conferência pós check-out"
                  : pendingBalance <= 0
                  ? "Tudo quitado nesta estadia"
                  : `Total a pagar (${activeConsumerGuest.firstName})`}
              </span>
              <div className="text-lg sm:text-xl font-black text-cyan-400">
                {formatBRL(pendingBalance > 0 ? paymentSelectionSummary.amountToPay : 0)}
              </div>
            </div>

            {!isPaymentReleased ? (
              <Button
                type="button"
                disabled
                className="h-12 px-4 sm:px-5 rounded-2xl font-bold text-xs bg-slate-800 text-amber-300/90 border border-amber-500/30 cursor-not-allowed flex items-center gap-2 opacity-95"
              >
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Após Conferência Check-out</span>
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
  // 5. TELA: CHECKOUT & DADOS FISCAIS (Enxuta e Direta)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "checkout") {
    const checkoutAmount = paymentSelectionSummary.amountToPay;
    const registeredCpfDigits = (activeConsumerGuest.cpf || activeConsumerGuest.document || "").replace(/\D/g, "");
    const hasRegisteredCpf = registeredCpfDigits.length >= 11;
    const showCustomFiscalInputs = !hasRegisteredCpf || docChoice === "personalizado" || isEditingContact;

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
              <span>Voltar</span>
            </Button>
            <span className="text-xs font-bold text-slate-300">
              Pagamento • {activeConsumerGuest.firstName}
            </span>
          </div>
        </header>

        <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
          {/* Resumo Enxuto do Pagamento */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block">
                  Total a Pagar — Flat {reservation?.flatNumber}
                </span>
                <strong className="text-xl font-black text-cyan-400">
                  {formatBRL(checkoutAmount)}
                </strong>
              </div>
              <Badge variant="outline" className="bg-cyan-950/60 text-cyan-300 border-cyan-800 text-[10px]">
                {activeConsumerGuest.name}
              </Badge>
            </div>

            {paymentSelectionSummary.summaryLines.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
                {paymentSelectionSummary.summaryLines.map((line, idx) => (
                  <div key={idx} className="flex items-center justify-between text-slate-300">
                    <span>{line.label}</span>
                    <strong className="text-slate-200 font-mono">{formatBRL(line.subtotal)}</strong>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Nota Fiscal: 3 Pílulas Compactas + Confirmação Discreta de CPF */}
          <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 space-y-3.5">
            <div className="space-y-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>Descrição na Nota Fiscal</span>
              </span>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "detailed", label: "Detalhar Itens" },
                  { id: "water", label: 'Lançar como "Água"' },
                  { id: "minibar_consumption", label: "Consumo de Frigobar" }
                ].map((opt) => {
                  const active = invoicePreference === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setInvoicePreference(opt.id as InvoicePreference)}
                      className={`p-2.5 rounded-xl border text-center text-[11px] font-bold transition-all ${
                        active
                          ? "bg-cyan-600 text-slate-950 border-cyan-400 shadow-md shadow-cyan-600/20"
                          : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
              {!showCustomFiscalInputs ? (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">
                    CPF na Nota: <strong className="text-white">{formatDocMask(registeredCpfDigits)}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!customDocument && registeredCpfDigits) {
                        setCustomDocument(formatDocMask(registeredCpfDigits));
                      }
                      setIsEditingContact(true);
                    }}
                    className="text-[11px] font-bold text-cyan-400 hover:underline"
                  >
                    Usar outro CPF/CNPJ ou alterar contato
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      Dados para emissão e envio da NF
                    </span>
                    {hasRegisteredCpf && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomDocument(formatDocMask(registeredCpfDigits));
                          setInvoicePhone(activeConsumerGuest.phone || "");
                          setInvoiceEmail(activeConsumerGuest.email || "");
                          setDocChoice("cadastrado");
                          setIsEditingContact(false);
                        }}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        Usar cadastro padrão
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder="CPF ou CNPJ na Nota"
                      value={customDocument}
                      onChange={(e) => {
                        setDocChoice("personalizado");
                        setCustomDocument(formatDocMask(e.target.value));
                      }}
                      className="h-10 bg-slate-950 border-slate-800 text-white rounded-xl text-xs"
                    />
                    {customDocument.replace(/\D/g, "").length === 14 && (
                      <Input
                        placeholder="Razão Social (opcional)"
                        value={customCompanyName}
                        onChange={(e) => setCustomCompanyName(e.target.value)}
                        className="h-10 bg-slate-950 border-slate-800 text-white rounded-xl text-xs"
                      />
                    )}
                    <Input
                      placeholder="WhatsApp p/ receber NF"
                      value={invoicePhone}
                      onChange={(e) => setInvoicePhone(e.target.value)}
                      className="h-10 bg-slate-950 border-slate-800 text-white rounded-xl text-xs"
                    />
                    <Input
                      type="email"
                      placeholder="E-mail p/ receber NF"
                      value={invoiceEmail}
                      onChange={(e) => setInvoiceEmail(e.target.value)}
                      className="h-10 bg-slate-950 border-slate-800 text-white rounded-xl text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Seleção do Meio de Pagamento */}
          {checkoutAmount > 0 && (
            <Card className="bg-slate-900 border-slate-800 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                <span>Forma de Pagamento</span>
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pix")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === "pix"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <QrCode className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold">PIX</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("credit_card")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === "credit_card"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/50"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-bold">Cartão de Crédito</span>
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
            className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-2xl text-sm shadow-xl shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            {isSubmittingOrder ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : paymentMethod === "pix" ? (
              <>
                <QrCode className="w-4 h-4" />
                <span>Gerar PIX ({formatBRL(checkoutAmount)})</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
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
              {formatBRL(activeOrder?.totalAmount || paymentSelectionSummary.amountToPay)}
            </h1>
            <p className="text-xs text-slate-400">
              Flat {reservation?.flatNumber} • {activeConsumerGuest.name}
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
                    <span>Copiar Código PIX</span>
                  </>
                )}
              </Button>

              <div className="p-2.5 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-center gap-2 text-xs text-cyan-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Aguardando confirmação...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-5 bg-slate-800/60 rounded-2xl border border-slate-700 text-center space-y-3">
                <CreditCard className="w-9 h-9 text-indigo-400 mx-auto" />
                {activeOrder?.initPoint && (
                  <Button
                    onClick={() => window.open(activeOrder.initPoint, "_blank")}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                  >
                    <span>Abrir Pagamento por Cartão</span>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="p-2.5 bg-slate-800/80 border border-slate-700/60 rounded-xl flex items-center justify-center gap-2 text-xs text-indigo-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Aguardando aprovação...</span>
              </div>
            </div>
          )}

          <div className="pt-1">
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
              Voltar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. TELA: CONFIRMAÇÃO & SUCESSO (Limpa e Sem Metadados Técnicos)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Pagamento Confirmado!
            </h1>
            <div className="text-2xl font-black text-emerald-400 pt-1">
              {formatBRL(activeOrder?.totalAmount || paymentSelectionSummary.amountToPay)}
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Sua Nota Fiscal será enviada automaticamente para o seu WhatsApp e e-mail cadastrados.
          </p>

          {(activeOrder?.invoice?.invoiceFileUrl || activeOrder?.invoice?.fileUrl || activeOrder?.invoiceFileUrl) && (
            <a
              href={activeOrder?.invoice?.invoiceFileUrl || activeOrder?.invoice?.fileUrl || activeOrder?.invoiceFileUrl}
              target="_blank"
              rel="noreferrer"
              download={activeOrder?.invoice?.invoiceFileName || activeOrder?.invoiceFileName || "Nota_Fiscal_Frigobar.pdf"}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all"
            >
              <FileText className="w-4 h-4" />
              <span>Baixar Nota Fiscal Agora</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

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
