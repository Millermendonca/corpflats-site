import React, { useState, useMemo, useId, useEffect, memo } from "react";
import { format, addDays, parseISO, differenceInDays } from "date-fns";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  User,
  Users,
  Coffee,
  RefreshCw,
  Trash2,
  Plus,
  Sparkles,
  AlertCircle,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  Building2,
  DollarSign,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { formatSmartPhone } from "@/lib/phone-mask";
import { cn } from "@/lib/utils";
import {
  getCleaningFeeSummary,
  round2Money,
  type SimpleDailyRateItem,
  type SimpleChargeItem,
  type PmsTariffQuoteResponse,
} from "@/lib/simplified-reservation-pricing";
import {
  evaluateSimpleFlatAvailability,
  type SimpleCrmGuestInspection,
} from "@/lib/simplified-reservation-helpers";

export interface SimplePhoneVerificationEntry {
  checking: boolean;
  checked: boolean;
  exists: boolean;
  canonicalPhone?: string;
}

export interface SimplifiedReservationFormProps {
  channel: string;
  onSelectChannel: (channel: "booking" | "airbnb") => void;
  onSwitchToAdvanced: () => void;

  checkinDate: string;
  checkoutDate: string;
  onDatesChange: (checkin: string, checkout: string) => void;

  flatId: string;
  isFlatManual: boolean;
  onSelectFlat: (flatId: string) => void;
  onResetFlatAuto: () => void;
  flatsList: any[];
  reservationsList: any[];
  blocksList: any[];
  fairShareResult: any;
  loadingFairShare: boolean;

  isRangePickerOpen: boolean;
  rangePickerContent: React.ReactNode;
  onOpenRangePicker: (initialDate?: string) => void;
  onCloseRangePicker: () => void;

  guestCount: "1" | "2" | "3";
  onChangeGuestCount: (count: "1" | "2") => void;

  guest1: {
    guestId: string;
    name: string;
    cpf: string;
    phone: string;
    email: string;
  };
  onChangeGuest1Field: (field: "name" | "phone", value: string) => void;
  onSelectCrmGuest1: (guest: any) => void;
  onMarkGuest1Manual: (clearFields?: boolean) => void;
  searchIndexedCrm: (query: string, includeCompany: boolean, limit?: number) => any[];
  onVerifyPhone?: (phone: string) => void;
  phoneVerificationMap?: Record<string, SimplePhoneVerificationEntry>;

  includeBreakfast: boolean;
  onChangeBreakfast: (include: boolean) => void;

  dailyRates: SimpleDailyRateItem[];
  charges: SimpleChargeItem[];
  totalDraft: number | null;
  onChangeDailyRate: (val: number) => void;
  onChangeTotalAmount: (val: number) => void;
  onChangeCleaningFee: (val: number) => void;
  onRemoveCleaningFee: () => void;
  onAddCleaningFee: () => void;

  isManualPrice: boolean;
  loadingTariffQuote: boolean;
  tariffQuote: PmsTariffQuoteResponse | null;
  onRecalculateTariff: () => void;

  submitAttempted: boolean;
  inheritedCrmContext?: SimpleCrmGuestInspection;
  fieldRefs?: {
    channelBookingRef: React.RefObject<HTMLInputElement | null>;
    checkinRef: React.RefObject<HTMLInputElement | null>;
    flatTriggerRef?: React.RefObject<HTMLButtonElement | null>;
    guestNameRef: React.RefObject<HTMLInputElement | null>;
    totalRef: React.RefObject<HTMLInputElement | null>;
  };
}

function formatCentsMask(val: number | string | undefined | null): string {
  if (val === "" || val === undefined || val === null) return "";
  const num = Number(val);
  if (isNaN(num) || num === 0) return "";
  const cents = Math.round(Math.abs(num) * 100);
  if (cents === 0) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseCentsMask(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const cents = parseInt(digits, 10);
  if (isNaN(cents) || cents === 0) return 0;
  return Number((cents / 100).toFixed(2));
}

function keepCursorAtEnd(e: React.SyntheticEvent<HTMLInputElement>) {
  const target = e.currentTarget;
  requestAnimationFrame(() => {
    try {
      if (target.selectionStart === target.selectionEnd) {
        const len = target.value.length;
        target.setSelectionRange(len, len);
      }
    } catch {}
  });
}

function safeParseIso(str?: string): Date | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = parseISO(str);
  if (isNaN(d.getTime())) return null;
  const yr = d.getFullYear();
  if (yr < 2000 || yr > 2100) return null;
  return d;
}

