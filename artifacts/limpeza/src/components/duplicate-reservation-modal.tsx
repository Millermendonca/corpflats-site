import React, { useState, useEffect, useMemo, useRef, useId, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { cleanWhatsAppPhone } from "@/hooks/use-quick-messages";
import {
  CopyPlus,
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Check,
  Copy,
  Coffee,
  Plus,
  Trash2,
  SlidersHorizontal,
  RefreshCw,
  MessageSquare,
  ExternalLink,
  MapPin,
  Edit3,
  Sparkles,
  FileText,
  Clock,
  CreditCard,
  Users,
  X,
} from "lucide-react";
import {
  type DuplicateChannel,
  type DuplicatePaymentMode,
  type DuplicateHoldPreset,
  type DuplicateChargeDraft,
  type DuplicatePeriodSlot,
  type DuplicateHandoffDraft,
  isValidIsoDate,
  addDaysIso,
  diffNightsIso,
  formatIsoShortBr,
  formatIsoFullBr,
  getTodayIsoLocal,
  getDefaultDuplicateHoldPreset,
  extractOriginalNights,
  extractOriginalCharges,
  extractOriginalDailyRate,
  extractOriginalChannel,
  extractOriginalPaymentMethod,
  resolveInitialDuplicatePaymentMode,
  extractOriginalNotesBundle,
  getFlatBusyNightsSet,
  evaluateDuplicateSlotAvailability,
  computeDuplicateSlotTotal,
  buildDuplicateReservationPayload,
} from "@/lib/duplicate-reservation";

export interface DuplicateReservationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceReservation: any | null;
  flats?: any[];
  reservations?: any[];
  blocks?: any[];
  onDuplicated?: (createdReservations: any[]) => void;
  onOpenFullEditor?: (draft: DuplicateHandoffDraft) => void;
  onOpenEditCreated?: (createdRes: any) => void;
  onFocusInMap?: (checkinDate: string, flatNumber: string) => void;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const CHANNEL_OPTIONS: Array<{ value: DuplicateChannel; label: string; dot: string }> = [
  { value: "whatsapp", label: "WhatsApp", dot: "bg-emerald-500" },
  { value: "site", label: "Site", dot: "bg-orange-500" },
  { value: "booking", label: "Booking", dot: "bg-sky-500" },
  { value: "airbnb", label: "Airbnb", dot: "bg-rose-500" },
  { value: "b2b", label: "B2B", dot: "bg-violet-500" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência / TED" },
];

function formatBrl(val: number): string {
  return (Number(val) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildMonthGrid(year: number, monthIndex: number): Array<{ iso: string; day: number; inMonth: boolean }> {
  const firstDayOfWeek = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(year, monthIndex, -i));
    const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    cells.push({ iso, day: dt.getUTCDate(), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, day: d, inMonth: true });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= trailing; d++) {
    const dt = new Date(Date.UTC(year, monthIndex + 1, d));
    const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    cells.push({ iso, day: dt.getUTCDate(), inMonth: false });
  }
  return cells;
}

export function DuplicateReservationModal({
  open,
  onOpenChange,
  sourceReservation,
  flats: propFlats,
  reservations: propReservations,
  blocks: propBlocks,
  onDuplicated,
  onOpenFullEditor,
  onOpenEditCreated,
  onFocusInMap,
}: DuplicateReservationModalProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const formUid = useId();

  const [resolvedSource, setResolvedSource] = useState<any | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);

  const [fetchedFlats, setFetchedFlats] = useState<any[]>([]);
  const [fetchedReservations, setFetchedReservations] = useState<any[]>([]);
  const [fetchedBlocks, setFetchedBlocks] = useState<any[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const [fairShareByRange, setFairShareByRange] = useState<Record<string, any>>({});
  const fairSharePendingRef = useRef<Set<string>>(new Set());

  const [slots, setSlots] = useState<DuplicatePeriodSlot[]>([]);
  const [activeSlotUid, setActiveSlotUid] = useState<string>("slot_1");
  const [selectingEndForUid, setSelectingEndForUid] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [dailyRateInput, setDailyRateInput] = useState<string>("");
  const [charges, setCharges] = useState<DuplicateChargeDraft[]>([]);
  const [addingChargeOpen, setAddingChargeOpen] = useState(false);
  const [newChargeTitle, setNewChargeTitle] = useState("");
  const [newChargeAmount, setNewChargeAmount] = useState("");
  const [includeBreakfast, setIncludeBreakfast] = useState(false);

  const [channel, setChannel] = useState<DuplicateChannel>("whatsapp");
  const [paymentMode, setPaymentMode] = useState<DuplicatePaymentMode>("confirmed_pending");
  const [paymentMethod, setPaymentMethod] = useState<string>("pix");
  const [holdPreset, setHoldPreset] = useState<DuplicateHoldPreset>("until_2359");

  const [notes, setNotes] = useState("");
  const [receptionNotes, setReceptionNotes] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [pullOriginalNotes, setPullOriginalNotes] = useState(false);

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});
  const [liveStatusMsg, setLiveStatusMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [createdReservations, setCreatedReservations] = useState<any[]>([]);
  const [copiedPortalCode, setCopiedPortalCode] = useState<string | null>(null);

  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const checkinInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const flatSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  const effectiveFlats = useMemo(
    () => (Array.isArray(propFlats) && propFlats.length > 0 ? propFlats : fetchedFlats),
    [propFlats, fetchedFlats]
  );
  const effectiveReservations = useMemo(
    () => (Array.isArray(propReservations) && propReservations.length > 0 ? propReservations : fetchedReservations),
    [propReservations, fetchedReservations]
  );
  const effectiveBlocks = useMemo(
    () => (Array.isArray(propBlocks) && propBlocks.length > 0 ? propBlocks : fetchedBlocks),
    [propBlocks, fetchedBlocks]
  );

  const todayIso = useMemo(() => getTodayIsoLocal(), [open]);

  const activeSource = resolvedSource || sourceReservation;
  const origNights = useMemo(() => extractOriginalNights(activeSource), [activeSource]);
  const origNotesBundle = useMemo(() => extractOriginalNotesBundle(activeSource), [activeSource]);

  const origFlatId = useMemo(() => {
    if (!activeSource) return "";
    if (activeSource.flatId !== undefined && activeSource.flatId !== null && String(activeSource.flatId) !== "") {
      return String(activeSource.flatId);
    }
    if (activeSource.flatNumber && effectiveFlats.length > 0) {
      const match = effectiveFlats.find((f: any) => String(f?.number) === String(activeSource.flatNumber));
      if (match?.id !== undefined) return String(match.id);
    }
    return "";
  }, [activeSource, effectiveFlats]);

  const initializeFormFromSource = useCallback(
    (res: any, availableFlats: any[]) => {
      const resolvedFlatId =
        res?.flatId !== undefined && res?.flatId !== null && String(res.flatId) !== ""
          ? String(res.flatId)
          : (() => {
              const m = availableFlats.find((f: any) => String(f?.number) === String(res?.flatNumber));
              return m?.id !== undefined ? String(m.id) : "";
            })();

      const initCharges = extractOriginalCharges(res);
      const initDailyRate = extractOriginalDailyRate(res, initCharges);
      const initChannel = extractOriginalChannel(res);
      const initPayMode = resolveInitialDuplicatePaymentMode(res);
      const initPayMethod = extractOriginalPaymentMethod(res, initChannel, initPayMode);

      const firstSlot: DuplicatePeriodSlot = {
        uid: "slot_1",
        checkinDate: "",
        checkoutDate: "",
        flatId: resolvedFlatId,
        flatManuallyChosen: false,
      };

      setSlots([firstSlot]);
      setActiveSlotUid("slot_1");
      setSelectingEndForUid(null);

      // Abre o calendário no mês atual (ou no mês do checkout original se for futuro)
      const now = new Date();
      let initYear = now.getFullYear();
      let initMonth = now.getMonth();
      const origRefDate = isValidIsoDate(res?.checkoutDate) ? res.checkoutDate : res?.checkinDate;
      if (isValidIsoDate(origRefDate) && origRefDate > getTodayIsoLocal()) {
        const [y, m] = origRefDate.split("-").map(Number);
        initYear = y;
        initMonth = m - 1;
      }
      setCalendarMonth({ year: initYear, month: initMonth });

      setDailyRateInput(initDailyRate > 0 ? String(initDailyRate) : "");
      setCharges(initCharges);
      setAddingChargeOpen(false);
      setNewChargeTitle("");
      setNewChargeAmount("");
      setIncludeBreakfast(Boolean(res?.includeBreakfast || res?.hasBreakfast));
      setChannel(initChannel);
      setPaymentMode(initPayMode);
      setPaymentMethod(initPayMethod);
      setHoldPreset("until_2359");
      setNotes("");
      setReceptionNotes("");
      setSpecialRequests("");
      setPullOriginalNotes(false);
      setSubmitAttempted(false);
      setSlotErrors({});
      setLiveStatusMsg("");
      setCreatedReservations([]);
      setCopiedPortalCode(null);
    },
    []
  );

  // Hidrata reserva completa e dados de disponibilidade quando abrir
  useEffect(() => {
    if (!open || !sourceReservation) {
      return;
    }

    let cancelled = false;
    setResolvedSource(sourceReservation);
    initializeFormFromSource(sourceReservation, effectiveFlats);

    const needsFullRes =
      !Array.isArray(sourceReservation.guests) ||
      sourceReservation.flatId === undefined ||
      sourceReservation.flatId === null ||
      sourceReservation.dailyRate === undefined;

    const needsCalendar =
      !Array.isArray(propFlats) ||
      propFlats.length === 0 ||
      !Array.isArray(propReservations) ||
      propReservations.length === 0;

    const loadAll = async () => {
      const tasks: Promise<void>[] = [];

      if (needsFullRes && (sourceReservation.id || sourceReservation.code)) {
        setLoadingSource(true);
        const key = encodeURIComponent(String(sourceReservation.id || sourceReservation.code));
        tasks.push(
          fetch(`/api/pms/reservations/${key}`, { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
              if (!cancelled && json?.reservation) {
                setResolvedSource(json.reservation);
                initializeFormFromSource(json.reservation, effectiveFlats);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (!cancelled) setLoadingSource(false);
            })
        );
      }

      if (needsCalendar) {
        setLoadingCalendar(true);
        const startStr = addDaysIso(getTodayIsoLocal(), -14);
        const endStr = addDaysIso(getTodayIsoLocal(), 365);
        tasks.push(
          fetch(`/api/pms/calendar?startDate=${startStr}&endDate=${endStr}&_t=${Date.now()}`, {
            credentials: "include",
            cache: "no-store",
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
              if (!cancelled && json) {
                const fl = Array.isArray(json.flats) ? json.flats : [];
                const rs = Array.isArray(json.reservations) ? json.reservations : [];
                const bl = Array.isArray(json.blocks) ? json.blocks : [];
                setFetchedFlats(fl);
                setFetchedReservations(rs);
                setFetchedBlocks(bl);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (!cancelled) setLoadingCalendar(false);
            })
        );
      }

      await Promise.all(tasks);
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [open, sourceReservation]);

  // Se flatId veio vazio porque os flats só chegaram depois do fetch do calendário, preenche automaticamente
  useEffect(() => {
    if (!open || !origFlatId) return;
    setSlots((prev) =>
      prev.map((s) => (!s.flatId && !s.flatManuallyChosen ? { ...s, flatId: origFlatId } : s))
    );
  }, [open, origFlatId]);

  // Busca Fair Share sob demanda para cada período válido no modal (para a sugestão de 1 clique ser fiel ao rodízio!)
  useEffect(() => {
    if (!open || createdReservations.length > 0) return;
    for (const s of slots) {
      if (!isValidIsoDate(s.checkinDate) || !isValidIsoDate(s.checkoutDate) || s.checkoutDate <= s.checkinDate) {
        continue;
      }
      const rangeKey = `${s.checkinDate}|${s.checkoutDate}`;
      if (fairShareByRange[rangeKey] || fairSharePendingRef.current.has(rangeKey)) continue;
      fairSharePendingRef.current.add(rangeKey);
      fetch(
        `/api/pms/fair-share-flat?checkin=${s.checkinDate}&checkout=${s.checkoutDate}&_t=${Date.now()}`,
        { credentials: "include" }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json) {
            setFairShareByRange((prev) => ({
              ...prev,
              [rangeKey]: { ...json, _checkin: s.checkinDate, _checkout: s.checkoutDate },
            }));
          }
        })
        .catch(() => {})
        .finally(() => {
          fairSharePendingRef.current.delete(rangeKey);
        });
    }
  }, [open, slots, fairShareByRange, createdReservations.length]);

  // Foca o título do passo de sucesso ao concluir a duplicação (acessibilidade + teclado)
  useEffect(() => {
    if (createdReservations.length > 0) {
      requestAnimationFrame(() => {
        successHeadingRef.current?.focus();
      });
    }
  }, [createdReservations.length]);

  const parsedDailyRate = useMemo(() => {
    const norm = String(dailyRateInput || "").replace(",", ".").trim();
    const num = Number(norm);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  }, [dailyRateInput]);

  const slotAvailabilityMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof evaluateDuplicateSlotAvailability>> = {};
    for (const slot of slots) {
      const rangeKey = `${slot.checkinDate}|${slot.checkoutDate}`;
      const fs = fairShareByRange[rangeKey] || null;
      map[slot.uid] = evaluateDuplicateSlotAvailability({
        slot,
        otherSlots: slots.filter((o) => o.uid !== slot.uid),
        originalFlatId: origFlatId,
        flats: effectiveFlats,
        reservations: effectiveReservations,
        blocks: effectiveBlocks,
        fairShareResult: fs,
      });
    }
    return map;
  }, [slots, origFlatId, effectiveFlats, effectiveReservations, effectiveBlocks, fairShareByRange]);

  const activeSlot = useMemo(
    () => slots.find((s) => s.uid === activeSlotUid) || slots[0] || null,
    [slots, activeSlotUid]
  );

  const activeBusyNights = useMemo(() => {
    if (!activeSlot?.flatId) return new Set<string>();
    return getFlatBusyNightsSet({
      flatId: activeSlot.flatId,
      flats: effectiveFlats,
      reservations: effectiveReservations,
      blocks: effectiveBlocks,
      otherSlots: slots.filter((s) => s.uid !== activeSlot.uid),
    });
  }, [activeSlot, effectiveFlats, effectiveReservations, effectiveBlocks, slots]);

  const monthCells = useMemo(
    () => buildMonthGrid(calendarMonth.year, calendarMonth.month),
    [calendarMonth.year, calendarMonth.month]
  );

  const updateSlot = (uid: string, patch: Partial<DuplicatePeriodSlot>) => {
    setSlots((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
    setSlotErrors((prev) => {
      if (!prev[uid]) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const handleDayClick = (iso: string) => {
    if (!activeSlot) return;
    const uid = activeSlot.uid;

    // Se já estamos ajustando o check-out após escolher o check-in, e clicou num dia posterior: ajusta só o check-out!
    if (
      selectingEndForUid === uid &&
      isValidIsoDate(activeSlot.checkinDate) &&
      iso > activeSlot.checkinDate
    ) {
      updateSlot(uid, { checkoutDate: iso });
      setSelectingEndForUid(null);
      return;
    }

    // Novo check-in: preenche automaticamente o check-out mantendo a mesma duração de noites da reserva original!
    const nextCheckout = addDaysIso(iso, origNights);
    updateSlot(uid, { checkinDate: iso, checkoutDate: nextCheckout });
    setSelectingEndForUid(uid);
    if (paymentMode === "pre_reserva") {
      setHoldPreset(getDefaultDuplicateHoldPreset(iso, todayIso));
    }
  };

  const handleManualCheckinChange = (uid: string, val: string) => {
    const slot = slots.find((s) => s.uid === uid);
    if (!slot) return;
    if (isValidIsoDate(val)) {
      const currentNights =
        isValidIsoDate(slot.checkinDate) && isValidIsoDate(slot.checkoutDate) && slot.checkoutDate > slot.checkinDate
          ? diffNightsIso(slot.checkinDate, slot.checkoutDate)
          : origNights;
      const nextCout = addDaysIso(val, Math.max(1, currentNights));
      updateSlot(uid, { checkinDate: val, checkoutDate: nextCout });
      const [y, m] = val.split("-").map(Number);
      setCalendarMonth({ year: y, month: m - 1 });
      if (paymentMode === "pre_reserva") {
        setHoldPreset(getDefaultDuplicateHoldPreset(val, todayIso));
      }
    } else {
      updateSlot(uid, { checkinDate: val });
    }
  };

  const handleManualCheckoutChange = (uid: string, val: string) => {
    updateSlot(uid, { checkoutDate: val });
    setSelectingEndForUid(null);
  };

  const handleAdjustNights = (uid: string, delta: number) => {
    const slot = slots.find((s) => s.uid === uid);
    if (!slot || !isValidIsoDate(slot.checkinDate)) return;
    const curNights = Math.max(1, diffNightsIso(slot.checkinDate, slot.checkoutDate) || origNights);
    const nextNights = Math.max(1, curNights + delta);
    updateSlot(uid, { checkoutDate: addDaysIso(slot.checkinDate, nextNights) });
    setSelectingEndForUid(null);
  };

  const handleAddPeriodSlot = () => {
    const newUid = `slot_${Date.now()}_${slots.length + 1}`;
    const newSlot: DuplicatePeriodSlot = {
      uid: newUid,
      checkinDate: "",
      checkoutDate: "",
      flatId: origFlatId || slots[0]?.flatId || "",
      flatManuallyChosen: false,
    };
    setSlots((prev) => [...prev, newSlot]);
    setActiveSlotUid(newUid);
    setSelectingEndForUid(null);
  };

  const handleRemovePeriodSlot = (uid: string) => {
    if (slots.length <= 1) return;
    const nextSlots = slots.filter((s) => s.uid !== uid);
    setSlots(nextSlots);
    if (activeSlotUid === uid) {
      setActiveSlotUid(nextSlots[nextSlots.length - 1].uid);
    }
    setSlotErrors((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const handleChannelChange = (nextChan: DuplicateChannel) => {
    setChannel(nextChan);
    const isOta = nextChan === "booking" || nextChan === "airbnb";
    const isB2b = nextChan === "b2b";
    if (isOta) {
      setPaymentMethod(nextChan);
      if (paymentMode === "pre_reserva" || paymentMode === "faturado") {
        setPaymentMode("confirmed_paid");
      }
    } else if (isB2b) {
      setPaymentMethod(paymentMode === "faturado" ? "faturado_b2b" : "vcn_b2b");
      if (paymentMode === "pre_reserva") {
        setPaymentMode("confirmed_pending");
      }
    } else {
      if (["booking", "airbnb", "vcn_b2b", "faturado_b2b"].includes(paymentMethod)) {
        setPaymentMethod(paymentMode === "faturado" ? "boleto_faturado" : "pix");
      }
    }
  };

  const handlePaymentModeChange = (nextMode: DuplicatePaymentMode) => {
    setPaymentMode(nextMode);
    if (nextMode === "faturado") {
      setPaymentMethod(channel === "b2b" ? "faturado_b2b" : "boleto_faturado");
    } else if (nextMode === "confirmed_paid") {
      if (channel === "booking" || channel === "airbnb") {
        setPaymentMethod(channel);
      } else if (channel === "b2b") {
        setPaymentMethod("vcn_b2b");
      } else if (["boleto_faturado", "faturado_b2b", "booking", "airbnb", "vcn_b2b"].includes(paymentMethod)) {
        setPaymentMethod("pix");
      }
    } else if (nextMode === "pre_reserva") {
      const firstCin = slots[0]?.checkinDate;
      setHoldPreset(getDefaultDuplicateHoldPreset(firstCin, todayIso));
    }
  };

  const handleTogglePullOriginalNotes = (checked: boolean) => {
    setPullOriginalNotes(checked);
    if (checked) {
      setNotes(origNotesBundle.notes);
      setReceptionNotes(origNotesBundle.receptionNotes);
      setSpecialRequests(origNotesBundle.specialRequests);
    } else {
      setNotes("");
      setReceptionNotes("");
      setSpecialRequests("");
    }
  };

  const handleAddCharge = () => {
    const title = newChargeTitle.trim() || "Taxa Adicional";
    const amount = Number(String(newChargeAmount).replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) return;
    setCharges((prev) => [
      ...prev,
      {
        id: `dup_charge_${Date.now()}`,
        type: title.toLowerCase().includes("limpeza")
          ? "cleaning"
          : title.toLowerCase().includes("pet")
            ? "pet"
            : "other",
        title,
        amount,
      },
    ]);
    setNewChargeTitle("");
    setNewChargeAmount("");
    setAddingChargeOpen(false);
  };

  const handleRemoveCharge = (id: string) => {
    setCharges((prev) => prev.filter((c) => c.id !== id));
  };

  const grandTotals = useMemo(() => {
    let totalAmount = 0;
    let totalNights = 0;
    for (const s of slots) {
      if (isValidIsoDate(s.checkinDate) && isValidIsoDate(s.checkoutDate) && s.checkoutDate > s.checkinDate) {
        const calc = computeDuplicateSlotTotal(s.checkinDate, s.checkoutDate, parsedDailyRate, charges);
        totalAmount += calc.total;
        totalNights += calc.nights;
      }
    }
    return { totalAmount, totalNights };
  }, [slots, parsedDailyRate, charges]);

  const handleOpenFullEditorClick = () => {
    if (!activeSource || !onOpenFullEditor) return;
    const primary = slots[0] || {
      uid: "slot_1",
      checkinDate: "",
      checkoutDate: "",
      flatId: origFlatId,
      flatManuallyChosen: false,
    };
    const origCode = String(activeSource.code || activeSource.reservationCode || activeSource.id || "").trim();
    const draft: DuplicateHandoffDraft = {
      sourceRes: activeSource,
      duplicatedFromId: activeSource.id ?? null,
      duplicatedFromCode: origCode,
      checkinDate: primary.checkinDate,
      checkoutDate: primary.checkoutDate,
      flatId: primary.flatId || origFlatId,
      dailyRate: parsedDailyRate,
      charges,
      includeBreakfast,
      channel,
      paymentMode,
      paymentMethod,
      holdPreset,
      notes,
      receptionNotes,
      specialRequests,
    };
    onOpenChange(false);
    onOpenFullEditor(draft);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSource || submitting) return;
    setSubmitAttempted(true);

    const nextErrors: Record<string, string> = {};
    let firstInvalidUid: string | null = null;
    let firstInvalidKind: "date" | "flat" | null = null;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const avail = slotAvailabilityMap[s.uid];
      if (!isValidIsoDate(s.checkinDate) || !isValidIsoDate(s.checkoutDate) || s.checkoutDate <= s.checkinDate) {
        nextErrors[s.uid] = "Selecione as datas de check-in e check-out para este período.";
        if (!firstInvalidUid) {
          firstInvalidUid = s.uid;
          firstInvalidKind = "date";
        }
        continue;
      }
      if (!s.flatId) {
        nextErrors[s.uid] = "Selecione um apartamento disponível para este período.";
        if (!firstInvalidUid) {
          firstInvalidUid = s.uid;
          firstInvalidKind = "flat";
        }
        continue;
      }
      if (avail && !avail.isAvailable) {
        nextErrors[s.uid] = avail.conflictLabel || "O apartamento selecionado está ocupado neste período.";
        if (!firstInvalidUid) {
          firstInvalidUid = s.uid;
          firstInvalidKind = "flat";
        }
      }
    }

    if (firstInvalidUid) {
      setSlotErrors(nextErrors);
      setActiveSlotUid(firstInvalidUid);
      setLiveStatusMsg(nextErrors[firstInvalidUid]);
      requestAnimationFrame(() => {
        if (firstInvalidKind === "flat") {
          flatSelectRefs.current[firstInvalidUid!]?.focus();
        } else {
          checkinInputRefs.current[firstInvalidUid!]?.focus();
        }
      });
      return;
    }

    setSubmitting(true);
    setSlotErrors({});
    setLiveStatusMsg("");

    const created: any[] = [];
    const failedErrors: Array<{ slotIdx: number; uid: string; message: string }> = [];

    try {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const payload = buildDuplicateReservationPayload({
          sourceRes: activeSource,
          slot: s,
          dailyRate: parsedDailyRate,
          charges,
          includeBreakfast,
          channel,
          paymentMode,
          paymentMethod,
          holdPreset,
          notes,
          receptionNotes,
          specialRequests,
        });

        const resp = await fetch("/api/pms/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });

        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          failedErrors.push({
            slotIdx: i + 1,
            uid: s.uid,
            message: json?.error || `Erro ao criar período ${i + 1} (HTTP ${resp.status}).`,
          });
          continue;
        }
        created.push(json?.reservation || json);
      }

      if (created.length > 0) {
        onDuplicated?.(created);
        setCreatedReservations(created);
        setLiveStatusMsg(
          created.length === 1
            ? `Reserva ${created[0]?.code || ""} duplicada com sucesso!`
            : `${created.length} reservas duplicadas com sucesso!`
        );
      }

      if (failedErrors.length > 0) {
        const errMap: Record<string, string> = {};
        for (const fe of failedErrors) {
          errMap[fe.uid] = fe.message;
        }
        setSlotErrors(errMap);
        toast({
          title:
            created.length > 0
              ? `${created.length} criada(s), mas ${failedErrors.length} período(s) falharam`
              : "Não foi possível duplicar a reserva",
          description: failedErrors.map((f) => `Período ${f.slotIdx}: ${f.message}`).join(" • "),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão ao duplicar reserva",
        description: err?.message || "Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeSource) return null;

  const origCode = String(activeSource.code || activeSource.reservationCode || activeSource.id || "").trim();
  const guestName =
    activeSource.guestName || activeSource.guests?.[0]?.name || "Hóspede Sem Nome";
  const companionsCount = Math.max(
    0,
    (Array.isArray(activeSource.guests) ? activeSource.guests.length : Number(activeSource.guestCount || 1)) - 1
  );
  const origFlatNum =
    activeSource.flatNumber ||
    effectiveFlats.find((f: any) => String(f?.id) === String(origFlatId))?.number ||
    "—";
  const origCompanyOrAgency =
    activeSource.agencyTradeName || activeSource.agencyName || activeSource.companyName || "";
  const hasExternalMarkers = Boolean(
    activeSource.packageCode ||
      activeSource.externalOrderId ||
      activeSource.b2bLocatorRloc ||
      activeSource.b2bReservationNumber ||
      activeSource.b2bVcnToken ||
      activeSource.voucherUrl
  );

  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://corpflats.com.br";
  const isOtaChannel = channel === "booking" || channel === "airbnb";
  const isB2bChannel = channel === "b2b";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-[100vw] sm:max-w-xl max-h-[92dvh] overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Região acessível para anúncios dinâmicos */}
        <div role="status" aria-live="polite" className="sr-only">
          {liveStatusMsg}
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* ESTADO DE SUCESSO PÓS-CRIAÇÃO                                        */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {createdReservations.length > 0 ? (
          <div className="space-y-4">
            <DialogHeader className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <DialogTitle asChild>
                    <h2
                      ref={successHeadingRef}
                      tabIndex={-1}
                      className="text-base sm:text-lg font-black text-foreground outline-none"
                    >
                      {createdReservations.length === 1
                        ? "Reserva Duplicada com Sucesso!"
                        : `${createdReservations.length} Reservas Duplicadas com Sucesso!`}
                    </h2>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Originada de <span className="font-mono font-bold">#{origCode}</span> • {guestName}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2.5 max-h-[52dvh] overflow-y-auto pr-0.5 overscroll-contain">
              {createdReservations.map((resObj: any) => {
                const newCode = String(resObj.code || resObj.reservationCode || resObj.id);
                const newFlatNum = resObj.flatNumber || "—";
                const nights = Math.max(1, diffNightsIso(resObj.checkinDate, resObj.checkoutDate));
                const portalUrl = `${originUrl}/minha-reserva/${encodeURIComponent(newCode)}`;
                const waPhone = cleanWhatsAppPhone(
                  resObj.guestPhone || resObj.guests?.[0]?.phone || resObj.requesterInfo?.phone || ""
                );
                const waText = `Olá ${resObj.guestName || guestName}! Confirmamos sua nova reserva #${newCode} no Flat ${newFlatNum} (${formatIsoShortBr(resObj.checkinDate)} a ${formatIsoShortBr(resObj.checkoutDate)}). Acesse seu portal: ${portalUrl}`;
                const waWebUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}` : null;

                return (
                  <div
                    key={newCode}
                    className="p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-black text-emerald-800 dark:text-emerald-300">
                            #{newCode}
                          </span>
                          <Badge variant="outline" className="text-[10px] font-bold">
                            Flat {newFlatNum}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold",
                              resObj.status === "pre_reserva"
                                ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300"
                                : resObj.paymentStatus === "pago_total"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300"
                            )}
                          >
                            {resObj.status === "pre_reserva"
                              ? "⏳ Pré-Reserva"
                              : resObj.isFaturadoBoleto
                                ? "📄 Faturado"
                                : resObj.paymentStatus === "pago_total"
                                  ? "✓ Confirmada e Paga"
                                  : "🕒 Aguardando Pagto"}
                          </Badge>
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          {formatIsoFullBr(resObj.checkinDate)} → {formatIsoFullBr(resObj.checkoutDate)}{" "}
                          <span className="text-muted-foreground font-normal">
                            ({nights} {nights === 1 ? "diária" : "diárias"})
                          </span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-foreground">
                          R$ {formatBrl(Number(resObj.totalAmount || 0))}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-200/60 dark:border-emerald-900/60">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Copiar link do portal da reserva ${newCode}`}
                        onClick={() => {
                          navigator.clipboard.writeText(portalUrl);
                          setCopiedPortalCode(newCode);
                          toast({
                            title: `Link do Portal (#${newCode}) copiado!`,
                            description: "Pronto para enviar ao hóspede.",
                          });
                          setTimeout(() => setCopiedPortalCode(null), 2000);
                        }}
                        className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl cursor-pointer"
                      >
                        {copiedPortalCode === newCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{copiedPortalCode === newCode ? "Copiado!" : "Link Portal"}</span>
                      </Button>

                      {waPhone && (
                        <>
                          <a
                            href={`/whatsapp-chat?phone=${waPhone}`}
                            aria-label={`Abrir Chat PMS para reserva ${newCode}`}
                            className="inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Chat PMS</span>
                          </a>
                          {waWebUrl && (
                            <a
                              href={waWebUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Abrir WhatsApp Web para reserva ${newCode}`}
                              className="inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                        </>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Ver reserva ${newCode} no Mapa`}
                        onClick={() => {
                          onOpenChange(false);
                          if (onFocusInMap) {
                            onFocusInMap(resObj.checkinDate, String(newFlatNum));
                          } else {
                            setLocation(
                              `/reservas?focusDate=${encodeURIComponent(resObj.checkinDate)}&focusFlat=${encodeURIComponent(String(newFlatNum))}`
                            );
                          }
                        }}
                        className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                        <span>Ver no Mapa</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Abrir edição completa da reserva ${newCode}`}
                        onClick={() => {
                          onOpenChange(false);
                          if (onOpenEditCreated) {
                            onOpenEditCreated(resObj);
                          } else {
                            setLocation(`/reservas?editCode=${encodeURIComponent(newCode)}`);
                          }
                        }}
                        className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Abrir Edição</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="gap-2 sm:justify-between pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => initializeFormFromSource(activeSource, effectiveFlats)}
                className="text-xs font-bold gap-1.5 rounded-xl cursor-pointer"
              >
                <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Duplicar outra data</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs font-bold rounded-xl min-w-[96px] cursor-pointer"
              >
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════════════════ */
          /* FORMULÁRIO ULTRARRÁPIDO DE DUPLICAÇÃO                              */
          /* ══════════════════════════════════════════════════════════════════ */
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-2 pr-6">
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-black min-w-0">
                  <CopyPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">Duplicar Reserva #{origCode}</span>
                </DialogTitle>
                {(loadingSource || loadingCalendar) && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground shrink-0">
                    <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
                    Carregando...
                  </span>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Escolha a(s) nova(s) data(s) para criar uma cópia rápida mantendo hóspede, flat e diária.
              </DialogDescription>
            </DialogHeader>

            {/* Resumo Compacto da Reserva Original (Herdado Automaticamente) */}
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                  <span className="font-black text-foreground truncate">{guestName}</span>
                  {companionsCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                      +{companionsCount} acomp.
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px] font-bold">
                    Flat {origFlatNum}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {origNights} {origNights === 1 ? "noite" : "noites"}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                {origCompanyOrAgency && (
                  <span className="font-semibold text-foreground/85 truncate max-w-[240px]">
                    🏢 {origCompanyOrAgency}
                  </span>
                )}
                <span>
                  Original: {formatIsoShortBr(activeSource.checkinDate)} → {formatIsoShortBr(activeSource.checkoutDate)}
                </span>
                {activeSource.vehicle?.plate && (
                  <span>🚗 {activeSource.vehicle.plate}</span>
                )}
                {activeSource.twinBeds && <span>🛏️ Twin</span>}
                {activeSource.isFlatLocked && <span>🔒 Flat Travado</span>}
              </div>
              {hasExternalMarkers && (
                <p className="text-[10.5px] text-amber-700 dark:text-amber-300 font-medium pt-0.5">
                  ℹ️ Códigos externos, VCN/voucher e vínculo de pacote antigo não serão copiados (será criada como reserva individual limpa).
                </p>
              )}
            </div>

            {/* ── Seção 1: Período(s) e Flat(s) ──────────────────────────── */}
            <fieldset className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                  <span>{slots.length === 1 ? "Nova Data e Flat" : `Períodos da Duplicação (${slots.length})`}</span>
                </legend>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddPeriodSlot}
                  className="h-7 px-2 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 gap-1 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Adicionar outro período</span>
                </Button>
              </div>

              <div className="space-y-2.5">
                {slots.map((slot, idx) => {
                  const isActive = slot.uid === activeSlot?.uid;
                  const avail = slotAvailabilityMap[slot.uid];
                  const slotError = slotErrors[slot.uid];
                  const slotErrorId = `${formUid}-slot-err-${slot.uid}`;
                  const cinId = `${formUid}-cin-${slot.uid}`;
                  const coutId = `${formUid}-cout-${slot.uid}`;
                  const flatSelId = `${formUid}-flat-${slot.uid}`;
                  const slotCalc = computeDuplicateSlotTotal(
                    slot.checkinDate,
                    slot.checkoutDate,
                    parsedDailyRate,
                    charges
                  );

                  return (
                    <div
                      key={slot.uid}
                      className={cn(
                        "rounded-2xl border p-3 transition-all space-y-2.5",
                        slotError
                          ? "border-rose-400 bg-rose-50/40 dark:bg-rose-950/20"
                          : isActive
                            ? "border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-950/60 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
                      )}
                    >
                      {/* Cabeçalho do Período (sempre visível quando há >1 período, ou resumo rápido) */}
                      {slots.length > 1 && (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSlotUid(slot.uid)}
                            className="flex items-center gap-1.5 text-left text-xs font-extrabold text-foreground cursor-pointer"
                          >
                            <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 inline-flex items-center justify-center text-[10px] font-black">
                              {idx + 1}
                            </span>
                            <span>
                              {avail?.isValidRange
                                ? `${formatIsoShortBr(slot.checkinDate)} → ${formatIsoShortBr(slot.checkoutDate)} (${avail.nights}d)`
                                : `Período ${idx + 1} — Escolha as datas`}
                            </span>
                            {avail?.selectedFlatNumber && (
                              <Badge variant="outline" className="text-[10px] font-bold">
                                Flat {avail.selectedFlatNumber}
                              </Badge>
                            )}
                            {avail?.isValidRange && (
                              <span
                                className={cn(
                                  "text-[10px] font-bold",
                                  avail.isAvailable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                )}
                              >
                                {avail.isAvailable ? "✓ Livre" : "⚠ Ocupado"}
                              </span>
                            )}
                          </button>
                          <div className="flex items-center gap-1">
                            {!isActive && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setActiveSlotUid(slot.uid)}
                                className="h-7 px-2 text-[11px] font-semibold cursor-pointer"
                              >
                                Editar
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Remover período ${idx + 1}`}
                              onClick={() => handleRemovePeriodSlot(slot.uid)}
                              className="h-7 w-7 text-muted-foreground hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Inputs de Data + Stepper de Noites */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-5 space-y-1">
                          <Label htmlFor={cinId} className="text-[11px] font-bold">
                            Check-in <span aria-hidden="true" className="text-rose-500">*</span>
                          </Label>
                          <Input
                            ref={(el) => {
                              checkinInputRefs.current[slot.uid] = el;
                            }}
                            id={cinId}
                            name={`checkin_${idx}`}
                            type="date"
                            required
                            value={slot.checkinDate}
                            onFocus={() => setActiveSlotUid(slot.uid)}
                            onChange={(e) => handleManualCheckinChange(slot.uid, e.target.value)}
                            aria-invalid={Boolean(slotError && !avail?.isValidRange)}
                            aria-describedby={slotError ? slotErrorId : undefined}
                            className="h-10 sm:h-9 text-base sm:text-xs font-semibold"
                          />
                        </div>

                        <div className="sm:col-span-5 space-y-1">
                          <Label htmlFor={coutId} className="text-[11px] font-bold">
                            Check-out <span aria-hidden="true" className="text-rose-500">*</span>
                          </Label>
                          <Input
                            id={coutId}
                            name={`checkout_${idx}`}
                            type="date"
                            required
                            min={isValidIsoDate(slot.checkinDate) ? addDaysIso(slot.checkinDate, 1) : undefined}
                            value={slot.checkoutDate}
                            onFocus={() => setActiveSlotUid(slot.uid)}
                            onChange={(e) => handleManualCheckoutChange(slot.uid, e.target.value)}
                            aria-invalid={Boolean(slotError && !avail?.isValidRange)}
                            aria-describedby={slotError ? slotErrorId : undefined}
                            className="h-10 sm:h-9 text-base sm:text-xs font-semibold"
                          />
                        </div>

                        <div className="sm:col-span-2 flex sm:flex-col items-center justify-between sm:justify-end gap-1">
                          <span className="text-[10.5px] font-bold text-muted-foreground">
                            {avail?.isValidRange ? `${avail.nights} ${avail.nights === 1 ? "noite" : "noites"}` : `${origNights}d padrão`}
                          </span>
                          <div className="inline-flex items-center rounded-lg border bg-background overflow-hidden">
                            <button
                              type="button"
                              aria-label={`Diminuir noites do período ${idx + 1}`}
                              disabled={!isValidIsoDate(slot.checkinDate) || (avail?.nights || 1) <= 1}
                              onClick={() => handleAdjustNights(slot.uid, -1)}
                              className="h-7 w-7 text-xs font-black hover:bg-muted disabled:opacity-40 cursor-pointer"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              aria-label={`Aumentar noites do período ${idx + 1}`}
                              disabled={!isValidIsoDate(slot.checkinDate)}
                              onClick={() => handleAdjustNights(slot.uid, 1)}
                              className="h-7 w-7 text-xs font-black border-l hover:bg-muted disabled:opacity-40 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Calendário Visual Inline (no período ativo) */}
                      {isActive && (
                        <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Mês anterior"
                              onClick={() =>
                                setCalendarMonth((prev) =>
                                  prev.month === 0
                                    ? { year: prev.year - 1, month: 11 }
                                    : { year: prev.year, month: prev.month - 1 }
                                )
                              }
                              className="h-7 w-7 rounded-lg cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                            </Button>

                            <div className="text-center">
                              <span className="text-xs font-black text-foreground">
                                {MONTH_NAMES_PT[calendarMonth.month]} de {calendarMonth.year}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {selectingEndForUid === slot.uid && isValidIsoDate(slot.checkinDate)
                                  ? `Check-in ${formatIsoShortBr(slot.checkinDate)} definido • clique outro dia p/ ajustar saída`
                                  : `Clique no novo check-in (preenche ${origNights} ${origNights === 1 ? "noite" : "noites"} automaticamente)`}
                              </span>
                            </div>

                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Próximo mês"
                              onClick={() =>
                                setCalendarMonth((prev) =>
                                  prev.month === 11
                                    ? { year: prev.year + 1, month: 0 }
                                    : { year: prev.year, month: prev.month + 1 }
                                )
                              }
                              className="h-7 w-7 rounded-lg cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center">
                            {WEEKDAY_LABELS.map((wd) => (
                              <span key={wd} className="text-[10px] font-bold text-muted-foreground py-0.5">
                                {wd}
                              </span>
                            ))}
                            {monthCells.map((cell) => {
                              const isBusy = activeBusyNights.has(cell.iso);
                              const isStart = slot.checkinDate === cell.iso;
                              const isEnd = slot.checkoutDate === cell.iso;
                              const isBetween =
                                isValidIsoDate(slot.checkinDate) &&
                                isValidIsoDate(slot.checkoutDate) &&
                                cell.iso > slot.checkinDate &&
                                cell.iso < slot.checkoutDate;
                              const isToday = cell.iso === todayIso;

                              return (
                                <button
                                  key={cell.iso}
                                  type="button"
                                  onClick={() => handleDayClick(cell.iso)}
                                  aria-pressed={isStart || isEnd || isBetween}
                                  aria-label={`${formatIsoFullBr(cell.iso)}${isBusy ? ` — Ocupado no Flat ${avail?.selectedFlatNumber || origFlatNum}` : " — Livre"}`}
                                  title={
                                    isBusy
                                      ? `${formatIsoFullBr(cell.iso)} • Ocupado no Flat ${avail?.selectedFlatNumber || origFlatNum}`
                                      : `${formatIsoFullBr(cell.iso)} • Livre`
                                  }
                                  className={cn(
                                    "relative h-8 sm:h-7 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600",
                                    !cell.inMonth && "opacity-40",
                                    isStart || isEnd
                                      ? "bg-indigo-600 text-white shadow-xs"
                                      : isBetween
                                        ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-200"
                                        : isBusy
                                          ? "bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-900/60 hover:bg-rose-100"
                                          : "bg-white dark:bg-slate-950/50 text-foreground hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-transparent hover:border-indigo-200",
                                    isToday && !isStart && !isEnd && "ring-1 ring-indigo-500/70"
                                  )}
                                >
                                  <span>{cell.day}</span>
                                  {isBusy && !isStart && !isEnd && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute bottom-0.5 w-1 h-1 rounded-full bg-rose-500"
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground pt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" aria-hidden="true" />
                              Ocupado no Flat {avail?.selectedFlatNumber || origFlatNum}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" aria-hidden="true" />
                              Período selecionado
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Seletor de Flat + Status de Disponibilidade / Sugestão de 1 Clique */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={flatSelId} className="text-[11px] font-bold flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                            <span>Apartamento (Flat)</span>
                          </Label>
                          {avail?.isValidRange && avail.hasSelectedFlat && (
                            <span
                              className={cn(
                                "text-[11px] font-extrabold inline-flex items-center gap-1",
                                avail.isAvailable
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-rose-700 dark:text-rose-400"
                              )}
                            >
                              {avail.isAvailable ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Flat {avail.selectedFlatNumber} livre</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Flat {avail.selectedFlatNumber} ocupado</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        <select
                          ref={(el) => {
                            flatSelectRefs.current[slot.uid] = el;
                          }}
                          id={flatSelId}
                          name={`flat_${idx}`}
                          value={slot.flatId}
                          onChange={(e) =>
                            updateSlot(slot.uid, {
                              flatId: e.target.value,
                              flatManuallyChosen: true,
                            })
                          }
                          aria-invalid={Boolean(slotError && avail?.isValidRange && !avail?.isAvailable)}
                          aria-describedby={slotError ? slotErrorId : undefined}
                          className="w-full h-10 sm:h-9 rounded-xl border border-input bg-background px-3 text-base sm:text-xs font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600"
                        >
                          <option value="">Selecione um apartamento...</option>
                          {(avail?.flatOptions || []).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              Flat {opt.number}
                              {opt.isOriginal ? " (Original)" : ""}
                              {avail?.isValidRange
                                ? opt.isAvailable
                                  ? " — ✓ Livre"
                                  : ` — ⚠ Ocupado`
                                : ""}
                            </option>
                          ))}
                        </select>

                        {/* Banner de Conflito com 1-clique para melhor flat livre */}
                        {avail?.isValidRange && !avail.isAvailable && (
                          <div
                            role="alert"
                            className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-2 text-xs"
                          >
                            <div className="flex items-start gap-2 text-amber-950 dark:text-amber-100">
                              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                              <span className="font-semibold leading-snug">
                                {avail.conflictLabel || `Flat ${avail.selectedFlatNumber} ocupado nessas datas.`}
                              </span>
                            </div>
                            {avail.suggestedFlat ? (
                              <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                                <span className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
                                  {avail.availableCount} {avail.availableCount === 1 ? "flat livre" : "flats livres"} nessas datas
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    updateSlot(slot.uid, {
                                      flatId: avail.suggestedFlat!.id,
                                      flatManuallyChosen: true,
                                    })
                                  }
                                  className="h-8 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-1.5 cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Trocar para Flat {avail.suggestedFlat.number} (Livre)</span>
                                </Button>
                              </div>
                            ) : (
                              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                                Não há outros apartamentos livres neste período. Escolha outra data ou clique em &quot;Editar completo&quot;.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {slots.length > 1 && avail?.isValidRange && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                          <span>Subtotal deste período ({slotCalc.nights}d)</span>
                          <span className="font-black text-foreground">R$ {formatBrl(slotCalc.total)}</span>
                        </div>
                      )}

                      {slotError && (
                        <p id={slotErrorId} className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{slotError}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {/* ── Seção 2: Valor da Diária, Taxas e Café ─────────────────── */}
            <fieldset className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2.5">
              <legend className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 px-1">
                Valor, Taxas e Café da Manhã
              </legend>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-5 space-y-1">
                  <Label htmlFor={`${formUid}-daily-rate`} className="text-[11px] font-bold">
                    Valor da Diária (R$)
                  </Label>
                  <Input
                    id={`${formUid}-daily-rate`}
                    name="dailyRate"
                    type="text"
                    inputMode="decimal"
                    value={dailyRateInput}
                    onChange={(e) => setDailyRateInput(e.target.value)}
                    placeholder="0,00"
                    className="h-10 sm:h-9 text-base sm:text-xs font-black"
                  />
                </div>

                <div className="sm:col-span-4 flex items-center">
                  <label
                    htmlFor={`${formUid}-breakfast`}
                    className={cn(
                      "w-full min-h-[40px] sm:min-h-[36px] px-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors select-none text-xs font-bold",
                      includeBreakfast
                        ? "bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                        : "bg-background border-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <input
                      id={`${formUid}-breakfast`}
                      type="checkbox"
                      checked={includeBreakfast}
                      onChange={(e) => setIncludeBreakfast(e.target.checked)}
                      className="accent-amber-600 w-4 h-4 shrink-0"
                    />
                    <Coffee className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                    <span className="truncate">Café incluso</span>
                  </label>
                </div>

                <div className="sm:col-span-3 text-left sm:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {slots.length > 1 ? `Total (${slots.length} res.)` : "Total Estimado"}
                  </span>
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                    R${" "}
                    {formatBrl(
                      grandTotals.totalNights > 0
                        ? grandTotals.totalAmount
                        : parsedDailyRate * origNights +
                            charges.reduce((a, c) => a + (Number(c.amount) || 0), 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Taxas Extras Copiadas (editáveis/removíveis) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {charges.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-foreground"
                  >
                    <span>
                      {c.title}: R$ {formatBrl(c.amount)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover taxa ${c.title}`}
                      onClick={() => handleRemoveCharge(c.id)}
                      className="text-muted-foreground hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {!addingChargeOpen ? (
                  <button
                    type="button"
                    onClick={() => setAddingChargeOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-400 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    <span>Adicionar taxa</span>
                  </button>
                ) : (
                  <div className="w-full flex flex-wrap items-center gap-1.5 pt-1">
                    <Input
                      type="text"
                      aria-label="Nome da taxa"
                      placeholder="Ex: Taxa de Limpeza"
                      value={newChargeTitle}
                      onChange={(e) => setNewChargeTitle(e.target.value)}
                      className="h-8 text-xs flex-1 min-w-[130px]"
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label="Valor da taxa em reais"
                      placeholder="Valor R$"
                      value={newChargeAmount}
                      onChange={(e) => setNewChargeAmount(e.target.value)}
                      className="h-8 text-xs w-24"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddCharge}
                      className="h-8 px-2.5 text-xs font-bold cursor-pointer"
                    >
                      Incluir
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingChargeOpen(false)}
                      className="h-8 px-2 text-xs cursor-pointer"
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </fieldset>

            {/* ── Seção 3: Status & Pagamento (Herdado da Original) ──────── */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Status e Pagamento</span>
              </legend>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { value: "confirmed_paid", label: "Confirmada e Paga", icon: "✓", disabled: false },
                    { value: "confirmed_pending", label: "Aguardando Pagto", icon: "🕒", disabled: false },
                    { value: "pre_reserva", label: "Pré-Reserva", icon: "⏳", disabled: isOtaChannel || isB2bChannel },
                    { value: "faturado", label: "Faturado / Boleto", icon: "📄", disabled: isOtaChannel },
                  ] as const
                ).map((opt) => {
                  const selected = paymentMode === opt.value;
                  const radioId = `${formUid}-pm-${opt.value}`;
                  return (
                    <label
                      key={opt.value}
                      htmlFor={radioId}
                      className={cn(
                        "relative flex items-center justify-center gap-1 min-h-[40px] sm:min-h-[34px] px-2 rounded-xl border text-[11px] font-bold transition-all text-center select-none",
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed bg-muted/40 border-border"
                          : selected
                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs cursor-pointer"
                            : "bg-background text-foreground border-input hover:border-indigo-400 cursor-pointer"
                      )}
                    >
                      <input
                        id={radioId}
                        type="radio"
                        name={`${formUid}-paymentMode`}
                        value={opt.value}
                        checked={selected}
                        disabled={opt.disabled}
                        onChange={() => handlePaymentModeChange(opt.value)}
                        className="sr-only"
                      />
                      <span aria-hidden="true">{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </label>
                  );
                })}
              </div>

              {/* Sub-opção contextual: Forma de pagamento (se Confirmada e Paga em canal direto) ou Prazo (se Pré-Reserva) */}
              {paymentMode === "confirmed_paid" && !isOtaChannel && !isB2bChannel && (
                <div className="flex items-center gap-2 pt-0.5">
                  <Label htmlFor={`${formUid}-pay-method`} className="text-[11px] font-bold text-muted-foreground shrink-0">
                    Forma de pagto:
                  </Label>
                  <select
                    id={`${formUid}-pay-method`}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentMode === "pre_reserva" && !isOtaChannel && !isB2bChannel && (
                <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    Prazo de pagamento:
                  </span>
                  {(
                    [
                      { value: "30m", label: "30 min" },
                      { value: "2h", label: "2 horas" },
                      { value: "until_2359", label: "Até 23:59" },
                    ] as const
                  ).map((hp) => (
                    <button
                      key={hp.value}
                      type="button"
                      aria-pressed={holdPreset === hp.value}
                      onClick={() => setHoldPreset(hp.value)}
                      className={cn(
                        "h-7 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors",
                        holdPreset === hp.value
                          ? "bg-amber-500 text-white border-amber-600"
                          : "bg-background text-foreground border-input hover:border-amber-400"
                      )}
                    >
                      {hp.label}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>

            {/* ── Seção 4: Canal de Venda ────────────────────────────────── */}
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Canal de Venda
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {CHANNEL_OPTIONS.map((ch) => {
                  const selected = channel === ch.value;
                  const radioId = `${formUid}-ch-${ch.value}`;
                  return (
                    <label
                      key={ch.value}
                      htmlFor={radioId}
                      className={cn(
                        "inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[32px] px-3 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none",
                        selected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-background text-foreground border-input hover:border-indigo-400"
                      )}
                    >
                      <input
                        id={radioId}
                        type="radio"
                        name={`${formUid}-channel`}
                        value={ch.value}
                        checked={selected}
                        onChange={() => handleChannelChange(ch.value)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn("w-2 h-2 rounded-full", selected ? "bg-white" : ch.dot)}
                      />
                      <span>{ch.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* ── Seção 5: Observações Opcionais (Limpa por padrão) ──────── */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label htmlFor={`${formUid}-notes`} className="text-xs font-bold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Observação da nova estadia (opcional)</span>
                </Label>
                {origNotesBundle.hasAny && (
                  <label
                    htmlFor={`${formUid}-pull-notes`}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer select-none"
                  >
                    <input
                      id={`${formUid}-pull-notes`}
                      type="checkbox"
                      checked={pullOriginalNotes}
                      onChange={(e) => handleTogglePullOriginalNotes(e.target.checked)}
                      className="accent-indigo-600 w-3.5 h-3.5"
                    />
                    <span>Puxar notas da original (#{origCode})</span>
                  </label>
                )}
              </div>

              {origNotesBundle.hasAny && pullOriginalNotes && (origNotesBundle.receptionNotes || origNotesBundle.specialRequests) && (
                <p className="text-[10.5px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1">
                  Também serão puxados:{" "}
                  {[
                    origNotesBundle.receptionNotes ? `Recado portaria ("${origNotesBundle.receptionNotes}")` : "",
                    origNotesBundle.specialRequests ? `Pedidos ("${origNotesBundle.specialRequests}")` : "",
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              )}

              <Textarea
                id={`${formUid}-notes`}
                name="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Chega às 19h, mesma preferência de travesseiro..."
                className="text-base sm:text-xs resize-y min-h-[56px]"
              />
            </div>

            {submitAttempted && Object.keys(slotErrors).length > 0 && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Revise os períodos destacados acima antes de criar a cópia.</span>
              </div>
            )}

            {/* ── Rodapé: Editar Completo + Cancelar + Confirmar Duplicação ─ */}
            <DialogFooter className="gap-2 sm:justify-between pt-2 border-t">
              {onOpenFullEditor ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenFullEditorClick}
                  title={
                    slots.length > 1
                      ? "Abre o formulário completo de Nova Reserva pré-preenchido com o 1º período"
                      : "Abrir o formulário completo de Nova Reserva já pré-preenchido"
                  }
                  className="text-xs font-bold text-muted-foreground hover:text-foreground gap-1.5 px-2 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Editar completo</span>
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || loadingSource}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl min-w-[135px] gap-1.5 shadow-sm cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>Duplicando...</span>
                    </>
                  ) : (
                    <>
                      <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {slots.length > 1
                          ? `Criar ${slots.length} Reservas`
                          : "Duplicar Reserva"}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
