import { evaluateSimpleFlatAvailability, isFlatBlockedStatus } from "./simplified-reservation-helpers.ts";
import { round2Money } from "./simplified-reservation-pricing.ts";

export type DuplicateChannel = "whatsapp" | "site" | "booking" | "airbnb" | "b2b";

export type DuplicatePaymentMode =
  | "confirmed_paid"
  | "confirmed_pending"
  | "pre_reserva"
  | "faturado";

export type DuplicateHoldPreset = "30m" | "2h" | "until_2359";

export interface DuplicateChargeDraft {
  id: string;
  type: string;
  title: string;
  amount: number;
  notes?: string;
}

export interface DuplicatePeriodSlot {
  uid: string;
  checkinDate: string;
  checkoutDate: string;
  flatId: string;
  flatManuallyChosen: boolean;
}

export interface DuplicateFlatOption {
  id: string;
  number: string;
  isAvailable: boolean;
  isOriginal: boolean;
  conflictLabel?: string;
}

export interface DuplicateSlotAvailability {
  isValidRange: boolean;
  nights: number;
  hasSelectedFlat: boolean;
  selectedFlatNumber: string;
  isAvailable: boolean;
  conflictLabel: string | null;
  conflictSource: "reservation" | "block" | "status" | "slot_overlap" | null;
  suggestedFlat: { id: string; number: string } | null;
  availableCount: number;
  totalFlatsCount: number;
  flatOptions: DuplicateFlatOption[];
}

export interface DuplicateHandoffDraft {
  sourceRes: any;
  duplicatedFromId: number | string | null;
  duplicatedFromCode: string;
  checkinDate: string;
  checkoutDate: string;
  flatId: string;
  dailyRate: number;
  charges: DuplicateChargeDraft[];
  includeBreakfast: boolean;
  channel: DuplicateChannel;
  paymentMode: DuplicatePaymentMode;
  paymentMethod: string;
  holdPreset: DuplicateHoldPreset;
  notes: string;
  receptionNotes: string;
  specialRequests: string;
}

export interface OriginalNotesBundle {
  hasAny: boolean;
  notes: string;
  receptionNotes: string;
  specialRequests: string;
  combinedPreview: string;
}