function getPhoneVerifyKeyLocal(phone?: string): string {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 10) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function formatBrl(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const SimplifiedReservationForm = memo(function SimplifiedReservationForm({
  channel,
  onSelectChannel,
  onSwitchToAdvanced,
  checkinDate,
  checkoutDate,
  onDatesChange,
  flatId,
  isFlatManual,
  onSelectFlat,
  onResetFlatAuto,
  flatsList,
  reservationsList,
  blocksList,
  fairShareResult,
  loadingFairShare,
  isRangePickerOpen,
  rangePickerContent,
  onOpenRangePicker,
  onCloseRangePicker,
  guestCount,
  onChangeGuestCount,
  guest1,
  onChangeGuest1Field,
  onSelectCrmGuest1,
  onMarkGuest1Manual,
  searchIndexedCrm,
  onVerifyPhone,
  phoneVerificationMap,
  includeBreakfast,
  onChangeBreakfast,
  dailyRates,
  charges,
  totalDraft,
  onChangeDailyRate,
  onChangeTotalAmount,
  onChangeCleaningFee,
  onRemoveCleaningFee,
  onAddCleaningFee,
  isManualPrice,
  loadingTariffQuote,
  tariffQuote,
  onRecalculateTariff,
  submitAttempted,
  inheritedCrmContext,
  fieldRefs,
}: SimplifiedReservationFormProps) {
  const uid = useId();
  const channelErrorId = `${uid}-channel-error`;
  const channelBookingId = `${uid}-channel-booking`;
  const channelAirbnbId = `${uid}-channel-airbnb`;
  const checkinId = `${uid}-checkin`;
  const checkoutId = `${uid}-checkout`;
  const datesErrorId = `${uid}-dates-error`;
  const flatSelectId = `${uid}-flat`;
  const flatErrorId = `${uid}-flat-error`;
  const guestCount1Id = `${uid}-guests-1`;
  const guestCount2Id = `${uid}-guests-2`;
  const guestNameId = `${uid}-guest1-name`;
  const guestNameErrorId = `${uid}-guest1-name-error`;
  const guestPhoneId = `${uid}-guest1-phone`;
  const breakfastWithoutId = `${uid}-breakfast-without`;
  const breakfastWithId = `${uid}-breakfast-with`;
  const dailyRateId = `${uid}-daily-rate`;
  const cleaningFeeId = `${uid}-cleaning-fee`;
  const totalAmountId = `${uid}-total-amount`;
  const totalErrorId = `${uid}-total-error`;

  const [showCrmSuggestions, setShowCrmSuggestions] = useState(false);
  const [nameEdited, setNameEdited] = useState(false);
  const [nameBlurred, setNameBlurred] = useState(false);
  const [totalBlurred, setTotalBlurred] = useState(false);

  useEffect(() => {
    if (totalDraft === null) {
      setTotalBlurred(false);
    }
  }, [totalDraft]);

  const todayIso = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const isFutureCheckin = checkinDate > todayIso;

  const nights = useMemo(() => {
    const d1 = safeParseIso(checkinDate);
    const d2 = safeParseIso(checkoutDate);
    if (!d1 || !d2 || d2 <= d1) return Math.max(1, dailyRates.length || 1);
    return Math.max(1, differenceInDays(d2, d1));
  }, [checkinDate, checkoutDate, dailyRates.length]);

  const invalidDateRange = Boolean(checkinDate && checkoutDate && checkoutDate <= checkinDate);
  const missingDateRange = Boolean(submitAttempted && (!checkinDate || !checkoutDate));
  const showDatesError = invalidDateRange || missingDateRange;

  const availability = useMemo(
    () =>
      evaluateSimpleFlatAvailability({
        flatsList,
        reservationsList,
        blocksList,
        fairShareResult,
        checkinDate,
        checkoutDate,
        flatId,
      }),
    [flatsList, reservationsList, blocksList, fairShareResult, checkinDate, checkoutDate, flatId]
  );

  const {
    matchingFairShare,
    effectiveFlatsList,
    isFullOccupancy,
    isSelectedAvailable,
    selectedFlatObj,
    selectedFlatStat: fairShareStatForSelected,
    resolvedSelectedFlatNumber,
    firstFreeFlat,
    nextCleanFlat,
    localByFlatId,
  } = availability;

  const isDirtySelected =
    !isFutureCheckin &&
    Boolean(
      fairShareStatForSelected?.isDirty ||
        fairShareStatForSelected?.cleaningStatus === "dirty" ||
        (!fairShareStatForSelected && (selectedFlatObj as any)?.cleaningStatus === "dirty")
    );

  const isCleaningNowSelected =
    !isFutureCheckin &&
    !isDirtySelected &&
    Boolean(
      fairShareStatForSelected?.isCleaningNow ||
        fairShareStatForSelected?.cleaningStatus === "cleaning_now" ||
        (!fairShareStatForSelected && (selectedFlatObj as any)?.cleaningStatus === "cleaning_now")
    );

  const hasSameDaySelected = fairShareStatForSelected
    ? Boolean(fairShareStatForSelected.hasCheckoutOnCheckinDay)
    : Boolean(flatId && localByFlatId[String(flatId)]?.hasSameDayCheckout);

  const isAutoSelectedFlat = !isFlatManual && Boolean(flatId) && !isFullOccupancy;
  const selectValueSafe =
    flatId && effectiveFlatsList.some((f: any) => String(f.id) === String(flatId))
      ? String(flatId)
      : "";

  const showFullOccupancyAlert =
    !loadingFairShare && !invalidDateRange && Boolean(checkinDate && checkoutDate) && isFullOccupancy;
  const showSelectedUnavailableAlert =
    !loadingFairShare && !invalidDateRange && !isFullOccupancy && Boolean(flatId) && !isSelectedAvailable;
  const showMissingFlatError =
    !loadingFairShare && !invalidDateRange && !isFullOccupancy && submitAttempted && !flatId;
  const showFlatError = showFullOccupancyAlert || showSelectedUnavailableAlert || showMissingFlatError;

  // CRM Autocomplete for Guest 1
  const crmMatches = useMemo(
    () => (guest1.name.trim().length > 0 ? searchIndexedCrm(guest1.name, true, 8) : []),
    [guest1.name, searchIndexedCrm]
  );

  const phoneVerKey = getPhoneVerifyKeyLocal(guest1.phone);
  const phoneVer = phoneVerKey && phoneVerificationMap ? phoneVerificationMap[phoneVerKey] : undefined;

  const triggerVerifyIfComplete = (rawPhone?: string | null) => {
    if (!onVerifyPhone || !rawPhone) return;
    const trimmed = String(rawPhone).trim();
    const digitsLen = trimmed.replace(/\D/g, "").length;
    if (digitsLen >= 10 || (trimmed.startsWith("+") && digitsLen >= 8)) {
      onVerifyPhone(trimmed);
    }
  };

  // Pricing summary
  const nightsSubtotal = useMemo(
    () => round2Money(dailyRates.reduce((acc, d) => acc + (Number(d.rate) || 0), 0)),
    [dailyRates]
  );
  const avgDailyRate = useMemo(
    () => (dailyRates.length > 0 ? round2Money(nightsSubtotal / dailyRates.length) : 0),
    [nightsSubtotal, dailyRates.length]
  );
  const hasMixedRates = useMemo(
    () => dailyRates.length > 1 && new Set(dailyRates.map((d) => Number(d.rate) || 0)).size > 1,
    [dailyRates]
  );
  const { hasCleaningCharge, cleaningFee, otherChargesSum, totalCharges } = useMemo(
    () => getCleaningFeeSummary(charges),
    [charges]
  );
  const computedTotal = useMemo(
    () => Math.max(0, round2Money(nightsSubtotal + totalCharges)),
    [nightsSubtotal, totalCharges]
  );
  const displayedTotal = totalDraft !== null ? totalDraft : computedTotal;
  const isTotalBelowCharges = totalDraft !== null && totalDraft < totalCharges - 0.001;

  // Validation error visibility (never premature before interaction or submit!)
  const showChannelError = submitAttempted && channel !== "booking" && channel !== "airbnb";
  const showNameError = (submitAttempted || (nameEdited && nameBlurred)) && !guest1.name.trim();
  const showTotalBelowError = (submitAttempted || totalBlurred) && isTotalBelowCharges;

  const isOtaChannel = channel === "booking" || channel === "airbnb";

  return (
    <div className="space-y-3.5 py-1">
      {/* Polite screen-reader live region for availability & completed Tarifário updates */}
      <div role="status" aria-live="polite" className="sr-only">
        {showFullOccupancyAlert
          ? "Lotação total neste período: nenhum apartamento disponível."
          : !loadingTariffQuote && isOtaChannel && tariffQuote && !isManualPrice
            ? `Tarifário aplicado: ${nights} diária(s), total de R$ ${formatBrl(computedTotal)}.`
            : ""}
      </div>

      {/* ========================================================= */}
      {/* 1. CANAL DE ORIGEM (Booking / Airbnb)                     */}
      {/* ========================================================= */}
      <fieldset
        className={cn(
          "p-3.5 rounded-2xl border transition-colors space-y-2.5",
          showChannelError
            ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20"
            : "border-border bg-slate-50/80 dark:bg-slate-900/60"
        )}
        aria-invalid={showChannelError ? "true" : "false"}
        aria-describedby={showChannelError ? channelErrorId : undefined}
      >
        <legend className="sr-only">1. Canal de Origem (obrigatório)</legend>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div aria-hidden="true" className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-black">
              1
            </span>
            <span>Canal de Origem</span>
            <span className="text-rose-600">*</span>
          </div>

          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
            <span>Outro canal? Abrir Avançado</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Booking.com */}
          <label
            htmlFor={channelBookingId}
            className={cn(
              "relative flex items-center justify-between gap-2 px-3.5 py-3 min-h-[48px] rounded-xl border-2 cursor-pointer transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
              channel === "booking"
                ? "border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100 shadow-xs ring-2 ring-sky-500/25"
                : "border-border bg-background hover:border-sky-400/70 text-foreground"
            )}
          >
            <input
              ref={fieldRefs?.channelBookingRef}
              id={channelBookingId}
              type="radio"
              name="simplified_channel"
              value="booking"
              checked={channel === "booking"}
              onChange={() => onSelectChannel("booking")}
              className="sr-only peer"
              aria-invalid={showChannelError ? "true" : "false"}
              aria-describedby={showChannelError ? channelErrorId : undefined}
            />
            <span className="flex items-center gap-2 font-extrabold text-sm sm:text-xs">
              <span className="w-3 h-3 rounded-full bg-sky-600 shrink-0" aria-hidden="true" />
              <span>Booking.com</span>
            </span>
            {channel === "booking" && (
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />
              </span>
            )}
          </label>

          {/* Airbnb */}
          <label
            htmlFor={channelAirbnbId}
            className={cn(
              "relative flex items-center justify-between gap-2 px-3.5 py-3 min-h-[48px] rounded-xl border-2 cursor-pointer transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
              channel === "airbnb"
                ? "border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-950 dark:text-rose-100 shadow-xs ring-2 ring-rose-500/25"
                : "border-border bg-background hover:border-rose-400/70 text-foreground"
            )}
          >
            <input
              id={channelAirbnbId}
              type="radio"
              name="simplified_channel"
              value="airbnb"
              checked={channel === "airbnb"}
              onChange={() => onSelectChannel("airbnb")}
              className="sr-only peer"
              aria-invalid={showChannelError ? "true" : "false"}
              aria-describedby={showChannelError ? channelErrorId : undefined}
            />
            <span className="flex items-center gap-2 font-extrabold text-sm sm:text-xs">
              <span className="w-3 h-3 rounded-full bg-rose-600 shrink-0" aria-hidden="true" />
              <span>Airbnb</span>
            </span>
            {channel === "airbnb" && (
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />
              </span>
            )}
          </label>
        </div>

        {showChannelError && (
          <div
            id={channelErrorId}
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Selecione Booking.com ou Airbnb (ou clique em Avançado para WhatsApp, Site ou B2B).</span>
          </div>
        )}
      </fieldset>

      {/* ========================================================= */}
      {/* 2. PERÍODO (Check-in e Check-out) + Flat automático       */}
      {/* ========================================================= */}
      <div className="p-3.5 rounded-2xl border border-border bg-slate-50/80 dark:bg-slate-900/60 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-black">
              2
            </span>
            <span>Período</span>
          </div>
          <Badge variant="outline" className="text-[11px] font-bold bg-background">
            <CalendarDays className="w-3 h-3 mr-1 text-primary" />
            {nights} {nights === 1 ? "diária" : "diárias"}
          </Badge>
        </div>

        <Popover
          open={isRangePickerOpen}
          onOpenChange={(open) => {
            if (!open) onCloseRangePicker();
          }}
        >
          <PopoverAnchor asChild>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Check-in */}
              <div className="space-y-1">
                <Label htmlFor={checkinId} className="text-xs font-bold text-foreground block">
                  Check-in <span className="text-rose-600" aria-hidden="true">*</span>
                </Label>
                <div className="relative flex items-center">
                  <Input
                    ref={fieldRefs?.checkinRef}
                    id={checkinId}
                    name="simplified_checkin"
                    type="date"
                    value={checkinDate}
                    min="2020-01-01"
                    max="2099-12-31"
                    required
                    aria-invalid={showDatesError ? "true" : "false"}
                    aria-describedby={showDatesError ? datesErrorId : undefined}
                    onChange={(e) => {
                      const val = e.target.value;
                      const dCin = safeParseIso(val);
                      const dCout = safeParseIso(checkoutDate);
                      let targetCout = checkoutDate;
                      if (dCin && (!dCout || dCout <= dCin)) {
                        targetCout = format(addDays(dCin, 1), "yyyy-MM-dd");
                      }
                      onDatesChange(val, targetCout);
                    }}
                    className={cn(
                      "text-base sm:text-xs h-11 sm:h-9 w-full bg-background pr-9 pl-2.5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-8",
                      showDatesError && "border-rose-500 focus-visible:ring-rose-500"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => onOpenRangePicker(checkinDate)}
                    className="absolute right-1.5 z-10 p-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer rounded"
                    aria-label="Abrir calendário pelo check-in"
                    title="Abrir calendário de período"
                  >
                    <CalendarIcon className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Check-out */}
              <div className="space-y-1">
                <Label htmlFor={checkoutId} className="text-xs font-bold text-foreground block">
                  Check-out <span className="text-rose-600" aria-hidden="true">*</span>
                </Label>
                <div className="relative flex items-center">
                  <Input
                    id={checkoutId}
                    name="simplified_checkout"
                    type="date"
                    value={checkoutDate}
                    min="2020-01-01"
                    max="2099-12-31"
                    required
                    aria-invalid={showDatesError ? "true" : "false"}
                    aria-describedby={showDatesError ? datesErrorId : undefined}
                    onChange={(e) => onDatesChange(checkinDate, e.target.value)}
                    className={cn(
                      "text-base sm:text-xs h-11 sm:h-9 w-full bg-background pr-9 pl-2.5 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-8",
                      showDatesError && "border-rose-500 focus-visible:ring-rose-500"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => onOpenRangePicker(checkinDate || checkoutDate)}
                    className="absolute right-1.5 z-10 p-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400 cursor-pointer rounded"
                    aria-label="Abrir calendário pelo check-out"
                    title="Abrir calendário de período"
                  >
                    <CalendarIcon className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="center"
            side="bottom"
            sideOffset={8}
            className="z-[70] w-[310px] sm:w-[330px] max-w-[calc(100vw-2rem)] p-3 bg-popover border border-border shadow-2xl rounded-2xl animate-in fade-in-0 zoom-in-95"
          >
            {isRangePickerOpen ? rangePickerContent : null}
          </PopoverContent>
        </Popover>

        {showDatesError && (
          <div
            id={datesErrorId}
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {missingDateRange
                ? "Informe as datas de check-in e check-out."
                : "A data de check-out deve ser posterior à data de check-in."}
            </span>
          </div>
        )}

        {/* Seletor compacto de Apartamento (Flat da vez automático + opção de escolher) */}
        <div className="pt-2 border-t border-border/60 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label htmlFor={flatSelectId} className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
              <span>Apartamento</span>
              {loadingFairShare ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-muted-foreground font-semibold inline-flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                  verificando...
                </span>
              ) : isAutoSelectedFlat ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold">
                  ✨ automático (flat da vez)
                </span>
              ) : isFlatManual && !showFullOccupancyAlert ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  manual
                </span>
              ) : null}
            </Label>

            {isFlatManual &&
              !loadingFairShare &&
              matchingFairShare?.bestFlatId &&
              String(flatId) !== String(matchingFairShare.bestFlatId) && (
                <button
                  type="button"
                  onClick={onResetFlatAuto}
                  className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>Usar automático (Apt {matchingFairShare.bestFlatNumber})</span>
                </button>
              )}
          </div>

          <Select
            value={selectValueSafe}
            onValueChange={(val) => {
              if (!val || String(val) === String(flatId || "")) return;
              onSelectFlat(val);
            }}
          >
            <SelectTrigger
              ref={fieldRefs?.flatTriggerRef}
              id={flatSelectId}
              aria-invalid={showFlatError ? "true" : "false"}
              aria-describedby={showFlatError ? flatErrorId : undefined}
              className={cn(
                "h-9 text-xs font-bold bg-background w-full",
                showFlatError && "border-rose-500 focus:ring-rose-500 text-rose-800 dark:text-rose-200"
              )}
            >
              <SelectValue
                placeholder={
                  loadingFairShare
                    ? "✨ Selecionando flat da vez..."
                    : isFullOccupancy
                      ? "🚫 Lotação total — nenhum flat disponível"
                      : "Selecione o apartamento"
                }
              >
                {(() => {
                  if (!flatId) {
                    if (loadingFairShare) return "✨ Selecionando flat da vez...";
                    if (isFullOccupancy) return "🚫 Lotação total — nenhum flat disponível";
                    return "Selecione o apartamento";
                  }
                  const flatLabel = `Apt ${resolvedSelectedFlatNumber}`;
                  const modeTag = isAutoSelectedFlat ? "automático ✨" : "manual";
                  if (showFullOccupancyAlert) {
                    return `${flatLabel} • 🚫 Lotação total (ocupado)`;
                  }
                  if (!isSelectedAvailable) {
                    return `${flatLabel} • ⚠️ Ocupado / Bloqueado`;
                  }
                  if (hasSameDaySelected) {
                    return `${flatLabel} • ${modeTag} • 🔄 Saída no dia`;
                  }
                  if (isDirtySelected) {
                    return `${flatLabel} • ${modeTag} • 🧹 Sujo`;
                  }
                  if (isCleaningNowSelected) {
                    return `${flatLabel} • ${modeTag} • 🧽 Em limpeza`;
                  }
                  return `${flatLabel} • ${modeTag}`;
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {effectiveFlatsList.map((f: any) => {
                const flatStat = matchingFairShare?.allStats?.find(
                  (s: any) => Number(s.flat?.id) === Number(f.id) || String(s.flat?.number) === String(f.number)
                );
                const localInfo = localByFlatId[String(f.id)];
                const isBest = Boolean(matchingFairShare && Number(matchingFairShare.bestFlatId) === Number(f.id));
                const isAvail = flatStat ? Boolean(flatStat.isAvailable) : Boolean(localInfo?.isAvailable ?? true);
                const conflictName = flatStat?.conflicts?.[0]?.guestName || localInfo?.resConflict?.guestName;
                const hasSameDay = flatStat
                  ? Boolean(flatStat.hasCheckoutOnCheckinDay)
                  : Boolean(localInfo?.hasSameDayCheckout);
                const cleanSt = isFutureCheckin ? "clean" : flatStat?.cleaningStatus || (f as any).cleaningStatus || "clean";
                const isDirty = !isFutureCheckin && (cleanSt === "dirty" || Boolean(flatStat?.isDirty));
                const isCleaningNow = !isFutureCheckin && (cleanSt === "cleaning_now" || Boolean(flatStat?.isCleaningNow));
                const daysCount = flatStat?.monthOccupiedDays || 0;

                return (
                  <SelectItem key={f.id} value={String(f.id)}>
                    <div className="flex items-center justify-between gap-2 w-full py-0.5">
                      <span className="font-bold">Apt {f.number}</span>
                      {isBest && isAvail ? (
                        <span className="text-[9.5px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded">
                          ✨ Flat da vez ({daysCount}d)
                        </span>
                      ) : !isAvail ? (
                        <span className="text-[9.5px] bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold px-1.5 py-0.5 rounded">
                          {conflictName ? `⚠️ Ocupado (${conflictName})` : "🔒 Bloqueado"}
                        </span>
                      ) : hasSameDay ? (
                        <span className="text-[9.5px] bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold px-1.5 py-0.5 rounded">
                          🔄 Saída no Dia ({daysCount}d)
                        </span>
                      ) : isDirty ? (
                        <span className="text-[9.5px] bg-orange-500/15 text-orange-800 dark:text-orange-300 font-bold px-1.5 py-0.5 rounded">
                          🧹 Vago &amp; Sujo ({daysCount}d)
                        </span>
                      ) : isCleaningNow ? (
                        <span className="text-[9.5px] bg-sky-500/15 text-sky-800 dark:text-sky-300 font-bold px-1.5 py-0.5 rounded">
                          🧽 Em Limpeza ({daysCount}d)
                        </span>
                      ) : (
                        <span className="text-[9.5px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
                          🟢 Vago &amp; Limpo ({daysCount}d)
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {showFullOccupancyAlert && (
            <div
              id={flatErrorId}
              className="p-2.5 rounded-xl bg-rose-100/90 dark:bg-rose-950/60 border-2 border-rose-500/80 flex items-start justify-between gap-2 text-xs text-rose-900 dark:text-rose-100"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="font-extrabold leading-tight">Lotação total neste período</p>
                  <p className="text-[11px] font-medium text-rose-800 dark:text-rose-200 leading-snug">
                    Nenhum apartamento está disponível entre estas datas. Altere o período ou abra o Modo Avançado para encaixe.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSwitchToAdvanced}
                className="h-7 px-2 text-[10.5px] font-bold border-rose-400 bg-background/90 text-rose-800 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/40 shrink-0 cursor-pointer"
              >
                Abrir Avançado
              </Button>
            </div>
          )}

          {showSelectedUnavailableAlert && (
            <div
              id={flatErrorId}
              className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700/60 flex items-center justify-between gap-2 text-[11px] text-rose-800 dark:text-rose-200"
            >
              <span className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                <span>Apt {resolvedSelectedFlatNumber} indisponível neste período.</span>
              </span>
              {firstFreeFlat?.id && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onSelectFlat(firstFreeFlat.id)}
                  className="h-6 px-2 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0 cursor-pointer"
                >
                  Usar Apt {firstFreeFlat.number}
                </Button>
              )}
            </div>
          )}

          {showMissingFlatError && (
            <div
              id={flatErrorId}
              className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700/60 flex items-center justify-between gap-2 text-[11px] text-rose-800 dark:text-rose-200"
            >
              <span className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                <span>Selecione um apartamento disponível para continuar.</span>
              </span>
              {firstFreeFlat?.id && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onSelectFlat(firstFreeFlat.id)}
                  className="h-6 px-2 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0 cursor-pointer"
                >
                  Usar Apt {firstFreeFlat.number}
                </Button>
              )}
            </div>
          )}

          {!loadingFairShare && !showFlatError && isSelectedAvailable && (isDirtySelected || hasSameDaySelected) && flatId && (
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-700/60 flex items-center justify-between gap-2 text-[11px] text-amber-900 dark:text-amber-200">
              <span className="font-medium">
                {hasSameDaySelected
                  ? `🔄 Apt ${resolvedSelectedFlatNumber} tem saída no dia do check-in.`
                  : `🧹 Apt ${resolvedSelectedFlatNumber} consta como sujo na governança.`}
              </span>
              {nextCleanFlat?.id && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onSelectFlat(nextCleanFlat.id)}
                  className="h-6 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 cursor-pointer"
                >
                  Trocar p/ Apt {nextCleanFlat.number}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. QUANTIDADE DE HÓSPEDES (1 ou 2 Hóspedes)               */}
      {/* ========================================================= */}
      <fieldset className="p-3.5 rounded-2xl border border-border bg-slate-50/80 dark:bg-slate-900/60 space-y-2.5">
        <legend className="sr-only">3. Quantidade de Hóspedes</legend>
        <div aria-hidden="true" className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-black">
            3
          </span>
          <span>Hóspedes</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {(["1", "2"] as const).map((cnt) => {
            const active = guestCount === cnt;
            const inputId = cnt === "1" ? guestCount1Id : guestCount2Id;
            return (
              <label
                key={cnt}
                htmlFor={inputId}
                className={cn(
                  "flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[46px] rounded-xl border-2 cursor-pointer transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
                  active
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 shadow-xs ring-2 ring-indigo-500/20"
                    : "border-border bg-background hover:border-indigo-400/70 text-foreground"
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="simplified_guest_count"
                  value={cnt}
                  checked={active}
                  onChange={() => onChangeGuestCount(cnt)}
                  className="sr-only"
                />
                <span className="flex items-center gap-2 font-extrabold text-sm sm:text-xs">
                  {cnt === "1" ? (
                    <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
                  )}
                  <span>{cnt === "1" ? "1 Hóspede" : "2 Hóspedes"}</span>
                </span>
                {active && (
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ========================================================= */}
      {/* 4. DADOS DO HÓSPEDE 1 (Apenas Nome + Telefone opcional)   */}
      {/* ========================================================= */}
      <div className="p-3.5 rounded-2xl border border-border bg-slate-50/80 dark:bg-slate-900/60 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-black">
              4
            </span>
            <span>Dados do Hóspede 1</span>
            {guest1.guestId && guest1.guestId !== "manual" && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold"
              >
                ✓ CRM
              </Badge>
            )}
          </div>

          {guest1.guestId && guest1.guestId !== "manual" && (
            <button
              type="button"
              onClick={() => onMarkGuest1Manual(true)}
              className="text-[11px] text-muted-foreground hover:text-rose-600 underline font-semibold cursor-pointer"
            >
              Desvincular CRM
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
          {/* Nome com Autocomplete CRM */}
          <div className="space-y-1 relative">
            <Label htmlFor={guestNameId} className="text-xs font-bold text-foreground block">
              Nome completo <span className="text-rose-600" aria-hidden="true">*</span>
            </Label>
            <Input
              ref={fieldRefs?.guestNameRef}
              id={guestNameId}
              name="simplified_guest1_name"
              type="text"
              autoComplete="name"
              enterKeyHint="next"
              required
              value={guest1.name}
              aria-invalid={showNameError ? "true" : "false"}
              aria-describedby={showNameError ? guestNameErrorId : undefined}
              onChange={(e) => {
                setNameEdited(true);
                setNameBlurred(false);
                onChangeGuest1Field("name", e.target.value);
                setShowCrmSuggestions(true);
              }}
              onFocus={() => {
                if (guest1.name.trim().length > 0) setShowCrmSuggestions(true);
              }}
              onBlur={() => {
                setNameBlurred(true);
                setTimeout(() => setShowCrmSuggestions(false), 140);
              }}
              placeholder="Digite o nome (busca no CRM)..."
              className={cn(
                "text-base sm:text-xs h-11 sm:h-9 bg-background",
                showNameError && "border-rose-500 focus-visible:ring-rose-500"
              )}
            />

            {showCrmSuggestions && guest1.name.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-popover/95 backdrop-blur-sm border border-border shadow-2xl rounded-2xl z-50 overflow-hidden max-h-56 overflow-y-auto">
                <div className="px-2.5 py-1 bg-muted/60 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b">
                  <span>Hóspedes no CRM ({crmMatches.length})</span>
                  <span className="text-[9px]">Clique para preencher</span>
                </div>
                {crmMatches.length > 0 ? (
                  <div className="divide-y divide-border/40">
                    {crmMatches.map((g: any) => (
                      <button
                        key={g.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onSelectCrmGuest1(g);
                          triggerVerifyIfComplete(g.phone);
                          setShowCrmSuggestions(false);
                        }}
                        className="w-full text-left p-2 hover:bg-primary/10 transition-colors flex items-start gap-2 group cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-foreground truncate">
                            {g.name || g.fullName}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            {g.phone ? <span>Tel: {g.phone}</span> : null}
                            {g.documentNumber || g.document ? (
                              <span>• CPF: {g.documentNumber || g.document}</span>
                            ) : null}
                            {g.companyName ? (
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                • {g.companyName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 text-center text-[11px] text-muted-foreground">
                    Nenhum hóspede localizado no CRM com este nome.
                  </div>
                )}
                <div className="p-1.5 bg-muted/30 border-t border-border">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onMarkGuest1Manual(false);
                      setShowCrmSuggestions(false);
                    }}
                    className="w-full py-1 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1 justify-center cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Usar como Novo Hóspede: "{guest1.name}"</span>
                  </button>
                </div>
              </div>
            )}

            {showNameError && (
              <div
                id={guestNameErrorId}
                className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Informe o nome do hóspede titular.</span>
              </div>
            )}
          </div>

          {/* Telefone / WhatsApp (Opcional) */}
          <div className="space-y-1">
            <Label htmlFor={guestPhoneId} className="text-xs font-bold text-foreground block">
              Telefone / WhatsApp{" "}
              <span className="text-[10.5px] font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <div className="relative">
              <Input
                id={guestPhoneId}
                name="simplified_guest1_phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="next"
                value={guest1.phone}
                aria-invalid="false"
                onChange={(e) => onChangeGuest1Field("phone", formatSmartPhone(e.target.value))}
                onBlur={() => triggerVerifyIfComplete(guest1.phone)}
                placeholder="(22) 99999-9999"
                className={cn(
                  "text-base sm:text-xs h-11 sm:h-9 bg-background pr-7",
                  phoneVer?.checked && phoneVer.exists === false
                    ? "border-amber-500 bg-amber-500/5 focus-visible:ring-amber-500"
                    : phoneVer?.checked && phoneVer.exists === true
                      ? "border-emerald-500/80 bg-emerald-500/5"
                      : ""
                )}
              />
              {phoneVer?.checking && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                </span>
              )}
            </div>
            {phoneVer?.checked && phoneVer.exists === false && (
              <div className="text-[10.5px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1 leading-tight">
                <span>⚠️</span>
                <span>Número sem WhatsApp ativo (verifique digitação).</span>
              </div>
            )}
            {phoneVer?.checked && phoneVer.exists === true && (
              <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1 leading-tight">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>WhatsApp verificado e ativo.</span>
              </div>
            )}
          </div>
        </div>

        {/* Chip discreto de vínculos herdados do CRM (Empresa, Mensalista, NFS-e automática, Resp. Financeiro) */}
        {inheritedCrmContext?.isCrmLinked && inheritedCrmContext.hasInheritedLinks && (
          <div className="p-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between gap-2 flex-wrap text-[11px] text-indigo-900 dark:text-indigo-200">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
              <span className="font-semibold">Vínculos do CRM:</span>
              {inheritedCrmContext.inheritedLinks.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-800 dark:text-indigo-200 font-bold text-[10px]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onSwitchToAdvanced}
              className="text-[10.5px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline shrink-0 cursor-pointer"
            >
              Revisar no Avançado
            </button>
          </div>
        )}

        {/* Alerta não-bloqueante para e-mail legado malformado vindo do CRM */}
        {inheritedCrmContext?.hasInvalidLegacyEmail && (
          <div className="p-2 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-700/60 flex items-center justify-between gap-2 flex-wrap text-[11px] text-amber-900 dark:text-amber-200">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span>E-mail legado inválido no CRM (não bloqueia o salvamento no Simplificado).</span>
            </span>
            <button
              type="button"
              onClick={onSwitchToAdvanced}
              className="text-[10.5px] font-bold text-amber-800 dark:text-amber-200 hover:underline shrink-0 cursor-pointer"
            >
              Corrigir no Avançado
            </button>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 5. CAFÉ DA MANHÃ (Sem Café padrão / Com Café 1 clique)    */}
      {/* ========================================================= */}
      <fieldset className="p-3.5 rounded-2xl border border-border bg-slate-50/80 dark:bg-slate-900/60 space-y-2.5">
        <legend className="sr-only">5. Café da Manhã</legend>
        <div aria-hidden="true" className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-black">
            5
          </span>
          <span>Café da Manhã</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Sem Café (Padrão) */}
          <label
            htmlFor={breakfastWithoutId}
            className={cn(
              "flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[46px] rounded-xl border-2 cursor-pointer transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
              !includeBreakfast
                ? "border-slate-700 dark:border-slate-300 bg-slate-100 dark:bg-slate-800/80 text-foreground shadow-xs ring-2 ring-slate-500/20"
                : "border-border bg-background hover:border-slate-400 text-foreground"
            )}
          >
            <input
              id={breakfastWithoutId}
              type="radio"
              name="simplified_breakfast"
              value="without"
              checked={!includeBreakfast}
              onChange={() => onChangeBreakfast(false)}
              className="sr-only"
            />
            <span className="font-extrabold text-sm sm:text-xs">Sem Café</span>
            {!includeBreakfast && (
              <span className="w-5 h-5 rounded-full bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />
              </span>
            )}
          </label>

          {/* Com Café */}
          <label
            htmlFor={breakfastWithId}
            className={cn(
              "flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[46px] rounded-xl border-2 cursor-pointer transition-all select-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
              includeBreakfast
                ? "border-amber-600 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 shadow-xs ring-2 ring-amber-500/25"
                : "border-border bg-background hover:border-amber-400/70 text-foreground"
            )}
          >
            <input
              id={breakfastWithId}
              type="radio"
              name="simplified_breakfast"
              value="with"
              checked={includeBreakfast}
              onChange={() => onChangeBreakfast(true)}
              className="sr-only"
            />
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 font-extrabold text-sm sm:text-xs">
                <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                <span>Com Café</span>
              </span>
              {tariffQuote && tariffQuote.breakfastSurchargePerGuest > 0 && (
                <span className="text-[10px] text-muted-foreground block leading-tight">
                  +R$ {formatBrl(tariffQuote.breakfastSurchargePerGuest)}/hósp./noite
                </span>
              )}
            </div>
            {includeBreakfast && (
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />
              </span>
            )}
          </label>
        </div>
      </fieldset>

      {/* ========================================================= */}
      {/* 6. VALORES (Tarifário + Diária <-> Total + Limpeza)       */}
      {/* ========================================================= */}
      <div className="p-3.5 rounded-2xl border border-primary/25 bg-primary/[0.03] dark:bg-primary/[0.06] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-black">
              6
            </span>
            <DollarSign className="w-3.5 h-3.5 text-primary -ml-0.5" />
            <span>Valores</span>
            {loadingTariffQuote ? (
              <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-background">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Tarifário...
              </Badge>
            ) : isManualPrice ? (
              <Badge
                variant="outline"
                className="text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-400/50"
              >
                Editado manualmente
              </Badge>
            ) : isOtaChannel && tariffQuote ? (
              <Badge
                variant="outline"
                className="text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
              >
                ✓ Tarifário{tariffQuote.stayDiscountPct > 0 ? ` (-${Math.round(tariffQuote.stayDiscountPct * 100)}%)` : ""}
              </Badge>
            ) : null}
          </div>

          {isOtaChannel && (
            <Button
              type="button"
              size="sm"
              variant={isManualPrice ? "default" : "outline"}
              disabled={loadingTariffQuote}
              onClick={onRecalculateTariff}
              className="h-7 px-2.5 text-[11px] font-bold gap-1 cursor-pointer"
              title="Recalcular diária, taxa de limpeza e total pelo Tarifário atual"
            >
              <RefreshCw className={cn("w-3 h-3", loadingTariffQuote && "animate-spin")} />
              <span>Recalcular pelo Tarifário</span>
            </Button>
          )}
        </div>

        {!isOtaChannel && (
          <div className="text-[11px] text-muted-foreground bg-background/80 border border-border/70 rounded-xl px-2.5 py-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              Selecione <strong>Booking.com</strong> ou <strong>Airbnb</strong> no passo 1 para preencher os valores automaticamente pelo Tarifário.
            </span>
          </div>
        )}

        {/* Diária <-> Valor Total sincronizados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
          {/* Diária */}
          <div className="space-y-1">
            <Label htmlFor={dailyRateId} className="text-xs font-bold text-foreground block">
              Diária{" "}
              <span className="text-[10.5px] font-normal text-muted-foreground">
                ({nights} {nights === 1 ? "noite" : "noites"}{hasMixedRates ? " • média" : ""})
              </span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                R$
              </span>
              <Input
                id={dailyRateId}
                name="simplified_daily_rate"
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                placeholder="0,00"
                value={formatCentsMask(avgDailyRate)}
                aria-invalid="false"
                onFocus={keepCursorAtEnd}
                onClick={keepCursorAtEnd}
                onChange={(e) => onChangeDailyRate(parseCentsMask(e.target.value))}
                className="text-base sm:text-sm h-11 sm:h-10 pl-9 pr-3 font-extrabold text-right bg-background"
              />
            </div>
            {hasMixedRates && !isManualPrice && (
              <span className="text-[10px] text-muted-foreground block">
                Tarifas variam por dia (ex: fim de semana)
              </span>
            )}
          </div>

          {/* Valor Total */}
          <div className="space-y-1">
            <Label htmlFor={totalAmountId} className="text-xs font-bold text-primary block">
              Valor Total
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary pointer-events-none">
                R$
              </span>
              <Input
                ref={fieldRefs?.totalRef}
                id={totalAmountId}
                name="simplified_total_amount"
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="0,00"
                value={formatCentsMask(displayedTotal)}
                aria-invalid={showTotalBelowError ? "true" : "false"}
                aria-describedby={showTotalBelowError ? totalErrorId : undefined}
                onFocus={keepCursorAtEnd}
                onClick={keepCursorAtEnd}
                onBlur={() => setTotalBlurred(true)}
                onChange={(e) => {
                  setTotalBlurred(false);
                  onChangeTotalAmount(parseCentsMask(e.target.value));
                }}
                className={cn(
                  "text-base sm:text-sm h-11 sm:h-10 pl-9 pr-3 font-black text-right bg-background border-primary/40 text-primary",
                  showTotalBelowError && "border-rose-500 text-rose-700 focus-visible:ring-rose-500"
                )}
              />
            </div>
            {showTotalBelowError && (
              <div
                id={totalErrorId}
                className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>
                  {otherChargesSum > 0
                    ? `Menor que as taxas aplicadas (R$ ${formatBrl(totalCharges)}). Ajuste o total ou remova a taxa.`
                    : `Menor que a Taxa de Limpeza (R$ ${formatBrl(totalCharges)}). Ajuste o total ou remova a taxa.`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Taxa de Limpeza editável / removível quando ativa */}
        {hasCleaningCharge ? (
          <div className="p-2.5 rounded-xl bg-background border border-border flex items-center justify-between gap-2 flex-wrap">
            <Label
              htmlFor={cleaningFeeId}
              className="text-xs font-bold text-foreground flex items-center gap-1.5"
            >
              <span aria-hidden="true">🧹</span>
              <span>Taxa de Limpeza</span>
            </Label>
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="relative w-32">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground pointer-events-none">
                  R$
                </span>
                <Input
                  id={cleaningFeeId}
                  name="simplified_cleaning_fee"
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={formatCentsMask(cleaningFee)}
                  aria-invalid="false"
                  onFocus={keepCursorAtEnd}
                  onClick={keepCursorAtEnd}
                  onChange={(e) => onChangeCleaningFee(parseCentsMask(e.target.value))}
                  className="text-base sm:text-xs h-9 sm:h-8 pl-8 pr-2.5 font-bold text-right bg-background"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRemoveCleaningFee}
                aria-label="Remover taxa de limpeza"
                title="Remover taxa de limpeza"
                className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {includeBreakfast
                ? "Plano Com Café: taxa de limpeza isenta por padrão."
                : "Sem taxa de limpeza aplicada."}
            </span>
            <button
              type="button"
              onClick={onAddCleaningFee}
              className="font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>Adicionar Taxa de Limpeza</span>
            </button>
          </div>
        )}

        {/* Resumo enxuto da composição */}
        <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap text-[11px] text-muted-foreground">
          <span>
            {nights} {nights === 1 ? "diária" : "diárias"} (R$ {formatBrl(nightsSubtotal)})
            {hasCleaningCharge ? ` + Limpeza (R$ ${formatBrl(cleaningFee)})` : ""}
            {otherChargesSum !== 0 ? ` + Extras (R$ ${formatBrl(otherChargesSum)})` : ""}
          </span>
          <span className="font-black text-foreground">
            Total: R$ {formatBrl(displayedTotal)}
          </span>
        </div>
      </div>
    </div>
  );
});