export function isValidIsoDate(str?: string | null): str is string {
  if (!str || typeof str !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDaysIso(isoDate: string, days: number): string {
  if (!isValidIsoDate(isoDate)) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function diffNightsIso(checkinDate?: string | null, checkoutDate?: string | null): number {
  if (!isValidIsoDate(checkinDate) || !isValidIsoDate(checkoutDate)) return 0;
  const [y1, m1, d1] = checkinDate.split("-").map(Number);
  const [y2, m2, d2] = checkoutDate.split("-").map(Number);
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(ms / 86400000);
}

export function formatIsoShortBr(isoDate?: string | null): string {
  if (!isValidIsoDate(isoDate)) return "—";
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

export function formatIsoFullBr(isoDate?: string | null): string {
  if (!isValidIsoDate(isoDate)) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function getTodayIsoLocal(): string {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function getDefaultDuplicateHoldPreset(
  checkinDate?: string | null,
  todayIso: string = getTodayIsoLocal()
): DuplicateHoldPreset {
  if (isValidIsoDate(checkinDate) && checkinDate <= todayIso) {
    return "2h";
  }
  return "until_2359";
}

export function extractOriginalNights(res: any): number {
  if (!res) return 1;
  const computed = diffNightsIso(res.checkinDate, res.checkoutDate);
  if (computed > 0) return computed;
  const fallback = Number(res.nightsCount || res.nights || (Array.isArray(res.dailyRates) ? res.dailyRates.length : 1));
  return Number.isFinite(fallback) && fallback >= 1 ? Math.round(fallback) : 1;
}

export function extractOriginalChannel(res: any): DuplicateChannel {
  const raw = String(res?.channel || "").trim().toLowerCase();
  if (raw.includes("b2b") || res?.agencyId || res?.agencyName || res?.b2bReservationNumber || res?.requesterType === "agency_b2b" || res?.requesterType === "agency") {
    return "b2b";
  }
  if (raw.includes("booking")) return "booking";
  if (raw.includes("airbnb")) return "airbnb";
  if (raw === "site" || raw === "site_direto" || raw === "site_proprio" || raw === "website" || raw === "motor") {
    return "site";
  }
  return "whatsapp";
}

export function extractOriginalCharges(res: any): DuplicateChargeDraft[] {
  if (!res) return [];
  const loaded: DuplicateChargeDraft[] = Array.isArray(res.charges)
    ? res.charges
        .filter((c: any) => c && (Number(c.amount) || 0) !== 0)
        .map((c: any, idx: number) => ({
          id: `dup_charge_${idx}_${c.type || "other"}`,
          type: String(c.type || "other"),
          title: String(c.title || "Taxa / Adicional"),
          amount: round2Money(Number(c.amount) || 0),
          notes: c.notes ? String(c.notes) : "",
        }))
    : [];

  if (!loaded.some((c) => c.type === "cleaning") && Number(res.cleaningFee) > 0) {
    loaded.push({
      id: "dup_charge_cleaning",
      type: "cleaning",
      title: "Taxa de Limpeza",
      amount: round2Money(Number(res.cleaningFee)),
      notes: "",
    });
  }
  if (!loaded.some((c) => c.type === "pet") && Number(res.petFee) > 0) {
    loaded.push({
      id: "dup_charge_pet",
      type: "pet",
      title: "Taxa Pet",
      amount: round2Money(Number(res.petFee)),
      notes: "",
    });
  }
  if (!loaded.some((c) => c.type === "extra_bed") && Number(res.extraBedFee) > 0) {
    loaded.push({
      id: "dup_charge_extrabed",
      type: "extra_bed",
      title: "Cama Extra",
      amount: round2Money(Number(res.extraBedFee)),
      notes: "",
    });
  }
  if (
    !loaded.some((c) => c.title.toLowerCase().includes("twin") || c.title.toLowerCase().includes("solteiro")) &&
    Number(res.twinFee) > 0
  ) {
    loaded.push({
      id: "dup_charge_twin",
      type: "other",
      title: "Taxa Camas Solteiro (Twin)",
      amount: round2Money(Number(res.twinFee)),
      notes: "",
    });
  }

  return loaded;
}

export function extractOriginalDailyRate(res: any, chargesInput?: DuplicateChargeDraft[]): number {
  if (!res) return 0;
  const charges = chargesInput ?? extractOriginalCharges(res);
  const chargesSum = charges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const nights = extractOriginalNights(res);

  const validDailyRates = Array.isArray(res.dailyRates)
    ? res.dailyRates
        .map((d: any) => Number(d?.rate ?? d?.amount))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  if (validDailyRates.length > 0) {
    const avg = validDailyRates.reduce((a: number, b: number) => a + b, 0) / validDailyRates.length;
    return round2Money(avg);
  }

  const directRate = Number(res.dailyRate || 0);
  if (Number.isFinite(directRate) && directRate > 0) {
    return round2Money(directRate);
  }

  const rawTotal = Number(res.totalAmount || res.totalPrice || 0);
  if (rawTotal > 0 && nights > 0) {
    const netNightsTotal = Math.max(0, rawTotal - chargesSum);
    if (netNightsTotal > 0) {
      return round2Money(netNightsTotal / nights);
    }
    return round2Money(rawTotal / nights);
  }

  return 0;
}

export function resolveInitialDuplicatePaymentMode(res: any): DuplicatePaymentMode {
  if (!res) return "confirmed_pending";
  const channel = extractOriginalChannel(res);
  const isOta = channel === "booking" || channel === "airbnb";
  const rawPmLower = String(res.paymentMethod || "").trim().toLowerCase();
  const isFaturado = Boolean(
    res.isFaturadoBoleto ||
      rawPmLower === "boleto" ||
      rawPmLower === "boleto_faturado" ||
      rawPmLower === "faturado_boleto" ||
      rawPmLower === "faturado_pj" ||
      rawPmLower === "faturado_b2b" ||
      String(res.b2bPaymentType || "").toUpperCase() === "FATURADO"
  );
  if (isFaturado) return "faturado";

  const statusLower = String(res.status || "").trim().toLowerCase();
  const isPropertyCollect = Boolean(res.paymentCollect === "Property" || res.collectAtCheckin === true);
  const isGatewayPaid = Boolean(res.pixEndToEndId || res.mpPaymentId || res.paidAt);
  const total = Number(res.totalAmount || res.totalPrice || 0);
  const paid = Number(res.paidAmount || 0);
  const payStatusLower = String(res.paymentStatus || "").trim().toLowerCase();

  const isPaid =
    (isOta && !isPropertyCollect && payStatusLower !== "pendente") ||
    payStatusLower === "pago_total" ||
    payStatusLower === "pago" ||
    isGatewayPaid ||
    (total > 0 && paid >= total - 0.01);

  if ((statusLower === "pre_reserva" || statusLower === "expirada") && !isPaid && !isOta && channel !== "b2b") {
    return "pre_reserva";
  }

  if (isPaid) return "confirmed_paid";
  return "confirmed_pending";
}

export function extractOriginalPaymentMethod(
  res: any,
  channel: DuplicateChannel,
  paymentMode: DuplicatePaymentMode
): string {
  if (paymentMode === "faturado") {
    return channel === "b2b" ? "faturado_b2b" : "boleto_faturado";
  }
  if (channel === "booking") return "booking";
  if (channel === "airbnb") return "airbnb";
  if (channel === "b2b") return "vcn_b2b";

  const rawPmLower = String(res?.paymentMethod || "").trim().toLowerCase();
  if (
    rawPmLower &&
    ![
      "booking",
      "airbnb",
      "vcn_b2b",
      "faturado_b2b",
      "boleto",
      "boleto_faturado",
      "faturado_boleto",
      "faturado_pj",
    ].includes(rawPmLower)
  ) {
    return rawPmLower;
  }

  if (res?.mpPaymentId && !res?.pixEndToEndId) return "cartao_credito";
  return "pix";
}

export function extractOriginalNotesBundle(res: any): OriginalNotesBundle {
  const notes = String(res?.notes || "").trim();
  const receptionNotes = String(res?.receptionNotes || "").trim();
  const specialRequests = String(res?.specialRequests || "").trim();
  const parts: string[] = [];
  if (notes) parts.push(`Internas: ${notes}`);
  if (receptionNotes) parts.push(`Portaria: ${receptionNotes}`);
  if (specialRequests) parts.push(`Pedidos: ${specialRequests}`);
  return {
    hasAny: parts.length > 0,
    notes,
    receptionNotes,
    specialRequests,
    combinedPreview: parts.join(" • "),
  };
}

export function getFlatBusyNightsSet({
  flatId,
  flats,
  reservations,
  blocks,
  otherSlots = [],
  nowMs = Date.now(),
}: {
  flatId: string;
  flats: any[];
  reservations: any[];
  blocks: any[];
  otherSlots?: DuplicatePeriodSlot[];
  nowMs?: number;
}): Set<string> {
  const busy = new Set<string>();
  if (!flatId) return busy;

  const flatObj = (flats || []).find((f: any) => String(f?.id) === String(flatId));
  const flatNum = flatObj ? String(flatObj.number) : "";

  const markRange = (startIso: string, endExclusiveIso: string) => {
    if (!isValidIsoDate(startIso) || !isValidIsoDate(endExclusiveIso) || endExclusiveIso <= startIso) return;
    const nights = Math.min(366, diffNightsIso(startIso, endExclusiveIso));
    for (let i = 0; i < nights; i++) {
      busy.add(addDaysIso(startIso, i));
    }
  };

  for (const r of reservations || []) {
    if (!r) continue;
    const matchesFlat =
      Number(r.flatId) === Number(flatId) || (flatNum && String(r.flatNumber) === flatNum);
    if (!matchesFlat) continue;
    const st = String(r.status || "").toLowerCase();
    if (["cancelada", "cancelled", "cancelado", "no_show", "expirada"].includes(st)) continue;
    if (
      (st === "pre_reserva" || st === "pendente") &&
      r.expiresAt &&
      new Date(r.expiresAt).getTime() < nowMs &&
      r.paymentStatus !== "pago_total" &&
      r.paymentStatus !== "pago"
    ) {
      continue;
    }
    const effectiveOut = r.earlyCheckoutDate || r.checkoutDate;
    if (!isValidIsoDate(r.checkinDate) || !isValidIsoDate(effectiveOut)) continue;
    markRange(r.checkinDate, effectiveOut);
  }

  for (const b of blocks || []) {
    if (!b) continue;
    const matchesFlat =
      Number(b.flatId) === Number(flatId) || (flatNum && String(b.flatNumber) === flatNum);
    if (!matchesFlat) continue;
    if (!isValidIsoDate(b.startDate) || !isValidIsoDate(b.endDate)) continue;
    markRange(b.startDate, addDaysIso(b.endDate, 1));
  }

  for (const s of otherSlots) {
    if (!s || String(s.flatId) !== String(flatId)) continue;
    if (!isValidIsoDate(s.checkinDate) || !isValidIsoDate(s.checkoutDate)) continue;
    markRange(s.checkinDate, s.checkoutDate);
  }

  return busy;
}

export function evaluateDuplicateSlotAvailability({
  slot,
  otherSlots,
  originalFlatId,
  flats,
  reservations,
  blocks,
  fairShareResult = null,
  nowMs = Date.now(),
}: {
  slot: DuplicatePeriodSlot;
  otherSlots: DuplicatePeriodSlot[];
  originalFlatId: string;
  flats: any[];
  reservations: any[];
  blocks: any[];
  fairShareResult?: any | null;
  nowMs?: number;
}): DuplicateSlotAvailability {
  const isValidRange =
    isValidIsoDate(slot.checkinDate) &&
    isValidIsoDate(slot.checkoutDate) &&
    slot.checkoutDate > slot.checkinDate;
  const nights = isValidRange ? diffNightsIso(slot.checkinDate, slot.checkoutDate) : 0;

  const base = evaluateSimpleFlatAvailability({
    flatsList: flats || [],
    reservationsList: reservations || [],
    blocksList: blocks || [],
    fairShareResult,
    checkinDate: isValidRange ? slot.checkinDate : "",
    checkoutDate: isValidRange ? slot.checkoutDate : "",
    flatId: slot.flatId || "",
    excludeResId: null,
    nowMs,
  });

  const findSlotOverlap = (targetFlatId: string): { slotIndex: number; overlapSlot: DuplicatePeriodSlot } | null => {
    if (!isValidRange || !targetFlatId) return null;
    for (let i = 0; i < otherSlots.length; i++) {
      const other = otherSlots[i];
      if (!other || other.uid === slot.uid) continue;
      if (String(other.flatId) !== String(targetFlatId)) continue;
      if (!isValidIsoDate(other.checkinDate) || !isValidIsoDate(other.checkoutDate)) continue;
      if (other.checkinDate < slot.checkoutDate && other.checkoutDate > slot.checkinDate) {
        return { slotIndex: i + 1, overlapSlot: other };
      }
    }
    return null;
  };

  const activeFlats = base.effectiveFlatsList || [];
  const flatOptions: DuplicateFlatOption[] = activeFlats.map((f: any) => {
    const fId = String(f.id);
    const fNum = String(f.number || f.id);
    const localInfo = base.localByFlatId[fId];
    const fsStat =
      base.matchingFairShare?.allStats?.find(
        (s: any) => Number(s?.flat?.id) === Number(f.id) || String(s?.flat?.number) === fNum
      ) || null;
    const overlap = findSlotOverlap(fId);

    let isAvail = true;
    let conflictLabel: string | undefined;

    if (isValidRange) {
      if (overlap) {
        isAvail = false;
        conflictLabel = `Conflito com outro período desta duplicação (${formatIsoShortBr(overlap.overlapSlot.checkinDate)}–${formatIsoShortBr(overlap.overlapSlot.checkoutDate)})`;
      } else if (isFlatBlockedStatus(f)) {
        isAvail = false;
        conflictLabel = "Flat em manutenção/bloqueado";
      } else if (localInfo?.resConflict) {
        isAvail = false;
        const r = localInfo.resConflict;
        conflictLabel = `Ocupado por ${r.guestName || "outro hóspede"} (${formatIsoShortBr(r.checkinDate)}–${formatIsoShortBr(r.earlyCheckoutDate || r.checkoutDate)})`;
      } else if (localInfo?.blockConflict) {
        isAvail = false;
        conflictLabel = `Bloqueado (${localInfo.blockConflict.reason || "Manutenção"})`;
      } else if (fsStat && !fsStat.isAvailable) {
        isAvail = false;
        conflictLabel = "Indisponível no período";
      }
    }

    return {
      id: fId,
      number: fNum,
      isAvailable: isAvail,
      isOriginal: String(originalFlatId) === fId,
      conflictLabel,
    };
  });

  const selectedOpt = flatOptions.find((o) => o.id === String(slot.flatId)) || null;
  const selectedLocal = slot.flatId ? base.localByFlatId[String(slot.flatId)] : null;
  const selectedOverlap = slot.flatId ? findSlotOverlap(String(slot.flatId)) : null;

  let conflictSource: DuplicateSlotAvailability["conflictSource"] = null;
  let conflictLabel: string | null = null;
  let isAvailable = Boolean(selectedOpt ? selectedOpt.isAvailable : !isValidRange);

  if (isValidRange && slot.flatId) {
    if (selectedOverlap) {
      isAvailable = false;
      conflictSource = "slot_overlap";
      conflictLabel = `Este flat já está selecionado em outro período desta duplicação (${formatIsoShortBr(selectedOverlap.overlapSlot.checkinDate)} a ${formatIsoShortBr(selectedOverlap.overlapSlot.checkoutDate)}).`;
    } else if (selectedLocal?.isBlockedStatus) {
      isAvailable = false;
      conflictSource = "status";
      conflictLabel = `Flat ${selectedOpt?.number || slot.flatId} está bloqueado/em manutenção.`;
    } else if (selectedLocal?.resConflict) {
      isAvailable = false;
      conflictSource = "reservation";
      const r = selectedLocal.resConflict;
      conflictLabel = `Flat ${selectedOpt?.number || slot.flatId} ocupado nessas datas por ${r.guestName || "outro hóspede"} (${formatIsoShortBr(r.checkinDate)} a ${formatIsoShortBr(r.earlyCheckoutDate || r.checkoutDate)}).`;
    } else if (selectedLocal?.blockConflict) {
      isAvailable = false;
      conflictSource = "block";
      conflictLabel = `Flat ${selectedOpt?.number || slot.flatId} bloqueado nessas datas (${selectedLocal.blockConflict.reason || "Bloqueio no calendário"}).`;
    } else if (selectedOpt && !selectedOpt.isAvailable) {
      isAvailable = false;
      conflictSource = "reservation";
      conflictLabel = selectedOpt.conflictLabel || `Flat ${selectedOpt.number} indisponível nessas datas.`;
    }
  }

  let suggestedFlat: { id: string; number: string } | null = null;
  if (isValidRange && !isAvailable) {
    // 1. Prefer Fair Share recommended bestFlatId if free across reservations, blocks AND otherSlots
    const bestFsId = base.matchingFairShare?.bestFlatId ? String(base.matchingFairShare.bestFlatId) : "";
    if (bestFsId && bestFsId !== String(slot.flatId)) {
      const opt = flatOptions.find((o) => o.id === bestFsId && o.isAvailable);
      if (opt) suggestedFlat = { id: opt.id, number: opt.number };
    }
    // 2. Fallback to nextCleanFlat from Fair Share
    if (!suggestedFlat && base.nextCleanFlat?.id && base.nextCleanFlat.id !== String(slot.flatId)) {
      const opt = flatOptions.find((o) => o.id === base.nextCleanFlat!.id && o.isAvailable);
      if (opt) suggestedFlat = { id: opt.id, number: opt.number };
    }
    // 3. Fallback to first available flat in fairShare stats order, then local flats order
    if (!suggestedFlat && Array.isArray(base.matchingFairShare?.allStats)) {
      for (const s of base.matchingFairShare.allStats) {
        const sid = s?.flat?.id != null ? String(s.flat.id) : "";
        if (!sid || sid === String(slot.flatId)) continue;
        const opt = flatOptions.find((o) => o.id === sid && o.isAvailable);
        if (opt) {
          suggestedFlat = { id: opt.id, number: opt.number };
          break;
        }
      }
    }
    if (!suggestedFlat) {
      const anyFree = flatOptions.find((o) => o.id !== String(slot.flatId) && o.isAvailable);
      if (anyFree) suggestedFlat = { id: anyFree.id, number: anyFree.number };
    }
  }

  const availableCount = flatOptions.filter((o) => o.isAvailable).length;

  return {
    isValidRange,
    nights,
    hasSelectedFlat: Boolean(slot.flatId),
    selectedFlatNumber: selectedOpt?.number || base.resolvedSelectedFlatNumber || "",
    isAvailable,
    conflictLabel,
    conflictSource,
    suggestedFlat,
    availableCount,
    totalFlatsCount: flatOptions.length,
    flatOptions,
  };
}

export function buildCleanCopiedGuests(sourceRes: any): any[] {
  if (Array.isArray(sourceRes?.guests) && sourceRes.guests.length > 0) {
    return sourceRes.guests.map((g: any, idx: number) => ({
      guestId: g?.guestId ?? (idx === 0 ? sourceRes?.guestId ?? null : null),
      name: String(g?.name || (idx === 0 ? sourceRes?.guestName || "" : "")).trim(),
      cpf: String(g?.cpf || (idx === 0 ? sourceRes?.guestDocument || sourceRes?.guestCpf || "" : "")).trim(),
      phone: String(g?.phone || (idx === 0 ? sourceRes?.guestPhone || "" : "")).trim(),
      email: String(g?.email || (idx === 0 ? sourceRes?.guestEmail || "" : "")).trim(),
      birthDate: g?.birthDate || undefined,
      isMinor: Boolean(g?.isMinor),
      minorAge: g?.minorAge ?? undefined,
      originCity: g?.originCity || g?.city || undefined,
      address: g?.address || undefined,
      isCamposResident: g?.isCamposResident !== undefined ? Boolean(g.isCamposResident) : undefined,
    }));
  }

  return [
    {
      guestId: sourceRes?.guestId ?? null,
      name: String(sourceRes?.guestName || "").trim(),
      cpf: String(sourceRes?.guestDocument || sourceRes?.guestCpf || "").trim(),
      phone: String(sourceRes?.guestPhone || "").trim(),
      email: String(sourceRes?.guestEmail || "").trim(),
    },
  ];
}

export function computeDuplicateSlotTotal(
  checkinDate: string,
  checkoutDate: string,
  dailyRate: number,
  charges: DuplicateChargeDraft[]
): { nights: number; nightsTotal: number; chargesTotal: number; total: number } {
  const nights = Math.max(0, diffNightsIso(checkinDate, checkoutDate));
  const safeRate = Math.max(0, Number(dailyRate) || 0);
  const nightsTotal = round2Money(safeRate * nights);
  const chargesTotal = round2Money(
    (charges || []).reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  );
  return {
    nights,
    nightsTotal,
    chargesTotal,
    total: Math.max(0, round2Money(nightsTotal + chargesTotal)),
  };
}

export function buildDuplicateReservationPayload({
  sourceRes,
  slot,
  dailyRate,
  charges,
  includeBreakfast,
  channel,
  paymentMode,
  paymentMethod,
  holdPreset,
  notes,
  receptionNotes,
  specialRequests,
  nowIso = new Date().toISOString(),
}: {
  sourceRes: any;
  slot: DuplicatePeriodSlot;
  dailyRate: number;
  charges: DuplicateChargeDraft[];
  includeBreakfast: boolean;
  channel: DuplicateChannel;
  paymentMode: DuplicatePaymentMode;
  paymentMethod: string;
  holdPreset: DuplicateHoldPreset;
  notes: string;
  receptionNotes: string;
  specialRequests: string;
  nowIso?: string;
}): Record<string, any> {
  const origCode = String(sourceRes?.code || sourceRes?.reservationCode || sourceRes?.id || "").trim();
  const isB2b = channel === "b2b";
  const isOta = channel === "booking" || channel === "airbnb";
  const isFaturado = paymentMode === "faturado";

  const { nights, total: totalAmount } = computeDuplicateSlotTotal(
    slot.checkinDate,
    slot.checkoutDate,
    dailyRate,
    charges
  );
  const safeRate = round2Money(Math.max(0, Number(dailyRate) || 0));

  const dailyRates = Array.from({ length: Math.max(1, nights) }, (_, i) => ({
    date: addDaysIso(slot.checkinDate, i),
    rate: safeRate,
    channel,
  }));

  const normalizedCharges = (charges || [])
    .filter((c) => c && (Number(c.amount) || 0) !== 0)
    .map((c, idx) => ({
      id: `charge_${Date.now()}_${idx}`,
      type: c.type || "other",
      title: c.title || "Taxa / Adicional",
      amount: round2Money(Number(c.amount) || 0),
      notes: c.notes || "",
    }));

  const cleaningFee = round2Money(
    normalizedCharges
      .filter((c) => c.type === "cleaning")
      .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
  );

  const resolvedMethod = isFaturado
    ? isB2b
      ? "faturado_b2b"
      : "boleto_faturado"
    : paymentMethod || (isOta ? channel : isB2b ? "vcn_b2b" : "pix");

  let status: "confirmada" | "pre_reserva" = "confirmada";
  let paymentStatus: "pago_total" | "pendente" = "pendente";
  let paidAmount = 0;
  let payments: any[] = [];
  let paymentCollect: string | undefined = undefined;
  let collectAtCheckin = false;

  if (paymentMode === "confirmed_paid") {
    status = "confirmada";
    paymentStatus = "pago_total";
    paidAmount = totalAmount;
    if (totalAmount > 0) {
      const otaLabel =
        channel === "booking" ? "Booking.com" : channel === "airbnb" ? "Airbnb" : null;
      payments = [
        {
          id: `pay_dup_${Date.now()}`,
          amount: totalAmount,
          method: resolvedMethod,
          date: nowIso,
          notes: otaLabel
            ? `Pagamento integral ${otaLabel} (duplicada de #${origCode})`
            : `Pagamento integral (duplicada de #${origCode})`,
        },
      ];
    }
  } else if (paymentMode === "pre_reserva" && !isOta && !isB2b) {
    status = "pre_reserva";
    paymentStatus = "pendente";
    paidAmount = 0;
    payments = [];
  } else if (paymentMode === "faturado") {
    status = "confirmada";
    paymentStatus = "pendente";
    paidAmount = 0;
    payments = [];
  } else {
    // confirmed_pending
    status = "confirmada";
    paymentStatus = "pendente";
    paidAmount = 0;
    payments = [];
    if (isOta) {
      paymentCollect = "Property";
      collectAtCheckin = true;
    }
  }

  const copiedGuests = buildCleanCopiedGuests(sourceRes);
  const g1 = copiedGuests[0] || {};
  const guestCount = Math.max(
    1,
    Number(sourceRes?.guestCount || sourceRes?.adults || copiedGuests.length || 1)
  );

  const rawReqType = String(sourceRes?.requesterType || "").trim();
  const requesterType = isB2b
    ? "agency_b2b"
    : rawReqType === "agency_b2b" || rawReqType === "agency"
      ? sourceRes?.companyId || sourceRes?.companyName
        ? "company"
        : "guest"
      : rawReqType || (sourceRes?.companyId || sourceRes?.companyName ? "company" : sourceRes?.requesterInfo?.name ? "other_person" : "guest");

  const copiedRequesterInfo = sourceRes?.requesterInfo
    ? {
        guestId: sourceRes.requesterInfo.guestId ?? undefined,
        name: sourceRes.requesterInfo.name || "",
        phone: sourceRes.requesterInfo.phone || "",
        email: sourceRes.requesterInfo.email || "",
        cpf: sourceRes.requesterInfo.cpf || "",
      }
    : null;

  const isMonthly = Boolean(sourceRes?.isMonthlyGuest || sourceRes?.clientType === "mensalista");
  const cleanVehicle = sourceRes?.vehicle?.plate
    ? {
        plate: String(sourceRes.vehicle.plate).toUpperCase().trim(),
        brand: String(sourceRes.vehicle.brand || "").trim(),
        model: String(sourceRes.vehicle.model || "").trim(),
        color: String(sourceRes.vehicle.color || "").trim(),
      }
    : undefined;

  const payload: Record<string, any> = {
    flatId: Number(slot.flatId),
    checkinDate: slot.checkinDate,
    checkoutDate: slot.checkoutDate,
    checkinTime: String(sourceRes?.checkinTime || "14:00"),
    checkoutTime: String(sourceRes?.checkoutTime || "12:00"),
    guestId: g1.guestId ?? sourceRes?.guestId ?? null,
    guestName: g1.name || sourceRes?.guestName || "",
    guestPhone: g1.phone || sourceRes?.guestPhone || "",
    guestEmail: g1.email || sourceRes?.guestEmail || "",
    guestDocument: g1.cpf || sourceRes?.guestDocument || "",
    guestCount,
    adults: guestCount,
    children: Number(sourceRes?.children || 0),
    guests: copiedGuests,
    docPhotoUrl: sourceRes?.docPhotoUrl || sourceRes?.documentPhotoUrl || null,
    hasMinor: Boolean(sourceRes?.hasMinor),
    minorAge: sourceRes?.minorAge ?? null,
    isCamposResident: sourceRes?.isCamposResident !== undefined ? Boolean(sourceRes.isCamposResident) : undefined,
    riskAttentionAlert: Boolean(sourceRes?.riskAttentionAlert),
    riskAttentionReason: sourceRes?.riskAttentionReason || "",
    requesterType,
    requesterIsGuest1:
      sourceRes?.requesterIsGuest1 !== undefined
        ? Boolean(sourceRes.requesterIsGuest1)
        : requesterType === "guest" && !isB2b,
    requesterInfo: copiedRequesterInfo,
    companyId: sourceRes?.companyId ? Number(sourceRes.companyId) : null,
    companyName: sourceRes?.companyName || "",
    companyCnpj: sourceRes?.companyCnpj || undefined,
    costCenter: sourceRes?.costCenter || "",
    // Agência B2B (somente se canal continuar B2B; NUNCA copia códigos externos / RLOC / VCN / voucher)
    agencyId: isB2b && sourceRes?.agencyId ? Number(sourceRes.agencyId) : null,
    agencyName: isB2b ? sourceRes?.agencyName || "" : "",
    agencyCorporateName: isB2b ? sourceRes?.agencyCorporateName || sourceRes?.agencyName || "" : "",
    agencyTradeName: isB2b ? sourceRes?.agencyTradeName || sourceRes?.agencyName || "" : "",
    agencyCnpj: isB2b ? sourceRes?.agencyCnpj || "" : "",
    agencyPosUnit: isB2b ? sourceRes?.agencyPosUnit || "" : "",
    agencyAgentName: isB2b ? sourceRes?.agencyAgentName || "" : "",
    agencyAgentEmail: isB2b ? sourceRes?.agencyAgentEmail || "" : "",
    agencyAgentPhone: isB2b ? sourceRes?.agencyAgentPhone || "" : "",
    b2bOriginType: isB2b ? sourceRes?.b2bOriginType || "BOOKING_WS" : undefined,
    b2bRatePolicy: isB2b ? sourceRes?.b2bRatePolicy || "NET" : undefined,
    b2bCommissionPct: isB2b ? sourceRes?.b2bCommissionPct ?? null : undefined,
    b2bPaymentType: isB2b ? (isFaturado ? "FATURADO" : sourceRes?.b2bPaymentType || "VIRTUAL_CARD") : undefined,
    b2bConciliationUrl: isB2b ? sourceRes?.b2bConciliationUrl || "" : undefined,
    b2bAuthorizedExpenses: isB2b ? sourceRes?.b2bAuthorizedExpenses || "Apenas Diárias" : undefined,
    // Regras de faturamento / NFS-e / Boleto
    invoiceRecipientType: sourceRes?.invoiceRecipientType || sourceRes?.nfRecipientType || undefined,
    nfDeliveryEmails: Array.isArray(sourceRes?.nfDeliveryEmails) ? sourceRes.nfDeliveryEmails : undefined,
    nfHideFromGuest:
      sourceRes?.nfHideFromGuest !== undefined
        ? Boolean(sourceRes.nfHideFromGuest)
        : sourceRes?.hideFinancialForGuest !== undefined
          ? Boolean(sourceRes.hideFinancialForGuest)
          : undefined,
    hideFinancialForGuest:
      sourceRes?.hideFinancialForGuest !== undefined
        ? Boolean(sourceRes.hideFinancialForGuest)
        : sourceRes?.nfHideFromGuest !== undefined
          ? Boolean(sourceRes.nfHideFromGuest)
          : undefined,
    invoicingInstructions: sourceRes?.invoicingInstructions || "",
    invoiceDetails: sourceRes?.invoiceDetails || null,
    autoEmitInvoice: isFaturado ? true : Boolean(sourceRes?.autoEmitInvoice),
    isMonthlyGuest: isMonthly,
    clientType: isMonthly
      ? "mensalista"
      : isB2b || requesterType === "company" || isFaturado || sourceRes?.clientType === "corporativo"
        ? "corporativo"
        : "avulso",
    isFaturadoBoleto: isFaturado,
    boletoTermDays: Number(sourceRes?.boletoTermDays || 15),
    boletoConsumptionMode: sourceRes?.boletoConsumptionMode || "single_boleto",
    boletoPayerType: sourceRes?.boletoPayerType || undefined,
    consumptionSamePayerAndDue: sourceRes?.consumptionSamePayerAndDue !== false,
    consumptionPayerType: sourceRes?.consumptionPayerType || undefined,
    consumptionTermDays: Number(sourceRes?.consumptionTermDays || sourceRes?.boletoTermDays || 15),
    boletoFinePct: sourceRes?.boletoFinePct !== undefined ? Number(sourceRes.boletoFinePct) : 2,
    boletoInterestPct: sourceRes?.boletoInterestPct !== undefined ? Number(sourceRes.boletoInterestPct) : 1,
    autoEmitBoletoOnCheckout: sourceRes?.autoEmitBoletoOnCheckout !== false,
    autoReminderEnabled: sourceRes?.autoReminderEnabled !== false,
    financialResponsible: sourceRes?.financialResponsible || undefined,
    billingRecipients: sourceRes?.billingRecipients || undefined,
    // Financeiro & Status
    channel,
    status,
    paymentMethod: resolvedMethod,
    paymentStatus,
    paidAmount,
    payments,
    ...(paymentCollect ? { paymentCollect } : {}),
    ...(collectAtCheckin ? { collectAtCheckin: true } : {}),
    ...(status === "pre_reserva"
      ? {
          holdPreset: holdPreset || getDefaultDuplicateHoldPreset(slot.checkinDate),
          sendExpirationReminder: true,
        }
      : {}),
    dailyRate: safeRate,
    dailyRates,
    charges: normalizedCharges,
    cleaningFee,
    totalAmount,
    // Preferências operacionais permanentes + veículo
    includeBreakfast: Boolean(includeBreakfast),
    prefersHighFloor: Boolean(sourceRes?.prefersHighFloor),
    twinBeds: Boolean(sourceRes?.twinBeds),
    extraMattress: Boolean(sourceRes?.extraMattress),
    isFlatLocked: Boolean(sourceRes?.isFlatLocked || sourceRes?.flatLocked),
    flatLocked: Boolean(sourceRes?.isFlatLocked || sourceRes?.flatLocked),
    flatLockReason: sourceRes?.flatLockReason || "",
    ...(cleanVehicle ? { vehicle: cleanVehicle } : {}),
    // Observações: NUNCA copia early check-in nem observações pontuais antigas a menos que o usuário tenha optado
    earlyCheckinAuthorized: false,
    notes: String(notes || "").trim(),
    receptionNotes: String(receptionNotes || "").trim(),
    specialRequests: String(specialRequests || "").trim(),
    // Auditoria de Duplicação
    duplicatedFromId: sourceRes?.id ?? null,
    duplicatedFromCode: origCode,
    source: origCode ? `PMS Duplicação (de #${origCode})` : "PMS Duplicação",
  };

  return payload;
}
